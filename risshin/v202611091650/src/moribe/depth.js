// 森部の陣立ての表（docs/army_depth_howto.md の型・docs/generals_oda_1108.md の 3）。南（＋z）が織田、北（−z）が斎藤。
//   織田 約千五百：柴田の前備・本備・森の横備え・津島衆（本物）→ 信長の本陣（本物）→ 丹羽長秀・佐久間信盛の後詰（南岸に控える）。
//   斎藤 約六千：先手（本物）→ 日比野・長井の備（本物）→ 両将の旗本（本物）→ 控え（本物）→ 墨俣の方の後備え（遠くの軽い大軍）。
const G = (k, i) => (rt) => { let g = rt.flags[k]; if (Array.isArray(g)) g = g[i ?? 0]; return g && g.count ? g : null; };
export const DEPTH_MORIBE = {
  A: { name: '織田', facing: Math.PI, honjin: { x: -6, z: 140 }, mpu: 3, formation: '魚鱗', terrain: 'river', flag: 'oda', armor: 0x1f1e1c, openAt: 9999, attrition: 0.002,
    sonae: [
      { id: 'shibata', layer: 'sakite', wing: 'center', men: 300, taisho: '柴田勝家', flag: 'oda', bind: G('A') },
      { id: 'honzonae', layer: 'ichi', wing: 'center', men: 300, taisho: '', flag: 'oda', bind: G('B') },
      { id: 'mori', layer: 'ichi', wing: 'left', men: 200, taisho: '森可成', flag: 'oda', bind: G('Y') },
      { id: 'tsushima', layer: 'ichi', wing: 'right', men: 150, taisho: '', flag: 'oda', bind: G('R3') },
      { id: 'nobu', layer: 'hatamoto', wing: 'center', men: 200, taisho: '織田信長', flag: 'oda', bind: G('odaCamp') },
      { id: 'niwa', layer: 'gozume', wing: 'right', men: 200, taisho: '丹羽長秀', flag: 'oda', hold: true, at: { x: 70, z: 150 } },
      { id: 'sakuma', layer: 'gozume', wing: 'left', men: 200, taisho: '佐久間信盛', flag: 'oda', hold: true, at: { x: -70, z: 152 } },
    ] },
  B: { name: '斎藤', facing: 0, honjin: { x: -20, z: -200 }, mpu: 3, formation: '鶴翼', terrain: 'marsh', flag: 'saito', armor: 0x2e2822, openAt: 9999, attrition: 0.002,
    sonae: [
      { id: 'saki', layer: 'sakite', wing: 'right', men: 600, taisho: '', flag: 'saito', bind: G('V') },
      { id: 'hibino', layer: 'ichi', wing: 'center', men: 1200, taisho: '', flag: 'saito', bind: G('M') },
      { id: 'nagai', layer: 'ichi', wing: 'left', men: 1200, taisho: '', flag: 'saito', bind: G('N') },
      { id: 'hibinoH', layer: 'hatamoto', wing: 'center', men: 400, taisho: '日比野下野守', flag: 'saito', bind: G('HM') },
      { id: 'nagaiH', layer: 'hatamoto', wing: 'left', men: 400, taisho: '長井甲斐守', flag: 'saito', bind: G('HN') },
      { id: 'hikae1', layer: 'yobi', wing: 'center', men: 600, taisho: '', flag: 'saito', bind: G('reserves', 0) },
      { id: 'hikae2', layer: 'yobi', wing: 'right', men: 600, taisho: '', flag: 'saito', bind: G('reserves', 1) },
      { id: 'ato', layer: 'gozume', wing: 'center', men: 1500, taisho: '', flag: 'saito', hold: true, at: { x: -20, z: -200 } },
    ] },
  byMen: true,   // 布陣図どおりの兵数の比で軽い兵を配る（docs/fujin/moribe.md）
  honjinView: { A: false, B: false },
};
