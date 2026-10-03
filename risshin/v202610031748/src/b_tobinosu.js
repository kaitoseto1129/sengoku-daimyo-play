// ======================================================================
// 長篠編　鳶ヶ巣山砦 夜襲（天正三年五月二十一日 夜明け）
// 酒井忠次の別働隊が夜のうちに山を越え、長篠城を囲む武田の砦を背から突く。
// 南の麓の森から、見張りを避けて寄せ場へ。法螺の合図で尾根に並ぶ砦を順に落とし、
// 最後の鳶ヶ巣山砦で河窪信実を討つ。長篠城の城兵が打って出て合流すれば勝ち
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { distToPolyline } from './world.js';
import { jinmaku, nobori, hut, yagura, campfire, tawara } from './props.js';
import { woodTex } from './nature.js';
import { buildModel, poseArms } from './units.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { KIT, volley } from './b_nagashinojo.js';
import { depthStart, depthTick, depthBot, rest, pick, fight, hold } from './b_depth.js';

// 尾根の背（x ごとの z）。砦はこの上に並ぶ
const ridgeZ = (x) => -38 + 5 * Math.sin(x * 0.035);
// 砦：東から 姥ヶ懐・君ヶ伏床・中山・久間山・鳶ヶ巣山。曲輪は楕円（rx・rz）、虎口は南（攻め手の側）、
// 虎口の内に蔀の柵を立てて、入った者を横（side の側）へ折らせる（食い違い虎口）
const FORTS = [
  { key: 'uba', name: '姥ヶ懐', x: 66, z: -34, rx: 10, rz: 9, side: 1 },
  { key: 'kimi', name: '君ヶ伏床', x: 26, z: -35, rx: 12, rz: 9, side: -1 },
  { key: 'naka', name: '中山', x: -16, z: -40, rx: 10, rz: 11, side: 1 },
  { key: 'kuma', name: '久間山', x: -50, z: -43, rx: 9, rz: 9, side: -1 },
  { key: 'tobi', name: '鳶ヶ巣山', x: -96, z: -40, rx: 16, rz: 14, side: 1 },
];
const SPAWN = { x: 10, z: 152 };
const YOSE = { x: 26, z: 12 };   // 寄せ場（尾根の下の窪み）
// 別働隊の通る回り道と、見張りのいる近道。尾根の上の道
const BYPASS = [[24, 146], [40, 128], [56, 96], [58, 62], [46, 32], [28, 16]];
const DIRECT = [[12, 150], [14, 110], [8, 70], [16, 30], [24, 14]];
const RIDGE = [[74, -32], [44, -32], [8, -38], [-30, -44], [-70, -42], [-100, -40]];
// 武田の見張り（近道の上と、西の沢）
const WATCH = [{ x: 12, z: 100 }, { x: 10, z: 62 }, { x: -20, z: 40 }];
const SEE = 14;   // 見張りに気づかれる間合い

function baseH(x, z) {
  let h = 1.2 * Math.sin(x * 0.045 + 1) * Math.cos(z * 0.038) + 0.7 * Math.sin(x * 0.09 + z * 0.06);
  // 南の麓から尾根へ、だんだん上る
  h += Math.max(0, Math.min(1, (150 - z) / 170)) * 8;
  // 尾根と、北の川への下り
  const zc = ridgeZ(x);
  h += 16 * Math.exp(-((z - zc) ** 2) / 900);
  h -= Math.max(0, zc - 20 - z) * 0.15;
  // 鳶ヶ巣山の峰は一段高い。東西の山で谷を囲む
  h += 6 * gauss(x, z, -96, -40, 900) + 10 * gauss(x, z, 140, 40, 2600) + 12 * gauss(x, z, -140, 70, 3000) + 5 * gauss(x, z, 120, -40, 1500);
  return h;
}
// 砦の寸法：r は平均の半径、g は木戸の半分の幅、ga・gb は虎口と搦手の開き（角度）、zg は木戸の線、zw は蔀の柵の線、h は曲輪の高さ
for (const f of FORTS) {
  f.r = (f.rx + f.rz) / 2;
  f.g = f.key === 'tobi' ? 2.8 : 2.4;
  f.ga = Math.asin(f.g / f.rx); f.gb = Math.asin(1.5 / f.rx);
  f.zg = f.z + f.rz * Math.cos(f.ga);
  f.zw = f.z + f.rz - 4.4;
  f.h = baseH(f.x, f.z) + 0.4;
}
const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
// 曲輪の縁からの距離（外が正）
const edgeOf = (f, x, z) => (Math.hypot((x - f.x) / f.rx, (z - f.z) / f.rz) - 1) * f.r;
// 砦の地形：尾根を削った平らな曲輪、縁に土塁、その外に切岸と空堀。虎口と搦手の前は土橋で渡る
function fortHeight(f, x, z, hNat) {
  const dE = edgeOf(f, x, z);
  if (dE > 16) return hNat;
  const a = Math.abs(Math.atan2(x - f.x, z - f.z));
  const bridge = dE > -3 && (a < f.ga + 0.12 || a > Math.PI - f.gb - 0.12);
  let rel;
  if (bridge) rel = 0;
  else if (dE < -0.6) rel = 1.3 * sm((dE + 2.6) / 2);            // 土塁の内の斜面
  else if (dE < 0.8) rel = 1.3;                                   // 土塁の上（柵が立つ）
  else if (dE < 3.4) rel = 1.3 - 3.9 * sm((dE - 0.8) / 2.6);      // 切岸
  else if (dE < 6) rel = -2.6;                                    // 空堀の底
  else rel = -2.6 + 2 * sm((dE - 6) / 2.5);                       // 堀の外の縁
  const k = dE < 8.5 ? 1 : 1 - sm((dE - 8.5) / 7.5);
  return hNat * (1 - k) + (f.h + rel) * k;
}

// ---- 砦の形（Three.js の基本形を組み合わせ、砦ごとに一つにまとめる） ----
let WOOD = null;
const woodMat = () => WOOD || (WOOD = new THREE.MeshStandardMaterial({ vertexColors: true, map: woodTex(), roughness: 0.9, metalness: 0 }));
const vary = (hex, k) => new THREE.Color(hex).multiplyScalar(0.84 + (((k * 7919) % 37) / 37) * 0.32).getHex();
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const UP = new THREE.Vector3(0, 1, 0);
// 二点を結ぶ丸太
function beam(P, ax, ay, az, bx, by, bz, r, hex, seg = 5) {
  const d = new THREE.Vector3(bx - ax, by - ay, bz - az);
  const g = new THREE.CylinderGeometry(r * 0.85, r, d.length(), seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  P.push(paint(g, hex));
}
function box(P, w, h, d, x, y, z, ry, hex) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  P.push(paint(g, hex));
}
function mergedMesh(P, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(mergeGeometries(P), woodMat());
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// 柵：先を尖らせた丸太を隙間なく並べ、横木二本で結ぶ
function palisadeLine(W, P, pts, h) {
  let k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.3));
    for (let j = 0; j < n; j++, k++) {
      const t = (j + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = W.heightAt(x, z);
      const hh = h * (0.9 + ((k * 37) % 10) / 45);
      const col = vary(0x6b5238, k);
      const c = new THREE.CylinderGeometry(0.11, 0.13, hh + 0.5, 5, 1, true); c.translate(x, y + hh / 2 - 0.25, z); P.push(paint(c, col));
      const tip = new THREE.ConeGeometry(0.11, 0.34, 5, 1, true); tip.translate(x, y + hh + 0.17, z); P.push(paint(tip, vary(0x8a6d4a, k)));
    }
    const ya = W.heightAt(ax, az), yb = W.heightAt(bx, bz);
    for (const r of [0.45, h - 0.45]) beam(P, ax, ya + r, az, bx, yb + r, bz, 0.06, 0x4e3a28, 4);
  }
}
// 高い物見櫓（上に物見の兵）
function tallYagura(W, x, z, H = 7.4) {
  const P = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) beam(P, sx * 1.55, -0.3, sz * 1.55, sx * 1.15, H, sz * 1.15, 0.13, 0x5a4430, 6);
  // 貫（横木）と筋交い
  for (const yy of [2.2, 4.8]) {
    const w = 1.55 - (0.4 * yy) / H;
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) beam(P, ax * w, yy, az * w, bx * w, yy, bz * w, 0.06, 0x5a4430, 4);
  }
  for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) beam(P, ax * 1.45, 0.4, az * 1.45, bx * 1.2, H - 0.8, bz * 1.2, 0.045, 0x4e3a28, 4);
  box(P, 3.2, 0.16, 3.2, 0, H, 0, 0, 0x6b5238);
  // 板の囲い（梯子の口だけ半分）
  box(P, 3.2, 1.0, 0.07, 0, H + 0.55, -1.58, 0, 0x6e5a40);
  box(P, 0.07, 1.0, 3.2, -1.58, H + 0.55, 0, 0, 0x6e5a40);
  box(P, 0.07, 1.0, 3.2, 1.58, H + 0.55, 0, 0, 0x6e5a40);
  box(P, 1.6, 1.0, 0.07, -0.8, H + 0.55, 1.58, 0, 0x6e5a40);
  // 屋根を支える柱と、板葺きの寄棟
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) beam(P, sx * 1.45, H, sz * 1.45, sx * 1.45, H + 2.2, sz * 1.45, 0.06, 0x5a4430, 4);
  const roof = new THREE.ConeGeometry(2.7, 1.3, 4); roof.rotateY(Math.PI / 4); roof.translate(0, H + 2.8, 0); P.push(paint(roof, 0x4a3e30));
  // 梯子
  for (const lx of [0.45, 0.95]) beam(P, lx, 0, 2.3, lx, H, 1.6, 0.04, 0x5a4430, 4);
  for (let r = 0; r < 11; r++) { const t = (r + 0.5) / 11; box(P, 0.55, 0.05, 0.06, 0.7, t * H, 2.3 - 0.7 * t, 0, 0x6b5238); }
  const grp = new THREE.Group();
  grp.add(mergedMesh(P));
  grp.position.set(x, W.heightAt(x, z), z);
  // 物見の兵（弓を持って南を見張る）
  const u = {};
  const man = buildModel(u, { armor: 0x3a2622, lace: 0x7a2a1c, hat: 'jingasa', sode: false, pole: false, flag: null, weapon: 'bow', skin: 0xa87f5c, horo: 0 });
  u.lookWeapon = 'bow'; poseArms(u);
  man.position.set(0.3, H + 0.08, 0.6);
  man.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  grp.add(man);
  grp.userData.lookout = man;
  grp.userData.H = H;
  return grp;
}
// 竹束：青竹を束ね、縄で二か所を縛る（弓・鉄砲の楯）
function takataba(P, W, x, z, k) {
  const y = W.heightAt(x, z);
  for (let i = 0; i < 8; i++) {
    const a = (i / 7) * Math.PI * 2, rr = i === 7 ? 0 : 0.2;
    const c = new THREE.CylinderGeometry(0.06, 0.065, 2.0, 5, 1, true); c.translate(x + Math.cos(a) * rr, y + 0.95, z + Math.sin(a) * rr); P.push(paint(c, vary(0x7e7c44, k * 8 + i)));
  }
  for (const yy of [0.5, 1.5]) { const b = new THREE.CylinderGeometry(0.29, 0.29, 0.07, 8, 1, true); b.translate(x, y + yy, z); P.push(paint(b, 0x4a3a22)); }
}
// 篝火の台：三本の脚に鉄の籠
function kagaribi(P, W, x, z) {
  const y = W.heightAt(x, z);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; beam(P, x + Math.cos(a) * 0.45, y, z + Math.sin(a) * 0.45, x, y + 1.35, z, 0.035, 0x2e2620, 4); }
  const c = new THREE.CylinderGeometry(0.28, 0.18, 0.3, 7, 1, true); c.translate(x, y + 1.45, z); P.push(paint(c, 0x1e1c1a));
}

