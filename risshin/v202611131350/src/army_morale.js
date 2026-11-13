import { localClear, localPoint } from './army_local_way.js';
// 身分にかかわらず、前で敵と打ち合う姿を見た近い味方が踏みとどまる。
// 四秒に一度だけ。死傷の上限・敗走・退く下知は取り消さない。
export function moralePlayerFight(army, p, t) {
  const now = army.time;
  if (!p.alive || p.fleeing || p.woundOut || p.downed || p.pinT > now || p.group?.routed ||
      p.playerFightAt > now || t.team === p.team || t.isStruct || t.type === 'dummy' || t.fleeing || t.woundOut ||
      Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z) > 6) return;
  p.playerFightAt = now + 4;
  for (const g of army.groups) {
    if (g.team !== p.team || g.civ || g.routed || g.morale < 22 || g.order === 'retreat' || g.order === 'flee') continue;
    let seen = false;
    for (const u of g.units) {
      if (!u.alive || u.isPlayer || u.fleeing || u.woundOut || u.rearWound || u.noTarget || u.downed || u.pinT > now ||
          Math.abs(u.pos.y - p.pos.y) > 3 || Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > 14 ||
          !localClear(army, p.pos, u.pos)) continue;
      seen = true;
      u.fright = Math.max(0, (u.fright || 0) - 3);
    }
    if (seen && g.morale < 75) g.morale = Math.min(75, g.morale + 2);
  }
}

// 11/7 共通（背を向けるのは退く下知か、組の頭が討たれた時だけ）：組の頭。戦が決めた頭（g.leader）が無い組も、
//   武将・侍・足軽大将の順に頭を一人決めておく（討てる者だけ）。頭のいない組が士気の数だけで崩れて、
//   寄せる前に背を向けて歩き去る事が無いように。頭が討たれれば、その組は自分の城・本陣の方へ崩れる（army_combat の kill）。
export function groupHead(g) {
  if (g.leader) return g.leader;
  const h = g._head;
  if (h && h.group === g) return h;   // 討たれた頭は替えない（頭を失った組のまま）
  const ok = (u) => u.alive && !u.isPlayer && !u.invuln && !u.noTarget && u.type !== 'porter' && u.type !== 'dummy';
  g._head = g.units.find((u) => ok(u) && u.type === 'busho') || g.units.find((u) => ok(u) && u.type === 'samurai') ||
    g.units.find((u) => ok(u) && u.ashiTaisho) || null;
  return g._head;
}
// 頭のいない足軽だけの組と、三人まで討ち減らされた組（壊滅）は今までどおり士気で崩れる
export function headUp(g) {
  const h = groupHead(g);
  return !!(h && h.alive && !h.fleeing && !h.woundOut && g.order !== 'retreat' && g.count > 3);
}

// 11/11 要件 P0-1：性格（標準・臆病・古参・血気）。id から決め、保存しない。
//   臆病は恐れが大きく増え、古参は恐れにくく集め直しが早い。血気は崩れにくいが前へ出がち。
const TEMPER_GAIN = { std: 1, coward: 1.5, vet: 0.6, hot: 0.85 };
const TEMPER_CALM = { std: 1, coward: 0.7, vet: 1.6, hot: 1 };
// 名のある配下は名で性格を固定（名簿は戦をまたぐので性格も続く。kaito 11/11）
const NAMED_TEMPER = { '源太': 'vet', '新六': 'hot', '藤七': 'coward', '甚兵衛': 'vet', '弥助': 'std' };
export function temper(u) {
  if (u.temper) return u.temper;
  if (u.name && NAMED_TEMPER[u.name]) return (u.temper = NAMED_TEMPER[u.name]);
  const r = ((u.id | 0) * 2654435761 >>> 0) % 100;
  u.temper = u.name || u.type === 'busho' || u.type === 'samurai' ? 'vet' : r < 64 ? 'std' : r < 80 ? 'coward' : r < 92 ? 'vet' : 'hot';
  return u.temper;
}
function scare(u, n) { u.fright = Math.min(45, (u.fright || 0) + n * TEMPER_GAIN[temper(u)]); }

