// 千石堀城の陣立て（docs/generals_toyo_toku_1108.md の 5・docs/army_depth_howto.md）
// 羽柴勢：本物の隊（秀次・筒井・堀・長谷川）に結び、必須の武将（秀長・中村一氏・仙石秀久）と出したい武将（小西行長・蜂須賀）は
// 周りの城の攻め手・別働隊として軽い備に散らす（門前に集めない）。囲みの備は自分から寄せない（hold）。
const F = (k) => (rt) => rt.flags[k];
export const depth = {
  A: { name: '羽柴', facing: 0, honjin: { x: -18, z: -118 }, mpu: 4, formation: '長蛇', terrain: 'castle', flag: 'toyotomi', armor: 0x282420, uma: 'fukube', openAt: 9999, attrition: 0,
    sonae: [
      { id: 'hidetsugu', layer: 'sakite', wing: 'center', men: 3000, taisho: '羽柴秀次', bind: F('friends') },
      { id: 'tsutsui', layer: 'ichi', wing: 'left', men: 3000, taisho: '筒井定次', flag: 'umebachi', bind: F('follow') },
      { id: 'hori', layer: 'ichi', wing: 'right', men: 3000, taisho: '堀秀政', flag: 'hori', bind: F('hori') },
      { id: 'hasegawa', layer: 'ni', wing: 'center', men: 1500, taisho: '長谷川秀一', bind: F('hase') },
      { id: 'nakamura', layer: 'ichi', wing: 'right', men: 4000, taisho: '中村一氏', at: { x: 92, z: -44 }, hold: true },
      { id: 'sengoku', layer: 'ichi', wing: 'left', men: 3000, taisho: '仙石秀久', at: { x: -88, z: -52 }, hold: true },
      { id: 'konishi', layer: 'ni', wing: 'left', men: 2000, taisho: '小西行長', flag: 'konishi', at: { x: -96, z: -110 }, hold: true },
      { id: 'hachisuka', layer: 'ni', wing: 'right', men: 3000, taisho: '蜂須賀正勝', flag: 'hachisuka', at: { x: 96, z: -112 }, hold: true },
      { id: 'hidenaga', layer: 'yobi', wing: 'center', men: 10000, taisho: '羽柴秀長', at: { x: 34, z: -150 }, hold: true },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 8000, taisho: '羽柴秀吉', at: { x: -18, z: -132 }, hold: true },
      { id: 'konida', layer: 'konida', wing: 'center', men: 800, at: { x: -44, z: -160 }, hold: true },
    ] },
  // 根来衆（docs/fujin/t04a_sengokubori.md）：城兵およそ千五百。本物の隊に結ぶ備と、本丸・二の丸の奥に残る軽い備。
  // 南の積善寺城・畠中城の城兵は遠くの軽い備（寄せ手の中村・仙石の前）。落ちる時は fallB で崩れる
  B: { name: '根来衆', facing: Math.PI, honjin: { x: 0, z: 40 }, mpu: 4, formation: '方円', terrain: 'castle', flag: 'maru', armor: 0x302a24, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'front', layer: 'sakite', wing: 'center', men: 150, taisho: '', bind: F('front') },
      { id: 'niGuard', layer: 'ichi', wing: 'center', men: 300, taisho: '', bind: F('niGuard') },
      { id: 'down', layer: 'ni', wing: 'center', men: 150, taisho: '', bind: F('down') },
      { id: 'hon', layer: 'honjin', wing: 'center', men: 600, taisho: '', at: { x: 0, z: 41 }, hold: true },
      { id: 'ni', layer: 'yobi', wing: 'right', men: 300, taisho: '', at: { x: 15, z: -12 }, hold: true },
      { id: 'sekizenji', layer: 'ichi', wing: 'left', men: 2000, taisho: '', at: { x: -92, z: -6 }, hold: true },
      { id: 'hatanaka', layer: 'ichi', wing: 'right', men: 1500, taisho: '', at: { x: 96, z: 2 }, hold: true },
    ] },
  honjinView: { A: false, B: false },   // 秀吉の本陣の陣幕は舞台（scene.js）が作る
};
