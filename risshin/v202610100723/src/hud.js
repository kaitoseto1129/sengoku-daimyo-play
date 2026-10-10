import { battleSpeechAllowed, battleSpeaker } from './speech_clean.js';
import { woundText } from './wounds.js';
import { enemyKnown, campKnown, intelText } from './battle_intel.js';
import { weatherSight, weatherSees } from './weather_gameplay.js';
import { isTouch } from './touch.js';
import { BattleNotices } from './hud_notices.js';
import { currentObjective, markerName, goalText } from './mission_guide.js';

// 「／」で連ねた任務は普段の札では最初の一件。括弧の中の操作は保つ。
function firstTask(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '（' || c === '(') depth++;
    else if (c === '）' || c === ')') depth = Math.max(0, depth - 1);
    else if (!depth && (c === '／' || c === '/')) return text.slice(0, i).trim();
  }
  return text;
}
import * as THREE from 'three';
import { sfx, speaking } from './audio.js';
import { RANKS, RANK_CEIL, ITEMS, rankLabel } from './state.js';
import { commandList, SQUAD_FORMS, ORDER_NAME, FORM_NAME, RADIAL, GROUP_NAME } from './player.js';
import { S, K, reduceMotion } from './settings.js';
import { drawMon } from './textures.js';
import { GENERALS, FACTION } from './units.js';
import { sightPoint, sightRef, sightUnit, sightScreenUnit, sightDistant, sightArmyMesh, numberHint, woundHint, knownName, groupSeen } from './battle_sight.js';
import { CAPTURE, GATE_STATE } from './nawabari.js';
import { NAKA } from './naka.js';
import { isRtsOn, rtsSelection, rtsCollect, rtsSetPick, rtsPick, rtsSetMulti, rtsMultiOn, rtsOrder, terrainHints, rtsCanCommand } from './rts.js';
import { ORDERS as RTS_ORDERS, FORMS as RTS_FORMS, icon as rtsIcon } from './gunbai.js';
import { viewLevel, playerSonae } from './senkyo.js';
import { decorateTerms } from './glossary.js';
import { firstHelp, helpSeen } from './first_help.js';
import { FL } from './floors.js';
import { allyAction, allyPlace } from './ally_orders.js';

// 毎コマ書き替える札：前と同じ値なら DOM に触らない（重さの係。差分は最小に）
const _domCache = new WeakMap();
function setText(el, v) { if (_domCache.get(el) === v) return; _domCache.set(el, v); el.textContent = v; }
function setHtml(el, v) { const k = 'h:' + v; if (_domCache.get(el) === k) return; _domCache.set(el, k); el.innerHTML = v; if (el.id === 'subtitle' || el.id === 'h-who') decorateTerms(el); }

// 読み上げの下ごしらえ（呼ぶたびに作り直さない）
let jaVoice = null;
const VOICE_MAJOR = /信長|源八|大沢|藤吉郎|義元|日比野|稲田|師範|可成|光秀|利家|秀吉|磯野|豪盛|勝家|長可|信忠|長秀|一益|秀政|嘉隆|元正|信盛|秀隆|弥七/;
const VOICE_V = [[/藤吉郎|秀吉/, 1.25, 1.12], [/信長/, 0.9, 1.05], [/源八|大沢|師範|可成/, 0.8, 0.92], [/光秀/, 0.95, 0.95], [/利家/, 1.05, 1.05], [/弥七|与兵衛|足軽/, 1.1, 1.05], [/義元|豪盛|磯野/, 0.85, 0.95],
        [/勝家/, 0.78, 0.9], [/長可/, 0.82, 1.08], [/信忠/, 1.0, 1.0], [/長秀/, 0.9, 0.98], [/一益/, 0.88, 0.96], [/秀政|元正|信盛|秀隆/, 0.95, 1.0], [/嘉隆/, 0.85, 0.95]];
let _dropSp = null;
function dropSprite() {
  if (_dropSp) return _dropSp;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32 - 32 * 0.3, 32 - 32 * 0.35, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(0.35, 'rgba(200,210,215,.18)'); gr.addColorStop(0.85, 'rgba(40,44,46,.28)'); gr.addColorStop(1, 'rgba(40,44,46,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 32, 0, Math.PI * 2); g.fill();
  return (_dropSp = c);
}
function setWidth(el, pct) { const v = pct + '%'; if (_domCache.get(el) === v) return; _domCache.set(el, v); el.style.width = v; }

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
const ENEMY_MON = new Set(['takeda', 'akazonae', 'furin', 'imagawa', 'saito', 'azai', 'asakura', 'otani', 'ishida', 'shimazu', 'toyotomi', 'ukita', 'sanada', 'konishi', 'chosokabe', 'hikyaku', 'maru', 'namu', 'yatagarasu', 'sagarifuji', 'miyoshi', 'rokkaku', 'uesugi', 'mori']);
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
  [/、崩れました$/, 'sonaeRout', 20],
  [/騎馬.*(止ま|止め)/, 'cavstop'], [/崩れ(て|た).*(逃げ|退)|敵が逃げ|敵.*(崩れ|総崩れ|背を見せ|槍を捨て)/, 'rout'], [/矢が来る|矢の雨/, 'arrow'], [/鉄砲.*(狙|来る)/, 'gun'],
  [/組頭を討ち取った/, 'leader'], [/持たぬ|押されておる|下がれ、下がれ/, 'waverA'], [/崩れるぞ|だめじゃ、逃げろ|持ちこたえられぬ/, 'waverB'],
  // 横腹の進み具合（1/6・2/6…）は、どの隊の物でも一つの束に。間を 10 秒あける
  [/横腹を突いている/, 'flank', 10], [/向き直って|気づいた/, 'turn'],
  // 鉄砲組の撃った手応え（倒した数）は 8 秒に一度まで
  [/鉄砲組が.*人を倒した/, 'volleyKill', 8],
  // 同じ用向きの知らせの洪水を止める（見回り 10/8）：首の催促・鼓舞・組と離れた・使番・囲まれた・法螺と太鼓・寄せてくる
  [/証がない|首を袋に納めよ/, 'proof', 150], [/鼓舞/, 'rally', 90], [/組と離れすぎ|ついて来い/, 'tofollow', 90],
  [/使番が走って/, 'runner', 60], [/囲まれた味方|向きを変えよ/, 'surround', 60], [/法螺貝と太鼓|鐘二つ|鐘の早打ち/, 'signal', 90],
  [/命が届いた/, 'delivered', 60], [/前から(槍|一撃)|振りかぶった|打ち込みを受け/, 'incoming', 45],
  [/小勢がこちらへ|寄せてくる/, 'raid', 45], [/お助けいたす|刃が光った/, 'aid', 60],
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
  s = s.replace(/文字([上中下])段(10|[1-9])/g, (m, row, col) => {
    const r = '上中下'.indexOf(row), c = Number(col) - 1;
    let keys = '';
    for (let y = 0; y < 3; y++) for (let x = 0; x < [10, 9, 7][y]; x++) keys += `<rect x="${2 + x * 7 + y * 2}" y="${2 + y * 7}" width="5" height="5" rx="1" fill="${y === r && x === c ? '#ffb09a' : '#b9b09c'}"/>`;
    return `<kbd class="cap" title="文字キーの${row}段、左から${col}番目" style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap"><svg aria-hidden="true" viewBox="0 0 76 23" style="width:76px;height:23px">${keys}</svg>${row}段${col}</kbd>`;
  });
  if (isTouch) return s.replace(TOUCH_BTN, (m, b) => `<span class="tbtn">${b}</span>`);
  return s.replace(/(^|[\s（(／・、。])((?:[上中下]段[0-9]+|機能[0-9]+|ダブリュー|エックス|ゼット|エイチ|エー|ビー|シー|ディー|イー|エフ[0-9]*|ジー|アイ|ジェー|ケー|エル|エム|エヌ|オー|ピー|キュー|アール|エス|ティー|ユー|ブイ|ワイ|左シフト|右シフト|スペース|タブ|決定キー|戻るキー|オルト|上矢印|下矢印|左矢印|右矢印))(?=[\s）)／・で、。をのか]|$)/g, (m, a, b) => `${a}${b.split(' ').map((k) => `<kbd class="cap">${k}</kbd>`).join('')}`);
}
// 手ほどきの札の見た目（index.html の #tutorial を上書き）
// 緊迫の見せ方（画面の縁）：深手のにじみ・狙われている赤い脈・倒れる寸前の一撃。兵力の帯の「敵は何倍」
function tensionCss() {
  if (document.getElementById('tension-css')) return;
  const st = document.createElement('style');
  st.id = 'tension-css';
  st.textContent = `
#hud #prompt.fence-blocked { top:48%; max-width:min(280px, 34vw); box-sizing:border-box; padding:6px 8px; font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.5; color:var(--washi); background:rgba(12,10,8,.95); border:2px solid var(--kin); text-align:center; }
#hud #prompt.fence-blocked strong { display:block; color:var(--kin); }
#hud #prompt.fence-blocked small { display:block; font-size:max(15px, calc(15px * var(--text-scale, 1))); }
#hud .mk:has(.behind-label) { display:flex; flex-direction:column; align-items:center; gap:4px; }
#hud .mk .behind-label { display:block; max-width:min(280px, 42vw); white-space:normal; overflow-wrap:anywhere; line-height:1.4; font-size:max(16px, calc(16px * var(--text-scale, 1))); color:var(--kin); background:#14120f; padding:4px 8px; box-sizing:border-box; }
#hud #cmdpanel .squad-forms { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 8px; }
#hud #cmdpanel .squad-forms button { min-height: 48px; min-width: 44px; padding: 6px; font: inherit; font-size: max(12px, calc(13px * var(--text-scale, 1))); line-height: 1.3; color: var(--washi); background: #14120f; border: 1px solid var(--washi-dim); cursor: pointer; }
#hud #cmdpanel .squad-forms small { display: block; margin-top: 4px; font-size: 12px; color: var(--washi-dim); }
#hud #cmdpanel .squad-forms button[aria-pressed=true] { border: 2px solid var(--kin); background: #30291c; }
#hud #cmdpanel .squad-forms button:focus-visible { outline: 3px solid var(--kin); box-shadow: 0 0 0 5px #14120f; }
#hud #cmdpanel .squad-forms button:active { background: #30291c; }
html.touch #hud #cmdpanel ol { gap: 8px; }
#vignette.dying { backdrop-filter: blur(2.5px) saturate(.55); -webkit-backdrop-filter: blur(2.5px) saturate(.55); -webkit-mask-image: radial-gradient(ellipse 62% 58% at 50% 50%, transparent 55%, #000 100%); mask-image: radial-gradient(ellipse 62% 58% at 50% 50%, transparent 55%, #000 100%); animation: dyingPulse .95s ease-in-out infinite; }
@keyframes dyingPulse { 0%, 100% { box-shadow: inset 0 0 200px rgba(120,10,2,.62); } 18% { box-shadow: inset 0 0 260px rgba(150,14,4,.8); } }
#aimwarn { position: absolute; inset: 0; pointer-events: none; opacity: 0; background: radial-gradient(ellipse 78% 74% at 50% 50%, transparent 58%, rgba(92,16,6,.34) 82%, rgba(52,8,2,.66) 100%); transition: opacity .5s; }
#aimwarn.on { opacity: 1; animation: aimPulse 1.1s ease-in-out infinite alternate; }
@keyframes aimPulse { from { opacity: .55; } to { opacity: 1; } }
#brinkfx { position: absolute; inset: 0; pointer-events: none; opacity: 0; background: radial-gradient(ellipse at center, rgba(90,0,0,.15) 30%, rgba(40,0,0,.92) 100%); }
#brinkfx.on { animation: brinkA 1.6s ease-out; }
@keyframes brinkA { 0% { opacity: 1; background-color: rgba(255,240,230,.35); } 8% { background-color: rgba(0,0,0,0); } 100% { opacity: 0; } }
body.rm #vignette.dying { animation: none; box-shadow: inset 0 0 220px rgba(130,12,4,.7); }
#mobfx { position: fixed; inset: 0; pointer-events: none; opacity: 0; transition: opacity .5s; background: linear-gradient(90deg, rgba(20,6,4,.55), transparent 16%, transparent 84%, rgba(20,6,4,.55)); }
#mobfx.on { opacity: 1; animation: mobIn 1.2s ease-in-out infinite alternate; }
@keyframes mobIn { to { background-size: 115% 100%; } }
body.rm #mobfx.on { animation: none; }
body.rm #aimwarn.on { animation: none; }
#encircle { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .9s; -webkit-mask-image: radial-gradient(ellipse 72% 72% at 50% 50%, transparent 56%, rgba(0,0,0,.55) 80%, #000 100%); mask-image: radial-gradient(ellipse 72% 72% at 50% 50%, transparent 56%, rgba(0,0,0,.55) 80%, #000 100%); }
#encircle.on { opacity: 1; }
#hud.photo #encircle, #hud.photo #aimwarn, #hud.photo #brinkfx { display: none; }
#crosshair .range-cue { position: absolute; left: 50%; top: 30px; transform: translateX(-50%); white-space: nowrap; font-size: 12px; line-height: 1.4; padding: 2px 6px; color: #ece4d2; background: #14120f; border-radius: 3px; pointer-events: none; }
#crosshair .range-cue[hidden] { display: none; }
/* 軍の説明は読むだけ。子の字も携帯の突く・構えの入力を受け取らない。 */
#hud #armybar, #hud #armybar *, #sonae-cards * { pointer-events: none; }
html.touch #hud:has(#radial:not([hidden])) #armybar,
html.touch #hud:has(#cmdpanel:not([hidden])) #armybar,
html.touch body:has(#hud #radial:not([hidden])) #sonae-cards,
html.touch body:has(#hud #cmdpanel:not([hidden])) #sonae-cards { visibility: hidden; }
#armybar .outnum { color: #ff8a70; font-weight: 700; margin: 0 6px; letter-spacing: .04em; }
/* 狭い画面では見える敵の数を別行にして、札の頭が切れないようにする */
@media (max-width: 1000px) { #armybar .outnum { display: block; margin: 0; white-space: nowrap; } }
#hud #armybar .side .nm { flex-wrap: wrap; white-space: normal; overflow: visible; text-overflow: clip; }
#hud #armybar .side .nm .n { white-space: normal; overflow: visible; overflow-wrap: anywhere; }
#hud #armybar .side .nm small { flex-basis: 100%; order: 1; line-height: 1.4; }
#hud #armybar { max-height: none; overflow: visible; }
#hud .mk.main.edge { width: 28px; height: 28px; white-space: nowrap; }
#hud .mk.main.edge::before { display: none; }
#hud .mk.main.edge::after { font-size: 24px; top: 0; text-shadow: 0 1px 3px #000; }
#hud #h-hp.bleeding { outline: 2px solid var(--shu-text); animation: bleedPulse 1.6s ease-in-out infinite; }
@keyframes bleedPulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
body.rm #hud #h-hp.bleeding { animation: none; opacity: 1; }
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
#hud #tutorial.coach.tutold { width: auto; min-width: 0; padding: 4px 10px; }
#hud #tutorial.coach.tutold .what, #hud #tutorial.coach.tutold .how { display: none; }
#hud:has(#banner.show) #compass { opacity: .2; transition: opacity .3s; }
#hud #skiphint:not([hidden]) { min-height: 44px; box-sizing: border-box; display: flex; align-items: center; }
@keyframes coachIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
body.rm #hud #tutorial.coach.in { animation: none; }
@media (prefers-reduced-motion: reduce) { #hud #tutorial.coach.in { animation: none; } }
/* 携帯の横向き：左上の釦と戦功の札の下、歩く棒の上に小さく */
@media (max-height: 500px) {
  /* 幅は中身に合わせる（短い札で戦場を横に長くふさがない） */
  #hud #tutorial.coach { top: calc(128px + env(safe-area-inset-top, 0px)); left: calc(76px + env(safe-area-inset-left, 0px)); width: max-content; min-width: 140px; max-width: 236px; padding: 7px 11px 8px; }
  #hud #tutorial.coach .what { font-size: 16px; }
  #hud #tutorial.coach .how { font-size: 13px; }
  #hud #tutorial.coach .what.sm { font-size: 14px; }
}`;
  document.head.appendChild(st);
}

// 上空視点（rts.js）の帯：選んだ部隊の札・下知の釦・構えの横開き（F5・docs/siege-plan.md）
function rtsCss() {
  if (document.getElementById('rts-css')) return;
  const st = document.createElement('style');
  st.id = 'rts-css';
  st.textContent = `
#rts-dock { position: fixed; left: 0; right: 0; bottom: 0; z-index: 24; display: flex; flex-direction: column; gap: 6px;
  padding: 8px calc(10px + env(safe-area-inset-right, 0px)) calc(8px + env(safe-area-inset-bottom, 0px)) calc(10px + env(safe-area-inset-left, 0px));
  background: linear-gradient(0deg, rgba(10,9,7,.86), rgba(10,9,7,0)); pointer-events: none; }
#rts-dock[hidden] { display: none; }
#rts-dock .rts-cards { display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden; pointer-events: auto; padding: 2px; }
#rts-dock .rts-card { flex: 0 0 auto; width: 54px; height: 60px; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 3px;
  background: linear-gradient(180deg, #2c3446, #1a1f2b); border: 1px solid rgba(143,166,200,.6); color: var(--washi); font: 600 12px var(--ui); }
#rts-dock .rts-card canvas { width: 24px; height: 24px; }
#rts-dock .rts-card .mb { display: block; width: 44px; height: 4px; background: rgba(0,0,0,.6); }
#rts-dock .rts-card .mb i { display: block; height: 100%; background: #9fc28a; }
#rts-dock .rts-card .mb.md i { background: #e0b44a; } #rts-dock .rts-card .mb.lo i { background: #d4553b; }
#rts-dock .rts-card.off { background: linear-gradient(180deg, #3a3a3a, #232323); border-color: rgba(180,180,180,.5); filter: grayscale(1); }
#rts-dock .rts-card.off canvas { opacity: .5; }
#rts-dock .rts-card.off small { font: 700 9px/1.1 var(--ui); color: #e8d7b0; text-align: center; }
#rts-dock .rts-none { pointer-events: none; margin: 0 0 2px; font: 600 13px var(--ui); color: var(--washi-dim); text-shadow: 0 1px 2px #000; }
#rts-dock .rts-row { display: flex; gap: 8px; pointer-events: auto; flex-wrap: wrap; }
#rts-dock button { min-height: 44px; min-width: 44px; font: 600 13px/1.1 var(--ui); color: var(--washi); background: rgba(44,40,33,.92);
  border: 1px solid rgba(194,162,90,.45); display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; }
#rts-dock button svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
#rts-dock button.on, #rts-dock button[aria-pressed="true"] { background: rgba(192,69,46,.6); border-color: #f0c070; }
#rts-dock button[disabled] { opacity: .38; }
#rts-dock .rts-forms { display: none; gap: 8px; flex-wrap: wrap; pointer-events: auto; padding-bottom: 4px; border-bottom: 1px dashed rgba(194,162,90,.35); }
#rts-dock .rts-forms.open { display: flex; }
@media (max-width: 720px) { #rts-dock .rts-card { width: 46px; height: 54px; } #rts-dock button span.lb { display: none; } #rts-dock button { min-width: 44px; padding: 4px 8px; justify-content: center; } }
`;
  document.head.appendChild(st);
}
const MON_ICON = {};
function monIcon(k) {
  if (MON_ICON[k]) return MON_ICON[k];
  const src = document.createElement('canvas'); src.width = 48; src.height = 96;
  try { drawMon(src.getContext('2d'), k, 48, 96); } catch (e) { /* 絵の無い家紋 */ }
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  c.getContext('2d').drawImage(src, 8, 96 * 0.32 - 16, 32, 32, 0, 0, 32, 32);
  return (MON_ICON[k] = c);
}

// 触る端末（スマホ横・iPad）で「画面の札の量：最小」の時は、戦場を見せるのを一番に（字は要る瞬間だけ）
const leanHud = () => isTouch && (S.hudMode || 'normal') === 'min';
// 門や柵の操作は近くの行動札へ。任務と道しるべには下知だけ残す。
const fieldLabel = (text) => /門|木戸|柵/.test(text) ? text.replace(/（[^）]*(?:長押し|キー)[^）]*）/g, '').trim() : text;
const guidanceEnded = (rt) => rt.over || rt.ended || rt.flags.ending || rt.tracker?.main === false || !rt.player.u.alive;

export function moraleWord(m) {
  if (m >= 75) return '意気盛ん';
  if (m >= 50) return '平常';
  if (m >= 30) return '動揺';
  return '崩れかけ';
}

// 任務の進み具合の字から割合を読む（「5/20」「一の門 5%」）。読めなければ null
function progressRatio(s) {
  s = String(s).replace(/[０-９／％]/g, (c) => c === '／' ? '/' : c === '％' ? '%' : String(c.charCodeAt(0) - 0xff10));
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
  if (knownName(u)) return knownName(u);
  return { ashigaru: '敵足軽', samurai: '敵侍', busho: '敵武将', bow: '敵弓兵', gun: '敵鉄砲足軽', cavalry: '敵騎馬', dummy: '藁人形', porter: '人足' }[u.type] || '敵';
}

