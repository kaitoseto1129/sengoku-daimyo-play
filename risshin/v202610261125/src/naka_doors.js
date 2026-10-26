// ======================================================================
// naka_doors.js … 城の御殿・寺の堂・屋敷の「中」の引き戸（kaito 10/14「障子を開けられる」）
//   naka.js の間取り（interior_layouts の portals＝間仕切りの口）に、襖・障子・板戸をはめる。
//   ・近づくと「開ける／閉める」の札（hud は naka_ で始まる札を指で押せる釦にする）。押すと戸が左右の壁の前へ滑る
//   ・閉めている間は当たりがある（紙の戸は槍が通る）。中の兵が戸口へ来ると自分で開ける。遊び手が押し続けても開く
//   ・形は interior_parts の panelInstances を使い回し、一つの建物・一つの種類で一つの InstancedMesh。動く間だけ行列を書く
//   ・寺の堂（内陣と外陣の境）は格子戸。開け放った形から始める（本尊が見える）。ほかは閉めて始める
// ======================================================================
import * as THREE from 'three';
import { SOLIDS } from './props.js';
import { INTERIOR_WALLS } from './shironaka.js';
import { panelInstances, hieiPartitionHeight, HIEI_DOOR_TRACK, HIEI_ENTRY_TRACK, HIEI_LEAF_OVERLAP, HIEI_SOBO_SILL } from './interior_parts.js';

export const DOORS = [];
const SKIP = ['tenshu', 'yagura', 'gate'];
const TEMPLE = ['hondo', 'chudo', 'temple'];
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
const moving = new Set();
let stopShape, stopMaterial;

// 比叡山の四枚建ては二本溝で左右二枚ずつ重ねる。外側の戸は一枚幅、内側は二枚幅滑る。
// 描く戸と移動中の当たりで同じ行程を使い、二枚建て・ほかの戦の動きは保つ。
function leafTravel(d, j) {
  return d.tracked && d.n === 4 ? d.pw * (j === 0 || j === 3 ? 1 : 2) : d.W / 2;
}
function stopOffset(d) { return d.n === 4 ? d.W / 2 + d.pw : d.W; }

// 引き込み先の端を竪框で閉じる。二本溝の外側で戸を受け、戸口の幅は保つ。
// 焼失前の細部は推定。形と当たりを同じ寸法にし、設営時だけ用意する。
function addDoorStops(d) {
  const I = d.frame || d.I;
  for (const side of [-1, 1]) {
    const x = d.lx + side * (stopOffset(d) + .025), a = d.lz - .09, b = d.lz + .09;
    const ax = I.x + x * I.c + a * I.s, az = I.z - x * I.s + a * I.c;
    const bx = I.x + x * I.c + b * I.s, bz = I.z - x * I.s + b * I.c;
    const r = .025;
    const solid = { k: 's', ax, az, bx, bz, r, naka: d.I.id,
      yBot: d.y + sillHeight(d), yTop: d.y + d.h,
      x0: Math.min(ax, bx) - r, x1: Math.max(ax, bx) + r,
      z0: Math.min(az, bz) - r, z1: Math.max(az, bz) + r };
    SOLIDS.push(solid); INTERIOR_WALLS.push(solid);
  }
}

export function resetNakaDoors() { DOORS.length = 0; moving.clear(); pickT = -1; pick = null; autoT = 0; }

