// K516 英語版：道明寺の戦い（旧大坂編 domyoji・b_domyoji.js）の画面に出る字（任務・ピン・名・台詞・幕・結果・物語）。
//   英語の時だけ b_domyoji.js から読む（日本語の時は読まない・重さ0）。名の多くは徳川編の表（i18n_k13_domyoji.js）を使い回す。
//   数の入る字は下の形（正規表現）で訳す。欠片が訳せない時は日本語のまま残す（半端な英語にしない）。クラウド kaito2 道明寺の持ち主 11/21。
import { tr } from './i18n.js';
import K13 from './i18n_k13_domyoji.js';

const JA = /[぀-ヿ㐀-鿿]/;
const T = (s) => { const t = tr(String(s).trim()); return t && !JA.test(t) ? t : undefined; };
const M = { 意気盛ん: 'high spirits', 平常: 'steady', 動揺: 'shaken', 崩れかけ: 'breaking' };

export default [
  ...K13,
  // 士気の一言（ピンの「〇〇・意気盛ん」）
  ['意気盛ん', 'High spirits'], ['平常', 'Steady'], ['動揺', 'Shaken'], ['崩れかけ', 'Breaking'],
  // 組・人
  ['水野勝成の手', "Mizuno Katsunari's men"], ['本多忠政の手', "Honda Tadamasa's men"], ['松平忠明の手', "Matsudaira Tadaakira's men"],
  ['後藤の先手', "Goto's vanguard"], ['山田外記の組', "Yamada Geki's band"], ['山田外記', 'Yamada Geki'],
  ['後藤の物見', "Goto's scouts"], ['物見', 'Scout'], ['伝令', 'Messenger'], ['片倉重長の鉄砲', "Katakura Shigenaga's guns"],
  ['古沢満興の組', "Furusawa Mitsuoki's band"], ['古沢満興', 'Furusawa Mitsuoki'], ['後藤勢の後備え', "Goto's rear guard"],
  ['薄田兼相の隊', "Susukida Kanesuke's unit"], ['明石全登の隊', "Akashi Takenori's unit"], ['水野の鉄砲組', 'Mizuno gunners'],
  ['真田の鉄砲', 'Sanada guns'], ['真田の足軽', 'Sanada foot soldiers'], ['本多', 'Honda'], ['松平', 'Matsudaira'],
  ['徳川方（大和口）', 'Tokugawa side (Yamato road)'],
  // 任務・段・ピン
  ['霧の中、水野の手に加わって小松山へ寄せよ', "In the fog, join Mizuno's men and advance on Mt. Komatsu"],
  ['霧が晴れるまで、水野の旗を離れるな', "Stay by Mizuno's banner until the fog lifts"],
  ['水野の先手の一手を預かり、小松山の後藤勢を攻めよ', "Lead a band of Mizuno's vanguard and attack Goto on Mt. Komatsu"],
  ['小松山の後藤勢を攻めよ', 'Attack Goto on Mt. Komatsu'], ['小松山へかかれ', 'Attack Mt. Komatsu'],
  ['後藤又兵衛の先手が山の上に', "Goto Matabei's vanguard holds the hilltop"],
  ['又兵衛、山を駆け下る', 'Matabei charges down the hill'], ['後藤の旗本が、寄せ手の中へ', "Goto's guard crashes into the attackers"],
  ['徳川の先手の将が、又兵衛の兵に討たれる', "A Tokugawa vanguard captain falls to Matabei's men"],
  ['伊達勢、着陣', 'The Date forces arrive'], ['片倉重長の鉄砲が、南から又兵衛を撃つ', "Katakura Shigenaga's guns fire on Matabei from the south"],
  ['小松山を取った', 'Mt. Komatsu is taken'], ['薄田兼相・明石全登、着陣', 'Susukida Kanesuke and Akashi Takenori arrive'],
  ['霧で道を誤り、又兵衛に遅れて着いた', 'Lost in the fog, they arrived after Matabei'],
  ['瀬を渡ってくる薄田兼相の隊を止めよ', "Stop Susukida's unit crossing the ford"],
  ['石川の瀬を渡ってくる薄田兼相の隊を止めよ', "Stop Susukida's unit crossing the Ishikawa ford"],
  ['川を渡って追うな。東の岸に留まれ', "Don't cross to chase them. Stay on the east bank"],
  ['薄田の隊が瀬の中で乱れる', "Susukida's unit falls into disorder in the ford"],
  ['道明寺の瀬を守った', 'The Domyoji ford is held'], ['石川の瀬を守った', 'The Ishikawa ford is held'],
  ['真田・毛利勢、誉田に着く', 'Sanada and Mori reach Konda'], ['赤備えの旗が、石川の向こうに並ぶ', 'Red banners line up across the Ishikawa'],
  ['石川の東岸の旗を守り、味方が退くまで敵を討て', 'Guard the banner on the east bank and fight until our side pulls back'],
  ['石川の東岸の旗の前で、豊臣勢が退くまで敵を討て', 'Fight at the east bank banner until the Toyotomi forces pull back'],
  ['伊達勢と真田勢がぶつかり、押し戻される', 'Date and Sanada clash, and Date is pushed back'],
  ['道明寺の戦、終わる', 'The Battle of Domyoji ends'], ['寄せの下知まで待つ', 'Wait for the order to attack'],
  ['霧が晴れた', 'The fog has lifted'], ['小松山と石川の河原が見える。豊臣の後詰の旗は、まだ見えない', 'Mt. Komatsu and the Ishikawa riverbed come into view. No Toyotomi relief banners yet.'],
  ['霧の中で持ち場を離れた', 'You left your post in the fog'], ['下知なく石川を渡った', 'You crossed the Ishikawa without orders'],
  ['水野勢の武者と槍を合わせ、小松山に討たれた', "Fell on Mt. Komatsu, crossing spears with Mizuno's warriors"],
  ['伊達勢の鉄砲に撃たれ、小松山に倒れた', 'Shot by the Date guns, fell on Mt. Komatsu'],
  ['兵を失い、小松山で力尽きた', 'Lost his men and fell on Mt. Komatsu'],
  ['道明寺の河原に倒れる', 'Falls on the Domyoji riverbed'],
  ['後藤の先手が崩れたぞ！', "Goto's vanguard is breaking!"],
  // 行き先の▼の名（goals5.js goalNoun が任務の文から切り出す字）
  ['小松山の後藤勢', 'Goto on Mt. Komatsu'], ['水野の手', "Mizuno's men"], ['水野の旗', "Mizuno's banner"], ['石川の瀬', 'Ishikawa ford'],
  ['道明寺の瀬', 'Domyoji ford'], ['味方が退く', 'Until our side pulls back'], ['豊臣勢が退く', 'Until the Toyotomi pull back'], ['誉田', 'Konda'], ['大坂', 'Osaka'],
  // 台詞
  ['又兵衛は剛の者ぞ。後詰が来ぬうちに、小松山を取る', 'Matabei is a fierce one. Take Mt. Komatsu before his relief comes.'],
  ['朝霧が濃い。水野の旗を見失うな', "The morning fog is thick. Don't lose sight of Mizuno's banner."],
  ['進め！　山の麓まで槍を揃えて押し出せ！', 'Forward! Spears together, push to the foot of the hill!'],
  ['霧の中に人影！　後藤の物見じゃ！', "Figures in the fog! Goto's scouts!"],
  ['山の上から鉄砲じゃ！　霧の中から撃ってくる！', "Guns from the hilltop! They're firing out of the fog!"],
  ['山へかかれ！　敵を追い落とせ！', 'Up the hill! Drive them off!'],
  ['小松山は渡さぬ！　一歩も退くな！', 'Mt. Komatsu is ours! Not one step back!'],
  ['真田も毛利も、まだ来ぬか……。ならば待たぬ。この又兵衛だけで討って出る！', "No Sanada, no Mori yet... Then I won't wait. Matabei attacks alone!"],
  ['後藤又兵衛の旗が、山の上から駆け下りてくるぞ！', "Goto Matabei's banner is charging down the hill!"],
  ['崩れるな！　槍を立てて受け止めよ！', 'Hold together! Raise spears and take the charge!'],
  ['伊達政宗殿の先手、片倉小十郎殿、着陣！', "Lord Date Masamune's vanguard, Katakura Kojuro, has arrived!"],
  ['山の南の肩から、後藤の二の手が下りてくるぞ！', "Goto's second wave is coming down the south shoulder!"],
  ['又兵衛が倒れたぞ！　後藤勢が崩れる！', "Matabei is down! Goto's forces are breaking!"],
  ['――霧に迷った真田・毛利の後詰は、ついに間に合わなかった', '— Lost in the fog, the Sanada and Mori relief never arrived in time'],
  ['石川の向こうに新手じゃ！　瀬を渡らせるな。川べりで止めよ！', "Fresh troops across the Ishikawa! Don't let them cross. Stop them at the bank!"],
  ['瀬は一つじゃ。鉄砲組、薄田が川の中で足を取られるまで待て', "There's only one ford. Gunners, wait until Susukida is stuck in the river."],
  ['川の中じゃ！　鉄砲組、放てぇっ！', "They're in the river! Gunners, fire!"],
  ['乱れた！　岸へ上がる所を、槍で叩き落とせ！', 'They broke! Spear them as they climb the bank!'],
  ['川の向こうに赤い旗が……！　真田じゃ！', "Red banners across the river...! It's Sanada!"],
  ['渡るな！　伊達勢が誉田で当たっておる。我らはこの岸を固めよ', "Don't cross! Date is fighting at Konda. We hold this bank."],
  ['赤備えが瀬を渡ってくるぞ！', 'The red armor is crossing the ford!'],
  ['伊達勢が押し戻され申した！　真田は追わず、陣を固めておりまする', "Date has been pushed back! Sanada isn't pursuing; he's holding his lines."],
  ['――日が傾くころ、大坂城から退けの下知が届いた。真田信繁は殿（しんがり）となって、兵をまとめて退いたという', '— As the sun sank, Osaka Castle ordered a withdrawal. Sanada Nobushige took the rear guard and led his men back.'],
  ['関東勢百万と候え、男は一人もなく候', 'A million men from the east, and not one real man among them'],
  ['我こそは薄田隼人正兼相！　その首、この瀬で貰い受ける！', "I am Susukida Hayato-no-sho Kanesuke! I'll take your head at this ford!"],
  ['戻れ！　霧の中で旗を見失えば、討たれるだけじゃ！', 'Come back! Lose the banner in the fog and you die!'],
  ['渡るなと申したはずじゃ！　川向こうには真田がおるぞ！', "I said don't cross! Sanada is over there!"],
  ['後藤又兵衛が与力、古沢満興！　小松山は一歩も渡さぬ！', "Furusawa Mitsuoki, retainer of Goto Matabei! Not one step of Mt. Komatsu!"],
  // 天気・時
  ['朝霧', 'Morning fog'], ['霧が晴れていく', 'Fog lifting'], ['晴', 'Clear'], ['朝', 'Morning'], ['昼', 'Noon'], ['昼下がり', 'Afternoon'],
  // 物語
  ['慶長二十年（元和元年）五月六日、大坂夏の陣の道明寺の戦い。冬の陣の和睦で堀を埋められた豊臣方は、城を出て戦うほかなかった。後藤又兵衛（基次）は二千八百ほどで夜のうちに石川を渡り、小松山に登って、大和口から来た水野勝成・本多忠政・松平忠明・伊達政宗らの徳川勢を迎え撃った。濃い霧のため、あとに続くはずの真田信繁・毛利勝永らは遅れ、又兵衛は数時間の奮戦の末に討ち死にした。遅れて着いた薄田兼相も討ち死にし、明石全登は傷を負った。昼すぎ、真田勢は誉田の辺りで伊達勢を押し返したのち、大坂城からの下知で兵をまとめて退いた。「関東勢百万と候え、男は一人もなく候」は、この退き際に信繁が言ったと伝わる言葉である。',
    'The Battle of Domyoji, 6th day of the 5th month, 1615, in the Summer Siege of Osaka. After the winter peace filled in their moats, the Toyotomi side had no choice but to fight in the open. Goto Matabei (Mototsugu) crossed the Ishikawa by night with about 2,800 men and climbed Mt. Komatsu to meet the Tokugawa forces of Mizuno Katsunari, Honda Tadamasa, Matsudaira Tadaakira and Date Masamune coming down the Yamato road. Thick fog delayed Sanada Nobushige and Mori Katsunaga, who were meant to follow, and Matabei fell after hours of fighting. Susukida Kanesuke, arriving late, was also killed, and Akashi Takenori was wounded. After noon, Sanada pushed back the Date forces near Konda, then withdrew on orders from Osaka Castle. "A million men from the east, and not one real man among them" is said to be what Nobushige spoke as he pulled back.'],
  // 数・名の入る字
  [/^(.+)、又兵衛が石川を渡った。あの小松山に陣取っておる$/, (m) => `${T(m[1]) ? T(m[1]) + ', ' : ''}Matabei has crossed the Ishikawa. He's dug in on Mt. Komatsu.`],
  [/^(.+)、よう働いた。明日はいよいよ大坂じゃ。天王寺口で決着がつく$/, (m) => `${T(m[1]) ? T(m[1]) + ', w' : 'W'}ell fought. Tomorrow it's Osaka. It will be settled at Tennoji.`],
  [/^(.+)・(意気盛ん|平常|動揺|崩れかけ)$/, (m) => { const a = T(m[1]); return a && `${a} · ${M[m[2]]}`; }],
  [/^(.+)の後続$/, (m) => { const a = T(m[1] + 'の手'); return a && `${a} (follow-up)`; }],
  [/^(.+)が崩れた！$/, (m) => { const a = T(m[1]); return a && `${a} is breaking!`; }],
  [/^後藤勢 (\d+)人$/, (m) => `Goto forces ${m[1]}`],
  [/^薄田・明石 (\d+)人$/, (m) => `Susukida & Akashi ${m[1]}`],
  [/^豊臣勢が退くまで (\d+)秒$/, (m) => `${m[1]}s until the Toyotomi pull back`],
  // 戦の前の札（hud_opening.js：日付を全角の空白で割る・陣営の名と人数を一つの字に）
  ['慶長二十年五月六日', '6th day of the 5th month, 1615'],
  [/^夏・(朝霧|霧が晴れていく|晴)・(朝|昼|昼下がり)$/, (m) => `Summer · ${T(m[1])} · ${T(m[2])}`],
  [/^(徳川方（大和口）|豊臣方)　([\d,]+)人$/, (m) => { const a = T(m[1]); return a && `${a}  ${m[2]} men`; }],
  [/^慶長二十年五月六日　夏・(朝霧|霧が晴れていく|晴)・(朝|昼|昼下がり)$/, (m) => `6th day of the 5th month, 1615 — Summer · ${T(m[1])} · ${T(m[2])}`],
  // 本陣の塊の名（b_mid.js の campDepth が『大将の名＋の本陣』で付ける。en_left_probe 11/28 クラウド b_osaka 持ち主）
  [/^(.+)の本陣$/, (m) => { const a = T(m[1]); return a && `${a}'s HQ`; }],
];