export class Hud {
  constructor() {
    this.root = $('hud');
    stackBottomLeft();
    this.subQ = [];
    this.subT = 0;
    this.log = [];
    this.orderLog = [];
    this.introRead = false;
    try { this.introRead = localStorage.getItem('risshin-intro-read') === '1'; } catch (e) { /* 覚えられなくても、その場では一度だけ */ }
    this.objKey = '';
    this.curObjKey = null;
    this.markerEls = new Map();
    this.threatEls = [];
    this.mmT = 0;
    this.hurtT = 0;
    this.bigmap = false;
    this.bannerQ = [];
    this.bannerT = 0;
    this.lastToast = null;
    this.notices = new BattleNotices(this);
    this.logEntry = document.createElement('button');
    this.logEntry.id = 'battle-log-entry';
    this.logEntry.type = 'button'; this.logEntry.className = 'btn small'; this.logEntry.hidden = true;
    this.logEntry.style.cssText = 'position:relative;inset:auto;transform:none;min-height:44px;pointer-events:auto;width:100%;box-sizing:border-box;background:#14120f;color:#ece4d2;border-color:#c2a25a';
    this.logEntry.onclick = (e) => { e.stopPropagation(); this.toggleLog(true); };
    this.logEntry.addEventListener('keydown', (e) => e.stopPropagation());
    $('objectives').appendChild(this.logEntry);
    // 未読の下知は任務の札の中で読む。
    this.notices.sync();
    this.keyboardInput = false;
    window.addEventListener('keydown', () => { this.keyboardInput = true; }, true);
    window.addEventListener('pointerdown', () => { this.keyboardInput = false; }, true);
    this.tmpV = new THREE.Vector3();
    this.slowT = 0;
    // 筆の線の形を CSS へ（index.html の「墨の HUD」が使う）
    try { this.root.style.setProperty('--fude', `url(${fudeImage()})`); } catch (e) { /* 描けない時はただの細い線 */ }
    // 戸口の札は指でも押せる。移動や斬る操作へ押した事を流さない。
    const entrance = $('prompt');
    entrance.addEventListener('pointerdown', (e) => { if (e.target.closest('button[data-entry]')) e.stopPropagation(); });
    entrance.addEventListener('keydown', (e) => {
      const b = e.target.closest('button[data-entry]');
      if (!b) return;
      if (e.key === 'Tab') e.stopPropagation();
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) b.click(); }
    });
    entrance.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-entry]'), rt = this.rt;
      if (!b || !rt || rt.over || !rt.player.u.alive || this.root.hidden) return;
      e.stopPropagation();
      const it = rt.nearestInteract();
      if (it && it.id === b.dataset.entry) { rt.interact(); entrance.hidden = true; }
    });
    // 任務の札：低い画面で「ほか n 件」を押すと、全部の任務を 6 秒だけ開く
    const ob = $('objectives');
    if (ob) {
      ob.tabIndex = -1; ob.setAttribute('role', 'group'); ob.setAttribute('aria-label', '今の任務。押すとほかの任務を開く');
      const list = $('obj-list');
      list.tabIndex = 0; list.setAttribute('role', 'button'); list.setAttribute('aria-expanded', 'false'); list.setAttribute('aria-label', '任務の一覧を開く');
      ob.addEventListener('click', () => { ob.classList.toggle('expand'); list.setAttribute('aria-expanded', String(ob.classList.contains('expand'))); list.setAttribute('aria-label', ob.classList.contains('expand') ? '任務の一覧を閉じる' : '任務の一覧を開く'); this.notices.sync(); clearTimeout(this.objExpT); });
      ob.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) ob.click(); } });
    }
    // 部隊の帯：札を押すと、その隊を号令先に選ぶ（もう一度押すと全隊）
    const hu = $('h-units');
    if (hu) hu.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-sel]');
      if (b) this.pickGroup(b.dataset.sel);
      const ally = e.target.closest('button[data-ally]');
      if (ally) { this.allyReport = ally.getAttribute('aria-label'); this.toggleLog(true); }
      // 携帯：［ほか］で控えの武将の札を 6 秒だけ開く
      if (e.target.closest('button[data-allies]')) { this.alliesOpen = !this.alliesOpen; clearTimeout(this.alliesT); this.unitsKey = ''; if (this.rt) this.updateUnits(this.rt); }
    });
    // 携帯：組の一行を押すと、陣形と隊ごとの号令を選ぶ札を開く
    const hs = $('h-squad');
    if (hs) {
      hs.tabIndex = 0; hs.setAttribute('role', 'button'); hs.setAttribute('aria-label', '組の陣形を選ぶ'); hs.setAttribute('aria-expanded', 'false'); hs.setAttribute('aria-controls', 'cmdpanel');
      hs.addEventListener('click', () => {
        const p = this.rt && this.rt.player;
        if (!p || !this.rt.squadGroups.length) return;
        p.cmdOpen = !p.cmdOpen; p.cmdOpenT = 0; p.radial = false;
      });
      hs.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) hs.click(); } });
    }
    // Alt＋数字（号令の輪を開いている間は数字だけ）でも選ぶ。武器の持ち替え（1・2）より先に受け取る
    window.addEventListener('keydown', (e) => {
      const rt = this.rt;
      if (!rt || !rt.squadGroups || this.root.hidden || !rt.player || e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false])')) return;
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
    if (!(rt.t - (rt.allyAt ?? -1e9) < 2)) {   // 2 秒に一度（コマ数でなく戦の時間で数える）
      rt.allyAt = rt.t;
      rt.allyGroups = rt.army.groups.filter((g) => { const gg = g.team === 0 && !g.isPlayerSquad && g.count > 0 ? groupGeneral(g) : null; return !!(gg && gg.name); })
        .map((g) => ({ g, d: Math.hypot(g.center().x - pu.x, g.center().z - pu.z) })).sort((a, b) => a.d - b.d).slice(0, 3).map((x) => x.g);
    }
    // 名のある味方の札は、組を率いる身分（か大名）から。足軽の時は号令できないので出さない
    const allies = own.length || rt.G.lordTitle ? (rt.allyGroups || []).filter((g) => g.count > 0 && sightRef(rt, g, g.center())) : [];
    if (!own.length && !allies.length) { el.hidden = true; this.unitsKey = ''; return; }
    el.hidden = false;
    const mon = rt.def.sides ? rt.def.sides.a.mon : 'tokugawa';
    const many = kinds.length > 1;
    const cards = [];
    if (many) cards.push({ k: 'all', html: `<button type="button" class="uc all ${p.selGroup === 'all' ? 'on' : ''}" data-sel="all" aria-pressed="${p.selGroup === 'all'}" aria-label="全隊に号令する${isTouch ? '' : '（オルトと0）'}"><b>全</b><span class="nm">全隊</span><kbd>0</kbd></button>` });
    for (const k of kinds) {
      const gs = own.filter((g) => g.kind === k);
      const n = gs.reduce((a, g) => a + g.units.filter((u) => sightUnit(rt, u)).length, 0);
      const mor = gs.reduce((a, g) => a + g.morale, 0) / gs.length;
      const g0 = gs[0];
      const seen = groupSeen(rt, g0);
      const ord = !seen ? '' : g0.focus ? 'focus' : g0.order;
      const sel = many && (p.selGroup === 'all' || p.selGroup === k);
      const tg = tagOf(g0);
      const i = kinds.indexOf(k) + 1;
      const nm = many ? GROUP_NAME[k] || '組' : '自分の組';
      // 鉄砲の組は、込め終えて撃てる数（込めている者は u.reload を持つ）
      const guns = k === 'gun' ? gs.reduce((a, g) => a + g.units.filter((x) => sightUnit(rt, x) && x.type === 'gun').length, 0) : 0;
      const ready = k === 'gun' ? gs.reduce((a, g) => a + g.units.filter((x) => sightUnit(rt, x) && x.type === 'gun' && !x.reload).length, 0) : 0;
      const lbl = `${nm} ${numberHint(n)} 号令${ORDER_NAME[ord] || '様子不明'}${g0.pending ? '（使番が伝えに走っている）' : ''}${guns ? ` 込め終わり${ready}／${guns}` : ''}`;
      const inner = `<span class="face ${faceCls(k, mon)} ${mor < 30 ? 'waver' : ''}"></span>` +
        `<i class="ord ${g0.pending ? 'pend' : ''}" aria-hidden="true">${ORDER_MARK[ord] || '・'}</i>${g0.pending ? `<i class="runner" aria-hidden="true" title="使番が走っている">使番を出した</i>` : ''}<i class="cnt" style="box-shadow:inset 4px 0 0 ${TAG_COL[tg]}, 0 0 0 1px #000" aria-hidden="true">${numberHint(n)}</i>` +
        `<span class="nm">${esc(nm)}</span>${many ? `<kbd aria-hidden="true">${i}</kbd>` : ''}` +
        (guns ? `<i class="ready" aria-hidden="true" title="込め終わり">${ready}/${guns}</i>` : '');
      cards.push({ k, html: many ? `<button type="button" class="uc own ${sel ? 'on' : ''}" data-sel="${k}" aria-pressed="${sel}" aria-label="${esc(lbl)}${isTouch ? '' : `（オルトと${i}）`}">${inner}</button>` : `<div class="uc own solo" role="img" aria-label="${esc(lbl)}">${inner}</div>` });
    }
    // 携帯の横向き：一段に自分の組の札だけ。控えの武将は［ほか］を押した時だけ
    const phone = (isTouch ? document.documentElement.classList.contains('tc-low') : window.matchMedia('(max-height: 500px)').matches) && own.length > 0;
    if (phone && allies.length) cards.push({ k: 'allies', html: `<button type="button" class="uc al ${this.alliesOpen ? 'on' : ''}" data-allies="1" aria-pressed="${!!this.alliesOpen}" aria-label="味方の武将の隊 ${allies.length}つ（押すと${this.alliesOpen ? '畳む' : '出す'}）"><b>…</b><span class="nm">ほか</span></button>` });
    for (const g of phone && !this.alliesOpen ? [] : allies) {
      const gen = groupGeneral(g);
      if (!gen || !gen.name) continue;   // 武将が討たれても隊が残る時がある
      const full = gen.name.replace(/^.* /, '');
      // 札に収まらない五字以上の名は、下の名（「藤吉郎」）で。読み上げには全部の名
      // 背の低い指の画面（札が細い）では、四字の名も下の名二字（「信長」「光秀」）に
      const nm = full.length >= 5 ? full.slice(-3) : full.length === 4 && isTouch && innerHeight <= 500 ? full.slice(-2) : full;
      const fighting = g.units.some((u) => u.alive && (u.target || u.atk));
      const st = allyAction(g);
      const report = rt.allyOrders && rt.allyOrders.find((r) => r.g === g && r.active);
      const place = report ? allyPlace(report.x, report.z, pu) : '';
      const gm = (GENERALS[full] || {}).mon || mon;
      cards.push({ k: 'a' + g.id, html: `<button type="button" data-ally="${g.id}" class="uc ally ${fighting ? 'fight' : ''} ${g.routed || g.order === 'retreat' ? 'back' : ''}" aria-label="${report ? '小地図の' + report.number + '、' : ''}${esc(full)}の隊 ${numberHint(g.count)} ${place} ${st}">` +
        `<span class="face ${faceCls('honjin', gm)} ${g.morale < 30 ? 'waver' : ''}"></span><i class="cnt ally" aria-hidden="true">${numberHint(g.count)}</i>` +
        `<span class="nm ${nm.length >= 5 ? 'long' : ''}">${report ? report.number + ' ' : ''}${esc(nm)}</span><span class="st">${st === '持ち場を守る' ? '守る' : st === '合図を待つ' ? '待つ' : st === '戦っている' ? '戦う' : st === '攻めている' ? '攻める' : st === '移動中' ? '進む' : '退く'}</span></button>` });
    }
    const key = cards.map((c) => c.html).join('');
    if (key === this.unitsKey) return;
    this.unitsKey = key;
    el.innerHTML = key;
    el.setAttribute('aria-label', many ? (isTouch ? '部隊（札を押して号令先を選ぶ）' : '部隊（札を押すか オルトと数字で号令先を選ぶ）') : '部隊');
    // 下の札（槍・打刀・指揮…）と重ならないよう、右の空きに収めて足りなければ上へ折り返す
    // 指の端末では下の札が無いので、幅は CSS（右下の丸に掛からない幅）に任せる
    if (isTouch) { el.style.maxWidth = ''; return; }
    // 低い画面（幅 844×高さ 390 など）：札を二段・三段に積むと上の任務の札に掛かるので、一段に並べる（幅の 45%）
    if (window.matchMedia('(max-height: 500px)').matches) { el.style.maxWidth = Math.round(window.innerWidth * 0.45) + 'px'; return; }
    const hb = $('h-bottom').getBoundingClientRect();
    el.style.maxWidth = Math.max(160, window.innerWidth - (hb.right || 0) - 32) + 'px';
  }


  // 上空視点（rts.js）の帯：選んだ部隊の札・下知の釦 6・構えの横開き・複数選び（F5）
  buildRtsDock() {
    rtsCss();
    const el = document.createElement('div');
    el.id = 'rts-dock';
    el.hidden = true;
    el.innerHTML = `<div class="rts-cards" id="rts-cards" role="listbox" aria-label="選んだ部隊"></div>
      <div class="rts-forms" id="rts-forms" role="group" aria-label="構え（陣形）"></div>
      <div class="rts-row" id="rts-ord" role="group" aria-label="下知"></div>
      <div class="rts-row"><button type="button" id="rts-multi" aria-pressed="false">複数選び</button></div>`;
    document.body.appendChild(el);
    this.rtsEl = el;
    this.rtsOrdKey = ''; this.rtsCardKey = ''; this.rtsFormOpen = false;
    $('rts-ord').addEventListener('click', (e) => {
      const t = e.target.closest('[data-ord]'); if (!t || t.disabled) return;
      const id = t.dataset.ord;
      const b = this.rt;
      if (id === 'form') { this.rtsFormOpen = !this.rtsFormOpen; this.rtsOrdKey = ''; return; }
      if (id === 'move' || id === 'attack') {
        rtsSetPick(b, rtsPick(b) === id ? null : id);
        this.flash(id === 'move' ? '地図を押して行き先を指す' : '敵の隊を押す', 'dim');
        this.rtsOrdKey = '';
        return;
      }
      this.rtsFormOpen = false;
      rtsOrder(b, id, {});
    });
    $('rts-forms').addEventListener('click', (e) => {
      const t = e.target.closest('[data-form]'); if (!t || t.disabled) return;
      this.rtsFormOpen = false; this.rtsOrdKey = '';
      rtsOrder(this.rt, 'form', { f: t.dataset.form });
    });
    $('rts-multi').addEventListener('click', () => {
      const on = !rtsMultiOn(this.rt);
      rtsSetMulti(this.rt, on);
      this.rtsOrdKey = '';
    });
  }
  updateRts(rt) {
    if (!this.rtsEl) this.buildRtsDock();
    this.rtsEl.hidden = false;
    const sel = new Set(rtsSelection(rt));
    const list = rtsCollect(rt);
    const own = list.filter((e) => sel.has(e.o));
    // 隊の札：家紋・兵数・士気の帯
    const cardsHtml = own.length ? own.map((e) => {
      const mc = e.m > 60 ? 'hi' : e.m > 30 ? 'md' : 'lo';
      const ok = rtsCanCommand(rt, e.o);
      if (!ok) {
        return `<div class="rts-card off" role="img" aria-label="${esc(e.name)}。下知できない（身分が足りない）" title="下知できない（身分が足りない）">` +
          `<canvas width="24" height="24" data-mon="${esc(e.mon)}" aria-hidden="true"></canvas><b>${numberHint(e.n)}</b>` +
          `<small>下知<br>できない</small></div>`;
      }
      return `<div class="rts-card" role="img" aria-label="${esc(e.name)}。${numberHint(e.n)}">` +
        `<canvas width="24" height="24" data-mon="${esc(e.mon)}" aria-hidden="true"></canvas><b>${numberHint(e.n)}</b>` +
        `</div>`;
    }).join('') : '<p class="rts-none">隊を押して選ぶ（長押しで囲む・複数選びで足す）</p>';
    if (cardsHtml !== this.rtsCardKey) {
      this.rtsCardKey = cardsHtml;
      const box = $('rts-cards');
      box.innerHTML = cardsHtml;
      for (const c of box.querySelectorAll('canvas[data-mon]')) c.getContext('2d').drawImage(monIcon(c.dataset.mon), 0, 0, 24, 24);
    }
    // 下知の釦（choose した物、かつ身分で動かせる物がある時だけ押せる）
    const pick = rtsPick(rt), multi = rtsMultiOn(rt);
    const cmdable = own.filter((e) => rtsCanCommand(rt, e.o));
    const hasGun = cmdable.some((e) => e.real && e.o.units.some((u) => u.alive && (u.type === 'gun' || u.type === 'bow')));
    const ordHtml = RTS_ORDERS.map((o) => {
      const ok = cmdable.length && (o.id !== 'fire' || hasGun);
      const on = (o.id === 'form' && this.rtsFormOpen) || (o.id === pick);
      return `<button type="button" data-ord="${o.id}" ${ok ? '' : 'disabled'} class="${on ? 'on' : ''}" aria-pressed="${on}" title="${o.note}">${rtsIcon(o.ic)}<span class="lb">${o.label}</span></button>`;
    }).join('');
    const cur = own.length === 1 && own[0].real ? own[0].o.formation : null;
    const formHtml = RTS_FORMS.map((f) => `<button type="button" data-form="${f.f}" class="${cur === f.f ? 'on' : ''}" aria-pressed="${cur === f.f}" title="${f.note}">${rtsIcon(f.ic)}<span class="lb">${f.label}</span></button>`).join('');
    const key = ordHtml + formHtml + this.rtsFormOpen + multi;
    if (key !== this.rtsOrdKey) {
      this.rtsOrdKey = key;
      $('rts-ord').innerHTML = ordHtml;
      $('rts-forms').innerHTML = formHtml;
      $('rts-forms').classList.toggle('open', this.rtsFormOpen);
      const mb = $('rts-multi'); mb.setAttribute('aria-pressed', String(multi)); mb.classList.toggle('on', multi);
    }
  }
  hideRts() { if (this.rtsEl) this.rtsEl.hidden = true; }

  show(on) {
    this.root.hidden = !on;
    if (!on) { clearTimeout(this.flashDefer); this.flashDefer = 0; const cv = $('overlay'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }
  }

  // 開戦の大見出し（◯◯軍 VS ◯◯軍）と上下の黒帯
  intro(sides, name, date) {
    const el = $('intro');
    el.hidden = false;
    // 映画の題の札のように：日付を小さく、戦の名を墨の字で、下に両軍の名を「対」で。派手な色・VS の字は使わない
    this.introWaiting = true;
    const battle = window.__game?.battle, began = performance.now();
    const G = window.__game?.G;
    // 別の戦でも、開戦の札を押すのは初めてだけ。古い保存の続きも待たせない。
    const read = this.introRead || G?.battle > 0 || G?.history?.some(Boolean);
    const automatic = !!battle?.startAutomatic;
    const timing = battle?.startTiming;
    const delay = reduceMotion() ? 0 : Math.min(2000, Math.max(0, 5000 - (timing?.loadingMs || 0) - (timing?.deploymentMs || 0)));
    const prepared = '戦の支度ができました。';
    const controls = isTouch ? '上下になぞると下知を読めます。' : '下の「出陣する」をクリックしてください。改行キー（↵）でも進めます。操作の札に描かれた鍵盤は、使うキーの位置を示します。印の付いたキーを押してください。';
    const waitText = read ? `${delay ? `約${Math.ceil(delay / 1000)}秒で` : 'すぐに'}札が消えて動けます。「すぐ戦を始める」を押すと待たずに進めます。` : `「出陣する」を押すまで戦は止まっています。歩く・見回す操作は出陣してから使えます。${controls}`;
    // 開戦の札は軍の名だけ（「出陣時の目安」は兵の数の横で使う言葉）
    const sideName = (n) => String(n || '').replace(/（出陣時の目安）/g, '');
    if (document.pointerLockElement) document.exitPointerLock?.();
    el.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="intro-title" aria-describedby="intro-wait"><div class="intro-reading" tabindex="0" aria-label="戦の下知"><div class="date">${esc(date)}</div><div class="ttl" id="intro-title">${esc(name)}</div><i class="rule" aria-hidden="true"></i><div class="sides">味方　${esc(sideName(sides.a.name))}<em>対</em>敵　${esc(sideName(sides.b.name))}</div><p id="intro-wait" style="font-size:max(15px, calc(15px * var(--text-scale, 1)));line-height:1.6">${waitText}</p><p style="font-size:max(13px, calc(13px * var(--text-scale, 1)));line-height:1.6">${prepared}${read ? '' : '読む時間は自分で選べます'}</p></div><button type="button" class="btn primary" id="intro-go" style="min-height:48px;pointer-events:auto">${read ? 'すぐ戦を始める' : '出陣する'}</button></div>`;
    // 札の外は指を受け取らない。出陣待ちの停止は保つ。
    el.style.pointerEvents = 'none';
    $('cine').classList.toggle('on', !reduceMotion());
    clearTimeout(this.introT);
    const go = $('intro-go'), reading = el.querySelector('.intro-reading');
    go.onclick = (e) => {
      e.stopPropagation();
      if (!this.introWaiting || el.hidden) return;
      if (timing) { timing.introMs = Math.round(performance.now() - began); timing.ready = true; timing.battleSecondsAtReady = battle.t; }
      clearTimeout(this.introT);
      if (!automatic) {
        this.introRead = true;
        try { localStorage.setItem('risshin-intro-read', '1'); } catch (e) { /* 保存の仕組みには触れない */ }
      }
      if (timing) timing.totalMs = timing.loadingMs + (timing.readingMs || 0) + timing.deploymentMs + timing.introMs;
      this.introWaiting = false; el.hidden = true;
      $('cine').classList.remove('on'); go.blur(); this.onIntroReady?.();
    };
    go.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Tab') { e.preventDefault(); reading.focus({ preventScroll:true }); } if ((e.key === 'Enter' || e.key === ' ') && e.repeat) e.preventDefault(); };
    reading.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Tab') { e.preventDefault(); go.focus({ preventScroll:true }); } };
    go.focus({ preventScroll:true });
    // 携帯でも二度目から自動で閉じる。初めての戦は自分で押す。
    if (automatic || read) this.introT = setTimeout(() => { if (this.introWaiting && window.__game?.battle === battle) go.click(); }, automatic ? 0 : delay);
  }

  // 大事な瞬間（名乗り・名のある武将の討死）に、上下の細い黒帯を t 秒だけ（映画の一場面のように）。動きを減らす設定では出さない
  // 開戦の見せ場の間だけ、題の札が出ていても上下の黒い帯を出し、画面の札を消す（cineFlash の 20 秒の間隔とは別）
  shotBars(t = 4.5) {
    if (reduceMotion()) return;
    $('cine').classList.add('on');
    clearTimeout(this.cineT);
    this.cineT = setTimeout(() => $('cine').classList.remove('on'), t * 1000);
  }

  cineFlash(t = 2.5) {
    if (reduceMotion() || !$('intro').hidden) return;
    // 続けて何度も出すと映画の間にならないので、20 秒に一度まで
    const now = performance.now();
    if (now - (this.cineAt || -1e9) < 20000) return;
    this.cineAt = now;
    $('cine').classList.add('on');
    clearTimeout(this.cineT);
    this.cineT = setTimeout(() => { if ($('intro').hidden) $('cine').classList.remove('on'); }, t * 1000);
  }

  reset() {
    this.root.classList.add('battle-active');
    window.speechSynthesis?.cancel();
    setText($('h-merit'), '戦の最中');
    this.introWaiting = false; clearTimeout(this.introT);
    this.hurtT = 0; this.threatAt = 0;
    $('vignette').classList.remove('hurt', 'side', 'dying', 'winded');
    $('vignette').style.removeProperty('--hx'); $('vignette').style.removeProperty('--hy');
    for (const id of ['dmgdir', 'mobfx', 'aimwarn', 'brinkfx', 'encircle']) { const el = $(id); if (el) { el.classList.remove('on', 'show'); } }
    const cards = $('sonae-cards'); if (cards) cards.hidden = true;
    this._scKey = ''; this._scAlert?.clear();
    this.orderLog = []; this.warningLog = []; this.resultNotices = []; this.allyReport = '';
    this.logEntry.hidden = true;
    this.deepWas = false; this.breathHelp = false; this.moraleHelp = false; this.killHelp = false;
    $('h-squad').setAttribute('aria-expanded', 'false');
    this.subQ = []; this.subT = 0; this.shownLine = null; this.coachFoe = false; this.nearFoe = false; this.nearFoeT = 0; this.objKey = ''; this.taskShownId = null; this.taskShownText = ''; this.taskShownAt = -99; this.goalSignalAt = -99; this.curObjKey = null; this.shownGoalKey = null; this.goalFlashUntil = 0; this.log = []; this.doneAt = new Map(); this.subDrop = false;
    this.armyGhost = null; this.moveMarks = []; this.unitsKey = ''; this.radialKey = ''; this.rt = null;
    if ($('h-units')) $('h-units').hidden = true;
    if (this._scEl) { this._scEl.hidden = true; this._scEl.style.display = 'none'; }
    this.armyKey = '';
    this.armyClock = 0;
    this.bannerQ = []; this.bannerT = 0; this.bannerEndingRt = null; this.lastToast = null;
    this.barkSeen = new Map(); this.barkTimes = [];
    this.nextHintAt = -99;
    this.hintCur = null; this.tutCur = null; this.cardKey = ''; clearTimeout(this.hintTimer); clearTimeout(this.hintDefer);
    for (const id of ['subtitle', 'toasts', 'markers', 'bark', 'threats']) $(id).innerHTML = '';
    this.markerEls.clear();
    this.threatEls = [];
    for (const id of ['cmdpanel', 'prompt', 'bigmap', 'hint', 'sublog', 'target', 'flash', 'intro', 'armybar', 'radial', 'combo', 'killmark', 'staring', 'skiphint', 'situation', 'maphint', 'cheat', 'tutorial', 'choice']) $(id).hidden = true;
    $('floats').innerHTML = ''; this.floats = [];
    this.ghost = undefined; this.calmT = 0;
    this.rtsCardKey = ''; this.rtsOrdKey = ''; this.rtsFormOpen = false; this.hideRts();
    $('cine').classList.remove('on');
    this.bigmap = false;
    $('banner').classList.remove('show');
    $('objectives').classList.remove('expand');
    $('obj-list').setAttribute('aria-expanded', 'false');
    $('obj-list').setAttribute('aria-label', '任務の一覧を開く');
    $('objectives').setAttribute('aria-label', '今の任務。押すとほかの任務を開く');
    this.alliesOpen = false;
    this.notices.reset();
    this.applySettings();
  }

  applySettings() {
    this.root.dataset.sub = S.subSize;
    // HUD の部品ごとの出し入れ
    for (const [k, cls] of [['hudMinimap', 'no-minimap'], ['hudCompass', 'no-compass'], ['hudArmy', 'no-army'], ['hudSquad', 'no-squad'], ['hudBottom', 'no-bottom'], ['hudObjectives', 'no-objectives']]) this.root.classList.toggle(cls, !S[k]);
    document.body.classList.toggle('mincho', S.fontBody === 'mincho');
    document.body.classList.toggle('ca', !!S.colorAssist);
    // 動きを減らす：ゲームの設定か、OS の「視差効果を減らす」
    document.body.classList.toggle('rm', reduceMotion());
    $('fps').hidden = !S.showFps;
  }

  // 台詞の読み上げ（ブラウザの音声合成。日本語の声があるときだけ）
  canSpeak(speaker) {
    if (!speaker || S.voice === 'off' || S.volume <= 0 || S.volVoice <= 0 || S.voice === 'major' && !VOICE_MAJOR.test(speaker) || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
    try { if (!jaVoice) jaVoice = speechSynthesis.getVoices().find((v) => /^ja(?:[-_]|$)/i.test(v.lang || '')) || null; return !!jaVoice; } catch (e) { return false; }
  }
  speak(speaker, text) {
    if (!this._voiceHook && window.speechSynthesis) { this._voiceHook = true; try { speechSynthesis.addEventListener('voiceschanged', () => { jaVoice = null; }); } catch (e) { /* 声の入れ替えを聞けない環境 */ } }
    if (!window.speechSynthesis) { if (S.voice !== 'off' && !this.voiceUnavailable) { this.voiceUnavailable = true; this.notices.push('この端末では声が使えません。台詞は字幕で読めます', 60, 4, 'info'); } return; }
    // 字幕が切り替わったら、前の声を待たせず片付ける。
    try { speechSynthesis.cancel(); } catch (e) { /* 声を止められなくても字幕を続ける */ }
    if (S.voice === 'off' || S.volume <= 0 || S.volVoice <= 0) return;
    const major = VOICE_MAJOR.test(speaker || '');
    if (S.voice === 'major' && !major) return;
    if (!speaker) return;
    try {
      if (!jaVoice) jaVoice = speechSynthesis.getVoices().find((x) => /^ja(?:[-_]|$)/i.test(x.lang || '')) || null;
      if (!jaVoice) { if (!this.voiceUnavailable) { this.voiceUnavailable = true; this.notices.push('日本語の声が使えません。台詞は字幕で読めます', 60, 4, 'info'); } return; }
      const u = new SpeechSynthesisUtterance(text.replace(/[「」（）]/g, ''));
      u.lang = 'ja-JP'; u.rate = S.voiceRate; u.volume = S.volume * S.volVoice;
      u.voice = jaVoice;
      // 人ごとの声の高さと速さ（源八は低くゆっくり、藤吉郎は高く速く、若い者は少し高く。織田家編の城下で出る上役もここで聞き分ける）

      const v2 = VOICE_V.find(([re]) => re.test(speaker));
      u.pitch = v2 ? v2[1] : 1;
      u.rate = S.voiceRate * (v2 ? v2[2] : 1);
      speechSynthesis.speak(u);
    } catch (e) { /* 読み上げできない環境 */ }
  }

  taskRepeats(speaker, text) {
    if (!this.rt) return false;
    const plain = (v) => String(v).replace(/[\s。、！？]/g, '');
    const key = plain(text);
    const same = (o) => {
      if (!o || o.state) return false;
      const task = plain(fieldLabel(goalText(this.rt, o.text)));
      // 行き先を添えた下知も、任務の全文を繰り返すなら札は一枚にする。
      if (!task) return false;
      if (key === task) return true;
      const guide = this.rt.missionGuide;
      const place = plain(fieldLabel(guide?.label || ''));
      return !!place && (key === task + place + 'の印を見よ' ||
        key === place + 'の印へ進め' + task ||
        key === place + 'は' + plain(guide?.floorHint || '') + task);
    };
    return this.rt.objectives.some(same) || same(this.rt.missionGuide?.objective);
  }

  say(speaker, text, dur = 4, urgent = false, detail = null) {
    // 遊び手への括弧の説明は省かない。内部注は呼び出す側のデータで外す。
    text = String(text);
    const speakerUnit = battleSpeaker(this.rt, speaker, text);
    if (!battleSpeechAllowed(this.rt, speaker, text, speakerUnit)) return false;
    if (detail?.internalNotes) for (const note of detail.internalNotes) text = text.replace(`（${note}）`, '');
    // 長い台詞ほど長く出す。読み上げる時は、声が言い終わるまで出しておく（1 秒に 7 字ほど）
    dur = Math.max(dur, 1.2 + text.length * 0.11);
    if (this.canSpeak(speaker)) dur = Math.max(dur, 0.8 + text.length / (7 * (S.voiceRate || 1)));
    if (this.taskRepeats(speaker, text)) return false;
    const key = this.notices.key(text);
    if (!this.notices.repeatOk(text) || this.subQ.some((q) => q.key === key)) return false;
    const important = detail?.task || urgent || VOICE_MAJOR.test(speaker || '') || /伝令|使番|上官|下知/.test(speaker || '') || /任務|命令|下知|合図|守れ|守る|待て|退け|向かえ|進め|攻めよ|討て|救え|構え/.test(text);
    const line = { speaker, text, key, dur, important, goalKey: detail?.goalKey || null, queued: this.subSeq = (this.subSeq || 0) + 1, t: Math.floor(this.rt?.t || 0) };
    Object.defineProperty(line, 'speakerUnit', { value: speakerUnit });
    // 伝令の声は、待っている兵の声より先に読む。
    if (urgent || (speaker && /伝令|使番/.test(speaker))) this.subQ.unshift(line);
    else this.subQ.push(line);
    if (urgent) this.nextSub();
    this.log.push(line);
    if (this.log.length > 40) this.log.shift();
    if (important) { this.orderLog.push(line); this.updateLogEntry(); }
    // 読む速さは保つ。雑談から記録へ回し、下知と伝令は待ち列に残す。
    while (this.subQ.length > 7) {
      let i = this.subQ.findIndex((q) => !q.important);
      if (i < 0) { i = 0; for (let k = 1; k < this.subQ.length; k++) if (this.subQ[k].queued < this.subQ[i].queued) i = k; }
      this.subQ.splice(i, 1); this.subDrop = true;
    }
    if (!$('sublog').hidden) this.renderLog();
    return true;
  }

  // いまの台詞を読み終えたことにして、次の台詞へ
  nextSub() { window.speechSynthesis?.cancel(); if (this.subT > 0.15) this.subT = 0.15; }

  updateLogEntry() {
    let unread = 0;
    // 一分より古い未読は数えない（数が増え続けて画面を塞がない）。記録には残る
    const nowT = Math.floor(this.rt?.t || 0);
    for (const line of this.orderLog) if (!line.read && nowT - line.t < 60) unread++;
    this.logEntry.hidden = unread === 0;
    this.logEntry.textContent = isTouch ? `未読${unread}件を読む` : `未読の下知・報せ${unread}件を読む`;
    // 釦の出入りや折り返しが変わったら、印が避ける範囲も測り直す。
    this.rectsT = 0;
  }

  renderLog() {
    const focused = document.activeElement?.id === 'log-close';
    for (const line of this.orderLog) line.read = true;
    this.updateLogEntry();
    const rows = [...new Set([...this.orderLog, ...this.log])].sort((a, b) => a.t - b.t);
    $('sublog').innerHTML = `<h5>会話の記録</h5><button type="button" class="btn" id="log-close" style="min-height:44px;margin-bottom:8px">記録を閉じる</button><p style="font-size:max(15px, calc(15px * var(--text-scale, 1)));line-height:1.6">読んでいる間も戦は進みます。安全な所へ退くか、一時停止して読んでください。通常の会話は直近40件まで。下知と伝令は戦の終わりまで残ります。上下に送って読めます。</p>${this.allyReport ? `<p>${esc(this.allyReport)}</p>` : ''}` + rows.map((l) => `<div><small>${Math.floor(l.t / 60)}分${l.t % 60}秒　${l.important ? '下知・報せ　' : ''}${!l.shown ? '字幕で未表示　' : ''}</small>${l.speaker ? `<span class="sp">${esc(l.speaker)}</span>` : ''}${esc(l.text)}</div>`).join('');
    $('log-close').onclick = (e) => { e.stopPropagation(); this.toggleLog(false); };
    if (focused) $('log-close').focus({ preventScroll:true });
  }

  toggleLog(on) {
    const el = $('sublog');
    el.hidden = typeof on === 'boolean' ? !on : !el.hidden;
    if (!el.hidden) { this.logOpener = document.activeElement; this.renderLog(); $('log-close').focus({ preventScroll:true }); }
    else { if (this.logOpener?.isConnected && !this.logOpener.hidden) this.logOpener.focus?.({ preventScroll:true }); else $('objectives').focus({ preventScroll:true }); this.allyReport = ''; }
  }

  // 戦功の通知（同じ項目が続いたらまとめる）
  toast(pts, label) {
    // 「大事なものだけ」なら小さな戦功は出さない
    if (S.toastLevel === 'important' && pts !== 0 && Math.abs(pts) < 5) return;
    const big = pts >= 25;
    if (big) sfx('taiko', 0.55);
    this.notices.push(pts === 0 ? label : label, big || pts === 0 ? 75 : 40, 2.7);
  }

  // 見出しも共通の三枠で出す。古い待ち見出しは短い報せへ回す。
  banner(text, sub = '') {
    // 決着の知らせは、すでに終わった寄せや下知の見出しを待たせない。
    // 決着後の重傷などは残すため、古い列を片付けるのは一戦に一度だけ。
    const rt = this.rt;
    if (rt && (rt.over || rt.flags.ending || !rt.player.u.alive) && this.bannerEndingRt !== rt) {
      this.bannerEndingRt = rt; this.bannerEndReason = text;
      this.root.classList.add('ending');
      for (const el of this.markerEls.values()) el.hidden = true;
      this.bannerQ.length = 0; this.bannerT = 0;
      $('banner').classList.remove('show');
    }
    if (rt) {
      for (let i = this.bannerQ.length - 1; i >= 0; i--) if (this.bannerQ[i].phase !== rt.phase || /救援|囲み/.test(text) && /救援|囲み/.test(this.bannerQ[i].text)) this.bannerQ.splice(i, 1);
    }
    if (rt && this.bannerEndingRt === rt) {
      if (text === '重傷' || text === '討死') {
        const previous = this.bannerQ[this.bannerQ.length - 1]?.text || this.bannerEndReason;
        if (previous && previous !== text && previous !== '重傷' && previous !== '討死') sub = sub ? `${sub}。${previous}` : previous;
        this.bannerEndReason = text;
        this.bannerQ.length = 0; this.bannerT = 0; $('banner').classList.remove('show');
      } else if (this.bannerEndReason === '重傷' || this.bannerEndReason === '討死') return;
    }
    const key = this.notices.key(sub ? text + '\n' + sub : text);
    if (this.bannerQ.some((q) => q.key === key)) return;
    if (!this.notices.repeatOk(sub ? text + '\n' + sub : text)) return;
    if (rt?.def?.latestPhaseBanner) {
      this.bannerQ.length = 0;
      if (this.bannerPhase !== rt.phase) { this.bannerT = 0; $('banner').classList.remove('show'); }
    }
    this.bannerQ.push({ text, sub, key, phase: rt?.phase, at: this.notices.clock });
    // 表示中の一つに加えて待ちは二つまで。古い出来事を捨てず、
    // 新しい下知を何枚もの大見出しの後ろで待たせない。
    if (this.bannerQ.length > 2) {
      const old = this.bannerQ.shift();
      this.notices.push(old.sub ? old.text + '\n' + old.sub : old.text, 75, 2.6);
    }
  }

  flash(text, tone = 'gold') {
    text = this.terse(text);
    if (/^外れた/.test(text)) { const ch = $('crosshair'); if (ch) { ch.classList.remove('gmiss'); void ch.offsetWidth; ch.classList.add('gmiss'); } }
    this.notices.push(text, tone === 'dim' ? 30 : 85, 1.8, tone === 'dim' ? '' : 'warn');
  }

  // 部下などの短い声
  // 同じ文の八秒制限とは別に、似た知らせ（騎馬が止まった・敵が崩れた…）をまとめて間引く。
  // 立て続けの知らせは、警告でないものから間引く（docs/ui-guidelines.md）
  // 出してよい知らせか（出すかどうかだけを見る。記録はしない）。呼ぶ側が先に見て、出さない物は呼ばないようにも使える
  barkOk(text, warn = false) {
    // 間は戦の中の時で数える（機械が重くて戦がゆっくり進む時も、戦の20秒に同じ知らせを何度も出さない）
    const now = this.notices.clock * 1000;
    if (!this.barkSeen || this.barkRt !== this.rt) { this.barkSeen = new Map(); this.barkTimes = []; this.barkRt = this.rt; }
    const fam = BARK_FAMILY.find(([re]) => re.test(text));
    if (!this.notices.repeatOk(this.terse(text))) return false;
    const key = fam ? fam[1] : 'text:' + this.terse(text);
    const gap = fam ? (fam[2] ? fam[2] * 1000 : (warn ? 12000 : 30000)) : 8000;
    if (now - (this.barkSeen.get(key) ?? -1e9) < gap) return false;
    if (this.barkSeen.size > 80) for (const [k, time] of this.barkSeen) if (now - time >= 30000) this.barkSeen.delete(k);
    this.barkTimes = this.barkTimes.filter((t) => now - t < 4000);
    if (!warn && this.barkTimes.length >= 2) return false;
    return { now, key };
  }
  // 戦の中の字を短く：指の端末では、キーやマウスの言い添え（「右で構えて〜」「Z で〜」）を落とす。
  // 小さな画面（iPhone 横）では、括弧の中の言い添えも落とす（中身は印と音で伝わる）
  terse(text) {
    let t = String(text);
    if (isTouch) t = t.replace(/　[^　]*(右で|左で|クリック|キー|[A-Z] で|Tab|Shift|Space)[^　]*$/, '').replace(/（[^）]*(クリック|キー|[A-Z] で|Tab|Shift)[^）]*）/g, '');
    if (isTouch && innerHeight < 500) t = t.replace(/（[^）]{6,}）/g, '');
    return t.trim() || String(text);
  }
  warningValid(text, rt) {
    if (!rt || rt.over || !rt.player.u.alive) return false;
    const p = rt.player, u = p.u;
    if (/味方の列へ下がれ/.test(text)) return u.mobbed || u.hp < u.maxHp * 0.55;
    if (/一太刀|お命|倒れる/.test(text)) return u.hp / u.maxHp < 0.3;
    if (/囲ま|囲み/.test(text)) return u.mobbed || (rt.encircle?.lv || 0) > 0;
    if (/動揺|怯えて|怯えておる|心が乱れて/.test(text)) return rt.squadGroups.some((g) => g.count > 0 && g.morale < 45);
    if (/組と離れ/.test(text)) { const g = rt.squadGroups.find((g) => g.count > 0); return !!g && Math.hypot(g.center().x - u.pos.x, g.center().z - u.pos.z) > 38; }
    if (/矢玉|鉄砲|射手|後ろだ|構えて下がれ/.test(text)) return p.inCombatT > 0 || (rt.aimedT || 0) > 0 || (rt.army.threats || []).length > 0;
    // 一度起きた出来事の報せは待ち列の三秒の期限だけで扱う。
    return true;
  }

  bark(text, warn = false) {
    const ok = this.barkOk(text, warn);
    if (!ok) return;
    const { now, key } = ok;
    if (key !== null) this.barkSeen.set(key, now);
    this.barkTimes.push(now);
    const fatal = warn && /一太刀|お命|倒れる|深手|囲まれた|矢玉|鉄砲|筒先|火縄|後ろだ|構えて下がれ|味方の列へ下がれ/.test(text);
    const rt = this.rt;
    this.notices.push(this.terse(text), fatal ? 110 : warn ? 85 : 20, 2.2, warn ? 'warn' : '', warn ? () => this.rt === rt && this.warningValid(text, rt) : null);
  }

  // ヒント：手ほどきと同じ札に出す（札は一度に一つ。ヒントの間は手ほどきを少し休む）
  hint(text, keys, ms) {
    // 開戦の題字（#intro）が出ている間は待たせる（携帯で題字の上に札が重なっていた。見回り 10/2）
    clearTimeout(this.hintDefer);
    // 待ち直すだけの呼び出しを、新しいヒントとして記録しない。
    const ready = () => {
      const io = $('intro'), bn1 = $('banner');
      if ((io && !io.hidden) || (bn1 && bn1.classList.contains('show') && this.bannerT > 0)) { this.hintDefer = setTimeout(ready, 800); return false; }
      return this.showHint(text, keys, ms);
    };
    return ready();
  }
  showHint(text, keys, ms) {
    if (this.notices.clock < (this.nextHintAt ?? -99) || !this.notices.repeatOk(text, true)) return false;
    this.nextHintAt = this.notices.clock + 8;
    this.hintCur = { text, keys };
    clearTimeout(this.hintTimer);
    // 低い画面（スマホ横）では上の真ん中に短く出して、5 秒で消す（技の札のように長い物は ms で長く）
    this.hintTimer = setTimeout(() => { this.hintCur = null; this.drawCard(); }, ms || (innerHeight < 500 ? 5000 : 6500));
    this.drawCard();
    return true;
  }
  hintBusy() { return !!this.hintCur; }

  goalChanged(rt, guide) {
    const key = guide.key;
    const text = fieldLabel(goalText(rt, guide.objective.text));
    // 古い案内は待ち列から外し、史実の会話は会話の記録に残す。
    for (let i = this.subQ.length - 1; i >= 0; i--) if (this.subQ[i].goalKey) this.subQ.splice(i, 1);
    if (this.shownGoalKey && this.shownGoalKey !== key) { this.subT = 0; this.shownGoalKey = null; window.speechSynthesis?.cancel(); }
    // 行き先や文が続けて変わっても、点灯と音は十秒以上あける。
    if (rt.t - (this.goalSignalAt ?? -99) >= 10) {
      this.goalSignalAt = rt.t; this.goalFlashUntil = rt.t + 1.6;
      sfx('obj', 0.55);
    }
    const line = guide.floorHint ? `${guide.label}は${guide.floorHint}。${text}` :
      guide.marker ? `${text}。${guide.label}の印を見よ。` : text;
    this.say(rt.G.lord ? '近習' : '組頭', line, 4, true, { task: true, goalKey: key });
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
    if (!this.rt?.def.dojo) return;
    if (!this.killHelp) { this.killHelp = true; this.notices.push('稽古相手を倒した', 30, 4); }
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

  hitMarker(blocked = false) {
    const c = $('crosshair');
    c.classList.toggle('blocked-hit', blocked);
    c.setAttribute('aria-label', blocked ? '防がれた一撃' : '当たった一撃');
    c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit');
  }

  damageNotice(angle, src, kind) {
    const word = kind === 'gun' ? '鉄砲' : kind === 'arrow' ? '矢' : (src?.wpnKind || src?.lookWeapon || src?.weapon) === 'spear' ? '槍' : '';
    const visible = src && !src.isStruct && this.rt && sightUnit(this.rt, src);
    const direction = Math.cos(angle) > 0.5 ? '前' : Math.cos(angle) < -0.5 ? '後ろ' : Math.sin(angle) > 0 ? '左' : '右';
    if (visible || word) this.notices.push((visible ? direction + 'から' : '') + (word || '一撃'), 85, 3); 
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
    // 優先の順：手ほどきの「よし」確認 ＞ ヒント ＞ 手ほどきの段（確認の途中でヒントに取られない）
    let html = '';
    if (this.coachFoe) {
      html = '';
    } else if (t && t.ok) {
      const n = t.items.filter((x) => x.done).length;
      const head = `<span class="lbl">${esc(t.title)}<b>${n}/${t.items.length}</b></span>`;
      html = head + `<p class="what ok"><i aria-hidden="true">✓</i>${esc(t.ok)}　よし</p>`;
    } else if (h) {
      html = `<span class="lbl">ヒント</span><p class="what sm">${keyCaps(h.text)}</p>${h.keys ? `<p class="how">${keyCaps(h.keys)}</p>` : ''}`;
    } else if (t) {
      const n = t.items.filter((x) => x.done).length;
      const it = t.items.find((x) => !x.done);
      const head = `<span class="lbl">${esc(t.title)}<b>${n}/${t.items.length}</b></span>`;
      if (it) html = head + `<p class="what">${esc(it.label)}</p>${it.how ? `<p class="how">${keyCaps(it.how)}</p>` : ''}`;
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
    if (!c) { const restore = el.contains(document.activeElement); el.hidden = true; this.notices.sync(); if (restore) { const target = this.choiceOpener?.isConnected && this.choiceOpener !== document.body ? this.choiceOpener : $('objectives'); target?.focus?.({ preventScroll:true }); } return; }
    this.choiceOpener = document.activeElement;
    el.setAttribute('role', 'group'); el.setAttribute('aria-labelledby', 'choice-title');
    const keyboard = this.keyboardInput;
    const keys = c.options.map((o, i) => i + 1).join(' か ');
    const guide = isTouch ? '押して選ぶ' : `札か数字 ${keys} で選ぶ`;
    const deadline = `${Math.ceil(c.t)}秒後は一番上`;
    const title = c.title === '東に別手。どこを守る？' ? '東に別手。守る所は？' : c.title;
    el.hidden = false;
    el.innerHTML = `<h5 id="choice-title" tabindex="-1">${esc(title)}</h5><p class="choice-help">${guide}・${deadline}</p><span id="choice-seconds" role="status"></span>` + c.options.map((o, i) => `<button type="button" class="opt" data-pick="${i}"><kbd class="cap">${i + 1}</kbd><b>${esc(o.label)}</b><small>${esc(o.note || '')}</small></button>`).join('') + '<div class="tm"><i id="choice-t"></i></div>';
    el.querySelectorAll('[data-pick]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); this.rt?.pickChoice(+b.dataset.pick); };
      b.onkeydown = (e) => {
        e.stopPropagation();
        const pick = Number(e.key) - 1;
        if (/^[1-9]$/.test(e.key) && c.options[pick]) {
          e.preventDefault();
          if (!e.repeat) this.rt?.pickChoice(pick);
        } else if ((e.key === 'Enter' || e.key === ' ') && e.repeat) e.preventDefault();
      };
    });
    el.scrollTop = 0;
    this.choiceMax = c.t;
    if (keyboard) el.querySelector('h5').focus({ preventScroll:true });
    this.notices.sync();
  }
  choiceTime(t) { const b = $('choice-t'); if (b) setWidth(b, Math.max(0, t / (this.choiceMax || 20) * 100)); const secs = $('choice-seconds'); if (secs) setText(secs, t <= 5 ? `残り${Math.max(0, Math.ceil(t))}秒` : ''); }

  // 操作の早見表（F1）
  toggleCheat() {
    const el = $('cheat');
    el.hidden = !el.hidden;
    if (!el.hidden) el.innerHTML = [['キーの位置', '文字キーの段を、左から数えます。上段は数字のすぐ下です'], ['危険の印', '矢・鉄砲：矢玉が来る向き。槍・刀：敵が迫る向き。印へ向いて構えるか、物陰へ退きます'], ['突き', '左クリック（押し続けて離すと溜め突き）'], ['構え', '右クリック（直前で受け流し）'], ['薙ぎ', '構え＋左クリック'], ['回避', K('dodge')], ['狙い', `${K('lock')}（ホイールで相手を替える）`], ['号令', `${K('follow')} ${K('hold')} ${K('attack')} ${K('retreat')}／${K('command')}長押しで輪`], ['鼓舞', K('rally')], ['地図', `${K('map')}（${K('mapzoom')}で縮尺）`], ['視点', `${K('view')}（三人称・一人称。長押しで高くから見渡す）`], ['写真', K('photo')], ['画面の札', K('hud')], ['感度', '左角かっこと右角かっこ'], ['記録', `${K('log')}（会話の記録）`]].map(([a, b]) => `<div><b>${a}</b>${esc(b)}</div>`).join('');
    if (!el.hidden) {
      el.insertAdjacentHTML('afterbegin', '<h5>操作の早見表</h5><button type="button" class="btn" id="cheat-close" style="min-height:44px;margin-bottom:8px">早見表を閉じる</button>');
      $('cheat-close').onclick = (e) => { e.stopPropagation(); this.toggleCheat(); };
    }
  }

  update(dt, rt) {
    this.rt = rt;
    const p = rt.player;
    const u = p.u;
    const G = rt.G;
    // 見出し
    this.notices.update(dt);
    if (this.notices.visible('banner')) this.bannerT -= dt;
    if (this.bannerT <= 0) $('banner').classList.remove('show');
    if (rt) for (let i = this.bannerQ.length - 1; i >= 0; i--) if (this.bannerQ[i].phase !== rt.phase) this.bannerQ.splice(i, 1);
    while (this.bannerQ.length && this.notices.clock - this.bannerQ[0].at > 8) this.bannerQ.shift();
    while (this.bannerQ.length && !this.notices.repeatOk(this.bannerQ[0].sub ? this.bannerQ[0].text + '\n' + this.bannerQ[0].sub : this.bannerQ[0].text)) this.bannerQ.shift();
    // 開戦の題の札が出ている間は、見出しを待たせる（重ねない）
    // 判断の札（#choice）が開いている間も待たせる（札の上に見出しが重なって読めなかった。見回り 10/2）
    if (this.bannerT <= 0 && this.bannerQ.length && $('intro').hidden && $('choice').hidden && this.notices.room(80)) {
      const { text, sub, phase } = this.bannerQ.shift();
      this.bannerPhase = phase;
      this.notices.repeatOk(sub ? text + '\n' + sub : text, true);
      const b = $('banner');
      b.classList.remove('show'); void b.offsetWidth;
      b.innerHTML = `<span class="brush" style="background-image:url(${brushImage()})">${esc(text)}</span>` + (sub ? `<small>${esc(sub)}</small>` : '');
      b.classList.add('show');
      this.bannerT = 2.6;
      this.notices.sync();
    }
    // 手ほどきの札は 40 秒たったら小さな札に畳む（視界を塞がない。A015）
    { const tu = $('tutorial'); if (tu) tu.classList.toggle('tutold', rt.t > 40 && !this.hintCur); }
    this.updateArmy(rt);
    this.updateSiegeCards(rt);
    this.updateArmyGhost(dt);
    this.drawOverlay(rt);
    if (isRtsOn(rt)) this.updateRts(rt); else this.hideRts();
    // 方角の帯は毎コマ作り直さなくても気付かれない（字と印を毎コマ組み立て直すのが重かった）。15回/秒で足りる
    if ((this.compassT = (this.compassT || 0) - dt) <= 0) { this.compassT = 1 / 15; this.updateCompass(rt); }
    this.updateRadial(rt);
    this.sonaeCards(rt);
    this.yasenHud(rt);
    // 城下：どこから出陣すればよいか迷わないよう、右下に常の「出陣する」釦を置く
    this.root.classList.toggle('battle-active', !rt.def.town);
    const sortie = $('town-sortie');
    if (sortie) {
      const show = !!(rt.def && rt.def.town);
      if (sortie.hidden === show) sortie.hidden = !show;
      if (show && !sortie.__wired) { sortie.__wired = true; sortie.onclick = () => { sfx('ui'); rt.game.townOpen('boss', { go: true }); }; }
    }
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
    const coachFoe = this.nearFoe || p.inCombatT > 0 || (rt.army.threats || []).length > 0;
    if (this.coachFoe !== coachFoe) { this.coachFoe = coachFoe; this.drawCard(); }
    const busy = p.inCombatT > 0 || (rt.army.threats || []).length > 0 || p.cmdOpen || p.radial || this.nearFoe;
    this.calmT = busy ? 0 : (this.calmT || 0) + dt;
    // HUD の段（S.hudMode）：'min' 最小＝平時は 2 秒で札を消し、任務・小地図・方角も引っ込める／'full' 全部＝薄めない／無ければ「ふつう」
    const mode = S.hudMode || 'normal';
    this.root.classList.toggle('calm', mode !== 'full' && S.hudAutoFade && this.calmT > (mode === 'min' ? 2 : 6));
    this.root.classList.toggle('hudmin', mode === 'min');
    this.root.classList.toggle('lean', leanHud());
    // 戦が決まった後（勝ち・負け・重傷）は、札を引っ込めて、引いていくカメラの絵と字幕だけにする
    this.root.classList.toggle('ending', !!guidanceEnded(rt));
    // 必要な時だけ出す札：両軍の兵力の帯と日付は、開戦・形勢が変わった時・号令や地図を開いている間だけ（HUD の三つの層の「要る時」）
    this.armyPeekT = (this.armyPeekT || 0) - dt;
    const peek = !S.hudAutoFade || rt.t < 8 || this.armyPeekT > 0 || p.cmdOpen || p.radial || this.bigmap || rt.ended;
    // 兵力の帯は戦の間ずっと出す（平時は薄くするだけ。peek は号令・地図の間に濃くするのに使う）
    this.root.classList.toggle('army-off', false);
    this.root.classList.toggle('army-peek', peek);
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
    // 敵が近い間も出さない（物見と突き合う最中に「飛ばす」が真ん中に出ると、誤って押す）
    if ((this.skipFoeT = (this.skipFoeT || 0) - dt) <= 0) { this.skipFoeT = 0.25; this.skipFoe = !!rt.army.nearestEnemy(p.u, 25, (o) => !o.fleeing && o.type !== 'dummy'); }
    const can = !(rt.tut && rt.tut.auto) && !rt.tutPause && (!this.skipFoe || rt.over && rt.tracker.main === true) && rt.def.canSkip && rt.def.canSkip(rt);
    sk.hidden = !can;
    if (can) setHtml(sk, `<kbd>${K('skip')}</kbd>${esc(can)}`);
    // 戦況の一行
    const st = $('situation');
    st.hidden = true; // 全軍の内部集計から優劣を断定しない。
    // 字幕
    // 開戦の題の札の間は、字幕を待たせる（札の後に頭から読めるように）
    const introOn = !$('intro').hidden;
    if (this.shownGoalKey && this.shownGoalKey !== rt.missionGuide?.key) { this.subT = 0; this.shownGoalKey = null; window.speechSynthesis?.cancel(); }
    if (this.subT > 0 && !introOn && this.notices.visible('subtitle')) this.subT -= dt;
    if (this.subT > 0 && this.shownLine && (this.taskRepeats(this.shownLine.speaker, this.shownLine.text) || !battleSpeechAllowed(rt, this.shownLine.speaker, this.shownLine.text, this.shownLine.speakerUnit))) { this.subT = 0; this.shownLine = null; window.speechSynthesis?.cancel(); setHtml($('subtitle'), ''); }
    while (this.subQ.length && (!battleSpeechAllowed(rt, this.subQ[0].speaker, this.subQ[0].text, this.subQ[0].speakerUnit) || this.taskRepeats(this.subQ[0].speaker, this.subQ[0].text) || this.subQ[0].goalKey && this.subQ[0].goalKey !== rt.missionGuide?.key || !this.notices.repeatOk(this.subQ[0].text))) this.subQ.shift();
    if (this.subT <= 0 && this.subQ.length && !introOn && this.notices.room(70)) {
      const s = this.subQ.shift();
      this.shownLine = s;
      this.shownGoalKey = s.goalKey;
      s.shown = true;
      s.t = Math.floor(rt.t);
      this.notices.repeatOk(s.text, true);
      // 話し手ごとに色を変える（上官・名のある人は金、自分は白、足軽は灰、敵は朱）
      // 敵か味方かは、話し手の名の家と、戦場にいるその名の者の陣営で決める
      const foeStem = rt.def.sides && rt.def.sides.b && rt.def.sides.b.name ? rt.def.sides.b.name.replace(/軍$/, '') : '';
      const foe = s.speaker && ((foeStem && s.speaker.includes(foeStem)) || (rt.def.foeNames || []).some((n) => s.speaker.includes(n)) || rt.army.groups.some((g) => g.team !== 0 && g.name && g.name !== '町の人' && s.speaker.includes(g.name)) || rt.army.units.some((o) => o.name && o.team !== 0 && (o.name === s.speaker || o.name.endsWith(s.speaker))));
      const sc = !s.speaker ? '' : s.speaker === rt.G.name ? 'me' : foe ? 'foe' : /足軽|伝令/.test(s.speaker) ? 'grunt' : 'lord';
      setHtml($('subtitle'), (s.speaker ? `<span class="sp ${sc}">${esc(s.speaker)}</span>` : '') + `<span class="${s.speaker ? '' : 'sys'}">${esc(s.text)}</span>` +
        (this.subDrop ? `<small class="more">台詞を一部とばしました（${isTouch ? '字幕を押すと会話の記録' : `<kbd class="cap">${esc(K('log').replace(/^文字([上中下])段(\d+)$/, '文字キーの$1段、左から$2番目'))}</kbd> で会話の記録`}）</small>` : ''));
      if (!this.subQ.length) this.subDrop = false;
      if (s.speaker) speaking(s.dur);
      this.speak(s.speaker, s.text);
      // 畳まれていた時間は数えず、読む時間を確保する。
      this.subT = s.dur;
      this.notices.sources[3].born = this.notices.clock;
    } else if (this.subT <= 0) setHtml($('subtitle'), '');
    // ゲージ
    setHtml($('h-who'), `${esc(G.name)}<small>${esc(rankLabel(G))}</small>`);
    const hpEl = $('h-hp');
    const hpPct = Math.max(0, u.hp / u.maxHp * 100);
    setWidth(hpEl.querySelector('b'), hpPct < 30 ? 25 : hpPct < 70 ? 60 : 100);
    // 減った分を白く残して、あとから追いつかせる
    this.ghost = this.ghost === undefined ? hpPct : Math.max(hpPct, this.ghost - dt * 25);
    if (hpPct > this.ghost) this.ghost = hpPct;
    setWidth(hpEl.querySelector('s'), this.ghost < 30 ? 25 : this.ghost < 70 ? 60 : 100);
    // 低い画面（細い棒だけ）では、線だけで体力と分からないので「体」の字と数を常に添える
    const tcLow = isTouch && document.documentElement.classList.contains('tc-low');
    const emEl = hpEl.querySelector('em');
    // 数は減っている時だけ（満ちていれば棒の長さで足りる）。低い画面では常に出す
    setText(emEl, woundText(u) || (u.hp < u.maxHp * 0.3 ? '深手' : u.hp < u.maxHp ? '手傷' : ''));
    if (tcLow) emEl.style.fontWeight = u.hp < u.maxHp ? '700' : '400';
    // 深手（三割を切る）は数字を朱の字で太く、帯の名も「深手」に
    const deep = u.hp < u.maxHp * 0.3;
    hpEl.classList.toggle('deep', deep);
    hpEl.classList.toggle('bleeding', u.alive && !rt.over && u.hp < 40 && u.wounds?.bleed > 0.0001 && !S.reduceMotion);
    if (deep && !this.deepWas && u.alive && !rt.over) this.notices.push('深手。構えて打ちに備え、味方の列へ退く。矢玉は物陰で避ける', 110, 6, 'warn');
    this.deepWas = deep;
    setText(hpEl.querySelector('span'), tcLow ? (deep ? '深手' : '体') : (deep ? '深手' : '体力'));
    // 体力も気力も満ちていれば、平時は札ごと消してよい（.bl.full。馬に乗れる身分は馬の傷みも見る）
    const bl = hpEl.parentElement;
    if (bl) bl.classList.toggle('full', u.hp >= u.maxHp && p.sta >= p.maxSta * 0.98 && (!p.canRide || p.horseHp >= p.horseMax * 0.98));
    const staEl = $('h-sta');
    setWidth(staEl.querySelector('b'), Math.max(0, p.sta / p.maxSta * 100));
    setText(staEl.querySelector('em'), p.sta < 20 ? '息切れ' : p.sta < p.maxSta * 0.6 ? '疲れ' : '');
    staEl.classList.toggle('low', p.sta < 20);
    if (p.sta < 20 && !this.breathHelp && !rt.over) { this.breathHelp = true; this.notices.push('息切れ。止まって息を整える', 85, 4); }
    // 気力の棒は減った時だけ（満ちていれば照準のそばの輪も消えている）
    staEl.classList.toggle('full', p.sta >= p.maxSta * 0.98);
    const mg = rt.squadGroups.length ? rt.squadGroups : rt.hostGroup ? [rt.hostGroup] : [];
    const mor = mg.length ? mg.reduce((a, g) => a + Math.max(0, g.morale), 0) / mg.length : 100;
    const morEl = $('h-mor');
    setWidth(morEl.querySelector('b'), mor);
    setText(morEl.querySelector('em'), moraleWord(mor));
    morEl.classList.toggle('low', mor < 40);
    if (mor < 40 && !this.moraleHelp && !rt.over) { this.moraleHelp = true; this.notices.push('組が動揺している。号令が届いても動きが鈍ることがある', 85, 5); }
    // 馬の体力と息（馬に乗れる身分から）
    const hEl = $('h-horse'), bEl = $('h-breath');
    // 馬の札は乗っている時か、馬が傷ついた・逃げた時だけ
    const horseNote = p.canRide && (p.mounted || p.horseHp < p.horseMax * 0.98 || (p.loose && (p.loose.mode === 'fled' || p.loose.mode === 'flee')));
    hEl.hidden = !horseNote; bEl.hidden = !p.canRide || !p.mounted;
    if (p.canRide) {
      const away = !p.mounted && p.loose && (p.loose.mode === 'fled' || p.loose.mode === 'flee');
      setText(hEl.querySelector('span'), p.horseName);
      setWidth(hEl.querySelector('b'), Math.max(0, p.horseHp / p.horseMax * 100));
      setText(hEl.querySelector('em'), p.mounted ? p.horseHp < p.horseMax * 0.3 ? '深手' : p.horseHp < p.horseMax ? '手傷' : '' : away ? '逃げた・呼べない' : '待っている');
      hEl.classList.toggle('low', p.horseHp < p.horseMax * 0.3);
      setWidth(bEl.querySelector('b'), Math.max(0, p.breath / p.maxBreath * 100));
      setText(bEl.querySelector('em'), p.horse?.userData.horse?.exhausted ? '疲れ・並足だけ' : p.breathRest || p.breath <= 5 ? '息切れ・並足で休む' : p.breath < p.maxBreath * 0.25 ? '息が残り少ない' : p.horseHp < p.horseMax * 0.5 ? '傷で足が鈍い' : '落ち着いている');
      bEl.classList.toggle('low', p.breathRest || p.breath < p.maxBreath * 0.25);
    }
    // 戦功と次の身分
    this.rank = G.rank; this.hasSquad = rt.squad.length > 0; this.manyGroups = rt.squadGroups.filter((g) => g.count > 0).length > 1;
    setText($('h-merit'), rt.over ? '戦の終わり' : '戦の最中');
    setText($('h-next'), '');
    setWidth($('h-nextbar'), 0);
    setText($('h-cap'), '');
    // 被弾
    if (this.hurtT > 0) this.hurtT -= dt;
    $('vignette').classList.toggle('hurt', this.hurtT > 0 || u.hp < u.maxHp * 0.3);
    // 息が上がった時（気力が一割半を切る）：画面の縁がゆっくり暗く脈打つ（気力の棒を見なくても分かる）
    $('vignette').classList.toggle('winded', u.alive && p.sta < p.maxSta * 0.15 && !(this.hurtT > 0));
    // 深手（三割を切る）：視界の端がにじみ、色が抜け、鼓動に合わせて赤く脈打つ。敵の鉄砲に狙われている間は縁が赤く脈打つ
    tensionCss();
    $('vignette').classList.toggle('dying', u.alive && u.hp < u.maxHp * 0.3);
    // 囲まれた時：画面の左右の縁が墨でじわりと狭まる（字を出さずに、下がれ・抜けろと伝える）
    let mob = $('mobfx');
    if (!mob) { mob = document.createElement('div'); mob.id = 'mobfx'; mob.setAttribute('aria-hidden', 'true'); $('vignette').after(mob); }
    mob.classList.toggle('on', !!(u.alive && u.mobbed && (rt.army.threats || []).some((o) => sightUnit(rt, o))));
    let aw = $('aimwarn');
    if (!aw) { aw = document.createElement('div'); aw.id = 'aimwarn'; $('vignette').after(aw); }
    aw.classList.toggle('on', u.alive && (rt.army.threats || []).some((o) => sightUnit(rt, o) && (o.type === 'gun' || o.type === 'bow')) && !rt.over);
    // 囲み：敵のいる向きの画面の縁が赤黒く染まる（前＝上・後ろ＝下。囲まれつつある時だけ）
    this.encT = (this.encT || 0) - dt;
    if (this.encT <= 0) {
      this.encT = 0.1;
      let ec = $('encircle');
      if (!ec) { ec = document.createElement('div'); ec.id = 'encircle'; $('vignette').after(ec); }
      const E = rt.encircle, on = false; // 全周の内部集計は知らせない。小地図には見える囲みだけ残す。
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
    let rangeCue = ch._rangeCue;
    if (!rangeCue) { rangeCue = document.createElement('span'); rangeCue.className = 'range-cue'; ch.appendChild(rangeCue); ch._rangeCue = rangeCue; }
    const rangeText = p.rangeCue || '';
    rangeCue.hidden = !rangeText;
    if (rangeCue.textContent !== rangeText) rangeCue.textContent = rangeText;
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
      // 名のある敵（武将と名のある侍）。討たれない武将も、手傷で退くまでは体力を見せる（当たっているかが分かるように）
      if (!sightUnit(rt, o) || !enemyKnown(rt, o) || o.team === 0 || !(o.type === 'busho' || (o.type === 'samurai' && o.name)) || o.woundOut) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      // 敵将の札は、名乗りの直後・狙っている時・すぐそば（14m）にいる時だけ
      if (d > 14 && p.lock !== o && !(o.announced && (o.annT ??= rt.t) + 6 > rt.t)) continue;
      if (d < bd) { bd = d; bu = o; }
    }
    const duel = rt.army.duel;
    if (duel && sightUnit(rt, duel.foe) && enemyKnown(rt, duel.foe)) bu = duel.foe;
    // 敵将の札がある時は、同じ高さの戦況の一行を隠す
    if (bu) $('situation').hidden = true;
    // 近くで見える敵将の構えと傷だけ。
    if (bu) {
      // 傷は見えた手応えだけを言葉にする。残り体力や退く下限は知らせない。
      const stance = duel && bu === duel.foe ? rt.army.time < duel.naT ? '名乗り' : duel.bind ? '押し合い' : duel.openT > rt.army.time ? '隙あり' : bu.atk && bu.atk.heavy ? '溜めの一撃' : bu.guarding > 0 ? '構え' : '一騎打ち' : '';
      boss.hidden = false; setHtml(boss, `<span>${esc(knownName(bu) || '敵武将')}</span><span>${stance ? stance + '・' : ''}${woundHint(bu)}</span>`);
    }
    else boss.hidden = true;
    // 狙っている敵
    const tg = $('target');
    const a = p.aimed;
    // 狙いの札は、名のある者・侍・武将か、狙い定めた時だけ（平の足軽は頭の上の棒で足りる）
    if (a && sightUnit(rt, a) && (!a.isOfficer || enemyKnown(rt, a)) && (p.lock || ((a.name || a.type === 'samurai' || a.type === 'busho') && Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) < 14))) {
      tg.hidden = false;
      tg.classList.toggle('locked', !!p.lock);
      const kw = kindWord(a);
      setHtml(tg, `<span>${p.lock ? `<em class="lk">◆ 狙い定め中</em><small>${isTouch ? '「解除」を押すと解く' : this.padMode ? '右スティック押し込みで解く' : esc(K('lock')) + 'で解く'}</small>` : '<small>照準の相手　</small>'}${esc(typeName(a))}${kw && !typeName(a).includes(kw) ? `<small class="kd">${kw}</small>` : ''}・${woundHint(a)}</span>`);
    } else tg.hidden = true;
    $('objectives').classList.toggle('goal-changed', rt.t < (this.goalFlashUntil || 0));
    // 任務
    // 済んだ任務は 8 秒見せたら畳んで「済 n」にまとめる（今やる事を埋もれさせない）
    this.doneAt = this.doneAt || new Map();
    for (const o of rt.objectives) if (o.state === 'done' && !this.doneAt.has(o.id + o.text)) this.doneAt.set(o.id + o.text, rt.t);
    const folded = rt.objectives.filter((o) => o.state === 'done' && rt.t - this.doneAt.get(o.id + o.text) > 8);
    const guide = rt.missionGuide;
    const goalObjective = guide ? guide.objective : currentObjective(rt);
    const filler = goalObjective === guide?.waitObjective ? goalObjective : null;
    // 同じ任務の細かな言い換えは十秒待つ。済・失敗・次の任務はすぐ反映する。
    if (goalObjective && (goalObjective.id !== this.taskShownId || rt.t - (this.taskShownAt ?? -99) >= 10)) {
      this.taskShownId = goalObjective.id; this.taskShownText = goalObjective.text; this.taskShownAt = rt.t;
    }
    if (!goalObjective) this.taskShownId = null;
    const key = (rt.enemyIntel?.version || 0) + JSON.stringify(rt.objectives) + folded.length + (filler ? filler.text : '') + (guide?.key || '') + (guide?.label || '') + Math.round(guide?.distance || 0) + (goalObjective?.id || '') + this.taskShownText;
    if (key !== this.objKey) {
      this.objKey = key;
      this.doneSet = this.doneSet || new Set();
      // 今やる任務（命令があれば命令、なければ主のまだ済んでいない物）に cur を付ける。低い画面ではそれだけを出す
      const vis = rt.objectives.filter((o) => o.state !== 'fail');
      if (filler) vis.unshift(filler);
      const open = vis.filter((o) => o.state !== 'done' && o.state !== 'fail');
      const cur = goalObjective || filler;
      this.curObjKey = guide?.key || null;
      const statusText = `残り ${rt.objectives.filter((o) => o.state !== 'done' && o.state !== 'fail').length}件・済 ${rt.objectives.filter((o) => o.state === 'done').length}件・失敗 ${rt.objectives.filter((o) => o.state === 'fail').length}件`;
      $('objectives').setAttribute('aria-label', `任務の一覧を開く。${statusText}`);
      $('obj-list').innerHTML = (vis.length ? `<li class="task-help"><small>「今」の任務を進めよう。</small></li>` : '') + vis.map((o) => {
        const tag = o.state === 'done' ? '済' : o.state === 'fail' ? '失敗' : o === cur ? '今' : { main: '主', side: '後で', order: '下知', guide: '待つ' }[o.kind] || '';
        // 果たしたばかりの任務は印が跳ねる
        const just = o.state === 'done' && !this.doneSet.has(o.id + o.text);
        if (o.state === 'done') this.doneSet.add(o.id + o.text);
        const pr = intelText(rt, o.text) === o.text && o.progress && o.state !== 'done' && o.state !== 'fail' ? progressRatio(o.progress) : null;
        return `<li class="${o.state === 'done' ? 'done' : o.state === 'fail' ? 'fail' : ''} ${o.kind} ${folded.includes(o) ? 'folded-task' : ''} ${just ? 'justdone' : ''} ${o === cur || (just && !cur) ? 'cur' : ''} ${[...o.text].length > 20 ? 'long' : ''}"><span class="tag">${tag}</span><span class="obj-text">${o === cur ? `<span class="obj-now">${esc(fieldLabel(goalText(rt, firstTask(this.taskShownText || o.text))))}</span><span class="obj-full">${esc(fieldLabel(goalText(rt, o.text)))}</span>` : esc(fieldLabel(goalText(rt, o.text)))}</span>${o.progress && intelText(rt, o.text) === o.text ? `<small>${esc(goalText(rt, o.progress))}</small>` : ''}${o === cur && guide?.marker ? `<small class="goal-place">行き先：${esc(fieldLabel(guide.label))}・${Math.round(guide.distance)}メートル${guide.floorHint ? '・' + esc(guide.floorHint) : ''}</small>` : ''}${pr !== null ? `<i class="opb" aria-hidden="true"><b style="width:${Math.round(pr * 100)}%"></b></i>` : ''}</li>`;
      }).join('') + (vis.length > 0 ? `<li class="more">ほかの任務<span class="obj-count">（${open.length}件）</span></li>` : '');
    }
    // 組の状態
    const sq = $('h-squad');
    if (rt.squadGroups.some((g) => g.count > 0)) {
      sq.hidden = false;
      // 自分の組の人数・士気・下知は、後ろにいても知っている。
      const aliveSquad = rt.squad.filter((s) => s.alive);
      const alive = aliveSquad.length;
      const squadCount = `${alive}人`;
      const sqMor = alive ? moraleWord(aliveSquad.reduce((n, u) => n + u.group.morale, 0) / alive) : '組は全滅';
      const pips = rt.squad.map((s) => {
        const tip = s.name ? ` title="${esc(s.name)}"` : '';
        if (!s.alive) return `<i class="dead"${tip}></i>`;
        const r = s.hp / s.maxHp;
        return `<i class="${r < 0.3 ? 'low blink' : r < 0.35 ? 'low' : r < 0.7 ? 'mid' : ''} ${s.type === 'bow' || s.type === 'gun' ? 'bow' : ''} ${s.roster && s.roster.battles > 0 ? 'vet' : ''}"${tip}></i>`;
      }).join('');
      // 隊ごとの号令：同じ種類の隊は一つにまとめ、どの隊も同じ号令なら「号令 ○○」の一つだけ（同じ字を並べない）
      const ordOf = (g) => {
        const order = g.focus ? ORDER_NAME.focus : ORDER_NAME[g.order] || '待て';
        return g.pending ? `${order}（${ORDER_NAME[g.pending.id] || '号令'}を伝え中）` : order;
      };
      const byKind = [];
      for (const g of rt.squadGroups) if (g.count > 0 && !byKind.some((x) => x.kind === g.kind)) byKind.push(g);
      const same = rt.squadGroups.every((g) => !g.count || ordOf(g) === ordOf(byKind[0]));
      const kindOrder = (g) => {
        const order = ordOf(g);
        for (const other of rt.squadGroups) if (other.count > 0 && other.kind === g.kind && ordOf(other) !== order) return '隊ごと';
        return order;
      };
      const fireOf = (g) => (g.kind === 'bow' || g.kind === 'gun' ? `<small>${byKind.length > 1 ? (GROUP_NAME[g.kind] || '').slice(0, -1) : ''}${g.fire ? '射撃中' : '射撃停止'}</small>` : '');
      const groups = same ? `<span class="ord">号令<b>${ordOf(byKind[0])}</b>${byKind.map(fireOf).join('')}</span>`
        : byKind.map((g) => `<span class="ord">${byKind.length > 1 ? `${(GROUP_NAME[g.kind] || '槍隊').slice(0, -1)}：` : ''}<b>${kindOrder(g)}</b>${fireOf(g)}</span>`).join('');
      const formOf = (g) => g.formation === 'yari' ? '横隊' : FORM_NAME[g.formation] || '';
      const form = rt.squadGroups.every((g) => !g.count || formOf(g) === formOf(byKind[0])) ? formOf(byKind[0]) : '隊ごと';
      const sel = byKind.length > 1 && p.selGroup !== 'all' ? `<span>号令先<b>${GROUP_NAME[p.selGroup]}</b></span>` : '';
      // 携帯の横向き：組の数・士気・今の号令・陣形の一行（押すと号令を選ぶ札を開く）。親指の輪と右下の丸の間の帯に置く
      if (isTouch && document.documentElement.classList.contains('tc-low')) {
        sq.style.bottom = '';
        const sg = byKind.find((g) => g.kind === p.selGroup) || byKind[0];
        const now = same || p.selGroup !== 'all' ? kindOrder(sg) + ((sg.kind === 'bow' || sg.kind === 'gun') ? (sg.fire ? '・射撃中' : '・射撃停止') : '') : '隊ごと';
        const more = sq.classList.contains('open') ? `${groups}${sel}` : '';
        setHtml(sq, `<span>組<b>${squadCount}</b></span><span>士気<b>${sqMor}</b></span><span class="ord now">号令<b>${now}</b></span><span>陣形<b>${form}</b></span>${more}`);
        sq.setAttribute('aria-label', `自分の組 ${squadCount} 士気${sqMor} 号令${now} 陣形${form}（押すと陣形を選ぶ）`);
        sq.setAttribute('role', 'button');
      } else {
      // 十六人を超える組は、一人ずつの点でなく、生きている割合と深手の数の一本の帯で
      const many = rt.squad.length > 16;
      const bar = many ? '' : `<span class="pips">${pips}</span>`;
      // 馬の棒などで高さが変わった時に、体力・備え・組の札をまとめて積む。
      // 毎回の位置指定で観測側の配置を戻さない。
      stackBottomLeft();
      setHtml(sq, `<span>組<b>${squadCount}</b></span>${bar}<span>士気<b>${sqMor}</b></span><span>陣形<b>${form}</b></span>${groups}${sel}`);
      }
    } else sq.hidden = true;
    // 指揮パネル
    const cp = $('cmdpanel');
    const squadLabel = String(!!p.cmdOpen);
    if ($('h-squad').getAttribute('aria-expanded') !== squadLabel) $('h-squad').setAttribute('aria-expanded', squadLabel);
    if (p.cmdOpen) {
      const opened = cp.hidden;
      cp.hidden = false;
      let curOrd = '', hasOrder = false, sameOrder = true;
      for (const g of rt.squadGroups) {
        if (!g.count || p.selGroup !== 'all' && g.kind !== p.selGroup) continue;
        const order = g.focus ? 'focus' : g.order;
        if (!hasOrder) { curOrd = order; hasOrder = true; }
        else if (order !== curOrd) sameOrder = false;
      }
      if (!sameOrder) curOrd = '';
      // 札を叩く・押すと号令（数字キーの代わり。数字を割り当てていない号令もこれで出せる）。鍵盤の言い方は指の端末では出さない
      if (!cp.dataset.tap) {
        cp.dataset.tap = '1';
        cp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.rt.player.cmdOpen = false; cp.hidden = true; document.activeElement.blur?.(); return; } const b = e.target.closest('[data-cmd]'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) b.click(); } });
        cp.addEventListener('click', (e) => {
          const li = e.target.closest && e.target.closest('[data-cmd]');
          const pl = this.rt && this.rt.player;
          if (!pl || !pl.cmdOpen) return;
          if (e.target.closest('[data-radial-open]')) { pl.radialKeyboard = true; pl.radial = true; pl.cmdOpen = false; pl.tabT = null; this.updateRadial(this.rt); $('radial').querySelector('[data-radial]')?.focus({ preventScroll:true }); return; }
          if (!li) return;
          pl.command(li.dataset.cmd); pl.cmdOpen = false;
        });
      }
      const cmds = commandList(G.rank);
      let formKey = `${G.rank}:${p.selGroup}`, curForm = null, sameForm = true;
      const hasKind = rt.squadGroups.some((g) => g.kind === p.selGroup);
      for (const g of rt.squadGroups) {
        if (!g.count || p.selGroup !== 'all' && hasKind && g.kind !== p.selGroup) continue;
        const f = !groupSeen(rt, g) ? '' : g.formation === 'yari' ? 'line' : g.formation;
        formKey += ':' + f;
        if (curForm === null) curForm = f; else if (curForm !== f) sameForm = false;
      }
      if (this.squadFormKey !== formKey) {
        this.squadFormKey = formKey;
        this.squadFormHtml = G.rank < 1 ? '' : SQUAD_FORMS.map((c) => {
          const f = c.id.slice(5), on = sameForm && curForm === f;
          return `<button type="button" data-cmd="${c.id}" aria-pressed="${on}" aria-label="${c.label}。${c.desc}">${on ? '● ' : ''}${FORM_NAME[f]}<small>${c.desc}</small></button>`;
        }).join('');
      }
      const forms = this.squadFormHtml;
      setHtml(cp, `<h5>部隊指揮・${esc(GROUP_NAME[p.selGroup] || '全隊')}<span>${isTouch ? '札を指で押して号令' : '数字キーで号令、または札を押す ・ タブで閉じる'}</span></h5><button type="button" class="btn" data-radial-open style="min-height:44px;margin:8px 0">号令の輪を開く</button><div class="squad-forms" role="group" aria-label="組の陣形">${forms}</div><ol>${cmds.filter((c) => !c.id.startsWith('form_')).map((c) => `<li class="${c.id === curOrd ? 'cur' : ''}" data-cmd="${c.id}" role="button" aria-pressed="${c.id === curOrd}" tabindex="0">${!isTouch && c.k ? `<kbd>${c.k}</kbd>` : ''}${c.label}${c.q && !isTouch ? `<em>${c.q}</em>` : ''}<small>${c.desc}</small></li>`).join('')}</ol>` +
        (rt.squadGroups.length > 1 && !isTouch ? `<div class="grp">ジー：号令の対象を切替　現在 <b>${GROUP_NAME[p.selGroup]}</b></div>` : '') +
        (isTouch ? '' : `<div class="grp">号令の札を開かなくても ${K('follow')}・${K('hold')}・${K('attack')}・${K('retreat')} で「ついて来い・待て・突撃・退け」</div>`) +
        `<div class="grp">見える組：${numberHint(rt.squad.filter((x) => sightUnit(rt, x)).length)}。離れた者の様子は分からぬ${rt.G.rank >= 2 ? ' ・ 白い小旗が「前進」の行き先、青い輪が弓の届く範囲' : ''}</div>`);
      if (opened && this.keyboardInput) cp.querySelector('button')?.focus({ preventScroll:true });
    } else cp.hidden = true;
    // 武器・号令ショートカット
    const hasSq = rt.squad.length > 0;
    const rallyReady = p.rallyCd <= 0;
    const pad = this.padMode;
    // 札の角は四字ほどしか入らない。「のキー」を省いた短い名にし、全部の名は設定の画面に任せる。
    const ks = (s) => ({ 左上の横矢印キー: '横矢印', 空白キー: '空白', 右スティック押し込み: '右押込' })[s] || s.replace(/のキー$/, '');
    const kk = { cmd: pad ? 'ワイ' : ks(K('command')), quick: pad ? '十字' : `${ks(K('follow'))}ほか`, rally: pad ? '左肩' : ks(K('rally')), lock: ks(pad ? '右スティック押し込み' : K('lock')) };
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
      (p.mounted ? `<div class="slot cmd"><em>${pad ? 'エー' : ks(K('dodge'))}</em>${ICON.dodge}手綱</div>` : `<div class="slot cmd ${p.sta >= 20 ? '' : 'dim'}"><em>${pad ? 'エー' : ks(K('dodge'))}</em>${ICON.dodge}${p.sta >= 20 ? '回避' : '<span class="why">気力不足</span>'}</div>`) +
      (p.canRide ? `<div class="slot cmd ${p.mounted ? 'on' : ''}"><em>${ks(K('mount'))}</em>${ICON.horse || ICON.quick}${p.mounted ? '降りる' : '乗る'}</div>` : '');
    // 操作プロンプト
    // 倒れている間は「取る」などの札を出さない
    const it = u.alive ? rt.nearestInteract() : null;
    const pr = $('prompt');
    const fenceBlocked = it?.id === 'fence' && (p.blockedWalkT >= 0.7 || rt.holdId === 'fence');
    pr.classList.toggle('fence-blocked', fenceBlocked);
    const actionLabel = it?.label || '', actionHold = it?.hold ? 'true' : 'false';
    if (pr.dataset.action !== actionLabel) pr.dataset.action = actionLabel;
    if (pr.dataset.hold !== actionHold) pr.dataset.hold = actionHold;
    if (it) {
      pr.hidden = false;
      const hp = rt.holdPct || 0;
      const entry = it.id.startsWith('naka_');
      const text = `${fenceBlocked ? '<strong>柵を倒して通る</strong>' : ''}${isTouch ? entry ? '' : '「使う」' : `<kbd>${pad ? 'エックス' : K('use')}</kbd>`}${esc(it.label)}${it.hold ? `<small>（${fenceBlocked ? `長押し・あと${Math.max(1, Math.ceil(it.hold * (1 - hp)))}秒` : '長押し'}）</small><i class="holdbar"><b style="width:${Math.round(hp * 100)}%"></b></i>` : ''}`;
      setHtml(pr, entry ? `<button type="button" data-entry="${esc(it.id)}">${text}</button>` : text);
    } else pr.hidden = true;
    this.firstHelpT = (this.firstHelpT || 0) - dt;
    if (this.firstHelpT <= 0) { this.firstHelpT = 0.5; this.newPlayHelp(rt, it); }
    this.rt = rt;
    this.unitsT = (this.unitsT || 0) - dt;
    if (this.unitsT <= 0) { this.unitsT = 0.2; this.updateUnits(rt); }
    this.notices.sync();
    // 画質「低」（携帯）は印の置き直しを1コマ飛ばしにする（offsetWidth の読みで強制レイアウトが起きるので、毎コマは重い。
    //   一コマが既に遅い時は dt の間引きだと効かないので、コマ数で数える）
    this.markersF = ((this.markersF || 0) + 1) % 2;
    if (S.quality !== 'low' || this.markersF === 0) this.updateMarkers(rt);
    this.lullCue(rt);
    this.updateThreats(rt);
    // ミニマップ
    this.mmT -= dt;
    // 小地図は見えている時だけ描く（設定で消した・手ほどきの間は描かない）
    const mmOn = S.hudMinimap !== false && !this.root.classList.contains('novice');
    if (this.mmT <= 0) { this.mmT = 0.1; if (mmOn) this.drawMap($('minimap'), rt, this.mmRange || 60, true); if (this.bigmap) { this.fitBigmap(rt); this.drawMap($('bigmap'), rt, this.bigRange || 170, false); } }
  }

  // 初めて使える遊びの一言。既存の札を使い、半秒に一度だけ見る。
  newPlayHelp(rt, it) {
    if (!S.hints || rt.over || rt.ended || !rt.player.u.alive || rt.def.town || rt.tut || rt.tutPause || this.hintCur || this.tutCur ||
      !$('intro').hidden || !$('choice').hidden || this.bannerT > 0 || this.bigmap || !this.notices.room(10)) return;
    let id = '';
    if (it && /梯子.*登/.test(it.label) && !helpSeen('ladder')) id = 'ladder';
    else if (it && /旗/.test(it.label) && !helpSeen('flag')) id = 'flag';
    else if (!helpSeen('order')) {
      for (const o of rt.objectives) if (!o.state && (o.kind === 'order' || /下知/.test(o.text))) { id = 'order'; break; }
    }
    if (!id && rt.player.canRide && !helpSeen('ride')) id = 'ride';
    if (!id && rt.player.weapon === 'gun' && !helpSeen('gun')) id = 'gun';
    const pos = rt.player.u.pos;
    if (!id && !helpSeen('ladder')) {
      for (const l of FL.ladders) if (l.hp > 0 && l.placed !== false && (l.team == null || l.team === rt.player.u.team) &&
        Math.abs(pos.y - l.y0) < 3 && Math.hypot(l.x - pos.x, l.z - pos.z) < 8) { id = 'ladder'; break; }
    }
    if (!id && !helpSeen('flag')) {
      for (const g of rt.army.groups) if (g.team === rt.player.u.team && g.count > 0 && g.stds && g.stds.length) {
        const st = g.stds[0];
        const carrier = st.userData.carrier;
        const at = carrier && carrier.alive ? carrier.pos : st.parent === rt.scene ? st.position : null;
        if (at && st.visible && Math.hypot(at.x - pos.x, at.z - pos.z) < 25) { id = 'flag'; break; }
      }
    }
    if (!id && S.hudMinimap !== false && !this.root.classList.contains('novice') && !helpSeen('map')) id = 'map';
    if (id) this.playHelp(id);
  }

  playHelp(id) {
    if (!S.hints || this.hintCur || this.tutCur || !$('intro').hidden || !$('choice').hidden || this.bannerT > 0 ||
      this.bigmap || this.root.hidden || this.root.classList.contains('photo') || !this.notices.room(10)) return false;
    return firstHelp(id, (text) => {
      this.hint(text, '', 6500);
      this.notices.sync();
      if (this.notices.visible('tutorial')) return true;
      clearTimeout(this.hintTimer); this.hintCur = null; this.drawCard();
      return false;
    });
  }

  // 両軍の兵力と陣太鼓時計、年月日
  // 束32：制圧の札（主要地点だけ。曲輪・大手門・搦手門・主な櫓。多くて6つ）。画面の端に一列の短い札。
  // 変わった時だけ6秒強く見せ、普段は薄く。rt.nawabari（K）が無い戦は何も出さない
  updateSiegeCards(rt) {
    const K = rt.nawabari;
    if (!K || !K.kuruwa || rt.over || rt.ended) { if (this._scEl) { this._scEl.hidden = true; this._scEl.style.display = 'none'; } return; }
    if (!this._scEl) {
      const d = document.createElement('div');
      d.id = 'siegecards';
      d.style.cssText = 'position:fixed;right:calc(10px + env(safe-area-inset-right,0px));top:calc(84px + env(safe-area-inset-top,0px));z-index:12;display:flex;flex-direction:column;gap:6px;pointer-events:none;max-width:150px;';
      document.body.appendChild(d);
      this._scEl = d; this._scState = new Map();
    }
    const CAP_WORD = { [CAPTURE.FRIEND]: '味方', [CAPTURE.ENEMY]: '敵', [CAPTURE.CONTESTED]: '交戦中', [CAPTURE.EMPTY]: '空き' };
    const GATE_WORD = { [GATE_STATE.OPEN]: '開', [GATE_STATE.BROKEN]: '破れ', [GATE_STATE.CLOSED]: '閉', [GATE_STATE.BARRED]: '閂' };
    const items = [];
    for (const ku of Object.values(K.kuruwa)) { const b = ku._box; const p = b && { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }; items.push({ id: `k_${ku.id}`, name: ku.name, word: p && sightRef(rt, ku, p) ? CAP_WORD[ku.captureState] || '' : '様子不明', pri: ku.kind === 'hon' ? 0 : 2 }); }
    for (const gt of Object.values(K.gates || {})) if (gt.role) items.push({ id: `g_${gt.id}`, name: gt.name, word: gt.at && sightRef(rt, gt, gt.at) ? GATE_WORD[gt.state] || '' : '様子不明', pri: 1 });
    items.sort((a, b) => a.pri - b.pri);
    const main = items.slice(0, 3);
    const unknown = main.filter((it) => it.word === '様子不明');
    const top = main.filter((it) => it.word !== '様子不明');
    if (unknown.length) top.push({ id: 'unknown', name: `未見${unknown.length}か所`, word: '様子不明' });
    const now = rt.t || 0, rm = S.reduceMotion;
    this._scEl.hidden = !top.length; this._scEl.style.display = top.length ? 'flex' : 'none';
    // 任務の札（#objectives）の下から並べる（札が長くなっても重ならないように）
    { const ob = document.getElementById('objectives'), r = ob && !ob.hidden ? ob.getBoundingClientRect() : null; const mm = document.getElementById('minimap'), mr = mm && mm.offsetParent ? mm.getBoundingClientRect() : null; const lowH = window.innerHeight <= 500 && mr && mr.height > 0;
      // 低い画面（携帯横）：小地図の下に並べると下の操作の帯（狙い・回避）に重なるので、小地図の左に並べる（10/2 稲葉山）
      const bot = lowH ? Math.max(r && r.height > 0 ? r.bottom + 6 : 0, mr.top) : Math.max(r && r.height > 0 ? r.bottom : 0, mr && mr.height > 0 ? mr.bottom : 0) + 6; const want = Math.max(84, Math.round(bot)); const right = lowH ? Math.round(window.innerWidth - mr.left + 8) : 10;
      if (this._scTop !== want) { this._scTop = want; this._scEl.style.top = want + 'px'; }
      if (this._scRight !== right) { this._scRight = right; this._scEl.style.right = right + 'px'; } }
    const low = window.innerHeight <= 500;   // 低い画面は、変わった札だけ（常に並べると小地図・丸釦に掛かる）
    this._scEl.innerHTML = top.map((it) => {
      const prev = this._scState.get(it.id);
      if (!prev || prev.word !== it.word) this._scState.set(it.id, { word: it.word, t: now });
      const rec = this._scState.get(it.id);
      const strong = now - rec.t < 6;
      if (low && !strong) return '';
      const bg = it.word === '味方' ? 'rgba(74,122,99,.9)' : it.word === '敵' ? 'rgba(178,51,31,.9)' : it.word === '交戦中' ? 'rgba(194,150,30,.9)' : 'rgba(60,56,48,.75)';
      return `<div style="padding:4px 6px;font-size:12px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff5ea;background:${bg};opacity:1;border-radius:3px;${rm ? '' : 'transition:opacity .4s;'}">${esc(it.name)}　${esc(it.word)}</div>`;
    }).join('');
  }

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
      if (!u.alive || u.gone) continue;
      // 背後や画面外でも、三十メートル以内の実兵は近くの気配に含める。
      const dx = u.pos.x - rt.player.u.pos.x, dz = u.pos.z - rt.player.u.pos.z;
      const nearby = dx * dx + dz * dz <= 30 * 30;
      if (nearby || sightScreenUnit(rt, u)) { if (u.team === 0) a++; else b++; }
    }
    // 本物に替えた兵と隠した兵を除き、実際に描く列・旗・後詰めを拾う。
    for (const A of rt.world.armies || []) {
      if (!A.mesh?.visible) continue;
      let n = sightArmyMesh(rt, A.body, A.U);
      if (A.host) n += sightArmyMesh(rt, A.host.meshes[0], A.U);
      // 丘の向こうに幟だけ見えていても、軍勢の姿として知らせる。
      if (!n && A.parts?.banners) n = sightArmyMesh(rt, A.parts.banners, A.U);
      if (!n && A.host?.meshes[2]) n = sightArmyMesh(rt, A.host.meshes[2], A.U);
      const team = A.team ?? (A.mon === sides.b.mon ? 1 : A.mon === sides.a.mon ? 0 : ENEMY_MON.has(A.mon) ? 1 : 0);
      if (team === 0) a += n; else b += n;
    }
    for (const C of rt.world.clashes || []) {
      if (!C.blocks || !C.mesh?.visible) continue;
      for (let i = 0; i < 2; i++) {
        const D = i ? C.B : C.A;
        if (!D?.alive || D.P.hidden) continue;
        let n = sightArmyMesh(rt, D.meshes.bodyN, D.U, true) + sightArmyMesh(rt, D.meshes.bodyF, D.U, true);
        if (D.host) n += sightArmyMesh(rt, D.host.g.children[0], D.host.U);
        if (!n) n = sightArmyMesh(rt, D.meshes.banners, D.U, true);
        if (!n && D.host?.g.children[2]) n = sightArmyMesh(rt, D.host.g.children[2], D.host.U);
        if ((D.P.team ?? i) === 0) a += n; else b += n;
      }
    }
    rt.armyInit.a = Math.max(rt.armyInit.a, a);
    rt.armyInit.b = Math.max(rt.armyInit.b, b);
    // 経過の札は段の切り替えでも戻さず、新しい戦の初めだけ零にする。
    const t = this.armyClock = Math.max(this.armyClock || 0, Math.floor(rt.t));
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const key = `${a}|${b}|${clock}|${rt.flags.ek || 0}`;
    this.lastA = a; this.lastB = b;
    if (key === this.armyKey) return;
    const first = !this.armyKey;
    this.armyKey = key;
    ab.hidden = false;
    if (first) {
      // 狭い画面では軍の名を短く（「織田・徳川軍」→「織田軍」）して、二行に折れないように
      //   長い名（「延暦寺の僧兵・浅井朝倉の残党」）は「・」の前だけに。それでも入らなければ末尾を「…」に（隣の数と重ならないように）
      const sn = (n) => { n = n.replace(/（[^）]*）/g, ''); if (window.innerWidth >= 1000) return n; n = n.replace(/・[^・]*軍$/, '軍'); return n.length > 8 && n.includes('・') ? n.split('・')[0] : n; };
      ab.innerHTML = `<div class="side a"><div class="nm"><canvas width="44" height="44" data-m="${sides.a.mon}"></canvas><span class="n">${esc(sn(sides.a.name))}</span><small id="ab-a"></small></div><div class="gauge"><s id="ab-sa"></s><b id="ab-ga"></b></div></div>
        <div class="clock"><span id="ab-c"></span><small>経過</small></div>
        <div class="side b"><div class="nm"><small id="ab-b"></small><span class="n">${esc(sn(sides.b.name))}</span><canvas width="44" height="44" data-m="${sides.b.mon}"></canvas></div><div class="gauge"><s id="ab-sb"></s><b id="ab-gb"></b></div></div>`;
      ab.querySelectorAll('canvas[data-m]').forEach((c) => { const g = c.getContext('2d'); g.save(); g.translate(0, -8); drawMon(g, c.dataset.m, 44, 88); g.restore(); });
      $('dateline').textContent = rt.def.date ? rt.def.date(rt) : '';
      this.fitDate();
    }
    this.lastA = a; this.lastB = b;
    // 総勢・残数・兵力比は武者の目には分からない。目に入る兵の気配だけ。
    $('ab-a').textContent = a ? `目の前の味方 ${a >= 300 ? '大軍' : numberHint(a)}` : '味方は視界の外';
    $('ab-b').textContent = b ? `目の前の敵 ${b >= 300 ? '大軍' : b >= 30 ? '大勢' : numberHint(b)}` : '敵は視界の外';
    const pa = a ? 50 : 0, pb = b ? 50 : 0;
    $('ab-ga').parentElement.hidden = true;
    $('ab-gb').parentElement.hidden = true;
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
    // 近い兵の候補は 0.1 秒に一度だけ選び直す（毎コマ全兵を回さない。遠い兵・倒れた兵・寝ている兵は外す）
    const nowT = rt.t || 0;
    if (!this.ovCand || this.ovRt !== rt || nowT - this.ovAt >= 0.1 || nowT < this.ovAt) {
      this.ovRt = rt; this.ovAt = nowT; const cand = this.ovCand = [];
      for (const u of rt.army.units) {
        if (!u.alive || u.isPlayer || u.team !== 0 || u.type === 'dummy' || u.type === 'porter' || u.invuln && !u.name) continue;
        if (Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z) <= (u.name && !u.isSub && u.type === 'busho' ? 50 : 30)) cand.push(u);
      }
    }
    for (const u of this.ovCand) {
      if (!u.alive || u.isPlayer || u.team !== 0 || u.type === 'dummy' || u.type === 'porter' || u.invuln && !u.name) continue;
      const d = Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z);
      const knownGeneral = !!u.name && !u.isSub && u.type === 'busho';
      if (d > (knownGeneral ? 48 : 26) || u.offscreen || !u.mesh.visible) continue;
      if (knownGeneral && !enemyKnown(rt, u)) continue;
      if (knownGeneral && rt.army.wallBetween(rt.player.u.pos, rt.player.u.team, u.pos)) continue;
      if (!sightUnit(rt, u)) continue;
      const s = this.project(u.pos, u.pos.y + (u.mounted ? 3.3 : 2.35), rt);
      if (s.behind || s.x < 0 || s.x > W || s.y < 0 || s.y > H) continue;
      // 要る時だけ出す：敵は戦っている相手・狙っている相手、味方は傷ついた者（Alt で組を全部）
      const P = rt.player;
      // 敵の棒は、狙っている相手・自分に打ちかかる相手・すぐそばで打たれた相手だけ（遠くの斬り合いの棒が横一列に並ばないように）
      const fighting = P.lock === u || P.aimed === u || (u.target && u.target.isPlayer && d < 10) || (u.lastHitT < 3 && d < 7);
      // 味方の棒と名は、深手（六割を切った）の時だけ（乱戦で組の名が並ばないように。Alt で全部）
      const hurt = u.hp < u.maxHp * 0.6 && u.lastHitT < 10;
      // 武将（busho・名のある者）は、敵も味方も近ければ（18m 以内）いつも棒を出す（大将の傷み具合が戦の流れを決めるので）
      const showBar = u.team === 0 && (hurt || (P.showSquad && u.isSub));
      // 組の者の名は、傷ついた時と Alt の時だけ（いつも出すと戦場が字だらけになる）
      // 名は名のある者だけ。名の無い侍・武将は狙った時と Alt の時だけ「侍」「武将」と出す（戦場を字で埋めない）
      let named = (u.team === 0 || (u.announced && fighting)) && d < 18 && !(u.isSub && !u.kerai && !hurt && !P.showSquad) && (u.name || ((u.type === 'samurai' || u.type === 'busho') && (P.lock === u || P.aimed === u || P.showSquad)));
      // 最小のスマホ横：名は狙っている相手と、名のある武将（busho）だけ
      if (named && leanHud() && !(u.kerai || P.lock === u || P.aimed === u || (u.type === 'busho' && u.name))) named = false;
      // 遠目は家紋、中ほどは兜と顔、間近で名を読む。狙った相手の名は残す。
      if (knownGeneral && d >= 9 && P.lock !== u && P.aimed !== u) named = false;
      const crest = knownGeneral && d >= 22 && d < 48;
      if (!showBar && !named && !crest) continue;
      // 札や指の丸の上には描かない（重ねて読めなくしない）
      const blocked = (this.hudRects(), this.rectsAll || []).some((r) => s.x > r.left - 20 && s.x < r.right + 20 && s.y > r.top - 16 && s.y < r.bottom + 4);
      if (blocked && !named) continue;
      if (crest) {
        const cx = s.x, cy = s.y - 12;
        if (namesPut.length >= 3 || namesPut.some((q) => Math.abs(q[0] - cx) < (q[2] + 24) / 2 + 12 && Math.abs(q[1] - cy) < 24)) continue;
        const gen = GENERALS[u.name.replace(/^.* /, '')];
        const mon = gen?.mon || FACTION[u.group?.faction]?.flag || (u.team === 0 ? rt.def.sides?.a?.mon : rt.def.sides?.b?.mon);
        if (!mon) continue;
        namesPut.push([cx, cy, 24]);
        g.globalAlpha = Math.min(0.85, (48 - d) / 8);
        g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(cx - 13, cy - 13, 26, 26);
        g.drawImage(monIcon(mon), cx - 11, cy - 11, 22, 22);
        g.globalAlpha = 1;
        continue;
      }
      const k = Math.max(0.45, Math.min(1.2, 9 / d));
      const w = 34 * k, h = Math.max(3, 4 * k);
      const x = s.x / zoom - w / 2, y = s.y / zoom;
      // 戦わない者（逃げる町の者など：noTarget で打ちかからない）は、敵の赤でなく褪せた土色にする
      const civil = u.team !== 0 && u.noTarget && !(u.dmg > 0);
      const col = civil ? '#b3a58a' : u.team !== 0 ? (S.colorAssist ? '#ff9a1a' : '#d24a30') : u.isSub ? '#efe6cf' : (S.colorAssist ? '#4fc3f7' : '#4f7fca');
      const alpha = Math.min(1, (26 - d) / 6) * (u.lastHitT < 2 || u.team === 0 ? 1 : 0.7);
      g.globalAlpha = alpha;
      if (showBar && !blocked) {
        // 敵は▼を添えた太い棒、味方は細い棒（色だけに頼らず形でも分ける）
        const hh = u.team !== 0 ? h : Math.max(2, h * 0.55);
        g.fillStyle = 'rgba(0,0,0,.7)';
        g.fillRect(x - 1, y - 1, w + 2, hh + 2);
        g.fillStyle = col;
        g.fillRect(x, y, w * (u.hp < u.maxHp * 0.35 ? 0.25 : 0.6), hh);
        if (u.team !== 0 && !named && !civil) { const cx = x + w / 2, ty = y - 3; g.beginPath(); g.moveTo(cx - 4, ty - 5); g.lineTo(cx + 4, ty - 5); g.lineTo(cx, ty); g.closePath(); g.fill(); }
        // 乱戦で敵味方が入り混じる時のため：本人に斬りかかっている敵だけ、足元に薄い赤の輪（色だけでなく形でも、いつでも出す）
        if (u.team !== 0 && !civil && fighting) {
          const fp = this.project(u.pos, u.pos.y + 0.05, rt);
          if (!fp.behind) {
            g.globalAlpha = alpha * 0.55;
            g.strokeStyle = S.colorAssist ? '#ff9a1a' : '#e2472c';
            g.lineWidth = 2;
            g.beginPath(); g.ellipse(fp.x, fp.y, 12 * k, 4 * k, 0, 0, Math.PI * 2); g.stroke();
            g.globalAlpha = alpha;
          }
        }
      }
      if (named) {
        // 名の字は 12px を下回らない（読めない字は置かない）
        g.font = `${Math.max(12, Math.round(11 * k * 1.1))}px "Shippori Mincho B1", serif`;
        g.textAlign = 'center';
        g.fillStyle = 'rgba(0,0,0,.8)';
        const label = u.name || (u.type === 'busho' ? '武将' : '侍');
        // 先に書いた名と重なるなら書かない（字が重なって読めなくならないように）
        const lw = g.measureText(label).width, lx = s.x / zoom, ly = y - 3;
        // 任務の札に名の端が掛かった時も描かない。薄い字を透かして重ねない。
        if ((this.rectsAll || []).some((r) => lx + lw / 2 + 4 > r.left && lx - lw / 2 - 4 < r.right && ly + 4 > r.top && ly - 18 < r.bottom)) continue;
        if (namesPut.some((q) => Math.abs(q[0] - lx) < (q[2] + lw) / 2 + 12 && Math.abs(q[1] - ly) < 18)) continue;
        namesPut.push([lx, ly, lw]);
        g.fillText(label, s.x / zoom + 1, y - 3 + 1);
        g.fillStyle = u.team !== 0 ? '#ffd0c4' : '#f3e6c4';
        g.fillText(label, s.x / zoom, y - 3);
      }
    }
    g.globalAlpha = 1;
    // 自分の組も、目に入る者だけ白い印で示す。
    if (rt.player.showSquad) {
      g.font = '12px "Shippori Mincho B1", serif'; g.textAlign = 'center';
      for (const u of rt.squad) {
        if (!sightUnit(rt, u)) continue;
        const s2 = this.project(u.pos, u.pos.y + 2.6, rt);
        if (s2.behind) continue;
        g.fillStyle = '#f1e9d6';
        g.beginPath(); g.moveTo(s2.x, s2.y); g.lineTo(s2.x - 5, s2.y - 7); g.lineTo(s2.x + 5, s2.y - 7); g.closePath(); g.fill();
        if (u.name) { g.fillStyle = 'rgba(0,0,0,.7)'; g.fillText(u.name, s2.x + 1, s2.y - 10); g.fillStyle = '#f1e9d6'; g.fillText(u.name, s2.x, s2.y - 11); }
      }
    }
    // 組を向かわせた行き先は、戦場の地面に立てた本物の白い小旗と点線で示す（battle.js の updateDestMarks）
    // 一人称で雨の中にいる時だけ、画面（目の前）に雨粒が付いて、ゆっくり流れ落ちる。動きを減らす設定では出さない
    this.drawRainDrops(g, W, H, rt);
    this.drawBrim(g, W, H, rt);
  }

  // 一人称：画面の上の端に、かぶっている物の縁がうっすら見える（陣笠の縁・兜の眉庇）。上を向くほど大きく
  drawBrim(g, W, H, rt) {
    const P = rt.player, k = Math.max(0, ((P.fpK || 0) - 0.7) / 0.3);
    if (k <= 0 || !P.u.alive) return;
    const look = P.sightHat || 'jingasa';
    const kabuto = /kabuto/.test(look);
    const up = Math.max(0, Math.min(1, (P.pitch || 0) / 0.5));
    const h = H * (kabuto ? 0.045 : 0.035) * (1 + up * 1.6) * k;
    g.save();
    // 暗がりの勾配は、大きさ（整数の px）が変わった時だけ作り直す
    const bk = (kabuto ? 'k' : 'j') + Math.round(h) + ':' + W + ':' + H;
    if (!this.brimGr || this.brimGr.k !== bk || this.brimGr.g !== g) {
      const gr0 = g.createLinearGradient(0, 0, 0, h * 1.6);
      gr0.addColorStop(0, kabuto ? 'rgba(8,7,6,.82)' : 'rgba(20,16,12,.7)'); gr0.addColorStop(0.7, 'rgba(12,10,8,.35)'); gr0.addColorStop(1, 'rgba(12,10,8,0)');
      this.brimGr = { k: bk, g, gr: gr0 };
    }
    g.fillStyle = this.brimGr.gr;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0);
    // 縁は画面の両端で下がる弧（眉庇は真ん中が少し下がる）
    if (kabuto) { g.lineTo(W, h * 0.6); g.quadraticCurveTo(W / 2, h * 1.9, 0, h * 0.6); }
    else { g.lineTo(W, h * 1.5); g.quadraticCurveTo(W / 2, h * 0.2, 0, h * 1.5); }
    g.closePath(); g.fill();
    if (kabuto) {
      // 錣の端が左右にわずかに掛かる。向きを変えると、その先を見渡せる。
      g.fillStyle = 'rgba(8,7,6,.85)';
      const edge = W * 0.018 * k;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(edge, H * 0.2); g.quadraticCurveTo(edge * 0.3, H * 0.6, 0, H); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(W, 0); g.lineTo(W - edge, H * 0.2); g.quadraticCurveTo(W - edge * 0.3, H * 0.6, W, H); g.closePath(); g.fill();
    }
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
      // 粒の絵は一枚だけ作って、大きさを変えて使い回す
      g.drawImage(dropSprite(), d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
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
    clearTimeout(this.mhT);
    if (this.bigmap) {
      const lead = (this.rank || 0) >= 2 && this.hasSquad;
      const rows = (this.rt?.allyMapRows || []).filter((r) => r.active && sightRef(this.rt, r, r));
      mh.innerHTML = `<div class="op" style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" class="btn" data-map-zoom="-200">地図を拡大する</button><button type="button" class="btn" data-map-zoom="200">地図を縮小する</button><button type="button" class="btn" id="map-close">地図を閉じる</button></div><details><summary style="min-height:44px;cursor:pointer">地図の印・操作・味方の名を見る</summary><div class="lg"><span>▲自分</span><span>●自分の組</span><span>■味方</span><span>▲敵</span><span>◇任務</span><span>本陣は本陣の旗</span></div><div class="lg std"><span>${STD_SVG.honjin}本陣</span><span>${STD_SVG.spear}槍・弓</span><span>${STD_SVG.gun}鉄砲</span><span>${STD_SVG.cavalry}騎馬</span></div><p>${lead ? '地図を押すと、号令先の隊がそこへ向かいます。' : '地図で戦場を見渡せます。'}下の顔の札で隊を選べます。</p>${rows.map((r) => `<p>${r.number}　${esc(r.name)}　${esc(r.action || '')}</p>`).join('')}</details><details><summary style="min-height:44px;cursor:pointer">小地図の広さを選ぶ</summary><div class="op" style="display:flex;flex-wrap:wrap;gap:8px">${[40,60,100].map((r) => `<button type="button" class="btn" data-map-range="${r}" aria-pressed="${(this.mmRange || 60) === r}">${r}メートル</button>`).join('')}</div></details>`;
      mh.querySelectorAll('button').forEach((b) => { b.style.minHeight = '44px'; b.onkeydown = (e) => { e.stopPropagation(); }; });
      mh.onclick = (e) => {
        e.stopPropagation(); const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.mapZoom) this.zoomBigmap(+b.dataset.mapZoom);
        if (b.dataset.mapRange) { this.mmRange = +b.dataset.mapRange; mh.querySelectorAll('[data-map-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }
        if (b.id === 'map-close') this.toggleMap();
      };
    }
  }

  cycleMinimap() {
    const ranges = [40, 60, 100];
    this.mmRange = ranges[(ranges.indexOf(this.mmRange || 60) + 1) % 3];
    this.flash(`ミニマップ ${this.mmRange}メートル`, 'dim');
  }
  zoomBigmap(dy) { this.bigUser = true; this.bigRange = Math.max(40, Math.min(180, (this.bigRange || 170) + dy * 0.1)); }
  // 戦術マップの中心と縮尺を、いま戦っている所（自分・両軍の隊・任務）に合わせる。ホイールで触ったらその縮尺を守る
  fitBigmap(rt) {
    const pts = [rt.player.u.pos];
    for (const g of rt.army.groups) if (g.count && !g.routed && sightRef(rt, g, g.center()) && g.units.some((u) => u.alive && u.type !== 'dummy')) pts.push(g.center());
    for (const m of rt.markers) { const q = typeof m.pos === 'function' ? m.pos() : m.pos; if (q && !m.intelHidden && (!(m.red || m.person) || sightRef(rt, m, q))) pts.push(q); }
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
    // 方位磁針は見た目が変わらない細かさで十分（毎コマでなく 20 回/秒ほどに絞る。重い戦ほど助かる）
    if (rt.t - (this._compassT || -1) < 0.05) return;
    this._compassT = rt.t;
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
      if (!q || m.red || (m.group && m.group.team !== 0) || m.intelHidden || ((m.red || m.person) && !sightRef(rt, m, q))) continue;
      const d = Math.hypot(q.x - pu.x, q.z - pu.z);
      const distance = `${Math.round(d)}メートル`;
      items.push({ a: Math.atan2(q.x - pu.x, q.z - pu.z), d, hw: distance.length * 6 * (S.uiScale === 'l' ? 1.2 : 1) + 4, html: `<span>◆</span><small>${distance}</small>`, cls: m.red ? 'mk red' : 'mk' });
    }
    for (const g of rt.squadGroups) {
      if (!g.count) continue;
      const c = g.center();
      if (!sightRef(rt, g, c)) continue;
      if (Math.hypot(c.x - pu.x, c.z - pu.z) < 6) continue;
      items.push({ a: Math.atan2(c.x - pu.x, c.z - pu.z), html: '<span>●</span>', cls: 'mine' });
    }
    for (const it of items) {
      let rel = it.a - p.yaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      it.x = Math.abs(rel) > Math.PI / 2 ? null : W / 2 - (rel / (Math.PI / 2)) * (W / 2);
    }
    let html = '';
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.x === null) continue;
      // 距離の札が重なる向きでは近い印だけを出す。字を大きくする設定も幅に含める。
      let crowded = false;
      if (it.d !== undefined) for (let j = 0; j < items.length; j++) {
        const other = items[j];
        if (other.x !== null && other.d !== undefined && (other.d < it.d || other.d === it.d && j < i) && Math.abs(other.x - it.x) < other.hw + it.hw) { crowded = true; break; }
      }
      if (crowded) continue;
      html += `<div class="c ${it.cls}" style="left:${it.x.toFixed(1)}px">${it.html}</div>`;
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
    const key = [p.radialSel, p.radialPreview, p.selGroup, cur, rt.G.rank, kinds.join(','), gs.map((g) => tagOf(g)).join(',')].join('|');
    if (key === this.radialKey) return;
    this.radialKey = key;
    const focus = el.contains(document.activeElement) ? document.activeElement : null;
    const focusItem = focus?.dataset.radial, focusTeam = focus?.dataset.radialTeam;
    // 早打ちのキーがある号令は、その鍵を添える（輪を開かなくても出せると覚えられる）
    const qk = { follow: K('follow'), hold: K('hold'), attack: K('attack'), retreat: K('retreat'), rally: K('rally') };
    if (!el.dataset.keys) {
      el.dataset.keys = '1';
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const pl = this.rt?.player; if (pl) { pl.radial = false; pl.radialKeyboard = false; pl.radialSel = -1; pl.tabT = null; } el.hidden = true; $('h-squad').focus({ preventScroll:true }); return; }
        const b = e.target.closest('[data-radial]');
        if (!b) { if (e.target.closest('[data-radial-team]')) e.stopPropagation(); return; }
        if (['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)) {
          e.preventDefault(); e.stopPropagation();
          const items = el.querySelectorAll('[data-radial]');
          const i = (+b.dataset.radial + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 7 : 1)) % items.length;
          items[i].focus();
        } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) b.click(); }
      });
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-radial]'), team = e.target.closest('[data-radial-team]');
        e.stopPropagation();
        if (team) { this.pickGroup(team.dataset.radialTeam); return; }
        if (!b) return;
        if (b.getAttribute('aria-disabled') === 'true') { b.focus({ preventScroll: true }); b.querySelector('.why')?.setAttribute('role', 'status'); return; }
        const pl = this.rt?.player, item = RADIAL[+b.dataset.radial];
        if (!pl || !item) return;
        if (item.id === 'rally') pl.rally(); else pl.command(item.id);
        pl.radialSel = -1; pl.radial = false; pl.radialKeyboard = false; pl.tabT = null; el.hidden = true;
      });
    }
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', `号令の輪・${GROUP_NAME[p.selGroup] || '全隊'}`);
    el.innerHTML = RADIAL.map((it, i) => {
      const a = i * Math.PI / 4;
      const x = Math.sin(a) * 170, y = -Math.cos(a) * 170;
      const locked = it.min && rt.G.rank < it.min;
      const on = i === (p.radialPreview >= 0 ? p.radialPreview : p.radialSel);
      const now = !locked && it.id === cur;
      const why = locked ? `<small class="why">${esc((RANKS[it.min] || {}).name || '')}から</small>` : '';
      return `<div class="rw ${on ? 'on' : ''} ${locked ? 'locked' : ''} ${now ? 'now' : ''}" role="menuitem" tabindex="0" data-radial="${i}" aria-disabled="${locked ? 'true' : 'false'}" style="transform:translate(${x.toFixed(0)}px,${y.toFixed(0)}px)">${on ? '<span class="sel">▶</span>' : ''}${it.label}${now ? '<i class="nowm" title="いまの号令">今</i>' : ''}${it.min && rt.G.rank === it.min && !now ? '<i class="newm" title="この身分で増えた号令">新</i>' : ''}${qk[it.id] && !locked ? `<kbd>${esc(qk[it.id])}</kbd>` : ''}${why}</div>`;
    }).join('') +
      `<div class="rc"><strong style="display:block;font-size:max(13px, calc(13px * var(--text-scale, 1)))">号令先：${esc(GROUP_NAME[p.selGroup] || '全隊')}</strong>${p.radialSel >= 0 ? RADIAL[p.radialSel].label : (isTouch ? '指で叩いて<br>選ぶ<br><small>真ん中でやめる</small>' : 'マウスで選び<br>タブを放す<br><small>真ん中で放すとやめる</small>')}` +
      // 号令先の隊：札の並び（選んだ隊は金、数字キーでも選べる）
      (kinds.length > 1 ? `<div class="rg">${['all', ...kinds].map((k, i) => {
        const g = rt.squadGroups.find((x) => x.kind === k && x.count > 0);
        const sel = p.selGroup === k || (p.selGroup === 'all' && k === 'all');
        return `<button type="button" data-radial-team="${k}" class="${sel ? 'on' : ''}" aria-pressed="${sel}" style="min-height:44px;margin:4px">${k === 'all' ? '全隊' : KIND_WORD[k] || '組'}${g ? `<i style="background:${TAG_COL[tagOf(g)]}"></i><small>${tagOf(g) === 'ok' ? '数は十分' : tagOf(g) === 'mid' ? '数が減った' : tagOf(g) === 'gone' ? '隊が崩れた' : '半ばより多く失った'}</small>` : ''}<kbd>${i}</kbd></button>`;
      }).join('')}</div><small class="rgk">${isTouch ? '下の顔の札で号令先' : 'ジーか数字で号令先'}</small>` : '') + `</div>`;
    const teams = el.querySelector('.rg'); if (teams) el.appendChild(teams);
    if (focusItem !== undefined) el.querySelector(`[data-radial="${focusItem}"]`)?.focus({ preventScroll:true });
    else if (focusTeam) el.querySelector(`[data-radial-team="${focusTeam}"]`)?.focus({ preventScroll:true });
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
    for (const sel of ['#sonae-cards', '#battle-notices', '#battle-log-entry', '#objectives', '#minimap', '#maphint', '.bl', '.tl .plaque', '.tl .next', '#toasts', '#armybar', '#compass', '#h-bottom', '#h-squad', '#tutorial', '#h-units', '#skiphint', '#boss', '#target', '#subtitle', '#bark', '#choice', '#banner.show', '#prompt']) {
      const el = sel === '#sonae-cards' ? document.getElementById('sonae-cards') : this.root.querySelector(sel);
      if (!el || el.hidden || !el.offsetParent) continue;
      // 今は消している札（平時の兵力の帯など）は避けなくてよい
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) this.rects.push(r);
      // 折り返した兵力の字は、帯の箱からはみ出す時も実寸で避ける。
      if (sel === '#armybar') for (const side of el.querySelectorAll('.side')) {
        const sr = side.getBoundingClientRect();
        if (sr.width > 0 && sr.height > 0) this.rects.push(sr);
      }
    }
    // 指の端末の丸（右下の突く・構え…と左上の止める・地図）も避ける
    for (const el of document.querySelectorAll('#tc:not([hidden]) .tb:not([hidden])')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) this.rects.push(r);
    }
    // 道しるべの名札（rt.markers・例：「組頭 源八」）も避ける。ここを外すと、道しるべの名と
    // 頭上の名が同じ人に二つ並んでしまう（戦の始まりに名札が二重に出る不具合）
    // （印どうしは updateMarkers の placed で離すので、印が避ける札には入れない。入れると自分の前の位置を避けて、印が 1 秒に何度も左右へ跳ねていた。10/2）
    this.mkRects = [];
    for (const el of document.querySelectorAll('#markers .mk')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) this.mkRects.push(r);
    }
    this.rectsAll = this.rects.concat(this.mkRects);
    return this.rects;
  }

  // 印（x を中心に、y から上へ伸びる箱）が札に重ならない所を探す。
  // axis：'v' なら上下にだけ、'h' なら左右にだけ動かす（画面の端に寄せた印は端に沿って滑らせる）
  avoidRects(x, y, W, H, axis, extra = null, hw = 37, height = 0, hideIfFull = false) {
    const mw = hw * 2, mh = height || (extra ? 58 : 50), rects = extra && extra.length ? this.hudRects().concat(extra) : this.hudRects();
    const free = (a, b) => a - hw > 6 && a + hw < W - 6 && b - mh > 6 && b < H - 8 && rects.every((r) => a + mw / 2 < r.left || a - mw / 2 > r.right || b < r.top || b - mh > r.bottom);
    if (free(x, y)) return [x, y];
    for (let k = 1; k <= 40; k++) {
      const d = Math.ceil(k / 2) * 18 * (k % 2 ? 1 : -1);
      if (axis !== 'h' && free(x, y + d)) return [x, y + d];
      if (axis !== 'v' && free(x + d, y)) return [x + d, y];
    }
    // 決めた向きだけでは空きが無い時（後ろの印が下の字幕の帯に並ぶ時など）は、斜めにも探す（重ねたままにしない）
    if (extra) for (let k = 1; k <= 12; k++) for (const dx of [0, -1, 1]) { const a = x + dx * k * 40, b = y - k * 20; if (free(a, b)) return [a, b]; }
    return hideIfFull ? null : [x, y];
  }

  // 敵勢を追い続ける方角の札は出さない。
  lullCue(rt) {
    const el = $('lullcue');
    if (el) el.hidden = true;
  }
  updateMarkers(rt) {
    const W = window.innerWidth, H = window.innerHeight;
    const seen = new Set();
    const placed = [];
    // 地面の矢印と同じ行き先を、画面の端でも示す。
    const posOf = (m) => (typeof m.pos === 'function' ? m.pos() : m.pos);
    if (guidanceEnded(rt)) {
      for (const el of this.markerEls.values()) el.hidden = true;
      return;
    }
    const main = S.reduceGuidance ? null : rt.missionGuide?.marker || null;
    // 同じ名の行き先は最寄りだけを名札にし、ほかは小さな印にする。
    const nearestNames = this.nearestMarkerNames || (this.nearestMarkerNames = new Map());
    const nameCounts = this.markerNameCounts || (this.markerNameCounts = new Map());
    nearestNames.clear(); nameCounts.clear();
    const pu = rt.player.u.pos;
    for (const m of rt.markers) {
      const q = posOf(m), name = fieldLabel(markerName(m));
      if (!name || !q || !Number.isFinite(q.x) || !Number.isFinite(q.z) || m.person || m.red || m.intelHidden || (m.group && m.group.team !== 0)) continue;
      const d = Math.hypot(q.x - pu.x, q.z - pu.z);
      if (m.hideNear && d < m.hideNear) continue;
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
      const prev = nearestNames.get(name);
      if (!prev || d < prev._hudNameDistance) { m._hudNameDistance = d; nearestNames.set(name, m); }
    }
    // 印が多い時（B015・B083）：いちばんの行き先と、近い三つだけ名を出す。ほかは薄い◆だけにする
    const near3 = new Set();
    if (rt.markers.length > 4) {
      const pu = rt.player.u.pos;
      const ds = [];
      for (const m of rt.markers) { const q = posOf(m); if (q && m !== main && !m.person) ds.push([Math.hypot(q.x - pu.x, q.z - pu.z), m]); }
      ds.sort((x, y) => x[0] - y[0]);
      for (let i = 0; i < Math.min(3, ds.length); i++) near3.add(ds[i][1]);
    }
    for (let i = main ? -1 : 0; i < rt.markers.length; i++) {
      const m = i < 0 ? main : rt.markers[i];
      if (i >= 0 && m === main) continue;
      const p = posOf(m);
      const name = fieldLabel(markerName(m));
      if (!name || !p || !Number.isFinite(p.x) || !Number.isFinite(p.z) || m.red || (m.group && m.group.team !== 0) || m.intelHidden || (m !== main && (m.red || m.person) && !sightRef(rt, m, p))) continue;
      if (m !== main && m.hideNear && Math.hypot(p.x - rt.player.u.pos.x, p.z - rt.player.u.pos.z) < m.hideNear) continue;
      seen.add(m.id);
      let el = this.markerEls.get(m.id);
      if (!el) { el = document.createElement('div'); el.className = 'mk' + (m.red ? ' red' : ''); $('markers').appendChild(el); this.markerEls.set(m.id, el); }
      const y = (p.y ?? rt.world.heightAt(p.x, p.z)) + (m.h ?? 3);
      const s = this.project(p, y, rt);
      const dx = p.x - rt.player.u.pos.x, dz = p.z - rt.player.u.pos.z;
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const pinned = m === main;
      let sx = s.x, sy = s.y;
      const off = pinned || s.behind || sx < 40 || sx > W - 40 || sy < 60 || sy > H - 40;
      if (off && (S.reduceGuidance || m !== main)) { el.hidden = true; continue; }
      if (pinned || s.behind) {
        // 背後でも左右を保つ。画面の真下だけでは回る向きが分からない。
        const scale = Math.min((W / 2 - 40) / Math.max(0.001, Math.abs(right)), (H / 2 - 60) / Math.max(0.001, Math.abs(forward)));
        sx = W / 2 + right * scale; sy = H / 2 - forward * scale;
      }
      sx = Math.max(40, Math.min(W - 40, sx)); sy = Math.max(60, Math.min(H - 60, sy));
      const axis = !off ? '' : sx <= 40 || sx >= W - 40 ? 'v' : 'h';
      // 隠した印も、名を書き換えて実寸を測ってから置き直す。
      el.hidden = false;
      const d = Math.hypot(p.x - rt.player.u.pos.x, p.z - rt.player.u.pos.z);
      const behind = m === main && forward < 0;
      el.style.left = sx + 'px'; el.style.top = sy + 'px';
      el.classList.toggle('edge', off);
      el.classList.toggle('near', m !== main && d < 5);
      el.classList.toggle('main', m === main);
      const nearestDuplicate = nameCounts.get(name) > 1 && nearestNames.get(name) === m;
      const dimmed = !nearestDuplicate && rt.markers.length > 4 && m !== main && !near3.has(m) && !m.person && !(m.born && performance.now() - m.born < 2200);
      const duplicate = !m.person && nearestNames.has(name) && nearestNames.get(name) !== m;
      const minor = duplicate || !!(m.minor && m !== main && !nearestDuplicate);
      el.classList.toggle('minor', minor);
      el.classList.toggle('dimmed', dimmed || minor);
      // 行き先は端の印にまとめ、照準の脇には重ねない。
      // 見えている近い行き先（40m 以内）は、世界そのものが目印になるので印を控えめに
      el.classList.toggle('quiet', m !== main && !behind && !off && d < 40 && d >= 5 && !m.red);
      el.classList.toggle('weak', !!(m.group && m.group.morale < 30 && !m.group.routed));
      if (!m.born) m.born = performance.now();
      el.classList.toggle('fresh', performance.now() - m.born < 2200);
      if (off) {
        const ang = pinned || behind ? Math.atan2(-forward, right) : Math.atan2(sy - H / 2, sx - W / 2);
        el.style.setProperty('--ang', ang + 'rad');
      }
      // 印の名は名だけ（士気は旗の傾き・揺れで見せる）。崩れかけの時だけ「崩れかけ」を添える（今が押し時と分かるように）
      const label = fieldLabel(m === main ? rt.missionGuide.label : name).replace(/・(意気盛ん|平常|動揺)$/, '');
      // 名は墨の下地の上に、距離は薄い字で分ける（霧や明るい空でも読める）。すぐそばでは距離を出さず、遠い時は言葉で
      const shownDistance = m === main ? rt.missionGuide.distance : typeof m.routeDistance === 'function' ? m.routeDistance() : d;
      const dist = m.alwaysDistance || m === main ? `${Math.round(shownDistance)}メートル` : d < 12 ? '' : d > 150 ? '遠い' : `${Math.round(d)}メートル`;
      // 最小のスマホ横：名は出たばかりの時・真ん中あたりに見ている時・敵の武将の隊（赤）だけ。距離は出さない（◆だけで行き先は分かる）
      const lean = leanHud(), look = !off && Math.abs(sx - W / 2) < W * 0.18 && Math.abs(sy - H / 2) < H * 0.3;
      // 話し相手の印（person）は、近くに来ると頭上の名札（drawOverlay）が出るので、印の名は重ねて二重に出さない
      const dupWithOverlay = m !== main && m.person && !off && d < 26;
      const showLabel = !dupWithOverlay && !dimmed && !minor && (!lean || nearestDuplicate || m === main || m.red || look || performance.now() - m.born < 2200);
      const html = off ? '' : showLabel ? `${behind ? `<strong class="behind-label">${right >= 0 ? '右' : '左'}へ振り向く</strong>` : ''}<b>${off && m === main ? '<span style="display:inline-block;transform:rotate(var(--ang));font-size:24px" aria-hidden="true">➜</span> ' : ''}${s.behind && !behind ? '↶ 後ろ・' : ''}${esc(label)}</b>${dist && (!lean || m === main) ? `<small>${dist}${m === main && rt.missionGuide.floorHint ? '・' + esc(rt.missionGuide.floorHint) : ''}</small>` : ''}` : '';
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
      el.setAttribute('aria-label', off ? `行き先：${label}` : label);
      // 名や形が変わった時だけ測る。毎コマの強制レイアウトを増やさない。
      if (el._measureHtml !== html || el._measureOff !== off || el._measureMain !== (m === main) || el._measureLean !== lean || el._measureW !== W || el._measureH !== H) {
        el._hw = Math.max(16, el.offsetWidth / 2) + 4;
        el._mh = el.offsetHeight + (off ? 20 : 4);
        el._measureHtml = html; el._measureOff = off; el._measureMain = m === main; el._measureLean = lean; el._measureW = W; el._measureH = H;
      }
      const hw = el._hw, mh = el._mh;
      // 端からの固定距離ではなく、案内・名・距離を含む実寸で収める。
      sx = Math.max(hw + 8, Math.min(W - hw - 8, sx));
      sy = Math.max(mh + 8, Math.min(H - 10, sy));
      const spot = this.avoidRects(sx, sy, W, H, axis, placed, hw, mh, true);
      // 行き先も空いた場所を探し、兵力の字へ重ねて戻さない。
      if (!spot) { el.hidden = true; continue; }
      sx = spot[0]; sy = spot[1];
      el.style.left = sx + 'px'; el.style.top = sy + 'px';
      if (off && !pinned && !behind) el.style.setProperty('--ang', Math.atan2(sy - H / 2, sx - W / 2) + 'rad');
      placed.push({ left:sx - hw, right:sx + hw, top:sy - mh, bottom:sy + 2 });

    }
    for (const [id, el] of this.markerEls) if (!seen.has(id)) { el.remove(); this.markerEls.delete(id); }
  }

  // 信貴山の夜攻めでは、姿が見えなくても実際に迫る得物の向きを示す。
  // 三枚の印と敵ごとの時刻を使い回し、一秒の避ける間を残す。
  updateThreats(rt) {
    if ((!rt.def.attackWarningDelay && !rt.def.rangedWarning) || rt.over || !rt.player.u.alive) { for (const el of this.threatEls) el.hidden = true; return; }
    if (this.threatAt > rt.t) return;
    this.threatAt = rt.t + 0.1;
    for (const el of this.threatEls) el.hidden = true;
    const p = rt.player.u, W = innerWidth, H = innerHeight;
    const sources = this.threatSources || (this.threatSources = []), distances = this.threatDistances || (this.threatDistances = []);
    sources.length = 0; distances.length = 0;
    for (const u of rt.army.units) {
      if (!u.alive || u.team === p.team || u.fleeing || u.woundOut || u.playerOpeningBlocked) continue;
      const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
      const aimed = u.target === p || u.atk?.target === p || u.swing?.target === p;
      let flying = false;
      for (const a of rt.army.arrows || []) if (a.owner === u && !a.stuck && a.life > 0) {
        const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z;
        const dot = dx * a.vel.x + dz * a.vel.z;
        const miss = Math.abs(dx * a.vel.z - dz * a.vel.x) / (Math.hypot(a.vel.x, a.vel.z) || 1);
        if (dot > 0 && miss < 3 && Math.hypot(dx, dz) < 35) { flying = true; break; }
      }
      const ranged = flying || !!(u.atk?.bow || u.atk?.ranged) || !u.sidearm && (u.type === 'bow' || u.type === 'gun') && d > 4;
      // 狭間から撃てる射線は壁の単純判定で消さない。発射前に射手側で確かめた予告を使う。
      const called = ranged && u.shotWarnUntil > rt.army.time && d < 90;
      if (!ranged && !rt.def.attackWarningDelay) continue;
      if (!called && !flying && (!aimed || d > (ranged ? 90 : 12) || rt.army.wallBetween(u.pos, -1, p.pos) || rt.army.terrainBlocks(u.pos, p.pos))) continue;
      const score = flying ? Math.min(d, 6) : d;
      let at = 0; while (at < sources.length && distances[at] <= score) at++;
      if (at >= 3) continue;
      for (let i = Math.min(2, sources.length); i > at; i--) { sources[i] = sources[i - 1]; distances[i] = distances[i - 1]; }
      sources[at] = u; distances[at] = score;
    }
    for (let n = 0; n < sources.length; n++) {
      const u = sources[n], ranged = !u.sidearm && (u.type === 'bow' || u.type === 'gun') && (u.atk?.bow || u.atk?.ranged || Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > 4);
      let el = this.threatEls[n];
      if (!el) { el = document.createElement('div'); el.className = 'threat edge'; el.style.cssText = 'transform:translate(-50%,-50%);font-size:15px;color:#ffb09a;background:#14120f;padding:4px 8px;border:2px solid #c0452e;text-align:center'; $('threats').appendChild(el); this.threatEls[n] = el; }
      if (u.attackWarnAt == null || rt.t - (u.attackWarnLast ?? -99) > 8) u.attackWarnAt = rt.t;
      u.attackWarnLast = rt.t;
      const a = Math.atan2(u.pos.x - p.pos.x, u.pos.z - p.pos.z) - rt.player.yaw;
      const direction = Math.cos(a) > 0.5 ? '前' : Math.cos(a) < -0.5 ? '後ろ' : Math.sin(a) > 0 ? '左' : '右';
      setText(el, `▲ ${direction}・${ranged ? u.type === 'bow' ? '矢' : '鉄砲' : '敵の槍・刀'}`);
      el.style.left = `${W * 0.5 - Math.sin(a) * Math.min(W * 0.35, 340)}px`;
      el.style.top = `${H * 0.5 - Math.cos(a) * Math.min(H * 0.29, 200)}px`;
      el.hidden = false;
    }
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
    // 道が二本以上ある戦：自分のいる道（いちばん近い道）を太く濃く引く（B062）
    const mapPaths = (rt.world.def.paths || []).map((p) => (Array.isArray(p) ? p : (p && p.pts) || []));   // 道は点の並びか { pts, half } の形
    let mine = -1;
    if (mapPaths.length > 1 && rt.player && rt.player.u) {
      const pp = rt.player.u.pos; let bd = 30;
      mapPaths.forEach((path, pi) => {
        for (let i = 0; i < path.length - 1; i++) {
          const [x1, z1] = path[i], [x2, z2] = path[i + 1], dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((pp.x - x1) * dx + (pp.z - z1) * dz) / l2));
          const d = Math.hypot(pp.x - (x1 + dx * t), pp.z - (z1 + dz * t));
          if (d < bd) { bd = d; mine = pi; }
        }
      });
    }
    mapPaths.forEach((path, pi) => {
      const my = pi === mine;
      g.strokeStyle = my ? 'rgba(110,70,30,.9)' : 'rgba(110,86,52,.5)'; g.lineWidth = my ? Math.max(4 * k, 3 * px) : Math.max(2 * k, 1.6 * px);
      g.beginPath(); path.forEach(([x, z], i) => { const [a, b] = tr(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
    });
    g.lineWidth = Math.max(2 * k, 1.6 * px);
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
    // 身分が上がっても、敵の位置を見通せるわけではない。
    const PU = rt.player.u.pos, sight = Math.min(weatherSight(rt.world), 170);
    const seen = (x, z, grp) => grp ? sightRef(rt, grp, grp.center()) : false;
    const far = (x, z, m = 1.5) => Math.abs(x - cx) > range * m || Math.abs(z - cz) > range * m;

    // ---- 山・砦・城の地形の読み（M4）：尾根・谷の色分け・見える範囲・火の所・分かれ道と伏兵注意（bigmap だけ）----
    {
      const H = terrainHints(rt);
      if (H && (H.ridge.length || H.valley.length)) {
        for (const [list, col] of [[H.ridge, 'rgba(168,120,40,.55)'], [H.valley, 'rgba(60,96,120,.55)']]) {
          g.fillStyle = col;
          for (const p of list) { if (far(p.x, p.z)) continue; const [a, bb] = tr(p.x, p.z); g.beginPath(); g.arc(a, bb, Math.max(1.4 * k, 1 * px), 0, Math.PI * 2); g.fill(); }
        }
      }
      if (!rotate && H) {
        // 押して開く俯瞰だけ：分かれ道（丸に十）と、伏兵に気を付ける所（三角の注意）
        g.strokeStyle = 'rgba(40,33,24,.8)'; g.lineWidth = Math.max(1.6 * k, 1 * px);
        for (const p of H.branch) { if (far(p.x, p.z)) continue; const [a, bb] = tr(p.x, p.z); const rr = 4 * k; g.beginPath(); g.arc(a, bb, rr, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(a - rr, bb); g.lineTo(a + rr, bb); g.moveTo(a, bb - rr); g.lineTo(a, bb + rr); g.stroke(); }
        g.fillStyle = 'rgba(178,51,31,.75)';
        for (const p of H.ambush) { if (far(p.x, p.z)) continue; const [a, bb] = tr(p.x, p.z); const rr = 3.6 * k; g.beginPath(); g.moveTo(a, bb - rr); g.lineTo(a + rr, bb + rr); g.lineTo(a - rr, bb + rr); g.closePath(); g.fill(); }
      }
    }
    // 見える範囲（自分の目の届く輪）：無限の時は描かない
    if (rotate && Number.isFinite(sight)) {
      const [a, bb] = tr(PU.x, PU.z);
      g.strokeStyle = 'rgba(110,86,52,.35)'; g.lineWidth = Math.max(1.2 * k, 1 * px);
      g.beginPath(); g.arc(a, bb, sight * sc, 0, Math.PI * 2); g.stroke();
    }
    // 火の所（siege_fire.js が燃やした柵・木戸・堂など）
    if (rt.army.burning && rt.army.burning.length) {
      for (const s of rt.army.burning) {
        const px = s.seg ? (s.seg[0] + s.seg[2]) / 2 : s.x, pz = s.seg ? (s.seg[1] + s.seg[3]) / 2 : s.z;
        if (px == null || far(px, pz) || !sightPoint(rt, { x: px, z: pz })) continue;
        const [a, bb] = tr(px, pz);
        g.fillStyle = '#c25a00'; g.beginPath(); g.arc(a, bb, Math.max(2.2 * k, 1.4 * px), 0, Math.PI * 2); g.fill();
      }
    }
    // ふさいだ道（退路封鎖・siege_zones.js が持てば）：道の上に×を引く
    if (rt.sz && rt.sz.blockedPaths) {
      g.strokeStyle = 'rgba(178,51,31,.8)'; g.lineWidth = Math.max(2 * k, 1.4 * px);
      for (const [x, z] of rt.sz.blockedPaths) { if (far(x, z) || !sightPoint(rt, { x, z })) continue; const [a, bb] = tr(x, z); const rr = 4 * k; g.beginPath(); g.moveTo(a - rr, bb - rr); g.lineTo(a + rr, bb + rr); g.moveTo(a + rr, bb - rr); g.lineTo(a - rr, bb + rr); g.stroke(); }
    }

    // ---- 城・砦の場（siege_zones.js の SZ）：塗り分けと形。色だけに頼らず、本丸は角、曲輪は丸、交戦中は縞 ----
    if (rt.sz && rt.sz.zones) {
      for (const z of rt.sz.zones) {
        const q = z.pos; if (!q || far(q.x, q.z, 2) || !sightRef(rt, z, q)) continue;
        const [a, bb] = tr(q.x, q.z);
        const col = z.state === 'friend' ? C.ally : z.state === 'enemy' ? C.enemy : z.state === 'contested' ? '#c2961e' : 'rgba(150,140,120,.8)';
        const R = (z.honmaru ? r0 * 2.2 : r0 * 1.5) * k;
        g.save(); g.translate(a, bb);
        if (z.honmaru) {
          g.rotate(Math.PI / 4);
          g.strokeStyle = C.ink; g.lineWidth = Math.max(4 * k, 3 * px); g.strokeRect(-R, -R, R * 2, R * 2);
          g.strokeStyle = col; g.lineWidth = Math.max(2 * k, 1.6 * px); g.strokeRect(-R, -R, R * 2, R * 2);
        } else {
          g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2);
          g.globalAlpha = z.state === 'contested' ? 0.5 : 0.3; g.fillStyle = col; g.fill(); g.globalAlpha = 1;
          g.strokeStyle = C.ink; g.lineWidth = Math.max(2.5 * k, 1.8 * px); g.stroke();
          g.strokeStyle = col; g.lineWidth = Math.max(1.4 * k, 1 * px); g.stroke();
          if (z.state === 'contested') {
            g.save(); g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.clip();
            g.strokeStyle = C.ink; g.lineWidth = Math.max(1 * k, 0.8 * px);
            for (let i = -R; i < R; i += 3 * k) { g.beginPath(); g.moveTo(i, -R); g.lineTo(i + R, R); g.stroke(); }
            g.restore();
          }
        }
        g.restore();
        if (!rotate && !tiny) {
          g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 60))}px sans-serif`;
          g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(z.name, a + R + 3, bb + 4);
          g.fillStyle = C.ink; g.fillText(z.name, a + R + 3, bb + 4);
        }
      }
    }

    // ---- 中に入れる建物（天守・櫓・主殿。naka.js）：地図に建物の形と戸口の印（B029：主殿へ着く道が地図で分かるように）----
    for (const I of NAKA.list) {
      if (I.kind === 'gate' || far(I.x, I.z, 2)) continue;
      const lv0 = I.levels[0], hw = lv0.w / 2, hd = lv0.d / 2;
      const q = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => { const [wx, wz] = I.P(lx, lz); return tr(wx, wz); });
      g.beginPath(); q.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath();
      g.globalAlpha = 0.45; g.fillStyle = I.kind === 'goten' ? '#a8824a' : '#8a7a62'; g.fill(); g.globalAlpha = 1;
      g.strokeStyle = C.ink; g.lineWidth = Math.max(1.4 * k, 1 * px); g.stroke();
      const [dx, dz] = I.P(I.door.lx, I.door.side * hd), [da, db] = tr(dx, dz);
      g.fillStyle = '#e8d29a'; g.beginPath(); g.arc(da, db, Math.max(2 * k, 1.5 * px), 0, Math.PI * 2); g.fill(); g.strokeStyle = C.ink; g.lineWidth = Math.max(0.8 * k, 0.7 * px); g.stroke();
    }
    // ---- 束32：rt.nawabari（K＝nawabari.js の makeNawabari の戻り）があれば、場の中心の丸の代わりに
    // 曲輪の形（bbox。K は頂点の poly までは持たないので矩形で近似）を持ち主で塗り分ける。
    // 色だけに頼らず、本丸は太い縁・交戦中は縞・無人は点線。門は小さな印（閉＝横棒・開＝隙間・破れ＝×）----
    if (rt.nawabari && rt.nawabari.kuruwa) {
      const K = rt.nawabari;
      for (const ku of Object.values(K.kuruwa)) {
        const b = ku._box; if (!b) continue;
        const kcx = (b.x0 + b.x1) / 2, kcz = (b.z0 + b.z1) / 2;
        if (far(kcx, kcz, 2) || !sightRef(rt, ku, { x: kcx, z: kcz })) continue;
        const isHon = ku.kind === 'hon';
        const pts = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]].map(([x, z]) => tr(x, z));
        const col = ku.captureState === CAPTURE.FRIEND ? C.ally : ku.captureState === CAPTURE.ENEMY ? C.enemy
          : ku.captureState === CAPTURE.CONTESTED ? '#c2961e' : 'rgba(150,140,120,.8)';
        g.save();
        g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath();
        g.clip();
        g.globalAlpha = ku.captureState === CAPTURE.CONTESTED ? 0.5 : ku.captureState === CAPTURE.EMPTY ? 0.14 : 0.3;
        g.fillStyle = col; g.fill(); g.globalAlpha = 1;
        if (ku.captureState === CAPTURE.CONTESTED) {
          g.strokeStyle = C.ink; g.lineWidth = Math.max(isHon ? 1.2 * k : 1 * k, 0.8 * px);
          const span = Math.max(b.x1 - b.x0, b.z1 - b.z0) * sc + 10;
          for (let i = -span; i < span; i += 3 * k) { g.beginPath(); g.moveTo(pts[0][0] + i, pts[0][1] - span); g.lineTo(pts[0][0] + i + span, pts[0][1] + span); g.stroke(); }
        }
        g.restore();
        g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath();
        g.strokeStyle = isHon ? C.ink : col;
        g.lineWidth = Math.max((isHon ? 3.2 : 1.6) * k, (isHon ? 2.2 : 1) * px);
        if (ku.captureState === CAPTURE.EMPTY) g.setLineDash([3 * k, 3 * k]);
        g.stroke();
        g.setLineDash([]);
        if (!rotate && !tiny) {
          g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 62))}px sans-serif`;
          const [lx, lz] = tr(kcx, kcz);
          g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(ku.name, lx + 4, lz + 4);
          g.fillStyle = C.ink; g.fillText(ku.name, lx + 4, lz + 4);
        }
      }
      for (const gt of Object.values(K.gates || {})) {
        if (!gt.at || far(gt.at.x, gt.at.z) || !sightRef(rt, gt, gt.at)) continue;
        const [a, bb] = tr(gt.at.x, gt.at.z);
        const rr = Math.max(3 * k, 2 * px);
        g.strokeStyle = C.ink; g.lineWidth = Math.max(2 * k, 1.4 * px);
        if (gt.state === GATE_STATE.BROKEN) { g.beginPath(); g.moveTo(a - rr, bb - rr); g.lineTo(a + rr, bb + rr); g.moveTo(a + rr, bb - rr); g.lineTo(a - rr, bb + rr); g.stroke(); }
        else if (gt.state === GATE_STATE.OPEN) { g.beginPath(); g.moveTo(a - rr, bb); g.lineTo(a - rr * 0.3, bb); g.moveTo(a + rr * 0.3, bb); g.lineTo(a + rr, bb); g.stroke(); }
        else { g.beginPath(); g.moveTo(a - rr, bb); g.lineTo(a + rr, bb); g.stroke(); }
      }
    }

    // ---- 大軍の塊：本物の兵に、軽い兵（遠景の大軍・軽い大軍の合戦）の広がりも足して、敵・味方の墨のにじみにする ----
    // 大軍も見通せる物だけ描く。
    {
      const shapes = [[], []];   // [味方, 敵] ごとに、{ pts } か { x, z, r }
      for (const u of rt.army.units) {
        if (!u.alive || u.isPlayer || u.team !== 0 || u.type === 'dummy' || u.type === 'porter' || u.fleeing) continue;
        if (!sightUnit(rt, u)) continue;
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
        if (team) continue;
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
          if (!sightRef(rt, Cl, Cl)) continue;
          const team = Sd.P.team !== undefined ? Sd.P.team : Sd === Cl.A ? 0 : 1;
          if (team) continue;
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
      if (grp.team !== 0 && !seen(c.x, c.z, grp)) continue;
      if (grp.team !== 0 || tiny) continue;
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
      if (u.team !== 0) continue;
      if (!sightUnit(rt, u)) continue;
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
    // 味方の武将：台詞・隊の札と同じ番号。地図の外なら縁の四角に番号を置く。
    // 小さい丸は一隊だけ、ほかは三隊まで。字は画面上で十二画素以上。
    if (rotate) {
      let drawn = 0;
      g.font = `${Math.ceil(12 * px)}px sans-serif`;
      const rim = Sz / 2 - 10 * px;
      for (const row of rt.allyMapRows || []) {
        if (!row.active || drawn >= (tiny ? 1 : 3) || !sightRef(rt, row, row)) continue;
        let [a, b] = tr(row.x, row.z);
        const dx = a - Sz / 2, dy = b - Sz / 2, dist = Math.hypot(dx, dy);
        if (dist > rim) { a = Sz / 2 + dx / dist * rim; b = Sz / 2 + dy / dist * rim; }
        const R = 8 * px;
        g.fillStyle = C.ally; g.fillRect(a - R, b - R, R * 2, R * 2);
        g.strokeStyle = C.ink; g.lineWidth = px; g.strokeRect(a - R, b - R, R * 2, R * 2);
        g.fillStyle = '#fff6e5'; g.textAlign = 'center'; g.fillText(String(row.number), a, b + 4 * px); g.textAlign = 'left';
        const short = row.action === '移動中' ? '進む' : row.action === '戦っている' ? '戦う' : row.action === '攻めている' ? '攻める' : row.action === '逃げている' || row.action === '退いている' ? '退く' : '待つ';
        const label = tiny ? `${row.number}${row.name.slice(-2)}${short.slice(0, 1)}` : `${row.number} ${row.name} ${short}`;
        // 読める札は丸の中央に寄せる。地図そのものを広げず、携帯の戦場を空ける。
        const width = g.measureText(label).width, lx = Math.max(2 * px, (Sz - width) / 2);
        const ly = (tiny ? Sz * 0.3 : Sz / 2 + (drawn - 1) * 14 * px) + 4 * px;
        g.strokeStyle = C.paper; g.lineWidth = 4 * px; g.strokeText(label, lx, ly);
        g.fillStyle = C.ink; g.fillText(label, lx, ly);
        drawn++;
      }
    }
    // 任務の印は兵の点より後に、墨の縁取りで。ミニマップの外の任務は縁に矢印
    for (const m of rt.markers) {
      const q = typeof m.pos === 'function' ? m.pos() : m.pos;
      if (!q || m.red || (m.group && m.group.team !== 0) || m.intelHidden || ((m.red || m.person) && !sightRef(rt, m, q))) continue;
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
        g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 50))}px sans-serif`;
        const t = typeof m.label === 'function' ? m.label() : m.label;
        g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(t, a + r0 * 2, b + 4);
        g.fillStyle = m.red ? C.enemy : C.ink; g.fillText(t, a + r0 * 2, b + 4);
      }
    }
    // 戦術マップでは部隊ごとの向きと、戦場と同じ形の隊旗（幟＝槍・弓、四角＝鉄砲、吹流し＝騎馬、大旗＝本陣）
    if (!rotate) {
      g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 62))}px sans-serif`;
      const selSet = new Set(rt.squad.length ? rt.player.selectedGroups() : []);
      const many = rt.squadGroups.filter((x) => x.count > 0).length > 1;
      const fh = r0 * 3.6;
      for (const grp of rt.army.groups) {
        if (grp.team !== 0 || !grp.count || grp.name === 'player' || grp.units.every((u) => !u.alive || u.type === 'dummy' || u.type === 'porter')) continue;
        const c = grp.center();
        // 名のある敵将の隊も、今見通せる時だけ描く。
        if (grp.team !== 0 && (!weatherSees(rt.world, PU, c) || !seen(c.x, c.z, grp))) continue;
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
        if (grp.team === 0 || (kind !== 'honjin' || (campKnown(rt) && grp.units.every((u) => !u.isOfficer || enemyKnown(rt, u))))) this.stdIcon(g, a + r0 * 1.6, b, fh, kind, col, lean);
        // 自分の組は旗の下に数の札（戦場の札と同じ色）
        if (grp.isPlayerSquad) {
          const tc = TAG_COL[tagOf(grp)];
          g.fillStyle = '#120f0b'; g.fillRect(a + r0 * 1.6 - 1, b + 2 - 1, r0 * 1.6 + 2, r0 * 1.2 + 2);
          g.fillStyle = tc; g.fillRect(a + r0 * 1.6, b + 2, r0 * 1.6, r0 * 1.2);
        }
        g.fillStyle = col;
        // 字は要る時だけ：自分の組は隊の名、敵は乱れた時だけ（意気盛ん・平常は書かない）
        const report = grp.team === 0 && rt.allyOrders && rt.allyOrders.find((r) => r.g === grp && r.active);
        const lbl = grp.isPlayerSquad ? ((rt.squadGroups.length > 1 ? GROUP_NAME[grp.kind] : '') || '自分の組') + (grp.morale < 50 ? ` ${moraleWord(grp.morale)}` : '') : grp.team !== 0 ? (grp.routed ? '潰走' : grp.morale < 50 ? moraleWord(grp.morale) : '') : report ? `${report.number} ${report.name}・${report.action}` : '';
        if (report) g.font = `${Math.ceil(12 * px)}px sans-serif`;
        if (lbl) { g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(lbl, a + r0 * 4.6, b - 4); g.fillText(lbl, a + r0 * 4.6, b - 4); }
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
        const R = Sz / 2 - Math.max(16, 10 * px);
        const nx = Sz / 2 - Math.sin(yaw) * R, ny = Sz / 2 + Math.cos(yaw) * R;
        g.font = `bold ${Math.max(Math.ceil(12 * px), Math.round(Sz / 14))}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 4; g.strokeStyle = C.paper; g.strokeText('北', nx, ny);
        g.fillStyle = '#8a2a18'; g.fillText('北', nx, ny);
        g.textAlign = 'start'; g.textBaseline = 'alphabetic';
      }
    } else {
      g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 40))}px sans-serif`;
      const northY = Math.max(26, 16 * px);
      g.textAlign = 'center';
      g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText('北 ↑', Sz / 2, northY);
      g.fillStyle = C.ink; g.fillText('北 ↑', Sz / 2, northY);
      g.textAlign = 'start';
    }
  }

  // ---- 束6（59 章）：備の札。足軽大将以上だけ、画面の隅に自分の備を一枚。隣・後詰・本陣は崩れ・危機の時だけ 6 秒 ----
  sonaeCards(rt) {
    const el = sonaeCardsRoot();
    if (rt.over || viewLevel(rt) < 2) { el.hidden = true; return; }
    const own = playerSonae(rt);
    if (!own || own.b.aliveNominal() <= 0) { el.hidden = true; return; }
    this._scAlert = this._scAlert || new Map();
    const now = rt.t || 0;
    const ALERT = new Set(['敗走', '混乱', '動揺']);
    const neigh = [own.left(), own.right(), own.behind()].filter(Boolean);
    for (const S of neigh) if (sightRef(rt, S, S.b.pos) && ALERT.has(S.state)) this._scAlert.set(S.id, now + 6);
    // 組の札がある間、平常の備は号令を開いた時だけ。危機の札は残す。
    const showOwn = $('h-squad').hidden || rt.player?.cmdOpen || ALERT.has(own.state);
    const rows = showOwn ? [sonaeCardRow(own, ALERT.has(own.state))] : [];
    for (const S of neigh) {
      const limit = innerHeight > 620 ? ($('subtitle').textContent ? 1 : $('h-squad').hidden ? 3 : 2) : 1;
      if (rows.length >= limit) break;
      if (!sightRef(rt, S, S.b.pos)) continue;
      const until = this._scAlert.get(S.id);
      if (until != null && now < until) rows.push(sonaeCardRow(S, true));
    }
    el.hidden = rows.length === 0;
    const key = rows.join('');
    if (this._scKey !== key) { this._scKey = key; el.innerHTML = rows.join(''); }
  }

  // ---- 野戦陣地の HUD（長篠・設楽原 統合版 60〜62 章）：rt.flags.hudBands（鉄砲の一手を預かる者の班の READY%）・
  //   rt.flags.hudZone（侍大将の、自分のいる区画の柵の細いゲージ）がある時だけ出す。設楽原専用でなく、同じ形を渡せばどの野戦でも出る
  yasenHud(rt) {
    const F = rt.flags;
    const el = yasenHudRoot();
    if (!F.hudBands && !F.hudZone) { el.hidden = true; return; }
    el.hidden = false;
    const rows = [];
    if (F.hudBands) for (const k of ['A', 'B', 'C']) {
      const b = F.hudBands[k];
      if (b) rows.push(`<div class="yb"><b>${k === 'A' ? '一' : k === 'B' ? '二' : '三'}班</b><span>${b.state}</span><i>${b.pct}%</i></div>`);
    }
    if (F.hudZone) {
      const z = F.hudZone;
      rows.push(`<div class="yz${z.breach ? ' warn' : ''}"><b>${esc(z.name)}防御線</b><span>馬防柵 ${z.pct}%</span><div class="bal"><i style="width:${Math.max(0, Math.min(100, z.pct))}%"></i></div>${z.breach ? '<small>柵破られる</small>' : ''}</div>`);
    }
    const key = rows.join('');
    if (this._yhKey !== key) { this._yhKey = key; el.innerHTML = rows.join(''); }
  }
}

