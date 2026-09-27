// 軍配の図：信長（大将）が戦場の味方の全部の隊を動かす地図（M で開く。開いている間は時がゆっくり流れる）
// ・味方の全部の隊（本物の兵の隊と、遠くの軽い大軍）を札で並べる：家紋・大将名・兵数・士気・いまの下知
// ・一つでも幾つでも選んで（ドラッグで囲む・Shift で足す・A で全部）、進め・攻めよ・待て・退け・槍衾・撃ち方
//   右クリックでも：敵の上なら「攻めよ」、何も無い所なら「進め」（Total War のように）
// ・命じた隊へは使番が走り、遠いほど遅れて動く。本物の兵の隊は g.order・g.dest、軽い大軍は world.js の follow・halt で動かし、
//   敵の軽い大軍に取り付いたら world.addClash（軽い大軍どうしの合戦）に替える
// ・見えている敵（自分や味方の隊の近く）だけを描く。全軍の兵力・士気の合計も出す
// 戦の定義の流れ（台詞・任務）は変えない。行軍中（g.order === 'path'）の隊は、着くまで下知を受けない
import * as THREE from 'three';
import { GENERALS } from './units.js';
import { ORDER_NAME } from './player.js';
import { drawMon } from './textures.js';
import { sfx } from './audio.js';
import { BATTLES } from './state.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 家紋の鍵 → 家の名
const CLAN = { oda: '織田', eiraku: '織田', tokugawa: '徳川', onri: '徳川', okubo: '徳川', okudaira: '奥平', katabami: '徳川', takeda: '武田', furin: '武田', akazonae: '武田', imagawa: '今川', saito: '斎藤', azai: '浅井', asakura: '朝倉', inaba: '稲葉', hikyaku: '延暦寺' };
// 敵の家紋（b_nagashinojo.js の見分け方に合わせる）
const ENEMY_MON = new Set(['takeda', 'akazonae', 'furin', 'imagawa', 'saito', 'azai', 'asakura', 'otani', 'ishida', 'shimazu', 'toyotomi', 'ukita', 'sanada', 'konishi', 'chosokabe', 'hikyaku']);
const FAC_MON = { oda: 'oda', tokugawa: 'tokugawa', takeda: 'takeda', akazonae: 'akazonae', imagawa: 'imagawa', saito: 'saito' };
const KIND_NAME = { spear: '槍の備', gun: '鉄砲の備', bow: '弓の備', cavalry: '騎馬の備', honjin: '本陣', mixed: '備' };
const SQUAD_NAME = { spear: '長柄', gun: '鉄砲', bow: '弓', cavalry: '馬廻・母衣衆' };
// 遠くの味方の大軍に名を付ける（その戦に居た将。本物の兵の隊の名と重ならない者から順に）
const FAR_NAMES = {
  okehazama: { oda: ['佐久間信盛', '柴田勝家', '丹羽長秀', '池田恒興', '森可成', '佐々成政'] },
  kanegasaki: { oda: ['柴田勝家', '丹羽長秀', '佐久間信盛', '森可成', '坂井政尚', '蜂屋頼隆'], tokugawa: ['徳川家康'] },
  anegawa: { oda: ['柴田勝家', '佐久間信盛', '丹羽長秀', '蜂屋頼隆', '市橋長利', '氏家直元', '安藤守就', '中川重政'], tokugawa: ['徳川家康', '榊原康政', '本多忠勝', '酒井忠次'] },
  hieizan: { oda: ['柴田勝家', '丹羽長秀', '木下秀吉', '中川重政', '蜂屋頼隆', '稲葉一鉄'] },
  shitaragahara: { oda: ['佐久間信盛', '滝川一益', '羽柴秀吉', '丹羽長秀', '柴田勝家', '織田信忠', '前田利家'], tokugawa: ['徳川家康', '石川数正', '本多忠勝', '榊原康政', '鳥居元忠', '平岩親吉'] },
  _: { oda: ['柴田勝家', '丹羽長秀', '佐久間信盛', '滝川一益', '羽柴秀吉', '池田恒興'], tokugawa: ['酒井忠次', '石川数正', '本多忠勝', '榊原康政'] },
};

const ORDERS = [
  { id: 'move', label: '進め', key: '1', note: '地図で行き先を押す' },
  { id: 'attack', label: '攻めよ', key: '2', note: '地図で敵の隊を押す' },
  { id: 'hold', label: '待て', key: '3', note: 'その場で踏みとどまる' },
  { id: 'retreat', label: '退け', key: '4', note: '敵から離れて立て直す' },
  { id: 'yari', label: '槍衾', key: '5', note: '槍を揃えて正面を固める' },
  { id: 'fire', label: '撃ち方', key: '6', note: '鉄砲・弓の射撃／やめ' },
];

const M = { open: false, b: null, el: null, cv: null, sel: new Set(), list: [], pick: null, view: null, drag: null, bg: null, bgKey: '', t: 0, hooks: {}, multi: false, focusBack: null, hover: null };

export function isGunbaiOpen() { return M.open; }
export function setGunbaiHooks(h) { M.hooks = h || {}; }