// 砦を建てる：柵（当たりあり）・木戸・蔀・逆茂木・乱杭・竹束・櫓・小屋・俵・篝火・旗
function buildFort(rt, f) {
  const W = rt.world;
  const P = [];
  const ring = (a, out = 0) => [f.x + Math.sin(a) * (f.rx + out), f.z + Math.cos(a) * (f.rz + out)];
  const arc = (a0, a1) => { const n = Math.max(2, Math.ceil(((a1 - a0) * f.r) / 3.5)); return Array.from({ length: n + 1 }, (_, i) => ring(a0 + ((a1 - a0) * i) / n)); };
  const east = arc(f.ga, Math.PI - f.gb), west = arc(Math.PI + f.gb, Math.PI * 2 - f.ga);
  // 蔀の柵：虎口の内に立て、side の側だけ通れる
  const hw = f.rx * Math.sqrt(Math.max(0, 1 - ((f.zw - f.z) / f.rz) ** 2));
  const shito = [[f.x - f.side * (hw + 0.3), f.zw], [f.x + f.side * (f.g + 0.8), f.zw]];
  const opt = { team: 1, hp: 99999, segLen: 999, name: '砦の柵', mesh: () => new THREE.Group() };
  f.walls = [...wallLine(rt, east, opt), ...wallLine(rt, west, opt), ...wallLine(rt, shito, opt)];
  // 柵と木戸は別にまとめ、カメラがめり込まないよう当たりを調べる相手にする
  const PP = [];
  palisadeLine(W, PP, east, 2.5); palisadeLine(W, PP, west, 2.5); palisadeLine(W, PP, shito, 2.1);
  // 木戸：太い門柱に冠木と小さな板屋根。扉は合図のあと、味方が破る
  const yg = W.heightAt(f.x, f.zg);
  for (const sx of [-1, 1]) beam(PP, f.x + sx * f.g, yg - 0.5, f.zg, f.x + sx * f.g, yg + 3.5, f.zg, 0.2, 0x5a4430, 7);
  beam(PP, f.x - f.g - 0.7, yg + 3.25, f.zg, f.x + f.g + 0.7, yg + 3.25, f.zg, 0.17, 0x4e3a28, 6);
  for (const sd of [1, -1]) { const r = new THREE.BoxGeometry(f.g * 2 + 1.1, 0.08, 0.8); r.rotateX(sd * 0.5); r.translate(f.x, yg + 3.58, f.zg + sd * 0.34); PP.push(paint(r, 0x4a3e30)); }
  const pal = mergedMesh(PP);
  pal.userData.camBlock = true;
  rt.scene.add(pal);
  // 木戸の外の篝火の台（火は setup で灯す）
  for (const sx of [-1, 1]) kagaribi(P, W, f.x + sx * (f.g + 0.9), f.zg + 1.2);
  f.doors = [-1, 1].map((sx) => {
    const L = [];
    box(L, f.g - 0.12, 2.5, 0.1, (-sx * (f.g - 0.12)) / 2, 1.3, 0, 0, 0x6e5438);
    for (const yy of [0.5, 1.3, 2.1]) box(L, f.g - 0.2, 0.12, 0.08, (-sx * (f.g - 0.12)) / 2, yy, -0.08, 0, 0x4e3a28);
    const m = mergedMesh(L, f.x + sx * (f.g - 0.05), yg - 0.05, f.zg);
    rt.scene.add(m);
    return m;
  });
  f.gate = rt.army.addStruct({ seg: [f.x - f.g, f.zg, f.x + f.g, f.zg], nx: 0, nz: 1, hp: 240, maxHp: 240, team: 1, name: `${f.name}の木戸`, gate: true, fort: f });
  // 逆茂木：堀の外の縁に、尖った枝を外へ向けて並べる（土橋の前は空ける）
  const sw = 8.8;
  for (let a = 0, k = 0; a < Math.PI * 2; a += 2.3 / (f.r + sw), k++) {
    const aa = Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (aa < f.ga + 0.3 || aa > Math.PI - f.gb - 0.25) continue;
    const [x, z] = ring(a, sw), y = W.heightAt(x, z);
    const tx = Math.cos(a), tz = -Math.sin(a), nx = Math.sin(a), nz = Math.cos(a);
    beam(P, x - tx * 1.1, y + 0.25, z - tz * 1.1, x + tx * 1.1, y + 0.3, z + tz * 1.1, 0.1, 0x4a3a2a, 5);
    for (let b = 0; b < 5; b++) {
      const o = (b - 2) * 0.45, j = ((k * 13 + b * 7) % 10) / 10;
      const bx = x + tx * o, bz = z + tz * o;
      beam(P, bx, y + 0.3, bz, bx + nx * (1.2 + j * 0.5) + tx * (j - 0.5) * 0.5, y + 0.9 + j * 0.5, bz + nz * (1.2 + j * 0.5) + tz * (j - 0.5) * 0.5, 0.035, vary(0x5a4634, k + b), 4);
    }
  }
  // 乱杭：堀の底と切岸に、斜めに打ち込んだ杭（攻め手の側を中心に）
  for (let a = -1.9, k = 0; a < 1.9; a += 1.5 / f.r, k++) {
    if (Math.abs(a) < f.ga + 0.25) continue;
    const off = 3.8 + ((k * 7) % 5) * 0.45;
    const [x, z] = ring(a, off), y = W.heightAt(x, z);
    const lean = ((k * 11) % 7 - 3) * 0.08;
    beam(P, x, y - 0.3, z, x + Math.sin(a) * 0.5 + lean, y + 1.2 + ((k * 5) % 4) * 0.12, z + Math.cos(a) * 0.5, 0.06, vary(0x55432f, k), 4);
  }
  // 竹束：土塁の内、虎口の左右と攻め手の側に
  let tk = 0;
  for (const a of [f.ga + 0.3, f.ga + 0.65, f.ga + 1.0]) for (const s of [-1, 1]) { const [x, z] = ring(s * a, -2.3); takataba(P, W, x, z, tk++); }
  // 篝火（台と火）：枡の隅と曲輪の中
  const fires = [[f.x - f.side * (f.g + 1.6), f.zg - 1.4], [f.x - f.side * 2.5, f.z + 0.5]];
  for (const [x, z] of fires) { kagaribi(P, W, x, z); W.addFire(x, z, { torch: true, h: 1.55 }); }
  rt.scene.add(mergedMesh(P));
  // 物見櫓（火をかける櫓）と、小屋・俵・旗
  f.yx = f.x - f.side * f.rx * 0.5; f.yz = f.z + f.rz * 0.05;
  f.yagura = tallYagura(W, f.yx, f.yz, f.key === 'tobi' ? 8.4 : 7.4);
  rt.scene.add(f.yagura);
  rt.scene.add(hut(W, f.x + f.side * f.rx * 0.3, f.z - f.rz * 0.45, 5.5, 3.6, 0.1, { roof: 0x5a4c3a }));
  rt.scene.add(tawara(W, f.x - f.side * f.rx * 0.15, f.z - f.rz * 0.6, 0.4, 6));
  rt.scene.add(campfire(W, f.x + f.side, f.z - 1.5));
  W.addFire(f.x + f.side, f.z - 1.5);
  for (const [a, k] of [[0.62, 'takeda'], [-0.62, 'takeda'], [1.7, 'furin'], [-1.7, 'takeda'], [2.7, 'takeda']]) { const [x, z] = ring(a, -3.2); rt.scene.add(nobori(W, x, z, k, f.key === 'tobi' ? 6 : 5)); }
  if (f.key === 'tobi') {
    // 本陣：陣幕と大将の小屋、もう一つの櫓、兵糧の俵を多めに
    rt.scene.add(jinmaku(W, f.x - 1, f.z - 3, 11, 8, 4));
    rt.scene.add(hut(W, f.x - f.side * 2, f.z - f.rz * 0.72, 7, 4, -0.1, { roof: 0x5a4c3a }));
    rt.scene.add(tawara(W, f.x + f.side * f.rx * 0.55, f.z + 1, -0.3, 6), tawara(W, f.x + f.side * f.rx * 0.5, f.z + 3, 0.5, 5));
    const y2 = tallYagura(W, f.x + f.side * f.rx * 0.6, f.z - f.rz * 0.3, 7.4);
    rt.scene.add(y2);
    for (const [x, z, k] of [[f.x - 5, f.z - 7, 'furin'], [f.x + 3, f.z - 7, 'takeda'], [f.x - 6, f.z + 1, 'takeda'], [f.x + 4, f.z + 1, 'furin']]) rt.scene.add(nobori(W, x, z, k, 6.5));
  }
}
// 木戸が破れた（扉が開いて傾く）
function openGate(rt, f) {
  if (f.gateOpen) return;
  f.gateOpen = true;
  if (rt.flags.fi >= 0 && rt.flags.forts[rt.flags.fi] === f) { rt.unzone('hikae'); rt.unmark('hikae'); }
  if (f.gate.alive) { f.gate.alive = false; f.gate.hp = 0; }
  f.doors[0].rotation.y = 1.75;
  f.doors[1].rotation.y = -0.95; f.doors[1].rotation.z = 0.28;
}

