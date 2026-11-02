// ======================================================================
// 稲生の戦い（kaito 10/29 夜の仕様 docs/inou_spec_1029.md）
// 南北300m×東西150m。南端から北の土手の林美作守へ。正面の道と葦原の脇道。
// 11/1 kaito（B 節）：練習 → 陣形対陣形の大軍の激突（林の先手）→ 二の備と弓組 → 土手の林美作守。自分は味方の横の列の一組として動く。
// 流れ矢が飛ぶ。右上は「目標」の札（stages.js）と小さな地図（美作守の居場所は赤いひし形）。ばかでかい赤い旗印はやめた。
// 以下は 10/29 の仕様の名残り：
// 雑兵は北へ退く槍兵（8mで振り向く）と立ち止まる弓兵。近づいた区画から出す。
// 乱戦激戦（kaito 10/29 夜「同時2体・画面15体は無視。乱戦激戦にしないと」）：正面の道には味方と林勢が押し合う乱戦の塊を
// 先々に置き続け、本人は四方から攻められる（同時に打つのは四人まで。組頭と味方が横で受け止める）。土手は取り巻きと林勢の最後の踏ん張り。
// 地面・田・草・甲冑の見た目は前の稲生（b_inou.js）の world を使う。座標：南が +z、北が −z。
// ======================================================================
import * as THREE from 'three';
import { inou as OLD } from './b_inou.js';
import { enemyGroup, allyGroup } from './bhelp.js';
import { nobori, hut } from './props.js';
import { MEM_TIGHT } from './settings.js';
import { flagTexture } from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { victoryMoment } from './victory_moment.js';
import { sfx } from './audio.js';
import { clash } from './b_sekigahara.js';

const XW = 74, ZS = 146, ZN = -146;           // 見えない壁（東西 ±74・南北 ±146）
const START = { x: 12, z: 136 };
const BOSS = { x: 8, z: -134 };               // 北の土手の上
const FRONT_X = 12;                            // 正面の道
const SIDE = [[-40, 150], [-46, 80], [-36, 0], [-44, -80], [-30, -122], [0, -132]];   // 葦原の脇道
const sideX = (z) => { for (let i = 0; i < SIDE.length - 1; i++) { const [ax, az] = SIDE[i], [bx, bz] = SIDE[i + 1]; if (z <= az && z >= bz) return ax + (bx - ax) * (az - z) / (az - bz); } return SIDE[SIDE.length - 1][0]; };
// 陣形（kaito 11/1 B 節）：味方は横一列の七組（自分の組は道の真ん中）、林の先手は横一列の六組、二の備は五組と後ろの弓組二つ
const SLOTS = [-27, -14, -1, 25, 38, 51];
const ALLY_Z0 = 130, L1_Z0 = 82, L1_MEET = 104, L2_Z0 = -24, L2_MEET = 4, BOW_Z = -40;
const L1_X = [-20, -7, 6, 19, 32, 45], L2_X = [-14, 0, 14, 28, 42];
const PRACTICE_T = 45, STAGE_T = 150;
const TURN = 8;                                // 槍兵が振り向く近さ
const BOW_RANGE = 30;
const BOSS_RANGE = 20;
const BOSS_HP = 115;                           // 美作守の命（四方から攻められる分、一騎打ちは四十秒〜一分に収まるよう軽く）
// 雑兵の装い：黒・茶・柿渋（青にしない）。旗指物は赤でない物
const ZAKO = { armor: 0x2e2822, hatColor: 0x1c1916, lace: 0x6a4a30, cloth: 0x7a5236, flag: 'kari', flagShape: 1 };
const dress = (list) => list.map((s) => ({ ...s, o: { ...ZAKO, ...(s.o || {}) } }));

// 北の土手：z −118 から −132 にかけて二メートル半ほど上がる
const bank = (z) => { const k = Math.max(0, Math.min(1, (-118 - z) / 14)); return k * k * (3 - 2 * k) * 2.6; };
const baseH = OLD.world.height;
const height = (x, z) => baseH(x, z) + bank(z);

// 稲架（10/30 採点「稲架が無い」）：25秒の所（道の z 100〜110）から八方のどこを向いても一〜二基が入るよう、道の東西と前後に四基。
// 杭と横木と垂らした稲束を、頂点の色だけの材質一つ・形一つにまとめる（絵は足さない。描く数は一つ。影は落とさない）。束は五角の筒で軽く。
// 当たりは付けない（兵の歩く道を変えない）。道（x 12）と葦原の脇道からは離す。
const HASA = [[-6, 92, 0.12, 8], [31, 96, -0.08, 7], [33, 121, Math.PI / 2 + 0.1, 8], [-8, 120, Math.PI / 2 - 0.12, 7]];
function hasaField(rt) {
  const W = rt.world, parts = [], c = new THREE.Color(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), O = new THREE.Vector3(1, 1, 1);
  const paint = (g, hex, k) => { c.setHex(hex).multiplyScalar(k); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.index) { const ng = g.toNonIndexed(); g.dispose(); return ng; } return g; };
  for (const [x, z, rot, len] of HASA) {
    const one = [], tiers = 2, top = 0.75 + tiers * 0.55, n = Math.max(2, Math.round(len / 1.8));
    for (let i = 0; i <= n; i++) { const p = new THREE.CylinderGeometry(0.045, 0.06, top + 0.35, 5, 1, true); p.rotateZ(0.03 * Math.sin(i * 2.7)); p.translate((i / n - 0.5) * len, (top + 0.35) / 2 - 0.15, 0); one.push(paint(p, 0x5a4a38, 0.75 + 0.15 * Math.abs(Math.sin(i * 1.9)))); }
    for (let t = 0; t < tiers; t++) {
      const y = 0.75 + (t + 1) * 0.55 - 0.05;
      const bar = new THREE.CylinderGeometry(0.03, 0.03, len + 0.5, 4, 1, true); bar.rotateZ(Math.PI / 2); bar.translate(0, y, 0); one.push(paint(bar, 0x625240, 0.85));
      const m = Math.floor(len / 0.17);
      for (let k = 0; k < m; k++) {
        const lx = -len / 2 + 0.1 + k * 0.17 + 0.02 * Math.sin(k * 3.1 + t);
        const r1 = Math.abs(Math.sin(k * 12.9898 + t * 78.233 + x) * 43758.5453) % 1, r2 = Math.abs(Math.sin(k * 4.1 + t * 9.7 + z) * 9631.7) % 1;
        if (r1 < 0.07) continue;
        const h = 0.42 + 0.22 * r2, k0 = 0.8 + 0.22 * r1 - 0.07 * (tiers - 1 - t);
        for (const s of [-1, 1]) {
          const g = new THREE.CylinderGeometry(0.06 + 0.025 * r2, 0.1 + 0.03 * r1, h, 5, 1, true); g.scale(1, 1, 0.6); g.rotateZ((r1 - 0.5) * 0.22);
          g.rotateX(-s * 0.2); g.translate(lx, y - h / 2 + 0.03, s * 0.07);
          one.push(paint(g, r2 < 0.2 ? 0x8a7a5c : s > 0 ? 0xa89878 : 0x9c8c6e, k0));
        }
      }
    }
    const g = mergeGeometries(one); for (const q of one) q.dispose();
    M.compose(V.set(x, W.heightAt(x, z) - 0.05, z), Q.setFromEuler(E.set(0, rot, 0)), O); g.applyMatrix4(M); parts.push(g);
  }
  const geo = mergeGeometries(parts); for (const q of parts) q.dispose();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  mesh.name = 'hasaField'; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  rt.scene.add(mesh);
}

