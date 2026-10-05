// ======================================================================
// 織田家編　鳥取城の戦い（天正九年十月）
// 羽柴秀吉は因幡の鳥取城を囲み、まわりの米を先に買い集めてから、付城と柵で城を囲んで兵糧を断った（鳥取の渇え殺し）。
// 城を守る吉川経家は四か月耐えたが、城の中は飢えに苦しみ、十月二十五日、城兵の命と引き換えに自害して城を開いた。
// 足軽は羽柴秀吉の手。①夜、千代川の岸に着いた毛利の兵糧舟に火をかける ②兵糧を取りに打って出た城兵を止める
// ③開城の使いを城の木戸まで供する（戦は、ここで終わる）
// 川岸の小競り合いと城兵の出撃は推定復元。史実にない後詰の到着・総攻め・城兵への配膳分岐は置かない。
// 向き：北（-z）に鳥取城の山（久松山）。西（-x）を千代川が海へ流れる。東（+x）に秀吉の本陣（太閤ヶ平）。距離は局地用に縮める
// ======================================================================
import { yamaLift, benchRoads, switchback } from './yamalift.js';
import * as THREE from 'three';
import { nobori, hut, yagura, campfire, kabukimon, tobira, dorui, hyoro, umatsunagi, makeSimpleBatch, finalizeSimpleBatch, solidCircle } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { battleEvent, EVENT_FIRE_START, EVENT_MESSENGER } from './battle_events.js';
import { gauss, enemyGroup, allyGroup, centerOf, wallLine } from './bhelp.js';
import { goten, horiboriHeight } from './castle_parts.js';
import { TAIKOGAHIRA, TOTTORI_SEATS, TOTTORI_HOUSES, TOTTORI_DITCHES } from './castles/tottori.js';
import { applyLook, NIGHT, DAWN, dress, gone as groupGone } from './b_inabayama.js';
// 深手で戦えない兵だけが残っても、敵の寄せが続くとは数えない。
const gone = (g) => groupGone(g) || g.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.noTarget);
// 届かない兵を討ち取りにせず、退去させて味方が持ち場を引き継ぐ。
function withdraw(g) {
  if (!g) return;
  g.routed = true; g.onArrive = null; g.focus = null;
  for (const u of g.units) if (u.alive) { u.fleeing = true; u.target = null; u.atk = null; u.swing = null; }
}
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
const FENCE_Z = -60;                        // 秀吉方の柵（城を囲む）
const TAIKO = { x: 152, z: -142, ...TAIKOGAHIRA }; // 内陣は東西47m・南北36m。東は +x、南は +z
const TX = TAIKO.w / 2, TZ = TAIKO.d / 2, TB = TAIKO.bankW / 2;
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
      team: plan.team, armor: plan.team ? 0x34302a : 0x2b3140, flagTex: flagTexture(s.flag), mon: s.mon,
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
  ['kuridani', '栗谷側の付城', '名は伝わらない', 4000, -24, -12, Math.PI, 'oda', 'oda', 50, 24, 14],
  ['engoji', '円護寺側の付城', '名は伝わらない', 3000, -36, -186, Math.PI / 2, 'oda', 'oda', 40, 24, 14],
  ['hamasaka', '浜坂側の見張り', '名は伝わらない', 3000, -44, -218, Math.PI / 2, 'oda', 'oda', 40, 24, 14],
]);
const TOTTORI_DEFEND = sonaePlan('山上と麓の守り', 1, { x: CASTLE.x, z: CASTLE.z }, 0, [
  ['honjin', '本陣', '吉川経家', 500, CASTLE.x, CASTLE.z, 0, 'mori', 'mori'],
  ['foot', '麓の木戸と兵糧の番', '森下道誉', 500, GATE.x + 24, GATE.z - 18, 0, 'mori', 'mori'],
  ['ridge', '山上の曲輪の控え', '中村春続', 400, CASTLE.x + 12, CASTLE.z - 6, 0, 'mori', 'mori'],
]);

const TOTTORI_MARUYAMA = sonaePlan('丸山城の守り', 1, { x: -28, z: -222 }, 0, [
  ['honjin', '本陣', '奈佐日本之介', null, -28, -222, 0, 'mori', 'mori'], // 城兵数は不明。鳥取城の千四百と別に扱う。
]);

