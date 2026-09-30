// 組の中身：連れて行く兵の種類の割り振り（槍・鉄砲・弓・騎馬）。G.kumi に覚え、次の戦にも引き継ぐ
//   G.kumi = { n: 決めた時の組の人数, gun, bow, cavalry }。槍は残りの全部。組の人数が変われば割合で直す
//   選ぶ所：城下の「組」の札と、出陣の前の札（main.js）。使う所：battle.js の makeSquad
import { RANKS } from './state.js';
import { sfx } from './audio.js';

export const KUMI_NAME = { spear: '槍', gun: '鉄砲', bow: '弓', cavalry: '騎馬' };
// 身分で選べる種類：組頭候補は槍と鉄砲、組頭から弓、馬に乗る足軽大将から騎馬
export function kumiKinds(G) {
  const r = G.rank || 0;
  return ['gun', ...(r >= 2 ? ['bow'] : []), ...(r >= 4 ? ['cavalry'] : [])];
}
const step = (n) => (n <= 5 ? 1 : 5);

// 人数 n の組の割り振り（[{ kind, n }]）。まだ決めていなければ null（戦の定義のまま）
export function kumiList(G, n) {
  const K = G.kumi;
  if (!K || !n || G.lord) return null;
  const out = [];
  let rest = n;
  for (const k of kumiKinds(G)) {
    const c = Math.max(0, Math.min(rest, Math.round((K[k] || 0) * n / Math.max(1, K.n || n))));
    if (c) { out.push({ kind: k, n: c, ranks: k === 'gun' && c >= 6 ? 2 : undefined }); rest -= c; }
  }
  if (rest) out.unshift({ kind: 'spear', n: rest });
  return out;
}

// いまの組の人数での数（画面に出す）
function counts(G) {
  const n = RANKS[G.rank].squad;
  const c = { spear: n };
  for (const s of kumiList(G, n) || [{ kind: 'spear', n }]) c[s.kind] = s.n;
  if (!G.kumi) c.spear = n;
  return { n, c };
}

export function kumiHtml(G) {
  const { n, c } = counts(G);
  if (!n || G.lord) return '';
  const st = step(n);
  const row = (k) => `<div class="km-r"><span>${KUMI_NAME[k]}</span><button type="button" class="km-b" data-km="${k}" data-d="-${st}" aria-label="${KUMI_NAME[k]}を${st}人減らす" ${c[k] ? '' : 'disabled'}>−</button><b>${c[k] || 0}</b><button type="button" class="km-b" data-km="${k}" data-d="${st}" aria-label="${KUMI_NAME[k]}を${st}人増やす" ${c.spear >= st ? '' : 'disabled'}>＋</button></div>`;
  return `<div class="kumi" role="group" aria-label="組の中身"><style>
    .kumi { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 8px 0; padding: 6px 10px; border: 1px solid rgba(194,162,90,.5); background: rgba(20,16,10,.55); font-size: 15px; justify-content: center; }
    .kumi .km-h { color: #c2a25a; font-size: 14px; letter-spacing: .1em; }
    .kumi .km-r { display: flex; align-items: center; gap: 8px; }
    .kumi .km-r b { min-width: 1.6em; text-align: center; font-size: 17px; color: #efe6d2; }
    .kumi .km-b { min-width: 44px; min-height: 44px; font-size: 20px; background: rgba(239,230,210,.08); color: #efe6d2; border: 1px solid rgba(239,230,210,.4); cursor: pointer; }
    .kumi .km-b:disabled { opacity: .35; cursor: default; }
  </style><span class="km-h">組の中身（${n}人）</span><div class="km-r"><span>槍</span><b>${c.spear}</b></div>${kumiKinds(G).map(row).join('')}</div>`;
}

// root の中の .kumi の釦を効かせる（押すたびに作り直す）。onChange は保存など
export function kumiBind(G, root, onChange) {
  if (!root) return;
  if (root._kumiH) root.removeEventListener('click', root._kumiH);
  root.addEventListener('click', root._kumiH = (e) => {
    const b = e.target.closest && e.target.closest('.km-b');
    if (!b || b.disabled) return;
    e.stopPropagation();
    const { n, c } = counts(G);
    const k = b.dataset.km, d = +b.dataset.d;
    const v = Math.max(0, Math.min((c[k] || 0) + d, (c[k] || 0) + c.spear));
    G.kumi = { n };
    for (const x of kumiKinds(G)) G.kumi[x] = x === k ? v : c[x] || 0;
    G.bowRatio = (G.kumi.bow || 0) / n;   // 名簿の補い（弓の者の数）もそろえる
    const el = b.closest('.kumi');
    if (el) el.outerHTML = kumiHtml(G);
    const nb = root.querySelector(`.km-b[data-km="${k}"][data-d="${d}"]`);
    if (nb && !nb.disabled) nb.focus({ preventScroll: true });
    if (onChange) onChange();
  });
}

