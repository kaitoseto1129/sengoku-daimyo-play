// 全戦の前線の濃さ。既存の無名兵が小勢として寄せ、兵の追加・瞬間移動はしない。
// 遠景の厚みは distant_battle.js の addDistantArmy に任せ、実体の250人枠を増やさない。
// def.frontlineDensity = false で停止。{ strength: 0.5〜2, active: rt => 真偽,
//   phases: ['fight', …], excludePhases: ['pursuit', …], gap: false,
//   canSend: (rt, g) => 真偽 } で戦・段ごとに調整できる。
// scoutAdvance: true は物見の出る所を通じる道に絞り、本人へ寄せる。
// g.noFrontline = true は任務の隊を保護。大将・本陣・伏兵・守備専用の隊は常に保護。
import { groundAt } from './floors.js';
import { localPoint, localClear } from './army_local_way.js';
const DEFAULT = {};
const EMPTY = [];
const QUIET_PHASE = /^(brief|march|wait|rest|pick|move|back\d*|retreat|withdraw|flee|escape|envoy|news|lull|regroup|redeploy|end\d*)$/;
const COMBAT_PHASE = /^(fight|hold|assault|charge|counter|contact|press|defend|sortie|sally|siege|breach|storm|push|w\d+|final)$/;
const QUIET_TASK = /退き口|退き道|退却|落ち延び|逃げ切|逃げよ|(?<!を)退け|脱出|行軍|合流|運べ|届け|話せ|交渉|待て|忍び|忍べ/;
const COMBAT_TASK = /を退け|討て|倒せ|崩せ|斬|戦え|迎え撃|打ち|寄せを止|押し返|守れ|守り|持ちこたえ|攻め|押さえ|突破|槍をそろえ/;

function fighting(rt, config) {
  if (rt.over || rt.aftermath || rt.withdrawal || rt.flags.ending || !rt.player.u.alive || rt.def.dojo || rt.def.town ||
      rt.choice || rt.tutPause || (rt.prelude && rt.prelude !== 'done') ||
      (rt.def.wakeOK && !rt.def.wakeOK(rt))) return false;
  if (config.excludePhases?.includes(rt.phase)) return false;
  if (config.active) return !!config.active(rt);
  if (config.phases) return config.phases.includes(rt.phase);
  // 深さの段は外側の phase を変えない戦もある。段自身の種別を先に読む。
  const D = rt.flags.dp;
  if (D?.on && D.cur) return D.cur.s.kind === 'fight' || D.cur.s.kind === 'hold';
  if (QUIET_PHASE.test(rt.phase)) return false;
  let task = null;
  for (const o of rt.objectives) {
    if (o.state || (o.kind !== 'main' && o.kind !== 'order')) continue;
    if (!task || o.t >= task.t) task = o;
  }
  return task ? !QUIET_TASK.test(task.text) || COMBAT_TASK.test(task.text) && !/退き|退却/.test(task.text) : COMBAT_PHASE.test(rt.phase);
}

function soldier(u) {
  return u.alive && !u.gone && !u.isStruct && !u.fleeing && !u.noTarget && !u.woundOut && !u.rearWound &&
    u.type !== 'dummy' && u.type !== 'porter' && !u.group?.hidden && !u.group?.people && !u.group?.civ;
}

function movable(rt, g) {
  if (!g || g.noFrontline || g.hidden || g.hideFlags || g.people || g.civ ||
      g.isRunner || g.isPlayerSquad || g.routed || g.guard || g.guardOn || g.siegeAI || (g.noAI && !g.frontlineMobilize && !rt.army.frontlineDensity?.relax) ||
      g.ambush || g._ai?.ambushWait || g._ai?.mode === 'withdraw' || g._ai?.mode === 'rally' ||
      g.focus || g.onArrive || g.historicalOrders && g.ai !== true && !g.dispatch || g.stay || g.regroupT > 0 || g._ai?.mode === 'flank' || g.march || g.marching || g.retreatOnly ||
      (g.order !== 'attack' && g.order !== 'hold' && g.order !== 'yari')) return false;
  if (g === rt.taisho?.a?.g || g === rt.taisho?.b?.g || g === rt.taisho?.a?.u?.group ||
      g === rt.taisho?.b?.u?.group || g.butai?.sonae?.line === 'honjin') return false;
  for (const s of rt.sonae || EMPTY) if (s.line === 'honjin' && s.b.real === g) return false;
  return !rt.def.frontlineDensity?.canSend || rt.def.frontlineDensity.canSend(rt, g);
}

