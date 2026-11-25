// H3（11/24 Sanae）：毛利・島津・伊達の城下を「暮らしのある町」に（清洲の作り＝town3d.js をそのまま使い回す）。
//   ・噂（RUMORS）：その戦の前の町で、侍・年寄り・町人が話す。清洲（oda_town.js RUMORS）と同じ形。前の戦の話と、次の戦の支度の話
//   ・帰り道の声（RETURN）：戦から城下へ戻った時の門番・町の人の声（town_return.js が読む）
//   ・町の見た目（LOOK）：吉田郡山＝城の背に郡山（山の城）／内城＝錦江湾の向こうに桜島／米沢＝雪国の盆地（town3d.js が読む）
//   出所：docs/house_mori.md・house_shimazu.md・house_date.md（史実の格もそこに）。字は短く、やさしく
import { isEn, addEn } from './i18n.js';

const J = (pairs) => pairs.map((p) => p[0]);
const R = {
  // ---- 毛利（吉田郡山） ----
  m01_koriyama: [['尼子の大軍が、出雲から峠を越えて来るそうな', 'They say the great Amago army is coming over the passes from Izumo'], ['城の山は大きい。曲輪がいくつも重なっておる', 'The castle hill is huge. Its baileys rise one above another'], ['町の者も城へ上がるそうじゃ。米と水を運べと', 'Even the townsfolk will go up to the castle. Carry rice and water, they say']],
  m02_oshikibata: [['郡山の籠城を、よう持ちこたえたものよ', 'We held out at Koriyama. A fine siege it was'], ['殿は陶殿と手を切られた。安芸の国人が殿に付くそうな', 'Our lord has broken with Sue. The Aki lords are siding with him'], ['宮川の兵が、山の向こうに来ておるらしい', 'Miyagawa\'s men are said to be just over the hills']],
  m03_itsukushima: [['折敷畑では、宮川の兵の一手が寝返ったそうな', 'At Oshikibata, one of Miyagawa\'s units turned to our side'], ['陶殿の大軍が、海の向こうに集まっておるらしい', 'Sue\'s great army is gathering across the sea'], ['宮島に城を築いたのは、陶殿を誘うためじゃと聞く', 'They say the fort on Miyajima was built to lure Sue in']],
  m04_susuma: [['厳島で陶殿が討たれた。島の嵐の夜じゃったそうな', 'Lord Sue fell at Itsukushima, on a stormy night'], ['周防の大内は、もう長くは持つまい', 'The Ouchi of Suo cannot last much longer'], ['須々万の城は山の中じゃ。水の手が要と聞く', 'Susuma Castle is in the hills. Its water is the key']],
  m05_gassan: [['周防と長門は、殿の国になった', 'Suo and Nagato now belong to our lord'], ['出雲の月山の城は、天下の堅城じゃそうな', 'Gassan Castle in Izumo is said to be the strongest in the land'], ['尼子の城へ米を運ぶ道を、断つのじゃと', 'We are to cut the roads that carry rice to the Amago']],
  m06_tachibana: [['月山の城が降った。尼子の殿が城を出られたそうな', 'Gassan has surrendered. The Amago lord has left his castle'], ['今度は海を渡って、筑前の大友と争うそうな', 'Now we cross the sea to fight the Otomo in Chikuzen'], ['舟の手配で、湊は大騒ぎじゃ', 'The harbor is in an uproar, readying the boats']],
  m07_kizugawa1: [['大殿（元就様）が亡くなられて、輝元様の世じゃ', 'The old lord Motonari has died. It is Terumoto\'s rule now'], ['大坂の本願寺へ、兵糧を舟で運ぶそうな', 'We will carry rice by boat to the Honganji at Osaka'], ['村上の水軍が、焙烙を積んでおるらしい', 'The Murakami fleet is loading fire pots']],
  m08_kizugawa2: [['木津川口で、織田の舟を焼き払うたそうな', 'At Kizugawa we burned the Oda boats'], ['織田は、鉄で包んだ大船を造ったと聞く', 'They say Oda has built great ships clad in iron'], ['焙烙が効かぬ船など、あるものか', 'A ship that fire pots cannot burn? Never']],
  m09_kozuki: [['鉄の船には、焙烙が効かなんだそうな', 'They say the fire pots did nothing to the iron ships'], ['播磨の上月の城に、尼子の残りが籠もっておる', 'The last of the Amago hold Kozuki Castle in Harima'], ['羽柴という男が、上月を助けに来るらしい', 'A man called Hashiba is coming to relieve Kozuki']],
  m10_takamatsu: [['上月の城が落ちた。山中鹿介も討たれたそうな', 'Kozuki has fallen. Yamanaka Shikanosuke is dead, they say'], ['羽柴が、備中の高松の城を水で囲んでおる', 'Hashiba has surrounded Takamatsu Castle in Bitchu with water'], ['殿は大軍で高松を救いに行かれる', 'Our lord marches with a great army to save Takamatsu']],
  m11_arita: [['若殿（元就様）が、安芸の国人を束ねようとしておられる', 'Our young lord, Motonari, is trying to bind the Aki local lords together'], ['武田の五千が、有田の城に迫っておるらしい', 'They say five thousand Takeda are closing in on Arita Castle'], ['わずかな兵で救いに行かれると聞いた。大丈夫かのう', 'I hear he rides to the rescue with only a few men. I hope he will be all right']],
  m12_gassan1: [['有田の戦で、若殿は武田の大将を討ち取られた', 'At Arita our young lord brought down the Takeda commander'], ['大内殿が、出雲の月山の城を三万で囲まれるそうな', 'Lord Ouchi will surround Gassan Castle in Izumo with thirty thousand'], ['殿もお供なさる。留守の郡山を守らねばならぬ', 'Our lord goes with him. We must guard Koriyama in his absence']],
  m13_fube: [['滅んだはずの尼子が、また出雲で兵を挙げたそうな', 'The Amago, who should have perished, have raised troops again in Izumo'], ['山中鹿介という男が、尼子の旗を担いでおるらしい', 'A man named Yamanaka Shikanosuke carries the Amago banner, they say'], ['吉川様と小早川様が、出雲へ向かわれる', 'Lords Kikkawa and Kobayakawa march for Izumo']],
  m14_tottori: [['上月の城の落ちたあと、羽柴は播磨を固めておる', 'After Kozuki fell, Hashiba has been consolidating Harima'], ['因幡の鳥取城が、羽柴に囲まれて米が尽きたそうな', 'Tottori Castle in Inaba is surrounded by Hashiba and out of rice, they say'], ['吉川経家様が、城の者を救うために入られたと聞く', 'I hear Lord Kikkawa Tsuneie went in to save the people in the castle']],
  m15_nangu: [['輝元様が、大坂で西軍の総大将になられた', 'Lord Terumoto has become commander-in-chief of the Western Army at Osaka'], ['家康殿の東軍が、美濃へ向かっておるらしい', 'They say Ieyasu\'s Eastern Army is marching for Mino'], ['南宮山の毛利が、動かぬという噂もある', 'There is a rumor that Mori on Nangu Mountain will not move']],
  // ---- 島津（内城） ----
  s09_iwatsurugi: [['大隅の岩剣城に、蒲生・菱刈・祁答院が籠もっておる', 'Gamo, Hishikari and Kedoin are holed up in Iwatsurugi Castle in Osumi'], ['御屋形様（貴久様）が、義弘様を連れて攻められるそうな', 'They say the lord Takahisa will attack, bringing Lord Yoshihiro']],
  s10_kamou: [['岩剣城が落ちた。義弘様の初陣は勝ちじゃそうな', 'Iwatsurugi has fallen. They say Lord Yoshihiro won his first battle'], ['次は蒲生の城じゃ。山と林の泥の戦になろう', 'Next is the Gamo castle. It will be a muddy fight in the hills and woods']],
  s11_hishikari: [['蒲生の城が落ちた。大隅の北は島津の物じゃ', 'Gamo Castle has fallen. The north of Osumi is Shimazu\'s'], ['北薩の菱刈に、肥後の相良が加勢しておるそうな', 'They say the Sagara of Higo are backing the Hishikari of northern Satsuma']],
  s12_takahara: [['菱刈を破って、北薩が静かになった', 'We beat the Hishikari and northern Satsuma is quiet'], ['日向の高原城は、水の手を断つと聞く', 'They say we will cut off the water at Takahara in Hyuga']],
  s13_hyuga: [['高原城が渇いて開いた。伊東の殿の力が落ちたそうな', 'Takahara opened, parched. They say Lord Ito\'s power is failing'], ['伊東が日向を捨てて、豊後へ逃げるらしい', 'The Ito are said to be abandoning Hyuga and fleeing to Bungo']],
  s14_minamata: [['日向が島津の物になった。薩摩・大隅・日向で三つじゃ', 'Hyuga is ours. Satsuma, Osumi and Hyuga make three'], ['今度は海を渡って、肥後の水俣を攻めるそうな', 'Now they say we will go by sea against Minamata in Higo']],
  s15_satsuma: [['根白坂で夜襲をかけたが、豊臣の大軍に押し返されたそうな', 'We raided at Nejirozaka by night but the great Toyotomi host pushed us back'], ['殿（義久様）は、薩摩へ退いて豊臣に降られるらしい', 'They say our lord Yoshihisa will withdraw to Satsuma and submit to the Toyotomi']],
  s01_kizakibaru: [['桜島の煙が、今日は東へ流れておる', 'The smoke of Sakurajima drifts east today'], ['日向の伊東が、加久藤の城を狙うておるそうな', 'They say the Ito of Hyuga have their eyes on Kakuto Castle'], ['飯野の義弘様は、兵が少ないと聞く', 'Lord Yoshihiro at Iino has only a few men, they say']],
  s02_mimikawa: [['木崎原で、伊東の大軍を少ない兵で破ったそうな', 'At Kizakibaru, our few men broke the great Ito army'], ['逃げると見せて、待って挟む。薩摩の戦じゃ', 'Pretend to flee, wait, then close in. That is the Satsuma way'], ['豊後の大友が、大軍で日向へ来るらしい', 'The Otomo of Bungo are coming into Hyuga with a great army']],
  s03_okitanawate: [['耳川で大友を破った。川が兵で埋まったそうな', 'We broke the Otomo at Mimikawa. The river filled with men'], ['肥前の龍造寺が、島原の有馬を攻めておる', 'The Ryuzoji of Hizen are attacking Arima at Shimabara'], ['家久様が、海を渡って有馬を助けに行かれる', 'Lord Iehisa will cross the sea to help Arima']],
  s04_iwaya: [['沖田畷で、龍造寺の殿が討たれたそうな', 'At Okitanawate, the Ryuzoji lord was killed'], ['九州の北へ、兵を進めるそうじゃ', 'We march north through Kyushu'], ['筑前の岩屋の城は、高橋紹運殿が守っておる', 'Iwaya Castle in Chikuzen is held by Takahashi Joun']],
  s05_hetsugi: [['岩屋の城の兵は、一人残らず討ち死にしたそうな', 'Every last man of Iwaya fell in battle'], ['大坂の豊臣が、四国の兵を豊後へ寄越したと聞く', 'Toyotomi of Osaka has sent Shikoku men into Bungo'], ['家久様が、戸次川の向こうで待ち構えておられる', 'Lord Iehisa waits for them beyond the Hetsugi river']],
  s06_nejirozaka: [['戸次川で、豊臣の先手を破ったそうな', 'At Hetsugi we broke the Toyotomi vanguard'], ['じゃが、関白の大軍が九州へ来るらしい', 'But the Regent\'s great host is coming to Kyushu'], ['数が違いすぎる、と年寄りは言うておる', 'The old men say their numbers are far too many']],
  s07_sacheon: [['殿は豊臣に降られた。薩摩は残ったそうな', 'Our lord has bowed to the Toyotomi. Satsuma is still ours'], ['義弘様は、海を渡って朝鮮におられる', 'Lord Yoshihiro is across the sea in Korea'], ['泗川の城に、明の大軍が寄せて来るらしい', 'A great Ming army is closing on the fort at Sacheon']],
  s08_sekigahara: [['泗川で、明の大軍を破ったそうな', 'At Sacheon we broke the great Ming army'], ['義弘様は、上方の伏見におられる', 'Lord Yoshihiro is at Fushimi in the capital region'], ['天下が二つに割れると、町の者は案じておる', 'The townsfolk fear the realm is splitting in two']],
  // ---- 長宗我部（岡豊）11/24 Sanae ----
  c04_nakatomi: [['岡豊の田は、今年もよう実っておる', 'The fields of Oko are rich again this year'], ['阿波の十河が、勝瑞の城に兵を集めておるそうな', 'They say Sogo is gathering men at Shozui Castle in Awa'], ['畦に槍を置いて寝る者ばかりじゃ。法螺を待っておる', 'Every man sleeps with his spear by the paddy. They wait for the conch']],
  // ---- 伊達（米沢） ----
  e01_soma: [['若殿の政宗様が、十八で家を継がれた', 'Young Lord Masamune became head of the house at eighteen'], ['相馬とは、長う境で争うておる', 'We have fought the Soma along the border for years'], ['政宗様の初めての大きな戦じゃそうな', 'They say it is Lord Masamune\'s first big battle']],
  e02_kobama: [['相馬の城を、いくつも取ったそうな', 'We took several Soma castles, they say'], ['小浜の大内が、殿に背いたらしい', 'Ouchi of Obama has turned against our lord'], ['政宗様は、城を攻めるのに容赦がないと聞く', 'They say Lord Masamune shows no mercy taking castles']],
  e03_hitotoribashi: [['大殿の輝宗様が、二本松で討たれた', 'The old lord Terumune was killed at Nihonmatsu'], ['佐竹と蘆名が、三万で攻めて来るそうな', 'Satake and Ashina are coming with thirty thousand'], ['こちらは七千ほどじゃ。雪の前の戦になる', 'We have about seven thousand. It will be a battle before the snows']],
  e04_koriyama: [['人取橋で、鬼庭左月様が討ち死になされた', 'Lord Oniniwa Sagetsu fell at Hitotoribashi'], ['佐竹の兵が、郡山のあたりに陣を張ったそうな', 'Satake has made camp around Koriyama'], ['殿は、今度は打って出ずに耐えると', 'This time our lord will hold, not charge out']],
  e05_suriagehara: [['郡山では、佐竹と睨み合うて引き分けたそうな', 'At Koriyama we faced Satake down to a draw'], ['猪苗代の盛国が、こちらに付いたらしい', 'Inawashiro Morikuni has come over to us'], ['雪が溶けたら、会津へ攻め入るそうな', 'When the snow melts, we march into Aizu']],
  e06_odawara: [['摺上原で、蘆名を破った。会津は殿の物じゃ', 'We broke the Ashina at Suriagehara. Aizu is ours'], ['関白が、小田原の北条を大軍で囲んでおる', 'The Regent has surrounded the Hojo at Odawara'], ['殿が遅れて行かれたら、首が飛ぶと噂じゃ', 'Word is, if our lord arrives late, it may cost his head']],
  e07_kasai: [['殿は白い装束で、関白の前に出られたそうな', 'Our lord went before the Regent dressed in white'], ['会津は取り上げられたが、伊達の家は残った', 'Aizu was taken away, but the Date house lives on'], ['葛西と大崎で、一揆が起きたらしい', 'There is an uprising in Kasai and Osaki']],
  e08_korea: [['一揆は鎮まり、殿は岩出山へ移られた', 'The uprising is over. Our lord has moved to Iwadeyama'], ['関白が、海の向こうの朝鮮へ兵を出すそうな', 'The Regent is sending armies across the sea to Korea'], ['伊達の行列は、都でも目立つ派手な装束じゃと', 'They say the Date march in clothes so bright even the capital will stare']],
  e09_matsukawa: [['朝鮮から戻った兵は、海の向こうの話ばかりじゃ', 'The men back from Korea talk only of lands over the sea'], ['上方で天下を二つに分ける戦があるらしい', 'There is to be a war in the west that splits the realm'], ['殿は上杉の福島の城を攻めるそうな', 'Our lord will attack the Uesugi at Fukushima']],
  e10_domyoji: [['殿は仙台に、新しい城と町を築かれた', 'Our lord has built a new castle and town at Sendai'], ['大坂の城に、浪人が大勢集まっておるそうな', 'Crowds of masterless samurai have gathered in Osaka Castle'], ['伊達の鉄砲の騎馬を、皆が見に来るらしい', 'Everyone wants to see the Date mounted gunners']],
  // ---- 今川（駿府）（11/24 Sanae・docs/house_imagawa.md ③。京から公家や連歌師が下った町） ----
  i01_hanakura: [['御屋形の氏輝様が、急に亡くなられたそうな', 'They say our lord Ujiteru has died suddenly'], ['跡目を、二人の弟御が争うておる', 'His two younger brothers are fighting over the succession'], ['承芳様は、京で学ばれたお坊様じゃ', 'Lord Shoho is a monk who studied in Kyoto']],
  i02_azukizaka1: [['三河へ兵を出すそうな。相手は尾張の織田じゃ', 'We march into Mikawa. The enemy is Oda of Owari'], ['雪斎様が、軍を率いられる', 'Lord Sessai will lead the army'], ['小豆坂という坂で、ぶつかるらしい', 'They say we will clash on a slope called Azukizaka']],
  i03_tahara: [['竹千代様が、途中で織田に奪われたそうな', 'They say young Takechiyo was seized and handed to Oda on the way'], ['田原の戸田の仕業じゃ', 'It was the work of Toda of Tahara'], ['御屋形様は、ひどくお怒りじゃ', 'Our lord is furious']],
  i04_azukizaka2: [['また小豆坂じゃ。今度は負けぬ', 'Azukizaka again. This time we will not lose'], ['雪斎様は、坂の陰に兵を伏せるおつもりらしい', 'They say Lord Sessai means to hide men behind the slope'], ['朝比奈殿も出られる', 'Lord Asahina rides out too']],
  i05_anjo: [['安城の城には、信長の兄がおるそうな', 'They say Nobunaga\'s elder brother holds Anjo Castle'], ['生け捕れば、竹千代様を取り戻せる', 'Take him alive and we can win back young Takechiyo'], ['冬の前に、片を付けたいものよ', 'We want this settled before winter']],
  i06_fukaya: [['三河の国人が、次々に背いておるそうな', 'They say the Mikawa lords are rising one after another'], ['尾張の柴田という猛者が、福谷へ来るらしい', 'A fierce Owari man called Shibata is coming for Fukaya'], ['城を守り抜けば、三河は落ち着く', 'Hold the castle and Mikawa will settle']],
  i07_terabe: [['三河の寺部の鈴木が、織田に付いたそうな', 'Suzuki of Terabe in Mikawa has gone over to Oda'], ['松平の若殿の初陣じゃ。御屋形様が命じられた', 'It is the young Matsudaira lord\'s first battle, by our lord\'s order'], ['人質暮らしの若殿が、もう大将か', 'The hostage boy is a commander already']],
  i08_otaka: [['大高の城は、織田の砦に囲まれて飢えておるそうな', 'Odaka Castle is surrounded by Oda forts and starving'], ['夜の間に米を運び入れるらしい。敵地の中じゃ', 'They will carry rice in by night, through enemy ground'], ['御屋形様は、いよいよ尾張へ出られる', 'Our lord is at last marching into Owari']],
  i09_marune: [['丸根と鷲津を落とせば、尾張への道が開く', 'Take Marune and Washizu and the road to Owari opens'], ['松平の殿が丸根、朝比奈殿が鷲津じゃ', 'Lord Matsudaira takes Marune, Lord Asahina Washizu'], ['御屋形様は、桶狭間で一息入れられるそうな', 'Our lord will rest a while at Okehazama']],
  i10_okehazama: [['御屋形様の行列は、京の公家衆のように華やかじゃ', 'Our lord\'s procession is as splendid as the court nobles of Kyoto'], ['二万五千の大軍じゃ。尾張の織田など、一揉みよ', 'Twenty-five thousand men. Oda of Owari will be crushed in one push'], ['列が長すぎて、先手と後ろが一日離れるそうな', 'The column is so long, they say the van and the rear are a day apart']],
  i11_kariya: [['御屋形様が、桶狭間で討たれた……', 'Our lord was killed at Okehazama...'], ['鳴海の岡部殿は、まだ城を守っておられる', 'Lord Okabe still holds Narumi Castle'], ['御首を、駿府へお連れするそうな', 'They say he will bring our lord\'s head home to Sunpu']],
  i12_ushikubo: [['松平の若殿が、岡崎から戻らぬそうな', 'They say the young Matsudaira lord will not come back from Okazaki'], ['松平が、織田と手を結んだらしい', 'They say Matsudaira has made a pact with Oda'], ['昨日の味方が、今日の敵か', 'Yesterday\'s friend is today\'s enemy']],
  i13_hikuma: [['遠江の国人が、背いておるそうな', 'They say the Totomi lords are in revolt'], ['曳馬の飯尾が、松平に通じたらしい', 'They say Iio of Hikuma has gone over to Matsudaira'], ['若殿の氏真様は、蹴鞠ばかりと言う者もおる', 'Some say young Lord Ujizane cares only for kickball']],
  i14_satta: [['甲斐の武田が、駿河へ攻めて来るそうな', 'They say Takeda of Kai is invading Suruga'], ['三国の約束は、破れたのじゃ', 'The three-house pact is broken'], ['重臣の中に、武田に通じた者がおるらしい', 'They say some senior retainers are secretly with Takeda']],
  i15_kakegawa: [['駿府が焼けた。若殿は掛川へ逃れられた', 'Sunpu has burned. The young lord has fled to Kakegawa'], ['掛川の朝比奈殿は、決して裏切らぬお方じゃ', 'Lord Asahina of Kakegawa will never betray us'], ['三河の家康が、掛川を囲むそうな', 'They say Ieyasu of Mikawa will besiege Kakegawa']],
  // ---- 北条（小田原） ----
  h02_odawara_k: [['越後の兵が、峠を越えて来るそうな', 'They say the Echigo army is coming over the passes'], ['早雲様から三代、この城は一度も落ちておらぬ', 'Three generations since Lord Soun, and this castle has never fallen'], ['米と塩を、城へ運び込んでおる', 'They are carrying rice and salt into the castle']],
};
export const HOUSE_RUMORS = Object.fromEntries(Object.entries(R).map(([k, v]) => [k, J(v)]));

