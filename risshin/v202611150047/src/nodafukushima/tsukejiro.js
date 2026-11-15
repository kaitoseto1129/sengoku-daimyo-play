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
import { WIND_STATE } from '../world.js';

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
  // 11/15 K113：木の材質は頂点の色を掛ける作り。頂点の色を持たない形では黒（0）が掛かり、柵が日なたでも黒い影絵だった。白を持たせる
  for (const g of [geo, box]) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
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
  const puff = puffBatch(rt);
  rt.dispose = function () { geo.dispose(); box.dispose(); puff.dispose(); return dispose.call(this); };
  F.tsukejiro = { forts, root, nextAt: 18, k: 0, queue: [], shots: 0, volleys: 0, puffs: puff.puffs, puff };
  return F.tsukejiro;
}

// 11/15 K113：付城の一斉射の白煙は、兵の煙（army.smokes・上限140）と別の小さな束（上限56・描く回数一回）で描く。
//   引きの絵でも柵の前に煙の壁が立つよう一粒を大きく長く。本物の撃ち手の煙の枠を一つも使わない。
const PUFF_CAP = 56;
function puffBatch(rt) {
  const A = rt.army;
  A.prepareSmokeTexture?.();
  const base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const aP = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_CAP * 3), 3), aS = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_CAP * 3), 3);
  for (const a of [aP, aS]) { a.setUsage(THREE.DynamicDrawUsage); }
  g.setAttribute('aP', aP); g.setAttribute('aS', aS); g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: A.smokeTex }, tint: { value: new THREE.Color(0xf4f2ee) } }]),
    transparent: true, depthWrite: false, fog: true,
    vertexShader: `attribute vec3 aP; attribute vec3 aS; varying vec2 vUv; varying float vA;
#include <fog_pars_vertex>
void main(){ float rot = aS.y, v = floor((rot + 5.0) / 10.0); rot -= v * 10.0; vUv = (uv + vec2(mod(v, 2.0), floor(v / 2.0))) * 0.5; vA = aS.z;
  vec4 mvPosition = modelViewMatrix * vec4(aP, 1.0); float c = cos(rot), s = sin(rot); vec2 q = position.xy * aS.x;
  mvPosition.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `uniform sampler2D map; uniform vec3 tint; varying vec2 vUv; varying float vA;
