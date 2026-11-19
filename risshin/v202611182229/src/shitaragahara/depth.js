// 設楽原の陣立ての表（docs/fujin/shitaragahara.md・docs/army_depth_howto.md の型）。西（−x）が織田・徳川、東（＋x）が武田。
//   柵の際の鉄砲と寄せの最前は本物の兵と既存の軽い列が受け持つ。この表は奥の層（大将の備・本陣・後詰）を兵数の比で置く。
//   K265 11/15 iMac：備の重みは、戦の中の将の陣・幟（b_shitaragahara.js の CHAUSU・IEYASU・KATSUYORI・ALLIED/REAR/TAKEDA_POSTS）の20後ろに置く。
//   前は同じ将が陣と備の二か所に居た（信長 230m・家康 131m・勝頼 100m 離れて二人）。茶臼山・弾正山・才ノ神は標高の丘の上の陣に合わせた。
//   どの備も動かない（hold）。勝ち負け・本物の兵の数には入らない。ゲームの1は実の約2m（mpu 2）。
const E = Math.PI / 2, Wd = -Math.PI / 2;
export const DEPTH_SHITARA = {
  byMen: true,
  A: { name: '織田・徳川', facing: E, honjin: { x: -486, z: -100 }, mpu: 2, formation: '方円', terrain: 'plain', flag: 'oda', armor: 0x1f1e1c, uma: 'kasa', openAt: 99999, attrition: 0,
    sonae: [
      { id: 'sakuma', layer: 'ichi', wing: 'left', men: 3000, taisho: '佐久間信盛', flag: 'sakuma', hold: true, at: { x: -48, z: -440 } },
      { id: 'hashiba', layer: 'ni', wing: 'left', men: 2500, taisho: '羽柴秀吉', flag: 'toyotomi', hold: true, at: { x: -320, z: -320 } },
      { id: 'takigawa', layer: 'ni', wing: 'center', men: 2500, taisho: '滝川一益', flag: 'takigawa', hold: true, at: { x: -75, z: -340 } },
      { id: 'niwa', layer: 'ni', wing: 'center', men: 2500, taisho: '丹羽長秀', flag: 'sujikai', hold: true, at: { x: -260, z: -230 } },
      { id: 'nobutada', layer: 'yobi', wing: 'left', men: 4000, taisho: '織田信忠', flag: 'oda', hold: true, at: { x: -260, z: -420 } },
      { id: 'nobunaga', layer: 'honjin', wing: 'center', men: 6000, taisho: '織田信長', flag: 'oda', hold: true, at: { x: -506, z: -100 } },
      { id: 'gozume', layer: 'gozume', wing: 'center', men: 4000, taisho: '', flag: 'oda', hold: true, at: { x: -430, z: 120 } },
      { id: 'okubo', layer: 'sakite', wing: 'right', men: 500, taisho: '大久保忠世', flag: 'tokugawa', hold: true, at: { x: 40, z: 410 } },
      { id: 'tokuMae', layer: 'ni', wing: 'right', men: 3500, taisho: '本多忠勝', flag: 'tokugawa', hold: true, at: { x: -85, z: 440 } },
      { id: 'ieyasu', layer: 'hatamoto', wing: 'right', men: 3000, taisho: '徳川家康', flag: 'tokugawa', hold: true, at: { x: -100, z: 350 } },
      { id: 'nobuyasu', layer: 'gozume', wing: 'right', men: 1000, taisho: '松平信康', flag: 'tokugawa', hold: true, at: { x: -250, z: 450 } },
    ] },
  B: { name: '武田', facing: Wd, honjin: { x: 430, z: 10 }, mpu: 2, formation: '鶴翼', terrain: 'plain', flag: 'takeda', armor: 0x2e2822, openAt: 99999, attrition: 0,
    sonae: [
      { id: 'baba', layer: 'ichi', wing: 'right', men: 1200, taisho: '馬場信春', flag: 'takeda', hold: true, at: { x: 270, z: -440 } },
      { id: 'tsuchiya', layer: 'ichi', wing: 'right', men: 1000, taisho: '土屋昌次', flag: 'takeda', hold: true, at: { x: 125, z: -340 } },
      { id: 'ichijo', layer: 'ni', wing: 'right', men: 1500, taisho: '穴山信君', flag: 'takeda', hold: true, at: { x: 260, z: -380 } },
      { id: 'naito', layer: 'ichi', wing: 'center', men: 1000, taisho: '内藤昌豊', flag: 'takeda', hold: true, at: { x: 125, z: -30 } },
      { id: 'hara', layer: 'ichi', wing: 'center', men: 800, taisho: '原昌胤', flag: 'takeda', hold: true, at: { x: 160, z: 70 } },
      { id: 'nobukado', layer: 'ni', wing: 'center', men: 1000, taisho: '武田信廉', flag: 'takeda', hold: true, at: { x: 230, z: 130 } },
      { id: 'yamagata', layer: 'ichi', wing: 'left', men: 1500, taisho: '山県昌景', flag: 'akazonae', hold: true, at: { x: 65, z: 350 } },
      { id: 'obata', layer: 'ni', wing: 'left', men: 1000, taisho: '小幡信貞', flag: 'akazonae', hold: true, at: { x: 200, z: 230 } },
      { id: 'nobutoyo', layer: 'yobi', wing: 'left', men: 1000, taisho: '武田信豊', flag: 'takeda', hold: true, at: { x: 240, z: 400 } },
      { id: 'katsuyori', layer: 'honjin', wing: 'center', men: 2000, taisho: '武田勝頼', flag: 'takeda', hold: true, at: { x: 450, z: 10 } },
    ] },
  honjinView: { A: true, B: true },
};
