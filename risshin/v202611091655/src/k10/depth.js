// k10/depth.js … 鴫野の軍勢の厚み・陣立て（docs/army_depth_howto.md の表。docs/generals_toyo_toku_1108.md の 10）
// 堤の上の戦：大軍は堤の道しか動けない（長蛇）。両脇は泥田なので、軽い備は堤の上か、その奥の乾いた所だけに置く。
// 上杉（東）：須田の先手・安田・水原の鉄砲・景勝の本陣（兼続も）・榊原の援軍は本物。奥に上杉の後備と、家康が先手を代わらせようとした堀尾忠晴の手（動かない）。
// 豊臣（西）：井上の柵の鉄砲・来援の渡辺・木村宗明・竹田・大野治長の旗本は本物。奥に大野治房の手（動かない）。
const F = (k) => (rt) => rt.flags[k];
export default {
  A: { name: '上杉', facing: -Math.PI / 2, honjin: { x: 192, z: -8 }, mpu: 4, formation: '長蛇', terrain: 'road', flag: 'uesugi', armor: 0x1c1a18, openAt: 40, attrition: 0.002,
    sonae: [
      { id: 'suda', layer: 'sakite', wing: 'center', men: 1000, taisho: '須田長義', flag: 'uesugi', bind: F('suda') },
      { id: 'yasu', layer: 'ichi', wing: 'center', men: 800, taisho: '安田能元', flag: 'uesugi', bind: F('yasu') },
      { id: 'mizu', layer: 'ni', wing: 'center', men: 600, taisho: '水原親憲', flag: 'uesugi', bind: F('mzN') },
      { id: 'ato', layer: 'yobi', wing: 'center', men: 1200, taisho: '', flag: 'uesugi_bi', at: { x: 214, z: -2 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 1000, taisho: '上杉景勝', flag: 'uesugi', bind: F('honjin') },
      { id: 'saka', layer: 'gozume', wing: 'center', men: 1500, taisho: '榊原康勝', flag: 'sakakibara', bind: F('saka') },
      { id: 'horio', layer: 'gozume', wing: 'right', men: 1500, taisho: '堀尾忠晴', flag: 'horio', hold: true, at: { x: 232, z: 34 } },
      { id: 'niwa', layer: 'gozume', wing: 'left', men: 1500, taisho: '丹羽長重', flag: 'tokugawa', hold: true, at: { x: 232, z: -44 } },   // 後詰（11/9 布陣図：堀尾・丹羽・榊原）
      { id: 'konida', layer: 'konida', wing: 'center', men: 300, at: { x: 238, z: -6 } },
    ] },
  B: { name: '豊臣', facing: Math.PI / 2, honjin: { x: -124, z: 4 }, mpu: 4, formation: '長蛇', terrain: 'road', flag: 'toyotomi', armor: 0x22201d, openAt: 40, attrition: 0.003,
    sonae: [
      { id: 'g1', layer: 'sakite', wing: 'center', men: 300, taisho: '', bind: F('g1') },
      { id: 'g2', layer: 'ichi', wing: 'center', men: 300, taisho: '', bind: F('g2') },
      { id: 'ino', layer: 'ni', wing: 'center', men: 1400, taisho: '井上頼次', bind: F('ino') },
      { id: 'wata', layer: 'yobi', wing: 'center', men: 3000, taisho: '渡辺糺', bind: F('wata') },
      { id: 'kimu', layer: 'yobi', wing: 'center', men: 3000, taisho: '木村宗明', bind: F('kimu') },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 4000, taisho: '大野治長', bind: F('oono') },
      { id: 'harufusa', layer: 'gozume', wing: 'center', men: 2000, taisho: '大野治房', hold: true, at: { x: -228, z: 6 } },
    ] },
  byMen: true,   // 軽い兵を史実の兵数の比で配る（11/9 徳川C。docs/fujin/k10_shigino.md）
  honjinView: { A: false, B: false },
};
