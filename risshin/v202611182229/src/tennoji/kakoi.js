// ======================================================================
// 天王寺砦　四方の囲み（台帳 K361・kaito 11/17「籠城戦なのに囲われている感じがない。城の周りを見渡す限り360度敵が囲んで
//   鉄砲を浴びせてくる、が無い。右上の地図で見ても砦が全然囲われていない。あとどれぐらい待てばいいかも分からない」）
// 前の作り：囲みの本物の兵は西・東・北の三組と南の門前だけ（本物の兵は両軍で250の内。K285 の noFake で絵だけの兵は作れない）。
//   砦の櫓から見回すと、三組の外は空の野原だった。
// 作り（作り直さず足す。人の形は置かない＝noFake を守る。雑賀 saika/teppo_shu.js・小田原 t12_odawara/kakoi.js と同じ考え）：
//   ① 幟の林：砦を四重に一回りする本願寺（南無阿弥陀仏）と雑賀（八咫烏）の幟。束（InstancedMesh）で描くので描く回数は三つ。
//      南の住吉口の道（後詰の入る道）と東の打って出の道は空ける。後詰が囲みへ掛かると、西・東・南の幟は見ていない間に退く（北の本隊は残る）。
//   ② 四方の鉄砲：幟の林の前の七か所の持ち場が、籠城の間ずっと二〜三秒おきに順に一斉に放つ（筒先の火・白煙・遠い銃声）。
//      本人に近い側の柵には玉が当たる音と、頭の上を抜ける音。本人から三十二歩より近い持ち場は撃たない（人のいない所が目の前で撃たない）。
//   ③ 柵に寄せる：西・北・東の本物の囲み（F.siegeW）が、およそ四十秒ごとに一組ずつ柵の際まで寄せては持ち場へ戻る（防ぐ相手が来る）。
//   ④ 地図：砦を囲む赤い輪と、南から近づく後詰の青い塊（籠城の間、狼煙と同じ間合いで砦へ寄る）を右上の地図に（hud_jk.js の rt.flags.mapBlobs）。
//   手本：『信長公記』巻九（一万五千が砦を取り囲む・数千挺の鉄砲）。幟の数・持ち場の位置・寄せの間合いは推定。
// 見せるだけ：兵の数・当たり・手柄・任務には触れない（③だけ本物の組を動かす）。形と材質は一度だけ作り、毎コマ new しない。
// ======================================================================
import * as THREE from 'three';
import { nobori, noboriClothLite, kagaribiBatch, jinmaku, takataba } from '../props.js';
import { MEM_TIGHT, reduceMotion } from '../settings.js';
import { puffBatch, puffOut, flowPuffs } from '../nodafukushima/tsukejiro.js';
import { SOTO_POLY } from '../castles/tennoji.js';

const C = { x: 0, z: -66 };                 // 砦の真ん中（外曲輪 SOTO_POLY の中）
const ROWS = [47, 57, 68, 81];              // 幟の輪の半径（砦の柵から二十五〜六十歩）
const SHITEN = { x: 52, z: 6 };             // 四天王寺の焼け跡（幟を立てない）
// 鉄砲の持ち場：角度 θ（南が 0・東が +π/2）と半径。南の真ん中（門の前）は本物の寄せ手がいるので置かない
const FRONTS = [[-0.8, 54], [-Math.PI / 2, 50], [-2.25, 52], [Math.PI, 52], [2.25, 52], [Math.PI / 2, 52], [0.8, 54]];
// 後詰の近づき（籠城の始めからの秒・x・z）。狼煙（b_tennoji.js siege）も同じ所に立てる。地図の外の間は縁に寄る
// 11/17 K361③（iMac n-tennoji：南の門の内から狼煙が見えない）：門の屋根が正面の左右およそ35度を塞ぎ、カメラの奥行き（約370m）より先は描かれない。
//   後詰は南東の丘から斜めに寄せ（門から左へ約25度）、狼煙の上の柱が門の屋根の上の空に、280m→160m と近づいて見える
// 11/17 K361 長さ（n-tennoji）：籠城を約250秒→92秒に詰めたので、近づきの秒も詰めた（位置は同じ）
const DUST_TINT = new THREE.Color(0.78, 0.66, 0.5);   // 土埃の色（白煙の色に掛ける）
const RELIEF = [[0, 122, 215], [28, 101, 172], [50, 85, 136], [72, 68, 100], [92, 30, 90]];
export function reliefAt(el) {
  for (let i = 1; i < RELIEF.length; i++) if (el < RELIEF[i][0]) {
    const [t0, x0, z0] = RELIEF[i - 1], [t1, x1, z1] = RELIEF[i], k = Math.max(0, (el - t0) / (t1 - t0));
    return { x: x0 + (x1 - x0) * k, z: z0 + (z1 - z0) * k };
  }
  const L = RELIEF[RELIEF.length - 1]; return { x: L[1], z: L[2] };
}