// 夜明け前の暗さ（兵と旗が見分けられるくらいに、青く明るめ）と、夜明けの色
const LOOK = {
  night: { sky: 0x364054, fog: 0x2f3747, sun: 0xa8b8d8, sunI: 0.7, hs: 0x8a9ab8, hg: 0x2e2e30, hI: 1.15, top: 0x1c2438, glow: 0.08, dir: [0.9, 0.12, -0.3], mount: 0x181c24 },
  dawn: { sky: 0x86808c, fog: 0x76727e, sun: 0xffc48a, sunI: 1.15, hs: 0xa8a4b6, hg: 0x3a3028, hI: 1.0, top: 0x4a5470, glow: 0.2, dir: [1, 0.1, -0.25], mount: 0x2a2826 },
};
function applyLook(rt, key) {
  const W = rt.world;
  rt.flags.look = key;
  if (key === 'morning') {
    W.setTime('day');
    // 朝日はまだ低い
    W.sunOffset.set(90, 45, -25).normalize().multiplyScalar(120);
    W.skyMat.uniforms.sunDir.value.set(90, 45, -25).normalize();
    W.updateEnv();
    return;
  }
  W.setTime('dusk');
  const L = LOOK[key];
  W.scene.background.set(L.sky);
  W.scene.fog.color.set(L.fog);
  W.sun.color.set(L.sun); W.sun.intensity = L.sunI;
  W.hemi.color.set(L.hs); W.hemi.groundColor.set(L.hg); W.hemi.intensity = L.hI; W.baseHemi = L.hI;
  W.sunOffset.set(...L.dir).normalize().multiplyScalar(120);
  const U = W.skyMat.uniforms;
  U.top.value.set(L.top); U.bottom.value.set(L.fog);
  U.sunDir.value.set(...L.dir).normalize(); U.sunCol.value.set(L.sun);
  U.glowK.value = L.glow; U.cover.value = 0.35;
  W.mountMats.forEach((m, k) => { const far = m.color.clone().set(L.mount); m.color.set(L.fog).lerp(far, [0.78, 0.52, 0.3][k]); });
  W.updateEnv();
}

// 砦の中か（k だけ内へ寄せて測る）
const inFort = (p, f, k = 0) => edgeOf(f, p.x, p.z) < -k;
// 蔀の柵の外側（虎口と蔀の間の枡）にいるか
const inCourt = (p, f) => inFort(p, f) && p.z > f.zw - 0.2;
// 砦の外から中へ：木戸の前へ回り、木戸が閉まっていれば破り、枡で横へ折れて曲輪へ
function entryWp(f, p) {
  const dx = p.x - f.x, dz = p.z - f.z;
  if (inCourt(p, f)) return { x: f.x + f.side * (f.g + 2.6), z: f.zw - 3 };
  if (dz > 0 && Math.abs(dx) < f.g * 1.3 && p.z < f.zg + 6) return { x: f.x + dx * 0.5, z: f.zg - 2 };
  if (dz < f.rz * 0.3) return { x: f.x + Math.sign(dx || 1) * (f.rx + 11), z: f.z + f.rz * 0.7 };
  return { x: f.x + Math.max(-f.g, Math.min(f.g, dx)) * 0.5, z: f.zg + 4 };
}
// 曲輪の中から外へ：蔀の脇を抜けて枡へ、木戸から出る
function exitWp(f, p) {
  const ex = f.x + f.side * (f.g + 2.6);
  if (p.z < f.zw - 0.2) return Math.abs(p.x - ex) > 1.2 ? { x: ex, z: f.zw - 2 } : { x: ex, z: f.zw + 1.6 };
  return { x: f.x, z: f.zg + 3 };
}
function fortRoute(rt, f) {
  return (u) => {
    // 前に落とした砦の中にいれば、まずその砦の木戸から出る（柵の内側に張り付いて止まらないように）
    for (const q of rt.flags.forts || []) if (q !== f && inFort(u.pos, q, -0.4)) return exitWp(q, u.pos);
    if (inFort(u.pos, f, 0.6) && !inCourt(u.pos, f)) {
      const e = rt.army.nearestEnemy(u, f.r * 2.2);
      return e ? { x: e.pos.x, z: e.pos.z } : { x: f.x, z: f.z };
    }
    // 閉じた木戸の前では、木戸を打ち破る
    if (f.gate.alive && !inFort(u.pos, f) && Math.abs(u.pos.x - f.x) < f.g + 1.5 && u.pos.z > f.zg && u.pos.z < f.zg + 5) return f.gate;
    return entryWp(f, u.pos);
  };
}

// 軽い作りの大軍を動かす（夜明けとともに尾根へ寄せていく「別の手」）
function moveHost(rt, h, dt) {
  if (!h.go) return;
  h.t = Math.min(1, h.t + dt / h.dur);
  const k = h.t * h.t * (3 - 2 * h.t);
  const x = h.x0 + (h.x1 - h.x0) * k, z = h.z0 + (h.z1 - h.z0) * k;
  h.m.position.set(x - h.x0, rt.world.heightAt(x, z) - rt.world.heightAt(h.x0, h.z0), z - h.z0);
}

