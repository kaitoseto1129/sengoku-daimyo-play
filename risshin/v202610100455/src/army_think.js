import { horseThreatTick, horseExhausted } from './horse_reality.js';
import { cavalryDismountTick } from './cavalry_tactics.js';
import { officerThink } from './officer.js';
import { weatherSees } from './weather_gameplay.js';
// Army の手法：兵一人の判断と行い（think・act・騎馬の突撃・槍衾）
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { TOFF, distToSeg, angleDiff, WOUND_FLOOR } from './units.js';
import { moraleThink, moraleAct } from './army_morale.js';
import { enduranceTick, reliefThink, reliefRows } from './army_endurance.js';
import { kickSpear } from './units_model.js';
import { signalWait } from './army_signals.js';
import { longYari, yariLineThink } from './yari_awase.js';
import { interiorShotClear } from './shironaka.js';
import { localClear, localPoint } from './army_local_way.js';
import { frontlineStep, frontlineMelee } from './frontline_density.js';
import { playerPressureTick } from './player_pressure.js';
import { S } from './settings.js';

// 束22：馬防柵（noCharge）。army.structs は多いので、noCharge を持つ物だけを1コマに一度だけ拾い直す
function nochargeFences(army) {
  const fences = army._nochargeCache || (army._nochargeCache = []);
  if (army._nochargeT === army.time) return fences;
  army._nochargeT = army.time; fences.length = 0;
  for (const s of army.structs || []) if (s.alive && !s.opened && s.noCharge && s.seg) fences.push(s);
  return fences;
}
// 防御区画の鉄砲は正面の射界を守る。組が向き直る途中も発砲しない。
function gunArcAllows(army, g, u, target) {
  if (!(g.fireArc > 0)) return true;
  if (g.gunTurnUntil > army.time) return false;
  const p = target.pos || target;
  return Math.abs(angleDiff(g.facing || 0, Math.atan2(p.x - u.pos.x, p.z - u.pos.z))) <= g.fireArc / 2;
}
// 一人へ矢玉を重ねず、ほかの射手は近い味方の兵へ狙いを分ける。
// 構え始めだけ調べる。射手の支度と弾込め、味方への一斉射は変えない。
function playerShotAllows(army, u, target) {
  if (!target.isPlayer || u.isPlayer || u.sidearm) return true;
  const gap = u.type === 'gun' ? 8 : 4;
  if ((u.group.playerAimAt ?? -99) + gap > army.time) return false;
  let aiming = 0;
  for (const o of army.units) {
    if (o === u || !o.alive || o.team !== u.team || o.fleeing || o.group?.routed) continue;
    if ((o.atk?.ranged || o.atk?.bow) && o.atk.target === target && ++aiming >= 2) return false;
  }
  return true;
}
// 騎馬が馬防柵の3m内にいるか（束22）
function nearNochargeFence(army, u) {
  const fences = nochargeFences(army);
  for (let i = 0; i < fences.length; i++) if (distToSeg(u.pos.x, u.pos.z, fences[i].seg) < 3) return true;
  return false;
}

// 突っ立ちの禁止：本人の六十歩ほどの内で、足も手も数秒止まった兵（騎馬・武将・旗持ちも）は、持ち場のまわりで
// 半歩〜一歩踏み直し、敵の方へ向き直る。騎馬は馬を小さく回して落ち着かせる。持ち場（home）からは離れない。
function millTick(army, u, dt, want) {
  const P = army.playerUnit, t = u.target;
  const M = u._mill || (u._mill = { t: 0, on: 0, st: 0, wait: 2.2 + (u.id % 7) * 0.3, x: 0, z: 0, y: 0, hx: u.pos.x, hz: u.pos.z, face: null });
  // 行き先があるのに人垣や柵で四秒進めない者も、その場で足を踏みかえて横へずれる（押し合いの揺れ）。
  const moved = Math.hypot(u.pos.x - (M.px ?? u.pos.x), u.pos.z - (M.pz ?? u.pos.z)); M.px = u.pos.x; M.pz = u.pos.z;
  M.st = want && want !== M && moved < 0.4 * dt ? M.st + dt : 0;
  const quiet = !u.isPlayer && P && (!want || M.on > 0 || M.st > 4) && !u.atk && !(u.swing && !u.swing.done) && !u.bind && !u.fleeing && !(u.stagger > 0) &&
    !u.reload && !u.climb && !u.downed && !u.perch && !u.duelW && !u.isStruct && !u.civ && u.type !== 'dummy' &&
    !(u.idl?.sit > 0.5) && !(u.woundRest > 0.5) && !(u.pinT > army.time) && !(army.duel && army.duel.foe === u) &&
    !u.group?.hidden && !u._crouch && !(t?.alive && !t.isStruct && Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) < 7) &&
    Math.abs(u.pos.x - P.pos.x) + Math.abs(u.pos.z - P.pos.z) < 90;
  if (!quiet) { M.t = 0; M.on = 0; return null; }
  if (M.st > 4) { M.st = 0; M.t = M.wait; M.hx = u.pos.x; M.hz = u.pos.z; }
  if (M.on > 0) {
    M.on -= dt;
    if (Math.hypot(M.x - u.pos.x, M.z - u.pos.z) > 0.2) return M;
    M.on = 0;
  }
  M.t += dt;
  if (M.t < M.wait) return null;
  M.t = 0; M.wait = 1.8 + Math.random() * 2.2;
  if (Math.hypot(M.hx - u.pos.x, M.hz - u.pos.z) > 3) { M.hx = u.pos.x; M.hz = u.pos.z; }
  const r = u.mounted ? 1.6 + Math.random() * 1.6 : 0.9 + Math.random() * 0.9, a = Math.random() * Math.PI * 2;
  localPoint(army, u, M, M.hx + Math.sin(a) * r, M.hz + Math.cos(a) * r);
  M.on = u.mounted ? 3.2 : 1.6;
  // 徒歩は敵（近くに無ければ組の向き）を見たまま足を運ぶ。騎馬は馬の向きごと変える。
  const foe = u.mounted ? null : t?.alive && !t.isStruct ? t : army.nearestEnemy(u, 40, o => !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 2);
  M.face = foe ? Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z) : u.mounted ? null : (u.group?._face ?? u.group?.facing ?? u.heading) + (Math.random() - 0.5) * 1.2;
  return M;
}

