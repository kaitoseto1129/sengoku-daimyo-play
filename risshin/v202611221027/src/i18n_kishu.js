// K516 英語版：紀州征伐の千石堀城（t04a_sengokubori）と太田城（t04b_ota）の画面に出る字
//   （任務の一行・ピンの名・武将と勢の名・幕・道のりと残りの数・結果の札・戦の説明）。
//   英語の時だけ b_t04_kishu.js から読む（日本語の時は読まない・重さ0）。
//   台詞は戦では字幕を出さないので入れない。人の名はローマ字（姓・名の順）。クラウド 紀州の持ち主 11/21。
const T = [
  // 勢・武将
  ['羽柴勢', 'Hashiba army'], ['羽柴', 'Hashiba'], ['根来衆', 'Negoro warrior monks'], ['雑賀衆', 'Saika gunners'],
  ['羽柴秀吉', 'Hashiba Hideyoshi'], ['羽柴秀次', 'Hashiba Hidetsugu'], ['羽柴秀長', 'Hashiba Hidenaga'],
  ['筒井定次', 'Tsutsui Sadatsugu'], ['堀秀政', 'Hori Hidemasa'], ['長谷川秀一', 'Hasegawa Hidekazu'],
  ['大谷左大仁', 'Otani Sadaijin'], ['杉坊の頭', 'Head of the Suginobo'], ['雑賀の侍大将', 'Saika captain'],

  // 千石堀城：時・場・説明
  ['天正十三年三月二十一日　春・夕', 'April 1585. Evening, spring'],
  ['和泉国 千石堀城　三月二十一日', 'Sengokubori Castle, Izumi. 21st day, 3rd month'],
  ['根来寺へ向かう二日前。十万の羽柴勢が紀州へ入った。根来衆の主力が千石堀城で待つ。北の土橋から寄せ、本丸まで攻め入れ。',
    'Two days before the march on Negoro Temple. A Hashiba army of 100,000 has entered Kishu. The main Negoro force waits at Sengokubori Castle. Attack from the earth bridge in the north and fight your way into the keep.'],
  ['天正十三年（1585）三月、羽柴秀吉はおよそ十万で紀州へ向かい、和泉の根来・雑賀方の城を同じ日に攻めた。三月二十一日、千石堀城では羽柴秀次・筒井定次らが寄せ、城の鉄砲で寄せ手にも大きな損害が出た。火矢の火が煙硝蔵に入って城は焼け落ち、城の者はほとんど討たれたと伝わる。積善寺城・畠中城もこの前後に開け渡しや自焼で落ちた。担ぎ手を守る手順や段の分け方は遊びの補い。',
    'In the 3rd month of 1585, Hashiba Hideyoshi marched on Kishu with about 100,000 men and attacked the Negoro and Saika castles in Izumi on the same day. On the 21st, Hashiba Hidetsugu, Tsutsui Sadatsugu and others stormed Sengokubori Castle, and the castle\'s guns cost the attackers dearly. A fire arrow reached the powder store, the castle burned down, and it is said almost everyone inside was killed. Shakuzenji and Hatanaka castles also fell around this time, by surrender or by being burned by their own men. Guarding the carriers and the way the battle is split into stages are added for the game.'],

  // 千石堀城：任務・ピン
  ['先手の竹束まで進み、根来の前衛を退けよ', 'Reach the bamboo shields at the front and drive back the Negoro vanguard'],
  ['外の木柵で、丸太と梯子の組を守れ', 'At the outer fence, guard the log and ladder teams'],
  ['土橋を渡り、虎口の門を破れ', 'Cross the earth bridge and break the gate'],
  ['二の丸で根来衆と戦え。燃える小屋に寄るな', 'Fight the Negoro monks in the second bailey. Stay away from burning huts'],
  ['本丸へ渡り、最後の根来衆を討て', 'Cross into the keep and defeat the last Negoro monks'],
  ['先手の竹束', 'Bamboo shields'], ['土橋の木戸', 'Bridge gate'], ['虎口の門', 'Castle gate'],
  ['二の丸', 'Second bailey'], ['本丸', 'Keep'],
  ['煙硝蔵、炎上', 'The powder store is on fire'], ['千石堀城の本丸が崩れる', 'The keep of Sengokubori Castle collapses'],
  ['千石堀城の本丸まで攻め入った', 'You fought your way into the keep of Sengokubori Castle'],

  // 太田城：時・場・説明
  ['天正十三年四月　春・晴', 'May 1585. Clear, spring'],
  ['紀伊国 太田城　三月末〜四月', 'Ota Castle, Kii. Late 3rd to 4th month'],
  ['根来寺の後、雑賀衆は太田城へ籠もった。羽柴勢は城を力で攻めず、堤で囲んで水を入れる。築堤を守り、水で囲み、開城の使者を迎えよ。',
    'After Negoro Temple, the Saika gunners shut themselves in Ota Castle. The Hashiba army will not storm it. It will ring the castle with a dike and flood it. Guard the dike builders, surround the castle with water, and receive the envoy of surrender.'],
  ['根来寺の後、雑賀の衆は太田城に籠もった。秀吉は城を囲む堤を築かせ、紀の川の水を引き入れて水攻めにした。堤は全長およそ五〜七キロメートルと復元される。城方の打ち出しや、堤の一部が崩れた伝えもある。四月二十二日に城は開け渡され、紀州の戦は収まった。築堤の護衛や堰の守り、崩れ目の守りの段は遊びの補い。',
    'After Negoro Temple, the Saika men shut themselves in Ota Castle. Hideyoshi had a dike built around the castle and let in water from the Kino River to flood it. The dike is thought to have been about 5 to 7 km long. There are also accounts of sorties from the castle and of part of the dike giving way. On the 22nd day of the 4th month the castle surrendered, and the fighting in Kishu ended. Guarding the dike builders, the sluice and the breach are stages added for the game.'],

  // 太田城：任務・ピン・幕
  ['築堤の場へ行き、土を運ぶ人夫を守れ', 'Go to the dike works and guard the laborers carrying earth'],
  ['出水の堤で、打って出る雑賀衆から人夫を守れ', 'At the Demizu dike, guard the laborers from the Saika sortie'],
  ['出水の堰を開き、小舟の雑賀衆から守れ', 'Open the Demizu sluice and hold it against the Saika boats'],
  ['崩れた東の堤を、人夫が塞ぐまで守れ', 'Hold the broken east dike until the laborers seal it'],
  ['北の土橋で、開城の使者を迎えよ', 'Receive the envoy of surrender at the north earth bridge'],
  ['出水の堤', 'Demizu dike'], ['出水の堰', 'Demizu sluice'], ['東の堤', 'East dike'], ['北の土橋', 'North earth bridge'],
  ['堤が崩れた', 'The dike has broken'], ['東の堤から水があふれる', 'Water pours out of the east dike'],
  ['太田城、開城', 'Ota Castle surrenders'], ['水に囲まれた城が門を開く', 'The flooded castle opens its gates'],
  ['太田城の開城を迎えた', 'You received the surrender of Ota Castle'],

  // 11/21 07:40 英の描かずの拾いで残っていた字（幕の全角の間・討死の札・ピン・段の番号つきの任務）
  ['千石堀城　炎上', 'Sengokubori Castle burns'], ['太田城　開城', 'Ota Castle surrenders'],
  ['根来の前衛', 'Negoro vanguard'], ['開城の使者', 'Envoy of surrender'],
  // 行き先の▼の名（goals5.js goalNoun が『崩れた東の堤を、人夫が塞ぐまで守れ』から切り出す字。11/21 10:30 英の描かずの拾い 太田 310秒）
  ['人夫が塞ぐ', 'East dike'],
  ['大谷左大仁 討ち取ったり', 'Otani Sadaijin is slain'], ['大谷左大仁 討ち死に', 'Otani Sadaijin has fallen'], ['大谷左大仁　討死', 'Otani Sadaijin has fallen'],

  // 右上の道のりと残り（数を含む）
  [/^竹束まで あと(\d+)m$/, (m) => `Bamboo shields: ${m[1]}m`],
  [/^根来の前衛 あと(\d+)人$/, (m) => `Negoro vanguard left: ${m[1]}`],
  [/^二の丸まで あと(\d+)m$/, (m) => `Second bailey: ${m[1]}m`],
  [/^二の丸の根来衆 あと(\d+)人$/, (m) => `Negoro monks in the bailey: ${m[1]}`],
  [/^本丸まで あと(\d+)m$/, (m) => `Keep: ${m[1]}m`],
  [/^本丸の根来衆 あと(\d+)人$/, (m) => `Negoro monks in the keep: ${m[1]}`],
  // 行き先の▼の字の札（.gs-tag・任務の一行の「〜を」の前）。en_left_probe 340秒で残っていた（11/21 21時 クラウド 紀州の持ち主）
  ["丸太と梯子の組", "Log and ladder teams"], ["最後の根来衆", "The last Negoro monks"],
];
// 段の番号つきの任務（始まりの札『1　先手の竹束まで…』）。段の順に番号を付けて足す（正規表現にすると共通の形を塞ぐので字で）
const E = new Map(T.filter(([j]) => typeof j === 'string'));
[['先手の竹束まで進み、根来の前衛を退けよ', '外の木柵で、丸太と梯子の組を守れ', '土橋を渡り、虎口の門を破れ', '二の丸で根来衆と戦え。燃える小屋に寄るな', '本丸へ渡り、最後の根来衆を討て'],
 ['築堤の場へ行き、土を運ぶ人夫を守れ', '出水の堤で、打って出る雑賀衆から人夫を守れ', '出水の堰を開き、小舟の雑賀衆から守れ', '崩れた東の堤を、人夫が塞ぐまで守れ', '北の土橋で、開城の使者を迎えよ']]
  .forEach((list) => list.forEach((g, i) => { if (E.has(g)) T.push([`${i + 1}\u3000${g}`, `${i + 1}  ${E.get(g)}`]); }));
export default T;
