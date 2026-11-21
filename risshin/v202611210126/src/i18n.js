// K516 英語版の土台（kaito 11/20「全部英語にもして、アメリカ向けにも」・クラウドか 11/21）。
//   日本語の字はそのまま書き、画面に出た字を英語の表で置き換える（呼ぶ所を一つずつ直さずに全部の画面に効く）。
//   ・言語：?lang=en / ?lang=ja ＞ 保存した選び（localStorage risshin_lang）＞ 端末の言語（AUTO が true の時だけ）。
//   ・日本語の時は何もしない（見張りも置かない・重さ0）。
//   ・英語の時は #screen・#hud・#pause などの字と aria-label・title・placeholder を、
//     字が変わった時だけ表で引く（同じ字は覚えて二度引かない）。表に無い字は日本語のまま残す（訳の係が EN に足す）。
//   ・AUTO は K576 の四つの関門（check・全64戦の描かずの通し・iPhone/iPad 実機の動画・落ち0）が揃うまで false。
//     揃うまでは ?lang=en か localStorage で選んだ人だけが英語になる。
export const AUTO = false;
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
  ['次の場面へ進む', 'Next scene'], ['討', 'KO'],
  ['立体の表示を始められませんでした', 'Could not start 3D display'],
]);

// 戦ごとの表を足す（英語の時だけ戦の紙が読んで渡す。例 i18n_sanadamaru.js）。
//   数を含む字は [正規表現, (m) => 英語] の組で渡すと形の表（PAT）へ足す。
export function addEn(pairs) { for (const [j, e] of pairs || []) { if (j instanceof RegExp && typeof e === 'function') PAT.unshift([j, e]); else if (j && e) EN.set(j, e); } memo.clear(); }

// 字の中の決まった形（数を含む物）。
const PAT = [
  [/^枠 (\d+)$/, (m) => `Slot ${m[1]}`],
  [/^全(\d+)戦$/, (m) => `${m[1]} battles`],
  [/^(\d+)m$/, (m) => `${m[1]}m`],
  [/^味方 ([\d,]+)人$/, (m) => `Allies ${m[1]}`], [/^敵 ([\d,]+)人$/, (m) => `Enemy ${m[1]}`],
  [/^勝つには：(.+)$/, (m) => { const e = EN.get(m[1].trim()); return e === undefined ? undefined : `To win: ${e}`; }],
  [/^([①-⑳])(.+)$/, (m) => { const e = EN.get(m[2].trim()); return e === undefined ? undefined : `${m[1]} ${e}`; }],
  // 任務の札の頭の段の番号（「1　篠山の頂まで登れ」）：番号の後ろを表で引く（クラウド kaito2 11/21）
  [/^(\d+)[　 ]+(.+)$/, (m) => { const e = EN.get(m[2].trim()); return e === undefined ? undefined : `${m[1]}  ${e}`; }],
];

const JA = /[぀-ヿ㐀-鿿]/;
const memo = new Map();
export function tr(s) {
  if (LANG !== 'en' || typeof s !== 'string' || !s || !JA.test(s)) return s;
  const hit = memo.get(s); if (hit !== undefined) return hit;
  const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = s.trim().replace(/\u200b/g, '');   // 折り目の幅0の空白は外して引く
  let out = EN.get(core);
  if (out === undefined) for (const [re, fn] of PAT) { const m = core.match(re); if (m) { out = fn(m); break; } }
  out = out === undefined ? s : lead + out + tail;
  if (memo.size > 4000) memo.clear();
  memo.set(s, out);
  return out;
}

// 画面の字を英語へ（英語の時だけ見張る）。
const done = new WeakMap();   // 文字の節 → 最後に書いた英語（自分の書き換えで二度走らない）
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

let started = false;
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
startI18n();
