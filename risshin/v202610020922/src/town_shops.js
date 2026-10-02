// ======================================================================
// 中へ入れる店（kaito 10/2 二回目 ②）：具足屋・茶屋・鍛冶屋
// 町家の箱でなく、壁と屋根と土間を一つずつ組んだ建物。戸口から歩いて入り、中で買う・話す・休む。
//   壁と屋根はカメラの寄せ（camBlock）にし、中ではカメラを少し近づける（狭い所で壁の向こうを映さない）。
//   形は頂点の色の一つの材質（town_life.js の B・C・put）。town3d.js の mergeStatic が場所ごとにまとめる。
// 向き：建物の前（戸口の側）が local +z。rot は町家と同じ（西の並び π/2・東の並び -π/2）。
// ======================================================================
import * as THREE from 'three';
import { solidRect, solidSeg, solidCircle } from './props.js';
import { allyGroup } from './bhelp.js';
import { B, C, put, colorize } from './town_life.js';
import { setPhase } from './town_air.js';

const WALL = 0x5a4634, POST = 0x3a2c20, ROOF = 0x4c463c, EARTH = 0x4e4436, BOARD = 0x7a6248, IRON = 0x2a2622, GOLD = 0xc9a24a;
let INLAMP = null, GLOW = null;
const inlamp = () => INLAMP || (INLAMP = new THREE.MeshStandardMaterial({ color: 0xeadcc0, emissive: 0xffb060, emissiveIntensity: 1.1, roughness: 0.8 }));
const glowMat = () => GLOW || (GLOW = new THREE.MeshStandardMaterial({ color: 0x401000, emissive: 0xff5a10, emissiveIntensity: 2.2 }));

function frame(o) {
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  return {
    w: (lx, lz) => ({ x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c }),
    loc: (x, z) => { const dx = x - o.x, dz = z - o.z; return { x: dx * c - dz * s, z: dx * s + dz * c }; },
  };
}
// 妻の三角（屋根の下の壁）：local x の位置に、厚さ 0.14 の三角の板
function gable(x, zb, zf, y0, r0, ry, hex) {
  const sh = new THREE.Shape();
  sh.moveTo(-zb, y0); sh.lineTo(-zf, y0); sh.lineTo(-r0, ry); sh.lineTo(-zb, y0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false });
  g.translate(0, 0, -0.07); g.rotateY(Math.PI / 2); g.translate(x, 0, 0);
  g.deleteAttribute('uv');
  return colorize(g.index ? g.toNonIndexed() : g, hex);
}

