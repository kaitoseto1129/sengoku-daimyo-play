// ======================================================================
// 城の部品（castle_parts.js）… docs/castle-design.md 5章
// props.js の城の部品を一つの入口にまとめ、床（floors.js）を伴う部品を足していく。
// props.js 側の今の部品は壊さず、そのまま使い回す（ここから re-export するだけ）。
// b_castle.js の中だけの部品（sumiyagura/yaguramon/goten の別版など）は、今回は移していない
// （大きな書き換えになるので後回し。10章の「作る順」9 で castle_plan.js から作り直す時にまとめて移す）。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ishigaki, dobei, tsuiji, sumiyagura, yaguramon, tamon, kuruwa, tenshu, sakamogi, takataba,
  kabukimon, tobira, tobiraLeaf, hashigo, dorui, palisade, bobosaku, yagura, castleMat,
  jinmaku, hut, tawara, solidRect, makeSimpleBatch, finalizeSimpleBatch, hipGeo,
} from './props.js';
import { addDeck, addLadder, addWall, FL } from './floors.js';
import { addInterior, facePanels } from './naka.js';
import { sumiInside, gateInside, interiorBase } from './yagura_inside.js';
import { S as SETTINGS } from './settings.js';

export {
  ishigaki, dobei, tsuiji, sumiyagura, yaguramon, tamon, kuruwa, tenshu, sakamogi, takataba,
  kabukimon, tobira, tobiraLeaf, hashigo, dorui, palisade, bobosaku, yagura, castleMat,
};

// 物見櫓：今の yagura() の形（柱四本・床・板の囲い・梯子）に、床の層（floors.js）の登録を足す。
// これで自分が本当に梯子を登り、床の上に立てる（docs 5-2「物見櫓」）。
// 戻り値：{ mesh, deckId, ladderId, topY }。mesh は rt.scene.add() で置く（呼び手の側で行う。他の部品と同じ作法）
export function monomi(rt, x, z, o = {}) {
  const W = rt.world;
  if (o.logFrame) o = { ...o, kind: 'ro', height: o.height ?? 10 };
  const mesh = yagura(W, x, z, o);
  if (rt.scene) rt.scene.add(mesh);
  const I = mesh.userData.naka, topY = I.levels[0].y;
  const deckId = I.deckIds[0], ladderId = I.ladderId;
  const l = FL.ladders[ladderId], foot = { x: l.x, z: l.z };
  const loopSpots = [-.55, .55].map(lx => {
    const [sx, sz] = I.P(lx, -.85); return { x: sx, z: sz, y: topY, heading: I.rot + Math.PI };
  });
  return { mesh, deckId, ladderId, topY, x, z, foot, naka: I, loopSpots };
}

// ======================================================================
// 砦の部品（docs/siege-plan.md 6章 S2・docs/fort-spec.md 5〜11 章）
// 柵・逆茂木・馬防柵・空堀・土塁・木戸・本陣（陣幕）・兵舎・兵糧庫。
// 形は props.js を使い回し、当たりと耐久は army.addStruct（壊せる・火に弱いのは、どれも
// battle.js の updateFences・army_fx.js の igniteStruct が struct.name の「柵」で自動に見る
// 仕組みに乗るので、ここでは名と hp を渡すだけでよい）。
// 返す物は部品ごとに使う分だけ：{ mesh, struct(s), hp, fire, slots, choke }。
// ======================================================================

// 点の並び pts=[[x,z],…] を区画に分け、meshFn(world, seg, meshOpt) で見た目を作りながら
// army.addStruct で耐久のある区画を並べる（柵・馬防柵で使う内々の道具）
function wallLike(rt, pts, meshFn, o = {}) {
  const { team = 0, hp = 400, segLen = 6, closed = false, gaps = [], name = '柵', sama, meshOpt, batch } = o;
  const structs = [];
  const P = closed ? [...pts, pts[0]] : pts;
  let k = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1e-6;
    const n = Math.max(1, Math.round(len / segLen));
    for (let j = 0; j < n; j++, k++) {
      if (gaps.includes(k)) continue;
      const t0 = j / n, t1 = (j + 1) / n;
      const seg = [ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1];
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      const s = rt.army.addStruct({ seg, nx, nz, hp, maxHp: hp, team, name, idx: k });
      if (sama) s.samaStep = sama;
      s.mesh = meshFn(rt.world, seg, { ...(meshOpt || {}), batch });
      if (!s.mesh.isBatchedPart) rt.scene.add(s.mesh);
      structs.push(s);
    }
  }
  return structs;
}

// 柵：耐久あり・火に弱い（struct.name に「柵」を含むので、igniteStruct・updateFences がそのまま働く）・兵で壊せる
// o: { team, hp=400, segLen=6, closed, gaps, sama=1.5（狭間の間合い）, name='柵' }
// 区画ごとに別の見た目（palisade()）を作るが、ここで一つの BatchedMesh にまとめて描く回数を減らす
// （o.noBatch で元の作り＝個別メッシュに戻せる。壊れた時の個別の傾き・非表示は BatchedPart 経由で保つ）
export function fence(rt, pts, o = {}) {
  const hp = o.hp ?? 400;
  const batch = o.noBatch ? null : makeSimpleBatch();
  const structs = wallLike(rt, pts, o.mesh || palisade, { hp, name: '柵', sama: 1.5, ...o, batch });
  if (batch) finalizeSimpleBatch(rt, batch);
  return {
    structs, mesh: structs.map((s) => s.mesh), hp, fire: true,
    slots: () => structs.flatMap((s) => rt.army.samasOf(s)),
  };
}

// 逆茂木：木を敵へ向けて倒した障害。sakamogi() の点置きを並べ、区画ごとに低い耐久を持たせる
// o: { team, hp=90, spacing=5, closed, name='逆茂木' }
export function sakamogiRow(rt, pts, o = {}) {
  const { team = 0, hp = 90, spacing = 5, closed = false, name = '逆茂木' } = o;
  const P = closed ? [...pts, pts[0]] : pts;
  const structs = [];
  let carry = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1e-6;
    const tx = (bx - ax) / len, tz = (bz - az) / len;
    const rot = Math.atan2(tx, tz);
    let u = -carry;
    while (u < len) {
      if (u >= 0) {
        const x = ax + tx * u, z = az + tz * u;
        const mesh = sakamogi(rt.world, x, z, rot, spacing * 0.95);
        rt.scene.add(mesh);
        const half = spacing * 0.45, nx = -tz, nz = tx;
        const seg = [x - tx * half, z - tz * half, x + tx * half, z + tz * half];
        const s = rt.army.addStruct({ seg, nx, nz, hp, maxHp: hp, team, name });
        // 束22：遅くする帯（前後2.5m）。army_move.js の steer がこれを見て歩兵0.6・騎馬0.25に落とす（hp<=0で消える）
        const bandHalf = half + 2.5;
        s.band = [x - tx * bandHalf, z - tz * bandHalf, x + tx * bandHalf, z + tz * bandHalf];
        s.bandR = 1.6;
        s.mesh = mesh;
        structs.push(s);
      }
      u += spacing;
    }
    carry = u - len;
  }
  return { structs, mesh: structs.map((s) => s.mesh), hp, fire: false };
}

// 馬防柵：鉄砲隊と組む柵（bobosaku()。柱の間が空き、鉄砲を隙間から撃てる＝狭間と同じ仕組みに乗せる）
// 騎馬は直接突撃できない（noCharge を戦の側の当たり判定で見る約束の印だけ立てる）
// o: { team, hp=260, segLen=6, closed, gaps, sama=1.0, name='馬防柵' }
export function bobosakuLine(rt, pts, o = {}) {
  const hp = o.hp ?? 260;
  const batch = o.noBatch ? null : makeSimpleBatch();
  const structs = wallLike(rt, pts, bobosaku, { hp, name: '馬防柵', sama: 1.0, segLen: 6, ...o, batch });
  if (batch) finalizeSimpleBatch(rt, batch);
  for (const s of structs) s.noCharge = true;
  return {
    structs, mesh: structs.map((s) => s.mesh), hp, fire: true, noCharge: true,
    slots: () => structs.flatMap((s) => rt.army.samasOf(s)),
  };
}

// 空堀：地形を窪ませる純粋な関数を返すだけ（見た目は地形そのものの高さで足りる）。
// 戦の world.height(x, z) の設定にそのまま足し込める：
//   const dip = horiboriHeight(pts, { depth: 1.6, width: 4.5 });
//   world: { height: (x, z) => base(x, z) + dip(x, z) }
// o: { depth=1.6, width=4.5, closed }
export function horiboriHeight(pts, o = {}) {
  const { depth = 1.6, width = 4.5, closed = false } = o;
  const P = closed ? [...pts, pts[0]] : pts;
  return (x, z) => {
    let best = Infinity;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best) best = d;
    }
    if (best >= width / 2) return 0;
    // 薬研堀：底が狭く、法面がまっすぐ急に立つ V の形（丸い椀の窪みに見せない）。底の 15% だけ平ら
    const u = best / (width / 2);
    return -depth * Math.min(1, (1 - u) / 0.85);
  };
}
// 空堀を越えている間の速さの掛け目（越えている間は遅く・撃たれやすい＝army_ranged の当たりやすさは別の筋 F7 で）
export function horiboriSlow(pts, o = {}) {
  const h = horiboriHeight(pts, o);
  const thresh = -(o.depth ?? 1.6) * 0.12;
  return (x, z) => (h(x, z) < thresh ? (o.slow ?? 0.55) : 1);
}