// ---------------- 鉄砲の組の号令：構え → 放て（一斉射）→ 込める間は槍が前へ ----------------
// rt.kamae = { c: 鉄砲の並ぶ所, h: 向き, st: 'ready'|'reload', t }。ほかの号令で解く（kamaeOff）
const gunsOf = (rt) => rt.squadGroups.filter((g) => g.kind === 'gun' && g.count > 0);
function place(rt, K, fwd) {
  const fx = Math.sin(K.h), fz = Math.cos(K.h), rx = Math.cos(K.h), rz = -Math.sin(K.h);
  let side = 0;
  for (const g of rt.squadGroups) {
    if (g.kind === 'gun' || !g.count) continue;
    g.focus = null; g.order = 'hold'; g.facing = K.h;
    if (g.formation === 'yari' && !fwd) g.formation = 'line';
    if (g.kind === 'cavalry') { side++; g.anchor = { x: K.c.x + rx * (9 + side * 4), z: K.c.z + rz * (9 + side * 4) }; g.aggro = 7; continue; }
    // 込める間は鉄砲の 5m 前で槍を揃える。込め終われば 4m 後ろへ下がり、撃つ線を空ける
    const d = fwd ? 5 : -4;
    g.anchor = { x: K.c.x + fx * d, z: K.c.z + fz * d };
    g.aggro = fwd ? 6 : 4;
    if (fwd && (g.kind === 'spear' || !g.kind)) g.formation = 'yari';
    for (const s of g.units) { s.aiT = Math.random() * 0.4; if (!fwd) { s.target = null; s.atk = null; } }
  }
}
export function kamae(rt, P) {
  const guns = gunsOf(rt);
  if (!guns.length) return false;
  const u = P.u, h = P.yaw;
  const K = rt.kamae = { c: { x: u.pos.x + Math.sin(h) * 4, z: u.pos.z + Math.cos(h) * 4 }, h, st: 'ready', t: rt.t };
  const rx = Math.cos(h), rz = -Math.sin(h);
  guns.forEach((g, i) => {
    const off = (i - (guns.length - 1) / 2) * 10;
    g.order = 'hold'; g.formation = 'line'; g.focus = null; g.facing = h; g.aggro = 40;
    g.fire = true; g.holdFire = true;
    g.anchor = { x: K.c.x + rx * off, z: K.c.z + rz * off };
    for (const s of g.units) s.aiT = Math.random() * 0.4;
  });
  place(rt, K, false);
  rt.say(rt.G.name, '鉄砲、前へ！　構えっ！', 2);
  return true;
}
export function volley(rt) {
  const K = rt.kamae, guns = gunsOf(rt);
  if (!K || !guns.length) return false;
  const loaded = guns.reduce((a, g) => a + g.units.filter((s) => s.alive && !(s.cd > 0.3)).length, 0);
  if (!loaded || K.st === 'reload') { rt.hud.flash('まだ弾を込めている（込め終われば知らせる）', 'dim'); return true; }
  for (const g of guns) { g.fire = true; g.holdFire = false; }
  // 一度放てば、また「構え」のまま次の「放て」を待つ
  rt.after(1.2, () => { if (rt.kamae === K) for (const g of gunsOf(rt)) g.holdFire = true; });
  K.st = 'reload'; K.t = rt.t;
  rt.after(0.8, () => { if (rt.kamae === K) place(rt, K, true); });
  rt.say(rt.G.name, '放てえっ！', 1.6);
  rt.after(2.2, () => { if (rt.kamae === K && rt.squadGroups.some((g) => g.kind !== 'gun' && g.count > 0)) rt.bark('込める間、槍が前へ出る'); });
  return true;
}
// 三段で撃て：構え（まだなら組む）たまま holdFire を戻さず、込め終えた者から代わる代わる撃ち続ける（途切れない）
export function volleyRoll(rt, P) {
  const guns = gunsOf(rt);
  const bows = rt.squadGroups.filter((g) => g.kind === 'bow' && g.count > 0);
  if (!guns.length && !bows.length) return false;
  for (const g of bows) { g.fire = true; g.holdFire = false; }
  if (guns.length) {
    if (!rt.kamae) kamae(rt, P);
    const K = rt.kamae;
    if (K) { K.mode = 'roll'; K.t = rt.t; for (const g of guns) { g.fire = true; g.holdFire = false; } }
  }
  rt.say(rt.G.name, '三段で、代わる代わる撃てい！', 2);
  return true;
}
// 撃ち方やめ：構えを解き、弓・鉄砲の組を撃つのをやめて控えさせる
export function ceaseFire(rt) {
  const guns = gunsOf(rt);
  const bows = rt.squadGroups.filter((g) => g.kind === 'bow' && g.count > 0);
  if (!rt.kamae && !guns.some((g) => g.fire) && !bows.some((g) => g.fire)) return false;
  kamaeOff(rt);
  for (const g of [...guns, ...bows]) { g.fire = false; g.holdFire = true; }
  rt.say(rt.G.name, '撃ち方、やめいっ！', 1.6);
  return true;
}
export function kamaeOff(rt) {
  if (!rt.kamae) return;
  rt.kamae = null;
  for (const g of gunsOf(rt)) g.holdFire = false;
}
// 毎コマ：込め終われば槍を下げ、知らせる。鉄砲が尽きたら解く
export function kamaeTick(rt) {
  const K = rt.kamae;
  if (!K) return;
  const guns = gunsOf(rt);
  if (!guns.length) { kamaeOff(rt); return; }
  if (K.st !== 'reload' || rt.t - K.t < 3) return;
  const busy = guns.some((g) => g.units.some((s) => s.alive && s.cd > 0.5));
  if (busy && rt.t - K.t < 30) return;
  K.st = 'ready';
  place(rt, K, false);
  sfx('click', 0.9);
  rt.bark('鉄砲、込め終わり。撃てる。槍は下がれ');
}