// 11/11 要件 P0-2：隊列の整い（0〜100・組ごと g.integrity）。一秒に一度、組の兵の乱れ・頭の死・横と後ろの敵から決める。
//   下がるのは速く、戻るのは遅い（旗か頭が立っていれば早く戻る）。低いと組の士気が少しずつ減る。lethal.js の恐怖もこれを読む。
function groupIntegrity(army, g) {
  const now = army.time;
  if (g._integAt > now) return;
  const dt = g._integAt ? Math.min(2, now - g._integAt + 1) : 1;
  g._integAt = now + 1;
  if (g.integrity === undefined) g.integrity = 100;
  if (g.routed || !g.count) { g.integrity = Math.max(0, g.integrity - 25 * dt); g.st5 = 'ROUT'; return; }
  let n = 0, bad = 0, flank = 0, flag = false;
  for (const u of g.units) {
    if (!u.alive || u.isPlayer || u.gone) continue;
    n++;
    if (u.fleeing || u.confused > 0 || u.backUntil > now || u.stagger > 0.3 || u.downed) bad++;
    flank += u._flankFoes || 0;
    if (!flag && !u.fleeing && (u.stdHeld || u.banner || u === g.leader)) flag = true;
  }
  if (!n) return;
  let want = 100 - 70 * bad / n - Math.min(30, flank * 6 / Math.sqrt(n));
  if (now - (g.commanderLostAt ?? -99) < 20) want -= g.commanderLostMinor ? 15 : 30;
  if (g.morale < 40) want -= (40 - g.morale) * 0.5;
  // 隣の備（四十五m の内の味方の組）が潰走すると並びが揺らぐ。槍衾はこれで整いが五十を切ると崩れる（11/11 槍衾の崩れる条件）
  if (army.groups && !g.noRout) {
    const c = g.center(g._igC || (g._igC = {}));
    for (const o of army.groups) {
      if (o === g || o.team !== g.team || !o.routed || !o.count || o.civ) continue;
      const oc = o.center(o._igC || (o._igC = {}));
      if (Math.hypot(oc.x - c.x, oc.z - c.z) < 45) { want -= 25; break; }
    }
  }
  want = Math.max(0, Math.min(100, want));
  const tr = groupTrait(g);
  const d = want - g.integrity;
  g.integrity += d < 0 ? Math.max(d, -15 * dt * (tr === 'firm' ? 0.65 : tr === 'hot' ? 1.15 : 1)) : Math.min(d, (flag ? 5 : 2.5) * dt * (tr === 'firm' ? 1.3 : 1));
  // 二十を切った組は戦列でなく個々の戦いになり、士気がゆっくり減る（下限 18・敗走の下知は出さない）
  if (g.integrity < 40 && g.morale > 18 && !g.noRout) g.morale = Math.max(18, g.morale - (g.integrity < 20 ? 1 : 0.4) * dt * (tr === 'hot' ? 0.6 : 1));
  else if (g.integrity > 85 && flag && g.morale < 60) g.morale = Math.min(60, g.morale + 0.3 * dt);
  groupStage(g, bad, n);
  autoHedge(army, g, now);
}
// 11/11 備の単位と崩れ（docs/kaito_ikusa_kozo_1111.md 2・6）：備の性格。名のある大将の組だけ、名から決める（保存しない）。
//   hot＝槍多め・突撃（整いは崩れやすいが士気は落ちにくい）・firm＝崩れにくい（整いの落ちが遅く戻りが早い）・gun＝鉄砲と機動。
const TRAITS = [[/柴田|森可成|森長可|前田利家|佐々成政|本多忠勝|山県|馬場|真田|島津|福島正則|加藤清正|可児/, 'hot'],
  [/丹羽|徳川家康|蒲生|石田|藤堂|黒田|井伊|小早川隆景|毛利元就/, 'firm'], [/滝川|雑賀|鈴木|鉄砲/, 'gun']];
