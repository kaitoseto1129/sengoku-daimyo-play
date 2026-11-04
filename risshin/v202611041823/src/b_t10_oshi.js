// ======================================================================
// 豊臣編 10　忍城攻め（天正十八年・1590　六月〜七月　梅雨から夏）　docs/chapter2_toyotomi.md の 10
// 石田三成が忍城を囲み、長い堤（石田堤）を築いて水攻めにする。城は沼の中の浮き城で落ちず、
// 大雨で堤が切れて寄せ手の陣に水が来る。城代の成田長親らは守り通し、小田原の開城の後に城を明け渡す。
// 主人公は城主として三成の下で堤の一つの区を受け持つ。
// ①夜、堤を築く人夫を城の夜討ちから守る ②堤が出来、堰を切って川の水を入れる
// ③六月十八日の夜の大雨に、城兵が堤を切る。水に呑まれる陣から人夫と兵を丸墓山へ逃がす
// ④七月の総攻め：浅野長政・真田昌幸の手と浅瀬を渡り、佐間口の門へ攻め寄せる
// ⑤門を開いて打って出た正木丹波守の手を迎え撃つ ⑥退く城兵に続いて門の内（枡形）へ付け入り、二の丸の口の城兵を討つ
//   （docs/kaito_refs_1103 の山中城の付け入りの型。城は落ちず、小田原の開城の知らせで戦が終わる）
// 兵数（docs/battle_refs/t10_oshi.md）：寄せ手およそ二万三千、城方三千百十六（侍六十九・足軽四百二十・ほか雑兵）
// 地形：国土地理院の標高（asset_dem_oshi.js・行田）を、ゲームの 1 を実の 8m に縮めて細かな起伏だけ混ぜる。
// 忍城（北西）と丸墓山古墳（南東）の向きと間合いは実の位置を縮めたもの。座標：北が −z、東が +x。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, jinmaku, tawara, hut, yagura, kobune, kabukimon, tobira, bridgeBoard, bridgeWoodMaterial, castleBoardFence, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demDetail } from './dem.js';
import { STAGES } from './stages.js';
import { TEGARA_ON } from './merit.js';
import { victoryMoment } from './victory_moment.js';
import { distToPolyline } from './world.js';
import { paint } from './units_model.js';
import { rippleWater } from './world_water.js';
import { liteMat } from './world_vegetation_materials.js';
import { withGuard } from './toyo_bot.js';
import { KILLS, broke } from './stages.js';
import { KIT } from './b_nagashinojo.js';
import { addSite } from './map_sites.js';
const ID = 't10_oshi';
// 標高の素材（行田）を支度で読ませ、手柄の点と右上の段にこの戦を入れる（共通の表は直さず、ここから足す）
BATTLE_ASSETS[ID] = Object.freeze([...assetsForBattle(''), 'dem_oshi']);
TEGARA_ON.add(ID);
const s = (n) => (rt) => (rt.flags.step ?? 0) >= n;
// 携帯の横（844）の右上の札に一行で入る長さ（十八字まで）
const MISSIONS = ['浅瀬の口で、城の夜討ちを討つ', '堤の西の堰へ行き、堰を切る', '人夫と兵を連れ、丸墓山へ走る',
  '浅野勢と浅瀬を渡り、佐間口の門前へ', '佐間口の門前で、正木丹波守の手を討つ', '佐間口の門へ付け入り、枡形の敵を討つ'];
STAGES[ID] = MISSIONS.map((m, i) => (i ? [m, s(i + 1)] : [m]));

let dem = null;
useTerrain('dem_oshi', (d) => { dem = d; });

const XW = 190;                                  // 見えない壁（東西南北 ±190）
const CASTLE = { x: -95, z: -108 };              // 忍城の本丸（浮き城）
const BASIN = { x: -70, z: -80 };                // 城を囲む沼の中心
const MARU = { x: 120, z: 74 };                  // 丸墓山古墳（三成の陣）
const KU = { x: 0, z: 0 };                       // 主人公の受け持つ堤の区
const CAMP = { x: 26, z: 34 };                   // 堤の外の陣（低い所＝堤が切れると水が来る）
const WEIR = { x: -62, z: 30 };                  // 川の水を入れる堰
const BREAK = { x: 14, z: -6 };                  // 堤が切れる所
const FORD = { x: -30, z: -34 };                 // 城の口へ続く浅瀬の手前
const GATE = { x: -72, z: -84 };                 // 城の口
const START = { x: -8, z: 6 };                   // 堤の上（前は外の法の下で、堤の背に隠れて沼の水が見えなかった）
// 石田堤：沼の南東を弧に囲む。区は (−30,20)〜(30,−20)
const DIKE = [[-200, 12], [-110, 30], [-30, 20], [30, -20], [56, -90], [62, -200]];
const DIKE2 = [[30, -20], [76, 28], [MARU.x - 13, MARU.z - 11]];   // 石田堤は丸墓山につながる（docs/battle_refs/t10_oshi.md）
const dikeD = (x, z) => Math.min(distToPolyline(x, z, DIKE), distToPolyline(x, z, DIKE2));
// 忍城の縄張り（正保城絵図・行田市郷土博物館の模型）：沼に浮かぶ島の曲輪を木橋で結ぶ。石垣は無く、縁は土塁、上に狭間の板塀。天守は無い（御三階櫓は1702年）
const HON = { x: CASTLE.x, z: CASTLE.z, r: 12 };   // 本丸
const NI = { x: -78, z: -90, r: 8.5 };             // 二の丸（南東の縁に佐間口＝城の口）
const SAN = { x: -118, z: -96, r: 9 };             // 三の丸
const SUWA = { x: -102, z: -80, r: 7 };            // 諏訪曲輪
const TEN = { x: -70, z: -120, r: 7 };             // 天神曲輪
const ISLES = [HON, NI, SAN, SUWA, TEN];
const BRIDGES = [[NI, HON], [SAN, HON], [SUWA, HON], [TEN, HON], [SUWA, NI]];
const ISLE_TOP = 0.5;                             // 島の上は水を入れた後の水面より一尺ほど高いだけ（低い沼城）
const rimPt = (I, J, k = 0) => { const a = Math.atan2(J.z - I.z, J.x - I.x), r = I.r + k; return [I.x + Math.cos(a) * r, I.z + Math.sin(a) * r]; };
const BRIDGE_SEGS = BRIDGES.map(([I, J]) => [rimPt(I, J, -1), rimPt(J, I, -1)]);
const ISLE_GAPS = [...BRIDGES.flatMap(([I, J]) => [rimPt(I, J, -1.6), rimPt(J, I, -1.6)]), [GATE.x - 1.1, GATE.z - 1.1]];
const RIVER = [[-200, 64], [-130, 52], [-66, 36]];
const LAKE_LO = -2.3, LAKE_HI = -0.6;            // 沼の水面（堰を切る前・後）。前は -3.1 で沼の底とほぼ同じ高さになり、始めに水が見えなかった
const FLOOD_LO = -0.4, FLOOD_HI = 1.75;          // 堤が切れた後の陣の水面
const REAL_CAP = 200;
const FRONT = { x: GATE.x + 7, z: GATE.z + 7 };     // 佐間口の門の前（浅瀬の土橋の端）
const RAIDAT = { x: KU.x - 18, z: KU.z - 10 };  // 夜討ちを受け止める浅瀬の口（区の足軽が出て迎える所）
const INSIDE = { x: GATE.x - 3.2, z: GATE.z - 3.2 }; // 門の内の枡形

