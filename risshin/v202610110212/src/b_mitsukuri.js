import * as THREE from 'three';
import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
// ======================================================================
// 織田家編　箕作城の戦い（永禄十一年九月十二日・夕方から夜の強襲・縄張り版。docs/first6-1560-1569-spec.md 34〜41）
// 足利義昭を奉じて京へ上る信長の道を、南近江の六角義賢・義治がふさいだ。
// 信長は観音寺城の支えの箕作城を攻めさせ、申の刻から攻めかかって、夜のうちに落とした。
// 八段の流れ：1 山麓へ寄る → 2 外側の柵（三の郭）→ 3 三の郭を取る → 4 日が傾き松明を灯す → 5 二の丸の木戸
//   → 6 夜戦 → 7 本丸の守りが崩れる → 8 翌日の観音寺入城を後日談で伝える
// 攻め手は佐久間・丹羽・木下・浅井新八の四手が同時に寄せる。自分は木下藤吉郎の手（南の大手の一方向）。ほかの方向は遠景と AI
// （castles/mitsukuri.js の縄張り・castle_plan.js・siege_zones.js・siege_ai.js・butai.js を使う。
//  三の郭〔坂の上〕→二の丸〔木戸構え〕→本丸、の区域の取り合い＋城の頭）
// 落城後の架空の後詰・放火・一騎打ちは挟まない。守りを退け、三曲輪を押さえる。
// 向き：北（-z）が箕作山の城。北西の奥（-x, -z）に観音寺城のある繖山。南（+z）に織田の陣
// ======================================================================
import { nobori, hut, tawara, campfire, ishigaki, kabukimon, dobei, kuruwaBldg, solidCircle, village, makeKitBatch, finalizeKitBatch, makeSimpleBatch, finalizeSimpleBatch, carryTorches } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, nm, allyGroup, enemyGroup } from './bhelp.js';
import { customFlag, dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { placeGroup } from './b_opening.js';
import { buildHorse } from './units_model.js';
import { yamaLift } from './yamalift.js';
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { sakamogiRow, horiboriHeight, goten, monomi } from './castle_parts.js';
import { makeSiegeZones, siegeFighter } from './siege_zones.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeDefenseAI, chooseRoute } from './siege_ai.js';
import { makeButai, butaiTick, lightClash } from './butai.js';
import { addRamp } from './floors.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { demDetail } from './dem.js';
import {
  MITSUKURI_PLAN, SAN_C, NI_C, HON_C, KIDO, NISHI_TANI_X, ROAD_OTE, ROAD_TANI, ROAD_URA,
} from './castles/mitsukuri.js';

// 束0 の asset_dem_mitsukuri.js がまだ無い時も止まらないように（無ければ base のまま）
let dem = null;
let terrainDem;
import('./asset_dem_mitsukuri.js').then((m) => { dem = m.default; }).catch(() => {});

const KAN = { x: -130, z: -196 };           // 観音寺城のある繖山
const CAMP = { x: 4, z: 56 };              // 織田の陣
const ROAD = [[0, 150], ...ROAD_OTE];
// 麓の九十九折りを省き、三の郭の柵の手前の道から始める。
const OPEN_PT = [0, -33];
const TANI_ATTACK_ROAD = [...ROAD_TANI, [SAN_C.x, SAN_C.z]];
const CASTLE_ROADS = [ROAD, TANI_ATTACK_ROAD, ROAD_URA, ...MITSUKURI_PLAN.paths.filter((p) => !['ote', 'tani', 'ura'].includes(p.id)).map((p) => p.pts)];
// 松明の束：日が傾いた時、三の郭の柵の口の外（坂の上）で火を移す
const TORCH = [{ x: -10, z: -36 }, { x: 4, z: -32 }, { x: 16, z: -37 }];
const torchReady = (u) => u.type === 'ashigaru' && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget && !u.downed && !u.rearWound && !u.climb;
const ODA = { flag: 'oda' };
const RK = { armor: 0x33291f, flag: 'rokkaku' };
// 下知は近くでは将本人、離れていれば組頭が伝える。
const sayKino = (rt, text, secs) => { const u = rt.flags.kinoU; rt.say(u?.alive && Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) <= 16 ? '木下藤吉郎' : '組頭', text, secs); };
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const nextObj = (rt, text) => rt.obj('main', text, 'main');
const markZone = (rt, id) => {
  const z = rt.flags.SZ.byId[id];
  rt.marker(id, z.pos, () => `${z.name}　味方${z.friends || 0}／${z.need}人・敵${z.enemies || 0}人`, { red: true });
};

// 六角の紋：隅立て四つ目結（四つの目結を菱に並べる）
function rokkakuTex() {
  return customFlag('rokkaku', (g) => {
    g.translate(64, 82); g.scale(43, 43);
    const P = new Path2D();
    const sq = (cx, cy, s) => { P.moveTo(cx, cy - s); P.lineTo(cx + s, cy); P.lineTo(cx, cy + s); P.lineTo(cx - s, cy); P.closePath(); };
    for (const [cx, cy] of [[0, -0.48], [0.48, 0], [0, 0.48], [-0.48, 0]]) { sq(cx, cy, 0.44); sq(cx, cy, 0.19); }
    g.fill(P, 'evenodd');
  });
}

// 手書きの地形（箕作山・繖山・和田山）。曲輪・道・切岸は heightOf（castle_plan.js）が上書きする
function baseRaw(x, z) {
  let h = 0.5 * Math.sin(x * 0.034 + 0.2) * Math.cos(z * 0.029) + 0.3 * Math.sin(z * 0.06 + x * 0.03);
  h += 34 * gauss(x, z, HON_C.x, HON_C.z + 6, 2400) + 16 * gauss(x, z, -44, -124, 2000) + 12 * gauss(x, z, 40, -130, 1800);
  h += 70 * gauss(x, z, KAN.x, KAN.z, 6000) + 18 * gauss(x, z, -130, -60, 1800);
  return h;
}
// 繖山の山腹の六角の本陣（平らに削った段。castle_plan の縄張りの外なので、ここは手で均す）
const KC = { x: -96, z: -140 };
const KTOP = baseRaw(KC.x, KC.z);
function baseWithKan(x, z) {
  const h = baseRaw(x, z);
  const dk = Math.hypot(x - KC.x, z - KC.z);
  const q = Math.max(0, Math.min(1, (20 - dk) / 8));
  return h * (1 - q) + KTOP * q;
}
// 国土地理院の標高（箕作山。asset_dem_mitsukuri.js は本丸が格子の原点）の尾根と谷の凹凸を、手書きの山に足す。
// 実測の水平距離は１ｍを１座標で使い、本丸（HON_C）を原点に合わせる。細かな起伏だけを足す。
const MITSUKURI_DEM_OPTIONS = { xy: 1, ox: HON_C.x, oz: HON_C.z, win: 60, scale: 0.35 };
function baseWithDem(x, z) {
  const b = baseWithKan(x, z);
  // 曲輪の床と山の肩の高さをそろえる。盛り上げ前の主郭は１１ｍ。
  const shoulder = (baseWithKan(HON_C.x, HON_C.z) - 11) * gauss(x, z, HON_C.x, HON_C.z, 5000);
  const data = terrainDem === undefined ? dem : terrainDem;
  return b - shoulder + (data ? demDetail(data, x, z, MITSUKURI_DEM_OPTIONS) : 0);
}
// 堀の形は一度だけ用意し、城の部品と同じ窪みを実際の地面にも付ける。
const HORI_HEIGHTS = MITSUKURI_PLAN.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep, width: h.w }));
function baseWithHori(x, z) {
  let h = baseWithDem(x, z);
  for (const f of HORI_HEIGHTS) h += f(x, z);
  return h;
}
let HEIGHT_FN = null;
let ROAD_SEGMENTS = null;
// 曲輪間の段差を道の長さに分ける。道の外の切岸・土塁・堀は残す。
// 交差する大手と谷道は同じ標高を用い、口で急に上下しない。
function roadLevel(x, z) {
  const san = LIFT.rise + 2, ni = LIFT.rise + 6, hon = LIFT.rise + 11;
  if (z >= -44) {
    const foot = HEIGHT_FN(0, 56);
    const t = Math.max(0, Math.min(1, (56 - z) / 86));
    return foot + (san - foot) * t;
  }
  if (z >= -60) return san;
  if (z >= -68) return san + (-60 - z) * 0.5;
  if (z >= -86) return ni;
  if (z > -98) return ni + (-86 - z) * 5 / 12;
  if (z >= -110) {
    if (x <= -12) return LIFT.rise + 9;
    if (x < -6 && z <= -102) return hon - (-6 - x) / 3;
    if (x >= 13) return LIFT.rise + 8;
    if (x > 6 && z >= -100) return hon - (x - 6) * 3 / 7;
    return hon;
  }
  return hon + (z + 110) * 0.4;
}
function prepareHeight() {
  if (HEIGHT_FN) return;
  // 標高が後から届いても、出来上がった道と建物の床を動かさない。
  terrainDem = dem;
  HEIGHT_FN = heightOf(MITSUKURI_PLAN, baseWithHori, 2.6);
  // 主郭１１ｍ＋盛り上げ＝麓から２１０ｍ。標高データの有無にかかわらず比高を保つ。
  LIFT.rise = HEIGHT_FN(0, 56) + 210 - 11;
  ROAD_SEGMENTS = [];
  // 境目を道の点にも入れ、二の丸と本丸の床を平らに保つ。
  const cuts = [-30, -44, -60, -68, -86, -98, -110];
  for (const pts of CASTLE_ROADS) for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az;
    const ts = [0, 1];
    if (dz) for (const z of cuts) { const t = (z - az) / dz; if (t > 0 && t < 1) ts.push(t); }
    ts.sort((a, b) => a - b);
    for (let j = 1; j < ts.length; j++) {
      const t0 = ts[j - 1], t1 = ts[j], x0 = ax + dx * t0, z0 = az + dz * t0;
      const x1 = ax + dx * t1, z1 = az + dz * t1, sx = x1 - x0, sz = z1 - z0, l2 = sx * sx + sz * sz;
      if (l2 < 0.001) continue;
      ROAD_SEGMENTS.push({ ax: x0, az: z0, dx: sx, dz: sz, l2, ya: roadLevel(x0, z0), yb: roadLevel(x1, z1) });
    }
  }
}
function roadDistance(x, z) {
  prepareHeight();
  let best = Infinity;
  for (const q of ROAD_SEGMENTS) {
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
    best = Math.min(best, Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t));
  }
  return best;
}
function height(x, z) {
  prepareHeight();
  const raw = HEIGHT_FN(x, z) + yamaLift(x, z, LIFT);
  let best = Infinity, y = raw;
  for (const q of ROAD_SEGMENTS) {
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
    const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
    if (d < best) { best = d; y = q.ya + (q.yb - q.ya) * t; }
  }
  // 口幅３．６ｍの木戸に合わせ、道の半幅は１．６ｍ。外へ２ｍで元へ戻す。
  if (best >= 3.6) return raw;
  const t = Math.max(0, Math.min(1, (3.6 - best) / 2));
  return raw + (y - raw) * t * t * (3 - 2 * t);
}

