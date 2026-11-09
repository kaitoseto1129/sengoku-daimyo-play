// ======================================================================
// 小牧の対陣　軍勢の厚み・陣立ての表（docs/army_depth_howto.md・docs/generals_toyo_toku_1108.md の 3）
//   北（−z）が楽田の羽柴、南（+z）が小牧山の徳川・信雄。両軍とも砦を並べて動かない（hold）。本物の隊は bind で結ぶ。
//   羽柴：秀吉（楽田の本陣）・秀長・堀秀政・池田恒興・池田元助・森長可・羽柴秀次（中入りの大将）・日根野弘就（二重堀）
//   徳川・信雄：家康（小牧山）・織田信雄・酒井忠次・本多忠勝・榊原康政・井伊直政
// ======================================================================
const F = (k) => (rt) => rt.flags[k];

export const T03_DEPTH = {
  A: { name: '羽柴', facing: 0, honjin: { x: -40, z: -104 }, mpu: 10, formation: '鶴翼', terrain: 'plain', flag: 'toyotomi', armor: 0x2b2723, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'nijubori', layer: 'sakite', wing: 'left', men: 2000, taisho: '日根野弘就', bind: F('fort') },
      { id: 'hori', layer: 'ichi', wing: 'center', men: 3000, taisho: '堀秀政', flag: 'hori', hold: true, at: { x: 6, z: -58 } },
      { id: 'ikeda', layer: 'ichi', wing: 'right', men: 6000, taisho: '池田恒興', flag: 'ageha', hold: true, at: { x: 70, z: -92 } },
      { id: 'mori', layer: 'ichi', wing: 'right', men: 3000, taisho: '森長可', flag: 'tsuru', hold: true, at: { x: 96, z: -44 } },
      { id: 'motosuke', layer: 'ni', wing: 'right', men: 2000, taisho: '池田元助', flag: 'ageha', hold: true, at: { x: 118, z: -86 } },
      { id: 'hidetsugu', layer: 'ni', wing: 'center', men: 8000, taisho: '羽柴秀次', hold: true, at: { x: 40, z: -112 } },
      { id: 'hidenaga', layer: 'yobi', wing: 'left', men: 6000, taisho: '羽柴秀長', hold: true, at: { x: -112, z: -54 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 10000, taisho: '羽柴秀吉', bind: F('rakuda') },
    ] },
  B: { name: '徳川・信雄', facing: Math.PI, honjin: { x: -100, z: 95 }, mpu: 10, formation: '方円', terrain: 'castle', flag: 'tokugawa', armor: 0x1f1e1c, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'sakai', layer: 'sakite', wing: 'right', men: 5000, taisho: '酒井忠次', flag: 'katabami', hold: true, at: { x: -150, z: 78 } },
      { id: 'honda', layer: 'ichi', wing: 'center', men: 2000, taisho: '本多忠勝', flag: 'honda', hold: true, at: { x: -56, z: 100 } },
      { id: 'sakakibara', layer: 'ichi', wing: 'left', men: 2000, taisho: '榊原康政', flag: 'sakakibara', hold: true, at: { x: -20, z: 104 } },
      { id: 'ii', layer: 'ni', wing: 'left', men: 3000, taisho: '井伊直政', flag: 'ii', hold: true, at: { x: 40, z: 112 } },
      { id: 'nobukatsu', layer: 'honjin', wing: 'left', men: 10000, taisho: '織田信雄', bind: (rt) => rt.flags.honjin?.[1] },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 8000, taisho: '徳川家康', bind: (rt) => rt.flags.honjin?.[0] },
    ] },
  honjinView: { A: false, B: false },   // 楽田と小牧山の本陣は戦のファイル（camp.js）が作る
};