// 土塁：主な防御壁。dorui() の見た目（world.heightAt の上に盛る）に、登って立てる床
// （floors.js の addDeck。区画ごとに、尾根の上をやや内側寄りに一枚）を添える。
// 兵を弓・鉄砲で置く時は、この床の上の点を自分で選ぶ（floors.js は当たりだけで、置き場の割り当ては持たない）。
// 地形そのものを持ち上げたい時（登る坂を急にしたくない時）は doruiHeight を world.height に足し込む。
// o: { w=3.2, h=0.7, closed, name='土塁', climbAt }
export function doruiLine(rt, pts, o = {}) {
  const { w = 3.2, h = 0.7, closed = false, name = '土塁' } = o;
  const P = closed ? [...pts, pts[0]] : pts;
  const decks = [];
  const batch = o.noBatch ? null : makeSimpleBatch();
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1e-6;
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    const m = dorui(rt.world, [ax, az, bx, bz], nx, nz, { w, h, batch });
    if (!m.isBatchedPart) rt.scene.add(m);
    const mx = (ax + bx) / 2 + nx * w * 0.15, mz = (az + bz) / 2 + nz * w * 0.15;
    const y = rt.world.heightAt(mx, mz) + h * 0.88;
    const rot = Math.atan2(bx - ax, bz - az);
    // 地形そのものに盛った土塁は、平らな床を重ねず斜面の高さで歩く。
    if (!o.terrainFloor) decks.push(addDeck({ x0: -len / 2, x1: len / 2, z0: -w * 0.3, z1: w * 0.3, cx: mx, cz: mz, rot, y, name }));
  }
  if (batch) finalizeSimpleBatch(rt, batch);
  // 決まった所だけ登れる（束21・castle-fort-system-spec 10 章）：o.climbAt [[x, z], ...] を書いた土塁は、
  // その点から 2.5m のほかは world.walkable が通さない（外から入れない。書かない土塁は今のまま）
  if (o.climbAt && o.climbAt.length && rt.world) {
    const dh = doruiHeight(pts, { w, h: 1, closed }), ca = o.climbAt;
    (rt.world.noClimb || (rt.world.noClimb = [])).push((x, z) => dh(x, z) > 0.05 && !ca.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 2.5));
  }
  return { decks, hp: null, fire: false, heightAt: doruiHeight(pts, { w, h, closed }) };
}
export function doruiHeight(pts, o = {}) {
  const { w = 3.2, h = 0.7, closed = false } = o;
  const P = closed ? [...pts, pts[0]] : pts;
  // 歩けるかは足場探索でも何度も呼ぶ。遠い郭の全辺を兵ごとに
  // 測らず、土塁の幅を含む囲みで先に外す。内側は元の判定のまま。
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of P) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  x0 -= w / 2; x1 += w / 2; z0 -= w / 2; z1 += w / 2;
  return (x, z) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return 0;
    let best = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      const u = d / (w / 2);
      if (u < 1) { const hh = h * (1 - u * u); if (hh > best) best = hh; }
    }
    return best;
  };
}

// 木戸：砦の簡素な門（props.js の tobira。耐久あり・開く／破られて倒れる）。choke は口の幅
// o: { team, hp=260, h, name='木戸', gate }（gate は戦の側で門ごとの番号を付けたい時に渡す）
export function kido(rt, x, z, w = 2.6, rot = 0, o = {}) {
  const { team = 0, hp = 260, name = '木戸' } = o;
  const half = w / 2;
  const tx = Math.cos(rot), tz = -Math.sin(rot);     // 口に沿った向き
  const nx = Math.sin(rot), nz = Math.cos(rot);      // 外向き（+z が外、yagura/palisade と同じ決まり）
  const seg = [x - tx * half, z - tz * half, x + tx * half, z + tz * half];
  const s = rt.army.addStruct({ seg, nx, nz, hp, maxHp: hp, team, name, gate: o.gate ?? 0 });
  const mesh = tobira(rt.world, x, z, w, rot, { h: o.h });
  s.mesh = mesh;
  rt.scene.add(mesh);
  // 門構え（kaito 10/2「門が小さい・チープ」）：扉だけが柵の切れ目に浮かないよう、太い本柱・冠木・板葺きの小屋根・控柱を
  // 扉の外に建てる（冠木門の形。扉が破れても門構えは残る）。o.frame === false で付けない。
  // 戦の側が同じ所に自分で冠木門を建てる時（志賀の宇佐山）は二重にしない：その戦の組み立てが終わった後（次の microtask）に、
  // 2m 内に冠木門がもう置かれていなければ建てる
  const frame = o.frame === false ? null : kabukimon(rt.world, x, z, w, rot, { doors: false });
  if (frame) Promise.resolve().then(() => {
    const dup = rt.scene.children.some((c) => c !== frame && c.userData && c.userData.kabuki && Math.hypot(c.position.x - x, c.position.z - z) < 2);
    if (!dup) rt.scene.add(frame);
  });
  return {
    mesh, frame, struct: s, hp, fire: true, choke: w,
    door: mesh,   // 閉め直す絵（siege_gate.js の closeDoorVisual が扉の葉を戻す。B026）
    open: () => mesh.userData.open && mesh.userData.open(),
    fall: () => mesh.userData.fall && mesh.userData.fall(),
  };
}

// 本陣（陣幕）：jinmaku() の内に、旗本の立ち位置（slots）を円く配る。口（南）の幅が choke
// o: { gapSouth=4, guard=8, mon }
export function honjin(rt, x, z, w = 10, d = 7, o = {}) {
  const gapSouth = o.gapSouth ?? 4;
  const mesh = jinmaku(rt.world, x, z, w, d, gapSouth, o);
  rt.scene.add(mesh);
  const n = o.guard ?? 8, rIn = Math.min(w, d) / 2 - 0.8;
  const slots = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    slots.push({ x: x + Math.sin(a) * rIn, z: z + Math.cos(a) * rIn });
  }
  return { mesh, hp: null, fire: false, slots, choke: gapSouth };
}

// 兵舎：控えの兵が休む小屋。壊せる・燃える（hut() の見た目に army の struct を添える）
// o: { team, hp=500, armor=0.1, name='兵舎' }
export function heisha(rt, x, z, w = 6, d = 4, rot = 0, o = {}) {
  const { team = 0, hp = 500, armor = 0.1, name = '兵舎' } = o;
  const r = Math.max(w, d) / 2 + 0.6;
  const s = rt.army.addStruct({ x, z, r, solidR: r, hp, maxHp: hp, armor, team, name });
  const mesh = hut(rt.world, x, z, w, d, rot, { solid: false });
  s.mesh = mesh;
  rt.scene.add(mesh);
  return { mesh, struct: s, hp, fire: true };
}

// 兵糧庫：燃えると守りの士気を大きく下げる（F3 が s.moraleOnBurn を見て扱う約束。中身は俵を少し見せる）
// o: { team, hp=420, name='兵糧庫', moraleOnBurn='big' }
export function hyorogura(rt, x, z, w = 5, d = 4, rot = 0, o = {}) {
  const { team = 0, hp = 420, name = '兵糧庫' } = o;
  const r = Math.max(w, d) / 2 + 0.6;
  const s = rt.army.addStruct({ x, z, r, solidR: r, hp, maxHp: hp, armor: 0, team, name, moraleOnBurn: o.moraleOnBurn ?? 'big' });
  const mesh = hut(rt.world, x, z, w, d, rot, { solid: false });
  s.mesh = mesh;
  rt.scene.add(mesh);
  rt.scene.add(tawara(rt.world, x - Math.sin(rot) * 0.6, z - Math.cos(rot) * 0.6, rot, 6));
  return { mesh, struct: s, hp, fire: true, moraleOnBurn: s.moraleOnBurn };
}

// ======================================================================
// C1：城の部品（docs/siege-plan.md「C1［A］城の部品」・docs/castle-design.md 5章）
// 城門の四段の耐久・枡形・土塀（狭間）・隅櫓（上下二段）・石垣（登れる・壊せない）・
// 空堀（horiboriHeight を使い回す）・水堀・土橋・竪堀・御殿・長屋。
// yaguramon・sumiyagura・dobei は props.js の「今の物」をそのまま使う（b_castle.js の中だけの
// 古い版は写さない）。御殿・長屋は props.js に無いので、ここに軽い専用の形を作る（b_castle.js は直さない）。
// ======================================================================

// 城門の口：seg・struct を kido() と同じ作法で作る内々の道具
function gateStruct(rt, x, z, w, rot, o, hp, name) {
  const half = w / 2;
  const tx = Math.cos(rot), tz = -Math.sin(rot);
  const nx = Math.sin(rot), nz = Math.cos(rot);
  const seg = [x - tx * half, z - tz * half, x + tx * half, z + tz * half];
  return rt.army.addStruct({ seg, nx, nz, hp, maxHp: hp, team: o.team ?? 0, name, gate: o.gate ?? 0 });
}

