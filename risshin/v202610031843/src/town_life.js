// ======================================================================
// 城下の暮らし（kaito 10/2「城下町を GTA・RDR2 の町の水準で」）
// town3d.js の町に、暮らしの場所と人の用事を足す：
//   寺（山門・石段・本堂・鐘楼・墓）・鍛冶場・高札場・城の前の水堀・干し物・樽・薪・遠くへ続く町並み。
//   人は一人ずつ用を持つ（井戸の水汲み・市の買い物・鍛冶の槌・寺の掃除・子どもの鬼ごっこと犬・夕刻の夜回り）。
//   ぶつかると避けて文句を言い、店先で団子や膏薬を買え、馬屋の馬を借りて通りを駆けられる。
// 重さ：置き物は頂点の色の一つの材質で作り、town3d.js の mergeStatic が場所ごとに一つへまとめる（描く回数はほぼ増えない）。
//   遠い町並みは InstancedMesh 一つ。人は戦と同じ兵の作り（army.batchDraw が部品をまとめる）。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { extFirst } from './props_ext.js';
import { hut, solidRect, solidSeg, solidCircle } from './props.js';
import { hondo, sanmon, shoro, ishidan } from './temple_parts.js';
import { mizubori } from './castle_parts.js';
import { allyGroup } from './bhelp.js';
import { S as SETTINGS } from './settings.js';
import { domOf } from './domain.js';

// 出陣の支度ごとの記録。町を出入りしても、売り物と褒美は増やさない。
export function townLedger(G) {
  const D = domOf(G);
  if (!D.townEvents || D.townEvents.at !== G.battle) D.townEvents = { at: G.battle, used: {}, sold: false };
  return D.townEvents;
}

// 待ち時間が切れたら戻る。町の札だけ、指でも鍵盤でも選べるボタンにする。
export function townChoose(rt, title, opts, done) {
  const last = opts.length - 1, ordered = [opts[last], ...opts.slice(0, last)];
  const root = document.getElementById('choice');
  const keys = (e) => {
    if (!rt.choice) return;
    if (e.key >= '3' && e.key <= String(ordered.length)) {
      e.preventDefault(); rt.pickChoice(Number(e.key) - 1);
    }
  };
  rt.choose(title, ordered, (k) => {
    if (root) root.onkeydown = null;
    done(k === 0 ? last : k - 1);
  }, 25);
  if (!root || !rt.choice) return;
  root.onkeydown = keys;
  root.querySelectorAll('.opt').forEach((old, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'opt'; b.innerHTML = old.innerHTML;
    b.addEventListener('click', (e) => { e.stopPropagation(); rt.pickChoice(i); });
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const buttons = root.querySelectorAll('.opt');
      buttons[(i + (e.key === 'ArrowUp' ? buttons.length - 1 : 1)) % buttons.length].focus();
    });
    old.replaceWith(b);
  });
  root.querySelector('.opt')?.focus();
}

export function townTrade(rt) {
  if (rt.choice) return;
  const G = rt.G, D = domOf(G), book = townLedger(G), rank = G.rank || 0;
  const crops = rank >= 2 ? D.ta : (D.hatake ? 1 : 0);
  const price = 30 + Math.min(5, D.machi) * 5;
  const opts = [
    { label: '団子を買う　5文', note: '息が戻る' },
    { label: '収穫を売る', note: book.sold ? 'この支度では売り終えた' : crops ? `収穫${crops}つ・町${D.machi}つ　${crops * price}文になる` : '屋敷の畑か、知行の田が要る' },
  ];
  if (rank >= 1) opts.push({ label: '具足の直しを頼む　1貫', note: D.tsukuroi ? '次の戦の具足は直し済み' : '次の戦で、体力が少し増える' });
  opts.push({ label: '買わずに戻る' });
  townChoose(rt, '市の売り買い', opts, (k) => {
    let cost = 0, msg;
    if (k === 0) { cost = 0.005; msg = '団子を買った。息が戻った'; }
    else if (k === 1) {
      if (book.sold || !crops) { rt.say('売り手', opts[1].note, 3); return; }
      book.sold = true; cost = -crops * price / 1000; msg = `収穫を売った　${crops * price}文。町が育つと値も上がる`;
    } else if (rank >= 1 && k === 2) {
      if (D.tsukuroi) { rt.say('売り手', '具足は直し済みです', 3); return; }
      cost = 1; msg = '具足を直した。次の戦の体力が少し増える';
    } else return;
    if ((G.kan || 0) < cost) { rt.say('売り手', '銭が足りません。収穫を売るか、またお越しくだされ', 3); return; }
    G.kan = Math.round(((G.kan || 0) - cost) * 1000) / 1000;
    if (k === 0 && rt.player.breath != null) rt.player.breath = rt.player.maxBreath || 100;
    if (k === 2) D.tsukuroi = true;
    rt.hud.flash(msg);
  });
}

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// ---- 地面の高さ：町は門から城へ向けてゆるく上る。寺は一段高い台。城の前に水堀 ----
export const riseAt = (z) => 1.8 * sm(-80, 30, z);
const TEMPLE = { x: 54, z: -38 };
export function lifeH(x, z) {
  let h = riseAt(z);
  // 寺の台（石段で上がる）
  h += 1.6 * sm(39.5, 43.5, x) * sm(-53, -50, z) * sm(-23, -26, z) * sm(64, 61, x);
  // 城の前の水堀（真ん中は土橋）
  const ax = Math.abs(x);
  if (z > 68.6 && z < 75.6 && ax > 5 && ax < 60) {
    const u = (z - 72.2) / 3.4;
    if (u * u < 1) h -= 2.1 * (1 - u * u) * sm(5, 7.5, ax) * sm(60, 57, ax);
  }
  return h;
}

