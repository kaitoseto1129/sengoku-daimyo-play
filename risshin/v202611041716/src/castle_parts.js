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
import { nodaEntryDepth, interiorLayout, interiorSideShojiWindows, interiorWindowsClearOfFittings, interiorWindowFloorY } from './interior_layouts.js';
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
  if (batch) { toneBatch(batch, toneOf(rt, o), 'wood'); finalizeSimpleBatch(rt, batch); }   // o.season・o.age で季節と古び
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
  if (batch) { toneBatch(batch, toneOf(rt, o), 'wood'); finalizeSimpleBatch(rt, batch); }
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
  if (batch) { toneBatch(batch, toneOf(rt, o), 'earth'); finalizeSimpleBatch(rt, batch); }
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
// 土の砦・陣城の部品の棚（ui/parts_fort・kaito 10/28「共通の部品を先に作り、城・砦はそれを並べるだけ」）
// 丸太の柵（fence・乱杭 rankui・二重柵 nijuSaku）・冠木門 kabukiGate・木戸 kido・井楼 seiro（monomi）・
// 土塁 doruiLine・切岸 kirigishiHeight/kirigishiFace・空堀 horiboriHeight・逆茂木 sakamogiRow・竹束 takatabaRow・
// 土嚢（土俵）donouRow・陣小屋 jingoya・陣幕 jinmakuBox（honjin）・篝火台 kagaribiRow・狭間のある板塀 itabei。
// 一覧は FORT_PARTS（名から部品を引く棚）。
// 土の色と古びは戦の季節に合わせる：fortTone(rt, o) が def.season・def.snow・def.date の月から
// 春夏秋冬を決め、o.age（0＝普請したて〜1＝古い）で木の古びを決める。部品に o.season か o.age を渡すと
// その色にそろう（渡さない今の戦の見た目は変えない）。
// 同じ形は使い回し（InstancedMesh か makeSimpleBatch の束＝遠くは粗い形の三段）、毎コマ new しない。
// ======================================================================
import { pointedStakeGeo, kagaribi, kagaribiBatch, castleBoardFence, solidSeg, pushSimpleBatch } from './props.js';

const MONTHS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
// 季節ごとの土・草・霜（土は乾くほど明るく黄ばみ、冬は湿って暗い。草は夏が濃く、秋は枯れ色、冬は褪せる）
const FORT_SEASON = {
  春: { soil: 0x6f5a41, grass: 0x637b3c, frost: 0 },
  夏: { soil: 0x77614a, grass: 0x56783a, frost: 0 },
  秋: { soil: 0x86704f, grass: 0x847a48, frost: 0 },
  冬: { soil: 0x5d5245, grass: 0x6f6d5c, frost: 0.35 },
};
function fortSeasonOf(rt, o) {
  if (o.season && FORT_SEASON[o.season]) return o.season;
  const def = (rt && rt.world && rt.world.def) || (rt && rt.def) || {};
  if (FORT_SEASON[def.season]) return def.season;
  if (def.snow) return '冬';
  let d = def.date;
  try { if (typeof d === 'function') d = d(rt); } catch (e) { d = null; }
  const m = typeof d === 'string' && d.match(/(十[一二]|[一二三四五六七八九十])月/);
  if (m) { const n = MONTHS.indexOf(m[1]) + 1; return n <= 3 ? '春' : n <= 6 ? '夏' : n <= 9 ? '秋' : '冬'; }
  return '夏';
}
// 色の決まり：{ season, soil, grass, frost, age, wood }（wood は木の色の掛け目の目当て）
export function fortTone(rt, o = {}) {
  const season = fortSeasonOf(rt, o), S = FORT_SEASON[season];
  const age = Math.max(0, Math.min(1, o.age ?? rt?.world?.def?.fortAge ?? 0.5));
  const wNew = new THREE.Color(0xa38b66), wOld = new THREE.Color(0x60594f);
  return {
    season, age, frost: S.frost,
    soil: new THREE.Color(S.soil), grass: new THREE.Color(S.grass),
    wood: wNew.clone().lerp(wOld, age),
  };
}
const _tc = new THREE.Color(), _lum = (c) => c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
// 形の頂点の色を季節・古びへ寄せる（その場で書き換える）。kind：'wood'（木）・'earth'（土と草）
function toneGeo(geo, T, kind = 'wood') {
  const col = geo.attributes.color, pos = geo.attributes.position;
  if (!col) return geo;
  let y0 = Infinity, y1 = -Infinity;
  if (T.frost) for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
  for (let i = 0; i < col.count; i++) {
    _tc.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    const lum = _lum(_tc);
    if (kind === 'earth') {
      // 草（緑が勝つ所）は季節の草へ、土は季節の土へ。元の明るさの差は残す
      const ref = _tc.g > _tc.r * 1.04 ? T.grass : T.soil, k = lum / (_lum(ref) || 1e-3);
      _tc.lerp({ r: ref.r * k, g: ref.g * k, b: ref.b * k }, 0.7);
    } else {
      // 木：新しいほど明るい生木の色、古いほど灰に褪せて暗い（明るさは元の 0.75〜1.25 倍まで）
      const k = Math.min(1.25, Math.max(0.75, _lum(T.wood) / (lum || 1e-3))) * lum / (_lum(T.wood) || 1e-3);
      _tc.lerp({ r: T.wood.r * k, g: T.wood.g * k, b: T.wood.b * k }, 0.25 + Math.abs(T.age - 0.5) * 0.7);
    }
    // 冬：上を向いた高い所に霜の白
    if (T.frost && y1 > y0) { const u = (pos.getY(i) - y0) / (y1 - y0); if (u > 0.7) _tc.lerp({ r: 0.86, g: 0.87, b: 0.88 }, T.frost * (u - 0.7) / 0.3); }
    col.setXYZ(i, _tc.r, _tc.g, _tc.b);
  }
  col.needsUpdate = true;
  return geo;
}
// 束（makeSimpleBatch）の中の形を、仕上げ（finalizeSimpleBatch）の前に色合わせする
function toneBatch(batch, T, kind) { if (batch && T) for (const list of batch.byMat.values()) for (const { geo } of list) toneGeo(geo, T, kind); }
function wantsTone(o) { return o.season != null || o.age != null || o.tone; }
function toneOf(rt, o) { return o.tone || (wantsTone(o) ? fortTone(rt, o) : null); }

// 線の点の並びを横へずらす（角は二つの辺の向きの間をとる）。side=+1 は (-dz, dx) の向き＝wallLike の nx・nz と同じ側
function offsetPts(pts, d, closed = false) {
  const n = pts.length, out = [];
  const nrm = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; return [-dz / L, dx / L]; };
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? pts[i - 1] : closed ? pts[n - 1] : null, next = i < n - 1 ? pts[i + 1] : closed ? pts[0] : null;
    const a = prev ? nrm(prev, pts[i]) : null, b = next ? nrm(pts[i], next) : null;
    let mx = (a ? a[0] : 0) + (b ? b[0] : 0), mz = (a ? a[1] : 0) + (b ? b[1] : 0);
    const L = Math.hypot(mx, mz) || 1; mx /= L; mz /= L;
    const ref = a || b, cos = Math.max(0.5, mx * ref[0] + mz * ref[1]);
    out.push([pts[i][0] + mx * d / cos, pts[i][1] + mz * d / cos]);
  }
  return out;
}
// 線に沿って間合い step ごとに点を配る（u：線の頭からの長さ・t：向き・n：横の向き）
function alongPts(pts, step, closed, fn) {
  const P = closed ? [...pts, pts[0]] : pts;
  let carry = step * 0.5, k = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1e-6, tx = (bx - ax) / len, tz = (bz - az) / len;
    let u = carry;
    for (; u < len; u += step) fn(ax + tx * u, az + tz * u, tx, tz, -tz, tx, k++);
    carry = u - len;
  }
}
const _h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

// 乱杭：先を削った杭を、柵や土塁の外へ帯に乱れ打ちした障害（杭は外へ傾く）。描く回数は三つ（杭の形三色の InstancedMesh）。
// o: { depth=2.4（帯の幅）, density=1.8（1m あたりの本数）, h=1.3, lean=0.5（外への傾き）, side=1（帯を出す側）, closed, season, age }
// 戻り値：{ mesh, slow(x, z)（帯の中は 0.6・騎馬の側で掛け目に使う）, band }
export function rankui(rt, pts, o = {}) {
  const { depth = 2.4, density = 1.8, h = 1.3, lean = 0.5, side = 1, closed = false } = o;
  const W = rt.world, T = fortTone(rt, o), grp = new THREE.Group(); grp.name = '乱杭';
  const spots = [[], [], []];
  alongPts(pts, 1 / density, closed, (x, z, tx, tz, nx, nz, k) => {
    const r1 = _h(x, z), r2 = _h(z, x + 3), r3 = _h(x + k, 7);
    const off = (0.3 + r1 * depth) * side, px = x + nx * off + tx * (r2 - 0.5) * 0.5, pz = z + nz * off + tz * (r2 - 0.5) * 0.5;
    spots[k % 3].push([px, pz, nx * side, nz * side, h * (0.65 + r3 * 0.6), r2]);
  });
  const mat = castleMat('wood'), ref = new THREE.Color(0x6e6556), qy = new THREE.Quaternion();
  spots.forEach((list, key) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(pointedStakeGeo(key), mat, list.length);
    list.forEach(([x, z, ox, oz, hh, r], i) => {
      // 杭の頭を外へ倒す：軸 (oz, -ox)…外向きに直角な水平の軸で回す
      const a = lean * (0.6 + r * 0.8);
      _q.setFromAxisAngle(_v.set(oz, 0, -ox).normalize(), a);
      _q.multiply(qy.setFromAxisAngle(_v.set(0, 1, 0), r * 6.28));
      const y = W.heightAt(x, z) + hh * 0.5 - 0.25;
      _m4.compose(_s.set(x, y, z), _q, new THREE.Vector3(1 + r * 0.4, hh, 1 + r * 0.4));
      im.setMatrixAt(i, _m4);
      // 古び：杭ごとに少し色を散らし、季節の土の跳ねで根元を汚す（全体の色は木の目当てへ寄せる）
      const k = 0.85 + r * 0.3;
      im.setColorAt(i, _tc.setRGB((1 + (T.wood.r / ref.r - 1) * 0.7) * k, (1 + (T.wood.g / ref.g - 1) * 0.7) * k, (1 + (T.wood.b / ref.b - 1) * 0.7) * k));
    });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
    grp.add(im);
  });
  rt.scene.add(grp);
  const band = offsetPts(pts, (depth * 0.5 + 0.3) * side, closed);
  const half = depth * 0.5 + 0.4, P = closed ? [...band, band[0]] : band;
  const slow = (x, z) => {
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < half) return o.slow ?? 0.6;
    }
    return 1;
  };
  return { mesh: grp, slow, band, hp: null, fire: false };
}

// 二重柵：内の柵（高い・狭間あり）と外の柵（低い・弱い）を間 gap で二筋。外は side の側（既定は (-dz, dx) の側）。
// o: fence と同じ（team・hp・gaps・segLen…）に { gap=1.8, side=1, outerH=1.7, outerHp=hp*0.6, outerGaps }
export function nijuSaku(rt, pts, o = {}) {
  const { gap = 1.8, side = 1, closed = false } = o;
  const inner = fence(rt, pts, o);
  const outer = fence(rt, offsetPts(pts, gap * side, closed), {
    ...o, hp: o.outerHp ?? (o.hp ?? 400) * 0.6, gaps: o.outerGaps ?? o.gaps ?? [], sama: 2.2,
    meshOpt: { ...(o.meshOpt || {}), h: o.outerH ?? 1.7 },
  });
  return {
    inner, outer, structs: [...inner.structs, ...outer.structs], mesh: [...inner.mesh, ...outer.mesh], hp: inner.hp, fire: true,
    slots: inner.slots,
  };
}

// 切岸：斜面を削って立てた崖。外（side の側）の地面を run m で h m 落とし、その先 fade m で元へ戻す。
// world.height に足し込む純な関数を返す（空堀と同じ作法）：
//   const cut = kirigishiHeight(pts, { h: 3 }); world: { height: (x, z) => base(x, z) + cut(x, z) }
// o: { h=2.8, run=1.4, fade=7, side=1, closed }
export function kirigishiHeight(pts, o = {}) {
  const { h = 2.8, run = 1.4, fade = 7, side = 1, closed = false } = o;
  const P = closed ? [...pts, pts[0]] : pts, reach = run + fade;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return (x, z) => {
    if (x < x0 - reach || x > x1 + reach || z < z0 - reach || z > z1 + reach) return 0;
    let best = Infinity, sgn = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) { best = d; sgn = ((x - ax) * -dz + (z - az) * dx) * side; }
    }
    if (sgn <= 0 || best >= reach) return 0;
    if (best < run) { const u = best / run; return -h * (u * 0.92 + 0.08 * u * u); }   // 崖の面はほぼまっすぐ
    const u = (best - run) / fade; return -h * (1 - u * u * (3 - 2 * u));
  };
}
// 切岸の面の見た目：崖の面に削り跡の筋のある土の帯（上の縁は季節の草）。地形に切岸を足した後で呼ぶ。
// o: kirigishiHeight と同じ（run・side・closed）に { season, step=1 }
export function kirigishiFace(rt, pts, o = {}) {
  const { run = 1.4, side = 1, closed = false, step = 1 } = o;
  const W = rt.world, T = fortTone(rt, o);
  const P = closed ? [...pts, pts[0]] : pts, pos = [], col = [], uv = [], idx = [];
  const rows = 5;
  let s = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1], len = Math.hypot(bx - ax, bz - az) || 1e-6;
    const tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz * side, nz = tx * side;
    const n = Math.max(1, Math.round(len / step)), base = pos.length / 3;
    for (let j = 0; j <= n; j++) {
      const x = ax + tx * len * j / n, z = az + tz * len * j / n;
      for (let r = 0; r <= rows; r++) {
        const u = r / rows, d = -0.15 + u * (run + 0.5), px = x + nx * d, pz = z + nz * d, y = W.heightAt(px, pz) + 0.05;
        pos.push(px, y, pz); uv.push((s + len * j / n) * 0.5, y * 0.5);
        const streak = 0.85 + 0.15 * Math.sin((s + len * j / n) * 9.1 + _h(j, i) * 3);
        const c = (r === 0 ? T.grass.clone().lerp(T.soil, 0.35) : T.soil.clone().multiplyScalar(streak * (1.08 - u * 0.22)));
        if (T.frost && r === 0) c.lerp(_tc.setRGB(0.85, 0.86, 0.87), T.frost);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < n; j++) for (let r = 0; r < rows; r++) {
      const a = base + j * (rows + 1) + r, b = a + rows + 1;
      if (side > 0) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    s += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, castleMat('tsuchi'));
  mesh.receiveShadow = true; mesh.name = '切岸';
  rt.scene.add(mesh);
  return { mesh, hp: null, fire: false };
}