function ordinary(rt, u) {
  return soldier(u) && movable(rt, u.group) && !u.name && u.type !== 'busho' && !u.isLord &&
    !u.isPlayer && !u.isSub && !u.invuln && !u.mounted && !u.isStandard && !u.stdHeld &&
    !u.banner && u !== u.group.leader && (u.type === 'ashigaru' || u.type === 'samurai') &&
    !u.cover && !u.escort && !u.fordEscort && !u.dropped && !u.climb && !u.duelW &&
    !(u.confused > 0) && !u.downed && !(u.pinT > rt.army.time) && !u.dragging;
}

function clear(rt, F) {
  for (const u of F.sent) {
    if (u.frontlineStep?.owner !== F) continue;
    u.frontlineStep.until = 0; u.moveTo = null; u.aiT = 0;
    if (u.target === rt.player.u) u.target = null;
  }
  F.sent.length = 0; F.wave = 0; F.relax = false; F.gapSendAt = 0;
  for (const g of rt.army.groups) { g.frontlineMeleeUntil = 0; g.frontlineContactAt = null; }
}

function send(rt, F, u, spread, foe = null, life = 30) {
  const P = rt.player.u.pos, q = u.frontlineStep || (u.frontlineStep = { x: 0, z: 0, until: 0, owner: F });
  q.owner = F; q.spread = spread; q.order = u.group.order; q.foe = foe;
  q.gap = false;
  q.until = rt.army.time + (spread ? 10 : life);
  const dx = u.pos.x - P.x, dz = u.pos.z - P.z, d = Math.hypot(dx, dz) || 1;
  // 外側の兵から一人ずつ、刀の輪を離れて列を立て直す。消さず、傷も士気も変えない。
  q.x = spread ? P.x + dx / d * 18 : foe ? foe.pos.x : P.x;
  q.z = spread ? P.z + dz / d * 18 : foe ? foe.pos.z : P.z;
  if (!F.sent.includes(u)) F.sent.push(u);
  u.aiT = 0;
}

// ぶつかって三秒は槍をそろえる。その後は後列も隙へ入り、静まれば列へ戻る。
export function frontlineMelee(army, u) {
  const g = u.group, F = army.frontlineDensity;
  return !!(F?.on && F.stage === (F.rt.flags.dp?.on ? F.rt.flags.dp.cur : F.rt.phase) && g?.frontlineMeleeUntil > army.time && g.frontlineOrder === g.order && ordinary(F.rt, u));
}

