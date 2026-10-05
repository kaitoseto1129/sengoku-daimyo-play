import { rosterPlan, rosterBuild } from './jinkei_roster.js';
// ======================================================================
// 織田家編　天王寺の戦い（天正四年五月七日）
// 石山本願寺を囲む織田方の天王寺砦（明智光秀らが守る）を、本願寺勢一万五千ほどが囲んだ。
// 京にいた信長は、集まっていたわずか三千ほどを率いて駆けつけ、自ら先頭に立って囲みを破った。
// 信長は足に鉄砲の傷を負ったが、砦に入った後、再び打って出て本願寺勢を崩した。
// 自分は砦の守備隊。籠城→救援の三段と呼応→砦で合流→二段で再攻撃→城戸口へ追う。
// 信長公記巻九（三）（四）を優先。若江から東の道を来て、住吉口（南）から砦へ突入。
// 北（-z）は石山本願寺。砦から約二・五キロ。細かな縄張りと本陣位置は推定。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, hut, tawara, kabukimon, jinmaku, dou, dorui, village, sakamogi, palisade, campfire, solidCircle, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { addInterior } from './naka.js';
import { RANKS } from './state.js';
import { segHit } from './units.js';
import { sfx } from './audio.js';
import { enemyGroup, allyGroup, centerOf } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { namuTex, sagarifujiTex } from './b_nodafukushima.js';
import { battleEvent, EVENT_MESSENGER, EVENT_REINFORCEMENT, EVENT_VOLLEY, EVENT_COMMANDER_ADVANCE, EVENT_RETREAT } from './battle_events.js';
import { camp } from './b_mid.js';
import { sightPoint } from './battle_sight.js';
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { horiboriHeight } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeNawabari } from './nawabari.js';
import { TENNOJI_PLAN, T_GATE, T_HONGATE, SOTO_POLY, HON_POLY, T_HOUSES, T_ROADS } from './castles/tennoji.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
// 深手で戦えない兵だけが残った隊も、敵の抵抗が終わったと数える。
const spent = (g) => gone(g) || !g.units.some((u) => u.alive && !u.fleeing && !u.woundOut);

const FORT = { x: 0, z: -62, r: 18 };      // 天王寺砦（口は南）
const HONGAN = { x: 30, z: FORT.z - 2500 }; // 石山本願寺。約二・五キロの隔たりを保つ。方角と細かな位置は推定。
const SHITEN = { x: 52, z: 6 };             // 四天王寺（戦国期の伽藍。東大門は石山合戦で焼けた、の設定で門は置かない）
const ODA = { flag: 'oda' };
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, hat: 'hachimaki', flag: 'namu' };
const SAIKA = { armor: 0x2a2622, lace: 0x4a3a2a, hat: 'jingasa', flag: 'sagarifuji' };
const KIDO = { x: 12, z: HONGAN.z + 62 };   // 大坂の城戸口（石山の外の木戸。この戦で本願寺の中へは入らない）
const SHIMO = { x: 34, z: KIDO.z - 18 };    // 下間頼廉の本陣（総大将は城戸口の後ろ。前の斬り合いには出ない）

// 下地：上町台地（天王寺側は高台、西・北西は低地）。砦の段・空堀は castles/tennoji.js の縄張りが重ねる
function baseTerrain(x, z) {
  let h = 0.3 * Math.sin(x * 0.04 + 0.2) * Math.cos(z * 0.03) + 0.2 * Math.sin(z * 0.07 + x * 0.02);
  const cliff = 1 / (1 + Math.exp(-(x + 26) * 0.35));   // 崖線は x=-26 の辺り
  h += 7 * cliff;
  const nw = Math.max(0, Math.min(1, (-88 - z) / 60)) * Math.max(0, Math.min(1, (6 - x) / 60));
  h -= 3 * nw;   // 北西はさらに低く・湿地がち
  // 茶臼山の低い丘。勝鬘院との南北関係を示す補いで、山城の比高は加えない。
  h += 2.5 * Math.exp(-((x + 5) ** 2 + (z - 65) ** 2) / 400);
  return h;
}
const HORI_FNS = TENNOJI_PLAN.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep ?? 2, width: h.w ?? 6 }));
function baseWithHori(x, z) { let h = baseTerrain(x, z); for (const f of HORI_FNS) h += f(x, z); return h; }
let HEIGHT_FN = null;
function height(x, z) {
  if (!HEIGHT_FN) {
    const raw = heightOf(TENNOJI_PLAN, baseWithHori, 3);
    const pads = T_HOUSES.map((h) => ({ ...h, y: baseTerrain(FORT.x, FORT.z) + (h.kind === 'goten' ? 1.9 : 1.1) }));
    // 曲輪の縁の切岸を虎口だけ緩い坂へ替える。堀の掘り残しと口の幅の内に収める。
    const ramps = [[0, -30, 0, -46, 2.5], [-4, -63, -4, -71, 1.9]].map(([ax, az, bx, bz, w]) => ({
      ax, az, bx, bz, w, dx: bx - ax, dz: bz - az, l2: (bx - ax) ** 2 + (bz - az) ** 2,
      ya: raw(ax, az), yb: raw(bx, bz),
    }));
    HEIGHT_FN = (px, pz) => {
      let y = raw(px, pz);
      for (const r of ramps) {
        const t = ((px - r.ax) * r.dx + (pz - r.az) * r.dz) / r.l2;
        if (t < 0 || t > 1) continue;
        const d = Math.hypot(px - r.ax - r.dx * t, pz - r.az - r.dz * t);
        if (d >= r.w + .5) continue;
        const k = Math.min(1, (r.w + .5 - d) / .5);
        y += (r.ya + (r.yb - r.ya) * t - y) * k;
      }
      // 床下と入口を同じ平場へならす。土塁や主郭の切岸が小屋の隅へ食い込まない。
      for (const p of pads) {
        const d = Math.max(Math.abs(px - p.x) - p.w / 2, Math.abs(pz - p.z) - p.d / 2);
        if (d >= 1) continue;
        const k = Math.min(1, (1 - d) / .75);
        y += (p.y - y) * k;
      }
      return y;
    };
  }
  return HEIGHT_FN(x, z);
}

// 板葺きの仮設小屋。外壁と戸口の寸法を共通室内（0_naibu）へ渡す。
// 室内の近接時の処理が、購入済みの城の板床・和の部屋の部品を使う。
function fortHouses(rt) {
  const wood = [], roofs = [], rooms = [], H = 2.65, floor = .24, doorW = 1.5;
  const box = (bag, x, y, z, w, h, d, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z); bag.push(g);
  };
  for (const h of T_HOUSES) {
    const { x, z, w, d } = h, y = rt.world.heightAt(x, z);
    box(wood, x, y + H / 2, z - d / 2, w, H, .12);
    for (const side of [-1, 1]) {
      box(wood, x + side * w / 2, y + H / 2, z, .12, H, d);
      const span = (w - doorW) / 2;
      box(wood, x + side * (doorW / 2 + span / 2), y + H / 2, z + d / 2, span, H, .12);
      for (const zz of [-d / 2, d / 2]) box(wood, x + side * w / 2, y + H / 2, z + zz, .2, H + .1, .2);
    }
    const top = floor + 2;
    box(wood, x, y + (top + H) / 2, z + d / 2, doorW, H - top, .12);
    // 緩い切妻の板屋根と板の妻壁。瓦・天守の部品は使わない。
    const half = w / 2 + .55, rise = half * .42, angle = Math.atan2(rise, half);
    for (const side of [-1, 1]) box(roofs, x + side * half / 2, y + H + rise / 2, z,
      Math.hypot(half, rise), .1, d + 1.1, -side * angle);
    for (const zz of [-d / 2, d / 2]) {
      const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, w / 2 * .42)]);
      const g = new THREE.ShapeGeometry(shape);
      if (zz < 0) g.rotateY(Math.PI);
      g.translate(x, y + H, z + zz); wood.push(g);
    }
    rooms.push(addInterior(rt.world, { ...h, levels: [{ y: y + floor, w: w - .12, d: d - .12, h: H - floor }],
      hasExterior: true, team: 0, wins: () => [], door: { side: 1, lx: 0, w: doorW, h: 2 },
      approach: { pad: .35, len: 1.1 }, oku: h.kind === 'goten' ? .35 : 0 }));
  }
  // 水を確保する板囲いの井戸も推定。道から離して見た目の半径だけ当たりを付ける。
  const wx = 9, wz = -62, wy = rt.world.heightAt(wx, wz);
  for (const side of [-1, 1]) {
    box(wood, wx + side * .65, wy + .4, wz, .12, .8, 1.4);
    box(wood, wx, wy + .4, wz + side * .65, 1.4, .8, .12);
  }
  solidCircle(wx, wz, 1);
  for (const [bag, color] of [[wood, 0x6b5239], [roofs, 0x766c5a]]) {
    const pieces = bag.map((g) => g.index ? g.toNonIndexed() : g);
    const geometry = mergeGeometries(pieces, false);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    mesh.receiveShadow = true; rt.scene.add(mesh);
    for (const g of pieces) if (!bag.includes(g)) g.dispose();
    for (const g of bag) g.dispose();
  }
  return rooms;
}

function inPoly(P, x, z) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// 門と道は二列で通り、到着後に槍をそろえる。兵を移し替えない。
function march(g, points, order = 'hold', facing = Math.PI) {
  if (gone(g)) return;
  // 打って出る隊を、守りの持ち場に縛らない。
  if (order === 'attack') g.guard = false;
  g.formation = 'column'; g.colW = 2;
  g.order = 'path'; g.path = points; g.pathIdx = 0; g.dest = null;
  g.onArrive = (q) => { if (order === 'attack') { q.guard = false; q.stay = false; q.seekRange = Math.max(q.seekRange || 0, 45); } q.guard = order === 'hold'; q.order = order; q.formation = 'yari'; q.yariRanks = 3; q.facing = facing; };
}