// 虎口の石段はまとめて描き、同じ高さの坂を歩く当たりに登録する。
function entranceSteps(rt) {
  const geos = [];
  // 角を落とした石を三形だけ用意する。上の一角は欠けて低くなる。
  const stones = [0, 1, 2].map((v) => {
    const cut = 0.10 + v * 0.035;
    const ring = [[-0.5 + cut, -0.5], [0.5 - cut, -0.5], [0.5, -0.5 + cut], [0.5, 0.5 - cut],
      [0.5 - cut, 0.5], [-0.5 + cut, 0.5], [-0.5, 0.5 - cut], [-0.5, -0.5 + cut]];
    const pos = [], indices = [];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) {
      const inset = r === 2 ? 0.91 : 1;
      pos.push(ring[k][0] * inset, r === 0 ? -0.5 : r === 1 ? 0.32 : 0.5 - (k === v * 2 ? 0.12 : 0), ring[k][1] * inset);
    }
    for (let r = 0; r < 2; r++) for (let k = 0; k < 8; k++) {
      const a = r * 8 + k, b = r * 8 + (k + 1) % 8;
      indices.push(a, a + 8, b, b, a + 8, b + 8);
    }
    for (let k = 1; k < 7; k++) indices.push(16, 16 + k + 1, 16 + k);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(indices);
    const flat = g.toNonIndexed(); g.dispose(); flat.computeVertexNormals();
    return flat;
  });
  const boxBase = new THREE.BoxGeometry(1, 1, 1), patchBase = new THREE.CylinderGeometry(1, 1, 1, 7);
  const box = boxBase.toNonIndexed(), patch = patchBase.toNonIndexed();
  boxBase.dispose(); patchBase.dispose();
  box.deleteAttribute('uv'); patch.deleteAttribute('uv');
  const palette = [0x706b5c, 0x827666, 0x69695c, 0x8a806b, 0x777565];
  const color = new THREE.Color();
  // 石・土・苔・割れ目は開戦時に一つへまとめ、毎コマの追加をしない。
  const piece = (source, x, y, z, w, h, d, tint, turn = 0) => {
    const g = source.clone(); g.scale(w, h, d); g.rotateY(turn); g.translate(x, y, z);
    color.setHex(tint);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < colors.length; k += 3) { colors[k] = color.r; colors[k + 1] = color.g; colors[k + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geos.push(g);
  };
  for (const [a, b] of [[[0, -60], [0, -68]], [[0, -86], [0, -98]]]) {
    const ya = height(...a), yb = height(...b), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.ceil((yb - ya) / 0.22), run = len / n;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n, y = ya + (yb - ya) * t;
      const z = a[1] + (b[1] - a[1]) * (i + 0.5) / n;
      // 下の土が細い目地からのぞく。段ごとに石の数と幅を変え、目地をずらす。
      piece(box, 0, y - 0.17, z, 3.2, 0.26, run + 0.02, 0x544938);
      const count = 4 + i % 2, weights = [];
      let total = 0, edge = -1.6;
      for (let j = 0; j < count; j++) { const w = 0.8 + ((i * 7 + j * 3) % 5) * 0.13; weights.push(w); total += w; }
      for (let j = 0; j < count; j++) {
        const span = 3.2 * weights[j] / total, x = edge + span / 2;
        const top = y + ((i + j * 2) % 3 - 1) * 0.008, depth = run - 0.025 - (j % 2) * 0.012;
        piece(stones[(i + j) % 3], x, top - 0.14, z, span - 0.035, 0.28, depth, palette[(i * 3 + j) % palette.length]);
        if ((i + j) % 3 === 0) {
          // 細い割れを二本で折り、石の表面に沿わせる。
          piece(box, x - 0.06, top + 0.002, z + depth * 0.12, 0.012, 0.003, depth * 0.4, 0x48463b, 0.22);
          piece(box, x - 0.06 - depth * 0.065, top + 0.002, z - depth * 0.18, 0.012, 0.003, depth * 0.25, 0x48463b, -0.35);
        }
        // 土と苔は踏む中央を避け、脇と目地に小さく残す。
        if (j === 0 || j === count - 1) {
          piece(patch, x + (j === 0 ? -1 : 1) * span * 0.2, top + 0.007, z, span * 0.23, 0.012, depth * 0.33, i % 3 ? 0x596044 : 0x6b5940, i * 0.7);
        }
        edge += span;
      }
    }
    addRamp({ ax: a[0], az: a[1], bx: b[0], bz: b[1], ya, yb, w: 3.2, step: 0.22 });
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ vertexColors: true }));
  for (const g of [...geos, ...stones, box, patch]) g.dispose();
  mesh.receiveShadow = true; rt.scene.add(mesh);
}

// 攻め口の山肌。岩・根・草と丸太・土は開戦時にまとめ、毎コマ追加しない。
function approachDetail(rt) {
  // 兵が立つ格子補間後の地面を使い、元の高さ関数とのずれを残さない。
  const groundHeight = (x, z) => rt.world.heightAt(x, z);
  const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const surfaceNormal = (x, z) => normal.set(
    groundHeight(x - 0.15, z) - groundHeight(x + 0.15, z), 0.3,
    groundHeight(x, z - 0.15) - groundHeight(x, z + 0.15)
  ).normalize();
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x938571 }), 48);
  const roots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, 1, 5), new THREE.MeshLambertMaterial({ color: 0x786046 }), 192);
  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.45, 0, 0, 0.1, 0.85, 0.1, 0.3, 0, 0, 0, 0, -0.4, -0.1, 0.65, 0.1, 0, 0, 0.4,
    -0.25, 0, -0.25, 0.2, 0.55, 0.1, 0.35, 0, 0.3,
  ], 3));
  grassGeo.computeVertexNormals();
  const grass = new THREE.InstancedMesh(grassGeo, new THREE.MeshLambertMaterial({ color: 0x80734b, side: THREE.DoubleSide }), 72);
  const soilPos = [], soilColors = [], color = new THREE.Color();
  // 土の面は小さく分けて実際の斜面へ密着させる。平らな板を浮かせない。
  const soilPatch = (x, z, sx, sz, fx, fz, width, depth, tint) => {
    color.setHex(tint);
    const vertex = (u, v) => {
      const px = x + sx * u + fx * v, pz = z + sz * u + fz * v;
      soilPos.push(px, groundHeight(px, pz) + 0.003, pz);
      soilColors.push(color.r, color.g, color.b);
    };
    const across = Math.ceil(width / 0.25), along = Math.ceil(depth / 0.2);
    for (let j = 0; j < across; j++) for (let k = 0; k < along; k++) {
      const u0 = width * (j / across - 0.5), u1 = width * ((j + 1) / across - 0.5);
      const v0 = depth * (k / along - 0.5), v1 = depth * ((k + 1) / along - 0.5);
      vertex(u0, v0); vertex(u1, v0); vertex(u0, v1);
      vertex(u1, v0); vertex(u1, v1); vertex(u0, v1);
    }
  };
  for (let i = 0; i < 48; i++) {
    const z = -43 + (i % 16) * 1.65, side = i % 2 ? 1 : -1;
    const x = side * (4.2 + Math.floor(i / 16) * 4 + Math.sin(i * 2.4) * 0.7);
    const n = surfaceNormal(x, z);
    dummy.position.set(x + n.x * 0.12, groundHeight(x, z) + n.y * 0.12, z + n.z * 0.12);
    dummy.quaternion.setFromUnitVectors(up, n);
    dummy.rotateY(i * 1.7);
    dummy.scale.set(0.6 + (i % 4) * 0.23, 0.4 + (i % 3) * 0.2, 0.6);
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
    // 岩の脇に露出した土。草と根は踏む道から離す。
    soilPatch(x, z + 0.35, -1, 0, 0, 1, 0.7 + (i % 3) * 0.2, 0.35, i % 2 ? 0x79674f : 0x68573f);
    // 根を四つの短い節に分け、急な崖でも山肌から浮かせない。
    for (let j = 0; j < 4; j++) {
      const ax = x + j * 0.3, az = z + 0.45 + 0.08 * Math.sin(i + j);
      const bx = x + (j + 1) * 0.3, bz = z + 0.45 + 0.08 * Math.sin(i + j + 1);
      const ay = groundHeight(ax, az) + 0.035, by = groundHeight(bx, bz) + 0.035;
      dir.set(bx - ax, by - ay, bz - az);
      dummy.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      const length = dir.length();
      dummy.quaternion.setFromUnitVectors(up, dir.normalize());
      dummy.scale.set(0.65, length, 0.65); dummy.updateMatrix(); roots.setMatrixAt(i * 4 + j, dummy.matrix);
    }
  }
  for (let i = 0; i < 72; i++) {
    const x = (i % 2 ? 1 : -1) * (3.9 + (i % 5) * 1.8), z = -43 + Math.floor(i / 2) * 0.75;
    const n = surfaceNormal(x, z);
    dummy.position.set(x + n.x * 0.04, groundHeight(x, z) + n.y * 0.04, z + n.z * 0.04);
    dummy.quaternion.setFromUnitVectors(up, n); dummy.rotateY(i * 2.4);
    dummy.scale.setScalar(0.65 + (i % 3) * 0.25); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
  }
  // 登り口の横木は細い丸太にする。頂部を歩く地面の高さへ合わせる。
  const logs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.065, 1, 6), new THREE.MeshLambertMaterial({ color: 0x796044 }), 48 * 8);
  const a = ROAD_OTE[6], b = ROAD_OTE[7];
  for (let i = 0; i < 48; i++) {
    const diagonal = i < 32, t = diagonal ? (i + 0.5) / 32 : (i - 32 + 0.5) / 16;
    const dx = diagonal ? b[0] - a[0] : 0, dz = diagonal ? b[1] - a[1] : -13;
    const len = Math.hypot(dx, dz), fx = dx / len, fz = dz / len, sx = -fz, sz = fx;
    const x = diagonal ? a[0] + dx * t : 0, z = diagonal ? a[1] + dz * t : -30 + dz * t;
    // 横木の間は地続きの土。端の幅だけ揺らし、紙のような等幅の板を並べない。
    const width = 2.65 + 0.12 * Math.sin(i * 1.7), run = len / (diagonal ? 32 : 16);
    soilPatch(x, z, sx, sz, fx, fz, width, run + 0.015, i % 3 ? 0x766044 : 0x816c50);
    for (let j = 0; j < 8; j++) {
      const u0 = width * (j / 8 - 0.5), u1 = width * ((j + 1) / 8 - 0.5);
      const ax = x + sx * u0, az = z + sz * u0, bx = x + sx * u1, bz = z + sz * u1;
      const ay = groundHeight(ax, az) - 0.062, by = groundHeight(bx, bz) - 0.062;
      dir.set(bx - ax, by - ay, bz - az);
      dummy.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      const length = dir.length();
      dummy.quaternion.setFromUnitVectors(up, dir.normalize());
      dummy.scale.set(1, length + 0.008, 1); dummy.updateMatrix(); logs.setMatrixAt(i * 8 + j, dummy.matrix);
    }
  }
  const soilGeo = new THREE.BufferGeometry();
  soilGeo.setAttribute('position', new THREE.Float32BufferAttribute(soilPos, 3));
  soilGeo.setAttribute('color', new THREE.Float32BufferAttribute(soilColors, 3));
  soilGeo.computeVertexNormals();
  const soil = new THREE.Mesh(soilGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  for (const mesh of [rocks, roots, grass, logs, soil]) { mesh.receiveShadow = true; rt.scene.add(mesh); }
}