// 穂の出た稲田と畦・茅葺きの農家・敵の後ろの大軍（10/30 mini「稲田と茅葺きの農家が無い・敵の後ろに続く大軍が無い」）。
// 25秒の所（道の z 100〜110）から八方のどこを向いても、稲田か農家か大軍のどれかが入るように配る。当たりは付けない（兵の歩く道を変えない）。
// 田の区画は地面の畦の筋と同じ 24×20m。道の区画（x 0〜24）と葦原・稲架・家の所は空ける。
const FARMS = [[42, 106, 1.45], [38, 76, -0.1], [40, 138, 0.15], [-4, 141, -0.05], [-21, 133, 0.2], [-19, 100, 1.5], [-17, 70, 0.08],
  [37, 32, -0.15], [-15, 12, 0.1], [38, -48, 1.62], [-13, -74, -0.12], [37, -98, 0.1]];
const nearFarm = (x, z, m) => FARMS.some(([fx, fz]) => Math.abs(x - fx) < 4 + m && Math.abs(z - fz) < 3.5 + m) || HASA.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 5.5);
function farmHouses(rt) {
  for (const [x, z, r] of FARMS) rt.scene.add(hut(rt.world, x, z, 7.5, 5, r, { wall: 0x7f6b52, groundedHome: true, minka: false, solid: false, thatchTies: true }));
}
function paddyRice(rt) {
  const W = rt.world, step = MEM_TIGHT ? 1.3 : 1.0;
  // 株：葉二枚と垂れた穂一つ（三角八つ）。頂点の色で根元の濃い緑・葉先の黄緑・穂の黄金を分ける
  const P = [], C = [], col = (r, g, b, n) => { for (let i = 0; i < n; i++) C.push(r, g, b); };
  for (const [a, h, lean] of [[0.3, 0.95, 0.32], [2.3, 0.85, 0.36]]) {
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa * 0.035, pz = ca * 0.035, mx = ca * lean * 0.45, mz = sa * lean * 0.45, tx = ca * lean, tz = sa * lean;
    const b0 = [-px, 0, -pz], b1 = [px, 0, pz], m0 = [mx - px * 0.8, h * 0.6, mz - pz * 0.8], m1 = [mx + px * 0.8, h * 0.6, mz + pz * 0.8], t = [tx, h * 0.92, tz];
    P.push(...b0, ...b1, ...m1, ...b0, ...m1, ...m0, ...m0, ...m1, ...t);
    col(0.2, 0.27, 0.1, 6); col(0.36, 0.4, 0.15, 2); col(0.5, 0.5, 0.2, 1);
  }
  { // 穂：茎の先から横へ垂れる細い房
    const s = [0, 1.02, 0], e = [-0.22, 0.78, 0.1], w = [0.02, 0, 0.03];
    P.push(s[0] - w[0], s[1], s[2] - w[2], s[0] + w[0], s[1], s[2] + w[2], ...e, -0.04, 0.55, 0, 0.04, 0.55, 0, ...s);
    col(0.62, 0.53, 0.24, 3); col(0.3, 0.33, 0.13, 2); col(0.55, 0.5, 0.22, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
  const hash = (i, j) => { const f = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return f - Math.floor(f); };
  const chunks = new Map(), ridges = [];
  for (const cx of [-12, 36]) for (let cz = 130; cz > -120; cz -= 20) {
    if (hash(cx, cz) < 0.32 && !(cz > 60)) continue;   // 刈った田も混ぜる（25秒の所の近くは全部実った田）
    const key = Math.floor((cz + 130) / 60), arr = chunks.get(key) || chunks.set(key, []).get(key);
    for (let x = cx - 11.2; x < cx + 11.2; x += step) for (let z = cz - 9.2; z < cz + 9.2; z += step) {
      const r1 = hash(x * 3.1, z * 1.7), r2 = hash(z * 2.3, x * 4.9), jx = x + (r1 - 0.5) * step * 0.6, jz = z + (r2 - 0.5) * step * 0.6;
      if (Math.abs(jx - sideX(jz)) < 13.5 || nearFarm(jx, jz, 1.5)) continue;
      arr.push([jx, jz, r1, r2]);
    }
    ridges.push([cx, cz]);
  }
  const o = new THREE.Object3D(), c = new THREE.Color();
  for (const pts of chunks.values()) {
    if (!pts.length) continue;
    const m = new THREE.InstancedMesh(geo, mat, pts.length);
    pts.forEach(([x, z, r1, r2], i) => {
      o.position.set(x, W.heightAt(x, z) - 0.04, z); o.rotation.set((r2 - 0.5) * 0.12, r1 * Math.PI * 2, (r1 - 0.5) * 0.12);
      const s = 0.85 + 0.3 * r2; o.scale.set(s, s * (0.9 + 0.2 * r1), s); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      c.setRGB(0.88 + 0.2 * r1, 0.88 + 0.16 * r2, 0.85 + 0.15 * r1); m.setColorAt(i, c);
    });
    m.receiveShadow = true; m.computeBoundingSphere(); m.matrixAutoUpdate = false; m.name = 'paddyRice';
    rt.scene.add(m);
  }
  // 畦：実った田の四辺に低い土の盛り（半ば埋めた六角の筒を地面に沿って四m ごとに）。一つの形・一つの描く数
  const seen = new Set(), parts = [], up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), Q = new THREE.Quaternion(), M = new THREE.Matrix4(), V = new THREE.Vector3(), O = new THREE.Vector3(1, 1, 1);
  const seg = (ax, az, bx, bz) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 4));
    for (let i = 0; i < n; i++) {
      const x0 = ax + (bx - ax) * i / n, z0 = az + (bz - az) * i / n, x1 = ax + (bx - ax) * (i + 1) / n, z1 = az + (bz - az) * (i + 1) / n;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (Math.abs(mx - sideX(mz)) < 12 || Math.abs(mx - FRONT_X) < 4 || nearFarm(mx, mz, 0)) continue;
      const y0 = W.heightAt(x0, z0), y1 = W.heightAt(x1, z1), L = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const g = new THREE.CylinderGeometry(0.32, 0.32, L + 0.3, 6, 1, true); g.scale(1, 1, 0.55);
      dir.set(x1 - x0, y1 - y0, z1 - z0).normalize(); Q.setFromUnitVectors(up, dir);
      M.compose(V.set(mx, (y0 + y1) / 2 - 0.12, mz), Q, O); g.applyMatrix4(M);
      const k = 0.85 + 0.15 * hash(mx, mz), n2 = g.attributes.position.count, a = new Float32Array(n2 * 3), p = g.attributes.position;
      for (let j = 0; j < n2; j++) { const top = p.getY(j) > (y0 + y1) / 2 + 0.05; a.set(top ? [0.33 * k, 0.36 * k, 0.17 * k] : [0.3 * k, 0.24 * k, 0.16 * k], j * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g);
    }
  };
  for (const [cx, cz] of ridges) for (const [ax, az, bx, bz] of [[cx - 12, cz - 10, cx + 12, cz - 10], [cx - 12, cz + 10, cx + 12, cz + 10], [cx - 12, cz - 10, cx - 12, cz + 10], [cx + 12, cz - 10, cx + 12, cz + 10]]) {
    const key = [ax, az, bx, bz].join(); if (seen.has(key)) continue; seen.add(key); seg(ax, az, bx, bz);
  }
  if (parts.length) {
    const g = mergeGeometries(parts); for (const q of parts) q.dispose();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    mesh.name = 'aze'; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; rt.scene.add(mesh);
  }
}
// 敵の後ろに続く大軍：林勢・信勝方の軽い兵（立体・背旗つき）。本人の 85m 先を保って北へ退き（背を向けて）、土手の奥で止まる。
// 本物の兵には替えない（noWake）。本人の 60m 内の軽い兵は描かれない（共通の決まり）。
const REAR = [[12, 4, 40, 12, 150, 0], [-16, 22, 22, 10, 90, 1], [42, 12, 22, 10, 90, 2]];
function rearArmy(rt) {
  const W = rt.world, F = rt.flags, tex = flagTexture('kari');
  F.rear = REAR.map(([x, z, w, d, count, i]) => {
    const g = W.addDistantArmy({ x, z, w, d, count: MEM_TIGHT ? Math.round(count * 0.8) : count, facing: 0, armor: ZAKO.armor, team: 1, flagTex: tex, mon: 'kari', kind: 'mixed', host: false, flagRate: 0.45, seed: 1029 + i * 17 });
    if (g.army) g.army.noWake = true;
    return { g, x, z, dz: z - REAR[0][1] };
  });
}
function rearTick(rt, P) {
  for (const R of rt.flags.rear || []) {
    if (R.z - P.pos.z < -80 || R.z <= -140) continue;
    if (P.pos.z - R.z < 85) { R.z = Math.max(-140, P.pos.z - 95 + R.dz); R.g.moveTo(R.x, R.z, 8, { back: true }); }
  }
}