// 苦しい戦：生き延びた事そのものを手柄にする（残った体力と、生き残った組の者の割合で）
function survival(rt, label) {
  const u = rt.player.u, sq = rt.squad || [];
  const hpK = Math.max(0, u.hp / u.maxHp), sqK = sq.length ? sq.filter((x) => x.alive).length / sq.length : 1;
  const pts = Math.round(10 + hpK * 10 + sqK * 15);
  rt.award((t) => t.side.push(`${label}（組 ${sq.filter((x) => x.alive).length}/${sq.length}）`), `${label}・生き延びた手柄 +${pts}`);
  rt.award((t) => { t.special = { label, pts: Math.max(t.special ? t.special.pts : 0, pts) }; }, label);
}

// 準備時に全段の兵を置き、計244人（自分・最大30人の組を含む。別枠の供は最大5人）。
// 櫓の見張りと遠景の実兵化は足さず、大軍・旗・煙は共通の仕組みで描く。
// 信長公記巻九（三）（四）の三段の救援。総勢三千対一万五千、各備の割り振りは補完。
// 信長は先手に交じるため、三段目に本人を重ねて置かない。本願寺の個々の囲みの将は不明。
const JIN = [
  rosterPlan('三段の救援', 0, { x: 126, z: 36 }, -Math.PI / 2, [
    ['first', '一段目', '佐久間信盛・松永久秀・細川藤孝・若江衆', 1200, 72, 26, 'oda', 'oda', 160, { w: 14, d: 8, bind: 'saku' }],
    ['second', '二段目', '滝川一益・蜂屋頼隆・羽柴秀吉・丹羽長秀・稲葉良通・氏家直通・伊賀伊賀守', 1200, 98, 32, 'takigawa', 'takigawa', 160, { w: 14, d: 8, bind: 'taki' }],
    ['third', '三段目の馬廻', '織田信長の馬廻', 600, 126, 36, 'eiraku', 'oda', 80, { bind: 'honjin.guard' }],
    ['nobunaga', '先手の足軽に交じる大将', '織田信長', 0, 80, 20, 'oda', 'oda', 0, { bind: 'nobu' }],
    ['fort', '天王寺付城の主郭・外曲輪', '明智光秀・佐久間信栄', 1000, FORT.x, FORT.z, 'akechi', 'akechi', 0, { bind: 'ake' }],
  ], '信長公記巻九・御後巻再三御合戦之事。砦の人数は不明、救援の三千とは別'),
  rosterPlan('砦を囲む備え', 1, SHIMO, 0, [
    ['rairen', '本陣の控え', '下間頼廉', 2000, SHIMO.x, SHIMO.z, 'sagarifuji', 'sagarifuji', 260, { bind: 'ehon.guard' }],
    ['west', '砦の西の囲み', '下間頼廉の配下（名は不明）', 2500, -60, -70, 'namu', 'sagarifuji', 260, { w: 14, d: 26, facing: Math.PI / 2 }],
    ['east', '砦の東の囲み', '下間頼廉の配下（名は不明）', 2500, 60, -70, 'sagarifuji', 'sagarifuji', 260, { w: 14, d: 26, facing: -Math.PI / 2 }],
    ['north', '砦の北の囲み', '下間頼廉の配下（名は不明）', 2500, 0, -120, 'namu', 'sagarifuji', 320, { w: 26, d: 12 }],
    ['saika', '西の鉄砲の備え', '雑賀の将（名は不明）', 2000, -84, -22, 'namu', 'sagarifuji', 200, { w: 16, d: 10, kind: 'gun', facing: 0.9 }],
    ['rear', '城戸口の前の後備え', '下間頼廉の配下（名は不明）', 2000, -6, KIDO.z + 10, 'namu', 'sagarifuji', 460, { w: 32, d: 14 }],
    ['flank', '東の脇備え', '下間頼廉の配下（名は不明）', 1500, 84, -40, 'namu', 'sagarifuji', 220, { w: 16, d: 18, facing: -1.1 }],
  ], '信長公記巻九、野戦・城の参照表の天王寺。囲みの細かな配置は補完'),
];
const tennoji = {
  phaseBanners: true,
  jinkei: JIN,
  noWake: true,
  noTaishoRaid: true,
  holdLine: true, // 城戸口で勝っても、共通の追撃で木戸の内へ踏み込まない。
  noDistantBattle: true,
  spawn: { x: 6, z: -52, heading: Math.PI },   // 要件：原田の敗北のあと、砦の中で籠城する側から始める（信長は外から来る）
  lordSpawn: { x: 80, z: 20, heading: -Math.PI / 2 },
  world: {
    seed: 15764,
    groundHalf: 260,
    fieldNorth: HONGAN.z - 180, // 北だけ延ばす。砦の格子・兵数・草木の数は増やさない。
    climbTan: 0.70,
    moveLim: -HONGAN.z + 170, // 城戸口と、その後ろへ退く敵まで届く。
    time: 'day',
    muddy: 0.3,
    paths: [[[150, 36], [98, 32], [72, 26], [0, 12], [0, T_GATE.z]], [[0, -54], [0, T_GATE.z], [0, -28], [44, -28], [44, -112], [KIDO.x, KIDO.z + 26]], ...T_ROADS],
    height,
    moveWay: fortMoveWay,
    runnerWay: fortRunnerWay,
    clear: (x, z) => Math.abs(x) < 70 && z > -100 && z < 150,
    fieldStage: 'seedling',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (x > -40 || z < -80 || z > 170) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.7;
    },
    trees: 260,
    tufts: 4200,
    treeDensity: (x, z) => (Math.abs(x) < 80 ? 0.1 : 0.6),
    groves: [{ x: -40, z: 20, r: 10, n: 12 }, { x: 44, z: -10, r: 10, n: 12 }],
    fleeOut: (x, z, team) => team === 1 && (z < HONGAN.z - 120 || Math.abs(x) > 210),
  },

  waitForPlayer: true, // 動く・構える・打つまで開戦を待ち、無操作で敗退させない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.rescued = true;
    namuTex(); sagarifujiTex();
    // ---- 天王寺砦：原田直政が築いた付城（castles/tennoji.js の縄張り）。外曲輪と主郭の二段、土塁の上の木柵、空堀、物見櫓 ----
    flReset();
    const C = F.C = buildCastlePlan(rt, TENNOJI_PLAN, { baseHeight: baseTerrain, edgeW: 3, buildTowers: true, perch: false, towerTeam: 0, team: 0, life: false });
    C.height = height;
    // 柵は味方の物（castle_plan は城方＝敵の塀として建てる）。壊れない・的にしない
    for (const s of C.walls) if (s && s.seg) { s.team = 0; s.hp = s.maxHp = 1e9; s.noTarget = true; s.wall = true; }
    // 柵の下の土塁（外へ盛る。一つの形にまとめて描く）
    const db = makeSimpleBatch();
    for (const [poly, gate, gap] of [[SOTO_POLY, T_GATE, 6], [HON_POLY, T_HONGATE, 4.5]]) {
      const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length, cz = poly.reduce((a, p) => a + p[1], 0) / poly.length;
      for (let i = 0; i < poly.length; i++) {
        const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, nl = Math.hypot(mx - cx, mz - cz) || 1;
        const parts = az === gate.z && bz === gate.z
          ? (ax < bx ? [[ax, az, gate.x - gap / 2, bz], [gate.x + gap / 2, az, bx, bz]]
            : [[ax, az, gate.x + gap / 2, bz], [gate.x - gap / 2, az, bx, bz]])
          : [[ax, az, bx, bz]];
        for (const seg of parts) {
          // 地形側に既に高さ1.3の土塁がある。表面の土だけを足して二重に盛らない。
          const d = dorui(W, seg, (mx - cx) / nl, (mz - cz) / nl, { batch: db, w: 2.6, h: 0.25 });
          if (!d.isBatchedPart) rt.scene.add(d);
        }
      }
    }
    finalizeSimpleBatch(rt, db);
    // 門（冠木門）：外曲輪の南の口と、主郭の口
    rt.scene.add(kabukimon(W, T_GATE.x, T_GATE.z, 6.4, 0), kabukimon(W, T_HONGATE.x, T_HONGATE.z, 4.8, 0));
    // 外曲輪：兵舎（長屋）・兵糧の俵・焚き火。主郭：明智の本陣（陣幕）と陣屋
    F.houses = fortHouses(rt);
    rt.scene.add(tawara(W, -10, -63, 0.4, 6), tawara(W, 10, -73, -0.3, 5), campfire(W, -7, -58), campfire(W, 8, -56));
    rt.scene.add(jinmaku(W, 7, -70, 5, 2, 3));
    // 旗：門の左右・主郭・櫓の脇（織田と明智の幟）
    for (const [x, z, k, h] of [[-5, -40, 'oda', 6], [5, -40, 'akechi', 6], [-10, -71, 'akechi', 6], [8, -71, 'oda', 6], [-19, -51, 'oda', 5], [19, -80, 'akechi', 5], [0, -88, 'oda', 6]]) rt.scene.add(nobori(W, x, z, k, h));
    // 空堀の外の逆茂木（門の前は空ける）
    for (const [x, z, r, l] of [[-33, -58, Math.PI / 2, 8], [-33, -74, Math.PI / 2, 8], [33, -60, Math.PI / 2, 8], [33, -76, Math.PI / 2, 8], [-14, -101, 0, 9], [14, -101, 0, 9], [-22, -33, 0.5, 7], [22, -33, -0.5, 7]]) rt.scene.add(sakamogi(W, x, z, r, l));
    // 縄張りの今の様子（nawabari.js）：曲輪の表を小地図・軍議に渡す。守りは織田（team 0）
    F.K = makeNawabari(rt, C, { team: 0, friendTeam: 0, enemyTeam: 1 });
    rt.nawabari = F.K;
    // 大坂の城戸口（石山の外の木戸）：柵の線と冠木門だけ（この戦で本願寺の中へは入らない）
    const kidoBatch = makeSimpleBatch();
    for (const sg of [[KIDO.x - 40, KIDO.z - 4, KIDO.x - 4, KIDO.z], [KIDO.x + 4, KIDO.z, KIDO.x + 36, KIDO.z - 6]]) {
      const len = Math.hypot(sg[2] - sg[0], sg[3] - sg[1]);
      const nx = -(sg[3] - sg[1]) / len, nz = (sg[2] - sg[0]) / len;
      rt.scene.add(palisade(W, sg, { solid: true }));
      dorui(W, sg, nx, nz, { batch: kidoBatch, w: 2.6, h: .7 });
    }
    finalizeSimpleBatch(rt, kidoBatch);
    rt.scene.add(kabukimon(W, KIDO.x, KIDO.z, 6.4, 0));
    // ---- 四天王寺（戦国期の伽藍。周りを含む広い区域の目印。東大門は石山合戦で焼けた設定で門は置かない） ----
    rt.scene.add(dou(W, SHITEN.x, SHITEN.z, 9, 6.5, Math.PI, { h: 3.6 }), hut(W, SHITEN.x + 16, SHITEN.z - 4, 7, 5, Math.PI, { wall: 0x7a5a3c }));
    rt.scene.add(nobori(W, SHITEN.x - 10, SHITEN.z + 8, 'oda', 5));
    // 勝鬘院（愛染堂）：四天王寺の北西の小さな堂（周りの伽藍の目印）
    // 砦は勝鬘院と茶臼山の間。距離・堂の細部は推定、北の目印を南へ逆転させない。
    rt.scene.add(dou(W, 26, -118, 6, 5, Math.PI, { h: 3 }));
    // ---- 西の低地の集落 ----
    rt.scene.add(village(W, -72, 48, { n: 6, r: 16, seed: 1576 }));
    // 砦に籠もる明智・佐久間信栄の手
    F.ake = allyGroup(rt, { fixed: true, fullStrength: true, formation: 'yari', guard: true, guardLeash: 6, name: '明智光秀の手', anchor: { x: 0, z: -54 }, facing: 0, width: 12, aggro: 10, noRout: false },
      dress([{ type: 'busho', n: 1, o: { name: '明智光秀', invuln: true } }, { type: 'samurai', n: 1, o: { name: '佐久間信栄', invuln: true, hat: 'hachimaki', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 6 }], ODA));
    // ---- 救援の三段。東の若江道から住吉口へ。信長本人は先手の足軽に交じる ----
    F.nobu = allyGroup(rt, { fixed: true, fullStrength: true, formation: 'yari', guard: true, guardLeash: 6, name: '先手に交じる信長の手', anchor: { x: 80, z: 20 }, order: 'hold', facing: -Math.PI / 2, width: 14, aggro: 12, noRout: false },
      dress([{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 2 }], ODA));
    F.nobuU = F.nobu.units[0];
    F.saku = allyGroup(rt, { fixed: true, fullStrength: true, formation: 'yari', guard: true, guardLeash: 6, name: '一段目・佐久間と若江衆', anchor: { x: 72, z: 26 }, order: 'hold', facing: -Math.PI / 2, width: 12, aggro: 10, noRout: false },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'samurai', n: 1, o: { name: '松永久秀', invuln: true } }, { type: 'samurai', n: 1, o: { name: '細川藤孝', invuln: true } }, { type: 'ashigaru', n: 8 }], ODA));
    F.taki = allyGroup(rt, { fixed: true, fullStrength: true, formation: 'yari', guard: true, guardLeash: 6, name: '二段目・滝川らの手', anchor: { x: 98, z: 32 }, order: 'hold', facing: -Math.PI / 2, width: 12, aggro: 10, noRout: false },
      dress([{ type: 'samurai', n: 1, o: { name: '滝川一益', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a2a3a } }, { type: 'samurai', n: 1, o: { name: '羽柴秀吉', invuln: true } }, { type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true } }, { type: 'samurai', n: 1, o: { name: '蜂屋頼隆', invuln: true } }, { type: 'samurai', n: 1, o: { name: '稲葉良通', invuln: true } }, { type: 'samurai', n: 1, o: { name: '氏家直通', invuln: true } }, { type: 'samurai', n: 1, o: { name: '伊賀伊賀守', invuln: true } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }], ODA));
    F.oda = [F.nobu, F.saku, F.taki, F.ake];
    // 将も実際の傷で退く。味方だけの威力・守りの上乗せはしない。
    for (const g of F.oda) {
      g.defMult = 1; g.dmgMult = 1; g.yariRanks = 3;
      for (const u of g.units) if (u.invuln) u.allyOk = true;
    }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 9, z: -50 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 砦を囲む本願寺勢 ----
    F.ringA = enemyGroup(rt, { fixed: true, formation: 'yari', guard: true, guardLeash: 6, faction: 'saito', name: '囲みの門徒', anchor: { x: -8, z: 10 }, facing: 0, order: 'hold', aggro: 16, width: 18, morale: 90, fleeDir: { x: -0.3, z: -1 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 1, o: { name: '門徒の侍大将', hat: 'kabuto_m' } }, { type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 15 }], IKKO));
    F.gunA = enemyGroup(rt, { fixed: true, formation: 'yari', guard: true, guardLeash: 6, faction: 'saito', name: '雑賀の鉄砲', anchor: { x: 20, z: -6 }, facing: Math.PI, order: 'hold', aggro: 40, width: 14, morale: 90, fleeDir: { x: 0.3, z: -1 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 1, o: { name: '雑賀の鉄砲頭' } }, { type: 'gun', n: 6 }], SAIKA));
    // ---- 大軍（軽い作り）：砦を囲む本願寺勢、遠くの石山本願寺 ----
    // 備の表の実名は保ち、軽い兵に同名の大将を重ねて描かない。
    const hosts = rosterBuild(rt, JIN.map((plan) => ({ ...plan, sonae: plan.sonae.map((s) => ({ ...s, general: '配下（名は不明）' })) })));
    F.hostE = Object.values(hosts[1]);
    rt.scene.add(dou(W, HONGAN.x, HONGAN.z, 16, 10, 0.3, { h: 4.2 }), hut(W, HONGAN.x - 26, HONGAN.z + 12, 10, 7, 0.3, { h: 3.8, wall: 0x7a5a3c, roof: 0x3a3430 }));   // 本願寺の御影堂（瓦の大屋根）と庫裏
    for (const [x, z] of [[HONGAN.x - 10, HONGAN.z + 22], [HONGAN.x + 12, HONGAN.z + 20]]) rt.scene.add(nobori(W, x, z, 'sagarifuji', 7));
    rt.scene.add(tawara(W, 16, 140, 0.3, 5));
    // 東の救援三段目。信長本人は先手へ出る。
    F.honjin = camp(rt, { x: 126, z: 36, facing: -Math.PI / 2, team: 0, faction: 'oda', mon: 'oda', guard: 15, reserve: 0, runTo: { x: 72, z: 26 } });
    F.honjin.guard.name = '三段目・信長の馬廻';
    F.honjin.guard.guard = true; F.honjin.guard.guardLeash = 6;
    march(F.honjin.guard, [[126, 36]], 'hold', -Math.PI / 2);
    // 本願寺勢の総大将・下間頼廉の本陣：城戸口の後ろ（前の斬り合いには出ない。顕如は石山の内にいて戦場へは出ない）
    F.ehon = camp(rt, { x: SHIMO.x, z: SHIMO.z, facing: 0, team: 1, faction: 'saito', mon: 'sagarifuji', armor: 0x3a342c, general: { name: '下間頼廉', hat: 'kabuto_m', haori: 0x4a4236 }, guard: 15, reserve: 0, runTo: { x: KIDO.x, z: KIDO.z + 30 } });
    F.ehon.guard.name = '下間頼廉の旗本';
    F.ehon.general.keepInvuln = true;
    F.ehon.general.noTarget = true;
    F.ehon.general.group.guard = true; F.ehon.general.group.guardLeash = 2;
    F.ehon.guard.guard = true; F.ehon.guard.guardLeash = 6;
    this.prepare(rt);
    // 軽い三段を、既存の本物の隊へ結ぶ。読む位置は使い回し、新しい兵を足さない。
    F.hostLinks = [];
    for (const [id, q] of [['first', F.saku], ['second', F.taki], ['third', F.honjin.guard]]) {
      const light = hosts[0][id];
      if (!light) continue;
      const at = { get x() { return q.anchor.x; }, get z() { return q.anchor.z; }, get facing() { return q.facing; } };
      light.follow(() => spent(q) ? null : at, { gap: 0 });
      F.hostLinks.push({ light, q });
    }

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', rt.G.lord ? '先手と南の住吉口へ進む下知を待て' : HI(rt) ? '組を率い、明智勢と砦に籠もれ' : '明智勢と砦に籠もり、救援を待て', 'main');
    this.prologue(rt);
  },

  prepare(rt) {
    const F = rt.flags;
    F.fgun = allyGroup(rt, { fixed: true, fullStrength: true, formation: 'line', guard: true, guardLeash: 3, name: '砦の鉄砲組', anchor: { x: FORT.x, z: FORT.z - 2 }, facing: 0, width: 14, aggro: 4, noRout: false },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 6 }], ODA));
    F.ringB = enemyGroup(rt, { fixed: true, formation: 'yari', guard: true, guardLeash: 6, faction: 'saito', name: '囲みの新手', anchor: { x: -40, z: -6 }, facing: Math.PI / 2, order: 'hold', seekRange: 70, aggro: 16, width: 12, morale: 90, fleeDir: { x: -1, z: -0.5 }, dmgMult: 1 },
        dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 8 }], IKKO));
    F.siegeW = [];
    for (const [x, z, name, facing, gun] of [[-36, -62, '西の門徒', Math.PI / 2, false], [36, -62, '東の雑賀衆', -Math.PI / 2, true], [0, -102, '北の門徒', 0, false]]) {
      const g = enemyGroup(rt, { fixed: true, formation: 'yari', guard: true, guardLeash: 3, faction: 'saito', name, anchor: { x, z }, facing, order: 'hold', aggro: 22, width: 12, morale: 95, fleeDir: { x: 0, z: -1 } },
        dress(gun ? [{ type: 'samurai', n: 1 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 5 }] : [{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 8 }], gun ? SAIKA : IKKO));
      F.siegeW.push(g);
    }
    F.last = [];
    const mk = (x, z, name, list) => {
      const g = enemyGroup(rt, { fixed: true, formation: 'yari', guard: true, guardLeash: 6, faction: 'saito', name, anchor: { x, z }, facing: 0, order: 'hold', seekRange: 90, aggro: 10, width: 16, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 1 }, list);
      F.last.push(g);
      return g;
    };
    // 本隊と雑賀の鉄砲衆は一度に構える。本隊の後ろには門徒の大軍（軽い作り）
    mk(-20, -126, '本願寺勢の本隊', dress([{ type: 'samurai', n: 1, o: { name: '本隊の侍大将', hat: 'kabuto_m' } }, { type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 11 }, { type: 'gun', n: 2, o: { flag: 'sagarifuji' } }], IKKO));
    mk(24, -130, '雑賀の鉄砲衆', dress([{ type: 'samurai', n: 2 }, { type: 'gun', n: 6 }, { type: 'ashigaru', n: 4 }], SAIKA));
    F.newHand = mk(-76, -120, '本願寺の後備え', dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 8 }], IKKO));
    F.kidoG = [];
    const add = (x, z, name, list) => {
      const g = enemyGroup(rt, { fixed: true, formation: 'yari', guard: true, guardLeash: 6, faction: 'saito', name, anchor: { x, z }, facing: 0, order: 'hold', aggro: 20, seekRange: 30, width: 14, morale: 80, fleeDir: { x: 0, z: -1 }, dmgMult: 1 }, list);
      F.kidoG.push(g);
      return g;
    };
    add(KIDO.x - 6, KIDO.z + 14, '城戸口の殿の門徒', dress([{ type: 'samurai', n: 1, o: { name: '殿の侍大将', hat: 'kabuto_m' } }, { type: 'ashigaru', n: 8 }], IKKO));
    add(KIDO.x + 22, KIDO.z + 6, '木戸の雑賀の鉄砲', dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 4 }], SAIKA));
    F.fighters = [...F.oda, F.fgun, F.honjin.guard];
    F.defenders = [F.ake, F.fgun];
    F.relief = [F.nobu, F.saku, F.taki, F.honjin.guard];
    F.foes = [F.ringA, F.gunA, F.ringB, ...F.siegeW, ...F.last, ...F.kidoG];
    F.pressure = 0; F.secured = 0;
  },

  // 五月三日の敗報を短く伝え、五月七日の籠城へ。敗戦の再演や人の筋は入れない。
  prologue(rt) {
    rt.banner('天王寺砦の囲み', rt.G.lord ? '木津攻めは敗れた。先手に交じり、砦を救え' : '木津攻めは敗れた。砦を守り、救援を待て');
    rt.after(2, () => {
      battleEvent(rt, EVENT_MESSENGER, FORT, null, 0, false, '使番が木津の敗戦を伝える');
      rt.say('織田の使番', '四日前、木津攻めは敗れ、原田様は討死なされた。明智勢が砦を守っておる！', 5);
    });
    rt.after(7, () => { if (rt.phase === 'brief') rt.say('組頭', rt.G.lord ? '先手は住吉口へ進む構えです。列をお待ちくだされ' : '殿は若江へ来られた。南の門を守れ。救援の旗を待つのじゃ', 5); });
    rt.after(12, () => this.siege(rt));
  },

  // ① 囲みを突き破る
  breakIn(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 3 || F.breakDone) return;
    F.breakDone = true; F.breakGroups = [F.ringA, F.gunA, F.ringB, ...F.siegeW];
    F.step = 1; F.stepT = rt.t; F.secured = 0;
    rt.unmark('hon'); rt.unmark('defend');
    rt.setPhase('break');
    rt.unmark('nobu');
    for (let i = 0; i < 3; i++) rt.unmark('s' + i);
    for (const q of F.siegeW) if (!gone(q) && q.anchor.z > -90) {
      const x = q.anchor.x < 0 ? -40 : 40;
      march(q, [[x, q.anchor.z], [x, -25]], 'attack', Math.PI);
      q.seekRange = 32;
    }
    sfx('horagai', 1); rt.after(0.6, () => sfx('taiko', 1));
    rt.banner('救援の三段', '東から来た三千が、南の住吉口へ回る');
    battleEvent(rt, EVENT_REINFORCEMENT, F.nobuU.pos, F.nobu, 0, true, '信長の三千が囲みへ進む');
    rt.obj('main', HI(rt) ? '組を率い、救援に合わせて門前の敵を払え' : '明智勢に続き、南の門前の敵を払え', 'main');
    for (const [g, delay, x] of [[F.saku, 0, -8], [F.nobu, 0, 4], [F.taki, 8, 16], [F.honjin.guard, 16, 8]]) {
      rt.after(delay, () => {
        if (F.step !== 1) return;
        // 名のある隊は決めた下知を守る。住吉口で止めず、南の門前まで列を進める。
        march(g, [[x, 12], [x, -18], [T_GATE.x, T_GATE.z + 9]], 'attack');
        g.seekRange = 65;
      });
    }
    march(F.ake, [[0, T_GATE.z - 6], [0, T_GATE.z + 9]], 'attack', 0);
    rt.marker('join', T_GATE, '南の門前で囲みを破る', { h: 3 });
    F.ringA.order = 'attack'; F.ringA.onArrive = null; F.ringA.formation = 'yari'; F.ringA.seekRange = 40;
    F.gunA.facing = Math.PI / 2;
    // 挟み撃ち：外から信長勢が来たのを見て、砦の内の明智勢も柵の内から打って出る（台詞だけでなく実際に両側から当たる）
    F.ake.seekRange = 50; F.ake.aggro = 16;
    // 挟み撃ち：札（かかれ）が消えてから、砦の内の明智が打って出る声
    rt.after(4.5, () => { if (F.step === 1) rt.say('明智光秀', '殿の旗じゃ！　門を開けよ、中からも突いて出る！', 3); });
    rt.marker('ra', centerOf(F.ringA), '門前の敵の旗', { red: true, group: F.ringA });
    rt.marker('ga', centerOf(F.gunA), '鉄砲衆の旗', { red: true, group: F.gunA });
    rt.after(25, () => { if (F.step === 1 && !F.ending) battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.nobuU.pos, F.nobu, 0, true, '信長が先手に交じり、旗を進める'); });
    rt.after(30, () => {
      if (F.step !== 1) return;
      F.ringB.order = 'attack'; F.ringB.seekRange = 70;
      rt.army.play('eshout', { x: -40, z: -6 }, 1.5);
      rt.marker('rb', centerOf(F.ringB), '西の敵の旗', { red: true, group: F.ringB });
    });
  },

  // ② 砦へ入る
  inFort(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    if (!rt.G.lord && !F.nobuWounded) {
      F.nobuWounded = true; F.nobuU.hp = Math.min(F.nobuU.hp, F.nobuU.maxHp * 0.75);
      F.nobuU.speed *= 0.85; F.nobuU.run *= 0.85;
    }
    rt.setPhase('fort');
    for (const id of ['ra', 'ga', 'rb', 'join']) rt.unmark(id);
    if (Math.hypot(rt.player.u.pos.x - T_GATE.x, rt.player.u.pos.z - T_GATE.z) < 28) rt.award((t) => t.side.push('救援と門前の囲みを突き破った'), '救援と門前の囲みを突き破った');
    else if (inPoly(SOTO_POLY, rt.player.u.pos.x, rt.player.u.pos.z)) rt.award((t) => t.side.push('砦を守り、救援の開いた道を保った'), '砦を守り、救援を迎えた');
    rt.banner('囲みを破った', '天王寺砦の門へ');
    rt.obj('main', '天王寺砦の門へ入れ', 'main');
    const G = { x: 0, z: -52 };
    rt.marker('gate', G, '天王寺砦', { h: 3 });
    rt.zone('gate', G.x, G.z, 10);
    for (const [g, x, z] of [[F.saku, -6, -51], [F.ake, 6, -51], [F.nobu, -6, -58], [F.taki, 6, -58], [F.honjin.guard, 0, -62]]) {
      march(g, [[0, T_GATE.z + 7], [0, T_GATE.z - 6], [x, z]], 'hold', 0);
    }
    F.gz = G;
  },

  // 前段の籠城。救援が来る前に三方の寄せを受ける。
  siege(rt) {
    const F = rt.flags;
    if (F.step !== 0 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 2.5; F.stepT = rt.t;
    rt.setPhase('siege');
    rt.unmark('gate'); rt.unzone('gate'); rt.unmark('nobu');
    sfx('kane', 0.8);
    rt.banner('囲まれた', '本願寺勢が三方から砦へ押し寄せる');
    rt.say('組頭', '南の門を守れ。柵の内で槍をそろえよ！', 4);
    rt.after(8, () => { if (F.step === 2.5) rt.say('佐久間信栄', '敵の鉄砲を避けよ。味方の旗が来るまで、門を渡すな', 4); });
    rt.obj('main', rt.G.lord ? '先手の列を保ち、砦への攻めに備えよ' : '南の門を守り、救援を待て', 'main');
    march(F.ringA, [[-8, -20], [0, -29]], 'attack');
    F.ringA.seekRange = 32;
    F.ake.order = 'hold'; F.ake.aggro = 12;
    for (const g of F.siegeW) g.aggro = 28;
    if (rt.G.lord) rt.after(8, () => { if (F.step === 2.5) this.breakIn(rt); });
    else rt.marker('defend', { x: T_GATE.x, z: T_GATE.z - 3 }, '南の門を守る', { h: 3 });

  },
  // 合流して二段に立て直す。救援後にもう一度籠城を繰り返さない。
  regroup(rt) {
    const F = rt.flags;
    if (F.step !== 2) return;
    F.step = 2.75; F.stepT = rt.t;
    rt.setPhase('regroup'); rt.unmark('gate'); rt.unzone('gate');
    survival(rt, '天王寺砦を守り、救援と合流した');
    rt.banner('砦で合流', '三段の救援と守備隊を、二段に組み直す');
    rt.obj('main', '南の門の内で組をそろえ、次の下知を待て', 'main');
    rt.marker('join', F.gz, '二段に立て直す', { h: 3 });
    rt.zone('gate', F.gz.x, F.gz.z, 10);
    // 入城した兵を同じ地点へ重ねず、門内の二段で待つ。
    for (const g of F.fighters) if (!gone(g)) { g.order = 'hold'; g.onArrive = null; g.formation = 'yari'; g.yariRanks = 3; }
    rt.say('佐久間信盛', '敵はまだ退かぬ。砦の兵と一つになり、二段に立て直すぞ', 4);
    rt.after(6, () => { if (F.step === 2.75) rt.say('使番', rt.G.lord ? '砦の兵と一つになりました。二段で再び攻めまする' : '殿は足に鉄砲傷を負われたが、なお攻めるとの下知じゃ。先の段に続け！', 5); });
  },

  // ③ 再び打って出る
  sortie(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    F.saku.name = '再攻撃の一段目'; F.taki.name = '再攻撃の二段目';
    rt.setPhase('sortie');
    rt.unmark('gate'); rt.unzone('gate');
    rt.unmark('join');
    sfx('horagai', 1);
    rt.banner('二段で打って出る', '先の段が本隊を押し、後の段が続く');
    rt.obj('main', HI(rt) ? '組を率い、南の門から出て北の本隊を崩せ' : '南の門から出て、北の本願寺勢の本隊を崩せ', 'main');
    for (const q of F.oda) { q.seekRange = 40; }
    if (rt.player.u.group) rt.player.u.group.defMult = 1;
    for (const x of rt.squad || []) if (x.group) x.group.defMult = 1;
    for (const [q, x, delay] of [[F.saku, 42, 0], [F.ake, 50, 0], [F.nobu, 42, 12], [F.taki, 50, 12], [F.honjin.guard, 46, 20]]) {
      rt.after(delay, () => {
        if (F.step !== 3) return;
        // 門では二列に絞る。南へ出てから堀の外へ回り、北へ向かう。
        // 門前から本隊へ直進すると、砦の斜めの柵を横切ってしまう。
        march(q, [[T_GATE.x, -52], [T_GATE.x, -30], [Math.sign(x) * 38, -30], [x, -110], [x, -104]], 'attack');
        q.seekRange = 40;
        q.onArrive = (a) => { a.order = 'attack'; a.formation = 'yari'; a.yariRanks = 3; a.seekRange = 90; a.facing = Math.PI; };
      });
    }
    rt.after(16, () => { if (F.step === 3 && !F.ending) battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.nobuU.pos, F.nobu, 0, true, '二段目も旗を進め、本願寺勢を押す'); });
    for (let i = 0; i < 2; i++) { F.last[i].guard = false; F.last[i].order = 'attack'; F.last[i].seekRange = 55; }
    // 後備えも二段の攻めへ寄せる。西の遠い持ち場に残して待たせない。
    rt.after(20, () => {
      if (F.ending || F.step !== 3 || gone(F.newHand)) return;
      march(F.newHand, [[-48, -112], [24, -112]], 'attack', 0);
      F.newHand.seekRange = 60;
      rt.say('足軽', '西から敵の後備えが来る！　先の段と受け止めよ', 3);
    });
  },

  // ④ 押し戻す：崩れた本願寺勢を大坂の城戸口まで追う。城戸口の後ろには下間頼廉の本陣、木戸の脇には雑賀の鉄砲が残る
  chase(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t; F.secured = 0;
    rt.setPhase('chase');
    for (let i = 0; i < F.last.length; i++) rt.unmark('sortieEnemy' + i);
    for (let i = 1; i <= 3; i++) rt.unmark('l' + i);
    battleEvent(rt, EVENT_RETREAT, KIDO, null, 1, true, '本願寺勢の旗が北の城戸口へ退く');
    rt.award((t) => t.side.push('本願寺勢の本隊を崩した'), '本願寺勢の本隊を崩した');
    sfx('horagai', 0.9);
    rt.banner('本願寺勢、崩れる', '石山の城戸口へ退いていく');
    rt.say('足軽', '崩れた！　門徒が石山の方へ逃げていく！', 3);
    rt.after(3.5, () => { if (!F.ending) rt.say('織田信長', '城戸口まで押し戻せ。それより先は深追いするな', 3.5); });
    rt.obj('main', HI(rt) ? '組を率い、退く本願寺勢を城戸口まで押し戻せ' : '退く本願寺勢を、大坂の城戸口まで押し戻せ', 'main');
    for (const [q, x] of [[F.nobu, 0], [F.saku, -12], [F.taki, 12], [F.ake, 6], [F.honjin.guard, -6]]) {
      march(q, [[42, -112], [KIDO.x + x, KIDO.z + 26]], 'hold'); q.aggro = 24;
    }
    // 退く群れを一つの地点へ重ねない。木戸の両脇と後ろへ退く。
    const host = F.jinRoster[1];
    for (const [id, x, dz] of [['rairen', 34, -48], ['west', -76, -22], ['east', 76, -22], ['north', 0, -32], ['saika', -100, -7], ['rear', -6, -48], ['flank', 110, -32]]) {
      const g = host[id];
      if (!g) continue;
      const at = g.binding.pos, z = KIDO.z + dz;
      // 長い追撃でも兵を早送りしない。近い控えは従来どおりゆっくり退く。
      g.moveTo(x, z, Math.max(45, Math.hypot(x - at.x, z - at.z) / 4), { back: true });
    }
    march(F.ehon.guard, [[SHIMO.x, KIDO.z - 39]], 'hold', 0);
    march(F.ehon.general.group, [[SHIMO.x, KIDO.z - 47]], 'hold', 0);
    // 残りの手：城戸口を守る殿の門徒と、木戸の脇の雑賀の鉄砲。後ろに総大将の本陣（旗本が厚い）
    for (const g of F.kidoG) g.aggro = 30;
    F.kz = { x: KIDO.x, z: KIDO.z + 16 };
    rt.marker('kido', F.kz, '大坂の城戸口', { h: 3 });
    rt.zone('kido', F.kz.x, F.kz.z, 10);
    
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end'); rt.objProgress('main', '');
    for (let i = 1; i <= 3; i++) { rt.unmark('l' + i); rt.unmark('k' + i); }
    rt.unmark('kido'); rt.unzone('kido');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '天王寺砦の囲みを破り、本願寺勢を城戸口まで押し戻した', pts: 20 }; }, '任務達成・本願寺勢を押し戻した');
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('城戸口まで押し戻した', '追い討ちはここまで。本願寺との戦いは続く');
    rt.say('組頭', '止まれ！　ここまでとの下知じゃ。列をそろえて引き上げるぞ', 4);
    rt.finish({}, 12);
  },

  fail(rt, reason) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.tracker.main = false;
    rt.setPhase('end'); rt.objFail('main'); rt.objProgress('main', '');
    for (const id of ['gate', 'hon', 'defend', 'nobu', 'kido', 'join', 'ra', 'ga', 'rb', 's0', 's1', 's2']) { rt.unmark(id); rt.unzone(id); }
    for (let i = 1; i <= 3; i++) { rt.unmark('l' + i); rt.unmark('k' + i); }
    rt.banner('列を保てなかった', reason || (F.pressure >= 8 ? '敵を砦の内から八秒押し返せなかった' : F.step === 1 && F.nobuU.woundOut ? '信長が深手で戦えなくなった。味方と退け' : '味方の守りか攻めの列が崩れた。南へ退け'));
    rt.say('組頭', 'これ以上は押せぬ。味方の旗へ引け！', 4);
    rt.finish({}, 8);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (let i = rt.markers.length - 1; i >= 0; i--) {
      const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id);
    }
    if (F.K) F.K.tick(dt);
    for (const link of F.hostLinks) {
      // 狭い曲輪へ軽い大軍を押し込まない。列を失った局地の隊も遠景で戦い続けない。
      link.light.visible = !spent(link.q) && !inPoly(SOTO_POLY, link.q.anchor.x, link.q.anchor.z);
    }
    if (F.ending) return;
    if (!rt.player.u.alive || rt.over) return;
    if (F.step === 1 && rt.t >= (F.gunEventAt || 0)) {
      const gun = F.gunA.units.find((u) => u.alive && !u.fleeing && u.fireT > 0);
      if (gun) { F.gunEventAt = rt.t + 8; battleEvent(rt, EVENT_VOLLEY, gun.pos, F.gunA, 1, true, '雑賀の鉄砲が救援の列を撃つ'); }
    }
    if (F.step === 3) for (let i = 0; i < F.last.length; i++) {
      const q = F.last[i];
      if (!gone(q) && !q.sortieMarked && sightPoint(rt, q.anchor)) { q.sortieMarked = true; rt.marker('sortieEnemy' + i, () => q.center(), '北の本隊の旗', { red: true, group: q }); }
    }
    F.scanT = (F.scanT || 0) - dt;
    if (F.scanT > 0) return;
    const span = 0.5 - F.scanT; F.scanT = 0.5;
    if (F.step >= 1 && rt.player.u.hp < rt.player.u.maxHp * 0.5 && !F.fieldHurtHint) {
      F.fieldHurtHint = true;
      const hit = rt.player.lastHit;
      rt.say('組頭', hit && hit.ranged && rt.t - hit.t < 6
        ? '矢玉じゃ！　味方の後ろへ退け。敵が離れたら傷を縛れ'
        : '傷が深い！　敵へ向いて構え、味方の列へ下がれ。敵が離れたら傷を縛れ', 5);
    }
    const p = rt.player.u.pos, elapsed = rt.t - F.stepT;
    let allies = 0, invaders = 0, defenders = 0;
    for (const g of F.fighters) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) allies++;
    for (const g of F.foes) for (const u of g.units) {
      if (u.alive && !u.fleeing && !u.woundOut && inPoly(SOTO_POLY, u.pos.x, u.pos.z)) invaders++;
    }
    for (const g of F.defenders) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) defenders++;
    F.pressure = (F.step === 0 || F.step === 2.5) && invaders >= 4 ? F.pressure + span : 0;
    if (F.pressure > 0 && rt.t >= (F.invasionHintAt || 0)) {
      F.invasionHintAt = rt.t + 8;
      rt.say('組頭', '敵が門の内へ入った！　南の門へ戻れ。「構え」で受け、敵の隙に突け', 4);
    }
    if (allies >= 6 && allies < 12 && !F.lineWarned) {
      F.lineWarned = true;
      rt.say('組頭', '味方の列が危うい！　合流には十二人要る。組を旗のそばへ戻せ', 4);
    }
    if (F.pressure >= 8) return this.fail(rt, '砦へ入った敵を八秒押し返せなかった');
    if (allies < 6) return this.fail(rt, '戦える味方が六人を切った。南へ退け');
    if ((F.step === 0 || F.step === 2.5) && defenders < 4) return this.fail(rt, '砦を守る兵が四人を切った');
    if (F.ake.routed && F.fgun.routed) return this.fail(rt, '砦の槍と鉄砲の列が崩れた');
    if (F.step >= 1 && (F.nobuU.woundOut || F.nobu.routed)) return this.fail(rt, '信長の手が戦えなくなった。味方と退け');
    if (F.step === 1 && F.nobu.routed && F.saku.routed) return this.fail(rt, '救援の先手と後の列が崩れた');
    if (F.step >= 3 && F.saku.routed && F.taki.routed) return this.fail(rt, '打って出た二隊が崩れた');
    if (F.step === 2.5) {
      rt.objProgress('main', F.pressure > 0 ? `！砦の内へ敵が入った。あと${Math.max(0, Math.ceil(8 - F.pressure))}秒で守りが崩れる` : rt.G.lord ? '先手の列を保ち、攻めの下知を待て' : '南の門を守れ。囲みの敵を止め、救援の旗を待て');
      if (elapsed >= 90 || (elapsed >= 45 && spent(F.ringA) && invaders === 0)) this.breakIn(rt);
    } else if (F.step === 1) {
      let threat = 0, seenThreat = null;
      for (const g of F.breakGroups) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - T_GATE.x, u.pos.z - T_GATE.z) < 24) { threat++; if (!seenThreat && sightPoint(rt, u.pos)) seenThreat = u; }
      }
      let reliefNear = 0, available = 0;
      for (const g of F.relief) if (!gone(g)) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) { available++; if (Math.hypot(u.pos.x - T_GATE.x, u.pos.z - T_GATE.z) < 28) reliefNear++; }
      const need = Math.min(6, Math.ceil(available / 2));
      const c = F.nobuU.pos;
      F.secured = need > 0 && reliefNear >= need && threat === 0 && Math.hypot(c.x - T_GATE.x, c.z - T_GATE.z) < 60 ? F.secured + span : 0;
      rt.objProgress('main', seenThreat ? `門の${seenThreat.pos.x < T_GATE.x ? '西' : '東'}側に敵が見える。救援と払え` : F.secured > 0 ? `門前を守る あと${Math.max(0, Math.ceil(8 - F.secured))}秒` : `門前へ救援を集めよ（${reliefNear}／${need}人）。列を守れ`);
      if (F.secured >= 8) this.inFort(rt);
    } else if (F.step === 2 || F.step === 2.75) {
      const d = Math.hypot(p.x - F.gz.x, p.z - F.gz.z);
      let inside = 0, available = 0;
      for (const g of F.fighters) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) available++;
      if (available < 12) return this.fail(rt, '入城して列を組む十二人が残っていない。味方と退け');
      for (const g of F.fighters) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut && inPoly(SOTO_POLY, u.pos.x, u.pos.z)) inside++;
      }
      let reliefReady = true, waitingName = null;
      for (const g of F.relief) if (!spent(g)) {
        let n = 0;
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && inPoly(SOTO_POLY, u.pos.x, u.pos.z)) n++;
        let ready = 0;
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) ready++;
        if (g.order !== 'hold' || n < Math.ceil(ready / 2)) { reliefReady = false; waitingName ||= g.name; }
      }
      const joined = reliefReady && inPoly(SOTO_POLY, F.nobuU.pos.x, F.nobuU.pos.z) && inside >= 12 && d < 10;
      rt.objProgress('main', d >= 10 ? '南の門の内の印へ進め' : !reliefReady || !inPoly(SOTO_POLY, F.nobuU.pos.x, F.nobuU.pos.z) ? waitingName ? `${waitingName}はまだ門外。門の内で列を守れ` : '信長の旗を門の内で待て' : inside < 12 ? `門の内へ味方を集めよ（${inside}／12人）` : `救援と合流した。次の下知まで あと${Math.max(0, Math.ceil(12 - elapsed))}秒`);
      if (joined && F.step === 2 && elapsed >= 12) this.regroup(rt);
      else if (joined && F.step === 2.75 && elapsed >= 12) this.sortie(rt);
    } else if (F.step === 3) {
      let broken = true;
      for (const q of F.last) if (!spent(q)) broken = false;
      let seen = null;
      for (const q of F.last) if (!spent(q) && sightPoint(rt, q.anchor)) { seen = q; break; }
      rt.objProgress('main', seen ? `${seen.name}を味方と崩せ。旗へ進め` : '先の段に続け。北と西の敵を押し返せ');
      if (broken) this.chase(rt);
    } else if (F.step === 4) {
      let threat = 0, near = 0;
      for (const g of F.foes) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - F.kz.x, u.pos.z - F.kz.z) < 18) threat++;
      }
      for (const g of F.fighters) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - F.kz.x, u.pos.z - F.kz.z) < 30) near++;
      }
      const d = Math.hypot(p.x - F.kz.x, p.z - F.kz.z);
      const headNear = Math.hypot(F.nobuU.pos.x - F.kz.x, F.nobuU.pos.z - F.kz.z) < 40;
      F.secured = d < 10 && threat === 0 && near >= 6 && headNear ? F.secured + span : 0;
      rt.objProgress('main', d >= 10 ? '城戸口の印まで進め。木戸の内へ入るな' : threat > 0 ? '城戸口に残る敵を払え' : near < 6 || !headNear ? '城戸口で味方の列を待て' : `城戸口を守る あと${Math.max(0, Math.ceil(8 - F.secured))}秒`);
      if (F.secured >= 8) this.win(rt);
    }
    if (F.step >= 1 && F.step < 3) this.cover(rt);
  },

  // 柵そのものが射線を遮る。曲輪全体の防御上げや傷の回復はしない。
  cover(rt) {
    const F = rt.flags, u = rt.player.u;
    if (!u.alive) return;
    const inHon = inPoly(HON_POLY, u.pos.x, u.pos.z);
    const g = u.group; let sq = null;
    for (const x of rt.squad || []) if (x.alive) { sq = x; break; }
    const k = 1; // 傷は射線・柵・鎧で決める。曲輪全体を防具にしない。
    if (g) g.defMult = k;
    if (sq && sq.group && sq.group !== g) sq.group.defMult = k;
    if (F.step === 2.5 && u.hp < u.maxHp * 0.5 && !inHon && !F.honHint) {
      F.honHint = true;
      rt.say('組頭', '傷が深いぞ！　主郭の柵の内へ退け。無理に戦うな', 3.2);
      rt.marker('hon', { x: -2, z: -76 }, '主郭（息を継ぐ）', { h: 2 });
      rt.after(25, () => rt.unmark('hon'));
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    const F = rt.flags;
    if (rt.t - (F.routSaidT ?? -99) < 8 || g.teRoutSaid || !sightPoint(rt, g.anchor)) return;
    g.teRoutSaid = true; F.routSaidT = rt.t;
    rt.say('足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が崩れた！`, 2.5);
  },
};

// 救援三千と、人数不明の守備隊を仮に千とした配置の目安。局地の死者から全軍の残数を逆算しない。
tennoji.force = (rt) => {
  return { a: 4000, a0: 4000, b: 15000, b0: 15000 };
};
tennoji.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '本願寺勢', mon: 'sagarifuji' } };
// 将の進退はこの戦で扱う。共通の総大将採用による信長の体力三倍化を受けない。
// 頼廉の討死を勝ちの形にしない。城戸口で追い討ちを止める。
tennoji.taisho = { a: { name: '織田信長', def: true }, b: { name: '下間頼廉', def: true } };
tennoji.date = () => '天正四年五月七日　初夏';
tennoji.canSkip = (rt) => (rt.over && rt.flags.ending && rt.tracker.main === true ? '戦後の札へ進む' : rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
tennoji.skip = (rt) => { if (rt.over && rt.flags.ending && rt.tracker.main === true) rt.endT = 0; else if (rt.phase === 'brief') tennoji.siege(rt); };
tennoji.history = '『信長公記』巻九による。五月三日、木津砦を攻めた三好康長・根来衆・和泉衆と原田直政らは、楼の岸から出た本願寺勢の鉄砲に敗れ、直政は討死した。天王寺砦は明智光秀・佐久間信栄らが守った。信長は五月五日に若江へ入り、七日、約三千を三段に備えて約一万五千の敵へ住吉口から攻めかかった。信長自身も先手の足軽に交じり、足に鉄砲傷を負いながら砦へ入った。守備隊と合流し、なお退かない敵へ二段に立て直して再攻撃。大坂の城戸口まで追い、二千七百余を討ったと記す。兵数には諸説あり、砦の位置は月江寺付近ともいう。本願寺までの約二〜三キロを、配置では約二・五キロの隔たりとして保つ。方角と道の細かな位置は推定。細かな縄張り・籠城の秒数は推定で、一斉射は局地の鉄砲戦を表す。空模様は同条に記載がない。砦の守備兵数は不明で、配置では仮に千人とする。昼の明るさ、兵の小組、待つ長さは推定。二番の伊賀伊賀守は本文の呼び名を使い、安藤守就と同一とは断定しない。下間頼廉の局地の指揮・本陣位置と、東側を回る反撃の道は復元。十の付城による包囲と、その後の戦いはこの日の追撃とは分ける。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる）
tennoji.lordAt = { x: 80, z: 20, r: 12, why: '信長の手（信長は自ら先頭に立ち、天王寺砦へ打ち入った）' };

// 試し役の通り道。主郭・外曲輪の口と、兵舎を避ける角を結ぶ。
// 柵越しに突けることと、柵を歩いて越せることは別。味方の柵も道を遮る。
const BOT_ROAD = [
  [-10.5, -84], [3, -84], [-10.5, -75], [-4, -74], [-4, -70],
  [9, -71], [5, -70],
  [-4, -64], [2, -60], [-9, -60], [-9, -72], [17, -84],
  [0, -52], [0, -46], [0, -40], [0, -30],
  // 東南の櫓の柱と斜めの柵の間から、門内の広場へ戻る角。
  [20, -56], [19, -50.5], [17, -49], [12, -48],
  [-38, -30], [-38, -54], [-38, -84], [-38, -110],
  [38, -30], [38, -54], [38, -84], [38, -110], [0, -110],
  // 新しい小屋の戸口と、土橋を避けて西の物見へ向かう道。
  [-10, -64], [-20, -64], [-20, -73.1], [-17, -73.1], [8, -79.1],
  [-7, -46], [-15, -54], [15, -57], [-17, -66.5], [-4, -76.5],
].map(([x, z]) => ({ x, z }));
function roadSolidDistance(s, x, z) {
  if (s.k === 'r') {
    const dx = x - s.x, dz = z - s.z;
    const lx = dx * s.c - dz * s.s, lz = dx * s.s + dz * s.c;
    return Math.hypot(Math.max(0, Math.abs(lx) - s.hw), Math.max(0, Math.abs(lz) - s.hd));
  }
  if (s.k === 'c') return Math.hypot(x - s.x, z - s.z) - s.r;
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) - s.r;
}
function botRoadClear(b, a, q) {
  for (const s of b.army.structs) if (s.alive && s.seg && !s.opened && segHit(a.x, a.z, q.x, q.z, s.seg) >= 0) return false;
  const n = Math.max(1, Math.ceil(Math.hypot(q.x - a.x, q.z - a.z) / 0.5));
  for (let i = 1; i <= n; i++) {
    const x = a.x + (q.x - a.x) * i / n, z = a.z + (q.z - a.z) * i / n;
    if (!b.world.walkable(x, z)) return false;
    for (const s of b.army.solids || []) {
      if (s.struct && (!s.struct.alive || s.struct.opened)) continue;
      if (x < s.x0 - 0.7 || x > s.x1 + 0.7 || z < s.z0 - 0.7 || z > s.z1 + 0.7) continue;
      const d = roadSolidDistance(s, x, z);
      // 実際の当たりは徒歩0.45。柱に触れている時も、柱から離れる道は使える。
      // 安全幅0.7の内側を全部ふさぐと、押し戻された位置から一歩も出られない。
      if (d < 0.7 && d <= roadSolidDistance(s, a.x, a.z) + 1e-6) return false;
    }
  }
  return true;
}
function fortWay(army, u, x, z) {
  const b = army._fortRoadContext || (army._fortRoadContext = { army, world: army.world }), n = BOT_ROAD.length;
  let R = u._fortRoad;
  if (!R) {
    R = u._fortRoad = { x, z, gx: x, gz: z, until: -1, goal: { x, z }, dist: new Float64Array(n), first: new Int16Array(n), used: new Uint8Array(n) };
  }
  if (!army._fortRoadEdges) {
    const edges = army._fortRoadEdges = new Float64Array(n * n);
    edges.fill(Infinity);
    // 道のつながりは全員で使い回す。道順の作り直しは半秒に一度まで。
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (botRoadClear(b, BOT_ROAD[i], BOT_ROAD[j])) {
      edges[i * n + j] = edges[j * n + i] = Math.hypot(BOT_ROAD[i].x - BOT_ROAD[j].x, BOT_ROAD[i].z - BOT_ROAD[j].z);
    }
  }
  const edges = army._fortRoadEdges;
  if (army.time >= R.until || Math.hypot(x - R.gx, z - R.gz) > 1 || Math.hypot(u.pos.x - R.x, u.pos.z - R.z) < 0.8) {
    R.until = army.time + 0.5; R.gx = x; R.gz = z; R.goal.x = x; R.goal.z = z;
    R.x = x; R.z = z;
    if (!botRoadClear(b, u.pos, R.goal)) {
      R.used.fill(0);
      for (let i = 0; i < n; i++) {
        R.dist[i] = botRoadClear(b, u.pos, BOT_ROAD[i]) ? Math.hypot(u.pos.x - BOT_ROAD[i].x, u.pos.z - BOT_ROAD[i].z) : Infinity;
        R.first[i] = R.dist[i] < 0.8 ? -1 : i;
      }
      let best = Infinity, next = -1;
      for (let k = 0; k < n; k++) {
        let v = -1, d = Infinity;
        for (let i = 0; i < n; i++) if (!R.used[i] && R.dist[i] < d) { v = i; d = R.dist[i]; }
        if (v < 0 || d >= best) break;
        R.used[v] = 1;
        const end = Math.hypot(x - BOT_ROAD[v].x, z - BOT_ROAD[v].z);
        if (d + end < best && botRoadClear(b, BOT_ROAD[v], R.goal)) { best = d + end; next = R.first[v]; }
        for (let j = 0; j < n; j++) if (!R.used[j] && d + edges[v * n + j] < R.dist[j]) {
          R.dist[j] = d + edges[v * n + j]; R.first[j] = R.first[v] < 0 ? j : R.first[v];
        }
      }
      if (next >= 0) { R.x = BOT_ROAD[next].x; R.z = BOT_ROAD[next].z; }
    }
  }
  return R;
}