// 間仕切りの口ごとに戸を一組。lv.layout.walls の当たりを作った後に呼ぶ（y0・y1 は壁と同じ高さの幅）
export function addNakaDoors(I, lv, y0, y1) {
  if (SKIP.includes(I.kind) || I.open || I.profile === 'yagura') return;
  const portals = [...(lv.layout.portals || [])];
  // 比叡山の正面入口にも同じ引き戸を使う。外壁の開口幅・高さに合わせる。
  if (I.profile === 'hieizan' && lv === I.levels[0]) portals.push({
    x: I.door.lx, z: I.door.side * (lv.d / 2 - HIEI_ENTRY_TRACK), entry: true,
    // 炊事の庫裏は堂の内陣用の格子戸にせず、土間を閉じる板戸にする。
    kind: I.kind === 'sobo' ? 'shoji' : I.kind === 'kuri' ? 'itado' : 'koshi',
  });
  for (const p of portals) {
    let l = p.entry ? p.x - I.door.w / 2 : -Infinity;
    let r = p.entry ? p.x + I.door.w / 2 : Infinity, paper = true;
    for (const v of lv.layout.walls) {
      if (p.entry || v.guideOnly || Math.abs(v.az - p.z) > .01 || Math.abs(v.bz - p.z) > .01) continue;
      const a = Math.min(v.ax, v.bx), b = Math.max(v.ax, v.bx);
      if (b <= p.x + .01 && b > l) { l = b; paper = v.paper; }
      if (a >= p.x - .01 && a < r) r = a;
    }
    if (!isFinite(l) || !isFinite(r) || r - l < .5 || r - l > 4.4) continue;
    const temple = TEMPLE.includes(I.kind);
    const kind = p.kind || (temple ? 'koshi' : !paper ? 'itado' : ['goten', 'yashiki', 'shisha'].includes(I.kind) ? 'fusumaE' : 'shoji');
    const W = r - l, n = Math.max(2, Math.round(W / 1.8) * 2);
    const tracked = I.profile === 'hieizan';
    const lz = p.z + (tracked && !p.entry ? HIEI_DOOR_TRACK : 0);
    const [ax, az] = I.P(l, lz), [bx, bz] = I.P(r, lz), rad = .06;
    const doorH = p.entry ? Math.min(lv.h, I.door.h ?? 2) : tracked && ['sobo', 'chudo', 'hondo'].includes(I.kind) ? hieiPartitionHeight(I.kind, lv.h) : lv.h > 3 ? 2.3 : lv.h - .02;
    // 比叡山の木格子は紙戸の貫通扱いにしない。襖と障子は従来どおり。
    const solid = { k: 's', ax, az, bx, bz, r: rad, yBot: y0, yTop: p.entry || tracked ? lv.y + doorH : y1, naka: I.id, fusuma: kind !== 'itado' && !(tracked && kind === 'koshi'),
      x0: Math.min(ax, bx) - rad, x1: Math.max(ax, bx) + rad, z0: Math.min(az, bz) - rad, z1: Math.max(az, bz) + rad };
    SOLIDS.push(solid); INTERIOR_WALLS.push(solid);
    const [x, z] = I.P((l + r) / 2, lz);
    // 固定の襖・障子と同じ高さで鴨居の下を滑らせる。
    const d = { I, lv, kind, tracked, entry: !!p.entry, lx: (l + r) / 2, lz, W, n, pw: W / n, h: doorH, y: lv.y, x, z, touch: { x, z }, solid, saved: null, open: 0, want: 0, meshes: null, base: 0 };
    (I.doors || (I.doors = [])).push(d); DOORS.push(d);
    // 比叡山の建具は、引き込んだ先でも体を通さない。
    // 設営時に戸ごとの当たりを用意し、焼失時は堂の当たりと一緒に片付ける。
    if (tracked) {
      d.leaves = Array.from({ length: n }, () => ({ ...solid, r: .035, yBot: lv.y + sillHeight(d) }));
      for (const leaf of d.leaves) { SOLIDS.push(leaf); INTERIOR_WALLS.push(leaf); }
    }
    // 内陣の脇口は開けて本尊を見せる。正面戸は閉め、外からも札で開ける。
    if (temple && !p.entry) { d.open = d.want = 1; solidOff(d); }
    if (tracked) { pose(d); addDoorStops(d); }
  }
  if (I.profile === 'hieizan' && I.kind === 'sobo') {
    // 明かり障子も正面戸と同じ二本溝で滑らせる。腰壁と窓上の壁は残す。
    for (const v of lv.windows || []) {
      if (!v.shoji) continue;
      const hw = lv.w / 2, hd = lv.d / 2;
      const [x, z] = I.P(v.face === 'z' ? v.t : v.s * (hw - HIEI_ENTRY_TRACK),
        v.face === 'z' ? v.s * (hd - HIEI_ENTRY_TRACK) : v.t);
      const rot = I.rot + (v.face === 'x' ? Math.PI / 2 : 0);
      const frame = { x, z, rot, c: Math.cos(rot), s: Math.sin(rot) };
      const y = lv.y + v.y0, W = v.w, rad = .035;
      const solid = { k: 's', ax: x - W / 2 * frame.c, az: z + W / 2 * frame.s,
        bx: x + W / 2 * frame.c, bz: z - W / 2 * frame.s,
        r: rad, yBot: y, yTop: lv.y + v.y1, naka: I.id, fusuma: true };
      solid.x0 = Math.min(solid.ax, solid.bx) - rad; solid.x1 = Math.max(solid.ax, solid.bx) + rad;
      solid.z0 = Math.min(solid.az, solid.bz) - rad; solid.z1 = Math.max(solid.az, solid.bz) + rad;
      const d = { I, lv, frame, kind: 'shoji', tracked: true, window: v, entry: false,
        lx: 0, lz: 0, W, n: 2, pw: W / 2, h: v.y1 - v.y0, y,
        x, z, touch: { x, z }, solid, saved: null, open: 0, want: 0, meshes: null, base: 0 };
      d.leaves = Array.from({ length: 2 }, () => ({ ...solid }));
      for (const leaf of [solid, ...d.leaves]) { SOLIDS.push(leaf); INTERIOR_WALLS.push(leaf); }
      (I.doors || (I.doors = [])).push(d); DOORS.push(d);
      pose(d);
      addDoorStops(d);
    }
  }
}