// 開戦の列を道の折れに沿わせる。下知が出たら通常の隊の並びへ戻す。
function openingColumn(rt, g, back) {
  const pts = [...ROAD_OTE.slice(0, 8), [0, -38]], slots = [];
  g.formation = 'column'; g.colW = 2; g.spacing = 1.15;
  for (let i = 0; i < g.initial; i++) {
    let d = back + Math.floor(i / 2) * 1.5, j = pts.length - 1;
    while (j > 1 && d > Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1])) {
      d -= Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); j--;
    }
    const a = pts[j - 1], b = pts[j], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const side = (i % 2 ? 1 : -1) * 0.55;
    slots.push({ x: b[0] - dx / len * d - dz / len * side, z: b[1] - dz / len * d + dx / len * side, heading: Math.atan2(dx, dz) });
  }
  const slotPos = g.slotPos;
  g.slotPos = function(i, n) { return rt.flags.step < 2 ? slots[i] : slotPos.call(this, i, n); };
  g.facing = g._face = slots[0].heading;
  placeGroup(rt, g, slots[0].x, slots[0].z);
  for (const u of g.units) { u.heading = slots[u.slot].heading; u.mesh.rotation.y = u.heading; u._sanRoad = ROAD_OTE; }
}

// 携帯の短い任務札にも人数を残す。補足欄を閉じても、次の手が分かる。
function zoneTask(rt, z, id = 'main', action = '') {
  const name = z.id === 'san' ? '三の郭' : z.id === 'ni' ? '二の丸' : '本丸';
  const enough = (z.friends || 0) >= z.need;
  const next = action || (!enough ? '味方を呼べ' : z.enemies ? '敵を払え' : `あと${Math.max(1, Math.ceil(z.hold - z.holdT))}秒守れ`);
  rt.obj(id, z.id === 'san' && rt.flags.step === 2 ? '仲間を六人集め、三の郭の柵を破れ' : `${name} 仲間 ${z.friends || 0}／${z.need}・${next}`, id === 'main' ? 'main' : 'side', true);
  if (z.id === 'san' && rt.flags.step === 2) rt.objProgress(id, `仲間 ${z.friends || 0}／${z.need}・${next}`);
  rt.flags.callZone = enough ? null : z;
}

// 山道では縦隊を保ち、曲輪へ入る時は二段の槍衾へ詰める。
function routeOld(g, pts, speed = 2.3, done = null) {
  if (!g) return;
  // 下知の短い道で、帰りにも使う山道全体を消さない。
  for (const u of g.units) if (!u._sanRoad) u._sanRoad = ROAD_OTE;
  let i = 0;
  const step = () => {
    if (!g.count || g.routed) return;
    if (i >= pts.length) { g.onArrive = null; if (done) done(); else { g.order = 'attack'; g.seekRange = g.isGun ? 50 : 16; } return; }
    const [x, z] = pts[i++];
    // 長い縦隊のままだと後列の持ち場が柵の外へ残り、郭の人数も到着待ちも満たせない。
    // 口の手前では共通の fitGroupSlots が幅を絞り、郭の中で二段に広がる。
    g.formation = [SAN_C, NI_C, HON_C].some((c) => x === c.x && z === c.z) ? 'yari' : 'column'; g.colW = 2;
    g.order = 'move'; g.dest = { x, z }; g.speed = speed; g.onArrive = step;
  };
  step();
}

// 大手も谷の手も、外柵の口を通る。横へ開いた兵が柵へ直進して止まらないようにする。
function sanDirect(army, u, goal) {
  const distance = Math.hypot(goal.x - u.pos.x, goal.z - u.pos.z);
  if (distance > 12 || army.wallBetween(u.pos, -1, goal)) return false;
  const n = Math.max(1, Math.ceil(distance));
  for (let i = 1; i <= n; i++) if (!army.world.walkable(
    u.pos.x + (goal.x - u.pos.x) * i / n, u.pos.z + (goal.z - u.pos.z) * i / n)) return false;
  return true;
}

function sanKuchiWay(army, u, goal) {
  if (u.team !== 0) return goal;
  // 近くの歩いて届く相手には直接寄る。斬り合いを次の曲がり角へすり替えない。
  if (sanDirect(army, u, goal)) return goal;
  // 松明を取りに戻る組も、外柵の中央の口を抜けてから左右へ回る。
  if (u.pos.z >= -64 && u.pos.z < -44 && goal.z >= -44 && goal.z < -30) {
    const q = u._sanWay || (u._sanWay = { x: 0, z: 0 });
    q.x = 0; q.z = Math.abs(u.pos.x) > 2.4 ? -49 : -35;
    return q;
  }
  if (u.pos.z > -44 && u.pos.z < -30 && goal.z < -36 && Math.abs(goal.x) < 20 && Math.abs(u.pos.x) > 2.4) {
    const q = u._sanWay || (u._sanWay = { x: 0, z: 0 });
    if (u.pos.z < -36 && Math.abs(u.pos.x) > 8) { q.x = Math.sign(u.pos.x) * 26; q.z = -35; }
    else { q.x = 0; q.z = -35; }
    return q;
  }
  if (u.pos.z > -30 || goal.z > -30) {
    // 攻め上りも下山も、現在地と行き先が道のどこにあるかで向きを決める。
    // 登りだけの添字を残すと、手当てや退却の際にも山の上へ戻してしまう。
    const road = u._sanRoad || ROAD_OTE;
    const from = u._sanFrom || (u._sanFrom = { x: 0, z: 0, s: 0, d: 0 });
    const to = u._sanTo || (u._sanTo = { x: 0, z: 0, s: 0, d: 0 });
    sanRoadPoint(road, u.pos, from); sanRoadPoint(road, goal, to);
    const q = u._sanWay || (u._sanWay = { x: 0, z: 0 });
  if (from.d > 9) { q.x = from.x; q.z = from.z; }
    else {
      const up = to.s > from.s;
      let index = up ? Math.floor(from.s) + 1 : Math.ceil(from.s) - 1;
      index = Math.max(0, Math.min(road.length - 1, index));
      if (Math.hypot(u.pos.x - road[index][0], u.pos.z - road[index][1]) < 1.5) index += up ? 1 : -1;
      if (index < 0 || index >= road.length || (up ? index >= to.s : index <= to.s)) return goal;
      q.x = road[index][0]; q.z = road[index][1];
    }
    return q;
  }
  if (u.pos.z < -44 || u.pos.z > -30 || goal.z >= -44 || Math.abs(goal.x) >= 20) return goal;
  const q = u._sanWay || (u._sanWay = { x: 0, z: 0 });
  // 横から中央へ直進すると z=-39 の逆茂木に当たる。端の外を回って南の帯へ出る。
  const side = Math.abs(u.pos.x);
  if (side > 8 && u.pos.z < -36) { q.x = Math.sign(u.pos.x) * 26; q.z = -35; }
  else if (side > 2.4) { q.x = 0; q.z = -35; }
  else { q.x = 0; q.z = -49; }
  return q;
}

function sanRoadPoint(road, p, out) {
  out.d = Infinity;
  for (let i = 0; i + 1 < road.length; i++) {
    const a = road[i], b = road[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < out.d) { out.x = x; out.z = z; out.s = i + t; out.d = d; }
  }
}

// 信長公記巻一の四手の攻め。短い強襲なので、史料にない付城を新設しない。
const MITSUKURI_JIN = [
  battleJin('四手の寄せ', 0, { x: CAMP.x, z: CAMP.z + 22 }, Math.PI, [
    ['mkNobu', '本陣', '織田信長', 3000, CAMP.x, CAMP.z + 22, 'odaCamp', 'eiraku', 'oda'],
    ['mkKino', '大手の仕寄り', '木下藤吉郎', 1500, CAMP.x, CAMP.z - 6, 'kino', 'oda'],
    ['mkNiwa', '西の仕寄り', '丹羽長秀', 2000, CAMP.x - 22, CAMP.z - 4, 'niwa', 'oda', 'sujikai'],
    ['mkSaku', '大手の控え', '佐久間信盛', 2000, CAMP.x + 24, CAMP.z - 4, 'saku', 'oda'],
    ['mkAsai', '東の仕寄り', '浅井新八', 1500, 58, -70, 'asai', 'oda'],
  ], '各手の人数・持ち場は仮定。上洛軍全体の人数ではない。'),
  battleJin('曲輪の守り', 1, HON_C, 0, [
    ['mkSan', '外の小曲輪', '名は伝わらない', 220, SAN_C.x, SAN_C.z, 'sanDef', 'rokkaku'],
    ['mkNi', '二の丸', '名は伝わらない', 260, NI_C.x, NI_C.z, 'niDef', 'rokkaku'],
    ['mkEast', '東の曲輪', '名は伝わらない', 140, 22, -98, 'asaiFoe', 'rokkaku'],
    ['mkYoshida', '本陣', '城将', 180, HON_C.x, HON_C.z, 'honDef', 'rokkaku'],
  ], '城兵の総数・城将の名は信長公記に記載なし。八百人と各持ち場は仮定。旗は六角の紋で表す。'),
];

