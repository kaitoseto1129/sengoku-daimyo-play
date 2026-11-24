// K516 英語版の土台（kaito 11/20「全部英語にもして、アメリカ向けにも」・クラウドか 11/21）。
//   日本語の字はそのまま書き、画面に出た字を英語の表で置き換える（呼ぶ所を一つずつ直さずに全部の画面に効く）。
//   ・言語：?lang=en / ?lang=ja ＞ 保存した選び（localStorage risshin_lang）＞ 端末の言語（AUTO が true の時だけ）。
//   ・日本語の時は何もしない（見張りも置かない・重さ0）。
//   ・英語の時は #screen・#hud・#pause などの字と aria-label・title・placeholder を、
//     字が変わった時だけ表で引く（同じ字は覚えて二度引かない）。表に無い字は日本語のまま残す（訳の係が EN に足す）。
//   ・AUTO は K576 の四つの関門（check・全64戦の描かずの通し・iPhone/iPad 実機の動画・落ち0）が揃うまで false。
//     揃うまでは ?lang=en か localStorage で選んだ人だけが英語になる。
import { EN_TOYOTOMI } from './i18n_en_toyotomi.js';
import { EN_JINCHU } from './i18n_en_jinchu.js';   // 陣中の場面（織田編・徳川編の陣）の訳（K516・山中城の持ち主 11/21）
import { EN_RANKUP } from './i18n_en_rankup.js';   // 昇進の場面・戦の後の身分の札の訳（K516・手取川の持ち主 11/21）
export const AUTO = false;
import { STORY_EN, STORY_PAT } from './i18n_story.js';
const KEY = 'risshin_lang';

function pick() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'ja') { try { localStorage.setItem(KEY, q); } catch (e) {} return q; }
  } catch (e) {}
  try { const s = localStorage.getItem(KEY); if (s === 'en' || s === 'ja') return s; } catch (e) {}
  if (!AUTO) return 'ja';
  try {
    const langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'ja'];
    return String(langs[0] || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  } catch (e) { return 'ja'; }
}

export const LANG = typeof location === 'undefined' ? 'ja' : pick();
export const isEn = () => LANG === 'en';
export function setLang(l) { try { localStorage.setItem(KEY, l === 'en' ? 'en' : 'ja'); } catch (e) {} }