// 近づいて中を作る時（naka.js の buildInside）に、戸の形を grp へ足す
export function buildNakaDoorMeshes(I, grp) {
  if (!I.doors) return;
  if (I.profile === 'hieizan') {
    // 正面戸・間仕切り・明かり障子を一束で描く。動く戸とは分けて更新しない。
    stopShape ||= new THREE.BoxGeometry(1, 1, 1);
    // 戸当たりも外周の木部と同じく光を受ける。暗い堂内でここだけ明るく浮かせない。
    // 正面戸・座敷・窓で一つの材質を共有し、影を描く回数は増やさない。
    stopMaterial ||= new THREE.MeshStandardMaterial({ color: 0x795b3b, roughness: 1, metalness: 0 });
    const stops = new THREE.InstancedMesh(stopShape, stopMaterial, I.doors.length * 2);
    stops.receiveShadow = true;
    let index = 0;
    for (const d of I.doors) {
      const frame = d.frame || I, sill = sillHeight(d), height = panelHeight(d);
      Q.setFromAxisAngle(Y, frame.rot); S.set(.05, height, .18);
      for (const side of [-1, 1]) {
        const x = d.lx + side * (stopOffset(d) + .025);
        P.set(frame.x + x * frame.c + d.lz * frame.s, d.y + sill + height / 2,
          frame.z - x * frame.s + d.lz * frame.c);
        M.compose(P, Q, S); stops.setMatrixAt(index++, M);
      }
    }
    stops.computeBoundingSphere(); grp.add(stops);
  }
  const by = new Map();
  for (const d of I.doors) {
    // 正面戸・座敷の戸・明かり障子は寸法が違う。同寸の戸だけをまとめ描きする。
    const key = d.tracked ? d.kind + ':' + d.pw + ':' + panelHeight(d) : d.kind;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(d);
  }
  for (const list of by.values()) {
    const first = list[0], kind = first.kind;
    const count = list.reduce((s, d) => s + d.n, 0);
    const panelKind = I.profile === 'hieizan' ? kind === 'shoji' ? 'shojiHiei' : kind === 'koshi' ? 'koshiHiei' : kind : kind;
    const meshes = first.tracked ? panelInstances(panelKind, count, first.pw + HIEI_LEAF_OVERLAP, panelHeight(first)) : panelInstances(panelKind, count);
    let i = 0;
    for (const d of list) { d.meshes = meshes; d.base = i; i += d.n; }
    for (const m of meshes) { m.count = count; grp.add(m); }
    if (I.profile === 'hieizan') {
      // 閉じた時だけの範囲では、横へ滑った障子が画面端で消える。
      // 両端の範囲を設営時に一度だけ合わせ、動く間の計算は増やさない。
      for (const d of list) pose(d, 0);
      for (const m of meshes) m.computeBoundingSphere();
      const closed = meshes.map(m => m.boundingSphere.clone());
      for (const d of list) pose(d, 1);
      for (let j = 0; j < meshes.length; j++) {
        meshes[j].computeBoundingSphere();
        meshes[j].boundingSphere.union(closed[j]);
      }
      for (const d of list) pose(d);
    } else {
      for (const d of list) pose(d);
      for (const m of meshes) m.computeBoundingSphere();
    }
  }
}

function sillHeight(d) { return d.window ? 0 : d.tracked ? (d.entry ? .05 : d.I.kind === 'sobo' ? HIEI_SOBO_SILL : .04) : 0; }
function panelHeight(d) { return d.h - sillHeight(d); }

