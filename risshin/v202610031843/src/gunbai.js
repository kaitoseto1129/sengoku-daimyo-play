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
import { isVisible as visSeen } from './siege_vis.js';
import { sendOrder } from './denrei.js';
import { canonical } from './settings.js';

const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 家紋の鍵 → 家の名
const CLAN = { oda: '織田', eiraku: '織田', tokugawa: '徳川', onri: '徳川', okubo: '徳川', okudaira: '奥平', katabami: '徳川', takeda: '武田', furin: '武田', akazonae: '武田', imagawa: '今川', saito: '斎藤', azai: '浅井', asakura: '朝倉', inaba: '稲葉', hikyaku: '延暦寺' };
// 敵の家紋（b_nagashinojo.js の見分け方に合わせる）
const ENEMY_MON = new Set(['takeda', 'akazonae', 'furin', 'imagawa', 'saito', 'azai', 'asakura', 'otani', 'ishida', 'shimazu', 'toyotomi', 'ukita', 'sanada', 'konishi', 'chosokabe', 'hikyaku', 'maru', 'namu', 'yatagarasu', 'sagarifuji', 'miyoshi', 'rokkaku', 'uesugi', 'mori']);
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

// 下知の釦（字は二字まで。絵でも分かるように）
export const ORDERS = [
  { id: 'move', label: '進め', key: '1', note: '地図で行き先を押す', ic: '<path d="M4 12h13M12 6l6 6-6 6"/>' },
  { id: 'attack', label: '攻めよ', key: '2', note: '地図で敵の隊を押す', ic: '<path d="M5 19 18 6M15 5l4-1-1 4M19 19 6 6M9 5 5 4l1 4"/>' },
  { id: 'hold', label: '待て', key: '3', note: 'その場で踏みとどまる', ic: '<path d="M7 21V4M7 5h10l-3 4 3 4H7"/>' },
  { id: 'retreat', label: '退け', key: '4', note: '敵から離れて立て直す', ic: '<path d="M20 12H7M12 6l-6 6 6 6"/>' },
  { id: 'form', label: '構え', key: '5', note: '陣形を選ぶ', ic: '<rect x="4" y="5" width="4" height="4"/><rect x="10" y="5" width="4" height="4"/><rect x="16" y="5" width="4" height="4"/><rect x="4" y="13" width="4" height="4"/><rect x="10" y="13" width="4" height="4"/><rect x="16" y="13" width="4" height="4"/>' },
  { id: 'fire', label: '撃て', key: '6', note: '鉄砲・弓の射撃／やめ', ic: '<circle cx="12" cy="12" r="3"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>' },
  // 束6（61 章：備単位命令）。備（sonae.js）を持つ隊だけに効く：どれも sendOrder（使番）→ sonae.order（侍大将の有無でさらに遅れる）
  { id: 'charge', label: '突撃', key: '7', note: '構わず敵へ攻め込む', ic: '<path d="M4 20 18 6M13 5l6-1-1 6"/>' },
  { id: 'defend', label: '防御', key: '8', note: '槍を揃えてその場を固める', ic: '<path d="M4 16h16M6 16l2.5-9M11 16l1-9M16 16l2.5-9"/>' },
  { id: 'rally', label: '集結', key: '9', note: '大将の元へ集まれ', ic: '<circle cx="12" cy="12" r="3"/><path d="M4 4l4 4M20 4l-4 4M4 20l4-4M20 20l-4-4"/>' },
  { id: 'flank', label: '側面を突け', key: '0', note: '敵の脇を突く', ic: '<path d="M4 6h16M4 18h16M15 10l5 2-5 2"/>' },
  { id: 'support', label: '援護', key: '', note: '隣の備を助けに寄る', ic: '<path d="M12 21s-7-4.35-9-9A5 5 0 0 1 12 6a5 5 0 0 1 9 6c-2 4.65-9 9-9 9z"/>' },
  { id: 'reserve', label: '予備に控え', key: '', note: '下がって後に備える', ic: '<rect x="5" y="10" width="14" height="9"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>' },
];
const SONAE_ORDERS = new Set(['charge', 'defend', 'rally', 'flank', 'support', 'reserve']);
// 構え（陣形）。本物の兵の隊だけが組み替えられる
export const FORMS = [
  { f: 'line', label: '横隊', note: '横に広く並ぶ。ふだんの形', ic: '<path d="M3 10h18M3 14h18"/>' },
  { f: 'dense', label: '密集', note: '固まって進む。門を破る勢いが強いが、矢玉に弱い', ic: '<rect x="5" y="5" width="6" height="6"/><rect x="13" y="5" width="6" height="6"/><rect x="5" y="13" width="6" height="6"/><rect x="13" y="13" width="6" height="6"/>' },
  { f: 'yari', label: '槍衾', note: '槍を揃えて正面を固める。騎馬に強い', ic: '<path d="M3 16h18M5 16l3-10M10 16l3-10M15 16l3-10"/>' },
  { f: 'column', label: '縦隊', note: '細長く並ぶ。速く動ける', ic: '<path d="M10 3v18M14 3v18"/>' },
  { f: 'loose', label: '散開', note: 'ばらけて立つ。矢玉が当たりにくい', ic: '<circle cx="6" cy="7" r="1.6"/><circle cx="14" cy="5" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="9" cy="14" r="1.6"/><circle cx="16" cy="19" r="1.6"/><circle cx="5" cy="19" r="1.6"/>' },
  { f: 'ring', label: '円陣', note: '輪になって四方を守る。囲まれた時に', ic: '<circle cx="12" cy="12" r="7"/>' },
];
export const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
// いまの下知を一字で（隊の札の角に出す）
const ORD_CHAR = { move: '進', attack: '攻', hold: '待', retreat: '退', follow: '従', path: '行', yari: '衾', charge: '攻' };

const M = { own: false, ptrs: new Map(), open: false, b: null, el: null, cv: null, sel: new Set(), list: [], pick: null, view: null, drag: null, bg: null, bgKey: '', t: 0, hooks: {}, multi: false, focusBack: null, hover: null, formOpen: false, sideKey: '', cardKey: '' };

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