// 竹束：鉄砲よけの竹の束を線に並べる（前＝side の側を向く）。形と材質は一つ（InstancedMesh で描く回数は一つ）。
// o: { spacing=2.0, side=1, closed, gaps（並びの番号で抜く） }
export function takatabaRow(rt, pts, o = {}) {
  const { spacing = 2.0, side = 1, closed = false, gaps = [] } = o;
  const spots = [];
  alongPts(pts, spacing, closed, (x, z, tx, tz, nx, nz, k) => { if (!gaps.includes(k)) spots.push([x, z, Math.atan2(nx * side, nz * side) + (_h(x, z) - 0.5) * 0.12]); });
  if (!spots.length) return { mesh: null, hp: null, fire: true };
  const [fx, fz, fr] = spots[0];
  const tpl = takataba(rt.world, fx, fz, fr);           // 一本目は当たり（solidRect）ごと作り、形と材質を借りる
  const im = new THREE.InstancedMesh(tpl.geometry, tpl.material, spots.length);
  spots.forEach(([x, z, r], i) => {
    _m4.makeRotationY(r + Math.PI); _m4.setPosition(x, rt.world.heightAt(x, z), z); im.setMatrixAt(i, _m4);
    if (i) Object.assign(solidRect(x, z, 1.9, 0.6, r), { missileH: 1.7, missileType: 'wood' });
  });
  im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.name = '竹束の並び';
  rt.scene.add(im);
  return { mesh: im, spots, hp: null, fire: true };
}

// 土嚢（この頃は土を詰めた俵＝土俵）：俵を互い違いに積んだ胸壁。弾よけ（当たり・高さ）を持つ。描く回数は一つ。
// o: { rows=3, side=1（外の側。裾を外へ広げる）, closed, season, solid=true }
let DONOU_GEO = null;
function donouGeo() {
  if (DONOU_GEO) return DONOU_GEO;
  const g = new THREE.CylinderGeometry(0.22, 0.22, 0.72, 9, 4);
  g.rotateZ(Math.PI / 2);
  const p = g.attributes.position, c = new Float32Array(p.count * 3), straw = new THREE.Color(0xd2b986);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), zz = p.getZ(i), bul = 1 + 0.16 * Math.cos(x / 0.36 * Math.PI / 2);
    p.setXYZ(i, x, y * bul * (y < 0 ? 0.72 : 0.85), zz * bul * 1.12);
    // 藁の色：両端の縄の締めは暗く、上の面は日に褪せる
    const end = Math.abs(x) > 0.3 ? 0.6 : Math.abs(Math.abs(x) - 0.12) < 0.03 ? 0.75 : 1;
    const k = end * (y > 0.1 ? 1.08 : 0.92);
    c[i * 3] = straw.r * k; c[i * 3 + 1] = straw.g * k; c[i * 3 + 2] = straw.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.computeVertexNormals();
  return (DONOU_GEO = g);
}
export function donouRow(rt, pts, o = {}) {
  const { rows = 3, side = 1, closed = false } = o;
  const W = rt.world, T = fortTone(rt, o), P = closed ? [...pts, pts[0]] : pts, mats = [], straw = new THREE.Color(0xd2b986);
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1], len = Math.hypot(bx - ax, bz - az) || 1e-6;
    const tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz * side, nz = tx * side, rot = Math.atan2(-tz, tx);
    for (let r = 0; r < rows; r++) {
      const step = 0.7, sh = (r % 2) * step * 0.5, back = (rows - 1 - r) * 0.12;
      for (let u = sh + step * 0.5; u < len; u += step) {
        const x = ax + tx * u + nx * back, z = az + tz * u + nz * back, rr = _h(x * 3, z + r);
        const y = W.heightAt(ax + tx * u, az + tz * u) + 0.13 + r * 0.3;
        _e.set((rr - 0.5) * 0.12, rot + (rr - 0.5) * 0.18, (rr - 0.5) * 0.1);
        _m4.compose(_s.set(x, y, z), _q.setFromEuler(_e), _v.set(0.92 + rr * 0.16, 1, 1));
        mats.push([_m4.clone(), rr]);
      }
    }
    if (o.solid !== false) Object.assign(solidSeg(ax, az, bx, bz, 0.3), { missileH: rows * 0.3 + 0.1, missileType: 'dust' });
  }
  const im = new THREE.InstancedMesh(donouGeo(), castleMat('wood'), mats.length);
  // 季節：土の跳ね（春夏は湿った土・秋は乾いた土埃・冬は霜）を俵ごとに薄く
  mats.forEach(([m, rr], i) => {
    im.setMatrixAt(i, m);
    _tc.setRGB(1, 1, 1).lerp({ r: T.soil.r / straw.r, g: T.soil.g / straw.g, b: T.soil.b / straw.b }, 0.1 + rr * 0.15).multiplyScalar(1.02 - T.age * 0.14 + rr * 0.08);
    if (T.frost) _tc.lerp({ r: 1.3, g: 1.32, b: 1.45 }, T.frost * 0.45);
    im.setColorAt(i, _tc);
  });
  im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.name = '土嚢';
  rt.scene.add(im);
  return { mesh: im, hp: null, fire: false, coverH: rows * 0.3 + 0.1 };
}

// 陣小屋：丸太の柱に板を片流れに葺き、押さえの丸太と石を載せ、三方を筵で囲った仮の小屋（前は筵を巻き上げて開く）。
// 束（makeSimpleBatch）へ積み、遠くは粗い形で描く。o: { season, age, team, hp（渡すと壊せる・燃える）, name='陣小屋' }
export function jingoya(rt, x, z, w = 5, d = 3.6, rot = 0, o = {}) {
  const W = rt.world, T = fortTone(rt, o), B = [], C = [];
  const c = Math.cos(rot), s = Math.sin(rot);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let gy = -Infinity;
  for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) { const [px, pz] = at(lx, lz); gy = Math.max(gy, W.heightAt(px, pz)); }
  const hF = 2.5, hB = 1.75;                          // 前（+z）が高い片流れ
  const log = (lx0, y0, lz0, lx1, y1, lz1, r, hex) => {
    const [ax, az] = at(lx0, lz0), [bx, bz] = at(lx1, lz1), a = new THREE.Vector3(ax, gy + y0, az), b = new THREE.Vector3(bx, gy + y1, bz);
    const L = a.distanceTo(b), g = new THREE.CylinderGeometry(r * 0.9, r, L, 6, 1, true);
    g.applyQuaternion(_q.setFromUnitVectors(_v.set(0, 1, 0), b.clone().sub(a).normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    B.push(_paint(g, hex));
  };
  const box = (list, hex, lx, y, lz, bw, bh, bd, rx = 0) => {
    const g = partBox(bw, bh, bd); if (rx) g.rotateX(rx); g.rotateY(rot);
    const [px, pz] = at(lx, lz); g.translate(px, gy + y, pz); list.push(_paint(g, hex));
  };
  // 柱（地面から）：前と後ろに三本ずつ
  for (const lx of [-w / 2, 0, w / 2]) {
    for (const [lz, hh] of [[d / 2, hF], [-d / 2, hB]]) {
      const [px, pz] = at(lx, lz), g0 = W.heightAt(px, pz) - gy - 0.3;
      log(lx, g0, lz, lx + (_h(lx, lz) - 0.5) * 0.06, hh, lz, 0.075, 0x5d5040);
    }
  }
  // 桁（前・後ろ）と垂木
  log(-w / 2 - 0.3, hF, d / 2, w / 2 + 0.3, hF, d / 2, 0.07, 0x574a3a);
  log(-w / 2 - 0.3, hB, -d / 2, w / 2 + 0.3, hB, -d / 2, 0.07, 0x574a3a);
  const pitch = Math.atan2(hF - hB, d);
  for (let lx = -w / 2; lx <= w / 2 + 0.01; lx += w / 4) log(lx, hB - 0.2, -d / 2 - 0.5, lx, hF + 0.2, d / 2 + 0.5, 0.045, 0x625442);
  // 板葺き：短冊の板を少しずつ互い違いに（間に影の筋）
  const nB = Math.round((w + 0.8) / 0.32);
  for (let i = 0; i < nB; i++) {
    const lx = -w / 2 - 0.4 + (i + 0.5) * (w + 0.8) / nB, r = _h(i, 3);
    const hex = [0x7b6b55, 0x6f604d, 0x857560, 0x665a49][i % 4];
    box(B, hex, lx, (hF + hB) / 2 + 0.12 + r * 0.03, 0, (w + 0.8) / nB - 0.02, 0.03, d + 1.1 + r * 0.15, pitch);
  }
  // 押さえの丸太と石
  for (const lz of [-d * 0.28, d * 0.18]) {
    const y = hB + (lz + d / 2) / d * (hF - hB) + 0.22;
    log(-w / 2 - 0.35, y, lz, w / 2 + 0.35, y, lz, 0.06, 0x4f4436);
    for (let lx = -w / 2 + 0.6; lx < w / 2; lx += 1.3) box(B, 0x77746c, lx, y + 0.1, lz + 0.1, 0.28, 0.16, 0.24);
  }
  // 筵の壁：後ろと両脇は垂らした筵（藁色の帯を少し波打たせる）、前は上に巻き上げた筵
  const mat = (lx0, lz0, lx1, lz1, y0, y1) => {
    const n = Math.max(2, Math.round(Math.hypot(lx1 - lx0, lz1 - lz0) / 0.9));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, lx = lx0 + (lx1 - lx0) * t, lz = lz0 + (lz1 - lz0) * t, wv = (_h(k, lx) - 0.5) * 0.06;
      const g = partBox(Math.hypot(lx1 - lx0, lz1 - lz0) / n + 0.04, y1 - y0, 0.04);
      g.rotateY(Math.atan2(-(lz1 - lz0), lx1 - lx0) + wv); g.rotateY(rot);
      const [px, pz] = at(lx + Math.sin(k) * 0.02, lz); g.translate(px, gy + (y0 + y1) / 2, pz);
      C.push(_paint(g, [0x9a8a62, 0x8d7e58, 0xa49468][k % 3]));
    }
  };
  mat(-w / 2 + 0.05, -d / 2 + 0.05, w / 2 - 0.05, -d / 2 + 0.05, -0.05, hB - 0.05);
  mat(-w / 2 + 0.05, -d / 2 + 0.05, -w / 2 + 0.05, d / 2 - 0.05, -0.05, hB);
  mat(w / 2 - 0.05, -d / 2 + 0.05, w / 2 - 0.05, d / 2 - 0.05, -0.05, hB);
  log(-w / 2, hF - 0.25, d / 2 + 0.06, w / 2, hF - 0.25, d / 2 + 0.06, 0.11, 0x8c7c55);   // 巻き上げた筵
  // 中：藁を敷いた床と、竈の石
  box(C, 0x8b7a52, 0, 0.03, 0, w - 0.3, 0.05, d - 0.3);
  for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; box(B, 0x6e6a62, w * 0.28 + Math.cos(a) * 0.35, 0.08, Math.sin(a) * 0.35, 0.2, 0.16, 0.18); }
  for (const g of B) toneGeo(g, T, 'wood');
  for (const g of C) toneGeo(g, T, 'earth');
  const batch = makeSimpleBatch();
  const part = pushSimpleBatch(batch, mergeGeometries([...B, ...C]), castleMat('wood'));
  for (const g of [...B, ...C]) g.dispose();
  finalizeSimpleBatch(rt, batch);
  solidRect(x, z, w, d, rot);
  let struct = null;
  if (o.hp && rt.army) {
    const r = Math.max(w, d) / 2 + 0.5;
    struct = rt.army.addStruct({ x, z, r, solidR: r, hp: o.hp, maxHp: o.hp, armor: 0.05, team: o.team ?? 0, name: o.name || '陣小屋' });
    struct.mesh = part;
  }
  return { mesh: part, struct, hp: o.hp || null, fire: true, door: at(0, d / 2 + 0.8) };
}

// 陣幕：本陣の幕囲い（honjin の別名。旗本の立ち位置 slots を返す）
export const jinmakuBox = (rt, x, z, w, d, o) => honjin(rt, x, z, w, d, o);
// 井楼（組上げの物見）：monomi の 'seiro'（屋根なし・段ごとに横木）。o.kind で 'ro'（屋根と板囲い）にもできる
export const seiro = (rt, x, z, o = {}) => monomi(rt, x, z, { kind: 'seiro', ...o });

// 篝火台：三本脚の鉄籠を並べる。points=[[x,z],…]。o.lit で一つずつ火を灯す（照りは三つを使い回す。nightOnly 既定 true）
// 灯さない並びは InstancedMesh 二つで描く
export function kagaribiRow(rt, points, o = {}) {
  const W = rt.world;
  if (!o.lit) { const g = kagaribiBatch(W, points); rt.scene.add(g); return { mesh: g, hp: null, fire: false }; }
  const meshes = points.map(([x, z]) => {
    const m = kagaribi(W, x, z); rt.scene.add(m);
    if (W.addFire) W.addFire(x, z, { h: 1.35, size: o.size ?? 0.7, nightOnly: o.nightOnly ?? true });
    return m;
  });
  return { mesh: meshes, hp: null, fire: false };
}

// 狭間のある板塀：腰の低い所に三角・丸の狭間を切った板塀（castleBoardFence）。柵と同じく壊せる・燃える・狭間から撃てる。
// o: { team, hp=520, segLen=6, closed, gaps, sama=1.5, h=2.6, season, age }
export function itabei(rt, pts, o = {}) {
  const hp = o.hp ?? 520, T = toneOf(rt, o);
  const batch = o.noBatch ? null : makeSimpleBatch();
  const structs = wallLike(rt, pts, castleBoardFence, { hp, name: '柵', sama: o.sama ?? 1.5, ...o, meshOpt: { h: o.h ?? 2.6, samaStep: o.sama ?? 1.5, ...(o.meshOpt || {}) }, batch });
  for (const st of structs) st.kind = '板塀';
  if (batch) { toneBatch(batch, T, 'wood'); finalizeSimpleBatch(rt, batch); }
  return { structs, mesh: structs.map((st) => st.mesh), hp, fire: true, slots: () => structs.flatMap((st) => rt.army.samasOf(st)) };
}