function meleeTick(rt, F, elapsed, strength) {
  const A = rt.army, P = rt.player.u.pos;
  let engaged = 0;
  for (const g of A.groups) {
    if (!movable(rt, g)) { g.frontlineMeleeUntil = 0; g.frontlineContactAt = null; continue; }
    let contact = false, broken = false;
    for (const u of g.units) {
      const t = u.target;
      if (!soldier(u) || !soldier(t || {}) || t.isPlayer || t.team === u.team ||
          Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 45 ||
          Math.abs(u.pos.y - t.pos.y) > 1.8 || Math.hypot(u.pos.x - t.pos.x, u.pos.z - t.pos.z) > 6 ||
          A.wallBetween(u.pos, u.team, t.pos)) continue;
      contact = true;
      if (Math.hypot(u.pos.x - P.x, u.pos.z - P.z) <= 30) engaged++;
      if (u.yariOpenUntil > A.time || t.yariOpenUntil > A.time || g.count < g.initial * 0.8) broken = true;
    }
    if (!contact) { g.frontlineContactAt = null; continue; }
    if (g.frontlineContactAt == null || g.frontlineOrder !== g.order) g.frontlineContactAt = A.time;
    g.frontlineOrder = g.order;
    if (broken || A.time - g.frontlineContactAt >= 3) g.frontlineMeleeUntil = A.time + 4;
  }
  F.wave = Math.max(0, (F.wave || 0) - elapsed);
  if (F.wave > 0 || engaged >= Math.round(12 * strength)) return;
  F.wave = 2;
  let sent = 0;
  // 両軍とも最寄りの一備から六人ずつ。既存兵を歩かせ、遠くの軍勢は増やさない。
  for (let team = 0; team < 2; team++) {
    let source = null, foe = null, best = Infinity, travelling = 0;
    for (const u of F.sent) if (u.team === team && !u.frontlineStep.spread && u.frontlineStep.foe) travelling++;
    if (travelling >= Math.round(12 * strength)) continue;
    for (const u of A.units) {
      if (u.team !== team || !ordinary(rt, u) || u.atk || u.swing || u.bind || u.target?.alive || u.frontlineStep?.until > A.time ||
          Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 80) continue;
      // 後詰は前の備が減る・退くまで温存する。本陣は movable で常に外す。
      if (u.group.reserve || u.group.butai?.sonae?.line === 'gotsume' || u.group.butai?.sonae?.line === 2) {
        let relief = false;
        for (const g of A.groups) if (g !== u.group && g.team === team && !g.guard && !g.isPlayerSquad &&
            (g.routed || g.morale < 35 || g.count < g.initial * 0.65) &&
            Math.hypot(g.anchor.x - u.pos.x, g.anchor.z - u.pos.z) < 45) { relief = true; break; }
        if (!relief) continue;
      }
      const enemy = A.nearestEnemy(u, 80, o => soldier(o) && !o.isPlayer && !o.invuln && !o.group?.hidden &&
        Math.hypot(o.pos.x - P.x, o.pos.z - P.z) <= 28 && Math.abs(o.pos.y - u.pos.y) < 1.8 &&
        !A.wallBetween(u.pos, u.team, o.pos));
      if (!enemy) continue;
      const d = Math.hypot(u.pos.x - enemy.pos.x, u.pos.z - enemy.pos.z);
      if (d < best) { best = d; source = u.group; foe = enemy; }
    }
    if (!source) continue;
    let n = 0;
    for (const u of source.units) {
      if (n >= Math.min(Math.round(6 * strength), Math.round(12 * strength) - travelling)) break;
      if (!ordinary(rt, u) || u.atk || u.swing || u.bind || u.target?.alive || u.frontlineStep?.until > A.time ||
          Math.abs(u.pos.y - foe.pos.y) > 1.8 || A.wallBetween(u.pos, u.team, foe.pos)) continue;
      send(rt, F, u, false, foe); n++; sent++;
    }
    if (n) {
      A.play('eshout', source.anchor, 0.65);
      // 既存の声・太鼓を間引いて鳴らす。旗は進む仲間へ付く。
      if (!(F.drumAt > A.time)) { F.drumAt = A.time + 12; A.play('taiko', source.anchor, 0.5); }
    }
  }
  if (sent) F.wave = 6;
}