export const tobinosu = {
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 75,
    muddy: 0.3,
    time: 'dusk',
    mist: true,
    fogFar: 210,
    paths: [BYPASS, DIRECT, RIDGE],
    height(x, z) {
      const h = baseH(x, z);
      // いちばん近い砦の地形だけを当てる
      let best = null, bd = 16;
      for (const f of FORTS) { const d = edgeOf(f, x, z); if (d < bd) { bd = d; best = f; } }
      return best ? fortHeight(best, x, z, h) : h;
    },
    tint(x, z, h, c) {
      // 曲輪の中は踏み固めた土、土塁と堀は掘り返した土
      for (const f of FORTS) {
        const d = edgeOf(f, x, z);
        if (d < -2.6) c.setRGB(c.r * 0.7 + 0.1, c.g * 0.66 + 0.08, c.b * 0.6 + 0.05);
        else if (d < 7.5) c.setRGB(c.r * 0.45 + 0.17, c.g * 0.42 + 0.13, c.b * 0.4 + 0.08);
      }
      // 尾根の背は岩がちで、草が薄い
      if (Math.abs(z - ridgeZ(x)) < 12) c.setRGB(c.r * 0.9 + 0.03, c.g * 0.88 + 0.02, c.b * 0.85 + 0.02);
    },
    clear: (x, z) => FORTS.some((f) => edgeOf(f, x, z) < 14) || Math.hypot(x - YOSE.x, z - YOSE.z) < 16 ||
      Math.hypot(x - SPAWN.x - 6, z - SPAWN.z) < 12 || WATCH.some((w) => Math.hypot(x - w.x, z - w.z) < 6) || Math.hypot(x - 124, z + 80) < 34,
    streams: [{ pts: [[-180, -104], [-110, -120], [-40, -114], [40, -122], [110, -112], [180, -126]], w: 4, depth: 2.2 }],
    trees: 760,
    tufts: 3600,
    // 南の山肌は深い森。尾根の背と北の谷は疎ら
    treeDensity: (x, z) => (Math.abs(z - ridgeZ(x)) < 14 ? 0.12 : z < ridgeZ(x) ? 0.3 : distToPolyline(x, z, DIRECT) < 6 ? 0.2 : 1),
    groves: [{ x: 40, z: 40, r: 14, n: 26 }, { x: 0, z: 30, r: 12, n: 18 }, { x: 70, z: 110, r: 16, n: 26 }, { x: -40, z: 110, r: 16, n: 24 }, { x: -60, z: 10, r: 12, n: 16 }],
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 夜の山道に伝令の騎馬は走らない
    for (const c of rt.couriers) rt.scene.remove(c.m);
    rt.couriers.length = 0;
    applyLook(rt, 'night');

    // ---- 砦 ----
    F.forts = FORTS.map((f) => ({ ...f, def: [], fallen: false, burned: false }));
    // 篝火の灯りは四つまでなので、最初に攻める姥ヶ懐と、最後の鳶ヶ巣山に先に付ける
    const fireOrder = [0, 4, 1, 2, 3];
    for (const i of fireOrder) {
      const f = F.forts[i];
      for (const s of [-1, 1]) W.addFire(f.x + s * (f.g + 0.9), f.zg + 1.2, { torch: true, h: 1.6 });
    }
    for (const f of F.forts) buildFort(rt, f);
    // 守兵：槍の組と弓の組。鳶ヶ巣山には河窪信実
    const guard = (f, list, o = {}) => {
      const g = enemyGroup(rt, { faction: 'takeda', name: `${f.name}の守兵`, anchor: { x: f.x, z: f.z + 3 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 9, width: 5, morale: 90, defMult: 1.2, ...o }, list);
      f.def.push(g);
      // 柵の内から撃つ弓・鉄砲は、木戸の前の坂まで。控え場（木戸から二十歩余り）には届かない
      for (const u of g.units) if (u.type === 'bow' || u.type === 'gun') u.range = u.type === 'bow' ? 26 : 32;
      return g;
    };
    for (const f of F.forts.slice(0, 3)) {
      guard(f, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }]);
      guard(f, [{ type: 'bow', n: 3 }, ...(f.key === 'naka' ? [{ type: 'gun', n: 1 }] : [])], { anchor: { x: f.x - f.side * 2, z: f.z - 3 }, width: 5, aggro: 12 });
    }
    guard(F.forts[3], [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }], { morale: 80 });
    const T = F.forts[4];
    // 口を固める槍の組、奥の弓・鉄砲、陣幕の前に河窪信実と旗本（組を持たない身なら、守りを少し薄く）
    const solo = !RANKS[rt.G.rank].squad;
    guard(T, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }], { anchor: { x: T.x + 2, z: T.z + 5 }, width: 7, morale: 100, defMult: 1.4 });
    guard(T, [{ type: 'bow', n: solo ? 2 : 3 }, ...(solo ? [] : [{ type: 'gun', n: 1 }])], { anchor: { x: T.x + 4, z: T.z - 6 }, width: 6, aggro: 12 });
    const hq = guard(T, [{ type: 'busho', n: 1, o: { name: '河窪信実', flag: 'takeda' } }, { type: 'samurai', n: 1 }], { anchor: { x: T.x - 1, z: T.z - 2 }, width: 4, morale: 100, noRout: true, defMult: 1.3, aggro: 6 });
    F.nobuzane = hq.units[0];
    F.nobuzane.hp = F.nobuzane.maxHp = 230;
    F.nobuzane.dmg = 12;
    F.hq = hq;

    // ---- 武田の見張り（赤い輪の内に入ると見つかる） ----
    F.watch = WATCH.map((w, i) => {
      const g = enemyGroup(rt, { faction: 'takeda', name: '見張り', anchor: { x: w.x, z: w.z }, facing: i === 2 ? 1.2 : 0.2, fleeDir: { x: 0, z: -1 }, aggro: 6, width: 3, morale: 70 },
        [{ type: 'ashigaru', n: 3, o: { flag: null } }]);
      rt.scene.add(campfire(W, w.x + 1.5, w.z - 1.5));
      W.addFire(w.x + 1.5, w.z - 1.5, { h: 0.1 });
      g.home = w;
      g.ringM = rt.ring(w.x, w.z, SEE, 0xd8341c, 0.4);
      rt.marker('watch' + i, w, '武田の見張り', { red: true });
      return g;
    });

    // ---- 味方：酒井忠次の別働隊（回り道を縦に並んで進む） ----
    const col = [
      { name: '先手の槍組', z: 128, list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }], fac: 'tokugawa', to: [8, 18] },
      { name: '酒井隊', z: 138, list: [{ type: 'busho', n: 1, o: { name: '酒井忠次', invuln: true, flag: 'katabami' } }, { type: 'samurai', n: 6, o: { flag: 'katabami' } }], fac: 'tokugawa', to: [28, 26] },
      { name: '織田の鉄砲衆', z: 148, list: [{ type: 'gun', n: 10 }], fac: 'oda', to: [40, 26], gun: true },
      { name: '二の槍組', z: 158, list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14, o: { flag: 'katabami' } }], fac: 'tokugawa', to: [46, 16] },
      { name: '織田の鉄砲衆', z: 166, list: [{ type: 'gun', n: 10 }], fac: 'oda', to: [14, 28], gun: true },
      { name: '三の槍組', z: 174, list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }], fac: 'tokugawa', to: [0, 26] },
    ];
    F.col = col.map((c) => {
      const g = allyGroup(rt, { faction: c.fac, name: c.name, anchor: { x: 24, z: c.z }, facing: Math.PI, formation: 'column', spacing: 1.4, order: 'path', speed: 2.9, noRout: true, aggro: 6, morale: 100, dmgMult: c.gun ? 0.5 : 0.55, fleeDir: { x: 0, z: 1 } }, c.list);
      g.path = [...BYPASS.slice(1), c.to];
      g.gun = !!c.gun;
      // 鉄砲は合図まで火蓋を切らない（夜の山で撃てば見つかる）
      if (g.gun) { g.fire = false; g.holdFire = true; }
      g.onArrive = (gg) => { gg.arrived = true; gg.order = 'hold'; gg.formation = 'line'; gg.facing = Math.PI; gg.anchor = { x: c.to[0], z: c.to[1] }; };
      return g;
    });
    F.sakaiG = F.col[1];
    F.sakai = F.col[1].units[0];
    F.spears = F.col.filter((g) => !g.gun && g !== F.sakaiG);
    F.guns = F.col.filter((g) => g.gun);
    // 久間山へ回る別の手（尾根の下の森に潜む）
    F.kumaHand = allyGroup(rt, { faction: 'tokugawa', name: '別の手', anchor: { x: -50, z: 16 }, facing: Math.PI, noRout: true, aggro: 5, dmgMult: 0.6 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }]);

    // 自分の組（組頭候補から）
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: SPAWN.x + 1, z: SPAWN.z + 4 }, Math.PI, [{ kind: 'spear', n }]);

    // ---- 大軍に見せる：森に潜む別働隊の後続と、尾根の向こうの武田、長篠城 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KIT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    F.hosts = [
      [60, 150, 34, 222, 'katabami', -20, 70, 'spear'], [-10, 168, 24, 220, 'tokugawa', 14, 88, 'spear'], [84, 96, 34, 190, 'tokugawa', 92, 0, 'mixed'],
      [-44, 92, 36, 200, 'oda', -30, 18, 'mixed'], [-70, 60, 28, 180, 'tokugawa', -118, -8, 'spear'], [96, 150, 38, 160, 'katabami', 70, 40, 'spear'],
    ].map(([x, z, d, c, f, x1, z1, kind], i) => {
      const m = DA(x, z, 12, d, c, Math.PI, f === 'oda' ? 0x2b3140 : 0x24221f, f, 71 + i, kind);
      return { m, x0: x, z0: z, x1, z1, t: 0, dur: 40 + i * 6, go: false };
    });
    // 尾根の向こう：砦の後詰と、長篠城を囲む武田の陣（北の谷を向いて並ぶ）
    F.takedaFar = [[10, -82, 40, 120, 'takeda', 'spear'], [-78, -86, 30, 100, 'furin', 'mixed'], [-20, -150, 90, 260, 'takeda', 'spear'], [40, -160, 60, 180, 'furin', 'cavalry'], [-120, -130, 50, 200, 'takeda', 'cavalry']]
      .map(([x, z, w, c, k, kind], i) => DA(x, z, w, 10, kind === 'cavalry' ? 240 : c, Math.PI, 0x3a2622, k, 81 + i, kind));
    // 遠景の村（北の谷の東の外れ。夜明けに炊事の煙）
    KIT.farVillage(rt, 124, -80, { rot: Math.PI / 2, n: 5, fields: 6, seed: 13 });
    // 長篠城（北の崖の上）：城兵の旗
    DA(-95, -170, 40, 6, 70, 0, 0x24221f, 'okudaira', 85);
    rt.scene.add(yagura(W, -118, -168), yagura(W, -70, -170));
    for (const x of [-110, -96, -82]) rt.scene.add(nobori(W, x, -164, 'okudaira', 6));

    rt.setPhase('march');
    F.fallen = 0; F.burned = 0; F.ek = 0; F.ak = 0;
    rt.obj('yose', '声を立てずに寄せ場まで進め', 'main');
    rt.obj('stealth', '見張りに見つからずに寄せよ', 'side');
    rt.marker('yose', YOSE, '寄せ場');
    rt.zone('yose', YOSE.x, YOSE.z, 12);
    rt.say('酒井忠次', `${nm(rt)}、声を立てるな。松明は消せ。……この山を越えれば、鳶ヶ巣山の砦の背じゃ`, 5);
    rt.say('酒井忠次', '近道には見張りぞ。尾根の脇を回れ。列を離れて気取られるな', 5.5);
    if (n) rt.bark('赤い輪は見張りの目の届く所。組は「ついて来い」で連れて行き、寄せ場では「待て」で揃えよ');
    else rt.bark('赤い輪は見張りの目の届く所。回り道を行く列について、寄せ場へ進め');
  },

  // 見つかった：見張りが声を上げ、砦が目を覚ます
  detect(rt, why) {
    const F = rt.flags;
    if (F.detected || F.signal) return;
    F.detected = true;
    rt.objFail('stealth');
    rt.banner('夜討ち、露見', why);
    rt.say('見張り', '敵じゃ！　夜討ちじゃあ！', 2.5);
    const p = rt.player.u.pos;
    rt.army.play('eshout', p, 2);
    rt.after(0.8, () => sfx('taiko', 0.8));
    for (const f of F.forts) for (const g of f.def) { g.morale = Math.min(100, g.morale + 10); g.aggro += 3; }
    rt.after(2.5, () => {
      rt.say('酒井忠次', 'ええい、気づかれたか！　待ってはおれぬ、法螺を吹け！', 3.5);
      rt.after(2.5, () => this.signal(rt));
    });
  },

  // 法螺の合図：一斉に砦へ
  signal(rt) {
    const F = rt.flags;
    if (F.signal) return;
    F.signal = rt.t;
    rt.setPhase('assault');
    sfx('horagai', 1);
    rt.after(0.4, () => sfx('taiko', 1));
    applyLook(rt, 'dawn');
    rt.banner('法螺の合図', '夜が白む。一斉に砦へかかる');
    rt.say('酒井忠次', '今ぞ！　砦へかかれ！　鉄砲衆、放て！', 3.5);
    rt.say('遠くの声', '砦へかかれ！', 2.5);
    if (rt.squad.length) rt.bark('「突撃」と「ついて来い」で組を動かせ。砦の口（南の虎口）から攻め込む');
    // 間に合わなかった寄せ場の任務
    if (!F.yoseDone) { if (F.detected) rt.objRemove('yose'); else rt.objFail('yose'); rt.unmark('yose'); rt.unzone('yose'); }
    if (!F.detected) {
      rt.objDone('stealth');
      rt.award((t) => t.side.push('見つからずに寄せた'), '副任務：見つからずに寄せた');
    }
    rt.objDone('wait'); rt.objRemove('wait');
    rt.after(5, () => { rt.objRemove('yose'); if (!F.detected) rt.objRemove('stealth'); });
    // 見張りは砦へ逃げ込む
    F.watch.forEach((g, i) => { rt.unmark('watch' + i); rt.scene.remove(g.ringM); if (g.count) { g.noRout = false; g.morale = 0; } });
    // 列が着いていなければ、そのまま寄せ場へ急がせる
    for (const g of F.col) if (!g.arrived) { g.speed = 4; g.formation = 'loose'; }
    // 森の大軍も尾根へ
    for (const h of F.hosts) h.go = true;
    // 別の手は少し遅れて久間山へかかる
    rt.after(40, () => { const K = F.kumaHand; F.forts[3].assaultAt = rt.t; K.order = 'assault'; K.assault = fortRoute(rt, F.forts[3]); K.speed = 3; K.formation = 'loose'; });
    for (const g of F.guns) { g.fire = true; g.holdFire = false; }
    F.fortsTxt = !rt.G.lord && (rt.G.rank || 0) >= 3 ? '先手の一手を預かり、尾根の砦を落とせ' : '尾根の砦を落とせ';   // 足軽大将ほどの者は、砦の攻め口の一手を預かる
    rt.obj('forts', `${F.fortsTxt}（0/5）`, 'main');
    if (F.fortsTxt !== '尾根の砦を落とせ') rt.after(3, () => rt.say('酒井忠次', `${nm(rt)}、その方は先手の一手じゃ。組を率いて砦の口を破れ`, 3.5));
    rt.obj('burn', '落とした砦の櫓に火をかけよ（0/3）', 'side');
    this.attackFort(rt, 0);
    // 最初の一斉射撃
    rt.after(1.2, () => {
      const f = F.forts[0];
      for (let i = 0; i < 8; i++) rt.army.smoke(f.x - 14 + i * 4, rt.world.heightAt(f.x, f.z + f.rz + 18) + 1.4, f.z + f.rz + 18, 0, -1);
      rt.army.play('gun', { x: f.x, z: f.z + f.rz + 18 }, 1.5);
      rt.banner('一斉射', '鉄砲衆が、寝込みの砦へ揃えて放つ');
      for (const g of f.def) g.morale = Math.max(10, g.morale - 22);
    });
  },

  attackFort(rt, i) {
    const F = rt.flags;
    const f = F.forts[i];
    F.fi = i;
    F.fortT = rt.t;
    f.assaultAt = rt.t;
    rt.marker('fort', { x: f.x, z: f.z }, () => `${f.name}砦・${moraleWord(Math.max(...f.def.map((g) => (g.count ? g.morale : 0))))}`, { red: true });
    rt.marker('mouth', { x: f.x, z: f.zg + 1 }, () => (f.gate.alive ? `${f.name}の木戸（味方が破る）` : `${f.name}の虎口`), { h: 2 });
    rt.objProgress('forts', `いま：${f.name}砦`);
    // 木戸が破れるまでの控え場（矢の届かぬ所）
    f.waitAt = { x: f.x + 3, z: f.zg + (f.key === 'tobi' ? 24 : 22) };
    if (f.gate.alive) {
      rt.zone('hikae', f.waitAt.x, f.waitAt.z, 5);
      rt.marker('hikae', f.waitAt, '控え場（矢の届かぬ所）', { h: 1.5 });
      rt.after(i === 0 ? 4 : 2, () => { if (f.gate.alive) rt.say('酒井忠次', '控え場で組をそろえよ。木戸が破れたら、一気に入れ！', 4.5); });
    }
    for (const g of F.spears) {
      g.order = 'assault'; g.assault = fortRoute(rt, f); g.formation = 'loose'; g.speed = 3.6;
      for (const u of g.units) u.aiT = Math.random() * 0.6;
    }
    F.guns.forEach((g, k) => { g.order = 'attack'; g.seekRange = 34; g.formation = 'line'; g.anchor = { x: f.x + (k ? 10 : -10), z: f.z + f.rz + 15 }; g.facing = Math.PI; });
    const S = F.sakaiG;
    S.order = 'move'; S.dest = { x: f.x + 5, z: f.z + f.rz + 12 }; S.speed = 3.2;
    S.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; };
    // 夜明け前から五つの砦を続けて攻める長い戦：組頭候補までの時は、砦の守兵の打ち込みを少し軽く（寝込みを襲われた守兵）
    for (const g of f.def) { g.aggro = 12; if (!rt.G.lord && (rt.G.rank || 0) <= 1 && !g._soft) { g._soft = true; g.dmgMult = (g.dmgMult || 1) * 0.8; } }
    if (i > 0) rt.after(7, () => { if (F.fi === i && !f.fallen) volley(rt, F.guns, { who: '酒井忠次', waitLine: '', line: `鉄砲衆、${f.name}の塀へ放て！　崩れた所へ槍を入れよ`, r: 60, hit: 16 }); });
    if (f.key === 'naka' && !F.kumaCav) {
      F.kumaCav = true;
      rt.after(10, () => {
        if (f.fallen) return;
        const c = enemyGroup(rt, { faction: 'takeda', name: '武田の騎馬の後詰', anchor: { x: f.x - 26, z: -92 }, facing: 0, order: 'attack', seekRange: 70, aggro: 14, width: 8, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6, speed: 3.2 },
          [{ type: 'samurai', n: 1, o: { horse: true, hat: 'kabuto_m' } }, { type: 'cavalry', n: 5 }]);
        KIT.backOf(rt, c, { flag: 'takeda', armor: 0x3a2622, kind: 'cavalry', w: 22, depth: 14, count: 140, gap: 4, seed: 97, stop: () => c.center().z > -70 });
        rt.banner('武田の騎馬', '谷の向こうから、砦の後詰が駆け上がる');
        rt.say('酒井忠次', '騎馬じゃ！　柵を背に槍を立てよ。細道で一騎ずつ落とせ！', 4.5);
        rt.marker('kcav', centerOf(c), () => `武田の騎馬・${moraleWord(c.morale)}`, { red: true, group: c });
        F.cav = c;
        // 判断：騎馬をどう受けるか（時間切れは柵を背に受ける）
        rt.after(2, () => rt.choose('武田の騎馬が谷から駆け上がる。どう受ける？', [
          { label: '砦の柵を背に、槍を立てて受ける', note: '堅い。騎馬の勢いを殺せる。手柄は並' },
          { label: '騎馬の横へ回り込んで突く', note: '崩せば大手柄。踏まれやすい' },
        ], (k) => {
          F.cavSide = k === 1;
          if (k === 0) { c.dmgMult = 0.45; rt.say('酒井忠次', 'よし、槍を立てよ！　馬は槍の穂先へは突っ込めぬ', 3); }
          else rt.say('酒井忠次', '横じゃ、横を突け！　馬は横へは曲がれぬ', 3);
        }, 14));
        rt.after(90, () => { if (c.count && !c.routed) { c.noRout = false; c.morale = 0; F.cavLate = true; } rt.unmark('kcav'); });
      });
    }
    if (f.key === 'tobi') {
      // 最後の砦は旗本が固い。味方は遠巻きに撃ち、口で押し合う
      for (const g of F.guns) g.dmgMult = 0.25;
      for (const g of F.spears) g.dmgMult = rt.squad.length ? 0.45 : 0.6;
      rt.obj('nobuzane', '鳶ヶ巣山砦の河窪信実を討て', 'main');
      rt.marker('nobu', unitPos(F.nobuzane), '河窪信実', { red: true });
      applyLook(rt, 'morning');
    }
  },

  fortFell(rt, i, byOthers) {
    const F = rt.flags;
    const f = F.forts[i];
    if (f.fallen) return;
    f.fallen = true;
    F.fallen++;
    openGate(rt, f);
    // 砦を一つ落とすごとに、次の砦へ向かう間に息を整え、傷を縛る（五つの砦を続けて攻める長い夜明け。組頭候補まで）
    { const u = rt.player.u; if (u.alive && !rt.G.lord && (rt.G.rank || 0) <= 1 && u.hp < u.maxHp * 0.7) { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.3); rt.bark('砦を落とした。息を整え、傷を縛った'); } }
    f.yagura.userData.lookout.visible = false;
    for (const g of f.def) if (g.count) { g.noRout = false; g.morale = 0; }
    rt.obj('forts', `${F.fortsTxt || '尾根の砦を落とせ'}（${F.fallen}/5）`, 'main');
    if (f.key !== 'tobi') rt.banner(`${f.name}砦、落ちたり`, byOthers ? '別の手が攻め落とした' : `残る砦 ${5 - F.fallen}`);
    sfx('horagai', 0.6);
    rt.army.play('eshout', { x: f.x, z: f.z }, 1.6);
    if (byOthers) {
      rt.say('伝令', `${f.name}、別手が攻め落とし申した！`, 3.5);
      this.burn(rt, i, false);
      return;
    }
    rt.unmark('fort'); rt.unmark('mouth'); rt.unzone('hikae'); rt.unmark('hikae');
    // 櫓に火をかける
    rt.addInteract('burn' + i, { x: f.yx, z: f.yz + 1.8 }, '櫓に火をかける', () => this.burn(rt, i, true), { r: 3.6, hold: 1.5 });
    rt.marker('yagura' + i, { x: f.yx, z: f.yz, y: rt.world.heightAt(f.yx, f.yz) + f.yagura.userData.H }, '櫓（火をかける）', { h: 1 });
    rt.after(60, () => { if (!f.burned) { this.burn(rt, i, false); rt.bark(`${f.name}の櫓に、味方が火をかけた`); } });
  },

  burn(rt, i, mine) {
    const F = rt.flags;
    const f = F.forts[i];
    if (f.burned) return;
    f.burned = true;
    rt.uninteract('burn' + i);
    rt.unmark('yagura' + i);
    const W = rt.world;
    const H = f.yagura.userData.H;
    f.yagura.userData.lookout.visible = false;
    f.fires = [W.addFire(f.yx, f.yz, { h: H - 0.4 }), W.addFire(f.yx + 0.7, f.yz - 0.5, { h: H + 0.8 }), W.addFire(f.yx - 0.6, f.yz + 0.4, { h: 0.3 })];
    f.burnT = 0;
    sfx('wood', 0.8);
    if (mine && F.burned < 3) {
      F.burned++;
      rt.objProgress('burn', '');
      rt.obj('burn', `落とした砦の櫓に火をかけよ（${Math.min(3, F.burned)}/3）`, 'side');
      rt.bark(`${f.name}の櫓に火をかけた`);
      if (F.burned === 3) {
        rt.objDone('burn');
        rt.award((t) => t.side.push('砦の櫓を焼いた'), '副任務：砦の櫓を焼いた');
        rt.say('酒井忠次', '櫓が燃えれば、長篠の城からも見えよう。ようやった', 3);
      }
    }
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    for (const h of F.hosts) moveHost(rt, h, dt);
    KIT.backTick(rt);
    // 燃える櫓：煙を上げ、しばらくして傾き崩れる
    for (const f of F.forts) {
      if (!f.fires) continue;
      f.burnT += dt;
      f.smokeT = (f.smokeT || 0) - dt;
      if (f.smokeT <= 0) { f.smokeT = 2.2; rt.army.smoke(f.yx, rt.world.heightAt(f.yx, f.yz) + f.yagura.userData.H + 1.5, f.yz, 0, 0); }
      if (f.burnT > 22 && f.burnT < 26) {
        const k = (f.burnT - 22) / 4;
        f.yagura.rotation.z = 0.45 * k * k;
        f.yagura.position.y = rt.world.heightAt(f.yx, f.yz) - 1.2 * k;
        for (const fr of f.fires.slice(0, 2)) fr.base -= dt * 1.1;
      }
    }
    if (rt.phase === 'march' || rt.phase === 'wait') this.approach(rt, dt);
    if (rt.phase === 'assault') this.assault(rt, dt);
    if (rt.phase === 'relief') this.relief(rt, dt);
    if (F.dpOn) depthTick(rt, dt);
  },

  approach(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    // 見張り：自分か組の者が赤い輪に入れば見つかる
    const who = [rt.player.u, ...rt.squad.filter((s) => s.alive)];
    for (const g of F.watch) {
      if (!g.count || F.detected) continue;
      const w = g.home;
      if (who.some((u) => Math.hypot(u.pos.x - w.x, u.pos.z - w.z) < SEE)) {
        g.order = 'attack'; g.seekRange = 30; g.morale = 100;
        this.detect(rt, '見張りに気づかれた');
      }
      // 近づきかけたら知らせる
      const d = Math.hypot(p.x - w.x, p.z - w.z);
      if (d < SEE + 8 && !F.nearWarn) { F.nearWarn = true; rt.bark('見張りが近い！　赤い輪に入るな', true); rt.after(15, () => { F.nearWarn = false; }); }
    }
    // 砦に近づきすぎても見つかる
    if (!F.detected && F.forts.some((f) => Math.hypot(p.x - f.x, p.z - f.z) < f.r + 16)) this.detect(rt, '砦の番兵に気づかれた');
    // 寄せ場
    if (!F.yoseDone) {
      const alive = rt.squad.filter((s) => s.alive);
      const near = alive.filter((s) => Math.hypot(s.pos.x - YOSE.x, s.pos.z - YOSE.z) < 15).length;
      const pd = Math.hypot(p.x - YOSE.x, p.z - YOSE.z);
      const ok = pd < 12 && near >= Math.ceil(alive.length * 0.6);
      rt.objProgress('yose', pd < 12 && !ok ? '組が揃っていない' : '');
      if (ok) {
        F.yoseDone = true;
        rt.setPhase('wait');
        rt.objDone('yose'); rt.unmark('yose'); rt.unzone('yose');
        rt.obj('wait', '法螺の合図まで仕掛けるな', 'order');
        rt.say('酒井忠次', 'ここが寄せ場じゃ。組を揃えて待て。法螺が鳴るまで、音を立てるな', 4.5);
        if (rt.squad.length) rt.say('', '号令で組に「待て」。合図のあとは「突撃」', 4.5);
      }
    }
    // 合図：列が寄せ場に揃い、しばらく息を整えてから（遅れても三分半で鳴る）
    const arrived = F.col.every((g) => g.arrived);
    if (arrived && !F.colAt) F.colAt = rt.t;
    if (!F.signal && !F.detected && ((F.yoseDone && F.colAt && rt.t - Math.max(F.colAt, F.waitFrom || 0) > 12) || rt.t > 170)) this.signal(rt);
    if (rt.phase === 'wait' && !F.waitFrom) F.waitFrom = rt.t;
    if (rt.phase === 'wait') rt.objProgress('wait', arrived ? 'まもなく夜が明ける' : '後続の列を待っている');
  },

  assault(rt, dt) {
    const F = rt.flags;
    const f = F.forts[F.fi];
    const gone = (g) => g.count === 0 || g.routed;
    // 木戸は、寄せてしばらくすれば丸太で打ち破る（柵越しの揉み合いで長引かないように）
    for (const q of F.forts) {
      if (q.assaultAt && q.gate.alive && rt.t - q.assaultAt > 24) {
        rt.army.damage(q.gate, 99999, null);
        rt.army.play('knock', { x: q.x, z: q.zg }, 1.5);
      }
    }
    // 騎馬を崩した手柄（横へ回った時は大手柄）
    if (F.cav && !F.cavDone && (F.cav.count === 0 || F.cav.routed)) {
      F.cavDone = true; rt.unmark('kcav');
      if (!F.cavLate) {
        if (F.cavSide) rt.award((t) => { t.special = { label: '武田の騎馬の横を突いて崩した', pts: 15 }; }, '武田の騎馬の横を突いた');
        else rt.award((t) => t.side.push('武田の騎馬を槍で受け止めた'), '武田の騎馬を受け止めた');
        rt.say('酒井忠次', '騎馬が谷へ逃げるぞ！　ようやった', 3);
      }
    }
    // 久間山は別の手が攻める（落ちれば知らせが来る）
    const K = F.forts[3];
    if (!K.fallen && K.def.every(gone)) this.fortFell(rt, 3, true);
    // いまの砦：守兵が崩れるか討たれれば落ちる。残り僅かなら逃げ出す。長引けば崩れる
    if (f && !f.fallen && f.key !== 'tobi') {
      const left = f.def.reduce((a, g) => a + (gone(g) ? 0 : g.count), 0);
      if (left <= 2 || rt.t - F.fortT > 115) for (const g of f.def) { g.noRout = false; g.morale = Math.min(g.morale, 10); }
      if (f.def.every(gone)) {
        this.fortFell(rt, F.fi);
        const next = F.fi === 2 ? 4 : F.fi + 1;
        if (F.fi === 2 && !K.fallen) rt.after(3, () => { if (!K.fallen) this.fortFell(rt, 3, true); });
        const nf = F.forts[next];
        rt.after(F.fi === 2 ? 8 : 5, () => {
          rt.say('酒井忠次', next === 4 ? '残るは鳶ヶ巣山！　河窪信実の首、挙げよ！' : `次は${nf.name}じゃ！　息をつかせるな！`, 3.5);
          this.attackFort(rt, next);
        });
        F.fi = -1;
      }
    }
    // 鳶ヶ巣山：河窪信実が討たれるか、守兵が崩れれば落ちる
    const T = F.forts[4];
    if (F.fi === 4 && !T.fallen) {
      const N = F.nobuzane;
      const outer = T.def.filter((g) => g !== F.hq).every(gone);
      // 守りが尽きて長引けば、信実は味方の手に討たれる
      if (N.alive && outer && rt.t - F.fortT > 70) rt.army.kill(N, null);
      if (!N.alive || T.def.every(gone) || rt.t - F.fortT > 160) {
        if (N.alive) rt.army.kill(N, null);
        this.tobiFell(rt);
      }
    }
    // 見張りの残り（崩れて逃げる）は数に入れない
  },

  tobiFell(rt) {
    const F = rt.flags;
    const T = F.forts[4];
    this.fortFell(rt, 4);
    rt.unmark('fort'); rt.unmark('mouth'); rt.unmark('nobu');
    rt.objDone('forts'); rt.objDone('nobuzane');
    rt.after(4, () => { for (const id of ['forts', 'nobuzane', 'yose', 'stealth']) rt.objRemove(id); });
    rt.banner('鳶ヶ巣山、落ちる', '河窪信実、討死');
    rt.award((t) => { t.c.capture++; }, '鳶ヶ巣山砦を落とした');
    rt.say('酒井忠次', '鳶ヶ巣山、落ちたぞ！　勝鬨を上げよ！', 3.5);
    rt.army.celebrate(0);
    // 尾根の向こうの武田勢が退き始める
    F.takedaFar.forEach((m, i) => {
      if (i < 2) rt.after(1 + i * 2, () => m.rout({ hideAfter: 40 }));   // 砦の後詰は崩れて散る
      else rt.after(i * 2, () => m.advance(28, 28));                    // 長篠城の囲みは北の谷の向こうへ引く
    });
    this.deep(rt, () => this.reliefStart(rt));
  },

  // 段を重ねる（b_depth.js）：鳶ヶ巣山が落ちた後、谷の有海村の武田の陣と、向き直る武田の殿
  deep(rt, then) {
    const F = rt.flags;
    if (F.dpDone) return;
    F.dpDone = true;
    if (rt.G.lord) { then(); return; }
    F.dpOn = true;
    rt.setPhase('chase');
    depthStart(rt, tbCtx(rt), tbSteps(), () => { F.dpOn = false; rt.after(3, () => { const q = rt.objectives.find((x) => x.id === 'dp'); if (q && q.state) rt.objRemove('dp'); }); then(); });
  },

  reliefStart(rt) {
    const F = rt.flags;
    const T = F.forts[4];
    rt.setPhase('relief');
    F.reliefT = rt.t;
    rt.after(6, () => {
      sfx('taiko', 0.9);
      rt.banner('長篠城の城兵、打って出る', '奥平の旗が北の谷を渡ってくる');
      const g = allyGroup(rt, { faction: 'tokugawa', name: '長篠城の城兵', anchor: { x: -96, z: -150 }, facing: 0, order: 'move', speed: 3.4, noRout: true, aggro: 8, formation: 'loose' },
        [{ type: 'busho', n: 1, o: { name: '奥平信昌', invuln: true, flag: 'okudaira' } }, { type: 'samurai', n: 3, o: { flag: 'okudaira' } }, { type: 'ashigaru', n: 14, o: { flag: 'okudaira' } }]);
      g.dest = { x: T.x + 4, z: T.z - T.rz - 12 };
      g.onArrive = (gg) => { gg.order = 'hold'; gg.arrived = true; };
      F.garrison = g;
      KIT.backOf(rt, g, { flag: 'okudaira', armor: 0x24221f, kind: 'spear', w: 14, depth: 8, count: 80, seed: 93 });
      rt.obj('join', '打って出た長篠城の城兵と合流せよ', 'main');
      rt.marker('join', centerOf(g), '長篠城の城兵（奥平）');
      rt.say('酒井忠次', `${nm(rt)}、城兵を迎えよ！　搦手（北の口）から出て、谷へ下れ`, 4);
    });
  },

  relief(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    const g = F.garrison;
    if (!g || F.ending) return;
    const c = g.center();
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < 40 && !F.okuSaid) { F.okuSaid = true; rt.say('奥平信昌', '酒井殿の手の者か！　よう来てくだされた。城はまだ持っておるぞ！', 4); }
    if (d < 16 || rt.t - F.reliefT > 60) {   // 合流は歩くだけの間なので、長く待たせない
      F.ending = true;
      rt.unmark('join');
      rt.tracker.main = true;
      if (d < 16) rt.objDone('join'); else rt.objRemove('join');
      rt.award((t) => { t.main = true; }, '長篠城の囲みを解いた');
      rt.banner('長篠城の囲み、解ける', '鳶ヶ巣山の戦、終わる');
      rt.say('酒井忠次', 'これで武田は背を断たれた。設楽原の殿へ、急ぎ知らせよ！', 4);
      sfx('horagai', 0.8);
      rt.finish({}, 10);
    }
  },

  onStructDestroyed(rt, s) {
    if (!s.gate) return;
    openGate(rt, s.fort);
    sfx('wood', 1);
    rt.bark(`${s.fort.name}の木戸を打ち破った！　押し込め！`);
  },
  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
    if (v === F.nobuzane) {
      rt.unmark('nobu');
      for (const g of F.forts[4].def) { g.noRout = false; g.morale -= 40; }
      if (k && (k.isPlayer || k.isSub)) {
        rt.award((t) => { t.special = { label: '河窪信実を討つ', pts: 25 }; }, '河窪信実を討った');
        rt.say('酒井忠次', `${nm(rt)}の組が河窪信実を討ったぞ！　あっぱれじゃ！`, 3.5);
      } else rt.say('遠くの声', '河窪信実、討ち取ったりぃーっ！', 3);
    }
  },
  onPlayerHit(rt, t) {
    const F = rt.flags;
    if (!F.signal && t.team === 1 && !F.earlyHit) {
      F.earlyHit = true;
      if (!F.detected) rt.violation('合図の前に仕掛けた', ['酒井忠次', '静まれ！　声を立てるな、合図を待て！']);
      this.detect(rt, '合図の前に仕掛けた');
    }
  },
  onSquadCommand(rt, id) {
    const F = rt.flags;
    if (!F.signal && !F.detected && !F.early && (id === 'attack' || id === 'focus')) {
      F.early = true;
      rt.violation('合図の前に突撃を命じた', ['酒井忠次', '待て！　まだじゃ、法螺を待て！']);
    }
  },
  onFinish(rt) {
    const R = rt.G.rel.sakai;
    if (!R) return;
    if (rt.tracker.main) { R.trust += 10; R.like += 8; }
    if (!rt.flags.detected) R.trust += 4;
  },
};

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 砦を落とした後：谷の有海村には長篠城を囲んでいた武田の陣が残り、退く兵をまとめて向き直る。一つの波は数百の武田勢が後ろに付く
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uB = (n) => ({ type: 'bow', n }), uC = (n) => ({ type: 'cavalry', n });
const HIr = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
function tbCtx(rt) {
  const F = rt.flags, T = FORTS[4];
  return { faction: 'takeda', flag: 'takeda', armor: 0x3a2622, dmg: 0.58, mass: 220,
    friends: () => [...F.spears, F.sakaiG].filter((g) => g && g.count && !g.routed),
    botSteer: (b, inp) => {
      // 砦の中にいて段の的が外なら、まず木戸から出る（柵に突っかからない）
      const u = b.player.u, D = b.flags.dp, q = D && D.cur && D.cur.goal, f = b.flags.forts[4];
      if (!q || !inFort(u.pos, f) || inFort(q, f)) return;
      const w = exitWp(f, u.pos);
      b.player.yaw = Math.atan2(w.x - u.pos.x, w.z - u.pos.z); inp.k.add('KeyW');
    },
    aid: { name: '酒井の手の後続', faction: 'tokugawa', flag: 'katabami', list: [uS(1), uA(9)] }, aidSaid: '酒井の手の後続が加わった' };
}
function tbSteps() {
  return [
    rest({ dur: 8, heal: 0.35, bark: '鳶ヶ巣山の北の口で、組を寄せ直す（手傷を縛った）', say: [['酒井忠次', '鳶ヶ巣山は落ちた。……じゃが見よ、谷の有海村に、長篠城を囲んでいた武田の陣が残っておる'], ['足軽', '砦を取り返しに、こちらへ向かってくる……！']] }),
    pick({ title: '谷の有海村に、武田の陣が残る。どうする？',
      options: [{ label: '尾根の下で構え、寄せる武田勢を待ち受ける', note: '尾根を背に受ける。手柄は並' }, { label: '谷へ攻め下り、有海村の陣を焼く', note: '大手柄。陣の兵が大勢で向かってくる' }],
      on: (rt, m, i) => { m.down = i === 1; rt.say('酒井忠次', i === 1 ? 'よし、攻め下れ！　陣に火をかければ、設楽原の武田にも煙が見える' : '坂の上で受けよ。高みを捨てるな', 3.5); } }),
    hold({ skip: (rt, m) => m.down, at: { x: -92, z: -66 }, dur: 72, r: 13, title: '尾根の下', sub: '砦を取り返しに、武田勢が谷から上がってくる', label: '尾根の下', obj: (rt) => (HIr(rt) ? '預かった一手を尾根の下に並べ、寄せる武田勢を防げ' : '尾根の下で、寄せる武田勢を防げ'),
      waves: [
        { t: 4, say: ['足軽', '来た！　谷から、どっと上がってくる！'], foes: () => [{ name: '砦を取り返しに来た武田勢', from: { x: -76, z: -100 }, list: [uS(2), uA(12)], mass: 300, noRout: 18 }] },
        { t: 28, say: ['酒井忠次', '騎馬じゃ！　槍を立てよ、坂の上から突き落とせ！'], foes: () => [{ name: '武田の騎馬', from: { x: -118, z: -96 }, list: [uS(1), uC(5)], mass: 140, kind: 'cavalry' }] },
        { t: 46, say: ['足軽', '東の沢からも来る！'], foes: () => [{ name: '沢を上がる武田勢', from: { x: -56, z: -86 }, list: [uS(1), uA(10), uB(3)], mass: 200 }] },
      ],
      reward: '尾根の下で武田勢を防いだ', lost: ['酒井忠次', '押し込まれたか……砦の柵まで下がれ！'] }),
    fight({ skip: (rt, m) => !m.down, at: { x: -84, z: -94 }, title: '有海村', sub: '長篠城を囲んでいた武田の陣。陣の兵が向き直る', obj: (rt) => (HIr(rt) ? '預かった一手で有海村の武田の陣を崩せ' : '有海村の武田の陣を崩せ'),
      say: [['酒井忠次', '陣幕の前の槍を崩せば、陣は総崩れじゃ。鉄砲衆、先に放て！', 4]],
      foes: () => [{ name: '有海村の武田勢', from: { x: -66, z: -108 }, list: [uS(3), uA(13)], mass: 340 }],
      later: [{ t: 36, title: '横槍', sub: '谷の西から、武田の騎馬', say: ['足軽', '西から騎馬じゃ！'], foes: () => [{ name: '谷の騎馬', from: { x: -120, z: -104 }, list: [uS(1), uC(5)], mass: 140, kind: 'cavalry' }] }],
      max: 140, reward: (t) => { t.special = { label: '有海村の武田の陣を崩した', pts: 15 }; }, rewardLabel: '有海村の武田の陣を崩した',
      onEnd: (rt, m, won) => { if (won) for (const [x, z] of [[-70, -110], [-60, -104], [-78, -114]]) rt.world.addFire(x, z, { h: 1.6, size: 2.2 }); } }),
    rest({ dur: 6, heal: 0.3, bark: '組をまとめ直す', say: [['足軽', '武田の旗が……退く兵をまとめて、向き直ったぞ'], ['酒井忠次', '武田のしんがりじゃ。谷へ槍をそろえて押せ']] }),
    pick({ title: '武田の殿が、退く兵をまとめて向き直る。どうする？',
      options: [{ label: '鉄砲衆に撃たせてから突く', note: '確か。撃たれた殿は崩れやすい' }, { label: '鉄砲を待たず、槍で真っ向から突く', note: '大手柄。殿は崩れにくい' }],
      on: (rt, m, i) => {
        m.gun = i === 0;
        if (m.gun) { rt.say('酒井忠次', '鉄砲衆、前へ！　……放て！', 3); rt.after(2, () => { sfx('volley', 1); rt.banner('放て！', '織田の鉄砲衆が、殿の槍衾へ揃えて放つ'); }); }
        else rt.say('酒井忠次', 'よう言うた！　谷へかかれ！', 3);
      } }),
    fight({ at: { x: -88, z: -86 }, title: '武田の殿', sub: '退く兵をまとめた武田の殿が、槍をそろえる', obj: (rt) => (HIr(rt) ? '預かった一手を率いて、武田の殿を崩せ' : '武田の殿を崩せ'),
      foes: (rt, m) => [{ name: '武田の殿', from: { x: -100, z: -112 }, list: [uS(3), uA(12)], mass: 260, morale: m.gun ? 55 : 95 }],
      later: [{ t: 40, say: ['足軽', '谷の奥から、まだ来る！'], foes: (rt, m) => [{ name: '殿の後ろの武田勢', from: { x: -80, z: -118 }, list: [uS(2), uA(10)], mass: 220, morale: m.gun ? 60 : 90 }] }],
      max: 130, reward: (t, m) => { if (m.gun) t.side.push('武田の殿を崩した'); else t.special = { label: '槍で武田の殿を崩した', pts: 15 }; }, rewardLabel: '武田の殿を崩した' }),
    hold({ at: { x: -94, z: -98 }, dur: 55, r: 12, title: '谷の渡し', sub: '長篠城の城兵が川を渡ってくる。渡し場を守る', label: '谷の渡し',
      say: [['酒井忠次', '長篠城の城兵が打って出るぞ！　渡し場を守れ。城兵が渡りきるまで、武田を寄せるな', 4.5]],
      obj: (rt) => (HIr(rt) ? '預かった一手で谷の渡し場を守り、長篠城の城兵を迎えよ' : '谷の渡し場を守り、長篠城の城兵を迎えよ'),
      waves: [
        { t: 4, say: ['足軽', '退き遅れた武田勢が、渡しへ寄せてくる！'], foes: () => [{ name: '退き遅れた武田勢', from: { x: -62, z: -102 }, list: [uS(2), uA(11)], mass: 240 }] },
        { t: 26, say: ['酒井忠次', '騎馬じゃ！　渡しの前で槍を立てよ！'], foes: () => [{ name: '谷の西の騎馬', from: { x: -130, z: -96 }, list: [uS(1), uC(5)], mass: 140, kind: 'cavalry' }] },
      ],
      reward: '谷の渡し場を守った' }),
  ];
}