const HOJO = { armor: 0x2c2620, lace: 0x6a5030, flag: 'hojo' };
const ISHI = { armor: 0x24221f, lace: 0x3a3a4a, flag: 'ishida' };
const dress = (list, lk) => list.map((e) => ({ ...e, o: { ...lk, ...(e.o || {}) } }));
const live = (g) => !!g && g.units.some((u) => u.alive && !u.gone);
const fighting = (g) => !!g && !g.routed && g.units.some((u) => u.alive && !u.gone && !u.fleeing);
const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) < r;
const sm = (t) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };
const aliveReal = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone ? 1 : 0), 0);

// ---- 地形 ----
function base(x, z) {
  let h = 1 + 0.25 * Math.sin(x * 0.045 + 0.7) * Math.cos(z * 0.038) + 0.15 * Math.sin(x * 0.13 - z * 0.09);
  // 沼：城のまわりが低い（堰を切ると水が溜まる）
  const rb = Math.hypot(x - BASIN.x, z - BASIN.z);
  h -= 4.2 * (1 - sm((rb - 78) / 24));
  // 浮き城：沼の中の島の曲輪。縁に土塁を盛り、門と橋の口だけ切る
  for (const I of ISLES) {
    const d = Math.hypot(x - I.x, z - I.z);
    if (d > I.r + 6) continue;
    const k = 1 - sm((d - I.r) / 2.5);
    h = h * (1 - k) + ISLE_TOP * k;
    let cut = 1;
    for (const [px, pz] of ISLE_GAPS) cut = Math.min(cut, sm((Math.hypot(x - px, z - pz) - 1.6) / 1.6));
    h += 1.3 * (1 - sm(Math.abs(d - (I.r - 1.6)) / 1.8)) * cut;
  }
  // 城の口へ続く浅瀬（水を入れた後も膝ほど）と、島を結ぶ木橋の下の土の道（橋の下は浅い）
  const dc = distToPolyline(x, z, [[GATE.x, GATE.z], [FORD.x, FORD.z], [KU.x - 8, KU.z - 8]]);
  h = Math.max(h, (LAKE_HI - 0.35) * (1 - sm((dc - 3) / 4)) + h * sm((dc - 3) / 4));
  for (const [a, b] of BRIDGE_SEGS) { const db = distToPolyline(x, z, [a, b]); if (db < 5) h = Math.max(h, (LAKE_HI - 0.5) * (1 - sm((db - 1.5) / 3)) + h * sm((db - 1.5) / 3)); }
  // 丸墓山（日本一の円墳・頂が平ら）と、東の小高い台
  const dm = Math.hypot(x - MARU.x, z - MARU.z);
  h += 10 * (1 - sm((dm - 4) / 18)) + 2 * gauss(x, z, MARU.x + 30, MARU.z + 30, 2400);
  // 石田堤：土を盛った長い土手（上は三歩ほどの平ら）。丸墓山まで伸びる
  const dd = dikeD(x, z);
  h += 3.6 * (1 - sm((dd - 1.6) / 5));
  // 川筋
  const dr = distToPolyline(x, z, RIVER);
  h -= 1.6 * (1 - sm((dr - 2) / 5));
  return h;
}
function height(x, z) {
  const h = base(x, z);
  return dem ? h + demDetail(dem, x, z, { xy: 8, win: 60, scale: 0.12 }) : h;
}

// 人夫の背の土俵（堤を築く土を詰めた藁の俵を二つ、縄で背負う）。形は全員で共用する
let dohyo = null;
function dohyoLoad() {
  if (dohyo) return dohyo;
  const parts = [];
  for (const [y, z] of [[1.3, -0.3], [1.52, -0.36]]) {
    const b = new THREE.CylinderGeometry(0.17, 0.17, 0.58, 9, 2); const p = b.attributes.position;
    for (let v = 0; v < p.count; v++) { const k = Math.abs(p.getY(v)) > 0.2 ? 0.72 : 1; p.setX(v, p.getX(v) * k); p.setZ(v, p.getZ(v) * k); }   // 俵の両端をすぼめる
    b.computeVertexNormals(); b.rotateZ(Math.PI / 2); b.translate(0, y, z);
    parts.push(paint(b, 0xa58a55));
    for (const x of [-0.17, 0.17]) { const r = new THREE.TorusGeometry(0.172, 0.014, 4, 10); r.rotateY(Math.PI / 2); r.translate(x, y, z); parts.push(paint(r, 0x5e4a2c)); }
  }
  dohyo = mergeGeometries(parts, false); for (const g of parts) g.dispose();
  return dohyo;
}