// ---- 形の部品（頂点の色） ----
export function colorize(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
export function B(w, h, d, x, y, z, hex, o = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (o.rx) g.rotateX(o.rx); if (o.rz) g.rotateZ(o.rz); if (o.ry) g.rotateY(o.ry);
  g.translate(x, y, z);
  g.deleteAttribute('uv');
  return colorize(g.toNonIndexed(), hex);
}
export function C(r0, r1, h, x, y, z, hex, seg = 7, o = {}) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg);
  if (o.rx) g.rotateX(o.rx); if (o.rz) g.rotateZ(o.rz);
  g.translate(x, y, z);
  g.deleteAttribute('uv');
  return colorize(g.toNonIndexed(), hex);
}
let MAT = null;
const mat = () => MAT || (MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
let CLOTH = null;
const clothMat = () => CLOTH || (CLOTH = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
// 部品を一つの形にして、(x, z) の地面に rot で置く
export function put(rt, parts, x, z, rot = 0, o = {}) {
  if (!parts.length) return null;
  const m = new THREE.Mesh(mergeGeometries(parts), o.cloth ? clothMat() : mat());
  m.position.set(x, rt.world.heightAt(x, z) + (o.y || 0), z); m.rotation.y = rot;
  m.castShadow = o.shadow !== false; m.receiveShadow = true;
  rt.scene.add(m);
  return m;
}

// ---- 暮らしの小物 ----
// 樽（酒・味噌）：箍の輪を二本
const taru = (x, y, z, r = 0.32, h = 0.62) => [C(r, r * 0.92, h, x, y + h / 2, z, 0x7a5a36, 9), C(r + 0.012, r + 0.012, 0.05, x, y + h * 0.8, z, 0x2a2018, 9), C(r + 0.012, r + 0.012, 0.05, x, y + h * 0.2, z, 0x2a2018, 9), C(r * 0.95, r * 0.95, 0.02, x, y + h + 0.01, z, 0x8a6a40, 9)];
function taruStack(rt, x, z, rot) {
  const P = [];
  const c = Math.cos(rot), sn = Math.sin(rot), at = (lx, lz, o = {}) => ({ n: o.n || 'barrel', x: x + lx * c + lz * sn, z: z - lx * sn + lz * c, rot: rot + (o.r || 0), dy: o.dy || 0 });
  for (const [lx, lz] of [[-0.35, 0], [0.35, 0], [0, 0.6]]) P.push(...taru(lx, 0, lz));
  P.push(...taru(0, 0.62, 0.2));
  solidRect(x, z, 1.4, 1.4, rot);
  // 素材の樽（読めていれば手作りの樽の代わりに）
  const L = [at(-0.35, 0), at(0.35, 0), at(0, 0.6), at(0, 0.2, { dy: 0.75, r: 0.6 }), at(0.9, -0.1, { n: 'tub', r: 0.3 })];
  const bar = L.filter((e) => e.n === 'barrel'), tub = L.filter((e) => e.n === 'tub');
  if (extFirst(rt.scene, 'barrel', bar, rt.world) && extFirst(rt.scene, 'tub', tub, rt.world)) return;
  put(rt, P, x, z, rot);
}
// 薪の山：軒下に積んだ割り木
function makiStack(rt, x, z, rot, len = 2.4) {
  const P = [];
  for (let r = 0; r < 4; r++) for (let i = 0; i < Math.round(len / 0.16); i++) P.push(C(0.07, 0.07, 0.55, -len / 2 + 0.08 + i * 0.16 + (r % 2) * 0.05, 0.08 + r * 0.14, 0, (i + r) % 3 ? 0x8a6a44 : 0x6e5434, 5, { rx: Math.PI / 2 }));
  P.push(B(len + 0.3, 0.06, 0.8, 0, 0.66, 0.05, 0x4e4434, { rx: -0.12 }));
  put(rt, P, x, z, rot); solidRect(x, z, len, 0.7, rot);
}
// 干し物：二本の竿立てに竹を渡し、着物と手拭いを干す
function hoshimono(rt, x, z, rot, len = 3.6, seed = 0) {
  const W = [], Cl = [];
  for (const s of [-1, 1]) W.push(C(0.04, 0.05, 2.1, s * len / 2, 1.05, 0, 0x5a4a36, 5), B(0.5, 0.04, 0.04, s * len / 2, 2.0, 0, 0x5a4a36, { ry: Math.PI / 2 }));
  W.push(C(0.025, 0.025, len + 0.4, 0, 2.02, 0, 0x9a9a5a, 5, { rz: Math.PI / 2 }));
  const cols = [0x2b3f5c, 0xe6e0d0, 0x6a4a3a, 0x3a5a6a, 0xd8d0b8, 0x7a3b22];
  let xx = -len / 2 + 0.4, k = seed;
  while (xx < len / 2 - 0.4) {
    const kimono = k % 3 === 0, w = kimono ? 1.0 : 0.32, h = kimono ? 1.15 : 0.6;
    Cl.push(B(w, h, 0.015, xx + w / 2, 2.0 - h / 2, 0, cols[(k * 5) % cols.length], { rz: ((k * 7) % 5 - 2) * 0.015 }));
    if (kimono) Cl.push(B(w * 1.5, 0.3, 0.015, xx + w / 2, 1.85, 0, cols[(k * 5) % cols.length]));   // 袖
    xx += w + 0.18; k++;
  }
  put(rt, W, x, z, rot);
  put(rt, Cl, x, z, rot, { cloth: true, shadow: true });
  for (const s of [-1, 1]) solidCircle(x + Math.cos(rot) * s * len / 2, z - Math.sin(rot) * s * len / 2, 0.12);
}
// 天水桶・手桶
const oke = (x, z) => [C(0.2, 0.17, 0.3, x, 0.15, z, 0x6a5030, 8), C(0.205, 0.205, 0.03, x, 0.24, z, 0x2a2018, 8)];
// 石灯籠
function toro(rt, x, z) {
  const P = [B(0.7, 0.2, 0.7, 0, 0.1, 0, 0x8a857a), C(0.13, 0.15, 0.9, 0, 0.65, 0, 0x8a857a, 6), B(0.6, 0.12, 0.6, 0, 1.15, 0, 0x8a857a), B(0.42, 0.38, 0.42, 0, 1.4, 0, 0x7a766c), B(0.16, 0.2, 0.44, 0, 1.4, 0, 0x2a2420)];
  const roof = new THREE.ConeGeometry(0.5, 0.35, 4); roof.rotateY(Math.PI / 4); roof.translate(0, 1.76, 0); roof.deleteAttribute('uv'); P.push(colorize(roof.toNonIndexed(), 0x847f74));
  put(rt, P, x, z); solidCircle(x, z, 0.4);
}
// 墓（五輪塔を細かくせず、四角・丸・三角を重ねた形）
function haka(x, z, s = 1) {
  const g = [B(0.5 * s, 0.3 * s, 0.5 * s, x, 0.15 * s, z, 0x7a766c), new THREE.SphereGeometry(0.22 * s, 7, 5), B(0.36 * s, 0.22 * s, 0.36 * s, x, 0.72 * s, z, 0x7e7a70), C(0.03, 0.16 * s, 0.25 * s, x, 0.95 * s, z, 0x7a766c, 4)];
  g[1].translate(x, 0.48 * s, z); g[1].deleteAttribute('uv'); g[1] = colorize(g[1].toNonIndexed(), 0x86827a);
  return g;
}

// ======================================================================
// 町に足す建物と小物（buildTown の終わり、まとめる前に呼ぶ）
// ctx：{ sign, chochin, dusk, doors }
// ======================================================================
export function buildLife(rt, ctx) {
  const W = rt.world, F = rt.flags, L = F.life = { spots: {} };
  const low = SETTINGS.quality === 'low';
  // ---- 寺：裏の並びの間の路地を東へ抜け、山門をくぐって石段を上ると本堂 ----
  {
    const { x, z } = TEMPLE;
    rt.scene.add(sanmon(W, 37.8, z, Math.PI / 2));
    rt.scene.add(ishidan(W, 39.4, z, 43.9, z, 3));
    rt.scene.add(hondo(W, x, z, -Math.PI / 2));
    rt.scene.add(shoro(W, 46.5, -47.5));
    toro(rt, 45.6, z - 2.6); toro(rt, 45.6, z + 2.6);
    // 墓所（本堂の北の脇）
    const P = [];
    for (let i = 0; i < (low ? 8 : 14); i++) P.push(...haka((i % 7) * 1.1, Math.floor(i / 7) * 1.3, 0.85 + (i * 37 % 5) * 0.06));
    put(rt, P, 51, -28.6); solidRect(54.3, -28, 8, 3);
    ctx.sign(rt, '寺', 36.6, 2.6, z + 3.5, -Math.PI / 2, 0.42, true);
    L.spots.temple = { x: 47, z };
    L.spots.bell = { x: 46.5, z: -47.5 };
  }
  // ---- 鍛冶場：市の南の裏路地。中へ入れる仕事場（town_shops.js が建て、L.spots.anvil を置く） ----
  // ---- 高札場：町の門を入った所。石の台に札 ----
  {
    const x = -7.6, z = -76.4;
    const P = [B(3.4, 0.5, 1.2, 0, 0.25, 0, 0x7e796e), C(0.09, 0.1, 2.7, 0, 1.6, -1.4, 0x3a2c20, 6), C(0.09, 0.1, 2.7, 0, 1.6, 1.4, 0x3a2c20, 6),
      B(0.14, 0.12, 3.3, 0, 2.5, 0, 0x3a2c20), B(0.9, 0.08, 3.6, -0.2, 2.98, 0, 0x4a4238, { rz: 0.3 }), B(0.9, 0.08, 3.6, 0.2, 2.98, 0, 0x4a4238, { rz: -0.3 })];
    put(rt, P, x, z, 0); solidRect(x, z, 1.4, 3.6);
    ctx.sign(rt, '定', x + 0.1, 2.0, z - 0.8, Math.PI / 2, 0.42, true);
    ctx.sign(rt, '楽市　喧嘩停止', x + 0.1, 1.95, z + 0.55, Math.PI / 2, 0.36);
    L.spots.kosatsu = { x: x + 1.6, z };
  }
  // ---- 暮らしの小物：干し物・樽・薪・天水桶 ----
  hoshimono(rt, -16.6, -60, Math.PI / 2, 3.8, 1);
  hoshimono(rt, -16.2, -40, Math.PI / 2, 3.2, 4);
  hoshimono(rt, -16.6, 6, Math.PI / 2, 3.6, 2);
  hoshimono(rt, 15.0, -59, Math.PI / 2, 3.6, 3);
  if (!low) hoshimono(rt, -48, -8, 0.3, 3.4, 5);
  taruStack(rt, -5.1, -61.2, 0.2);     // 宿の酒樽
  taruStack(rt, -5.0, -1.8, -0.1);     // 問屋の味噌樽
  // ---- 夜の屋台：宿の酒樽のそばで一杯やる侍（居酒屋がわり）と、夜鳴きそばの屋台（kaito 10/2 夜の町） ----
  {
    ctx.chochin(rt, -5.9, 2.05, -60.4);
    ctx.chochin(rt, -5.9, 2.05, -62.0);
    L.spots.izakaya = { x: -5.3, z: -61.2, face: Math.PI / 2 };
    const sx = -6.6, sz = -65.0, srot = Math.PI / 2;
    const Y = [];
    Y.push(C(0.28, 0.28, 0.06, -0.55, 0.3, 0, 0x2a2018, 10, { rz: Math.PI / 2 }), C(0.28, 0.28, 0.06, 0.55, 0.3, 0, 0x2a2018, 10, { rz: Math.PI / 2 }));
    Y.push(B(1.6, 0.06, 0.8, 0, 0.6, 0, 0x5a4634));
    Y.push(C(0.26, 0.22, 0.3, 0, 0.8, 0.1, 0x3a3430, 9), C(0.27, 0.27, 0.03, 0, 0.96, 0.1, 0x1a1612, 9));
    Y.push(C(0.015, 0.015, 1.0, -0.7, 1.3, -0.25, 0x3a2c20, 5), C(0.015, 0.015, 1.0, 0.7, 1.3, -0.25, 0x3a2c20, 5));
    Y.push(B(1.7, 0.03, 0.55, 0, 1.78, -0.25, 0xd8cdb0));
    put(rt, Y, sx, sz, srot);
    ctx.chochin(rt, sx + 0.95, 1.5, sz - 0.25);
    W.addSmokeColumn(sx, W.heightAt(sx, sz) + 1.2, sz, { size: 0.18 });
    L.spots.soba = { x: sx, z: sz + 1.0, face: srot };
    solidRect(sx, sz, 1.8, 1.0, srot);
  }
  makiStack(rt, -13.6, -50, Math.PI / 2, 3);
  makiStack(rt, -13.6, -2, Math.PI / 2, 2.4);
  makiStack(rt, 13.8, -70, Math.PI / 2, 2.6);
  {
    const P = [];
    for (const [x, z] of [[-5.1, -46], [5.2, -67.5], [-5.1, 14], [5.1, 24], [-5.1, -30]]) P.push(...oke(x, z), ...oke(x + 0.36, z + 0.1), ...oke(x + 0.18, z + 0.1).map((g) => g.translate(0, 0.3, 0)));
    put(rt, P, 0, 0, 0, { shadow: false });
  }
  // ---- 城の前の水堀（武家地を囲う。真ん中は土橋） ----
  {
    const y = riseAt(72) - 1.25;
    for (const [a, b] of [[-58.5, -6.5], [6.5, 58.5]]) {
      mizubori(rt, [[a, 72.2], [b, 72.2]], { width: 6.6, depth: 2.1, y });
      solidSeg(a, 68.4, b, 68.4, 0.3);
    }
  }
  // ---- 遠くまで続く町並み：門の外の街道沿いと、町の東西の外れ（一つの InstancedMesh） ----
  farTown(rt, low);
}

// ======================================================================
// 出世で町が育つ（kaito 10/2 二回目 ④）：門から通りを見上げた一目で違いが分かるように
//   足軽（lv0）：表通りに空き地が四つ（草と崩れた小屋）。提灯は宿と茶屋だけ
//   組頭候補（lv1）：空き地が二つ。提灯が三軒に一つ
//   組頭（lv2）：空き地は埋まり、表の家ごとに提灯
//   大将候補（lv3）：辻に提灯の綱が一本・商家の幟・東の裏に白い土蔵
//   大将（lv4）：提灯の綱が三本・織田の幟が通りに並ぶ・土蔵が増える
// list：町家の並び（placeMachiya の前）。空き地にする家はここから抜く
// ctx：{ list, lv, chochin, ST_W, D, nobori }
// ======================================================================
export function townGrow(rt, ctx) {
  const W = rt.world, lv = ctx.lv || 0, low = SETTINGS.quality === 'low';
  const front = ctx.list.filter((it) => Math.abs(Math.abs(it.x) - (ctx.ST_W + ctx.D / 2 + 0.3)) < 0.05 && it.w < 7);
  // ---- 空き地 ----
  const nEmpty = lv === 0 ? 4 : lv === 1 ? 2 : 0;
  const pick = [3, 9, 6, 13].map((i) => front[i]).filter(Boolean).slice(0, nEmpty);
  for (const it of pick) {
    ctx.list.splice(ctx.list.indexOf(it), 1);
    const P = [];
    // 草の塊・石・倒れた板・傾いた柱（崩れた小屋の跡）
    for (let i = 0; i < 9; i++) { const a = i * 2.3, r = 0.6 + (i * 37 % 5) * 0.5; P.push(B(0.5 + (i % 3) * 0.2, 0.25 + (i % 2) * 0.15, 0.5, Math.sin(a) * r, 0.1, Math.cos(a) * r * 1.4, [0x5a6a38, 0x6a7040, 0x4e5a30][i % 3])); }
    for (let i = 0; i < 4; i++) P.push(B(0.25 + (i % 2) * 0.15, 0.18, 0.3, -1.5 + i * 1.1, 0.08, 2.2 - (i % 2) * 2.6, 0x7a766c));
    P.push(B(0.12, 2.0, 0.12, -1.6, 0.9, -2.4, 0x3a2c20, { rz: 0.25 }), B(0.12, 1.6, 0.12, 1.4, 0.7, -2.6, 0x3a2c20, { rz: -0.4 }));
    for (let i = 0; i < 3; i++) P.push(B(2.2, 0.05, 0.25, 0.2 - i * 0.4, 0.06 + i * 0.05, 0.8 + i * 0.35, 0x5a4a36, { ry: 0.3 * i - 0.2, rz: 0.05 }));
    // 通り沿いに低い竹の柵（ここは空き地）
    for (let i = 0; i < 6; i++) P.push(C(0.025, 0.025, 0.9, -it.w / 2 + 0.4 + i * (it.w - 0.8) / 5, 0.45, ctx.D / 2 - 0.2, 0x8a8a5a, 5));
    P.push(C(0.02, 0.02, it.w - 0.6, 0, 0.75, ctx.D / 2 - 0.2, 0x8a8a5a, 5, { rz: Math.PI / 2 }));
    put(rt, P, it.x, it.z, it.rot);
    solidRect(it.x, it.z, it.w, ctx.D - 1, it.rot);
  }
  // ---- 表の家の提灯（夕刻から灯る。town_air.js） ----
  const every = lv >= 2 ? 1 : lv === 1 ? 3 : 0;
  if (every) front.forEach((it, i) => {
    if (pick.includes(it) || i % every) return;
    const s = it.rot > 0 ? 1 : -1;
    ctx.chochin(rt, it.x + s * (ctx.D / 2 + 0.35), 2.45, it.z + it.w / 2 - 0.7);
  });
  // ---- 提灯の綱（通りの上に渡す） ----
  const ropes = lv >= 4 ? [-62, -30, 2] : lv >= 3 ? [-30] : [];
  for (const z of ropes) {
    const P = [];
    for (const s of [-1, 1]) P.push(C(0.07, 0.08, 4.6, s * 4.2, 2.3, 0, 0x3a2c20, 6));
    P.push(C(0.012, 0.012, 8.4, 0, 4.25, 0, 0x2a2018, 4, { rz: Math.PI / 2 }));
    put(rt, P, 0, z, 0);
    for (const s of [-1, 1]) solidCircle(s * 4.2, z, 0.12);
    for (let i = 0; i < 7; i++) { const x = -3.3 + i * 1.1, sag = 0.25 * (1 - (x / 4.2) ** 2); ctx.chochin(rt, x, 3.95 - sag, z); }
  }
  // ---- 商家の幟と、織田の幟（大将の町） ----
  if (lv >= 4) {
    const zs = low ? [-66, -40, -14, 12] : [-68, -52, -40, -26, -12, 4, 18];
    zs.forEach((z, i) => rt.scene.add(ctx.nobori(W, (i % 2 ? 1 : -1) * 4.0, z, 'oda', 4.4)));
  }
  // ---- 白い土蔵（東の裏の並びの向こう。屋根越しに白壁と瓦が見える） ----
  const kura = lv >= 4 ? [[34.8, -10], [34.8, 2], [34.8, 14]] : lv >= 3 ? [[34.8, -10], [34.8, 8]] : [];
  for (const [x, z] of kura) {
    const P = [B(4.4, 4.6, 5.2, 0, 2.3, 0, 0xe8e2d4), B(4.5, 1.0, 5.3, 0, 0.5, 0, 0x34363a)];
    for (let i = 0; i < 5; i++) P.push(B(4.52, 0.04, 0.04, 0, 0.2 + i * 0.2, 2.66, 0xd8d4c8));
    for (const [z1, sd] of [[3.1, 1], [-3.1, -1]]) { const dz = 3.1, ang = Math.atan2(1.3, dz); P.push(B(5.0, 0.18, Math.hypot(dz, 1.3) + 0.1, 0, 5.25, z1 / 2, 0x3e4044, { rx: sd * ang })); }
    P.push(B(5.2, 0.32, 0.4, 0, 5.95, 0, 0x2e3034), B(0.9, 0.9, 0.08, 0, 3.6, 2.62, 0x2a2420));
    put(rt, P, x, z, Math.PI / 2);
    solidRect(x, z, 4.6, 5.4, Math.PI / 2);
  }
}

// 遠い家：板壁の箱に板屋根の三角。近寄れば素朴な家、遠くからは屋根の連なり
function farTown(rt, low) {
  const W = rt.world;
  const g = [B(5, 2.6, 4.2, 0, 1.3, 0, 0x6e5a44), B(5.1, 0.4, 4.3, 0, 0.2, 0, 0x4a3e30)];
  const roof = new THREE.BufferGeometry();
  const w = 3.0, d = 2.6, y0 = 2.6, y1 = 4.1;
  const v = [-w, y0, -d, w, y0, -d, w, y1, 0, -w, y0, -d, w, y1, 0, -w, y1, 0, -w, y0, d, -w, y1, 0, w, y1, 0, -w, y0, d, w, y1, 0, w, y0, d,
    -2.5, y0, -2.1, -2.5, y1 - 0.15, 0, -2.5, y0, 2.1, 2.5, y0, 2.1, 2.5, y1 - 0.15, 0, 2.5, y0, -2.1];
  roof.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  roof.computeVertexNormals();
  const col = new Float32Array(v.length), c1 = new THREE.Color(0x5a554c), c2 = new THREE.Color(0x6e5a44);
  for (let i = 0; i < v.length / 3; i++) { const c = i < 12 ? c1 : c2; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  roof.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const geo = mergeGeometries([...g, roof]);
  const pts = [];
  const grove = [[-90, 40, 30], [90, -20, 30], [-80, -60, 24], [70, 90, 30], [-60, 110, 28]];
  const free = (x, z) => !grove.some(([gx, gz, r]) => Math.hypot(x - gx, z - gz) < r + 4) && !pts.some((p) => Math.hypot(p[0] - x, p[1] - z) < 7);
  let s = 7;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // 門の外の街道沿い（両側に並ぶ）
  for (let z = -92; z > (low ? -150 : -190); z -= 7.5 + R() * 2) for (const sd of [-1, 1]) if (R() > 0.15) { const x = sd * (10 + R() * 3); if (free(x, z)) pts.push([x, z, sd < 0 ? Math.PI / 2 : -Math.PI / 2]); }
  // 東西の外れ（ばらけた集落）
  const n = low ? 40 : 80;
  for (let i = 0; i < n * 3 && pts.length < n + 30; i++) {
    const sd = R() < 0.5 ? -1 : 1, x = sd * (70 + R() * 70), z = -100 + R() * 220;
    if (free(x, z)) pts.push([x, z, R() * 6.28]);
  }
  const im = new THREE.InstancedMesh(geo, mat(), pts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  pts.forEach(([x, z, r], i) => {
    const k = 0.85 + R() * 0.35;
    p.set(x, W.heightAt(x, z) - 0.15, z); q.setFromAxisAngle(up, r); sc.set(k, 0.9 + R() * 0.2, k);
    im.setMatrixAt(i, m4.compose(p, q, sc)); im.setColorAt(i, c.setScalar(0.8 + R() * 0.3));
    solidRect(x, z, 5.2 * k, 4.4 * k, r);
  });
  im.castShadow = !low; im.receiveShadow = true;
  rt.scene.add(im);
}

// ======================================================================
// 暮らす人：一人ずつ用（道順）を持つ。ctx：{ dress, dusk, folk }
// 道順の一歩：{ x, z, w 待つ秒, face 向き, act 'hammer'|'draw'|'buy'|'sweep'|'pray' }
// ======================================================================
const LINES = {
  water: ['井戸の水は冷とうて、うまいぞ', '朝と夕に水を汲むのが、わしの務めでな'],
  shopper: ['今日は塩が安い。戦の前に買うておかねば', '楽市になって、座に銭を取られんようになった'],
  smith: ['槍の穂は、焼きと鍛えで決まる', '近頃は鉄砲の注文ばかりじゃ'],
  monk: ['南無……。戦に出る方の無事を祈っております', '鐘は朝と夕に撞きます'],
  kid: ['鬼ごっこじゃ！　お侍さまも混ざるか？', 'あの犬、足が速いんじゃ'],
  watch: ['火の用心。夜は辻に気をつけなされ', '拍子木を打って回るのが、夜回りの役目で'],
  groom: ['馬は朝に歩かせると、機嫌がよい', '借り馬なら馬屋の前の杭につないでありますぞ'],
  drunk: ['いや……今宵は、呑み過ぎたようじゃ', 'お主も一杯どうじゃ……いや、戦の前はよさぬか', '明日の事は、明日の身体に聞くとしよう'],
  soba: ['温こいのが、冷えた身体に効きますぞ', '夜更けに歩くお方は、たいていここへ寄りなさる'],
  sobakyaku: ['この刻に食う蕎麦は、格別でござる', '夜回りの帰りに、つい寄ってしまいましてな'],
};
const ROLE_N = { water: '水汲み', shopper: '町の女', smith: '鍛冶', monk: '僧', kid: '子ども', watch: '夜回り', groom: '馬方', drunk: '酔った侍', soba: '夜鳴きそば', sobakyaku: '客' };
// いる刻（0 朝・1 昼・2 夕刻・3 夜）。無い役は一日じゅう。傘をさす役
const WHEN = { water: [0, 1, 2], shopper: [0], smith: [1, 2], monk: [0, 1, 2], kid: [1, 2], groom: [0, 1, 2], watch: [2, 3], drunk: [2, 3], soba: [3], sobakyaku: [3] };
const UMB = new Set(['water', 'shopper', 'monk', 'groom', 'watch']);
const BUMP = ['危ないのう！', 'どこを見て歩いとる', 'おっと……お侍さま、気をつけなされ', 'わっ、押さんでくだされ'];

export function lifePeople(rt, ctx) {
  const F = rt.flags, L = F.life;
  if (!L) return;
  const low = SETTINGS.quality === 'low';
  L.npc = []; L.dogs = []; L.bumpT = -9; L.bellT = 20; L.knockT = 0;
  const S = L.spots;
  const one = (role, x, z, h, o = {}) => {
    const g = allyGroup(rt, { name: ROLE_N[role], anchor: { x, z }, facing: h, order: 'hold', noRout: true, width: 1, speed: o.speed || 1.1, march: false, aggro: 0, seekRange: 0 },
      [{ type: o.type || 'porter', n: 1, o: { flag: null, invuln: true, weapon: 'none' } }]);
    const u = g.units[0];
    if (!u) return null;
    ctx.dress(rt, u, o.kind || 'townsman', o.i || 0);
    u.name = ROLE_N[role];
    const P = { g, u, role, route: o.route || null, k: 0, waitT: o.wait ?? 1, talkT: 0, said: 0, act: null, actT: 0, chase: o.chase || null, when: WHEN[role] || null, umbOk: UMB.has(role), home: { x, z } };
    L.npc.push(P);
    rt.addInteract('life-' + role + L.npc.length, () => (u.alive && !P.away ? { x: u.pos.x, z: u.pos.z } : null), `話す　${ROLE_N[role]}`, () => {
      P.talkT = 4; P.g.order = 'hold'; P.g.dest = null; P.g.anchor = { x: u.pos.x, z: u.pos.z };
      u.heading = Math.atan2(rt.player.u.pos.x - u.pos.x, rt.player.u.pos.z - u.pos.z); P.g.facing = u.heading;
      const Ls = LINES[role]; rt.say(ROLE_N[role], Ls[(P.said++) % Ls.length], 3.5);
    }, { r: 2.2 });
    return P;
  };
  // 鍛冶：金床で槌を打ち続ける（昼も夕も）
  if (S.anvil) one('smith', S.anvil.x, S.anvil.z, S.anvil.face, { kind: 'townsman', i: 61, route: [{ x: S.anvil.x, z: S.anvil.z, w: 9999, face: S.anvil.face, act: 'hammer' }] });
  {
    // 水汲み：家と井戸の間を行き来する
    one('water', -2.5, -30, 0, { kind: 'townsman', i: 62, route: [{ x: 17, z: -18.6, w: 5, face: Math.PI, act: 'draw' }, { x: 2.6, z: -27, w: 3 }, { x: -3.2, z: -44, w: 4 }, { x: 2.6, z: -27, w: 1 }] });
    // 市の買い物：店から店へ、店先で品を選ぶ
    one('shopper', 10.5, -46, Math.PI / 2, { kind: 'merchant', i: 63, route: [{ x: 10.8, z: -46, w: 5, face: Math.PI / 2, act: 'buy' }, { x: 25.3, z: -40, w: 4, face: -Math.PI / 2, act: 'buy' }, { x: 10.8, z: -34, w: 6, face: Math.PI / 2, act: 'buy' }, { x: 18, z: -28.2, w: 4, face: Math.PI, act: 'buy' }, { x: 2.5, z: -36, w: 2 }] });
    if (!low) one('shopper', 25.3, -32, -Math.PI / 2, { kind: 'elder', i: 64, route: [{ x: 25.3, z: -32, w: 6, face: -Math.PI / 2, act: 'buy' }, { x: 10.8, z: -40, w: 5, face: Math.PI / 2, act: 'buy' }, { x: 18, z: -21.5, w: 3 }, { x: 25.3, z: -46, w: 5, face: -Math.PI / 2, act: 'buy' }] });
    // 寺の僧：境内を掃き、鐘楼の前で手を合わせる
    one('monk', 47, -36, 0, { kind: 'elder', i: 65, speed: 0.8, route: [{ x: 47.5, z: -35, w: 6, act: 'sweep' }, { x: 47.5, z: -42, w: 6, act: 'sweep' }, { x: 46.5, z: -45.2, w: 5, face: Math.PI, act: 'pray' }, { x: 51, z: -33, w: 5, act: 'sweep' }] });
    // 子ども二人の鬼ごっこ：一人が逃げ、一人が追う。犬が付いて走る
    const kidA = one('kid', 16, -36, 0, { kind: 'kid', i: 66, speed: 1.7, route: [{ x: 16, z: -36, w: 1.5 }, { x: 20, z: -50, w: 1 }, { x: 18, z: -22, w: 2 }, { x: 5.5, z: -30, w: 1 }, { x: 22, z: -44, w: 1.5 }, { x: 15, z: -58, w: 1 }] });
    if (kidA) { kidA.u.kid = true; const kidB = one('kid', 14, -40, 0, { kind: 'kid', i: 67, speed: 1.75, chase: kidA }); if (kidB) kidB.u.kid = true; L.dogs.push(makeDog(rt, 15, -38, 0x8a6a40, kidA)); }
    // 馬方：馬屋の前を、馬の世話に行き来する
    one('groom', 9.6, -12, Math.PI, { kind: 'townsman', i: 68, route: [{ x: 9.4, z: -11.5, w: 6, face: Math.PI / 2 }, { x: 9.4, z: -2, w: 6, face: Math.PI / 2 }, { x: 18.5, z: -14.5, w: 4, face: Math.PI / 2, act: 'draw' }] });
  }
  {
    // 夕刻と夜：夜回りが拍子木を打って通りを上り下りする（提灯を下げる）。昼は家にいる（town_air.js が出し入れする）
    const w = one('watch', 0.8, -70, 0, { kind: 'townsman', i: 69, speed: 0.85, route: [{ x: 0.8, z: -70, w: 2 }, { x: 0.8, z: -30, w: 1 }, { x: 0.8, z: 24, w: 2 }, { x: -1, z: -22, w: 1 }] });
    if (w) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe8d6b0, emissive: 0xff9a40, emissiveIntensity: 1.6 }));
      lamp.position.set(0.32, 0.75, 0.25); lamp.scale.set(1, 1.3, 1);
      w.u.mesh.add(lamp); w.lamp = true;
    }
    // 宿の前で寝そべる犬（人が走って来ると起きて吠える）。夜も町にいる
    L.dogs.push(makeDog(rt, -4.4, -54, 0x3a3028, null));
    // 夜の野良犬：辻をうろつく（夕刻から）
    if (!low) { const d = makeDog(rt, 14, 28, 0x6a5a48, null); d.when = [2, 3]; d.lie = false; L.dogs.push(d); }
  }
  {
    // 夜：宿の酒樽のそばで一杯やる、酔うた侍（居酒屋がわり）。夜鳴きそばの屋台には主と客が一人
    if (S.izakaya) one('drunk', S.izakaya.x, S.izakaya.z, S.izakaya.face, { kind: 'samurai', i: 70, speed: 0.7, route: [{ x: S.izakaya.x, z: S.izakaya.z, w: 7 }, { x: S.izakaya.x + 1.4, z: S.izakaya.z - 1.0, w: 5 }, { x: S.izakaya.x - 0.7, z: S.izakaya.z + 1.3, w: 5 }] });
    if (S.soba) {
      one('soba', S.soba.x, S.soba.z, S.soba.face, { kind: 'townsman', i: 73, route: [{ x: S.soba.x, z: S.soba.z, w: 9999, face: S.soba.face }] });
      if (!low) one('sobakyaku', S.soba.x + 1.1, S.soba.z + 0.6, S.soba.face + Math.PI, { kind: 'townsman', i: 74, route: [{ x: S.soba.x + 1.1, z: S.soba.z + 0.6, w: 9999, face: S.soba.face + Math.PI }] });
    }
  }
  // 馬屋の馬は借りて乗れる（降りればその場で待つ）
  const LH = rt.army.looseHorses || (rt.army.looseHorses = []);
  for (const h of F.stableHorses || []) {
    LH.push({ h, heading: h.rotation.y, spd: 0, t: 99, kept: true, calm: true, from: { team: rt.player.u.team, house: '', name: '' },
      stats: { horse: h, name: '馬屋の借り馬', speed: 0.96, max: 150, hp: 150, maxBreath: 100, breath: 100, yariResist: 1, warned: true, spoil: null } });
  }
  // 店先で買う（市の売り手のいない台）
  const shop = (id, x, z, label, cost, fn, say) => rt.addInteract('buy-' + id, { x, z }, `買う　${label}（${Math.round(cost * 1000)}文）`, () => {
    const G = rt.G;
    if ((G.kan || 0) < cost) { rt.say('売り手', '銭が足りませぬな。またどうぞ', 3); return; }
    G.kan = Math.round((G.kan - cost) * 1000) / 1000;
    fn(); rt.say('売り手', say, 3.5);
  }, { r: 1.8 });
  const pl = rt.player;
  shop('dango', 10.8, -46, '団子　息が戻る', 0.005, () => { if (pl.breath != null) pl.breath = pl.maxBreath || 100; }, 'まいど。甘い物で、息がつけましょう');
  shop('kusuri', 10.8, -34, '膏薬　傷が癒える', 0.03, () => { const u = pl.u; if (u.maxHp) u.hp = u.maxHp; }, '金創の膏薬じゃ。よう効きますぞ');
  rt.addInteract('buy-market', { x: 18, z: -28.2 }, '市で買う・収穫を売る', () => townTrade(rt), { r: 2.2 });
  // 夜鳴きそば：夜だけ買える（息が戻る）
  if (S.soba) rt.addInteract('buy-soba', () => (rt.flags.air && rt.flags.air.ph >= 3 ? { x: S.soba.x + 0.7, z: S.soba.z } : null), '買う　夜鳴きそば（8文）　息が戻る', () => {
    const G = rt.G;
    if ((G.kan || 0) < 0.008) { rt.say('夜鳴きそば', '銭が足りませぬな。またどうぞ', 3); return; }
    G.kan = Math.round((G.kan - 0.008) * 1000) / 1000;
    if (pl.breath != null) pl.breath = pl.maxBreath || 100;
    rt.say('夜鳴きそば', '温いのを、どうぞ。夜回り、お気をつけて', 3.5);
  }, { r: 2.2 });
  // 高札・寺・鐘楼
  if (S.kosatsu) rt.addInteract('kosatsu', S.kosatsu, '読む　高札', () => rt.say('高札', '定　この町は楽市とする。押し買い・狼藉・喧嘩口論を禁ず。背く者は成敗する', 5), { r: 2.4 });
  if (S.temple) rt.addInteract('tera', S.temple, '参る　寺', () => {
    if (!F.teraPrayed) { F.teraPrayed = true; if (pl.breath != null) pl.breath = pl.maxBreath || 100; if (pl.u.maxHp) pl.u.hp = pl.u.maxHp; rt.say('', '本堂に手を合わせた。心が静まった', 3.5); }
    else rt.say('', '線香の匂いがする。静かな寺だ', 3);
  }, { r: 3 });
  if (S.bell) rt.addInteract('kane', { x: S.bell.x + 1.6, z: S.bell.z }, '撞く　鐘', () => { rt.army.play('bell', S.bell, 1); L.bellT = 60; }, { r: 2.2 });
}