// 字そのままの表（前後の空白を除いた字で引く）。足す時は一行ずつ。英語はやさしく短く。
const EN = new Map([
  // 題・はじめ
  ['戦国立身', 'Sengoku Risshin '], ['戦国立身3D', 'Sengoku Risshin 3D'],
  ['鉄砲　構えている…', 'Gun: aiming…'], ['火蓋を切る…', 'Opening the pan…'], ['火縄や火薬が湿っている。雨を避けて扱う', 'Match or powder is damp. Keep it out of the rain'],
  ['弾がない。倒れた鉄砲足軽から拾う', 'No ammo. Take some from a fallen gunner'], ['矢が尽きた。槍に持ち替える', 'Out of arrows. Switch to the spear'],
  ['弓　矢を番える', 'Bow: nocking'], ['弓　引き絞る', 'Bow: drawing'], ['弓　射る', 'Bow: loose'], ['弓　攻撃を一度押すと射る', 'Bow: press attack once to shoot'],
  ['敵の本陣へ攻め寄せる', 'Push on to the enemy HQ'],
  ['始める', 'Start'], ['新しく始める', 'New game'], ['完全版', 'Full version'],
  ['章を選んで遊ぶ', 'Choose a chapter'], ['戦を選ぶ', 'Choose a battle'], ['記録帳を開く', 'Open records'],
  ['この枠の記録を消す', 'Delete this save'], ['保存の枠', 'Save slots'], ['保存記録', 'Save data'],
  ['天下の地図へ', 'To the map of Japan'], ['日本地図を試す', 'Try the map of Japan'], ['本編を確かめる', 'Check the story'],
  ['筋書きを選ぶ', 'Choose a story'], ['遊ぶ時代を選ぶ', 'Choose an era'], ['織田家編を史実の順で進みます', 'Play the Oda story in historical order'],
  ['あなたの名前', 'Your name'], ['名を決める', 'Set name'], ['決めて次へ進む', 'Decide and go on'], ['ひとつ前へ戻る', 'Go back'],
  ['8字まで。弥五郎（やごろう）は、そのままでも使えます。空でもこの名前になります。', 'Up to 8 letters. You can keep "Yagoro". If empty, this name is used.'],
  ['弥五郎', 'Yagoro'],
  ['難易度を選ぶ', 'Choose difficulty'], ['迷ったら「普通」', 'If unsure, pick "Normal"'],
  ['練習', 'Practice'], ['練習・ほかの戦い', 'Practice and other battles'], ['操作を練習する（稲生）', 'Practice controls (Ino)'],
  ['稲生（いのう）は最初の実戦。移動から一つずつ覚えます。練習だけなら「練習・ほかの戦い」へ。', 'Ino is your first real battle. You learn step by step, starting with moving. For practice only, go to "Practice and other battles".'],
  ['空き枠を押してから、出陣の釦で始めます。', 'Tap an empty slot, then press the sortie button.'],
  ['保存した本編は進みません。', 'Your saved story does not advance.'],
  ['設定', 'Settings'], ['操作', 'Controls'], ['操作のしかた', 'How to play'], ['操作を閉じて題へ戻る', 'Close and return to title'],
  ['手持ち操作器の操作', 'Gamepad controls'],
  ['弓・鉄砲も攻撃を一度押すと放ちます。', 'Bows and guns fire with one press of attack.'],
  ['マウスを動かして見回す。左ボタンで攻撃（やりでつく・刀で切る）。', 'Move the mouse to look. Left button to attack (thrust a spear, slash a sword).'],
  ['鍵盤・手持ち操作器の割り当ては「設定」で確認できます。', 'See key and gamepad bindings in "Settings".'],
  ['説明の続きは、この中を下へ送ると読めます', 'Scroll down to read more'],
  ['エンターで次へ・エスケープで戻る', 'Enter: next / Esc: back'],
  ['戻る', 'Back'], ['やめる', 'Cancel'], ['元に戻せません。', 'This cannot be undone.'], ['タイトルへ', 'To title'],
  // 戦の中の共通の字（持ち替えの釦・止める・戦功・勝ち負けの札。鴫野の英語の通しで残った字・クラウド 11/21）
  ['やり', 'Spear'], ['刀', 'Sword'], ['弓', 'Bow'], ['鉄砲', 'Gun'], ['保存', 'Save'], ['止める', 'Stop'], ['カメラを止める', 'Stop camera'],
  // 始まりの幕の名高い人の一行（battle_welcome.js PEOPLE）と両軍の間の『対』（hud_opening.js。?lang=en の流しで残っていた。クラウド 鳶ヶ巣の持ち主 11/21）
  ['対', 'vs'], ['織田家の大将。', 'Lord of the Oda clan.'], ['尾張の織田家の当主。', 'Head of the Oda clan of Owari.'],
  ['尾張を治め、美濃を攻める織田家の大将。', 'Oda lord who rules Owari and attacks Mino.'], ['京に上り、畿内を従える織田家の大将。', 'Oda lord who entered Kyoto and rules the capital region.'],
  ['信長に仕える織田家の武将。', 'An Oda general serving Nobunaga.'], ['信長亡き後の天下を争う羽柴家の大将。', 'Hashiba lord fighting for the realm after Nobunaga.'],
  ['天下をまとめた関白。', 'The Regent who united the realm.'], ['天下をまとめた太閤。', 'The retired Regent who united the realm.'],
  ['徳川家の大将。', 'Lord of the Tokugawa clan.'], ['三河の松平家の当主。', 'Head of the Matsudaira clan of Mikawa.'],
  ['三河・遠江を治める徳川家の大将。', 'Tokugawa lord who rules Mikawa and Totomi.'], ['関東を治める徳川家の大将。', 'Tokugawa lord who rules the Kanto.'],
  ['江戸に幕府を開いた将軍。', 'The Shogun who opened the Edo shogunate.'], ['将軍職を譲った大御所。', 'The retired Shogun.'],
  ['甲斐の武田家の大将。', 'Lord of the Takeda clan of Kai.'], ['越後の上杉家の大将。', 'Lord of the Uesugi clan of Echigo.'],
  ['戦功', 'Merit'], ['戦の最中', 'In battle'], ['戦の終わり', 'Battle over'], ['合戦に勝利', 'Victory'], ['務めを果たした', 'Duty done'], ['生きて戦を終えた', 'Survived the battle'], ['勝利', 'Victory'], ['敗北', 'Defeat'], ['敵を退けた', 'Enemy driven off'],
  // 負けた時の札（battle_retry.js・全戦共通。sune の ?lang=en の流しで釦が日本語のまま残った・クラウド sune 11/21）
  ['直前から再開', 'Retry from just before'], ['戦の最初から', 'Restart the battle'], ['結果を見る', 'See the result'],
  ['援護を強くする', 'Get more support'], ['このまま戦う', 'Keep fighting'], ['この局面を易しくする', 'Make this part easier'],
  ['討死', 'Killed in battle'], ['負傷', 'Wounded'], ['戦に負けた', 'Battle lost'], ['前回まで', 'Before'], ['現在', 'Now'],
  // 保存
  ['保存文字列', 'Save code'], ['保存文字列を全部選ぶ', 'Select all of the save code'], ['保存文字列を写す', 'Copy save code'],
  ['保存文字列を書き出す', 'Export save code'], ['保存文字列・保存文書から再開', 'Resume from a save code or file'],
  ['保存文書を持ち出す', 'Export save file'], ['保存文書を選ぶ', 'Choose save file'], ['この保存で再開', 'Resume from this save'],
  ['保存がある時に書き出せます', 'You can export when you have a save'],
  ['保存文字列を写しました', 'Save code copied'], ['前の控えから記録を読み直しました。', 'Loaded your record from the last backup.'],
  ['保存文字列を貼るか、持ち出した保存文書を選んでください。', 'Paste a save code, or choose an exported save file.'],
  ['この文字列を控えておけば、「保存文字列・保存文書から再開」で続きから遊べます。', 'Keep this code. Use "Resume from a save code or file" to continue later.'],
  ['！ この枠の記録を読めません。別の枠か、控えてある保存文字列から再開してください。', '! This save cannot be read. Use another slot or a save code you kept.'],
  ['保存はこの閲覧画面だけに残ります。別の端末や閲覧画面へは保存文字列か保存文書で移します。', 'Saves stay in this browser only. To move to another device, use a save code or save file.'],
  // 設定
  ['あり', 'On'], ['なし', 'Off'], ['入れる', 'On'], ['切る', 'Off'], ['すべて', 'All'], ['全部', 'All'],
  ['大', 'Large'], ['中', 'Medium'], ['小', 'Small'], ['ふつう', 'Normal'], ['普通', 'Normal'], ['控えめ', 'Low'],
  ['上限なし', 'No limit'], ['30（省電力）', '30 (power saving)'],
  ['三人称（背中から見る）', 'Third person (behind)'], ['一人称（自分の目で見る）', 'First person (your eyes)'],
  ['明朝（雰囲気）', 'Serif (mood)'], ['ごしっく（読みやすい）', 'Sans (easy to read)'],
  ['十字', 'Cross'], ['点', 'Dot'], ['丸の見本', 'Circle sample'],
  ['大事なものだけ', 'Important only'], ['そのまま流れる', 'Normal speed'], ['時がゆっくり流れる', 'Slow motion'],
  ['最小（戦場を広く）', 'Minimum (wide view)'], ['札で選ぶ（軽い）', 'Choose by card (light)'], ['町を歩く', 'Walk the town'],
  ['合図を聞く', 'Hear signals'], ['戦いの声を聞く', 'Hear battle voices'], ['槍の音を聞く', 'Hear spear sounds'],
  ['矢印釦で移動する', 'Move with arrow keys'], ['突く', 'Thrust'],
  ['設定を初期値に戻す', 'Reset settings'], ['釦を初期に戻す', 'Reset buttons'],
  ['手ほどきと初回の説明をもう一度表示する', 'Show the tutorial and first-time tips again'],
  ['変えた設定はこの閲覧画面に保存されます。画質の草・木の量は次の戦から変わります。', 'Settings are saved in this browser. Grass and tree amount change from the next battle.'],
  ['草・木の量は次の戦から、ほかはすぐ変わります', 'Grass and trees change from the next battle. Others change now.'],
  // 戦の中
  ['現在の任務', 'Mission'], ['直前の台詞', 'Recent lines'], ['部隊', 'Units'], ['出陣する', 'Go to battle'],
  ['次の場面へ進む', 'Next scene'], ['まもなく始まります', 'Starting soon'], ['討', 'KO'],
  ['立体の表示を始められませんでした', 'Could not start 3D display'],
  // 砦・城攻めの始めの軍議（gungi.js・全戦共通。越前を信長で出陣の ?lang=en の通しで日本語のまま残った。クラウド kinome の持ち主 11/21）
  ['軍議', 'War council'], ['味方の部隊', 'Our units'], ['敵（物見の分だけ）', 'Enemy (scouted only)'], ['まだわからない', 'Not known yet'],
  ['？（物見でわからない）', '? (not scouted)'], ['この手配りで攻め始める', 'Attack with this plan'], ['城郭情報', 'Castle info'], ['配置', 'Position'],
  ['指か手元の操作器で城を回して見る／部隊を選び、道筋を押す', 'Turn the castle with a finger or controller / pick a unit, then tap a route'],
]);

