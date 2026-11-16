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
import { seenBy } from './siege_vis.js';

const PRESS_R = 42;          // 持ち場の圧を数える半径
const RESERVE_TICK = 2;      // 予備を配る判断の間隔（秒）
const DEFENSE_TICK = 1;      // 退却・伏兵・出撃を見る間隔（秒）
const WATCH_TICK = 1;        // 物見の見張りを見る間隔（秒）

import { logEvent } from './senkyo.js';
import { spread, knows } from './denrei.js';

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

// 殿（しんがり）：すぐに一斉に退かず、ここで8秒道を支えてから（その間に門を閉める）次の線へ歩いて退く。
// 1点ずつ（C.route の点の並び→最後に dest）group.onArrive をつないで歩かせる（束26）
function moveStep(b, to, onArrive) {
  const g = b.real;
  if (g) {
    g.order = 'move'; g.dest = { x: to.x, z: to.z }; g.speed = Math.max(g.speed || 3, 3.2);
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: to.x, z: to.z }; if (onArrive) onArrive(); };
  } else if (b.light) {
    b.light.retreat(12);
    if (onArrive) onArrive();
  } else if (onArrive) onArrive();
}
function followRoute(b, pts, final) {
  const seq = (pts || []).map(([x, z]) => ({ x, z }));
  if (final) seq.push(final);
  let i = 0;
  const next = () => { if (i >= seq.length) return; moveStep(b, seq[i++], next); };
  next();
}

