// 太田城 終わりの段の道具：城の鉄砲と残る兵を黙らせる
export { P, SAIKA } from './scene.js';
export function silenceAll(rt) {
  const F = rt.flags;
  if (F.posts) for (const u of F.posts.units) { u.gunAmmo = 0; u.target = null; }
  for (const g of rt.army.groups || []) if (g.team === 1 && g.count) { g.noRout = false; g.morale = 0; g.aggro = 0; }
}
