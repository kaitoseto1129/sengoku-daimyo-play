import { isTouch } from './touch.js';
import * as THREE from 'three';
import { sfx } from './audio.js';
import { RANKS, ITEMS, rankLabel } from './state.js';
import { commandList, ORDER_NAME, FORM_NAME, RADIAL, GROUP_NAME } from './player.js';
import { S, K } from './settings.js';
import { drawMon } from './textures.js';
import { GENERALS } from './units.js';

// 組の数の札の色：3Dの隊旗の札・戦術マップ・部隊の帯で同じ色（白＝十分、黄＝減った、朱＝半ばより多く失った）
export const TAG_COL = { ok: '#ece4d2', mid: '#d8b04a', low: '#c0452e', gone: '#5a534a' };
export function tagOf(g) {
  const n = g.count, n0 = g.initial || n || 1;
  if (!n || g.routed) return 'gone';
  const r = n / n0;
  return r >= 0.7 ? 'ok' : r >= 0.4 ? 'mid' : 'low';
}
// 隊を率いる名のある武将（いなければ null）
export function groupGeneral(g) {
  for (const u of g.units) if (u.alive && u.name && !u.isSub && (u.type === 'busho' || GENERALS[u.name.replace(/^.* /, '')])) return u;
  return null;
}
// 敵方の家紋（遠景の大軍の敵味方を、軍配 gunbai.js と同じく家紋で見分ける）
const ENEMY_MON = new Set(['takeda', 'akazonae', 'furin', 'imagawa', 'saito', 'azai', 'asakura', 'otani', 'ishida', 'shimazu', 'toyotomi', 'ukita', 'sanada', 'konishi', 'chosokabe', 'hikyaku']);
// 隊の種類（遠目の見分け）：本陣・鉄砲・騎馬・弓・槍
export function groupKind(g) {
  if (g.isPlayerSquad) return g.kind || 'spear';
  if (groupGeneral(g)) return 'honjin';
  if (g.isGun) return 'gun';
  if (g.cav) return 'cavalry';
  let b = 0, n = 0;
  for (const u of g.units) { if (!u.alive) continue; n++; if (u.type === 'bow') b++; }
  return n && b >= n * 0.6 ? 'bow' : 'spear';
}
// 号令の小さな印（部隊の帯・号令の輪）
// 似た知らせの束（同じ束の知らせは、どれか一つが出たら 30 秒は出さない）
const BARK_FAMILY = [
  [/騎馬.*(止ま|止め)/, 'cavstop'], [/崩れ(て|た).*(逃げ|退)|敵が逃げ/, 'rout'], [/矢が来る|矢の雨/, 'arrow'], [/鉄砲.*(狙|来る)/, 'gun'],
  [/組頭を討ち取った/, 'leader'], [/持たぬ|押されておる|下がれ、下がれ/, 'waverA'], [/崩れるぞ|だめじゃ、逃げろ|持ちこたえられぬ/, 'waverB'],
  // 横腹の進み具合（1/6・2/6…）は、どの隊の物でも一つの束に。間を 10 秒あける
  [/横腹を突いている/, 'flank', 10], [/向き直って|気づいた/, 'turn'],
];
const ORDER_MARK = { follow: '従', hold: '待', attack: '突', retreat: '退', focus: '狙', move: '進', yari: '衾', flee: '崩', path: '進', assault: '攻' };
// 部隊の帯の顔：墨で描いた兵の半身（陣笠・兜）と、うすく家紋
const FACE_CACHE = new Map();
function faceCanvas(kind, mon) {
  const key = kind + '|' + mon;
  if (FACE_CACHE.has(key)) return FACE_CACHE.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  // 和紙の地にうすく家紋
  g.fillStyle = '#d9cfb6'; g.fillRect(0, 0, 96, 96);
  const vg = g.createRadialGradient(48, 44, 20, 48, 48, 70); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(60,44,24,.45)');
  g.fillStyle = vg; g.fillRect(0, 0, 96, 96);
  // 半身の影
  g.fillStyle = '#1a1510';
  g.beginPath(); g.moveTo(10, 96); g.quadraticCurveTo(14, 66, 48, 64); g.quadraticCurveTo(82, 66, 86, 96); g.fill();
  g.beginPath(); g.ellipse(48, 50, 13, 15, 0, 0, 7); g.fill();
  const gen = kind === 'honjin' || kind === 'cavalry';
  if (gen) {
    // 兜：鉢・しころ・前立（本陣は金の鍬形）
    g.beginPath(); g.ellipse(48, 40, 17, 12, 0, Math.PI, 0); g.fill();
    g.beginPath(); g.moveTo(26, 44); g.lineTo(70, 44); g.lineTo(76, 54); g.lineTo(20, 54); g.closePath(); g.fill();
    g.strokeStyle = kind === 'honjin' ? '#c9a24a' : '#8a7a5a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(48, 32); g.quadraticCurveTo(36, 20, 30, 10); g.moveTo(48, 32); g.quadraticCurveTo(60, 20, 66, 10); g.stroke();
  } else {
    // 陣笠
    g.beginPath(); g.moveTo(16, 44); g.quadraticCurveTo(48, 20, 80, 44); g.quadraticCurveTo(48, 38, 16, 44); g.fill();
  }
  // 得物：槍・弓・鉄砲
  g.strokeStyle = '#1a1510'; g.lineWidth = 3;
  if (kind === 'spear' || kind === 'honjin') { g.beginPath(); g.moveTo(80, 96); g.lineTo(88, 6); g.stroke(); g.fillStyle = '#1a1510'; g.beginPath(); g.moveTo(88, 0); g.lineTo(91, 10); g.lineTo(85, 10); g.fill(); }
  else if (kind === 'bow') { g.beginPath(); g.moveTo(84, 8); g.quadraticCurveTo(70, 50, 84, 92); g.stroke(); g.lineWidth = 1; g.beginPath(); g.moveTo(84, 8); g.lineTo(84, 92); g.stroke(); }
  else if (kind === 'gun') { g.lineWidth = 4; g.beginPath(); g.moveTo(58, 90); g.lineTo(90, 20); g.stroke(); }
  else if (kind === 'cavalry') { g.lineWidth = 3; g.beginPath(); g.moveTo(6, 92); g.lineTo(26, 20); g.stroke(); }
  // 胸に家紋の丸
  g.save(); g.beginPath(); g.arc(48, 82, 11, 0, 7); g.clip();
  const sc = 11 * 0.95 / (96 * 0.34);
  g.translate(48 - 48 * sc, 82 - 288 * 0.32 * sc); g.scale(sc, sc); drawMon(g, mon, 96, 288);
  g.restore();
  const url = c.toDataURL();
  FACE_CACHE.set(key, url);
  return url;
}
// 顔の絵は、鍵ごとに一度だけ CSS の決まり（.face.f3 など）にして、札の HTML には短い名だけを書く
// （札を作り直すたびに長い data: の字を比べ・読み直さない。戦の始めのコマ落ちを減らす）
const FACE_CLS = new Map();
function faceCls(kind, mon) {
  const key = kind + '|' + mon;
  let c = FACE_CLS.get(key);
  if (c) return c;
  c = 'f' + FACE_CLS.size;
  FACE_CLS.set(key, c);
  let st = document.getElementById('face-css');
  if (!st) { st = document.createElement('style'); st.id = 'face-css'; document.head.appendChild(st); }
  st.sheet.insertRule(`#h-units .face.${c} { background-image: url(${faceCanvas(kind, mon)}); }`, st.sheet.cssRules.length);
  return c;
}
// 凡例の小さな隊旗
const STD_SVG = {
  spear: '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M3 20V1" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="1" width="5" height="11" fill="currentColor"/></svg>',
  gun: '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M3 20V5" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="5" width="9" height="8" fill="currentColor"/></svg>',
  cavalry: '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M3 20V1" stroke="currentColor" stroke-width="1.6"/><path d="M3 1L15 2.5V4L3 6Z" fill="currentColor"/></svg>',
  honjin: '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M3 20V0" stroke="currentColor" stroke-width="2"/><rect x="3" y="0" width="8" height="13" fill="currentColor"/></svg>',
};
const KIND_WORD = { spear: '槍', bow: '弓', gun: '鉄砲', cavalry: '騎馬', honjin: '本陣' };

// 筆で掃いた朱の帯（見出しの下地）を一度だけ描いておく
let BRUSH = '';
function brushImage() {
  if (BRUSH) return BRUSH;
  const c = document.createElement('canvas');
  c.width = 900; c.height = 180;
  const g = c.getContext('2d');
  for (let i = 0; i < 70; i++) {
    const y = 40 + Math.random() * 100;
    const x0 = 20 + Math.random() * 60, x1 = 820 + Math.random() * 60;
    g.strokeStyle = `rgba(${150 + Math.random() * 40},${30 + Math.random() * 20},${20 + Math.random() * 10},${0.25 + Math.random() * 0.35})`;
    g.lineWidth = 6 + Math.random() * 22;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x0, y);
    g.bezierCurveTo(300, y + (Math.random() - 0.5) * 30, 600, y + (Math.random() - 0.5) * 30, x1, y + (Math.random() - 0.5) * 16);
    g.stroke();
  }
  // かすれ
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; g.fillRect(Math.random() * 900, Math.random() * 180, 2 + Math.random() * 14, 1 + Math.random() * 2); }
  BRUSH = c.toDataURL();
  return BRUSH;
}

// 筆で引いた細い線の形（体力・気力・敵将の棒のマスク）。一度だけ描いて CSS の --fude に渡す
// 左の入りは太く、右へ細り、ところどころかすれる。棒の中の色（朱・和紙）はこの形で切り抜かれる
let FUDE = '';
function fudeImage() {
  if (FUDE) return FUDE;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  for (let x = 0; x < 256; x++) {
    const t = x / 255;
    // 入り（左 4%）は丸く、抜き（右 6%）はすっと細る
    const head = Math.min(1, t / 0.04), tail = Math.min(1, (1 - t) / 0.06);
    const h = 7.5 * (1 - 0.3 * t) * Math.sqrt(Math.min(head, tail)) + Math.sin(x * 0.37) * 0.35;
    const y = 8 + Math.sin(x * 0.05) * 0.5;
    g.globalAlpha = 0.82 + 0.18 * Math.abs(Math.sin(x * 1.7));
    g.fillRect(x, y - h, 1, h * 2);
  }
  // かすれ：筆の毛の筋を細く抜く（右ほど多い）
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {
    const x = Math.pow(Math.random(), 0.6) * 256;
    g.globalAlpha = 0.25 + Math.random() * 0.5;
    g.fillRect(x, 3 + Math.random() * 10, 6 + Math.random() * 30, 0.8);
  }
  FUDE = c.toDataURL();
  return FUDE;
}