function fortRunnerWay(army, u, want) {
  if (!u.group?.isRunner) return want;
  return fortWay(army, u, want.x, want.z);
}
function nearFort(x, z) {
  return Math.abs(x) < 32 && z < -28 && z > -100;
}
function fortMoveWay(army, u, want) {
  // 砦の近くだけ道を探す。遠い野戦の兵には余分な判断をさせない。
  // 両端が門外でも、間の線が砦を横切る退却は道を探す。
  if (!u.group?.isRunner && !nearFort(u.pos.x, u.pos.z) && !nearFort(want.x, want.z) &&
      (Math.min(u.pos.x, want.x) >= 32 || Math.max(u.pos.x, want.x) <= -32 ||
       Math.min(u.pos.z, want.z) >= -28 || Math.max(u.pos.z, want.z) <= -100)) return want;
  if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 0.8) return want;
  return fortWay(army, u, want.x, want.z);
}
function botWalk(p, inp, x, z, r, goTo) {
  const want = p.u._fortGoal || (p.u._fortGoal = { x, z });
  want.x = x; want.z = z;
  // 北の長い道では砦の曲がり角を探さない。行き先の入れ物も使い回す。
  const R = fortMoveWay(p.rt.army, p.u, want);
  // 同じ入れ物で曲がり角をもう一度探し、元の行き先を上書きしない。
  goTo(p, inp, R.x, R.z, R.x === x && R.z === z ? r : 0.6, true);
}
// 道順を保ったまま、打ち込む相手へ構える。
function botFaceWalking(p, inp, e) {
  const walkYaw = p.yaw, walking = inp.k.has('KeyW');
  p.yaw = Math.atan2(e.pos.x - p.u.pos.x, e.pos.z - p.u.pos.z);
  if (p.lock && p.lock !== e) inp.e.add('KeyQ');
  if (!walking) return;
  inp.k.delete('KeyW');
  const da = walkYaw - p.yaw;
  if (Math.abs(Math.cos(da)) > 0.3) inp.k.add(Math.cos(da) > 0 ? 'KeyW' : 'KeyS');
  if (Math.abs(Math.sin(da)) > 0.3) inp.k.add(Math.sin(da) > 0 ? 'KeyA' : 'KeyD');
}