export function groupTrait(g) {
  if (g._trait !== undefined) return g._trait;
  const s = (g.name || '') + (g.leader?.name || '') + (g.taisho || '');
  g._trait = '';
  for (const [re, t] of TRAITS) if (re.test(s)) { g._trait = t; break; }
  if (!g._trait && g.isGun) g._trait = 'gun';
  return g._trait;
}
// 備の五つの段：整列（ORDERED）→交戦（ENGAGED）→乱れ（DISORDER）→退き（FALLBACK）→潰走（ROUT）。中の値だけ（字は出さない）。
//   乱れと退きの組は間延びし（g.stretch）、兵が肩越しに後ろを振り返る（army_anim）。旗の傾き・潰走の伝わりは前からある。
function groupStage(g, bad, n) {
  const I = g.integrity, m = g.morale ?? 100;
  let fight = 0;
  for (const u of g.units) if (u.alive && (u.atk || u.swing || u.target)) { fight++; if (fight > 1) break; }
  const st = g.routed ? 'ROUT' : g.order === 'retreat' || I < 25 && m < 35 || bad > n * 0.45 ? 'FALLBACK'
    : I < 55 ? 'DISORDER' : fight ? 'ENGAGED' : 'ORDERED';
  g.st5 = st;
  const want = g.isPlayerSquad || g.marching || g.cav || g.routed ? 1 : st === 'FALLBACK' ? 1.4 : st === 'DISORDER' ? 1.2 : 1;
  if (g.stretch !== want && (want > (g.stretch || 1) || I > 70 || st === 'ORDERED' || g.isPlayerSquad || g.routed)) g.stretch = want;
}
// 11/11 要件 P0-5・23：槍の組頭。待つ槍の隊（g.arm 'spear'）は、正面 28m に敵の騎馬が見えると自分で槍衾を組み、
//   十五秒見えなければ元の並びへ戻す。遊び手の組・戦が並びを決めた組（g.noAutoYari）・整いや士気の低い組はしない。
function autoHedge(army, g, now) {
  if (g.arm !== 'spear' || g.isPlayerSquad || g.routed || g.marching || g.noAutoYari) return;
  if (g._autoYari && (now - g._autoYariSeen > 15 || g.order !== 'hold' || g.formation !== 'yari')) {
    if (g.formation === 'yari') g.formation = g._autoYariFrom;
    g._autoYari = false;
  }
  if (g.order !== 'hold' || (g.formation !== 'line' && !g._autoYari) || g.count < 5 || g.integrity < 65 || g.morale < 40) return;
  const c = g.center(g._ahC || (g._ahC = {})), sf = Math.sin(g.facing || 0), cf = Math.cos(g.facing || 0);
  let seen = false;
  army.forNear(c.x, c.z, 28, (o) => {
    if (seen || !o.alive || !o.mounted || o.team === g.team || o.fleeing || o.isPlayer && o.team === g.team) return;
    const dx = o.pos.x - c.x, dz = o.pos.z - c.z;
    if ((dx * sf + dz * cf) / (Math.hypot(dx, dz) || 1) > 0.3) seen = true;
  });
  if (!seen) return;
  g._autoYariSeen = now;
  if (!g._autoYari) { g._autoYari = true; g._autoYariFrom = g.formation; g.formation = 'yari'; g._yh = undefined; g._yhAt = 0; }
}

// 11/11 要件 P0-3：槍衾が成り立つか。槍の構え（formation yari・待て）で、槍を持つ者が五人以上・士気三十以上・
//   整い五十以上（一度崩れたら六十五まで戻るのを待つ）・頭が生きている時だけ。崩れた時は組をほどいて乱戦へ（formLoose）。
//   正面の固さ・騎馬止め・穂先の揃いは、みなこれを読む。人数と頭は半秒に一度だけ数える。
export function yariHolds(army, g) {
  if (!g || g.formation !== 'yari' || g.routed || g.marching || !(g.order === 'yari' || g.order === 'hold')) return false;
  const now = army.time;
  if (g.formLoose != null && now - g.formLoose < 1.5) return false;
  if (!(g._yhAt > now)) {
    g._yhAt = now + 0.5;
    let n = 0;
    for (const u of g.units) if (u.alive && !u.fleeing && !u.dropped && (u.isPlayer || (u.wpnKind || u.lookWeapon) === 'spear')) n++;
    const h = g.isPlayerSquad ? null : groupHead(g);
    const was = g._yh !== false;
    const ok = n >= 5 && (!h || (h.alive && !h.fleeing && !h.woundOut)) &&
      (g.morale ?? 100) >= 30 && (g.integrity ?? 100) >= (was ? 50 : 65);
    if (was && !ok && g._yh !== undefined) { g.formLoose = now; g._looseT = now; g.yariBrokeAt = now; }
    g._yh = ok;
  }
  return g._yh;
}
// 槍衾の組が横・後ろから打たれ、また矢弾を受けると整いが落ちる（正面の白兵では落ちない）
export function yariShaken(army, t, src, kind) {
  const g = t.group;
  if (!g || g.formation !== 'yari' || g.routed || !src || src.team === t.team) return;
  if (g.integrity === undefined) g.integrity = 100;
  let d = 0;
  if (kind === 'gun') d = 2.5;
  else if (kind === 'arrow') d = 1.2;
  else if (src.pos) {
    const f = g._face ?? g.facing ?? t.heading;
    const dx = src.pos.x - t.pos.x, dz = src.pos.z - t.pos.z, l = Math.hypot(dx, dz) || 1;
    const front = (dx * Math.sin(f) + dz * Math.cos(f)) / l;
    d = front < -0.3 ? 6 : front < 0.4 ? 4 : 0;
    if (src.mounted && d) d *= 1.6;
  }
  if (d) g.integrity = Math.max(0, g.integrity - d);
}

