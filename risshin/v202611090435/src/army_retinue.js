// 主を守る配下（自分の組＝isPlayerSquad・供と家臣＝isTomo）の判断（kaito 11/8 樫井「何もサポートしてくれない」）。
//   一、主に斬りかかる敵（振りかぶる・主を狙う）を先に討つ。供と家臣は二人まで、組の者も寄せる。
//   二、主が打ち合う相手（主の狙い＝fitT）へ加勢する。
//   三、主のそばの敵は、狙われていなくても自分から斬りかかる（すれ違わない・にらみ合わない）。
//   四、敵が近いのに討つ相手が無い時、供と家臣は主の身の回り（敵の側）に立って盾になる。
// 主のまわり 9m を一度だけ見て、0.25 秒は使い回す（毎コマ数えない。重さを増やさない）。
import { localPoint } from './army_local_way.js';

const R_NEAR = 9;

function melee(u) { return u.sidearm || (u.type !== 'bow' && u.type !== 'gun' && u.type !== 'porter' && u.type !== 'dummy'); }
function foeOk(o, P) {
  return o.alive && o.team !== P.team && !o.isStruct && !o.civ && !o.noTarget && !o.fleeing && !o.downed && !o.woundOut &&
    o.type !== 'dummy' && Math.abs(o.pos.y - P.pos.y) < 2.5;
}

function scan(army, P) {
  const C = army._retinue || (army._retinue = { t: -1, foes: [], threat: new Set(), mine: new Map(), near: null, nearD: 1e9 });
  if (army.time - C.t < 0.25) return C;
  C.t = army.time; C.foes.length = 0; C.threat.clear(); C.mine.clear(); C.near = null; C.nearD = 1e9;
  army.forNear(P.pos.x, P.pos.z, R_NEAR, (o) => {
    if (!foeOk(o, P)) return;
    const d = Math.hypot(o.pos.x - P.pos.x, o.pos.z - P.pos.z);
    if (d < C.nearD) { C.nearD = d; C.near = o; }
    if (d < 7 && (o.target === P || o.atk?.target === P || o.swing?.target === P) && (o.sidearm || o.type !== 'bow' && o.type !== 'gun')) C.threat.add(o);
    C.foes.push(o);
  });
  for (const o of army.threats || []) if (foeOk(o, P) && (o.sidearm || o.type !== 'bow' && o.type !== 'gun')) C.threat.add(o);
  const fit = P.fitT;
  C.fit = fit && foeOk(fit, P) && Math.hypot(fit.pos.x - P.pos.x, fit.pos.z - P.pos.z) < 12 ? fit : null;
  // 配下が今どの敵に掛かっているか（同じ敵に寄りすぎない）
  for (const g of army.groups) {
    if (g.team !== P.team || !(g.isPlayerSquad || g.isTomo)) continue;
    for (const v of g.units) if (v.alive && v.target && v.target.team !== P.team) C.mine.set(v.target, (C.mine.get(v.target) || 0) + 1);
  }
  return C;
}

// 配下の一人を決める。決めたら true（army_think の thinkBody から呼ぶ）
export function retinueThink(army, u) {
  const g = u.group, P = army.playerUnit;
  if (!(g.isPlayerSquad || g.isTomo) || !P || !P.alive || P.team !== u.team || army.duel || u.isPlayer) return false;
  if (u.fleeing || g.routed || g.order === 'retreat' || g.order === 'path' || u.woundOut || u.rearWound || u.climb || u.perch || !melee(u)) return false;
  if (Math.abs(P.pos.y - u.pos.y) > 2.5) return false;
  const dp = Math.hypot(P.pos.x - u.pos.x, P.pos.z - u.pos.z);
  const guard = g.isTomo;
  if (dp > (guard ? 26 : 22)) return false;
  const C = scan(army, P);
  if (!C.foes.length && !C.threat.size) return false;
  const cur = u.target;
  const holding = (o) => cur === o;
  const room = (o, cap) => holding(o) || (C.mine.get(o) || 0) < cap;
  const clear = (o) => !army.wallBetween(u.pos, u.team, o.pos, (u.wpnKind || u.lookWeapon) === 'spear');
  const take = (o) => {
    if (cur !== o) { C.mine.set(o, (C.mine.get(o) || 0) + 1); if (cur && C.mine.has(cur)) C.mine.set(cur, C.mine.get(cur) - 1); }
    u.target = o; u.watch = null; u.moveTo = null; u.pressBack = null;
    return true;
  };
  // 一、主に斬りかかる敵：近い順に。一人の敵に供・組あわせて三人まで（主の前に割って入る）
  let best = null, bd = 1e9;
  for (const o of C.threat) {
    if (!room(o, 3) || !clear(o)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) - (holding(o) ? 3 : 0);
    if (d < bd) { bd = d; best = o; }
  }
  if (best && bd < (guard ? 16 : 14)) return take(best);
  // 二、主が打ち合う相手へ加勢（四人まで。供と家臣が先）
  if (C.fit && room(C.fit, guard ? 4 : 3) && clear(C.fit) && Math.hypot(C.fit.pos.x - u.pos.x, C.fit.pos.z - u.pos.z) < 16) return take(C.fit);
  // 三、主のそばの敵（狙われていなくても）。今の相手が生きて近ければ続ける
  if (cur && cur.alive && cur.team !== u.team && !cur.isStruct && !cur.fleeing && Math.hypot(cur.pos.x - P.pos.x, cur.pos.z - P.pos.z) < R_NEAR + 2) return take(cur);
  best = null; bd = 1e9;
  for (const o of C.foes) {
    if (!room(o, 2) || !clear(o)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d < bd) { bd = d; best = o; }
  }
  if (best && bd < 12) return take(best);
  // 自分のそば（6m）の敵とは、主から少し離れていても斬り合う（突っ立たない）
  const self = army.nearestEnemy(u, 6, (o) => !o.fleeing && !o.isStruct && !o.civ && army.crowdOk(u, o) && clear(o));
  if (self) return take(self);
  // 四、供と家臣：討つ相手が埋まっていれば、主の身の回りの敵の側に立って盾になる（間近の敵は払う）
  if (guard && C.near) {
    const close = army.nearestEnemy(u, 2.5, (o) => !o.fleeing && clear(o));
    if (close) return take(close);
    const a0 = Math.atan2(C.near.pos.x - P.pos.x, C.near.pos.z - P.pos.z);
    const k = g.units.indexOf(u), n = Math.max(1, g.units.length);
    const a = a0 + (k - (n - 1) / 2) * 0.9, r = u.mounted ? 2.8 : 1.7;
    const q = u.moralePoint || (u.moralePoint = { x: 0, z: 0 });
    u.target = null; u.atk = null; u.watch = C.near;
    u.moveTo = localPoint(army, u, q, P.pos.x + Math.sin(a) * r, P.pos.z + Math.cos(a) * r);
    return true;
  }
  return false;
}