// ---- 建物の殻：壁・柱・屋根・土間。o：{ x, z, rot, w, d, H, open: [a, b]（前の口の左右）か 'all', raised: 奥の板の間の奥行き } ----
function shell(rt, o) {
  const F = frame(o), { w, d, H } = o;
  const P = [], In = [];
  const t = 0.16;
  P.push(B(w, H + 0.3, t, 0, H / 2 - 0.15, -d / 2, WALL));
  for (const s of [-1, 1]) P.push(B(t, H + 0.3, d, s * w / 2, H / 2 - 0.15, 0, WALL));
  // 前：口の左右は板壁（下は腰板・上は格子窓）、口の上は鴨居と小壁
  const [a, b] = o.open === 'all' ? [-w / 2, w / 2] : o.open;
  if (a > -w / 2 + 0.05) { const ww = a + w / 2; P.push(B(ww, 1.0, t, -w / 2 + ww / 2, 0.35, d / 2, WALL), B(ww, 0.9, t, -w / 2 + ww / 2, H - 0.3, d / 2, WALL)); for (let x = -w / 2 + 0.12; x < a - 0.05; x += 0.14) P.push(B(0.05, 1.2, 0.05, x, 1.45, d / 2, POST)); }
  if (b < w / 2 - 0.05) { const ww = w / 2 - b; P.push(B(ww, 1.0, t, b + ww / 2, 0.35, d / 2, WALL), B(ww, 0.9, t, b + ww / 2, H - 0.3, d / 2, WALL)); for (let x = b + 0.07; x < w / 2 - 0.05; x += 0.14) P.push(B(0.05, 1.2, 0.05, x, 1.45, d / 2, POST)); }
  P.push(B(w + 0.1, 0.22, 0.24, 0, H - 0.05, d / 2 + 0.02, POST));
  if (o.open !== 'all') P.push(B(b - a, H - 2.35, t, (a + b) / 2, (H + 2.35) / 2, d / 2, WALL));
  for (const [x, z] of [[-w / 2, d / 2], [w / 2, d / 2], [-w / 2, -d / 2], [w / 2, -d / 2], ...(o.open === 'all' ? [[-w / 6, d / 2], [w / 6, d / 2]] : [[a, d / 2], [b, d / 2]])]) P.push(B(0.22, H + 0.4, 0.22, x, H / 2 - 0.1, z, POST));
  // 屋根：棟は奥寄り、前の軒は通りへ張り出す（板葺きに押さえの竹）
  const r0 = -d * 0.08, ry = H + 1.5, fz = d / 2 + 1.0, bz = -d / 2 - 0.6;
  for (const [z1, sd] of [[fz, 1], [bz, -1]]) {
    const dz = Math.abs(z1 - r0), len = Math.hypot(dz, ry - H), ang = Math.atan2(ry - H, dz);
    P.push(B(w + 0.9, 0.14, len + 0.1, 0, (ry + H) / 2, (r0 + z1) / 2, ROOF, { rx: sd * ang }));
    for (const k of [0.35, 0.75]) P.push(C(0.05, 0.05, w + 0.7, 0, ry + (H - ry) * k + 0.1, r0 + (z1 - r0) * k, 0x5a5444, 5, { rz: Math.PI / 2 }));
  }
  P.push(B(w + 1.0, 0.2, 0.34, 0, ry + 0.06, r0, POST));
  for (const s of [-1, 1]) P.push(gable(s * w / 2, -d / 2, d / 2, H + 0.15, r0, ry - 0.05, 0x6e5a44));
  const m = put(rt, P, o.x, o.z, o.rot);
  if (m) m.userData.camBlock = true;
  // 土間と、奥の板の間（上がれない。品を並べる）
  In.push(B(w - 0.2, 0.14, d - 0.2, 0, 0.05, 0, EARTH));
  if (o.raised) In.push(B(w - 0.3, 0.42, o.raised, 0, 0.21, -d / 2 + o.raised / 2 + 0.1, BOARD), B(w - 0.3, 0.1, 0.1, 0, 0.42, -d / 2 + o.raised + 0.1, POST));
  put(rt, In, o.x, o.z, o.rot, { shadow: false });
  // 当たり：壁（口は空ける）と板の間
  const seg = (x0, z0, x1, z1) => { const p = F.w(x0, z0), q = F.w(x1, z1); solidSeg(p.x, p.z, q.x, q.z, 0.12); };
  seg(-w / 2, -d / 2, w / 2, -d / 2); seg(-w / 2, -d / 2, -w / 2, d / 2); seg(w / 2, -d / 2, w / 2, d / 2);
  if (a > -w / 2 + 0.05) seg(-w / 2, d / 2, a, d / 2);
  if (b < w / 2 - 0.05) seg(b, d / 2, w / 2, d / 2);
  if (o.open === 'all') for (const x of [-w / 6, w / 6]) { const p = F.w(x, d / 2); solidCircle(p.x, p.z, 0.15); }
  if (o.raised) { const p = F.w(0, -d / 2 + o.raised / 2 + 0.1); solidRect(p.x, p.z, w - 0.3, o.raised, o.rot); }
  return F;
}
// 中に吊るす行灯（いつも灯る。昼の暗い土間でも手元が見える）
function lamp(rt, F, lx, y, lz) {
  const p = F.w(lx, lz);
  const g = new THREE.CylinderGeometry(0.17, 0.17, 0.42, 8);
  const m = new THREE.Mesh(g, inlamp());
  m.position.set(p.x, rt.world.heightAt(p.x, p.z) + y, p.z);
  rt.scene.add(m);
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.6, 0.03), new THREE.MeshStandardMaterial({ color: POST }));
  r.position.set(p.x, m.position.y + 0.5, p.z); rt.scene.add(r);
}
// 具足（鎧櫃の上に飾った胴丸と兜）
function armorStand(x, y0, z, lace) {
  const P = [B(0.62, 0.45, 0.46, x, y0 + 0.225, z, 0x1e1a16), B(0.64, 0.04, 0.48, x, y0 + 0.46, z, GOLD)];
  P.push(C(0.2, 0.25, 0.52, x, y0 + 0.98, z, IRON, 10));
  for (const y of [0.8, 0.94, 1.08]) P.push(C(0.252, 0.258, 0.05, x, y0 + y + 0.0, z, lace, 10));
  for (let i = 0; i < 5; i++) { const a = -1.2 + i * 0.6; P.push(B(0.24, 0.32, 0.04, x + Math.sin(a) * 0.25, y0 + 0.6, z + Math.cos(a) * 0.25, i % 2 ? IRON : lace, { rx: 0.12, ry: a })); }
  for (const s of [-1, 1]) { P.push(B(0.05, 0.34, 0.28, x + s * 0.33, y0 + 1.05, z, IRON, { rz: s * 0.28 })); P.push(B(0.055, 0.05, 0.29, x + s * 0.34, y0 + 0.95, z, lace, { rz: s * 0.28 })); }
  P.push(C(0.03, 0.03, 0.2, x, y0 + 1.3, z, POST, 5));
  const hb = new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); hb.translate(x, y0 + 1.42, z); hb.deleteAttribute('uv'); P.push(colorize(hb.toNonIndexed(), IRON));
  P.push(C(0.19, 0.29, 0.14, x, y0 + 1.36, z, IRON, 10), C(0.292, 0.292, 0.03, x, y0 + 1.3, z, lace, 10));
  for (const s of [-1, 1]) P.push(B(0.02, 0.3, 0.04, x + s * 0.07, y0 + 1.66, z + 0.15, GOLD, { rz: -s * 0.35 }));
  return P;
}
const spear = (x, z) => [C(0.018, 0.022, 3.0, x, 1.5, z, 0x3a2c20, 5), C(0.004, 0.03, 0.32, x, 3.15, z, 0xa7abad, 4)];