// 11/11 要件 P0-1：七つの状態（u.st7）。中の値だけで、画面には出さない（字を出さない決まり）。
function state7(u, m, now) {
  const g = u.group;
  u.st7 = u.fleeing ? (u.squadRallyTo ? 'RALLYING' : 'ROUTING') : u.surrender ? 'SURRENDERING'
    : m < 22 || u.confused > 0 ? 'PANICKED' : m < 45 || u.backUntil > now ? 'AFRAID'
    : u.atk || u.swing || u.target ? 'ENGAGED' : (u.fright || 0) > 6 || (g && g.integrity < 90) ? 'NERVOUS' : 'CALM';
}

// 兵一人の気持ち。近くの様子は間引いて調べ、行き先の入れ物は使い回す。
export function moraleState(u) {
  const m = (u.group ? u.group.morale : 100) - (u.fright || 0);
  u.moraleState = u.fleeing ? '敗走' : u.woundOut || u.hp < u.maxHp * 0.35 ? '負傷'
    : u.confused > 0 ? '混乱' : m < 45 || u.backUntil > (u.group?._t ?? 0) ? '恐怖'
    : m >= 75 && u.id % 4 === 0 ? '勇敢' : '普通';
  state7(u, m, u.group?._t ?? 0);
  return m;
}

// 周りを見る関数と結果の入れ物を、兵ごとに作り直さない。
function senseNearby(o, sense) {
  const u = sense.u;
  if (o === u || !o.alive || o.isStruct || o.type === 'dummy' || o.farSim || Math.abs(o.pos.y - u.pos.y) > 3) return;
  const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d2 = dx * dx + dz * dz;
  // 升目には範囲外の兵も入る。気持ちに影響しない距離の相手は、重い壁の見通しを調べる前に外す。
  // 六メートル外でも、歩兵へ迫る騎馬は今までどおり十メートルまで調べる。
  if (!(d2 < 36) && (o.team === u.team || u.mounted || !o.mounted || !(d2 < sense.horseD))) return;
  if (o.team !== u.team && sense.army.wallBetween(u.pos, -1, o.pos)) return;
  if (d2 < 36 && !o.fleeing && !o.woundOut && !o.rearWound && !o.dropped && !o.downed && !(o.pinT > sense.army.time)) {
    if (o.team === u.team) { sense.friends++; if (!o.isPlayer && temper(o) === 'vet' && o.group === u.group) sense.vets++; }
    else { sense.foes++; const h = u.group?.facing; if (h !== undefined && dx * Math.sin(h) + dz * Math.cos(h) < Math.sqrt(d2) * 0.3) sense.flank++; }
  }
  if (o.team !== u.team && o.fleeing && !o.woundOut && d2 < 36) sense.foeRunners++;
  if (o.team === u.team) {
    // 下知による退きや手傷による退きは、恐慌の連鎖に数えない。
    if (o.fleeing && !o.woundOut && o.group && (o.group.routed || o.moraleFleeDir) && d2 < 36) { sense.runners++; sense.runner = o; }
  } else if (!u.mounted && o.mounted && !o.fleeing && !o.woundOut && !o.downed && !(o.pinT > sense.army.time) && !(o.stagger > 0.3) && d2 < sense.horseD && o.mv && o.mv.x * o.mv.x + o.mv.z * o.mv.z > 9 && dx * o.mv.x + dz * o.mv.z < -2) {
    sense.horse = o; sense.horseD = d2;
  }
}