// ---------------- 隊を集める ----------------
function monOfGroup(g) {
  for (const u of g.units) {
    if (!u.alive) continue;
    const gen = u.name && GENERALS[u.name.replace(/^.* /, '')];
    if (gen && gen.mon && gen.mon !== 'none') return gen.mon;
  }
  const u = g.units.find((x) => x.alive && x.look && x.look.flag);
  return (u && u.look.flag) || FAC_MON[g.faction] || 'oda';
}
function leadOf(g) {
  const u = g.units.find((x) => x.alive && x.name && !x.isSub && (x.type === 'busho' || x.type === 'samurai' || GENERALS[x.name.replace(/^.* /, '')]));
  return u ? u.name : '';
}
function sideOfArmy(b, A) {
  if (A.team !== undefined) return A.team;
  const S = b.def.sides || {};
  A.team = S.b && A.mon === S.b.mon ? 1 : S.a && A.mon === S.a.mon ? 0 : ENEMY_MON.has(A.mon) ? 1 : 0;
  return A.team;
}
const _v = new THREE.Vector3();
function armyCenter(A) {
  A.mesh.updateMatrixWorld();
  _v.set(A.cx + A.off.x, 0, A.cz + A.off.z).applyMatrix4(A.mesh.matrixWorld);
  return { x: _v.x, z: _v.z };
}
// 軽い大軍のうち、動かしてよいもの（陣の人・控え（本物の隊の後ろに付く物）・崩れた物・見えない物は除く）
function armyOk(A) {
  if (!A || !A.mesh || A.people || A.rout || A.clashed || !A.mesh.visible) return false;
  if (!A.lordCmd && (A.followFn || A.gap || A.scripted)) return false;
  return (A.n - (A.took || 0)) > 0;
}

function collect(b) {
  const out = [];
  const P = b.player.u.pos;
  const bid = (BATTLES[b.index] && !b.def.mapCastle && BATTLES[b.index].id) || '_';
  const used = new Set();
  for (const g of b.army.groups) {
    if (!g.count || g === b.player.group) continue;
    if (!g.units.some((u) => u.alive && u.type !== 'dummy' && !u.noTarget)) continue;
    const c = g.center();
    const lead = leadOf(g);
    if (lead) used.add(lead);
    const name = g.isPlayerSquad ? `旗本・${SQUAD_NAME[g.kind] || '組'}` : g.name || (lead ? `${lead}の隊` : g.team === 0 ? '味方の隊' : '敵の隊');
    out.push({ o: g, real: true, team: g.team, x: c.x, z: c.z, n: g.count, m: Math.max(0, Math.min(100, g.morale ?? 100)), name, lead, mon: monOfGroup(g), routed: !!g.routed, order: g.order, sq: !!g.isPlayerSquad, r: Math.max(3, Math.sqrt(g.count) * 1.1) });
  }
  const names = FAR_NAMES[bid] || FAR_NAMES._;
  const idx = { oda: 0, tokugawa: 0 };
  for (const A of b.world.armies || []) {
    if (!armyOk(A)) continue;
    const team = sideOfArmy(b, A);
    const c = armyCenter(A);
    const n = A.n - (A.took || 0);
    let name = A.lordName;
    if (!name && team === 0) {
      const cl = CLAN[A.mon] === '徳川' || A.mon === 'okudaira' ? 'tokugawa' : 'oda';
      const L = names[cl] || [];
      while (idx[cl] < L.length && used.has(L[idx[cl]])) idx[cl]++;
      const nm = L[idx[cl]++];
      if (nm) used.add(nm);
      name = A.lordName = nm ? `${nm}の${A.kind === 'honjin' ? '本陣' : '備'}` : `${CLAN[A.mon] || '味方'}の${KIND_NAME[A.kind] || '備'}`;
    }
    if (!name) name = A.lord ? `${A.lord}の本陣` : `${CLAN[A.mon] || '敵'}の${KIND_NAME[A.kind] || '備'}`;
    out.push({ o: A, real: false, team, x: c.x, z: c.z, n, m: A.lordMorale ?? 100, name, lead: '', mon: A.mon || 'oda', routed: false, order: A.lordOrder || (A.tw ? 'move' : 'hold'), sq: false, r: Math.max(6, Math.sqrt(n) * 1.2), face: A.facing });
  }
  // 同じ名の隊（鉄砲組が七つなど）は、一・二…と番号を足す
  const KAN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const cnt = {};
  for (const e of out) cnt[e.team + e.name] = (cnt[e.team + e.name] || 0) + 1;
  const seenN = {};
  for (const e of out) { const k = e.team + e.name; if (cnt[k] > 1) { seenN[k] = (seenN[k] || 0) + 1; e.name = `${e.name}・${KAN[seenN[k] - 1] || seenN[k]}`; } }
  // 旗本 → 本物の兵の隊 → 遠くの備 の順
  out.sort((a, z) => (z.sq - a.sq) || (z.real - a.real));
  // 見えている敵だけ（自分・味方の隊の近く）
  const allies = out.filter((e) => e.team === 0);
  const seen = (e) => {
    if (Math.hypot(e.x - P.x, e.z - P.z) < (e.real ? 170 : (b.world.vis || 230))) return true;
    return allies.some((a) => Math.hypot(e.x - a.x, e.z - a.z) < (a.real ? 110 : 140));
  };
  return out.filter((e) => e.team === 0 || seen(e));
}

// ---------------- 開く・閉じる ----------------
export function toggleGunbai(b, on = !M.open) {
  if (on && (!b || b.over)) return false;
  if (!on) { close(); return false; }
  M.b = b; M.open = true; M.pick = null; M.drag = null; M.multi = false;
  M.sel = new Set([...M.sel].filter((o) => o && (o.count || armyOk(o))));
  M.focusBack = document.activeElement;
  build();
  M.list = collect(b);
  fitView();
  render(true);
  renderSide();
  sfx('ui');
  return true;
}
function close() {
  if (!M.open) return;
  M.open = false; M.pick = null;
  if (M.el) M.el.hidden = true;
  if (M.focusBack && M.focusBack.focus) try { M.focusBack.focus(); } catch (e) { /* 無視 */ }
  if (M.hooks.onClose) M.hooks.onClose();
}

function fitView() {
  const b = M.b, P = b.player.u.pos;
  let x0 = P.x, x1 = P.x, z0 = P.z, z1 = P.z;
  for (const e of M.list) { if (Math.hypot(e.x - P.x, e.z - P.z) > 320) continue; x0 = Math.min(x0, e.x - e.r); x1 = Math.max(x1, e.x + e.r); z0 = Math.min(z0, e.z - e.r); z1 = Math.max(z1, e.z + e.r); }
  M.view = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, half: Math.max(50, Math.min(260, Math.max(x1 - x0, z1 - z0) / 2 * 1.12 + 10)) };
}

