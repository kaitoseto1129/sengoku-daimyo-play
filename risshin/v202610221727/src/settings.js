// 設定（このブラウザに保存）
const KEY = 'sengoku-risshin-settings-v1';
const HINT_KEY = 'sengoku-risshin-hints-v1';

// 変更できるキー割り当て（操作名 → 既定のキー）
export const BIND_DEFAULTS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  run: 'ShiftLeft', dodge: 'Space', use: 'KeyE', lock: 'KeyQ',
  rally: 'KeyF', command: 'Tab', map: 'KeyM', log: 'KeyL', skip: 'Enter', photo: 'KeyP', hud: 'KeyU', mapzoom: 'KeyB',
  follow: 'KeyZ', hold: 'KeyX', attack: 'KeyC', retreat: 'KeyN', shoulder: 'KeyT', mount: 'KeyR',
  view: 'KeyV',
};
export const BIND_LABELS = {
  forward: '前へ', back: '後ろへ', left: '左へ', right: '右へ', run: '走る', dodge: '回避・馬の手綱を引く', use: '話す・取る', lock: '狙い定め',
  rally: '鼓舞', command: '部隊指揮（長押しで号令の輪）', map: '戦場の地図', log: '会話の記録', skip: '行軍・待ちを飛ばす', photo: '写真モード', hud: '画面の表示を消す・出す', mapzoom: '小地図の広さ', follow: '号令：ついて来い', hold: '号令：待て', attack: '号令：突撃', retreat: '号令：退け', shoulder: '肩越しの切替', mount: '馬に乗る・降りる（遠ければ口笛）', view: '視点の切替（三人称・一人称）',
};

const DEFAULTS = {
  sens: 1,            // 視点感度
  padSens: 1,         // 右の棒感度
  invertY: false,     // 上下反転
  smooth: false,      // マウスの平滑化
  autoCam: false,     // 移動中にカメラが背後へ回る
  camRange: 'mid',    // 三人称の距離：near / mid / far
  view: 'third',      // 戦の視点：third（三人称）/ first（一人称）。V で切り替えると覚える
  fov: 48,            // 視野角
  volume: 0.8,        // 全体の音量
  volSfx: 1,          // 効果音
  volAmb: 1,          // 環境音
  volVoice: 1,        // 台詞の声の音量
  volMusic: 0.7,      // 楽の音
  townMusic: true,    // 城下の楽の音
  townWalk: typeof navigator !== 'undefined' && /iPhone/.test(navigator.userAgent) ? 'cards' : 'walk', // 初めての城下は携帯で軽く。切り替えは設定から
  subBg: true,        // 字幕の下地
  hudContrast: false, // HUDのコントラストを上げる
  hudAutoFade: true,  // 平時はHUDを薄く
  floatMerit: true,   // 戦功を討った場所にも浮かべる
  fpsCap: 0,          // 描画の上限（0＝上限なし）
  drawDist: 1,        // 描画距離（霧の遠さ）
  slot: 0,            // 使っている保存の枠
  enemyMark: false,   // 敵の頭上に常に小さな印
  toastLevel: 'all',  // 戦功の通知：all / important
  crosshair: 'dot',   // 照準の形：dot / cross / none
  mapNorth: false,    // ミニマップを北が上に固定
  voice: 'off',       // 台詞の読み上げ：off / major / all
  voiceRate: 1.05,    // 読み上げの速さ
  fontBody: 'gothic', // 本文の字：gothic / mincho
  minimapOff1023: false, // 小地図を既定で消した印（一度だけ）
  hudMinimap: false, hudCompass: true, hudArmy: true, hudSquad: true, hudBottom: true, hudObjectives: true,
  quality: 'high',    // 画質は「高」だけ
  qualityAuto: false, // 自動で画質を下げない（保存の鍵は残す）
  qualityMeasured: false, // 初めての実測が済んだか
  lowMem: false,      // 携帯で重さに落ちた後の軽い作り（近くの本物の兵を減らす。10/19）
  heatFloor: 0,       // 軽く遊ぶ段（0〜3）。熱の段をここから始める。iPhone で落ちた後の札で選ぶ（10/21）
  runToggle: false,   // 走りを切替式にする
  guardToggle: false, // 構えを切替式にする
  aimAssist: true,    // 照準補助
  shake: true,        // 画面の揺れ
  blood: 'on',        // 血の見せ方：on / low / off
  hudMode: 'normal',  // 画面の札の量：min / normal / full
  freeMoney: false,   // 開発用の試しだけで有効にする（保存しない）
  reduceMotion: false,// 動きを減らす
  sendMetrics: true,  // 遊びの記録を送る（作り手の改善のため。個人は特定しない）
  reduceGuidance: false, // 任務の矢印・端の印・迷った時の台詞を消す
  colorAssist: false, // 色覚配慮
  uiScale: 'm',       // 全画面の字の大きさ s / m / l
  subSize: 'm',       // 字幕の大きさ s / m / l
  hints: true,        // ヒント表示
  showFps: false,     // FPS表示
  vibrate: true,      // ゲームパッドの振動
  // 指の端末の操作（touch.js が読む）
  touchSwap: false,   // 左右の入れ替え（丸を左下、歩く棒を右に）
  touchSize: 'm',     // 丸の大きさ s / m / l
  touchAlpha: 1,      // 丸の濃さ（0.35〜1）
  touchSens: 1,       // 指でなぞる見回しの感度
  radialTime: 'slow', // 号令の輪を開いている間の時の流れ：slow（ゆっくり）/ run（流れたまま）
  binds: { ...BIND_DEFAULTS },
};