// ---- 犬：箱を組んだ軽い形。脚を振って走り、尾を振る。追う相手がいればその後を ----
let DOG = null;
export function makeDog(rt, x, z, hex, follow) {
  if (!DOG) DOG = { leg: (() => { const g = new THREE.BoxGeometry(0.09, 0.36, 0.09); g.translate(0, -0.18, 0); return g; })() };
  const body = [B(0.3, 0.3, 0.72, 0, 0.5, 0, hex), B(0.24, 0.24, 0.28, 0, 0.66, 0.44, hex), B(0.13, 0.12, 0.2, 0, 0.6, 0.64, hex), B(0.06, 0.05, 0.05, 0, 0.64, 0.75, 0x141210),
    B(0.06, 0.12, 0.04, -0.08, 0.83, 0.42, hex), B(0.06, 0.12, 0.04, 0.08, 0.83, 0.42, hex)];
  const grp = new THREE.Group();
  const m = new THREE.Mesh(mergeGeometries(body), mat()); m.castShadow = true; grp.add(m);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3).translate(0, 0, -0.15), new THREE.MeshStandardMaterial({ color: hex, roughness: 1 }));
  tail.position.set(0, 0.6, -0.36); tail.rotation.x = -0.7; grp.add(tail);
  const legMat = new THREE.MeshStandardMaterial({ color: hex, roughness: 1 });
  const legs = [[-0.1, 0.27], [0.1, 0.27], [-0.1, -0.27], [0.1, -0.27]].map(([lx, lz]) => { const l = new THREE.Mesh(DOG.leg, legMat); l.position.set(lx, 0.36, lz); grp.add(l); return l; });
  grp.position.set(x, rt.world.heightAt(x, z), z);
  rt.scene.add(grp);
  return { grp, legs, tail, x, z, h: 0, spd: 0, ph: Math.random() * 6, follow, home: { x, z }, barkT: 0, tgt: null, tT: 0, lie: !follow };
}
function dogTick(rt, d, dt) {
  // 追う子が家に入った・その刻にいない犬は見せない
  const A = rt.flags.air;
  const hide = (d.follow && d.follow.away) || (d.when && A && !d.when.includes(A.ph));
  d.grp.visible = !hide;
  if (hide) return;
  const p = rt.player.u.pos, pv = rt.player.u.vel || { x: 0, z: 0 };
  const dp = Math.hypot(p.x - d.x, p.z - d.z), run = Math.hypot(pv.x, pv.z) > 3;
  d.barkT -= dt; d.tT -= dt;
  let tx = d.x, tz = d.z, want = 0;
  if (d.follow && d.follow.u.alive) {
    const f = d.follow.u.pos, df = Math.hypot(f.x - d.x, f.z - d.z);
    if (df > 1.6) { tx = f.x - 0.9; tz = f.z - 0.9; want = Math.min(5.5, df * 1.6); }
  } else {
    // 寝そべって、たまに起きて歩く。走って来る人には起きて吠える
    if (d.lie && dp < 7 && run) { d.lie = false; d.tT = 4; }
    if (!d.lie) {
      if (!d.tgt || d.tT <= 0) { d.tgt = { x: d.home.x + (Math.random() - 0.5) * 6, z: d.home.z + (Math.random() - 0.5) * 8 }; d.tT = 3 + Math.random() * 3; if (Math.random() < 0.3) d.lie = true; }
      tx = d.tgt.x; tz = d.tgt.z; want = Math.hypot(tx - d.x, tz - d.z) > 0.6 ? 1.6 : 0;
    }
  }
  if (dp < 6 && run && d.barkT <= 0) { d.barkT = 2.5 + Math.random() * 2; rt.army.play('dog', { x: d.x, z: d.z }, 0.8); }
  d.spd += (want - d.spd) * Math.min(1, dt * 4);
  if (d.spd > 0.05) {
    const hh = Math.atan2(tx - d.x, tz - d.z);
    let da = hh - d.h; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    d.h += da * Math.min(1, dt * 6);
    d.x += Math.sin(d.h) * d.spd * dt; d.z += Math.cos(d.h) * d.spd * dt;
  }
  d.ph += dt * (2 + d.spd * 3.2);
  const sw = Math.min(0.9, d.spd * 0.2) * Math.sin(d.ph);
  d.legs[0].rotation.x = sw; d.legs[3].rotation.x = sw; d.legs[1].rotation.x = -sw; d.legs[2].rotation.x = -sw;
  d.tail.rotation.y = Math.sin(d.ph * 2.2) * (d.lie ? 0.15 : 0.5);
  const lie = d.lie && d.spd < 0.1;
  d.grp.position.set(d.x, rt.world.heightAt(d.x, d.z) + (lie ? -0.3 : Math.abs(Math.sin(d.ph)) * 0.03 * Math.min(1, d.spd)), d.z);
  for (const l of d.legs) l.visible = !lie;
  d.grp.rotation.y = d.h;
}