// 豊臣編の台詞の訳（i18n_en_toyotomi.js・K516）。上の表に同じ字があればそちらを優先。
for (const [k, v] of EN_TOYOTOMI) if (!EN.has(k)) EN.set(k, v);
for (const [k, v] of EN_JINCHU) if (!EN.has(k)) EN.set(k, v);
// 戦ごとの表を足す（英語の時だけ戦の紙が読んで渡す。例 i18n_sanadamaru.js）。
//   数を含む字は [正規表現, (m) => 英語] の組で渡すと形の表（PAT）へ足す。
export function addEn(pairs) { for (const [j, e] of pairs || []) { if (j instanceof RegExp && typeof e === 'function') PAT.unshift([j, e]); else if (j && e) EN.set(j, e); } memo.clear(); if (started && typeof document !== 'undefined') { done = new WeakMap(); walk(document.body); } }   // 戦の表を後から読んだ時、先に出た札（任務の段の一覧）も訳し直す（今福 11/21：「1　堤を西へ進み、砦の前へ」が残った）
import ODA from './en_oda.js';   // K516 織田編の戦の札の訳（cloud-39・[日本語, 英語] の並びだけの表。下の memo の後で addEn に渡す）

// 字の中の決まった形（数を含む物）。
const PAT = [
  // 戦の後の幕『春日山へ戻る』（main.js toTown・町の名が変わる。?lang=en の上杉編の章の通しで残った。11/21 クラウド34）
  [/^(.+?)へ戻る$/, (m, t) => { const e = t(m[1]); return JA.test(e) ? undefined : `Return to ${e}`; }],
  // 使番の味方の様子の知らせ（ally_orders.js『〇〇殿の手、左手にて攻めかかっておる』・名と向きが変わる。11/21 クラウド34・佐和山の英語の通しの500秒に残った）
  [/^(.+?)殿の手、(前方|右前|右手|右後ろ|後方|左後ろ|左手|左前|すぐそば|[南北]?[東西]?)にて(攻めかかっておる|崩れて引き退く|陣を移す|引き退く)$/, (m, t) => {
    const n = t(m[1]); if (JA.test(n)) return undefined;
    const w = { 前方: 'ahead', 右前: 'ahead on the right', 右手: 'on the right', 右後ろ: 'behind on the right', 後方: 'behind', 左後ろ: 'behind on the left', 左手: 'on the left', 左前: 'ahead on the left', すぐそば: 'close by', 北: 'to the north', 南: 'to the south', 東: 'to the east', 西: 'to the west', 南東: 'to the southeast', 南西: 'to the southwest', 北東: 'to the northeast', 北西: 'to the northwest' }[m[2]];
    const a = { 攻めかかっておる: 'are attacking', 崩れて引き退く: 'are breaking and falling back', 陣を移す: 'are moving camp', 引き退く: 'are falling back' }[m[3]];
    return w && a ? `Lord ${n.replace(/^Lord /, '')}'s men ${a} ${w}` : undefined;
  }],
  [/^枠 (\d+)$/, (m) => `Slot ${m[1]}`],
  [/^全(\d+)戦$/, (m) => `${m[1]} battles`],
  // 軍議の部隊札（gungi.js『兵力 64　士気 意気盛ん　／　道筋［　／　配置：〇〇］』）・敵の数・道筋の見出し（クラウド kinome の持ち主 11/21）
  [/^兵力 (\d+)　士気 (意気盛ん|平常|動揺|崩れかけ)　／　(.+?)(?:　／　配置：(.+))?$/, (m, t) => { const r = m[3] === '（道筋未定）' ? 'no route yet' : t(m[3]); const d = m[4] ? t(m[4]) : ''; if (JA.test(r) || JA.test(d)) return undefined; return `${m[1]} men · ${{ 意気盛ん: 'High spirits', 平常: 'Steady', 動揺: 'Shaken', 崩れかけ: 'Breaking' }[m[2]]} / ${r}${m[4] ? ` / Position: ${d}` : ''}`; }],
  [/^✓ (.+)$/, (m, t) => { const e = t(m[1]); return JA.test(e) ? undefined : `✓ ${e}`; }],
  [/^およそ (\d+|？) 人$/, (m) => `About ${m[1] === '？' ? '?' : m[1]} men`],
  [/^(.+)の道筋$/, (m, t) => { const e = t(m[1]); return JA.test(e) ? undefined : `Route for ${e}`; }],
  // 目標の行の番号つき（戦の中の一覧『6　林勢を迎え撃て』）：番号の後ろを表で引く（11/21 クラウド44）
  [/^(\d+)　(.+)$/, (m) => {
    // 表に『⑧義元の旗本を破る』のように丸数字つきで入っている行も引く（11/21 クラウド44・桶狭間 310秒の『8　義元の旗本を破る』）
    const n = +m[1], c = n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : '';
    let r = EN.get(m[2].trim());
    if (r === undefined && c) { r = EN.get(c + m[2].trim()); if (r !== undefined) r = r.replace(/^[\u2460-\u2473]\s*/, ''); }
    return r === undefined ? undefined : `${m[1]}  ${r}`;
  }],
  [/^(\d+)m$/, (m) => `${m[1]}m`],
  // 任務の一覧の行『1　〜』（battle-goal-list）：数と字の間は全角の空白。字の方を表で引く（k17 静かな城下で日本語が残っていた。クラウド14）
  [/^(\d+)　(.+)$/, (m, tr) => { const r = tr(m[2]); return r === m[2] ? undefined : `${m[1]}. ${r}`; }],
  // 上の両軍の棒の頭の自分の組の数（hud_army.js sqTxt・信長で出陣の殿の組 100/100 が日本語で残っていた。クラウド 鳶ヶ巣の持ち主 11/21）
  [/^組(\d+)\/(\d+)$/, (m) => `Squad ${m[1]}/${m[2]}`], [/^自分の組 生き残り(\d+)人（(\d+)人のうち）$/, (m) => `Your squad: ${m[1]} of ${m[2]} alive`],
  [/^(.+) (残り|仮の兵数)([\d,]+)人?$/, (m, tr) => `${tr(m[1])} ${m[2] === '残り' ? 'left' : 'est.'} ${m[3]}`],
  [/^味方 ([\d,]+)人$/, (m) => `Allies ${m[1]}`], [/^敵 ([\d,]+)人$/, (m) => `Enemy ${m[1]}`],
  // 鉄砲・弓の札（player_ranged.js・全戦共通。?lang=en の通しで鳶ヶ巣の始め0秒に日本語で残っていた。クラウド 鳶ヶ巣の持ち主 11/21）
  [/^(左押し|攻撃の釦)を押し続けて狙い、離して撃つ$/, (m) => `Hold ${m[1] === '左押し' ? 'left click' : 'the attack button'} to aim, release to fire`],
  [/^鉄砲　(左押し|攻撃の釦)を離して撃つ$/, (m) => `Gun: release ${m[1] === '左押し' ? 'left click' : 'the attack button'} to fire`],
  [/^弾込め中　(筒を立てる|火薬を注ぐ|弾を入れる|込め矢で固める|口薬を盛る|火縄を合わせる)　(?:(馬を緩めて込める|体勢を戻して込める|歩みを緩めて込める)|あと(\d+)秒)$/, (m) => `Reloading: ${{ 筒を立てる: 'raise the barrel', 火薬を注ぐ: 'pour powder', 弾を入れる: 'load the ball', 込め矢で固める: 'ram it down', 口薬を盛る: 'prime the pan', 火縄を合わせる: 'set the match' }[m[1]]} — ${m[3] ? `${m[3]}s left` : { 馬を緩めて込める: 'slow the horse to reload', 体勢を戻して込める: 'steady yourself to reload', 歩みを緩めて込める: 'slow down to reload' }[m[2]]}`],
  // 読み上げ用（.spoken）は「あと〇秒」を外した形で残っていた（長篠城の信長で出陣 ?lang=en 通し 40秒・クラウド 長篠城の持ち主 11/21）
  [/^弾込め中　(筒を立てる|火薬を注ぐ|弾を入れる|込め矢で固める|口薬を盛る|火縄を合わせる)$/, (m) => `Reloading: ${{ 筒を立てる: 'raise the barrel', 火薬を注ぐ: 'pour powder', 弾を入れる: 'load the ball', 込め矢で固める: 'ram it down', 口薬を盛る: 'prime the pan', 火縄を合わせる: 'set the match' }[m[1]]}`],
  [/^(.+)（弾 (\d+)）$/, (m, t) => { const e = t(m[1]); return /[぀-ヿ㐀-鿿]/.test(e) ? undefined : `${e} (${m[2]} rounds)`; }],
  // 段の無い戦の主の任務の一行（goals5.js mainText の字が無い時の決まり文句・鳶ヶ巣の ?lang=en 通し 240秒で残った）
  [/^(.+)で敵の本陣へ攻め寄せる$/, (m, t) => { const e = t(m[1]); return /[぀-ヿ㐀-鿿]/.test(e) ? 'Push on to the enemy HQ' : `Push on to the enemy HQ at ${e}`; }],
  // 名のある将を討った大きな筆の字（victory_moment「〇〇 討ち取ったり」）。名が表に無い時は残す
  [/^(.+?)[、　 ]*討ち取ったり[！!]?$/, (m) => { const e = EN.get(m[1].trim()); return e === undefined ? undefined : `${e} is slain!`; }],
  // 名のある将の死の知らせ（battle.js「〇〇 討ち死に」・army_formation「〇〇 討死」・各戦の「〇〇、討死」）。名が表に無い時は残す（クラウド 長久手の持ち主 11/21）
  [/^(.+?)[ 　、]+(?:お)?討ち?死に?$/, (m) => { const n = m[1].trim(), e = n === '総大将' ? 'The commander' : EN.get(n); return e === undefined ? undefined : `${e} has fallen`; }],
  // 全戦共通の目標（goals5.js の killGoal・hurtGoal・bossGoal）。描かずの英語の通しで諏訪原の結果の札に日本語のまま残った（クラウド suwahara の持ち主 11/21）
  [/^敵を([一二三四五六七八九十]+|\d+)人討つ$/, (m) => { const K = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }; const v = /\d/.test(m[1]) ? +m[1] : m[1].split('十').length > 1 ? (K[m[1].split('十')[0]] || 1) * 10 + (K[m[1].split('十')[1]] || 0) : K[m[1]]; return `Defeat ${v} enemies`; }],
  [/^深手を負わずに勝つ$/, () => 'Win without a serious wound'],
  // 門を打つ下知（gate_guide.js『〇〇を打て（… 長押し）』・全戦共通）。諏訪原の英語の通しで『一の門を打て』が残った
  [/^(.+?)を打て(?:（(?:「打つ」|(.+?) )長押し）)?$/, (m) => { const e = EN.get(m[1].trim()); return e === undefined ? undefined : `Strike: ${e}` + (m[0].includes('長押し') ? ` (hold ${m[2] || 'Strike'})` : ''); }],
  [/^(.+)を討ち取る$/, (m) => { const e = EN.get(m[1].trim()); return e === undefined ? undefined : `Defeat ${e}`; }],
  [/^勝つには：(.+)$/, (m) => { const e = EN.get(m[1].trim()); return e === undefined ? undefined : `To win: ${e}`; }],
  [/^([①-⑳])(.+)$/, (m) => { const e = EN.get(m[2].trim()); return e === undefined ? undefined : `${m[1]} ${e}`; }],
  // 任務の札の頭の段の番号（「1　篠山の頂まで登れ」）：番号の後ろを表で引く（クラウド kaito2 11/21）
  [/^(\d+)[　 ]+(.+)$/, (m) => { const e = enGet(m[2].trim()); return e === undefined ? undefined : `${m[1]}  ${e}`; }],
];