// 冠木門：柱二本に横木（門構えは kabukimon()。扉は tobira() を重ねて壊せる戸にする＝二段目の耐久）
export function kabukiGate(rt, x, z, w = 6.4, rot = 0, o = {}) {
  const { hp = 380, name = o.yakui ? '薬医門' : '冠木門' } = o;
  const s = gateStruct(rt, x, z, w, rot, o, hp, name);
  const frame = kabukimon(rt.world, x, z, w + 0.4, rot, { doors: false, yakui: o.yakui, roof: o.roof });
  const door = tobira(rt.world, x, z, w, rot, { h: o.h });
  s.mesh = door;
  const mesh = new THREE.Group(); mesh.add(frame, door);
  rt.scene.add(mesh);
  return {
    mesh, frame, door, struct: s, hp, fire: true, choke: w,
    open: () => door.userData.open && door.userData.open(),
    fall: () => door.userData.fall && door.userData.fall(),
  };
}

// 櫓門：門の上に渡櫓（yaguramon()）。渡櫓の床は人が登って立てる（三段目の耐久・上の兵を倒すと守りが減る）
export function yaguraGate(rt, x, z, w = 5, rot = 0, o = {}) {
  const { hp = 620, name = '櫓門' } = o;
  const s = gateStruct(rt, x, z, w, rot, o, hp, name);
  const inside = o.inside !== false;
  const frame = yaguramon(rt.world, x, z, w, rot, { doors: false, earth: o.earth, stone: o.stone, inside });
  const door = tobira(rt.world, x, z, w, rot, { h: o.h });
  s.mesh = door;
  const mesh = new THREE.Group(); mesh.add(frame, door);
  rt.scene.add(mesh);
  const y0 = interiorBase(rt.world, x, z, w + 5.6, 4.2, rot);
  const topY = y0 + 3.95;
  const Lw = w + 5.6, half2 = 2.0;
  const nx = Math.sin(rot), nz = Math.cos(rot);
  let deckId, IN = null;
  if (inside) {
    // 渡櫓の中（naka.js。kaito 10/2）：内の側（+z）の端に戸口と、地面から上がる雁木の段。窓は外の格子窓と同じ所
    IN = gateInside(rt.world, x, z, w, rot, o);
    IN.struct = s;
    deckId = IN.deckIds[0];
  } else deckId = addDeck({ x0: -Lw / 2, x1: Lw / 2, z0: -half2, z1: half2, rot, cx: x, cz: z, y: topY, name: '櫓門の上' });
  // 狭間の前の立ち所（perch.js）：外（-z）の格子窓の内側。筒先が窓から出る
  const P = (lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];
  const loopSpots = inside ? [0, -1, 1].map((q) => { const [sx, sz] = P(q * 2.4, -1.25); return { x: sx, z: sz, y: topY, heading: rot + Math.PI }; }) : null;
  const foot = { x: x + nx * (half2 + 0.8), z: z + nz * (half2 + 0.8) };
  const ladderId = addLadder({ x: foot.x, z: foot.z, y0: rt.world.heightAt(foot.x, foot.z), y1: topY, deck: deckId, hp: o.laddHp ?? 40, team: o.team, name: '櫓門の梯子' });
  const loops = [1, -1].map((sd) => ({ x: x + Math.cos(rot) * 0, z, y: topY + 1.2, nx: nx * sd, nz: nz * sd, kind: 'gun' }));
  return {
    mesh, frame, door, struct: s, hp, fire: true, choke: w, deckId, ladderId, loops, loopSpots, naka: IN,
    open: () => door.userData.open && door.userData.open(),
    fall: () => door.userData.fall && door.userData.fall(),
  };
}

// 鉄の門：櫓門と同じ形に、鉄板張りの分だけ耐久と防御を足す（四段目の耐久）
export function ironGate(rt, x, z, w = 5, rot = 0, o = {}) {
  const g = yaguraGate(rt, x, z, w, rot, { ...o, hp: o.hp ?? 950, name: '鉄の門' });
  g.struct.armor = (g.struct.armor || 0) + 0.28;
  return g;
}

// 枡形虎口：一の門（冠木門）→ 四角い広場（三方を塀）→ 直角に曲がって二の門（櫓門）。docs 1-3
// x,z,rot：一の門の位置と外向き。o.turn：+1で右へ折れる・-1で左（既定 +1）
export function masugata(rt, x, z, rot = 0, o = {}) {
  const turn = o.turn ?? 1, hs = o.size ?? 4.5, w1 = o.w1 ?? 4.6, w2 = o.w2 ?? 4.2;
  const outer = kabukiGate(rt, x, z, w1, rot, { team: o.team, hp: o.hp1, gate: o.gate ?? 0 });
  const ux = Math.sin(rot), uz = Math.cos(rot);
  const px = turn * uz, pz = -turn * ux;
  const cx = x - ux * hs, cz = z - uz * hs;
  const P2 = (a, b) => [cx + px * a - ux * b, cz + pz * a - uz * b];
  const wallFn = o.fort ? palisade : dobei;
  const walls = [];
  for (const [a0, b0, a1, b1] of [[-hs, -hs, -hs, hs], [-hs, hs, hs, hs], [hs, hs, hs, 1.6]]) {
    const [x0, z0] = P2(a0, b0), [x1, z1] = P2(a1, b1);
    walls.push(...wallLike(rt, [[x0, z0], [x1, z1]], wallFn, { hp: o.wallHp ?? 420, name: '枡形の塀', segLen: 8, team: o.team }));
  }
  const [ix, iz] = P2(hs, -hs * 0.35);
  const inner = yaguraGate(rt, ix, iz, w2, rot + turn * Math.PI / 2, { team: o.team, hp: o.hp2, gate: (o.gate ?? 0) + 1, earth: o.earth });
  // 枡形の地面だけを戦闘地形にする。上の櫓・塀の床は terrain_tags が外す。
  // 戦の組み立てで一度だけ記録し、兵ごとの判定では四則計算だけを使う。
  (rt.world.koguchiAreas || (rt.world.koguchiAreas = [])).push({ x: cx, z: cz, px, pz, ux, uz, half: hs, team: o.team ?? 0 });
  return { outer, inner, walls, choke: w1, plaza: { x: cx, z: cz } };
}

// 土塀（狭間）：props.js の dobei() を区画に分け、壊せる区画ごとに撃つ所（sama）を添える。docs 5-2
export function dobeiLine(rt, pts, o = {}) {
  const hp = o.hp ?? 500;
  const meshOpt = { h: o.h, samaStep: o.samaStep, hikae: o.hikae, tera: o.tera };
  const structs = wallLike(rt, pts, o.mesh || dobei, { hp, name: o.name || '土塀', sama: o.sama ?? 1.8, segLen: o.segLen ?? 8, closed: o.closed, gaps: o.gaps, team: o.team, meshOpt });
  return {
    structs, mesh: structs.map((s) => s.mesh), hp, fire: false,
    slots: () => structs.flatMap((s) => rt.army.samasOf(s)),
  };
}