// Army の手法（units.js の class Army に足す）
// 名のある敵を囲む時の、組頭（本人）の側から見た回り込みの角（本人の正面は空け、左右・斜め後ろ・真後ろへ）
const RING_OFF = [-1.9, -0.95, 0.95, 1.9, Math.PI];
export const ArmyThink = {

  // 振り始める時だけ周りを調べる。横に味方・塀があれば長い槍を払わず、狭い所は突きと石突きで押し返す
  meleeKind(u, t, d) {
    const w = u.wpnKind || u.lookWeapon, g = u.group, r = Math.random();
    if (w === 'sword') {
      let kind = r < 0.32 ? 'kesa' : r < 0.56 ? 'gyaku' : r < 0.8 ? 'yoko' : 'tsuki';
      if (kind === u.lastMeleeKind) kind = kind === 'kesa' ? 'gyaku' : kind === 'gyaku' ? 'yoko' : kind === 'yoko' ? 'tsuki' : 'kesa';
      return kind;
    }
    if (w !== 'spear') return w === 'gun' || w === 'bow' ? 'butt' : 'thrust';
    if (u.mounted || t.isStruct) return 'thrust';
    // 組の槍は穂先をそろえて突く。長柄同士の叩き合いは従来どおり。
    if ((g.formation === 'line' || g.formation === 'yari') && !longYari(t) && d >= 1.25) return 'thrust';
    const back = g && (g.formation === 'line' || g.formation === 'yari') && u.aiRow > 0;
    const matching = longYari(u) && longYari(t) && !back && d >= 1.5;
    let sweep = !back, slam = !back;
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
    this.forNear(u.pos.x, u.pos.z, 2.8, (o) => {
      if (o === u || !o.alive || o.team !== u.team) return;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z;
      if (dx * dx + dz * dz > 7.84) return;
      const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (Math.abs(along) < 1.8 && side > 0.35) sweep = false;
      // 叩き槍は手元を上げて縦に振る。後列がいるだけでは禁じず、すぐ背の手元が重なる時だけ避ける。
      if (along < 0 && along > (matching ? -0.8 : -1.6) && side < 0.8) slam = false;
    });
    // 柵と塀のそばも大振りを避ける（形や材質は増やさない）
    if (sweep || slam) for (const s of this.structs) {
      if (s.alive && !s.opened && s.seg && distToSeg(u.pos.x, u.pos.z, s.seg) < 2.4) { sweep = slam = false; break; }
    }
    const close = d < 1.25;
    if (matching && slam) return r < 0.88 ? 'slam' : 'thrust';
    let kind = close ? 'butt' : r < 0.55 && slam ? 'slam' : r < 0.72 && sweep ? 'sweep' : 'thrust';
    // 同じ技を続けず、列の後ろでは突きを保つ。使える技が一つの時は無理に振り回さない
    if (kind === u.lastMeleeKind) {
      if (close) kind = 'thrust';
      else if (kind !== 'thrust') kind = 'thrust';
      else if (slam) kind = 'slam';
      else if (sweep) kind = 'sweep';
    }
    return kind;
  },

  think(u) {
    const g = u.group;
    u.pressBack = null; u.combatRetreat = false;
    if (this.duel && (u.duelW || u === this.duel.foe) && !u.fleeing && !g.routed) {
      u.target = u === this.duel.foe ? this.playerUnit : null;
      u.watch = null; return;
    }
    moraleThink(this, u);
    // 自分の組も、今の陣形と持ち場で前列・後列を決める。
    const ranked = !g.marching && (g.formation === 'line' || g.formation === 'yari');
    const cols = ranked ? g.layout(g.initial).cols : Math.max(1, g._stepCols || g.initial);
    u.aiRow = ranked ? Math.floor(u.slot / cols) : 0;
    // 槍の横の持ち場は判断の時に求め、毎コマの持ち場作成を増やさない。
    u.meleeSide = -(u.slot % cols - (cols - 1) / 2) * g.spacing;
    u.row = g.formation === 'yari' ? u.aiRow : 0;
    // 深手の無名兵は本陣の外へ後送。追いつかれれば身を守る（無敵にはしない）。
    if (u.rearWound) {
      if (u.fleeing || g.routed || u.rearWound.t <= this.time) u.rearWound = null;
      else {
        const near = this.nearestEnemy(u, 1.8, (o) => !this.wallBetween(u.pos, -1, o.pos));
        u.target = near; u.watch = null;
        u.moveTo = u.rearWound.to;
        if (!near) u.atk = null;
        return;
      }
    }
    // 手傷を負った武将：退いている間も、退いた後も戦わない（隊の奥に控える）。筋書きが invuln を解いたら元に戻す
    if (u.woundOut) {
      if (!u.invuln) { u.woundOut = null; u.noTarget = false; }
      else if (!u.fleeing && !g.routed) {
        u.target = null; u.atk = null; u.watch = null;
        if (u.woundOut.t > this.time) u.moveTo = u.woundOut.to;
        else { const f = g.forward(), s = g.slotPos(u.slot, g.initial); u.moveTo = localPoint(this, u, u.moralePoint, s.x - f.x * 10, s.z - f.z * 10); }
        return;
      }
    }
    // 旗本：手傷の武将の前に割って入り、打った者を迎える
    if (u.cover) {
      if (u.cover.t > this.time && !u.fleeing && !g.routed) {
        u.target = this.nearestEnemy(u, 2.6, (o) => !this.wallBetween(u.pos, -1, o.pos));
        u.watch = null;
        if (!u.target) { u.atk = null; u.moveTo = u.cover; }
        return;
      }
      u.cover = null;
    }
    // 手傷の武将に肩を貸して退く旗本：武将の左右 0.6m に付いて歩く（間近の敵だけは払う）。武将が退き終えれば元の持ち場へ
    if (u.escort) {
      const w = u.escort.u;
      const wound = w.woundOut || w.rearWound;
      if (w.alive && wound && wound.t > this.time && !u.fleeing && !w.fleeing && !g.routed) {
        const near = this.nearestEnemy(u, 1.8, (o) => !this.wallBetween(u.pos, -1, o.pos));
        if (near) { u.target = near; return; }
        const rx = Math.cos(w.heading), rz = -Math.sin(w.heading);
        u.target = null; u.atk = null; u.watch = null; u.confused = 0;
        u.moveTo = localPoint(this, u, u.moralePoint, w.pos.x + rx * 0.62 * u.escort.s, w.pos.z + rz * 0.62 * u.escort.s);
        u.aiT = Math.min(u.aiT, 0.12);
        return;
      }
      u.escort = null;
    }
    // 逃げる者は戦わない（混乱・一呼吸・深手の下がりより先に見る。崩れた隊がまた斬りかかって見えないように）
    if (u.fleeing) {
      u.target = null; u.atk = null; u.swing = null; u.bind = null; u.watch = null; u.charging = false; u.confused = 0;
      if (u.loopP) this.freeSama(u);
      if (g.fleePath?.length) {
        let i = u.fleePathIdx || 0;
        const path = g.fleePath;
        while (i < path.length - 1 && Math.hypot(u.pos.x - path[i][0], u.pos.z - path[i][1]) < 3) i++;
        u.fleePathIdx = i;
        u.moveTo = localPoint(this, u, u.moralePoint, path[i][0], path[i][1]);
        return;
      }
      const f = u.moraleFleeDir || g.fleeDir;
      // 逃げる向きは兵ごとに ±14° ほど違うが、走っている間は変えない（重ならないが、隊としてまとまって退く。散って他の隊と混ざらないように幅を狭めた）
      const a = ((u.id * 0.618) % 1 - 0.5) * 0.49, ca = Math.cos(a), sa = Math.sin(a);
      const ox = f.x * ca - f.z * sa, oz = f.z * ca + f.x * sa;
      const q = u.moralePoint;
      localPoint(this, u, q, u.pos.x + ox * 4, u.pos.z + oz * 4);
      u.moveTo = q;
      return;
    }
    // 崩れた隊で、まだ背を向けていない者（ほつれの遅れの間）：斬りかからず、前を向いたまま後ずさる
    if (g.routed) {
      u.target = null; u.atk = null; u.swing = null; u.bind = null; u.watch = null; u.charging = false;
      const q = u.moralePoint;
      q.x = u.pos.x - Math.sin(g.facing) * 2; q.z = u.pos.z - Math.cos(g.facing) * 2;
      u.moveTo = q;
      return;
    }
    // 浅瀬を渡る将と、実際に肩を並べる旗本。深みへ近道せず歩いて渡る。
    if (u.fordEscort?.active) {
      const e = u.fordEscort;
      const close = this.nearestEnemy(u, 1.8, (o) => !this.wallBetween(u.pos, -1, o.pos));
      u.target = close || null; u.watch = null;
      if (!close) {
        const home = g.slotPos(u.slot, g.initial);
        e.at.x = 2 + (e.lord?.alive ? e.side * 0.7 : 0);
        e.at.z = e.lord?.alive && Math.hypot(u.pos.x - e.lord.pos.x, u.pos.z - e.lord.pos.z) < 6 ? e.lord.pos.z - 0.8 : home.z;
        u.atk = null; u.moveTo = e.at;
      }
      return;
    }
    // 退き道を持つ列は、手の届く追手だけ支え、遠い敵へ戻らない。
    if (g.retreatOnly && g.order === 'path') {
      const close = this.nearestEnemy(u, 1.8, (o) => !this.wallBetween(u.pos, -1, o.pos));
      u.target = close || null; u.watch = null;
      if (!close) {
        u.atk = null; u.swing = null;
        const at = g.slotPos(u.slot, g.initial);
        u.moveTo = localPoint(this, u, u.moralePoint, at.x, at.z);
      }
      return;
    }
    // 倒れた馬の下敷き（horseShot）：抜け出すまで何もできない
    if (u.pinT > this.time || u.downed) { u.target = null; u.atk = null; u.swing = null; u.bind = null; u.moveTo = null; return; }
    // 合図を聞き分ける間は、前の歩みと持ち場を保つ。目の前の敵には応戦する。
    if (signalWait(this, g, u)) {
      const close = this.nearestEnemy(u, Math.max(1.8, Math.min(u.reach, 3)), (o) => !this.wallBetween(u.pos, u.team, o.pos));
      if (close) u.target = close;
      else if (u.target && (!u.target.alive || g.signalFrom === 'hold' || g.signalFrom === 'yari')) u.target = null;
      u.aiT = Math.min(u.aiT, 0.08);
      return;
    }
    if (g.pursuing && g.order === 'attack' && !u.dropped && !u.woundOut && !u.stdHeld && !u.stdPickup) {
      // 殿が届く所にいれば先に応戦。逃げる背は備の旗へ戻らず追う。
      const melee = u.sidearm || u.type !== 'gun' && u.type !== 'bow';
      const enemy = this.nearestEnemy(u, u.mounted ? 65 : 45, (o) =>
        weatherSees(this.world, u.pos, o.pos) && (!melee || !this.wallBetween(u.pos, u.team, o.pos)) &&
        (u.type !== 'gun' || !this.hiddenBehind(u, o)) && (!melee || this.crowdOk(u, o)));
      u.target = enemy || null; u.watch = null;
      if (enemy) { u.moveTo = null; return; }
    }
    // 落ちた隊旗を拾う者は、その場所まで歩く。逃げる時や目の前の敵への備えを優先する。
    if (u.stdPickup) {
      const close = this.nearestEnemy(u, 1.8, (o) => !this.wallBetween(u.pos, -1, o.pos));
      u.target = close || null; u.watch = null;
      if (!close) { u.atk = null; u.moveTo = u.stdPickup; }
      return;
    }
    if (!u.stdHeld && officerThink(this, u, g)) return;
    // 勝鬨（celebrate）：旗の下へ寄って輪になる（目の前の敵だけは払う）
    if (g.victory && this.time - g.victory.t < 14 && !u.isPlayer) {
      const near = this.nearestEnemy(u, 2.5, (o) => !o.fleeing && !this.wallBetween(u.pos, -1, o.pos));
      if (near) { u.target = near; return; }
      u.target = null; u.atk = null; u.watch = null;
      const V = g.victory;
      if (u === V.by) { u.moveTo = null; return; }
      const a = u.slot * 2.39996, r = 1.6 + Math.sqrt(u.slot + 1) * 0.75;
      u.moveTo = localPoint(this, u, u.walkPoint || (u.walkPoint = { x: 0, z: 0 }), V.at.x + Math.sin(a) * r, V.at.z + Math.cos(a) * r);
      return;
    }
    if (u.pauseT > this.time && !u.fleeing) {
      const near = this.nearestEnemy(u, Math.max(1.8, Math.min(u.reach, 3.5)), (o) => !o.fleeing && !this.wallBetween(u.pos, u.team, o.pos));
      u.target = near || null; if (!near) u.moveTo = null;
      return;
    }
    if (u.confused > 0) {
      // 部隊長を失った混乱：隊旗の下へ集まろうとして詰まる（旗が無ければ、あてもなく歩く）。行き先はたまにしか変えない
      const fb = g.units.find((o) => o.alive && o.stdHeld && o !== u) || g.units.find((o) => o.alive && o.banner && o !== u);
      if (!u.moveTo || Math.hypot(u.moveTo.x - u.pos.x, u.moveTo.z - u.pos.z) < 1 || Math.random() < 0.05) {
        const x = fb ? fb.pos.x : u.pos.x, z = fb ? fb.pos.z : u.pos.z, spread = fb ? 3 : 6;
        u.moveTo = localPoint(this, u, u.walkPoint || (u.walkPoint = { x: 0, z: 0 }), x + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread);
      }
      // 混乱していても、目の前（3m）に来た敵には身を守って打ち返す（すぐそばで棒立ちにしない）
      const close = this.nearestEnemy(u, 3, (o) => !o.fleeing && !this.wallBetween(u.pos, -1, o.pos));
      u.target = close || null;
      return;
    }
    if (g.regroupT > 0) {
      // 立て直し：はっきり退いて旗の下に集まり直す（持ち場を 10m 後ろへ詰めた形に並び直す）。その間は斬りかからない
      //   （ただし、すぐそば（2.6m）に付いてきた敵とは打ち合いながら下がる）
      const close = this.nearestEnemy(u, Math.max(2.6, Math.min(u.reach, 3.5)), (o) => !o.fleeing && !this.wallBetween(u.pos, u.team, o.pos));
      const f = g.forward(), sp = g.slotPos(u.slot, g.initial), c = g.anchor;
      u.target = close || null; u.watch = null; u.combatRetreat = true;
      if (!close) u.atk = null;
      const q = u.moralePoint;
      localPoint(this, u, q, c.x + (sp.x - c.x) * 0.6 - f.x * 10, c.z + (sp.z - c.z) * 0.6 - f.z * 10);
      u.moveTo = q;
      return;
    }
    // 走って列を横切る本人も、近い兵が先に迎える。逃亡・手傷・護衛の判断は先に守る。
    const player = this.playerUnit;
    if (this.world.def.closeCombatAssist && player?.alive && player.team !== u.team && !player.noTarget &&
        !u.fleeing && !g.routed && !u.dropped && !u.stdHeld && u.type !== 'bow' && u.type !== 'gun' &&
        Math.abs(player.pos.y - u.pos.y) < 1.8 && Math.hypot(player.pos.x - u.pos.x, player.pos.z - u.pos.z) <= 4 &&
        !this.wallBetween(u.pos, u.team, player.pos, (u.wpnKind || u.lookWeapon) === 'spear')) {
      u.target = player; u.watch = null; return;
    }
    // 前線の小勢は自分の足で寄せる。囲みの外側は少し退いて列を立て直す。
    const front = frontlineStep(this, u);
    if (front && !u.atk && !u.swing && !u.bind) {
      const close = this.nearestEnemy(u, front.spread ? 1.8 : 3.5, (o) => !o.fleeing && (!front.foe || !o.isPlayer) && this.crowdOk(u, o) && !this.wallBetween(u.pos, -1, o.pos));
      u.target = close || null; u.watch = null;
      if (!close) { u.atk = null; u.moveTo = localPoint(this, u, u.moralePoint, front.x + (front.foe ? (u.slot % 5 - 2) * 1.3 : 0), front.z); }
      return;
    }
    // 大将が伏兵を待たせる・退かせる・横へ回す間は、各兵も隊を離れて追わない。
    // 明示した下知・指定の敵・城攻めを優先。目の前の敵には身を守る。
    const A = g._ai;
    if (A && !g.noAI && !g.siegeAI && !g.focus && !g.isPlayerSquad &&
      (g.order === 'hold' || g.order === 'yari' || g.order === 'attack') &&
      (A.ambushWait || A.discipline && (A.mode === 'withdraw' || A.mode === 'rally' || A.mode === 'flank'))) {
      // 回り込み中も槍の届く相手には応戦する。塀越しの相手は追わない。
      const close = this.nearestEnemy(u, 3.5, (o) => !this.wallBetween(u.pos, -1, o.pos));
      u.target = close || null; u.watch = null;
      u.combatRetreat = A.mode === 'withdraw' || A.mode === 'rally';
      if (u.combatRetreat) u.moveTo = g.slotPos(u.slot, g.initial);
      if (!close) {
        u.atk = null; u.moveTo = g.slotPos(u.slot, g.initial);
        // 隊の中心が通れても端の兵が柵に掛かることがある。回り込み中は、
        // 立ち位置までの道を塞ぐ敵の柵を打ち破る（退く時や壊せない塀は除く）。
        if (A.mode === 'flank') {
          const wall = this.wallAt(u.pos, u.team, u.moveTo);
          if (wall && !wall.opened && !wall.noTarget && wall.maxHp < 1e8) u.target = wall;
        }
      }
      return;
    }
    // 前へ出た武将の左右後ろへ旗が集まり、手の空いた兵も押し出す。
    const chief = g.commanderPush;
    if (chief && chief !== u && chief.alive && !chief.fleeing && !chief.woundOut && g.commanderPushUntil > this.time &&
      !g.routed && !g.focus && !g.isPlayerSquad && (g.order === 'attack' || g.order === 'move') &&
      !u.isPlayer && !u.name && !u.mounted && u.type !== 'busho' && u.type !== 'gun' && u.type !== 'bow' &&
      Math.hypot(u.pos.x - chief.pos.x, u.pos.z - chief.pos.z) < 35) {
      const close = this.nearestEnemy(u, u.stdHeld ? 1.8 : 4, (o) => !this.wallBetween(u.pos, -1, o.pos));
      if (!close && !u.atk && !u.swing) {
        const q = u.stdHeld ? u._stdMove : u.moralePoint, h = chief.group._face ?? chief.group.facing;
        const side = (u.id % 5 - 2) * 1.8, back = u.stdHeld ? 4 : 2 + u.id % 3;
        q.x = chief.pos.x + Math.cos(h) * side - Math.sin(h) * back;
        q.z = chief.pos.z - Math.sin(h) * side - Math.cos(h) * back;
        u.target = null; u.watch = null; u.moveTo = q;
        return;
      }
    }
    // 旗持ちは敵を追わず備に付く。移動・退却・城攻めの行き先は元の号令どおり。
    if (u.stdHeld && !u.isPlayer && u.type !== 'busho' && !u.name) {
      const close = this.nearestEnemy(u, 1.8, (o) => !this.wallBetween(u.pos, -1, o.pos));
      u.target = close || null; u.watch = null;
      if (close) return;
      u.atk = null;
      const home = g.slotPos(u.slot, g.initial), q = u._stdMove;
      q.x = home.x; q.z = home.z;
      if (g.isPlayerSquad && g.order === 'attack' && this.playerUnit?.alive) {
        // 組の旗は古い持ち場に残さず、前進する組頭の後ろへ運ぶ。
        const p = this.playerUnit, back = p.mounted ? 6 : 3;
        q.x = p.pos.x - Math.sin(p.heading) * back;
        q.z = p.pos.z - Math.cos(p.heading) * back;
      } else if ((g.order === 'attack' || this.frontlineDensity?.on && g.frontlineMeleeUntil > this.time) && !g.isPlayerSquad && !g.marching) {
        // 指定した敵へ向かう隊の旗も、進む仲間の後ろに付く。
        let x = 0, z = 0, n = 0;
        for (const o of g.units) if (o.alive && !o.stdHeld && !o.fleeing && !o.rearWound && !o.woundOut && !o.dropped && g.units.some(a => a !== o && a.alive && !a.fleeing && !a.woundOut && !a.rearWound && Math.abs(a.pos.y - o.pos.y) < 1.8 && Math.hypot(a.pos.x - o.pos.x, a.pos.z - o.pos.z) < 6 && !this.wallBetween(a.pos, -1, o.pos)) && ((g.focus && g.focus.alive) || (o.target && o.target.alive && !o.target.isStruct))) {
          x += o.pos.x; z += o.pos.z; n++;
        }
        if (n) {
          const h = g._face ?? g.facing;
          // 元気な備は前線のすぐ後ろへ、押された備は後ろへ旗を下げる。
          const back = g.morale < 55 ? 7 : 3;
          q.x = x / n - Math.sin(h) * back;
          q.z = z / n - Math.cos(h) * back;
        }
      }
      u.moveTo = q;
      return;
    }
    if (reliefThink(this, u)) return;
    // 深手の者は一度だけ隊の後ろへ下がり、しばらく息をつく（後ろの元気な者と持ち場を替わる）
    // （自分の組も同じ：深手の者は後ろの元気な者と替わる）
    if (!u.isPlayer && !u.name && !u.stdHeld && u !== g.leader && u.type !== 'busho' && !u.mounted && u.type !== 'cavalry' && u.hp < u.maxHp * 0.25 && !u.backDone && g.count >= 5 && (g.order === 'hold' || g.order === 'attack' || g.order === 'yari' || g.order === 'follow')) {
      u.backDone = true; u.backT = this.time + 8 + Math.random() * 4;
      const { cols } = g.layout(g.initial);
      if (u.slot < cols && !g.isGun && !(g.cavShare > 0.1)) {
        let best = null, bestScore = Infinity;
        for (const o of g.units) if (o !== u && o.alive && !o.fleeing && !o.isPlayer && o.slot >= cols && !o.name && o !== g.leader && !o.stdHeld && !o.mounted && !o.woundOut && !o.rearWound && !o.climb && !o.perch && !o.atk && !o.swing && !o.bind && o.type !== 'gun' && o.type !== 'bow' && o.type !== 'porter' && o.hp > o.maxHp * 0.6 && !o.dropped && !o.downed && !(o.pinT > this.time) && !(o.stagger > 0) && Math.abs(o.pos.y - u.pos.y) < 1.8 && localClear(this, u.pos, o.pos)) {
          const score = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) + (o.slot % cols === u.slot % cols ? 0 : 12);
          if (score < 24 && (!best || score < bestScore)) { best = o; bestScore = score; }
        }
        if (best) { const s0 = u.slot; u.slot = best.slot; best.slot = s0; reliefRows(g, u, best); }
      }
    }
    if (u.backT > this.time) {
      const near = this.nearestEnemy(u, 2, (o) => !this.wallBetween(u.pos, -1, o.pos));
      if (near) { u.target = near; return; }
      const f = g.forward(), c = g.center();
      u.target = null; u.atk = null; u.watch = null;
      u.moveTo = localPoint(this, u, u.moralePoint, c.x - f.x * 6, c.z - f.z * 6);
      return;
    }
    // 守る隊（g.guard）の大将：敵に気づいたら旗本の後ろへ下がる（間近に来た敵だけを払う）
    if (g.guardOn && u === g.leader && u.type === 'busho' && g.count > 3 && (g.order === 'hold' || g.order === 'yari')) {
      const near = this.nearestEnemy(u, 2.6, (o) => !this.wallBetween(u.pos, -1, o.pos));
      if (near) { u.target = near; return; }
      u.target = null; u.watch = null;
      const f = g.forward(), s = g.slotPos(u.slot, g.initial);
      // 円陣（ai.js）の間は、輪の真ん中に立つ
      u.atk = null;
      u.moveTo = localPoint(this, u, u.moralePoint, g.formation === 'ring' ? g.anchor.x : s.x - f.x * 7, g.formation === 'ring' ? g.anchor.z : s.z - f.z * 7);
      return;
    }
    // 名のある武将（味方は誰でも、敵は大名・名将＝u.isLord だけ。本陣を守る隊＝guardOn は除く）：
    //   隊が斬り合っている間は突っ立たず、斬り合う兵の少し後ろへ馬を進めて下知する。間近の敵には刀を抜く
    // 自ら門を破る下知の将は、野戦の「旗本の後ろへ退く」判断で門攻めを止めない。
    if (!TOFF && (g.team === 0 || u.isLord) && u === g.leader && u.type === 'busho' && u.name && !g.guardOn && !g.isPlayerSquad && g.count > 3 && !u.fleeing && g.order !== 'retreat' && !(g.order === 'assault' && g.leaderAssault)) {
      // 危ない時（深手・三人より多くの敵に寄られた）は、隊の後ろ（8m）へ下がって下知を続ける。すぐそば（1.8m）の敵だけは払う
      // 大名・名将は、本人（遊び手）が間近（6m）へ寄っただけでも退く：自分から斬り合いに出ない
      let crowd = 0;
      this.forNear(u.pos.x, u.pos.z, 5, (o) => { if (o.alive && o.team !== u.team && !o.fleeing && o.type !== 'dummy') crowd++; });
      const P = this.playerUnit;
      const playerNear = u.isLord && P && P.alive && P.team !== u.team && Math.hypot(P.pos.x - u.pos.x, P.pos.z - u.pos.z) < 6;
      // 道を進む下知では隊列を優先する。近い敵を見て後ろへ戻ると、退く旗本の輪から大将だけが取り残される。
      if (g.order !== 'path' && g.order !== 'move' && (u.hp < u.maxHp * 0.45 || crowd >= 3 || playerNear)) {
        const close = this.nearestEnemy(u, 1.8, (o) => !this.wallBetween(u.pos, -1, o.pos));
        if (close) { u.target = close; return; }
        const f = g.forward(), c = g.center();
        u.target = null; u.atk = null; u.watch = null;
        u.moveTo = localPoint(this, u, u.moralePoint, c.x - f.x * 8, c.z - f.z * 8);
        if (!(u.backSayT > this.time) && this.hooks.onGeneralBack) { u.backSayT = this.time + 20; this.hooks.onGeneralBack(u); }
        return;
      }
      const near = this.nearestEnemy(u, u.mounted ? 3.4 : 2.6, (o) => !this.wallBetween(u.pos, -1, o.pos));
      if (near) { u.target = near; return; }
      // 自分を狙って寄ってくる敵（7m 内）と、隊が減って前に立つ兵が少ない時の近い敵（6m 内）には、自ら刀を抜いて迎える
      const hunter = this.nearestEnemy(u, 7, (o) => o.target === u && !o.fleeing && !this.wallBetween(u.pos, -1, o.pos));
      if (hunter) { u.target = hunter; return; }
      let guards = 0;
      for (const o of g.units) if (o !== u && o.alive && !o.fleeing && !o.woundOut && !o.rearWound && !o.dropped && !o.downed && !(o.pinT > this.time) && localClear(this, u.pos, o.pos) && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 12) guards++;
      if (guards <= 2 && g.order !== 'path' && g.order !== 'move') {
        const f = g.forward(); u.target = null; u.atk = null;
        u.moveTo = localPoint(this, u, u.moralePoint, g.anchor.x - f.x * 8, g.anchor.z - f.z * 8); return;
      }
      if (guards <= 5) { const n6 = this.nearestEnemy(u, 6, (o) => !o.fleeing && !this.wallBetween(u.pos, -1, o.pos)); if (n6) { u.target = n6; return; } }
      // 行軍中は古い戦場で撃ち続ける兵の後ろへ戻らず、下知された隊列を追う。
      if (!(u.target && u.target.alive) && g.order !== 'path' && g.order !== 'move') {
        let cx = 0, cz = 0, k = 0;
        for (const o of g.units) if (o !== u && o.alive && o.target && o.target.alive && !o.target.isStruct) { cx += o.pos.x; cz += o.pos.z; k++; }
        if (k >= 2) {
          const f = g.forward();
          u.target = null;
          u.moveTo = localPoint(this, u, u.moralePoint, cx / k - f.x * 3.5, cz / k - f.z * 3.5);
          // ときどき采配を振り、敵の方を向いて下知する（数秒に一度。突っ立ったままに見せない）
          if (!(u.cheerT > this.time)) { u.cheerT = this.time + 4 + Math.random() * 5; u.cheer = 1; }
          return;
        }
        // 隊が敵に寄っていく間（進む・攻める）は、兵の群れの中ほどを一緒に進む（取り残されて立ち尽くさない）
        if ((g.order === 'attack' || g.order === 'assault') && g.count > 3) {
          const c = g.center(), f = g.forward();
          if (Math.hypot(u.pos.x - c.x, u.pos.z - c.z) > 9) { u.target = null; u.moveTo = localPoint(this, u, u.moralePoint, c.x - f.x * 2.5, c.z - f.z * 2.5); return; }
        }
      }
    }
    let engage;
    // 徒歩の兵が備を離れて一人で深追いしたら旗へ戻る。指定の敵・騎馬・城攻めは元の判断を守る。
    if (g.order === 'attack' && !g.focus && !g.isPlayerSquad && !u.mounted && u.type !== 'busho' && u.type !== 'gun' && u.type !== 'bow') {
      const fb = g.units.find((o) => o.alive && o.stdHeld && !o.fleeing);
      if (fb && Math.hypot(u.pos.x - fb.pos.x, u.pos.z - fb.pos.z) > Math.max(24, g.halfWidth() * 2 + 8)) {
        const close = this.nearestEnemy(u, 2.6, (o) => !this.wallBetween(u.pos, -1, o.pos));
        u.target = close || null;
        if (!close) { u.moveTo = fb.pos; u.watch = null; }
        return;
      }
    }
    switch (g.order) {
      case 'attack': engage = g.seekRange; break;
      case 'retreat': engage = 1.8; break;
      case 'path': engage = g.aggro * 0.6; break;
      case 'move': engage = Math.min(g.aggro, 6); break;
      case 'follow': engage = g.aggro; break;
      case 'assault': engage = 4.5; break;
      default: engage = g.aggro;
    }
    if (!u.sidearm && (u.type === 'bow' || u.type === 'gun') && g.fire !== false && g.order !== 'retreat') engage = Math.max(engage, u.range * (u.type === 'bow' ? 1 - 0.35 * (this.rain || 0) : 1));
    if (!u.sidearm && (u.type === 'bow' || u.type === 'gun') && g.fire === false) engage = Math.min(engage, 3);
    // 持ち場を守る弓は、届く間合いの外（60m まで）の敵へも遠矢を射かける（開戦の矢合わせ）
    if (u.type === 'bow' && !u.sidearm && g.fire !== false && (g.order === 'hold' || g.order === 'yari') && !(this.rain > 0.5)) engage = Math.max(engage, 58);
    // 横陣の後ろの段は列に残る：打ち合うのは前の段、二段目はすぐ前の敵だけ、三段目より後ろは目の前に来た敵だけ（一騎打ちの集まりにしない）
    if (u.type !== 'bow' && u.type !== 'gun' && u.type !== 'cavalry' && (g.formation === 'line' || g.formation === 'yari') && !g.marching && (g.order === 'hold' || g.order === 'yari' || g.order === 'attack' || g.order === 'follow')) {
      const row = u.aiRow;
      if (row >= 1 && !frontlineMelee(this, u)) engage = Math.min(engage, row === 1 ? 6 : 3);
    }
    // 「敵を狙え」の指定目標
    if (g.focus && g.focus.alive && !g.focus.noTarget && !g.focus.opened && g.focus.team !== u.team && g.order !== 'retreat') {
      const fp = this.targetPoint(g.focus, u);
      const d = this.distTo(u, g.focus);
      // 指定した敵が柵の向こうでも、手前で迫る敵には先に応戦する。
      const meleeFocus = (u.type !== 'gun' && u.type !== 'bow') || u.sidearm;
      const near = this.nearestEnemy(u, 3.5, (o) => !this.wallBetween(u.pos, u.team, o.pos));
      if (near) { u.target = near; u.watch = null; return; }
      if (d < 60 && weatherSees(this.world, u.pos, fp) && (meleeFocus ? (g.focus.isStruct || !this.wallBetween(u.pos, u.team, fp)) : (u.type !== 'gun' || !this.hiddenBehind(u, g.focus) && !this.shotBlocked(u, fp) && (g.focus.isStruct || !this.terrainBlocks(u.pos, g.focus.pos))) && (g.focus.isStruct || interiorShotClear(u, g.focus)))) {
        u.target = g.focus;
        return;
      }
      // 指定の敵は、遠さや見通しで狙いが付かなくても歩いて寄る。
      // 味方の組も同じ。見通しが悪い時に古い持ち場へ戻ると、城の道から外れて止まる。
      if (g.order === 'attack') {
        u.target = null; u.watch = null;
        const q = u.moralePoint;
        q.x = fp.x; q.z = fp.z;
        const via = this.doorVia && !u.mounted && !g.focus.isStruct ? this.viaDoor(u, q) : null;
        if (via) { q.x = via.x; q.z = via.z; }
        u.moveTo = q;
        return;
      }
    } else if (g.focus && (!g.focus.alive || g.focus.opened || g.focus.noTarget || g.focus.team === u.team)) {
      g.focus = null;
      if (g.isPlayerSquad && this.hooks.onFocusDone) this.hooks.onFocusDone(g);
    }
    // 長柄が向かい合う所は列を優先する。刀の侍は、叩き合いで開いた所へ踏み込む。
    if (yariLineThink(this, u, engage)) return;
    // 自分の組は、組頭（プレイヤー）に斬りかかる敵を優先して迎え撃つ
    // 本人が囲まれている（二人より多くに狙われている）時は、20m 先からでも駆け寄って、本人に打ちかかる敵の背を突く
    if (g.isPlayerSquad && (g.order === 'follow' || g.order === 'hold' || g.order === 'attack') && this.playerUnit && this.playerUnit.alive) {
      const pu = this.playerUnit;
      const dp = Math.hypot(pu.pos.x - u.pos.x, pu.pos.z - u.pos.z);
      let press = 0;
      for (const o of this.threats || []) if (o.alive && (o.sidearm || o.type !== 'gun' && o.type !== 'bow') && Math.hypot(o.pos.x - pu.pos.x, o.pos.z - pu.pos.z) < 6 && localClear(this, pu.pos, o.pos)) press++;
      if (dp < (press >= 2 ? 20 : 14)) {
        // まず振りかぶっている敵（threats）から、次に本人を狙う敵を
        let foe = null, fd = 1e9;
        for (const o of this.threats || []) { if (!o.alive || o.team === u.team || (!o.sidearm && (o.type === 'gun' || o.type === 'bow')) || Math.hypot(o.pos.x - pu.pos.x, o.pos.z - pu.pos.z) > 6 || !localClear(this, u.pos, o.pos)) continue;
          let assigned = 0; for (const a of g.units) if (a !== u && a.alive && !a.fleeing && a.target === o) assigned++;
          const home = g.slotPos(u.slot, g.initial);
          const d = Math.hypot(o.pos.x - home.x, o.pos.z - home.z) + assigned * 8; if (d < fd) { fd = d; foe = o; } }
        if (!foe) foe = this.nearestEnemy(pu, 6, (o) => (o.sidearm || o.type !== 'gun' && o.type !== 'bow') && (o.target === pu || (o.atk && o.atk.target === pu)) && localClear(this, u.pos, o.pos) && !g.units.some(a => a !== u && a.alive && !a.fleeing && a.target === o));
        if (foe) { u.target = foe; return; }
      }
      // 本人を狙う鉄砲・弓（30m 内）がいれば、ついて来い・かかれの間は、槍・刀の者のうち二人が駆けて行って黙らせる
      if (g.order !== 'hold' && u.type !== 'bow' && u.type !== 'gun' && !u.mounted && dp < 25) {
        const sh = this.nearestEnemy(pu, 30, (o) => (o.type === 'gun' || o.type === 'bow') && (o.target === pu || (o.atk && o.atk.target === pu)) && !this.wallBetween(u.pos, u.team, o.pos));
        if (sh) {
          let n = 0;
          for (const o of g.units) if (o !== u && o.alive && o.target === sh) n++;
          if (n < 2 || u.target === sh) { u.target = sh; return; }
        }
      }
    }

    let t = null;
    // 槍・刀の者は、塀・柵の向こうで届かない敵を狙わない（弓・鉄砲は越えて撃てる）
    const melee = u.sidearm || u.type !== 'bow' && u.type !== 'gun';
    // 自分の組の槍・刀の者は、近く（持ち場から届く所）に名のある敵（武将・侍大将）がいれば、四人まで寄ってたかって囲む
    if (g.isPlayerSquad && melee && engage > 0 && g.order !== 'retreat' && !u.mounted) {
      const boss = this.nearestEnemy(u, engage + 4, (o) => !!o.name && !o.fleeing && (o.type === 'busho' || o.type === 'samurai') && !this.wallBetween(u.pos, u.team, o.pos));
      if (boss) {
        let n = 0;
        this.forNear(boss.pos.x, boss.pos.z, 8, (o) => { if (o !== u && o.alive && o.team === u.team && !o.fleeing && !o.woundOut && !o.rearWound && o.target === boss && localClear(this, boss.pos, o.pos)) n++; });
        if (n < 4) { u.target = boss; u.watch = null; return; }
      }
    }
    // 鉄砲は、塀の向こうで見えない者（狭間にも塀の上にもいない者）を狙わない
    // 攻める徒歩も近くの敗走兵を追う。持ち場を守る隊は隊列の範囲を越えない。
    const ok = (o) => (!melee || !this.wallBetween(u.pos, u.team, o.pos, (u.wpnKind || u.lookWeapon || u.weapon) === 'spear')) && (u.type !== 'gun' || !this.hiddenBehind(u, o))
      && (u.type !== 'gun' || u.sidearm || !o.isPlayer || this.time >= 12 + (u.id % 5) * 0.7)
      && (melee || interiorShotClear(u, o) && playerShotAllows(this, u, o))
      && (!o.fleeing || u.type === 'cavalry' || u.mounted || g.isPlayerSquad || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < (g.order === 'attack' ? 14 : 5))
      && (!melee || this.crowdOk(u, o));
    // 持ち場から外れても、槍の届く相手には応戦する。
    // 本人への同時攻撃数は act 側で制限し、余る兵も向き直って機をうかがう。
    if (melee && engage > 0) t = this.nearestEnemy(u, Math.min(engage, 3.5), ok);
    if (!t && (g.order === 'hold' || g.order === 'follow' || g.order === 'yari')) {
      // 持ち場から離れすぎない
      const home = g.slotPos(u.slot, g.initial);
      t = this.nearestEnemy(u, engage, (o) => Math.hypot(o.pos.x - home.x, o.pos.z - home.z) < engage + 2 && ok(o));
    } else if (!t && engage > 0) {
      t = this.nearestEnemy(u, engage, ok);
      // 届く敵がいない時も、閉じた塀の内の敵を追わない。門攻めは assault の下知で扱う。
    }
    if (t) { u.target = t; u.watch = null; return; }
    // 火矢の弓（g.fireArrows）：射る敵がいなければ、射程の内の敵方の柵・門・小屋へ火矢を射込む
    if (u.type === 'bow' && !u.sidearm && g.order !== 'retreat' && g.fireArrows && g.fire !== false) {
      let st = null, sd = u.range * 1.4;
      for (const s of this.structs) {
        if (!s.alive || s.opened || s.noTarget || s.team === u.team || s.maxHp > 1e8 || s.fireF || s.fireProof) continue;
        const d = this.distTo(u, s);
        if (d < sd) { sd = d; st = s; }
      }
      if (st) { u.target = st; u.watch = null; return; }
    }
    u.target = null;
    // 持ち場を守る者は、少し先（30m 以内）の敵を見張る（そちらへ体を向ける）
    if (g.order === 'hold' || g.order === 'yari' || g.order === 'attack' || g.order === 'follow') {
      if (!(u.watchT > this.time) || (u.watch && !u.watch.alive)) { u.watch = this.nearestEnemy(u, 30, (o) => !this.wallBetween(u.pos, -1, o.pos)); u.watchT = this.time + 1 + Math.random(); }
    } else u.watch = null;
    if (g.order === 'assault' && g.assault) {
      const st = g.assault(u);
      if (st && st.isStruct && st.alive && !st.opened && !st.noTarget && st.team !== u.team && st.maxHp < 1e8) { u.target = st; return; }
      // 柵ごしの目の前（3.2m）に遊び手がいれば、その前の柵を打ち破りにかかる（柵の外で棒立ちにしない）
      if (st && !st.isStruct) {
        const pf = this.playerUnit;
        if (pf && pf.alive && pf.team !== u.team && Math.hypot(pf.pos.x - u.pos.x, pf.pos.z - u.pos.z) < 3.2) { const ws = this.wallAt(u.pos, u.team, pf.pos); if (ws && !ws.noTarget && ws.maxHp < 1e8) { u.target = ws; return; } }
        u.moveTo = st; return;
      }
    }
    // 狭間・柵ぎわで撃っていた者は、しばらくそこに留まる（敵が見えなくなるたびに持ち場へ戻らない）
    if (u.loopP && g.order === 'hold' && u.loopT > this.time - 8) { u.moveTo = u.loopP; return; }
    if (u.loopP) this.freeSama(u);
    // 開く途中：後ろの者は、先の者が開くまで少し待ってから持ち場へ（全員が一度に動かない）
    if (g._deployT > this.time - 3 && this.time - g._deployT < (u.slot / Math.max(1, g.initial)) * 2.4) { u.moveTo = null; return; }
    // 自分の組が「かかれ」のまま討つ敵がいない時は、その場で立ち尽くさず組頭（遊び手）の後ろへ寄って次を待つ
    const P = this.playerUnit;
    // 馬上の組頭の時も同じ（馬の後ろ足に掛からないよう、少し後ろへ）
    if (g.isPlayerSquad && g.order === 'attack' && P && P.alive) {
      const sp = g.slotPos(u.slot, g.initial), a = g.anchor, bk = P.mounted ? 6 : 3;
      const q = u.moralePoint;
      q.x = P.pos.x + (sp.x - a.x) - Math.sin(P.heading) * bk; q.z = P.pos.z + (sp.z - a.z) - Math.cos(P.heading) * bk;
      // 近くでも同じ持ち場へ寄る。古い要へ戻すと二つの行き先の間で止まる。
      u.moveTo = localPoint(this, u, q, q.x, q.z); return;
    }
    // 押し合いの後ろの段：前の段が斬り合っている間は、同じ列の前の者の背（1m 後ろ）につき、槍を立てて押す（u.pressBack）
    u.pressBack = null;
    if (melee && u.type !== 'cavalry' && !u.mounted && !g.isPlayerSquad && !g.isGun && !(g.cavShare > 0.1) && g.formation === 'line' && !g.marching
      && (g.order === 'hold' || g.order === 'attack') && g._wasEng && this.time - g._wasEng < 3) {
      const { cols } = g.layout(g.initial);
      if (u.slot >= cols) {
        const fr = g.units.find((o) => o.slot === u.slot - cols);
        if (fr && fr.alive && !fr.fleeing && fr.target && fr.target.alive && !fr.target.isStruct) {
          const f = g.forward();
          u.pressBack = fr;
          u.moveTo = localPoint(this, u, u.moralePoint, fr.pos.x - f.x * 1.05, fr.pos.z - f.z * 1.05);
          return;
        }
      }
    }
    const home = g.slotPos(u.slot, g.initial);
    // 組の持ち場が畦や列の向こうでも、通れる足場を小刻みに歩く。
    u.moveTo = g.isPlayerSquad && g.order === 'follow'
      && this.world.def.battleKey !== 'shigisan' ? localPoint(this, u, u.moralePoint, home.x, home.z) : home;
  },

  // 乱戦すぎ対策：徒歩の槍・刀は、一つの的に一度に斬りかかれる人数を前線の幅ぶんに絞る（既に本人が狙っている的は数えない）。
  // 囲まれる迫力は残すため、的ごとに3人（正面＋両脇）までは許す。溢れた分は列を保って待つ（think の末尾の pressBack・slotPos）
  // 戦の側の doorVia（建物の口をたどる道）を、一人ずつ 0.4 秒に一度だけ聞く
  viaDoor(u, to) {
    if (!(u.doorT > this.time)) { u.doorT = this.time + 0.4; u.doorPt = this.doorVia(u, to); }
    return u.doorPt;
  },

  crowdOk(u, o) {
    if (o.isStruct || o.isPlayer || u.target === o || u.type === 'cavalry' || u.mounted) return true;
    let n = 0;
    this.forNear(o.pos.x, o.pos.z, 6, (x) => { if (x.alive && x.team === u.team && x !== u && !x.fleeing && !x.woundOut && !x.rearWound && !x.dropped && x.target === o && Math.hypot(x.pos.x - o.pos.x, x.pos.z - o.pos.z) < Math.max(1.6, Math.min(6, x.reach + 0.5)) && Math.abs(x.pos.y - o.pos.y) < 1.8 && !this.wallBetween(x.pos, -1, o.pos)) n++; });
    return n < 3;
  },

  distTo(u, t) {
    if (t.isStruct) {
      if (t.seg) return distToSeg(u.pos.x, u.pos.z, t.seg) - 0.2;
      return Math.hypot(t.x - u.pos.x, t.z - u.pos.z) - (t.r || 1);
    }
    return Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
  },

  targetPoint(t, u = null, out = null) {
    const p = out || { x: 0, z: 0 };
    if (t.isStruct) {
      if (t.seg) {
        const s = t.seg, dx = s[2] - s[0], dz = s[3] - s[1];
        const k = u ? Math.max(0, Math.min(1, ((u.pos.x - s[0]) * dx + (u.pos.z - s[1]) * dz) / (dx * dx + dz * dz || 1))) : 0.5;
        p.x = s[0] + dx * k; p.z = s[1] + dz * k;
      } else { p.x = t.x; p.z = t.z; }
    } else { p.x = t.pos.x; p.z = t.pos.z; }
    return p;
  },
  faceTo(u, t) { const p = this.targetPoint(t, u, u._facePoint || (u._facePoint = { x: 0, z: 0 })); return Math.atan2(p.x - u.pos.x, p.z - u.pos.z); },

  // 向きを変える：なめらかに、ただし一度に回れる速さ（rad/s）には限りがある
  turn(u, h, dt, rate) {
    const d = angleDiff(u.heading, h);
    const winding = u.atk && !u.atk.gun && !u.atk.bow;
    const tracking = winding && u.atk.target?.isPlayer && this.world.def.closeCombatAssist;
    const cap = (winding ? Math.min(rate, tracking ? 3 : (u.wpnKind || u.lookWeapon) === 'spear' ? 0.85 : 1.4) : rate) * dt;
    u.heading += Math.max(-cap, Math.min(cap, d * Math.min(1, dt * 6)));
  },

  // 騎馬：助走をつけて突っ込み、当てたら駆け抜けて離れ、向きを変えてまた寄せる
  cavalryHome(u) {
    const q = u._cvHome || (u._cvHome = { x: 0, z: 0 });
    if (!(u._cvHomeAt > this.time)) {
      u._cvHomeAt = this.time + 0.3;
      const home = u.group.slotPos(u.slot, u.group.initial); q.x = home.x; q.z = home.z;
    }
    return q;
  },
  cavalry(u, t, d, tp, dt, near) {
    if (u.stagger > 0) { const r = u.cvResult || (u.cvResult = { want: null, speed: 0 }); r.want = null; r.speed = 0; return r; }   // 止められて竿立ち
    const result = u.cvResult || (u.cvResult = { want: null, speed: 0 });
    const point = u.cvPoint || (u.cvPoint = { x: 0, z: 0 });
    if (u.cv === 'out') {
      u.cvT -= dt;
      // 十分に離れたら、向きを変えてまた寄せる
      if (u.cvT > 0 || (d < 9 && u.cvT > -2.5)) { point.x = u.pos.x + u.cvDir.x * 10; point.z = u.pos.z + u.cvDir.z * 10; result.want = point; result.speed = u.run * 0.9; return result; }
    }
    const g = u.group;
    if (u.cv === 'out' || u.cv === 'rally') {
      u.cv = 'rally'; u.charging = false;
      const home = this.cavalryHome(u);
      localPoint(this, u, point, home.x, home.z);
      if (Math.hypot(u.pos.x - home.x, u.pos.z - home.z) > 3) { result.want = point; result.speed = u.speed * 1.4; return result; }
      if (!(g.cavRallySay > this.time - 8)) { g.cavRallySay = this.time; this.play('eshout', u.pos, 0.7); }
    }
    u.cv = 'in';
    // 騎馬の隊（三騎より多い）は、並足から早足で寄せ、号令（鬨の声）で一斉に駆け出す。一騎ずつばらばらに駆け出さない
    let hold = false;
    if (g && !(g.cavCountAt > this.time)) {
      g.cavCountAt = this.time + 0.3; g.cavReady = 0; g.cavAligned = 0;
      for (const o of g.units) if (o.alive && o.mounted && !o.fleeing && !o.noTarget && !o.woundOut && !o.rearWound && !o.downed && !(o.pinT > this.time) && !(o.stagger > 0)) {
        g.cavReady++; const home = g.slotPos(o.slot, g.initial);
        if (o.cv !== 'out' && o.cv !== 'rally' && Math.hypot(o.pos.x - home.x, o.pos.z - home.z) < 4 && Math.abs(angleDiff(o.heading, g._face ?? g.facing)) < 0.45 && Math.hypot(o.mv.x, o.mv.z) < o.speed * 2) g.cavAligned++;
      }
    }
    if (d > 7 && g && !u.charging && !(u.chargeCd > this.time) && g.cavReady > 3) {
      if (!(g.cavGo > this.time - 2.5) && g.cavAligned >= Math.ceil(g.cavReady * 0.7) && g.leader?.alive && !g.leader.fleeing && !g.leader.woundOut && !g.leader.rearWound && !g.leader.downed) {
        g.cavGo = this.time + 1.4;
        const L = g.leader && g.leader.alive ? g.leader : u;
        if (L.camD < 90) { this.play('eshout', L.pos, 1.1); this.play('neigh', L.pos, 0.6); }   // 駆け出す前の気配：鬨の声・いななき
      }
      hold = !Number.isFinite(g.cavGo) || this.time >= g.cavGo + 2.5 || this.time < g.cavGo;
    }
    if (d > 7 && !hold) this.startCharge(u, near);
    if (u.stagger > 0) { result.want = null; result.speed = 0; return result; }
    if (hold) { const home = this.cavalryHome(u); result.want = localPoint(this, u, point, home.x, home.z); result.speed = u.speed; return result; }
    if ((!t.isPlayer || (u.playerMeleeUntil > this.time || this.playerAttackers < 2) && !(this.playerCounterUntil > this.time)) && d <= u.reach + (u.charging ? 0.9 : 0.4) && (u.charging || u.cd <= 0) && !t.isStruct && !this.wallBetween(u.pos, u.team, t.pos)) {
      const was = u.charging;
      // 疲れた馬（u.horseStam が低い）の突撃は弱い：満タンで1.8倍、尽きると1.35倍まで下がる
      const chargeMult = was ? (1 + Math.min(1.2, this.horseMomentum(u, Math.hypot(u.mv.x, u.mv.z)) / 10)) * (0.75 + 0.25 * (u.horseStam ?? 1)) : 1;
      // 駆けながらの突きは、構えた槍がそのまま当たる（振りかぶらない）
      u.swing = { kind: was ? 'charge' : 'thrust', t: 0, dur: 0.32, at: 0, done: true, target: t, res: null, d, side: u.id % 2 ? 1 : -1 };
      if (t.isPlayer) { if (!(u.playerMeleeUntil > this.time)) this.playerAttackers++; u.playerMeleeUntil = this.time + 1.2; }
      this.strike(u, t, near, chargeMult, u.swing);
      u.strikeT = 0.2;
      u.cd = u.cdBase * (0.85 + Math.random() * 0.3);
      u.charging = false; u.chargeCd = this.time + (was ? 3 : 1.5);
      // 駆け抜ける：突いたらそのまま前へ抜け、止まって斬り合わない
      const h = u.heading + (was ? 0 : (u.id % 2 ? 0.8 : -0.8));
      u.cv = 'out'; u.cvT = was ? 1.8 : 2.2;
      const dir = u.cvDir || (u.cvDir = { x: 0, z: 0 }); dir.x = Math.sin(h); dir.z = Math.cos(h);
      point.x = u.pos.x + dir.x * 10; point.z = u.pos.z + dir.z * 10;
      result.want = point; result.speed = u.run; return result;
    }
    result.want = tp; result.speed = u.charging || d > 5 ? u.run : u.speed * 1.4; return result;
  },
  // 駆け出す（蹄の音）。駆けている間に槍衾や柵に当たると止められる
  startCharge(u, near) {
    if (!u.mounted || u.horseBattle === 'foot') return;
    if (u.charging || u.fleeing || u.group?.routed || u.chargeCd > this.time || u.stagger > 0 || u._bandCut || nearNochargeFence(this, u)) return;
    // 疲れた馬（u.horseStam が低い）は駆け出しの立ち上がりが鈍る
    const stam = u.horseStam ?? 1;
    if (stam < 0.4) {
      if (u._chargeWait == null) u._chargeWait = this.time + (0.4 - stam) * 1.2;
      if (u._chargeWait > this.time) return;
    }
    u._chargeWait = null;
    u.charging = true; u.chargeT = this.time;
    if (near && Math.hypot(u.vel.x, u.vel.z) > 6 && !(u.hoovesAt > this.time)) {
      u.hoovesAt = this.time + 4; this.play('hooves', u.pos, 1.2);
    }
  },
  // 馬の重さと実際の速さ。大きな馬・馬鎧は重く、疲れて遅ければ勢いも落ちる。
  horseMomentum(u, speed) {
    const st = u.horse && u.horse.userData.style;
    const mass = 420 + (st && st.big ? 80 : 0) + (st && st.armor ? 60 : 0);
    return Math.max(0, speed) * mass / 420;
  },
  // 胸前の当たりだけ拾う。近くの兵を間引いて調べ、巻き込むのは隣の二人まで。
  trample(u, speed) {
    if (!u.mounted || speed <= 4 || u.fleeing || u.stagger > 0 || u._trampleAt > this.time) return 1;
    u._trampleAt = this.time + 0.08;
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
    let loss = 1, hits = 0;
    this.forNear(u.pos.x, u.pos.z, 2.2, (t) => {
      if (hits >= 3 || t === u || !t.alive || t.isStruct || t.mounted || t.invuln || t.team === u.team || t.type === 'dummy' || Math.abs(t.pos.y - u.pos.y) > 1.8 || t.group?.civ || t.__trampleT > this.time) return;
      const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z;
      const ahead = dx * fx + dz * fz, lat = dx * fz - dz * fx;
      if (ahead < 0 || ahead > 2 || Math.abs(lat) > 0.95 || this.wallBetween(u.pos, u.team, t.pos)) return;
      const force = this.horseMomentum(u, speed * loss);
      t.__trampleT = this.time + 2.2;
      this.damage(t, 4 + force * 1.1, u, { pierce: true, kind: 'thrust' });
      this.cavalryImpact(u, t, force, lat >= 0 ? 1 : -1);
      let n = 0;
      if (force >= 7) this.forNear(t.pos.x, t.pos.z, 1.5, (o) => {
        if (n >= 2 || o === t || !o.alive || o.isStruct || o.mounted || o.invuln || o.team !== t.team || o.type === 'dummy' || Math.abs(o.pos.y - t.pos.y) > 1.8 || o.group?.civ || o.__trampleT > this.time) return;
        const rx = o.pos.x - t.pos.x, rz = o.pos.z - t.pos.z;
        if (rx * rx + rz * rz > 2.25 || rx * fx + rz * fz < -0.4 || this.wallBetween(t.pos, t.team, o.pos)) return;
        o.__trampleT = this.time + 2.2;
        this.cavalryImpact(u, o, force * 0.7, rx * fz - rz * fx >= 0 ? 1 : -1);
        n++;
      });
      loss *= Math.max(0.78, 1 - 1.2 / Math.max(4, force)); hits++;
      if (u.camD < 60) this.play('thud', t.pos, Math.min(1, force / 10));
    });
    return loss;
  },
  // 既存の押し合い・被弾の入れ物を使い、強い当たりでは倒れてから起き上がる。
  cavalryImpact(u, t, force, side) {
    if (!t.alive || !t.push) return;
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading), k = Math.min(8, force * 0.65);
    t.push.x += (fx * 0.8 + fz * side * 0.5) * k;
    t.push.z += (fz * 0.8 - fx * side * 0.5) * k;
    if (!t.isPlayer) {
      const down = force >= 7.5, dur = down ? 1.8 : 0.65;
      t.hit = { kind: down ? 'trample' : 'side', t: 0, dur, side, heavy: down, wkind: 'charge' };
      t.lastHit = t.hit; t.lastHitT = 0;
      t.stagger = Math.max(t.stagger || 0, dur); t.atk = null; t.swing = null;
      t.cd = Math.max(t.cd || 0, dur);
      t.mv.x *= 0.2; t.mv.z *= 0.2;
      if (t.group) {
        t.group._reformT = Math.max(t.group._reformT || 0, this.time + dur);
        t.group.formLoose = this.time; t.group._looseT = this.time;
      }
    }
  },
  // 槍衾に正面（±60°）から当たると止められる。横や後ろから突っ込めば止められない
  checkYari(u, player = null) {
    let stopped = null;
    this.forNear(u.pos.x, u.pos.z, 3.8, (o) => {
      if (stopped || !o.alive || o.dropped || o.downed || o.pinT > this.time || o.woundOut || Math.abs(o.pos.y - u.pos.y) > 1.8 || o.isStruct || o.mounted || o.fleeing || o.stagger > 0.3 || !o.group || o.group.routed || (o.wpnKind || o.lookWeapon) !== 'spear' || o.team === u.team || o.group.formation !== 'yari' || !(o.group.order === 'yari' || o.group.order === 'hold')) return;
      const dx = u.pos.x - o.pos.x, dz = u.pos.z - o.pos.z, d = Math.hypot(dx, dz) || 1;
      if (d > 3.8 || (dx * Math.sin(o.heading) + dz * Math.cos(o.heading)) / d < 0.5) return;
      if ((-dx * Math.sin(u.heading) - dz * Math.cos(u.heading)) / d < 0.4 || this.wallBetween(u.pos, u.team, o.pos)) return;
      stopped = o;
    });
    if (!stopped) return false;
    // 槍衾の者が穂先を揃えて突き出し、柄が撓む
    stopped.swing = { kind: 'thrust', t: 0, dur: 0.2, at: 0, done: true, target: u, res: 'hit', d: Math.hypot(u.pos.x - stopped.pos.x, u.pos.z - stopped.pos.z) };
    stopped.strikeT = 0.2; kickSpear(stopped.wpn, 2.5);
    // 受け止めた者は石突を地に立てて踏ん張る（1.2 秒：穂先を馬の胸の高さへ上げ、柄を大きく撓ませ、半歩押し下げられる）
    stopped.planted = this.time + 1.2; kickSpear(stopped.wpn, 3.5);
    { const f = Math.hypot(u.pos.x - stopped.pos.x, u.pos.z - stopped.pos.z) || 1; stopped.push.x -= (u.pos.x - stopped.pos.x) / f * 2.2; stopped.push.z -= (u.pos.z - stopped.pos.z) / f * 2.2; }
    this.bleed(u, stopped, 'thrust', 1.4, 'flesh');
    if (player) {
      player.hspd = 0; player.horseStopUntil = player.rt.t + 1.4;
      player.pending = null; player.buffer = 0; player.chargeT = 0; u.swing = null; u.pAtk = null;
      u.vel.x = u.vel.z = u.mv.x = u.mv.z = 0;
      if (u.horse?.userData.horse) u.horse.userData.horse.rear = 0.8;
      player.horseHurt(30 * (player.yariResist || 1));
      if ((player.yariWarnT ?? -99) + 8 <= player.rt.t) {
        player.yariWarnT = player.rt.t; player.rt.bark('槍衾に止められた！　横か後ろへ回れ', true);
      }
      this.play('neigh', u.pos, 0.8);
    } else this.cavalryStopped(u, stopped.pos.x, stopped.pos.z, 35);
    if (!player && this.hooks.onCavalryStopped) this.hooks.onCavalryStopped(u, stopped);
    if (u.hp <= 0) this.kill(u, stopped);
    return true;
  },
  // 騎馬が止められた：馬が竿立ちになり、しばらく動けず、そのあと退いて寄せ直す
  cavalryStopped(u, bx, bz, hurt) {
    u.charging = false; u.chargeCd = this.time + 6; u.stagger = 1.6; u.lastHitT = 0;
    // 討たれない武将は下限（WOUND_FLOOR）より下がらない
    u.hp = u.invuln ? Math.max(Math.min(u.hp, u.maxHp * WOUND_FLOOR), u.hp - hurt) : u.hp - hurt;
    const dx = u.pos.x - bx, dz = u.pos.z - bz, d = Math.hypot(dx, dz) || 1;
    // 士気の落ちた隊の馬は怯えて、長く退いてからでないと寄せ直さない
    const gm = u.group ? u.group.morale : 100;
    u.cv = 'out'; u.cvT = 2.2 + (gm < 55 ? (55 - gm) / 12 : 0);
    const dir = u.cvDir || (u.cvDir = { x: 0, z: 0 }); dir.x = dx / d; dir.z = dz / d;
    u.mv.x = u.mv.z = u.vel.x = u.vel.z = 0;
    u.push.x = u.push.z = 0; u.atk = null; u.swing = null;
    if (u.horse && u.horse.userData.horse) u.horse.userData.horse.rear = 0.8;
    this.spark(u.pos.x, u.pos.y + 1.6, u.pos.z, 10);
    this.play('neigh', u.pos, 0.8);
  },

  act(u, dt, near) {
    const g = u.group;
    const order = signalWait(this, g, u) ? g.signalFrom : g.order;
    enduranceTick(this, u, dt);
    playerPressureTick(this);
    if (u.playerOpeningBlocked) {
      if (u.target?.isPlayer) { u.target = null; u.aiT = 0; }
      if (u.atk?.target?.isPlayer) u.atk = null;
      if (u.swing?.target?.isPlayer) u.swing = null;
      if (u.bind?.o?.isPlayer) u.bind = null;
    }
    // 戦ごとに指定された後続は、刃が当たる前に外側へ回る。指定のない戦は従来どおり。
    if (!u.isPlayer && !u.fleeing && !g.routed && !u.woundOut && !u.downed && !(u.pinT > this.time) && !u.climb && !(u.stagger > 0)) {
      const space = this.world.def.combatSpace?.(this, u);
      if (space) {
        u.target = null; u.atk = null; u.swing = null; u.bind = null; u.moveTo = space;
        this.steer(u, dt, space, u.speed, u.heading);
        return;
      }
    }
    // 受け流しの間は、支度中の横槍もいったん引く。
    if (this.playerCounterUntil > this.time) {
      if (u.atk?.target?.isPlayer && !u.atk.ranged && !u.atk.bow) { u.atk = null; u.cd = Math.max(u.cd || 0, 0.75); }
      if (u.swing?.target?.isPlayer && !u.swing.done) { u.swing = null; u.cd = Math.max(u.cd || 0, 0.75); }
    }
    // 下知や的の状態が変わったら、古い狙いをやめて判断し直す。
    if (u.atk && (!u.atk.target?.alive || u.atk.target.opened || u.atk.target.team === u.team ||
      !u.atk.target.isStruct && u.atk.target.noTarget ||
      (u.atk.ranged || u.atk.bow) && (g.fire === false || u.atk.ranged && (g.holdFire || !gunArcAllows(this, g, u, u.atk.target))))) {
      u.atk = null; u.aiT = 0; u.cd = Math.min(u.cd, 0.2);
    }
    if (!u.isPlayer && !u.fleeing && !g.routed && !u.sidearm && !u.mounted && ((u.type === 'gun' && u.gunAmmo === 0) || (u.type === 'bow' && u.arrowAmmo === 0))) this.drawSidearm(u);
    // 判断の間引きを待たず、崩れた瞬間から斬撃と一騎討ちをやめる。
    if (!u.isPlayer && (g.routed || u.fleeing) && (u.target || u.atk || u.swing || u.bind)) {
      u.target = null; u.atk = null; u.swing = null; u.bind = null;
      this.think(u);
    }
    if (u.target && (!u.target.alive || u.target.opened || u.target.noTarget || u.target.team === u.team)) { u.target = null; u.aiT = 0; }
    let want = null, face = null;
    let speed = u.speed;
    // 狙っている間に霧へ隠れた相手は撃たず、近くの敵を探し直す。
    if (u.target && !u.target.isStruct && !weatherSees(this.world, u.pos, u.target.pos)) { u.target = null; u.aiT = 0; }
    if (u.atk && (u.atk.ranged || u.atk.bow) && !u.atk.target.isStruct && !weatherSees(this.world, u.pos, u.atk.target.pos)) { u.atk = null; u.cd = 0.4; }
    if (u.stagger > 0) u.stagger = Math.max(0, u.stagger - dt);
    if (u.fallenLookLeft > 0) u.fallenLookLeft = Math.max(0, u.fallenLookLeft - dt);
    // 鍔迫り合いの決着：力（残りの体力）と運で押し勝った方が、相手を大きく崩す（膝をつかせる）
    if (u.bind && (u.bind.t -= dt) <= 0) {
      const o = u.bind.o; u.bind = null;
      if (o && o.alive && u.alive && o.team !== u.team && !o.fleeing && !o.group?.routed &&
          this.distTo(u, o) < 2.5 && !this.wallBetween(u.pos, -1, o.pos)) {
        const win = u.hp / u.maxHp * (0.6 + Math.random()) > o.hp / o.maxHp * (0.6 + Math.random());
        const lo = win ? o : u, hi = win ? u : o;
        lo.stagger = 1.0; lo.lastKneelT = this.time; hi.stagger = 0; hi.cd = Math.min(hi.cd, 0.1);
        const dx = lo.pos.x - hi.pos.x, dz = lo.pos.z - hi.pos.z, dl = Math.hypot(dx, dz) || 1;
        lo.push.x += dx / dl * 3; lo.push.z += dz / dl * 3;
      }
    }
    if (u.pinT > this.time || u.downed) {
      u.target = null; u.atk = null; u.swing = null; u.bind = null; u.moveTo = null;
      u.mv.x = u.mv.z = u.vel.x = u.vel.z = 0;
      u.push.x = u.push.z = 0; u.moving = 0; return;
    }
    if (u.relT > 0) u.relT = Math.max(0, u.relT - dt);
    if (u.hit) { u.hit.t += dt; if (u.hit.t > u.hit.dur) u.hit = null; }
    // 群がる後続は、前の敵の背で待つ。本人の背へ回って退き口を塞がない。
    const front = u.playerQueueFront;
    if (u.playerQueue && u.target?.isPlayer && front?.alive && !u.fleeing && !g.routed &&
        !u.woundOut && !u.climb && !(u.stagger > 0)) {
      // 前の打ち手の背ではなく、左右と斜め後ろへ回って輪を詰める（真後ろ一つは退き口に空ける）。
      const p = u.target, a = Math.atan2(front.pos.x - p.pos.x, front.pos.z - p.pos.z) + (u.id % 2 ? 1 : -1) * (1.15 + (u.id >> 1) % 3 * 0.45);
      const r = 4.8 + (u.id % 5) * 0.25;
      const q = localPoint(this, u, u.moralePoint, p.pos.x + Math.sin(a) * r, p.pos.z + Math.cos(a) * r);
      if (u.atk?.target === p && !u.atk.ranged && !u.atk.bow) u.atk = null;
      if (u.swing?.target === p) u.swing = null;
      u.charging = false; u.cd = Math.max(u.cd || 0, 0.3); u.guarding = Math.max(u.guarding || 0, 0.3);
      this.steer(u, dt, q, u.speed, this.faceTo(u, p));
      return;
    }
    // 一騎打ち：見届ける者は輪になって見守り、名乗りと鍔迫り合いの間は敵将も足を止める
    if (this.duel && (u.duelW || u === this.duel.foe) && !u.fleeing && !g.routed) {
      const r = this.duelAct(u);
      if (r) { this.steer(u, dt, r.want, r.speed, r.face); return; }
    }
    // 振り出した武器：穂先・刃が届いた時に当たりを決める（振る前・届く前には当たらない）
    if (u.swing) {
      const s = u.swing;
      s.t += dt;
      if (!s.done && s.t >= s.dur * s.at) { s.done = true; this.landSwing(u, s, near); }
      if (s.t >= s.dur + 0.3) u.swing = null;
    }
    if (moraleAct(this, u, dt)) return;
    if (cavalryDismountTick(this, u, dt)) return;
    // 鉄砲が狙っていた的が（味方の手で）倒れた：死んだ者を撃たず、筒を下ろして次の的を探す
    if (u.atk && u.atk.ranged && !u.atk.target.isStruct && !u.atk.target.alive) {
      if (u.target === u.atk.target) u.target = null;
      u.atk = null; u.cd = Math.min(u.cd, 0.2);
    }
    if (u.atk) {
      const a = u.atk;
      a.t -= dt;
      if (a.ranged) {
        // 鉄砲：火蓋を切り、台尻を頬に付けて狙い、引き金を落とす（火皿の口薬が先に光り、すぐ筒の薬に移る）
        // 引き金を引く〇・八秒前から狙いを固定する。横への回避を追わない。
        // 既存の攻撃の入れ物へ座標を残し、毎コマ新しい物を作らない。
        if (a.t <= 0.8 && a.x === undefined) { a.x = a.target.pos.x; a.y = a.target.pos.y; a.z = a.target.pos.z; }
        if (a.t <= 0.1 && !a.pan) { a.pan = true; this.panFlash(u, near); }
        if (a.t <= 0 && a.target.alive && !a.target.isStruct && (a.target.team === u.team || this.shotBlocked(u, a) || this.allyInLine(u, a.target, Math.hypot(a.x - u.pos.x, a.z - u.pos.z), a))) {
          // 構えた後に味方や塀が射線へ入ったら、弾を使わず筒を下ろす。
          u.atk = null; u.cd = 0.4; u.aiT = 0;
        } else if (a.t <= 0) {
          u.atk = null;
          const ok = this.fireGun(u, a.target, null, a);
          // 不発でも口薬と火縄を整える時間を取る。雨の間は次も撃てない
          this.startReload(u);
          this.gunRotate(u);
          // 敵の鉄砲組が揃えて放った直後は、弾込めの間（遊び手に知らせる。組ごとに 20 秒に一度）
          if (g.isGun && g.vCall > this.time - 1 && g.team !== (this.playerUnit ? this.playerUnit.team : 0) && !(g.reloadCallT > this.time - 20) && this.hooks.onFoeReload) { g.reloadCallT = this.time; this.hooks.onFoeReload(g); }
        } else face = a.x === undefined ? this.faceTo(u, a.target) : Math.atan2(a.x - u.pos.x, a.z - u.pos.z);
      } else if (a.bow) {
        // 弓：番えて、打ち起こし、引き分け、会で狙いを定めて離れ
        const tg = a.target.alive && !a.target.noTarget ? a.target : null;
        // 離れの〇・六秒前から的を固定する。倒れた的から別の人へ飛び移らない。
        if (tg && tg.isPlayer && a.t <= 0.6 && a.x === undefined) { a.x = tg.pos.x; a.y = tg.pos.y; a.z = tg.pos.z; }
        // 引く間は体を横に開く（左の肩を的へ）ので、向きを少し右へ
        if (tg) face = this.faceTo(u, tg) + (a.dur - a.t > 0.8 ? 0.3 : 0);
        if (a.t <= 0) {
          u.atk = null; u.relT = 0.55;
          if (tg) this.shoot(u, tg, null, a.x === undefined ? null : a);
          u.cd = u.cdBase * (0.8 + Math.random() * 0.5) * (a.far ? 1.7 : 1);   // 遠矢は引きが重く、間を空けて射る
        }
      } else if (a.t <= 0) {
        u.atk = null;
        u.cd = u.cdBase * (0.85 + Math.random() * 0.45) * (g.morale < 40 ? 1.35 : 1) * (1 + 0.35 * (u.fat || 0));   // 疲れた者は手が遅い
        this.startSwing(u, a.kind || 'thrust', a.target);
        if (u.swing) { u.swing.heavy = !!a.heavy; u.swing.fast = !!a.fast; }
        if (a.fast && u.swing) u.swing.dur *= 0.7;
      } else face = this.faceTo(u, a.target);
    } else if (u.target && u.target.alive) {
      const t = u.target;
      const d = this.distTo(u, t);
      const tp = this.targetPoint(t, u, u.cvTarget || (u.cvTarget = { x: 0, z: 0 }));
      const fa = Math.atan2(tp.x - u.pos.x, tp.z - u.pos.z);
      const mixing = !t.isPlayer && !t.isStruct && frontlineMelee(this, u) && (u.aiRow > 0 || t.yariOpenUntil > this.time || u.yariOpenUntil > this.time);
      const meleeReach = mixing ? Math.min(u.reach * 0.92, 1.15 + u.id % 3 * 0.45) : t.isPlayer && !u.mounted ? Math.min(u.reach * 0.92, this.world.def.closeCombatAssist ? 3.5 : 2.6) : u.reach * 0.92;
      const spear = (u.wpnKind || u.lookWeapon || u.weapon) === 'spear';
      // 打ち終わりも二人の枠を保つ。後続は槍先の外へ回り、反撃の間には踏み込まない。
      const meleeWait = t.isPlayer && (u.sidearm || u.type !== 'gun' && u.type !== 'bow') &&
        (!(u.playerMeleeUntil > this.time) && this.playerAttackers >= 2 || this.playerCounterUntil > this.time);
      if (meleeWait && !u.swing) {
        const base = Math.atan2(u.pos.x - tp.x, u.pos.z - tp.z);
        const a = base + (u.id % 2 ? 1 : -1) * 0.22;
        const r = Math.max(4.2, Math.min(6, u.reach + 1.1));
        want = localPoint(this, u, u.moralePoint, tp.x + Math.sin(a) * r, tp.z + Math.cos(a) * r);
        u.guarding = Math.max(u.guarding || 0, 0.25);
        u.charging = false;
        this.steer(u, dt, want, u.speed * 0.65, fa);
        return;
      }
      // 近い敵から目を離さず、回り込みも引き足も行う。
      if (!u.mounted && !t.isStruct && d < 12) face = fa;
      if (u.mounted && u.type === 'cavalry' && t.isStruct && u.cv === 'out' && !u.fleeing && !(u.stagger > 0) && (u.cvT -= dt) > 0) {
        // 柵に止められた騎馬は、いったん退いてから寄せ直す
        want = u.cvPoint || (u.cvPoint = { x: 0, z: 0 });
        want.x = u.pos.x + u.cvDir.x * 10; want.z = u.pos.z + u.cvDir.z * 10; speed = u.run * 0.8;
        if (u.cvT <= dt) u.cv = 'in';
      } else if (u.mounted && u.type === 'cavalry' && !t.isStruct && !u.fleeing) {
        const r = this.cavalry(u, t, d, tp, dt, near);
        want = r.want; speed = r.speed;
        if (!want) face = null;
      } else if (u.type === 'gun' && !u.sidearm && !t.isStruct && d < 2.2 && !u.isPlayer && !u.mounted && !(u.sideTry > 0) && (u.sideTry = 1) && Math.random() < 0.35) {
        // 寄られた鉄砲足軽の三人に一人ほどは、鉄砲を置いて脇差を抜く（台尻で殴り合わない）
        this.drawSidearm(u);
      } else if (!u.mounted && !u.sidearm && (u.type === 'gun' || u.type === 'bow') && !t.isStruct &&
          !g.interiorHold && !u.perch && !this.atLoop(u) && (d < 6 || u.rangedBack && d < 10)) {
        // 射手は組の下知にかかわらず間合いを取り直す。狭間・塀上の持ち場は保つ。
        u.rangedBack = true;
        const dl = Math.max(0.1, d);
        want = localPoint(this, u, u.moralePoint, u.pos.x - (tp.x - u.pos.x) / dl * 4, u.pos.z - (tp.z - u.pos.z) / dl * 4);
        speed = u.run; face = fa;
      } else if (u.type === 'gun' && !u.sidearm && !t.isStruct && d > 4 && d <= u.range) {
        u.rangedBack = false;
        // 鉄砲：足を止めて狙いを定め、撃つ（撃てば長い装填）。段を組んだ隊は、前の段の者だけが撃つ
        face = fa;
        let ready = !t.isPlayer || this.time >= 12 + (u.id % 5) * 0.7;
        if (this.gunGated(g) && !this.atLoop(u)) {
          const sp = g.slotPos(u.slot, g.initial);
          const ds = Math.hypot(sp.x - u.pos.x, sp.z - u.pos.z);
          if (ds > 0.45) { want = sp; speed = ds > 3 ? u.run : u.speed; }
          ready = ds < 1.1 && this.gunFront(u);
        }
        // 自分の方の塀・柵が撃つ線をさえぎる時は撃たない。狭間の後ろや柵のすぐ後ろへ寄って、そこから撃つ
        const wb = this.shotBlocked(u, tp);
        if (wb) {
          ready = false;
          const p = this.loopPost(u, tp, wb);
          const dp = p ? Math.hypot(p.x - u.pos.x, p.z - u.pos.z) : 0;
          if (dp > 0.12) { want = p; speed = dp > 3 ? u.run : u.speed; }
        } else if (this.atLoop(u)) u.loopT = this.time;
        // 塀の向こうに隠れた者（狭間にも塀の上にも見えない者）は撃たない
        if (ready && this.hiddenBehind(u, t)) ready = false;
        if (t.isPlayer && this.time < 12 + (u.id % 5) * 0.7) ready = false;
        // 一斉射の下知を受けた時点で、弾込め済みだった射手だけが一発放つ。
        if (g.salvoOnly && u.salvoAt !== g.salvoAt || !gunArcAllows(this, g, u, t)) ready = false;
        // 的の先も含め、弾の通り道に味方がいれば撃たずに待つ
        if (ready && u.cd <= 0 && this.allyInLine(u, t, d)) ready = false;
        // 号令を待つ鉄砲組（holdFire）は、込めたまま「放て」を待つ
        // 段を組んだ隊は、組頭の「放て」で前の段がそろって撃つ（最初の者が構えてから 0.8 秒待って号令。0.25 秒の間に構えている者だけが撃つ）
        let vol = false;
        // 自分（プレイヤー）の近くの敵の鉄砲組（6 挺より多い）も、段を組んでいなくても「構え」から揃えて放つ。構えから放つまでの間を長く取る（食らう前の一瞬の間）
        const P0 = this.playerUnit;
        const foeLine = !TOFF && g.isGun && g.count >= 6 && P0 && P0.alive && g.team !== P0.team && Math.abs(P0.pos.x - u.pos.x) + Math.abs(P0.pos.z - u.pos.z) < u.range + 20;
        if (ready && u.cd <= 0 && !(u.stagger > 0) && !g.holdFire && g.fire !== false && (this.gunGated(g) || foeLine)) {
          if (!(g.vCall > this.time - 0.25)) {
            const wait = foeLine ? 2.5 : 0.8;
            g.vCall = this.time + wait;
            const L = g.leader && g.leader.alive ? g.leader : u;
            if (L.camD < 70) this.play('eshout', L.pos, 0.5);
            if (foeLine && this.hooks.onFoeVolleyCall) this.hooks.onFoeVolleyCall(g, L, wait);
          }
          if (this.time < g.vCall) ready = false; else vol = true;
        }
        if (ready && playerShotAllows(this, u, t) && u.cd <= 0 && !(u.stagger > 0) && !g.holdFire && g.fire !== false && Math.abs(angleDiff(u.heading, fa)) < 0.5) {
          // 一挺は二秒半前に予告。一斉射は既に列の予告で待ったので、号令後に放つ。
          const aimMe = t.isPlayer;
          const dur = aimMe ? (vol ? 0.9 : 2.5) : (vol && !aimMe ? 0.12 + Math.random() * 0.16 : 0.45 + u.windup * (0.8 + Math.random() * 0.4));
          if (aimMe) u.shotWarnUntil = Math.max(u.shotWarnUntil || 0, this.time + dur);
          if (aimMe && !vol && this.hooks.onGunAtPlayer && !(u.aimWarnT > this.time - 3)) { u.aimWarnT = this.time; this.hooks.onGunAtPlayer(u); }
          if (aimMe) g.playerAimAt = this.time;
          u.atk = { t: dur, dur, target: t, ranged: true };
          // 火縄の煙を先に見せる。発射直前の火皿の火とは分ける。
          if (near) this.smoke(u.pos.x, u.pos.y + 1.5, u.pos.z, 0, 0, 0.35);
        }
      } else if (u.type === 'gun' && !u.sidearm && !t.isStruct && d > u.range) {
        want = tp; speed = u.run;
      } else if (u.type === 'bow' && !u.sidearm && t.isStruct && g.fireArrows && g.fire !== false) {
        // 火矢：届く所（射程の 0.9）まで寄り、足を止めて射込む
        if (d > u.range * 0.9) { want = tp; speed = u.run; }
        else {
          face = fa;
          if (u.cd <= 0 && Math.abs(angleDiff(u.heading, fa)) < 0.6 && !(u.stagger > 0)) { const dur = 1.9 + Math.random() * 0.4; u.atk = { t: dur, dur, target: t, bow: true }; u.bowElev = d > 20 ? 0.35 : 0.12; }
        }
      } else if (u.type === 'bow' && !u.sidearm && !t.isStruct && (d < 4 || u.bowBack && d < 9) && order !== 'hold' && order !== 'yari') {
        // 弓兵は間合いを詰められたら、背を向けて走って下がり（9m 離れるまで振り返らない）、離れてから向き直って番える
        u.bowBack = true;
        const dl = Math.max(0.1, d);
        want = localPoint(this, u, u.moralePoint, u.pos.x - (tp.x - u.pos.x) / dl * 4, u.pos.z - (tp.z - u.pos.z) / dl * 4); speed = u.run;
      } else if (u.type === 'bow' && !u.sidearm && !t.isStruct && d > 4 && g.fire !== false) {
        u.bowBack = false; u.rangedBack = false;
        const farShot = (order === 'hold' || order === 'yari') && d <= 60 && !(this.rain > 0.5);
        if (d <= u.range * (1 - 0.35 * (this.rain || 0)) || farShot) {
          face = fa;
          // 自分の方の塀・柵が前にある時：近くの狭間へ寄って射る。狭間が無ければ塀の上越しに高く射上げる（塀のすぐ後ろからは射ない）
          let clear = true;
          const wb = this.shotBlocked(u, tp);
          if (wb) {
            const p = this.loopPost(u, tp, wb);
            const dp = p ? Math.hypot(p.x - u.pos.x, p.z - u.pos.z) : 0;
            if (p && dp > 0.12) { want = p; speed = dp > 3 ? u.run : u.speed; clear = false; }
            else if (distToSeg(u.pos.x, u.pos.z, wb.seg) < 2.5) clear = false;
          } else if (this.atLoop(u)) u.loopT = this.time;
          // 組の弓は支度が終わった者から揃えて引く
          const volley = g.bowT > this.time - 0.9 && u.cd <= 0;   // 一斉射でも手の支度を省かない
          if (clear && playerShotAllows(this, u, t) && (u.cd <= 0 || volley) && Math.abs(angleDiff(u.heading, fa)) < 0.6 && !(u.stagger > 0)) {
            // 番える 0.8・打ち起こし 0.5・引き分け 0.7・会。組の一斉射では、先に番えた者の離れにそろえる（0.1 秒の内に放つ＝矢の雨）
            if (!(g.bowT > this.time - 0.9)) g.bowT = this.time;
            const dur = Math.max(1.4, g.bowT + 2.3 - this.time) + Math.random() * 0.1;
            if (t.isPlayer) g.playerAimAt = this.time;
            u.atk = { t: dur, dur, target: t, bow: true, far: d > u.range };
            u.bowElev = d > 24 ? Math.min(0.75, 0.3 + (d - 24) / 50) : wb ? 0.5 : 0.04;
          }
        } else { want = tp; speed = u.run; }
      } else if (u.combatRetreat && !u.mounted && (d > meleeReach || u.cd > 0 || u.stagger > 0)) {
        want = u.moveTo; face = fa; speed = u.speed * 0.75;
      } else if (d > meleeReach || (u.charging && t.isStruct)) {
        // （本人へは 2.6m まで詰めてから打つ。長柄の間合いの外から一方的に打たれて、本人の突きが届かないことが無いように）
        want = tp; speed = d > 6 || order === 'attack' ? u.run : u.speed;
        // 槍は組の向きと持ち場の幅を保って踏み込む。刀は横へ回る。
        if (spear && !mixing && !t.isStruct && !u.mounted && d < 12 && !g.isPlayerSquad && !u.combatRetreat) {
          const h = g._face ?? g.facing, fx = Math.sin(h), fz = Math.cos(h);
          const side = Math.max(-meleeReach * 0.4, Math.min(meleeReach * 0.4, (g.anchor.x - tp.x) * fz - (g.anchor.z - tp.z) * fx + (u.meleeSide || 0)));
          // 敵が備の後ろへ抜けた時は、列へ戻らずその場で向き直る。
          if ((tp.x - u.pos.x) * fx + (tp.z - u.pos.z) * fz > 0)
            want = localPoint(this, u, u.moralePoint, tp.x - fx * meleeReach * 0.85 + fz * side, tp.z - fz * meleeReach * 0.85 - fx * side);
        }
        // 行き先は兵の入れ物を使い回す。
        if (!t.isStruct && !u.mounted && !spear && d < 8 && !u.combatRetreat && !(this.duel && this.duel.foe === u)) {
          const a = t.heading + (u.id % 3 === 1 ? 1 : -1) * (1.25 + (u.id % 2) * 0.85);
          const r = meleeReach * 0.88;
          want = localPoint(this, u, u.moralePoint, t.pos.x + Math.sin(a) * r, t.pos.z + Math.cos(a) * r);
        }
        // 自分の組が名のある敵を囲む：真正面へ団子にならず、組頭（本人）の側から左右と背へ回り込んで間合いに入る
        if (g && g.isPlayerSquad && t.name && !t.isStruct && (t.type === 'busho' || t.type === 'samurai') && d < 9 && !u.mounted && this.playerUnit) {
          const P = this.playerUnit, base = Math.atan2(P.pos.x - t.pos.x, P.pos.z - t.pos.z);
          const a = base + RING_OFF[u.slot % 5], r = u.reach * 0.85;
          const q = localPoint(this, u, u.moralePoint, t.pos.x + Math.sin(a) * r, t.pos.z + Math.cos(a) * r);
          // 回り込む先がもうすぐ目の前なら、そのまま打ちかかる
          if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 0.8) want = q;
        }
        // 加勢は本人の左右から入る。背へ戻る本人と正面でぶつからない。
        if (u.playerHelpUntil > this.time && this.playerUnit?.alive && !u.mounted && d < 9) {
          const p = this.playerUnit, a = Math.atan2(p.pos.x - t.pos.x, p.pos.z - t.pos.z) + u.playerHelpSide * 1.1;
          const r = meleeReach * 0.85;
          want = localPoint(this, u, u.moralePoint, t.pos.x + Math.sin(a) * r, t.pos.z + Math.cos(a) * r);
        }
        // 建物の中：相手との間に壁・襖があれば、戦の側が教える口（戸・襖の開き）を通って回る（doorVia）。
        //   まっすぐ寄るだけだと、壁の向こうの相手へ向いたまま突っ立っていた（本能寺の御殿。10/10 kaito「敵勢攻めてこない」）
        if (this.doorVia && !u.mounted && !t.isStruct && want) {
          const via = this.viaDoor(u, want);
          if (via) { want = via; speed = u.run; }
        }
        // 騎馬は柵へも駆けて当たる（正面から当たると止められる）
        if (u.type === 'cavalry' && d > 7) this.startCharge(u, near);
        if (u.charging) speed = u.run;
      } else if (t.isPlayer && u.guarding > 0) {
        // 槍先を合わせて半歩退く。相手が打ち終えた隙には構えから突き返す。
        face = fa;
        if ((t.swing && t.swing.done || t.guard && u.cd <= 0) && u.cd <= 0) u.guarding = 0;
        if (d < meleeReach * 0.65 && !u.mounted) {
          const q = u.moralePoint;
          q.x = u.pos.x - Math.sin(fa) * 0.8; q.z = u.pos.z - Math.cos(fa) * 0.8;
          want = q; speed = u.speed * 0.45;
        }
      } else if (t.isPlayer && !(u.playerMeleeUntil > this.time) && this.playerAttackers >= 2 && !u.stagger) {
        // 二人が打つ間も、ほかの兵は近い間合いで槍を支え、刀は横の隙を探す。
        const base = Math.atan2(u.pos.x - tp.x, u.pos.z - tp.z);
        const a = base + (u.id % 2 ? 1 : -1) * (spear ? 0.12 : 0.38);
        const r = meleeReach + 0.45;
        want = localPoint(this, u, u.moralePoint, tp.x + Math.sin(a) * r, tp.z + Math.cos(a) * r);
        face = fa; speed = u.speed * 0.55;
      } else {
        face = fa;
        // 武将は足軽ひとりと延々打ち合わない：手の空いた旗本（同じ隊の者）を二人まで前へ呼び、自分は半歩下がる
        if (u.type === 'busho' && t.isPlayer && !u.mounted && !(this.duel && this.duel.foe === u) && !(u.callT > this.time)) {
          u.callT = this.time + 3;
          let k = 0;
          this.forNear(u.pos.x, u.pos.z, 8, (o) => { if (k < 2 && o !== u && o.alive && o.group === g && !o.fleeing && !(o.target && o.target.alive) && o.type !== 'gun' && o.type !== 'bow') { o.target = t; k++; } });
          if (k) { u.stepBackT = this.time + 1.2; if (u.camD < 30) this.play('eshout', u.pos, 0.6); }
        }
        if (u.stepBackT > this.time && u.cd > 0.2) { want = localPoint(this, u, u.moralePoint, u.pos.x - Math.sin(fa) * 1.5, u.pos.z - Math.cos(fa) * 1.5); speed = u.speed * 0.5; }
        // 侍と武将は、打つ間の空いた時に相手の周りを小さく回り込み、間合いを測る（足軽のように棒立ちで打ち合わない）
        if (!g.interiorHold && (u.type === 'ashigaru' || u.type === 'samurai' || u.type === 'busho') && t.isPlayer && !u.mounted && u.cd > 0.4 && !(u.guarding > 0) && !(u.stepBackT > this.time)) {
          const side = u.id % 2 ? 1 : -1, a0 = Math.atan2(u.pos.x - t.pos.x, u.pos.z - t.pos.z) + side * (spear ? 0.1 : 0.5), r = meleeReach * 0.95;
          const q = u.moralePoint;
          q.x = t.pos.x + Math.sin(a0) * r; q.z = t.pos.z + Math.cos(a0) * r;
          want = q; speed = u.speed * 0.55;
        }
        // 崩れかけ（士気 32 未満）の者は、打ち終えると前を向いたまま小さな歩幅で後ずさる
        if (g.morale < 32 && !g.noRout && u.cd > 0.3 && !u.mounted) { want = localPoint(this, u, u.moralePoint, u.pos.x - Math.sin(fa) * 1.1, u.pos.z - Math.cos(fa) * 1.1); speed = u.speed * 0.3; }
        // 一騎打ちの敵将：打つ間の空いた時は、間合いを測って左右へ回り、ときどき踏み込むふり（誘い）を見せる
        if (this.duel && this.duel.foe === u && t.isPlayer && u.cd > 0.15 && !(u.stagger > 0)) {
          const D = this.duel;
          if (this.time > D.sideT) {
            D.sideT = this.time + 1.4 + Math.random() * 1.8; D.side = Math.random() < 0.5 ? 1 : -1; D.rr = u.reach + 0.8 + Math.random() * 1.3;
            if (Math.random() < 0.3) { D.feintT = this.time + 0.4; if (near) this.play('eshout', u.pos, 0.5); }
          }
          const fe = D.feintT > this.time, r = fe ? u.reach * 0.75 : D.rr;
          const a0 = Math.atan2(u.pos.x - t.pos.x, u.pos.z - t.pos.z) + D.side * 0.42;
          D.want.x = t.pos.x + Math.sin(a0) * r; D.want.z = t.pos.z + Math.cos(a0) * r;
          want = D.want; speed = u.speed * (fe ? 1.2 : 0.55);
        }
        // 自分（プレイヤー）を前にした侍・足軽は、ときどき構えの姿勢をとる
        if (t.isPlayer && u.cd > 0.2 && !(u.guardCd > this.time) && u.type !== 'bow' && Math.random() < dt * (u.isOfficer ? 2.4 : 1.1)) {
          u.guarding = 0.45 + Math.random() * 0.4; u.guardCd = this.time + 2.2;
        }
        if (u.cd <= 0 && !(u.stagger > 0) && !u.swing && Math.abs(angleDiff(u.heading, fa)) < 0.6 && (!this.hooks.beforeMelee || this.hooks.beforeMelee(u, t))) {
          const D = this.duel && this.duel.foe === u ? this.duel : null;
          const heavy = D ? this.time >= D.heavyT : !!(u.isOfficer && !(u.officerHeavyT > this.time));
          const kind = heavy ? ((u.wpnKind || u.lookWeapon) === 'sword' ? 'kesa' : u.mounted ? 'thrust' : 'slam') : this.meleeKind(u, t, d);
          // 侍と武将は三度に一度、二段の拍子：長く溜めてから速く振る（拍子を読ませない）
          const two = (u.type === 'samurai' || u.type === 'busho') && Math.random() < 0.3;
          const dur = heavy ? Math.max(1.15, u.windup * 1.8) : u.windup * (kind === 'slam' ? 1.4 : 1) * (0.9 + Math.random() * 0.3) * (two ? 1.5 : 1) + (t.isPlayer ? 0.12 : 0);
          u.guarding = 0;
          u.atk = { t: dur, dur, target: t, kind, slam: kind === 'slam', fast: heavy || two, heavy };
          if (heavy) { if (D) D.heavyT = this.time + 6; else u.officerHeavyT = this.time + 7; if (near) this.play('eshout', u.pos, 0.8); }
          if (t.isPlayer) { if (!(u.playerMeleeUntil > this.time)) this.playerAttackers++; u.playerMeleeUntil = this.time + dur + 1.4; if (near) this.play('tick', u.pos, 0.8); }
          if (near && this.hooks.onWindup) this.hooks.onWindup(u, t);
        }
      }
      u.settled = false;
    } else if (u.moveTo) {
      const dx = u.moveTo.x - u.pos.x, dz = u.moveTo.z - u.pos.z;
      const d = Math.hypot(dx, dz);
      // 敵へ寄せる途中の詰まりは到着ではない。止めると moving が戻らず、jammed が解けなくなる。
      const busy = u.fleeing || order === 'retreat' || order === 'attack' ||
        (g.focus && g.focus.alive) || u.confused > 0 || g.regroupT > 0;
      // 持ち場に着いたら落ち着く（隊が止まっている間は、少しずれても歩き直さない）
      // 持ち場のすぐそば（1.6m）まで来て、人や柵に塞がれて 3 秒ほど進めなければ、そこで着いたと見なす（持ち場の前で足踏みし続けない）
      u.nearT = d < 1.6 && u.moving < 0.25 ? (u.nearT || 0) + dt : 0;
      // 持ち場のそばで詰まった時だけ一息待つ。遠い行き先は着いたと見なさず、回り込みを続ける。
      u.jamT = u.moving < 0.25 ? (u.jamT || 0) + dt : 0;
      // 遠い行き先では止まり続けず、steer の回り込みを続ける。
      // 混んだ持ち場で休む場合も二秒後には通れるか試し直す。
      if (u.jamT > 10) { u.jamT = 0; u.jammed = false; }
      else if (u.jamT > 8 && d < 1.6) u.jammed = true;
      else if (u.moving > 0.4) u.jammed = false;
      const stopRow = Math.floor(u.slot / Math.max(1, g._stepCols || 1));
      const closing = stopRow > 0 && !g.marching && !u.mounted && !g.isGun && !g.cav && !g.routed && !(g.cavShare > 0.1) && (g.formation === 'line' || g.formation === 'yari') &&
        g._stopT != null && this.time - g._stopT < Math.min(0.65, stopRow * 0.18) + 0.25;
      const stay = !closing && !busy && g.anchorSpeed < 0.3 && ((u.jammed && d < 1.6) || (u.settled ? d < 0.9 : d < 0.3 || u.nearT > 3));
      if (stay) {
        u.settled = true; face = g._face ?? g.facing;
        // 円陣の者は輪の外を向く
        if (g.formation === 'ring' && u !== g.leader) face = Math.atan2(u.pos.x - g.anchor.x, u.pos.z - g.anchor.z);
        // 勝鬨の輪の者は旗の方を向く
        if (g.victory && this.time - g.victory.t < 14) face = Math.atan2(g.victory.at.x - u.pos.x, g.victory.at.z - u.pos.z);
        const w = u.watch;
        if (w && w.alive) {
          face = Math.atan2(w.pos.x - u.pos.x, w.pos.z - u.pos.z);
          // 棒立ちにならないよう、ときどき小さく足を踏みかえる
          if (!(u.stepT > 0) && Math.random() < dt * 0.35) {
            const a = Math.random() * Math.PI * 2;
            u.stepTo = localPoint(this, u, u.stepPoint || (u.stepPoint = { x: 0, z: 0 }), u.moveTo.x + Math.sin(a) * 0.3, u.moveTo.z + Math.cos(a) * 0.3); u.stepT = 0.6;
          }
          if (u.stepT > 0) { u.stepT -= dt; want = u.stepTo; speed = u.speed * 0.35; }
        } else u.stepT = 0;
        // 着いた兵には古い行き先を残さない。次の下知では think が付け直す。
        if (!want) u.moveTo = null;
      } else if (d > 0.05) {
        u.settled = false; u.stepT = 0;
        want = u.moveTo;
        speed = d > 4 || busy || g.anchorSpeed > u.speed * 0.85 || (u.frontlineStep?.until > this.time && !u.frontlineStep.spread) ? u.run : u.speed;
        // 騎馬の隊が駆けて寄せるとき（逃げるときは除く）。逆茂木の帯・馬防柵の3m内では突撃を始めない（束22）
        if (u.type === 'cavalry' && !busy && d > 12 && g.anchorSpeed > 2.5 && !u._bandCut && !nearNochargeFence(this, u)) this.startCharge(u, near);
      }
    }
    if (u.pressBack?.target?.alive) face = this.faceTo(u, u.pressBack.target);
    // 追手へ応戦しても退く下知を捨てない。突き終えるまで立ち止まらず組へ下がる。
    if (u.combatRetreat && !u.mounted && !u.fleeing && u.moveTo) {
      want = u.moveTo; speed = Math.min(speed, u.speed * 0.75);
      if (u.target?.alive) face = this.faceTo(u, u.target);
      else face = g._face ?? g.facing;
    }
    // 駆けている騎馬：槍衾に当たれば止められる。足が止まれば駆けるのをやめる
    // 行軍する隊の足もとに低い土ぼこり（乾いた日だけ・近くの兵だけ。雨の後は出さない）
    if (!u.mounted && g && g.marching && u.camD < 45 && !(this.rain > 0.1) && !(this.world && this.world.def && this.world.def.muddy) && u.moving > 0.4 && Math.random() < dt * 1.2) {
      this.burst(u.pos.x, u.pos.y + 0.05, u.pos.z, 1, 'dust', 0, 0);
    }
    // 既存の粒を使い回す。全騎合計で0.1秒に通常24粒・低画質8粒・動きを減らす時4粒まで。
    const hoofCalm = S.reduceMotion, hoofLow = S.quality === 'low', hoofCap = hoofCalm ? 4 : hoofLow ? 8 : 24;
    if (u.mounted && u.camD < (hoofCalm ? 24 : hoofLow ? 36 : 60) && this.world.dustP && Math.hypot(u.mv.x, u.mv.z) > 4.5 &&
      !(this.rain > 0.3) && !(this.world.rainLevel > 0.3) && !(this.world.wetness > 0.5) &&
      !this.world.def.muddy && !this.world.inWaterAt(u.pos.x, u.pos.z) && this.time >= (u._hoofDustAt || 0)) {
      u._hoofDustAt = this.time + (hoofCalm ? 0.4 : hoofLow ? 0.28 : 0.18);
      if (this.time >= (this._hoofDustReset || 0)) { this._hoofDustReset = this.time + 0.1; this._hoofDustN = 0; }
      const n = Math.max(0, Math.min(hoofCalm ? 1 : hoofLow ? 2 : u.camD < 18 ? 6 : 3, hoofCap - (this._hoofDustN || 0)));
      this._hoofDustN = (this._hoofDustN || 0) + n;
      const D = this.world.dustP, fx = Math.sin(u.heading), fz = Math.cos(u.heading);
      const bx = u.pos.x - fx * 1.1, bz = u.pos.z - fz * 1.1, y = this.world.heightAt(bx, bz) + 0.1;
      for (let j = 0; j < n; j++) {
        const i = D.i = (D.i + 1) % D.life.length, k = i * 3;
        D.pos[k] = bx + (Math.random() - 0.5) * 0.9; D.pos[k + 1] = y; D.pos[k + 2] = bz + (Math.random() - 0.5) * 0.9;
        const drift = hoofCalm ? 0.25 : 1;
        D.vel[k] = (-fx * 0.7 + (Math.random() - 0.5) * 0.8) * drift;
        D.vel[k + 1] = (0.4 + Math.random() * 0.5) * drift;
        D.vel[k + 2] = (-fz * 0.7 + (Math.random() - 0.5) * 0.8) * drift;
        D.life[i] = D.max[i] = hoofCalm || hoofLow ? 0.8 + Math.random() * 0.6 : 1.4 + Math.random() * 1.2;
      }
    }
    if (u.mounted && !u.fleeing && !(u.stagger > 0) && Math.hypot(u.mv.x, u.mv.z) > 4) this.checkYari(u);
    if (u.charging && u.type === 'cavalry') {
      // 逆茂木の帯に入った・馬防柵の3m内に来たら、突撃を切ってその場で止まる（束22）
      if (u.charging && (u._bandCut || nearNochargeFence(this, u))) {
        u.charging = false; u.chargeCd = this.time + 2; u.stagger = Math.max(u.stagger || 0, 1.5);
        u.mv.x *= 0.2; u.mv.z *= 0.2; this.play('neigh', u.pos, 0.6);
      }
      // 玉突き：前で止められた味方の馬（竿立ち）にぶつかり、後ろの騎馬も詰まって止まる
      if (u.charging) {
        const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
        let jam = null;
        this.forNear(u.pos.x, u.pos.z, 2.6, (o) => {
          if (jam || o === u || !o.alive || !o.mounted || o.team !== u.team || !(o.stagger > 0.5)) return;
          const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, dd = Math.hypot(dx, dz);
          if (dd < 2.6 && (dx * fx + dz * fz) / (dd || 1) > 0.6) jam = o;
        });
        if (jam) { u.charging = false; u.chargeCd = this.time + 3; u.stagger = 0.7; u.mv.x *= 0.3; u.mv.z *= 0.3; this.play('neigh', u.pos, 0.6); }
      }
      if (u.charging && this.time - (u.chargeT || 0) > 2.5 && Math.hypot(u.mv.x, u.mv.z) < 2.5) u.charging = false;
    }
    if (u.mounted && !(u.stagger > 0)) {
      const loss = this.trample(u, Math.hypot(u.mv.x, u.mv.z));
      u.mv.x *= loss; u.mv.z *= loss; speed *= loss;
    }
    // 手負いは鈍り、縦陣は速く、槍衾の前では足が止まる
    if (u.hp < u.maxHp * 0.3) speed *= 0.75;
    // 手傷で退く徒歩の武将は、肩を借りて歩く速さ（走らない）
    if (u.woundOut && !u.mounted && u.woundOut.t > this.time && !u.fleeing) speed = Math.min(speed, u.speed * 0.6);
    // 休息と走りの疲れは、早く戻る処理より先に数える。
    if (!u.isPlayer) {
      speed *= 1 - 0.3 * Math.max(0, (u.fat || 0) - 0.2) / 0.8;
      if (u.mounted) speed *= 1 - 0.4 * Math.max(0, (u.hfat || 0) - 0.15) / 0.85;
    }
    if (g.formation === 'column') speed *= 1.15;
    // 倒れた体の上は足もとが悪い（踏み越えるのに足が鈍る）
    if (this.corpses && this.corpses.size && !u.mounted && this.corpses.get((Math.floor(u.pos.x / 2) + 20000) * 40000 + Math.floor(u.pos.z / 2) + 20000)) speed *= 0.8;
    if (u.target && u.target.group && u.target.group.formation === 'yari' && !u.target.isStruct && u.team !== u.target.team && u.type !== 'cavalry' && this.distTo(u, u.target) < 4.5) speed *= 0.4;
    if (u.fleeing) speed = u.run * (0.9 + ((u.id * 0.377) % 1) * 0.3)
      * (1 - 0.35 * (u.fat || 0)) * (u.mounted ? 1 - 0.4 * (u.hfat || 0) : 1)
      * (u.hp < u.maxHp * 0.3 ? 0.75 : 1);   // 逃げても疲れや手傷は消えない
    else if (u.woundOut && u.woundOut.t > this.time) speed = Math.min(speed, u.mounted ? u.speed : u.speed * 0.6);   // 手傷の武将は歩いて退く
    if (u.rearWound && !u.fleeing && !u.swing && !(u.stagger > 0)) {
      want = u.rearWound.to; speed = u.speed * 0.45;
      if (u.target?.alive) face = this.faceTo(u, u.target);
    }
    if (u.confused > 0) speed = u.speed * 0.6;
    if (u.hit?.kind === 'trample') { want = null; speed = 0; }
    if (u.mounted && u.stagger > 0) { want = null; speed = 0; }   // 竿立ちの間は動けない
    // 逃げる時も馬の傷・疲れと深手は消えない。上の走りへの上書きの後に制限する。
    if (u.mounted && !u.isPlayer) {
      const health = u.horseMax ? u.horseHp / u.horseMax : 1;
      const fatigue = Math.max(0, (u.hfat || 0) - 0.15) / 0.85;
      const exhausted = horseExhausted(u.horse?.userData.horse, u.hfat || 0);
      const cap = (exhausted ? Math.min(2.2, u.speed) : health < 0.3 ? u.speed : u.run) * Math.max(0.3, Math.min(1, health / 0.6)) * (1 - 0.4 * fatigue);
      speed = Math.min(speed, cap);
      if (health < 0.3 || exhausted) u.charging = false;
    }
    if ((u.rangedWound > 0 || u.woundSlow > 0) && !u.mounted) speed = Math.min(speed, u.speed * (1 - Math.max(u.rangedWound || 0, u.woundSlow || 0)));
    if (u.mounted && !u.isPlayer && horseThreatTick(this, u, dt)) {
      want = null; speed = 0; u.mv.x = u.mv.z = u.vel.x = u.vel.z = 0;
    }
    if (u.mounted && u.stagger > 0) { want = null; speed = 0; }
    const mill = millTick(this, u, dt, want);
    if (mill) { want = mill; speed = u.speed * (u.mounted ? 0.45 : 0.4); face = mill.face; }
    this.steer(u, dt, want, speed, face);
  }
};
