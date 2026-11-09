// ======================================================================
// 小牧・長久手 二　軍勢の厚み・陣立ての表（docs/army_depth_howto.md・docs/generals_toyo_toku_1108.md の 4）
//   西（−x）が退く道、東（+x）が白山林、南（+z）が仏ヶ根。本物の隊は bind で結ぶ（隊が出るまでは居ないもの）。
//   羽柴：三好信吉（後の秀次・白山林）・堀秀政（檜ヶ根）・池田恒興・池田元助・森長可（仏ヶ根）
//   徳川：家康・織田信雄（御旗山の本陣）・井伊直政（赤備え）・水野忠重・大須賀康高。本多忠勝は小牧に残り、この戦場へ置かない。
// ======================================================================
const F = (k) => (rt) => rt.flags[k];

export const T03B_DEPTH = {
  byMen: true,   // 軽い兵を布陣図の兵数の比で配る（docs/fujin/。豊臣A 11/9）
  A: { name: '羽柴（中入り）', facing: Math.PI / 2, honjin: { x: 12, z: -10 }, mpu: 8, formation: '長蛇', terrain: 'road', flag: 'toyotomi', armor: 0x2b2723, openAt: 9999, attrition: 0,
    sonae: [
      // 信吉隊八千のうち二千は次の朝飯の本隊。二重に数えて中入り二万を超えない。
      { id: 'nobuyoshi', layer: 'sakite', wing: 'left', men: 6000, taisho: '三好信吉', bind: F('hideG') },
      { id: 'camp', layer: 'ichi', wing: 'left', men: 2000, taisho: '', bind: F('camp') },
      { id: 'hori', layer: 'ni', wing: 'center', men: 3000, taisho: '堀秀政', flag: 'hori', bind: F('hori') },
      { id: 'mori', layer: 'ichi', wing: 'right', men: 3000, taisho: '森長可', flag: 'tsuru', bind: F('moriG') },
      { id: 'motosuke', layer: 'ichi', wing: 'right', men: 4000, taisho: '池田元助', flag: 'ageha', bind: F('ikeSaki') },
      { id: 'ikeda', layer: 'hatamoto', wing: 'right', men: 2000, taisho: '池田恒興', flag: 'ageha', bind: F('ikeG') },
    ] },
  B: { name: '徳川・信雄', facing: -Math.PI / 2, honjin: { x: 82, z: 50 }, mpu: 8, formation: '鶴翼', terrain: 'plain', flag: 'tokugawa', armor: 0x1f1e1c, uma: 'ogi', openAt: 9999, attrition: 0,
    sonae: [
      { id: 'ii', layer: 'sakite', wing: 'right', men: 3000, taisho: '井伊直政', flag: 'ii', armor: 0x641610, bind: (rt) => rt.flags.aka?.[0] },
      { id: 'mizuno', layer: 'ichi', wing: 'center', men: 1500, taisho: '水野忠重', flag: 'mizuno', hold: true, at: { x: 118, z: 70 } },
      { id: 'osuga', layer: 'ni', wing: 'left', men: 1500, taisho: '大須賀康高', hold: true, at: { x: 150, z: -78 } },
      { id: 'nobukatsu', layer: 'honjin', wing: 'left', men: 3000, taisho: '織田信雄', bind: (rt) => rt.flags.honjin?.[1] },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 3300, taisho: '徳川家康', bind: (rt) => rt.flags.honjin?.[0] },
    ] },
  honjinView: { A: false, B: false },   // 御旗山の金扇の本陣は戦のファイルが作る
};