const ODA = { flag: 'oda' };
const KIKKAWA = { flag: 'mori' };
const HUNGRY = { flag: 'mori', armor: 0x4a463c, lace: 0x5a5444, cloth: 0x8a806a };   // 飢えた城兵：色の褪せた、ぼろの具足（B098）           // 吉川は毛利の一門（毛利の紋で）
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
const LOCAL_PATHS = [...CASTLE_ROADS, ...APPROACHES, ...RIDGE_PATHS, ...HOUSE_PATHS, ...LOOKOUT_PATHS, ...LINK_PATHS];
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
  }
  const roadGap = 1 - trap(roadDistance(x, z), 5, 2);
  for (const cut of DITCH_HEIGHTS) h += cut(x, z) * roadGap;
  // 千代川と東岸は山の裾から切り離す。舟が山腹を上る川にしない。
  const rx = z < 0 ? -66 + z * 8 / 90 : -66 - z * 6 / 80;
  const valley = trap(Math.abs(x - rx), 32, 12);
  h += (0.5 + z * 0.001 - h) * valley;
  if (z > -48 && z < 26 && x > -60 && x < -24) {
    const edge = Math.min(x + 60, -24 - x, z + 48, 26 - z);
    const k = Math.max(0, Math.min(1, edge / 6));
    h += (0.6 + z * 0.001 - h) * k * k * (3 - 2 * k);
  }
  for (const seat of SEATS) {
    const k = trap(Math.max(Math.abs(x - seat.x) - seat.w, Math.abs(z - seat.z) - seat.d), 3, 3);
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
function boatMesh() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
  const hullM = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 9), wood); hullM.position.y = 0.2; g.add(hullM);
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x9a8656, roughness: 1 })); t.rotation.z = Math.PI / 2; t.position.set(0, 0.7, -3 + i * 1.8); g.add(t); }
  for (const m of g.children) m.castShadow = true;
  return g;
}