// ---------------- 形 ----------------
function build() {
  if (!M.el) {
    injectStyle();
    const el = document.createElement('section');
    el.id = 'gunbai';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '軍配の図：味方の全部の隊を動かす');
    el.innerHTML = `<div class="gb-map"><canvas id="gb-cv" aria-label="戦場の地図。味方の隊を押して選び、下知を選ぶ"></canvas>
        <div class="gb-top" id="gb-top"></div>
        <div class="gb-pick" id="gb-pick" hidden></div>
        <div class="gb-zoom" role="group" aria-label="地図の縮尺"><button type="button" data-z="-1" aria-label="寄る">＋</button><button type="button" data-z="1" aria-label="引く">－</button><button type="button" data-z="0">全体</button></div></div>
      <aside class="gb-side">
        <header><h3>軍配</h3><button type="button" id="gb-close">閉じる<kbd>M</kbd></button></header>
        <p class="gb-slow">開いている間は、時がゆっくり流れます</p>
        <div class="gb-ord" id="gb-ord" role="group" aria-label="下知"></div>
        <div class="gb-selbar"><span id="gb-seln"></span><button type="button" id="gb-all">全部選ぶ<kbd>A</kbd></button><button type="button" id="gb-multi" aria-pressed="false">複数選ぶ</button></div>
        <ol class="gb-list" id="gb-list" aria-label="味方の隊"></ol>
        <p class="gb-help" id="gb-help"></p>
      </aside>`;
    document.body.appendChild(el);
    M.el = el; M.cv = $('gb-cv');
    // 戦の画面へ操作が抜けないように（突き・見回し）
    for (const ev of ['mousedown', 'mousemove', 'mouseup', 'wheel', 'touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'pointerup', 'contextmenu']) el.addEventListener(ev, (e) => e.stopPropagation());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    $('gb-close').onclick = () => close();
    $('gb-all').onclick = () => selectAll();
    $('gb-multi').onclick = () => { M.multi = !M.multi; renderSide(); };
    el.querySelector('.gb-zoom').addEventListener('click', (e) => { const t = e.target.closest('[data-z]'); if (!t) return; const z = +t.dataset.z; if (!z) fitView(); else M.view.half = Math.max(30, Math.min(320, M.view.half * (z > 0 ? 1.3 : 1 / 1.3))); M.bgKey = ''; render(); });
    $('gb-ord').addEventListener('click', (e) => { const t = e.target.closest('[data-ord]'); if (t && !t.disabled) orderBtn(t.dataset.ord); });
    $('gb-list').addEventListener('click', (e) => { const r = e.target.closest('[data-i]'); if (!r) return; const it = M.list[+r.dataset.i]; if (it) pickRow(it, e.shiftKey || e.ctrlKey || e.metaKey || M.multi); });
    const cv = M.cv;
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointerleave', () => { M.hover = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); M.view.half = Math.max(30, Math.min(320, M.view.half * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); M.bgKey = ''; render(); }, { passive: false });
  }
  M.el.hidden = false;
  M.bgKey = '';
  $('gb-close').focus();
}

// ---------------- 地図の座標 ----------------
// 地図の大きさ（描く度に一度だけ測る）
function measure() { const r = M.cv.getBoundingClientRect(); M.sz = { w: r.width, h: r.height, r }; return M.sz; }
function size() { return M.sz || measure(); }
function scale() { const { w, h } = size(); return Math.min(w, h) / 2 / M.view.half; }
function toScr(x, z) { const { w, h } = size(), s = scale(); return [w / 2 + (x - M.view.x) * s, h / 2 + (z - M.view.z) * s]; }
function toWorld(px, py) { const { w, h } = size(), s = scale(); return { x: M.view.x + (px - w / 2) / s, z: M.view.z + (py - h / 2) / s }; }
function hit(px, py, team) {
  let best = null, bd = Infinity;
  const s = scale();
  for (const e of M.list) {
    if (team != null && e.team !== team) continue;
    const [a, c] = toScr(e.x, e.z);
    const d = Math.hypot(a - px, c - py), R = Math.max(16, e.r * s);
    if (d < R && d < bd) { bd = d; best = e; }
  }
  return best;
}

// ---------------- 指の操作 ----------------
function local(e) { const r = measure().r; return [e.clientX - r.left, e.clientY - r.top]; }
function onDown(e) {
  if (!M.open) return;
  const [x, y] = local(e);
  if (e.button === 2) { quickOrder(x, y); return; }
  M.cv.setPointerCapture(e.pointerId);
  M.drag = { x0: x, y0: y, x, y, add: e.shiftKey || e.ctrlKey || e.metaKey || M.multi };
}
function onMove(e) {
  if (!M.open) return;
  const [x, y] = local(e);
  M.hover = hit(x, y);
  if (M.drag) { M.drag.x = x; M.drag.y = y; }
}
function onUp(e) {
  if (!M.open || !M.drag) return;
  const d = M.drag; M.drag = null;
  const [x, y] = local(e);
  // 行き先・敵を指すところ
  if (M.pick) {
    if (M.pick === 'move') { issue('move', { pt: toWorld(x, y) }); return; }
    const t = hit(x, y, 1);
    if (t) issue('attack', { tgt: t }); else flashPick('敵の隊を押してください（やめるには Esc）');
    return;
  }
  // 囲んで選ぶ
  if (Math.hypot(x - d.x0, y - d.y0) > 10) {
    const x0 = Math.min(x, d.x0), x1 = Math.max(x, d.x0), y0 = Math.min(y, d.y0), y1 = Math.max(y, d.y0);
    if (!d.add) M.sel.clear();
    for (const it of M.list) { if (it.team !== 0) continue; const [a, c] = toScr(it.x, it.z); if (a >= x0 && a <= x1 && c >= y0 && c <= y1) M.sel.add(it.o); }
    renderSide();
    return;
  }
  const t = hit(x, y, 0);
  if (t) pickRow(t, d.add);
  else if (!d.add) { M.sel.clear(); renderSide(); }
}
function pickRow(it, add) {
  if (it.team !== 0) return;
  if (add) { if (M.sel.has(it.o)) M.sel.delete(it.o); else M.sel.add(it.o); }
  else { M.sel.clear(); M.sel.add(it.o); }
  sfx('ui', 0.5);
  renderSide();
}
function selectAll() { M.sel = new Set(M.list.filter((e) => e.team === 0 && canOrder(e)).map((e) => e.o)); renderSide(); }
function quickOrder(x, y) {
  if (!M.sel.size) return;
  const t = hit(x, y, 1);
  if (t) issue('attack', { tgt: t }); else issue('move', { pt: toWorld(x, y) });
}
function flashPick(msg) { const p = $('gb-pick'); p.hidden = false; p.textContent = msg; }

// ---------------- 下知 ----------------
const canOrder = (e) => e.team === 0 && !(e.real && e.o.order === 'path');
function selected() { return M.list.filter((e) => M.sel.has(e.o) && canOrder(e)); }
function orderBtn(id) {
  const s = selected();
  if (!s.length) return;
  if (id === 'move' || id === 'attack') {
    M.pick = id;
    flashPick(id === 'move' ? '行き先を地図で押してください（右クリックでもすぐ進めます。やめるには Esc）' : '攻める敵の隊を地図で押してください（やめるには Esc）');
    renderSide();
    return;
  }
  issue(id, {});
}

function issue(id, arg) {
  const b = M.b;
  const s = selected();
  M.pick = null; $('gb-pick').hidden = true;
  if (!s.length || !b) return;
  const P = b.player.u.pos;
  const O = ORDERS.find((o) => o.id === id);
  // まとめて進める時は、隊ごとに少しずらした行き先に（一つ所に重ならないように）
  const cx = s.reduce((a, e) => a + e.x, 0) / s.length, cz = s.reduce((a, e) => a + e.z, 0) / s.length;
  for (const e of s) {
    const d = Math.hypot(e.x - P.x, e.z - P.z);
    const secs = e.sq ? 0.4 : Math.max(0.8, Math.min(10, d / 14));
    const a2 = { ...arg };
    if (id === 'move' && arg.pt && s.length > 1) a2.pt = { x: arg.pt.x + (e.x - cx) * 0.5, z: arg.pt.z + (e.z - cz) * 0.5 };
    e.o.lordPend = { t0: b.t, until: b.t + secs, ord: id, from: { x: P.x, z: P.z } };
    const o = e.o;
    b.after(secs, () => {
      if (o.lordPend && o.lordPend.t0 <= b.t) o.lordPend = null;
      if (b.over) return;
      if (e.real ? o.count : armyOk(o)) (e.real ? orderReal : orderArmy)(b, o, id, a2);
    });
  }
  b.say(b.G.name, s.length > 1 ? `皆に伝えよ。「${O.label}」じゃ` : `${s[0].name}へ伝えよ。「${O.label}」じゃ`, 2);
  if (s.some((e) => !e.sq)) b.bark(`使番が${s.length > 1 ? `${s.length}の隊` : s[0].name}へ走る`);
  sfx('taiko', 0.35);
  renderSide();
}

function nearestFoe(b, c, pred) {
  let best = null, bd = Infinity;
  for (const e of M.list.length ? M.list : collect(b)) {
    if (e.team !== 1 || (pred && !pred(e))) continue;
    const d = Math.hypot(e.x - c.x, e.z - c.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function curPos(t) { if (!t) return null; if (t.real) { if (!t.o.count || t.o.routed) return null; return t.o.center(); } return armyOk(t.o) ? armyCenter(t.o) : null; }

// 本物の兵の隊
function orderReal(b, g, id, arg) {
  const c = g.center();
  g.calm = false; g.focus = null;
  const face = (x, z) => Math.atan2(x - c.x, z - c.z);
  if (id === 'move') {
    const p = arg.pt;
    g.order = 'move'; g.dest = { x: p.x, z: p.z }; g.speed = g.speed || 3; g.facing = face(p.x, p.z);
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: p.x, z: p.z }; gg.aggro = Math.max(gg.aggro || 0, 8); };
  } else if (id === 'attack') {
    const t = arg.tgt, tp = curPos(t);
    if (!tp) { g.order = 'attack'; return; }
    if (t.real) { g.order = 'attack'; g.anchor = { x: tp.x, z: tp.z }; g.seekRange = Math.max(g.seekRange || 0, Math.min(140, Math.hypot(tp.x - c.x, tp.z - c.z) + 25)); g.facing = face(tp.x, tp.z); }
    else {
      // 軽い大軍へは、寄っていって取り付く（近づけば本物の兵に替わる）
      g.order = 'move'; g.dest = { x: tp.x, z: tp.z }; g.speed = g.speed || 3; g.facing = face(tp.x, tp.z);
      g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 45; };
    }
    g.holdFire = false;
  } else if (id === 'hold') {
    g.order = 'hold'; g.dest = null; g.anchor = { x: c.x, z: c.z };
  } else if (id === 'retreat') {
    const f = nearestFoe(b, c);
    let dx = f ? c.x - f.x : 0, dz = f ? c.z - f.z : 1;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const dest = { x: c.x + dx * 26, z: c.z + dz * 26 };
    g.order = 'move'; g.dest = dest; g.speed = Math.max(g.speed || 3, 3.2);
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { ...dest }; gg.facing = Math.atan2(-dx, -dz); };
  } else if (id === 'yari') {
    const f = nearestFoe(b, c);
    g.order = 'hold'; g.dest = null; g.anchor = { x: c.x, z: c.z }; g.formation = 'yari';
    if (f) g.facing = face(f.x, f.z);
  } else if (id === 'fire') {
    g.holdFire = !g.holdFire;
    b.bark(`${g.name || '隊'}：${g.holdFire ? '撃ち方やめ' : '放て'}`);
  }
  for (const u of g.units) u.aiT = 0;
}