function read(k) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

const stored = read(KEY);
const saved0 = {};
if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
  for (const key of Object.keys(DEFAULTS)) if (Object.hasOwn(stored, key)) saved0[key] = stored[key];
}
// 設定だけを整える。進行の保存には触れない。
const RANGES = {
  sens: [0.3, 2.5], padSens: [0.3, 2.5], touchSens: [0.4, 2.5], fov: [40, 85],
  volume: [0, 1], volSfx: [0, 1], volAmb: [0, 1], volMusic: [0, 1],
  voiceRate: [0.7, 1.5], drawDist: [0.6, 1.4], touchAlpha: [0.35, 1], slot: [0, 2],
};
const CHOICES = {
  camRange: ['near', 'mid', 'far'], view: ['third', 'first'], townWalk: ['walk', 'cards'], toastLevel: ['all', 'important'],
  crosshair: ['dot', 'cross', 'none'], voice: ['off', 'major', 'all'], fontBody: ['gothic', 'mincho'],
  quality: ['high'], blood: ['on', 'low', 'off'], hudMode: ['min', 'normal', 'full'],
  uiScale: ['s', 'm', 'l'], subSize: ['s', 'm', 'l'], touchSize: ['s', 'm', 'l'],
  radialTime: ['slow', 'run'], fpsCap: [0, 30, 60],
};
for (const [key, fallback] of Object.entries(DEFAULTS)) {
  if (key === 'binds' || saved0[key] === undefined) continue;
  const value = saved0[key];
  if (RANGES[key]) {
    const [lo, hi] = RANGES[key];
    saved0[key] = typeof value === 'number' && Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback;
    if (key === 'slot') saved0[key] = Math.round(saved0[key]);
  } else if (CHOICES[key]) {
    if (!CHOICES[key].includes(value)) saved0[key] = fallback;
  } else if (typeof fallback === 'boolean' && typeof value !== 'boolean') saved0[key] = fallback;
}
// 携帯の初回は札の量・描画の上限・距離を合わせる。画質は「高」のまま。
// 古い端末の目安は画面の短辺と処理の並列数。前に選んだ距離があればそのまま。
try {
  if (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) {
    const phone = Math.min(screen.width, screen.height) < 600;
    DEFAULTS.hudMode = 'min'; DEFAULTS.fpsCap = phone ? 30 : 60;
    if (phone) {
      const modest = screen.width && Math.min(screen.width, screen.height) <= 375 || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4);
      DEFAULTS.drawDist = modest ? 0.6 : 0.72;
    }
  }
} catch (e) { /* 判れなければ既定のまま */ }
// 右上の小地図は既定で出さない（kaito 10/23 稲生 2）。設定で出した人はそのまま。前の既定のままの保存も一度だけ消す。
if (!saved0.minimapOff1023) { saved0.hudMinimap = false; saved0.minimapOff1023 = true; }
export const S = Object.assign({}, DEFAULTS, saved0);
// 記憶のきつい機械：iPhone（GPU process が約 600MB・WebContent が 2048MB で切られる）。
//   実機の確かめで iPad に同じ作りをさせる時は -autoplay tight,戦,… か ?tight=1（10/20）
export const MEM_TIGHT = typeof navigator !== 'undefined' && (/iPhone/.test(navigator.userAgent)
  || (typeof window !== 'undefined' && (/\btight\b/.test(String(window.__autoplay || '')) || /[?&]tight=1/.test(location.search))));