const tottori = {
  jinkei: [TOTTORI_ATTACK, TOTTORI_DEFEND, TOTTORI_MARUYAMA],
  noWake: true, // 持ち場の実兵だけを使い、囲みの遠景から新しい兵を増やさない。
  noDistantBattle: true, botOrders: true,
  lordHata: { spear: 12 }, // 別の遊び方でも共通の百人の旗本を足さない。
  noTaisho: true, // 両本陣はこの戦で置く。架空の大将襲撃隊は送らない。
  spawn: { x: -30, z: 10, heading: -Math.PI / 2 },
  world: {
    seed: 15810, moveLim: 250,
    keepSpawnInside: true, // 武将の後ろの持ち場と供も含め、陣形全体を場内へ収める。
    time: 'night',
    wind: [0.7, -0.3],
    autumn: true, // 落葉の色として残す。旧暦十月は冬。
    winter: true,
    muddy: 0.35,
    terrainTags: true,   // 急斜面・細道・森で速さ・向き変え・疲れが変わる（terrain_tags.js）
    streams: [{ pts: RIVER, w: 12, depth: 1.2 }, { pts: SUIRO, w: 3.2, depth: 0.7 }],   // 袋川のほか、南西の低湿地へ分かれる水路
    paths: [[[TAIKO.x, TAIKO.z], [TAIKO.x, TAIKO.z + TZ + 18], [108, -80], [60, -30], [20, 40], [-30, 10], [-50, -18]], [[TAIKO.x, TAIKO.z], [TAIKO.x + TX + 18, TAIKO.z]], ...LOCAL_PATHS],
    height,
    // 山麓南西の低湿地：湿って暗い緑と、水路沿いの田
    tint(x, z, h, c) {
      const b = boggy(x, z);
      if (b > 0.05) c.setRGB(c.r * (1 - 0.35 * b) + 0.02, c.g * (1 - 0.18 * b) + 0.03, c.b * (1 - 0.3 * b) + 0.02);
    },
    fieldStage: 'stubble',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (boggy(x, z) < 0.12 || z < 96) return 0;
      if ((Math.floor(x / 13) + Math.floor(z / 15)) % 3 === 0) return 0;
      const ex = Math.min(((x % 13) + 13) % 13, 13 - ((x % 13) + 13) % 13), ez = Math.min(((z % 15) + 15) % 15, 15 - ((z % 15) + 15) % 15);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.8;
    },
    clear: (x, z) => castleClear(x, z) || taikoClear(x, z) || (Math.abs(x) < 100 && z > -100 && z < 90),
    trees: 480,
    tufts: 3400,
    treeDensity: (x, z) => (castleClear(x, z) || taikoClear(x, z) ? 0 : Math.abs(x) < 100 && z > -100 && z < 90 ? 0.1 : 1),
    groves: [{ x: 60, z: -20, r: 12, n: 16 }, { x: -30, z: 60, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (z < -210 || x < -120),
  },

  waitForPlayer: true, // 動く・構える・打つまで開戦を待ち、無操作で敗退させない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { starving: 'HIST_A', taikogahira: 'HIST_A', kikkawaTsunee: 'HIST_A', kaboBoats: 'HIST_B', marsh: 'HIST_B', townsfolk: 'GAME_C', sallies: 'GAME_C' };
    // 城内に逃げ込んだ民：木戸の内の曲輪に、座り込んだ者・立つ者・子ども（的にならない飾り）
    townsfolk(rt, [[4, -102, 's'], [8, -106, 's'], [14, -100, 'c'], [18, -108, 's'], [0, -112, 'c'], [12, -114, 's'], [22, -104, 'p'], [-4, -98, 's'], [6, -118, 'p'], [16, -120, 'c'], [26, -112, 's'], [-2, -122, 's']]);
    F.step = 0; F.stepT = rt.t; F.ek = 0; F.ak = 0; F.burnt = 0; F.day = 0;
    rt.banner('鳥取城の囲み', '城を攻め上がらず、川岸と柵の持ち場を守る');
    // ---- 城を囲む柵（木戸の前は開けてある） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    noT(wallLine(rt, [[-50, FENCE_Z + 4], [0, FENCE_Z]], { team: 0, hp: 1e9, name: '柵', segLen: 6 }));
    noT(wallLine(rt, [[20, FENCE_Z], [70, FENCE_Z + 6]], { team: 0, hp: 1e9, name: '柵', segLen: 6 }));
    for (const [x, z] of [[-30, FENCE_Z + 8], [40, FENCE_Z + 8]]) rt.scene.add(yagura(W, x, z));
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
      m.position.set(x + 9, y + 0.15, b.z); m.rotation.y = -0.09; rt.scene.add(m);
      // 火をかける印は船べりの岸側へ。川の曲がりで舟と印が離れない。
      return { ...b, x: m.position.x + 2.2, m, i };
    });
    // ---- 川岸と柵を受け持つ組 ----
    F.hide = allyGroup(rt, { name: '羽柴の川岸の組', fixed: true, formation: 'line', anchor: { x: -20, z: 16 }, facing: -Math.PI / 2, width: 7, aggro: 10 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], ODA));
    F.hachi = allyGroup(rt, { name: '羽柴の柵の組', fixed: true, formation: 'line', anchor: { x: 10, z: FENCE_Z + 12 }, facing: Math.PI, width: 7, aggro: 10 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 4 }], ODA));
    F.oda = [F.hide, F.hachi];
    const n = Math.min(30, RANKS[rt.G.rank || 0].squad || 0);
    if (n) rt.makeSquad({ x: -26, z: 22 }, -Math.PI / 2, [{ kind: 'spear', n }]);
    // ---- 太閤ヶ平の本陣と大軍（軽い作り） ----
    // 秀吉は東の陣城に置き、経家は山上に置く。近い組への命令は組頭・伝令が伝える。
    F.honjin = camp(rt, { x: TAIKO.x, z: TAIKO.z, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '羽柴秀吉', hat: 'kabuto_bari', haori: 0x6a4a1c }, guard: 15, reserve: 32, runTo: { x: -20, z: 20 } });
    // 太閤ヶ平は攻めの本陣だけでなく、毛利の後詰が来た時の大きな野戦にも備える堅い陣城。内郭を大きな土塁で囲む
    // 南大手・東搦手を開け、北には口を作らない。
    const west = TAIKO.x - TX - TB, east = TAIKO.x + TX + TB;
    const north = TAIKO.z - TZ - TB, south = TAIKO.z + TZ + TB, gap = TAIKO.gateW / 2;
    for (const pts of [
      [[TAIKO.x - gap, south], [west, south], [west, north], [east, north], [east, TAIKO.z - gap]],
      [[TAIKO.x + gap, south], [east, south], [east, TAIKO.z + gap]],
    ]) noT(wallLine(rt, pts, { team: 0, hp: 1e9, name: '柵', segLen: 8 }));
    rt.scene.add(kabukimon(W, TAIKO.x, south, TAIKO.gateW, 0), kabukimon(W, east, TAIKO.z, TAIKO.gateW, Math.PI / 2));
    rt.scene.add(yagura(W, TAIKO.x - TX - TB, TAIKO.z - TZ - TB), yagura(W, TAIKO.x + TX + TB, TAIKO.z + TZ + TB));
    rt.scene.add(hyoro(W, TAIKO.x - 8, TAIKO.z + 10, 0.4), umatsunagi(W, TAIKO.x + 10, TAIKO.z - 8, 0.3, 8));
    // 東西の尾根沿いの二重の遮断線。麓の木戸や川岸の退路は横切らない。
    for (const off of [-10, 10]) {
      noT(wallLine(rt, [[TAIKO.x - TX - TAIKO.bankW - 12, TAIKO.z + off], [70, CASTLE.z + off]], { team: 0, hp: 1e9, name: '竪土塁', segLen: 10 }));
      // 土塁の形は高さの関数にある。柵の下に模型を重ねて二重に盛らない。
    }
    F.ehon = camp(rt, { x: CASTLE.x, z: CASTLE.z, facing: 0, team: 1, faction: 'mori', mon: 'mori', general: { name: '吉川経家', hat: 'kabuto_m', haori: 0x3a2a2a }, guard: 15, reserve: 24, runTo: { x: GATE.x, z: GATE.z - 8 } });
    F.hidenaga = camp(rt, { x: 112, z: -82, facing: -Math.PI / 2, team: 0, faction: 'oda', mon: 'oda', general: { name: '羽柴秀長' }, guard: 15, reserve: 24, runTo: { x: 80, z: -70 } });
    F.nasa = camp(rt, { x: -28, z: -222, facing: 0, team: 1, faction: 'mori', mon: 'mori', general: { name: '奈佐日本之介' }, guard: 15, reserve: 24, runTo: { x: -30, z: -186 } });
    F.castleGuards = [['森下道誉', GATE.x + 24, GATE.z - 18], ['中村春続', CASTLE.x + 12, CASTLE.z - 6]].map(([name, x, z]) => {
      const g = enemyGroup(rt, { fixed: true, noAI: true, faction: 'saito', name: name + 'と近習', anchor: { x, z }, facing: 0, width: 3, formation: 'ring', aggro: 4 },
        dress([{ type: 'busho', n: 1, o: { name, invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 6 }], KIKKAWA));
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
    F.guard = enemyGroup(rt, { fixed: true, faction: 'saito', name: '舟の番', anchor: { x: -52, z: -20 }, facing: Math.PI / 2, width: 5, formation: 'line', aggro: 12, morale: 85, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 2 }], KIKKAWA));
    F.guard2 = enemyGroup(rt, { fixed: true, faction: 'saito', name: '川下の舟の番', anchor: { x: -54, z: -58 }, facing: Math.PI / 2, width: 4, formation: 'line', aggro: 6, morale: 85, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], KIKKAWA));
    // 城兵は初めから木戸の内に待つ。新手はこの控えが道を通って出る。
    F.sallies = [0, 1, 2].map((i) => enemyGroup(rt, { fixed: true, noAI: true, faction: 'saito', name: i ? '木戸の控え' : '木戸の城兵',
      anchor: { ...SALLY_SEATS[i] }, facing: 0, width: 3, colW: 3, formation: 'column', aggro: 5, morale: 55, fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }], HUNGRY)));
    F.tgun = allyGroup(rt, { fixed: true, name: '柵の内の鉄砲組', anchor: { x: 8, z: FENCE_Z + 17 }, facing: Math.PI, width: 9, aggro: 4, formation: 'line' },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], ODA));
    // 主殿と陣所の床・護衛の持ち場を保ち、軽い備えから兵を追加しない。
    for (const g of rt.army.groups) g.noAI = true;
    for (const c of [F.honjin, F.ehon, F.hidenaga, F.nasa]) {
      c.guard.guard = true; c.guard.guardSight = 18; c.guard.guardLeash = 7;
      if (c.general) { c.general.campProtected = true; c.general.noTarget = true; c.general.group.aggro = 0; }
    }
    // 兵の内訳と数は準備時に一度だけ固定し、途中に戦う新手を足さない。

    // 賀露の湊も塞いである（海から兵糧を入れさせない。遠景だけの軽い作り）
    rt.scene.add(yagura(W, -58, -188), nobori(W, -58, -184, 'oda', 6));

    F.env = allyGroup(rt, { name: '秀吉の使い', fixed: true, anchor: { x: 0, z: FENCE_Z + 8 }, facing: Math.PI, width: 3, aggro: 0, noRout: true, noAI: true, order: 'hold', formation: 'column', speed: 1.6, civ: true },
      [{ type: 'samurai', n: 1, o: { name: '使いの侍', flag: null } }, { type: 'porter', n: 2, o: { flag: null } }]);
    for (const u of F.env.units) { u.noTarget = true; u.invuln = true; u.dmg = 0; }
    applyLook(rt, NIGHT); rt.world.lookDark = true; // 月齢・当日の天気は不明。夜の共通の明るさを使う。
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '一手をそろえ、ここで下知を待て' : '川岸の組で、下知を待て', 'main');
    this.siegeScene(rt, '四か月に及ぶ囲みの終盤');
    rt.say('組頭', '今夜は川岸の番じゃ。城へ向かう兵糧を止めるぞ', 6);
    rt.marker('hide', centerOf(F.hide), '川岸の組', { group: F.hide });
    rt.after(4, () => this.openDay(rt));
  },

  // 日の間隔を省略して次の持ち場へ。城内の正確な数を示す軍議は開かない。
  openDay(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || (F.step !== 0 && F.step !== 1.5)) return;
    F.day = F.step === 0 ? 6 : 13;
    // 初夜の説明は開戦時に済ませた。四秒後に同じ待機の見出しを重ねない。
    if (F.step === 1.5) rt.banner('幾日か後の夜', '日を省いて次の夜へ。柵の口へ戻り、下知を待て');
    rt.after(12, () => { if (!F.ending && !rt.over) this.dayEvent(rt, F.step === 0 ? '兵糧舟の夜' : '打って出た城兵'); });
  },
  // 日送りから戦場へ戻る時だけ知らせる。舟の夜の途中で何日も進めない。
  siegeScene(rt, title) {
    const F = rt.flags, st = { siege: { fatigue: 30 + F.day * 0.7, morale: 65 } }; // 囲む側の疲れの復元値。城内の残量は知らない。
    for (const g of rt.army.groups) if (g.team === 0) campWear(g, st.siege.fatigue, Math.max(35, st.siege.morale));
    rt.banner(title, '城から逃げた者は痩せ、囲む味方にも疲れがたまる');
    return st;
  },
  dayEvent(rt, kind) {
    const F = rt.flags;
    if (F.ending || rt.over) return;
    if (kind === '兵糧舟の夜' && F.step === 0) {
      rt.say('組頭', '川岸の舟を止める。槍をそろえ、番兵を退けて火をかけよ', 5);
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
    rt.marker('bank-road', { x: -42, z: -4 }, '岸沿いの通り道', {});
    sfx('taiko', 0.6);
    rt.obj('main', '舟の番を退け、岸の兵糧舟に火をかけよ（2艘）', 'main');
    F.guard.order = 'attack'; F.guard.seekRange = 40;
    F.hide.order = 'attack'; F.hide.seekRange = 50;
    rt.marker('guard', centerOf(F.guard), '舟の番', { red: true, group: F.guard });
    rt.after(22, () => {
      if (F.step !== 1 || F.ending) return;
      F.guard2.order = 'attack'; F.guard2.seekRange = 40;
      rt.marker('guard2', centerOf(F.guard2), '川下から来る舟の番', { red: true, group: F.guard2 });
      rt.say('足軽', '川下の番兵が、岸沿いに寄せてきた！', 3);
    });
    for (const b of F.boats) {
      b.name = b.i === 0 ? '川下の兵糧舟' : '川上の兵糧舟';
      rt.marker('b' + b.i, b, b.name, { h: 2 });
      rt.addInteract('b' + b.i, { x: b.x, z: b.z }, b.name + 'に火をかける', () => this.burn(rt, b), { r: 3, hold: 2 });
    }
  },
  burn(rt, b, assisted = false) {
    const F = rt.flags;
    if (b.burnt || F.step !== 1 || F.ending || rt.over || !rt.player.u.alive) return;
    b.burnt = true;
    rt.uninteract('b' + b.i); rt.unmark('b' + b.i);
    rt.world.addFire(b.m.position.x, b.z, { h: b.m.position.y - rt.world.heightAt(b.m.position.x, b.z) }); rt.world.addSmokeColumn(b.m.position.x, b.m.position.y + 3, b.z, { size: 2.4 });
    F.burnt++;
    battleEvent(rt, EVENT_FIRE_START, b, null, 1, false, '毛利の兵糧舟が燃え始めた');
    const label = b.name + 'を焼いた';
    if (!assisted) rt.award((t) => t.side.push(label), label);
    if (F.burnt >= 2) rt.obj('main', '川岸を守り、残る舟の番を退けよ', 'main');
    else rt.objProgress('main', `${F.burnt}／2艘`);
  },

  // 舟を焼き、護衛を退けて次の日へ進む。時間切れなら味方が引き継ぐ。
  midA(rt) {
    const F = rt.flags;
    if (F.step !== 1) return;
    F.step = 1.5; F.stepT = rt.t;
    rt.unmark('guard'); rt.unmark('guard2'); rt.unmark('bank-road');
    rt.obj('main', '組を柵の前へ戻し、次の下知を待て', 'main');
    rt.marker('return', { x: 10, z: FENCE_Z + 8 }, '柵の口へ戻れ', { h: 3 });
    F.hide.order = 'move'; F.hide.dest = { x: -10, z: FENCE_Z + 12 };
    F.hide.onArrive = (g) => { g.order = 'hold'; };
    this.openDay(rt);
  },
  midB(rt) {
    const F = rt.flags;
    if (F.step !== 2) return;
    F.step = 2.5; F.stepT = rt.t;
    F.gateBar.opened = false;
    for (const leaf of F.gateDoor.userData.leaves) leaf.rotation.y = 0;
    for (let i = 1; i <= 3; i++) rt.unmark('s' + i);
    rt.award((t) => t.side.push('柵の口を守った'), '柵の口を守った');
    rt.obj('main', '柵の口を守り、次の下知を待て', 'main');
    rt.banner('城兵が退いた', '追わずに柵の口を守れ');
    rt.after(12, () => { if (!F.ending && !rt.over) this.envoy(rt); });
  },

  // ② 打って出た城兵を止める
  sortie(rt) {
    const F = rt.flags;
    if (F.step >= 2 || F.ending || rt.over || !rt.player.u.alive) return;
    rt.unmark('return');
    F.step = 2; F.stepT = rt.t; F.ak0 = F.ak || 0; F.ek0 = F.ek || 0;
    const st = this.siegeScene(rt, '城兵が打って出た');
    rt.setPhase('sortie');
    rt.unmark('return');
    rt.unmark('guard'); rt.unmark('guard2'); rt.unmark('bank-road');
    for (const q of [F.guard, F.guard2]) if (q && !gone(q)) q.morale = Math.min(q.morale, 15);
    sfx('horagai', 0.6);
    rt.obj('main', HI(rt) ? '預かった柵の一手で、打って出た城兵を止めよ' : '柵の前で、打って出た城兵を止めよ', 'main');
    rt.say('組頭', '……止めよ。四人に柵の奥を八秒渡せば陣が崩れる。内へ入れるな。だが、逃げ帰る者は追うな', 4);
    F.sallies.forEach((g, i) => {
      // 飢えは足・息・気力へ反映する。得物の威力を一律に半分にしない。
      campWear(g, 60, 50);
      rt.after(i * 18, () => {
        if (F.step !== 2 || F.ending || gone(g)) return;
        F.gateBar.opened = true; F.gateDoor.userData.open();
        g.ttOut = true; g.formation = 'column'; g.order = 'path'; g.pathIdx = 0;
        const road = CASTLE_ROADS[0].slice().reverse();
        g.path = [[GATE.x, GATE.z - 4], ...road.filter((p) => p[1] > GATE.z && p[1] < FENCE_Z + 10), [GATE.x, FENCE_Z + 10]];
        g.ttIngress = [[SALLY_SEATS[i].x, SALLY_SEATS[i].z], ...g.path];
        g.onArrive = (q) => { q.formation = 'yari'; q.width = 3; q.yariRanks = 4; q.order = 'attack'; q.seekRange = 24; };
        rt.say('足軽', i ? '木戸の奥の兵も、道を下りてきた！' : '木戸から城兵が出た！', 3);
        rt.marker('s' + (i + 1), centerOf(g), '打って出た城兵', { red: true, group: g });
      });
    });
    F.hide.order = 'move'; F.hide.dest = { x: -10, z: FENCE_Z + 10 }; F.hide.onArrive = (g) => { g.order = 'hold'; g.aggro = 12; };
    rt.after(5, () => rt.say('組頭', '柵へ引きつけて撃て。槍は撃ち終えるまで待て', 4.5));
    volleyAt(rt, { guns: () => [F.tgun], foes: () => F.sallies, who: '組頭', near: 20, drop: 0, max: 50, line: '柵の内の鉄砲がそろって火を吹いた。痩せた城兵の足が止まる' });
  },

  // ③ 開城の使いを供する
  envoy(rt) {
    const F = rt.flags;
    if (F.step >= 3 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('envoy');
    for (let i = 1; i <= 3; i++) rt.unmark('s' + i);
    rt.say('組頭', '和議の返事が整った。双方、武器を収めよ', 4);
    // 和議の返事が届いてから停戦する。城の守りを突然消さない。
    for (const g of rt.army.groups) {
      g.order = 'hold'; g.aggro = 0; g.seekRange = 0;
      for (const u of g.units) { u.target = null; u.atk = null; u.swing = null; u.noTarget = true; u.dmg = 0; }
    }
    applyLook(rt, DAWN);
    rt.world.lookDark = false;
    rt.after(1, () => rt.world.setTime('morning'));
    // 日送りや戦功で、経家の自害と城内の助命という史実の結末を変えない。
    F.terms = '城主切腹・城兵助命';
    this.siegeScene(rt, '夜明け　城から和を請う使い');
    rt.say('組頭', '城から和を請う使いが来た。返事の使いに付き、木戸の前を守れ', 6);
    rt.obj('main', '使いに付き、木戸の輪と使いの十歩以内へ進め。使いが止まったら八歩以内へ戻れ', 'main');
    battleEvent(rt, EVENT_MESSENGER, GATE, null, 0, true, '鳥取城から和を請う使いが来た');
    const g = F.env;
    // 使いは斬り合いの対象外だが、護送の到着では本人と人足の歩みを待つ。
    g.arriveNoncombat = true;
    g.order = 'path'; g.path = [[8, FENCE_Z - 2], [GATE.x, GATE.z + 6]]; g.pathIdx = 0;
    g.onArrive = () => { F.envArrived = true; g.order = 'hold'; F.gateBar.opened = true; F.gateDoor.userData.open(); };
    F.env = g;
    rt.marker('env', centerOf(g), '使い', { group: g });
    rt.zone('gate', GATE.x, GATE.z + 6, 10);
    rt.zone('env-wait', g.anchor.x, g.anchor.z, 8);
    F.envRing = rt.rings.find((q) => q.userData.id === 'env-wait');
  },

  win(rt, assisted = false) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 3) return;
    if (!assisted && (!F.envArrived || rt.distTo(F.env.center()) > 10 || Math.hypot(rt.player.u.pos.x - GATE.x, rt.player.u.pos.z - GATE.z - 6) > 10)) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('env'); rt.unzone('gate'); rt.unzone('env-wait');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: assisted ? '味方と鳥取城の開城を見届けた' : '鳥取城の囲みを守り、開城の使いを供した', pts: 20 }; }, '任務達成・鳥取城、開く');
    sfx('kane', 0.5);
    rt.banner('鳥取城、開く', '城兵と民・僧は助命された。吉川経家は自害した');
    rt.say('伝令', '城の者を助けるため、経家殿は腹を切られた。木戸の前を空けよ', 5.5);
    // 食事の後日談は結果の史実の札に残す。開城と経家の結末はここで伝える。
    rt.player.u.invuln = true;
    rt.finish({}, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.ending || rt.over || !rt.player.u.alive) return;
    const p = rt.player.u.pos;
    F.guideT = (F.guideT || 0) - dt;
    const guide = F.guideT <= 0;
    if (guide) F.guideT = 0.5;
    // 主人公の移動や全員の到着だけで、どの段も待ち続けない。
    if (F.step === 0 && rt.t - F.stepT >= 20) this.boats(rt);
    if (F.step === 1) {
      if (guide) rt.objProgress('main', F.burnt < 2 ? `燃やした舟 ${F.burnt}／2艘。舟の印で二秒長押し`
        : gone(F.guard) && gone(F.guard2) ? '舟は燃えた。川下の番兵が来ぬか、岸を見張れ' : '舟は燃えた。岸に残る番兵を退けよ');
      const elapsed = rt.t - F.stepT;
      if (elapsed >= 150) {
        for (const b of F.boats) if (!b.burnt) this.burn(rt, b, true);
        withdraw(F.guard); withdraw(F.guard2);
        rt.say('組頭', '味方が残る舟を焼き、番兵を退けた。柵の持ち場へ戻るぞ', 4);
        this.midA(rt);
        return;
      }
      // 舟だけ焼いて一息で終えず、川から上がった者を退ける刻を取る。
      if (F.burnt >= 2 && elapsed >= 22 && gone(F.guard) && gone(F.guard2)) this.midA(rt);
    }
    if (F.step === 1.5) {
      const d = Math.hypot(p.x - 10, p.z - FENCE_Z - 8);
      if (guide) rt.objProgress('main', d > 16 ? `柵の口の印へ戻れ。あと ${Math.round(d)}歩` : '組をそろえ、次の下知を待て');
      if (rt.t - F.stepT >= 35) {
        rt.say('組頭', '柵の守りは味方がそろえた。打って出る城兵を止めるぞ', 4);
        this.sortie(rt);
      } else if (F.sortieReady && d <= 16) this.sortie(rt);
    }
    if (F.step === 2) {
      const L = F.sallies;
      // 山道へ届かない隊も、帰路で止まった隊も、二分で寄せを終える。
      if (rt.t - F.stepT >= 120) {
        for (const g of L) withdraw(g);
        rt.say('組頭', '味方が城兵を押し戻した。追わず、和議の返事を待て', 4);
        this.midB(rt);
        return;
      }
      if (guide) {
        let local = 0;
        for (const u of F.hide.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) local++;
        let returning = 0, returned = 0;
        for (const g of L) { if (gone(g) || g.ttReturned) returned++; else if (g.ttRetreat) returning++; }
        rt.objProgress('main', `手元の守り ${local}人。退いた隊 ${returned}／${L.length}組。${returning ? `帰路の隊 ${returning}組。追わず見張れ` : '柵の口で城兵を止めよ'}`);
      }
      let inside = 0, nearEnemy = false;
      for (const g of L) {
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) {
          if (guide && g.ttOut && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 12) nearEnemy = true;
          if (u.pos.z > FENCE_Z + 22) inside++;
          // 先頭が柵へ寄せてから戦う刻を数える。行軍だけで寄せを終わらせない。
          if (g.ttOut && g.ttContactT == null && Math.hypot(u.pos.x - GATE.x, u.pos.z - FENCE_Z) < 14) g.ttContactT = rt.t;
        }
        if (g.ttOut && !g.ttRetreat && !g.routed && g.ttContactT != null && rt.t - g.ttContactT > 85) {
          g.ttRetreat = true; g.formation = 'column'; g.march = true; g.focus = null;
          g.order = 'path'; g.pathIdx = 0; g.path = g.ttIngress.slice(0, -1).reverse();
          g.onArrive = (q) => { q.ttReturned = true; q.order = 'hold'; q.march = false; q.aggro = 5; q.onArrive = null; };
        }
      }
      if (guide && nearEnemy && (p.z < FENCE_Z || rt.player.u.hp < rt.player.u.maxHp * 0.55) && !(F.outsideHintT > rt.t)) {
        F.outsideHintT = rt.t + 8;
        rt.say('組頭', p.z < FENCE_Z ? '柵の外は味方の槍が届かぬ。敵へ向いて構え、柵の口へ下がれ'
          : '傷が深い。「構え」を押し、打ってくる敵へ向いて味方の後ろへ下がれ', 4);
      }
      F.breachT = inside >= 4 ? (F.breachT || 0) + dt : 0;
      if (guide && F.breachT > 0) rt.objProgress('main', `柵の内に敵が入った！　押し返せ（退くまで ${Math.max(0, Math.ceil(8 - F.breachT))}秒）`);
      if (F.breachT >= 8 && rt.canFailMission()) { this.lose(rt); return; }
      if (L.every((g) => gone(g) || g.ttReturned)) this.midB(rt);
    }
    if (F.step === 2.5 && rt.t - F.stepT >= 16) this.envoy(rt);
    if (F.step === 3 && rt.t - F.stepT >= 60) {
      F.env.order = 'hold'; F.env.onArrive = null;
      F.gateBar.opened = true; F.gateDoor.userData.open();
      rt.say('組頭', '使いの供は味方が引き継いだ。開城の返事が届いたぞ', 4);
      this.win(rt, true);
      return;
    }
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
        const arrival = a && a.arrived < a.needed ? `。持ち場 ${a.arrived}／${a.needed}人` +
          (a.blocked ? '。塀や坂で足が止まっている' : a.gated ? '。狭い口で後列を待つ' : a.delayed ? '。倒れた仲間の立ち直りを待つ' : '。後列が歩いている') : '';
        rt.objProgress('main', F.envArrived ? '使いは着いた。木戸の印へ進め'
          : F.env.order === 'hold' ? '使いが待っている。輪の内へ戻れ（八歩より近く）'
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
    rt.unmark('guard'); rt.unmark('guard2'); rt.unmark('bank-road'); rt.unmark('env');
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
    if (g.team !== 1 || g.civ || rt.t - (rt.flags.routSaidT ?? -99) < 8) return;
    rt.flags.routSaidT = rt.t;
    const c = g.center();
    if (Math.hypot(c.x - rt.player.u.pos.x, c.z - rt.player.u.pos.z) < 35) rt.say('足軽', '目の前の敵が退いた', 2.5);
  },
};

