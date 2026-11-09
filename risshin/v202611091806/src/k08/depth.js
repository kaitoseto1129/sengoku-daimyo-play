// k08/depth.js … 木津川口の軍勢の厚み・陣立て（docs/army_depth_howto.md の表。docs/generals_toyo_toku_1108.md の 8）
// 徳川（南）：蜂須賀の先手・別手・旗本と浅野・池田は本物の兵に結ぶ。後ろに蜂須賀の二の備と荷駄。
//   北東の城の方には城を囲む陣（家康・秀忠・藤堂・前田・井伊・越前）を動かない軽い備で置く（k08/iriguchi.js の陣幕と重ねる）。
// 豊臣（北）：岸の鉄砲組・大手門・守兵・北の口は本物。奥に博労淵の薄田兼相の砦の兵（動かない）。
const F = (k) => (rt) => rt.flags[k];
export default {
  A: { name: '徳川', facing: Math.PI, honjin: { x: -4, z: 116 }, mpu: 4, formation: '魚鱗', terrain: 'river', flag: 'hachisuka', armor: 0x1c1b1a, openAt: 30, attrition: 0.002,
    sonae: [
      { id: 'saki', layer: 'sakite', wing: 'center', men: 900, taisho: '', flag: 'hachisuka', bind: F('saki') },
      { id: 'east', layer: 'ichi', wing: 'right', men: 600, taisho: '', flag: 'hachisuka', bind: F('east') },
      { id: 'ikeda', layer: 'ichi', wing: 'left', men: 1500, taisho: '', flag: 'ageha', bind: F('ikeda') },
      { id: 'asano', layer: 'ni', wing: 'right', men: 2000, taisho: '浅野長晟', flag: 'asano', bind: F('asano') },
      { id: 'hachi2', layer: 'yobi', wing: 'center', men: 900, taisho: '', flag: 'hachisuka', at: { x: 14, z: 138 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 600, taisho: '蜂須賀至鎮', flag: 'hachisuka', bind: F('lord') },
      { id: 'konida', layer: 'konida', wing: 'center', men: 300, at: { x: -24, z: 150 } },
      // 城を囲む陣（動かない）。11/9 徳川C：kaito の冬の陣の布陣図（docs/osaka_fuyu_fujinzu_ref_1109.md）どおりに置き直した。
      //   木津川口の近く（砦と城の間・城の西の堀の外）は西の衆（森忠政・石川忠総・鍋島勝茂・松平忠明・山内忠義・稲葉典通）。
      //   真田丸の前の南の衆（前田・井伊・松平忠直・藤堂・伊達）と、茶臼山の家康・岡山の秀忠は、遠くの城（620, −430）の南。兵数は通説の目安
      { id: 'mori', layer: 'gozume', wing: 'right', men: 5000, taisho: '森忠政', flag: 'mori', hold: true, at: { x: 110, z: -120 } },
      { id: 'ishikawa', layer: 'gozume', wing: 'right', men: 2000, taisho: '石川忠総', flag: 'tokugawa', hold: true, at: { x: 150, z: -70 } },
      { id: 'nabeshima', layer: 'gozume', wing: 'right', men: 6000, taisho: '鍋島勝茂', flag: 'tokugawa', hold: true, at: { x: 180, z: -160 } },
      { id: 'tadaaki', layer: 'gozume', wing: 'right', men: 3000, taisho: '松平忠明', flag: 'tokugawa', hold: true, at: { x: 220, z: -110 } },
      { id: 'yamauchi', layer: 'gozume', wing: 'right', men: 3000, taisho: '山内忠義', flag: 'tokugawa', hold: true, at: { x: 140, z: -210 } },
      { id: 'inaba', layer: 'gozume', wing: 'right', men: 1500, taisho: '稲葉典通', flag: 'inaba', hold: true, at: { x: 230, z: -200 } },
      { id: 'maeda', layer: 'gozume', wing: 'right', men: 12000, taisho: '前田利常', flag: 'maeda', hold: true, at: { x: 620, z: -250 } },
      { id: 'ii', layer: 'gozume', wing: 'right', men: 4000, taisho: '井伊直孝', flag: 'ii', hold: true, at: { x: 560, z: -260 } },
      { id: 'echizen', layer: 'gozume', wing: 'right', men: 10000, taisho: '松平忠直', flag: 'tokugawa', hold: true, at: { x: 590, z: -230 } },
      { id: 'todo', layer: 'gozume', wing: 'right', men: 4000, taisho: '藤堂高虎', flag: 'todo', hold: true, at: { x: 670, z: -255 } },
      { id: 'date', layer: 'gozume', wing: 'right', men: 10000, taisho: '伊達政宗', flag: 'date', hold: true, at: { x: 700, z: -230 } },
      { id: 'ieyasu', layer: 'gozume', wing: 'right', men: 30000, taisho: '徳川家康', flag: 'tokugawa', hold: true, at: { x: 530, z: -60 } },
      { id: 'hidetada', layer: 'gozume', wing: 'right', men: 20000, taisho: '徳川秀忠', flag: 'tokugawa', hold: true, at: { x: 740, z: -70 } },
    ] },
  B: { name: '豊臣', facing: 0, honjin: { x: 0, z: -150 }, mpu: 4, formation: '方円', terrain: 'castle', flag: 'toyotomi', armor: 0x22201d, openAt: 30, attrition: 0.003,
    sonae: [
      { id: 'front', layer: 'sakite', wing: 'center', men: 150, taisho: '', bind: F('front') },
      { id: 'gate', layer: 'ichi', wing: 'center', men: 150, taisho: '', bind: F('wallG') },
      { id: 'garrison', layer: 'ni', wing: 'center', men: 400, taisho: '', bind: F('garrison') },
      { id: 'zen', layer: 'hatamoto', wing: 'center', men: 100, taisho: '明石全延', bind: F('zen') },
      { id: 'hakuro', layer: 'gozume', wing: 'left', men: 700, taisho: '薄田兼相', hold: true, at: { x: -30, z: -168 } },
      // 城の西の堀ぞい（布陣図）：遠くの城（620, −430）の西の縁に豊臣の備え
      { id: 'mouri', layer: 'gozume', wing: 'left', men: 4000, taisho: '毛利勝永', hold: true, at: { x: 560, z: -470 } },
      { id: 'goto', layer: 'gozume', wing: 'left', men: 3000, taisho: '後藤基次', hold: true, at: { x: 555, z: -420 } },
      { id: 'harufusa', layer: 'gozume', wing: 'left', men: 5000, taisho: '大野治房', hold: true, at: { x: 565, z: -375 } },
    ] },
  byMen: true,   // 軽い兵を史実の兵数の比で配る（11/9 徳川C。docs/fujin/k08_osaka_kizu.md）
  honjinView: { A: false, B: false },
};