export function collect(b) {
  const out = [];
  const P = b.player.u.pos;
  const bid = (BATTLES[b.index] && !b.def.mapCastle && BATTLES[b.index].id) || '_';
  const used = new Set();
  for (const g of b.army.groups) {
    if (!g.count || g === b.player.group || g.isRunner) continue;
    // 足軽大将の小さな軍配：味方は自分の組と預かった隊（g.entrusted）だけ
    if (M.own && g.team === 0 && !g.isPlayerSquad && !g.entrusted) continue;
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
    if (M.own && team === 0) continue;
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
  // 砦・城の戦（b.flags.fow）だけ：物見の届かない敵（地形の陰・森の奥）はここでも隠す（siege_vis.js F7）
  const fow = b.flags && b.flags.fow;
  const seen = (e) => {
    if (fow && !visSeen(b, e.o)) return false;
    if (Math.hypot(e.x - P.x, e.z - P.z) < (e.real ? 170 : (b.world.vis || 230))) return true;
    return allies.some((a) => Math.hypot(e.x - a.x, e.z - a.z) < (a.real ? 110 : 140));
  };
  return out.filter((e) => e.team === 0 || seen(e));
}

// ---------------- 開く・閉じる ----------------
export function toggleGunbai(b, on = !M.open) {
  if (on && (!b || b.over)) return false;
  if (!on) { close(); return false; }
  M.b = b; M.open = true; M.pick = null; M.drag = null; M.multi = false; M.ptrs.clear();
  document.getElementById('hud')?.classList.add('gb-open');
  // 信長で遊ぶ時は全軍、足軽大将などは自分の組と預かった隊だけの小さな軍配
  M.own = !b.lord;
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
  document.getElementById('hud')?.classList.remove('gb-open');
  if (M.el) M.el.hidden = true;
  if (M.focusBack && M.focusBack.focus) try { M.focusBack.focus({ preventScroll: true }); } catch (e) { /* 無視 */ }
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
    el.setAttribute('aria-label', '軍配の図：味方の隊を動かす');
    // 上：戦場の絵地図（全部）。下：隊の札の帯と、下知の釦（Total War のように）
    el.innerHTML = `<div class="gb-map"><canvas id="gb-cv" aria-label="戦場の地図。味方の隊を押して選び、地図を押して進ませる"></canvas>
        <button type="button" class="topback" id="gb-close" aria-label="戻る（M）"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>戻る</button>
        <div class="gb-top" id="gb-top" role="status"></div>
        <div class="gb-pick" id="gb-pick" role="status" aria-live="polite"></div>
        <div class="gb-zoom" role="group" aria-label="地図の縮尺"><button type="button" data-z="-1" aria-label="寄る">寄る</button><button type="button" data-z="1" aria-label="引く">引く</button><button type="button" data-z="0" aria-label="全体を見る">全体</button></div></div>
      <div class="gb-dock">
        <div class="gb-forms" id="gb-forms" role="group" aria-label="構え（陣形）" hidden></div>
        <div class="gb-ord" id="gb-ord" role="group" aria-label="下知"></div>
        <div class="gb-row"><div class="gb-sel"><button type="button" id="gb-all" aria-label="味方を全部選ぶ（A）">全軍</button><button type="button" id="gb-multi" aria-pressed="false" aria-label="押した隊を足していく">複数</button></div>
        <div class="gb-cards" id="gb-list" role="listbox" aria-label="味方の隊" aria-multiselectable="true"></div></div>
      </div>`;
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
    $('gb-forms').addEventListener('click', (e) => { const t = e.target.closest('[data-form]'); if (t && !t.disabled) { M.formOpen = false; issue('form', { f: t.dataset.form }); } });
    $('gb-list').addEventListener('click', (e) => { const r = e.target.closest('[data-i]'); if (!r) return; const it = M.list[+r.dataset.i]; if (it) pickRow(it, e.shiftKey || e.ctrlKey || e.metaKey || M.multi); });
    // 札を二度押すと、その隊へ地図を寄せる
    $('gb-list').addEventListener('dblclick', (e) => { const r = e.target.closest('[data-i]'); const it = r && M.list[+r.dataset.i]; if (it) { M.view.x = it.x; M.view.z = it.z; M.bgKey = ''; } });
    const cv = M.cv;
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerleave', () => { M.hover = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); M.view.half = Math.max(30, Math.min(320, M.view.half * (e.deltaY > 0 ? 1.12 : 1 / 1.12))); M.bgKey = ''; render(); }, { passive: false });
  }
  M.el.hidden = false;
  M.bgKey = ''; M.sideKey = ''; M.cardKey = ''; M.formOpen = false; M.sz = null;
  $('gb-close').focus({ preventScroll: true });
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
  // 先に札（描いた四角）の上か見る。札は点の上にずらして描くので、札を押せば選べるように
  for (const e of M.list) {
    if (team != null && e.team !== team) continue;
    const q = e.bx;
    if (q && px >= q[0] - 2 && px <= q[0] + q[2] + 2 && py >= q[1] - 2 && py <= q[1] + q[3] + 2) return e;
  }
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
  M.ptrs.set(e.pointerId, { x, y });
  // 二本指：地図を動かす・縮尺（並べ・囲みはやめる）
  if (M.ptrs.size === 2) { M.drag = null; M.pinch = pinchState(); return; }
  if (M.ptrs.size > 2) return;
  const add = e.shiftKey || e.ctrlKey || e.metaKey || M.multi;
  // 何も選んでいない指の一本は地図を動かす。隊を選んでいて何も無い所から引くと、そこへ並べる（引いた線が正面の幅と向き）
  const onAlly = hit(x, y, 0);
  let mode = 'box';
  if (!M.pick && M.sel.size && !add && !onAlly && !hit(x, y, 1)) mode = 'line';
  else if (!M.pick && !onAlly && e.pointerType === 'touch' && !add) mode = 'pan';
  M.drag = { x0: x, y0: y, x, y, add, mode, vx: M.view.x, vz: M.view.z };
}
function pinchState() {
  const [a, c] = [...M.ptrs.values()];
  return { d: Math.hypot(a.x - c.x, a.y - c.y) || 1, mx: (a.x + c.x) / 2, my: (a.y + c.y) / 2, half: M.view.half, vx: M.view.x, vz: M.view.z };
}
function onMove(e) {
  if (!M.open) return;
  const [x, y] = local(e);
  if (M.ptrs.has(e.pointerId)) M.ptrs.set(e.pointerId, { x, y });
  if (M.pinch && M.ptrs.size >= 2) {
    const P = M.pinch, [a, c] = [...M.ptrs.values()];
    const d = Math.hypot(a.x - c.x, a.y - c.y) || 1;
    M.view.half = Math.max(30, Math.min(320, P.half * P.d / d));
    const s = scale();
    M.view.x = P.vx - ((a.x + c.x) / 2 - P.mx) / s; M.view.z = P.vz - ((a.y + c.y) / 2 - P.my) / s;
    M.bgKey = '';
    return;
  }
  M.hover = hit(x, y);
  if (M.drag) {
    M.drag.x = x; M.drag.y = y;
    if (M.drag.mode === 'pan') { const s = scale(); M.view.x = M.drag.vx - (x - M.drag.x0) / s; M.view.z = M.drag.vz - (y - M.drag.y0) / s; M.bgKey = ''; }
  }
}
function onUp(e) {
  if (!M.open) return;
  M.ptrs.delete(e.pointerId);
  if (M.pinch) { if (M.ptrs.size < 2) M.pinch = null; M.drag = null; return; }
  if (!M.drag) return;
  const d = M.drag; M.drag = null;
  const [x, y] = local(e);
  const far = Math.hypot(x - d.x0, y - d.y0) > 10;
  if (d.mode === 'pan' && far) return;
  // 行き先・敵を指すところ
  if (M.pick) {
    if (M.pick === 'move') { issue('move', { pt: toWorld(x, y) }); return; }
    const t = hit(x, y, 1);
    if (t) issue('attack', { tgt: t }); else flashPick('敵の隊を押す（やめるには戻るキー）');
    return;
  }
  // 引いて並べる：引いた線の真ん中へ進み、線の幅に広がり、線に直角の向き（敵のいる側）を正面にする
  if (d.mode === 'line' && Math.hypot(x - d.x0, y - d.y0) > 18) {
    const a = toWorld(d.x0, d.y0), c = toWorld(x, y);
    issue('move', lineArg(a, c));
    return;
  }
  // 囲んで選ぶ
  if (d.mode === 'box' && far) {
    const x0 = Math.min(x, d.x0), x1 = Math.max(x, d.x0), y0 = Math.min(y, d.y0), y1 = Math.max(y, d.y0);
    if (!d.add) M.sel.clear();
    for (const it of M.list) { if (it.team !== 0) continue; const [a, c] = toScr(it.x, it.z); if (a >= x0 && a <= x1 && c >= y0 && c <= y1) M.sel.add(it.o); }
    renderSide();
    return;
  }
  // 押しただけ：味方の隊なら選ぶ（選んでいる一つを押し直すと外す）。隊を選んでいれば、敵を押すと「攻めよ」、何も無い所なら「進め」（二手で下知）
  const t = hit(x, y, 0);
  if (t) { if (!d.add && M.sel.size === 1 && M.sel.has(t.o)) { M.sel.clear(); sfx('ui', 0.4); renderSide(); } else pickRow(t, d.add); return; }
  if (M.sel.size && !d.add) { quickOrder(x, y); return; }
}
// 引いた線から、行き先（真ん中）・正面の向き・幅を出す
function lineArg(a, c) {
  const mid = { x: (a.x + c.x) / 2, z: (a.z + c.z) / 2 };
  const dx = c.x - a.x, dz = c.z - a.z, L = Math.hypot(dx, dz) || 1;
  // 線に直角の二つの向きのうち、近い敵のいる側（敵がいなければ、選んだ隊から見て先の側）
  let nx = dz / L, nz = -dx / L;
  const f = nearestFoe(M.b, mid);
  const s = selected();
  const ref = f ? { x: f.x - mid.x, z: f.z - mid.z } : s.length ? { x: mid.x - s.reduce((q, e) => q + e.x, 0) / s.length, z: mid.z - s.reduce((q, e) => q + e.z, 0) / s.length } : { x: nx, z: nz };
  if (nx * ref.x + nz * ref.z < 0) { nx = -nx; nz = -nz; }
  return { pt: mid, face: Math.atan2(nx, nz), w: Math.max(6, L), ax: dx / L, az: dz / L };
}
function pickRow(it, add) {
  if (it.team !== 0) return;
  if (add) { if (M.sel.has(it.o)) M.sel.delete(it.o); else M.sel.add(it.o); }
  else { M.sel.clear(); M.sel.add(it.o); }
  sfx('ui', 0.5);
  renderSide();
  // 地図で選んだ隊の札が、下の帯の外にあれば見える所まで寄せる
  const c = document.querySelector(`#gb-list [data-i="${M.list.indexOf(it)}"]`);
  if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function selectAll() { M.sel = new Set(M.list.filter((e) => e.team === 0 && canOrder(e)).map((e) => e.o)); renderSide(); }
function quickOrder(x, y) {
  if (!M.sel.size) return;
  const t = hit(x, y, 1);
  if (t) issue('attack', { tgt: t }); else issue('move', { pt: toWorld(x, y) });
}
// 携帯の横向き（低い画面）では、案内を短い一言にする
function flashPick(msg) { M.pickMsg = msg; guide(); }
// 画面の下の一言：いま何をすればよいか（一度に一つ）
function guide() {
  const p = $('gb-pick'); if (!p) return;
  const touch = matchMedia('(pointer: coarse)').matches;
  const n = selected().length;
  const t = M.pickMsg || (M.pick === 'move' ? '行き先を押す' : M.pick === 'attack' ? '敵の隊を押す' : M.formOpen ? '構えを選ぶ'
    : n ? '地図を押して進む・敵を押して攻める' : (touch ? '隊を押して選ぶ' : '隊を押すか、囲んで選ぶ'));
  M.pickMsg = null;
  if (p.textContent !== t) p.textContent = t;
  p.classList.toggle('act', !!M.pick);
}
// ---------------- 下知 ----------------
const canOrder = (e) => e.team === 0 && !(e.real && e.o.order === 'path');
function selected() { return M.list.filter((e) => M.sel.has(e.o) && canOrder(e)); }
function orderBtn(id) {
  const s = selected();
  if (!s.length) return;
  if (id === 'form') { M.formOpen = !M.formOpen; M.pick = null; sfx('ui', 0.4); renderSide(); return; }
  M.formOpen = false;
  if (id === 'move' || id === 'attack') {
    M.pick = M.pick === id ? null : id;
    sfx('ui', 0.4);
    renderSide();
    return;
  }
  issue(id, {});
}

export function issue(id, arg) {
  const b = M.b;
  const s = selected();
  M.pick = null; M.formOpen = false;
  if (!s.length || !b) return;
  const P = b.player.u.pos;
  const O = id === 'form' ? FORMS.find((f) => f.f === arg.f) || FORMS[0] : ORDERS.find((o) => o.id === id);
  // まとめて進める時は、隊ごとに少しずらした行き先に（一つ所に重ならないように）
  const cx = s.reduce((a, e) => a + e.x, 0) / s.length, cz = s.reduce((a, e) => a + e.z, 0) / s.length;
  // 引いて並べた時は、線の上に隊を左から順に割り振る（今の並びの順を崩さない）
  const lined = id === 'move' && arg.face != null;
  const order = lined ? [...s].sort((p, q) => (p.x * arg.ax + p.z * arg.az) - (q.x * arg.ax + q.z * arg.az)) : s;
  const seg = lined ? arg.w / s.length : 0;
  for (const e of s) {
    const d = Math.hypot(e.x - P.x, e.z - P.z);
    const secs = e.sq ? 0.4 : Math.max(0.8, Math.min(10, d / 14));
    const a2 = { ...arg };
    if (lined) {
      const k = order.indexOf(e) - (s.length - 1) / 2;
      a2.pt = { x: arg.pt.x + arg.ax * seg * k, z: arg.pt.z + arg.az * seg * k };
      a2.w = seg * 0.92;
    } else if (id === 'move' && arg.pt && s.length > 1) a2.pt = { x: arg.pt.x + (e.x - cx) * 0.5, z: arg.pt.z + (e.z - cz) * 0.5 };
    // 行き先の線は、使番が走っている間も、着くまで残す
    e.o.lordDest = id === 'move' ? { x: a2.pt.x, z: a2.pt.z, face: a2.face } : null;
    const pend = e.o.lordPend = { t0: b.t, until: b.t + secs, ord: id, from: { x: P.x, z: P.z } };
    const o = e.o;
    const run = () => {
      if (o.lordPend === pend) o.lordPend = null;
      if (b.over) return;
      // 備（sonae.js）を持つ隊への新しい下知（束6）は、sonae.order へ渡す（侍大将の有無でさらに遅れる）
      const S = e.real && o.butai && o.butai.sonae;
      if (S && SONAE_ORDERS.has(id)) { S.order(sonaeCmdFor(b, S, id)); return; }
      if (e.real ? o.count : armyOk(o)) (e.real ? orderReal : orderArmy)(b, o, id, a2);
    };
    // 自分の組は声で届く。ほかの隊へは使番が走る（着く秒・討たれるかは denrei.js が決める）
    if (e.sq) { b.after(secs, run); continue; }
    sendOrder(b, P, o, { id, apply: run }, { team: 0, faction: (b.player.group && b.player.group.faction) || 'oda', name: e.name, lord: true, pend })
      .onLost(() => { if (o.lordPend === pend) { o.lordPend = null; o.lordDest = null; } });
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

// 備（sonae.js）への新しい下知（束6・61 章）：butai.js の order() が分かる cmd に変える（charge・attack・hold・retreat・move だけ）
function sonaeCmdFor(b, S, id) {
  const pos = S.b.pos, f = S.b.facing;
  if (id === 'charge') {
    const foe = nearestFoe(b, pos);
    return { id: 'charge', to: foe ? { x: foe.x, z: foe.z } : { x: pos.x - Math.sin(f) * 30, z: pos.z - Math.cos(f) * 30 } };
  }
  if (id === 'defend') return { id: 'hold', form: 'yari' };
  if (id === 'rally') { const P = b.player.u.pos; return { id: 'move', to: { x: P.x, z: P.z } }; }
  if (id === 'flank') {
    const foe = nearestFoe(b, pos);
    if (!foe) return { id: 'attack' };
    const dx = foe.x - pos.x, dz = foe.z - pos.z, L = Math.hypot(dx, dz) || 1;
    const sx = -dz / L, sz = dx / L;
    const side = (pos.x * sx + pos.z * sz) >= 0 ? 1 : -1;
    return { id: 'charge', to: { x: foe.x + sx * side * 22, z: foe.z + sz * side * 22 } };
  }
  if (id === 'support') {
    const nb = S.left() || S.right();
    const p = nb ? nb.b.pos : pos;
    return { id: 'move', to: { x: p.x + (pos.x - p.x) * 0.3, z: p.z + (pos.z - p.z) * 0.3 } };
  }
  // reserve（予備に控え）：自分の向きの後ろへ下がって備える
  return { id: 'retreat', to: { x: pos.x - Math.sin(f) * 30, z: pos.z - Math.cos(f) * 30 } };
}

// 本物の兵の隊
export function orderReal(b, g, id, arg) {
  const c = g.center();
  g.calm = false; g.focus = null;
  const face = (x, z) => Math.atan2(x - c.x, z - c.z);
  if (id === 'move') {
    const p = arg.pt;
    g.order = 'move'; g.dest = { x: p.x, z: p.z }; g.speed = g.speed || 3; g.facing = face(p.x, p.z);
    // 引いて並べた時は、線の幅に合わせた横の人数にし、着いたら線に直角の向きを正面にする
    if (arg.w && g.layout && g.formation !== 'column') { const sp = g.layout(Math.max(1, g.count)).sp || 1.2; g.width = Math.max(2, Math.min(g.count, Math.round(arg.w / sp))); }
    const fa = arg.face;
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: p.x, z: p.z }; gg.aggro = Math.max(gg.aggro || 0, 8); if (fa != null) gg.facing = fa; };
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
  } else if (id === 'form') {
    // 構えを組み替える。槍衾と円陣は、その場で踏みとどまって組む
    const f = arg.f || 'line';
    g.formation = f;
    if (f === 'yari' || f === 'ring') { g.order = 'hold'; g.dest = null; g.anchor = { x: c.x, z: c.z }; }
    if (f === 'yari') { const fo = nearestFoe(b, c); if (fo) g.facing = face(fo.x, fo.z); }
  } else if (id === 'fire') {
    g.holdFire = !g.holdFire;
    b.bark(`${g.name || '隊'}：${g.holdFire ? '撃ち方やめ' : '放て'}`);
  }
  for (const u of g.units) u.aiT = 0;
}

// 遠くの軽い大軍（world.js の follow・halt で歩かせる）
export function orderArmy(b, A, id, arg) {
  const g = A.mesh;
  const c = armyCenter(A);
  A.lordCmd = true; A.lordTgt = null;
  const walkTo = (x, z, f) => { g.halt(); g.follow(() => ({ x, z, facing: f }), { gap: 0 }); };
  if (id === 'move') { const p = arg.pt; A.lordOrder = 'move'; walkTo(p.x, p.z, arg.face != null ? arg.face : Math.atan2(p.x - c.x, p.z - c.z)); }
  else if (id === 'attack') {
    A.lordOrder = 'attack'; A.lordTgt = arg.tgt;
    g.halt();
    g.follow(() => {
      const tp = curPos(A.lordTgt), me = armyCenter(A);
      if (!tp) return null;
      const f = Math.atan2(tp.x - me.x, tp.z - me.z);
      return { x: tp.x - Math.sin(f) * 7, z: tp.z - Math.cos(f) * 7, facing: f };
    }, { gap: 0 });
  } else if (id === 'hold' || id === 'yari' || (id === 'form' && (arg.f === 'yari' || arg.f === 'ring'))) { A.lordOrder = 'hold'; g.halt(); g.follow(null); }
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
    // 田（水の張った所）は青みの緑に
    if (W.def.paddy && W.def.paddy(p.x, p.z) > 0.5) { r = r * 0.7 + 18; gg = gg * 0.7 + 34; bb = bb * 0.7 + 30; }
    if (wat && p.x > wat.x) { r = 44; gg = 62; bb = 70; }
    g.fillStyle = `rgb(${r | 0},${gg | 0},${bb | 0})`;
    g.fillRect(i * cw, j * cw, cw + 1, cw + 1);
  }
  // 等高線（高さ 3m ごと）：隣の升と段が違う所を薄い墨で。5 本目ごとに少し濃く
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const hv = hs[j * (nx + 1) + i], k0 = Math.floor(hv / 3);
    const k1 = Math.floor(hs[j * (nx + 1) + i + 1] / 3), k2 = Math.floor(hs[(j + 1) * (nx + 1) + i] / 3);
    if (k0 === k1 && k0 === k2) continue;
    const mk = Math.max(k0, k1, k2);
    g.fillStyle = mk % 5 === 0 ? 'rgba(18,14,10,.62)' : 'rgba(18,14,10,.4)';
    g.fillRect(i * cw + cw / 2 - 1.2, j * cw + cw / 2 - 1.2, 2.4, 2.4);
  }
  // 林：暗い緑の塊と木の点
  for (const gr of W.def.groves || []) {
    const [a, c] = toScr(gr.x, gr.z), R = gr.r * s;
    if (a < -R || c < -R || a > w + R || c > h + R) continue;
    g.fillStyle = 'rgba(34,52,30,.62)'; g.beginPath(); g.arc(a, c, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(20,34,18,.8)';
    for (let k = 0; k < Math.min(24, gr.n || 12); k++) { const an = k * 2.399, rr = R * Math.sqrt((k + 0.5) / 24); g.beginPath(); g.arc(a + Math.cos(an) * rr, c + Math.sin(an) * rr, Math.max(1.5, 2.2 * s), 0, Math.PI * 2); g.fill(); }
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
  // 使番：下知は馬の使番が運ぶ。走っている間は、信長から隊へ点線と、母衣を背負った使番の印と残りの秒
  g.font = '700 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const e of M.list) {
    const pd = e.o.lordPend;
    if (!pd || pd.until <= b.t) continue;
    const [a1, c1] = toScr(pd.from.x, pd.from.z), [a2, c2] = toScr(e.x, e.z);
    const k = Math.min(1, (b.t - pd.t0) / Math.max(0.1, pd.until - pd.t0));
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(243,217,138,.7)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(a1, c1); g.lineTo(a2, c2); g.stroke(); g.setLineDash([]);
    // 使番の今の場所（denrei.js が 0.25 秒ごとに書く）。まだ無ければ道のりの割合で
    const [rx, ry] = pd.x != null ? toScr(pd.x, pd.z) : [a1 + (a2 - a1) * k, c1 + (c2 - c1) * k];
    // 母衣（丸くふくらんだ布）と使番
    g.fillStyle = '#c0452e'; g.beginPath(); g.arc(rx - 3, ry - 4, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f3d98a'; g.strokeStyle = '#14120f'; g.lineWidth = 1.5; g.beginPath(); g.arc(rx, ry, 4, 0, Math.PI * 2); g.fill(); g.stroke();
    // 隊の上に、下知が届くまでの輪（減っていく）
    const R0 = 13;
    g.strokeStyle = 'rgba(10,9,7,.7)'; g.lineWidth = 4; g.beginPath(); g.arc(a2, c2, R0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#f3d98a'; g.lineWidth = 2.5; g.beginPath(); g.arc(a2, c2, R0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k)); g.stroke();
    const tx = `${Math.ceil(pd.until - b.t)}秒`, tw = g.measureText(tx).width + 8;
    g.fillStyle = 'rgba(10,9,7,.85)'; g.fillRect(rx - tw / 2, ry + 7, tw, 15); g.fillStyle = '#f3d98a'; g.fillText(tx, rx, ry + 14.5);
  }
  // 攻める相手を指す時は、敵の隊を朱の輪で示す
  if (M.pick === 'attack') {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
    g.strokeStyle = `rgba(240,120,90,${0.45 + pulse * 0.45})`; g.lineWidth = 2;
    for (const e of M.list) { if (e.team !== 1) continue; const [a, c] = toScr(e.x, e.z); g.beginPath(); g.arc(a, c, Math.max(14, e.r * s) + 3, 0, Math.PI * 2); g.stroke(); }
  }
  // 行き先：使番が走っている間も、着くまで点線と着くまでの見込み（秒）を残す
  g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const e of M.list) {
    if (e.team !== 0) continue;
    const o = e.o;
    let dst = o.lordDest || (e.real && o.order === 'move' ? o.dest : null);
    if (o.lordDest) {
      // 着いた・別の動きに替わった時は消す
      const moving = e.real ? (o.order === 'move' || (o.lordPend && o.lordPend.until > b.t)) : (o.lordOrder === 'move' || (o.lordPend && o.lordPend.until > b.t));
      if (!moving || Math.hypot(e.x - o.lordDest.x, e.z - o.lordDest.z) < 5) { o.lordDest = null; dst = e.real && o.order === 'move' ? o.dest : null; }
    }
    if (!dst) continue;
    const [a1, c1] = toScr(e.x, e.z), [a2, c2] = toScr(dst.x, dst.z);
    g.strokeStyle = 'rgba(236,228,210,.6)'; g.setLineDash([6, 5]); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(a1, c1); g.lineTo(a2, c2); g.stroke(); g.setLineDash([]);
    // 行き先の小旗の印と、向き（引いて並べた時）
    g.fillStyle = '#ece4d2'; g.beginPath(); g.arc(a2, c2, 3.5, 0, Math.PI * 2); g.fill();
    if (dst.face != null) { g.strokeStyle = '#ece4d2'; g.lineWidth = 2; g.beginPath(); g.moveTo(a2, c2); g.lineTo(a2 + Math.sin(dst.face) * 14, c2 + Math.cos(dst.face) * 14); g.stroke(); }
    const sp = e.real ? (o.speed || 3) : 2.5;
    const wait = o.lordPend && o.lordPend.until > b.t ? o.lordPend.until - b.t : 0;
    const eta = Math.ceil(wait + Math.hypot(dst.x - e.x, dst.z - e.z) / sp);
    if (eta > 1) { const tx = innerHeight < 500 ? `約${eta}秒` : `着くまで約${eta}秒`, tw = g.measureText(tx).width + 8; g.fillStyle = 'rgba(10,9,7,.78)'; g.fillRect(a2 - tw / 2, c2 + 7, tw, 16); g.fillStyle = '#ece4d2'; g.fillText(tx, a2, c2 + 15); }
  }
  // 隊の札（家紋と兵数）。札どうしが重なる時は横へずらし、それでも重なる物は近くの札に「＋n」とまとめる
  const bw = 44, bh = 30;
  const boxes = [];
  const over = (q) => boxes.find((r) => q[0] < r.q[0] + r.q[2] + 2 && q[0] + q[2] + 2 > r.q[0] && q[1] < r.q[1] + r.q[3] + 2 && q[1] + q[3] + 2 > r.q[1]);
  const pri = (e) => (M.sel.has(e.o) ? 0 : 2) + (e.team === 0 ? 0 : 1) + (M.hover === e ? -3 : 0);
  const vis = M.list.filter((e) => { e.bx = null; e.more = 0; const [a, c] = toScr(e.x, e.z); return !(a < -40 || c < -40 || a > w + 40 || c > h + 40); });
  vis.sort((p, q) => pri(p) - pri(q));
  const TRY = [[0, 0], [48, 0], [-48, 0], [0, -34], [48, -34], [-48, -34], [96, 0], [-96, 0]];
  for (const e of vis) {
    const [a, c] = toScr(e.x, e.z);
    let q = null, host = null;
    for (const [ox, oy] of TRY) {
      const t = [a - bw / 2 + ox, c - bh - 8 + oy, bw, bh];
      const r = over(t);
      if (!r) { q = t; break; }
      if (!host && r.e.team === e.team) host = r.e;
    }
    if (!q) { if (host) host.more += 1; else q = [a - bw / 2, c - bh - 8, bw, bh]; }
    if (q) { e.bx = q; boxes.push({ q, e }); }
  }
  for (const e of vis) {
    const [a, c] = toScr(e.x, e.z);
    const on = M.sel.has(e.o), hv = M.hover === e;
    // 敵は三角の印も（色だけに頼らない）
    if (e.team !== 0) { g.fillStyle = '#d4553b'; g.beginPath(); g.moveTo(a, c - 6); g.lineTo(a + 5, c + 3); g.lineTo(a - 5, c + 3); g.closePath(); g.fill(); }
    else { g.fillStyle = on ? '#f3d98a' : '#8fa6c8'; g.fillRect(a - 3.5, c - 3.5, 7, 7); }
    if (!e.bx) continue;
    const [x0, y0] = e.bx;
    // ずらした札は、点までの細い線でつなぐ
    if (Math.abs(x0 + bw / 2 - a) > 2 || Math.abs(y0 + bh + 8 - c) > 2) { g.strokeStyle = 'rgba(236,228,210,.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a, c); g.lineTo(Math.max(x0, Math.min(x0 + bw, a)), y0 + bh); g.stroke(); }
    g.fillStyle = e.team === 0 ? 'rgba(20,24,34,.88)' : 'rgba(40,14,10,.88)';
    g.fillRect(x0, y0, bw, bh);
    g.lineWidth = on ? 2.5 : 1;
    g.strokeStyle = on ? '#f3d98a' : hv ? '#ece4d2' : e.team === 0 ? 'rgba(143,166,200,.9)' : 'rgba(212,85,59,.9)';
    g.strokeRect(x0, y0, bw, bh);
    g.drawImage(monImg(e.mon), x0 + 2, y0 + 3, 18, 18);
    g.fillStyle = '#ece4d2'; g.fillText(e.n > 999 ? `${(e.n / 1000).toFixed(1)}千` : String(e.n), x0 + 32, y0 + 12);
    // 士気の帯
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x0 + 2, y0 + bh - 6, bw - 4, 4);
    g.fillStyle = e.m > 60 ? '#9fc28a' : e.m > 30 ? '#e0b44a' : '#d4553b'; g.fillRect(x0 + 2, y0 + bh - 6, (bw - 4) * e.m / 100, 4);
    // 束ねた隊の数
    if (e.more) { const tx = `＋${e.more}`; g.fillStyle = '#f3d98a'; g.fillRect(x0 + bw - 4, y0 - 8, 22, 15); g.fillStyle = '#14120f'; g.fillText(tx, x0 + bw + 7, y0); }
    // 名は、指している隊と、選んだのが少ない時だけ（重なって読めなくならないように）
    if (hv || (on && M.sel.size <= 3)) { g.fillStyle = 'rgba(10,9,7,.8)'; const tw = g.measureText(e.name).width + 10; g.fillRect(x0 + bw / 2 - tw / 2, y0 - 17, tw, 16); g.fillStyle = '#ece4d2'; g.fillText(e.name, x0 + bw / 2, y0 - 9); }
  }
  // 自分（信長）
  const P = b.player.u.pos, [pa, pc] = toScr(P.x, P.z);
  g.fillStyle = '#f3d98a'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(pa, pc - 8); g.lineTo(pa + 6, pc + 5); g.lineTo(pa - 6, pc + 5); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#f3d98a'; g.fillText(b.lord ? '信長' : '自分', pa, pc + 16);
  // 囲み
  // 引いて並べている線：正面の幅と、向く側の矢印
  if (M.drag && M.drag.mode === 'line' && Math.hypot(M.drag.x - M.drag.x0, M.drag.y - M.drag.y0) > 18) {
    const la = lineArg(toWorld(M.drag.x0, M.drag.y0), toWorld(M.drag.x, M.drag.y));
    const [ma, mc] = toScr(la.pt.x, la.pt.z);
    g.strokeStyle = '#f3d98a'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(M.drag.x0, M.drag.y0); g.lineTo(M.drag.x, M.drag.y); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.moveTo(ma, mc); g.lineTo(ma + Math.sin(la.face) * 22, mc + Math.cos(la.face) * 22); g.stroke();
    g.lineCap = 'butt';
  } else if (M.drag && M.drag.mode === 'box' && !M.pick && Math.hypot(M.drag.x - M.drag.x0, M.drag.y - M.drag.y0) > 10) {
    g.strokeStyle = '#f3d98a'; g.lineWidth = 1.5; g.setLineDash([5, 4]);
    g.strokeRect(Math.min(M.drag.x, M.drag.x0), Math.min(M.drag.y, M.drag.y0), Math.abs(M.drag.x - M.drag.x0), Math.abs(M.drag.y - M.drag.y0));
    g.setLineDash([]);
  }
  M.cv.style.cursor = M.pick ? 'crosshair' : M.hover ? 'pointer' : 'default';
  // 全軍の合計
  let an = 0, am = 0, en = 0, em = 0;
  for (const e of M.list) { if (e.team === 0) { an += e.n; am += e.m * e.n; } else { en += e.n; em += e.m * e.n; } }
  const top = $('gb-top');
  // 味方と敵（見えている分）の兵の多さを一本の帯で。士気は帯の下の細い線
  const k = an + en ? an / (an + en) : 0.5, amr = an ? Math.round(am / an) : 0, emr = en ? Math.round(em / en) : 0;
  const html = `<b class="a">${an}</b><span class="bal" role="img" aria-label="味方 ${an}人・士気 ${amr}、見えている敵 ${en}人・士気 ${emr}"><i style="width:${Math.round(k * 100)}%"></i><s class="ma" style="width:${amr / 2}%"></s><s class="me" style="width:${emr / 2}%"></s></span><b class="e">${en}</b>`;
  if (top.innerHTML !== html) top.innerHTML = html;
  void force;
}

function renderSide() {
  if (!M.open) return;
  const b = M.b;
  const s = selected();
  const anyReal = s.some((e) => e.real);
  // 下知の釦（選んでいない時は押せない）。変わった時だけ描き直す（押している間に消えないように）
  const ordHtml = ORDERS.map((o) => {
    const ok = s.length && (o.id !== 'form' || anyReal) && (o.id !== 'fire' || s.some((e) => e.real && e.o.units.some((u) => u.alive && (u.type === 'gun' || u.type === 'bow'))));
    const on = M.pick === o.id || (o.id === 'form' && M.formOpen);
    return `<button type="button" data-ord="${o.id}" ${ok ? '' : 'disabled'} class="${on ? 'on' : ''}" aria-pressed="${on}" title="${o.note}${o.key ? `（${o.key}）` : ''}">${icon(o.ic)}<span>${o.label}</span></button>`;
  }).join('');
  const cur = s.length === 1 && s[0].real ? s[0].o.formation : null;
  const formHtml = FORMS.map((f) => `<button type="button" data-form="${f.f}" class="${cur === f.f ? 'on' : ''}" aria-pressed="${cur === f.f}" title="${f.note}">${icon(f.ic)}<span>${f.label}</span></button>`).join('');
  const key = ordHtml + formHtml + M.formOpen + M.multi;
  if (key !== M.sideKey) {
    M.sideKey = key;
    $('gb-ord').innerHTML = ordHtml;
    $('gb-forms').innerHTML = formHtml;
    $('gb-forms').hidden = !M.formOpen;
    const mb = $('gb-multi'); mb.setAttribute('aria-pressed', String(M.multi)); mb.classList.toggle('on', M.multi);
  }
  // 隊の札：家紋・兵の数・士気の帯・いまの下知の一字。使番が走っている間は、届くまでの輪と秒
  const allies = M.list.map((e, i) => ({ e, i })).filter(({ e }) => e.team === 0);
  const cards = allies.map(({ e, i }) => {
    const on = M.sel.has(e.o);
    const left = e.o.lordPend && e.o.lordPend.until > b.t ? Math.ceil(e.o.lordPend.until - b.t) : 0;
    const k = left ? Math.max(0, Math.min(1, (e.o.lordPend.until - b.t) / Math.max(0.1, e.o.lordPend.until - e.o.lordPend.t0))) : 0;
    const march = e.real && e.o.order === 'path';
    const ordK = e.real ? (e.o.formation === 'yari' && e.o.order === 'hold' ? 'yari' : e.o.order) : e.order;
    const st = march ? '行軍中（着くまで下知できない）' : e.real ? (e.o.order === 'follow' ? 'ついて来る' : ORDER_NAME[e.o.order] || '待つ') : { move: '前進', attack: '攻める', retreat: '退く', hold: '待て' }[e.order] || '控え';
    const mc = e.m > 60 ? 'hi' : e.m > 30 ? 'md' : 'lo';
    return `<button type="button" role="option" data-i="${i}" class="gb-card ${on ? 'on' : ''} ${march ? 'off' : ''} ${e.real ? '' : 'far'}" aria-selected="${on}" aria-label="${esc(e.name)}。${e.n}人・士気${Math.round(e.m)}・${esc(st)}${left ? `・使番あと${left}秒` : ''}" title="${esc(e.name)}">
      <canvas width="30" height="30" data-mon="${esc(e.mon)}" aria-hidden="true"></canvas><b>${e.n > 999 ? `${(e.n / 1000).toFixed(1)}千` : e.n}</b>
      <i class="mb ${mc}"><i style="width:${Math.round(e.m)}%"></i></i><em aria-hidden="true">${ORD_CHAR[ordK] || '待'}</em>
      ${left ? `<span class="pd" aria-hidden="true" style="--k:${Math.round(k * 100)}%"><span>${left}</span></span>` : ''}</button>`;
  }).join('');
  if (cards !== M.cardKey) {
    M.cardKey = cards;
    const box = $('gb-list');
    const sl = box.scrollLeft;
    box.innerHTML = cards || '<p class="gb-none">動かせる隊がいない</p>';
    box.scrollLeft = sl;
    for (const c of box.querySelectorAll('canvas[data-mon]')) c.getContext('2d').drawImage(monImg(c.dataset.mon), 0, 0, 30, 30);
  }
  guide();
}
window.addEventListener('keydown', (e) => {
  if (!M.open) return;
  // 割り当てを変えた時も効くよう、押されたキーを既定のキー名に読み替えて見る（画面の字は K() で割り当て後の字を出している）
  const kc = canonical(e.code);
  if (kc === 'KeyM' || e.code === 'F1' || kc === 'KeyH') return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  e.stopPropagation();
  const k = kc;
  if (k === 'Escape') { e.preventDefault(); if (M.pick || M.formOpen) { M.pick = null; M.formOpen = false; renderSide(); } else close(); return; }
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
#gunbai { position: fixed; inset: 0; z-index: 30; display: flex; flex-direction: column; background: #0e0c09; color: var(--washi); font-family: var(--ui);
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
#gunbai[hidden] { display: none; }
#gunbai .gb-map { position: relative; flex: 1 1 auto; min-height: 0; }
#gunbai canvas#gb-cv { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
#gunbai .topback { position: absolute; left: 10px; top: 10px; z-index: 2; }
#gunbai .gb-top { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: rgba(10,9,7,.82); border: 1px solid rgba(194,162,90,.35); }
#gunbai .gb-top b { font-family: var(--display); font-size: 17px; font-variant-numeric: tabular-nums; min-width: 3ch; }
#gunbai .gb-top b.a { color: #b8cbe6; text-align: right; } #gunbai .gb-top b.e { color: #f0a08c; }
#gunbai .gb-top b.a::before { content: '味方 '; font: 500 12px var(--ui); color: var(--washi-dim); }
#gunbai .gb-top b.e::after { content: ' 敵'; font: 500 12px var(--ui); color: var(--washi-dim); }
#gunbai .gb-top .bal { position: relative; display: block; width: min(240px, 26vw); height: 10px; background: #8a3424; }
#gunbai .gb-top .bal i { position: absolute; left: 0; top: 0; bottom: 0; background: #6f86a8; border-right: 2px solid #f3d98a; }
#gunbai .gb-top .bal s { position: absolute; bottom: -5px; height: 2px; }
#gunbai .gb-top .bal .ma { left: 0; background: #b8cbe6; } #gunbai .gb-top .bal .me { right: 0; background: #f0a08c; }
#gunbai .gb-pick { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); padding: 6px 14px; background: rgba(10,9,7,.85); border: 1px solid rgba(194,162,90,.4); font-size: 14px; white-space: nowrap; max-width: calc(100% - 140px); overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
#gunbai .gb-pick.act { border-color: #f3d98a; color: #f3d98a; }
#gunbai .gb-zoom { position: absolute; right: 10px; top: 10px; display: flex; flex-direction: column; gap: 6px; }
#gunbai button { min-height: 44px; min-width: 44px; font: 600 14px/1.1 var(--ui); color: var(--washi); background: rgba(44,40,33,.92); border: 1px solid rgba(194,162,90,.45); cursor: pointer; padding: 4px 10px; }
#gunbai button:hover:not([disabled]) { border-color: var(--kin); }
#gunbai button.on, #gunbai button[aria-pressed="true"] { background: rgba(192,69,46,.6); border-color: #f0c070; }
#gunbai button[disabled] { opacity: .38; cursor: not-allowed; }
#gunbai button:focus-visible { outline: 2px solid var(--kin); outline-offset: 2px; }
#gunbai svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
/* 下の帯：下知の釦・構え・隊の札 */
#gunbai .gb-dock { flex: 0 0 auto; display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; background: linear-gradient(180deg, #1a1611, #0e0c09); border-top: 2px solid rgba(194,162,90,.45); }
#gunbai .gb-ord, #gunbai .gb-forms { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
#gunbai .gb-ord button, #gunbai .gb-forms button { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; min-width: 76px; }
#gunbai .gb-forms { padding-bottom: 6px; border-bottom: 1px dashed rgba(194,162,90,.35); }
#gunbai .gb-row { display: flex; gap: 8px; align-items: stretch; min-width: 0; }
#gunbai .gb-sel { display: flex; flex-direction: column; gap: 6px; flex: 0 0 auto; }
#gunbai .gb-sel button { min-height: 44px; font-size: 13px; padding: 2px 8px; }
#gunbai .gb-cards { display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden; flex: 1 1 auto; min-width: 0; padding: 2px 2px 4px; scrollbar-width: thin; }
#gunbai .gb-card { position: relative; flex: 0 0 auto; width: 64px; height: 76px; padding: 4px 3px; display: flex; flex-direction: column; align-items: center; gap: 2px; background: linear-gradient(180deg, #2c3446, #1a1f2b); border: 1px solid rgba(143,166,200,.55); }
#gunbai .gb-card.far { background: linear-gradient(180deg, #262b36, #171a21); border-style: dashed; }
#gunbai .gb-card.on { border: 2px solid #f3d98a; transform: translateY(-3px); box-shadow: 0 4px 10px rgba(0,0,0,.6); background: linear-gradient(180deg, #4a3a22, #2a2014); }
#gunbai .gb-card.off { opacity: .5; }
#gunbai .gb-card canvas { width: 30px; height: 30px; }
#gunbai .gb-card b { font: 700 14px/1 var(--ui); font-variant-numeric: tabular-nums; }
#gunbai .gb-card .mb { display: block; width: 52px; height: 5px; background: rgba(0,0,0,.6); }
#gunbai .gb-card .mb i { display: block; height: 100%; background: #9fc28a; }
#gunbai .gb-card .mb.md i { background: #e0b44a; } #gunbai .gb-card .mb.lo i { background: #d4553b; }
#gunbai .gb-card em { position: absolute; top: 2px; right: 2px; font: 700 12px/1 var(--display); font-style: normal; color: #14120f; background: #d8cfb8; padding: 2px 3px; }
#gunbai .gb-card .pd { position: absolute; top: 2px; left: 2px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(#f3d98a var(--k), rgba(10,9,7,.7) 0); }
#gunbai .gb-card .pd span { width: 16px; height: 16px; border-radius: 50%; background: #14120f; color: #f3d98a; font: 700 12px/16px var(--ui); text-align: center; }
#gunbai .gb-none { margin: 0; align-self: center; font-size: 13px; color: var(--washi-dim); }
html:not(.touch) #gunbai #gb-multi { display: none; }
/* iPhone 横：帯を低く、字を削る（釦は絵と二字） */
@media (max-height: 460px) {
  #gunbai .gb-dock { padding: 4px 8px; gap: 4px; flex-direction: row; align-items: stretch; }
  #gunbai .gb-ord { flex-wrap: nowrap; display: grid; grid-template-columns: repeat(3, 44px); grid-auto-rows: 44px; gap: 8px; }
  #gunbai .gb-ord button { min-width: 44px; min-height: 44px; padding: 0; justify-content: center; flex-direction: column; gap: 0; font-size: 12px; }
  #gunbai .gb-ord button svg { width: 18px; height: 18px; }
  #gunbai .gb-forms { position: absolute; left: 8px; right: 8px; bottom: 100%; background: rgba(14,12,9,.95); padding: 6px; border: 1px solid rgba(194,162,90,.45); flex-wrap: nowrap; }
  #gunbai .gb-forms button { min-width: 0; flex: 1; padding: 2px 4px; font-size: 13px; }
  #gunbai .gb-dock { position: relative; }
  #gunbai .gb-sel button { min-height: 44px; }
  #gunbai .gb-card { height: 92px; }
  #gunbai .gb-top { top: 8px; padding: 4px 10px; } #gunbai .gb-top b { font-size: 15px; }
  #gunbai .gb-pick { font-size: 13px; bottom: 6px; }
  #gunbai .gb-zoom { top: 8px; right: 8px; } #gunbai .gb-zoom button { min-height: 44px; min-width: 44px; }
}
@media (prefers-reduced-motion: reduce) { #gunbai .gb-card.on { transform: none; } }
`;
  document.head.appendChild(st);
}