export function moraleThink(army, u) {
  const g = u.group, now = army.time;
  if (!g || u.isPlayer || u.type === 'dummy' || u.farSim) return;
  // 降参：武器を捨てて膝をつき、狙えない者になる。十秒たつと捕虜として連れ去られる（討死にも数えない）
  if (u.surrender) {
    if (now > u.surrender && u.alive && !u.gone) {
      u.evacuatedWound = true; u.gone = true; u.captured = true;
      army.corpseAt(u, -1); army.scene.remove(u.mesh);
      const i = army.dead.indexOf(u); if (i >= 0) army.dead.splice(i, 1);
    }
    return;
  }
  // 自分の組で、得物を保って退いた者は安全な旗のそばで息を整える。
  // 深手・武器を捨てた者・組全体の敗走は戻さない。調べるのは一秒に一度。
  // 11/11 要件 P0-4：自分の組の旗か頭が立っていれば、ほかの組の兵も同じように旗のそばで集まり直す（組全体の敗走は戻さない）。
  if (u.fleeing && u.moraleFleeDir && !g.routed && !g.noRally && !g.fleePath?.length &&
      !u.gone && !u.dropped && u.wpnKind !== 'none' && !u.woundOut && !u.rearWound && !u.noTarget &&
      !u.downed && !(u.pinT > now) && !u.dragging && u.hp >= u.maxHp * 0.35 &&
      (g.isPlayerSquad ? g.order === 'retreat' || g.order === 'hold' || g.order === 'follow' || g.order === 'yari'
        : g.order !== 'retreat' && g.order !== 'flee' && !g.civ)) {
    if (!(u.squadRallyCheck > now)) {
      u.squadRallyCheck = now + 1;
      const flag = g.units.find(o => o.alive && !o.fleeing && !o.woundOut && !o.rearWound && !o.noTarget && !o.downed && !(o.pinT > now) && (o.stdHeld || o.banner));
      const lead = g.leader && g.leader !== u && !g.leader.fleeing && !g.leader.woundOut ? g.leader : null;
      const head = flag || (g.isPlayerSquad ? army.playerUnit : lead);
      const safe = head?.alive && head.team === u.team && !head.downed && !(head.pinT > now) &&
        Math.abs(head.pos.y - u.pos.y) < 3 && Math.hypot(head.pos.x - u.pos.x, head.pos.z - u.pos.z) < 30 &&
        localClear(army, u.pos, head.pos) && !army.nearestEnemy(head, 12, o => !o.fleeing && !o.noTarget && Math.abs(o.pos.y - head.pos.y) < 3 && localClear(army, head.pos, o.pos)) &&
        !army.nearestEnemy(u, 9, o => !o.fleeing && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 && localClear(army, u.pos, o.pos));
      u.squadRallyTo = safe ? head.pos : null;
      if (safe && Math.hypot(head.pos.x - u.pos.x, head.pos.z - u.pos.z) < 6 && g.morale >= 35) {
        if (u.squadRallySince == null) u.squadRallySince = now;
        if (now - u.squadRallySince >= (temper(u) === 'vet' ? 2 : temper(u) === 'coward' ? 6 : 4)) {
          u.fleeing = false; u.moraleFleeDir = null; u.fright = 0; u.backUntil = 0;
          u.squadRallyTo = null; u.squadRallySince = null; u.moveTo = null; u.aiT = 0;
        }
      } else u.squadRallySince = null;
    }
  } else { u.squadRallyTo = null; u.squadRallySince = null; }
  // 号令などで立ち直った者は、個人の逃げる向きも忘れる。
  if (!u.fleeing && u.moraleFleeDir) { u.moraleFleeDir = null; u.fright = 0; u.backUntil = 0; }
  if (u.fleeing || u.noTarget || u.downed || u.pinT > now || u.rearWound || g.civ || u.type === 'porter' || u.climb || u.perch || u.woundOut || u.cover || u.escort || u.duelW || army.duel && u === army.duel.foe) { moraleState(u); return; }
  if (u.senseAt > now) return;
  u.senseAt = now + 0.6 + (u.id % 5) * 0.08;
  commanderAdvance(army, u);
  const sense = army.moraleSense;
  sense.army = army; sense.u = u; sense.horse = sense.runner = null; sense.horseD = 100; sense.runners = 0; sense.friends = sense.foes = sense.flank = sense.vets = sense.foeRunners = 0;
  // 気持ちに響くのは 6m・迫る騎馬は 10m まで。升目の写しで遠い兵を先に落とす。
  army.forNearIn(u.pos.x, u.pos.z, 9, 10, senseNearby, sense);
  const horse = sense.horse, runner = sense.runner, runners = sense.runners;
  u._flankFoes = sense.flank;
  groupIntegrity(army, g);
  sense.u = sense.horse = sense.runner = null;
  const brace = !u.dropped && !u.downed && !(u.pinT > now) && !(u.stagger > 0.3) && !u.woundOut && (u.wpnKind || u.lookWeapon) === 'spear' && yariHolds(army, g) && g.morale >= 45;
  if (horse && !brace && !(u.horseFearAt > now)) {
    u.horseFearAt = now + 6;
    scare(u, 12);
    const dx = u.pos.x - horse.pos.x, dz = u.pos.z - horse.pos.z, len = Math.hypot(dx, dz) || 1;
    u.moralePoint.x = u.pos.x + dx / len * 2.8;
    u.moralePoint.z = u.pos.z + dz / len * 2.8;
    u.backFace = Math.atan2(-dx, -dz); u.backUntil = now + 0.85;
    u.atk = null;
  }
  if (runners && g.morale < 55 && !(u.routFearAt > now)) {
    u.routFearAt = now + 6;
    scare(u, Math.min(16, runners * 7));
  }
  // 近くの味方が倒れ、敵に囲まれるほど恐怖が続く。敵一人だけでは包囲と数えない。
  if (sense.foes >= 3 && sense.foes > sense.friends + 1) {
    scare(u, 2 + Math.min(4, sense.foes - sense.friends));
  }
  // 11/11 足軽の心：一人だと弱い。六メートルに味方が一人もおらず敵がいれば、怖さが増える（古参は少し）。
  if (sense.foes && !sense.friends && !u.mounted && !(u.aloneFearAt > now)) { u.aloneFearAt = now + 3; scare(u, 4 + sense.foes * 2); }
  // 隣の古参が若い兵を止める・敵が背を向けると強気になる・旗か頭が近くに立っていると持ち直す。
  if (u.fright > 0) {
    let calm = 0;
    if (sense.vets && temper(u) !== 'vet') calm += Math.min(2, sense.vets);
    if (sense.foeRunners) calm += Math.min(4, sense.foeRunners * 1.5);
    if (sense.friends >= 4 && sense.friends > sense.foes * 2) calm += 1;
    if (calm < 4 && headSeen(army, u, g, now)) calm += 1.5;
    if (calm) u.fright = Math.max(0, u.fright - calm * TEMPER_CALM[temper(u)]);
  }
  u.fearSafe = sense.foes === 0 && !horse && !u.atk && !u.swing;
  const m = moraleState(u);
  // 個人の逃亡は弱った無名の兵から。筋書きの不退転・武将・備の頭を守る。
  // 頭（侍大将・組頭）が生きていて退く下知も無い組の者は、一人で背を向けない（十八の4・二十二の1）
  if (!g.noRout && !g.routed && !headUp(g) && !(u.turnBack > now) &&!u.invuln && !u.name && u.type !== 'busho' && !u.isTaisho && u !== g.leader && m < (temper(u) === 'coward' ? 28 : temper(u) === 'vet' || temper(u) === 'hot' ? 15 : 22) + ((g.integrity ?? 100) < 20 ? 6 : 0) && (runners || horse || sense.foes >= 3 || g.morale < 30)) {
    const f = runner && (runner.moraleFleeDir || runner.group.fleeDir);
    u.moraleDir.x = f ? f.x : -Math.sin(g.facing);
    u.moraleDir.z = f ? f.z : -Math.cos(g.facing);
    const q = localPoint(army, u, u.moralePoint, u.pos.x + u.moraleDir.x * 4, u.pos.z + u.moraleDir.z * 4);
    const dx = q.x - u.pos.x, dz = q.z - u.pos.z, len = Math.hypot(dx, dz);
    if (len > 0.1) { u.moraleDir.x = dx / len; u.moraleDir.z = dz / len; }
    u.moraleFleeDir = u.moraleDir;
    // 降参：深手で囲まれ、逃げ場の無い無名の歩兵は、背を向けず武器を捨てる（二人に一人まで）
    if (m < 14 && u.hp < u.maxHp * 0.5 && sense.foes >= 2 && !runners && !u.mounted && u.wpn && u.wpn.parent && u.id % 2 === 0 &&
        u.team !== army.playerUnit?.team && !u.dropped) {
      army.dropWeapon(u); u.wpn = null; u.wpnKind = 'none';
      u.surrender = now + 10; u.noTarget = true; u.target = null; u.atk = null; u.swing = null; u.confused = 0; u.aiT = 0;
      u.hit = { kind: 'kneel', t: 0, dur: 1.2, from: 'front', side: 1, part: 'torso', res: 'gap', heavy: true, wkind: 'thrust' };
      u.lastHit = u.hit; u.lastKneelT = now; u.stagger = Math.max(u.stagger || 0, 1.0);
      moraleState(u); return;
    }
    u.fleeing = true; u.fleeT = now; u.target = null; u.atk = null; u.swing = null; u.confused = 0;
    u.backUntil = 0; u.lookUntil = 0; u.aiT = 0;
    g.morale = Math.max(0, g.morale - 6 / Math.max(6, g.initial));
    // 一部は得物も捨てる。地面へ置くのは、この瞬間の一度だけ。
    if (m < 16 && u.id % 3 === 0 && u.wpn && u.wpn.parent && !u.dropped && !u.mounted) {
      army.dropWeapon(u);
      u.wpn = null; u.wpnKind = 'none';
    }
    moraleState(u);
  }
}

