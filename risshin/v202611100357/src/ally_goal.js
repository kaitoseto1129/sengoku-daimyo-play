// 味方の備も本人と一緒に目標へ進む（kaito 物差し 一-5・九-4・BR「味方が進まない。後続が来ない。自分一人で突っ込む形になる」。全戦共通。battle.js が毎コマ呼ぶ）
//   今の目標に行き先が決まっていて、本人がそこへ向かって歩き出した（四秒で六 m 以上近づいた）時：本人の 50m の内で持ち場に控えている味方の備を、
//   隊のまま行き先へ進める。着く所は本人から見た今の並び（左右・前後）を 14m の内に縮めた所で、一つ所に固まらない。
//   着いて敵が近ければ「かかれ」、いなければその場で構える。兵は足さず、消さない。
//   筋書きで動く隊（historicalOrders・noAI・siegeAI・stay・guard・garrison・伏兵・控え）・大将の隊・自分の組・鉄砲と弓だけの備は動かさない。def.noAllyGoal で止める。
import { goalTarget } from './goals5.js';
import { scriptedAlly } from './ally_orders.js';

const NEAR = 50;    // 本人のこの内の備を連れて行く
const ARRIVE = 18;  // 行き先のこの内の備は動かさない
const SPREAD = 14;  // 着く所の広がり

const free = (g, me) => g.team === me && g.count >= 3 && !g.routed && !g.civ && !g.hidden && !g.ambush && !g.stay && !g.guard && !g.guardOn && !g.reserve &&
  !g.noAI && !g.siegeAI && !g._massOwn && !g.dispatch && !g.garrison && !g.isPlayerSquad && !g.isTomo && !g.pending && !(g.focus && g.focus.alive) &&
  (g.order === 'hold' || g.order === 'follow' || g.order === 'idle') && !scriptedAlly(g) &&
  !g.units.some((u) => u.alive && (u.isTaisho || u.isLord || u.oTaisho)) &&
  g.units.some((u) => u.alive && (u.sidearm || u.type !== 'gun' && u.type !== 'bow'));

export function allyGoalTick(rt, dt) {
  const def = rt.def, A = rt.army, P = rt.player?.u;
  if (!A || !P || !P.alive || rt.over || rt.aftermath || def.noAllyGoal || def.dojo || def.town || !rt._g5) return;
  if ((rt._agT = (rt._agT || 0) - dt) > 0) return;
  rt._agT = 1;
  let at = null;
  try { at = goalTarget(rt); } catch (e) { at = null; }
  if (!at || at.unit || !Number.isFinite(at.x) || !Number.isFinite(at.z)) { rt._agHist = null; return; }
  const D = Math.hypot(P.pos.x - at.x, P.pos.z - at.z);
  // 本人の近づき方を四秒分だけ覚える（行き先が替われば覚え直す）
  const H = rt._agHist && rt._agHist.x === at.x && rt._agHist.z === at.z ? rt._agHist : (rt._agHist = { x: at.x, z: at.z, d: [] });
  H.d.push(D); if (H.d.length > 5) H.d.shift();
  if (D < ARRIVE + 6 || H.d.length < 5 || H.d[0] - D < 6) return;
  const fx = (at.x - P.pos.x) / D, fz = (at.z - P.pos.z) / D;
  for (const g of A.groups) {
    if (!free(g, P.team) || g._agGo > rt.t - 8) continue;
    const c = g.center(g._agProbe || (g._agProbe = {}));
    if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > NEAR || Math.hypot(c.x - at.x, c.z - at.z) < ARRIVE) continue;
    if (A.wallBetween(c, g.team, at)) continue;
    // 本人から見た今の並び（前後・左右）を縮めて、行き先のまわりへ写す
    const rx = c.x - P.pos.x, rz = c.z - P.pos.z;
    let side = rx * fz - rz * fx, back = -(rx * fx + rz * fz);
    side = Math.max(-SPREAD, Math.min(SPREAD, side)); back = Math.max(-4, Math.min(SPREAD * 0.6, back));
    let x = at.x + fz * side - fx * back, z = at.z - fx * side - fz * back;
    if (rt.world.walkable && !rt.world.walkable(x, z, c.y ?? P.pos.y)) { x = at.x - fx * 4; z = at.z - fz * 4; }
    g._agGo = rt.t;
    g.order = 'move';
    g.dest = { x, z };
    g.facing = Math.atan2(fx, fz);
    g.onArrive = (gg) => {
      if (gg.order !== 'move') return;
      const cc = gg.center(gg._agProbe);
      const foe = A.nearestEnemy(gg.units.find((u) => u.alive) || P, 30, (o) => !o.fleeing && !o.isStruct && !o.civ && !o.noTarget);
      if (foe) { gg.order = 'attack'; gg.seekRange = Math.max(gg.seekRange || 0, 30); }
      else { gg.order = 'hold'; if (gg.anchor) { gg.anchor.x = cc.x; gg.anchor.z = cc.z; } }
    };
    for (const u of g.units) if (u.alive && !u.fleeing) u.aiT = Math.min(u.aiT ?? 0, 0.1 + Math.random() * 0.5);
  }
}