// 両軍の総勢（羽柴勢 二万余り、鳥取城の兵 千四百ほどと城に逃げ込んだ人々。数には諸説ある）
tottori.force = () => ({ a: 20000, a0: 20000, b: 1400, b0: 1400 });
tottori.sides = { a: { name: '羽柴軍（開戦時の総勢・推定）', mon: 'oda' }, b: { name: '吉川軍（開戦時の総勢・推定）', mon: 'mori' } };
// 名将を無名の前線隊へ自動追加しない。経家と秀吉は各本陣に一人ずつ。
tottori.date = (rt) => rt.flags.step >= 3 ? '天正九年十月二十五日　冬・開城' : '天正九年十月　冬・夜';
tottori.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
tottori.skip = (rt) => {
  if (rt.phase !== 'brief' || rt.over || rt.flags.ending) return;
  rt.flags.day = 6;
  tottori.boats(rt);
};
tottori.history = '天正九年（1581）、中国攻めを進める羽柴秀吉は、因幡の鳥取城を囲んだ。秀吉は前もって因幡の米を高値で買い集め、城のまわりに付城と柵を築いて兵糧の道を断った（鳥取の渇え殺し）。毛利方は船で兵糧を運び込もうとしたが、秀吉方に阻まれた。城を守る吉川経家は四か月ほど耐えたが、城の中は飢えに苦しみ、十月二十五日、城兵の命を助けることと引き換えに自害して城を開いた。城から出た者の多くが、与えられた食べ物を急に食べて命を落としたとも伝わる。兵の数や人数には諸説ある。 戦う城兵は千四百ほど、避難した人々は別に数える。川岸の放火、城兵の出撃と使いの護送、各備えの人数と細かな位置、夜明けの時刻と天気は史料で確定できず、包囲の持ち場を表す復元。北の丸山城・雁金山城と長い囲みの全域、山と川の距離は縮めている。';

