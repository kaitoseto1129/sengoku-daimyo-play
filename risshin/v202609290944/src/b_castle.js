// ======================================================================
// 日本地図から攻める城攻め・守る戦（3D）
// 城の型（山城・平城・砦）と石高から縄張りを組み立てる。名のある大きな城は一段と大きく立派に
//   山城：尾根を削った曲輪を段に重ね、切岸・横堀・堀切・竪堀・土塁・柵・木戸・物見櫓
//   平城：水堀・石垣（古い城は土塁）・白い土塀と狭間・隅櫓・枡形の櫓門・本丸の御殿（大きな城は天守）
//   砦　：土塁と空堀・逆茂木・乱杭・木戸・蔀の柵
// 攻める戦：竹束を押して寄せ場へ → 門破り（掛矢・梯子で塀を越えて閂を外す・櫓の射手を黙らせる）→ 城兵の打って出 →
//           本丸の御殿の前で城将と一騎打ち → 落城
// 守る戦（info.defend）：塀の内の持ち場で、寄せ手の梯子を突き落とし、石落としで門を守り、搦手から打って出る
// 向き：寄せ手は南（+z）、城は北（-z）。大手はどれも南を向く
// 地図の戦は BATTLES の並びに入れない（戦功・昇進には数えない。main.js の startMapBattle から始める）
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { jinmaku, nobori, hut, tawara, campfire, stumps, solidRect, solidCircle, castleStoneMat, castleMat, ishigaki } from './props.js';
import { woodTex } from './nature.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine, attachSama } from './bhelp.js';
import { K } from './settings.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { isTouch } from './touch.js';
import { volleyTick } from './b_sekigahara.js';
const EK = () => (isTouch ? '「取る」' : K('use'));

// 家の名から、旗の紋（textures.js の drawMon の鍵）と兵の家（units.js の FACTION）へ
export const MON_OF = { 徳川家: 'tokugawa', 織田家: 'oda', 武田家: 'takeda', 今川家: 'imagawa', 斎藤家: 'saito', 奥平家: 'okudaira',
  北条家: 'hojo', 上杉家: 'uesugi', 毛利家: 'mori', 島津家: 'shimazu', 伊達家: 'date', 真田家: 'sanada', 豊臣家: 'toyotomi', 石田家: 'ishida',
  浅井家: 'azai', 朝倉家: 'asakura', 長宗我部家: 'chosokabe', 大友家: 'otomo', 佐竹家: 'satake', 前田家: 'maeda', 三好家: 'miyoshi', 黒田家: 'kuroda' };
const FAC_OF = { 徳川家: 'tokugawa', 織田家: 'oda', 武田家: 'takeda', 今川家: 'imagawa', 斎藤家: 'saito' };
export const TYPE_NAME = { yama: '山城', hira: '平城', toride: '砦' };
// 名のある大きな城（石高に関わらず、一段と大きく立派に）
const GRAND = new Set(['小田原城', '大坂城', '駿府館', '岐阜城', '春日山城', '躑躅ヶ崎館', '安土城', '一乗谷城', '吉田郡山城', '観音寺城',
  '月山富田城', '江戸城', '清洲城', '小谷城', '甲府城', '北庄城', '府内館', '姫路城', '伏見城', '会津若松城', '米沢城']);
// 天守を上げた城（天守の無い頃の大きな城は、御殿の脇に二重櫓）
const TENSHU = new Set(['大坂城', '安土城', '岐阜城', '姫路城', '伏見城', '北庄城', '甲府城', '会津若松城', '江戸城']);
// 石垣の城（古い土の城は土塁に土塀）
const STONE = new Set(['大坂城', '安土城', '観音寺城', '岐阜城', '姫路城', '伏見城', '北庄城', '甲府城', '江戸城', '会津若松城', '小谷城']);

// ---------------- 小さな算術 ----------------
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const sm = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
// 堀の断面：|d| が hw - edge より内は 1、hw より外は 0
const trap = (d, hw, edge) => sm(hw, hw - edge, d);
const mix = (a, b, t) => a + (b - a) * t;
// 四角の縁からの距離（内は負）
function rectD(R, x, z) {
  const dx = Math.max(R.x0 - x, x - R.x1), dz = Math.max(R.z0 - z, z - R.z1);
  if (dx <= 0 && dz <= 0) return Math.max(dx, dz);
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
}
// 楕円の縁からの距離（内は負。おおよそ）
const ellD = (E, x, z) => (Math.hypot((x - E.cx) / E.rx, (z - E.cz) / E.rz) - 1) * (E.rx + E.rz) / 2;
const inR = (R, x, z, m = 0) => x > R.x0 - m && x < R.x1 + m && z > R.z0 - m && z < R.z1 + m;
const grow = (R, m) => ({ x0: R.x0 - m, x1: R.x1 + m, z0: R.z0 - m, z1: R.z1 + m });
// 線分が四角を横切るか
function segRect(ax, az, bx, bz, R) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const p = [-dx, dx, -dz, dz], q = [ax - R.x0, R.x1 - ax, az - R.z0, R.z1 - az];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
const segDist = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az;
  const t = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};

// 線 pts を、点 c のまわり（半幅 hw）で切る（木戸の口を空ける）
function cutAt(pts, c, hw) {
  const out = [];
  let cur = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const t = clamp01(((c.x - ax) * (bx - ax) + (c.z - az) * (bz - az)) / (len * len));
    if (Math.hypot(ax + (bx - ax) * t - c.x, az + (bz - az) * t - c.z) < 0.6 && t * len > hw && (1 - t) * len > hw) {
      const t0 = t - hw / len, t1 = t + hw / len;
      cur.push([ax + (bx - ax) * t0, az + (bz - az) * t0]);
      out.push(cur);
      cur = [[ax + (bx - ax) * t1, az + (bz - az) * t1]];
    }
    cur.push([bx, bz]);
  }
  out.push(cur);
  return out.filter((q) => q.length > 1);
}
// 線 pts を、長さ L ほどの切れ端に分ける
function chop(pts, Lm) {
  const out = [];
  let cur = [pts[0]], acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    let [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    let len = Math.hypot(bx - ax, bz - az);
    while (acc + len > Lm) {
      const t = (Lm - acc) / len;
      const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      cur.push([px, pz]); out.push(cur);
      cur = [[px, pz]]; ax = px; az = pz; len = Math.hypot(bx - ax, bz - az); acc = 0;
    }
    cur.push([bx, bz]); acc += len;
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

// ---------------- 形の道具（動かない物は、建物ごとに一つの形にまとめる） ----------------
let MATS = null;
function stoneTex() {
  // 石垣：大小の石を積んだ面（野面積み）。目地は暗く
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3733'; g.fillRect(0, 0, 256, 256);
  let s = 7;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let row = 0, y = 0; y < 256; row++) {
    const h = 22 + R() * 18;
    for (let x = -R() * 30; x < 256;) {
      const w = 26 + R() * 38;
      const v = 150 + R() * 60, t = R() * 14 - 7;
      g.fillStyle = `rgb(${v + t},${v + t * 0.6},${v - 8})`;
      g.beginPath();
      const j = () => (R() - 0.5) * 5;
      g.moveTo(x + 2 + j(), y + 2 + j()); g.lineTo(x + w - 2 + j(), y + 2 + j()); g.lineTo(x + w - 2 + j(), y + h - 2 + j()); g.lineTo(x + 2 + j(), y + h - 2 + j());
      g.closePath(); g.fill();
      // 上の縁は明るく、下は影
      g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 3, y + 3, w - 6, 3);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 3, y + h - 6, w - 6, 3);
      x += w;
    }
    y += h;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function mats() {
  if (MATS) return MATS;
  MATS = {
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ vertexColors: true, map: woodTex(), roughness: 0.9, metalness: 0 }),
    // 石垣は props.js の野面積みの面（苔と水の筋、凹凸つき）を使い回す（A4）
    stone: castleStoneMat(),
    // 白壁（汚れ・剥げ・雨だれ）と本瓦（丸瓦の列）は props.js の素材を使い回す（A4）
    plaster: castleMat('plaster'), tile: castleMat('tile'), shitami: castleMat('shitami'),
    water: new THREE.MeshStandardMaterial({ color: 0x2c3a36, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.92, envMapIntensity: 0.6 }),
  };
  return MATS;
}
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const vary = (hex, k) => new THREE.Color(hex).multiplyScalar(0.86 + (((Math.abs(k) * 7919) % 37) / 37) * 0.28).getHex();
// 形を集める入れ物：素材ごと（白壁や瓦 = plain、木 = wood、石垣 = stone）
const bag = () => ({ plain: [], wood: [], stone: [], plaster: [], tile: [], shitami: [] });
// 入れ物の中身を形にして場に置く（cam：カメラがめり込まない相手にする）
function flush(rt, B, cam = true) {
  const M = mats();
  for (const k of ['plain', 'wood', 'stone', 'plaster', 'tile', 'shitami']) {
    if (!B[k].length) continue;
    const geo = mergeGeometries(B[k]);
    // 白壁と瓦は、絵の大きさを世界の大きさにそろえる（大きな面で伸びないように）
    if (k === 'plaster' || k === 'tile' || k === 'shitami') { const P = geo.attributes.position, U = geo.attributes.uv, n = geo.attributes.normal, kk = k === 'tile' ? 0.45 : 0.4; for (let i = 0; i < P.count; i++) { const ax = Math.abs(n.getX(i)) > Math.abs(n.getZ(i)); U.setXY(i, (ax ? P.getZ(i) : P.getX(i)) * kk, (k === 'tile' ? (ax ? P.getX(i) : P.getZ(i)) * 0.3 + P.getY(i) : P.getY(i) - 0.3) * kk); } }
    const m = new THREE.Mesh(geo, M[k]);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.camBlock = cam;
    rt.scene.add(m);
    B[k] = [];
  }
}
// 置いた向きの箱（rot は y 軸まわり）
function box(P, hex, x, y, z, w, h, d, rot = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  P.push(paint(g, hex));
}
// 石の箱：面ごとに UV を大きさに合わせる（石の大きさがそろうように）
function stoneBox(P, hex, x, y, z, w, h, d, rot = 0, tilt = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / 2.2, uv.getY(i) * dims[f][1] / 2.2); }
  if (tilt) g.rotateX(tilt);
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  P.push(paint(g, hex));
}
// 箱を線 (ax,az)-(bx,bz) の向きに置く（out：左手側へずらす量）
function boxAlong(P, hex, ax, az, bx, bz, w, h, d, y, out = 0) {
  const len = Math.hypot(bx - ax, bz - az);
  const g = new THREE.BoxGeometry(len * w, h, d);
  const nx = -(bz - az) / len, nz = (bx - ax) / len;
  g.rotateY(Math.atan2(-(bz - az), bx - ax));
  g.translate((ax + bx) / 2 + nx * out, y, (az + bz) / 2 + nz * out);
  P.push(paint(g, hex));
}
// 線に沿って置いた板を、外（out の側）へ傾ける：瓦の屋根の片面（tilt > 0 で外へ下る）
function slopeAlong(P, hex, ax, az, bx, bz, w, th, d, y, out, tilt) {
  const len = Math.hypot(bx - ax, bz - az);
  const g = new THREE.BoxGeometry(len * w, th, d);
  const nx = -(bz - az) / len, nz = (bx - ax) / len;
  g.rotateX(tilt);
  g.rotateY(Math.atan2(-(bz - az), bx - ax));
  g.translate((ax + bx) / 2 + nx * out, y, (az + bz) / 2 + nz * out);
  P.push(paint(g, hex));
}
const UP = new THREE.Vector3(0, 1, 0);
// 二点を結ぶ丸太・竹
function beam(P, ax, ay, az, bx, by, bz, r, hex, seg = 5) {
  const d = new THREE.Vector3(bx - ax, by - ay, bz - az);
  const g = new THREE.CylinderGeometry(r * 0.85, r, d.length(), seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  P.push(paint(g, hex));
}
// 切妻の屋根：棟の向き rot、長さ w（棟に沿う）、奥行 d、軒の高さ y、勾配 pitch
function gable(P, hex, x, y, z, w, d, rot, pitch = 0.5, th = 0.16) {
  for (const s of [-1, 1]) {
    const half = d / 2 / Math.cos(pitch);
    const g = new THREE.BoxGeometry(w, th, half + 0.3);
    g.rotateX(s * pitch);
    g.translate(0, y + Math.sin(pitch) * half / 2, s * d / 4);
    g.rotateY(rot); g.translate(x, 0, z);
    P.push(paint(g, hex));
  }
  const ridge = new THREE.BoxGeometry(w + 0.2, 0.22, 0.32);
  ridge.translate(0, y + Math.tan(pitch) * d / 2 + 0.06, 0);
  ridge.rotateY(rot); ridge.translate(x, 0, z);
  P.push(paint(ridge, 0x2a2828));
}
// 寄棟・入母屋の屋根：四角錐の台（軒の反りの代わりに、薄い庇の板を下に回す）
function hipRoof(P, hex, x, y, z, w, d, h, rot = 0, top = 0.3) {
  const r = Math.SQRT2 / 2;
  const g = new THREE.CylinderGeometry(r * top, r, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(w, h, d);
  if (rot) g.rotateY(rot);
  g.translate(x, y + h / 2, z);
  P.push(paint(g, hex));
  const e = new THREE.BoxGeometry(w + 0.1, 0.12, d + 0.1);
  if (rot) e.rotateY(rot);
  e.translate(x, y + 0.02, z);
  P.push(paint(e, shade(hex, 0.8)));
}
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();
// 置いた向きの点：局所 (lx, lz) を世界へ
const L = (x, z, rot) => (lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];

// ---------------- 塀・石垣・柵 ----------------
// 線の外向き（中心 c から遠い側）
function outN(ax, az, bx, bz, c) {
  const len = Math.hypot(bx - ax, bz - az);
  let nx = -(bz - az) / len, nz = (bx - ax) / len;
  if ((ax + bx) / 2 * nx + (az + bz) / 2 * nz - (c.x * nx + c.z * nz) < 0) { nx = -nx; nz = -nz; }
  return { x: nx, z: nz };
}
// 屏風折れ：長い塀の辺を、内へ浅い「く」の字に折っていく（dep：折れの深さ、tooth：一つの折れの長さ）。
//   角から margin の内と、keep の点（門・梯子・搦手）の近くは折らない
function byobu(pts, c, keep, dep = 1.1, tooth = 4.4, margin = 7) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len, uz = (bz - az) / len, N = outN(ax, az, bx, bz, c);
    for (let s = margin; s + tooth <= len - margin; s += tooth * 2) {
      const mx = ax + ux * (s + tooth / 2), mz = az + uz * (s + tooth / 2);
      if (keep.some(([kx, kz]) => Math.hypot(kx - mx, kz - mz) < 7.5)) continue;
      out.push([ax + ux * s, az + uz * s], [mx - N.x * dep, mz - N.z * dep], [ax + ux * (s + tooth), az + uz * (s + tooth)]);
    }
    out.push([bx, bz]);
  }
  return out;
}
// 土塀：石の腰、白い漆喰、長押の黒い筋、瓦の屋根。両の面に狭間（外は低い鉄砲狭間と高い矢狭間を交互に）
function dobeiLine(B, W, pts, c, o = {}) {
  let k = 0;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 1.6));
    const N = outN(ax, az, bx, bz, c);
    for (let i = 0; i < n; i++, k++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const y = Math.min(W.heightAt(mx - N.x * 0.4, mz - N.z * 0.4), W.heightAt(mx, mz) + 0.3);
      const tone = [0xd8d1c0, 0xd2cab8, 0xdcd6c6, 0xcfc7b3][k % 4];
      boxAlong(B.stone, vary(0x767166, k * 3), x0, z0, x1, z1, 1.02, 1.3, 0.62, y + 0.05);    // 腰の石（石垣より暗く、苔で青み）
      if (o.shitami) {
        // 古い城：腰から上の半ばまで、墨を塗った下見板を張る（上だけ白い漆喰）
        boxAlong(B.plaster, tone, x0, z0, x1, z1, 1.02, 1.0, 0.36, y + 1.95);
        boxAlong(B.shitami, vary(0x8a8580, k), x0, z0, x1, z1, 1.02, 0.85, 0.42, y + 1.07);
        boxAlong(B.plain, 0x1c1916, x0, z0, x1, z1, 1.02, 0.06, 0.46, y + 1.49);          // 下見板の上の見切り
      } else boxAlong(B.plaster, tone, x0, z0, x1, z1, 1.02, 1.8, 0.36, y + 1.55);         // 漆喰の壁
      // 漆喰の汚れ：軒下の雨だれの筋、足もとの泥はね、ところどころ剥げて土壁がのぞく
      boxAlong(B.plain, shade(tone, 0.78), x0, z0, x1, z1, 1.02, 0.22, 0.37, y + 2.12);
      if (!o.shitami) boxAlong(B.plain, shade(tone, 0.72), x0, z0, x1, z1, 1.02, 0.28, 0.37, y + 0.78);
      if ((k * 7919) % 11 < 2) boxAlong(B.plain, 0x8a7254, mx - (x1 - x0) * 0.2, mz - (z1 - z0) * 0.2, mx + (x1 - x0) * 0.15, mz + (z1 - z0) * 0.15, 1, 0.35 + ((k * 31) % 5) * 0.06, 0.375, y + 1.1 + ((k * 13) % 7) * 0.1);
      boxAlong(B.plain, 0x2f2c28, x0, z0, x1, z1, 1.02, 0.1, 0.38, y + 2.3);       // 長押
      // 瓦：両の面へ下る本瓦葺き（丸瓦の列は絵と凹凸で）。軒の裏は暗く、軒先に瓦の端が一列にのぞく。ところどころ色の違う瓦
      const tv = vary(0x3b3a3a, k * 5);
      for (const sd of [-1, 1]) {
        slopeAlong(B.tile, tv, x0, z0, x1, z1, 1.04, 0.1, 0.7, y + 2.5, sd * 0.3, sd * 0.4);
        boxAlong(B.plain, 0x4a4845, x0, z0, x1, z1, 1.04, 0.1, 0.07, y + 2.35, sd * 0.62);      // 軒先の瓦の端
      }
      boxAlong(B.plain, 0x151312, x0, z0, x1, z1, 1.02, 0.06, 1.1, y + 2.32);       // 軒の裏の影
      boxAlong(B.plain, 0x2e2d2d, x0, z0, x1, z1, 1.04, 0.2, 0.3, y + 2.68);        // 棟
      boxAlong(B.plain, 0x6a6863, x0, z0, x1, z1, 1.04, 0.03, 0.31, y + 2.79);      // 棟の上の熨斗瓦の明かり
      // 狭間（外と内の両の面に、同じ所に穴）。鉄砲狭間は構えた筒の高さ。穴の所は o.holes に書き、城兵が真後ろに立って撃つ
      const hy = y + (k % 2 ? 1.85 : 1.3), hh = k % 2 ? 0.36 : 0.22;
      if (o.holes) o.holes.push({ x: mx, z: mz, y: hy, kind: k % 2 ? 'bow' : 'gun' });
      const sgn = (bx - ax) * N.z - (bz - az) * N.x > 0 ? 1 : -1;   // boxAlong の out は左手側。外向きの符号にそろえる
      boxAlong(B.plain, 0x161412, x0, z0, x1, z1, 0.12, hh, 0.06, hy, sgn * 0.19);
      boxAlong(B.plain, 0x221d18, x0, z0, x1, z1, 0.12, hh, 0.06, hy, -sgn * 0.19);
      // 内の面の控え柱（二間ごと）
      if (k % 3 === 0 && !o.noBrace) {
        const px = x0 - N.x * 0.9, pz = z0 - N.z * 0.9;
        beam(B.wood, px, W.heightAt(px, pz) - 0.1, pz, x0 - N.x * 0.22, y + 1.9, z0 - N.z * 0.22, 0.07, 0x4e3a28, 4);
      }
    }
  }
}
// 石垣：塀の外の面から堀の底まで、反りをつけて積む（上ほど内へ寄る）
function ishigakiLine(B, W, pts, c, o = {}) {
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2.4));
    const N = outN(ax, az, bx, bz, c);
    const rot = Math.atan2(-(bz - az), bx - ax);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (o.skip && Math.hypot(x - o.skip.x, z - o.skip.z) < 3.5) continue;
      const top = W.heightAt(x - N.x * 0.3, z - N.z * 0.3) + 0.25;
      const bot = Math.min(W.heightAt(x + N.x * 2.6, z + N.z * 2.6), W.heightAt(x + N.x * 4, z + N.z * 4)) - 0.6;
      const h = Math.max(1.2, top - bot);
      // 面：少し外へ出して、上が内へ傾く（勾配）
      const lean = o.lean ?? 0.22;
      const cx = x + N.x * (0.6 + h * lean * 0.5), cz = z + N.z * (0.6 + h * lean * 0.5);
      const g = new THREE.BoxGeometry(len / n + 0.06, h, 1.3);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (len / n) / 2.2, uv.getY(k) * h / 2.2);
      // 外向き N の側を +z に取る向きに回し、上を内へ倒す
      const face = Math.atan2(N.x, N.z);
      g.rotateX(-lean);
      g.rotateY(face);
      g.translate(cx, bot + h / 2, cz);
      B.stone.push(paint(g, vary(0x9a958a, i + s * 7)));
      void rot;
    }
  }
}
// 柵：先を尖らせた丸太を隙間なく並べ、横木二本で結ぶ
function sakuLine(B, W, pts, h = 2.5) {
  let k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.32));
    for (let j = 0; j < n; j++, k++) {
      const t = (j + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = W.heightAt(x, z);
      const hh = h * (0.9 + ((k * 37) % 10) / 45);
      const cyl = new THREE.CylinderGeometry(0.11, 0.13, hh + 0.5, 5, 1, true); cyl.translate(x, y + hh / 2 - 0.25, z); B.wood.push(paint(cyl, vary(0x6b5238, k)));
      const tip = new THREE.ConeGeometry(0.11, 0.34, 5, 1, true); tip.translate(x, y + hh + 0.17, z); B.wood.push(paint(tip, vary(0x8a6d4a, k)));
    }
    const ya = W.heightAt(ax, az), yb = W.heightAt(bx, bz);
    for (const r of [0.5, h - 0.45]) beam(B.wood, ax, ya + r, az, bx, yb + r, bz, 0.06, 0x4e3a28, 4);
  }
}

// ---------------- 門 ----------------
// 門の扉と閂（破れると消える）。seg に沿って二枚
function doorMesh(W, seg, h = 3.1) {
  const B = bag();
  const [ax, az, bx, bz] = seg;
  const y = W.heightAt((ax + bx) / 2, (az + bz) / 2);
  for (const [t0, t1, c] of [[0.02, 0.49, 0x4a3a2a], [0.51, 0.98, 0x46372a]]) {
    const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
    boxAlong(B.wood, c, x0, z0, x1, z1, 1, h, 0.16, y + h / 2 + 0.05);
    for (const yy of [0.5, h / 2, h - 0.4]) boxAlong(B.plain, 0x2a2622, x0, z0, x1, z1, 0.96, 0.12, 0.22, y + yy);
    for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4; boxAlong(B.plain, 0x1c1a18, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, x0 + (x1 - x0) * t + 0.01, z0 + (z1 - z0) * t, 12, 0.12, 0.24, y + 1.0); }
  }
  boxAlong(B.wood, 0x3a2a1c, ax, az, bx, bz, 0.9, 0.26, 0.3, y + 1.55, 0.28);
  boxAlong(B.wood, 0x3a2a1c, ax, az, bx, bz, 0.9, 0.26, 0.3, y + 1.55, -0.28);
  const M = mats();
  const grp = new THREE.Group();
  for (const k of ['plain', 'wood']) { const m = new THREE.Mesh(mergeGeometries(B[k]), M[k]); m.castShadow = true; m.userData.camBlock = true; grp.add(m); }
  return grp;
}
// 高麗門：太い本柱に冠木、切妻の屋根。後ろに控え柱と小屋根
function koraimon(B, W, g) {
  const { c, n, w } = g;
  const y = W.heightAt(c.x, c.z);
  const rot = Math.atan2(n.x, n.z);
  const P = L(c.x, c.z, rot);
  for (const sx of [-1, 1]) {
    const [px, pz] = P(sx * (w / 2 + 0.15), 0);
    box(B.wood, 0x4e3a28, px, y + 2.0, pz, 0.46, 4.0, 0.46, rot);
    const [kx, kz] = P(sx * (w / 2 + 0.15), -2.3);
    box(B.wood, 0x4e3a28, kx, y + 1.3, kz, 0.28, 2.6, 0.28, rot);
    const [rx, rz] = P(sx * (w / 2 + 0.15), -1.15);
    gable(B.tile, 0x3b3a3a, rx, y + 2.65, rz, 2.7, 1.1, rot + Math.PI / 2, 0.4, 0.1);
  }
  box(B.wood, 0x3f2e20, c.x, y + 3.85, c.z, w + 1.7, 0.38, 0.42, rot);
  gable(B.tile, 0x3b3a3a, c.x, y + 4.15, c.z, w + 2.8, 2.0, rot, 0.45);
}
// 櫓門：門の上に白壁の渡櫓を渡す。窓（武者窓）と、扉の上の石落とし
function yaguramon(B, W, g) {
  const { c, n, w } = g;
  const y = W.heightAt(c.x, c.z);
  const face = Math.atan2(n.x, n.z), rot = face;
  const P = L(c.x, c.z, face);
  for (const sx of [-1, 1]) {
    const [px, pz] = P(sx * (w / 2 + 0.2), 0); box(B.wood, 0x4e3a28, px, y + 1.9, pz, 0.5, 3.8, 0.5, rot);
    const [ex, ez] = P(sx * (w / 2 + 1.2), 0);
    stoneBox(B.stone, 0x9a958a, ex, y + 0.6, ez, 1.9, 1.2, 3.2, rot);
    box(B.plaster, 0xd6cfbe, ex, y + 2.5, ez, 1.8, 2.6, 3.0, rot);
  }
  const Lw = w + 4.2;
  box(B.wood, 0x3a2a1c, c.x, y + 3.95, c.z, Lw, 0.3, 3.4, rot);                 // 床
  box(B.plaster, 0xd6cfbe, c.x, y + 5.1, c.z, Lw - 0.2, 2.0, 3.0, rot);            // 白壁
  box(B.plain, 0x2f2c28, c.x, y + 6.1, c.z, Lw, 0.1, 3.1, rot);
  for (let k = -1; k <= 1; k++) {
    // 武者窓（格子）：外と内に
    for (const sd of [1, -1]) {
      const [wx, wz] = P(k * 2.2, sd * 1.52);
      box(B.plain, 0x161412, wx, y + 5.2, wz, 1.1, 0.55, 0.05, rot);
      for (let b = -2; b <= 2; b++) { const [bx2, bz2] = P(k * 2.2 + b * 0.2, sd * 1.56); box(B.wood, 0x5a4430, bx2, y + 5.2, bz2, 0.06, 0.58, 0.05, rot); }
    }
  }
  // 石落とし：扉の真上に張り出す（床の隙間から石を落とす）
  const [sx0, sz0] = P(0, 1.8);
  box(B.plaster, 0xd6cfbe, sx0, y + 4.6, sz0, 2.4, 1.2, 0.7, rot);
  box(B.plain, 0x161412, sx0, y + 4.02, sz0, 2.2, 0.05, 0.6, rot);
  gable(B.tile, 0x3b3a3a, c.x, y + 6.15, c.z, Lw + 1.4, 4.0, rot, 0.5);
}
// 木戸：門柱に冠木と小さな板屋根（山城・砦の門）
function kido(B, W, g) {
  const { c, n, w } = g;
  const y = W.heightAt(c.x, c.z);
  const face = Math.atan2(n.x, n.z), rot = face;
  const P = L(c.x, c.z, face);
  for (const sx of [-1, 1]) {
    const [px, pz] = P(sx * (w / 2 + 0.1), 0);
    beam(B.wood, px, y - 0.5, pz, px, y + 3.6, pz, 0.21, 0x5a4430, 7);
    const [kx, kz] = P(sx * (w / 2 + 0.1), -1.6);
    beam(B.wood, kx, y - 0.2, kz, px, y + 2.4, pz, 0.09, 0x4e3a28, 5);
  }
  const [ax, az] = P(-w / 2 - 0.8, 0), [bx, bz] = P(w / 2 + 0.8, 0);
  beam(B.wood, ax, y + 3.3, az, bx, y + 3.3, bz, 0.17, 0x4e3a28, 6);
  gable(B.wood, 0x4a3e30, c.x, y + 3.55, c.z, w + 1.4, 1.1, rot, 0.45, 0.08);
}

