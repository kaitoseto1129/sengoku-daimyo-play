// ======================================================================
// 長島一向一揆　布陣図の陣立て（docs/fujin/nagashima.md・docs/army_depth_howto.md・kaito 11/9「布陣図通りの兵数・布陣」）
// 織田およそ七万が三方（早尾口の本陣・市江口の信忠・賀鳥口の稲葉）から川の手前に陣を敷く。前の本物の隊（柴田の手・鉄砲衆・口の手）は bind で結び、
// 後ろの層と本陣は軽い備。川の上の船衆と、川向こうの門徒の砦（柵で囲まれた島）は表に入れない（水の上に軽い兵を置かない）。
// 各口の兵の分け方は史料に無いので推定（総勢七万は復元の目安）。皆 hold：川を渡って攻めない（囲む戦）。
// ======================================================================
const Fk = (k) => (rt) => rt.flags[k];
const Mouth = (i) => (rt) => rt.flags.mouths?.[i];

export const depthPlan = {
  byMen: true,
  A: { name: '織田', facing: Math.PI, honjin: { x: 0, z: 64 }, mpu: 6, formation: '鶴翼', terrain: 'river', flag: 'oda', armor: 0x28231f, openAt: 9999, attrition: 0,
    sonae: [
      { id: 'shibata', layer: 'sakite', wing: 'center', men: 3000, taisho: '柴田勝家', flag: 'oda', bind: Fk('shiba') },
      { id: 'teppo', layer: 'ichi', wing: 'center', men: 1000, taisho: '', flag: 'oda', bind: Fk('teppo') },
      { id: 'maeda', layer: 'ni', wing: 'center', men: 4000, taisho: '前田利家', flag: 'oda', at: { x: 26, z: 30 }, hold: true },
      { id: 'nobutada', layer: 'ichi', wing: 'left', men: 2000, taisho: '織田信忠', flag: 'oda', bind: Mouth(0) },
      { id: 'nobutada2', layer: 'ni', wing: 'left', men: 14000, taisho: '', flag: 'oda', at: { x: -66, z: 36 }, hold: true },
      { id: 'inaba', layer: 'ichi', wing: 'right', men: 2000, taisho: '稲葉一鉄', flag: 'oda', bind: Mouth(1) },
      { id: 'inaba2', layer: 'ni', wing: 'right', men: 10000, taisho: '蜂屋頼隆', flag: 'oda', at: { x: 66, z: 36 }, hold: true },
      { id: 'yobi', layer: 'yobi', wing: 'center', men: 12000, taisho: '', flag: 'oda', at: { x: -24, z: 54 }, hold: true },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 8000, taisho: '', flag: 'oda', at: { x: 0, z: 84 }, hold: true },
      { id: 'honjin', layer: 'honjin', wing: 'center', men: 3000, taisho: '織田信長', flag: 'oda', bind: (rt) => rt.flags.odaCamp?.guard, hold: true },
      { id: 'gozume', layer: 'gozume', wing: 'center', men: 11000, taisho: '', flag: 'oda', at: { x: 30, z: 98 }, hold: true },
    ] },
  honjinView: { A: false },
};
