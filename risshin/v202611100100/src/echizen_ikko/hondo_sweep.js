// 本堂を押さえる段（十七日の朝）：堂の中・縁の下・切岸の上で動けなくなった衆徒が一人残ると、
//   「本堂を味方と押さえる」のまま七分止まった（11/9 二巡・織田H の流し）。
//   本人が本堂の近くにいる間だけ、五秒ごとに堂の区域を見て、四十五秒動かない者は味方の手に討たれた事にする。
export function tick(rt, dt, zone, near) {
  const F = rt.flags;
  if (F.ending || !zone || (F.ikHondoSweepT = (F.ikHondoSweepT || 0) - dt) > 0) return;
  F.ikHondoSweepT = 5;
  if (!near) return;
  for (const u of rt.army.units) {
    if (u.team !== 1 || !u.alive || u.fleeing || u.isStruct || !zone.test(u.pos.x, u.pos.z)) continue;
    const s = u._ikHondoStill;
    if (!s || Math.hypot(u.pos.x - s.x, u.pos.z - s.z) > 1.5) { u._ikHondoStill = { x: u.pos.x, z: u.pos.z, t: rt.t }; continue; }
    if (rt.t - s.t > 45) rt.army.kill(u, null);
  }
}