// ---------------- 櫓 ----------------
// 隅櫓：石の台に白壁の一階、上は射手の立つ見晴らしの床と屋根。角に石落とし、裏に梯子段
function sumiyagura(B, W, t, shitami = false) {
  const { x, z, deck } = t;
  const y = W.heightAt(x, z);
  stoneBox(B.stone, 0x9a958a, x, y + 0.3, z, 5.8, 1.2, 5.8);
  box(B.plaster, 0xd6cfbe, x, y + deck / 2 + 0.35, z, 4.9, deck - 0.6, 4.9);
  // 古い城の櫓は、腰に墨の下見板を張る
  if (shitami) { box(B.shitami, 0x8a8580, x, y + 0.05 + deck * 0.3, z, 4.96, deck * 0.5, 4.96); box(B.plain, 0x1c1916, x, y + 0.05 + deck * 0.55, z, 5.0, 0.06, 5.0); }
  box(B.plain, 0x2f2c28, x, y + deck - 0.3, z, 5.0, 0.12, 5.0);
  for (const r of [0, Math.PI / 2]) for (const s of [-1, 1]) {
    box(B.plain, 0x161412, x + Math.sin(r) * s * 2.47, y + deck * 0.55, z + Math.cos(r) * s * 2.47, 0.8, 0.45, 0.05, r);
    box(B.plain, 0x161412, x + Math.sin(r) * s * 2.47 + Math.cos(r) * 1.4, y + 1.4, z + Math.cos(r) * s * 2.47 - Math.sin(r) * 1.4, 0.18, 0.22, 0.05, r);
  }
  box(B.tile, 0x3b3a3a, x, y + deck - 0.1, z, 6.0, 0.14, 6.0);                 // 一階の庇
  box(B.wood, 0x5a4430, x, y + deck - 0.02, z, 4.9, 0.16, 4.9);               // 上の床
  for (const [dx, dz, w, d] of [[0, -2.4, 4.9, 0.08], [0, 2.4, 4.9, 0.08], [-2.4, 0, 0.08, 4.9], [2.4, 0, 0.08, 4.9]]) box(B.wood, 0x6b5238, x + dx, y + deck + 0.5, z + dz, w, 0.85, d);
  for (const dx of [-2.3, 2.3]) for (const dz of [-2.3, 2.3]) box(B.wood, 0x4e3a28, x + dx, y + deck + 1.25, z + dz, 0.18, 2.5, 0.18);
  hipRoof(B.tile, 0x3b3a3a, x, y + deck + 2.45, z, 6.4, 6.4, 1.8, 0, 0.15);
  // 石落とし：外の二つの面に、床の張り出し
  for (const [dx, dz] of t.out || [[0, 1]]) {
    box(B.plaster, 0xd6cfbe, x + dx * 2.8, y + deck - 0.9, z + dz * 2.8, dz ? 2.2 : 0.7, 1.1, dx ? 2.2 : 0.7);
    box(B.plain, 0x161412, x + dx * 2.8, y + deck - 1.46, z + dz * 2.8, dz ? 2.0 : 0.55, 0.04, dx ? 2.0 : 0.55);
  }
  // 梯子段（内側の面）
  const bx = t.in ? t.in[0] : 0, bz = t.in ? t.in[1] : -1;
  const fx = x + bx * 2.45, fz = z + bz * 2.45;
  for (const s of [-0.35, 0.35]) beam(B.wood, fx + bx * 1.6 + bz * s, y, fz + bz * 1.6 - bx * s, fx + bz * s, y + deck, fz - bx * s, 0.05, 0x5a4430, 4);
  for (let r = 0; r < 8; r++) { const q = (r + 0.5) / 8; box(B.wood, 0x6b5238, fx + bx * 1.6 * (1 - q), y + deck * q, fz + bz * 1.6 * (1 - q), bz ? 0.7 : 0.08, 0.05, bx ? 0.7 : 0.08); }
}
// 物見櫓：丸太を組んだ高い櫓。板の囲いと板葺きの屋根、梯子
function monomi(B, W, t) {
  const { x, z } = t;
  const H = t.deck;
  const y0 = W.heightAt(x, z);
  const P = B.wood;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) beam(P, x + sx * 1.55, y0 - 0.3, z + sz * 1.55, x + sx * 1.15, y0 + H, z + sz * 1.15, 0.13, 0x5a4430, 6);
  for (const yy of [H * 0.3, H * 0.65]) {
    const w = 1.55 - (0.4 * yy) / H;
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) beam(P, x + ax * w, y0 + yy, z + az * w, x + bx * w, y0 + yy, z + bz * w, 0.06, 0x5a4430, 4);
  }
  for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) beam(P, x + ax * 1.45, y0 + 0.4, z + az * 1.45, x + bx * 1.2, y0 + H - 0.8, z + bz * 1.2, 0.045, 0x4e3a28, 4);
  box(P, 0x6b5238, x, y0 + H, z, 3.2, 0.16, 3.2);
  box(P, 0x6e5a40, x, y0 + H + 0.55, z - 1.58, 3.2, 1.0, 0.07);
  box(P, 0x6e5a40, x - 1.58, y0 + H + 0.55, z, 0.07, 1.0, 3.2);
  box(P, 0x6e5a40, x + 1.58, y0 + H + 0.55, z, 0.07, 1.0, 3.2);
  box(P, 0x6e5a40, x - 0.8, y0 + H + 0.55, z + 1.58, 1.6, 1.0, 0.07);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) beam(P, x + sx * 1.45, y0 + H, z + sz * 1.45, x + sx * 1.45, y0 + H + 2.2, z + sz * 1.45, 0.06, 0x5a4430, 4);
  hipRoof(P, 0x4a3e30, x, y0 + H + 2.2, z, 3.8, 3.8, 1.2, 0, 0.1);
  for (const lx of [0.45, 0.95]) beam(P, x + lx, y0, z + 2.3, x + lx, y0 + H, z + 1.6, 0.04, 0x5a4430, 4);
  for (let r = 0; r < 11; r++) { const q = (r + 0.5) / 11; box(P, 0x6b5238, x + 0.7, y0 + q * H, z + 2.3 - 0.7 * q, 0.55, 0.05, 0.06); }
}

// ---------------- 城の中の建物 ----------------
// 御殿（本丸の館）：板敷の広間、奥に襖と床の間・違い棚、東西は障子、前は障子を開け放って縁側と階。天井を張り、入母屋の屋根
// g：{ x, z, w, d, fy（床の高さ）, tile（瓦葺きか） }。当たりは奥と東西の壁（前は開いている）
function goten(B, W, g) {
  const { x, z, w, d, fy } = g;
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  const H = 3.0;
  const yb = Math.min(W.heightAt(x, z1 + 3), W.heightAt(x0 - 2, z), W.heightAt(x1 + 2, z)) - 0.2;
  // 縁の下（黒い腰と束石）
  box(B.plain, 0x2a2622, x, (fy + yb) / 2, z, w + 0.1, fy - yb, d + 0.1);
  // 板敷：南北に長い板を並べる
  const nb = Math.round(w / 0.5);
  for (let i = 0; i < nb; i++) box(B.wood, vary(0x9a7a52, i), x0 + (i + 0.5) * (w / nb), fy + 0.03, z, w / nb - 0.015, 0.06, d);
  // 縁側と階（中央の三段）
  box(B.wood, 0x7a6040, x, fy - 0.02, z1 + 0.65, w + 0.4, 0.08, 1.3);
  box(B.wood, 0x3e3024, x, fy - 0.08, z1 + 1.32, w + 0.4, 0.14, 0.08);
  for (let s = 1; s <= 3; s++) box(B.wood, 0x6b5238, x, fy - s * 0.2, z1 + 1.3 + s * 0.35, 2.6, 0.08, 0.36);
  // 柱
  const bays = Math.max(3, Math.round(w / 1.9)), bw = w / bays;
  const dbays = Math.max(2, Math.round(d / 1.9)), bd = d / dbays;
  for (let i = 0; i <= bays; i++) for (const zz of [z0, z1]) box(B.wood, 0x5a4430, x0 + i * bw, fy + H / 2, zz, 0.2, H, 0.2);
  for (let j = 1; j < dbays; j++) for (const xx of [x0, x1]) box(B.wood, 0x5a4430, xx, fy + H / 2, z0 + j * bd, 0.2, H, 0.2);
  for (const zz of [z0, z1]) box(B.wood, 0x3e3024, x, fy + 2.15, zz, w, 0.12, 0.22);   // 鴨居・長押
  for (const xx of [x0, x1]) box(B.wood, 0x3e3024, xx, fy + 2.15, z, 0.22, 0.12, d);
  // 欄間（鴨居の上の透かし）と小壁
  for (const zz of [z0, z1]) box(B.plain, 0xd9d0bc, x, fy + 2.62, zz, w, 0.8, 0.1);
  for (const xx of [x0, x1]) box(B.plain, 0xd9d0bc, xx, fy + 2.62, z, 0.1, 0.8, d);
  for (let i = 0; i < bays; i++) for (let q = 0; q < 5; q++) box(B.wood, 0x5a4430, x0 + (i + (q + 0.5) / 5) * bw, fy + 2.5, z1 + 0.02, 0.04, 0.5, 0.06);
  // 奥の襖（金の地に淡い松）。一つの間を床の間と違い棚に
  const tk = Math.floor(bays / 2) - 1;
  for (let i = 0; i < bays; i++) {
    const cx = x0 + (i + 0.5) * bw;
    if (i === tk) {
      // 床の間：一段高い床框、白い壁、掛軸、床柱
      box(B.wood, 0x2a1c14, cx, fy + 0.12, z0 + 0.5, bw - 0.1, 0.2, 0.9);
      box(B.wood, 0x8a6a48, cx, fy + 0.23, z0 + 0.5, bw - 0.14, 0.03, 0.86);
      box(B.plain, 0xe0d8c6, cx, fy + 1.1, z0 + 0.06, bw - 0.1, 2.0, 0.06);
      box(B.plain, 0xefe8d8, cx, fy + 1.25, z0 + 0.11, 0.55, 1.2, 0.02);
      box(B.plain, 0x3a3630, cx, fy + 1.3, z0 + 0.125, 0.22, 0.5, 0.01);
      box(B.plain, 0x5a4a38, cx, fy + 1.86, z0 + 0.12, 0.62, 0.05, 0.03);
      box(B.wood, 0x6e4a2a, cx + bw / 2 - 0.08, fy + 1.1, z0 + 0.12, 0.16, 2.2, 0.16);
      continue;
    }
    if (i === tk + 1) {
      // 違い棚：段違いの二枚の棚と地袋
      box(B.plain, 0xe0d8c6, cx, fy + 1.1, z0 + 0.06, bw - 0.1, 2.0, 0.06);
      box(B.wood, 0x3a2a1c, cx - 0.25, fy + 1.2, z0 + 0.3, bw * 0.5, 0.05, 0.45);
      box(B.wood, 0x3a2a1c, cx + 0.25, fy + 1.45, z0 + 0.3, bw * 0.5, 0.05, 0.45);
      box(B.plain, 0xc9b27a, cx, fy + 0.25, z0 + 0.3, bw - 0.2, 0.45, 0.5);
      continue;
    }
    for (const s of [-1, 1]) {
      const px = cx + s * bw / 4;
      box(B.plain, vary(0xcab27a, i * 2 + s), px, fy + 1.07, z0 + 0.05, bw / 2 - 0.03, 2.05, 0.05);
      box(B.plain, 0x4e6a44, px + s * 0.1, fy + 1.3, z0 + 0.085, bw / 2 - 0.5, 0.35, 0.01);   // 松の緑
      box(B.plain, 0x2a2018, px - s * (bw / 4 - 0.18), fy + 1.0, z0 + 0.085, 0.05, 0.12, 0.01);  // 引手
    }
  }
  // 東西の障子（白い紙に細い桟）
  const shoji = (xx, zz, len, along) => {
    const nP = Math.max(2, Math.round(len / 0.95));
    for (let q = 0; q < nP; q++) {
      const t = -len / 2 + (q + 0.5) * len / nP;
      const px = along ? xx + t : xx, pz = along ? zz : zz + t;
      const pw = len / nP - 0.03;
      box(B.plain, 0xefe9da, px, fy + 1.05, pz, along ? pw : 0.04, 2.0, along ? 0.04 : pw);
      for (let r = 1; r < 3; r++) box(B.wood, 0x6b5238, along ? px - pw / 2 + r * pw / 3 : px, fy + 1.05, along ? pz : pz - pw / 2 + r * pw / 3, along ? 0.025 : 0.06, 2.0, along ? 0.06 : 0.025);
      for (let r = 1; r < 5; r++) box(B.wood, 0x6b5238, px, fy + 0.05 + r * 0.4, pz, along ? pw : 0.06, 0.025, along ? 0.06 : pw);
    }
  };
  shoji(x0, z, d, false); shoji(x1, z, d, false);
  // 前は障子を開け放ち、両の端に寄せて重ねる
  for (const s of [-1, 1]) for (let q = 0; q < 3; q++) box(B.plain, 0xefe9da, x + s * (w / 2 - 0.5 - q * 0.05), fy + 1.05, z1 - 0.06 - q * 0.05, 0.9, 2.0, 0.04);
  // 天井（竿縁）
  box(B.wood, 0x5a4632, x, fy + H + 0.02, z, w + 0.2, 0.06, d + 0.2);
  for (let q = 1; q < Math.round(d / 0.9); q++) box(B.wood, 0x3e3024, x, fy + H - 0.04, z0 + q * 0.9, w, 0.05, 0.05);
  // 屋根：入母屋（寄棟の上に小さな切妻）と、深い軒
  const roofCol = g.tile ? 0x3b3a3a : 0x5a4a38;
  box(B.plain, 0x2f2a24, x, fy + H + 0.35, z, w + 0.3, 0.6, d + 0.3);
  hipRoof(g.tile ? B.tile : B.plain, roofCol, x, fy + H + 0.55, z, w + 3.2, d + 3.4, 2.4, 0, 0.45);
  gable(g.tile ? B.tile : B.plain, roofCol, x, fy + H + 2.9, z, (w + 3.2) * 0.45, (d + 3.4) * 0.45, 0, 0.62, 0.14);
  // 渡り廊下（東へ、蔵の方へ）
  if (g.rouka) {
    const [rx0, rz, rx1] = g.rouka;
    for (let q = 0; q <= Math.round((rx1 - rx0) / 1.8); q++) for (const s of [-1, 1]) { const px = rx0 + q * 1.8; box(B.wood, 0x5a4430, px, fy + 1.3, rz + s * 0.9, 0.16, 2.6, 0.16); }
    box(B.wood, 0x7a6040, (rx0 + rx1) / 2, fy - 0.02, rz, rx1 - rx0, 0.08, 1.9);
    box(B.plain, 0x2a2622, (rx0 + rx1) / 2, (fy + yb) / 2, rz, rx1 - rx0, fy - yb, 1.7);
    gable(g.tile ? B.tile : B.plain, roofCol, (rx0 + rx1) / 2, fy + 2.6, rz, rx1 - rx0 + 0.6, 2.6, 0, 0.45);
  }
}
// 長屋：白壁と下見板の長い平屋、戸口を並べる（足軽の住まい・城の蔵）
function nagaya(B, W, x, z, w, d, rot, tile) {
  const y = Math.min(W.heightAt(x, z), W.heightAt(...L(x, z, rot)(w / 2, 0)), W.heightAt(...L(x, z, rot)(-w / 2, 0))) - 0.1;
  box(B.stone, 0x8a857a, x, y + 0.25, z, w + 0.2, 0.5, d + 0.2, rot);
  box(B.plaster, 0xd6cfbe, x, y + 1.7, z, w, 2.4, d, rot);
  box(B.wood, 0x3a3026, x, y + 1.05, z, w + 0.04, 1.1, d + 0.04, rot);
  const P = L(x, z, rot);
  const n = Math.max(2, Math.round(w / 3));
  for (let k = 0; k < n; k++) {
    const lx = -w / 2 + (k + 0.5) * w / n;
    const [dx, dz] = P(lx - 0.4, d / 2 + 0.03); box(B.wood, 0x2a2018, dx, y + 1.3, dz, 0.9, 1.8, 0.05, rot);
    const [wx, wz] = P(lx + 0.7, d / 2 + 0.03); box(B.plain, 0x1e1a16, wx, y + 1.9, wz, 0.7, 0.4, 0.05, rot);
  }
  gable(tile ? B.tile : B.plain, tile ? 0x3b3a3a : 0x5a4a38, x, y + 2.9, z, w + 0.8, d + 1.4, rot, 0.5);
}
// 蔵（土蔵）：白壁に瓦、鉄の扉
function kura(B, W, x, z, w, d, rot = 0) {
  const y = W.heightAt(x, z) - 0.1;
  box(B.stone, 0x8a857a, x, y + 0.4, z, w + 0.3, 0.8, d + 0.3, rot);
  box(B.plain, 0xdcd5c4, x, y + 2.2, z, w, 3.0, d, rot);
  box(B.plain, 0x2c2a28, x, y + 1.1, z, w + 0.04, 0.9, d + 0.04, rot);   // なまこ壁の代わりの黒い腰
  const P = L(x, z, rot);
  const [dx, dz] = P(0, d / 2 + 0.04); box(B.plain, 0x2f2c28, dx, y + 1.6, dz, 1.3, 2.0, 0.07, rot);
  const [wx, wz] = P(0, d / 2 + 0.04); box(B.plain, 0x2f2c28, wx, y + 3.1, wz, 0.6, 0.5, 0.07, rot);
  gable(B.tile, 0x3b3a3a, x, y + 3.75, z, w + 0.8, d + 1.2, rot, 0.5);
}
// 井戸：石の井筒、屋根と釣瓶の滑車
function ido(B, W, x, z) {
  const y = W.heightAt(x, z);
  const r = new THREE.CylinderGeometry(0.85, 0.9, 0.75, 14, 1, true); r.translate(x, y + 0.3, z); B.stone.push(paint(r, 0x8a857a));
  const top = new THREE.CylinderGeometry(0.92, 0.92, 0.1, 14); top.translate(x, y + 0.7, z); B.plain.push(paint(top, 0x6e6a62));
  const hole = new THREE.CylinderGeometry(0.72, 0.72, 0.12, 14); hole.translate(x, y + 0.72, z); B.plain.push(paint(hole, 0x0e0e0c));
  for (const s of [-1, 1]) box(B.wood, 0x5a4430, x + s * 1.0, y + 1.3, z, 0.14, 2.6, 0.14);
  box(B.wood, 0x4e3a28, x, y + 2.3, z, 2.3, 0.12, 0.12);
  const pul = new THREE.CylinderGeometry(0.15, 0.15, 0.08, 10); pul.rotateX(Math.PI / 2); pul.translate(x, y + 2.1, z); B.wood.push(paint(pul, 0x3a2a1c));
  beam(B.wood, x - 0.12, y + 2.1, z, x - 0.12, y + 0.95, z, 0.01, 0x8a7a58, 3);
  const bk = new THREE.CylinderGeometry(0.16, 0.13, 0.28, 8); bk.translate(x - 0.12, y + 0.85, z); B.wood.push(paint(bk, 0x6b5238));
  gable(B.wood, 0x4a3e30, x, y + 2.55, z, 2.6, 1.4, 0, 0.45, 0.08);
}
// 馬屋：柱を並べた吹き放しの小屋、仕切りの板と飼い葉桶
function umaya(B, W, x, z, w, d, rot) {
  const y = W.heightAt(x, z);
  const P = L(x, z, rot);
  const n = Math.max(2, Math.round(w / 2.4));
  for (let k = 0; k <= n; k++) {
    const lx = -w / 2 + k * w / n;
    for (const lz of [-d / 2, d / 2]) { const [px, pz] = P(lx, lz); box(B.wood, 0x5a4430, px, y + 1.3, pz, 0.18, 2.6, 0.18, rot); }
    const [qx, qz] = P(lx, 0); box(B.wood, 0x6b5238, qx, y + 0.7, qz, 0.06, 1.2, d * 0.9, rot);   // 仕切り
    if (k < n) { const [tx, tz] = P(lx + w / n / 2, -d / 2 + 0.4); box(B.wood, 0x4e3a28, tx, y + 0.5, tz, w / n - 0.4, 0.35, 0.5, rot); }
  }
  const [bx, bz] = P(0, -d / 2); box(B.wood, 0x5a4a38, bx, y + 1.3, bz, w, 2.6, 0.08, rot);
  box(B.wood, 0x8a7a50, x, y + 0.05, z, w - 0.2, 0.1, d - 0.2, rot);   // 敷き藁
  gable(B.wood, 0x5a4a38, x, y + 2.6, z, w + 0.8, d + 1.2, rot, 0.45, 0.1);
}
// 侍屋敷：主屋と低い板塀、冠木門
function yashiki(B, W, x, z, w, d, rot, tile) {
  const y = W.heightAt(x, z) - 0.1;
  const P = L(x, z, rot);
  const [hx, hz] = P(0, -d * 0.12);
  box(B.stone, 0x8a857a, hx, y + 0.3, hz, w * 0.72 + 0.2, 0.6, d * 0.55 + 0.2, rot);
  box(B.wood, 0x5a4632, hx, y + 1.6, hz, w * 0.72, 2.2, d * 0.55, rot);
  for (let k = -1; k <= 1; k++) { const [sx, sz] = P(k * w * 0.2, -d * 0.12 + d * 0.275 + 0.03); box(B.plain, 0xefe9da, sx, y + 1.6, sz, w * 0.18, 1.7, 0.04, rot); }
  hipRoof(tile ? B.tile : B.plain, tile ? 0x3b3a3a : 0x5a4a38, hx, y + 2.7, hz, w * 0.72 + 1.8, d * 0.55 + 1.8, 1.7, rot, 0.35);
  // 板塀（前に冠木門の口）
  const fence = [[-w / 2, d / 2, -1.4, d / 2], [1.4, d / 2, w / 2, d / 2], [w / 2, d / 2, w / 2, -d / 2], [w / 2, -d / 2, -w / 2, -d / 2], [-w / 2, -d / 2, -w / 2, d / 2]];
  for (const [ax, az, bx, bz] of fence) {
    const [a1, a2] = P(ax, az), [b1, b2] = P(bx, bz);
    boxAlong(B.wood, 0x5e4a36, a1, a2, b1, b2, 1, 1.7, 0.08, W.heightAt((a1 + b1) / 2, (a2 + b2) / 2) + 0.8);
    boxAlong(B.wood, 0x3a2e24, a1, a2, b1, b2, 1.01, 0.1, 0.16, W.heightAt((a1 + b1) / 2, (a2 + b2) / 2) + 1.7);
  }
  for (const s of [-1, 1]) { const [gx, gz] = P(s * 1.4, d / 2); box(B.wood, 0x4e3a28, gx, y + 1.3, gz, 0.2, 2.6, 0.2, rot); }
  const [cx, cz] = P(0, d / 2); box(B.wood, 0x3e2e20, cx, y + 2.5, cz, 3.4, 0.18, 0.22, rot);
}
// 天守：石の天守台に、下見板と白壁の重ね。重ごとに庇の屋根、最上は廻縁と高欄、屋根の端に鯱
function tenshu(B, W, x, z, b, floors, old) {
  const y0 = W.heightAt(x, z);
  const r = Math.SQRT2 / 2;
  const base = new THREE.CylinderGeometry(r * b, r * (b + 2.6), 4.2, 4, 1, true);
  base.rotateY(Math.PI / 4);
  const uv = base.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * b * 1.8, uv.getY(k) * 2);
  base.translate(x, y0 + 1.9, z); B.stone.push(paint(base, 0x9a958a));
  box(B.plain, 0x6e6a62, x, y0 + 3.98, z, b + 0.2, 0.1, b + 0.2);
  let y = y0 + 4.0, w = b, d = b * 0.84;
  for (let k = 0; k < floors; k++) {
    const top = k === floors - 1;
    const fh = top ? 2.8 : 3.1;
    box(B.plaster, 0xdcd6c6, x, y + fh / 2, z, w, fh, d);
    if (old) box(B.wood, 0x221e1a, x, y + fh * 0.3, z, w + 0.04, fh * 0.6, d + 0.04);
    // 窓（格子の窓と、狭間）
    const nw = Math.max(2, Math.round(w / 2.4));
    for (let q = 0; q < nw; q++) {
      const lx = -w / 2 + (q + 0.5) * w / nw;
      for (const s of [-1, 1]) {
        box(B.plain, 0x161412, x + lx, y + fh * 0.62, z + s * (d / 2 + 0.02), 0.9, 0.55, 0.04);
        box(B.plain, 0x161412, x + s * (w / 2 + 0.02), y + fh * 0.62, z + lx * d / w, 0.04, 0.55, 0.9 * d / w);
      }
    }
    if (top) {
      // 廻縁と高欄
      box(B.wood, 0x3a2a1c, x, y + 0.1, z, w + 1.4, 0.12, d + 1.4);
      for (const [dx, dz, ww, dd] of [[0, (d + 1.3) / 2, w + 1.4, 0.06], [0, -(d + 1.3) / 2, w + 1.4, 0.06], [(w + 1.3) / 2, 0, 0.06, d + 1.4], [-(w + 1.3) / 2, 0, 0.06, d + 1.4]]) box(B.wood, 0x3a2a1c, x + dx, y + 0.65, z + dz, ww, 0.08, dd);
      hipRoof(B.tile, 0x363738, x, y + fh, z, w + 2.2, d + 2.2, 2.2, 0, 0.35);
      gable(B.tile, 0x363738, x, y + fh + 2.05, z, (w + 2.2) * 0.42, (d + 2.2) * 0.42, 0, 0.62, 0.14);
      // 鯱
      for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.22, 0.6, 0.3); g.rotateZ(s * 0.35); g.translate(x + s * (w + 2.2) * 0.21, y + fh + 2.05 + Math.tan(0.62) * (d + 2.2) * 0.21 + 0.35, z); B.plain.push(paint(g, 0x8a7640)); }
    } else {
      // 庇の屋根と、正面の千鳥破風
      hipRoof(B.tile, 0x363738, x, y + fh - 0.1, z, w + 2.4, d + 2.4, 1.0, 0, 0.72);
      if (k % 2 === 0) gable(B.tile, 0x363738, x, y + fh + 0.1, z + d / 2 + 0.3, w * 0.45, 1.6, Math.PI / 2, 0.6, 0.12);
    }
    y += fh + 0.35; w *= 0.8; d *= 0.8;
  }
}
// 逆茂木：枝を払った木を、先を外へ向けて寝かせ並べる
function sakamogi(B, W, x, z, out) {
  const y = W.heightAt(x, z);
  const tx = Math.cos(out), tz = -Math.sin(out), nx = Math.sin(out), nz = Math.cos(out);
  beam(B.wood, x - tx * 1.1, y + 0.25, z - tz * 1.1, x + tx * 1.1, y + 0.3, z + tz * 1.1, 0.1, 0x4a3a2a, 5);
  for (let b = 0; b < 5; b++) {
    const o = (b - 2) * 0.45, j = (((Math.abs(Math.round(x * 13 + z * 7)) + b * 7) % 10) / 10);
    const bx = x + tx * o, bz = z + tz * o;
    beam(B.wood, bx, y + 0.3, bz, bx + nx * (1.2 + j * 0.5) + tx * (j - 0.5) * 0.5, y + 0.9 + j * 0.5, bz + nz * (1.2 + j * 0.5) + tz * (j - 0.5) * 0.5, 0.035, vary(0x5a4634, b + Math.round(x)), 4);
  }
}
// 乱杭：先を尖らせた杭を不揃いに打ち込む
function rankui(B, W, x, z, k) {
  const y = W.heightAt(x, z);
  const h = 1.1 + ((k * 37) % 7) * 0.1;
  const g = new THREE.CylinderGeometry(0.02, 0.09, h, 5);
  g.rotateX(((k * 13) % 9 - 4) * 0.07); g.rotateZ(((k * 29) % 9 - 4) * 0.07);
  g.translate(x, y + h / 2 - 0.15, z);
  B.wood.push(paint(g, [0x6b5238, 0x5a4430, 0x7a5c40][k % 3]));
}
// 竹束：青竹を束ねて縄で縛った楯（原点に、前 = -z を向けて作る。動かすので一つずつの形）
let TABA_GEO = null;
function tabaGeo() {
  if (TABA_GEO) return TABA_GEO;
  const P = [];
  for (let i = 0; i < 11; i++) {
    const g = new THREE.CylinderGeometry(0.08, 0.09, 2.1, 6);
    g.rotateX(0.2); g.translate((i - 5) * 0.15, 1.0, (i % 2) * 0.05 - 0.2);
    P.push(paint(g, [0x7c7a48, 0x6e6c3e, 0x86804e][i % 3]));
  }
  for (const yy of [0.55, 1.45]) { const b = new THREE.BoxGeometry(1.75, 0.07, 0.09); b.translate(0, yy, -0.18 - yy * 0.2 + 0.1); P.push(paint(b, 0x4a3a22)); }
  const s = new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5); s.rotateX(-0.7); s.translate(0, 0.7, 0.45); P.push(paint(s, 0x5a4a32));
  TABA_GEO = mergeGeometries(P);
  return TABA_GEO;
}
// 梯子：足元 foot から塀の上 top へ立てかける
function ladderMesh(foot, top) {
  const P = [];
  const dx = top.x - foot.x, dy = top.y - foot.y, dz = top.z - foot.z;
  const len = Math.hypot(dx, dy, dz);
  const sx = -dz / Math.hypot(dx, dz) * 0.28, sz = dx / Math.hypot(dx, dz) * 0.28;
  for (const s of [-1, 1]) beam(P, foot.x + sx * s, foot.y, foot.z + sz * s, top.x + sx * s, top.y + 0.5, top.z + sz * s, 0.05, 0x7a6848, 5);
  const n = Math.round(len / 0.36);
  for (let k = 1; k < n; k++) { const q = k / n; beam(P, foot.x + dx * q - sx, foot.y + dy * q, foot.z + dz * q - sz, foot.x + dx * q + sx, foot.y + dy * q, foot.z + dz * q + sz, 0.03, 0x6b5a3c, 4); }
  const m = new THREE.Mesh(mergeGeometries(P), mats().wood);
  m.castShadow = true;
  return m;
}
// 紋の無い家の旗：家の一字を丸に入れて描く（textures.js に紋の無い家のため）
const texCache = new Map();
export function crestTexture(name, crest, color) {
  const k = name + crest;
  if (texCache.has(k)) return texCache.get(k);
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e6dfcd'; g.fillRect(0, 0, 128, 256);
  g.fillStyle = color || '#3a3a3a'; g.fillRect(0, 196, 128, 60);
  g.strokeStyle = '#16140f'; g.lineWidth = 6; g.beginPath(); g.arc(64, 82, 44, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#16140f'; g.font = 'bold 58px "Hiragino Mincho ProN", "Yu Mincho", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(crest || name[0], 64, 86);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(k, t);
  return t;
}
function hata(world, x, z, tex, h = 5) {
  const grp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, h, 5), new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.9 }));
  pole.position.y = h / 2; grp.add(pole);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  cloth.position.set(0.47, h - 1.1, 0); grp.add(cloth);
  grp.position.set(x, world.heightAt(x, z), z);
  return grp;
}

