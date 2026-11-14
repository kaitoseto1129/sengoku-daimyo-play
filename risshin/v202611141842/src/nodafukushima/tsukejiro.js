// ======================================================================
// 野田・福島の戦い　信長の付城と「数千挺」の撃ち合い（K113・kaito 11/5「鉄砲を数千挺使った戦・信長が砦をいくつも築く」）
// - 『信長公記』巻三：信長は天満が森に陣を取り、川口・渡辺・神崎・上難波・下難波・浜の手に砦を築かせ、
//   根来・雑賀の鉄砲三千挺が加わって、天地も響くほど日夜撃ち合った。将軍義昭も海老江に詰陣した。
// - 二城を遠巻きに囲む付城を六つ置く（柵の四角・井楼・幟。人の形は作らない＝K285 の noFake を守る）。
//   柵と井楼の脚は当たりを持ち、すり抜けない（docs/kaito_no_clip_1110.md）。中へは入れない作り。
// - 付城の柵の狭間と井楼の上から、昼は数秒おきに一列ずつ揃えて撃つ「見せるだけ」の筒先の火・短い煙・
//   柵の前に溜まる硝煙の名残・遠い銃声（兵・当たり・手柄には触れない）。夜（早鐘の後）は火だけをまばらに。
// - 位置と数は推定（史料の砦の名を東西南北の縁へ縮めて置く）。形と材質は一度だけ作り、毎コマ new しない。
// ======================================================================
import * as THREE from 'three';
import { nobori, castleMat, solidSeg, solidCircle } from '../props.js';
import { reduceMotion } from '../settings.js';

// 二城（福島 0,-58／野田 -122,-58）の真ん中あたりを向く
const AIM = { x: -60, z: -64 };
const FORTS = [
  { x: -150, z: 15, mon: 'oda', name: '浜の手の砦' },
  { x: -42, z: 64, mon: 'oda', name: '下難波の砦' },
  { x: 150, z: -5, mon: 'oda', name: '渡辺の砦' },
  { x: 163, z: -82, mon: 'oda', name: '神崎の砦' },
  { x: 118, z: -160, mon: 'imagawa', name: '海老江の東の砦' },
  { x: -62, z: -162, mon: 'imagawa', name: '川口の砦' },
];
const HALF = 8;          // 柵の四角の半分の幅（十六m 四方）
const SAKU_H = 2.3;      // 柵の高さ
const TOWER_H = 6.5;     // 井楼の床の高さ

