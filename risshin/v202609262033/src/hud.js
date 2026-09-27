import { isTouch } from './touch.js';
import * as THREE from 'three';
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

// 札の小さな絵（線画）
const ICON = {
  spear: '<svg viewBox="0 0 24 24"><path d="M4 20 L18 6"/><path d="M18 6 L21 3 L20 7 Z" fill="#e9dcb8"/><path d="M6 16 L8 18"/></svg>',
  sword: '<svg viewBox="0 0 24 24"><path d="M5 19 L19 5"/><path d="M4 16 L8 20"/><path d="M3 21 L5 19"/></svg>',
  cmd: '<svg viewBox="0 0 24 24"><path d="M6 20 L12 10"/><path d="M12 10 C 9 6, 11 2, 15 3 C 20 4, 20 10, 15 11 C 13 11.5, 12 10, 12 10 Z"/></svg>',
  quick: '<svg viewBox="0 0 24 24"><path d="M4 12 H20"/><path d="M14 6 L20 12 L14 18"/></svg>',
  rally: '<svg viewBox="0 0 24 24"><path d="M4 10 C 8 4, 16 4, 20 8 L 18 16 C 14 13, 9 14, 6 17 Z"/><path d="M4 10 L2 12"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2 V6 M12 18 V22 M2 12 H6 M18 12 H22"/></svg>',
  dodge: '<svg viewBox="0 0 24 24"><path d="M4 16 C 8 6, 16 6, 20 12"/><path d="M17 9 L20 12 L16 13"/></svg>',
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
  #hud #tutorial.coach { top: calc(92px + env(safe-area-inset-top, 0px)); left: calc(76px + env(safe-area-inset-left, 0px)); width: 236px; padding: 7px 11px 8px; }
  #hud #tutorial.coach .what { font-size: 16px; }
  #hud #tutorial.coach .how { font-size: 13px; }
  #hud #tutorial.coach .what.sm { font-size: 14px; }
}`;
  document.head.appendChild(st);
}

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
    const allies = (rt.allyGroups || []).filter((g) => g.count > 0);
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
    if (many) cards.push({ k: 'all', html: `<button type="button" class="uc all ${p.selGroup === 'all' ? 'on' : ''}" data-sel="all" aria-pressed="${p.selGroup === 'all'}" aria-label="全隊に号令する（Alt＋0）"><b>全</b><span class="nm">全隊</span><kbd>0</kbd></button>` });
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
      const lbl = `${nm} ${n}人 士気${moraleWord(mor)} 号令${ORDER_NAME[ord] || ''}${g0.pending ? '（使番が伝えに走っている）' : ''}`;
      const inner = `<span class="face ${mor < 30 ? 'waver' : ''}" style="background-image:url(${faceCanvas(k, mon)})"></span>${ring(mor)}` +
        `<i class="ord ${g0.pending ? 'pend' : ''}" aria-hidden="true">${ORDER_MARK[ord] || '・'}</i><i class="cnt" style="background:${TAG_COL[tg]}" aria-hidden="true">${n}</i>` +
        `<span class="nm">${esc(nm)}</span>${many ? `<kbd aria-hidden="true">${i}</kbd>` : ''}`;
      cards.push({ k, html: many ? `<button type="button" class="uc own ${sel ? 'on' : ''}" data-sel="${k}" aria-pressed="${sel}" aria-label="${esc(lbl)}（Alt＋${i}）">${inner}</button>` : `<div class="uc own solo" role="img" aria-label="${esc(lbl)}">${inner}</div>` });
    }
    for (const g of allies) {
      const gen = groupGeneral(g);
      if (!gen || !gen.name) continue;   // 武将が討たれても隊が残る時がある
      const nm = gen.name.replace(/^.* /, '');
      const fighting = g.units.some((u) => u.alive && (u.target || u.atk));
      const st = g.routed ? '潰走' : g.order === 'retreat' || g.order === 'flee' ? '退く' : fighting ? '交戦' : g.order === 'move' || g.order === 'path' ? '進む' : '控え';
      const gm = (GENERALS[nm] || {}).mon || mon;
      cards.push({ k: 'a' + g.id, html: `<div class="uc ally ${fighting ? 'fight' : ''} ${g.routed || st === '退く' ? 'back' : ''}" role="img" aria-label="${esc(nm)}の隊 ${g.count}人 ${st}">` +
        `<span class="face ${g.morale < 30 ? 'waver' : ''}" style="background-image:url(${faceCanvas('honjin', gm)})"></span>${ring(g.morale)}<i class="cnt ally" aria-hidden="true">${g.count}</i>` +
        `<span class="nm">${esc(nm)}</span><span class="st">${st}</span></div>` });
    }
    const key = cards.map((c) => c.html).join('');
    if (key === this.unitsKey) return;
    this.unitsKey = key;
    el.innerHTML = key;
    el.setAttribute('aria-label', many ? '部隊（札を押すか Alt＋数字で号令先を選ぶ）' : '部隊');
    // 下の札（槍・打刀・指揮…）と重ならないよう、右の空きに収めて足りなければ上へ折り返す
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
    el.innerHTML = `<div><div class="vs">${esc(sides.a.name)}<em>VS</em>${esc(sides.b.name)}</div><div class="sub">${esc(name)}</div><div class="date">${esc(date)}</div></div>`;
    $('cine').classList.add('on');
    clearTimeout(this.introT);
    this.introT = setTimeout(() => { el.hidden = true; $('cine').classList.remove('on'); }, 3500);
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
    this.root.style.zoom = { s: 0.88, m: 1, l: 1.15 }[S.uiScale] || 1;
    document.body.classList.toggle('ca', !!S.colorAssist);
    // 動きを減らす：ゲームの設定か、OS の「視差効果を減らす」
    document.body.classList.toggle('rm', !!S.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches);
    $('fps').hidden = !S.showFps;
  }

  // 台詞の読み上げ（ブラウザの音声合成。日本語の声があるときだけ）
  speak(speaker, text) {
    if (S.voice === 'off' || !window.speechSynthesis) return;
    const major = /信長|源八|大沢|藤吉郎|義元|日比野|稲田|師範/.test(speaker || '');
    if (S.voice === 'major' && !major) return;
    if (!speaker) return;
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/[「」（）]/g, ''));
      u.lang = 'ja-JP'; u.rate = S.voiceRate; u.volume = Math.min(1, S.volume * 1.1);
      const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.startsWith('ja'));
      if (v) u.voice = v;
      u.pitch = /藤吉郎/.test(speaker) ? 1.25 : /信長/.test(speaker) ? 0.9 : /源八|大沢|師範/.test(speaker) ? 0.8 : 1;
      speechSynthesis.speak(u);
    } catch (e) { /* 読み上げできない環境 */ }
  }

  say(speaker, text, dur = 4) {
    // 長い台詞ほど長く出す
    dur = Math.max(dur, 1.2 + text.length * 0.11);
    this.subQ.push({ speaker, text, dur });
    this.log.push({ speaker, text });
    if (this.log.length > 40) this.log.shift();
    // 溜まりすぎた台詞は間を捨てる。捨てた事は字幕の下に添えて、会話の記録で読めると伝える
    if (this.subQ.length > 4) { this.subQ.splice(1, this.subQ.length - 4); this.subDrop = true; }
    if (!$('sublog').hidden) this.renderLog();
  }

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
    if (lt && lt.label === label && now - lt.t < 1500 && lt.el.isConnected) {
      lt.pts += pts; lt.n++; lt.t = now;
      lt.el.innerHTML = `<b>${lt.pts > 0 ? '+' : ''}${lt.pts}</b>${esc(label)} ×${lt.n}`;
      lt.el.style.animation = 'none'; void lt.el.offsetWidth; lt.el.style.animation = '';
      return;
    }
    const el = document.createElement('div');
    el.className = 'toast' + (pts < 0 ? ' neg' : '') + (pts === 0 ? ' title' : '');
    el.innerHTML = pts === 0 ? `<b>◆</b>${esc(label)}` : `<b>${pts > 0 ? '+' : ''}${pts}</b>${esc(label)}`;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 6) $('toasts').firstChild.remove();
    setTimeout(() => el.remove(), 2700);
    this.lastToast = { label, pts, n: 1, t: now, el };
  }

  // 大見出し（重ならないよう順番に出す）
  banner(text, sub = '') { this.bannerQ.push({ text, sub }); }

  // 画面中央の短い知らせ（受け流し・気力不足など）
  flash(text, tone = 'gold') {
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
  // 同じ知らせは 8 秒に一度まで。立て続けの知らせは、警告でないものから間引く（docs/ui-guidelines.md）
  bark(text, warn = false) {
    const now = performance.now();
    this.barkSeen = this.barkSeen || new Map();
    if (now - (this.barkSeen.get(text) || -1e9) < 8000) return;
    this.barkTimes = (this.barkTimes || []).filter((t) => now - t < 4000);
    if (!warn && this.barkTimes.length >= 3) return;
    this.barkSeen.set(text, now);
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
    this.hintTimer = setTimeout(() => { this.hintCur = null; this.drawCard(); }, 8000);
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
    el.style.borderTopWidth = Math.round(4 + Math.min(10, amount * 0.5)) + 'px';
    el.style.transform = `translate(-50%, -50%) rotate(${-angle}rad)`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  hurt(v) { this.hurtT = Math.max(this.hurtT, v); }

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
    if (!el.hidden) el.innerHTML = [['突き', '左クリック（押し続けて離すと溜め突き）'], ['構え', '右クリック（直前で受け流し）'], ['薙ぎ', '構え＋左クリック'], ['回避', K('dodge')], ['狙い', `${K('lock')}（ホイールで相手を替える）`], ['号令', `${K('follow')} ${K('hold')} ${K('attack')} ${K('retreat')}／${K('command')}長押しで輪`], ['鼓舞', K('rally')], ['地図', `${K('map')}（${K('mapzoom')}で縮尺）`], ['視点', `${K('view')}（三人称・一人称）`], ['写真', K('photo')], ['HUD', K('hud')], ['感度', '[ と ]'], ['記録', `L（会話の記録）`]].map(([a, b]) => `<div><b>${a}</b>${esc(b)}</div>`).join('');
    if (!el.hidden) el.insertAdjacentHTML('afterbegin', '<h5>操作の早見表<span><kbd class="cap">F1</kbd> で閉じる</span></h5>');
  }

  update(dt, rt) {
    const p = rt.player;
    const u = p.u;
    const G = rt.G;
    // 見出し
    this.bannerT -= dt;
    if (this.bannerT <= 0 && this.bannerQ.length) {
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
    const busy = p.inCombatT > 0 || (rt.army.threats || []).length > 0 || p.cmdOpen || p.radial;
    this.calmT = busy ? 0 : (this.calmT || 0) + dt;
    this.root.classList.toggle('calm', S.hudAutoFade && this.calmT > 6);
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
      st.hidden = rt.t < 5;
      st.textContent = A.r > 0.6 && ra < 0.4 ? '崩れかけ' : diff > 0.2 ? '優勢' : diff > 0.07 ? 'やや優勢' : diff < -0.2 ? '劣勢' : diff < -0.07 ? 'やや劣勢' : '互角';
      st.className = diff > 0.07 ? 'good' : diff < -0.07 ? 'bad' : '';
    }
    // 字幕
    if (this.subT > 0) this.subT -= dt;
    if (this.subT <= 0 && this.subQ.length) {
      const s = this.subQ.shift();
      // 話し手ごとに色を変える（上官・名のある人は金、自分は白、足軽は灰、敵は朱）
      const sc = !s.speaker ? '' : s.speaker === rt.G.name ? 'me' : /足軽|伝令/.test(s.speaker) ? 'grunt' : /斎藤|今川/.test(s.speaker) ? 'foe' : 'lord';
      $('subtitle').innerHTML = (s.speaker ? `<span class="sp ${sc}">${esc(s.speaker)}</span>` : '') + `<span class="${s.speaker ? '' : 'sys'}">${esc(s.text)}</span>` +
        (this.subDrop ? `<small class="more">台詞を一部とばしました（${isTouch ? '字幕を押すと会話の記録' : `<kbd class="cap">${esc(K('log'))}</kbd> で会話の記録`}）</small>` : '');
      if (!this.subQ.length) this.subDrop = false;
      this.speak(s.speaker, s.text);
      this.subT = s.dur;
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
    hpEl.querySelector('em').textContent = `${Math.ceil(Math.max(0, u.hp))}/${u.maxHp}`;
    // 深手（三割を切る）は数字を朱の字で太く、帯の名も「深手」に
    const deep = u.hp < u.maxHp * 0.3;
    hpEl.classList.toggle('deep', deep);
    hpEl.querySelector('span').textContent = deep ? '深手' : '体力';
    const staEl = $('h-sta');
    staEl.querySelector('b').style.width = Math.max(0, p.sta / p.maxSta * 100) + '%';
    staEl.querySelector('em').textContent = Math.floor(p.sta);
    staEl.classList.toggle('low', p.sta < 20);
    const mg = rt.squadGroups.length ? rt.squadGroups : rt.hostGroup ? [rt.hostGroup] : [];
    const mor = mg.length ? mg.reduce((a, g) => a + Math.max(0, g.morale), 0) / mg.length : 100;
    const morEl = $('h-mor');
    morEl.querySelector('b').style.width = mor + '%';
    morEl.querySelector('em').textContent = moraleWord(mor);
    morEl.classList.toggle('low', mor < 40);
    // 馬の体力と息（馬に乗れる身分から）
    const hEl = $('h-horse'), bEl = $('h-breath');
    hEl.hidden = !p.canRide; bEl.hidden = !p.canRide || !p.mounted;
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
    $('h-cap').textContent = `上限 ${cap}`;
    // 被弾
    if (this.hurtT > 0) this.hurtT -= dt;
    $('vignette').classList.toggle('hurt', this.hurtT > 0 || u.hp < u.maxHp * 0.3);
    // 照準
    const ch = $('crosshair');
    ch.dataset.style = S.crosshair;
    ch.classList.toggle('inrange', p.inRange);
    ch.classList.toggle('guard', p.guard);
    ch.classList.toggle('counter', p.counterT > 0);
    ch.classList.toggle('charge', !!p.charging);
    ch.classList.toggle('charged', p.chargeT > 0.7);
    // 近くに敵の武将がいれば、画面上部に大きく名前と体力
    const boss = $('boss');
    let bu = null, bd = 30;
    for (const o of rt.army.units) {
      if (!o.alive || o.team === 0 || o.type !== 'busho' || o.invuln) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d < bd) { bd = d; bu = o; }
    }
    if (bu) { boss.hidden = false; boss.innerHTML = `<span>${esc(bu.name || '敵武将')}</span><i><b style="width:${Math.max(0, bu.hp / bu.maxHp * 100)}%"></b></i>`; }
    else boss.hidden = true;
    // 狙っている敵
    const tg = $('target');
    const a = p.aimed;
    if (a && a.alive && (p.lock || Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) < 14)) {
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
      $('obj-list').innerHTML = rt.objectives.filter((o) => !folded.includes(o)).map((o) => {
        const tag = { main: '主', side: '副', order: '命' }[o.kind] || '';
        // 果たしたばかりの任務は印が跳ねる
        const just = o.state === 'done' && !this.doneSet.has(o.id + o.text);
        if (o.state === 'done') this.doneSet.add(o.id + o.text);
        const pr = o.progress && o.state !== 'done' ? progressRatio(o.progress) : null;
        return `<li class="${o.state === 'done' ? 'done' : o.state === 'fail' ? 'fail' : ''} ${o.kind} ${just ? 'justdone' : ''}"><span class="tag">${tag}</span>${esc(o.text)}${o.progress ? `<small>${esc(o.progress)}</small>` : ''}${pr !== null ? `<i class="opb"><b style="width:${Math.round(pr * 100)}%"></b></i>` : ''}</li>`;
      }).join('') + (folded.length ? `<li class="folded">済 ${folded.length}</li>` : '');
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
      sq.innerHTML = `<span>組<b>${alive}/${rt.squad.length}</b></span><span class="pips">${pips}</span><span>士気<b>${Math.round(mor)}</b><small>${moraleWord(mor)}</small></span><span>陣形<b>${form}</b></span>${groups}${sel}`;
    } else sq.hidden = true;
    // 指揮パネル
    const cp = $('cmdpanel');
    if (p.cmdOpen) {
      cp.hidden = false;
      const g0 = rt.squadGroups[0];
      const curOrd = g0 ? (g0.focus ? 'focus' : g0.order) : '';
      cp.innerHTML = `<h5>部隊指揮<span>${isTouch ? '指で叩いて号令' : '数字キーで号令 ・ Tab で閉じる'}</span></h5><ol>${commandList(G.rank).map((c) => `<li class="${c.id === curOrd ? 'cur' : ''}"><kbd>${c.k}</kbd>${c.label}${c.q ? `<em>${c.q}</em>` : ''}<small>${c.desc}</small></li>`).join('')}</ol>` +
        (rt.squadGroups.length > 1 ? `<div class="grp">G：号令の対象を切替　現在 <b>${GROUP_NAME[p.selGroup]}</b></div>` : '') +
        `<div class="grp">Tab を開かなくても ${K('follow')}・${K('hold')}・${K('attack')}・${K('retreat')} で「ついて来い・待て・突撃・退け」</div>` +
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
      `<div class="slot cmd ${hasSq ? '' : 'off'}"><em>${kk.cmd}</em>${ICON.cmd}指揮</div>` +
      `<div class="slot cmd ${hasSq ? '' : 'off'}"><em>${kk.quick}</em>${ICON.quick}号令</div>` +
      `<div class="slot cmd ${rallyReady ? 'ready' : 'wait'}"><em>${kk.rally}</em>${ICON.rally}${rallyReady ? (hasSq ? '鼓舞' : '鬨の声') : `<span class="why">あと${Math.ceil(p.rallyCd)}秒</span>`}${rallyReady ? '' : `<span class="cd" style="height:${Math.min(100, p.rallyCd / 25 * 100)}%"></span>`}</div>` +
      `<div class="slot cmd ${p.lock ? 'on' : ''}"><em>${kk.lock}</em>${ICON.lock}${p.lock ? '解除' : '狙い'}</div>` +
      (p.mounted ? `<div class="slot cmd ${p.breath >= 15 ? '' : 'dim'}"><em>${pad ? 'A' : K('dodge')}</em>${ICON.dodge}${p.breath >= 15 ? '手綱' : '<span class="why">息切れ</span>'}</div>` : `<div class="slot cmd ${p.sta >= 20 ? '' : 'dim'}"><em>${pad ? 'A' : K('dodge')}</em>${ICON.dodge}${p.sta >= 20 ? '回避' : '<span class="why">気力不足</span>'}</div>`) +
      (p.canRide ? `<div class="slot cmd ${p.mounted ? 'on' : ''}"><em>${K('mount')}</em>${ICON.horse || ICON.quick}${p.mounted ? '降りる' : '乗る'}</div>` : '');
    // 操作プロンプト
    const it = rt.nearestInteract();
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
    if (this.mmT <= 0) { this.mmT = 0.1; this.drawMap($('minimap'), rt, this.mmRange || 60, true); if (this.bigmap) { this.fitBigmap(rt); this.drawMap($('bigmap'), rt, this.bigRange || 170, false); } }
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
      ab.innerHTML = `<div class="side a"><div class="nm"><canvas width="44" height="44" data-m="${sides.a.mon}"></canvas>${esc(sides.a.name)}<small id="ab-a"></small></div><div class="gauge"><s id="ab-sa"></s><b id="ab-ga"></b></div></div>
        <div class="clock"><span id="ab-c"></span><small>経過</small></div>
        <div class="side b"><div class="nm"><small id="ab-b"></small>${esc(sides.b.name)}<canvas width="44" height="44" data-m="${sides.b.mon}"></canvas></div><div class="gauge"><s id="ab-sb"></s><b id="ab-gb"></b></div></div>`;
      ab.querySelectorAll('canvas[data-m]').forEach((c) => { const g = c.getContext('2d'); g.save(); g.translate(0, -8); drawMon(g, c.dataset.m, 44, 88); g.restore(); });
      $('dateline').textContent = rt.def.date ? rt.def.date(rt) : '';
      this.fitDate();
    }
    this.lastA = a; this.lastB = b;
    // 大軍の戦は、見えている兵ではなく両軍の総勢（史実の数）で見せる
    const F = rt.def.force ? rt.def.force(rt) : null;
    const fmt = (n) => `${Math.max(0, Math.round(n / 100) * 100).toLocaleString('ja-JP')}人`;
    $('ab-a').textContent = F ? fmt(F.a) : `${a}人`;
    $('ab-b').textContent = F ? fmt(F.b) : `${b}人`;
    const pa = F ? F.a / F.a0 * 100 : rt.armyInit.a ? a / rt.armyInit.a * 100 : 0;
    const pb = F ? F.b / F.b0 * 100 : rt.armyInit.b ? b / rt.armyInit.b * 100 : 0;
    $('ab-ga').style.width = pa + '%';
    $('ab-gb').style.width = pb + '%';
    this.armyPct = { a: pa, b: pb };
    $('ab-c').textContent = clock;
    if (t % 5 === 0 && rt.def.date) { const d = rt.def.date(rt); if ($('dateline').textContent !== d) { $('dateline').textContent = d; this.fitDate(); } }
  }

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
    for (const u of rt.army.units) {
      if (!u.alive || u.isPlayer || u.type === 'dummy' || u.type === 'porter' || u.invuln && !u.name) continue;
      const d = Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z);
      if (d > 26 || u.offscreen || !u.mesh.visible) continue;
      const s = this.project(u.pos, u.pos.y + (u.mounted ? 3.3 : 2.35), rt);
      if (s.behind || s.x < 0 || s.x > W || s.y < 0 || s.y > H) continue;
      // 要る時だけ出す：敵は戦っている相手・狙っている相手、味方は傷ついた者（Alt で組を全部）
      const P = rt.player;
      const fighting = u.lastHitT < 6 || (u.target && u.target.isPlayer) || u.atk || P.lock === u || P.aimed === u;
      const hurt = u.hp < u.maxHp * 0.98 && u.lastHitT < 10;
      const showBar = u.team !== 0 ? fighting : (hurt || (P.showSquad && u.isSub));
      // 組の者の名は、傷ついた時と Alt の時だけ（いつも出すと戦場が字だらけになる）
      const named = (u.type === 'samurai' || u.type === 'busho' || u.name) && d < 18 && !(u.isSub && !hurt && !P.showSquad);
      if (!showBar && !named) continue;
      const k = Math.max(0.45, Math.min(1.2, 9 / d));
      const w = 34 * k, h = Math.max(3, 4 * k);
      const x = s.x / zoom - w / 2, y = s.y / zoom;
      const col = u.team !== 0 ? (S.colorAssist ? '#ff9a1a' : '#d24a30') : u.isSub ? '#efe6cf' : (S.colorAssist ? '#4fc3f7' : '#4f7fca');
      const alpha = Math.min(1, (26 - d) / 6) * (u.lastHitT < 2 || u.team === 0 ? 1 : 0.7);
      g.globalAlpha = alpha;
      if (showBar) {
        g.fillStyle = 'rgba(0,0,0,.7)';
        g.fillRect(x - 1, y - 1, w + 2, h + 2);
        g.fillStyle = col;
        g.fillRect(x, y, w * Math.max(0, u.hp / u.maxHp), h);
      }
      if (named) {
        g.font = `${Math.round(11 * k)}px "Shippori Mincho B1", serif`;
        g.textAlign = 'center';
        g.fillStyle = 'rgba(0,0,0,.8)';
        const label = u.name || (u.type === 'busho' ? '武将' : '侍');
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

  toggleMap() {
    this.bigmap = !this.bigmap;
    if (this.bigmap) { this.bigC = null; this.bigUser = false; this.bigRange = null; }
    $('bigmap').hidden = !this.bigmap;
    const mh = $('maphint');
    mh.hidden = !this.bigmap;
    // 凡例と操作は地図の下の札に（身分でできない事は書かない）
    if (this.bigmap) {
      const lead = (this.rank || 0) >= 2 && this.hasSquad;
      mh.innerHTML = `<div class="lg"><span><i class="me">▲</i>自分</span>${this.hasSquad ? '<span><i class="sq">●</i>自分の組</span>' : ''}<span><i class="al">■</i>味方</span><span><i class="en">▲</i>敵</span><span><i class="ob">◇</i>任務</span>${lead ? '<span><i class="fl">⚑</i>組の行き先</span>' : ''}</div>` +
        // 隊旗の形は戦場の旗と同じ。自分の組の札の色は数の減り
        `<div class="lg std"><span>${STD_SVG.spear}槍・弓</span><span>${STD_SVG.gun}鉄砲</span><span>${STD_SVG.cavalry}騎馬</span><span>${STD_SVG.honjin}本陣</span>${this.hasSquad ? `<span class="tgs" aria-label="組の数の札：白は十分、黄は減った、朱は半ばより多く失った"><i style="background:${TAG_COL.ok}"></i><i style="background:${TAG_COL.mid}"></i><i style="background:${TAG_COL.low}"></i>組の数</span>` : ''}</div>` +
        `<div class="op"><span><kbd class="cap">M</kbd> 閉じる</span><span>ホイール　縮尺</span>${lead ? `<span>地図をクリック　${this.manyGroups ? '号令先の隊' : '組'}をその地点へ向かわせる</span>` : ''}${this.manyGroups ? '<span>右下の札　号令先を選ぶ</span>' : ''}</div>`;
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
    for (const g of rt.army.groups) {
      if (g.team === 0 || g.count === 0 || g.routed) continue;
      if (g.units.every((u) => !u.alive || u.type === 'dummy')) continue;
      const c = g.center();
      if (Math.hypot(c.x - pu.x, c.z - pu.z) > 120) continue;
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
    el.innerHTML = html;
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
      return `<div class="rw ${on ? 'on' : ''} ${locked ? 'locked' : ''} ${now ? 'now' : ''}" role="menuitem" aria-disabled="${locked ? 'true' : 'false'}" style="transform:translate(${x.toFixed(0)}px,${y.toFixed(0)}px)">${on ? '<span class="sel">▶</span>' : ''}${it.label}${now ? '<i class="nowm" title="いまの号令">今</i>' : ''}${qk[it.id] && !locked ? `<kbd>${esc(qk[it.id])}</kbd>` : ''}${why}</div>`;
    }).join('') +
      `<div class="rc">${p.radialSel >= 0 ? RADIAL[p.radialSel].label : (isTouch ? '指で叩いて<br>選ぶ' : 'マウスで選び<br>Tab を放す')}` +
      // 号令先の隊：札の並び（選んだ隊は金、数字キーでも選べる）
      (kinds.length > 1 ? `<div class="rg">${['all', ...kinds].map((k, i) => {
        const g = rt.squadGroups.find((x) => x.kind === k && x.count > 0);
        const sel = p.selGroup === k || (p.selGroup === 'all' && k === 'all');
        return `<span class="${sel ? 'on' : ''}">${k === 'all' ? '全隊' : KIND_WORD[k] || k}${g ? `<i style="background:${TAG_COL[tagOf(g)]}"></i>` : ''}<kbd>${i}</kbd></span>`;
      }).join('')}</div><small class="rgk">G か数字で号令先</small>` : '') + `</div>`;
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
    for (const sel of ['.tr #objectives', '#minimap', '.bl', '.tl .plaque', '.tl .next', '#toasts', '#armybar', '#h-bottom', '#h-squad', '#tutorial', '#h-units']) {
      const el = this.root.querySelector(sel);
      if (!el || el.hidden || !el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) this.rects.push(r);
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
    for (const m of rt.markers) {
      const p = typeof m.pos === 'function' ? m.pos() : m.pos;
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
      el.classList.toggle('weak', !!(m.group && m.group.morale < 30 && !m.group.routed));
      if (!m.born) m.born = performance.now();
      el.classList.toggle('fresh', performance.now() - m.born < 2200);
      if (off) {
        const ang = Math.atan2(sy - H / 2, sx - W / 2);
        el.style.setProperty('--ang', ang + 'rad');
      }
      const label = typeof m.label === 'function' ? m.label() : m.label;
      // 名は墨の下地の上に、距離は薄い字で分ける（霧や明るい空でも読める）
      const html = `<b>${esc(label)}</b><small>${Math.round(d)}m</small>`;
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
    }
    for (const [id, el] of this.markerEls) if (!seen.has(id)) { el.remove(); this.markerEls.delete(id); }
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
    g.save();
    if (rotate) { g.beginPath(); g.arc(Sz / 2, Sz / 2, Sz / 2 - 1, 0, Math.PI * 2); g.clip(); }
    g.fillStyle = 'rgba(20,18,14,.55)';
    g.fillRect(0, 0, Sz, Sz);
    g.strokeStyle = 'rgba(190,170,120,.35)'; g.lineWidth = 2 * (Sz / 340);
    for (const path of rt.world.def.paths || []) {
      g.beginPath(); path.forEach(([x, z], i) => { const [a, b] = tr(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
    }
    if (rt.world.def.water) {
      g.fillStyle = 'rgba(70,95,105,.55)';
      const Wx = rt.world.def.water.x;
      const pts = [tr(Wx, -200), tr(200, -200), tr(200, 200), tr(Wx, 200)];
      g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.fill();
    }
    const now = rt.army.time;
    for (const s of rt.army.structs) {
      if (!s.seg) continue;
      const hot = s.alive && s.hitT && now - s.hitT < 1.2;
      g.strokeStyle = !s.alive ? 'rgba(192,69,46,.9)' : hot ? '#e8a13a' : 'rgba(210,190,140,.9)';
      g.lineWidth = (hot ? 5 : 3) * (Sz / 340);
      const [a1, b1] = tr(s.seg[0], s.seg[1]), [a2, b2] = tr(s.seg[2], s.seg[3]);
      g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke();
    }
    const r0 = Math.max(3, Sz / 110);
    for (const u of rt.army.units) {
      if (!u.alive || u.isPlayer || u.type === 'dummy') continue;
      if (Math.abs(u.pos.x - cx) > range * 1.5 || Math.abs(u.pos.z - cz) > range * 1.5) continue;
      const [a, b] = tr(u.pos.x, u.pos.z);
      if (u.team !== 0) {
        // 敵は三角（色だけに頼らない）
        g.fillStyle = u.fleeing ? 'rgba(200,110,90,.45)' : S.colorAssist ? '#ff9a1a' : '#d4553b';
        g.beginPath(); g.moveTo(a, b - r0 * 0.9); g.lineTo(a + r0 * 0.8, b + r0 * 0.6); g.lineTo(a - r0 * 0.8, b + r0 * 0.6); g.closePath(); g.fill();
      } else if (u.isSub) {
        g.fillStyle = '#f1e9d6';
        g.beginPath(); g.arc(a, b, r0 * 0.7, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = u.invuln && u.name ? '#c2a25a' : S.colorAssist ? '#4fc3f7' : '#6f8fbf';
        g.fillRect(a - r0 / 2, b - r0 / 2, r0, r0);
      }
    }
    // 組を向かわせた行き先（前進の号令・地図での指図）：戦場の地面と同じ白い小旗と点線。使番が走っている間は薄く
    for (const grp of rt.squadGroups || []) {
      const pend = grp.pending && grp.pending.st.order === 'move' ? grp.pending.st : null;
      const dest = pend ? pend.dest : grp.order === 'move' ? grp.dest : null;
      if (!dest || !grp.count) continue;
      const c = grp.center();
      const [a1, b1] = tr(c.x, c.z), [a2, b2] = tr(dest.x, dest.z);
      const k = Sz / 340;
      g.save();
      g.globalAlpha = pend ? 0.6 : 1;
      g.strokeStyle = 'rgba(241,233,214,.85)'; g.lineWidth = 1.6 * k; g.setLineDash([4 * k, 5 * k]);
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
      const col = m.red ? '#e36a52' : '#c2a25a';
      const rr = Math.hypot(a - Sz / 2, b - Sz / 2), rim = Sz / 2 - r0 * 3.2;
      if (rotate && rr > rim) {
        const ang = Math.atan2(b - Sz / 2, a - Sz / 2);
        a = Sz / 2 + Math.cos(ang) * rim; b = Sz / 2 + Math.sin(ang) * rim;
        g.save(); g.translate(a, b); g.rotate(ang);
        g.beginPath(); g.moveTo(r0 * 2.4, 0); g.lineTo(-r0 * 1.2, -r0 * 1.7); g.lineTo(-r0 * 1.2, r0 * 1.7); g.closePath();
        g.fillStyle = col; g.strokeStyle = '#120f0b'; g.lineWidth = 2.5; g.stroke(); g.fill();
        g.restore();
        continue;
      }
      g.save(); g.translate(a, b); g.rotate(Math.PI / 4);
      g.strokeStyle = '#120f0b'; g.lineWidth = 5; g.strokeRect(-r0 * 1.4, -r0 * 1.4, r0 * 2.8, r0 * 2.8);
      g.strokeStyle = col; g.lineWidth = 2.5; g.strokeRect(-r0 * 1.4, -r0 * 1.4, r0 * 2.8, r0 * 2.8);
      g.restore();
      if (!rotate) {
        g.font = `${Math.round(Sz / 50)}px sans-serif`;
        const t = typeof m.label === 'function' ? m.label() : m.label;
        g.lineWidth = 3; g.strokeStyle = 'rgba(10,8,6,.9)'; g.strokeText(t, a + r0 * 2, b + 4);
        g.fillStyle = col; g.fillText(t, a + r0 * 2, b + 4);
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
        const [a, b] = tr(c.x, c.z);
        const f = grp.forward();
        const [a2, b2] = tr(c.x + f.x * 10, c.z + f.z * 10);
        const col = grp.team !== 0 ? '#e36a52' : grp.isPlayerSquad ? '#f1e9d6' : '#8fb0e0';
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
        if (lbl) { g.lineWidth = 3; g.strokeStyle = 'rgba(10,8,6,.9)'; g.strokeText(lbl, a + r0 * 4.6, b - 4); g.fillText(lbl, a + r0 * 4.6, b - 4); }
      }
    }
    const [pa, pb] = tr(p.pos.x, p.pos.z);
    g.save(); g.translate(pa, pb);
    g.rotate(rotate && !northUp ? 0 : -(p.heading - Math.PI));
    g.fillStyle = '#f1e9d6';
    g.beginPath(); g.moveTo(0, -r0 * 2.4); g.lineTo(r0 * 1.4, r0 * 1.5); g.lineTo(-r0 * 1.4, r0 * 1.5); g.closePath(); g.fill();
    g.restore();
    g.restore();
    if (rotate) {
      // 北の方角
      const R = Sz / 2 - 16;
      const nx = Sz / 2 - Math.sin(yaw) * R, ny = Sz / 2 + Math.cos(yaw) * R;
      g.fillStyle = '#c2a25a'; g.font = `bold ${Math.round(Sz / 14)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('北', nx, ny);
      g.textAlign = 'start'; g.textBaseline = 'alphabetic';
    } else {
      g.fillStyle = 'rgba(236,228,210,.75)'; g.font = `${Math.round(Sz / 40)}px sans-serif`;
      g.fillText('北 ↑', Sz / 2 - 16, 26);
    }
  }
}
