// k09/depth.js … 今福の軍勢の厚み・陣立て（docs/army_depth_howto.md の表。docs/generals_toyo_toku_1108.md の 9）
// 堤の上の一本道（長蛇）。本物の隊に結び、控えの数だけの備は描かない。
// 東の本陣と西の仮橋まで近づけるので、軽い兵を置くと近くに見せかけの兵が戻ってしまう。
// 佐竹の二の備・後備は戦の定義から本物の兵として出す。
const F = (k) => (rt) => rt.flags[k];
const N = (n) => (rt) => rt.army.groups.find((g) => g.name === n && g.count > 0 && !g.routed);
export default {
  A: { name: '佐竹', facing: -Math.PI / 2, honjin: { x: 194, z: -4 }, mpu: 4, formation: '長蛇', terrain: 'road', flag: 'satake', armor: 0x24221f, uma: 'ogi', openAt: 40, attrition: 0.002,
    sonae: [
      { id: 'umezu', layer: 'sakite', wing: 'center', men: 400, taisho: '梅津憲忠', flag: 'satake', bind: F('satake') },
      { id: 'shibue', layer: 'ichi', wing: 'center', men: 400, taisho: '渋江政光', flag: 'satake', bind: F('shibue') },
      { id: 'tomura', layer: 'ni', wing: 'center', men: 300, taisho: '戸村義国', flag: 'satake', bind: F('tomura') },
      { id: 'ato', layer: 'yobi', wing: 'center', men: 400, taisho: '', flag: 'satake', show: false, at: { x: 176, z: 0 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 400, taisho: '佐竹義宣', flag: 'satake', bind: N('佐竹義宣の本陣') },
      { id: 'konida', layer: 'konida', wing: 'center', men: 100, show: false, at: { x: 232, z: 0 } },
    ] },
  B: { name: '豊臣', facing: Math.PI / 2, honjin: { x: -240, z: 0 }, mpu: 4, formation: '長蛇', terrain: 'road', flag: 'toyotomi', armor: 0x2c2a26, openAt: 40, attrition: 0.003,
    sonae: [
      { id: 'kimura', layer: 'sakite', wing: 'center', men: 1500, taisho: '木村重成', bind: N('木村重成の隊') },
      { id: 'goto', layer: 'ichi', wing: 'center', men: 1500, taisho: '後藤又兵衛', bind: N('後藤又兵衛の隊') },
      { id: 'kimura2', layer: 'ni', wing: 'center', men: 1000, taisho: '', bind: N('木村重成の二の手') },
      { id: 'ato', layer: 'yobi', wing: 'center', men: 1500, taisho: '', hold: true, show: false, at: { x: -210, z: 0 } },
    ] },
  byMen: true,   // 軽い兵を史実の兵数の比で配る（11/9 徳川C。docs/fujin/k09_imafuku.md）
  bindTail: true,   // 本物の隊に結んだ備の後ろに、兵数の比の軽い列（army_depth_view.js の buildTail。クラウド厚み係 11/10）
  honjinView: { A: false, B: false },
};
