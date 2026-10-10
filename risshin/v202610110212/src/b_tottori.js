import { pressureTick } from './battle_pressure.js';
// ======================================================================
// 織田家編　鳥取城の戦い（天正九年十月）
// 羽柴秀吉は因幡の鳥取城を囲み、まわりの米を先に買い集めてから、付城と柵で城を囲んで兵糧を断った（鳥取の渇え殺し）。
// 城を守る吉川経家は四か月耐えたが、城の中は飢えに苦しみ、十月二十五日、城兵の命と引き換えに自害して城を開いた。
// 足軽は羽柴秀吉の手。①夜、千代川の岸に着いた毛利の兵糧舟に火をかける ②兵糧を取りに打って出た城兵を止める
// ③開城の使いを城の木戸まで供する（戦は、ここで終わる）
// 川岸の小競り合いと城兵の出撃は推定復元。史実にない後詰の到着・総攻め・城兵への配膳分岐は置かない。
// 向き：北（-z）に鳥取城の山（久松山）。西（-x）を千代川が海へ流れる。東（+x）に秀吉の本陣（太閤ヶ平）。距離は局地用に縮める
// ======================================================================
import { yamaLift, switchback } from './yamalift.js';
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, kabukimon, tobira, dorui, hyoro, umatsunagi, makeSimpleBatch, finalizeSimpleBatch, solidCircle } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { battleEvent, EVENT_FIRE_START, EVENT_MESSENGER } from './battle_events.js';
import { gauss, enemyGroup, allyGroup, centerOf, wallLine } from './bhelp.js';
import { goten, horiboriHeight } from './castle_parts.js';
import { NAKA } from './naka.js';
import { TAIKOGAHIRA, TOTTORI_TAIKOGANARA_PLAN, TOTTORI_SEATS, TOTTORI_HOUSES, TOTTORI_DITCHES } from './castles/tottori.js';
import { applyLook, NIGHT, DAWN, dress, gone as groupGone } from './b_inabayama.js';
// 深手で戦えない兵だけが残っても、敵の寄せが続くとは数えない。
const gone = (g) => groupGone(g) || g.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.noTarget);
import { volleyAt } from './b_tano.js';
import { camp } from './b_mid.js';
import { campWear } from './kakoi.js';
import { demRelief } from './dem.js';
let ttDem = null;
import('./asset_dem_tottori.js').then((m) => { ttDem = m.default; }).catch(() => {});
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const RIVER = [[-70, 200], [-72, 80], [-66, 0], [-74, -90], [-90, -200]];
// 山麓南西の低湿地と、袋川の流れの分かれ（水路）・湿った田（HIST_B。袋川の氾濫原を思わせる）
const BOG = { x: -118, z: 128, r: 58 };
const SUIRO = [[-70, 70], [-92, 104], [-112, 140], [-126, 186]];
const boggy = (x, z) => Math.max(0, 1 - Math.hypot((x - BOG.x) * 0.9, z - BOG.z) / BOG.r);
// 城内に逃げ込んだ里の者の姿（飢えた民・女子ども。兵ではない：的にも敵にもならない飾り）
function townsfolk(rt, spots) {
  const body = new THREE.CylinderGeometry(0.3, 0.38, 0.95, 6), head = new THREE.SphereGeometry(0.17, 6, 5);
  const mb = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: 0x7a6a52, roughness: 1 }), spots.length);
  const mh = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: 0xc9a47e, roughness: 0.9 }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  spots.forEach(([x, z, k], i) => {
    const y = rt.world.heightAt(x, z), sit = k === 's' ? 0.62 : 1;   // 座り込んだ者は丈が低い
    q.setFromEuler(e.set(0, (i * 2.1) % 6.28, 0));
    m.compose(p.set(x, y + 0.48 * sit, z), q, s.set(k === 'c' ? 0.7 : 1, (k === 'c' ? 0.65 : 1) * sit, k === 'c' ? 0.7 : 1)); mb.setMatrixAt(i, m);
    m.compose(p.set(x, y + (0.98 * sit * (k === 'c' ? 0.65 : 1)) + 0.12, z), q, s.setScalar(k === 'c' ? 0.8 : 1)); mh.setMatrixAt(i, m);
  });
  mb.castShadow = true; rt.scene.add(mb, mh);
}
const CASTLE = { x: 10, z: -150 };          // 久松山の山上の陣所
const GATE = { x: 10, z: -84 };
const BOATS = [{ x: -54, z: -30 }, { x: -52, z: -8 }];   // 岸に着いた兵糧舟
const CASTLE_ROADS = [switchback([10, 20], [GATE.x, GATE.z + 4], 7, 32), switchback([GATE.x, GATE.z - 4], [CASTLE.x, CASTLE.z + 8], 7, 30)];
// 出撃の控えは木戸の内の最初の折れに集める。山上から数百歩を下る間に退却させない。
const SALLY_SEATS = [0.2, 0.6, 1].map((t) => ({
  x: CASTLE_ROADS[1][0][0] + (CASTLE_ROADS[1][1][0] - CASTLE_ROADS[1][0][0]) * t,
  z: CASTLE_ROADS[1][0][1] + (CASTLE_ROADS[1][1][1] - CASTLE_ROADS[1][0][1]) * t,
}));
const FENCE_Z = 12;                        // 秀吉方の柵。山腹でなく、城道の登り口の手前の麓で囲む。
const TAIKO = { x: 152, z: -142, ...TAIKOGAHIRA }; // 内陣は東西47m・南北36m。東は +x、南は +z
const TX = TAIKO.w / 2, TZ = TAIKO.d / 2, TB = TAIKO.bankW / 2;
const TAIKO_LOOKOUTS = TOTTORI_TAIKOGANARA_PLAN.yagura.map(k => ({ x: TAIKO.x + k.at[0], z: TAIKO.z + k.at[1] }));
// 西の土塁へ内側から上がる。最後は梯子の足（櫓の南2.9m）へつなぐ。
const TAIKO_RAMPS = TAIKO_LOOKOUTS.map(k => {
  const pts = [[TAIKO.x - TX + 4, TAIKO.z], [TAIKO.x - TX + 4, k.z + 2.9], [k.x, k.z + 2.9]];
  const first = Math.abs(pts[1][1] - pts[0][1]);
  return { pts, first, total: first + pts[1][0] - k.x - 4 };
});
const taikoClear = (x, z) => Math.abs(x - TAIKO.x) < TX + TAIKO.bankW + 11 && Math.abs(z - TAIKO.z) < TZ + TAIKO.bankW + 11;
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
      team: plan.team, armor: plan.team ? 0x34302a : 0x526782, flagTex: flagTexture(s.flag), mon: s.mon,
      kind: 'mixed', general: s.general === '名は伝わらない' ? undefined : s.general, seed: 15810 + hosts.length });
    h.army.noWake = true;
    h.army.jinkeiGuard = true;
    hosts.push(h);
    return h;
  });
  return hosts;
}

// 太閤ヶ平を要に栗谷・円護寺・浜坂へ囲む。付城ごとの将の位置と人数は復元。
// 信長公記・経家の書状に伝わる兵糧攻め。農民は戦う兵の数に入れない。
const TOTTORI_ATTACK = sonaePlan('付城と兵糧の道の囲み', 0, TAIKO, -Math.PI / 2, [
  ['honjin', '本陣', '羽柴秀吉', 6000, TAIKO.x, TAIKO.z, -Math.PI / 2, 'oda', 'none'],
  ['hidenaga', '本陣前の控え', '羽柴秀長', 4000, 112, -82, -Math.PI / 2, 'oda', 'none'],
  ['kuridani', '栗谷側の付城', '名は伝わらない', 4000, -24, -12, Math.PI, 'oda', 'oda', 24, 24, 14],
  ['engoji', '円護寺側の付城', '名は伝わらない', 3000, -36, -186, Math.PI / 2, 'oda', 'oda', 18, 24, 14],
  ['hamasaka', '浜坂側の見張り', '名は伝わらない', 3000, -44, -218, Math.PI / 2, 'oda', 'oda', 18, 24, 14],
]);
const TOTTORI_DEFEND = sonaePlan('山上と麓の守り', 1, { x: CASTLE.x, z: CASTLE.z }, 0, [
  ['honjin', '本陣', '吉川経家', 500, CASTLE.x, CASTLE.z, 0, 'mori', 'mori'],
  ['foot', '麓の木戸と兵糧の番', '森下道誉', 500, GATE.x + 24, GATE.z - 18, 0, 'mori', 'mori'],
  ['ridge', '山上の曲輪の控え', '中村春続', 400, CASTLE.x + 12, CASTLE.z - 6, 0, 'mori', 'mori'],
]);

const TOTTORI_MARUYAMA = sonaePlan('丸山城の守り', 1, { x: -28, z: -222 }, 0, [
  ['honjin', '本陣', '奈佐日本之介', null, -28, -222, 0, 'mori', 'mori'], // 城兵数は不明。鳥取城の千四百と別に扱う。
]);

const ODA = { flag: 'oda', armor: 0x526782, lace: 0x91a5b9, cloth: 0x77869a };
const KUMIGASHIRA = { flagScale: 1.8 }; // 大きな指物で川岸と柵の組頭を見つけられる。
const KIKKAWA = { flag: 'mori' };
const HUNGRY = { flag: 'mori', armor: 0x4a463c, lace: 0x5a5444, cloth: 0x8a806a };   // 飢えた城兵：色の褪せた、ぼろの具足（B098）           // 吉川は毛利の一門（毛利の紋で）
// 飢えは傷と分ける。背丈と槍の長さを保ち、既存の体を細くして歩幅を抑える。
function hungryLook(g) {
  for (const u of g.units) {
    u.mesh.scale.set(0.88, 1, 0.9);
    u.speed *= 0.8; u.run = Math.min(u.run * 0.8, u.speed * 1.15);
    u.fat = Math.max(u.fat || 0, 0.7);
  }
}
const trap = (d, hw, edge) => { const t = Math.max(0, Math.min(1, (hw - d) / edge)); return t * t * (3 - 2 * t); };

const SEATS = TOTTORI_SEATS;
const APPROACHES = SEATS.filter(k => !['sanjo', 'obi', 'kido', 'east'].includes(k.id)).map(k =>
  [[k.x, k.z + k.d + 20], [k.x, k.z + k.d], [k.x, k.z]]);