const mitsukuri = {
  jinkei: MITSUKURI_JIN,
  noTaisho: true, // 城将一人の討死で即勝ち・討ち取りの副任務を出さない。
  noWake: true,   // 城の部隊だけを本物へ替え、遠景の兵は重ねない。
  // 普通・易では、満身から二十秒の近接戦でも退く余地を残す。
  meleeGrace: { rate: 0.035, burst: 0.07, interval: 0.9 },
  noticeLimit: 2,
  // 列や建物の当たりを残し、組の脇の空いた所から始める。
  spawn: { x: OPEN_PT[0] + 0.8, z: OPEN_PT[1], heading: Math.PI },
  world: {
    blockedHint: () => '味方の列の横を通れ。大手は中央の山道、谷は西の道へ回れ',
    seed: 1568,
    wind: [0.7, 0.7],   // 風向き・強さは景色の復元で、史料の断定ではない
    time: 'dusk',   // 申の刻の低い日から始める。攻めが滞っても夜へ移る。
    autumn: true,     // 旧暦九月：枯れ色の草と色づく木
    muddy: 0.15,
    terrainTags: true,
    paths: CASTLE_ROADS,
    moveWay: sanKuchiWay,
    castleRoute: (from, to) => from === 'san' && to === 'ni' ? [[0, -60], [KIDO.x, KIDO.z], [NI_C.x, NI_C.z]]
      : from === 'ni' && to === 'hon' ? [[0, -90], [0, -92], [HON_C.x, HON_C.z]] : null,
    height,
    tint(x, z, h, c) {
      if (h > 10 && roadDistance(x, z) > 3.8) {
        const patch = Math.sin(x * 0.37 + Math.sin(z * 0.23)) * Math.cos(z * 0.31 - x * 0.12);
        c.setRGB(0.34 + patch * 0.07, 0.38 + patch * 0.09, 0.23 + patch * 0.05);
      }
    },
    clear: (x, z) => roadDistance(x, z) < 3.8 || (Math.abs(x - CAMP.x) < 40 && Math.abs(z - CAMP.z) < 36) || MITSUKURI_PLAN.kuruwa.some((k) => x >= k.poly[0][0] && x <= k.poly[1][0] && z >= k.poly[0][1] && z <= k.poly[2][1]),
    // 近江の稲田（刈り入れ前）
    streams: [{ pts: [[-176, -30], [-166, 30], [-150, 96], [-162, 170]], w: 5, depth: 0.7 }],
    fieldStage: 'ripe',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (z < 0 || z > 150 || Math.abs(x - CAMP.x) < 42 || Math.abs(x) > 150) return 0;
      if ((Math.floor(x / 16) + Math.floor(z / 12)) % 4 === 1) return 0;
      const ex = Math.min(((x % 16) + 16) % 16, 16 - ((x % 16) + 16) % 16), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.6;
    },
    trees: 520,
    tufts: 3400,
    treeDensity: (x, z) => (z > 0 ? 0.2 : 1),
    groves: [{ x: -50, z: 20, r: 12, n: 16 }, { x: 60, z: 30, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (z < -150 || (z < -118 && Math.abs(x) > 40)),
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.lit = 0; F.litMask = 0; F.fow = true;
    // この戦だけ陰を明るくする。夜も月明かりの色で道と敵の姿を残す。
    F.slopeFill = new THREE.HemisphereLight(0xd6c6ae, 0x867252, 0.9);
    rt.scene.add(F.slopeFill);
    // 共通の地層の横筋を、箕作の攻め口では土・岩・草の不規則な斑に替える。
    const ground = W.terrain.material, compileGround = ground.onBeforeCompile;
    ground.onBeforeCompile = function(shader, renderer) {
      compileGround.call(this, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        'float band = fract(vWP.y * 0.42 + lay * 2.6 + texture2D(tMacro, vec2(sx * 0.03, vWP.y * 0.02)).r * 0.9);',
        'float band = texture2D(tMacro, (uX * an.x + uZ * an.z) * 0.075 + 0.37).r;'
      ).replace('vec3 cliff = mix(earth, stT, rockK);',
        `vec3 cliff = mix(earth * 1.22, stT * 1.12, rockK);
         vec2 rockUV = (uX * an.x + uZ * an.z) / max(0.001, an.x + an.z);
         float fissureNoise = texture2D(tMacro, rockUV * 0.18 + 0.53).r;
         float fissure = 1.0 - smoothstep(0.018, 0.065, abs(fract(rockUV.x * 0.38 + rockUV.y * 0.14 + fissureNoise * 1.7) - 0.5));
         cliff *= 1.0 - fissure * rockK * 0.32;
         cliff = mix(cliff, grass * vec3(0.95, 1.04, 0.78), smoothstep(0.45, 0.72, macro2) * 0.35);`);
    };
    ground.customProgramCacheKey = () => 'mitsukuriSoil';
    ground.needsUpdate = true;
    // 共通の弔いの台詞は、近くの味方が実際に倒れた後だけ通す。
    const battleSay = rt.say;
    rt.say = function(speaker, text, seconds) {
      if (speaker === '木下藤吉郎' && /仲間が討たれたか|無念じゃ|その働き、忘れぬぞ/.test(text) &&
        !this.army.units.some((u) => u.team === 0 && !u.civ && !u.isStruct && !u.alive &&
          Math.hypot(u.pos.x - this.player.u.pos.x, u.pos.z - this.player.u.pos.z) < 24 &&
          Math.abs(u.pos.y - this.player.u.pos.y) < 4)) return;
      return battleSay.call(this, speaker, text, seconds);
    };
    rokkakuTex();
    resetGates();

    // ---- 縄張り（castles/mitsukuri.js）：三の郭・二の丸・本丸。木戸は castle_plan.js に建てさせる ----
    const C = F.C = buildCastlePlan(rt, { ...MITSUKURI_PLAN, yagura: MITSUKURI_PLAN.yagura.filter((y) => y.id === 'monomi_ni') }, { ladders: true, baseHeight: baseWithDem, edgeW: 2.6, buildGates: true, buildTowers: true, team: 1, life: false });
    const sanC = C.kuruwa.san.centroid, niC = C.kuruwa.ni.centroid, honC = C.kuruwa.hon.centroid;
    F.gates = { kido: makeGate(rt, C.gateObjs.kido, { name: KIDO.name, guardTeam: 1 }) };
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { honmaru: 'HIST_A', ninomaru: 'HIST_B', sekirui: 'HIST_A', saku: 'HIST_B', kido: 'HIST_B', kirigishi: 'HIST_B', sanKuruwa: 'GAME_C',
      kannonjiNet: 'HIST_A', dayToNight: 'HIST_A', fourCommanders: 'HIST_A', torchLegend: 'HIST_B', honjinOda: 'GAME_C', honjinRokkaku: 'HIST_B', yoshidaIzumo: 'HIST_B' };
    // 三の郭（外側の防御線）：柵で囲い、南の柵の口に冠木の枠（戸は無い）。口の外に逆茂木を並べて寄せを鈍らせる
    rt.scene.add(kabukimon(W, 0, -44, 4.4, 0, { doors: false }));
    sakamogiRow(rt, [[-20, -39], [-9, -39]], { n: 3 }); sakamogiRow(rt, [[9, -39], [20, -39]], { n: 3 });
    // 新しい物見は床と梯子だけ。守兵は元の人数を保つ。
    for (const y of MITSUKURI_PLAN.yagura) if (y.id !== 'monomi_ni') C.towers.push({ id: y.id, kind: y.kind, ...monomi(rt, ...y.at, { name: y.name, team: 1 }) });
    entranceSteps(rt);
    approachDetail(rt);
    for (const [x, z] of [[-4, sanC.z - 10], [5, sanC.z - 10], [0, niC.z - 8]]) rt.scene.add(nobori(W, x, z, 'rokkaku', 6));
    // 柵の口の旗と篝火は開始地点から見える手前に置く。道と逆茂木は塞がない。
    for (const [x, z] of [[-5, -43], [5, -43]]) {
      rt.scene.add(nobori(W, x, z, 'rokkaku', 5));
      rt.scene.add(campfire(W, x, z)); W.addFire(x, z, { h: 0.5 });
    }
    // 縁の土塁は高さ関数と柵を共用。麓の飾り土塁は九十九折りを塞ぐので置かない。
    // 西面の低い野面積みと板笠の土塀だけ。総石垣や瓦・天守を補わない。
    const stoneBatch = makeKitBatch(), top = W.heightAt(-8, -96) + 0.25;
    ishigaki(W, [[-10.6, -93], [-10.6, -100]], { topY: top, minH: 2, maxH: 2.6, lean: 0.14, out: 1, batch: stoneBatch, scene: rt.scene });
    // 石垣の上の部分だけ、既存の柵を土塀へ替える。当たりの線を共用する。
    for (const wall of C.walls) if (wall.name === '本丸' && wall.seg && wall.seg[0] === -10 && wall.seg[2] === -10 && (wall.seg[1] + wall.seg[3]) / 2 > -100) {
      wall.mesh.visible = false;
      wall.mesh = dobei(W, wall.seg, { baseY: top, h: 1.4, ita: true, batch: stoneBatch });
      wall.noTarget = true; wall.fireProof = true;
    }
    kuruwaBldg(W, 'ido', 22, -98, 0, { ita: true, batch: stoneBatch });
    solidCircle(22, -98, 0.95);
    finalizeKitBatch(rt, stoneBatch);
    // 位置・広さ・用途は永禄期の近江の推定。各戸口は道につなぐ。
    const house = (x, z, w, d, rot, name, kind) => goten(rt, x, z, { w, d, rot, name, kind, team: 1, tile: false, naka: true, profile: 'mitsukuri', doorX: 0, noTarget: true });
    house(-12, -53, 5, 4, Math.PI / 2, '大手の番所', 'bansho');
    house(12, -51, 5, 4, -Math.PI / 2, '兵糧の蔵', 'kura');
    house(-9, -78, 8, 5, Math.PI / 2, '二の丸の長屋', 'nagaya');
    house(8, -87, 6, 4, 0, '二の丸の詰所', 'bansho');
    house(-17, -105, 4, 4, Math.PI / 2, '西の段の小祠', 'shrine');
    house(17, -98, 5, 4, -Math.PI / 2, '東の段の番所', 'bansho');
    rt.scene.add(tawara(W, 13, -52, 0, 4));
    // 麓の里は一つの形にまとめる。川は観音寺側の遠い麓へ縮めた推定。
    rt.scene.add(village(W, 92, 112, { n: 7, r: 22, seed: 15684 }));
    const farBatch = makeSimpleBatch();
    // ---- 繖山の観音寺城（遠く）：山腹の屋敷と旗 ----
    for (const [x, z, r] of [[-92, -150, 0.3], [-104, -160, 0.1], [-84, -166, -0.2], [-112, -176, 0.4]]) hut(W, x, z, 10, 6, r, { h: 3.4, wall: 0x7a6a50, ita: true, batch: farBatch });
    finalizeSimpleBatch(rt, farBatch);
    for (const [x, z] of [[-82, -146], [-108, -156]]) rt.scene.add(nobori(W, x, z, 'rokkaku', 7));
    // 観音寺城の火。遠い火の消失だけで父子の行き先を知る扱いにはしない。
    F.kanFires = [[-90, -146], [-100, -152], [-110, -160], [-84, -162], [-96, -170], [-116, -172], [-106, -182]].map(([x, z]) => W.addFire(x, z, { h: 0.3 }));

    // ---- 守り（箕作城・六角の衆。曲輪ごとに butai.js の部隊。siege_ai.js の城の頭で動かす） ----
    // 南の攻め手に正対し、曲輪の幅と奥行きの中に備えを置く。
    F.sanDef = makeButai(rt, { name: '坂の守り', team: 1, faction: 'rokkaku', kind: 'ashigaru', nominal: 220, nearReal: 14, maxReal: 14, armor: 0x574737, flag: RK.flag, at: sanC, facing: 0, lightWidth: 36, lightDepth: 18, real: 0 });
    F.sanDef.mix = { ashigaru: 0.75, bow: 0.25, samurai: 0, gun: 0, cavalry: 0 };
    F.sanDef.growReal(14);
    F.niDef = makeButai(rt, { name: '二の丸の槍と弓', team: 1, faction: 'rokkaku', kind: 'ashigaru', nearReal: 14, maxReal: 14, nominal: 260, armor: 0x33291f, flag: RK.flag, at: niC, facing: 0, lightWidth: 28, lightDepth: 22, real: 0 });
    // 遠景は徒歩の槍の形に保つ。共通の混成遠景が城内へ騎馬を足すのを避ける。
    F.niDef.mix = { ashigaru: 0.75, bow: 0.25, samurai: 0, gun: 0, cavalry: 0 };
    F.niDef.growReal(14);
    F.honDef = makeButai(rt, { name: '本丸の守備衆', team: 1, faction: 'rokkaku', kind: 'ashigaru', nearReal: 14, maxReal: 14, nominal: 180, armor: 0x33291f, flag: RK.flag, at: honC, facing: 0, lightWidth: 16, lightDepth: 14, real: 14 });
    F.defenders = [F.sanDef, F.niDef, F.honDef];
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    // 城将は本丸の館前で近習と守る。足軽に奥の間の一騎打ちを命じない。
    F.commandGuard = enemyGroup(rt, { fixed: true, name: '城将の旗本', faction: 'rokkaku',
      anchor: { x: honC.x, z: honC.z - 1 }, facing: 0, width: 5, formation: 'yari', aggro: 5 },
      dress([{ type: 'busho', n: 1, o: { name: '城将' } }, { type: 'samurai', n: 5 }], RK));
    F.commander = F.commandGuard.units[0];
    if (rt.castleSeat) rt.castleSeat.used = true;
    for (const b of F.defenders) b.order({ id: 'hold' });

    // ---- 織田勢：木下藤吉郎の手（自分の持ち場）、丹羽長秀の手、佐久間信盛の手、木戸を破る組 ----
    F.kino = allyGroup(rt, { fixed: true, name: '木下藤吉郎の手', anchor: { x: CAMP.x, z: CAMP.z - 6 }, facing: Math.PI, width: 12, aggro: 8, noRout: false },
      dress([{ type: 'busho', n: 1, o: { name: '木下藤吉郎', invuln: true } }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], ODA));
    F.kinoU = F.kino.units[0];
    F.niwa = allyGroup(rt, { fixed: true, name: '丹羽長秀の手', anchor: { x: CAMP.x - 22, z: CAMP.z - 4 }, facing: Math.PI, width: 12, aggro: 8, noRout: false },
      dress([{ type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 4 }], ODA));
    F.saku = allyGroup(rt, { fixed: true, name: '佐久間信盛の手', anchor: { x: CAMP.x + 24, z: CAMP.z - 4 }, facing: Math.PI, width: 12, aggro: 8, noRout: false },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.ram = allyGroup(rt, { fixed: true, name: '木戸を破る組', anchor: { x: CAMP.x + 10, z: CAMP.z + 10 }, facing: Math.PI, width: 5, aggro: 3, noRout: false, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.oda = [F.kino, F.niwa, F.saku, F.ram];
    F.gunK = allyGroup(rt, { fixed: true, name: '藤吉郎の鉄砲組', anchor: { x: CAMP.x + 4, z: CAMP.z - 10 }, facing: Math.PI, width: 8, aggro: 4, noRout: false }, dress([{ type: 'gun', n: 4 }], ODA));
    F.attackers = F.oda;
    F.attackTotal = F.oda.reduce((n, g) => n + g.count, 0);
    // 浅井新八の手：北東の尾根から本丸の東の切岸へ寄せる（遠景・AI。軽い作りの部隊で、数だけで押し合う）
    F.asai = makeButai(rt, { name: '浅井新八の手', general: '浅井新八', team: 0, faction: 'oda', kind: 'busho', nominal: 1500, armor: 0x2b3140, flag: 'oda', at: { x: 58, z: -70 }, facing: -Math.PI * 0.62, lightWidth: 40, lightDepth: 50, real: 1, nearReal: 6, farReal: 1, maxReal: 6 });
    // 浅井本人は残し、近くで戦う後続は徒歩の兵へ替える。
    F.asai.kind = 'ashigaru';
    F.asaiFoe = makeButai(rt, { name: '本丸の東の守り', team: 1, faction: 'rokkaku', kind: 'ashigaru', nominal: 140, armor: 0x33291f, flag: RK.flag, at: { x: 22, z: -98 }, facing: Math.PI / 2, lightWidth: 20, lightDepth: 14, real: 0, nearReal: 6, farReal: 0, maxReal: 6 });
    for (const b of [F.asai, F.asaiFoe]) b.order({ id: 'hold' });
    for (const [x, z] of [[62, -64], [54, -62]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: OPEN_PT[0] + 0.8, z: OPEN_PT[1] + 5 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 陣と旗 ----
    F.odaCamp = camp(rt, { x: CAMP.x, z: CAMP.z + 22, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 18, reserve: 260, runTo: { x: CAMP.x, z: CAMP.z - 6 } });
    // 北向きの本陣は、馬廻も信長の前（北側）を守る。
    F.odaCamp.guard.anchor.z = CAMP.z + 10;
    // 控え馬は山麓に置く。城内の守りを騎馬へ替えず、手綱を取れる機会を作る。
    const horse = buildHorse();
    horse.position.set(CAMP.x + 18, W.heightAt(CAMP.x + 18, CAMP.z), CAMP.z);
    horse.rotation.y = Math.PI;
    rt.scene.add(horse);
    const horses = rt.army.looseHorses || (rt.army.looseHorses = []);
    horses.push({ h: horse, heading: Math.PI, spd: 0, t: 20, calm: true,
      from: { team: 0, house: '織田', name: '', speed: 1, hp: 200, maxHp: 200 } });
    F.ramNext = allyGroup(rt, { fixed: true, name: '木戸破りの控え', anchor: { x: 14, z: 96 },
      facing: Math.PI, width: 5, formation: 'column', aggro: 2 }, dress([{ type: 'ashigaru', n: 10 }], ODA));
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 16, 0.3, 6));
    for (const [x, z, k] of [[CAMP.x - 8, CAMP.z + 14, 'oda'], [CAMP.x + 8, CAMP.z + 14, 'eiraku'], [CAMP.x - 26, CAMP.z + 4, 'oda'], [CAMP.x + 28, CAMP.z + 4, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const [x, z] of [[CAMP.x - 16, CAMP.z + 2], [CAMP.x + 18, CAMP.z + 6]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    for (const t of TORCH) rt.scene.add(tawara(W, t.x, t.z, 0.5, 2));
    // ---- 大軍（軽い作り）：上洛の織田勢と、繖山の六角勢 ----
    const DA = (x, z, w, d, count, facing, armor, tex, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: tex, seed, kind: 'spear', host: false });
    const OT = flagTexture('oda'), ET = flagTexture('eiraku');
    DA(-40, 96, 36, 14, 260, Math.PI, 0x2b3140, OT, 15681);
    DA(46, 100, 36, 14, 260, Math.PI, 0x2b3140, ET, 15682);
    DA(0, 140, 50, 14, 300, Math.PI, 0x2b3140, OT, 15683);
    // 繖山の山腹の六角の本陣：六角義賢と旗本、後ろに控え（軽い兵）
    F.rkCamp = camp(rt, { x: KC.x, z: KC.z, facing: Math.atan2(HON_C.x - KC.x, HON_C.z - KC.z), team: 1, faction: 'rokkaku', mon: 'rokkaku', armor: 0x33291f, general: { name: '六角義賢', hat: 'kabuto_m', haori: 0x33291f }, depth: true, guard: 15, reserve: 180, runTo: { x: -70, z: -130 } });

    // ---- 区域の網（siege_zones.js）：三の郭→二の丸（木戸）→本丸 ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'san', name: '三の郭（坂の上）', test: C.kuruwa.san.test, pos: sanC, need: 6, hold: 13, next: 'ni' },
        { id: 'ni', name: '二の丸（木戸構え）', test: (x, z) => F.step >= 3 && C.kuruwa.ni.test(x, z), pos: niC, need: 8, hold: 15, gate: KIDO.name, next: 'hon' },
        { id: 'hon', name: '本丸', test: (x, z) => F.step >= 4 && C.kuruwa.hon.test(x, z), pos: honC, need: 10, hold: 16, honmaru: true },
      ],
      links: [['san', 'ni'], ['ni', 'hon']],
      friendTeam: 0, enemyTeam: 1,
      totalDefenders: 1, // 遠景を数えない実兵数から城全体の八割損失を推定しない。
      commander: () => F.commander,
      noReinforce: () => true,
      quietRange: [0, 0], // 強襲を止めず、次の備えとの斬り合いへつなぐ。
      onFall: (id) => this.onZoneFall(rt, id),
      onHonmaru: () => { if (F.step >= 4) this.midB(rt); },
    });
    // ---- 城の頭（siege_ai.js）：守りは持ち場・門・退き ----
    F.DA = makeDefenseAI(rt, {
      posts: [
        { id: 'san', butai: F.sanDef, at: sanC, next: 'ni' },
        { id: 'ni', butai: F.niDef, at: niC, gate: KIDO.name, next: 'hon' },
        { id: 'hon', butai: F.honDef, at: honC },
      ],
      reserves: [],
      fallback: { x: 8, z: -114 },
    });
    // 攻めの頭（軍議で作戦を選ばなければ、夜目の利かなさに揺らぎを掛けて自分で選ぶ）
    F.AI_ROUTES = [
      { id: 'ote', defThickness: 2.6, pathLen: 70, chokeWidth: 3.6 },
      { id: 'tani', defThickness: 1.2, pathLen: 90, chokeWidth: 5 },
    ];

    rt.banner('箕作攻め', '申の刻。織田の四手、箕作山へ寄せる');
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '藤吉郎の旗へ寄り、先手の下知を聞け' : '藤吉郎の旗へ進み、下知を聞け', 'main');
    rt.marker('mk1', { x: HON_C.x, z: HON_C.z }, '箕作城', { h: 6 });
    rt.marker('mk2', { x: -98, z: -156 }, '観音寺城（繖山）', { h: 8 });
    rt.after(8, () => { rt.unmark('mk1'); rt.unmark('mk2'); });
    for (let k = 0; k < 6; k++) rt.after(1.5 + k * 2.2, () => {
      const x = (k % 3 - 1) * 16, z = -60 - (k % 2) * 16;
      rt.army.smoke(x, rt.world.heightAt(x, z) + 1.4, z, 0, 1);
      rt.army.play('gun', { x, z }, 0.8);
      if (k % 2) rt.army.play('eshout', { x, z: z - 10 }, 0.9);
    });
    sayKino(rt, 'ここが箕作の攻め口じゃ。柵を抜き、城へ押し上がるぞ', 4);
    rt.marker('kino', () => F.kinoU.alive ? F.kinoU.pos : null, '木下藤吉郎（下知）', { person: true });
    rt.addInteract('talk', () => F.kinoU.alive ? F.kinoU.pos : null, '藤吉郎の下知を聞く', () => { rt.uninteract('talk'); sayKino(rt, '者ども、かかれ！', 2); rt.after(2, () => this.climb(rt)); }, { r: 5 });
    rt.after(6, () => this.climb(rt));
    buildBattleJin(rt);
    [F.kino, F.niwa, F.saku, F.ram, F.gunK].forEach((g, i) => openingColumn(rt, g, [0, 16, 32, 47, 60][i]));
    // 守りは門の内で南を向く二段の槍と弓。全員が横一列で同じ姿にならない。
    for (const b of F.defenders) if (b.real) {
      b.setForm('yari'); b.real.width = b === F.sanDef ? 8 : 6;
      b.real.yariKneel = true; b.real.facing = b.real._face = 0;
      const at = b === F.sanDef ? { x: 0, z: -48 } : b === F.niDef ? niC : honC;
      placeGroup(rt, b.real, at.x, at.z);
      for (const u of b.real.units) { u.heading = 0; u.mesh.rotation.y = 0; }
    }
    rt.addInteract('callFriends', () => F.callZone && rt.t >= (F.callReadyAt || 0) ? rt.player.u.pos : null,
      '味方を呼ぶ', () => this.callFriends(rt), { r: 3, prio: 1 });
  },

  callFriends(rt) {
    const F = rt.flags, z = F.callZone;
    if (!z || F.ending || rt.over || rt.t < (F.callReadyAt || 0)) return;
    let best = null, distance = Infinity;
    for (const g of [...F.oda, F.ramNext]) {
      if (gone(g) || g === F.torchHelp?.group || (g === F.ram && F.step === 3 && !F.gatePass)) continue;
      let outside = 0;
      for (const u of g.units) if (siegeFighter(u) && !z.test(u.pos.x, u.pos.z)) outside++;
      if (!outside) continue;
      const c = g.center(), d = Math.hypot(c.x - z.pos.x, c.z - z.pos.z);
      if (d < distance) { best = g; distance = d; }
    }
    F.callReadyAt = rt.t + 12;
    if (!best) { rt.bark('来られる味方がいない。仲間を守れ'); return; }
    const c = best.center(), path = [];
    if (best === F.ramNext && !F.ram2) { F.ram2 = true; path.push(...ROAD_OTE.slice(0, 8)); }
    if (z.id === 'san' || c.z > -64) path.push([SAN_C.x, SAN_C.z]);
    if (z.id !== 'san' && c.z > -64) path.push([KIDO.x, KIDO.z + 3], [KIDO.x, KIDO.z - 3]);
    if (z.id === 'ni' || (z.id === 'hon' && c.z > -90)) path.push([NI_C.x, NI_C.z]);
    if (z.id === 'hon') path.push([0, -90], [0, -92], [HON_C.x, HON_C.z]);
    best.assault = null;
    routeOld(best, path, 2.6, () => { best.order = 'hold'; best.anchor = best.dest; });
    rt.bark('味方を呼んだ。旗のそばで迎えよ');
  },

  // ④ 日が傾く：三の郭を取ったら、松明を灯して攻め続ける
  dusk(rt) {
    const F = rt.flags;
    if (F.step >= 2.5 || F.ending || rt.over) return;
    F.step = 2.5; F.stepT = rt.t;
    rt.setPhase('torch');
    rt.banner(rt.world.timeKey === 'night' ? '夜攻めの支度' : '日が傾く', '松明を灯せ。攻めの手を緩めるな');
    nextObj(rt, rt.G.lord ? `松明の束に火を移させよ（${TORCH.length}束）` : `松明の束へ戻り、火を移せ（${TORCH.length}束）`);
    rt.obj('keepSan', '三の郭に味方六人以上を残せ', 'side');
    sayKino(rt, '火を移せ。松明を配り、攻め継ぐのじゃ', 3.5);
    F.torchHelp = { group: null, index: -1, hold: 0, tick: 0 };
    if (rt.G.lord) return;
    TORCH.forEach((t, i) => {
      rt.marker('t' + i, t, '松明', { h: 2 });
      rt.addInteract('t' + i, t, '松明の束に火を移す', () => this.light(rt, i), { r: 3.4, hold: 1.2 });
    });
  },
  light(rt, i, own = true) {
    const F = rt.flags;
    if (F.step !== 2.5 || F.ending || rt.over || !TORCH[i]) return;
    const t = TORCH[i];
    rt.uninteract('t' + i); rt.unmark('t' + i);
    if (F.litMask & (1 << i)) return;
    rt.world.addFire(t.x, t.z, { torch: true, h: 0.9 });
    F.litMask = (F.litMask || 0) | (1 << i);
    F.lit++;
    if (own) {
      F.ownLit = (F.ownLit || 0) + 1; rt.tracker.c.torch = F.ownLit;
      // 束で火を移した本人も一本を運ぶ。二本目を重ねて作らない。
      if (!F.playerTorch) F.playerTorch = carryTorches(rt.world, [rt.player.u]);
    }
    if (F.lit >= TORCH.length) this.night(rt);
    else rt.objProgress('main', `火入れ ${F.lit}／${TORCH.length}束・残る束へ`);
  },
  torchHelpTick(rt, dt) {
    const F = rt.flags, help = F.torchHelp;
    if (!help) return;
    help.tick += dt;
    if (help.tick < 0.5) return;
    const elapsed = help.tick; help.tick = 0;
    let i = 0;
    while (i < TORCH.length && (F.litMask & (1 << i))) i++;
    if (i >= TORCH.length) return;
    const t = TORCH[i];
    if (i !== help.index || gone(help.group) || !help.group.units.some(torchReady)) {
      let group = null, nearest = Infinity;
      for (const g of [F.niwa, F.saku, F.kino]) {
        if (gone(g)) continue;
        for (const u of g.units) {
          if (!torchReady(u)) continue;
          const d = Math.hypot(u.pos.x - t.x, u.pos.z - t.z);
          if (d < nearest) { group = g; nearest = d; }
        }
      }
      if (!group) return;
      help.group = group; help.index = i; help.hold = 0;
      group.order = 'move'; group.dest = { x: t.x, z: t.z }; group.formation = 'column'; group.colW = 2;
      group.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; };
    }
    const worker = help.group.units.find((u) => torchReady(u) && !(u.pinT > rt.army.time) && !u.atk && !u.swing && Math.hypot(u.pos.x - t.x, u.pos.z - t.z) < 3 && !rt.army.wallBetween(u.pos, -1, t));
    if (!worker || rt.army.nearestEnemy(worker, 6, (u) => !u.fleeing && !u.woundOut && !u.noTarget)) { help.hold = 0; return; }
    help.hold += elapsed;
    if (help.hold >= 1.2) this.light(rt, i, false);
  },
  // ⑥ 夜戦：松明を持って二の丸の木戸へ。
  night(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step >= 2.8) return;
    F.step = 2.8; F.stepT = rt.t; F.nightStarted = rt.t;
    F.torchHelp = null;
    for (let i = 0; i < TORCH.length; i++) { rt.uninteract('t' + i); rt.unmark('t' + i); }
    if (rt.world.timeKey !== 'night') rt.world.setTime('night');
    const W = rt.world;
    F.torches = carryTorches(W, F.kino.units.filter((u) => u.alive && u.type === 'ashigaru').slice(0, 6));
    sfx('horagai', 1); rt.after(1, () => sfx('taiko', 1));
    sayKino(rt, '松明を掲げよ！　足元を見定め、木戸へ詰めるのじゃ', 4);
    this.gateFight(rt);
  },

  // ②③ 夕方：軍議で選んだ道（無ければ攻めの頭が自分で選ぶ）で、外側の柵（三の郭）へ攻め上る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 2 || F.ending || rt.over) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('climb');
    rt.unmark('kino'); rt.uninteract('talk');
    sfx('horagai', 1); rt.after(1, () => sfx('taiko', 1));
    rt.banner('外側の柵', '山道を詰め、三の郭の柵の口へ寄せる');
    nextObj(rt, '仲間を六人集め、三の郭の柵を破れ');
    // 浅井新八の手が北東の尾根から寄せ、本丸の東の守りと押し合う（遠景）
    F.asai.order({ id: 'move', to: { x: 38, z: -88 } });
    rt.after(6, () => rt.bark('浅井新八の手、東の尾根へ寄せる'));
    F.strategy = window.__mitsukuriStrategy || F.strategy || null;
    if (F.strategy !== 'ote' && F.strategy !== 'tani') F.strategy = null;
    if (!F.strategy) {
      F.aiPicked = true;
      const picked = chooseRoute(F.AI_ROUTES, Math.random);
      F.strategy = (picked && picked.id) || 'ote';
      rt.bark(`下知、${F.strategy === 'tani' ? '西の谷' : '大手'}より寄せよ`);
    }
    this.runStrategy(rt, F.strategy);
    // 初めの一度だけ輪を見せる。配下のない身分でも「味方を呼ぶ」で六人を集められる。
    rt.after(5, () => {
      if (F.ending || rt.over || F.callShown) return;
      F.callShown = true;
      if (rt.squad.length) {
        const p = rt.player;
        p.cmdOpen = false; p.radial = true; p.radialKeyboard = true;
        p.radialSel = -1; p.radialPreview = -1; p.tabT = null;
        p.syncRadial(); rt.hud.updateRadial(rt);
        rt.hud.hint('「号令」の輪で「ついて来い」か「続け」を選ぶ。足りなければ「味方を呼ぶ」', null);
      } else rt.hud.hint('「味方を呼ぶ」を押す。仲間と柵の口を抜け、三の郭に六人集まる', null);
    });
    rt.player.u._sanRoad = F.strategy === 'tani' ? TANI_ATTACK_ROAD : ROAD_OTE;
    rt.marker('san', F.strategy === 'tani' ? { x: -26, z: -35 } : { x: 0, z: -44 }, F.strategy === 'tani' ? '西の谷から柵の口へ' : '三の郭の柵の口', { red: true });

  },

  // 軍議の作戦：①大手の夜攻め（正面から三の郭へ） ②谷から松明で回る（三の郭の守りを避け、二の丸の脇へ）
  runStrategy(rt, strat) {
    const F = rt.flags;
    for (const g of [F.kino, F.niwa, F.ram]) for (const u of g.units) u._sanRoad = strat === 'tani' ? TANI_ATTACK_ROAD : ROAD_OTE;
    if (strat === 'tani') {
      sayKino(rt, '旗を伏せ、西の谷を詰めよ。守りの脇を突くぞ', 4);
      routeOld(F.kino, TANI_ATTACK_ROAD.slice(4), 2.3);
      routeOld(F.niwa, TANI_ATTACK_ROAD.slice(3), 2.2);
      routeOld(F.saku, ROAD_OTE.slice(5, 8));   // 今いる坂から寄せ、正面の守りを引きつける。
      routeOld(F.ram, TANI_ATTACK_ROAD.slice(3));
    } else {
      sayKino(rt, '大手は狭いぞ。槍をそろえ、柵の口を突き崩せ！', 4);
      routeOld(F.kino, ROAD_OTE.slice(7, 9), 2.3);
      routeOld(F.niwa, ROAD_OTE.slice(6, 9), 2.2);
      routeOld(F.saku, ROAD_OTE.slice(5, 9), 2.2);
      routeOld(F.ram, ROAD_OTE.slice(6, 9));
    }
    // 坂の守りへ鉄砲を撃ちかける組（永禄のころなので四挺だけ）
    routeOld(F.gunK, [...ROAD_OTE.slice(6, 8), [6, -34]]);

  },

  // 区域が落ちた（siege_zones.js の onFall）
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (rt.over || F.ending) return;
    if (F.SZ?.byId[id]?.owner === 'enemy') {
      F[id + 'Fell'] = false;
      if (id === 'hon') F.honWait = false;
      rt.obj(F.step === 2.5 ? 'keepSan' : 'main', '味方と戻り、曲輪を奪い返せ', F.step === 2.5 ? 'side' : 'main');
      markZone(rt, id);
      return;
    }
    if (id === 'san' && !F.sanFell) {
      F.sanFell = true;
      rt.unmark('san');
      if (!F.sanAwarded) { F.sanAwarded = true; rt.award((t) => t.side.push('坂の守りを退けた'), '坂の守りを退けた'); }
      if (F.step < 2.5) this.dusk(rt);
      else if (F.step === 2.5) rt.obj('main', `残る松明の束に火を移せ（${F.lit}／${TORCH.length}）`, 'main');
      else if (F.step < 4) {
        rt.obj('main', F.gates.kido.opened ? '三の郭を保ち、木戸から二の丸へ' : '三の郭を保ち、丸太の組を守れ', 'main');
        rt.marker('gate', KIDO, F.gates.kido.opened ? '開いた木戸' : '木戸を破れ', { h: 4 });
      } else { rt.obj('main', '三の郭を保ち、本丸の敵を払え', 'main');
        if (!F.honFell) markZone(rt, 'hon');
      }
    } else if (id === 'ni' && !F.niFell) {
      F.niFell = true;
      rt.unmark('ni');
      this.inside(rt);
    } else if (id === 'hon' && !F.honFell) {
      F.honFell = true; rt.unmark('hon');
    }
  },
  // 坂を越えた後：木戸へ
  gateFight(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('gate');
    rt.banner('木戸へかかれ', '丸太の組、木戸へ詰める');
    nextObj(rt, '丸太の組を守り、木戸を破れ');
    rt.marker('gate', KIDO, '木戸を破れ', { h: 4 });
    F.ram.assault = () => (F.gates.kido.struct.alive ? F.gates.kido.struct : null);
    F.ram.aggro = 2;
    // 松明から戻る手には新しい下知を渡す。古い到着待ちで再び足を止めない。
    for (const g of [F.kino, F.niwa, F.saku]) if (!gone(g)) routeOld(g, [[SAN_C.x, SAN_C.z]]);
    if (!gone(F.ram)) routeOld(F.ram, [[SAN_C.x, SAN_C.z], [KIDO.x, KIDO.z + 3]], 2.3,
      () => { F.ram.order = 'assault'; });

  },
  // 木戸の内（二の丸が落ちた直後の演出）
  inside(rt) {
    const F = rt.flags;
    if (F.ending || rt.over) return;
    if (F.insideSaid) { rt.obj('main', '本丸へ進み、味方と敵を払え', 'main');
      if (!F.honFell) markZone(rt, 'hon'); return; }
    F.insideSaid = true; F.step = 4; F.stepT = rt.t;
    rt.setPhase('inside');
    rt.unmark('gate');
    if (F.gates.kido.breached) rt.award((t) => t.side.push('木戸を破った'), '木戸を破った');
    sfx('taiko', 1); rt.after(0.5, () => sfx('horagai', 0.9));
    rt.banner(F.gates.kido.breached ? '木戸、破れる' : '木戸、開く', '本丸の守備衆、槍をそろえて出る');
    sayKino(rt, 'ひるむな、押し込め！　今宵のうちに城を落とすぞ', 3.5);
    nextObj(rt, '本丸の敵を払い、味方十人以上で旗を守れ');
    F.ram.assault = null;
    for (const g of F.oda) if (!gone(g)) routeOld(g, [[NI_C.x, NI_C.z], [0, -90], [0, -92], [HON_C.x, HON_C.z]], 2.8);
    if (F.ram2 && !gone(F.ramNext)) { F.ramNext.assault = null; routeOld(F.ramNext, [[NI_C.x, NI_C.z], [0, -90], [0, -92], [HON_C.x, HON_C.z]], 2.8); }
    markZone(rt, 'hon');
  },

  // 三曲輪を押さえた時だけ落城。城将一人を討っても即勝ちにはしない。
  midB(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive || !F.sanFell || !F.niFell || !F.honFell) return;
    if (F.SZ) for (const z of F.SZ.zones) if (z.owner !== 'friend') return;
    // 味方が先に押さえても、足軽は本丸へ入り、持ち場を固めてから終える。
    if (!rt.G.lord && !F.C.kuruwa.hon.test(rt.player.u.pos.x, rt.player.u.pos.z)) {
      if (!F.honWait) {
        F.honWait = true;
        nextObj(rt, '本丸の旗へ寄り、味方と固めよ');
        rt.marker('hon', F.C.kuruwa.hon.centroid, '本丸の旗へ');
      }
      return;
    }
    F.step = 4.5; F.stepT = rt.t;
    this.win(rt);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('san'); rt.unmark('ni'); rt.unmark('hon'); rt.unmark('gate');
    rt.objDone('main'); rt.objDone('keepSan');
    if (F.ownLit) rt.award((t) => t.side.push(`松明を${F.ownLit}束灯した`), `松明を${F.ownLit}束灯し、夜攻めを支えた`);
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; if (F.nightStarted !== undefined && rt.t > F.nightStarted && rt.world.timeKey === 'night') t.special = { label: '夜のうちに箕作城を落とした', pts: 20 }; }, '箕作城を落とした');
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('六角勢、退く', '箕作城、落つ。本丸の守りを固めよ');
    sayKino(rt, `よく働いた、${nm(rt)}。深追いは無用じゃ。旗のもとへ集まれ！`, 5);
    rt.after(6, () => rt.say('', '――その夜、信長は箕作山に陣を置く。六角父子三人は退き、翌十三日、信長は観音寺城へ入った', 5));
    rt.after(11, () => rt.say('', '上洛の道が開いた。信長は京へ進み、義昭は将軍となる', 4));
    // 固有の後日談を共通の追撃で消さず、勝った組は曲輪を固める。
    for (const g of [...F.oda, F.gunK, F.ramNext]) {
      if (gone(g)) continue;
      g.assault = null; g.onArrive = null; g.dest = null;
      const c = g.center();
      g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.formation = 'yari';
    }
    for (const b of F.defenders) if (b.real && !gone(b.real)) {
      b.real.onArrive = null; b.real.order = 'path'; b.real.formation = 'column'; b.real.colW = 2;
      b.real.path = ROAD_URA.map((p) => [...p]); b.real.pathIdx = 0;
    }
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 16);
  },

  update(rt, dt) {
    const F = rt.flags;
    F.slopeFill.intensity = rt.world.timeKey === 'night' ? 0.5 : 0.9;
    KIT.backTick(rt);
    if (F.torches) F.torches.update();
    if (F.playerTorch) F.playerTorch.update();
    butaiTick(rt, dt);
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (rt.over || F.ending || !rt.player.u.alive) { F.callZone = null; return; }
    const pu = rt.player.u;
    if (pu.alive && pu.hp < pu.maxHp * 0.5 && (F.heavyWarnT ?? -31) + 30 < rt.t &&
      (rt.army.threats?.length || rt.army.nearestEnemy(pu, 8, (o) => !o.fleeing && !o.noTarget &&
        Math.abs(o.pos.y - pu.pos.y) < 3 && !rt.army.wallBetween(pu.pos, -1, o.pos)))) {
      F.heavyWarnT = rt.t;
      sayKino(rt, '深手じゃ。味方の後ろへ退け。命を捨てるな', 4);
    }
    // 曲輪の制圧を待って時刻を止めない。秒数は遊びの中での目安。
    if (rt.t >= 180 && rt.world.timeKey !== 'night') {
      rt.world.setTime('night');
      sayKino(rt, '闇が深いぞ。味方の声を頼りに進め', 3);
    }
    updateGates();
    if (F.SZ) F.SZ.tick(dt);
    if (!F.sixReady && F.SZ.byId.san.friends >= 6) {
      F.sixReady = true; F.failDeadline = Math.max(600, rt.t + 30);
    }
    if (F.DA) F.DA.tick(dt);
    if (rt.t >= (F.guardWatchAt || 0)) {
      F.guardWatchAt = rt.t + 0.8;
      for (const b of F.defenders) {
        const g = b.real;
        if (!g || g.routed || g.order !== 'hold') continue;
        for (const u of g.units) if (siegeFighter(u) && !u.target && !u.atk && !u.swing &&
          Math.hypot(u.pos.x - pu.pos.x, u.pos.z - pu.pos.z) < 30 && Math.abs(u.pos.y - pu.pos.y) < 4) {
          u.watch = pu; u.watchT = rt.army.time + 2;
        }
      }
    }
    if (F.callZone && (F.callZone.friends >= F.callZone.need || F.step < 2 || F.step >= 4.5 || (F.step === 3 && !F.gatePass))) F.callZone = null;
    // 本人の近くは本物どうしの打撃だけ。数による推定損耗を重ねない。
    if (F.step >= 2 && F.asai && Math.hypot(pu.pos.x - F.asai.pos.x, pu.pos.z - F.asai.pos.z) > 70 &&
      Math.hypot(pu.pos.x - F.asaiFoe.pos.x, pu.pos.z - F.asaiFoe.pos.z) > 70 &&
      Math.hypot(F.asai.pos.x - F.asaiFoe.pos.x, F.asai.pos.z - F.asaiFoe.pos.z) <= 20) lightClash(F.asai, F.asaiFoe, dt, 0.06);
    if (F.step === 2.5 && (rt.G.lord || rt.t - F.stepT > 25)) this.torchHelpTick(rt, dt);
    if (F.step === 3 && F.gates.kido.opened && !F.gatePass) {
      F.gatePass = true; F.ram.assault = null;
      rt.obj('main', F.gates.kido.breached ? '木戸を抜け、味方と二の丸を取れ' : '開いた木戸から二の丸へ入れ', 'main');
      rt.unmark('gate');
      markZone(rt, 'ni');
      for (const g of F.oda) if (!gone(g)) routeOld(g, [[KIDO.x, KIDO.z + 3], [KIDO.x, KIDO.z - 3], [NI_C.x, NI_C.z]], 2.8);
      if (F.ram2 && !gone(F.ramNext)) {
        F.ramNext.assault = null;
        routeOld(F.ramNext, [[KIDO.x, KIDO.z + 3], [KIDO.x, KIDO.z - 3], [NI_C.x, NI_C.z]], 2.8);
      }
    }
    if (F.honFell && F.niFell && F.sanFell) this.midB(rt);
    if (F.ending) return;
    if (F.step === 2.5 && rt.t >= (F.sanGuideAt || 0)) {
      F.sanGuideAt = rt.t + 1;
      const z = F.SZ.byId.san;
      zoneTask(rt, z, 'keepSan', '郭を守れ');
      zoneTask(rt, z, 'main', (z.friends || 0) < z.need ? '味方を呼べ' : `松明を灯せ ${F.lit}／${TORCH.length}`);
      if (!z.enemies && (z.friends || 0) < z.need) for (const g of F.oda) {
        if (gone(g) || g === F.torchHelp?.group || g.order === 'move' || g.order === 'path') continue;
        routeOld(g, [[SAN_C.x, SAN_C.z]], 2.3, () => { g.order = 'hold'; g.anchor = g.dest; });
      }
    }
    if (F.step >= 2 && F.step !== 2.5 && (F.step !== 3 || F.gatePass) && rt.t >= (F.zoneGuideAt || 0)) {
      F.zoneGuideAt = rt.t + 1;
      const id = !F.sanFell ? 'san' : F.step >= 3 && !F.niFell ? 'ni' : F.step >= 4 ? 'hon' : 'san';
      const z = F.SZ?.byId[id];
      if (z && z.owner !== 'friend') {
        const entered = id !== 'san' || z.friends > 0 || F.C.kuruwa.san.test(pu.pos.x, pu.pos.z);
        if (id === 'san' && entered && !F.sanEntered) {
          F.sanEntered = true;
          nextObj(rt, '仲間を六人集め、三の郭の柵を破れ');
          markZone(rt, 'san');
        }
        zoneTask(rt, z, 'main', id === 'san' && !F.sanEntered ? '柵の口へ進め' : '');
        if (!z.enemies && (z.friends || 0) < z.need) {
          let ready = 0;
          for (const g of F.oda) for (const u of g.units) if (siegeFighter(u)) ready++;
          const groups = F.gatePass && ready < z.need ? [...F.oda, F.ramNext] : F.oda;
          for (const g of groups) {
            if (gone(g) || g.order === 'path' || g.order === 'move' || g.order === 'assault') continue;
            // 集める時も郭の内へ広げる。縦隊の後列が口の外に残るのを防ぐ。
            const path = id === 'hon' ? [[0, -90], [0, -92], [z.pos.x, z.pos.z]]
              : id === 'ni' ? [[KIDO.x, KIDO.z + 3], [KIDO.x, KIDO.z - 3], [z.pos.x, z.pos.z]]
              : [[z.pos.x, z.pos.z]];
            if (g === F.ramNext && !F.ram2) {
              F.ram2 = true;
              path.unshift(...ROAD_OTE.slice(0, 9));
            }
            g.assault = null;
            routeOld(g, path, 2.3, () => { g.order = 'hold'; g.anchor = g.dest; });
          }
        }
      }
    }
    if (F.step === 3 && !F.gatePass) {
      if (F.ram.count < 4 && !F.ram2) {
        F.ram2 = true;
        const g = F.ramNext;
        if (g && g.count) {
          routeOld(g, [...ROAD_OTE.slice(0, 9), [KIDO.x, KIDO.z + 3]], 2.2, () => { g.order = 'assault'; g.assault = F.ram.assault; });
        }
        rt.objProgress('main', g && g.count ? '木戸前の敵を払い、控えの組を守れ' : '味方と木戸前の敵を崩せ');
        sayKino(rt, g && g.count ? '控えの者、丸太を取れ！　木戸前の敵を払うのじゃ' : '丸太の組が潰れたか。槍をそろえ、木戸へ押せ！', 3);
      }
    }
    if (!F.longWarn && rt.t >= 540) { F.longWarn = true; sayKino(rt, 'まだ落ちぬか。曲輪を奪え。手勢を失えば退くぞ', 4); }
    // 藤吉郎の手が怯んで退いただけでは負けにしない（立て直して戻る）。三人を切るか、藤吉郎が手傷で退いた時だけ。
    // その前に、崩れかけを声で知らせる
    if (F.step >= 2 && !F.ending && !F.kinoWarn && F.kino.count > 0 && (F.kino.routed || F.kino.morale < 35 || F.kino.count < 6)) {
      F.kinoWarn = true; rt.say('組頭', '旗を倒すな！　藤吉郎殿のもとへ寄れ、敵を払え！', 4);
    }
    // 六人が揃うまでは、時間や藤吉郎の隊の損耗で任務を打ち切らない。
    const loss = F.step >= 2 && (F.kino.count < 3 || F.kinoU.woundOut);
    if (F.sixReady && F.step < 4.5 && rt.canFailMission()) {
      if (loss && F.lossDeadline == null) F.lossDeadline = rt.t + 30;
      if (!loss) F.lossDeadline = null;
      const deadline = Math.min(F.failDeadline, F.lossDeadline ?? Infinity);
      if (rt.t >= deadline - 30 && F.warnDeadline !== deadline) {
        F.warnDeadline = deadline; F.failureReadyAt = rt.t + 30;
        rt.banner('間に合わぬ', 'あと三十秒。味方を呼び、曲輪を奪え');
      }
    }
    if (F.sixReady && rt.canFailMission() && rt.t >= Math.max(F.failureReadyAt ?? Infinity, Math.min(F.failDeadline, F.lossDeadline ?? Infinity)) && F.step < 4.5 && !F.ending) {
      F.ending = true; rt.tracker.main = false; rt.objFail('main');
      for (const id of ['kino', 'san', 'ni', 'hon', 'gate']) rt.unmark(id);
      rt.uninteract('talk');
      for (let i = 0; i < TORCH.length; i++) { rt.unmark('t' + i); rt.uninteract('t' + i); }
      rt.obj('retreat', '組を連れ、麓の陣へ退け', 'main');
      rt.banner('攻めを止め、麓へ退く');
      sayKino(rt, 'これまでじゃ。組を散らさず、麓へ退け！', 4);
      rt.finish({}, 8);
    }
  },

  onFinish(rt) {
    // 巻物の既存の知らせ欄へ渡す。戦功や史実の文は変えない。
    rt.hud.resultNotices.push({ text: '次は仲間を六人呼ぶ' });
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v === F.commander && v.group) { v.group.noRout = false; v.group.morale -= 40; if (k && k.isPlayer) rt.say('足軽', '城将を討ったで！', 3); }
  },
  onRout(rt, g) {
    // 同じ隊の知らせは一度だけ。ほかの隊とも三十秒あける。
    const F = rt.flags;
    if (g.team !== 1 || !g.name || g._routSaid || rt.t < (F.routSayT || 0) || Math.hypot(g.center().x - rt.player.u.pos.x, g.center().z - rt.player.u.pos.z) > 35) return;
    g._routSaid = true; F.routSayT = rt.t + 30;
    rt.say('足軽', `${g.name}が${rt.flags.step >= 2.8 ? '城の奥へ' : '上の郭へ'}逃げていくで！`, 2.5);
  },
};

