// K516 豊臣編の「戦の前の札（storyCard）」に残った字の訳（英語の時だけ i18n.js から読む）。クラウド k365-cloud-30 11/21。
//   k516_story_untr.mjs（?lang=en で札に日本語が残る字を戦ごとに数える道具）で拾った分。持ち主の表に同じ字があればそちらが先。

// 戦の中の兵の数の札（aria-label「<軍の名> 残り N人」）：豊臣編の軍の名（k516_gate.mjs の豊臣編で拾った分。クラウド k365-cloud-30）
const ARMY = [
  ['徳川・織田信雄', 'Tokugawa and Oda Nobukatsu'], ['織田信雄', 'Oda Nobukatsu'], ['豊臣秀次', 'Toyotomi Hidetsugu'], ['松田康長', 'Matsuda Yasunaga'], ['石田三成', 'Ishida Mitsunari'],
  ['宮部継潤', 'Miyabe Keijun'], ['前田・上杉', 'Maeda and Uesugi'], ['長宗我部', 'Chōsokabe'], ['羽柴', 'Hashiba'], ['柴田', 'Shibata'], ['根来', 'Negoro'], ['雑賀', 'Saika'],
  ['島津', 'Shimazu'], ['豊臣', 'Toyotomi'], ['秋月', 'Akizuki'], ['北条', 'Hōjō'], ['成田', 'Narita'], ['寄せ手', 'Besiegers'], ['一宮城', 'Ichinomiya Castle'], ['四国の衆', 'Shikoku men'],
  ['中入り', 'flanking march'], ['忍城', 'Oshi Castle'],
];
const ARMY_END = [['軍', ' army'], ['勢', ' forces'], ['方', ' side'], ['衆', ' band']];
const armyEn = (t) => {
  let o = t.replace(/（/g, ' (').replace(/）/g, ')');
  for (const [j, e] of ARMY) o = o.split(j).join('\u0001' + e + '\u0002');
  o = o.replace(/\u0002([軍勢方衆])/g, (m, c) => (ARMY_END.find((x) => x[0] === c) || [0, ''])[1]).replace(/[\u0001\u0002]/g, '').replace(/ +/g, ' ').trim();
  return /[぀-ヿ㐀-鿿]/.test(o) ? undefined : o;
};
export const ARMY_PAT = [
  /^(.+?) 残り([\d,]+)人$/,
  (m) => { const a = armyEn(m[1]); return a === undefined ? undefined : `${a}: ${m[2]} left`; },
];

export default [
  ['組頭と共に、この戦の目標を一つずつ果たせ', "With your squad leader, accomplish this battle's goals one by one"],
  ['話を読み終え、戦の支度へ進む。', 'Finish reading and go on to prepare for battle.'],
  // 山崎
  ['天正十年（1582）六月十三日　山城・山崎', 'Tenshō 10 (1582), 13th of the 6th month. Yamashiro · Yamazaki'],
  ['天正十年六月十三日　山城・山崎', '13th of the 6th month, Tenshō 10. Yamashiro · Yamazaki'],
  ['本能寺で信長様が討たれた。その報せは、備中高松の城を囲む羽柴秀吉の陣へ届いた。', "Lord Nobunaga was struck down at Honnō-ji. The news reached Hashiba Hideyoshi's camp, which was besieging Bitchū-Takamatsu Castle."],
  ['秀吉は毛利と和を結び、すぐに兵を返した。雨の中を夜も駆け、京へ近づくほど味方の旗は増えていった。', 'Hideyoshi made peace with the Mōri and turned his army back at once. They rode on through the rain, night and day, and the nearer they came to Kyoto, the more allied banners joined them.'],
  ['明智光秀は、天王山と淀川の間の狭い野に陣を敷いて待つ。前には円明寺川が流れている。', 'Akechi Mitsuhide waits in a narrow field between Mt. Tennōzan and the Yodo River. The Enmyōji River flows in front of him.'],
  ['足軽のYagoroも、泥にまみれて山崎の野へ着いた。', 'Ashigaru Yagoro too, covered in mud, reached the fields of Yamazaki.'],
  ['山崎の野へ出る', 'Go out to the fields of Yamazaki'],
  // 賤ヶ岳
  ['天正十一年（1583）四月二十日　近江・賤ヶ岳', 'Tenshō 11 (1583), 20th of the 4th month. Ōmi · Shizugatake'],
  ['天正十一年四月二十日　近江・賤ヶ岳', '20th of the 4th month, Tenshō 11. Ōmi · Shizugatake'],
  ['秀吉は美濃へ出ていて、陣にいない。大岩山の砦は中川清秀、岩崎山は高山右近が守る。', 'Hideyoshi has gone out to Mino and is not in camp. Nakagawa Kiyohide holds the fort on Mt. Ōiwa, and Takayama Ukon holds Mt. Iwasaki.'],
  ['北の行市山には、柴田方の佐久間盛政がいる。鬼玄蕃と呼ばれる、恐ろしい武将だ。', 'On Mt. Gyōichi to the north is Sakuma Morimasa of the Shibata side, a fearsome warrior called "Demon Genba".'],
  ['夜明け前、Yagoroは砦をつなぐ山道で見張りに立っていた。', 'Before dawn, Yagoro stood watch on the mountain path linking the forts.'],
  ['山道へ出る', 'Go out onto the mountain path'],
  // 任務の一行
  ['楽田の本陣から二重堀の砦へ下り、柵越しの小競り合いを守る。軍議の後、夜に池田・森の中入りの列と三河へ出る。', "From the main camp at Gakuden, go down to the Nijūbori fort and hold the skirmish across the fence. After the council of war, set out by night with Ikeda and Mori's flanking column toward Mikawa."],
  ['三河への道の徳川の番所を焼き、白山林で信吉様の陣を守る。檜ヶ根・仏ヶ根を経て細ヶ根の堀様の旗まで退く', "Burn the Tokugawa checkpoint on the road to Mikawa and guard Lord Nobuyoshi's camp at Shirayama Wood. Retreat via Hinokigane and Hotokegane to Lord Hori's banner at Hosogane"],
  ['戸次川を渡り、伊集院の先手を追う。島津の包囲を受けたら、浅瀬から退いて鏡城の陣へ生きて戻る。', 'Cross the Hetsugi River and chase Ijūin\'s vanguard. If the Shimazu close in, withdraw from the ford and return alive to the camp at Kagami Castle.'],
  ['蒲生・前田勢五千で秋月勢三千の岩石城を攻める。大手の坂を登り、打って出た敵を坂で退ける。', 'With 5,000 Gamō and Maeda troops, attack Iwaya Castle held by 3,000 Akizuki. Climb the main approach and drive back the enemy who sally out onto the slope.'],
  ['大手の坂を登り、二の丸の門の前へ出る', 'Climb the main approach to the gate of the second bailey'],
  ['出丸の間宮康俊を討つ', 'Defeat Mamiya Yasutoshi at the outer bailey'],
  ['井伊の陣から、家康の本陣へ下知を受けに行く', "From Ii's camp, go to Ieyasu's main camp to receive orders"],
  [ARMY_PAT[0], ARMY_PAT[1]],
];