// ---- 毎コマ：用を進める・ぶつかりを避ける・音 ----
export function lifeTick(rt, dt) {
  const F = rt.flags, L = F.life;
  if (!L || !L.npc) return;
  const pu = rt.player.u, pv = pu.vel || { x: 0, z: 0 }, pspd = Math.hypot(pv.x, pv.z), bumpR = rt.player.mounted ? 3.2 : 1.1;   // 馬で駆けて来れば、早めに飛びのく
  for (const P of L.npc) {
    const u = P.u;
    if (!u || !u.alive || P.away || P.busy) continue;
    const g = P.g;
    // ぶつかり：走って来た人を避け、文句を言う（言うのは 8 秒に一度まで）
    const dx = u.pos.x - pu.pos.x, dz = u.pos.z - pu.pos.z, d = Math.hypot(dx, dz);
    if (d < bumpR && pspd > 2.2 && !P.act) {
      const k = 1.6 / (d || 1);
      g.order = 'move'; g.dest = { x: u.pos.x + dx * k, z: u.pos.z + dz * k }; P.stepT = 1.2;
      if (rt.t - L.bumpT > 8) { L.bumpT = rt.t; rt.say(ROLE_N[P.role], BUMP[Math.floor(Math.random() * BUMP.length)], 2.2); }
      continue;
    }
    if (P.stepT > 0) { P.stepT -= dt; if (P.stepT <= 0) { g.order = 'hold'; g.dest = null; g.anchor = { x: u.pos.x, z: u.pos.z }; P.waitT = 0.5; } continue; }
    if (P.talkT > 0) { P.talkT -= dt; continue; }
    // 追う子ども：逃げる子の後ろへ
    if (P.chase) {
      const c = P.chase.u.pos, dc = Math.hypot(c.x - u.pos.x, c.z - u.pos.z);
      P.waitT -= dt;
      if (P.waitT <= 0) { P.waitT = 0.5; if (dc > 1.4) { g.order = 'move'; g.dest = { x: c.x, z: c.z }; g.facing = Math.atan2(c.x - u.pos.x, c.z - u.pos.z); } else { g.order = 'hold'; g.dest = null; g.anchor = { x: u.pos.x, z: u.pos.z }; } }
      continue;
    }
    const R = P.route;
    if (!R) continue;
    const st = R[P.k % R.length];
    if (g.order === 'move' && g.dest) {
      if (Math.hypot(u.pos.x - g.dest.x, u.pos.z - g.dest.z) < 0.9) {
        g.order = 'hold'; g.anchor = { x: g.dest.x, z: g.dest.z }; g.dest = null; P.waitT = st.w * (0.8 + Math.random() * 0.4); P.act = st.act || null; P.h0 = null;
        if (st.face != null) { g.facing = st.face; u.heading = st.face; }
      }
      continue;
    }
    // その場の動き
    if (P.act) act(rt, P, dt);
    P.waitT -= dt;
    if (P.waitT > 0) continue;
    P.act = null;
    if (R.length < 2) { P.waitT = 9999; P.act = st.act || null; P.h0 = null; continue; }
    P.k = (P.k + 1) % R.length;
    const nx = R[P.k];
    g.order = 'move'; g.dest = { x: nx.x, z: nx.z }; g.facing = Math.atan2(nx.x - u.pos.x, nx.z - u.pos.z);
  }
  // 元からの町の人（通りを歩く人）も、走ってぶつかれば脇へよけて文句を言う
  for (const P of F.folk || []) {
    const u = P.u;
    if (!u || !u.alive || P.fixed || P.talkT > 0 || P.away || P.busy) continue;
    const dx = u.pos.x - pu.pos.x, dz = u.pos.z - pu.pos.z, d = Math.hypot(dx, dz);
    if (d < bumpR && pspd > 2.2) {
      const k = 1.8 / (d || 1);
      P.g.order = 'move'; P.g.dest = { x: u.pos.x + dx * k, z: u.pos.z + dz * k };
      if (rt.t - L.bumpT > 8) { L.bumpT = rt.t; rt.say(u.name || '町人', BUMP[Math.floor(Math.random() * BUMP.length)], 2.2); }
    }
  }
  for (const dgo of L.dogs) dogTick(rt, dgo, dt);
  // 夕刻の夜回りの拍子木（近い時だけ）
  const watch = L.watchP !== undefined ? (L.watchP && !L.watchP.away ? L.watchP : null) : (L.watchP = L.npc.find((P) => P.lamp) || null, L.watchP && !L.watchP.away ? L.watchP : null);   // 夜回りは一度だけ探す
  if (watch) { L.knockT -= dt; if (L.knockT <= 0) { L.knockT = 6; const w = watch.u.pos; if (Math.hypot(w.x - pu.pos.x, w.z - pu.pos.z) < 40) { rt.army.play('hyoshigi', w, 0.9); rt.after(0.3, () => rt.army.play('hyoshigi', w, 0.9)); } } }
  // 寺の鐘：近くにいれば、ときどき撞かれる
  if (L.spots.bell) { L.bellT -= dt; if (L.bellT <= 0) { L.bellT = 75; const b = L.spots.bell; if (Math.hypot(b.x - pu.pos.x, b.z - pu.pos.z) < 60) rt.army.play('bell', b, 0.5); } }
}
function act(rt, P, dt) {
  const u = P.u, pu = rt.player.u;
  P.actT -= dt;
  if (P.actT > 0) return;
  const near = Math.hypot(u.pos.x - pu.pos.x, u.pos.z - pu.pos.z);
  if (P.act === 'hammer') {
    // 槌を振り下ろす：体を前へ、火花と金の音
    P.actT = 0.75 + Math.random() * 0.25;
    u.strikeT = 0.2;
    const fx = u.pos.x + Math.sin(u.heading) * 0.6, fz = u.pos.z + Math.cos(u.heading) * 0.6;
    if (near < 30) {
      rt.after(0.12, () => { rt.army.play(Math.random() < 0.7 ? 'clank' : 'kin', { x: fx, z: fz }, near < 10 ? 1.4 : 0.8); if (rt.army.spark) rt.army.spark(fx, rt.world.heightAt(fx, fz) + 0.72, fz, 5); });
    }
  } else if (P.act === 'draw') {
    // 釣瓶を引く：腰をかがめる動きをくり返す
    P.actT = 1.1; u.strikeT = 0.2;
    if (near < 14) rt.army.play('wood', u.pos, 0.25);
  } else if (P.act === 'buy') {
    // 品を手に取って見る
    P.actT = 1.8 + Math.random(); if (P.h0 == null) P.h0 = u.heading; u.heading = P.h0 + (Math.random() - 0.5) * 0.6;   // 向きがだんだんずれていかないよう、元の向きの回りで振る
  } else if (P.act === 'sweep') {
    // 竹箒で掃く：少しずつ向きを変えて
    P.actT = 0.9; u.strikeT = 0.2; if (P.h0 == null) P.h0 = u.heading; u.heading = P.h0 + (Math.random() - 0.5) * 1.0;
    if (near < 12) rt.army.play('stepSand', u.pos, 0.35);
  } else if (P.act === 'pray') P.actT = 99;
}
