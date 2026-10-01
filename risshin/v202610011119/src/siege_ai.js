// ======================================================================
// siege_ai.js … 守りと攻めの頭（F4）
// docs/siege-plan.md F4（要件：fort-spec 26・27／siege-spec 37〜39／mountain-spec 28・29）
// 待つ物：butai.js（S1）・siege_zones.js（F3）。ほかの筋は makeDefenseAI・makeAttackAI・chooseRoute
// だけを使う（F4 の持ち場）。ai.js は「持ち場の隊を siege_ai に渡す」枝だけを持つ（g.siegeAI を見て手を引く）。
//
// 守り（makeDefenseAI）――持ち場・圧された所へ予備を回す・兵力30%以下／士気低下／将の死で後退・
//   柵/門が破られたら次の線へ・攻め手が乱れたら出撃・森の伏兵【砦24〜27】：
//   const DA = makeDefenseAI(rt, {
//     posts: [{ id, butai, at, facing, gate, next, ambush, revealRange }],
//       // gate: 名（siege_zones の struct 名）。破られたら次の線（next の post）へ退く
//       // ambush: true なら、敵が revealRange（既定 18）に入るまで隠れて構えるだけ
//     reserves: [butai, …],       // 持ち場を持たない予備。圧された持ち場へ回す
//     fallback: { x, z },         // 退く先（next）が無い時の最後の下がり先
//   });
//   // 毎コマ：DA.tick(dt)
//
// 攻め（chooseRoute・makeAttackAI）――「守りの厚さ×道の長さ×口の狭さ」に揺らぎを掛けて選ぶ・陽動【砦27／城39】：
//   const route = chooseRoute(routes, Math.random);   // routes: [{ id, defThickness, pathLen, chokeWidth }]
//   const AA = makeAttackAI(rt, {
//     attackers: [butai, …],
//     routes: [{ id, entry: { x, z }, defThickness, pathLen, chokeWidth }],
//     feintChance: 0.5, feintShare: 0.2,
//   });
//   // 毎コマ：AA.tick(dt)
// ======================================================================

const PRESS_R = 42;          // 持ち場の圧を数える半径
const RESERVE_TICK = 2;      // 予備を配る判断の間隔（秒）
const DEFENSE_TICK = 1;      // 退却・伏兵・出撃を見る間隔（秒）

function log(rt, text) {
  rt.__siegeLog = rt.__siegeLog || [];
  rt.__siegeLog.push(`${Math.round(rt.t || 0)}s ${text}`);
  if (rt.__siegeLog.length > 300) rt.__siegeLog.shift();
}

function tagReal(b) { if (b && b.real) b.real.siegeAI = true; }

