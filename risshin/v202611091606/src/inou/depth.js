// 稲生の陣立ての表（docs/army_depth_howto.md の型・docs/generals_oda_1108.md の 1）。南（＋z）が信長方、北（−z）が信勝方。
//   信長方 約七百：前の列（本物）→ 信長の旗本（本物）→ 後詰。右の後ろの名塚の砦に佐久間盛重。
//   信勝方 約千七百：柴田勝家の千（本物の先手）→ 林美作守の七百（本物）→ 林秀貞・津々木蔵人の控え → 末森側の信勝の本陣（出ない）。
//   本物の兵に結んだ備は描かず、本物から読む。結ばない備は霧の向こうの軽い大軍（数・勝ち負けに入らない）。
const G = (k, i) => (rt) => { let g = rt.flags[k]; if (Array.isArray(g)) g = g[i ?? 0]; return g && g.count ? g : null; };
export const DEPTH_INOU = {
  A: { name: '信長方', facing: Math.PI, honjin: { x: 22, z: 168 }, mpu: 3, formation: '魚鱗', terrain: 'marsh', flag: 'oda', armor: 0x1f1e1c, openAt: 9999, attrition: 0.002,
    sonae: [
      { id: 'mae', layer: 'ichi', wing: 'center', men: 250, taisho: '', flag: 'oda', bind: G('allies') },
      { id: 'hidari', layer: 'ichi', wing: 'left', men: 120, taisho: '', flag: 'oda', bind: G('line', 1) },
      { id: 'migi', layer: 'ichi', wing: 'right', men: 120, taisho: '', flag: 'oda', bind: G('line', 5) },
      { id: 'nobu', layer: 'hatamoto', wing: 'center', men: 60, taisho: '織田信長', flag: 'oda', bind: G('nobuG') },
      { id: 'sakuma', layer: 'ni', wing: 'right', men: 100, taisho: '佐久間盛重', flag: 'oda', hold: true, at: { x: 104, z: 112 } },
      { id: 'gozume', layer: 'gozume', wing: 'center', men: 50, taisho: '', flag: 'oda', hold: true, at: { x: 6, z: 196 } },
    ] },
  B: { name: '信勝方', facing: 0, honjin: { x: 8, z: -300 }, mpu: 3, formation: '鶴翼', terrain: 'marsh', flag: 'nobukatsu', armor: 0x2e2822, openAt: 9999, attrition: 0.002,
    sonae: [
      { id: 'shibata', layer: 'sakite', wing: 'center', men: 700, taisho: '柴田勝家', flag: 'kari', bind: G('shibaG') },
      { id: 'shibasaki', layer: 'sakite', wing: 'right', men: 300, taisho: '', flag: 'kari', bind: G('l1', 5) },
      { id: 'hayashi', layer: 'ichi', wing: 'left', men: 700, taisho: '林美作守', flag: 'nobukatsu', bind: G('bossG') },
      { id: 'hidesada', layer: 'ni', wing: 'left', men: 150, taisho: '林秀貞', flag: 'nobukatsu', hold: true, at: { x: -50, z: -214 } },
      { id: 'tsuzuki', layer: 'yobi', wing: 'right', men: 100, taisho: '津々木蔵人', flag: 'nobukatsu', hold: true, at: { x: 54, z: -226 } },
      { id: 'nobukatsu', layer: 'honjin', wing: 'center', men: 200, taisho: '織田信勝', flag: 'nobukatsu', hold: true, at: { x: 8, z: -300 } },
    ] },
  honjinView: { A: false, B: true },
};
