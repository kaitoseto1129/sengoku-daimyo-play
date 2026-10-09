// ======================================================================
// honno_tera.js … 天正十年（1582）の本能寺（油小路蛸薬師の旧地）の境内。足軽の流れの舞台（docs/honnoji-1582-spec.md）
//   ・ゾーン：外周（築地・四つの門）／前面（表門・表庭・前の宿坊）／中心（本堂・中庭）／居住（信長の御殿）／
//     周辺宿坊（宿坊・庫裏）／裏手（物置・井戸・細い道・裏門）／庭園（中庭・回廊）
//   ・近くで通る建物（本堂・御殿・宿坊）は中まで作る：襖で区切った部屋・廊下・縁側・広間・信長の居室。
//     屋根は自分が中にいる間だけ隠す（中が見える）。襖と障子は一枚ずつ破れる（InstancedMesh の一つを消す）
//   ・建物は temple1571.js の Garan に積む（材質ごとに一つの形。燃えると黒ずみ、燃え落ちると潰れる）。築地は makeKitBatch
//   ・個々の配置は推定（HIST_B）。向き：東（+x）に表門、北（-z）に脇門、西に裏門、南に勝手口
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintGeo, hipGeo, solidSeg, solidRect, solidCircle, tsuiji, kabukimon, yagura, umatsunagi, makeKitBatch, finalizeKitBatch, dorui, ishigaki, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { wallLine } from './bhelp.js';
import { S as SETTINGS } from './settings.js';
import { Garan, makeTempleFire } from './temple1571.js';
import { panelInstances, furnishTemple } from './interior_parts.js';

// 寺域120m四方と各棟の配置は推定。発掘の実測値とはしない。建物の寸法は縮めない。
export const TERA = { x0: -151, x1: -31, z0: -16, z1: 104 };
export const inTera = (x, z, m = 0) => x > TERA.x0 - m && x < TERA.x1 + m && z > TERA.z0 - m && z < TERA.z1 + m;
// 門（築地の切れ目）。side は築地のどの辺か
export const GATES = {
  main: { x: -31, z: 50, w: 6, side: 'e', name: '表門' },
  side: { x: -48, z: TERA.z0, w: 3.6, side: 'n', name: '北の脇門' },
  ura: { x: TERA.x0, z: 76, w: 3.2, side: 'w', name: '裏門' },
  katte: { x: -47, z: 104, w: 3, side: 's', name: '南の勝手口' },
};
export const CLIMB = { x: -66, z: TERA.z0 };   // 外塀を乗り越えられる所（北の築地・裏手の上）
// 大事な場所
export const PT = {
  start: { x: -61, z: 82.1 },     // 御殿の廊下（控えの間の前）
  nbRoom: { x: -69, z: 90.5 },    // 信長の居室
  gateIn: { x: -36, z: 50 },      // 表門の内
  omote: { x: -40, z: 47 },       // 表庭
  niwa: { x: -50, z: 66 },        // 中庭（回廊の際）
  hiroma: { x: -53, z: 89 },      // 御殿の広間
  hikae: { x: -61, z: 89 },       // 控えの間
  kyoshitsu: { x: -67, z: 89 },   // 居室の口
  oku: { x: -71.2, z: 85.6 },     // 奥の納戸
  ura: { x: TERA.x0 + 2.5, z: 76 },       // 裏門の内
  uraOut: { x: TERA.x0 - 9, z: 76 },      // 裏門の外（西の通り）
  climbIn: { x: CLIMB.x, z: CLIMB.z + 4 },
};

// 発掘報告は外周の堀と内部区画の堀を区別。南堀は幅2m以上・深さ約1m。
// 外周の一律4mの幅、各辺の位置と土橋は推定。内堀の実測幅を外周の根拠にしない。
// 個々の門・建物の位置や、土居の高さと厚さは推定。計算中に形や配列を作らない。
const MOAT = { inset: 0.8, width: 4, depth: 1 };
const footCrossings = [...Object.values(GATES), { ...CLIMB, w: 4, side: 'n' }];
// 京都市埋蔵文化財研究所の発掘解説（231.pdf）：東部中央の内堀は北から西へ折れる。
// 南北の腕は幅4m・長さ8m以上、東西の腕は幅約6m・長さ12m以上。位置と土橋は推定。
// 既存の堂・回廊と北門からの進路を保ち、空いている東側に原寸の断面を置く。
const INNER_MOATS = [
  { x0: -44, x1: -40, z0: 12, z1: 27 },
  { x0: -58, x1: -40, z0: 21, z1: 27 },
];

function innerMoatDepth(x, z) {
  // 北門から本堂への道は土橋。両側の裾を含めて二列の兵を通す。
  const bridge = Math.abs(x - GATES.side.x);
  if (bridge <= 3) return 0;
  let depth = 0;
  for (const m of INNER_MOATS) {
    const edge = Math.min(x - m.x0, m.x1 - x, z - m.z0, m.z1 - z);
    if (edge > 0) depth = Math.max(depth, Math.min(1, edge / 0.75));
  }
  return depth * Math.min(1, (bridge - 3) / 0.75);
}

export function teraMoatDepth(x, z, lord = false) {
  const dx = Math.max(TERA.x0 - x, x - TERA.x1), dz = Math.max(TERA.z0 - z, z - TERA.z1);
  const d = Math.max(dx, dz) - MOAT.inset;
  if (d <= 0 || d >= MOAT.width) return innerMoatDepth(x, z);
  const side = dx > dz ? (x < TERA.x0 ? 'w' : 'e') : (z < TERA.z0 ? 'n' : 's');
  for (const g of footCrossings) {
    if (g.side === side && Math.abs(side === 'n' || side === 's' ? x - g.x : z - g.z) < g.w / 2 + 0.6) return 0;
  }
  return MOAT.depth * Math.min(1, d / 0.75, (MOAT.width - d) / 0.75);
}