// ---- 備の札（sonaeCards）の小さな部品。pointer-events: none＝見るだけ（押せる札にしない）----
function sonaeInjectStyle() {
  if ($('sonae-style')) return;
  const st = document.createElement('style');
  st.id = 'sonae-style';
  st.textContent = `
#sonae-cards { position: fixed; left: calc(10px + env(safe-area-inset-left, 0px)); bottom: calc(92px + env(safe-area-inset-bottom, 0px)); z-index: 12; display: flex; flex-direction: column; gap: 6px; pointer-events: none; max-width: 46vw; }
#sonae-cards[hidden], body:has(#hud.photo) #sonae-cards { display: none; }
#sonae-cards .sc { background: rgba(10,9,7,.82); border: 1px solid rgba(194,162,90,.35); color: var(--washi); font: max(13px, calc(13px * var(--text-scale, 1)))/1.4 var(--ui);
  padding: 6px 10px; min-height: 44px; display: flex; flex-direction: column; justify-content: center; }
#sonae-cards .sc b { font-weight: 700; }
#sonae-cards .sc span { color: var(--washi-dim); }
#sonae-cards .sc .bal { position: relative; height: 6px; background: rgba(0,0,0,.4); margin-top: 3px; }
#sonae-cards .sc .bal i { position: absolute; left: 0; top: 0; bottom: 0; background: #6f86a8; }
#sonae-cards .sc.warn { border-color: #c0452e; }
#sonae-cards .sc.warn .bal i { background: #c0452e; }
@media (max-width: 480px) { #sonae-cards { bottom: 78px; max-width: 70vw; } #sonae-cards .sc { font-size: 12px; } }
`;
  document.head.appendChild(st);
}
function sonaeCardsRoot() {
  let el = document.getElementById('sonae-cards');
  if (!el) { sonaeInjectStyle(); el = document.createElement('div'); el.id = 'sonae-cards'; document.body.appendChild(el); if (stackRO) stackRO.observe(el); else stackBottomLeft(); }
  return el;
}
// 左下の体力と組の札の上に、備えの札を置く。帯の数（馬・馬の息）や札の数で高さが変わるので、
// 決め打ちの高さだと重なっていた（10/5 信貴山・侍大将）。大きさが変わった時だけ測り直す
let stackRO = null;
function stackBottomLeft() {
  if (stackRO || typeof ResizeObserver === 'undefined') return;
  const place = () => {
    const bl = document.querySelector('#hud .bl'), sc = document.getElementById('sonae-cards'), sq = document.getElementById('h-squad'), sub = document.getElementById('subtitle');
    if (!bl) return;
    const H = window.innerHeight, gap = 16;
    const blr = bl.getBoundingClientRect();
    let top = blr.height ? blr.top : H;
    // 左下へ動かせる組の札は、体力と備えの札の上に積む。
    const moveSquad = sq && getComputedStyle(sq).transform === 'none' && !document.documentElement.classList.contains('tc-low');
    if (!moveSquad && sq) { sq.style.removeProperty('bottom'); sq.style.removeProperty('top'); }
    // 組の札には携帯用の位置指定がある。動かさず、その上に備えの札を置く。
    if (sq && !sq.hidden && !moveSquad) {
      const r = sq.getBoundingClientRect();
      const cr = sc?.getBoundingClientRect();
      if (r.height && r.left < (cr?.right || blr.right) + gap && r.right > (cr?.left || blr.left)) top = Math.min(top, r.top);
    }
    if (sc) {
      sc.style.setProperty('bottom', `${Math.max(0, H - top + gap)}px`, 'important');
      const r = sc.getBoundingClientRect();
      if (r.height && !sc.hidden) top = r.top;
    }
    // 下から積む時は、元の上位置を外して高さの変化に合わせる。
    if (moveSquad) {
      sq.style.top = 'auto'; sq.style.bottom = `${Math.max(0, H - top + gap) / (parseFloat(document.getElementById('hud').style.zoom) || 1)}px`;
      const r = sq.getBoundingClientRect(); if (r.height && !sq.hidden) top = r.top;
    } else {
      sq?.style.removeProperty('bottom'); sq?.style.removeProperty('top');
    }
    // 台詞が知らせの欄に入っている時は、その欄の配置を保つ。
    if (H > 620 && !document.documentElement.classList.contains('touch') && !sub?.closest('#battle-notices')) {
      if (sub) { sub.style.left = '20px'; sub.style.transform = 'none'; sub.style.width = 'min(360px, 32vw)'; sub.style.maxWidth = 'none'; sub.style.textAlign = 'left'; sub.style.bottom = `${Math.max(0, H - top + gap)}px`; }
    } else {
      if (sub) for (const prop of ['left', 'transform', 'width', 'max-width', 'text-align', 'bottom']) sub.style.removeProperty(prop);
    }
  };
  stackRO = new ResizeObserver(place);
  for (const el of [document.querySelector('#hud .bl'), document.getElementById('sonae-cards'), document.getElementById('h-squad'), document.getElementById('subtitle')]) if (el) stackRO.observe(el);
  // 携帯では名前の札の高さから組の位置が変わる。大きさが同じでも、位置の変更後に積み直す。
  let pending = false;
  const positionObserver = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; place(); });
  });
  positionObserver.observe(document.getElementById('hud'), { attributes: true, attributeFilter: ['style', 'class'] });
  window.addEventListener('resize', place);
  place();
}
function moraleWordSC(m) { return m >= 70 ? '高い' : m >= 45 ? 'ふつう' : m >= 25 ? '低い' : '崩れかけ'; }
function sonaeCardRow(S, warn) {
  const m = Math.max(0, Math.round(S.morale()));
  return `<div class="sc${warn ? ' warn' : ''}"><b>${esc(S.name)}</b><span>${S.count()}人・士気${moraleWordSC(m)}（${esc(S.state)}）</span><div class="bal"><i style="width:${Math.max(0, Math.min(100, m))}%"></i></div></div>`;
}