// 道が通じる兵がいない時、自分の側から物見ほどの小勢（六人）を出す。十四秒に一度・一戦に十六組まで・生きた兵が266を超えたら出さない。
function scouts(rt, F, P) {
  const A = rt.army;
  if (F.scoutAt > A.time || (F.scouts || 0) >= 16) return;
  let alive = 0, near = null, nd = Infinity;
  for (const u of A.units) {
    if (!u.alive) continue;
    // 杭や柵は兵の枠に数えない。雑賀の長い柵で物見を止めない。
    if (!u.isStruct) alive++;
    if (u.team !== rt.player.u.team && !u.isStruct && !u.civ && !u.noTarget && !u.fleeing && u.type !== "dummy") { const d = Math.hypot(u.pos.x - P.x, u.pos.z - P.z); if (d < nd) { nd = d; near = u; } }
  }
  const dbg = F.dbg || (F.dbg = { alive: 0, near: 0, spot: 0 });
  if (alive > 266 || !near) { if (alive > 266) dbg.alive++; else dbg.near++; return; }
  const W = rt.world, spot = { x: 0, z: 0, y: P.y }, face = Math.atan2(near.pos.x - P.x, near.pos.z - P.z);
  const advance = F.on && rt.def.frontlineDensity?.scoutAdvance;
  let ok = null;
  spots: for (const r of (advance ? [16, 13, 10, 7] : A.time - (F.lastScout ?? -99) < 30 ? [10, 13, 8, 16, 20, 7] : [20, 26, 32, 15, 12, 40, 9, 7])) for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.0, -2.0, 2.4, -2.4, 2.8, 3.14]) {
    spot.x = P.x + Math.sin(face + turn) * r; spot.z = P.z + Math.cos(face + turn) * r;
    spot.y = groundAt(W, spot.x, spot.z, P.y);
    if (Math.abs(spot.y - P.y) > 2.5 || !W.walkable(spot.x, spot.z, P.y) || !localClear(A, spot, P)) continue;
    ok = { x: spot.x, z: spot.z };
    if (advance) break spots;
    break;
  }
  // 急な山道では高さの差で全部外れる（木ノ芽峠で二十五回）。近い所を高さの許しを広げて探し直す
  if (!ok) wide: for (const r of [8, 11, 14, 6]) for (const turn of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4, 3.14]) {
    spot.x = P.x + Math.sin(face + turn) * r; spot.z = P.z + Math.cos(face + turn) * r;
    spot.y = groundAt(W, spot.x, spot.z, P.y);
    if (Math.abs(spot.y - P.y) > 5 || !W.walkable(spot.x, spot.z, spot.y) || !localClear(A, spot, P)) continue;
    ok = { x: spot.x, z: spot.z }; break wide;
  }
  if (!ok) { dbg.spot++; return; }
  const g = A.addGroup({ team: near.team, faction: near.group?.faction || A.groups.find((q) => q.team === near.team)?.faction, name: '物見の足軽', order: 'attack', formation: 'line', facing: Math.atan2(P.x - ok.x, P.z - ok.z),
    anchor: ok, width: 6, aggro: 14, seekRange: 40, morale: 80, speed: 3.2 });
  g.frontlineScout = true;
  if (advance) {
    // 見えない所への置き直しも四十五歩以内。十秒の切れ目から寄せても、
    // 二十五歩の輪まで約七秒。柵や坂で道が切れる場所へずらさない。
    g.spawnPointOK = (x, z) => {
      spot.x = x; spot.z = z; spot.y = groundAt(W, x, z, P.y);
      return Math.hypot(x - P.x, z - P.z) <= 45 && localClear(A, spot, P, true);
    };
  }
  A.spawn(g, [{ type: 'samurai', n: 1, o: {} }, { type: 'ashigaru', n: Math.max(1, Math.min(5, 267 - alive)), o: {} }]);
  g.spawnPointOK = null;
  if (advance) {
    // 四十歩の索敵では、合流口の手前の味方に捕まり続ける。
    // 隊の回り込みを止め、既存の歩みで本人へ寄せる。届く敵には応戦する。
    g.noAI = true; g.frontlineMobilize = true; g.seekRange = 4;
    for (const u of g.units) {
      if (!ordinary(rt, u)) continue;
      send(rt, F, u, false, null, 30);
      u.frontlineStep.gap = true;
      u.frontlineStep.lastX = u.pos.x; u.frontlineStep.lastZ = u.pos.z;
      u.frontlineStep.checkAt = A.time + 6;
    }
  }
  F.lastScout = A.time; F.scoutAt = A.time + 14; F.scouts = (F.scouts || 0) + 1; F.dry = 8;
}