// 両軍の総勢（別働隊 およそ四千、砦の武田 千ほど）。落ちた砦の数と討たれた兵で減らす
tobinosu.force = (rt) => {
  const F = rt.flags;
  const b = Math.max(0, Math.round(1000 - (F.fallen || 0) * 170 - (F.ek || 0) * 4));
  return { a: 4000 - (F.ak || 0) * 20, a0: 4000, b: F.ending ? Math.min(b, 60) : b, b0: 1000 };
};
tobinosu.sides = { a: { name: '酒井忠次の別働隊', mon: 'katabami' }, b: { name: '武田軍（砦の守兵）', mon: 'takeda' } };
tobinosu.date = (rt) => `天正三年五月二十一日　夏・${{ night: '夜明け前', dawn: '夜明け', morning: '朝' }[rt.flags.look] || '夜明け前'}`;
tobinosu.history = '天正三年五月二十日の軍議で、酒井忠次は長篠城を囲む鳶ヶ巣山の砦を背から突く策を進言した。信長はその場では退けたが、あとで忠次を呼んでこれを許し、自らの鉄砲衆を付けて送り出したと伝わる。別働隊はおよそ四千、夜のうちに山を越え、夜明けとともに砦を次々に落とした。守将の河窪信実（信玄の弟）は討ち死にし、長篠城の囲みは解けた。背を断たれた武田勢は、設楽原で前へ出ることになる。';

