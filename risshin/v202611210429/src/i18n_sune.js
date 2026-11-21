// K516 英語版：鳥居強右衛門の脱出（長篠編 二戦目 sune）の画面に出る字（任務の一行・副任務・ピンの名・組の名・物語の札・結果の札・数の入る字）。
//   英語の時だけ b_sune.js から読む（日本語の時は読まない・重さ0）。台詞（rt.say）は戦では字幕を出さないので入れない（長篠城の表と同じ決まり）。
//   名は人の名をローマ字で、組は短い英語で。クラウド46 11/21。
const MOR = { 意気盛ん: 'high spirits', 平常: 'steady', 動揺: 'shaken', 崩れかけ: 'breaking' };
const mo = (w) => MOR[w] || w;
export default [
  // 人・組
  ['鳥居強右衛門', 'Torii Suneemon'], ['武田勝頼', 'Takeda Katsuyori'], ['供の足軽', 'Escort ashigaru'], ['足軽', 'Ashigaru'],
  ['鳴子の番', 'Clapper-line guard'], ['番兵', 'Guard'], ['見張り', 'Sentry'], ['武田の見張り', 'Takeda sentries'],
  ['武田の見回り', 'Takeda patrol'], ['武田の徒の追っ手', 'Takeda foot pursuers'], ['武田の侍の三の手', 'Takeda samurai, third wave'],
  ['徳川の物見', 'Tokugawa scouts'], ['徳川の物見の鉄砲', 'Tokugawa scout gunners'], ['徳川方・奥平勢', 'Tokugawa side (Okudaira force)'], ['武田軍', 'Takeda army'],
  // 任務（右上の一行）と副任務
  ['強右衛門を守り、川を下って武田の囲みを抜けよ', 'Guard Suneemon and go down the river through the Takeda lines'],
  ['見張りに見つからずに抜けよ', 'Slip through without being spotted'],
  ['川を下り、武田の囲みの外れの岸へ上がる', 'Go down the river and land on the bank beyond the Takeda lines'],
  ['豊川の流れを下り、武田の陣の外れへ', 'Down the Toyokawa to the edge of the Takeda camp'],
  ['南の雁峰山の頂に登り、城へ知らせる狼煙を上げる', 'Climb Mt. Ganpo to the south and light the signal fire for the castle'],
  ['武田の見回りを退け、強右衛門を西へ送り出せ', 'Drive off the Takeda patrol and send Suneemon west'],
  ['追っ手を退けよ', 'Drive off the pursuers'], ['鳴子の縄を切る（音を立てずに）', 'Cut the clapper rope (quietly)'],
  ['副任務：見つからずに抜けた', 'Side mission: passed unseen'], ['見つからずに抜けた', 'Passed unseen'],
  // ピン・札
  ['鳴子の縄', 'Clapper rope'], ['岸へ上がる所', 'Landing point'], ['雁峰山の頂（狼煙）', 'Mt. Ganpo summit (signal fire)'],
  ['狼煙を上げる', 'Light the signal fire'], ['一斉射', 'Volley'], ['川を下りはじめる', 'Heading down the river'],
  ['見つかった', 'Spotted'], ['見つかりそう！', 'Almost spotted!'], ['見張りが怪しんでいる', 'The sentry is suspicious'], ['気づかれていない', 'Unnoticed'],
  ['見回りが逃げていく！　今じゃ！', 'The patrol is fleeing! Now!'], ['見回りが逃げていく！', 'The patrol is fleeing!'],
  // 出来事・結果
  ['囲みを抜けた', 'Broke through the encirclement'], ['武田の囲みを抜けた', 'Passed the Takeda lines'],
  ['狼煙は城へ届いた', 'The signal fire reached the castle'], ['狼煙が上がった', 'The signal fire is lit'], ['狼煙を上げた', 'Signal fire lit'],
  ['強右衛門を送り出した', 'Suneemon sent off'], ['強右衛門、岡崎へ', 'Suneemon to Okazaki'], ['朝の道を、ひとり駆けていった', 'He ran alone down the morning road'],
  ['強右衛門が討たれた', 'Suneemon was killed'], ['囲みの中で、武田の兵に討たれた', 'Cut down by Takeda troops inside the lines'],
  ['城の供の足軽が、川を下って追いついた！', 'An escort ashigaru from the castle caught up down the river!'],
  ['からからから……！　鳴子が鳴った', 'Clatter-clatter! A clapper rang'], ['鳴子の縄に掛かった', 'Caught on a clapper rope'],
  ['中腹の見回りの松明に照らされた', 'Lit by the patrol torches on the slope'], ['鳴子の番に見つかった', 'Spotted by the clapper-line guard'],
  ['見張りの松明に照らされた', 'Lit by the sentry torches'], ['見張りに斬りかかった', 'Attacked a sentry'],
  ['鳴子の縄を切った。鳴子は音もなく流れに沈んだ', 'You cut the rope. The clappers sank soundlessly into the current'],
  ['東の空が白みはじめた。急げ', 'The eastern sky is paling. Hurry'], ['東の空が白みはじめた。頂はもうすぐ', 'The eastern sky is paling. The summit is near'],
  ['夜が白む。長篠城から、かすかに鬨の声', 'Dawn breaks. A faint war cry from Nagashino Castle'],
  // 日時・物語
  ['天正三年五月十五日とも　夏・夜明け', 'May 15, 1575 (some say) — summer, dawn'], ['天正三年五月十四日とも　夏・夜', 'May 14, 1575 (some say) — summer, night'],
  ['――使いは岡崎へ届かなかった。城は、別の者を出すことになる', 'The messenger never reached Okazaki. The castle will have to send someone else'],
  ['天正三年五月十四日の夜、長篠城の足軽・鳥居強右衛門は城を抜け出し、川に潜って武田の囲みをくぐったと伝わる。武田方は川に縄を張り、鳴子を下げて見張っていたが、強右衛門はそれを切って下ったという。翌朝、雁峰山で狼煙を上げて脱出を城に知らせ、その日のうちに岡崎へ走って家康と信長に後詰を願った。城へ戻る途中で捕らえられ、「援軍は来ない」と告げるよう命じられたが、「援軍はすぐに来る」と叫んで磔にされた。日付や最期の細部には異なる伝えがあり、この戦の日付・道筋は伝承をもとにした復元である。晴れだったと確定はしない。この戦に出てくる供の足軽は、遊びのための人物である。',
    'On the night of May 14, 1575, Torii Suneemon, a foot soldier of Nagashino Castle, is said to have slipped out and dived into the river to pass under the Takeda lines. The Takeda had strung ropes across the river with clappers hung from them, but Suneemon is said to have cut them as he went down. The next morning he lit a signal fire on Mt. Ganpo to tell the castle he had escaped, then ran to Okazaki that same day to beg Ieyasu and Nobunaga for relief. Caught on his way back, he was ordered to cry out that no help was coming; instead he shouted that help would arrive soon, and was crucified. Accounts differ on the dates and on the details of his death, so the dates and route in this battle are a reconstruction from tradition. We cannot be sure the weather was clear. The escort ashigaru in this battle is a character made for play.'],
  // 数・形の入る字
  [/^番兵・(.+)$/, (m) => `Guard — ${mo(m[1])}`], [/^武田の見回り・(.+)$/, (m) => `Takeda patrol — ${mo(m[1])}`],
  [/^武田の侍・(.+)$/, (m) => `Takeda samurai — ${mo(m[1])}`], [/^武田の徒の追っ手・(.+)$/, (m) => `Takeda foot pursuers — ${mo(m[1])}`],
  [/^見回り (\d+)人$/, (m) => `Patrol ${m[1]}`], [/^頂まで (\d+)歩$/, (m) => `${m[1]} steps to the summit`],
  [/^(鳴子の縄の先・)?岸へ上がる所まで (\d+)歩$/, (m) => `${m[1] ? 'Past the clapper rope · ' : ''}${m[2]} steps to the landing`],
];