// 静かな段（行軍・運び・見回りなど）でも、敵に四十秒会わなければ物見を一組出して間を埋める。始まりの札・終わり・追い討ちは除く。
const QUIET_KEEP = /^(brief|end|press|pursuit|envoy|news|wait|rest|lull|pick)/;
function quietScouts(rt, F, dt) {
  F.qscan = (F.qscan || 0) + dt;
  if (F.qscan < 1) return;
  const el = F.qscan; F.qscan = 0;
  const u0 = rt.player.u;
  if (rt.over || rt.aftermath || rt.withdrawal || rt.flags.ending || !u0.alive || rt.def.dojo || rt.def.town || rt.choice || rt.tutPause ||
      (rt.prelude && rt.prelude !== 'done') || rt.def.frontlineDensity === false || QUIET_KEEP.test(rt.phase)) { F.qdry = 0; return; }
  const P = u0.pos;
  let near = false;
  for (const u of rt.army.units) {
    if (u.team === u0.team || !u.alive || u.isStruct || u.civ || u.noTarget || u.fleeing || u.type === 'dummy') continue;
    const dx = u.pos.x - P.x, dz = u.pos.z - P.z;
    if (dx * dx + dz * dz <= 625) { near = true; break; }
  }
  F.qdry = near ? 0 : (F.qdry || 0) + el;
  if (F.qdry > 40) { scouts(rt, F, P); if (F.scoutAt > rt.army.time) F.qdry = 28; }
}

export function frontlineDensityTick(rt, dt) {
  const F = rt.army.frontlineDensity || (rt.army.frontlineDensity = { rt, scan: 0, empty: 0, on: false, sent: [], stage: null });
  const config = rt.def.frontlineDensity || DEFAULT;
  const stage = rt.flags.dp?.on ? rt.flags.dp.cur : rt.phase;
  const on = rt.def.frontlineDensity !== false && config.strength !== 0 && fighting(rt, config);
  if (!on || stage !== F.stage) {
    if (F.on || F.sent.length) clear(rt, F);
    F.empty = 0; F.dry = 0; F.scan = 0; F.stage = stage;
  }
  F.on = on;
  if (!on) { quietScouts(rt, F, dt); return; }
  F.scan += dt;
  if (F.scan < 0.5) return;
  const elapsed = F.scan; F.scan = 0;
  const P = rt.player.u.pos, strength = Math.max(0.5, Math.min(2, config.strength ?? 1));
  let nearby = 0, crowd = 0;
  for (const u of rt.army.units) {
    if (u.team === rt.player.u.team || !soldier(u)) continue;
    const dx = u.pos.x - P.x, dz = u.pos.z - P.z, d2 = dx * dx + dz * dz;
    if (d2 <= 625 && Math.abs(u.pos.y - P.y) < 6) nearby++;
    if (d2 <= 100 && Math.abs(u.pos.y - P.y) < 3) crowd++;
  }
  F.empty = nearby ? 0 : F.empty + elapsed;
  F.dry = nearby ? 0 : (F.dry || 0) + elapsed;
  // 既存の命令を戻す必要がないよう、個々の兵だけに短い歩みを持たせる。
  for (let i = F.sent.length - 1; i >= 0; i--) {
    const u = F.sent[i];
    const q = u.frontlineStep;
    // 到着を待つ間も時計を戻さない。六秒進めない兵は別の組に交替する。
    if (q.gap && rt.army.time >= q.checkAt) {
      const moved = Math.hypot(u.pos.x - q.lastX, u.pos.z - q.lastZ);
      q.checkAt = rt.army.time + 6; q.lastX = u.pos.x; q.lastZ = u.pos.z;
      if (!nearby && moved < 1.5) { q.until = 0; q.retryAt = rt.army.time + 18; }
    }
    if (!ordinary(rt, u) || q.order !== u.group.order || q.until <= rt.army.time ||
        q.foe && (!soldier(q.foe) || Math.hypot(q.foe.pos.x - P.x, q.foe.pos.z - P.z) > 35)) {
      q.until = 0;
      if (u.moveTo === u.moralePoint) u.moveTo = null;
      u.aiT = 0; F.sent.splice(i, 1);
    }
  }
  meleeTick(rt, F, elapsed, strength);
  if (crowd > 12) {
    let outer = null, far = 0;
    for (const u of rt.army.units) {
      if (u.team === rt.player.u.team || !ordinary(rt, u) || u.atk || u.swing || u.bind || u.frontlineStep?.until > rt.army.time) continue;
      const d = Math.hypot(u.pos.x - P.x, u.pos.z - P.z);
      if (d <= 10 && Math.abs(u.pos.y - P.y) < 3 && d > far) { outer = u; far = d; }
    }
    if (outer) send(rt, F, outer, true);
    return;
  }
  if (config.gap !== false && F.dry > 10) scouts(rt, F, P);
  if (config.gap === false || F.empty <= 8 || F.gapSendAt > rt.army.time) return;
  // 三十秒を超える前から歩かせる。呼んだだけでは切れ目を解消したことにしない。
  F.gapSendAt = rt.army.time + 3;
  F.relax = true;
  const take = Math.round(8 * strength), spot = F.spot || (F.spot = { x: 0, z: 0, y: 0 });
  let travelling = 0;
  for (const u of F.sent) if (u.frontlineStep.gap) travelling++;
  if (travelling >= take) return;
  let source = null, best = Infinity;
  // 組を単位に選ぶ。近い前線、予備の順。見えていない組を先に使う。
  // 守備・本陣・伏兵・史実の下知は movable が保護する。
  for (const g of rt.army.groups) {
    if (g.team === rt.player.u.team || !movable(rt, g)) continue;
    let scout = null, distance = Infinity;
    for (const u of g.units) {
      if (!gapReady(rt, u)) continue;
      const d = Math.hypot(u.pos.x - P.x, u.pos.z - P.z);
      if (d < distance) { scout = u; distance = d; }
    }
    if (!scout) continue;
    const reserve = g.reserve || g.butai?.sonae?.line === 'gotsume' || g.butai?.sonae?.line === 2;
    const visible = rt.frustum?.containsPoint(scout.pos);
    // 見えない遠方の組を待ち続けない。到着の目安が三十秒を超えたら近さを優先。
    const unseen = !visible && distance <= 25 + Math.max(0, 30 - F.empty) * (scout.run || 3.5);
    const score = distance + (reserve ? 1000 : 0) - (unseen ? 20 : 0);
    if (score >= best) continue;
    const route = localPoint(rt.army, scout, spot, P.x, P.z, true);
    if (Math.hypot(route.x - scout.pos.x, route.z - scout.pos.z) < 1.5) continue;
    source = g; best = score;
  }
  if (!source) return;
  let sentN = 0;
  for (const u of source.units) {
    if (sentN + travelling >= take) break;
    if (!gapReady(rt, u)) continue;
    send(rt, F, u, false, null, 120);
    const q = u.frontlineStep;
    q.gap = true; q.lastX = u.pos.x; q.lastZ = u.pos.z; q.checkAt = rt.army.time + 6;
    sentN++;
  }
  if (sentN && !(F.gapBarkAt > rt.army.time)) {
    F.gapBarkAt = rt.army.time + 20; rt.bark('敵の小勢がこちらへ寄せてくる');
  }
}

