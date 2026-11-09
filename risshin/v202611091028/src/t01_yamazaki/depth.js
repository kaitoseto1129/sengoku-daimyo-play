// ======================================================================
// 山崎の戦い　軍勢の厚み・陣立ての表（docs/army_depth_howto.md・docs/generals_toyo_toku_1108.md の 1）
//   ゲームの 1 は実の 6m。北（−z）が明智、南（+z）が羽柴。本物の兵の隊は bind で結ぶ。軽い備は奥の層と翼だけ（自分からは出ない）。
//   羽柴：高山右近（中央先鋒）・中川清秀（中央左）・池田恒興（川手）・堀秀政（中央の二陣）・秀長と官兵衛（山手）・丹羽長秀と織田信孝（後詰）・秀吉（本陣）
//   明智：斎藤利三（前衛）・伊勢貞興（川手→中川へ）・津田信春（淀川側）・松田政近（山手）・阿閉貞征（中央の二陣）・御牧兼顕（殿）・明智秀満（勝竜寺の後詰）・光秀（御坊塚）
// ======================================================================
const F = (k) => (rt) => rt.flags[k];

export const T01_DEPTH = {
  A: { name: '羽柴', facing: Math.PI, honjin: { x: -34, z: 112 }, mpu: 6, formation: '鶴翼', terrain: 'marsh', flag: 'toyotomi', armor: 0x2a2622, openAt: 9999, attrition: 0.002,
    sonae: [
      { id: 'takayama', layer: 'sakite', wing: 'center', men: 2000, taisho: '高山右近', bind: F('taka') },
      { id: 'nakagawa', layer: 'ichi', wing: 'left', men: 2500, taisho: '中川清秀', bind: F('naka') },
      { id: 'ikeda', layer: 'ichi', wing: 'right', men: 4000, taisho: '池田恒興', flag: 'ageha', bind: F('ikeda') },
      { id: 'hidenaga', layer: 'ichi', wing: 'left', men: 4000, taisho: '羽柴秀長', bind: F('tenno') },
      { id: 'hori', layer: 'ni', wing: 'center', men: 3000, taisho: '堀秀政', flag: 'hori', bind: F('hori') },
      { id: 'kato', layer: 'ni', wing: 'right', men: 1000, taisho: '加藤光泰', bind: F('kato') },
      { id: 'niwa', layer: 'yobi', wing: 'left', men: 3000, taisho: '丹羽長秀', flag: 'sujikai', hold: true, at: { x: -70, z: 150 } },
      { id: 'nobutaka', layer: 'yobi', wing: 'right', men: 4000, taisho: '織田信孝', flag: 'toyotomi', hold: true, at: { x: 34, z: 150 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 6000, taisho: '羽柴秀吉', bind: F('hideG') },
    ] },
  B: { name: '明智', facing: 0, honjin: { x: 18, z: -158 }, mpu: 6, formation: '鶴翼', terrain: 'marsh', flag: 'akechi', armor: 0x2c2a27, openAt: 9999, attrition: 0.003,
    sonae: [
      { id: 'saito', layer: 'sakite', wing: 'center', men: 2000, taisho: '斎藤利三', bind: (rt) => rt.flags.saito || rt.flags.w1?.[1] },
      { id: 'ise', layer: 'ichi', wing: 'left', men: 2000, taisho: '伊勢貞興', bind: F('iseW') },
      { id: 'matsuda', layer: 'ichi', wing: 'left', men: 2000, taisho: '松田政近', bind: F('matsuda') },
      { id: 'tsuda', layer: 'ichi', wing: 'right', men: 2000, taisho: '津田信春', bind: F('tsuda') },
      { id: 'atsuji', layer: 'ni', wing: 'center', men: 2000, taisho: '阿閉貞征', hold: true, at: { x: -40, z: -96 } },
      { id: 'mizoo', layer: 'yobi', wing: 'center', men: 1500, taisho: '溝尾茂朝', bind: F('counter') },
      { id: 'mimaki', layer: 'yobi', wing: 'center', men: 1000, taisho: '御牧兼顕', bind: F('mimaki') },
      { id: 'hidemitsu', layer: 'gozume', wing: 'right', men: 2000, taisho: '明智秀満', hold: true, at: { x: 92, z: -196 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 2000, taisho: '明智光秀', bind: F('mitsuG') },
    ] },
  honjinView: { A: false, B: false },   // 両軍の本陣（陣幕・馬印）は戦のファイルが作る
};