// 行軍と待ちを飛ばす（二度目以降の人が、同じ山道を歩かされないように）
tobinosu.canSkip = (rt) => (rt.phase === 'march' && !rt.flags.detected ? '寄せ場まで進む' : rt.phase === 'wait' && !rt.flags.signal ? '合図まで待つ' : '');
tobinosu.skip = (rt) => {
  const F = rt.flags;
  if (rt.phase === 'march') {
    for (const g of F.col) {
      const end = g.path[g.path.length - 1];
      g.anchor = { x: end[0], z: end[1] };
      g.pathIdx = g.path.length;
      g.formation = 'line'; g.facing = Math.PI;
      g.units.forEach((u, i) => { const q = g.slotPos(i, g.initial); u.pos.x = q.x; u.pos.z = q.z; });
      if (g.onArrive) { const f = g.onArrive; g.onArrive = null; f(g); }
    }
    const u = rt.player.u;
    u.pos.x = YOSE.x; u.pos.z = YOSE.z + 2;
    rt.squad.forEach((s, i) => { s.pos.x = YOSE.x - 3 + (i % 3) * 1.6; s.pos.z = YOSE.z + 6 + Math.floor(i / 3) * 1.6; });
    for (const g of rt.squadGroups) g.anchor = { x: YOSE.x, z: YOSE.z + 6 };
    rt.player.camInit = false;
    rt.say('', '――見張りの篝火を横目に、夜の山を半刻ほど進んだ', 3);
  } else if (rt.phase === 'wait') F.colAt = F.waitFrom = rt.t - 13;
};