// 隅櫓：曲輪の角の二重の櫓。上下二段の床（一階・二階）に射手を置ける。docs 5-2
export function sumiyaguraTower(rt, x, z, o = {}) {
  // 実寸（kaito 10/2「櫓が小さい」）：二重櫓の一重は 4 間×3 間半ほど（7.2×6.2m）・台の石垣 2.6m
  const { rot = 0, w = 7.2, d = 6.2, base = 2.6, team = 0, hp = 700 } = o;
  const inside = o.inside !== false;
  const mesh = sumiyagura(rt.world, x, z, { rot, w, d, base, stone: o.stone, batch: o.batch, inside });
  if (!mesh.isBatchedPart) rt.scene.add(mesh);
  const y0 = rt.world.heightAt(x, z) - 0.3;
  const deck1Y = y0 + base + 0.02, deck2Y = deck1Y + 3.35;
  const w1 = w * 0.94, d1 = d * 0.94, w2 = w * 0.7, d2 = d * 0.7;
  let deck1, deck2, IN = null;
  const P = (lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];
  if (inside) {
    // 中に入れる隅櫓（naka.js。kaito 10/2）：内（+z）の面に戸口と、台の石垣を上がる石段。中の階段で二階へ
    IN = sumiInside(rt.world, x, z, { w, d, base, rot, team });
    [deck1, deck2] = IN.deckIds;
  } else {
    deck1 = addDeck({ x0: -w1 / 2, x1: w1 / 2, z0: -d1 / 2, z1: d1 / 2, rot, cx: x, cz: z, y: deck1Y, name: '隅櫓 一階' });
    deck2 = addDeck({ x0: -w2 / 2, x1: w2 / 2, z0: -d2 / 2, z1: d2 / 2, rot, cx: x, cz: z, y: deck2Y, name: '隅櫓 二階' });
  }
  // 狭間の前の立ち所（perch.js）：二階の外（-z）の窓・一階の外の窓・二階の内の窓の順。筒先が窓から出る
  const loopSpots = inside ? [[0, -(d * 0.35 - 0.42), deck2Y, Math.PI], [w * 0.25, -(d * 0.48 - 0.6), deck1Y + .93, Math.PI], [-w * 0.25, -(d * 0.48 - 0.6), deck1Y + .93, Math.PI], [0, d * 0.35 - 0.42, deck2Y, 0]]
    .map(([lx, lz, yy, hh]) => { const [sx, sz] = P(lx, lz); return { x: sx, z: sz, y: yy, heading: rot + hh }; }) : null;
  const foot = { x, z: z + Math.max(w, d) / 2 + 2.2 };
  const ladder1 = addLadder({ x: foot.x, z: foot.z, y0: rt.world.heightAt(foot.x, foot.z), y1: deck1Y, deck: deck1, hp: o.laddHp ?? 35, team, name: '隅櫓の梯子' });
  const ladder2 = addLadder({ x, z, y0: deck1Y, y1: deck2Y, deck: deck2, hp: o.laddHp ?? 35, team, name: '隅櫓 内の梯子' });
  // 隅櫓の梯子は常に登れる（門の梯子と違い、兵が内から破るまで待つ要がない）。siege_ladder.js で使える形にする
  // 足もとは壁の外（foot）でも、上り着く先は床の内（x,z＝櫓の真ん中）にする（外の梯子→床へ踏み込む）
  { const l = FL.ladders[ladder1]; l.placed = true; l.maxHp = l.hp; l.topX = x; l.topZ = z; }
  { const l = FL.ladders[ladder2]; l.placed = true; l.maxHp = l.hp; l.topX = x; l.topZ = z; }
  const loops = [];
  for (let q = 0; q < 4; q++) {
    const a = rot + q * Math.PI / 2;
    loops.push({ x: x + Math.sin(a) * w2 * 0.5, z: z + Math.cos(a) * d2 * 0.5, y: deck2Y + 1.2, kind: q % 2 ? 'bow' : 'gun' });
  }
  const r = Math.max(w, d) / 2 + 0.6;
  // 台の当たりは props の四角が持つ。攻撃用の円を重ねて通路を塞がない。
  const struct = rt.army.addStruct({ x, z, r, solidR: 0, hp, maxHp: hp, armor: 0.15, team, name: '隅櫓' });
  struct.mesh = mesh;
  if (IN) IN.struct = struct;
  return { mesh, decks: [deck1, deck2], ladders: [ladder1, ladder2], loops, loopSpots, naka: IN, struct, hp, fire: true };
}

// 石垣：props.js の ishigaki() に、上の床（武者走り）と登れる所（梯子）を添える。壊せない（docs 1-5）
export function ishigakiWall(rt, pts, o = {}) {
  const mesh = ishigaki(rt.world, pts, o);
  rt.scene.add(mesh);
  const decks = [];
  const out = o.out ?? 1;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1) continue;
    const nx = -(bz - az) / len * out, nz = (bx - ax) / len * out;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const top = rt.world.heightAt(mx, mz) + (o.top ?? 0.4);
    const rot = Math.atan2(bx - ax, bz - az);
    decks.push(addDeck({ x0: -len / 2, x1: len / 2, z0: -0.9, z1: 0.9, cx: mx - nx * 0.9, cz: mz - nz * 0.9, rot, y: top, name: '石垣の上' }));
  }
  const ladders = (o.climb || []).map(([x, z]) => {
    const y0 = rt.world.heightAt(x, z);
    return addLadder({ x, z, y0, y1: y0 + (o.height ?? 3.2), hp: o.laddHp ?? 40, team: o.team, name: '石垣を登る梯子' });
  });
  return { mesh, decks, ladders, hp: null, fire: false, breakable: false };
}

let _mizuboriMat = null;
function waterMat() {
  if (!_mizuboriMat) _mizuboriMat = new THREE.MeshStandardMaterial({ color: 0x2c3a36, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.92 });
  return _mizuboriMat;
}
// 水堀：horiboriHeight を深く広く取り、水面を一枚重ねる。渡れる所（土橋・橋）は pts を切って呼ぶ（docs 1-4）
export function mizubori(rt, pts, o = {}) {
  const depth = o.depth ?? 3.4, width = o.width ?? 9, closed = !!o.closed;
  const heightAt = horiboriHeight(pts, { depth, width, closed });
  const P = closed ? [...pts, pts[0]] : pts;
  const geos = [];
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) continue;
    const g = new THREE.PlaneGeometry(len, Math.max(1, width - 1.6));
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.atan2(-(bz - az), bx - ax));
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    g.translate(mx, o.y ?? (rt.world.heightAt(mx, mz) - depth * 0.55), mz);
    geos.push(g);
  }
  let mesh = null;
  if (geos.length) {
    mesh = new THREE.Mesh(mergeGeometries(geos), waterMat());
    mesh.receiveShadow = true;
    rt.scene.add(mesh);
  }
  return { mesh, heightAt, blocked: (x, z) => heightAt(x, z) < -depth * 0.35, hp: null, fire: false };
}

// 竪堀：斜面を縦に落ちる溝。畝状竪堀は何本も並べて呼べばよい。横へ回り込めないよう両縁に当たりを置く（docs 1-4）
export function tategoriWalls(rt, pts, o = {}) {
  const depth = o.depth ?? 1.8, width = o.width ?? 2.6;
  const walls = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1e-6;
    const nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (const s of [-1, 1]) {
      const ex0 = ax + nx * s * width / 2, ez0 = az + nz * s * width / 2;
      const ex1 = bx + nx * s * width / 2, ez1 = bz + nz * s * width / 2;
      walls.push(addWall({ ax: ex0, az: ez0, bx: ex1, bz: ez1, r: 0.5, y0: rt.world.heightAt(ex0, ez0) - depth, y1: rt.world.heightAt(ex0, ez0) + 0.4 }));
    }
  }
  return { walls, heightAt: horiboriHeight(pts, { depth, width }), hp: null, fire: false };
}

// 土橋：掘り残した細い道。狭い（2〜3人）。床を置き、縁に低い盛り土を添える（dorui の見た目を細く使い回す。docs 5-2）
export function dobashi(rt, a, b, w = 2.6, o = {}) {
  const [ax, az] = a, [bx, bz] = b;
  const len = Math.hypot(bx - ax, bz - az) || 1e-6;
  const rot = Math.atan2(bx - ax, bz - az);
  const y = Math.max(rt.world.heightAt(ax, az), rt.world.heightAt(bx, bz));
  const deckId = addDeck({ x0: -len / 2, x1: len / 2, z0: -w / 2, z1: w / 2, rot, cx: (ax + bx) / 2, cz: (az + bz) / 2, y, name: o.name || '土橋' });
  const nx = -(bz - az) / len, nz = (bx - ax) / len;
  const mesh = [];
  for (const s of [-1, 1]) {
    const e0x = ax + nx * s * w / 2, e0z = az + nz * s * w / 2, e1x = bx + nx * s * w / 2, e1z = bz + nz * s * w / 2;
    const m = dorui(rt.world, [e0x, e0z, e1x, e1z], nx * s, nz * s, { w: 0.5, h: 0.3 });
    rt.scene.add(m);
    mesh.push(m);
  }
  return { deck: deckId, mesh, choke: w, hp: null, fire: false };
}