// この局地の仮の人数。討死一人を数十人に水増ししない。全軍の残数とはしない。
mitsukuri.force = () => ({ a: 10000, a0: 10000, b: 800, b0: 800 });
mitsukuri.sides = { a: { name: '織田勢（仮の人数）', mon: 'oda' }, b: { name: '六角勢（仮の人数）', mon: 'rokkaku' } };
mitsukuri.noTaishoRaid = true;   // 短い強襲では殿の守りの襲来を出さない（A059）
mitsukuri.date = (rt) => `永禄十一年九月十二日　秋・${rt.world.timeKey === 'night' ? '夜' : rt.world.timeKey === 'dusk' ? '夕暮れ' : '夕方'}`;
mitsukuri.canSkip = () => ''; // 遠くの射撃・下知・時刻を一度に飛ばさない。
mitsukuri.history = '永禄十一年（1568）九月、織田信長は足利義昭を奉じて京へ上る兵を起こした。道をふさぐ南近江の六角義賢（承禎）・義治の父子は従わず、観音寺城と、その支えの和田山城・箕作城に兵を入れた。九月十二日、信長は佐久間信盛・木下藤吉郎・丹羽長秀・浅井新八に箕作城を攻めさせた。織田勢は申の刻から攻めかかり、夜のうちに城を落とした。藤吉郎が数百の松明を灯して夜に攻め上ったという話は、のちの伝えである。その夜、信長は箕作山に陣を置き、六角父子三人が退いた観音寺城へ翌十三日に入った。信長はこのあと京へ入り、義昭は十五代将軍となった。信長公記に城将の名・城兵の総数・天候の記載はない。四手の攻め口、曲輪の配置、木戸破り、風や地面の湿りは仮定。表示する織田一万・城兵八百は局地の仮の人数で、上洛軍全体や史料で確定した総数ではない。';
mitsukuri.lordAt = { x: 4, z: 74, r: 12, why: '箕作の麓の織田の陣（諸将に箕作攻めを命じた）' };
mitsukuri.lordSpawn = { x: 4, z: 70, heading: Math.PI };
mitsukuri.rts = true;
// 敗れた組も、登った大手道を縦隊で下る。斜面へ直進させない。
mitsukuri.withdrawRoute = (rt, g) => {
  if (g.team !== 0) return null;
  const from = { x: 0, z: 0, s: 0, d: 0 };
  sanRoadPoint(ROAD_OTE, g.center(), from);
  for (const u of g.units) u._sanRoad = ROAD_OTE;
  return [...ROAD_OTE.slice(0, Math.floor(from.s) + 1).reverse(), [CAMP.x, CAMP.z]];
};