// 棚：名から部品を引く（戦の側の縄張りの並びは、この名で書いてよい）
export const FORT_PARTS = {
  丸太柵: fence, 乱杭: rankui, 二重柵: nijuSaku, 冠木門: kabukiGate, 木戸: kido, 井楼: seiro, 物見櫓: monomi,
  土塁: doruiLine, 切岸: kirigishiHeight, 切岸の面: kirigishiFace, 空堀: horiboriHeight, 逆茂木: sakamogiRow,
  竹束: takatabaRow, 土嚢: donouRow, 陣小屋: jingoya, 陣幕: jinmakuBox, 篝火台: kagaribiRow, 板塀: itabei, 馬防柵: bobosakuLine,
};

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
  if (!_mizuboriMat) _mizuboriMat = new THREE.MeshStandardMaterial({ color: 0x31424a, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.92 });
  return _mizuboriMat;
}
// 水堀：horiboriHeight を深く広く取り、水面を一枚重ねる。渡れる所（土橋・橋）は pts を切って呼ぶ（docs 1-4）
export function mizubori(rt, pts, o = {}) {
  const depth = o.depth ?? 3.4, width = o.width ?? 9, closed = !!o.closed;
  const heightAt = horiboriHeight(pts, { depth, width, closed });
  // 折れ線の両岸を継いだ一枚の平面。角で短冊を重ねず、どの辺も同じ水位にする。
  const P = pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.001);
  if (closed && P.length > 1 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 0.001) P.pop();
  let mesh = null;
  if (P.length >= (closed ? 3 : 2)) {
    const n = P.length, count = closed ? n + 1 : n, half = Math.max(1, width - 1.6) / 2;
    const normals = [], positions = [], indices = [];
    let bed = Infinity;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      normals.push([-dz / len, dx / len]);
      // 地形には堀底が既にある。底をもう一度下げず、最も低い辺から水深を戻す。
      bed = Math.min(bed, rt.world.heightAt(a[0], a[1]), rt.world.heightAt(b[0], b[1]),
        rt.world.heightAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
    }
    const y = o.y ?? bed + depth * 0.45;
    for (let i = 0; i < count; i++) {
      const j = i % n, p = P[j], prev = normals[(j - 1 + normals.length) % normals.length], next = normals[j % normals.length];
      let nx, nz, scale = half;
      if (!closed && (j === 0 || j === n - 1)) {
        [nx, nz] = normals[j === 0 ? 0 : normals.length - 1];
      } else {
        nx = prev[0] + next[0]; nz = prev[1] + next[1];
        const len = Math.hypot(nx, nz);
        if (len < 0.001) [nx, nz] = next;
        else { nx /= len; nz /= len; }
        scale = Math.min(half * 2, half / Math.max(0.5, nx * next[0] + nz * next[1]));
      }
      positions.push(p[0] + nx * scale, y, p[1] + nz * scale,
        p[0] - nx * scale, y, p[1] - nz * scale);
      if (i < count - 1) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices); geo.computeVertexNormals();
    // 縄張りの水堀は城が複数あっても一度で描く。材質は従来の水堀と共用。
    mesh = o.batch && rt.world._castleMoatMesh;
    if (mesh) {
      const old = mesh.geometry, merged = mergeGeometries([old, geo]);
      // 束ねられない形（属性の違い）は null が返る。形を失った堀が描画のたびに落ちていた（野田福島・志賀 10/28）。別の形で足す
      if (merged) { mesh.geometry = merged; old.dispose(); geo.dispose(); }
      else { mesh = new THREE.Mesh(geo, mesh.material); mesh.receiveShadow = true; rt.scene.add(mesh); }
    } else {
      mesh = new THREE.Mesh(geo, waterMat());
      mesh.receiveShadow = true;
      rt.scene.add(mesh);
      if (o.batch) rt.world._castleMoatMesh = mesh;
    }
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
// 本堂の丸柱は内陣と同じ十角の基本形を共有し、木部の束へまとめる。
const PART_HALL_POST = _paint(new THREE.CylinderGeometry(.11, .11, 1, 10), 0x4e3a28);
// 本堂の外周柱を受ける礎石。八角の共通形を既存の束へまとめる。
const PART_HALL_FOUNDATION = _paint(new THREE.CylinderGeometry(.23, .27, .16, 8), 0x827b6d);
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
  if (SETTINGS.quality === 'high' && o.profile === 'shitaragahara') return villageGoten(rt, x, z, o);
  const { w = 12, d = 8, rot = 0, tile = true, team = 0, hp = 900, name = '御殿' } = o;
  const y = o.naka ? interiorBase(rt.world, x, z, w, d, rot) : rt.world.heightAt(x, z);
  const H = 3.0;
  const B = _kitBag();
  // 土壁の色を指定した城だけに使う。指定のない館は従来の漆喰のまま。
  const fieldFort = o.fieldFort === true && true;
  // 高遠の用屋も明示指定で同じ縦板と小窓を使う。室内の間取りは各城のまま。
  const utilityBoardWalls = true && (o.utilityBoardWalls === true || ['iwamura_nagaya', 'iwamura_kura', 'iwamura_bansho'].includes(o.profile));
  const utilityWindows = utilityBoardWalls && o.naka && ['iwamura_nagaya', 'iwamura_kura', 'iwamura_bansho'].includes(o.profile);
  // 明示した山城だけの古板。ほかの砦の屋根・壁は既存の形を使う。色は本の CG（岡崎・躑躅ヶ崎・春日山）の茶の板葺きに寄せる（灰に沈めない）
  const fieldBoards = fieldFort && o.weatheredBoards === true
    ? (o.boardRoofColors || [0x7d6650, 0x6e5a46, 0x907760, 0x786250]) : null;
  const wallColor = fieldFort ? 0x786653 : o.earth;
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const bays = Math.max(2, Math.round(w / 3));
  // 指定した戸口が柱の位置でも、通れる口の中へ柱を描かない。
  const inabaEntry = o.naka && SETTINGS.quality === 'high' && o.profile === 'inabayama';
  const lowBoardCeiling = SETTINGS.quality === 'high' && !tile && o.boardRoof && !fieldFort && o.profile?.startsWith('iwamura');
  const interiorH = o.interiorH ?? (lowBoardCeiling ? 2.7 : H - (inabaEntry ? .6 : .1));
  // 稲葉山は外壁の開口も、室内の柱・引き戸と同じ内法にする。
  // 外だけ二十センチ広い口や、鴨居の上の隙間を残さない。
  const entryW = o.entryW ?? 1.4, gapW = inabaEntry ? entryW : 1.6;
  const entryH = Math.min(interiorH - .3, 2), entryTop = inabaEntry ? .55 + entryH : 2.6;
  const ds = o.door ?? 1;
  const requestedDoorX = o.doorX ?? (o.profile && bays % 2 ? 0 : (w / bays) / 2);
  // 稲葉山の玄関は左右へ引き分ける。全開時の戸先・敷居まで妻壁の内へ納める。
  // 内寸は外幅から三十センチ引き、隅柱と戸の当たり用にさらに二十センチ空ける。
  // 小さな番所・板倉で、柱間の中心をそのまま使うと戸が妻壁を突き抜ける。
  const entryLimit = Math.max(0, (w - .3) / 2 - entryW - .2);
  const doorX = inabaEntry ? Math.max(-entryLimit, Math.min(entryLimit, requestedDoorX)) : requestedDoorX;
  // 稲葉山の用屋は側面の障子を使わず、裏の連子窓を内外で共有する（高さは室内床から）。
  // 高画質では外の連子を一組だけ使い、室内側は壁厚を包む四方の木枠で納める。
  const utilityWindow = o.naka && utilityBoardWalls && o.profile === 'inabayama'
    ? { face: 'z', s: -ds, t: SETTINGS.quality === 'high' && o.kind === 'shrine' ? .95 : 0, w: .78, y0: 1.27, y1: 1.73,
      exteriorLattice: SETTINGS.quality === 'high',
      // 用屋と小祠の連子には雨風を防ぐ内側の板戸を納める推定。
      // 小祠も神前の格子戸とは別に、裏窓の中で二枚を引き違える。
      shutter: inabaEntry && ['kura', 'bansho', 'nagaya', 'shrine'].includes(o.kind),
      latticeStep: .12, latticeOffset: .34, latticeWidth: .045 } : null;
  // 稲葉山の主殿・館・遠侍も、本堂と同じく正面の柱間で明かりを取る。
  // 内外で同じ開口を使い、塞がった妻壁の内側に障子窓を描かない。
  const paperWalls = o.templePaper || SETTINGS.quality === 'high' && o.profile === 'inabayama'
    && o.naka && ['goten', 'tamari'].includes(o.kind || 'goten');
  const paperWindows = o.naka && paperWalls && o.profile === 'inabayama' ? [] : null;
  if (paperWindows) for (let i = 0; i < bays; i++) {
    let c0 = -w / 2 + i * w / bays + .12, c1 = c0 + w / bays - .24;
    const cm = (c0 + c1) / 2;
    // 稲葉山の高画質は戸口脇まで窓幅を詰めてから決める。
    // 先に開口幅の倍を除くと、主殿・館の両脇の柱間まで白壁になってしまう。
    if (!inabaEntry && cm > doorX - gapW && cm < doorX + gapW) continue;
    if (inabaEntry) {
      // 遠侍の中央玄関は柱間をまたぐ。窓の中心だけで避けると、
      // 障子と腰板が戸口へ重なるため、玄関の脇柱の分まで窓幅を詰める。
      if (cm < doorX) c1 = Math.min(c1, doorX - gapW / 2 - .18);
      else c0 = Math.max(c0, doorX + gapW / 2 + .18);
      if (c1 - c0 < .6) continue;
    }
    paperWindows.push({ bay: i, face: 'z', s: ds, t: (c0 + c1) / 2, w: c1 - c0, y0: .825, y1: 1.975, shoji: true, sliding: SETTINGS.quality === 'high' });
  }
  // 裏の連子窓も外形・内壁・当たりで同じ開口を使う。黒板を貼った飾り窓にしない。
  const rearWindows = paperWindows && SETTINGS.quality === 'high' && !fieldFort && !utilityBoardWalls ? [] : null;
  // 主殿・山麓館の床の間と、本堂の須弥壇・来迎壁の背後は壁で納める。
  // 室内と同じ間取りから幅を取り、本尊の背後だけ連子窓から外が見える
  // 食い違いを防ぐ。窓の絵・内外の壁・当たりへ同じ結果を渡す。
  const rearFixtures = rearWindows && ['goten', 'hondo'].includes(o.kind || 'goten')
    ? interiorLayout(o.kind || 'goten', w - .3, d - .3, {
      oku: o.oku ?? .45, side: ds, profile: o.profile, entryX: doorX,
      raisedTatami: true, slidingClearance: .2,
    }).props.filter(p => p.part === 'alcove' || p.part === 'altar') : [];
  if (rearWindows) for (let i = 1; i < bays; i += 2) {
    const t = -w / 2 + (i + .5) * w / bays, windowW = (w / bays - .24) * .7;
    if (rearFixtures.some(p => t + windowW / 2 > p.x - p.w / 2 - .12
      && t - windowW / 2 < p.x + p.w / 2 + .12)) continue;
    rearWindows.push({
      face: 'z', s: -ds, t, w: windowW, y0: .95, y1: 1.75, exteriorLattice: true,
      // 主殿・館・遠侍の裏窓にも内側の板戸を納める推定。連子だけの
      // 開け放しにせず、用屋と共通の引き違い戸・溝・当たりで開閉する。
      shutter: true,
      latticeStep: (w / bays - .24) * .1, latticeOffset: .27, latticeWidth: .05,
    });
  }
  // 岩村の寺社・用屋・侍屋敷には専用の間取りがある。
  // 御殿の奥の間の指定を流用すると、大将の立ち所を空ける処理で
  // 内陣や板倉の調度まで取り除き得る。主殿だけに既定の奥行きを渡す。
  const separateInterior = SETTINGS.quality === 'high' && o.profile?.startsWith('iwamura_');
  const interiorOku = o.oku ?? (separateInterior ? 0 : .45);
  // 岩村の居館・堂・社の明かり障子。外壁と室内で同じ窓割りを使い、紙の裏を土壁で塞がない。
  // 個別の窓位置は推定。番所・長屋・蔵の連子窓とは分ける。
  // 小堂の内陣は須弥壇の前を空けて広げるため、窓割りにも室内と同じ通路寸法を渡す。
  // 古い境で窓を割ると、内陣と外陣の間仕切りが側面の障子へ突き当たる。
  const windowLayout = SETTINGS.quality === 'high' && o.naka
    && ['iwamura', 'iwamura_yashiki', 'iwamura_hondo', 'iwamura_shrine'].includes(o.profile)
    ? interiorLayout(o.kind || 'goten', w - .3, d - .3,
      { oku: interiorOku, side: ds, profile: o.profile, entryX: doorX,
        shrineOffering: true, doorClearance: true }) : null;
  let sideShojiWindows = windowLayout ? interiorSideShojiWindows(windowLayout) : null;
  // 岩村の裏の連子窓は飾りの黒板にせず、外壁と室内へ同じ穴を通す。
  // 窓割りと内板戸は推定復元。用屋と同じ引違い戸を内側へ納め、夜は閉じて始める。
  // 格子と腰壁は残し、開閉の札・二筋の溝・動く板戸の当たりは共通の仕組みを使う。
  if (sideShojiWindows) for (let i = 1; i < bays; i += 2) {
    // 奥座敷・内陣の裏窓も、その部屋の上げ床から腰高を測る推定復元。
    // 外壁の穴・可動板戸・外の窓枠と連子へ、同じ床高を渡す。
    const center = -w / 2 + (i + .5) * w / bays;
    const rearZ = -ds * (d - .3) / 2;
    const room = windowLayout.rooms.find(r => center >= r.x0 && center <= r.x1
      && rearZ >= r.z0 - .01 && rearZ <= r.z1 + .01);
    // 裏窓も側面の明かり障子と同じ畳面を基準にし、上段の床高だけで決めない。
    const floorY = interiorWindowFloorY(windowLayout, room);
    sideShojiWindows.push({ face: 'z', s: -ds, t: center,
      w: (w / bays - .24) * .7, y0: floorY + .95, y1: floorY + 1.75, shutter: true });
  }
  // 正面も外観と同じ柱間で穴を抜き、室内の引違い障子へ渡す。
  if (sideShojiWindows) for (let i = 0; i < bays; i++) {
    const mid = -w / 2 + (i + .5) * w / bays;
    if (mid > doorX - gapW && mid < doorX + gapW) continue;
    let left = -w / 2 + i * w / bays + .12, right = left + w / bays - .24;
    if (mid < doorX) right = Math.min(right, doorX - gapW / 2);
    else left = Math.max(left, doorX + gapW / 2);
    sideShojiWindows.push({ face: 'z', s: ds, t: (left + right) / 2, w: right - left, y0: .825, y1: 1.975, shoji: true });
  }
  // 床の間や仏壇を置く壁には穴を抜かず、残る障子は共通の開閉へ渡す。
  if (windowLayout) sideShojiWindows = interiorWindowsClearOfFittings(windowLayout, sideShojiWindows);
  // 岩村の外周柱も縁束と同じく礎石で受ける推定復元。
  // 柱ごとの地面まで下ろし、側面の窓脇の柱も床下で宙に切らない。
  // 入口・窓を避けて決めた柱位置だけを使い、既存の石と木の束へまとめる。
  const stoneFooting = SETTINGS.quality === 'high' && o.naka
    && (o.profile === 'iwamura' || o.profile?.startsWith('iwamura_'));
  const supportPost = (px, pz, width, depth, base) => {
    if (!stoneFooting) return;
    const ground = rt.world.heightAt(px, pz), top = y + base;
    if (ground > top + .1) return;
    const stoneTop = Math.min(ground + .12, top + .1);
    _box(B.plaster, 0x777369, px, (ground - .04 + stoneTop) / 2, pz,
      width + .16, stoneTop - ground + .04, depth + .16, rot);
    if (top > stoneTop) _box(B.wood, 0x4e3a28, px, (stoneTop + top) / 2, pz,
      width, top - stoneTop, depth, rot);
  };

  // 本願寺の物置三棟は座敷用の腰窓にせず、高い格子口と雨を避ける板戸で補う推定復元。
  // 寺務の長屋は従来の紙障子を保ち、用途を指定した物置だけを分ける。
  const nodaTempleStore = o.kind === 'nagaya'
    && ['templeGrain', 'templeUtensils', 'templeFuel'].includes(o.interiorUse);
  // 砦の番所・兵の長屋は、側面も背面と同じ板戸で風雨を避ける推定復元。
  // 詰所の座敷と寺務の紙障子は分け、窓の穴・引き代・格子はそのまま使う。
  // 高だけの窓定義に渡し、共通の建具と「開ける」の札で横へ滑らせる。
  const nodaFortShutter = fieldFort && ['bansho', 'nagaya'].includes(o.kind)
    && !['templeService', 'templeGrain', 'templeUtensils', 'templeFuel'].includes(o.interiorUse);
  const windowEntryDepth = nodaEntryDepth(o.kind, w - .3, d - .3, o.interiorUse);
  // 野田・福島の詰所・番所・長屋の推定の明かり取り。内障子の引き代も奥の部屋へ収める。
  // 外壁の穴と室内へ同じ窓割りを渡し、板壁の裏に障子だけを置かない。
  const shojiWindows = SETTINGS.quality === 'high' && o.naka && o.profile === 'nodafukushima' && !nodaTempleStore && ['goten', 'bansho', 'nagaya'].includes(o.kind)
    ? [-1, 1].map(s => ({ face: 'x', s, t: -ds * windowEntryDepth / 2,
      w: Math.min(.9, (d - .3 - windowEntryDepth - .5) / 2), y0: 1, y1: 1.8,
      doorKind: nodaFortShutter ? 'itado' : 'shoji',
      outerLattice: { divisions: 6, offset: .15, width: .04, depth: .1 } }))
    // 兵糧の板倉は紙障子にせず、軒下の小さな格子口と閉められる板戸で補う推定復元。
    // 外壁と内壁で同じ穴を使い、短い倉でも入口の板戸より奥へ収める。
    : SETTINGS.quality === 'high' && o.naka && o.profile === 'nodafukushima' && (o.kind === 'kura' || nodaTempleStore)
      ? [-1, 1].map(s => ({ face: 'x', s, t: -ds * Math.max(.95, Math.min(1.1, (d - .3) * .28)) / 2,
        w: .6, y0: 1.7, y1: 2.05, doorKind: 'itado',
        outerLattice: { divisions: 3, offset: .15, width: .04, depth: .1 } })) : null;
  // 本願寺の裏方の背面は、板へ貼った黒い窓でなく実際の明かり取りにする。
  // 柱間へ二倍幅の引き代を収め、外張り・下地・室内・引き戸で同じ窓割りを使う。
  if (shojiWindows && utilityBoardWalls && ['templeService', 'templeGrain', 'templeUtensils', 'templeFuel'].includes(o.interiorUse)) {
    shojiWindows.push({ face: 'z', s: -ds, t: bays % 2 ? 0 : w / bays / 2,
      w: .6, y0: nodaTempleStore ? 1.6 : 1, y1: nodaTempleStore ? 1.9 : 1.8,
      doorKind: nodaTempleStore ? 'itado' : 'shoji',
      outerLattice: { divisions: 3, offset: .25, width: .04, depth: .1 } });
  }
  // 二砦の背面も、板壁へ黒い格子を貼るだけでなく実際の明かり取りにする推定復元。
  // 詰所の座敷は内障子、番所・長屋・板倉は高い格子口と板戸で雨風を避ける。
  // 二倍幅の引き代と竪枠を柱の内面へ収め、外壁・内壁・開閉の定義を共用する。
  // 寺務・物置の四棟には上で専用の背面窓を設けているため重ねない。
  if (shojiWindows && fieldFort
    && !['templeService', 'templeGrain', 'templeUtensils', 'templeFuel'].includes(o.interiorUse)
    && ['goten', 'bansho', 'nagaya', 'kura'].includes(o.kind)) {
    const bay = w / bays, t = bays % 2 ? 0 : bay / 2;
    const office = o.kind === 'goten';
    const width = Math.min(office ? .8 : .6, bay / 2 - .35);
    if (width >= .5) shojiWindows.push({ face: 'z', s: -ds, t,
      w: width, y0: office ? 1 : 1.35, y1: office ? 1.8 : 1.7, doorKind: office ? 'shoji' : 'itado',
      outerLattice: { divisions: 4, offset: .15, width: .04, depth: .1 } });
  }
  for (let i = 0; i <= bays; i++) {
    const lx = -w / 2 + i * (w / bays);
    for (const sd of [-1, 1]) {
      if (o.naka && sd === ds && Math.abs(lx - doorX) < gapW / 2 + .11) continue;
      // 岩村の用屋の裏窓は、室内と同じ七十八センチの内法を空ける。
      // 均等割りの中央柱で連子窓と滑る内板戸を塞がず、下の両脇の柱で受ける。
      if (utilityWindows && sd === -ds && Math.abs(lx) < .5 + .11) continue;
      const [px, pz] = P(lx, sd * d / 2);
      if (inabaEntry && o.kind === 'hondo') {
        // 堂内の丸柱に対して外だけ住居用の角柱だった。外周も丸柱と大斗・舟肘木で
        // 軒桁を受ける推定の納まりへ揃える。従来の柱幅と軒高・開口は保つ。
        // 稲葉山の本堂は柱を土へ直接差さず、礎石の上で受ける推定の納まり。
        // 柱頭と軒の高さは保ち、石の厚みだけ柱脚を上げる。戸口の幅も変えない。
        const baseH = .16, shaftH = H - .12 - baseH;
        const base = PART_HALL_FOUNDATION.clone();
        base.rotateY(rot); base.translate(px, y + baseH / 2, pz); B.plaster.push(base);
        const post = PART_HALL_POST.clone().scale(1, shaftH, 1);
        post.rotateY(rot); post.translate(px, y + baseH + shaftH / 2, pz); B.wood.push(post);
        _box(B.wood, 0x4e3a28, px, y + H - .10, pz, .26, .04, .26, rot);
        _box(B.wood, 0x4e3a28, px, y + H - .04, pz, .38, .08, .18, rot);
        // 隅では妻側の桁も受ける。直交材は中央の材の側面で止め、面を重ねない。
        if (i === 0 || i === bays) for (const end of [-1, 1]) {
          const [qx, qz] = P(lx, sd * d / 2 + end * .14);
          _box(B.wood, 0x4e3a28, qx, y + H - .02, qz, .18, .04, .10, rot);
        }
      } else if (inabaEntry) {
        // 主殿・館・用屋の角柱も礎石で受ける推定。柱頭は動かさず柱脚だけ上げる。
        // 本堂の共通形を少し小さく使い、既存の石・木の束へまとめる。
        const baseH = .12;
        const base = PART_HALL_FOUNDATION.clone().scale(.85, baseH / .16, .85);
        base.rotateY(rot); base.translate(px, y + baseH / 2, pz); B.plaster.push(base);
        _box(B.wood, 0x4e3a28, px, y + (H + baseH) / 2, pz, .22, H - baseH, .22, rot);
      } else _box(B.wood, 0x4e3a28, px, y + H / 2, pz, 0.22, H, 0.22, rot);
      supportPost(px, pz, .22, .22, 0);
    }
  }
  if (utilityWindows) for (const edge of [-1, 1]) {
    // 柱の内面を窓の端へそろえ、窓枠から桁まで通す推定復元。
    // 既存の木材の束へ結合し、室内の戸の移動範囲には張り出さない。
    const [px, pz] = P(edge * (.39 + .11), -ds * d / 2);
    _box(B.wood, 0x4e3a28, px, y + H / 2, pz, .22, H, .22, rot);
    supportPost(px, pz, .22, .22, 0);
  }
  // 中に入れる御殿（o.naka）は、戸口の面の壁に口を開ける（戸口は柱の間の真ん中）
  const wallZ = (lz, ww, th, hex) => {
    if (sideShojiWindows) {
      const low = H * .175, side = Math.sign(lz);
      const holes = sideShojiWindows.filter(win => win.face === 'z' && win.s === side).map(win => ({
        t0: win.t - win.w / 2, t1: win.t + win.w / 2, y0: .55 + win.y0 - low, y1: .55 + win.y1 - low,
      }));
      if (side === ds) holes.push({ t0: doorX - gapW / 2, t1: doorX + gapW / 2, y0: 0, y1: 2.6 - low });
      for (const [a, b, lo, hi] of facePanels(ww, H * .75, holes)) {
        const [qx, qz] = P((a + b) / 2, lz);
        _box(B.plaster, hex, qx, y + low + (lo + hi) / 2, qz, b - a, hi - lo, th, rot);
      }
      return;
    }
    const windows = shojiWindows?.filter(v => v.face === 'z' && v.s === Math.sign(lz));
    if (windows?.length) {
      const low = H * .175;
      const holes = windows.map(v => ({ t0: v.t - v.w / 2, t1: v.t + v.w / 2,
        y0: .55 + v.y0 - low, y1: .55 + v.y1 - low }));
      for (const [a, b, lo, hi] of facePanels(ww, H * .75, holes)) {
        const [qx, qz] = P((a + b) / 2, lz);
        _box(B.wood, hex, qx, y + low + (lo + hi) / 2, qz, b - a, hi - lo, th, rot);
      }
      return;
    }
    // 岩村の用屋の裏窓を黒い板で塞がない。室内と外の縦板にも同じ穴を通す。
    if (utilityWindows && Math.sign(lz) === -ds) {
      const low = H * .175;
      const holes = [{ t0: -.39, t1: .39, y0: 1.82 - low, y1: 2.28 - low }];
      for (const [a, b, lo, hi] of facePanels(ww, H * .75, holes)) {
        const [qx, qz] = P((a + b) / 2, lz);
        _box(B.plaster, hex, qx, y + low + (lo + hi) / 2, qz, b - a, hi - lo, th, rot);
      }
      return;
    }
    if (utilityWindow && Math.sign(lz) === utilityWindow.s) {
      const low = H * .175;
      const holes = [{ t0: utilityWindow.t - utilityWindow.w / 2, t1: utilityWindow.t + utilityWindow.w / 2,
        y0: utilityWindow.y0 + .55 - low, y1: utilityWindow.y1 + .55 - low }];
      for (const [a, b, lo, hi] of facePanels(ww, H * .75, holes)) {
        const [qx, qz] = P((a + b) / 2, lz);
        _box(B.plaster, hex, qx, y + low + (lo + hi) / 2, qz, b - a, hi - lo, th, rot);
      }
      return;
    }
    if (paperWalls && o.naka && Math.sign(lz) === ds) {
      // 外側の白壁も紙の位置で抜く。内側だけ透かしても板が残るため。
      const low = H * .175, holes = [{ t0: doorX - gapW / 2, t1: doorX + gapW / 2, y0: 0, y1: entryTop - low }];
      if (paperWindows) for (const v of paperWindows) {
        // 動く障子と外壁の穴を同じ寸法にし、戸口際に壁を残さない。
        holes.push({ t0: v.t - v.w / 2, t1: v.t + v.w / 2,
          y0: v.y0 + .55 - low, y1: v.y1 + .55 - low });
      }
      else for (let i = 0; i < bays; i++) {
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
    const [qx, qz] = P(doorX, lz); _box(B.plaster, hex, qx, (y + entryTop + y1) / 2, qz, gapW, y1 - y - entryTop, th, rot);
  };
  wallZ(-d / 2, w, 0.14, wallColor ?? 0xe0d8c6);
  for (const sd of [-1, 1]) {
    const [sx, sz] = P(sd * w / 2, 0);
    if (shojiWindows) {
      const v = shojiWindows.find(v => v.face === 'x' && v.s === sd), low = H * .175;
      for (const [a, b, lo, hi] of facePanels(d, H * .75,
        [{ t0: v.t - v.w / 2, t1: v.t + v.w / 2, y0: .55 + v.y0 - low, y1: .55 + v.y1 - low }])) {
        const [qx, qz] = P(sd * w / 2, (a + b) / 2);
        _box(B.wood, wallColor ?? 0x786653, qx, y + low + (lo + hi) / 2, qz, .14, hi - lo, b - a, rot);
      }
      for (const yy of [v.y0 - .04, v.y1 + .04]) {
        const [qx, qz] = P(sd * w / 2, v.t);
        _box(B.wood, 0x4e3a28, qx, y + .55 + yy, qz, .22, .08, v.w + .16, rot);
      }
      const lattice = v.outerLattice;
      for (let j = 0; j <= lattice.divisions; j++) {
        const [qx, qz] = P(sd * w / 2, v.t - v.w / 2 + v.w * j / lattice.divisions);
        _box(B.wood, 0x4e3a28, qx, y + .55 + (v.y0 + v.y1) / 2, qz, lattice.depth, v.y1 - v.y0, lattice.width, rot);
      }
    } else if (fieldBoards) {
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
    } else if (sideShojiWindows) {
      const low = H * .175, windows = sideShojiWindows.filter(win => win.face === 'x' && win.s === sd);
      const holes = windows.map(win => ({ t0: win.t - win.w / 2, t1: win.t + win.w / 2, y0: .55 + win.y0 - low, y1: .55 + win.y1 - low }));
      for (const [a, b, lo, hi] of facePanels(d, H * .75, holes)) {
        const [px, pz] = P(sd * w / 2, (a + b) / 2);
        _box(B.plaster, wallColor ?? 0xefe9da, px, y + low + (lo + hi) / 2, pz, .14, hi - lo, b - a, rot);
      }
      // 岩村の側面も窓脇と部屋境を通し柱で受ける推定復元。
      // 正面だけに柱があると、側面の窓枠と間仕切りの端が土壁だけで支えられてしまう。
      // 室内と同じ窓割りを使い、開いた障子の穴と引込み先には柱を立てない。
      const sidePosts = [];
      const addSidePost = (t) => {
        if (Math.abs(t) > d / 2 - .22 || sidePosts.some(v => Math.abs(v - t) < .16)
          || windows.some(win => Math.abs(t - win.t) < win.w / 2 + .079)) return;
        sidePosts.push(t);
      };
      for (const win of windows) for (const edge of [-1, 1])
        addSidePost(win.t + edge * (win.w / 2 + .08));
      for (const room of windowLayout.rooms) for (const t of [room.z0, room.z1]) addSidePost(t);
      for (const t of sidePosts) {
        // 外壁から内側の柱まで見込みを通す。窓枠の端は柱の側面へ納める。
        const [px, pz] = P(sd * (w / 2 - .12), t);
        _box(B.wood, 0x4e3a28, px, y + .55 + (H - .55) / 2, pz,
          .4, H - .55, .16, rot);
        supportPost(px, pz, .4, .16, .55);
      }
      // 窓台・まぐさ・縦枠を壁厚から室内の障子まで通す。既存の木材の束へまとめる。
      for (const win of windows) {
        const [px, pz] = P(sd * (w / 2 - .1), win.t);
        for (const height of [win.y0, win.y1])
          _box(B.wood, 0x4e3a28, px, y + .55 + height, pz, .34, .07, win.w + .14, rot);
        for (const edge of [-1, 1]) {
          const [jx, jz] = P(sd * (w / 2 - .1), win.t + edge * (win.w / 2 + .035));
          _box(B.wood, 0x4e3a28, jx, y + .55 + (win.y0 + win.y1) / 2, jz, .34, win.y1 - win.y0, .07, rot);
        }
      }
    } else _box(B.plaster, wallColor ?? 0xefe9da, sx, y + H * 0.55, sz, 0.14, H * 0.75, d, rot);
  }
  // 稲葉山の正面壁は妻壁の内面まで通す。幅の六％を引くと、大きな館では
  // 隅柱でも隠れない縦の隙間が残る。妻壁の厚み十四センチだけを控え、
  // 障子・玄関の開口は同じ位置のまま、両端の壁を隅へ納める。
  wallZ(d / 2 - 0.08, inabaEntry ? w - .14 : w * 0.94, 0.08, wallColor ?? 0xefe9da);
  const decks = [];
  let IN = null;
  if (o.naka) {
    // 中に入れる御殿（naka.js。kaito 10/2）：戸口（o.door：+1 は縁側の面、-1 は裏の面）・奥の間の襖・明かり障子。
    // 城主はふつう奥の間（天守の無い城の「大将の居場所」）
    // 岩村の低い切妻板葺きは、内壁際の屋根裏が地面から約三・三八メートル。
    // 床高五十五センチに従来の室内高二・九メートルを足すと、天井が屋根を突き抜ける。
    // 高画質の該当棟だけ二・七メートルとし、天井下地六センチも屋根裏へ納める。
    // 低い仮小屋の明示寸法は優先し、建具・柱・梁も共通室内へ同じ高さを渡す。

    IN = addInterior(rt.world, {
      // 稲葉山は床の高さを引いて天井を軒桁の下へ収める。地面からの軒高を室内高にしない。
      name, kind: o.kind || 'goten', profile: o.profile, x, z, rot, levels: [{ y: y + 0.55, w: w - 0.3, d: d - 0.3, h: interiorH }],
      // 稲葉山の濡れ縁は外壁から一・二歩まである。内寸との差十五センチを
      // 足した位置から段を下ろし、踏板とささら桁を縁の板へ埋めない。
      // 戸口までの上がり台は縁より十一センチ高く、見える板と歩く床を揃える。
      door: { side: ds, lx: doorX, w: entryW, ...(inabaEntry ? { h: entryH } : {}) }, approach: { pad: inabaEntry ? 1.35 : .35, len: 1.1 }, oku: interiorOku, where: o.where,
      templePaper: paperWalls,
      interiorUse: o.interiorUse,
      wins: shojiWindows ? () => shojiWindows : sideShojiWindows ? () => sideShojiWindows : utilityWindow ? () => [utilityWindow] : paperWindows ? () => paperWindows.concat(rearWindows || []) : null,
    });
    decks.push(...IN.deckIds);
    if (inabaEntry) {
      // 稲葉山の板縁は玄関前だけでなく、障子の前まで歩けるようにする。
      // 見える板の上面・端と揃え、余白で縁の外に見えない足場を広げない。
      const [vx, vz] = P(0, ds * (d / 2 + .6));
      decks.push(addDeck({ cx: vx, cz: vz, rot,
        x0: -(w + .6) / 2, x1: (w + .6) / 2, z0: -.6, z1: .6,
        y: y + .44, pad: 0, name: `${name}の縁側` }));
    } else if (SETTINGS.quality === 'high' && (o.profile === 'iwamura' || o.profile?.startsWith('iwamura_'))) {
      // 主殿の右寄りの戸口も、描いた板縁と同じ範囲だけ歩けるようにする。
      // 中央を決め打ちすると、階段を床で覆い、反対側には見えない穴が残る。
      const outer = w / 2 + .3;
      for (const side of [-1, 1]) {
        const a = side < 0 ? -outer : Math.max(-outer, doorX + gapW / 2 + .1);
        const b = side < 0 ? Math.min(outer, doorX - gapW / 2 - .1) : outer;
        const width = b - a;
        if (width <= 0) continue;
        const [cx, cz] = P((a + b) / 2, ds * (d / 2 + .6));
        decks.push(addDeck({ x0: -width / 2, x1: width / 2, z0: -.6, z1: .6,
          rot, cx, cz, y: y + .44, pad: 0, name: `${name}の縁側` }));
      }
    }
    // 戸口の両脇に篝（灯り二つ）：外からでも入口が分かる（B088）
    // 本堂の広い石段でも篝を踏板の外へ置く。段幅は共通処理と同じ戸幅＋三十センチ。
    const fireSide = inabaEntry ? Math.max(1.3, (entryW + .3) / 2 + .5) : 1.3;
    if (o.doorFire !== false) for (const sd of [-1, 1]) { const [fx, fz] = P(doorX + sd * fireSide, ds * (d / 2 + 1.5)); rt.world.addFire(fx, fz, { torch: true, h: 0.9 }); }
  } else {
    decks.push(addDeck({ x0: -w / 2 - 0.1, x1: w / 2 + 0.1, z0: d / 2 - 0.1, z1: d / 2 + 1.3, rot, cx: x, cz: z, y: y + 0.42, name: `${name}の縁側` }));
    decks.push(addDeck({ x0: -w / 2 - 0.1, x1: w / 2 + 0.1, z0: -d / 2 - 0.1, z1: d / 2 + 0.1, rot, cx: x, cz: z, y: y + 0.55, name }));
  }
  if (paperWalls) B.templePaper = [];
  if (o.templeBoardRoof && !tile && SETTINGS.quality === 'high') B.templeBoard = [];
  gotenDress(B, P, x, y, z, w, d, rot, H, bays, ds, o.naka ? { floorLayout: utilityWindows ? IN.levels[0].layout : null, world: rt.world, boardVeranda: SETTINGS.quality === 'high' && (o.profile === 'iwamura' || o.profile?.startsWith('iwamura_')), doorX, gapW, entryTop, recessedFloor: inabaEntry, slidingPaper: paperWindows && SETTINGS.quality === 'high', paperWindows: inabaEntry ? paperWindows : null, rearWindows } : null, tile, o.eave, B.templeBoard ? .1 : o.eaveThickness, fieldFort, o.boardRoof,
    SETTINGS.quality === 'high' && (o.profile?.startsWith('iwamura') || o.layeredBoardRoof === true), utilityBoardWalls, fieldBoards, SETTINGS.quality === 'high' && o.odaniBoards === true, utilityWindow, utilityWindows, sideShojiWindows, shojiWindows);
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
function gotenDress(B, P, x, y, z, w, d, rot, H, bays, ds, door, tile, eave = 1.3, eaveThickness = .24, fieldFort = false, boardRoof = false, iwamuraBoards = false, utilityBoardWalls = false, fieldBoards = null, odaniBoards = false, utilityWindow = null, utilityWindows = false, iwamuraWindows = null, windows = null) {
  const rearWindows = iwamuraWindows || windows || door?.rearWindows;
  const bw = w / bays;
  // 床下：土台と束（床の高さ 0.55m の下の暗がり）
  for (const lz of [-d / 2, d / 2]) { const [px, pz] = P(0, lz); _box(B.wood, 0x3a2c20, px, y + 0.2, pz, w + 0.1, 0.3, 0.2, rot); }
  for (const lx of [-w / 2, w / 2]) { const [px, pz] = P(lx, 0); _box(B.wood, 0x3a2c20, px, y + 0.2, pz, 0.2, 0.3, d + 0.1, rot); }
  if (door?.floorLayout) {
    // 岩村の用屋の土間は木の床板へ載せず、地面まで土を詰めた叩きとして納める推定復元。
    // 室内と同じ部屋境で板床を止める。仕上げ面・上げ床・戸の敷居は共通室内が受ける。
    // 四隅と中央の地面まで下地を下ろし、斜面でも土間の下を空洞にしない。
    // 設営時だけ既存の土壁・木材の束へ結合し、通行の当たりと毎コマの処理は増やさない。
    for (const room of door.floorLayout.rooms) {
      const z0 = room.z0 <= -d / 2 + .151 ? -d / 2 - .05 : room.z0;
      const z1 = room.z1 >= d / 2 - .151 ? d / 2 + .05 : room.z1;
      const [px, pz] = P(0, (z0 + z1) / 2);
      if (room.floor === 'earth') {
        let bottom = door.world.heightAt(px, pz);
        for (const lx of [-w / 2, w / 2]) for (const lz of [z0, z1]) {
          const [qx, qz] = P(lx, lz);
          bottom = Math.min(bottom, door.world.heightAt(qx, qz));
        }
        bottom = Math.min(bottom - .04, y + .45);
        _box(B.plaster, 0x796348, px, (bottom + y + .55) / 2, pz,
          w + .1, y + .55 - bottom, z1 - z0, rot);
      } else _box(B.wood, 0x5a4634, px, y + .5, pz, w + .1, .1, z1 - z0, rot);
    }
  } else if (door?.recessedFloor) {
    // 高画質の稲葉山は室内側の下地を六センチ下げ、畳を覆う外形の床板を残さない。
    // 内寸は addInterior と同じ。外周の框は元の高さで閉じ、板間・土間は室内側の床で仕上げる。
    // 既存の木材の束へ設営時だけ足し、描画回数や歩行床の高さは変えない。
    const [px, pz] = P(0, 0);
    _box(B.wood, 0x5a4634, px, y + .47, pz, w - .3, .04, d - .3, rot);
    for (const sd of [-1, 1]) {
      const [zx, zz] = P(0, sd * (d / 2 - .05));
      _box(B.wood, 0x5a4634, zx, y + .5, zz, w + .1, .1, .2, rot);
      const [xx, xz] = P(sd * (w / 2 - .05), 0);
      _box(B.wood, 0x5a4634, xx, y + .5, xz, .2, .1, d - .3, rot);
    }
  } else {
    const [px, pz] = P(0, 0);
    _box(B.wood, 0x5a4634, px, y + .5, pz, w + .1, .1, d + .1, rot);
  }
  // 縁側：戸口の面に幅 1.2m の板縁、縁束と縁框
  { const lz = ds * (d / 2 + 0.6), [px, pz] = P(0, lz);
    // 岩村の縁束は柱直下の地面から立てる。建物中央の高さを使うと斜面で浮く。
    // 礎石と束を既存の材質の束へ結合し、上り口と板縁の歩行面は保つ。
    const verandaPosts = [];
    const verandaPost = lx => {
      if (door?.boardVeranda && verandaPosts.some(t => Math.abs(t - lx) < .16)) return;
      const [qx, qz] = P(lx, ds * (d / 2 + 1.1));
      if (!door?.boardVeranda) {
        _box(B.wood, 0x3a2c20, qx, y + .18, qz, .12, .36, .12, rot);
        return;
      }
      verandaPosts.push(lx);
      const ground = door.world.heightAt(qx, qz), top = y + .36;
      const clearance = top - ground;
      if (clearance <= .02) return;
      const stoneH = Math.min(.12, clearance / 3), bottom = ground + stoneH;
      _box(B.plaster, 0x777369, qx, ground + (stoneH - .04) / 2, qz,
        .26, stoneH + .04, .24, rot);
      _box(B.wood, 0x3a2c20, qx, (top + bottom) / 2, qz, .12, top - bottom, .12, rot);
    };
    if (door?.boardVeranda) {
      // 岩村の入口の板縁は、一枚の大板でなく建物へ直交する榑板で組む推定復元。
      // 上面は歩ける床と同じ四十四センチ。目地は板厚の中だけに残す。
      const count = Math.max(1, Math.round((w + .6) / .3)), pitch = (w + .6) / count;
      // 歩ける縁側と同じ幅で中央の上り口を抜く。板・縁框・束で石段を覆わない。
      const left = door.doorX - door.gapW / 2 - .1;
      const right = door.doorX + door.gapW / 2 + .1;
      for (let i = 0; i < count; i++) {
        const start = -(w + .6) / 2 + i * pitch;
        for (const side of [-1, 1]) {
          const a = side < 0 ? start : Math.max(start, right);
          const b = side < 0 ? Math.min(start + pitch, left) : start + pitch;
          if (b - a <= .006) continue;
          const [qx, qz] = P((a + b) / 2, lz);
          _box(B.wood, [0x6a5440, 0x715a43, 0x624d39][i % 3], qx, y + .4, qz, b - a - .006, .08, 1.2, rot);
        }
      }
      // 薄い板の下面で根太を受ける。中央の階段の坂は既存のまま空ける。
      for (const side of [-1, 1]) {
        const a = side < 0 ? -w / 2 - .3 : Math.max(-w / 2 - .3, right);
        const b = side < 0 ? Math.min(w / 2 + .3, left) : w / 2 + .3;
        if (b <= a) continue;
        for (const offset of [.18, .96]) {
          const [qx, qz] = P((a + b) / 2, ds * (d / 2 + offset));
          _box(B.wood, 0x493624, qx, y + .3, qz, b - a, .12, .1, rot);
        }
        const [fx, fz] = P((a + b) / 2, ds * (d / 2 + 1.18));
        _box(B.wood, 0x3e2e22, fx, y + .34, fz, b - a, .14, .12, rot);
        // 上り口の脇も縁束で受け、切った縁框の端を宙に浮かせない。
        verandaPost(side < 0 ? b - .06 : a + .06);
      }
    } else _box(B.wood, 0x6a5440, px, y + 0.4, pz, w + 0.6, 0.08, 1.2, rot);
    if (!door?.boardVeranda) {
      const [fx, fz] = P(0, ds * (d / 2 + 1.18)); _box(B.wood, 0x3e2e22, fx, y + 0.34, fz, w + 0.6, 0.14, 0.12, rot);
    }
    for (let i = 0; i <= bays; i++) {
      const lx = -w / 2 + i * bw;
      if (door?.boardVeranda && Math.abs(lx - door.doorX) < door.gapW / 2 + .16) continue;
      verandaPost(lx);
    } }
  // 戸口の面：腰の舞良戸（黒い板・横の桟）と、上の明かり障子（白い紙に格子）。戸口の間は空ける
  // 両の長い面（戸口の面と裏）に。裏は腰を土壁にし、上は格子窓（連子）
  for (const side of [ds, -ds]) {
  const fz0 = side * (d / 2 + 0.1);   // 壁の厚み（0.14）より外
  if (utilityBoardWalls) {
    // 用屋と、板壁を指定した社。社の拝所の障子は外壁と同じ穴を抜いて残す。
    const faceWindows = rearWindows ? rearWindows.filter(win => win.face === 'z' && win.s === side) : utilityWindow && utilityWindow.s === side ? [utilityWindow] : [];
    const spans = side === ds && door
      ? [[-w / 2, door.doorX - door.gapW / 2], [door.doorX + door.gapW / 2, w / 2]]
      : [[-w / 2, w / 2]];
    // 稲葉山の板壁は外壁の上端まで張り、玄関の鴨居上も同じ板で閉じる。
    // 戸口を縦一列抜くと上だけ土壁が露出する。実際の開口上端から張り始め、
    // 共通室内の引き戸・鴨居・通れる高さには板を重ねない。
    const boardTop = door?.recessedFloor ? H * .925 : 2.625;
    if (side === ds && door?.recessedFloor && door.entryTop < boardTop)
      spans.push([door.doorX - door.gapW / 2, door.doorX + door.gapW / 2, door.entryTop]);
    for (const [a, b, boardBottom = .475] of spans) {
      const count = Math.max(1, Math.ceil((b - a) / .3));
      if (b <= a) continue;
      for (let j = 0; j < count; j++) {
        const mid = a + (j + .5) * (b - a) / count, width = (b - a) / count - .008;
        const holes = faceWindows.map(win => ({ t0: win.t - win.w / 2 - mid,
          t1: win.t + win.w / 2 - mid, y0: .075 + win.y0, y1: .075 + win.y1 }));
        if (side !== ds && utilityWindows) holes.push({ t0: -.39 - mid, t1: .39 - mid, y0: 1.345, y1: 1.805 });
        for (const [l, r, low, high] of facePanels(width, 2.15, holes)) {
          const [px, pz] = P(mid + (l + r) / 2, fz0);
          // 本の CG（稲葉山・岡崎）の番所・長屋の茶の板壁。灰に寄せると霧の中で黒く沈む
          _box(B.wood, [0x8a6d4e, 0x7a5f44, 0x947656, 0x80664a][(j + (side > 0 ? 0 : 2)) % 4],
            px, y + .475 + (low + high) / 2, pz, r - l, high - low, .06, rot);
        }
      }
      for (const yy of [.72, 2.48]) {
        const mid = (a + b) / 2;
        const holes = faceWindows.map(win => ({ t0: win.t - win.w / 2 - mid,
          t1: win.t + win.w / 2 - mid, y0: .55 + win.y0 - yy + .04, y1: .55 + win.y1 - yy + .04 }));
        for (const [l, r, low, high] of facePanels(b - a, .08, holes)) {
          const [px, pz] = P(mid + (l + r) / 2, fz0 + side * .04);
          _box(B.wood, 0x62503a, px, y + yy - .04 + (low + high) / 2, pz, r - l, high - low, .08, rot);
        }
      }
      // 板小屋の裏に小さな連子の明かり取り。戸口のある面には置かない。
      // 寸法は推定。ガラスや白い障子を足さず、既存の木材の束へ結合する。
      if (!rearWindows && side !== ds && b - a > 1.5) {
        const mid = (a + b) / 2, height = 2.05;
        const [px, pz] = P(mid, fz0 + side * .05);
        if (!utilityWindows) _box(B.wood, 0x251f18, px, y + height, pz, .78, .46, .025, rot);
        // 岩村の裏窓は外の連子から内板戸の見込み板まで四方枠を通す。
        // 開口の板壁の切り口を覆い、連子の上下端を枠の内へ差し込む推定復元。
        // 内板戸の二筋は枠より内側に残す。既存の木材の束へ結合する。
        const frameZ = utilityWindows ? side * (d / 2 - .02) : fz0 + side * .05;
        const [frameX, frameWorldZ] = P(mid, frameZ);
        for (const yy of [height - .25, height + .25])
          _box(B.wood, 0x514737, frameX, y + yy, frameWorldZ, .9, .07, utilityWindows ? .46 : .12, rot);
        if (utilityWindows) for (const edge of [-1, 1]) {
          const [qx, qz] = P(mid + edge * (.39 + .035), frameZ);
          _box(B.wood, 0x514737, qx, y + height, qz, .07, .43, .46, rot);
        }
        for (let k = -3; k <= 3; k++) {
          const [qx, qz] = P(mid + k * .12, fz0 + side * .09);
          _box(B.wood, k % 2 ? 0x786953 : 0x655744, qx, y + height, qz, .045, .46, .05, rot);
        }
      }
    }
    // 格子を開口の四周の框で受ける。背面の柱・長押を避けた同じ位置に納める。
    // 外の格子（outerLattice）を持つこの面の窓（野田・福島）だけ。稲葉山・岩村の窓は別の作りなので通さない。
    for (const v of faceWindows) {
      if (!v.outerLattice) continue;
      for (const edge of [-1, 1]) {
        const [px, pz] = P(v.t + edge * (v.w / 2 + .04), fz0);
        _box(B.wood, 0x514737, px, y + .55 + (v.y0 + v.y1) / 2, pz, .08, v.y1 - v.y0, .12, rot);
      }
      for (const yy of [v.y0 - .04, v.y1 + .04]) {
        const [px, pz] = P(v.t, fz0);
        _box(B.wood, 0x514737, px, y + .55 + yy, pz, v.w + .16, .08, .12, rot);
      }
      const lattice = v.outerLattice;
      for (let j = 0; j <= lattice.divisions; j++) {
        const [px, pz] = P(v.t - v.w / 2 + v.w * j / lattice.divisions, fz0);
        _box(B.wood, 0x655744, px, y + .55 + (v.y0 + v.y1) / 2, pz,
          lattice.width, v.y1 - v.y0, lattice.depth, rot);
      }
    }
    continue;
  }
  for (let i = 0; i < bays; i++) {
    let c0 = -w / 2 + i * bw + 0.12, c1 = c0 + bw - 0.24, cm = (c0 + c1) / 2;
    if (side === ds && door && cm > door.doorX - door.gapW && cm < door.doorX + door.gapW) continue;
    if (rearWindows && side === ds && door) {
      // 二間の正面でも腰板と窓枠を戸口へ突き出さない。
      if (cm < door.doorX) c1 = Math.min(c1, door.doorX - door.gapW / 2);
      else c0 = Math.max(c0, door.doorX + door.gapW / 2);
      cm = (c0 + c1) / 2;
    }
    // 岩村の外の窓枠・連子も、床の間や神座を避けた共通の窓割りに従う。
    // 穴と可動戸だけを除くと、塞いだ土壁に窓枠と格子の飾りが残る。
    // 正面の障子も含め、実際に開口を残した柱間だけに造作を組む。
    if (rearWindows && !rearWindows.some(win => win.face === 'z' && win.s === side
      && Math.abs(win.t - cm) < .01)) continue;
    if (side === ds && door?.paperWindows) {
      // 窓下の舞良戸と横桟も障子の幅で止め、開けた玄関を塞がない。
      const v = door.paperWindows.find(v => v.bay === i);
      if (!v) continue;
      c0 = v.t - v.w / 2; c1 = v.t + v.w / 2; cm = v.t;
    }
    // 稲葉山は戸口と重ならない幅へ調整済み。外の腰板も同じ窓幅で受ける。
    if (side === ds && door && !door.paperWindows && cm > door.doorX - door.gapW && cm < door.doorX + door.gapW) continue;
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
      const rearWindow = rearWindows && rearWindows.find(win => win.face === 'z' && win.s === side
        && Math.abs(win.t - cm) < .01);
      if (rearWindows && !rearWindow) continue;
      const bottom = rearWindow ? .55 + rearWindow.y0 : 1.5;
      const top = rearWindow ? .55 + rearWindow.y1 : 2.3;
      const middle = (bottom + top) / 2, height = top - bottom;
      const [px, pz] = P(cm, fz0);
      if (!rearWindows) _box(B.wood, 0x1c1610, px, y + 1.9, pz, (c1 - c0) * 0.7, 0.8, 0.03, rot);
      else {
        // 窓台・まぐさと縦枠を外壁から内壁まで通し、穴の土壁の断面を覆う。
        const width = rearWindow.w, lz = side * (d / 2 - .04);
        for (const yy of [bottom, top]) {
          const [qx, qz] = P(cm, lz);
          _box(B.wood, 0x4a3a2c, qx, y + yy, qz, width + .14, .07, .36, rot);
        }
        for (const edge of [-1, 1]) {
          const [qx, qz] = P(cm + edge * (width / 2 + .035), lz);
          _box(B.wood, 0x4a3a2c, qx, y + middle, qz, .07, height, .36, rot);
        }
      }
      for (let k = -3; k <= 3; k++) { const [gx, gz] = P(cm + k * (c1 - c0) * 0.1, fz0 + side * 0.02); _box(B.wood, 0x4a3a2c, gx, y + middle, gz, 0.05, height + .04, 0.05, rot); }
      continue;
    }
    if (side !== ds) continue;
    const ds2 = side;
    const [px, pz] = P(cm, fz0);
    _box(B.wood, 0x2e241c, px, y + 0.95, pz, c1 - c0, 0.8, 0.05, rot);
    for (const hy of [0.75, 1.05, 1.3]) _box(B.wood, 0x4a3a2c, px, y + hy, pz + 0, c1 - c0, 0.035, 0.07, rot);
    if (rearWindows) {
      // 岩村の正面は共通の動く障子だけを描く。外の固定紙・桟で開口を塞がない。
      const lz = side * (d / 2 - .04);
      for (const yy of [1.375, 2.525]) {
        const [qx, qz] = P(cm, lz);
        _box(B.wood, 0x3a2c20, qx, y + yy, qz, c1 - c0 + .12, .06, .4, rot);
      }
      for (const edge of [-1, 1]) {
        const [qx, qz] = P(cm + edge * ((c1 - c0) / 2 + .03), lz);
        _box(B.wood, 0x3a2c20, qx, y + 1.95, qz, .06, 1.15, .4, rot);
      }
      continue;
    }
    // 動く障子は室内の共通部品に任せ、外に固定の紙と桟を重ねない。
    if (door?.slidingPaper) continue;
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
      const mid = -d / 2 + (j + .5) * d / count;
      const holes = rearWindows ? rearWindows.filter(win => win.face === 'x' && win.s === side)
        .map(win => ({ t0: win.t - win.w / 2 - mid, t1: win.t + win.w / 2 - mid,
          y0: .075 + win.y0, y1: .075 + win.y1 })) : [];
      for (const [l, r, low, high] of facePanels(d / count - .008, 2.15, holes)) {
        const [px, pz] = P(side * (w / 2 + .1), mid + (l + r) / 2);
        _box(B.wood, j % 3 ? 0x685e4e : 0x7a6b56, px, y + .475 + (low + high) / 2, pz,
          .06, high - low, r - l, rot);
      }
    }
  }
  // 社の板壁の切り口を窓枠で受ける。窓の内側の障子・溝へは張り出さない。
  if (utilityBoardWalls && rearWindows) for (const win of rearWindows) {
    const sideFace = win.face === 'x';
    const frame = (along, height, length, tall) => {
      const [px, pz] = sideFace ? P(win.s * (w / 2 + .14), along) : P(along, win.s * (d / 2 + .14));
      _box(B.wood, 0x514737, px, y + .55 + height, pz,
        sideFace ? .08 : length, tall, sideFace ? length : .08, rot);
    };
    for (const height of [win.y0, win.y1]) frame(win.t, height, win.w + .14, .07);
    for (const edge of [-1, 1]) frame(win.t + edge * (win.w / 2 + .035),
      (win.y0 + win.y1) / 2, .07, win.y1 - win.y0);
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
      _gable(B.wood, j % 4 === 0 ? 0x86705a : 0x6e5844, px, y + H + .08, pz, step - .012, rd, rot, pitch, .07);
    }
    if (fieldBoards) {
      const [px, pz] = P(0, 0);
      _box(B.wood, 0x5e5040, px, y + H + .19 + Math.tan(pitch) * rd / 2, pz, rw + .15, .12, .28, rot);
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
        B.wood.push(_paint(g, fieldBoards ? fieldBoards[(j + (side > 0 ? 1 : 3)) % fieldBoards.length] : j % 3 === 0 ? 0x7c6852 : 0x6a5642));
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

let templePostShape = null;
function villageGoten(rt, x, z, o = {}) {
  const { w = 12, d = 8, rot = 0, tile = true, team = 0, hp = 900, name = '御殿' } = o;
  const y = o.naka ? interiorBase(rt.world, x, z, w, d, rot) : rt.world.heightAt(x, z);
  const H = 3.0;
  const B = _kitBag();
  // 土壁の色を指定した城だけに使う。指定のない館は従来の漆喰のまま。
  const fieldFort = o.fieldFort === true && true;
  // 高遠の用屋も明示指定で同じ縦板と小窓を使う。室内の間取りは各城のまま。
  const utilityBoardWalls = true && (o.utilityBoardWalls === true || ['iwamura_nagaya', 'iwamura_kura', 'iwamura_bansho'].includes(o.profile));
  // 明示した山城だけの古板。ほかの砦の屋根・壁は既存の形を使う。色は本の CG（岡崎・躑躅ヶ崎・春日山）の茶の板葺きに寄せる（灰に沈めない）
  const fieldBoards = fieldFort && o.weatheredBoards === true
    ? (o.boardRoofColors || [0x7d6650, 0x6e5a46, 0x907760, 0x786250]) : null;
  const wallColor = fieldFort ? 0x786653 : o.earth;
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const bays = Math.max(2, Math.round(w / 3));
  // 指定した戸口が柱の位置でも、通れる口の中へ柱を描かない。
  const villageHall = SETTINGS.quality === 'high' && o.profile === 'shitaragahara' && o.kind === 'hondo';
  // 小堂は室内の丸柱に合わせ、外周も丸柱と柱頭の角材で軒を受ける推定の造り。
  // 原形を共有し、設営時に既存の木材の束へまとめる。戸口と窓の幅は保つ。
  const outerPost = (px, pz) => {
    if (!villageHall) {
      _box(B.wood, 0x4e3a28, px, y + H / 2, pz, .22, H, .22, rot);
      return;
    }
    // 内陣境の丸柱と同じく柱頭・柱脚を絞る。柱頭の角材へ胴を納め、円筒の切り口を残さない。
    if (!templePostShape) templePostShape = new THREE.LatheGeometry([
      new THREE.Vector2(0, -.5), new THREE.Vector2(.82, -.5),
      new THREE.Vector2(1, -.42), new THREE.Vector2(1, .38),
      new THREE.Vector2(.82, .5), new THREE.Vector2(0, .5),
    ], 12);
    // 柱脚は下の礎石・継ぎ足す束の上端で止める。地面から描くと、
    // 礎石へ丸柱が食い込み、束とも同じ場所で重なる。柱頭の高さは保つ。
    const foot = .2, shaftH = H - .12 - foot;
    const post = templePostShape.clone().scale(.11, shaftH, .11);
    post.rotateY(rot); post.translate(px, y + foot + shaftH / 2, pz);
    B.wood.push(_paint(post, 0x4e3a28));
    _box(B.wood, 0x4e3a28, px, y + H - .06, pz, .22, .12, .22, rot);
  };
  // 小堂の外壁の開口を、中の板戸と同じ幅・上端にする。閉めた戸の周囲に光の筋を残さない。
  const ds = o.door ?? 1, doorX = o.doorX ?? (o.profile && bays % 2 ? 0 : (w / bays) / 2), gapW = villageHall ? 1.4 : 1.6;
  const entryTop = villageHall ? .55 + Math.min((o.interiorH ?? H - .1) - .3, 2) : 2.6;
  for (let i = 0; i <= bays; i++) {
    const lx = -w / 2 + i * (w / bays);
    for (const sd of [-1, 1]) {
      if (o.naka && sd === ds && Math.abs(lx - doorX) < gapW / 2 + .11) continue;
      const [px, pz] = P(lx, sd * d / 2);
      outerPost(px, pz);
    }
  }
  if (villageHall) {
    // 小堂の妻側にも柱を立てる。中の側壁と同じ柱割りにし、
    // 外から見た時も格天井を壁板だけで支えた姿にしない。隅柱は上で作る。
    const sideBays = Math.max(2, Math.round((d - .3) / 1.9));
    for (const sd of [-1, 1]) for (let i = 1; i < sideBays; i++) {
      const [px, pz] = P(sd * w / 2, -(d - .3) / 2 + (d - .3) * i / sideBays);
      outerPost(px, pz);
    }
    // 小堂の外周は頭貫で柱同士を結び、土壁の上端を受ける推定の架構。
    // 窓と戸口の上に収め、丸柱の面で木口を止める。室内の長押とは別の通りにする。
    // 既存の木材の束へ設営時だけまとめ、戸の溝や通れる幅は変えない。
    const tieY = y + H - .24, postHalf = .11;
    for (const sd of [-1, 1]) {
      for (let i = 0; i < bays; i++) {
        const left = -w / 2 + i * w / bays + postHalf;
        const right = -w / 2 + (i + 1) * w / bays - postHalf;
        const [px, pz] = P((left + right) / 2, sd * d / 2);
        _box(B.wood, 0x4e3a28, px, tieY, pz, right - left, .12, .18, rot);
      }
      for (let i = 0; i < sideBays; i++) {
        // 側柱の芯は既存の柱割りを共用し、端だけ隅柱へつなぐ。
        const back = (i === 0 ? -d / 2 : -(d - .3) / 2 + (d - .3) * i / sideBays) + postHalf;
        const front = (i + 1 === sideBays ? d / 2 : -(d - .3) / 2 + (d - .3) * (i + 1) / sideBays) - postHalf;
        const [px, pz] = P(sd * w / 2, (back + front) / 2);
        _box(B.wood, 0x4e3a28, px, tieY, pz, .18, .12, front - back, rot);
      }
    }
  }
  // 中に入れる御殿（o.naka）は、戸口の面の壁に口を開ける（戸口は柱の間の真ん中）
  const wallZ = (lz, ww, th, hex) => {
    if (villageHall && o.naka && Math.sign(lz) !== ds) {
      // 小堂の裏は左右の柱間を抜き、中央の来迎壁の背後には窓を開けない。
      // 内陣の窓・当たりと同じ柱間に、外壁の開口を納める。
      const low = H * .175, holes = [];
      for (let i = 0; i < bays; i += 2) {
        const cm = -w / 2 + (i + .5) * w / bays, half = (w / bays - .24) * .35;
        holes.push({ t0: cm - half, t1: cm + half, y0: 1.5 - low, y1: 2.3 - low });
      }
      for (const [a, b, lo, hi] of facePanels(ww, H * .75, holes)) {
        const [qx, qz] = P((a + b) / 2, lz);
        _box(B.plaster, hex, qx, y + low + (lo + hi) / 2, qz, b - a, hi - lo, th, rot);
      }
      return;
    }
    if (o.templePaper && o.naka && Math.sign(lz) === ds) {
      // 外側の白壁も紙の位置で抜く。内側だけ透かしても板が残るため。
      const low = H * .175, holes = [{ t0: doorX - gapW / 2, t1: doorX + gapW / 2, y0: 0, y1: entryTop - low }];
      for (let i = 0; i < bays; i++) {
        // 設楽原の小堂は内側へ寄せた隅柱を避け、動く障子と同じ幅だけ壁を抜く。
        const inset = villageHall ? .42 : .12;
        const c0 = -w / 2 + i * w / bays + inset, c1 = c0 + w / bays - inset * 2, cm = (c0 + c1) / 2;
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
    const [qx, qz] = P(doorX, lz); _box(B.plaster, hex, qx, (y + entryTop + y1) / 2, qz, gapW, y1 - y - entryTop, th, rot);
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
  // 設楽原の小堂は正面の壁を隅柱まで届かせる。御殿用の幅では妻壁との間に
  // 縦の隙間が残り、内壁との間から光が抜ける。戸口と明かり障子の穴は wallZ と共用する。
  wallZ(d / 2 - 0.08, villageHall ? w : w * 0.94, 0.08, wallColor ?? 0xefe9da);
  const decks = [];
  let IN = null;
  if (o.naka) {
    // 中に入れる御殿（naka.js。kaito 10/2）：戸口（o.door：+1 は縁側の面、-1 は裏の面）・奥の間の襖・明かり障子。
    // 城主はふつう奥の間（天守の無い城の「大将の居場所」）
    IN = addInterior(rt.world, {
      name, kind: o.kind || 'goten', profile: o.profile, x, z, rot, levels: [{ y: y + 0.55, w: w - 0.3, d: d - 0.3, h: o.interiorH ?? H - 0.1 }],
      // 小堂の石段は幅一・二メートルの縁側の先へ接続する。内寸との差十五センチも含める。
      door: { side: ds, lx: doorX, w: 1.4 }, approach: { pad: villageHall ? 1.35 : 0.35, len: 1.1 }, oku: o.oku ?? 0.45, where: o.where, wins: o.wins,
    });
    decks.push(...IN.deckIds);
    // 設楽原の小堂は、見えている板縁の端まで歩けるようにする。中央の昇り口は既存の段を使う。
    if (SETTINGS.quality === 'high' && o.profile === 'shitaragahara' && o.kind === 'hondo') {
      const [cx, cz] = P(0, ds * (d / 2 + .6));
      // 足場の既定の余白は使わず、切目縁の板端で止める。
      // 縁先や左右の板のない所へ四十センチ踏み出して宙に立たせない。
      decks.push(addDeck({ x0: -(w + .6) / 2, x1: (w + .6) / 2, z0: -.6, z1: .6,
        rot, cx, cz, y: y + .44, pad: 0, name: `${name}の縁側` }));
    }
    // 戸口の両脇に篝（灯り二つ）：外からでも入口が分かる（B088）
    // 本堂の広い石段でも篝を踏板の外へ置く。段幅は共通処理と同じ戸幅＋三十センチ。
    const fireSide = 1.3;
    if (o.doorFire !== false) for (const sd of [-1, 1]) { const [fx, fz] = P(doorX + sd * fireSide, ds * (d / 2 + 1.5)); rt.world.addFire(fx, fz, { torch: true, h: 0.9 }); }
  } else {
    decks.push(addDeck({ x0: -w / 2 - 0.1, x1: w / 2 + 0.1, z0: d / 2 - 0.1, z1: d / 2 + 1.3, rot, cx: x, cz: z, y: y + 0.42, name: `${name}の縁側` }));
    decks.push(addDeck({ x0: -w / 2 - 0.1, x1: w / 2 + 0.1, z0: -d / 2 - 0.1, z1: d / 2 + 0.1, rot, cx: x, cz: z, y: y + 0.55, name }));
  }
  if (o.templePaper) B.templePaper = [];
  B.slidingTemplePaper = o.profile === 'shitaragahara' && o.kind === 'hondo' && SETTINGS.quality === 'high';
  if (o.templeBoardRoof && !tile) B.templeBoard = [];
  villageGotenDress(B, P, x, y, z, w, d, rot, H, bays, ds, o.naka ? {
    doorX, gapW, separateFloor: villageHall,
    floorJoints: villageHall ? IN.levels[0].layout.rooms.map(room => room.z1) : null,
  } : null, tile, o.eave, B.templeBoard ? .1 : o.eaveThickness, fieldFort, o.boardRoof,
    (o.profile?.startsWith('iwamura') || o.layeredBoardRoof === true), utilityBoardWalls, fieldBoards, o.odaniBoards === true);
  if (villageHall) {
    // 縁板と四ミリの目地は gotenDress で組む。
    // 異なる間隔の黒い棒を上へ重ねず、板端と実際の隙間をそのまま見せる。
    const width = w + .6;
    // 板縁の床下は推定の大引と根太で受ける。奥行き方向の縁板に直交して
    // 根太を渡し、その下の大引を既存の土台と縁束へ掛ける。
    // 上端は板の下面へ合わせ、足場を変えず既存の木材の束へ一度だけ結合する。
    for (let i = 0; i <= bays; i++) {
      const [px, pz] = P(-w / 2 + i * w / bays, ds * (d / 2 + .55));
      _box(B.wood, 0x3a2c20, px, y + .22, pz, .12, .1, 1.3, rot);
    }
    for (const offset of [.3, .75]) {
      const [px, pz] = P(0, ds * (d / 2 + offset));
      _box(B.wood, 0x493829, px, y + .315, pz, width, .09, .09, rot);
    }
    // 室内の水平な床は斜面の高い側に合わせてある。柱下と縁束を地面へ下ろし、礎石で受ける。
    // 石の四隅を設営時だけ測り、下り側にも浮いた隙間を残さない。
    const footing = (lx, lz, joinY, timberW) => {
      let low = Infinity, high = -Infinity;
      for (const dx of [-.16, .16]) for (const dz of [-.16, .16]) {
        const [gx, gz] = P(lx + dx, lz + dz), ground = rt.world.heightAt(gx, gz);
        low = Math.min(low, ground); high = Math.max(high, ground);
      }
      // 地面が高い所では石を受け木の下面で切り詰め、土台や縁框へ貫通させない。
      if (high >= joinY) return;
      const top = Math.min(high + .1, joinY), [px, pz] = P(lx, lz);
      _box(B.wood, 0x777063, px, (low - .05 + top) / 2, pz, .32, top - low + .05, .32, rot);
      if (top < joinY) _box(B.wood, 0x3a2c20, px, (top + joinY) / 2, pz,
        timberW, joinY - top, timberW, rot);
    };
    for (let i = 0; i <= bays; i++) {
      const lx = -w / 2 + i * w / bays;
      // 縁束は礎石から縁框の下面まで一本で通す。定寸の束を重ねない。
      // 板縁の先を受ける縁框（下の gotenDetail と同じ位置）の芯へ揃える。
      // 八センチ壁側へずれた束では、十二センチ角の木口が框からはみ出す。
      footing(lx, ds * (d / 2 + 1.18), y + .22, .12);
      // 正面の戸口の下には柱を足さず、既存の段と出入りを保つ。
      for (const sd of [-1, 1]) {
        if (o.naka && sd === ds && Math.abs(lx - doorX) < gapW / 2 + .11) continue;
        footing(lx, sd * d / 2, y + .2, .22);
      }
    }
    const sideBays = Math.max(2, Math.round((d - .3) / 1.9));
    for (const sd of [-1, 1]) for (let i = 1; i < sideBays; i++) {
      footing(sd * w / 2, -(d - .3) / 2 + (d - .3) * i / sideBays, y + .2, .22);
    }
    // 内陣の須弥壇と板床を受ける大引にも床束と礎石を置く推定復元。
    // 大引の芯は下の床組と共用し、斜面の低い側だけ束を地面まで延ばす。
    for (let i = 1; i < bays; i++) footing(-w / 2 + i * w / bays, 0, y + .23, .12);
    // 内陣境の丸柱と格天井の荷重も、床板と細い根太だけへ預けない。
    // 間取りと同じ境へ横向きの受け木を渡し、各柱間の床束・礎石へ下ろす推定の床組。
    // 前後へ通る既存の大引の内面で木口を止め、同じ高さの材を交差させない。
    const inner = IN?.levels[0].layout.rooms.find(room => room.name === '内陣');
    if (inner) {
      for (let i = 0; i < bays; i++) {
        const left = -w / 2 + i * w / bays + (i ? .06 : .1);
        const right = -w / 2 + (i + 1) * w / bays - (i + 1 < bays ? .06 : .1);
        const lx = (left + right) / 2, lz = inner.z1;
        const [px, pz] = P(lx, lz);
        _box(B.wood, 0x3a2c20, px, y + .29, pz, right - left, .12, .12, rot);
        footing(lx, lz, y + .23, .12);
      }
    }
    // 須弥壇の前後の框を、それぞれ受け木・床束・礎石で支える推定の納まり。
    // 中央一本だけに荷を集めず、両脇の大引の内面へ受け木を突き付ける。
    // 室内の壇の位置を共用し、床面・出入口と既存の大引は動かさない。
    const altar = IN?.levels[0].layout.props.find(p => p.part === 'altar');
    if (altar) {
      const left = -w / 2 + w / bays, right = w / 2 - w / bays;
      if (altar.x > left + .12 && altar.x < right - .12) {
        // 受け木の外面を壇の前後の外寸へ揃え、床下から木口を張り出させない。
        // 既存の木材の束と形を使い、設営時だけ二列へ分ける。
        const offset = Math.max(0, altar.d / 2 - .06);
        for (const side of offset > 0 ? [-1, 1] : [0]) {
          const lz = altar.z + side * offset;
          const [px, pz] = P((left + right) / 2, lz);
          _box(B.wood, 0x3a2c20, px, y + .29, pz, right - left - .12, .12, .12, rot);
          footing(altar.x, lz, y + .23, .12);
        }
      }
    }
  }
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
function villageGotenDress(B, P, x, y, z, w, d, rot, H, bays, ds, door, tile, eave = 1.3, eaveThickness = .24, fieldFort = false, boardRoof = false, iwamuraBoards = false, utilityBoardWalls = false, fieldBoards = null, odaniBoards = false, utilityWindow = null) {
  const rearWindows = door?.rearWindows;
  const bw = w / bays;
  // 床下：土台と束（床の高さ 0.55m の下の暗がり）
  // 設楽原の小堂は四隅の土台を突き付け、同じ高さの上面を重ねない。
  // 前後の土台を隅の外面まで渡し、側面の土台はその内面で止める。
  const separateFloor = door?.separateFloor;
  for (const lz of [-d / 2, d / 2]) { const [px, pz] = P(0, lz); _box(B.wood, 0x3a2c20, px, y + 0.2, pz, w + (separateFloor ? .2 : .1), 0.3, 0.2, rot); }
  for (const lx of [-w / 2, w / 2]) { const [px, pz] = P(lx, 0); _box(B.wood, 0x3a2c20, px, y + 0.2, pz, 0.2, 0.3, separateFloor ? d - .2 : d + .1, rot); }
  if (door?.separateFloor) {
    // 設楽原の小堂は室内の板床と同じ高さに外観の床を重ねない。
    // 外周の二十センチは元の高さで残し、室内の下地だけ板床より下げる。
    // 内寸は addInterior と共通。四隅の床框も重ねず、既存の木材の束へまとめる。
    const iw = w - .3, id = d - .3;
    for (const side of [-1, 1]) {
      const [px, pz] = P(0, side * (d / 2 - .05));
      _box(B.wood, 0x5a4634, px, y + .5, pz, w + .1, .1, .2, rot);
      const [qx, qz] = P(side * (w / 2 - .05), 0);
      _box(B.wood, 0x5a4634, qx, y + .5, qz, .2, .1, id, rot);
    }
    // 室内の床下も一枚の厚い板で塞がず、大引と根太で支える推定の床組。
    // 奥行き方向の床板に根太を直交させ、上端を室内の裏板の下面（床高から八センチ下）へ合わせる。
    // 大引は正背面の土台の内面へ納め、中央の床束で受ける。
    // 土台と上面が同じ高さなので、木口を突き通して重ねない。
    for (let i = 1; i < bays; i++) {
      const [px, pz] = P(-w / 2 + i * bw, 0);
      _box(B.wood, 0x3a2c20, px, y + .29, pz, .12, .12, d - .2, rot);
    }
    // 室内の奥壁を基準に四十五センチ間隔で割り、一・八メートルの板と
    // 半間ずらした継ぎ目を根太の芯で受ける。両端だけは外周の床框の内側へ納める。
    const joists = Math.max(2, Math.ceil(id / .45));
    const joistPositions = [];
    for (let i = 0; i <= joists; i++) {
      const lz = i === 0 ? -id / 2 + .045 : i === joists ? id / 2 - .045 : -id / 2 + i * .45;
      joistPositions.push(lz);
    }
    // 内陣と外陣で切り分けた床板の端にも根太を置く。等間隔の根太だけでは
    // 間取りの境で木口が宙に出る。室内と同じ境を使い、近い根太は一本へ広げて受ける。
    // 板の端へ四センチ五ミリ掛かる幅を保ち、同じ面の重なりは作らない。
    const joistSpans = joistPositions.map(lz => [lz - .045, lz + .045]);
    for (const lz of door.floorJoints || []) {
      if (lz <= -id / 2 + .09 || lz >= id / 2 - .09) continue;
      joistSpans.push([lz - .045, lz + .045]);
    }
    joistSpans.sort((a, b) => a[0] - b[0]);
    const supports = [];
    for (const span of joistSpans) {
      const last = supports[supports.length - 1];
      if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
      else supports.push(span);
    }
    for (const [back, front] of supports) {
      const lz = (back + front) / 2;
      const [px, pz] = P(0, lz);
      // 根太の上端は外周の床框に二センチ掛かる高さ。木口は框の内面で止める。
      // 幅を十センチ足すと左右五センチずつ框へ入り込み、床下の木組みが重なる。
      _box(B.wood, 0x493829, px, y + .41, pz, iw, .12, front - back, rot);
    }
  } else {
    const [px, pz] = P(0, 0);
    _box(B.wood, 0x5a4634, px, y + .5, pz, w + .1, .1, d + .1, rot);
  }
  // 縁側：戸口の面に幅 1.2m の板縁、縁束と縁框
  { const lz = ds * (d / 2 + 0.6), [px, pz] = P(0, lz);
    if (door?.separateFloor) {
      // 設楽原の小堂の板縁は推定の切目縁。厚い一枚板で済ませず、
      // 壁から外へ張る縁板を縁框と壁際の受け木で支える。歩行面の高さ・範囲は保つ。
      // 静止した木材の束へ一度だけまとめ、材質と箱の作りを共用する。
      const count = Math.ceil((w + .6) / .24), step = (w + .6) / count;
      // 切目縁の木目は壁から縁先へ通す。無地の箱では板の長手も木口も読めない。
      // 一枚の原形を複製し、既存の下見板の木材へまとめる。室内床と足場の高さは保つ。
      const board = partBox(step - .004, .08, 1.2);
      const pos = board.attributes.position, normal = board.attributes.normal, uv = board.attributes.uv;
      for (let j = 0; j < pos.count; j++) {
        const end = Math.abs(normal.getZ(j)) > .5;
        uv.setXY(j, (Math.abs(normal.getX(j)) > .5 ? pos.getY(j) : pos.getX(j)) * 2,
          (end ? pos.getY(j) : pos.getZ(j)) * 2);
      }
      for (let i = 0; i < count; i++) {
        const lx = -(w + .6) / 2 + (i + .5) * step;
        const [qx, qz] = P(lx, lz);
        const g = board.clone();
        // 板ごとに絵の始点をずらし、同じ節が横一列に並ぶのを避ける。
        const tex = g.attributes.uv;
        for (let j = 0; j < tex.count; j++) tex.setXY(j, tex.getX(j) + i * .173, tex.getY(j) + (i % 5) * .137);
        g.rotateY(rot); g.translate(qx, y + .4, qz);
        B.shitami.push(_paint(g, i % 3 ? 0x6a5440 : 0x725b44));
        // 壁際と縁先の受け木へ角釘で留める推定の納まり。頭だけ板面から二ミリ出す。
        // 目地へ釘を置かず、既存の木材の束へ黒い小片としてまとめ、描画の束を増やさない。
        for (const offset of [.06, 1.18]) {
          const [nx, nz] = P(lx, ds * (d / 2 + offset));
          _box(B.wood, 0x39362e, nx, y + .441, nz, .012, .002, .012, rot);
        }
      }
      board.dispose();
      const [qx, qz] = P(0, ds * (d / 2 + .06));
      _box(B.wood, 0x3e2e22, qx, y + .29, qz, w + .6, .14, .12, rot);
    } else _box(B.wood, 0x6a5440, px, y + 0.4, pz, w + 0.6, 0.08, 1.2, rot);
    const [fx, fz] = P(0, ds * (d / 2 + 1.18)); _box(B.wood, 0x3e2e22, fx, y + (door?.separateFloor ? .29 : .34), fz, w + 0.6, 0.14, 0.12, rot);
    // 設楽原の小堂は地形に合わせた礎石と縁束を呼び元で組む。
    // 定寸の束も描くと、石と木が重なり、同じ面がちらつく。
    if (!door?.separateFloor) for (let i = 0; i <= bays; i++) {
      const [qx, qz] = P(-w / 2 + i * bw, ds * (d / 2 + 1.1));
      _box(B.wood, 0x3a2c20, qx, y + .18, qz, .12, .36, .12, rot);
    } }
  // 戸口の面：腰の舞良戸（黒い板・横の桟）と、上の明かり障子（白い紙に格子）。戸口の間は空ける
  // 両の長い面（戸口の面と裏）に。裏は腰を土壁にし、上は格子窓（連子）
  for (const side of [ds, -ds]) {
  const fz0 = side * (d / 2 + 0.1);   // 壁の厚み（0.14）より外
  if (utilityBoardWalls) {
    // 番所・長屋・兵糧蔵を居館と同じ障子面にしない。戸口の実幅を空けた縦板張り。
    const spans = side === ds && door
      ? [[-w / 2, door.doorX - door.gapW / 2], [door.doorX + door.gapW / 2, w / 2]]
      : [[-w / 2, w / 2]];
    // 稲葉山の板壁は外壁の上端まで張り、玄関の鴨居上も同じ板で閉じる。
    // 戸口を縦一列抜くと上だけ土壁が露出する。実際の開口上端から張り始め、
    // 共通室内の引き戸・鴨居・通れる高さには板を重ねない。
    const boardTop = door?.recessedFloor ? H * .925 : 2.625;
    if (side === ds && door?.recessedFloor && door.entryTop < boardTop)
      spans.push([door.doorX - door.gapW / 2, door.doorX + door.gapW / 2, door.entryTop]);
    for (const [a, b, boardBottom = .475] of spans) {
      const count = Math.max(1, Math.ceil((b - a) / .3));
      if (b <= a) continue;
      for (let j = 0; j < count; j++) {
        const center = a + (j + .5) * (b - a) / count, width = (b - a) / count - .008;
        const holes = utilityWindow && side === utilityWindow.s ? [{
          t0: utilityWindow.t - utilityWindow.w / 2 - center, t1: utilityWindow.t + utilityWindow.w / 2 - center,
          y0: utilityWindow.y0 + .55 - .475, y1: utilityWindow.y1 + .55 - .475,
        }] : [];
        for (const [lo, hi, bottom, top] of facePanels(width, boardTop - boardBottom, holes)) {
          const [px, pz] = P(center + (lo + hi) / 2, fz0);
          _box(B.wood, [0x716654, 0x625848, 0x7a6b56, 0x685e4e][(j + (side > 0 ? 0 : 2)) % 4],
            px, y + boardBottom + (bottom + top) / 2, pz, hi - lo, top - bottom, .06, rot);
        }
      }
      for (const yy of [.72, 2.48]) {
        if (yy - .04 < boardBottom) continue;
        const [px, pz] = P((a + b) / 2, fz0 + side * .04);
        _box(B.wood, 0x514737, px, y + yy, pz, b - a, .08, .08, rot);
      }
      // 板小屋の裏に小さな連子の明かり取り。戸口のある面には置かない。
      // 寸法は推定。ガラスや白い障子を足さず、既存の木材の束へ結合する。
      if (side !== ds && b - a > 1.5) {
        const mid = utilityWindow ? utilityWindow.t : (a + b) / 2, height = 2.05;
        const [px, pz] = P(mid, fz0 + side * .05);
        // 稲葉山では壁も板も窓幅だけ抜いてある。黒い裏板で光を塞がない。
        if (!utilityWindow) _box(B.wood, 0x251f18, px, y + height, pz, .78, .46, .025, rot);
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
    let c0 = -w / 2 + i * bw + 0.12, c1 = c0 + bw - 0.24, cm = (c0 + c1) / 2;
    if (side === ds && door?.paperWindows) {
      // 窓下の舞良戸と横桟も障子の幅で止め、開けた玄関を塞がない。
      const v = door.paperWindows.find(v => v.bay === i);
      if (!v) continue;
      c0 = v.t - v.w / 2; c1 = v.t + v.w / 2; cm = v.t;
    }
    // 稲葉山は戸口と重ならない幅へ調整済み。外の腰板も同じ窓幅で受ける。
    if (side === ds && door && !door.paperWindows && cm > door.doorX - door.gapW && cm < door.doorX + door.gapW) continue;
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
    if (side !== ds && i % 2 === (B.slidingTemplePaper ? 0 : 1)) {
      // 設楽原の小堂だけ左右の柱間に連子窓を置き、中央は来迎壁の背後として残す。
      const [px, pz] = P(cm, fz0);
      if (!B.slidingTemplePaper) _box(B.wood, 0x1c1610, px, y + 1.9, pz, (c1 - c0) * 0.7, 0.8, 0.03, rot);
      else {
        // 正面の障子と同じ小堂だけ、窓の四周を木枠で受ける。
        const width = (c1 - c0) * .7;
        for (const offset of [-1, 1]) {
          const [gx, gz] = P(cm + offset * (width / 2 + .035), fz0);
          _box(B.wood, 0x4a3a2c, gx, y + 1.9, gz, .07, .94, .18, rot);
        }
        for (const hy of [1.465, 2.335]) _box(B.wood, 0x4a3a2c, px, y + hy, pz, width, .07, .18, rot);
      }
      for (let k = -3; k <= 3; k++) { const [gx, gz] = P(cm + k * (c1 - c0) * 0.1, fz0 + side * 0.02); _box(B.wood, 0x4a3a2c, gx, y + 1.9, gz, 0.05, 0.84, 0.05, rot); }
      continue;
    }
    if (side !== ds) continue;
    const ds2 = side;
    const [px, pz] = P(cm, fz0);
    _box(B.wood, 0x2e241c, px, y + 0.95, pz, c1 - c0, 0.8, 0.05, rot);
    for (const hy of [0.75, 1.05, 1.3]) _box(B.wood, 0x4a3a2c, px, y + hy, pz + 0, c1 - c0, 0.035, 0.07, rot);
    if (B.slidingTemplePaper) {
      // 小堂の開口は柱から四十二センチ離す。内外の窓幅を揃え、四周を木枠で受ける。
      // 腰の舞良戸は元の柱間に残し、窓枠だけを狭める。既存の木材の束へまとめる。
      const width = c1 - c0 - .6;
      for (const hy of [1.345, 2.555]) _box(B.wood, 0x3a2c20, px, y + hy, pz, width, .06, .16, rot);
      for (const offset of [-1, 1]) {
        const [qx, qz] = P(cm + offset * (width / 2 + .03), fz0);
        _box(B.wood, 0x3a2c20, qx, y + 1.95, qz, .06, 1.27, .16, rot);
      }
      continue;
    }
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
      _gable(B.wood, j % 4 === 0 ? 0x86705a : 0x6e5844, px, y + H + .08, pz, step - .012, rd, rot, pitch, .07);
    }
    if (fieldBoards) {
      const [px, pz] = P(0, 0);
      _box(B.wood, 0x5e5040, px, y + H + .19 + Math.tan(pitch) * rd / 2, pz, rw + .15, .12, .28, rot);
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
        B.wood.push(_paint(g, fieldBoards ? fieldBoards[(j + (side > 0 ? 1 : 3)) % fieldBoards.length] : j % 3 === 0 ? 0x7c6852 : 0x6a5642));
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
