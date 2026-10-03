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
  jinmaku, hut, tawara, makeSimpleBatch, finalizeSimpleBatch, hipGeo,
} from './props.js';
import { addDeck, addLadder, addWall, FL } from './floors.js';
import { addInterior } from './naka.js';
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
  const mesh = yagura(W, x, z);
  // 置き忘れを防ぐ（castle_plan の櫓・木ノ芽・信貴山で床の上の兵だけが宙に浮いていた）。呼び手がもう一度 add しても一つのまま
  if (rt.scene) rt.scene.add(mesh);
  const y0 = W.heightAt(x, z);
  const H = 6.6;                 // yagura() の床の高さ（props.js 427 の floor と同じ値）
  const half = 1.45;             // 床のふち（2.9m 角の半分）
  const topY = y0 + H;
  const deckId = addDeck({ x0: x - half, x1: x + half, z0: z - half, z1: z + half, y: topY, name: o.name || '物見櫓', roof: topY + 2.1 });
  // 梯子は yagura() の絵と同じく、塔の +z 側の足もとから床の縁へ掛かる
  const foot = { x, z: z + 2.9 };
  const ladderId = addLadder({ x: foot.x, z: foot.z, y0: W.heightAt(foot.x, foot.z), y1: topY, deck: deckId, hp: o.hp ?? 30, team: o.team, name: '物見櫓の梯子' });
  // 床の縁を、床より高い者だけ通さない当たりに（武者走りと同じ考え：下から見れば柱と板塀で塞がっている）
  addWall({ ax: x - half, az: z - half, bx: x + half, bz: z - half, r: 0.35, y0, y1: topY - 0.3 });
  addWall({ ax: x + half, az: z - half, bx: x + half, bz: z + half, r: 0.35, y0, y1: topY - 0.3 });
  addWall({ ax: x + half, az: z + half, bx: x - half, bz: z + half, r: 0.35, y0, y1: topY - 0.3 });
  addWall({ ax: x - half, az: z + half, bx: x - half, bz: z - half, r: 0.35, y0, y1: topY - 0.3 });
  return { mesh, deckId, ladderId, topY, x, z, foot };
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
  const structs = wallLike(rt, pts, palisade, { hp, name: '柵', sama: 1.5, ...o, batch });
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
    decks.push(addDeck({ x0: -len / 2, x1: len / 2, z0: -w * 0.3, z1: w * 0.3, cx: mx, cz: mz, rot, y, name }));
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
  return (x, z) => {
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
  const { hp = 380, name = '冠木門' } = o;
  const s = gateStruct(rt, x, z, w, rot, o, hp, name);
  const frame = kabukimon(rt.world, x, z, w + 0.4, rot, { doors: false });
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
  const y0 = rt.world.heightAt(x, z);
  const topY = y0 + 3.95;
  const Lw = w + 5.6, half2 = 2.0;
  const nx = Math.sin(rot), nz = Math.cos(rot);
  let deckId, IN = null;
  if (inside) {
    // 渡櫓の中（naka.js。kaito 10/2）：内の側（+z）の端に戸口と、地面から上がる雁木の段。窓は外の格子窓と同じ所
    IN = addInterior(rt.world, {
      name: o.name || '櫓門', kind: 'gate', x, z, rot, levels: [{ y: topY, w: Lw - 0.4, d: 3.6, h: 2.0 }],
      door: { side: 1, lx: Lw / 2 - 1.2, w: 1.1 }, approach: { pad: 0.5, len: 4.2 },
      wins: () => [-1, 0, 1].flatMap((q) => [-1, 1].map((sd) => ({ face: 'z', s: sd, t: q * 2.4, w: 1.0, y0: 1.2, y1: 1.7 }))),
    });
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
  const inner = yaguraGate(rt, ix, iz, w2, rot + turn * Math.PI / 2, { team: o.team, hp: o.hp2, gate: (o.gate ?? 0) + 1 });
  return { outer, inner, walls, choke: w1, plaza: { x: cx, z: cz } };
}

// 土塀（狭間）：props.js の dobei() を区画に分け、壊せる区画ごとに撃つ所（sama）を添える。docs 5-2
export function dobeiLine(rt, pts, o = {}) {
  const hp = o.hp ?? 500;
  const meshOpt = { h: o.h, samaStep: o.samaStep, hikae: o.hikae, tera: o.tera };
  const structs = wallLike(rt, pts, dobei, { hp, name: o.name || '土塀', sama: o.sama ?? 1.8, segLen: o.segLen ?? 8, closed: o.closed, gaps: o.gaps, team: o.team, meshOpt });
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
    IN = addInterior(rt.world, {
      name: '隅櫓', kind: 'yagura', x, z, rot,
      levels: [{ y: deck1Y, w: w * 0.96, d: d * 0.96, h: 2.95 }, { y: deck2Y, w: w * 0.7, d: d * 0.7, h: 2.1 }],
      door: { side: 1, lx: -w * 0.18, w: 1.1 }, approach: { pad: 0.8 + 0.02 * d + 0.55, len: Math.max(2.4, base * 1.15) },
      wins: (lv, k) => (k === 0 ? [-1, 1].flatMap((q) => [-1, 1].map((sd) => ({ face: 'z', s: sd, t: q * w * 0.25, w: 0.9, y0: 2.2, y1: 2.7 })))
        : [-1, 1].map((sd) => ({ face: 'z', s: sd, t: 0, w: 1.1, y0: 1.08, y1: 1.62 }))),
    });
    [deck1, deck2] = IN.deckIds;
  } else {
    deck1 = addDeck({ x0: -w1 / 2, x1: w1 / 2, z0: -d1 / 2, z1: d1 / 2, rot, cx: x, cz: z, y: deck1Y, name: '隅櫓 一階' });
    deck2 = addDeck({ x0: -w2 / 2, x1: w2 / 2, z0: -d2 / 2, z1: d2 / 2, rot, cx: x, cz: z, y: deck2Y, name: '隅櫓 二階' });
  }
  // 狭間の前の立ち所（perch.js）：二階の外（-z）の窓・一階の外の窓・二階の内の窓の順。筒先が窓から出る
  const loopSpots = inside ? [[0, -(d * 0.35 - 0.42), deck2Y, Math.PI], [w * 0.25, -(d * 0.48 - 0.45), deck1Y, Math.PI], [-w * 0.25, -(d * 0.48 - 0.45), deck1Y, Math.PI], [0, d * 0.35 - 0.42, deck2Y, 0]]
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
  // 中に入れる時は丸い当たりを外す（台の当たりは props の四角が持つ。上がった先は中を歩ける）
  const struct = rt.army.addStruct({ x, z, r, solidR: inside ? 0 : r, hp, maxHp: hp, armor: 0.15, team, name: '隅櫓' });
  struct.mesh = mesh;
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
  if (!_mizuboriMat) _mizuboriMat = SETTINGS.quality === 'low' ? new THREE.MeshLambertMaterial({ color: 0x2c3a36, transparent: true, opacity: 0.92 }) : new THREE.MeshStandardMaterial({ color: 0x2c3a36, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.92 });
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
function _box(list, hex, x, y, z, w, h, d, rot = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  list.push(_paint(g, hex));
}
function _gable(list, hex, x, y, z, w, d, rot, pitch = 0.42, th = 0.14) {
  for (const sgn of [-1, 1]) {
    const half = d / 2 / Math.cos(pitch);
    const g = new THREE.BoxGeometry(w, th, half + 0.3);
    g.rotateX(sgn * pitch);
    g.translate(0, y + Math.sin(pitch) * half / 2, sgn * d / 4);
    g.rotateY(rot); g.translate(x, 0, z);
    list.push(_paint(g, hex));
  }
  const ridge = new THREE.BoxGeometry(w + 0.2, 0.2, 0.3);
  ridge.translate(0, y + Math.tan(pitch) * d / 2 + 0.06, 0);
  ridge.rotateY(rot); ridge.translate(x, 0, z);
  list.push(_paint(ridge, 0x2a2828));
}
function _kitBag() { return { wood: [], plaster: [], tile: [], shitami: [] }; }
function _kitMesh(B) {
  const grp = new THREE.Group();
  for (const k of Object.keys(B)) {
    if (!B[k].length) continue;
    const m = new THREE.Mesh(mergeGeometries(B[k]), castleMat(k));
    m.castShadow = true; m.receiveShadow = true; m.userData.camBlock = true;
    grp.add(m);
  }
  return grp;
}

// 御殿：柱と縁、開け放った明かり障子、瓦（か古い城は板）の入母屋の屋根。本丸の奥、城将の居所。docs 5-2
// o: { w=12, d=8, rot=0, tile=true, hp, team }
export function goten(rt, x, z, o = {}) {
  const { w = 12, d = 8, rot = 0, tile = true, team = 0, hp = 900, name = '御殿' } = o;
  const y = rt.world.heightAt(x, z);
  const H = 3.0;
  const B = _kitBag();
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const bays = Math.max(2, Math.round(w / 3));
  for (let i = 0; i <= bays; i++) {
    const [px, pz] = P(-w / 2 + i * (w / bays), -d / 2);
    _box(B.wood, 0x4e3a28, px, y + H / 2, pz, 0.22, H, 0.22, rot);
    const [px2, pz2] = P(-w / 2 + i * (w / bays), d / 2);
    _box(B.wood, 0x4e3a28, px2, y + H / 2, pz2, 0.22, H, 0.22, rot);
  }
  // 中に入れる御殿（o.naka）は、戸口の面の壁に口を開ける（戸口は柱の間の真ん中）
  const ds = o.door ?? 1, doorX = o.doorX ?? (w / bays) / 2, gapW = 1.6;
  const wallZ = (lz, ww, th, hex) => {
    if (!o.naka || Math.sign(lz) !== ds) { const [qx, qz] = P(0, lz); _box(B.plaster, hex, qx, y + H * 0.55, qz, ww, H * 0.75, th, rot); return; }
    const a0 = -ww / 2, a1 = doorX - gapW / 2, b0 = doorX + gapW / 2, b1 = ww / 2, y0 = y + H * 0.55 - H * 0.375, y1 = y + H * 0.55 + H * 0.375;
    for (const [t0, t1] of [[a0, a1], [b0, b1]]) { const [qx, qz] = P((t0 + t1) / 2, lz); _box(B.plaster, hex, qx, (y0 + y1) / 2, qz, t1 - t0, y1 - y0, th, rot); }
    const [qx, qz] = P(doorX, lz); _box(B.plaster, hex, qx, (y + 2.6 + y1) / 2, qz, gapW, y1 - y - 2.6, th, rot);
  };
  wallZ(-d / 2, w, 0.14, 0xe0d8c6);
  for (const sd of [-1, 1]) {
    const [sx, sz] = P(sd * w / 2, 0);
    _box(B.plaster, 0xefe9da, sx, y + H * 0.55, sz, 0.14, H * 0.75, d, rot);
  }
  wallZ(d / 2 - 0.08, w * 0.94, 0.08, 0xefe9da);
  const decks = [];
  let IN = null;
  if (o.naka) {
    // 中に入れる御殿（naka.js。kaito 10/2）：戸口（o.door：+1 は縁側の面、-1 は裏の面）・奥の間の襖・明かり障子。
    // 城主はふつう奥の間（天守の無い城の「大将の居場所」）
    IN = addInterior(rt.world, {
      name, kind: 'goten', x, z, rot, levels: [{ y: y + 0.55, w: w - 0.3, d: d - 0.3, h: H - 0.1 }],
      door: { side: ds, lx: doorX, w: 1.4 }, approach: { pad: 0.35, len: 1.1 }, oku: o.oku ?? 0.45, where: o.where,
    });
    decks.push(...IN.deckIds);
  } else {
    decks.push(addDeck({ x0: -w / 2 - 0.1, x1: w / 2 + 0.1, z0: d / 2 - 0.1, z1: d / 2 + 1.3, rot, cx: x, cz: z, y: y + 0.42, name: `${name}の縁側` }));
    decks.push(addDeck({ x0: -w / 2 - 0.1, x1: w / 2 + 0.1, z0: -d / 2 - 0.1, z1: d / 2 + 0.1, rot, cx: x, cz: z, y: y + 0.55, name }));
  }
  gotenDress(B, P, x, y, z, w, d, rot, H, bays, ds, o.naka ? { doorX, gapW } : null, tile);
  const mesh = _kitMesh(B);
  rt.scene.add(mesh);
  const r = Math.max(w, d) / 2 + 0.6;
  const struct = rt.army.addStruct({ x, z, r, solidR: IN ? 0 : r, hp, maxHp: hp, armor: 0.1, team, name, moraleOnBurn: 'big' });
  struct.mesh = mesh;
  return { mesh, decks, struct, hp, fire: true, naka: IN };
}

// 御殿の細工（kaito 10/2「天守の無い城の主殿がチープ」）：床を上げた束と土台・縁側（戸口の面）と縁束・
// 腰の舞良戸（黒い板）と上の明かり障子の格子・長押・入母屋の屋根（瓦か、天守の無い城は檜皮葺き＝厚い軒の茶の屋根）と妻の格子・棟
function gotenDress(B, P, x, y, z, w, d, rot, H, bays, ds, door, tile) {
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
  for (let i = 0; i < bays; i++) {
    const c0 = -w / 2 + i * bw + 0.12, c1 = c0 + bw - 0.24, cm = (c0 + c1) / 2;
    if (side === ds && door && cm > door.doorX - door.gapW && cm < door.doorX + door.gapW) continue;
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
    _box(B.plaster, 0xf2eee2, px, y + 1.95, pz, c1 - c0, 1.15, 0.04, rot);
    const nv = Math.max(3, Math.round((c1 - c0) / 0.32));
    for (let k = 1; k < nv; k++) { const [gx, gz] = P(c0 + k * (c1 - c0) / nv, fz0 + ds2 * 0.02); _box(B.wood, 0x3a2c20, gx, y + 1.95, gz, 0.03, 1.15, 0.03, rot); }
    for (const hy of [1.55, 1.95, 2.35]) { const [gx, gz] = P(cm, fz0 + ds2 * 0.02); _box(B.wood, 0x3a2c20, gx, y + hy, gz, c1 - c0, 0.03, 0.03, rot); }
  }
  }
  // 長押と桁（四周）
  for (const lz of [-d / 2 - 0.06, d / 2 + 0.06]) { const [px, pz] = P(0, lz); _box(B.wood, 0x3e2e22, px, y + 2.62, pz, w + 0.3, 0.14, 0.08, rot); _box(B.wood, 0x3a2a1e, px, y + H - 0.05, pz, w + 0.6, 0.22, 0.22, rot); }
  for (const lx of [-w / 2 - 0.06, w / 2 + 0.06]) { const [px, pz] = P(lx, 0); _box(B.wood, 0x3a2a1e, px, y + H - 0.05, pz, 0.22, 0.22, d + 0.6, rot); }
  // 入母屋の屋根：反りのある寄棟の面（hipGeo）＋上の妻。檜皮は茶の厚い屋根、瓦は瓦の絵
  const ex = w / 2 + 1.3, ez = d / 2 + 1.3, rh = ez * (tile ? 0.62 : 0.78), rl = Math.max(0.6, ex - ez * 0.55);
  const g = hipGeo(ex, ez, rh, 0, rl, tile ? undefined : 0.22);
  g.rotateY(rot); g.translate(x, y + H + 0.08, z);
  const roofCol = tile ? 0xffffff : 0x6b4a36;
  (tile ? B.tile : B.wood).push(_paint(g, roofCol));
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