// 11/11 足軽の心：自分の組の旗か頭が十五メートル内に立って見えるか。組ごとに旗持ちを一秒に一度だけ探し直す。
function headSeen(army, u, g, now) {
  if (!(g._flagAt > now)) {
    g._flagAt = now + 1;
    g._flag = g.units.find(o => o.alive && !o.fleeing && !o.woundOut && !o.downed && (o.stdHeld || o.banner)) || null;
  }
  for (const h of [g._flag, groupHead(g)]) {
    if (!h || h === u || !h.alive || h.fleeing || h.woundOut || h.downed || Math.abs(h.pos.y - u.pos.y) > 3) continue;
    const dx = h.pos.x - u.pos.x, dz = h.pos.z - u.pos.z;
    if (dx * dx + dz * dz < 225 && localClear(army, u.pos, h.pos)) return true;
  }
  return false;
}

// 武将が実際に前へ二歩出た時だけ、近くの隊へ伝える。静止や後退では鼓舞しない。
function commanderAdvance(army, u) {
  const g = u.group, now = army.time;
  if (g.routed || u.confused > 0 || !(u.isTaisho || u === g.leader && (u.type === 'busho' || u.type === 'samurai' || u.name))) return;
  const x = u.pos.x, z = u.pos.z, h = g._face ?? g.facing;
  if (u.chiefX === undefined) { u.chiefX = x; u.chiefZ = z; return; }
  const forward = (x - u.chiefX) * Math.sin(h) + (z - u.chiefZ) * Math.cos(h);
  const elapsed = Math.max(0, now - (u.chiefSampleAt ?? now));
  u.chiefSampleAt = now; u.chiefX = x; u.chiefZ = z;
  const walking = u.mv.x * Math.sin(h) + u.mv.z * Math.cos(h);
  if (u.atk || u.swing || u.downed || u.pinT > now || u.stagger > 0 || walking < 0.2 || Math.hypot(u.push.x, u.push.z) > 0.3) { u.chiefSteps = 0; return; }
  if (g.order !== 'attack' && g.order !== 'move' || g.focus || g.isPlayerSquad || forward <= 0.02) { u.chiefSteps = 0; return; }
  u.chiefSteps = (u.chiefSteps || 0) + Math.min(forward, walking * elapsed);
  if (u.chiefSteps < 2 || u.chiefNext > now) return;
  u.chiefSteps = 0;
  if (!army.nearestEnemy(u, 30)) return;
  u.chiefNext = now + 12;
  g.commanderAdvanceAt = now;
  for (const n of army.groups) {
    if (!n.count || n.team !== u.team || n.civ || n.routed || n.isPlayerSquad || n.focus || n.order !== 'attack' && n.order !== 'move') continue;
    const c = n.center();
    let witness = null, distance = Infinity;
    for (const o of n.units) if (o.alive && !o.fleeing && (o === n.leader || o.stdHeld || !witness)) {
      const d = Math.hypot(o.pos.x - x, o.pos.z - z);
      if (d < distance) { witness = o; distance = d; }
    }
    // 旗を見渡せる同じ高さの隊だけが応じる。谷や閉じた壁を越えない。
    if (Math.hypot(c.x - x, c.z - z) > 30 || !witness || Math.abs(witness.pos.y - u.pos.y) > 3 ||
        !localClear(army, u.pos, witness.pos) || n.commanderBoostAt > now - 8) continue;
    n.commanderBoostAt = now;
    n.morale = Math.min(100, n.morale + 8);
    n.commanderPush = u; n.commanderPushUntil = now + 8;
    for (const o of n.units) if (o.alive && !o.fleeing && !o.isPlayer) {
      o.fright = Math.max(0, (o.fright || 0) - 8);
      o.aiT = Math.min(o.aiT, 0.2);
    }
    for (const s of n.stds || []) if (s.userData.std) s.userData.std.dipT = 0.9;
  }
  army.play('eshout', u.pos, 0.7);
}