for (const [k, v] of STORY_EN) if (!EN.has(k)) EN.set(k, v);   // K516：物語の札・戦の名・場所（i18n_story.js）
PAT.push(...STORY_PAT);

const JA = /[぀-ヿ㐀-鿿]/;
// 任務の札の「押し返す・押し戻す」は押されていない間「迎え撃つ」に替わる（speech_clean.js pressWords）。表には元の字しか無いので、
//   元の字で引き直して頭の動詞を Meet に（賤ヶ岳 ?lang=en の通しで「11　大岩山の北で佐久間の備を迎え撃つ」が日本語で残った。クラウド 賤ヶ岳の持ち主 11/21）
function enGet(k) {
  const e = EN.get(k); if (e !== undefined || !/迎え撃[つて]/.test(k)) return e;
  for (const v of ['押し返', '押し戻']) { const o = EN.get(k.replace(/迎え撃([つて])/, (m, a) => v + (a === 'て' ? 'せ' : 'す'))); if (o !== undefined) return o.replace(/^(Push|Drive|Force|Throw) (?:them |him |the enemy )?back\b ?/i, 'Meet ').replace(/^Meet $/, 'Meet them'); }
  return undefined;
}
const memo = new Map();
addEn(ODA);
addEn(EN_RANKUP.filter(([k]) => k instanceof RegExp || !EN.has(k)));   // 昇進の場面（形の札も）。上の表に同じ字があればそちらが先
// K516 関所（徳川編 k13・k16・k17・x15）：長押しの札・作業の進み・出世の札の残り（クラウド02 11/21）
addEn([
  [/^長押しで(.+)$/, (m, tr) => `Hold to ${tr(m[1])}`], ['作業の進み具合', 'Work progress'],
  [/^息が長くなる（体力 (\d+) → (\d+)）$/, (m) => `Longer breath (Stamina ${m[1]} → ${m[2]})`],
  ['新しい役目を受けた組の旗', 'Squad flag with a new role'], [/^組の旗 (\d+)本$/, (m) => `Squad flags: ${m[1]}`],
  ['を預かる。組の合印は、城下へ戻る前に定める', ' in your care. Choose the squad mark before returning to town'], [/^(\d+)人の組$/, (m) => `Squad of ${m[1]}`],
  ['合印の旗', 'Squad banner'], ['弓隊の編入', 'Archer unit enlistment'], ['陣形', 'Formation'], ['馬屋（次の段階）', 'Stable (next stage)'], ['前立付き兜', 'Helmet with a crest'],
  [/^禄 (\d+)貫 → (\d+)貫／戦$/, (m) => `Stipend ${m[1]} kan → ${m[2]} kan per battle`], [/^供を(\d+)人まで連れて行ける$/, (m) => `Can bring up to ${m[1]} attendants`],
]);
// K516 開戦の札（hud_opening.js）の全戦共通の字（11/21 cloud-06：?lang=en の通しで賤ヶ岳・小牧・長久手に残った）
//   両軍の名と人数「羽柴軍　50,000人」「徳川・織田信雄勢　30,000人」と、日付の後ろの言葉「朝・初夏」。家の名は表に無ければ下の小さな表で引く
const CLAN_EN = { 羽柴: 'Hashiba', 柴田: 'Shibata', 徳川: 'Tokugawa', 織田: 'Oda', 織田信雄: 'Oda Nobukatsu', 明智: 'Akechi', 豊臣: 'Toyotomi', 武田: 'Takeda', 上杉: 'Uesugi', 長尾: 'Nagao',
  北条: 'Hōjō', 毛利: 'Mōri', 島津: 'Shimazu', 今川: 'Imagawa', 浅井: 'Azai', 朝倉: 'Asakura', 長宗我部: 'Chōsokabe', 大坂: 'Osaka', 斎藤: 'Saitō', 三好: 'Miyoshi', 本願寺: 'Hongan-ji',
  石田: 'Ishida', 真田: 'Sanada', 伊達: 'Date', 最上: 'Mogami', 佐久間: 'Sakuma', 前田: 'Maeda', 池田: 'Ikeda', 森: 'Mori', 堀: 'Hori', 榊原: 'Sakakibara', 井伊: 'Ii', 東軍: 'Eastern', 西軍: 'Western' };