// ---- 御殿・長屋だけで使う内々の小さな道具（props.js に無い形なので、軽い専用の形をここで作る） ----
function _paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// 御殿の柱・床・屋根は、読み込み時に同じ基本形を複製する。
const PART_BOX = new THREE.BoxGeometry(1, 1, 1);
function partBox(w, h, d) { return PART_BOX.clone().scale(w, h, d); }
function _box(list, hex, x, y, z, w, h, d, rot = 0) {
  const g = partBox(w, h, d);
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  list.push(_paint(g, hex));
}
function _gable(list, hex, x, y, z, w, d, rot, pitch = 0.42, th = 0.14) {
  for (const sgn of [-1, 1]) {
    const half = d / 2 / Math.cos(pitch);
    const g = partBox(w, th, half + 0.3);
    g.rotateX(sgn * pitch);
    g.translate(0, y + Math.sin(pitch) * half / 2, sgn * d / 4);
    g.rotateY(rot); g.translate(x, 0, z);
    list.push(_paint(g, hex));
  }
  const ridge = partBox(w + 0.2, 0.2, 0.3);
  ridge.translate(0, y + Math.tan(pitch) * d / 2 + 0.06, 0);
  ridge.rotateY(rot); ridge.translate(x, 0, z);
  list.push(_paint(ridge, 0x2a2828));
}
// 大滝寺の外側の障子だけに使う。紙の繊維と灯明のむらを共有する。
let templePaperMat;
function templePaperMaterial() {
  if (templePaperMat) return templePaperMat;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const glow = ctx.createRadialGradient(64, 78, 8, 64, 78, 90);
  glow.addColorStop(0, '#e9d5a4'); glow.addColorStop(1, '#a69d83');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 320; i++) {
    ctx.strokeStyle = i % 2 ? 'rgba(255,244,212,.12)' : 'rgba(88,71,48,.1)';
    const x = (i * 73) % 128, y = (i * 47) % 128;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 3 + i % 9, y + i % 5 - 2); ctx.stroke();
  }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  templePaperMat = new THREE.MeshLambertMaterial({ map, color: 0xffffff, emissive: 0x8b6535,
    emissiveMap: map, emissiveIntensity: .3, transparent: true, opacity: .82, side: THREE.DoubleSide });
  return templePaperMat;
}
function _kitBag() { return { wood: [], plaster: [], tile: [], shitami: [] }; }
// 指定した山寺の板葺きだけ。板の継ぎ目・重ね・雨染みを一枚の絵で描き、面数は増やさない。
let templeBoardMat;
function templeBoardMaterial() {
  if (templeBoardMat) return templeBoardMat;
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const ctx = cv.getContext('2d');
  const colors = ['#756653', '#6d6050', '#80705b', '#716451', '#665c4e'];
  for (let row = 0; row < 4; row++) for (let col = -1; col < 8; col++) {
    const x = col * 64 + (row % 2) * 32, y = row * 128;
    ctx.fillStyle = colors[((col + 8) * 3 + row * 7) % colors.length];
    ctx.fillRect(x, y, 64, 128);
    const stain = ctx.createLinearGradient(0, y, 0, y + 128);
    stain.addColorStop(0, 'rgba(30,28,21,.32)'); stain.addColorStop(.18, 'rgba(30,28,21,0)');
    stain.addColorStop(1, 'rgba(180,162,125,.12)');
    ctx.fillStyle = stain; ctx.fillRect(x, y, 64, 128);
    for (let j = 0; j < 9; j++) {
      ctx.strokeStyle = j % 3 ? 'rgba(36,31,23,.13)' : 'rgba(199,181,143,.14)';
      const gx = x + 5 + (j * 17 + row * 11) % 54;
      ctx.beginPath(); ctx.moveTo(gx, y + 6); ctx.lineTo(gx + (j % 3 - 1) * 2, y + 122); ctx.stroke();
    }
    ctx.fillStyle = '#403c30'; ctx.fillRect(x, y, 2, 128);
    ctx.fillStyle = '#494336'; ctx.fillRect(x, y, 64, 3);
    ctx.fillStyle = '#94816a'; ctx.fillRect(x + 2, y + 124, 61, 3);
  }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  templeBoardMat = new THREE.MeshLambertMaterial({ map });
  return templeBoardMat;
}
function _kitMesh(B) {
  const grp = new THREE.Group();
  for (const k of Object.keys(B)) {
    if (!B[k].length) continue;
    const m = new THREE.Mesh(mergeGeometries(B[k]), k === 'templePaper' ? templePaperMaterial() : k === 'templeBoard' ? templeBoardMaterial() : castleMat(k));
    if (k === 'templePaper') m.userData.templePaper = true;
    if (k === 'templeBoard') m.userData.templeBoard = true;
    m.castShadow = true; m.receiveShadow = true; m.userData.camBlock = true;
    grp.add(m);
  }
  return grp;
}

// 深い軒を支える垂木。同寸の屋敷では形も材質も共有し、遠くでは描かない。
const GOTEN_EAVES = new Map();
function gotenEaves(w, d, tile, eave, thickness) {
  const key = [w, d, tile, eave, thickness].join('/');
  let geo = GOTEN_EAVES.get(key);
  if (!geo) {
    const ex = w / 2 + eave, ez = d / 2 + eave;
    const rh = ez * (tile ? .62 : .78), rl = Math.max(.6, ex - ez * .55);
    const lift = tile ? Math.min(.55, .28 + ez * .04) : .22;
    const parts = [], up = new THREE.Vector3(0, 1, 0);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3();
    for (let face = 0; face < 4; face++) {
      const half = face < 2 ? ex : ez;
      const count = Math.max(2, Math.ceil(half * 2 / .48));
      // 隅の交差を避け、一面ずつ棟へ向かう垂木を並べる。
      const reach = Math.min(.65, (eave + .2) / (face < 2 ? ez : Math.max(.1, ex - rl)));
      const point = (u, t, out) => {
        const edge = [[u * ex, ez], [-u * ex, -ez], [ex, -u * ez], [-ex, u * ez]][face];
        const ridge = [[u * rl, 0], [-u * rl, 0], [rl, 0], [-rl, 0]][face];
        return out.set(edge[0] + (ridge[0] - edge[0]) * t,
          .08 + rh * (.5 * t + .5 * t * t) + lift * Math.pow(Math.abs(u), 3) * (1 - t) ** 2 - thickness - .055,
          edge[1] + (ridge[1] - edge[1]) * t);
      };
      for (let i = 0; i < count; i++) {
        const u = -1 + (i + .5) * 2 / count;
        // 屋根と同じ曲がりを二節で追い、軒先の木口を帯の下に見せる。
        for (let j = 0; j < 2; j++) {
          point(u, reach * j / 2, a); point(u, reach * (j + 1) / 2, b);
          dir.subVectors(b, a);
          const timber = partBox(.085, dir.length() + .025, .11);
          timber.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()));
          timber.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
          parts.push(_paint(timber, i % 4 === 0 ? 0x796248 : 0x554330));
          timber.dispose();
        }
      }
    }
    geo = mergeGeometries(parts);
    parts.forEach(g => g.dispose());
    GOTEN_EAVES.set(key, geo);
  }
  const mesh = new THREE.Mesh(geo, castleMat('wood'));
  mesh.castShadow = mesh.receiveShadow = true;
  // 細い垂木をカメラの障害にせず、既存の屋根で遮蔽を扱う。
  const lod = new THREE.LOD();
  lod.addLevel(mesh, 0); lod.addLevel(new THREE.Group(), 40);
  return lod;
}