const HOUSE_PATHS = TOTTORI_HOUSES.map(b => {
  const k = SEATS.find(k => k.id === b.seat) || TAIKO;
  const frontZ = b.seat === 'east' ? -94 : k.z + 5;
  return [[k.x, frontZ], [b.x, frontZ], [b.x, b.z + b.d / 2 + 1.8]];
});
const RIDGE_PATHS = [[[10, -142], [10, -164]], [[10, -128], [26, -128], [26, -94], [34, -94]],
  switchback([28, -198], [30, -180], 3, 12), switchback([-28, -186], [-28, -198], 3, 10)];
const LOOKOUT_PATHS = SEATS.map(k => [[k.x, k.z + 5], [k.x + k.w - 4, k.z + 5], [k.x + k.w - 4, k.z + k.d - 2.1]]);
const LINK_PATHS = [switchback([112, -65], [152, -106], 5, 14),
  switchback([-36, -110], [-36, -151], 5, 18), [[-28, -186], [-36, -171]],
  [[-14, 18], [-14, 8]], [[-132, -150], [-132, -180]], [[-132, -150], [-105, -150]]];
const LOCAL_PATHS = [...CASTLE_ROADS, ...APPROACHES, ...RIDGE_PATHS, ...HOUSE_PATHS, ...LOOKOUT_PATHS, ...LINK_PATHS, ...TAIKO_RAMPS.map(r => r.pts)];
const DITCH_HEIGHTS = TOTTORI_DITCHES.map(h => horiboriHeight(h.pts, { width: h.w, depth: h.deep }));
// 道との交点は土橋にする。計算の途中で点や配列を作らない。
function roadDistance(x, z, paths = LOCAL_PATHS) {
  let best = 6;
  for (const pts of paths) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (x < Math.min(a[0], b[0]) - best || x > Math.max(a[0], b[0]) + best || z < Math.min(a[1], b[1]) - best || z > Math.max(a[1], b[1]) + best) continue;
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return best;
}
function heightRaw(x, z) {
  let h = 0.4 * Math.sin(x * 0.03 + 0.2) * Math.cos(z * 0.028) + 0.3 * Math.sin(z * 0.07 + x * 0.02);
  h += 40 * gauss(x, z, CASTLE.x + 10, CASTLE.z - 50, 5000);           // 久松山
  h += 125 * gauss(x, z, TAIKO.x, TAIKO.z, 10000);                       // 太閤ヶ平
  // 国土地理院の標高：戦場の外の遠い山肌にだけ、実際の起伏を足す（1 が実の約 2m）
  if (ttDem) h += demRelief(ttDem, x, z, { xy: 2, cx: 0, cz: 0, inner: 170, fade: 40, scale: 0.12 });
  h += yamaLift(x, z, LIFT);
  // 平らな内陣の外に土塁と空堀。南大手・東搦手だけ土橋を残す。
  const dx = Math.abs(x - TAIKO.x), dz = Math.abs(z - TAIKO.z);
  const edge = Math.max(dx - TX, dz - TZ);
  if (edge < TAIKO.bankW + 31) {
    const south = z > TAIKO.z + TZ - 2 ? trap(dx, TAIKO.gateW / 2 + 3, 3) : 0;
    const east = x > TAIKO.x + TX - 2 ? trap(dz, TAIKO.gateW / 2 + 3, 3) : 0;
    const mouth = 1 - Math.max(south, east);
    const bank = edge >= 0 && edge <= TAIKO.bankW ? TAIKO.bankH * trap(Math.abs(edge - TB), TB, TB) * mouth : 0;
    const moat = TAIKO.moatD * trap(Math.abs(edge - (TAIKO.bankW + 3)), TAIKO.moatW / 2, 1.8) * mouth;
    const flat = trap(edge, TAIKO.bankW + 31, 20);
    h += (125 + bank - moat - h) * flat;
    // 櫓台と登り道も地面にする。高さは土塁頂と同じ、櫓の数は増やさない。
    let best = 2.4, rampH = h;
    for (const r of TAIKO_RAMPS) for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], vx = b[0] - a[0], vz = b[1] - a[1], length = Math.hypot(vx, vz);
      const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (length * length)));
      const distance = Math.hypot(x - a[0] - t * vx, z - a[1] - t * vz);
      if (distance < best) {
        best = distance;
        rampH = 125 + TAIKO.bankH * Math.min(1, ((i === 1 ? 0 : r.first) + t * length) / r.total);
      }
    }
    h += (rampH - h) * trap(best, 2.4, 1);
    for (const k of TAIKO_LOOKOUTS) {
      const pad = trap(Math.max(Math.abs(x - k.x), Math.abs(z - k.z)), 4, .8);
      h += (125 + TAIKO.bankH - h) * pad;
    }
  }
  const roadGap = 1 - trap(roadDistance(x, z), 5, 2);
  for (const cut of DITCH_HEIGHTS) h += cut(x, z) * roadGap;
  // 千代川と東岸は山の裾から切り離す。舟が山腹を上る川にしない。
  const rx = z < 0 ? -66 + z * 8 / 90 : -66 - z * 6 / 80;
  // 川床の二十歩は平らなまま、山裾との間を広い斜面でつなぐ。
  const valley = trap(Math.abs(x - rx), 64, 44);
  h += (0.5 + z * 0.001 - h) * valley;
  if (z > -48 && z < 26 && x > -60 && x < -24) {
    const edge = Math.min(x + 60, -24 - x, z + 48, 26 - z);
    const k = Math.max(0, Math.min(1, edge / 6));
    h += (0.6 + z * 0.001 - h) * k * k * (3 - 2 * k);
  }
  for (const seat of SEATS) {
    // 曲輪の外は土の斜面へゆっくり戻す。高い平場を三歩で落とす板状の崖にしない。
    const k = trap(Math.max(Math.abs(x - seat.x) - seat.w, Math.abs(z - seat.z) - seat.d), 18, 18);
    h += (seat.y - h) * k;
    // 土塁も歩く地形に入れる。柵はこの稜線に建てる。
    const edge = Math.max(Math.abs(x - seat.x) - seat.w, Math.abs(z - seat.z) - seat.d);
    h += 1.1 * trap(Math.abs(edge), 1.4, 1.4) * roadGap;
  }
  // 尾根沿いの二本の土塁と、その外の浅い堀。城道を横切る所は空ける。
  for (const off of [-10, 10]) {
    const ax = TAIKO.x - TX - TAIKO.bankW - 12, az = TAIKO.z + off, bx = 70, bz = CASTLE.z + off;
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const distance = ((x - ax - t * dx) * -dz + (z - az - t * dz) * dx) / Math.hypot(dx, dz);
    if (t > 0 && t < 1) {
      h += 0.7 * trap(Math.abs(distance), 1.3, 1.3);
      h -= 0.6 * trap(Math.abs(distance - Math.sign(off) * 3), 1.2, 1.2);
    }
  }
  return h;
}
let BOAT_MODEL = null;
function boatMesh() {
  if (BOAT_MODEL) return BOAT_MODEL.clone();
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
  const outline = new THREE.Shape();
  outline.moveTo(0, -4.8); outline.lineTo(1.2, -3.4); outline.lineTo(1.2, 3.4);
  outline.lineTo(0, 4.8); outline.lineTo(-1.2, 3.4); outline.lineTo(-1.2, -3.4); outline.closePath();
  const hullM = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.35, bevelEnabled: false }), wood);
  hullM.rotation.x = -Math.PI / 2; hullM.position.y = -0.25; g.add(hullM);
  const rail = new THREE.BoxGeometry(0.16, 0.8, 6.8), tip = new THREE.BoxGeometry(0.16, 0.9, Math.hypot(1.2, 1.4));
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(rail, wood); m.position.set(side * 1.2, 0.3, 0); g.add(m);
    for (const end of [-1, 1]) {
      const m = new THREE.Mesh(tip, wood); m.position.set(side * 0.6, 0.35, end * 4.1);
      m.rotation.y = Math.atan2(-side * 1.2, end * 1.4); g.add(m);
    }
  }
  const straw = new THREE.MeshStandardMaterial({ color: 0x9a8656, roughness: 1 });
  const bale = new THREE.CylinderGeometry(0.35, 0.35, 0.9, 8);
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(bale, straw); t.rotation.z = Math.PI / 2; t.position.set(0, 0.45, -2.6 + i * 1.7); g.add(t); }
  // 苫は中央の俵を覆い、前後と舷を残す。二枚で屋根を作り、材質と形を使い回す。
  const cover = new THREE.BoxGeometry(1.2, 0.06, 3.8);
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(cover, straw); m.position.set(side * 0.53, 1.15, 0);
    m.rotation.z = -side * 0.42; g.add(m);
  }
  for (const m of g.children) m.castShadow = true;
  BOAT_MODEL = g;
  return g.clone();
}