const clanEn = (n) => EN.get(n) ?? CLAN_EN[n];
const TIME_EN = { 朝: 'Morning', 早朝: 'Early morning', 昼: 'Midday', 夕: 'Evening', 夕方: 'Evening', 夕暮れ: 'Dusk', 夜: 'Night', 深夜: 'Late night', 夜明け: 'Dawn', 明け方: 'Dawn', 夜明け前: 'Before dawn',
  晴れ: 'Clear', 雨: 'Rain', 雪: 'Snow', 霧: 'Fog', 曇り: 'Cloudy', 春: 'Spring', 夏: 'Summer', 秋: 'Autumn', 冬: 'Winter', 初夏: 'Early summer', 晩夏: 'Late summer', 初秋: 'Early autumn',
  晩秋: 'Late autumn', 初冬: 'Early winter', 真冬: 'Midwinter', 早春: 'Early spring', 晩春: 'Late spring', 梅雨: 'Rainy season', 冬の初め: 'Early winter', 夏の終わり: 'Late summer' };
addEn([
  [/^(.+?)(軍|勢|方)(?:[　 ]+(約)?([0-9,０-９]+)人)?$/, (m) => {
    const parts = m[1].split('・').map((n) => clanEn(n.trim()));
    if (parts.some((x) => x === undefined || JA.test(x))) return undefined;
    const n = m[4] ? m[4].replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)) : '';
    return `${parts.join(' & ')} ${m[2] === '方' ? 'side' : 'forces'}${n ? `　${m[3] ? 'about ' : ''}${n} men` : ''}`;
  }],
  [/^[^\s　]+(?:・[^\s　]+)+$|^(?:朝|早朝|昼|夕|夕方|夕暮れ|夜|深夜|夜明け|明け方|夜明け前|晴れ|雨|雪|霧|曇り|春|夏|秋|冬|初夏|晩夏|初秋|晩秋|初冬|真冬|早春|晩春|梅雨)$/, (m) => {
    const w = m[0].split('・').map((x) => TIME_EN[x]);
    return w.some((x) => x === undefined) ? undefined : w.join(', ');
  }],
]);
export function tr(s) {
  if (LANG !== 'en' || typeof s !== 'string' || !s || !JA.test(s)) return s;
  const hit = memo.get(s); if (hit !== undefined) return hit;
  const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = s.trim().replace(/\u200b/g, '');   // 折り目の幅0の空白は外して引く
  let out = enGet(core);
  // 形の表（PAT）は全戦で一つ。戦ごとの広い形（設楽原の『(.+)の木戸』など）が、ほかの戦の字を先に取って日本語まじり（『中山 gate』）に
  //   していた。日本語の残らない答えが出るまで次の形を見て、無ければ最初の答え（クラウド 鳶ヶ巣の持ち主 11/21）
  if (out === undefined) { let part; for (const [re, fn] of PAT) { const m = core.match(re); if (!m) continue; const o = fn(m, tr); if (o === undefined) continue; if (!JA.test(o)) { out = o; break; } if (part === undefined) part = o; } if (out === undefined) out = part; }
  out = out === undefined ? s : lead + out + tail;
  if (memo.size > 4000) memo.clear();
  memo.set(s, out);
  return out;
}