// 御殿：柱と縁、開け放った明かり障子、瓦（か古い城は板）の入母屋の屋根。本丸の奥、城将の居所。docs 5-2
// o: { w=12, d=8, rot=0, tile=true, hp, team }
export function goten(rt, x, z, o = {}) {
  const { w = 12, d = 8, rot = 0, tile = true, team = 0, hp = 900, name = '御殿' } = o;
  const y = o.naka ? interiorBase(rt.world, x, z, w, d, rot) : rt.world.heightAt(x, z);
  const H = 3.0;
  const B = _kitBag();
  // 土壁の色を指定した城だけに使う。指定のない館は従来の漆喰のまま。
  const fieldFort = o.fieldFort === true && true;
  // 高遠の用屋も明示指定で同じ縦板と小窓を使う。室内の間取りは各城のまま。
  const utilityBoardWalls = true && (o.utilityBoardWalls === true || ['iwamura_nagaya', 'iwamura_kura', 'iwamura_bansho'].includes(o.profile));
  // 明示した山城だけの古板。ほかの砦の屋根・壁は既存の形を使う。
  const fieldBoards = fieldFort && o.weatheredBoards === true
    ? (o.boardRoofColors || [0x756d5c, 0x696252, 0x8a7c65, 0x726655]) : null;
  const wallColor = fieldFort ? 0x786653 : o.earth;
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const bays = Math.max(2, Math.round(w / 3));
  // 指定した戸口が柱の位置でも、通れる口の中へ柱を描かない。
  const ds = o.door ?? 1, doorX = o.doorX ?? (o.profile && bays % 2 ? 0 : (w / bays) / 2), gapW = 1.6;
  for (let i = 0; i <= bays; i++) {
    const lx = -w / 2 + i * (w / bays);
    for (const sd of [-1, 1]) {
      if (o.naka && sd === ds && Math.abs(lx - doorX) < gapW / 2 + .11) continue;
      const [px, pz] = P(lx, sd * d / 2);
      _box(B.wood, 0x4e3a28, px, y + H / 2, pz, 0.22, H, 0.22, rot);
    }
  }
  // 中に入れる御殿（o.naka）は、戸口の面の壁に口を開ける（戸口は柱の間の真ん中）
  const wallZ = (lz, ww, th, hex) => {
    if (o.templePaper && o.naka && Math.sign(lz) === ds) {
      // 外側の白壁も紙の位置で抜く。内側だけ透かしても板が残るため。
      const low = H * .175, holes = [{ t0: doorX - gapW / 2, t1: doorX + gapW / 2, y0: 0, y1: 2.6 - low }];
      for (let i = 0; i < bays; i++) {
        const c0 = -w / 2 + i * w / bays + .12, c1 = c0 + w / bays - .24, cm = (c0 + c1) / 2;
        if (cm > doorX - gapW && cm < doorX + gapW) continue;
        holes.push({ t0: c0, t1: c1, y0: 1.375 - low, y1: 2.525 - low });
      }
      for (const [a, b, lo, hi] of facePanels(ww, H * .75, holes)) {
        const [qx, qz] = P((a + b) / 2, lz);
        _box(B.plaster, hex, qx, y + low + (lo + hi) / 2, qz, b - a, hi - lo, th, rot);
      }
      return;
    }
    if (!o.naka || Math.sign(lz) !== ds) { const [qx, qz] = P(0, lz); _box(B.plaster, hex, qx, y + H * 0.55, qz, ww, H * 0.75, th, rot); return; }
    const a0 = -ww / 2, a1 = doorX - gapW / 2, b0 = doorX + gapW / 2, b1 = ww / 2, y0 = y + H * 0.55 - H * 0.375, y1 = y + H * 0.55 + H * 0.375;
    for (const [t0, t1] of [[a0, a1], [b0, b1]]) { const [qx, qz] = P((t0 + t1) / 2, lz); _box(B.plaster, hex, qx, (y0 + y1) / 2, qz, t1 - t0, y1 - y0, th, rot); }
    const [qx, qz] = P(doorX, lz); _box(B.plaster, hex, qx, (y + 2.6 + y1) / 2, qz, gapW, y1 - y - 2.6, th, rot);
  };
  wallZ(-d / 2, w, 0.14, wallColor ?? 0xe0d8c6);
  for (const sd of [-1, 1]) {
    const [sx, sz] = P(sd * w / 2, 0);
    if (fieldBoards) {
      // 妻の下も縦板で閉じる。雨跳ねは足元だけ暗くし、板ごとに褪せ方を変える。
      const count = Math.ceil(d / .3), step = d / count;
      for (let j = 0; j < count; j++) {
        const source = new THREE.BoxGeometry(.14, 2.4, step - .01, 1, 3, 1);
        const g = _paint(source, fieldBoards[(j + (sd > 0 ? 1 : 3)) % fieldBoards.length]);
        source.dispose();
        const p = g.attributes.position, col = g.attributes.color;
        for (let k = 0; k < p.count; k++) {
          const shade = p.getY(k) < -.8 ? .62 : p.getY(k) > .8 ? .93 : 1;
          col.setXYZ(k, col.getX(k) * shade, col.getY(k) * shade, col.getZ(k) * shade);
        }
        g.translate(sd * w / 2, y + 1.7, -d / 2 + (j + .5) * step);
        g.rotateY(rot); g.translate(x, 0, z); B.wood.push(g);
      }
    } else _box(B.plaster, wallColor ?? 0xefe9da, sx, y + H * 0.55, sz, 0.14, H * 0.75, d, rot);
  }
  wallZ(d / 2 - 0.08, w * 0.94, 0.08, wallColor ?? 0xefe9da);
  const decks = [];
  let IN = null;
  if (o.naka) {
    // 中に入れる御殿（naka.js。kaito 10/2）：戸口（o.door：+1 は縁側の面、-1 は裏の面）・奥の間の襖・明かり障子。
    // 城主はふつう奥の間（天守の無い城の「大将の居場所」）
    IN = addInterior(rt.world, {
      name, kind: o.kind || 'goten', profile: o.profile, x, z, rot, levels: [{ y: y + 0.55, w: w - 0.3, d: d - 0.3, h: o.interiorH ?? H - 0.1 }],
      door: { side: ds, lx: doorX, w: 1.4 }, approach: { pad: 0.35, len: 1.1 }, oku: o.oku ?? 0.45, where: o.where,
    });
    decks.push(...IN.deckIds);
    // 戸口の両脇に篝（灯り二つ）：外からでも入口が分かる（B088）
    if (o.doorFire !== false) for (const sd of [-1, 1]) { const [fx, fz] = P(doorX + sd * 1.3, ds * (d / 2 + 1.5)); rt.world.addFire(fx, fz, { torch: true, h: 0.9 }); }
  } else {
    decks.push(addDeck({ x0: -w / 2 - 0.1, x1: w / 2 + 0.1, z0: d / 2 - 0.1, z1: d / 2 + 1.3, rot, cx: x, cz: z, y: y + 0.42, name: `${name}の縁側` }));
    decks.push(addDeck({ x0: -w / 2 - 0.1, x1: w / 2 + 0.1, z0: -d / 2 - 0.1, z1: d / 2 + 0.1, rot, cx: x, cz: z, y: y + 0.55, name }));
  }
  if (o.templePaper) B.templePaper = [];
  if (o.templeBoardRoof && !tile && true) B.templeBoard = [];
  gotenDress(B, P, x, y, z, w, d, rot, H, bays, ds, o.naka ? { doorX, gapW } : null, tile, o.eave, B.templeBoard ? .1 : o.eaveThickness, fieldFort, o.boardRoof,
    (o.profile?.startsWith('iwamura') || o.layeredBoardRoof === true), utilityBoardWalls, fieldBoards, o.odaniBoards === true);
  const mesh = _kitMesh(B);
  if (!fieldFort && !(o.boardRoof && !tile)) {
    const rafters = gotenEaves(w, d, tile, o.eave ?? 1.3, B.templeBoard ? .1 : (o.eaveThickness ?? .24));
    rafters.position.set(x, y + H, z); rafters.rotation.y = rot;
    mesh.add(rafters);
  }
  rt.scene.add(mesh);
  const r = Math.max(w, d) / 2 + 0.6;
  const struct = rt.army.addStruct({ x, z, r, solidR: 0, hp, maxHp: hp, armor: 0.1, team, name, moraleOnBurn: 'big' });
  // 戦の進行と切り離した室内の建物は、兵の攻撃や放火の的にしない。
  if (o.noTarget) { struct.noTarget = true; struct.fireProof = true; }
  // 攻撃の届く半径と、壁の当たりを分ける。縁側は登れる床のまま残す。
  if (!IN) solidRect(x, z, w + 0.22, d + 0.22, rot).struct = struct;
  struct.mesh = mesh;
  return { mesh, decks, struct, hp, fire: true, naka: IN };
}