function pose(d, open = d.open) {
  if (!d.meshes && !d.leaves) return;
  const I = d.frame || d.I, k = open, e = k * k * (3 - 2 * k);
  // 敷居の上面から鴨居の下面までを建具の高さにする。
  // 戸口の当たりと操作の基準は床面のまま保つ。
  const sill = sillHeight(d);
  if (d.tracked) S.set(1, 1, 1);
  else S.set(d.pw / .9, panelHeight(d) / 1.8, 1);
  for (let j = 0; j < d.n; j++) {
    const left = j < d.n / 2;
    // 右の襖・比叡山の格子戸は裏返して引き手を召し合わせ側へ向ける。
    // 外周の障子は左右の框に手掛けがある。片面張りの紙を外へ、組子を室内へ向ける。
    // 側窓の専用座標も正の奥行きが正の壁側なので、壁の符号で向きを揃える。
    // 座敷境は従来の向きとし、溝・戸の行程・当たりは同じ寸法を使う。
    // 正の縮尺と回転を使い、共通の形・材質をそのまま使い回す。
    const reverse = d.tracked && (d.kind === 'shoji'
      ? (d.window ? d.window.s > 0 : d.entry && d.I.door.side > 0)
      : !left && (d.kind === 'fusuma' || d.kind === 'fusumaPlain' || d.kind === 'fusumaE' || d.kind === 'koshi'));
    Q.setFromAxisAngle(Y, I.rot + (reverse ? Math.PI : 0));
    // 閉めた時は二本の溝（前後に少しずらす）。開けると左右の壁の前へ引き込む
    // 幅だけ広げると全開時に戸当たりへ食い込むため、左右の組を内へ半分寄せる。
    // 召し合わせに重なりを作り、斜めから見ても襖・障子の間に素通しの隙間を残さない。
    const overlap = d.tracked ? HIEI_LEAF_OVERLAP : 0;
    const lx = d.lx - d.W / 2 + (j + .5) * d.pw + (left ? -1 : 1) * (e * leafTravel(d, j) - overlap / 2);
    const lz = d.lz + (j % 2 ? 1 : -1) * (d.tracked ? .04 : .02 + .045 * e);
    // 室内の形をまだ作っていない時も、同じ溝・開き具合で当たりを動かす。
    // 行列や当たりの入れ物は使い回し、動いている戸だけを書き換える。
    if (d.leaves) {
      const leaf = d.leaves[j], a = lx - (d.pw + overlap) / 2, b = lx + (d.pw + overlap) / 2;
      leaf.ax = I.x + a * I.c + lz * I.s; leaf.az = I.z - a * I.s + lz * I.c;
      leaf.bx = I.x + b * I.c + lz * I.s; leaf.bz = I.z - b * I.s + lz * I.c;
      leaf.x0 = Math.min(leaf.ax, leaf.bx) - leaf.r; leaf.x1 = Math.max(leaf.ax, leaf.bx) + leaf.r;
      leaf.z0 = Math.min(leaf.az, leaf.bz) - leaf.r; leaf.z1 = Math.max(leaf.az, leaf.bz) + leaf.r;
    }
    if (!d.meshes) continue;
    P.set(I.x + lx * I.c + lz * I.s, d.y + sill, I.z - lx * I.s + lz * I.c); M.compose(P, Q, S);
    for (const m of d.meshes) m.setMatrixAt(d.base + j, M);
  }
  if (d.meshes) for (const m of d.meshes) m.instanceMatrix.needsUpdate = true;
}
function solidOff(d) {
  const s = d.solid;
  if (!d.saved) d.saved = { ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 };
  s.ax = s.az = s.bx = s.bz = s.x0 = s.x1 = s.z0 = s.z1 = 1e9;
}
function setWant(rt, d, want) {
  if (d.want === want) return;
  if (!want && d.tracked) {
    // 閉め始めから戸口を止める。人がいる間は閉めず、戸を体へ滑り込ませない。
    if (doorwayOccupied(rt, d)) return;
    if (d.saved) Object.assign(d.solid, d.saved);
  }
  d.want = want;
  // 比叡山は引き戸が開き切ってから通す。正面の入室札とも時機を揃え、
  // 動き始めの障子・襖・格子戸を体が突き抜けないようにする。
  if (want && !d.tracked) solidOff(d);
  moving.add(d);
  if (rt.army && rt.army.play) rt.army.play('wood', { x: d.x, z: d.z }, .3);
}
// 戸口の帯（壁の線の前後0.35m・戸の幅の内）に立っているか
function atDoorHeight(d, o) {
  // 明かり障子は腰壁の上にある。足元の高さだけで除外すると、
  // 窓下の人の頭や肩を戸が横切る。戸の上下端と体全体で比べる。
  if (d.tracked && d.window) return o.pos.y + (o.bodyHeight || 1.72 * (o.mesh?.scale.y || 1)) > d.y + sillHeight(d) && o.pos.y < d.y + d.h;
  return Math.abs(o.pos.y - d.y) < 1.2;
}

function inDoorway(d, o) {
  const I = d.frame || d.I, dx = o.pos.x - I.x, dz = o.pos.z - I.z;
  const lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
  return Math.abs(lz - d.lz) < .35 && Math.abs(lx - d.lx) < d.W / 2 + .1 && atDoorHeight(d, o);
}

// 正面戸の外から来る兵も含めて調べる。兵の配列をそのまま使い、毎コマ入れ物を作らない。
function doorwayOccupied(rt, d) {
  const u = rt.player && rt.player.u;
  if (u && u.alive && inDoorway(d, u)) return true;
  const units = rt.army && rt.army.units;
  if (units) for (const o of units) if (o.alive && inDoorway(d, o)) return true;
  return false;
}

// 戸口の外側へ滑る戸も、人を横切らせない。次の位置までの帯を建物の座標で調べる。
// 開く時の引き込み先・閉じる時の戻り道を同じ判定にし、動く間も形や配列を作らない。
function leafSweepHits(d, o, from, to) {
  if (!o || !o.alive || !atDoorHeight(d, o)) return false;
  const I = d.frame || d.I, dx = o.pos.x - I.x, dz = o.pos.z - I.z;
  const x = dx * I.c - dz * I.s, z = dx * I.s + dz * I.c;
  const radius = o.bodyRadius || .3;
  if (Math.abs(z - d.lz) > radius + .075 || Math.abs(x - d.lx) > d.W + radius) return false;
  for (let j = 0; j < d.n; j++) {
    const direction = j < d.n / 2 ? -1 : 1;
    // 描く戸・動く当たりと同じ召し合わせの幅と中心を使う。
    // 框の重なりの端まで調べ、引き込み先で体をかすめてから止まらないようにする。
    const base = d.lx - d.W / 2 + (j + .5) * d.pw - direction * HIEI_LEAF_OVERLAP / 2;
    const travel = leafTravel(d, j);
    const a = base + direction * from * travel, b = base + direction * to * travel;
    const half = (d.pw + HIEI_LEAF_OVERLAP) / 2;
    const nearestX = Math.max(Math.min(a, b) - half, Math.min(Math.max(a, b) + half, x));
    const gapZ = Math.max(0, Math.abs(z - d.lz - (j % 2 ? .04 : -.04)) - .035);
    if ((x - nearestX) ** 2 + gapZ * gapZ < radius * radius) return true;
  }
  return false;
}