// 遠くの軽い大軍（world.js の follow・halt で歩かせる）
function orderArmy(b, A, id, arg) {
  const g = A.mesh;
  const c = armyCenter(A);
  A.lordCmd = true; A.lordTgt = null;
  const walkTo = (x, z, f) => { g.halt(); g.follow(() => ({ x, z, facing: f }), { gap: 0 }); };
  if (id === 'move') { const p = arg.pt; A.lordOrder = 'move'; walkTo(p.x, p.z, Math.atan2(p.x - c.x, p.z - c.z)); }
  else if (id === 'attack') {
    A.lordOrder = 'attack'; A.lordTgt = arg.tgt;
    g.halt();
    g.follow(() => {
      const tp = curPos(A.lordTgt), me = armyCenter(A);
      if (!tp) return null;
      const f = Math.atan2(tp.x - me.x, tp.z - me.z);
      return { x: tp.x - Math.sin(f) * 7, z: tp.z - Math.cos(f) * 7, facing: f };
    }, { gap: 0 });
  } else if (id === 'hold' || id === 'yari') { A.lordOrder = 'hold'; g.halt(); g.follow(null); }
  else if (id === 'retreat') {
    const f = nearestFoe(b, c);
    let dx = f ? c.x - f.x : -Math.sin(A.facing), dz = f ? c.z - f.z : -Math.cos(A.facing);
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    A.lordOrder = 'retreat';
    walkTo(c.x + dx * 30, c.z + dz * 30, Math.atan2(-dx, -dz));
  }
}

