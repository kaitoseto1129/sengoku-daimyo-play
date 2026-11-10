// ======================================================================
// 小谷城　布陣図の陣立て（docs/fujin/odani.md・docs/army_depth_howto.md・kaito 11/9「布陣図通りの兵数・布陣」）
// 織田およそ三万：清水谷の羽柴の手（本物の隊に bind）、南の大手の柴田・丹羽、東の山裾の囲み（滝川・佐久間ほか）、虎御前山の信長の本陣。
// 浅井の守りは曲輪の中の本物の兵だけ（城の中に軽い兵を置かない）。皆 hold：本物の段の流れを変えない。各手の兵の分け方は推定。
// ======================================================================
const Fk = (k) => (rt) => rt.flags[k];

// ctx：{ honjin（虎御前山）, ote（大手の番所の前）, mouth（清水谷の口） }
export function depthPlan(ctx) {
  const { honjin, ote, mouth } = ctx;
  return {
    byMen: true,
    bindTail: true,   // 本物の隊に結んだ備の後ろに、兵数の比の軽い列（army_depth_view.js の buildTail。クラウド厚み係 11/10）
    A: { name: '織田', facing: Math.PI, honjin, mpu: 6, formation: '長蛇', terrain: 'mountain', flag: 'oda', armor: 0x28231f, openAt: 9999, attrition: 0,
      sonae: [
        { id: 'hide', layer: 'sakite', wing: 'left', men: 1000, taisho: '羽柴秀吉', flag: 'oda', bind: Fk('hide') },
        { id: 'hachi', layer: 'sakite', wing: 'left', men: 600, taisho: '', flag: 'oda', bind: Fk('hachi') },
        { id: 'asano', layer: 'ichi', wing: 'left', men: 600, taisho: '', flag: 'oda', bind: Fk('asano') },
        { id: 'niban', layer: 'ni', wing: 'left', men: 500, taisho: '', flag: 'oda', bind: Fk('niban') },
        { id: 'gozume', layer: 'gozume', wing: 'left', men: 300, taisho: '', flag: 'oda', bind: Fk('gozume') },
        { id: 'hashiba2', layer: 'yobi', wing: 'left', men: 1500, taisho: '', flag: 'oda', at: { x: mouth.x - 14, z: mouth.z + 52 }, hold: true },
        { id: 'shibata', layer: 'ichi', wing: 'center', men: 4000, taisho: '柴田勝家', flag: 'oda', at: { x: ote.x - 14, z: ote.z + 26 }, hold: true },
        { id: 'niwa', layer: 'ichi', wing: 'center', men: 4000, taisho: '丹羽長秀', flag: 'oda', at: { x: ote.x + 16, z: ote.z + 34 }, hold: true },
        { id: 'takigawa', layer: 'ni', wing: 'right', men: 4000, taisho: '滝川一益', flag: 'oda', at: { x: 104, z: -40 }, hold: true },
        { id: 'sakuma', layer: 'ni', wing: 'right', men: 4000, taisho: '佐久間信盛', flag: 'oda', at: { x: 112, z: -100 }, hold: true },
        { id: 'honjin', layer: 'honjin', wing: 'center', men: 6000, taisho: '織田信長', flag: 'oda', at: { x: honjin.x, z: honjin.z }, hold: true },
      ] },
    honjinView: { A: false },
  };
}