// ======================================================================
// ctx：{ sign, chochin, doors }
export function buildShops(rt, ctx) {
  const W = rt.world, Fl = rt.flags, L = Fl.life || (Fl.life = { spots: {} });
  const S = Fl.shops = [];
  // ---- 具足屋：西の並び（通りの西・市の向かい）。戸口の暖簾をくぐると、鎧と槍が並ぶ ----
  {
    const o = { id: 'gusoku', x: -8.8, z: -34, rot: Math.PI / 2, w: 6.5, d: 8, H: 3.0, open: [-0.95, 0.95], raised: 2.2 };
    const F = shell(rt, o);
    const P = [];
    P.push(...armorStand(-1.9, 0.42, -2.9, 0x8a2a20), ...armorStand(0, 0.42, -2.9, 0x2b3f5c), ...armorStand(1.9, 0.42, -2.9, 0x6a5a2a));
    // 左の壁：槍の掛け台
    P.push(B(0.1, 0.1, 3.4, -3.0, 2.2, 0.4, POST), B(0.1, 0.1, 3.4, -3.0, 0.5, 0.4, POST));
    for (let i = 0; i < 6; i++) P.push(...spear(-2.98, -1.1 + i * 0.6));
    // 刀掛け（板の間の端）
    P.push(B(0.7, 0.06, 0.2, -2.5, 0.75, -1.5, POST), B(0.06, 0.4, 0.2, -2.8, 0.6, -1.5, POST), B(0.06, 0.4, 0.2, -2.2, 0.6, -1.5, POST));
    for (const y of [0.85, 0.98]) P.push(B(1.0, 0.04, 0.05, -2.5, y, -1.5, 0x1a1612));
    // 右：帳場（低い台と帳場格子）
    P.push(B(0.7, 0.85, 2.4, 2.1, 0.43, 0.2, 0x5a4232), B(0.74, 0.04, 2.44, 2.1, 0.87, 0.2, 0x3a2a1c));
    P.push(B(0.3, 0.06, 0.4, 2.0, 0.92, -0.3, 0xe6e0d0), B(0.06, 0.03, 0.2, 2.15, 0.92, 0.1, 0x1a1612));   // 帳面と筆
    // 戸口の脇：鎧櫃に兜を載せて見せる
    for (const s of [-1, 1]) { P.push(B(0.6, 0.45, 0.45, s * 1.7, 0.225, 3.1, 0x1e1a16)); const hb = new THREE.SphereGeometry(0.16, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); hb.translate(s * 1.7, 0.5, 3.1); hb.deleteAttribute('uv'); P.push(colorize(hb.toNonIndexed(), IRON), C(0.18, 0.27, 0.12, s * 1.7, 0.47, 3.1, IRON, 9)); }
    put(rt, P, o.x, o.z, o.rot);
    // 暖簾（紺）
    put(rt, [-0.5, 0, 0.5].map((x) => B(0.46, 0.75, 0.02, x, 2.0, o.d / 2 + 0.14, 0x22304a)), o.x, o.z, o.rot, { cloth: true });
    lamp(rt, F, 0.4, 2.3, 0.6);
    for (const s of [-1, 1]) { const p = F.w(s * 1.7, 3.1); solidRect(p.x, p.z, 0.6, 0.45, o.rot); }
    { const p = F.w(2.1, 0.2); solidRect(p.x, p.z, 0.7, 2.4, o.rot); }
    { const p = F.w(-2.5, -1.5); solidRect(p.x, p.z, 0.7, 0.3, o.rot); }
    const sp = F.w(-1.25, o.d / 2 + 0.12); ctx.sign(rt, '具足', sp.x, 3.3, sp.z, o.rot, 0.62);
    const sv = F.w(1.5, o.d / 2 + 0.2); ctx.sign(rt, '具足', sv.x, 1.0, sv.z, o.rot, 0.36, true);
    const cp = F.w(1.25, 0.2);
    ctx.doors.shop = { x: cp.x, z: cp.z, inner: true };
    S.push({ ...o, F, keeper: { at: F.w(2.85, -0.2), h: o.rot - Math.PI / 2, name: '具足屋の主', kind: 'merchant', i: 71 }, hi: 'いらっしゃいませ。戦の前の具足選びは、命選びでござる' });
  }
  // ---- 茶屋：東の並び、門寄り。前は開け放し、縁台と赤い野点傘 ----
  {
    const o = { id: 'chaya', x: 7.8, z: -60.5, rot: -Math.PI / 2, w: 7, d: 6, H: 2.8, open: 'all' };
    const F = shell(rt, o);
    const P = [];
    // 竈と釜・鉄瓶
    P.push(B(1.7, 0.8, 0.85, -2.1, 0.4, -2.3, 0x8a7a66), B(1.72, 0.06, 0.87, -2.1, 0.82, -2.3, 0x6a5a48));
    for (const x of [-2.55, -1.65]) P.push(C(0.24, 0.2, 0.26, x, 0.98, -2.3, IRON, 10), C(0.12, 0.12, 0.04, x, 1.12, -2.3, 0x1a1612, 8));
    // 奥の棚：茶碗と壺
    P.push(B(3.0, 0.05, 0.36, 1.3, 1.45, -2.75, POST), B(3.0, 0.05, 0.36, 1.3, 0.95, -2.75, POST));
    for (let i = 0; i < 7; i++) P.push(C(0.07, 0.05, 0.08, 0.0 + i * 0.4, 1.52, -2.72, [0x8a7a5a, 0x5a4a3a, 0xc8bca0][i % 3], 7));
    for (let i = 0; i < 4; i++) P.push(C(0.12, 0.14, 0.3, 0.2 + i * 0.75, 1.13, -2.72, [0x6a4a30, 0x4a3a2a][i % 2], 8));
    // 中の床几（緋毛氈）
    P.push(B(0.55, 0.42, 2.6, 2.9, 0.21, -0.2, 0x6a5038), B(0.58, 0.03, 2.62, 2.9, 0.43, -0.2, 0x9a2a22));
    // 表：縁台二つと野点傘
    for (const x of [-1.6, 1.7]) P.push(B(1.8, 0.42, 0.62, x, 0.21, 3.75, 0x6a5038), B(1.82, 0.03, 0.64, x, 0.43, 3.75, 0x9a2a22));
    P.push(C(0.03, 0.035, 2.7, 0.05, 1.35, 3.95, 0x5a4030, 5));
    const umb = new THREE.ConeGeometry(1.6, 0.55, 14, 1, true); umb.translate(0.05, 2.75, 3.95); umb.deleteAttribute('uv'); P.push(colorize(umb.toNonIndexed(), 0xa8281e));
    put(rt, P, o.x, o.z, o.rot);
    // 簾（前の上半分）
    put(rt, [B(o.w - 0.5, 0.55, 0.02, 0, o.H - 0.5, o.d / 2 + 0.12, 0xb8a070)], o.x, o.z, o.rot, { cloth: true });
    lamp(rt, F, -0.4, 2.1, -0.4);
    for (const s of [-1, 1]) { const p = F.w(s * (o.w / 2 - 0.1), o.d / 2 + 0.2); ctx.chochin(rt, p.x, 2.2, p.z); }
    for (const x of [-1.6, 1.7]) { const p = F.w(x, 3.75); solidRect(p.x, p.z, 1.8, 0.6, o.rot); }
    { const p = F.w(0.05, 3.95); solidCircle(p.x, p.z, 0.08); }
    { const p = F.w(-2.1, -2.3); solidRect(p.x, p.z, 1.7, 0.85, o.rot); }
    { const p = F.w(2.9, -0.2); solidRect(p.x, p.z, 0.55, 2.6, o.rot); }
    { const p = F.w(-2.1, -2.0); W.addSmokeColumn(p.x, W.heightAt(p.x, p.z) + 4.6, p.z, { size: 0.3 }); }
    const sv = F.w(o.w / 2 - 0.35, o.d / 2 + 0.2); ctx.sign(rt, '御茶', sv.x, 1.6, sv.z, o.rot, 0.4, true);
    S.push({ ...o, F, keeper: { at: F.w(-0.9, -2.0), h: o.rot, name: '茶屋の娘', kind: 'townsman', i: 72 }, hi: 'おいでなさいまし。お茶をどうぞ' });
  }
  // ---- 鍛冶屋：市の南の裏路地。広い口から、炉の火と槌の音 ----
  {
    const o = { id: 'kaji', x: 18.0, z: -66, rot: -Math.PI / 2, w: 8, d: 6, H: 3.0, open: [-2.3, 2.6] };
    const F = shell(rt, o);
    const P = [];
    // 炉（火床）と火袋の覆い・煙出し
    P.push(B(1.6, 0.85, 1.3, -2.4, 0.42, -1.6, 0x6a6258), B(1.0, 0.08, 0.8, -2.4, 0.86, -1.6, 0x2a2420));
    P.push(B(1.8, 0.5, 1.5, -2.4, 2.35, -1.75, 0x5a5046), B(0.5, 1.6, 0.5, -2.4, 3.4, -2.0, 0x5a5046));
    // 鞴（箱鞴）と把手
    P.push(B(0.55, 0.55, 1.15, -3.55, 0.28, -1.5, 0x4a3828), B(0.06, 0.06, 0.5, -3.55, 0.45, -0.75, POST));
    // 金床（切り株の台に鉄）
    P.push(C(0.28, 0.32, 0.55, 0, 0.27, 0.05, 0x5a4630, 8), B(0.5, 0.18, 0.22, 0, 0.64, 0.05, 0x2a2a2c), B(0.18, 0.12, 0.12, 0.3, 0.66, 0.05, 0x2a2a2c));
    // 焼き入れの水槽・炭俵
    P.push(C(0.38, 0.34, 0.5, 1.5, 0.25, -0.9, 0x5a4630, 9), C(0.35, 0.35, 0.02, 1.5, 0.48, -0.9, 0x24323a, 9));
    for (const [x, z] of [[3.2, -2.3], [3.5, -1.6], [2.9, -1.7]]) P.push(C(0.26, 0.3, 0.55, x, 0.27, z, 0x3a3430, 7));
    // 奥の壁：鋏・槌を掛ける
    P.push(B(2.4, 0.08, 0.08, 1.2, 1.9, -2.85, POST));
    for (let i = 0; i < 5; i++) P.push(B(0.05, 0.5, 0.03, 0.3 + i * 0.45, 1.6, -2.82, 0x2a2a2c, { rz: (i % 2 ? 0.1 : -0.1) }));
    // 鍛え上げた穂と刀の台
    P.push(B(0.12, 1.1, 1.6, 3.65, 0.55, 0.9, POST));
    for (let i = 0; i < 4; i++) P.push(B(0.03, 0.04, 0.95, 3.55, 0.55 + i * 0.16, 0.9, 0xb5b9bb));
    put(rt, P, o.x, o.z, o.rot);
    { const p = F.w(-2.4, -1.6), m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.6), glowMat()); m.position.set(p.x, W.heightAt(p.x, p.z) + 0.88, p.z); m.rotation.y = o.rot; rt.scene.add(m); }
    { const p = F.w(-2.4, -2.0); W.addSmokeColumn(p.x, W.heightAt(p.x, p.z) + 4.4, p.z, { size: 0.55 }); }
    for (const [x, z, a, b] of [[-2.4, -1.6, 1.6, 1.3], [-3.55, -1.5, 0.55, 1.15], [3.65, 0.9, 0.3, 1.6]]) { const p = F.w(x, z); solidRect(p.x, p.z, a, b, o.rot); }
    for (const [x, z, r] of [[0, 0.05, 0.3], [1.5, -0.9, 0.38], [3.2, -2.0, 0.5]]) { const p = F.w(x, z); solidCircle(p.x, p.z, r); }
    const sv = F.w(2.95, o.d / 2 + 0.2); ctx.sign(rt, '鍛冶', sv.x, 2.0, sv.z, o.rot, 0.4, true);
    const a = F.w(0, -0.75);
    L.spots.anvil = { x: a.x, z: a.z, face: o.rot };
    L.spots.forge = F.w(-2.4, -1.6);
    S.push({ ...o, F, rack: F.w(2.9, 0.9), hi: null });
  }
}

