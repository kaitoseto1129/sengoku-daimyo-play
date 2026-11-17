// k11/depth.js … 真田丸の軍勢の厚み・陣立て（docs/army_depth_howto.md の表。docs/generals_toyo_toku_1108.md の 11）
// 徳川（南）：前田の先手（山崎）と二の手は本物。前田の西へ 松倉・榊原・桑山・古田・脇坂・寺沢・井伊・越前の松平・藤堂・伊達（kaito 11/13 の布陣図の南の列。11/14 クラウドせ）、東は東の列の南の端、奥に秀忠。家康の本陣は戦場外の住吉。
//   井伊・越前は「城内の爆発」で堀へ殺到する本物の新手が別に出る。この表の井伊・越前はその後ろに残る備（動かない）。
// 豊臣（北）：塀の内の鉄砲と信繁の旗本は本物。丸の後ろの惣構に後藤又兵衛・毛利勝永・明石全登の陣（動かない）。
const F = (k) => (rt) => rt.flags[k];
export default {
  A: { name: '徳川', facing: Math.PI, honjin: { x: -70, z: 176 }, mpu: 4, formation: '鶴翼', terrain: 'castle', flag: 'tokugawa', armor: 0x1f1e1c, uma: 'ogi', openAt: 60, attrition: 0.002,
    sonae: [
      { id: 'yam', layer: 'sakite', wing: 'center', men: 600, taisho: '山崎長徳', flag: 'maeda', bind: F('yam') },
      { id: 'second', layer: 'ichi', wing: 'center', men: 800, taisho: '本多政重', flag: 'maeda', bind: F('second') },
      { id: 'maeda', layer: 'ni', wing: 'center', men: 10600, taisho: '前田利光', flag: 'maeda', hold: true, at: { x: -14, z: 150 } },
      { id: 'ii', layer: 'ichi', wing: 'left', men: 4000, taisho: '井伊直孝', flag: 'ii', hold: true, at: { x: -100, z: 44 } },
      { id: 'echizen', layer: 'ichi', wing: 'left', men: 10000, taisho: '松平忠直', flag: 'tokugawa', hold: true, at: { x: -178, z: 34 } },
      { id: 'todo', layer: 'ni', wing: 'left', men: 4000, taisho: '藤堂高虎', flag: 'todo', hold: true, at: { x: -188, z: 128 } },
      { id: 'date', layer: 'ni', wing: 'left', men: 10000, taisho: '伊達政宗', flag: 'date', hold: true, at: { x: -222, z: 140 } },
      { id: 'hidetada', layer: 'yobi', wing: 'right', men: 20000, taisho: '徳川秀忠', flag: 'tokugawa', hold: true, at: { x: 190, z: 230 } },   // 岡山（南東。kaito の布陣図）
      // 11/13 K286：kaito の包囲の布陣図（docs/fujin/k11_sanadamaru.md 末尾）。南は真田丸の前の並び、東西は城を巻く大名の陣（動かない備）
      // K362（kaito「陣が全部重なっている」）：左翼の小さな備六つが約十四歩おきで、兵の数で描く塊どうしが重なっていた。布陣図の並び（前田の西・西から寺沢→松倉）は保ち、間を約1.3倍に開いて前後二列の互い違いに
      { id: 'terasawa', layer: 'ni', wing: 'left', men: 2400, taisho: '寺沢広高', flag: 'tokugawa', hold: true, at: { x: -122, z: 118 } },
      { id: 'wakizaka', layer: 'ni', wing: 'left', men: 1300, taisho: '脇坂安元', flag: 'tokugawa', hold: true, at: { x: -102, z: 154 } },
      { id: 'furuta', layer: 'ni', wing: 'left', men: 1000, taisho: '古田重治', flag: 'tokugawa', hold: true, at: { x: -84, z: 118 } },
      { id: 'kuwayama', layer: 'ni', wing: 'left', men: 1000, taisho: '桑山一直', flag: 'tokugawa', hold: true, at: { x: -66, z: 156 } },
      { id: 'sakakibara', layer: 'ni', wing: 'left', men: 3000, taisho: '榊原康勝', flag: 'sakakibara', hold: true, at: { x: -48, z: 120 } },
      { id: 'matsukura', layer: 'ni', wing: 'left', men: 2500, taisho: '松倉重政', flag: 'tokugawa', hold: true, at: { x: -34, z: 158 } },
      // 11/14 クラウドせ：東の列の南の端（布陣図：東の北から南へ…秋田実季・仙石忠政・酒井家次、南東に南部利直）。前田の東の切れ目を埋め、城の四方を輪で囲む
      { id: 'akita', layer: 'ni', wing: 'right', men: 1500, taisho: '秋田実季', flag: 'tokugawa', hold: true, at: { x: 215, z: 110 } },
      { id: 'sengoku', layer: 'ni', wing: 'right', men: 2000, taisho: '仙石忠政', flag: 'tokugawa', hold: true, at: { x: 168, z: 126 } },
      { id: 'sakai', layer: 'ni', wing: 'right', men: 3000, taisho: '酒井家次', flag: 'tokugawa', hold: true, at: { x: 120, z: 136 } },
      { id: 'nanbu', layer: 'ni', wing: 'right', men: 2500, taisho: '南部利直', flag: 'tokugawa', hold: true, at: { x: 135, z: 180 } },
      { id: 'asano', layer: 'ni', wing: 'left', men: 5000, taisho: '浅野長晟', flag: 'asano', hold: true, at: { x: -215, z: 60 } },
      { id: 'yamauchi', layer: 'ni', wing: 'left', men: 5000, taisho: '山内忠義', flag: 'tokugawa', hold: true, at: { x: -225, z: 10 } },
      { id: 'hachisuka', layer: 'ni', wing: 'left', men: 4000, taisho: '蜂須賀至鎮', flag: 'tokugawa', hold: true, at: { x: -230, z: -40 } },
      { id: 'satake', layer: 'ni', wing: 'right', men: 5000, taisho: '佐竹義宣', flag: 'tokugawa', hold: true, at: { x: 225, z: 60 } },
      { id: 'uesugi', layer: 'ni', wing: 'right', men: 5000, taisho: '上杉景勝', flag: 'uesugi', hold: true, at: { x: 235, z: 10 } },
      { id: 'horio', layer: 'ni', wing: 'right', men: 2000, taisho: '堀尾忠晴', flag: 'horio', hold: true, at: { x: 240, z: -40 } },
      { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 30000, taisho: '徳川家康', flag: 'tokugawa', hold: true, show: false },
      { id: 'konida', layer: 'konida', wing: 'center', men: 600, at: { x: -30, z: 210 } },
    ] },
  B: { name: '豊臣', facing: 0, honjin: { x: 0, z: -60 }, mpu: 4, formation: '方円', terrain: 'castle', flag: 'sanada', armor: 0x5a1e18, openAt: 60, attrition: 0.003,
    sonae: [
      { id: 'wall', layer: 'ichi', wing: 'center', men: 4000, taisho: '', flag: 'sanada', bind: F('wallG') },
      { id: 'nobu', layer: 'hatamoto', wing: 'center', men: 1000, taisho: '真田信繁', flag: 'sanada', bind: F('nobu') },
      // 11/9 徳川C：kaito の冬の陣の布陣図（docs/osaka_fuyu_fujinzu_ref_1109.md）の南の堀ぞいに合わせた：西から後藤（西の堀の角）・長宗我部盛親、
      //   八丁目口の真田丸の後ろに木村重成、東の黒門口に明石全登
      { id: 'goto', layer: 'gozume', wing: 'left', men: 2000, taisho: '後藤又兵衛', flag: 'toyotomi', hold: true, at: { x: -170, z: -150 } },
      { id: 'chosokabe', layer: 'gozume', wing: 'left', men: 3000, taisho: '長宗我部盛親', flag: 'toyotomi', hold: true, at: { x: -80, z: -140 } },
      { id: 'kimura', layer: 'gozume', wing: 'center', men: 3000, taisho: '木村重成', flag: 'toyotomi', hold: true, at: { x: 40, z: -145 } },
      { id: 'akashi', layer: 'gozume', wing: 'right', men: 2000, taisho: '明石全登', flag: 'toyotomi', hold: true, at: { x: 130, z: -140 } },
    ] },
  byMen: true,   // 軽い兵を史実の兵数の比で配る（11/9 徳川C。docs/fujin/k11_sanadamaru.md）
  // 11/14 クラウドか K286①：井伊・越前の備は本物の新手（八丁目口 (-70,40)・谷町口 (-150,22)）の西隣へ前に出し、始めの目（北西向き）の左に城を背に並ぶように
  namesFirst: ['前田利光', '井伊直孝', '松平忠直', '藤堂高虎', '伊達政宗', '徳川秀忠'],   // 名札は布陣図の大名を近い四つより先に（司令塔 K286②。前田は冬の陣の時の名の利光＝のちの利常）
  sonaeNames: true,   // 備の大将の名札を旗の上に（11/14 K286 クラウドす：四方の陣の名が布陣図と合うか写真で読めるように）
  bigFlags: 28,   // 11/14 クラウドか：大旗の枠（既定 18・携帯 10）では後ろの層の蜂須賀・山内・浅野・佐竹・上杉・堀尾と豊臣の四陣に幟が無かった。全ての陣に一本
  campFlags: 4,   // 動かない陣は幟を四本の一列に（兵の絵は出さない＝noFake のまま。真上から陣所が読めるように）
  flagHeight: 4.8,   // 後から置く備の幟も、この戦の一丈五尺までにそろえる。
  honjinView: { A: false, B: false },   // 家康は住吉の陣（戦場外）。下知は使番で伝え、前田と真田の本陣は戦のファイルが作る
};
