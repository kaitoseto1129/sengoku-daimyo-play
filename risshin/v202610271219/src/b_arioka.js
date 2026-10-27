import { useTerrain } from './asset_manifest.js';
// ======================================================================
// 織田家編　有岡城の戦い（天正七年十月十五日）
// 摂津の荒木村重は信長に背き、有岡城に一年近く籠もった。説きに来た黒田官兵衛（孝高）は城に捕らえられ、牢に入れられた。
// 村重が城を抜け出して尼崎へ移った後、十月、城の中から内応する者が出て、織田勢は城の中へ攻め入った。
// 官兵衛は牢から救い出されたが、長い牢暮らしで足が不自由になっていたと伝わる。
// 足軽は滝川一益の手。内応で開いた木戸から入り、侍町へ進み、奪った口を守る。
// 向き：北は -z、東は +x。主郭は中央〜東寄り。西に滝川の陣。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori as commonNobori, hut, yagura as commonYagura, campfire, kabukimon, yaguramon, castleBoardFence, tawara, ishigaki, kagaribi, tobira, makeKitBatch, finalizeKitBatch, dorui, makeSimpleBatch, finalizeSimpleBatch, palisade, solidCircle, solidRect } from './props.js';
import { SOLIDS } from './props.js';
import { timeslipField } from './timeslip_field.js';
import { flagTexture } from './textures.js';
import { S as SETTINGS } from './settings.js';
import { dirtTex, stoneTex } from './nature.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { enemyGroup, allyGroup, nm, unitPos, wallLine, attachSama } from './bhelp.js';
import { applyLook, NIGHT, dress, gone as groupGone } from './b_inabayama.js';
// 深手で戦えない兵だけが残っても、敵の寄せが続くとは数えない。
const gone = (g) => groupGone(g) || g.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.rearWound || u.noTarget);
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { makeKakoi, kakoiEvent } from './kakoi.js';
import { demBlend } from './dem.js';
import { INTERIOR_WALLS } from './shironaka.js';
import { NAKA } from './naka.js';
import { horiboriHeight, mizubori, goten } from './castle_parts.js';
import { reset as flReset, addDeck, addRamp } from './floors.js';
import { tickTabas, tabaInteractTick, makeTabaAdvance, patchGunCover, tabaGeo } from './taketaba.js';
import { makeSiegeZones, ZONE_STATE } from './siege_zones.js';
import { buildCastlePlan } from './castle_plan.js';
import { makeNawabari } from './nawabari.js';
import {
  WALL_Z, GATE, SOTO_MOAT, SOTO_MOAT_SEGS, SOTO_BRIDGE,
  ROU, CAMP, HON_ISHIGAKI_SEGS, HON_MOAT, HON_MOAT_SEGS, TENSHU_POS,
  HON_W, HON_E, HON_N, HON_Z, HON_X, HON_CENTER_Z, HON_GAP, HON_ENTRY_X, HON_APPROACH_Z,
  SOKAKU_X, SOKAKU_N, KISHI_TORIDE, JORO_TORIDE, HON_W_MOAT, HON_W_MOAT_SEGS,
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
    if (Math.abs(dx * box.c - dz * box.s) > box.half + .55 ||
        Math.abs(dx * box.s + dz * box.c) > box.depth + .55 || pos.y < box.y + box.bottom) continue;
    y = Math.max(y, box.y + box.top + .45);
  }
  look.y += y - pos.y;
  pos.y = y;
}