// ---- 店の人と、中でできる事（people の後で呼ぶ） ----
// ctx：{ dress, rumors }
export function shopsPeople(rt, ctx) {
  const Fl = rt.flags, game = rt.game;
  for (const sh of Fl.shops || []) {
    const k = sh.keeper;
    if (!k) continue;
    const g = allyGroup(rt, { name: k.name, anchor: k.at, facing: k.h, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, fixed: true }, [{ type: 'porter', n: 1, o: { flag: null, invuln: true, weapon: 'none' } }]);
    const u = g.units[0];
    if (!u) continue;
    ctx.dress(rt, u, k.kind, k.i);
    u.name = k.name; u.heading = k.h;
    u.civ = true; u.civKind = 'merchant';
    const P = { g, u, kind: 'merchant', i: k.i, fixed: true, talkT: 0, said: 0, home: k.at };
    (Fl.folk = Fl.folk || []).push(P);
    sh.P = P;
  }
  const open = (sh) => sh.P && !sh.P.away && sh.P.u.alive;
  const G = rt.G, pl = rt.player;
  // 具足屋：帳場で品を見る（武具屋の札）・主と話す
  const gu = Fl.shops.find((s) => s.id === 'gusoku');
  if (gu) {
    const at = gu.F.w(1.25, 0.2);
    rt.addInteract('gusoku-buy', () => (open(gu) ? at : null), '見る　具足と槍（武具屋）', () => game.townOpen('shop'), { r: 2.0 });
    const L = ['胴は軽うて堅いのが一番。重い具足は、走れぬ者を殺しまする', '槍は三間半。長い方が、足軽の組では勝ちまする', '兜の緒は固う締めなされ。首を守るのは緒でござる'];
    rt.addInteract('gusoku-talk', () => (open(gu) ? { x: gu.P.u.pos.x, z: gu.P.u.pos.z } : null), '話す　具足屋の主', () => rt.say('具足屋の主', L[(gu.P.said++) % L.length], 4), { r: 2.4 });
  }
  // 茶屋：茶と団子・縁台で一服（刻が進む）・噂話
  const ch = Fl.shops.find((s) => s.id === 'chaya');
  if (ch) {
    rt.addInteract('chaya-buy', () => (open(ch) ? { x: ch.P.u.pos.x, z: ch.P.u.pos.z } : null), '買う　茶と団子（10文）　息が戻る', () => {
      if ((G.kan || 0) < 0.01) { rt.say('茶屋の娘', 'あら、お足りになりませぬか。またどうぞ', 3); return; }
      G.kan = Math.round((G.kan - 0.01) * 1000) / 1000;
      if (pl.breath != null) pl.breath = pl.maxBreath || 100;
      const rm = ctx.rumors || [];
      rt.say('茶屋の娘', rm.length && Math.random() < 0.6 ? `お客さんの噂では……${rm[(Fl.rumorI = (Fl.rumorI || 0) + 1) % rm.length]}` : 'どうぞ、ごゆっくり。団子は焼き立てでございます', 4.5);
    }, { r: 2.6 });
    const bench = ch.F.w(-1.6, 3.2);
    rt.addInteract('chaya-rest', () => (open(ch) && rt.flags.air && rt.flags.air.ph < 3 ? bench : null), '休む　縁台で一服（刻が進む）', () => {
      const A = rt.flags.air;
      if (pl.breath != null) pl.breath = pl.maxBreath || 100;
      rt.say('', '縁台に腰を下ろし、茶をすする。通りを眺めるうちに、日が移った', 4);
      setPhase(rt, Math.min(3, A.ph + 1), true);
    }, { r: 2.2 });
  }
  // 鍛冶屋：鍛えた穂と刀を見る（武具屋の札）
  const kj = Fl.shops.find((s) => s.id === 'kaji');
  if (kj) {
    const smith = () => Fl.life && Fl.life.npc && Fl.life.npc.find((P) => P.role === 'smith');
    rt.addInteract('kaji-buy', () => { const s = smith(); return s && !s.away ? kj.rack : null; }, '見る　鍛えた穂と刀（武具屋）', () => game.townOpen('shop'), { r: 2.0 });
  }
}

// ---- 毎コマ：店の中ではカメラを近づける・入った時に店の人が声を掛ける ----
export function shopsTick(rt, dt) {
  const Fl = rt.flags, S = Fl.shops;
  if (!S) return;
  const p = rt.player.u.pos, pl = rt.player;
  let inside = null;
  for (const sh of S) { const l = sh.F.loc(p.x, p.z); if (Math.abs(l.x) < sh.w / 2 - 0.1 && Math.abs(l.z) < sh.d / 2 - 0.05) { inside = sh; break; } }
  const IN = Fl.indoor || (Fl.indoor = { z0: null, cur: null });
  if (inside && IN.cur !== inside) {
    if (IN.z0 == null) IN.z0 = pl.zoom || 0;
    if (inside.hi && inside.P && !inside.P.away && !inside.greeted) { inside.greeted = true; rt.say(inside.P.u.name, inside.hi, 3.5); }
  }
  IN.cur = inside;
  const want = inside ? -1.3 : IN.z0;
  if (want != null) {
    pl.zoom += (want - pl.zoom) * Math.min(1, dt * 4);
    if (!inside && Math.abs(pl.zoom - want) < 0.02) { pl.zoom = want; IN.z0 = null; }
  }
}