function leafSweepOccupied(rt, d, next) {
  const from = d.open * d.open * (3 - 2 * d.open), to = next * next * (3 - 2 * next);
  const player = rt.player && rt.player.u;
  if (leafSweepHits(d, player, from, to)) return true;
  const units = rt.army && rt.army.units;
  if (units) for (const o of units) if (o !== player && leafSweepHits(d, o, from, to)) return true;
  return false;
}

// 比叡山の引き戸は、横へ滑った後も実際の戸へ近づいて扱える。
// 描画と同じ位置の当たりを使い、札も木の手掛け・引き手へ寄せる。
function doorDistance(d, p, touch = false) {
  if (!d.tracked) return Math.hypot(d.x - p.x, d.z - p.z);
  const I = d.frame || d.I, dx0 = p.x - I.x, dz0 = p.z - I.z;
  const lx = dx0 * I.c - dz0 * I.s, lz = dx0 * I.s + dz0 * I.c;
  // 自動で開ける判定は戸口へ向かう者だけ。脇で戦う兵につられて開けない。
  if (!touch) {
    if (Math.abs(lx - d.lx) > d.W / 2 + .1) return Infinity;
    return Math.hypot(Math.max(0, Math.abs(lx - d.lx) - d.W / 2), lz - d.lz);
  }
  // 外からは外壁の開口越しに届く範囲だけ。壁の裏へ引き込んだ戸は内側から扱う。
  // 側窓は戸の座標を九十度回すと、戸の正の奥行きが建物の正の横方向になる。
  // 正背面・側面とも壁の符号が外向き。逆にすると室内側を外と誤り、
  // 外からは腰壁や窓脇の壁を越えて障子を扱えてしまう。
  const wallSide = d.window ? d.window.s : d.I.door.side;
  const outside = d.window ? wallSide * lz > HIEI_ENTRY_TRACK
    : d.entry && wallSide * lz > d.lv.d / 2;
  if (outside && Math.abs(lx - d.lx) > d.W / 2 + .1) return Infinity;
  let best = Infinity, bestX = d.touch.x, bestZ = d.touch.z;
  // 紙面や格子の中央を押して開けず、描かれた引き手へ手を伸ばす。
  // 障子は左右の框、襖・格子戸は召し合わせ側。右の戸の反転も描画と揃える。
  // 板戸には従来の判定を使う。候補の配列や座標の入れ物は毎コマ作らない。
  const shoji = d.kind === 'shoji';
  const fusuma = d.kind === 'fusuma' || d.kind === 'fusumaPlain' || d.kind === 'fusumaE';
  const fittedGrip = shoji || fusuma || d.kind === 'koshi';
  // 窓障子の手掛けも、描いた框の高さへ札を置く。床の高さへ札を落とさない。
  const gripY = d.y + sillHeight(d) + (fittedGrip ? Math.min(.85, panelHeight(d) * .48) : panelHeight(d) / 2);
  const grips = shoji ? 2 : 1;
  for (let candidate = 0; candidate < d.leaves.length * grips; candidate++) {
    const j = Math.floor(candidate / grips), leaf = d.leaves[j];
    const dx = leaf.bx - leaf.ax, dz = leaf.bz - leaf.az;
    const length2 = dx * dx + dz * dz;
    let t;
    if (fittedGrip) {
      const inset = (fusuma ? .13 : .035) / (d.pw + HIEI_LEAF_OVERLAP);
      t = shoji ? (candidate % grips ? 1 - inset : inset)
        : j < d.n / 2 ? 1 - inset : inset;
    } else t = length2 > 0 ? Math.max(0, Math.min(1,
      ((p.x - leaf.ax) * dx + (p.z - leaf.az) * dz) / length2)) : 0;
    const x = leaf.ax + dx * t, z = leaf.az + dz * t;
    if (outside) {
      // 斜めからも壁の開口を通して手を伸ばす。遊び手の横位置だけでは、
      // 窓枠や戸柱の裏へ滑った戸を、白壁越しに扱えてしまう。
      // 窓は戸専用の座標、正面戸は建物の座標で、同じ開口幅を使う。
      const tx = (x - I.x) * I.c - (z - I.z) * I.s;
      const tz = (x - I.x) * I.s + (z - I.z) * I.c;
      const wallZ = wallSide * (d.window ? HIEI_ENTRY_TRACK : d.lv.d / 2);
      const along = (wallZ - lz) / (tz - lz);
      if (along > 0 && along < 1) {
        if (Math.abs(lx + (tx - lx) * along - d.lx) > d.W / 2) continue;
        // 腰壁や窓上の小壁も手を遮る。横幅だけでは、低い地面から
        // 腰壁を斜めに突き抜けて明かり障子の手掛けへ届いてしまう。
        // 手から引き手への線が、外壁の実際の開口高を通る時だけ扱える。
        const handY = p.y + 1, wallY = handY + (gripY - handY) * along;
        if (wallY < d.y || wallY > d.y + d.h) continue;
      }
    }
    // 腰の高さの手から引き手までを測る。窓の下の低い地面から、
    // 横の距離だけで高い障子を扱えるようにしない。
    const distance = Math.hypot(p.x - x, p.z - z, gripY - (p.y + 1));
    if (distance >= best) continue;
    // 柱の陰の一枚だけで戸全体を候補から外さない。
    // 各戸へ実際に手が届くか調べ、届く戸の中から最寄りの引き手を選ぶ。
    if (touch) {
      d.touch.x = x; d.touch.z = z; d.touch.y = gripY;
      if (partitionBetween(d, p, j)) continue;
      bestX = x; bestZ = z;
    }
    best = distance;
  }
  if (touch) { d.touch.x = bestX; d.touch.z = bestZ; }
  return best;
}