// 鳥取の近い山肌だけを細かく分ける。描く地面の材質・水・草の割合は使い回す。
// 一枚の三角面を中心で三つに割るので、隣の区画との境に隙間を作らない。
function dressSlopes(rt) {
  const W = rt.world;
  if (!W.terrain?.geometry?.index) return;
  const old = W.terrain.geometry, attrs = old.attributes;
  const names = Object.keys(attrs).filter((name) => name !== 'normal');
  const arrays = names.map((name) => Array.from(attrs[name].array));
  const pi = names.indexOf('position'), vertices = arrays[pi], indices = [];
  const index = old.index.array, p = attrs.position;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3;
    const z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
    if (x < -62 || x > 78 || z < -110 || z > 8) { indices.push(a, b, c); continue; }
    const center = vertices.length / 3;
    for (let k = 0; k < names.length; k++) {
      const attr = attrs[names[k]], out = arrays[k];
      for (let j = 0; j < attr.itemSize; j++) out.push((attr.array[a * attr.itemSize + j] + attr.array[b * attr.itemSize + j] + attr.array[c * attr.itemSize + j]) / 3);
    }
    // 共通の当たりが使う補間高さに合わせる。独立した岩の板を地面に重ねない。
    vertices[center * 3 + 1] = W.heightAt(x, z);
    indices.push(a, b, center, b, c, center, c, a, center);
  }
  const geo = new THREE.BufferGeometry();
  for (let k = 0; k < names.length; k++) geo.setAttribute(names[k], new THREE.Float32BufferAttribute(arrays[k], attrs[names[k]].itemSize));
  geo.setIndex(indices); geo.computeVertexNormals();
  W.terrain.geometry = geo; old.dispose();

  // 小石と草は一つずつの束。城道・曲輪・柵の口には置かない。
  const stone = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.6, 0), new THREE.MeshLambertMaterial({ color: 0x706a55 }), 72);
  const blades = new THREE.BufferGeometry();
  blades.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.35, 0, 0, 0.1, 0.9, 0, 0.35, 0, 0,
    0, 0, -0.3, 0, 0.75, 0.1, 0, 0, 0.3,
    -0.2, 0, -0.2, -0.1, 0.6, 0.1, 0.2, 0, 0.2,
  ], 3));
  blades.computeVertexNormals();
  const grass = new THREE.InstancedMesh(blades, new THREE.MeshLambertMaterial({ color: 0x647348, side: THREE.DoubleSide }), 108);
  const dummy = new THREE.Object3D();
  let ns = 0, ng = 0;
  for (let i = 0; i < 220 && (ns < 72 || ng < 108); i++) {
    const bank = i < 48;
    const z = bank ? -96 + i * 3.8 : -108 + (i * 17.3 % 110);
    const rx = z < 0 ? -66 + z * 8 / 90 : -66 - z * 6 / 80;
    const x = bank ? rx + 19 + (i % 4) * 1.4 : -55 + (i * 29.7 % 125);
    if (castleClear(x, z) || (!bank && (z > FENCE_Z - 12 || W.slopeTan(x, z) < 0.45)) || W.waterDepthAt(x, z) > 0.05) continue;
    const y = W.heightAt(x, z);
    dummy.position.set(x, y + 0.16, z); dummy.rotation.set(0.1, i * 1.7, 0.2);
    if (ns < 72) {
      dummy.scale.set(0.55 + (i % 4) * 0.22, 0.45, 0.7 + (i % 3) * 0.25);
      dummy.updateMatrix(); stone.setMatrixAt(ns++, dummy.matrix);
    }
    if (ng < 108) {
      dummy.position.set(x + 0.8, W.heightAt(x + 0.8, z) + 0.03, z);
      dummy.rotation.set(0, i * 2.3, 0); dummy.scale.setScalar(0.8 + (i % 3) * 0.18);
      dummy.updateMatrix(); grass.setMatrixAt(ng++, dummy.matrix);
    }
  }
  stone.count = ns; grass.count = ng; stone.receiveShadow = grass.receiveShadow = true;
  rt.scene.add(stone, grass);

  // 地面をなぞる細い割れ目。途中で城道や曲輪に触れた区間は抜く。
  const cracks = [];
  for (let row = 0; row < 14; row++) for (let j = 0; j < 16; j++) {
    const x = -45 + row * 8 + Math.sin(j * 0.7 + row) * 0.7, z = -102 + j * 5;
    const xx = -45 + row * 8 + Math.sin((j + 1) * 0.7 + row) * 0.7, zz = z + 5;
    if (castleClear(x, z) || castleClear(xx, zz) || W.slopeTan(x, z) < 0.6) continue;
    const y = W.heightAt(x, z) + 0.04, yy = W.heightAt(xx, zz) + 0.04;
    cracks.push(x - 0.07, y, z, x + 0.07, y, z, xx + 0.07, yy, zz,
      x - 0.07, y, z, xx + 0.07, yy, zz, xx - 0.07, yy, zz);
  }
  const cut = new THREE.BufferGeometry();
  cut.setAttribute('position', new THREE.Float32BufferAttribute(cracks, 3));
  rt.scene.add(new THREE.Mesh(cut, new THREE.MeshBasicMaterial({ color: 0x36362c, side: THREE.DoubleSide })));
}

// この戦の敵の鉄砲二人だけを調べる。構えた一発につき一度、発射前に口薬の煙と音。
function warnGuns(rt) {
  const F = rt.flags, player = rt.player, p = player.u.pos;
  if (F.step !== 1 || !F.guard) return;
  for (const u of F.guard.units) {
    const a = u.atk;
    if (!u.alive || u.fleeing || u.woundOut || u.stagger > 0 || !a?.ranged || a.ttWarn || a.t > 0.65 || a.t <= 0.1 || !a.target?.alive) continue;
    if (Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 45 || rt.army.shotBlocked(u, a.target.pos)) continue;
    a.ttWarn = true;
    rt.army.smoke(u.pos.x, u.pos.y + 1.5, u.pos.z, 0, 0, 0.35);
    rt.army.play('hizara', u.pos, 1);
    if (a.target !== player.u || (F.gunWarnAt ?? -99) + 8 > rt.t) continue;
    F.gunWarnAt = rt.t;
    const dx = u.pos.x - p.x, dz = u.pos.z - p.z;
    const yaw = player.yaw + (player.camYawOff || 0);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const direction = Math.abs(forward) >= Math.abs(right) ? forward > 0 ? '前' : '後ろ' : right > 0 ? '右' : '左';
    rt.bark(`${direction}の舟の番が鉄砲を構えた。柵の陰へ！`);
  }
}

// 屋外では床下・軒下をカメラの置き場にしない。線の当たりだけでは、
// 櫓の脚の間から入った視点が床と筋交いを天井のように映してしまう。
function installTottoriCamera(rt) {
  const player = rt.player, updateCamera = player.updateCamera, dispose = rt.dispose;
  const look = new THREE.Vector3();
  // 建て終わった時に一度だけ拾う。屋根の張り出しと画面の端の余白を含める。
  const covers = NAKA.list.map(I => {
    const lv = I.levels[0], top = I.levels[I.levels.length - 1];
    return { I, hw: lv.w / 2 + 1.4, hd: lv.d / 2 + 1.4,
      bottom: rt.world.heightAt(I.x, I.z) - 1, top: top.y + top.h + 3 };
  });
  player.updateCamera = function (dt, camera) {
    updateCamera.call(this, dt, camera);
    // 実際に室内や櫓の床に上がった時は、従来の室内視点を使う。
    if (NAKA.cur || rt.game?.photo) return;
    const v = camera.position, p = this.u.pos;
    let moved = false;
    for (const b of covers) {
      const I = b.I;
      if (I.disabled || v.y < b.bottom || v.y > b.top) continue;
      const dx = v.x - I.x, dz = v.z - I.z;
      let x = dx * I.c - dz * I.s, z = dx * I.s + dz * I.c;
      if (Math.abs(x) >= b.hw || Math.abs(z) >= b.hd) continue;
      // 本人が外にいる側へ出す。本人も床下なら、最寄りの外縁へ出す。
      const px = (p.x - I.x) * I.c - (p.z - I.z) * I.s;
      const pz = (p.x - I.x) * I.s + (p.z - I.z) * I.c;
      if (Math.abs(px) >= b.hw) x = Math.sign(px) * b.hw;
      else if (Math.abs(pz) >= b.hd) z = Math.sign(pz) * b.hd;
      else if (b.hw - Math.abs(x) < b.hd - Math.abs(z)) x = (Math.sign(x) || 1) * b.hw;
      else z = (Math.sign(z) || 1) * b.hd;
      v.x = I.x + x * I.c + z * I.s; v.z = I.z - x * I.s + z * I.c;
      v.y = Math.max(v.y, rt.world.heightAt(v.x, v.z) + 0.8);
      moved = true;
    }
    if (moved) {
      this.camPos.copy(v);
      look.set(p.x, p.y + 1.4, p.z); camera.lookAt(look);
    }
  };
  rt.dispose = function () {
    player.updateCamera = updateCamera; this.dispose = dispose;
    return dispose.call(this);
  };
}