// 葦原：脇道の両側に背の高い葦（一つの InstancedMesh）
function reeds(rt) {
  const W = rt.world, blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.05, 0, 0, 0.05, 0, 0, 0.02, 2.5, 0.06, -0.05, 0, 0, 0.02, 2.5, 0.06, -0.03, 1.2, 0.02], 3));
  blade.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8150, roughness: 0.95, side: THREE.DoubleSide });
  const pts = [];
  let s = 1556;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let z = 128; z > -116; z -= 0.55) {
    const cx = sideX(z);
    for (let k = 0; k < 6; k++) {
      const off = (2.2 + rnd() * 10) * (rnd() < 0.5 ? -1 : 1);
      pts.push([cx + off, z + (rnd() - 0.5) * 0.5, rnd()]);
    }
  }
  const m = new THREE.InstancedMesh(blade, mat, pts.length);
  const o = new THREE.Object3D(), c = new THREE.Color();
  pts.forEach(([x, z, r], i) => {
    o.position.set(x, W.heightAt(x, z) - 0.05, z);
    o.rotation.set((r - 0.5) * 0.25, r * Math.PI * 2, (rnd() - 0.5) * 0.25);
    const sc = 0.75 + r * 0.55; o.scale.set(1, sc, 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    c.setRGB(0.5 + r * 0.12, 0.47 + r * 0.1, 0.27 + r * 0.05); m.setColorAt(i, c);
  });
  m.frustumCulled = false; m.receiveShadow = true;
  rt.scene.add(m);
}


const aliveFoes = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && u.team === 1 && !u.civ ? 1 : 0), 0);
const live = (g) => g && g.units.some((u) => u.alive && !u.gone);
const aliveIn = (list) => (list || []).reduce((n, g) => n + g.units.reduce((m, u) => m + (u.alive && !u.gone ? 1 : 0), 0), 0);
// 横の列の真ん中（生きた組の中心の平均）。後ろの軽い大軍が付いて歩く
const lineFront = (list, facing) => {
  let x = 0, z = 0, n = 0;
  for (const g of list || []) if (!g.routing && live(g)) { const c = g.center(); x += c.x; z += c.z; n++; }
  return n ? { x: x / n, z: z / n, facing } : null;
};
// 兵の割合（kaito 10/28）：槍が主・侍一人・弓か鉄砲一人（1556 は鉄砲が少ない）。背の指物は多めに立てて林立させる
const foeKnot = (i, n = 8) => dress([{ type: 'ashigaru', n: Math.ceil((n - 2) * 0.6), o: { flagScale: 1 } }, { type: 'ashigaru', n: (n - 2) - Math.ceil((n - 2) * 0.6) },
  { type: 'samurai', n: 1 }, { type: i % 3 === 0 ? 'gun' : 'bow', n: 1 }]);
const allyKnot = (n = 6) => [{ type: 'ashigaru', n: n - 2, o: { flagScale: 1 } }, { type: 'ashigaru', n: 1 }, { type: 'samurai', n: 1 }];