// 画面の字を英語へ（英語の時だけ見張る）。
let done = new WeakMap();   // 文字の節 → 最後に書いた英語（自分の書き換えで二度走らない）
const ATTR = ['aria-label', 'title', 'placeholder'];
function fixText(n) {
  const v = n.nodeValue; if (done.get(n) === v) return;
  const t = tr(v); done.set(n, t); if (t !== v) n.nodeValue = t;
}
function fixAttr(el) {
  for (const a of ATTR) { const v = el.getAttribute && el.getAttribute(a); if (v && JA.test(v)) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } }
}
function walk(root) {
  if (root.nodeType === 3) { fixText(root); return; }
  if (root.nodeType !== 1) return;
  const tag = root.tagName; if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return;
  fixAttr(root);
  const it = document.createTreeWalker(root, 5 /* 要素と字 */);
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === 3) { const p = n.parentNode; if (p && (p.tagName === 'SCRIPT' || p.tagName === 'STYLE' || p.tagName === 'TEXTAREA')) continue; fixText(n); }
    else fixAttr(n);
  }
}

var started = false;   // var：上の addEn（読み込みの最中にも呼ぶ）が先に見るので
export function startI18n() {
  if (started || LANG !== 'en' || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  started = true;
  try { document.documentElement.lang = 'en'; } catch (e) {}
  const go = () => {
    walk(document.body);
    new MutationObserver((list) => {
      for (const r of list) {
        if (r.type === 'characterData') fixText(r.target);
        else if (r.type === 'attributes') fixAttr(r.target);
        else for (const n of r.addedNodes) walk(n);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR });
    // 題の字（document.title）
    const fixTitle = () => { const t = tr(document.title); if (t !== document.title) document.title = t; };
    fixTitle();
    const head = document.querySelector('title');
    if (head) new MutationObserver(fixTitle).observe(head, { childList: true, characterData: true, subtree: true });
  };
  if (document.body) go(); else document.addEventListener('DOMContentLoaded', go, { once: true });
}
// K516 画面の字（ホーム・日本地図・題・戦の選び）の表は英語の時だけ読む（クラウド k365-cloud-30）
if (LANG === 'en') import('./i18n_screens.js').then((m) => { addEn(m.default); done = new WeakMap(); if (typeof document !== 'undefined' && document.body) walk(document.body); }).catch(() => {});
if (LANG === 'en') import('./i18n_shop.js').then((m) => addEn(m.default)).catch(() => {});   // K516：城下町（武具屋・問屋の札）の取り残しの英訳
// K516 オンラインの画面（ホーム・編成・登用・交換所）の表も英語の時だけ読む（クラウド k365-cloud-15）
if (LANG === 'en') import('./i18n_online.js').then((m) => { addEn(m.default); done = new WeakMap(); if (typeof document !== 'undefined' && document.body) walk(document.body); }).catch(() => {});
// K516 戦の中の共通の画面（命の棒・人数・右上の任務の一行）の表（クラウド k365-cloud-15）
if (LANG === 'en') import('./i18n_hud.js').then((m) => { addEn(m.default); done = new WeakMap(); if (typeof document !== 'undefined' && document.body) walk(document.body); }).catch(() => {});
// K516 戦の外の画面（評定・論功行賞・出世・合印・城下・武具屋・稽古・記録帳・出世の道・設定の説明）の表も英語の時だけ読む（クラウド29）
if (LANG === 'en') import('./i18n_menus.js').then((m) => { addEn(m.default); done = new WeakMap(); if (typeof document !== 'undefined' && document.body) walk(document.body); }).catch(() => {});
// K516 豊臣編の戦の前の札に残った字（クラウド k365-cloud-30）
if (LANG === 'en') import('./i18n_toyo_cards.js').then((m) => { addEn(m.default); done = new WeakMap(); if (typeof document !== 'undefined' && document.body) walk(document.body); }).catch(() => {});
// K516 武田編・上杉編の戦の名・場所・町・章の説明も英語の時だけ読む（クラウド46）
if (LANG === 'en') import('./i18n_en_clans_screens.js').then((m) => { addEn(m.default); done = new WeakMap(); if (typeof document !== 'undefined' && document.body) walk(document.body); }).catch(() => {});
// K516 織田編・豊臣編の出陣の札（main.js STORY_BY の年・題・話・釦）も英語の時だけ読む（クラウド 八尾若江の持ち主 11/21）
if (LANG === 'en') import('./i18n_en_story_cards.js').then((m) => { addEn(m.default); done = new WeakMap(); if (typeof document !== 'undefined' && document.body) walk(document.body); }).catch(() => {});
// K646 オンラインに足した斎藤・真田・諸家の名の英語（クラウド Sanae）
if (LANG === 'en') import('./i18n_k646_names.js').then((m) => { addEn(m.default); done = new WeakMap(); if (typeof document !== 'undefined' && document.body) walk(document.body); }).catch(() => {});
if (LANG === 'en') import('./i18n_en_tokugawa.js').then((m) => addEn(m.default)).catch(() => {});
startI18n();
