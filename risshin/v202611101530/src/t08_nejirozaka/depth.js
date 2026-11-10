// ======================================================================
// 根白坂　軍勢の厚み・陣立ての表（docs/army_depth_howto.md・docs/fujin/t08_nejirozaka.md）
//   北（−z）が豊臣（羽柴秀長の総勢八万余）、南（+z）が坂の下の島津（布陣図は二万余・始まりの札は三万五千。札に合わせた）。両軍とも動かない（hold）。
//   戦うのは砦の塀と坂（本物の兵）だけ。軽い備は砦の後ろの丘と、坂の下の田の奥と左右に置く（clear の外）。
//   本陣（秀長・義珍・義久・家久）は戦のファイル（honjin.js）が作るので honjinView は切る。
// ======================================================================
const F = (k) => (rt) => rt.flags[k];

export const T08_DEPTH = {
  byMen: true,
  A: { name: '豊臣', facing: 0, honjin: { x: 14, z: -96 }, mpu: 6, formation: '方円', terrain: 'castle', flag: 'toyotomi', armor: 0x2a2622, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'miyabe', layer: 'sakite', wing: 'center', men: 10000, taisho: '宮部継潤', bind: F('miyabe') },
      { id: 'kuroda', layer: 'ni', wing: 'left', men: 5000, taisho: '黒田孝高', flag: 'kuroda', hold: true, at: { x: -104, z: -96 } },
      { id: 'kobayakawa', layer: 'ni', wing: 'right', men: 10000, taisho: '小早川隆景', flag: 'kuki', hold: true, at: { x: 104, z: -104 } },
      { id: 'ukita', layer: 'yobi', wing: 'left', men: 15000, taisho: '宇喜多秀家', flag: 'ukita', hold: true, at: { x: -78, z: -142 } },
      { id: 'hidenaga2', layer: 'hatamoto', wing: 'right', men: 20000, taisho: '', hold: true, at: { x: 66, z: -148 } },
      { id: 'hidenaga', layer: 'honjin', wing: 'center', men: 15000, taisho: '羽柴秀長', bind: F('hidenaga') },
      { id: 'gozume', layer: 'gozume', wing: 'center', men: 8000, taisho: '', hold: true, at: { x: -6, z: -150 } },
      { id: 'konida', layer: 'konida', wing: 'center', men: 1500, hold: true, at: { x: 20, z: -168 } },
    ] },
  B: { name: '島津', facing: Math.PI, honjin: { x: 4, z: 150 }, mpu: 6, formation: '魚鱗', terrain: 'plain', flag: 'shimazu', armor: 0x1e1c1c, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'saruwatari', layer: 'sakite', wing: 'center', men: 5000, taisho: '猿渡信光', hold: true, at: { x: -96, z: 104 } },
      { id: 'yose_r', layer: 'ichi', wing: 'left', men: 6000, taisho: '', hold: true, at: { x: 104, z: 108 } },
      { id: 'yoshihiro2', layer: 'ni', wing: 'center', men: 7000, taisho: '', hold: true, at: { x: -72, z: 136 } },
      { id: 'iehisa2', layer: 'ni', wing: 'left', men: 6000, taisho: '', hold: true, at: { x: 84, z: 140 } },
      { id: 'yoshihisa2', layer: 'yobi', wing: 'right', men: 6000, taisho: '', hold: true, at: { x: -40, z: 172 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 2000, taisho: '島津義珍', bind: F('shHon') },
      { id: 'gozume', layer: 'gozume', wing: 'left', men: 3000, taisho: '', hold: true, at: { x: 52, z: 172 } },
    ] },
  honjinView: { A: false, B: false },
};
