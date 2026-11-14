// 太田城 終わりの段の道具：城の鉄砲と残る兵を黙らせる
export { P, SAIKA } from './scene.js';
export function silenceAll(rt) {
  const F = rt.flags;
  if (F.posts) for (const u of F.posts.units) { u.gunAmmo = 0; u.target = null; }
  for (const g of rt.army.groups || []) if (g.team === 1 && g.count) { g.noRout = false; g.morale = 0; g.aggro = 0;
    // 待つ備から出た新手も開城では逃げ散る（11/14 クラウドゆ act bot：⑤に入って8秒後に新手の侍に討たれ、開城の段で倒れた）
    if (g.isReserve || g._rsv || g.name === '新手') { g.stay = false; for (const u of g.units) if (u.alive) { u.fleeing = true; u.target = null; } }
  }
}