// 御殿の細工（kaito 10/2「天守の無い城の主殿がチープ」）：床を上げた束と土台・縁側（戸口の面）と縁束・
// 腰の舞良戸（黒い板）と上の明かり障子の格子・長押・入母屋の屋根（瓦か、天守の無い城は檜皮葺き＝厚い軒の茶の屋根）と妻の格子・棟
function gotenDress(B, P, x, y, z, w, d, rot, H, bays, ds, door, tile, eave = 1.3, eaveThickness = .24, fieldFort = false, boardRoof = false, iwamuraBoards = false, utilityBoardWalls = false, fieldBoards = null, odaniBoards = false) {
  const bw = w / bays;
  // 床下：土台と束（床の高さ 0.55m の下の暗がり）
  for (const lz of [-d / 2, d / 2]) { const [px, pz] = P(0, lz); _box(B.wood, 0x3a2c20, px, y + 0.2, pz, w + 0.1, 0.3, 0.2, rot); }
  for (const lx of [-w / 2, w / 2]) { const [px, pz] = P(lx, 0); _box(B.wood, 0x3a2c20, px, y + 0.2, pz, 0.2, 0.3, d + 0.1, rot); }
  { const [px, pz] = P(0, 0); _box(B.wood, 0x5a4634, px, y + 0.5, pz, w + 0.1, 0.1, d + 0.1, rot); }
  // 縁側：戸口の面に幅 1.2m の板縁、縁束と縁框
  { const lz = ds * (d / 2 + 0.6), [px, pz] = P(0, lz); _box(B.wood, 0x6a5440, px, y + 0.4, pz, w + 0.6, 0.08, 1.2, rot);
    const [fx, fz] = P(0, ds * (d / 2 + 1.18)); _box(B.wood, 0x3e2e22, fx, y + 0.34, fz, w + 0.6, 0.14, 0.12, rot);
    for (let i = 0; i <= bays; i++) { const [qx, qz] = P(-w / 2 + i * bw, ds * (d / 2 + 1.1)); _box(B.wood, 0x3a2c20, qx, y + 0.18, qz, 0.12, 0.36, 0.12, rot); } }
  // 戸口の面：腰の舞良戸（黒い板・横の桟）と、上の明かり障子（白い紙に格子）。戸口の間は空ける
  // 両の長い面（戸口の面と裏）に。裏は腰を土壁にし、上は格子窓（連子）
  for (const side of [ds, -ds]) {
  const fz0 = side * (d / 2 + 0.1);   // 壁の厚み（0.14）より外
  if (utilityBoardWalls) {
    // 番所・長屋・兵糧蔵を居館と同じ障子面にしない。戸口の実幅を空けた縦板張り。
    const spans = side === ds && door
      ? [[-w / 2, door.doorX - door.gapW / 2], [door.doorX + door.gapW / 2, w / 2]]
      : [[-w / 2, w / 2]];
    for (const [a, b] of spans) {
      const count = Math.max(1, Math.ceil((b - a) / .3));
      if (b <= a) continue;
      for (let j = 0; j < count; j++) {
        const [px, pz] = P(a + (j + .5) * (b - a) / count, fz0);
        _box(B.wood, [0x716654, 0x625848, 0x7a6b56, 0x685e4e][(j + (side > 0 ? 0 : 2)) % 4],
          px, y + 1.55, pz, (b - a) / count - .008, 2.15, .06, rot);
      }
      for (const yy of [.72, 2.48]) {
        const [px, pz] = P((a + b) / 2, fz0 + side * .04);
        _box(B.wood, 0x514737, px, y + yy, pz, b - a, .08, .08, rot);
      }
      // 板小屋の裏に小さな連子の明かり取り。戸口のある面には置かない。
      // 寸法は推定。ガラスや白い障子を足さず、既存の木材の束へ結合する。
      if (side !== ds && b - a > 1.5) {
        const mid = (a + b) / 2, height = 2.05;
        const [px, pz] = P(mid, fz0 + side * .05);
        _box(B.wood, 0x251f18, px, y + height, pz, .78, .46, .025, rot);
        for (const yy of [height - .25, height + .25])
          _box(B.wood, 0x514737, px, y + yy, pz, .9, .07, .12, rot);
        for (let k = -3; k <= 3; k++) {
          const [qx, qz] = P(mid + k * .12, fz0 + side * .09);
          _box(B.wood, k % 2 ? 0x786953 : 0x655744, qx, y + height, qz, .045, .46, .05, rot);
        }
      }
    }
    continue;
  }
  for (let i = 0; i < bays; i++) {
    const c0 = -w / 2 + i * bw + 0.12, c1 = c0 + bw - 0.24, cm = (c0 + c1) / 2;
    if (side === ds && door && cm > door.doorX - door.gapW && cm < door.doorX + door.gapW) continue;
    if (fieldFort) {
      // 河川砦の番所と長屋だけ。障子の代わりに縦板と小さな連子窓を張る。
      const count = Math.max(3, Math.round((c1 - c0) / .28));
      for (let j = 0; j < count; j++) {
        const [px, pz] = P(c0 + (j + .5) * (c1 - c0) / count, fz0);
        _box(B.wood, j % 3 === 0 ? 0x72604e : 0x635241, px, y + 1.55, pz, (c1 - c0) / count - .014, 2.15, .06, rot);
      }
      const [wx, wz] = P(cm, fz0 + side * .05);
      _box(B.wood, 0x211b15, wx, y + 2.05, wz, (c1 - c0) * .6, .48, .04, rot);
      for (let j = -2; j <= 2; j++) {
        const [px, pz] = P(cm + j * (c1 - c0) * .1, fz0 + side * .09);
        _box(B.wood, 0x87715a, px, y + 2.05, pz, .045, .52, .05, rot);
      }
      continue;
    }
    if (side !== ds && i % 2 === 1) {
      // 裏の一間おきに連子窓（黒い格子）
      const [px, pz] = P(cm, fz0); _box(B.wood, 0x1c1610, px, y + 1.9, pz, (c1 - c0) * 0.7, 0.8, 0.03, rot);
      for (let k = -3; k <= 3; k++) { const [gx, gz] = P(cm + k * (c1 - c0) * 0.1, fz0 + side * 0.02); _box(B.wood, 0x4a3a2c, gx, y + 1.9, gz, 0.05, 0.84, 0.05, rot); }
      continue;
    }
    if (side !== ds) continue;
    const ds2 = side;
    const [px, pz] = P(cm, fz0);
    _box(B.wood, 0x2e241c, px, y + 0.95, pz, c1 - c0, 0.8, 0.05, rot);
    for (const hy of [0.75, 1.05, 1.3]) _box(B.wood, 0x4a3a2c, px, y + hy, pz + 0, c1 - c0, 0.035, 0.07, rot);
    if (B.templePaper) {
      const paper = new THREE.PlaneGeometry(c1 - c0, 1.15);
      paper.rotateY(rot); paper.translate(px, y + 1.95, pz); B.templePaper.push(paper);
    } else _box(B.plaster, 0xf2eee2, px, y + 1.95, pz, c1 - c0, 1.15, 0.04, rot);
    const nv = Math.max(3, Math.round((c1 - c0) / 0.32));
    for (let k = 1; k < nv; k++) { const [gx, gz] = P(c0 + k * (c1 - c0) / nv, fz0 + ds2 * (B.templePaper ? .04 : .02)); _box(B.wood, 0x3a2c20, gx, y + 1.95, gz, 0.03, 1.15, 0.03, rot); }
    for (const hy of [1.55, 1.95, 2.35]) { const [gx, gz] = P(cm, fz0 + ds2 * (B.templePaper ? .04 : .02)); _box(B.wood, 0x3a2c20, gx, y + hy, gz, c1 - c0, 0.03, 0.03, rot); }
  }
  }
  if (utilityBoardWalls) for (const side of [-1, 1]) {
    // 妻側も同じ古板で閉じ、土壁のままの側面を残さない。共通の木材の束へ結合する。
    const count = Math.ceil(d / .3);
    for (let j = 0; j < count; j++) {
      const [px, pz] = P(side * (w / 2 + .1), -d / 2 + (j + .5) * d / count);
      _box(B.wood, j % 3 ? 0x685e4e : 0x7a6b56, px, y + 1.55, pz, .06, 2.15, d / count - .008, rot);
    }
  }
  // 長押と桁（四周）
  for (const lz of [-d / 2 - 0.06, d / 2 + 0.06]) { const [px, pz] = P(0, lz); _box(B.wood, 0x3e2e22, px, y + 2.62, pz, w + 0.3, 0.14, 0.08, rot); _box(B.wood, 0x3a2a1e, px, y + H - 0.05, pz, w + 0.6, 0.22, 0.22, rot); }
  for (const lx of [-w / 2 - 0.06, w / 2 + 0.06]) { const [px, pz] = P(lx, 0); _box(B.wood, 0x3a2a1e, px, y + H - 0.05, pz, 0.22, 0.22, d + 0.6, rot); }
  if (fieldFort) {
    // 仮設の切妻板葺き。板と押さえ桟は既存の材質別の束へ結合する。
    const rw = w + 1.2, rd = d + 1.2, pitch = .36;
    const n = Math.ceil(rw / .45), step = rw / n;
    for (let j = 0; j < n; j++) {
      if (fieldBoards) {
        // 棟から軒までの一枚板を三段に割る。上の板を軒側へ重ね、継ぎ目を互い違いにする。
        const slope = rd / 2 / Math.cos(pitch);
        const cuts = [0, .31 + (j % 2) * .06, .65 + (j % 2) * .06, 1];
        for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
          const a = cuts[row], b = Math.min(1, cuts[row + 1] + .06 / slope), t = (a + b) / 2;
          const g = partBox(step - .012, .07, slope * (b - a));
          g.rotateX(side * pitch);
          g.translate(-rw / 2 + (j + .5) * step,
            y + H + .08 + Math.tan(pitch) * rd / 2 * (1 - t) + (2 - row) * .025, side * rd / 2 * t);
          g.rotateY(rot); g.translate(x, 0, z);
          B.wood.push(_paint(g, fieldBoards[(j + row + (side > 0 ? 0 : 2)) % fieldBoards.length]));
        }
        continue;
      }
      const [px, pz] = P(-rw / 2 + (j + .5) * step, 0);
      _gable(B.wood, j % 4 === 0 ? 0x82705b : 0x6a5948, px, y + H + .08, pz, step - .012, rd, rot, pitch, .07);
    }
    if (fieldBoards) {
      const [px, pz] = P(0, 0);
      _box(B.wood, 0x5c5547, px, y + H + .19 + Math.tan(pitch) * rd / 2, pz, rw + .15, .12, .28, rot);
    }
    for (const side of [-1, 1]) for (const t of [.3, .72]) {
      const lz = side * rd * t / 2, [px, pz] = P(0, lz);
      _box(B.wood, 0x493b2d, px, y + H + .16 + Math.tan(pitch) * (rd / 2 - Math.abs(lz)), pz, rw + .15, .09, .09, rot);
    }
    // 板小屋の妻を屋根裏まで板で閉じる。
    // 上端を勾配に切り、側面から屋根の下の空が透ける三角の隙間をなくす。
    const boards = Math.ceil(d / .32), bw = d / boards;
    for (const side of [-1, 1]) {
      for (let j = 0; j < boards; j++) {
        const lz = -d / 2 + (j + .5) * bw, g = partBox(.1, 1, bw - .012);
        const pos = g.attributes.position;
        for (let k = 0; k < pos.count; k++) {
          const zz = lz + pos.getZ(k);
          pos.setY(k, pos.getY(k) > 0 ? .08 + Math.tan(pitch) * (rd / 2 - Math.abs(zz)) - .05 : -.1);
        }
        g.computeVertexNormals(); g.translate(side * (w / 2 + .03), y + H, lz);
        g.rotateY(rot); g.translate(x, 0, z);
        B.wood.push(_paint(g, fieldBoards ? fieldBoards[(j + (side > 0 ? 1 : 3)) % fieldBoards.length] : j % 3 === 0 ? 0x796a57 : 0x665746));
      }
      // 妻端の破風板。白い漆喰や瓦の飾りは足さない。
      for (const slope of [-1, 1]) {
        const g = partBox(.14, .16, rd / 2 / Math.cos(pitch) + .15);
        g.rotateX(slope * pitch);
        g.translate(side * rw / 2, y + H + .08 + Math.tan(pitch) * rd / 4, slope * rd / 4);
        g.rotateY(rot); g.translate(x, 0, z); B.wood.push(_paint(g, 0x514737));
      }
    }
    return;
  }
  // 指定した主殿・屋敷・長屋・蔵・番所だけ、低い切妻の板葺き。床と戸口は共通のまま。
  if (boardRoof && !tile) {
    const ex = w / 2 + .65, ez = d / 2 + .65, rh = ez * .42;
    const slope = Math.hypot(ez, rh), angle = Math.atan2(rh, ez), count = Math.ceil(ex * 2 / .45);
    // 岩村・小谷と重ね葺きを指定した高画質だけ、一枚板を三段の重ね葺きにする。
    // 全棟を同じ灰褐色の板で描き、列ごとの継ぎ目をずらす。既存の木材の結合に含める。
    const colors = iwamuraBoards ? [0x736c5d, 0x625e52, 0x877963, 0x6b6557] : [0x756451, 0x6b5b4b, 0x80705c, 0x675747];
    const layered = iwamuraBoards || odaniBoards;
    for (const side of [-1, 1]) {
      for (let i = 0; i < count; i++) {
        const cuts = layered ? [0, .31 + (i % 2) * .06, .66 + (i % 2) * .06, 1] : [0, 1];
        for (let j = 0; j < cuts.length - 1; j++) {
          // 上の板の軒側を四センチ重ね、棟に近い板ほど少し上げる。
          const start = cuts[j], end = Math.min(1, cuts[j + 1] + (layered ? .04 / slope : 0));
          const t = (start + end) / 2;
          const slab = new THREE.BoxGeometry(ex * 2 / count - .008, .075, slope * (end - start));
          // 岩村は建物ごとに色の出方を変え、斜めの四色縞を作らない。
          const seed = Math.abs(Math.sin(i * 127.1 + j * 311.7 + side * 43.3 + x * .71 + z * .37));
          const g = _paint(slab, colors[iwamuraBoards ? Math.floor(seed * 1000) % 4 : (i + j + (side > 0 ? 0 : 2)) % 4]);
          slab.dispose();
          if (odaniBoards) {
            // 小谷の主屋だけ、重ね板の下端に雨染み。元の頂点色で描き、絵と材質を増やさない。
            const p = g.attributes.position, c = g.attributes.color;
            for (let v = 0; v < p.count; v++) {
              const wet = p.getZ(v) * side > 0 ? .74 : 1;
              const fade = wet * (.94 + ((i * 7 + j * 3) % 5) * .025);
              c.setXYZ(v, c.getX(v) * fade, c.getY(v) * fade, c.getZ(v) * fade);
            }
          }
          g.rotateX(side * angle);
          g.translate(-ex + (i + .5) * ex * 2 / count, H + .08 + rh * (1 - t) + (layered ? (2 - j) * .025 : 0), side * ez * t);
          g.rotateY(rot); g.translate(x, y, z);
          if (iwamuraBoards) {
            // 頂点色だけで軒側の雨染みと北面のくすみを付ける。面数は増やさない。
            const positions = g.attributes.position, tint = g.attributes.color;
            for (let k = 0; k < positions.count; k++) {
              const localZ = (positions.getX(k) - x) * Math.sin(rot) + (positions.getZ(k) - z) * Math.cos(rot);
              const wet = Math.min(1, Math.abs(localZ) / ez);
              const shade = (side < 0 ? .94 : 1) * (1 - wet * wet * .22);
              tint.setXYZ(k, tint.getX(k) * shade, tint.getY(k) * shade, tint.getZ(k) * shade);
            }
          }
          B.wood.push(g);
        }
      }
      // 葺き板を押さえる横木。軒先は一段暗くする。
      for (const t of [.38, .83]) {
        const [px, pz] = P(0, side * ez * t);
        _box(B.wood, t > .5 ? 0x4f463a : 0x5c4d3c, px, y + H + .16 + rh * (1 - t), pz, ex * 2 + .1, .09, .1, rot);
      }
    }
    for (const side of [-1, 1]) {
      if (iwamuraBoards) {
        // 妻壁を一枚の三角面にせず、屋根勾配に切った縦板で閉じる。
        const boards = Math.ceil(d / .34), step = d / boards;
        for (let i = 0; i < boards; i++) {
          const lz = -d / 2 + (i + .5) * step, g = partBox(.1, 1, step - .009);
          const p = g.attributes.position;
          for (let k = 0; k < p.count; k++) {
            const zz = lz + p.getZ(k);
            p.setY(k, p.getY(k) > 0 ? .08 + rh - Math.abs(zz) * .42 - .025 : -.04);
          }
          g.computeVertexNormals(); g.translate(side * (w / 2 + .025), H, lz);
          g.rotateY(rot); g.translate(x, y, z);
          B.wood.push(_paint(g, colors[(i * 7 + Math.floor(Math.abs(x + z))) % 4]));
        }
        const [px, pz] = P(side * (w / 2 + .09), 0);
        _box(B.wood, 0x514737, px, y + H + .04, pz, .14, .12, d, rot);
        continue;
      }
      const a = P(side * w / 2, -d / 2), b = P(side * w / 2, d / 2), c = P(side * w / 2, 0);
      // 軒の出の分だけ妻壁も上げ、葺き板の裏との隙間を塞ぐ。
      const rise = .08 + .65 * .42, [px, pz] = P(side * w / 2, 0);
      _box(B.wood, 0x62503d, px, y + H + rise / 2, pz, .1, rise, d, rot);
      const g = new THREE.BufferGeometry();
      const v = [a[0], y + H + rise, a[1], b[0], y + H + rise, b[1], c[0], y + H + .08 + rh, c[1]];
      g.setAttribute('position', new THREE.Float32BufferAttribute([...v, ...v.slice(6), ...v.slice(3, 6), ...v.slice(0, 3)], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2)); g.computeVertexNormals();
      B.wood.push(_paint(g, 0x62503d));
    }
    _box(B.wood, 0x514332, x, y + H + rh + .14, z, ex * 2 + .2, .14, .22, rot);
    return;
  }
  // 入母屋の屋根：反りのある寄棟の面（hipGeo）＋上の妻。檜皮は茶の厚い屋根、瓦は瓦の絵
  const ex = w / 2 + eave, ez = d / 2 + eave, rh = ez * (tile ? 0.62 : 0.78), rl = Math.max(0.6, ex - ez * 0.55);
  const g = hipGeo(ex, ez, rh, 0, rl, tile ? undefined : 0.22, eaveThickness);
  g.rotateY(rot); g.translate(x, y + H + 0.08, z);
  const roofCol = tile ? 0xffffff : 0x6b4a36;
  (tile ? B.tile : B.templeBoard || B.wood).push(_paint(g, B.templeBoard && !tile ? 0xffffff : roofCol));
  // 妻：棟の両の端に、格子を張った三角（入母屋の上の切妻）
  const t0 = 0.5, gy = y + H + 0.08 + rh * (0.5 * t0 + 0.5 * t0 * t0), gh = y + H + 0.08 + rh - gy, gw = ez * (1 - t0) * 2 * 0.9;
  for (const sx of [-1, 1]) {
    const [px, pz] = P(sx * (rl + 0.02), 0);
    const tri = new THREE.BufferGeometry(), cr = Math.cos(rot + Math.PI / 2), sr = Math.sin(rot + Math.PI / 2);
    const v = [[-gw / 2, 0], [gw / 2, 0], [0, gh]].map(([lx, ly]) => [px + lx * cr, gy + ly, pz - lx * sr]);
    tri.setAttribute('position', new THREE.Float32BufferAttribute([...v[0], ...v[1], ...v[2], ...v[0], ...v[2], ...v[1]], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2)); tri.computeVertexNormals();
    B.wood.push(_paint(tri, 0x3a2c20));
    for (let k = -2; k <= 2; k++) { const [qx, qz] = P(sx * (rl + 0.06), k * gw / 6); _box(B.wood, 0x5a4634, qx, gy + gh * (1 - Math.abs(k) / 3) / 2, qz, 0.04, gh * (1 - Math.abs(k) / 3), 0.04, rot); }
  }
  { const [px, pz] = P(0, 0); _box(tile ? B.tile : B.wood, tile ? 0x3a3836 : 0x3e2c20, px, y + H + 0.08 + rh + 0.12, pz, rl * 2 + 0.4, 0.28, 0.4, rot); }
}