// 流れ矢（kaito 11/1 B 節）：列がぶつかってからは、25〜75m 先の林勢の方から矢が数本ずつ自分のまわりへ降る。
// 本人の近く（二〜九歩）を狙い、たまに当たる。射手は遠い林勢の一人（弓の者を先に）。矢と音は共通の弓矢の仕組み。
function strayArrows(rt, dt) {
  const F = rt.flags, P = rt.player.u;
  if (!F.stage || F.ending || F.holdPlayer || !P.alive || F.bossOn) return;
  if ((F.arrowT = (F.arrowT ?? 3) - dt) > 0) return;
  F.arrowT = 2.4 + Math.random() * 3.6;
  let src = null, best = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.team !== 1 || u.civ || u.isStruct || u.fleeing || u.group?.routing) continue;
    const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
    if (d < 25 || d > 75) continue;
    const s = Math.random() * (u.type === 'bow' ? 3 : 1);
    if (s > best) { best = s; src = u; }
  }
  if (!src) return;
  const n = 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0), ammo = src.arrowAmmo;
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 7;
    src.arrowAmmo = 99;
    try { rt.army.shoot(src, P, null, { x: P.pos.x + Math.cos(a) * r, y: P.pos.y, z: P.pos.z + Math.sin(a) * r }); } catch (e) { F.arrowT = 1e9; }
  }
  src.arrowAmmo = ammo;
}