const tottori = {
  // 家ごとの口ぐせをこの戦だけで替え、後世の「三本の矢」を言わせない。
  battleVoices: { lines: { enemy: {
    ambient: ['腹が減った……もう、動けぬ……', '米は、まだ届かぬか……', '木戸まで、戻らねば……'],
    nanori: ['毛利の名にかけて！', '城の者を守るぞ！'],
    push: ['兵糧の道を開け！', '槍をそろえよ！'],
    pushing: ['米を城へ入れるぞ！', 'そこを退け！'],
    waver: ['力が、入らぬ……', '木戸へ退け！'],
    breaking: ['もう槍が持てぬ……', '城へ戻れ！'],
  } } },
  jinkei: [TOTTORI_ATTACK, TOTTORI_DEFEND, TOTTORI_MARUYAMA],
  noHead: true, // 首の証ではなく、放火・柵の守り・使いの供を働きとする。
  noWake: true, // 持ち場の実兵だけを使い、囲みの遠景から新しい兵を増やさない。
  noDistantBattle: true, botOrders: true,
  lordHata: { spear: 12 }, // 別の遊び方でも共通の百人の旗本を足さない。
  guideMarker(rt) {
    const F = rt.flags;
    if (F.step === 0) return 'hide';
    if (F.step === 1) {
      if (Math.hypot(rt.player.u.pos.x + 42, rt.player.u.pos.z + 4) > 10 && !F.bankReached) return 'bank-road';
      F.bankReached = true;
      if (!gone(F.guard) || !gone(F.guard2)) return 'bank-fight';
      let boat = null, nearest = Infinity;
      for (const b of F.boats) if (!b.burnt) {
        const d = rt.distTo(b);
        if (d < nearest) { boat = b; nearest = d; }
      }
      return boat ? 'b' + boat.i : 'bank-fight';
    }
    if (F.step === 1.5 || F.step === 2 || F.step === 2.5) return 'return';
    if (F.step === 3) return 'env';
    return null;
  },
  noTaisho: true, // 両本陣はこの戦で置く。架空の大将襲撃隊は送らない。
  spawn: { x: -30, z: 10, heading: -Math.PI / 2 },
  world: {
    seed: 15810, moveLim: 250, groundHalf: 250,
    keepSpawnInside: true, // 武将の後ろの持ち場と供も含め、陣形全体を場内へ収める。
    time: 'night',
    wind: [0.7, -0.3],
    autumn: true, // 落葉の色として残す。旧暦十月は冬。
    winter: true,
    muddy: 0.35, slopeForest: 0.35, // 山肌にも土・笹・苔の斑を残す。
    terrainTags: true,   // 急斜面・細道・森で速さ・向き変え・疲れが変わる（terrain_tags.js）
    streams: [{ pts: RIVER, w: 12, depth: 1.2 }, { pts: SUIRO, w: 3.2, depth: 0.7 }],   // 袋川のほか、南西の低湿地へ分かれる水路
    paths: [[[TAIKO.x, TAIKO.z], [TAIKO.x, TAIKO.z + TZ + 18], [108, -80], [60, -30], [20, 40], [-30, 10], [-50, -18]], [[TAIKO.x, TAIKO.z], [TAIKO.x + TX + 18, TAIKO.z]], ...LOCAL_PATHS],
    height,
    // 山麓南西の低湿地：湿って暗い緑と、水路沿いの田
    tint(x, z, h, c) {
      const b = boggy(x, z);
      if (b > 0.05) c.setRGB(c.r * (1 - 0.35 * b) + 0.02, c.g * (1 - 0.18 * b) + 0.03, c.b * (1 - 0.3 * b) + 0.02);
      // 水際は湿った土、その外は草。夜でも水の青緑と岸の茶・緑を分ける。
      const rx = z < 0 ? -66 + z * 8 / 90 : -66 - z * 6 / 80;
      const bank = trap(Math.abs(Math.abs(x - rx) - 20), 10, 5);
      if (bank && z > -100 && z < 90) {
        const grass = 0.5 + 0.5 * Math.sin(x * 0.37 + z * 0.23);
        c.setRGB(c.r * (1 - bank) + (0.27 + grass * 0.05) * bank,
          c.g * (1 - bank) + (0.23 + grass * 0.17) * bank,
          c.b * (1 - bank) + (0.12 + grass * 0.04) * bank);
      }
      // 高い山肌に土と岩のまだらを残す。木・岩は既存の軽い植生を使う。
      if (h > 20) {
        const soil = Math.max(0, Math.sin(x * 0.13 + z * 0.07) * Math.cos(z * 0.19)) * Math.min(1, (h - 20) / 30);
        c.setRGB(c.r + soil * 0.07, c.g - soil * 0.03, c.b + soil * 0.06);
      }
    },
    fieldStage: 'stubble',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (boggy(x, z) < 0.12 || z < 96) return 0;
      if ((Math.floor(x / 13) + Math.floor(z / 15)) % 3 === 0) return 0;
      const ex = Math.min(((x % 13) + 13) % 13, 13 - ((x % 13) + 13) % 13), ez = Math.min(((z % 15) + 15) % 15, 15 - ((z % 15) + 15) % 15);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.8;
    },
    clear: (x, z) => castleClear(x, z) || taikoClear(x, z) || (Math.abs(x) < 100 && z > -100 && z < 90),
    trees: 180,
    tufts: 900,
    treeDensity: (x, z) => (castleClear(x, z) || taikoClear(x, z) ? 0 : Math.abs(x) < 100 && z > -100 && z < 90 ? 0.1 : 1),
    groves: [{ x: 60, z: -20, r: 12, n: 8 }, { x: -30, z: 60, r: 12, n: 8 }],
    fleeOut: (x, z, team) => team === 1 && (z < -210 || x < -120),
  },

  waitForPlayer: true, // 動く・構える・打つまで開戦を待ち、無操作で敗退させない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    dressSlopes(rt);
    // 共通の水面には川筋に沿う波がある。色だけ替え、動きを減らす設定も保つ。
    for (const st of W.def.streams) if (st.mesh) {
      st.mesh.material.color.setHex(0x3b7888);
      st.mesh.material.roughness = 0.24;
      st.mesh.material.emissive.setHex(0x102a30);
      st.mesh.material.emissiveIntensity = 0.16;
    }
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { starving: 'HIST_A', taikogahira: 'HIST_A', kikkawaTsunee: 'HIST_A', kaboBoats: 'HIST_B', marsh: 'HIST_B', townsfolk: 'GAME_C', sallies: 'GAME_C' };
    // 城内に逃げ込んだ民：木戸の内の曲輪に、座り込んだ者・立つ者・子ども（的にならない飾り）
    townsfolk(rt, [[4, -102, 's'], [8, -106, 's'], [14, -100, 'c'], [18, -108, 's'], [0, -112, 'c'], [12, -114, 's'], [22, -104, 'p'], [-4, -98, 's'], [6, -118, 'p'], [16, -120, 'c'], [26, -112, 's'], [-2, -122, 's']]);
    F.step = 0; F.stepT = rt.t; F.ek = 0; F.ak = 0; F.burnt = 0; F.day = 0;
    rt.banner('鳥取城の囲み', '川岸と柵を固め、兵糧を通すな');
    // ---- 城を囲む柵（木戸の前は開けてある） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    noT(wallLine(rt, [[-50, FENCE_Z + 4], [0, FENCE_Z]], { team: 0, hp: 1e9, name: '柵', segLen: 6 }));
    noT(wallLine(rt, [[20, FENCE_Z], [70, FENCE_Z + 6]], { team: 0, hp: 1e9, name: '柵', segLen: 6 }));
    for (const [x, z] of [[-30, FENCE_Z + 8], [40, FENCE_Z + 8]]) rt.scene.add(yagura(W, x, z));
    // 印の先には実物の開いた木の門。左右の柵の口と同じ二十歩の幅を使う。
    rt.scene.add(kabukimon(W, GATE.x, FENCE_Z, 20, 0, { doors: false }));
    for (const x of [0, 20]) rt.scene.add(nobori(W, x, FENCE_Z + 2, 'oda', 6));
    // ---- 鳥取城の木戸と山の上の屋敷 ----
    rt.scene.add(kabukimon(W, GATE.x, GATE.z, 7, 0, { doors: false }));
    F.gateDoor = tobira(W, GATE.x, GATE.z, 7); rt.scene.add(F.gateDoor);
    F.gateBar = rt.army.addStruct({ seg: [GATE.x - 3.5, GATE.z, GATE.x + 3.5, GATE.z], nx: 0, nz: 1, hp: 1e9, team: 1, name: '城の木戸', noTarget: true });
    // 閉じる木戸だけは従来の進行に結ぶ。ほかの虎口は常に開ける。
    buildTottoriCastles(rt, noT);
    for (const [x, z] of [[GATE.x - 6, GATE.z - 4], [GATE.x + 6, GATE.z - 4]]) rt.scene.add(nobori(W, x, z, 'mori', 6));
    // ---- 岸の兵糧舟 ----
    F.boats = BOATS.map((b, i) => {
      const x = b.z < 0 ? -66 + b.z * 8 / 90 : -66 - b.z * 6 / 80;
      const m = boatMesh(), y = W.heightAt(x, b.z) + W.waterDepthAt(x, b.z);
      m.position.set(x + 4.5, y + 0.15, b.z); m.rotation.y = -0.09; rt.scene.add(m);
      // 火をかける印は船べりの岸側へ。川の曲がりで舟と印が離れない。
      return { ...b, x: m.position.x + 2.2, m, i };
    });
    // 苫と俵のそばの小さな灯り。舟を焼く前から川面に船べりが見える。
    for (const b of F.boats) W.addFire(b.m.position.x, b.z + 3, { torch: true, h: b.m.position.y - W.heightAt(b.m.position.x, b.z) + 0.8 });
    // ---- 川岸と柵を受け持つ組 ----
    F.hide = allyGroup(rt, { name: '羽柴の川岸の組', fixed: true, formation: 'line', anchor: { x: -38, z: 6 }, facing: -Math.PI / 2, width: 7, aggro: 10 },
      dress([{ type: 'samurai', n: 1, o: KUMIGASHIRA }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], ODA));
    F.hachi = allyGroup(rt, { name: '羽柴の柵の組', fixed: true, formation: 'line', anchor: { x: 10, z: FENCE_Z + 12 }, facing: Math.PI, width: 7, aggro: 10 },
      dress([{ type: 'samurai', n: 1, o: KUMIGASHIRA }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], ODA));
    F.oda = [F.hide, F.hachi];
    const n = Math.min(30, RANKS[rt.G.rank || 0].squad || 0);
    if (n) rt.makeSquad({ x: -26, z: 22 }, -Math.PI / 2, [{ kind: 'spear', n }]);
    // ---- 太閤ヶ平の本陣と大軍（軽い作り） ----
    // 秀吉は東の陣城に置き、経家は山上に置く。近い組への命令は組頭・伝令が伝える。
    F.honjin = camp(rt, { x: TAIKO.x, z: TAIKO.z, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '羽柴秀吉', hat: 'kabuto_bari', haori: 0x6a4a1c }, guard: 15, reserve: 16, runTo: { x: -20, z: 20 } });
    // 太閤ヶ平は攻めの本陣だけでなく、毛利の後詰が来た時の大きな野戦にも備える堅い陣城。内郭を大きな土塁で囲む
    // 南大手・東搦手を開け、北には口を作らない。
    const west = TAIKO.x - TX - TB, east = TAIKO.x + TX + TB;
    const north = TAIKO.z - TZ - TB, south = TAIKO.z + TZ + TB, gap = TAIKO.gateW / 2;
    for (const pts of [
      // 西の櫓台を外から回り、台の中央と梯子に柵を重ねない。
      [[TAIKO.x - gap, south], [west, south], [west - 3.8, south],
        [west - 3.8, TAIKO.z + TZ - 3.8], [west, TAIKO.z + TZ - 3.8],
        [west, TAIKO.z - TZ + 4.5], [west - 3.8, TAIKO.z - TZ + 4.5],
        [west - 3.8, north], [west, north], [east, north], [east, TAIKO.z - gap]],
      [[TAIKO.x + gap, south], [east, south], [east, TAIKO.z + gap]],
    ]) noT(wallLine(rt, pts, { team: 0, hp: 1e9, name: '柵', segLen: 8 }));
    rt.scene.add(kabukimon(W, TAIKO.x, south, TAIKO.gateW, 0), kabukimon(W, east, TAIKO.z, TAIKO.gateW, Math.PI / 2));
    for (const k of TAIKO_LOOKOUTS) rt.scene.add(yagura(W, k.x, k.z));
    rt.scene.add(hyoro(W, TAIKO.x - 8, TAIKO.z + 10, 0.4), umatsunagi(W, TAIKO.x + 10, TAIKO.z - 8, 0.3, 8));
    // 東西の尾根沿いの二重の遮断線。麓の木戸や川岸の退路は横切らない。
    for (const off of [-10, 10]) {
      noT(wallLine(rt, [[TAIKO.x - TX - TAIKO.bankW - 12, TAIKO.z + off], [70, CASTLE.z + off]], { team: 0, hp: 1e9, name: '竪土塁', segLen: 10 }));
      // 土塁の形は高さの関数にある。柵の下に模型を重ねて二重に盛らない。
    }
    F.ehon = camp(rt, { x: CASTLE.x, z: CASTLE.z, facing: 0, team: 1, faction: 'mori', mon: 'mori', general: { name: '吉川経家', hat: 'kabuto_m', haori: 0x3a2a2a }, guard: 15, reserve: 10, runTo: { x: GATE.x, z: GATE.z - 8 } });
    F.hidenaga = camp(rt, { x: 112, z: -82, facing: -Math.PI / 2, team: 0, faction: 'oda', mon: 'oda', general: { name: '羽柴秀長' }, guard: 15, reserve: 10, runTo: { x: 80, z: -70 } });
    // 番所の戸口と襖に旗竿の束を重ねず、幕の外を通れる陣にする。
    F.nasa = camp(rt, { x: -28, z: -222, compact: true, facing: 0, team: 1, faction: 'mori', mon: 'mori', general: { name: '奈佐日本之介' }, guard: 15, reserve: 10, runTo: { x: -30, z: -186 } });
    F.castleGuards = [['森下道誉', GATE.x + 24, GATE.z - 18], ['中村春続', CASTLE.x + 12, CASTLE.z - 6]].map(([name, x, z]) => {
      const g = enemyGroup(rt, { fixed: true, noAI: true, faction: 'mori', name: name + 'と近習', anchor: { x, z }, facing: 0, width: 3, formation: 'ring', aggro: 4 },
        dress([{ type: 'busho', n: 1, o: { name, invuln: true, horse: false } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 }], KIKKAWA));
      g.units[0].campProtected = true;
      return g;
    });
    F.jinHosts = buildSonae(rt, this.jinkei);
    for (const [x, z] of [[-40, FENCE_Z + 14], [0, FENCE_Z + 14], [40, FENCE_Z + 14], [60, 100]]) W.addFire(x, z, { torch: true, h: 1.4 });
    for (const [x, z] of [[-10, 30], [20, 34]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // 城から逃げ出した飢えた者（脱走者）：柵の外に座り込む。痩せた、ぼろの着物（B098）
    F.deserters = allyGroup(rt, { name: '城から逃げた者', fixed: true, anchor: { x: GATE.x - 14, z: GATE.z + 16 }, facing: Math.PI, width: 4, aggro: 0, noRout: true, fullStrength: true },
      [{ type: 'porter', n: 5, o: { kosode: 1, kosodeCol: 0x6a6048, flag: null } }]);
    F.deserters.civ = true;
    for (const u of F.deserters.units) { u.noTarget = true; u.invuln = true; u.dmg = 0; }
    F.deserters.order = 'hold';
    // 舟の護衛と控えは始めから岸に置く。名のある城将を前線の番兵へ重ねない。
    F.guard = enemyGroup(rt, { fixed: true, faction: 'mori', name: '舟の番', anchor: { x: -52, z: -20 }, facing: Math.PI / 2, width: 5, formation: 'line', aggro: 12, morale: 85, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }, { type: 'gun', n: 2 }], KIKKAWA));
    F.guard2 = enemyGroup(rt, { fixed: true, faction: 'mori', name: '川下の舟の番', anchor: { x: -54, z: -58 }, facing: Math.PI / 2, width: 4, formation: 'line', aggro: 6, morale: 85, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], KIKKAWA));
    // 城兵は初めから木戸の内に待つ。新手はこの控えが道を通って出る。
    // 柵の実兵は共通設定で減るため、城兵も三組計二十一人に絞る。
    // 飢えた兵の打つ間を長くし、足軽大将が味方と二〜三分持ちこたえられる余地を作る。
    F.sallies = [0, 1, 2].map((i) => enemyGroup(rt, { fixed: true, noAI: true, faction: 'mori', name: i ? '木戸の控え' : '木戸の城兵',
      anchor: { ...SALLY_SEATS[i] }, facing: 0, width: 3, colW: 3, formation: 'column', aggro: 5, morale: 55, dmgMult: 0.8, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 1, o: { cdBase: 2, windup: 0.6 } }, { type: 'ashigaru', n: 6, o: { cdBase: 2.4, windup: 0.65 } }], HUNGRY)));
    for (const g of [...F.sallies, F.deserters]) hungryLook(g);
    F.tgun = allyGroup(rt, { fixed: true, name: '柵の内の鉄砲組', anchor: { x: 8, z: FENCE_Z + 17 }, facing: Math.PI, width: 9, aggro: 4, formation: 'line' },
      dress([{ type: 'samurai', n: 1, o: KUMIGASHIRA }, { type: 'gun', n: 10 }], ODA));
    // 主殿と陣所の床・護衛の持ち場を保ち、軽い備えから兵を追加しない。
    for (const g of rt.army.groups) g.noAI = true;
    for (const c of [F.honjin, F.ehon, F.hidenaga, F.nasa]) {
      c.guard.guard = true; c.guard.guardSight = 18; c.guard.guardLeash = 7;
      if (c.general) { c.general.campProtected = true; c.general.noTarget = true; c.general.group.aggro = 0; }
    }
    // 名乗りの札だけでも敵味方と所属が分かる。実在の将の名は保つ。
    for (const g of rt.army.groups) for (const u of g.units) {
      if (u.isPlayer || !['samurai', 'busho', 'cavalry'].includes(u.type)) continue;
      const side = g.team === 1 ? '敵の毛利方' : '味方の羽柴方';
      u.nanori = u.name ? `${side}、${u.name}なり！` : `${side}、槍をそろえよ！`;
    }
    // 兵の内訳と数は準備時に一度だけ固定し、途中に戦う新手を足さない。

    // 賀露の湊も塞いである（海から兵糧を入れさせない。遠景だけの軽い作り）
    rt.scene.add(yagura(W, -58, -188), nobori(W, -58, -184, 'oda', 6));

    F.env = allyGroup(rt, { name: '秀吉の使い', fixed: true, anchor: { x: 0, z: FENCE_Z + 8 }, facing: Math.PI, width: 3, aggro: 0, noRout: true, noAI: true, order: 'hold', formation: 'column', speed: 1.6, civ: true },
      [{ type: 'samurai', n: 1, o: { name: '使いの侍', flag: null } }, { type: 'porter', n: 2, o: { flag: null } }]);
    for (const u of F.env.units) { u.noTarget = true; u.invuln = true; u.dmg = 0; }
    applyLook(rt, NIGHT); rt.world.lookDark = true; // 月齢・当日の天気は不明。夜の共通の明るさを使う。
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '川岸の組へ進み、一手をそろえよ' : '川岸の組へ合流せよ', 'main');
    this.siegeScene(rt, '囲みは四か月に及ぶ');
    rt.say('組頭', '城へ米を通すな', 4);
    rt.marker('hide', centerOf(F.hide), '川岸の組', { group: F.hide, guideAlways: true });
    // 川上の舟へ視点を向け、最初から川面の舟と岸の組を見渡せるようにする。
    const first = F.boats[1].m.position, player = rt.player;
    player.yaw = player.u.heading = Math.atan2(first.x - player.u.pos.x, first.z - player.u.pos.z);
    this.openDay(rt);
    installTottoriCamera(rt);
  },

  // 日の間隔を省略して次の持ち場へ。城内の正確な数を示す軍議は開かない。
  openDay(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || (F.step !== 0 && F.step !== 1.5)) return;
    F.day = F.step === 0 ? 6 : 13;
    // 初夜は短い下知だけ。帰還の段では移動が済みしだい城兵を迎える。
    if (F.step === 1.5) {
      rt.banner('幾日か後の夜', '城の木戸に動きあり。柵の口へ戻れ');
      this.dayEvent(rt, '打って出た城兵');
    } // 初夜の下知は、本人が川岸の組へ着いてから出す。
  },
  // 日送りから戦場へ戻る時だけ知らせる。舟の夜の途中で何日も進めない。
  siegeScene(rt, title) {
    const F = rt.flags, st = { siege: { fatigue: 30 + F.day * 0.7, morale: 65 } }; // 囲む側の疲れの復元値。城内の残量は知らない。
    for (const g of rt.army.groups) if (g.team === 0) campWear(g, st.siege.fatigue, Math.max(35, st.siege.morale));
    rt.banner(title, '城を出た者は痩せ衰え、寄せ手にも疲れが見える');
    return st;
  },
  dayEvent(rt, kind) {
    const F = rt.flags;
    if (F.ending || rt.over) return;
    if (kind === '兵糧舟の夜' && F.step === 0) {
      rt.say('組頭', '米を城へ渡すな', 3);
      this.boats(rt);
    } else if (kind === '打って出た城兵' && F.step === 1.5) F.sortieReady = true;
  },

  // ① 兵糧舟に火をかける
  boats(rt) {
    const F = rt.flags;
    if (F.step >= 1 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.stepT = rt.t; F.ak0 = F.ak || 0; F.ek0 = F.ek || 0;
    rt.setPhase('boats');
    this.siegeScene(rt, '兵糧舟の夜');
    rt.unmark('hide');
    rt.marker('bank-road', { x: -42, z: -4 }, '岸沿いの通り道', { guideAlways: true });
    // 敵の現在地でなく、番兵と出会う岸の持ち場へ案内する。
    rt.marker('bank-fight', { x: -48, z: -16 }, '舟の番を退けよ', { guideAlways: true });
    sfx('taiko', 0.6);
    rt.obj('main', '舟の番を退け、兵糧舟二艘を焼け', 'main');
    // 夜の見通しを待たず、既存の番兵を川岸の組へ寄せる。
    F.guard.march = true; F.guard.colW = 3; F.guard.order = 'path';
    F.guard.path = [[-48, -16], [-42, -4], [-38, 10]]; F.guard.pathIdx = 0;
    F.guard.onArrive = (g) => { g.march = false; g.order = 'attack'; g.seekRange = 40; };
    // 夜の見通しの外でも、川岸の平地を通って番兵へ寄せる。
    F.hide.march = true; F.hide.colW = 3; F.hide.order = 'path';
    F.hide.path = [[-38, 10], [-42, -4], [-48, -16]]; F.hide.pathIdx = 0;
    F.hide.onArrive = (g) => { g.march = false; g.order = 'attack'; g.seekRange = 50; };
    rt.marker('guard', centerOf(F.guard), '舟の番', { red: true, group: F.guard });
    rt.after(12, () => {
      if (F.step !== 1 || F.ending || gone(F.guard2)) return;
      // 夜の見通しに頼って待たず、岸の通れる道を隊で寄せる。
      F.guard2.march = true; F.guard2.colW = 3; F.guard2.order = 'path';
      F.guard2.path = [[-56, -50], [-56, -34], [-48, -24], [-42, -4], [-38, 10]]; F.guard2.pathIdx = 0;
      F.guard2.onArrive = (g) => { g.march = false; g.formation = 'yari'; g.yariRanks = 3; g.order = 'attack'; g.seekRange = 40; };
      rt.marker('guard2', centerOf(F.guard2), '川下から来る舟の番', { red: true, group: F.guard2 });
      rt.say('足軽', '川下から舟の番が来たがや！', 3);
    });
    for (const b of F.boats) {
      b.name = b.i === 0 ? '川下の兵糧舟' : '川上の兵糧舟';
      rt.marker('b' + b.i, b, b.name, { h: 2, guideAlways: true });
      rt.addInteract('b' + b.i, { x: b.x, z: b.z }, b.name + 'に火をかける', () => this.burn(rt, b), { r: 3, hold: 2 });
    }
  },
  burn(rt, b) {
    const F = rt.flags;
    if (b.burnt || F.step !== 1 || F.ending || rt.over || !rt.player.u.alive) return;
    b.burnt = true;
    rt.uninteract('b' + b.i); rt.unmark('b' + b.i);
    rt.world.addFire(b.m.position.x, b.z, { h: b.m.position.y - rt.world.heightAt(b.m.position.x, b.z) }); rt.world.addSmokeColumn(b.m.position.x, b.m.position.y + 3, b.z, { size: 2.4 });
    F.burnt++;
    battleEvent(rt, EVENT_FIRE_START, b, null, 1, false, '毛利の兵糧舟が燃え始めた');
    const label = b.name + 'を焼いた';
    rt.award((t) => t.side.push(label), label);
    if (F.burnt >= 2) rt.obj('main', '川岸を守り、残る舟の番を退けよ', 'main');
    else rt.objProgress('main', `${F.burnt}／2艘`);
  },

  // 本人が舟を焼き、護衛を退けて次の日へ進む。
  midA(rt) {
    const F = rt.flags;
    if (F.step !== 1) return;
    F.step = 1.5; F.stepT = rt.t;
    rt.unmark('guard'); rt.unmark('guard2'); rt.unmark('bank-road'); rt.unmark('bank-fight');
    rt.obj('main', '柵の口へ戻り、城兵を止めよ', 'main');
    rt.marker('return', { x: 10, z: FENCE_Z + 8 }, '柵の口へ戻れ', { h: 3, guideAlways: true });
    F.hide.order = 'path'; F.hide.pathIdx = 0;
    F.hide.path = [[10, FENCE_Z - 8], [10, FENCE_Z + 12], [-10, FENCE_Z + 12]];
    F.hide.onArrive = (g) => { g.order = 'hold'; };
    this.openDay(rt);
    // 本人の帰還と城兵の下りを重ね、柵に着いてから行軍を待たせない。
    if (F.sortieReady) this.sortie(rt);
  },
  midB(rt) {
    const F = rt.flags;
    if (F.step !== 2) return;
    F.step = 2.5; F.stepT = rt.t;
    F.gateBar.opened = false;
    for (const leaf of F.gateDoor.userData.leaves) leaf.rotation.y = 0;
    for (let i = 1; i <= 3; i++) rt.unmark('s' + i);
    rt.award((t) => t.side.push('柵の口を守った'), '柵の口を守った');
    rt.obj('main', '柵を守り、秀吉方の使いを待て', 'main');
    rt.banner('城兵が退いた', '追わずに柵の口を守れ');
    rt.after(4, () => { if (F.step === 2.5 && !F.ending && !rt.over) this.envoy(rt); });
  },

  // ② 打って出た城兵を止める
  sortie(rt) {
    const F = rt.flags;
    if (F.step >= 2 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 2; F.stepT = rt.t; F.ak0 = F.ak || 0; F.ek0 = F.ek || 0;
    const st = this.siegeScene(rt, '城兵が打って出た');
    rt.setPhase('sortie');
    rt.unmark('guard'); rt.unmark('guard2'); rt.unmark('bank-road'); rt.unmark('bank-fight');
    for (const q of [F.guard, F.guard2]) if (q && !gone(q)) q.morale = Math.min(q.morale, 15);
    sfx('horagai', 0.6);
    rt.obj('main', HI(rt) ? '一手を率い、柵で城兵を止めよ' : '柵の口で城兵を止めよ', 'main');
    rt.say('組頭', '柵を越えさせるな。城へ退く者は追うな', 4);
    F.sallies.forEach((g, i) => {
      // 飢えは足・息・気力へ反映する。得物の威力を一律に半分にしない。
      campWear(g, 60, 50);
      rt.after(i * 18, () => {
        if (F.step !== 2 || F.ending || gone(g)) return;
        F.gateBar.opened = true; F.gateDoor.userData.open();
        g.ttOut = true; g.march = true; g.formation = 'column'; g.order = 'path'; g.pathIdx = 0;
        const road = CASTLE_ROADS[0].slice().reverse();
        g.path = [[GATE.x, GATE.z - 4], ...road.filter((p) => p[1] > GATE.z && p[1] < FENCE_Z + 10), [GATE.x, FENCE_Z + 10]];
        g.ttIngress = [[SALLY_SEATS[i].x, SALLY_SEATS[i].z], ...g.path];
        g.onArrive = (q) => { q.march = false; q.formation = 'yari'; q.width = 3; q.yariRanks = 4; q.order = 'attack'; q.seekRange = 24; };
        rt.say('足軽', i === 0 ? '木戸から城兵が出てきたがや！' : i === 1 ? 'まだ来るで！　坂に槍の列じゃ！' : 'また木戸が開いたで！　柵を抜かせるな！', 3);
        rt.marker('s' + (i + 1), centerOf(g), '打って出た城兵', { red: true, group: g });
      });
    });
    // 川岸の組は口を通って戻る。左右の柵を横切る直線の命令へ戻さない。
    F.hide.onArrive = (g) => { g.order = 'hold'; g.aggro = 12; };
    rt.after(5, () => { if (F.step === 2 && !F.ending) rt.say('組頭', '鉄砲、柵まで引きつけよ。槍組は列を保て', 4); });
    volleyAt(rt, { guns: () => [F.tgun], foes: () => F.sallies, who: '組頭', near: 20, drop: 0, max: 50, line: '放て！　槍組、持ち場を崩すな！' });
  },

  // ③ 開城の使いを供する
  envoy(rt) {
    const F = rt.flags;
    if (F.step >= 3 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 3; F.stepT = rt.t;
    rt.unmark('return');
    rt.setPhase('envoy');
    for (let i = 1; i <= 3; i++) rt.unmark('s' + i);
    rt.say('組頭', '城の者は助命じゃ。槍を引け', 4);
    // 和議の返事が届いてから停戦する。城の守りを突然消さない。
    for (const g of rt.army.groups) {
      g.order = 'hold'; g.aggro = 0; g.seekRange = 0;
      for (const u of g.units) { u.target = null; u.atk = null; u.swing = null; u.noTarget = true; u.dmg = 0; }
    }
    applyLook(rt, DAWN);
    rt.world.lookDark = false;
    rt.after(1, () => rt.world.setTime('morning'));
    // 日送りや戦功で、経家の自害と城内の助命という史実の結末を変えない。
    F.terms = '城将自害・残る城兵助命';
    this.siegeScene(rt, '夜明け　秀吉方の返答の使い');
    rt.obj('main', '使いに付き、城の木戸へ進め', 'main');
    battleEvent(rt, EVENT_MESSENGER, GATE, null, 0, true, '秀吉方の使いが城へ返答に向かう');
    const g = F.env;
    // 使いは斬り合いの対象外だが、護送の到着では本人と人足の歩みを待つ。
    g.arriveNoncombat = true;
    g.order = 'path'; g.path = [[GATE.x, FENCE_Z + 8], ...CASTLE_ROADS[0].slice(1), [GATE.x, GATE.z + 6]]; g.pathIdx = 0;
    g.onArrive = () => { F.envArrived = true; g.order = 'hold'; F.gateBar.opened = true; F.gateDoor.userData.open(); };
    F.env = g;
    rt.marker('env', centerOf(g), '使い', { group: g, guideAlways: true });
    rt.zone('gate', GATE.x, GATE.z + 6, 10);
    rt.zone('env-wait', g.anchor.x, g.anchor.z, 8);
    F.envRing = rt.rings.find((q) => q.userData.id === 'env-wait');
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 3) return;
    if (!F.defended || !F.envArrived || rt.distTo(F.env.center()) > 10 || Math.hypot(rt.player.u.pos.x - GATE.x, rt.player.u.pos.z - GATE.z - 6) > 10) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('env'); rt.unzone('gate'); rt.unzone('env-wait');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '鳥取城の囲みを守り、開城の使いを供した', pts: 20 }; }, '鳥取城、開く');
    sfx('kane', 0.5);
    rt.banner('鳥取城、開く', '城将は自害。残る城兵と民・僧は助命');
    rt.say('伝令', '経家殿は腹を召された。残る城の者は助命にござる。木戸を空けよ', 5.5);
    // 食事の後日談は結果の史実の札に残す。開城と経家の結末はここで伝える。
    rt.player.u.invuln = true;
    rt.finish({}, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && (m.group.team === 1 ? gone(m.group) : groupGone(m.group))) rt.unmark(m.id); }
    if (F.ending || rt.over || !rt.player.u.alive) return;
    const p = rt.player.u.pos;
    warnGuns(rt);
    if (F.step >= 1 && rt.t >= (F.pressureAt || 0)) pressureTick(rt, F.step, F.step === 1 ? [F.guard, F.guard2] : F.step === 2 ? F.sallies.filter((g) => g.ttOut) : [], F.step === 3 ? [F.env] : F.oda, F.step === 1 ? '岸沿いの印へ。番兵を退け、二艘の舟に火をかけよ' : F.step === 3 ? '使いの印へ戻れ。そばを歩き、木戸まで供せよ' : '柵の口の印へ。味方と城兵を止めよ');
    F.guideT = (F.guideT || 0) - dt;
    const guide = F.guideT <= 0;
    if (guide) F.guideT = 0.5;
    // 短い待機で飢えまで治さない。既存の疲れた姿・歩みへ半秒ごとに渡す。
    if (guide) for (const g of F.sallies) for (const u of g.units) if (u.alive) u.fat = Math.max(u.fat || 0, 0.7);
    // 開戦の操作後は、合流か短い下知で舟の夜へ。立ち止まっても番兵は来る。
    // 放火・柵の守り・護送の達成は、引き続き本人の働きを待つ。
    if (F.step === 0 && rt.t - F.stepT >= 2 &&
        (rt.distTo(F.hide.center()) <= 8 || rt.t - F.stepT >= 8)) this.dayEvent(rt, '兵糧舟の夜');
    if (F.step === 1) {
      if (guide) rt.objProgress('main', F.burnt < 2 ? F.burnt ? '残る舟にも火をかけよ' : '舟の番を退け、舟の印で火をかけよ'
        : '舟は燃えた。岸に残る番兵を退けよ');
      // 番兵を退けたら待たせず戻す。まだ戦える番兵がいる間は川岸を守る。
      if (F.burnt >= 2 && gone(F.guard) && gone(F.guard2)) this.midA(rt);
    }
    if (F.step === 1.5) {
      const d = Math.hypot(p.x - 10, p.z - FENCE_Z - 8);
      if (guide) rt.objProgress('main', `柵の口の印へ戻れ。あと ${Math.round(d)}歩`);
      if (F.sortieReady && d <= 16) this.sortie(rt);
    }
    if (F.step === 2) {
      const L = F.sallies;
      if (guide) {
        let returning = 0, returned = 0;
        for (const g of L) { if (gone(g) || g.ttReturned) returned++; else if (g.ttRetreat) returning++; }
        rt.objProgress('main', returned === L.length ? '城兵は退いた。柵の口へ戻れ'
          : returning ? '退く敵を追うな。柵の口を守れ' : '味方と槍をそろえ、柵の口で止めよ');
      }
      let inside = 0, nearEnemy = false;
      for (const g of L) {
        let fighting = 0;
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) {
          fighting++;
          // 守りの参加は一度、退避の案内は半秒ごと。毎コマ同じ柵の当たりを調べない。
          if ((!F.defended || guide) && g.ttOut && !g.ttRetreat && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 18 &&
              !rt.army.wallBetween(u.pos, -1, p)) { F.defended = true; if (guide) nearEnemy = true; }
          if (g.ttOut && !g.ttRetreat && u.pos.z > FENCE_Z + 22) inside++;
          // 先頭が柵へ寄せてから戦う刻を数える。行軍だけで寄せを終わらせない。
          if (g.ttOut && g.ttContactT == null && Math.hypot(u.pos.x - GATE.x, u.pos.z - FENCE_Z) < 14) g.ttContactT = rt.t;
        }
        if (F.defended && g.ttOut && !g.ttRetreat && !g.routed && fighting <= g.initial * 0.75 &&
            g.ttContactT != null && rt.t - g.ttContactT > 85) {
          g.ttRetreat = true; g.formation = 'column'; g.march = true; g.focus = null;
          g.order = 'path'; g.pathIdx = 0; g.path = g.ttIngress.slice(0, -1).reverse();
          g.onArrive = (q) => { q.ttReturned = true; q.order = 'hold'; q.march = false; q.aggro = 5; q.onArrive = null; };
        }
      }
      if (guide && nearEnemy && (p.z < FENCE_Z || rt.player.u.hp < rt.player.u.maxHp * 0.55) && !(F.outsideHintT > rt.t)) {
        F.outsideHintT = rt.t + 30;
        rt.say('組頭', p.z < FENCE_Z ? '離れすぎじゃ！　敵に背を向けず、柵の口へ退け'
          : '深手じゃ！　味方の槍の後ろへ退け', 4);
      }
      F.breachT = inside >= 4 ? (F.breachT || 0) + dt : 0;
      if (guide && F.breachT > 0) rt.objProgress('main', '柵の内の敵を押し返せ');
      if (F.breachT >= 8 && rt.canFailMission()) { this.lose(rt); return; }
      if (F.defended && Math.hypot(p.x - GATE.x, p.z - FENCE_Z) < 24 &&
          L.every((g) => gone(g) || g.ttOut && g.ttReturned)) this.midB(rt);
    }
    if (F.step === 2.5 && rt.t - F.stepT >= 6) this.envoy(rt);
    if (F.step === 3 && F.env) {
      const c = F.env.center();
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 14 && F.env.order === 'path') { F.env.order = 'hold'; F.env.anchor = { x: c.x, z: c.z }; }
      else if (!F.envArrived && d < 8 && F.env.order === 'hold') F.env.order = 'path';
      if (F.envRing) {
        F.envRing.visible = !F.envArrived && F.env.order === 'hold';
        if (F.envRing.visible) rt.drapeRing(F.envRing, c.x, c.z);
      }
      if (guide) {
        const a = F.env.arrivalStatus;
        const arrival = a && a.arrived < a.needed ? '。供の者も着くまで守れ' : '';
        rt.objProgress('main', F.envArrived ? '使いは着いた。木戸へ進め'
          : F.env.order === 'hold' ? '使いの輪へ戻れ'
            : `使いのそばを歩け。木戸まで ${Math.round(Math.hypot(c.x - GATE.x, c.z - GATE.z - 6))}歩${arrival}`);
      }
      if (F.envArrived && d <= 10) this.win(rt);
    }
  },

  lose(rt) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end'); rt.objFail('main'); rt.tracker.main = false;
    rt.unmark('return'); rt.unzone('env-wait'); rt.unzone('gate');
    rt.unmark('guard'); rt.unmark('guard2'); rt.unmark('bank-road'); rt.unmark('bank-fight'); rt.unmark('env');
    for (let i = 1; i <= 3; i++) rt.unmark('s' + i);
    for (const b of F.boats) { rt.unmark('b' + b.i); rt.uninteract('b' + b.i); }
    rt.objProgress('main', '');
    rt.banner('持ち場を破られた', '城兵が柵の内へ入り、組は後ろの陣へ退く');
    rt.player.u.invuln = true;
    rt.finish({}, 8);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.isStruct || v.group?.civ || v.type === 'porter') return;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g.civ || rt.t - (rt.flags.routSaidT ?? -99) < 30) return;
    rt.flags.routSaidT = rt.t;
    const c = g.center();
    if (Math.hypot(c.x - rt.player.u.pos.x, c.z - rt.player.u.pos.z) < 35) rt.say('足軽', '敵が引くで！　槍を揃えとけ！', 2.5);
  },
};

