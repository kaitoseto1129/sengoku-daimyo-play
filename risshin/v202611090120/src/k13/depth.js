// 道明寺の陣立ての表（docs/army_depth_howto.md の型）。東（＋x）が奈良・国分、西（−x）が大坂。
//   徳川（大和口 三万四千）：松倉・奥田の先手 → 水野・本多・松平忠明 → 伊達・片倉 → 政宗の旗本 → 忠輝の本陣、国分の隘路の後続。
//   豊臣：後藤（小松山）→ 薄田・明石（道明寺）→ 真田・毛利（誉田。着くのは台本）。本物の隊は bind で結ぶ。
const F = (k) => (rt) => { const g = rt.flags[k]; return g && g.count ? g : null; };
const N = (re) => (rt) => rt.army.groups.find((g) => g.team === 1 && g.count && re.test(g.name || '')) || null;
export const DEPTH13 = {
  A: { name: '徳川', facing: -Math.PI / 2, honjin: { x: 178, z: -6 }, mpu: 6, formation: '長蛇', terrain: 'valley', flag: 'tokugawa', armor: 0x1f1e1c, openAt: 9999, attrition: 0.002,
    sonae: [
      { id: 'matsukura', layer: 'sakite', wing: 'center', men: 1000, taisho: '松倉重政', bind: F('matsukura') },
      { id: 'mizuno', layer: 'ichi', wing: 'center', men: 3800, taisho: '水野勝成', flag: 'mizuno', bind: F('mizuno') },
      { id: 'honda', layer: 'ichi', wing: 'right', men: 5000, taisho: '本多忠政', flag: 'honda', bind: F('honda') },
      { id: 'tadaaki', layer: 'ichi', wing: 'left', men: 3800, taisho: '松平忠明', bind: F('tadaaki') },
      { id: 'date', layer: 'ni', wing: 'right', men: 6000, taisho: '', flag: 'date', bind: F('date') },
      { id: 'katakura', layer: 'ni', wing: 'center', men: 1000, taisho: '片倉重綱', flag: 'date', bind: F('katakura') },
      { id: 'mizuno2', layer: 'ni', wing: 'left', men: 2000, taisho: '', flag: 'mizuno', at: { x: 150, z: 26 } },
      { id: 'masamune', layer: 'yobi', wing: 'right', men: 3000, taisho: '伊達政宗', flag: 'date', hold: true, bind: F('masamune') },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 2000, taisho: '松平忠輝', bind: F('tadateru') },
      { id: 'pass', layer: 'gozume', wing: 'center', men: 10000, taisho: '', hold: true, at: { x: 214, z: 2 } },
    ] },
  B: { name: '豊臣', facing: Math.PI / 2, honjin: { x: -236, z: 30 }, mpu: 6, formation: '魚鱗', terrain: 'plain', flag: 'toyotomi', armor: 0x2e2a26, uma: 'fukube', openAt: 9999, attrition: 0.003,
    sonae: [
      { id: 'goto', layer: 'sakite', wing: 'center', men: 2800, taisho: '後藤又兵衛', bind: N(/後藤/) },
      { id: 'susukida', layer: 'ichi', wing: 'center', men: 1500, taisho: '薄田兼相', bind: N(/薄田/) },
      { id: 'akashi', layer: 'ichi', wing: 'right', men: 2000, taisho: '明石全登', bind: N(/明石/) },
      { id: 'mori', layer: 'ni', wing: 'right', men: 4000, taisho: '毛利勝永', bind: N(/毛利/) },
      { id: 'sanada', layer: 'ni', wing: 'left', men: 3500, taisho: '真田信繁', flag: 'sanada', bind: N(/真田/) },
    ] },
  honjinView: { A: false, B: false },
};