function strengthOf(b) {
  if (!b) return 0;
  const alive = b.aliveNominal ? b.aliveNominal() : 0;
  if (alive <= 0) return 0;
  return alive * Math.max(0.15, (b.morale / 100) * (1 - b.fatigue * 0.3));
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function findGateStruct(rt, key) {
  if (!key) return null;
  if (typeof key !== 'string') return key;
  return (rt.army.structs || []).find((s) => s.name === key) || null;
}

// ---------------------------------------------------------------- 守り
export function makeDefenseAI(rt, o = {}) {
  const posts = (o.posts || []).map((p) => ({
    id: p.id, butai: p.butai, at: p.at, facing: p.facing ?? 0,
    gate: p.gate || null, next: p.next || null,
    ambush: !!p.ambush, revealRange: p.revealRange ?? 18,
    revealed: !p.ambush, fallen: false, gateBroke: false,
  }));
  const byId = {}; for (const p of posts) byId[p.id] = p;
  const reserves = (o.reserves || []).slice();
  const fallback = o.fallback || null;
  let resT = 0, defT = 0;

  for (const p of posts) { tagReal(p.butai); p.butai.order({ id: 'hold', form: p.ambush ? 'line' : 'line' }); }
  for (const b of reserves) { tagReal(b); b.order({ id: 'hold' }); }

  function enemyTeamOf(b) { return b.team === 0 ? 1 : 0; }

  function pressureAt(p) {
    const team = p.butai.team;
    const foe = enemyTeamOf(p.butai);
    let enemy = 0;
    for (const b of rt.butai || []) {
      if (b.team !== foe || b.aliveNominal() <= 0) continue;
      if (dist(b.pos, p.at) < PRESS_R) enemy += strengthOf(b);
    }
    const mine = strengthOf(p.butai);
    return { enemy, mine, pressure: enemy - mine };
  }

  // 一番圧されている持ち場へ、一番近い予備を回す
  function assignReserves() {
    const pressed = posts
      .filter((p) => !p.fallen)
      .map((p) => ({ p, ...pressureAt(p) }))
      .filter((x) => x.pressure > 4)
      .sort((a, b) => b.pressure - a.pressure);
    for (const x of pressed) {
      const avail = reserves.filter((b) => !b._assigned && b.aliveNominal() > 0);
      if (!avail.length) break;
      avail.sort((a, b) => dist(a.pos, x.p.at) - dist(b.pos, x.p.at));
      const r = avail[0];
      r._assigned = x.p.id;
      r.order({ id: 'move', to: x.p.at, form: 'line' });
      log(rt, `予備「${r.name || r.id}」を${x.p.butai.name || x.p.id}の持ち場（圧 ${Math.round(x.pressure)}）へ回す`);
    }
  }

  // 圧が引いたら予備は控えへ戻る
  function releaseReserves() {
    for (const b of reserves) {
      if (!b._assigned) continue;
      const p = byId[b._assigned];
      if (!p || p.fallen || pressureAt(p).pressure <= 0) {
        b._assigned = null;
        b.order({ id: 'hold' });
      }
    }
  }

  function retreatPost(p, reason) {
    if (p.fallen) return;
    p.fallen = true;
    const dest = (p.next && byId[p.next] && byId[p.next].at) || fallback;
    log(rt, `${p.butai.name || p.id}が${reason}で退く`);
    if (dest) p.butai.order({ id: 'retreat', to: dest });
    else p.butai.order({ id: 'retreat' });
  }

  function tickPost(p) {
    if (p.fallen) return;
    tagReal(p.butai);
    const b = p.butai;

    // 森の伏兵：敵が近づくまで構えたまま動かない【砦24】
    if (p.ambush && !p.revealed) {
      let near = false;
      for (const eb of rt.butai || []) {
        if (eb.team === b.team || eb.aliveNominal() <= 0) continue;
        if (dist(eb.pos, p.at) < p.revealRange) { near = true; break; }
      }
      if (near) {
        p.revealed = true;
        log(rt, `${b.name || p.id}の伏兵が出る`);
        b.order({ id: 'attack' });
      }
      return;
    }

    // 門・柵が破られたら中へ【砦25・城37】
    if (p.gate && !p.gateBroke) {
      const st = findGateStruct(rt, p.gate);
      if (st && !st.alive) { p.gateBroke = true; retreatPost(p, `${st.name || p.gate}が破られた`); return; }
    }

    // 兵力30%以下・士気低下・将の死で次の線へ【砦26・城38】
    const ratio = b.nominal > 0 ? b.aliveNominal() / b.nominal : 0;
    const generalDown = b.general && !(rt.army.units.find((u) => u.alive && u.name === b.general));
    if (ratio <= 0.3 || b.morale < 22 || generalDown) {
      retreatPost(p, generalDown ? '将が討たれた' : ratio <= 0.3 ? '兵が減った' : '士気が崩れた');
      return;
    }

    // 攻め手が乱れたら門を開けて出撃【砦25】
    if (p.gate && b.cmd.id !== 'charge') {
      let foe = null, foeStr = 0;
      for (const eb of rt.butai || []) {
        if (eb.team === b.team || eb.aliveNominal() <= 0) continue;
        const d = dist(eb.pos, p.at);
        if (d < PRESS_R * 0.7 && eb.morale < 38) { foe = eb; foeStr = strengthOf(eb); break; }
      }
      if (foe && strengthOf(b) > foeStr * 0.8) {
        log(rt, `${b.name || p.id}が門を開けて出撃`);
        b.order({ id: 'charge', to: foe.pos });
        b._sallyUntil = (rt.t || 0) + 14;
      }
    } else if (b._sallyUntil && (rt.t || 0) > b._sallyUntil) {
      b._sallyUntil = 0;
      b.order({ id: 'hold' });
    }
  }

  return {
    posts, reserves, byId,
    tick(dt) {
      resT -= dt; defT -= dt;
      if (defT <= 0) { defT = DEFENSE_TICK; for (const p of posts) tickPost(p); }
      if (resT <= 0) { resT = RESERVE_TICK; assignReserves(); releaseReserves(); }
    },
    stat() {
      return posts.map((p) => ({ id: p.id, fallen: p.fallen, revealed: p.revealed, ...pressureAt(p) }));
    },
  };
}

// ---------------------------------------------------------------- 攻め
// 「守りの厚さ×道の長さ×口の狭さ」に揺らぎを掛けて最小の物を選ぶ（毎回同じ道を選ばないように）【砦27・城39】
export function chooseRoute(routes, rng = Math.random) {
  if (!routes || !routes.length) return null;
  const scored = routes.map((r) => {
    const base = Math.max(0.1, r.defThickness ?? 1) * Math.max(1, r.pathLen ?? 1) / Math.max(0.3, r.chokeWidth ?? 1);
    const jitter = 0.7 + rng() * 0.6; // 0.7〜1.3
    return { r, score: base * jitter };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0].r;
}

// ---------------------------------------------------------------- 山の伏兵・山の頭（M6）
// docs/siege-plan.md M6（要件：山21・山28・山18・山29・砦24）。既存の makeDefenseAI・makeAttackAI・
// chooseRoute は触らない、作り足しの三つ（makeMountainAmbush・makeMountainDefense・makeMountainAttack）。
//
// 伏兵：森・尾根の裏・谷筋・堂の陰・石段の脇に隠れ、見える範囲に入るか、攻め手が一つの道へ
// 寄ったら（その道の区域に攻め手の力の何割かが集まったら）、横と後ろから出る【山21・砦24】
//   const AMB = makeMountainAmbush(rt, {
//     zones: SZ,   // siege_zones.js の SZ（区域の占有で「一つの道へ寄った」を見る）。無くても revealRange だけで動く
//     posts: [{ id, butai, at, cover: '森'|'尾根の裏'|'谷筋'|'堂の陰'|'石段の脇',
//       revealRange: 16, routeZoneId: 'sando', concentrateShare: 0.55, side: 'flank'|'behind' }],
//   });
//   AMB.tick(dt);
export function makeMountainAmbush(rt, o = {}) {
  const SZ = o.zones || null;
  const posts = (o.posts || []).map((p) => ({
    id: p.id, butai: p.butai, at: p.at, cover: p.cover || '森',
    revealRange: p.revealRange ?? 16,
    routeZoneId: p.routeZoneId || null,
    concentrateShare: p.concentrateShare ?? 0.55,
    side: p.side || 'flank',
    revealed: false,
  }));
  for (const p of posts) { tagReal(p.butai); p.butai.order({ id: 'hold' }); }

  function foeTeamOf(b) { return b.team === 0 ? 1 : 0; }

  function attackerTotal(foe) {
    let s = 0;
    for (const b of rt.butai || []) if (b.team === foe && b.aliveNominal() > 0) s += strengthOf(b);
    return s || 1;
  }
  function shareInZone(zoneId, foe) {
    if (!SZ || !SZ.byId[zoneId]) return 0;
    const z = SZ.byId[zoneId];
    let s = 0;
    for (const b of rt.butai || []) {
      if (b.team !== foe || b.aliveNominal() <= 0) continue;
      if (z.test(b.pos.x, b.pos.z)) s += strengthOf(b);
    }
    return s / attackerTotal(foe);
  }
  // 伏兵の位置から見て敵の横／後ろになる点（敵の向いている側の直角・逆向き）
  function flankPos(p, foe) {
    const dx = foe.pos.x - p.at.x, dz = foe.pos.z - p.at.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    if (p.side === 'behind') return { x: foe.pos.x - (dx / len) * 10, z: foe.pos.z - (dz / len) * 10 };
    return { x: foe.pos.x + nx * 10, z: foe.pos.z + nz * 10 };
  }
  function nearestFoe(p, foe) {
    let best = null, bd = 1e9;
    for (const b of rt.butai || []) {
      if (b.team !== foe || b.aliveNominal() <= 0) continue;
      const d = dist(b.pos, p.at);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  function reveal(p, reason, foe) {
    p.revealed = true;
    log(rt, `${p.butai.name || p.id}の伏兵（${p.cover}）が${reason}で出る`);
    const target = nearestFoe(p, foe);
    if (target) { p.butai.order({ id: 'move', to: flankPos(p, target) }); p.butai._ambushTarget = target; }
    else p.butai.order({ id: 'attack' });
  }

  return {
    posts,
    tick() {
      for (const p of posts) {
        if (p.revealed) {
          if (p.butai._ambushTarget && dist(p.butai.pos, p.butai._ambushTarget.pos) < 14) { p.butai.order({ id: 'attack' }); p.butai._ambushTarget = null; }
          continue;
        }
        const foe = foeTeamOf(p.butai);
        let near = false;
        for (const eb of rt.butai || []) {
          if (eb.team !== foe || eb.aliveNominal() <= 0) continue;
          if (dist(eb.pos, p.at) < p.revealRange) { near = true; break; }
        }
        if (near) { reveal(p, '接近', foe); continue; }
        if (p.routeZoneId && shareInZone(p.routeZoneId, foe) >= p.concentrateShare) { reveal(p, '一つの道への集中', foe); continue; }
      }
    },
    stat() { return posts.map((p) => ({ id: p.id, cover: p.cover, revealed: p.revealed })); },
  };
}

// 守り：細道で待つ・高い所から撃つ（terrain_tags/army_ranged の持ち場・M1）・囮を残して奥へ退く・
// 火が付いたら別の区域へ・別の道から逆襲・封鎖の手に気を付ける【山28・18】
//   const MD = makeMountainDefense(rt, {
//     zones: SZ,                         // siege_zones.js の SZ（escapeBlocked・retreatFate を使う）
//     posts: [{ id, butai, at, next, decoy, fireZoneId }],
//       // decoy: butai。次の区域へ退く時、少数を残して奥へ退く「囮」
//       // fireZoneId: SZ の区域 id。その区域が燃えたら（rt.__fireZones に含まれたら）先に退く
//     counter: { butai, from, watch },   // watch: 監視する post id。攻め手の勢いが落ちたら別の道から逆襲
//   });
//   MD.tick(dt);
export function makeMountainDefense(rt, o = {}) {
  const SZ = o.zones || null;
  const posts = (o.posts || []).map((p) => ({
    id: p.id, butai: p.butai, at: p.at, next: p.next || null,
    decoy: p.decoy || null, fireZoneId: p.fireZoneId || null,
    fallen: false, decoyLeft: false,
  }));
  const byId = {}; for (const p of posts) byId[p.id] = p;
  const counter = o.counter || null;
  let counterFired = false;

  function isBurning(zoneId) {
    if (!zoneId || !rt.__fireZones) return false;
    return !!rt.__fireZones[zoneId];
  }

  function retreatPost(p, reason) {
    if (p.fallen) return;
    p.fallen = true;
    // 囮を残して奥へ退く【山28】
    if (p.decoy && !p.decoyLeft) { p.decoyLeft = true; tagReal(p.decoy); p.decoy.order({ id: 'hold' }); }
    const nextPost = p.next && byId[p.next];
    const dest = nextPost ? nextPost.at : null;
    log(rt, `${p.butai.name || p.id}が${reason}で${dest ? '奥へ' : ''}退く`);
    // 退路が封鎖されていれば SZ に行き先を預ける（捕らえ・降る／集まり直す）【山22・城60】
    if (SZ && SZ.retreatFate) SZ.retreatFate(p.butai);
    else if (dest) p.butai.order({ id: 'retreat', to: dest });
    else p.butai.order({ id: 'retreat' });
  }

  function tickPost(p) {
    if (p.fallen) return;
    // 火が付いたら、崩れる前でも別の区域へ【山19・20】
    if (isBurning(p.fireZoneId)) { retreatPost(p, '火が回った'); return; }
    const b = p.butai;
    const ratio = b.nominal > 0 ? b.aliveNominal() / b.nominal : 0;
    if (ratio <= 0.3 || b.morale < 22) { retreatPost(p, ratio <= 0.3 ? '兵が減った' : '士気が崩れた'); }
  }

  // 監視している持ち場で、攻め手の勢いが落ちたら（士気が下がったら）別の道から逆襲【山28】
  function tickCounter() {
    if (!counter || counterFired) return;
    const watched = counter.watch && byId[counter.watch];
    if (!watched) return;
    const foe = watched.butai.team === 0 ? 1 : 0;
    let foeStr = 0, foeUnit = null;
    for (const eb of rt.butai || []) {
      if (eb.team !== foe || eb.aliveNominal() <= 0) continue;
      const d = dist(eb.pos, watched.at);
      if (d < PRESS_R && eb.morale < 40) { foeStr += strengthOf(eb); foeUnit = foeUnit || eb; }
    }
    if (foeUnit && counter.butai && strengthOf(counter.butai) > foeStr * 0.7) {
      counterFired = true;
      tagReal(counter.butai);
      log(rt, `${counter.butai.name || 'counter'}が${counter.from || ''}から逆襲`);
      counter.butai.order({ id: 'charge', to: foeUnit.pos });
    }
  }

  return {
    posts, byId,
    tick() { for (const p of posts) tickPost(p); tickCounter(); },
    stat() { return posts.map((p) => ({ id: p.id, fallen: p.fallen, decoyLeft: p.decoyLeft })); },
  };
}

// 攻め：主力と回る手を分ける・尾根を先に・谷は物見の後・火を先に・封鎖の手を出す・霧と夜を使う【山29】
//   const MA = makeMountainAttack(rt, {
//     main: [butai, …], flank: [butai, …], block: [butai, …],   // 主力／回る手（尾根・谷）／封鎖の手
//     routes: [{ id, entry, defThickness, pathLen, chokeWidth, kind: 'ridge'|'valley' }],
//     scouted: () => true,          // 物見が済んだか（済むまで谷の道は選ばない）
//     escapeZone: { x, z },         // 封鎖の手が塞ぎに行く退路の場所（siege_zones の escape.zoneId の pos）
//     fog: () => false,             // 霧・夜なら true（守りの厚さを軽く見せる）
//     rng: Math.random,
//   });
//   MA.tick(dt);
export function makeMountainAttack(rt, o = {}) {
  const rng = o.rng || Math.random;
  const scouted = o.scouted || (() => true);
  const fog = o.fog || (() => false);
  let assigned = false, mainRoute = null, flankRoute = null;

  function pickable() {
    const all = o.routes || [];
    // 谷の道は物見が済むまで選ばない【山29】
    const ok = all.filter((r) => r.kind !== 'valley' || scouted());
    return ok.length ? ok : all;
  }

  function doAssign() {
    assigned = true;
    const routes = pickable();
    // 尾根を先に：尾根の道があれば、そちらを主力の候補に絞る【山29】
    const ridge = routes.filter((r) => r.kind === 'ridge');
    const pool = ridge.length ? ridge : routes;
    const scored = pool.map((r) => {
      let base = Math.max(0.1, r.defThickness ?? 1) * Math.max(1, r.pathLen ?? 1) / Math.max(0.3, r.chokeWidth ?? 1);
      if (fog()) base *= 0.75;   // 霧・夜は守りの厚さを軽く見せる
      return { r, score: base * (0.7 + rng() * 0.6) };
    });
    scored.sort((a, b) => a.score - b.score);
    mainRoute = scored.length ? scored[0].r : null;
    flankRoute = routes.find((r) => r !== mainRoute) || null;

    for (const b of o.main || []) { tagReal(b); if (mainRoute) b.order({ id: 'move', to: mainRoute.entry }); }
    for (const b of o.flank || []) { tagReal(b); if (flankRoute) b.order({ id: 'move', to: flankRoute.entry }); }
    // 封鎖の手：退路を先に塞ぎに行く【山22・城60】
    for (const b of o.block || []) { tagReal(b); if (o.escapeZone) b.order({ id: 'move', to: o.escapeZone }); }
    log(rt, `攻め手（山）：主力は${mainRoute ? mainRoute.id : ''}${flankRoute ? `・回る手は${flankRoute.id}` : ''}${(o.block || []).length ? '・封鎖の手あり' : ''}`);
  }

  return {
    get mainRoute() { return mainRoute; },
    get flankRoute() { return flankRoute; },
    tick() { if (!assigned) doAssign(); },
    stat() { return { main: mainRoute && mainRoute.id, flank: flankRoute && flankRoute.id }; },
  };
}

export function makeAttackAI(rt, o = {}) {
  const attackers = (o.attackers || []).slice();
  const routes = o.routes || [];
  const rng = o.rng || Math.random;
  const feintChance = o.feintChance ?? 0.5;
  const feintShare = o.feintShare ?? 0.2;
  let assigned = false;
  let mainRoute = null, feintRoute = null;
  const assign = {};

  function pickFeint(main) {
    const rest = routes.filter((r) => r.id !== main.id);
    if (!rest.length) return null;
    return rest[Math.floor(rng() * rest.length) % rest.length];
  }

  function doAssign() {
    assigned = true;
    mainRoute = chooseRoute(routes, rng);
    if (!mainRoute) return;
    feintRoute = (rng() < feintChance) ? pickFeint(mainRoute) : null;
    const n = attackers.length;
    const feintN = feintRoute ? Math.round(n * feintShare) : 0;
    attackers.forEach((b, i) => {
      tagReal(b);
      const toFeint = i < feintN;
      const r = toFeint ? feintRoute : mainRoute;
      assign[b.id] = r.id;
      b.order({ id: 'move', to: r.entry, form: 'line' });
    });
    log(rt, `攻め手：主力は${mainRoute.id}${feintRoute ? `・陽動は${feintRoute.id}` : ''}`);
  }

  return {
    get mainRoute() { return mainRoute; },
    get feintRoute() { return feintRoute; },
    tick(dt) {
      if (!assigned) doAssign();
    },
    stat() { return { main: mainRoute && mainRoute.id, feint: feintRoute && feintRoute.id, assign: { ...assign } }; },
  };
}