// ---- 野戦陣地の HUD（yasenHud）の小さな部品。見るだけ（押せる札にしない）----
function yasenHudInjectStyle() {
  if ($('yasen-style')) return;
  const st = document.createElement('style');
  st.id = 'yasen-style';
  st.textContent = `
#yasen-hud { position: fixed; right: calc(10px + env(safe-area-inset-right, 0px)); bottom: calc(92px + env(safe-area-inset-bottom, 0px)); z-index: 12; display: flex; flex-direction: column; gap: 4px; pointer-events: none; max-width: 42vw; align-items: flex-end; }
#yasen-hud[hidden], body:has(#hud.photo) #yasen-hud { display: none; }
#yasen-hud .yb, #yasen-hud .yz { background: rgba(10,9,7,.82); border: 1px solid rgba(194,162,90,.35); color: var(--washi); font: max(13px, calc(13px * var(--text-scale, 1)))/1.4 var(--ui);
  padding: 4px 10px; min-height: 22px; display: flex; align-items: center; gap: 6px; }
#yasen-hud .yb span { color: #d8b04a; }
#yasen-hud .yb i { font-style: normal; color: var(--washi-dim); }
#yasen-hud .yz { flex-direction: column; align-items: flex-end; min-height: 44px; justify-content: center; }
#yasen-hud .yz span { color: var(--washi-dim); font-size: max(13px, calc(13px * var(--text-scale, 1))); }
#yasen-hud .yz small { color: var(--shu-text); font-size: max(13px, calc(13px * var(--text-scale, 1))); }
#yasen-hud .yz .bal { position: relative; width: 100px; height: 6px; background: rgba(0,0,0,.4); margin-top: 2px; }
#yasen-hud .yz .bal i { position: absolute; left: 0; top: 0; bottom: 0; background: #6f86a8; }
#yasen-hud .yz.warn { border-color: #c0452e; }
#yasen-hud .yz.warn .bal i { background: #c0452e; }
@media (max-width: 480px) { #yasen-hud { bottom: 78px; max-width: 58vw; } #yasen-hud .yb, #yasen-hud .yz { font-size: 12px; } }
`;
  document.head.appendChild(st);
}
function yasenHudRoot() {
  let el = document.getElementById('yasen-hud');
  if (!el) { yasenHudInjectStyle(); el = document.createElement('div'); el.id = 'yasen-hud'; document.body.appendChild(el); }
  return el;
}