// ---- 沼と葦：水面は形一つずつ。上げ下げは位置だけ（毎コマ new しない） ----
function waters(rt) {
  const F = rt.flags;
  // 沼の水面は川と同じ作り（空を映す・風のさざ波）。夜も月明かりの空が映り、地面と見分けられる
  const lakeMat = rippleWater(liteMat({ color: 0x6a7a78, roughness: 0.2, metalness: 0, envMapIntensity: 0.8 }), 0.6, 0.8, 3.5, rt.world.hemi?.color, false, null, null, false, true);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(108, 48), lakeMat);
  lake.rotation.x = -Math.PI / 2; lake.position.set(BASIN.x, LAKE_LO, BASIN.z); lake.renderOrder = 2;
  rt.scene.add(lake);
  const floodMat = new THREE.MeshLambertMaterial({ color: 0x6a5e46, transparent: true, opacity: 0.88, depthWrite: false });
  const flood = new THREE.Mesh(new THREE.CircleGeometry(96, 48), floodMat);
  flood.rotation.x = -Math.PI / 2; flood.position.set(CAMP.x + 14, FLOOD_LO, CAMP.z + 10); flood.visible = false; flood.renderOrder = 2;
  rt.scene.add(flood);
  // 切れた堤から落ちる濁り水（板一枚）
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.2), floodMat);
  fall.position.set(BREAK.x + 2, rt.world.heightAt(BREAK.x, BREAK.z) + 0.8, BREAK.z + 2);
  fall.rotation.set(-0.9, Math.atan2(1, 1), 0); fall.visible = false;
  rt.scene.add(fall);
  F.lake = lake; F.flood = flood; F.fall = fall; F.lakeY = LAKE_LO; F.floodY = FLOOD_LO;
}
function reeds(rt) {
  const W = rt.world, h01 = (k) => { const v = Math.sin(k * 12.9898) * 43758.5453; return v - Math.floor(v); };
  const pts = [];
  for (let i = 0; pts.length < 520 && i < 6000; i++) {
    const a = h01(i) * Math.PI * 2, r = 60 + h01(i + 0.5) * 50, x = BASIN.x + Math.cos(a) * r, z = BASIN.z + Math.sin(a) * r;
    if (dikeD(x, z) < 7 || ISLES.some((I) => near({ x, z }, I, I.r + 3)) || BRIDGE_SEGS.some(([a, b]) => distToPolyline(x, z, [a, b]) < 3)) continue;
    pts.push([x, z, 0.8 + h01(i + 3) * 0.7, h01(i + 4)]);
  }
  const blades = [];
  for (let b = 0; b < 7; b++) {
    const a = b * 2.4, lean = 0.12 + (b % 3) * 0.08, hgt = 1.3 + (b % 4) * 0.22;
    const g = new THREE.PlaneGeometry(0.07, hgt, 1, 2), pp = g.attributes.position;
    for (let v = 0; v < pp.count; v++) { const y = pp.getY(v) + hgt / 2; pp.setX(v, pp.getX(v) * (1 - y / hgt * 0.8)); pp.setY(v, y); pp.setZ(v, y * y * lean); }
    g.rotateY(a); g.translate(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14);
    const c = pp.count, cl = new Float32Array(c * 3);
    for (let v = 0; v < c; v++) { const y = pp.getY(v) / hgt; cl[v * 3] = 0.3 + y * 0.3; cl[v * 3 + 1] = 0.36 + y * 0.2; cl[v * 3 + 2] = 0.16 + y * 0.1; }
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.deleteAttribute('uv');
    blades.push(g);
  }
  const geo = mergeGeometries(blades); for (const g of blades) g.dispose();
  const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), pts.length);
  const o = new THREE.Object3D();
  pts.forEach(([x, z, sc, v], i) => { o.position.set(x, W.heightAt(x, z) - 0.05, z); o.rotation.set(0, v * 6.28, 0); o.scale.set(sc, sc * (1 + v * 0.5), sc); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
  m.computeBoundingSphere(); rt.scene.add(m);
}
// 浮き城：沼に浮かぶ五つの島の曲輪。土塁の上に狭間の板塀（屏風に折って横矢を掛ける）、木橋、佐間口の冠木門と枡形、井楼櫓、屋形
function castle(rt) {
  const W = rt.world, add = (o) => { if (o) rt.scene.add(o); };
  // 板塀（狭間あり・壊せる）。全部を一つの束にまとめて描く（区画の束の遠い粗い形では薄い板が消え、浅瀬から塀が見えなかった）
  const wb = makeSimpleBatch(); wb.mergeFence = true;
  const wall = (pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      if (len < 0.3) continue;
      const seg = [ax, az, bx, bz], s = rt.army.addStruct({ seg, nx: -(bz - az) / len, nz: (bx - ax) / len, hp: 520, maxHp: 520, team: 1, name: '柵', idx: i });
      s.samaStep = 1.5; s.kind = '板塀';
      s.mesh = castleBoardFence(W, seg, { h: 2.4, samaStep: 1.5, batch: wb });
    }
  };
  // 板塀：島ごとに、橋と門の口を空けて輪に回す
  for (const I of ISLES) {
    const rw = I.r - 1.6, gaps = ISLE_GAPS.filter(([px, pz]) => Math.abs(Math.hypot(px - I.x, pz - I.z) - rw) < 0.5).map(([px, pz]) => Math.atan2(pz - I.z, px - I.x));
    const N = Math.max(8, Math.round(Math.PI * 2 * rw / 4.5)), half = 2.4 / rw;
    const open = (a) => gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < half);
    let arc = [];
    const flush = () => { if (arc.length > 1) wall(arc); arc = []; };
    const g0 = gaps.length ? gaps[0] + half : 0;
    const P = (i) => { const a = g0 + i / (N * 4) * Math.PI * 2, rr = rw * (1 + (Math.round(i / 4) % 2 ? 0.05 : -0.03)); return [I.x + Math.cos(a) * rr, I.z + Math.sin(a) * rr]; };   // 屏風折れ
    for (let i = 0; i <= N * 4; i++) {
      if (open(g0 + i / (N * 4) * Math.PI * 2)) { if (arc.length && (i - 1) % 4) arc.push(P(i - 1)); flush(); continue; }
      if (i % 4 && i !== N * 4 && arc.length) continue;
      arc.push(P(i));
    }
    flush();
  }
  // 木橋：板の床と両の桁、水に立つ橋脚
  const boards = [];
  for (const [[ax, az], [bx, bz]] of BRIDGE_SEGS) {
    const L = Math.hypot(bx - ax, bz - az), rot = Math.atan2(bx - ax, bz - az), y = Math.max(W.heightAt(ax, az), W.heightAt(bx, bz)) + 0.12;
    const put = (g, lx, ly, lz) => { g.rotateY(rot); g.translate(ax + (bx - ax) * lz / L + Math.cos(rot) * lx, y + ly, az + (bz - az) * lz / L - Math.sin(rot) * lx); boards.push(g); };
    for (let s = 0.2; s < L; s += 0.38) put(bridgeBoard(2.6, 0.1, 0.34, true), 0, 0, s);
    for (const sx of [-1.2, 1.2]) { put(bridgeBoard(0.16, 0.22, L, true), sx, -0.16, L / 2); put(bridgeBoard(0.1, 0.1, L, true), sx, 0.75, L / 2); }
    for (let s = 1.6; s < L - 1; s += 2.6) for (const sx of [-1.2, 1.2]) { put(bridgeBoard(0.2, 3.2, 0.2, true), sx, -1.6, s); put(bridgeBoard(0.08, 0.85, 0.08, true), sx, 0.38, s); }
  }
  if (boards.length) { const g = mergeGeometries(boards); for (const b of boards) b.dispose(); const m = new THREE.Mesh(g, bridgeWoodMaterial()); m.castShadow = m.receiveShadow = true; rt.scene.add(m); }
  // 佐間口（二の丸の南東）：冠木門。内は塀で折れて（枡形）まっすぐ入れない。脇の井楼櫓から横矢
  const gx = GATE.x - 1.1, gz = GATE.z - 1.1, ux = -Math.SQRT1_2, uz = -Math.SQRT1_2, px = Math.SQRT1_2, pz = -Math.SQRT1_2;
  add(kabukimon(W, gx, gz, 4.2, -Math.PI * 3 / 4, { doors: false }));
  wall([[gx + ux * 4.2 - px * 0.8, gz + uz * 4.2 - pz * 0.8], [gx + ux * 4.2 + px * 3.4, gz + uz * 4.2 + pz * 3.4], [gx + ux * 0.8 + px * 3.4, gz + uz * 0.8 + pz * 3.4]]);
  finalizeSimpleBatch(rt, wb);
  const ya = Math.atan2(GATE.z - NI.z, GATE.x - NI.x);
  add(yagura(W, NI.x + Math.cos(ya - 0.62) * (NI.r - 2.6), NI.z + Math.sin(ya - 0.62) * (NI.r - 2.6), {}));
  const ha = Math.atan2(NI.z - HON.z, NI.x - HON.x);
  add(yagura(W, HON.x + Math.cos(ha + 0.5) * (HON.r - 3), HON.z + Math.sin(ha + 0.5) * (HON.r - 3), {}));
  // 屋形（板葺き）：本丸に城代の屋形と台所、三の丸と諏訪曲輪に小屋
  add(hut(W, HON.x - 3, HON.z - 4, 10, 7, 0.3, { roof: 0x4a4038 }));
  add(hut(W, HON.x - 5, HON.z + 4, 7, 5, -0.2, { roof: 0x4a4038 }));
  add(hut(W, SAN.x - 1, SAN.z, 7, 5, 0.5, { roof: 0x4a4038 }));
  add(hut(W, SUWA.x, SUWA.z - 0.5, 4, 3, 0.2, { roof: 0x4a4038 }));
  for (const [x, z] of [[HON.x + 5, HON.z - 6], [HON.x - 8, HON.z], [HON.x + 2, HON.z + 8], [NI.x + 1, NI.z - 4], [NI.x - 3, NI.z + 2], [SAN.x + 4, SAN.z - 3], [TEN.x, TEN.z], [SUWA.x + 3, SUWA.z + 2]]) add(nobori(W, x, z, 'hojo', 6));
}
// 寄せ手の陣：堤の外の低い所に陣幕と旗、俵。丸墓山の上に三成の陣
function camps(rt) {
  const W = rt.world, F = rt.flags;
  rt.scene.add(jinmaku(W, CAMP.x, CAMP.z, 14, 10, 4, { mon: 'ishida' }));
  F.campFlags = [[CAMP.x - 8, CAMP.z - 7], [CAMP.x + 8, CAMP.z - 7], [CAMP.x, CAMP.z + 8]].map(([x, z]) => { const f = nobori(W, x, z, 'ishida', 5); rt.scene.add(f); return f; });
  for (const [x, z, r] of [[KU.x + 4, KU.z + 9, 0.6], [KU.x - 10, KU.z + 14, 0.4], [KU.x + 14, KU.z + 2, 0.8]]) rt.scene.add(tawara(W, x, z, r, 6));
  rt.scene.add(jinmaku(W, MARU.x, MARU.z, 12, 9, 4, { mon: 'ishida' }));
  for (const [dx, dz] of [[-6, -5], [6, -5], [0, 6]]) rt.scene.add(nobori(W, MARU.x + dx, MARU.z + dz, 'ishida', 7));
  // 見せかけの軍勢・軽い作りの乱戦は置かない（kaito AA・AF・AQ6）。寄せ手の厚みは、本物の組の後ろに付く控え（寄れば本物の兵に替わる）で見せる
  addSite(rt, 'fort', MARU.x, MARU.z, '丸墓山（石田三成の陣）');
  // 佐間口の扉（閉じている。打って出る時に開く）。門の口は扉の当たりで塞ぐ
  const gx = GATE.x - 1.1, gz = GATE.z - 1.1, px = Math.SQRT1_2, pz = -Math.SQRT1_2;
  F.door = tobira(W, gx, gz, 4.0, -Math.PI * 3 / 4, { h: 2.9 });
  rt.scene.add(F.door);
  F.doorSt = rt.army.addStruct({ seg: [gx - px * 2.1, gz - pz * 2.1, gx + px * 2.1, gz + pz * 2.1], nx: Math.SQRT1_2, nz: Math.SQRT1_2,
    hp: 99999, maxHp: 99999, team: 1, name: '佐間口の門', mesh: F.door });
}

