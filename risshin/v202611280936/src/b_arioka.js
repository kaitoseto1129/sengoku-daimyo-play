import { useTerrain } from './asset_manifest.js';
// ======================================================================
// 織田家編　有岡城の戦い（天正七年十月十五日）
// 摂津の荒木村重は信長に背き、有岡城に一年近く籠もった。説きに来た黒田官兵衛（孝高）は城に捕らえられ、牢に入れられた。
// 村重が城を抜け出して尼崎へ移った後、十月、城の中から内応する者が出て、織田勢は城の中へ攻め入った。
// 官兵衛は牢から救い出されたが、長い牢暮らしで足が不自由になっていたと伝わる。
// 足軽は滝川一益の手。内応で開いた木戸から入り、侍町へ進み、奪った口を守る。
// 向き：北は -z、東は +x。主郭は中央〜東寄り。西に滝川の陣。
// ======================================================================
import { aheadOf, inStage } from './scene_beats.js';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices as mergeVerticesSlow } from 'three/addons/utils/BufferGeometryUtils.js';
// K564 読み込み（11/21 クラウド 有岡の持ち主）：three の mergeVertices は頂点ごとに文字の鍵を作り、
//   遠い板塀と土塁（16万頂点）だけで 0.4 秒かかった。同じ丸め（小数四桁）・同じ順で数の鍵の表を引く。答えは同じ。
function mergeVertices(geo) {
  const names = Object.keys(geo.attributes), attrs = names.map((n) => geo.attributes[n]);
  if (Object.keys(geo.morphAttributes).length || attrs.some((a) => a.isInterleavedBufferAttribute)) return mergeVerticesSlow(geo);
  const idx = geo.getIndex(), cnt = idx ? idx.count : geo.attributes.position.count;
  let width = 0; for (const a of attrs) width += a.itemSize;
  const q = new Int32Array(cnt * width), src = idx ? idx.array : null;
  let size = 1; while (size < cnt * 2) size <<= 1;
  const table = new Int32Array(size).fill(-1), first = new Int32Array(cnt), out = new Uint32Array(cnt);
  let nu = 0;
  for (let i = 0; i < cnt; i++) {
    const v = src ? src[i] : i, o = nu * width;
    let h = 0x811c9dc5, w = 0;
    for (const a of attrs) for (let k = 0; k < a.itemSize; k++) {
      const x = ~~(a.array[v * a.itemSize + k] * 1e4 + .5); q[o + w++] = x; h = Math.imul(h ^ x, 16777619);
    }
    let s = (h >>> 0) & (size - 1), hit = -1;
    for (;;) {
      const u = table[s]; if (u < 0) break;
      let same = true; const b = u * width; for (let k = 0; k < width; k++) if (q[b + k] !== q[o + k]) { same = false; break; }
      if (same) { hit = u; break; }
      s = (s + 1) & (size - 1);
    }
    if (hit >= 0) { out[i] = hit; continue; }
    table[s] = nu; first[nu] = v; out[i] = nu++;
  }
  const g = new THREE.BufferGeometry();
  names.forEach((n, j) => {
    const a = attrs[j], is = a.itemSize, arr = new a.array.constructor(nu * is);
    for (let u = 0; u < nu; u++) for (let k = 0; k < is; k++) arr[u * is + k] = a.array[first[u] * is + k];
    g.setAttribute(n, new THREE.BufferAttribute(arr, is, a.normalized));
  });
  g.setIndex(new THREE.BufferAttribute(nu > 65535 ? out : new Uint16Array(out), 1));
  for (const gr of geo.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  return g;
}
import { nobori as commonNobori, hut, yagura as commonYagura, campfire, kabukimon, yaguramon, castleBoardFence, tawara, ishigaki, kagaribi, tobira, makeKitBatch, finalizeKitBatch, dorui, makeSimpleBatch, finalizeSimpleBatch, palisade, solidCircle, solidRect, takataba, hyoro, hasa, tateNarabi, tenshu, sakamogi } from './props.js';
import { SOLIDS, solidSeg, farFireDots } from './props.js';
import { kitReplace, castleStyle, kitGateObj4 } from './cgt_castle.js';
import { timeslipField } from './timeslip_field.js';
import { S as SETTINGS, MEM_TIGHT } from './settings.js';
import { dirtTex, stoneTex } from './nature.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { goalsTick } from './hud_goals.js';
import { enemyGroup, allyGroup, nm, unitPos, wallLine, attachSama } from './bhelp.js';
import { applyLook, NIGHT, dress, gone as groupGone } from './b_inabayama.js';
// 深手で戦えない兵だけが残っても、敵の寄せが続くとは数えない。
const ariAble = (u) => u.alive && !u.gone && !u.dying && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget;
const gone = (g) => groupGone(g) || !g.units.some(ariAble);
import { KIT } from './b_nagashinojo.js';
import { evPerson, evReach } from './b_ev6.js';
import { camp } from './b_mid.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { makeKakoi, kakoiEvent } from './kakoi.js';
// 15分の段（kaito 11/8 夜・docs/oda15_plan_1108.md の 27）：段の中身は arioka/ に一段一ファイル
import * as AR_OPEN from './arioka/kaimaku.js';
import * as AR_SOTO from './arioka/sotoguruwa.js';
import * as AR_SEI from './arioka/seiatsu.js';
import * as AR_UCHI from './arioka/uchimon.js';
import * as AR_YOIN from './arioka/yoin.js';
import { DEPTH_ARIOKA } from './arioka/depth.js';
import { demBlend } from './dem.js';
import { INTERIOR_WALLS } from './shironaka.js';
import { NAKA } from './naka.js';
import { cameraWallBlocked } from './battle_sight.js';
import { horiboriHeight, mizubori, goten } from './castle_parts.js';
import { reset as flReset, addDeck, addRamp } from './floors.js';
import { tickTabas, tabaInteractTick, makeTabaAdvance, patchGunCover, tabaGeo } from './taketaba.js';
import { makeSiegeZones, ZONE_STATE } from './siege_zones.js';
import { buildCastlePlan, buildCastlePlanSteps } from './castle_plan.js';
import { makeNawabari } from './nawabari.js';
import {
  WALL_Z, GATE, SOTO_MOAT, SOTO_MOAT_SEGS, SOTO_BRIDGE,
  ROU, CAMP, HON_ISHIGAKI_SEGS, HON_MOAT, HON_MOAT_SEGS, TENSHU_POS,
  HON_W, HON_E, HON_N, HON_Z, HON_X, HON_CENTER_Z, HON_GAP, HON_ENTRY_X, HON_APPROACH_Z,
  SOKAKU_X, SOKAKU_N, KISHI_TORIDE, JORO_TORIDE, HIYODORI_TORIDE, HON_W_MOAT, HON_W_MOAT_SEGS,
  ARIOKA_PLAN, MACHIYA_Z, TORIDE_WORKS, ARIOKA_ROADS, TOWN_X, TOWN_SOUTH_Z,
} from './castles/arioka.js';
const ARIOKA_BATTLE_PLAN = ARIOKA_PLAN;
// 石段と小物は共有の形・材質を使う。毎コマの作り直しはしない。
const ARI_BOX = new THREE.BoxGeometry(1, 1, 1);
const ARI_ROCK = new THREE.DodecahedronGeometry(1, 0);
const ARI_STONE = new THREE.MeshLambertMaterial({ color: 0x817d6d });
// 土橋は土の絵と周囲の夜の光で照らす。自発光で一枚だけ浮かせない。
// 土の絵は準備時に付ける。本体の読み込み時には絵の生成を始めない。
// 土の絵に既に土色がある。暗い色を二重に掛けて黒い板にしない。
const ARI_EARTH = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
const ARI_WOOD = new THREE.MeshLambertMaterial({ color: 0x57412c });
const ARI_CHAR = new THREE.MeshLambertMaterial({ color: 0x3e342b });
const ARI_WORK_WOOD = ARI_WOOD.clone(); ARI_WORK_WOOD.vertexColors = true;
const ARI_WORK_ROOF = ARI_CHAR.clone(); ARI_WORK_ROOF.vertexColors = true;
let ariRuinRoofMat;
let ariTabaMat;
const ARI_RIDER_GEOMETRIES = new WeakMap();
const ARI_FLAG_GEOMETRIES = new WeakMap();
const ARI_FLAG_MATS = new WeakMap();
// 写真は構造の参考。有岡の天正七年の木造の備えだけに適用する。
// 共通の井楼は遠景の粗い形を持つ。荒木の丸は既存の代用紋を保つ。
function yagura(world, x, z) {
  const joro = x === JORO_TORIDE.x + 5 && z === JORO_TORIDE.z - 12;
  const tower = commonYagura(world, x, z, { team: 1, mon: joro ? 'plain' : 'maru',
    boarded: joro || x === HON_E - 3, rot: joro ? Math.PI / 2 : 0 });
  const flag = tower.children.find(child => child.userData.flag);
  if (flag) ariFlag(flag);
  return tower;
}

// 渡櫓は板壁・切妻の板葺き。扉と七メートルの通り口は既存のまま。
// 脇の土の台だけを置き、登れない上階の室内や新しい兵を作らない。
function ariGate(rt, x, z, w, rot, batch) {
  const high = true;
  const mesh = high
    ? yaguramon(rt.world, x, z, w, rot, { doors: false, earth: true, inside: false, noKit: true, batch })
    : kabukimon(rt.world, x, z, w, rot, { doors: false });
  if (!mesh.isBatchedPart) rt.scene.add(mesh);
  // 見た目だけ買った城の部品の櫓門（白壁・瓦）に替える。当たり・扉の口・視点の壁は手作りのまま
  // 惣構えの大木戸（上臈塚の木戸）だけ一回り大きな櫓門にする（持ち場から三十歩で小さく見えた。10/29 採点）。寸法は推定。
  const outer = x === GATE.x && z === GATE.z;
  // 11/6 kaito 四5：惣構えの木戸が白壁と瓦の大きな二階の櫓門で、天正七年の摂津の土橋の木戸には立派すぎた（手本の復元画は黒い下見板の古い作り）。
  //   惣構えの木戸は買った白壁の部品に替えず、手作りの板の櫓門のままにする。
  if (!outer) kitReplace(mesh, castleStyle(rt.world), (p) => kitGateObj4(p, { x, z, rot, y: rt.world.heightAt(x, z) - 0.05, Lw: w + 5.6, D: 4.4, Ht: 7.7 }), { gate: true });
  ariGateCamera(rt, x, z, w, rot, high);
}

// 門の屋根だけでなく本柱・控柱も、見た目と同じ位置で視点を遮る。
// 通り口は空けたまま。準備時の箱だけで調べ、歩行・兵の経路には触れない。
function ariGateCamera(rt, x, z, w, rot, high) {
  const c = Math.cos(rot), s = Math.sin(rot);
  rt.flags.ariCameraGates.push({ x, z, y: rt.world.heightAt(x, z),
    c, s, half: (w + (high ? 6.8 : 2.8)) / 2,
    bottom: 3.3, top: high ? 7.4 : 4.9, depth: high ? 2.7 : 1.6 });
  for (const side of [-1, 1]) {
    const px = side * (w / 2 + (high ? 1.4 : .17));
    const pz = high ? 0 : -.8;
    const gx = x + px * c + pz * s, gz = z - px * s + pz * c;
    rt.flags.ariCameraGates.push({ x: gx, z: gz, y: rt.world.heightAt(gx, gz),
      c, s, half: high ? 1.3 : .23, bottom: -.3, top: 3.7, depth: high ? 2 : 1.05 });
  }
}

// 開いた扉も視点を遮る。開門時だけ実物の二枚から箱を作り、以後は使い回す。
function ariDoorCamera(rt, door) {
  door.updateWorldMatrix(true, true);
  const center = new THREE.Vector3();
  for (const pivot of door.userData.leaves) {
    const leaf = pivot.children[0], geometry = leaf.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    box.getCenter(center).applyMatrix4(leaf.matrixWorld);
    const angle = door.rotation.y + pivot.rotation.y;
    rt.flags.ariCameraGates.push({ x: center.x, z: center.z, y: center.y,
      c: Math.cos(angle), s: Math.sin(angle),
      half: (box.max.x - box.min.x) / 2 + .08,
      bottom: -(box.max.y - box.min.y) / 2 - .08,
      top: (box.max.y - box.min.y) / 2 + .08,
      depth: (box.max.z - box.min.z) / 2 + .08 });
  }
}

// 車輪・台木・支えも含む箱を準備時だけ作る。動く間は箱の位置と向きだけ更新する。
function ariTabaCamera(tb) {
  const mesh = tb.m.isLOD ? tb.m.levels[0].object : tb.m;
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  return { x: 0, z: 0, y: 0, c: 1, s: 0,
    localX: (box.min.x + box.max.x) / 2, localZ: (box.min.z + box.max.z) / 2,
    half: (box.max.x - box.min.x) / 2 + .25,
    bottom: box.min.y - .25, top: box.max.y + .25,
    depth: (box.max.z - box.min.z) / 2 + .25 };
}

// 描く竹束と同じ回転で箱を動かす。判定側はこの回転の逆で箱の内外を調べる。
function ariTabaCameraPose(tb) {
  const box = tb.ariCamera;
  box.c = Math.cos(tb.rot + Math.PI); box.s = Math.sin(tb.rot + Math.PI);
  box.x = tb.x + box.localX * box.c + box.localZ * box.s;
  box.z = tb.z - box.localX * box.s + box.localZ * box.c;
  box.y = tb.m.position.y;
  return box;
}

// 本人が束に密着すると、線の始点も箱へ入り、視点を寄せるだけでは抜けない。
// その時だけ竹の上へ目線を上げ、見る先も同じだけ上げて真下を映さない。
function ariTabaView(rt, pos, look) {
  const p = rt.player;
  if (!p.u.alive || rt.over || p.aiming || p.fpWanted() || NAKA.cur || rt.game?.photo) return;
  let y = pos.y;
  for (const tb of rt.flags.tabas || []) {
    if (!tb.m.visible || !tb.ariCamera) continue;
    const box = ariTabaCameraPose(tb), dx = pos.x - box.x, dz = pos.z - box.z;
    // 11/6 BG11：束の脇に立つと、視点が束の横へ付いて画面の半分が竹で埋まった。束の一・五メートル内なら竹の上から見る。
    if (Math.abs(dx * box.c - dz * box.s) > box.half + 1.5 ||
        Math.abs(dx * box.s + dz * box.c) > box.depth + 1.5 || pos.y < box.y + box.bottom) continue;
    y = Math.max(y, box.y + box.top + .45);
  }
  look.y += y - pos.y;
  pos.y = y;
}

// 11/22 クラウド 有岡の持ち主（K564 重さ）：視点の当たりの升。町屋の箱と柵の線は準備の後は動かないので、数が変わった時だけ作り直す。
//   視線の外接箱が四十八m を越える時は null（前の通り全部を回す）。升の中の柵は ariCamWallBuf に重ねずに並べる。
let ariCamQ = 0, ariCamWallN = 0;
const ariCamWallBuf = [], ARI_CAM_CELL = 12;
let ariCamGrid = null;
function ariCamCells(houses, walls, from, to) {
  const x0 = Math.min(from.x, to.x), x1 = Math.max(from.x, to.x), z0 = Math.min(from.z, to.z), z1 = Math.max(from.z, to.z);
  if (x1 - x0 > 48 || z1 - z0 > 48) return null;
  let G = ariCamGrid;
  if (!G || G.houses !== houses || G.walls !== walls || G.nh !== houses.length || G.nw !== walls.length) {
    G = ariCamGrid = { houses, walls, nh: houses.length, nw: walls.length, m: new Map(), out: [] };
    const put = (o, ax, az, bx, bz) => {
      for (let i = Math.floor(ax / ARI_CAM_CELL); i <= Math.floor(bx / ARI_CAM_CELL); i++) {
        for (let j = Math.floor(az / ARI_CAM_CELL); j <= Math.floor(bz / ARI_CAM_CELL); j++) {
          const key = i * 4096 + j; let c = G.m.get(key); if (!c) G.m.set(key, c = []); c.push(o);
        }
      }
    };
    for (const h of houses) { const r = Math.hypot(h.half, h.depth ?? 2.7) + .01; put(h, h.x - r, h.z - r, h.x + r, h.z + r); }
    for (const w of walls) put(w, w.x0 - .01, w.z0 - .01, w.x1 + .01, w.z1 + .01);
  }
  const out = G.out; out.length = 0;
  for (let i = Math.floor(x0 / ARI_CAM_CELL); i <= Math.floor(x1 / ARI_CAM_CELL); i++) {
    for (let j = Math.floor(z0 / ARI_CAM_CELL); j <= Math.floor(z1 / ARI_CAM_CELL); j++) {
      const c = G.m.get(i * 4096 + j); if (c) out.push(c);
    }
  }
  // 柵だけを重ねずに拾い出す（町屋の箱は呼び手が _q で重ねを外す）
  const q = ariCamQ + 1; ariCamWallN = 0;
  for (let k = 0; k < out.length; k++) {
    const c = out[k];
    for (let i = 0; i < c.length; i++) { const o = c[i]; if (!o.house && o._wq !== q) { o._wq = q; ariCamWallBuf[ariCamWallN++] = o; } }
  }
  return out;
}

// 町屋の中の歩く壁（INTERIOR_WALLS）も同じ升に分ける。家が崩れると一覧から抜けるので、数か両端の物が変われば作り直す。
let ariCamInN = 0, ariCamInQ = 0, ariCamInGrid = null;
const ariCamInBuf = [];
function ariCamInner(list, from, to) {
  const x0 = Math.min(from.x, to.x), x1 = Math.max(from.x, to.x), z0 = Math.min(from.z, to.z), z1 = Math.max(from.z, to.z);
  if (x1 - x0 > 48 || z1 - z0 > 48) return null;
  let G = ariCamInGrid;
  if (!G || G.list !== list || G.n !== list.length || G.a !== list[0] || G.b !== list[list.length - 1]) {
    G = ariCamInGrid = { list, n: list.length, a: list[0], b: list[list.length - 1], m: new Map() };
    for (const w of list) {
      for (let i = Math.floor((Math.min(w.ax, w.bx) - .01) / ARI_CAM_CELL); i <= Math.floor((Math.max(w.ax, w.bx) + .01) / ARI_CAM_CELL); i++) {
        for (let j = Math.floor((Math.min(w.az, w.bz) - .01) / ARI_CAM_CELL); j <= Math.floor((Math.max(w.az, w.bz) + .01) / ARI_CAM_CELL); j++) {
          const key = i * 4096 + j; let c = G.m.get(key); if (!c) G.m.set(key, c = []); c.push(w);
        }
      }
    }
  }
  const q = ++ariCamInQ; ariCamInN = 0;
  for (let i = Math.floor(x0 / ARI_CAM_CELL); i <= Math.floor(x1 / ARI_CAM_CELL); i++) {
    for (let j = Math.floor(z0 / ARI_CAM_CELL); j <= Math.floor(z1 / ARI_CAM_CELL); j++) {
      const c = G.m.get(i * 4096 + j); if (!c) continue;
      for (let k = 0; k < c.length; k++) { const w = c[k]; if (w._ariIq !== q) { w._ariIq = q; ariCamInBuf[ariCamInN++] = w; } }
    }
  }
  return ariCamInBuf;
}

function ariGateCameraHit(gate, from, to, camera = true) {
  const x = from.x - gate.x, z = from.z - gate.z;
  // 屋外の本人を映す視点は、開いた戸口からも町屋の中へ入れない。
  // 本人が屋内にいる時と、焼け落ちた家は既存の壁判定に任せる。
  // 視線の起点は本人より前へ寄るため、箱の内側にあるだけでは屋内としない。
  // 実際に入っている部屋だけを除き、壁際でも屋外の視点を建物へ通さない。
  // 屋内の視点は寄せないが、敵の印は屋内からも屋根越しに見せない。
  if (gate.house && (gate.house.collapsed || camera && gate.house.room && NAKA.cur?.I === gate.house.room)) return null;
  // K564：線の外接箱が箱の外接円に届かない時は同じ答え（当たり無し）なので、回した箱の計算を省く。
  const reach = gate._reach ?? (gate._reach = Math.hypot(gate.half, gate.depth ?? 2.7));
  if (Math.min(from.x, to.x) > gate.x + reach || Math.max(from.x, to.x) < gate.x - reach
    || Math.min(from.z, to.z) > gate.z + reach || Math.max(from.z, to.z) < gate.z - reach) return null;
  const dx = to.x - from.x, dz = to.z - from.z;
  let enter = 0, leave = 1;
  for (let axis = 0; axis < 3; axis++) {
    const start = axis === 0 ? x * gate.c - z * gate.s
      : axis === 1 ? from.y - gate.y : x * gate.s + z * gate.c;
    const delta = axis === 0 ? dx * gate.c - dz * gate.s
      : axis === 1 ? to.y - from.y : dx * gate.s + dz * gate.c;
    const low = axis === 0 ? -gate.half : axis === 1 ? (gate.bottom ?? 3.3) : -(gate.depth ?? 2.7);
    const high = axis === 0 ? gate.half : axis === 1 ? (gate.top ?? 7.4) : (gate.depth ?? 2.7);
    if (Math.abs(delta) < 1e-8) {
      if (start < low || start > high) return null;
      continue;
    }
    const a = (low - start) / delta, b = (high - start) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return null;
  }
  return enter;
}

// 長屋は長手に棟を通す。共通の小屋は幅方向へ勾配が付くので、
// 幅と奥行きを入れ替えて回し、元の敷地のまま低い切妻と軒下に並ぶ板戸にする。
function ariNagaya(rt, x, z, w, d, batch) {
  const high = true;
  // 携帯でも棟を長手へ通す。敷地と面の数は変えない。
  hut(rt.world, x, z, d, w, Math.PI / 2,
    { ita: true, boardRoof: high, weatheredBoards: high, nagayaDoors: high, batch, wall: high ? 0x78654c : undefined });
  // 束ねた長屋にも壁と軒の遮りを付け、裏の兵の印を屋根越しに出さない。
  ariStreetHouseSight(rt, x, z, Math.PI / 2, d, w);
}

// 小田原・清洲の屋敷割りを参考に、侍屋敷の庭を低い板囲いで分ける。
// 寸法は推定。南の戸口と大通りには口を残し、準備時に一つの形へまとめる。
function ariYashiki(rt, x, z) {
  const parts = [], W = rt.world;
  const box = (px, py, pz, w, h, d) => {
    const g = ARI_BOX.clone(); g.scale(w, h, d); g.translate(px, py, pz); parts.push(g);
  };
  for (const [ax, az, bx, bz] of [
    [x - 10, z - 10, x + 10, z - 10],
    [x - 10, z - 10, x - 10, z + 10], [x + 10, z - 10, x + 10, z + 10],
    [x - 10, z + 10, x - 2.5, z + 10], [x + 2.5, z + 10, x + 10, z + 10],
  ]) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / .4), alongX = az === bz;
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      const h = 1.3 + .035 * Math.sin(i * 2.7), y = W.heightAt(px, pz);
      box(px, y + h / 2 - .06, pz, alongX ? len / n - .012 : .065, h, alongX ? .065 : len / n - .012);
    }
    const posts = Math.ceil(len / 2);
    for (let i = 0; i <= posts; i++) {
      const t = i / posts, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      box(px, W.heightAt(px, pz) + .65, pz, .13, 1.55, .13);
    }
    // 当たりも囲いの線だけ。庭と中央五メートルの出入り口は歩ける。
    solidRect((ax + bx) / 2, (az + bz) / 2, alongX ? len : .14, alongX ? .14 : len, 0);
  }
  const geo = mergeGeometries(parts); parts.forEach(g => g.dispose());
  const mesh = new THREE.Mesh(geo, ARI_WOOD); mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.camBlock = true; rt.scene.add(mesh);
  // 清洲の屋敷割りのように、主屋一棟だけの庭にせず隅へ物置を添える。
  // 姿と位置は推定。主屋の軒・南の五メートルの門口・中央の庭を空ける。
  const batch = makeSimpleBatch();
  for (const [dx, dz, rot] of [[-6.7, 6.3, Math.PI / 2], [6.7, -6.3, -Math.PI / 2]]) {
    hut(W, x + dx, z + dz, 2.2, 4, rot, { h: 2.2, ita: true,
      boardRoof: true, weatheredBoards: true, batch, wall: 0x78654c });
  }
  finalizeSimpleBatch(rt, batch);
}

// 砦と仕寄りの材木・板楯の置き場。共有する箱を準備時にだけ並べる。
// 道と兵の持ち場を塞がない端の小さな資材置きなので、当たりは外枠一つ。
function ariWorks(rt, x, z, rot = 0) {
  const W = rt.world, pieces = [], roof = [], c = Math.cos(rot), s = Math.sin(rot);
  const ground = (px, pz) => W.heightAt(x + px * c + pz * s, z - px * s + pz * c);
  const base = Math.max(...[-1.75, 1.75].flatMap(px => [-.8, 1.25].map(pz => ground(px, pz))));
  const box = (px, py, pz, w, h, d, tilt = 0) => {
    const g = ARI_BOX.clone(); g.scale(w, h, d); g.rotateZ(tilt); g.translate(px, py, pz); pieces.push(g);
  };
  // 棟から軒へ垂木を渡す。屋根を支える短い方杖も、材木と同じ束へ焼き込む。
  const beam = (ax, ay, az, bx, by, bz, width, depth) => {
    const direction = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const g = ARI_BOX.clone(); g.scale(width, direction.length(), depth);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); pieces.push(g);
  };
  // 横木の架台と、長さの違う丸太。小さな面で木口と積み重ねを見せる。
  for (const px of [-1.4, 1.4]) {
    for (const pz of [-.65, .65]) box(px, .45, pz, .14, .9, .14);
    box(px, .9, 0, .18, .15, 1.6);
  }
  // 丸太の皮と切り口を分け、三・二・二本に積む。架台の上で転がらない楔を添える。
  const log = new THREE.CylinderGeometry(.12, .12, 1, 5, 1, true).toNonIndexed();
  const end = new THREE.CircleGeometry(1, 5).toNonIndexed();
  end.rotateY(Math.PI / 2);
  for (let i = 0; i < 7; i++) {
    const row = i < 3 ? 0 : i < 5 ? 1 : 2, col = i < 3 ? i : (i - 3) % 2;
    const px = (i % 2) * .14, py = 1.1 + row * .22;
    const pz = (col - (row ? .5 : 1)) * .34, length = 3.7 - (i % 3) * .23;
    const g = log.clone(); g.scale(1, length, 1); g.rotateZ(Math.PI / 2);
    g.translate(px, py, pz); roof.push(g);
    for (const side of [-1, 1]) {
      const cap = end.clone(); cap.scale(.12, .12, .12);
      if (side < 0) cap.rotateY(Math.PI);
      cap.translate(px + side * (length / 2 + .002), py, pz); pieces.push(cap);
    }
  }
  log.dispose(); end.dispose();
  for (const px of [-1.4, 1.4]) for (const pz of [-.68, .68])
    box(px, 1.01, pz, .23, .17, .15, pz < 0 ? -.3 : .3);
  // 写真の平楯は幅のある板を桟でつなぐ。四枚の端と隙間を残し、桟ごと後ろへ傾ける。
  // 有岡の高画質の資材置きだけ。準備時に既存の木材の形へまとめる。
  for (const px of [-1, 0, 1]) {
    const lean = .12 + (px + 1) * .025;
    const plank = (dx, dy, dz, w, h, d) => {
      const g = ARI_BOX.clone(); g.scale(w, h, d); g.translate(dx, dy, dz);
      g.rotateX(lean); g.translate(px, .85, 1.35); pieces.push(g);
    };
    for (let i = 0; i < 4; i++) {
      const trim = (i % 3) * .012;
      plank(-.39 + (i + .5) * .195, trim / 2, 0, .187, 1.7 - trim, .065);
    }
    for (const py of [-.43, .4]) plank(0, py, -.075, .82, .1, .1);
  }
  // 岡崎の作事場を形の参考に、壁のない板葺きの覆屋を架ける。
  // 梁と屋根は水平に保ち、脚だけ地面まで延ばす。棚の下も空中へ残さない。
  for (const px of [-1.75, 1.75]) {
    for (const pz of [-.8, 1.25]) {
      const bottom = ground(px, pz) - base - .12;
      box(px, (2.45 + bottom) / 2, pz, .14, 2.45 - bottom, .14);
    }
    box(px, 2.43, .225, .18, .16, 2.55);
    box(px, 2.72, .225, .12, .55, .12);
  }
  for (const pz of [-.8, 1.25]) box(0, 2.43, pz, 3.8, .16, .16);
  box(0, 3.02, .225, 4.65, .12, .16);
  // 覆屋は垂木のない薄板だけの姿から、下からも桁と小屋組が見える姿へ。
  // 四隅の上だけを固め、作業台と楯の前の空間には斜材を下ろさない。
  for (const px of [-1.75, 1.75]) for (const pz of [-.8, 1.25]) {
    beam(px, 1.96, pz, px - Math.sign(px) * .48, 2.43, pz, .09, .09);
  }
  for (let i = 0; i < 7; i++) for (const side of [-1, 1]) {
    const px = -2.1 + i * .7;
    beam(px, 2.92, .225, px, 2.92 - 1.58 * Math.tan(.34), .225 + side * 1.58, .075, .1);
  }
  for (const px of [-1.4, 1.4]) for (const pz of [-.65, .65]) {
    const bottom = ground(px, pz) - base - .08;
    box(px, bottom / 2, pz, .14, -bottom + .04, .14);
  }
  // 棟から軒へ流す短い古板。幅をそろえすぎず、押さえ木を二段通す。
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const g = ARI_BOX.clone(); g.scale(.45 - .012, .065, 1.7);
      g.rotateX(side * .34); g.translate(-2.25 + (i + .5) * .45,
        2.74 + (i % 3) * .007, .225 + side * .8); roof.push(g);
    }
    for (const distance of [.55, 1.2]) box(0, 3.04 - distance * Math.tan(.34),
      .225 + side * distance, 4.6, .075, .09);
  }
  for (const [parts, mat] of [[pieces, ARI_WORK_WOOD], [roof, ARI_WORK_ROOF]]) {
    // 雨の当たる根元は濡れ色、上は灰茶に褪せる。板ごとのむらも頂点色だけで付ける。
    // 絵と描画回数は増やさず、遠い岸・鵯塚の砦にも同じ材質を使う。
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k].attributes.position, colors = new Float32Array(p.count * 3);
      const grain = .96 + .09 * Math.sin(k * 2.4);
      for (let i = 0; i < p.count; i++) {
        const dry = THREE.MathUtils.clamp((p.getY(i) - .08) / .65, 0, 1);
        colors[i * 3] = grain * (.7 + dry * .42);
        colors[i * 3 + 1] = grain * (.72 + dry * .48);
        colors[i * 3 + 2] = grain * (.74 + dry * .58);
      }
      parts[k].setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    // 箱と板で頂点の作り（索引・uv）が違うと合わせられず null になる。そろえてから合わせる（10/19）
    const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
    const keys = Object.keys(flat[0].attributes).filter((k) => flat.every((g) => g.attributes[k]));
    for (const g of flat) for (const k of Object.keys(g.attributes)) if (!keys.includes(k)) g.deleteAttribute(k);
    const geo = mergeGeometries(flat); parts.forEach(g => g.dispose()); flat.forEach((g) => { if (!parts.includes(g)) g.dispose(); });
    geo.rotateY(rot); geo.translate(x, base, z);
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.camBlock = true; rt.scene.add(mesh);
  }
  // 四本の支柱と資材を囲う。通りへ張り出す屋根の軒には足の当たりを足さない。
  solidCircle(x, z, 2.3);
}

// 馬上でも顔の彫りと肌・甲冑の絵を残し、既存の細かな形を使う。
// 馬の膝と蹄は高さを変えず横に太らせる。形は元の形ごとに使い回す。
function refineAriRider(u) {
  if (!u.mounted || !u.horse || u.ariRiderDone === u.horse) return;
  u.ariRiderDone = u.horse;
  for (const part of [u.body, u.armL, u.armR, u.legL, u.legR]) if (part) part.traverse(m => {
    if (!m.isMesh || !m.geometry.attributes.mtl) return;
    if (m.userData.lod) { m.geometry = m.userData.lod[0]; m.userData.lod = null; m.onBeforeRender = THREE.Object3D.prototype.onBeforeRender; }
  });
  const H = u.horse.userData.horse;
  if (!H) return;
  for (const limb of [...H.legs, ...H.lowers]) for (const m of limb.children) {
    if (!m.isMesh) continue;
    const source = m.userData.lod ? m.userData.lod[0] : m.geometry;
    let g = ARI_RIDER_GEOMETRIES.get(source);
    if (!g) { g = source.clone(); g.scale(1.35, 1, 1.35); ARI_RIDER_GEOMETRIES.set(source, g); }
    m.geometry = g; m.userData.lod = null; m.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
  }
  // 尾の厚みと毛先を残す。元の形ごとに三本の毛束をまとめて使い回す。
  for (const m of H.tail.children) {
    if (!m.isMesh) continue;
    const source = m.userData.lod ? m.userData.lod[0] : m.geometry;
    let g = ARI_RIDER_GEOMETRIES.get(source);
    if (!g) {
      const locks = [];
      for (let i = -1; i <= 1; i++) {
        const lock = source.clone(); lock.scale(.55, 1 - Math.abs(i) * .08, .7);
        lock.translate(i * .035, 0, Math.abs(i) * .025); locks.push(lock);
      }
      g = mergeGeometries(locks); ARI_RIDER_GEOMETRIES.set(source, g);
      for (const lock of locks) lock.dispose();
    }
    m.geometry = g; m.userData.lod = null; m.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
  }
}

// 金の反復模様を使わず、細波と斜めから見た空の映り込みを重ねる。
// 包囲が長引いた西の陣の炊事場。写真の平楯の板と横桟、清洲の裏方小屋を
// 構造の手本にする。位置と道具は推定。出撃路から南へ三十五メートル離す。
// 火は既存の焚き火を使い、木・藁・鉄を各一束へまとめる。更新処理は持たない。
function ariCookCamp(rt) {
  const W = rt.world, x = CAMP.x - 30, z = GATE.z + 35;
  const wood = [], straw = [], iron = [];
  const box = (parts, px, py, pz, w, h, d, tilt = 0) => {
    const g = ARI_BOX.toNonIndexed(); g.scale(w, h, d); g.rotateX(tilt);
    g.translate(x + px, W.heightAt(x + px, z + pz) + py, z + pz); parts.push(g);
  };
  // 火の西側だけを板楯で風除けにする。東と南北は開き、陣幕に火を寄せない。
  for (let i = 0; i < 8; i++) {
    const pz = -1.45 + i * .41;
    box(wood, -2.3, .8, pz, .065, 1.55 - (i % 3) * .035, .395);
  }
  for (const py of [.38, 1.2]) box(wood, -2.37, py, 0, .12, .11, 3.5);
  for (const pz of [-1.55, 1.55]) box(wood, -2.42, .82, pz, .15, 1.85, .15);
  // 丸い釜は厚い縁と空洞を残し、焚き火の上に三脚で吊る。
  const y = W.heightAt(x, z), up = new THREE.Vector3(0, 1, 0);
  const beam = (ax, ay, az, bx, by, bz, width, parts) => {
    const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const g = ARI_BOX.toNonIndexed(); g.scale(width, dir.length(), width);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()));
    g.translate(x + (ax + bx) / 2, (ay + by) / 2, z + (az + bz) / 2); parts.push(g);
  };
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3, px = Math.cos(a), pz = Math.sin(a);
    beam(px, W.heightAt(x + px, z + pz) - .05, pz, 0, y + 2.2, 0, .095, wood);
  }
  beam(0, y + 1.4, 0, 0, y + 2.12, 0, .025, iron);
  const pot = new THREE.LatheGeometry([
    new THREE.Vector2(0, .66), new THREE.Vector2(.24, .67),
    new THREE.Vector2(.43, .84), new THREE.Vector2(.44, 1.12),
    new THREE.Vector2(.49, 1.14), new THREE.Vector2(.49, 1.19),
    new THREE.Vector2(.40, 1.19), new THREE.Vector2(.38, .87),
    new THREE.Vector2(.2, .74), new THREE.Vector2(0, .74),
  ], 12).toNonIndexed(); pot.translate(x, y, z); iron.push(pot);
  for (const side of [-1, 1]) beam(side * .43, y + 1.13, 0, 0, y + 1.5, 0, .03, iron);
  // 火の北側の小さな薪棚と苫葺きの覆い。地形へ各脚を下ろし、通りには出さない。
  const roofY = Math.max(...[-1.7, 1.7].flatMap(px => [-4.8, -3].map(pz => W.heightAt(x + px, z + pz)))) + 2;
  for (const px of [-1.7, 1.7]) for (const pz of [-4.8, -3])
    beam(px, W.heightAt(x + px, z + pz) - .1, pz, px, roofY, pz, .12, wood);
  for (const pz of [-4.8, -3]) beam(-1.9, roofY, pz, 1.9, roofY, pz, .14, wood);
  for (let i = 0; i < 12; i++) {
    const g = ARI_BOX.toNonIndexed(); g.scale(.315, .09, 2.25); g.rotateX(.13);
    g.translate(x - 1.8 + i * .327, roofY + .08, z - 3.9); straw.push(g);
  }
  for (const pz of [-4.5, -3.3]) beam(-2, roofY + .15, pz, 2, roofY + .15, pz, .07, wood);
  for (let i = 0; i < 15; i++) {
    const row = Math.floor(i / 5), col = i % 5;
    box(wood, -1.1 + col * .23, .14 + row * .18, -3.9 + (i % 3) * .09, .19, .17, 1.3 - (i % 3) * .12);
  }
  const mats = [ARI_WOOD, new THREE.MeshLambertMaterial({ color: 0x877955 }),
    new THREE.MeshLambertMaterial({ color: 0x34332e })];
  [wood, straw, iron].forEach((parts, i) => {
    const mesh = new THREE.Mesh(mergeGeometries(parts), mats[i]);
    mesh.receiveShadow = true; rt.scene.add(mesh); parts.forEach(g => g.dispose());
  });
  // 道具の範囲だけを塞ぐ。戦闘の前線・土橋・控えの隊の通り道には触れない。
  solidRect(x - 2.35, z, .3, 3.5, 0);
  solidRect(x, z - 3.9, 3.5, 1.8, 0);
  solidCircle(x, z, .65);
  W.addSmokeColumn(x, y + 1.23, z, { size: .22 });
}

function ariWaterMat(W) {
  // 濁った冬の堀の水。明るい水色の一枚に見えた（10/30 採点）ので、泥の混ざった黒い緑茶へ沈める。
  const mat = new THREE.MeshBasicMaterial({ color: 0x1b211c, transparent: true, opacity: .9, depthWrite: false });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uAriWaterTime = W.groundU.uTime;
    sh.vertexShader = 'varying vec3 vAriWater;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvAriWater = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uAriWaterTime; varying vec3 vAriWater;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 p = vAriWater.xz;
      float t = uAriWaterTime;
      float wave = sin(p.x * 11.0 + p.y * 7.0 + t * 1.3) * sin(p.y * 13.0 - p.x * 3.0 - t * 1.7);
      vec3 eye = normalize(cameraPosition - vAriWater);
      float reflection = pow(1.0 - abs(eye.y), 3.0);
      float murk = sin(p.x * 0.31 + p.y * 0.17) * sin(p.y * 0.23 - p.x * 0.11);
      diffuseColor.rgb *= vec3(1.0 + murk * 0.12, 1.0 + murk * 0.06, 1.0 - murk * 0.04) * (0.85 + wave * 0.1);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.075, 0.08), reflection * 0.5);
      diffuseColor.a = mix(0.9, 0.97, reflection);`);
  };
  mat.customProgramCacheKey = () => 'arioka-water';
  return mat;
}

// 有岡の幟だけ布と横竿を細くし、布の左端を竿へ三か所で結ぶ。
// 惣構えの竹の柵（竹矢来）。図鑑（docs/books/nobunaga_zukan_1114.md の有岡「川と堀・石垣と白い塀、その外に竹の柵と城下町」・台帳 K295）。
//   枯れた竹を斜めに交え、上下の貫で留め、両端と六歩ごとに丸太の柱。形は一つに束ね、当たり（solidSeg）を付けて兵も本人も抜けない。
let YARAI = null;
function takeYarai(W, ax, az, bx, bz, h = 2.2) {
  if (!YARAI) YARAI = { pole: new THREE.CylinderGeometry(0.045, 0.055, 1, 6), post: new THREE.CylinderGeometry(0.11, 0.14, 1, 7),
    bam: new THREE.MeshLambertMaterial({ color: 0x86774f }), wood: new THREE.MeshLambertMaterial({ color: 0x4a3e31 }) };
  const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L, bam = [], wood = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3();
  const stick = (out, geo, a, ay, b, by) => {   // a・b は柵の上の長さ（m）
    const x0 = ax + tx * a, z0 = az + tz * a, x1 = ax + tx * b, z1 = az + tz * b;
    const y0 = W.heightAt(x0, z0) + ay, y1 = W.heightAt(x1, z1) + by;
    V.set(x1 - x0, y1 - y0, z1 - z0); const l = V.length(); V.divideScalar(l);
    Q.setFromUnitVectors(UP, V); P.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); S.set(1, l, 1);
    out.push(geo.clone().applyMatrix4(M.compose(P, Q, S)));
  };
  const n = Math.round(L / 0.5);
  for (let i = 0; i <= n; i++) {
    const a = 0.1 + i * ((L - 0.2) / n), j = Math.sin(i * 12.9898 + ax) * 0.06;
    if (a + 0.8 <= L) stick(bam, YARAI.pole, a, -0.2, a + 0.8, h + j);
    if (a - 0.8 >= 0) stick(bam, YARAI.pole, a, -0.2, a - 0.8, h - j * 0.5);
  }
  for (const y of [0.55, h - 0.35]) stick(bam, YARAI.pole, -0.1, y, L + 0.1, y + 0.04);
  for (let a = 0; a <= L + 0.01; a += Math.max(1, L / Math.max(1, Math.round(L / 6)))) stick(wood, YARAI.post, a, -0.3, a, h + 0.35);
  const g = new THREE.Group();
  for (const [parts, mat] of [[bam, YARAI.bam], [wood, YARAI.wood]]) {
    const m = new THREE.Mesh(mergeGeometries(parts), mat); m.castShadow = true; m.receiveShadow = true; g.add(m);
    for (const q of parts) q.dispose();
  }
  Object.assign(solidSeg(ax, az, bx, bz, 0.15), { missileH: h, missileType: 'wood' });
  return g;
}
// 木戸の前の滝川の仕寄り（持ち場から最初に見える所）。竹束の列・陣小屋・兵糧・幟・篝火・刈田の稲架。
// 通り（木戸への道 z±7）と本陣から木戸への駆け道は空ける。形は共有の部品、準備時に一度だけ置く。
function ariSiegeFront(rt) {
  const W = rt.world, gx = GATE.x, gz = GATE.z;
  // 共通の野の混ぜ塗りの霜（冬の夜は 0.55）が月明かりで持ち上がり、地面が真っ白な一枚に飛ぶ。有岡は霜の斑だけ残す。
  // 乾きの寄せ（冬 0.55）も枯草を麦藁色に明るく持ち上げ、木戸の外が砂色の一枚に見える（10/29 点付け）。黒い凍て土に寄せる。
  if (W.groundU?.uLandSeason) { W.groundU.uLandSeason.value.y = 0; W.groundU.uLandSeason.value.x = 0.26; }   // 霜は斑に少し戻す（暗い土の一枚に見えた。10/29 18:10 採点）
  for (const dz of [9, 11.2, 13.4, 15.6, 17.8]) rt.scene.add(takataba(W, gx - 17, gz + dz, Math.PI / 2));
  for (const dz of [-8.5, -10.7, -12.9]) rt.scene.add(takataba(W, gx - 16, gz + dz, Math.PI / 2));
  const batch = makeSimpleBatch();
  hut(W, gx - 33, gz + 15, 6, 4.2, 0, { ita: true, boardRoof: true, weatheredBoards: true, batch, wall: 0x6e5a40 });
  hut(W, gx - 34, gz + 25, 7, 4.4, .08, { ita: true, boardRoof: true, weatheredBoards: true, batch, wall: 0x78654c });
  // 木戸へ向かう通りの南側にも、軒の低い町屋を三軒並べる（持ち場から通りの両側に軒が見えるように。戸数は推定）。
  // 通りの際（z-19〜-20）まで寄せ、北の二軒と同じく持ち場の画面の右に軒が入るようにする（置楯・俵・幟の間は空ける）。
  for (const [dx, dz, r, w, wall] of [[-30, -19.5, -.04, 7, 0x6e5a40], [-23, -20, .03, 6.5, 0x78654c], [-11, -20.5, -.02, 6, 0x6a5840]]) {
    hut(W, gx + dx, gz + dz, w, 4.4, r, { ita: true, boardRoof: true, weatheredBoards: true, batch, wall });
  }
  // 北側も木戸寄りに二軒（持ち場の画面の右に軒が入る。北の二軒は画面の外）。置楯・竹束・幟・石垣の間は空ける。
  for (const [dx, dz, r, w, wall] of [[-13.5, 20.5, .03, 6.5, 0x725e44], [-6.5, 21, -.03, 5.5, 0x6a5840]]) {
    hut(W, gx + dx, gz + dz, w, 4.4, r, { ita: true, boardRoof: true, weatheredBoards: true, batch, wall });
  }
  finalizeSimpleBatch(rt, batch);
  // 竹矢来：木戸の土橋の左右、外堀の外の縁に沿って（通り z±7 と町屋・篝火の間は空ける。K295）
  for (const [z0, z1] of [[7.8, 15.2], [-7.8, -15.2]]) rt.scene.add(takeYarai(W, gx - 11.5, gz + z0, gx - 11.5, gz + z1));
  rt.scene.add(hyoro(W, gx - 26, gz + 26, .2));
  rt.scene.add(tawara(W, gx - 19, gz - 16.5, .4, 6));
  for (const [dx, dz] of [[-25, 8.5], [-25, 13], [-25, 17.5], [-21, 21], [-20, -15]]) rt.scene.add(nobori(W, gx + dx, gz + dz, 'oda', 5.5));
  for (const [dx, dz] of [[-21, 7.6], [-21, -7.8]]) rt.scene.add(kagaribi(W, gx + dx, gz + dz));
  // 南と北の町屋の軒先に篝火を一つずつ。暗い板壁と軒を火で浮かせる。
  rt.scene.add(kagaribi(W, gx - 15, gz - 16.5)); W.addFire(gx - 15, gz - 16.5, { h: 1.3, size: .7, lightRadius: 16 });
  rt.scene.add(kagaribi(W, gx - 10, gz + 16.5)); W.addFire(gx - 10, gz + 16.5, { h: 1.3, size: .7, lightRadius: 16 });
  // 木戸への道の両脇に、木戸へ向けた置楯の列（めどり羽）。道の幅（±7）は空けたまま、画面の中ほどを埋める。
  // 楯は篝火の照り返しで橙の玩具に見えないよう、この戦だけ色を古びた灰茶の木へ沈める（材質は一つを使い回す。10/29）。
  let tateMat = null;
  for (const [x, z0, z1] of [[-27, 7.6, 14], [-27, -14, -7.6], [-33, 7.6, 12], [-33, -12, -7.6]]) {
    // 陣の木地の板（無紋・裾の泥）。裏から見ても黒い板の切り抜きでなく、夜の篝火を受けた古い木に見せる（10/29 差の表）。
    const t = tateNarabi(W, gx + x, gz + z0, gx + x, gz + z1, { fieldPairs: true, fieldTimber: true });
    if (!t) continue;
    if (t.isMesh && t.material && !Array.isArray(t.material)) {
      if (!tateMat) {
        const src = t.material; tateMat = src.clone(); tateMat.onBeforeCompile = src.onBeforeCompile; tateMat.customProgramCacheKey = src.customProgramCacheKey;
        tateMat.color.multiply(new THREE.Color(0x8c8173));
        // 月の陰の裏面が真っ黒に抜けないよう、周りの篝火の照り返しをごく弱く足す（光る縁にはしない）。
        if (tateMat.emissive) tateMat.emissive.setHex(0x0d0a07);
      }
      t.material = tateMat;
    }
    rt.scene.add(t);
  }
  for (const [dx, dz, r] of [[-30, -40, .1], [-18, -42, .05], [-36, 34, -.1]]) rt.scene.add(hasa(W, gx + dx, gz + dz, r, 8));

  // 足元の土：踏まれて黒く湿った所・轍・霜の白い斑・枯れ草の株。色は頂点に持たせ、一つの形にまとめる。
  const pos = [], col = [], c = new THREE.Color();
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // 斑は中心だけ色を持ち、縁は透明へ落とす（頂点の不透明度）。十角の縁が灰の多角形の板に見えていた（10/29 点付け）。
  const patch = (x, z, r, hex, a) => {
    const n = 12, y0 = W.heightAt(x, z) + .03, rs = [];
    for (let i = 0; i < n; i++) rs.push(r * (.65 + rnd() * .5));
    c.setHex(hex);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, r0 = rs[i], r1 = rs[(i + 1) % n];
      const ax = x + Math.cos(a0) * r0, az = z + Math.sin(a0) * r0 * .7, bx = x + Math.cos(a1) * r1, bz = z + Math.sin(a1) * r1 * .7;
      pos.push(x, y0, z, bx, W.heightAt(bx, bz) + .03, bz, ax, W.heightAt(ax, az) + .03, az);
      col.push(c.r, c.g, c.b, a, c.r, c.g, c.b, 0, c.r, c.g, c.b, 0);
    }
  };
  for (let i = 0; i < 46; i++) {
    const x = gx - 44 + rnd() * 36, z = gz - 30 + rnd() * 60;
    patch(x, z, 1.6 + rnd() * 3, rnd() < .55 ? 0x1c1812 : 0x2a241b, .4);
  }
  // 暗い青緑の一枚に見えた（10/30 採点 66）。踏まれた土の茶・霜の灰白・枯れ草の黄土の斑を、持ち場の手前から木戸まで重ねる。
  for (let i = 0; i < 70; i++) {
    const x = gx - 46 + rnd() * 40, z = gz - 26 + rnd() * 52, k = rnd();
    if (k < .4) patch(x, z, 1.2 + rnd() * 2.4, rnd() < .5 ? 0x5a4630 : 0x4a3a28, .55);
    else if (k < .72) patch(x, z, .8 + rnd() * 1.8, rnd() < .5 ? 0x8c8a84 : 0x9a968c, .32);
    else patch(x, z, 1 + rnd() * 2.2, rnd() < .5 ? 0x6e5c38 : 0x7c6a42, .5);
  }
  const blade = (x, z, h, lean) => {
    const y = W.heightAt(x, z), w = .03;
    pos.push(x - w, y, z, x + w, y, z, x + lean, y + h, z + lean * .6);
    c.setHex(rnd() < .5 ? 0x4e4836 : 0x5e5844);
    for (let j = 0; j < 3; j++) col.push(c.r, c.g, c.b, .85);
  };
  for (let i = 0; i < 90; i++) {
    const x = gx - 46 + rnd() * 38, z = gz + (rnd() < .5 ? -1 : 1) * (5 + rnd() * 26);
    for (let b = 0; b < 6; b++) blade(x + (rnd() - .5) * .35, z + (rnd() - .5) * .35, .25 + rnd() * .35, (rnd() - .5) * .25);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.computeVertexNormals();
  // 斑は薄く重ねて地の土を透かす（黒い石や白い板に見せない）。草の株も同じ形の中。
  const soil = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  soil.receiveShadow = true; soil.name = '木戸前の土'; rt.scene.add(soil);
  // 通りの荷車の轍：木戸へ向かう二筋の窪みと、その縁の霜。持ち場の手前の通りを一枚の土に見せない（10/28 点付け）。
  // 帯の中ほどだけ濃く、両の縁は透明へ落とす（縁の切れた平らな帯や白い縁取りに見せない。10/29）。
  const rp = [], rc = [], dark = new THREE.Color(0x15110c);
  const strip = (z0, w, cc, lift, wob, a) => {
    let px = gx - 50, pz = z0;
    for (let x = gx - 49; x <= gx - 3; x += 1) {
      const z = z0 + Math.sin(x * .09 + wob) * .7 + Math.sin(x * .31 + wob * 2) * .15;
      if (Math.sin(x * .23 + wob * 3) + Math.sin(x * .07 - wob) > 1.1) { px = x; pz = z; continue; }   // 所々で途切れる
      const a0 = W.heightAt(px, pz) + lift, a1 = W.heightAt(x, z) + lift;
      for (const [s0, s1, e0, e1] of [[-w, 0, 0, a], [0, w, a, 0]]) {
        rp.push(px, a0, pz + s0, x, a1, z + s0, x, a1, z + s1, px, a0, pz + s0, x, a1, z + s1, px, a0, pz + s1);
        for (const e of [e0, e0, e1, e0, e1, e1]) rc.push(cc.r, cc.g, cc.b, e);
      }
      px = x; pz = z;
    }
  };
  for (const [z0, wob] of [[-2.9, 0], [-1.3, .4], [.8, 1.7], [2.4, 2.2]]) strip(gz + z0, .3, dark, .04, wob, .38);
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 4)); rg.computeVertexNormals();
  const ruts = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
  ruts.receiveShadow = true; ruts.name = '通りの轍'; rt.scene.add(ruts);
}

function nobori(world, x, z, kind, h = 5) {
  const g = commonNobori(world, x, z, kind, h);
  ariFlag(g);
  return g;
}

// 布と竿は別々の共有形。元の形を縮めず、有岡用を一度だけ作って使い回す。
// 同じ旗を二度縮めたり、後に作る別の戦の旗まで細くしたりしない。
function ariFlag(g) {
  const flag = g.userData.flag;
  for (const mesh of [flag, flag.children[0]]) {
    const source = mesh.geometry;
    if (!ARI_FLAG_GEOMETRIES.has(source)) {
      const geo = source.clone().scale(.6, 1, 1);
      if (mesh === flag) {
        // 竿側を固定し、自由な裾ほど奥行きを持たせる。頂点と描画の数は増やさない。
        const p = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < p.count; i++) {
          const free = uv.getX(i), hem = 1 - uv.getY(i);
          p.setZ(i, p.getZ(i) + Math.sin(free * Math.PI * 2 + hem * 2.4) * .12 * free * hem);
        }
        geo.computeVertexNormals();
      }
      ARI_FLAG_GEOMETRIES.set(source, geo);
    }
    mesh.geometry = ARI_FLAG_GEOMETRIES.get(source);
  }
  // 染めの黄が月夜に鮮やかすぎ、絵の旗に見える（10/29）。夜露に濡れた黄土染めの色へ落とす。材質は種類ごとに一度だけ作る。
  const base = flag.material;
  if (base?.color && !Array.isArray(base)) {
    if (!ARI_FLAG_MATS.has(base)) {
      const m = base.clone();
      m.onBeforeCompile = base.onBeforeCompile; m.customProgramCacheKey = base.customProgramCacheKey;
      m.color.multiply(new THREE.Color(.72, .66, .56));
      ARI_FLAG_MATS.set(base, m);
    }
    flag.material = ARI_FLAG_MATS.get(base);
  }
  // 竿にある五つの乳と結び目をそのまま使い、重なる横木を足さない。
}

// 焼け落ちた屋根は葺材に合わせて薄い板か茅の塊にする。妻壁を空中に残さない。
// 準備時だけ作り、倒壊時は表示を切り替える。材質は全戸で使い回す。
// K564 記憶：燃える町屋十四軒は一軒ずつ別の形を持ち、十四軒で七十九万頂点あった。屋根の板の形・向き・張りは十四軒とも同じで、
//   違うのは板ごとの色の散らし（家の置き場の種）だけだった。形が一字一句同じ物は、色の散らしの違う三通りまでを持ち、
//   四軒目からはその三通りを順に分け合う（隣り合う家の板の色の並びは違えたまま。形・当たり・燃え方は同じ）。
function ariSameGeo(a, b) {
  const ka = Object.keys(a.attributes), kb = Object.keys(b.attributes);
  if (ka.length !== kb.length || !!a.index !== !!b.index || a.groups.length !== b.groups.length) return false;
  for (let i = 0; i < a.groups.length; i++) { const x = a.groups[i], y = b.groups[i]; if (x.start !== y.start || x.count !== y.count || x.materialIndex !== y.materialIndex) return false; }
  const same = (p, q) => { if (!q || p.itemSize !== q.itemSize || p.array.length !== q.array.length || p.normalized !== q.normalized) return false; for (let i = 0; i < p.array.length; i++) if (p.array[i] !== q.array[i]) return false; return true; };
  for (const k of ka) if (k !== 'color' && !same(a.attributes[k], b.attributes[k])) return false;
  return !a.index || same(a.index, b.index);
}
// 11/22 クラウド 有岡の持ち主（K564 読み込み）：前は十四軒の全部の形で頂点をまとめて（0.24秒）から分け合っていた。
//   分け合う形は先に元の形で比べ（色の他が同じか）、四軒目からは三通りの形を借りるので、まとめるのは借りられない形だけ。出る形・頂点は同じ。
function ariMergeShare(root, pool, n) {
  let saved = 0;
  root.traverse((o) => {
    const g = o.isMesh && o.geometry;
    if (!g || !g.attributes.position || g.morphAttributes?.position) return;
    const key = g.attributes.position.count + ':' + (g.index ? g.index.count : -1);
    const shapes = pool.get(key) || [];
    const kin = shapes.find((s) => ariSameGeo(s.raw, g));
    if (kin && kin.list.length >= 3) { const u = kin.list[n % kin.list.length]; o.geometry = u; g.dispose(); saved += u.attributes.position.count; return; }
    let use = g;
    if (!g.index) {
      // 同じ位置・向き・色の頂点を一つにまとめ索引で引く（形と見た目は同じ・頂点が約三分の一減る）。
      const j = mergeVertices(g);
      if (j !== g && j.attributes.position.count < g.attributes.position.count * .9) {
        j.userData = g.userData; if (g.boundingBox) j.computeBoundingBox(); if (g.boundingSphere) j.computeBoundingSphere();
        o.geometry = use = j; g.dispose();
      } else if (j !== g) j.dispose();
    }
    if (kin) kin.list.push(use);
    else { shapes.push({ raw: g, list: [use] }); pool.set(key, shapes); }
  });
  return saved;
}
function ariHouseRuin(rt, house) {
  const { x, z, m } = house, r = m.rotation.y, c = Math.cos(r), s = Math.sin(r);
  const roof = [], wood = [];
  const ground = (px, pz) => rt.world.heightAt(x + px * c + pz * s, z - px * s + pz * c);
  const box = (parts, px, py, pz, w, h, d, turn = 0, tilt = 0) => {
    const b = ARI_BOX.clone(); b.scale(w, h, d); b.rotateX(tilt); b.rotateY(turn);
    b.translate(px, py, pz); parts.push(b);
  };
  // 六枚の同じ長方形を敷くと、新しい床板に見える。短く割れた葺材を
  // 隙間と小さな重なりを残して置き、地面から低い山にする。準備時に二束へまとめる。
  for (let i = 0; i < 24; i++) {
    const px = (i % 6 - 2.5) * .92 + .17 * Math.sin(i * 2.3);
    const pz = (Math.floor(i / 6) - 1.5) * 1.12 + .14 * Math.cos(i * 1.7);
    const w = house.boardRoof ? .32 + (i % 3) * .08 : .7;
    const d = .8 + (i % 5) * .19, turn = Math.sin(i * 2.1) * .48;
    const tilt = Math.cos(i * 1.9) * .12;
    const reach = Math.hypot(w, d) / 2;
    const base = Math.max(ground(px, pz), ground(px - reach, pz), ground(px + reach, pz),
      ground(px, pz - reach), ground(px, pz + reach));
    const thick = house.boardRoof ? .07 : .22;
    const pile = .14 * Math.max(0, 1 - Math.hypot(px / 3, pz / 2.5));
    box(roof, px, base + thick / 2 + Math.abs(Math.sin(tilt)) * d / 2 + pile,
      pz, w, thick, d, turn, tilt);
  }
  for (let i = 0; i < 7; i++) {
    const px = Math.sin(i * 2.4) * 2.3, pz = Math.cos(i * 1.6) * 1.8;
    const length = 1 + (i % 3) * .5, turn = i * .7, tilt = .08;
    const dx = Math.sin(turn) * length / 2, dz = Math.cos(turn) * length / 2;
    const base = Math.max(ground(px, pz), ground(px - dx, pz - dz), ground(px + dx, pz + dz));
    // 支えのない横木を宙に置かず、傾いた端まで土に収める。
    box(wood, px, base + .06 + Math.sin(tilt) * length / 2 - .02,
      pz, .13, .12, length, turn, tilt);
  }
  for (const [px, pz, h] of [[-3.4, -2.4, 1.4], [3.4, -2.4, .9], [-3.4, 2.4, .7], [3.4, 2.4, 1.1]])
    box(wood, px, ground(px, pz) + h / 2 - .08, pz, .2, h + .16, .2);
  // 焼け跡にも軒並みの境を残す。戸口と家の外へ板を張り出さず、通りを塞がない。
  // 板ごとに接地させ、焼けた柱・横木と同じ一束へまとめる。毎コマは更新しない。
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      if (i === (side < 0 ? 2 : 4)) continue;
      const px = side * 3.4, pz = -2.1 + i * .68;
      const h = .12 + .18 * (.5 + .5 * Math.sin(i * 2.7 + x + side));
      box(wood, px, ground(px, pz) + h / 2 - .04, pz, .08, h + .08, .4);
    }
    for (let i = 0; i < 3; i++) {
      const px = side * 3.4, pz = -1.6 + i * 1.6;
      box(wood, px, ground(px, pz) + .12, pz, .12, .12, 1.5, .12 * side, .06);
    }
  }
  if (!ariRuinRoofMat) ariRuinRoofMat = new THREE.MeshLambertMaterial({ color: 0x766657, map: dirtTex() });
  const ruin = new THREE.Group();
  for (const [parts, mat] of [[roof, house.boardRoof ? ARI_CHAR : ariRuinRoofMat], [wood, ARI_CHAR]]) {
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat); mesh.receiveShadow = true; mesh.castShadow = true; ruin.add(mesh);
    for (const b of parts) b.dispose();
  }
  ruin.position.set(x, 0, z); ruin.rotation.y = r; ruin.visible = false; rt.scene.add(ruin);
  return ruin;
}

// 入れない町屋にも、見えている板壁と同じ位置の遮りを登録する。
// 足の当たりは小屋の既存の四角を保ち、攻撃・間合いの札だけ共通の壁判定へ渡す。
function ariHouseWalls(house) {
  const { x, z, m } = house, c = Math.cos(m.rotation.y), s = Math.sin(m.rotation.y), y = m.position.y;
  const walls = [];
  // 正面の戸口（一・二五メートル）は塞がない。
  for (const [ax, az, bx, bz] of [[-3.5, -2.5, 3.5, -2.5], [-3.5, -2.5, -3.5, 2.5],
    [3.5, -2.5, 3.5, 2.5], [-3.5, 2.5, -.625, 2.5], [.625, 2.5, 3.5, 2.5]]) {
    const wall = { k: 's', naka: -1, ax: x + ax * c + az * s, az: z - ax * s + az * c,
      bx: x + bx * c + bz * s, bz: z - bx * s + bz * c, r: .06, yBot: y + .25, yTop: y + 2.5 };
    walls.push(wall); INTERIOR_WALLS.push(wall);
  }
  return walls;
}

// 束ねて描く町屋も、主要な町屋と同じく壁と軒で視線を遮る。
// 描画用の家を増やさず、設営時に数値だけを登録する。
function ariStreetHouseSight(rt, x, z, rot, w = 7, d = 5) {
  const house = {}, y = rt.world.heightAt(x, z), c = Math.cos(rot), s = Math.sin(rot);
  rt.flags.ariCameraHouses.push(
    { house, x, z, y, c, s, half: w / 2 + .22, depth: d / 2 + .22, bottom: 0, top: 3 },
    { house, x, z, y, c, s, half: w / 2 + 1.5, depth: d / 2 + 1.5, bottom: 2.9, top: 5 });
}

function burnHouse(rt, h) {
  h.burnt = true;
  const W = rt.world;
  // 11/6 kaito 四6：火は地面の小さな炎だけで、家が燃えて見えなかった。軒と屋根の上にも火を上げ、煙の柱を立てる（炎と煙は共通の作り）。
  h.fires = [W.addFire(h.x + .6, h.z - .4, { h: 1.6, size: 2.2 }), W.addFire(h.x - 1.4, h.z + .6, { h: 3.4, size: 2.8 }), W.addFire(h.x + 1.8, h.z + .2, { h: 4.2, size: 2.4 })];
  rt.army.play('wood', { x: h.x, z: h.z }, .8);
  rt.army.smoke && rt.army.smoke(h.x, W.heightAt(h.x, h.z) + 4, h.z, 0, 0);
  // 元の家を地面の原点まわりに回すと屋根と三角の妻壁が浮くため、接地した焼け跡へ替える。
  // 11/5 遊んで直す：三十秒ほどで辻の四方の家が平たい焼け跡になり、④の辻が何も無い野原に見え、屋根の火が宙に浮いていた。
  //   町家は一刻ほど燃え続ける。追加された奥の木戸と官兵衛の迎えまで、柱と屋根を残す。
  rt.after(1100 + Math.random() * 40, () => {
    if (h.collapsed) return;
    h.collapsed = true; h.m.visible = false; h.ruin.visible = true;
    // 軒が落ちたら、別の束にまとめた提灯と吊り紐も消す。
    // この家の頂点だけを地中の一点へ畳み、ほかの家と描画の束は保つ。
    const lanternY = W.heightAt(h.x, h.z) - 1;
    for (const part of h.lanternParts || []) {
      const p = part.position;
      for (let i = part.start; i < part.end; i++) p.setXYZ(i, h.x, lanternY, h.z);
      p.needsUpdate = true;
    }
    // 屋根と壁が落ちた後も家一軒分の見えない箱が残っていた。
    // 入れない町屋だけ箱を外し、見えている四隅の柱の足元へ置き換える。
    if (h.solids) {
      for (const solid of h.solids) {
        const i = SOLIDS.indexOf(solid); if (i >= 0) SOLIDS.splice(i, 1);
      }
      const c = Math.cos(h.m.rotation.y), s = Math.sin(h.m.rotation.y);
      for (const px of [-3.4, 3.4]) for (const pz of [-2.4, 2.4])
        solidCircle(h.x + px * c + pz * s, h.z - px * s + pz * c, .15);
    }
    // 屋根が落ちた後の火元も焼け跡へ下ろす。炎だけを元の軒の高さに残さない。
    for (const fire of h.fires) {
      const ground = W.heightAt(fire.x, fire.z);
      const base = ground + .2 + fire.size * .35;
      const drop = fire.base - base;
      fire.base = base; fire.ly -= drop;
      fire.flame.position.y -= drop; fire.inner.position.y -= drop;
      fire.glowFalloff = 1 / (1 + .2 ** 2 / (fire.lightRadius * fire.lightRadius));
      W.moveSmokeColumn(fire.smoke, fire.x, base + fire.size * .5, fire.z);
    }
    // 焼け落ちた家には、見えない立ち壁を残さない。
    if (h.walls) for (const wall of h.walls) {
      const i = INTERIOR_WALLS.indexOf(wall); if (i >= 0) INTERIOR_WALLS.splice(i, 1);
    }
    rt.army.play('wood', { x: h.x, z: h.z }, 1.2);
    rt.army.smoke && rt.army.smoke(h.x, W.heightAt(h.x, h.z) + 1, h.z, 0, 0);
  });
}
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

import { dressStage } from './stage_dress.js';
import { chargeFujinBlocks, chargeWithRoom } from './mass_charge.js';   // K467：布陣の太い塊を一度に寄せる
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_arioka.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ読む

// 備えごとの人数・細かな持ち場は復元値。総勢とは別に本物の兵を増やさない。
// 名の伝わらない持ち場に架空の将を置かず、旗と紋は既存の家の物で示す。
function sonaePlan(name, team, honjin, facing, rows) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, sonae: rows.map(([id, role, general, soldiers, x, z, face, flag, mon, count = 0, w = 14, d = 8]) => ({
    id, role, general, soldiers, at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
    facing: face, flag, mon, count, w, d, bindOnly: count === 0,
  })) };
}

// 信長公記の十月の攻め。村重は尼崎へ移っており、有岡の本陣には置かない。
// 信忠は九月十二日に囲みの半ばを率いて尼崎へ向かった（有岡城の戦い）。十月十五日の夜、この口の攻めは滝川一益が預かる。
// 丹羽長秀はこの夜の囲みの将の名に無い。付城の控えは名の伝わる津田信澄（十一月に本丸へ入る）と、名の伝わらない将に。
// 岸は渡辺勘大夫、鵯塚は野村丹後。細かな持ち場と人数は推定。荒木の旗・紋は丸の代用（既存の表示）。
const ARIOKA_ATTACK = sonaePlan('惣構えの囲み', 0, { x: CAMP.x, z: CAMP.z + 4 }, Math.PI, [
  ['honjin', '西の攻め口の陣', '滝川一益', 5000, CAMP.x, CAMP.z + 4, Math.PI / 2, 'takigawa', 'takigawa'],
  ['taki', '南の仕寄り', '滝川一益の配下', 5000, -36, 70, Math.PI, 'takigawa', 'takigawa', 90, 30, 14],
  ['niwa', '西の付城の控え', '津田信澄', 6000, GATE.x - 32, -58, Math.PI / 2, 'oda', 'oda', 70, 20, 16],
  ['north', '北の付城の控え', '付城の衆', 9000, -24, SOKAKU_N - 24, 0, 'oda', 'oda', 70, 28, 14],
]);
// 木戸から東へ続く侍町の通りと、北へ上る町筋の両側に、低い板葺きの家を軒を連ねて並べる（清洲 CG の詰まった町並み）。
// 戸数と並びは推定。道の幅・戦う辻・既にある建物と当たりには重ねず、全棟を一つの束へ結合する。
function ariStreetHouses(rt, W) {
  const segD = (x, z, [ax, az], [bx, bz]) => {
    const vx = bx - ax, vz = bz - az, L = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L));
    return Math.hypot(x - ax - vx * t, z - az - vz * t);
  };
  const roadD = (x, z) => {
    let d = Infinity;
    for (const r of ARIOKA_ROADS) for (let i = 1; i < r.length; i++) d = Math.min(d, segD(x, z, r[i - 1], r[i]));
    return d;
  };
  const fights = [[GATE.x, GATE.z, 30], [TOWN_X - 24, GATE.z, 28], [TOWN_X - 12, -70, 28], [TOWN_X, -14, 26]];
  const spots = [];
  // 重さ（10/28 測り）：遠い棟は霧に沈むので、木戸から見える通りの手前だけに絞る。
  for (let x = TOWN_X + 14; x <= TOWN_X + 104; x += 8.2) for (const s of [-1, 1]) spots.push([x, GATE.z + s * 7.6, 0]);
  for (let z = GATE.z - 18; z >= -150; z -= 8.2) for (const s of [-1, 1]) spots.push([TOWN_X + s * 7.6, z, Math.PI / 2]);
  // 11/5 遊んで直す：④⑤で辻から東（本丸の方）を向くと、家の無い野原と遠い山だけが映った。辻から東へ延びる侍町の通りの両側にも
  //   屋敷の軒を並べる（戸数は推定）。寄せ返す荒木勢が辻へ来る筋（北東・南東から斜め）は辻から二十八メートルの内なので塞がない。
  for (let x = TOWN_X + 28; x <= TOWN_X + 76; x += 8.2) for (const s of [-1, 1]) spots.push([x, ARI_JUNCTION.z + s * 8.4, 0]);
  // 木戸から辻へ北へ上る町筋の両側にも、軒を連ねた町屋（伊丹郷町は惣構えの内に町家が詰まっていた。11/5 見せ場で通りが空き地に見えた）。
  // 戸数・間口は推定。押さえる辻は半径十六メートル、道の曲がり角は十メートル、町で組み合う組と荒木勢の出る所は七メートル空ける。
  const keep = [[TOWN_X, -14, 16], [TOWN_X - 12, -44, 7], [TOWN_X + 11, -46, 7], [TOWN_X - 10, -40, 7], [TOWN_X + 22, -30, 7], [TOWN_X + 10, -66, 7], [-SOKAKU_X + 10, -4, 7]];
  for (const [[ax, az], [bx, bz]] of [[[TOWN_X - 24, GATE.z], [TOWN_X - 12, -70]], [[TOWN_X - 12, -70], [TOWN_X, -14]]]) {
    const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L, rot = Math.atan2(tx, tz) + Math.PI / 2;
    for (let u = 4; u < L - 4; u += 7.8) for (const s of [-1, 1]) spots.push([ax + tx * u - tz * s * 8.4, az + tz * u + tx * s * 8.4, rot, 10 / 28, keep]);
  }
  const batch = makeSimpleBatch(), start = SOLIDS.length;
  for (const [x, z, rot, fr = 1, away = []] of spots) {
    const w = 7, d = 5, turned = Math.abs(Math.sin(rot)) > .7, hw = (turned ? d : w) / 2 + 1, hd = (turned ? w : d) / 2 + 1;
    if (fights.some(([fx, fz, r]) => Math.hypot(x - fx, z - fz) < r * fr)) continue;
    if (away.some(([fx, fz, r]) => Math.hypot(x - fx, z - fz) < r)) continue;
    let ok = true, low = Infinity, high = -Infinity;
    for (const ex of [-hw, 0, hw]) for (const ez of [-hd, 0, hd]) {
      const y = W.heightAt(x + ex, z + ez); low = Math.min(low, y); high = Math.max(high, y);
      if (roadD(x + ex, z + ez) < 2.6) ok = false;
    }
    if (!ok || high - low > .5) continue;
    // 前からある当たりだけと比べる（配列を家ごとに写さない。答えは同じ）。
    let hit = false;
    for (let k = 0; k < start && !hit; k++) { const o = SOLIDS[k]; hit = o.x0 < x + hw && o.x1 > x - hw && o.z0 < z + hd && o.z1 > z - hd; }
    if (hit) continue;
    // 11/20 クラウド29 K455（有岡は記憶の予算で1位・侍町の家123軒の束で133万頂点＝全体の22%）：板葺きの屋根を一枚ずつの板（片側十五枚・段の刻み）で組むと一軒一万頂点を超えた。
    //   戦う辻・木戸・町筋の組み合う所から二十五m より遠い家（板の葺き重ねの段は十五m より先では見えない）は、同じ板・同じ材質のまま、板の葺き重ねの段の刻み（weatheredBoards）だけを省く（板の並びと色は同じ）
    const far = Math.min(...fights.map(([fx, fz]) => Math.hypot(x - fx, z - fz)), ...keep.map(([fx, fz]) => Math.hypot(x - fx, z - fz))) > 25;
    hut(W, x, z, w, d, rot, { ita: true, boardRoof: true, weatheredBoards: !far, batch, wall: (x + z) % 3 > 1.5 ? 0x6e5a40 : 0x78654c });
    ariStreetHouseSight(rt, x, z, rot);
  }
  finalizeSimpleBatch(rt, batch);
}
const ARIOKA_DEFEND = sonaePlan('三砦と主郭の守り', 1, { x: HON_X - 2, z: HON_CENTER_Z - 6 }, 0, [
  ['honjin', '本陣', '荒木久左衛門', 2400, HON_X - 2, HON_CENTER_Z - 6, 0, 'maru', 'maru'],
  ['kishi', '岸の砦', '渡辺勘大夫', 700, 20, SOKAKU_N + 26, 0, 'maru', 'maru', 70, 28, 14],
  ['joro', '上臈塚砦', '中西新八郎ら', 300, JORO_TORIDE.x + 12, JORO_TORIDE.z, -Math.PI / 2, 'maru', 'maru', 0, 8, 10],
  ['hiyodori', '鵯塚砦', '野村丹後', 900, 28, WALL_Z - 10, 0, 'maru', 'maru', 35, 18, 10],
  ['town', '侍町の控え', '荒木久左衛門の配下', 700, TOWN_X - 26, -76, 0, 'maru', 'maru', 0, 8, 6],
]);

// 11/6 kaito 四3：敵味方が同じ青灰の胴で見分けられなかった。どちらも黒漆の具足（四3 基本は黒）で、威の糸だけ替える（推定復元）。
const TAKIGAWA = { flag: 'takigawa', armor: 0x1c1d22, lace: 0x2a3550 };   // 滝川の手は滝川の旗（丸に竪木瓜）・紺糸威
const ARAKI = { flag: 'maru', armor: 0x241e1a, lace: 0x6a3020 };            // 荒木の紋（無いので丸で代える）・茶糸威

// 水堀（惣構えの木戸の外・本丸の石垣の手前）の窪み。地形の焼きだけに使う純な関数（castles/arioka.js の縄張り）
const MOAT_FNS = [
  ...SOTO_MOAT_SEGS.map((pts) => horiboriHeight(pts, { depth: SOTO_MOAT.depth, width: SOTO_MOAT.width })),
  ...HON_MOAT_SEGS.map((pts) => horiboriHeight(pts, { depth: HON_MOAT.depth, width: HON_MOAT.width })),
  ...HON_W_MOAT_SEGS.map((pts) => horiboriHeight(pts, { depth: HON_W_MOAT.depth, width: HON_W_MOAT.width })),
];
// 国土地理院の標高（asset_dem_arioka.js）：伊丹段丘の東の縁の段差を、手書きの高さに薄く混ぜる
// 地形を作る前に標高をそろえる。後から地面だけ変わり、石段・床・建物とずれるのを防ぐ。
let ariDem = null;
useTerrain('dem_arioka', (data) => { ariDem = data; });
const ARI_DEM_OPT = { scale: 0.18, floor: 0 };
const clamp = (v) => Math.max(0, Math.min(1, v));
// 塀と堀を直線で横切らず、手前で道の中央へ寄り、口を抜けてから行き先へ向かう。
// 兵と試し役が同じ道を使う。曲がり角の入れ物は一人につき一つを使い回す。
function gateWay(army, u, goal) {
  // 後列の歩き先は、既に組が通った角に沿って決まっている。
  // 辻への案内で上書きすると持ち場を通り越し、後列が戻れず到着待ちになる。
  if (goal === u._columnWay && !u.isPlayer && !u.fleeing && u.group?.followColumnRoad &&
      u.group.roadColumn && u.group.order === 'path' && u.group.pathIdx > 0) return goal;
  const p = u.pos, outward = goal.x < p.x;
  // 曲がり角へ一歩以内で止まると、次の道へ切り替える幅（八十センチ）に届かない。
  const q = u._ariWay || (u._ariWay = { x: 0, z: 0, botRadius: .4 });
  // 二列の兵を同じ一点へ集めない。遊び手の案内は道の中央のまま。
  const lane = u.isPlayer ? 0 : (u.slot % 2 ? .65 : -.65);
  if (p.x <= GATE.x + 1.5) {
    const next = outerGateWay(p, goal, q, lane);
    if (next !== goal) return next;
  }
  // 町屋の並びを斜めに横切らない。帰りも同じ通りへ寄ってから砦へ戻る。
  // 通りの西には家（町の中心から西へ六メートル）があり、壁際を歩くと兵が詰まる。
  const streetX = TOWN_X + 2 + lane;
  // 帰る味方も北から寄せる敵も、通りから木戸と同じ横道へ出る。
  // 北の控えを西へ先に曲げると、町屋の裏と砦の北柵へ詰まってしまう。
  // 東口で待つ控えも、町屋の裏を斜めに横切らず、通りを南へ下ってから曲がる。
  const approachDepth = goal.x < GATE.x + 23 ? 2.5 : 10;
  const gateApproach = goal.x < GATE.x + 23 || (goal.x < TOWN_X && Math.abs(goal.z - GATE.z) <= 10);
  if (Math.abs(p.z - GATE.z) > approachDepth && gateApproach && p.x > GATE.x + 23) {
    // 辻の方（北）から木戸へ下る時は、斜めの町筋の角をたどる（縦の通りへ寄ると町屋を突き抜ける）。
    if (p.z > GATE.z) return ariStreetCorner(p, q, lane, true);
    q.x = streetX; q.z = Math.abs(p.x - streetX) > .8 ? p.z : GATE.z;
    return q;
  }
  const fort = TORIDE_WORKS[1];
  // 南北の閉じた柵へ斜めに進む時も、東西の口へ回る。
  // 外側からは先に角の外へ寄り、柵を横切る斜めの道を作らない。
  for (let i = 0; i < 2; i++) {
    const z = i === 0 ? fort.z0 : fort.z1;
    if ((p.z - z) * (goal.z - z) >= 0) continue;
    const x = p.x + (goal.x - p.x) * (z - p.z) / (goal.z - p.z);
    if (x < fort.x0 - 1 || x > fort.x1 + 1) continue;
    const east = goal.x >= (fort.x0 + fort.x1) / 2;
    q.x = east ? fort.x1 + 3 : fort.x0 - 1.5;
    const outside = p.z < fort.z0 || p.z > fort.z1;
    q.z = outside && Math.abs(p.x - q.x) > .8 ? p.z : GATE.z + lane;
    return q;
  }
  for (let i = 0; i < 2; i++) {
    const x = outward ? (i === 0 ? fort.x1 : fort.x0) : (i === 0 ? fort.x0 : fort.x1);
    const crossing = (p.x - x) * (goal.x - x) < 0;
    const leaving = Math.abs(p.x - x) < 1.5 && Math.abs(goal.x - x) >= 1.5;
    if (!crossing && !leaving) continue;
    const crossingZ = crossing ? p.z + (goal.z - p.z) * (x - p.x) / (goal.x - p.x) : p.z;
    if (crossingZ < fort.z0 - 1 || crossingZ > fort.z1 + 1) continue;
    if (Math.abs(p.z - GATE.z) <= 5.5 && Math.abs(goal.z - GATE.z) <= 5.5) continue;
    const side = Math.abs(p.z - GATE.z) > 5.5 ? (p.x < x ? -1 : 1) : (goal.x < x ? -1 : 1);
    q.x = x + side * (x === fort.x0 && side < 0 ? 1.5 : 3); q.z = GATE.z + lane;
    return q;
  }
  if (goal.x > TOWN_X - 16 && goal.z > -34 && p.z < -34) {
    // 曲がり角の手前四十センチで止まっても、通りへ入った判定を越える。
    // 判定線そのものを目的地にすると、辻の直前で同じ印を追い続ける。
    // 砦を出たら通りへ寄り、町筋まで来た兵を木戸の横道へ戻さない。
    // 退避後に通りの西へ一歩ずれただけでも、六十メートル引き返していた。
    // 11/6 描いて遊んで直す：町筋は木戸の通りの角（TOWN_X-24）から辻へ斜めに上り、両側に町屋が並ぶ（ARI_STREET）。
    //   前の「TOWN_X+2 の縦の通り」へ東へ向かう案内は、斜めの町筋の東の町屋を突き抜け、遊び手も組も壁に当たって百秒止まった。
    //   町筋の上の一番近い所から、次の曲がり角を行き先にする。
    // 11/21 クラウド kaito2（act bot：③の始め171〜280秒、本人が②の角 (-365,-106) に立ったまま▼が角と次の角 (-352,-70) を行き来した）：
    //   角の切り替えが二m、▼の「着いた」が三m で食い違い、角から二〜三m の所で着いたと見て止まっていた。本人だけ三・五m で次の角へ（五m も試したが角の西 (-368,-105) で▼が通りへの寄せ点と次の角を行き来し百八十秒止まった回が出たので三・五m）
    const w = ariStreetCorner(p, q, lane, false, u.isPlayer ? 3.5 : 2);
    return u.isPlayer ? ariJoinDetour(p, w) : w;
  }
  return outerGateWay(p, goal, q, lane);
}
// 線分が町屋の当たり（SOLIDS の箱）を横切るか。行き先の近く四十メートルの箱だけ見る。
// 11/18 クラウド kaito2：斜めの町筋の町屋は回した四角（k 'r'）。囲みの箱（x0〜z1）で見ると、重なって並ぶ三軒の箱の中に本人が立つ事になり、
//   どの線も「当たる」で回り道が一つも見つからなかった（辻の北の町屋の裏で四十〜八百秒の往復）。回した四角はその向きのまま見る。
function ariSegHit(ax, az, bx, bz, list, m = .4) {
  for (const o of list) {
    let t0 = 0, t1 = 1;
    let A = ax, Z = az, B = bx, W = bz, X0 = o.x0 - m, X1 = o.x1 + m, Z0 = o.z0 - m, Z1 = o.z1 + m;
    if (o.k === 'r') {
      const c = o.c, s = o.s, dx = ax - o.x, dz = az - o.z, ex = bx - o.x, ez = bz - o.z;
      A = dx * c - dz * s; Z = dx * s + dz * c; B = ex * c - ez * s; W = ex * s + ez * c;
      X0 = -o.hw - m; X1 = o.hw + m; Z0 = -o.hd - m; Z1 = o.hd + m;
    }
    // 11/22 16:20 クラウド 有岡の持ち主（K564 重さ）：前は箱ごとに [[…],[…]] の配列を二つ作っていた（本人の回り道で一コマ数千個のごみ）。同じ式を配列なしで
    let d = B - A;
    if (Math.abs(d) < 1e-6) { if (A < X0 || A > X1) continue; }
    else { let u = (X0 - A) / d, v = (X1 - A) / d; if (u > v) { const t = u; u = v; v = t; } if (u > t0) t0 = u; if (v < t1) t1 = v; if (t0 > t1) continue; }
    d = W - Z;
    if (Math.abs(d) < 1e-6) { if (Z < Z0 || Z > Z1) continue; }
    else { let u = (Z0 - Z) / d, v = (Z1 - Z) / d; if (u > v) { const t = u; u = v; v = t; } if (u > t0) t0 = u; if (v < t1) t1 = v; if (t0 > t1) continue; }
    return true;
  }
  return false;
}
// 11/18 クラウド（act bot 1020秒 刻限負け）：「侍町の辻を取れ」の段で本人が斜めの町筋の西の町屋の裏 (-370,-87) に出ると、
//   町筋の一番近い所への▼が町屋を突き抜け、八百秒 町屋の壁に当たり続けた。本人の▼だけ、間に町屋があれば両方の線が空く回り道の点へ（本人か行き先の周り四〜十六m）
const ARI_JOIN = { x: 0, z: 0 }, ARI_JOIN_NEAR = [];
// 11/22 16:20 クラウド 有岡の持ち主（K564 重さ）：本人と▼がほとんど動かない間（三十cm 内・〇・二五秒内）は前の答えを使う（毎コマ百二十八点×二本の線を調べていた）
const ARI_JOIN_C = { t: -1, px: 0, pz: 0, wx: 0, wz: 0, same: true, r: null };
function ariJoinDetour(p, w) {
  const C = ARI_JOIN_C, now = performance.now();
  if (C.t >= 0 && now - C.t < 250 && Math.abs(p.x - C.px) < .3 && Math.abs(p.z - C.pz) < .3 && Math.abs(w.x - C.wx) < .3 && Math.abs(w.z - C.wz) < .3) return C.same ? w : C.r;
  const r = ariJoinDetour0(p, w);
  C.t = now; C.px = p.x; C.pz = p.z; C.wx = w.x; C.wz = w.z; C.same = r === w; C.r = r;
  return r;
}
function ariJoinDetour0(p, w) {
  const near = ARI_JOIN_NEAR; near.length = 0;
  const x0 = Math.min(p.x, w.x) - 20, x1 = Math.max(p.x, w.x) + 20, z0 = Math.min(p.z, w.z) - 20, z1 = Math.max(p.z, w.z) + 20;
  for (const o of SOLIDS) if (o.x1 > x0 && o.x0 < x1 && o.z1 > z0 && o.z0 < z1 && o.x1 - o.x0 > 1 && o.z1 - o.z0 > 1) near.push(o);
  if (!ariSegHit(p.x, p.z, w.x, w.z, near)) return w;
  let best = Infinity, ok = false;
  for (const c of [p, w]) for (const r of [4, 8, 12, 16]) for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    if (ariSegHit(p.x, p.z, x, z, near) || ariSegHit(x, z, w.x, w.z, near)) continue;
    const d = Math.hypot(p.x - x, p.z - z) + Math.hypot(w.x - x, w.z - z);
    if (d < best) { best = d; ARI_JOIN.x = x; ARI_JOIN.z = z; ok = true; }
  }
  return ok ? ARI_JOIN : ariGridDetour(p, w) || w;
}
// 11/18 クラウド kaito2（描かずの通し：段3で本人を辻の北の町屋の裏 (-369,-85) に置くと、四十秒〜八百秒 町屋の壁と往復）：
//   西の町屋の並び（三軒が斜めに重なる）は一つの曲がり点では抜けられず、北の端（z≈-63）を二度曲がって通りへ出る。
//   一点で抜けられない時だけ、二m の升目で道を探し（町屋の当たりを避け）、本人から真っすぐ見える一番先の升を▼の行き先にする。半秒ごとに決め直す。
const ARI_GRID = { t: -1, x: 0, z: 0, ok: false, near: [] };
function ariGridDetour(p, w) {
  const G = ARI_GRID, now = performance.now();
  if (now - G.t < 500 && G.t >= 0 && Math.hypot(p.x - G.px, p.z - G.pz) < 3) return G.ok ? G : null;
  G.t = now; G.px = p.x; G.pz = p.z; G.ok = false;
  const S = 2, M = 24, x0 = Math.min(p.x, w.x) - M, z0 = Math.min(p.z, w.z) - M;
  const nx = Math.min(70, Math.ceil((Math.max(p.x, w.x) + M - x0) / S)), nz = Math.min(70, Math.ceil((Math.max(p.z, w.z) + M - z0) / S));
  const near = G.near; near.length = 0;
  for (const o of SOLIDS) if (o.x1 > x0 && o.x0 < x0 + nx * S && o.z1 > z0 && o.z0 < z0 + nz * S && o.x1 - o.x0 > 1 && o.z1 - o.z0 > 1) near.push(o);
  const blocked = (i, j) => { const x = x0 + (i + .5) * S, z = z0 + (j + .5) * S; for (const o of near) if (x > o.x0 - .6 && x < o.x1 + .6 && z > o.z0 - .6 && z < o.z1 + .6) { if (o.k !== 'r') return true; const dx = x - o.x, dz = z - o.z; if (Math.abs(dx * o.c - dz * o.s) < o.hw + .6 && Math.abs(dx * o.s + dz * o.c) < o.hd + .6) return true; } return false; };
  const cell = (x, z) => [Math.max(0, Math.min(nx - 1, Math.floor((x - x0) / S))), Math.max(0, Math.min(nz - 1, Math.floor((z - z0) / S)))];
  const [si, sj] = cell(p.x, p.z), [gi, gj] = cell(w.x, w.z);
  const prev = new Int32Array(nx * nz).fill(-1), q = [si + sj * nx]; prev[q[0]] = q[0];
  let found = -1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], i = c % nx, j = (c - i) / nx;
    if (i === gi && j === gj) { found = c; break; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const k = a + b * nx; if (prev[k] >= 0 || blocked(a, b)) continue;
      prev[k] = c; q.push(k);
    }
  }
  if (found < 0) return null;
  const path = []; for (let c = found; ; c = prev[c]) { path.push(c); if (prev[c] === c) break; }
  // path は行き先→本人の順。本人から町屋を横切らず真っすぐ見える一番先（行き先に近い）の升へ。
  for (const c of path) {
    const i = c % nx, j = (c - i) / nx, x = x0 + (i + .5) * S, z = z0 + (j + .5) * S;
    if (Math.hypot(x - p.x, z - p.z) < 1.5) continue;
    if (!ariSegHit(p.x, p.z, x, z, near)) { G.x = x; G.z = z; G.ok = true; break; }
  }
  return G.ok ? G : null;
}
// 本人と行き先の間に町屋がある時の回り道の点（行き先の周り八・十二メートルの輪から、両方の線が空く一番近い所）。半秒ごとに決め直す。
const ARI_DETOUR = { t: -1, x: 0, z: 0, ok: false, near: [] };
function ariHouseDetour(rt, p, post) {
  const D = ARI_DETOUR;
  if (rt.t - D.t < .5 && D.t >= 0) return D.ok ? D : null;
  D.t = rt.t; D.ok = false;
  if (Math.hypot(p.x - post.x, p.z - post.z) > 45) return null;
  const near = D.near; near.length = 0;
  for (const o of SOLIDS) if (o.x1 > post.x - 40 && o.x0 < post.x + 40 && o.z1 > post.z - 40 && o.z0 < post.z + 40 && o.x1 - o.x0 > 1 && o.z1 - o.z0 > 1) near.push(o);
  // 11/22 08:40 クラウド 有岡の持ち主（K582 流れ・描かずの通し 二回とも）：辻の南西 (-353,-27) で本人と辻の間に塀（家でなく柵・塀の当たり）があり、
  //   ▼が塀越しに辻を指したまま本人が三十秒余り塀に押し付けられた。家と同じく塀の当たりも遮りに数え、空いた口を先に指す
  const A = rt.army, W = D.w || (D.w = { x: 0, z: 0 });
  const wall = (ax, az, bx, bz) => { W.x = bx; W.z = bz; D.a = D.a || { x: 0, z: 0 }; D.a.x = ax; D.a.z = az; return A.wallBetween(D.a, -1, W); };
  if (!ariSegHit(p.x, p.z, post.x, post.z, near)) return null;
  // 11/22 09:30 クラウド 有岡の持ち主（描かずの通し：145秒から九十秒余り (-353,-27) で止まる）：回り道の点 (-353,-19) が家には遮られないが、
  //   点への線が町屋（-350,-26）の西の壁から一cm しか離れず、本人の体が壁に当たって進めなかった。遮りの判定は前のまま、
  //   選ぶ点だけ本人からの線が家から一・一m 離れ・塀も挟まない物を先にする（無ければ前の点）
  let best = Infinity, bestW = Infinity, wx = 0, wz = 0;
  for (const r of [8, 12]) for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, x = post.x + Math.cos(a) * r, z = post.z + Math.sin(a) * r;
    if (ariSegHit(x, z, post.x, post.z, near) || ariSegHit(p.x, p.z, x, z, near)) continue;
    const c = Math.hypot(p.x - x, p.z - z) + r;
    if (c < best) { best = c; D.x = x; D.z = z; D.ok = true; }
    if (c < bestW && !ariSegHit(p.x, p.z, x, z, near, 1.1) && !wall(p.x, p.z, x, z)) { bestW = c; wx = x; wz = z; }
  }
  if (bestW < Infinity) { D.x = wx; D.z = wz; }
  return D.ok ? D : null;
}
// 町筋（木戸の通りの角→斜めの町筋→辻）の次の曲がり角。back は辻から木戸へ下る向き。
// 角の二メートル手前で次の角へ切り替え、組の二列は町筋に直角へずらす。
function ariStreetCorner(p, q, lane, back = false, near = 2) {
  const R = back ? ARI_TOWN_WAY_BACK : ARI_TOWN_WAY;
  let best = Infinity, bi = 0, joinX = 0, joinZ = 0;
  for (let i = 0; i < R.length - 1; i++) {
    const [ax, az] = R[i], [bx, bz] = R[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / L2));
    const d = Math.hypot(ax + dx * t - p.x, az + dz * t - p.z);
    // 11/22 13:20 クラウド 有岡の持ち主（描かずの通し：本人を角 (-352,-70) の北東 (-344,-58) に置くと、▼が辻でなく南の角へ戻り、本人が六m 後ろへ下がって敵二十の中で止まった）：
    //   前の筋の終わり（角）と次の筋が同じ近さの時は、先の筋を選ぶ（<= で後の筋を取る）
    if (d < best - .01 || (near > 2 && d <= best + .01 && i === bi + 1)) { best = d; bi = i; joinX = ax + dx * t; joinZ = az + dz * t; }
  }
  // 通りから離れた控えや押し出された兵は、先に最寄りの町筋へ戻す。
  // 次の角へ直接向かわせると、辻の東から南へ寄せる兵が町屋を斜めに横切って止まる。
  if (best > 3) {
    const dx = R[bi + 1][0] - R[bi][0], dz = R[bi + 1][1] - R[bi][1];
    const L = Math.hypot(dx, dz);
    // 11/21 クラウド kaito2（act bot：②の角の西二〜四m で▼が通りへの寄せ点に重なり、本人が「着いた」と見て止まった）：
    //   本人（near>2）は寄せ点そのものでなく、町筋を次の角の方へ四m 進めた所を行き先にする（三m の「着いた」に入らない）。
    const ahead = near > 2 ? Math.min(4, Math.hypot(R[bi + 1][0] - joinX, R[bi + 1][1] - joinZ)) : 0;
    // 寄せ点が角そのもの（前の筋の終わり）の時、本人の▼は次の筋を四m 進めた所へ（角へ戻って辻から離れない）
    if (near > 2 && ahead < 1 && bi + 2 < R.length) {
      const ex = R[bi + 2][0] - R[bi + 1][0], ez = R[bi + 2][1] - R[bi + 1][1], eL = Math.hypot(ex, ez) || 1;
      q.x = R[bi + 1][0] + ex / eL * 4 - ez / eL * lane; q.z = R[bi + 1][1] + ez / eL * 4 + ex / eL * lane;
      return q;
    }
    q.x = joinX + dx / L * ahead - dz / L * lane; q.z = joinZ + dz / L * ahead + dx / L * lane;
    return q;
  }
  let k = bi + 1;
  // 11/21 クラウド kaito2（POSLOG：本人が角 (-364,-107) の北西 (-367,-105) で三十秒、▼が角と次の角を行き来）：
  //   角の北西は次の町筋へ進むほど角から離れ、三・五m を越えると▼が角へ戻っていた。本人は次の町筋の上で角を越えていれば次の角へ。
  if (k < R.length - 1 && near > 2) {
    const [cx, cz] = R[k], [nx, nz] = R[k + 1], ex = nx - cx, ez = nz - cz, eL = Math.hypot(ex, ez) || 1;
    const along = ((p.x - cx) * ex + (p.z - cz) * ez) / eL, off = Math.abs((p.x - cx) * ez - (p.z - cz) * ex) / eL;
    if (along > 0 && off < 6) k++;
    else if (Math.hypot(cx - p.x, cz - p.z) < near) k++;
  } else if (k < R.length - 1 && Math.hypot(R[k][0] - p.x, R[k][1] - p.z) < near) k++;
  const [ax, az] = R[k - 1], [bx, bz] = R[k], L = Math.hypot(bx - ax, bz - az) || 1;
  q.x = bx - (bz - az) / L * lane; q.z = bz + (bx - ax) / L * lane;
  return q;
}
function outerGateWay(p, goal, q, lane) {
  // 堀の中の相手や陣形の端を、そのまま歩く目的地にしない。
  // 同じ岸では岸沿いに寄る。対岸へ渡る時は下の土橋の案内を使う。
  const moatX = GATE.x - 5;
  if (Math.abs(goal.z - GATE.z) > 2.5 && Math.abs(goal.x - moatX) < 6.5
    && (p.x - moatX) * (goal.x - moatX) >= 0) {
    q.x = p.x < moatX ? GATE.x - 12 : GATE.x + 2.2;
    q.z = goal.z;
    return q;
  }
  // 曲がり角の目標を現在地に戻さない。中心を越えても出口まで同じ向きへ進む。
  for (let i = 0; i < 2; i++) {
    const moat = goal.x < p.x ? i === 1 : i === 0, x = GATE.x - (moat ? 5 : 0);
    const clearance = moat ? 6.5 : 1.5;
    const crossing = (p.x - x) * (goal.x - x) < 0;
    const leaving = Math.abs(p.x - x) < clearance && Math.abs(goal.x - x) >= clearance;
    if (!crossing && !leaving) continue;
    if (Math.abs(p.z - GATE.z) <= 2.5 && Math.abs(goal.z - GATE.z) <= 2.5) continue;
    const side = p.x < x ? -1 : 1, exit = goal.x < x ? -1 : 1;
    // 木戸と砦の西柵の間は三メートル。東へ五メートル寄せると、閉じた砦の柵へ戻ってしまう。
    // 手前四十センチで止まっても東岸の判定を越え、砦の西柵（三メートル先）には届かない。
    // 間の道で南北をそろえてから、木戸の開いた口を渡る。
    q.x = Math.abs(p.z - GATE.z) > 2.5
      ? (side < 0 ? GATE.x - 12 : GATE.x + 2.2)
      : (exit < 0 ? GATE.x - 12 : GATE.x + 2.2);
    q.z = GATE.z + lane;
    return q;
  }
  return goal;
}
// 敗走も道路と土橋を歩く。敵は主郭南の口、味方と町の者は西の木戸へ退く。
// 遠い兵の簡略移動にも同じ道を渡し、塀の向こうへ飛ばさない。
function fleeWay(army, u, goal) {
  if (u.team === 0 || u.group.civ) {
    const q = u._ariRetreat || (u._ariRetreat = { x: CAMP.x - 20, z: GATE.z });
    return gateWay(army, u, q);
  }
  const p = u.pos, fort = TORIDE_WORKS[1];
  const q = u._ariRetreat || (u._ariRetreat = { x: 0, z: 0, stage: p.x < TOWN_X - 20 ? 0 : 1 });
  if (p.x > HON_W && p.x < HON_E && p.z < HON_Z) q.stage = 4;
  if (q.stage === 0) {
    q.x = TOWN_X - 24; q.z = GATE.z;
    if (p.x < fort.x1 + 3) return gateWay(army, u, q);
    if (Math.hypot(p.x - q.x, p.z - q.z) < 3) q.stage = 1;
  }
  if (q.stage === 1) {
    q.x = TOWN_X - 12; q.z = -70;
    if (Math.hypot(p.x - q.x, p.z - q.z) < 3) q.stage = 2;
  }
  if (q.stage === 2) {
    q.x = HON_ENTRY_X; q.z = HON_APPROACH_Z;
    if (Math.hypot(p.x - q.x, p.z - q.z) < 3) q.stage = 3;
  }
  if (q.stage === 3) {
    q.x = HON_ENTRY_X; q.z = HON_Z - 8;
    if (p.z < HON_Z - 4) q.stage = 4;
  }
  if (q.stage === 4) { q.x = HON_ENTRY_X + 12; q.z = HON_Z - 16; }
  return q;
}

// 城兵が口へ戻り、追手が離れている間だけ門番が開ける。大将の陣は動かさない。
function retreatGateTick(rt) {
  const F = rt.flags, gate = F.hongate;
  if (!gate || F.honGateCheckAt > rt.t) return;
  F.honGateCheckAt = rt.t + 0.5;
  let returning = false, crossing = false, threat = false;
  for (const u of rt.army.units) {
    if (!u.alive || u.isStruct || u.group?.civ || u.noTarget) continue;
    const dx = Math.abs(u.pos.x - HON_ENTRY_X), dz = Math.abs(u.pos.z - HON_Z);
    if (u.team === 0 && dx < 25 && dz < 25) threat = true;
    if (u.team === 1 && u.fleeing && dx < 5) {
      if (u.pos.z >= HON_Z - 4 && u.pos.z < HON_Z + 16) returning = true;
      if (dz < 2) crossing = true;
    }
  }
  const opened = crossing || returning && !threat;
  if (opened === !!gate.opened) return;
  gate.opened = opened;
  if (opened) F.honDoor.userData.open();
  else {
    for (const leaf of F.honDoor.userData.leaves) leaf.rotation.y = 0;
    F.honDoor.children[2].visible = true;
  }
}

function height(x, z) {
  let h = 0.3 * Math.sin(x * 0.04 + 0.2) * Math.cos(z * 0.03) + 0.2 * Math.sin(z * 0.07 + x * 0.02);
  if (ariDem) { ARI_DEM_OPT.floor = h - 1.2; h = demBlend(ariDem, x, z, h, ARI_DEM_OPT); }
  // 小さな土の起伏と収穫後の畦。通りの高さを大きく変えない。
  h += .045 * Math.sin(x * 1.3 + z * .7) * Math.sin(z * 1.1 - x * .4);
  // K564：畦の田の外（掛ける値が0）は sin・exp を数えない（同じ高さ）。
  if (x > SOKAKU_X + 24 && x < SOKAKU_X + 66 && z > -190 && z < -25) {
    const field = clamp((x - SOKAKU_X - 24) / 3) * clamp((SOKAKU_X + 66 - x) / 3)
      * clamp((z + 190) / 3) * clamp((-25 - z) / 3);
    h += field * .12 * Math.exp(-Math.pow(Math.sin(x * Math.PI / 9) * 7, 2));
  }
  // 惣構えの土塁（木戸の下）
  // K564：二十五m 先では exp が 1e-27 未満で高さの桁に残らない（同じ答え）
  if (Math.abs(z - WALL_Z) < 25) h += 0.9 * Math.exp(-((z - WALL_Z) ** 2) / 10);
  // 東の段丘の縁。その外は猪名川の低地。
  h -= 4 / (1 + Math.exp(-(x - SOKAKU_X - 3) / 2));
  // 主郭だけを盛る。南面の道の口は堀の外からの緩い坂で、堀と石垣を避けて牢へ登れる。
  const eastWest = clamp((x - HON_W + 3) / 3) * clamp((HON_E + 3 - x) / 3);
  const north = clamp((z - HON_N + 3) / 3);
  const mouth = clamp(Math.min(x - HON_GAP[0], HON_GAP[1] - x) / 2);
  const south = clamp((HON_Z + 3 - z) / 3);
  const ramp = clamp((HON_APPROACH_Z - z) / (HON_APPROACH_Z - HON_Z + 6));
  // 台地そのものの段差とは分け、主郭の盛土は低い石垣に収める。
  h += 1.8 * eastWest * north * (south * (1 - mouth) + ramp * mouth);
  // 六甲の山並み（遠く）
  // 六甲の山は城下に盛らない。伊丹段丘の平地を保つ。
  // 水堀の曲がり角は深い方を採り、重ねて二倍の深さにしない。
  let dip = 0;
  for (const f of MOAT_FNS) dip = Math.min(dip, f(x, z));
  h += dip;
  return h;
}

// 土橋の芯と法面は土の塊。床の端を外れた兵も、見えている土の上に立つ。
// 元の堀底を読む関数を残し、水面・土橋の形を作り終えてから歩く高さへ重ねる。
function ariBridgeHeight(ground, x, z, bridgeY) {
  const base = ground(x, z);
  if (x < SOTO_BRIDGE.a[0] || x > SOTO_BRIDGE.b[0]) return base;
  const across = Math.abs(z - GATE.z) - SOTO_BRIDGE.w / 2;
  if (across <= 0) return Math.max(base, bridgeY);
  const width = 2.2 + .12 * Math.sin(x * 2);
  if (across >= width) return base;
  const side = z < GATE.z ? -1 : 1;
  const bank = Math.min(bridgeY - .12, ground(x, GATE.z + side * (SOTO_BRIDGE.w / 2 + width)) + .01);
  return Math.max(base, bridgeY + (bank - bridgeY) * across / width);
}

// 大きな地面の格子は増やさず、堀・主郭・内応口のある升だけを準備時に細かくする。
// 元の升を外して差し替えるため、粗い地面で堀が埋まらない。歩く高さも同じ式へ結ぶ。
function refineAriTerrain(rt) {
  const W = rt.world, terrain = W.terrain;
  if (!terrain) return;
  // 描く格子は携帯で九十六分割、歩く格子は百四十四分割。頂点と色は描く方で読む。
  const old = terrain.geometry, half = W.half, n = old.parameters.widthSegments, step = half * 2 / n;
  const cells = new Uint8Array(n * n), bounds = [];
  for (const [segs, moat] of [[SOTO_MOAT_SEGS, SOTO_MOAT], [HON_MOAT_SEGS, HON_MOAT], [HON_W_MOAT_SEGS, HON_W_MOAT]]) {
    for (const pts of segs) for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], m = moat.width / 2 + step;
      bounds.push([Math.min(a[0], b[0]) - m, Math.max(a[0], b[0]) + m, Math.min(a[1], b[1]) - m, Math.max(a[1], b[1]) + m]);
    }
  }
  bounds.push([HON_W - step, HON_E + step, HON_N - step, HON_APPROACH_Z + step],
    [GATE.x - 50, TOWN_X + 65, GATE.z - 65, TOWN_SOUTH_Z + 35]);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + i * step, z = -half + j * step;
    if (bounds.some((b) => x + step >= b[0] && x <= b[1] && z + step >= b[2] && z <= b[3])) cells[j * n + i] = 1;
  }
  const originalHeight = W.heightAt.bind(W), oldPos = old.attributes.position;
  // 外縁は歩く百四十四分割の補間ではなく、残す描画面そのものへつなぐ。
  // 携帯の九十六分割と高さが違うと、細かな堀岸との間に裂け目ができる。
  const coarse = (x, z) => {
    const fx = (x + half) / step, fz = (z + half) / step;
    if (fx < 0 || fz < 0 || fx >= n || fz >= n) return originalHeight(x, z);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * (n + 1) + i;
    const a = oldPos.getY(k), b = oldPos.getY(k + 1), c = oldPos.getY(k + n + 1), d = oldPos.getY(k + n + 2);
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  };
  const refined = (x, z) => {
    const i = Math.floor((x + half) / step), j = Math.floor((z + half) / step);
    if (i < 0 || j < 0 || i >= n || j >= n || !cells[j * n + i]) return coarse(x, z);
    const dx = x + half - i * step, dz = z + half - j * step;
    let fade = 1;
    // 差し替えた面の外縁だけ元の格子へつなぎ、隣の面との裂け目を防ぐ。
    if (!i || !cells[j * n + i - 1]) fade = Math.min(fade, dx / 3);
    if (i === n - 1 || !cells[j * n + i + 1]) fade = Math.min(fade, (step - dx) / 3);
    if (!j || !cells[(j - 1) * n + i]) fade = Math.min(fade, dz / 3);
    if (j === n - 1 || !cells[(j + 1) * n + i]) fade = Math.min(fade, (step - dz) / 3);
    const h = coarse(x, z); return h + (height(x, z) - h) * clamp(fade);
  };
  const pos = [], splat = [], water = [], cover = [], keep = [], tri = [], idx = old.index.array;
  let nv = 0;
  const emit = (i, j, u, v) => {
    nv++;
    // 頂点に保存する精度で高さも読む。格子の境目で別の升へ丸められるずれを防ぐ。
    const x = Math.fround(-half + (i + u) * step), z = Math.fround(-half + (j + v) * step);
    pos.push(x, refined(x, z), z);
    const ids = [j * (n + 1) + i, j * (n + 1) + i + 1, (j + 1) * (n + 1) + i, (j + 1) * (n + 1) + i + 1];
    const weights = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
    for (let k = 0; k < 3; k++) {
      let c = 0; for (let q = 0; q < 4; q++) c += old.attributes.splat.array[ids[q] * 3 + k] * weights[q]; splat.push(c);
    }
    let w = 0; for (let q = 0; q < 4; q++) w += old.attributes.water.array[ids[q]] * weights[q]; water.push(w);
    for (let k = 0; k < 2; k++) {
      let c = 0; for (let q = 0; q < 4; q++) c += old.attributes.groundCover.array[ids[q] * 2 + k] * weights[q]; cover.push(c);
    }
  };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const offset = (j * n + i) * 6;
    if (!cells[j * n + i]) { for (let k = 0; k < 6; k++) keep.push(idx[offset + k]); continue; }
    const x = -half + (i + .5) * step, z = -half + (j + .5) * step;
    // 木戸から見渡す西堀の岸も細かくする。遠い惣構えの格子は増やさない。
    const gateBank = Math.abs(x - GATE.x) < 12 && Math.abs(z - GATE.z) < 90;
    const div = Math.ceil(step / (gateBank ? .75 : Math.abs(x - GATE.x) < 25 && Math.abs(z - GATE.z) < 120 ? 1.5 : 4));
    // 升の中の頂点は一度だけ読む（同じ点を六度ずつ測らない。三角と高さは前と同じ）。
    const base = nv, row = div + 1;
    for (let b = 0; b <= div; b++) for (let a = 0; a <= div; a++) emit(i, j, a / div, b / div);
    for (let b = 0; b < div; b++) for (let a = 0; a < div; a++) {
      const p = base + b * row + a;
      tri.push(p, p + row, p + 1, p + row, p + row + 1, p + 1);
    }
  }
  old.setIndex(keep);
  const g = new THREE.BufferGeometry();
  g.setIndex(tri);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('splat', new THREE.Float32BufferAttribute(splat, 3));
  g.setAttribute('water', new THREE.Float32BufferAttribute(water, 1)); g.computeVertexNormals();
  g.setAttribute('groundCover', new THREE.Float32BufferAttribute(cover, 2));
  // 同じ頂点をつなぎ、堀岸を三角ごとの黒い面にしない。準備時だけ法面の法線をならす。
  g.deleteAttribute('normal');
  const joined = mergeVertices(g); joined.computeVertexNormals(); g.dispose();
  const mesh = new THREE.Mesh(joined, terrain.material); mesh.receiveShadow = true; rt.scene.add(mesh);
  W.heightAt = refined;
}

// 火は町屋から隣の町屋・侍屋敷へ燃え移る（近い家ほど早い。風に乗って広がる）。焼け出された町の者は逃げ惑う
function burnSpread(rt, h) {
  if (h.burnt) return;
  burnHouse(rt, h);
  const F = rt.flags;
  for (const o of F.houses || []) {
    if (o.burnt || o.fireScheduled || o === h) continue;
    const d = Math.hypot(o.x - h.x, o.z - h.z);
    const wind = rt.world.def.wind, wx = wind?.[0] || 0, wz = wind?.[1] || 0;
    const down = d > 0 ? ((o.x - h.x) * wx + (o.z - h.z) * wz) / (d * (Math.hypot(wx, wz) || 1)) : 0;
    if (d < 14 + Math.max(0, down) * 8) {
      o.fireScheduled = true;
      rt.after(Math.max(4, 6 + d * (0.8 - down * 0.3)), () => { if (!F.ending && !rt.over) burnSpread(rt, o); });
    }
  }
  // 住民は準備時に置いた組が徒歩で退く。その場に新しく出さない。
  // 目標の並びに無い脇の任務は足さない（十1）。逃げる町の者は準備時に置いた組が歩いて退く。
  if (!F.fireGuide) { F.fireGuide = true; rt.bark('侍町に火が回った。町の者は本丸へ逃げる'); }
}

// この戦の行き先は一つ。仲間・敵・曲がり角の別々の印を重ねない。
function ariMark(rt, id, at, label) {
  for (const old of ['taki', 'turn', 'g1', 'aid', 'dp']) rt.unmark(old);
  rt.marker(id, at, label, { guideAlways: true, hideNear: 3, hideOnArrival: true });
}

// 有岡の町だけ夜の青みと一面の艶を抑える。堀・田・川の材質は替えない。
// 木戸脇の野面積みの目地：石の芯のすぐ前に黒い帯を張り、石と石の隙間だけが深い影に見えるようにする。
// 共通の裏込めは灰で目地が浅く、石積みが一枚の灰の壁に見えた（10/30 採点）。石垣と同じ反りと高さの式を追う。
// 11/18 クラウド35（K365）：真っ黒の目地は石と石の間が抜けた穴に見え、石が浮いた板の並びになった。野面積みの隙間は間詰め石で詰まるので、影の中の石の暗い灰茶に
const ARI_JOINT_MAT = new THREE.MeshLambertMaterial({ color: 0x4a4339, side: THREE.DoubleSide });
function ariStoneJoints(rt, x, z0, z1) {
  const W = rt.world, lean = .34, NS = Math.ceil((z1 - z0) / 1.5), NV = 5, pos = [];
  const at = (t, v) => {
    const z = z0 + (z1 - z0) * t, top = W.heightAt(x, z) + 1.7;
    const bot = Math.max(Math.min(W.heightAt(x - 2.5, z), W.heightAt(x - 5, z), top - 2.6) - .4, top - 4.2) - .15;
    const q = 1 - v / NV, y = bot + (top - .12 - bot) * (1 - q);
    return [x - ((top - bot) * lean * Math.pow(q, 1.5) + .135), y, z];
  };
  for (let k = 0; k < NS; k++) for (let v = 0; v < NV; v++) {
    const a0 = at(k / NS, v), a1 = at((k + 1) / NS, v), b0 = at(k / NS, v + 1), b1 = at((k + 1) / NS, v + 1);
    pos.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, ARI_JOINT_MAT); m.receiveShadow = true; m.name = '石垣の目地'; rt.scene.add(m);
}

function ariTownSoil(W) {
  const mat = W.terrain.material, compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => key + '|arioka-soil';
  mat.onBeforeCompile = (sh, renderer) => {
    compile.call(mat, sh, renderer);
    sh.fragmentShader = sh.fragmentShader.replace('float wat = smoothstep(0.3, 0.8, surfaceWater);', `
      float ariTown = smoothstep(${(GATE.x - 4).toFixed(1)}, ${(GATE.x + 4).toFixed(1)}, vWP.x)
        * (1.0 - smoothstep(${(SOKAKU_X - 4).toFixed(1)}, ${(SOKAKU_X + 4).toFixed(1)}, vWP.x))
        * smoothstep(${(SOKAKU_N - 4).toFixed(1)}, ${(SOKAKU_N + 4).toFixed(1)}, vWP.z)
        * (1.0 - smoothstep(${(WALL_Z - 4).toFixed(1)}, ${(WALL_Z + 4).toFixed(1)}, vWP.z));
      col = mix(col, (dirt * vec3(0.68, 0.56, 0.43) * (0.85 + macro2 * 0.25)
        + grass * smoothstep(0.42, 0.68, macro2) * 0.25) * (1.0 - w.z * 0.18), ariTown);
      // 土塊の陰と低い筋を色でも残す。新しい絵や面は増やさない。
      float ariClod = (edge - 0.5) * 0.8 + (macro2 - 0.5) * 0.35;
      col *= 1.0 + ariClod * 0.07;
      // 通りの土が暗い一枚に見えた（10/29 15:10 採点）。冬枯れの草の斑・踏まれて黒い所・霜の粒を、十 m と一 m の二つの細かさで混ぜる。
      float ariPatch = texture2D(tMacro, vWP.xz * 0.11 + 0.21).r, ariGrain = texture2D(tMacro, vWP.xz * 0.9 + 0.63).r;
      // 木戸の手前の寄せ手の野（持ち場の足もと）にも同じ斑を。水の上は除く。
      float ariMix = max(ariTown, (1.0 - smoothstep(90.0, 150.0, length(vWP.xz - vec2(${GATE.x.toFixed(1)}, ${GATE.z.toFixed(1)})))) * (1.0 - smoothstep(0.2, 0.6, surfaceWater)));
      col = mix(col, grass * vec3(0.95, 0.85, 0.55) * 1.25, ariMix * smoothstep(0.55, 0.78, ariPatch) * 0.65);
      col *= mix(1.0, mix(0.7, 1.22, ariGrain), ariMix * 0.85);
      col = mix(col, vec3(0.5, 0.51, 0.53) * (0.8 + ariGrain * 0.3), ariMix * smoothstep(0.72, 0.86, ariGrain) * 0.22);
      // 月明かりの青緑を抜き、冬の土の茶へ寄せる（暗い青緑の一枚に見えた。10/30）。
      float ariLum = dot(col, vec3(0.3, 0.55, 0.15));
      col = mix(col, ariLum * vec3(1.18, 0.98, 0.76) * 1.12, ariMix * 0.7);
      // 木戸の両岸は粗い砂色を継がず、草・湿った土・小石の斑で水際につなぐ。
      float ariBank = (1.0 - smoothstep(7.0, 13.0, abs(vWP.x - ${(GATE.x - 5).toFixed(1)})))
        * (1.0 - smoothstep(18.0, 28.0, abs(vWP.z - ${GATE.z.toFixed(1)})))
        * smoothstep(3.5, 5.5, abs(vWP.z - ${GATE.z.toFixed(1)}));
      col = mix(col, mix(dirt * vec3(0.65, 0.57, 0.43), grass * vec3(0.65, 0.7, 0.5),
        smoothstep(0.35, 0.65, macro2)) + stone * smoothstep(0.68, 0.85, edge) * 0.12, ariBank);
      float wat = smoothstep(0.3, 0.8, surfaceWater);`);
    sh.fragmentShader = sh.fragmentShader.replace('col = mix(col, vec3(0.06, 0.065, 0.06) + mud * 0.18, pool * 0.85);', `
      pool *= mix(1.0, smoothstep(0.12, 0.4, w.z), ariTown);
      col = mix(col, vec3(0.06, 0.065, 0.06) + mud * 0.18, pool * 0.85);`);
    sh.fragmentShader = sh.fragmentShader.replace('roughnessFactor = mix(roughnessFactor, 0.26, pool);', `
      roughnessFactor = mix(roughnessFactor, 0.95, ariTown * (1.0 - max(wat, pool)));
      roughnessFactor = mix(roughnessFactor, 0.26, pool);`);
    sh.fragmentShader = sh.fragmentShader.replace('reflectedLight.indirectDiffuse += uSoilSky * sheen * reflectedCloud;',
      'reflectedLight.indirectDiffuse += uSoilSky * sheen * reflectedCloud * mix(1.0, max(wat, pool), ariTown);');
  };
  mat.needsUpdate = true;
}

// 通りの土・水たまり・軒の提灯は準備時に作り、材質ごとにまとめる。
// 灯りは提灯の光る材質で示し、道案内に見える地面の楕円は置かない。
function ariStreetDress(rt) {
  const W = rt.world, soil = [], wet = [], paper = [], wood = [], grass = [];
  ariTownSoil(W);
  // 岸と道端の枯れ草は細い葉を途中で曲げる。幅広の三角を刃のように立てない。
  // 準備時に同じ束へまとめるだけで、草ごとの物や毎コマの更新は増やさない。
  const leaf = (x, y, z, h, dx, dz) => {
    const w = .018, mx = x + dx * .3, mz = z + dz * .3, my = y + h * .65;
    grass.push(x - w, y - .025, z, x + w, y - .025, z, mx - w * .55, my, mz,
      x + w, y - .025, z, mx + w * .55, my, mz, mx - w * .55, my, mz,
      mx - w * .55, my, mz, mx + w * .55, my, mz, x + dx, y + h, z + dz);
  };
  const bridgeY = Math.max(W.heightAt(...SOTO_BRIDGE.a), W.heightAt(...SOTO_BRIDGE.b));
  const floor = (x, z) => x >= SOTO_BRIDGE.a[0] && x <= SOTO_BRIDGE.b[0] && Math.abs(z - GATE.z) <= SOTO_BRIDGE.w / 2
    ? bridgeY : W.heightAt(x, z);
  const disk = new THREE.CircleGeometry(1, 12); disk.rotateX(-Math.PI / 2);
  const body = new THREE.CylinderGeometry(.16, .16, .4, 12).toNonIndexed();
  const ring = new THREE.CylinderGeometry(.165, .165, .018, 12).toNonIndexed();
  const strap = ARI_BOX.toNonIndexed();
  const place = (list, shape, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const g = shape.clone(); g.scale(sx, sy, sz); g.translate(x, y, z); list.push(g);
  };
  // 木戸から辻への通りと南北の町筋。三メートルごとに地形へ沿わせる。
  for (const road of [ARIOKA_ROADS[0], ARIOKA_ROADS[4]]) {
    const pos = [], uv = [], street = [];
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1], b = road[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz), n = Math.ceil(len / 3), nx = -dz / len, nz = dx / len;
      for (let j = 0; j < n; j++) {
        const points = [], marks = [];
        for (const [t, side] of [[j / n, -1], [j / n, 1], [(j + 1) / n, -1], [(j + 1) / n, 1]]) {
          const cx = a[0] + dx * t, cz = a[1] + dz * t;
          const edge = 2.1 + Math.sin(cx * .7 + cz * .43 + side) * .23 + Math.sin(cz * 1.3 - cx * .6) * .12;
          const x = cx + nx * side * edge, z = cz + nz * side * edge;
          points.push([x, floor(x, z) + .025, z]); marks.push([side, len * t]);
        }
        for (const k of [0, 1, 2, 1, 3, 2]) {
          pos.push(...points[k]); uv.push(points[k][0] * .4, points[k][2] * .4); street.push(...marks[k]);
        }
        // 縁の低い草は小さな三角にまとめる。土橋と木戸の踏み口には生やさない。
        if (j % 2 === 0) for (const side of [-1, 1]) {
          const t = (j + .4) / n, cx = a[0] + dx * t, cz = a[1] + dz * t;
          if (cx < GATE.x + 24) continue;
          const x = cx + nx * side * (2 + .25 * Math.sin(j)), z = cz + nz * side * (2 + .25 * Math.sin(j));
          const y = floor(x, z);
          for (let blade = 0; blade < 3; blade++) {
            const bx = x + blade * .12, bz = z + Math.sin(blade + j) * .15;
            leaf(bx, y, bz, .18 + blade * .045, side * .12, .08);
          }
        }
        // 不規則な小さな水たまり。土橋には置かない。
        if (j % 7 === 3) {
          const t = (j + .5) / n, x = a[0] + dx * t + nx * .8, z = a[1] + dz * t + nz * .8;
          if (x > GATE.x + 24) place(wet, disk, x, floor(x, z) + .065, z, .7 + (j % 3) * .2, 1, .45);
        }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('ariStreet', new THREE.Float32BufferAttribute(street, 2)); g.computeVertexNormals(); soil.push(g);
  }
  // 丸杭の根元は草で土につなぐ。橋の歩く幅は空ける。
  for (const side of [-1, 1]) for (let x = SOTO_BRIDGE.a[0] + .6; x < SOTO_BRIDGE.b[0]; x += 2.5) {
    const z = GATE.z + side * (SOTO_BRIDGE.w / 2 + .25);
    const y = Math.max(bridgeY - .65, W.heightAt(x, z) - .12);
    for (let blade = 0; blade < 3; blade++) {
      const bx = x + (blade - 1) * .1;
      leaf(bx, y, z, .16 + blade * .025, .05, side * .09);
    }
  }
  // 両岸の低い草。歩く橋の上と水面には置かず、地形の高さへ根を埋める。
  for (const side of [-1, 1]) for (let i = 0; i < 18; i++) {
    const x = GATE.x - 11 + (i % 6) * 2.2, z = GATE.z + side * (5.2 + Math.floor(i / 6) * 2.7);
    if (Math.abs(x - (GATE.x - 5)) < 3.4) continue;
    const y = W.heightAt(x, z);
    for (let blade = 0; blade < 3; blade++) {
      const bx = x + blade * .13, bz = z + .12 * Math.sin(i + blade);
      leaf(bx, y, bz, .18 + blade * .045, .1, .08);
    }
  }
  for (const h of rt.flags.houses) {
    const paperStart = paper.reduce((n, g) => n + g.attributes.position.count, 0);
    const woodStart = wood.reduce((n, g) => n + g.attributes.position.count, 0);
    // 家の南側の軒に下げ、家と一緒に傾いた向きへそろえる。
    const x = h.x + Math.sin(h.m.rotation.y) * 2.8, z = h.z + Math.cos(h.m.rotation.y) * 2.8;
    const y = W.heightAt(h.x, h.z) + 2.65;
    place(paper, body, x, y, z);
    for (const dy of [-.2, -.13, -.065, 0, .065, .13, .2]) place(wood, ring, x, y + dy, z);
    place(wood, strap, x, y + .35, z, .025, .3, .025);
    h.lanternParts = [
      { batch: 2, start: paperStart, end: paperStart + body.attributes.position.count },
      { batch: 3, start: woodStart, end: woodStart + ring.attributes.position.count * 7 + strap.attributes.position.count },
    ];
  }
  // 外縁を土へ溶かし、二本の轍を色の凹みで示す。面や毎コマの処理は増やさない。
  // 土の絵と暗い塗り色を掛けた不透明な帯をやめ、下の地面の色を残す。
  const roadMat = new THREE.MeshLambertMaterial({ color: 0xb7afa0, map: dirtTex(), side: THREE.DoubleSide,
    transparent: true, opacity: .22, depthWrite: false, polygonOffset: true,
    polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  roadMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute vec2 ariStreet; varying vec2 vAriStreet;\n' + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAriStreet = ariStreet;');
    sh.fragmentShader = 'varying vec2 vAriStreet;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float ariEdge = abs(vAriStreet.x) + sin(vAriStreet.y * 3.1) * 0.045;
      diffuseColor.a *= 1.0 - smoothstep(0.72, 1.0, ariEdge);
      float rut = 1.0 - smoothstep(0.035, 0.09, abs(abs(vAriStreet.x + sin(vAriStreet.y * 0.6) * 0.025) - 0.42));
      diffuseColor.rgb *= 1.0 - rut * (0.1 + 0.04 * sin(vAriStreet.y * 1.7));`);
  };
  roadMat.customProgramCacheKey = () => 'arioka-street';
  const mats = [
    roadMat,
    // 11/6 描いて遊ぶ：水たまりが光を受けない明るい灰の斑で、夜の辻に薄茶の透けた板のように浮いた。光を受ける暗い泥水にする。
    new THREE.MeshLambertMaterial({ color: 0x3a3830, transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide }),
    new THREE.MeshLambertMaterial({ color: 0xc0a376, emissive: 0x61431d, emissiveIntensity: .45 }), ARI_WOOD,
  ];
  [soil, wet, paper, wood].forEach((parts, i) => {
    if (!parts.length) return;
    // 平面の頂点番号を外し、他の形と同じ形式でまとめる。
    const flat = parts.map((g) => g.index ? g.toNonIndexed() : g);
    const mesh = new THREE.Mesh(mergeGeometries(flat), mats[i]);
    if (i === 2 || i === 3) for (const h of rt.flags.houses) for (const part of h.lanternParts)
      if (part.batch === i) part.position = mesh.geometry.attributes.position;
    // 影は下の地面で受ける。土の重ね面でも受けると影が二重に濃くなる。
    mesh.receiveShadow = false;
    mesh.renderOrder = i === 0 ? 1 : i === 1 ? 2 : 0;
    rt.scene.add(mesh);
    for (const g of flat) g.dispose();
    for (const g of parts) if (!flat.includes(g)) g.dispose();
  });
  if (grass.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(grass, 3)); g.computeVertexNormals();
    rt.scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x83775a, side: THREE.DoubleSide })));
  }
  disk.dispose(); body.dispose(); ring.dispose(); strap.dispose();
}

// 伊丹市「有岡城跡」の惣構・荒村寺跡と、既存の堂・町屋・低地の村に合わせる。
// https://www.city.itami.lg.jp/SOSIKI/TOSHIKATSURYOKU/BUNKA/bunnkazai/SINAI_BUNKAZAI/KUNI_SITEI/1386843388423.html
// 民の在所・人数・避難路は推定。包囲の外へ抜けたことにはせず、内側の空地で待つ。
// 西の内応口へ戻る道や主郭の堀、東の崖・猪名川を避ける。兵の組は作らない。
const PEOPLE_BANDS = [
  { x: TOWN_X, z: -140, kinds: ['townsman', 'merchant', 'woman', 'child', 'elder'], routeEnd: 'wait',
    route: [{ x: TOWN_X, z: -155 }, { x: TOWN_X, z: -214 }, { x: TOWN_X + 20, z: -240 }] },
  { x: TOWN_X - 22, z: -44, mode: 'inside', kinds: ['townsman', 'woman', 'child'], routeEnd: 'wait',
    route: [{ x: TOWN_X - 26, z: -82 }, { x: TOWN_X - 26, z: -144 }, { x: TOWN_X - 26, z: -230 }] },
  { x: 8, z: HON_N - 6, kinds: ['monk', 'monk', 'woman', 'child'], routeEnd: 'wait',
    route: [{ x: -4, z: HON_N - 6 }, { x: -4, z: HON_N - 40 }, { x: -4, z: HON_N - 80 }] },
  { x: SOKAKU_X + 40, z: -204, kinds: ['farmer', 'farmer', 'woman', 'child'], routeEnd: 'wait',
    route: [{ x: SOKAKU_X + 60, z: -200 }, { x: SOKAKU_X + 60, z: -260 }] },
  { x: SOKAKU_X + 50, z: 10, kinds: ['farmer', 'merchant', 'woman', 'child'], routeEnd: 'wait',
    route: [{ x: SOKAKU_X + 65, z: 20 }, { x: SOKAKU_X + 65, z: 80 }] },
];

// 11/6 描いて遊ぶ：辻へ攻め上っても町の者が一人も見えず、人の住む町の夜討ちに見えなかった（critic60 の△）。
//   共通の民の組は戦の初めに火と兵を避けて先に逃げ切り、遊び手が来る時には六十メートル先にいた。
//   遊び手が辻の四十六メートル手前まで来た時、辻の東の口の町屋から家の者が飛び出し、侍町の通りを本丸の方（東）へ走る
//   （battle_refs 5：町人は二の丸・本丸へ逃げた。「町の者は追うな」の下知どおり、敵も味方も狙わない）。人数・着物の色は推定。
const ARI_FOLK = [[0x4a4236, 0x2a231c, 'none'], [0x5c4a3a, 0x30251c, 'hachimaki'], [0x3a3a44, 0x24221f, 'none'], [0x6a5a44, 0x3a2e22, 'none'], [0x4e3a32, 0x2a231c, 'none'], [0x55503f, 0x30251c, 'hachimaki']];
function ariTownsfolk(rt) {
  const F = rt.flags;
  if (F.folk || (F.step || 0) < 1) return;
  // 東口の柵（町の中心から東へ八メートル）の内側に重ねず、逃げる側の通りへ出す。
  const p = rt.player.u.pos, from = { x: TOWN_X + 11, z: -18 };
  if (Math.hypot(p.x - from.x, p.z - from.z) > 46 || p.z < -70) return;
  // 刀根坂の人夫と同じく、戦わない足軽の体に小袖を着せて道筋（order: 'path'）を歩かせる（porter の型は自分の主へ寄って行った）。
  const g = allyGroup(rt, { fixed: true, fullStrength: true, name: '逃げる町の者', anchor: from, facing: Math.PI / 2, formation: 'column', colW: 2,
    speed: 1.4, aggro: 0, civ: true, noRout: true, arriveNoncombat: true },
    ARI_FOLK.map(([col, obi, hat]) => ({ type: 'ashigaru', n: 1, o: { flag: null, weapon: 'none', kosode: 1, kosodeCol: col, obi, cloth: col, hat, armor: 0x3a342a, invuln: true } })));
  g.units.forEach((u, i) => { u.noTarget = true; u.dmg = 0; u.civ = true; u.pos.x = from.x + (i / 2 | 0) * 1.2; u.pos.z = from.z + (i % 2) * 1.3; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); });
  // 辻の東の口から侍町の通りを東へ走り、本丸の方の通りの奥（霧の中）で止まる。
  g.noAI = true; g.order = 'path'; g.path = [[TOWN_X + 24, -15], [TOWN_X + 50, -14], [TOWN_X + 80, -14], [TOWN_X + 104, -14]]; g.pathIdx = 0;
  F.folk = g;
  rt.say('滝川の組頭', '町の者は追うな。辻を取れ', 3);
}

// 右上の目標（①〜⑤）。場所は地図で分かる名で言う（十1）。
// 11/21 クラウド kaito2（K582 中学生 bot：段2の木戸が番兵の退く四分で決まり261秒・戦が十分半＝目安の四〜七分を越えた。act は142秒）：
//   番兵の踏みとどまりを四分→三分に。番兵を討てば今までどおりすぐ進み、本人が木戸の内へ入るまで②を終えない決まりは保つ。
const ARI_GATE_HOLD = 180;
const ARI_GOALS = ['上臈塚の木戸へ寄れ', '木戸の内の番兵を押し出し、惣構えの通りを押さえよ', '侍町の辻を取れ', '辻で荒木勢を防ぎ、奥の木戸を押さえよ', '牢を出た官兵衛を迎えよ'];
const ARI_JUNCTION = { x: TOWN_X - 2, z: -14 };
const ariGoalText = (rt) => ARI_GOALS[arioka.missionOf(rt)];
// 11/18 K358（描かずの通し）：段の初めの立て直し（rest）が右上を五つの目標の文に戻し、八秒だけ「木戸の内の番兵を押し出し」「辻で荒木勢を防ぎ」へ戻ってちらついた。
//   惣構え・焼け跡・奥の木戸の段は、deep で出した段の文のまま保つ。
const ARI_STAGE_TEXT = { W: '惣構えの通りの角を押さえよ', D: '侍町の焼け跡を改めよ', U: '侍町の奥の木戸を押さえよ' };
const ariStageText = (rt) => ARI_STAGE_TEXT[['', 'W', 'A', 'C', 'D', 'U'][rt.flags.dpWhich || 0]] || ariGoalText(rt);
// 五つの目標は保ち、行き先の地名だけ今の段の持ち場に合わせる。
function ariPlaceName(rt, k = arioka.missionOf(rt)) {
  const F = rt.flags;
  if (k === 1) return F.dpW ? '惣構えの通り' : '木戸の内';
  if (k === 3) return F.dpU ? '侍町の奥の木戸' : F.dpD ? '侍町の焼け跡' : '侍町の辻';
  return k === 0 ? '上臈塚の木戸' : k === 4 ? '小寺官兵衛' : '侍町の辻';
}
// 11/5 kaito 九1・九3・十1：右上は①〜⑤を最初から全部並べ、済んだ物に印（hud_goals の札）。両軍の今の兵の数の棒も上に常に出す。
//   共通の任務札は一行だけなので、その後に目標の札を重ねて置き換える（森部と同じ作り）。時の字は出さない。
const ARI_BOARD_CSS = `
/* 首取りなどの作業札を守る釦から離す。左右を入れ替えた操作でも中央に保つ。 */
html.touch body #hud.arioka-goals #prompt.work-action:not([hidden]) {
 left:50% !important; right:auto !important; top:auto !important;
 bottom:calc(112px + env(safe-area-inset-bottom, 0px)) !important;
 transform:translateX(-50%) !important; width:60px !important;
}
html:root body #hud#hud#hud.arioka-goals #armybar:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; }
html:root body #hud#hud#hud.arioka-goals #armybar .clock { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.arioka-goals #armybar { visibility:hidden !important; }
html:root body #hud#hud#hud.arioka-goals #h-prog#h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud#hud.arioka-goals #h-prog#h-prog.goal-mode > .pg-goals { display:block !important; }
html:root body #hud#hud#hud.arioka-goals #h-prog#h-prog.goal-mode {
 left:auto !important; right:calc(12px + env(safe-area-inset-right, 0px)) !important; transform:none !important;
 width:auto !important; min-width:0 !important; max-width:min(390px, 44vw) !important; box-sizing:border-box;
 padding:8px 12px 9px 10px !important; background:rgba(14,12,10,.7) !important; border:none !important; border-radius:6px !important;
}
html:root body #hud#hud#hud.arioka-goals #h-prog#h-prog.goal-mode .pg-goals li { white-space:normal !important; align-items:flex-start; color:#e6dfd2 !important; }
html:root body #hud#hud#hud.arioka-goals #h-prog#h-prog.goal-mode .pg-goals li i { margin-top:3px; }
/* 携帯共通の一行省略より優先し、五目標の場所と行いを最後まで残す。 */
html:root body #hud#hud#hud#hud#hud.arioka-goals #h-prog#h-prog#h-prog.goal-mode .pg-goals li span {
 color:inherit !important; background:none !important; flex:1 1 0; min-width:0;
 white-space:normal !important; overflow:visible !important; text-overflow:clip !important;
 overflow-wrap:anywhere; word-break:normal; text-wrap:wrap;
}
/* 11/17 iMac の検品：今の任務が小さな赤い字で読みにくかった。白に近い字・十七画素で二行まで */
html:root body #hud#hud#hud.arioka-goals #h-prog#h-prog.goal-mode .pg-goals li.now { color:#f6efe0 !important; font-size:max(17px, calc(17px * var(--text-scale, 1))) !important; line-height:1.35 !important; }
html:root body #hud#hud#hud#hud#hud.arioka-goals #h-prog#h-prog#h-prog.goal-mode .pg-goals li.now span { font-size:inherit !important; }
html:root body #hud#hud#hud.arioka-goals #h-prog#h-prog.goal-mode .pg-goals li.done { color:#cfc9bc !important; }
html:root body #hud#hud#hud.arioka-goals #h-prog#h-prog.goal-mode .pg-goals :is(h3 b, li em) { display:none !important; }
/* 任務変更の大札は一覧と重複する。戦況の知らせだけを左上に一件残す。 */
html:root body #hud.arioka-goals #center-call {
 left:calc(12px + env(safe-area-inset-left, 0px)); right:auto; top:calc(60px + env(safe-area-inset-top, 0px));
 width:min(260px, 30vw); align-items:flex-start;
}
html:root body #hud.arioka-goals #center-call .cc {
 max-width:100%; box-sizing:border-box; padding:4px 6px; font-size:max(15px, calc(15px * var(--text-scale, 1)));
 line-height:1.3; letter-spacing:0; text-align:left;
}
html:root body #hud.arioka-goals #center-call .cc.blue,
html:root body #hud.arioka-goals #center-call .cc:has(~ .cc:not(.blue)) { display:none !important; }
@media (max-height:500px) {
 html:root body #hud#hud#hud.arioka-goals #h-prog#h-prog.goal-mode { padding:4px 8px !important; }
 html:root body #hud#hud#hud#hud#hud.arioka-goals #h-prog#h-prog#h-prog.goal-mode .pg-goals li {
  font-size:max(13px, calc(13px * var(--text-scale, 1))) !important; line-height:1.25 !important; gap:6px !important; padding:0 !important;
 }
 /* 11/19 クラウド kaito2（見た目の見回り 874×402）：上の十三画素が今の行（li.now の十七画素）まで上書きし、携帯の任務が小さかった。今の行は十七画素で二行まで */
 html:root body #hud#hud#hud#hud#hud.arioka-goals #h-prog#h-prog#h-prog.goal-mode .pg-goals li.now { font-size:max(17px, calc(17px * var(--text-scale, 1))) !important; line-height:1.3 !important; }
}
/* 官兵衛を迎える間も操作と任務は続く。共通の終幕用の非表示で五目標を消さない。 */
html:root body:not(:has(#pause:not([hidden]))) #hud#hud#hud.arioka-goals.arioka-kanbe.ending:not(.photo):not(:has(#bigmap:not([hidden]))) #h-prog#h-prog.goal-mode { visibility:visible !important; }
html:root body:not(:has(#pause:not([hidden]))) #hud#hud#hud.arioka-goals.arioka-kanbe.ending:not(.photo) #goal-sign:not([hidden]) { display:block !important; }
/* 11/19 クラウド kaito2（中学生 bot 440秒：官兵衛を迎える終幕で、行き先の札が上の両軍の人数の帯に重なって読めない）：勝負の付いた終幕では人数の帯を隠す */
html:root body #hud#hud#hud#hud.arioka-goals.arioka-kanbe.ending #armybar#armybar { display:none !important; }`;
function ariGoalBoard(rt) {
  const hud = rt.hud;
  if (!hud?.root || typeof document === 'undefined') return;
  hud.root.classList.add('arioka-goals');
  const style = document.createElement('style');
  style.textContent = ARI_BOARD_CSS;
  document.head.appendChild(style);
  const progress = hud.progress;
  hud.progress = function (battle) {
    const out = progress.call(this, battle);
    if (battle === rt && this.prog && !rt.over) {
      // 一行の任務札の作り（missionSingleLine）は残し、目標の札を描く時だけ外す
      const def = rt.def, one = def.missionSingleLine;
      def.missionSingleLine = false;
      try { goalsTick(this.prog, rt); } finally { def.missionSingleLine = one; }
    }
    return out;
  };
  const dispose = rt.dispose;
  rt.dispose = function () {
    hud.progress = progress;
    if (hud.prog) hud.prog.classList.remove('goal-mode');
    hud.root.classList.remove('arioka-goals', 'arioka-kanbe'); style.remove();
    return dispose.call(this);
  };
}
const arioka = {
  frontFillWhen: (rt) => !ariFoeFull(rt) && !rt.flags.ariHoldLate, // 11/18 クラウド：荒木の新手を重ね過ぎない（下の ariFoeRsv）
  reserveYield: (rt) => ariFoeFull(rt),
  reserveSize: 20, frontFillSize: 20,
  // 官兵衛を迎える段（⑤）では荒木の新手を逃げ散らせ、新しく立てない。act bot が辻の手前で新手と六百秒斬り合い続け、官兵衛へ寄れず刻限で負けた（11/18 クラウド・454秒から1080秒）
  reserveFold: (rt) => !!(rt.flags.kanbePending || rt.flags.kanbeMet || rt.flags.ariHoldLate),
  spearRingDepth: true, // 11/19 05:30 クラウド kaito2 ⑥（305秒・400秒の写真）：足元の輪を消した後も本人の腰に赤橙の輪＝槍の穂先の輪（spear_ring.js）が体を透けて見えた。根白坂と同じく体の後ろは隠す
  noEnemyFootRing: true, // 11/19 クラウド kaito2 ⑥写真305秒：後ろの敵の足元の太い輪が本人の腰に重なって橙の輪に見えた→敵は頭上の▼だけ（木津川口・道明寺と同じ）
  quietArmyCalls: true, // 11/18 K358（写真）：備ひとつの崩れで「味方が追撃に移った」「敵が総崩れ」を出さない（戦の途中の任務と食い違う）
  missionSingleLine: true,
  flankWaiters: true, // 11/18 K358：act bot が正面で構えて受け続け、七分で刃の傷0（簡単すぎる）。順を待つ荒木の兵の三人に一人が本人の脇へ回る（army_think.js）
  closeCombatAssist: true, // 11/18 K358：本人を狙う荒木の振りが本人の動きで外れ、七分で刃の傷0（act bot）。振りかぶりの間も本人へ向き直り、四歩以内で槍を当てる（稲生・森部と同じ）
  stackAllAttack: true, // 11/17 つ：act bot 76秒に滝川本陣6人が attack のまま重なった。狙い無しで重なれば渦に散らす
  // 11/15 クラウドさ（act bot 146秒）：前を埋める荒木の新手（11人）が木戸の外の織田の囲み (-409,-59) に置かれ、塀の外で一点に重なって止まった（★★）。
  //   荒木の新手は惣構えの内（木戸の線より東6m）だけに置く。敵の新手は frontFill の既定どおり「行き先の印より遠く」へは置かない
  reserveOk: (rt, p, foe) => {
    // 11/18 kaito2（act bot 301秒）：味方の新手11人が木戸の口の内 (-394,-99) に置かれ、塀と木戸の柱の角で一点に重なって止まった（★★）。木戸の口から14m 内には誰も置かない
    if (Math.hypot(p.x - GATE.x, p.z - GATE.z) < 14) return false;
    if (!foe) return true;
    if (p.x < GATE.x + 6) return false;
    const me = rt.player?.u?.pos; if (!me) return true;
    let bd = 1e9, q = null;
    for (const m of rt.markers || []) { const c = typeof m.pos === 'function' ? m.pos() : m.pos; if (!c || !Number.isFinite(c.x)) continue; const d = Math.hypot(c.x - me.x, c.z - me.z); if (d < bd) { bd = d; q = c; } }
    return !q || Math.hypot(p.x - q.x, p.z - q.z) <= Math.max(65, bd + 10);
  },
  goalsAllRows: true, // 九1・十1：最初から五件を並べ、済んだ目標と現在の目標を示す。
  hideMissionDots: true,
  keepBattleSigns: true, // 行き先の印を出す間も、名のある将の名札を残す。
  goalSignOnly: true, // 曲がり角・持ち場・官兵衛を、任務と同じ一点の印で案内する。
  goalSignTriangle: true, // 画面の外でも矢印に替えず、行き先の▼を保つ。
  goalSignDistanceAlways: true, // 九1：十メートル以内でも行き先の名と距離（m）を残す。
  // 通しの記録（gate4_1110）：敵の印が出ない。共通の赤い▼を使う。
  // field_signs はこの印が付いた兵を除くので、同じ頭上に二つ重ねない。
  enemyTriangleSigns: true,
  // 11/19 クラウド kaito2 ⑥（400秒 辻の写真 874×402：荒木勢の頭上に赤い▼が十一並び、兵と幟より印が目立った）：
  //   岩石城・根白坂と同じく、本人を狙う四十m 内の敵と、三十m 内の近い六人だけに▼。遠くの荒木勢は幟と姿で見せる。
  //   11/19 06:20 kaito2：同じ物の中に後ろの enemySignVisible（30m・見通し）があり、こちらが上書きされて効いていなかった→名を ariTriPick にし、後ろから呼ぶ。
  ariTriPick: (rt, u) => {
    const me = rt.player.u, p = me.pos;
    if (rt._ariTriT !== rt.t) {
      rt._ariTriT = rt.t; const near = rt._ariTriNear || (rt._ariTriNear = new Set()); near.clear();
      const c = rt._ariTriCand || (rt._ariTriCand = []); c.length = 0;
      for (const v of rt.army.units) { if (!v.alive || v.team === me.team || v.isStruct) continue; const d = (v.pos.x - p.x) ** 2 + (v.pos.z - p.z) ** 2; if (d < 900) c.push(d, v); }
      for (let k = 0; k < 6 && c.length; k++) { let bi = 0; for (let j = 2; j < c.length; j += 2) if (c[j] < c[bi]) bi = j; near.add(c[bi + 1]); c.splice(bi, 2); }
    }
    if (rt._ariTriNear.has(u)) return true;
    return (u.target === me || u.atk?.target === me) && (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2 < 1600;
  },
  // 通しの二周目：本人から通っても、視点からは屋根に隠れる敵へ▼が出ていた。
  // 見通しは視点から調べ、壁に加えて実物の軒と屋根の箱も使う。
  sightFromCamera: true,
  sightBlocked(rt, a, p, ay, by) {
    const F = rt.flags;
    const from = F.ariSightFrom || (F.ariSightFrom = { x: 0, y: 0, z: 0 });
    const to = F.ariSightTo || (F.ariSightTo = { x: 0, y: 0, z: 0 });
    from.x = a.x; from.y = ay; from.z = a.z;
    to.x = p.x; to.y = by; to.z = p.z;
    // 門の屋根・柱・開いた扉も、町屋と同じく敵の印を遮る。
    // 地上の通り口は既存の箱の隙間を保ち、屋根越しに▼だけを出さない。
    for (const box of F.ariCameraGates || []) {
      const hit = ariGateCameraHit(box, from, to, false);
      if (hit !== null && hit < .999) return true;
    }
    const HS = F.ariCameraHouses || [];
    // 11/22 クラウド 有岡の持ち主（K564 重さ）：視点の当たりと同じ升で、線の外接箱にかかる町屋だけを調べる（同じ答え）
    const CL = F.ariCamWalls ? ariCamCells(HS, F.ariCamWalls, from, to) : null;
    if (CL) {
      const q = ++ariCamQ;
      for (let k = 0; k < CL.length; k++) {
        const cell = CL[k];
        for (let i = 0; i < cell.length; i++) {
          const box = cell[i];
          if (!box.house || box._q === q) continue;
          box._q = q;
          if (box.house.room && box.bottom < 2.9) continue;
          const hit = ariGateCameraHit(box, from, to, false);
          if (hit !== null && hit < .999) return true;
        }
      }
      return false;
    }
    for (const box of HS) {
      // 入れる町屋の戸口と窓は共通の壁判定に任せ、屋根だけを補う。
      if (box.house.room && box.bottom < 2.9) continue;
      const hit = ariGateCameraHit(box, from, to, false);
      if (hit !== null && hit < .999) return true;
    }
    return false;
  },
  nearbyAllySignLimit: 0,
  hideNameTag: (u) => u.name === '滝川の組頭',   // 名の伝わらない役に名札を出さない（AY7。頭上に「滝川のかしら」と出ていた）
  // 11/6 描いて遊ぶ：命・小地図・目標の三枚で共通の「札は三つまで」が埋まり、名札が一度も出なかった（五2・九3）。
  //   画面に出すのは行き先の▼・名・両軍の数・目標・命（Simple）。小地図を外して名札の枠を空ける（稲生・桶狭間と同じ）。
  noMiniMap: true,
  nameRange: 60,   // 11/6 描いて遊ぶ：滝川の組頭・中西新八郎・栗山善助の名が十八メートルまで寄らないと出なかった（五2・九3）
  noDodgeCard: true,
  noSiegeCards: true,
  noPlayerFoot: true,
  quietMiss: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  bannerAllowed: (rt) => !!rt.over || !!rt.flags.ending,
  // 11/6 kaito 九1・十1：目標は史実の時の順の五つ。番号と一行は戦の間ずっと言い替えない（場の下知は台詞と印に任せる）。
  //   亥の刻に上臈塚の木戸が内から開き、滝川の手が惣構えの内へ入り、侍町を焼いた。本丸は持ちこたえ、翌十六日に官兵衛が牢から出た。
  lethal: { max: 2, firstAt: 200, gap: 120 },   // 命懸けの戦場（11/9 徳川A：弱めて入れる。突然の討死は二つまで・三分過ぎから）
  missions: ARI_GOALS,
  missionOf(rt) {
    const F = rt.flags;
    const k = F.ending ? (F.kanbePending || rt.tracker.main ? 4 : F.ariGoal || 0) : F.dpC ? 3 : F.dpA ? 2 : F.step >= 1 ? 1 : 0;
    F.ariGoal = Math.max(F.ariGoal || 0, k);
    return F.ariGoal;
  },
  // 戦の後の札の五つも右上と同じ（敵を何人討つ・自分で討つは置かない。久左衛門は本丸に残り討てない）。
  goals5(rt) {
    const won = () => rt.tracker?.main === true && !!rt.over, at = (k) => (q) => (arioka.missionOf(q) > k) || won();
    const place = [{ x: GATE.x - 30, z: GATE.z }, { x: GATE.x + 12, z: GATE.z }, ARI_JUNCTION, ARI_JUNCTION];
    // ②の通り、④の焼け跡・奥の木戸も、今の段の持ち場を指す。
    // 初めの木戸や辻を固定で返すと、追加された段で案内先が食い違う。
    const currentPlace = (k) => {
      const F = rt.flags;
      return arioka.missionOf(rt) === k && F.dpOn && F.dp?.cur?.at ? F.dp.cur.at : place[k];
    };
    // 11/9 iPhone 874×402：右上の札が「1　①上臈塚の…」と番号を二重に出した。番号は札（hud_goals）が付ける
    return ARI_GOALS.map((text, k) => ({ kind: 'stage', k, text, noun: ariPlaceName(rt, k), action: text,
      // 期限は各段で下知とともに扱う。長い④の途中や官兵衛を待つ間に、札だけを失敗にしない。
      place: k < 4 ? () => currentPlace(k) : () => rt.flags.kanbeAt || (rt.flags.kanbePending ? rt.flags.kanbeMeet : null) || null, check: k < 4 ? at(k) : () => won() || !!rt.flags.kanbeMet }));
  },
  missionHeading(rt) {
    if (rt.flags.ending && !rt.flags.kanbePending && !rt.tracker.main) return '退き太鼓。木戸の外へ退け';
    const k = this.missionOf(rt);
    return '①②③④⑤'[k] + this.missions[k];
  },
  // 久左衛門は主郭に残る城将。討取りの行き先と分け、既存の本人に印を付ける。
  commanderSignTarget(rt) {
    const u = rt.flags.ehon?.general;
    return !rt.flags.ending && !rt.over && u?.alive && !u.gone && !u.dying && !u.woundOut ? u : null;
  },
  namedGuideTarget(rt) { return this.commanderSignTarget(rt); },
  // 行き先の▼は目標の場所に一つだけ（①木戸の外の竹束 ②木戸の内 ③④辻 ⑤官兵衛）。一人の敵を行き先にしない（三1）。
  missionPin(rt) {
    const F = rt.flags, C = F.dpOn && F.dp?.cur;
    if (rt.over || !rt.player.u.alive || F.ending && !F.kanbePending && !F.kanbeMet) return null;
    const pin = F.ariMissionPin || (F.ariMissionPin = { x: 0, z: 0, r: 3, hide: 3, hideDistance: 0 });
    const stage = this.missionOf(rt);
    const post = F.ariMissionPost || (F.ariMissionPost = { x: 0, z: 0 });
    const at = stage === 4 ? F.kanbeAt || F.kanbeMeet || ARI_JUNCTION : stage === 0 ? AR_OPEN.pin(rt, ariOpenCtx()) || { x: GATE.x - 30, z: GATE.z } : stage === 1 ? C?.at || { x: GATE.x + 12, z: GATE.z } : C?.at || ARI_JUNCTION;
    post.x = at.x; post.z = at.z;
    let way = gateWay(rt.army, rt.player.u, post);
    // 11/18 描かずの通し：辻の西の町屋の裏（-355,-25）から▼が家越しに辻を指し、本人が壁際で十五秒止まった。家に遮られる時は、辻の口の空いた所を先に指す。
    if (way === post && stage >= 2) way = ariHouseDetour(rt, rt.player.u.pos, post) || post;
    pin.x = way.x; pin.z = way.z;
    // 共通の印へ現在の地名を渡す。長い任務文からの推測では、焼け跡や奥の木戸も「辻」になってしまう。
    pin.label = ariPlaceName(rt, stage);
    pin.route = way !== post; pin.unit = null; pin.enemy = false;
    pin.waiting = !pin.route && (stage === 0 || stage === 3);
    // 木戸前は九メートル、堀端の見届けは四メートルで到着する。
    // 三メートル固定では、開門を待てる位置でも印だけが前進を促してしまう。
    pin.r = pin.hide = pin.route ? .5 : stage === 0 ? (AR_OPEN.pin(rt, ariOpenCtx()) ? 4 : 9) : stage === 3 ? C?.botRadius || 16 : 3;
    // 任務と同じ高さ・遮りで到着を決める。屋根や壁の裏で待機の表示にしない。
    const p = rt.player.u.pos;
    const distance = Math.hypot(p.x - pin.x, p.z - pin.z);
    pin.arrived = pin.waiting && (stage === 0 ? distance < pin.r : distance <= pin.r);
    if (pin.arrived) {
      post.y = C?.post?.y ?? rt.world.heightAt(post.x, post.z);
      pin.arrived = Math.abs(p.y - post.y) <= 3 && !rt.army.wallBetween(p, -1, post);
    }
    return pin;
  },
  waitForIntro: true,
  compactIntro: true, introTaskFirst: true,
  introText: '亥の刻、上臈塚の木戸が内から開く。滝川の手と惣構えへ入り、侍町の辻を取れ。',
  introSides: { a: '織田勢　二万五千', b: '荒木勢　五千' }, // 五4：始まりの札に味方対敵の数（battle_learn：信忠が半ばを尼崎へ向けた後の囲み）
  introGoal: '侍町の辻を取り、寄せ返す荒木勢から守る',
  civilianCrowd: { bands: PEOPLE_BANDS },
  noUnitContrast: true, // 実際の姿からずれる白い人型を重ねず、足元の自分の印は残す。
  compactCombatGuides: true, compactGuardGuide: true,
  enemyCornerSign: true, // 乱戦の相手は四隅で示し、長い白枠で隣の具足や槍を隠さない。
  enemySignOnly: true, enemyFootRingRadius: .4, // 四隅と足元を残し、刀の印と大きな輪で胴を覆わない。
  // 町屋に隠れた兵の▼だけを屋根越しに並べない。体の高さで見通しを調べる。
  enemySignDepthTest: true,
  enemySignVisible(rt, u) {
    // 11/18 K358（写真 874×402）：侍町の辻で▼が二十あまり横一列に並び、通りと兵を塞いだ。▼は本人から 30m 内の相手だけ（遠くは旗と色で分かる）
    const me = rt.player.u.pos; if ((u.pos.x - me.x) ** 2 + (u.pos.z - me.z) ** 2 > 1600) return false;
    if (!arioka.ariTriPick(rt, u)) return false;   // 本人を狙う四十m 内と、三十m 内の近い六人だけ
    const eye = rt.camera.position;
    // 共通の見通しは短時間覚えるため、視点を動かした直後も実物の屋根で判定する。
    // 歩く壁だけでは、通りを空けた門の上や町屋の張り出す軒を拾えない。
    return !rt.def.sightBlocked(rt, eye, u.pos, eye.y, u.pos.y + 1.2)
      && !cameraWallBlocked(rt, eye, u.pos, eye.y, u.pos.y + 1.2);
  },
  enemyFrameAtPosition: true, compactApproachGuide: true, // 現在の相手を示し、接近の大旗を重ねない。
  compactPlayerSign: true, // 足元と向きは残し、白い輪で土橋や兵の足を隠さない。
  keepPlayerFeet: true, footFrameMinDistance: 1.6, // 携帯横でも本人の足を画面内へ収め、輪だけを残さない。壁際の寄った視点は保つ。
  openingFootSignOnly: true, // 開門待ちでも本人を白い全身枠で覆わず、足元で示す。
  // 11/5 kaito 九3・十二1：両軍の今の兵の数の棒を上に常に出す。数は史実の規模（信忠が半ばを尼崎へ向けた後の囲み 二万五千 対 城兵 五千）。
  //   この夜に荒木勢は上臈塚と侍町で崩れ、多くが討たれて本丸へ逃げた（battle_learn）。段と討った数で減らす。
  force(rt) {
    const F = rt.flags, k = [0, .04, .12, .2, .3][arioka.missionOf(rt)] || 0;
    return { a: Math.max(0, 25000 - (F.ak || 0) * 20), a0: 25000, b: Math.max(1500, Math.round(5000 * (1 - k)) - (F.ek || 0) * 12), b0: 5000 };
  },
  playerSignMinScale: .4, playerSignScale: .6, // 小輪の下限も指定し、共通の大きな白輪へ戻さない。
  playerSignBodyScale: 0, playerFootSignOnly: true, // 本人は足元だけで示し、重なる味方へ白い人型を載せない。
  groundFlagGuides: true, compactFlagGuide: true, compactFloorGuides: true,
  // 床の矢印は出さない。行き先は真上の▼一つ（kaito BH6）。
  compactDestinationSign: true, compactFlagEmphasis: true,
  cornerFlagFrames: true, subtleFlagFrames: true,
  namedGuideMarkers: true,
  // 曲がり角の印にも、着く先の名を出す（「印へ進め」では何の印か分からない。AR1）。
  travelGuideLabel: (rt) => ariPlaceName(rt),
  goalSignAction: (rt) => arioka.missionHeading(rt),
  edgeDestinationLabel: (rt) => ariPlaceName(rt) + 'へ', // 実物の旗がない曲がり角を「旗へ」と呼ばない。
  hideArrivedDestination: true, // 辻や曲がり角に着いたら、本人を覆う大きな印を足元へ畳む。
  compactHoldGuide: true, // 持ち場の印は地面へ収め、兵より大きな輪を重ねない。
  softGuideRings: true, dashedGuideRings: true, nearAllyBodyOnly: true,
  nearAllySolidBody: true, // 視点に入り込んだ味方だけ全身で避け、透けた顔や馬具を重ねない。
  nearAllyCameraAvoid: false, // 密集した味方で視点を本人の胴へ押し込まず、描く間の全身よけを使う。
  nearAllyWholeOcclusion: true, // 本人との間に立つ味方も全身で避け、笠と顔の中身を重ねない。
  nearAllySightWidth: 1.2, // 密集時の肩と笠も拾い、本人の印だけが味方の横へ離れて見えるのを抑える。
  nearSceneryScreenCut: false, // 焼けた町屋の梁と空を画面の長方形で切らず、既存の距離の遮蔽に任せる。
  camLift: -1.3, // 馬上の視点を下げ、持ち場から通りの両側の町屋の軒と木戸を横から見せる（真上から地面だけを写さない）。
  cameraVolumeView: true, // 門柱・開いた戸板・竹束で画面が塞がれた時も、空いている肩位置を選ぶ。
  groundGuideRings: true, // 木戸を守る黄色い輪は設置時に地形へ沿わせる。
  nearAllyFadeRadius: 4.5, // 11/18 クラウド04：200秒の木戸の内で視点の前に味方の笠と胴が画の半分を塞いだ→3.2→4.5。目の前の笠と肩で通りが埋まる前に避ける。兵の当たりと動きは保つ。11/17 iMac の検品：木戸の内で視点が笠の高さに下がり、二m 余り先の味方の陣笠が画面の下を黒く塞いだ → 三m 余りまで避ける
  nearAllyFadeLevel: 1, // 既存の半分の濃さの材質を使い、近い肩から行く先を見通す。
  nearAllyHorseFade: true, // 土橋で馬の胴が視点を塞ぐ時も既存の透かし方を使う。
  nearHatFadeRadius: 0, // 笠だけを透かして顔や首布を浮かせず、視点への食い込みは全身で避ける。
  nearHoroRadius: 5.5, nearHoroHide: true, // 視点の近くの母衣だけ既存の処理で避ける。
  nearHoroCrowdFade: true, nearHoroClothHide: true, // 具足と一つにまとまった母衣にも既存の布の処理を使う。
  nearHoroWhole: true, // 近い母衣は布と竹籠を一緒に避け、空の籠だけを浮かせない。
  nearHoroMergedFadeRadius: 5.5, // 胴と一体の母衣にも既存の透かし方を通し、近い袋で敵を覆わない。
  nearHoroMergedWhole: true, // 一体の母衣も視線を塞ぐ人ごと避け、上半身だけ抜けた姿を残さない。
  nearCourierHoroHide: true, nearCourierHoroWhole: true, // 使番は近い視線を塞ぐ間だけ人馬ごと避け、竹籠だけ残さない。
  nearLongWeaponRadius: 10, // 長槍の持ち主が後列にいても、視点へ差し込む柄と竿を既存の処理で拾う。
  nearSpearBatchRadius: 18, // 近い槍は持ち主と一緒に隠す。遠景用の別描画で空中に柄だけ残さない。
  nearSpearFade: false, // 八メートル内の槍を一斉に縮めず、視線を塞ぐ柄だけ既存の処理で避ける。
  nearGroundSpearRadius: 8, // 持ち主から離れた落ち槍も、視線を塞ぐ間だけ避ける。
  actionableThreats: true,
  fadeCloseStandards: true, // 押し合う列の近い隊旗を透かし、敵の構えを見通す。
  fadeCloseStandardFrame: true,
  standardClothScale: .75, // 狭い町筋の隊旗は既存の縮尺で小さくし、敵の構えと通りを隠さない。
  jinkei: [ARIOKA_ATTACK, ARIOKA_DEFEND],
  botOrders: true, // 木戸と城下は、この戦の下知に従う。
  botBrainDepth: true, // 段でも有岡の入口を通し、組を追従へ戻してから持ち場へ進む。
  botRetreatWay(rt, back) {
    const C = rt.flags.dpOn && rt.flags.dp?.cur;
    // 帰還中の避け足も木戸へ向ける。近くの味方を追って町へ戻り続けない。
    // 辻と木戸を守る間も、範囲外の味方を追って休みに行かない。
    const returning = !rt.flags.ending && C?.s?.kind === 'move' && !C.arr;
    return gateWay(rt.army, rt.player.u, returning || !ariPostRestAllowed(rt, back) ? C.at : back);
  },
  botRetreatStepAllowed: ariPostStepAllowed,
  retreatPathAllowed: ariPostRestAllowed, // 休む終点は、到着の輪も含めて実際の持ち場へ収める。
  retreatLinkLength: 72, // 退く向きは足元の短い矢印で示し、離れた旗まで兵を横切らない。
  swipeArrowLength: 72, // 旗へ結ぶ経路でも同じ長さに収める。行き先の旗は残す。
  botCoverBlocked: (rt, _from, to) => !ariPostStepAllowed(rt, to),
  taskDetails: false, // 右上の任務一行だけ。人数と残り時間の字の札は出さない（稲生の標準）。
  sideTaskLabel: true, // 携帯横向きは左欄の下知と地面の矢印を分け、移動前の札へ線を引かない。
  keepCombatTask: false, // 右上の任務一行だけ（稲生の標準）。人数と期限の字の札を戦闘中に出さない。
  keepCombatTaskHeading: true, // 目の前の敵への操作で、木戸を守る下知を置き換えない。
  keepCombatTaskDetail: false,
  keepTaskWithGuard: true, keepTaskWithDodge: true,
  keepFlagTravelTask: true, keepFlagArrivalTask: true,
  keepTaskLabel: true, // 目の前の一人へ誘われても、木戸と辻を守る下知を残す。
  keepTaskPanel: true, keepApproachTaskPanel: true,
  singleTaskGuide: true, // 帰還の下知を操作欄と任務欄へ二度並べない。
  hideGuideSteps: true, // 距離は任務の補足で読み、退避の見出しに歩数を足して三行にしない。
  combatTaskLabel(rt) {
    // 敵一人への操作案内の後でも、辻と木戸の下知を既存の札に残す。
    if (rt.flags.ending) return '';
    let main = '';
    for (const o of rt.objectives) if (!o.state && o.kind === 'main') {
      if (o.id === 'dp') return o.text;
      if (o.id === 'main') main = o.text;
    }
    return main;
  },
  keepGuardTaskLabel: true, // 受け方の案内でも、木戸へ戻る下知と期限を消さない。
  guardStartText: '敵の一撃を防ぐ', guardWaitText: '構えたまま防ぐ', // 移動中の構えを、その場を守る下知と呼ばない。
  keepDestinationTask: true, // 行き先の旗の案内でも、守る場所と期限を消さない。
  keepRescueTaskLabel: true, // 手当ての十字を、任務と無関係な「この人を守れ」で上書きしない。
  keepRetreatReason: true, // 負傷時も「ここへ」に縮めず、戻る場所と今する事を見出しに残す。
  keepRetreatGestureReason: true, // なぞる向きは補足へ置き、木戸と辻の下知を見出しに残す。
  keepWoundRetreatReason: true, // 傷を負った時も有岡の退避先と持ち場を残す。
  retreatForLimbWounds: false, // 止血後の手足の傷だけで、辻への進軍や木戸の守備を退避へ替え続けない。
  keepWoundTaskLabel: true, // 出血・深手の退避は残し、持ち場と期限も同じ札へ残す。
  treatmentTaskGuidance: true,
  treatmentCrossSign: true, compactRetreatArea: true, compactRetreatSign: true,
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.mounted) return '馬を降りて手当て';
    if (p.treatmentReady) return p.treating ? '手当てを押し続けよ' : '「手当て」を三秒長押し';
    if (!cue?.valid) return '味方の後ろへ下がり、傷を縛れ';
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius) return '十字へ下がり、傷を縛れ';
    if (p.treatmentNext > rt.t) return `次の手当てまであと${Math.ceil(p.treatmentNext - rt.t)}秒`;
    return '止まり、手当ての支度を待て';
  },
  retreatGuideLabel(rt, reached) {
    if (rt.flags.ending) return rt.flags.kanbePending ? ARI_GOALS[4]
      : rt.flags.kanbeMet ? '官兵衛を迎えた。味方の後ろで息を整えよ' : '退き太鼓。木戸の外へ戻れ';
    const cue = rt.hud.retreatGuide;
    if (cue?.active && cue.valid && cue.treatment)
      return this.treatmentGuideLabel(rt, cue);
    const C = rt.flags.dpOn && rt.flags.dp?.cur;
    // 段が始まる前の C は false。種類も確かめ、退避の案内で戦を止めない。
    if (C?.s?.kind === 'move' && !C.arr) return ariReturnGuide(rt.player.u.pos);
    // 押された時も攻めの行き先を失わせず、守る範囲の外では戻る下知を示す。
    if (rt.flags.step === 0) return '先手の後ろから木戸へ寄れ';
    if (C?.s?.kind === 'hold') {
      // ②の通り・④の焼け跡と奥の木戸も、今の持ち場へ戻す。辻へ引き返させない。
      const place = ariPlaceName(rt);
      if (C.at && Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z) > (C.botRadius || 16))
        return `道の印で${place}へ戻れ`;
      if (C.defending) return reached
        ? `息を整え、${place}を守れ` : `${place}の味方へ下がれ`;
      return reached ? `息を整え、${place}を守れ`
        : `${place}の味方へ寄って休め`;
    }
    return reached ? '味方の後ろで息を整えよ' : '味方の後ろへ下がれ';
  },
  taskDetail(rt, title, progress) {
    const cue = rt.hud.retreatGuide, p = rt.player;
    if (rt.flags.ending || rt.over) return progress;
    // 補足が空だと共通の「味方の旗へ」に戻る。今の下知に沿う待ち方を示す。
    if (!progress) return rt.flags.step === 0 ? (rt.t < rt.flags.openAt ? `開門まであと${Math.ceil(rt.flags.openAt - rt.t)}秒` : '上臈塚の木戸の印へ寄れ')
      : rt.flags.dp?.cur?.defending ? '侍町から来る敵に槍を向けよ'
        : '道の印をたどり、組から離れるな';
    if (!(cue?.active && cue.valid) && p.u.hp >= p.u.maxHp * .3 && !p.u.mobbed && p.sta >= 20 && !(rt.retreatUntil > rt.t)) return progress;
    // 持ち場の外では見出しが戻る場所を示す。進む文を重ねず、距離と期限を残す。
    if (title === `道の印で${ariPlaceName(rt)}へ戻れ` || title === '道の印で木戸へ戻れ') return progress;
    // 退避・手当てが見出しになる間も、下知と期限を補足に残す。判定と残り時間は変えない。
    for (const o of rt.objectives) if (!o.state && o.kind === 'main' && (o.id === 'dp' || o.id === 'main'))
      return title === o.text ? progress : o.text + '。' + progress;
    return progress;
  },
  immediateTaskChanges: true, // 任務の残り秒を十秒前の文のままにしない。
  coverGuideLabel: '鉄砲を避け、物かげへ',
  coverGuideTouchLabel: '鉄砲をよける\n長押しで移動',
  noticeOnce: true, // 首の催促や組の同じ掛け声は、この戦で一度だけ。
  noDistantBattle: true, // 備え表にない控え・本陣・押し合いを重ねない。
  strictHits: true, // 斬り合いの一撃は通常どおり。
  rangedWarning: true, // 発射前に矢印と「鉄砲」で方向を示す。
  openingGunGrace: 30, // 最初の鉄砲では退く時間を残す。
  sideTaskAfter: Infinity, // 本丸や櫓取りへ誘わず、木戸と辻の任務に従う。
  guideMarker(rt) {
    if (rt.flags.ending || rt.over) return null;
    if (rt.flags.coverUntil > rt.t) return 'ariCover';
    return rt.flags.step === 0 ? 'taki' : rt.flags.dpOn ? 'dp' : 'turn';
  },
  downDelay: 3.5, // 倒れたら屋根を見続けず、戦の結果へ。
  defeatCamPull: 6, defeatCamLift: 3, // 負けの終幕は背中と槍の上から戦場を見渡す。
  noTaisho: true, // 信忠の本陣は局地の範囲外。共通処理で木戸前へ出さない。
  noWake: true, // 城下の段で出す兵だけが戦う。遠景と自動増援は重ねない。
  // 身の回りの当時の場（timeslip_field.js）。天正七年十月十五日は今の十二月初め・霜の降りる夜。
  // 乾いて凍てた土の町筋に荷車の轍、霜枯れの低い草。木戸と辻で槍を合わせた所ほど、倒れた槍・荒木方の旗・矢が多い。
  timeslip: {
    wet: 0.1, dust: 0.4, trample: 0.3, debris: 1, arrows: 0.7,
    grassShape: 'blade', // 10/31 霜枯れの草を板の絵でなく細い葉の株に。
    mudColor: 0x7a6c5c, grassLift: 0.15, grass: 0x7e7252, grassTints: [0xffffff, 0xd8c8a0, 0xb8ac88], grassH: 0.8, tallGrass: 0.45,
    flagColors: [0xe6dfcc, 0x24211e, 0x2e3a52],
    fights: [[GATE.x, GATE.z, 26], [TOWN_X - 24, GATE.z, 24], [TOWN_X - 12, -70, 24], [TOWN_X, -14, 22]],
    noGrass: (x, z) => x > GATE.x + 2 && x < SOKAKU_X,   // 惣構えの内（町屋と侍町）は踏み固めた土。草は木戸の外だけ
  },
  spawn: { x: GATE.x - 60, z: GATE.z + 2, heading: Math.PI / 2 },   // 11/17 照らし直し（cloud-07）：開戦の写真で兵が数人に見えた。後詰・旗本・組・滝川の手の列の後ろから始め、木戸へ向く視野に百人の列と幟を入れる
  // 城攻めの部品（siege_kit.js。battle.js が組み、毎コマ動かす）：上臈塚の木戸の左右の惣構えの塀を狭間に借り、
  // 開門を待つ寄せ手と木戸をくぐる自分へ、塀の上の陣笠と銃口から鉄砲と矢を射かける（左右の面が十字に撃つ横矢）。
  // 兵・塀・絵は足さない。撃つのは近くに荒木勢が残る塀だけ。木戸の内へ入れば塀は背になる。
  // 11/6 描いて遊ぶ：戦の煙に任せていた塀の上の発砲に硝煙が出ず、十秒ごとの写真に一度も映らなかった（critic60 の△）。狭間ごとに薄い白煙を出す。
  stackAllAttack: true,  // 11/17 クラウドい：act bot 391秒 滝川本陣6人が attack のまま重なる★★。狙い無しで重なる attack 組も渦に散らす
  siegeKit: {
    plan: { x: GATE.x, z: GATE.z, rot: -Math.PI / 2, W: 40, yokoya: false, moat: false, kirigishi: 0, umadashi: false, sakamogi: false, shiyori: false },
    build: { team: 1, gate: false, walls: false, bridge: false, umadashi: false, sakamogi: false, shiyori: false, heads: true,
      // 11/19 クラウド kaito2（cloud-29 の照らし：城の射手が本人を撃たない）：旅の紙①『塀の狭間から鉄砲の火・竹束に弾が当たる』の通り、
      //   竹束・塀の陰の外では弱く当たる（伊賀の 0.4 より弱く）
      fire: { smoke: true, hurt: 0.3, near: 70, close: 14, base: .8, peak: 4, arrows: .4 } },
    borrow: { r: 46, flank: true, name: '惣構えの柵' },
    when: (rt) => rt.flags.step <= 1 && !rt.flags.ending,
  },
  // 稲生の標準：木戸を入った辻で四方から突かれ、開門の一分半で倒れていた（bot 10/28 に三度）。人数と斬り合いはそのまま、受ける傷を六割に。
  // 11/19 クラウド kaito2（act bot『簡単すぎる』：七分で受けた傷15・受け流し29回）：0.6 は player_hurt.js で八割に切り上がっていた（K360⑦）。並の傷に（割り込み・命の戻りは残す）
  playerTaken: 1,
  playerRegen: 0.02,   // 戦っていない間（四秒当たらない間）は命が少しずつ戻る
  frameCamera: ariTabaView,
  // 一太刀の軽減は保ち、被弾直後の連続被害を防ぐ。
  // 11/15：二十人を無傷で討てた記録を受け、次の打ち返しを防ぐ猶予だけ四秒から三秒へ。
  cutFloor: 0.8,   // 11/19 クラウド kaito2：受ける傷の床0.8倍の決まり（K360⑦）に合わせる（前は 0.35・act bot『歯ごたえがない』）
  // 11/19 クラウド kaito2：戦ごとの刃の猶予（meleeGrace）は外し、共通の猶予にする（kaito『敵の手加減は外す』）
  world: {
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物（MB係四）
    // 11/18 夜50-33：四人へ上げても act bot の傷は0 のまま（66回のうち62回は bot の受け流し）、③の辻で本人が囲まれて退き続け二百秒長引いた回が出たので三人に戻す
    playerAtkMax: 3,   // 三人目も打ち返せるようにし、正面の二人だけを順に斬り続けられないようにする。後続は共通の処理で退き口を空ける。
    seed: 15791, moveLim: 1080, groundHalf: 1100,
    castleWall: 'kuro', // 天正七年の摂津の城。安土より後の白漆喰の総塗りにせず、黒い下見板と白壁（docs/battle_refs/arioka.md）。
    time: 'night', unitNightScale: 0, // 兵だけ青白く光らせず、具足と顔を同じ月光で照らす。
    nightLift: 1.8, nightFill: 0.55, nightMoonMin: 1.1, lowNightExposure: 1.6, // 霜の夜を昼のような青白い一枚に持ち上げない（10/28 木戸の外が白い砂の一枚に見えた）。篝火と月の陰を残す。
    // 11/6 kaito 四6：灰色の曇りの夕方に見えた。空と霧を紺の夜へ沈め、月の青と篝火・火の橙で読ませる（持ち上げは共通の下限 1.8 まで）。
    nightLight: { sky: 0x161d2e, fog: 0x1a2232, top: 0x060a14, hemiSky: 0x6a7490, hemiGround: 0x22201e },
    drawTimeUnitParts: true, // 移動後の骨と具足の逆行列を描く時にそろえ、笠・手・槍だけを宙へ残さない。
    fullTipMatrices: true, // 遠い兵も手首と指をそろえ、木戸から手の皮が長い帯に伸びるのを防ぐ。
    movingHiddenBones: true, // 体の中心が画面外でも、動いた兵の骨を今の位置へそろえる。
    denseTabaBundles: true, // 高画質の竹束は細竹の束にし、太い黒い杭に見せない。
    winter: true,
    allyCloth: [0x4a3a2a, 0x3a3024, 0x5a4632, 0x34302a], // 味方の足軽の衣を土色に。藍・紺の衣で敵味方を取り違えない（見分けは敵の頭上の印）。
    groundPhoto: { dirt: 'rocky_trail', mudFromSoil: true, scale: 0.2 }, dirtTint: [0.42, 0.42, 0.42],   // 10/30 c_ground_photo2：茶の一枚の土を戦ごとの写真（CC0）に。泥も同じ写真で絵は増やさない（凍てた灰茶の道土。暗さは残し色味は写真のまま）
    naturalArrowRain: true, // 矢の落ち先を大きな黒い点や影にせず、夜の地面へなじませる。
    arrowRainPerBow: 1, // 少ない弓兵から数十本の補助矢を増やさず、実際の射手に合わせる。
    softEarthCrust: true, // 土塊の升目で陰を切らず、木戸前を敷石に見せない。
    stableSlopeGrain: true, // 堀の岸の細かな起伏で土の模様を縞へ引き延ばさない。
    curvedRockTufts: true, // 岩の根草を細く曲げ、土橋の脇へ黒い三角の針を並べない。
    litRockTufts: true, // 葉の裏にも空の光を渡し、月夜の根草を真っ黒な刃にしない。
    longHoro: 'round', // 背幅のある既存の竹籠を使い、斜めからも薄い板に見せない。
    mountainScale: .25, mountainHaze: .8, // 伊丹の平地から遠い山を低く霞ませる。
    roundedFire: true,
    gateRoofBacking: true, // 冠木門の葺き板の下へ既存の野地板を通し、屋根裏から空を漏らさない。
    variedFalls: true, opaqueCorpses: true, riderBackFlag: true,
    bareFallenHats: true, slopeLitter: true, // 落ちた笠に頭巾と首を残さず、笠だけを地面に置く。
    // 木戸の行軍は一人ずつ歩調をずらす。逃げる速さは保ち、腿と腰の振りだけを人の歩幅へ収める。
    variedMarch: true, strideLimit: 1.1,
    // 段ごとの穂先を保ち、呼吸と押し返しを小さくずらす。突きの間と当たりはそのまま。
    livingSpearHedge: true,
    // 11/8 critic60（四4・一7・八1）：木戸の内の乱戦で槍が四方へ突き立ち、近い兵の胴が箱・腕が折れた板、亡骸が箱の塊に見えた。
    //   待つ味方の槍は立て気味に、中ほどの兵にも腕の形、骨の入った人で描く輪を二十二歩へ（高い画質だけ）、亡骸は横倒しのまま地へ収める
    spatialFireSound: true,   // 11/8 critic60（音）：燃える町屋の火の音を高さの差も入れて、その方から聞かせる
    allySpearSpread: true, middleInfantryArms: true, highUnitNear: 22, groundedFalls: true, settleSideFalls: true, settleFallenLimbs: true,
    meleeBodySpace: 1.15, allyPersonalSpace: 1.25, // 既存の押し合いで笠と肩の間を空け、本人へ後列を重ねない。
    // 膝が折れる間をばらし、横倒しの肩を地へ収める。接地した時に具足の音と低い土粒を出す。
    fallPaceSpread: 0.35, groundedFalls: true, settleSideFalls: true,
    contactFalls: true, wetEarthBursts: true,
    nearAllyFadeRadius: 2.2,
    wind: [0.4, 1],
    muddy: 0.1,
    darkFootprints: true, // 夜の足跡は小さな泥の跡。灯りのない草地で光らせない。
    paths: ARIOKA_ROADS,
    // 猪名川の西の平地に収穫後の田。囲みの陣・土橋・村の前は空ける。
    paddy: (x, z) => x > SOKAKU_X + 24 && x < SOKAKU_X + 66 && z > -190 && z < -25 ? 1 : 0,
    height,
    moveWay: gateWay, fleeWay, fleeFar: false,
    // 遠くの使番も同じ木戸へ回す。姿を出す前から塀と堀に詰まらせない。
    runnerWay: gateWay,
    // 東の低地に猪名川。南へ下り、尼崎へ向かう（遠景）。
    streams: [{ pts: [[SOKAKU_X + 88, SOKAKU_N - 25], [SOKAKU_X + 93, -60], [SOKAKU_X + 86, 60], [SOKAKU_X + 91, WALL_Z + 50]], w: 11, depth: 1.3 }],
    clear: (x, z) => (Math.abs(x) < SOKAKU_X + 5 && z > SOKAKU_N - 15 && z < WALL_Z + 15) ||
      (x > CAMP.x - 30 && x < GATE.x && Math.abs(z - GATE.z) < 45),
    trees: 220,
    detailedBoardShields: true,   // 置楯に木口の縁・裏の持ち手・傷を付け、黒い板一枚に見せない（10/29 差の表）
    nearCedarBranches: true, // 高画質でも杉を木全体の交差板へ替えず、共有する枝房を残す。
    clearGroves: true, // 追加の林も町の空地・通り・川岸を空け、家並みに大きな木を重ねない。
    tufts: 2600,
    treeDensity: (x, z) => ((Math.abs(x) < SOKAKU_X + 10 && z > SOKAKU_N - 20 && z < WALL_Z + 20) ||
      (x > CAMP.x - 30 && x < GATE.x && Math.abs(z - GATE.z) < 45) ? 0.05 : 0.6),
    groves: [{ x: TOWN_X + 50, z: -20, r: 10, n: 10, kind: 'broad' }, { x: GATE.x, z: 40, r: 10, n: 10, kind: 'broad' }],
    fleeOut: (x, z, team) => team === 1 && x > HON_W && x < HON_E && z > HON_N && z < HON_Z,
  },

  *setup(rt) {   // K112：段の間で一コマ返す（yield。battle.js finishBuild）
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow';
      // 11/19 08:40 クラウド kaito2（有岡の持ち主）：act bot が八分で四十人斬り「受けた傷 足軽0・侍0」（歯ごたえがない）。0 は受け流し（見切り）だけで出る
      //   （構えで受けても浅い傷が残る）。田野・関ヶ原 K06 と同じ型：受け流された荒木の衆は六秒の間、次の刃を受け流させず構えで受けさせる
      //   （気力が減り浅い傷・気力が尽きれば入る）。敵の数・強さ・一太刀の重さは変えない。
      const sk = s && !s.isStruct && !m, p0 = rt.stats?.parries || 0, g0 = this.guardT, sg = sk && s.group;
      const np = sk && Math.max(s._ariParT || 0, sg?._ariParT || 0) > rt.t && this.guard;
      if (np) this.guardT = Math.max(g0 || 0, 9);
      const d = td.call(this, a, s);
      if (np && this.guardT === 9) this.guardT = g0;
      if (sk && (rt.stats?.parries || 0) > p0) { s._ariParT = rt.t + 6; if (sg) sg._ariParT = rt.t + 6; }
      return sk && d > 0 ? d * k : d; }; }   // 11/1：刃の一太刀を def.cutFloor 倍に（共通の一太刀五割・六割は変えず、この戦だけ）
    const W = rt.world;
    timeslipField(rt);   // 身の回りの凍てた町筋・轍・倒れた槍と旗（def.timeslip）
    const F = rt.flags;
    ARI_EARTH.map = dirtTex(); ARI_STONE.map = stoneTex();
    ARI_EARTH.needsUpdate = ARI_STONE.needsUpdate = true;
    F.step = 0; F.ek = 0; F.ak = 0;
    F.rescued = true; // 深手からその場で体力を戻して立たせる共通の救助は使わない。
    rt._rfN = 3; // 共通の自動救援は使わず、初めから後詰を置く。
    // 長い包囲（kakoi.js）：荒木村重は一年近く籠もり、兵糧と士気は細っている。夜討ちの結果で動く
    F.kakoi = makeKakoi({ day: 300, foodDays: 25, morale: 55 });
    flReset();   // 床の層（石垣の上・水堀の土橋）を、この戦の分で作り直す
    // ---- 惣構えの柵（西の上臈塚の木戸が内応で開く） ----
    const cameraWalls = F.ariCamWalls = [];
    rt.cleanupTasks?.add?.(() => { ariCamGrid = null; ariCamInGrid = null; ariCamWallBuf.length = 0; ariCamInBuf.length = 0; });   // K626：戦を閉じたら視点の升を手放す（町屋→mesh で前の戦の Battle が残った）
    F.ariCameraGates = [];
    F.ariCameraHouses = [];
    const noT = (segs) => {
      for (const s of segs) {
        s.noTarget = true; s.wall = true;
        if (s.mesh.ariHoles) attachSama([s], s.mesh.ariHoles);
        const [ax, az, bx, bz] = s.seg;
        cameraWalls.push({ s, ax, az, dx: bx - ax, dz: bz - az,
          x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz),
          bottom: Math.min(W.heightAt(ax, az), W.heightAt(bx, bz)) - .1,
          top: Math.max(W.heightAt(ax, az), W.heightAt(bx, bz)) + (s.h || 2.45) });
      }
      return segs;
    };
    // 束ねた柵の面を毎回調べず、歩く柵と同じ線で視点を手前へ寄せる。
    W.cameraBlockFraction = (from, to) => {
      const dx = to.x - from.x, dz = to.z - from.z;
      // K564：一コマに何百回も呼ばれる。null と数の混ざった変数・for of の回し手で毎回記憶を割り当てていたので、無限大を印にし添字で回す（同じ答え）。
      let hit = Infinity;
      // 竹束を背にしても視点を束の中へ入れない。形・当たりの入れ物は使い回す。
      const TB = F.tabas;
      if (TB) for (let i = 0; i < TB.length; i++) {
        const tb = TB[i];
        if (!tb.m.visible || !tb.ariCamera) continue;
        const tabaCamera = ariTabaCameraPose(tb);
        const t = ariGateCameraHit(tabaCamera, from, to);
        if (t !== null && t < hit) hit = t;
      }
      const CG = F.ariCameraGates;
      for (let i = 0; i < CG.length; i++) {
        const gate = CG[i];
        const t = ariGateCameraHit(gate, from, to);
        if (t !== null && t < hit) hit = t;
      }
      // 11/22 クラウド 有岡の持ち主（K564 重さ）：町屋の箱と柵の線を十二m の升に分けて、視線の外接箱にかかる升の物だけを調べる（同じ答え）。
      //   視点の当たりは短い線を一コマに何十本も引くので、町屋二百余りと柵百余りを毎回全部回していた（CPU の写しで有岡だけの三番目の重さ）。
      const CH = F.ariCameraHouses, CL = ariCamCells(CH, cameraWalls, from, to), q = ++ariCamQ;
      const HL = CL ? null : CH, WL = CL ? null : cameraWalls;
      if (CL) {
        for (let k = 0; k < CL.length; k++) {
          const cell = CL[k];
          for (let i = 0; i < cell.length; i++) {
            const o = cell[i];
            if (o._q === q) continue;
            o._q = q;
            if (o.house) { const t = ariGateCameraHit(o, from, to); if (t !== null && t < hit) hit = t; }
          }
        }
      } else {
        for (let i = 0; i < HL.length; i++) {
          const t = ariGateCameraHit(HL[i], from, to);
          if (t !== null && t < hit) hit = t;
        }
      }
      const nW = CL ? ariCamWallN : WL.length;
      for (let i = 0; i < nW; i++) {
        const w = CL ? ariCamWallBuf[i] : WL[i];
        if (!w.s.alive || w.s.opened) continue;
        // K564（11/21 有岡の持ち主）：視線の外接箱と柵の外接箱が離れていれば交わらない（同じ答え）。割り算の前に外す。
        if (Math.max(from.x, to.x) < w.x0 || Math.min(from.x, to.x) > w.x1
          || Math.max(from.z, to.z) < w.z0 || Math.min(from.z, to.z) > w.z1) continue;
        const den = dx * w.dz - dz * w.dx;
        if (Math.abs(den) < .000001) continue;
        const ax = w.ax - from.x, az = w.az - from.z;
        const t = (ax * w.dz - az * w.dx) / den;
        if (t <= 0 || t >= 1 || t >= hit) continue;
        const v = (ax * dz - az * dx) / den;
        if (v < 0 || v > 1) continue;
        const y = from.y + (to.y - from.y) * t;
        if (y >= w.bottom && y <= w.top) hit = t;
      }
      // 町屋の歩く壁も使う。網目状に透かした壁の中へ視点を入れない。
      // 崩れた家の壁は既存の処理で一覧から外れるため、見えない壁は残らない。
      const IW = ariCamInner(INTERIOR_WALLS, from, to), nI = IW ? ariCamInN : INTERIOR_WALLS.length;
      for (let i = 0; i < nI; i++) {
        const w = IW ? ariCamInBuf[i] : INTERIOR_WALLS[i];
        if (Math.max(from.x, to.x) < Math.min(w.ax, w.bx) || Math.min(from.x, to.x) > Math.max(w.ax, w.bx)
          || Math.max(from.z, to.z) < Math.min(w.az, w.bz) || Math.min(from.z, to.z) > Math.max(w.az, w.bz)) continue;
        const sx = w.bx - w.ax, sz = w.bz - w.az, den = dx * sz - dz * sx;
        if (Math.abs(den) < .000001) continue;
        const ax = w.ax - from.x, az = w.az - from.z;
        const t = (ax * sz - az * sx) / den, v = (ax * dz - az * dx) / den;
        if (t <= 0 || t >= 1 || t >= hit || v < 0 || v > 1) continue;
        const y = from.y + (to.y - from.y) * t;
        if (y >= w.yBot && y <= w.yTop) hit = t;
      }
      return hit === Infinity ? null : hit;
    };
    // 塀（百枚近く）と城の建物は材質ごとに一つの形へまとめて描く（一枚ずつだと描く回数が五百を越え、携帯で重かった）
    const KB = makeKitBatch(), PB = makeSimpleBatch();
    refineAriTerrain(rt);
    const farWood = [], farEarth = [];
    const farFence = (world, seg) => {
      const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az);
      const nearGate = Math.hypot((ax + bx) / 2 - GATE.x, (az + bz) / 2 - GATE.z) < 90;
      const n = Math.ceil(len / (nearGate ? .42 : 4)), angle = Math.atan2(bx - ax, bz - az);
      // 長い一枚板を地形に沿う短い厚板へ分け、地面に埋めた杭で支える。
      // 頂点ごとに高さを合わせるため、中央だけ接地して両端が浮くこともない。
      for (let i = 0; i < n; i++) {
        const t = (i + .5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const g = ARI_BOX.toNonIndexed(); g.scale(.22, 2.4, len / n - .04); g.rotateY(angle); g.translate(x, 1.12, z);
        const p = g.attributes.position;
        const colors = new Float32Array(p.count * 3);
        const fade = 1.12 + .18 * Math.sin(x * 2.7 + z * 1.9);
        for (let k = 0; k < p.count; k++) {
          const localY = p.getY(k);
          p.setY(k, localY + world.heightAt(p.getX(k), p.getZ(k)));
          // 雨の当たる上端は灰色に退色し、地際は泥で暗くなる。面は増やさない。
          if (colors) {
            const top = localY > 1 ? 1 : .62;
            colors[k * 3] = fade * top;
            colors[k * 3 + 1] = (fade + .13) * top;
            colors[k * 3 + 2] = (fade + .23) * top;
          }
        }
        if (colors) g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        g.computeVertexNormals(); farWood.push(g);
      }
      const supports = Math.ceil(len / 3);
      for (let i = 0; i <= supports; i++) {
        const x = ax + (bx - ax) * i / supports, z = az + (bz - az) * i / supports;
        const g = ARI_BOX.toNonIndexed(); g.scale(.38, 2.7, .38);
        g.translate(x, world.heightAt(x, z) + 1.15, z); farWood.push(g);
        if (nearGate) {
          const brace = ARI_BOX.toNonIndexed(); brace.scale(.16, 2.3, .16); brace.rotateZ(.42); brace.rotateY(angle);
          brace.translate(x + Math.cos(angle) * .55, world.heightAt(x, z) + .95, z - Math.sin(angle) * .55); farWood.push(brace);
        }
      }
      // 清洲・小田原の板塀のように、木戸の近くの塀へ浅い雨覆いを掛ける。
      // 遠い惣構えには足さず、両端も地形へ沿わせて既存の木材の束に結合する。
      if (nearGate) {
        const spans = Math.ceil(len / 1.5);
        for (let i = 0; i < spans; i++) for (const side of [-1, 1]) {
          const t = (i + .5) / spans, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          const g = ARI_BOX.toNonIndexed(); g.scale(.38, .06, len / spans + .035);
          g.rotateZ(-side * .3); g.translate(side * .175, 2.47, 0);
          g.rotateY(angle); g.translate(x, 0, z);
          const p = g.attributes.position;
          for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) + world.heightAt(p.getX(k), p.getZ(k)));
          g.computeVertexNormals(); farWood.push(g);
        }
      }
      return { isBatchedPart: true };
    };
    const townFence = (world, seg) => {
      if (true) {
        const holes = [], mesh = castleBoardFence(world, seg, { h: 2.45, samaStep: 1.5, holes, batch: PB, ...(MEM_TIGHT ? { boardW: .42, boardNoEnds: true } : {}) });   // K564：iPhone は板を広く・木口を積まない（越前と同じ）
        mesh.ariHoles = holes;
        return mesh;
      }
      const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az);
      const angle = Math.atan2(bx - ax, bz - az), n = Math.ceil(len / .5);
      const H = 2.45; // 背丈一・六三メートルの一・五倍。杭の間は約三十センチ空ける。
      for (let i = 0; i <= n; i++) {
        const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
        const g = ARI_BOX.toNonIndexed(); g.scale(.2, H, .2);
        g.translate(x, world.heightAt(x, z) + H / 2, z); farWood.push(g);
      }
      for (const y of [.65, 1.65]) {
        const g = ARI_BOX.toNonIndexed(); g.scale(.14, .14, len); g.rotateY(angle);
        g.translate((ax + bx) / 2, world.heightAt((ax + bx) / 2, (az + bz) / 2) + y, (az + bz) / 2);
        farWood.push(g);
      }
      return { isBatchedPart: true };
    };
    const outerWall = (pts) => noT(wallLine(rt, pts, { team: 1, hp: 1e9, name: '惣構えの柵', segLen: 24, mesh: farFence }));
    outerWall([[-SOKAKU_X, WALL_Z], [SOKAKU_X, WALL_Z]]);
    F.gate = rt.army.addStruct({ seg: [GATE.x, GATE.z - 3.5, GATE.x, GATE.z + 3.5], nx: -1, nz: 0, hp: 1e9, maxHp: 1e9, team: 1, name: '上臈塚の木戸' });
    F.gate.noTarget = true;
    const dm = tobira(W, GATE.x, GATE.z, 7.0, Math.PI / 2);   // 閉じた扉（破られると根元から倒れる）
    // 開門時に実物の戸板から視点の当たりを取る。静止物の結合で戸板を外さない。
    dm.userData.noFreeze = true;
    // 戸板の部品も結合から外し、開門後の見た目と視点判定を同じ形に保つ。
    dm.traverse(o => { if (o.isMesh) o.userData.noBatch = true; });
    F.door = dm;
    // 土橋の口は板葺きの櫓門。閉じた扉と木造の井楼は同じ位置に保つ。
    rt.scene.add(dm);
    ariGate(rt, GATE.x, GATE.z, 7.4, Math.PI / 2, KB);
    rt.scene.add(yagura(W, -30, WALL_Z - 5), yagura(W, 34, WALL_Z - 5));
    // 惣構えの水堀（木戸の正面だけ切って、土橋で渡す。docs/castle-design.md 1-4・5-2）
    // heightAt はすでに堀の底。水をさらに下げず、底から水深を戻す。
    const gateWater = [], moatMat = ariWaterMat(W);
    const water = (pts, moat) => {
      const a = pts[0], b = pts[1];
      // 惣構えの外堀は岸の近くまで水を張る（木戸の手前から、霜の夜の黒い水面が帯になって見える）
      const y = W.heightAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) + moat.depth * (moat === SOTO_MOAT ? 0.85 : 0.6);
      const moatMesh = mizubori(rt, pts, { ...moat, y }).mesh;
      if (moatMesh) moatMesh.material = moatMat;
      if (a[0] === GATE.x - 5 && b[0] === a[0]) gateWater.push({ z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]), y });
    };
    for (const pts of SOTO_MOAT_SEGS) {
      for (let i = 1; i < pts.length; i++) water([pts[i - 1], pts[i]], SOTO_MOAT);
    }
    // 土橋は東西。床の長い向きも東西へそろえ、七メートル幅を丸ごと歩ける。
    const bridgeY = Math.max(W.heightAt(...SOTO_BRIDGE.a), W.heightAt(...SOTO_BRIDGE.b));
    addDeck({ x0: SOTO_BRIDGE.a[0], x1: SOTO_BRIDGE.b[0], z0: GATE.z - SOTO_BRIDGE.w / 2, z1: GATE.z + SOTO_BRIDGE.w / 2, y: bridgeY, pad: 0, name: '惣構えの土橋' });
    const reflections = [];
    // 篝の三脚は堀底ではなく、木戸脇の内岸に置く。歩く口は空ける。
    for (const [x, z] of [[GATE.x + 1.5, GATE.z - 6], [GATE.x + 1.5, GATE.z + 6]]) {
      rt.scene.add(kagaribi(W, x, z));
      const fire = W.addFire(x, z, { h: 1.3, size: .55 });
      const surface = gateWater.find(s => z > s.z0 && z < s.z1);
      if (!surface) continue;
      // 地面の丸い照り返しは堀の中では描かず、水面には横に切れた細長い波を置く。
      fire.glow.material.onBeforeCompile = sh => {
        sh.vertexShader = 'varying vec3 vAriGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvAriGlow = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = 'varying vec3 vAriGlow;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          if (abs(vAriGlow.x - ${(GATE.x - 5).toFixed(1)}) < 3.2
            && vAriGlow.z > ${surface.z0.toFixed(1)} && vAriGlow.z < ${surface.z1.toFixed(1)}) discard;`);
      };
      fire.glow.material.customProgramCacheKey = () => 'arioka-glow-' + surface.z0;
      const g = new THREE.PlaneGeometry(6.2, 2.4); g.rotateX(-Math.PI / 2);
      g.translate(GATE.x - 5, surface.y + .025, z); reflections.push(g);
    }
    if (reflections.length) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xd89542, transparent: true, opacity: .055,
        blending: THREE.AdditiveBlending, depthWrite: false });
      mat.onBeforeCompile = sh => {
        sh.uniforms.uAriWaveTime = W.groundU.uTime;
        sh.vertexShader = 'varying vec2 vAriWave;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvAriWave = uv;');
        sh.fragmentShader = 'uniform float uAriWaveTime; varying vec2 vAriWave;\n' + sh.fragmentShader.replace(
          '#include <color_fragment>', `#include <color_fragment>
          vec2 p = vAriWave - 0.5;
          float edge = 1.0 - smoothstep(0.15, 0.5, abs(p.y));
          float wave = sin(vAriWave.y * 94.0 - uAriWaveTime * 2.1 + sin(vAriWave.x * 31.0 + uAriWaveTime) * 3.0);
          float broken = 0.5 + 0.5 * sin(vAriWave.x * 57.0 + vAriWave.y * 29.0 + uAriWaveTime * 2.7);
          diffuseColor.a *= edge * (1.0 - smoothstep(0.15, 0.5, abs(p.x))) * smoothstep(0.35, 0.9, wave) * broken * (0.8 + 0.2 * sin(uAriWaveTime * 3.7));`);
      };
      mat.customProgramCacheKey = () => 'arioka-fire-waves';
      rt.scene.add(new THREE.Mesh(mergeGeometries(reflections), mat));
      for (const g of reflections) g.dispose();
    }
    yield;   // K112：ここで一コマ返す（組み立ての固まりを分ける）
    // ---- 惣構え全体の囲い（東西約800m・南北約1,700mを実寸。四方を閉じ、開くのは西の上臈塚の木戸だけ） ----
    // 南の塀は東西の土塁につなぎ、木戸以外に隙間を残さない。
    outerWall([[-SOKAKU_X, WALL_Z], [-SOKAKU_X, GATE.z + 45]]);
    outerWall([[-SOKAKU_X, GATE.z - 45], [-SOKAKU_X, SOKAKU_N]]);
    for (const pts of [[[GATE.x, GATE.z + 45], [GATE.x, GATE.z + 3.5]], [[GATE.x, GATE.z - 3.5], [GATE.x, GATE.z - 45]]]) {
      noT(wallLine(rt, pts, { team: 1, hp: 1e9, name: '惣構えの柵', segLen: 8, mesh: townFence, h: 2.45, sama: .5 }));
    }
    outerWall([[SOKAKU_X, WALL_Z], [SOKAKU_X, SOKAKU_N]]);
    outerWall([[-SOKAKU_X, SOKAKU_N], [SOKAKU_X, SOKAKU_N]]);
    // 木戸の両脇の堀岸を野面積みの石垣で固める（口から柵の端まで。塀の足もとを人の背ほどの石で。面は堀の側＝西）
    for (const [z0, z1] of [[GATE.z - 45, GATE.z - 4.5], [GATE.z + 4.5, GATE.z + 45]]) {
      ishigaki(W, [[GATE.x - 1.2, z0], [GATE.x - 1.2, z1]], { kind: 'nozura', top: 1.7, minH: 2.6, maxH: 4.2, noKit: true, batch: KB });
      ariStoneJoints(rt, GATE.x - 1.2, z0, z1);
      // 11/18 クラウド：撮った絵（300秒）で本人が木戸の北の石垣の中（面と柵の間 x=-400.4）に立ち、肩越しが真上から石垣を映した。
      //   石垣の面にも当たりの線を置き、堀の側から石の中へ入らせない（柵の線だけでは石の厚み一・二 m の内へ入れた）。
      const st = rt.army.addStruct({ seg: [GATE.x - 1.2, z0, GATE.x - 1.2, z1], nx: -1, nz: 0, hp: 1e9, maxHp: 1e9, team: 1, name: '木戸脇の石垣' });
      st.noTarget = true;
    }
    // 惣構えの外堀の外岸に、梢を寄せ手（西）へ向けた逆茂木。一年の籠城で城方が堀の外に植えた障害（配置と長さは推定）。
    // 土橋の口（幅九メートルと寄せの槍の列）と、岸の町屋の軒下は空ける。歩いて抜けられない線を一本ずつ置く。
    for (const [z0, z1] of [[9, 17.5], [24, 45], [-17.5, -9], [-45, -24]]) {
      const a = GATE.z + Math.min(z0, z1), b = GATE.z + Math.max(z0, z1), x = GATE.x - 10.6;
      for (let z = a + 2; z < b; z += 4) sakamogi(W, x, z, -Math.PI / 2, 4.2, KB);
      const s = rt.army.addStruct({ seg: [x - 1.8, a, x - 1.8, b], nx: -1, nz: 0, hp: 1e9, maxHp: 1e9, team: 1, name: '逆茂木' });
      s.noTarget = true;
    }
    // 惣構えの土塁：塀の外へ盛った土の斜面（見た目だけ。一つの形にまとめる。木戸の前は空ける）と、四隅の木造の物見、町の木戸（大通りの町境）
    {
      for (const [seg, nx, nz] of [[[-SOKAKU_X, WALL_Z, SOKAKU_X, WALL_Z], 0, 1], [[-SOKAKU_X, WALL_Z, -SOKAKU_X, GATE.z + 6], -1, 0], [[-SOKAKU_X, GATE.z - 6, -SOKAKU_X, SOKAKU_N], -1, 0], [[SOKAKU_X, WALL_Z, SOKAKU_X, SOKAKU_N], 1, 0], [[-SOKAKU_X, SOKAKU_N, SOKAKU_X, SOKAKU_N], 0, -1]]) {
        // 遠い土塁は二十メートルごとの法面でまとめる。口の六メートルは空ける。
        const [ax, az, bx, bz] = seg, n = Math.ceil(Math.hypot(bx - ax, bz - az) / 20);
        const pos = [], uv = [];
        for (let i = 0; i < n; i++) {
          const mx = ax + (bx - ax) * (i + .5) / n, mz = az + (bz - az) * (i + .5) / n;
          // 木戸から見える法面は長手と幅の両方を刻む。二十メートルの面で堀岸を覆わない。
          const near = Math.hypot(mx - GATE.x, mz - GATE.z) < 120;
          const along = near ? Math.ceil(Math.hypot(bx - ax, bz - az) / n / .75) : 1;
          const across = near ? 4 : 1;
          for (let a = 0; a < along; a++) for (let b = 0; b < across; b++) {
            const points = [];
            for (const [dt, u] of [[a / along, b / across], [(a + 1) / along, b / across],
              [(a + 1) / along, (b + 1) / across], [a / along, (b + 1) / across]]) {
              const t = (i + dt) / n;
              const x = ax + (bx - ax) * t + nx * u * 3, z = az + (bz - az) * t + nz * u * 3;
              points.push([x, W.heightAt(x, z) + .9 * (1 - u), z]);
            }
            for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...points[k]); uv.push(points[k][0] * .4, points[k][2] * .4); }
          }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        const joined = mergeVertices(g); joined.computeVertexNormals(); g.dispose(); farEarth.push(joined.toNonIndexed()); joined.dispose();
      }
      for (const [x, z] of [[-SOKAKU_X + 4, WALL_Z - 4], [SOKAKU_X - 4, WALL_Z - 4], [-SOKAKU_X + 4, SOKAKU_N + 4], [SOKAKU_X - 4, SOKAKU_N + 4]]) rt.scene.add(yagura(W, x, z));
      // 11/6 kaito 四5：町屋と侍町の境に塀の無い冠木門だけが立っていた。門だけを道の真ん中に置かない（境は町屋の並びで分かる）。
    }
    // 三砦（北＝岸の砦・西＝上臈塚砦・南＝鵯塚砦）。物見の櫓と旗で目印を置く（HIST_B）
    rt.scene.add(yagura(W, 10, KISHI_TORIDE.z + 10), nobori(W, KISHI_TORIDE.x + 4, KISHI_TORIDE.z + 3, 'maru', 6));
    rt.scene.add(yagura(W, JORO_TORIDE.x + 5, JORO_TORIDE.z - 12));
    F.joroFlag = nobori(W, JORO_TORIDE.x + 9, JORO_TORIDE.z - 14, 'maru', 6); rt.scene.add(F.joroFlag);
    F.joroOdaFlag = nobori(W, JORO_TORIDE.x + 9, JORO_TORIDE.z - 14, 'oda', 6); F.joroOdaFlag.visible = false; rt.scene.add(F.joroOdaFlag);
    // 三砦は木造の物見・板葺きの兵舎と蔵・土塁と柵を備える。寸法と建物は摂津の推定復元。
    // 遠い岸・鵯塚も材質ごとにまとめ、実際の兵は増やさない。
    {
      const db = makeSimpleBatch();
      // 上臈塚の閉じた南北面は乱杭と部分的な板覆い。東西の通り口は空ける。
      // 五角の丸太と削ぎ先を既存の木の束へ入れ、遠い砦の面は増やさない。
      const stake = new THREE.CylinderGeometry(.09, .12, 1, 5).toNonIndexed();
      const tip = new THREE.ConeGeometry(.09, .28, 5, 1, true).toNonIndexed();
      const tie = new THREE.CylinderGeometry(.18, .18, .045, 6, 1, true).toNonIndexed();
      // 既存の木材と同じ描画へ入れ、麻縄の淡い色だけ頂点色で分ける。
      const rope = new THREE.Color(0xa18d65), tieColors = new Float32Array(tie.attributes.position.count * 3);
      for (let i = 0; i < tieColors.length; i += 3) {
        tieColors[i] = rope.r / ARI_WOOD.color.r;
        tieColors[i + 1] = rope.g / ARI_WOOD.color.g;
        tieColors[i + 2] = rope.b / ARI_WOOD.color.b;
      }
      tie.setAttribute('color', new THREE.BufferAttribute(tieColors, 3));
      const stakeFence = (world, seg) => {
        const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az);
        const n = Math.ceil(len / .43), angle = Math.atan2(bx - ax, bz - az);
        const addBox = (px, py, pz, w, h, d) => {
          const g = ARI_BOX.toNonIndexed(); g.scale(w, h, d); g.rotateY(angle);
          g.translate(px, py, pz); farWood.push(g);
        };
        for (let i = 0; i <= n; i++) {
          const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          const y = world.heightAt(x, z), h = 2.35 + .18 * Math.sin(x * 7 + z * 3);
          const post = stake.clone(); post.scale(1, h + .25, 1);
          post.rotateZ(.025 * Math.sin(i * 5)); post.translate(x, y + (h - .25) / 2, z); farWood.push(post);
          const head = tip.clone(); head.translate(x - .025 * Math.sin(i * 5) * (h + .25) / 2, y + h + .14, z); farWood.push(head);
          // 支えの杭と二段の横木を二巻きの縄で結ぶ。遠い砦には足さない。
          if (i % 3 === 0) for (const railY of [1.05, 1.9]) for (const dy of [-.085, .085]) {
            const g = tie.clone(); g.translate(x, y + railY + dy, z); farWood.push(g);
          }
          // 所々に板楯を結び、杭の隙間と板覆いを交互に見せる。
          if (i % 9 === 4) addBox(x, y + 1.55, z, .1, 1.25, 1.05);
        }
        // 横木は短く切って両端を接地高へ合わせる。斜面に長い水平材を浮かせない。
        const rails = Math.ceil(len / 1.5);
        for (let i = 0; i < rails; i++) {
          const t = (i + .5) / rails, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          for (const h of [1.05, 1.9]) addBox(x, world.heightAt(x, z) + h, z, .15, .12, len / rails + .08);
        }
        return { isBatchedPart: true };
      };
      const edge = (a, b, nx, nz, stakes = false) => {
        const d = dorui(W, [...a, ...b], nx, nz, { batch: db, w: 1.8, h: .8, capEnds: true, closeBack: true });
        if (!d.isBatchedPart) rt.scene.add(d);
        noT(wallLine(rt, [a, b], { team: 1, hp: 1e9, name: '砦の柵', segLen: 6, mesh: stakes ? stakeFence : townFence, h: 2.45 }));
      };
      for (const t of TORIDE_WORKS) {
        const { x0, x1, z0, z1 } = t, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        for (const [z, nz, open] of [[z0, -1, t.side === 'north'], [z1, 1, t.side === 'south']]) {
          if (open) { edge([x0, z], [cx - 3.5, z], 0, nz); edge([cx + 3.5, z], [x1, z], 0, nz); }
          else edge([x0, z], [x1, z], 0, nz, t.id === 'joro');
        }
        for (const [x, nx] of [[x0, -1], [x1, 1]]) {
          // 渡櫓の脇の外階段も砦の内へ入る。戸の口と階段の幅を合わせて柵を空ける。
          if (t.side === 'cross') { edge([x, z0], [x, cz - 7], nx, 0); edge([x, cz + 7], [x, z1], nx, 0); }
          else edge([x, z0], [x, z1], nx, 0);
        }
        if (t.side !== 'cross') ariGate(rt, cx, t.side === 'north' ? z0 : z1, 7, 0, KB);
        // 上臈塚の道の両側、ほかの砦の町側に入口を向ける。
        const fortName = t.name;
        const inside = { team: 1, tile: false, naka: true, noTarget: true, profile: 'arioka', fieldFort: true, earth: 0x947b55, doorX: 0, oku: 0 };
        goten(rt, t.id === 'joro' ? x1 - 7 : cx - 7, t.id === 'joro' ? cz + 12 : cz + 1,
          { ...inside, w: 10, d: 4, kind: 'nagaya', name: `${fortName}の兵舎`, door: t.id === 'joro' || t.side === 'north' ? -1 : 1 });
        goten(rt, t.id === 'joro' ? x1 - 7 : cx + 7, t.id === 'joro' ? cz - 12 : t.id === 'kishi' ? cz + 5 : cz - 4,
          { ...inside, w: 4, d: 3, kind: 'kura', name: `${fortName}の武具蔵`, door: t.side === 'north' ? -1 : 1 });
        if (true) ariWorks(rt, x0 + 5,
          t.id === 'joro' ? z1 - 5 : z0 + 4, t.id === 'joro' ? Math.PI / 2 : 0);
      }
      stake.dispose(); tip.dispose(); tie.dispose();
      rt.scene.add(yagura(W, 9, WALL_Z - 11));
      finalizeSimpleBatch(rt, db);
    }
    yield;   // K112：ここで一コマ返す（組み立ての固まりを分ける）
    // ---- 城下の町屋（惣構えの内）と本丸の脇の牢 ----
    // 南寄り（木戸に近い）が町屋、北寄り（本丸に近い）が侍町。道は細く、家は密集させる（GAME_C）
    // 城下に松明（敵の居所が見える。主郭の館からも城下の灯が見える。B079・B080）
    for (const [x, z] of [[TOWN_X - 14, -12], [TOWN_X + 14, -14], [TOWN_X - 30, -44], [TOWN_X + 30, -46], [TOWN_X, -58], [ROU.x - 5, ROU.z + 4], [HON_E - 3, HON_Z - 3], [TENSHU_POS.x, TENSHU_POS.z + 4]]) W.addFire(x, z, { torch: true, h: 1.6 });
    const housePool = new Map();
    // K564 読み込み：同じ寸法の板屋根は三通りだけ作り、四軒目からは借りる（hut の roofShare。出る形は ariMergeShare の分け合いと同じ）。
    const roofShare = new Map();
    F.houses = [
      // 斜めの町筋と北の通りを塞がないよう、五軒目は道の西側へ寄せる。
      [-24, -6, 0.1], [22, -2, -0.2], [-36, -34, 0.2], [28, -38, 0], [-18, -52, 0.1], [40, -66, 0.2],
      [-48, -16, 0.15], [36, -20, -0.1], [-18, -40, 0.1], [50, -50, 0.2], [-44, -62, -0.15],
      [-10, -10, Math.PI / 2], [14, -10, -Math.PI / 2], [-10, -26, Math.PI / 2], [14, -26, -Math.PI / 2],
      // 後詰が通る角（TOWN_X - 12, -70）に町屋を重ねず、西の道端へ寄せる。
      [-22, GATE.z + 38, Math.PI / 2], [12, GATE.z + 38, -Math.PI / 2],
    ].map(([dx, z, r], i) => {
      const x = TOWN_X + dx;
      // 写真の低い板葺きの町並みへ寄せる。町屋三軒の通り庭と奥の間は保つ。
      const open = i < 3;
      const boardRoof = true;
      const solidStart = SOLIDS.length;
      const interior = open ? goten(rt, x, z, { w: 7, d: 5, rot: r, team: 1, tile: false, naka: true, noTarget: true, kind: 'machiya', profile: 'arioka', earth: 0x947b55, name: '町屋', doorX: 0 }) : null;
      const m = interior ? interior.mesh
        : hut(W, x, z, 7, 5, r, { ita: boardRoof, boardRoof, weatheredBoards: boardRoof, groundedHome: true, solid: !boardRoof, wall: i % 2 ? 0x6e5a40 : 0x7b6448, roofShare });
      // 板屋根でも民家の印と従来の当たりを保ち、里の者の置き場を減らさない。
      if (!open && boardRoof) solidRect(x, z, 7.18, 5.18, r).civilianSite = 'home';
      // 11/22 クラウド 有岡の持ち主（K564 記憶）：町屋の壁・屋根の形は面ごとに頂点を持つ（索引無し）。同じ位置・向き・色の頂点を一つにまとめ索引で引く（形と見た目は同じ・頂点が約三分の一減る）。
      if (!open) { F.ariSharedVerts = (F.ariSharedVerts || 0) + ariMergeShare(m, housePool, i); rt.scene.add(m); }
      const house = { x, z, m, boardRoof, room: interior?.naka, samurai: z <= -46,
        solids: open ? null : SOLIDS.slice(solidStart) };
      // 準備時に数値だけを用意する。戸と歩く当たりは変えない。
      const base = interior ? interior.naka.levels[0].y - .55 : m.position.y;
      F.ariCameraHouses.push({ house, x, z, y: base, c: Math.cos(r), s: Math.sin(r),
        half: 3.72, depth: 2.72, bottom: 0, top: 3 });
      // 壁より張り出す軒も準備時に登録する。地上の通り道は塞がない。
      F.ariCameraHouses.push({ house, x, z, y: base, c: Math.cos(r), s: Math.sin(r),
        half: 5, depth: 4, bottom: 2.9, top: 5 });
      if (!open) house.walls = ariHouseWalls(house);
      house.ruin = ariHouseRuin(rt, house);
      return house;
    });
    // 戦う辻と木戸の横道は空け、東の空き地に低い町屋の軒並みを補う。
    // 戸数と町割りは推定。燃える家・射手・住民の道は動かさず、準備時に材質で束ねる。
    const townBatch = makeSimpleBatch();
    yield;   // K626：重い段をさらに割る（描く支度はここで一コマ返す）
    for (const dx of [74, 92, 110]) for (const z of [-30, -10, 10, 30]) {
      hut(W, TOWN_X + dx, z, 7, 5, Math.PI / 2, {
        ita: true, boardRoof: true,
        // K564：侍町の家と同じ決まり（K455）。戦う辻・木戸から二十五m より遠い家は、板の葺き重ねの段の刻みだけを省く（板の並びと色は同じ）。
        weatheredBoards: Math.min(...[[GATE.x, GATE.z], [TOWN_X - 24, GATE.z], [TOWN_X - 12, -70], [TOWN_X, -14]].map(([fx, fz]) => Math.hypot(TOWN_X + dx - fx, z - fz))) <= 25,
        batch: townBatch, wall: 0x78654c,
      });
      ariStreetHouseSight(rt, TOWN_X + dx, z, Math.PI / 2);
    }
    finalizeSimpleBatch(rt, townBatch);
    ariStreetHouses(rt, W);
    yield;   // K626：重い段をさらに割る（描く支度はここで一コマ返す）
    noT(wallLine(rt, [[TOWN_X + 8, -22], [TOWN_X + 8, -6]],
      { team: 1, hp: 1e9, name: '町屋の柵', mesh: townFence, h: 2.45, sama: .5 }));
    // 清洲の裏方小屋のように、居所とは屋根と開口を分ける。寸法・床・戸口は保つ。
    // 高画質では既存の砦用の作りを使い、低い切妻板葺きと縦板・小さな連子窓へ替える。
    // 北の柵と重ねず、長屋の裏にも歩ける庭を残す。
    goten(rt, HON_W + 5, HON_N + 14, { w: 7, d: 4, team: 1, tile: false, naka: true, noTarget: true, kind: 'nagaya', profile: 'arioka', fieldFort: true, earth: 0x947b55, name: '主郭の長屋', oku: 0 });
    rt.scene.add(yagura(W, HON_E - 3, HON_Z - 4));
    // 本丸：台地の縁に野面積みの石垣（牢へ上る道は空ける）と、石垣の上に館
    for (const [a, b] of HON_ISHIGAKI_SEGS) {
      // 野面積の腰だけを描く。高い石垣の素材への差し替えも行わない。
      ishigaki(W, [a, b], { kind: 'nozura', top: 0.1, minH: 1.2, maxH: 2.2, noKit: true, batch: KB });
      noT(wallLine(rt, [a, b], { team: 1, hp: 1e9, name: '主郭の板塀', segLen: 24, mesh: farFence, h: 2.4 }));
    }
    yield;   // K626：重い段をさらに割る（描く支度はここで一コマ返す）
    ariGate(rt, HON_ENTRY_X, HON_Z, HON_GAP[1] - HON_GAP[0], 0, KB);
    // 本丸の水堀（石垣の手前・町側。道の口＝HON_GAP はそのまま地続きで、水に入らず上がれる）
    for (const pts of HON_MOAT_SEGS) water(pts, HON_MOAT);
    // 本丸の西の堀（南面と同じ幅・深さ）
    for (const pts of HON_W_MOAT_SEGS) water(pts, HON_W_MOAT);
    // 十月の攻めでは本丸は持ちこたえる。館を作るだけで開城や救出の筋は進めない。
    goten(rt, TENSHU_POS.x, TENSHU_POS.z, { w: 8, d: 5, team: 1, tile: false, naka: true, noTarget: true, profile: 'arioka', earth: 0x947b55, name: '本丸の館' });
    // 天主：2022 年の復元画（千田嘉博監修）に従い、主郭の北西（野面積みの石垣の出た高み）に古い型の三重の望楼型。寸法は推定
    try { rt.scene.add(tenshu(W, HON_W + 20, HON_N + 20, { floors: 3, b: 9, base: 3, borou: true, old: true, stone: 'nozura', team: 1, name: '有岡城の天主', where: '主郭の天主', profile: 'arioka' })); } catch (e) { console.warn(e); }
    noT(wallLine(rt, [[HON_W + 2, HON_N + 1], [HON_E - 2, HON_N + 1]], { team: 1, hp: 1e9, name: '本丸の北の柵', segLen: 24, mesh: farFence }));
    for (const [parts, mat] of [[farWood, ARI_WOOD], [farEarth, ARI_EARTH]]) {
      let material = mat;
      if (parts === farWood && true) {
        // 板塀の色を一つの描画へまとめる。杭・横木・乱杭は元の木色を保つ。
        for (const part of parts) if (!part.hasAttribute('color')) {
          const colors = new Float32Array(part.attributes.position.count * 3); colors.fill(1);
          part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        material = mat.clone(); material.vertexColors = true;
      }
      // K564：遠い板塀と土塁は箱の頂点が六つずつ重なる索引の無い形（有岡の場面で一番大きな一つの形・16万頂点）。
      // 同じ頂点を一つにまとめて索引付きに（描く三角と見た目は同じ）。
      const merged = mergeGeometries(parts), g = mergeVertices(merged); if (g !== merged) merged.dispose();
      const mesh = new THREE.Mesh(g, material); mesh.receiveShadow = true; rt.scene.add(mesh);
      mesh.userData.camNear = true;
      for (const part of parts) part.dispose();
      parts.length = 0;   // 11/27 クラウド29（K564）：まとめた後の部品の形を手放す（farFence の閉包が残ると配列ごと生き、有岡で形が六千余り残っていた。見た目は同じ）
    }
    yield;   // K626：重い段をさらに割る（描く支度はここで一コマ返す）
    finalizeSimpleBatch(rt, PB);
    finalizeKitBatch(rt, KB);   // 塀・櫓門・隅櫓・石垣・多聞をまとめて描く
    // 岸の砦の控えは備えの表から、牢への道を空けて置く。
    // 本丸の石垣の上の軽い作りの城兵は置かない（11/5：動かない作り物の兵。本丸の守りは本物の旗本だけ）。
    F.rou = hut(W, ROU.x, ROU.z, 4, 3.4, 0.3, { ita: true, boardRoof: true, weatheredBoards: true, h: 1.8, wall: 0x3a3228 });
    yield;   // K626：重い段をさらに割る（描く支度はここで一コマ返す）
    rt.scene.add(F.rou);
    for (const [x, z] of [[-10, WALL_Z - 6], [10, WALL_Z - 6], [HON_W + 2, HON_CENTER_Z], [HON_E - 2, HON_CENTER_Z]]) rt.scene.add(nobori(W, x, z, 'maru', 6));
    // 主郭の番所・蔵と侍屋敷。入れる建物は既存の室内の作り（購入した和の部屋）へ結ぶ。
    // 牢は十月の任務では開けない。建物の配置と葺き材は推定。
    // 番所と武具蔵も長屋と同じ板葺き。御殿の厚い入母屋・大きな明かり障子を付けない。
    // 既存の材質別の結合と室内を使い、館・侍屋敷や他の戦の御殿には適用しない。
    // 南の土塀から外階段の下まで離し、戸口へ向かう庭を残す。
    goten(rt, HON_W + 3.5, HON_Z - 8, { w: 4.5, d: 3.5, team: 1, tile: false, naka: true, noTarget: true, kind: 'bansho', profile: 'arioka', fieldFort: true, earth: 0x947b55, name: '主郭の番所', doorX: 0, oku: 0 });
    goten(rt, HON_E - 4, HON_CENTER_Z + 2, { w: 4, d: 3, team: 1, tile: false, naka: true, noTarget: true, profile: 'arioka', fieldFort: true, earth: 0x947b55, name: '主郭の武具蔵', kind: 'kura', doorX: 0, oku: 0 });
    yield;   // K626：重い段をさらに割る（描く支度はここで一コマ返す）
    goten(rt, TOWN_X - 18, -166, { w: 9, d: 6, team: 1, tile: false, naka: true, noTarget: true, profile: 'arioka', earth: 0x947b55, name: '侍町の屋敷', doorX: 0 });
    ariYashiki(rt, TOWN_X - 18, -166);
    // 荒村寺跡の庭園が見つかった地域。堂と庭の細かな姿・位置は推定として復元。
    goten(rt, 8, HON_N - 13, { w: 9, d: 7, team: 1, tile: false, naka: true, noTarget: true, kind: 'temple', profile: 'arioka', earth: 0x947b55, name: '城内の寺', doorX: 0, oku: 0 });
    {
      const db = makeSimpleBatch();
      // 町の北の長屋と板葺きの倉。寺への道と南北の大通りを空ける。
      for (const [x, z, w, d] of [[-32, -184, 12, 4], [30, -174, 12, 4], [32, -202, 7, 4]]) ariNagaya(rt, TOWN_X + x, z, w, d, db);
      // 猪名川へ下る平地の村。川と田の両側に寄せて置く。
      for (const [x, z] of [[94, -211], [109, -212], [120, -8], [101, 3]]) hut(W, SOKAKU_X + x - 60, z, 6, 4, .1, { batch: db });
      finalizeSimpleBatch(rt, db);
    }
    // 石段・土橋の表面・井戸・庭石は一度だけ作り、材質ごとに一つにまとめる。
    {
      const stone = [], earth = [], wood = [];
      // 庭石は頂点番号を持たないため、石段と土橋も同じ形にそろえてまとめる。
      const box = (list, x, y, z, w, h, d) => { const g = ARI_BOX.toNonIndexed(); g.scale(w, h, d); g.translate(x, y, z); list.push(g); };
      const x0 = SOTO_BRIDGE.a[0], x1 = SOTO_BRIDGE.b[0], halfW = SOTO_BRIDGE.w / 2;
      // 土橋の上は踏み固めた土。歩く床と同じ高さで、板の継ぎ目を残さない。
      box(earth, (x0 + x1) / 2, bridgeY - .055, GATE.z, x1 - x0, .11, SOTO_BRIDGE.w);
      {
        const g = earth[earth.length - 1], pos = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * .4, pos.getZ(i) * .4);
      }
      // 芯を堀底まで埋め、両縁は幅のある土の斜面で岸へつなぐ。通る幅と当たりは保つ。
      const skirt = [], skirtUV = [];
      for (let x = x0; x < x1; x += 1) {
        const end = Math.min(x1, x + 1);
        const bottom = Math.min(W.heightAt(x, GATE.z), W.heightAt(end, GATE.z), bridgeY - 2.6) - .1;
        box(earth, (x + end) / 2, (bridgeY - .11 + bottom) / 2, GATE.z,
          end - x, bridgeY - .11 - bottom, SOTO_BRIDGE.w);
        for (const side of [-1, 1]) for (let across = 0; across < 4; across++) {
          const points = [];
          for (const [px, outer] of [[x, across / 4], [x, (across + 1) / 4], [end, across / 4], [end, (across + 1) / 4]]) {
            const z = GATE.z + side * (halfW + outer * (2.2 + .12 * Math.sin(px * 2)));
            const bankZ = GATE.z + side * (halfW + 2.2 + .12 * Math.sin(px * 2));
            const bankY = Math.min(bridgeY - .12, W.heightAt(px, bankZ) + .01);
            points.push([px, bridgeY + (bankY - bridgeY) * outer, z]);
          }
          // 両岸とも上向き。逆向きの法線を混ぜて斜面を黒い三角面にしない。
          for (const k of side > 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3]) {
            skirt.push(...points[k]); skirtUV.push(points[k][0] * .4, points[k][2] * .4);
          }
        }
      }
      const slope = new THREE.BufferGeometry(); slope.setAttribute('position', new THREE.Float32BufferAttribute(skirt, 3));
      slope.setAttribute('uv', new THREE.Float32BufferAttribute(skirtUV, 2));
      const smoothSlope = mergeVertices(slope); smoothSlope.computeVertexNormals();
      earth.push(smoothSlope.toNonIndexed()); smoothSlope.dispose(); slope.dispose();
      const post = new THREE.CylinderGeometry(.075, .09, .72, 10).toNonIndexed();
      const tip = new THREE.ConeGeometry(.075, .18, 10).toNonIndexed();
      for (const side of [-1, 1]) for (let x = x0 + .6; x < x1; x += 2.5) {
        const z = GATE.z + side * (halfW + .08);
        const base = Math.max(bridgeY - .65, W.heightAt(x, z) - .12);
        const g = post.clone(); g.translate(x, base + .36, z); wood.push(g);
        const top = tip.clone(); top.translate(x, base + .81, z); wood.push(top);
        const mound = ARI_ROCK.clone(); mound.scale(.22, .10, .20);
        mound.translate(x, base + .04, z); earth.push(mound);
      }
      post.dispose(); tip.dispose();
      // 小石は水際の地形へ半分埋め、三角の岸の輪郭を細かな凹凸にする。
      for (const side of [-1, 1]) for (let i = 0; i < 12; i++) {
        const x = GATE.x - 10 + (i % 4) * 3.3, z = GATE.z + side * (5 + Math.floor(i / 4) * 2.4 + .3 * Math.sin(i));
        if (Math.abs(x - (GATE.x - 5)) < 3.4) continue;
        const g = ARI_ROCK.clone(); g.scale(.38, .24, .3);
        g.translate(x, W.heightAt(x, z) + .06, z); stone.push(g);
      }
      for (let i = 0; i < HON_APPROACH_Z - HON_Z + 6; i++) {
        const az = HON_APPROACH_Z - i, bz = az - 1;
        const ya = W.heightAt(HON_ENTRY_X, az) + .06, yb = W.heightAt(HON_ENTRY_X, bz) + .06;
        // 11/16 iMac n-look-face K289：段の上面を道の芯の高さの平均に置くと、段の間と両脇で地面の三角が上へ突き出て、
        //   黒い段の帯に明るい菱形が並んで見えた。段の上面は両脇も含めた一番高い地面に合わせる（段の数と当たりは同じ）
        let top = Math.max(ya, yb);
        for (const dx of [-3, 3]) for (const zz of [az, bz, (az + bz) / 2]) top = Math.max(top, W.heightAt(HON_ENTRY_X + dx, zz) + .04);
        box(stone, HON_ENTRY_X, top - .12, (az + bz) / 2, 6, .24, 1);
        addRamp({ ax: HON_ENTRY_X, az, bx: HON_ENTRY_X, bz, w: 6, ya, yb, step: .25 });
      }
      const wx = HON_X + 1, wz = HON_CENTER_Z + 4, wy = W.heightAt(wx, wz);
      // 木枠の井戸は中央を空け、井桁の上は入れない。足の当たりも井桁と同じ大きさ。
      for (const q of [-1, 1]) {
        box(wood, wx + q * .65, wy + .38, wz, .18, .76, 1.5);
        box(wood, wx, wy + .38, wz + q * .65, 1.5, .76, .18);
        box(wood, wx + q * .75, wy + 1.1, wz, .12, 2.2, .12);
      }
      box(wood, wx, wy + 2.2, wz, 1.7, .16, .16);
      box(earth, wx, wy + .03, wz, 1.1, .06, 1.1);
      solidCircle(wx, wz, .85);
      for (const [x, z, w] of [[15, HON_N - 20, 1.2], [18, HON_N - 16, .9], [14, HON_N - 23, .7]]) {
        const g = ARI_ROCK.clone(); g.scale(w, w * .6, w * .8); g.translate(x, W.heightAt(x, z) + w * .2, z); stone.push(g); solidCircle(x, z, w * .6);
      }
      for (const [parts, mat] of [[stone, ARI_STONE], [earth, ARI_EARTH], [wood, ARI_WOOD]]) {
        const g = mergeGeometries(parts), mesh = new THREE.Mesh(g, mat);
        // 土橋の薄い床自身の影を地面へ重ねない。歩く床と厚みは保つ。
        mesh.receiveShadow = true; mesh.castShadow = mat !== ARI_EARTH; rt.scene.add(mesh);
        for (const part of parts) part.dispose();
      }
    }
    yield;   // K112：ここで一コマ返す（組み立ての固まりを分ける）
    // ---- 滝川一益の手（自分の持ち場）と先手の一組 ----
    F.taki = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川一益の手', anchor: { x: GATE.x - 20, z: GATE.z }, facing: Math.PI / 2, width: 14, aggro: 10, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }], TAKIGAWA));
    // 木戸の前後で十人幅へ広がらず、三段の槍列を保つ。
    F.taki.yariRanks = 3;
    F.takiU = F.taki.units[0];
    // 先手と射手は木戸への道（z±7）の上、滝川の手の後ろに置く。道の脇の置楯の列（GATE.x-27・-33）の裏に置くと、木戸へ向かう一歩目で楯の当たりに入り、出られず止まった（11/13 わ・act bot で20秒止まり45回）。
    F.kuri = allyGroup(rt, { fixed: true, fullStrength: true, formation: 'yari', name: '滝川の先手', anchor: { x: GATE.x - 29, z: GATE.z + 4 }, facing: Math.PI / 2, width: 6, aggro: 10, },
      dress([{ type: 'samurai', n: 1, o: { name: '滝川の組頭', hat: 'kabuto_m', haori: 0x2a2a2a } }, { type: 'ashigaru', n: 5 }], TAKIGAWA));
    F.kuriU = F.kuri.units[0];
    // 既存の侍一人を内応将に替える。開門前は城内の口で待ち、開門後は先手に合流する（細かな位置は復元）。
    F.naka = allyGroup(rt, { fixed: true, fullStrength: true, name: '上臈塚の内応将', anchor: { x: GATE.x + 5, z: GATE.z + 4 }, facing: -Math.PI / 2, width: 1, aggro: 0, order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '中西新八郎', flag: null } }]);
    F.tgun = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の射手', anchor: { x: GATE.x - 29, z: GATE.z - 4 }, facing: Math.PI / 2, formation: 'line', width: 6, aggro: 10 }, dress([{ type: 'gun', n: 4 }], TAKIGAWA));
    F.oda = [F.taki, F.kuri, F.tgun, F.naka];
    for (const g of F.oda) g.noAI = true;
    for (const g of F.oda) { g.defMult = 1; g.dmgMult = 1; g.noRout = false; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: GATE.x - 46, z: GATE.z }, Math.PI / 2, [{ kind: 'spear', n }]);
    // ---- 竹束の寄せ（taketaba.js）：合図を待つ間に、滝川の手が竹束を押し立て、ゆっくり木戸の前まで寄せる ----
    patchGunCover(rt);
    F.TA = makeTabaAdvance(rt, { max: 2, items: [{ g: F.taki, yose: { x: GATE.x - 12, z: GATE.z }, until: () => F.step >= 1 }], avoid: [this.spawn, { x: GATE.x - 30, z: GATE.z + 5 }] });
    for (const tb of F.tabas || []) {
      // 資料の据え竹束と同じ叉木・横木で支える。既存の形を全束で共有する。
      // 遠景にも支えを残し、正面から杭だけが宙に並んで見えるのを抑える。
      if (tb.m.isLOD) for (let i = 0; i < tb.m.levels.length; i++) {
        tb.m.levels[i].object.geometry = tabaGeo(false, true, false, i === 0, true);
        tb.m.levels[i].object.receiveShadow = true;
      }
      else { tb.m.geometry = tabaGeo(false, true, false, true, true); tb.m.receiveShadow = true; }
      // 寄せる竹束を静止景物へ結合せず、押す位置と見た目をそろえる。
      tb.m.userData.noFreeze = true;
      tb.ariCamera = ariTabaCamera(tb);
      // 竹の頂点色へ角材の暗い木目を掛けると、月夜には黒い杭になる。
      // 有岡の束だけ木目を外す。近景・遠景は同じ材質を共有し、形と弾よけは保つ。
      const near = tb.m.isLOD ? tb.m.levels[0].object : tb.m;
      if (!ariTabaMat) { ariTabaMat = near.material.clone(); ariTabaMat.map = null; }
      if (tb.m.isLOD) for (const level of tb.m.levels) level.object.material = ariTabaMat;
      else tb.m.material = ariTabaMat;
    }
    rt.after(3, () => { if (F.step === 0) { F.taki.order = 'move'; F.taki.dest = { x: GATE.x - 12, z: GATE.z }; F.taki.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: GATE.x - 12, z: GATE.z }; }; } });
    // 先手は本人の踏み込みを待たず、合図で進む。
    // 縄張り（castle_plan.js）：壁は今まで通り手組み（skipWalls）。惣構えの内を町屋・侍町・主郭の場に分け、
    // siege_zones.js の区域で、取った所から次が開く流れとして持つ（HUD・任務の進み具合に使う）
    F.C = yield* buildCastlePlanSteps(rt, ARIOKA_BATTLE_PLAN, { ladders: false, baseHeight: height, edgeW: 3, skipWalls: ['hiyodori', 'kishi', 'joro', 'machiya', 'samuraimachi', 'honmaru'] });
    // 三砦の区域を実際の囲いへ合わせる。西の上臈塚だけが内応で移る。
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'hiyodori', name: '鵯塚砦', test: F.C.kuruwa.hiyodori.test, pos: F.C.kuruwa.hiyodori.centroid, need: 999, hold: 999 },
        { id: 'kishi', name: '岸の砦', test: F.C.kuruwa.kishi.test, pos: F.C.kuruwa.kishi.centroid, need: 999, hold: 999 },
        { id: 'joro', name: '上臈塚砦', test: F.C.kuruwa.joro.test, pos: F.C.kuruwa.joro.centroid, need: 4, hold: 8 },
        { id: 'machiya', name: '町屋', test: F.C.kuruwa.machiya.test, pos: F.C.kuruwa.machiya.centroid, need: 6, hold: 10 },
        { id: 'samuraimachi', name: '侍町', test: F.C.kuruwa.samuraimachi.test, pos: F.C.kuruwa.samuraimachi.centroid, need: 6, hold: 10 },
        { id: 'honmaru', name: '主郭', test: F.C.kuruwa.honmaru.test, pos: F.C.kuruwa.honmaru.centroid, need: 999, hold: 999 },
      ],
      links: [['hiyodori', 'machiya'], ['kishi', 'machiya'], ['joro', 'machiya'], ['machiya', 'samuraimachi'], ['samuraimachi', 'honmaru']],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
    });
    // ---- 縄張りの今の様子（nawabari.js・束19）：曲輪・門・堀・道の数の表。読むだけで、戦の動きは変えない ----
    // 門の実体を置いた後で、縄張りの状態へ結ぶ。
    // 遠くの砦の占領状態を常時知らせない。岸の撤退はこの任務で時限処理しない。

    yield;   // K112：ここで一コマ返す（組み立ての固まりを分ける）
    // ---- 陣と大軍（軽い作り） ----
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 6, 0.3, 6));
    ariWorks(rt, CAMP.x - 14, CAMP.z - 2, Math.PI / 2);
    ariCookCamp(rt);
    ariSiegeFront(rt);
    for (const [x, z, k] of [[CAMP.x - 14, CAMP.z - 10, 'oda'], [CAMP.x + 20, CAMP.z - 10, 'oda'], [CAMP.x - 30, GATE.z + 40, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // 織田の本陣（この口の攻め手 滝川一益）と、本丸の城将 荒木久左衛門の陣所（村重は尼崎へ移っている）
    F.honjin = camp(rt, { x: CAMP.x, z: CAMP.z + 4, facing: Math.PI, team: 0, faction: 'oda', mon: 'takigawa', noUma: true, general: { name: '滝川一益' }, guard: 25, reserve: 0, runTo: { x: GATE.x - 20, z: GATE.z } });
    // 主郭の狭い庭へ十六メートルの陣幕を重ねず、館の城将と庭の旗本に分ける。人数は従来のまま。
    const castleLord = enemyGroup(rt, { fixed: true, faction: 'araki', name: '荒木久左衛門の本陣', anchor: { x: TENSHU_POS.x, z: TENSHU_POS.z + 1 }, width: 1, facing: 0, aggro: 4, morale: 100, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '荒木久左衛門', invuln: true, horse: true } }], ARAKI));
    const castleGuard = enemyGroup(rt, { fixed: true, faction: 'araki', name: '主郭の旗本', anchor: { x: HON_X, z: HON_Z - 5 }, width: 6, facing: 0, aggro: 14, morale: 100, formation: 'line' },
      dress([{ type: 'samurai', n: 6 }, { type: 'ashigaru', n: 5 }, { type: 'gun', n: 4 }], ARAKI));
    castleLord.noAI = true; castleGuard.noAI = true;
    // 11/17 ヲ三：共通の「かかれ」が主郭の旗本へ attack を出し、庭の持ち場 (267,-23) に10人が重なって止まった（act 1回・491秒）→ 本陣の旗本と同じ印で持ち場を空けない
    castleGuard.campGuard = true; castleLord.campGuard = true;
    F.honjin.guard.noAI = true;
    if (F.honjin.general) F.honjin.general.group.noAI = true;
    // 11/22 クラウド 有岡の持ち主（act bot 101秒★★：滝川一益の本陣の足軽が幕の中心 (-445,-126) で一点に重なって止まった）：
    //   本陣の組は大将一人の座（幅1）のまま足軽十一人を持ち、一列の縦隊で陣幕の内へ詰まった。幅を旗本と同じ並びにして、横に並べる（兵の数はそのまま）
    if (F.honjin.general) F.honjin.general.group.width = 6;
    // 11/17 ヲ三：滝川には旗本25人が付く。共通の供回り（lord_retinue）が本陣の一人座へ侍8人を足すと、幕の中心 (-435,-123) で5人が20秒重なった（act 4回に1回）→ 足さない
    if (F.honjin.general) F.honjin.general.noRetinue = true;
    // 11/28 クラウド 有岡の持ち主（K582・act bot 1119 の116秒 ★★）：本陣の組（大将一人の座）へ 43〜112秒に足軽・侍・鉄砲が十人入り、幕の中 (-441,-131) で八人が重なった。
    //   入れ方が av_host.js の『本陣を厚くする本物の兵』（侍五割・足軽三割・鉄砲二割）と同じ。滝川の兵は旗本二十五人で足りるので、本陣の組へは足させない（後ろの軽い段はそのまま）。
    if (F.honjin.general) F.honjin.general.group._avReal = true;
    F.ehon = { general: castleLord.units[0], guard: castleGuard, pos: { x: TENSHU_POS.x, z: TENSHU_POS.z } };
    // 囲みと三砦の備えは布陣図にだけ載せる。動かない軽い作りの軍勢は戦場に置かない（11/5：遠景が作り物）。
    F.jinHosts = [];
    prepareDefenders(rt);
    // 柵の内に立て並べた荒木の丸の幟。木戸の内の城兵は本物の組（prepareDefenders）だけで見せる
    // （11/5：近づくと消える軽い作りの群れと、塀の上に浮かせた作り物の城兵を外した）。
    for (const side of [-1, 1]) for (const dz of [5.6, 9.8, 14.5, 20]) rt.scene.add(nobori(W, GATE.x + 4.5 + (dz % 3), GATE.z + side * dz, 'maru', 6.5));
    F.hongate = rt.army.addStruct({ seg: [HON_GAP[0], HON_Z, HON_GAP[1], HON_Z], nx: 0, nz: 1, hp: 1e9, team: 1, name: '主郭の閉じた木戸' });
    F.hongate.noTarget = true;
    // 開門で当たりを外しても、扉は壊れていない。縄張りには「開く」と伝える。
    F.gateStatus = { struct: { hp: 1e9, maxHp: 1e9, alive: true }, get opened() { return F.step >= 1; } };
    F.K = makeNawabari(rt, F.C, { SZ: F.SZ, team: 1, friendTeam: 0, gates: { gate: F.gateStatus, hongap: F.hongate } }); rt.nawabari = F.K;
    F.honDoor = tobira(W, HON_ENTRY_X, HON_Z, HON_GAP[1] - HON_GAP[0], 0);
    rt.scene.add(F.honDoor);
    F.aid = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の後詰', anchor: { x: CAMP.x - 14, z: GATE.z }, facing: Math.PI / 2, order: 'hold', width: 10, formation: 'yari', aggro: 8 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], TAKIGAWA));
    // 二組の後詰は初めから陣に置き、段ごとに道を歩かせる。倒れた兵は戻さない。
    // 身分で増える組の兵も含め、後から来る供の余地を残して二百五十人以内にする。
    const soldiers = rt.army.units.reduce((n, u) => n + (!u.isStruct && u.type !== 'dummy' && u.type !== 'porter' ? 1 : 0), 0);
    // 陣にいない将（信長・秀吉・光秀と名簿の四将）を外して空いた分を、滝川の控えに回す（一組十二まで）。
    const reserveSize = Math.min(12, Math.max(0, Math.floor((244 - soldiers) / 2)));
    F.reserves = reserveSize ? [0, 1].map((i) => allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の控え',
      anchor: { x: CAMP.x - 24 - i * 8, z: GATE.z + 10 }, facing: Math.PI / 2,
      order: 'hold', width: 6, formation: 'yari', aggro: 8 }, dress([{ type: 'ashigaru', n: reserveSize }], TAKIGAWA))) : [];
    for (const g of F.reserves) g.noAI = true;
    // 辻へ向かう道の先、二十〜五十メートルに、押し合う槍の組を置く（遊び始めて二分の画面に斬り合いが写る。木戸の先で別手の織田勢が荒木勢と組み合う）。
    // 辻の持ち場から離し、勝ち負けの数えと本人の道筋には入れない。崩れず、時間を持たせる。
    {
      const mel = (g) => { g.noRout = true; g.noAI = true; g.fire = false; g.morale = 100; g.dmgMult = .2; g.ariDecor = true; return g; };   // ariDecor：辻の確保の数え（ariStage）に入れない
      for (const [k, mx, mz] of [[0, TOWN_X - 12, -44], [1, TOWN_X + 11, -46]]) {
        mel(allyGroup(rt, { fixed: true, fullStrength: true, name: '別手の織田勢' + k, anchor: { x: mx, z: mz - 2.2 }, facing: 0, order: 'hold', width: 10, formation: 'yari', aggro: 9, morale: 100 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }], TAKIGAWA)));
        mel(enemyGroup(rt, { fixed: true, faction: 'araki', name: '町で組み合う荒木勢' + k, anchor: { x: mx, z: mz + 2.2 }, facing: Math.PI, order: 'hold', width: 10, formation: 'yari', aggro: 9, morale: 100, fleeDir: { x: 0, z: 1 } }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }], ARAKI)));
        rt.scene.add(kagaribi(W, mx + 6, mz - 5)); W.addFire(mx + 6, mz - 5, { h: 1.3, size: .7, lightRadius: 18 });
      }
    }
    // 惣構えの前の織田の仕寄せの篝火（動かない軽い作りの列は 11/5 に外した）：夜の土塁を前に、行く先の明かり
    for (const x of [-26, -12, 14, 28]) { const z = WALL_Z + 12; rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
    for (const [x, z] of [[CAMP.x - 30, GATE.z + 35], [CAMP.x + 20, GATE.z + 39], [CAMP.x, GATE.z + 45]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    for (const [x, z] of [[-12, WALL_Z - 3], [12, WALL_Z - 3]]) W.addFire(x, z, { torch: true, h: 1.5 });
    // 11/18 クラウド35（K365 城の見た目）：持ち場から、夜の主郭（天主・館）と岸・上臈塚・鵯塚の砦の火が見えず、囲んだ城の奥が黒いだけだった。
    //   主郭の天主・館・番所・櫓と三つの砦に、遠くでも見える小さな橙の火の点を置く（props.js の farFireDots・光源は増やさない）
    { const far = [[247, -165], [255, -178], [317, -104], [308, -112], [231, -36], [394, -34], [393, -98], [-7, -946], [10, -950], [-384, -104], [-392, -124], [-7, 734], [10, 728]];
      rt.scene.add(farFireDots(far.map(([x, z]) => [x, W.heightAt(x, z) + 1.6, z]))); }

    // 月夜のまま、土と草の違い・軒の灯りを読める明るさにする。
    // 低い月の向きでは櫓の影が高さの約五・六倍まで伸びる。高くして約〇・六倍に収める。
    // 月の直射を弱め、影にも届く空の光を少し増やして、地面を黒く覆わないようにする。
    // 色を複製しても夕暮れ扱いに戻らないよう、時間帯も明示する。
    W.setTime('night');
    applyLook(rt, { ...NIGHT, time: 'night', sky: 0x161d2e, fog: 0x1a2232, top: 0x060a14, hI: .85, mount: 0x0c0f16 }, false);
    W.sunOffset.set(.4, .8, -.2).normalize().multiplyScalar(120);
    W.skyMat.uniforms.sunDir.value.copy(W.sunOffset).normalize();
    W.sun.intensity = .48; W.hemi.intensity = W.baseHemi = .85;
    W.skyMat.uniforms.cover.value = .36; W.skyMat.uniforms.cloudDark.value = .1;
    // 有岡の月夜だけ雲の縁を空へ溶かす。共通の空と昼の戦は変えない。
    W.skyMat.fragmentShader = W.skyMat.fragmentShader
      .replace('nk * 0.8', 'nk * 0.98')
      .replace('dens * mix(fade,', 'dens * 0.22 * mix(fade,')
      .replace('ci * 0.35', 'ci * 0.08');
    W.skyMat.needsUpdate = true;
    W.stars.visible = W.moon.visible = true;
    // 月明かりと薄雲の下は明るい星だけ。携帯で空一面の雪に見せない。
    W.stars.geometry.setDrawRange(0, 80);
    W.stars.material.opacity = .12; W.stars.material.size = .5;
    W.moon.position.copy(W.skyMat.uniforms.sunDir.value).multiplyScalar(420);
    // 支度中は時を進めないため、空と遠山も最初から西の足軽を囲む。
    // 原点のままでは、遠い西の視点が空の球の縁に寄り、昼のような白い地平が出る。
    W.sky.position.set(rt.player.u.pos.x, 0, rt.player.u.pos.z);
    W.mountains.position.copy(W.sky.position);
    // 出陣札の間は世界の更新が止まる。遠山の霞の初期値（白）を
    // 最初の描画より前に夜の霧へそろえ、稜線だけ白く裂けるのを防ぐ。
    W.mountU.hazeCol.value.copy(W.scene.fog.color);
    // 行軍で追従する空と遠山は固定景物として止めない。支度の最初の描画にも位置を渡す。
    W.sky.userData.noFreeze = W.mountains.userData.noFreeze = true;
    // 出陣札の間も、配置後の視点を空の球の中心に置く。
    // 支度中は世界の更新が止まるため、準備時の足軽の位置だけでは球の外へ出てしまう。
    W.sky.onBeforeRender = (_renderer, _scene, camera) => {
      W.sky.position.set(camera.position.x, 0, camera.position.z);
      W.sky.updateMatrixWorld(true);
      // 11/5 遊んで直す（20 秒）：竹束を押す組の中で、視点が束の中へ入り画面が竹で塞がれた。
      //   視点が束から二・四メートル内に入った時だけ、その束を描く層から外す（当たり・弾よけ・見え方の判定は変えない）。
      if (F.tabas) for (const tb of F.tabas) {
        let near = (camera.position.x - tb.x) ** 2 + (camera.position.z - tb.z) ** 2 < 2.4 * 2.4;
        if (!near && tb.ariCamera) {
          // 叉木と横木の張り出しを含めた束の箱（視点の遮りと同じ箱）の一・二メートル外まで
          const b = ariTabaCameraPose(tb), dx = camera.position.x - b.x, dz = camera.position.z - b.z;
          near = Math.abs(dx * b.c - dz * b.s) < b.half + 1.2 && Math.abs(dx * b.s + dz * b.c) < b.depth + 1.2;
        }
        if (tb._ariCamHid === near) continue;
        tb._ariCamHid = near;
        tb.m.traverse((o) => { if (near) o.layers.disable(0); else o.layers.enable(0); });
      }
    };
    W.sky.updateMatrixWorld(true); W.mountains.updateMatrixWorld(true);
    W.updateEnv();
    ariStreetDress(rt);
    // 半透明の隊旗が空や敵に板のように重ならないよう、近い旗は竿ごと避ける。
    // 表示の復帰と落ちた旗は共通の更新へ任せ、旗持ちの体や戦力は変えない。
    const updateStandards = rt.updateStandards;
    rt.updateStandards = function (dt) {
      updateStandards.call(this, dt);
      for (const g of this.army.groups) {
        if (g.team !== 0 || !g.stds) continue;
        for (const s of g.stds) {
          const d = s.userData.std;
          if (!d.down && (s.userData.carrier?.camHidden
            || d.faintClothMat && d.cloth.material === d.faintClothMat)) s.visible = false;
        }
      }
    };
    // 飾りの斜面を作った後で歩行・接地・視点にも同じ盛土を渡す。
    // 有岡だけの上書きとし、ほかの戦の床や堀の判定は変えない。
    const moatGround = W.heightAt.bind(W);
    W.heightAt = (x, z) => ariBridgeHeight(moatGround, x, z, bridgeY);
    // 10/31 木戸の外の地面が砂色と灰緑の平らな一枚だった。踏み跡の土・窪みの泥・草の斑と半ば埋もれた石を混ぜる（形と材質は共通の束。町の内は空ける）。
    dressStage(rt, { at: { x: GATE.x - 14, z: GATE.z }, heading: Math.PI / 2, huts: 0, fence: false, flag: false, yagura: false, clutter: 0, fire: false,
      rocks: 5, wet: 0.6, trodden: 0.8, radius: 42, avoid: (x) => x > GATE.x - 3 });
    ariGoalBoard(rt);
    rt.setPhase('brief');
    rt.banner('一年の囲み。今、木戸が開く', '上臈塚の内応で惣構えへ入る');
    rt.obj('main', ARI_GOALS[0], 'main', true);
    // 夜討ちで狭い木戸をくぐる。位の高い者も馬を陣に預け、徒で入る（11/5 kaito：竹束の後ろから忍び寄るのに馬はおかしい）。
    const P = rt.player;
    if (P.mounted) { rt.army.setMounted(P.u, false); P.mounted = false; }
    P.canRide = false;
    // 11/18 クラウド（act bot「馬に乗ろうとしても乗れなかった」★★）：canRide だけ外し、空馬の手綱（mayRide）は残っていたので、
    //   討った荒木の将の馬に「捕らえて乗る」が出て取りかけて止まった。徒の夜討ちなので空馬の手綱も出さない。
    P.mayRide = false; P.u.mayRide = false;
    rt.say('滝川一益', `${nm(rt)}、中西新八郎が我らを引き入れる。木戸を頼むぞ`, 4);
    rt.after(4.5, () => { if (F.step === 0 && !F.ending) rt.say('滝川の組頭', '狙うは木戸の先の辻じゃ。本丸へは進むな', 4); });
    // 紙（battle_events_1101）：説きに入った官兵衛が捕らわれている事と、一年の囲み・村重が城を出た事を戦の前に。
    rt.after(1.5, () => { if (F.step === 0 && !F.ending) rt.say('使番', '去年、村重を説きに入った小寺官兵衛殿は、城の牢に捕らわれたままじゃ', 4); });
    rt.after(7, () => { if (F.step === 0 && !F.ending) rt.say('使番', '村重は九月に城を抜け、尼崎へ移った。残る者は一年の囲みに弱っておる', 4); });
    // 11/17 K355（漫画の手がかり：信長の忍び18巻 第326〜330話）：去年の師走の力攻めでは万見仙千代が討たれ大きな損を出した。高槻・茨木が寝返ってからは付城で囲み続けた。
    rt.after(12.5, () => { if (F.step === 0 && !F.ending) rt.say('滝川の組頭', '去年の師走の力攻めでは万見殿まで討たれた。惣構えは正面から押しても破れぬ。内から開く木戸を待て', 4.5); });
    // 十月十五日の夜、信長は安土・秀吉は播磨・光秀は丹波にあり、この口にはいない。陣には滝川一益と旗本だけを置く。
    ariMark(rt, 'taki', { x: GATE.x - 30, z: GATE.z }, '上臈塚の木戸');
    AR_OPEN.install(rt, ariOpenCtx());   // 合図と硝煙の後、本人が木戸の印へ寄れば開く。
    // 11/6 描いて遊ぶ：十秒で木戸が開き、竹束を押し立てて寄せる姿も塀の上の発砲も写真に入らなかった（critic60 の△）。
    // 竹束の後ろの印へ本人が寄ってから開く。時間だけで①を果たした事にしない。
    F.openAt = rt.t + 18;
    const t0 = rt.t, wait = () => {
      if (F.step >= 1 || F.ending || rt.over) return;
      const near = AR_OPEN.atGate(rt, ariOpenCtx());
      if (AR_OPEN.mayOpen(rt, near && rt.t - t0 >= 18)) this.open(rt);
      else rt.after(0.5, wait);
    };
    rt.after(10, wait);
  },

  // ① 木戸が内から開く
  open(rt) {
    const F = rt.flags;
    if (F.step >= 1 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.stepT = rt.t;
    torideFall(rt, 'joro', '上臈塚砦', false);
    F.joroFlag.visible = false; F.joroOdaFlag.visible = true;
    rt.setPhase('open');
    rt.unmark('taki');
    // 木戸を開ける
    F.gate.alive = false;
    F.door.userData.open();
    ariDoorCamera(rt, F.door);
    sfx('wood', 0.9);
    rt.banner('上臈塚に内応', '中西新八郎らが滝川勢を引き入れた。木戸から続け');
    rt.say('中西新八郎', '滝川殿、木戸を開けたぞ！　ここから入られよ！', 4);
    // 「攻め入れ」の札で共通の突撃合図を鳴らす。単発の法螺を重ねない。
    rt.obj('main', ARI_GOALS[1], 'main', true);
    rt.after(2.8, () => {
      if (!F.ending && !rt.over && F.step === 1 && rt.player.u.alive) rt.army.play('eiei', F.taki.anchor, .65);
    });
    // 11/18 クラウド（act bot 61秒「上臈塚の木戸の印に着いても6秒なにも起きない」）：一度木戸の輪に着いて次の一歩を示した後も、
    //   木戸の外へ押し戻されると印が木戸に戻り、着いても何も起きなかった。着いた後は、木戸から二十五 m より西へ離れた時だけ木戸を指し、ほかは木戸の内を指す。
    const kidoOut = () => { const p = rt.player.u.pos; return F.kidoIn ? p.x < GATE.x - 25 : p.x < GATE.x + 8; };
    ariMark(rt, 'turn', () => kidoOut() ? GATE : { x: GATE.x + 10, z: GATE.z },
      () => kidoOut() ? '上臈塚の木戸' : '木戸の内');
    // 11/16 iMac n-mikata（act bot「上臈塚の木戸に着いても6秒なにも起きない」）：開いた木戸の印の輪（十歩）に着いたら、右上の一行の進みで次の一歩を示す（名の無い者の声は戦の中では出ない）
    { const atKido = () => { if (F.ending || rt.over || F.step !== 1) return; const p = rt.player?.u?.pos; if (!p || Math.hypot(p.x - GATE.x, p.z - GATE.z) > 10.5) { rt.after(0.3, atKido); return; } F.kidoIn = true; rt.after(0.6, () => { if (!F.ending && !rt.over && F.step === 1) rt.objProgress('main', '木戸をくぐり、内の番兵を押し出せ'); }); }; rt.after(0.5, atKido); }
    rt.after(6, () => { if (!F.ending && !rt.over && F.step === 1 && !F.dpOn) rt.say('滝川の組頭', '早打ちは進めの合図じゃ。先手に続き、二列で入れ', 4); });
    F.taki.formation = 'column'; F.taki.colW = 2;
    // 11/22 クラウド 有岡の持ち主（K582 流れ・中学生 bot 624秒）：木戸の斬り合いで滝川の手（十八人が生きたまま）が百秒で崩れて西へ逃げ、
    //   本人一人が木戸の外で百秒行き来し、辻の段でも滝川の手が百五十m 先で動かなかった（03:45 の行の②の元）。内応で開いた口から勢いに乗って入った手（史実）なので、
    //   町筋の段と同じく開門から崩さない（討たれた分だけ減る）
    F.taki.noRout = true; F.taki.morale = Math.max(F.taki.morale || 0, 100);
    F.taki.order = 'move'; F.taki.dest = { x: GATE.x + 30, z: GATE.z }; F.taki.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; g.formation = 'yari'; g.onArrive = null; }; F.taki.seekRange = 35;
    kakoiEvent.campRaided(F.kakoi, 0);   // 内応の夜討ち：守りの士気が落ちる
    // 長い斬り合いに、滝川の後詰が加わる（救いの手。B086）
    rt.after(18, () => this.sendAid(rt));
    // 村重が先月去った知らせは、木戸を守る山場で城兵の動揺として描く。
    F.kuri.formation = 'column'; F.kuri.colW = 2;
    F.kuri.order = 'move'; F.kuri.dest = { x: GATE.x + 28, z: GATE.z + 4 }; F.kuri.onArrive = (g) => { g.order = 'hold'; g.formation = 'yari'; };
    F.naka.facing = Math.PI / 2; F.naka.aggro = 10;
    // 組頭と同じ持ち場に重ねず、先手の後ろへ合流する。
    F.naka.order = 'move'; F.naka.dest = { x: F.kuri.dest.x - 4, z: F.kuri.dest.z + 1 };
    F.naka.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; g.onArrive = null; };
    rt.after(14, () => { if (!F.ending && F.step === 1 && !F.dpOn) rt.say('滝川の組頭', '二列で通れ。押されたら槍を向けて退け', 4); });
    F.tgun.noAI = true; F.tgun.formation = 'column'; F.tgun.colW = 2;
    // 木戸のすぐ北へ曲げると後列が砦の西柵へ掛かる。全列を口の内へ入れてから開く。
    F.tgun.order = 'move'; F.tgun.dest = { x: GATE.x + 16, z: GATE.z - 4 };
    F.tgun.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; g.formation = 'line'; g.onArrive = null; };
    F.g1.order = 'move'; F.g1.aggro = 16; F.g1.formation = 'column'; F.g1.colW = 2;
    F.g1.dest = { x: GATE.x + 10, z: GATE.z };
    F.g1.onArrive = (g) => { g.order = 'attack'; g.formation = 'yari'; g.onArrive = null; };
    // 内応で口を失った番兵も、塀の脇に立ち続けず内の守りへ合流する。
    // 三組を同じ点に重ねず、町側の通りで寄せ手を迎える。
    for (let i = 0; i < F.gateInner.length; i++) {
      const g = F.gateInner[i];
      if (gone(g)) continue;
      g.noAI = true; g.path = null; g.focus = null;
      g.order = 'move'; g.formation = 'column'; g.colW = 2;
      g.dest = { x: GATE.x + 16 + i * 4, z: GATE.z + (i - 1) * 3 };
      g.onArrive = (q) => { q.anchor = q.dest; q.order = 'hold'; q.formation = 'yari'; q.onArrive = null; };
    }
    // 先手が入る間は射撃を待つ。開門を飛ばしても出陣の時計で猶予を残す。
    rt.after(Math.max(0, 25 - rt.t), () => {
      if (F.ending || rt.over) return;
      F.g1.fire = true;
      for (const g of F.wallG) { g.aggro = 20; g.fire = true; }
    });
    // 侍町への火は、城下へ進む段の下知で付ける。
  },

  // 木戸を押さえた後の段の流れ（W 惣構え → A 侍町の辻 → C 辻の守り → D 焼け跡 → U 奥の木戸 → 勝ち）を i 番目から
  dpChain(rt, i) {
    const L = ['W', 'A', 'C', 'D', 'U'];
    if (i >= L.length) { this.win(rt); return; }
    rt.flags.dpWhich = i + 1;
    this.deep(rt, L[i], () => this.dpChain(rt, i + 1));
  },
  // 戦の途中の保存（battle_checkpoint.js・K211 kaito「途中が全部消えるのは最悪」）：木戸を押さえた後の五つの段の流れ（1〜5）の始まりから続ける
  checkpointStep(rt) { const F = rt.flags; return F.dpOn && F.dpWhich ? F.dpWhich : -1; },
  resumeSteps: [1, 2, 3, 4, 5].map((k) => [k, function (rt) {
    const F = rt.flags;
    if (!(F.step >= 1)) this.open(rt);
    F.g1Done = true;
    if (F.dp) F.dp.on = false;
    F.dpOn = false;
    for (const q of [F.g1, ...(F.gateInner || [])]) if (q && !gone(q)) for (const u of q.units.slice()) if (u.alive) rt.army.despawn(u);
    this.dpChain(rt, k - 1);
  }]),
  // 続ける時の置き場：木戸の内（1）・惣構えの通り（2）・侍町の辻（3〜5）
  resumeAt(rt, step) {
    if (step === 1) return { x: GATE.x + 12, z: GATE.z };
    if (step === 2) return { x: TOWN_X - 24, z: GATE.z };
    if (step >= 3) return { x: ARI_JUNCTION.x - 6, z: ARI_JUNCTION.z };
    return null;
  },
  sendAid(rt) {
    const F = rt.flags;
    if (F.aidSent || F.ending || rt.over || !rt.player.u.alive || F.step !== 1 || F.dpOn || ariSpent(F.aid)) return;
    F.aidSent = true;
    const g = F.aid; g.noAI = true; g.formation = 'column'; g.colW = 2;
    // 鉄砲の南側の通路へ寄せ、後列を木戸と砦の西柵の間に残さない。
    g.path = null; g.focus = null; g.order = 'move'; g.dest = { x: GATE.x + 16, z: GATE.z + 4 };
    g.onArrive = (q) => { q.anchor = q.dest; q.order = 'hold'; q.formation = 'yari'; q.onArrive = null; };
    sfx('sig_atsumare', 0.7);
    rt.obj('main', ARI_GOALS[1], 'main', true);
    rt.say('滝川の組頭', '集まれの法螺じゃ。後詰と並び、番兵を押し出せ', 4);
  },

  // 段を重ねる：侍町の辻へ攻め入り、本丸から寄せ返す荒木勢を辻で受ける（史実の流れは奥へ。木戸へ戻らない）。
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which] || F.ending) return;
    F['dp' + which] = true;

    F.dpOn = true; rt.objRemove('dp');
    if (which === 'C') ariReinforce(rt, ARI_JUNCTION, 10);   // 辻の守りの前に新手の組（15分の段で味方が減り切らないように）
    rt.obj('main', which === 'A' ? ARI_GOALS[2] : which === 'W' ? '惣構えの通りの角を押さえよ' : which === 'D' ? '侍町の焼け跡を改めよ' : which === 'U' ? '侍町の奥の木戸を押さえよ' : ARI_GOALS[3], 'main');
    depthStart(rt, ariCtx(rt), which === 'A' ? ariA() : which === 'W' ? AR_SOTO.stages(ariH()) : which === 'D' ? AR_SEI.stages(ariH()) : which === 'U' ? AR_UCHI.stages(ariH()) : ariC(), () => { F.dpOn = false; rt.after(3, () => { const q = rt.objectives.find((x) => x.id === 'dp'); if (q && q.state) rt.objRemove('dp'); }); if (!F.ending) then(); });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.unmark('ariCover'); rt.objRemove('ariCover');
    rt.setPhase('end');
    rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp');
    rt.unmark('g1'); rt.unmark('taki'); rt.unmark('turn'); rt.unmark('aid'); rt.objRemove('evac');
    // 勝ちの札は官兵衛を迎えてから（⑤）。辻を守った所で締めない（kaito 二5：物語の締めを見ずに勝ちにしない）。
    rt.obj('main', ARI_GOALS[4], 'main', true);
    // 辻を守っただけでは主任務を果たしていない。官兵衛を実際に迎えるまで待つ。
    F.kanbePending = true;
    // 登場を待つ五秒間も⑤の行き先を切らさない。迎える通りを先に決め、二人も同じ場所へ来る。
    const onRoad = F.dpU && Math.abs(rt.player.u.pos.x - TOWN_X) < 8 && rt.player.u.pos.z < ARI_JUNCTION.z - 30;
    F.kanbeMeet = onRoad ? { x: TOWN_X, z: rt.player.u.pos.z } : ARI_JUNCTION;
    rt.hud?.root?.classList.add('arioka-kanbe');
    sfx('sig_atsumare', 0.6);
    rt.banner('侍町の辻を守り抜いた', '荒木勢は本丸へ退いた。侍町は焼け落ちる');
    rt.say('滝川一益', `${nm(rt)}、辻を守った手柄、忘れぬ。栗山善助が城の牢へ走った`, 4);
    rt.player.u.invuln = true;
    // 11/6 描いて遊ぶ：勝ちの後も町屋の陰に荒木の兵が一人、▼を付けたまま立ち続けた（一3）。辻の近くに残る荒木勢は本丸へ退く（本丸の久左衛門の手は動かさない）。
    for (const g of rt.army.groups) {
      if (g.team !== 1 || g.routed || g === F.ehon?.general?.group || g === F.ehon?.guard || !g.units.some((u) => u.alive && Math.hypot(u.pos.x - ARI_JUNCTION.x, u.pos.z - ARI_JUNCTION.z) < 120)) continue;
      g.routed = true; g.order = 'flee'; g.morale = 0; g.noRout = false; g.focus = null; g.fire = false; g.fleeDir = { x: 0, z: -1 };
    }
    // 退く兵も既存の fleeWay で主郭南の土橋へ回す。立ち止まった時間だけでは消さず、
    // 共通の leaveField が、画面外で追手を離して主郭へ逃げ切った時だけ退場させる。
    // 紙：官兵衛を救い出すまでが勝ち。救い出したのは十月十六日、家臣の栗山善助（利安）（黒田孝高・有岡城の戦い）。
    // 本丸の開城（十一月十九日）までは飛ばさず、同じ夜の明けぬうち（十六日の未明）に城の牢へ。当時は小寺官兵衛と名乗る。
    // 11/6 fix61：見出しは「夜が明ける」なのに空は夜のままだった。救い出した刻は史料に無いので、絵に合わせて未明とする。台詞も歩く姿に合わせ「肩を貸して」。
    rt.after(5, () => {
      if (rt.over) return;
      rt.banner('十月十六日　未明', '侍町は焼け、砦の兵は散った。城の牢が開いた');
      rt.say('滝川一益', '牢から小寺官兵衛殿が出られた。家来の栗山が肩を貸して来る。迎えよ', 4);
      // 11/6 描いて遊ぶ：本人の東十二メートルに出していたので燃える町屋の中に出て詰まり、来ないまま四十五秒で済んでいた。
      //   牢のある本丸の方（辻の北の通り）から辻へ歩いて来る。行き先の▼も出す（勝ちの見出しで隠れる共通の札を、迎えるまで戻す）。
      // 奥の木戸まで進んだ後も、二人は安全な辻で迎える。本人の現在地へ
      // 直進させると、町屋を横切って詰まり、⑤を終えられなくなる。
      // 奥の木戸（辻の北の真っすぐな通り x=TOWN_X の上）にいる時は、同じ通りの南から二人が歩いて来る（町屋を横切らない。11/8 bot：辻まで戻れず時間切れ）
      const me = F.kanbeMeet, at = onRoad ? { x: TOWN_X + 0.5, z: me.z + 24 } : { x: ARI_JUNCTION.x + 1, z: ARI_JUNCTION.z - 22 };
      const ul = Math.hypot(at.x - me.x, at.z - me.z) || 1, ux = (at.x - me.x) / ul, uz = (at.z - me.z) / ul;
      // 一年の牢から出た身。具足は着せず、くすんだ小袖に無帽（甲冑の武将の姿にしない）。
      const kg = evPerson(rt, 0, '小寺官兵衛', at, -Math.PI / 2, { calm: true, type: 'porter', u: { kosode: 1, kosodeCol: 0x4a4236, obi: 0x2a231c, hat: 'none', flag: null, horse: false } });
      const sg = evPerson(rt, 0, '栗山善助', { x: at.x + 1.6, z: at.z + 1.4 }, -Math.PI / 2, { calm: true, type: 'samurai', u: { horse: false } });   // 11/6 描いて遊ぶ：善助が白い馬に乗って来た。肩を貸して歩く徒にする
      // 足の弱った官兵衛を善助が支え、ゆっくり本人のもとへ歩いて来る（本人が動かなくても締めが進む。二5）。
      for (const [g, dz] of [[kg, 0], [sg, 1.2]]) {
        // 隊の並びで置き場が通りの外（町屋の裏）へずれ、遠回りして詰まった回があった。通りの上に立たせてから歩かせる。
        for (const u of g.units) { u.pos.x = at.x + dz; u.pos.z = at.z; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); }
        // 11/6 描いて遊ぶ：本人の背の側（視点の所）へ歩かせていたので、善助の体が視点の前で消えて朱の槍の柄だけが画面いっぱいに立った。
        //   本人の前（来る方）の二歩半で止め、二人は来る向きに直角へ並ぶ。
        g.noAI = true; g.speed = 0.9; g.order = 'move'; g.dest = { x: me.x + ux * 2.6 - uz * dz, z: me.z + uz * 2.6 + ux * dz };
        g.onArrive = (q) => { q.anchor = q.dest; q.order = 'hold'; q.onArrive = null; };
      }
      const kanbe = kg.units[0];
      F.kanbeAt = kanbe ? kanbe.pos : at;
      // 官兵衛だけ先に着いても、肩を貸す善助が町屋の裏に残る間は迎え終わらない。
      const canMeet = (b) => {
        const u = b.player.u, helper = sg.units[0];
        if (!u.alive || !kanbe?.alive || !helper?.alive) return false;
        // 11/15 ネ三（K295 bot）：本人が印の近くで待つのに、二人が町屋の裏・壁越しで止まり六秒何も起きなかった。
        //   本人が十二m内で迎え切れない間は、二人が本人の方へ寄って来る（本人を歩かせない・時間で済ませない）。
        // 11/18 act bot：奥の木戸の北（-346,-90）で残りの荒木勢と斬り合い続け、辻の二人へ六十五 m から寄れず刻限で負けた。
        //   出て三十秒たっても十二 m より遠い時は、二人が侍町の通り（x=TOWN_X）を本人の方へ歩いて来る。
        const far = Math.hypot(u.pos.x - kanbe.pos.x, u.pos.z - kanbe.pos.z) >= 12;
        F.kanbeWait = (F.kanbeWait || 0) + .5;
        if (far && F.kanbeWait > 30 && Math.abs(u.pos.x - TOWN_X) < 9 && !(F.kanbeChaseZ != null && Math.abs(F.kanbeChaseZ - u.pos.z) < 4)) {
          F.kanbeChaseZ = u.pos.z;
          const sz = Math.sign(kanbe.pos.z - u.pos.z) || 1;
          for (const [g, dz] of [[kg, 0], [sg, 1.2]]) { g.dest = { x: TOWN_X + .5 + dz, z: u.pos.z + sz * 3 }; g.order = 'move'; }
        }
        if (!far) {
          for (const [g, dz] of [[kg, 0], [sg, 1.2]]) {
            const dx = u.pos.x - kanbe.pos.x, dd = Math.hypot(dx, u.pos.z - kanbe.pos.z) || 1, ex = dx / dd, ez = (u.pos.z - kanbe.pos.z) / dd;
            g.dest = { x: u.pos.x - ex * 2.2 - ez * dz, z: u.pos.z - ez * 2.2 + ex * dz }; g.order = 'move';
          }
        }
        for (const v of [kanbe, helper]) {
          if (Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z) >= 3.5
            || Math.abs(u.pos.y - v.pos.y) > 3 || b.army.wallBetween(u.pos, -1, v.pos)) return false;
        }
        return true;
      };
      evReach(rt, 'kanbe', () => F.kanbeAt, 3.5, ARI_GOALS[4], '小寺官兵衛', () => {
        F.kanbePending = false;
        rt.award((t) => { t.main = true; t.special = { label: '惣構えに入り、侍町の辻を守った', pts: 20 }; }, '任務達成・侍町の辻を守った');
        rt.award((t) => { t.side.push('牢を出た官兵衛を迎えた'); }, '牢を出た官兵衛を迎えた');
        rt.banner('官兵衛を迎えた', '一年の牢で足は弱ったが、命はある');
        rt.say('小寺官兵衛', 'かたじけない……。この足では、もう走れぬがな', 4);
        rt.after(3.5, () => rt.say('栗山善助', '殿、お迎えに参りました。播磨へ帰りましょう', 3.5), true);
        rt.flags.kanbeMet = true;
        // 官兵衛を迎えた後も終幕は操作できる。結果へ移るまで居場所の印を残す。
        rt.after(5, () => rt.objDone('main'), true);
        rt.after(8, () => AR_YOIN.start(rt, () => rt.finish({ scriptedEnd: true }, 4)), true);   // 三十秒の余韻（arioka/yoin.js）の後に締める
      // 待ち時間だけでは迎えた事にしない。遠くへ離れた本人にも印を残す。
      // 二人は通りを歩いて来る。時間だけで本人のそばへ移したり、対面を代行したりしない。
      }, { canReach: canMeet });
      // 11/18 K358：evReach は 'main' と同じ文「牢を出た官兵衛を迎えよ」を 'kanbe' として足し、任務の一覧に二つ並んだ（act bot 3回とも・迎える五秒後から）。
      //   ⑤は 'main' の一行だけにし、着いた判定と印（kanbe）は残す
      rt.objRemove('kanbe');
    });
  },

  lose(rt, reason) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.unmark('ariCover'); rt.objRemove('ariCover');
    if (F.dp) F.dp.on = false;
    F.dpOn = false; rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp');
    rt.unmark('g1'); rt.unmark('taki'); rt.unmark('turn'); rt.unmark('aid'); rt.objRemove('evac');
    rt.setPhase('end'); rt.obj('main', '退き太鼓。攻めを打ち切り、木戸の外へ退け', 'main', true); rt.objFail('main'); rt.tracker.main = false;
    rt.banner('惣構えの攻めを果たせず', reason);
    rt.say('滝川の組頭', `${reason}。退き太鼓じゃ。木戸の外へ退け`, 5);
    rt.player.u.invuln = true; rt.finish({ scriptedEnd: true, failureReason: reason }, 6);
  },

  update(rt, dt) {
    // 11/19 クラウド kaito2（司令塔：敵の手加減は外し、中学生が勝てる手は味方の割り込み・命の戻りに寄せる）：伊賀・高遠と同じ。
    //   手負い（命七割五分未満）で五歩内に二人以上の斬り手が寄り、八歩内に味方の槍がいる時、九秒に一度、寄せる者を押し返す（兵の数と一撃の重さは変えない）
    { const P = rt.player.u, RF = rt.flags;
      if (P.alive && !RF.ending && P.hp < P.maxHp * 0.75 && rt.t >= (RF.rallyAt2 || 0)) {
        let close = 0, mate = false;
        rt.army.forNear(P.pos.x, P.pos.z, 12, (o) => {
          if (!o.alive || o.isPlayer || o.fleeing || o.isStruct || o.noTarget || o.woundOut || o.downed || o.rearWound || o.group?.hidden || o.group?.routed ||
              Math.abs(o.pos.y - P.pos.y) > 2.5 || rt.army.wallBetween(o.pos, -1, P.pos, false)) return;
          const d = Math.hypot(o.pos.x - P.pos.x, o.pos.z - P.pos.z);
          if (o.team !== P.team) { if (d < 5 && (o.sidearm || o.type !== 'gun' && o.type !== 'bow')) close++; }
          else if (o.type !== 'porter' && o.type !== 'gun' && o.type !== 'bow') mate = true;
        });
        if (mate && close >= 2) {
          RF.rallyAt2 = rt.t + 6;   // 11/21：有岡は町で布陣の塊に囲まれやすい（act bot 1/3 倒れ）→ 六秒に一度・味方は十二m 内まで
          rt.army.forNear(P.pos.x, P.pos.z, 5, (o) => {
            if (!o.alive || o.team === P.team || o.fleeing || o.isStruct || o.noTarget || o.woundOut ||
                Math.abs(o.pos.y - P.pos.y) > 2.5 || rt.army.wallBetween(o.pos, -1, P.pos, false)) return;
            const dx = o.pos.x - P.pos.x, dz = o.pos.z - P.pos.z, l = Math.hypot(dx, dz) || 1;
            if (l > 5) return;
            o.push.x += dx / l * 4; o.push.z += dz / l * 4;
            o.stagger = Math.max(o.stagger || 0, 1.2);
            o.atk = null; o.swing = null; o.target = null; o.cd = Math.max(o.cd || 0, 1.4); o.aiT = 0.8;
          });
          rt.bark('味方が受け持つ！　組の後ろへ下がれ', true);
        }
      } }
    const F = rt.flags;
    if (rt.t >= (F.riderLookAt || 0)) {
      F.riderLookAt = rt.t + 1;
      for (const u of rt.army.units) refineAriRider(u);
    }
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    KIT.backTick(rt);
    retreatGateTick(rt);
    if (F.K) F.K.tick(dt);
    // 11/18 クラウド（act bot 467秒 end「崩れた部隊が、また戦っている」新手・flee）：官兵衛を迎える終わりの段では下の見回りが止まり、
    //   崩れた新手の取り残しが斬り合ったまま残った。終わりの段でも、崩れて退く組の取り残しを退かせる。
    if (F.ending && !rt.over && rt.t >= (F.endRoutAt || 0)) {
      F.endRoutAt = rt.t + 2;
      for (const g of rt.army.groups) {
        if (!g.routed || g.order !== 'flee' || g.team !== 1) continue;
        for (const u of g.units) if (u.alive && !u.gone && !u.isPlayer && !u.fleeing && !u.noTarget) {
          u.fleeing = true; u.routIn = 0; u.target = null; u.atk = null; u.swing = null; u.bind = null; u.charging = false;
        }
      }
    }
    if (F.ending || rt.over || !rt.player.u.alive) return;
    AR_OPEN.tick(rt, ariOpenCtx());
    ariTownsfolk(rt);
    // 11/18 クラウド act bot：町で組み合う組が討たれて一二人になると、敵を前に槍を構えたまま二百秒立ち尽くした（hold・noAI）。
    //   三人を切った組は崩れて退く（味方は木戸の外の陣へ・荒木は本丸へ。既存の fleeWay の道を歩く）。
    if (rt.t >= (F.decorLookAt || 0)) {
      F.decorLookAt = rt.t + 2;
      for (const g of rt.army.groups) {
        if (!g.ariDecor || g.routed || g.order === 'flee') continue;
        let n = 0; for (const u of g.units) if (u.alive && !u.gone) n++;
        if (n > 0 && n < 3) withdrawAriRemnants(g);
      }
      // 同じ act bot：退かせた荒木の新手の中に、逃げの印の無い者が残って斬り合っていた（終わりの480秒・崩れた部隊が、また戦う）。
      //   崩れて退く組は、取り残しも退かせる。
      for (const g of rt.army.groups) {
        if (!g.routed || g.order !== 'flee' || g.team !== 1) continue;
        for (const u of g.units) if (u.alive && !u.gone && !u.isPlayer && !u.fleeing && !u.noTarget) {
          u.fleeing = true; u.routIn = 0; u.target = null; u.atk = null; u.swing = null; u.bind = null; u.charging = false;
        }
      }
    }
    // 開門前に動かず待った時間で敗北させない。開門後の攻めに残り十四分半を与える。
    if (F.step >= 1 && rt.t - F.stepT >= 1020 - AR_OPEN.KAIMAKU_END) { this.lose(rt, '攻めの時が尽きた。木戸の外へ退け'); return; }
    if (!F.coverTaught && (rt.aimedT || 0) > 0) {
      F.coverTaught = true; F.coverUntil = rt.t + 8; F.gunResumeAt = rt.t + 6;
      const p = rt.player.u.pos;
      F.coverAt = p.x < GATE.x + 1
        ? { x: GATE.x - 12, z: GATE.z + (p.z < GATE.z ? -9 : 9) }
        : p.x < TOWN_X - 24
          ? { x: TORIDE_WORKS[1].x1 - 1.8, z: GATE.z + (p.z < GATE.z ? -10 : 10) }
          : { x: TOWN_X + 5, z: -14 };
      // 遮蔽の知らせは台詞だけにし、初めに並べた五つの目標と行き先を増やさない。
      rt.say('滝川の組頭', '町屋の陰から鉄砲じゃ。柵の陰へ横に退け', 4);
      const paused = [];
      for (const g of F.defenders.values()) if (g.fire !== false) { paused.push(g); g.fire = false; }
      rt.after(6, () => { for (const g of paused) resumeAriFire(rt, F, g); });
    }
    if (F.coverUntil && (rt.t >= F.coverUntil || rt.distTo(F.coverAt) < 3)) {
      if (rt.distTo(F.coverAt) < 3) rt.bark('柵が盾になる。組と進め');
      rt.unmark('ariCover'); rt.objRemove('ariCover'); F.coverUntil = 0;
    }
    if (F.farRout && rt.t >= (F.farRoutT || 0)) {
      F.farRout = false; F.farRoutT = rt.t + 90;
      rt.say('使番', '別口の荒木勢は本丸へ退き申した', 3);
    }
    if (F.TA) F.TA.tick(dt);
    if (F.FI) F.FI.tick();
    ariMarchArrival(rt);
    // 11/22 16:35 クラウド 有岡の持ち主（K582 流れ・K564）：act bot --mobile 1611 で道の始めの行軍の列（march_open.js の飾りの味方十四人）が
    //   ②の角 (-367,-105) で attack のまま 221〜446秒 動かず立ち続けた（狙われず斬り合わない飾り）。鳶ヶ巣・天王寺砦と同じ手：
    //   四十五秒より後、列の誰もが本人の七十m の外なら列ごと外す（角を塞がず、携帯の兵の数も減る）
    { const mg = F.marchG;
      if (mg && !F._mgOff && rt.t > 45 && rt.player?.u?.alive && (F._mgT = (F._mgT || 0) - dt) <= 0) {
        F._mgT = 1;
        const me = rt.player.u.pos, us = (mg.units || []).filter((u) => u.alive && !u.gone);
        if (!us.length) F._mgOff = true;
        else if (!us.some((u) => Math.hypot(u.pos.x - me.x, u.pos.z - me.z) < 70)) { for (const u of us) { try { rt.army.despawn(u); } catch (e) { /* そのまま */ } } F._mgOff = true; }
      }
    }
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: true, team: 0 });
    ariNearAid(rt);
    ariReinforceUnstick(rt);
    ariPressPlayer(rt);
    ariFoldFill(rt);
    // 先手の損害を見て、初めからいる後詰に下知する。
    if (F.step === 1 && !F.dpOn && !F.aidSent && !(F.aidCheckAt > rt.t)) {
      F.aidCheckAt = rt.t + 0.5;
      let able = 0;
      for (const u of F.taki.units) if (ariAble(u)) able++;
      if (ariSpent(F.kuri) || able <= 11) this.sendAid(rt);
    }
    if (F.civsFled && !F.evacSeen && rt.warCrowd) {
      for (const a of rt.warCrowd.agents) {
        if (a.g.home.x > TOWN_X + 30 || !a.out || a.ran < 22 || rt.distTo(a) > 45 || rt.army.wallBetween(rt.player.u.pos, -1, a)) continue;
        F.evacSeen = true; rt.objDone('evac');
        rt.award((t) => t.side.push('町の者が避難するのを見届けた'), '町の者の避難を見届けた'); break;
      }
    }
    // 11/18 K358（描かずの通し：侍町の辻の段で本人の三十m 内の味方 7〜11人・敵 40〜57人）：辻で滝川の手が後ろに残り、本人だけが辻に立った。
    //   辻の段から、滝川の手が本人から二十五m より離れたら本人の所へ寄せて斬り合う（三秒に一度・兵は足さない）
    // 11/22 03:30 クラウド 有岡の持ち主（K175・中学生 bot★★「101秒 木戸の内で何も起きない」）：本人が木戸の内へ入っても組の味方が二人そろわず、確保（味方二人・十二秒）が始まらなかった。木戸の内へ入った後も同じく滝川の手を本人の所へ寄せる
    if ((this.missionOf(rt) >= 2 || F.step === 1 && F.gateEntered) && !(F.takiSupAt > rt.t) && F.taki?.count && !F.taki.routed && rt.player.u.alive) {
      F.takiSupAt = rt.t + 3;
      const c = F.taki.center(), P = rt.player.u.pos;
      // 11/22 08:30 クラウド 有岡の持ち主（K582 流れ・描かずの通し）：三秒ごとに行き先を本人の足元へ付け直すと、縦列が毎回組み直しになり
      //   滝川の手が一秒に一m 足らずしか進まず、辻へ着く前に討たれ尽くした（十六人→一人）。動いている間は、行き先が本人から十二m 内なら付け直さない
      const keep = F.taki.order === 'move' && F.taki.dest && Math.hypot(F.taki.dest.x - P.x, F.taki.dest.z - P.z) <= 12;
      if (Math.hypot(c.x - P.x, c.z - P.z) > 25 && !keep) {
        F.taki.formation = 'column'; F.taki.colW = 3; F.taki.order = 'move'; F.taki.dest = { x: P.x - 3, z: P.z };
        F.taki.onArrive = (g) => { g.order = 'hold'; g.anchor = { ...g.dest }; g.formation = 'yari'; g.onArrive = null; };
      }
    }
    if (F.dpOn) { depthTick(rt, dt); return; }
    F.guideT = (F.guideT || 0) - dt;
    const guide = F.guideT <= 0;
    if (guide) F.guideT = 0.5;
    if (F.step === 1) {
      const post = F.gatePost || (F.gatePost = { x: GATE.x + 10, z: GATE.z,
        y: rt.world.heightAt(GATE.x + 10, GATE.z) });
      const p = rt.player.u.pos;
      // 番兵が崩れても、遠い町筋や柵の外から東へ回っただけでは木戸へ入った事にしない。
      // 11/19 夜50-04（Opus 宛て：act bot 一回、本人が木戸の外 (-412,-110) で撃たれながら止まり、段2が1020秒まで進まず時切れ）：
      //   段2が六分を越えたら、木戸の二十m 内（内外どちらでも）にいれば木戸へ入った事にする（詰まらない決まり）
      const entered = p.x >= GATE.x + 8 && Math.hypot(p.x - post.x, p.z - post.z) <= 12
        && Math.abs(p.y - post.y) <= 3 && !rt.army.wallBetween(p, -1, post)
        // 11/21 クラウド kaito2（act bot 870秒の回：本人が木戸の印に十七m までしか寄れず、②の前半が四百秒）：番兵が崩れた後（四分）は、六分を待たず二十m 内で入った事にする
        || rt.t - F.stepT > (F.g1Broke ? ARI_GATE_HOLD : 360) && Math.hypot(p.x - GATE.x, p.z - GATE.z) <= 20
        // 11/21 クラウド kaito2（K582 せっかち 1632：番兵が崩れた後、本人が木戸の三十七m 西の外 (-437,-122) に九十秒あまり立ち、六百秒で時切れ）：
        //   番兵が崩れてから本人が木戸の二十m より外に九十秒続けていれば、木戸の四十五m 内で入った事にする（次の段の▼が土橋から通りへ導く）
        || F.g1Broke && F.gateFarT != null && rt.t - F.gateFarT >= 90 && Math.hypot(p.x - GATE.x, p.z - GATE.z) <= 45;
      const gateD = Math.hypot(p.x - GATE.x, p.z - GATE.z);
      F.gateEntered = entered;
      if (gateD <= 20 || !F.g1Broke) F.gateFarT = null; else F.gateFarT ??= rt.t;
      // 木戸を組と押さえた後、奥の射手一人を追うためだけに攻めを止めない。
      // 柵越しの兵は数えず、本人が木戸の内で十二秒、二倍の兵力を保つ必要がある。
      if (guide) {
        let friend = 0, enemy = 0;
        for (const u of rt.army.units) {
          if (!u.alive || u.gone || u.dying || u.fleeing || u.woundOut || u.rearWound || u.noTarget || u.downed || u.climb || u.group?.routed || u.isStruct || u.group?.civ
            || Math.hypot(u.pos.x - post.x, u.pos.z - post.z) > 12
            || Math.abs(u.pos.y - post.y) > 3 || rt.army.wallBetween(u.pos, -1, post)) continue;
          if (u.team === 0) friend++; else enemy++;
        }
        const secure = entered && friend >= 2 && friend >= enemy * 2;
        // 11/22 クラウド 有岡の持ち主（K175・中学生 bot★★：79秒に木戸の内の印へ着いても十秒何も起きなかった）：着いて組がまだそろわない時は、一度だけ組頭が次の事を言う。
        if (entered && !secure && !F.gateArriveSaid) { F.gateArriveSaid = true; rt.say('滝川の組頭', '木戸の内じゃ。組がそろうまで、番兵を押し返せ', 3.5); }
        if (!secure) F.gateHeldAt = null;
        else F.gateHeldAt ??= rt.t;
      }
      if (guide && !gone(F.g1)) {
        const left = Math.max(0, Math.ceil(ARI_GATE_HOLD - (rt.t - F.stepT)));
        // 携帯で補足が隠れても、攻めの期限を本文から読めるようにする。
        rt.obj('main', ARI_GOALS[1], 'main', true);
        if (left <= 30 && !F.gateHurry) {
          F.gateHurry = true;
          rt.say('滝川の組頭', '攻めの時が尽きるぞ。組と木戸の内へ押し入れ', 4);
        }
      }
      // 詰まらない決まり8：三分（ARI_GATE_HOLD）で番兵は退くが、本人が木戸の内へ入るまで②を終えない。
      const late = rt.t - F.stepT;
      if (late > ARI_GATE_HOLD && !F.g1Broke && !gone(F.g1)) {
        F.g1Broke = true;
        for (const q of [F.g1, ...(F.gateInner || [])]) withdrawAriRemnants(q);
        rt.say('滝川の組頭', '木戸の荒木勢が崩れたぞ！　内へ入れ！', 3.5);
      }
      if ((gone(F.g1) || F.gateHeldAt != null && rt.t - F.gateHeldAt >= 12) && entered) {
        // 木戸を失った番兵は本丸へ退く。残兵を無かった事にはしない。
        // 士気だけ下げても健在の組頭が退却を止める。脇の番兵も攻撃を解いて退く。
        for (const q of [F.g1, ...(F.gateInner || [])]) withdrawAriRemnants(q);
        rt.unmark('g1');
        rt.award((t) => t.side.push('砦の兵を退けた'), '砦の兵を退けた');
        F.g1Done = true;
        // 主任務は木戸の防衛が済んで初めて達成。
        // 15分の段：木戸の内 → 惣構えの通り（arioka/sotoguruwa.js）→ 侍町の辻 → 辻の守り → 焼け跡を改める（arioka/seiatsu.js）→ 官兵衛
        this.dpChain(rt, 0);
      } else if (rt.t - F.stepT > 150 && !gone(F.g1) && !F.g1Broke) {
        // 二分半押し合えば、内応で口を失った木戸の荒木勢は砦の奥へ崩れる（11/8 bot：数人が残り段が進まず負けた）
        let able = 0;
        for (const u of F.g1.units) if (ariAble(u)) able++;
        for (const q of F.gateInner || []) withdrawAriRemnants(q);
        if (able <= 14) { F.g1Broke = true; withdrawAriRemnants(F.g1); rt.say('滝川の組頭', '木戸の荒木勢が崩れたぞ！　内へ入れ！', 3.5); }
      }
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.isStruct || v.group?.civ || v.type === 'porter') return;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || rt.t < (rt.flags.routSayT || 0)) return;
    const c = g.center();
    if (Math.hypot(c.x - rt.player.u.pos.x, c.z - rt.player.u.pos.z) > 35 ||
        rt.army.wallBetween(rt.player.u.pos, -1, { x: c.x, y: rt.world.heightAt(c.x, c.z), z: c.z })) {
      rt.flags.farRout = true; return;
    }
    rt.flags.routSayT = rt.t + 9;
    rt.say('足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が逃げよった！`, 2.5);
  },
};

// 岸・上臈塚砦：別働の織田勢が惣構えの外から攻め落とす遠景の出来事（kaito 10/1「三砦も攻め落とせる区域に」）
function torideFall(rt, id, name, message) {
  const F = rt.flags;
  if (F.ending || !F.SZ) return;
  const z = F.SZ.byId[id];
  if (!z || z.owner === ZONE_STATE.FRIEND) return;
  z.owner = ZONE_STATE.FRIEND; z.fallen = true;
  if (message !== false) rt.bark(message || `別手の織田勢が${name}を取った`);
  // 内応は全城兵を一律に弱らせない。
}

// 全て準備時に配置する。合図では既存の組へ行き先を渡すだけ。
function prepareDefenders(rt) {
  const F = rt.flags;
  F.defenders = new Map();
  const add = (sp, at = sp.from, reserve = false) => {
    const g = enemyGroup(rt, { fixed: true, faction: 'araki', name: sp.name,
      anchor: at, facing: Math.PI * 1.5, order: 'hold', width: reserve ? 5 : sp.kind === 'gun' ? 10 : 12,
      formation: reserve ? 'column' : sp.formation || 'yari', colW: 2, aggro: 8, morale: sp.morale ?? 85,
      fleeDir: { x: 0, z: -1 }, dmgMult: 1 }, dress(sp.list, ARAKI));
    g.fire = false;
    g.noAI = true; // 控えは下知まで持ち場を守り、勝手に木戸へ出ない。
    F.defenders.set(sp.name, g);
    return g;
  };
  F.g1 = add({ name: '木戸の荒木勢', from: { x: GATE.x + 36, z: GATE.z }, list: [uS(2), uA(10), uG(2)] });
  F.wallG = [-8, 8].map((offset) => add({ name: offset < 0 ? '木戸の北の射手' : '木戸の南の射手', from: { x: GATE.x + 42, z: GATE.z + offset },
    list: [uG(2), { type: 'bow', n: 2 }], kind: 'gun', formation: 'line' }));
  F.g1.fire = false;
  for (const g of F.wallG) g.fire = false;
  // 木戸の内に詰めた荒木勢の群れ（櫓門の口と柵越しに、槍と笠・丸の幟が持ち場から見える）。持ち場を守り、門が開くまで外へ出ない。
  // 下知の組（defenders）には入れず、勝ち負けの数えにも加えない。人数と位置は推定（10/29 採点：敵の群れが見えない。10/30 小さいので十四・八・八人へ）。
  F.gateInner = [0, -9, 9].map((dz, i) => {
    const g = enemyGroup(rt, { fixed: true, faction: 'araki', name: i ? '木戸の脇の荒木勢' : '木戸の内の荒木勢', anchor: { x: GATE.x + (i ? 4 : 7), z: GATE.z + dz },
      facing: Math.PI * 1.5, order: 'hold', width: i ? 5 : 7, formation: 'yari', aggro: 6, morale: 85, fleeDir: { x: 1, z: 0 } }, dress(i ? [uA(8)] : [uS(1), uA(13)], ARAKI));
    g.fire = false;
    return g;
  });
  const positions = [
    // 11/14 K168：四つ目（侍町から出る新手）は (10,-72) だと屋敷の当たりの中で、11人が家の中に立っていた。三歩西の空き地へ
    { x: -16, z: GATE.z + 22 }, { x: 22, z: -30 }, { x: -46, z: -4 }, { x: 7, z: -72 },
    // 辻へ寄せ返す控えは侍町（北東）と南の通りに置く。辻から四十五メートルほど離し、辻を取る戦の間は持ち場を守る（noAI）。
    { x: 20, z: -62 }, { x: 30, z: -60 }, { x: 30, z: 32 }, { x: 48, z: 32 },
  ].map((p) => ({ x: TOWN_X + p.x, z: p.z }));
  let i = 0;
  for (const [reserve, steps] of [[false, ariA()], [true, ariC()], [false, AR_SOTO.stages(ariH())], [false, AR_SEI.stages(ariH())], [false, AR_UCHI.stages(ariH())]]) {
    for (const step of steps) {
      if (!step.ariOrders) continue;
      for (const order of step.ariOrders) for (const sp of order.foes(rt, {})) add(sp, positions[i++], reserve);
    }
  }
}

const ariSpent = (g) => !g || gone(g);
// 下知による退却は、組頭が健在なら踏みとどまる通常の士気判定に任せない。
// 到着時の攻撃命令と予約射撃も止め、既存の退路へ生きたまま退かせる。
function withdrawAriRemnants(g) {
  if (ariSpent(g)) return;
  g.noRout = false; g.morale = 0; g.routed = true;
  g.order = 'flee'; g.fire = false; g.focus = null;
  g.path = null; g.onArrive = null;
  for (const u of g.units) if (u.alive && !u.isPlayer) {
    u.fleeing = true; u.routIn = 0;
    u.target = null; u.atk = null; u.swing = null; u.bind = null;
    u.charging = false; u.cheer = 0;
  }
}
// 射撃休止中に退いた組や、前の戦の予約で新しい下知を覆さない。
function resumeAriFire(rt, flags, g) {
  if (rt.flags !== flags || flags.ending || rt.over || ariSpent(g) || g.retreatOnly || g.order === 'retreat' || g.order === 'flee') return;
  g.fire = true;
}
// 退き太鼓で町の控えも木戸へ向かう。防衛が始まってから遠い町を出発させない。
// 既存の兵が砦の東口まで歩き、寄せの下知までは町側に留まる。
function musterAriCounterattack(rt) {
  const posts = [
    ['侍町から寄せ返す荒木勢', 30, 0], ['侍町の鉄砲衆', 36, -6],
    ['南の通りから来る荒木勢', 44, 6], ['荒木久左衛門の手', 52, -8],
  ];
  for (const [name, dx, dz] of posts) {
    const g = rt.flags.defenders.get(name);
    if (ariSpent(g)) continue;
    g.path = null; g.focus = null; g.noAI = true;
    g.order = 'move'; g.formation = 'column'; g.colW = 2;
    g.dest = { x: GATE.x + dx, z: GATE.z + dz };
    g.onArrive = (q) => { q.anchor = q.dest; q.order = 'hold'; q.onArrive = null; };
  }
}
function sendAriFriends(rt, at, hold) {
  let i = 0;
  for (const g of [...rt.flags.oda, rt.flags.aid, ...(rt.flags.committed || [])]) {
    if (ariSpent(g)) continue;
    const ranged = g === rt.flags.tgun;
    // 後詰が増えても持ち場を外へ延ばさない。六つの持ち場を使い回し、確保の輪内に収める。
    const offset = ranged ? 0 : (i++ % 6) * 7;
    // 11/5 遊んで直す（一5）：町筋を上る組が三十五メートル先の敵へ寄り道し、本人が辻に着いた時に味方が一人だった。
    //   辻へ上る間は十四メートル内の敵だけと組み合い、着いてから元の広さで探す。
    g.noAI = true; g.seekRange = hold ? 35 : 14; g.formation = 'column'; g.colW = 2;
    g.path = null; g.onArrive = null;
    g.ariArrivalAt = null;
    // 鉄砲は行軍中も射程内の敵を狙うため、町筋の途中で射撃を続けて列から遅れる。
    // 槍の組にも鉄砲・弓が混じる。射手の組だけでなく、混成の組も到着まで射撃を止める。
    // 下知し直した時も元の射撃状態を覚えておく。
    const marchRanged = g.units.some((u) => u.type === 'gun' || u.type === 'bow');
    if (marchRanged) {
      g.ariMarchFire ??= g.fire !== false;
      g.fire = false;
      for (const u of g.units) { u.target = null; u.aiT = 0; }
    }
    // 11/6 町筋を二列で上る間に横から撃たれ、辻へ着く前に組ごと崩れて逃げた（味方0人で辻を押さえられない）。
    // 滝川の手は内応で開いた口から勢いに乗って入った（史実）。辻と木戸の段の間は組を崩さず、討たれた分だけ減る。
    if (!g.civ) { g.noRout = true; g.morale = Math.max(g.morale || 0, 100); }
    g.order = 'move'; g.focus = null;
    // 11/6 kaito 一5：町筋を歩いて辻まで百秒かかり、本人一人が先を走った。夜討ちの寄せは駆け足で行き先へ（着いたら元の歩み）。
    g.ariSpeed0 ??= g.speed;
    g.speed = Math.max(g.ariSpeed0 || 0, 3.6);
    // 西岸の槍は三段。隣の組は七メートル、後詰は六メートル空け、列を重ねない。
    g.yariRanks = hold ? 3 : 2;
    g.ariMarchWidth ??= g.width;
    g.width = Math.min(g.ariMarchWidth || 5, 5);
    g.dest = hold ? { x: at.x - (ranged ? 9 : 4 + Math.floor(offset / 21) * 6), z: at.z + (ranged ? 0 : (offset % 21) - 7) }
      : { x: at.x + (ranged ? 2 : (offset / 7 % 2 ? 3 : -3)),
        z: at.z + (ranged ? 10 : 3 - Math.floor(offset / 14) * 7) };
    // 辻の西の町屋と東の柵の間へ収める。幅十四メートルの列で壁を押し続けない。
    // 辻を取る役目は追撃ではない。後詰も輪の内に収め、十二秒の確保に加わる。
    g.onArrive = (q) => {
      q.anchor = q.dest; q.order = 'hold'; q.seekRange = 35; q.formation = ranged ? 'line' : 'yari';
      if (marchRanged) { q.fire = q.ariMarchFire; q.ariMarchFire = undefined; }
      if (hold) q.facing = Math.PI / 2;
      q.onArrive = null;
      if (q.ariSpeed0 !== undefined) q.speed = q.ariSpeed0;
    };
    // 11/6 組の頭（anchor）が町屋を突き抜けてまっすぐ進み、兵は家の裏に詰まって辻まで百秒・木戸まで百五十秒かかった。
    // 木戸から辻への町筋（ARIOKA_ROADS の一本目）の曲がり角を順にたどる。帰りは同じ角を逆に。
    const way = ariStreetWay(g.center(), g.dest, hold);
    // 後列も通りの折れに沿わせ、角で町屋へ押し付けられないようにする。
    // 出発点を残すと、最初の区間から道に沿う持ち場を計算できる。
    if (way.length > 1) {
      g.roadColumn = true; g.followColumnRoad = true;
      g.order = 'path'; g.path = [[g.anchor.x, g.anchor.z], ...way]; g.pathIdx = 0;
    }
  }
}
// 終点まで歩いた列は、後列の持ち場合わせだけで射撃と応戦を止め続けない。
// 道中の角は省かず、同じ通りへ実際に着いた戦える兵が六割いる時だけ展開する。
function ariMarchArrival(rt) {
  const F = rt.flags;
  if (F.ariArrivalCheckAt > rt.t) return;
  F.ariArrivalCheckAt = rt.t + .5;
  for (const g of rt.army.groups) {
    if (g.team !== 0 || !g.followColumnRoad || g.order !== 'path' || !g.onArrive
      || !g.dest || !g.path || g.pathIdx < g.path.length || ariSpent(g)) {
      g.ariArrivalAt = null;
      continue;
    }
    g.ariArrivalAt ??= rt.t;
    if (rt.t - g.ariArrivalAt < 8) continue;
    const post = g.ariArrivalPost || (g.ariArrivalPost = { x: 0, y: 0, z: 0 });
    post.x = g.dest.x; post.z = g.dest.z; post.y = rt.world.heightAt(post.x, post.z);
    let ready = 0, arrived = 0;
    for (const u of g.units) if (ariAble(u)) {
      ready++;
      if (!u.downed && !u.climb && !(u.pinT > rt.t)
        && Math.hypot(u.pos.x - post.x, u.pos.z - post.z) <= 8
        && Math.abs(u.pos.y - post.y) <= 3 && !rt.army.wallBetween(u.pos, -1, post)) arrived++;
    }
    if (ready && arrived >= Math.ceil(ready * .6)) {
      const arrive = g.onArrive;
      g.onArrive = null; g.ariArrivalAt = null;
      arrive(g);
    }
  }
}
const ARI_STREET = [[GATE.x - 6, GATE.z], [GATE.x + 4, GATE.z], [TOWN_X - 24, GATE.z], [TOWN_X - 12, -70], [TOWN_X, -14]];
const ARI_TOWN_WAY = ARI_STREET.slice(1), ARI_TOWN_WAY_BACK = ARI_TOWN_WAY.slice().reverse();
function ariStreetWay(c, dest, back) {
  // 焼け跡と奥の木戸は辻から北へ続く通り。斜めの町筋から直接向かうと町屋を横切る。
  // 北の通りにいる組が木戸側へ戻る時も、辻を経て同じ町筋を戻す。
  const north = (p) => Math.abs(p.x - TOWN_X) <= 8 && p.z < ARI_JUNCTION.z;
  let road = ARI_STREET;
  if (north(c) || north(dest)) road = [...road, [TOWN_X, Math.min(north(c) ? c.z : ARI_JUNCTION.z, north(dest) ? dest.z : ARI_JUNCTION.z)]];
  if (back) road = road.slice().reverse();
  // 最寄りの角でなく、通りのどの辺まで来たかを調べる。角の手前で
  // 下知し直した後詰も、その角を通過済みとして町屋へ直進させない。
  const along = (p) => {
    let best = Infinity, at = 0;
    for (let i = 0; i < road.length - 1; i++) {
      const [x, z] = road[i], dx = road[i + 1][0] - x, dz = road[i + 1][1] - z;
      const t = Math.max(0, Math.min(1, ((p.x - x) * dx + (p.z - z) * dz) / (dx * dx + dz * dz || 1)));
      const d = (p.x - x - dx * t) ** 2 + (p.z - z - dz * t) ** 2;
      if (d < best) { best = d; at = i + t; }
    }
    return at;
  };
  const from = along(c), to = along(dest), corners = [];
  // 近い行き先でも間に角があれば通る。同じ辺の途中なら直接進む。
  if (to >= from) {
    for (let i = Math.floor(from) + 1; i <= to; i++) corners.push(road[i]);
  } else {
    for (let i = Math.ceil(from) - 1; i >= to; i--) corners.push(road[i]);
  }
  return [...corners, [dest.x, dest.z]];
}
function ariStage(o, defending) {
  const orders = defending ? o.waves : [{ t: 0, foes: o.foes }, ...o.later];
  return {
    // 辻も木戸も持ち場を守る段。試し役が遠い射手を追って印から離れない。
    kind: 'hold', max: defending ? 410 : o.max,
    // 追加の段は局地の目安を過ぎても、本人と組が確保するまで続ける。
    // 戦全体の攻めの期限は update で扱い、共通の段の期限にも達成を代行させない。
    limit: defending || o.passOnLimit ? Infinity : o.lenient ? (o.limit ?? Infinity) : undefined,   // 残兵が退いた後も、本人と組の確保を待つ。
    noHardCap: !!(defending || o.passOnLimit || o.lenient),
    // 持ち場で構えるのは任務の一部。共通の放置判定で味方を突撃させず、下の期限で決着させる。
    idleAdvance: false,
    ariOrders: orders,
    start(rt, C) {
      C.at = o.at; C.goal = o.at; C.defending = defending;
      C.orders = orders.slice(); C.inT = 0; C.lostT = 0; C.lastOrderT = -8; rt.flags.ariHoldLate = false;
      C.post = { x: o.at.x, y: rt.world.heightAt(o.at.x, o.at.z), z: o.at.z };
      C.botRadius = o.r || 16; C.scanAt = 0; C.enemy = 0; C.friend = 0; C.rangedEnemy = 0;
      rt.banner(o.title, o.sub); rt.objRemove('main'); rt.obj('dp', o.obj(rt), 'main', true);
      ariMark(rt, 'dp', () => { const w = gateWay(rt.army, rt.player.u, C.at); return w === C.at && ariHouseDetour(rt, rt.player.u.pos, C.at) || w; }, () => o.label || o.title);
      const reserve = rt.flags.reserves[defending ? 1 : 0];
      if (!ariSpent(reserve)) {
        // 同じ控えを次の段でも呼ぶ。重複すると行軍の並びを二度割り当て、後詰を輪の外へ押し出す。
        const committed = rt.flags.committed || (rt.flags.committed = []);
        if (!committed.includes(reserve)) committed.push(reserve);
        rt.bark('後詰が続く。組と持ち場を固めよ');
      }
      // 辻も十二秒守る持ち場。木戸と同じ地形に沿う印で、集まる範囲を示す。
      rt.zone('dp', o.at.x, o.at.z, o.r || 16);
      // 辻でも三段の守備配置を使う。通りの経路は現在地と行き先から選ぶ。
      sendAriFriends(rt, o.at, defending);
      for (const [who, words, dur] of o.say || []) rt.say(who, words, dur || 4);
    },
    tick(rt, C, m, ctx, el, dt) {
      if (rt.flags.ending) return false;
      // 辻の守りは後詰の到着を百四十八秒で打ち切らない。
      // 敵による奪回は下で判定し、攻め全体の期限は update に任せる。
      let limit = defending ? Infinity : o.lenient ? (o.limit ?? Infinity) : o.max;
      if (!o.lenient && el > limit) { C.timeout = true; return true; }
      // 10/31 小隊を一組ずつ順に出さない。段の初めに、この段の荒木勢を全部一斉に寄せる（大軍で押し寄せる）。
      // 台詞と見出しは元の刻みのまま流す。
      if (!C.dispatched) {
        C.dispatched = true;
        for (const order of C.orders) {
          const foes = order.foes(rt, m);
          for (const sp of foes) {
            const g = rt.flags.defenders.get(sp.name); if (ariSpent(g)) continue;
            g.noAI = true; g.fire = !(rt.flags.gunResumeAt > rt.t); g.focus = null; g.path = null;
            if (!g.fire) {
              const flags = rt.flags;
              rt.after(flags.gunResumeAt - rt.t, () => resumeAriFire(rt, flags, g));
            }
            g.order = 'move'; g.seekRange = 35; g.ariEngaged = false;
            g.formation = 'column'; g.colW = 2;
            const ranged = sp.kind === 'gun' || sp.list.every((s) => s.type === 'gun' || s.type === 'bow');
            // 射手は町側から口を狙う。槍の列と同じ狭い土橋へ詰め込まない。
            // 新手を同じ一点へ重ねない。土橋は既存の二列で渡り、西岸と辻で組ごとに展開する。
            const flank = C.groups.length % 2 ? 1 : -1;
            g.dest = { x: C.at.x + (defending ? ranged ? 18 : 2 : ranged ? 10 : 4),
              // 木戸脇の射手も七メートルの戸口を見通せる位置で構える。
              z: C.at.z + flank * (defending ? 2 : 5) };
            if (o.fromSide) {
              // 辻へは侍町と南の通りから寄せる。来た向きのまま辻の手前で構え、本人と味方へ槍を向ける。
              const ox = g.anchor.x - C.at.x, oz = g.anchor.z - C.at.z, ol = Math.hypot(ox, oz) || 1;
              const reach = ranged ? 15 : 5;
              g.dest = { x: C.at.x + ox / ol * reach + flank * oz / ol * 2, z: C.at.z + oz / ol * reach - flank * ox / ol * 2 };
              // 11/19 クラウド kaito2：描かずの数えで、本人を的にした鉄砲の一割余りが荒木の槍の列に射線を塞がれた（射手が槍の組の真後ろ二歩横に着く）。
              //   射手は槍の列から横へ五〜七歩ずらし、辻まで町屋に遮られない所を選ぶ（無ければ元の所）
              if (ranged) {
                const near = [];
                for (const q of SOLIDS) if (q.x1 > C.at.x - 30 && q.x0 < C.at.x + 30 && q.z1 > C.at.z - 30 && q.z0 < C.at.z + 30 && q.x1 - q.x0 > 1 && q.z1 - q.z0 > 1) near.push(q);
                search: for (const side of [7, 5, -5, -7]) for (const r of [14, 12, 16]) {
                  const x = C.at.x + ox / ol * r + flank * oz / ol * side, z = C.at.z + oz / ol * r - flank * ox / ol * side;
                  if (ariSegHit(x, z, C.at.x, C.at.z, near) || ariSegHit(x, z, x + .1, z + .1, near)) continue;
                  g.dest = { x, z }; break search;
                }
              }
            }
            g.yariRanks = defending ? 3 : 2;
            // 西の横槍は町屋の南を回って辻へ入る。直進すると町屋の壁へ六人が重なる。
            if (sp.via) {
              g.order = 'path'; g.path = [...sp.via, [g.dest.x, g.dest.z]]; g.pathIdx = 0;
            }
            if (sp.morale !== undefined) g.morale = Math.min(g.morale, sp.morale);
            g.facing = Math.atan2(C.at.x - g.anchor.x, C.at.z - g.anchor.z);
            // 10/31 槍の組は着いたら本人を目がけて押す（一組おきに。残りは口を固める）。
            // 11/19 クラウド kaito2（act bot『歯ごたえがない』：九分で受けた傷0・受け流し59回／七分で9）：槍の組は皆押し、一組おきの組は本人を的にする
            const hunt = !ranged, huntMe = hunt && C.groups.length % 3 === 0;   // 11/21：K467 の寄せと重なり act bot が段3で囲まれ倒れた（1/3）→ 本人を的にするのは三組に一つ
            g.onArrive = (q) => { q.ariEngaged = true; q.order = 'hold'; q.formation = sp.formation || (ranged ? 'line' : 'yari'); if (defending) q.facing = o.fromSide ? Math.atan2(C.at.x - q.anchor.x, C.at.z - q.anchor.z) : -Math.PI / 2;
              // 混成の組の弓まで本人だけに固執させず、射線の通る近い敵にも応戦する。
              if (hunt && rt.player.u.alive) { q.order = 'attack'; q.focus = huntMe ? rt.player.u : null; q.seekRange = Math.max(q.seekRange || 0, 30); } };
            g.aggro = 16;
            // 11/6 fix61：町屋の陰の鉄砲衆が、塀の角の持ち場へ寄れず五人が一点に重なったまま止まった。
            //   十四秒で兵の展開だけが遅れた時は横に開く。遠い道中で進軍を打ち切らない。
            const arrive = g.onArrive;
            rt.after(14, () => {
              if (g.onArrive !== arrive || g.order !== 'move' || ariSpent(g)) return;
              const c = g.center();
              if (Math.hypot(c.x - g.dest.x, c.z - g.dest.z) > 6) return;
              g.dest = g.anchor = { x: c.x, z: c.z }; g.onArrive = null; arrive(g);
            });
            C.groups.push(g);
          }
        }
        C.lastOrderT = el; C.inT = 0;
      }
      while (C.orders.length) {
        const order = C.orders[0];
        if (el < order.t && !(C.groups.length && C.groups.every(ariSpent) && el - C.lastOrderT >= 8)) break;
        C.orders.shift();
        const foes = order.foes(rt, m);
        const coming = foes.some((sp) => !ariSpent(rt.flags.defenders.get(sp.name)));
        // 牢番・捕虜の知らせには新手が付かない。兵の有無だけで物語の台詞を消さない。
        if (coming || order.fn || !foes.length && order.say) {
          if (order.title) rt.banner(order.title, order.sub);
          if (order.say) rt.say(order.say[0], order.say[1], 4);
        }
        if (order.fn) order.fn(rt, C);
      }
      const p = rt.player.u.pos;
      if (rt.t >= C.scanAt) {
        C.scanAt = rt.t + 0.25; C.enemy = 0; C.friend = 0; C.rangedEnemy = 0;
        for (const u of rt.army.units) {
          // 11/18 夜50-33：町で組み合う組（崩れず・持ち場を持たない飾りの斬り合い）の一人が辻の輪へ流れると、敵一人が永久に残って③の確保（味方が敵の倍）が成らず、
          //   本人が辻に立ったまま1020秒で負けた（act bot：300秒から辻の敵2・味方0 のまま七百秒）。飾りの組は数えない。
          if (u.group?.ariDecor) continue;
          if (!u.alive || u.gone || u.dying || u.fleeing || u.woundOut || u.rearWound || u.noTarget || u.downed || u.climb || u.group?.routed || u.isStruct || u.group?.civ) continue;
          // 遠間から実際に口の味方を狙う射手も、寄せが届いた組として扱う。
          const target = u.atk?.target || u.target;
          // 狙いの記憶だけでは射撃中にしない。射程外や射線を塞がれた射手は辻の確保を止めない。
          const firing = u.team === 1 && !u.group.routed && u.group.fire !== false && (u.type === 'gun' || u.type === 'bow') && !u.sidearm
            && target?.alive && !target.gone && !target.dying && !target.noTarget && !target.woundOut && !target.rearWound && target.team === 0
            && Math.hypot(target.pos.x - C.at.x, target.pos.z - C.at.z) <= (o.r || 16)
            && Math.hypot(target.pos.x - u.pos.x, target.pos.z - u.pos.z) <= u.range
            && !rt.army.shotBlocked(u, target.pos) && !rt.army.hiddenBehind(u, target);
          if (firing) {
            u.group.ariEngaged = true;
            if (Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) > (o.r || 16)) C.rangedEnemy++;
          }
          // 11/18 夜50-01（act bot 1020秒 刻限負け）：辻の守りの段で、後詰の味方六人が輪の縁の外（辻から十七m・(-318,-4)）に重なって止まり、
          //   輪の内の味方が一人以下のまま確保が八百秒成らなかった。守りの段では味方だけ輪の縁から六歩の内も数える（敵の数え方は今のまま）。
          const ud = Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z);
          if (ud > (o.r || 16) + (defending && u.team === 0 ? 6 : 0)) continue;
          if (Math.abs(u.pos.y - C.post.y) > 3 || rt.army.wallBetween(u.pos, -1, C.post)) continue;
          if (u.team === 0) C.friend++;
          else { C.enemy++; u.group.ariEngaged = true; }
        }
      }
      const enemy = C.enemy, friend = C.friend;
      // 兵と同じく、本人も持ち場と同じ高さで、塀を隔てず立っている時だけ数える。
      // 屋根の上や町屋の裏から、辻を確保したり後詰を呼んだりしない。
      const present = Math.hypot(p.x - C.at.x, p.z - C.at.z) <= (o.r || 16)
        && Math.abs(p.y - C.post.y) <= 3 && !rt.army.wallBetween(p, -1, C.post);
      // 11/21 クラウド kaito2（K481 の見張りで達成 465→660秒・act bot 4回に2回 637・657秒）：③『侍町の辻を取れ』で本人が辻に着いた後も、敵二十五〜三十人のまま
      //   期限（段の始めから百七十秒）まで百秒 立ち合いが続いた（着くのに九十秒かかる回）。期限は段の始めからでなく、本人が持ち場に着いてから五十秒を上限に数える
      if (o.passOnLimit && present && C.presentAt == null) C.presentAt = el;
      if (o.passOnLimit && C.presentAt != null) limit = Math.min(limit, C.presentAt + 50);
      // 寄せ返しが四分続いても辻を奪えなければ、本丸へ引き揚げる。
      // 本人と組が辻に残り、局地で敵を上回る時だけ。退いた後の十二秒の確保も必要。
      if (defending && el >= Math.max(o.dur, 240) && !C.orders.length
        && present && friend > 1 && friend > enemy && !C.remnantsRetreated) {
        C.remnantsRetreated = true;
        for (const g of C.groups) withdrawAriRemnants(g);
        rt.say('滝川の組頭', '寄せ返す荒木勢が本丸へ退くぞ。組と辻を固めよ', 4);
      }
      // 通りの残兵が長く粘っても、期限だけでは達成させない。
      // 本人と組が到着してから残兵を退かせ、下の十二秒の確保を経て進む。
      // 11/18 クラウド kaito2（描かずの通し 2回に1回）：惣構えの通りの角の段で、本人が角の二十五 m 手前で荒木の塊（十二〜二十六人）に囲まれ百秒余り抜けられず、
      //   「本人が角の十六 m 内」の時しか期限の退きが働かないので段が終わらなかった（味方の新手は着く度に討たれた）。期限を二十秒過ぎたら、角の四十六 m 内で斬り合う本人にも退きを効かせる
      const stuckNear = !present && el >= limit + 20 && Math.hypot(p.x - C.at.x, p.z - C.at.z) <= (o.r || 16) + 30;
      // 11/22 クラウド 有岡の持ち主（K582・中学生 bot の段4が218〜248秒＝戦 563〜726秒で目安の七分を越える）：奥の木戸の段で本人が木戸に着いても味方が一人のまま、
      //   期限の後 九十秒（本人一人で退かせる待ち）と九十秒（一人の確保の待ち）を待って八十〜九十秒延びていた。本人が持ち場に立っている時の一人の待ちを四十秒に（後詰の到着の約四十秒と同じ）
      const aloneWait = 40;
      if (o.passOnLimit && el >= limit && (present || stuckNear) && (friend > 1 || el >= limit + aloneWait || stuckNear) && !C.remnantsRetreated) {   // 11/17 ヲ三：後詰を出し尽くして本人だけが辻に残ると永久に進まず1020秒で失敗した。九十秒待っても味方が来なければ本人一人で退かせる
        C.remnantsRetreated = true;
        for (const g of C.groups) withdrawAriRemnants(g);
        rt.say('滝川の組頭', '通りの荒木勢が退くぞ。組と角を押さえよ', 4);
      }
      if (!defending && present && !C.arrived) {
        C.arrived = true;
        // 案内の関数を保つ。一度着いても、退いた後は柵と木戸を回って戻る。
        rt.obj('dp', o.obj(rt), 'main', true);
      }
      // 控えを出す前には終えない。守備の目安を過ぎた後は、遠くで足止めされた
      // 一組の到着を必須にせず、本人と味方が実際の口を十二秒押さえた事で決める。
      // 辻も、全ての新手へ進む時間を与えた後は実際の持ち場で判定する。
      // 遠くで足止めされた一組を待つためだけに、無人の辻で時間切れにしない。
      const ready = !C.orders.length && (C.groups.every((g) => ariSpent(g) || g.ariEngaged)
        || (defending ? el >= o.dur : el - C.lastOrderT >= 30));
      // 11/18 kaito2（act bot 1020秒 刻限負け：辻の守りの段に414秒から六百秒・辻の10m で斬り続けた）：守りの目安を過ぎたら荒木の新手を辻へ足さない（敵の倍の味方で確保する決まりが、足され続ける新手で永く満たされない）
      // 11/18 夜50-33：③『侍町の辻を取れ』も、筋書きの組を出し尽くして本人が辻に着いた後は新手を足さず畳む（act bot：245〜316秒に辻へ新手22〜29人が湧き直し、味方0〜3で敵の倍が成らず③が190秒）。
      rt.flags.ariHoldLate = !!(ready && (defending ? el >= o.dur : o.title === '城下の辻' && present && el >= 60));
      // 11/18 クラウド（act bot 1020秒 刻限負け）：「侍町の辻を取れ」で本人が辻に着き、期限で通りの残兵を退かせた後も、
      //   前を埋める荒木の新手（C.groups の外）が辻へ足され続け、敵の倍の味方がそろわず八百秒 斬り続けた。退かせた後は新手を足さず、辻の十六m 内に残る荒木の組も退かせる（四秒ごと）
      if (o.passOnLimit && C.remnantsRetreated) {
        rt.flags.ariHoldLate = true;
        if (!(rt.t < (C.lateSweepAt || 0))) {
          C.lateSweepAt = rt.t + 4;
          for (const g of rt.army.groups) {
            if (g.team !== 1 || ariSpent(g) || g.routed || g.civ || g.noAI || g === rt.flags.ehon?.guard || g === rt.flags.ehon?.general?.group) continue;
            let inside = false;
            for (const u of g.units) if (u.alive && !u.fleeing && (Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) <= (o.r || 16) + 6 || !present && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) <= 14)) { inside = true; break; }   // 角の手前で本人を囲む組も退かせる
            if (inside) withdrawAriRemnants(g);
          }
        }
      }
      // 攻めも守りも、敵の倍の味方で押さえれば確保できる。
      // 守りで敵が三人残るだけで、大勢の味方と十二秒の踏みとどまりを無効にしない。
      // 外から撃つ射手も敵の兵力に含むが、一人だけで大勢の味方の確保を永久に止めない。
      // 射撃と傷の強さは保ち、持ち場の人数と本人の十二秒の踏みとどまりで決める。
      const opposition = enemy + C.rangedEnemy;
      const advantage = friend >= opposition * 2 || defending && friend > opposition && enemy <= 2;
      // 11/18 クラウド kaito2（描かずの通し 3回に1回）：期限で残兵を退かせた後、本人が角の二十 m 東で次の段の守り（侍町から出る新手・奥の木戸の番兵）と組み合い、
      //   角の十六 m 内へ戻れず百秒余り段が終わらなかった。退かせて四十秒たてば、角の四十六 m 内にいる本人を持ち場に着いたと数える（次の段の守りは次の段の相手になる）
      const nearHeld = o.passOnLimit && C.remnantsRetreated && el >= limit + 40 && Math.abs(p.y - C.post.y) <= 3 && Math.hypot(p.x - C.at.x, p.z - C.at.z) <= (o.r || 16) + 30;
      // 11/18 夜50-01：守りの段で寄せを出し尽くし目安を百五十秒過ぎても確保が成らない時（味方が輪に入れず本人だけ辻に立つ）、
      //   辻の輪の近くに残る荒木の組を退かせ、敵のいない辻に本人が十二秒立てば守り切ったとする（本人のせいでない時切れを出さない）。
      const nearPostD = present || Math.hypot(p.x - C.at.x, p.z - C.at.z) <= (o.r || 16) + 6 && Math.abs(p.y - C.post.y) <= 3;
      // 11/19 クラウド kaito2：act bot 3回に1回、辻の守りの段が318秒（264→582秒）続いた＝この退きが三百秒まで待つので。目安を九十秒過ぎた百八十秒で効かせる
      // 11/19 06:30 kaito2：act bot 3回に1回まだ198秒（240→438秒）・戦が604秒（目安4〜7分を越える）。ふだんは五十〜九十五秒で済むので、退きを百四十秒に
      // 11/22 03:20 クラウド 有岡の持ち主（K582 流れ）：守りの長さを七十二秒に詰めた後も、退きと最後の決まりは百秒を元に数えていて、中学生 bot の段4が揺れた（戦440〜602秒）。守りの長さを元に数える（百四十→百十二秒・二百八十→二百五十二秒）
      const lateHold = defending && ready && !C.orders.length && el >= o.dur + 20 && nearPostD;
      if (lateHold && !(rt.t < (C.lateSweepAt || 0))) {
        C.lateSweepAt = rt.t + 4;
        if (!C.remnantsRetreated) { C.remnantsRetreated = true; for (const g of C.groups) withdrawAriRemnants(g); rt.say('滝川の組頭', '寄せ返す荒木勢が本丸へ退くぞ。辻を固めよ', 4); }
        for (const g of rt.army.groups) {
          if (g.team !== 1 || ariSpent(g) || g.routed || g.civ || g.noAI || g === rt.flags.ehon?.guard || g === rt.flags.ehon?.general?.group) continue;
          for (const u of g.units) if (u.alive && !u.fleeing && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) <= (o.r || 16) + 8) { withdrawAriRemnants(g); break; }
        }
      }
      // 11/19 夜50-04（Opus 宛て：act bot 3回に1回、③『侍町の辻を取れ』で本人が辻の輪の外に立ち続け、上の退き・近さの決まりのどれにも掛からず1020秒の刻限負け）：
      //   期限付きの攻めの段は、目安を四分過ぎたら本人の居場所によらず確保した事にする（本人のせいでない時切れを出さない最後の決まり）
      //   守りの段も、寄せを出し尽くして目安を三分過ぎたら、本人が輪の外で組み合っていても守り切った事にする（act bot：④で本人が辻の外で四百五十秒止まり刻限負け）
      const hardPass = rt.player.u.alive && (o.passOnLimit && !defending && Number.isFinite(limit) && el >= limit + 150
        || defending && !C.orders.length && el >= o.dur + 180);
      const secure = hardPass || ready && (present || nearHeld || lateHold) && (friend > 1 || o.passOnLimit && C.remnantsRetreated && el >= limit + aloneWait || lateHold && opposition === 0) && (advantage || lateHold && opposition === 0);
      const lastRepelled = !C.orders.length && C.groups.every(ariSpent);
      // 持ち場を離れたり押し返されたら、十二秒の確保を最初から数え直す。
      // 少しずつ減らすだけでは、断続的な滞在を足して達成できてしまう。
      C.inT = secure ? C.inT + dt : 0;
      C.lostT = enemy > friend ? C.lostT + dt : 0;
      // ③でも味方が尽きると確保が永久に進まない。本人が辻に残る間は後詰を呼ぶ。
      C.friendLowT = present && friend < 2 ? (C.friendLowT || 0) + dt : 0;
      // 11/6 遊んで直す：③が長引くと④の寄せに押されて四十秒ほどで負けた（十二3：本人のせいでない負け）。
      //   滝川の手は数千。辻が押されたら三度まで、木戸から来た通り（辻の南）を後詰の組が駆け付ける（史実の侍町はほぼ抵抗なく取れた）。
      //   辻を失うのは、後詰を出し尽くした後か、本人が辻を離れている時だけ。
      if ((C.friendLowT >= 10 || defending && o.fromSide && C.lostT >= 10) && (C.relief || 0) < 3 && el >= (C.reliefAt || 0)) {
        const g = ariReinforce(rt, C.at, 11);
        C.reliefAt = el + 30;
        if (g) {
          C.relief = (C.relief || 0) + 1; C.lostT = 0; C.friendLowT = 0;
          C.reliefGroup = g; C.reliefUntil = el + 60;
          g.name = '滝川の後詰の組';
          if (C.relief === 1) rt.say('滝川一益', '辻が押されておる。後詰を出せ！', 3.5);
        }
      }
      // 三度目も、木戸から辻へ走る約四十秒を待つ。出発から二十四秒で
      // 奪回扱いにすると、呼んだ後詰が着く前に負ける。到着・壊滅・一分で猶予を終える。
      if (defending && o.fromSide && present && el < (C.reliefUntil || 0)
        && !ariSpent(C.reliefGroup) && C.reliefGroup.order === 'path') C.lostT = 0;
      if (!defending) {
        // 全滅を求めず、一つの辻を組と十二秒確保すれば次の下知へ。
        C.goal = C.at;
        if (rt.t >= (C.guideAt || 0)) {
          C.guideAt = rt.t + 0.5;
          const instruction = o.obj(rt);
          rt.obj('dp', instruction, 'main', true);
          const deadline = Number.isFinite(limit) ? `／期限あと${Math.max(0, Math.ceil(limit - el))}秒` : '';
          rt.objProgress('dp', present
            ? `味方${friend}人・敵${enemy}人${C.rangedEnemy ? `・射手${C.rangedEnemy}人` : ''}${deadline}`
            : `${o.label || o.title} ${Math.ceil(Math.hypot(p.x - C.at.x, p.z - C.at.z))}m${deadline}`);
        }
        return C.inT >= 12 && el >= (o.minEl || 0);   // minEl：寄せ手が着く前に十二秒で済ませない段（arioka/ の段）
      }
      // 敵が上回る状態が続いた時だけ、木戸を失ったとする。
      // 11/18 夜50-33：辻の輪の縁（十六歩）のすぐ外で寄せ手と斬り合う本人を『辻を離れた』とせず、負けにしない（act bot が辻から16.8m で四十秒斬り続け、後詰も呼ばれず400秒で負けた）。
      //   確保（十二秒）の判定は今の輪のまま。負けの判定だけ六歩の幅を持たせる。
      const nearPost = present || Math.hypot(p.x - C.at.x, p.z - C.at.z) <= (o.r || 16) + 6 && Math.abs(p.y - C.post.y) <= 3;
      if (C.lostT >= 24 && (!o.fromSide || C.relief >= 3 || !nearPost)) { C.failed = true; return true; }
      // 最後の寄せを早く退けても帰り道を四分まで守る。兵や新手は増やさない。
      // 味方の持ち場を輪内に収めた上で、本人と組の十二秒の確保を必須にする。
      // 留守の辻や敵に押されている辻を、経過時間だけで守り切った事にしない。
      const held = rt.t >= 240 && (lastRepelled || el >= o.dur) && C.inT >= 12;
      if (rt.t < (C.guideAt || 0)) return held;
      C.guideAt = rt.t + 0.5;
      // 右上と同じ一行のまま言い替えない（十1）。場の様子は台詞と印で伝える。
      const instruction = o.obj(rt);
      // 横長の携帯では補足が畳まれるため、今する事を札の本文にも出す。
      rt.obj('dp', instruction, 'main', true);
      // 本文の秒数は、確保か寄せの目安のどちらか一つだけにする。
      const approaching = C.groups.reduce((n, g) => n + (!ariSpent(g) && !g.ariEngaged ? 1 : 0), 0);
      const remaining = 1020 - AR_OPEN.KAIMAKU_END - (rt.t - rt.flags.stepT);
      rt.objProgress('dp', `味方${friend}人・持ち場の敵${enemy}人${C.rangedEnemy ? `・射手${C.rangedEnemy}人` : ''}\n${approaching ? `侍町から${approaching}組が移動中／` : C.orders.length ? `新手あと${C.orders.length}組／` : ''}期限あと${Math.max(0, Math.ceil(remaining))}秒`);
      return held;
    },
    end(rt, C, m) {
      // 追加の段も、期限だけで未確保の場所を達成扱いにしない。
      const won = !C.timeout && !C.failed && !rt.flags.ending;
      rt.unmark('dp'); rt.unzone('dp'); rt.unmark('turn');
      if (won) {
        // 取った辻の守りは退き、未出動の控えは主郭の守りに残る。
        if (!defending) for (const g of C.groups) withdrawAriRemnants(g);
        rt.objDone('dp'); rt.award((t) => t.side.push(o.reward), o.reward);
      }
      else rt.objFail('dp');
      if (!won) m.ariFailure = C.failed ? (defending && o.fromSide ? '敵に辻を奪い返された' : '敵に木戸を奪われた')
        : defending ? '辻の守りが整わぬ。寄せを引くぞ'
          : `期限までに${o.label || o.title}を十二秒押さえられなかった`;
      o.onEnd(rt, m, won);
      // 追加の段も、持ち場を取れないまま官兵衛を迎える所へ進めない。
      if (!won && !rt.flags.ending) arioka.lose(rt, m.ariFailure);
    },
  };
}
function ariFight(o) { return ariStage(o, false); }
function ariHold(o) { return ariStage(o, true); }
// 辻から木戸へは通りと砦を回って約百四十メートル。足を傷め、構えて退く時間も残す。
// 11/1：帰り道で寄せ返す荒木勢と斬り合うと 150 秒では戻れず、bot が三度に二度「戻るのが遅れ」で負けた。寄せ返しの数は変えず、戻る時を延ばす。
const ARI_RETURN_LIMIT = 200;
function ariReturnGuide(p) {
  if (p.x > GATE.x + 23 && p.z > GATE.z + 2.5) {
    if (Math.abs(p.x - (TOWN_X + 2)) > .8) return '道の印で通りへ戻れ';
    return '通りを進み、木戸の横道へ';
  }
  if (p.x > GATE.x + 23) return '横道を曲がり、木戸へ戻れ';
  return '土橋を渡り、木戸の外へ戻れ';
}
// 下知と隊の立て直し。待つだけでは手当てを消費せず、傷も戻さない。
function rest(o) {
  return {
    // 木戸への戻りは行軍。近い敵を追わず、構えて道を戻る。
    kind: o.hold ? 'move' : 'rest', max: o.hold ? ARI_RETURN_LIMIT + 35 : o.dur + 1,
    // 帰路で敵を防ぐ間も、帰還用の期限で判定する。
    idleAdvance: !o.hold,
    start(rt, C, m) {
      rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp');
      if (o.at) {
        C.at = o.at; C.goal = o.at;
        C.post = { x: o.at.x, y: rt.world.heightAt(o.at.x, o.at.z), z: o.at.z };
        ariMark(rt, 'dp', () => gateWay(rt.army, rt.player.u, C.at), () =>
          o.hold ? ariReturnGuide(rt.player.u.pos) : o.label || '侍町の辻');
        rt.obj('main', o.hold ? ariReturnGuide(rt.player.u.pos) : ariStageText(rt), 'main', true);
        if (o.hold) rt.objProgress('main', `木戸へ戻るまで${ARI_RETURN_LIMIT}秒`);
        sendAriFriends(rt, o.at, !!o.hold);
        if (o.hold) musterAriCounterattack(rt);
      }
      if (o.bark) rt.bark(o.bark);
      let wait = 0.5;
      for (const [who, words, dur] of o.say || []) {
        rt.after(wait, () => { if (!rt.flags.ending) rt.say(who, words, dur || 4); });
        wait += (dur || 4) + 0.3;
      }
      if (o.fn) o.fn(rt, m);
    },
    tick(rt, C, m, ctx, el) {
      if (!o.hold) return el >= o.dur;
      // 木戸外へ実際に着いてから防衛へ進む。期限は表示・段の保険とそろえる。
      C.arr = rt.distTo(C.at) <= 13 && rt.player.u.pos.x < GATE.x - 1;
      if (C.arr) C.homeSince ??= rt.t;
      else C.homeSince = null;
      if (!C.arr && el >= ARI_RETURN_LIMIT) {
        arioka.lose(rt, '木戸へ戻るのが遅れ、攻めを打ち切った');
        return false;
      }
      // 遊び手だけが先に戻っても、先手が土橋を渡る間を置く。
      // 半秒ごとに既存の兵を数える。三十秒の保険は本人の到着から数える。
      if (C.arr && el >= o.dur && rt.t >= (C.friendScanAt || 0)) {
        C.friendScanAt = rt.t + .5; C.friendsHome = 0;
        for (const g of rt.flags.oda) for (const u of g.units) {
          if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget
            && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) <= 13
            && Math.abs(u.pos.y - C.post.y) <= 3 && !rt.army.wallBetween(u.pos, -1, C.post)) C.friendsHome++;
        }
      }
      if (rt.t >= (C.guideAt || 0)) {
        C.guideAt = rt.t + .5;
        rt.obj('main', !C.arr
          ? ariReturnGuide(rt.player.u.pos)
          : '土橋の前を固めよ', 'main', true);
        rt.objProgress('main', !C.arr
          ? `木戸へ戻るまで${Math.max(0, Math.ceil(ARI_RETURN_LIMIT - el))}秒`
          : '土橋の前に槍を並べ、荒木勢を通すな');
        if (C.arr && !C.waitTold) {
          C.waitTold = true;
          rt.say('滝川の組頭', 'ここで槍をそろえよ。土橋を渡らせるな', 4);
        }
      }
      return C.arr && el >= o.dur && (C.friendsHome >= 2 || rt.t - C.homeSince >= 30);
    },
  };
}

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 城攻めの夜：荒木勢は惣構えの内の辻ごとに固まり、侍町の控えが道を歩いて木戸へ進む。新しく兵を作らない
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n });
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, kind: 'gun', dmg: 1, ...o });
// 辻と木戸の確保は、追撃せず持ち場へ戻る下知。
// 避け足は持ち場の内に残す。既に離れた時は、さらに遠ざかる足だけを外す。
// 手動の歩き・退き太鼓の帰還・他の戦の退避には触れない。
function ariPostStepAllowed(rt, point) {
  const C = rt.flags.dpOn && rt.flags.dp?.cur;
  if (rt.flags.ending || rt.over || !C?.at) return true;
  const p = rt.player.u.pos;
  if (C.s.kind === 'move' && !C.arr) {
    // 帰還の下知でも危険な一撃は避けるが、次の曲がり角から離れる足は選ばない。
    // 町の味方を追う退避と木戸への帰還が交互に出て、期限を使い切るのを防ぐ。
    const way = gateWay(rt.army, rt.player.u, C.at);
    return Math.hypot(point.x - way.x, point.z - way.z)
      <= Math.max(2, Math.hypot(p.x - way.x, p.z - way.z) + .15);
  }
  if (C.s.kind !== 'hold') return true;
  const distance = Math.hypot(p.x - C.at.x, p.z - C.at.z);
  return Math.hypot(point.x - C.at.x, point.z - C.at.z) <= Math.max(C.botRadius || 16, distance);
}
// 一歩の回避と休む終点を分ける。終点には到着判定の三メートル分も余裕を残す。
// 範囲外で休み続け、十二秒の確保を一度も始められない案内を防ぐ。
function ariPostRestAllowed(rt, point) {
  const C = rt.flags.dpOn && rt.flags.dp?.cur;
  if (rt.flags.ending || rt.over || !C?.at || C.s.kind !== 'hold') return ariPostStepAllowed(rt, point);
  return Math.hypot(point.x - C.at.x, point.z - C.at.z) <= (C.botRadius || 16) - 3;
}
// 段のファイル（arioka/）へ渡す有岡の段の部品
function ariH() { return { rest, ariFight, uS, uA, uG, gunLine, GATE, TOWN_X, reinforce: ariReinforce, ambush: ariAmbush }; }
// 11/18 クラウド（act bot の描かずの数え）：焼け跡の段は、隠れた荒木勢が前の段で尽きていると、八十秒のあいだ本人の六m内に敵が一人もいなかった
// （新手は二十〜五十m先で味方に止められる）。焼け跡の陰から、本人の十m先の北の通り（屋敷の無い通りの真ん中）へ荒木の兵を出し、本人へ懸からせる。
function ariAmbush(rt, name, n = 5) {
  const me = rt.player.u;
  if (!me.alive || rt.flags.ending) return null;
  // 11/19 06:45 kaito2：十m 先は肩越しの画面の真ん中で、兵が通りに急に湧いて見えた。煙の奥の十八m 先から駆け出させる
  const at = { x: TOWN_X + (Math.random() < 0.5 ? -1.5 : 1.5), z: Math.min(me.pos.z, -58) - 18 };
  const g = enemyGroup(rt, { fixed: true, faction: 'araki', name, anchor: at, facing: Math.atan2(me.pos.x - at.x, me.pos.z - at.z),
    order: 'attack', width: 5, formation: 'yari', colW: 2, aggro: 8, morale: 55, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
  dress([uS(1), uA(Math.max(1, n - 1))], ARAKI));
  g.focus = me; g.seekRange = 30;
  return g;
}
// 段の変わり目に、木戸から滝川の新手の組が通りを上って来る（kaito 11/8：長い戦で味方が空にならない）。本物の兵の数を見て人数を決める
function ariReinforce(rt, at, n = 10) {
  // 搬送されて戦場を離れた生存兵は、後詰の人数枠を塞がない。
  let real = 0; for (const u of rt.army.units) if (u.alive && !u.gone) real++;
  const k = Math.min(n, 228 - real);
  if (k < 4) return null;
  const g = allyGroup(rt, { name: '滝川の新手の組', anchor: { x: GATE.x + 6, z: GATE.z + 3 }, facing: Math.PI / 2, order: 'move', formation: 'column', width: 4, aggro: 10, morale: 90 },
    dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: k - 1 }], TAKIGAWA));
  // 新手も先手と同じく、後列まで曲がり角をたどる二列で入る。
  g.roadColumn = true; g.followColumnRoad = true; g.colW = 2;
  g.order = 'path'; g.path = [[g.anchor.x, g.anchor.z], ...ariStreetWay(g.center(), at, false)]; g.pathIdx = 0;
  g.noAI = true; g.noRout = true; g.seekRange = 14;
  g.ariSpeed0 = g.speed; g.speed = Math.max(g.speed || 0, 3.6);
  g.onArrive = (q) => { q.anchor = { x: at.x, z: at.z }; if (at.face != null) q.facing = at.face; q.order = 'hold'; q.formation = 'yari'; q.seekRange = 35; q.speed = q.ariSpeed0; q.onArrive = null; };
  (rt.flags.committed || (rt.flags.committed = [])).push(g);
  return g;
}
// 11/18 クラウド04 見回り：木戸から上る滝川の新手の組（縦隊・道順）が、本人の所の詰まりで行き先の十m手前に七人重なって二十秒止まった。
//   着いた判定は変えず（緩めると侍町の辻の段が進まない回が出た）、道の上で八秒動けない組だけ、その場で槍の並びに広げて構えさせる
// 11/18 クラウド kaito2（有岡の持ち主）：act bot 467秒で討ち取り39・本人へ来た刃が二度だけ（受けた傷0・「簡単すぎる」）。
//   荒木勢は味方の大勢と斬り合い、本人はその背を突くだけだった。木戸の内から辻を守る段まで、本人から二十二m 内の荒木の組を一つ本人へ向ける
//   （近くで味方と組み合う者はそのまま応戦し、手の空いた者が本人へ来る）。向けるのは一度に一組・十五秒まで。本丸の久左衛門の手と番の者は動かさない。
function ariPressPlayer(rt) {
  const F = rt.flags, me = rt.player.u;
  if (!me.alive || me.invuln || (F.step || 0) < 1 || F.kanbePending || rt.t < (F.pressAt || 0)) return;
  F.pressAt = rt.t + 2;
  const cur = F.pressG;
  if (cur && !cur.routed && cur.focus === me && rt.t < F.pressEnd) return;
  if (cur && cur.focus === me) { cur.focus = null; if (!cur.routed) cur.order = F.pressOrder; F.pressNext = rt.t + 6; }
  F.pressG = null;
  if (rt.t < (F.pressNext || 0)) return;
  let best = null, bd = 22;
  for (const g of rt.army.groups) {
    if (g.team !== 1 || g.routed || g.noAI || g.civ || g.focus || g.order === 'retreat' || g === F.ehon?.guard || g === F.ehon?.general?.group || /本陣|旗本/.test(g.name || '')) continue;
    for (const u of g.units) {
      if (!u.alive || u.gone || u.fleeing || u.mounted || u.type === 'gun' || u.type === 'bow' || u.type === 'busho') continue;
      const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z);
      if (d < bd) { bd = d; best = g; }
    }
  }
  if (!best) return;
  F.pressOrder = best.order; best.focus = me; best.order = 'attack'; best.seekRange = Math.max(best.seekRange || 0, 30);
  F.pressG = best; F.pressEnd = rt.t + 15;
}
// 11/19 クラウド kaito2（act bot 0236 の186秒★★：荒木の新手6人が attack・行き先無のまま (-347,-150) に重なった。待つ備を畳んで三十四秒の後）。
//   畳む段（reserveFold）で逃げ散らせるのは共通の待つ備（_dr.E）だけで、前を埋める備（_ff.groups）は残り、敵のいない所で攻めの下知のまま一点に寄っていた。
//   畳む段では、前を埋める荒木の新手のうち誰とも組み合っていない組を退かせる（三秒ごと・本人と斬り合う者がいる組はそのまま）。
function ariFoldFill(rt) {
  const F = rt.flags;
  if (!(rt.t >= (F.foldFillAt || 0))) return;
  F.foldFillAt = rt.t + 3;
  if (!arioka.reserveFold(rt)) return;
  for (const g of F._ff?.groups || []) {
    if (!g || g.team !== 1 || g.routed || ariSpent(g)) continue;
    let busy = false;
    for (const u of g.units) if (u.alive && !u.gone && (u.atk || u.swing || u.bind || (u.target && u.target.alive && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 6))) { busy = true; break; }
    if (!busy) withdrawAriRemnants(g);
  }
}
function ariReinforceUnstick(rt) {
  const F = rt.flags;
  if (!(rt.t >= (F.unstickAt || 0))) return;
  F.unstickAt = rt.t + 2;
  // 11/19 07:20 クラウド kaito2（act bot 436秒）：味方の新手十二人が (-337,2) で attack のまま、前の荒木勢を前に二十秒動かなかった（町屋の向こうの敵を狙って詰まる）。
  //   辻より先の段で、攻めの号令の味方の新手が十秒三 m も動かない時は、通りをたどって本人の前（ariAidSpot）へ付け直す。
  const me = rt.player?.u;
  if (me?.alive && arioka.missionOf(rt) >= 2) for (const g of rt.army.groups) {
    // 11/21 20:20 クラウド 有岡の持ち主（K582・act bot 2008 の396秒 ★★）：付け直しで path にした味方の新手十人が、行き先の百五 m 手前 (-335,-18) で
    //   一点に重なって止まった（通りの角で先の点が塞がる）。path のまま十秒一・五 m も動かない時は、その場で攻めの構えに戻す（三十秒は付け直さない）。
    if (g && g.team === me.team && !g.routed && g.count && g.order === 'path' && (g.isReserve || g.name === '味方の新手')) {
      const c = g.center(), P = g._ariPathSt;
      if (!P || Math.hypot(c.x - P.x, c.z - P.z) > 1.5) { g._ariPathSt = { x: c.x, z: c.z, t: rt.t }; continue; }
      // 11/28 クラウド 有岡の持ち主（act bot 0732 の713秒 ★★）：締めの段で味方の新手十一人が行き先の三m 手前で path のまま重なった。待ちを十秒から六秒へ。
      if (rt.t - P.t < 6) continue;
      g._ariPathSt = null; g._ariAtkSt = { x: c.x, z: c.z, t: rt.t + 20 };
      g.path = null; g.onArrive = null; g.anchor = { x: c.x, z: c.z }; g.order = 'attack'; g.formation = 'yari';
      for (const u of g.units) { u.aiT = 0; u.target = null; }
      continue;
    }
    if (g) g._ariPathSt = null;
    if (g.team !== me.team || g.routed || !g.count || g.order !== 'attack' || !(g.isReserve || g.name === '味方の新手')) { if (g) g._ariAtkSt = null; continue; }
    const c = g.center(), S = g._ariAtkSt;
    if (!S || Math.hypot(c.x - S.x, c.z - S.z) > 3) { g._ariAtkSt = { x: c.x, z: c.z, t: rt.t }; continue; }
    if (rt.t - S.t < 10) continue;
    g._ariAtkSt = null;
    if (Math.hypot(c.x - GATE.x, c.z - GATE.z) < 30) {   // 木戸の口では道を塞ぐので付け直さない（11/19 act bot 130秒 木戸の内で本人が詰まった回）
      // 11/28 クラウド 有岡の持ち主（K582・act bot 0712 の446秒 ★★）：本人が侍町の奥にいる続きの段で、味方の新手八人が木戸の外 (-416,-89) で
      //   attack のまま十九m 先を狙って一点に重なり、散らしても五秒で重なり直した。本人が六十m より遠い時は、その場を持ち場に槍の並びで構えさせる（散らしが効く）。
      if (Math.hypot(c.x - me.pos.x, c.z - me.pos.z) > 60) { g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.dest = null; g.onArrive = null; g.formation = 'yari'; for (const u of g.units) { u.aiT = 0; u.target = null; } }
      // 11/28 14:20 クラウド 有岡の持ち主（K582・act bot 1134 の597秒・1231 の835秒 ★★）：本人が六十m の内でも、味方の新手九人が木戸の外 (-416,-90) で
      //   attack のまま五十二m 先を狙って一点に重なった。木戸の口を空けるため、本人と反対の側へ十四m・脇へ八m 退いた所を持ち場に槍の並びで構えさせる。
      else {
        let dx = c.x - GATE.x, dz = c.z - GATE.z; const pdx = me.pos.x - GATE.x, pdz = me.pos.z - GATE.z, pl = Math.hypot(pdx, pdz) || 1;
        dx = -pdx / pl; dz = -pdz / pl;
        const ax = GATE.x + dx * 14 - dz * 8, az = GATE.z + dz * 14 + dx * 8;
        g.order = 'hold'; g.anchor = { x: ax, z: az }; g.dest = null; g.onArrive = null; g.path = null; g.formation = 'yari'; g.seekRange = Math.max(g.seekRange || 0, 25);
        for (const u of g.units) { u.aiT = 0; u.target = null; }
      }
      continue;
    }
    const at = ariAidSpot(rt, (F.nearAidN || 0) + 3);
    // 11/28 14:25 クラウド 有岡の持ち主（K582・act bot 1408-2 の688秒 ★★）：締めの段で味方の新手十一人が (-311,-112) で attack のまま行き先六m で一点に重なった。
    //   付け直す先が今の所から十二m の内なら道を引き直しても同じ所へ戻るだけなので、その場を持ち場に槍の並びで構えさせる（散る）。
    if (Math.hypot(at.x - c.x, at.z - c.z) < 12) {
      g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; if (at.face != null) g.facing = at.face; g.dest = null; g.onArrive = null; g.path = null; g.formation = 'yari';
      g.seekRange = Math.max(g.seekRange || 0, 25);
      for (const u of g.units) { u.aiT = 0; u.target = null; }
      continue;
    }
    g.order = 'path'; g.path = [[c.x, c.z], ...ariStreetWay(c, at, false)]; g.pathIdx = 0; g.formation = 'column'; g.speed = Math.max(g.speed || 0, 3);
    g.onArrive = (q) => { q.anchor = { x: at.x, z: at.z }; if (at.face != null) q.facing = at.face; q.order = 'attack'; q.formation = 'yari'; q.onArrive = null; };
    for (const u of g.units) { u.aiT = 0; u.target = null; }
  }
  // 11/21 20:40 クラウド 有岡の持ち主（K582・中学生 bot 2025 の286秒 ★★）：画面の外から持ち場へ歩かせた遠くの備（depth_real の K470）五人が、
  //   (-295,-3) で move のまま一点に重なって止まった。move のまま十秒一・五 m も動かない遠くの備は、その場を持ち場にして構えさせる（槍の並びで散る）。
  for (const g of rt.army.groups) {
    if (!g || g.name !== '遠くの備' || g.order !== 'move' || g.routed || !g.count) { if (g) g._ariFarSt = null; continue; }
    const c = g.center(), s = g._ariFarSt;
    if (!s || Math.hypot(c.x - s.x, c.z - s.z) > 1.5) { g._ariFarSt = { x: c.x, z: c.z, t: rt.t }; continue; }
    if (rt.t - s.t < 10) continue;
    g._ariFarSt = null;
    g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.dest = null; g.onArrive = null; g.formation = 'yari';
  }
  // 11/21 21:35 クラウド 有岡の持ち主（K582・中学生 bot 2125 の531秒 ★★）：荒木の新手八人が本人から遠い町筋 (-349,-156) で attack のまま、
  //   行き先の二十一m 手前で一点に重なって二十秒止まった（遠くの軽い計算・町屋の間で塞がる）。本人から四十五m より遠く、
  //   attack のまま十五秒一・五 m も動かない荒木の新手は、その場を持ち場にして槍の並びで構えさせる（近づけば今までどおり斬り合う）。
  const P0 = rt.player?.u?.pos;
  if (P0) for (const g of rt.army.groups) {
    // 11/22 クラウド 有岡の持ち主（K582・中学生 bot 0117・0137 の286・466秒 ★★）：味方の『蜂屋の後備え』六〜七人も木戸の外 (-405,-88) で attack のまま、
    //   行き先の四十m 手前で一点に重なって止まった。本人から遠い後備え（味方）も同じ決まりで、その場で槍の並びに構えさせる。
    const rearAlly = g && g.team === 0 && typeof g.name === 'string' && g.name.includes('後備え');
    if (!g || !(g.team === 1 || rearAlly) || g.order !== 'attack' || g.routed || !g.count || !(rearAlly || g.name === '新手' || g.isReserve || g._rsv)) { if (g) g._ariFoeSt = null; continue; }
    const c = g.center(), s = g._ariFoeSt;
    if (Math.hypot(c.x - P0.x, c.z - P0.z) < 45 || !s || Math.hypot(c.x - s.x, c.z - s.z) > 1.5) { g._ariFoeSt = { x: c.x, z: c.z, t: rt.t }; continue; }
    // 11/28 クラウド 有岡の持ち主（K582・act bot 0719 の386秒 ★★）：『丹羽の後備え 北 一』七人が (-424,-125) で attack のまま二十三m 先を狙って
    //   重なり、散らしても二秒で重なり直した（十五秒の待ちの間に見える）。味方の後備えは六秒で構えさせる。
    if (rt.t - s.t < (rearAlly ? 6 : 15)) continue;
    g._ariFoeSt = null;
    g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.dest = null; g.onArrive = null; g.formation = 'yari';
  }
  // 11/28 クラウド 有岡の持ち主（K582 流れ・act bot 0707）：辻の守りの段で『滝川の後詰』（F.aid）二人が path のまま (-356,-44) で四十秒動かなかった。
  //   名を変えた『滝川の後詰の組』と F.aid も、新手の組と同じ決まり（八秒一・五 m 動かなければその場で構える）に入れる。
  // 11/28 09:30 クラウド 有岡の持ち主（K582・act bot 0920 の597秒 ★★）：depth_reserve の『味方の新手』十二人も path のまま行き先の四m 手前 (-328,-69) で
  //   九組重なって止まった。味方の新手も同じ決まり（八秒一・五 m 動かなければその場で構える）に入れる。
  for (const g of [...(F.committed || []), F.aid, ...rt.army.groups.filter((x) => x && x.team === 0 && x.name === '味方の新手')]) {
    if (!g || !(g.name === '滝川の新手の組' || g.name === '滝川の後詰の組' || g === F.aid || g.name === '味方の新手') || g.order !== 'path' || !g.count || g.routed) { if (g) g._ariStuck = null; continue; }
    const c = g.center(), s = g._ariStuck;
    if (!s || Math.hypot(c.x - s.x, c.z - s.z) > 1.5) { g._ariStuck = { x: c.x, z: c.z, t: rt.t }; continue; }
    if (rt.t - s.t < 8) continue;
    g._ariStuck = null;
    g.anchor = { x: c.x, z: c.z }; g.order = 'hold'; g.formation = 'yari'; g.roadColumn = false; g.followColumnRoad = false;
    g.path = null; g.dest = null; g.seekRange = 35; if (g.ariSpeed0 != null) g.speed = g.ariSpeed0; g.onArrive = null; g._fitAt = 0;
  }
}
// 11/18 クラウド（物差し③・cloud-37 の測り）：二百秒の侍町で本人の三十 m 内が味方四・敵六十九。前を埋める荒木の新手が百人近くまで重なり、
//   滝川の手は討ち減って本人の周りに味方がいなくなった。本人の近くの味方が薄く敵が厚い時、木戸から滝川の新手の組を本人の所へ上らせる（二十秒おき・八組まで）。
// 11/18 クラウド（一時間の回・200秒の写真 874×402）：上った新手の組は本人の周りの輪（角度をずらした五 m）に着き、本人の後ろや脇の町屋の陰に入って、
//   辻へ向く本人の目には兵が二三人しか写らなかった（③ 塊が薄い）。四十 m 内の敵の真ん中の方へ四 m 出た所に、左右五 m ずつ横に並べて着かせ、敵へ向ける。
//   着く所と本人の間に塀・家があれば、前の輪の所に戻す。
function ariAidSpot(rt, i) {
  const P = rt.player.u.pos, ang = i * 2.4, ring = { x: P.x + Math.cos(ang) * 5, z: P.z + Math.sin(ang) * 5 };
  let x = 0, z = 0, n = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.team === rt.player.u.team || u.isStruct || u.civ || u.fleeing) continue;
    const d = Math.hypot(u.pos.x - P.x, u.pos.z - P.z);
    if (d < 40) { x += u.pos.x; z += u.pos.z; n++; }
  }
  if (n < 3) return ring;
  let dx = x / n - P.x, dz = z / n - P.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const side = ((i % 3) - 1) * 5, fwd = 4 + Math.floor(i / 3) % 2 * 2;
  const at = { x: P.x + dx * fwd - dz * side, z: P.z + dz * fwd + dx * side, face: Math.atan2(dx, dz) };
  try { if (rt.army.wallBetween(P, -1, { x: at.x, y: rt.world.heightAt(at.x, at.z), z: at.z })) return ring; } catch (e) { return ring; }
  return at;
}
function ariAidArrive(at) {
  return (q) => { q.anchor = { x: at.x, z: at.z }; if (at.face != null) q.facing = at.face; q.order = 'hold'; q.formation = 'yari'; q.speed = q.ariSpeed0; q.onArrive = null; q._ariFollow = null; };
}
function ariNearAid(rt) {
  const F = rt.flags, P = rt.player.u;
  // 11/18 クラウド（一時間の回）：上った新手は着いた所で持ち場を守るだけで、本人が次の段へ進むと後ろに残り、三百秒の三十 m 内が味方〇・敵十三〜三十三になった。
  //   持ち場で待つ新手の組は、本人が二十五 m より離れたら通りをたどって本人の所へ付き直す（三秒おき）。
  if (F.nearAidGroups && !(rt.t < (F.nearFollowAt || 0))) {
    F.nearFollowAt = rt.t + 3;
    F.nearAidGroups = F.nearAidGroups.filter((g) => g.count > 0);
    for (const g of F.nearAidGroups) {
      // 11/19 クラウド kaito2：前の回の残り「二百十五秒に付き直しに立った組が path のまま七十秒着かない」。
      //   付き直す途中の組が九秒で一・五 m も進まない時か、行き先が本人から二十 m より離れた時は、今いる所から道を引き直す。
      if (g._ariFollow && g.order === 'path') {
        const c = g.center(), L = g._ariFollow;
        const stuck = rt.t - L.t >= 9 && Math.hypot(c.x - L.x, c.z - L.z) < 1.5;
        const stale = Math.hypot(L.ax - P.pos.x, L.az - P.pos.z) > 20;
        if (rt.t - L.t >= 9) { L.x = c.x; L.z = c.z; L.t = rt.t; }
        if (!stuck && !stale) continue;
        const at = ariAidSpot(rt, F.nearAidGroups.indexOf(g) + (stuck ? 1 : 0));
        g.path = [[c.x, c.z], ...ariStreetWay(c, at, false)]; g.pathIdx = 0;
        L.ax = at.x; L.az = at.z; L.x = c.x; L.z = c.z; L.t = rt.t;
        g.onArrive = ariAidArrive(at);
        continue;
      }
      if (g.order !== 'hold' || !g.anchor || Math.hypot(g.anchor.x - P.pos.x, g.anchor.z - P.pos.z) < 25) continue;
      const at = ariAidSpot(rt, F.nearAidGroups.indexOf(g)), c = g.center();
      g.order = 'path'; g.path = [[c.x, c.z], ...ariStreetWay(c, at, false)]; g.pathIdx = 0; g.formation = 'column';
      // 11/18 23:30 クラウド kaito2：描かずの数えで、本人が辻へ出た百九十〜二百七十五秒、本人の十五 m 内の味方が一人・敵が二十五〜三十四のまま八十秒。
      //   付き直す組が常の歩みで通りをたどり、追いつく前に本人が先へ進んでいた。付き直す間だけ上る時と同じ足（3.6）で駆け、着いたら元の足へ戻す。
      if (g.ariSpeed0 == null) g.ariSpeed0 = g.speed;
      g.speed = Math.max(g.ariSpeed0 || 0, 3.6);
      g.onArrive = ariAidArrive(at);
      g._ariFollow = { x: c.x, z: c.z, t: rt.t, ax: at.x, az: at.z };
    }
  }
  // 11/18 クラウド（一時間の回・描かずの数え）：八組を使い切った二百七十秒より後は、三十 m 内が味方一〜三・敵三十四〜五十八に戻った。十六組まで（九組目から三十秒おき）。
  if (F.step < 1 || !(rt.t >= (F.nearAidAt || 0)) || (F.nearAidN || 0) >= 16) return;
  F.nearAidAt = rt.t + 4;
  let a = 0, e = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.isPlayer || u.isStruct || u.civ) continue;
    const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
    if (u.team === P.team) { if (d < 30) a++; } else if (d < 40 && !u.fleeing) e++;
  }
  if (a >= 8 || e < 12 || a * 3 >= e) return;
  // 本物の兵の枠が埋まっている時は、本人から三十五 m より遠くの荒木の新手を遠い者から外して、十二人分を空ける。
  let real = 0; for (const u of rt.army.units) if (u.alive && !u.gone) real++;
  let need = real + 12 - 228;
  if (need > 0) {
    const far = [];
    for (const q of rt.army.groups) if ((q.isReserve || q._rsv || q.name === '新手') && q.team === 1) for (const u of q.units) {
      if (!u.alive || u.gone) continue;
      const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
      if (d > 35) far.push([d, u]);
    }
    far.sort((x, y) => y[0] - x[0]);
    for (const [, u] of far) { if (need <= 0) break; try { rt.army.despawn(u); need--; } catch (err) { /* 外せなければそのまま */ } }
  }
  // 11/18 act bot（181秒）：本人の所に着いた新手が同じ一点へ六組重なって止まった（★★）。本人の所に五人以上の組が二ついる間は足さず、着く所も組ごとに五 m ずらす。
  let here = 0;
  for (const q of F.nearAidGroups || []) if (q.count >= 5 && q.anchor && Math.hypot(q.anchor.x - P.pos.x, q.anchor.z - P.pos.z) < 15) here++;
  if (here >= 2) { F.nearAidAt = rt.t + 10; return; }
  const g = ariReinforce(rt, ariAidSpot(rt, F.nearAidN || 0), 12);
  if (!g) return;
  (F.nearAidGroups || (F.nearAidGroups = [])).push(g);
  F.nearAidN = (F.nearAidN || 0) + 1; F.nearAidAt = rt.t + (F.nearAidN > 8 ? 30 : 20);
  if (F.nearAidN === 1) rt.bark('滝川の新手が木戸から上って来る。持ちこたえよ');
}
// 荒木の新手（depth_reserve の待つ備と前を埋める備）は、生きている者が四十人（携帯は二十四人）に満ちたら足さない。一組は二十人（携帯は十人）。足し続けると百人近くに重なり、後詰の枠も食った。
function ariFoeRsv(rt) {
  let n = 0;
  // 11/18 描かずの通し：辻の守りの段（191〜261秒）で本人の30m 内の敵が二〜四人・一番近い敵が二十 m のまま七十秒、新手の四十人は遠くに残って枠だけ食っていた。
  //   本人から六十 m 内の新手だけを数え、遠くに残った新手で前の新手を止めない（本物の兵の上限は frontFill の側で守る）。
  const me = rt.player?.u?.alive ? rt.player.u.pos : null;
  for (const g of rt.army.groups) if ((g._rsv || g.isReserve || g.name === '新手') && g.team === 1 && !g.routed) {   // 名で数える：待つ備から出た後も同じ新手
    if (!me) { n += g.count || 0; continue; }
    for (const u of g.units) if (u.alive && !u.gone && Math.hypot(u.pos.x - me.x, u.pos.z - me.z) < 60) n++;
  }
  return n;
}
function ariTouch(rt) { return !!(rt.isTouch || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)); }
function ariFoeFull(rt) { return ariFoeRsv(rt) >= (ariTouch(rt) ? 24 : 40); }   // 一度に二組まで立つので、上の数より一・二組多くなる事がある
// 開幕の段に渡す場所（堀端の竹束の端：木戸の外の北）
const AR_OPEN_CTX = { gate: GATE, look: { x: GATE.x - 22, z: GATE.z - 12 }, goal0: ARI_GOALS[0] };
function ariOpenCtx() { return AR_OPEN_CTX; }
function ariCtx(rt) {
  const F = rt.flags;
  return { routeFight: true, withdrawWay: gateWay, botSeek: 60, botSeekHold: true, botAttackOrders: true, backing: false,
    // 辻・木戸を守る間と、帰還して先手を待つ間は、立ち止まるのが下知。
    // 持ち場の外や行軍の途中では、共通の放置判定を残す。
    idleWait: (b, C) => !!C.at && (C.s.kind === 'hold' || C.s.kind === 'move' && C.arr)
      && b.distTo(C.at) <= (C.botRadius || 13),
    // 辻へ着く前は道から遠い敵を追わず、実際に間合いへ入った敵だけ払う。
    // 辻では持ち場と射手を従来どおり扱い、確保や期限の条件は緩めない。
    botFoeAllowed: (u) => {
      const C = F.dp?.cur, p = rt.player.u.pos;
      if (!C || (C.s.kind !== 'fight' && C.s.kind !== 'hold') || !C.at
        || Math.hypot(p.x - C.at.x, p.z - C.at.z) <= (C.botRadius || 16)) return true;
      return Math.hypot(u.pos.x - p.x, u.pos.z - p.z) <= 4;
    },
    botBackAllowed: (b, x, z) => {
      const point = b.flags.ariRestPoint || (b.flags.ariRestPoint = { x: 0, z: 0 });
      point.x = x; point.z = z;
      return ariPostRestAllowed(b, point);
    },
    friends: () => [F.taki, F.kuri, F.aid, ...(F.committed || [])].filter((g) => g && g.count && !g.routed), botSteer: wallSteer };
}
// 塀と木戸脇の篝火を避ける。口へは塀に沿って回り、正面から通る。
function wallSteer(b, inp) {
  if (!inp.k.has('KeyW')) return;
  const p = b.player, u = p.u;
  // 道案内が選んだ短い歩みを八メートル先まで延ばすと、次の堀へ誤って回り直す。
  if (p._botGoToT === b.t && Math.abs(p.yaw - p._botGoToYaw) < 0.001) return;
  const goal = u._ariLook || (u._ariLook = { x: 0, z: 0 });
  goal.x = u.pos.x + Math.sin(p.yaw) * 8; goal.z = u.pos.z + Math.cos(p.yaw) * 8;
  const q = gateWay(b.army, u, goal);
  if (q === goal) return;
  // 構えは正面だけに効く。塀を回る歩みで打ち手への向きを変えない。
  if (inp.guardHold) {
    const dx = q.x - u.pos.x, dz = q.z - u.pos.z;
    const fw = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw);
    const side = -dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw);
    inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
    if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
    if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
    inp.leftPressed = false; inp.chargeHold = false;
    return;
  }
  if (p.lock) inp.e.add('KeyQ');
  inp.leftPressed = false; inp.chargeHold = false;
  p.yaw = Math.atan2(q.x - u.pos.x, q.z - u.pos.z);
}
// A 砦を取った後：滝川の下知で侍町へ進み、辻の敵を崩す。
function ariA() {
  const at = { x: TOWN_X - 2, z: -14 };
  return [
    rest({ dur: 5, at, say: [['滝川一益', '木戸の守りが崩れた。おぬしの組で、次は辻を取れ']] }),
    rest({ dur: 5, at, say: [['滝川の組頭', '侍町に火をかけよ。町の者は追うな']], fn: (rt, m) => { m.fire = true; burnSpread(rt, rt.flags.houses[16]); burnSpread(rt, rt.flags.houses[12]); rt.flags.houses.filter((h) => h.samurai).forEach((h, k) => rt.after(1 + k * 15, () => { if (!rt.flags.ending) burnSpread(rt, h); })); } }),
    // 史実：砦兵は城へ逃げ込む途中で多く討たれ、滝川は侍町をほぼ抵抗なく焼いた。火の後の辻の兵は浮き足立つ（士気を低く）。
    ariFight({ at, title: '城下の辻', sub: '町屋の間の辻ごとに、荒木勢が固まる', obj: () => ARI_GOALS[2],
      say: [['滝川の組頭', '塀を盾に進め。町屋の鉄砲衆を先に崩せ', 4.5]],
      foes: (rt, m) => [{ name: '辻を固める荒木勢', from: { x: TOWN_X - 10, z: -40 }, list: [uS(2), uA(8)], morale: m.fire ? 40 : 90 }, gunLine('町屋の陰の鉄砲', { x: TOWN_X + 22, z: -30 }, 6, {})],
      later: [
        { t: 18, title: '横槍', sub: '西の惣構えの内から、荒木勢が回り込む', say: ['足軽', '西から来たぞ！　横槍じゃ！'], foes: (rt, m) => [{ name: '西から回る荒木勢', from: { x: -SOKAKU_X + 10, z: -4 }, via: [[TOWN_X - 46, 4], [TOWN_X, 4]], list: [uS(1), uA(5)], morale: m.fire ? 40 : 90 }] },
        { t: 36, say: ['滝川の組頭', '侍町から新手じゃ！　辻を渡すでない！'], foes: (rt, m) => [{ name: '侍町から出る新手', from: { x: TOWN_X + 10, z: -66 }, list: [uS(2), uA(5)], morale: m.fire ? 45 : 95 }] },
      ],
      max: 210, reward: '城下の辻を押し通った',
      // 通しの段3で残兵待ちのまま打ち切らない。本人と組が辻へ寄せた後に残兵が退き、十二秒の確保で進む。
      // 何もしない時の達成は認めず、戦全体の攻めの期限は残す。
      // 11/18 K358 kaito2：目安を150秒にした後の act bot で、この段のまま本人が辻の北（-369,-85）に残り1020秒の刻限負け（1回）→210秒に戻した。
      // 11/19 kaito2：その後に町屋の裏の回り道（ariGridDetour）と付き直す新手の駆け足を入れた。act bot 3回に1回この段が243秒（125→368秒）続き戦が645秒になったので170秒に
      lenient: true, limit: 170, passOnLimit: true,
      onEnd: (rt, m, won) => { if (!won) arioka.lose(rt, m.ariFailure || '辻の敵が崩れぬ'); } }),
  ];
}
// C 辻を取った後：本丸の久左衛門の下知で寄せ返す荒木勢を、取った侍町の辻で防ぐ。
//   11/6 kaito 二2：史実の滝川勢は侍町を焼いて奥へ攻め込んだ。辻を取った後に入って来た木戸へ引き返すのは逆向きなので、辻に踏みとどまる。
//   寄せは侍町（北東）と南の通りから。控えは準備の時に辻から四十五メートルほどの所に置き、下知まで動かない（prepareDefenders）。
function ariC() {
  const at = ARI_JUNCTION;
  // 11/22 クラウド 有岡の持ち主（K582 流れ・一つの戦は4〜7分）：act bot（--mobile）で辻の守りの段が106秒・戦465秒と七分を越えた。守りの長さを八十八→七十二秒にし、五つの寄せの間を詰める（寄せの数・人数・台詞は同じ）。
  return [
    rest({ dur: 6, at, say: [['滝川一益', '辻を押さえたぞ。本丸から荒木勢が寄せ返す。辻で槍をそろえよ'], ['滝川の組頭', '本丸へは進むな。辻を渡せば、木戸まで押し戻されるぞ', 4]] }),
    ariHold({ at, dur: 72, r: 16, fromSide: true, title: '侍町の辻', sub: '本丸の久左衛門の下知で、荒木勢が辻を取り返しに来る', label: '侍町の辻', obj: () => ARI_GOALS[3],
      waves: [
        // 11/21 クラウド kaito2（K467：act bot の数えで本人の三十m 内の敵が平均7・布陣の塊の寄せ0）：寄せ返しの始めに、布陣の表の荒木の塊を本人に近い順に四つ、辻の前へ一度に走り込ませる（兵は足さない）
        { t: 4, say: ['足軽', '侍町から寄せるぞ！　辻で迎え撃て！'], fn: (rt, C) => chargeWithRoom(rt, C.at, { n: 4, min: 4, maxD: 200 }), foes: () => [{ name: '侍町から寄せ返す荒木勢', from: { x: TOWN_X + 20, z: -62 }, list: [uS(3), uA(9)] }] },
        { t: 15, say: ['滝川の組頭', '鉄砲衆が寄せるぞ！　町屋を盾にせよ！'], foes: () => [gunLine('侍町の鉄砲衆', { x: TOWN_X + 30, z: -60 }, 6, {})] },
        { t: 28, say: ['足軽', '南の通りから新手じゃ！'], foes: () => [{ name: '南の通りから来る荒木勢', from: { x: TOWN_X + 30, z: 32 }, list: [uS(2), uA(7)] }] },
        { t: 42, title: '城兵の嘆き', sub: '九月に尼崎へ去った村重を恨み、城兵が動揺する',
          say: ['荒木の足軽', '村重様は我らを捨てて尼崎へ去られた。何のための籠城じゃ……'],
          // 11/18 クラウド act bot「簡単すぎる・もっと強い奴と斬り合いたい」（名のある将 0）：久左衛門の手の頭に、名を伏せた荒木の侍大将を一人立てる（兜の侍・槍）。
          //   この夜の荒木方の組頭の名は伝わらないので名は作らない。人数は前と同じ十二人。
          foes: () => [{ name: '荒木久左衛門の手', from: { x: TOWN_X + 48, z: 32 }, list: [{ type: 'busho', n: 1, o: { name: '荒木の侍大将', horse: false, hat: 'kabuto_m', weapon: 'spear' } }, uS(3), uA(8)] }],
          fn: (rt, C) => {
            if (rt.flags.murashigeNews) return;
            rt.flags.murashigeNews = true;
            // この口で寄せる城兵だけが揺らぐ。本丸は久左衛門のもとで持ちこたえる。
            for (const g of C.groups) if (!ariSpent(g)) g.morale = Math.max(0, g.morale - 12);
            // 町の内から辻を撃っていた鉄砲衆は、この知らせで撃ち捨てて本丸へ散る（砦兵が城へ逃げ込んだ史実の流れ）。
            for (const g of C.groups) if (!ariSpent(g) && g.units.filter((u) => u.type !== 'gun' && u.type !== 'bow').length <= 1 && g.units.some((u) => u.type === 'gun')) withdrawAriRemnants(g);
            rt.after(8, () => { if (!rt.over && !rt.flags.ending) rt.say('荒木の使番', '久左衛門様は城におる！　辻を取り返せ！', 4); });
          } },
        // 11/18 夜50-33：四つ目の寄せを退けた後、辻の敵が一〜四人のまま四十〜五十秒立ち尽くした（act bot の本人は辻で速さ0）。
        //   使番の『取り返せ』に応えて本丸へ向かう道から最後の一押しを出し、守りの終わりまで斬り合いを切らさない。
        { t: 54, say: ['足軽', '本丸の通りから、また来るぞ！'], foes: () => [{ name: '本丸から押し返す荒木勢', from: { x: TOWN_X + 37, z: -64 }, list: [uS(2), uA(6)] }] },   // 本丸へ向かう道の上（辻の北東六十余m）。③の通り道（-52〜-70）から外して控えさせる
      ],
      reward: '侍町の辻を守り抜いた', lost: ['滝川の組頭', '押し込まれたか……後詰を出せ！'],
      // 11/21 クラウド kaito2（司令塔：有岡の開門の段が 465→642・660秒に延びた・46 の測り）：寄せ返しで走り込ませた布陣の塊（K467・十六〜二十六人）が辻の守りの後も残り、
      //   焼け跡・奥の木戸の段で「敵の倍の味方」がそろわず期限（百秒）まで延びた。辻を守り切ったら、その塊は寄せ返しの崩れとして本丸へ退かせる（兵は減らさず・強さも同じ）
      onEnd: (rt, m, won) => { if (!won) { arioka.lose(rt, m.ariFailure || '辻を守りきれぬ'); return; } for (const g of rt.army.groups) if (g._charge && g.team === 1) withdrawAriRemnants(g); } }),
  ];
}

// 両軍の総勢は上の force（二万五千 対 五千から、段と討った数で減る）。11/6 fix61：ここで一定の数に上書きして棒が減らなかったのを外した。
// 陣立ての厚み（arioka/depth.js・army_depth.js）・命懸けの戦場（lethal.js）・この戦の怖さ（狭い町筋で、塀と町屋の陰から撃たれる）
// 一つの戦に場面を詰める（台帳 K306・scene_beats.js）：木戸へ寄る間に塀の狭間から鉄砲の一斉（物見の緊張）・通りで荒木の番兵の小勢と小競り合い（崩れて逃げる）・寄せ返しが崩れて味方が追い討つ
arioka.beats = [
  { kind: 'volley', when: inStage(0, 6), at: (rt) => aheadOf(rt, 40) },
  { kind: 'skirmish', name: '荒木の番兵', n: 6, life: 30, dmg: 0.45, when: inStage(1, 15), at: (rt) => aheadOf(rt, 24, 6) },
  { kind: 'rout', r: 45, chase: true, when: inStage(3, 45) },
];
arioka.depth = DEPTH_ARIOKA;
// 11/15 K327：軍議の図の隊（docs/fujin/arioka.md と arioka/depth.js の表どおり）。以前は名が二つだけで、二万五千の囲みが見えなかった。
//   本物の隊に結んだ備は、その隊の今いる所に置く。囲みの付城（二万五千の残り・北は池田恒興）と、荒木の岸の砦・鵯塚砦（野村丹後守）の手も足す（兵は復元の仮の数）。
arioka.introFujin = (rt) => {
  const at = (s, fb) => {
    if (s.at) return s.at;
    try { const g = s.bind?.(rt); const us = g?.units?.filter((u) => u.alive) || []; if (us.length) { let x = 0, z = 0; for (const u of us) { x += u.pos.x; z += u.pos.z; } return { x: x / us.length, z: z / us.length }; } } catch (e) { /* 結ぶ隊がまだ無い */ }
    return fb;
  };
  const FB = { taki: { x: GATE.x - 14, z: GATE.z }, kuri: { x: GATE.x - 26, z: GATE.z + 10 }, aid: { x: GATE.x - 60, z: GATE.z - 8 },
    g1: { x: GATE.x + 12, z: GATE.z }, tsuji: { x: TOWN_X, z: GATE.z }, sei: { x: TOWN_X + 40, z: GATE.z - 40 }, kyu: { x: TOWN_X + 120, z: GATE.z + 20 } };
  const out = [], seen = new Set();
  for (const [side, team] of [['A', 0], ['B', 1]]) for (const s of DEPTH_ARIOKA[side].sonae) {
    const p = at(s, FB[s.id] || { x: GATE.x, z: GATE.z });
    const name = s.taisho && !seen.has(s.taisho) ? s.taisho : undefined; if (name) seen.add(name);
    out.push({ team, name, x: p.x, z: p.z, men: s.men });
  }
  out.push({ team: 0, name: '池田恒興', x: GATE.x - 70, z: SOKAKU_N + 300, men: 6000 }, { team: 0, x: GATE.x - 70, z: WALL_Z - 280, men: 7000 });
  out.push({ team: 1, x: KISHI_TORIDE.x, z: KISHI_TORIDE.z + 30, men: 800 }, { team: 1, name: '野村丹後守', x: HIYODORI_TORIDE.x, z: HIYODORI_TORIDE.z - 30, men: 1200 });
  return out;
};
arioka.reserveFrom = 60;   // 陣の厚み：城攻めの既定の90秒からでは90秒に30〜60m の敵が22人（11/13 クラウドH）
// 討死の開始・間隔・上限は定義内の設定を保つ。真偽値で上書きすると共通の強い既定値へ戻る。
arioka.fearKind = { kind: '町筋', note: '狭い町筋で、塀と町屋の陰から撃たれる', w: { iso: 1.4 }, line: '町屋の陰から撃たれるぞ！' };
arioka.sides = { a: { name: '織田勢', mon: 'oda' }, b: { name: '荒木勢', mon: 'maru' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
// 渡辺勘大夫は岸の砦を退いた後に処刑されたと公記にある。この夜の討取り相手にはしない。
arioka.famous = [];
arioka.date = () => '天正七年十月十五日　冬・夜（復元）';
arioka.canSkip = (rt) => (rt.phase === 'brief' && AR_OPEN.mayOpen(rt, AR_OPEN.atGate(rt, ariOpenCtx())) ? '木戸を開けさせる' : '');
arioka.skip = (rt) => { if (arioka.canSkip(rt) && !rt.over && !rt.flags.ending) arioka.open(rt); };
arioka.history = '天正六年（1578）十月、摂津の荒木村重は信長に背いて有岡城（伊丹城）に籠もった。村重を説きに城へ入った小寺官兵衛（孝高。のちの黒田官兵衛。小寺家の家老で、羽柴秀吉のもとで働いていた。黒田の姓に戻るのは天正八年以降）は捕らえられ、牢に入れられた。織田勢は城を囲み、一年近く戦いが続いたが、翌年九月、村重は家族と家臣を残し、わずかな供と城を抜けて尼崎城へ移った。九月十二日、織田信忠は囲みの半ばを率いて尼崎へ向かった。十月十五日の夜、上臈塚砦の中西新八郎らが滝川一益に内応し、滝川の手が惣構えの内へ攻め入って侍町を焼いた。本丸はなお持ちこたえたが、十一月に城は開け渡された。官兵衛は翌十六日、家臣の栗山善助（利安）に救い出されたが、長い牢暮らしで足が不自由になったと伝わる。村重の妻子や家臣の家族の多くは、のちに信長の命で処刑された。荒木家の紋（抱き牡丹と伝わる）の絵はまだ無いので、ここでは丸の旗で代えている。滝川の手は滝川の旗（丸に竪木瓜）。この戦では十月十五日の夜の惣構えへの攻めと侍町の辻の確保を扱い、締めに十六日の未明の官兵衛の救出を置く（救い出した刻は史料に無く、未明は推定）。本丸の開城（十一月）は扱わない。この夜、信長は安土、秀吉は播磨、光秀は丹波にあり、陣には出さない。内応は上臈塚で起きたと公記は記す。操作する木戸は西の上臈塚に置く。三砦の細かな位置と城下の道は推定で、鵯塚の内応とはしない。辻の反撃と各隊の細かな位置は復元で、人数は目安である。公記の十月十五日の条に時刻や天気の記述はなく、夜の場面は復元である。 各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。';

// 素直な遊び手：木戸から入り、辻で戦い、奪った木戸を守る
arioka.botBrain = (b, inp, o) => { ariBot(b, inp, o); wallSteer(b, inp); };
// 官兵衛との対面も操作する任務。終幕中も迎え終えるまでは歩く判断を続ける。
arioka.botDuringEnding = (b) => !!b.flags.kanbePending && !b.flags.kanbeMet;
arioka.botSteer = wallSteer;
// 負けて退く時も、惣構えと水堀は木戸の土橋から抜ける。
// 殿の向きだけで退き先を決めると、城下の塀や堀に突き当たり追手に捕まる。
arioka.botWithdraw = (b, inp, { goTo }) => {
  goTo(b.player, inp, CAMP.x, CAMP.z, 3);
};
function ariBot(b, inp, { goTo, patientStrike, strikeTarget }) {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (u.alive && F.ending && F.kanbeAt && F.kanbePending && !F.kanbeMet) {
    // 迎えに戻る時も案内と同じ通りをたどり、町屋へ直進しない。
    const at = gateWay(b.army, u, F.kanbeAt);
    // 善助は官兵衛の横一・二メートルに立つ。二・五メートル手前で
    // 止まると、斜めから迎えた時に善助だけ対面の三・五メートル外へ残る。
    goTo(p, inp, at.x, at.z, at === F.kanbeAt ? 1.5 : .5);
    return;
  }
  if (!u.alive || F.ending) return;
  if (F.dpOn) {
    if (F.dp?.cur?.failed) { goTo(p, inp, CAMP.x, CAMP.z, 3); return; }
    const C = F.dp?.cur;
    if ((C?.s.kind === 'hold' || C?.s.kind === 'move') && !C.botGathered) {
      C.botGathered = true;
      // 帰還でも前の突撃を解き、配下を呼び戻す。人が出した号令には触れない。
      for (const g of b.squadGroups) if (g.count) {
        g.order = 'follow'; g.focus = null; g.pending = null; g.path = null; g.onArrive = null;
      }
    }
    depthBot(b, inp, goTo); return;
  }
  // 退避と手当ては共通の頭で先に判断済み。ここで深手だけを見て構えを
  // 解くと、敵のいる滝川の前列へ戻り、六秒の安全な待ち時間を作れない。
  b.botRest = false;
  // 塀越しに近い敵を狙って動かなくなる不具合の直し：塀が間にある敵は「見えていない」扱いにする
  // （木戸を開けた直後、まだ塀の外にいるのに塀の内の敵へ向き直って突き続け、一撃も当たらないまま突進しない事があった。kaito 9/30）
  // 構えを解いている半秒の間は、届く相手を保って突きまでつなぐ。
  let e = strikeTarget(b, 12);
  // 近い敵を追う間も、横から実際に打ち込む兵を先に受ける。
  let ad = 10;
  for (const t of b.army.threats || []) {
    if (!t.alive || t.fleeing || t.noTarget || t.type === 'gun' || t.type === 'bow' ||
        Math.abs(t.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, t.pos)) continue;
    const d = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
    if (d < ad) { e = t; ad = d; }
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.7 : 2.8;
    if (d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    // 構えたまま突くと短い払いになり、槍の間合いでは届かない。
    // 受けた後に構えを解き、突きが出せる間を待って反撃する。
    patientStrike(p, inp, e, d);
    const g = b.squadGroups[0];
    // 遠い敵への突撃は「移動」を経る。同じ号令を二秒後に重ねると取り消しになる。
    if (F.step === 1 && g?.count && g.order !== 'attack' &&
        !(g.order === 'move' && p.lastCmd?.id === 'attack') && !(b.botCmdT > b.t)) {
      inp.e.add('KeyC'); b.botCmdT = b.t + 4.5;
    }
    return;
  }
  inp.guardHold = false;
  if (b.squadGroups[0]?.order === 'attack' && !(b.botCmdT > b.t)) {
    inp.e.add('KeyZ'); b.botCmdT = b.t + 2;
  }
  if (F.step === 0) { const g = AR_OPEN.pin(b, ariOpenCtx()) || { x: GATE.x - 30, z: GATE.z }; goTo(p, inp, g.x, g.z, 2); return; }   // 開幕の段：堀端→竹束
  if (F.step === 1) { const c = gone(F.g1) ? { x: GATE.x + 12, z: GATE.z } : F.g1.center(); goTo(p, inp, c.x, c.z, 2); return; }   // 崩れた後は木戸の内（八歩より先）へ入る

}

// 武将の名簿（bushou_roster.js）から、この戦に出てまだ場にいない武将を足す（11/01 bushou_17_32）。官兵衛の救い出しは落城の後（win の終わりで evPerson）・渡辺勘大夫は岸の砦にいるので出さない。
// 十月十五日の夜にこの口から入ったのは滝川の手（有岡城の戦い）。丹羽・池田・中川・高山がこの木戸にいた記録は無いので、名のある将は足さない。
arioka.bushou = [];
// 11/18 クラウド act bot：辻を守り抜いた後（官兵衛を迎える道・幕切れ）に馬へ手を伸ばし、乗る前に戦が終わって「乗れなかった★★」と数えた。
//   幕切れの段は歩いて迎える段なので、bot は馬を取りに行かない（人の遊びの乗馬は変えない）。
arioka.botMountAllowed = (b) => !b.flags.ending && !b.over;
export { arioka };

// 当日の細かな時刻・天気・各備えの人数と町割りは復元。
arioka.history += ' 城の復元は伊丹市の解説と遺構をもとに、主郭の人工の堀を西と南に置いた。三砦の内側の囲いと兵舎・蔵、主郭の番所・長屋・館・井戸、寺の堂と庭、屋根の姿、村と田の位置は当時の摂津の作りからの推定である。 城に残る人数は公記に三千ともある。囲み五万は包囲全体の目安で、この木戸の兵数ではない。総大将の信忠は局地の木戸には置かず、この口の滝川の陣と主郭の荒木久左衛門を描く。内応口は西の上臈塚へ合わせたが、木戸の寸法・道と家並み・夜の明るさや天気・局地の反撃は推定である。岸の砦の撤退と鵯塚の抗戦はこの辻の任務に重ねない。辻へ寄せ返す荒木勢は、本丸がなお持ちこたえた事からの推定である。';

arioka.history += ' 城兵の退き道と、門番が追手の離れた時に門を開ける段取りは推定である。民の在所と人数、町屋と寺から惣構え内の空地へ退く道、東の村から猪名川の西岸沿いに退く道も推定で、包囲から脱出したという意味ではない。';

arioka.history += ' 滝川一益と組頭の下知、荒木久左衛門の下知を伝える使番の声は、遊びのための復元で、史料の発言をそのまま写したものではない。';

arioka.history += ' 主郭の石垣は低い野面積とし、白い塀は置かない。天主は2022年の復元画（千田嘉博監修・富永商太画）に従い主郭の北西に置くが、三重の望楼型という姿と寸法は推定である。石垣と盛土の高さ・板塀と館の土壁は推定復元である。村重が九月に家族と家臣を残して去った知らせを辻の山場で取り上げるが、その場の声と城兵の動揺は復元で、十月の戦の最中に村重が脱出したという意味ではない。本丸の守りは続く。';

// 内応の根拠：https://akechikai.or.jp/archives/oshiete/60273
// 当世具足の復元の参考：https://rekihaku.pref.hyogo.lg.jp/digital_museum/bugu-kacchuu/kc_touseigusoku/
arioka.history += ' 滝川の陣幕・幟・本人と先手の指物は既存の滝川家の紋にそろえるが、有岡での旗の色や装束を直接伝えるものではない。滝川一益の甲冑・立物・陣羽織は従来の復元案を使う。滝川の馬印は未確認のため、信長の唐傘や金扇を借りない。荒木久左衛門の桔梗前立は根拠が確認できないため付けない。中西新八郎は内応口に姿を置くが、筋兜・黒漆の桶側胴・刀・顔・細かな立ち位置と合流の動き・台詞は推定復元で、特有の立物・旗印・馬印や豪傑の型は付けない。';


// K674（11/26）：勝った時（辻を守った所）に史実の続きの段（oda_more.js）。その後に官兵衛を迎える終幕
import { odaMore } from './oda_more.js';
odaMore(arioka, 'arioka');