// 味方の軽い大軍が敵の軽い大軍に取り付いたら、軽い大軍どうしの合戦にする（world.addClash）
function clashTick(b) {
  // 戦の定義が自分で歩かせている軽い大軍（道を行く本隊など）は、下知の相手にしない（史実の流れと取り合わないように）
  for (const A of b.world.armies || []) {
    const q = A.mesh && A.mesh.position;
    if (!q || A.lordCmd || A.scripted) continue;
    if (A._lp && !A.followFn && (Math.abs(A._lp.x - q.x) > 0.01 || Math.abs(A._lp.z - q.z) > 0.01)) A.scripted = true;
    A._lp = { x: q.x, z: q.z };
  }
  if (typeof b.world.addClash !== 'function') return;
  for (const A of b.world.armies || []) {
    if (!A.lordCmd || A.lordOrder !== 'attack' || !A.lordTgt || A.lordTgt.real || A.clashed || !armyOk(A)) continue;
    const E = A.lordTgt.o;
    if (!armyOk(E)) { A.lordTgt = null; continue; }
    const a = armyCenter(A), e = armyCenter(E);
    const d = Math.hypot(a.x - e.x, a.z - e.z);
    if (d > Math.max(14, Math.sqrt(E.n) * 0.9 + 8)) continue;
    const f = Math.atan2(e.x - a.x, e.z - a.z);
    try {
      const C = b.world.addClash({
        x: (a.x + e.x) / 2, z: (a.z + e.z) / 2, facing: f, w: Math.max(24, Math.min(70, Math.sqrt(A.n + E.n) * 2.2)), gap0: 6, seed: 400 + (b.world.clashes || []).length,
        A: { flag: A.mon, armor: A.armor, count: Math.min(260, A.n - (A.took || 0)) }, B: { flag: E.mon, armor: E.armor, count: Math.min(260, E.n - (E.took || 0)) },
        play: (k, p, v) => b.army.play(k, p, v), smoke: (x, y, z, fx, fz) => b.army.smoke(x, y, z, fx, fz),
      });
      A.clashed = E.clashed = true;
      A.mesh.visible = false; E.mesh.visible = false;
      if (C && C.go) C.go();
      b.bark(`${A.lordName || '味方の備'}、${CLAN[E.mon] || '敵'}の備と組み合った！`);
    } catch (err) { A.lordTgt = null; console.warn('軽い大軍の合戦を作れなかった', err); }
  }
}

// ---------------- 毎コマ ----------------
export function gunbaiFrame(b, real) {
  if (!M.open || M.b !== b) { if (b && b.lord) clashTick(b); return; }
  clashTick(b);
  if (b.over || b.game.battle !== b) { close(); return; }
  M.t -= real;
  if (M.t <= 0) { M.t = 0.25; M.list = collect(b); M.sel = new Set([...M.sel].filter((o) => M.list.some((e) => e.o === o))); renderSide(); }
  render();
}

// ---------------- 描く ----------------
function terrain(w, h) {
  const key = `${w}|${h}|${M.view.x.toFixed(1)}|${M.view.z.toFixed(1)}|${M.view.half.toFixed(1)}`;
  if (M.bgKey === key && M.bg) return M.bg;
  const b = M.b, W = b.world;
  const N = 110, cw = Math.ceil(w / N * 1.0) || 1;
  const cv = M.bg || document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = '#231f18'; g.fillRect(0, 0, w, h);
  const s = scale();
  const nx = Math.ceil(w / cw), ny = Math.ceil(h / cw);
  const hs = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const p = toWorld(i * cw, j * cw); hs[j * (nx + 1) + i] = W.heightAt(p.x, p.z); }
  const wat = W.def && W.def.water;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const hv = hs[j * (nx + 1) + i], dx = hs[j * (nx + 1) + i + 1] - hv, dz = hs[(j + 1) * (nx + 1) + i] - hv;
    const p = toWorld(i * cw, j * cw);
    const shade = Math.max(-1, Math.min(1, (-dx - dz) * 0.35 / (cw / s)));
    let r = 74 + hv * 2.6 + shade * 34, gg = 70 + hv * 2.4 + shade * 32, bb = 52 + hv * 1.6 + shade * 24;
    if (wat && p.x > wat.x) { r = 44; gg = 62; bb = 70; }
    g.fillStyle = `rgb(${r | 0},${gg | 0},${bb | 0})`;
    g.fillRect(i * cw, j * cw, cw + 1, cw + 1);
  }
  // 川と道
  for (const st of W.def.streams || []) {
    g.strokeStyle = 'rgba(96,128,138,.9)'; g.lineWidth = Math.max(2, st.w * s); g.lineJoin = 'round';
    g.beginPath(); st.pts.forEach(([x, z], i) => { const [a, c] = toScr(x, z); i ? g.lineTo(a, c) : g.moveTo(a, c); }); g.stroke();
  }
  g.strokeStyle = 'rgba(200,180,130,.35)'; g.lineWidth = Math.max(1.5, 2.5 * s);
  for (const path of W.def.paths || []) { g.beginPath(); path.forEach(([x, z], i) => { const [a, c] = toScr(x, z); i ? g.lineTo(a, c) : g.moveTo(a, c); }); g.stroke(); }
  M.bg = cv; M.bgKey = key;
  return cv;
}