// 打って出た二手（正木丹波守・甲斐姫）の討った数と、退かせるのに要る数（六割）。二手目が出るまでは数を出さない
function sortieCount(F) {
  if (F.sorties.length < 2) return null;
  // 討てない正木丹波守は数えない。逃げ出した者は討った数に入れる（goals5.js の t10_oshi と同じ数え方）
  let all = 0, down = 0;
  for (const g of F.sorties) for (const u of g.units) { if (u.invuln) continue; all++; if (!u.alive || u.gone || u.fleeing) down++; }
  const need = Math.ceil(all * 0.6);
  return need ? [Math.min(down, need), need] : null;
}
// 時が飛ぶ所で、本人と組を次の場所へ移す（歩くだけの間を作らない。kaito AT7・AT10）
function warp(rt, x, z, heading) {
  const P = rt.player, u = P.u;
  const put = (o, px, pz) => {
    o.pos.set(px, rt.world.heightAt(px, pz), pz);
    if (o.vel) o.vel.x = o.vel.y = o.vel.z = 0;
    if (o.push) { o.push.x = 0; o.push.z = 0; }
    if (o.mesh) o.mesh.position.copy(o.pos);
  };
  put(u, x, z);
  u.heading = heading; P.yaw = heading; P.camYawOff = 0;
  if (P.vel) P.vel.x = P.vel.y = P.vel.z = 0;
  (rt.squad || []).forEach((o, i) => { if (o.alive && !o.gone) put(o, x - Math.sin(heading) * (2 + (i >> 2)) + ((i % 4) - 1.5) * 1.3, z - Math.cos(heading) * (2 + (i >> 2))); });
}
// 佐間口の扉を開く（打って出る時。退く時も閉め切れない）
function openDoor(rt) {
  const F = rt.flags;
  if (F.doorOpen) return;
  F.doorOpen = true;
  F.door?.userData.open?.();
  if (F.doorSt) { F.doorSt.alive = false; F.doorSt.opened = true; }
  sfx('taiko', 0.9);
}