// 帰り道の声：門番（勝ち・負け）と、列のそばを通った時の町の人の声
const RET = {
  mori: { win: ['勝ち戦じゃ！　一文字三つ星の旗が戻ってきた', 'Victory! The banner of the three stars is back'], lose: ['……戻ってきた。郡山の山が、今日は暗う見える', '...They\'re back. The castle hill looks dark today'],
    crowd: [['お帰りなされ！　洞春寺へ礼を言いに行かねば', 'Welcome home! We must give thanks at the temple'], ['舟で戻った者もおるそうな', 'Some came back by boat'], ['城の山の上で、篝火が焚かれておる', 'The bonfires are lit on the castle hill']],
    sad: [['怪我人ばかりじゃ……', 'So many wounded...'], ['川で傷を洗うてやれ', 'Wash their wounds in the river'], ['静かに迎えてやれ', 'Greet them quietly']] },
  shimazu: { win: ['勝ち戦じゃ！　丸に十字の旗が戻ってきた', 'Victory! The cross-in-circle banner is back'], lose: ['……戻ってきた。桜島の灰が、肩に積もっておる', '...They\'re back. Ash from Sakurajima lies on their shoulders'],
    crowd: [['お帰りなされ！　焼酎を出せ', 'Welcome home! Bring out the shochu'], ['逃げると見せて勝ったそうな。薩摩の戦じゃ', 'They feigned flight and won. The Satsuma way'], ['湊の舟が、皆で迎えに出ておる', 'The harbor boats have all come out to meet them']],
    sad: [['怪我人ばかりじゃ……', 'So many wounded...'], ['海の風に当てて、休ませてやれ', 'Let them rest in the sea breeze'], ['旗が戻らなんだ', 'The banner did not come back']] },
  chosokabe: { win: ['勝ち戦じゃ！　七つ片喰の旗が戻ってきた', 'Victory! The seven-sorrel banner is back'], lose: ['……戻ってきた。田の者が、何人も帰らなんだ', '...They\'re back. Many farmers did not come home'],
    crowd: [['お帰りなされ！　刈り入れに間に合うたな', 'Welcome home! You are back in time for the harvest'], ['鍬を持って出迎えじゃ', 'We greet you with our hoes in hand'], ['元親様の槍が、先頭じゃったそうな', 'Lord Motochika\'s spear led the way']],
    sad: [['怪我人ばかりじゃ……', 'So many wounded...'], ['田のことは、わしらがやっておく。休め', 'We will tend the fields. Rest'], ['静かに迎えてやれ', 'Greet them quietly']] },
  date: { win: ['勝ち戦じゃ！　竹に雀の旗が戻ってきた', 'Victory! The sparrows-in-bamboo banner is back'], lose: ['……戻ってきた。雪の道を、足を引きずって', '...They\'re back, dragging their feet through the snow'],
    crowd: [['お帰りなされ！　囲炉裏に火を入れておいた', 'Welcome home! The hearth fires are lit'], ['政宗様の馬印が、先頭じゃったそうな', 'Lord Masamune\'s standard led the way'], ['雪を払うて、中へ入れ', 'Brush off the snow and come inside']],
    sad: [['怪我人ばかりじゃ……', 'So many wounded...'], ['凍えておる。早う火へ', 'They\'re frozen. Get them to the fire'], ['静かに迎えてやれ', 'Greet them quietly']] },
  imagawa: { win: ['……戻ってきた。御屋形様の旗が、戻らなんだ', '...They\'re back. Our lord\'s banner did not return'], lose: ['……戻ってきた。駿府の町が、今日は静かじゃ', '...They\'re back. Sunpu is silent today'],
    crowd: [['生きて戻ったか。よう戻った', 'You came back alive. Well done'], ['尾張で、ひどい雨に遭うたそうな', 'They say a terrible rain caught them in Owari'], ['寺で、御屋形様の供養をするそうじゃ', 'There will be prayers for our lord at the temple']],
    sad: [['怪我人ばかりじゃ……', 'So many wounded...'], ['館の庭の鞠の音が、止んでおる', 'The kickball in the lord\'s garden has gone quiet'], ['静かに迎えてやれ', 'Greet them quietly']] },
  hojo: { win: ['勝ち戦じゃ！　三つ鱗の旗が戻ってきた', 'Victory! The triple-scale banner is back'], lose: ['……戻ってきた。海の風が、今日は重い', '...They\'re back. The sea wind feels heavy today'],
    crowd: [['お帰りなされ！　早雲寺へ礼を言いに行かねば', 'Welcome home! We must give thanks at Soun-ji'], ['城は落ちなんだ。早雲様以来の城じゃ', 'The castle did not fall. It has stood since Lord Soun'], ['魚の町が、皆で迎えに出ておる', 'The fish market folk have all come out to meet them']],
    sad: [['怪我人ばかりじゃ……', 'So many wounded...'], ['堀の水で傷を洗うてやれ', 'Wash their wounds with moat water'], ['静かに迎えてやれ', 'Greet them quietly']] },
};
export function houseReturn(key) {
  const r = RET[key];
  return r && { win: r.win[0], lose: r.lose[0], crowd: J(r.crowd), sad: J(r.sad) };
}

