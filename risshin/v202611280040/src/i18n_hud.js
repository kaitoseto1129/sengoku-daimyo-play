// K516 英語版：戦の中の共通の画面（命の棒・息・武器の釦・両軍の人数・右上の任務の一行・小さな地図・任務の一覧）の字。
//   英語の時だけ i18n.js から読む（日本語の時は読まない・重さ0）。クラウド k365-cloud-15 11/21。
//   ?lang=en で天王寺砦・桶狭間・関ヶ原・戸次川を開き #hud に日本語のまま残った字から、全戦に出る物だけを入れた。
//   戦ごとの任務の字そのもの（「戸次川の浅瀬を渡れ」など）は各戦の i18n_<戦>.js が受け持つ。ここは頭に付く「今：」などの形で、その表を引く。
const WORDS = [
  ['行軍の列', 'Marching column'],   // K516 共通：march_open.js の道の始めの味方の列の名（11/28 クラウド sune の持ち主：?lang=en の通しで10秒に残った）
  ['攻撃が来た方', 'Direction of the attack'], ['自分の残りの命', 'Your remaining life'], ['息', 'Stamina'], ['槍', 'Spear'], ['刀', 'Sword'], ['鉄砲', 'Gun'], ['弓', 'Bow'],
  ['目標。押すと合戦の進行を開く', 'Goal. Tap to open the battle progress'], ['小さな地図。押すと大きな地図を開く', 'Mini map. Tap to open the big map'],
  ['武器を持ち替える', 'Change weapon'], ['やりに持ち替える', 'Switch to spear'], ['刀に持ち替える', 'Switch to sword'], ['鉄砲に持ち替える', 'Switch to gun'], ['弓に持ち替える', 'Switch to bow'],
  ['戦の下知', 'Battle orders'], ['この札を閉じ、戦場で動き始める。移動釦でも始められます。', 'Close this card and start moving. You can also start with the move button.'],
  ['大きな地図を開く', 'Open the big map'], ['目標', 'Goal'], ['目標を開く', 'Show goals'], ['目標を閉じる', 'Hide goals'], ['火付けの進み具合', 'Fire-setting progress'],
  ['朝', 'Morning'], ['昼', 'Noon'], ['夕刻', 'Evening'], ['夜', 'Night'], ['夜明け', 'Dawn'], ['霧', 'Fog'], ['雨', 'Rain'], ['雪', 'Snow'], ['晴れ', 'Clear'], ['曇り', 'Cloudy'],
  ['東軍', 'Eastern army'], ['西軍', 'Western army'],
  // 始まりの札の「目当て」（battle_opening.js・全戦の共通の表）
  ['隊長に続いて林勢を押し返し、名塚砦で味方と向き直って柴田勢を押し返す', 'Follow your captain and push back the Hayashi force, then turn at Nazuka Fort and push back the Shibata force'],
  ['雨の谷を下り、坂道の松井宗信の先手を破って、桶狭間山の今川義元（いまがわ よしもと）を討つ', 'Go down the rainy valley, break Matsui Munenobu\'s vanguard on the slope, and strike Imagawa Yoshimoto on Okehazama hill'],
  ['楡俣川を渡り、森部の野で長井甲斐守・日比野下野守の槍列を受け止め、墨俣へ退く殿を討ち破る', 'Cross the Niremata River, hold the spear lines of Nagai and Hibino on the Moribe field, and break the rear guard falling back to Sunomata'],
  ['岸の舟着きから南門まで材木の人足を守り、北と西の柵で寄せ手を退け、柵の修理と点検を守り抜く', 'Guard the lumber porters from the landing to the south gate, drive off attackers at the north and west fences, and protect the fence repairs'],
  ['火の合図を出し、味方と城へ進む', 'Give the fire signal and advance on the castle with your allies'],
  ['川前で磯野勢を止め、北岸の殿を追う', 'Stop the Isono force at the river and chase the rear guard on the north bank'],
  ['堤の井楼から砦へ撃ち込み、下知に従って味方と退く', 'Fire into the fort from the tower on the bank, then fall back with your allies when ordered'],
  ['町口で先手を押し返し、宇佐山城の本丸を守り抜く', 'Push back the vanguard at the town entrance and hold the main keep of Usayama Castle'],
  ['組と山道を登り、道の守りを退ける', 'Climb the mountain path with your squad and drive off its guards'],
  ['平手の槍の持ち場で武田の寄せを受け、退けの下知で浜松城の口へ退く', 'Meet the Takeda attack at Hirate\'s spear post, then fall back to Hamamatsu Castle when ordered'],
  ['刀根坂で朝倉の殿を突き破り、一乗谷まで追う', 'Break the Asakura rear guard at Tonezaka and chase it to Ichijōdani'],
  ['柵で寄せを止め、馬場の殿を討ち破る', 'Stop the attack at the fences and break Baba\'s rear guard'],
  ['味方と木戸を開き、観音丸城の中を押さえる', 'Open the gate with your allies and take Kannonmaru Castle'],
  ['味方と門を破り、本堂を焼き、奥の院まで狩り出す', 'Break the gate with your allies, burn the main hall, and hunt them out to the inner temple'],
  ['水晶山の柵で夜討ちを防ぎ、城の麓の搦手道まで追う', 'Stop the night raid at the Suishōyama fences and chase them to the back road below the castle'],
  ['砦を守り、救援と共に囲みを破る', 'Hold the fort, then break the siege with the relief army'],
  ['味方の渡河を守り、南の岸へ退く', 'Guard your allies as they cross, then fall back to the south bank'],
  ['木戸を破り、本丸の南口へ攻め入る', 'Break the gate and storm the south entrance of the main keep'],
  ['船を守り、合図で大筒を放つ', 'Guard the ships and fire the cannon on the signal'],
  ['荷を止め、平田の木戸を守り、大村坂で別所勢を討つ', 'Stop the supplies, hold the Hirata gate, and defeat the Bessho force at Ōmurazaka'],
  ['侍町の辻を取り、寄せ返す荒木勢から守る', 'Take the crossroads in the samurai quarter and hold it against the Araki counterattack'],
  ['夜討ちを防ぎ、最後に空いた城を確かめる', 'Stop the night raid, then check the empty castle at the end'],
  ['舟二艘を焼き、柵を守り、使いを木戸へ送る', 'Burn two boats, hold the fence, and get the messenger to the gate'],
  ['打って出た城兵を受け、退く城兵に続いて大手門へ', 'Meet the castle troops who sally out, then follow them back to the main gate'],
  ['味方と敵を退け、屋敷の奥へ進む', 'Drive off the enemy with your allies and push deep into the residence'],
  ['上様を守り、退く命令が出たら逃れる', 'Protect your lord, and escape when the order to fall back comes'],
  // 始まりの札の「所」の一行（battle_welcome.js・全戦の共通の表）
  ['稲生の野', 'Inō field'], ['川の東に広がる野。両軍の兵がぶつかる。', 'A field east of the river. The two armies clash here.'],
  ['桶狭間', 'Okehazama'], ['丘が連なる土地。今川の本陣を攻める。', 'Rolling hills. Attack the Imagawa headquarters.'],
  ['森部（もりべ）の野', 'Moribe field'], ['川沿いの野。美濃（みの）の国の兵と戦う。', 'A field by the river. Fight the soldiers of Mino.'],
  ['金ヶ崎', 'Kanegasaki'], ['海に突き出た山城。退く軍の背後を守る。', 'A mountain castle on a cape. Guard the back of the retreating army.'],
  ['姉川', 'Anegawa'], ['川の両岸に広がる野。浅井・朝倉と戦う。', 'Fields on both banks. Fight the Azai and Asakura.'],
  ['比叡山', 'Mount Hiei'], ['山の上に堂が連なる寺。山道が攻め口。', 'A temple of many halls on the mountain. The paths are the way in.'],
  ['三方ヶ原', 'Mikatagahara'], ['浜松の北に広がる台地。武田の軍を迎える。', 'A plateau north of Hamamatsu. Meet the Takeda army.'],
  ['刀根坂', 'Tonezaka'], ['越前へ続く峠道。退く朝倉の軍を追う。', 'A pass road to Echizen. Chase the retreating Asakura army.'],
  ['設楽原', 'Shitaragahara'], ['連吾川沿いの野。柵と鉄砲で敵を迎える。', 'A field by the Rengo River. Meet the enemy with fences and guns.'],
  ['木ノ芽峠', 'Kinome Pass'], ['越前へ通じる峠。尾根の砦が道を守る。', 'A pass into Echizen. Ridge forts guard the road.'],
  ['大滝寺', 'Ōtaki-ji'], ['山あいの寺。越前の一向一揆を攻める。', 'A temple in the hills. Attack the Ikkō uprising of Echizen.'],
  ['天王寺の砦', 'Tennōji Fort'], ['本願寺の南の砦。囲みを破る道が要。', 'A fort south of the Hongan-ji. The road out of the siege is the key.'],
  ['手取川', 'Tedorigawa'], ['加賀の野を流れる暴れ川。雨で増えた川を背に、南へ退く。', 'A wild river across Kaga. With the flooded river behind you, fall back south.'],
  ['木津川口', 'Kizugawaguchi'], ['河口の沖の海。船で本願寺への道を断つ。', 'The sea off the river mouth. Cut the Hongan-ji supply route by ship.'],
  ['田野', 'Tano'], ['天目山のふもとの谷。武田の軍を追う。', 'A valley below Mount Tenmoku. Chase the Takeda army.'],
  ['本能寺', 'Honnō-ji'], ['京の町なかの寺。明智の軍が周りを囲む。', 'A temple in Kyoto. The Akechi army surrounds it.'],
  ['稲葉山城', 'Inabayama Castle'], ['急な山の上の城。坂道が攻め口になる。', 'A castle on a steep mountain. The slope road is the way in.'],
  ['墨俣の砦', 'Sunomata Fort'], ['川の岸の砦。舟で荷を運び込む。', 'A fort on the riverbank. Supplies come in by boat.'],
  ['箕作城', 'Mitsukuri Castle'], ['比高二百十メートルの山城。急な一筋道と石垣の虎口で上る。', 'A mountain castle 210 m high. Climb one steep path to stone-walled gates.'],
  ['野田・福島の砦', 'Noda and Fukushima forts'], ['川と堀に囲まれた砦。水辺の道が攻め口になる。', 'Forts ringed by rivers and moats. The waterside roads are the way in.'],
  ['宇佐山城', 'Usayama Castle'], ['山の上から、麓へ続く道を見張る城。', 'A hilltop castle watching the road below.'],
  ['大河内城', 'Ōkawachi Castle'], ['坂の攻め口を持つ城。退く時も道の守りが要る。', 'A castle reached by slopes. Guard the road even when falling back.'],
  ['長島の輪中', 'Nagashima islands'], ['三つの大河が海へ注ぐ所の島々。細い堤と舟で、一つずつ渡っていく。', 'Islands where three great rivers meet the sea. Cross one by one on thin banks and boats.'],
  ['長篠城', 'Nagashino Castle'], ['川に挟まれた城。門と塀で敵を防ぐ。', 'A castle between two rivers. Hold the enemy with gates and walls.'],
  ['岩村城', 'Iwamura Castle'], ['霧の多い東美濃の山城。東の水晶山に織田の陣が向く。', 'A misty mountain castle in east Mino. The Oda camp faces it from Suishōyama.'],
  ['信貴山城', 'Shigisan Castle'], ['山の上の城。坂を上って攻める。', 'A mountain castle. Attack up the slope.'],
  ['三木城', 'Miki Castle'], ['城の周りの小さな砦と、食べ物を運ぶ道が戦の要。', 'The small forts around it and the food road are the key.'],
  ['有岡城', 'Arioka Castle'], ['町も守りに取り込んだ城。堀と門が行く手をふさぐ。', 'A castle that walls in its town. Moats and gates block the way.'],
  ['鳥取城', 'Tottori Castle'], ['山の城を囲み、米を運ぶ舟を止める。', 'Surround the mountain castle and stop the rice boats.'],
  ['比自山城', 'Hijiyama Castle'], ['山道の先に守りを重ねた城。狭い攻め口に注意。', 'A castle with layered defenses up a mountain path. Mind the narrow entrances.'],
  ['諏訪原城', 'Suwahara Castle'], ['堀と土の壁で守る城。門への道を確かめよう。', 'A castle of moats and earthen walls. Find the road to the gate.'],
  ['真田丸', 'Sanada-maru'], ['大坂城の外に設けた守り。堀と柵で敵を迎える。', 'An outwork outside Osaka Castle. Meet the enemy with moats and fences.'],
  ['山の斜面に区画を重ねた城。坂道を守りに使う。', 'A castle of terraces on a hillside. The slopes are its defense.'],
  ['平地の城。堀と塀で敵を防ぐ。', 'A castle on flat land. Moats and walls hold the enemy.'], ['土の壁と柵で守る、小さな城。', 'A small castle of earthen walls and fences.'],
  // 一時停止の画面（screens.js pauseMenu）。11/27 cloud-05：オンラインの英語の通しで日本語のまま残った字
  ['再開する', 'Resume'], ['操作の一覧を見る', 'View controls'], ['不具合を送る', 'Report a bug'], ['感想を送る', 'Send feedback'],
  ['戦場の地図（味方は青、敵は朱）', 'Battlefield map (allies blue, enemies red)'], ['済み', 'Done'], ['大事な警告の記録を見る', 'View important warnings'],
  ['止めたまま会話の記録を読む', 'Read the message log while paused'], ['通常の会話は直近40件。下知と伝令は戦の終わりまで残ります。', 'The last 40 messages are kept. Orders and reports stay until the battle ends.'],
  ['不具合の記録', 'Error log'], ['不具合が起きていました。作り手に伝えるときは、この内容を写してください。', 'An error occurred. Copy this text when you report it.'], ['不具合の内容を写す', 'Copy the error details'],
];
const PATS = [
  [/^命 あと(\d+)％$/, (m) => `Life ${m[1]}%`],
  [/^体力 残り(\d+)パーセント$/, (m) => `Health ${m[1]} percent left`],
  [/^疲れの棒 残り(\d+)パーセント$/, (m) => `Stamina ${m[1]} percent left`],
  [/^任務の一覧を開く。残り (\d+)件・済 (\d+)件・失敗 (\d+)件$/, (m) => `Open the task list. ${m[1]} left, ${m[2]} done, ${m[3]} failed`],
  [/^（(\d+)件）$/, (m) => `(${m[1]})`],
  [/^手順 あと(\d+)件$/, (m) => `${m[1]} steps left`],
  [/^(\d+)段のうち(\d+)段目・(\d+)パーセント$/, (m) => `Stage ${m[2]} of ${m[1]} · ${m[3]} percent`],
  [/^旗まで([\d,]+)m$/, (m) => `${m[1]}m to the flag`],
  [/^(.+)まで([\d,]+)m$/, (m, tr) => { const e = tr(m[1]); return e === m[1] ? undefined : `${m[2]}m to ${e}`; }],
  [/^今：(.+)$/, (m, tr) => { const e = tr(m[1]); return e === m[1] ? undefined : `Now: ${e}`; }],
  [/^目当て：(.+)$/, (m, tr) => { const e = tr(m[1]); return e === m[1] ? undefined : `Aim: ${e}`; }],
  [/^(東軍|西軍|味方|敵)[　 ]+([\d,]+)人$/, (m, tr) => `${tr(m[1])} ${m[2]}`],
  // 「所：様子」の一行（battle_welcome.js）。両方が表にある時だけ
  [/^([^：]+)：(.+)$/, (m, tr) => { const a = tr(m[1]), b = tr(m[2]); return a === m[1] || b === m[2] ? undefined : `${a}: ${b}`; }],
  // 和暦の日付（「慶長五年（1600）九月十五日」「天正十四年十二月十二日」）
  [/^(天文|弘治|永禄|元亀|天正|文禄|慶長|元和)([元一二三四五六七八九十]+)年(?:（(\d+)）)?(?:([一二三四五六七八九十]+)月)?(?:([一二三四五六七八九十]+)日)?$/, (m) => {
    const ERA = { 天文: 'Tenbun', 弘治: 'Kōji', 永禄: 'Eiroku', 元亀: 'Genki', 天正: 'Tenshō', 文禄: 'Bunroku', 慶長: 'Keichō', 元和: 'Genna' };
    const n = (k) => { if (!k) return 0; if (k === '元') return 1; const D = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }; let v = 0; const i = k.indexOf('十'); if (i < 0) return D[k] || 0; v = (i === 0 ? 1 : D[k[0]]) * 10; return v + (D[k[i + 1]] || 0); };
    const mo = n(m[4]), d = n(m[5]);
    return `${ERA[m[1]]} ${n(m[2])}${m[3] ? ` (${m[3]})` : ''}${mo ? `, month ${mo}` : ''}${d ? `, day ${d}` : ''}`;
  }],
  [/^(.+)・(.+)$/, (m, tr) => { const a = tr(m[1]), b = tr(m[2]); return a === m[1] || b === m[2] ? undefined : `${a}, ${b}`; }],   // 朝・霧 など（両方が表にある時だけ）
];
export default [...WORDS, ...PATS];
