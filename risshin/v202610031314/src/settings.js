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
  forward: '前へ', back: '後ろへ', left: '左へ', right: '右へ', run: '走る', dodge: '回避', use: '話す・取る', lock: '狙い定め',
  rally: '鼓舞', command: '部隊指揮（長押しで号令の輪）', map: '戦術マップ', log: '会話の記録', skip: '行軍・待ちを飛ばす', photo: '写真モード', hud: '画面の表示を消す・出す', mapzoom: 'ミニマップの縮尺', follow: '号令：ついて来い', hold: '号令：待て', attack: '号令：突撃', retreat: '号令：退け', shoulder: '肩越しの切替', mount: '馬に乗る・降りる（遠ければ口笛）', view: '視点の切替（三人称・一人称）',
};

const DEFAULTS = {
  sens: 1,            // 視点感度
  padSens: 1,         // 右スティック感度
  invertY: false,     // 上下反転
  smooth: false,      // マウスの平滑化
  autoCam: false,     // 移動中にカメラが背後へ回る
  view: 'third',      // 戦の視点：third（三人称）/ first（一人称）。V で切り替えると覚える
  fov: 62,            // 視野角
  volume: 0.8,        // 全体の音量
  volSfx: 1,          // 効果音
  volAmb: 1,          // 環境音
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
  runToggle: false,   // 走りを切替式にする
  guardToggle: false, // 構えを切替式にする
  aimAssist: true,    // 照準補助
  shake: true,        // 画面の揺れ
  blood: 'on',        // 血の見せ方：on / low / off
  hudMode: 'normal',  // 画面の札の量：min / normal / full
  freeMoney: true,    // 銭を無限に（試しの間）
  reduceMotion: false,// 動きを減らす
  colorAssist: false, // 色覚配慮
  uiScale: 'm',       // UIの大きさ
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

const saved0 = read(KEY) || {};
// 携帯（指の・小さい画面）は、初めては描画距離も少し近くから始める（画質の既定は touch.js が携帯「低」・iPad「中」に決める）
// 前に選んだ距離があればそのまま。PC は変えない。三角の数を大きく削る一手
try {
  if (saved0.drawDist === undefined && typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600) DEFAULTS.drawDist = 0.72;
} catch (e) { /* 判れなければ既定のまま */ }
export const S = Object.assign({}, DEFAULTS, saved0);
S.binds = Object.assign({}, BIND_DEFAULTS, S.binds || {});
// 前の保存では「退け」が V だった。V は視点の切替になったので、「退け」を新しい既定へ移す
if (saved0.binds && !saved0.binds.view && S.binds.retreat === 'KeyV') S.binds.retreat = BIND_DEFAULTS.retreat;
// 動きを減らす：ゲームの設定か OS の設定（ここ一か所で判定する）
export const reduceMotion = () => !!S.reduceMotion || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
export function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 保存できない環境 */ } }
export function resetSettings() { Object.assign(S, DEFAULTS, { binds: { ...BIND_DEFAULTS } }); saveSettings(); }

// 押されたキーを、既定のキー名に読み替える（ゲーム内部は既定のキー名で判定する）
export function canonical(code) {
  for (const [act, key] of Object.entries(S.binds)) {
    if (key === code) return BIND_DEFAULTS[act];
  }
  // 割り当て先として使われた既定キーは、元の意味では効かない
  for (const [act, key] of Object.entries(BIND_DEFAULTS)) {
    if (key === code && S.binds[act] !== code) return null;
  }
  if (code === 'ShiftRight') return 'ShiftLeft';
  return code;
}
export function keyLabel(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'Shift').replace('Space', 'スペース').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→');
}
export function K(act) { return keyLabel(S.binds[act]); }

const seen = new Set(read(HINT_KEY) || []);
export function hintSeen(id) { return seen.has(id); }
export function markHint(id) { seen.add(id); try { localStorage.setItem(HINT_KEY, JSON.stringify([...seen])); } catch (e) { /* noop */ } }
export function resetHints() { seen.clear(); try { localStorage.removeItem(HINT_KEY); } catch (e) { /* noop */ } }

export const QUALITY = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 1024, tufts: 0.35, trees: 0.6, shadowDist: 0 },
  mid: { pixelRatio: 1.25, shadows: true, shadowMap: 1024, tufts: 0.7, trees: 0.85, shadowDist: 14 },
  high: { pixelRatio: 1.5, shadows: true, shadowMap: 2048, tufts: 0.75, trees: 0.78, shadowDist: 16, bloom: true },
};

export const DIFFICULTY = {
  easy: { name: '易', taken: 0.6, regen: 8, attackers: 2, aim: 0.7, perma: false, note: '受ける傷が少なく、回復も早い' },
  normal: { name: '普通', taken: 1, regen: 5, attackers: 3, aim: 0.45, perma: false, note: '重傷を負うと後送され、宿で休む必要がある' },
  hard: { name: '難', taken: 1.3, regen: 3, attackers: 4, aim: 0.3, perma: true, note: '重傷はそのまま討死。やり直しはきかない' },
};