const MON_IMG = {};
function monImg(k) {
  if (MON_IMG[k]) return MON_IMG[k];
  const src = document.createElement('canvas'); src.width = 48; src.height = 96;
  try { drawMon(src.getContext('2d'), k, 48, 96); } catch (e) { /* 絵の無い家紋 */ }
  const c = document.createElement('canvas'); c.width = 48; c.height = 48;
  c.getContext('2d').drawImage(src, 0, 96 * 0.32 - 24, 48, 48, 0, 0, 48, 48);
  return (MON_IMG[k] = c);
}

function render(force) {
  if (!M.open || !M.cv) return;
  const { w, h } = measure();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = M.cv;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); M.bgKey = ''; }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.drawImage(terrain(w, h), 0, 0, w, h);
  const b = M.b, s = scale();
  // 柵・塀
  g.lineWidth = 2;
  for (const st of b.army.structs) { if (!st.seg) continue; const [a1, c1] = toScr(st.seg[0], st.seg[1]), [a2, c2] = toScr(st.seg[2], st.seg[3]); g.strokeStyle = st.alive ? 'rgba(210,190,140,.85)' : 'rgba(192,69,46,.8)'; g.beginPath(); g.moveTo(a1, c1); g.lineTo(a2, c2); g.stroke(); }
  // 兵（本物の兵は一人ずつ点で）
  for (const u of b.army.units) {
    if (!u.alive || u.type === 'dummy' || u.noTarget) continue;
    if (u.team !== 0 && !M.list.some((e) => e.real && e.o === u.group)) continue;
    const [a, c] = toScr(u.pos.x, u.pos.z);
    if (a < -4 || c < -4 || a > w + 4 || c > h + 4) continue;
    g.fillStyle = u.isPlayer ? '#f3d98a' : u.team !== 0 ? (u.fleeing ? 'rgba(210,120,100,.5)' : '#d4553b') : u.isSub ? '#f1e9d6' : '#8fa6c8';
    g.fillRect(a - 1.2, c - 1.2, 2.4, 2.4);
  }
  // 軽い大軍は広がりを塗る
  for (const e of M.list) {
    if (e.real) continue;
    const [a, c] = toScr(e.x, e.z), R = e.r * s;
    g.fillStyle = e.team === 0 ? 'rgba(143,166,200,.28)' : 'rgba(212,85,59,.28)';
    g.strokeStyle = e.team === 0 ? 'rgba(143,166,200,.8)' : 'rgba(212,85,59,.8)';
    g.save(); g.translate(a, c); g.rotate(-(e.face || 0));
    g.beginPath(); g.rect(-R, -R * 0.55, R * 2, R * 1.1); g.fill(); g.stroke(); g.restore();
  }
  // 使番：走っている間は、信長から隊へ点線と走る点
  for (const e of M.list) {
    const pd = e.o.lordPend;
    if (!pd || pd.until <= b.t) continue;
    const [a1, c1] = toScr(pd.from.x, pd.from.z), [a2, c2] = toScr(e.x, e.z);
    const k = Math.min(1, (b.t - pd.t0) / Math.max(0.1, pd.until - pd.t0));
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(243,217,138,.7)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(a1, c1); g.lineTo(a2, c2); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#f3d98a'; g.beginPath(); g.arc(a1 + (a2 - a1) * k, c1 + (c2 - c1) * k, 3.5, 0, Math.PI * 2); g.fill();
  }
  // 行き先
  for (const e of M.list) {
    if (e.team !== 0) continue;
    const dst = e.real ? (e.o.order === 'move' ? e.o.dest : null) : null;
    if (!dst) continue;
    const [a1, c1] = toScr(e.x, e.z), [a2, c2] = toScr(dst.x, dst.z);
    g.strokeStyle = 'rgba(236,228,210,.55)'; g.setLineDash([6, 5]); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(a1, c1); g.lineTo(a2, c2); g.stroke(); g.setLineDash([]);
  }
  // 隊の札（家紋と兵数）
  g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const e of M.list) {
    const [a, c] = toScr(e.x, e.z);
    if (a < -40 || c < -40 || a > w + 40 || c > h + 40) continue;
    const on = M.sel.has(e.o), hv = M.hover === e;
    const bw = 44, bh = 30, x0 = a - bw / 2, y0 = c - bh - 8;
    g.fillStyle = e.team === 0 ? 'rgba(20,24,34,.88)' : 'rgba(40,14,10,.88)';
    g.fillRect(x0, y0, bw, bh);
    g.lineWidth = on ? 2.5 : 1;
    g.strokeStyle = on ? '#f3d98a' : hv ? '#ece4d2' : e.team === 0 ? 'rgba(143,166,200,.9)' : 'rgba(212,85,59,.9)';
    g.strokeRect(x0, y0, bw, bh);
    g.drawImage(monImg(e.mon), x0 + 2, y0 + 3, 18, 18);
    g.fillStyle = '#ece4d2'; g.fillText(e.n > 999 ? `${(e.n / 1000).toFixed(1)}k` : String(e.n), x0 + 32, y0 + 12);
    // 士気の帯
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x0 + 2, y0 + bh - 6, bw - 4, 4);
    g.fillStyle = e.m > 60 ? '#9fc28a' : e.m > 30 ? '#e0b44a' : '#d4553b'; g.fillRect(x0 + 2, y0 + bh - 6, (bw - 4) * e.m / 100, 4);
    // 敵は三角の印も（色だけに頼らない）
    if (e.team !== 0) { g.fillStyle = '#d4553b'; g.beginPath(); g.moveTo(a, c - 6); g.lineTo(a + 5, c + 3); g.lineTo(a - 5, c + 3); g.closePath(); g.fill(); }
    else { g.fillStyle = on ? '#f3d98a' : '#8fa6c8'; g.fillRect(a - 3.5, c - 3.5, 7, 7); }
    // 名は、指している隊と、選んだのが少ない時だけ（重なって読めなくならないように）
    if (hv || (on && M.sel.size <= 3)) { g.fillStyle = 'rgba(10,9,7,.8)'; const tw = g.measureText(e.name).width + 10; g.fillRect(a - tw / 2, y0 - 17, tw, 16); g.fillStyle = '#ece4d2'; g.fillText(e.name, a, y0 - 9); }
  }
  // 自分（信長）
  const P = b.player.u.pos, [pa, pc] = toScr(P.x, P.z);
  g.fillStyle = '#f3d98a'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(pa, pc - 8); g.lineTo(pa + 6, pc + 5); g.lineTo(pa - 6, pc + 5); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#f3d98a'; g.fillText('信長', pa, pc + 16);
  // 囲み
  if (M.drag && !M.pick && Math.hypot(M.drag.x - M.drag.x0, M.drag.y - M.drag.y0) > 10) {
    g.strokeStyle = '#f3d98a'; g.lineWidth = 1.5; g.setLineDash([5, 4]);
    g.strokeRect(Math.min(M.drag.x, M.drag.x0), Math.min(M.drag.y, M.drag.y0), Math.abs(M.drag.x - M.drag.x0), Math.abs(M.drag.y - M.drag.y0));
    g.setLineDash([]);
  }
  M.cv.style.cursor = M.pick ? 'crosshair' : M.hover ? 'pointer' : 'default';
  // 全軍の合計
  let an = 0, am = 0, en = 0, em = 0;
  for (const e of M.list) { if (e.team === 0) { an += e.n; am += e.m * e.n; } else { en += e.n; em += e.m * e.n; } }
  const top = $('gb-top');
  const html = `<span>味方 <b>${an}</b>人・士気 <b>${an ? Math.round(am / an) : 0}</b></span><span class="en">敵（見えている分） <b>${en}</b>人・士気 <b>${en ? Math.round(em / en) : 0}</b></span>`;
  if (top.innerHTML !== html) top.innerHTML = html;
  void force;
}

