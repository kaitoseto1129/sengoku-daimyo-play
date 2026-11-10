// ======================================================================
// 賤ヶ岳の戦い　軍勢の厚み・陣立ての表（docs/army_depth_howto.md・docs/generals_toyo_toku_1108.md の 2）
//   ゲームの 1 は実の 8m。北（−z）が柴田方の行市山・別所山・茂山、南が羽柴方の砦。砦の備は軽い作りで、自分からは出ない。
//   羽柴：桑山重晴（賤ヶ岳の砦）・高山右近（岩崎山）・堀秀政（東野山）・秀長（田上山の本陣）・木下一元（堂木山）・木村隼人正（神明山）・
//         丹羽長秀（船で来援）・七本槍の小姓衆と先手（夜に着く）。中川清秀の大岩山は軽い合戦（open.js）
//   柴田：佐久間盛政（大岩山へ寄せる）・柴田勝政（殿）・前田利家（茂山）・不破勝光と金森長近（行市山の後ろ）・前田利長（別所山）・柴田勝家（狐塚の本陣）
// ======================================================================
const F = (k) => (rt) => rt.flags[k];

export const T02_DEPTH = {
  byMen: true,   // 軽い兵を布陣図の兵数の比で配る（docs/fujin/。豊臣A 11/9）
  A: { name: '羽柴', facing: Math.PI, honjin: { x: 300, z: 190 }, mpu: 8, formation: '雁行', terrain: 'mountain', flag: 'kiri53', armor: 0x24201c, openAt: 9999, attrition: 0.001,
    sonae: [
      { id: 'kuwayama', layer: 'sakite', wing: 'left', men: 1000, taisho: '桑山重晴', bind: F('fortG') },
      { id: 'takayama', layer: 'sakite', wing: 'center', men: 2000, taisho: '高山右近', flag: 'kuroda', hold: true, at: { x: 62, z: -3 } },
      { id: 'kinoshita', layer: 'ichi', wing: 'left', men: 1500, taisho: '木下一元', hold: true, at: { x: -78, z: -147 } },
      { id: 'kimura', layer: 'ichi', wing: 'left', men: 1500, taisho: '木村隼人正', hold: true, at: { x: -162, z: -109 } },
      { id: 'hori', layer: 'ichi', wing: 'right', men: 5000, taisho: '堀秀政', flag: 'hori', hold: true, at: { x: 250, z: -150 } },
      { id: 'niwa', layer: 'ni', wing: 'left', men: 2000, taisho: '丹羽長秀', flag: 'sujikai', bind: F('niwaG') },
      { id: 'kosho', layer: 'ni', wing: 'center', men: 1000, taisho: '加藤清正', bind: F('yari') },
      { id: 'saki', layer: 'ni', wing: 'center', men: 5000, taisho: '', bind: F('uma') },
      { id: 'hidenaga', layer: 'yobi', wing: 'right', men: 15000, taisho: '羽柴秀長', hold: true, at: { x: 300, z: 190 } },
      // 布陣図（docs/fujin/t02_shizugatake.md）：大垣から駆け戻った秀吉の本隊およそ一万五千
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 15000, taisho: '羽柴秀吉', bind: F('hide') },
    ] },
  B: { name: '柴田', facing: 0, honjin: { x: -90, z: -380 }, mpu: 8, formation: '長蛇', terrain: 'mountain', flag: 'kari', armor: 0x2a2420, uma: 'kasa', openAt: 9999, attrition: 0.001,
    sonae: [
      { id: 'sakuma', layer: 'sakite', wing: 'center', men: 8000, taisho: '佐久間盛政', flag: 'sakuma', bind: F('saku') },
      { id: 'katsumasa', layer: 'ichi', wing: 'left', men: 3000, taisho: '毛受勝照', bind: F('kmG') },
      { id: 'maeda', layer: 'ichi', wing: 'right', men: 2000, taisho: '前田利家', flag: 'maeda', bind: F('maedaG') },
      { id: 'toshinaga', layer: 'ni', wing: 'right', men: 1000, taisho: '前田利長', flag: 'maeda', hold: true, at: { x: -216, z: -334 } },
      { id: 'fuwa', layer: 'ni', wing: 'center', men: 1500, taisho: '不破勝光', flag: 'sakuma', hold: true, at: { x: -306, z: -285 } },
      { id: 'kanamori', layer: 'yobi', wing: 'center', men: 1500, taisho: '金森長近', flag: 'kanamori', hold: true, at: { x: -250, z: -330 } },
      { id: 'tokuyama', layer: 'yobi', wing: 'left', men: 1500, taisho: '徳山則秀', hold: true, at: { x: -130, z: -352 } },
      { id: 'hara', layer: 'yobi', wing: 'right', men: 1500, taisho: '原長頼', hold: true, at: { x: -52, z: -344 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 10000, taisho: '柴田勝家', hold: true, at: { x: -90, z: -370 } },
    ] },
  honjinView: { A: false, B: true },   // 勝家の狐塚の本陣（陣幕・馬印）を描く。羽柴の本陣は夜に戦のファイルが張る
};