// 外周は土居と築地。石垣は発掘で確認された内堀の南北の腕の西岸だけに置く。
// 材質ごとにまとめ、作るのは設営時だけ。
export function buildTeraEarthworks(rt, gates = Object.values(GATES)) {
  carveTeraMoat(rt);
  const stone = makeKitBatch(), earth = makeSimpleBatch();
  const { x0, x1, z0, z1 } = TERA;
  const sides = [['n', x0, x1, z0, 0, 1], ['s', x0, x1, z1, 0, -1], ['w', z0, z1, x0, 1, 0], ['e', z0, z1, x1, -1, 0]];
  for (const [side, a, b, fix, nx, nz] of sides) {
    const along = side === 'n' || side === 's';
    const gaps = gates.filter((g) => g.side === side).map((g) => [ (along ? g.x : g.z) - g.w / 2 - 0.6, (along ? g.x : g.z) + g.w / 2 + 0.6 ]).sort((p, q) => p[0] - q[0]);
    gaps.push([b, b]);
    let start = a;
    for (const [end, next] of gaps) {
      if (end > start) {
        const pts = along ? [[start, fix], [end, fix]] : [[fix, start], [fix, end]];
        const seg = [...pts[0], ...pts[1]];
        dorui(rt.world, seg, nx, nz, { w: 2, h: 0.8, batch: earth });
      }
      start = next;
    }
  }
  // 堀底から約0.8mの低い留め石。全周を城の総石垣にしない。
  ishigaki(rt.world, [[-44, 12.8], [-44, 20.5]], { top: -0.2, minH: 0.8, maxH: 0.8, sink: 0, lean: 0.1, out: -1, batch: stone });
  finalizeKitBatch(rt, stone);
  finalizeSimpleBatch(rt, earth);
  // 堀の底に溜まった黒い水（夜明け前の空を映す）。土橋の所は地面の下に隠れる。四枚だけ・材質は一つ。
  const water = new THREE.MeshStandardMaterial({ color: 0x1a2226, roughness: 0.18, metalness: 0.15 });
  const mid = MOAT.inset + MOAT.width / 2, y = rt.world.heightAt(x1 + MOAT.inset + MOAT.width + 3, (z0 + z1) / 2) - MOAT.depth * 0.7;
  for (const [cx, cz, w, d] of [[(x0 + x1) / 2, z0 - mid, x1 - x0 + 2 * (MOAT.inset + MOAT.width), MOAT.width - 1.2],
    [(x0 + x1) / 2, z1 + mid, x1 - x0 + 2 * (MOAT.inset + MOAT.width), MOAT.width - 1.2],
    [x0 - mid, (z0 + z1) / 2, MOAT.width - 1.2, z1 - z0], [x1 + mid, (z0 + z1) / 2, MOAT.width - 1.2, z1 - z0]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), water);
    m.rotation.x = -Math.PI / 2; m.position.set(cx, y, cz); m.receiveShadow = true;
    rt.scene.add(m);
  }
}

// 地面の通常の間隔は2.5mなので、堀にかかる三角だけ細かくする。
// 地面の材質を使い回し、兵の足もとの高さも同じ堀の断面に合わせる。
function carveTeraMoat(rt) {
  const W = rt.world, lord = !!rt.G.lord, old = W.terrain.geometry;
  const attrs = old.attributes, pos = attrs.position, idx = old.index;
  const values = {}, indices = [], names = Object.keys(attrs).filter((k) => k !== 'normal');
  for (const k of names) values[k] = Array.from(attrs[k].array);
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    const minX = Math.min(pos.getX(a), pos.getX(b), pos.getX(c)), maxX = Math.max(pos.getX(a), pos.getX(b), pos.getX(c));
    const minZ = Math.min(pos.getZ(a), pos.getZ(b), pos.getZ(c)), maxZ = Math.max(pos.getZ(a), pos.getZ(b), pos.getZ(c));
    const near = Math.max(TERA.x0 - maxX, minX - TERA.x1, TERA.z0 - maxZ, minZ - TERA.z1);
    const far = Math.max(TERA.x0 - minX, maxX - TERA.x1, TERA.z0 - minZ, maxZ - TERA.z1);
    const inner = INNER_MOATS.some((m) => maxX > m.x0 && minX < m.x1 && maxZ > m.z0 && minZ < m.z1);
    if (!inner && (far <= MOAT.inset || near >= MOAT.inset + MOAT.width)) { indices.push(a, b, c); continue; }
    const rows = [], n = 5;
    for (let u = 0; u <= n; u++) {
      const row = [];
      for (let v = 0; v <= n - u; v++) {
        const wa = 1 - (u + v) / n, wb = u / n, wc = v / n;
        row.push(values.position.length / 3);
        for (const k of names) {
          const attr = attrs[k], s = attr.itemSize;
          for (let q = 0; q < s; q++) values[k].push(attr.array[a * s + q] * wa + attr.array[b * s + q] * wb + attr.array[c * s + q] * wc);
        }
        const p = values.position.length - 3;
        values.position[p + 1] -= teraMoatDepth(values.position[p], values.position[p + 2], lord);
      }
      rows.push(row);
    }
    for (let u = 0; u < n; u++) for (let v = 0; v < n - u; v++) {
      indices.push(rows[u][v], rows[u + 1][v], rows[u][v + 1]);
      if (v < n - u - 1) indices.push(rows[u + 1][v], rows[u + 1][v + 1], rows[u][v + 1]);
    }
  }
  const geo = new THREE.BufferGeometry();
  for (const k of names) geo.setAttribute(k, new THREE.Float32BufferAttribute(values[k], attrs[k].itemSize));
  geo.setIndex(indices); geo.computeVertexNormals(); geo.computeBoundingSphere();
  W.terrain.geometry = geo; old.dispose();
  const ground = W.heightAt.bind(W);
  W.heightAt = (x, z) => ground(x, z) - teraMoatDepth(x, z, lord);
}
// 表庭から御殿へ移る五つの道（迷わせない：どれも御殿の北か東の口に着く）
export const ROUTES = {
  kairo: { name: '回廊', note: '屋根のある廊。守りやすいが詰まる', pts: [[-43.5, 52], [-45, 58], [-45, 70], [-45.5, 77], [-52, 77.5], [-52, 80], [-52, 82.2], [-54, 86]] },
  hondo: { name: '本堂を抜ける', note: '堂の中は広い。西の口から渡り廊下へ', pts: [[-44, 46], [-48, 46], [-55, 44], [-62, 46], [-65, 47], [-68, 51], [-68, 70], [-68, 79], [-68, 80.6], [-68, 82.2], [-62, 86]] },
  niwa: { name: '中庭を突っ切る', note: '近いが開けている。鉄砲に撃たれやすい', pts: [[-44, 54], [-50, 64], [-52, 74], [-52, 80], [-52, 82.2], [-54, 86]] },
  shukubo: { name: '宿坊を抜ける', note: '狭い部屋を抜ける。少しずつしか来られない', pts: [[-37, 62], [-35.5, 64.5], [-35.5, 68.5], [-38.5, 70], [-41, 70], [-44, 71.5], [-46.5, 80], [-47.5, 88], [-50.5, 88], [-53, 88.5]] },
  urate: { name: '裏手を回る', note: '細い道。遠回りだが敵が少ない', pts: [[-44, 38], [-52, 37], [-62, 37], [-70, 38], [-70.5, 50], [-70.5, 70], [-70.5, 79], [-71, 80.6], [-71, 82.2], [-66, 86]] },
};

