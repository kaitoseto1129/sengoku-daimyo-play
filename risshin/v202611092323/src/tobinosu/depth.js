// 鳶ヶ巣山砦夜襲の陣立て（docs/fujin/tobinosu.md・docs/army_depth_howto.md）
// 酒井忠次の別働隊（およそ四千）は本物の隊と、南の森の遠景の後続（戦のファイルの F.hosts）。ここでは酒井の本隊と久間山へ回る手に結ぶ。
// 武田は尾根の五つの砦（姥ヶ懐・君ヶ伏床・中山・久間山・鳶ヶ巣山）に武田信実ら およそ千。砦の中は本物の兵、尾根の裏（北）に軽い備。
// 砦が落ちると、その裏の備は崩れて北の谷へ退く（fortFell の depthRout）。
const F = (k) => (rt) => rt.flags[k];
export const depth = {
  A: { name: '酒井', facing: Math.PI, honjin: { x: 36, z: 40 }, mpu: 3, formation: '雁行', terrain: 'forest', flag: 'katabami', armor: 0x24221f, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'sakai', layer: 'sakite', wing: 'center', men: 2500, taisho: '酒井忠次', flag: 'katabami', bind: F('sakaiG') },
      { id: 'kuma', layer: 'ichi', wing: 'right', men: 500, taisho: '', flag: 'tokugawa', bind: F('kumaHand') },
    ] },
  B: { name: '武田', facing: 0, honjin: { x: -96, z: -63 }, mpu: 3, formation: '長蛇', terrain: 'mountain', flag: 'takeda', armor: 0x3a2622, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'f_uba', layer: 'ichi', wing: 'left', men: 150, taisho: '', at: { x: 66, z: -52 }, hold: true },
      { id: 'f_kimi', layer: 'ichi', wing: 'left', men: 150, taisho: '', at: { x: 26, z: -53 }, hold: true },
      { id: 'f_naka', layer: 'ichi', wing: 'center', men: 200, taisho: '', at: { x: -16, z: -60 }, hold: true },
      { id: 'f_kuma', layer: 'ichi', wing: 'right', men: 150, taisho: '', at: { x: -50, z: -61 }, hold: true },
      { id: 'f_tobi', layer: 'honjin', wing: 'right', men: 350, taisho: '武田信実', at: { x: -96, z: -63 }, hold: true },
    ] },
  honjinView: { A: false, B: false },
};