export function build(rt) {
  const W = rt.world, F = rt.flags;
  if (F.tsukejiro) return F.tsukejiro;
  const logs = [], boards = [], forts = [];
  const log = (ax, ay, az, bx, by, bz, r, c) => logs.push([ax, ay, az, bx, by, bz, r, c]);
  const board = (cx, cy, cz, sx, sy, sz, ry, c) => boards.push([cx, cy, cz, sx, sy, sz, ry, c]);
  for (const f of FORTS) {
    const face = Math.atan2(AIM.x - f.x, AIM.z - f.z);   // 敵の二城の方
    const fx = Math.sin(face), fz = Math.cos(face), rx = fz, rz = -fx;
    const P = (u, v) => ({ x: f.x + rx * u + fx * v, z: f.z + rz * u + fz * v });   // u＝横・v＝前
    const c = [P(-HALF, HALF), P(HALF, HALF), P(HALF, -HALF), P(-HALF, -HALF)];
    // 柵：丸太の杭を四辺に並べ、上下二本の貫で結ぶ
    for (let s = 0; s < 4; s++) {
      const a = c[s], b = c[(s + 1) % 4], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.round(L / 0.42);
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = W.heightAt(x, z);
        const h = SAKU_H + Math.sin(i * 2.3 + s) * 0.12;
        log(x, y - 0.3, z, x, y + h, z, 0.1, [0x9a8c72, 0xa89a7e, 0x8e8068][i % 3]);
      }
      for (const yy of [0.7, 1.75]) {
        const ya = W.heightAt(a.x, a.z) + yy, yb = W.heightAt(b.x, b.z) + yy;
        log(a.x, ya, a.z, b.x, yb, b.z, 0.06, 0x5c5242);
      }
      solidSeg(a.x, a.z, b.x, b.z, 0.25);
    }
    // 井楼：後ろ寄りに一基。四本柱・横木・床・前の板盾・板屋根
    const t = P(0, -2.5), ty = W.heightAt(t.x, t.z), top = ty + TOWER_H;
    for (const [u, v] of [[-1.4, -1.4], [1.4, -1.4], [1.4, 1.4], [-1.4, 1.4]]) {
      const q = P(u, v - 2.5);
      log(q.x, ty - 0.4, q.z, q.x, top + 2.2, q.z, 0.13, 0x75694f);
      solidCircle(q.x, q.z, 0.25);
    }
    for (let y = 1.3; y < TOWER_H; y += 1.6) {
      const k = [P(-1.5, -3.9), P(1.5, -3.9), P(1.5, -1.1), P(-1.5, -1.1)];
      for (let s = 0; s < 4; s++) { const a = k[s], b = k[(s + 1) % 4]; log(a.x, ty + y, a.z, b.x, ty + y, b.z, 0.06, 0x857860); }
    }
    board(t.x, top, t.z, 3.4, 0.14, 3.4, face, 0x7e6d52);                       // 床
    const sh = P(0, -0.85);
    board(sh.x, top + 0.6, sh.z, 3.4, 1.1, 0.08, face, 0x76654c);               // 前の板盾（狭間の高さ）
    board(t.x, top + 2.35, t.z, 4.0, 0.12, 4.0, face, 0x5a4e3e);                // 板屋根
    // 柵の前の竹束（敵へ向けた列。見せるだけ・柵の外へ一m）
    for (let i = -3; i <= 3; i++) {
      const q = P(i * 2.1, HALF + 1.2), y = W.heightAt(q.x, q.z);
      board(q.x, y + 0.85, q.z, 0.75, 1.7, 0.7, face, [0x8a8a52, 0x7d7c48, 0x93915a][(i + 3) % 3]);
    }
    // 幟：前の両角に二本（織田は永楽銭、将軍の砦は二つ引両）
    for (const u of [-HALF + 1, HALF - 1]) { const q = P(u, HALF - 1); const n = nobori(W, q.x, q.z, f.mon, 7); n.userData.tsukeFlag = true; rt.scene.add(n); }
    // 撃つ所：前の柵の狭間（胸の高さ）と、井楼の板盾の上
    const sama = [];
    for (let i = 0; i < 12; i++) { const q = P(-HALF + 0.8 + i * ((2 * HALF - 1.6) / 11), HALF + 0.35); sama.push({ x: q.x, y: W.heightAt(q.x, q.z) + 1.35, z: q.z }); }
    const topShot = [-1, 0, 1].map(u => { const q = P(u, -0.6); return { x: q.x, y: top + 1.2, z: q.z }; });
    const front = P(0, HALF + 3);
    forts.push({ ...f, face, fx, fz, sama, topShot, front });
  }
  // 丸太と板を二つの束にまとめる（全付城で描く回数二回）
  const mat = castleMat('wood');
  const geo = new THREE.CylinderGeometry(1, 1, 1, 6), box = new THREE.BoxGeometry(1, 1, 1);
  const lm = new THREE.InstancedMesh(geo, mat, logs.length), bm = new THREE.InstancedMesh(box, mat, boards.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), col = new THREE.Color(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
  logs.forEach(([ax, ay, az, bx, by, bz, r, c], k) => {
    d.set(bx - ax, by - ay, bz - az); const len = d.length(); q.setFromUnitVectors(up, d.normalize());
    m.compose(pos.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, sc.set(r, len, r)); lm.setMatrixAt(k, m); lm.setColorAt(k, col.setHex(c));
  });
  boards.forEach(([cx, cy, cz, sx, sy, sz, ry, c], k) => {
    q.setFromEuler(e.set(0, ry, 0)); m.compose(pos.set(cx, cy, cz), q, sc.set(sx, sy, sz)); bm.setMatrixAt(k, m); bm.setColorAt(k, col.setHex(c));
  });
  const root = new THREE.Group(); root.name = '信長の付城';
  for (const o of [lm, bm]) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; root.add(o); }
  root.userData.noMerge = true;
  rt.scene.add(root);
  const dispose = rt.dispose;
  rt.dispose = function () { geo.dispose(); box.dispose(); return dispose.call(this); };
  F.tsukejiro = { forts, root, nextAt: 18, k: 0, queue: [], shots: 0, volleys: 0 };
  return F.tsukejiro;
}