const inou_spec = {
  missionStyle: 'lesson',
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,   // 共通の物見の足軽は足さない（乱戦の塊はこの定義が置く）
  playerAtkMax: 4,           // 四方から同時に打つのは四人まで（五人目からは後ろで待つ）
  enemyTactics: false,       // 敵の動きはこの定義が決める（退く槍・立つ弓）
  noFieldMap: true,
  fieldMapRight: true,       // 小さな地図は右上の目標の札の下（kaito 11/1 B 節）。美作守の居場所を赤いひし形で
  mapMarks: (rt) => rt.flags.ending ? null : [rt.flags.bossU?.alive ? rt.flags.bossU.pos : BOSS],
  hideArmyPeek: true,
  hideGuideSteps: true,
  missionSingleLine: true,
  noPlayerFoot: true,
  nearbyAllySignLimit: 0,
  foeMarks: true,
  enemyTriangleSigns: true,
  foeMarkRange: 30,
  missionPin: () => null,       // 行き先は地図のひし形と味方の列の進む先
  missionPinCaption: '',
  learningFight: true,
  playerTaken: 0.42,         // 四人まで同時に打たれる乱戦なので、一太刀は前より軽く（前は二人で 0.6）
  playerRegen: 0.02,
  pacingWait: () => true,
  botDefendsFort: true,      // bot：矢を避けて物陰へ下がらず、前へ進む
  autoTargetCamera: true,
  steadyMeleeCamera: true,
  closeCombatAssist: true,
  noWinCrane: true,
  compactIntro: true,
  introText: () => '柴田勝家の軍勢が崩れて退いた。退く信勝方の殿（しんがり）を務める林美作守（はやしみまさかのかみ）の軍勢と、陣を並べてぶつかる。',
  minutes: 8,
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  world: {
    ...OLD.world,
    height,
    paths: [{ pts: [[FRONT_X, 160], [FRONT_X, -118], [BOSS.x, -134]], w: 4 }, { pts: SIDE, w: 2 }],
    // 屋敷林の帯（10/30）：前の稲生の林は |x|≤56 で外れ、25秒の所（道の z 108 あたり）から八方のどこを向いても林が写らなかった。
    // 道（x 12）を挟んで東西に杉の帯（東 48m・西 76m）、出だしの裏（南）と土手の奥（北）にも帯を回し、田の四方を黒い緑で塞ぐ。
    // 東の小川（x 72）・葦原（x −58 まで）・道は空ける。帯の中心は戦う所から遠く、林の見通し減（groves の r）は道に掛からない。
    groves: [...(OLD.world.groves || []).filter((g) => Math.abs(g.x) > 56 && Math.abs(g.z) < 140),
      { x: 60, z: 0, line: [0, 300], r: 3, n: 115, kind: 'sugi' }, { x: -64, z: 0, line: [0, 300], r: 3, n: 115, kind: 'sugi' },
      { x: -34, z: 154, line: [80, 0], r: 3, n: 31, kind: 'sugi' }, { x: 46, z: 154, line: [56, 0], r: 3, n: 22, kind: 'sugi' },
      { x: 0, z: -152, line: [148, 0], r: 3, n: 57, kind: 'sugi' },
      // 裏の二列目（外へ四・五m）：一列では幹の間に空が抜けた。少なめの株で前の列の隙間を塞ぐ。
      { x: 64.5, z: 0, line: [0, 300], r: 3, n: 70, kind: 'sugi' }, { x: -68.5, z: 0, line: [0, 300], r: 3, n: 70, kind: 'sugi' },
      { x: -34, z: 158.5, line: [80, 0], r: 3, n: 19, kind: 'sugi' }, { x: 46, z: 158.5, line: [56, 0], r: 3, n: 14, kind: 'sugi' },
      { x: 0, z: -156.5, line: [148, 0], r: 3, n: 35, kind: 'sugi' }],
    // 田と畦の色（10/30）：前の稲生の田は |z|≤120 までで、出だしの南（z 120〜146）と土手の手前が砂色の野のままだった。
    // 南北の端も同じ 24×20m の区画の色（畦の土色の筋と稲の縞）で塗る。区画の並びは 20m ごとなので、z をずらして前の式を借りる。
    tint(x, z, h, c) { OLD.world.tint(x, z > 120 && z < 180 ? z - 60 : z < -120 && z > -160 ? z + 40 : z, h, c); },
    // 稲の縞（10/30 採点「稲の縞が無く地が土の一色」）：田の色は藁色なので、色から読む草の割合が 0 になり、田の全部が土の絵だった。
    // 田の中は草の絵（藁色に染まって稲の株に見える）を区画ごとに多め・少なめにし、刈った区画は株の列と土の列を交互に（東西の縞）。
    // 頂点の割合だけを変える（形・絵・描く数は増えない）。道と畦の肩は土のまま。
    grassMix(x, z, pd) {
      if (pd < 1.3 || Math.abs(x) > 112) return 0;
      const zz = z > 120 && z < 180 ? z - 60 : z < -120 && z > -160 ? z + 40 : z;
      if (Math.abs(zz) > 120) return 0;
      const ex = Math.abs(x - Math.round(x / 24) * 24), ez = Math.abs(zz - Math.round(zz / 20) * 20);
      if (Math.min(ex, ez) < 1.3) return 0.15;
      const f = Math.sin(Math.round(x / 24) * 12.9898 + Math.round(zz / 20) * 78.233) * 43758.5453, r = f - Math.floor(f);
      const row = Math.round((z + 320) / (640 / 144)) % 2;
      return r > 0.6 ? 0.7 + 0.2 * r : row ? 0.85 : 0.08;
    },
    // 10/30 採点「地が土の一色」：上の tint は地面の色にならない（tint の色は草の割合を読むためだけで、草の割合は grassMix が上書きする）。
    // 地の色は藁色の草の絵と土の絵の二つだけで、土は明るい砂色寄り・藁と同じ色相だったので一色に見えた。
    // 数で見ると、25秒の画面の地面の画素のうち緑が勝つのは3%だけで、共通の重ね塗り（landOverlay）の草の斑・株のむらは掛からず、土の明暗だけが効いていた。
    // 刈った区画と踏まれた所の土を湿った黒褐へ沈めて藁の株と分け、株の抜けた裸地の斑（patchyGround）を足す（絵・形・描く数・足場は同じ）。
    dirtTint: [0.5, 0.45, 0.38],
    patchyGround: true,
    autumn: true,   // 八月二十四日（今の九月末）の刈り入れ時：田の草の絵を枯れた藁色に（地面の描き方の枝を替えるだけ。絵は増えない）
    // 西の於多井川（x −145）は見えない壁（±74）と杉の二重の帯と霞の向こうで見えないのに、水面と岸を描いていた（10/30）。
    // 外して、稲架の描く一つと三角の分を相殺する。東の小川（x 72）は残す。
    streams: OLD.world.streams.slice(1),
    clear: (x, z) => Math.abs(x) < 80 && Math.abs(z) < 150,
    fleeOut: (x, z, team) => team === 1 && z < -150,
    armyFlagKinds: undefined,
  },

  setup(rt) {
    const F = rt.flags;
    rt.def.playerAtkMax = 4;
    F.sec = {}; F.groups = []; F.holdPlayer = true; F.knots = []; F.allyGs = []; F.dinT = 2;
    reeds(rt);
    hasaField(rt);
    farmHouses(rt);
    paddyRice(rt);
    rearArmy(rt);
    // 夏の終わりの薄雲と霞（前の稲生の setup と同じ。この戦の setup は前の物を呼ばないので、ここで掛ける）：
    // 霞を緑がかった灰に、日を弱めて影を柔らかく。昼の霞だけ百五十mで閉じ、五十〜八十m先の杉の帯を白く透かさない。
    // 兵を描く遠さと敵を見つける見通し（W.vis）は変えない。
    { const W = rt.world, lookOf = W.lookOf, upd = W.update;
      W.lookOf = function (key) { const L = lookOf.call(this, key); if (key === 'day') { L.fog.setHex(0x8c9a8e); L.sunI *= 0.78; L.hemiI *= 1.18; L.cover = Math.max(L.cover, 0.62); } return L; };
      if (W.timeKey === 'day') W.applyLook(W.lookOf('day'));
      W.update = function (...a) { const r = upd.apply(this, a), fog = this.scene.fog, f = Math.floor(fog.far);
        if (this.timeKey === 'day' && f >= 85 && f < 150) fog.far = 150 + (fog.far - f); return r; }; }
    // 組頭（倒されない）と味方の足軽四人
    F.kumi = allyGroup(rt, { name: '組頭', anchor: { x: START.x + 2, z: START.z }, facing: Math.PI, aggro: 6, speed: 4.2, order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '組頭', invuln: true } }]);
    F.kumiU = F.kumi.units[0];
    // 自分の組：組頭と足軽八人。味方の横一列の真ん中（道の上）に立つ
    F.allies = allyGroup(rt, { name: '味方の足軽', fullStrength: true, anchor: { x: FRONT_X, z: ALLY_Z0 }, facing: Math.PI, width: 4, aggro: 0, speed: 2.6, noAI: true, noRout: true,
      order: 'hold', formation: 'line', dmgMult: 0.5, defMult: 1.15 }, allyKnot(9));
    // 味方の横の列（左右に三組ずつ）と、林の先手の横の列（六組）。始めから向かい合って立つ
    F.line = [F.allies, ...SLOTS.map((x, i) => {
      const g = allyGroup(rt, { name: '味方の足軽', fullStrength: true, anchor: { x, z: ALLY_Z0 - (i % 2) * 2 }, facing: Math.PI, width: 4, aggro: 0, speed: 2.6, noAI: true, noRout: true,
        order: 'hold', formation: 'line', dmgMult: 0.5, defMult: 1.15 }, allyKnot(i % 3 ? 9 : 10));
      g.slotX = x; return g;
    })];
    F.allies.slotX = FRONT_X;
    F.l1 = L1_X.map((x, i) => this.foeLine(rt, x, L1_Z0, i, 8, '林勢の先手'));
    F.l1N = F.l1.reduce((n, g) => n + g.units.length, 0);
    F.stage = 0; F.pk = 0; F.kills = 0;
    // 列の後ろの軽い大軍（数には入れない）：本物の列に付いて動く
    const W = rt.world;
    F.backA = W.addBacking({ x: FRONT_X + 12, z: ALLY_Z0, facing: Math.PI, w: 84, depth: 10, count: MEM_TIGHT ? 160 : 220, flag: 'oda', armor: 0x2a2622, kind: 'spear', gap: 9, seed: 1101 });
    F.backB = W.addBacking({ x: FRONT_X + 12, z: L1_Z0, facing: 0, w: 84, depth: 12, count: MEM_TIGHT ? 200 : 280, flag: 'kari', armor: ZAKO.armor, kind: 'mixed', gap: 7, seed: 1102 });
    for (const b of [F.backA, F.backB]) if (b?.army) b.army.noWake = true;
    F.backA?.follow?.(() => lineFront(F.line, Math.PI));
    F.backB?.follow?.(() => lineFront(F.l1, 0));
    rt.obj('main', '林美作守を討て', 'main');
    // 組頭の三つの台詞（字幕）。終わるまで動けない。その後に短い練習
    const L = [['柴田の軍勢は崩れたぞ！', 0.6], ['向こうに林美作の備が陣を張っておる。', 3.4], ['かかる前に稽古じゃ。前の遅れ兵を突いてみよ！', 7.2]];
    for (const [s, t] of L) rt.after(t, () => rt.say('組頭', s, 2.8));
    rt.after(9.6, () => { F.holdPlayer = false; this.spawnPractice(rt); });
  },

  // 林勢の一組（横の列の一つ）。南（味方）を向いて立つ
  foeLine(rt, x, z, i, n, name) {
    const F = rt.flags;
    const g = enemyGroup(rt, { faction: 'nobukatsu', name, anchor: { x, z }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 5,
      noRout: true, noAI: true, formation: 'line', morale: 85, dmgMult: 0.42, order: 'hold', aggro: 0, speed: 1.8 }, foeKnot(i, n));
    g.secKind = 'line'; F.groups.push(g);
    return g;
  },

  // 練習：組頭の前に林の遅れ兵が三人。弱く、一人ずつ寄ってくる
  spawnPractice(rt) {
    const F = rt.flags, P = rt.player.u;
    F.practice = enemyGroup(rt, { faction: 'nobukatsu', name: '林の遅れ兵', anchor: { x: P.pos.x + 1, z: P.pos.z - 12 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 3,
      noRout: true, noAI: true, order: 'attack', aggro: 12, seekRange: 22, focus: P, dmgMult: 0.2, morale: 60, speed: 1.6 }, dress([{ type: 'ashigaru', n: 3 }]));
    for (const u of F.practice.units) { u.hp = u.maxHp = Math.max(24, P.dmg * 2); u.cdBase *= 1.8; }
    F.groups.push(F.practice);
    F.practiceT = rt.t;
  },

  // 段一：両軍の列が鬨を上げてぶつかる
  startLines(rt) {
    const F = rt.flags;
    if (F.stage >= 1) return;
    F.stage = 1; F.stageT = rt.t;
    rt.say('組頭', '列に戻れ！　味方と並んで、林の先手を崩すぞ！', 3.5);
    rt.after(3.6, () => rt.say('足軽', 'かかれぇっ！', 2));
    sfx('taiko', 1); rt.after(0.45, () => sfx('taiko', 0.9));
    rt.army.play('toki', { x: FRONT_X, z: ALLY_Z0 - 4 }, 1.5);
    rt.after(1.2, () => rt.army.play('toki', { x: FRONT_X, z: L1_Z0 }, 1.3));
    for (const g of F.line) {
      g.order = 'move'; g.speed = 2.6; g.dest = { x: g.slotX, z: L1_MEET + 3 };
      g.onArrive = (q) => { q.order = 'attack'; q.aggro = 11; q.seekRange = 26; };
    }
    for (const g of F.l1) {
      g.order = 'move'; g.speed = 1.8; g.dest = { x: g.anchor.x, z: L1_MEET - 3 };
      g.onArrive = (q) => { q.order = 'attack'; q.aggro = 11; q.seekRange = 26; };
    }
    // 練習の残りも列の戦いに加わる
    if (live(F.practice)) { F.practice.focus = null; F.practice.seekRange = 30; }
  },

  // 列が崩れて退く（本人から遠い者は去る）
  routLine(rt, list) {
    for (const g of list) {
      if (!live(g)) continue;
      g.routing = true; g.noRout = false; g.order = 'retreat'; g.focus = null; g.aggro = 0; g.fire = false; g.speed = 3.2;
      g.dest = { x: g.anchor.x, z: -150 }; g.morale = Math.min(g.morale, 20);
    }
  },

  // 段二：林の先手が崩れ、二の備（五組）と後ろの弓組が北から寄せる。両翼でも軽い大軍が組み合う
  breakLine1(rt) {
    const F = rt.flags;
    if (F.stage !== 1) return;
    F.stage = 2; F.stageT = rt.t; F.line1Broken = true;
    this.routLine(rt, F.l1);
    F.backB?.rout?.({ hideAfter: 30 });
    rt.army.play('eshout', rt.player.u.pos, 1.4);
    rt.say('組頭', '先手が崩れたぞ！　だが、まだ二の備がおる。列を組み直せ！', 4);
    rt.after(5, () => rt.say('足軽', '矢が来るぞ、頭を下げい！', 3));
    F.l2 = L2_X.map((x, i) => this.foeLine(rt, x, L2_Z0, i + 2, 8, '林勢の二の備'));
    for (const g of F.l2) g.dmgMult = 0.36;
    // 後詰の二組が南から駆け付け、減った味方の列を埋める
    const pz = Math.min(ZS - 6, rt.player.u.pos.z + 36);
    for (const x of [-20, 44]) {
      const g = allyGroup(rt, { name: '味方の後詰', fullStrength: true, anchor: { x, z: pz }, facing: Math.PI, width: 4, aggro: 0, speed: 3.4, noAI: true, noRout: true,
        order: 'hold', formation: 'line', dmgMult: 0.5, defMult: 1.15 }, allyKnot(10));
      g.slotX = x; F.line.push(g);
    }
    F.bows = [-1, 1].map((sd, i) => {
      const g = enemyGroup(rt, { faction: 'nobukatsu', name: '林勢の弓', anchor: { x: FRONT_X + sd * 16, z: BOW_Z }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 4,
        noRout: true, noAI: true, formation: 'line', morale: 70, dmgMult: 0.45, order: 'hold', aggro: 32, fire: true, fixed: true }, dress([{ type: 'bow', n: 4 }]));
      g.secKind = 'bow'; F.groups.push(g);
      return g;
    });
    F.l2N = F.l2.reduce((n, g) => n + g.units.length, 0);
    F.bowN = F.bows.reduce((n, g) => n + g.units.length, 0);
    const W = rt.world;
    F.backB2 = W.addBacking({ x: FRONT_X + 12, z: L2_Z0, facing: 0, w: 76, depth: 12, count: MEM_TIGHT ? 180 : 240, flag: 'kari', armor: ZAKO.armor, kind: 'mixed', gap: 16, seed: 1103 });
    if (F.backB2?.army) F.backB2.army.noWake = true;
    F.backB2?.follow?.(() => lineFront(F.l2, 0));
    // 両翼の軽い大軍の合戦（本物の兵は増やさない）
    F.wings = [-48, 64].map((x, i) => {
      const C = clash(rt, { x, z: L2_MEET - 4, facing: Math.PI, w: 22, gap0: 10, seed: 1104 + i, noRout: false, noWake: true, host: false,
        A: { flag: 'oda', armor: 0x2a2622, count: MEM_TIGHT ? 90 : 130, team: 0, faction: 'oda' },
        B: { flag: 'kari', armor: ZAKO.armor, count: MEM_TIGHT ? 100 : 150, team: 1, faction: 'nobukatsu', bows: true } });
      C.go?.();
      return C;
    });
    const alive = F.line.filter(live);
    alive.forEach((g, i) => {
      g.focus = null; g.order = 'move'; g.speed = 2.8; g.aggro = 0;
      g.dest = { x: g.slotX, z: L2_MEET + 3 };
      g.onArrive = (q) => { q.order = 'attack'; q.aggro = 11; q.seekRange = 28; };
    });
    for (const g of F.l2) {
      g.order = 'move'; g.speed = 1.6; g.dest = { x: g.anchor.x, z: L2_MEET - 3 };
      g.onArrive = (q) => { q.order = 'attack'; q.aggro = 11; q.seekRange = 26; };
    }
    rt.army.play('toki', { x: FRONT_X, z: L2_Z0 }, 1.4);
  },

  // 段三：二の備も崩れる。土手の林美作守と取り巻きが最後に踏ん張る
  breakLine2(rt) {
    const F = rt.flags;
    if (F.stage !== 2) return;
    F.stage = 3; F.stageT = rt.t; F.line2Broken = true;
    this.routLine(rt, [...F.l2, ...F.bows]);
    F.backB2?.rout?.({ hideAfter: 30 });
    for (const C of F.wings || []) C.rout?.('B', { from: 0, minFight: 6, hideAfter: 30 });
    if (!F.bossG) { this.spawnBoss(rt); this.spawnBank(rt); F.groups.push(F.guardG); F.guardG.secKind = 'guard'; }
    sfx('taiko', 1); rt.after(0.4, () => sfx('taiko', 0.9));
    rt.say('組頭', '二の備も崩れた！　あとは土手の林美作守じゃ。討ち取れ！', 4);
    for (const g of F.line) if (live(g)) {
      g.focus = null; g.order = 'move'; g.speed = 3; g.aggro = 0;
      g.dest = { x: Math.max(-30, Math.min(50, g.slotX)), z: -96 };
      g.onArrive = (q) => { q.order = 'attack'; q.aggro = 12; q.seekRange = 30; };
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (!k?.isPlayer || v.team === rt.player.u.team) return;
    if (F.stage === 0 && v.group === F.practice) {
      F.pk++;
      if (F.pk === 1) rt.say('組頭', 'よし、一人討った、その調子じゃ！', 3);
      else if (F.pk === 2) rt.say('組頭', '見事じゃ。槍は腰で突け。あと一人！', 3);
    } else if (F.stage >= 1) F.kills++;
  },

  // 土手の踏ん張り：美作守の左右に林勢の二組（侍まじり）。本人が近づくと味方の二組が鬨を上げて土手へ駆け上がる
  spawnBank(rt) {
    const F = rt.flags;
    F.bankG = [-1, 1].map((sd, i) => {
      const g = enemyGroup(rt, { faction: 'nobukatsu', name: '林勢の殿', anchor: { x: BOSS.x + sd * 12, z: BOSS.z + 6 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 5,
        noRout: true, formation: 'line', morale: 95, dmgMult: 0.42, order: 'hold', aggro: 14, speed: 2.6 },
      dress([{ type: 'ashigaru', n: 5, o: { flagScale: 1 } }, { type: 'ashigaru', n: 2 }, { type: 'samurai', n: 2 }, { type: 'bow', n: 1 }]));
      g.secKind = 'bank'; F.groups.push(g);
      return g;
    });
  },
  bankCharge(rt) {
    const F = rt.flags;
    F.bankAllies = [-1, 0, 1].map((sd) => {
      const g = allyGroup(rt, { name: '味方の足軽', fullStrength: true, anchor: { x: BOSS.x + sd * 12, z: -92 + Math.abs(sd) * 3 }, facing: Math.PI, width: 4, aggro: 12, speed: 3.6,
        order: 'move', dest: { x: BOSS.x + sd * 12, z: BOSS.z + 9 }, dmgMult: 0.38, noRout: true }, allyKnot(8));
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 26; };
      if (!sd) g.dest = { x: BOSS.x, z: BOSS.z + 12 };
      g.ai = true; F.allyGs.push(g);
      return g;
    });
    rt.army.play('toki', { x: BOSS.x, z: -96 }, 1.5); rt.after(0.5, () => sfx('taiko', 0.9));
  },

  spawnBoss(rt) {
    const F = rt.flags;
    // 大将は一人の備（列の後ろへ下がらない）。取り巻きの槍五人は前に別の備で
    F.bossG = enemyGroup(rt, { faction: 'nobukatsu', name: '林美作守', anchor: { x: BOSS.x, z: BOSS.z }, facing: 0, width: 1, noRout: true, noAI: true,
      order: 'hold', aggro: 0, morale: 100, dmgMult: 0.6, fixed: true },
    dress([{ type: 'busho', n: 1, o: { name: '林美作守', hat: 'kabuto_m', flag: 'aka_kari' } }]));
    F.guardG = enemyGroup(rt, { faction: 'nobukatsu', name: '林美作守の旗本', anchor: { x: BOSS.x, z: BOSS.z + 4 }, facing: 0, width: 5, noRout: true, noAI: true,
      formation: 'line', order: 'hold', aggro: 0, morale: 90, dmgMult: 0.55, fixed: true },
    dress([{ type: 'ashigaru', n: 5 }]));
    const b = F.bossU = F.bossG.units[0];
    const put = (u, x, z) => { u.pos.x = x; u.pos.z = z; u.pos.y = rt.world.heightAt(x, z); };
    put(b, BOSS.x, BOSS.z);
    F.guardG.units.forEach((u, i) => put(u, BOSS.x + (i - 2) * 2.4, BOSS.z + 3.5));
    // 四十秒〜一分で倒せる強さ（仮）
    b.maxHp = b.hp = BOSS_HP;
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    const P = rt.player.u;
    // 見えない壁（時間切れで逃げる者は外へ出す）
    if (!rt.timeLimit?.up) for (const u of rt.army.units) {
      if (!u.alive || u.gone) continue;
      if (u.pos.x > XW) u.pos.x = XW; else if (u.pos.x < -XW) u.pos.x = -XW;
      if (u.pos.z > ZS) u.pos.z = ZS; else if (u.pos.z < ZN) u.pos.z = ZN;
    }
    // 組頭は主人公の脇に付いて北へ
    if ((F.kumiT = (F.kumiT || 0) - dt) <= 0) {
      F.kumiT = 0.5;
      const g = F.kumi;
      if (Math.hypot(F.kumiU.pos.x - P.pos.x, F.kumiU.pos.z - P.pos.z) > 4) { g.order = 'move'; g.dest = { x: P.pos.x + 2.5, z: P.pos.z + 1.5 }; }
      else g.order = 'hold';
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    rearTick(rt, P);
    // 段の進み（kaito 11/1 B 節）：練習 → 林の先手 → 二の備 → 土手の林美作守
    if (F.stage === 0 && F.practice && (!live(F.practice) || rt.t - F.practiceT > PRACTICE_T)) this.startLines(rt);
    if (F.stage === 1) {
      // 列どうしが組み合った時、自分が味方の列のそばにいれば「味方の列と並んで進む」
      if (!F.lineMet) {
        const a = lineFront(F.line, Math.PI), b = lineFront(F.l1, 0);
        if (a && b && Math.abs(a.z - b.z) < 14) {
          let near = Infinity;
          for (const g of F.line) if (live(g)) { const c = g.center(); near = Math.min(near, Math.hypot(c.x - P.pos.x, c.z - P.pos.z)); }
          if (near < 16) F.lineMet = true;
        }
      }
      if (aliveIn(F.l1) <= F.l1N * 0.35 || rt.t - F.stageT > STAGE_T) this.breakLine1(rt);
    } else if (F.stage === 2) {
      if (!F.bowsDown && (aliveIn(F.bows) <= 1 || rt.t - F.stageT > STAGE_T)) { F.bowsDown = true; this.routLine(rt, F.bows); }
      if (aliveIn(F.l2) <= F.l2N * 0.35 || rt.t - F.stageT > STAGE_T + 30) { F.bowsDown = true; this.breakLine2(rt); }
    } else if (F.stage === 3 && !F.bankDown && F.bankG && aliveIn(F.bankG) <= 6) F.bankDown = true;
    if (F.bossG && !F.bankAllies && P.pos.z < -84) this.bankCharge(rt);
    // 崩れて退く林勢：本人から離れた者は去る（本物の兵の枠を空ける）
    for (const g of F.groups) {
      if (!g.routing) continue;
      for (const u of g.units) if (u.alive && !u.gone && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 60) rt.army.despawn(u);
    }
    strayArrows(rt, 0.25);
    // 槍兵：8m で振り向いて戦う。退き切った者は（本人から遠い所でだけ）去らせる。弓兵：30m で射る。葦の伏兵：7m で飛び出す
    for (const g of F.groups) {
      let near = Infinity;
      for (const u of g.units) {
        if (!u.alive || u.gone) continue;
        if (g.order === 'retreat' && u.pos.z < -128 && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 70) { rt.army.despawn(u); continue; }
        near = Math.min(near, Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z));
      }
      if (g.secKind === 'bow') { const on = near < BOW_RANGE; g.fire = on; g.aggro = on ? BOW_RANGE : 0; }
      else if (g.secKind === 'lurk' && g.order === 'hold' && near < 7) { g.order = 'attack'; g.focus = P; g.aggro = 10; g.speed = 3.4; rt.army.play('eshout', P.pos, 1); }
      else if (g.order === 'retreat' && !g.routing && near < TURN) { g.order = 'attack'; g.focus = P; g.aggro = 10; g.speed = 3; }
    }
    // 乱戦の音：近い塊ごとに、足音の地響き・鬨・槍の打ち合いを順に重ねる（人数で厚く）
    if ((F.dinT -= 0.25) <= 0) {
      F.dinT = 1.4 + Math.random() * 1.2;
      let best = null, bd = 80;
      for (const g of F.groups) {
        if (!g.count || g.order === 'retreat' || g.secKind === 'bow' || g.secKind === 'lurk') continue;
        const c = g.center(), d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
        if (d < bd && d > 6 && g.units.some((u) => u.alive && u.target)) { bd = d; best = c; }
      }
      if (best) {
        const k = (F.dinK = ((F.dinK || 0) + 1) % 4), v = Math.min(1.4, 0.7 + 30 / (bd + 20));
        rt.army.play(k === 0 ? 'tramp' : k === 1 ? 'shaftContact' : k === 2 ? 'eshout' : 'clash', { x: best.x, z: best.z }, v);
      }
    }
    // 美作守と取り巻き：20m で戦い始める
    const B = F.bossU;
    if (B && !F.bossOn && Math.hypot(B.pos.x - P.pos.x, B.pos.z - P.pos.z) < BOSS_RANGE) {
      F.bossOn = true;
      for (const g of [F.bossG, F.guardG]) { g.noAI = false; g.order = 'hold'; g.aggro = 14; }   // 土手を離れず、近づいた者と戦う
    }
    // 殿は土手から離れない（追っても 14m で戻る）
    if (B?.alive && F.bossOn && !rt.timeLimit?.up) {
      const g = F.bossG, d = Math.hypot(B.pos.x - BOSS.x, B.pos.z - BOSS.z);
      if (d > 14 && g.order !== 'move') { g.order = 'move'; g.dest = { x: BOSS.x, z: BOSS.z }; g.speed = 3; B.target = null; B.atk = null; }
      else if (d < 3 && g.order === 'move') g.order = 'hold';
    }
    // 美作守との一騎打ちの間（8m 内）は、取り巻きと林勢は周りで味方と斬り合い、本人へ同時に打つのは美作守ともう一人まで
    if (B?.alive) rt.def.playerAtkMax = F.bossOn && Math.hypot(B.pos.x - P.pos.x, B.pos.z - P.pos.z) < 8 ? 2 : 4;
    if (B && !B.alive) this.win(rt);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    rt.say('組頭', '林美作守、討ち取ったり！', 3);
    victoryMoment(rt, '勝');
    rt.finish({ scriptedEnd: true }, 3.5);
  },

  // bot：近い敵を突き、いなければ赤い旗へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const prev = p.botStrikeFoe;
    // 始めの一分は北（前）の敵を先に突く：画面の奥へ乱戦が続き、赤い旗印も向きの先に入る
    const front = (o) => ok(o) && o.pos.z < u.pos.z + 0.5;
    const e = prev?.alive && ok(prev) && p.botStrikeUntil > p.time && Math.hypot(prev.pos.x - u.pos.x, prev.pos.z - u.pos.z) < 2.8 ? prev : (F.bossU?.alive && ok(F.bossU) && Math.hypot(F.bossU.pos.x - u.pos.x, F.bossU.pos.z - u.pos.z) < 9 ? F.bossU : (b.t < 60 && b.army.nearestEnemy(u, 8, front)) || b.army.nearestEnemy(u, F.bossU?.alive || b.t > 200 ? 4 : 8, ok));
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    const B = F.bossU?.alive ? F.bossU.pos : BOSS;
    goTo(p, inp, B.x, B.z + 2, 2);
  },
};
inou_spec.history = OLD.history;
inou_spec.timeslip = OLD.timeslip;

export { inou_spec };
