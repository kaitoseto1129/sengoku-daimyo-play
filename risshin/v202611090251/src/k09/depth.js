// k09/depth.js … 今福の軍勢の厚み・陣立て（docs/army_depth_howto.md の表。docs/generals_toyo_toku_1108.md の 9）
// 堤の上の一本道（長蛇）。両脇は川と湿地なので、軽い備は堤の上（z≈0）にだけ縦に重ねる。
// 佐竹（東）：梅津・渋江・戸村の組は本物、義宣の本陣も本物。その間と奥に佐竹の後備（動かない）。
// 豊臣（西）：木村重成・後藤又兵衛の隊は本物（出た時から結ぶ）。城の側の奥に木村の後備と、城の守り（動かない）。
const F = (k) => (rt) => rt.flags[k];
const N = (n) => (rt) => rt.army.groups.find((g) => g.name === n && g.count > 0 && !g.routed);
export default {
  A: { name: '佐竹', facing: -Math.PI / 2, honjin: { x: 194, z: -4 }, mpu: 4, formation: '長蛇', terrain: 'road', flag: 'satake', armor: 0x24221f, uma: 'ogi', openAt: 40, attrition: 0.002,
    sonae: [
      { id: 'umezu', layer: 'sakite', wing: 'center', men: 400, taisho: '梅津憲忠', flag: 'satake', bind: F('satake') },
      { id: 'shibue', layer: 'ichi', wing: 'center', men: 400, taisho: '渋江政光', flag: 'satake', bind: F('shibue') },
      { id: 'tomura', layer: 'ni', wing: 'center', men: 300, taisho: '戸村義国', flag: 'satake', bind: F('tomura') },
      { id: 'ato', layer: 'yobi', wing: 'center', men: 500, taisho: '', flag: 'satake', at: { x: 176, z: 0 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 400, taisho: '佐竹義宣', flag: 'satake', bind: N('佐竹義宣の本陣') },
      { id: 'konida', layer: 'konida', wing: 'center', men: 200, at: { x: 232, z: 0 } },
    ] },
  B: { name: '豊臣', facing: Math.PI / 2, honjin: { x: -240, z: 0 }, mpu: 4, formation: '長蛇', terrain: 'road', flag: 'toyotomi', armor: 0x2c2a26, openAt: 40, attrition: 0.003,
    sonae: [
      { id: 'kimura', layer: 'sakite', wing: 'center', men: 1500, taisho: '木村重成', bind: N('木村重成の隊') },
      { id: 'goto', layer: 'ichi', wing: 'center', men: 1500, taisho: '後藤又兵衛', bind: N('後藤又兵衛の隊') },
      { id: 'kimura2', layer: 'ni', wing: 'center', men: 1000, taisho: '', bind: N('木村重成の二の手') },
      { id: 'ato', layer: 'yobi', wing: 'center', men: 1500, taisho: '', hold: true, at: { x: -210, z: 0 } },
    ] },
  honjinView: { A: false, B: false },
};
