// ======================================================================
// 雑賀攻め・小雑賀川　柵の内の鉄砲衆の多さ（K122 kaito 11/6「軍勢がいなさすぎ（子供の喧嘩）」・iMac四十六 11/15）
// - この戦は K285 の noFake（本物の兵しか映さない）で、軽い軍勢は作れない。本物の兵も両軍で290の内。
//   そこで人の形は置かず、川上・川下の柵の内と弥勒寺山の陣に、幟の林・一斉射の筒先の火と白煙・篝火・遠い銃声・鳥で
//   「柵の向こうに鉄砲衆がぎっしりいる」を見せる（野田・福島の付城 nodafukushima/tsukejiro.js と同じ考え・白煙の束を共用）。
// - 手本：docs/books/sengoku_tensho_07.md VOL.62「柵の内に鉄砲の列」「長い鉄砲の音が続き」・VOL.63「鳥の群れ」（鳥の立つ方角＝撃ち手の森）。
//   信長公記巻十（山手の川岸は高く、柵の内から撃ち下ろす）。位置と数は推定。
// - 見せるだけ：兵・当たり・手柄・任務には触れない。本人から45歩より近い所は撃たない（人のいない柵が目の前で撃たない）。
//   形と材質は一度だけ作り、毎コマ new しない。描く回数は 白煙一・鳥一・幟と篝火。
// ======================================================================
import * as THREE from 'three';
import { nobori } from '../props.js';
import { reduceMotion } from '../settings.js';
import { puffBatch, puffOut, flowPuffs } from '../nodafukushima/tsukejiro.js';

const FENCE_X = -46.4;                       // 西岸の柵（x -44）の内
const SECTIONS = [-92, -72, -52, 52, 72, 92]; // 本物の鉄砲の小組（z -24〜24）の外の川上・川下
const MIROKU = { x: -116, z: 42, r: 9.4 };   // 弥勒寺山の陣の柵の輪（b_saika.js MIROKU と同じ）
const BIRDS = 26;

export function build(rt) {
  const W = rt.world, F = rt.flags;
  if (F.teppoShu) return F.teppoShu;
  const fronts = [];
  const muzzle = (x, z, fx, fz) => ({ x, y: W.heightAt(x, z) + 1.35, z, fx, fz });
  // 川上・川下の柵の内：一つの持ち場に十四挺（間 1m）。後ろに幟二本
  for (const zc of SECTIONS) {
    const sama = [];
    for (let i = 0; i < 14; i++) sama.push(muzzle(FENCE_X, zc - 6.5 + i, 1, 0));
    fronts.push({ x: FENCE_X, z: zc, sama, front: { x: FENCE_X + 3, z: zc } });
    for (const dz of [-5, 5]) rt.scene.add(nobori(W, FENCE_X - 4.5 - Math.abs(dz) * 0.1, zc + dz + (zc > 0 ? 1 : -1), 'yatagarasu', 6));
  }
  // 弥勒寺山の陣：川へ向く東の半分の柵の内に十挺。幟を三本足す（前の三本と合わせ六本）
  {
    const sama = [];
    for (let i = 0; i < 10; i++) {
      const a = -1.0 + i * (2.0 / 9), r = MIROKU.r - 1.1;
      sama.push({ ...muzzle(MIROKU.x + Math.cos(a) * r, MIROKU.z + Math.sin(a) * r, Math.cos(a), Math.sin(a)) });
    }
    fronts.push({ x: MIROKU.x, z: MIROKU.z, sama, front: { x: MIROKU.x + MIROKU.r + 2, z: MIROKU.z }, hill: true });
    for (const [dx, dz] of [[6, -3], [6, 2], [1, -8]]) rt.scene.add(nobori(W, MIROKU.x + dx, MIROKU.z + dz, 'yatagarasu', 6));
  }
  // 篝火：弥勒寺山の陣と、川上・川下の柵の内の奥に一つずつ（火縄の火種）
  W.addFire(MIROKU.x - 1, MIROKU.z - 2, { size: 0.6, h: 0.12 });
  for (const z of [-82, 82]) W.addFire(FENCE_X - 7, z, { size: 0.55, h: 0.12 });
  // 鳥：弥勒寺山の裏の森から、一斉射の後に群れで立つ（撃ち手の方角の印）。小さな「へ」の字の板を一つの束で
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0.12, 0, 0, 0, 0.1, 0, 0, -0.1, 0.5, 0.12, 0, 0, 0, -0.1, 0, 0, 0.1], 3));
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x2a2826, side: THREE.DoubleSide, fog: true });
  const birds = new THREE.InstancedMesh(wing, birdMat, BIRDS);
  birds.frustumCulled = false; birds.visible = false; birds.name = '弥勒寺山の鳥';
  rt.scene.add(birds);
  const flock = Array.from({ length: BIRDS }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ph: 0 }));
  const puff = puffBatch(rt);
  const dispose = rt.dispose;
  rt.dispose = function () { wing.dispose(); birdMat.dispose(); puff.dispose(); return dispose.call(this); };
  F.teppoShu = { fronts, nextAt: 8, k: 0, queue: [], puffs: puff.puffs, puff, birds, flock, birdT: -1, birdNext: 14, shots: 0, volleys: 0 };
  return F.teppoShu;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
