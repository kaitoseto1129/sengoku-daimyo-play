// k11/depth.js … 真田丸の軍勢の厚み・陣立て（docs/army_depth_howto.md の表。docs/generals_toyo_toku_1108.md の 11）
// 徳川（南）：前田の先手（山崎）と二の手は本物。西に井伊・越前の松平、東に藤堂・伊達、奥に秀忠。家康の本陣は戦場外の住吉。
//   井伊・越前は「城内の爆発」で堀へ殺到する本物の新手が別に出る。この表の井伊・越前はその後ろに残る備（動かない）。
// 豊臣（北）：塀の内の鉄砲と信繁の旗本は本物。丸の後ろの惣構に後藤又兵衛・毛利勝永・明石全登の陣（動かない）。
const F = (k) => (rt) => rt.flags[k];
export default {
  A: { name: '徳川', facing: Math.PI, honjin: { x: -70, z: 176 }, mpu: 4, formation: '鶴翼', terrain: 'castle', flag: 'tokugawa', armor: 0x1f1e1c, uma: 'ogi', openAt: 60, attrition: 0.002,
    sonae: [
      { id: 'yam', layer: 'sakite', wing: 'center', men: 600, taisho: '山崎長徳', flag: 'maeda', bind: F('yam') },
      { id: 'second', layer: 'ichi', wing: 'center', men: 800, taisho: '本多政重', flag: 'maeda', bind: F('second') },
      { id: 'maeda', layer: 'ni', wing: 'center', men: 10600, taisho: '前田利光', flag: 'maeda', hold: true, at: { x: -14, z: 150 } },
      { id: 'ii', layer: 'ichi', wing: 'left', men: 4000, taisho: '井伊直孝', flag: 'ii', hold: true, at: { x: -110, z: 104 } },
      { id: 'echizen', layer: 'ichi', wing: 'left', men: 10000, taisho: '松平忠直', flag: 'tokugawa', hold: true, at: { x: -160, z: 118 } },
      { id: 'todo', layer: 'ni', wing: 'right', men: 4000, taisho: '藤堂高虎', flag: 'todo', hold: true, at: { x: 104, z: 128 } },
      { id: 'date', layer: 'ni', wing: 'right', men: 10000, taisho: '伊達政宗', flag: 'date', hold: true, at: { x: 150, z: 150 } },
      { id: 'hidetada', layer: 'yobi', wing: 'right', men: 20000, taisho: '徳川秀忠', flag: 'tokugawa', hold: true, at: { x: 190, z: 230 } },   // 岡山（南東。kaito の布陣図）
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
  flagHeight: 4.8,   // 後から置く備の幟も、この戦の一丈五尺までにそろえる。
  honjinView: { A: false, B: false },   // 家康は住吉の陣（戦場外）。下知は使番で伝え、前田と真田の本陣は戦のファイルが作る
};