// ---------------------------------------------------------------- 守り
// o.nawabari（nawabari.js の K）：持ち場の post.id が曲輪 id と同じ時、その曲輪の fallbackTo・陥落を読む（束26）
export function makeDefenseAI(rt, o = {}) {
  const team = o.team ?? (o.posts && o.posts[0] && o.posts[0].butai && o.posts[0].butai.team) ?? 1;
  const posts = (o.posts || []).map((p) => ({
    id: p.id, butai: p.butai, at: p.at, facing: p.facing ?? 0,
    gate: p.gate || null, next: p.next || null,
    ambush: !!p.ambush, revealRange: p.revealRange ?? 18,
    revealed: !p.ambush, fallen: false, gateBroke: false,
    watch: p.watch || null,   // 束13：物見 [{ at, range }]
    sallyGate: p.sallyGate || null,   // 束13：空堀で乱れた攻め手へ出す側面の門（無ければ p.gate を使う）
  }));
  const byId = {}; for (const p of posts) byId[p.id] = p;
  const reserves = (o.reserves || []).slice();
  const fallback = o.fallback || null;
  const K = o.nawabari || null;
  let resT = 0, defT = 0, watchT = 0;
  let honjinKnows = false;   // 束13：守将（本陣）が知らせを受けたか

  // 束10-2：攻め手が大手に集まった時、sallyGateの門から出撃して攻め手の後ろの鉄砲・破城の手を突く
  // o.sallyGate = { gate, group, at: {x,z}（大手。無ければgateから）, team（攻め手のteam） }
  const sally = o.sallyGate ? {
    gate: o.sallyGate.gate || null, group: o.sallyGate.group, team: o.sallyGate.team ?? null,
    at: o.sallyGate.at || null, used: false,
  } : null;
  if (sally && sally.group) tagReal(sally.group);

  for (const p of posts) { tagReal(p.butai); p.butai.order({ id: 'hold', form: p.ambush ? 'line' : 'line' }); }
  for (const b of reserves) { tagReal(b); b.order({ id: 'hold' }); }

  // ---- 束13：物見。watch の at から range 内に敵の備が入ったら sideSpotted を知らせ、
  // 守将（本陣＝honjin か、一番後ろの post）が知ったら、圧の前に予備をそちらへ先出しする ----
  const honjinPost = o.honjinPost || posts.find((p) => p.honjin) || posts[posts.length - 1] || null;
  function tickWatch() {
    for (const p of posts) {
      if (!p.watch || p.fallen) continue;
      for (const w of p.watch) {
        for (const b of rt.butai || []) {
          if (b.team === p.butai.team || b.aliveNominal() <= 0) continue;
          if (dist(b.pos, w.at) > (w.range ?? 30)) continue;
          const key = `sideSpotted:${p.id}`;
          if (p._spotted) continue;
          p._spotted = true;
          logEvent(rt, 'sideSpotted', { team: p.butai.team, who: p.id, v: b.id || b.name || null });
          if (honjinPost) spread(rt, p.butai.team, key, w.at, { src: p.id });
        }
      }
    }
  }
  function tickKnowsReserve() {
    if (honjinKnows || !honjinPost) return;
    for (const p of posts) {
      if (!p._spotted) continue;
      const key = `sideSpotted:${p.id}`;
      if (knows(rt, p.butai.team, key, honjinPost.id) == null) continue;
      honjinKnows = true;
      const avail = reserves.filter((b) => !b._assigned && b.aliveNominal() > 0);
      if (avail.length) {
        avail.sort((a, b2) => dist(a.pos, p.at) - dist(b2.pos, p.at));
        const r = avail[0];
        r._assigned = p.id;
        r.order({ id: 'move', to: p.at, form: 'line' });
        logEvent(rt, 'reserveMoved', { team: p.butai.team, who: r.id || r.name || null, v: p.id });
      }
      break;
    }
  }

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
    const kw = K && K.kuruwa && K.kuruwa[p.id];
    const nextId = (kw && kw.fallbackTo) || p.next;
    const dest = (nextId && byId[nextId] && byId[nextId].at) || fallback;
    log(rt, `${p.butai.name || p.id}が${reason}で退く`);
    if (typeof rt.logEvent === 'function') rt.logEvent('retreat', { team: p.butai.team, from: p.id, to: nextId || null });
    if (!dest) { p.butai.order({ id: 'retreat' }); return; }   // 退き先が無い（本丸）なら最後まで戦う
    // 殿：すぐに全部は退かず、ここで8秒止めて道を支える（その間に次の門を閉める）。それから道を辿って退く
    p.butai.order({ id: 'hold' });
    const route = (rt.world && rt.world.def && typeof rt.world.def.castleRoute === 'function' && nextId && nextId !== p.id)
      ? rt.world.def.castleRoute(p.id, nextId) : null;
    rt.after(8, () => {
      if (p.butai.aliveNominal && p.butai.aliveNominal() <= 0) return;
      followRoute(p.butai, route, dest);
    });
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

    // 兵力30%以下・士気低下・将の死・持ち場の曲輪が攻め手の物になった、で次の線へ【砦26・城38・束26】
    const ratio = b.nominal > 0 ? b.aliveNominal() / b.nominal : 0;
    const generalDown = b.general && !(rt.army.units.find((u) => u.alive && u.name === b.general));
    const kw = K && K.kuruwa && K.kuruwa[p.id];
    const kuruwaLost = !!(kw && kw.owner != null && kw.owner !== b.team);
    if (ratio <= 0.3 || b.morale < 22 || generalDown || kuruwaLost) {
      retreatPost(p, generalDown ? '将が討たれた' : kuruwaLost ? '曲輪が落ちた' : ratio <= 0.3 ? '兵が減った' : '士気が崩れた');
      return;
    }

    // 攻め手が乱れたら門を開けて出撃【砦25】。束13：側面の sallyGate があればそちらから
    if ((p.gate || p.sallyGate) && b.cmd.id !== 'charge') {
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

  // 馬出（kuruwa.kind==='umadashi'）があればそこを出撃の起点・戻り先にする（束10-2）
  function sallyOrigin() {
    if (!K || !K.kuruwa) return sally.at;
    for (const id in K.kuruwa) if (K.kuruwa[id].kind === 'umadashi') return K.kuruwa[id].spawnPoints[0];
    return sally.at;
  }

  function trySally() {
    if (!sally || sally.used || !sally.group || !sally.at) return;
    const foeTeam = sally.team ?? (posts[0] ? enemyTeamOf(posts[0].butai) : 1);
    let near = 0, total = 0;
    for (const b of rt.butai || []) {
      if (b.team !== foeTeam) continue;
      const n = b.aliveNominal ? b.aliveNominal() : 0;
      total += n;
      if (dist(b.pos, sally.at) < 40) near += n;
    }
    if (total <= 0 || near / total < 0.6) return;
    sally.used = true;
    const origin = sallyOrigin() || sally.at;
    sally.group.order({ id: 'charge', to: sally.at });
    log(rt, `${sally.group.name || '出撃'}が${sally.gate || '門'}から出撃`);
    if (typeof rt.logEvent === 'function') rt.logEvent('sally', { gate: sally.gate });
    rt.after(20, () => {
      if (sally.group.aliveNominal && sally.group.aliveNominal() <= 0) return;
      let blocked = false;
      for (const eb of rt.butai || []) { if (eb.team === foeTeam && dist(eb.pos, origin) < 20) { blocked = true; break; } }
      if (!blocked) sally.group.order({ id: 'move', to: origin, form: 'line' });
      // 戻る道が塞がれたら戻らず戦い続ける（討たれるに任せる）
    });
  }

  return {
    posts, reserves, byId,
    tick(dt) {
      resT -= dt; defT -= dt; watchT -= dt;
      if (watchT <= 0) { watchT = WATCH_TICK; tickWatch(); tickKnowsReserve(); }
      if (defT <= 0) { defT = DEFENSE_TICK; for (const p of posts) tickPost(p); trySally(); }
      if (resT <= 0) { resT = RESERVE_TICK; assignReserves(); releaseReserves(); }
    },
    stat() {
      return posts.map((p) => ({ id: p.id, fallen: p.fallen, revealed: p.revealed, spotted: !!p._spotted, ...pressureAt(p) }));
    },
    get honjinKnows() { return honjinKnows; },
  };
}

// ---------------------------------------------------------------- 攻め
// 「守りの厚さ×道の長さ×口の狭さ」に揺らぎを掛けて最小の物を選ぶ（毎回同じ道を選ばないように）【砦27・城39】
// 束27：routes の各々が danger・width・slope・defense・distance（nawabari.js の五つの数）を持てば、
// 点＝defense×1.0＋danger×0.8＋slope×0.6＋distance/100×0.4−width/6×0.5（小さいほど良い）。
// 重みは o.weights（{defense,danger,slope,distance,width}）で替えられる。持たないルートは今の式のまま
export function chooseRoute(routes, rng = Math.random, o = {}) {
  if (!routes || !routes.length) return null;
  const w = { defense: 1.0, danger: 0.8, slope: 0.6, distance: 0.4, width: 0.5, ...(o.weights || {}) };
  const scored = routes.map((r) => {
    const hasFive = r.danger != null && r.width != null && r.slope != null && r.defense != null && r.distance != null;
    let base;
    if (hasFive) {
      base = Math.max(0, r.defense) * w.defense + Math.max(0, r.danger) * w.danger + Math.max(0, r.slope) * w.slope
        + (r.distance / 100) * w.distance - (r.width / 6) * w.width;
      base = Math.max(0.05, base);
    } else {
      base = Math.max(0.1, r.defThickness ?? 1) * Math.max(1, r.pathLen ?? 1) / Math.max(0.3, r.chokeWidth ?? 1);
    }
    const jitter = 0.7 + rng() * 0.6; // 0.7〜1.3
    return { r, score: base * jitter };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0].r;
}

// 束27-3：守りの数（defense）は見えている分だけを使う（束25の seenBy があればそれ、無ければ全部）。
// route.entry（無ければ pts[0]）の近くにいる、見えている守りの備（b.real が siege_vis.seenBy の集合に入る）だけを数え直す
function visibleRoutes(rt, routes, attackerTeam) {
  let vis = null;
  try { vis = seenBy(rt, attackerTeam); } catch (e) { vis = null; }
  if (!vis) return routes;
  return routes.map((r) => {
    if (r.defense == null) return r;
    const rx = r.entry ? r.entry.x : (r.pts && r.pts[0] && r.pts[0][0]);
    const rz = r.entry ? r.entry.z : (r.pts && r.pts[0] && r.pts[0][1]);
    if (rx == null) return r;
    let d = 0;
    for (const b of rt.butai || []) {
      if (!b.pos || b.team === attackerTeam || !b.real || !vis.has(b.real)) continue;
      if (Math.hypot(b.pos.x - rx, b.pos.z - rz) < 50) d += b.aliveNominal ? b.aliveNominal() : 0;
    }
    return { ...r, defense: d };
  });
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

// 束27-2：o.mainShare（既定0.7）。一番良いルートが大手（role 'ote'）で、その defense が他の道の
// 平均の1.5倍を超える時は、主力を大手、別動を二番目に薄い道へ（今の陽動は o.feintShare のまま残す）
export function makeAttackAI(rt, o = {}) {
  const attackers = (o.attackers || []).slice();
  const routes = o.routes || [];
  const rng = o.rng || Math.random;
  const feintChance = o.feintChance ?? 0.5;
  const feintShare = o.feintShare ?? 0.2;
  const splitCfg = o.split || null;          // 束13：[{ routeId, share }]（同時の二方向）
  const scoutCfg = o.scout || null;          // 束13：{ butai, to, range, maxWait }（先に物見を出す）
  const mainShare = o.mainShare ?? 0.7;
  const weights = o.weights || null;
  const attackerTeam = o.team ?? (attackers[0] && attackers[0].team) ?? 0;
  let assigned = false;
  let mainRoute = null, feintRoute = null, subRoute = null;
  let scoutSent = false, scouted = !scoutCfg, scoutT = 0;
  const assign = {};

  // 束10-1：攻めの頭の段（o.phasesが無ければ今まで通り）。射撃（40秒）→竹束を押して門へ→門が破れたら予備投入
  const phases = o.phases || null;
  const gunBand = (o.gunBand || []).slice();
  const reserveBand = (o.reserves || []).slice();
  const fireSeconds = o.fireSeconds ?? 40;
  let phaseN = 0, phaseT = 0;

  function setPhase(n, label) {
    phaseN = n; phaseT = 0;
    if (typeof rt.logEvent === 'function') rt.logEvent('atkPhase', { n });
  }
  function tickPhases(dt) {
    if (phaseN === 0) { setPhase(1, '大手へ寄る'); return; }
    phaseT += dt;
    const target = mainRoute || null;
    if (phaseN === 1) {
      // 鉄砲・弓の備で塀の守りを撃つ
      for (const b of gunBand) { tagReal(b); if (b.cmd.id !== 'attack') b.order({ id: 'attack' }); }
      if (phaseT > fireSeconds || !gunBand.length) setPhase(2, '門攻め');
    } else if (phaseN === 2) {
      for (const b of attackers) { tagReal(b); if (target && b.cmd.id !== 'assault' && b.cmd.id !== 'charge') b.order({ id: 'move', to: target.entry, form: 'line' }); }
      const gateBroken = o.gate && o.gate.breached;
      if (gateBroken) setPhase(3, '予備投入');
    } else if (phaseN === 3) {
      for (const b of reserveBand) { tagReal(b); if (b.cmd.id === 'hold') b.order({ id: 'move', to: target ? target.entry : null, form: 'line' }); }
    }
  }

  function pickFeint(main) {
    const rest = routes.filter((r) => r.id !== main.id);
    if (!rest.length) return null;
    return rest[Math.floor(rng() * rest.length) % rest.length];
  }

  // 束13：物見の手を先に出し、見えた守りの厚さを chooseRoute の重みに入れる【砦27・城39】
  function tickScout(dt) {
    if (!scoutCfg || scouted) return;
    if (!scoutSent) {
      scoutSent = true;
      tagReal(scoutCfg.butai);
      const to = scoutCfg.to || (routes[0] && routes[0].entry);
      if (to) scoutCfg.butai.order({ id: 'move', to });
      logEvent(rt, 'scout', { team: scoutCfg.butai.team, who: scoutCfg.butai.id || scoutCfg.butai.name || null });
    }
    scoutT += dt;
    const arrived = scoutCfg.to && dist(scoutCfg.butai.pos, scoutCfg.to) < 6;
    if (arrived || scoutT > (scoutCfg.maxWait ?? 20)) {
      scouted = true;
      for (const r of routes) {
        let thick = 0;
        for (const b of rt.butai || []) {
          if (b.team === scoutCfg.butai.team || b.aliveNominal() <= 0) continue;
          if (dist(b.pos, r.entry) < (scoutCfg.range ?? 40)) thick += strengthOf(b);
        }
        if (thick > 0) r.defThickness = thick;
      }
    }
  }

  function avgOtherDefense(main) {
    const rest = routes.filter((r) => r.id !== main.id);
    if (!rest.length) return 0;
    return rest.reduce((s, r) => s + (r.defense || 0), 0) / rest.length;
  }

  function assignTo(mainR, splitR, splitShare, label) {
    const n = attackers.length;
    const splitN = splitR ? Math.round(n * splitShare) : 0;
    attackers.forEach((b, i) => {
      tagReal(b);
      const r = (splitR && i < splitN) ? splitR : mainR;
      assign[b.id] = r.id;
      b.order({ id: 'move', to: r.entry, form: 'line' });
    });
    log(rt, `攻め手：主力は${mainR.id}${splitR ? `・${label}は${splitR.id}` : ''}`);
    if (typeof rt.logEvent === 'function') {
      rt.logEvent('routePick', { main: mainR.id, sub: splitR ? splitR.id : null, scores: routes.map((r) => ({ id: r.id, defense: r.defense, danger: r.danger })) });
    }
  }

  function doAssign() {
    assigned = true;
    // 束13：split（同時の二方向）が指定されていれば、そちらを使う（weights・ote優先の選び直しより先）
    if (splitCfg && splitCfg.length) {
      const n = attackers.length;
      let idx = 0;
      for (const s of splitCfg) {
        const r = routes.find((x) => x.id === s.routeId);
        if (!r) continue;
        const cnt = Math.max(1, Math.round(n * (s.share ?? 0.5)));
        for (let k = 0; k < cnt && idx < attackers.length; k++, idx++) {
          const b = attackers[idx];
          tagReal(b); assign[b.id] = r.id;
          b.order({ id: 'move', to: r.entry, form: 'line' });
        }
        logEvent(rt, 'splitGo', { team: attackers[0] && attackers[0].team, who: r.id });
      }
      mainRoute = routes.find((x) => x.id === splitCfg[0].routeId) || null;
      log(rt, `攻め手：同時に${splitCfg.map((s) => s.routeId).join('・')}`);
      return;
    }
    const scored = visibleRoutes(rt, routes, attackerTeam);
    const picked = chooseRoute(scored, rng, { weights });
    if (!picked) return;
    // 見えている数で選んだ道に対応する、本当の route（entry などを持つ）を使う
    mainRoute = routes.find((r) => r.id === picked.id) || picked;
    const avgOther = avgOtherDefense(mainRoute);
    if (mainRoute.role === 'ote' && avgOther > 0 && (mainRoute.defense || 0) > avgOther * 1.5) {
      subRoute = routes.filter((r) => r.id !== mainRoute.id).sort((a, b) => (a.defense || 0) - (b.defense || 0))[0] || null;
      assignTo(mainRoute, subRoute, 1 - mainShare, '別動');
      return;
    }
    feintRoute = (rng() < feintChance) ? pickFeint(mainRoute) : null;
    assignTo(mainRoute, feintRoute, feintShare, '陽動');
  }

  return {
    get mainRoute() { return mainRoute; },
    get feintRoute() { return feintRoute; },
    get subRoute() { return subRoute; },
    get scouted() { return scouted; },
    tick(dt) {
      tickScout(dt);
      if (!assigned && scouted) doAssign();
      if (phases) tickPhases(dt);
    },
    get phase() { return phaseN; },
    stat() { return { main: mainRoute && mainRoute.id, feint: feintRoute && feintRoute.id, sub: subRoute && subRoute.id, scouted, phase: phaseN, assign: { ...assign } }; },
  };
}