// 両軍の総勢（羽柴勢 二万余り、鳥取城の兵 千四百ほどと城に逃げ込んだ人々。数には諸説ある）
tottori.force = () => ({ a: 20000, a0: 20000, b: 1400, b0: 1400 });
tottori.sides = { a: { name: '羽柴軍', mon: 'oda' }, b: { name: '吉川軍', mon: 'mori' } };
// 名将を無名の前線隊へ自動追加しない。経家と秀吉は各本陣に一人ずつ。
tottori.date = (rt) => rt.flags.step >= 3 ? '天正九年十月二十五日　冬・開城' : '天正九年十月　冬・夜';
tottori.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
tottori.skip = (rt) => {
  if (rt.phase !== 'brief' || rt.over || rt.flags.ending) return;
  rt.flags.day = 6;
  tottori.boats(rt);
};
tottori.history = '天正九年（1581）、中国攻めを進める羽柴秀吉は、因幡の鳥取城を囲んだ。秀吉は城のまわりに付城と柵を築き、陸と海の兵糧の道を断った（鳥取の渇え殺し）。毛利方は船で兵糧を運び込もうとしたが、秀吉方に阻まれた。城を守る吉川経家は四か月ほど耐えたが、城の中は飢えに苦しみ、十月二十五日、経家ら城将の自害と引き換えに、残る城兵や籠城した人々の助命が認められ、城は開かれた。城から出た者の多くが、与えられた食べ物を急に食べて命を落としたとも伝わる。兵の数には諸説ある。 戦う城兵は千四百ほど、避難した人々は別に数える。川岸の放火、城兵の出撃と使いの護送、各備えの人数と細かな位置、夜明けの時刻と天気は史料で確定できず、包囲の持ち場を表す復元。北の丸山城・雁金山城と長い囲みの全域、山と川の距離は縮めている。';