export function moraleAct(army, u, dt) {
  if (u.fearSafe && !u.restThreat && !u.atk && !u.swing && !u.fleeing && !u.confused) u.fright = Math.max(0, u.fright - dt * 0.8 * TEMPER_CALM[temper(u)]);
  if (u.backUntil <= army.time) u.backUntil = 0;
  moraleState(u);
  if (u.fleeing || u.noTarget || u.group.civ || u.type === 'porter' || u.climb || u.perch || u.woundOut || u.cover || u.escort || u.bind || u.downed || u.pinT > army.time || u.stagger > 0 || u.confused > 0 || u.group.routed) return false;
  // 出始めた一撃は終えてから反応する。
  if (u.swing || u.atk) return false;
  if (u.backUntil > army.time) {
    u.target = null;
    army.steer(u, dt, u.moralePoint, u.speed * 0.65, u.backFace);
    return true;
  }
  if (u.lookUntil > army.time) {
    army.steer(u, dt, null, 0, u.lookFace);
    return true;
  }
  return false;
}

export function moraleDeath(army, t) {
  if (t.type === 'dummy' || t.farSim) return;
  const chief = t.isTaisho || t.type === 'busho' || t.group && t === t.group.leader;
  if (chief) {
    if (t.group) { t.group.commanderLostAt = army.time; t.group.commanderLostMinor = !(t.isTaisho || t.type === 'busho'); }
    for (const g of army.groups) {
      if (g.commanderPush === t) { g.commanderPush = null; g.commanderPushUntil = 0; }
      if (!g.count || g.team !== t.team || g.civ || g === t.group) continue;
      const c = g.center();
      if (Math.hypot(c.x - t.pos.x, c.z - t.pos.z) <= 30 && g.units.some(u => u.alive && Math.abs(u.pos.y - t.pos.y) <= 3 && localClear(army, t.pos, u.pos))) g.morale = Math.max(0, g.morale - 8);
    }
    army.play('cry', t.pos, 0.9);
  }
  army.forNear(t.pos.x, t.pos.z, chief ? 30 : 4, (u) => {
    if (!u.alive || u.isPlayer || u.noTarget || u.group && u.group.civ || u.fleeing || u.type === 'porter' || u.type === 'dummy' || u.farSim || u.team !== t.team || Math.abs(u.pos.y - t.pos.y) > 3) return;
    const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z, d2 = dx * dx + dz * dz;
    if (d2 > (chief ? 900 : 16) || army.wallBetween(t.pos, -1, u.pos)) return;
    scare(u, chief ? 18 : 10);
    if (chief) {
      u.confused = Math.max(u.confused, 1.5 + (u.id % 4) * 0.4);
      // 混乱の後、一歩退く。士気の低い兵は既存の敗走へつながる。
      const h = u.group ? u.group.facing : u.heading;
      localPoint(army, u, u.moralePoint, u.pos.x - Math.sin(h) * 3, u.pos.z - Math.cos(h) * 3);
      u.backFace = h; u.backUntil = army.time + u.confused + 1.2;
    }
    if (d2 < 16 && !(u.lookAgainAt > army.time)) {
      u.lookFace = Math.atan2(dx, dz); u.lookUntil = army.time + 0.45; u.lookAgainAt = army.time + 3;
    }
    moraleState(u);
  });
}