// ======================================================================
// 縄張り（城の型紙）。どれも同じ形の入れ物を返す
//   regs[i]：曲輪（i = 1…。0 は城の外）。test(x,z)・obst（中で避ける四角）
//   gates[i]：曲輪 i と i+1 をつなぐ門（c 中心・n 外向き・w 幅・kind 高麗門/櫓門/木戸）
//   walls：塀・柵の線、towers：櫓、ladders：梯子を掛けられる所、bld：城の中の建物
// ======================================================================
function gateOf(i, c, n, w, kind, name, appD = 4) {
  const seg = [c.x - n.z * w / 2, c.z + n.x * w / 2, c.x + n.z * w / 2, c.z - n.x * w / 2];
  return { i, c, n, w, kind, name, seg, appD, app: { x: c.x + n.x * appD, z: c.z + n.z * appD }, inP: { x: c.x - n.x * 5, z: c.z - n.z * 5 } };
}
const rectPts = (R, gx, gw) => [[gx + gw / 2, R.z1], [R.x1, R.z1], [R.x1, R.z0], [R.x0, R.z0], [R.x0, R.z1], [gx - gw / 2, R.z1]];
const rectReg = (name, R, obst = []) => ({ name, test: (x, z) => inR(R, x, z), area: (R.x1 - R.x0) * (R.z1 - R.z0), obst, c: { x: (R.x0 + R.x1) / 2, z: (R.z0 + R.z1) / 2 }, rect: R });
const ringReg = (name, E, obst = []) => ({ name, test: (x, z) => ellD(E, x, z) < -1.0, area: Math.PI * E.rx * E.rz, obst, c: { x: E.cx, z: E.cz }, ring: E });

// 御殿のまわり（中へは前の縁側から入る）
const gotenBox = (G) => ({ x0: G.x - G.w / 2 - 0.9, x1: G.x + G.w / 2 + 0.9, z0: G.z - G.d / 2 - 0.9, z1: G.z + G.d / 2 + 0.3, door: { x: G.x, z: G.z + G.d / 2 + 2.5 }, doorW: G.w / 2 - 0.8 });
// 平城：水堀に囲まれた二の丸、その中に一段高い本丸。大きな城は外に三の丸、大手は枡形
function planHira(t, S, o) {
  // 大手は小さな城でも枡形（一の門をくぐって右へ折れ、二の門）。中の城から本丸の前にも枡形を重ねる
  const big = t >= 2, useMasu = true, inMasu = t >= 1;
  const F0 = -16;
  const hwO = 5 * Math.min(1.15, S), hwI = 3.6;          // 堀の半幅（外・本丸）
  const N2 = { x0: -(big ? 44 : 38) * S, x1: (big ? 44 : 38) * S, z1: big ? F0 - 24 * S : F0 };
  const M = useMasu ? { x0: -8, x1: 8, z0: N2.z1 - 14, z1: N2.z1 } : null;
  const H = { x0: -17 * S, x1: 17 * S, z1: N2.z1 - (useMasu ? 27 : 22) * S };
  H.z0 = H.z1 - 28 * S - (inMasu ? 9 : 0);
  // 本丸の枡形：本丸の南の縁の内。一の門（高麗門）をくぐって左へ折れ、櫓門から本丸へ
  const M2 = inMasu ? { x0: -7, x1: 7, z0: H.z1 - 9, z1: H.z1 } : null;
  N2.z0 = H.z0 - 20 * S;
  const O3 = big ? { x0: -70 * S, x1: 70 * S, z1: F0, z0: N2.z0 - 14 * S } : null;
  const stone = o.stone, oldEarth = !stone;
  const P = { type: 'hira', t, S, big, stone, regs: [null], gates: [], walls: [], towers: [], ladders: [], bld: [], water: [], moats: [], rankui: [], sakamogi: [] };
  // 地の高さ
  const LV = { O3: 0.8, N2: stone ? 2.2 : 1.6, H: stone ? 4.0 : 3.0 };
  const moatBottom = -2.6;
  // 御殿と天守の位置
  const Hc = { x: 0, z: (H.z0 + H.z1) / 2 };
  const gw = 15 * S, gd = 8.5 * S;
  const G = { x: -4 * S, z: inMasu ? Hc.z - 4 * S : Hc.z + 1 * S, w: gw, d: gd, fy: LV.H + 0.62, tile: stone || t >= 2 };
  const kuraX = H.x1 - 4.5 * S, kuraZ = G.z + 2.5 * S;
  G.rouka = [G.x + gw / 2, kuraZ, kuraX - 3];
  P.goten = G;
  P.court = { x: G.x, z: G.z + gd / 2 + 6 };
  P.levels = LV;
  P.height = (x, z) => {
    let h = 0.35 * Math.sin(x * 0.04) * Math.cos(z * 0.035) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
    h += 7 * gauss(x, z, -150, -130, 5000) + 6 * gauss(x, z, 150, -120, 5000) + 4 * gauss(x, z, -140, 90, 3000);
    const notBridge = (R) => !(Math.abs(x) < 3.2 && z > R.z1 - 1);
    if (O3) {
      const d = rectD(O3, x, z);
      h = mix(h, LV.O3, sm(1.5, -0.5, d));
      h += 1.7 * trap(Math.abs(d + 2.2), 2.0, 1.4) * (notBridge(O3) ? 1 : 0);   // 土塁
      if (notBridge(O3)) h = mix(h, -1.8, trap(Math.abs(d - 5.4), 4.2, 1.8));      // 空堀
    }
    const d2 = rectD(N2, x, z);
    if (notBridge(N2) && d2 > 0) h = mix(h, moatBottom, trap(Math.abs(d2 - 1.2 - hwO), hwO, 1.6));
    h = mix(h, LV.N2, sm(0.9, -0.4, d2));
    if (oldEarth) h += 1.2 * trap(Math.abs(d2 + 2.0), 1.8, 1.2) * (notBridge(N2) ? 1 : 0);
    const dh = rectD(H, x, z);
    if (notBridge(H) && dh > 0 && d2 < 0) h = mix(h, moatBottom + 0.4, trap(Math.abs(dh - 1.0 - hwI), hwI, 1.4));
    h = mix(h, LV.H, sm(0.9, -0.4, dh));
    // 御殿の床（縁側まで）
    if (x > G.x - gw / 2 - 0.4 && x < G.x + gw / 2 + 0.4 && z > G.z - gd / 2 - 0.4 && z < G.z + gd / 2 + 1.5) h = G.fy;
    return h;
  };
  P.tint = (x, z, h, c) => {
    if ((O3 && inR(O3, x, z, 1)) || inR(N2, x, z, 1)) c.setRGB(c.r * 0.55 + 0.2, c.g * 0.45 + 0.13, c.b * 0.45 + 0.08);
    if (inR(H, x, z, 1)) c.setRGB(0.5, 0.45, 0.37);
    if (h < -0.6 && !(O3 && inR(O3, x, z))) c.setRGB(c.r * 0.6, c.g * 0.62, c.b * 0.58);
    if (Math.abs(x) < 3.2 && z > F0 && z < 40) c.setRGB(0.44, 0.38, 0.28);
  };
  const outer = O3 || N2;
  P.clear = (x, z) => inR(grow(outer, 26), x, z) || (Math.abs(x) < 50 && z > -20 && z < 110);
  // 曲輪と門
  const O3i = big ? 1 : 0;
  if (big) {
    P.regs.push(rectReg('三の丸', O3, [grow(N2, 1.2 + hwO * 2)]));
    P.gates.push(gateOf(0, { x: 0, z: O3.z1 }, { x: 0, z: 1 }, 5, 'korai', '三の丸 大手門', 10));
  }
  const i2 = P.regs.length - 1;   // 二の丸へ入る門の番号（外の曲輪から）
  if (useMasu) {
    P.regs.push(rectReg('枡形', M));
    P.gates.push(gateOf(i2, { x: 0, z: N2.z1 }, { x: 0, z: 1 }, 5, 'korai', '大手 一の門', 1.2 + hwO * 2 + 2));
    P.regs.push(rectReg('二の丸', N2, [grow(M, 1.0), grow(H, 1.0 + hwI * 2 + 0.6)]));
    P.gates.push(gateOf(i2 + 1, { x: M.x1, z: N2.z1 - 7 }, { x: -1, z: 0 }, 5, 'yagura', '大手 二の門（櫓門）', 4));
  } else {
    P.regs.push(rectReg('二の丸', N2, [grow(H, 1.0 + hwI * 2 + 0.6)]));
    P.gates.push(gateOf(i2, { x: 0, z: N2.z1 }, { x: 0, z: 1 }, 5, 'korai', '大手門', 1.2 + hwO * 2 + 2));
  }
  P.masu = M ? P.regs.findIndex((r) => r && r.name === '枡形') : -1;
  if (M2) {
    P.regs.push(rectReg('本丸枡形', M2));
    P.gates.push(gateOf(P.regs.length - 2, { x: 0, z: H.z1 }, { x: 0, z: 1 }, 5, 'korai', '本丸 一の門', 1.0 + hwI * 2 + 2));
    P.regs.push(rectReg('本丸', H, [gotenBox(G), grow(M2, 1.0)]));
    P.gates.push(gateOf(P.regs.length - 2, { x: M2.x0, z: H.z1 - 4.5 }, { x: 1, z: 0 }, 4.4, 'yagura', '本丸 櫓門', 3.2));
  } else {
    P.regs.push(rectReg('本丸', H, [gotenBox(G)]));
    P.gates.push(gateOf(P.regs.length - 2, { x: 0, z: H.z1 }, { x: 0, z: 1 }, 5, 'yagura', '本丸 櫓門', 1.0 + hwI * 2 + 2));
  }
  // 塀
  if (big) P.walls.push({ pts: rectPts(O3, 0, 5), kind: 'dobei', c: { x: 0, z: (O3.z0 + O3.z1) / 2 }, stone: false });
  P.walls.push({ pts: rectPts(N2, 0, 5), kind: 'dobei', c: { x: 0, z: (N2.z0 + N2.z1) / 2 }, stone });
  if (M) {
    const mc = { x: 0, z: (M.z0 + M.z1) / 2 };
    P.walls.push({ pts: [[M.x0, M.z1], [M.x0, M.z0], [M.x1, M.z0], [M.x1, N2.z1 - 9.5]], kind: 'dobei', c: mc });
    P.walls.push({ pts: [[M.x1, N2.z1 - 4.5], [M.x1, M.z1]], kind: 'dobei', c: mc });
  }
  P.walls.push({ pts: rectPts(H, 0, 5), kind: 'dobei', c: Hc, stone: true });
  if (M2) {
    const mc = { x: 0, z: (M2.z0 + M2.z1) / 2 };
    P.walls.push({ pts: [[M2.x1, M2.z1], [M2.x1, M2.z0], [M2.x0, M2.z0], [M2.x0, H.z1 - 6.9]], kind: 'dobei', c: mc });
    P.walls.push({ pts: [[M2.x0, H.z1 - 2.1], [M2.x0, M2.z1]], kind: 'dobei', c: mc });
  }
  // 水堀（二の丸の外と、本丸のまわり）。土橋の所で切る
  const ring = (R, off, hw, y) => {
    const zc = R.z1 + off, zb = R.z0 - off, xl = R.x0 - off, xr = R.x1 + off;
    P.water.push({ a: [3.4, zc], b: [xr + hw, zc], hw, y }, { a: [-3.4, zc], b: [xl - hw, zc], hw, y },
      { a: [xl - hw, zb], b: [xr + hw, zb], hw, y }, { a: [xr, zc - hw], b: [xr, zb + hw], hw, y }, { a: [xl, zc - hw], b: [xl, zb + hw], hw, y });
  };
  ring(N2, 1.2 + hwO, hwO - 0.5, -1.35);
  ring(H, 1.0 + hwI, hwI - 0.5, -1.0);
  if (O3) {
    // 三の丸の空堀の底の乱杭
    for (let k = 0; k < 60; k++) { const x = -O3.x1 + 4 + (k * 2.3) % (O3.x1 * 2 - 8); if (Math.abs(x) > 5) P.rankui.push([x, O3.z1 + 5.4 + ((k * 7) % 5 - 2) * 0.6]); }
  }
  // 櫓
  const tw = (x, z, arch, out, inn) => P.towers.push({ x, z, kind: 'sumi', deck: 3.9, arch, out, in: inn });
  const outerR = O3 || N2;
  tw(outerR.x0 + 3.4, outerR.z1 - 3.4, 3, [[0, 1], [-1, 0]], [0, -1]);
  tw(outerR.x1 - 3.4, outerR.z1 - 3.4, 3, [[0, 1], [1, 0]], [0, -1]);
  if (big) { tw(N2.x0 + 3.4, N2.z1 - 3.4, 2, [[0, 1], [-1, 0]], [0, -1]); tw(N2.x1 - 3.4, N2.z1 - 3.4, 2, [[0, 1], [1, 0]], [0, -1]); }
  if (t >= 1) { tw(H.x0 + 3.2, H.z1 - 3.2, 2, [[0, 1], [-1, 0]], [0, -1]); tw(H.x1 - 3.2, H.z1 - 3.2, 2, [[0, 1], [1, 0]], [0, -1]); }
  if (t >= 3) { tw(N2.x0 + 3.4, N2.z0 + 3.4, 0, [[0, -1], [-1, 0]], [1, 0]); tw(N2.x1 - 3.4, N2.z0 + 3.4, 0, [[0, -1], [1, 0]], [-1, 0]); tw(H.x1 - 3.2, H.z0 + 3.2, 0, [[0, -1], [1, 0]], [-1, 0]); }
  // 梯子を掛けられる所（外の面の塀）
  if (big) for (const s of [-1, 1]) P.ladders.push({ x: s * 24 * S, z: O3.z1, n: { x: 0, z: 1 }, reg: O3i, from: 0 });
  const n2i = P.regs.findIndex((r) => r && r.name === '二の丸');
  for (const s of [-1, 1]) P.ladders.push({ x: s * 20 * S, z: N2.z1, n: { x: 0, z: 1 }, reg: n2i, from: O3i });
  // 城の中の建物
  const tile = stone || t >= 2;
  const sx = (N2.x1 + H.x1 + 1 + hwI * 2) / 2;   // 二の丸の東西の帯の真ん中
  for (const s of [-1, 1]) {
    P.bld.push({ k: 'nagaya', x: s * sx, z: H.z1 - 6 * S, w: 16 * S, d: 5, rot: Math.PI / 2 * s, tile });
    P.bld.push({ k: 'yashiki', x: s * sx, z: H.z0 + 8 * S, w: 11, d: 10, rot: Math.PI / 2 * s, tile });
  }
  P.bld.push({ k: 'kura', x: -sx, z: H.z0 - 9 * S, w: 6, d: 4.5, rot: 0 }, { k: 'kura', x: -sx + 8, z: H.z0 - 9 * S, w: 5, d: 4, rot: 0 });
  P.bld.push({ k: 'umaya', x: sx, z: H.z0 - 9 * S, w: 11, d: 4.5, rot: 0 });
  P.bld.push({ k: 'ido', x: sx - 2, z: N2.z1 - (useMasu ? 18 : 7) }, { k: 'ido', x: H.x0 + 5, z: H.z0 + 5 });
  P.bld.push({ k: 'kura', x: kuraX, z: kuraZ, w: 5, d: 6, rot: Math.PI / 2 });
  if (big) {
    for (const s of [-1, 1]) {
      P.bld.push({ k: 'yashiki', x: s * (N2.x1 + 1.2 + hwO * 2 + (O3.x1 - N2.x1 - 1.2 - hwO * 2) / 2), z: N2.z1 - 10, w: 12, d: 11, rot: Math.PI / 2 * s, tile });
      P.bld.push({ k: 'nagaya', x: s * 40 * S, z: O3.z1 - 6, w: 18, d: 5, rot: 0, tile });
      P.bld.push({ k: 'umaya', x: s * (O3.x1 - 6), z: (O3.z0 + N2.z1) / 2 - 20, w: 12, d: 4.5, rot: Math.PI / 2 * s });
    }
  }
  if (o.tenshu) P.bld.push({ k: 'tenshu', x: H.x1 - 7 * S, z: H.z0 + 7 * S, b: 10 * S, floors: t >= 3 ? 5 : 4, old: o.year < 1590 });
  else if (t >= 2) P.bld.push({ k: 'tenshu', x: H.x1 - 6.5 * S, z: H.z0 + 6.5 * S, b: 7.5 * S, floors: 2, old: true });
  P.flags = [[-12, N2.z1 - 2], [12, N2.z1 - 2], [H.x0 + 2, H.z1 - 2], [H.x1 - 2, H.z1 - 2], [G.x - 5, G.z + gd / 2 + 3], [G.x + 5, G.z + gd / 2 + 3]];
  if (big) P.flags.push([-20, O3.z1 - 2], [20, O3.z1 - 2]);
  P.front = outer.z1;
  P.halfW = outer.x1;
  P.back = outer.z0;
  P.sallyOut = [{ x: -(outer.x1 + 22), z: outer.z1 - 16 }, { x: outer.x1 + 22, z: outer.z1 - 16 }];
  // 搦手（守る戦で打って出る口）：外の曲輪の東の塀
  const defR = P.regs[1].name === '枡形' ? N2 : P.regs[1].rect;
  P.port = gateOf(-1, { x: defR.x1, z: defR.z1 - 12 }, { x: 1, z: 0 }, 3.6, 'kido', '搦手の木戸', 4);
  P.portWall = { x: defR.x1, z0: defR.z1 - 12 - 1.8, z1: defR.z1 - 12 + 1.8 };
  // 外の曲輪の長い塀は、ところどころ内へ折る（屏風折れ）。折れの角から、塀に取り付く敵を横から撃てる。門・梯子・搦手の近くと角はまっすぐのまま
  const keep = [...P.gates.map((g) => [g.c.x, g.c.z]), [P.port.c.x, P.port.c.z], ...P.ladders.map((l) => [l.x, l.z])];
  for (const wl of P.walls) if (wl.pts.length > 4) wl.pts = byobu(wl.pts, wl.c, keep);
  return P;
}