// 試しの印で iPhone の作りにした大きな画面（iPad）：描く画素も iPhone（874×402 の 1.25 倍＝約 55 万画素）に合わせる（的の大きさを同じにして測る）
export const MEM_TIGHT_TEST = MEM_TIGHT && !/iPhone/.test(navigator.userAgent);
// 古い保存の使い放題は引き継がない。開発時だけ ?freeMoney=1、または S.freeMoney = true で試す。
// 開発中に設定を保存しても、次の通常起動には持ち越さない。
Object.defineProperty(S, 'freeMoney', {
  value: typeof location !== 'undefined' && new URLSearchParams(location.search).get('freeMoney') === '1',
  writable: true, enumerable: false,
});
// 画質は「高」だけ（kaito 10/12・10/14 念押し「画質は高いしか選択肢にない」）。自動で下げる道・手で選ぶ道の書き込みは受けない
Object.defineProperty(S, 'quality', { get: () => 'high', set() {}, enumerable: true });
Object.defineProperty(S, 'qualityAuto', { get: () => false, set() {}, enumerable: true });
S.binds = Object.fromEntries(Object.keys(BIND_DEFAULTS).map((act) => [act, saved0.binds?.[act] ?? BIND_DEFAULTS[act]]));
// 戻る・説明の鍵は専用。壊れた割り当てで動けなくなるのを防ぐ。
export const bindReserved = (code) => ['Escape', 'KeyH', 'F1', 'BracketLeft', 'BracketRight', 'AltLeft', 'AltRight'].includes(code) || /^Digit[0-9]$/.test(code);
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
export const validBind = (code, act) => !((act === 'mount' || act === 'dodge') && MOVE_KEYS.includes(code)) && typeof code === 'string' && /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Space|Tab|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|BracketLeft|BracketRight|Comma|Period|Slash|Semicolon|Quote|Backquote|Minus|Equal|Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter)|F([2-9]|1[0-2])|Meta(Left|Right)|CapsLock|NumLock|ScrollLock|Pause|PrintScreen|ContextMenu|Backslash|IntlBackslash|IntlYen|IntlRo)$/.test(code) && !bindReserved(code);
// 前の保存では「退け」が V だった。V は視点の切替になったので、「退け」を新しい既定へ移す
if (saved0.binds && !saved0.binds.view && S.binds.retreat === 'KeyV') S.binds.retreat = BIND_DEFAULTS.retreat;
// 馬の操作と移動を入れ替えた昔の設定は、移動を元へ戻す。
for (const act of ['mount', 'dodge']) {
  if (!MOVE_KEYS.includes(S.binds[act])) continue;
  const move = ['forward', 'back', 'left', 'right'].find((key) => BIND_DEFAULTS[key] === S.binds[act]);
  if (S.binds[move] === BIND_DEFAULTS[act]) S.binds[move] = BIND_DEFAULTS[move];
  S.binds[act] = BIND_DEFAULTS[act];
}
// 使える割り当てを先に保ち、壊れた所だけ空いたキーへ戻す。
const usedBinds = new Set(), repairBinds = [];
for (const act of Object.keys(BIND_DEFAULTS)) {
  const code = S.binds[act];
  if (validBind(code, act) && !usedBinds.has(code)) usedBinds.add(code);
  else repairBinds.push(act);
}
for (const act of repairBinds) {
  const code = [BIND_DEFAULTS[act], ...Object.values(BIND_DEFAULTS)].find((key) => validBind(key, act) && !usedBinds.has(key));
  S.binds[act] = code; usedBinds.add(code);
}
S.volVoice = typeof S.volVoice === 'number' && Number.isFinite(S.volVoice) ? Math.max(0, Math.min(1, S.volVoice)) : 1;
// 古い演出も S.reduceMotion を読むので、OS の設定をここで合わせる。
// 保存するのは遊ぶ人が選んだ値だけ。OS の設定は保存に混ぜない。
const motionMedia = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let motionChoice = !!S.reduceMotion;
export const motionPreference = () => motionChoice;
// OS の設定（matchMedia.matches）は毎コマ何百回も読まれるので、変わった時だけ写す（10/20 重さ）。
let motionMediaOn = !!motionMedia?.matches;
export const reduceMotion = () => motionChoice || motionMediaOn;
function syncMotion() {
  motionMediaOn = !!motionMedia?.matches;
  if (typeof document !== 'undefined') document.body?.classList.toggle('rm', reduceMotion());
}
Object.defineProperty(S, 'reduceMotion', {
  enumerable: true,
  get: reduceMotion,
  set(value) { motionChoice = !!value; syncMotion(); },
});
if (motionMedia?.addEventListener) motionMedia.addEventListener('change', syncMotion);
else if (motionMedia?.addListener) motionMedia.addListener(syncMotion);
syncMotion();
// 読み込み・設定変更の時だけ反映する。毎コマの処理は増やさない。
function syncTextSize() {
  if (typeof document === 'undefined') return;
  const size = ['s', 'm', 'l'].includes(S.uiScale) ? S.uiScale : 'm';
  document.documentElement.dataset.textSize = size;
  document.documentElement.style.setProperty('--text-scale', { s: 0.9, m: 1, l: 1.2 }[size]);
}
syncTextSize();
export function saveSettings() {
  syncTextSize();
  try { localStorage.setItem(KEY, JSON.stringify({ ...S, reduceMotion: motionChoice })); return true; }
  catch (e) { return false; }
}
export function resetSettings() {
  const slot = S.slot;
  Object.assign(S, DEFAULTS, { slot, binds: { ...BIND_DEFAULTS } });
  try {
    if (matchMedia('(pointer: coarse)').matches) {
      const phone = Math.min(screen.width, screen.height) < 600;
      S.hudMode = 'min'; S.fpsCap = phone ? 30 : 60;
      if (phone) S.drawDist = 0.72;
    }
  } catch (e) { /* 端末が分からなければ共通の値 */ }
  return saveSettings();
}

