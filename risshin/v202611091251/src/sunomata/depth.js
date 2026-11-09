// 墨俣の陣立ての表（docs/army_depth_howto.md の型・docs/generals_oda_1108.md の 4）。砦は真ん中。斎藤勢は北（−z）と西（−x）から寄せる。
//   織田：藤吉郎の本陣（本物）・前野の槍（本物）。南の川向こうに信長の本陣（小牧山の方。出ない）。
//   斎藤：一の手・二の手・三の手（本物の控えに結ぶ）・寄せ大将の備（本物）→ 稲葉山の方に斎藤龍興の本陣（出ない）。
const G = (k) => (rt) => { const g = rt.flags[k]; return g && g.count ? g : null; };
export const DEPTH_SUNOMATA = {
  A: { name: '織田', facing: Math.PI, honjin: { x: 0, z: 2 }, mpu: 3, formation: '方円', terrain: 'castle', flag: 'oda', armor: 0x1f1e1c, openAt: 9999, attrition: 0.001,
    sonae: [
      { id: 'tokichiro', layer: 'honjin', wing: 'center', men: 60, taisho: '木下藤吉郎', flag: 'oda', bind: G('tk') },
      { id: 'maeno', layer: 'ichi', wing: 'center', men: 120, taisho: '前野長康', flag: 'oda', bind: G('ally') },
      { id: 'nobu', layer: 'gozume', wing: 'center', men: 2000, taisho: '織田信長', flag: 'oda', hold: true, at: { x: 10, z: 260 } },
    ] },
  B: { name: '斎藤', facing: 0, honjin: { x: -30, z: -320 }, mpu: 3, formation: '鶴翼', terrain: 'river', flag: 'saito', armor: 0x2e2822, openAt: 9999, attrition: 0.001,
    sonae: [
      { id: 'w1', layer: 'sakite', wing: 'center', men: 300, taisho: '', flag: 'saito', bind: G('reserveW1') },
      { id: 'w2', layer: 'ichi', wing: 'left', men: 400, taisho: '', flag: 'saito', bind: G('reserveW2') },
      { id: 'w3', layer: 'ni', wing: 'center', men: 500, taisho: '', flag: 'saito', bind: G('reserveW3a') },
      { id: 'yose', layer: 'hatamoto', wing: 'left', men: 400, taisho: '斎藤方の寄せ大将', flag: 'saito', bind: G('reserveW3b') },
      { id: 'tatsuoki', layer: 'honjin', wing: 'center', men: 3000, taisho: '斎藤龍興', flag: 'saito', hold: true, at: { x: -30, z: -320 } },
    ] },
  honjinView: { A: false, B: false },
};