// 戸当たりの実寸（幅五センチ・見込み十八センチ）も手を遮る。
// 窓は専用の向きへ戻して比べ、斜めの堂でも木枠の外側を余計に塞がない。
function doorStopBetween(d, p, wx, wz, handY, rise) {
  if (!d.tracked) return false;
  const I = d.frame || d.I, dx = p.x - I.x, dz = p.z - I.z;
  const x = dx * I.c - dz * I.s, z = dx * I.s + dz * I.c;
  const rx = wx * I.c - wz * I.s, rz = wx * I.s + wz * I.c;
  for (let side = -1; side <= 1; side += 2) {
    const cx = d.lx + side * (stopOffset(d) + .025);
    let near = .001, far = .999;
    if (Math.abs(rx) < .000001) {
      if (Math.abs(x - cx) > .025) continue;
    } else {
      const a = (cx - .025 - x) / rx, b = (cx + .025 - x) / rx;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    }
    if (Math.abs(rz) < .000001) {
      if (Math.abs(z - d.lz) > .09) continue;
    } else {
      const a = (d.lz - .09 - z) / rz, b = (d.lz + .09 - z) / rz;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    }
    if (near <= far) {
      const ya = handY + rise * near, yb = handY + rise * far;
      if (Math.max(ya, yb) >= d.y + sillHeight(d) && Math.min(ya, yb) <= d.y + d.h) return true;
    }
  }
  return false;
}