// 素直な遊び手：舟の番と戦い、舟に火をかけ、打って出た城兵を止め、使いのそばを歩く
tottori.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 一歩で止まらず、下知の条件である川岸の組との合流まで歩く。
  if (F.step === 0) {
    inp.guardHold = false;
    const c = F.hide.center();
    goTo(p, inp, c.x, c.z, 6);
    if (!F.playerReady) inp.k.add('KeyW');
    return;
  }
  // 深手の退避と手当ては共通の頭に任せる。自然回復を待って任務を止めない。
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  // 手元へ届いた敵には先に応戦する。柵越しの槍と、構えを解く間の同じ相手を保つ。
  // 山道の控えや帰路の隊へは、遠くから追いかけない。
  let attacker = null, attackDist = 10, attackTime = Infinity;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.woundOut || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 遠い控えの柵を毎コマ調べない。受ける相手は十歩以内だけ。
    if (d >= 10 || b.army.wallBetween(u.pos, -1, o.pos, (o.wpnKind || o.lookWeapon) === 'spear')) continue;
    // 近い敵の振りかぶりより、既に振り出した槍を先に受ける。
    const hitTime = o.swing && !o.swing.done ? 0 : o.charging ? d / Math.max(1, o.speed) : o.atk?.t ?? Infinity;
    if (d < 10 && (hitTime < attackTime || (hitTime === attackTime && d < attackDist))) {
      attacker = o; attackDist = d; attackTime = hitTime;
    }
  }
  const close = strikeTarget(b, reach);
  // 正面だけ受けられるので、別の敵への反撃より実際の打ち手へ向き直る。
  const e = attacker || (close && !close.woundOut &&
    (F.step !== 2 || (close.group?.ttOut && !close.group.ttRetreat)) &&
    (!close.group?.ttRetreat || close.target === u) ? close : null) ||
    b.army.nearestEnemy(u, 12, (o) => !o.fleeing && !o.woundOut && !o.noTarget && !o.invuln &&
    (F.step !== 2 || (o.group?.ttOut && !o.group.ttRetreat && o.pos.z >= FENCE_Z)) && o.pos.z > FENCE_Z - 30 &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
  if (e && F.step < 3) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > reach * 0.85 || (F.step === 2 && u.pos.z < FENCE_Z + 2)) {
      // 柵の守りでは城兵へ突進せず、味方の列がある口の内側までに留める。
      // 歩く向きと受ける向きを分け、戻る間も実際の打ち手へ構える。
      goTo(p, inp, F.step === 2 ? Math.max(GATE.x - 4, Math.min(GATE.x + 4, e.pos.x)) : e.pos.x,
        F.step === 2 ? Math.max(FENCE_Z + 4, e.pos.z) : e.pos.z, F.step === 2 ? 1 : reach * 0.85);
      if (F.step === 2) {
        const walkYaw = p.yaw;
        p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
        if (inp.k.has('KeyW')) {
          const da = walkYaw - p.yaw;
          inp.k.delete('KeyW');
          if (Math.abs(Math.cos(da)) > 0.3) inp.k.add(Math.cos(da) > 0 ? 'KeyW' : 'KeyS');
          if (Math.abs(Math.sin(da)) > 0.3) inp.k.add(Math.sin(da) > 0 ? 'KeyA' : 'KeyD');
        }
      }
    }
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) {
    // 隊の中心には、逃げた兵や深手の兵も含まれる。まだ戦える番兵へ寄る。
    // 番兵のいない中心で立ち止まり、放火にも進めなくなるのを防ぐ。
    let guard = null, gd = Infinity;
    for (let i = 0; i < 2; i++) {
      const g = i === 0 ? F.guard : F.guard2;
      if (gone(g)) continue;
      for (const o of g.units) {
        if (!o.alive || o.fleeing || o.woundOut || o.noTarget || o.invuln) continue;
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d < gd) { guard = o; gd = d; }
      }
    }
    if (guard) { goTo(p, inp, guard.pos.x, guard.pos.z, 2); return; }
    const it = b.interacts.find((q) => q.id.startsWith('b'));
    if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); }
    return;
  }
  if (F.step === 1.5) { goTo(p, inp, 10, FENCE_Z + 8, 3); return; }
  // 山道にいる控えの横位置を追わず、城兵が出てくる柵の口で迎える。
  if (F.step === 2) { goTo(p, inp, GATE.x, FENCE_Z + 4, 2); return; }
  if (F.step === 3 && F.env) {
    const c = F.env.center();
    if (F.envArrived) goTo(p, inp, GATE.x, GATE.z + 6, 2);
    else goTo(p, inp, c.x + 2, c.z + 3, 2.5);
  }
};

