// 太田城 終わりの段の道具：城の鉄砲と残る兵を黙らせる
export { P, SAIKA } from './scene.js';
export function silenceAll(rt) {
  // 士気だけでは頭が健在の隊は戦い続け、弾切れの鉄砲兵も刀を抜く。
  // 開城では双方が手を止める。使者へ移る途中に残った斬撃も持ち越さない。
  for (const g of rt.army.groups || []) if (g.team === 0 || g.team === 1) {
    g.peaceful = true; g.fire = false; g.aggro = 0; g.seekRange = 0; g.focus = null;
    for (const u of g.units) if (!u.isPlayer) {
      u.target = null; u.watch = null; u.atk = null; u.swing = null; u.bind = null; u.charging = false;
      if (g.team === 1) { u.noTarget = true; u.gunAmmo = 0; u.arrowAmmo = 0; }
    }
    if (g.team !== 1) continue;
    g.noRout = false; g.morale = 0;
    // 待つ備から出た新手も開城では逃げ散る（11/14 クラウドゆ act bot：⑤に入って8秒後に新手の侍に討たれ、開城の段で倒れた）
    if (g.isReserve || g._rsv || g.name === '新手') { g.stay = false; for (const u of g.units) if (u.alive) { u.fleeing = true; u.target = null; } }
  }
}