function renderSide() {
  if (!M.open) return;
  const b = M.b;
  const s = selected();
  const ord = $('gb-ord');
  ord.innerHTML = ORDERS.map((o) => {
    const ok = s.length && (o.id !== 'yari' || s.some((e) => e.real)) && (o.id !== 'fire' || s.some((e) => e.real && e.o.units.some((u) => u.alive && (u.type === 'gun' || u.type === 'bow'))));
    return `<button type="button" data-ord="${o.id}" ${ok ? '' : 'disabled'} class="${M.pick === o.id ? 'on' : ''}" aria-pressed="${M.pick === o.id}" title="${o.note}"><kbd>${o.key}</kbd>${o.label}</button>`;
  }).join('');
  $('gb-seln').textContent = s.length ? `${s.length}の隊を選んでいる` : '隊を選んでいない';
  const mb = $('gb-multi'); mb.setAttribute('aria-pressed', String(M.multi)); mb.classList.toggle('on', M.multi);
  const allies = M.list.map((e, i) => ({ e, i })).filter(({ e }) => e.team === 0);
  $('gb-list').innerHTML = allies.map(({ e, i }) => {
    const on = M.sel.has(e.o);
    const pd = e.o.lordPend && e.o.lordPend.until > b.t ? `使番 あと${Math.ceil(e.o.lordPend.until - b.t)}秒` : '';
    const st = e.real && e.o.order === 'path' ? '行軍中（着くまで下知できない）' : e.real ? (e.o.order === 'follow' ? 'ついて来る' : ORDER_NAME[e.o.order] || '待つ') : { move: '前進', attack: '攻める', retreat: '退く', hold: '待て' }[e.order] || '控え';
    return `<li data-i="${i}" class="${on ? 'on' : ''} ${canOrder(e) ? '' : 'off'}" aria-selected="${on}" role="option">
      <canvas width="36" height="36" data-mon="${esc(e.mon)}" aria-hidden="true"></canvas>
      <div><b>${esc(e.name)}</b>${e.lead && !e.name.includes(e.lead) ? `<small class="ld">${esc(e.lead)}</small>` : ''}
      <small>${e.n}人・士気 ${Math.round(e.m)}・${esc(st)}${e.real ? '' : '（遠くの備）'}</small>${pd ? `<small class="pd">${pd}</small>` : ''}
      <i class="mb"><i style="width:${Math.round(e.m)}%"></i></i></div></li>`;
  }).join('');
  for (const c of $('gb-list').querySelectorAll('canvas[data-mon]')) c.getContext('2d').drawImage(monImg(c.dataset.mon), 0, 0, 36, 36);
  $('gb-help').innerHTML = matchMedia('(pointer: coarse)').matches
    ? '隊を押して選ぶ（「複数選ぶ」で幾つでも）。下知を押し、進めと攻めよは地図で行き先・敵を押す。'
    : '地図の隊を押して選ぶ・ドラッグで囲む・Shift で足す。1〜6 で下知。右クリック：敵の上なら攻めよ、ほかは進め。ホイールで縮尺、矢印で動かす。';
}