// 毎コマ：昼は二〜四秒おきにどこかの付城が一列を揃えて放つ。夜はまばらな火だけ。退きの段と締めで止める。
export function tick(rt, dt) {
  const F = rt.flags, T = F.tsukejiro;
  if (!T || rt.over || F.ending || F.retreating) return;
  const A = rt.army, P = rt.player.u.pos;
  // 撃つ途中の列（一挺ずつ少し遅らせて、揃った一斉射の音と火に）
  for (let i = T.queue.length - 1; i >= 0; i--) {
    const s = T.queue[i];
    if (rt.t < s.at) continue;
    T.queue.splice(i, 1);
    T.shots++;
    if (!reduceMotion()) A.flash(s.x + s.fx * 0.6, s.y, s.z + s.fz * 0.6, s.big);
    if (!s.night) {
      A.smoke(s.x + s.fx * 0.5, s.y, s.z + s.fz * 0.5, s.fx, s.fz, 0.3);   // 筒先の小さな煙（短く消える一粒）
      if (s.haze) rt.world.gunSmoke(s.x + s.fx * 2.5, s.z + s.fz * 2.5, null, true);   // 柵の前に溜まる硝煙
    }
  }
  if (rt.t < T.nextAt || rt.t < 18) return;   // 前夜の篝火の場面（十六秒）の間は撃たない
  const night = (F.step || 0) >= 3;
  T.nextAt = rt.t + (night ? 5 + Math.random() * 4 : 2 + Math.random() * 2.2);
  // 本人から四十〜二百三十歩の付城を順に選ぶ（近すぎる所で人のいない柵が撃たないように）
  let f = null;
  for (let i = 0; i < T.forts.length; i++) {
    const c = T.forts[(T.k + i) % T.forts.length], dd = Math.hypot(c.x - P.x, c.z - P.z);
    if (dd > 40 && dd < 230) { f = c; T.k = (T.k + i + 1) % T.forts.length; break; }
  }
  if (!f) return;
  T.volleys++;
  const dist = Math.hypot(f.x - P.x, f.z - P.z), big = Math.max(1.6, Math.min(4, dist / 40));
  const row = night ? f.sama.filter((_, i) => i % 3 === 0) : f.sama.concat(Math.random() < 0.5 ? f.topShot : []);
  const t0 = rt.t, span = night ? 1.6 : 0.55;
  row.forEach((s, i) => T.queue.push({ ...s, fx: f.fx, fz: f.fz, big, night, haze: i % 4 === 0, at: t0 + Math.random() * span }));
  // 一列の前に、白煙の塊を二つ（一斉射の煙の壁。柵の前へ吹き出して風に流れる）
  if (!night) for (const u of [0.3, 0.7]) {
    const s = f.sama[Math.round(u * (f.sama.length - 1))];
    rt.after(span * u, () => { if (!rt.over && !F.ending) A.smoke(s.x + f.fx, s.y, s.z + f.fz, f.fx, f.fz, 1.2); });
  }
  try { A.play(night ? 'gunScatter' : 'volley', { x: f.front.x, y: 2, z: f.front.z }, night ? 0.35 : 0.55); } catch (e) { /* 音が無くても進む */ }
}