// 山城：尾根に曲輪を段に重ねる。まわりは切岸、外に横堀、背の尾根は堀切で断つ
function planYama(t, S, o) {
  const big = t >= 2;
  const rings = big
    ? [{ cx: 0, cz: -40 * S, rx: 44 * S, rz: 38 * S }, { cx: 0, cz: -48 * S, rx: 28 * S, rz: 22 * S }, { cx: 0, cz: -54 * S, rx: 13 * S, rz: 10.5 * S }]
    : [{ cx: 0, cz: -40 * S, rx: 30 * S, rz: 24 * S }, { cx: 0, cz: -48 * S, rx: 13.5 * S, rz: 10.5 * S }];
  const out0 = rings[0];
  const nat = (x, z) => {
    let h = 0.6 * Math.sin(x * 0.05) * Math.cos(z * 0.04) + 0.4 * Math.sin(z * 0.08 + x * 0.03);
    h += 17 * Math.exp(-(x * x) / (2 * 50 * 50 * S * S) - ((z - out0.cz) ** 2) / (2 * 54 * 54 * S * S));
    h += 9 * Math.exp(-(x * x) / (2 * 34 * 34)) * sm(out0.cz - 40 * S, out0.cz - 110, z);   // 北へ続く尾根
    h += 12 * gauss(x, z, -120, -90, 4000) + 10 * gauss(x, z, 125, -100, 4200) + 5 * gauss(x, z, -130, 60, 2600);
    return h;
  };
  const g0 = nat(0, out0.cz + out0.rz);
  rings.forEach((R, k) => { R.level = g0 + 4.6 * (k + 1); R.gx = 0; });
  const P = { type: 'yama', t, S, big, stone: o.stone, regs: [null], gates: [], walls: [], towers: [], ladders: [], bld: [], water: [], rankui: [], sakamogi: [], rings };
  const inner = rings[rings.length - 1];
  const G = { x: -4 * S, z: inner.cz - 1.5 * S, w: 11 * S, d: 6.4 * S, fy: inner.level + 0.6, tile: o.stone };
  P.goten = G;
  P.court = { x: G.x, z: G.z + G.d / 2 + 4.5 };
  const zk = out0.cz - out0.rz - 12;   // 堀切
  P.height = (x, z) => {
    let h = nat(x, z);
    const e0 = ellD(out0, x, z);
    const bridge = Math.abs(x) < 3.4 && z > out0.cz;
    if (!bridge) h -= 2.8 * trap(Math.abs(e0 - 7.5), 3.2, 1.6);                 // 横堀
    h -= 6 * trap(Math.abs(z - zk), 3.4, 2.2) * sm(50, 38, Math.abs(x)) * (e0 > 4 ? 1 : 0);   // 堀切
    // 竪堀：斜面を縦に落ちる堀（両の脇に二本ずつ）
    for (const a of [1.2, 1.8]) for (const s of [-1, 1]) {
      const ax = out0.cx + Math.sin(a * s) * (out0.rx + 4), az = out0.cz + Math.cos(a * s) * (out0.rz + 4);
      const bx = out0.cx + Math.sin(a * s) * (out0.rx + 34), bz = out0.cz + Math.cos(a * s) * (out0.rz + 34);
      h -= 2.2 * trap(segDist(x, z, ax, az, bx, bz), 2.2, 1.2);
    }
    for (const R of rings) {
      const e = ellD(R, x, z);
      if (e > 12) continue;
      const hPrev = h;
      const lip = 1.1 * trap(Math.abs(e + 1.5), 1.2, 0.9);
      const normal = mix(hPrev, R.level + lip, sm(3.4, 0, e));
      const cor = sm(4.4, 2.6, Math.abs(x - R.gx)) * (z > R.cz ? 1 : 0);
      if (cor > 0 && e > -4 && e < 10) {
        const ramp = mix(hPrev, R.level, sm(9, -2.5, e));
        h = mix(normal, Math.max(ramp, e < -2 ? normal : -99), cor);
        if (e < -2) h = mix(normal, R.level, cor);
      } else h = normal;
    }
    if (x > G.x - G.w / 2 - 0.4 && x < G.x + G.w / 2 + 0.4 && z > G.z - G.d / 2 - 0.4 && z < G.z + G.d / 2 + 1.5) h = G.fy;
    return h;
  };
  P.tint = (x, z, h, c) => {
    const e0 = ellD(out0, x, z);
    if (e0 < 0) c.setRGB(c.r * 0.55 + 0.2, c.g * 0.45 + 0.13, c.b * 0.45 + 0.08);
    else if (e0 < 12) c.setRGB(c.r * 0.7 + 0.12, c.g * 0.66 + 0.1, c.b * 0.58 + 0.06);   // 切岸と堀の土肌
    if (ellD(inner, x, z) < 0) c.setRGB(0.52, 0.46, 0.37);
    if (Math.abs(x) < 3 && z > out0.cz + out0.rz && z < 60) c.setRGB(0.44, 0.38, 0.28);
  };
  P.clear = (x, z) => ellD(out0, x, z) < 22 || (Math.abs(x) < 46 && z > out0.cz && z < 110);
  // 曲輪・門・柵
  const names = big ? ['三の曲輪', '二の曲輪', '本丸'] : ['二の曲輪', '本丸'];
  const gnames = big ? ['大手 木戸', '二の曲輪 門', '本丸 櫓門'] : ['大手 木戸', t >= 1 ? '本丸 櫓門' : '本丸 木戸'];
  rings.forEach((R, k) => {
    const nextR = rings[k + 1];
    const obst = nextR ? [{ x0: nextR.cx - nextR.rx - 1, x1: nextR.cx + nextR.rx + 1, z0: nextR.cz - nextR.rz - 1, z1: nextR.cz + nextR.rz + 1, soft: true }] : [gotenBox(G)];
    P.regs.push(ringReg(names[k], R, obst));
    // 柵の輪は縁の少し内（土塁の上）
    const r = (R.rx + R.rz) / 2, f = 1 - 1.0 / r;
    const rx = R.rx * f, rz = R.rz * f;
    const gw = 4.4;
    const hA = Math.asin(gw / 2 / rx);
    const n = Math.max(10, Math.round((2 * Math.PI * r) / 4));
    const pts = [];
    for (let j = 0; j <= n; j++) { const a = hA + (j / n) * (Math.PI * 2 - 2 * hA); pts.push([R.cx + Math.sin(a) * rx, R.cz + Math.cos(a) * rz]); }
    const inner1 = k === rings.length - 1;
    const kind = (inner1 && t >= 2) || o.stone ? 'dobei' : 'saku';
    P.walls.push({ pts, kind, c: { x: R.cx, z: R.cz }, stone: false });
    const gz = R.cz + Math.cos(hA) * rz;
    const gk = inner1 && t >= 1 ? 'yagura' : big && k === 1 ? 'korai' : 'kido';
    P.gates.push(gateOf(k, { x: 0, z: gz }, { x: 0, z: 1 }, gw, gk, gnames[k], 10));
    // 坂虎口：門の前の坂道の両脇に柵を立て、細い道にする（門へは狭い口から寄るほかない。柵の上の曲輪から撃ち下ろされる）
    for (const sx of [-1, 1]) P.walls.push({ pts: [[sx * 3.3, gz + 0.6], [sx * 3.6, gz + 7.5]], kind: 'saku', c: { x: 0, z: gz + 4 }, h: 2.2 });
    // 物見櫓（外の曲輪は大手の左右、内は隅に）
    if (k === 0) for (const s of [-1, 1]) { const a = s * 0.62; P.towers.push({ x: R.cx + Math.sin(a) * (rx - 4.2), z: R.cz + Math.cos(a) * (rz - 4.2), kind: 'monomi', deck: 6.2, arch: 3 }); }
    if (k === 1 && big) for (const s of [-1, 1]) { const a = s * 0.7; P.towers.push({ x: R.cx + Math.sin(a) * (rx - 3.8), z: R.cz + Math.cos(a) * (rz - 3.8), kind: 'monomi', deck: 6.2, arch: 2 }); }
    if (inner1) P.towers.push({ x: R.cx + Math.sin(2.3) * (rx - 3.5), z: R.cz + Math.cos(2.3) * (rz - 3.5), kind: 'monomi', deck: 7, arch: 0 });
    // 梯子の所
    if (k === 0 || (k === 1 && big)) for (const s of [-1, 1]) {
      const a = s * 0.78;   // 門の守りから離れた所
      const nx = Math.sin(a) / rx, nz = Math.cos(a) / rz, nl = Math.hypot(nx, nz);
      P.ladders.push({ x: R.cx + Math.sin(a) * rx, z: R.cz + Math.cos(a) * rz, n: { x: nx / nl, z: nz / nl }, reg: k + 1, from: k });
    }
  });
  // 逆茂木（横堀の外の縁）と乱杭（堀の底）
  for (let a = -2.4; a <= 2.4; a += 0.1) {
    if (Math.abs(a) < 0.14) continue;
    const r = (out0.rx + out0.rz) / 2;
    const k = 1 + 12 / r, k2 = 1 + 7.5 / r;
    P.sakamogi.push([out0.cx + Math.sin(a) * out0.rx * k, out0.cz + Math.cos(a) * out0.rz * k, a]);
    if (Math.abs(a) < 1.6) P.rankui.push([out0.cx + Math.sin(a + 0.04) * out0.rx * k2, out0.cz + Math.cos(a + 0.04) * out0.rz * k2]);
  }
  // 建物
  const tile = !!o.stone;
  const mid = rings[rings.length - 2];
  const bandZ = (mid.cz + mid.rz + inner.cz + inner.rz) / 2;   // 外の曲輪の南の帯
  for (const s of [-1, 1]) {
    P.bld.push({ k: 'nagaya', x: s * (inner.rx + (mid.rx - inner.rx) * 0.45), z: inner.cz + 2, w: 12 * S, d: 4.5, rot: Math.PI / 2 * s, tile });
    P.bld.push({ k: s < 0 ? 'umaya' : 'kura', x: s * 12 * S, z: bandZ + 1, w: s < 0 ? 9 : 5, d: s < 0 ? 4 : 4, rot: 0 });
  }
  P.bld.push({ k: 'ido', x: 7 * S, z: bandZ - 5 }, { k: 'ido', x: inner.cx - 7 * S, z: inner.cz + 5 * S });
  if (big) {
    for (const s of [-1, 1]) P.bld.push({ k: 'yashiki', x: s * (mid.rx + 7), z: mid.cz + 4, w: 10, d: 9, rot: Math.PI / 2 * s, tile });
    P.bld.push({ k: 'nagaya', x: -20 * S, z: out0.cz + out0.rz - 12, w: 12, d: 4.5, rot: 0.3, tile });
  }
  if (t >= 3 || o.tenshu) P.bld.push({ k: 'tenshu', x: inner.cx + 6.5 * S, z: inner.cz - 4 * S, b: 6.5 * S, floors: o.tenshu ? 4 : 3, old: true });
  P.flags = [[-6, out0.cz + out0.rz - 4], [6, out0.cz + out0.rz - 4], [-5, inner.cz + inner.rz - 3], [5, inner.cz + inner.rz - 3], [G.x - 4, G.z + G.d / 2 + 2.5]];
  P.front = out0.cz + out0.rz;
  P.halfW = out0.rx;
  P.back = out0.cz - out0.rz;
  P.sallyOut = [{ x: -(out0.rx + 26), z: out0.cz + 6 }, { x: out0.rx + 26, z: out0.cz + 6 }];
  const R0 = rings[0], r0 = (R0.rx + R0.rz) / 2, f0 = 1 - 1 / r0, pa = 1.35;
  const pc = { x: R0.cx + Math.sin(pa) * R0.rx * f0, z: R0.cz + Math.cos(pa) * R0.rz * f0 };
  P.port = gateOf(-1, pc, { x: Math.sin(pa), z: Math.cos(pa) }, 3.6, 'kido', '搦手の木戸', 6);
  P.portRing = { a: pa };
  return P;
}