// 町の見た目：家ごとに一つ（town3d.js）
export const HOUSE_LOOK = {
  mori: { yamajiro: true },        // 城の背に郡山（大きな山の城。木の茂る山と頂の曲輪の小屋・篝火）
  shimazu: { sakurajima: true },   // 錦江湾の向こうに桜島と煙（eve の時だけだったのを、内城の町はいつも）
  date: { yukiguni: true },
  chosokabe: { yamajiro: true },   // 岡豊：山城（岡豊山）の麓の町（11/24 Sanae）        // 雪の盆地（町の外は白く、通りは踏まれた雪。降る雪）
};

if (isEn()) {
  const pairs = Object.values(R).flat();
  for (const r of Object.values(RET)) pairs.push(r.win, r.lose, ...r.crowd, ...r.sad);
  // 11/24 に町を足した戦の町の名と時（shimazu_line.js・date_line.js の town・townWhen）
  pairs.push(['駿府', 'Sunpu'], ['駿府 城下', 'Sunpu castle town'], ['駿府城下', 'Sunpu castle town'], ['永禄三年　五月', 'Fifth month, Eiroku 3 (1560)'], ['黒川', 'Kurokawa'], ['黒川 城下', 'Kurokawa castle town'], ['岩出山', 'Iwadeyama'], ['岩出山 城下', 'Iwadeyama castle town'], ['仙台', 'Sendai'], ['仙台 城下', 'Sendai castle town'],
    ['天正十二年　三月', 'Third month, Tensho 12 (1584)'], ['天正十四年　七月', 'Seventh month, Tensho 14 (1586)'], ['天正十四年　十二月', 'Twelfth month, Tensho 14 (1586)'],
    ['天正十五年　四月', 'Fourth month, Tensho 15 (1587)'], ['慶長三年　十月', 'Tenth month, Keicho 3 (1598)'], ['慶長五年　九月', 'Ninth month, Keicho 5 (1600)'],
    ['天正十二年　十月', 'Tenth month, Tensho 12 (1584)'], ['天正十三年　八月', 'Eighth month, Tensho 13 (1585)'], ['天正十三年　十一月', 'Eleventh month, Tensho 13 (1585)'],
    ['天正十六年　六月', 'Sixth month, Tensho 16 (1588)'], ['天正十八年　五月', 'Fifth month, Tensho 18 (1590)'], ['天正十八年　十一月', 'Eleventh month, Tensho 18 (1590)'],
    ['天正二十年　正月', 'First month, Tensho 20 (1592)'], ['慶長五年　十月', 'Tenth month, Keicho 5 (1600)'], ['慶長二十年　四月', 'Fourth month, Keicho 20 (1615)']);
  addEn(pairs);
}