function ariGateCameraHit(gate, from, to) {
  const x = from.x - gate.x, z = from.z - gate.z;
  // 屋外の本人を映す視点は、開いた戸口からも町屋の中へ入れない。
  // 本人が屋内にいる時と、焼け落ちた家は既存の壁判定に任せる。
  // 視線の起点は本人より前へ寄るため、箱の内側にあるだけでは屋内としない。
  // 実際に入っている部屋だけを除き、壁際でも屋外の視点を建物へ通さない。
  if (gate.house && (gate.house.collapsed || gate.house.room && NAKA.cur?.I === gate.house.room)) return null;
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
function ariNagaya(world, x, z, w, d, batch) {
  const high = true;
  // 携帯でも棟を長手へ通す。敷地と面の数は変えない。
  hut(world, x, z, d, w, Math.PI / 2,
    { ita: true, boardRoof: high, weatheredBoards: high, nagayaDoors: high, batch, wall: high ? 0x78654c : undefined });
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
  const mat = new THREE.MeshBasicMaterial({ color: 0x354740, transparent: true, opacity: .78, depthWrite: false });
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
      diffuseColor.rgb = mix(diffuseColor.rgb * (0.9 + wave * 0.07), vec3(0.04, 0.06, 0.065), reflection * 0.45);
      diffuseColor.a = mix(0.78, 0.94, reflection);`);
  };
  mat.customProgramCacheKey = () => 'arioka-water';
  return mat;
}

// 有岡の幟だけ布と横竿を細くし、布の左端を竿へ三か所で結ぶ。
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
  // 竿にある五つの乳と結び目をそのまま使い、重なる横木を足さない。
}

// 焼け落ちた屋根は葺材に合わせて薄い板か茅の塊にする。妻壁を空中に残さない。
// 準備時だけ作り、倒壊時は表示を切り替える。材質は全戸で使い回す。
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

function burnHouse(rt, h) {
  h.burnt = true;
  const W = rt.world;
  h.fires = [W.addFire(h.x + .6, h.z - .4, { h: 1.6, size: 2.2 })];
  rt.army.play('wood', { x: h.x, z: h.z }, .8);
  // 元の家を地面の原点まわりに回すと屋根と三角の妻壁が浮くため、接地した焼け跡へ替える。
  rt.after(30 + Math.random() * 25, () => {
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
      const drop = 1.4;
      fire.base -= drop; fire.ly -= drop;
      fire.flame.position.y -= drop; fire.inner.position.y -= drop;
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

import { jinkeiBuild } from './jinkei.js';

// 備えごとの人数・細かな持ち場は復元値。総勢とは別に本物の兵を増やさない。
// 名の伝わらない持ち場に架空の将を置かず、旗と紋は既存の家の物で示す。
function sonaePlan(name, team, honjin, facing, rows) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, sonae: rows.map(([id, role, general, soldiers, x, z, face, flag, mon, count = 0, w = 14, d = 8]) => ({
    id, role, general, soldiers, at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
    facing: face, flag, mon, count, w, d, bindOnly: count === 0,
  })) };
}

// 作るのは準備時の軽い備えだけ。台本の近い兵・前進・退去を優先する。
function buildSonae(rt, plans) {
  const hosts = [];
  for (const plan of plans) jinkeiBuild(rt, plan, (s, at) => {
    const h = rt.world.addDistantArmy({ ...at, w: s.w, d: s.d, count: s.count, facing: s.facing,
      team: plan.team, armor: plan.team ? 0x34302a : 0x2b3140, flagTex: flagTexture(s.flag), mon: s.mon,
      kind: 'mixed', host: false, flagRate: 0.18, banners: 2, general: s.general === '名は伝わらない' ? undefined : s.general, seed: 15810 + hosts.length });
    h.army.noWake = true;
    h.army.jinkeiGuard = true;
    hosts.push(h);
    return h;
  });
  return hosts;
}

// 信長公記の十月の攻め。村重は尼崎へ移っており、有岡の本陣には置かない。
// 岸は渡辺勘大夫、鵯塚は野村丹後。細かな持ち場と人数は推定。荒木の旗・紋は丸の代用（既存の表示）。
const ARIOKA_ATTACK = sonaePlan('惣構えの囲み', 0, { x: CAMP.x, z: CAMP.z + 4 }, Math.PI, [
  ['honjin', '本陣', '織田信忠', 20000, GATE.x - 60, SOKAKU_N - 80, Math.PI / 2, 'oda', 'oda'],
  ['takijin', '西の攻め口の陣', '滝川一益', 5000, CAMP.x, CAMP.z + 4, Math.PI / 2, 'takigawa', 'takigawa'],
  ['taki', '南の仕寄り', '滝川一益の配下', 5000, -36, 70, Math.PI, 'takigawa', 'takigawa', 90, 30, 14],
  ['niwa', '西の付城の控え', '丹羽長秀', 10000, GATE.x - 32, -58, Math.PI / 2, 'sujikai', 'sujikai', 70, 20, 16],
  ['north', '北の付城の控え', '名は伝わらない', 10000, -24, SOKAKU_N - 24, 0, 'oda', 'oda', 70, 28, 14],
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
  for (let x = TOWN_X + 30; x <= TOWN_X + 150; x += 8.2) for (const s of [-1, 1]) spots.push([x, GATE.z + s * 7.6, 0]);
  for (let z = GATE.z - 18; z >= -196; z -= 8.2) for (const s of [-1, 1]) spots.push([TOWN_X + s * 7.6, z, Math.PI / 2]);
  const batch = makeSimpleBatch(), start = SOLIDS.length;
  for (const [x, z, rot] of spots) {
    const w = 7, d = 5, hw = (rot ? d : w) / 2 + 1, hd = (rot ? w : d) / 2 + 1;
    if (fights.some(([fx, fz, r]) => Math.hypot(x - fx, z - fz) < r)) continue;
    let ok = true, low = Infinity, high = -Infinity;
    for (const ex of [-hw, 0, hw]) for (const ez of [-hd, 0, hd]) {
      const y = W.heightAt(x + ex, z + ez); low = Math.min(low, y); high = Math.max(high, y);
      if (roadD(x + ex, z + ez) < 2.6) ok = false;
    }
    if (!ok || high - low > .5) continue;
    if (SOLIDS.slice(0, start).some((o) => o.x0 < x + hw && o.x1 > x - hw && o.z0 < z + hd && o.z1 > z - hd)) continue;
    hut(W, x, z, w, d, rot, { ita: true, boardRoof: true, weatheredBoards: true, batch, wall: (x + z) % 3 > 1.5 ? 0x6e5a40 : 0x78654c });
  }
  finalizeSimpleBatch(rt, batch);
}
const ARIOKA_DEFEND = sonaePlan('三砦と主郭の守り', 1, { x: HON_X - 2, z: HON_CENTER_Z - 6 }, 0, [
  ['honjin', '本陣', '荒木久左衛門', 1200, HON_X - 2, HON_CENTER_Z - 6, 0, 'maru', 'maru'],
  ['kishi', '岸の砦', '渡辺勘大夫', 500, 20, SOKAKU_N + 26, 0, 'maru', 'maru', 70, 28, 14],
  ['joro', '上ろう塚砦', '中西新八郎ら', 300, JORO_TORIDE.x + 12, JORO_TORIDE.z, -Math.PI / 2, 'maru', 'maru', 0, 8, 10],
  ['hiyodori', '鵯塚砦', '野村丹後', 600, 28, WALL_Z - 10, 0, 'maru', 'maru', 35, 18, 10],
  ['town', '侍町の控え', '荒木久左衛門の配下', 400, TOWN_X - 26, -76, 0, 'maru', 'maru', 0, 8, 6],
]);

const TAKIGAWA = { flag: 'takigawa' };
const ARAKI = { flag: 'maru' };            // 荒木の紋（無いので丸で代える）

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
    q.x = streetX;
    q.z = p.x < TOWN_X - 16 ? GATE.z + lane
      : Math.abs(p.x - streetX) > .8 ? p.z : -32;
    return q;
  }
  return outerGateWay(p, goal, q, lane);
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
  const field = clamp((x - SOKAKU_X - 24) / 3) * clamp((SOKAKU_X + 66 - x) / 3)
    * clamp((z + 190) / 3) * clamp((-25 - z) / 3);
  h += field * .12 * Math.exp(-Math.pow(Math.sin(x * Math.PI / 9) * 7, 2));
  // 惣構えの土塁（木戸の下）
  h += 0.9 * Math.exp(-((z - WALL_Z) ** 2) / 10);
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
  const pos = [], splat = [], water = [], cover = [], keep = [], idx = old.index.array;
  const emit = (i, j, u, v) => {
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
    for (let b = 0; b < div; b++) for (let a = 0; a < div; a++) {
      for (const [u, v] of [[a, b], [a, b + 1], [a + 1, b], [a, b + 1], [a + 1, b + 1], [a + 1, b]]) emit(i, j, u / div, v / div);
    }
  }
  old.setIndex(keep);
  const g = new THREE.BufferGeometry();
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
  if (!F.fireGuide) { F.fireGuide = true; rt.bark('侍町に火が回った。火を避け、南の辻から木戸へ通れ'); }
  if (!F.civsFled) {
    F.civsFled = true; rt.obj('evac', '町の者の逃げ道を空けよ', 'side');
  }
}

// この戦の行き先は一つ。仲間・敵・曲がり角の別々の印を重ねない。
function ariMark(rt, id, at, label) {
  for (const old of ['taki', 'turn', 'g1', 'aid', 'dp']) rt.unmark(old);
  rt.marker(id, at, label, { guideAlways: true, hideNear: 3, hideOnArrival: true });
}

// 有岡の町だけ夜の青みと一面の艶を抑える。堀・田・川の材質は替えない。
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
    new THREE.MeshBasicMaterial({ color: 0x797466, transparent: true, opacity: .26, depthWrite: false, side: THREE.DoubleSide }),
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

// 任務中の兵だけを拾う。主郭の城将や未出動の控えへ誘わない。
function ariNearestFoe(rt) {
  const F = rt.flags, C = F.dpOn && F.dp?.cur;
  if (F.ending || rt.over || F.step !== 1 || C && C.s.kind !== 'hold') return null;
  const p = rt.player.u.pos;
  let nearest = null, best = Infinity;
  for (const u of rt.army.units) {
    const g = u.group;
    if (!g || (C ? !C.groups.includes(g) : g !== F.g1) || !g.count || g.routed) continue;
    if (!u.alive || u.gone || u.dying || u.fleeing || u.woundOut || u.rearWound || u.noTarget || u.invuln) continue;
    if (C?.rangedEnemy && (u.type !== 'gun' && u.type !== 'bow' || u.sidearm)) continue;
    const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
    if (d < best) { best = d; nearest = u; }
  }
  return nearest;
}

const arioka = {
  missionSingleLine: true,
  hideMissionDots: true,
  enemyTriangleSigns: true,
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  noSiegeCards: true,
  noPlayerFoot: true,
  quietMiss: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  bannerAllowed: (rt) => !!rt.over || !!rt.flags.ending,
  missions: ['開門を待て', '辻へ進め', 'この敵をたおせ', 'ここを守れ', '木戸へ戻れ', '味方を待て', '木戸を守り抜いた', '木戸の外へ退け'],
  missionOf(rt) {
    const F = rt.flags, C = F.dpOn && F.dp?.cur;
    if (F.ending || rt.over) return rt.tracker.main ? 6 : 7;
    if (F.step === 0) return 0;
    if (C?.s.kind === 'move') return rt.distTo(C.at) <= 13 && rt.player.u.pos.x < GATE.x - 1 ? 5 : 4;
    if (C?.s.kind === 'hold') {
      if (!C.defending && rt.distTo(C.at) > C.botRadius) return 1;
      // 守備中は印から離れない。射手が確保を妨げる間だけ相手を示す。
      return C.rangedEnemy && ariNearestFoe(rt) ? 2 : 3;
    }
    if (!C && !gone(F.g1) && ariNearestFoe(rt)) return 2;
    return C?.at && rt.distTo(C.at) <= 16 ? 3 : 1;
  },
  missionHeading(rt) { return this.missions[this.missionOf(rt)]; },
  missionSignTarget(rt) { return this.missionOf(rt) === 2 ? ariNearestFoe(rt) : null; },
  // 久左衛門は主郭に残る城将。討取りの行き先と分け、既存の本人に印を付ける。
  commanderSignTarget(rt) {
    const u = rt.flags.ehon?.general;
    return !rt.flags.ending && !rt.over && u?.alive && !u.gone && !u.dying && !u.woundOut ? u : null;
  },
  namedGuideTarget(rt) { return this.commanderSignTarget(rt); },
  missionPin(rt) {
    const F = rt.flags, C = F.dpOn && F.dp?.cur;
    if (F.ending || rt.over || !rt.player.u.alive) return null;
    const pin = F.ariMissionPin || (F.ariMissionPin = { x: 0, z: 0, r: 3, hide: 3 });
    const stage = this.missionOf(rt), enemy = stage === 2 ? ariNearestFoe(rt) : null;
    if (enemy && rt.player.inRange && rt.player.rangeCueTarget === enemy) return null;
    const post = F.ariMissionPost || (F.ariMissionPost = { x: 0, z: 0 });
    post.x = stage === 0 ? GATE.x - 30 : C?.at?.x ?? TOWN_X - 2;
    post.z = stage === 0 ? GATE.z : C?.at?.z ?? -14;
    const goal = enemy ? enemy.pos : post;
    const way = gateWay(rt.army, rt.player.u, goal);
    pin.x = way.x; pin.z = way.z;
    pin.route = way !== goal; pin.unit = enemy && !pin.route ? enemy : null;
    pin.enemy = !!pin.unit; pin.waiting = !enemy && !pin.route && (stage === 0 || stage === 3 || stage === 5);
    pin.r = pin.hide = pin.route ? .5 : enemy ? .2 : stage === 3 ? C.botRadius || 16 : 3;
    pin.arrived = pin.waiting && Math.hypot(rt.player.u.pos.x - pin.x, rt.player.u.pos.z - pin.z) <= pin.r;
    return pin;
  },
  waitForIntro: true,
  compactIntro: true, introTaskFirst: true,
  introText: '木戸が開くまで味方の後ろで待とう。開いたら組と辻へ進み、十二秒守ろう。戻れの合図で木戸の外へ戻り、敵を防ごう。',
  civilianCrowd: { bands: PEOPLE_BANDS },
  noUnitContrast: true, // 実際の姿からずれる白い人型を重ねず、足元の自分の印は残す。
  compactCombatGuides: true, compactGuardGuide: true,
  enemyCornerSign: true, // 乱戦の相手は四隅で示し、長い白枠で隣の具足や槍を隠さない。
  enemySignOnly: true, enemyFootRingRadius: .4, // 四隅と足元を残し、刀の印と大きな輪で胴を覆わない。
  enemyFrameAtPosition: true, compactApproachGuide: true, // 現在の相手を示し、接近の大旗を重ねない。
  compactPlayerSign: true, // 足元と向きは残し、白い輪で土橋や兵の足を隠さない。
  keepPlayerFeet: true, footFrameMinDistance: 1.6, // 携帯横でも本人の足を画面内へ収め、輪だけを残さない。壁際の寄った視点は保つ。
  openingFootSignOnly: true, // 開門待ちでも本人を白い全身枠で覆わず、足元で示す。
  hideArmyPeek: true, // 局地の任務札へ両軍の帯を重ねない。軍の名は出陣札に残す。
  playerSignMinScale: .4, playerSignScale: .6, // 小輪の下限も指定し、共通の大きな白輪へ戻さない。
  playerSignBodyScale: 0, playerFootSignOnly: true, // 本人は足元だけで示し、重なる味方へ白い人型を載せない。
  groundFlagGuides: true, compactFlagGuide: true, compactFloorGuides: true,
  groundAdvanceGuides: true, // 曲がり角は通れる床の短い矢印で示し、通りがかった兵を大枠で囲まない。
  compactDestinationSign: true, compactFlagEmphasis: true,
  cornerFlagFrames: true, subtleFlagFrames: true,
  namedGuideMarkers: true,
  travelGuideLabel: () => '道の印へ進め',
  edgeDestinationLabel: () => '道の印へ', // 実物の旗がない曲がり角を「旗へ」と呼ばない。
  hideArrivedDestination: true, // 辻や曲がり角に着いたら、本人を覆う大きな印を足元へ畳む。
  compactHoldGuide: true, // 持ち場の印は地面へ収め、兵より大きな輪を重ねない。
  softGuideRings: true, dashedGuideRings: true, nearAllyBodyOnly: true,
  nearAllySolidBody: true, // 視点に入り込んだ味方だけ全身で避け、透けた顔や馬具を重ねない。
  nearAllyCameraAvoid: false, // 密集した味方で視点を本人の胴へ押し込まず、描く間の全身よけを使う。
  nearAllyWholeOcclusion: true, // 本人との間に立つ味方も全身で避け、笠と顔の中身を重ねない。
  nearAllySightWidth: 1.2, // 密集時の肩と笠も拾い、本人の印だけが味方の横へ離れて見えるのを抑える。
  nearSceneryScreenCut: false, // 焼けた町屋の梁と空を画面の長方形で切らず、既存の距離の遮蔽に任せる。
  cameraVolumeView: true, // 門柱・開いた戸板・竹束で画面が塞がれた時も、空いている肩位置を選ぶ。
  groundGuideRings: true, // 木戸を守る黄色い輪は設置時に地形へ沿わせる。
  nearAllyFadeRadius: 2.2, // 目の前の笠と肩で通りが埋まる前に避ける。兵の当たりと動きは保つ。
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
    if (rt.flags.ending) return '退き太鼓。木戸の外へ戻れ';
    const cue = rt.hud.retreatGuide;
    if (cue?.active && cue.valid && cue.treatment)
      return this.treatmentGuideLabel(rt, cue);
    const C = rt.flags.dpOn && rt.flags.dp?.cur;
    // 段が始まる前の C は false。種類も確かめ、退避の案内で戦を止めない。
    if (C?.s?.kind === 'move' && !C.arr) return ariReturnGuide(rt.player.u.pos);
    // 押された時も攻めの行き先を失わせず、守る範囲の外では戻る下知を示す。
    if (rt.flags.step === 0) return '先手の後ろで開門を待て';
    if (C?.s?.kind === 'hold') {
      if (C.at && Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z) > (C.botRadius || 16))
        return C.defending ? '道の印で木戸へ戻れ' : '道の印で辻へ戻れ';
      if (C.defending) return reached
        ? '息を整え、木戸を守れ' : '木戸の味方へ下がれ';
      return reached ? '息を整え、辻を守れ'
        : '辻の味方へ寄って休め';
    }
    return reached ? '味方の後ろで息を整えよ' : '味方の後ろへ下がれ';
  },
  taskDetail(rt, title, progress) {
    const cue = rt.hud.retreatGuide, p = rt.player;
    if (rt.flags.ending || rt.over) return progress;
    // 補足が空だと共通の「味方の旗へ」に戻る。今の下知に沿う待ち方を示す。
    if (!progress) return rt.flags.step === 0 ? `開門まであと${Math.max(0, Math.ceil((rt.flags.openAt ?? rt.t) - rt.t))}秒`
      : rt.flags.dp?.cur?.defending ? '土橋から来る敵に槍を向けよ'
        : '道の印をたどり、組から離れるな';
    if (!(cue?.active && cue.valid) && p.u.hp >= p.u.maxHp * .3 && !p.u.mobbed && p.sta >= 20 && !(rt.retreatUntil > rt.t)) return progress;
    // 持ち場の外では見出しが戻る場所を示す。進む文を重ねず、距離と期限を残す。
    if (title === '道の印で辻へ戻れ' || title === '道の印で木戸へ戻れ') return progress;
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
    mudColor: 0x7a6c5c, grassLift: 0.35, grass: 0x8a7d5a, grassTints: [0xffffff, 0xd8c8a0, 0xb8ac88], grassH: 0.8, tallGrass: 0.45,
    flagColors: [0xe6dfcc, 0x24211e, 0x2e3a52],
    fights: [[GATE.x, GATE.z, 26], [TOWN_X - 24, GATE.z, 24], [TOWN_X - 12, -70, 24], [TOWN_X, -14, 22]],
    noGrass: (x, z) => x > GATE.x + 2 && x < SOKAKU_X,   // 惣構えの内（町屋と侍町）は踏み固めた土。草は木戸の外だけ
  },
  spawn: { x: GATE.x - 40, z: GATE.z, heading: Math.PI / 2 },
  frameCamera: ariTabaView,
  world: {
    seed: 15791, moveLim: 1080, groundHalf: 1100,
    time: 'night', unitNightScale: 0, // 兵だけ青白く光らせず、具足と顔を同じ月光で照らす。
    drawTimeUnitParts: true, // 移動後の骨と具足の逆行列を描く時にそろえ、笠・手・槍だけを宙へ残さない。
    fullTipMatrices: true, // 遠い兵も手首と指をそろえ、木戸から手の皮が長い帯に伸びるのを防ぐ。
    movingHiddenBones: true, // 体の中心が画面外でも、動いた兵の骨を今の位置へそろえる。
    denseTabaBundles: true, // 高画質の竹束は細竹の束にし、太い黒い杭に見せない。
    winter: true,
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
    nearCedarBranches: true, // 高画質でも杉を木全体の交差板へ替えず、共有する枝房を残す。
    clearGroves: true, // 追加の林も町の空地・通り・川岸を空け、家並みに大きな木を重ねない。
    tufts: 2600,
    treeDensity: (x, z) => ((Math.abs(x) < SOKAKU_X + 10 && z > SOKAKU_N - 20 && z < WALL_Z + 20) ||
      (x > CAMP.x - 30 && x < GATE.x && Math.abs(z - GATE.z) < 45) ? 0.05 : 0.6),
    groves: [{ x: TOWN_X + 50, z: -20, r: 10, n: 10, kind: 'broad' }, { x: GATE.x, z: 40, r: 10, n: 10, kind: 'broad' }],
    fleeOut: (x, z, team) => team === 1 && x > HON_W && x < HON_E && z > HON_N && z < HON_Z,
  },

  setup(rt) {
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
    // ---- 惣構えの柵（西の上ろう塚の木戸が内応で開く） ----
    const cameraWalls = [];
    F.ariCameraGates = [];
    F.ariCameraHouses = [];
    const noT = (segs) => {
      for (const s of segs) {
        s.noTarget = true; s.wall = true;
        if (s.mesh.ariHoles) attachSama([s], s.mesh.ariHoles);
        const [ax, az, bx, bz] = s.seg;
        cameraWalls.push({ s, ax, az, dx: bx - ax, dz: bz - az,
          bottom: Math.min(W.heightAt(ax, az), W.heightAt(bx, bz)) - .1,
          top: Math.max(W.heightAt(ax, az), W.heightAt(bx, bz)) + (s.h || 2.45) });
      }
      return segs;
    };
    // 束ねた柵の面を毎回調べず、歩く柵と同じ線で視点を手前へ寄せる。
    W.cameraBlockFraction = (from, to) => {
      const dx = to.x - from.x, dz = to.z - from.z;
      let hit = null;
      // 竹束を背にしても視点を束の中へ入れない。形・当たりの入れ物は使い回す。
      if (F.tabas) for (const tb of F.tabas) {
        if (!tb.m.visible || !tb.ariCamera) continue;
        const tabaCamera = ariTabaCameraPose(tb);
        const t = ariGateCameraHit(tabaCamera, from, to);
        if (t !== null && (hit === null || t < hit)) hit = t;
      }
      for (const gate of F.ariCameraGates) {
        const t = ariGateCameraHit(gate, from, to);
        if (t !== null && (hit === null || t < hit)) hit = t;
      }
      for (const house of F.ariCameraHouses) {
        const t = ariGateCameraHit(house, from, to);
        if (t !== null && (hit === null || t < hit)) hit = t;
      }
      for (const w of cameraWalls) {
        if (!w.s.alive || w.s.opened) continue;
        const den = dx * w.dz - dz * w.dx;
        if (Math.abs(den) < .000001) continue;
        const ax = w.ax - from.x, az = w.az - from.z;
        const t = (ax * w.dz - az * w.dx) / den;
        if (t <= 0 || t >= 1 || (hit !== null && t >= hit)) continue;
        const v = (ax * dz - az * dx) / den;
        if (v < 0 || v > 1) continue;
        const y = from.y + (to.y - from.y) * t;
        if (y >= w.bottom && y <= w.top) hit = t;
      }
      // 町屋の歩く壁も使う。網目状に透かした壁の中へ視点を入れない。
      // 崩れた家の壁は既存の処理で一覧から外れるため、見えない壁は残らない。
      for (const w of INTERIOR_WALLS) {
        if (Math.max(from.x, to.x) < Math.min(w.ax, w.bx) || Math.min(from.x, to.x) > Math.max(w.ax, w.bx)
          || Math.max(from.z, to.z) < Math.min(w.az, w.bz) || Math.min(from.z, to.z) > Math.max(w.az, w.bz)) continue;
        const sx = w.bx - w.ax, sz = w.bz - w.az, den = dx * sz - dz * sx;
        if (Math.abs(den) < .000001) continue;
        const ax = w.ax - from.x, az = w.az - from.z;
        const t = (ax * sz - az * sx) / den, v = (ax * dz - az * dx) / den;
        if (t <= 0 || t >= 1 || (hit !== null && t >= hit) || v < 0 || v > 1) continue;
        const y = from.y + (to.y - from.y) * t;
        if (y >= w.yBot && y <= w.yTop) hit = t;
      }
      return hit;
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
        const holes = [], mesh = castleBoardFence(world, seg, { h: 2.45, samaStep: 1.5, holes, batch: PB });
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
    F.gate = rt.army.addStruct({ seg: [GATE.x, GATE.z - 3.5, GATE.x, GATE.z + 3.5], nx: -1, nz: 0, hp: 1e9, maxHp: 1e9, team: 1, name: '上ろう塚の木戸' });
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
      const y = W.heightAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) + moat.depth * 0.6;
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
    // ---- 惣構え全体の囲い（東西約800m・南北約1,700mを実寸。四方を閉じ、開くのは西の上ろう塚の木戸だけ） ----
    // 南の塀は東西の土塁につなぎ、木戸以外に隙間を残さない。
    outerWall([[-SOKAKU_X, WALL_Z], [-SOKAKU_X, GATE.z + 45]]);
    outerWall([[-SOKAKU_X, GATE.z - 45], [-SOKAKU_X, SOKAKU_N]]);
    for (const pts of [[[GATE.x, GATE.z + 45], [GATE.x, GATE.z + 3.5]], [[GATE.x, GATE.z - 3.5], [GATE.x, GATE.z - 45]]]) {
      noT(wallLine(rt, pts, { team: 1, hp: 1e9, name: '惣構えの柵', segLen: 8, mesh: townFence, h: 2.45, sama: .5 }));
    }
    outerWall([[SOKAKU_X, WALL_Z], [SOKAKU_X, SOKAKU_N]]);
    outerWall([[-SOKAKU_X, SOKAKU_N], [SOKAKU_X, SOKAKU_N]]);
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
      rt.scene.add(kabukimon(W, TOWN_X, MACHIYA_Z[1], 7, 0, { doors: false }));   // 町屋と侍町の境の木戸（開いたまま。通れる）
      ariGateCamera(rt, TOWN_X, MACHIYA_Z[1], 7, 0, false);
    }
    // 三砦（北＝岸の砦・西＝上ろう塚砦・南＝鵯塚砦）。物見の櫓と旗で目印を置く（HIST_B）
    rt.scene.add(yagura(W, 10, KISHI_TORIDE.z + 10), nobori(W, KISHI_TORIDE.x + 4, KISHI_TORIDE.z + 3, 'maru', 6));
    rt.scene.add(yagura(W, JORO_TORIDE.x + 5, JORO_TORIDE.z - 12));
    F.joroFlag = nobori(W, JORO_TORIDE.x + 9, JORO_TORIDE.z - 14, 'maru', 6); rt.scene.add(F.joroFlag);
    F.joroOdaFlag = nobori(W, JORO_TORIDE.x + 9, JORO_TORIDE.z - 14, 'takigawa', 6); F.joroOdaFlag.visible = false; rt.scene.add(F.joroOdaFlag);
    // 三砦は木造の物見・板葺きの兵舎と蔵・土塁と柵を備える。寸法と建物は摂津の推定復元。
    // 遠い岸・鵯塚も材質ごとにまとめ、実際の兵は増やさない。
    {
      const db = makeSimpleBatch();
      // 上ろう塚の閉じた南北面は乱杭と部分的な板覆い。東西の通り口は空ける。
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
        // 上ろう塚の道の両側、ほかの砦の町側に入口を向ける。
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
    // ---- 城下の町屋（惣構えの内）と本丸の脇の牢 ----
    // 南寄り（木戸に近い）が町屋、北寄り（本丸に近い）が侍町。道は細く、家は密集させる（GAME_C）
    // 城下に松明（敵の居所が見える。主郭の館からも城下の灯が見える。B079・B080）
    for (const [x, z] of [[TOWN_X - 14, -12], [TOWN_X + 14, -14], [TOWN_X - 30, -44], [TOWN_X + 30, -46], [TOWN_X, -58], [ROU.x - 5, ROU.z + 4], [HON_E - 3, HON_Z - 3], [TENSHU_POS.x, TENSHU_POS.z + 4]]) W.addFire(x, z, { torch: true, h: 1.6 });
    F.houses = [
      [-24, -6, 0.1], [22, -2, -0.2], [-36, -34, 0.2], [28, -38, 0], [-6, -52, 0.1], [40, -66, 0.2],
      [-48, -16, 0.15], [36, -20, -0.1], [-18, -40, 0.1], [50, -50, 0.2], [-44, -62, -0.15],
      [-10, -10, Math.PI / 2], [14, -10, -Math.PI / 2], [-10, -26, Math.PI / 2], [14, -26, -Math.PI / 2],
      [-12, GATE.z + 38, Math.PI / 2], [12, GATE.z + 38, -Math.PI / 2],
    ].map(([dx, z, r], i) => {
      const x = TOWN_X + dx;
      // 写真の低い板葺きの町並みへ寄せる。町屋三軒の通り庭と奥の間は保つ。
      const open = i < 3;
      const boardRoof = true;
      const solidStart = SOLIDS.length;
      const interior = open ? goten(rt, x, z, { w: 7, d: 5, rot: r, team: 1, tile: false, naka: true, noTarget: true, kind: 'machiya', profile: 'arioka', earth: 0x947b55, name: '町屋', doorX: 0 }) : null;
      const m = interior ? interior.mesh
        : hut(W, x, z, 7, 5, r, { ita: boardRoof, boardRoof, weatheredBoards: boardRoof, groundedHome: true, solid: !boardRoof, wall: i % 2 ? 0x6e5a40 : 0x7b6448 });
      // 板屋根でも民家の印と従来の当たりを保ち、里の者の置き場を減らさない。
      if (!open && boardRoof) solidRect(x, z, 7.18, 5.18, r).civilianSite = 'home';
      if (!open) rt.scene.add(m);
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
    for (const dx of [74, 92, 110]) for (const z of [-30, -10, 10, 30]) {
      hut(W, TOWN_X + dx, z, 7, 5, Math.PI / 2, {
        ita: true, boardRoof: true,
        weatheredBoards: true, batch: townBatch, wall: 0x78654c,
      });
    }
    finalizeSimpleBatch(rt, townBatch);
    ariStreetHouses(rt, W);
    noT(wallLine(rt, [[TOWN_X + 8, -22], [TOWN_X + 8, -6]],
      { team: 1, hp: 1e9, name: '町屋の柵', mesh: townFence, h: 2.45, sama: .5 }));
    // 清洲の裏方小屋のように、居所とは屋根と開口を分ける。寸法・床・戸口は保つ。
    // 高画質では既存の砦用の作りを使い、低い切妻板葺きと縦板・小さな連子窓へ替える。
    // 北の柵と重ねず、長屋の裏にも歩ける庭を残す。
    goten(rt, HON_W + 5, HON_N + 14, { w: 7, d: 4, team: 1, tile: false, naka: true, noTarget: true, kind: 'nagaya', profile: 'arioka', fieldFort: true, earth: 0x947b55, name: '主郭の長屋', oku: 0 });
    rt.scene.add(yagura(W, HON_E - 3, HON_Z - 4));
    // 本丸：台地の縁に野面積みの石垣（牢へ上る道は空ける）と、石垣の上に館（確かな姿の分からない三重天守は置かない）
    for (const [a, b] of HON_ISHIGAKI_SEGS) {
      // 野面積の腰だけを描く。高い石垣の素材への差し替えも行わない。
      ishigaki(W, [a, b], { kind: 'nozura', top: 0.1, minH: 1.2, maxH: 2.2, noKit: true, batch: KB });
      noT(wallLine(rt, [a, b], { team: 1, hp: 1e9, name: '主郭の板塀', segLen: 24, mesh: farFence, h: 2.4 }));
    }
    ariGate(rt, HON_ENTRY_X, HON_Z, HON_GAP[1] - HON_GAP[0], 0, KB);
    // 本丸の水堀（石垣の手前・町側。道の口＝HON_GAP はそのまま地続きで、水に入らず上がれる）
    for (const pts of HON_MOAT_SEGS) water(pts, HON_MOAT);
    // 本丸の西の堀（南面と同じ幅・深さ）
    for (const pts of HON_W_MOAT_SEGS) water(pts, HON_W_MOAT);
    // 十月の攻めでは本丸は持ちこたえる。館を作るだけで開城や救出の筋は進めない。
    goten(rt, TENSHU_POS.x, TENSHU_POS.z, { w: 8, d: 5, team: 1, tile: false, naka: true, noTarget: true, profile: 'arioka', earth: 0x947b55, name: '本丸の館' });
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
      const g = mergeGeometries(parts), mesh = new THREE.Mesh(g, material); mesh.receiveShadow = true; rt.scene.add(mesh);
      mesh.userData.camNear = true;
      for (const part of parts) part.dispose();
    }
    finalizeSimpleBatch(rt, PB);
    finalizeKitBatch(rt, KB);   // 塀・櫓門・隅櫓・石垣・多聞をまとめて描く
    // 岸の砦の控えは備えの表から、牢への道を空けて置く。
    // 本丸の石垣の上に並んで、城下を見下ろして構える鉄砲・弓の者と旗（軽い作り。牢へ上る道の口は空ける）
    {
      const crew = [];
      for (let x = HON_W + 1, k = 0; x <= HON_E - 1; x += 3.4, k++) {
        if (x > HON_GAP[0] - 1 && x < HON_GAP[1] + 1) continue;
        crew.push({ x: x + ((k * 37) % 10) / 10 - 0.5, z: HON_Z - 2.2 - ((k * 53) % 7) / 10, k: ['gun', 'gun', 'bow', 'spear'][k % 4], flag: k % 6 === 0 ? 1 : 0, facing: ((k * 29) % 9 - 4) * 0.06 });
        if (k % 5 === 2) crew.push({ x: x + 1.2, z: HON_Z - 4.5, k: 'banner', facing: 0 });
      }
      W.addDistantArmy({ people: crew, armor: 0x2e2a26, team: 1, flagTex: flagTexture('maru'), seed: 15794 });
    }
    F.rou = hut(W, ROU.x, ROU.z, 4, 3.4, 0.3, { ita: true, boardRoof: true, weatheredBoards: true, h: 1.8, wall: 0x3a3228 });
    rt.scene.add(F.rou);
    for (const [x, z] of [[-10, WALL_Z - 6], [10, WALL_Z - 6], [HON_W + 2, HON_CENTER_Z], [HON_E - 2, HON_CENTER_Z]]) rt.scene.add(nobori(W, x, z, 'maru', 6));
    // 主郭の番所・蔵と侍屋敷。入れる建物は既存の室内の作り（購入した和の部屋）へ結ぶ。
    // 牢は十月の任務では開けない。建物の配置と葺き材は推定。
    // 番所と武具蔵も長屋と同じ板葺き。御殿の厚い入母屋・大きな明かり障子を付けない。
    // 既存の材質別の結合と室内を使い、館・侍屋敷や他の戦の御殿には適用しない。
    // 南の土塀から外階段の下まで離し、戸口へ向かう庭を残す。
    goten(rt, HON_W + 3.5, HON_Z - 8, { w: 4.5, d: 3.5, team: 1, tile: false, naka: true, noTarget: true, kind: 'bansho', profile: 'arioka', fieldFort: true, earth: 0x947b55, name: '主郭の番所', doorX: 0, oku: 0 });
    goten(rt, HON_E - 4, HON_CENTER_Z + 2, { w: 4, d: 3, team: 1, tile: false, naka: true, noTarget: true, profile: 'arioka', fieldFort: true, earth: 0x947b55, name: '主郭の武具蔵', kind: 'kura', doorX: 0, oku: 0 });
    goten(rt, TOWN_X - 18, -166, { w: 9, d: 6, team: 1, tile: false, naka: true, noTarget: true, profile: 'arioka', earth: 0x947b55, name: '侍町の屋敷', doorX: 0 });
    ariYashiki(rt, TOWN_X - 18, -166);
    // 荒村寺跡の庭園が見つかった地域。堂と庭の細かな姿・位置は推定として復元。
    goten(rt, 8, HON_N - 13, { w: 9, d: 7, team: 1, tile: false, naka: true, noTarget: true, kind: 'temple', profile: 'arioka', earth: 0x947b55, name: '城内の寺', doorX: 0, oku: 0 });
    {
      const db = makeSimpleBatch();
      // 町の北の長屋と板葺きの倉。寺への道と南北の大通りを空ける。
      for (const [x, z, w, d] of [[-32, -184, 12, 4], [30, -174, 12, 4], [32, -202, 7, 4]]) ariNagaya(W, TOWN_X + x, z, w, d, db);
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
        box(stone, HON_ENTRY_X, (ya + yb) / 2 - .12, (az + bz) / 2, 6, .24, 1);
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
    // ---- 滝川一益の手（自分の持ち場）と先手の一組 ----
    F.taki = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川一益の手', anchor: { x: GATE.x - 20, z: GATE.z }, facing: Math.PI / 2, width: 14, aggro: 10, formation: 'yari' },
      dress([{ type: 'samurai', n: 2 }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }], TAKIGAWA));
    // 木戸の前後で十人幅へ広がらず、三段の槍列を保つ。
    F.taki.yariRanks = 3;
    F.takiU = F.taki.units[0];
    F.kuri = allyGroup(rt, { fixed: true, fullStrength: true, formation: 'yari', name: '滝川の先手', anchor: { x: GATE.x - 26, z: GATE.z + 12 }, facing: Math.PI / 2, width: 6, aggro: 10, },
      dress([{ type: 'samurai', n: 1, o: { name: '滝川の組頭', hat: 'kabuto_m', haori: 0x2a2a2a } }, { type: 'ashigaru', n: 5 }], TAKIGAWA));
    F.kuriU = F.kuri.units[0];
    // 既存の侍一人を内応将に替える。開門前は城内の口で待ち、開門後は先手に合流する（細かな位置は復元）。
    F.naka = allyGroup(rt, { fixed: true, fullStrength: true, name: '上ろう塚の内応将', anchor: { x: GATE.x + 5, z: GATE.z + 4 }, facing: -Math.PI / 2, width: 1, aggro: 0, order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '中西新八郎', flag: null } }]);
    F.tgun = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の射手', anchor: { x: GATE.x - 34, z: GATE.z - 10 }, facing: Math.PI / 2, formation: 'line', width: 6, aggro: 10 }, dress([{ type: 'gun', n: 4 }], TAKIGAWA));
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
    F.C = buildCastlePlan(rt, ARIOKA_BATTLE_PLAN, { ladders: false, baseHeight: height, edgeW: 3, skipWalls: ['hiyodori', 'kishi', 'joro', 'machiya', 'samuraimachi', 'honmaru'] });
    // 三砦の区域を実際の囲いへ合わせる。西の上ろう塚だけが内応で移る。
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'hiyodori', name: '鵯塚砦', test: F.C.kuruwa.hiyodori.test, pos: F.C.kuruwa.hiyodori.centroid, need: 999, hold: 999 },
        { id: 'kishi', name: '岸の砦', test: F.C.kuruwa.kishi.test, pos: F.C.kuruwa.kishi.centroid, need: 999, hold: 999 },
        { id: 'joro', name: '上ろう塚砦', test: F.C.kuruwa.joro.test, pos: F.C.kuruwa.joro.centroid, need: 4, hold: 8 },
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

    // ---- 陣と大軍（軽い作り） ----
    rt.scene.add(tawara(W, CAMP.x - 14, CAMP.z + 6, 0.3, 6));
    ariWorks(rt, CAMP.x - 14, CAMP.z - 2, Math.PI / 2);
    ariCookCamp(rt);
    for (const [x, z, k] of [[CAMP.x - 14, CAMP.z - 10, 'takigawa'], [CAMP.x + 20, CAMP.z - 10, 'takigawa'], [CAMP.x - 30, GATE.z + 40, 'takigawa']]) rt.scene.add(nobori(W, x, z, k, 6));
    // 織田の本陣（この口の攻め手 滝川一益）と、本丸の城将 荒木久左衛門の陣所（村重は尼崎へ移っている）
    F.honjin = camp(rt, { x: CAMP.x, z: CAMP.z + 4, facing: Math.PI, team: 0, faction: 'oda', mon: 'takigawa', noUma: true, general: { name: '滝川一益' }, guard: 15, reserve: 0, runTo: { x: GATE.x - 20, z: GATE.z } });
    // 主郭の狭い庭へ十六メートルの陣幕を重ねず、館の城将と庭の旗本に分ける。人数は従来のまま。
    const castleLord = enemyGroup(rt, { fixed: true, name: '荒木久左衛門の本陣', anchor: { x: TENSHU_POS.x, z: TENSHU_POS.z + 1 }, width: 1, facing: 0, aggro: 4, morale: 100, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '荒木久左衛門', invuln: true } }], ARAKI));
    const castleGuard = enemyGroup(rt, { fixed: true, name: '主郭の旗本', anchor: { x: HON_X, z: HON_Z - 5 }, width: 6, facing: 0, aggro: 14, morale: 100, formation: 'line' },
      dress([{ type: 'samurai', n: 6 }, { type: 'ashigaru', n: 5 }, { type: 'gun', n: 4 }], ARAKI));
    castleLord.noAI = true; castleGuard.noAI = true;
    F.honjin.guard.noAI = true;
    if (F.honjin.general) F.honjin.general.group.noAI = true;
    F.ehon = { general: castleLord.units[0], guard: castleGuard, pos: { x: TENSHU_POS.x, z: TENSHU_POS.z } };
    F.jinHosts = buildSonae(rt, this.jinkei);
    prepareDefenders(rt);
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
    const reserveSize = Math.min(8, Math.max(0, Math.floor((244 - soldiers) / 2)));
    F.reserves = reserveSize ? [0, 1].map((i) => allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の控え',
      anchor: { x: CAMP.x - 24 - i * 8, z: GATE.z + 10 }, facing: Math.PI / 2,
      order: 'hold', width: 6, formation: 'yari', aggro: 8 }, dress([{ type: 'ashigaru', n: reserveSize }], TAKIGAWA))) : [];
    for (const g of F.reserves) g.noAI = true;
    // 惣構えの前に詰める織田の仕寄せの列と、その篝火（見た目だけ。起こさない）：夜の土塁を前に、味方の厚みと行く先の明かり
    for (const [x, z, s, k] of [[-24, WALL_Z + 22, 15790, 'oda'], [26, WALL_Z + 23, 15791, 'eiraku']]) W.addDistantArmy({ x, z, w: 16, d: 8, count: 45, facing: Math.PI, armor: 0x2b3140, team: 0, flagTex: flagTexture(k), host: false, flagRate: 0.18, banners: 2, seed: s }).army.noWake = true;
    for (const x of [-26, -12, 14, 28]) { const z = WALL_Z + 12; rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
    for (const [x, z] of [[CAMP.x - 30, GATE.z + 35], [CAMP.x + 20, GATE.z + 39], [CAMP.x, GATE.z + 45]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    for (const [x, z] of [[-12, WALL_Z - 3], [12, WALL_Z - 3]]) W.addFire(x, z, { torch: true, h: 1.5 });

    // 月夜のまま、土と草の違い・軒の灯りを読める明るさにする。
    // 低い月の向きでは櫓の影が高さの約五・六倍まで伸びる。高くして約〇・六倍に収める。
    // 月の直射を弱め、影にも届く空の光を少し増やして、地面を黒く覆わないようにする。
    // 共通の独自色の処理は夕暮れ扱いになるため、夜へ戻してから色を渡す。
    W.setTime('night');
    applyLook(rt, NIGHT, false);
    W.sunOffset.set(.4, .8, -.2).normalize().multiplyScalar(120);
    W.skyMat.uniforms.sunDir.value.copy(W.sunOffset).normalize();
    W.sun.intensity = .28; W.hemi.intensity = W.baseHemi = .75;
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
    };
    W.sky.updateMatrixWorld(true); W.mountains.updateMatrixWorld(true);
    W.updateEnv();
    ariStreetDress(rt);
    // 飾りの斜面を作った後で歩行・接地・視点にも同じ盛土を渡す。
    // 有岡だけの上書きとし、ほかの戦の床や堀の判定は変えない。
    const moatGround = W.heightAt.bind(W);
    W.heightAt = (x, z) => ariBridgeHeight(moatGround, x, z, bridgeY);
    rt.setPhase('brief');
    rt.banner('一年の囲み。今、木戸が開く', '味方は織田。城の町へ入り、帰り道を守れ');
    rt.obj('main', HI(rt) ? '組をそろえ、開門を待て' : '先手の後ろで開門を待て', 'main', true);
    rt.say('滝川一益', `${nm(rt)}、中西新八郎が我らを引き入れる。木戸を頼むぞ`, 4);
    rt.after(4.5, () => { if (F.step === 0 && !F.ending) rt.say('滝川の組頭', '狙うは木戸の先の辻じゃ。本丸へは進むな', 4); });
    ariMark(rt, 'taki', { x: GATE.x - 30, z: GATE.z }, '先手の後ろで待つ');
    F.openAt = rt.t + 10;
    rt.after(10, () => this.open(rt));
  },

  // ① 木戸が内から開く
  open(rt) {
    const F = rt.flags;
    if (F.step >= 1 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.stepT = rt.t;
    torideFall(rt, 'joro', '上ろう塚砦', false);
    F.joroFlag.visible = false; F.joroOdaFlag.visible = true;
    rt.setPhase('open');
    rt.unmark('taki');
    // 木戸を開ける
    F.gate.alive = false;
    F.door.userData.open();
    ariDoorCamera(rt, F.door);
    sfx('wood', 0.9);
    rt.banner('上ろう塚に内応', '中西新八郎らが滝川勢を引き入れた。木戸から続け');
    rt.say('中西新八郎', '滝川殿、木戸を開けたぞ！　ここから入られよ！', 4);
    // 「攻め入れ」の札で共通の突撃合図を鳴らす。単発の法螺を重ねない。
    rt.obj('main', '先手と木戸へ攻め入れ', 'main', true);
    rt.after(2.8, () => {
      if (!F.ending && !rt.over && F.step === 1 && rt.player.u.alive) rt.army.play('eiei', F.taki.anchor, .65);
    });
    ariMark(rt, 'turn', () => rt.player.u.pos.x < GATE.x + 8 ? GATE : F.g1.anchor,
      () => rt.player.u.pos.x < GATE.x + 8 ? '上ろう塚の木戸' : '木戸の先の敵');
    rt.after(6, () => { if (!F.ending && !rt.over && F.step === 1 && !F.dpOn) rt.say('滝川の組頭', '早打ちは進めの合図じゃ。先手に続き、二列で入れ', 4); });
    F.taki.formation = 'column'; F.taki.colW = 2;
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
    F.tgun.order = 'move'; F.tgun.dest = { x: GATE.x + 6, z: GATE.z - 10 };
    F.tgun.onArrive = (g) => { g.order = 'hold'; g.anchor = g.dest; g.formation = 'line'; g.onArrive = null; };
    F.g1.order = 'move'; F.g1.aggro = 16; F.g1.formation = 'column'; F.g1.colW = 2;
    F.g1.dest = { x: GATE.x + 10, z: GATE.z };
    F.g1.onArrive = (g) => { g.order = 'attack'; g.formation = 'yari'; g.onArrive = null; };
    // 先手が入る間は射撃を待つ。開門を飛ばしても出陣の時計で猶予を残す。
    rt.after(Math.max(0, 25 - rt.t), () => {
      if (F.ending || rt.over) return;
      F.g1.fire = true;
      for (const g of F.wallG) { g.aggro = 20; g.fire = true; }
    });
    // 侍町への火は、城下へ進む段の下知で付ける。
  },

  sendAid(rt) {
    const F = rt.flags;
    if (F.aidSent || F.ending || rt.over || !rt.player.u.alive || F.step !== 1 || F.dpOn || ariSpent(F.aid)) return;
    F.aidSent = true;
    const g = F.aid; g.noAI = true; g.formation = 'column'; g.colW = 2;
    g.path = null; g.focus = null; g.order = 'move'; g.dest = { x: GATE.x + 10, z: GATE.z + 8 };
    g.onArrive = (q) => { q.anchor = q.dest; q.order = 'hold'; q.formation = 'yari'; q.onArrive = null; };
    sfx('sig_atsumare', 0.7);
    rt.obj('main', '後詰と合流し、木戸の先の敵を崩せ', 'main', true);
    rt.say('滝川の組頭', '法螺の二声は集まれじゃ。後詰と木戸の敵を崩せ', 4);
  },

  // 段を重ねる：城下の辻へ攻め入り、奪った木戸で反撃を受ける。
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which] || F.ending) return;
    F['dp' + which] = true;

    F.dpOn = true; rt.objRemove('dp');
    rt.obj('main', which === 'A' ? '城下の辻へ進み、敵を崩せ' : '奪った木戸の口を固めよ', 'main');
    depthStart(rt, ariCtx(rt), which === 'A' ? ariA() : ariC(), () => { F.dpOn = false; rt.after(3, () => { const q = rt.objectives.find((x) => x.id === 'dp'); if (q && q.state) rt.objRemove('dp'); }); if (!F.ending) then(); });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.unmark('ariCover'); rt.objRemove('ariCover');
    rt.setPhase('end');
    rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp');
    rt.unmark('g1'); rt.unmark('taki'); rt.unmark('turn'); rt.unmark('aid'); rt.objRemove('evac');
    rt.obj('main', '惣構えの木戸を押さえた。法螺貝の二声で集合', 'main', true); rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '惣構えに入り、木戸を押さえた', pts: 20 }; }, '任務達成・惣構えの木戸を押さえた');
    sfx('sig_atsumare', 0.6);
    rt.banner('木戸を守り抜いた', 'おぬしが帰り道を守った。味方は城の町に踏みとどまる');
    rt.say('滝川一益', `${nm(rt)}、この口を守った手柄、忘れぬ。法螺の二声で組を集め、陣へ戻れ`, 4);
    rt.after(4.5, () => {
      if (rt.over) return;
      rt.banner('本丸が開くのは、十一月', '官兵衛が救われる日も、まだ先にある');
      rt.say('滝川の組頭', '生き残った者と帰るぞ。陣で次の下知を待とう', 3.5);
    });
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 10);
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
    if (F.ending || rt.over || !rt.player.u.alive) return;
    // 木戸・辻・帰還を含む局地戦は、七分までに決着させる。
    if (rt.t >= 410) { this.lose(rt, '攻めの時が尽きた。木戸の外へ退け'); return; }
    if (!F.coverTaught && (rt.aimedT || 0) > 0) {
      F.coverTaught = true; F.coverUntil = rt.t + 8; F.gunResumeAt = rt.t + 6;
      const p = rt.player.u.pos;
      F.coverAt = p.x < GATE.x + 1
        ? { x: GATE.x - 12, z: GATE.z + (p.z < GATE.z ? -9 : 9) }
        : p.x < TOWN_X - 24
          ? { x: TORIDE_WORKS[1].x1 - 1.8, z: GATE.z + (p.z < GATE.z ? -10 : 10) }
          : { x: TOWN_X + 5, z: -14 };
      rt.obj('ariCover', '矢印の鉄砲から、柵の陰へ退け', 'side');
      rt.marker('ariCover', F.coverAt, '柵の陰へ退く');
      rt.say('滝川の組頭', '矢印の方から鉄砲じゃ。柵の陰へ横に退け', 4);
      const paused = [];
      for (const g of F.defenders.values()) if (g.fire !== false) { paused.push(g); g.fire = false; }
      rt.after(6, () => { for (const g of paused) g.fire = true; });
    }
    if (F.coverUntil && (rt.t >= F.coverUntil || rt.distTo(F.coverAt) < 3)) {
      if (rt.distTo(F.coverAt) < 3) { rt.objDone('ariCover'); rt.bark('ここなら柵が盾になる。組と進め'); }
      rt.unmark('ariCover'); rt.objRemove('ariCover'); F.coverUntil = 0;
    }
    if (F.farRout && rt.t >= (F.farRoutT || 0)) {
      F.farRout = false; F.farRoutT = rt.t + 20;
      rt.say('伝令', '別口の敵は退き申した。木戸は渡すなとの下知にござる', 3);
    }
    if (F.TA) F.TA.tick(dt);
    if (F.FI) F.FI.tick();
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: true, team: 0 });
    // 先手の損害を見て、初めからいる後詰に下知する。
    if (F.step === 1 && !F.dpOn && !F.aidSent && !(F.aidCheckAt > rt.t)) {
      F.aidCheckAt = rt.t + 0.5;
      let able = 0;
      for (const u of F.taki.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) able++;
      if (ariSpent(F.kuri) || able <= 11) this.sendAid(rt);
    }
    if (F.civsFled && !F.evacSeen && rt.warCrowd) {
      for (const a of rt.warCrowd.agents) {
        if (a.g.home.x > TOWN_X + 30 || !a.out || a.ran < 22 || rt.distTo(a) > 45 || rt.army.wallBetween(rt.player.u.pos, -1, a)) continue;
        F.evacSeen = true; rt.objDone('evac');
        rt.award((t) => t.side.push('町の者が避難するのを見届けた'), '町の者の避難を見届けた'); break;
      }
    }
    if (F.dpOn) { depthTick(rt, dt); return; }
    F.guideT = (F.guideT || 0) - dt;
    const guide = F.guideT <= 0;
    if (guide) F.guideT = 0.5;
    if (F.step === 1) {
      if (guide && !gone(F.g1)) {
        const left = Math.max(0, Math.ceil(180 - (rt.t - F.stepT)));
        // 携帯で補足が隠れても、攻めの期限を本文から読めるようにする。
        rt.obj('main', rt.player.u.pos.x < GATE.x + 8
          ? `木戸へ進め／${left}秒`
          : `木戸の敵を押し返せ／${left}秒`, 'main', true);
        if (left <= 30 && !F.gateHurry) {
          F.gateHurry = true;
          rt.say('滝川の組頭', '攻めの時が尽きるぞ。組と木戸の敵を崩せ', 4);
        }
      }
      if (gone(F.g1)) {
        rt.unmark('g1');
        rt.award((t) => t.side.push('砦の兵を退けた'), '砦の兵を退けた');
        F.g1Done = true;
        // 主任務は木戸の防衛が済んで初めて達成。
        this.deep(rt, 'A', () => this.deep(rt, 'C', () => this.win(rt)));
      } else if (rt.t - F.stepT > 180) this.lose(rt, '木戸の先の敵が崩れぬ');
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

// 岸・上ろう塚砦：別働の織田勢が惣構えの外から攻め落とす遠景の出来事（kaito 10/1「三砦も攻め落とせる区域に」）
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
  const positions = [
    { x: -16, z: GATE.z + 22 }, { x: 22, z: -30 }, { x: -46, z: -4 }, { x: 10, z: -72 },
    // 木戸へ反撃する控えは辻の後ろの通りに置く。辻の戦へ巻き込み、
    // 出番の前に敗走させない。無敵にはせず、退き太鼓でここから歩かせる。
    { x: 2, z: -188 }, { x: 2, z: -206 }, { x: 2, z: -224 }, { x: 2, z: -242 },
  ].map((p) => ({ x: TOWN_X + p.x, z: p.z }));
  let i = 0;
  for (const [reserve, steps] of [[false, ariA()], [true, ariC()]]) {
    for (const step of steps) {
      if (!step.ariOrders) continue;
      for (const order of step.ariOrders) for (const sp of order.foes(rt, {})) add(sp, positions[i++], reserve);
    }
  }
}

const ariSpent = (g) => !g || gone(g);
// 退き太鼓で町の控えも木戸へ向かう。防衛が始まってから遠い町を出発させない。
// 既存の兵が砦の東口まで歩き、寄せの下知までは町側に留まる。
function musterAriCounterattack(rt) {
  const posts = [
    ['木戸へ寄せる荒木勢', 30, 0], ['町の内の鉄砲衆', 36, -6],
    ['道から来る荒木勢', 44, 6], ['荒木久左衛門の手', 52, -8],
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
    const offset = ranged ? 0 : i++ * 7;
    g.noAI = true; g.seekRange = 35; g.formation = 'column'; g.colW = 2;
    g.path = null; g.onArrive = null;
    g.order = 'move'; g.focus = null;
    // 西岸の槍は三段。隣の組は七メートル、後詰は六メートル空け、列を重ねない。
    g.yariRanks = hold ? 3 : 2;
    g.ariMarchWidth ??= g.width;
    g.width = hold ? g.ariMarchWidth : 5;
    g.dest = hold ? { x: at.x - (ranged ? 9 : 4 + Math.floor(offset / 21) * 6), z: at.z + (ranged ? 0 : (offset % 21) - 7) }
      : { x: TOWN_X + (ranged ? 0 : (offset / 7 % 2 ? 1 : -5)),
        z: at.z + (ranged ? 10 : 3 - Math.floor(offset / 14) * 7) };
    // 辻の西の町屋と東の柵の間へ収める。幅十四メートルの列で壁を押し続けない。
    // 辻を取る役目は追撃ではない。後詰も輪の内に収め、十二秒の確保に加わる。
    g.onArrive = (q) => { q.anchor = q.dest; q.order = 'hold'; q.formation = ranged ? 'line' : 'yari'; if (hold) q.facing = Math.PI / 2; q.onArrive = null; };
  }
}
function ariStage(o, defending) {
  const orders = defending ? o.waves : [{ t: 0, foes: o.foes }, ...o.later];
  return {
    // 辻も木戸も持ち場を守る段。試し役が遠い射手を追って印から離れない。
    kind: 'hold', max: defending ? 410 : o.max,
    ariOrders: orders,
    start(rt, C) {
      C.at = o.at; C.goal = o.at; C.defending = defending;
      C.orders = orders.slice(); C.inT = 0; C.lostT = 0; C.lastOrderT = -8;
      C.post = { x: o.at.x, y: rt.world.heightAt(o.at.x, o.at.z), z: o.at.z };
      C.botRadius = o.r || 16; C.scanAt = 0; C.enemy = 0; C.friend = 0; C.rangedEnemy = 0;
      rt.banner(o.title, o.sub); rt.objRemove('main'); rt.obj('dp', o.obj(rt), 'main', true);
      ariMark(rt, 'dp', () => gateWay(rt.army, rt.player.u, C.at),
        () => gateWay(rt.army, rt.player.u, C.at) !== C.at ? '通りの曲がり角へ'
          : defending ? '木戸の持ち場' : C.arrived ? '辻を守る' : '城下の辻へ進む');
      const reserve = rt.flags.reserves[defending ? 1 : 0];
      if (!ariSpent(reserve)) {
        (rt.flags.committed || (rt.flags.committed = [])).push(reserve);
        rt.bark('後詰が続く。組と持ち場を固めよ');
      }
      // 辻も十二秒守る持ち場。木戸と同じ地形に沿う印で、集まる範囲を示す。
      rt.zone('dp', o.at.x, o.at.z, o.r || 16);
      sendAriFriends(rt, o.at, defending);
      for (const [who, words, dur] of o.say || []) rt.say(who, words, dur || 4);
    },
    tick(rt, C, m, ctx, el, dt) {
      if (rt.flags.ending) return false;
      // 時間切れや木戸の陥落は、この段で理由を示して終える。
      if (el > (defending ? Math.max(o.dur + 60, 252 - C.t0) : o.max)) { C.timeout = true; return true; }
      while (C.orders.length) {
        const order = C.orders[0];
        // 最初の寄せには予告の間を残す。前の寄せを崩した時だけ次を早める。
        if (el < order.t && !(C.groups.length && C.groups.every(ariSpent) && el - C.lastOrderT >= 8)) break;
        // 口に届いた寄せが厚い間だけ新手を控えさせる。遠い射手で下知を止めない。
        let fighting = 0;
        for (const g of C.groups) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget
          && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) <= (o.r || 16) + 8) fighting++;
        if (fighting > 20) break;
        C.orders.shift();
        const foes = order.foes(rt, m);
        const coming = foes.some((sp) => !ariSpent(rt.flags.defenders.get(sp.name)));
        // 出番の前に崩れた組を「新手」と呼ばず、確保の秒数も戻さない。
        // 村重の知らせなど、兵の出動とは別の出来事はそのまま伝える。
        if (coming) { C.lastOrderT = el; C.inT = 0; }
        if (coming || order.fn) {
          if (order.title) rt.banner(order.title, order.sub);
          if (order.say) rt.say(order.say[0], order.say[1], 4);
        }
        for (const sp of foes) {
          const g = rt.flags.defenders.get(sp.name); if (ariSpent(g)) continue;
          g.noAI = true; g.fire = !(rt.flags.gunResumeAt > rt.t); g.focus = null; g.path = null;
          if (!g.fire) rt.after(rt.flags.gunResumeAt - rt.t, () => { g.fire = true; });
          g.order = 'move'; g.seekRange = 35; g.ariEngaged = false;
          g.formation = 'column'; g.colW = 2;
          const ranged = sp.kind === 'gun' || sp.list.every((s) => s.type === 'gun' || s.type === 'bow');
          // 射手は町側から口を狙う。槍の列と同じ狭い土橋へ詰め込まない。
          // 新手を同じ一点へ重ねない。土橋は既存の二列で渡り、西岸と辻で組ごとに展開する。
          const flank = C.groups.length % 2 ? 1 : -1;
          g.dest = { x: C.at.x + (defending ? ranged ? 18 : 2 : ranged ? 10 : 4),
            // 木戸脇の射手も七メートルの戸口を見通せる位置で構える。
            z: C.at.z + flank * (defending ? 2 : 5) };
          g.yariRanks = defending ? 3 : 2;
          if (sp.morale !== undefined) g.morale = Math.min(g.morale, sp.morale);
          g.facing = Math.atan2(C.at.x - g.anchor.x, C.at.z - g.anchor.z);
          g.onArrive = (q) => { q.ariEngaged = true; q.order = 'hold'; q.formation = sp.formation || (ranged ? 'line' : 'yari'); if (defending) q.facing = -Math.PI / 2; };
          g.aggro = 16;
          C.groups.push(g);
        }
        if (order.fn) order.fn(rt, C);
      }
      const p = rt.player.u.pos;
      if (rt.t >= C.scanAt) {
        C.scanAt = rt.t + 0.25; C.enemy = 0; C.friend = 0; C.rangedEnemy = 0;
        for (const u of rt.army.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.rearWound || u.noTarget || u.isStruct || u.group?.civ) continue;
          // 遠間から実際に口の味方を狙う射手も、寄せが届いた組として扱う。
          const target = u.atk?.target || u.target;
          const firing = u.team === 1 && u.group.fire !== false && (u.type === 'gun' || u.type === 'bow') && !u.sidearm
            && target?.alive && target.team === 0 && Math.hypot(target.pos.x - C.at.x, target.pos.z - C.at.z) <= (o.r || 16)
            && !rt.army.wallBetween(u.pos, -1, target.pos);
          if (firing) {
            u.group.ariEngaged = true;
            if (Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) > (o.r || 16)) C.rangedEnemy++;
          }
          if (Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) > (o.r || 16)) continue;
          if (Math.abs(u.pos.y - C.post.y) > 3 || rt.army.wallBetween(u.pos, -1, C.post)) continue;
          if (u.team === 0) C.friend++;
          else { C.enemy++; u.group.ariEngaged = true; }
        }
      }
      const enemy = C.enemy, friend = C.friend;
      const present = Math.hypot(p.x - C.at.x, p.z - C.at.z) <= (o.r || 16);
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
      // 攻めの辻は、敵の倍の味方で押さえる。敵が三人残るだけで大勢の味方を無効にしない。
      // 木戸の守りは従来の条件。射手が口を狙う間は、どちらも確保を進めない。
      const advantage = defending ? friend > enemy && enemy <= 2 : friend >= enemy * 2;
      const secure = ready && present && friend > 1 && advantage && !C.rangedEnemy;
      const lastRepelled = !C.orders.length && C.groups.every(ariSpent);
      C.inT = secure ? C.inT + dt : Math.max(0, C.inT - dt);
      if (!defending) {
        // 全滅を求めず、一つの辻を組と十二秒確保すれば次の下知へ。
        C.goal = C.at;
        if (rt.t >= (C.guideAt || 0)) {
          C.guideAt = rt.t + 0.5;
          const instruction = !present ? '道の印で組と辻へ進め' : enemy > friend
            ? '味方へ寄り、槍を構えよ' : secure
            ? `辻を守れ。あと${Math.max(0, Math.ceil(12 - C.inT))}秒`
              : enemy && !advantage ? `辻で味方を待て。あと${enemy * 2 - friend}人`
                : C.rangedEnemy ? '町屋を盾に、辻の射手を崩せ'
                : !ready ? (C.orders.length ? '辻で新手を迎え撃て' : '辻を離れず、町屋の間の敵に備えよ') : '辻の印で味方を待て';
          // 横長の携帯でも、残り時間と今する事を本文から読めるようにする。
          // 人数と残り秒はその場で見える事。使番を毎回出し直さない。
          rt.obj('dp', instruction, 'main', true);
          const left = Math.max(0, Math.ceil(o.max - el));
          rt.objProgress('dp', present
            ? `味方${friend}人・敵${enemy}人${C.rangedEnemy ? `・射手${C.rangedEnemy}人` : ''}\n期限あと${left}秒`
            : `辻まで${Math.ceil(Math.hypot(p.x - C.at.x, p.z - C.at.z))}歩／期限${left}秒`);
        }
        return C.inT >= 12;
      }
      C.lostT = enemy > friend ? C.lostT + dt : 0;
      // 敵が上回る状態が続いた時だけ、木戸を失ったとする。
      if (C.lostT >= 24) { C.failed = true; return true; }
      // 最後の寄せを早く退けても帰り道を四分まで守る。兵や新手は増やさない。
      const held = rt.t >= 240 && (lastRepelled || el >= o.dur) && C.inT >= 12;
      if (rt.t < (C.guideAt || 0)) return held;
      C.guideAt = rt.t + 0.5;
      const instruction = !present ? '組と木戸の口へ戻れ'
        : C.lostT > 0 ? `木戸を奪われる。あと${Math.max(0, Math.ceil(24 - C.lostT))}秒で押し返せ`
          : enemy ? '組と木戸の敵を押し返せ'
            : C.rangedEnemy ? '土塁を盾に、町側の射手を崩せ'
            : friend <= 1 ? '木戸で先手の槍列を待て'
            : !ready ? (C.groups.some((g) => !ariSpent(g) && !g.ariEngaged)
              ? '町から敵が来る。木戸で迎え撃て' : '木戸を離れず、町側に備えよ')
              : secure && C.inT >= 12 && !lastRepelled && el < o.dur ? '木戸で次の寄せに備えよ'
                : secure ? `木戸を守れ。あと${Math.max(0, Math.ceil(12 - C.inT))}秒`
                : '木戸で組と敵を迎え撃て';
      // 横長の携帯では補足が畳まれるため、今する事を札の本文にも出す。
      rt.obj('dp', instruction, 'main', true);
      // 本文の秒数は、確保か寄せの目安のどちらか一つだけにする。
      const approaching = C.groups.reduce((n, g) => n + (!ariSpent(g) && !g.ariEngaged ? 1 : 0), 0);
      rt.objProgress('dp', `味方${friend}人・持ち場の敵${enemy}人${C.rangedEnemy ? `・射手${C.rangedEnemy}人` : ''}\n${approaching ? `町から${approaching}組が移動中／` : C.orders.length ? `新手あと${C.orders.length}組／` : ''}期限あと${Math.max(0, Math.ceil(o.dur + 60 - el))}秒`);
      return held;
    },
    end(rt, C, m) {
      const won = !C.timeout && !C.failed && !rt.flags.ending;
      rt.unmark('dp'); rt.unzone('dp'); rt.unmark('turn');
      if (won) {
        // 取った辻の守りは退き、未出動の控えは主郭の守りに残る。
        if (!defending) for (const g of C.groups) if (!ariSpent(g)) { g.noRout = false; g.morale = 0; }
        rt.objDone('dp'); rt.award((t) => t.side.push(o.reward), o.reward);
      }
      else rt.objFail('dp');
      if (!won) m.ariFailure = C.failed ? '敵に木戸を奪われた'
        : defending ? '木戸の守りが整わぬ。寄せを引くぞ'
          : '期限までに辻を十二秒守れなかった';
      o.onEnd(rt, m, won);
    },
  };
}
function ariFight(o) { return ariStage(o, false); }
function ariHold(o) { return ariStage(o, true); }
// 辻から木戸へは通りと砦を回って約百四十メートル。足を傷め、構えて退く時間も残す。
const ARI_RETURN_LIMIT = 150;
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
    start(rt, C, m) {
      rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp');
      if (o.at) {
        C.at = o.at; C.goal = o.at;
        C.post = { x: o.at.x, y: rt.world.heightAt(o.at.x, o.at.z), z: o.at.z };
        ariMark(rt, 'dp', () => gateWay(rt.army, rt.player.u, C.at), () =>
          o.hold ? ariReturnGuide(rt.player.u.pos) : '城下の辻へ進む');
        rt.obj('main', o.hold ? ariReturnGuide(rt.player.u.pos) : '組と城下の辻へ進め', 'main', true);
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
          : '木戸の外で味方を待て', 'main', true);
        rt.objProgress('main', !C.arr
          ? `木戸へ戻るまで${Math.max(0, Math.ceil(ARI_RETURN_LIMIT - el))}秒`
          : `木戸で槍をそろえよ\n合流待ちは最長あと${Math.max(0, Math.ceil(30 - (rt.t - C.homeSince)))}秒`);
        if (C.arr && !C.waitTold) {
          C.waitTold = true;
          rt.say('滝川の組頭', 'ここで槍をそろえよ。続く味方を待つぞ', 4);
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
function ariCtx(rt) {
  const F = rt.flags;
  return { routeFight: true, withdrawWay: gateWay, botSeek: 60, botSeekHold: true, botAttackOrders: true, backing: false,
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
    ariFight({ at, title: '城下の辻', sub: '町屋の間の辻ごとに、荒木勢が固まる', obj: (rt) => (HI(rt) ? '手の者と辻を十二秒押さえよ' : '組と辻を十二秒押さえよ'),
      say: [['滝川の組頭', '塀を盾に進め。町屋の鉄砲衆を先に崩せ', 4.5]],
      foes: (rt, m) => [{ name: '辻を固める荒木勢', from: { x: TOWN_X - 10, z: -40 }, list: [uS(2), uA(8)], morale: m.fire ? 60 : 90 }, gunLine('町屋の陰の鉄砲', { x: TOWN_X + 22, z: -30 }, 4, {})],
      later: [
        { t: 18, title: '横槍', sub: '西の惣構えの内から、荒木勢が回り込む', say: ['足軽', '西から来よった！　横槍だがや！'], foes: (rt, m) => [{ name: '西から回る荒木勢', from: { x: -SOKAKU_X + 10, z: -4 }, list: [uS(2), uA(7)], morale: m.fire ? 65 : 90 }] },
        { t: 36, say: ['滝川の組頭', '侍町から新手じゃ！　辻を渡すでない！'], foes: (rt, m) => [{ name: '侍町から出る新手', from: { x: TOWN_X + 10, z: -66 }, list: [uS(3), uA(7)], morale: m.fire ? 70 : 95 }] },
      ],
      max: 210, reward: '城下の辻を押し通った',
      onEnd: (rt, m, won) => { if (!won) arioka.lose(rt, m.ariFailure || '辻の敵が崩れぬ'); } }),
  ];
}
// C 城下へ入った後：木戸を奪い返しに来る荒木勢を、木戸の口で防ぐ
function ariC() {
  // 守る中心を堀の斜面から西岸へ。寄せる敵の二列も土橋の外で展開する。
  const at = { x: GATE.x - 14, z: GATE.z };
  return [
    rest({ dur: 9, at, hold: true, say: [['滝川一益', '辻を押さえたぞ。退き太鼓で木戸へ戻り、帰り道を守れ'], ['滝川の組頭', '間を空けた二つ打ちは退けの合図じゃ。木戸の外で後詰と槍をそろえよ', 4]] }),
    ariHold({ at, dur: 88, r: 13, title: '木戸の口', sub: '荒木勢が木戸を奪い返しに押し寄せる', label: '上ろう塚の木戸', obj: (rt) => (HI(rt) ? '手の者を並べ、木戸への寄せを防げ' : '木戸の口で荒木勢を防げ'),
      waves: [
        { t: 4, say: ['足軽', '町から寄せるぞ！　土橋で迎え撃て！'], foes: () => [{ name: '木戸へ寄せる荒木勢', from: { x: TOWN_X, z: -10 }, list: [uS(3), uA(9)] }] },
        { t: 18, say: ['滝川の組頭', '鉄砲衆が寄せるぞ！　木戸脇の土塁を盾にせよ！'], foes: () => [gunLine('町の内の鉄砲衆', { x: TOWN_X - 18, z: TOWN_SOUTH_Z - 4 }, 4, {})] },
        { t: 36, say: ['足軽', '町の奥から新手じゃ！'], foes: () => [{ name: '道から来る荒木勢', from: { x: TOWN_X + 40, z: TOWN_SOUTH_Z - 6 }, list: [uS(2), uA(7)] }] },
        { t: 54, title: '村重が去った知らせ', sub: '家族と家臣を残して尼崎へ。城兵が動揺する',
          say: ['荒木の足軽', '村重様は先月、家族も我らも残して城を出たそうじゃ……'],
          foes: () => [{ name: '荒木久左衛門の手', from: { x: TOWN_X + 12, z: -30 }, list: [uS(4), uA(8)] }],
          fn: (rt, C) => {
            if (rt.flags.murashigeNews) return;
            rt.flags.murashigeNews = true;
            // この口で寄せる城兵だけが揺らぐ。本丸は久左衛門のもとで持ちこたえる。
            for (const g of C.groups) if (!ariSpent(g)) g.morale = Math.max(0, g.morale - 12);
            rt.after(8, () => { if (!rt.over && !rt.flags.ending) rt.say('荒木の使番', '久左衛門様は城におる！　木戸を取り返せ！', 4); });
          } },
      ],
      reward: '木戸の口を守り抜いた', lost: ['滝川の組頭', '押し込まれたか……後詰を出せ！'],
      onEnd: (rt, m, won) => { if (!won) arioka.lose(rt, m.ariFailure || '木戸を守りきれぬ'); } }),
  ];
}

// 両軍の総勢（有岡城を囲む織田勢 五万ほど、城に残った荒木勢 三千とも。数には諸説ある）
arioka.force = (rt) => {
  const F = rt.flags;
  return { a: 50000, a0: 50000, b: 3000, b0: 3000 }; // 総勢の目安。木戸の死傷を全軍から引かない。
};
arioka.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '荒木軍', mon: 'maru' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
// 渡辺勘大夫は岸の砦を退いた後に処刑されたと公記にある。この夜の討取り相手にはしない。
arioka.famous = [];
arioka.date = () => '天正七年十月十五日　冬・夜（復元）';
arioka.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '合図まで待つ' : '');
arioka.skip = (rt) => { if (rt.phase === 'brief' && !rt.over && !rt.flags.ending) arioka.open(rt); };
arioka.history = '天正六年（1578）十月、摂津の荒木村重は信長に背いて有岡城（伊丹城）に籠もった。村重を説きに城へ入った黒田官兵衛（孝高。小寺家の家老で、羽柴秀吉のもとで働いていた）は捕らえられ、牢に入れられた。織田勢は城を囲み、一年近く戦いが続いたが、翌年九月、村重は家族と家臣を残し、わずかな供と城を抜けて尼崎城へ移った。十月十五日、城の中から織田方に内応する者が出て、滝川一益らが惣構えの内へ攻め入った。本丸はなお持ちこたえたが、十一月に城は開け渡された。官兵衛は救い出されたが（救い出された日には諸説ある）、長い牢暮らしで足が不自由になったと伝わる。村重の妻子や家臣の家族の多くは、のちに信長の命で処刑された。荒木家の紋の絵はまだ無いので、ここでは丸の旗で代えている。この戦では十月の惣構えへの攻めと木戸の確保までを扱い、本丸の開城や官兵衛の救出を同じ夜に重ねない。内応は上ろう塚で起きたと公記は記す。操作する木戸は西の上ろう塚に置く。三砦の細かな位置と城下の道は推定で、鵯塚の内応とはしない。辻の反撃と各隊の細かな位置は復元で、人数は目安である。公記の十月十五日の条に時刻や天気の記述はなく、夜の場面は復元である。 各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。';

// 素直な遊び手：木戸から入り、辻で戦い、奪った木戸を守る
arioka.botBrain = (b, inp, o) => { ariBot(b, inp, o); wallSteer(b, inp); };
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
  if (F.step === 1) { const c = gone(F.g1) ? GATE : F.g1.center(); goTo(p, inp, c.x, c.z, 2); return; }

}

export { arioka };

// 当日の細かな時刻・天気・各備えの人数と町割りは復元。
arioka.history += ' 城の復元は伊丹市の解説と遺構をもとに、主郭の人工の堀を西と南に置いた。三砦の内側の囲いと兵舎・蔵、主郭の番所・長屋・館・井戸、寺の堂と庭、屋根の姿、村と田の位置は当時の摂津の作りからの推定である。 城に残る人数は公記に三千ともある。囲み五万は包囲全体の目安で、この木戸の兵数ではない。総大将の信忠は局地の木戸には置かず、この口の滝川の陣と主郭の荒木久左衛門を描く。内応口は西の上ろう塚へ合わせたが、木戸の寸法・道と家並み・夜の明るさや天気・局地の反撃は推定である。岸の砦の撤退と鵯塚の抗戦はこの木戸の防衛任務に重ねない。';

arioka.history += ' 城兵の退き道と、門番が追手の離れた時に門を開ける段取りは推定である。民の在所と人数、町屋と寺から惣構え内の空地へ退く道、東の村から猪名川の西岸沿いに退く道も推定で、包囲から脱出したという意味ではない。';

arioka.history += ' 滝川一益と組頭の下知、荒木久左衛門の下知を伝える使番の声は、遊びのための復元で、史料の発言をそのまま写したものではない。';

arioka.history += ' 主郭の石垣は低い野面積とし、白い塀や天守は置かない。石垣と盛土の高さ・板塀と館の土壁は推定復元である。村重が九月に家族と家臣を残して去った知らせを木戸の山場で取り上げるが、その場の声と城兵の動揺は復元で、十月の戦の最中に村重が脱出したという意味ではない。本丸の守りは続く。';

// 内応の根拠：https://akechikai.or.jp/archives/oshiete/60273
// 当世具足の復元の参考：https://rekihaku.pref.hyogo.lg.jp/digital_museum/bugu-kacchuu/kc_touseigusoku/
arioka.history += ' 滝川の陣幕・幟・本人と先手の指物は既存の滝川家の紋にそろえるが、有岡での旗の色や装束を直接伝えるものではない。滝川一益の甲冑・立物・陣羽織は従来の復元案を使う。滝川の馬印は未確認のため、信長の唐傘や金扇を借りない。荒木久左衛門の桔梗前立は根拠が確認できないため付けない。中西新八郎は内応口に姿を置くが、筋兜・黒漆の桶側胴・刀・顔・細かな立ち位置と合流の動き・台詞は推定復元で、特有の立物・旗印・馬印や豪傑の型は付けない。';