function startBirds(rt, T) {
  if (reduceMotion()) return;
  const W = rt.world, cx = MIROKU.x - 14, cz = MIROKU.z + 10, y0 = W.heightAt(cx, cz) + 6;
  for (const b of T.flock) {
    b.x = cx + (Math.random() - 0.5) * 16; b.z = cz + (Math.random() - 0.5) * 16; b.y = y0 + Math.random() * 3;
    b.vx = -2 - Math.random() * 3; b.vz = 1.5 + Math.random() * 2.5; b.vy = 2.5 + Math.random() * 2; b.ph = Math.random() * 6.28;
  }
  T.birdT = 0; T.birds.visible = true;
}
function flowBirds(dt, T) {
  if (T.birdT < 0) return;
  T.birdT += dt;
  if (T.birdT > 16) { T.birdT = -1; T.birds.visible = false; return; }
  T.flock.forEach((b, i) => {
    b.vy *= Math.exp(-0.25 * dt); b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.ph += dt * 11;
    const flap = 0.35 + 0.65 * Math.abs(Math.sin(b.ph));
    _q.setFromEuler(_e.set(0, Math.atan2(b.vx, b.vz), 0));
    _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(0.9, flap * 1.6, 0.9));
    T.birds.setMatrixAt(i, _m);
  });
  T.birds.instanceMatrix.needsUpdate = true;
}

// 毎コマ：三〜五秒おきに、本人から四十五〜二百四十歩の持ち場が一列を揃えて放つ。休戦（使者）・締めの段で止める。
export function tick(rt, dt) {
  const F = rt.flags, T = F.teppoShu;
  if (!T || rt.over) return;
  flowPuffs(rt, T, dt);
  flowBirds(dt, T);
  if (F.ending || F.bankCeasefire || (F.step || 0) >= 6) return;
  const A = rt.army, P = rt.player.u.pos;
  for (let i = T.queue.length - 1; i >= 0; i--) {
    const s = T.queue[i];
    if (rt.t < s.at) continue;
    T.queue.splice(i, 1);
    T.shots++;
    A.flash(s.x + s.fx * 0.6, s.y, s.z + s.fz * 0.6, s.big);
    if (s.puff) puffOut(T, s.x + s.fx * 0.8, s.y, s.z + s.fz * 0.8, s.fx, s.fz, s.pb);
    if (s.haze) rt.world.gunSmoke(s.x + s.fx * 2.5, s.z + s.fz * 2.5, null, true);
  }
  if (rt.t >= T.birdNext && T.birdT < 0) { T.birdNext = rt.t + 45 + Math.random() * 20; startBirds(rt, T); }
  if (rt.t < T.nextAt) return;
  T.nextAt = rt.t + 3 + Math.random() * 2;
  let f = null;
  for (let i = 0; i < T.fronts.length; i++) {
    const c = T.fronts[(T.k + i) % T.fronts.length], dd = Math.hypot(c.x - P.x, c.z - P.z);
    if (dd > 45 && dd < 240) { f = c; T.k = (T.k + i + 1) % T.fronts.length; break; }
  }
  if (!f) return;
  T.volleys++;
  const dist = Math.hypot(f.x - P.x, f.z - P.z), big = Math.max(1.6, Math.min(4, dist / 40)), pb = Math.max(1, Math.min(1.6, dist / 110));
  // 一列の全部でなく、雑賀の撃ち方（交互に放つ）に合わせて半分ほどが揃って放つ
  const row = f.sama.filter((_, i) => (i + T.volleys) % 2 === 0 || Math.random() < 0.3);
  const t0 = rt.t;
  row.forEach((s, i) => T.queue.push({ ...s, big, pb, haze: i % 4 === 0, puff: i % 2 === 1, at: t0 + Math.random() * 0.6 }));
  try { A.play('volley', { x: f.front.x, y: 2, z: f.front.z }, 0.5); } catch (e) { /* 音が無くても進む */ }
}