// 比叡山では、隣室の固定建具や手前の引き戸を越えて引き手へ手を伸ばせない。
// 戸の手前までの線と間仕切りを局所座標で比べる。戸口の空きはそのまま通す。
// 近い戸から届く候補を調べ、毎コマの形・配列・座標の作り直しはしない。
function partitionBetween(d, p, targetLeaf) {
  if (!d.tracked) return false;
  const I = d.I;
  const dx = p.x - I.x, dz = p.z - I.z;
  const ax = dx * I.c - dz * I.s, az = dx * I.s + dz * I.c;
  const tx = d.touch.x - I.x, tz = d.touch.z - I.z;
  const rx = tx * I.c - tz * I.s - ax, rz = tx * I.s + tz * I.c - az;
  // 建物の角から斜めに手を伸ばす時も、側壁を突き抜けて戸を扱わない。
  // 操作する戸の面だけでなく、手が横切る四周の壁を実際の窓・戸口で調べる。
  // 既存の開口寸法を借り、戸を選ぶ時にも配列や形を作らない。
  const hand = p.y + 1 - d.lv.y, riseToGrip = d.touch.y - (p.y + 1);
  for (let axis = 0; axis < 2; axis++) {
    const start = axis === 0 ? ax : az, delta = axis === 0 ? rx : rz;
    if (Math.abs(delta) < .000001) continue;
    const half = (axis === 0 ? d.lv.w : d.lv.d) / 2;
    for (let side = -1; side <= 1; side += 2) {
      const along = (side * half - start) / delta;
      if (along <= .001 || along >= .999) continue;
      const height = hand + riseToGrip * along;
      if (height < 0 || height > d.lv.h) continue;
      const across = axis === 0 ? az + rz * along : ax + rx * along;
      const span = (axis === 0 ? d.lv.d : d.lv.w) / 2;
      if (Math.abs(across) > span) continue;
      let opening = axis === 1 && side === I.door.side && d.lv === I.levels[0]
        && Math.abs(across - I.door.lx) < I.door.w / 2
        && height <= (I.door.h ?? 2);
      if (!opening) for (const window of d.lv.windows || []) {
        if (window.face === (axis === 0 ? 'x' : 'z') && window.s === side
          && Math.abs(across - window.t) < window.w / 2
          && height >= window.y0 && height <= window.y1) { opening = true; break; }
      }
      if (!opening) return true;
    }
  }
  for (const v of d.lv.layout.walls) {
    if (v.guideOnly) continue;
    if (fixedPanelBetween(v, ax, az, rx, rz)) return true;
  }
  // 正面の障子と座敷の障子は近い。間仕切りの口だけを調べると、
  // 閉じた正面戸越しに奥の戸を開けられる。滑った後の実際の戸も調べる。
  // 既存の戸の当たりを世界座標で使い、操作する時に配列や形を作らない。
  const wx = d.touch.x - p.x, wz = d.touch.z - p.z, handY = p.y + 1;
  // 低い襖と窓障子では引き手の高さが違う。手から引き手への線で遮りを調べる。
  const rise = d.touch.y - handY;
  // 経巻棚・須弥壇なども手を遮る。描画と通行が使う調度の寸法を借り、
  // 低い机の上には手を通す。比叡山だけの判定で、入れ物は作らない。
  for (const prop of d.lv.layout.props) {
    let near = .001, far = .999;
    for (let axis = 0; axis < 3; axis++) {
      const start = axis === 0 ? ax : axis === 1 ? handY - d.lv.y : az;
      const delta = axis === 0 ? rx : axis === 1 ? rise : rz;
      const center = axis === 0 ? prop.x : axis === 1 ? (prop.y || 0) + prop.h / 2 : prop.z;
      const half = (axis === 0 ? prop.w : axis === 1 ? prop.h : prop.d) / 2;
      if (Math.abs(delta) < .000001) {
        if (start < center - half || start > center + half) { far = -1; break; }
      } else {
        const a = (center - half - start) / delta, b = (center + half - start) / delta;
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        if (near > far) break;
      }
    }
    if (near <= far) return true;
  }
  // 比叡山の堂内・縁の柱も、引き手へ伸ばす手を遮る。
  // 固定の間仕切りだけでは、戸脇の丸柱越しに開閉できてしまう。
  // 柱は設営時に借りた当たりを使い、操作の候補を調べる時だけ線分と比べる。
  const reach2 = wx * wx + wz * wz;
  if (reach2 > .000001 && I.doorPosts) for (const post of I.doorPosts) {
    const along = Math.max(0, Math.min(1, ((post.x - p.x) * wx + (post.z - p.z) * wz) / reach2));
    const y = handY + rise * along;
    if (y < post.yBot || y > post.yTop) continue;
    const dx = p.x + wx * along - post.x, dz = p.z + wz * along - post.z;
    if (dx * dx + dz * dz < post.r * post.r) return true;
  }
  for (const other of I.doors || []) {
    if (other.lv !== d.lv) continue;
    if (doorStopBetween(other, p, wx, wz, handY, rise)) return true;
    // 二本溝で重なった同じ組の戸も手を遮る。狙った一枚だけを除き、
    // 手前の紙や格子を突き抜けて奥の引き手を扱わない。
    // 引き手ごとに調べるので、手前にある戸からは引き続き開閉できる。
    const leaves = other.leaves;
    if (!leaves) continue;
    for (let j = 0; j < leaves.length; j++) {
      if (other === d && j === targetLeaf) continue;
      const leaf = leaves[j];
      if (slidingPanelBetween(leaf, p, wx, wz, handY, rise)) return true;
    }
  }
  return false;
}

// 動く戸も厚みのある框として扱う。中心線だけでは、框と平行な手や
// 端をかすめる手が戸を抜け、重なった奥の襖・障子を開けられてしまう。
// 戸の当たりと同じ厚み・上下端で三軸を絞り、上を越える手は通す。
// 比叡山の操作候補だけで使い、座標や配列は作り直さない。
function slidingPanelBetween(leaf, p, wx, wz, handY, rise) {
  const sx = leaf.bx - leaf.ax, sz = leaf.bz - leaf.az, length = Math.hypot(sx, sz);
  if (length < .000001) return false;
  const c = sx / length, s = sz / length;
  const dx = p.x - (leaf.ax + leaf.bx) / 2, dz = p.z - (leaf.az + leaf.bz) / 2;
  let near = .001, far = .999;
  for (let axis = 0; axis < 3; axis++) {
    const start = axis === 0 ? dx * c + dz * s : axis === 1 ? -dx * s + dz * c : handY;
    const delta = axis === 0 ? wx * c + wz * s : axis === 1 ? -wx * s + wz * c : rise;
    const low = axis === 0 ? -length / 2 : axis === 1 ? -leaf.r : leaf.yBot;
    const high = axis === 0 ? length / 2 : axis === 1 ? leaf.r : leaf.yTop;
    if (Math.abs(delta) < .000001) {
      if (start < low || start > high) return false;
    } else {
      const a = (low - start) / delta, b = (high - start) / delta;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return false;
    }
  }
  return true;
}

// 固定建具は線でなく厚みのある材。平行に手を伸ばす時や端をかすめる時も、
// 端柱を含めた厚み十二センチで遮る。比叡山の操作候補だけに使う。
// 建具の向きへ線分を戻し、入れ物を作らず二軸の範囲を調べる。
function fixedPanelBetween(v, ax, az, rx, rz) {
  const sx = v.bx - v.ax, sz = v.bz - v.az, length = Math.hypot(sx, sz);
  if (length < .000001) return false;
  const c = sx / length, s = sz / length;
  const dx = ax - (v.ax + v.bx) / 2, dz = az - (v.az + v.bz) / 2;
  let near = .001, far = .999;
  for (let axis = 0; axis < 2; axis++) {
    const start = axis === 0 ? dx * c + dz * s : -dx * s + dz * c;
    const delta = axis === 0 ? rx * c + rz * s : -rx * s + rz * c;
    const half = axis === 0 ? length / 2 : .06;
    if (Math.abs(delta) < .000001) {
      if (start < -half || start > half) return false;
    } else {
      const a = (-half - start) / delta, b = (half - start) / delta;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return false;
    }
  }
  return true;
}