const t10_oshi = {
  missionStyle: 'lesson',
  noCouriers: true, noTaisho: true, noReserve: true, noWake: true,
  frontlineDensity: false,
  enemyTactics: false,
  prelude: false,
  playerAtkMax: 3,
  missionSingleLine: true, hideGuideSteps: true, noPlayerFoot: true,
  // 行き先は頭上の印一つ（kaito AL・AS・AV15）。ついていく相手の青い印は出さない。名札は近くの将だけ
  noLeaderFollow: true, nameRange: 30, goalSignOnly: true,   // 本丸の城代（成田長親）の名と命の棒を門の前から見せない（kaito AS：総大将は討てる所に見せない）
  // 時が飛ぶ所だけ、画面の真ん中に次の目標を短く出す（kaito AT7）
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /^(六月十八日の夜|七月の総攻め)/.test(t),
  nearbyAllySignLimit: 0, foeMarks: true, enemyTriangleSigns: true, foeMarkRange: 30,
  missionPinCaption: '',
  noFrontFill: true,          // 共通の奥の乱戦は沼の水の上に立ってしまう（水面が見えず、水攻めの広さが出ない）。乱戦は土橋の上に置く（camps）
  learningFight: true, playerTaken: 0.45, playerRegen: 0.02,
  autoTargetCamera: true, steadyMeleeCamera: true, closeCombatAssist: true,
  noWinCrane: true, compactIntro: true,
  introText: () => '石田三成の下で、忍城を囲む堤の一つの区を受け持つ。夜は城から打って出てくる。浅瀬の口で、夜討ちを討て。',
  minutes: 14,
  spawn: { x: START.x, z: START.z, heading: Math.atan2(-1, -1) },
  world: {
    seed: 1590,
    time: 'night',
    muddy: 0.6,
    height,
    paths: [DIKE, DIKE2],
    mountainScale: 0.12, mountainHaze: 0.85,
    mergeFenceBatches: true,                   // 忍城の板塀を一つの束に（castle）   // 関東の平らな低地。近くに山は無い（遠い秩父を低く霞ませるだけ）
    streams: [{ pts: RIVER, w: 6, depth: 1.1 }],
    tint(x, z, h, c) {
      // 沼の泥と、堤の盛り土
      const rb = Math.hypot(x - BASIN.x, z - BASIN.z);
      if (rb < 100) { const k = 1 - sm((rb - 70) / 30); c.setRGB(c.r * (1 - 0.5 * k) + 0.2 * k, c.g * (1 - 0.5 * k) + 0.2 * k, c.b * (1 - 0.5 * k) + 0.14 * k); }
      const dd = dikeD(x, z);
      if (dd < 6) { const k = 1 - dd / 6; c.setRGB(c.r * (1 - 0.6 * k) + 0.36 * k, c.g * (1 - 0.6 * k) + 0.3 * k, c.b * (1 - 0.6 * k) + 0.22 * k); }
    },
    fieldStage: 'seedling',
    paddy(x, z) {
      // 堤の外の田（沼・堤・丸墓山・陣は外す）
      if (Math.hypot(x - BASIN.x, z - BASIN.z) < 112 || dikeD(x, z) < 10 || near({ x, z }, MARU, 26) || near({ x, z }, CAMP, 16)) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.8;
    },
    trees: 260, tufts: 3600,
    treeDensity: (x, z) => (Math.hypot(x - BASIN.x, z - BASIN.z) < 120 || dikeD(x, z) < 12 ? 0 : x > 140 || z > 130 ? 1 : 0.2),
    clear: (x, z) => dikeD(x, z) < 10 || near({ x, z }, CAMP, 18) || near({ x, z }, MARU, 22),
    fleeOut: (x, z, team) => team === 1 && near({ x, z }, CASTLE, 14),
  },
  sides: { a: { name: '寄せ手（石田三成）', mon: 'ishida' }, b: { name: '忍城（成田）', mon: 'hojo' } },

  setup(rt) {
    const F = rt.flags, W = rt.world;
    F.step = 0; F.ek = 0; F.ak = 0; F.raid = 0; F.raids = []; F.sorties = []; F.holdWaves = 0;
    waters(rt); reeds(rt); castle(rt); camps(rt);
    // 主人公の組と、区を守る三成の足軽
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: START.x + 3, z: START.z + 3 }, Math.atan2(-1, -1), [{ kind: 'spear', n }]);
    F.guard = allyGroup(rt, { faction: 'toyotomi', name: '石田勢の足軽', anchor: { x: KU.x - 4, z: KU.z - 2 }, facing: Math.atan2(-1, -1), width: 8, aggro: 7, noRout: true, formation: 'line', dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }], ISHI));
    F.guard.ai = false; F.guard.order = 'hold';   // 区の足軽は人夫の前を離れない（沼の中まで夜討ちを迎えに出ない）
    // 区の足軽の後ろに、堤に沿って並ぶ石田勢の控え（寄せ手二万三千の一手）
    KIT.backOf(rt, F.guard, { flag: 'ishida', armor: ISHI.armor, kind: 'spear', w: 18, depth: 8, count: 160, gap: 4, seed: 10901 });
    // 堤を築く人夫（逃がす時も、この組を数える）
    F.porters = allyGroup(rt, { faction: 'toyotomi', name: '堤の人夫', fullStrength: true, anchor: { x: KU.x - 3, z: KU.z + 3 }, facing: Math.atan2(-1, -1), width: 5, aggro: 0, fixed: true },
      [{ type: 'porter', n: 10, o: { flag: null, hat: 'none', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null, porterLoad: dohyoLoad() } }]);
    // 総大将の石田三成は丸墓山の上の本陣を動かない。旗本・馬廻の何百に囲まれる（kaito AR3・AV7）
    F.mitsunari = allyGroup(rt, { faction: 'toyotomi', name: '石田三成の旗本', anchor: { ...MARU }, facing: Math.atan2(-1, -1), width: 8, aggro: 0, fixed: true, noAI: true },
      dress([{ type: 'busho', n: 1, o: { name: '石田三成', invuln: true, hat: 'kabuto_m', flag: 'ishida' } }, { type: 'busho', n: 1, o: { name: '大谷吉継', invuln: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 8 }, { type: 'ashigaru', n: 6 }], ISHI));
    KIT.backOf(rt, F.mitsunari, { flag: 'ishida', armor: ISHI.armor, kind: 'mixed', w: 20, depth: 10, count: 260, gap: 3, seed: 10902 });
    // 城代の成田長親は本丸の屋形の前を動かない
    F.narita = enemyGroup(rt, { faction: 'hojo', name: '成田長親の旗本', anchor: { x: CASTLE.x + 3, z: CASTLE.z + 3 }, facing: Math.PI / 4, width: 6, aggro: 0, fixed: true, noAI: true, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '成田長親', invuln: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 6 }], HOJO));
    F.naritaU = F.narita.units[0];
    // 戦の前の会話（史実：三成は秀吉の高松城の水攻めに倣った）
    const me = nm(rt);
    rt.obj('main', MISSIONS[0], 'main');
    rt.after(0.8, () => rt.say('石田三成', '殿下の高松の水攻めに倣う。堤を築け', 3.4));
    rt.after(4.6, () => rt.say(me, 'この沼の城、水で沈みますかどうか', 3.2));
    rt.after(8.2, () => rt.say('大谷吉継', '城主の成田氏長は小田原に籠もっておる。城を守るは一門の長親じゃ', 3.6));
    rt.after(12.2, () => rt.say('石田三成', '夜は城から打って出てくる。人夫を守れ', 3.2));
    rt.after(16, () => this.night(rt));
  },

  // ① 夜討ち：城から三度、堤の人夫へ寄せてくる
  night(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('night');
    this.raid(rt);
  },
  raid(rt) {
    const F = rt.flags;
    if (F.raid >= 3 || F.step !== 1) return;
    const i = F.raid++, side = i % 2 ? 1 : -1;
    const at = { x: KU.x - 34 + side * 14, z: KU.z - 30 - side * 6 };
    const g = enemyGroup(rt, { faction: 'hojo', name: '城の夜討ち', anchor: at, facing: Math.PI * 0.75, fleeDir: { x: -1, z: -1 }, width: 5, noRout: true, formation: 'line', morale: 80,
      order: 'move', dest: { x: KU.x - 6, z: KU.z - 2 }, speed: 3.2, aggro: 5, dmgMult: 0.45 },
    dress([{ type: 'samurai', n: 1, o: i === 2 ? { name: '正木丹波守' } : {} }, { type: 'ashigaru', n: 5 + i }, { type: i === 2 ? 'gun' : 'bow', n: 1 }], HOJO));
    g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 30; q.aggro = 12; };
    F.raids.push(g);
    if (i === 2) rt.say('石田勢の足軽', '正木丹波の旗じゃ！　城の口の守り頭が出てきた！', 3.2);
    rt.army.play('eshout', at, 1.2);
    if (i === 0) rt.say('石田勢の足軽', '城から夜討ちじゃ！　人夫を守れ！', 3);
  },

  // ② 堤が出来る。堰を切って川の水を入れる
  weir(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t; F.weirT = 0;
    rt.setPhase('weir');
    rt.world.setTime('day');
    sfx('taiko', 0.8);
    rt.obj('main', MISSIONS[1], 'main');
    rt.say('石田三成', '堤は出来た。堰を切れ。川の水を入れよ', 3.4);
  },
  openWeir(rt) {
    const F = rt.flags;
    if (F.weirOpen) return;
    F.weirOpen = true; F.fillT = rt.t;
    rt.army.play('shout', WEIR, 1.2);
    rt.say('石田勢の足軽', '水が入るぞ！', 2.6);
    rt.after(16, () => rt.say(nm(rt), '……城の島は、沈まぬ', 3));
    rt.after(24, () => this.storm(rt));
  },

  // ③ 大雨で堤が切れる。陣の人夫と兵を丸墓山へ
  storm(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('flood');
    rt.world.setTime('storm');
    sfx('taiko', 1);
    // 時が飛ぶ（堰を切った日から六月十八日の夜へ）。人夫の小屋のそばへ戻し、真ん中に次の目標を出す
    warp(rt, KU.x + 5, KU.z + 9, Math.atan2(MARU.x - KU.x, MARU.z - KU.z));
    rt.banner('六月十八日の夜　大雨', '切れた堤から、人夫と兵を丸墓山へ');
    rt.after(6, () => {
      F.broken = true; F.breakT = rt.t;
      F.flood.visible = true;   // 落ちる水の板（fall）は宙に浮いた板に見えたので出さない
      rt.army.play('shout', BREAK, 1.4);
      // 史実：豪雨で本丸まで水が来そうになり、下忍口の本庄泰展の手が夜半に堤を二か所切った（行田の郷土史）
      rt.say('石田勢の足軽', '城の者が堤を切った！　水がこっちへ来るぞ！', 3);
      rt.after(3.4, () => rt.say(nm(rt), '人夫も兵も、丸墓山へ上がれ！　わしに付いて来い！', 3.4));
    });
    rt.obj('main', MISSIONS[2], 'main');
    // 逃がす組：人夫と区の足軽。数えるのは今生きている者
    F.porters.fixed = false;
    F.evac = [F.porters, F.guard].filter(live);
    F.evac0 = F.evac.reduce((a, g) => a + g.units.filter((u) => u.alive && !u.gone).length, 0);
    // 逃がす組は散り散りに逃げ出さず、呼ぶ声の方へ寄る（夜討ちで崩れた足軽も立て直して付いて来る）
    for (const g of F.evac) { g.routed = false; g.noRout = true; g.morale = 100; }
    for (const g of F.raids) if (live(g)) { g.noRout = false; g.morale = 0; }
  },

  // ④ 七月の総攻め：浅野長政・真田昌幸の手と浅瀬を渡り、佐間口の門の前へ攻め寄せる（時が飛ぶ。浅瀬の手前へ移す）
  ford(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('ford');
    rt.world.setTime('day');
    F.flood.visible = false; F.fall.visible = false;
    // 六月の夜討ちの残り（沼の中に立ち尽くす者）は、七月には城へ戻っている
    for (const g of F.raids) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
    warp(rt, FORD.x + 6, FORD.z + 8, Math.atan2(FRONT.x - FORD.x, FRONT.z - FORD.z));
    rt.banner('七月の総攻め', '浅瀬を渡り、佐間口の門の前へ攻め寄せよ');
    rt.obj('main', MISSIONS[3], 'main');
    rt.after(1, () => rt.say('浅野長政', '殿下の下知じゃ。浅野と真田で佐間口を力で押す。続け！', 3.6));
    rt.after(5, () => rt.say('石田勢の足軽', '門の上の狭間に、鉄砲の火縄が見えるぞ', 3));
    // 舟（城の口の脇へ寄せる）と、浅瀬を渡る寄せ手の二つの手。どちらも門の前へ進む（kaito AQ7：味方の隊も目標へ動く）
    F.boats = [[-44, -52], [-54, -60], [-36, -62]].map(([x, z]) => { const b = kobune(x, F.lakeY + 0.05, z, Math.atan2(GATE.x - x, GATE.z - z), 7); if (b) rt.scene.add(b); return b; });
    F.fordAlly = allyGroup(rt, { faction: 'toyotomi', name: '浅野長政の手', fullStrength: true, anchor: { x: FORD.x + 2, z: FORD.z + 4 }, facing: Math.atan2(-1, -1), width: 7, aggro: 10, noRout: true,
      order: 'move', dest: { x: FRONT.x + 3, z: FRONT.z + 3 }, speed: 2.6, dmgMult: 0.5 },
    dress([{ type: 'busho', n: 1, o: { name: '浅野長政', invuln: true, hat: 'kabuto_m', flag: 'toyotomi' } }, { type: 'samurai', n: 3, o: { flag: 'toyotomi' } }, { type: 'ashigaru', n: 12, o: { flag: 'toyotomi' } }, { type: 'gun', n: 3, o: { flag: 'toyotomi' } }], ISHI));
    F.fordAlly.ai = true;
    F.fordAlly.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; q.anchor = { x: FRONT.x + 3, z: FRONT.z + 3 }; q.aggro = 16; };
    KIT.backOf(rt, F.fordAlly, { flag: 'toyotomi', armor: ISHI.armor, kind: 'spear', w: 14, depth: 10, count: 180, gap: 4, seed: 10903 });
    F.sanada = allyGroup(rt, { faction: 'toyotomi', name: '真田昌幸の手', fullStrength: true, anchor: { x: FORD.x + 14, z: FORD.z + 2 }, facing: Math.atan2(-1, -1), width: 6, aggro: 10, noRout: true,
      order: 'move', dest: { x: FRONT.x + 7, z: FRONT.z - 1 }, speed: 2.6, dmgMult: 0.5 },
    [{ type: 'busho', n: 1, o: { name: '真田昌幸', invuln: true, hat: 'kabuto_w', flag: 'sanada' } }, { type: 'samurai', n: 2, o: { flag: 'sanada' } }, { type: 'ashigaru', n: 8, o: { flag: 'sanada' } }]);
    F.sanada.ai = true;
    F.sanada.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; q.anchor = { x: FRONT.x + 7, z: FRONT.z - 1 }; q.aggro = 16; };
    KIT.backOf(rt, F.sanada, { flag: 'sanada', armor: ISHI.armor, kind: 'mixed', w: 12, depth: 8, count: 120, gap: 4, seed: 10904 });
    // 城そのものが兵器：佐間口の塀の内と櫓の下から、鉄砲と弓が寄せ手を撃つ（門に近づくほど当たる）
    const ya = Math.atan2(GATE.z - NI.z, GATE.x - NI.x);
    F.wallShot = [ya + 0.45, ya - 0.45].map((wa) => enemyGroup(rt, { faction: 'hojo', name: '佐間口の塀の鉄砲', anchor: { x: NI.x + Math.cos(wa) * (NI.r - 3), z: NI.z + Math.sin(wa) * (NI.r - 3) }, facing: Math.PI * 0.25, width: 4, noRout: true,
      order: 'hold', aggro: 36, fixed: true, dmgMult: 0.35 }, dress([{ type: 'gun', n: 3 }, { type: 'bow', n: 2 }], HOJO)));
  },
  // ⑤ 門を開いて、正木丹波守の手が打って出る（佐間口の守り頭。史実で生き残るので討てない）。続いて甲斐姫の手（後の軍記の言い伝え）
  sortie(rt, i) {
    const F = rt.flags;
    if (i === 0) {
      if (F.step >= 5) return;
      F.step = 5; F.stepT = rt.t;
      rt.setPhase('sortie');
      rt.obj('main', MISSIONS[4], 'main');
      openDoor(rt);
      rt.after(16, () => this.sortie(rt, 1));
    }
    if (F.step !== 5) return;
    const g = enemyGroup(rt, { faction: 'hojo', name: i ? '甲斐姫の手' : '正木丹波守の手', anchor: { ...INSIDE }, facing: Math.PI * 0.25, fleeDir: { x: -1, z: -1 }, width: 5, noRout: true, formation: 'yari', morale: 90,
      order: 'move', dest: { x: FRONT.x - 1, z: FRONT.z - 1 }, speed: 3.6, aggro: 3, dmgMult: 0.5 },
    dress(i ? [{ type: 'samurai', n: 1, o: { name: '甲斐姫', hat: 'hachimaki', haori: 0x8a2a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }]
      : [{ type: 'busho', n: 1, o: { name: '正木丹波守', invuln: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 13 }, { type: 'gun', n: 2 }], HOJO));
    g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 30; q.aggro = 14; };
    F.sorties.push(g);
    rt.army.play('eshout', GATE, 1.3);
    for (const a of [F.fordAlly, F.sanada]) if (live(a)) { a.order = 'attack'; a.seekRange = 34; a.aggro = 18; }
    if (i === 0) rt.say('浅野長政', '門が開いた！正木丹波が打って出たぞ。門の前で受け止めよ！', 3.6);
    else { rt.say('浅瀬の寄せ手', '女武者が先頭じゃ！成田の姫か！', 3.2); rt.after(3.4, () => rt.say('甲斐姫', '忍の城は、女子供まで戦うぞ！', 3)); }
  },
  // ⑥ 打って出た手が半ばを討たれて退く。門を閉め切れず、退く城兵に続いて枡形へ入る（付け入り）
  tsukeiri(rt) {
    const F = rt.flags;
    if (F.step >= 6) return;
    F.step = 6; F.stepT = rt.t;
    rt.setPhase('tsukeiri');
    rt.obj('main', MISSIONS[5], 'main');
    rt.award((t) => { t.side.push('打って出た正木丹波守の手を退けた'); }, '打って出た城兵を退けた');
    for (const g of F.sorties) if (live(g)) { g.order = 'move'; g.dest = { x: NI.x, z: NI.z }; g.speed = 3.8; g.aggro = 4; g.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; q.anchor = { x: NI.x, z: NI.z }; q.aggro = 10; }; }
    // 門の脇の塀の鉄砲は、付け入られると本丸へ退く
    for (const g of F.wallShot || []) if (live(g)) { g.fixed = false; g.order = 'move'; g.dest = { x: HON.x, z: HON.z }; g.speed = 3.4; g.aggro = 0; }
    // 二の丸の口（枡形の奥）を固める城兵
    F.niGuard = enemyGroup(rt, { faction: 'hojo', name: '二の丸の口の城兵', anchor: { x: NI.x + 1.5, z: NI.z + 1.5 }, facing: Math.PI * 0.25, width: 5, noRout: true, formation: 'yari', morale: 85,
      order: 'hold', aggro: 9, dmgMult: 0.45 }, dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }], HOJO));
    F.niGuard0 = F.niGuard.units.length;
    rt.say('浅野長政', '退くぞ！門を閉めさせるな。続いて枡形へ入れ！', 3.6);
    rt.after(4, () => rt.say(nm(rt), '退く者の背に付いて、門をくぐれ！', 3));
    for (const a of [F.fordAlly, F.sanada]) if (live(a)) { a.order = 'move'; a.dest = { ...INSIDE }; a.speed = 3.2; a.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 20; }; }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '佐間口の門へ付け入った', pts: 20 }; }, '佐間口の門へ付け入った');
    rt.player.u.invuln = true;
    for (const g of [...F.sorties, F.niGuard]) if (live(g)) { g.noRout = false; g.morale = 0; }
    // 戦の後の会話（史実：小田原が開き、忍城はその後に明け渡された）
    const me = nm(rt);
    rt.say('使者', '小田原、開城。成田氏長殿の言葉で、忍城も明け渡すとのこと', 3.6);
    rt.after(3.6, () => rt.say('石田三成', '……堤が切れたのは、わしの落ち度じゃ', 3.4));
    rt.after(7.2, () => rt.say(me, '門は破れど、城は最後まで落ちなんだか', 3));
    rt.after(10.4, () => rt.say('石田三成', 'おぬしは前田殿の手へ。八王子へ向かえ', 3.4));
    rt.after(3.6, () => victoryMoment(rt, '勝'));
    rt.finish({ scriptedEnd: true }, 14);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.objFail('main');
    rt.tracker.main = false;
    rt.say('石田三成', why === 'evac' ? '人夫も兵も、水に呑まれたか……' : '門の前で崩れたか……退け！', 3.4);
    rt.finish({ failureReason: why === 'evac' ? '逃がす人夫と兵が半分を切った' : '佐間口の寄せが崩れた' }, 5);
  },

  missions: MISSIONS,
  missionOf(rt) { return Math.max(0, Math.min(MISSIONS.length - 1, (rt.flags.step || 1) - 1)); },
  missionPin(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive) return null;
    if (F.step <= 1) return { x: RAIDAT.x, z: RAIDAT.z, r: 10 };
    if (F.step === 2) return F.weirOpen ? null : { x: WEIR.x, z: WEIR.z, r: 4 };
    if (F.step === 3) return F.broken ? { x: MARU.x, z: MARU.z, r: 14 } : null;
    if (F.step <= 5) return { x: FRONT.x, z: FRONT.z, r: 6 };
    return F.inGate ? { x: NI.x + 1.5, z: NI.z + 1.5, r: 5 } : { x: INSIDE.x, z: INSIDE.z, r: 3 };
  },

  update(rt, dt) {
    const F = rt.flags;
    if (!F.lake) return;
    KIT.backTick(rt);
    // 水面：堰を切ると沼が満ちる。堤が切れると陣に水が来る
    if (F.weirOpen && F.lakeY < LAKE_HI) { F.lakeY = Math.min(LAKE_HI, F.lakeY + dt * (LAKE_HI - LAKE_LO) / 18); F.lake.position.y = F.lakeY; }
    if (F.broken && F.floodY < FLOOD_HI) { F.floodY = Math.min(FLOOD_HI, F.floodY + dt * (FLOOD_HI - FLOOD_LO) / 14); F.flood.position.y = F.floodY; }
    if (F.broken && F.campFlags && rt.t - F.breakT < 20) {
      // 陣の旗が流される
      for (const [i, f] of F.campFlags.entries()) { f.position.x += dt * (0.9 + i * 0.3); f.position.z += dt * 0.5; f.rotation.z = Math.min(1.2, f.rotation.z + dt * 0.08); f.position.y -= dt * 0.12; }
    }
    if (F.ending) return;
    const P = rt.player.u;
    if (!rt.timeLimit?.up) for (const u of rt.army.units) {
      if (!u.alive || u.gone) continue;
      if (u.pos.x > XW) u.pos.x = XW; else if (u.pos.x < -XW) u.pos.x = -XW;
      if (u.pos.z > XW) u.pos.z = XW; else if (u.pos.z < -XW) u.pos.z = -XW;
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.5;
    if (F.step === 1) {
      // 前の夜討ちが崩れたら次。三度退けば堤が出来る
      const cur = F.raids[F.raids.length - 1];
      if (cur && !fighting(cur)) { if (F.raid < 3) { if (!F.nextT) F.nextT = rt.t + 5; if (rt.t >= F.nextT) { F.nextT = 0; this.raid(rt); } } else this.weir(rt); }
      if (rt.t - F.stepT > 130) this.weir(rt);
    } else if (F.step === 2) {
      if (!F.weirOpen) {
        F.weirT = near(P.pos, WEIR, 4.5) ? F.weirT + 0.5 : 0;
        if (F.weirT >= 2 || rt.t - F.stepT > 90) this.openWeir(rt);
      }
    } else if (F.step === 3) {
      if (!F.broken) return;
      // 人夫と兵は、主人公がそばにいる間だけ付いて来る。離れると水に足を取られて流される
      const leading = F.evac.some((g) => g.units.some((u) => u.alive && !u.gone && near(u.pos, P.pos, 36)));
      let alive = 0, safe = 0;
      for (const g of F.evac) {
        // 主人公のそばの組は丸墓山へ。離れた組（堤の西の端の人夫・浅瀬で斬り合う足軽）は、呼ぶ声の方へ寄って来る
        const gl = leading && g.units.some((u) => u.alive && !u.gone && near(u.pos, P.pos, 36));
        const to = g._evTo || (g._evTo = { x: 0, z: 0 });
        if (gl) { to.x = MARU.x - 6; to.z = MARU.z - 6; } else { to.x = P.pos.x; to.z = P.pos.z; }
        g.order = 'move'; g.dest = to; g.speed = F.floodY > 0.8 ? 2.2 : 3; g.aggro = 0;
        for (const u of g.units) {
          if (!u.alive || u.gone) continue;
          const deep = F.floodY - rt.world.heightAt(u.pos.x, u.pos.z);
          // 離れても一息には流されない（呼びに戻る間がある）
          if (deep > 0.4 && !near(u.pos, P.pos, 36) && Math.random() < 0.01) { u.invuln = false; u.hp = 0; rt.army.kill(u, null); continue; }
          alive++;
          if (near(u.pos, MARU, 24)) safe++;
        }
      }
      // 負けに出来ない間（canFailMission）も段を止めない。逃がし切れなくても時が来れば次の段へ
      //   堤が切れて二十秒は、散った組を呼び集める間（すぐ負けにしない）
      if (rt.t - F.breakT > 20 && alive < F.evac0 * 0.4) { this.lose(rt, 'evac'); if (F.ending) return; }
      if ((near(P.pos, MARU, 16) && safe >= alive * 0.6) || rt.t - F.breakT > 85) {
        rt.award((t) => { t.side.push('人夫と兵を逃がした'); }, '人夫と兵を逃がした');
        for (const g of F.evac) { g.order = 'hold'; g.anchor = { x: MARU.x - 6, z: MARU.z - 6 }; }
        this.ford(rt);
      }
    } else if (F.step === 4) {
      // 門の前へ着く（または寄せ手の手が着く）と、城が門を開いて打って出る
      if (near(P.pos, FRONT, 9) || rt.t - F.stepT > 70) this.sortie(rt, 0);
    } else if (F.step === 5) {
      // 打って出た二手の六割を討つと退く（右上の数と同じ数え方。なお粘れば百十秒で退く）
      const k = sortieCount(F);
      if ((k && k[0] >= k[1]) || (F.sorties.length >= 2 && rt.t - F.stepT > 110)) this.tsukeiri(rt);
    } else if (F.step === 6) {
      if (!F.inGate && near(P.pos, INSIDE, 4.5)) { F.inGate = true; rt.say('浅野長政', '枡形へ入った！奥の二の丸の口を払え！', 3); }
      const left = F.niGuard ? F.niGuard.units.filter((u) => u.alive && !u.gone && !u.fleeing).length : 0;
      if (F.inGate && P.alive && left <=Math.ceil((F.niGuard0 || 1) * 0.3)) this.win(rt);
      else if (rt.t - F.stepT > 150 && F.niGuard) { F.niGuard.noRout = false; F.niGuard.morale = 0; }
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },

  // bot：段ごとの行き先へ。近い敵は突く
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (!u.alive || F.ending || !F.step) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const range = F.step === 3 ? 4 : F.step === 2 && !F.weirOpen ? 3 : F.step === 4 ? 6 : F.step === 1 ? 30 : 14;
    const home = F.step === 5 ? FRONT : F.step === 1 ? RAIDAT : null;
    const e = b.army.nearestEnemy(u, range, (o) => ok(o) && (!home || near(o.pos, home, F.step === 1 ? 24 : 16)));
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    if (F.step === 1) { goTo(p, inp, RAIDAT.x, RAIDAT.z, 3); return; }   // 堤の内の法で、城から来る夜討ちを待つ
    if (F.step === 2) { if (!F.weirOpen) goTo(p, inp, WEIR.x, WEIR.z, 1.5); else goTo(p, inp, KU.x, KU.z + 6, 3); return; }
    if (F.step === 3) {
      if (!F.broken) { goTo(p, inp, KU.x + 6, KU.z + 8, 3); return; }
      // 組を待つ：人夫と兵の真ん中から十八歩より離れない（水に取られた一人を追って立ち止まらない）
      let cx = 0, cz = 0, n = 0;
      for (const g of F.evac || []) for (const o of g.units) { if (!o.alive || o.gone || !near(o.pos, u.pos, 45)) continue; cx += o.pos.x; cz += o.pos.z; n++; }
      if (n && Math.hypot(cx / n - u.pos.x, cz / n - u.pos.z) > 18) goTo(p, inp, cx / n, cz / n, 4); else goTo(p, inp, MARU.x, MARU.z, 4);
      return;
    }
    if (F.step <= 5) { goTo(p, inp, FRONT.x, FRONT.z, 3); return; }
    if (!F.inGate) goTo(p, inp, INSIDE.x, INSIDE.z, 1.5); else goTo(p, inp, NI.x + 1.5, NI.z + 1.5, 2);
  },
};