// 軍議（gungi.js）：城を回して見て、道を一つ選ぶ
mitsukuri.gungi = (rt) => {
  if (!rt.G.lord) return null; // 足軽・組頭は全軍の軍議を開かない。
  const F = rt.flags;
  const G = {
    center: { x: 0, z: -70 }, dist: 150,
    landmarks: [
      { name: '三の郭', x: SAN_C.x, z: SAN_C.z }, { name: '木戸', x: KIDO.x, z: KIDO.z },
      { name: '二の丸', x: NI_C.x, z: NI_C.z }, { name: '本丸', x: HON_C.x, z: HON_C.z },
      { name: '西の谷', x: NISHI_TANI_X, z: -36 },
    ],
    lines: [
      { name: '三の郭', owner: '敵' }, { name: '二の丸', owner: '敵' }, { name: '本丸', owner: '敵' },
    ],
    units: [{ id: 'main', name: '木下藤吉郎の攻め口', group: () => F.kino }],
    routes: [
      { id: 'ote', name: '大手の坂を正面から攻め上る' },
      { id: 'tani', name: '西の谷を忍び、柵の口の脇へ回る' },
    ],
    default: { main: 'ote' },
    enemy: [
      { name: '坂の守り', known: false },
      { name: '木戸構えの弓', known: false },
      { name: '城将の衆', known: false },
    ],
    cinema: { attackers: { x: 0, z: -20 }, gate: { x: KIDO.x, z: KIDO.z }, defenders: { x: HON_C.x, z: HON_C.z } },
    onStart: (assign) => mitsukuri.onGungiStart(rt, assign),
  };
  if (window.__mitsukuriStrategy) { mitsukuri.onGungiStart(rt, { main: window.__mitsukuriStrategy }); return null; }
  if (/[?&]bot/.test(location.search)) return null;
  return G;
};
mitsukuri.onGungiStart = (rt, assign) => { rt.flags.strategy = assign.main || 'ote'; };