const rr = (x, z, k) => { const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.7) * 43758.5453; return v - Math.floor(v); };
const keepOut = (x, z) =>
  // 南の住吉口の道と門の前（後詰の入る道）。11/18 K365（囲まれ感・門の内から南を向くと野が空いて見えた）：門の前（二十歩）は広く空け、
  //   その先は道の幅（二十二歩）だけ空けて、道の両脇まで幟の林を寄せる
  (z > -46 && z < -20 && x > -16 && x < 24) || (z >= -20 && x > -6 && x < 16) ||
  (x > 30 && x < 50 && z > -132 && z < -16) ||       // 東の打って出の道（SORTIE_TURN〜SORTIE_NORTH）
  Math.hypot(x - SHITEN.x, z - SHITEN.z) < 22;
// 方角の組：0 西・1 東・2 北・3 南（後詰が掛かった後、北の本隊の方へ退くのは 0・1・3）
const sideOf = (x, z) => (z < C.z - 30 && Math.abs(x - C.x) < 40 ? 2 : z > C.z + 22 ? 3 : x < C.x ? 0 : 1);

export function install(rt, o) {
  noros.length = 0;   // 前の戦の狼煙を持ち越さない
  const W = rt.world, F = rt.flags, sc = rt.scene;
  if (F.kakoi) return F.kakoi;
  // ---- ① 幟の林 ----
  // 11/17 写真（櫓の高さから四方）：同じ間で一回りに並べると、細い幟がまばらに立つ野原に見えた（太い塊が無い）。
  //   備ごとの塊（輪に沿って十四歩ほど）に詰めて立て、塊と塊の間を空ける。輪ごとに塊をずらす
  const step = MEM_TIGHT ? 2.3 : 1.8, CLUMP = 14;
  const list = [];
  for (let r = 0; r < ROWS.length; r++) {
    const R = ROWS[r], n = Math.floor(Math.PI * 2 * R / step);
    for (let i = 0; i < n; i++) {
      const a = (i + (r % 2) * 0.5) / n * Math.PI * 2;
      const j = rr(i, R, 1), dr = (rr(i, R, 2) - 0.5) * 3.4;
      const along = (a * R + r * CLUMP * 0.55) % (CLUMP * 1.45);
      if (along > CLUMP || j < 0.1) continue;   // 塊の間を空け、塊の中も一割ほど抜いて揃い過ぎない
      const x = C.x + Math.sin(a) * (R + dr), z = C.z + Math.cos(a) * (R + dr);
      if (keepOut(x, z) || W.waterDepthAt?.(x, z) > 0.2) continue;
      // 雑賀の八咫烏は西（鈴木孫一の鉄砲の備え）と東の鉄砲衆の側に三本に一本
      const saika = (x < -30 || x > 30) && rr(x, z, 3) < 0.34;
      // 11/18 K365（質）：塊の頭（輪に沿って最初の一歩半）の一本は大幟（一・四倍）。同じ丈の幟が並ぶ揃い過ぎを崩し、備ごとの頭が読める
      // 11/19：外の輪の大幟は霞で淡い縦長の板（遠目にビル街）に見えたので、大幟は内の二つの輪だけ・一・三倍
      const lead = along < 1.5 && r < 2 ? 1.3 : 1;
      list.push({ x, z, saika, side: sideOf(x, z), h: (0.82 + rr(x, z, 4) * 0.3) * (1 + r * 0.12) * lead,   // 11/18 外の輪ほど高く：砦の内（柵と土手の陰）からも外の輪の幟が柵の上に林として見える
      yaw: a + Math.PI + (rr(x, z, 5) - 0.5) * 0.6 });
    }
  }
  const srcN = nobori(W, 0, 0, 'namu', 6.4), srcY = nobori(W, 0, 0, 'yatagarasu', 6.4);
  const cloth = noboriClothLite(6.4);
  // 竿は割りの少ない一本（乳の輪は遠目に見えないので省く）
  const staffGeo = new THREE.CylinderGeometry(0.06, 0.08, 6.4, 4); staffGeo.translate(0, 3.2, 0);
  const staffMat = new THREE.MeshLambertMaterial({ color: 0x6e5636 });
  const groups = [list.filter((b) => !b.saika), list.filter((b) => b.saika)];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
  const pose = (b) => { v.set(b.x, W.heightAt(b.x, b.z), b.z); e.set((rr(b.x, b.z, 6) - 0.5) * 0.08, b.yaw, (rr(b.x, b.z, 7) - 0.5) * 0.08); q.setFromEuler(e); s3.set(1, b.h, 1); return m4.compose(v, q, s3); };
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const root = new THREE.Group(); root.name = '天王寺砦を囲む幟の林';
  const ims = [];
  const mk = (geo, mat, arr) => {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, arr.length));
    arr.forEach((b, i) => im.setMatrixAt(i, pose(b)));
    if (!arr.length) im.setMatrixAt(0, zero);
    im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    root.add(im); ims.push({ im, arr });
    return im;
  };
  mk(staffGeo, staffMat, list);
  mk(cloth, srcN.children[0].material, groups[0]);
  mk(cloth, srcY.children[0].material, groups[1]);
  root.userData.noMerge = true;
  sc.add(root);
  // 篝火：各方角の幟の林の奥に（火縄の火種・陣の印）
  const fires = [];
  for (const [a, R] of [[-1.2, 74], [-2.0, 74], [2.0, 74], [1.2, 74], [Math.PI, 74], [-0.55, 62], [0.55, 62]]) {
    const x = C.x + Math.sin(a) * R, z = C.z + Math.cos(a) * R;
    if (!keepOut(x, z)) fires.push([x, z]);
  }
  if (fires.length) sc.add(kagaribiBatch(W, fires));
  // 陣幕：幟の林の奥（砦から百歩ほど）に、囲みの将の陣所を五つ（兵の絵は置かない）
  for (const a of [-1.25, -2.1, Math.PI, 2.1, 1.25]) {
    const x = C.x + Math.sin(a) * 98, z = C.z + Math.cos(a) * 98;
    if (!keepOut(x, z)) sc.add(jinmaku(W, x, z, 12, 8, 4, { mon: rr(x, z, 8) < 0.5 || x < 0 ? 'namu' : 'yatagarasu' }));
  }

  // ---- ② 四方の鉄砲の持ち場 ----
  const fronts = FRONTS.map(([a, R]) => {
    const x = C.x + Math.sin(a) * R, z = C.z + Math.cos(a) * R, fx = -Math.sin(a), fz = -Math.cos(a), tx = fz, tz = -fx;
    const sama = [];
    for (let i = 0; i < 12; i++) { const k = (i - 5.5) * 1.15, sx = x + tx * k, sz = z + tz * k; sama.push({ x: sx, y: W.heightAt(sx, sz) + 1.35, z: sz, fx, fz }); }
    // 玉の当たる所：砦の柵（真ん中から二十二歩ほど）の、この持ち場に向いた面
    return { x, z, fx, fz, sama, hit: { x: C.x - fx * 22, z: C.z - fz * 22 }, side: sideOf(x, z) };
  });
  // 11/18 K365（囲まれ感・質を一段）：鉄砲の持ち場の前（砦の側）に竹束の仕寄りを四つ。人の居ない野の幟だけでなく、砦を狙う鉄砲の列の陣と読める。
  //   束と束の間は空け（寄せ手と使番が抜ける）、寄せの道（西・東・北の囲みの持ち場→柵の角）には掛からない半径に置く
  for (const f of fronts) {
    const a = Math.atan2(-f.fx, -f.fz), tx = f.fz, tz = -f.fx;
    for (const k of [-4.5, -1.5, 1.5, 4.5]) {
      const x = f.x + f.fx * 2.2 + tx * k, z = f.z + f.fz * 2.2 + tz * k;
      if (keepOut(x, z) || W.waterDepthAt?.(x, z) > 0.2) continue;
      sc.add(takataba(W, x, z, a + Math.PI, { fieldBundle: true, fieldTrestle: true }));
    }
  }
  const puff = puffBatch(rt);
  // 11/18 柵に当たる玉の土埃は別の束（色が鉄砲の白煙と違う・土の色）
  const dust = puffBatch(rt); dust.mesh.name = '天王寺砦の柵の土埃';
  const dispose = rt.dispose;
  rt.dispose = function () { staffGeo.dispose(); staffMat.dispose(); puff.dispose(); dust.dispose(); return dispose.call(this); };
  // ---- ④ 地図の塊 ----
  const ring = [];
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2, x = C.x + Math.sin(a) * 60, z = C.z + Math.cos(a) * 60;
    if (keepOut(x, z) && z > -46) continue;   // 南の道の口は空けて描く（後詰の入る口）
    ring.push({ x, z, w: 26, d: 14, facing: a, side: 1, sideK: sideOf(x, z), off: false });
  }
  const relief = { x: RELIEF[0][1], z: RELIEF[0][2], w: 34, d: 18, facing: 0, side: 0, off: true };
  F.mapBlobs = [...ring, relief];
  F.kakoi = { list, ims, zero, pose, fronts, puffs: puff.puffs, puff, dustT: { puffs: dust.puffs, puff: dust }, queue: [], nextAt: 0, k: 0, volleys: 0, shots: 0,
    ring, relief, pushAt: 0, pushK: 0, pushing: null, gone: [false, false, false, false], o, t0: -1, hideT: 0 };
  return F.kakoi;
}