t10_oshi.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, 23000 - (F.ak || 0) * 30), a0: 23000, b: Math.max(0, 3116 - (F.ek || 0) * 12), b0: 3116 };
};
t10_oshi.date = (rt) => {
  const st = rt.flags.step || 0;
  return st <= 1 ? '天正十八年六月　梅雨・夜' : st === 2 ? '天正十八年六月　曇' : st === 3 ? '天正十八年六月十八日　大雨の夜' : '天正十八年七月　総攻め';
};
t10_oshi.history = '天正十八年（1590）、豊臣秀吉の小田原攻めの中で、石田三成は北条方の忍城（武蔵国）を囲んだ。城は沼と深田に囲まれた浮き城で、三成は長い堤（石田堤）を築いて川の水を引き入れ、水攻めにした。城は沈まず、大雨で堤が切れて寄せ手の側に水が出たと伝わる。城代の成田長親らは守り通し、小田原の開城の後に城を明け渡した。寄せ手はおよそ二万三千、城方は三千百十六（侍六十九・足軽四百二十・ほかは百姓や町人の雑兵）と伝わる。六月十八日の大雨の夜、本丸まで水が来るのを恐れた下忍口の本庄泰展の手が堤を切り、寄せ手におよそ二百七十の死者が出たという。主人公の受け持つ区、夜討ちの数と人数、浅瀬の寄せ、佐間口の打って出と枡形への付け入りの細かな流れは、遊びのための復元（佐間口は破れても城は落ちなかった）。忍城と丸墓山の向きと間合いは実の位置を縮めたもの。成田の旗は今回確かめられず、北条方の旗で代える。寄せ手には大谷吉継・長束正家がつき、七月には浅野長政・真田昌幸らも加わって城の口を攻めたが、城は落ちなかった。城主の成田氏長は小田原に籠もっており、城代の成田泰季が囲みの中で病死した後は、一門の成田長親が城を守った。正木丹波守らが城の口を固めた。氏長の娘の甲斐姫が自ら打って出て戦ったという話は、後の軍記に残る言い伝え（史実とは分けて扱う）。忍城は小田原の開城の後、七月十六日に氏長の言葉を受けて明け渡された。地形は国土地理院の標高をもとにした。';

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
// 倒す数（kaito 11/2 O）：右上の任務の一行に「（倒した数／倒す数）」。段が進む判定と同じ数え方（stages.js）
KILLS.t10_oshi = (rt) => {
  const F = rt.flags;
  if (F.ending || F.step !== 5) return null;
  return sortieCount(F);
};
withGuard(t10_oshi);

export { t10_oshi };