// bot の遊び方：回り道を通って寄せ場へ。合図で砦へ、口から入って守兵を突く。落ちた砦の櫓は焼く。最後は城兵のもとへ
tobinosu.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.guardHold = false;
  if (!u.alive) return;
  if (F.dpOn) { depthBot(b, inp, goTo); return; }
  const sq = b.squadGroups[0];
  const cmd = (key) => { if (!(b.botCmdT > b.t)) { inp.e.add(key); b.botCmdT = b.t + 2; } };
  if (b.phase === 'march' || b.phase === 'wait') {
    if (sq && b.phase === 'march' && sq.order !== 'follow') cmd('KeyZ');
    if (b.phase === 'march') {
      // 回り道の点を順にたどる
      const wp = [...BYPASS.slice(1), [YOSE.x, YOSE.z]];
      F.botWp = F.botWp || 0;
      const q = wp[Math.min(F.botWp, wp.length - 1)];
      if (Math.hypot(q[0] - u.pos.x, q[1] - u.pos.z) < 4 && F.botWp < wp.length - 1) F.botWp++;
      goTo(p, inp, q[0], q[1], 2);
    } else {
      goTo(p, inp, YOSE.x, YOSE.z, 3);
      if (sq && sq.order !== 'hold') cmd('KeyX');
    }
    return;
  }
  // 戦い：近くの敵へ（柵越しの敵は追わない）
  const f = F.fi >= 0 ? F.forts[F.fi] : null;
  const zone = (q) => (!f || !inFort(q, f) ? 0 : inCourt(q, f) ? 1 : 2);
  const same = (o) => zone(o.pos) === zone(u.pos) || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 3;
  const e = b.army.nearestEnemy(u, 16, (o) => !o.fleeing && same(o));
  if (sq && b.phase === 'assault' && e && sq.order !== 'attack') cmd('KeyC');
  if (sq && !e && (sq.order === 'attack' || sq.order === 'hold')) cmd('KeyZ');
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6;
    return;
  }
  // 落ちた砦の櫓が近ければ焼く
  const it = b.nearestInteract();
  if (it && it.id.startsWith('burn')) { inp.k.add('KeyE'); return; }
  const bi = F.forts.findIndex((q, k) => q.fallen && !q.burned && b.interacts.some((x) => x.id === 'burn' + k) && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) < 45);
  let tgt = null;
  if (bi >= 0) { const q = F.forts[bi]; tgt = { f: q, x: q.yx, z: q.yz + 1.8 }; }
  else if (b.phase === 'relief' && F.garrison) {
    const T = F.forts[4];
    const c = F.garrison.center();
    // 砦の中なら搦手（北の口）から出る
    if (inFort(u.pos, T, -1) && !inCourt(u.pos, T) && (Math.abs(u.pos.x - T.x) > 1.2 || u.pos.z > T.z - T.rz + 2)) tgt = { x: T.x, z: T.z - T.rz + 0.5 };
    else if (inCourt(u.pos, T)) tgt = { x: T.x + T.side * (T.g + 2.6), z: T.zw - 3 };
    else tgt = { x: c.x, z: c.z };
    goTo(p, inp, tgt.x, tgt.z, 1);
    return;
  } else if (f) {
    // 木戸が破れるまで、また鳶ヶ巣山では味方の槍組が取り付くまで、虎口の前で待つ
    const inside = F.spears.reduce((a, g) => a + g.units.filter((s) => s.alive && inFort(s.pos, f)).length, 0);
    const wait = f.gate.alive || (b.t - F.fortT < (f.key === 'tobi' ? 40 : 12) && inside < 6);
    tgt = wait ? f.waitAt : { f, x: f.x, z: f.z };
  }
  if (!tgt) return;
  // 別の砦の中にいれば、まず木戸から出る
  const here = F.forts.find((o) => inFort(u.pos, o) && o !== tgt.f);
  if (here) { const w = exitWp(here, u.pos); goTo(p, inp, w.x, w.z, 0.8); return; }
  // 砦の外から中へは、木戸を通り、枡で折れて入る
  const q = tgt.f;
  if (q && (!inFort(u.pos, q, 0.4) || inCourt(u.pos, q))) { const w = entryWp(q, u.pos); goTo(p, inp, w.x, w.z, 0.8); return; }
  goTo(p, inp, tgt.x, tgt.z, 1.5);
};
