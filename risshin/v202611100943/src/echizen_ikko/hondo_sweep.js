// 本堂を押さえる段（十七日の朝）：堂の中・縁の下・切岸の上で動けなくなった衆徒が一人残ると、
//   「本堂を味方と押さえる」のまま七分止まった（11/9 二巡・織田H の流し）。
//   本人が外堂・本堂の近くにいる間だけ、五秒ごとに堂の区域を見て、交戦せず詰まった者の経路を引き直す。
import { siegeFighter } from '../siege_zones.js';

export function fighting(rt, u) {
  const target = u.target;
  return !!(u.atk || u.swing || u.charging || target && siegeFighter(target) &&
    Math.hypot(target.pos.x - u.pos.x, target.pos.z - u.pos.z) <= (u.range || 4) &&
    !rt.army.wallBetween(u.pos, -1, target.pos));
}

// 時間だけで敵を消さない。既存の戸口・石段の案内を使い、近い寄せ手へ歩かせる。
export function resume(rt, u) {
  // 倒れた者や後送中の者を、詰まった守兵として歩かせない。
  if (!siegeFighter(u) || u.hp <= 0 || u.dying || u.rearWound) return;
  let way = null, nearest = Infinity;
  for (const v of rt.army.units) {
    if (v.team === u.team || !siegeFighter(v) || v.hp <= 0 || v.dying || v.rearWound) continue;
    const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z);
    if (d >= nearest) continue;
    // 最寄りの兵への道が塞がっていても、ほかの寄せ手へ出られる道を探す。
    const candidate = rt.def.world.moveWay(rt.army, u, v.pos);
    if (!candidate || rt.army.wallBetween(u.pos, -1, candidate)) continue;
    // 戸口の折り返しが現在地を返す時は、そこへ歩き直しても詰まりが続く。
    // その兵への案内だけを飛ばし、ほかの寄せ手へ踏み出せる道を探す。
    if (Math.hypot(candidate.x - u.pos.x, candidate.z - u.pos.z) < .35) continue;
    const point = u._ikSweepWay || (u._ikSweepWay = { x: 0, z: 0 });
    point.x = candidate.x; point.z = candidate.z;
    way = point; nearest = d;
  }
  if (!way) return;
  u.target = null; u.watch = null; u.moveTo = way; u.aiT = 2;
}

export function tick(rt, dt, zone, near) {
  const F = rt.flags;
  if (F.ending || !zone || (F.ikHondoSweepT = (F.ikHondoSweepT || 0) - dt) > 0) return;
  F.ikHondoSweepT = 5;
  for (const u of rt.army.units) {
    if (u.team !== 1) continue;
    if (!near || !siegeFighter(u) || u.hp <= 0 || u.dying || u.rearWound || !zone.test(u.pos.x, u.pos.z) || fighting(rt, u)) {
      u._ikHondoStill = null; continue;
    }
    const s = u._ikHondoStill;
    if (!s || Math.hypot(u.pos.x - s.x, u.pos.z - s.z) > 1.5) { u._ikHondoStill = { x: u.pos.x, z: u.pos.z, t: rt.t }; continue; }
    if (rt.t - s.t > 45) { resume(rt, u); s.t = rt.t; }
  }
}
