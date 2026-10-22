// ======================================================================
// honno_tera.js … 天正十年（1582）の本能寺（油小路蛸薬師の旧地）の境内。足軽の流れの舞台（docs/honnoji-1582-spec.md）
//   ・ゾーン：外周（築地・四つの門）／前面（表門・表庭・前の宿坊）／中心（本堂・中庭）／居住（信長の御殿）／
//     周辺宿坊（宿坊・庫裏）／裏手（物置・井戸・細い道・裏門）／庭園（中庭・回廊）
//   ・近くで通る建物（本堂・御殿・宿坊）は中まで作る：襖で区切った部屋・廊下・縁側・広間・信長の居室。
//     屋根は中にいる間だけ隠し、天井は残す。襖と障子は一枚ずつ破れる（InstancedMesh の一つを消す）
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
  // 堀の斜面を壁扱いで透かさず、土橋の両脇の地面を残す。
  W.terrain.material.userData.camNearSolid = true;
  const attrs = old.attributes, pos = attrs.position;
  // 描画用の索引は視点で間引かれる。削る前の全ての面から堀を作る。
  const idx = old.userData.terrainViewIndex
    ? new THREE.BufferAttribute(old.userData.terrainViewIndex, 1) : old.index;
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
// 本能寺の三基だけ、開いた火袋・傾いた笠・宝珠を付ける。形は一度作って既存のまとまりへ積む。
let TERA_LANTERN = null;
function teraLantern(G, x, z) {
  if (!TERA_LANTERN) {
    const parts = [pb(0.6, 0.18, 0.6, 0, 0.09, 0, 0x7e7a70),
      pb(0.46, 0.12, 0.46, 0, 1.09, 0, 0x898478),
      pb(0.52, 0.1, 0.52, 0, 1.5, 0, 0x898478),
      pb(0.25, 0.24, 0.25, 0, 1.3, 0, 0x302d27)];
    const stem = new THREE.CylinderGeometry(0.105, 0.14, 0.86, 8);
    stem.translate(0, 0.61, 0); parts.push(paintGeo(stem, 0x8a857a));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      parts.push(pb(0.075, 0.3, 0.075, sx * 0.2, 1.3, sz * 0.2, 0x969085));
    const cap = new THREE.CylinderGeometry(0.16, 0.62, 0.24, 4);
    cap.rotateY(Math.PI / 4); cap.translate(0, 1.69, 0); parts.push(paintGeo(cap, 0x7a766c));
    const jewel = new THREE.SphereGeometry(0.09, 8, 6);
    jewel.scale(1, 1.35, 1); jewel.translate(0, 1.91, 0); parts.push(paintGeo(jewel, 0x8e897e));
    TERA_LANTERN = mergeGeometries(parts);
    for (const g of parts) g.dispose();
  }
  const rec = { id: 'toro', kind: 'toro', hist: 'GAME_C', dist: 'near', ranges: [], state: 0, noBurn: true, x, z, w: 1, d: 1 };
  const g = TERA_LANTERN.clone(); g.translate(x, G.W.heightAt(x, z), z);
  G._push(rec, 'plain', g); G.recs.push(rec);
  solidCircle(x, z, 0.25);
}
// 漆喰の壁の箱：絵は一枚を実寸で貼る（横は3mで一回り、縦は v0 から h/3）。上の小壁は v0=0.72（軒下の煤）、胸の高さは 0.3
const wb = (w, h, d, x, y, z, hex, v0 = 0.3) => {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k, [a, b] = dims[f]; uv.setXY(i, uv.getX(i) * a / 3 + (x * 0.37 + z * 0.53), v0 + uv.getY(i) * Math.min(0.28, b / 3.6)); }
  g.translate(x, y, z); return paintGeo(g, hex);
};
// 本能寺の壁の絵：寺の古い漆喰。canvas の縦 0〜143 が小壁（上ほど煤）、215〜358 が胸の高さの壁（下ほど泥はね）。
// 小さな染みと鏝の跡を残し、縁をぼかす。
let TERA_PLASTER = null;
function teraPlasterMat() {
  if (TERA_PLASTER) return TERA_PLASTER;
  const S = 512, cv = document.createElement('canvas'), hv = document.createElement('canvas'); cv.width = cv.height = hv.width = hv.height = S;
  const g = cv.getContext('2d'), hg = hv.getContext('2d');
  let seed = 4417; const R = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  g.fillStyle = '#b4ac98'; g.fillRect(0, 0, S, S); hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  g.filter = 'blur(3px)';
  for (let i = 0; i < 340; i++) { const v = 150 + R() * 50; g.fillStyle = `rgba(${v},${v - 4},${v - 22},0.12)`; g.beginPath(); g.ellipse(R() * S, R() * S, 4 + R() * 20, 2 + R() * 7, R() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(70,60,46,${0.03 + R() * 0.04})`; g.beginPath(); g.ellipse(R() * S, R() * S, 1 + R() * 4, 1 + R() * 2, R() * 3, 0, 7); g.fill(); }
  g.filter = 'none';
  // 鏝の跡（起伏）
  for (let i = 0; i < 200; i++) { hg.fillStyle = `rgba(${R() < 0.5 ? '100,100,100' : '170,170,170'},0.2)`; hg.beginPath(); hg.ellipse(R() * S, R() * S, 18 + R() * 50, 3 + R() * 6, (R() - 0.5) * 0.5, 0, 7); hg.fill(); }
  g.filter = 'blur(3px)';
  // 雨だれの筋：長押の下（215）と小壁の下（143）から垂れる
  for (const y0 of [215, 143, 0]) for (let i = 0; i < 16; i++) {
    let x = R() * S; const l = 8 + R() * 24, w = 0.6 + R() * 1, a0 = 0.025 + R() * 0.025;
    for (let yy = 0; yy < l; yy += 3) { x += (R() - 0.5) * 0.9; const f = 1 - yy / l; g.fillStyle = `rgba(52,44,34,${a0 * f})`; g.fillRect(x, y0 + yy, w * (0.5 + f * 0.5), 3); }
  }
  // 軒下の煤（天井際は黒く）
  const soot = g.createLinearGradient(0, 0, 0, 150); soot.addColorStop(0, 'rgba(30,26,22,0.12)'); soot.addColorStop(0.5, 'rgba(36,30,24,0.04)'); soot.addColorStop(1, 'rgba(40,34,26,0.015)'); g.fillStyle = soot; g.fillRect(0, 0, S, 150);
  const sootB = g.createLinearGradient(0, 215, 0, 260); sootB.addColorStop(0, 'rgba(36,30,24,0.06)'); sootB.addColorStop(1, 'rgba(36,30,24,0)'); g.fillStyle = sootB; g.fillRect(0, 215, S, 45);
  // 足もとの泥はねと湿り
  const mud = g.createLinearGradient(0, 290, 0, 358); mud.addColorStop(0, 'rgba(70,56,38,0)'); mud.addColorStop(1, 'rgba(70,56,38,0.08)'); g.fillStyle = mud; g.fillRect(0, 290, S, 68);
  for (let i = 0; i < 1500; i++) { const y = 358 - Math.pow(R(), 2) * 90, s = 0.6 + R() * 2; g.fillStyle = `rgba(${70 + R() * 30},${56 + R() * 20},${38 + R() * 10},${0.025 + R() * 0.035})`; g.beginPath(); g.ellipse(R() * S, y, s, s * 0.7, 0, 0, 7); g.fill(); }
  // 大きな欠けと白い縁は破れた紙に見えるため、小さく淡い染みにする。
  const chip = (x, y, w, h) => {
    g.save(); g.translate(x, y); g.scale(w * 0.35, h * 0.35);
    const stain = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    stain.addColorStop(0, 'rgba(93,81,61,0.22)');
    stain.addColorStop(0.5, 'rgba(93,81,61,0.015)');
    stain.addColorStop(1, 'rgba(93,81,61,0)');
    g.fillStyle = stain; g.fillRect(-1, -1, 2, 2); g.restore();
  };
  chip(70, 262, 22, 12); chip(190, 300, 12, 20); chip(320, 235, 16, 9); chip(420, 285, 26, 13); chip(260, 75, 14, 8);
  // 罅
  for (let i = 0; i < 18; i++) {
    let x = R() * S, y = (R() < 0.5 ? 140 : 215) + R() * 130; g.strokeStyle = 'rgba(90,82,66,0.045)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += (R() - 0.5) * 22; y += R() * 14; g.lineTo(x, y); } g.stroke();
  }
  const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  TERA_PLASTER = new THREE.MeshStandardMaterial({ vertexColors: true, map: mk(cv, true), bumpMap: mk(hv, false), bumpScale: 0.008, roughness: 0.95, metalness: 0 });
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
// walls：[ax, az, bx, bz, 種, 口]。種 'wall'（腰板と白壁）'fusuma'（襖）'shoji'（障子）'koshi'（格子戸）。口は [線の上の真ん中, 幅]
// floors：[x0, z0, x1, z1, 'tatami'|'ita']。engawa：縁側の辺（'s' など）
const HALLS = [
  // 本堂の西の口（渡り廊下へ）と内陣の格子戸の口は三歩ほど。上様と供が並んで抜けられる幅にする。
  { id: 'hondo', name: '本堂', x0: -63, x1: -47, z0: 40, z1: 52, H: 3.4, flam: 0.5, dur: 120, engawa: 'e',
    walls: [[-63, 40, -47, 40, 'wall', [[-56, 2.4]]], [-63, 52, -47, 52, 'wall', [[-50, 2.4], [-60, 2.2]]],
      [-47, 40, -47, 52, 'shoji', [[42.6, 2], [46, 2.4], [49.4, 2]]], [-63, 40, -63, 52, 'wall', [[46, 3]]],
      [-56, 40, -56, 52, 'koshi', [[43, 3], [49, 3.2]]]],
    floors: [[-63, 40, -56, 52, 'tatami'], [-56, 40, -47, 52, 'ita']] },
  { id: 'goten', name: '書院', x0: -73, x1: -49, z0: 80.2, z1: 95, H: 2.9, flam: 0.7, dur: 95, engawa: 's',
    walls: [[-73, 80.2, -49, 80.2, 'wall', [[-71, 1.8], [-68, 2], [-52, 2.8]]], [-73, 95, -49, 95, 'shoji', [[-69, 1.8], [-61, 1.8], [-53, 1.8]]],
      [-49, 80.2, -49, 95, 'wall', [[88, 2]]], [-73, 80.2, -73, 95, 'wall', [[89.3, 1.6]]],
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
  { id: 'kairo1', kind: 'roka', earthen: true, x: -45, z: 64.75, w: 2.6, d: 24.5 },          // 回廊（南へ）
  { id: 'kairo2', kind: 'roka', earthen: true, x: -51.5, z: 77, w: 2.6, d: 13, rot: Math.PI / 2 },   // 回廊（西へ）
  { id: 'watari', kind: 'roka', earthen: true, x: -68, z: 66.5, w: 2.4, d: 28 },             // 渡り廊下（本堂→御殿）
  { id: 'soshido', kind: 'do', x: -61, z: 58.5, w: 5, d: 4, h: 3, hist: 'HIST_B' },        // 祖師堂（日蓮の像を祀る。境内の脇の小さな堂）
  { id: 'kyakuden', kind: 'do', x: -55, z: 101.5, w: 6, d: 4, h: 2.8, hist: 'HIST_B' },     // 客殿（来客を通す建物。御殿の南）
  { id: 'sobo_f1', kind: 'lite', x: -64, z: 100.5, w: 5, d: 3.5, var: 1, lite: true },   // 南の小さな僧坊
  { id: 'sobo_f2', kind: 'lite', x: -72, z: 100.5, w: 4, d: 3.5, var: 2, lite: true },
  // 西の区画（内の塀の西）：北に講堂、南に馬舎。縄張りの考証図に沿う推定の配置
  { id: 'kodo', kind: 'kodo', x: -118, z: 10, w: 14, d: 9, h: 4.2, hist: 'HIST_B' },        // 講堂
  { id: 'umaya', kind: 'sobo', x: -128, z: 97, w: 15, d: 5, var: 2 },                        // 馬舎（茅葺きの長い厩）
  { id: 'hojo', name: '方丈', label: '方丈', kind: 'do', interiorKind: 'goten', profile: 'honnoji_hojo', enterable: true, x: -112, z: 50, w: 12, d: 9, h: 3.4, hist: 'HIST_B' }, // 方丈（住持の座敷と来客の広間。間取りは推定）
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

// 本能寺の火だけ、加算の白い芯をやめる。材質・時刻・風・板の形は使い回す。
function honnoFireStyle(W) {
  if (W.honnoFireStyled) return;
  W.honnoFireStyled = true;
  const add = W.addFire.bind(W);
  let mat = null;
  W.addFire = (x, z, o) => {
    const f = add(x, z, o);
    if (!mat) {
      const old = f.flame.material;
      // 近い火の板だけ幅と高さを抑える。火元・延焼・既存の火の粉は変えない。
      const vertexShader = old.vertexShader.replace('vec4 mv = viewMatrix * vec4(wp, 1.0);', `
        float closeFire = smoothstep(1.5, 7.0, length(c - cameraPosition));
        vec3 root = c - vec3(0.0, sy * 0.5, 0.0);
        wp = root + (wp - root) * vec3(mix(0.42, 0.8, closeFire), mix(0.65, 1.0, closeFire), mix(0.42, 0.8, closeFire));
        vec4 mv = viewMatrix * vec4(wp, 1.0);`);
      mat = new THREE.ShaderMaterial({ uniforms: old.uniforms, vertexShader,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
        blending: THREE.NormalBlending, toneMapped: false,
        fragmentShader: `uniform float uT; uniform float fogFar; uniform float uNight;
          varying vec2 vUv; varying float vSeed; varying float vDist;
          void main() {
            float t = uT * 1.7 + vSeed * 27.0;
            float h = vUv.y;
            float fire = 0.0;
            // 根元で重なる舌を、上へ流れる揺らぎでほぐす。細い三角の列にしない。
            for (int i = 0; i < 3; i++) {
              float k = float(i);
              float top = 0.58 + 0.12 * k + 0.08 * sin(t + k * 2.7);
              float sway = sin(t * (1.1 + k * 0.2) - h * 9.0 + k * 3.0) * h * 0.09;
              float center = 0.28 + k * 0.22 + sway;
              float ripple = 0.78 + 0.22 * sin(h * 19.0 - t * 2.1 + k * 2.4);
              float width = 0.23 * pow(max(0.0, 1.0 - h / top), 0.65) * ripple;
              float tongue = 1.0 - smoothstep(width * 0.15, width + 0.035, abs(vUv.x - center));
              tongue *= 1.0 - smoothstep(top - 0.15, top, h);
              fire = max(fire, tongue);
            }
            float flow = 0.68 + 0.32 * sin(h * 23.0 - t * 2.6 + sin(vUv.x * 17.0 + t));
            float a = fire * flow * smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.65, 0.96, h));
            float reach = mix(max(20.0, fogFar), max(260.0, fogFar), uNight);
            // 目の前では薄め、橙の面で兵や戸口を覆わない。
            a *= exp(-vDist / reach * 1.1) * mix(0.22, 0.58, smoothstep(0.8, 5.0, vDist));
            if (a < 0.004) discard;
            // 根元は橙、先は黄。白を足さず、上は薄れて既存の煙へつながる。
            vec3 col = mix(vec3(1.0, 0.16, 0.015), vec3(1.0, 0.58, 0.035), smoothstep(0.12, 0.72, h) * flow);
            gl_FragColor = vec4(col, a);
          }` });
    }
    f.flame.material = f.inner.material = mat;
    for (const m of f.flame.children) if (m.isMesh) m.material = mat;
    return f;
  };
}

// 境内を作る。戻り値 T：G（Garan）・fire・halls・panels・gate structs・tick
export function buildTera(rt) {
  const W = rt.world, F = rt.flags;
  honnoFireStyle(W);
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
  for (const [x, z] of [[-48.5, 60], [-60, 72], [-55, 57]]) teraLantern(G, x, z);
  // ---- 中のある建物 ----
  for (const H of HALLS) T.halls.push(buildHall(rt, G, H, T));
  G.finish();
  // 火と煙の起点は推定の棟高でなく、完成した屋根の一番高い所に合わせる。
  // 宿坊は葺き方ごとに高さが違う。設営時に一度だけ測り、延焼中は同じ値を使う。
  for (const r of G.recs) {
    if (!r.flam || r.noBurn) continue;
    let top = r.y0, nearest = Infinity;
    const angle = r.rot || 0, c = Math.cos(angle), sn = Math.sin(angle);
    const tx = r.x + r.w * .32 * c + r.d * .28 * sn, tz = r.z - r.w * .32 * sn + r.d * .28 * c;
    for (const range of r.ranges) {
      const pos = range.b.mesh.geometry.attributes.position;
      for (let j = range.start; j < range.start + range.count; j++) {
        top = Math.max(top, pos.getY(j));
        if (range.b.mk !== 'tile' && range.b.mk !== 'thatch' && range.b.mk !== 'ita') continue;
        const d = (pos.getX(j) - tx) ** 2 + (pos.getZ(j) - tz) ** 2;
        if (d < nearest) { nearest = d; r.fireRoof = { x: pos.getX(j), y: pos.getY(j) - .12, z: pos.getZ(j) }; }
      }
    }
    if (top > r.y0) r.top = top - r.y0;
  }
  { const pb2 = G.buckets.get('hall|plaster'); if (pb2 && pb2.mesh) pb2.mesh.material = teraPlasterMat(); }   // 寺の古い漆喰の絵（城の白壁は新しすぎて白く飛ぶ）
  // 当たりは軽い箱で調べ、描く壁・柱・格子は共通の処理で目の近くの面だけ薄くする。
  for (const b of G.buckets.values()) if (b.mesh) {
    b.mesh.userData.camNear = true;
    // 回廊・渡り廊下の瓦も視点を止める。室内棟だけでは軒を抜けて本人の脚を隠す。
    if (b.mk === 'tile') b.mesh.userData.camBlock = true;
  }
  for (const h of T.halls) {
    const b = G.buckets.get('roof_' + h.id + '|tile'), ceiling = G.buckets.get('ceiling_' + h.id + '|wood');
    h.roof = b && b.mesh; h.ceiling = ceiling && ceiling.mesh;
    // 瓦の面でカメラを止め、屋根越しに本人の腰や脚を隠さない。
    if (h.roof) h.roof.userData.camBlock = true;
  }
  // ---- 共通の襖と障子。一枚を破ると、絵・枠・引き手と当たりを一緒に消す ----
  T.inst = {};
  const panelMats = new Map();
  const panelCamGeo = new THREE.BoxGeometry(0.9, 1.8, 0.08);
  for (const kind of ['fusuma', 'shoji', 'koshi']) {
    const list = T.panels.filter((p) => p.kind === kind);
    // 購入した襖は紙と縁と引き手が一枚の絵。材質を替えるだけでは丸や裂け目が残る。
    // この寺は既存の別部品で紙・縁・引き手を分け、清める処理を紙だけへ届かせる。
    const meshes = panelInstances(kind === 'fusuma' ? 'fusumaE' : kind, list.length);
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
      p.meshes = meshes; p.i = i; Q.setFromAxisAngle(Y, p.rot); S.set(p.sx, p.sy, 1); Pv.set(p.x, p.y, p.z); M.compose(Pv, Q, S);
      for (const m of meshes) m.setMatrixAt(i, M);
      Pv.y += 0.9 * p.sy; M.compose(Pv, Q, S); cameraPanels.setMatrixAt(i, M);
    });
    meshes.push(cameraPanels);
    for (const p of list) p.cam = cameraPanels;
    for (const m of meshes) {
      m.userData.camNear = true;
      m.count = list.length; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); rt.scene.add(m);
    }
    T.inst[kind] = meshes;
  }
  addSlidingDoors(rt, T);
  // ---- 火（建物ごとに燃え、近い棟へ少しずつ燃え移る。燃え移りは遅めにして、段で火をかける） ----
  T.fire = makeTempleFire(rt, G, {
    // 画質「低」（携帯）は炎の板と煙の柱を減らす（寺の中は近くに大きな煙の粒が重なって重い）
    rate: 0.3, flames: 4, smokes: 8,
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
  for (const [a, b, c, d, k] of H.floors) if (k === 'ita') put('ita', pb(c - a - 0.04, 0.05, d - b - 0.04, (a + c) / 2, y + 0.07, (b + d) / 2, 0xa48b68));
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
    // 兜と掲げた腕が横木へ重ならない戸口。戸も同じ高さへ揃える。
    const top = 2.15;
    { const [px, pz] = at(mid); const hh = H.H - top, th = kind === 'wall' ? 0.14 : 0.1; put('plaster', alongX ? wb(L, hh, th, px, y + top + hh / 2, pz, 0xc2bcab, 0.72) : wb(th, hh, L, px, y + top + hh / 2, pz, 0xc2bcab, 0.72)); }
    // 欄間：襖と障子の上は、細い縦の桟を並べて抜く
    if (kind !== 'wall' && H.H - top > 0.4) for (let k = a + 0.3; k < b - 0.2; k += 0.22) bx3(0.035, H.H - top - 0.08, top + (H.H - top) / 2, k, 0x2c2016, 'wood', 0.13);
    // 長押は鴨居より上。戸口へ垂れ下がる横木で兜と庭の兵を隠さない。
    bx3(L, 0.13, top + 0.14, mid, 0x4a3826, 'wood', 0.2);
    // 戸口を抜ける視点も、目の高さの横木へ入り込ませない。
    { const [px, pz] = at(mid); bb(alongX ? L : 0.2, 0.13, alongX ? 0.2 : L, px, y + top + 0.14, pz); }
    { const [px, pz] = at(mid); bb(alongX ? L : 0.14, H.H - top, alongX ? 0.14 : L, px, y + top + (H.H - top) / 2, pz); }
    bx3(L, 0.1, top + 0.05, mid, 0x3a2a1c, 'wood', 0.16);
    put('wood', pb(0.18, H.H, 0.18, at(a)[0], y + H.H / 2, at(a)[1], 0x4a3826));
    put('wood', pb(0.18, H.H, 0.18, at(b)[0], y + H.H / 2, at(b)[1], 0x4a3826));
    solidCircle(at(a)[0], at(a)[1], .09); solidCircle(at(b)[0], at(b)[1], .09);
    for (const end of [a, b]) { const [px, pz] = at(end); bb(0.18, H.H, 0.18, px, y + H.H / 2, pz); }
    for (const [r0, r1] of runs) {
      const len = r1 - r0, m = (r0 + r1) / 2;
      const [p0x, p0z] = at(r0), [p1x, p1z] = at(r1);
      put('wood', pb(0.16, H.H, 0.16, p0x, y + H.H / 2, p0z, 0x4a3826)); put('wood', pb(0.16, H.H, 0.16, p1x, y + H.H / 2, p1z, 0x4a3826));
      solidCircle(p0x, p0z, .08); solidCircle(p1x, p1z, .08);
      bb(0.16, H.H, 0.16, p0x, y + H.H / 2, p0z); bb(0.16, H.H, 0.16, p1x, y + H.H / 2, p1z);
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
          const p = { kind, hall: H.id, x: qx, z: qz, y: y + 0.08, rot: alongX ? 0 : Math.PI / 2, sx: pw / 0.9, sy: (top - 0.08) / 1.8, alive: true, solid: solidSeg(sx0, sz0, sx1, sz1, 0.06),
            // 引き戸：隣の一枚の前へ滑らせて開ける（二枚一組。端の一枚は内へ寄せる）
            pw, ax: alongX ? 1 : 0, az: alongX ? 0 : 1, slide: n === 1 ? 1 : i % 2 === 0 ? (i + 1 < n ? 1 : -1) : -1, depth: i % 2 === 0 ? 0.045 : -0.045, open: 0, want: 0 };
          T.panels.push(p); hall.panels.push(p);
        }
        bx3(len, 0.06, 0.1, m, 0x3a2a1c, 'wood', 0.12);   // 敷居
      }
    }
  }
  // 縁側（板と、軒を支える柱）
  // 縁側の床縁と柱も、壁と同じ当たりへまとめる（兵の通行の当たりは変えない）。
  if (H.engawa === 's') {
    put('wood', pb(H.x1 - H.x0, 0.06, 1.3, cx, y + 0.03, H.z1 + 0.65, 0x3a2a1c));
    put('wood', planks(H.x0, H.z1, H.x1, H.z1 + 1.3, y + 0.075, false, 0x6a5238));
    bb(H.x1 - H.x0, 0.1, 1.3, cx, y + 0.05, H.z1 + 0.65);
    for (let x = H.x0; x <= H.x1 + 0.01; x += 3) {
      put('wood', pb(0.14, H.H, 0.14, x, y + H.H / 2, H.z1 + 1.25, 0x4a3826));
      solidCircle(x, H.z1 + 1.25, 0.1);
      bb(0.14, H.H, 0.14, x, y + H.H / 2, H.z1 + 1.25);
    }
  }
  if (H.engawa === 'e') {
    put('wood', pb(1.2, 0.06, H.z1 - H.z0, H.x1 + 0.6, y + 0.03, cz, 0x3a2a1c));
    put('wood', planks(H.x1, H.z0, H.x1 + 1.2, H.z1, y + 0.075, true, 0x6a5238));
    bb(1.2, 0.1, H.z1 - H.z0, H.x1 + 0.6, y + 0.05, cz);
    for (let z = H.z0; z <= H.z1 + 0.01; z += 3) {
      put('wood', pb(0.14, H.H, 0.14, H.x1 + 1.15, y + H.H / 2, z, 0x4a3826));
      solidCircle(H.x1 + 1.15, z, 0.1);
      bb(0.14, H.H, 0.14, H.x1 + 1.15, y + H.H / 2, z);
    }
  }
  // 中の道具
  INTERIOR[H.id](put, y, hall);
  // 内陣の丸柱も、壁と同じ一つの当たりへまとめる。
  if (H.id === 'hondo') for (const [x, z] of [[-58, 42.4], [-58, 49.6], [-52, 42.4], [-52, 49.6]]) bb(0.4, H.H, 0.4, x, y + H.H / 2, z);
  hall.decor = furnishTemple(rt, H, y);
  // 床の間は西の口（z 88.5〜90.1）の脇を空けて置く。口の半分を塞ぐと、体が通れない。
  if (H.id === 'goten') solidRect(-72.5, 91.9, 3, .85, Math.PI / 2);
  // 屋根（入母屋に見える寄棟。この建物だけの形にして、中にいる間は隠す）
  const ex = (H.x1 - H.x0) / 2 + 1.5, ez = (H.z1 - H.z0) / 2 + 1.5;
  const rf = paintGeo(hipGeo(ex, ez, ez * 0.62, H.H + 0.05, Math.max(0.6, ex - ez * 0.9)), 0xffffff); rf.translate(cx, y, cz);
  rec.dist = 'roof_' + H.id; put('tile', rf);
  // 屋根は歩く床にしない。軒より上だけを塞ぎ、下の縁側・戸口は通す。
  hall.roofSolid = solidRect(cx, cz, ex * 2, ez * 2);
  hall.roofSolid.yBot = y + H.H - 0.6;
  // 天井は屋根と別のまとまり。低画質も一棟一描画で、下面を閉じる。
  rec.dist = 'ceiling_' + H.id;
  put('wood', pb(H.x1 - H.x0 + 2.8, 0.06, H.z1 - H.z0 + 2.8, cx, y + H.H + 0.06, cz, 0x3a2c20));
  // 天井板（室内だけ明るい杉板。軒の裏は暗いまま）と、壁際を回る回縁
  put('wood', pb(H.x1 - H.x0, 0.03, H.z1 - H.z0, cx, y + H.H + 0.015, cz, H.id === 'hondo' ? 0x6e5638 : 0x8a7252));
  for (const z of [H.z0 + 0.06, H.z1 - 0.06]) put('wood', pb(H.x1 - H.x0, 0.1, 0.1, cx, y + H.H - 0.04, z, 0x2e2016));
  for (const x of [H.x0 + 0.06, H.x1 - 0.06]) put('wood', pb(0.1, 0.1, H.z1 - H.z0, x, y + H.H - 0.04, cz, 0x2e2016));
  if (H.id === 'hondo') {
    // 格天井：太い格縁を一間の四分の一（約0.75m）ごとに縦横に組む。内陣（須弥壇の上）は格間に金の板
    const g = 0.75;
    for (let x = H.x0 + g; x < H.x1 - 0.1; x += g) put('wood', pb(0.08, 0.1, H.z1 - H.z0, x, y + H.H - 0.035, cz, 0x2a1c12));
    for (let z = H.z0 + g; z < H.z1 - 0.1; z += g) put('wood', pb(H.x1 - H.x0, 0.1, 0.08, cx, y + H.H - 0.035, z, 0x2a1c12));
    for (let x = H.x0 + g / 2; x < -56; x += g) for (let z = H.z0 + g / 2; z < H.z1; z += g)
      put('wood', pb(g - 0.12, 0.012, g - 0.12, x, y + H.H + 0.0, z, (Math.round(x / g) + Math.round(z / g)) % 2 ? 0x9a7a3a : 0x8a6c34));
  } else {
    // 竿縁天井：細い竿縁を一尺五寸（約0.45m）ごとに、部屋の短い向きへ渡す
    for (let x = H.x0 + 0.45; x < H.x1 - 0.1; x += 0.45) put('wood', pb(0.035, 0.04, H.z1 - H.z0, x, y + H.H - 0.005, cz, 0x4a3624));
  }
  // 梁（三メートルごと。竿縁・格縁より太い）と、軒の垂木
  for (let z = H.z0 + 3; z < H.z1 - 0.5; z += 3)
    put('wood', pb(H.x1 - H.x0, 0.2, 0.18, cx, y + H.H - 0.13, z, 0x493321));
  for (let x = H.x0 - 1; x <= H.x1 + 1; x += 0.75) for (const z of [H.z0 - 0.7, H.z1 + 0.7])
    put('wood', pb(0.07, 0.1, 1.4, x, y + H.H - 0.02, z, 0x493321));
  rec.dist = 'hall';
  // 梁の下へ余裕を取ってカメラを寄せる。壁と同じ軽い当たりに一枚だけ追加。
  bb(H.x1 - H.x0 + 2.8, 0.3, H.z1 - H.z0 + 2.8, cx, y + H.H - 0.05, cz);
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
    // 須弥壇（框・腰・上框の三段。腰は黒漆に金の格狭間）と本尊・光背
    put('wood', pb(2.8, 0.22, 5.2, -60, y + 0.11, 46, 0x1e140e));                 // 下框
    put('wood', pb(2.4, 0.5, 4.8, -60, y + 0.47, 46, 0x241812));                  // 腰
    for (const z of [44.2, 46, 47.8]) put('plain', pb(0.02, 0.3, 1.2, -58.79, y + 0.47, z, 0x5e4a22));   // 格狭間の金の縁
    put('wood', pb(2.8, 0.14, 5.2, -60, y + 0.79, 46, 0x1e140e));                 // 上框
    put('wood', pb(2.2, 0.25, 4.4, -60, y + 0.98, 46, 0x5e4a22));                  // 壇上（金）
    // 本尊は東向きの坐像。本堂を作る時だけ形を組み、既存のまとまりへ積む。
    { const cx = -60.3, cz = 46, OLD = 0x5e4a22, DIM = 0x49391e, LIT = 0x76602e;
      const round = new THREE.SphereGeometry(1, 16, 10);
      const curl = new THREE.SphereGeometry(1, 6, 4);
      const oval = (sx, sy, sz, dx, dy, dz, hex = OLD, rx = 0, source = round) => {
        const g = source.clone(); g.scale(sx, sy, sz); g.rotateX(rx);
        g.translate(cx + dx, y + dy, cz + dz); put('plain', paintGeo(g, hex));
      };
      // 蓮台の座：平たい八角を重ね、上へ向かってすぼめる。
      for (let k = 0; k < 3; k++) {
        const r = 0.73 - k * 0.07, g = new THREE.CylinderGeometry(r - 0.04, r, 0.09, 8);
        g.rotateY(Math.PI / 8); g.translate(cx, y + 1.15 + k * 0.09, cz);
        put('plain', paintGeo(g, k === 1 ? LIT : OLD));
      }
      // 組んだ膝と足先。左右に広い輪郭で、座った姿を出す。
      oval(0.37, 0.16, 0.42, 0.12, 1.49, -0.29, OLD, -0.12);
      oval(0.37, 0.16, 0.42, 0.12, 1.49, 0.29, OLD, 0.12);
      oval(0.15, 0.065, 0.25, 0.36, 1.55, -0.08, LIT, -0.18);
      oval(0.15, 0.065, 0.25, 0.29, 1.6, 0.1, OLD, 0.18);
      const body = new THREE.CylinderGeometry(0.25, 0.39, 0.72, 16);
      body.scale(0.83, 1, 1); body.translate(cx - 0.04, y + 1.92, cz);
      put('plain', paintGeo(body, OLD));                              // 衣をまとった胴
      oval(0.23, 0.14, 0.37, -0.025, 2.19, 0);                     // なだらかな肩
      for (const side of [-1, 1]) {
        oval(0.14, 0.27, 0.14, 0, 1.99, side * 0.35, OLD, side * 0.3);
        oval(0.15, 0.13, 0.16, 0.04, 1.79, side * 0.42);            // 肘
        oval(0.13, 0.11, 0.25, 0.19, 1.7, side * 0.25, OLD, -side * 0.3);
        oval(0.13, 0.055, 0.13, 0.29, 1.67 + (side + 1) * 0.025, side * 0.07, LIT); // 膝上の手
        oval(0.06, 0.13, 0.065, 0, 2.54, side * 0.205);            // 長い耳
      }
      put('plain', pcyl(0.11, 0.15, cx, y + 2.26, cz, OLD, 12));  // 首
      oval(0.205, 0.25, 0.205, 0, 2.56, 0);                     // 頭
      oval(0.055, 0.085, 0.045, 0.19, 2.55, 0, LIT);            // 鼻
      for (const side of [-1, 1]) oval(0.016, 0.012, 0.045, 0.185, 2.6, side * 0.08, DIM); // 伏せた目
      oval(0.018, 0.012, 0.045, 0.198, 2.47, 0, DIM);           // 口
      oval(0.115, 0.09, 0.115, -0.015, 2.8, 0, DIM);            // 頂の盛り上がり
      for (let row = 0; row < 3; row++) {
        const a = 0.4 + row * 0.37, count = 8 + row * 2;
        for (let k = 0; k < count; k++) {
          const t = (k + row * 0.5) / count * Math.PI * 2;
          oval(0.035, 0.035, 0.035, Math.sin(a) * Math.cos(t) * 0.205,
            2.56 + Math.cos(a) * 0.25, Math.sin(a) * Math.sin(t) * 0.205, DIM, 0, curl); // 螺髪
        }
      }
      round.dispose(); curl.dispose();
      const halo = new THREE.CylinderGeometry(0.87, 0.87, 0.045, 32);
      halo.rotateZ(Math.PI / 2); halo.translate(cx - 0.48, y + 2.08, cz);
      put('plain', paintGeo(halo, DIM));                          // 光背の円盤
      const rim = new THREE.TorusGeometry(0.855, 0.025, 6, 32);
      rim.rotateY(Math.PI / 2); rim.translate(cx - 0.45, y + 2.08, cz);
      put('plain', paintGeo(rim, LIT));                           // 少し明るい縁
    }
    solidRect(-60, 46, 2.9, 5.3);
    // 来迎柱（朱塗り）と、柱の間の欄間に渡す虹梁
    for (const z of [43.2, 48.8]) { put('wood', pcyl(0.15, 3.4, -61.6, y, z, 0x8a2a1a)); solidCircle(-61.6, z, 0.17); }
    put('wood', pb(0.22, 0.32, 5.8, -61.6, y + 3.0, 46, 0x7a2416));
    // 天蓋：八角の笠（くすんだ古い金箔）に、透かし彫りの帯（小さな板を間をあけて並べ、上下に框）。
    // 八つの角から華鬘、縁から瓔珞（細い糸に玉を通した垂れ飾り）を長さ違いで垂らす。吊り金具で天井から下げる
    { const cx0 = -60.2, cz0 = 46, top = y + 3.12, R = 0.92, OLD = 0x5e4a22, DIM = 0x3e301a, LIT = 0x76602e;
      const lid = new THREE.CylinderGeometry(R * 0.55, R, 0.14, 8); lid.rotateY(Math.PI / 8); lid.translate(cx0, top, cz0); put('wood', paintGeo(lid, OLD));
      const rimT = new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.035, 8); rimT.rotateY(Math.PI / 8); rimT.translate(cx0, top - 0.09, cz0); put('wood', paintGeo(rimT, LIT));
      const rimB = new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.035, 8); rimB.rotateY(Math.PI / 8); rimB.translate(cx0, top - 0.33, cz0); put('wood', paintGeo(rimB, LIT));
      const back = new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.2, 8, 1, true); back.rotateY(Math.PI / 8); back.translate(cx0, top - 0.21, cz0); put('wood', paintGeo(back, DIM));
      for (let k = 0; k < 32; k++) {   // 透かしの桟（間から暗い裏が見える）
        const a = (k + 0.5) / 32 * Math.PI * 2, g = new THREE.BoxGeometry(0.035, 0.2, 0.025);
        g.rotateY(-a); g.translate(cx0 + Math.cos(a) * R, top - 0.21, cz0 + Math.sin(a) * R); put('wood', paintGeo(g, k % 2 ? OLD : LIT));
      }
      for (let k = 0; k < 8; k++) {   // 角の華鬘（団扇形の飾り板）
        const a = k / 8 * Math.PI * 2, g = new THREE.CylinderGeometry(0.11, 0.11, 0.02, 10);
        g.rotateZ(Math.PI / 2); g.rotateY(-a); g.translate(cx0 + Math.cos(a) * (R + 0.04), top - 0.45, cz0 + Math.sin(a) * (R + 0.04)); put('wood', paintGeo(g, OLD));
      }
      for (let k = 0; k < 24; k++) {   // 瓔珞：糸と三つの玉
        const a = (k + 0.5) / 24 * Math.PI * 2, len = 0.35 + (k % 3) * 0.12, px = cx0 + Math.cos(a) * (R - 0.02), pz = cz0 + Math.sin(a) * (R - 0.02);
        put('wood', pb(0.012, len, 0.012, px, top - 0.35 - len / 2, pz, DIM));
        for (let q = 1; q <= 3; q++) put('wood', pb(0.035, 0.035, 0.035, px, top - 0.35 - len * q / 3, pz, q === 3 ? 0x6a3a2a : LIT));
      }
      put('wood', pb(0.03, 0.3, 0.03, cx0, top + 0.14, cz0, DIM));   // 吊り金具
    }
    // 幡（左右に垂らす錦の旗）
    for (const z of [43.6, 48.4]) { put('plain', pb(0.04, 1.5, 0.34, -59.2, y + 2.45, z, 0x6a2a3a)); put('plain', pb(0.05, 0.08, 0.4, -59.2, y + 3.25, z, 0x5e4a22)); }
    // 前卓（仏前の机）：香炉・一対の燭台と花瓶（三具足・五具足）
    put('wood', pb(0.55, 0.06, 1.6, -58.2, y + 0.8, 46, 0x2a1810));
    for (const z of [45.3, 46.7]) for (const x of [-58.42, -57.98]) put('wood', pb(0.06, 0.78, 0.06, x, y + 0.39, z, 0x2a1810));
    put('plain', pcyl(0.12, 0.14, -58.2, y + 0.83, 46, 0x6a5a3a, 10));        // 香炉
    for (const z of [45.55, 46.45]) { put('plain', pcyl(0.025, 0.38, -58.2, y + 0.83, z, 0x8a7a50, 6)); put('plain', pb(0.05, 0.08, 0.05, -58.2, y + 1.25, z, 0xd8b070)); }   // 燭台
    for (const z of [45.1, 46.9]) { put('plain', pcyl(0.07, 0.24, -58.2, y + 0.83, z, 0x7a6a40, 8)); put('plain', pb(0.16, 0.3, 0.16, -58.2, y + 1.2, z, 0x3e5a2a)); }   // 花瓶と樒
    solidRect(-58.2, 46, 0.6, 1.7);
    // 礼盤（導師の座る台）と経机・磬
    put('wood', pb(0.8, 0.3, 0.8, -57.2, y + 0.15, 46, 0x2a1810)); put('plain', pb(0.7, 0.05, 0.7, -57.2, y + 0.32, 46, 0x5a2a2a));
    put('wood', pb(0.4, 0.3, 0.7, -57.2, y + 0.15, 47.1, 0x2a1810));
    put('plain', pb(0.04, 0.2, 0.35, -57.2, y + 0.75, 44.9, 0x5a4a2a)); put('wood', pb(0.05, 0.6, 0.05, -57.2, y + 0.3, 44.75, 0x2a1810)); put('wood', pb(0.05, 0.6, 0.05, -57.2, y + 0.3, 45.05, 0x2a1810));
    // 内陣の柱（外陣との境の四本と、外陣の中ほど）
    for (const [x, z] of [[-58, 42.4], [-58, 49.6], [-52, 42.4], [-52, 49.6]]) { put('wood', pcyl(0.17, 3.4, x, y, z, 0x5a3e2a)); solidCircle(x, z, 0.2); }
    // 外陣の入口の鰐口（頭の上。通り道は塞がない）
    put('plain', pcyl(0.18, 0.12, -47.6, y + 2.4, 46, 0x7a6a40, 10));
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
    if (h.roofSolid) h.roofSolid.yTop = h.rec.state === 2 ? -1e6 : null;
    if (h.roof) h.roof.visible = !inside || h.rec.state === 2;
    if (h.ceiling) h.ceiling.visible = h.rec.state !== 2;
    if (h.blk) h.blk.visible = h.rec.state !== 2;
    if (h.decor) h.decor.visible = h.rec.state !== 2;
  }
  if (T.sliding.size) slideTick(rt, T, dt);
  T.heatElapsed = (T.heatElapsed || 0) + dt;
  if (T.heatElapsed < 0.5) return;
  const elapsed = T.heatElapsed;
  T.heatElapsed = 0;
  let warmth = 0;
  for (const h of T.halls) {
    const r = h.rec;
    // よく燃えている建物：口を塞ぐ（自分が中にいる間は待つ）、襖は燃えて消える
    // 上様（T.keepUnits）が中にいる棟と、いま退く道の棟（T.keepOpen）は口を塞がない。塞ぐと燃える堂の中で動けなくなる。
    const kept = !!(T.keepUnits && T.keepUnits.some((k) => k.alive && k.pos.x > h.x0 - 0.3 && k.pos.x < h.x1 + 0.3 && k.pos.z > h.z0 - 0.3 && k.pos.z < h.z1 + 0.3)) || !!T.keepOpen?.(h);
    if (r.state >= 1 && r.burnT > 40 && !h.blocked && !h.inside && !kept) {
      h.blocked = true;
      for (const d of h.doors) solidSeg(d.alongX ? d.x - d.w / 2 : d.x, d.alongX ? d.z : d.z - d.w / 2, d.alongX ? d.x + d.w / 2 : d.x, d.alongX ? d.z : d.z + d.w / 2, 0.12);
      for (const p of h.panels) breakPanel(rt, p, true);
    }
    if (r.state === 1 && r.burnT > 22 && h.inside) warmth = 1;
  }
  // 回廊などは近づくほど熱い。棟の重なりで傷みを足さず、一番熱い所だけ拾う。
  for (const r of T.G.recs) {
    if (r.state !== 1 || r.burnT < 8 || r.kind === 'hall') continue;
    const rot = r.rot || 0, c = Math.cos(rot), s = Math.sin(rot), dx = px - r.x, dz = pz - r.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const distance = Math.hypot(Math.max(0, Math.abs(lx) - r.w / 2), Math.max(0, Math.abs(lz) - r.d / 2));
    if (distance >= 2.4) continue;
    // 隣の回廊の熱を、白壁や閉じた襖の向こうの部屋まで通さない。
    // 開いた戸口と、燃えている回廊そのものの熱は残す。
    if (distance > 0) {
      const probe = T.heatProbe || (T.heatProbe = { x: 0, y: 0, z: 0 });
      const ex = Math.max(-r.w / 2, Math.min(r.w / 2, lx));
      const ez = Math.max(-r.d / 2, Math.min(r.d / 2, lz));
      probe.x = r.x + ex * c + ez * s; probe.z = r.z - ex * s + ez * c; probe.y = P.pos.y;
      if (rt.army.wallBetween(P.pos, -1, probe)) continue;
    }
    warmth = Math.max(warmth, Math.max(0, 1 - distance / 2.4));
  }
  // 今いる所の熱さ（0〜1）。熱から抜ける向きを決める時に読む。
  T.heatWarm = warmth;
  if (P.alive) heat(rt, T, P, warmth, elapsed);
}
function heat(rt, T, P, warmth, elapsed) {
  // 離れると熱が抜ける。既存の煙は残し、毎コマの素材作りや画面の点滅は増やさない。
  T.heatExposure = warmth > 0 ? (T.heatExposure || 0) + elapsed * warmth : Math.max(0, (T.heatExposure || 0) - elapsed * 3);
  if (warmth <= 0) return;
  // 28歩ほどの渡り廊下を通常の速さで抜ける約9秒は、体力の約18％。
  // 初めの8秒は毎秒2％まで。居続けると、12秒かけて毎秒3.5％まで増す。
  const rate = 0.02 + 0.015 * Math.min(1, Math.max(0, T.heatExposure - 8) / 12);
  const damage = Math.min(P.hp, P.maxHp * rate * warmth * elapsed);
  P.hp = Math.max(0, P.hp - damage);
  if (damage > 0) {
    rt.stats.taken += damage;
    rt.stats.fireTaken = (rt.stats.fireTaken || 0) + damage;
    // 敵の直前の一撃を火傷の原因と取り違えない。記録の入れ物は使い回す。
    const hit = rt.player.lastHit || (rt.player.lastHit = {});
    hit.kind = 'fire'; hit.type = 'fire'; hit.name = '寺の火'; hit.t = rt.t; hit.amount = damage;
    hit.ranged = false; hit.mounted = false; hit.back = false; hit.side = false;
    hit.guardBroken = false; hit.exhausted = false; hit.mobbed = false; hit.blocked = false;
  }
  rt.hud?.hurt(0.7);
  if (rt.t - (rt.flags.heatSaidT ?? -99) >= 8) { rt.flags.heatSaidT = rt.t; rt.bark('熱い！　急いで抜けよう', true); }
  if (P.hp <= 0) rt.army.kill(P, null);
}
const BROKEN_PANEL = new THREE.Matrix4().makeScale(0, 0, 0);
// ---- 引き戸（襖・障子）：近づくと「開ける」の札。押すと隣の一枚の前へ横に滑る ----
const SL = { M: new THREE.Matrix4(), Q: new THREE.Quaternion(), S: new THREE.Vector3(), P: new THREE.Vector3(), Y: new THREE.Vector3(0, 1, 0) };
function panelPose(p) {
  const k = p.open, e = k * k * (3 - 2 * k), off = e * p.pw * 0.96 * p.slide, dep = e * p.depth;
  SL.Q.setFromAxisAngle(SL.Y, p.rot); SL.S.set(p.sx, p.sy, 1);
  SL.P.set(p.x + p.ax * off + p.az * dep, p.y, p.z + p.az * off + p.ax * dep);
  SL.M.compose(SL.P, SL.Q, SL.S);
  for (const m of p.meshes) {
    if (m === p.cam) { SL.P.y += 0.9 * p.sy; SL.M.compose(SL.P, SL.Q, SL.S); SL.P.y -= 0.9 * p.sy; }
    m.setMatrixAt(p.i, SL.M); m.instanceMatrix.needsUpdate = true;
    if (m === p.cam) SL.M.compose(SL.P, SL.Q, SL.S);
  }
}
function solidOff(p) {
  const s = p.solid;
  if (!p.saved) p.saved = { x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 };
  s.x0 = s.x1 = s.z0 = s.z1 = 1e9;
}
function addSlidingDoors(rt, T) {
  T.sliding = new Set();
  let pick = null;
  const it = { label: '戸を開ける' };
  // 札の位置：遊び手から一・四メートル内で、正面に近い生きた一枚（毎コマ一度だけ探す）
  let pickT = -1;
  const find = () => {
    if (pickT === rt.t) return pick;
    pickT = rt.t; pick = null;
    const P = rt.player && rt.player.u;
    if (!P || !P.alive || P.mounted) return null;
    let bd = Infinity;
    const fx = Math.sin(rt.player.yaw), fz = Math.cos(rt.player.yaw);
    for (const p of T.panels) {
      if (!p.alive || Math.abs(P.pos.y - p.y) > 1.2) continue;
      const slide = p.open * p.open * (3 - 2 * p.open);
      const cx = p.x + p.ax * p.pw * 0.96 * p.slide * slide + p.az * p.depth * slide;
      const cz = p.z + p.az * p.pw * 0.96 * p.slide * slide + p.ax * p.depth * slide;
      const dx = cx - P.pos.x, dz = cz - P.pos.z, d = Math.hypot(dx, dz);
      if (d >= 1.4) continue;
      // 廊下を向いている時、横の襖の札で接近戦を隠さない。
      // 戸の面へ向き、正面の一枚を見た時だけ操作できる。
      if (Math.abs(fx * p.az + fz * p.ax) < 0.65) continue;
      if (d > 0.25 && dx * fx + dz * fz < d * 0.65) continue;
      // 重なった開き戸より、目の前の閉じた戸を選ぶ。背中の戸を閉じて退路を塞がない。
      const score = d + (p.want ? 0.45 : 0) + (dx * fx + dz * fz < 0 ? 0.5 : 0);
      if (score < bd) { bd = score; pick = p; }
    }
    if (pick) it.label = pick.want ? '戸を閉める' : '戸を開ける';
    return pick;
  };
  rt.addInteract('naka_tobira', () => find(), '戸を開ける', () => {
    const p = find();
    if (!p) return;
    p.want = p.want ? 0 : 1;
    if (p.want) solidOff(p);
    T.sliding.add(p);
    rt.army.play('wood', { x: p.x, z: p.z }, 0.35);
  }, { r: 1.5, prio: -3 });
  // 札の字は毎コマ変わる（開ける／閉める）。battle の札の箱を一つ探して、label を差し替える。
  const entry = rt.interacts[rt.interacts.length - 1];
  Object.defineProperty(entry, 'label', { get: () => it.label, configurable: true });
}
// naka_doors と同じく、閉め切る前に戸口の人を調べる。体を挟む当たりを戻さない。
function unitInPanel(p, u) {
  if (!u || !u.alive || Math.abs(u.pos.y - p.y) > 1.2) return false;
  const dx = u.pos.x - p.x, dz = u.pos.z - p.z;
  return Math.abs(dx * p.ax + dz * p.az) < p.pw / 2 + .3
    && Math.abs(dx * p.az - dz * p.ax) < .35;
}
function panelOccupied(rt, p) {
  if (unitInPanel(p, rt.player && rt.player.u)) return true;
  for (const u of rt.army.units) if (!u.isStruct && unitInPanel(p, u)) return true;
  return false;
}
function slideTick(rt, T, dt) {
  for (const p of T.sliding) {
    if (!p.alive) { T.sliding.delete(p); continue; }
    if (!p.want && panelOccupied(rt, p)) continue;
    p.open = Math.max(0, Math.min(1, p.open + (p.want ? 1 : -1) * dt * 2.6));
    panelPose(p);
    if (p.open === p.want) {
      T.sliding.delete(p);
      // 閉め切ったら当たりを戻す
      if (!p.want && p.saved) Object.assign(p.solid, p.saved);
    }
  }
}
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