// 素直な遊び手：囲みの兵と戦い、砦の門に入り、打って出て本願寺勢と戦う
// 人ごとの突進で、門を通る道順と深手の退避を上書きしない。
tennoji.botOrders = true;
// 共通の直線退避では柵に詰まる。危険時も砦の門と兵舎を回る。
tennoji.botDefendsFort = true;
// 矢玉の避け足も、櫓の柱・兵舎・切岸を越える向きには出さない。
tennoji.botCoverBlocked = (b, a, q) => !botRoadClear(b, a, q);
// 味方も柵へ向かって逃げず、南の門を通って若江道へ退く。
tennoji.withdrawRoute = (rt, g) => {
  if (g.team !== 0) return null;
  const c = g.center();
  if (c.x < -32) return [[-38, c.z], [-38, 55], [-145, 55]];
  return inPoly(SOTO_POLY, c.x, c.z)
    ? [[0, -52], [0, -30], [38, -30], [145, 55]]
    : [[38, -30], [145, 55]];
};
// 決着後も、砦の柵と兵舎を避けて南の退き口から若江道へ離れる。
tennoji.botWithdraw = (b, inp, { goTo }) => botWalk(b.player, inp, 145, 55, 3, goTo);
tennoji.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 息切れの休みと傷の手当ては、互いの終了条件で打ち切らない。
  if (p.sta < p.maxSta * 0.25) F.botStaminaRest = true;
  if (F.botStaminaRest && p.sta > p.maxSta * 0.75) F.botStaminaRest = false;
  const siege = F.step === 0 || F.step === 2.5 || F.step === 2.75;
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  const canFight = (o) => o.alive && o.team !== u.team && !o.fleeing && !o.woundOut && !o.noTarget && !o.isStruct &&
    o.type !== 'dummy' && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos,
      p.weapon === 'spear' && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < reach);
  let attacker = null, ad = 8, close = 0;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.team === u.team || o.fleeing || o.woundOut || o.noTarget || o.isStruct ||
        o.type === 'dummy' || o.type === 'gun' || o.type === 'bow' || Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    // 予兆の一覧は前のコマのもの。受け流して消えた振りを追い続けない。
    if (!(o.atk?.target === u && !o.atk.bow) && !(o.swing && !o.swing.done && o.swing.target === u) &&
        !(o.charging && o.target === u)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // こちらの槍が届かなくても、敵の長い槍は柵越しに届く。敵の間合いで受けを決める。
    const over = (o.wpnKind || o.lookWeapon || o.weapon) === 'spear' && d < o.reach;
    if (b.army.wallBetween(o.pos, -1, u.pos, over)) continue;
    // 敵の槍が届く所では受ける。遠い予兆で門への歩みを止めない。
    if (d < Math.max(reach, o.reach + 0.35) && d < ad) { attacker = o; ad = d; }
  }
  for (const o of b.army.units) if (o.team !== u.team && o.type !== 'gun' && o.type !== 'bow' &&
      Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 5 && canFight(o) &&
      // 包囲は敵から実際に打てるかで数える。自分の槍が柵越しに届くこととは別。
      !b.army.wallBetween(o.pos, -1, u.pos, (o.wpnKind || o.lookWeapon || o.weapon) === 'spear' &&
        Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < o.reach)) close++;
  // 傷は自然に治らない。包囲を抜ける退避と、一度だけの手当てを分ける。
  const canTreat = p.treatmentLeft > 0 && !p.bandaged && !p.mounted;
  if (u.hp < u.maxHp * 0.5 && canTreat && !F.botTreatRest && !F.botRestDone) { F.botTreatRest = true; F.botRestT = b.t; }
  if (F.botTreatRest && (!canTreat || b.t - F.botRestT >= 25)) { F.botTreatRest = false; F.botRestDone = true; }
  b.botRest = !!(F.botStaminaRest || F.botTreatRest);
  if (u.mobbed || (close >= 3 && b.army.playerSupport < close) ||
      (close && p.sta < p.maxSta * 0.22)) F.botRetreatUntil = b.t + 2;
  // 守る門を離れて組ごと奥へ戻り続けない。門内で槍をそろえ、退避時は組も呼ぶ。
  const retreating = b.botRest || F.botRetreatUntil > b.t;
  const atGate = siege && Math.hypot(u.pos.x - T_GATE.x, u.pos.z - (T_GATE.z - 3)) < 2;
  const order = !retreating && atGate ? 'yari' : 'follow';
  if (b.squad?.length && b.t >= (F.botOrderAt || 0) &&
      b.squadGroups?.some((g) => g.order !== order)) {
    inp.quickCmd = order; F.botOrderAt = b.t + 10;
    if (order === 'yari') p.yaw = 0;
  }
  const c = F.nobu.center();
  if (retreating) {
    inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
    const foe = attacker || b.army.nearestEnemy(u, 6, canFight);
    if (F.botTreatRest && p.treatmentReady && !foe) { if (p.lock) inp.e.add('KeyQ'); inp.k.add('KeyE'); return; }
    // 信長の前線を追って休まず、門を通って守備隊のいる砦へ戻る。
    botWalk(p, inp, siege ? T_HONGATE.x : 2, siege ? -74 : -50, 1, goTo);
    if (foe) { botFaceWalking(p, inp, foe); inp.guardHold = true; }
    return;
  }
  // 構えを解く半秒の間、届く相手を保つ。柵越しや別の高さの兵は追わない。
  const previous = p.botStrikeFoe;
  const e = p.botStrikeUntil > p.time && previous && canFight(previous) && !previous.invuln &&
    Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < reach ? previous :
    b.army.nearestEnemy(u, F.step === 2 ? 5 : siege ? 9 : 12, (o) => canFight(o) && !o.invuln &&
      (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < reach || botRoadClear(b, u.pos, o.pos)) &&
      (!siege || inPoly(SOTO_POLY, o.pos.x, o.pos.z) || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 3.5));
  if (attacker) {
    p.yaw = Math.atan2(attacker.pos.x - u.pos.x, attacker.pos.z - u.pos.z);
    if (p.lock && p.lock !== attacker) inp.e.add('KeyQ');
    // 敵の長い槍を受けるだけで止まらず、自分の槍が届く所まで詰める。
    if (ad > reach * 0.9 && botRoadClear(b, u.pos, attacker.pos) &&
        (!siege || inPoly(SOTO_POLY, attacker.pos.x, attacker.pos.z))) inp.k.add('KeyW');
    // 攻撃が終わった兵を、前のコマの予兆だけで受け続けない。
    // 受け流した隙も共通の判断で構えを解き、槍を突く。
    patientStrike(p, inp, attacker, ad);
    return;
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    if (d > reach * 0.9 && botRoadClear(b, u.pos, e.pos)) inp.k.add('KeyW');
    // 構えたまま突くと払いになる。敵の隙に構えを解いてから突く。
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) { if (inPoly(SOTO_POLY, u.pos.x, u.pos.z)) { botWalk(p, inp, T_GATE.x, T_GATE.z + 7, 1, goTo); return; } const q = [F.ringA, F.ringB, F.gunA].find((x) => x && !gone(x)); if (q) { const t = q.center(); botWalk(p, inp, t.x, t.z, 2, goTo); return; } }
  if (F.step === 2) { botWalk(p, inp, F.gz.x, F.gz.z, 1.5, goTo); return; }
  if (siege) {
    botWalk(p, inp, T_GATE.x, T_GATE.z - 3, 1, goTo);
    if (inp.quickCmd === 'yari') p.yaw = 0;
    return;
  }
  if (F.step === 3) {
    const q = (F.last || []).find((x) => !spent(x));
    if (q) { const t = q.center(); if (inPoly(SOTO_POLY, u.pos.x, u.pos.z)) { botWalk(p, inp, FORT.x, FORT.z + FORT.r + 4, 1, goTo); return; } botWalk(p, inp, t.x, t.z, 2, goTo); return; }
  }
  if (F.step === 4 && F.kz) {
    if (inPoly(SOTO_POLY, u.pos.x, u.pos.z)) { botWalk(p, inp, FORT.x, FORT.z + FORT.r + 4, 1, goTo); return; }
    botWalk(p, inp, F.kz.x, F.kz.z, 2, goTo); return;
  }
  botWalk(p, inp, c.x + 2, c.z + 4, 3, goTo);
};

export { tennoji };
