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
    // 11/18 クラウド 紀州の持ち主（⑤開城の写真：土橋の脇の水の中に、舟の無い雑賀衆が胸まで浸かって指物だけ立てて残る）：
    //   塀の外に残った組は逃げ散らさず、北の門から城の中へ退かせる（水の中に立ち尽くさない）
    const out = g.units.filter((u) => u.alive && !u.gone && !u.isStruct && Math.max(Math.abs(u.pos.x), Math.abs(u.pos.z)) > 23.5);
    if (out.length && out.length >= g.units.filter((u) => u.alive && !u.gone).length / 2) {
      g.noRout = true; g.morale = 40; g.stay = false; g.noAI = true; g.order = 'move';
      // 塀の角を回って北の門の前（0,-31）、門をくぐって城の中（0,-14）へ。道筋は toCastleTick が一つずつ進める
      const cx = out.reduce((a, u) => a + u.pos.x, 0) / out.length, cz = out.reduce((a, u) => a + u.pos.z, 0) / out.length;
      // 11/28 07:20 クラウド 紀州の持ち主（act bot ★★ 436秒「太田の城の西の備 一」6人が南の塀の外 (-13,26) で一点に重なり止まった）：
      //   南の塀の外の組は北の門へ真っすぐ向かうと塀に当たる。南の角 (±28,28) を回ってから西か東の辺を北へ上がる
      const s = Math.sign(cx) || -1;
      g._toCastle = (cz > 25 ? [{ x: s * 28, z: 28 }, { x: s * 28, z: -31 }] : Math.abs(cx) > 23.5 && cz > -27 ? [{ x: s * 28, z: -31 }] : []).concat([{ x: 0, z: -31 }, { x: 0, z: -14 }]);
      g.dest = { ...g._toCastle[0] }; g.anchor = { ...g.dest };
      for (const u of g.units) { u.fleeing = false; u.target = null; }
    }
  }
}
// 開城で城へ退く組を、道筋の一つ目に着いたら次へ進める（s5 の tick から毎コマ）
export function toCastleTick(rt) {
  for (const g of rt.army.groups || []) {
    const W = g._toCastle; if (!W || !W.length) continue;
    const us = g.units.filter((u) => u.alive && !u.gone); if (!us.length) { g._toCastle = null; continue; }
    const cx = us.reduce((a, u) => a + u.pos.x, 0) / us.length, cz = us.reduce((a, u) => a + u.pos.z, 0) / us.length;
    g.dest = { ...W[0] }; g.anchor = { ...W[0] };
    if (Math.hypot(cx - W[0].x, cz - W[0].z) < 4 && W.length > 1) W.shift();
  }
}
