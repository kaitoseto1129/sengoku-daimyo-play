// k08/depth.js … 木津川口の軍勢の厚み・陣立て（docs/army_depth_howto.md の表。docs/generals_toyo_toku_1108.md の 8）
// 徳川（南）：蜂須賀の先手・別手・旗本と浅野・池田は本物の兵に結ぶ。後ろに蜂須賀の二の備と荷駄。
//   北東の城の方には城を囲む陣（家康・秀忠・藤堂・前田・井伊・越前）を動かない軽い備で置く（k08/iriguchi.js の陣幕と重ねる）。
// 豊臣（北）：岸の鉄砲組・大手門・守兵・北の口は本物。奥に博労淵の薄田兼相の砦の兵（動かない）。
const F = (k) => (rt) => rt.flags[k];
export default {
  A: { name: '徳川', facing: Math.PI, honjin: { x: -4, z: 116 }, mpu: 4, formation: '魚鱗', terrain: 'river', flag: 'hachisuka', armor: 0x1c1b1a, openAt: 30, attrition: 0.002,
    sonae: [
      { id: 'saki', layer: 'sakite', wing: 'center', men: 600, taisho: '', flag: 'hachisuka', bind: F('saki') },
      { id: 'east', layer: 'ichi', wing: 'right', men: 500, taisho: '', flag: 'hachisuka', bind: F('east') },
      { id: 'ikeda', layer: 'ichi', wing: 'left', men: 800, taisho: '', flag: 'ageha', bind: F('ikeda') },
      { id: 'asano', layer: 'ni', wing: 'right', men: 1000, taisho: '浅野長晟', flag: 'asano', bind: F('asano') },
      { id: 'hachi2', layer: 'yobi', wing: 'center', men: 600, taisho: '', flag: 'hachisuka', at: { x: 14, z: 138 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 300, taisho: '蜂須賀至鎮', flag: 'hachisuka', bind: F('lord') },
      { id: 'konida', layer: 'konida', wing: 'center', men: 300, at: { x: -24, z: 150 } },
      // 城を囲む陣（動かない）
      { id: 'ieyasu', layer: 'gozume', wing: 'right', men: 3000, taisho: '徳川家康', flag: 'tokugawa', hold: true, at: { x: 100, z: -118 } },
      { id: 'hidetada', layer: 'gozume', wing: 'right', men: 3000, taisho: '徳川秀忠', flag: 'tokugawa', hold: true, at: { x: 150, z: -30 } },
      { id: 'todo', layer: 'gozume', wing: 'right', men: 2000, taisho: '藤堂高虎', flag: 'todo', hold: true, at: { x: 142, z: -76 } },
      { id: 'maeda', layer: 'gozume', wing: 'right', men: 2000, taisho: '前田利常', flag: 'maeda', hold: true, at: { x: 160, z: 20 } },
      { id: 'ii', layer: 'gozume', wing: 'right', men: 1500, taisho: '井伊直孝', flag: 'ii', hold: true, at: { x: 74, z: -160 } },
      { id: 'echizen', layer: 'gozume', wing: 'right', men: 1500, taisho: '松平忠直', flag: 'tokugawa', hold: true, at: { x: 124, z: -150 } },
    ] },
  B: { name: '豊臣', facing: 0, honjin: { x: 0, z: -150 }, mpu: 4, formation: '方円', terrain: 'castle', flag: 'toyotomi', armor: 0x22201d, openAt: 30, attrition: 0.003,
    sonae: [
      { id: 'front', layer: 'sakite', wing: 'center', men: 150, taisho: '', bind: F('front') },
      { id: 'gate', layer: 'ichi', wing: 'center', men: 150, taisho: '', bind: F('wallG') },
      { id: 'garrison', layer: 'ni', wing: 'center', men: 300, taisho: '', bind: F('garrison') },
      { id: 'zen', layer: 'hatamoto', wing: 'center', men: 100, taisho: '明石全延', bind: F('zen') },
      { id: 'hakuro', layer: 'gozume', wing: 'left', men: 700, taisho: '薄田兼相', hold: true, at: { x: -30, z: -168 } },
    ] },
  honjinView: { A: false, B: false },
};