// 札の小さな絵（線画）
const ICON = {
  spear: '<svg viewBox="0 0 24 24"><path d="M4 20 L18 6"/><path d="M18 6 L21 3 L20 7 Z" fill="#e9dcb8"/><path d="M6 16 L8 18"/></svg>',
  sword: '<svg viewBox="0 0 24 24"><path d="M5 19 L19 5"/><path d="M4 16 L8 20"/><path d="M3 21 L5 19"/></svg>',
  cmd: '<svg viewBox="0 0 24 24"><path d="M6 20 L12 10"/><path d="M12 10 C 9 6, 11 2, 15 3 C 20 4, 20 10, 15 11 C 13 11.5, 12 10, 12 10 Z"/></svg>',
  quick: '<svg viewBox="0 0 24 24"><path d="M4 12 H20"/><path d="M14 6 L20 12 L14 18"/></svg>',
  rally: '<svg viewBox="0 0 24 24"><path d="M4 10 C 8 4, 16 4, 20 8 L 18 16 C 14 13, 9 14, 6 17 Z"/><path d="M4 10 L2 12"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2 V6 M12 18 V22 M2 12 H6 M18 12 H22"/></svg>',
  dodge: '<svg viewBox="0 0 24 24"><path d="M4 16 C 8 6, 16 6, 20 12"/><path d="M17 9 L20 12 L16 13"/></svg>',
  gun: '<svg viewBox="0 0 24 24"><path d="M3 15 L19 7"/><path d="M5 14 L4 19 L8 17"/><path d="M11 12 L12 15"/></svg>',
  bow: '<svg viewBox="0 0 24 24"><path d="M7 3 C 17 8, 17 16, 7 21"/><path d="M7 3 L7 21"/><path d="M4 12 H18"/></svg>',
  horse: '<svg viewBox="0 0 24 24"><path d="M5 20 L7 13 C 7 10, 10 9, 13 9 L 16 5 L 18 6 L 17 9 C 19 10, 19 13, 17 14 L 16 20"/><path d="M9 20 L10 15"/></svg>',
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 札の字：キーの名前は鍵の形、指の端末では「突く」などの丸の名前を丸の形で見せる
const TOUCH_BTN = /「(突く|構え|回避|号令|取る|狙い|鼓舞|持替|地図|止める|乗る|降りる|手綱|視点)」/g;
function keyCaps(t) {
  let s = esc(t);
  if (isTouch) return s.replace(TOUCH_BTN, (m, b) => `<span class="tbtn">${b}</span>`);
  return s.replace(/(^|[\s（(／・、。])((?:[A-Z]|Tab|Shift|Space|Enter|Esc|F1|Alt)(?:\s(?:[A-Z]))*)(?=[\s）)／・で、。をのか]|$)/g, (m, a, b) => `${a}${b.split(' ').map((k) => `<kbd class="cap">${k}</kbd>`).join('')}`);
}
// 手ほどきの札の見た目（index.html の #tutorial を上書き）
// 緊迫の見せ方（画面の縁）：深手のにじみ・狙われている赤い脈・倒れる寸前の一撃。兵力の帯の「敵は何倍」
function tensionCss() {
  if (document.getElementById('tension-css')) return;
  const st = document.createElement('style');
  st.id = 'tension-css';
  st.textContent = `
#vignette.dying { backdrop-filter: blur(2.5px) saturate(.55); -webkit-backdrop-filter: blur(2.5px) saturate(.55); -webkit-mask-image: radial-gradient(ellipse 62% 58% at 50% 50%, transparent 55%, #000 100%); mask-image: radial-gradient(ellipse 62% 58% at 50% 50%, transparent 55%, #000 100%); animation: dyingPulse .95s ease-in-out infinite; }
@keyframes dyingPulse { 0%, 100% { box-shadow: inset 0 0 200px rgba(120,10,2,.62); } 18% { box-shadow: inset 0 0 260px rgba(150,14,4,.8); } }
#aimwarn { position: absolute; inset: 0; pointer-events: none; opacity: 0; background: radial-gradient(ellipse 78% 74% at 50% 50%, transparent 58%, rgba(92,16,6,.34) 82%, rgba(52,8,2,.66) 100%); transition: opacity .5s; }
#aimwarn.on { opacity: 1; animation: aimPulse 1.1s ease-in-out infinite alternate; }
@keyframes aimPulse { from { opacity: .55; } to { opacity: 1; } }
#brinkfx { position: absolute; inset: 0; pointer-events: none; opacity: 0; background: radial-gradient(ellipse at center, rgba(90,0,0,.15) 30%, rgba(40,0,0,.92) 100%); }
#brinkfx.on { animation: brinkA 1.6s ease-out; }
@keyframes brinkA { 0% { opacity: 1; background-color: rgba(255,240,230,.35); } 8% { background-color: rgba(0,0,0,0); } 100% { opacity: 0; } }
body.rm #vignette.dying { animation: none; box-shadow: inset 0 0 220px rgba(130,12,4,.7); }
body.rm #aimwarn.on { animation: none; }
#encircle { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .9s; -webkit-mask-image: radial-gradient(ellipse 72% 72% at 50% 50%, transparent 56%, rgba(0,0,0,.55) 80%, #000 100%); mask-image: radial-gradient(ellipse 72% 72% at 50% 50%, transparent 56%, rgba(0,0,0,.55) 80%, #000 100%); }
#encircle.on { opacity: 1; }
#hud.photo #encircle, #hud.photo #aimwarn, #hud.photo #brinkfx { display: none; }
#armybar .outnum { color: #ff8a70; font-weight: 700; margin: 0 6px; letter-spacing: .04em; }
`;
  document.head.appendChild(st);
}

function coachCss() {
  if (document.getElementById('coach-css')) return;
  const st = document.createElement('style');
  st.id = 'coach-css';
  st.textContent = `
#hud #tutorial.coach { left: calc(20px + env(safe-area-inset-left, 0px)); top: 34%; width: 272px; box-sizing: border-box; padding: 10px 14px 11px; background: rgba(12,10,8,.84); box-shadow: inset 0 0 0 1px var(--gold-line); border-left: 3px solid var(--kin); line-height: 1.55; font-size: 14px; }
#hud #tutorial.coach .lbl { display: flex; justify-content: space-between; font-size: 12px; letter-spacing: .2em; color: var(--kin); margin-bottom: 3px; }
#hud #tutorial.coach .lbl b { font-weight: 500; letter-spacing: .05em; color: var(--washi-dim); }
#hud #tutorial.coach p { margin: 0; display: block; }
#hud #tutorial.coach .what { font-family: var(--display); font-size: 18px; color: var(--washi); letter-spacing: .06em; }
#hud #tutorial.coach .lbl + .what:not(:last-child) { margin-bottom: 2px; }
#hud #tutorial.coach .what.ok { color: #f0d488; }
#hud #tutorial.coach .what.sm { font-family: var(--ui); font-size: 15px; letter-spacing: 0; }
#hud #tutorial.coach .what.ok i { font-style: normal; margin-right: 8px; }
#hud #tutorial.coach .how { font-size: 14px; color: #ddd4c0; }
#hud #tutorial.coach kbd.cap { font-size: 12px; }
#hud #tutorial.coach .tbtn { display: inline-grid; place-items: center; min-width: 2.6em; height: 1.9em; margin: 0 2px; padding: 0 6px; box-sizing: border-box; border-radius: 1em; border: 1.5px solid rgba(194,162,90,.7); background: rgba(14,11,8,.7); font-size: 13px; font-weight: 700; color: var(--washi); vertical-align: middle; }
#hud #tutorial.coach.in { animation: coachIn .22s ease-out; }
@keyframes coachIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
body.rm #hud #tutorial.coach.in { animation: none; }
@media (prefers-reduced-motion: reduce) { #hud #tutorial.coach.in { animation: none; } }
/* 携帯の横向き：左上の釦と戦功の札の下、歩く棒の上に小さく */
@media (max-height: 500px) {
  #hud #tutorial.coach { top: calc(128px + env(safe-area-inset-top, 0px)); left: calc(76px + env(safe-area-inset-left, 0px)); width: 236px; padding: 7px 11px 8px; }
  #hud #tutorial.coach .what { font-size: 16px; }
  #hud #tutorial.coach .how { font-size: 13px; }
  #hud #tutorial.coach .what.sm { font-size: 14px; }
}`;
  document.head.appendChild(st);
}

// スマホ横で「画面の札の量：最小」の時は、戦場を見せるのを一番に（字は要る瞬間だけ）
const leanHud = () => isTouch && innerHeight < 500 && (S.hudMode || 'normal') === 'min';

export function moraleWord(m) {
  if (m >= 75) return '意気盛ん';
  if (m >= 50) return '平常';
  if (m >= 30) return '動揺';
  return '崩れかけ';
}

// 任務の進み具合の字から割合を読む（「5/20」「一の門 5%」）。読めなければ null
function progressRatio(s) {
  const f = /(\d+)\s*\/\s*(\d+)/.exec(s);
  if (f && +f[2] > 0) return Math.max(0, Math.min(1, f[1] / f[2]));
  const p = /(\d+)\s*%/.exec(s);
  if (p) return Math.max(0, Math.min(1, p[1] / 100));
  return null;
}

// 狙いの札に添える相手の種類
function kindWord(u) {
  if (u.mounted || u.type === 'cavalry') return '騎馬';
  return { ashigaru: '槍', samurai: '侍', busho: '武将', bow: '弓', gun: '鉄砲', porter: '人足', dummy: '稽古' }[u.type] || '';
}

function typeName(u) {
  if (u.name) return u.name;
  return { ashigaru: '敵足軽', samurai: '敵侍', busho: '敵武将', bow: '敵弓兵', gun: '敵鉄砲足軽', cavalry: '敵騎馬', dummy: '藁人形', porter: '人足' }[u.type] || '敵';
}

export class Hud {
  constructor() {
    this.root = $('hud');
    this.subQ = [];
    this.subT = 0;
    this.log = [];
    this.objKey = '';
    this.markerEls = new Map();
    this.threatEls = [];
    this.mmT = 0;
    this.hurtT = 0;
    this.bigmap = false;
    this.bannerQ = [];
    this.bannerT = 0;
    this.lastToast = null;
    this.tmpV = new THREE.Vector3();
    this.slowT = 0;
    // 筆の線の形を CSS へ（index.html の「墨の HUD」が使う）
    try { this.root.style.setProperty('--fude', `url(${fudeImage()})`); } catch (e) { /* 描けない時はただの細い線 */ }
    // 任務の札：低い画面で「ほか n 件」を押すと、全部の任務を 6 秒だけ開く
    const ob = $('objectives');
    if (ob) ob.addEventListener('click', () => { ob.classList.add('expand'); clearTimeout(this.objExpT); this.objExpT = setTimeout(() => ob.classList.remove('expand'), 6000); });
    // 部隊の帯：札を押すと、その隊を号令先に選ぶ（もう一度押すと全隊）
    const hu = $('h-units');
    if (hu) hu.addEventListener('click', (e) => { const b = e.target.closest('button[data-sel]'); if (b) this.pickGroup(b.dataset.sel); });
    // Alt＋数字（号令の輪を開いている間は数字だけ）でも選ぶ。武器の持ち替え（1・2）より先に受け取る
    window.addEventListener('keydown', (e) => {
      const rt = this.rt;
      if (!rt || !rt.squadGroups || this.root.hidden || !rt.player) return;
      const m = /^Digit([0-9])$/.exec(e.code);
      if (!m || !(e.altKey || rt.player.radial)) return;
      const kinds = this.unitKinds || [];
      if (kinds.length < 2) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      const n = +m[1];
      if (n === 0) this.pickGroup('all');
      else if (kinds[n - 1]) this.pickGroup(kinds[n - 1]);
    }, true);
  }

  // 号令先の隊を選ぶ（G の切り替えと同じ働き。選んだ隊をもう一度選ぶと全隊に戻す）
  pickGroup(k) {
    const rt = this.rt;
    if (!rt || !rt.player || !(this.unitKinds || []).length) return;
    const p = rt.player;
    p.selGroup = k !== 'all' && p.selGroup === k ? 'all' : k;
    this.flash(p.selGroup === 'all' ? '全隊に号令' : `${GROUP_NAME[p.selGroup] || '組'}に号令`, 'dim');
    if (p.cmdOpen) p.cmdOpenT = 0;
    if (rt.tutMark) rt.tutMark('group');
    this.unitsKey = '';
  }

  // 部隊の帯（画面の右下）：自分の組の隊ごとの札と、名のある味方の武将の隊の札
  // 札：率いる者の姿（墨の半身と家紋）、士気の輪（減ると欠ける）、兵の数の札（戦場の隊旗の札と同じ色）、いまの号令の印
  updateUnits(rt) {
    const el = $('h-units');
    if (!el) return;
    const p = rt.player;
    const own = rt.squadGroups.filter((g) => g.count > 0);
    const kinds = [];
    for (const g of own) if (!kinds.includes(g.kind)) kinds.push(g.kind);
    this.unitKinds = kinds;
    // 名のある味方の武将の隊（近い順に三つまで）
    const pu = p.u.pos;
    rt.allyT = (rt.allyT || 0) - 0.2;
    if (rt.allyT <= 0) {
      rt.allyT = 2;
      rt.allyGroups = rt.army.groups.filter((g) => g.team === 0 && !g.isPlayerSquad && g.count > 0 && groupGeneral(g) && groupGeneral(g).name)
        .map((g) => ({ g, d: Math.hypot(g.center().x - pu.x, g.center().z - pu.z) })).sort((a, b) => a.d - b.d).slice(0, 3).map((x) => x.g);
    }
    // 名のある味方の札は、組を率いる身分（か大名）から。足軽の時は号令できないので出さない
    const allies = own.length || rt.G.lordTitle ? (rt.allyGroups || []).filter((g) => g.count > 0) : [];
    if (!own.length && !allies.length) { el.hidden = true; this.unitsKey = ''; return; }
    el.hidden = false;
    const mon = rt.def.sides ? rt.def.sides.a.mon : 'tokugawa';
    const ring = (m) => {
      const c = 2 * Math.PI * 30, v = Math.max(0, Math.min(100, m)) / 100 * c;
      const col = m >= 55 ? '#8fb06a' : m >= 30 ? '#d8b04a' : '#d0573e';
      return `<svg class="ring" viewBox="0 0 68 68" aria-hidden="true"><circle cx="34" cy="34" r="30" class="bg"/><circle cx="34" cy="34" r="30" class="mo" style="stroke:${col}" stroke-dasharray="${v.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 34 34)"/></svg>`;
    };
    const many = kinds.length > 1;
    const cards = [];
    if (many) cards.push({ k: 'all', html: `<button type="button" class="uc all ${p.selGroup === 'all' ? 'on' : ''}" data-sel="all" aria-pressed="${p.selGroup === 'all'}" aria-label="全隊に号令する${isTouch ? '' : '（Alt＋0）'}"><b>全</b><span class="nm">全隊</span><kbd>0</kbd></button>` });
    for (const k of kinds) {
      const gs = own.filter((g) => g.kind === k);
      const n = gs.reduce((a, g) => a + g.count, 0);
      const mor = gs.reduce((a, g) => a + g.morale, 0) / gs.length;
      const g0 = gs[0];
      const ord = g0.pending ? g0.pending.id : g0.focus ? 'focus' : g0.order;
      const sel = many && (p.selGroup === 'all' || p.selGroup === k);
      const tg = tagOf(g0);
      const i = kinds.indexOf(k) + 1;
      const nm = many ? GROUP_NAME[k] || '組' : '自分の組';
      // 鉄砲の組は、込め終えて撃てる数（込めている者は u.reload を持つ）
      const guns = k === 'gun' ? gs.reduce((a, g) => a + g.units.filter((x) => x.alive && x.type === 'gun').length, 0) : 0;
      const ready = k === 'gun' ? gs.reduce((a, g) => a + g.units.filter((x) => x.alive && x.type === 'gun' && !x.reload).length, 0) : 0;
      const lbl = `${nm} ${n}人 士気${moraleWord(mor)} 号令${ORDER_NAME[ord] || ''}${g0.pending ? '（使番が伝えに走っている）' : ''}${guns ? ` 込め終わり${ready}／${guns}` : ''}`;
      const inner = `<span class="face ${faceCls(k, mon)} ${mor < 30 ? 'waver' : ''}"></span>${ring(mor)}` +
        `<i class="ord ${g0.pending ? 'pend' : ''}" aria-hidden="true">${ORDER_MARK[ord] || '・'}</i>${g0.pending ? `<i class="runner" aria-hidden="true" title="使番が走っている">使 ${Math.max(1, Math.ceil(g0.pending.t))}</i>` : ''}<i class="cnt" style="box-shadow:inset 4px 0 0 ${TAG_COL[tg]}, 0 0 0 1px #000" aria-hidden="true">${n}</i>` +
        `<span class="nm">${esc(nm)}</span>${many ? `<kbd aria-hidden="true">${i}</kbd>` : ''}` +
        (guns ? `<i class="ready" aria-hidden="true" title="込め終わり">${ready}/${guns}</i>` : '');
      cards.push({ k, html: many ? `<button type="button" class="uc own ${sel ? 'on' : ''}" data-sel="${k}" aria-pressed="${sel}" aria-label="${esc(lbl)}${isTouch ? '' : `（Alt＋${i}）`}">${inner}</button>` : `<div class="uc own solo" role="img" aria-label="${esc(lbl)}">${inner}</div>` });
    }
    for (const g of allies) {
      const gen = groupGeneral(g);
      if (!gen || !gen.name) continue;   // 武将が討たれても隊が残る時がある
      const full = gen.name.replace(/^.* /, '');
      // 札に収まらない五字以上の名は、下の名（「藤吉郎」）で。読み上げには全部の名
      // 背の低い指の画面（札が細い）では、四字の名も下の名二字（「信長」「光秀」）に
      const nm = full.length >= 5 ? full.slice(-3) : full.length === 4 && isTouch && innerHeight <= 500 ? full.slice(-2) : full;
      const fighting = g.units.some((u) => u.alive && (u.target || u.atk));
      const st = g.routed ? '潰走' : g.order === 'retreat' || g.order === 'flee' ? '退く' : fighting ? '交戦' : g.order === 'move' || g.order === 'path' ? '進む' : '控え';
      const gm = (GENERALS[full] || {}).mon || mon;
      cards.push({ k: 'a' + g.id, html: `<div class="uc ally ${fighting ? 'fight' : ''} ${g.routed || st === '退く' ? 'back' : ''}" role="img" aria-label="${esc(full)}の隊 ${g.count}人 ${st}">` +
        `<span class="face ${faceCls('honjin', gm)} ${g.morale < 30 ? 'waver' : ''}"></span>${ring(g.morale)}<i class="cnt ally" aria-hidden="true">${g.count}</i>` +
        `<span class="nm ${nm.length >= 5 ? 'long' : ''}">${esc(nm)}</span><span class="st">${st}</span></div>` });
    }
    const key = cards.map((c) => c.html).join('');
    if (key === this.unitsKey) return;
    this.unitsKey = key;
    el.innerHTML = key;
    el.setAttribute('aria-label', many ? '部隊（札を押すか Alt＋数字で号令先を選ぶ）' : '部隊');
    // 下の札（槍・打刀・指揮…）と重ならないよう、右の空きに収めて足りなければ上へ折り返す
    // 指の端末では下の札が無いので、幅は CSS（右下の丸に掛からない幅）に任せる
    if (isTouch) { el.style.maxWidth = ''; return; }
    const hb = $('h-bottom').getBoundingClientRect();
    el.style.maxWidth = Math.max(160, window.innerWidth - (hb.right || 0) - 32) + 'px';
  }


  show(on) {
    this.root.hidden = !on;
    if (!on) { const cv = $('overlay'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }
  }

  // 開戦の大見出し（◯◯軍 VS ◯◯軍）と上下の黒帯
  intro(sides, name, date) {
    const el = $('intro');
    el.hidden = false;
    // 映画の題の札のように：日付を小さく、戦の名を墨の字で、下に両軍の名を「対」で。派手な色・VS の字は使わない
    el.innerHTML = `<div class="card"><div class="date">${esc(date)}</div><div class="ttl">${esc(name)}</div><i class="rule" aria-hidden="true"></i><div class="sides">${esc(sides.a.name)}<em>対</em>${esc(sides.b.name)}</div></div>`;
    $('cine').classList.add('on');
    clearTimeout(this.introT);
    // 動きを減らす時は動かさずに 3 秒だけ見せる
    const rm = S.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.introT = setTimeout(() => { el.hidden = true; $('cine').classList.remove('on'); }, rm ? 3000 : 4600);
  }

  // 大事な瞬間（名乗り・名のある武将の討死）に、上下の細い黒帯を t 秒だけ（映画の一場面のように）。動きを減らす設定では出さない
  // 開戦の見せ場の間だけ、題の札が出ていても上下の黒い帯を出し、画面の札を消す（cineFlash の 20 秒の間隔とは別）
  shotBars(t = 4.5) {
    if (S.reduceMotion) return;
    $('cine').classList.add('on');
    clearTimeout(this.cineT);
    this.cineT = setTimeout(() => $('cine').classList.remove('on'), t * 1000);
  }

  cineFlash(t = 2.5) {
    if (S.reduceMotion || !$('intro').hidden) return;
    // 続けて何度も出すと映画の間にならないので、20 秒に一度まで
    const now = performance.now();
    if (now - (this.cineAt || -1e9) < 20000) return;
    this.cineAt = now;
    $('cine').classList.add('on');
    clearTimeout(this.cineT);
    this.cineT = setTimeout(() => { if ($('intro').hidden) $('cine').classList.remove('on'); }, t * 1000);
  }

  reset() {
    this.subQ = []; this.subT = 0; this.objKey = ''; this.log = []; this.doneAt = new Map(); this.subDrop = false;
    this.armyGhost = null; this.moveMarks = []; this.unitsKey = ''; this.radialKey = ''; this.rt = null;
    if ($('h-units')) $('h-units').hidden = true;
    this.armyKey = '';
    this.bannerQ = []; this.bannerT = 0; this.lastToast = null;
    this.barkSeen = new Map(); this.barkTimes = [];
    this.hintCur = null; this.tutCur = null; this.cardKey = ''; clearTimeout(this.hintTimer);
    for (const id of ['subtitle', 'toasts', 'markers', 'bark', 'threats']) $(id).innerHTML = '';
    this.markerEls.clear();
    this.threatEls = [];
    for (const id of ['cmdpanel', 'prompt', 'bigmap', 'hint', 'sublog', 'target', 'flash', 'intro', 'armybar', 'radial', 'combo', 'killmark', 'staring', 'skiphint', 'situation', 'maphint', 'cheat', 'tutorial', 'choice']) $(id).hidden = true;
    $('floats').innerHTML = ''; this.floats = [];
    this.ghost = undefined; this.calmT = 0;
    $('cine').classList.remove('on');
    this.bigmap = false;
    this.applySettings();
  }

  applySettings() {
    this.root.dataset.sub = S.subSize;
    // HUD の部品ごとの出し入れ
    for (const [k, cls] of [['hudMinimap', 'no-minimap'], ['hudCompass', 'no-compass'], ['hudArmy', 'no-army'], ['hudSquad', 'no-squad'], ['hudBottom', 'no-bottom'], ['hudObjectives', 'no-objectives']]) this.root.classList.toggle(cls, !S[k]);
    document.body.classList.toggle('mincho', S.fontBody === 'mincho');
    // 「小」でも 12px の字が 11px を割らないように（0.88 → 0.94）
    this.root.style.zoom = { s: 0.94, m: 1, l: 1.15 }[S.uiScale] || 1;
    document.body.classList.toggle('ca', !!S.colorAssist);
    // 動きを減らす：ゲームの設定か、OS の「視差効果を減らす」
    document.body.classList.toggle('rm', !!S.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches);
    $('fps').hidden = !S.showFps;
  }

  // 台詞の読み上げ（ブラウザの音声合成。日本語の声があるときだけ）
  speak(speaker, text) {
    if (S.voice === 'off' || !window.speechSynthesis) return;
    const major = /信長|源八|大沢|藤吉郎|義元|日比野|稲田|師範|可成|光秀|利家|秀吉|磯野|豪盛/.test(speaker || '');
    if (S.voice === 'major' && !major) return;
    if (!speaker) return;
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/[「」（）]/g, ''));
      u.lang = 'ja-JP'; u.rate = S.voiceRate; u.volume = Math.min(1, S.volume * 1.1);
      const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.startsWith('ja'));
      if (v) u.voice = v;
      // 人ごとの声の高さと速さ（源八は低くゆっくり、藤吉郎は高く速く、若い者は少し高く）
      const V = [[/藤吉郎|秀吉/, 1.25, 1.12], [/信長/, 0.9, 1.05], [/源八|大沢|師範|可成/, 0.8, 0.92], [/光秀/, 0.95, 0.95], [/利家/, 1.05, 1.05], [/弥七|与兵衛|足軽/, 1.1, 1.05], [/義元|豪盛|磯野/, 0.85, 0.95]];
      const v2 = V.find(([re]) => re.test(speaker));
      u.pitch = v2 ? v2[1] : 1;
      u.rate = S.voiceRate * (v2 ? v2[2] : 1);
      speechSynthesis.speak(u);
    } catch (e) { /* 読み上げできない環境 */ }
  }

  say(speaker, text, dur = 4) {
    // 長い台詞ほど長く出す。読み上げる時は、声が言い終わるまで出しておく（1 秒に 7 字ほど）
    dur = Math.max(dur, 1.2 + text.length * 0.11);
    if (S.voice !== 'off' && speaker && window.speechSynthesis) dur = Math.max(dur, 0.8 + text.length / (7 * (S.voiceRate || 1)));
    this.subQ.push({ speaker, text, dur });
    this.log.push({ speaker, text });
    if (this.log.length > 40) this.log.shift();
    // 溜まりすぎた台詞は間を捨てる。捨てた事は字幕の下に添えて、会話の記録で読めると伝える
    // 溜まってきたら、待っている台詞を少しずつ速めて出す（捨てるのは、それでも七つを超えた時だけ）
    if (this.subQ.length > 2) for (const q of this.subQ) q.dur = Math.max(1.4, Math.min(q.dur, 1 + q.text.length * 0.07));
    if (this.subQ.length > 7) { this.subQ.splice(1, this.subQ.length - 7); this.subDrop = true; }
    if (!$('sublog').hidden) this.renderLog();
  }

  // いまの台詞を読み終えたことにして、次の台詞へ
  nextSub() { if (this.subT > 0.15) this.subT = 0.15; }

  renderLog() {
    $('sublog').innerHTML = `<h5>会話の記録<span>${isTouch ? '押して閉じる' : `<kbd class="cap">${esc(K('log'))}</kbd> で閉じる`}</span></h5>` + this.log.slice(-14).map((l) => `<div>${l.speaker ? `<span class="sp">${esc(l.speaker)}</span>` : ''}${esc(l.text)}</div>`).join('');
  }

  toggleLog() {
    const el = $('sublog');
    el.hidden = !el.hidden;
    if (!el.hidden) this.renderLog();
  }

  // 戦功の通知（同じ項目が続いたらまとめる）
  toast(pts, label) {
    // 「大事なものだけ」なら小さな戦功は出さない
    if (S.toastLevel === 'important' && pts !== 0 && Math.abs(pts) < 5) return;
    const now = performance.now();
    const lt = this.lastToast;
    if (lt && lt.label === label && now - lt.t < 4000 && lt.el.isConnected) {
      lt.pts += pts; lt.n++; lt.t = now;
      lt.el.innerHTML = `<b>${lt.pts > 0 ? '+' : ''}${lt.pts}</b>${esc(label)} ×${lt.n}`;
      lt.el.style.animation = 'none'; void lt.el.offsetWidth; lt.el.style.animation = '';
      return;
    }
    const el = document.createElement('div');
    // 大きな手柄（敵将・本陣など）は陣太鼓の一打と、少し大きな字で
    const big = pts >= 25;
    if (big) sfx('taiko', 0.55);
    el.className = 'toast' + (pts < 0 ? ' neg' : '') + (pts === 0 ? ' title' : '') + (big ? ' big' : '');
    el.innerHTML = pts === 0 ? `<b>◆</b>${esc(label)}` : `<b>${pts > 0 ? '+' : ''}${pts}</b>${esc(label)}`;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
    setTimeout(() => el.remove(), 2700);
    this.lastToast = { label, pts, n: 1, t: now, el };
  }

  // 大見出し（重ならないよう順番に出す）
  banner(text, sub = '') { this.bannerQ.push({ text, sub }); }

  // 画面中央の短い知らせ（受け流し・気力不足など）
  flash(text, tone = 'gold') {
    // 撃った弾が外れた時は、照準に小さく「外」の印も（字を読まなくても分かるように）
    if (/^外れた/.test(text)) { const ch = $('crosshair'); if (ch) { ch.classList.remove('gmiss'); void ch.offsetWidth; ch.classList.add('gmiss'); } }
    // 断りの字（'dim'：気力が足りない など）は、同じ字を戦の中の 8 秒に一度まで（押し続けても何度も出さない）
    if (tone === 'dim') {
      const now = this.rt ? this.rt.t : performance.now() / 1000;
      if (!this.flashSeen || this.flashRt !== this.rt) { this.flashSeen = new Map(); this.flashRt = this.rt; }
      if (now - (this.flashSeen.get(text) ?? -1e9) < 8) return;
      this.flashSeen.set(text, now);
    }
    const el = $('flash');
    el.hidden = false;
    el.className = 'flash ' + tone;
    el.textContent = text;
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => { el.hidden = true; }, 1100);
  }

  // 部下などの短い声
  // 同じ知らせは 30 秒に一度まで（警告は 12 秒）。似た知らせ（騎馬が止まった・敵が崩れた…）は一つの物として数える。
  // 立て続けの知らせは、警告でないものから間引く（docs/ui-guidelines.md）
  // 出してよい知らせか（出すかどうかだけを見る。記録はしない）。呼ぶ側が先に見て、出さない物は呼ばないようにも使える
  barkOk(text, warn = false) {
    // 間は戦の中の時で数える（機械が重くて戦がゆっくり進む時も、戦の20秒に同じ知らせを何度も出さない）
    const now = this.rt ? this.rt.t * 1000 : performance.now();
    if (!this.barkSeen || this.barkRt !== this.rt) { this.barkSeen = new Map(); this.barkTimes = []; this.barkRt = this.rt; }
    const fam = BARK_FAMILY.find(([re]) => re.test(text));
    const key = fam ? fam[1] : text.replace(/[！!。、…　\s]/g, '');
    const gap = fam && fam[2] ? fam[2] * 1000 : (warn ? 12000 : 30000);
    if (now - (this.barkSeen.get(key) ?? -1e9) < gap) return false;
    this.barkTimes = this.barkTimes.filter((t) => now - t < 4000);
    if (!warn && this.barkTimes.length >= 3) return false;
    return { now, key };
  }
  bark(text, warn = false) {
    const ok = this.barkOk(text, warn);
    if (!ok) return;
    const { now, key } = ok;
    this.barkSeen.set(key, now);
    this.barkTimes.push(now);
    const el = document.createElement('div');
    el.className = 'bk' + (warn ? ' warn' : '');
    el.textContent = text;
    $('bark').appendChild(el);
    while ($('bark').children.length > 3) $('bark').firstChild.remove();
    setTimeout(() => el.remove(), 2200);
  }

  // ヒント：手ほどきと同じ札に出す（札は一度に一つ。ヒントの間は手ほどきを少し休む）
  hint(text, keys) {
    this.hintCur = { text, keys };
    clearTimeout(this.hintTimer);
    // 低い画面（スマホ横）では上の真ん中に短く出して、5 秒で消す
    this.hintTimer = setTimeout(() => { this.hintCur = null; this.drawCard(); }, innerHeight < 500 ? 5000 : 8000);
    this.drawCard();
  }
  hintBusy() { return !!this.hintCur; }

  objNew(text) {
    const el = document.createElement('div');
    el.className = 'objnew';
    el.textContent = '任務更新：' + text;
    $('objectives').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  // 連撃の数
  combo(n) {
    const el = $('combo');
    el.hidden = false;
    el.textContent = `${n} 連撃`;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(this.comboTm);
    this.comboTm = setTimeout(() => { el.hidden = true; }, 1600);
  }

  // 討ち取った印
  killMark() {
    const el = $('killmark');
    el.hidden = false;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(this.killTm);
    this.killTm = setTimeout(() => { el.hidden = true; }, 700);
  }

  // 討った場所に小さく戦功を浮かべる
  floatText(pos, text, neg) {
    if (!S.floatMerit || !pos) return;
    this.floats = this.floats || [];
    const el = document.createElement('div');
    el.className = 'floatm' + (neg ? ' neg' : '');
    el.textContent = text;
    $('floats').appendChild(el);
    this.floats.push({ el, pos: { x: pos.x, y: pos.y, z: pos.z }, t: 0 });
  }

  hitMarker() {
    const c = $('crosshair');
    c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit');
  }

  damageFrom(angle, amount = 8) {
    const el = $('dmgdir');
    // 斬られた側の画面の縁を赤く
    const vg = $('vignette');
    vg.style.setProperty('--hx', `${50 - Math.sin(angle) * 45}%`);
    vg.style.setProperty('--hy', `${50 - Math.cos(angle) * 45}%`);
    vg.classList.remove('side'); void vg.offsetWidth; vg.classList.add('side');
    // 向きは画面の縁の赤み一つで見せる（赤い弧は重ねない）。動きを減らす時も縁の色だけは出る
    void el;
  }

  hurt(v) { this.hurtT = Math.max(this.hurtT, v); }

  // 倒れる寸前の一撃：一瞬白く飛び、闇が画面を覆って引いていく（battle.js の brink から）
  brink() {
    tensionCss();
    let el = $('brinkfx');
    if (!el) { el = document.createElement('div'); el.id = 'brinkfx'; $('vignette').after(el); }
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }

  // 手ほどき：いまの段だけを札に出す
  renderTut(t) { this.tutCur = t; this.drawCard(); }

  // 手ほどき・ヒントの札（左の中ほど。携帯の横向きでも隠さない）
  drawCard() {
    coachCss();
    const el = $('tutorial');
    el.classList.add('coach');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    const h = this.hintCur, t = this.tutCur;
    let html = '';
    if (h) {
      html = `<span class="lbl">ヒント</span><p class="what sm">${keyCaps(h.text)}</p>${h.keys ? `<p class="how">${keyCaps(h.keys)}</p>` : ''}`;
    } else if (t) {
      const n = t.items.filter((x) => x.done).length;
      const it = t.items.find((x) => !x.done);
      const head = `<span class="lbl">${esc(t.title)}<b>${n}/${t.items.length}</b></span>`;
      if (t.ok) html = head + `<p class="what ok"><i aria-hidden="true">✓</i>${esc(t.ok)}　よし</p>`;
      else if (it) html = head + `<p class="what">${esc(it.label)}</p>${it.how ? `<p class="how">${keyCaps(it.how)}</p>` : ''}`;
    }
    const key = html;
    if (key === this.cardKey) return;
    this.cardKey = key;
    el.hidden = !html;
    el.classList.toggle('hintc', !!h);
    el.innerHTML = html;
    // 新しい札は少しだけ動かして気づかせる（動きを減らす設定では動かさない）
    if (html) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
  }

  // 戦の中の選択
  renderChoice(c) {
    const el = $('choice');
    if (!c) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<h5>${esc(c.title)}</h5>` + c.options.map((o, i) => `<div class="opt"><kbd class="cap">${i + 1}</kbd><b>${esc(o.label)}</b><small>${esc(o.note || '')}</small></div>`).join('') + '<div class="tm"><i id="choice-t"></i></div>';
    this.choiceMax = c.t;
  }
  choiceTime(t) { const b = $('choice-t'); if (b) b.style.width = Math.max(0, t / (this.choiceMax || 20) * 100) + '%'; }

  // 操作の早見表（F1）
  toggleCheat() {
    const el = $('cheat');
    el.hidden = !el.hidden;
    if (!el.hidden) el.innerHTML = [['突き', '左クリック（押し続けて離すと溜め突き）'], ['構え', '右クリック（直前で受け流し）'], ['薙ぎ', '構え＋左クリック'], ['回避', K('dodge')], ['狙い', `${K('lock')}（ホイールで相手を替える）`], ['号令', `${K('follow')} ${K('hold')} ${K('attack')} ${K('retreat')}／${K('command')}長押しで輪`], ['鼓舞', K('rally')], ['地図', `${K('map')}（${K('mapzoom')}で縮尺）`], ['視点', `${K('view')}（三人称・一人称。長押しで高くから見渡す）`], ['写真', K('photo')], ['HUD', K('hud')], ['感度', '[ と ]'], ['記録', `${K('log')}（会話の記録）`]].map(([a, b]) => `<div><b>${a}</b>${esc(b)}</div>`).join('');
    if (!el.hidden) el.insertAdjacentHTML('afterbegin', '<h5>操作の早見表<span><kbd class="cap">F1</kbd> で閉じる</span></h5>');
  }

  update(dt, rt) {
    const p = rt.player;
    const u = p.u;
    const G = rt.G;
    // 見出し
    this.bannerT -= dt;
    // 開戦の題の札が出ている間は、見出しを待たせる（重ねない）
    if (this.bannerT <= 0 && this.bannerQ.length && $('intro').hidden) {
      const { text, sub } = this.bannerQ.shift();
      const b = $('banner');
      b.classList.remove('show'); void b.offsetWidth;
      b.innerHTML = `<span class="brush" style="background-image:url(${brushImage()})">${esc(text)}</span>` + (sub ? `<small>${esc(sub)}</small>` : '');
      b.classList.add('show');
      this.bannerT = 2.6;
      // 動きを減らす時は消える動きが無いので、時間で下げる
      clearTimeout(this.bannerOff);
      this.bannerOff = setTimeout(() => { if (!this.bannerQ.length) b.classList.remove('show'); }, 3000);
    }
    this.updateArmy(rt);
    this.updateArmyGhost(dt);
    this.drawOverlay(rt);
    this.updateCompass(rt);
    this.updateRadial(rt);
    // 浮かぶ戦功
    if (this.floats) {
      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i];
        f.t += dt;
        if (f.t > 1.4) { f.el.remove(); this.floats.splice(i, 1); continue; }
        const sp = this.project(f.pos, (f.pos.y || 0) + 2.6 + f.t * 0.8, rt);
        f.el.style.left = sp.x + 'px'; f.el.style.top = sp.y + 'px';
        f.el.style.opacity = sp.behind ? 0 : Math.min(1, (1.4 - f.t) * 2);
      }
    }
    // 平時は周りの札を薄くし、戦いになったらはっきり
    // 敵が 35m 以内に来たら、斬り合う前から札を戻す（0.5 秒ごとに見る）
    this.nearFoeT = (this.nearFoeT || 0) - dt;
    if (this.nearFoeT <= 0) { this.nearFoeT = 0.5; this.nearFoe = !!(u.alive && rt.army.nearestEnemy && rt.army.nearestEnemy(u, 35, (o) => !o.fleeing && o.type !== 'dummy')); }
    const busy = p.inCombatT > 0 || (rt.army.threats || []).length > 0 || p.cmdOpen || p.radial || this.nearFoe;
    this.calmT = busy ? 0 : (this.calmT || 0) + dt;
    // HUD の段（S.hudMode）：'min' 最小＝平時は 2 秒で札を消し、任務・小地図・方角も引っ込める／'full' 全部＝薄めない／無ければ「ふつう」
    const mode = S.hudMode || 'normal';
    this.root.classList.toggle('calm', mode !== 'full' && S.hudAutoFade && this.calmT > (mode === 'min' ? 2 : 6));
    this.root.classList.toggle('hudmin', mode === 'min');
    this.root.classList.toggle('lean', leanHud());
    // 戦が決まった後（勝ち・負け・重傷）は、札を引っ込めて、引いていくカメラの絵と字幕だけにする
    this.root.classList.toggle('ending', !!rt.over);
    // 必要な時だけ出す札：両軍の兵力の帯と日付は、開戦・形勢が変わった時・号令や地図を開いている間だけ（HUD の三つの層の「要る時」）
    this.armyPeekT = (this.armyPeekT || 0) - dt;
    const peek = !S.hudAutoFade || rt.t < 8 || this.armyPeekT > 0 || p.cmdOpen || p.radial || this.bigmap || rt.ended;
    this.root.classList.toggle('army-off', !peek);
    // 初めての戦の手ほどきの間は、方角の帯と小地図を出さない（札は戦功・任務・体力・手ほどきだけで始める）
    this.root.classList.toggle('novice', !!(rt.tut && rt.tut.auto) && !this.bigmap);
    this.root.classList.toggle('date-off', S.hudAutoFade && rt.t > 8 && !this.bigmap && !p.cmdOpen);
    this.root.classList.toggle('hc', !!S.hudContrast);
    this.root.classList.toggle('subbg', !!S.subBg);
    // 気力の輪（使っているときだけ照準のそばに）
    const ring = $('staring');
    const sr = p.sta / p.maxSta;
    ring.hidden = sr > 0.98;
    ring.style.setProperty('--p', Math.round(sr * 100));
    ring.classList.toggle('low', p.sta < 20);
    // 飛ばせる場面の案内
    const sk = $('skiphint');
    // 初めての手ほどきの間は出さない（札は一度に一つ。待ちを飛ばすと手ほどきの間が無くなる）
    const can = !(rt.tut && rt.tut.auto) && rt.def.canSkip && rt.def.canSkip(rt);
    sk.hidden = !can;
    if (can) sk.innerHTML = `<kbd>${K('skip')}</kbd>${esc(can)}`;
    // 戦況の一行
    const st = $('situation');
    if (rt.armyInit && rt.armyInit.a && rt.armyInit.b) {
      // 兵の残りの割合に、両軍の士気の平均と潰走した隊の割合を足して決める（next-phase §11）
      const ra = this.lastA / rt.armyInit.a, rb = this.lastB / rt.armyInit.b;
      const mo = (team) => {
        const gs = rt.army.groups.filter((g) => (team ? g.team !== 0 : g.team === 0) && g.units.some((x) => x.alive && x.type !== 'dummy' && x.type !== 'porter'));
        if (!gs.length) return { m: 0.5, r: 0 };
        return { m: gs.reduce((a, g) => a + Math.max(0, Math.min(100, g.morale ?? 60)), 0) / gs.length / 100, r: gs.filter((g) => g.routed).length / gs.length };
      };
      const A = mo(0), B = mo(1);
      const diff = (ra - rb) * 0.6 + (A.m - B.m) * 0.3 + (B.r - A.r) * 0.25;
      // 戦況の一行は、変わった時だけ 3.5 秒出す（ずっと出ている字は目に入らなくなる）
      const word = A.r > 0.6 && ra < 0.4 ? '崩れかけ' : diff > 0.2 ? '優勢' : diff > 0.07 ? 'やや優勢' : diff < -0.2 ? '劣勢' : diff < -0.07 ? 'やや劣勢' : '互角';
      if (word !== this.sitWord && rt.t >= 5) { this.sitWord = word; this.sitT = 3.5; this.peekArmy(4); }
      this.sitT = (this.sitT || 0) - dt;
      st.hidden = !(this.sitT > 0);
      st.textContent = word;
      st.className = diff > 0.07 ? 'good' : diff < -0.07 ? 'bad' : '';
    }
    // 字幕
    // 開戦の題の札の間は、字幕を待たせる（札の後に頭から読めるように）
    const introOn = !$('intro').hidden;
    if (this.subT > 0 && !introOn) this.subT -= dt;
    if (this.subT <= 0 && this.subQ.length && !introOn) {
      const s = this.subQ.shift();
      // 話し手ごとに色を変える（上官・名のある人は金、自分は白、足軽は灰、敵は朱）
      // 敵か味方かは、話し手の名の家と、戦場にいるその名の者の陣営で決める
      const foe = s.speaker && (/斎藤|今川|浅井|朝倉|六角|武田|延暦寺|僧兵|一揆|三好/.test(s.speaker) || rt.army.units.some((o) => o.name && o.team !== 0 && (o.name === s.speaker || o.name.endsWith(s.speaker))));
      const sc = !s.speaker ? '' : s.speaker === rt.G.name ? 'me' : foe ? 'foe' : /足軽|伝令/.test(s.speaker) ? 'grunt' : 'lord';
      $('subtitle').innerHTML = (s.speaker ? `<span class="sp ${sc}">${esc(s.speaker)}</span>` : '') + `<span class="${s.speaker ? '' : 'sys'}">${esc(s.text)}</span>` +
        (this.subDrop ? `<small class="more">台詞を一部とばしました（${isTouch ? '字幕を押すと会話の記録' : `<kbd class="cap">${esc(K('log'))}</kbd> で会話の記録`}）</small>` : '');
      if (!this.subQ.length) this.subDrop = false;
      this.speak(s.speaker, s.text);
      // 最小のスマホ横では、字幕は 3 秒で消す（戦場を塞がない）
      this.subT = leanHud() ? Math.min(s.dur, 3) : s.dur;
    } else if (this.subT <= 0) $('subtitle').innerHTML = '';
    // ゲージ
    $('h-who').innerHTML = `${esc(G.name)}<small>${rankLabel(G)}</small>`;
    const hpEl = $('h-hp');
    const hpPct = Math.max(0, u.hp / u.maxHp * 100);
    hpEl.querySelector('b').style.width = hpPct + '%';
    // 減った分を白く残して、あとから追いつかせる
    this.ghost = this.ghost === undefined ? hpPct : Math.max(hpPct, this.ghost - dt * 25);
    if (hpPct > this.ghost) this.ghost = hpPct;
    hpEl.querySelector('s').style.width = this.ghost + '%';
    // 数は減っている時だけ（満ちていれば棒の長さで足りる）
    hpEl.querySelector('em').textContent = u.hp < u.maxHp ? `${Math.ceil(Math.max(0, u.hp))}/${u.maxHp}` : '';
    // 深手（三割を切る）は数字を朱の字で太く、帯の名も「深手」に
    const deep = u.hp < u.maxHp * 0.3;
    hpEl.classList.toggle('deep', deep);
    hpEl.querySelector('span').textContent = deep ? '深手' : '体力';
    // 体力も気力も満ちていれば、平時は札ごと消してよい（.bl.full。馬に乗れる身分は馬の傷みも見る）
    const bl = hpEl.parentElement;
    if (bl) bl.classList.toggle('full', u.hp >= u.maxHp && p.sta >= p.maxSta * 0.98 && (!p.canRide || p.horseHp >= p.horseMax * 0.98));
    const staEl = $('h-sta');
    staEl.querySelector('b').style.width = Math.max(0, p.sta / p.maxSta * 100) + '%';
    staEl.querySelector('em').textContent = Math.floor(p.sta);
    staEl.classList.toggle('low', p.sta < 20);
    // 気力の棒は減った時だけ（満ちていれば照準のそばの輪も消えている）
    staEl.classList.toggle('full', p.sta >= p.maxSta * 0.98);
    const mg = rt.squadGroups.length ? rt.squadGroups : rt.hostGroup ? [rt.hostGroup] : [];
    const mor = mg.length ? mg.reduce((a, g) => a + Math.max(0, g.morale), 0) / mg.length : 100;
    const morEl = $('h-mor');
    morEl.querySelector('b').style.width = mor + '%';
    morEl.querySelector('em').textContent = moraleWord(mor);
    morEl.classList.toggle('low', mor < 40);
    // 馬の体力と息（馬に乗れる身分から）
    const hEl = $('h-horse'), bEl = $('h-breath');
    // 馬の札は乗っている時か、馬が傷ついた・逃げた時だけ
    const horseNote = p.canRide && (p.mounted || p.horseHp < p.horseMax * 0.98 || (p.loose && p.loose.mode === 'fled'));
    hEl.hidden = !horseNote; bEl.hidden = !p.canRide || !p.mounted;
    if (p.canRide) {
      const away = !p.mounted && p.loose && p.loose.mode === 'fled';
      hEl.querySelector('span').textContent = p.horseName;
      hEl.querySelector('b').style.width = Math.max(0, p.horseHp / p.horseMax * 100) + '%';
      hEl.querySelector('em').textContent = p.mounted ? `${Math.ceil(p.horseHp)}` : away ? '逃げた' : '待っている';
      hEl.classList.toggle('low', p.horseHp < p.horseMax * 0.3);
      bEl.querySelector('b').style.width = Math.max(0, p.breath / p.maxBreath * 100) + '%';
      bEl.querySelector('em').textContent = p.breath < 15 ? '上がっている' : Math.floor(p.breath);
      bEl.classList.toggle('low', p.breath < 15);
    }
    // 戦功と次の身分
    this.rank = G.rank; this.hasSquad = rt.squad.length > 0; this.manyGroups = rt.squadGroups.filter((g) => g.count > 0).length > 1;
    const cur = rt.tracker.total();
    const mEl = $('h-merit');
    if (String(cur) !== mEl.textContent) {
      if (this.meritShown !== undefined && cur > this.meritShown) { mEl.classList.remove('bump'); void mEl.offsetWidth; mEl.classList.add('bump'); }
      mEl.textContent = cur; this.meritShown = cur;
    }
    const next = RANKS[G.rank + 1];
    const cap = rt.tracker.battle.cap;
    if (next) {
      const need = Math.max(0, next.min - G.merit - cur);
      $('h-next').textContent = need > 0 ? `${next.name}まで あと${need}` : `${next.name}に届く戦功`;
      $('h-nextbar').style.width = Math.min(100, ((G.merit + cur) / next.min) * 100) + '%';
    }
    // 上限は戦功が上限に近づいた時だけ（戦の始めから「上限」を見せない）
    $('h-cap').textContent = cur >= cap * 0.75 ? `上限 ${cap}` : '';
    // 被弾
    if (this.hurtT > 0) this.hurtT -= dt;
    $('vignette').classList.toggle('hurt', this.hurtT > 0 || u.hp < u.maxHp * 0.3);
    // 息が上がった時（気力が一割半を切る）：画面の縁がゆっくり暗く脈打つ（気力の棒を見なくても分かる）
    $('vignette').classList.toggle('winded', u.alive && p.sta < p.maxSta * 0.15 && !(this.hurtT > 0));
    // 深手（三割を切る）：視界の端がにじみ、色が抜け、鼓動に合わせて赤く脈打つ。敵の鉄砲に狙われている間は縁が赤く脈打つ
    tensionCss();
    $('vignette').classList.toggle('dying', u.alive && u.hp < u.maxHp * 0.3);
    let aw = $('aimwarn');
    if (!aw) { aw = document.createElement('div'); aw.id = 'aimwarn'; $('vignette').after(aw); }
    aw.classList.toggle('on', u.alive && (rt.aimedT || 0) > 0 && !rt.over);
    // 囲み：敵のいる向きの画面の縁が赤黒く染まる（前＝上・後ろ＝下。囲まれつつある時だけ）
    this.encT = (this.encT || 0) - dt;
    if (this.encT <= 0) {
      this.encT = 0.1;
      let ec = $('encircle');
      if (!ec) { ec = document.createElement('div'); ec.id = 'encircle'; $('vignette').after(ec); }
      const E = rt.encircle, on = !!(E && E.lv > 0 && u.alive && !rt.over);
      ec.classList.toggle('on', on);
      if (on) {
        const N = E.sec.length, yaw = p.yaw || 0, st = [];
        for (let j = 0; j < N; j++) {
          // 画面の j 番目の向き（上から時計回り）→ 世界の向き → その向きの敵の数
          const a = -(j * 2 * Math.PI / N) + yaw;
          const w = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          const c = E.sec[Math.min(N - 1, Math.floor(w / (2 * Math.PI) * N))];
          const al = c >= 2 ? Math.min(0.75, 0.25 + c * 0.06) : 0;
          st.push(al);
        }
        // 向きの境は硬く切らず、隣の向きへ墨がにじむように（向きの真ん中どうしを滑らかにつなぐ）
        const ink = (a) => `rgba(64,10,4,${a.toFixed(2)})`, wrap = (st[0] + st[N - 1]) / 2;
        ec.style.background = `conic-gradient(from ${(-180 / N).toFixed(2)}deg, ${ink(wrap)} 0deg, ${st.map((a, j) => `${ink(a)} ${((j + 0.5) * 360 / N).toFixed(1)}deg`).join(', ')}, ${ink(wrap)} 360deg)`;
      }
    }
    // 照準
    const ch = $('crosshair');
    ch.dataset.style = S.crosshair;
    ch.classList.toggle('inrange', p.inRange);
    ch.classList.toggle('guard', p.guard);
    ch.classList.toggle('counter', p.counterT > 0);
    ch.classList.toggle('charge', !!p.charging);
    ch.classList.toggle('charged', p.chargeT > 0.7);
    // 鉄砲：照準を小さな輪に。縁は込め直しの進み、込め終えて構えたら金の輪（撃てる合図）
    const gunOn = p.weapon === 'gun';
    ch.classList.toggle('gun', gunOn);
    if (gunOn) {
      const ready = !!p.gunLoaded;
      ch.classList.toggle('gaim', (p.aimK || 0) > 0.5);
      ch.classList.toggle('gready', ready);
      ch.style.setProperty('--rl', `${Math.round((ready ? 1 : p.gunReload || 0) * 100)}%`);
      if (ready && !this.gunReadyWas) { ch.classList.remove('gping'); void ch.offsetWidth; ch.classList.add('gping'); }
      this.gunReadyWas = ready;
    } else this.gunReadyWas = true;
    // 近くに敵の武将がいれば、画面上部に大きく名前と体力
    const boss = $('boss');
    let bu = null, bd = 30;
    for (const o of rt.army.units) {
      if (!o.alive || o.team === 0 || o.type !== 'busho' || o.invuln) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      // 敵将の札は、名乗りの直後・狙っている時・すぐそば（14m）にいる時だけ
      if (d > 14 && p.lock !== o && !(o.announced && (o.annT ??= rt.t) + 6 > rt.t)) continue;
      if (d < bd) { bd = d; bu = o; }
    }
    // 敵将の札がある時は、同じ高さの戦況の一行を隠す
    if (bu) $('situation').hidden = true;
    if (bu) { boss.hidden = false; boss.innerHTML = `<span>${esc(bu.name || '敵武将')}</span><i><b style="width:${Math.max(0, bu.hp / bu.maxHp * 100)}%"></b></i>`; }
    else boss.hidden = true;
    // 狙っている敵
    const tg = $('target');
    const a = p.aimed;
    // 狙いの札は、名のある者・侍・武将か、狙い定めた時だけ（平の足軽は頭の上の棒で足りる）
    if (a && a.alive && (p.lock || ((a.name || a.type === 'samurai' || a.type === 'busho') && Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) < 14))) {
      tg.hidden = false;
      tg.classList.toggle('locked', !!p.lock);
      const hr = a.type === 'dummy' ? 1 : Math.max(0, a.hp / a.maxHp);
      const kw = kindWord(a);
      tg.innerHTML = `<span>${p.lock ? '<em class="lk">狙い定め</em>' : ''}${esc(typeName(a))}${kw && !typeName(a).includes(kw) ? `<small class="kd">${kw}</small>` : ''}</span><i class="${hr < 0.3 ? 'deep' : ''}"><b style="width:${hr * 100}%"></b></i>`;
    } else tg.hidden = true;
    // 任務
    // 済んだ任務は 8 秒見せたら畳んで「済 n」にまとめる（今やる事を埋もれさせない）
    this.doneAt = this.doneAt || new Map();
    for (const o of rt.objectives) if (o.state === 'done' && !this.doneAt.has(o.id + o.text)) this.doneAt.set(o.id + o.text, rt.t);
    const folded = rt.objectives.filter((o) => o.state === 'done' && rt.t - this.doneAt.get(o.id + o.text) > 8);
    const key = JSON.stringify(rt.objectives) + folded.length;
    if (key !== this.objKey) {
      this.objKey = key;
      this.doneSet = this.doneSet || new Set();
      // 今やる任務（命令があれば命令、なければ主のまだ済んでいない物）に cur を付ける。低い画面ではそれだけを出す
      const vis = rt.objectives.filter((o) => !folded.includes(o));
      const open = vis.filter((o) => o.state !== 'done' && o.state !== 'fail');
      const cur = open.find((o) => o.kind === 'order') || open.find((o) => o.kind === 'main') || open[0] || null;
      const restN = vis.length - (cur ? 1 : 0);
      $('obj-list').innerHTML = vis.map((o) => {
        const tag = { main: '主', side: '副', order: '命' }[o.kind] || '';
        // 果たしたばかりの任務は印が跳ねる
        const just = o.state === 'done' && !this.doneSet.has(o.id + o.text);
        if (o.state === 'done') this.doneSet.add(o.id + o.text);
        const pr = o.progress && o.state !== 'done' ? progressRatio(o.progress) : null;
        return `<li class="${o.state === 'done' ? 'done' : o.state === 'fail' ? 'fail' : ''} ${o.kind} ${just ? 'justdone' : ''} ${o === cur || (just && !cur) ? 'cur' : ''}"><span class="tag">${tag}</span>${esc(o.text)}${o.progress ? `<small>${esc(o.progress)}</small>` : ''}${pr !== null ? `<i class="opb"><b style="width:${Math.round(pr * 100)}%"></b></i>` : ''}</li>`;
      }).join('') + (folded.length ? `<li class="folded">済 ${folded.length}</li>` : '') + (restN > 0 ? `<li class="more" aria-hidden="true">ほか ${restN}件（押すと開く）</li>` : '');
    }
    // 組の状態
    const sq = $('h-squad');
    if (rt.squadGroups.length) {
      sq.hidden = false;
      const alive = rt.squad.filter((s) => s.alive).length;
      const pips = rt.squad.map((s) => {
        const tip = s.name ? ` title="${esc(s.name)}"` : '';
        if (!s.alive) return `<i class="dead"${tip}></i>`;
        const r = s.hp / s.maxHp;
        return `<i class="${r < 0.3 ? 'low blink' : r < 0.35 ? 'low' : r < 0.7 ? 'mid' : ''} ${s.type === 'bow' || s.type === 'gun' ? 'bow' : ''} ${s.roster && s.roster.battles > 0 ? 'vet' : ''}"${tip}></i>`;
      }).join('');
      const groups = rt.squadGroups.map((g) => {
        const ord = g.focus ? ORDER_NAME.focus : ORDER_NAME[g.order] || g.order;
        const nm = rt.squadGroups.length > 1 ? `${(GROUP_NAME[g.kind] || '槍隊').slice(0, -1)}：` : '';
        return `<span class="ord">${nm}<b>${ord}</b>${g.kind === 'bow' || g.kind === 'gun' ? `<small>${g.fire ? '射撃中' : '射撃停止'}</small>` : ''}</span>`;
      }).join('');
      const form = FORM_NAME[rt.squadGroups[0].formation] || '';
      const sel = rt.squadGroups.length > 1 ? `<span>号令先<b>${GROUP_NAME[p.selGroup]}</b></span>` : '';
      // 十六人を超える組は、一人ずつの点でなく、生きている割合と深手の数の一本の帯で
      const many = rt.squad.length > 16;
      const hurtN = rt.squad.filter((x) => x.alive && x.hp < x.maxHp * 0.35).length;
      const bar = many ? `<span class="sqbar" title="生きている ${alive}人・深手 ${hurtN}人"><i style="width:${Math.round(alive / rt.squad.length * 100)}%"></i>${hurtN ? `<em>深手 ${hurtN}</em>` : ''}</span>` : `<span class="pips">${pips}</span>`;
      // 組の札は左下の体力の札（馬の棒で背が伸びる）のすぐ上に置く（重ねない）
      const blR = sq.previousElementSibling && document.querySelector('#hud .bl').getBoundingClientRect();
      if (blR && blR.height > 0) sq.style.bottom = Math.round((window.innerHeight - blR.top) / (parseFloat(this.root.style.zoom) || 1) + 8) + 'px';
      sq.innerHTML = `<span>組<b>${alive}/${rt.squad.length}</b></span>${bar}<span>士気<b>${Math.round(mor)}</b><small>${moraleWord(mor)}</small></span><span>陣形<b>${form}</b></span>${groups}${sel}`;
    } else sq.hidden = true;
    // 指揮パネル
    const cp = $('cmdpanel');
    if (p.cmdOpen) {
      cp.hidden = false;
      const g0 = rt.squadGroups[0];
      const curOrd = g0 ? (g0.focus ? 'focus' : g0.order) : '';
      // 指の端末：札を叩くと号令（数字キーの代わり）。鍵盤の言い方は出さない
      if (isTouch && !cp.dataset.tap) {
        cp.dataset.tap = '1';
        cp.addEventListener('click', (e) => {
          const li = e.target.closest && e.target.closest('li[data-cmd]');
          const pl = this.rt && this.rt.player;
          if (!li || !pl || !pl.cmdOpen) return;
          pl.command(li.dataset.cmd); pl.cmdOpen = false;
        });
      }
      cp.innerHTML = `<h5>部隊指揮<span>${isTouch ? '札を指で押して号令' : '数字キーで号令 ・ Tab で閉じる'}</span></h5><ol>${commandList(G.rank).map((c) => `<li class="${c.id === curOrd ? 'cur' : ''}" data-cmd="${c.id}"${isTouch ? ' role="button"' : ''}>${isTouch ? '' : `<kbd>${c.k}</kbd>`}${c.label}${c.q && !isTouch ? `<em>${c.q}</em>` : ''}<small>${c.desc}</small></li>`).join('')}</ol>` +
        (rt.squadGroups.length > 1 && !isTouch ? `<div class="grp">G：号令の対象を切替　現在 <b>${GROUP_NAME[p.selGroup]}</b></div>` : '') +
        (isTouch ? '' : `<div class="grp">Tab を開かなくても ${K('follow')}・${K('hold')}・${K('attack')}・${K('retreat')} で「ついて来い・待て・突撃・退け」</div>`) +
        `<div class="grp">組：${rt.squad.filter((x) => x.alive).length}人 ／ 古参 ${rt.squad.filter((x) => x.alive && x.roster && x.roster.battles > 0).length}人 ／ 士気 ${Math.round(mor)}（${moraleWord(mor)}）${rt.G.rank >= 2 ? ' ・ 白い小旗が「前進」の行き先、青い輪が弓の届く範囲' : ''}</div>`;
    } else cp.hidden = true;
    // 武器・号令ショートカット
    const hasSq = rt.squad.length > 0;
    const rallyReady = p.rallyCd <= 0;
    const pad = this.padMode;
    const kk = { cmd: pad ? 'Y' : K('command'), quick: pad ? '十字' : `${K('follow')} ${K('hold')} ${K('attack')} ${K('retreat')}`, rally: pad ? 'LB' : K('rally'), lock: pad ? 'R3' : K('lock') };
    $('h-bottom').innerHTML =
      `<div class="slot ${p.weapon === 'spear' ? 'on' : ''}"><em>1</em>${ICON.spear}${esc(ITEMS[G.equip.weapon].name.replace('数打の', '').replace('上質な', ''))}</div>` +
      `<div class="slot ${p.weapon === 'sword' ? 'on' : ''} ${p.hasKatana ? '' : 'locked'}"><em>2</em>${ICON.sword}${p.hasKatana ? '打刀' : '—'}</div>` +
      // 火縄銃・弓は持っている時だけ。火縄銃は込めの進みを札の下から満ちる影で
      (p.hasGun ? `<div class="slot ${p.weapon === 'gun' ? 'on' : ''}"><em>3</em>${ICON.gun}${p.gunLoaded ? '火縄銃' : `<span class="why">込め${Math.round((p.gunReload || 0) * 100)}%</span>`}${p.gunLoaded ? '' : `<span class="cd" style="height:${Math.round((1 - (p.gunReload || 0)) * 100)}%"></span>`}</div>` : '') +
      (p.hasBow ? `<div class="slot ${p.weapon === 'bow' ? 'on' : ''}"><em>4</em>${ICON.bow}弓</div>` : '') +
      `<div class="slot cmd ${hasSq ? '' : 'off'}"><em>${kk.cmd}</em>${ICON.cmd}指揮</div>` +
      `<div class="slot cmd ${hasSq ? '' : 'off'}"><em>${kk.quick}</em>${ICON.quick}号令</div>` +
      `<div class="slot cmd ${rallyReady ? 'ready' : 'wait'}"><em>${kk.rally}</em>${ICON.rally}${rallyReady ? (hasSq ? '鼓舞' : '鬨の声') : `<span class="why">あと${Math.ceil(p.rallyCd)}秒</span>`}${rallyReady ? '' : `<span class="cd" style="height:${Math.min(100, p.rallyCd / 25 * 100)}%"></span>`}</div>` +
      `<div class="slot cmd ${p.lock ? 'on' : ''}"><em>${kk.lock}</em>${ICON.lock}${p.lock ? '解除' : '狙い'}</div>` +
      (p.mounted ? `<div class="slot cmd ${p.breath >= 15 ? '' : 'dim'}"><em>${pad ? 'A' : K('dodge')}</em>${ICON.dodge}${p.breath >= 15 ? '手綱' : '<span class="why">息切れ</span>'}</div>` : `<div class="slot cmd ${p.sta >= 20 ? '' : 'dim'}"><em>${pad ? 'A' : K('dodge')}</em>${ICON.dodge}${p.sta >= 20 ? '回避' : '<span class="why">気力不足</span>'}</div>`) +
      (p.canRide ? `<div class="slot cmd ${p.mounted ? 'on' : ''}"><em>${K('mount')}</em>${ICON.horse || ICON.quick}${p.mounted ? '降りる' : '乗る'}</div>` : '');
    // 操作プロンプト
    // 倒れている間は「取る」などの札を出さない
    const it = u.alive ? rt.nearestInteract() : null;
    const pr = $('prompt');
    if (it) {
      pr.hidden = false;
      const hp = rt.holdPct || 0;
      pr.innerHTML = `<kbd>${pad ? 'X' : K('use')}</kbd>${esc(it.label)}${it.hold ? `<small>（長押し）</small><i class="holdbar"><b style="width:${Math.round(hp * 100)}%"></b></i>` : ''}`;
    } else pr.hidden = true;
    this.rt = rt;
    this.unitsT = (this.unitsT || 0) - dt;
    if (this.unitsT <= 0) { this.unitsT = 0.2; this.updateUnits(rt); }
    this.updateMarkers(rt);
    this.updateThreats(rt);
    // ミニマップ
    this.mmT -= dt;
    // 小地図は見えている時だけ描く（設定で消した・手ほどきの間は描かない）
    const mmOn = S.hudMinimap !== false && !this.root.classList.contains('novice');
    if (this.mmT <= 0) { this.mmT = 0.1; if (mmOn) this.drawMap($('minimap'), rt, this.mmRange || 60, true); if (this.bigmap) { this.fitBigmap(rt); this.drawMap($('bigmap'), rt, this.bigRange || 170, false); } }
  }

  // 両軍の兵力と陣太鼓時計、年月日
  updateArmy(rt) {
    const sides = rt.def.sides;
    const ab = $('armybar');
    if (!sides) { ab.hidden = true; return; }
    let a = 0, b = 0;
    if (!rt.armyInit) {
      rt.armyInit = { a: 0, b: 0 };
    }
    for (const u of rt.army.units) {
      if (u.isPlayer || u.type === 'dummy' || u.type === 'porter' || u.noTarget) continue;
      if (u.alive) { if (u.team === 0) a++; else b++; }
    }
    rt.armyInit.a = Math.max(rt.armyInit.a, a);
    rt.armyInit.b = Math.max(rt.armyInit.b, b);
    const t = Math.floor(rt.t);
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const key = `${a}|${b}|${clock}|${rt.flags.ek || 0}`;
    this.lastA = a; this.lastB = b;
    if (key === this.armyKey) return;
    const first = !this.armyKey;
    this.armyKey = key;
    ab.hidden = false;
    if (first) {
      // 狭い画面では軍の名を短く（「織田・徳川軍」→「織田軍」）して、二行に折れないように
      const sn = (n) => window.innerWidth < 1000 ? n.replace(/・[^・]*軍$/, '軍') : n;
      ab.innerHTML = `<div class="side a"><div class="nm"><canvas width="44" height="44" data-m="${sides.a.mon}"></canvas>${esc(sn(sides.a.name))}<small id="ab-a"></small></div><div class="gauge"><s id="ab-sa"></s><b id="ab-ga"></b></div></div>
        <div class="clock"><span id="ab-c"></span><small>経過</small></div>
        <div class="side b"><div class="nm"><small id="ab-b"></small>${esc(sn(sides.b.name))}<canvas width="44" height="44" data-m="${sides.b.mon}"></canvas></div><div class="gauge"><s id="ab-sb"></s><b id="ab-gb"></b></div></div>`;
      ab.querySelectorAll('canvas[data-m]').forEach((c) => { const g = c.getContext('2d'); g.save(); g.translate(0, -8); drawMon(g, c.dataset.m, 44, 88); g.restore(); });
      $('dateline').textContent = rt.def.date ? rt.def.date(rt) : '';
      this.fitDate();
    }
    this.lastA = a; this.lastB = b;
    // 大軍の戦は、見えている兵ではなく両軍の総勢（史実の数）で見せる
    const F = rt.def.force ? rt.def.force(rt) : null;
    const fmt = (n) => `${Math.max(0, Math.round(n / 100) * 100).toLocaleString('ja-JP')}人`;
    // 史実の総勢で見せる時は「総勢」と添える（目の前の数十人と別の数だと分かるように）
    $('ab-a').textContent = F ? `総勢 ${fmt(F.a)}` : `${a}人`;
    $('ab-b').textContent = F ? `総勢 ${fmt(F.b)}` : `${b}人`;
    // 両軍の帯は同じ物差し（多い方の初めの数が端まで）。敵がはっきり多い戦は、味方の帯が短く、敵の多さが一目で分かる
    const a0 = F ? F.a0 : rt.armyInit.a || 0, b0 = F ? F.b0 : rt.armyInit.b || 0, m0 = Math.max(a0, b0, 1);
    const pa = (F ? F.a : a) / m0 * 100;
    const pb = (F ? F.b : b) / m0 * 100;
    const ra = (F ? F.b / Math.max(1, F.a) : b / Math.max(1, a));
    if (ra >= 1.5) {
      tensionCss();
      $('ab-b').insertAdjacentHTML('afterbegin', `<span class="outnum">敵は約${ra >= 3 ? Math.round(ra) : ra.toFixed(1)}倍</span>`);
    }
    $('ab-ga').style.width = pa + '%';
    $('ab-gb').style.width = pb + '%';
    this.armyPct = { a: pa, b: pb };
    const lp = this.armyPeekAt || (this.armyPeekAt = { a: pa, b: pb });
    if (Math.abs(lp.a - pa) >= 4 || Math.abs(lp.b - pb) >= 4) { this.armyPeekAt = { a: pa, b: pb }; this.peekArmy(4); }
    $('ab-c').textContent = clock;
    if (t % 5 === 0 && rt.def.date) { const d = rt.def.date(rt); if ($('dateline').textContent !== d) { $('dateline').textContent = d; this.fitDate(); } }
  }

  // 兵力の帯を t 秒だけ出す（形勢が変わった・大きく減った）
  peekArmy(t = 4) { this.armyPeekT = Math.max(this.armyPeekT || 0, t); }

  // 右上の日付が、兵力の帯（敵の名前）に重なる時は、帯の下まで一段下げる
  fitDate() {
    const d = $('dateline'), ab = $('armybar');
    if (!d || !ab) return;
    if (!this.fitDateOn) { this.fitDateOn = true; addEventListener('resize', () => this.fitDate()); document.fonts?.ready.then(() => this.fitDate()); }
    d.style.marginTop = '';
    if (ab.hidden || !d.offsetParent) return;
    const r = d.getBoundingClientRect(), q = ab.getBoundingClientRect();
    if (r.width && r.left < q.right + 8 && r.top < q.bottom && r.bottom > q.top) d.style.marginTop = `${Math.ceil(q.bottom - r.top + 4)}px`;
  }

  // 兵力の帯：減った分を白く残し、1秒ほど待ってから追いつかせる（一斉射撃でどれだけ減ったか見える）
  updateArmyGhost(dt) {
    const P = this.armyPct;
    if (!P) return;
    const G = this.armyGhost = this.armyGhost || { a: P.a, b: P.b, wa: 0, wb: 0 };
    for (const k of ['a', 'b']) {
      const w = 'w' + k;
      if (P[k] >= G[k]) { G[k] = P[k]; G[w] = 0; } else {
        G[w] += dt;
        if (G[w] > 1) G[k] = Math.max(P[k], G[k] - dt * 12);
      }
      const el = $('ab-s' + k);
      if (el) el.style.width = G[k] + '%';
    }
  }

  // 兵の頭上の体力（近くの兵だけ）
  drawOverlay(rt) {
    const cv = $('overlay');
    // 写真モードでは頭上の名札・体力も消す
    if (this.root.classList.contains('photo')) { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); return; }
    const W = window.innerWidth, H = window.innerHeight;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d');
    g.clearRect(0, 0, W, H);
    const cam = rt.camera.position;
    const zoom = 1;
    const namesPut = [];
    for (const u of rt.army.units) {
      if (!u.alive || u.isPlayer || u.type === 'dummy' || u.type === 'porter' || u.invuln && !u.name) continue;
      const d = Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z);
      if (d > 26 || u.offscreen || !u.mesh.visible) continue;
      const s = this.project(u.pos, u.pos.y + (u.mounted ? 3.3 : 2.35), rt);
      if (s.behind || s.x < 0 || s.x > W || s.y < 0 || s.y > H) continue;
      // 要る時だけ出す：敵は戦っている相手・狙っている相手、味方は傷ついた者（Alt で組を全部）
      const P = rt.player;
      // 敵の棒は、狙っている相手・自分に打ちかかる相手・すぐそばで打たれた相手だけ（遠くの斬り合いの棒が横一列に並ばないように）
      const fighting = P.lock === u || P.aimed === u || (u.target && u.target.isPlayer && d < 10) || (u.lastHitT < 3 && d < 7);
      // 味方の棒と名は、深手（六割を切った）の時だけ（乱戦で組の名が並ばないように。Alt で全部）
      const hurt = u.hp < u.maxHp * 0.6 && u.lastHitT < 10;
      // 武将（busho・名のある者）は、敵も味方も近ければ（18m 以内）いつも棒を出す（大将の傷み具合が戦の流れを決めるので）
      const general = d < 18 && (u.type === 'busho' || (!!u.name && !u.isSub && u.type !== 'ashigaru'));
      const showBar = general || (u.team !== 0 ? fighting : (hurt || (P.showSquad && u.isSub)));
      // 組の者の名は、傷ついた時と Alt の時だけ（いつも出すと戦場が字だらけになる）
      // 名は名のある者だけ。名の無い侍・武将は狙った時と Alt の時だけ「侍」「武将」と出す（戦場を字で埋めない）
      let named = d < 18 && !(u.isSub && !hurt && !P.showSquad) && (u.name || ((u.type === 'samurai' || u.type === 'busho') && (P.lock === u || P.aimed === u || P.showSquad)));
      // 最小のスマホ横：名は狙っている相手と、名のある武将（busho）だけ
      if (named && leanHud() && !(P.lock === u || P.aimed === u || (u.type === 'busho' && u.name))) named = false;
      if (!showBar && !named) continue;
      // 札や指の丸の上には描かない（重ねて読めなくしない）
      if (this.hudRects().some((r) => s.x > r.left - 20 && s.x < r.right + 20 && s.y > r.top - 16 && s.y < r.bottom + 4)) continue;
      const k = Math.max(0.45, Math.min(1.2, 9 / d));
      const w = 34 * k, h = Math.max(3, 4 * k);
      const x = s.x / zoom - w / 2, y = s.y / zoom;
      // 戦わない者（逃げる町の者など：noTarget で打ちかからない）は、敵の赤でなく褪せた土色にする
      const civil = u.team !== 0 && u.noTarget && !(u.dmg > 0);
      const col = civil ? '#b3a58a' : u.team !== 0 ? (S.colorAssist ? '#ff9a1a' : '#d24a30') : u.isSub ? '#efe6cf' : (S.colorAssist ? '#4fc3f7' : '#4f7fca');
      const alpha = Math.min(1, (26 - d) / 6) * (u.lastHitT < 2 || u.team === 0 ? 1 : 0.7);
      g.globalAlpha = alpha;
      if (showBar) {
        // 敵は▼を添えた太い棒、味方は細い棒（色だけに頼らず形でも分ける）
        const hh = u.team !== 0 ? h : Math.max(2, h * 0.55);
        g.fillStyle = 'rgba(0,0,0,.7)';
        g.fillRect(x - 1, y - 1, w + 2, hh + 2);
        g.fillStyle = col;
        g.fillRect(x, y, w * Math.max(0, u.hp / u.maxHp), hh);
        if (u.team !== 0 && !named && !civil) { const cx = x + w / 2, ty = y - 3; g.beginPath(); g.moveTo(cx - 4, ty - 5); g.lineTo(cx + 4, ty - 5); g.lineTo(cx, ty); g.closePath(); g.fill(); }
      }
      if (named) {
        // 名の字は 12px を下回らない（読めない字は置かない）
        g.font = `${Math.max(12, Math.round(11 * k * 1.1))}px "Shippori Mincho B1", serif`;
        g.textAlign = 'center';
        g.fillStyle = 'rgba(0,0,0,.8)';
        const label = u.name || (u.type === 'busho' ? '武将' : '侍');
        // 先に書いた名と重なるなら書かない（字が重なって読めなくならないように）
        const lw = g.measureText(label).width, lx = s.x / zoom, ly = y - 3;
        if (namesPut.some((q) => Math.abs(q[0] - lx) < (q[2] + lw) / 2 + 4 && Math.abs(q[1] - ly) < 15)) continue;
        namesPut.push([lx, ly, lw]);
        g.fillText(label, s.x / zoom + 1, y - 3 + 1);
        g.fillStyle = u.team !== 0 ? '#ffd0c4' : '#f3e6c4';
        g.fillText(label, s.x / zoom, y - 3);
      }
    }
    g.globalAlpha = 1;
    // Alt を押している間は自分の組の居場所を白い印で（物陰・遠くでも）
    if (rt.player.showSquad) {
      g.font = '12px "Shippori Mincho B1", serif'; g.textAlign = 'center';
      for (const u of rt.squad) {
        if (!u.alive) continue;
        const s2 = this.project(u.pos, u.pos.y + 2.6, rt);
        if (s2.behind) continue;
        g.fillStyle = '#f1e9d6';
        g.beginPath(); g.moveTo(s2.x, s2.y); g.lineTo(s2.x - 5, s2.y - 7); g.lineTo(s2.x + 5, s2.y - 7); g.closePath(); g.fill();
        if (u.name) { g.fillStyle = 'rgba(0,0,0,.7)'; g.fillText(u.name, s2.x + 1, s2.y - 10); g.fillStyle = '#f1e9d6'; g.fillText(u.name, s2.x, s2.y - 11); }
      }
    }
    // 組を向かわせた行き先は、戦場の地面に立てた本物の白い小旗と点線で示す（battle.js の updateDestMarks）
    // 狙い定めた相手：体のまわりに朱の角括弧。画面の外なら端に「狙」の矢印
    const L = rt.player.lock;
    if (L && L.alive) {
      const col = S.colorAssist ? '#ff9a1a' : '#e36a52';
      const top = this.project(L.pos, L.pos.y + (L.mounted ? 3.0 : 2.1), rt);
      const bot = this.project(L.pos, L.pos.y, rt);
      const onScr = !top.behind && !bot.behind && bot.x > 0 && bot.x < W && top.y > 0 && bot.y < H;
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2;
      if (onScr) {
        const h = Math.max(24, bot.y - top.y), w = h * 0.62, cx = (top.x + bot.x) / 2, y0 = top.y - 4, y1 = bot.y + 4;
        const x0 = cx - w / 2, x1 = cx + w / 2, c = Math.min(10, h * 0.22);
        g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 3;
        g.beginPath();
        g.moveTo(x0, y0 + c); g.lineTo(x0, y0); g.lineTo(x0 + c, y0);
        g.moveTo(x1 - c, y0); g.lineTo(x1, y0); g.lineTo(x1, y0 + c);
        g.moveTo(x0, y1 - c); g.lineTo(x0, y1); g.lineTo(x0 + c, y1);
        g.moveTo(x1 - c, y1); g.lineTo(x1, y1); g.lineTo(x1, y1 - c);
        g.stroke();
        g.shadowBlur = 0;
      } else {
        const pu = rt.player.u.pos;
        const rel = Math.atan2(L.pos.x - pu.x, L.pos.z - pu.z) - rt.player.yaw;
        const ex = W / 2 - Math.sin(rel) * W * 0.4, ey = H / 2 - Math.cos(rel) * H * 0.38;
        const ang = Math.atan2(ey - H / 2, ex - W / 2);
        g.save(); g.translate(ex, ey); g.rotate(ang);
        g.beginPath(); g.moveTo(14, 0); g.lineTo(-4, -9); g.lineTo(-4, 9); g.closePath(); g.fill();
        g.restore();
        g.font = 'bold 14px "Shippori Mincho B1", serif'; g.textAlign = 'center';
        g.fillStyle = 'rgba(0,0,0,.8)'; g.fillText('狙', ex + 1, ey + 25);
        g.fillStyle = col; g.fillText('狙', ex, ey + 24);
      }
    }
    // 一人称で雨の中にいる時だけ、画面（目の前）に雨粒が付いて、ゆっくり流れ落ちる。動きを減らす設定では出さない
    this.drawRainDrops(g, W, H, rt);
    this.drawBrim(g, W, H, rt);
    // 敵の頭上に常に小さな印（見分けやすさの設定）
    if (S.enemyMark) {
      g.fillStyle = S.colorAssist ? '#ff9a1a' : '#e2472c';
      for (const u of rt.army.units) {
        if (!u.alive || u.team === 0 || u.noTarget || u.offscreen) continue;
        if (Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) > 45) continue;
        const s2 = this.project(u.pos, u.pos.y + 2.9, rt);
        if (s2.behind) continue;
        g.beginPath(); g.moveTo(s2.x, s2.y + 4); g.lineTo(s2.x - 4, s2.y - 3); g.lineTo(s2.x + 4, s2.y - 3); g.closePath(); g.fill();
      }
    }
  }

  // 一人称：画面の上の端に、かぶっている物の縁がうっすら見える（陣笠の縁・兜の眉庇）。上を向くほど大きく
  drawBrim(g, W, H, rt) {
    const P = rt.player, k = Math.max(0, ((P.fpK || 0) - 0.7) / 0.3);
    if (k <= 0 || !P.u.alive || S.hudBrim === false) return;
    const hat = rt.G.equip && rt.G.equip.hat;
    const look = hat && ITEMS[hat] ? ITEMS[hat].look || '' : 'jingasa';
    const kabuto = /kabuto/.test(look);
    const up = Math.max(0, Math.min(1, (P.pitch || 0) / 0.5));
    const h = H * (kabuto ? 0.045 : 0.035) * (1 + up * 1.6) * k;
    g.save();
    const gr = g.createLinearGradient(0, 0, 0, h * 1.6);
    gr.addColorStop(0, kabuto ? 'rgba(8,7,6,.82)' : 'rgba(20,16,12,.7)'); gr.addColorStop(0.7, 'rgba(12,10,8,.35)'); gr.addColorStop(1, 'rgba(12,10,8,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0);
    // 縁は画面の両端で下がる弧（眉庇は真ん中が少し下がる）
    if (kabuto) { g.lineTo(W, h * 0.6); g.quadraticCurveTo(W / 2, h * 1.9, 0, h * 0.6); }
    else { g.lineTo(W, h * 1.5); g.quadraticCurveTo(W / 2, h * 0.2, 0, h * 1.5); }
    g.closePath(); g.fill();
    g.restore();
  }

  drawRainDrops(g, W, H, rt) {
    const P = rt.player, r = rt.world.rainLevel || 0;
    const on = !S.reduceMotion && (P.fpK || 0) > 0.6 && r > 0.3 && P.u.alive;
    const D = this.drops || (this.drops = []);
    const now = performance.now(), dt = Math.min(0.1, (now - (this.dropT || now)) / 1000); this.dropT = now;
    if (!on && !D.length) return;
    // 上を向くほど多く当たる
    if (on && Math.random() < dt * r * (6 + Math.max(0, P.pitch || 0) * 20) && D.length < 26) {
      D.push({ x: Math.random() * W, y: Math.random() * H * 0.85, r: 2 + Math.random() * Math.random() * 7, t: 0, life: 2.5 + Math.random() * 3, vy: 0, slide: Math.random() < 0.45 });
    }
    g.save();
    for (let i = D.length - 1; i >= 0; i--) {
      const d = D[i];
      d.t += dt;
      if (d.t > d.life || !on && d.t > 0.4) { D.splice(i, 1); continue; }
      // 大きい粒は重さで流れ落ち、筋を残す
      if (d.slide && d.r > 3.5) { d.vy = Math.min(90, d.vy + dt * 40 * (d.r / 5)); d.y += d.vy * dt; }
      const a = Math.min(1, d.t * 6) * (1 - d.t / d.life) * (on ? 1 : 0.4);
      g.globalAlpha = 0.5 * a;
      if (d.vy > 5) { g.strokeStyle = 'rgba(210,220,226,.35)'; g.lineWidth = d.r * 0.5; g.beginPath(); g.moveTo(d.x, d.y - Math.min(60, d.vy * 0.6)); g.lineTo(d.x, d.y); g.stroke(); }
      const gr = g.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.35, 0, d.x, d.y, d.r);
      gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(0.35, 'rgba(200,210,215,.18)'); gr.addColorStop(0.85, 'rgba(40,44,46,.28)'); gr.addColorStop(1, 'rgba(40,44,46,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
  }

  toggleMap() {
    this.bigmap = !this.bigmap;
    if (this.bigmap) { this.bigC = null; this.bigUser = false; this.bigRange = null; }
    $('bigmap').hidden = !this.bigmap;
    const mh = $('maphint');
    mh.hidden = !this.bigmap;
    // 凡例と操作は地図の下の札に（身分でできない事は書かない）
    if (this.bigmap && isTouch && innerHeight < 500) {
      // スマホ横：案内は一行だけ。3 秒で消す（地図そのものを広く見せる）
      const lead = (this.rank || 0) >= 2 && this.hasSquad;
      mh.innerHTML = `<div class="op"><span>${lead ? '地図を押すと組がそこへ向かう・' : ''}「地図」で閉じる</span></div>`;
      clearTimeout(this.mhT); this.mhT = setTimeout(() => { mh.hidden = true; }, 3000);
    } else if (this.bigmap) {
      const lead = (this.rank || 0) >= 2 && this.hasSquad;
      mh.innerHTML = `<div class="lg"><span><i class="me">▲</i>自分</span>${this.hasSquad ? '<span><i class="sq">●</i>自分の組</span>' : ''}<span><i class="al">■</i>味方</span><span><i class="en">▲</i>敵</span><span><i class="ob">◇</i>任務</span>${lead ? '<span><i class="fl">⚑</i>組の行き先</span>' : ''}</div>` +
        // 隊旗の形は戦場の旗と同じ。自分の組の札の色は数の減り
        `<div class="lg std"><span>${STD_SVG.spear}槍・弓</span><span>${STD_SVG.gun}鉄砲</span><span>${STD_SVG.cavalry}騎馬</span><span>${STD_SVG.honjin}本陣</span>${this.hasSquad ? `<span class="tgs" aria-label="組の数の札：白は十分、黄は減った、朱は半ばより多く失った"><i style="background:${TAG_COL.ok}"></i><i style="background:${TAG_COL.mid}"></i><i style="background:${TAG_COL.low}"></i>組の数</span>` : ''}</div>` +
        // 操作の案内は、割り当てたキーと、指の端末の言い方で
        (isTouch
          ? `<div class="op"><span>「地図」を押して閉じる</span>${lead ? `<span>地図を押す　${this.manyGroups ? '号令先の隊' : '組'}をその地点へ向かわせる</span>` : ''}${this.manyGroups ? '<span>下の顔の札　号令先を選ぶ</span>' : ''}</div>`
          : `<div class="op"><span><kbd class="cap">${esc(K('map'))}</kbd> 閉じる</span><span>ホイール　縮尺</span>${lead ? `<span>地図をクリック　${this.manyGroups ? '号令先の隊' : '組'}をその地点へ向かわせる</span>` : ''}${this.manyGroups ? '<span>右下の札　号令先を選ぶ</span>' : ''}</div>`);
    }
  }
  cycleMinimap() {
    const ranges = [40, 60, 100];
    this.mmRange = ranges[(ranges.indexOf(this.mmRange || 60) + 1) % 3];
    this.flash(`ミニマップ ${this.mmRange}m`, 'dim');
  }
  zoomBigmap(dy) { this.bigUser = true; this.bigRange = Math.max(40, Math.min(180, (this.bigRange || 170) + dy * 0.1)); }
  // 戦術マップの中心と縮尺を、いま戦っている所（自分・両軍の隊・任務）に合わせる。ホイールで触ったらその縮尺を守る
  fitBigmap(rt) {
    const pts = [rt.player.u.pos];
    for (const g of rt.army.groups) if (g.count && !g.routed && g.units.some((u) => u.alive && u.type !== 'dummy')) pts.push(g.center());
    for (const m of rt.markers) { const q = typeof m.pos === 'function' ? m.pos() : m.pos; if (q) pts.push(q); }
    const P = rt.player.u.pos;
    const near = pts.filter((q) => Math.hypot(q.x - P.x, q.z - P.z) < 220);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of near) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
    const tc = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
    const tr = Math.max(45, Math.min(180, Math.max(x1 - x0, z1 - z0) / 2 * 1.3 + 12));
    // 急に跳ねないよう、少しずつ寄せる
    const c = this.bigC = this.bigC || tc;
    c.x += (tc.x - c.x) * 0.2; c.z += (tc.z - c.z) * 0.2;
    if (!this.bigUser) this.bigRange = (this.bigRange || tr) + (tr - (this.bigRange || tr)) * 0.2;
  }
  // 戦術マップ上の点を、戦場の位置に直す
  mapToWorld(cv, clientX, clientY) {
    const r = cv.getBoundingClientRect();
    const Sz = cv.width;
    const px = (clientX - r.left) / r.width * Sz, py = (clientY - r.top) / r.height * Sz;
    const sc = Sz / 2 / (this.bigRange || 170);
    const c = this.bigC || { x: 0, z: 0 };
    return { x: c.x + (px - Sz / 2) / sc, z: c.z + (py - Sz / 2) / sc };
  }

  // 方角の帯（北東南西・任務・敵勢・自分の組）
  updateCompass(rt) {
    const el = $('compass');
    const p = rt.player;
    const W = el.clientWidth || 480;
    const items = [];
    const dirs = [['北', Math.PI], ['東', Math.PI / 2], ['南', 0], ['西', -Math.PI / 2]];
    for (const [t, a] of dirs) items.push({ a, html: `<b>${t}</b>`, cls: 'dir' });
    for (let k = 0; k < 8; k++) if (k % 2) items.push({ a: k * Math.PI / 4, html: '<i></i>', cls: 'tick' });
    const pu = p.u.pos;
    for (const m of rt.markers) {
      const q = typeof m.pos === 'function' ? m.pos() : m.pos;
      if (!q) continue;
      const d = Math.hypot(q.x - pu.x, q.z - pu.z);
      items.push({ a: Math.atan2(q.x - pu.x, q.z - pu.z), html: `<span>◆</span><small>${Math.round(d)}m</small>`, cls: m.red ? 'mk red' : 'mk' });
    }
    // 敵の隊：近い向き（7度以内）の▲は一つにまとめ、隊が多いほど印を大きく（数の字は足さない）
    const foes = [];
    // 敵の隊が残り三つ以下になったら、遠くの隊（400m まで）も帯に出す（残りの敵を探しやすく）
    const liveFoes = rt.army.groups.filter((g) => g.team !== 0 && g.count > 0 && !g.routed && g.units.some((u) => u.alive && u.type !== 'dummy'));
    const far = liveFoes.length <= 3 ? 400 : 120;
    for (const g of liveFoes) {
      const c = g.center();
      if (Math.hypot(c.x - pu.x, c.z - pu.z) > far) continue;
      foes.push(Math.atan2(c.x - pu.x, c.z - pu.z));
    }
    foes.sort((x, y) => x - y);
    const packs = [];
    for (const f of foes) {
      const last = packs[packs.length - 1];
      if (last && f - last.a1 < 0.12) { last.a1 = f; last.n++; last.sum += f; } else packs.push({ a1: f, n: 1, sum: f });
    }
    for (const k of packs) items.push({ a: k.sum / k.n, html: `<span style="font-size:${Math.min(20, 12 + (k.n - 1) * 3)}px">▲</span>`, cls: 'foe' + (k.n > 1 ? ' many' : '') });
    for (const g of rt.squadGroups) {
      if (!g.count) continue;
      const c = g.center();
      if (Math.hypot(c.x - pu.x, c.z - pu.z) < 6) continue;
      items.push({ a: Math.atan2(c.x - pu.x, c.z - pu.z), html: '<span>●</span>', cls: 'mine' });
    }
    let html = '';
    for (const it of items) {
      let rel = it.a - p.yaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      if (Math.abs(rel) > Math.PI / 2) continue;
      const x = W / 2 - (rel / (Math.PI / 2)) * (W / 2);
      html += `<div class="c ${it.cls}" style="left:${x.toFixed(1)}px">${it.html}</div>`;
    }
    // 変わった時だけ書き換える
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
  }

  // 号令の輪
  // 選んでいる項目は金の塗り＋「▶」、号令先の隊がいま従っている号令は「今」の印、使えない項目は理由の字
  updateRadial(rt) {
    const el = $('radial');
    const p = rt.player;
    if (!p.radial) { el.hidden = true; this.radialKey = ''; return; }
    el.hidden = false;
    const gs = rt.squad.length ? p.selectedGroups().filter((g) => g.count > 0) : [];
    const cur = gs.length ? (gs[0].pending ? gs[0].pending.id : gs[0].focus ? 'focus' : gs[0].order) : '';
    const kinds = this.unitKinds || [];
    const key = [p.radialSel, p.selGroup, cur, rt.G.rank, kinds.join(','), gs.map((g) => tagOf(g)).join(',')].join('|');
    if (key === this.radialKey) return;
    this.radialKey = key;
    // 早打ちのキーがある号令は、その鍵を添える（輪を開かなくても出せると覚えられる）
    const qk = { follow: K('follow'), hold: K('hold'), attack: K('attack'), retreat: K('retreat'), rally: K('rally') };
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', '号令の輪');
    el.innerHTML = RADIAL.map((it, i) => {
      const a = i * Math.PI / 4;
      const x = Math.sin(a) * 170, y = -Math.cos(a) * 170;
      const locked = it.min && rt.G.rank < it.min;
      const on = i === p.radialSel;
      const now = !locked && it.id === cur;
      const why = locked ? `<small class="why">${esc((RANKS[it.min] || {}).name || '')}から</small>` : '';
      return `<div class="rw ${on ? 'on' : ''} ${locked ? 'locked' : ''} ${now ? 'now' : ''}" role="menuitem" aria-disabled="${locked ? 'true' : 'false'}" style="transform:translate(${x.toFixed(0)}px,${y.toFixed(0)}px)">${on ? '<span class="sel">▶</span>' : ''}${it.label}${now ? '<i class="nowm" title="いまの号令">今</i>' : ''}${it.min && rt.G.rank === it.min && !now ? '<i class="newm" title="この身分で増えた号令">新</i>' : ''}${qk[it.id] && !locked ? `<kbd>${esc(qk[it.id])}</kbd>` : ''}${why}</div>`;
    }).join('') +
      `<div class="rc">${p.radialSel >= 0 ? RADIAL[p.radialSel].label : (isTouch ? '指で叩いて<br>選ぶ<br><small>真ん中でやめる</small>' : 'マウスで選び<br>Tab を放す<br><small>真ん中で放すとやめる</small>')}` +
      // 号令先の隊：札の並び（選んだ隊は金、数字キーでも選べる）
      (kinds.length > 1 ? `<div class="rg">${['all', ...kinds].map((k, i) => {
        const g = rt.squadGroups.find((x) => x.kind === k && x.count > 0);
        const sel = p.selGroup === k || (p.selGroup === 'all' && k === 'all');
        return `<span class="${sel ? 'on' : ''}">${k === 'all' ? '全隊' : KIND_WORD[k] || k}${g ? `<i style="background:${TAG_COL[tagOf(g)]}"></i>` : ''}<kbd>${i}</kbd></span>`;
      }).join('')}</div><small class="rgk">${isTouch ? '下の顔の札で号令先' : 'G か数字で号令先'}</small>` : '') + `</div>`;
  }

  project(p, y, rt) {
    this.tmpV.set(p.x, y, p.z).project(rt.camera);
    return { x: (this.tmpV.x * 0.5 + 0.5) * window.innerWidth, y: (-this.tmpV.y * 0.5 + 0.5) * window.innerHeight, behind: this.tmpV.z > 1 };
  }

  // HUD の札が占める四角（任務の印をその上に置かない）。0.25 秒ごとに測り直す
  hudRects() {
    const now = performance.now();
    if (this.rectsT && now - this.rectsT < 250) return this.rects;
    this.rectsT = now;
    this.rects = [];
    for (const sel of ['.tr #objectives', '#minimap', '.bl', '.tl .plaque', '.tl .next', '#toasts', '#armybar', '#compass', '#h-bottom', '#h-squad', '#tutorial', '#h-units', '#skiphint', '#boss', '#target', '#subtitle']) {
      const el = this.root.querySelector(sel);
      if (!el || el.hidden || !el.offsetParent) continue;
      // 今は消している札（平時の兵力の帯など）は避けなくてよい
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) this.rects.push(r);
    }
    // 指の端末の丸（右下の突く・構え…と左上の止める・地図）も避ける
    for (const el of document.querySelectorAll('#tc:not([hidden]) .tb:not([hidden])')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) this.rects.push(r);
    }
    return this.rects;
  }

  // 印（x を中心に、y から上へ伸びる箱）が札に重ならない所を探す。
  // axis：'v' なら上下にだけ、'h' なら左右にだけ動かす（画面の端に寄せた印は端に沿って滑らせる）
  avoidRects(x, y, W, H, axis) {
    const mw = 74, mh = 36, rects = this.hudRects();
    const free = (a, b) => a > 30 && a < W - 30 && b > 40 && b < H - 8 && rects.every((r) => a + mw / 2 < r.left || a - mw / 2 > r.right || b < r.top || b - mh > r.bottom);
    if (free(x, y)) return [x, y];
    for (let k = 1; k <= 40; k++) {
      const d = Math.ceil(k / 2) * 18 * (k % 2 ? 1 : -1);
      if (axis !== 'h' && free(x, y + d)) return [x, y + d];
      if (axis !== 'v' && free(x + d, y)) return [x + d, y];
    }
    return [x, y];
  }

  updateMarkers(rt) {
    const W = window.innerWidth, H = window.innerHeight;
    const seen = new Set();
    const placed = [];
    // いちばんの行き先（敵でない最初の印。無ければ最初の印）：印を少し大きく光らせ、画面の外なら照準の脇に小さな矢で向きを示す（字を読まずに分かる）
    const posOf = (m) => (typeof m.pos === 'function' ? m.pos() : m.pos);
    const main = rt.markers.find((m) => !m.red && posOf(m)) || rt.markers.find((m) => posOf(m));
    let cue = $('goalcue');
    if (!cue) { cue = document.createElement('div'); cue.id = 'goalcue'; cue.setAttribute('aria-hidden', 'true'); $('markers').appendChild(cue); }
    let cueOn = false;
    for (const m of rt.markers) {
      const p = posOf(m);
      if (!p) continue;
      seen.add(m.id);
      let el = this.markerEls.get(m.id);
      if (!el) { el = document.createElement('div'); el.className = 'mk' + (m.red ? ' red' : ''); $('markers').appendChild(el); this.markerEls.set(m.id, el); }
      const y = (p.y ?? rt.world.heightAt(p.x, p.z)) + (m.h ?? 3);
      const s = this.project(p, y, rt);
      let sx = s.x, sy = s.y;
      const off = s.behind || sx < 40 || sx > W - 40 || sy < 60 || sy > H - 40;
      if (s.behind) { sx = W - sx; sy = H - 60; }
      sx = Math.max(40, Math.min(W - 40, sx)); sy = Math.max(60, Math.min(H - 40, sy));
      const axis = !off ? '' : sx <= 40 || sx >= W - 40 ? 'v' : 'h';
      [sx, sy] = this.avoidRects(sx, sy, W, H, axis);
      // 先に置いた印と重なるなら下へずらす
      for (const q of placed) if (Math.abs(q[0] - sx) < 80 && Math.abs(q[1] - sy) < 34) { sy = q[1] + 38; [sx, sy] = this.avoidRects(sx, sy, W, H, 'v'); }
      placed.push([sx, sy]);
      const d = Math.hypot(p.x - rt.player.u.pos.x, p.z - rt.player.u.pos.z);
      el.style.left = sx + 'px'; el.style.top = sy + 'px';
      el.classList.toggle('edge', off);
      el.classList.toggle('near', d < 5);
      el.classList.toggle('main', m === main);
      if (m === main && off && !rt.player.lock) { cueOn = true; cue.style.setProperty('--ang', Math.atan2(sy - H / 2, sx - W / 2) + 'rad'); cue.classList.toggle('red', !!m.red); }
      // 見えている近い行き先（40m 以内）は、世界そのものが目印になるので印を控えめに
      el.classList.toggle('quiet', !off && d < 40 && d >= 5 && !m.red);
      el.classList.toggle('weak', !!(m.group && m.group.morale < 30 && !m.group.routed));
      if (!m.born) m.born = performance.now();
      el.classList.toggle('fresh', performance.now() - m.born < 2200);
      if (off) {
        const ang = Math.atan2(sy - H / 2, sx - W / 2);
        el.style.setProperty('--ang', ang + 'rad');
      }
      // 印の名は名だけ（士気は旗の傾き・揺れで見せる）。崩れかけの時だけ「崩れかけ」を添える（今が押し時と分かるように）
      const label = String(typeof m.label === 'function' ? m.label() : m.label).replace(/・(意気盛ん|平常|動揺)$/, '');
      // 名は墨の下地の上に、距離は薄い字で分ける（霧や明るい空でも読める）。すぐそばでは距離を出さず、遠い時は言葉で
      const dist = d < 12 ? '' : d > 150 ? '遠い' : `${Math.round(d)}m`;
      // 最小のスマホ横：名は出たばかりの時・真ん中あたりに見ている時・敵の武将の隊（赤）だけ。距離は出さない（◆だけで行き先は分かる）
      const lean = leanHud(), look = !off && Math.abs(sx - W / 2) < W * 0.18 && Math.abs(sy - H / 2) < H * 0.3;
      const showLabel = !lean || m.red || look || performance.now() - m.born < 2200;
      const html = showLabel ? `<b>${esc(label)}</b>${dist && !lean ? `<small>${dist}</small>` : ''}` : '';
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
    }
    for (const [id, el] of this.markerEls) if (!seen.has(id)) { el.remove(); this.markerEls.delete(id); }
    cue.hidden = !cueOn;
  }

  // 自分を狙って構えている敵の頭上に「！」
  updateThreats(rt) {
    const list = (rt.army.threats || []).filter((u) => Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < 12).slice(0, 5);
    while (this.threatEls.length < list.length) {
      const el = document.createElement('div');
      el.className = 'threat';
      el.textContent = '！';
      $('threats').appendChild(el);
      this.threatEls.push(el);
    }
    this.threatEls.forEach((el, i) => {
      const u = list[i];
      if (!u) { el.hidden = true; return; }
      const s = this.project(u.pos, u.pos.y + 2.3, rt);
      const W = window.innerWidth, H = window.innerHeight;
      el.hidden = false;
      // 画面の外（後ろ・横）から来る攻撃は画面の端に出す
      const off = s.behind || s.x < 30 || s.x > W - 30 || s.y < 30 || s.y > H - 30;
      el.classList.toggle('edge', off);
      let sx = s.x, sy = s.y;
      if (off) {
        const pu = rt.player.u;
        const rel = Math.atan2(u.pos.x - pu.pos.x, u.pos.z - pu.pos.z) - rt.player.yaw;
        sx = W / 2 - Math.sin(rel) * W * 0.38; sy = H / 2 - Math.cos(rel) * H * 0.36;
      }
      // 画面の外からの攻めは、来る向きを指す矢じりを添える（真後ろなら「後」も）
      let r = ((Math.atan2(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) - rt.player.yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      const html = off ? `<i class="ar" style="transform:rotate(${(-r).toFixed(2)}rad)">▲</i>！` : '！';
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
      el.classList.toggle('back', off && Math.abs(r) > 2.3);
      el.style.left = sx + 'px'; el.style.top = sy + 'px';
      // 駆けてくる騎馬は、近いほど強く示す
      const k = u.atk ? Math.max(0, 1 - u.atk.t / 0.6) : u.charging ? Math.max(0, Math.min(1, 1 - (Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) - 3) / 7)) : 0;
      el.style.opacity = 0.4 + k * 0.6;
      el.style.transform = `translate(-50%, -50%) scale(${0.8 + k * 0.5})`;
    });
  }

  // 行き先の白い小旗（戦場の小旗と同じ：白地に墨の縁、細い竿）
  flagIcon(g, x, y, h) {
    g.strokeStyle = '#1a1510'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    g.strokeStyle = '#f1e9d6'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    g.fillStyle = '#f1e9d6'; g.fillRect(x, y - h, h * 0.62, h * 0.44);
    g.strokeStyle = '#1a1510'; g.lineWidth = 1.2; g.strokeRect(x, y - h, h * 0.62, h * 0.44);
    g.beginPath(); g.ellipse(x, y, h * 0.3, h * 0.1, 0, 0, Math.PI * 2); g.strokeStyle = 'rgba(241,233,214,.8)'; g.lineWidth = 1.2; g.stroke();
  }
  // 隊旗の形：幟（槍・弓）・四角の小旗（鉄砲）・吹流し（騎馬）・大旗（本陣）
  stdIcon(g, x, y, h, kind, col, lean = 0) {
    g.save(); g.translate(x, y); g.rotate(lean);
    const H = kind === 'honjin' ? h * 1.35 : kind === 'gun' ? h * 0.75 : h;
    g.lineWidth = 3; g.strokeStyle = '#120f0b'; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -H); g.stroke();
    g.lineWidth = 1.4; g.strokeStyle = col; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -H); g.stroke();
    g.fillStyle = col; g.strokeStyle = '#120f0b'; g.lineWidth = 1.2;
    g.beginPath();
    if (kind === 'gun') g.rect(0, -H, H * 0.62, H * 0.52);
    else if (kind === 'cavalry') { g.moveTo(0, -H); g.lineTo(h * 0.9, -H + h * 0.08); g.lineTo(h * 0.9, -H + h * 0.16); g.lineTo(0, -H + h * 0.3); g.closePath(); }
    else if (kind === 'honjin') g.rect(0, -H, H * 0.4, H * 0.62);
    else g.rect(0, -H, h * 0.24, kind === 'bow' ? h * 0.5 : h * 0.62);
    g.fill(); g.stroke();
    g.restore();
  }

  // 和紙の地（生成りの地に漉きむらと繊維）。一度だけ描いて、絵の模様として使い回す
  washi(g) {
    if (!this._washiC) {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const w = c.getContext('2d');
      w.fillStyle = '#e8ddc2'; w.fillRect(0, 0, 256, 256);
      let s = 7; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 70; i++) { w.fillStyle = `rgba(${170 + R() * 40},${150 + R() * 36},${110 + R() * 30},${0.08 + R() * 0.1})`; w.beginPath(); w.ellipse(R() * 256, R() * 256, 10 + R() * 34, 6 + R() * 20, R() * 3, 0, Math.PI * 2); w.fill(); }
      for (let i = 0; i < 260; i++) {
        const x = R() * 256, y = R() * 256, a = R() * 6.28, l = 4 + R() * 14;
        w.strokeStyle = `rgba(${120 + R() * 40},${100 + R() * 30},${70 + R() * 20},${0.12 + R() * 0.16})`; w.lineWidth = 0.5 + R() * 0.8;
        w.beginPath(); w.moveTo(x, y); w.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); w.stroke();
      }
      this._washiC = c; this._washiP = new Map();
    }
    if (!this._washiP.has(g)) this._washiP.set(g, g.createPattern(this._washiC, 'repeat'));
    return this._washiP.get(g);
  }
  // 大軍の塊を墨のにじみで描く下地（敵・味方で一枚ずつ。大きさが同じなら使い回す）
  massLayer(i, Sz) {
    this._mass = this._mass || [];
    let c = this._mass[i];
    if (!c || c.width !== Sz) { c = document.createElement('canvas'); c.width = c.height = Sz; this._mass[i] = c; }
    return c;
  }
  drawMap(cv, rt, range, rotate) {
    const g = cv.getContext('2d');
    const Sz = cv.width;
    g.clearRect(0, 0, Sz, Sz);
    const p = rt.player.u;
    const cx = rotate ? p.pos.x : (this.bigC ? this.bigC.x : 0), cz = rotate ? p.pos.z : (this.bigC ? this.bigC.z : 0);
    const sc = Sz / 2 / range;
    const northUp = rotate && S.mapNorth;
    const yaw = rotate && !northUp ? rt.player.yaw : Math.PI;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const tr = (x, z) => {
      const dx = x - cx, dz = z - cz;
      // 画面上方向＝向いている方向
      const rx = -(dx * cos - dz * sin), rz = dx * sin + dz * cos;
      return [Sz / 2 + rx * sc, Sz / 2 - rz * sc];
    };
    // 画面での大きさ：iPhone 横では小地図が 60px ほどの小さな丸になる。その時は細かい物（兵の点・味方の鉄砲の扇・字）を描かず、線を太く
    const shown = cv.clientWidth || Sz, px = Sz / Math.max(40, shown), tiny = rotate && shown < 100;
    const k = Sz / 340;
    // 墨と顔料の色（和紙の上で読める濃さ。色だけに頼らず、敵は三角・味方は四角・自分の組は輪）
    const ca = S.colorAssist;
    const C = { ink: '#1b1712', ally: ca ? '#0a6fa8' : '#2c4f86', enemy: ca ? '#c25a00' : '#b2331f', own: '#6e4508', gold: '#7a5a10', paper: 'rgba(240,232,212,.92)' };
    const TC = (team) => (team !== 0 ? C.enemy : C.ally);
    g.save();
    if (rotate) { g.beginPath(); g.arc(Sz / 2, Sz / 2, Sz / 2 - 1, 0, Math.PI * 2); g.clip(); }
    // 和紙の地（小さい時は少し透かして、戦場を隠しすぎない）
    g.globalAlpha = tiny ? 0.74 : 0.88;
    g.fillStyle = this.washi(g); g.fillRect(0, 0, Sz, Sz);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(110,86,52,.5)'; g.lineWidth = Math.max(2 * k, 1.6 * px);
    for (const path of rt.world.def.paths || []) {
      g.beginPath(); path.forEach(([x, z], i) => { const [a, b] = tr(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
    }
    if (rt.world.def.water) {
      g.fillStyle = 'rgba(78,108,122,.4)';
      const Wx = rt.world.def.water.x;
      const pts = [tr(Wx, -200), tr(200, -200), tr(200, 200), tr(Wx, 200)];
      g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.fill();
    }
    const now = rt.army.time;
    for (const s of rt.army.structs) {
      if (!s.seg) continue;
      const hot = s.alive && s.hitT && now - s.hitT < 1.2;
      g.strokeStyle = !s.alive ? C.enemy : hot ? '#b86a0e' : 'rgba(40,33,24,.85)';
      g.lineWidth = Math.max((hot ? 5 : 3) * k, (hot ? 2.4 : 1.5) * px);
      const [a1, b1] = tr(s.seg[0], s.seg[1]), [a2, b2] = tr(s.seg[2], s.seg[3]);
      g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke();
    }
    const r0 = Math.max(3, Sz / 110);
    // 見えている敵だけを描く：足軽の目は 70m、組頭・足軽大将候補は物見の知らせで 150m、足軽大将より上は戦場全体
    const PU = rt.player.u.pos, sight = rt.G.lordTitle || rt.G.rank >= 4 ? Infinity : rt.G.rank >= 2 ? 150 : 70;
    const seen = (x, z) => Math.hypot(x - PU.x, z - PU.z) < sight;
    const far = (x, z, m = 1.5) => Math.abs(x - cx) > range * m || Math.abs(z - cz) > range * m;

    // ---- 大軍の塊：本物の兵に、軽い兵（遠景の大軍・軽い大軍の合戦）の広がりも足して、敵・味方の墨のにじみにする ----
    // 大軍は遠くからでも見えるので、見通しに関わらず描く（本物の敵兵だけは見えている者のみ）
    {
      const shapes = [[], []];   // [味方, 敵] ごとに、{ pts } か { x, z, r }
      for (const u of rt.army.units) {
        if (!u.alive || u.isPlayer || u.type === 'dummy' || u.type === 'porter' || u.fleeing) continue;
        if (u.team !== 0 && !seen(u.pos.x, u.pos.z)) continue;
        if (far(u.pos.x, u.pos.z)) continue;
        shapes[u.team !== 0 ? 1 : 0].push({ x: u.pos.x, z: u.pos.z, r: 3.2 });
      }
      const W = rt.world, sides = rt.def.sides || {};
      for (const A of W.armies || []) {
        if (!A.mesh || !A.mesh.visible || A.rout) continue;
        const n = (A.n || 0) - (A.took || 0);
        if (n < 6) continue;
        A.mesh.updateMatrixWorld();
        const e = A.mesh.matrixWorld.elements, ox = A.cx + A.off.x, oz = A.cz + A.off.z;
        const x = e[0] * ox + e[8] * oz + e[12], z = e[2] * ox + e[10] * oz + e[14];
        if (far(x, z, 2.2)) continue;
        // 軍配（gunbai.js）と同じ見分け：戦の定義の両軍の家紋、敵方の家紋
        const team = A.team !== undefined ? A.team : sides.b && A.mon === sides.b.mon ? 1 : sides.a && A.mon === sides.a.mon ? 0 : ENEMY_MON.has(A.mon) ? 1 : 0;
        // 広がりは数から見積もる（横に長い備：幅は奥行きのおよそ三倍）
        const wd = Math.sqrt(n * 1.5 * 3), dp = n * 1.5 / wd, F = A.facing || 0, fc = Math.cos(F), fs = Math.sin(F), pts = [];
        for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2, lx = Math.cos(t) * wd / 2, lz = Math.sin(t) * dp / 2; pts.push(tr(x + lx * fc + lz * fs, z - lx * fs + lz * fc)); }
        shapes[team ? 1 : 0].push({ pts });
      }
      for (const Cl of W.clashes || []) {
        if (!Cl.blocks || !Cl.frontAt) continue;
        if (far(Cl.x, Cl.z, 2.5)) continue;
        for (const Sd of [Cl.A, Cl.B]) {
          if (!Sd || !Sd.P || Sd.P.hidden || Sd.routed || !Sd.alive) continue;
          const team = Sd.P.team !== undefined ? Sd.P.team : Sd === Cl.A ? 0 : 1;
          // 前線の列から後ろへ、残った数の厚み（後詰めがあれば厚く）
          const D = ((Sd.rows || 4) * 1.15 + (Sd.host ? 12 : 3)) * Math.max(0.3, Sd.alive / (Sd.n0 || Sd.alive)), g0 = (Cl.o && Cl.o.gap || 3.4) / 2;
          const front = [], back = [];
          for (let j = 0; j < Cl.nb; j++) { const a = Cl.frontAt(j, -Sd.sgn * g0), b = Cl.frontAt(j, -Sd.sgn * (g0 + D)); front.push(tr(a.x, a.z)); back.push(tr(b.x, b.z)); }
          shapes[team ? 1 : 0].push({ pts: front.concat(back.reverse()) });
        }
      }
      // 二度塗り：外は淡く広く、芯は濃く。塊が重なっても濃くなりすぎないよう、下地に塗ってから一度に重ねる
      for (let t = 0; t < 2; t++) {
        if (!shapes[t].length) continue;
        const L = this.massLayer(t, Sz), m = L.getContext('2d');
        for (const [grow, alpha] of [[1.5, 0.16], [1, 0.2]]) {
          m.clearRect(0, 0, Sz, Sz);
          m.fillStyle = t ? C.enemy : C.ally; m.strokeStyle = m.fillStyle; m.lineJoin = 'round';
          m.lineWidth = Math.max(2, 5 * sc * grow);
          for (const s of shapes[t]) {
            m.beginPath();
            if (s.pts) { s.pts.forEach(([a, b], i) => (i ? m.lineTo(a, b) : m.moveTo(a, b))); m.closePath(); m.fill(); m.stroke(); }
            else { const [a, b] = tr(s.x, s.z); m.arc(a, b, Math.max(1.5 * px, s.r * sc * grow), 0, Math.PI * 2); m.fill(); }
          }
          g.globalAlpha = alpha; g.drawImage(L, 0, 0); g.globalAlpha = 1;
        }
      }
    }

    // ---- 鉄砲隊の向き：筒先の向きへ、玉の届く扇（敵の扇は小さい時も描く。味方は大きい時だけ） ----
    for (const grp of rt.army.groups) {
      if (!grp.count || grp.routed || grp.name === 'player') continue;
      if (!(grp.isGun || (grp._kind || groupKind(grp)) === 'gun')) continue;
      const c = grp.center();
      if (far(c.x, c.z)) continue;
      if (grp.team !== 0 && !seen(c.x, c.z)) continue;
      if (grp.team === 0 && tiny) continue;
      const f = grp.forward(), fa = Math.atan2(f.x, f.z), R = 45;
      const [a0, b0] = tr(c.x, c.z);
      g.beginPath(); g.moveTo(a0, b0);
      for (let i = 0; i <= 6; i++) { const t = fa - 0.3 + i * 0.1; const [a, b] = tr(c.x + Math.sin(t) * R, c.z + Math.cos(t) * R); g.lineTo(a, b); }
      g.closePath();
      g.fillStyle = grp.team !== 0 ? 'rgba(178,51,31,.14)' : 'rgba(44,79,134,.12)'; g.fill();
      g.strokeStyle = grp.team !== 0 ? 'rgba(178,51,31,.55)' : 'rgba(44,79,134,.45)'; g.lineWidth = Math.max(1.4 * k, 1.1 * px);
      g.setLineDash([5 * k, 4 * k]); g.stroke(); g.setLineDash([]);
    }

    // ---- 兵の点（小さい時は塊だけにして、点は描かない） ----
    if (!tiny) for (const u of rt.army.units) {
      if (!u.alive || u.isPlayer || u.type === 'dummy') continue;
      if (u.team !== 0 && !seen(u.pos.x, u.pos.z)) continue;
      if (far(u.pos.x, u.pos.z)) continue;
      const [a, b] = tr(u.pos.x, u.pos.z);
      if (u.team !== 0) {
        // 敵は三角（色だけに頼らない）
        g.fillStyle = u.fleeing ? 'rgba(178,51,31,.4)' : C.enemy;
        g.beginPath(); g.moveTo(a, b - r0 * 0.9); g.lineTo(a + r0 * 0.8, b + r0 * 0.6); g.lineTo(a - r0 * 0.8, b + r0 * 0.6); g.closePath(); g.fill();
      } else if (u.isSub) {
        g.fillStyle = C.own;
        g.beginPath(); g.arc(a, b, r0 * 0.7, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = u.invuln && u.name ? C.gold : C.ally;
        g.fillRect(a - r0 / 2, b - r0 / 2, r0, r0);
      }
    }
    // ---- 自分の組：組の者を囲む輪（墨の縁に金茶） ----
    for (const grp of rt.squadGroups || []) {
      if (!grp.count) continue;
      const c = grp.center();
      let rr = 2;
      for (const u of grp.units) if (u.alive) rr = Math.max(rr, Math.hypot(u.pos.x - c.x, u.pos.z - c.z));
      const [a, b] = tr(c.x, c.z), R = Math.max(r0 * 1.8, (rr + 1.5) * sc);
      g.strokeStyle = C.paper; g.lineWidth = Math.max(4 * k, 3.2 * px); g.beginPath(); g.arc(a, b, R, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = C.own; g.lineWidth = Math.max(2 * k, 1.8 * px); g.beginPath(); g.arc(a, b, R, 0, Math.PI * 2); g.stroke();
    }
    // 組を向かわせた行き先（前進の号令・地図での指図）：戦場の地面と同じ白い小旗と点線。使番が走っている間は薄く
    for (const grp of rt.squadGroups || []) {
      const pend = grp.pending && grp.pending.st.order === 'move' ? grp.pending.st : null;
      const dest = pend ? pend.dest : grp.order === 'move' ? grp.dest : null;
      if (!dest || !grp.count) continue;
      const c = grp.center();
      const [a1, b1] = tr(c.x, c.z), [a2, b2] = tr(dest.x, dest.z);
      g.save();
      g.globalAlpha = pend ? 0.6 : 1;
      g.strokeStyle = 'rgba(27,23,18,.75)'; g.lineWidth = 1.6 * k; g.setLineDash([4 * k, 5 * k]);
      g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke();
      g.setLineDash([]);
      this.flagIcon(g, a2, b2, r0 * 4.2);
      g.restore();
    }
    // 任務の印は兵の点より後に、墨の縁取りで。ミニマップの外の任務は縁に矢印
    for (const m of rt.markers) {
      const q = typeof m.pos === 'function' ? m.pos() : m.pos;
      if (!q) continue;
      let [a, b] = tr(q.x, q.z);
      const col = m.red ? C.enemy : '#c2961e';
      const rr = Math.hypot(a - Sz / 2, b - Sz / 2), rim = Sz / 2 - r0 * 3.2 - (tiny ? 3 * px : 0);
      const big = tiny ? 1.5 : 1;
      if (rotate && rr > rim) {
        const ang = Math.atan2(b - Sz / 2, a - Sz / 2);
        a = Sz / 2 + Math.cos(ang) * rim; b = Sz / 2 + Math.sin(ang) * rim;
        g.save(); g.translate(a, b); g.rotate(ang); g.scale(big, big);
        g.beginPath(); g.moveTo(r0 * 2.4, 0); g.lineTo(-r0 * 1.2, -r0 * 1.7); g.lineTo(-r0 * 1.2, r0 * 1.7); g.closePath();
        g.fillStyle = col; g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke(); g.fill();
        g.restore();
        continue;
      }
      g.save(); g.translate(a, b); g.rotate(Math.PI / 4); g.scale(big, big);
      g.strokeStyle = C.ink; g.lineWidth = 6; g.strokeRect(-r0 * 1.4, -r0 * 1.4, r0 * 2.8, r0 * 2.8);
      g.strokeStyle = col; g.lineWidth = 3; g.strokeRect(-r0 * 1.4, -r0 * 1.4, r0 * 2.8, r0 * 2.8);
      g.restore();
      if (!rotate) {
        g.font = `${Math.round(Sz / 50)}px sans-serif`;
        const t = typeof m.label === 'function' ? m.label() : m.label;
        g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(t, a + r0 * 2, b + 4);
        g.fillStyle = m.red ? C.enemy : C.ink; g.fillText(t, a + r0 * 2, b + 4);
      }
    }
    // 戦術マップでは部隊ごとの向きと、戦場と同じ形の隊旗（幟＝槍・弓、四角＝鉄砲、吹流し＝騎馬、大旗＝本陣）
    if (!rotate) {
      g.font = `${Math.round(Sz / 62)}px sans-serif`;
      const selSet = new Set(rt.squad.length ? rt.player.selectedGroups() : []);
      const many = rt.squadGroups.filter((x) => x.count > 0).length > 1;
      const fh = r0 * 3.6;
      for (const grp of rt.army.groups) {
        if (!grp.count || grp.name === 'player' || grp.units.every((u) => !u.alive || u.type === 'dummy' || u.type === 'porter')) continue;
        const c = grp.center();
        // 見えていない敵の隊は描かない（名のある敵将の隊だけは、旗で居場所が知れている）
        if (grp.team !== 0 && !seen(c.x, c.z) && !grp.units.some((x) => x.alive && x.type === 'busho' && x.name)) continue;
        const [a, b] = tr(c.x, c.z);
        const f = grp.forward();
        const [a2, b2] = tr(c.x + f.x * 10, c.z + f.z * 10);
        const col = grp.team !== 0 ? C.enemy : grp.isPlayerSquad ? C.own : C.ally;
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(a, b); g.lineTo(a2, b2); g.stroke();
        // 号令先に選んだ自分の組は、戦場と同じ金の輪
        if (grp.isPlayerSquad && selSet.has(grp) && (many || rt.player.cmdOpen)) {
          g.strokeStyle = '#120f0b'; g.lineWidth = 5; g.beginPath(); g.arc(a, b, r0 * 3.2, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = '#d8b04a'; g.lineWidth = 2.5; g.beginPath(); g.arc(a, b, r0 * 3.2, 0, Math.PI * 2); g.stroke();
        }
        const kind = grp._kind || groupKind(grp);
        // 乱れた隊は旗が傾く（戦場の旗と同じ）
        const lean = grp.routed ? 0.85 : grp.morale < 30 ? 0.32 : grp.morale < 55 ? 0.13 : 0;
        this.stdIcon(g, a + r0 * 1.6, b, fh, kind, col, lean);
        // 自分の組は旗の下に数の札（戦場の札と同じ色）
        if (grp.isPlayerSquad) {
          const tc = TAG_COL[tagOf(grp)];
          g.fillStyle = '#120f0b'; g.fillRect(a + r0 * 1.6 - 1, b + 2 - 1, r0 * 1.6 + 2, r0 * 1.2 + 2);
          g.fillStyle = tc; g.fillRect(a + r0 * 1.6, b + 2, r0 * 1.6, r0 * 1.2);
        }
        g.fillStyle = col;
        // 字は要る時だけ：自分の組は隊の名、敵は乱れた時だけ（意気盛ん・平常は書かない）
        const lbl = grp.isPlayerSquad ? ((rt.squadGroups.length > 1 ? GROUP_NAME[grp.kind] : '') || '自分の組') + (grp.morale < 50 ? ` ${moraleWord(grp.morale)}` : '') : grp.team !== 0 ? (grp.routed ? '潰走' : grp.morale < 50 ? moraleWord(grp.morale) : '') : '';
        if (lbl) { g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(lbl, a + r0 * 4.6, b - 4); g.fillText(lbl, a + r0 * 4.6, b - 4); }
      }
    }
    // ---- 囲まれつつある向き：自分のまわり 30m の敵を向きごとに数え、縁に朱の弧。半ば以上を囲まれたら弧を太くし、空いている向き（退き口）に墨の矢印 ----
    if (rotate && p.alive) {
      const NB = 16, bins = new Array(NB).fill(0), [pa0, pb0] = tr(p.pos.x, p.pos.z);
      for (const u of rt.army.units) {
        if (!u.alive || u.team === 0 || u.fleeing || u.type === 'dummy') continue;
        const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
        if (d > 30 || d < 0.5) continue;
        const [a, b] = tr(u.pos.x, u.pos.z);
        const ang = Math.atan2(b - pb0, a - pa0);
        bins[((Math.round(ang / (Math.PI * 2) * NB) % NB) + NB) % NB] += 1.2 - d / 30;
      }
      const hot = bins.map((v) => v >= 0.7), cover = hot.filter(Boolean).length, ring = cover >= NB / 2;
      if (cover) {
        const R = Sz / 2 - Math.max(5 * k, 4 * px), pulse = ring && !S.reduceMotion ? 0.75 + 0.25 * Math.sin(now * 6) : 1;
        g.lineCap = 'round';
        for (let i = 0; i < NB; i++) {
          if (!hot[i]) continue;
          const a = i / NB * Math.PI * 2, hw = Math.PI / NB * 0.92;
          g.strokeStyle = `rgba(178,51,31,${Math.min(0.95, 0.45 + bins[i] * 0.25) * pulse})`;
          g.lineWidth = Math.max((ring ? 9 : 6) * k, (ring ? 5 : 3.5) * px);
          g.beginPath(); g.arc(Sz / 2, Sz / 2, R, a - hw, a + hw); g.stroke();
        }
        g.lineCap = 'butt';
        if (ring && cover < NB) {
          // 退き口：いちばん長く空いている向きの真ん中
          let best = -1, bl = 0;
          for (let i = 0; i < NB; i++) { if (hot[i]) continue; let l = 0; while (l < NB && !hot[(i + l) % NB]) l++; if (l > bl) { bl = l; best = i; } }
          const ang = (best + (bl - 1) / 2) / NB * Math.PI * 2, rr = R - Math.max(10 * k, 6 * px);
          g.save(); g.translate(Sz / 2 + Math.cos(ang) * rr, Sz / 2 + Math.sin(ang) * rr); g.rotate(ang);
          const s = Math.max(r0, 2.4 * px);
          g.beginPath(); g.moveTo(s * 2.2, 0); g.lineTo(-s, -s * 1.5); g.lineTo(-s * 0.3, 0); g.lineTo(-s, s * 1.5); g.closePath();
          g.fillStyle = C.ink; g.strokeStyle = C.paper; g.lineWidth = Math.max(2, 1.2 * px); g.stroke(); g.fill();
          g.restore();
        }
      }
    }
    // 自分：墨の矢印に和紙の縁
    const [pa, pb] = tr(p.pos.x, p.pos.z);
    g.save(); g.translate(pa, pb);
    g.rotate(rotate && !northUp ? 0 : -(p.heading - Math.PI));
    if (tiny) g.scale(1.35, 1.35);
    g.beginPath(); g.moveTo(0, -r0 * 2.4); g.lineTo(r0 * 1.4, r0 * 1.5); g.lineTo(0, r0 * 0.8); g.lineTo(-r0 * 1.4, r0 * 1.5); g.closePath();
    g.strokeStyle = C.paper; g.lineWidth = 3; g.stroke();
    g.fillStyle = C.ink; g.fill();
    g.restore();
    g.restore();
    if (rotate) {
      // 墨の縁（筆で引いた輪。太さに少しむら）
      g.strokeStyle = 'rgba(27,23,18,.8)'; g.lineWidth = Math.max(3 * k, 1.6 * px);
      g.beginPath(); g.arc(Sz / 2, Sz / 2, Sz / 2 - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(27,23,18,.45)'; g.lineWidth = Math.max(2 * k, px);
      g.beginPath(); g.arc(Sz / 2 + 0.6 * px, Sz / 2 - 0.4 * px, Sz / 2 - 2.5 * px, 2.4, 5.6); g.stroke();
      // 北の方角（小さい時は描かない：丸が小さく、字が潰れる）
      if (!tiny) {
        const R = Sz / 2 - 16;
        const nx = Sz / 2 - Math.sin(yaw) * R, ny = Sz / 2 + Math.cos(yaw) * R;
        g.font = `bold ${Math.round(Sz / 14)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 4; g.strokeStyle = C.paper; g.strokeText('北', nx, ny);
        g.fillStyle = '#8a2a18'; g.fillText('北', nx, ny);
        g.textAlign = 'start'; g.textBaseline = 'alphabetic';
      }
    } else {
      g.font = `${Math.round(Sz / 40)}px sans-serif`;
      g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText('北 ↑', Sz / 2 - 16, 26);
      g.fillStyle = C.ink; g.fillText('北 ↑', Sz / 2 - 16, 26);
    }
  }
}