// 砦：小高い所を削った一つの曲輪。土塁と空堀、外に逆茂木、木戸の内に蔀の柵
function planToride(t, S, o) {
  const R = { cx: 0, cz: -28, rx: 17 * S, rz: 14 * S, gx: 0 };
  const nat = (x, z) => {
    let h = 0.7 * Math.sin(x * 0.05) * Math.cos(z * 0.045) + 0.4 * Math.sin(z * 0.08 + x * 0.03);
    h += 5 * Math.exp(-(x * x + (z + 28) ** 2) / (2 * 36 * 36));
    h += 9 * gauss(x, z, -80, -90, 3400) + 8 * gauss(x, z, 85, -70, 3200) + 4 * gauss(x, z, -110, 50, 2600);
    return h;
  };
  R.level = nat(0, R.cz + R.rz) + 3.2;
  const P = { type: 'toride', t, S, big: false, regs: [null], gates: [], walls: [], towers: [], ladders: [], bld: [], water: [], rankui: [], sakamogi: [], rings: [R] };
  const G = { x: -3, z: R.cz - 4 * S, w: 9 * S, d: 5.2, fy: R.level + 0.55, tile: false };
  P.goten = G;
  P.court = { x: G.x, z: G.z + G.d / 2 + 4 };
  P.height = (x, z) => {
    let h = nat(x, z);
    const e = ellD(R, x, z);
    const bridge = Math.abs(x) < 3.2 && z > R.cz;
    if (!bridge) h -= 2.8 * trap(Math.abs(e - 5.5), 2.6, 1.3);
    if (e < 12) {
      const lip = 1.2 * trap(Math.abs(e + 1.5), 1.2, 0.9);
      const normal = mix(h, R.level + lip, sm(3.2, 0, e));
      const cor = sm(4.2, 2.6, Math.abs(x)) * (z > R.cz ? 1 : 0);
      h = cor > 0 && e > -2 ? mix(normal, mix(h, R.level, sm(8, -2, e)), cor) : cor > 0 ? mix(normal, R.level, cor) : normal;
    }
    if (x > G.x - G.w / 2 - 0.4 && x < G.x + G.w / 2 + 0.4 && z > G.z - G.d / 2 - 0.4 && z < G.z + G.d / 2 + 1.5) h = G.fy;
    return h;
  };
  P.tint = (x, z, h, c) => {
    const e = ellD(R, x, z);
    if (e < 0) c.setRGB(c.r * 0.55 + 0.2, c.g * 0.45 + 0.13, c.b * 0.45 + 0.08);
    else if (e < 9) c.setRGB(c.r * 0.7 + 0.12, c.g * 0.66 + 0.1, c.b * 0.58 + 0.06);
    if (Math.abs(x) < 3 && z > R.cz + R.rz && z < 60) c.setRGB(0.44, 0.38, 0.28);
  };
  P.clear = (x, z) => ellD(R, x, z) < 20 || (Math.abs(x) < 40 && z > -12 && z < 100);
  const r = (R.rx + R.rz) / 2, f = 1 - 1.0 / r, rx = R.rx * f, rz = R.rz * f;
  const gw = 4.4, hA = Math.asin(gw / 2 / rx);
  const n = Math.max(12, Math.round((2 * Math.PI * r) / 4));
  const pts = [];
  for (let j = 0; j <= n; j++) { const a = hA + (j / n) * (Math.PI * 2 - 2 * hA); pts.push([R.cx + Math.sin(a) * rx, R.cz + Math.cos(a) * rz]); }
  P.walls.push({ pts, kind: 'saku', c: { x: R.cx, z: R.cz } });
  const gz = R.cz + Math.cos(hA) * rz;
  // 虎口：木戸の内は狭い囲い（蔀の柵）。東に寄せた二の木戸をくぐって、右へ折れて中へ入る
  const zw = gz - 7.5;
  const hw = rx * Math.sqrt(Math.max(0, 1 - ((zw - R.cz) / rz) ** 2));
  const g2x = 5.5 * S, g2w = 3.6;
  P.walls.push({ pts: [[-hw - 0.3, zw], [g2x - g2w / 2, zw]], kind: 'saku', c: { x: 0, z: zw - 5 }, h: 2.3 });
  P.walls.push({ pts: [[g2x + g2w / 2, zw], [hw + 0.3, zw]], kind: 'saku', c: { x: 0, z: zw - 5 }, h: 2.3 });
  const inRing = (x, z) => ellD(R, x, z) < -1.0;
  P.regs.push({ name: '虎口', test: (x, z) => inRing(x, z) && z > zw, area: 2 * hw * (gz - zw), obst: [], c: { x: 0, z: (gz + zw) / 2 } });
  P.regs.push({ name: '砦の内', test: (x, z) => inRing(x, z) && z <= zw, area: Math.PI * R.rx * R.rz, obst: [gotenBox(G)], c: { x: R.cx, z: R.cz }, ring: R });
  P.gates.push(gateOf(0, { x: 0, z: gz }, { x: 0, z: 1 }, gw, 'kido', '砦の木戸', 9));
  for (const sx of [-1, 1]) P.walls.push({ pts: [[sx * 3.2, gz + 0.6], [sx * 3.5, gz + 6.5]], kind: 'saku', c: { x: 0, z: gz + 3.5 }, h: 2.2 });
  P.gates.push(gateOf(1, { x: g2x, z: zw }, { x: 0, z: 1 }, g2w, 'kido', '二の木戸', 3));
  P.towers.push({ x: -8 * S, z: R.cz + 5 * S, kind: 'monomi', deck: 6.2, arch: 3 }, { x: 9 * S, z: R.cz - 1, kind: 'monomi', deck: 6.2, arch: 3 });
  for (const s of [-1, 1]) { const a = s * 0.55, nx = Math.sin(a) / rx, nz = Math.cos(a) / rz, nl = Math.hypot(nx, nz); P.ladders.push({ x: R.cx + Math.sin(a) * rx, z: R.cz + Math.cos(a) * rz, n: { x: nx / nl, z: nz / nl }, reg: 1, from: 0 }); }
  for (let a = 0; a < Math.PI * 2; a += 0.14) {
    const aa = Math.abs(((a + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (aa < 0.22) continue;
    P.sakamogi.push([R.cx + Math.sin(a) * (R.rx + 10), R.cz + Math.cos(a) * (R.rz + 10), a]);
    if (aa < 1.9) P.rankui.push([R.cx + Math.sin(a + 0.05) * (R.rx + 5.5), R.cz + Math.cos(a + 0.05) * (R.rz + 5.5)]);
  }
  P.bld.push({ k: 'hut', x: 7 * S, z: R.cz - 8 * S, w: 6, d: 4, rot: 0.1 }, { k: 'hut', x: -11 * S, z: R.cz + 4, w: 5.5, d: 3.6, rot: -0.3 });
  P.bld.push({ k: 'ido', x: 5, z: R.cz + 3 }, { k: 'tawara', x: 10 * S, z: R.cz + 4 });
  P.flags = [[-5, gz - 2], [5, gz - 2], [G.x - 3, G.z + G.d / 2 + 2], [9, R.cz - 6]];
  P.front = R.cz + R.rz;
  P.halfW = R.rx;
  P.back = R.cz - R.rz;
  P.sallyOut = [{ x: -(R.rx + 24), z: R.cz + 4 }, { x: R.rx + 24, z: R.cz + 4 }];
  const pa = 0.85, pc = { x: R.cx + Math.sin(pa) * rx, z: R.cz + Math.cos(pa) * rz };
  P.port = gateOf(-1, pc, { x: Math.sin(pa), z: Math.cos(pa) }, 3.4, 'kido', '搦手の木戸', 5);
  P.portRing = { a: pa };
  return P;
}

// 城の格：0 小・1 中・2 大・3 名のある大城
function gradeOf(info) {
  const k = info.koku || 20000;
  let t = k < 15000 ? 0 : k < 24000 ? 1 : 2;
  const grand = GRAND.has(info.castle) || k >= 32000;
  if (grand) t = 3;
  if (info.type === 'toride') t = Math.min(t, 1);
  const S = info.type === 'toride' ? 0.9 + 0.12 * t : [0.86, 1, 1.1, 1.2][t];
  const late = (info.year || 1575) >= 1580;
  return { t, S, grand, tenshu: TENSHU.has(info.castle) && (info.year || 1575) >= 1576, stone: STONE.has(info.castle) || (grand && late) || (info.year || 1575) >= 1596, label: ['小さな', '', '大きな', '名だたる'][t] };
}
function makePlan(info) {
  const gr = gradeOf(info);
  const o = { stone: gr.stone && info.type !== 'toride', tenshu: gr.tenshu, year: info.year || 1575 };
  const P = info.type === 'yama' ? planYama(gr.t, gr.S, o) : info.type === 'toride' ? planToride(gr.t, gr.S, o) : planHira(gr.t, gr.S, o);
  P.grade = gr;
  // 城の外：城そのものを回り込む
  const R0 = P.rings ? P.rings[0] : null;
  const box0 = R0 ? { x0: R0.cx - R0.rx - 3, x1: R0.cx + R0.rx + 3, z0: R0.cz - R0.rz - 3, z1: R0.cz + R0.rz + 1.5 } : { x0: -P.halfW - 3, x1: P.halfW + 3, z0: P.back - 3, z1: P.front + 1.5 };
  box0.soft = !!R0;
  P.regs[0] = { name: '城の外', obst: [box0], test: () => false, area: 1e9 };
  // 曲輪を見分ける順（小さい曲輪から）
  const order = P.regs.map((r, i) => i).filter((i) => i > 0).sort((a, b) => P.regs[a].area - P.regs[b].area);
  P.regionOf = (x, z) => { for (const i of order) if (P.regs[i].test(x, z)) return i; return 0; };
  P.N = P.regs.length - 1;   // 本丸の番号
  return P;
}

// ---------------- 道すじ ----------------
// 曲輪の中で四角い物（枡形・本丸と堀・御殿）を回り込む
function avoid(reg, p, q) {
  if (!reg || !reg.obst) return q;
  for (const R of reg.obst) {
    const pin = inR(R, p.x, p.z), qin = inR(R, q.x, q.z);
    // 目当てが囲いの中（御殿の広間など）：口（door）から入る
    if (qin && !pin && R.door) {
      const atDoor = Math.abs(p.x - R.door.x) < R.doorW && p.z > R.z1 - 0.5 && p.z < R.door.z + 3;
      if (!atDoor) return avoid({ obst: reg.obst.filter((o) => o !== R) }, p, R.door);
      continue;
    }
    // 自分が四角の中に食い込んでいる（塀の際）：近い辺の外へ出る
    if (pin && !qin && !R.door && !R.soft) {
      const e = [[p.x - R.x0, -1, 0], [R.x1 - p.x, 1, 0], [p.z - R.z0, 0, -1], [R.z1 - p.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
      return { x: p.x + e[1] * (e[0] + 1.2), z: p.z + e[2] * (e[0] + 1.2) };
    }
    if (pin || qin) continue;
    if (!segRect(p.x, p.z, q.x, q.z, grow(R, -0.15))) continue;
    const m = 1.8;
    let best = null, bd = Infinity;
    const Rs = grow(R, -0.15);
    for (const [cx, cz] of [[R.x0 - m, R.z0 - m], [R.x1 + m, R.z0 - m], [R.x0 - m, R.z1 + m], [R.x1 + m, R.z1 + m]]) {
      if (segRect(p.x, p.z, cx, cz, Rs)) continue;
      const d = Math.hypot(cx - p.x, cz - p.z) + Math.hypot(q.x - cx, q.z - cz);
      if (d < bd) { bd = d; best = { x: cx, z: cz }; }
    }
    if (best) return best;
    // 角が見えない（四角に沿って張り付いている）：近い辺の外へ一歩出る
    const e = [[p.x - R.x0, -1, 0], [R.x1 - p.x, 1, 0], [p.z - R.z0, 0, -1], [R.z1 - p.z, 0, 1]].sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]))[0];
    return { x: p.x + e[1] * 1.5, z: p.z + e[2] * 1.5 };
  }
  return q;
}
// p から、曲輪 goal の点 gq へ。門が閉まっていれば門（の形）を返す（打ち破る相手）
function route(P, p, goal, gq) {
  const r = P.regionOf(p.x, p.z);
  const reg = P.regs[r];
  if (r === goal) return avoid(reg, p, gq);
  const inward = r < goal;
  const g = P.gates[inward ? r : r - 1];
  const out = (p.x - g.c.x) * g.n.x + (p.z - g.c.z) * g.n.z;
  const lat = Math.abs((p.x - g.c.x) * g.n.z - (p.z - g.c.z) * g.n.x);
  if (inward) {
    if (!(lat < g.w / 2 + 1.0 && out > -1 && out < g.appD + 1.5)) return avoid(reg, p, g.app);
    if (g.st.alive) return g.st;
    // 開いた門は、門の真ん中の筋に寄ってからくぐる（塀の脇から斜めに入ろうとして詰まらないように）
    if (out > 0.3) return lat > g.w / 2 - 0.9 ? { x: g.c.x + g.n.x * Math.max(1.6, out), z: g.c.z + g.n.z * Math.max(1.6, out) } : { x: g.c.x - g.n.x * 1.4, z: g.c.z - g.n.z * 1.4 };
    return g.inP;
  }
  if (!(lat < g.w / 2 + 1.0 && out < 1 && out > -6.5)) return avoid(reg, p, g.inP);
  if (g.st.alive) return g.inP;
  if (out < -0.3) return lat > g.w / 2 - 0.9 ? { x: g.c.x + g.n.x * Math.min(-1.6, out), z: g.c.z + g.n.z * Math.min(-1.6, out) } : { x: g.c.x + g.n.x * 1.4, z: g.c.z + g.n.z * 1.4 };
  return g.app;
}

// ======================================================================
// 戦の定義を作る
// info：{ castle, prov, type, koku, season, era, date, year, atk: { name, crest, color, daimyo }, def: { … }, a0, b0, defend, fort }
// ======================================================================
export function castleBattle(info) {
  const typeKey = TYPE_NAME[info.type] ? info.type : 'hira';
  info = { ...info, type: typeKey };
  const P = makePlan(info);
  const gr = P.grade;
  const defend = !!info.defend;
  const monA = MON_OF[info.atk.name] || 'maru';
  const monB = MON_OF[info.def.name] || (monA === 'maru' ? 'ichimonji' : 'maru');
  let facA = FAC_OF[info.atk.name] || 'tokugawa';
  let facB = FAC_OF[info.def.name] || 'saito';
  if (facA === facB) facB = facA === 'saito' ? 'imagawa' : 'saito';
  const texA = MON_OF[info.atk.name] ? flagTexture(monA) : crestTexture(info.atk.name, info.atk.crest, info.atk.color);
  const texB = MON_OF[info.def.name] ? flagTexture(monB) : crestTexture(info.def.name, info.def.crest, info.def.color);
  const flagA = MON_OF[info.atk.name] ? {} : { flag: monA };
  const flagB = MON_OF[info.def.name] ? {} : { flag: monB };
  const clanA = info.atk.name.replace('家', ''), clanB = info.def.name.replace('家', '');
  // 大将の名：地図の城主（info.*.lord）があればその名で名乗らせる
  let lordA = info.atk.lord || info.atk.daimyo || `${clanA}の大将`;
  const lordB = info.def.lord || `${clanB}方の城将`;
  let jodai = info.def.lord || `${clanB}方の城代`;
  const season = info.season || '夏';
  // 鉄砲の多い少ない：年のほか、早くから鉄砲をそろえた家（織田・雑賀・本願寺・島津など）は多く、奥羽などの遠国は少なく
  const gunLv = (house) => {
    const y = info.year || 1575;
    if (y < 1555) return 0;
    let lv = y >= 1570 ? 2 : 1;
    if (/織田|雑賀|本願寺|根来|島津|大友|徳川/.test(house || '')) lv++;
    if (/陸奥|出羽|蝦夷|飛騨/.test(info.prov || '') && y < 1580) lv--;
    return Math.max(0, Math.min(3, lv));
  };
  const gunA = gunLv(info.atk.name), gunB = gunLv(info.def.name);
  const guns = gunA > 0;
  const gunsB = [0, 1, 2, 3][gunB] + (defend && gunB ? 1 : 0);   // 塀の射手一組の中の鉄砲の数
  const castle = info.castle;
  const TN = TYPE_NAME[typeKey];
  const tier = gr.t;
  const sc = (k) => Math.max(2, Math.round(k * (0.78 + 0.14 * tier)));
  const fort = info.fort || 0;
  // 兵糧の続く日数（info.days）で、日暮れ・引き揚げまでの長さを決める
  const TIME_LIMIT = info.days != null ? Math.max(480, Math.min(720, 420 + info.days * 5)) : 660;
  const kataK = info.kata != null ? 0.8 + Math.max(0, Math.min(100, info.kata)) / 250 : 1;   // 城の堅さ（0〜100）で門の固さを変える
  const HOLD_T = 240;   // 守る戦：法螺からこれだけ持ちこたえれば、寄せ手は退く
  const A = defend ? 1 : 0;   // 寄せ手の組の team
  const Dt = 1 - A;           // 城方の組の team
  const atkGroup = (rt, o, list) => (defend ? enemyGroup(rt, { faction: facA, fleeDir: { x: 0, z: 1 }, ...o }, list) : allyGroup(rt, { faction: facA, ...o }, list));
  const defGroup = (rt, o, list) => (defend ? allyGroup(rt, { faction: facB, ...o }, list) : enemyGroup(rt, { faction: facB, fleeDir: { x: 0, z: -1 }, ...o }, list));
  const spawnZ = P.front + 76;
  const yoseZ = P.front + (P.type === 'hira' ? 24 : 20);
  const N = P.N;
  // 守る戦で自分が守る曲輪（枡形ではない一番外の曲輪）
  const defReg = P.regs[1].name === '枡形' ? 2 : 1;
  const gateHp = (g) => Math.round(({ kido: 3600, korai: 4600, yagura: 5200 }[g.kind] || 4600) * (1 + 0.08 * tier) * (1 + 0.15 * fort) * kataK * (typeKey === 'toride' && g.i === 0 ? 2.1 : 1) * (defend ? 1.35 : 1) * (g.i === 0 ? 1 : 0.75) * (P.gates.length <= 2 ? 1.9 : P.gates.length >= 5 ? 0.72 : P.gates.length >= 4 ? 0.85 : 1));
  const gateArmor = (g) => ({ kido: 0.1, korai: 0.22, yagura: 0.32 }[g.kind] || 0.2);

  const def = {
    mapCastle: true,
    mapInfo: info,
    trackerIndex: 0,
    title: defend ? `${castle}の守り` : `${castle}攻め`,
    spawn: defend ? { x: P.gates[defReg - 1].c.x - P.gates[defReg - 1].n.x * 6, z: P.gates[defReg - 1].c.z - P.gates[defReg - 1].n.z * 6, heading: Math.atan2(P.gates[defReg - 1].n.x, P.gates[defReg - 1].n.z) } : { x: 3, z: spawnZ, heading: Math.PI },
    world: {
      seed: 700 + (castle.charCodeAt(0) % 97),
      height: P.height, tint: P.tint, clear: P.clear,
      time: 'day', muddy: season === '春' ? 0.45 : 0.25, autumn: season === '秋' || season === '冬', mist: season === '春',
      trees: 300, tufts: 3200,
      paths: [[[0, 176], [0, spawnZ + 20], [0, P.front + 30], [0, P.front + 12]]],
      groves: [{ x: -95, z: 40, r: 16, n: 22 }, { x: 100, z: 20, r: 16, n: 22 }, { x: -80, z: P.back - 40, r: 18, n: 26 }],
      treeDensity: (x, z) => (Math.abs(x) > 100 || z < P.back - 30 ? 1 : 0.5),
    },

    setup(rt) {
      const W = rt.world, F = rt.flags;
      // 自分が城主の時は、自分に下知させない（当主か家の大将の名に）
      if (lordA === rt.G.name) lordA = info.atk.daimyo && info.atk.daimyo !== rt.G.name ? info.atk.daimyo : `${clanA}の大将`;
      if (jodai === rt.G.name) jodai = `${clanB}方の城代`;
      this.bossName = defend ? jodai : lordA;   // 「あちらじゃ」などで話す上役の名
      this._rt = rt;
      F.P = P; F.ek = 0; F.ak = 0; F.step = 0; F.gatesDown = 0;
      F.a0 = info.a0 || 6000; F.b0 = info.b0 || 900;
      this.build(rt);
      this.forces(rt);
      this.patchCover(rt);
      rt.world.setTime('day');
      rt.setPhase('brief');
      if (defend) this.briefDefend(rt); else this.briefAttack(rt);
    },

    // ---------------- 城を建てる ----------------
    build(rt) {
      const W = rt.world, F = rt.flags;
      const B = bag();
      const none = () => new THREE.Group();
      // 塀と柵（当たりのある線）。搦手の木戸の所は切る。形は二十歩ほどずつに分けてまとめる（カメラの当たりを軽く）
      F.walls = [];
      const pg = P.port;
      for (const wl of P.walls) {
        for (const pts of cutAt(wl.pts, pg.c, pg.w / 2 + 0.15)) {
          const segs = wallLine(rt, pts, { team: Dt, hp: 1e9, name: wl.kind === 'saku' ? '柵' : '塀', mesh: none, segLen: 6 });
          for (const s of segs) { s.noTarget = true; s.wall = true; if (wl.kind !== 'saku') s.h = 2.6; }
          F.walls.push(...segs);
          const holes = [];
          for (const piece of chop(pts, 20)) {
            if (wl.kind === 'saku') sakuLine(B, W, piece, wl.h || 2.6);
            else dobeiLine(B, W, piece, wl.c, { holes, shitami: !P.stone && !wl.stone });
            // 石垣は石を一つずつ積んだ形（props.js の ishigaki）。門の口の所は空ける（A4）
            if (wl.stone) for (const run of cutAt(piece, pg.c, 3.5)) if (run.length > 1) {
              const [ax, az] = run[0], [bx, bz] = run[1], N = outN(ax, az, bx, bz, wl.c), L = Math.hypot(bx - ax, bz - az) || 1;
              const side = (-(bz - az) / L) * N.x + ((bx - ax) / L) * N.z > 0 ? 1 : -1;
              rt.scene.add(ishigaki(W, run, { out: side, top: 0.25, minH: 1.5, maxH: 9, sink: 0.6, big: 1.5 }));
            }
            flush(rt, B);
          }
          if (wl.kind !== 'saku') attachSama(segs, holes);
        }
      }
      // 門
      F.gates = P.gates;
      for (const g of P.gates) {
        const hp = gateHp(g);
        g.st = rt.army.addStruct({ seg: g.seg, nx: g.n.x, nz: g.n.z, hp, maxHp: hp, armor: gateArmor(g), team: Dt, name: g.name, gate: g.i });
        g.st.mesh = doorMesh(W, g.seg, g.kind === 'kido' ? 2.7 : 3.1);
        rt.scene.add(g.st.mesh);
        if (g.kind === 'korai') koraimon(B, W, g); else if (g.kind === 'yagura') yaguramon(B, W, g); else kido(B, W, g);
        flush(rt, B);
      }
      // 搦手の木戸（守る戦で打って出る口）
      pg.st = rt.army.addStruct({ seg: pg.seg, nx: pg.n.x, nz: pg.n.z, hp: 1e9, maxHp: 1e9, team: Dt, name: pg.name, port: true });
      pg.st.noTarget = true;
      pg.st.mesh = doorMesh(W, pg.seg, 2.5);
      rt.scene.add(pg.st.mesh);
      kido(B, W, pg); flush(rt, B);
      // 櫓
      for (const t of P.towers) { if (t.kind === 'sumi') sumiyagura(B, W, t, !P.stone); else monomi(B, W, t); flush(rt, B); }
      // 城の中の建物
      sumiG(B, W, P);
      for (const b of P.bld) {
        if (b.k === 'nagaya') nagaya(B, W, b.x, b.z, b.w, b.d, b.rot, b.tile);
        else if (b.k === 'kura') kura(B, W, b.x, b.z, b.w, b.d, b.rot);
        else if (b.k === 'ido') ido(B, W, b.x, b.z);
        else if (b.k === 'umaya') umaya(B, W, b.x, b.z, b.w, b.d, b.rot);
        else if (b.k === 'yashiki') yashiki(B, W, b.x, b.z, b.w, b.d, b.rot, b.tile);
        else if (b.k === 'tenshu') tenshu(B, W, b.x, b.z, b.b, b.floors, b.old);
        else if (b.k === 'hut') rt.scene.add(hut(W, b.x, b.z, b.w, b.d, b.rot, { roof: 0x5a4c3a }));
        else if (b.k === 'tawara') rt.scene.add(tawara(W, b.x, b.z, 0.3, 6));
        // 建物は通り抜けられない（小屋・俵は props.js の側で当たりを付ける）
        if (b.k === 'nagaya' || b.k === 'kura' || b.k === 'umaya' || b.k === 'yashiki') solidRect(b.x, b.z, b.w + 0.4, b.d + 0.4, b.rot || 0);
        else if (b.k === 'tenshu') solidRect(b.x, b.z, b.b + 2.8, b.b + 2.8, 0);
        else if (b.k === 'ido') solidCircle(b.x, b.z, 1.0);
        flush(rt, B);
      }
      // 御殿（奥と東西の壁に当たり）
      const G = P.goten;
      goten(B, W, G);
      flush(rt, B);
      const gx0 = G.x - G.w / 2, gx1 = G.x + G.w / 2, gz0 = G.z - G.d / 2, gz1 = G.z + G.d / 2;
      for (const seg of [[gx0, gz0, gx1, gz0], [gx0, gz0, gx0, gz1 - 0.3], [gx1, gz0, gx1, gz1 - 0.3]]) {
        const s = rt.army.addStruct({ seg, nx: 0, nz: 1, hp: 1e9, maxHp: 1e9, team: Dt, name: '御殿の壁' });
        s.noTarget = true; s.wall = true;
      }
      // 東西の壁は線の当たりだけでは押し抜けるので、薄い箱の当たりも重ねる
      solidRect(G.x, gz0, G.w + 0.4, 0.6, 0);
      solidRect(gx0, (gz0 + gz1 - 0.3) / 2, 0.6, G.d - 0.3, 0);
      solidRect(gx1, (gz0 + gz1 - 0.3) / 2, 0.6, G.d - 0.3, 0);
      // 小さな物（逆茂木・乱杭・水面）はカメラの当たりにしない
      for (const [x, z, a] of P.sakamogi) sakamogi(B, W, x, z, a);
      P.rankui.forEach(([x, z], k) => rankui(B, W, x, z, k));
      // 竹束の置き場（城の内、塀の脇）
      flush(rt, B, false);
      for (const w of P.water) {
        const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        const g = new THREE.PlaneGeometry(len, w.hw * 2);
        g.rotateX(-Math.PI / 2);
        g.rotateY(Math.atan2(-(w.b[1] - w.a[1]), w.b[0] - w.a[0]));
        g.translate((w.a[0] + w.b[0]) / 2, w.y, (w.a[1] + w.b[1]) / 2);
        const m = new THREE.Mesh(g, mats().water);
        m.receiveShadow = true;
        rt.scene.add(m);
      }
      // 旗（城方の家）
      for (const [x, z] of P.flags) rt.scene.add(MON_OF[info.def.name] ? nobori(W, x, z, monB, 5.5) : hata(W, x, z, texB, 5.5));
      // 塀の内に沿って、守り手の幟を立て並べる（塀の上に旗の列がのぞき、人の詰めた城に見える）。門の前は空ける
      let nf = 0;
      for (const wl of P.walls) {
        if (wl.pts.length < 5) continue;
        let acc = 6;
        for (let i = 0; i < wl.pts.length - 1 && nf < 28; i++) {
          const [ax, az] = wl.pts[i], [bx, bz] = wl.pts[i + 1], len = Math.hypot(bx - ax, bz - az), N = outN(ax, az, bx, bz, wl.c);
          for (; acc < len; acc += 13) {
            const x = ax + (bx - ax) * acc / len - N.x * 1.7, z = az + (bz - az) * acc / len - N.z * 1.7;
            if (P.gates.some((g) => Math.hypot(g.c.x - x, g.c.z - z) < 5) || P.bld.some((b) => b.w && Math.hypot(b.x - x, b.z - z) < Math.max(b.w, b.d) / 2 + 1)) continue;
            rt.scene.add(MON_OF[info.def.name] ? nobori(W, x, z, monB, 4.6) : hata(W, x, z, texB, 4.6));
            nf++;
          }
          acc -= len;
        }
      }
      // 寄せ手の本陣（南の丘）と旗
      // （陣幕・旗本・使番は forces の camp で置く）
      for (const [x, z] of [[-10, spawnZ + 22], [10, spawnZ + 22], [-26, spawnZ - 10], [26, spawnZ - 10], [-P.halfW - 20, P.front + 30], [P.halfW + 20, P.front + 30]]) rt.scene.add(MON_OF[info.atk.name] ? nobori(W, x, z, monA, 5.5) : hata(W, x, z, texA, 5.5));
      rt.scene.add(campfire(W, -6, spawnZ + 26), campfire(W, 6, spawnZ + 26));
      // 大軍：城をぐるりと囲む寄せ手（軽い作り）
      const hw = P.halfW;
      const DA = (x, z, w, d, count, facing, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor: 0x24221f, flagTex: texA, seed });
      const k = 0.8 + 0.2 * tier;
      DA(-hw - 44, P.front + 16, 40, 16, Math.round(240 * k), Math.PI * 0.8, 81); DA(hw + 44, P.front + 16, 40, 16, Math.round(240 * k), -Math.PI * 0.8, 82);
      DA(-hw - 52, (P.front + P.back) / 2, 18, 60, Math.round(220 * k), Math.PI / 2, 83); DA(hw + 52, (P.front + P.back) / 2, 18, 60, Math.round(220 * k), -Math.PI / 2, 84);
      DA(0, spawnZ + 58, 70, 16, Math.round(300 * k), Math.PI, 85);
      // 城の裏（搦手の外）にも寄せ手を置き、ぐるりと囲む。囲みの陣ごとに陣幕と篝火
      DA(0, P.back - 46, hw * 1.3, 12, Math.round(160 * k), 0, 86);
      // 武田の城攻め・武田の城：武田の騎馬の大きな塊を、囲みの外に見せる（軽い作り。籠城なので本物には替えない）
      if (info.atk.name === '武田家' || info.def.name === '武田家') {
        const tk = info.atk.name === '武田家';
        const cav = KIT.farHost(rt, tk ? -hw - 70 : hw + 80, tk ? spawnZ + 20 : P.back - 20, 46, 18, Math.round(260 * k), tk ? Math.PI * 0.85 : -Math.PI / 2, 0x8e1f16, 'takeda', 87, 'cavalry');
        if (cav) { cav.noWake = true; if (cav.army) cav.army.noWake = true; }
        F.takedaCav = true;
      }
      for (const [x, z, r] of [[-hw - 66, P.front + 4, Math.PI / 2], [hw + 66, P.front + 4, -Math.PI / 2], [-hw - 66, P.back + 6, Math.PI / 2], [hw + 66, P.back + 6, -Math.PI / 2], [-28, P.back - 60, 0], [28, P.back - 60, 0]]) {
        rt.scene.add(jinmaku(W, x, z, 10, 7, 4), campfire(W, x + Math.sin(r) * 6, z + Math.cos(r) * 6));
        rt.scene.add(MON_OF[info.atk.name] ? nobori(W, x + Math.cos(r) * 5, z - Math.sin(r) * 5, monA, 5) : hata(W, x + Math.cos(r) * 5, z - Math.sin(r) * 5, texA, 5));
      }
      // 城の奥に詰める城兵
      W.addDistantArmy({ x: 0, z: P.back + 14, w: hw * 0.9, d: 8, count: Math.round(90 * k), facing: 0, armor: 0x3a2622, flagTex: texB, seed: 88 });
      // 竹束（動かせる物）
      F.tabas = [];
    },

    // 門破りの組が抱える丸太（破城槌）：組の真ん中について動き、門に着くと前後に揺すって打つ
    ramLog(rt) {
      const F = rt.flags;
      if (defend || !F.ram) return;
      if (!F.log) {
        const m = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.22, 0.26, 5.2, 8), 0x5a4632), mats().wood);
        m.castShadow = true;
        rt.scene.add(m);
        F.log = m;
      }
      const live = F.ram.units.filter((u) => u.alive);
      if (live.length < 3) { F.log.visible = false; return; }
      F.log.visible = true;
      let cx = 0, cz = 0; for (const u of live.slice(0, 6)) { cx += u.pos.x; cz += u.pos.z; }
      const n = Math.min(6, live.length); cx /= n; cz /= n;
      const g = P.gates.find((x) => x.st.alive);
      const h = g && Math.hypot(g.c.x - cx, g.c.z - cz) < 7 ? Math.atan2(-g.n.x, -g.n.z) : (live[0].heading || Math.PI);
      const swing = g && Math.hypot(g.c.x - cx, g.c.z - cz) < 5 ? Math.sin(rt.t * 5) * 0.6 : 0;
      const x = cx + Math.sin(h) * swing, z = cz + Math.cos(h) * swing;
      F.log.position.set(x, rt.world.heightAt(x, z) + 0.95, z);
      F.log.rotation.set(Math.PI / 2, 0, 0);
      F.log.rotation.order = 'YXZ'; F.log.rotation.y = h;
    },

    // 竹束を一つ置く（team の側の楯）
    addTaba(rt, x, z, team, o = {}) {
      const m = new THREE.Mesh(tabaGeo(), mats().wood);
      m.castShadow = true;
      rt.scene.add(m);
      const tb = { m, x, z, rot: o.rot ?? (team === A ? Math.PI : 0), team, carrier: null, van: o.van || null, off: o.off || 0, fixed: false };
      this.placeTaba(rt, tb);
      rt.flags.tabas.push(tb);
      return tb;
    },
    placeTaba(rt, tb) {
      tb.m.position.set(tb.x, rt.world.heightAt(tb.x, tb.z) - 0.05, tb.z);
      // 竹束の前（原点の -z）を寄せる向きへ
      tb.m.rotation.y = tb.rot + Math.PI;
    },
    // 竹束の陰にいる者には、前から来る矢玉がほとんど当たらない
    patchCover(rt) {
      const F = rt.flags, army = rt.army;
      const dmg0 = army.damage.bind(army);
      army.damage = (t, amount, src, opts) => {
        if (t && !t.isStruct && src && (src.type === 'gun' || src.type === 'bow') && src.team !== t.team && t.pos && F.tabas.length) {
          const dS = Math.hypot(src.pos.x - t.pos.x, src.pos.z - t.pos.z);
          if (dS > 6) {
            for (const tb of F.tabas) {
              if (tb.team !== t.team) continue;
              const dx = tb.x - t.pos.x, dz = tb.z - t.pos.z, d = Math.hypot(dx, dz);
              if (d > 2.6 || d < 0.05) continue;
              const dot = (dx * (src.pos.x - t.pos.x) + dz * (src.pos.z - t.pos.z)) / (d * dS);
              if (dot > 0.5 && Math.random() < 0.85) {
                army.play('knock', { x: tb.x, z: tb.z }, 0.5);
                army.spark(tb.x, rt.world.heightAt(tb.x, tb.z) + 1.2, tb.z, 3);
                F.tabaSaved = (F.tabaSaved || 0) + 1;
                return;
              }
            }
          }
        }
        return dmg0(t, amount, src, opts);
      };
    },

    // ---------------- 両軍 ----------------
    forces(rt) {
      const W = rt.world, F = rt.flags;
      // 寄せ手：本陣の大将、先手三組、鉄砲組、門破りの組
      const lg = atkGroup(rt, { name: '本陣', anchor: { x: 0, z: spawnZ + 26 }, facing: Math.PI, noRout: true, aggro: 4 },
        [{ type: 'busho', n: 1, o: { name: lordA, invuln: true, horse: true, flag: MON_OF[info.atk.name] ? monA : 'maru' } }, { type: 'samurai', n: 4 }]);
      F.lordA = lg.units[0];
      F.lordA.announced = true;
      // 本陣の陣幕と旗本（大将は上の lg。camp は大将を置かず旗本・使番だけ）。見に行けば大将と旗本がそろっている
      const H = camp(rt, { x: 0, z: spawnZ + 30, facing: Math.PI, team: defend ? 1 : 0, faction: facA, mon: monA, armor: 0x24221f,
        guard: 15, reserve: 0, runTo: { x: 0, z: P.front + 14 } });
      H.guard.name = `${lordA}の旗本`;
      F.vans = [];
      const vanN = defend ? sc(11) : 12;
      for (const [x, z] of [[-16, spawnZ - 14], [16, spawnZ - 14], [0, spawnZ - 20]]) {
        const g = atkGroup(rt, { name: '先手', anchor: { x, z }, facing: Math.PI, width: 7, aggro: 7, order: 'hold' },
          [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: vanN, o: flagA }]);
        g.assault = (u) => route(P, u.pos, N, this.goalPt(rt));
        F.vans.push(g);
        for (const s of [-1, 1]) this.addTaba(rt, x + s * 1.7, z - 2.4, A, { van: g, off: s * 1.7 });
      }
      // 鉄砲の少ない家は、鉄砲組の半ばを弓で埋める（人数は同じ）
      const nG = defend ? 8 : 10, nGun = guns ? (gunA >= 2 ? nG : Math.round(nG * 0.5)) : 0;
      F.gun = atkGroup(rt, { name: guns ? '鉄砲組' : '弓組', anchor: { x: 0, z: spawnZ - 6 }, facing: Math.PI, width: 8, aggro: 44, noRout: !defend },
        [...(nGun ? [{ type: 'gun', n: nGun, o: flagA }] : []), ...(nG - nGun ? [{ type: 'bow', n: nG - nGun, o: flagA }] : [])]);
      for (const s of [-1, 0, 1]) this.addTaba(rt, s * 3.2, spawnZ - 9, A, { van: F.gun, off: s * 3.2 });
      F.ram = atkGroup(rt, { name: '門破りの組', anchor: { x: -8, z: spawnZ - 8 }, facing: Math.PI, width: 4, aggro: 3, noRout: true, formation: 'column' },
        [{ type: 'samurai', n: 1, o: { name: '門破りの頭' } }, { type: 'ashigaru', n: defend ? 10 : 9, o: { hat: 'jingasa_n', ...flagA } }]);
      F.ram.assault = (u) => route(P, u.pos, N, this.goalPt(rt));
      F.rams = [F.ram];
      if (!defend && lowRank(rt)) {
        // 足軽（組なし）：先手の組の一人として寄る。竹束は自分の前に一つ
        this.addTaba(rt, 3.2, spawnZ - 2.3, A);
      } else if (!defend) {
        // 自分の組と、押して寄る竹束（組の前に二つ）
        const n = Math.max(15, RANKS[rt.G.rank].squad);
        const bows = Math.round(n * (rt.G.bowRatio ?? 0.33));
        rt.makeSquad({ x: 3, z: spawnZ + 5 }, Math.PI, [{ kind: 'spear', n: n - bows }, { kind: 'bow', n: bows }]);
        this.addTaba(rt, 1.2, spawnZ - 2.5, A);
        this.addTaba(rt, 5.2, spawnZ - 2.0, A);
      }
      // 城方：門ごとの塀の射手と門の内の槍組、櫓の射手、本丸の城将と旗本
      // 本物の兵は、寄せ手に近い曲輪から置く（重さの上限の内）。奥の曲輪は、はじめは軽い兵（大軍の作り）で狭間と門の内を埋めておき、
      // 手前の門が破れるたびに、先の門の守りを本物の兵に替える（garrisonAt）
      F.garrison = P.gates.map(() => []);
      F.gSpawned = P.gates.map(() => false);
      F.lightG = P.gates.map(() => null);
      F.shooters = [];
      // 櫓の上の射手（鉄砲のある家は一人を鉄砲に）
      F.towerU = [];
      for (const t of P.towers) {
        if (!t.arch) continue;
        const nGun = gunsB && typeKey !== 'toride' && t.arch >= 2 ? 1 : 0;
        const g = defGroup(rt, { name: '櫓の射手', anchor: { x: t.x, z: t.z }, facing: 0, width: 2, spacing: 1.1, aggro: 0, noRout: true },
          [{ type: 'bow', n: t.arch - nGun, o: flagB }, ...(nGun ? [{ type: 'gun', n: nGun, o: flagB }] : [])]);
        g.units.forEach((u, k) => {
          u.pos.x = t.x + (k % 2 ? 0.7 : -0.7); u.pos.z = t.z + (k < 2 ? 0.7 : -0.7);
          u.speed = u.run = 0; u.tower = t;
          F.towerU.push(u);
        });
        this.shooter(g);
      }
      const first = defend ? P.gates.length - 1 : 2;
      P.gates.forEach((g, gi) => { if (gi <= first) this.garrisonAt(rt, gi); else F.lightG[gi] = this.lightGarrison(rt, gi); });
      // 本丸：御殿の広間に城将、前庭に旗本
      const G = P.goten;
      const fa0 = 0;
      if (defend) {
        const jg = defGroup(rt, { name: '城代', anchor: { x: G.x, z: G.z + 0.5 }, facing: fa0, noRout: true, aggro: 3 }, [{ type: 'busho', n: 1, o: { name: jodai, invuln: true } }, { type: 'samurai', n: 6 }]);
        F.jodai = jg.units[0];
      } else {
        F.lordG = defGroup(rt, { name: '城将', anchor: { x: G.x, z: G.z + 0.8 }, facing: fa0, noRout: true, aggro: 3, order: 'hold' }, [{ type: 'busho', n: 1, o: { name: lordB } }]);
        F.lordB = F.lordG.units[0];
        F.lordB.announced = true;
        F.hata = defGroup(rt, { name: '旗本', anchor: { x: P.court.x, z: P.court.z }, facing: fa0, width: 6, aggro: 6, noRout: true, order: 'hold' },
          [{ type: 'samurai', n: sc(5) }, { type: 'ashigaru', n: sc(8), o: flagB }, { type: 'bow', n: 2, o: flagB }]);
      }
      if (defend) this.defendForces(rt);
    },
    // 城からの矢玉は、当たれば痛いが一発では倒れない強さに（守る戦では味方の射手）
    shooter(g) {
      if (!g) return g;
      this._rt.flags.shooters.push(g);
      if (!defend) { g.dmgMult = 0.36; for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.4; }
      return g;
    },
    // 門 gi の守り（本物の兵）：門の脇の塀の狭間に付く射手、門の内の槍組。枡形の門なら、枡形の両脇の塀の射手と、奥から枡形を撃ち下ろす射手
    garrisonAt(rt, gi) {
      const F = rt.flags;
      if (!P.gates[gi] || F.gSpawned[gi]) return;
      F.gSpawned[gi] = true;
      if (F.lightG[gi]) { F.lightG[gi].visible = false; F.lightG[gi] = null; }
      const g = P.gates[gi];
      const inner = P.regs[g.i + 1], outer = P.regs[g.i];
      // 戦う兵が多すぎれば、置く数を減らす（寄せ手の新手の分を残して、200人まで）
      const alive = () => { let n = 0; for (const u of rt.army.units) if (u.alive) n++; return n; };
      const mk = (to, o, list) => {
        let room = 200 - alive();
        const L = [];
        for (const e of list) { const n = Math.min(e.n, room); if (n > 0) { L.push({ ...e, n }); room -= n; } }
        if (!L.length) return null;
        const gg = defGroup(rt, o, L);
        F.garrison[to].push(gg);
        return gg;
      };
      const fa = Math.atan2(g.n.x, g.n.z);
      const lx = g.n.z, lz = -g.n.x;   // 門の線の向き
      const at = (d, l) => ({ x: g.c.x - g.n.x * d + lx * l, z: g.c.z - g.n.z * d + lz * l });
      const gunN = gunsB && typeKey !== 'toride' ? gunsB : 0;
      const mix = (bow, gun = gunN) => [{ type: 'bow', n: bow, o: flagB }, ...(gun ? [{ type: 'gun', n: gun, o: flagB }] : [])];
      // 外の曲輪が枡形：奥の塀から枡形の中を撃ち下ろす
      if (outer && outer.name && outer.name.includes('枡形') && !defend) {
        const M = outer.rect;
        this.shooter(mk(gi, { name: '枡形を撃つ射手', anchor: { x: (M.x0 + M.x1) / 2 - 2, z: M.z0 - 4 }, facing: 0, width: 6, aggro: 30, noRout: true, order: 'hold' }, mix(sc(3), Math.min(2, gunN))));
      }
      if (inner.name.includes('枡形')) {
        // 枡形の両脇（外の曲輪の正面の塀）の狭間から、土橋を渡る者と門に取り付く者を撃つ。枡形の先の門の守りに数える
        const M = inner.rect, hwM = (M.x1 - M.x0) / 2;
        for (const s of [-1, 1]) this.shooter(mk(gi + 1, { name: '塀の射手', anchor: at(3.2, s * (hwM + 6)), facing: fa, width: 6, aggro: 38, noRout: true, order: 'hold' }, mix(sc(3) + (gunN ? 0 : 2), gunN)));
        return;
      }
      const last = g.i + 1 === N;
      const sd = g.i === 0 ? 4.5 : 7.5;   // 内の門の射手は少し奥から（門に取り付いた者を至近で射すくめないように）
      this.shooter(mk(gi, { name: '塀の射手', anchor: at(sd, -6), facing: fa, width: 6, aggro: 36, noRout: true, order: 'hold' },
        mix(sc(defend ? 5 : 4) + Math.max(0, (defend ? 3 : 2) - gunN))));
      if (!last || typeKey === 'toride') this.shooter(mk(gi, { name: '塀の射手', anchor: at(sd, 7), facing: fa, width: 5, aggro: 36, noRout: true, order: 'hold' }, mix(sc(3), Math.min(1, gunN))));
      // 外の曲輪の正面は、門から離れた塀にも射手を置き、寄せる者を横から撃つ（横矢）
      if (g.i === 0 && typeKey !== 'toride') {
        const hwR = inner.rect ? (inner.rect.x1 - inner.rect.x0) / 2 : inner.ring ? inner.ring.rx : P.halfW;
        const l = Math.min(15, hwR * 0.55);
        for (const s of [-1, 1]) this.shooter(mk(gi, { name: '横矢の射手', anchor: at(3.5, s * l), facing: fa, width: 5, aggro: 38, noRout: true, order: 'hold' }, mix(sc(2), Math.min(1, gunN))));
      }
      // 門の内の槍組：門の真後ろに槍を揃えて待つ（門が破れれば打って出る）
      mk(gi, { name: '門の内の槍組', anchor: at(9, 0), facing: fa, width: 6, aggro: 6, noRout: true, order: 'hold' },
        [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: sc(last ? 8 : 11), o: flagB }]);
    },
    // 門 gi の守り（軽い兵）：狭間に付く鉄砲と弓、門の内の槍組と旗。奥の曲輪を「人のいる城」に見せる（戦わない）
    lightGarrison(rt, gi) {
      const F = rt.flags;
      const g = P.gates[gi];
      const r = g.i + 1, reg = P.regs[r];
      const c = reg.c || g.c;
      const fa = Math.atan2(g.n.x, g.n.z);
      const people = [];
      let k = 0;
      for (const s of F.walls) {
        if (people.length >= 16) break;
        const [ax, az, bx, bz] = s.seg, mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (Math.hypot(mx - g.c.x, mz - g.c.z) > 24) continue;
        const Nw = outN(ax, az, bx, bz, c);
        const x = mx - Nw.x * 0.8, z = mz - Nw.z * 0.8;
        if (P.regionOf(x, z) !== r) continue;
        people.push({ x, z, k: k++ % 3 === 2 ? 'bow' : gunsB ? 'gun' : 'bow', facing: Math.atan2(Nw.x, Nw.z) });
      }
      const lx = g.n.z, lz = -g.n.x;
      for (let i = 0; i < 15; i++) {
        const d = 8 + Math.floor(i / 5) * 1.2, l = (i % 5 - 2) * 1.1;
        const x = g.c.x - g.n.x * d + lx * l, z = g.c.z - g.n.z * d + lz * l;
        if (P.regionOf(x, z) === r) people.push({ x, z, k: i < 5 && i % 2 ? 'samurai' : 'spear', facing: fa });
      }
      const bx = g.c.x - g.n.x * 12 + lx * 2.6, bz = g.c.z - g.n.z * 12 + lz * 2.6;
      if (P.regionOf(bx, bz) === r) people.push({ x: bx, z: bz, k: 'banner', facing: fa });
      if (!people.length) return null;
      return rt.world.addDistantArmy({ people, facing: fa, armor: 0x3a2622, flagTex: texB, seed: 90 + gi });
    },
    // 寄せ手の目当て：本丸の城将（守る戦では本丸の前庭）
    goalPt(rt) {
      const F = rt.flags;
      if (F.lordB && F.lordB.alive) return { x: F.lordB.pos.x, z: F.lordB.pos.z };
      return { x: P.court.x, z: P.court.z };
    },

    // ================= 攻める戦 =================
    briefAttack(rt) {
      const F = rt.flags;
      rt.obj('main', `${STAGE(0)}竹束を押して、寄せ場まで寄せよ`, 'main');
      rt.obj('lord', `本丸の城将を討ち、${castle}を落とせ`, 'main');
      rt.say(lordA, `${castle}を攻める。城に籠るは${info.def.name}の兵、およそ${F.b0.toLocaleString('ja-JP')}`, 4.5);
      if (typeKey === 'hira') rt.say(lordA, P.masu > 0 ? '水堀を土橋で渡ると大手の一の門。その奥は枡形で、右に折れて櫓門じゃ。四方の塀から撃たれるぞ' : '水堀を土橋で渡ると大手門。塀の狭間から撃ってくる。心してかかれ', 5);
      else if (typeKey === 'yama') rt.say(lordA, '曲輪を段に重ねた山の城じゃ。切岸は登れぬ。坂の虎口を一つずつ破って上れ', 5);
      else rt.say(lordA, '空堀と逆茂木で固めた砦じゃ。木戸を破れば、中は狭い', 4);
      rt.say(lordA, lowRank(rt) ? `${nm(rt)}、先手の組に加われ。まず竹束を押して寄せ場まで出る。矢玉は竹束が受けてくれる` : `${nm(rt)}、先手を率いよ。まず竹束を押して寄せ場まで出る。矢玉は竹束が受けてくれる`, 5);
      rt.bark(`竹束に寄って ${EK()} で押して歩ける。もう一度で据える。陰にいれば矢玉はほとんど当たらない`);
      rt.after(17, () => this.signal(rt));
      rt.after(60, () => rt.bark('深手を負ったら、竹束の陰まで下がって息を整えよ（しばらく打たれなければ傷は癒える）'));
    },
    // 法螺の合図：竹束を押して寄せ場へ
    signal(rt) {
      const F = rt.flags;
      if (F.step >= 1) return;
      F.step = 1; F.stepT = rt.t;
      rt.setPhase('yose');
      sfx('horagai', 1);
      rt.banner('寄せよ', '竹束を押して、寄せ場まで');
      rt.say(lordA, '者ども、竹束を押し立てて寄せよ！', 3);
      // 城の内でも、寄せ手に気づいて声が上がり、太鼓が鳴る
      rt.after(4, () => { rt.army.play('eshout', P.gates[0].c, 1.3); sfx('taiko', 0.5); });
      rt.after(6.5, () => rt.say('城兵', '寄せ手じゃ！　狭間につけ！　引きつけて撃て！', 3));
      const go = (g, x, z, sp = 1.9) => { g.order = 'move'; g.dest = { x, z }; g.speed = sp; g.facing = Math.PI; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; }; };
      go(F.vans[0], -14, yoseZ + 3); go(F.vans[1], 14, yoseZ + 3); go(F.vans[2], 0, yoseZ + 7);
      go(F.gun, 0, yoseZ + 2, 1.8); go(F.ram, -6, yoseZ + 9);
      rt.zone('yose', 3, yoseZ, 8);
      rt.marker('yose', { x: 3, z: yoseZ }, '寄せ場', { h: 2.5 });
    },
    // 門破り
    breach(rt) {
      const F = rt.flags;
      if (F.step >= 2) return;
      F.step = 2; F.stepT = rt.t;
      rt.setPhase('breach');
      rt.unzone('yose'); rt.unmark('yose');
      for (const tb of F.tabas) if (tb.van) tb.van = null;   // 先手の竹束はこの線に据える
      sfx('horagai', 1);
      rt.banner('かかれ！', `${P.gates[0].name}を破れ`);
      rt.say(lordA, 'かかれぇっ！　門を破れ！', 3);
      rt.objDone('main');
      rt.obj('main', `${STAGE(1)}${P.gates[0].name}を破れ（門に寄って ${EK()} 長押しで掛矢）`, 'main');
      for (const g of [...F.vans, F.ram]) { g.order = 'assault'; g.seekRange = 12; g.aggro = 7; }
      F.gun.order = 'hold'; F.gun.anchor = { x: 0, z: yoseZ + 2 };
      this.markGate(rt);
      if (F.towerU.length) {
        rt.obj('towers', '櫓の射手を黙らせよ（弓組で狙え。黙れば門破りがはかどる）', 'side');
        P.towers.forEach((t, i) => { if (t.arch) rt.marker('tw' + i, { x: t.x, z: t.z, y: rt.world.heightAt(t.x, t.z) + t.deck + 1.2 }, () => `櫓の射手 ${F.towerU.filter((u) => u.alive && u.tower === t).length}人`, { red: true, h: 2 }); });
        if (rt.squad.length) rt.after(8, () => rt.say('', '弓組だけに号令：Tab → G で「弓隊」を選び、照準を櫓の射手に合わせて Tab → 5（敵を狙え）', 7));
      }
      rt.obj('ladder', '梯子で塀を越え、内から閂を外して門を開けよ（腕に覚えがあれば）', 'side');
      F.ladders = P.ladders.map((l) => ({ ...l, placed: false, mesh: null }));
      rt.after(18, () => rt.say(lordA, '塀の脇に梯子を掛ける所がある。腕に覚えがあれば、塀を越えて内から門を開けよ', 4.5));
      rt.after(typeKey === 'toride' ? 22 : 28, () => this.sally(rt));
    },
    markGate(rt) {
      const F = rt.flags;
      const g = P.gates.find((x) => x.st.alive);
      rt.unmark('gate');
      if (!g) return;
      rt.marker('gate', { x: g.c.x + g.n.x * 0.5, z: g.c.z + g.n.z * 0.5 }, () => `${g.name}・${Math.round(g.st.hp / g.st.maxHp * 100)}%`, { h: 4.8 });
    },
    // 城兵の打って出（搦手から横腹を突く）
    sally(rt) {
      const F = rt.flags;
      if (F.over || F.sallyG || F.step >= 3) return;
      const side = Math.random() < 0.5 ? 0 : 1;
      // 搦手の木戸が開き（扉が消え、軋む音と鬨の声）、開いた口から城兵が湧き出す。しばらくして閉じる
      const pg = P.port;
      pg.st.alive = false; pg.st.mesh.visible = false;
      rt.army.play('wood', pg.c, 1.2);
      rt.after(0.6, () => rt.army.play('eshout', pg.c, 1.6));
      rt.after(25, () => { if (!pg.st.alive && !F.ending) { pg.st.alive = true; pg.st.mesh.visible = true; rt.army.play('wood', pg.c, 0.9); } });
      const q = { x: pg.c.x + pg.n.x * 4, z: pg.c.z + pg.n.z * 4 };
      F.sallyG = defGroup(rt, { name: '打って出た城兵', anchor: q, facing: side ? -Math.PI * 0.7 : Math.PI * 0.7, order: 'attack', seekRange: 80, aggro: 14, width: 6, fleeDir: { x: side ? 1 : -1, z: -1 } },
        [{ type: 'samurai', n: 2 }, { type: 'cavalry', n: (typeKey === 'toride' ? 2 : 3 + (tier >= 2 ? 1 : 0)) + (info.def.name === '武田家' ? 3 : 0) }, { type: 'ashigaru', n: sc(10), o: flagB }]);
      F.sallyG.focus = F.gun.units.find((u) => u.alive) || null;
      // 寄せ手の鉄砲組：打って出た城兵が竹束の前まで寄ったら、一斉に放って足を止める
      if (guns) F.vol = { guns: () => [F.gun], foe: () => F.sallyG, r: 20, max: 40, hit: 35, who: lordA,
        wait: '鉄砲組、竹束の陰で引きつけよ。まだ撃つな', line: '寄せきった！　鉄砲組、放てぇっ！', sub: '打って出た城兵の足が止まる',
        then: (rt) => rt.say(lordA, '城兵が怯んだ！　横から槍を入れて、木戸まで押し返せ！', 3) };
      sfx('taiko', 1);
      rt.banner('城兵、打って出る', `${side ? '東' : '西'}の横腹を突いてくる`);
      rt.say('足軽', `搦手から城兵が打って出たぞ！　${guns ? '鉄砲' : '弓'}組が狙われておる！`, 3.5);
      rt.obj('sally', '打って出た城兵を押し返せ', 'side');
      rt.marker('sally', centerOf(F.sallyG), () => `打って出た城兵・${moraleWord(F.sallyG.morale)}`, { red: true, group: F.sallyG });
    },
    // 本丸：城将と旗本
    honmaru(rt) {
      const F = rt.flags;
      if (F.step >= 3) return;
      F.step = 3; F.stepT = rt.t;
      rt.setPhase('honmaru');
      rt.unmark('gate');
      rt.objDone('main');
      rt.obj('main', `${STAGE(2)}本丸へ押し込み、御殿の城将を討て`, 'main');
      rt.say(lordA, '本丸じゃ！　御殿の城将を討ち取れ！', 3.5);
      // 御殿の前の縁の柱：狭い所で戦い、柱の陰に入れば正面からの矢玉を避けられる
      const G = P.goten, pz = G.z + G.d / 2 + 1.3;
      for (let i = 0; i < 6; i++) {
        const x = G.x - G.w / 2 + 1 + i * (G.w - 2) / 5;
        const m = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.2, 0.22, 3.2, 8), 0x5a4230), mats().wood);
        m.position.set(x, rt.world.heightAt(x, pz) + 1.6, pz); m.castShadow = true;
        rt.scene.add(m);
        const st = rt.army.addStruct({ x, z: pz, r: 0.3, solidR: 0.3, hp: 1e9, maxHp: 1e9, team: Dt, name: '柱' });
        st.noTarget = true;
        F.tabas.push({ m, x, z: pz, rot: 0, team: A, carrier: null, van: 'pillar', off: 0, fixed: true });
      }
      rt.after(4, () => rt.bark('御殿の柱の陰に入れば、射手の矢を避けられる'));
      F.hata.order = 'attack'; F.hata.seekRange = 28; F.hata.noRout = false;
      // 最後の抵抗：生き残った城兵は皆、本丸の御殿の前へ集まり、もう崩れずに討死するまで戦う
      if (!defend) {
        let n = 0;
        for (const gs of F.garrison) for (const gg of gs) {
          if (!gg.count || gg.routed || gg === F.hata || gg === F.lordG || (F.shooters || []).includes(gg)) continue;
          const a = n++ * 1.3, q = { x: P.court.x + Math.sin(a) * 6, z: P.court.z + Math.cos(a) * 4 };
          gg.order = 'move'; gg.dest = q; gg.speed = 3.8; gg.noRout = true;
          gg.onArrive = (x) => { x.order = 'attack'; x.seekRange = 16; x.aggro = 12; };
        }
        rt.after(2.5, () => { rt.banner('本丸、最後の抵抗', '城兵は御殿の前で討死の覚悟'); rt.say(lordB, '者ども、本丸を枕に討死せよ！　一人も通すな！', 3.5); });
      }
      rt.marker('lordB', unitPos(F.lordB), info.def.lord ? `城将・${lordB}` : '城将', { red: true });
    },
    // 一騎打ち：foe（名のある武者）と自分だけ。まわりは手を出さず見届ける
    duel(rt, foe, withG) {
      const F = rt.flags;
      if (F.duel || !foe.alive) return;
      F.duel = { foe, t0: rt.t, saved: [] };
      rt.setPhase('duel');
      foe.noTarget = true;
      // 名のある武者は、一対一ではしぶとい（数合で倒れないように）
      foe.maxHp = Math.max(foe.maxHp, 620); foe.hp = foe.maxHp;
      const p = rt.player.u;
      // 敵の組は手を止めて見届ける（下がって輪を作る）
      for (const g of rt.army.groups || []) {
        if (!g.units || g === foe.group) continue;
        const c = g.center();
        if (Math.hypot(c.x - p.pos.x, c.z - p.pos.z) > 45) continue;
        F.duel.saved.push({ g, order: g.order, aggro: g.aggro, fire: g.fire, seek: g.seekRange, focus: g.focus });
        g.order = 'hold'; g.aggro = 0; g.fire = false; g.focus = null;
        g.anchor = { x: c.x + (c.x - p.pos.x) * 0.3, z: c.z + (c.z - p.pos.z) * 0.3 };
        for (const u of g.units) if (u.alive && !u.isPlayer) { u.duelHold = !u.noTarget; u.noTarget = true; u.target = null; }
      }
      foe.group.order = 'attack'; foe.group.focus = p; foe.group.seekRange = 40; foe.group.noRout = true;
      rt.zone('duel', foe.pos.x, foe.pos.z, 7);
      rt.banner('一騎打ち', `${foe.name || '城将'}と刃を交える`);
      sfx('taiko', 1);
      rt.obj('duel', `一騎打ちで${foe.name || '城将'}を討て`, 'side');
      rt.marker('duel', unitPos(foe), foe.name || '城将', { red: true });
    },
    endDuel(rt, won) {
      const F = rt.flags;
      const D = F.duel;
      if (!D) return;
      F.duel = null; F.duelDone = true;
      rt.unzone('duel'); rt.unmark('duel');
      D.foe.noTarget = false;
      for (const s of D.saved) {
        s.g.order = s.order; s.g.aggro = s.aggro; s.g.fire = s.fire; s.g.seekRange = s.seek; s.g.focus = s.focus && s.focus.alive ? s.focus : null;
        for (const u of s.g.units) if (u.duelHold) { u.noTarget = false; u.duelHold = false; }
      }
      if (won) { rt.objDone('duel'); rt.award((t) => { t.special = { label: '一騎打ちで討ち取り', pts: 30 }; }, `一騎打ちで${D.foe.name || '敵将'}を討ち取った`); }
      else { rt.objFail('duel'); rt.say('足軽', `${nm(rt)}様が危ない！　皆でかかれ！`, 3); }
    },

    win(rt, how) {
      const F = rt.flags;
      if (F.ending) return;
      F.ending = true;
      if (F.duel) this.endDuel(rt, false);
      rt.unmark('lordB'); rt.unmark('gate'); rt.uninteract('gact');
      for (const id of ['main', 'lord']) rt.objDone(id);
      rt.tracker.main = true;
      rt.award((t) => { t.main = true; t.c.capture++; }, `${castle}を落とした`);
      if (F.sallyG && !F.sallyDone) rt.objFail('sally');
      if (!F.towersDone && F.towerU.length) rt.objFail('towers');
      if (!F.ladderDone) rt.objFail('ladder');
      for (const gs of F.garrison) for (const g of gs) { g.noRout = false; g.morale = 0; }
      if (F.hata) { F.hata.noRout = false; F.hata.morale = 0; }
      rt.banner(`${castle}、落城`, how);
      rt.say(lordA, `${castle}、落ちたり！　勝鬨をあげよ！`, 4);
      sfx('horagai', 0.9);
      rt.player.u.invuln = true;
      rt.finish({}, 9);
    },
    lose(rt, big, small, line) {
      const F = rt.flags;
      if (F.ending) return;
      F.ending = true;
      if (F.duel) this.endDuel(rt, false);
      for (const id of ['main', 'lord']) rt.objFail(id);
      rt.tracker.main = false;
      rt.banner(big, small);
      if (line) rt.say(defend ? jodai : lordA, line, 4);
      rt.finish({}, 7);
    },

    // ================= 守る戦 =================
    defendForces(rt) {
      const F = rt.flags;
      // 自分の組（塀の内）
      const g0 = P.gates[defReg - 1];
      const n = Math.max(15, RANKS[rt.G.rank].squad);
      const bows = Math.round(n * (rt.G.bowRatio ?? 0.33));
      rt.makeSquad({ x: g0.c.x - g0.n.x * 7 + g0.n.z * 3, z: g0.c.z - g0.n.z * 7 - g0.n.x * 3 }, Math.atan2(g0.n.x, g0.n.z), [{ kind: 'spear', n: n - bows }, { kind: 'bow', n: bows }]);
      F.siege = 100;
      // 寄せ手の矢玉は、当たれば痛いが一発では倒れない強さに
      F.gun.dmgMult = 0.5;
      for (const u of F.gun.units) if (u.type === 'gun') u.dmg *= 0.4;
      F.ladders = P.ladders.filter((l) => l.reg === defReg).map((l) => ({ ...l, placed: false, mesh: null, team: null, climbT: 0, climbed: 0 }));
      // 寄せ手の射手の竹束は、寄せ場に据える
      F.enemyLadderTeams = [];
      rt.obj('main', `${castle}を守り抜け`, 'main');
    },
    briefDefend(rt) {
      const F = rt.flags;
      const g0 = P.gates[defReg - 1];
      rt.say(jodai, `${nm(rt)}、よう来てくれた。${info.atk.name}の軍勢、およそ${F.a0.toLocaleString('ja-JP')}が寄せてくる`, 4.5);
      rt.say(jodai, `その方は${g0.name}の内を守れ。梯子を掛けられたら突き落とし、門に寄る者には石落としで石を見舞え`, 5.5);
      rt.bark(`掛けられた梯子は ${EK()} 長押しで突き落とす。門の内で長押しすれば、門前の敵に石を落とせる`);
      rt.obj('post', `${g0.name}の内の持ち場につけ`, 'order');
      rt.zone('post', g0.c.x - g0.n.x * 5, g0.c.z - g0.n.z * 5, 4);
      rt.after(18, () => this.signalDefend(rt));
    },
    signalDefend(rt) {
      const F = rt.flags;
      if (F.step >= 1) return;
      F.step = 1; F.stepT = rt.t; F.holdT0 = rt.t;
      rt.setPhase('siege');
      rt.unzone('post'); rt.objRemove('post');
      sfx('horagai', 1);
      rt.banner('寄せ手、来る', `${info.atk.name}の軍勢が押し寄せる`);
      rt.say('物見', `${info.atk.name}の先手、竹束を押し立てて寄せてまいります！`, 3.5);
      const go = (g, x, z, sp = 1.9) => { g.order = 'move'; g.dest = { x, z }; g.speed = sp; g.facing = Math.PI; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; }; };
      go(F.gun, 0, yoseZ + 2, 1.8); go(F.vans[0], -14, yoseZ + 3); go(F.vans[1], 14, yoseZ + 3);
      // 門破りと、残る先手は竹束の後から門へ
      rt.after(22, () => { for (const g of [F.ram, F.vans[2]]) { g.order = 'assault'; g.seekRange = 10; } rt.say('物見', '門破りの者どもが門へ取り付くぞ！', 3); });
      rt.after(40, () => { for (const g of [F.vans[0], F.vans[1]]) { g.order = 'assault'; g.seekRange = 10; } for (const tb of F.tabas) tb.van = null; });
      this.ladderWave(rt, 2, 14);
      rt.after(95, () => this.ladderWave(rt, 2, 0));
      rt.after(80, () => this.waveTwo(rt));
      rt.after(170, () => this.ladderWave(rt, 2, 0));
      rt.after(205, () => { if (!F.ending) rt.say(jodai, '寄せ手が最後の力で梯子を寄せる！　ここを凌げば日が暮れるぞ！', 3.5); this.ladderWave(rt, 1, 0); });
      rt.after(125, () => this.offerSally(rt));
    },
    // 梯子の組：塀の外に取り付き、梯子を立てて登ってくる
    ladderWave(rt, k, delay) {
      const F = rt.flags;
      if (F.ending) return;
      rt.after(delay, () => {
        if (F.ending) return;
        const free = F.ladders.filter((l) => !l.team || !l.team.count);
        for (let i = 0; i < k && free.length; i++) {
          const l = free.splice(Math.floor(Math.random() * free.length), 1)[0];
          const foot = { x: l.x + l.n.x * 1.7, z: l.z + l.n.z * 1.7 };
          const g = atkGroup(rt, { name: '梯子の組', anchor: { x: foot.x + l.n.x * 26, z: foot.z + l.n.z * 26 }, facing: Math.atan2(-l.n.x, -l.n.z), width: 3, aggro: 2, order: 'move' },
            [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5, o: flagA }]);
          g.dest = foot; g.speed = 2.6;
          g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = foot; l.arriveT = rt.t; };
          l.team = g; l.placed = false; l.climbed = 0; l.arriveT = null;
        }
        rt.bark('梯子を担いだ組が塀へ走る！');
      });
    },
    waveTwo(rt) {
      const F = rt.flags;
      if (F.ending) return;
      // 二番手：侍大将と新手
      F.boss = atkGroup(rt, { name: '寄せ手の侍大将', anchor: { x: 8, z: yoseZ + 12 }, facing: Math.PI, width: 5, aggro: 8, noRout: true, order: 'hold' },
        [{ type: 'busho', n: 1, o: { name: `${clanA}方の侍大将`, flag: MON_OF[info.atk.name] ? monA : 'maru' } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 8, o: flagA }]);
      F.bossU = F.boss.units[0];
      F.bossU.announced = true;
      const g = atkGroup(rt, { name: '二番手', anchor: { x: -4, z: yoseZ + 20 }, facing: Math.PI, width: 7, aggro: 7, order: 'assault', seekRange: 10 },
        [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: sc(12), o: flagA }]);
      g.assault = (u) => route(P, u.pos, N, this.goalPt(rt));
      F.vans.push(g);
      // 二番手の後ろに寄せ手の控え（軽い作り）：塀から見て、まとまった数が押し寄せる波に見せる。籠城なので本物には替えない
      const bk = KIT.backOf(rt, g, { flag: monA, armor: 0x24221f, kind: 'spear', w: 20, depth: 12, count: 120, seed: 91, stop: () => { const c = g.center(); return P.regionOf(c.x, c.z) > 0; } });
      if (bk && bk.army) bk.army.noWake = true;
      F.bk = { b: bk, g };
      if (!F.ram.count || F.ram.routed) {
        const r2 = atkGroup(rt, { name: '門破りの組', anchor: { x: -6, z: yoseZ + 16 }, facing: Math.PI, width: 4, aggro: 3, noRout: true, order: 'assault' }, [{ type: 'ashigaru', n: 9, o: { hat: 'jingasa_n', ...flagA } }]);
        r2.assault = F.ram.assault; F.rams.push(r2);
      }
      rt.banner('二番手、寄せる', '侍大将が竹束の後ろで采を振る');
      // 塀の射手の一斉射：二番手が塀の下まで寄せきったら、狭間から一度に放つ
      if (gunsB) F.vol = { guns: () => (F.shooters || []).filter((q) => q.units.some((u) => u.type === 'gun')), foe: () => g, r: 22, max: 45, hit: 35, who: jodai,
        wait: '狭間の鉄砲、まだじゃ。二番手が塀の下へ来るまで引きつけよ', line: '今じゃ、狭間から放てぇっ！', sub: '二番手の足が止まる',
        then: (rt) => rt.say(jodai, '二番手が乱れた！　侍大将を狙えば、寄せ手は崩れるぞ', 3.5) };
      rt.say(jodai, '二番手が来るぞ！　踏みとどまれ！', 3);
    },
    // 搦手から打って出るか
    offerSally(rt) {
      const F = rt.flags;
      if (F.ending || F.sallyOn || F.gunDone || !F.gun.count) return;
      rt.say(jodai, `${nm(rt)}、寄せ手の鉄砲組が竹束の陰から撃ちかけてくる。搦手から打って出て、崩してまいれ！`, 5);
      rt.choose('搦手から打って出るか', [{ label: '打って出る', note: '組を率いて搦手の木戸から出て、竹束の射手を崩す' }, { label: '籠もって守る', note: '塀の内で守りを続ける' }], (i) => {
        if (i === 0) this.startSally(rt);
        else rt.say(jodai, 'よかろう。塀の内で踏みとどまれ', 3);
      }, 20);
    },
    startSally(rt) {
      const F = rt.flags;
      F.sallyOn = true; F.sallyT = rt.t;
      const pg = P.port;
      pg.st.alive = false; pg.st.mesh.visible = false;
      sfx('horagai', 0.9);
      rt.banner('打って出よ', '搦手の木戸が開いた');
      rt.obj('sally', `搦手から打って出て、${guns ? '鉄砲' : '弓'}組を崩せ`, 'side');
      rt.marker('port', { x: pg.c.x, z: pg.c.z }, '搦手の木戸', { h: 3 });
      rt.marker('sallyT', centerOf(F.gun), () => `${F.gun.name}・${moraleWord(F.gun.morale)}`, { red: true, group: F.gun });
      F.gun.noRout = false;
      for (const g of rt.squadGroups) g.order = 'follow';
    },
    closePort(rt) {
      const F = rt.flags;
      const pg = P.port;
      if (pg.st.alive) return;
      pg.st.alive = true; pg.st.mesh.visible = true;
      rt.unmark('port');
      rt.bark('搦手の木戸を閉じた');
    },

    // ---------------- 毎こま ----------------
    update(rt, dt) {
      const F = rt.flags;
      const W = rt.world;
      const pu = rt.player.u;
      // 門が破れた後の城兵：近くに掛かる敵がいなくなって突っ立っていれば、城の中にいる寄せ手のいちばん近い者へ向かい直す（二秒ごと）
      if (F.gatesDown && (F.brT = (F.brT || 0) - dt) <= 0) {
        F.brT = 2;
        for (const gs of F.garrison || []) for (const gg of gs) {
          if (!gg.breach || !gg.count || gg.routed || gg.order !== 'attack' || F.shooters.includes(gg)) continue;
          const c = gg.center();
          const busy = gg.units.some((u) => u.alive && u.target && u.target.alive && !u.target.isStruct);
          if (busy) continue;
          let best = null, bd = 70;
          for (const u of rt.army.units) {
            if (!u.alive || u.team === gg.team || u.fleeing || u.noTarget || u.type === 'dummy') continue;
            const d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z);
            if (d < bd) { bd = d; best = u; }
          }
          if (best) { gg.anchor = { x: best.pos.x, z: best.pos.z }; gg.seekRange = Math.max(45, bd + 8); for (const u of gg.units) u.aiT = 0; }
        }
      }
      // 櫓の射手は櫓の床に立たせる
      for (const u of F.towerU) {
        const y = W.heightAt(u.tower.x, u.tower.z) + u.tower.deck + 0.08;
        u.pos.y = y;
        u.mesh.position.y = u.alive ? y : y - 0.1;
      }
      // 竹束：押している者の前、または組の前
      for (const tb of F.tabas) {
        if (tb.carrier === 'player') {
          const h = pu.heading || 0;
          tb.x = pu.pos.x + Math.sin(h) * 1.05; tb.z = pu.pos.z + Math.cos(h) * 1.05; tb.rot = h;
          this.placeTaba(rt, tb);
        } else if (tb.van && tb.van.count && (tb.van.order === 'move' || tb.van.order === 'hold')) {
          const c = tb.van.center();
          const fz = tb.team === A ? -1 : 1;
          const tx = c.x + tb.off, tz = c.z + fz * (tb.van === F.gun ? 2.4 : 2.8);
          tb.x += (tx - tb.x) * Math.min(1, dt * 2); tb.z += (tz - tb.z) * Math.min(1, dt * 2);
          this.placeTaba(rt, tb);
        }
      }
      this.ramLog(rt);
      // 二番手の控え：二番手が崩れるか尽きたら一緒に崩れる（KIT.backTick は城の遠くの軍勢まで本物に替えるので使わない）
      if (F.bk && !F.bk.gone && (F.bk.g.routed || !F.bk.g.count)) { const q = F.bk; q.gone = true; q.b.rout({ hideAfter: 16 }); rt.after(16.5, () => { q.b.visible = false; }); }
      if (F.ending) return;
      volleyTick(rt, dt, F.vol);
      this.acts(rt);
      if (defend) this.updateDefend(rt, dt); else this.updateAttack(rt, dt);
      // 一騎打ちの成り行き
      if (F.duel) {
        const D = F.duel;
        if (!D.foe.alive) this.endDuel(rt, true);
        else if (pu.hp < pu.maxHp * 0.22 || rt.t - D.t0 > 100) this.endDuel(rt, false);
        else {
          // 輪の外の者は手出ししない。敵将は自分だけを狙う
          D.foe.group.focus = pu;
        }
      }
    },

    updateAttack(rt, dt) {
      const F = rt.flags;
      const pu = rt.player.u;
      if (F.step === 0 && rt.t > 3 && pu.pos.z < spawnZ - 14) this.signal(rt);
      if (F.step === 1) {
        const d = Math.hypot(pu.pos.x - 3, pu.pos.z - yoseZ);
        const carry = F.tabas.some((tb) => tb.carrier === 'player');
        rt.objProgress('main', `あと ${Math.max(0, Math.round(d - 8))}m${carry ? '' : '・竹束を押していない'}`);
        const el = rt.t - F.stepT;
        if ((d < 8 && (el > 20 || carry)) || el > 80) {
          if (carry && d < 8) rt.award((t) => t.side.push('竹束を押して寄せた'), '竹束を押して寄せ場へ');
          this.breach(rt);
        }
      }
      // 城の内の声：破られていない門の奥から、ときどき鬨の声と下知が聞こえる
      if (F.step >= 1 && F.step < 3 && rt.t > (F.jouT || 0)) {
        F.jouT = rt.t + 13 + Math.random() * 10;
        const g = P.gates.find((x) => x.st.alive);
        if (g && F.jouT > 20) rt.army.play('eshout', { x: g.c.x - g.n.x * 9, z: g.c.z - g.n.z * 9 }, 0.8);
      }
      if (F.step >= 2) {
        // 門の具合
        const g = P.gates.find((x) => x.st.alive);
        if (g && F.step === 2) rt.objProgress('main', `${g.name} ${Math.round(g.st.hp / g.st.maxHp * 100)}%`);
        // 門を打つ先手が尽きたら、後ろから新手（三度まで）
        if (g && rt.t > (F.reinfT || 0)) {
          const live = [...F.vans, ...F.rams].reduce((a, v) => a + v.count, 0);
          if (live < 16 && (F.reinf || 0) < 5) {
            F.reinf = (F.reinf || 0) + 1; F.reinfT = rt.t + 35;
            const ng = allyGroup(rt, { faction: facA, name: `${['二', '三', '四', '五', '六'][F.reinf - 1]}の先手`, anchor: { x: 0, z: yoseZ + 14 }, facing: Math.PI, width: 7, aggro: 7, order: 'assault', seekRange: 12 },
              [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12, o: flagA }]);
            ng.assault = (u) => route(P, u.pos, N, this.goalPt(rt));
            F.vans.push(ng);
            rt.say(lordA, `先手が減った。${ng.name}、前へ！　${g.name}を打ち続けよ`, 3.5);
          }
        }
        // 櫓の射手
        if (F.towerU.length && !F.towersDone) {
          const left = F.towerU.filter((u) => u.alive).length;
          rt.objProgress('towers', `残り ${left}/${F.towerU.length}人`);
          P.towers.forEach((t, i) => { if (t.arch && !F.towerU.some((u) => u.alive && u.tower === t)) rt.unmark('tw' + i); });
          if (!left) {
            F.towersDone = true;
            rt.objDone('towers');
            rt.award((t) => t.side.push('櫓の射手を黙らせた'), '副任務：櫓の射手を黙らせた');
            rt.say(lordA, '櫓が黙ったぞ！　門破りの者ども、今のうちに叩け！', 3.5);
            for (const gg of [...F.vans, ...F.rams]) for (const u of gg.units) u.dmg *= 1.5;
            F.ramBoost = true;
          }
        }
        // 打って出た城兵
        if (F.sallyG && !F.sallyDone && (F.sallyG.routed || F.sallyG.count === 0)) {
          F.sallyDone = true;
          rt.unmark('sally'); rt.objDone('sally');
          rt.award((t) => t.side.push('打って出た城兵を押し返した'), '副任務：打って出た城兵を押し返した');
          rt.say(lordA, 'ようやった！　城兵は二度と出てこられまい', 3);
        }
        // 梯子で越えた組の者が続いて登る
        if (F.climbQ && F.climbQ.length && rt.t > (F.climbNext || 0)) {
          const u = F.climbQ.shift();
          F.climbNext = rt.t + 0.4;
          if (u.alive && Math.hypot(u.pos.x - F.climbFrom.x, u.pos.z - F.climbFrom.z) < 16) { u.pos.x = F.climbTo.x + (Math.random() - 0.5) * 1.6; u.pos.z = F.climbTo.z + (Math.random() - 0.5) * 1.6; }
        }
      }
      if (F.step === 3) {
        const L = F.lordB;
        // 城将は御殿で待つ。近づけば一騎打ちを挑んでくる。待たせ過ぎれば打って出る
        if (L.alive && !F.duel && !F.duelAsked && Math.hypot(pu.pos.x - L.pos.x, pu.pos.z - L.pos.z) < 15) {
          F.duelAsked = true;
          L.announced = false;
          if (!duelRank(rt)) {
            // 足軽・組頭は一騎打ちを受けない。まわりの先手と組で押し包んで討つ
            rt.say(lordB, `寄せ手の雑兵どもか。${info.def.lord ? `${lordB}の首、` : 'この首、'}容易くは取らせぬぞ！`, 3.5);
            rt.after(2.5, () => rt.say(lordA, '一人で当たるな！　皆で押し包んで討て！', 3));
            F.lordG.order = 'attack'; F.lordG.seekRange = 30;
            for (const g of F.vans) if (g.count) { g.order = 'attack'; g.seekRange = 30; }
            if (rt.squad.length) for (const g of rt.squadGroups) g.order = 'attack';
          } else rt.say(lordB, `寄せ手の者よ！　我こそは${info.def.lord ? `${lordB}、` : ''}${castle}を預かる者。雑兵の手にはかからぬ。一騎打ちで勝負せよ！`, 4.5);
          if (duelRank(rt)) rt.choose('城将が一騎打ちを挑んできた', [{ label: '受けて立つ', note: '一人で城将と刃を交える（まわりは見届ける）' }, { label: '皆でかかる', note: '組と先手で押し包んで討つ' }], (i) => {
            if (i === 0) this.duel(rt, L);
            else { F.lordG.order = 'attack'; F.lordG.seekRange = 30; rt.say(lordA, '構わぬ、押し包んで討て！', 2.5); }
          }, 15);
        }
        if (L.alive && !F.duel && !F.lordOut && rt.t - F.stepT > 80) { F.lordOut = true; F.lordG.order = 'attack'; F.lordG.seekRange = 30; rt.say(lordB, 'もはやこれまで。討って出るぞ！', 3); }
        if (!L.alive) this.win(rt, F.duelWon ? '城将を一騎打ちで討ち取った' : '城将、討死');
        else if (F.hata.count === 0 && rt.t - F.stepT > 100 && !F.duel) this.win(rt, '城将は自害し、城兵は降った');
      }
      // 日暮れ
      const left = TIME_LIMIT - rt.t;
      if (left < 200 && !F.after) { F.after = true; rt.world.setTime('after'); }
      if (left < 90 && !F.dusk) { F.dusk = true; rt.world.setTime('dusk'); rt.say(lordA, '日が傾いてきた。急げ、日暮れまでに城を落とすのじゃ！', 3.5); }
      if (left <= 0) {
        if (info.days != null && info.days < 30) this.lose(rt, '兵糧が尽きる', '城は落ちず、攻め手は兵を退いた', '……兵糧が続かぬ。これまでじゃ。兵を退け');
        else this.lose(rt, '城は落ちず', '日が暮れ、攻め手は兵を退いた', '……日が暮れる。今日はここまでじゃ。兵を退け');
      }
    },

    updateDefend(rt, dt) {
      const F = rt.flags;
      const pu = rt.player.u;
      if (F.step === 0) {
        const g0 = P.gates[defReg - 1];
        if (Math.hypot(pu.pos.x - (g0.c.x - g0.n.x * 5), pu.pos.z - (g0.c.z - g0.n.z * 5)) < 4 && !F.posted) { F.posted = true; rt.objDone('post'); }
        return;
      }
      // 梯子：着いた組が梯子を立て、しばらくして登ってくる
      for (const l of F.ladders) {
        const g = l.team;
        if (!g) continue;
        if (!g.count || g.routed) { if (l.mesh) this.dropLadder(rt, l, false); l.team = null; continue; }
        if (l.arriveT != null && !l.placed && rt.t - l.arriveT > 3) this.raiseLadder(rt, l);
        if (l.placed && rt.t > l.climbT) {
          // 一人登り切って塀の内へ
          const u = g.units.find((x) => x.alive && !x.inside);
          if (u && l.climbed < 4) {
            u.inside = true; l.climbed++;
            u.pos.x = l.x - l.n.x * 2.2 + (Math.random() - 0.5); u.pos.z = l.z - l.n.z * 2.2 + (Math.random() - 0.5);
            const ig = atkGroup(rt, { name: '乗り込んだ敵', anchor: { x: u.pos.x, z: u.pos.z }, facing: 0, order: 'attack', seekRange: 30, aggro: 12 }, []);
            // 登った者は組を移す（塀の内で暴れる）
            g.units = g.units.filter((x) => x !== u); u.group = ig; ig.units.push(u); ig.initial = 1;
            rt.army.play('eshout', { x: l.x, z: l.z }, 1.2);
            if (!F.climbSaid || rt.t - F.climbSaid > 12) { F.climbSaid = rt.t; rt.bark('敵が塀を乗り越えてきた！', true); }
          }
          l.climbT = rt.t + 6.5;
        }
      }
      // 寄せ手の勢い
      const el = rt.t - F.holdT0;
      const left = HOLD_T - el;
      rt.objProgress('main', `寄せ手の勢い ${Math.max(0, Math.round(F.siege))}・日暮れまで ${Math.max(0, Math.ceil(left / 60))}分`);
      if (F.bossU && !F.bossDead && !F.bossU.alive) { F.bossDead = true; F.siege -= 25; rt.banner('侍大将を討ち取った', '寄せ手が浮き足立つ'); }
      if (F.gun && !F.gunDone && (F.gun.routed || F.gun.count <= 2)) {
        F.gunDone = true; F.siege -= 15;
        rt.unmark('sallyT');
        if (F.sallyOn) { rt.objDone('sally'); rt.award((t) => t.side.push('打って出て竹束の射手を崩した'), '副任務：打って出て射手を崩した'); rt.say(jodai, '見事じゃ！　木戸へ戻れ、閉じるぞ！', 3.5); }
      }
      for (const r of F.rams) if (!r.doneSaid && (r.routed || r.count === 0)) { r.doneSaid = true; F.siege -= 8; rt.bark('門破りの組を追い払った！'); }
      // 打って出た後：自分が戻ったら（または時が過ぎたら）木戸を閉じる
      if (F.sallyOn && !P.port.st.alive) {
        const inside = P.regionOf(pu.pos.x, pu.pos.z) >= defReg;
        if (!inside) F.wentOut = true;
        if (inside && ((F.gunDone && F.wentOut) || rt.t - F.sallyT > 110)) this.closePort(rt);
        // 打って出た先で侍大将に近づけば、一騎打ち
        if (F.bossU && F.bossU.alive && !F.duel && !F.duelAsked && Math.hypot(pu.pos.x - F.bossU.pos.x, pu.pos.z - F.bossU.pos.z) < 14) {
          F.duelAsked = true;
          const bu = F.bossU;
          // 侍大将だけを一人の組にする
          const bg = atkGroup(rt, { name: '侍大将', anchor: { x: bu.pos.x, z: bu.pos.z }, facing: Math.PI, noRout: true, order: 'hold', aggro: 3 }, []);
          F.boss.units = F.boss.units.filter((x) => x !== bu); bu.group = bg; bg.units.push(bu); bg.initial = 1;
          bu.announced = false;
          if (!duelRank(rt)) { rt.say(bu.name, '城方の雑兵か。討ち取ってくれる！', 3); bg.order = 'attack'; bg.seekRange = 30; }
          else rt.say(bu.name, '城方の者、よくぞ出てきた！　一騎打ちで勝負いたせ！', 4);
          if (duelRank(rt)) rt.choose('侍大将が一騎打ちを挑んできた', [{ label: '受けて立つ', note: '一人で侍大将と刃を交える' }, { label: '皆でかかる', note: '組で押し包む' }], (i) => { if (i === 0) this.duel(rt, bu); else { bg.order = 'attack'; bg.seekRange = 30; } }, 15);
        }
      }
      // 門が破られた
      const inside = rt.army.units.filter((u) => u.alive && u.team === A && P.regionOf(u.pos.x, u.pos.z) === N).length;
      if (!P.gates[N - 1].st.alive || inside >= 16) { this.lose(rt, `${castle}、落城`, '本丸に敵がなだれ込んだ', '……無念。城を枕に討死じゃ。落ちよ、落ち延びよ'); return; }
      // 勝ち：勢いが尽きるか、日暮れまで持ちこたえる
      if ((F.siege <= 0 && el > 160) || left <= 0) this.winDefend(rt, F.siege <= 0 ? '寄せ手は勢いを失い、兵を退いた' : '日が暮れ、寄せ手は兵を退いた');
      if (left < 120 && !F.after) { F.after = true; rt.world.setTime('after'); }
      if (left < 45 && !F.dusk) { F.dusk = true; rt.world.setTime('dusk'); rt.say(jodai, 'もう少しで日が暮れる。持ちこたえよ！', 3); }
    },
    raiseLadder(rt, l) {
      const W = rt.world;
      const foot = { x: l.x + l.n.x * 1.7, z: l.z + l.n.z * 1.7 };
      const top = { x: l.x + l.n.x * 0.35, z: l.z + l.n.z * 0.35 };
      const fy = W.heightAt(foot.x, foot.z), ty = Math.max(W.heightAt(l.x - l.n.x * 0.5, l.z - l.n.z * 0.5) + 2.6, fy + 2.4);
      l.mesh = ladderMesh({ x: foot.x, y: fy, z: foot.z }, { x: top.x, y: ty, z: top.z });
      rt.scene.add(l.mesh);
      l.placed = true; l.climbT = rt.t + 9;
      rt.army.play('knock', foot, 1.2);
      rt.marker('lad' + F_idx(rt, l), { x: l.x, z: l.z }, '梯子（長押しで突き落とす）', { red: true, h: 3.2 });
      rt.bark('梯子が掛かった！　突き落とせ！', true);
    },
    dropLadder(rt, l, pushed) {
      const F = rt.flags;
      if (l.mesh) { rt.scene.remove(l.mesh); l.mesh = null; }
      rt.unmark('lad' + F_idx(rt, l));
      l.placed = false;
      if (pushed) {
        F.siege -= 5;
        // 登りかけていた者が落ちる
        const g = l.team;
        const u = g && g.units.find((x) => x.alive && !x.inside);
        if (u) rt.army.damage(u, 60, rt.player.u);
        rt.army.play('cry', { x: l.x, z: l.z }, 1);
        rt.award((t) => { t.c.point = (t.c.point || 0) + 1; }, '梯子を突き落とした');
        l.arriveT = rt.t + 14;   // 立て直すまで
      }
    },
    winDefend(rt, how) {
      const F = rt.flags;
      if (F.ending) return;
      F.ending = true;
      if (F.duel) this.endDuel(rt, false);
      rt.objDone('main');
      rt.tracker.main = true;
      rt.award((t) => { t.main = true; }, `${castle}を守り抜いた`);
      if (F.sallyOn && !F.gunDone) rt.objFail('sally');
      for (const g of rt.army.groups || []) if (g.team === A && g.units) { g.noRout = false; g.morale = 0; }
      rt.banner(`${castle}、守り抜く`, how);
      rt.say(jodai, `勝鬨じゃ！　${nm(rt)}、ようやってくれた`, 4);
      sfx('horagai', 0.9);
      rt.player.u.invuln = true;
      rt.finish({}, 9);
    },

    // ---------------- E で使う物（その時いる所で変える） ----------------
    acts(rt) {
      const F = rt.flags;
      const pu = rt.player.u;
      const r = P.regionOf(pu.pos.x, pu.pos.z);
      const want = [];
      // 竹束
      const mine = F.tabas.find((tb) => tb.carrier === 'player');
      if (mine) want.push(['taba', () => ({ x: mine.x, z: mine.z }), '竹束を据える', () => { mine.carrier = null; mine.fixed = true; }, { r: 3 }]);
      else if (!defend || F.sallyOn) {
        let best = null, bd = 2.6;
        for (const tb of F.tabas) { if (tb.team !== 0 || tb.van || tb.carrier) continue; const d = Math.hypot(tb.x - pu.pos.x, tb.z - pu.pos.z); if (d < bd) { bd = d; best = tb; } }
        if (best) want.push(['taba', { x: best.x, z: best.z }, '竹束を押して歩く', () => { best.carrier = 'player'; best.fixed = false; }, { r: 2.8 }]);
      }
      for (const g of P.gates) {
        if (!g.st.alive) continue;
        if (!defend && r === g.i && F.step >= 2) {
          want.push(['ram' + g.i, { x: g.c.x + g.n.x * 1.2, z: g.c.z + g.n.z * 1.2 }, `掛矢で${g.name}を打つ`, () => {
            if (!g.st.alive) return;
            if (mine) mine.carrier = null;
            rt.army.damage(g.st, F.ramBoost ? 60 : 42, pu);
            rt.army.play('knock', g.c, 1.2);
            rt.game.hitstop = 0.05;
            F.rams_ = (F.rams_ || 0) + 1;
            if (F.rams_ === 1) rt.bark('どおん！　門がきしむ。続けて打て');
          }, { r: 3.4, hold: 0.7 }]);
        }
        if (!defend && r === g.i + 1) {
          want.push(['bar' + g.i, { x: g.c.x - g.n.x * 1.3, z: g.c.z - g.n.z * 1.3 }, `閂を外して${g.name}を開ける`, () => {
            if (!g.st.alive) return;
            F.barOpen = true;
            rt.army.damage(g.st, g.st.hp + 10, pu);
          }, { r: 2.8, hold: 2.4 }]);
        }
        if (defend && r === g.i + 1 && F.step >= 1) {
          want.push(['stone' + g.i, { x: g.c.x - g.n.x * 1.4, z: g.c.z - g.n.z * 1.4 }, (F.stoneCd || 0) > rt.t ? '石落とし（次の石を運んでいる）' : '石落としで門前の敵を打つ', () => {
            if ((F.stoneCd || 0) > rt.t) return;
            F.stoneCd = rt.t + 5;
            // 石は門の真下の数人にしか当たらない
            const hit = rt.army.units.filter((u) => {
              if (!u.alive || u.team !== A) return false;
              const out = (u.pos.x - g.c.x) * g.n.x + (u.pos.z - g.c.z) * g.n.z;
              const lat = Math.abs((u.pos.x - g.c.x) * g.n.z - (u.pos.z - g.c.z) * g.n.x);
              return out > 0 && out < 4 && lat < g.w / 2 + 1.5;
            }).sort(() => Math.random() - 0.5).slice(0, 3);
            for (const u of hit) rt.army.damage(u, 34 + Math.random() * 20, pu);
            const n = hit.length;
            rt.army.play('knock', g.c, 1.6);
            rt.army.spark(g.c.x + g.n.x * 2, rt.world.heightAt(g.c.x, g.c.z) + 0.6, g.c.z + g.n.z * 2, 12);
            if (n) rt.bark(`石を落とした！（${n}人に当たる）`);
          }, { r: 3.0, hold: 0.8 }]);
        }
      }
      // 梯子（攻める戦：自分で掛けて登る）
      if (!defend && F.step >= 2 && F.ladders) F.ladders.forEach((l, i) => {
        if (r !== l.from || !P.gates[l.reg - 1].st.alive) return;
        const foot = { x: l.x + l.n.x * 1.8, z: l.z + l.n.z * 1.8 };
        if (!l.placed) want.push(['lad' + i, foot, '梯子を掛ける', () => this.playerLadder(rt, l), { r: 2.8, hold: 1.4 }]);
        else want.push(['lad' + i, foot, '梯子を登って塀を越える', () => this.climb(rt, l), { r: 2.8, hold: 1.0 }]);
      });
      // 梯子（守る戦：掛けられた梯子を突き落とす）
      if (defend && F.ladders) F.ladders.forEach((l, i) => {
        if (!l.placed || r !== l.reg) return;
        want.push(['push' + i, { x: l.x - l.n.x * 1.4, z: l.z - l.n.z * 1.4 }, '梯子を突き落とす', () => this.dropLadder(rt, l, true), { r: 3.0, hold: 0.6 }]);
      });
      const key = want.map((w) => w[0] + w[2]).join('|');
      if (key === F.actKey) return;
      F.actKey = key;
      for (const id of F.actIds || []) rt.uninteract(id);
      F.actIds = want.map((w) => w[0]);
      for (const [id, pos, label, fn, o] of want) rt.addInteract(id, pos, label, fn, o);
    },
    playerLadder(rt, l) {
      const F = rt.flags, W = rt.world;
      const mine = F.tabas.find((tb) => tb.carrier === 'player');
      if (mine) mine.carrier = null;
      const foot = { x: l.x + l.n.x * 1.7, z: l.z + l.n.z * 1.7 };
      const fy = W.heightAt(foot.x, foot.z), ty = Math.max(W.heightAt(l.x - l.n.x * 0.5, l.z - l.n.z * 0.5) + 2.6, fy + 2.4);
      l.mesh = ladderMesh({ x: foot.x, y: fy, z: foot.z }, { x: l.x + l.n.x * 0.35, y: ty, z: l.z + l.n.z * 0.35 });
      rt.scene.add(l.mesh);
      l.placed = true;
      rt.army.play('knock', foot, 1.2);
      rt.bark('梯子を掛けた。長押しで登れ');
    },
    climb(rt, l) {
      const F = rt.flags;
      const pu = rt.player.u;
      const to = { x: l.x - l.n.x * 2.2, z: l.z - l.n.z * 2.2 };
      F.climbFrom = { x: pu.pos.x, z: pu.pos.z };
      pu.pos.x = to.x; pu.pos.z = to.z;
      F.climbTo = to;
      F.climbQ = rt.squad.filter((u) => u.alive);
      F.climbNext = rt.t + 0.6;
      sfx('wood', 0.8);
      const g = P.gates[l.reg - 1];
      rt.banner('塀を越えた', `内から${g.name}の閂を外せ`);
      rt.bark(`${g.name}の内側へ回り、${EK()} 長押しで閂を外せ。組の者も梯子を登って続く`);
      rt.marker('bar', { x: g.c.x - g.n.x * 1.3, z: g.c.z - g.n.z * 1.3 }, `${g.name}の閂`, { h: 3 });
    },

    onStructDestroyed(rt, s) {
      const F = rt.flags;
      if (s.gate === undefined) return;
      const g = P.gates.find((x) => x.st === s);
      if (!g) return;
      rt.scene.add(stumps(rt.world, g.seg));
      F.gatesDown++;
      // 先の門の守りを本物の兵に替える（寄せ手の目の前の曲輪から）
      if (!defend) for (let k = 0; k <= P.gates.indexOf(g) + 3; k++) this.garrisonAt(rt, k);
      sfx('wood', 1.2);
      rt.army.play('eshout', g.c, 1.5);
      rt.unmark('bar');
      const last = g.i + 1 === N;
      // その門の内の城方が打って出る：槍・侍の組は破れた門の内へ詰めて押し入る敵に掛かる。塀と櫓の射手は持ち場に残って、押し入る敵を撃ち続ける
      const gin = { x: g.c.x - g.n.x * 5, z: g.c.z - g.n.z * 5 };
      for (const gg of F.garrison[P.gates.indexOf(g)] || []) {
        gg.noRout = defend; gg.breach = gin; gg.breachT = rt.t;
        if (F.shooters.includes(gg)) { gg.aggro = Math.max(gg.aggro || 0, 45); gg.order = 'hold'; continue; }
        gg.order = 'attack'; gg.seekRange = 45; gg.aggro = 16; gg.anchor = { ...gin };
      }
      // 攻める戦：破れた門の城兵は、しばらく打ち合ってから、生き残りが次の曲輪の門の内へ退いて、そこでまた守る（曲輪ごとに戦う）
      if (!defend) {
        const gi0 = P.gates.indexOf(g);
        rt.after(22, () => {
          const nx = P.gates.find((x) => x.st.alive);
          if (!nx) return;
          const ni = P.gates.indexOf(nx), fa = Math.atan2(nx.n.x, nx.n.z);
          let moved = 0;
          for (const gg of F.garrison[gi0] || []) {
            if (!gg.count || gg.routed || gg === F.hata || gg === F.lordG || (F.shooters || []).includes(gg)) continue;
            const q = { x: nx.c.x - nx.n.x * 6, z: nx.c.z - nx.n.z * 6 };
            gg.order = 'move'; gg.dest = q; gg.speed = 3.6; gg.facing = fa; gg.noRout = true;
            gg.onArrive = (x) => { x.order = 'hold'; x.anchor = { x: q.x, z: q.z }; x.aggro = 10; x.noRout = false; };
            for (const u of gg.units) { u.target = null; u.atk = null; }
            (F.garrison[ni] = F.garrison[ni] || []).push(gg);
            moved++;
          }
          if (moved) rt.say('城兵', `退け、退けっ！　${nx.name}の内で食い止めよ！`, 3);
        });
      }
      if (defend) {
        F.siege += 20;
        rt.banner(`${g.name}、破られる`, last ? '本丸に敵が入った' : '押し入る敵を討て');
        rt.say(jodai, last ? '本丸の門が破られた……！' : '門が破られた！　押し入る敵を討ち取れ！', 3.5);
        return;
      }
      if (F.barOpen) {
        F.barOpen = false; F.ladderDone = true;
        rt.objDone('ladder');
        rt.award((t) => { t.special = { label: '内から門を開けた', pts: 25 }; }, `${g.name}を内から開けた`);
        rt.say(lordA, `でかした！　${g.name}が内から開いたぞ！　押し込め！`, 3.5);
      } else rt.award((t) => { t.c.point++; }, `${g.name}を破った`);
      rt.banner(`${g.name}、破れたり`, last ? '本丸へ攻め入る' : P.regs[g.i + 1].name.includes('枡形') ? '枡形へ押し込め。四方から撃たれるぞ' : `${P.regs[g.i + 1].name}へ攻め入る`);
      const next = P.gates.find((x) => x.st.alive);
      if (next) {
        rt.say(lordA, P.regs[g.i + 1].name.includes('枡形') ? `枡形じゃ！　止まるな、${next.name}を破れ！` : `押し込め！　次は${next.name}じゃ！`, 3.5);
        rt.obj('main', `${STAGE(1)}${next.name}を破れ`, 'main');
        // 新手の先手（門破りが一人にならないように）
        const ng = allyGroup(rt, { faction: facA, name: '新手の先手', anchor: { x: g.c.x + g.n.x * 14, z: g.c.z + g.n.z * 14 }, facing: Math.PI, width: 7, aggro: 7, order: 'assault', seekRange: 12 },
          [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 11, o: flagA }]);
        ng.assault = (u) => route(P, u.pos, N, this.goalPt(rt));
        F.vans.push(ng);
        this.markGate(rt);
      } else this.honmaru(rt);
    },
    onStructHit(rt, s) {
      const F = rt.flags;
      if (s.gate === undefined) return;
      // 打たれるたびに門が揺れる（扉が内へ少したわんで戻る）
      if (s.mesh && !s.shakeT) {
        const g = P.gates.find((x) => x.st === s);
        s.shakeT = 1;
        const m = s.mesh, nx = g ? g.n.x : 0, nz = g ? g.n.z : 1;
        m.position.x -= nx * 0.08; m.position.z -= nz * 0.08;
        rt.after(0.12, () => { m.position.x += nx * 0.08; m.position.z += nz * 0.08; s.shakeT = 0; });
      }
      const pct = Math.round(s.hp / s.maxHp * 100);
      const said = (F.gateSaid = F.gateSaid || {})[s.name] = F.gateSaid[s.name] || [];
      const next = [75, 50, 25].find((q) => pct <= q && !said.includes(q));
      if (next) {
        said.push(next);
        rt.bark(`${s.name}がきしんでいる（残り ${pct}%）`, defend);
        if (next === 25) rt.say(defend ? jodai : '門破りの頭', defend ? '門がもたぬ！　石を落とせ！' : 'もう一息じゃ！　閂が折れるぞ！', 2.5);
      }
    },
    onKill(rt, v, k) {
      const F = rt.flags;
      if (v.team === 1) F.ek++; else F.ak++;
      if (defend && v.team === A) F.siege -= 0.4;
      if (v === F.lordB) {
        if (F.duel && F.duel.foe === v) F.duelWon = true;
        if (k && k.isPlayer) rt.award((t) => { t.c.point++; }, '城将を討ち取った');
        rt.say('足軽', '城将を討ち取ったぞぉっ！', 3);
      }
    },
    onRout(rt, g) {
      const F = rt.flags;
      if (g === F.sallyG) rt.say('足軽', '打って出た城兵が逃げ戻っていくぞ！', 2.5);
    },
  };
  // 城の中の井戸・蔵などの前に、梯子段と雁木（塀の内に上る石段）を置く
  function sumiG(B, W, P) {
    for (const l of P.ladders) {
      const x = l.x - l.n.x * 1.6, z = l.z - l.n.z * 1.6;
      const face = Math.atan2(l.n.x, l.n.z);
      for (let s = 0; s < 3; s++) { const d = 0.9 + s * 0.45; box(B.stone, 0x8a857a, l.x - l.n.x * d, W.heightAt(x, z) + 0.15 + (2 - s) * 0.22, l.z - l.n.z * d, 3.2, 0.3 + (2 - s) * 0.44, 0.45, face); }
    }
  }
  function F_idx(rt, l) { return rt.flags.ladders.indexOf(l); }
  // 任務札の頭に、城攻めの三段（竹束→門→本丸）のどこにいるかを出す
  function STAGE(k) { return ['竹束', '門', '本丸'].map((w, i) => (i === k ? `【${w}】` : w)).join('›') + '　'; }
  // 足軽（組を持たない身分）か。信長で出陣・侍大将の試しは組を持つ
  function lowRank(rt) { return !rt.G.lord && !(rt.G.trialStep >= 3) && !(RANKS[rt.G.rank] || RANKS[0]).squad; }
  // 一騎打ちを受けられる身分か（侍大将から。足軽や組頭は組で囲んで討つ）
  function duelRank(rt) { return !!rt.G.lord || rt.G.trialStep >= 3; }
  // 両軍の総勢（地図の上の兵の数）。討たれた兵一人を、まわりの大勢の損害に見立てる
  def.force = (rt) => {
    const F = rt.flags;
    if (defend) {
      const a = Math.max(0, F.b0 - (F.ak || 0) * (F.b0 / 150));
      const b = Math.max(0, F.a0 - (F.ek || 0) * (F.a0 / 400) - (F.ending && rt.tracker.main ? F.a0 * 0.2 : 0));
      return { a, a0: F.b0, b, b0: F.a0 };
    }
    const b = Math.max(0, F.b0 - (F.ek || 0) * (F.b0 / 140) - (F.ending && rt.tracker.main ? F.b0 * 0.3 : 0));
    return { a: F.a0 - (F.ak || 0) * (F.a0 / 600), a0: F.a0, b, b0: F.b0 };
  };
  def.sides = defend
    ? { a: { name: `${clanB}方 ${castle}`, mon: monB }, b: { name: `${clanA}軍`, mon: monA } }
    : { a: { name: `${clanA}軍`, mon: monA }, b: { name: `${clanB}方 ${castle}`, mon: monB } };
  def.date = (rt) => {
    const w = rt.world;
    const time = { day: '昼', storm: '昼', after: '昼下がり', dusk: '夕暮れ' }[w.timeKey] || '昼';
    return `${info.date}　${season}・${w.rainLevel > 0.5 ? '雨' : '晴'}・${time}`;
  };
  def.history = `${castle}（${info.prov}国）は、この地図では${TN}として描いています。${gr.grand ? '名のある大きな城として、' : ''}石高に合わせて曲輪の数と大きさを変えた型紙の城で、実際の縄張りとは異なります。地図の戦は戦功・昇進には数えません。`;
  def.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? (defend ? '寄せ手が来るまで待つ' : '合図まで待つ') : '');
  def.skip = (rt) => (defend ? def.signalDefend(rt) : def.signal(rt));
  def.botBrain = (b, inp, h) => (defend ? botDefend(b, inp, h, P, def) : botAttack(b, inp, h, P, def));
  return def;
}