// 籠城の始め（b_tennoji.js siege）：鉄砲と寄せと後詰の近づきを動かし始める
export function start(rt) {
  const T = rt.flags.kakoi;
  if (!T || T.t0 >= 0) return;
  T.t0 = rt.t; T.nextAt = rt.t + 3; T.pushAt = rt.t + 30;
  T.relief.off = false;
}

const _cf = new THREE.Vector3();
// 見ていない方角の幟だけを消す（目の前で消えない）。退いた方角は地図の輪も消す
function hideSides(rt, T, sides, far = 260) {
  const cam = rt.camera || rt.cam, P = rt.player.u.pos;
  if (cam) cam.getWorldDirection(_cf);
  let left = false;
  for (const { im, arr } of T.ims) {
    let dirty = false;
    arr.forEach((b, i) => {
      if (b.hid || !sides.includes(b.side)) return;
      const dx = b.x - P.x, dz = b.z - P.z, L = Math.hypot(dx, dz) || 1;
      if (cam && (dx * _cf.x + dz * _cf.z) / L > 0.2 && L < far) { left = true; return; }   // 画面に入る向き
      b.hid = true; im.setMatrixAt(i, T.zero); dirty = true;
    });
    if (dirty) im.instanceMatrix.needsUpdate = true;
  }
  for (const r of T.ring) if (sides.includes(r.sideK)) r.off = true;
  return left;
}