// ---- 形の小道具（世界の座標で作る） ----
const pb = (w, h, d, x, y, z, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return paintGeo(g, hex); };
// 漆喰の壁の箱：絵は一枚を実寸で貼る（横は3mで一回り、縦は v0 から h/3）。上の小壁は v0=0.72（軒下の煤）、胸の高さは 0.3
const wb = (w, h, d, x, y, z, hex, v0 = 0.3) => {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k, [a, b] = dims[f]; uv.setXY(i, uv.getX(i) * a / 3 + (x * 0.37 + z * 0.53), v0 + uv.getY(i) * Math.min(0.28, b / 3.6)); }
  g.translate(x, y, z); return paintGeo(g, hex);
};
// 本能寺の壁の絵：寺の古い漆喰。canvas の縦 0〜143 が小壁（上ほど煤）、215〜358 が胸の高さの壁（下ほど泥はね）。
// 剥げは小さく不ぞろいに、土と竹の小舞をのぞかせる。丸い染みにしない。
let TERA_PLASTER = null;
function teraPlasterMat() {
  if (TERA_PLASTER) return TERA_PLASTER;
  const S = 512, cv = document.createElement('canvas'), hv = document.createElement('canvas'); cv.width = cv.height = hv.width = hv.height = S;
  const g = cv.getContext('2d'), hg = hv.getContext('2d');
  let seed = 4417; const R = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  g.fillStyle = '#b4ac98'; g.fillRect(0, 0, S, S); hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  for (let i = 0; i < 340; i++) { const v = 150 + R() * 50; g.fillStyle = `rgba(${v},${v - 4},${v - 22},0.2)`; g.beginPath(); g.ellipse(R() * S, R() * S, 10 + R() * 50, 5 + R() * 18, R() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(70,60,46,${0.05 + R() * 0.08})`; g.beginPath(); g.ellipse(R() * S, R() * S, 8 + R() * 36, 4 + R() * 12, R() * 3, 0, 7); g.fill(); }
  // 鏝の跡（起伏）
  for (let i = 0; i < 200; i++) { hg.fillStyle = `rgba(${R() < 0.5 ? '100,100,100' : '170,170,170'},0.2)`; hg.beginPath(); hg.ellipse(R() * S, R() * S, 18 + R() * 50, 3 + R() * 6, (R() - 0.5) * 0.5, 0, 7); hg.fill(); }
  // 雨だれの筋：長押の下（215）と小壁の下（143）から垂れる
  for (const y0 of [215, 143, 0]) for (let i = 0; i < 60; i++) {
    let x = R() * S; const l = 25 + R() * 110, w = 1.5 + R() * 4, a0 = 0.14 + R() * 0.2;
    for (let yy = 0; yy < l; yy += 3) { x += (R() - 0.5) * 0.9; const f = 1 - yy / l; g.fillStyle = `rgba(52,44,34,${a0 * f})`; g.fillRect(x, y0 + yy, w * (0.5 + f * 0.5), 3); }
  }
  // 軒下の煤（天井際は黒く）
  const soot = g.createLinearGradient(0, 0, 0, 150); soot.addColorStop(0, 'rgba(30,26,22,0.75)'); soot.addColorStop(0.5, 'rgba(36,30,24,0.32)'); soot.addColorStop(1, 'rgba(40,34,26,0.1)'); g.fillStyle = soot; g.fillRect(0, 0, S, 150);
  const sootB = g.createLinearGradient(0, 215, 0, 260); sootB.addColorStop(0, 'rgba(36,30,24,0.4)'); sootB.addColorStop(1, 'rgba(36,30,24,0)'); g.fillStyle = sootB; g.fillRect(0, 215, S, 45);
  // 足もとの泥はねと湿り
  const mud = g.createLinearGradient(0, 290, 0, 358); mud.addColorStop(0, 'rgba(70,56,38,0)'); mud.addColorStop(1, 'rgba(70,56,38,0.6)'); g.fillStyle = mud; g.fillRect(0, 290, S, 68);
  for (let i = 0; i < 1500; i++) { const y = 358 - Math.pow(R(), 2) * 90, s = 0.6 + R() * 2; g.fillStyle = `rgba(${70 + R() * 30},${56 + R() * 20},${38 + R() * 10},${0.25 + R() * 0.4})`; g.beginPath(); g.ellipse(R() * S, y, s, s * 0.7, 0, 0, 7); g.fill(); }
  // 剥げ：不ぞろいな欠け。縁に白い漆喰の厚み、中は土と小舞（竹の格子）
  const chip = (x, y, w, h) => {
    const pts = []; for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283, r = 0.45 + R() * 0.55; pts.push([x + Math.cos(a) * w * r, y + Math.sin(a) * h * r * (0.7 + R() * 0.6)]); }
    const path = (c, grow = 1) => { c.beginPath(); pts.forEach(([px, py], k) => { const X = x + (px - x) * grow, Y = y + (py - y) * grow; k ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); };
    path(g, 1.18); g.fillStyle = 'rgba(206,198,178,0.9)'; g.fill();
    path(g); g.fillStyle = '#7d6a4e'; g.fill(); path(hg); hg.fillStyle = '#303030'; hg.fill();
    g.save(); path(g); g.clip(); g.strokeStyle = 'rgba(46,36,24,0.7)'; g.lineWidth = 1.6; for (let k = -2; k < 5; k++) { g.beginPath(); g.moveTo(x - w, y + k * h * 0.4); g.lineTo(x + w, y + k * h * 0.4); g.stroke(); }
    g.strokeStyle = 'rgba(120,100,70,0.6)'; for (let k = -3; k < 4; k++) { g.beginPath(); g.moveTo(x + k * w * 0.4, y - h); g.lineTo(x + k * w * 0.4, y + h); g.stroke(); }
    g.restore(); path(g); g.strokeStyle = 'rgba(40,30,20,0.7)'; g.lineWidth = 1.4; g.stroke();
  };
  chip(70, 262, 22, 12); chip(190, 300, 12, 20); chip(320, 235, 16, 9); chip(420, 285, 26, 13); chip(260, 75, 14, 8);
  // 罅
  for (let i = 0; i < 18; i++) {
    let x = R() * S, y = (R() < 0.5 ? 140 : 215) + R() * 130; g.strokeStyle = 'rgba(46,40,32,0.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += (R() - 0.5) * 22; y += R() * 14; g.lineTo(x, y); } g.stroke();
  }
  const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  TERA_PLASTER = new THREE.MeshStandardMaterial({ vertexColors: true, map: mk(cv, true), bumpMap: mk(hv, false), bumpScale: 1.6, roughness: 0.95, metalness: 0 });
  return TERA_PLASTER;
}
// 床の板：一枚ずつ色を変えた板を、継ぎ目を空けて並べる（縁側）
const planks = (x0, z0, x1, z1, y, alongX, hex) => {
  const out = [], n = Math.max(1, Math.round((alongX ? z1 - z0 : x1 - x0) / 0.26)), step = (alongX ? z1 - z0 : x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const v = 0.88 + ((i * 7) % 5) * 0.035, c = ((hex >> 16 & 255) * v) << 16 | ((hex >> 8 & 255) * v) << 8 | ((hex & 255) * v);
    out.push(alongX ? pb(x1 - x0, 0.07, step - 0.025, (x0 + x1) / 2, y, z0 + step * (i + 0.5), c) : pb(step - 0.025, 0.07, z1 - z0, x0 + step * (i + 0.5), y, (z0 + z1) / 2, c));
  }
  return mergeGeometries(out.map((g) => g.index ? g.toNonIndexed() : g));
};
// 寝具：敷き布団（白）に、藍の掛け布団をはね除けて乱し、枕を置く（真っ白な板に見えないように）
const futon = (put, x, y, z, rot = 0, hex = 0x33405a) => {
  const grp = [];
  const q = (w, h, d, dx, dy, dz, c, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(dx, dy, dz); grp.push(paintGeo(g, c)); };
  q(0.92, 0.07, 1.9, 0, 0.035, 0, 0xb8b09a);         // 敷き布団（生成りの木綿）
  q(0.84, 0.09, 1.1, 0.02, 0.1, 0.38, hex, 0.1);      // 掛け布団（藍）：足の方へはね除けた
  q(0.7, 0.05, 0.5, -0.04, 0.095, -0.2, 0x4a5876, -0.25);  // めくれた端
  q(0.3, 0.12, 0.18, 0, 0.13, -0.78, 0x6a5440);       // 枕（箱枕）
  const m = mergeGeometries(grp.map((g) => g.index ? g.toNonIndexed() : g));
  m.rotateY(rot); m.translate(x, y, z); put('plain', m);
};
const pcyl = (r, h, x, y, z, hex, seg = 8) => { const g = new THREE.CylinderGeometry(r * 0.94, r, h, seg); g.translate(x, y + h / 2, z); return paintGeo(g, hex); };
// ---- 中のある建物（軸に沿った四角。座標は世界の座標） ----
// walls：[ax, az, bx, bz, 種, 口]。種 'wall'（腰板と白壁）'fusuma'（襖）'shoji'（障子）。口は [線の上の真ん中, 幅]
// floors：[x0, z0, x1, z1, 'tatami'|'ita']。engawa：縁側の辺（'s' など）
const HALLS = [
  { id: 'hondo', name: '本堂', x0: -63, x1: -47, z0: 40, z1: 52, H: 3.4, flam: 0.5, dur: 120, engawa: 'e',
    walls: [[-63, 40, -47, 40, 'wall', [[-56, 2.4]]], [-63, 52, -47, 52, 'wall', [[-50, 2.4], [-60, 2.2]]],
      [-47, 40, -47, 52, 'shoji', [[42.6, 2], [46, 2.4], [49.4, 2]]], [-63, 40, -63, 52, 'wall', [[46, 2.4]]],
      [-56, 40, -56, 52, 'fusuma', [[43, 2.4], [49, 2.4]]]],
    floors: [[-63, 40, -56, 52, 'tatami'], [-56, 40, -47, 52, 'ita']] },
  { id: 'goten', name: '書院', x0: -73, x1: -49, z0: 80.2, z1: 95, H: 2.9, flam: 0.7, dur: 95, engawa: 's',
    walls: [[-73, 80.2, -49, 80.2, 'wall', [[-71, 1.8], [-68, 2], [-52, 2.8]]], [-73, 95, -49, 95, 'shoji', [[-69, 1.8], [-61, 1.8], [-53, 1.8]]],
      [-49, 80.2, -49, 95, 'wall', [[88, 2]]], [-73, 80.2, -73, 95, 'wall', [[90, 1.6]]],
      [-73, 83.2, -49, 83.2, 'fusuma', [[-70.6, 1.6], [-67, 1.8], [-62, 1.8], [-54, 1.8]]],
      [-65, 83.2, -65, 95, 'fusuma', [[89, 1.8]]], [-57, 83.2, -57, 95, 'fusuma', [[89, 1.8]]],
      [-69.4, 83.2, -69.4, 88.2, 'fusuma', [[86.6, 1.3]]], [-73, 88.2, -69.4, 88.2, 'fusuma', []]],
    // 廊下は三メートル。壁の厚みと体の幅を引いても一・五メートル以上通れる。
    floors: [[-73, 80.2, -49, 83.2, 'ita'], [-73, 83.2, -49, 95, 'tatami']] },
  { id: 'shukuboA', name: '宿坊', x0: -42, x1: -33, z0: 66, z1: 74, H: 2.6, flam: 1, dur: 55,
    walls: [[-42, 66, -33, 66, 'wall', [[-35.5, 1.8]]], [-42, 74, -33, 74, 'shoji', [[-38, 1.6]]],
      [-42, 66, -42, 74, 'wall', [[70, 1.8]]], [-33, 66, -33, 74, 'wall', []], [-38.5, 66, -38.5, 74, 'fusuma', [[70, 1.6]]]],
    floors: [[-42, 66, -33, 74, 'tatami']] },
];
// Garan で作る中の無い建物（遠くから見る物・通り抜けない物）と、屋根だけの廊
const GARAN = [
  { id: 'soboN', kind: 'sobo', x: -38, z: 36, w: 8, d: 6, var: 0 },          // 前面の宿坊
  { id: 'soboB', kind: 'sobo', x: -37.5, z: 84, w: 8, d: 6, var: 1 },        // 周辺の宿坊
  { id: 'kuri', kind: 'kuri', x: -38, z: 94, w: 8, d: 6 },                    // 庫裏（炊事）
  { id: 'kura', kind: 'kura', x: -74, z: 44, w: 3, d: 4 },                    // 物置
  { id: 'naya', kind: 'sobo', x: -74, z: 66, w: 3, d: 4, var: 2 },           // 納屋
  { id: 'shoro', kind: 'shoro', x: -57, z: 34, w: 3.2, d: 3.2 },              // 鐘楼
  { id: 'kairo1', kind: 'roka', x: -45, z: 64.75, w: 2.6, d: 24.5 },          // 回廊（南へ）
  { id: 'kairo2', kind: 'roka', x: -51.5, z: 77, w: 2.6, d: 13, rot: Math.PI / 2 },   // 回廊（西へ）
  { id: 'watari', kind: 'roka', x: -68, z: 66.5, w: 2.4, d: 28 },             // 渡り廊下（本堂→御殿）
  { id: 'soshido', kind: 'do', x: -61, z: 58.5, w: 5, d: 4, h: 3, hist: 'HIST_B' },        // 祖師堂（日蓮の像を祀る。境内の脇の小さな堂）
  { id: 'kyakuden', kind: 'do', x: -55, z: 101.5, w: 6, d: 4, h: 2.8, hist: 'HIST_B' },     // 客殿（来客を通す建物。御殿の南）
  { id: 'sobo_f1', kind: 'lite', x: -64, z: 100.5, w: 5, d: 3.5, var: 1, lite: true },   // 南の小さな僧坊
  { id: 'sobo_f2', kind: 'lite', x: -72, z: 100.5, w: 4, d: 3.5, var: 2, lite: true },
  // 西の区画（内の塀の西）：北に講堂、南に馬舎。縄張りの考証図に沿う推定の配置
  { id: 'kodo', kind: 'kodo', x: -118, z: 10, w: 14, d: 9, h: 4.2, hist: 'HIST_B' },        // 講堂
  { id: 'umaya', kind: 'sobo', x: -128, z: 97, w: 15, d: 5, var: 2 },                        // 馬舎（茅葺きの長い厩）
  { id: 'hojo', kind: 'do', x: -112, z: 50, w: 12, d: 9, h: 3.4, hist: 'HIST_B' },            // 方丈（住持の居所）
  { id: 'kyozo', kind: 'kyozo', x: -98, z: 28, w: 4, d: 4 },                                  // 経蔵
  { id: 'sobo_w1', kind: 'sobo', x: -138, z: 32, w: 8, d: 5, var: 0 },          // 西の僧坊の並び
  { id: 'sobo_w2', kind: 'sobo', x: -138, z: 46, w: 8, d: 5, var: 1 },
  { id: 'sobo_w3', kind: 'sobo', x: -138, z: 60, w: 8, d: 5, var: 2 },
  { id: 'sobo_w4', kind: 'sobo', x: -104, z: 64, w: 8, d: 5, var: 1 },
  { id: 'sobo_w5', kind: 'sobo', x: -118, z: 64, w: 8, d: 5, var: 0 },
  { id: 'kura_w', kind: 'kura', x: -100, z: 97, w: 4, d: 5 },                                 // 飼葉と馬具の蔵
];
// 内の区切りの塀（x）と、その口（z の真ん中）。裏門から御殿への道（z 76〜79）を通す
const INNER_WALL = { x: -84, gate: 79 };
const UMAYA = { x: -128, z: 97 };

// 境内を作る。戻り値 T：G（Garan）・fire・halls・panels・gate structs・tick
export function buildTera(rt) {
  const W = rt.world, F = rt.flags;
  const G = new Garan(rt);
  const T = { G, halls: [], panels: [], doorsBlocked: new Set() };
  buildTeraEarthworks(rt);
  // ---- 築地（四つの門の口を空ける。makeKitBatch でまとめて描く） ----
  const kb = makeKitBatch();
  const { x0, x1, z0, z1 } = TERA;
  const sides = { n: [[x0, z0], [x1, z0]], s: [[x0, z1], [x1, z1]], w: [[x0, z0], [x0, z1]], e: [[x1, z0], [x1, z1]] };
  T.walls = [];
  for (const [k, [[ax, az], [bx, bz]]] of Object.entries(sides)) {
    const gs = Object.values(GATES).filter((g) => g.side === k).map((g) => (k === 'n' || k === 's' ? [g.x - g.w / 2, g.x + g.w / 2] : [g.z - g.w / 2, g.z + g.w / 2])).sort((a, b) => a[0] - b[0]);
    const along = k === 'n' || k === 's';
    let s = along ? ax : az;
    const end = along ? bx : bz;
    const pts = [];
    for (const [g0, g1] of gs) { pts.push([s, g0]); s = g1; }
    pts.push([s, end]);
    for (const [p0, p1] of pts) {
      if (p1 - p0 < 0.5) continue;
      const P = along ? [[p0, az], [p1, az]] : [[ax, p0], [ax, p1]];
      T.walls.push(...wallLine(rt, P, { team: 0, hp: 1e9, name: '築地塀', segLen: 6, mesh: tsuiji, meshOpt: { batch: kb } }));
    }
  }
  // 内の区切りの塀（推定）：天文法華の乱の後、寺は要害を兼ねた。西の区画（講堂・馬舎）と東の伽藍を塀で分け、口は一つ。
  for (const P of [[[INNER_WALL.x, TERA.z0], [INNER_WALL.x, INNER_WALL.gate - 9]], [[INNER_WALL.x, INNER_WALL.gate + 9], [INNER_WALL.x, TERA.z1]]]) {
    T.walls.push(...wallLine(rt, P, { team: 0, hp: 1e9, name: '内の塀', segLen: 6, mesh: tsuiji, meshOpt: { batch: kb, h: 2.2 } }));
  }
  for (const s of T.walls) { s.noTarget = true; s.wall = true; s.h = 2.6; }
  finalizeKitBatch(rt, kb);
  rt.scene.add(kabukimon(W, INNER_WALL.x, INNER_WALL.gate, 10, Math.PI / 2));
  // 北東の隅の櫓：築地の上から油小路と蛸薬師の通りを見張る（推定）
  rt.scene.add(yagura(W, TERA.x1 - 3.5, TERA.z0 + 3.5));
  rt.scene.add(umatsunagi(W, UMAYA.x, UMAYA.z - 4.5, 0, 12));
  rt.scene.add(kabukimon(W, GATES.main.x, GATES.main.z, GATES.main.w + 1.4, Math.PI / 2, { doors: !!rt.G.lord }));   // 足軽の流れでは扉を b_honnoji の tobira で開け閉めする（二重の扉を出さない）
  // ---- 中の無い建物・廊・灯籠 ----
  for (const b of GARAN) G.build({ dist: 'near', ...b });
  for (const [x, z] of [[-48.5, 60], [-60, 72], [-55, 57]]) G.lantern(x, z, 'near');
  // ---- 中のある建物 ----
  for (const H of HALLS) T.halls.push(buildHall(rt, G, H, T));
  G.finish();
  { const pb2 = G.buckets.get('hall|plaster'); if (pb2 && pb2.mesh) pb2.mesh.material = teraPlasterMat(); }   // 寺の古い漆喰の絵（城の白壁は新しすぎて白く飛ぶ）
  for (const h of T.halls) {
    const b = G.buckets.get('roof_' + h.id + '|tile'), ceiling = G.buckets.get('roof_' + h.id + '|wood');
    h.roof = b && b.mesh; h.ceiling = ceiling && ceiling.mesh;
  }
  // ---- 共通の襖と障子。一枚を破ると、絵・枠・引き手と当たりを一緒に消す ----
  T.inst = {};
  const panelMats = new Map();
  const panelCamGeo = new THREE.BoxGeometry(0.9, 1.8, 0.08);
  for (const kind of ['fusuma', 'shoji']) {
    const list = T.panels.filter((p) => p.kind === kind);
    const meshes = panelInstances(kind, list.length);
    // 共有の室内部品は変えず、寺の襖だけ夜明けの光を受ける材質にする。
    for (const m of meshes) {
      const old = m.material;
      if (!panelMats.has(old)) panelMats.set(old, old.isMeshBasicMaterial
        ? new THREE.MeshStandardMaterial({ color: old.color, map: old.map, roughness: 0.95, side: old.side }) : old);
      m.material = panelMats.get(old);
    }
    // 細い格子は調べず、一枚に一つの薄い箱でカメラを止める。破れた時も一緒に消す。
    const cameraPanels = new THREE.InstancedMesh(panelCamGeo, G.proxyMat, Math.max(1, list.length));
    cameraPanels.userData.camBlock = true;
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pv = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    list.forEach((p, i) => {
      p.meshes = meshes; p.i = i; Q.setFromAxisAngle(Y, p.rot); S.set(p.sx, 1, 1); Pv.set(p.x, p.y, p.z); M.compose(Pv, Q, S);
      for (const m of meshes) m.setMatrixAt(i, M);
      Pv.y += 0.9; M.compose(Pv, Q, S); cameraPanels.setMatrixAt(i, M);
    });
    meshes.push(cameraPanels);
    for (const m of meshes) {
      m.count = list.length; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); rt.scene.add(m);
    }
    T.inst[kind] = meshes;
  }
  // ---- 火（建物ごとに燃え、近い棟へ少しずつ燃え移る。燃え移りは遅めにして、段で火をかける） ----
  T.fire = makeTempleFire(rt, G, {
    // 画質「低」（携帯）は炎の板と煙の柱を減らす（寺の中は近くに大きな煙の粒が重なって重い）
    rate: 0.3, flames: SETTINGS.quality === 'low' ? 3 : 4, smokes: SETTINGS.quality === 'low' ? 4 : 8,
    onBurnt: (r) => { if (!F.ending) rt.bark(`${r.label || '伽藍の一棟'}が焼け落ちた`); if (r.kind !== 'hall') { rt.world.addSmokeColumn(r.x, (r.y0 || 0) + 1, r.z, { size: 2.2 }); rt.world.addFire(r.x, r.z, { size: 1.1, h: 0.2 }); } },   // 崩れた跡に燻る煙と残り火（B118）
  });
  const LBL = { kodo: '講堂', umaya: '馬舎', soboN: '表の宿坊', soboB: '奥の宿坊', kuri: '庫裏', kairo1: '回廊', kairo2: '回廊', watari: '渡り廊下', kura: '物置', naya: '納屋', shoro: '鐘楼' };
  for (const r of G.recs) r.label = r.label || LBL[r.id];
  return T;
}

// 中のある建物を一つ
function buildHall(rt, G, H, T) {
  const W = rt.world;
  const cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2;
  const rec = G.build({ id: H.id, kind: 'hall', x: cx, z: cz, w: H.x1 - H.x0, d: H.z1 - H.z0, lite: true, dist: 'hall' });
  rec.flam = H.flam; rec.dur = H.dur; rec.label = H.name; rec.top = H.H + 1.8;
  const y = rec.y0, put = (mk, g) => G._push(rec, mk, g);
  // カメラの寄せ用の当たり：壁だけの描かない箱（細かい柱・道具まで入った大きな形を毎コマ線で調べると重い）
  const blk = [];
  const bb = (w, h, d, x, yy, z) => { const g = new THREE.BoxGeometry(w, h, d); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g.translate(x, yy, z); blk.push(g); };
  const hall = { id: H.id, name: H.name, H, rec, doors: [], panels: [], x0: H.x0, x1: H.x1, z0: H.z0, z1: H.z1 };
  // 基壇（石）と床（畳・板）
  put('wood', pb(H.x1 - H.x0 + 0.5, 0.3, H.z1 - H.z0 + 0.5, cx, y - 0.1, cz, 0x7e7a70));
  for (const [a, b, c, d, k] of H.floors) if (k === 'ita') put('wood', pb(c - a - 0.04, 0.05, d - b - 0.04, (a + c) / 2, y + 0.07, (b + d) / 2, 0x6a5034));
  // 畳は共通部品で一枚ずつ敷く（下の furnishTemple）。
  // 壁・襖・障子
  for (const [ax, az, bx, bz, kind, doors] of H.walls) {
    const alongX = Math.abs(bz - az) < 1e-3;
    const a = alongX ? ax : az, b = alongX ? bx : bz, fix = alongX ? az : ax;
    const at = (s) => (alongX ? [s, fix] : [fix, s]);
    const gaps = doors.map(([m, w]) => [m - w / 2, m + w / 2]).sort((p, q) => p[0] - q[0]);
    for (const [g0, g1] of gaps) hall.doors.push({ x: at((g0 + g1) / 2)[0], z: at((g0 + g1) / 2)[1], w: g1 - g0, alongX });
    const runs = [];
    let s = a;
    for (const [g0, g1] of gaps) { if (g0 - s > 0.05) runs.push([s, g0]); s = g1; }
    if (b - s > 0.05) runs.push([s, b]);
    const L = b - a, mid = (a + b) / 2;
    const bx3 = (len, h, yy, m, hex, mk = 'wood', th = 0.14) => { const [px, pz] = at(m); put(mk, alongX ? pb(len, h, th, px, y + yy, pz, hex) : pb(th, h, len, px, y + yy, pz, hex)); };
    // 小壁（鴨居の上）と鴨居は口の上にも通す
    const top = kind === 'wall' ? 1.95 : 1.8;
    { const [px, pz] = at(mid); const hh = H.H - top, th = kind === 'wall' ? 0.14 : 0.1; put('plaster', alongX ? wb(L, hh, th, px, y + top + hh / 2, pz, 0xc2bcab, 0.72) : wb(th, hh, L, px, y + top + hh / 2, pz, 0xc2bcab, 0.72)); }
    // 欄間：襖と障子の上は、細い縦の桟を並べて抜く
    if (kind !== 'wall' && H.H - top > 0.4) for (let k = a + 0.3; k < b - 0.2; k += 0.22) bx3(0.035, H.H - top - 0.08, top + (H.H - top) / 2, k, 0x2c2016, 'wood', 0.13);
    // 長押（なげし）：柱の間を渡る横木
    bx3(L, 0.13, top - 0.14, mid, 0x4a3826, 'wood', 0.2);
    { const [px, pz] = at(mid); bb(alongX ? L : 0.14, H.H - top, alongX ? 0.14 : L, px, y + top + (H.H - top) / 2, pz); }
    bx3(L, 0.1, top + 0.05, mid, 0x3a2a1c, 'wood', 0.16);
    put('wood', pb(0.18, H.H, 0.18, at(a)[0], y + H.H / 2, at(a)[1], 0x4a3826));
    put('wood', pb(0.18, H.H, 0.18, at(b)[0], y + H.H / 2, at(b)[1], 0x4a3826));
    solidCircle(at(a)[0], at(a)[1], .09); solidCircle(at(b)[0], at(b)[1], .09);
    for (const [r0, r1] of runs) {
      const len = r1 - r0, m = (r0 + r1) / 2;
      const [p0x, p0z] = at(r0), [p1x, p1z] = at(r1);
      put('wood', pb(0.16, H.H, 0.16, p0x, y + H.H / 2, p0z, 0x4a3826)); put('wood', pb(0.16, H.H, 0.16, p1x, y + H.H / 2, p1z, 0x4a3826));
      solidCircle(p0x, p0z, .08); solidCircle(p1x, p1z, .08);
      if (kind === 'wall') {
        bx3(len, 0.9, 0.45, m, 0x4a3a2a, 'wood');
        { const [px, pz] = at(m); put('plaster', alongX ? wb(len, 1.05, 0.14, px, y + 0.9 + 0.525, pz, 0xcfc9b8, 0.3) : wb(0.14, 1.05, len, px, y + 0.9 + 0.525, pz, 0xcfc9b8, 0.3)); }
        bx3(len, 0.08, 0.94, m, 0x2c2016, 'wood', 0.19);   // 腰長押（板壁と白壁の境）
        bx3(len, 0.12, 0.06, m, 0x2c2016, 'wood', 0.19);   // 幅木
        { const [px, pz] = at(m); bb(alongX ? len : 0.14, top, alongX ? 0.14 : len, px, y + top / 2, pz); }
        solidSeg(p0x, p0z, p1x, p1z, 0.1);
        for (let k = Math.ceil((r0 + 2.7) / 2.7) * 2.7; k < r1 - 0.8; k += 2.7) { const [qx, qz] = at(k); put('wood', pb(0.15, H.H, 0.15, qx, y + H.H / 2, qz, 0x4a3826)); }
      } else {
        // 一枚ずつ（幅 0.9 前後に割る）。当たりも一枚ずつ（破れたら消す）
        const n = Math.max(1, Math.round(len / 0.9)), pw = len / n;
        for (let i = 0; i < n; i++) {
          const c0 = r0 + i * pw, c1 = c0 + pw, [qx, qz] = at((c0 + c1) / 2), [sx0, sz0] = at(c0), [sx1, sz1] = at(c1);
          const p = { kind, hall: H.id, x: qx, z: qz, y: y + 0.08, rot: alongX ? 0 : Math.PI / 2, sx: pw / 0.9, alive: true, solid: solidSeg(sx0, sz0, sx1, sz1, 0.06) };
          T.panels.push(p); hall.panels.push(p);
        }
        bx3(len, 0.06, 0.1, m, 0x3a2a1c, 'wood', 0.12);   // 敷居
      }
    }
  }
  // 縁側（板と、軒を支える柱）
  if (H.engawa === 's') { put('wood', pb(H.x1 - H.x0, 0.06, 1.3, cx, y + 0.03, H.z1 + 0.65, 0x3a2a1c)); put('wood', planks(H.x0, H.z1, H.x1, H.z1 + 1.3, y + 0.075, false, 0x6a5238)); for (let x = H.x0; x <= H.x1 + 0.01; x += 3) put('wood', pb(0.14, H.H, 0.14, x, y + H.H / 2, H.z1 + 1.25, 0x4a3826)); }
  if (H.engawa === 'e') { put('wood', pb(1.2, 0.06, H.z1 - H.z0, H.x1 + 0.6, y + 0.03, cz, 0x3a2a1c)); put('wood', planks(H.x1, H.z0, H.x1 + 1.2, H.z1, y + 0.075, true, 0x6a5238)); for (let z = H.z0; z <= H.z1 + 0.01; z += 3) put('wood', pb(0.14, H.H, 0.14, H.x1 + 1.15, y + H.H / 2, z, 0x4a3826)); }
  // 中の道具
  INTERIOR[H.id](put, y, hall);
  hall.decor = furnishTemple(rt, H, y);
  if (H.id === 'goten') solidRect(-72.5, 91.5, 3, .85, Math.PI / 2);
  // 屋根（入母屋に見える寄棟。この建物だけの形にして、中にいる間は隠す）
  const ex = (H.x1 - H.x0) / 2 + 1.5, ez = (H.z1 - H.z0) / 2 + 1.5;
  const rf = paintGeo(hipGeo(ex, ez, ez * 0.62, H.H + 0.05, Math.max(0.6, ex - ez * 0.9)), 0xffffff); rf.translate(cx, y, cz);
  rec.dist = 'roof_' + H.id; put('tile', rf);
  // 軒の裏の板（下から見て屋根の中が抜けないように）
  put('wood', pb(H.x1 - H.x0 + 2.8, 0.06, H.z1 - H.z0 + 2.8, cx, y + H.H + 0.06, cz, 0x3a2c20));
  rec.dist = 'hall';
  if (blk.length) {
    const bm = new THREE.Mesh(mergeGeometries(blk), G.proxyMat);
    bm.userData.camBlock = true; bm.matrixAutoUpdate = false; bm.updateMatrix();
    rt.scene.add(bm); hall.blk = bm;
  }
  return hall;
}

// 部屋の中の道具（当たりは大きな物だけ）
const INTERIOR = {
  hondo(put, y) {
    // 須弥壇と本尊、内陣の柱
    put('wood', pb(2.6, 0.9, 5, -60, y + 0.45, 46, 0x2a1a12)); put('wood', pb(2.2, 0.25, 4.4, -60, y + 1.02, 46, 0x8a6a2a));
    put('plain', pcyl(0.42, 1.0, -60.3, y + 1.15, 46, 0xa8862e, 10)); put('plain', pb(0.5, 0.55, 0.5, -60.3, y + 2.4, 46, 0xa8862e));
    { const g = new THREE.CylinderGeometry(0.9, 0.9, 0.05, 14); g.rotateZ(Math.PI / 2); g.translate(-61.1, y + 2.5, 46); put('plain', paintGeo(g, 0x8a6a2a)); }   // 光背
    solidRect(-60, 46, 2.7, 5.1);
    for (const [x, z] of [[-58, 42.4], [-58, 49.6], [-52, 42.4], [-52, 49.6]]) { put('wood', pcyl(0.17, 3.4, x, y, z, 0x5a3e2a)); solidCircle(x, z, 0.2); }
  },
  goten(put, y) {
    // 信長の居室：床の間・掛軸・屏風・寝具・燭台・刀掛け
    futon(put, -68.6, y + 0.07, 91.4, 0, 0x4a2a2a);
    put('wood', pb(0.5, 0.35, 0.18, -70.3, y + 0.25, 84.2, 0x2a1c14)); put('wood', pb(0.9, 0.04, 0.04, -70.3, y + 0.46, 84.2, 0x1a1210));
    // 控えの間：槍立て（武具置き場）
    put('wood', pb(0.12, 1.6, 2.4, -57.4, y + 0.8, 91.5, 0x3a2a1c));
    for (let i = 0; i < 6; i++) put('wood', pcyl(0.02, 2.8, -57.55, y + 0.1, 90.5 + i * 0.4, 0x5a4230, 5));
    // 広間：上段の間（低い一段）
    put('plain', pb(2.6, 0.1, 10.6, -50.4, y + 0.11, 89.1, 0xa8a070));
  },
  shukuboA(put, y) {
    [[-40.5, 68, 0.2], [-40.5, 72.4, -0.15], [-35, 72.4, 0.1]].forEach(([x, z, r], i) => futon(put, x, y + 0.07, z, r, [0x33405a, 0x4a5a46, 0x5a4a38][i]));
  },
};

// 毎コマ：屋根の出し入れ・燃える建物の口を塞ぐ・熱
export function teraTick(rt, T, dt) {
  const P = rt.player && rt.player.u;
  if (!P) return;
  const px = P.pos.x, pz = P.pos.z;
  for (const h of T.halls) {
    const inside = px > h.x0 - 0.3 && px < h.x1 + 0.3 && pz > h.z0 - 0.3 && pz < h.z1 + 0.3;
    h.inside = inside;
    if (h.roof) h.roof.visible = !inside || h.rec.state === 2;
    if (h.ceiling) h.ceiling.visible = !inside || h.rec.state === 2;
    if (h.decor) h.decor.visible = h.rec.state !== 2;
  }
  T.heatT = (T.heatT || 0) - dt;
  if (T.heatT > 0) return;
  T.heatT = 0.5;
  for (const h of T.halls) {
    const r = h.rec;
    // よく燃えている建物：口を塞ぐ（自分が中にいる間は待つ）、襖は燃えて消える
    if (r.state >= 1 && r.burnT > 40 && !h.blocked && !h.inside) {
      h.blocked = true;
      for (const d of h.doors) solidSeg(d.alongX ? d.x - d.w / 2 : d.x, d.alongX ? d.z : d.z - d.w / 2, d.alongX ? d.x + d.w / 2 : d.x, d.alongX ? d.z : d.z + d.w / 2, 0.12);
      for (const p of h.panels) breakPanel(rt, p, true);
    }
    if (r.state === 1 && r.burnT > 22 && h.inside && P.alive) heat(rt, P);
  }
  // 屋根だけの廊（回廊・渡り廊下）と宿坊：燃えていれば熱で近寄れない
  for (const r of T.G.recs) {
    if (r.state !== 1 || r.burnT < 8 || r.kind === 'hall') continue;
    const rot = r.rot || 0, c = Math.cos(rot), s = Math.sin(rot), dx = px - r.x, dz = pz - r.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < r.w / 2 + 0.8 && Math.abs(lz) < r.d / 2 + 0.8 && P.alive) heat(rt, P);
  }
}
function heat(rt, P) {
  P.hp = Math.max(0, P.hp - P.maxHp * 0.035);
  if (P.hp <= 0) rt.army.kill(P, null);
  if (rt.t - (rt.flags.heatSaidT || -99) > 8) { rt.flags.heatSaidT = rt.t; rt.bark('火の中じゃ！　ここは通れぬ。外へ出よ', true); }
}
const BROKEN_PANEL = new THREE.Matrix4().makeScale(0, 0, 0);
// 襖・障子を一枚破る（quiet：燃えて消える時は音を出さない）
export function breakPanel(rt, p, quiet) {
  if (!p || !p.alive) return false;
  p.alive = false;
  for (const m of p.meshes) { m.setMatrixAt(p.i, BROKEN_PANEL); m.instanceMatrix.needsUpdate = true; }
  const s = p.solid; s.x0 = s.x1 = s.z0 = s.z1 = 1e9;
  if (!quiet) rt.army.play('wood', { x: p.x, z: p.z }, 0.9);
  return true;
}
// 近くの襖を破る（自分の一振り・敵の突き破り）。破った数を返す
export function breakNear(rt, T, x, z, r, max = 2, dir = null) {
  let n = 0;
  for (const p of T.panels) {
    if (!p.alive || n >= max) continue;
    const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
    if (d > r) continue;
    if (dir && d > 0.3 && (dx * dir.x + dz * dir.z) / d < 0.3) continue;
    if (breakPanel(rt, p)) n++;
  }
  return n;
}
// 中のある建物の中か（どの建物か）
export function hallAt(T, x, z) { return T.halls.find((h) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) || null; }