// 押されたキーを、既定のキー名に読み替える（ゲーム内部は既定のキー名で判定する）
export function canonical(code) {
  for (const act in BIND_DEFAULTS) {
    if (S.binds[act] === code) return BIND_DEFAULTS[act];
  }
  // 割り当て先として使われた既定キーは、元の意味では効かない
  for (const act in BIND_DEFAULTS) {
    if (BIND_DEFAULTS[act] === code && S.binds[act] !== code) return null;
  }
  if (code === 'ShiftRight' && S.binds.run === 'ShiftLeft') return 'ShiftLeft';
  return code;
}
// 表示だけ日本語にする。操作の判定や保存するキー名は変えない。
// 片仮名をやめ、鍵盤の字か、ふつうの日本語で（kaito 10/23 稲生 26）
const KEY_LABELS = {
  ShiftLeft: '左Shift', ShiftRight: '右Shift', ControlLeft: '左Ctrl', ControlRight: '右Ctrl',
  AltLeft: '左Alt', AltRight: '右Alt', MetaLeft: '左⌘', MetaRight: '右⌘',
  Space: '空白', Tab: 'Tab', Enter: 'Enter', Escape: 'Esc',
  ArrowUp: '上矢印', ArrowDown: '下矢印', ArrowLeft: '左矢印', ArrowRight: '右矢印',
  Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
  PageUp: 'PageUp', PageDown: 'PageDown', CapsLock: 'CapsLock', NumLock: 'NumLock',
  ScrollLock: 'ScrollLock', Pause: 'Pause', PrintScreen: 'PrintScreen', ContextMenu: 'Menu',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', IntlBackslash: '\\',
  IntlRo: 'ろ', IntlYen: '¥', Backquote: '`', Minus: '-', Equal: '=',
  NumpadAdd: '数字欄の+', NumpadSubtract: '数字欄の-', NumpadMultiply: '数字欄の*',
  NumpadDivide: '数字欄の/', NumpadDecimal: '数字欄の.', NumpadEnter: '数字欄のEnter',
};
// 鍵盤に書かれた文字を、日本語で読める名前にする。かなのない鍵盤でも探せる。
const LETTER_NAMES = ['エー', 'ビー', 'シー', 'ディー', 'イー', 'エフ', 'ジー', 'エイチ', 'アイ', 'ジェー', 'ケー', 'エル', 'エム', 'エヌ', 'オー', 'ピー', 'キュー', 'アール', 'エス', 'ティー', 'ユー', 'ブイ', 'ダブリュー', 'エックス', 'ワイ', 'ゼット'];
// 10/22 kaito「カタカナやめて」：文字のキーは鍵盤の字そのまま（W・A・S・D）で見せる。LETTER_NAMES は読み上げ用に残す
for (let i = 0; i < LETTER_NAMES.length; i++) KEY_LABELS['Key' + String.fromCharCode(65 + i)] = String.fromCharCode(65 + i);
for (let i = 0; i < 10; i++) { KEY_LABELS['Digit' + i] = String(i); KEY_LABELS['Numpad' + i] = '数字欄の' + i; }
for (let i = 1; i <= 24; i++) KEY_LABELS['F' + i] = 'F' + i;
export function keyLabel(code) {
  if (!code) return '割り当てなし';
  return KEY_LABELS[code] || '割り当てたキー';
}
export function K(act) { return keyLabel(S.binds[act]); }