// 長屋：白壁と下見板の長い平屋、戸口を並べる（足軽の住まい・城の蔵）。docs 5-2
export function nagaya(rt, x, z, w = 14, d = 5, rot = 0, o = {}) {
  const { tile = false, team = 0, hp = 480 } = o;
  const y = rt.world.heightAt(x, z);
  const H = 2.5;
  const B = _kitBag();
  _box(B.shitami, 0x8a8580, x, y + H * 0.45, z, w + 0.1, H * 0.9, d + 0.1, rot);
  _box(B.plaster, 0xd6cfbe, x, y + H * 0.85, z, w, H * 0.4, d, rot);
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const n = Math.max(2, Math.round(w / 3.2));
  for (let k = 0; k < n; k++) {
    const lx = -w / 2 + (k + 0.5) * (w / n);
    const [dx, dz] = P(lx, d / 2 + 0.02);
    _box(B.wood, 0x2a2018, dx, y + H * 0.5, dz, 0.9, H * 0.7, 0.05, rot);
  }
  _gable(B.tile, tile ? 0xffffff : 0x6a5a44, x, y + H + 0.3, z, w + 1.2, d + 1.4, rot, 0.4, 0.12);
  const mesh = _kitMesh(B);
  rt.scene.add(mesh);
  const r = Math.max(w, d) / 2 + 0.5;
  const struct = rt.army.addStruct({ x, z, r, solidR: r, hp, maxHp: hp, armor: 0, team, name: '長屋' });
  struct.mesh = mesh;
  return { mesh, struct, hp, fire: true };
}