const nearIt = (b, pre) => {
  const u = b.player.u;
  let it = null, bd = Infinity;
  for (const x of b.interacts) if (x.id.startsWith(pre)) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
  return it ? { it, d: bd } : null;
};
// 性格の突進で、山道・松明・木戸前の下知を上書きしない。
mitsukuri.botOrders = true;
// 負けて退く時も、任務で登った道を逆にたどる。殿から直線で斜面へ逃げない。
mitsukuri.botWithdraw = (b, inp, { goTo }) => {
  goTo(b.player, inp, CAMP.x, CAMP.z, 3);
  inp.quickCmd = 'follow';
};
mitsukuri.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 傷は自然には戻らない。退避と手当ては共通の試し役の判断に任せ、任務へ戻る。
  b.botRest = false;
  if (F.step < 2) {
    const q = nearIt(b, 'talk');
    if (q) { if (q.d > 3) goTo(p, inp, q.it.pos.x, q.it.pos.z, 3); else inp.k.add('KeyE'); }
    return;
  }
  const e = strikeTarget(b, 12);
  // 斜面の向こうの兵を追い続けると、道案内と敵追いが競合して山道から進めない。
  // 届く相手へ寄り、届かない所からの打ち込みは受け、それ以外は下知の道を進む。
  if (e && (sanDirect(b.army, u, e.pos) || e.atk?.target === u ||
      e.swing?.target === u || (e.charging && e.target === u))) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    // 共通の頭と同じ反撃の間を保つ。性格の判断で構え直して突きを消さない。
    patientStrike(p, inp, e, d);
    // 道案内は曲がり角へ向きを替える。受ける時と反撃を待つ時は打ち手を向く。
    // 隙を待ちながら道へ向くと、構えを横から抜かれ、突きも敵へ届かない。
    if (inp.guardHold || p.botStrikeUntil > p.time || p.pending) {
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      inp.k.delete('KeyW');
    } else if (d > reach * 0.9) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.9);
    return;
  }
  inp.guardHold = false;
  if (F.step === 2.5) { const q = nearIt(b, 't'); if (q) { if (q.d > 1.6) goTo(p, inp, q.it.pos.x, q.it.pos.z, 1.2); else inp.k.add('KeyE'); } return; }
  if (F.step === 3 && !F.gatePass) { goTo(p, inp, 0, KIDO.z + 3, 1.5); return; }
  const tgt = !F.sanFell ? F.C.kuruwa.san.centroid : !F.niFell ? F.C.kuruwa.ni.centroid : F.C.kuruwa.hon.centroid;
  goTo(p, inp, tgt.x, tgt.z, 2);
};

export { mitsukuri };

// 比高２１０ｍ。盛り上げ量は地形の準備で麓の高さから一度だけ決める。曲輪間の段差は保つ。
const LIFT = { x: 0, z: -100, tx: 0, tz: -40, w: 30, R: 95, rise: 199 };
