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
  padSens: 1,         // 右スティック感度
  invertY: false,     // 上下反転
  smooth: false,      // マウスの平滑化
  autoCam: false,     // 移動中にカメラが背後へ回る
  camRange: 'mid',    // 三人称の距離：near / mid / far
  view: 'third',      // 戦の視点：third（三人称）/ first（一人称）。V で切り替えると覚える
  fov: 62,            // 視野角
  volume: 0.8,        // 全体の音量
  volSfx: 1,          // 効果音
  volAmb: 1,          // 環境音
  volVoice: 1,        // 台詞の声の音量
  volMusic: 0.7,      // 楽の音
  townMusic: true,    // 城下の楽の音
  townWalk: 'walk',   // 城下：walk（3Dの町を歩く）／cards（札で選ぶ。iPhone で重い時）
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
  hudMinimap: true, hudCompass: true, hudArmy: true, hudSquad: true, hudBottom: true, hudObjectives: true,
  quality: 'high',    // 画質 low / mid / high
  qualityAuto: true,  // 手で画質を選ぶまで、速さに合わせる
  qualityMeasured: false, // 初めての実測が済んだか
  runToggle: false,   // 走りを切替式にする
  guardToggle: false, // 構えを切替式にする
  aimAssist: true,    // 照準補助
  shake: true,        // 画面の揺れ
  blood: 'on',        // 血の見せ方：on / low / off
  hudMode: 'normal',  // 画面の札の量：min / normal / full
  freeMoney: true,    // 銭を無限に（試しの間）
  reduceMotion: false,// 動きを減らす
  reduceGuidance: false, // 任務の矢印・端の印・迷った時の台詞を消す
  colorAssist: false, // 色覚配慮
  uiScale: 'm',       // 全画面の字の大きさ s / m / l
  subSize: 'm',       // 字幕の大きさ s / m / l
  hints: true,        // ヒント表示
  showFps: false,     // FPS表示
  autoRes: true,      // 滑らかさ優先（重い時だけ戦の中の細かさを自動で下げる）
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
  sens: [0.3, 2.5], padSens: [0.3, 2.5], touchSens: [0.4, 2.5], fov: [50, 85],
  volume: [0, 1], volSfx: [0, 1], volAmb: [0, 1], volMusic: [0, 1],
  voiceRate: [0.7, 1.5], drawDist: [0.6, 1.4], touchAlpha: [0.35, 1], slot: [0, 2],
};
const CHOICES = {
  camRange: ['near', 'mid', 'far'], view: ['third', 'first'], townWalk: ['walk', 'cards'], toastLevel: ['all', 'important'],
  crosshair: ['dot', 'cross', 'none'], voice: ['off', 'major', 'all'], fontBody: ['gothic', 'mincho'],
  quality: ['low', 'mid', 'high'], blood: ['on', 'low', 'off'], hudMode: ['min', 'normal', 'full'],
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
// 携帯（指の・小さい画面）は、初めては描画距離も少し近くから始める（画質は実測で決める）
// 前に選んだ距離があればそのまま。PC は変えない。三角の数を大きく削る一手
try {
  if (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) {
    const phone = Math.min(screen.width, screen.height) < 600;
    DEFAULTS.hudMode = 'min'; DEFAULTS.fpsCap = phone ? 30 : 60;
    if (phone) { DEFAULTS.drawDist = 0.72; DEFAULTS.quality = 'low'; }
  }
} catch (e) { /* 判れなければ既定のまま */ }
export const S = Object.assign({}, DEFAULTS, saved0);
// 自動の印がない昔の保存は、前に選んだ画質を守る。
if (saved0.qualityAuto === undefined && saved0.quality !== undefined) S.qualityAuto = false;
try { if (S.qualityAuto && !S.qualityMeasured && matchMedia('(pointer: coarse)').matches) S.quality = 'low'; } catch (e) { /* 端末を判れなければ既定 */ }
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
export const reduceMotion = () => motionChoice || !!motionMedia?.matches;
function syncMotion() {
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
const KEY_LABELS = {
  ShiftLeft: '左シフト', ShiftRight: '右シフト', ControlLeft: '左コントロール', ControlRight: '右コントロール',
  AltLeft: '左オルト', AltRight: '右オルト', MetaLeft: '左の機能キー', MetaRight: '右の機能キー',
  Space: '空白キー', Tab: '左上の横矢印キー', Enter: '決定キー', Escape: '戻るキー',
  ArrowUp: '上矢印', ArrowDown: '下矢印', ArrowLeft: '左矢印', ArrowRight: '右矢印',
  Backspace: '一字戻すキー', Delete: '削除キー', Insert: '挿入キー', Home: '先頭キー', End: '末尾キー',
  PageUp: '前のページ', PageDown: '次のページ', CapsLock: '大文字固定キー', NumLock: '数字固定キー',
  ScrollLock: '画面固定キー', Pause: '停止キー', PrintScreen: '画面を写すキー', ContextMenu: 'メニューキー',
  BracketLeft: '左角かっこ', BracketRight: '右角かっこ', Semicolon: 'セミコロン', Quote: '引用符',
  Comma: 'コンマ', Period: 'ピリオド', Slash: '斜線', Backslash: '逆斜線', IntlBackslash: '逆斜線',
  IntlRo: 'ろのキー', IntlYen: '円のキー', Backquote: '逆引用符', Minus: 'マイナス', Equal: '等号',
  NumpadAdd: '数字欄の足すキー', NumpadSubtract: '数字欄の引くキー', NumpadMultiply: '数字欄の掛けるキー',
  NumpadDivide: '数字欄の割るキー', NumpadDecimal: '数字欄の小数点', NumpadEnter: '数字欄の決定キー',
};
// 鍵盤に書かれた文字を、日本語で読める名前にする。かなのない鍵盤でも探せる。
const LETTER_NAMES = ['エー', 'ビー', 'シー', 'ディー', 'イー', 'エフ', 'ジー', 'エイチ', 'アイ', 'ジェー', 'ケー', 'エル', 'エム', 'エヌ', 'オー', 'ピー', 'キュー', 'アール', 'エス', 'ティー', 'ユー', 'ブイ', 'ダブリュー', 'エックス', 'ワイ', 'ゼット'];
for (let i = 0; i < LETTER_NAMES.length; i++) KEY_LABELS['Key' + String.fromCharCode(65 + i)] = LETTER_NAMES[i] + 'のキー';
for (let i = 0; i < 10; i++) { KEY_LABELS['Digit' + i] = String(i); KEY_LABELS['Numpad' + i] = '数字欄の' + i; }
for (let i = 1; i <= 24; i++) KEY_LABELS['F' + i] = '最上段の機能キー' + i;
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
  low: { pixelRatio: 1, shadows: false, shadowMap: 1024, tufts: 0.35, trees: 0.6, shadowDist: 0 },
  mid: { pixelRatio: 1.25, shadows: true, shadowMap: 1024, tufts: 0.7, trees: 0.85, shadowDist: 14 },
  high: { pixelRatio: 1.5, shadows: true, shadowMap: 2048, tufts: 0.75, trees: 0.78, shadowDist: 16, bloom: true },
};

export const DIFFICULTY = {
  easy: { name: '易', taken: 0.6, regen: 8, attackers: 2, aim: 0.7, perma: false, note: '受ける傷が少ない。退いて手当ては二回まで' },
  normal: { name: '普通', taken: 1, regen: 5, attackers: 3, aim: 0.45, perma: false, note: '重傷を負うと後送され、宿で休む必要がある' },
  hard: { name: '難', taken: 1.3, regen: 3, attackers: 4, aim: 0.3, perma: true, note: '重傷はそのまま討死。やり直しはきかない' },
};
