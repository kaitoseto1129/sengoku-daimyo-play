// 櫓を取る流れ。近い櫓だけ半秒ごとに調べ、本物の兵の上限を守る。
export function yaguraTick(rt, I, inside, dt) {
  if (rt.over || rt.def.town || !rt.player.u.alive) return;
  I.fightT = (I.fightT || 0) + dt;
  if (I.fightT < .5) return;
  I.fightT = 0;
  const A = rt.army, team = rt.player.u.team;
  let enemies = 0, live = 0;
  for (const u of A.units) {
    if (!u.alive || u.isStruct) continue;
    live++;
    if (u.team === team) continue;
    const dx = u.pos.x - I.x, dz = u.pos.z - I.z;
    const lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
    for (const lv of I.levels) {
      if (Math.abs(lx) < lv.w / 2 + .1 && Math.abs(lz) < lv.d / 2 + .1 && u.pos.y >= lv.y - .6 && u.pos.y <= lv.y + lv.h) { enemies++; break; }
    }
  }
  // 室内の守りが足場から押し出された時も、倒すまでは占領にならない。
  if (!enemies) for (const g of I.guards || []) for (const u of g.units) if (u.alive && u.team !== team) enemies++;
  if (enemies) I.hadEnemy = true;
  if (I.team != null && I.team !== team || I.guardTeam != null && I.guardTeam !== team && I.guards?.some(g => g.units.length)) I.hadEnemy = true;
  if (!I.hadEnemy || I.captured) return;
  const id = `yagura_take_${I.id}`;
  if (!I.takeTask && rt.obj && rt.marker) {
    I.takeTask = true;
    rt.obj(id, `${I.name}を取れ。中の敵を倒せ`, 'side');
    rt.marker(id, I.doorOut, () => I.captured ? null : `${I.name}の入口`, { h: 1.5 });
    rt.bark('櫓の入口から中へ。狭い中では刀が使いやすい');
  }
  I.takeTime = inside && !enemies ? (I.takeTime || 0) + .5 : 0;
  if (I.takeTime < 1.5) return;
  // 味方の射手を置く枠が空くまで待つ。人数を増やしすぎない。
  if (live >= 250) return;
  const lv = I.levels[I.levels.length - 1], spots = lv.shots;
  if (!spots.length) return;
  const ref = A.groups.find(g => g.team === team && !g.civ && g.units.length);
  const g = A.addGroup({ team, faction: ref?.faction, name: `${I.name}の味方`, order: 'hold',
    anchor: { x: I.x, z: I.z }, facing: spots[0].heading, morale: 100, noRout: true, aggro: 2, interiorHold: true });
  g.fire = true;
  const us = A.spawn(g, [{ type: 'bow', n: Math.min(2, 250 - live, spots.length), o: { flag: null } }]);
  if (!us.length) return;
  for (let j = 0; j < us.length; j++) {
    const u = us[j], p = spots[j];
    u.pos.set(p.x, p.y, p.z); u.perch = p; u.heading = p.heading; u.naka = I.id + 1;
    if (u.mesh) { u.mesh.position.copy(u.pos); u.mesh.rotation.y = u.heading; }
  }
  I.captured = true; I.team = team; I.friendlyGuard = g;
  if (I.struct) I.struct.team = team;
  rt.objDone(id);
  rt.bark(`${I.name}を取った。味方が小窓から射る`);
}