const inSoto = (x, z) => { let c = false; for (let i = 0, j = SOTO_POLY.length - 1; i < SOTO_POLY.length; j = i++) { const [xi, zi] = SOTO_POLY[i], [xj, zj] = SOTO_POLY[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
// 11/17 クラウド K365（cloud-06 の act bot：敵を前に20秒止まった30回余り）：籠城の間、砦の内の味方（主郭の護衛・砦に入った原田勢・門内の明智の手）は
//   柵の外へ寄せた囲みを前に持ち場で槍を揃えて待つのが正しい（柵を越えて追わない）。その間は「内で持ち場を守る組」（interiorHold）として扱う。
//   後詰の段（step 1）からは外す（打って出・追撃では動く）
function holdInside(rt, T) {
  const F = rt.flags, hold = !F.ending && ((F.step || 0) < 1 || F.step === 2.5);
  for (const g of rt.army.groups) {
    if (g.team !== 0 || g.isPlayerSquad || !g.count) continue;
    // 主郭の護衛と砦の鉄砲組は、後詰の後も砦に残る定番（打って出・追撃に加わらない）。砦の内にいる間はずっと内の持ち場の組
    // 後詰の後も、打って出の手（明智・佐久間・滝川・信長・馬廻）でない残りの組（砦に入った原田勢・門外へ出た明智の手の生き残りなど）は砦の内に残る
    const sortieHand = g === F.ake || g === F.saku || g === F.taki || g === F.nobu || g === F.honjin?.guard;
    const c = g.center(), on = (hold || g === F.rearGuard || g === F.fgun || !sortieHand) && inSoto(c.x, c.z);
    if (on) { if (!g.interiorHold) { g.interiorHold = true; g._k365hold = true; } }
    else if (g._k365hold) { g.interiorHold = false; g._k365hold = false; }
  }
}

// 11/17 K361③：後詰の狼煙。世の煙の柱（world_smoke）は霧に溶けて、描く遠さ（150m）の際では空の色になり写らなかった。
//   霧を受けない黒い煙の玉を縦に重ねた柱（玉はゆっくり昇って上で薄れ、下から生まれ直す）。材質と絵は一つを使い回す
let NORO_MAT = null;
const noros = [];
export function noroshi(rt, x, z) {
  if (!NORO_MAT) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    NORO_MAT = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), color: 0x45413c, transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  }
  const y0 = rt.world.heightAt(x, z) + 2, N = MEM_TIGHT ? 9 : 12, list = [];
  for (let i = 0; i < N; i++) { const s = new THREE.Sprite(NORO_MAT.clone()); s.renderOrder = 2; rt.scene.add(s); list.push({ s, k: i / N }); }
  noros.push({ x, z, y0, list, t: 0, H: 46 });
}
function noroTick(dt) {
  for (const n of noros) {
    n.t += dt;
    for (const p of n.list) {
      p.k = (p.k + dt / (reduceMotion() ? 1e9 : 40)) % 1;
      const k = p.k, w = 4 + k * 13;
      // 上ほど風下（東）へ流れ、太く、薄く
      p.s.position.set(n.x + k * k * 14, n.y0 + k * n.H, n.z - k * 4);
      p.s.scale.set(w, w * 1.15, 1);
      p.s.material.opacity = 0.74 * Math.min(1, k * 8) * (1 - k * 0.65) * Math.min(1, n.t / 6);
    }
  }
}

export function tick(rt, dt) {
  if (noros.length) noroTick(dt);
  const F = rt.flags, T = F.kakoi;
  if (!T || rt.over) return;
  T.holdT = (T.holdT || 0) - dt;
  if (T.holdT <= 0) { T.holdT = 1; holdInside(rt, T); }
  flowPuffs(rt, T, dt);
  if (T.dustT) { flowPuffs(rt, T.dustT, dt); T.dustT.puff.mat.uniforms.tint.value.multiply(DUST_TINT); }
  const A = rt.army, P = rt.player.u.pos;
  // 玉が飛ぶ間（筒先の火の後、柵に当たる音）
  for (let i = T.queue.length - 1; i >= 0; i--) {
    const s = T.queue[i];
    if (rt.t < s.at) continue;
    T.queue.splice(i, 1);
    if (s.snd) { try { A.play(s.snd, s, s.vol || 0.5); } catch (e) { /* 音が無くても進む */ } continue; }
    if (s.dust) {   // 柵に当たった玉の土埃（小さく・土の色・三秒半で消える）
      const D = T.dustT || T; puffOut(D, s.x, s.y, s.z, s.fx * 0.15, s.fz * 0.15, 0.22);
      for (const q of D.puffs) if (q.on && q.t === 0) q.life = 3.5;
      continue;
    }
    T.shots++;
    A.flash(s.x + s.fx * 0.6, s.y, s.z + s.fz * 0.6, s.big);
    if (s.puff) puffOut(T, s.x + s.fx * 0.8, s.y, s.z + s.fz * 0.8, s.fx, s.fz, s.pb);
  }
  // 後詰が囲みへ掛かった後：西・東・南の囲みは北の本隊の方へ退く（見ていない間に幟を消す）。追撃の段で北も退く
  const step = F.step || 0;
  // 11/18 K365（写真：籠城の125秒、砦の内から北を向いても幟の林がまばら）：籠城の前（段1・2）にも『後詰が掛かった後』の消しが走り、
  //   見ていない間に西・東・南の幟を消していた。消すのは籠城が終わってから（段2.75 合流より後）だけ
  if (step >= 2.75) {
    T.hideT -= dt;
    if (T.hideT <= 0) {
      T.hideT = 1;
      // 11/18 夜50-21：追い討ち（段4〜）で振り返ると、霞の奥（百〜二百五十歩）に残った幟の林が白い四角の列になり、地平のビル街に見えた。
      //   囲みはもう崩れて退いたので、追い討ちからは霞に沈む百十歩より奥の幟は目の前でも下げる（近い幟は今まで通り見ていない時だけ）
      hideSides(rt, T, step >= 4 || F.ending ? [0, 1, 2, 3] : [0, 1, 3], step >= 4 || F.ending ? 110 : 260);
      T.relief.off = true;
    }
    // 寄せの途中で後詰が掛かったら、持ち場（寄せる前の所）を元に戻してから退かせる（b_tennoji.js breakIn は anchor から北へ退く）
    if (T.pushing) { const g = T.pushing.g; if (g.anchor && !T.o?.spent?.(g)) { g.anchor.x = T.pushing.home.x; g.anchor.z = T.pushing.home.z; } T.pushing = null; }
    return;
  }
  if (step !== 2.5 || F.ending || T.t0 < 0) return;
  const el = rt.t - T.t0;
  // ④ 後詰の青い塊を、狼煙と同じ間合いで砦へ寄せる
  {
    const p = reliefAt(el);
    T.relief.x = p.x; T.relief.z = p.z;
  }
  // ③ 柵に寄せる：西・北・東の本物の囲みが一組ずつ、柵の際まで寄せては持ち場へ戻る
  const o = T.o || {}, sw = F.siegeW || [];
  if (o.march && sw.length) {
    if (T.pushing && rt.t > T.pushing.until) {
      const g = T.pushing.g;
      if (!o.spent?.(g)) { o.march(g, [[T.pushing.home.x, T.pushing.home.z]], 'hold', 0); g.anchor = T.pushing.home; }
      T.pushing = null;
    } else if (!T.pushing && rt.t >= T.pushAt) {
      T.pushAt = rt.t + 28 + Math.random() * 8;
      for (let k = 0; k < sw.length; k++) {
        const g = sw[(T.pushK + k) % sw.length];
        if (o.spent?.(g) || !g.anchor) continue;
        T.pushK = (T.pushK + k + 1) % sw.length;
        const home = { x: g.anchor.x, z: g.anchor.z }, dx = home.x - C.x, dz = home.z - C.z, L = Math.hypot(dx, dz) || 1;
        // 柵（外曲輪の際）の三歩外
        // 西と東の囲みは、南の門の脇の柵の角（門の内の持ち場から見える所）へ寄せる。北は北の柵の外へ
        //   （11/17 act bot：「斬り合う相手が少なくて退屈」17分で8人。柵の裏へ寄せても門の持ち場から届かなかった）
        const at = Math.abs(dx) > 20 ? { x: Math.sign(dx) * 25, z: -46 } : { x: C.x + dx / L * 26, z: C.z + dz / L * 26 };
        o.march(g, [[at.x, at.z]], 'hold', 0); g.anchor = at;
        T.pushing = { g, home, until: rt.t + 24 };
        // 寄せる方角から鬨の声
        try { A.play('toki', { x: at.x, y: 2, z: at.z }, 0.6); } catch (e) { /* 音が無くても進む */ }
        break;
      }
    }
  }
  // 11/18 K365（囲まれ感・音）：籠城の間、囲みのどこか（本人から遠い側も）で門徒の陣太鼓が鳴る（二十五〜四十秒おき・遠い音）
  if (rt.t >= (T.drumAt || 0)) {
    T.drumAt = rt.t + 25 + Math.random() * 15;
    const a = Math.random() * Math.PI * 2, R = ROWS[2], at = { x: C.x + Math.sin(a) * R, y: 3, z: C.z + Math.cos(a) * R };
    if (!keepOut(at.x, at.z)) try { (A.playFar || A.play).call(A, 'taiko', at, 0.45); } catch (e) { /* 音が無くても進む */ }
  }
  // ② 四方の鉄砲：二〜三秒おきに、本人から三十二歩より遠い持ち場が一列を揃えて放つ
  if (rt.t < T.nextAt) return;
  T.nextAt = rt.t + 2 + Math.random() * 1.2;
  let f = null;
  for (let i = 0; i < T.fronts.length; i++) {
    const c = T.fronts[(T.k + i) % T.fronts.length], dd = Math.hypot(c.x - P.x, c.z - P.z);
    if (dd > 32 && dd < 240) { f = c; T.k = (T.k + i + 1) % T.fronts.length; break; }
  }
  if (!f) return;
  T.volleys++;
  const dist = Math.hypot(f.x - P.x, f.z - P.z), big = Math.max(1.4, Math.min(3.4, dist / 34)), pb = Math.max(0.95, Math.min(1.5, dist / 75));
  const row = f.sama.filter((_, i) => (i + T.volleys) % 2 === 0 || Math.random() < 0.3);
  const t0 = rt.t;
  // 11/18 K365（四方の鉄砲の質）：一列の放ちを端から端へ波のように（筒先の火と白煙が列に沿って走る）。どの筒も煙を吐き、列の上に煙の帯が残る
  const fromLeft = T.volleys % 2 === 0;
  row.forEach((s, i) => T.queue.push({ ...s, big, pb, puff: true, at: t0 + (fromLeft ? i : row.length - 1 - i) * 0.07 + Math.random() * 0.04 }));
  try { A.playFar ? A.playFar('volley', { x: f.x, y: 2, z: f.z }, 0.55) : A.play('volley', { x: f.x, y: 2, z: f.z }, 0.55); } catch (e) { /* 音が無くても進む */ }
  // 11/18 K365（四方の鉄砲の質）：本人がその面の柵の四十歩内なら、玉が柵の面に当たる所に小さな土埃が三つ（音より広く見せる）
  if (Math.hypot(f.hit.x - P.x, f.hit.z - P.z) < 40 && !reduceMotion()) {
    const tx = f.fz, tz = -f.fx;
    for (let k = 0; k < 3; k++) {
      const o = (Math.random() - 0.5) * 14, hx = f.hit.x + tx * o - f.fx * 0.6, hz = f.hit.z + tz * o - f.fz * 0.6;
      T.queue.push({ dust: true, x: hx, y: rt.world.heightAt(hx, hz) + 0.6 + Math.random() * 1.2, z: hz, fx: -f.fx, fz: -f.fz, at: t0 + dist / 340 + 0.1 + k * 0.12 + Math.random() * 0.2 });
    }
  }
  // 本人がその面の柵の近く（十六歩）にいれば、玉が柵に当たり、頭の上を抜ける
  if (Math.hypot(f.hit.x - P.x, f.hit.z - P.z) < 16 && !reduceMotion()) {
    const hy = rt.world.heightAt(f.hit.x, f.hit.z) + 1.6;
    T.queue.push({ snd: 'thunk', x: f.hit.x, y: hy, z: f.hit.z, vol: 0.6, at: t0 + dist / 340 + 0.15 });
    T.queue.push({ snd: 'whiz', x: P.x, y: hy + 1, z: P.z, vol: 0.5, at: t0 + dist / 340 + 0.3 });
  }
}