// ---------------- bot の遊び方 ----------------
// 動けなくなったか（五秒で一歩も進まない）
function botStuck(b, u) {
  const s = b.botSt || (b.botSt = { x: u.pos.x, z: u.pos.z, t: b.t });
  if (Math.hypot(u.pos.x - s.x, u.pos.z - s.z) > 1) { s.x = u.pos.x; s.z = u.pos.z; s.t = b.t; return false; }
  if (b.t - s.t > 5) { s.t = b.t; return true; }
  return false;
}
// 行けない敵はしばらく相手にしない
const botIgnored = (b, o) => b.botIgn && b.botIgn.t > b.t && b.botIgn.u === o;
// 近くの（同じ曲輪の）敵を突く
function fight(b, inp, e) {
  if (botStuck(b, b.player.u)) b.botIgn = { u: e, t: b.t + 12 };
  const p = b.player, u = p.u;
  const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
  p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
  if (d > 2.4) inp.k.add('KeyW');
  if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
  inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.5;
}
function botAttack(b, inp, { goTo }, P, def) {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (b.choice) { inp.e.add(F.botNoDuel ? 'Digit2' : 'Digit1'); return; }
  const cmd = (id) => { if (!(b.botCmdT > b.t)) { inp.quickCmd = id; b.botCmdT = b.t + 2.5; } };
  if (b.botSelBow) { b.botSelBow = false; p.selGroup = 'all'; p.lock = null; }
  const r = P.regionOf(u.pos.x, u.pos.z);
  const hold = (x, z) => { goTo(p, inp, x, z, 1.5); };
  const via = (goal, q) => { let t = route(P, u.pos, goal, q); if (t.isStruct) t = { x: (t.seg[0] + t.seg[2]) / 2, z: (t.seg[1] + t.seg[3]) / 2 }; return t; };
  // 一騎打ち
  if (F.duel) {
    const e = F.duel.foe;
    if (u.hp < u.maxHp * 0.35 && Math.random() < 0.6) { inp.guardHold = true; p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z); return; }
    fight(b, inp, e); return;
  }
  // 竹束を押して寄せ場へ
  if (F.step <= 1) {
    const mine = F.tabas.find((tb) => tb.carrier === 'player');
    if (!mine) {
      const tb = F.tabas.filter((x) => x.team === 0 && !x.van && !x.carrier).sort((a1, a2) => Math.hypot(a1.x - u.pos.x, a1.z - u.pos.z) - Math.hypot(a2.x - u.pos.x, a2.z - u.pos.z))[0];
      if (tb && Math.hypot(tb.x - u.pos.x, tb.z - u.pos.z) > 1.8) { goTo(p, inp, tb.x, tb.z + 1.2, 1.0); return; }
      if (tb) { inp.e.add('KeyE'); return; }
    }
    if (F.step === 1) { if (b.squad.length && !b.squadGroups.every((g) => g.formation === 'loose')) cmd('form'); goTo(p, inp, 3, F.P.front + (P.type === 'hira' ? 24 : 20), 2); }
    return;
  }
  // 寄せ場に着いたら竹束を据える（押したまま門へは行かない）
  if (F.tabas.some((tb) => tb.carrier === 'player')) { inp.e.add('KeyE'); return; }
  // 弓組に櫓の射手を狙わせる
  const bowG = b.squadGroups.find((g) => g.kind === 'bow' && g.count);
  if (bowG && !F.towersDone && F.towerU.length && !(bowG.focus && bowG.focus.alive) && !(b.botCmdT > b.t)) {
    const tw = F.towerU.filter((o) => o.alive).sort((a1, a2) => Math.hypot(a1.pos.x - u.pos.x, a1.pos.z - u.pos.z) - Math.hypot(a2.pos.x - u.pos.x, a2.pos.z - u.pos.z))[0];
    if (tw && Math.hypot(tw.pos.x - u.pos.x, tw.pos.z - u.pos.z) < 40) { p.selGroup = 'bow'; p.lock = tw; inp.quickCmd = 'focus'; b.botCmdT = b.t + 2.5; b.botSelBow = true; return; }
  }
  // 深手なら下がって息を整える
  if (u.hp < u.maxHp * 0.5) F.botRest = true;
  if (F.botRest && u.hp > u.maxHp * 0.9) F.botRest = false;
  if (F.botRest) {
    // 城の外、竹束の陰まで下がる
    const t = r > 0 ? route(P, u.pos, 0, { x: 0, z: P.front + 28 }) : { x: 0, z: P.front + 28 };
    if (t.isStruct) hold(u.pos.x, u.pos.z + 3); else hold(t.x, t.z);
    return;
  }
  const e = b.army.nearestEnemy(u, 13, (o) => !o.tower && !o.fleeing && !botIgnored(b, o) && P.regionOf(o.pos.x, o.pos.z) === r && !(P.regs[r].obst || []).some((R) => !R.soft && !R.door && inR(R, o.pos.x, o.pos.z)));
  if (e) {
    // 間に塀（枡形・本丸の堀）があれば回り込んでから
    const w = avoid(P.regs[r], u.pos, e.pos);
    if (w !== e.pos && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 3) { hold(w.x, w.z); return; }
    fight(b, inp, e);
    if (b.squad.length && b.squadGroups[0].order !== 'attack') cmd('attack');
    return;
  }
  inp.guardHold = false;
  if (b.squad.length && b.squadGroups[0].order === 'attack') cmd('follow');
  // 城将へ
  if (F.step >= 3) { const L = F.lordB; const q = L.alive ? { x: L.pos.x, z: L.pos.z } : P.court; const t = via(P.N, q); hold(t.x, t.z); return; }
  const g = P.gates.find((x) => x.st.alive);
  if (!g) return;
  // 一度は梯子で塀を越えてみる（F.botLadder）。越えたら閂を外す
  if (F.botLadder === undefined) F.botLadder = Math.random() < 0.5;
  // 梯子は、門が弱って城兵が門に気を取られてから、深手のない時に（先走って一人で斬り込まない）
  if (F.botLadder && F.ladders && !F.ladderDone && (F.climbTo || (g.st.hp < g.st.maxHp * 0.5 && u.hp > u.maxHp * 0.9 && b.squad.filter((x) => x.alive).length >= 8))) {
    const l = F.ladders.find((x) => x.reg === g.i + 1);
    if (l && r === g.i + 1) {
      const q = { x: g.c.x - g.n.x * 1.3, z: g.c.z - g.n.z * 1.3 };
      const t = avoid(P.regs[r], u.pos, q);
      if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1.4) hold(t.x, t.z); else inp.k.add('KeyE');
      return;
    }
    if (l && r === l.from) {
      const foot = { x: l.x + l.n.x * 1.8, z: l.z + l.n.z * 1.8 };
      const t = avoid(P.regs[r], u.pos, foot);
      if (Math.hypot(foot.x - u.pos.x, foot.z - u.pos.z) > 2.0) hold(t.x, t.z); else inp.k.add('KeyE');
      return;
    }
  }
  // 門の前へ行き、掛矢で打つ
  if (r < g.i) { const t = via(g.i, g.app); hold(t.x, t.z); return; }
  if (r === g.i) {
    const q = { x: g.c.x + g.n.x * 1.6, z: g.c.z + g.n.z * 1.6 };
    const out = (u.pos.x - g.c.x) * g.n.x + (u.pos.z - g.c.z) * g.n.z;
    const lat = Math.abs((u.pos.x - g.c.x) * g.n.z - (u.pos.z - g.c.z) * g.n.x);
    if (!(lat < g.w / 2 + 1 && out > 0 && out < g.appD + 1.5)) { const t = avoid(P.regs[r], u.pos, g.app); hold(t.x, t.z); return; }
    if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1.2) hold(q.x, q.z);
    if (Math.hypot(u.pos.x - g.c.x - g.n.x * 1.2, u.pos.z - g.c.z - g.n.z * 1.2) < 3.2) inp.k.add('KeyE');
  }
}
function botDefend(b, inp, { goTo }, P, def) {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (b.choice) { inp.e.add('Digit1'); return; }
  const r = P.regionOf(u.pos.x, u.pos.z);
  const defReg = P.regs[1].name === '枡形' ? 2 : 1;
  const g0 = P.gates[defReg - 1];
  const post = { x: g0.c.x - g0.n.x * 5, z: g0.c.z - g0.n.z * 5 };
  const hold = (x, z, rr = 1.5) => goTo(p, inp, x, z, rr);
  if (F.duel) { fight(b, inp, F.duel.foe); return; }
  if (u.hp < u.maxHp * 0.35) F.botRest = true;
  if (F.botRest && u.hp > u.maxHp * 0.8) F.botRest = false;
  // 打って出た時：木戸から出て鉄砲組へ。済んだら戻る
  if (F.sallyOn && !P.port.st.alive) {
    const pg = P.port;
    const outside = r < defReg;
    const target = !F.gunDone && !F.botRest && F.gun.count ? F.gun.center() : null;
    if (target) {
      if (!outside) { const t = avoid(P.regs[r], u.pos, { x: pg.c.x - pg.n.x * 2, z: pg.c.z - pg.n.z * 2 }); if (Math.hypot(u.pos.x - pg.c.x, u.pos.z - pg.c.z) < 3) hold(pg.c.x + pg.n.x * 5, pg.c.z + pg.n.z * 5); else hold(t.x, t.z); return; }
      const e = b.army.nearestEnemy(u, 10, (o) => !o.fleeing && P.regionOf(o.pos.x, o.pos.z) === 0);
      if (e) { fight(b, inp, e); return; }
      hold(target.x, target.z, 2); return;
    }
    if (outside) {
      const q = { x: pg.c.x + pg.n.x * 3, z: pg.c.z + pg.n.z * 3 };
      if (Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < 2) hold(pg.c.x - pg.n.x * 4, pg.c.z - pg.n.z * 4, 0.8); else hold(q.x, q.z, 1.2);
      return;
    }
  }
  if (F.botRest) { hold(post.x - g0.n.x * 8, post.z - g0.n.z * 8); return; }
  // 掛けられた梯子を突き落とす
  const l = F.ladders && F.ladders.find((x) => x.placed && x.reg === r);
  if (l) {
    const q = { x: l.x - l.n.x * 1.4, z: l.z - l.n.z * 1.4 };
    const e0 = b.army.nearestEnemy(u, 3, (o) => P.regionOf(o.pos.x, o.pos.z) === r);
    if (e0) { fight(b, inp, e0); return; }
    if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1.5) hold(q.x, q.z, 1.0); else inp.k.add('KeyE');
    return;
  }
  const e = b.army.nearestEnemy(u, 16, (o) => !o.fleeing && !botIgnored(b, o) && P.regionOf(o.pos.x, o.pos.z) === r);
  if (e) { const w = avoid(P.regs[r], u.pos, e.pos); if (w !== e.pos && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 3) hold(w.x, w.z); else fight(b, inp, e); return; }
  inp.guardHold = false;
  // 門に寄る敵がいれば石落とし
  const g = P.gates.find((x) => x.st.alive && x.i + 1 === r);
  if (g) {
    let near = 0;
    b.army.forNear(g.c.x + g.n.x * 2, g.c.z + g.n.z * 2, 4, (o) => { if (o.alive && o.team === 1) near++; });
    const q = { x: g.c.x - g.n.x * 1.4, z: g.c.z - g.n.z * 1.4 };
    if (near >= 2 && (F.stoneCd || 0) <= b.t) { if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1.2) hold(q.x, q.z, 0.8); else inp.k.add('KeyE'); return; }
  }
  hold(post.x, post.z, 2);
}