export { tottori };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
const LIFT = { x: 10, z: -150, tx: 10, tz: -110, w: 40, R: 120, rise: 110 };

const BENCH_SEGMENTS = LOCAL_PATHS.flatMap(pts => pts.slice(1).map((b, i) => {
  const a = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
  return { x: a[0], z: a[1], dx, dz, l2: dx * dx + dz * dz || 1,
    x0: Math.min(a[0], b[0]) - 4.4, x1: Math.max(a[0], b[0]) + 4.4,
    z0: Math.min(a[1], b[1]) - 4.4, z1: Math.max(a[1], b[1]) + 4.4 };
}));
function benchedHeight(x, z) {
  const h = gradedCastleHeight(x, z);
  let best = 4.4, bx = 0, bz = 0;
  for (const s of BENCH_SEGMENTS) {
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    const t = Math.max(0, Math.min(1, ((x - s.x) * s.dx + (z - s.z) * s.dz) / s.l2));
    const xx = s.x + s.dx * t, zz = s.z + s.dz * t, d = Math.hypot(x - xx, z - zz);
    if (d < best) { best = d; bx = xx; bz = zz; }
  }
  return best < 4.4 ? h + (gradedCastleHeight(bx, bz) - h) * trap(best, 4.4, 1.8) : h;
}
function height(x, z) {
  let h = roadDistance(x, z, CASTLE_ROADS) < 2.6 ? gradedCastleHeight(x, z) : benchedHeight(x, z);
  // 地形の一升は約3.5m。建物だけの小さな平場では補間した地面が床を突き抜ける。
  // 戸口・外階段の下と梯子の手前まで、一升ぶん余裕のある同じ高さの平場にする。
  for (const b of BUILDING_PADS) {
    const k = trap(Math.max(Math.abs(x - b.x) - b.hw, Math.abs(z - b.z) - b.hd), 4, 4);
    if (k) h += (b.y - h) * k;
  }
  // 柵・味方の列・戻りの印を同じ低い平場に載せる。山の木戸までは城道を登る。
  const bank = trap(Math.max(Math.abs(x - 10) - 64, Math.abs(z - 28) - 22), 12, 12);
  h += (1.8 - h) * bank;
  const rx = z < 0 ? -66 + z * 8 / 90 : -66 - z * 6 / 80;
  const shore = trap(Math.abs(Math.abs(x - rx) - 20), 7, 4);
  if (shore && z > -100 && z < 90 && roadDistance(x, z) > 4.5) {
    h += shore * (0.22 + 0.16 * Math.sin(z * 0.43) * Math.cos(x * 0.61));
  }
  return h;
}

