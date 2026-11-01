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
import { kitReplace, kitDobeiSeg } from './cgt_castle.js';
import { whenCgt, cgtMat } from './cgt.js';
import { S as SETTINGS } from './settings.js';
import { Garan, makeTempleFire } from './temple1571.js';
import { panelInstances, furnishTemple, templeFloorClip } from './interior_parts.js';

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
// 床の板：細い目地で張り、長い板間は木口を千鳥に継ぐ（割付は推定）。
const planks = (x0, z0, x1, z1, y, alongX, hex) => {
  const out = [], n = Math.max(1, Math.round((alongX ? z1 - z0 : x1 - x0) / 0.26)), step = (alongX ? z1 - z0 : x1 - x0) / n;
  const start = alongX ? x0 : z0, end = alongX ? x1 : z1;
  const bays = Math.max(1, Math.ceil((end - start) / 1.91)), pitch = (end - start) / bays, gap = .003;
  for (let i = 0; i < n; i++) {
    const v = 0.88 + ((i * 7) % 5) * 0.035, c = ((hex >> 16 & 255) * v) << 16 | ((hex >> 8 & 255) * v) << 8 | ((hex & 255) * v);
    // 一間以内の縁板は一枚で渡す。短い板まで半枚ずらすと、縁側の途中に不要な継ぎ目ができる。
    // 長い板間だけ継ぎ目を交互にずらし、端材も室内へ納める。既存の床へ一度だけまとめる。
    let a = start;
    for (let j = 0; a < end - gap; j++) {
      const b = Math.min(end, start + (j + (bays > 1 && i % 2 ? .5 : 1)) * pitch);
      out.push(alongX ? pb(b - a - gap, .07, step - gap, (a + b) / 2, y, z0 + step * (i + .5), c)
        : pb(step - gap, .07, b - a - gap, x0 + step * (i + .5), y, (a + b) / 2, c));
      a = b;
    }
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
// 本堂の丸柱は床際を薄い根巻金物で保護する推定の納まり。
// 柱の細りに合わせ、黒い木目を貼らず既存の無地材へまとめる。
// 外径は元の兵・視点の当たりに収め、設営後の処理は増やさない。
function hondoPost(put, r, top, x, base, z, color) {
  const h = top - base, wrapH = .2, thickness = .003;
  put('wood', pcyl(r, h, x, base, z, color));
  const wrap = new THREE.CylinderGeometry(r * (1 - .06 * wrapH / h) + thickness,
    r + thickness, wrapH, 8);
  wrap.translate(x, base + wrapH / 2, z);
  put('plain', paintGeo(wrap, 0x39342d));
}
// 本堂の格縁下面へ桁と来迎柱の斗を当てる。絵と視点の当たりで接合高を共有する（架構は推定）。
const HONDO_FRAME = { beamTop: 3.24, ceilingBottom: 3.3, capitalH: .12 };
// 格縁と吊り仏具は同じ内寸割付を使う。外形からの概算で金具を格間へ浮かせない。
function hondoCeilingGrid(H, x0, x1) {
  const nx = Math.ceil((x1 - x0) / .75), nz = Math.ceil((H.z1 - H.z0) / .75);
  const gx0 = x0 + (x0 === H.x0 ? .11 : .06) - .04;
  const gx1 = x1 - (x1 === H.x1 ? .11 : .06) + .04;
  const gz0 = H.z0 + .07, gz1 = H.z1 - .07;
  return { nx, nz, gx0, gz0, gw: (gx1 - gx0) / nx, gd: (gz1 - gz0) / nz };
}
function hondoHangerX(x) {
  const H = HALLS[0], inner = x < -56;
  const { nx, gx0, gw } = hondoCeilingGrid(H, inner ? H.x0 : -56, inner ? -56 : H.x1);
  return gx0 + Math.max(1, Math.min(nx - 1, Math.round((x - gx0) / gw))) * gw;
}
// ---- 中のある建物（軸に沿った四角。座標は世界の座標） ----
// walls：[ax, az, bx, bz, 種, 口]。種 'wall'（腰板と白壁）'fusuma'（襖）'shoji'（障子）'koshi'（格子戸）。口は [線の上の真ん中, 幅]
// floors：[x0, z0, x1, z1, 'tatami'|'ita']。engawa：縁側の辺（'s' など）
const HALLS = [
  // 本堂の西の口（渡り廊下へ）と内陣の格子戸の口は三歩ほど。上様と供が並んで抜けられる幅にする。
  { id: 'hondo', name: '本堂', x0: -63, x1: -47, z0: 40, z1: 52, H: 3.4, flam: 0.5, dur: 120, engawa: 'e',
    // 軒柱は三つの障子口の正面を避け、両端と戸口の脇で桁を受ける（柱割りは推定）。
    engawaPosts: [40, 41.3, 44.2, 47.8, 50.7, 52],
    // 北の口は外陣側へ寄せる。内陣境の端柱（-56, 40）を戸口の中央へ立てず、
    // 柱と格子戸を残したまま、板戸二枚の引き代と二・四メートルの開口を確保する（位置は推定）。
    walls: [[-63, 40, -47, 40, 'wall', [[-53.5, 2.4]]], [-63, 52, -47, 52, 'wall', [[-50, 2.4], [-60, 2.2]]],
      [-47, 40, -47, 52, 'shoji', [[42.6, 2], [46, 2.4], [49.4, 2]]], [-63, 40, -63, 52, 'wall', [[46, 3]]],
      [-56, 40, -56, 52, 'koshi', [[43, 3], [49, 3.2]]]],
    floors: [[-63, 40, -56, 52, 'tatami'], [-56, 40, -47, 52, 'ita']] },
  { id: 'goten', name: '書院', x0: -73, x1: -49, z0: 80.2, z1: 95, H: 2.9, flam: 0.7, dur: 95, engawa: 's',
    // 南の三つの障子口を空け、座敷の境と戸口の脇へ軒柱をそろえる（柱割りは推定）。
    engawaPosts: [-73, -70.2, -67.8, -65, -62.2, -59.8, -57, -54.2, -51.8, -49],
    walls: [[-73, 80.2, -49, 80.2, 'wall', [[-71, 1.8], [-68, 2], [-52, 2.8]]], [-73, 95, -49, 95, 'shoji', [[-69, 1.8], [-61, 1.8], [-53, 1.8]]],
      [-49, 80.2, -49, 95, 'wall', [[88, 2]]], [-73, 80.2, -73, 95, 'wall', [[89.3, 1.6]]],
      [-73, 83.2, -49, 83.2, 'fusuma', [[-70.6, 1.6], [-67, 1.8], [-62, 1.8], [-54, 1.8]]],
      [-65, 83.2, -65, 95, 'fusuma', [[89, 1.8]]], [-57, 83.2, -57, 95, 'fusuma', [[89, 1.8]]],
      [-69.4, 83.2, -69.4, 88.2, 'fusuma', [[86.6, 1.3]]], [-73, 88.2, -69.4, 88.2, 'fusuma', []]],
    // 廊下は三メートル。壁の厚みと体の幅を引いても一・五メートル以上通れる。
    // 畳の割付は襖の内側ごとに止める。奥の納戸は板敷きとする（間取りは推定）。
    floors: [[-73, 80.2, -49, 83.2, 'ita'], [-73, 83.2, -69.4, 88.2, 'ita'],
      [-73, 88.2, -69.4, 95, 'tatami'], [-69.4, 83.2, -65, 95, 'tatami'],
      [-65, 83.2, -57, 95, 'tatami'], [-57, 83.2, -49, 95, 'tatami']] },
  { id: 'shukuboA', name: '宿坊', x0: -42, x1: -33, z0: 66, z1: 74, H: 2.6, flam: 1, dur: 55,
    // 南の戸口を東の座敷の中へ納める。襖の突き当たる柱を開口内へ残さず、
    // 開いた二枚の障子も同じ座敷側へ引き込む（間取りは推定）。
    walls: [[-42, 66, -33, 66, 'wall', [[-35.5, 1.8]]], [-42, 74, -33, 74, 'shoji', [[-35.5, 1.6]]],
      [-42, 66, -42, 74, 'wall', [[70, 1.8]]], [-33, 66, -33, 74, 'wall', []], [-38.5, 66, -38.5, 74, 'fusuma', [[70, 1.6]]],
      // 西口にも一・五メートルの板間を取り、僧の寝所とは引き違い障子で分ける（推定）。
      // 表口と襖の口を同じ通りへそろえ、既存の開閉・破損・延焼の仕組みを使う。
      [-40.5, 66, -40.5, 74, 'shoji', [[70, 1.8]]],
      [-38.5, 68, -33, 68, 'shoji', [[-35.5, 2.2]]]],
    // 西口・北口は板間から座敷へ上がる。畳と竿縁天井の割付も障子の境で止める。
    floors: [[-42, 66, -40.5, 74, 'ita'], [-40.5, 66, -38.5, 74, 'tatami'],
      [-38.5, 66, -33, 68, 'ita'], [-38.5, 68, -33, 74, 'tatami']] },
];
// Garan で作る伽藍。入れる棟は共通の室内を使い、残りは外観と屋根だけの廊。
const GARAN = [
  { id: 'soboN', name: '表の宿坊', label: '表の宿坊', kind: 'sobo', profile: 'honnoji_sobo', enterable: true, x: -38, z: 36, w: 8, d: 6, var: 0 }, // 板敷きの入口と僧の座敷。間取りは推定
  { id: 'soboB', name: '奥の宿坊', label: '奥の宿坊', kind: 'sobo', profile: 'honnoji_sobo', enterable: true, x: -37.5, z: 84, w: 8, d: 6, var: 1 }, // 共通の出入り・障子を使う
  { id: 'kuri', name: '庫裏', kind: 'kuri', profile: 'honnoji_kuri', enterable: true, x: -38, z: 94, w: 8, d: 6 }, // 炊事の土間と配膳の板間（推定）
  { id: 'kura', name: '物置', kind: 'kura', profile: 'honnoji_kura', enterable: true, x: -74, z: 44, w: 3, d: 4 }, // 板戸の奥に道具箱を納める（推定）
  { id: 'naya', name: '納屋', label: '納屋', kind: 'sobo', interiorKind: 'kura', profile: 'honnoji_naya', enterable: true, x: -74, z: 66, w: 3, d: 4, var: 2 }, // 板戸から道具の板間へ入る。間取りは推定
  { id: 'shoro', kind: 'shoro', profile: 'honnoji_shoro', x: -57, z: 34, w: 3.2, d: 3.2 }, // 四本柱の間から基壇へ上がれる鐘楼（細部は推定）
  { id: 'kairo1', kind: 'roka', profile: 'honnoji_kairo', earthen: true, x: -45, z: 64.75, w: 2.6, d: 24.5 },          // 回廊（南へ）
  { id: 'kairo2', kind: 'roka', profile: 'honnoji_kairo', earthen: true, x: -51.5, z: 77, w: 2.6, d: 13, rot: Math.PI / 2 },   // 回廊（西へ）
  { id: 'watari', kind: 'roka', profile: 'honnoji_kairo', earthen: true, x: -68, z: 66.5, w: 2.4, d: 28 },             // 渡り廊下（本堂→御殿）
  { id: 'soshido', name: '祖師堂', label: '祖師堂', kind: 'do', interiorKind: 'hondo', profile: 'honnoji_soshido', enterable: true, x: -61, z: 58.5, w: 5, d: 4, h: 3, hist: 'HIST_B' }, // 内陣に祖師像を祀る。間取りは推定
  { id: 'kyakuden', name: '客殿', label: '客殿', kind: 'do', interiorKind: 'goten', profile: 'honnoji_kyakuden', enterable: true, x: -55, z: 101.5, w: 6, d: 4, h: 2.8, rot: Math.PI, hist: 'HIST_B' }, // 客殿。北の庭から入る（間取りは推定）
  // 南の小僧坊も北の庭から入る。南向きの登り口を築地へ突き出さない（間取りは推定）。
  { id: 'sobo_f1', name: '南の僧坊', kind: 'sobo', profile: 'honnoji_sobo', enterable: true, x: -64, z: 100.5, w: 5, d: 3.5, rot: Math.PI, var: 1 },
  { id: 'sobo_f2', name: '南の僧坊', kind: 'sobo', profile: 'honnoji_sobo', enterable: true, x: -72, z: 100.5, w: 4, d: 3.5, rot: Math.PI, var: 2 },
  // 西の区画（内の塀の西）：北に講堂、南に馬舎。縄張りの考証図に沿う推定の配置
  { id: 'kodo', name: '講堂', label: '講堂', kind: 'kodo', interiorKind: 'hondo', profile: 'honnoji_kodo', enterable: true, x: -118, z: 10, w: 14, d: 9, h: 4.2, hist: 'HIST_B' }, // 内陣と聴聞の外陣（間取りは推定）
  { id: 'umaya', name: '馬舎', label: '馬舎', kind: 'sobo', interiorKind: 'kura', profile: 'honnoji_umaya', enterable: true, x: -128, z: 97, w: 15, d: 5, rot: Math.PI, var: 2 }, // 北の庭から土間の通路へ。馬房と飼葉桶は推定
  { id: 'hojo', name: '方丈', label: '方丈', kind: 'do', interiorKind: 'goten', profile: 'honnoji_hojo', enterable: true, x: -112, z: 50, w: 12, d: 9, h: 3.4, hist: 'HIST_B' }, // 方丈（住持の座敷と来客の広間。間取りは推定）
  { id: 'kyozo', name: '経蔵', label: '経蔵', kind: 'do', interiorKind: 'kura', profile: 'honnoji_kyozo', enterable: true, x: -98, z: 28, w: 4, d: 4, h: 2.8 }, // 経巻を納める板倉。間取りは推定
  // 西の僧坊も板敷きの入口から入れる。僧の座敷・控えを障子と襖で区切る推定の間取り。
  { id: 'sobo_w1', name: '西の僧坊', kind: 'sobo', profile: 'honnoji_sobo', enterable: true, x: -138, z: 32, w: 8, d: 5, var: 0 },
  { id: 'sobo_w2', name: '西の僧坊', kind: 'sobo', profile: 'honnoji_sobo', enterable: true, x: -138, z: 46, w: 8, d: 5, var: 1 },
  { id: 'sobo_w3', name: '西の僧坊', kind: 'sobo', profile: 'honnoji_sobo', enterable: true, x: -138, z: 60, w: 8, d: 5, var: 2 },
  { id: 'sobo_w4', name: '西の僧坊', kind: 'sobo', profile: 'honnoji_sobo', enterable: true, x: -104, z: 64, w: 8, d: 5, var: 1 },
  { id: 'sobo_w5', name: '西の僧坊', kind: 'sobo', profile: 'honnoji_sobo', enterable: true, x: -118, z: 64, w: 8, d: 5, var: 0 },
  { id: 'kura_w', name: '飼葉と馬具の蔵', kind: 'kura', profile: 'honnoji_umagura', enterable: true, x: -100, z: 97, w: 4, d: 5 }, // 中央の通路を空けて飼葉を積む（推定）
];
// 内の区切りの塀（x）と、その口（z の真ん中）。裏門から御殿への道（z 76〜79）を通す
const INNER_WALL = { x: -84, gate: 79 };
const UMAYA = { x: -128, z: 97 };

// 本能寺の火は共通の火と煙（揺らぐ炎の房・煙の柱）にそろえる（10/31 点付け：独自の平らな炎の板が絵に見えた）。
// 絵（色・揺らぎ・芯）は共通のまま。回廊や縁の火は本人のすぐ脇で燃えるので、目の前の火だけ板の幅と高さを抑え、画面を光る幕でふさがない。
function honnoFireStyle(W) {
  if (W.honnoFireStyled) return;
  W.honnoFireStyled = true;
  const add = W.addFire.bind(W), mats = new Map();
  const near = (old) => {
    let m = mats.get(old);
    if (!m) {
      m = old.clone(); m.uniforms = old.uniforms;
      m.vertexShader = old.vertexShader.replace('vec4 mv = viewMatrix * vec4(wp, 1.0);', `
        float closeFire = smoothstep(2.0, 9.0, length(c - cameraPosition));
        vec3 root = c - vec3(0.0, sy * 0.5, 0.0);
        wp = root + (wp - root) * vec3(mix(0.45, 1.0, closeFire), mix(0.6, 1.0, closeFire), mix(0.45, 1.0, closeFire));
        vec4 mv = viewMatrix * vec4(wp, 1.0);`);
      mats.set(old, m);
    }
    return m;
  };
  W.addFire = (x, z, o) => {
    const f = add(x, z, o);
    f.flame.material = near(f.flame.material); f.inner.material = near(f.inner.material);
    // 大きな火の脇の二枚は、寺の近い火では重なって一つの光る幕に見え、描く回数も増える。外の炎と芯の二枚だけにする。
    if (!o?.torch) for (const m of [...f.flame.children]) if (m.isMesh) f.flame.remove(m);
    return f;
  };
}

// 境内を作る。戻り値 T：G（Garan）・fire・halls・panels・gate structs・tick
export function buildTera(rt) {
  const W = rt.world, F = rt.flags;
  honnoFireStyle(W);
  const G = new Garan(rt);
  const T = { G, halls: [], panels: [], doorWalls: [], doorsBlocked: new Set() };
  buildTeraEarthworks(rt);
  // ---- 築地（四つの門の口を空ける。makeKitBatch でまとめて描く） ----
  const kb = makeKitBatch();
  const { x0, x1, z0, z1 } = TERA;
  const sides = { n: [[x0, z0], [x1, z0]], s: [[x0, z1], [x1, z1]], w: [[x0, z0], [x0, z1]], e: [[x1, z0], [x1, z1]] };
  T.walls = [];
  // 築地の見た目は買った城の部品の土塀（土壁の仕上げ）に替える。当たり・壊れる・火は手作りの形のまま
  // 部品の土塀は面が多い（6m で約七千）。表門の前後だけに絞り、舞台の部品の予算（櫓・家と分け合う）を食い尽くさない
  let kitLen = 0;
  const tsuijiKit = (world, seg, o) => {
    const r = tsuiji(world, seg, o), [sx, sz, ex, ez] = seg, L = Math.hypot(ex - sx, ez - sz);
    if (Math.hypot((sx + ex) / 2 - GATES.main.x, (sz + ez) / 2 - GATES.main.z) > 36 || kitLen + L > 72) return r;
    kitLen += L;
    kitReplace(r, 'tsuchi', (p) => kitDobeiSeg(p, { ax: sx, az: sz, bx: ex, bz: ez, h: o.h || 2.6, yAt: (t) => world.heightAt(sx + (ex - sx) * t, sz + (ez - sz) * t) }));
    return r;
  };
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
      T.walls.push(...wallLine(rt, P, { team: 0, hp: 1e9, name: '築地塀', segLen: 6, mesh: tsuijiKit, meshOpt: { batch: kb } }));
    }
  }
  // 内の区切りの塀（推定）：天文法華の乱の後、寺は要害を兼ねた。西の区画（講堂・馬舎）と東の伽藍を塀で分け、口は一つ。
  for (const P of [[[INNER_WALL.x, TERA.z0], [INNER_WALL.x, INNER_WALL.gate - 9]], [[INNER_WALL.x, INNER_WALL.gate + 9], [INNER_WALL.x, TERA.z1]]]) {
    T.walls.push(...wallLine(rt, P, { team: 0, hp: 1e9, name: '内の塀', segLen: 6, mesh: tsuijiKit, meshOpt: { batch: kb, h: 2.2 } }));
  }
  for (const s of T.walls) { s.noTarget = true; s.wall = true; s.h = 2.6; }
  finalizeKitBatch(rt, kb);
  rt.scene.add(kabukimon(W, INNER_WALL.x, INNER_WALL.gate, 10, Math.PI / 2));
  // 北東の隅の櫓：築地の上から油小路と蛸薬師の通りを見張る（推定）
  rt.scene.add(yagura(W, TERA.x1 - 3.5, TERA.z0 + 3.5));
  // 馬繋ぎを左右へ分け、北向きの馬舎の上り口を縄と当たりで塞がない。
  for (const dx of [-4.25, 4.25]) rt.scene.add(umatsunagi(W, UMAYA.x + dx, UMAYA.z - 4.5, 0, 3.5));
  rt.scene.add(kabukimon(W, GATES.main.x, GATES.main.z, GATES.main.w + 1.4, Math.PI / 2, { doors: !!rt.G.lord }));   // 足軽の流れでは扉を b_honnoji の tobira で開け閉めする（二重の扉を出さない）
  // ---- 共通の室内を持つ棟・外観だけの建物・廊・灯籠 ----
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
  // 区画で分かれた壁すべてへ、同じ古い漆喰の材質を渡す。
  for (const b of G.buckets.values()) if (b.dist === 'hall' && b.mk === 'plaster' && b.mesh) b.mesh.material = teraPlasterMat();
  // 燻し瓦：夜明けの低い空を浅い角度で照り返すと、宿坊の屋根が生成りの布の幕に見えた（10/31）。
  // この寺の瓦だけ、灰の濃い燻しの色・照りの弱い粗さにする（形と瓦の凹凸の絵は共通のまま）。
  const tileMats = new Map();
  for (const b of G.buckets.values()) if (b.mk === 'tile' && b.mesh && !Array.isArray(b.mesh.material)) {
    const old = b.mesh.material;
    if (!tileMats.has(old)) {
      const m = old.clone();
      m.onBeforeCompile = old.onBeforeCompile; m.customProgramCacheKey = old.customProgramCacheKey;
      m.color.setHex(0xa2a6ac); m.roughness = Math.max(m.roughness ?? 0.6, 0.86); m.metalness = 0; m.envMapIntensity = 0.35;
      tileMats.set(old, m);
    }
    b.mesh.material = tileMats.get(old);
  }
  // 当たりは軽い箱で調べ、描く壁・柱・格子は共通の処理で目の近くの面だけ薄くする。
  for (const b of G.buckets.values()) if (b.mesh) {
    b.mesh.userData.camNear = true;
    // 回廊・渡り廊下の瓦も視点を止める。室内棟だけでは軒を抜けて本人の脚を隠す。
    if (b.mk === 'tile') b.mesh.userData.camBlock = true;
  }
  for (const h of T.halls) {
    // 区画をまたぐ棟も、屋根・天井の全片を設営時に一度だけ集める。
    h.roofs = []; h.ceilings = [];
    for (const b of G.buckets.values()) if (b.mesh) {
      if (b.dist === 'roof_' + h.id && b.mk === 'tile') h.roofs.push(b.mesh);
      if (b.dist === 'ceiling_' + h.id && b.mk === 'wood') h.ceilings.push(b.mesh);
    }
    // 瓦の面でカメラを止め、屋根越しに本人の腰や脚を隠さない。
    for (const roof of h.roofs) roof.userData.camBlock = true;
  }
  // 10/31 点付け：本堂・御殿の大屋根が暗い一色の面に見えた。共通の城の部品の瓦（写真の肌）に替える。
  //   部品の材質を一つだけ写して使い回す（絵は部品と同じ物を共有し、新しく読まない）。形・当たり・隠す仕組みは今のまま。
  whenCgt(() => {
    const k = cgtMat('Kawara');
    if (!k) return;
    const m = k.clone(); m.vertexColors = true; m.side = THREE.DoubleSide; m.color.setRGB(0.78, 0.78, 0.8);
    for (const h of T.halls) for (const roof of h.roofs) roof.material = m;
  });
  // ---- 共通の襖と障子。一枚を破ると、絵・枠・引き手と当たりを一緒に消す ----
  T.inst = {};
  const panelMats = new Map();
  const panelCamGeo = new THREE.BoxGeometry(0.9, 1.8, 0.08);
  const panelSizes = new Map();
  for (const p of T.panels) {
    // 同じ寸法はまとめる。座標の引き算の丸め誤差で群れを増やさない。
    const plain = p.kind === 'fusuma' && p.hall === 'shukuboA';
    const key = `${p.kind}:${p.pw.toFixed(6)}:${(p.sy * 1.8).toFixed(6)}:${plain}:${!!p.waist}`;
    if (!panelSizes.has(key)) panelSizes.set(key, []);
    panelSizes.get(key).push(p);
  }
  for (const [key, list] of panelSizes) {
    const kind = list[0].kind;
    // 購入した襖は紙と縁と引き手が一枚の絵。材質を替えるだけでは丸や裂け目が残る。
    // この寺は既存の別部品で紙・縁・引き手を分け、清める処理を紙だけへ届かせる。
    // 共通室内と同じく、敷居から鴨居までの実寸で戸を作る。
    // 幅も実寸で作り、框・組子・引手を横へ伸縮させない。
    // 共通室内と同じ寸法別の形を使い回し、動く時は行列だけを書き換える。
    const panelHeight = list[0].sy * 1.8;
    // 僧の寝所は共通の僧坊と同じ無地の襖にする。書院の絵襖とは群れを分け、
    // 紙・框・引手の形は共通部品を使い、開閉・破損・延焼の仕組みを保つ（意匠は推定）。
    const plain = kind === 'fusuma' && list[0].hall === 'shukuboA';
    // 宿坊の表障子は共通の僧坊と同じ杉の腰板付きにする（造作は推定）。
    // 室内の明かり障子とは群れを分け、戸口の二枚も両脇と同じ造作へそろえる。
    const meshes = panelInstances(kind === 'fusuma' && !plain ? 'fusumaE' : kind, list.length, true, list[0].pw, panelHeight, plain, !!list[0].waist, true);
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
    list.forEach((p, i) => {
      p.meshes = meshes; p.i = i; p.cam = cameraPanels;
    });
    meshes.push(cameraPanels);
    // 共通の naka_doors.js と同じく、開閉両端を含む描画範囲を設営時だけ作る。
    // 初期位置だけで測ると、横へ引いた戸と視点用の箱が画面端で消える。
    const opened = list.map(p => p.open), bounds = meshes.map(() => new THREE.Box3());
    for (const m of meshes) m.count = list.length;
    for (const end of [0, 1]) {
      for (const p of list) { p.open = end; panelPose(p); }
      for (let j = 0; j < meshes.length; j++) {
        meshes[j].computeBoundingBox();
        bounds[j].union(meshes[j].boundingBox);
      }
    }
    for (let j = 0; j < list.length; j++) { list[j].open = opened[j]; panelPose(list[j]); }
    for (let j = 0; j < meshes.length; j++) {
      meshes[j].boundingBox = bounds[j];
      meshes[j].boundingSphere = bounds[j].getBoundingSphere(new THREE.Sphere());
    }
    for (const m of meshes) {
      m.userData.camNear = true;
      m.instanceMatrix.needsUpdate = true; rt.scene.add(m);
    }
    T.inst[key] = meshes;
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
  const blk = [], cameraBoxes = [];
  const bb = (w, h, d, x, yy, z) => {
    cameraBoxes.push(new THREE.Box3(new THREE.Vector3(x - w / 2, yy - h / 2, z - d / 2),
      new THREE.Vector3(x + w / 2, yy + h / 2, z + d / 2)));
    const g = new THREE.BoxGeometry(w, h, d);
    g.deleteAttribute('uv'); g.deleteAttribute('normal'); g.translate(x, yy, z); blk.push(g);
  };
  const hall = { id: H.id, name: H.name, H, rec, cameraBoxes, doors: [], panels: [], x0: H.x0, x1: H.x1, z0: H.z0, z1: H.z1 };
  // 柱脚と幅木は畳・板の仕上げ面から立てる。境では高い側へそろえる（納まりは推定）。
  // 設営時だけ調べ、柱頭・戸口・兵の当たりの幅は変えない。
  const floorFinish = (x, z) => {
    let base = .095;
    for (const [x0, z0, x1, z1, kind] of H.floors)
      if (x >= x0 - .01 && x <= x1 + .01 && z >= z0 - .01 && z <= z1 + .01)
        base = Math.max(base, kind === 'tatami' ? .101 : .095);
    return base;
  };
  const wallTop = (x) => H.id === 'hondo'
    ? Math.abs(x + 56) < .01 ? H.H - .12 : HONDO_FRAME.ceilingBottom
    : H.H - .08;
  // 壁の隅・突き当たりは一本の通し柱を共用する。太い側を残し、同じ面を重ねない。
  const wallPosts = new Map(), plasterHeads = [], wallInfill = [];
  const wallPost = (x, z, width, camera = true) => {
    const key = `${x.toFixed(5)}:${z.toFixed(5)}`, prev = wallPosts.get(key);
    if (prev) { prev.width = Math.max(prev.width, width); prev.camera ||= camera; }
    else wallPosts.set(key, { x, z, width, camera });
  };
  const buildWallPosts = () => {
    for (const { x, z, width, camera } of wallPosts.values()) {
      // 柱頭は天井板まで伸ばさず、回縁の下面へ納める（仕口は推定）。
      // 本堂の内外陣境では、十二センチ成の格縁が柱を受ける。
      // 視点用の箱にも同じ高さを使い、天井際に見えない柱を残さない。
      const postTop = wallTop(x);
      const base = floorFinish(x, z), height = postTop - base, center = y + base + height / 2;
      put('wood', pb(width, height, width, x, center, z, 0x4a3826));
      if (camera) bb(width, height, width, x, center, z);
    }
  };
  // 基壇（石）と床（畳・板）
  // 石の基壇へ木目を貼らない。既存の細粒の石材を束石と共有し、床高と外寸は保つ。
  put('paving', pb(H.x1 - H.x0 + 0.5, 0.3, H.z1 - H.z0 + 0.5, cx, y - 0.1, cz, 0x7e7a70));
  const clearRails = templeFloorClip(H);
  for (const [a, b, c, d, k] of H.floors) if (k === 'ita') {
    // 板の下地は仕上げ面より下へ納め、板目と同じ高さでちらつかせない。
    put('wood', pb(c - a - 0.04, 0.05, d - b - 0.04, (a + c) / 2, y + 0.035, (b + d) / 2, 0x6a5034));
    // 廊下・外陣・納戸は板を割り付け、共通の板材で木目も残す。床の上面は従来どおり。
    // 畳と同じ敷居幅で板端を止め、六ミリの溝を床板で埋めない（納まりは推定）。
    // 元の板目の向き・床高を保ち、形は既存の板材へ設営時にまとめる。
    for (const [x0, x1, z0, z1] of clearRails(a + .02, c - .02, b + .02, d - .02))
      put('ita', planks(x0, z0, x1, z1, y + .06, c - a > d - b, 0xa48b68));
  }
  // 畳は共通部品で一枚ずつ敷く（下の furnishTemple）。
  // 壁・襖・障子
  for (const [ax, az, bx, bz, kind, doors] of H.walls) {
    const alongX = Math.abs(bz - az) < 1e-3;
    const waist = H.id === 'shukuboA' && kind === 'shoji' && (alongX
      ? Math.abs(az - H.z0) < .01 || Math.abs(az - H.z1) < .01
      : Math.abs(ax - H.x0) < .01 || Math.abs(ax - H.x1) < .01);
    const a = alongX ? ax : az, b = alongX ? bx : bz, fix = alongX ? az : ax;
    // 障子の紙は組子の裏へ同じ向きに張る。表口は紙を外、組子を室内へ向ける。
    // 左右の框に手掛けがあるため、襖の引手に合わせて一枚おきに裏返さない。
    const paperFlip = kind === 'shoji' && Math.abs(fix - (alongX ? H.z1 : H.x1)) < .01;
    const at = (s) => (alongX ? [s, fix] : [fix, s]);
    // 閉じた戸の当たりも、中央の壁芯でなく実際の溝へ置く。
    // 前後の引き違い戸・隅の引き込み戸とも、描く框と同じ面で体を止める。
    const panelSolid = (x0, z0, x1, z1, depth) => solidSeg(
      x0 + (alongX ? 0 : depth), z0 + (alongX ? depth : 0),
      x1 + (alongX ? 0 : depth), z1 + (alongX ? depth : 0), .06);
    const gaps = doors.map(([m, w]) => [m - w / 2, m + w / 2]).sort((p, q) => p[0] - q[0]);
    for (const [g0, g1] of gaps) hall.doors.push({ x: at((g0 + g1) / 2)[0], z: at((g0 + g1) / 2)[1], w: g1 - g0, alongX });
    const runs = [];
    let s = a;
    for (const [g0, g1] of gaps) { if (g0 - s > 0.05) runs.push([s, g0]); s = g1; }
    if (b - s > 0.05) runs.push([s, b]);
    const L = b - a, mid = (a + b) / 2;
    const bx3 = (len, h, yy, m, hex, mk = 'wood', th = 0.14) => { const [px, pz] = at(m); put(mk, alongX ? pb(len, h, th, px, y + yy, pz, hex) : pb(th, h, len, px, y + yy, pz, hex)); };
    // 白壁の上は小壁、引き戸の上は透かし欄間。格子の裏を白壁で塞がない。
    // 戸口は壁・襖・障子とも同じ内法高とし、滑る戸の上端を鴨居の下へ揃える。
    // 小壁・欄間も柱頭と同じ回縁下面で止める。本堂の内外陣境は格縁の下面に合わせる。
    // 天井板まで壁を伸ばして木部へ埋めず、視点用の箱も見える上端へそろえる（仕口は推定）。
    const top = 2.15, upper = wallTop(at(mid)[0]);
    if (kind === 'wall') plasterHeads.push({ alongX, a, b, fix, top, upper });
    // 欄間は共通室内と同じく、長押と天井の回縁の間へ枠ごと納める。
    // 下の柱・戸口に合わせて区切り、桟を長押に埋めたり、柱をまたいで通したりしない。
    // 枠と桟は既存の木部へまとめ、開口と引き戸の移動幅は変えない（納まりは推定）。
    if (kind !== 'wall' && upper - top > 0.4) {
      const bottom = top + .235;
      const edges = [a, ...gaps.flat(), b];
      // 内陣境を横切る梁の幅で欄間を分け、框・縦桟を梁の下面へ納める（仕口は推定）。
      // 梁は床から三・〇四〜三・二四メートル。戸口と鴨居の高さは保つ。
      const beamCrossing = H.id === 'hondo' && !alongX && Math.abs(fix + 56) < .01;
      if (beamCrossing) for (const z of [42.4, 49.6]) edges.push(z - .13, z + .13);
      const beamEdge = t => beamCrossing && [42.4, 49.6].some(z => Math.abs(Math.abs(t - z) - .13) < .001);
      // 戸口だけでなく、下の引き違い二枚ごとの中柱でも欄間を分ける。
      // 建具列と同じ割付を使い、欄間の横枠・縦桟が柱を貫かないようにする。
      for (const [r0, r1] of runs) {
        const len = r1 - r0, n = Math.max(2, Math.round(len / 1.8) * 2);
        for (let j = 2; j < n; j += 2) edges.push(r0 + j * len / n);
      }
      edges.sort((p, q) => p - q);
      for (let i = 0; i < edges.length - 1; i++) {
        // 梁の側面には柱がないため、柱半幅の隙間を開けず框の木口を突き付ける。
        const l = edges[i] + (beamEdge(edges[i]) ? 0 : .08);
        const r = edges[i + 1] - (beamEdge(edges[i + 1]) ? 0 : .08), len = r - l;
        if (len < .08) continue;
        const center = (l + r) / 2;
        const head = beamCrossing && [42.4, 49.6].some(z => Math.abs(center - z) < .13)
          ? Math.min(upper, 3.04) : upper;
        const height = head - bottom;
        for (const yy of [bottom + .02, head - .02]) bx3(len, .04, yy, center, 0x2c2016, 'wood', .13);
        // 共通室内と同じく、縦框は横框の内面へ納め、四隅で角材を重ねない（仕口は推定）。
        // 桟の厚みも引いて透かしを等間隔にし、両端だけ詰まった割付を避ける。
        for (const end of [l + .02, r - .02]) bx3(.04, height - .08, (bottom + head) / 2, end, 0x2c2016, 'wood', .13);
        const clear = len - .08, n = Math.max(1, Math.round(clear / .22));
        const gap = (clear - (n - 1) * .025) / n;
        for (let k = 1; k < n; k++) bx3(.025, height - .08, (bottom + head) / 2,
          l + .04 + k * gap + (k - .5) * .025, 0x2c2016, 'wood', .08);
      }
    }
    // 内法長押は柱の表裏へ抱かせる。柱を貫く二十センチ厚の角材にせず、
    // 十二センチ角の中柱へ接し、太い柱には欠き込んで三センチ厚の板を納める（造作は推定）。
    // 鴨居・戸の溝は保ち、二枚とも既存の木部へ設営時にまとめる。
    for (const side of [-1, 1]) {
      const [px, pz] = at(mid), depth = side * .075;
      const x = px + (alongX ? 0 : depth), z = pz + (alongX ? depth : 0);
      put('wood', alongX
        ? pb(L, .13, .03, x, y + top + .17, z, 0x4a3826)
        : pb(.03, .13, L, x, y + top + .17, z, 0x4a3826));
      bb(alongX ? L : .03, .13, alongX ? .03 : L, x, y + top + .17, z);
    }
    if (H.id === 'goten' || H.id === 'shukuboA') {
      // 座敷の長押を柱へ留める所に鉄の釘隠しを置く（意匠・位置は推定）。
      // 下の柱と同じ割付とし、戸口の上や柱のない合わせ目へ飾りを並べない。
      const posts = new Set([a, b, ...gaps.flat()]);
      for (const [r0, r1] of runs) {
        if (kind === 'wall') {
          for (let t = Math.ceil((r0 + 2.7) / 2.7) * 2.7; t < r1 - .8; t += 2.7) posts.add(t);
        } else {
          const n = Math.max(2, Math.round((r1 - r0) / 1.8) * 2);
          for (let i = 2; i < n; i += 2) posts.add(r0 + i * (r1 - r0) / n);
        }
      }
      for (const t of posts) for (const side of [-1, 1]) {
        const [px, pz] = at(t);
        // 長押の表面へ薄い角座を据え、既存の木部の一括描画へまとめる。
        put('wood', pb(alongX ? .065 : .008, .065, alongX ? .008 : .065,
          px + (alongX ? 0 : side * .094), y + top + .17,
          pz + (alongX ? side * .094 : 0), 0x302b26));
      }
    }
    { const [px, pz] = at(mid); bb(alongX ? L : 0.14, upper - top, alongX ? 0.14 : L, px, y + top + (upper - top) / 2, pz); }
    // 襖・障子列の口へ納めた戸は、隣の引き違い戸より外の溝へ引く。
    // 同じ溝へ重ねると、開いた戸の框と紙が隣の閉じた戸へ食い込む。
    // 四本溝の納まりは推定。通行幅は保ち、敷居と鴨居だけを溝の外まで広げる。
    const doorwayTrack = kind !== 'wall' && gaps.length ? .22 : .14;
    // 隅の口は両開きにすると戸が側壁を越える。片側へ二枚を引ける外の溝を用意する。
    // 端柱の内側に一枚分の引き代を取り、隣の口の戸とも同じ溝で重ねない（納まりは推定）。
    const cornerPocket = gaps.some(([g0, g1]) => g0 - (g1 - g0) / 2 < a + .09 || g1 + (g1 - g0) / 2 > b - .09);
    const outerTrack = doorwayTrack + (cornerPocket ? .08 : 0);
    const railDepth = outerTrack * 2 + .08;
    const tracks = doorwayTrack > .14 ? [-.22, -.14, .14, .22] : [-.14, .14];
    if (cornerPocket) tracks.push(-outerTrack, outerTrack);
    tracks.sort((a, b) => a - b);
    // 共通室内と同じく黒い線で済ませず、厚さ六センチの框を受ける溝を彫る。
    // 敷居は上面、鴨居は下面を六ミリ欠き、底の木は残す（納まりは推定）。
    // 戸口から引き込み先まで同じ溝を通す。既存の木部へ設営時だけまとめる。
    const groovedRail = (bottom, height, upper) => {
      const cut = .006, half = .031;
      bx3(L, height - cut, bottom + (height + (upper ? cut : -cut)) / 2,
        mid, 0x3a2a1c, 'wood', railDepth);
      const surfaceY = bottom + (upper ? cut / 2 : height - cut / 2);
      const strip = (a, b) => {
        if (b <= a) return;
        const [px, pz] = at(mid), depth = (a + b) / 2;
        put('wood', alongX
          ? pb(L, cut, b - a, px, y + surfaceY, pz + depth, 0x3a2a1c)
          : pb(b - a, cut, L, px + depth, y + surfaceY, pz, 0x3a2a1c));
      };
      let start = -railDepth / 2;
      for (const depth of tracks) {
        strip(start, depth - half);
        start = depth + half;
      }
      strip(start, railDepth / 2);
    };
    groovedRail(top, .1, true);
    groovedRail(.07, .06, false);
    // 常時空いていた口にも建具を納める（配置は推定）。共通室内と同じく
    // 表口は開け放ち、左右の壁の前へ引く。退却・乱戦の通行幅を保つ。
    for (const [g0, g1] of gaps) {
      const width = g1 - g0, pw = width / 2;
      for (let i = 0; i < 2; i++) {
        // 戸口の両端は八センチ幅の半柱が出る。框を一センチ逃がし、
        // 二枚の合わせ目と横へ引く距離は元のままにする。
        // 共通室内の戸と同じく、召し合わせを二・四センチ重ねる。
        // 端柱の逃げは保ち、前後の溝の間から向こうが透ける隙間を塞ぐ。
        const c0 = g0 + i * pw + (i === 0 ? .1 : -.012);
        const c1 = g0 + (i + 1) * pw + (i === 1 ? -.1 : .012);
        const [qx, qz] = at((c0 + c1) / 2), [sx0, sz0] = at(c0), [sx1, sz1] = at(c1);
        // 全開時には重ねた框も戸口の外まで引き切る。
        let slide = i === 0 ? -1 : 1, travel = pw + .012;
        if (slide < 0 && g0 - pw < a + .09 && g1 + pw <= b - .09) { slide = 1; travel = width; }
        else if (slide > 0 && g1 + pw > b - .09 && g0 - pw >= a + .09) { slide = -1; travel = width; }
        const track = travel > pw + .012 ? outerTrack : doorwayTrack;
        const p = { kind: kind === 'wall' ? 'itado' : kind, hall: H.id, waist, paperFlip,
          x: qx, z: qz, y: y + .13, rot: alongX ? 0 : Math.PI / 2,
          sx: (c1 - c0) / .9, sy: (top - .13) / 1.8, stacked: [], alive: true,
          solid: panelSolid(sx0, sz0, sx1, sz1, i === 0 ? track : -track), pw: c1 - c0,
          handleFlip: alongX ? i === 1 : i === 0,
          ax: alongX ? 1 : 0, az: alongX ? 0 : 1,
          slide, travel, depth: i === 0 ? track : -track,
          open: 1, want: 1, doorway: true };
        solidOff(p);
        T.panels.push(p); hall.panels.push(p);
      }
    }
    wallPost(at(a)[0], at(a)[1], .18);
    wallPost(at(b)[0], at(b)[1], .18);
    solidCircle(at(a)[0], at(a)[1], .09); solidCircle(at(b)[0], at(b)[1], .09);
    for (const [r0, r1] of runs) {
      const len = r1 - r0, m = (r0 + r1) / 2;
      const [p0x, p0z] = at(r0), [p1x, p1z] = at(r1);
      wallPost(p0x, p0z, .16); wallPost(p1x, p1z, .16);
      solidCircle(p0x, p0z, .08); solidCircle(p1x, p1z, .08);
      if (kind === 'wall') {
        // 隅柱・突き当たり柱の太さが決まってから、柱間へ腰板と白壁を納める。
        wallInfill.push({ alongX, a: r0, b: r1, fix, top });
        bx3(len, 0.08, 0.94, m, 0x2c2016, 'wood', 0.19);   // 腰長押（板壁と白壁の境）
        const [footX, footZ] = at(m);
        bx3(len, .12, floorFinish(footX, footZ) + .06, m, 0x2c2016, 'wood', .19);   // 幅木を床上へ出す
        { const [px, pz] = at(m); bb(alongX ? len : 0.14, top, alongX ? 0.14 : len, px, y + top / 2, pz); }
        T.doorWalls.push(solidSeg(p0x, p0z, p1x, p1z, 0.1));
        for (let k = Math.ceil((r0 + 2.7) / 2.7) * 2.7; k < r1 - 0.8; k += 2.7) { const [qx, qz] = at(k); wallPost(qx, qz, .15, false); }
      } else {
        // 共通の引き戸と同じく二枚一組で割り付ける。狭い壁間も一枚だけにせず、
        // 開いた戸を組の相手へ重ねる。隣の戸口や壁の外へ滑り出させない。
        // 当たりは一枚ずつ持ち、形と材質は既存の一括描画を使い回す。
        const n = Math.max(2, Math.round(len / 1.8) * 2), pw = len / n, leaves = [];
        // 長い襖・障子列は二枚ごとの柱で鴨居と長押を受ける（推定）。
        // 柱は中央、戸は前後の溝を滑る。各組の引き代と既存の戸口は残す。
        for (let i = 2; i < n; i += 2) {
          const [px, pz] = at(r0 + i * pw);
          wallPost(px, pz, .12);
          // 建具を開けたり破ったりしても、鴨居を受ける中柱は残る。
          // 描く十二センチ角に合わせ、戸口の幅を変えず柱だけを通り抜けさせない。
          solidCircle(px, pz, .06);
        }
        for (let i = 0; i < n; i++) {
          // 端柱は九センチ、中柱は六センチの半幅。その内面から一センチ逃がし、
          // 本堂・書院・宿坊の框を柱へ埋めない。柱のない二枚の合わせ目は保つ。
          // 各組の中央だけを重ね、中柱と端柱の逃げには張り出さない。
          // 寸法は描く框・視点用の箱・当たりへ同じように渡す。
          const c0 = r0 + i * pw + (i === 0 ? .1 : i % 2 === 0 ? .07 : -.012);
          const c1 = r0 + (i + 1) * pw + (i === n - 1 ? -.1 : (i + 1) % 2 === 0 ? -.07 : .012);
          const [qx, qz] = at((c0 + c1) / 2), [sx0, sz0] = at(c0), [sx1, sz1] = at(c1);
          // 敷居（中心十センチ・厚さ六センチ）の上端から鴨居の下端までに戸を納める。
          const p = { kind, hall: H.id, waist, paperFlip, x: qx, z: qz, y: y + 0.13, rot: alongX ? 0 : Math.PI / 2, sx: (c1 - c0) / 0.9, sy: (top - .13) / 1.8, stacked: [], alive: true, solid: panelSolid(sx0, sz0, sx1, sz1, i % 2 === 0 ? .14 : -.14),
            // 引き戸：偶数番は右隣、奇数番は左隣へ。各組の二本の溝で引き違う。
            pw: c1 - c0, handleFlip: alongX ? i % 2 === 1 : i % 2 === 0,
            ax: alongX ? 1 : 0, az: alongX ? 0 : 1, slide: i % 2 === 0 ? 1 : -1, depth: i % 2 === 0 ? 0.14 : -0.14, open: 0, want: 0 };
          T.panels.push(p); hall.panels.push(p); leaves.push(p);
        }
        // 戸を重ねる相手を設営時だけ記録する。重なった奥の戸をさらに開けて、二枚を入れ替えない。
        for (let i = 0; i < n; i++) {
          const p = leaves[i], mate = leaves[i + p.slide];
          // 柱の逃げで変わった中心間の距離だけ滑らせ、隣の一枚へ正しく重ねる。
          p.travel = Math.abs((mate.x - p.x) * p.ax + (mate.z - p.z) * p.az);
          mate.stacked.push(p);
        }
      }
    }
  }
  buildWallPosts();
  // 腰壁も通し柱の内面で止める。一枚板へ線を貼らず、幅木と腰長押の裏へ
  // 板端を掛けて縦板を張る（納まりは推定）。溝の奥には薄い実を残す。
  // 設営時だけ既存の材質へまとめ、歩行・視点の当たりは変えない。
  for (const { alongX, a, b, fix, top } of wallInfill) {
    let spans = [[a, b]];
    for (const post of wallPosts.values()) {
      if (Math.abs((alongX ? post.z : post.x) - fix) > .001) continue;
      const center = alongX ? post.x : post.z;
      const left = center - post.width / 2, right = center + post.width / 2;
      spans = spans.flatMap(([l, r]) => right <= l || left >= r ? [[l, r]]
        : [[l, Math.max(l, left)], [Math.min(r, right), r]].filter(([l, r]) => r - l > .001));
    }
    for (const [l, r] of spans) {
      const center = (l + r) / 2;
      const base = floorFinish(alongX ? center : fix, alongX ? fix : center);
      const height = .94 - base, yy = y + (base + .94) / 2;
      const board = (width, depth, at, color) => put('wood', alongX
        ? pb(width, height, depth, at, yy, fix, color)
        : pb(depth, height, width, fix, yy, at, color));
      board(r - l, .008, center, 0x2c2016);
      const count = Math.max(1, Math.round((r - l) / .26)), pitch = (r - l) / count;
      for (let i = 0; i < count; i++) {
        const near = l + i * pitch + (i ? .001 : 0);
        const far = l + (i + 1) * pitch - (i < count - 1 ? .001 : 0);
        board(far - near, .14, (near + far) / 2, 0x4a3a2a);
      }
      const hh = top - .9;
      put('plaster', alongX
        ? wb(r - l, hh, .14, center, y + .9 + hh / 2, fix, 0xcfc9b8, .3)
        : wb(.14, hh, r - l, fix, y + .9 + hh / 2, center, 0xcfc9b8, .3));
    }
  }
  // 小壁は柱割りが揃ってから塗る。鴨居・長押・通し柱の木口で止め、
  // 白壁を木部の中へ通さない。設営時だけ分け、従来の塗り壁へ一括する（納まりは推定）。
  for (const { alongX, a, b, fix, top, upper } of plasterHeads) {
    let spans = [[a, b]];
    for (const post of wallPosts.values()) {
      if (Math.abs((alongX ? post.z : post.x) - fix) > .001) continue;
      const center = alongX ? post.x : post.z;
      const left = center - post.width / 2, right = center + post.width / 2;
      spans = spans.flatMap(([l, r]) => right <= l || left >= r ? [[l, r]]
        : [[l, Math.max(l, left)], [Math.min(r, right), r]].filter(([l, r]) => r - l > .001));
    }
    for (const [bottom, head] of [[top + .1, top + .105], [top + .235, upper]]) {
      if (head <= bottom) continue;
      for (const [l, r] of spans) {
        const center = (l + r) / 2, height = head - bottom, yy = y + (bottom + head) / 2;
        put('plaster', alongX
          ? wb(r - l, height, .14, center, yy, fix, 0xc2bcab, .72)
          : wb(.14, height, r - l, fix, yy, center, 0xc2bcab, .72));
      }
    }
  }
  // 縁側（板と、軒を支える柱）
  // 縁側の床縁と柱も、壁と同じ当たりへまとめる（兵の通行の当たりは変えない）。
  // 床高を保ったまま、縁板の下へ根太・縁框、軒柱の足元へ束石を納める（推定）。
  // 石の下端はその場所の地面へ埋め、低い床下に長い束を無理に立てない。
  // 設営時に材質ごとへまとめ、束石は基壇と同じ石材を使う。毎コマの処理は増やさない。
  const verandaPost = (x, z, alongX, span) => {
    const bottom = Math.min(y - .04, W.heightAt(x, z) - .04), top = y + .06;
    put('paving', pb(.32, top - bottom, .32, x, (top + bottom) / 2, z, 0x7e7a70));
    // 軒柱の頭は桁の下面へ納める。天井高まで伸ばすと桁を貫き、垂木まで柱が突き出す。
    // 桁の中心は床から堂高－十七センチ、厚さ二十センチ。視点用の当たりも同じ寸法にする。
    const postTop = y + H.H - .27, postH = postTop - top, postY = (top + postTop) / 2;
    put('wood', pb(.14, postH, .14, x, postY, z, 0x4a3826));
    bb(.14, postH, .14, x, postY, z);
    // 軒柱は桁を載せるだけにせず、側柱へ繋梁を渡して横にも固める（架構は推定）。
    // 梁の上面を桁の下面へ当て、柱幅の内側で木口を止める。
    // 戸口より十分上へ納め、既存の木部と視点用の箱へ設営時だけまとめる。
    const tieH = .16, tieY = postTop - tieH / 2;
    if (alongX) {
      put('wood', pb(.12, tieH, span, x, tieY, z - span / 2, 0x4a3826));
      bb(.12, tieH, span, x, tieY, z - span / 2);
    } else {
      put('wood', pb(span, tieH, .12, x - span / 2, tieY, z, 0x4a3826));
      bb(span, tieH, .12, x - span / 2, tieY, z);
    }
    put('wood', alongX
      ? pb(.1, .12, span, x, y - .02, z - span / 2, 0x4a3826)
      : pb(span, .12, .1, x - span / 2, y - .02, z, 0x4a3826));
  };
  if (H.engawa === 's') {
    put('wood', pb(H.x1 - H.x0, 0.06, 1.3, cx, y + 0.03, H.z1 + 0.65, 0x3a2a1c));
    put('wood', planks(H.x0, H.z1, H.x1, H.z1 + 1.3, y + 0.075, false, 0x6a5238));
    put('wood', pb(H.x1 - H.x0, .12, .14, cx, y - .02, H.z1 + 1.25, 0x4a3826));
    bb(H.x1 - H.x0, 0.1, 1.3, cx, y + 0.05, H.z1 + 0.65);
    for (const x of H.engawaPosts) {
      verandaPost(x, H.z1 + 1.25, true, 1.25);
      solidCircle(x, H.z1 + 1.25, 0.1);
    }
  }
  if (H.engawa === 'e') {
    put('wood', pb(1.2, 0.06, H.z1 - H.z0, H.x1 + 0.6, y + 0.03, cz, 0x3a2a1c));
    put('wood', planks(H.x1, H.z0, H.x1 + 1.2, H.z1, y + 0.075, true, 0x6a5238));
    put('wood', pb(.14, .12, H.z1 - H.z0, H.x1 + 1.15, y - .02, cz, 0x4a3826));
    bb(1.2, 0.1, H.z1 - H.z0, H.x1 + 0.6, y + 0.05, cz);
    for (const z of H.engawaPosts) {
      verandaPost(H.x1 + 1.15, z, false, 1.15);
      solidCircle(H.x1 + 1.15, z, 0.1);
    }
  }
  // 中の道具
  INTERIOR[H.id](put, y, hall);
  if (H.id === 'hondo') {
    // 内陣の柱・須弥壇・前卓も、壁と同じ視点用の当たりへまとめる。
    // 仏具の細片まで毎コマ調べず、大きな形だけを設営時に足す。
    const floorY = y + .101; // 内陣の畳の仕上げ面
    for (const [x, z] of [[-58, 42.4], [-58, 49.6], [-52, 42.4], [-52, 49.6]]) {
      const base = y + (x < -56 ? .101 : .095), top = y + 2.8;
      bb(.4, top - base, .4, x, (base + top) / 2, z);
    }
    // 柱頭は斗と肘木で梁を受ける簡素な舟肘木の納まり（細部は推定）。
    // 斗の上面と肘木の下面、肘木の上面と梁の下面をそれぞれ合わせる。
    // 柱の通りと戸口は動かさず、既存の木部と視点用の当たりへ一度だけまとめる。
    for (const [x, z] of [[-58, 42.4], [-58, 49.6], [-52, 42.4], [-52, 49.6]]) {
      put('wood', pb(.38, .12, .38, x, y + 2.86, z, 0x5a3e2a));
      put('wood', pb(.64, .12, .26, x, y + 2.98, z, 0x5a3e2a));
      bb(.38, .12, .38, x, y + 2.86, z);
      bb(.64, .12, .26, x, y + 2.98, z);
    }
    // 独立柱の頭を梁でつなぎ、両端を側柱の上へ納める（架構は推定）。
    // 東西の梁の上へ南北の桁を載せ、格天井の下へ木口が浮かないようにする。
    // 木部と視点用の当たりは設営時にまとめ、戸口と歩く床の当たりは増やさない。
    for (const z of [42.4, 49.6]) {
      put('wood', pb(H.x1 - H.x0, .2, .26, cx, y + 3.14, z, 0x5a3e2a));
      bb(H.x1 - H.x0, .2, .26, cx, y + 3.14, z);
    }
    // 桁の下端は梁の上面、上端は格縁の下面。天井板へ納めた格縁の高さを共有する。
    const girderH = HONDO_FRAME.ceilingBottom - HONDO_FRAME.beamTop;
    const girderY = y + (HONDO_FRAME.beamTop + HONDO_FRAME.ceilingBottom) / 2;
    for (const x of [-58, -52]) {
      put('wood', pb(.22, girderH, H.z1 - H.z0, x, girderY, cz, 0x5a3e2a));
      bb(.22, girderH, H.z1 - H.z0, x, girderY, cz);
    }
    // 独立柱は柱頭の梁だけでなく、内法より上の南北の貫でもつなぐ推定の架構。
    // 貫の端は柱の外へ少し出す。内陣境を横断させず、欄間・格子戸を貫かない。
    // 既存の木部と視点用の当たりへ設営時にまとめ、兵の当たりは増やさない。
    for (const x of [-58, -52]) {
      put('wood', pb(.12, .12, 7.7, x, y + 2.75, 46, 0x5a3e2a));
      bb(.12, .12, 7.7, x, y + 2.75, 46);
      // 柱から出た貫の下へ楔を打ち、柱穴との緩みを締める（仕口は推定）。
      // 貫の下面へ接して納め、斗・肘木や欄間へ重ねない。
      for (const z of [42.4, 49.6]) for (const side of [-1, 1]) {
        const wedge = new THREE.BoxGeometry(.16, .035, .12), points = wedge.attributes.position;
        // 柱際を厚く、突き出した先を薄くする。上面は貫の下面へそろえる。
        for (let i = 0; i < points.count; i++) if (points.getY(i) < 0)
          points.setY(i, points.getY(i) + .027 * (side * points.getZ(i) / .12 + .5));
        wedge.computeVertexNormals();
        wedge.translate(x, y + 2.6725, z + side * .2);
        put('wood', paintGeo(wedge, 0x947550));
      }
    }
    bb(2.8, 1.105, 5.2, -60, floorY + .5525, 46); // 須弥壇の下框から壇上まで
    bb(1.25, 1.65, 1.8, -60.3, floorY + 2.025, 46); // 蓮台・本尊・光背
    bb(.55, .83, 1.6, -58.2, floorY + .415, 46); // 前卓の天板まで
    bb(.8, .345, .8, -56.6, floorY + .1725, 46); // 礼盤
    bb(.4, .334, .7, -57.45, floorY + .167, 46); // 経机と折本
    bb(.18, .93, .4, -57.2, floorY + .465, 44.9); // 磬の台
    const postTop = y + HONDO_FRAME.ceilingBottom - HONDO_FRAME.capitalH;
    for (const z of [43.2, 48.8]) {
      bb(.3, postTop - floorY, .3, -61.6, (floorY + postTop) / 2, z);
      bb(.4, HONDO_FRAME.capitalH, .4, -61.6, postTop + HONDO_FRAME.capitalH / 2, z);
    }
    bb(.22, .32, 5.8, -61.6, y + 3, 46); // 来迎柱の虹梁
    // 本堂にも来迎壁を納め、本尊の背後と西の戸口からの通路を分ける（しつらえは推定）。
    // 柱の内面から虹梁の下面までの板壁。両端の脇口は空け、光背や須弥壇へ重ねない。
    // 木部は既存のまとまりへ積み、歩行・戸の見通し・視点にも同じ範囲を渡す。
    const screenBottom = floorY, screenTop = y + 2.84, screenH = screenTop - screenBottom;
    // 一枚板の両面に線を貼らず、縦板の木口と二ミリの目透かしを作る。
    // 継ぎ目の奥には実を残す。元の板と表裏の線と同じ三十五片へ納める（仕口は推定）。
    const boardW = 5.3 / 18, joint = .002;
    for (let i = 0; i < 18; i++) {
      const near = 43.35 + i * boardW + (i ? joint / 2 : 0);
      const far = 43.35 + (i + 1) * boardW - (i < 17 ? joint / 2 : 0);
      put('wood', pb(.08, screenH, far - near, -61.6,
        (screenBottom + screenTop) / 2, (near + far) / 2, 0x604831));
      if (i) put('wood', pb(.008, screenH, joint + .004, -61.6,
        (screenBottom + screenTop) / 2, 43.35 + i * boardW, 0x3a2417));
    }
    for (const x of [-61.65, -61.55]) {
      for (const yy of [screenBottom + .24, screenTop - .16])
        put('wood', pb(.025, .065, 5.3, x, yy, 46, 0x3a2417));
    }
    const screen = solidSeg(-61.6, 43.35, -61.6, 48.65, .065);
    screen.yBot = screenBottom; screen.yTop = screenTop;
    T.doorWalls.push(screen);
    bb(.13, screenH, 5.3, -61.6, (screenBottom + screenTop) / 2, 46);
  }
  hall.decor = furnishTemple(rt, H, y);
  // 床の間は西の口（z 88.5〜90.1）の脇を空けて置く。口の半分を塞ぐと、体が通れない。
  if (H.id === 'goten') {
    const floorY = y + .101, top = H.H - .101, lintel = 2.2;
    const alcove = solidRect(-72.5, 91.9, 3, .85, Math.PI / 2);
    alcove.yBot = floorY; alcove.yTop = y + H.H;
    // furnishTemple の床の間と同じ局所寸法を九十度回して、視点用の壁へ加える。
    // 一つの大箱で掛軸の前を塞がず、柱・側壁・背板・落とし掛けだけで止める。
    // 西の戸口の通行幅は保ち、設営時に既存の視点用の形へまとめる。
    const alcoveBox = (w, h, d, x, yy, z) => bb(d, h, w, -72.5 + z, floorY + yy, 91.9 - x);
    alcoveBox(3, .18, .85, 0, .09, 0);
    for (const x of [-1.5, 1.5]) {
      alcoveBox(.16, top, .16, x, top / 2, 0);
      alcoveBox(.06, top - .18, .39, x, (.18 + top) / 2, -.195);
    }
    alcoveBox(3, top, .08, 0, top / 2, -.43);
    alcoveBox(2.84, .12, .12, 0, lintel, 0);
    alcoveBox(2.84, top - lintel - .06, .06, 0, (top + lintel + .06) / 2, 0);
    alcoveBox(3, .06, .36, 0, top - .03, -.21);
  }
  if (H.id === 'shukuboA') {
    // 書写の文机は furnishTemple と同じ寸法・床高。北の障子口と寝具の間に収める。
    const desk = solidRect(-33.8, 69.5, .96, .49);
    desk.yBot = y + .101; desk.yTop = y + .483;
    bb(.96, .382, .49, -33.8, y + .292, 69.5);
    // 木櫃も絵と同じ外寸・据付高で止める。南の戸口と障子の引き代は空ける。
    const storage = solidRect(-37.1, 73.3, 1, .5);
    storage.yBot = y + .101; storage.yTop = y + .601;
    bb(1, .5, .5, -37.1, y + .351, 73.3);
  }
  // 屋根（入母屋に見える寄棟。この建物だけの形にして、中にいる間は隠す）
  const ex = (H.x1 - H.x0) / 2 + 1.5, ez = (H.z1 - H.z0) / 2 + 1.5;
  const rf = paintGeo(hipGeo(ex, ez, ez * 0.62, H.H + 0.05, Math.max(0.6, ex - ez * 0.9)), 0xffffff); rf.translate(cx, y, cz);
  rec.dist = 'roof_' + H.id; put('tile', rf);
  // 屋根は歩く床にしない。軒より上だけを塞ぎ、下の縁側・戸口は通す。
  hall.roofSolid = solidRect(cx, cz, ex * 2, ez * 2);
  hall.roofSolid.yBot = y + H.H - 0.6;
  // 天井は屋根と別のまとまり。低画質も一棟一描画で、下面を閉じる。
  rec.dist = 'ceiling_' + H.id;
  // 軒裏の下地は外壁の外だけへ張る。室内まで一枚板を通すと、
  // 座敷・床の間の天井下地と厚みが重なる。四辺の木口を突き付け、隅も二重にしない。
  // 設営時に従来の天井へまとめ、屋根を隠した時も軒裏を残す。
  const ceilingW = H.x1 - H.x0, ceilingD = H.z1 - H.z0, eave = 1.4;
  // 軒裏は線を貼った一枚板でなく、垂木に直交する厚みのある野地板で張る（板割りは推定）。
  // 二ミリの目透かしの奥に下地を残し、屋根を隠しても空が透けないようにする。
  // 板の下面と垂木の上面は従来どおり。共通の木材へ設営時に結合する。
  for (const z of [H.z0 - eave / 2, H.z1 + eave / 2])
    put('wood', pb(ceilingW + eave * 2, .012, eave, cx, y + H.H + .084, z, 0x281c12));
  for (const x of [H.x0 - eave / 2, H.x1 + eave / 2])
    put('wood', pb(eave, .012, ceilingD, x, y + H.H + .084, cz, 0x281c12));
  const eaveRows = 5, eavePitch = eave / eaveRows;
  for (let i = 0; i < eaveRows; i++) {
    const near = i * eavePitch + (i ? .001 : 0);
    const far = (i + 1) * eavePitch - (i < eaveRows - 1 ? .001 : 0);
    const off = (near + far) / 2, width = far - near;
    const color = i % 2 ? 0x3e2f22 : 0x3a2c20;
    for (const z of [H.z0 - off, H.z1 + off])
      put('wood', pb(ceilingW + eave * 2, .048, width, cx, y + H.H + .054, z, color));
    for (const x of [H.x0 - off, H.x1 + off])
      put('wood', pb(width, .048, ceilingD, x, y + H.H + .054, cz, color));
  }
  // 天井板（室内だけ明るい杉板。軒の裏は暗いまま）と、壁際を回る回縁
  // 格間の板は十二ミリ、書院・宿坊の杉板は二十四ミリ。その上面から下地を張る。
  // 本堂も格縁へ板を半分埋めず、格縁・仕上げ板・下地の順で木口を納める（推定）。
  const ceilingBoardH = H.id === 'hondo' ? .012 : .024;
  put('wood', pb(H.x1 - H.x0, 0.03, H.z1 - H.z0, cx, y + H.H + ceilingBoardH + .015, cz, H.id === 'hondo' ? 0x6e5638 : 0x8a7252));
  if (H.id === 'hondo') {
    // 南北の回縁を通し、東西の木口はその内面へ納める（仕口は推定）。
    // 書院・宿坊は下の部屋別の回縁だけとし、外周へ二重に材を重ねない。
    // 回縁も格縁と同じ上下端にそろえ、天井板へ食い込ませない。
    // 柱・小壁は同じ下面で受け、従来の部材数と材質を保つ（納まりは推定）。
    const rimH = H.H - HONDO_FRAME.ceilingBottom;
    const rimY = y + (H.H + HONDO_FRAME.ceilingBottom) / 2;
    for (const z of [H.z0 + .06, H.z1 - .06]) put('wood', pb(H.x1 - H.x0 - .22, rimH, .1, cx, rimY, z, 0x2e2016));
    for (const x of [H.x0 + .06, H.x1 - .06]) put('wood', pb(.1, rimH, H.z1 - H.z0, x, rimY, cz, 0x2e2016));
    // 格天井：太い格縁を一間の四分の一（約0.75m）ごとに縦横に組む。内陣（須弥壇の上）は格間に金の板
    // 内陣と外陣の境で格縁を止め、端の格間も区画内へ納める（割付は推定）。
    // 格縁の上面を天井板の下面へ当て、十センチの見付けを埋めない。
    // 桁・来迎柱の斗も同じ下面へ納め、形と材質は既存のまとまりを使う。
    const gridH = H.H - HONDO_FRAME.ceilingBottom;
    const gridY = y + (H.H + HONDO_FRAME.ceilingBottom) / 2;
    for (const [x0, x1] of [[H.x0, -56], [-56, H.x1]]) {
      // 外周の回縁は内面まで十一センチ、内外陣の境の格縁は半幅六センチ。
      // 南北の格縁を通し、東西の格縁はその側面で止める推定の納まり。
      // 木口を回縁へ埋めず、同じ高さの材を交差部へ二重に重ねない。
      // 格縁の幅を引いた格間を等しくする。外形から割ると回縁の厚みだけ端の格間が狭くなる。
      // 仮の両端の格縁芯を回縁の内面から四センチ外へ取り、板の掛かり代も同じ割付へそろえる。
      const { nx, nz, gx0, gz0, gw, gd } = hondoCeilingGrid(H, x0, x1);
      for (let i = 1; i < nx; i++) put('wood', pb(.08, gridH, H.z1 - H.z0 - .22, gx0 + i * gw, gridY, cz, 0x2a1c12));
      for (let j = 1; j < nz; j++) for (let i = 0; i < nx; i++) {
        const left = gx0 + i * gw + .04;
        const right = gx0 + (i + 1) * gw - .04;
        put('wood', pb(right - left, gridH, .08, (left + right) / 2, gridY, gz0 + j * gd, 0x2a1c12));
      }
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        // 格間の板端は格縁・回縁の上へ一・五センチ掛ける（納まりは推定）。
        // 内面で突き付けて板を浮かせず、格縁の中心と隣の板の手前で止める。
        // 板の下面と枚数を保ち、既存の木部へまとめる。
        const bearing = .015;
        const left = gx0 + i * gw + .04 - bearing;
        const right = gx0 + (i + 1) * gw - .04 + bearing;
        const near = gz0 + j * gd + .04 - bearing;
        const far = gz0 + (j + 1) * gd - .04 + bearing;
        if (x1 === -56) {
          put('wood', pb(right - left, ceilingBoardH, far - near, (left + right) / 2, y + H.H + ceilingBoardH / 2, (near + far) / 2, (i + j) % 2 ? 0x9a7a3a : 0x8a6c34));
        } else {
          // 外陣も大きな下地板へ線を重ねるだけにせず、各格間へ厚みのある杉板を三枚納める。
          // 外周の板端を格縁・回縁へ掛け、板同士だけ二ミリの目透かしを残す（納まりは推定）。
          // 内陣の金板と下面を格縁の上面へそろえ、上面は下地の下面へ当てる。
          // 既存の木部へ設営時にまとめ、形の数と毎コマの処理は増やさない。
          const boardW = (right - left) / 3;
          for (let q = 0; q < 3; q++) {
            const a = left + q * boardW + (q ? .001 : 0);
            const b = left + (q + 1) * boardW - (q < 2 ? .001 : 0);
            put('wood', pb(b - a, ceilingBoardH, far - near, (a + b) / 2, y + H.H + ceilingBoardH / 2, (near + far) / 2,
              q % 2 ? 0x765d3e : 0x6e5638));
          }
        }
      }
    }
    put('wood', pb(.12, .12, H.z1 - H.z0 - .22, -56, y + H.H - .06, cz, 0x2a1c12));
  } else {
    // 各座敷の竿縁を間仕切りで止める。書院の板廊下・納戸も別の天井とする。
    const rooms = H.id === 'goten'
      ? [[-73, 80.2, -49, 83.2], [-73, 83.2, -69.4, 88.2],
        [-73, 83.2, -65, 95], [-65, 83.2, -57, 95], [-57, 83.2, -49, 95]]
      : H.floors.map(([x0, z0, x1, z1]) => [x0, z0, x1, z1]);
    for (const [x0, z0, x1, z1] of rooms) {
      const w = x1 - x0, d = z1 - z0, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      // 西壁に床の間がある奥座敷は、竿縁を床框と平行に通す。
      // 部屋の短辺だけで決めると床の間へ突き当たるため、この座敷は南北方向へそろえる（推定）。
      const alcoveRoom = H.id === 'goten' && x0 === -73 && x1 === -65;
      const rodsAlongX = w < d && !alcoveRoom;
      // 西向きの床の間は独立した天井を持つ。側壁の外面で座敷の板と竿縁を止める。
      // furnishTemple の三メートル幅・九十度回転した側壁に合わせた推定の納まり。
      const alcove = alcoveRoom ? { x0: -72.97, x1: -72.47, z0: 90.32, z1: 93.48 } : null;
      // 奥座敷は納戸を除いた鉤の手。壁のない床分割線で天井を二部屋にしない。
      // 一続きの板割り・竿縁を納戸の回縁の内面で切り、床の間も同じように除く。
      const cuts = alcoveRoom ? [alcove, { x0: -73, x1: -69.31, z0: 83.2, z1: 88.29 }] : [];
      const ceilingPiece = (a, b, c, d, height, yy, color) => {
        let pieces = [[a, b, c, d]];
        for (const cut of cuts) pieces = pieces.flatMap(([a, b, c, d]) => {
          // 天井板の端だけは回縁の上へ一・五センチ掛け、竿縁の木口は内面で止める。
          const bearing = cut !== alcove && height === .024 ? .015 : 0;
          const left = Math.max(a, cut.x0), right = Math.min(b, cut.x1 - bearing);
          const near = Math.max(c, cut.z0), far = Math.min(d, cut.z1 - bearing);
          return left < right && near < far
            ? [[a, left, c, d], [right, b, c, d], [left, right, c, near], [left, right, far, d]]
            : [[a, b, c, d]];
        });
        for (const [l, r, n, f] of pieces) if (r - l > .001 && f - n > .001)
          put('wood', pb(r - l, height, f - n, (l + r) / 2, yy, (n + f) / 2, color));
      };
      // 南北の材の内面で東西の木口を止める。奥座敷の西側も床の間の
      // 独立天井・側壁の範囲で切り、座敷の回縁をその中へ通さない（納まりは推定）。
      // 板・竿縁と同じ切り欠きを使い、既存の木部へ設営時だけまとめる。
      for (const z of [z0 + .05, z1 - .05])
        ceilingPiece(x0 + .09, x1 - .09, z - .04, z + .04, .08, y + H.H - .04, 0x4a3624);
      for (const x of [x0 + .05, x1 - .05])
        ceilingPiece(x - .04, x + .04, z0, z1, .08, y + H.H - .04, 0x4a3624);
      if (alcoveRoom) {
        put('wood', pb(.08, .08, 5.09, -69.35, y + H.H - .04, 85.745, 0x4a3624));
        put('wood', pb(3.61, .08, .08, -71.195, y + H.H - .04, 88.25, 0x4a3624));
      }
      if (alcove) {
        // 切った板の木口を回縁で受け、床の間の小壁と天井には重ねない。
        for (const z of [alcove.z0 - .04, alcove.z1 + .04])
          put('wood', pb(alcove.x1 - x0 - .09, .08, .08,
            (x0 + .09 + alcove.x1) / 2, y + H.H - .04, z, 0x4a3624));
        put('wood', pb(.08, .08, alcove.z1 - alcove.z0 + .16,
          alcove.x1 + .04, y + H.H - .04, (alcove.z0 + alcove.z1) / 2, 0x4a3624));
      }
      // 回縁の内面は壁から九センチ。竿縁の上面を天井板の下面へ当て、
      // 四センチの厚みをすべて見せる。木口・板目は回縁へ食い込ませない（納まりは推定）。
      const inset = .09, clearW = w - inset * 2, clearD = d - inset * 2;
      // 回縁の内面間を等分し、壁際だけ竿縁の間が狭くなる割付を避ける。
      // 杉板の継ぎ目も同じ竿縁の芯へ載せる。本数は従来以下に収める（納まりは推定）。
      const rodSpan = rodsAlongX ? clearD : clearW;
      const rodCount = Math.max(0, Math.ceil((rodSpan + inset - .11) / .45) - 1);
      const rodPitch = rodSpan / (rodCount + 1);
      if (rodsAlongX) {
        for (let q = 1; q <= rodCount; q++)
          put('wood', pb(clearW, .04, .035, mx, y + H.H - .02, z0 + inset + q * rodPitch, 0x4a3624));
      } else {
        for (let q = 1; q <= rodCount; q++) {
          const x = x0 + inset + q * rodPitch;
          ceilingPiece(x - .0175, x + .0175, z0 + inset, z1 - inset, .04, y + H.H - .02, 0x4a3624);
        }
      }
      // 線を貼る代わりに厚みのある杉板を竿縁の上へ張る（割付は推定）。
      // 木口は竿縁の中心で継ぎ、隣の板では二本ずらす。
      // 共通室内と同じく周囲は回縁の上へ一・五センチ掛け、板を側面へ突き付けない。
      // 板幅は室内へ均等に割り、端の細い板を省いて下地が露出する隙間を残さない（割付は推定）。
      // 二ミリの目透かしと床の間の切り欠きを保ち、既存の木部へ設営時だけまとめる。
      const boardWidth = rodsAlongX ? w : d, boardLength = rodsAlongX ? d : w;
      const gap = .002, bearing = .015;
      const rows = Math.max(1, Math.ceil((boardWidth - inset * 2) / .3));
      const pitch = (boardWidth - inset * 2) / rows;
      for (let row = 0; row < rows; row++) {
        const a = inset + row * pitch + (row ? gap / 2 : -bearing);
        const b = inset + (row + 1) * pitch - (row < rows - 1 ? gap / 2 : -bearing);
        let start = inset;
        for (let joint = row % 2 ? 2 : 4; ; joint += 4) {
          const end = Math.min(boardLength - inset, inset + joint * rodPitch);
          const near = start + (start > inset ? gap / 2 : -bearing);
          const far = end - (end < boardLength - inset ? gap / 2 : -bearing);
          const color = row % 3 ? 0x8a7252 : 0x80684a;
          if (far > near) {
            if (rodsAlongX) ceilingPiece(x0 + a, x0 + b, z0 + near, z0 + far, .024, y + H.H + .012, color);
            else ceilingPiece(x0 + near, x0 + far, z0 + a, z0 + b, .024, y + H.H + .012, color);
          }
          if (end >= boardLength - inset) break;
          start = end;
        }
      }
    }
  }
  // 軒裏の推定復元。垂木は四辺とも壁から軒先へ向け、隅では重ねない。
  // 縁側の柱上には桁を通し、その上へ垂木を掛ける。室内の張り天井とは分ける。
  // 設営時に既存の木部へまとめ、描く回数・毎コマの処理・通行の当たりは増やさない。
  for (let x = H.x0 + .3; x < H.x1 - .1; x += .75) for (const z of [H.z0 - .7, H.z1 + .7])
    put('wood', pb(.07, .1, 1.4, x, y + H.H - .02, z, 0x493321));
  for (let z = H.z0 + .3; z < H.z1 - .1; z += .75) for (const x of [H.x0 - .7, H.x1 + .7])
    put('wood', pb(1.4, .1, .07, x, y + H.H - .02, z, 0x493321));
  // 垂木の木口は鼻隠しで覆う。四辺の軒先を同じ高さへ納め、
  // 隅では南北の材を東西の材の内面で止める（納まりは推定）。
  // 本堂・書院・宿坊で寸法と木材を共用し、既存の天井のまとまりへ積む。
  const fasciaT = .08, fasciaY = y + H.H - .04;
  for (const x of [H.x0 - eave + fasciaT / 2, H.x1 + eave - fasciaT / 2])
    put('wood', pb(fasciaT, .14, ceilingD + eave * 2, x, fasciaY, cz, 0x493321));
  for (const z of [H.z0 - eave + fasciaT / 2, H.z1 + eave - fasciaT / 2])
    put('wood', pb(ceilingW + eave * 2 - fasciaT * 2, .14, fasciaT, cx, fasciaY, z, 0x493321));
  // 四隅にも隅木を渡し、壁の隅柱から軒先まで野地板を受ける（架構は推定）。
  // 隅木の上面は垂木と同じ野地板の下面へ合わせる。対角の長さを使い、
  // 木口を軒裏の外へ突き出さない。既存の天井木部へ一度だけまとめる。
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx < 0 ? H.x0 : H.x1, z = sz < 0 ? H.z0 : H.z1;
    const halfWidth = .07, reach = 1.4 - halfWidth / Math.SQRT2;
    const hip = pb(reach * Math.SQRT2, .14, halfWidth * 2, 0, 0, 0, 0x493321);
    hip.rotateY(-sx * sz * Math.PI / 4);
    hip.translate(x + sx * reach / 2, y + H.H - .04, z + sz * reach / 2);
    put('wood', hip);
    // 視点も隅木の下面で止める。細かな木部を毎コマ調べず、四隅の箱へまとめる。
    bb(1.4, .14, 1.4, x + sx * .7, y + H.H - .04, z + sz * .7);
  }
  if (H.engawa === 's') put('wood', pb(H.x1 - H.x0 + .2, .2, .18, cx, y + H.H - .17, H.z1 + 1.25, 0x4a3826));
  if (H.engawa === 'e') put('wood', pb(.18, .2, H.z1 - H.z0 + .2, H.x1 + 1.15, y + H.H - .17, cz, 0x4a3826));
  rec.dist = 'hall';
  // 本堂は内外陣境の十二センチの格縁、座敷は八センチの回縁の下面で視点を止める。
  // 天井板だけの高さへ寄せて格縁の中をのぞけないよう、既存の一枚の当たりを合わせる。
  const ceilingDrop = H.id === 'hondo' ? .12 : .08;
  bb(H.x1 - H.x0 + 2.8, ceilingDrop + .08, H.z1 - H.z0 + 2.8, cx, y + H.H + (.08 - ceilingDrop) / 2, cz);
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
    // 床置きの仏具は畳の上へ据える。独立柱は下で斗の下面へ納める。
    const floorY = y + .101;
    // 須弥壇（框・腰・上框の三段。腰は黒漆に金の格狭間）と本尊・光背
    put('wood', pb(2.8, 0.22, 5.2, -60, floorY + 0.11, 46, 0x1e140e));                 // 下框
    put('wood', pb(2.4, 0.5, 4.8, -60, floorY + 0.47, 46, 0x241812));                  // 腰
    // 格狭間は金の四角い板で代用せず、繰形の縁と奥の黒漆を分ける（意匠は推定）。
    // 正面と両脇で同じ縁を使い、設営時に既存の仏具のまとまりへ焼き込む。
    {
      const contour = (p, sx, sy) => {
        p.moveTo(-.6 * sx, -.15 * sy);
        p.lineTo(.6 * sx, -.15 * sy);
        p.lineTo(.6 * sx, -.05 * sy);
        p.bezierCurveTo(.46 * sx, -.05 * sy, .48 * sx, .1 * sy, .3 * sx, .1 * sy);
        p.bezierCurveTo(.17 * sx, .1 * sy, .13 * sx, .15 * sy, 0, .15 * sy);
        p.bezierCurveTo(-.13 * sx, .15 * sy, -.17 * sx, .1 * sy, -.3 * sx, .1 * sy);
        p.bezierCurveTo(-.48 * sx, .1 * sy, -.46 * sx, -.05 * sy, -.6 * sx, -.05 * sy);
        p.closePath();
      };
      const outline = new THREE.Shape(), opening = new THREE.Path(), recess = new THREE.Shape();
      contour(outline, 1, 1); contour(opening, .9, .72); contour(recess, .9, .72);
      outline.holes.push(opening);
      const rim = new THREE.ExtrudeGeometry(outline, { depth: .025, bevelEnabled: false, curveSegments: 4 });
      const back = new THREE.ShapeGeometry(recess, 4);
      rim.rotateY(Math.PI / 2); back.rotateY(Math.PI / 2);
      for (const z of [44.2, 46, 47.8]) {
        const edge = rim.clone(), inset = back.clone();
        edge.translate(-58.78, floorY + .47, z);
        inset.translate(-58.79, floorY + .47, z);
        put('plain', paintGeo(edge, 0x5e4a22));
        put('plain', paintGeo(inset, 0x100c09));
      }
      // 内陣の脇口から見える腰にも格狭間を納める（意匠は推定）。
      // 正面用の形を回して使い、須弥壇の外寸と左右の通路は保つ。
      for (const side of [-1, 1]) {
        const edge = rim.clone(), inset = back.clone();
        edge.rotateY(-side * Math.PI / 2);
        inset.rotateY(-side * Math.PI / 2);
        edge.translate(-60, floorY + .47, 46 + side * 2.42);
        inset.translate(-60, floorY + .47, 46 + side * 2.41);
        put('plain', paintGeo(edge, 0x5e4a22));
        put('plain', paintGeo(inset, 0x100c09));
      }
      rim.dispose(); back.dispose();
    }
    // 腰の上下は段を付けた繰形で框へつなぐ。角は木口を突き付け、
    // 同じ高さの材を重ねず、格狭間の透かしも塞がない（納まりは推定）。
    for (const [height, width, depth] of [[.245, 2.64, 5.04], [.285, 2.52, 4.92],
      [.655, 2.52, 4.92], [.695, 2.64, 5.04]]) {
      const sideW = (width - 2.4) / 2, endD = (depth - 4.8) / 2;
      for (const side of [-1, 1]) {
        put('wood', pb(sideW, .03, depth, -60 + side * (width - sideW) / 2,
          floorY + height, 46, 0x382416));
        put('wood', pb(2.4, .03, endD, -60, floorY + height,
          46 + side * (depth - endD) / 2, 0x382416));
      }
    }
    put('wood', pb(2.8, 0.14, 5.2, -60, floorY + 0.79, 46, 0x1e140e));                 // 上框
    put('wood', pb(2.2, 0.25, 4.4, -60, floorY + 0.98, 46, 0x5e4a22));                  // 壇上（金）
    // 本尊は東向きの坐像。本堂を作る時だけ形を組み、既存のまとまりへ積む。
    { const cx = -60.3, cz = 46, OLD = 0x5e4a22, DIM = 0x49391e, LIT = 0x76602e;
      const round = new THREE.SphereGeometry(1, 16, 10);
      const curl = new THREE.SphereGeometry(1, 6, 4);
      const oval = (sx, sy, sz, dx, dy, dz, hex = OLD, rx = 0, source = round) => {
        const g = source.clone(); g.scale(sx, sy, sz); g.rotateX(rx);
        g.translate(cx + dx, floorY + dy, cz + dz); put('plain', paintGeo(g, hex));
      };
      // 蓮台の座：平たい八角を重ね、上へ向かってすぼめる。
      for (let k = 0; k < 3; k++) {
        const r = 0.73 - k * 0.07, g = new THREE.CylinderGeometry(r - 0.04, r, 0.09, 8);
        g.rotateY(Math.PI / 8); g.translate(cx, floorY + 1.15 + k * 0.09, cz);
        put('plain', paintGeo(g, k === 1 ? LIT : OLD));
      }
      // 組んだ膝と足先。左右に広い輪郭で、座った姿を出す。
      oval(0.37, 0.16, 0.42, 0.12, 1.49, -0.29, OLD, -0.12);
      oval(0.37, 0.16, 0.42, 0.12, 1.49, 0.29, OLD, 0.12);
      oval(0.15, 0.065, 0.25, 0.36, 1.55, -0.08, LIT, -0.18);
      oval(0.15, 0.065, 0.25, 0.29, 1.6, 0.1, OLD, 0.18);
      const body = new THREE.CylinderGeometry(0.25, 0.39, 0.72, 16);
      body.scale(0.83, 1, 1); body.translate(cx - 0.04, floorY + 1.92, cz);
      put('plain', paintGeo(body, OLD));                              // 衣をまとった胴
      oval(0.23, 0.14, 0.37, -0.025, 2.19, 0);                     // なだらかな肩
      for (const side of [-1, 1]) {
        oval(0.14, 0.27, 0.14, 0, 1.99, side * 0.35, OLD, side * 0.3);
        oval(0.15, 0.13, 0.16, 0.04, 1.79, side * 0.42);            // 肘
        oval(0.13, 0.11, 0.25, 0.19, 1.7, side * 0.25, OLD, -side * 0.3);
        oval(0.13, 0.055, 0.13, 0.29, 1.67 + (side + 1) * 0.025, side * 0.07, LIT); // 膝上の手
        oval(0.06, 0.13, 0.065, 0, 2.54, side * 0.205);            // 長い耳
      }
      put('plain', pcyl(0.11, 0.15, cx, floorY + 2.26, cz, OLD, 12));  // 首
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
      halo.rotateZ(Math.PI / 2); halo.translate(cx - 0.48, floorY + 2.08, cz);
      put('plain', paintGeo(halo, DIM));                          // 光背の円盤
      const rim = new THREE.TorusGeometry(0.855, 0.025, 6, 32);
      rim.rotateY(Math.PI / 2); rim.translate(cx - 0.45, floorY + 2.08, cz);
      put('plain', paintGeo(rim, LIT));                           // 少し明るい縁
    }
    solidRect(-60, 46, 2.9, 5.3);
    // 来迎柱（朱塗り）と、柱の間の欄間に渡す虹梁
    // 来迎柱も畳の仕上げ面から立てる（納まりは推定）。
    // 来迎柱を天井板まで突き抜けさせず、柱頭の斗で格縁の下面を受ける。
    // 既存の木部へ設営時にまとめ、左右の通路と兵の当たりは保つ。
    const postTop = y + HONDO_FRAME.ceilingBottom - HONDO_FRAME.capitalH;
    for (const z of [43.2, 48.8]) {
      hondoPost(put, .15, postTop, -61.6, floorY, z, 0x8a2a1a);
      put('wood', pb(.4, HONDO_FRAME.capitalH, .4, -61.6,
        postTop + HONDO_FRAME.capitalH / 2, z, 0x7a2416));
      solidCircle(-61.6, z, .17);
    }
    put('wood', pb(0.22, 0.32, 5.8, -61.6, y + 3.0, 46, 0x7a2416));
    // 天蓋：八角の笠（くすんだ古い金箔）に、透かし彫りの帯（小さな板を間をあけて並べ、上下に框）。
    // 八つの角から華鬘、縁から瓔珞（細い糸に玉を通した垂れ飾り）を長さ違いで垂らす。吊り金具で天井から下げる
    { const cx0 = hondoHangerX(-60.2), cz0 = 46, top = y + 3.12, R = 0.92, OLD = 0x5e4a22, DIM = 0x3e301a, LIT = 0x76602e;
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
      // 吊り位置は格縁の交点。座金を笠の上面と格縁の下面へ当て、
      // 棒を木へ突き刺さず、二枚の座金の間だけにつなぐ（納まりは推定）。
      const mountH = .012, ceiling = y + HONDO_FRAME.ceilingBottom;
      const hangerBottom = top + .07 + mountH, hangerTop = ceiling - mountH;
      put('wood', pb(.1, mountH, .1, cx0, top + .07 + mountH / 2, cz0, DIM));
      put('wood', pb(.1, mountH, .1, cx0, ceiling - mountH / 2, cz0, DIM));
      put('wood', pb(.03, hangerTop - hangerBottom, .03, cx0, (hangerBottom + hangerTop) / 2, cz0, DIM));
    }
    // 幡（左右に垂らす錦の旗）。内陣の格縁の通りへ吊るす（位置は推定）。
    const bannerX = hondoHangerX(-59.5);
    const bannerTop = y + 3.28, bannerBottom = bannerTop - .08;
    const bannerCeiling = y + HONDO_FRAME.ceilingBottom;
    for (const z of [43.6, 48.4]) {
      put('plain', pb(0.04, 1.5, 0.34, bannerX, bannerBottom - .75, z, 0x6a2a3a));
      put('plain', pb(0.05, 0.08, 0.4, bannerX, bannerTop - .04, z, 0x5e4a22));
      // 布の上端を上框へ当て、金具は框の上面から格縁の下面までとする。
      // 天井板へ突き抜ける長さを使わず、既存と同じ数の部品で納める。
      for (const dz of [-.13, .13]) put('plain', pb(.012, bannerCeiling - bannerTop, .012,
        bannerX, (bannerTop + bannerCeiling) / 2, z + dz, 0x5e4a22));
    }
    // 前卓（仏前の机）：香炉・一対の燭台と花瓶（三具足・五具足）
    put('wood', pb(0.55, 0.06, 1.6, -58.2, floorY + 0.8, 46, 0x2a1810));
    for (const z of [45.3, 46.7]) for (const x of [-58.42, -57.98]) put('wood', pb(0.06, 0.78, 0.06, x, floorY + 0.39, z, 0x2a1810));
    // 四脚を低い貫でつなぐ。前卓の脚の内側へ納め、既存の調度の当たりは広げない。
    // 六センチ角の脚の内面で木口を止める。講堂・祖師堂の前卓と同じ納め方にする（推定）。
    for (const x of [-58.42, -57.98]) put('wood', pb(.04, .06, 1.34, x, floorY + .24, 46, 0x2a1810));
    for (const z of [45.3, 46.7]) put('wood', pb(.38, .06, .04, -58.2, floorY + .24, z, 0x2a1810));
    // 五具足の細部は推定。器の口を塞がず、全ての足を前卓の上面へ据える。
    // 円筒と口縁の原形を共用し、設営時に既存の仏具のまとまりへ焼き込む。
    {
      const tube = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
      // 開口の内側にも器壁を作り、口縁の内周へつなぐ（厚みは推定）。
      // 表向きの筒だけでは、見下ろした時に胴が透けて卓が見えてしまう。
      // 同じ原形の裏向きの面を三つの器で共用し、既存の仏具へまとめる。
      const lining = tube.clone();
      lining.scale(.82, 1, .82);
      const indices = lining.index.array;
      for (let i = 0; i < indices.length; i += 3) {
        const second = indices[i + 1];
        indices[i + 1] = indices[i + 2]; indices[i + 2] = second;
      }
      lining.computeVertexNormals();
      const capped = new THREE.CylinderGeometry(1, 1, 1, 10);
      const lip = new THREE.RingGeometry(.82, 1, 10); lip.rotateX(-Math.PI / 2);
      const bronze = 0x6a5a3a, top = floorY + .83;
      const vessel = (z, bottom, radius, height, hex, open = false) => {
        const g = (open ? tube : capped).clone();
        g.scale(radius, height, radius); g.translate(-58.2, bottom + height / 2, z);
        put('plain', paintGeo(g, hex));
        if (open) {
          const inner = lining.clone();
          inner.scale(radius, height, radius); inner.translate(-58.2, bottom + height / 2, z);
          put('plain', paintGeo(inner, hex));
        }
      };
      const rim = (z, yy, radius) => {
        const g = lip.clone(); g.scale(radius, 1, radius); g.translate(-58.2, yy, z);
        put('plain', paintGeo(g, bronze));
      };
      // 三脚の香炉。灰を口縁より下へ納め、上から見ても器の深さが分かる。
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI * 2 / 3;
        put('plain', pb(.025, .025, .025, -58.2 + Math.cos(a) * .075,
          top + .0125, 46 + Math.sin(a) * .075, bronze));
      }
      vessel(46, top + .025, .12, .115, bronze, true);
      vessel(46, top + .105, .098, .004, 0xaaa18c);
      rim(46, top + .14, .12);
      // 一対の燭台は足・軸・受皿・蝋燭をつなぎ、芯まで同じ軸に納める。
      for (const z of [45.55, 46.45]) {
        vessel(z, top, .085, .035, bronze);
        vessel(z, top + .035, .025, .31, bronze);
        vessel(z, top + .345, .07, .025, bronze);
        vessel(z, top + .37, .025, .12, 0xd8b070);
        vessel(z, top + .49, .004, .012, 0x30251b);
      }
      // 花瓶は胴・肩・細い首を分け、口の奥から樒の枝を立てる。
      // 前卓の端と隣の燭台へ張り出さず、元の当たりの中に収める。
      for (const z of [45.35, 46.65]) {
        vessel(z, top, .055, .025, bronze);
        vessel(z, top + .025, .07, .145, bronze);
        vessel(z, top + .17, .05, .025, bronze);
        vessel(z, top + .195, .025, .045, bronze, true);
        vessel(z, top + .218, .02, .003, 0x201b14);
        rim(z, top + .24, .025);
        put('plain', pb(.012, .24, .012, -58.2, top + .33, z, 0x4a5030));
        for (let i = 0; i < 4; i++) {
          const side = i % 2 ? 1 : -1;
          const leaf = new THREE.BoxGeometry(.025, .012, .09);
          leaf.rotateX(side * .45);
          leaf.translate(-58.2, top + .28 + i * .045, z + side * .035);
          put('plain', paintGeo(leaf, 0x3e5a2a));
        }
      }
      tube.dispose(); lining.dispose(); capped.dispose(); lip.dispose();
    }
    solidRect(-58.2, 46, 0.6, 1.7);
    // 礼盤（導師の座る台）と経机・磬
    // 東向きの本尊に向かい、礼盤・経机・前卓を同じ東西の軸へ並べる（配置は推定）。
    // 礼盤と内陣境の間は二十センチ残し、南北の格子戸の通路へは広げない。
    // 礼盤も講堂と同じく、黒漆の天板を四脚と貫で受ける推定の作り。
    // 箱で脚間を塞がず、元の八十センチ角・座面高と当たりの中へ納める。
    // 木部は既存のまとまりに積み、毎コマの処理や描く回数を増やさない。
    put('wood', pb(.8, .055, .8, -56.6, floorY + .2725, 46, 0x2a1810));
    for (const x of [-56.92, -56.28]) {
      for (const z of [45.68, 46.32]) put('wood', pb(.075, .245, .075, x, floorY + .1225, z, 0x2a1810));
      put('wood', pb(.055, .045, .565, x, floorY + .08, 46, 0x2a1810));
    }
    // 貫と幕板は脚の内面で止める。敷物の下面も天板の上面へ据える（造作は推定）。
    // 元の外寸と通行の当たりを保ち、木部は既存のまとまりへ積む。
    for (const z of [45.68, 46.32]) {
      put('wood', pb(.565, .045, .055, -56.6, floorY + .08, z, 0x2a1810));
      put('wood', pb(.565, .08, .035, -56.6, floorY + .205, z, 0x2a1810));
    }
    for (const x of [-56.92, -56.28])
      put('wood', pb(.035, .08, .565, x, floorY + .205, 46, 0x2a1810));
    put('plain', pb(.7, .05, .7, -56.6, floorY + .325, 46, 0x5a2a2a));
    // 経机は中身の詰まった箱にせず、天板・四脚・貫を組む（細部は推定）。
    // 元の幅・奥行き・高さの中へ収め、参拝と退路の幅を保つ。
    put('wood', pb(.4, .04, .7, -57.45, floorY + .28, 46, 0x2a1810));
    for (const x of [-57.6, -57.3]) {
      for (const z of [45.72, 46.28]) put('wood', pb(.05, .26, .05, x, floorY + .13, z, 0x2a1810));
      put('wood', pb(.04, .04, .51, x, floorY + .1, 46, 0x2a1810));
    }
    // 経机も貫を脚間に納め、天板下面まで幕板で受ける。折本と退路の位置は保つ。
    for (const z of [45.72, 46.28]) {
      put('wood', pb(.25, .04, .04, -57.45, floorY + .1, z, 0x2a1810));
      put('wood', pb(.25, .065, .03, -57.45, floorY + .2275, z, 0x2a1810));
    }
    for (const x of [-57.6, -57.3])
      put('wood', pb(.03, .065, .51, x, floorY + .2275, 46, 0x2a1810));
    // 開いた折本を導師側へ向ける。文字を描かず、表紙・紙束・交互の折りで表す。
    // 共通の箱を既存のまとまりへ積み、設営後の処理や描く回数は増やさない。
    put('plain', pb(.28, .008, .5, -57.45, floorY + .304, 46, 0x4e5a50));
    put('plain', pb(.26, .012, .48, -57.45, floorY + .314, 46, 0xd8cfb2));
    // 講堂の折本と同じく、水平の割付から斜辺を求めて六枚を山・谷でつなぐ。
    // 紙束の上面へ谷の下面を据え、紙片を離したり宙へ浮かせたりしない（開き方は推定）。
    const pitch = .48 / 6, rise = .012, angle = Math.atan2(rise, pitch), paperH = .004;
    const leafY = floorY + .32 + paperH * Math.cos(angle) / 2 + rise / 2;
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.BoxGeometry(.26, paperH, Math.hypot(pitch, rise));
      leaf.rotateX(i % 2 ? -angle : angle);
      leaf.translate(-57.45, leafY, 46 - .24 + (i + .5) * pitch);
      put('plain', paintGeo(leaf, 0xd8cfb2));
    }
    // 磬を四角い板で済ませず、講堂と同じ山形の打面とする（意匠は推定）。
    // 金属板は一枚の輪郭から作り、既存の仏具へ設営時だけまとめる。
    // 台の幅・高さの内側へ納め、内陣の通路と視点用の当たりは保つ。
    {
      const outline = new THREE.Shape();
      outline.moveTo(-.16, -.025); outline.lineTo(0, .09); outline.lineTo(.16, -.025);
      outline.lineTo(.16, -.1); outline.lineTo(0, 0); outline.lineTo(-.16, -.1);
      outline.closePath();
      const plate = new THREE.ExtrudeGeometry(outline, { depth: .025, bevelEnabled: false });
      plate.translate(0, 0, -.0125); plate.rotateY(Math.PI / 2);
      plate.translate(-57.2, floorY + .75, 44.9);
      put('plain', paintGeo(plate, 0x5a4a2a));
    }
    for (const z of [44.75, 45.05]) {
      put('wood', pb(.05, .9, .05, -57.2, floorY + .45, z, 0x2a1810));
      put('wood', pb(.18, .05, .09, -57.2, floorY + .025, z, 0x2a1810));
    }
    put('wood', pb(.07, .06, .4, -57.2, floorY + .9, 44.9, 0x2a1810));
    // 二本の紐の下端を山形の肩へ留める。金属板から離れて宙へ浮かせない。
    for (const z of [44.83, 44.97]) put('wood', pb(.012, .08, .012, -57.2, floorY + .83, z, 0x9a825a));
    // 撞木は足元の受けへ横に置き、経机や礼盤へ張り出させない（置き方は推定）。
    for (const z of [44.79, 45.01]) put('wood', pb(.12, .035, .035, -57.2, floorY + .0675, z, 0x2a1810));
    put('wood', pb(.025, .025, .28, -57.2, floorY + .0975, 44.9, 0x785b3c));
    // 調度の見える範囲だけを塞ぐ。左右の格子戸と西の退路は従来の幅を保つ。
    solidRect(-56.6, 46, .8, .8);
    solidRect(-57.45, 46, .4, .7);
    solidRect(-57.2, 44.9, .18, .4);
    // 内陣・外陣の独立柱。柱頭は斗の下面（二・八メートル）で止め、
    // 斗・肘木・梁・桁・格天井を柱が突き抜けないようにする（架構は推定）。
    // 柱脚はそれぞれ畳・板の仕上げ面へ据え、視点用の当たりも同じ寸法にする。
    for (const [x, z] of [[-58, 42.4], [-58, 49.6], [-52, 42.4], [-52, 49.6]]) {
      const base = y + (x < -56 ? .101 : .095);
      hondoPost(put, .17, y + 2.8, x, base, z, 0x5a3e2a);
      solidCircle(x, z, .2);
    }
    // 外陣の鰐口は東の入口へ面を向けて吊るす。細部と吊る位置は推定。
    // 共通のまとまりへ積み、光源や歩行の当たりは増やさない。
    {
      // 鰐口の口は黒い線を貼るだけにせず、鋳肌を抜いて奥の暗がりを見せる（形は推定）。
      // 元の外径・厚みと部品数を保ち、既存の仏具へ設営時だけまとめる。
      const face = new THREE.Shape();
      face.absarc(0, 0, .18, 0, Math.PI * 2, false);
      const mouth = new THREE.Path();
      mouth.moveTo(-.12, -.049); mouth.lineTo(-.12, -.031);
      mouth.lineTo(.12, -.031); mouth.lineTo(.12, -.049); mouth.closePath();
      face.holes.push(mouth);
      const bell = new THREE.ExtrudeGeometry(face, { depth: .09, bevelEnabled: false, curveSegments: 4 });
      bell.rotateY(Math.PI / 2); bell.translate(-47.645, y + 2.46, 46);
      put('plain', paintGeo(bell, 0x7a6a40));
      const rim = new THREE.TorusGeometry(.163, .018, 6, 16);
      rim.rotateY(Math.PI / 2); rim.translate(-47.548, y + 2.46, 46);
      put('plain', paintGeo(rim, 0x8a7a50));
      // 正面下寄りの口と、左右の吊り金具。円盤を水平な皿に見せない。
      put('plain', pb(.008, .018, .24, -47.63, y + 2.42, 46, 0x241c12));
      // 横金具は実際の格縁芯から吊り棒まで渡し、格縁の幅全体で受ける。
      // 天井板や格縁の中まで突き通さず、格間の途中にも浮かせない（納まりは推定）。
      // 下端は鰐口の上部へ留め、元の二本と既存の材質のまとまりを使う。
      const hangerBottom = y + 2.6, mountH = .025;
      const hangerTop = y + HONDO_FRAME.ceilingBottom - mountH;
      const gridX = hondoHangerX(-47.6), mountW = Math.abs(gridX + 47.6) + .1;
      for (const z of [45.9, 46.1]) {
        put('plain', pb(mountW, mountH, .07, (gridX - 47.6) / 2, hangerTop + mountH / 2, z, 0x493c28));
        put('plain', pb(.018, hangerTop - hangerBottom, .018, -47.6, (hangerTop + hangerBottom) / 2, z, 0x493c28));
      }
      // 鳴らす綱は入口側へ下ろす。横木を戸口へ渡さず、元の通行幅を保つ。
      put('wood', pb(.045, .95, .045, -47.52, y + 1.95, 46, 0x9a825a));
      put('wood', pb(.08, .12, .08, -47.52, y + 1.44, 46, 0x7a6242));
    }
  },
  goten(put, y) {
    // 信長の居室：床の間・掛軸・屏風・寝具・燭台・刀掛け
    futon(put, -68.6, y + .101, 91.4, 0, 0x4a2a2a);
    // 納戸の刀掛けは板の仕上げ面へ脚を据える。二本の支柱と受け木に鞘を載せる（形は推定）。
    // 既存の木部へ設営時にまとめ、廊下と戸口の幅は変えない。
    const rackY = y + .095;
    for (const x of [-70.55, -70.05]) {
      put('wood', pb(.12, .06, .28, x, rackY + .03, 84.2, 0x2a1c14));
      put('wood', pb(.055, .48, .055, x, rackY + .3, 84.17, 0x2a1c14));
      put('wood', pb(.055, .055, .14, x, rackY + .42, 84.21, 0x2a1c14));
      put('wood', pb(.055, .09, .035, x, rackY + .44, 84.265, 0x2a1c14));
    }
    put('wood', pb(.5, .045, .045, -70.3, rackY + .16, 84.17, 0x2a1c14));
    put('wood', pb(.72, .045, .045, -70.35, rackY + .47, 84.21, 0x1a1210)); // 鞘
    put('wood', pb(.22, .04, .04, -69.88, rackY + .47, 84.21, 0x493c28)); // 柄
    put('plain', pb(.018, .09, .075, -69.999, rackY + .47, 84.21, 0x665536)); // 鍔
    // 控えの間の槍立ては、畳の上に脚・支柱・受け木を組む（形と配置は推定）。
    // 背板一枚で槍を隠さず、受け木の切り欠きへ柄を立て掛ける。
    const spearY = y + .101;
    for (const z of [90.35, 92.65]) {
      put('wood', pb(.4, .06, .14, -57.4, spearY + .03, z, 0x3a2a1c));
      put('wood', pb(.07, 1.54, .07, -57.35, spearY + .83, z, 0x3a2a1c));
    }
    put('wood', pb(.24, .06, 2.44, -57.45, spearY + .09, 91.5, 0x3a2a1c));
    put('wood', pb(.07, .09, 2.44, -57.35, spearY + 1.45, 91.5, 0x3a2a1c));
    const spearHead = new THREE.ConeGeometry(.055, .25, 4);
    spearHead.scale(.32, 1, 1);
    for (let i = 0; i < 6; i++) {
      const z = 90.5 + i * .4;
      for (const dz of [-.065, .065])
        put('wood', pb(.16, .065, .045, -57.43, spearY + 1.49, z + dz, 0x3a2a1c));
      // 穂先まで二・六メートル。竿縁天井の下へ納め、石突は下の受け木へ載せる。
      put('wood', pcyl(.02, 2.35, -57.48, spearY + .12, z, 0x5a4230, 5));
      put('plain', pcyl(.025, .06, -57.48, spearY + .12, z, 0x4a4945, 5));
      put('plain', pcyl(.026, .1, -57.48, spearY + 2.37, z, 0x777973, 5));
      const head = spearHead.clone(); head.translate(-57.48, spearY + 2.595, z);
      put('plain', paintGeo(head, 0x969992));
    }
    spearHead.dispose();
    // 広間は furnishTemple の畳を見せる。歩く床と高さの違う板状の上段を重ねない。
  },
  shukuboA(put, y) {
    // 西の二組は畳の中央へ寄せ、板間・障子の溝・戸口の前へ寝具を出さない。
    [[-39.5, 67.8, 0.2], [-39.5, 72.4, -0.15], [-35, 72.4, 0.1]].forEach(([x, z, r], i) => futon(put, x, y + .101, z, r, [0x33405a, 0x4a5a46, 0x5a4a38][i]));
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
    for (const roof of h.roofs) roof.visible = !inside || h.rec.state === 2;
    for (const ceiling of h.ceilings) ceiling.visible = h.rec.state !== 2;
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
  const damage = Math.min(P.hp, P.maxHp * rate * warmth * elapsed * (rt.def.playerTaken ?? 1));   // 敵の傷と同じ倍率（def.playerTaken）
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
  // naka_doors.js と同じく、開閉の間も前後の溝を変えず、横へだけ滑らせる。
  const k = p.open, e = k * k * (3 - 2 * k), off = e * (p.travel ?? p.pw * .96) * p.slide, dep = p.depth;
  // 共通室内と同じく、襖・板戸・格子戸の引手を召し合わせ側へ向ける。
  // 障子は両框の手掛けを使い、戸口の二枚も建具列も紙と組子の表裏をそろえる。
  // 南北向きの建具は元の回転で左右が逆になるため、設営時の向きを使う。
  const flip = p.kind === 'shoji' ? p.paperFlip : p.handleFlip;
  // 共通室内の引き戸と同じく、上下の框を六ミリの溝へ三ミリずつ差し込む。
  // 敷居・鴨居の面に触れるだけの戸にせず、溝底には三ミリの逃げを残す。
  // 元の実寸の形を縦だけ伸ばし、戸口の幅・横滑り・兵の当たりは保つ。
  const inset = .003, height = p.sy * 1.8, scaleY = (height + inset * 2) / height;
  SL.Q.setFromAxisAngle(SL.Y, p.rot + (flip ? Math.PI : 0)); SL.S.set(1, scaleY, 1);
  SL.P.set(p.x + p.ax * off + p.az * dep, p.y - inset, p.z + p.az * off + p.ax * dep);
  // 操作の遮りにも描く戸の現在位置を使う。設営時と動く時だけ更新する。
  p.faceX = SL.P.x; p.faceZ = SL.P.z;
  SL.M.compose(SL.P, SL.Q, SL.S);
  for (const m of p.meshes) {
    if (m === p.cam) {
      // 視点用の箱は元の九十×百八十センチ。見た目と同じ外形を保つ。
      SL.S.set(p.sx, p.sy * scaleY, 1); SL.P.y += height / 2 + inset;
      SL.M.compose(SL.P, SL.Q, SL.S);
      SL.P.y -= height / 2 + inset; SL.S.set(1, scaleY, 1);
    }
    m.setMatrixAt(p.i, SL.M); m.instanceMatrix.needsUpdate = true;
    if (m === p.cam) SL.M.compose(SL.P, SL.Q, SL.S);
  }
}
function solidOff(p) {
  const s = p.solid;
  if (!p.saved) p.saved = { x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 };
  s.x0 = s.x1 = s.z0 = s.z1 = 1e9;
}
// 共通の引き戸と同じく、手元から戸の面までに間仕切りがあれば操作しない。
// 白壁に加え、横へ滑った襖・障子・板戸も現在の面で調べる。
function doorWallBetween(T, ux, uz, x, z, target) {
  const dx = x - ux, dz = z - uz;
  for (const w of T.doorWalls) {
    const wx = w.bx - w.ax, wz = w.bz - w.az, cross = dx * wz - dz * wx;
    if (Math.abs(cross) < .00001) continue;
    const ax = w.ax - ux, az = w.az - uz;
    const t = (ax * wz - az * wx) / cross, s = (ax * dz - az * dx) / cross;
    if (t > .001 && t < .999 && s >= 0 && s <= 1) return true;
  }
  for (const p of T.panels) {
    if (p === target || !p.alive || Math.abs(p.y - target.y) > 1.2) continue;
    const cross = dx * p.az - dz * p.ax;
    if (Math.abs(cross) < .00001) continue;
    const ax = p.faceX - ux, az = p.faceZ - uz;
    const t = (ax * p.az - az * p.ax) / cross;
    if (t <= .001 || t >= .999) continue;
    const along = (ax * dz - az * dx) / cross;
    if (Math.abs(along) <= p.pw / 2) return true;
  }
  return false;
}
function addSlidingDoors(rt, T) {
  T.sliding = new Set();
  let pick = null;
  const it = { label: '戸を開ける' };
  const pickPos = { x: 0, y: 0, z: 0 };
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
      if (p.doorway && p.want && rt.def.doorCloseOK?.(rt) === false) continue;
      // 引き違い戸が重なっている間は、手前の動く一枚を閉める札にする。
      // 奥の戸も開くと二枚が位置を交換し、通れる当たりだけ消えた閉じた見た目になる。
      if (!p.want && p.stacked.some(q => q.alive && (q.want || q.open > 0))) continue;
      // 描画時に控えた戸の面で札を探す。開閉中も札が戸から離れない。
      const cx = p.faceX, cz = p.faceZ;
      // 廊下を向いている時、横の襖の札で接近戦を隠さない。
      // 戸の面へ向き、正面の一枚を見た時だけ操作できる。
      if (Math.abs(fx * p.az + fz * p.ax) < 0.65) continue;
      // 共通の引き戸と同じく、紙面でなく実際の引手から開閉する。
      // 障子は左右の框、襖は紙面の引手、格子戸と板戸は片側の框。
      // 南北向きの戸と半回転した戸も、描いた引手と同じ向きへそろえる。
      const shoji = p.kind === 'shoji', fusuma = p.kind === 'fusuma';
      const grip = Math.max(0, p.pw / 2 - (fusuma ? .13 : .02));
      const direction = (p.handleFlip ? -1 : 1) * (p.ax ? 1 : -1);
      const height = p.sy * 1.8, inset = .003;
      const gripY = p.y - inset + Math.min(fusuma ? .85 : .9, height / 2) * (height + inset * 2) / height;
      for (let hand = 0; hand < (shoji ? 2 : 1); hand++) {
        const along = grip * direction * (hand ? -1 : 1);
        const x = cx + p.ax * along, z = cz + p.az * along;
        const dx = x - P.pos.x, dz = z - P.pos.z, d = Math.hypot(dx, dz);
        const reach = Math.hypot(dx, dz, gripY - (P.pos.y + 1));
        if (reach >= 1.4) continue;
        if (d > 0.25 && dx * fx + dz * fz < d * 0.65) continue;
        if (doorWallBetween(T, P.pos.x, P.pos.z, x, z, p)) continue;
        // 重なった開き戸より、目の前の閉じた戸を選ぶ。背中の戸を閉じて退路を塞がない。
        const score = reach + (p.want ? 0.45 : 0) + (dx * fx + dz * fz < 0 ? 0.5 : 0);
        if (score < bd) { bd = score; pick = p; pickPos.x = x; pickPos.y = gripY; pickPos.z = z; }
      }
    }
    if (pick) it.label = pick.want ? '戸を閉める' : '戸を開ける';
    // 閉じた戸へ歩いて当たれば、自分で開けて通る（「戸を開ける」の札を探させない。Simple is the best）
    const v = P.vel;
    if (pick && !pick.want && bd < 1.2 && (v && Math.hypot(v.x, v.z) > 0.4 || rt.player.blockedWalkT > 0.25)) {
      // 札から開けた時と同じく、横へ引き切るまでは戸口の当たりを残す。
      // 引き先に人がいて戸が止まった時も、閉じた紙面を通り抜けさせない。
      pick.want = 1; T.sliding.add(pick);
      rt.army.play('wood', { x: pick.x, z: pick.z }, 0.35);
    }
    return pick;
  };
  rt.addInteract('naka_tobira', () => find() ? pickPos : null, '戸を開ける', () => {
    const p = find();
    // 同じ時刻に退却の段階が進んでも、退路の戸を古い候補のまま閉めない。
    if (!p || !p.alive || p.doorway && p.want && rt.def.doorCloseOK?.(rt) === false) return;
    // 共通室内と同じく、人のいる戸口は閉めない。閉め始めから当たりを戻し、
    // 開く時は引き切るまで残して、動いている建具を体が突き抜けないようにする。
    if (p.want) {
      if (panelDoorwayOccupied(rt, p)) return;
      if (p.saved) Object.assign(p.solid, p.saved);
    }
    p.want = p.want ? 0 : 1;
    T.sliding.add(p);
    rt.army.play('wood', { x: p.faceX, z: p.faceZ }, 0.35);
  }, { r: 1.5, prio: -3 });
  // 札の字は毎コマ変わる（開ける／閉める）。battle の札の箱を一つ探して、label を差し替える。
  const entry = rt.interacts[rt.interacts.length - 1];
  Object.defineProperty(entry, 'label', { get: () => it.label, configurable: true });
}
function unitInPanelDoorway(p, u) {
  if (!u || !u.alive || Math.abs(u.pos.y - p.y) > 1.2) return false;
  const dx = u.pos.x - p.x, dz = u.pos.z - p.z;
  return Math.abs(dx * p.ax + dz * p.az) < p.pw / 2 + .3
    && Math.abs(dx * p.az + dz * p.ax) < .35;
}
function panelDoorwayOccupied(rt, p) {
  if (unitInPanelDoorway(p, rt.player && rt.player.u)) return true;
  for (const u of rt.army.units) if (!u.isStruct && unitInPanelDoorway(p, u)) return true;
  return false;
}
// naka_doors と同じく、開閉とも框の移動範囲を調べる。閉める時は戸口全体も空ける。
function unitInPanel(p, u, nextOpen) {
  if (!u || !u.alive || Math.abs(u.pos.y - p.y) > 1.2) return false;
  const dx = u.pos.x - p.x, dz = u.pos.z - p.z;
  const along = dx * p.ax + dz * p.az, across = dx * p.az + dz * p.ax;
  if (!p.want && Math.abs(along) < p.pw / 2 + .3 && Math.abs(across) < .35) return true;
  // 開く時も引き込み先の人へ框を通さず、人が離れたら同じ溝の上で動かし直す。
  // 開口の中央にいる人のために、左右へ離れていく戸まで止めない。
  const travel = (p.travel ?? p.pw * .96) * p.slide;
  const from = p.open * p.open * (3 - 2 * p.open) * travel;
  const to = nextOpen * nextOpen * (3 - 2 * nextOpen) * travel;
  // 共通の引き戸と同じく、触れている框が体から離れる時は開ける。
  // 戸へ寄ったまま操作しても止まらず、引き込み先へ近づく動きは止める。
  if (p.want && Math.abs(along - from) <= p.pw / 2 + .3
    && Math.abs(along - to) > Math.abs(along - from)) return false;
  return Math.abs(across - p.depth) < .33
    && along > Math.min(from, to) - p.pw / 2 - .3
    && along < Math.max(from, to) + p.pw / 2 + .3;
}
function panelOccupied(rt, p, nextOpen) {
  if (unitInPanel(p, rt.player && rt.player.u, nextOpen)) return true;
  for (const u of rt.army.units) if (!u.isStruct && unitInPanel(p, u, nextOpen)) return true;
  return false;
}
function slideTick(rt, T, dt) {
  for (const p of T.sliding) {
    if (!p.alive) { T.sliding.delete(p); continue; }
    // 閉め始めてから退却が始まった場合も、共通の建具と同じ戦況の制限を守る。
    if (!p.want && p.doorway && rt.def.doorCloseOK?.(rt) === false) p.want = 1;
    // 閉め始めた後で戸口へ入った人にも建具を重ねず、元の溝で開き直す。
    if (!p.want && panelDoorwayOccupied(rt, p)) p.want = 1;
    const nextOpen = Math.max(0, Math.min(1, p.open + (p.want ? 1 : -1) * dt * 2.6));
    if (panelOccupied(rt, p, nextOpen)) continue;
    p.open = nextOpen;
    panelPose(p);
    if (p.open === p.want) {
      T.sliding.delete(p);
      if (p.want) solidOff(p);
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
  if (!quiet) rt.army.play('wood', { x: p.faceX, z: p.faceZ }, 0.9);
  return true;
}
// 近くの襖を破る（自分の一振り・敵の突き破り）。破った数を返す
export function breakNear(rt, T, x, z, r, max = 2, dir = null) {
  let n = 0;
  for (const p of T.panels) {
    if (!p.alive || n >= max) continue;
    // 横へ引いた戸は現在の面で斬る。空いた戸口を振って奥の戸を壊さない。
    const dx = p.faceX - x, dz = p.faceZ - z, d = Math.hypot(dx, dz);
    if (d > r) continue;
    if (dir && d > 0.3 && (dx * dir.x + dz * dir.z) / d < 0.3) continue;
    if (breakPanel(rt, p)) n++;
  }
  return n;
}
// 中のある建物の中か（どの建物か）
export function hallAt(T, x, z) { return T.halls.find((h) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) || null; }
