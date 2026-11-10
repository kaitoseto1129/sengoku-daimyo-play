// 稲生の陣立ての表（docs/army_depth_howto.md の型・docs/generals_oda_1108.md の 1）。南（＋z）が信長方、北（−z）が信勝方。
//   信長方 約七百：前の列（本物）→ 信長の旗本（本物）→ 後詰。右の後ろの名塚の砦に佐久間盛重。
//   信勝方 約千七百：柴田勝家の千（本物の先手）→ 林美作守の七百（本物）。信勝は末森城、林秀貞は那古野城にいて戦場に出ない。
//   本物の兵に結んだ備から読む。後方の表だけの備を軽い兵で補わない。
const G = (k, i) => (rt) => { let g = rt.flags[k]; if (Array.isArray(g)) g = g[i ?? 0]; return g && g.count ? g : null; };
export const DEPTH_INOU = {
  A: { name: '信長方', facing: Math.PI, honjin: { x: 22, z: 168 }, mpu: 3, formation: '魚鱗', terrain: 'marsh', flag: 'oda', armor: 0x1f1e1c, openAt: 9999, attrition: 0.002,
    sonae: [
      { id: 'mae', layer: 'ichi', wing: 'center', men: 250, taisho: '', flag: 'oda', bind: G('allies') },
      { id: 'hidari', layer: 'ichi', wing: 'left', men: 120, taisho: '', flag: 'oda', bind: G('line', 1) },
      { id: 'migi', layer: 'ichi', wing: 'right', men: 120, taisho: '', flag: 'oda', bind: G('line', 5) },
      { id: 'nobu', layer: 'hatamoto', wing: 'center', men: 60, taisho: '織田信長', flag: 'oda', bind: G('nobuG') },
      { id: 'sakuma', layer: 'ni', wing: 'right', men: 100, taisho: '佐久間盛重', flag: 'oda', hold: true, show: false, at: { x: 104, z: 112 } },
      { id: 'gozume', layer: 'gozume', wing: 'center', men: 50, taisho: '', flag: 'oda', hold: true, show: false, at: { x: 6, z: 196 } },
    ] },
  B: { name: '信勝方', facing: 0, honjin: { x: 8, z: -300 }, mpu: 3, formation: '鶴翼', terrain: 'marsh', flag: 'nobukatsu', armor: 0x2e2822, openAt: 9999, attrition: 0.002,
    sonae: [
      { id: 'shibata', layer: 'sakite', wing: 'center', men: 700, taisho: '柴田勝家', flag: 'kari', bind: G('shibaG') },
      { id: 'shibasaki', layer: 'sakite', wing: 'right', men: 300, taisho: '', flag: 'kari', bind: G('l1', 5) },
      { id: 'hayashi', layer: 'ichi', wing: 'left', men: 700, taisho: '林美作守', flag: 'nobukatsu', bind: G('bossG') },
    ] },
  byMen: true,   // 布陣図どおりの兵数の比で軽い兵を配る（docs/fujin/inou.md）
  honjinView: { A: false, B: false },
};
