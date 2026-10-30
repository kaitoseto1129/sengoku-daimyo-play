// 人の処理：馬の動き。外部向けの入口は humans.js。
import * as THREE from 'three';
import { HR, HEAD_B, TAIL_B, SEAT_B } from './humans_horse_model.js';
import { WORLD } from './humans_context.js';
import { smooth } from './humans_shared.js';
import { RAIL, _rd, ropeBetween } from './humans_horse_tack.js';
import { rotWorld, clamp01, _up } from './humans_pose.js';
import { WIND_STATE } from './world.js';
import { RIDE } from './units.js';
import { fistPoint, _rF, _rA } from './humans_arms.js';
import { handFrame, _ggw } from './humans_grip.js';


// ---- 動かす ----
const _hv = new THREE.Vector3();
const _hv2 = new THREE.Vector3();
const _hq = new THREE.Quaternion();
const _hM = new THREE.Matrix4();
const _hin = new THREE.Vector3();
const _hout = new THREE.Vector3();
const _hv3 = new THREE.Vector3();
const _hv4 = new THREE.Vector3();
const _hv5 = new THREE.Vector3();
// 動きを 1 倍で回した時に、地面を踏む蹄が後ろへ送られる速さ（m/s。録った動きの蹄を測った値）。速さ ÷ これで回すと蹄が滑らない
// 並足 〜2m/s、速歩 〜4.6、駆歩 〜7.5、その先が襲歩
const WALK_V = 0.88;
const TROT_V = 1.0;
const GALLOP_V = 3.55;
const RUN_V = 4.3;
const FORE_KNEE = ['BN_l_Forearm_040_041', 'BN_R_Forearm_045_047'];
const FORE_CANNON = ['BN_L_Hand_041_042', 'BN_R_Hand_046_048'];
const NOSE_B = ['BN_L_Nose_031_030', 'BN_R_Nose_032_031'];
// 世界の上下に骨を動かす（根の骨の弾み）
function liftWorld(bone, dy) { bone.getWorldPosition(_hv); _hv.y += dy; bone.position.copy(bone.parent.worldToLocal(_hv)); }
// 竿立ち：倒れる動き（death）の頭の所（前脚を上げて立ち上がる）を使う
const REAR_PEAK = 1.02;
const _hr = new THREE.Vector3();
const _hf = new THREE.Vector3();
const MANE_B = ['BN_Hair_00_08_08', 'BN_Hair_01_09_09', 'BN_Hair_02_010_010', 'BN_Hair_03_013_013', 'BN_Hair_04_014_00', 'BN_Hair_05_015_014', 'BN_Hair_06_033_032', 'BN_Hair_07_034_033', 'BN_Hair_08_035_034', 'BN_Hair_09_036_035', 'BN_Hair_10_037_036'];
function driveHorse(h, dt, speed) {
  const H = h.userData.horse, R = H.real;
  if (window.__apx?.noskin && R.probePoseReady) return;
  R.probePoseReady = true;
  H.speed = speed;
  const clips = HR.clips, B = R.bones, root = B.BN_Root_01_01;
  root.quaternion.copy(R.root0.q); root.position.copy(R.root0.p);
  // 向きの変わり（曲がる速さ）と、止まりかけ
  const yaw = h.rotation.y + (h.parent ? h.parent.rotation.y : 0);
  let dy = yaw - (R.yaw ?? yaw); while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
  R.yaw = yaw;
  R.turn = (R.turn || 0) + ((dt > 0 ? dy / dt : 0) - (R.turn || 0)) * Math.min(1, dt * 5);
  const decel = dt > 0 ? ((R.prev ?? speed) - speed) / dt : 0;
  R.prev = speed;
  // 速さの変わり（+ で踏み出し、- で踏ん張り）をならす
  if (dt > 0) R.acc = (R.acc || 0) + (Math.max(-12, Math.min(12, -decel)) - (R.acc || 0)) * Math.min(1, dt * 6);
  R.buckle = 0; R.paw = 0;
  // 一度きりの動き：倒れる・竿立ち・驚いて跳ねる・急に止まる
  let one = null;
  // 倒れ方：止まっている時に撃たれた馬は半ばが棹立ちになってから横へ倒れる。駆けていた馬は前の膝から崩れ、勢いでのめって倒れる
  if (H.dead) { if (R.oneK !== 'death') { R.oneK = 'death'; R.oneT = 0; R.dieV = Math.max(speed, (R.hiSpd || 0) * 0.8); R.dieRear = R.dieV < 1.5 && Math.random() < 0.5; } H.deadT += dt; }
  if (!H.dead) {
    // 泥の槍列では、棹立ちと跳ね馬の録った動きで全身を持ち上げない。
    // 指定のある戦だけ、首を引いて踏ん張る。足運び・討死・当たりはそのまま。
    const steady = WORLD?.def.steadyHorseReactions;
    if (steady && (H.rear > 0 || H.spook)) {
      R.flinch = 0.65; H.rear = 0; H.spook = 0;
    }
    if (steady && (R.oneK === 'rear' || R.oneK === 'buck1')) R.oneK = null;
    // 続けて突かれても立ち上がりを巻き戻さない。着地して体勢を戻してから次に驚く。
    R.rearCooldown = Math.max(0, (R.rearCooldown || 0) - dt);
    if (H.rear > (R.lastRear || 0) + 0.05 && !R.oneK && R.rearCooldown <= 0) { R.oneK = 'rear'; R.oneT = 0; R.rearHold = 0.12 + Math.random() * 0.18; R.rearCooldown = 3.4; }
    else if (H.spook) { H.spook = 0; if (!R.oneK) { R.oneK = 'buck1'; R.oneT = 0; } }
    else if (!R.oneK && (R.hiSpd || 0) > 4.2 && speed < 3 && decel > 3.5) { R.oneK = 'stop'; R.oneT = 0; }   // 駆けていて急に止まる：尻を沈めて滑り止まる
  }
  R.lastRear = H.rear; H.rear = Math.max(0, H.rear - dt);
  R.hiSpd = Math.max(speed, (R.hiSpd || 0) - dt * 6);
  let oneW = 0;
  if (R.oneK) {
    R.oneT += dt;
    const t = R.oneT;
    if (R.oneK === 'death') {
      one = 'death';
      if (R.dieRear) { R.t.death = Math.min(clips.death.duration - 0.02, t); oneW = Math.min(1, t / 0.2); }
      else {
        // 棹立ちの所を飛ばし、崩れ落ちる所から（駆けていたほど速く）。はじめの一瞬は前の膝が折れて、鼻先から沈む
        R.t.death = Math.min(clips.death.duration - 0.02, 1.3 + t * (1 + Math.min(0.35, R.dieV * 0.04)));
        oneW = smooth(0, 0.45, t);
        R.buckle = (t < 0.28 ? t / 0.28 : Math.max(0, 1 - (t - 0.28) / 1.0)) * Math.min(1, 0.45 + R.dieV * 0.08);
      }
    } else if (R.oneK === 'rear') {
      // 立ち上がって（0.7 秒）、宙で前脚を掻きながら少し留まり、下りる（0.65 秒）。上がり下りは初めと終わりをゆるく
      one = 'death';
      const up = 0.7, hold = R.rearHold || 0.3, down = 0.65, e = (x) => x * x * (3 - 2 * x);
      const peak = REAR_PEAK * 0.78;
      R.t.death = t < up ? peak * e(t / up) : t < up + hold ? peak : peak * (1 - e(Math.min(1, (t - up - hold) / down)));
      R.paw = smooth(up * 0.5, up, t) * (1 - smooth(up + hold, up + hold + down * 0.5, t));
      oneW = Math.min(1, t / 0.15) * (1 - smooth(up + hold + down * 0.6, up + hold + down, t));
      if (t > up + hold + down) R.oneK = null;
    } else {
      one = R.oneK;
      const ts = one === 'stop' ? 1.35 : 1.3, dur = clips[one].duration / ts;
      R.t[one] = Math.min(clips[one].duration - 0.02, t * ts);
      oneW = Math.min(1, t / 0.18) * (1 - smooth(dur - 0.35, dur, t));
      if (t > dur || (one === 'stop' && speed > 3.5)) R.oneK = null;
    }
  }
  // 足運び：立つ → 並足（四拍）→ 速歩（対角の二拍）→ 駆歩（三拍）→ 襲歩（四拍の全速）。並足と駆歩は曲がる時に左右へ傾いた動き
  const mv = smooth(0.12, 0.45, speed);
  const tro = smooth(1.4, 2.1, speed), gal = smooth(4.2, 5.0, speed), full = smooth(7.0, 8.0, speed);
  const tr = Math.max(-1, Math.min(1, R.turn / 0.9));
  const trL = Math.max(0, tr), trR = Math.max(0, -tr), trC = 1 - Math.abs(tr);
  // 立っている時は、時々前掻き（idle3）や首振り（idle2）
  R.idleT = (R.idleT || 0) + dt;
  if (mv > 0.1) R.idleT = 0;
  if (!R.fidget && R.idleT > 5 && Math.random() < dt * 0.25) { R.fidget = Math.random() < 0.5 ? 'idle2' : 'idle3'; R.t[R.fidget] = 0; }
  let fid = 0;
  if (R.fidget) { const d = clips[R.fidget].duration; R.t[R.fidget] += dt; fid = Math.min(1, R.t[R.fidget] / 0.3) * (1 - smooth(d - 0.4, d, R.t[R.fidget])); if (R.t[R.fidget] >= d || mv > 0.1) { R.fidget = null; fid = 0; R.idleT = 0; } }
  const rest = 1 - oneW;
  const W = R.w;
  for (const k of RAIL) W[k] = 0;
  W.idle1 = (1 - mv) * (1 - fid) * rest;
  if (R.fidget) W[R.fidget] = (1 - mv) * fid * rest;
  const wk = mv * (1 - tro) * rest, tw = mv * tro * (1 - gal) * rest, gl = mv * gal * (1 - full) * rest, rw = mv * full * rest;
  W.walk = wk * trC; W.walkL = wk * trL; W.walkR = wk * trR;
  W.trot = tw;
  W.gallop = gl * trC; W.gallopL = gl * trL; W.gallopR = gl * trR;
  W.run = rw;
  if (one) W[one] = (W[one] || 0) + oneW;
  // 時間：どの足運びも、蹄の送りが地面の速さと同じになるように回す（左右の動きは同じ時間にそろえる）。
  // 足運びの幅の外では使われないので、止めどころはその幅に合わせて広めに
  const ts = (v, lo, hi) => Math.max(lo, Math.min(hi, speed / v));
  R.t.walk = (R.t.walk + dt * ts(WALK_V, 0.55, 2.4)) % clips.walk.duration;
  R.t.trot = (R.t.trot + dt * ts(TROT_V, 1.2, 5.2)) % clips.trot.duration;
  R.t.gallop = (R.t.gallop + dt * ts(GALLOP_V, 1.1, 2.4)) % clips.gallop.duration;
  R.t.run = (R.t.run + dt * ts(RUN_V, 1.5, 3.4)) % clips.run.duration;
  R.t.walkL = R.t.walkR = R.t.walk; R.t.gallopL = R.t.gallopR = R.t.gallop;
  R.t.idle1 = (R.t.idle1 + dt) % clips.idle1.duration;
  let sum = 0; for (const k of RAIL) sum += W[k];
  if (sum < 1e-4) { W.idle1 = 1; sum = 1; }
  for (const k of RAIL) {
    const a = R.act[k], w = W[k] / sum;
    a.enabled = w > 0.002;
    a.setEffectiveWeight(a.enabled ? w : 0);
    a.time = R.t[k];
  }
  R.mixer.update(0);
  _hr.setFromMatrixColumn(h.matrixWorld, 0).normalize();
  _hf.setFromMatrixColumn(h.matrixWorld, 2).normalize();
  if (!H.dead && R.flinch > 0) {
    R.flinch = Math.max(0, R.flinch - dt);
    const k = Math.sin(R.flinch / 0.65 * Math.PI);
    rotWorld(B.BN_Neck_00_06_06, _hr, -0.12 * k);
  }
  if (!H.dead && dt > 0) {
    // 速歩の弾み：対角の脚が踏む真ん中で沈み、宙に浮く所で上がる（一回りに二度）。乗り手も鞍ごと弾む
    if (tw > 0.01) liftWorld(root, -0.03 * Math.cos(4 * Math.PI * (R.t.trot / clips.trot.duration - 0.45)) * tw);
    // 曲がる時は、速さと曲がりの強さに応じて内へ傾く（足もとを軸に）。傾いた動きの無い速歩・襲歩は全部ここで、並足・駆歩は録った傾きに足す
    const lean = Math.max(-0.26, Math.min(0.26, Math.atan(speed * R.turn / 9.8)));
    R.lean = (R.lean || 0) + (lean - (R.lean || 0)) * Math.min(1, dt * 4);
    rotWorld(root, _hf, -R.lean * (tw + rw + 0.45 * (wk + gl)));
    // 前後：止まる時は尻を沈めて前を起こし（踏ん張り）、首を上げる。駆け出す時は前へ体を預け、首を伸ばす
    const brake = mv * clamp01(-(R.acc || 0) / 7) * rest, push = mv * clamp01((R.acc || 0) / 5) * rest;
    rotWorld(root, _hr, -0.07 * brake + 0.035 * push);
    rotWorld(B.BN_Neck_00_06_06, _hr, -0.28 * brake + 0.12 * push);
    // 曲がる方へ首を向ける
    rotWorld(B.BN_Neck_01_07_07, _up, Math.max(-0.14, Math.min(0.14, R.turn * 0.12)) * mv * rest);
  }
  // 撃たれて崩れる：前の膝が折れて、鼻先から沈む
  if (R.buckle > 0.001) {
    rotWorld(root, _hr, 0.3 * R.buckle);
    for (let i = 0; i < 2; i++) { rotWorld(B[FORE_KNEE[i]], _hr, -0.3 * R.buckle); rotWorld(B[FORE_CANNON[i]], _hr, (1.3 - i * 0.2) * R.buckle); }
  }
  // 棹立ちの宙で、前脚を交互に掻き、首を振る
  if (R.paw > 0.01) {
    const pt = R.oneT * 10;
    for (let i = 0; i < 2; i++) { rotWorld(B[FORE_KNEE[i]], _hr, Math.sin(pt + i * Math.PI) * 0.35 * R.paw); rotWorld(B[FORE_CANNON[i]], _hr, (0.5 + 0.4 * Math.sin(pt + i * Math.PI + 1)) * R.paw); }
    rotWorld(B[HEAD_B], _hr, Math.sin(R.oneT * 6.5) * 0.14 * R.paw);
  }
  // 息が上がった馬：長く駆けると息が上がり（H.blow 0..1）、止まると首を下げて、速い息で首が上下する。だんだん戻る
  H.blow = clamp01((H.blow || 0) + dt * (speed > 3.2 ? 1 / 22 : speed > 1.2 ? -1 / 60 : -1 / 35));
  if (!H.dead && H.blow > 0.05 && oneW < 0.5 && dt > 0) {
    const b = H.blow * (1 - oneW), still = 1 - gal * 0.7;
    H.brPh = (H.brPh || 0) + dt * Math.PI * 2 * (0.45 + b * 1.1);
    const heave = Math.sin(H.brPh) * 0.035 * b;
    _hr.setFromMatrixColumn(h.matrixWorld, 0).normalize();
    const down = (0.34 * b * still + heave);
    rotWorld(R.bones.BN_Neck_00_06_06, _hr, down * 0.45);
    rotWorld(R.bones.BN_Neck_01_07_07, _hr, down * 0.35);
    rotWorld(R.bones.BN_Neck_02_011_011, _hr, down * 0.2);
    // 頭は首ほど下げない（鼻先が胸に付かないよう、少し起こす）
    rotWorld(R.bones[HEAD_B], _hr, -0.1 * b * still);
  }
  // 息づかい：腹が膨らんで縮み、鼻の穴が開く。駆ける時は一歩に一息、立てば息の荒さ（H.blow）で速く深く
  if (!H.dead) {
    let br;
    if (gl + rw > 0.5) br = Math.sin(Math.PI * 2 * (rw > gl ? R.t.run / clips.run.duration : R.t.gallop / clips.gallop.duration));
    else { R.brPh2 = ((R.brPh2 || 0) + dt * Math.PI * 2 * (0.22 + (H.blow || 0) * 0.9)) % (Math.PI * 2); br = Math.sin(R.brPh2); }
    if (B.BN_Stomach_050_053) B.BN_Stomach_050_053.scale.setScalar(1 + br * (0.012 + 0.03 * (H.blow || 0) + 0.015 * (gl + rw)));
    const fl = 1 + Math.max(0, br) * (0.08 + 0.45 * (H.blow || 0));
    for (const nm of NOSE_B) if (B[nm]) B[nm].scale.setScalar(fl);
  }
  // 尾と鬣：風下へなびき、突風で震える。駆けると尾は後ろへ持ち上がって流れ、鬣は細かくはためく
  if (!H.dead && dt > 0 && oneW < 0.9) {
    H.clk = (H.clk || 0) + dt;
    const t = H.clk, wg = Math.max(0.25, Math.min(1.8, WIND_STATE.gust ?? 1));
    _hr.setFromMatrixColumn(h.matrixWorld, 0).normalize();
    _hf.setFromMatrixColumn(h.matrixWorld, 2).normalize();
    const wr = WIND_STATE.dirX * _hr.x + WIND_STATE.dirZ * _hr.z, run = smooth(3, 10, speed);
    for (let k = 0; k < TAIL_B.length; k++) {
      const bn = R.bones[TAIL_B[k]]; if (!bn) continue;
      const fl = Math.sin(t * (2.1 + run * 4) + k * 0.8 + (H.seed || 0)) * (0.04 * wg + 0.05 * run);
      rotWorld(bn, _up, -(wr * 0.1 * wg * (1 - run * 0.6) + fl) * (0.6 + k * 0.2));
      if (k < 3) rotWorld(bn, _hr, run * 0.22);
    }
    for (let k = 0; k < MANE_B.length; k++) {
      const bn = R.bones[MANE_B[k]]; if (!bn) continue;
      // 駆けるほど速く大きくはためき、首の先の毛ほど風を受けて後ろへ寝る
      const fl = (Math.sin(t * (3.3 + run * 8) + k * 1.3) + 0.35 * run * Math.sin(t * 17 + k * 2.1)) * (0.05 * wg + 0.13 * run);
      rotWorld(bn, _hf, wr * 0.12 * wg + fl);
      if (run > 0.05) rotWorld(bn, _hr, run * 0.12 * (0.5 + k / MANE_B.length));
    }
  }
  // 鞍の動き：骨の立ち姿からの変わり（馬の根元の座標）を、乗り手の入れ物の行列に
  R.holder.updateMatrix();
  R.holder.matrixWorld.copy(R.holder.matrix);
  R.sc.updateMatrixWorld(true);
  H.seat.multiplyMatrices(B[SEAT_B].matrixWorld, HR.restInv[SEAT_B]);
  // 手綱を握る手の置き所：鞍の前輪の上、腰より拳ふたつほど上（胸や顔の高さまで上げない）。馬の頭が前後すると、手もそれに引かれる
  _hM.multiplyMatrices(B[HEAD_B].matrixWorld, HR.restInv[HEAD_B]);         // 頭の骨の、立ち姿からの動き
  _hv2.copy(HR.head0).applyMatrix4(_hM);                                   // 頭の今の位置
  const headRest = _hv.copy(HR.head0).applyMatrix4(H.seat);                // 鞍と一緒に動いた時の頭の位置
  H.hand = (H.hand || new THREE.Vector3()).set(-0.05, 1.28, 0.26).applyMatrix4(H.seat).addScaledVector(_hv2.sub(headRest), 0.4);
  // 銜の位置（手綱の先）
  H.bitL = (H.bitL || new THREE.Vector3()).copy(HR.bitL).applyMatrix4(_hM);
  H.bitR = (H.bitR || new THREE.Vector3()).copy(HR.bitR).applyMatrix4(_hM);
}
// 鐙・力革・手綱を置く（乗り手の骨が動いた後で。馬の根元の座標）
const _inv = new THREE.Matrix4();
const _fa = new THREE.Vector3();
const _fb = new THREE.Vector3();
const _hand = new THREE.Vector3();
function placeHorseExtras(h, u) {
  const H = h.userData.horse, R = H.real;
  if (!H.hand) return;
  h.updateWorldMatrix(true, false);
  _inv.copy(h.matrixWorld).invert();
  const hum = u && u.mounted && u.human && u.human.root.visible && u.human.root.parent === u.seat ? u.human : null;
  for (let i = 0; i < 2; i++) {
    const sd = i ? -1 : 1;       // 0 は +x（乗り手の右）
    // 鐙：乗り手の足首の下。乗り手がいなければ鞍から垂らす
    if (hum) {
      hum.bones[sd > 0 ? 'RightFoot' : 'LeftFoot'].getWorldPosition(_fa).applyMatrix4(_inv);
      // 足首から足裏へ。鞍の上方向に下ろし、舌を踵の下まで延ばす。
      _rd.set(0, -0.085, 0).transformDirection(H.seat).multiplyScalar(0.085);
      _fa.add(_rd);
    } else _fa.set(sd * 0.3, u && u.mounted ? RIDE.y + 0.04 : 0.52, 0.1).applyMatrix4(H.seat);
    const st = R.stir[i];
    st.position.copy(_fa);
    st.quaternion.setFromRotationMatrix(H.seat);
    // 力革：鞍の脇から鐙の頭へ
    _fb.set(sd * 0.19, 1.3, 0.03).applyMatrix4(H.seat);
    _hv2.set(0, 0.2, 0.05).applyQuaternion(st.quaternion).add(_fa);
    ropeBetween(R.leather[i], _fb, _hv2, 0.012);
    // 手綱：銜から乗り手の左手へ（乗り手がいなければ首の上に掛ける）
    // 乗り手の手：手首ではなく拳の中（手のひらの真ん中）へ通す
    if (hum) { fistPoint(hum.bones, hum.reinTwo && (i ? H.bitR : H.bitL).x > 0 ? 'Right' : 'Left', _hand); _hand.applyMatrix4(_inv); }
    else if (u && u.mounted) _hand.copy(H.hand);
    else {
      // 乗り手のいない馬：手綱は銜から垂れて、胸の前の地面に届く（駆ける空馬は少し後ろへ流れて引きずる）
      const bt = i ? H.bitR : H.bitL, sp = Math.min(1, (H.speed || 0) / 6);
      _hand.set(bt.x * 0.6, 0.04 + sp * 0.25, bt.z - 0.25 - sp * 0.5);
    }
    {
      const bt = i ? H.bitR : H.bitL;
      let sag = 0.02;
      if (hum || (u && u.mounted)) {
        // 手綱の長さはゆっくりしか変わらない：馬が首を伸ばすと張り、首を戻すと緩んで垂れる
        const d = bt.distanceTo(_hand), rl = R.rl || (R.rl = [0, 0]);
        rl[i] = rl[i] ? rl[i] + (d * 1.007 - rl[i]) * 0.03 : d * 1.007;
        sag = Math.min(0.09, Math.max(0.004, 0.5 * Math.sqrt(Math.max(0, rl[i] * rl[i] - d * d))));
        // 曲がる時は内の手綱が張る（0 は +x の側）
        if (hum) sag *= 1 - 0.8 * Math.max(0, Math.min(1, (i ? -1 : 1) * (hum.turn || 0) / 0.8));
      }
      // 張りの強さ（0..1）：拳が引かれる（reinPose が読む）
      if (hum) H.reinTaut = Math.max(i ? H.reinTaut || 0 : 0, clamp01((0.02 - sag) / 0.016));
      // 乗り手の拳：手綱は小指の側から拳に入り、拳の中を通って人差し指と親指の間から出る。親指で押さえ、余りは拳の前へ垂れる
      let inP = _hand, outP = null;
      if (hum && R.reinIn) {
        const sdn = hum.reinTwo && (i ? H.bitR : H.bitL).x > 0 ? 'Right' : 'Left', HB = hum.bones;
        if (HB[sdn + 'HandPinky1'] && HB[sdn + 'HandIndex1']) {
          const L = handFrame(HB, sdn, _rF, _rA, _hv3);
          // 入る所：小指の付け根の外（手のひらの側）。出る所：人差し指の付け根の上（親指の下）
          _hin.copy(_ggw).addScaledVector(_rF, L * 0.85).addScaledVector(_rA, 0.05).addScaledVector(_hv3, L * 0.25).applyMatrix4(_inv);
          _hout.copy(_ggw).addScaledVector(_rF, L * 0.8).addScaledVector(_rA, -0.045).addScaledVector(_hv3, L * 0.3).applyMatrix4(_inv);
          inP = _hin; outP = _hout;
        }
      }
      _fb.copy(bt).lerp(inP, 0.5); _fb.y -= sag;
      ropeBetween(R.rein[i], bt, _fb, 0.0065);
      ropeBetween(R.rein2[i], _fb, inP, 0.0065);
      if (R.reinIn) {
        const show = !!outP;
        R.reinIn[i].visible = R.reinTail[i * 2].visible = R.reinTail[i * 2 + 1].visible = show;
        if (show) {
          ropeBetween(R.reinIn[i], inP, outP, 0.0065);
          // 余り：拳の前から垂れて輪になる（駆けると揺れる）。張ると余りは短く引き込まれる
          const sw_ = Math.sin((H.clk || 0) * 7 + i * 2) * 0.03 * Math.min(1, (H.speed || 0) / 6);
          _hv4.copy(outP); _hv4.y -= 0.11 + 0.05 * (1 - (H.reinTaut || 0)); _hv4.z += 0.06 + sw_; _hv4.x += (i ? 0.03 : -0.03);
          _hv5.copy(_hv4); _hv5.y -= 0.07; _hv5.z -= 0.08; _hv5.x += sw_ * 0.5;
          ropeBetween(R.reinTail[i * 2], outP, _hv4, 0.006);
          ropeBetween(R.reinTail[i * 2 + 1], _hv4, _hv5, 0.006);
        }
      }
    }
  }
}

export { driveHorse, placeHorseExtras };