#include <fog_pars_fragment>
void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(tint * t.rgb, t.a * vA);
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`,
  });
  mat.uniforms.map.value = A.smokeTex;   // 兵の煙と同じ絵を分け合う（写しを作らない）
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.name = '付城の白煙'; mesh.visible = false;
  const puffs = Array.from({ length: PUFF_CAP }, () => ({ on: false })), ord = [];
  const farFirst = (a, b) => b.d - a.d;
  mesh.onBeforeRender = (r, sc, cam) => {
    const ce = cam.matrixWorld.elements;
    ord.length = 0;
    for (const p of puffs) if (p.on && p.alpha > 0.003) { p.d = (p.x - ce[12]) ** 2 + (p.y - ce[13]) ** 2 + (p.z - ce[14]) ** 2; ord.push(p); }
    ord.sort(farFirst);
    const P = aP.array, S = aS.array;
    ord.forEach((p, k) => { const j = k * 3; P[j] = p.x; P[j + 1] = p.y; P[j + 2] = p.z; S[j] = p.size; S[j + 1] = p.rot; S[j + 2] = p.alpha; });
    g.instanceCount = ord.length; aP.needsUpdate = aS.needsUpdate = true;
  };
  rt.scene.add(mesh);
  return { mesh, puffs, mat, dispose() { rt.scene.remove(mesh); g.dispose(); base.dispose(); mat.dispose(); } };
}
// 一つ吹く。枠が尽きたら一番古い粒を使い回す
function puffOut(T, x, y, z, fx, fz, big) {
  let p = T.puffs.find((o) => !o.on);
  if (!p) { p = T.puffs[0]; for (const o of T.puffs) if (o.t / o.life > p.t / p.life) p = o; }
  const burst = 2.5 + Math.random() * 3.5, calm = 1 + 0.6 * Math.max(0, Math.min(1, 1.15 - (WIND_STATE.gust ?? 1)));
  p.on = true; p.t = 0; p.life = (13 + Math.random() * 6) * calm;
  p.x = x + (Math.random() - 0.5) * 0.8; p.y = y; p.z = z + (Math.random() - 0.5) * 0.8;
  p.vx = fx * burst + (Math.random() - 0.5) * 0.8; p.vz = fz * burst + (Math.random() - 0.5) * 0.8; p.vy = 0.1 + Math.random() * 0.15;
  p.s0 = 3 * big; p.s1 = (9 + Math.random() * 4) * big; p.size = p.s0; p.alpha = 0;
  p.rot = ((Math.random() * 4) | 0) * 10 + (Math.random() - 0.5) * 0.5;
  T.puff.mesh.visible = true;
}
// 毎コマ粒を流す：前へ吹き出してすぐ勢いを失い、風に流されて広がり薄れる
function flowPuffs(rt, T, dt) {
  const W = rt.world, wx = WIND_STATE.dirX * 0.9 * (WIND_STATE.gust ?? 1), wz = WIND_STATE.dirZ * 0.9 * (WIND_STATE.gust ?? 1);
  const fc = W.scene?.fog?.color, amb = fc ? Math.max(0.3, Math.min(1, (fc.r * 0.3 + fc.g * 0.59 + fc.b * 0.11) * 1.75)) : 1;
  T.puff.mat.uniforms.tint.value.set(W.timeKey === 'dusk' ? 0xc4b4a2 : W.timeKey === 'storm' ? 0x90948f : 0xf4f2ee).multiplyScalar(amb);
  let any = false;
  const damp = Math.exp(-1.6 * dt);
  for (const p of T.puffs) {
    if (!p.on) continue;
    p.t += dt;
    if (p.t >= p.life) { p.on = false; continue; }
    any = true;
    p.vx *= damp; p.vz *= damp;
    p.x += (p.vx + wx) * dt; p.z += (p.vz + wz) * dt; p.y += p.vy * dt;
    const k = p.t / p.life;
    p.size = p.s0 + (p.s1 - p.s0) * Math.pow(k, 0.4);
    p.alpha = 0.9 * Math.min(1, p.t * 3) * (1 - k) * (1 - k * 0.2);   // 遠い霞の中でも白く立つよう濃く
    p.rot += (p.rot % 10 > 0 ? 1 : -1) * 0.004 * dt;
  }
  if (!any) T.puff.mesh.visible = false;
}

// 毎コマ：昼は二〜四秒おきにどこかの付城が一列を揃えて放つ。夜はまばらな火だけ。退きの段と締めで止める。
export function tick(rt, dt) {
  const F = rt.flags, T = F.tsukejiro;
  if (!T || rt.over) return;
  flowPuffs(rt, T, dt);   // 退きの段でも、残った煙は流れて消える
  if (F.ending || F.retreating) return;
  const A = rt.army, P = rt.player.u.pos;
  // 撃つ途中の列（一挺ずつ少し遅らせて、揃った一斉射の音と火に）
  for (let i = T.queue.length - 1; i >= 0; i--) {
    const s = T.queue[i];
    if (rt.t < s.at) continue;
    T.queue.splice(i, 1);
    T.shots++;
    if (!reduceMotion()) A.flash(s.x + s.fx * 0.6, s.y, s.z + s.fz * 0.6, s.big);
    if (!s.night) {
      if (s.puff) puffOut(T, s.x + s.fx * 0.8, s.y, s.z + s.fz * 0.8, s.fx, s.fz, s.pb);   // 筒先から吹き出す白煙（付城だけの束）
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
  // 白煙は狭間二つに一粒と井楼の上（一列で六〜七粒。遠い付城ほど一粒を大きく＝引きの絵でも煙の壁が写る）
  const pb = Math.max(1, Math.min(1.6, dist / 110));
  row.forEach((s, i) => T.queue.push({ ...s, fx: f.fx, fz: f.fz, big, night, haze: i % 4 === 0, puff: i % 2 === 1, pb, at: t0 + Math.random() * span }));
  try { A.play(night ? 'gunScatter' : 'volley', { x: f.front.x, y: 2, z: f.front.z }, night ? 0.35 : 0.55); } catch (e) { /* 音が無くても進む */ }
}