// キー：開いている間はこの図が使う（M・F1・H 以外は戦へ流さない）
window.addEventListener('keydown', (e) => {
  if (!M.open) return;
  if (e.code === 'KeyM' || e.code === 'F1' || e.code === 'KeyH') return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  e.stopPropagation();
  const k = e.code;
  if (k === 'Escape') { e.preventDefault(); if (M.pick) { M.pick = null; $('gb-pick').hidden = true; renderSide(); } else close(); return; }
  if (e.repeat) return;
  const o = ORDERS.find((x) => `Digit${x.key}` === k);
  if (o) { e.preventDefault(); const bt = document.querySelector(`#gb-ord [data-ord="${o.id}"]`); if (bt && !bt.disabled) orderBtn(o.id); return; }
  if (k === 'KeyA') { e.preventDefault(); selectAll(); return; }
  const pan = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyW: [0, -1], KeyS: [0, 1] }[k];
  if (pan) { e.preventDefault(); M.view.x += pan[0] * M.view.half * 0.2; M.view.z += pan[1] * M.view.half * 0.2; M.bgKey = ''; return; }
  if (k === 'Equal' || k === 'NumpadAdd') { M.view.half = Math.max(30, M.view.half / 1.2); M.bgKey = ''; }
  if (k === 'Minus' || k === 'NumpadSubtract') { M.view.half = Math.min(320, M.view.half * 1.2); M.bgKey = ''; }
}, true);

function injectStyle() {
  if ($('gunbai-style')) return;
  const st = document.createElement('style');
  st.id = 'gunbai-style';
  st.textContent = `
#gunbai { position: fixed; inset: 0; z-index: 30; display: grid; grid-template-columns: 1fr min(360px, 42vw); background: #0e0c09; color: var(--washi); font-family: var(--ui);
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
#gunbai[hidden] { display: none; }
#gunbai .gb-map { position: relative; min-width: 0; min-height: 0; }
#gunbai canvas#gb-cv { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
#gunbai .gb-top { position: absolute; left: 12px; top: 10px; display: flex; gap: 14px; flex-wrap: wrap; padding: 6px 12px; background: rgba(10,9,7,.8); border-top: 2px solid var(--shu); font-size: 13px; }
#gunbai .gb-top b { font-family: var(--display); font-size: 16px; color: var(--washi); font-variant-numeric: tabular-nums; }
#gunbai .gb-top .en b { color: #f0a08c; }
#gunbai .gb-pick { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); padding: 8px 14px; background: rgba(10,9,7,.9); border: 1px solid var(--kin); font-size: 14px; max-width: 90%; }
#gunbai .gb-zoom { position: absolute; right: 10px; bottom: 10px; display: flex; gap: 6px; }
#gunbai button { min-height: 44px; min-width: 44px; font: 600 14px/1.1 var(--ui); color: var(--washi); background: rgba(44,40,33,.92); border: 1px solid rgba(194,162,90,.45); cursor: pointer; padding: 4px 10px; }
#gunbai button:hover:not([disabled]) { border-color: var(--kin); }
#gunbai button.on, #gunbai button[aria-pressed="true"] { background: rgba(192,69,46,.55); border-color: #f0c070; }
#gunbai button[disabled] { opacity: .4; cursor: not-allowed; }
#gunbai button:focus-visible { outline: 2px solid var(--kin); outline-offset: 2px; }
#gunbai kbd { font: 600 11px/1 var(--ui); color: var(--kin); border: 1px solid rgba(194,162,90,.5); padding: 2px 4px; margin-right: 5px; }
#gunbai .gb-side { border-left: 1px solid rgba(194,162,90,.35); padding: 10px 12px; overflow: auto; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
#gunbai .gb-side header { display: flex; justify-content: space-between; align-items: center; }
#gunbai h3 { margin: 0; font-family: var(--display); font-size: 19px; letter-spacing: .14em; color: var(--kin); }
#gunbai #gb-close kbd { margin: 0 0 0 6px; }
#gunbai .gb-slow { margin: 0; font-size: 12.5px; color: var(--washi-dim); }
#gunbai .gb-ord { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
#gunbai .gb-selbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13px; color: var(--washi-dim); }
#gunbai .gb-selbar span { flex: 1 1 100%; }
#gunbai .gb-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
#gunbai .gb-list li { display: grid; grid-template-columns: 36px 1fr; gap: 8px; align-items: center; padding: 6px 8px; border: 1px solid rgba(236,228,210,.14); border-left: 3px solid transparent; cursor: pointer; min-height: 44px; }
#gunbai .gb-list li.on { border-left-color: var(--shu); border-color: rgba(243,217,138,.7); background: rgba(192,69,46,.16); }
#gunbai .gb-list li.off { opacity: .6; }
#gunbai .gb-list b { font-size: 14px; }
#gunbai .gb-list small { display: block; font-size: 12.5px; color: var(--washi-dim); margin-top: 1px; }
#gunbai .gb-list small.ld { display: inline; margin-left: 6px; color: var(--kin); }
#gunbai .gb-list small.pd { color: #f3d98a; }
#gunbai .gb-list .mb { display: block; height: 4px; background: rgba(0,0,0,.6); margin-top: 3px; }
#gunbai .gb-list .mb i { display: block; height: 100%; background: #9fc28a; }
#gunbai .gb-help { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--washi-dim); }
@media (max-width: 700px), (max-height: 460px) { #gunbai .gb-side { padding: 6px 8px; gap: 6px; } #gunbai h3 { font-size: 16px; } #gunbai .gb-slow { display: none; } #gunbai .gb-help { display: none; } }
`;
  document.head.appendChild(st);
}