let pickT = -1, pick = null;
function nearest(rt) {
  if (pickT === rt.t) return pick?.I.disabled ? null : pick;
  pickT = rt.t; pick = null;
  const u = rt.player && rt.player.u;
  if (!u || !u.alive || rt.player.mounted) return null;
  let bd = 1.5;
  for (const d of DOORS) {
    if (d.I.disabled) continue;
    if (d.I.id + 1 !== u.naka && !((d.entry || d.window) && !u.naka)) continue;
    // 明かり障子の基準は腰壁の上。僧坊の床高も加わるので、外の地面からは
    // 足元との差が一・二メートルを超えていた。窓は下の三次元の手掛け距離で
    // 判定し、腰壁・窓枠越しの遮りも従来どおり調べる。通常の戸は階を区別する。
    if (!d.window && Math.abs(u.pos.y - d.y) > 1.2) continue;
    const dist = doorDistance(d, u.pos, true);
    if (dist < bd) { bd = dist; pick = d; }
  }
  return pick;
}

let autoT = 0;
// 毎コマ（naka.js の nakaTick の終わり）。flagged：中にいる兵
export function nakaDoorTick(rt, dt, flagged) {
  if (!DOORS.length) return;
  if (rt.addInteract && !rt._nakaDoors) {
    rt._nakaDoors = true;
    rt.addInteract('naka_to', () => {
      const d = nearest(rt);
      return d && !(d.want && rt.def.doorCloseOK?.(rt) === false) ? d.touch : null;
    }, '開ける', () => {
      const d = nearest(rt); if (d) setWant(rt, d, d.want ? 0 : 1);
    }, { r: 1.5, prio: -3 });
    const it = rt.interacts[rt.interacts.length - 1];
    Object.defineProperty(it, 'label', { get: () => (nearest(rt) && nearest(rt).want ? '閉める' : '開ける'), configurable: true });
  }
  // 中の兵は戸口へ来たら自分で開ける。遊び手も閉じた戸へ押し続けると開く
  autoT -= dt;
  if (autoT <= 0) {
    autoT = .2;
    const u = rt.player && rt.player.u;
    if (u && u.alive && (rt.player.blockedWalkT || 0) >= .5) {
      const d = nearest(rt);
      if (d && !d.window && !d.want && doorDistance(d, u.pos) < 1.1) setWant(rt, d, 1);
    }
    for (const o of flagged) {
      if (o.isPlayer || !o.alive || !o.naka) continue;
      const I = DOORS.find((d) => d.I.id + 1 === o.naka)?.I;
      if (!I || I.disabled || !I.doors) continue;
      for (const d of I.doors) if (!d.window && !d.want && Math.abs(o.pos.y - d.y) < 1.2 && doorDistance(d, o.pos) < 1.2) setWant(rt, d, 1);
    }
    // 外から来る兵も正面の障子を開ける。入口で立ち往生させない。
    for (const d of DOORS) if (!d.I.disabled && d.entry && !d.want) {
      for (const o of rt.army?.units || []) {
        if (o.isPlayer || !o.alive || Math.abs(o.pos.y - d.y) > 1.2) continue;
        if (doorDistance(d, o.pos) < 1.2) { setWant(rt, d, 1); break; }
      }
    }
  }
  for (const d of moving) {
    // 焼失した建物は共通の片付け済み。閉まりかけの戸の当たりを戻さない。
    if (d.I.disabled) { moving.delete(d); continue; }
    // 閉め始めに空いていても、滑る途中で人が入ったら開き直す。
    // 閉め切った後の判定では戸が体を横切るため、形と当たりを動かす前に止める。
    if (d.tracked && !d.want && doorwayOccupied(rt, d)) { setWant(rt, d, 1); continue; }
    const next = Math.max(0, Math.min(1, d.open + (d.want ? 1 : -1) * dt * 2.6));
    // 引き込み先に人がいる間は待ち、離れたら同じ動作を続ける。
    // 絵と当たりを動かす前に止めるので、戸の端で人を壁へ押し込まない。
    if (d.tracked && leafSweepOccupied(rt, d, next)) continue;
    d.open = next;
    pose(d);
    if (d.open !== d.want) continue;
    if (d.want && d.tracked) solidOff(d);
    if (!d.want) {
      // 閉め切った時に戸口に人が立っていれば、開けたままにして待つ
      const u = rt.player && rt.player.u;
      if ((u && inDoorway(d, u)) || flagged.some((o) => o.alive && o.naka === d.I.id + 1 && inDoorway(d, o))) { d.open = .02; continue; }
      if (d.saved) Object.assign(d.solid, d.saved);
    }
    moving.delete(d);
  }
}