// 素直な遊び手：舟の番と戦い、舟に火をかけ、打って出た城兵を止め、使いのそばを歩く
tottori.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 開戦待ちでは時計も止まる。一歩動いてから、その場で下知を聞く。
  if (F.step === 0) {
    inp.guardHold = false;
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
        Math.abs(o.pos.y - u.pos.y) >= 3 ||
        b.army.wallBetween(u.pos, -1, o.pos, (o.wpnKind || o.lookWeapon) === 'spear')) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
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

let BENCHED = null;
function height(x, z) {
  if (!BENCHED) BENCHED = benchRoads(gradedCastleHeight, LOCAL_PATHS, 2.6, 1.8);
  let h = roadDistance(x, z, CASTLE_ROADS) < 2.6 ? gradedCastleHeight(x, z) : BENCHED(x, z);
  for (const b of HOUSE_FLOORS) {
    const k = trap(Math.max(Math.abs(x - b.x) - b.w / 2 - .5, Math.abs(z - b.z) - b.d / 2 - .5), .5, .5);
    if (k) h += (b.y - h) * k;
  }
  return h;
}

// 曲輪の中と戸口の道から木を除く。土塁の見た目と当たりは同じ区画で作る。
function castleClear(x, z) {
  for (const k of SEATS) if (Math.abs(x - k.x) < k.w + 4 && Math.abs(z - k.z) < k.d + 4) return true;
  return roadDistance(x, z) < 4.5;
}
const HOUSE_FLOORS = TOTTORI_HOUSES.map(b => ({ ...b, y: SEATS.find(k => k.id === b.seat)?.y ?? 125 }));
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
    const lx = x1 - 4, lz = z1 - 5;
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