// 曲輪の中と戸口の道から木を除く。土塁の見た目と当たりは同じ区画で作る。
function castleClear(x, z) {
  for (const k of SEATS) if (Math.abs(x - k.x) < k.w + 4 && Math.abs(z - k.z) < k.d + 4) return true;
  return roadDistance(x, z) < 4.5;
}
const BUILDING_PADS = [
  ...TOTTORI_HOUSES.map(b => ({ x: b.x, z: b.z + 2, hw: b.w / 2 + 4, hd: b.d / 2 + 6,
    y: SEATS.find(k => k.id === b.seat)?.y ?? 125 })),
  ...SEATS.map(k => ({ x: k.x + k.w - 4, z: k.z + k.d - 3, hw: 5, hd: 7, y: k.y })),
  ...TAIKO_LOOKOUTS.map(k => ({ x: k.x, z: k.z + 2, hw: 5, hd: 7, y: 125 + TAIKO.bankH })),
];
const CLIMB_GRADES = CASTLE_ROADS.map((pts, i) => {
  const lengths = [0];
  for (let j = 1; j < pts.length; j++) lengths.push(lengths[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
  return { pts, lengths, total: lengths[lengths.length - 1], low: i ? 104 : heightRaw(10, 20), high: i ? 140 : 104 };
});
function gradedCastleHeight(x, z) {
  let h = heightRaw(x, z), best = 4.4, floor = h;
  for (const r of CLIMB_GRADES) for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
    if (d < best) { best = d; floor = r.low + (r.high - r.low) * (r.lengths[i - 1] + t * (r.lengths[i] - r.lengths[i - 1])) / r.total; }
  }
  // 木戸の下にも短い平場を残し、二本の登り道を同じ高さでつなぐ。
  h += (floor - h) * trap(best, 4.4, 1.8);
  const gatePad = trap(Math.max(Math.abs(x - GATE.x) - 6, Math.abs(z - GATE.z) - 3), 2, 2);
  return h + (104 - h) * gatePad;
}
function buildTottoriCastles(rt, noT) {
  const W = rt.world, batch = makeSimpleBatch();
  // 遠い曲輪も柵・板葺き小屋を材質ごとにまとめる。実兵は追加しない。
  for (const k of SEATS) {
    const x0 = k.x - k.w, x1 = k.x + k.w, z0 = k.z - k.d, z1 = k.z + k.d;
    for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 3);
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
        // 門の柱と同じ幅だけ空け、道が斜めに横切る口も塞がない。
        if (roadDistance(mx, mz) < 5) continue;
        noT(wallLine(rt, [[ax + (bx - ax) * t0, az + (bz - az) * t0], [ax + (bx - ax) * t1, az + (bz - az) * t1]],
          { team: k.team, hp: 1e9, name: '柵', meshOpt: { batch } }));
      }
    }
    if (['sanjo', 'obi', 'east'].includes(k.id)) {
      const mouths = [];
      for (const path of [...CASTLE_ROADS, ...RIDGE_PATHS]) for (let j = 1; j < path.length; j++) {
        const a = path[j - 1], b = path[j], dx = b[0] - a[0], dz = b[1] - a[1];
        for (const [axis, edge] of [[0, x0], [0, x1], [1, z0], [1, z1]]) {
          const span = b[axis] - a[axis]; if (!span) continue;
          const t = (edge - a[axis]) / span; if (t < 0 || t > 1) continue;
          const x = a[0] + dx * t, z = a[1] + dz * t;
          if (x < x0 + 2 || x > x1 - 2) { if (axis !== 0 || z < z0 + 2 || z > z1 - 2) continue; }
          if (z < z0 || z > z1 || mouths.some(p => Math.hypot(p[0] - x, p[1] - z) < 8)) continue;
          mouths.push([x, z]); rt.scene.add(kabukimon(W, x, z, 7, Math.atan2(dx, dz), { doors: false }));
        }
      }
    }
    if (!['sanjo', 'obi', 'kido', 'east'].includes(k.id)) rt.scene.add(kabukimon(W, k.x, z1, 7, 0, { doors: false }));
    // 東の長屋の外階段へ櫓の根石を重ねない。
    const lx = x1 - 4, lz = k.id === 'east' ? z0 + 3 : z1 - 5;
    rt.scene.add(yagura(W, lx, lz));
    // 梯子の足と曲輪内の道をつなぐ（床・梯子の当たりは共通室内）。
    if (!['obi', 'kido', 'east'].includes(k.id)) hut(W, x1 - 5, z0 + 4, 5, 3, 0, { ita: true, minka: false, batch });
  }
  for (const b of TOTTORI_HOUSES) {
    const k = SEATS.find(k => k.id === b.seat);
    goten(rt, b.x, b.z, { w: b.w, d: b.d, doorX: 0, team: k?.team ?? 0, tile: false,
      naka: true, noTarget: true, kind: b.kind || 'house', profile: 'tottori', name: b.name });
  }
  // 木戸の脇は閉門の幅を残し、土塁と柵で外の縁へ結ぶ。
  for (const sd of [-1, 1]) noT(wallLine(rt, [[GATE.x + sd * 3.6, GATE.z], [GATE.x + sd * 30, GATE.z]],
    { team: 1, hp: 1e9, name: '柵', meshOpt: { batch } }));
  for (const [x, z] of [[-138, 168], [-154, 158], [-143, 147], [62, 145], [77, 154]])
    hut(W, x, z, 7, 4, 0, { batch });
  // 空の井戸の口。二基を同じ形・材質で描き、円の当たりを見た目に合わせる。
  const wells = [[-6, -157], [160, -134]], ring = new THREE.CylinderGeometry(.8, 1, .65, 10, 1, true);
  const mouths = new THREE.InstancedMesh(ring, new THREE.MeshStandardMaterial({ color: 0x655b49, roughness: 1 }), wells.length);
  const matrix = new THREE.Matrix4();
  wells.forEach(([x, z], i) => { matrix.makeTranslation(x, W.heightAt(x, z) + .33, z); mouths.setMatrixAt(i, matrix); solidCircle(x, z, 1); });
  rt.scene.add(mouths);
  // 北西の海は地形の外の遠景だけ。川・低湿地・刈田と山並みは既存の地形を使う。
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(320, 110), new THREE.MeshStandardMaterial({ color: 0x3b555c, roughness: .7 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(-160, .7, -350); sea.userData.camBlock = false; rt.scene.add(sea);
  finalizeSimpleBatch(rt, batch);
}