function gapReady(rt, u) {
  if (!ordinary(rt, u) || u.atk || u.swing || u.bind || u.frontlineStep?.until > rt.army.time ||
      u.frontlineStep?.retryAt > rt.army.time) return false;
  const t = u.target;
  // 遠くの敵を見張っている兵は使える。実際に斬り合っている兵は引き抜かない。
  return !t?.alive || !t.pos || Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) > 8;
}

// 兵の判断から呼ぶ。台本が下知を変えた時は即座に手を引く。
export function frontlineStep(army, u) {
  const F = army.frontlineDensity, q = u.frontlineStep;
  if (!F?.on || F.stage !== (F.rt.flags.dp?.on ? F.rt.flags.dp.cur : F.rt.phase) ||
      !q || q.owner !== F || q.until <= army.time || !ordinary(F.rt, u) || q.order !== u.group.order) return null;
  // 退却の専用更新へ入ると濃さの巡回は止まるため、兵側でも今の段を確かめる。
  if (!fighting(F.rt, F.rt.def.frontlineDensity || DEFAULT)) return null;
  if (!q.spread) {
    if (q.foe) {
      if (!soldier(q.foe) || Math.hypot(q.foe.pos.x - army.playerUnit.pos.x, q.foe.pos.z - army.playerUnit.pos.z) > 35) return null;
      q.x = q.foe.pos.x; q.z = q.foe.pos.z;
    } else { q.x = army.playerUnit.pos.x; q.z = army.playerUnit.pos.z; }
  }
  return q;
}