const savedHints = read(HINT_KEY);
const seen = new Set(Array.isArray(savedHints) ? savedHints.filter((id) => typeof id === 'string') : []);
export function hintSeen(id) { return seen.has(id); }
let hintSaveWarned = false;
export function markHint(id) { seen.add(id); try { localStorage.setItem(HINT_KEY, JSON.stringify([...seen])); return true; } catch (e) { if (!hintSaveWarned) { hintSaveWarned = true; window.dispatchEvent(new Event('risshin-hint-save-failed')); } return false; } }
export function resetHints() { seen.clear(); try { localStorage.removeItem(HINT_KEY); return true; } catch (e) { return false; } }

export const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 1024, tufts: 0.35, trees: 0.5, shadowDist: 0 },
  mid: { pixelRatio: 1, shadows: true, shadowMap: 1024, tufts: 0.5, trees: 0.65, shadowDist: 14 },
  high: { pixelRatio: 1.25, shadows: true, shadowMap: 2048, tufts: 0.6, trees: 0.7, shadowDist: 16, bloom: true },   // 木と草むらは少し減らす（一コマの三角と描く回数の目標。10/14）
};

export const DIFFICULTY = {
  easy: { name: '易', taken: 0.6, regen: 8, attackers: 2, aim: 0.7, perma: false, note: '受ける傷が少ない。退いて手当ては二回まで' },
  normal: { name: '普通', taken: 1, regen: 5, attackers: 3, aim: 0.45, perma: false, note: '重傷を負うと後送され、宿で休む必要がある' },
  hard: { name: '難', taken: 1.3, regen: 3, attackers: 4, aim: 0.3, perma: true, note: '重傷はそのまま討死。やり直しはきかない' },
};
