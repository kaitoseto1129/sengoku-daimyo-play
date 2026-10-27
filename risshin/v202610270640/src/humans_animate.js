// 人の処理：人の動作。外部向けの入口は humans.js。
import * as THREE from 'three';
import { ARMY, WORLD } from './humans_context.js';
import { clamp01, _right, _fwd, rotWorld, _up, ease, _tgt, _tgt2, aimBone, _pole, spreadTwist, _T, _P } from './humans_pose.js';
import { HUM, SRC, _fq, isNamed, v0, curlFingers } from './humans_shared.js';
import { reduceMotion } from './settings.js';
import { RIDE } from './units.js';
import { vitals, lowerBody, gaitWeight, idleLife, deathBody, hitReact, plantFeet, footPlant, lookAround, faceExpr, cmdPose, cmdOff, groundLimbs } from './humans_motion.js';
import { rideHuman, attackBody, guardBody, GOU_TECH, TECH_OF, startTech, TECH, techBody, sway } from './humans_combat.js';
import { armsPose, reinPose, straightWrist } from './humans_arms.js';
import { syncBones } from './humans_bones.js';


// ---------------- 動かす ----------------
// 骨を世界の軸のまわりに回す（動きの後から足す）
const _pq = new THREE.Quaternion();
const _ax = new THREE.Vector3();
// 骨の世界の行列を親から辿って直す時（getWorldPosition・applyWorldRot）、動かしている人の根元（h.root）より上は辿らない。
//   根元より上（兵の根元・鞍・馬・場面）は人を動かす間に変わらないので、動かし始めに一度だけ直す。毎回辿ると骨一本ごとに五〜六段ぶん余計に掛け算していた。
//   動かしている間（CUR が正）だけ効き、ほかの時は three の元のまま（根元まで全部辿る）
let PASS = 0;
let CUR = -1;
const _chain = [];
{
  const BP = THREE.Bone.prototype, base = THREE.Object3D.prototype.updateWorldMatrix;
  BP.updateWorldMatrix = function (updateParents, updateChildren) {
    if (CUR < 0 || !updateParents || updateChildren) return base.call(this, updateParents, updateChildren);
    let n = this, k = 0;
    while (n && n._fresh !== CUR) { _chain[k++] = n; n = n.parent; }
    if (!n) return base.call(this, updateParents, updateChildren);   // 動かしている人の骨でなければ元のまま
    for (let i = k - 1; i >= 0; i--) {
      const c = _chain[i];
      if (c.matrixAutoUpdate) c.updateMatrix();
      if (c.matrixWorldAutoUpdate === true) { if (c.parent === null) c.matrixWorld.copy(c.matrix); else c.matrixWorld.multiplyMatrices(c.parent.matrixWorld, c.matrix); }
      _chain[i] = null;
    }
  };
}
function driveHuman(h, dt, fine = true, arms = true) {
  if (window.__apx?.noskin && h.poseReady) return;
  h.skelDirty = true;
  h.root.updateWorldMatrix(true, false);
  h.root._fresh = CUR = ++PASS;
  try { driveHuman0(h, dt, fine, arms); } finally { CUR = -1; }
}
function driveHuman0(h, dt, fine = true, arms = true) {
  const u = h.u, fallen = !u.alive || !!u.dying;
  if (h.settledOffset) {
    h.model.position.x -= h.settledX;
    h.model.position.y -= h.settledY;
    h.model.position.z -= h.settledZ;
    h.settledOffset = false;
  }
  if (!fallen && u.contactFrozen && h.drove && !fine) return;
  const B = h.bones;
  const time = (h.clock = (h.clock || 0) + dt);
  // 速さ（位置の動きから）
  const dx = u.pos.x - h.last.x, dz = u.pos.z - h.last.z;
  h.last.copy(u.pos);
  const inst = u.forceSpd ?? (dt > 0 ? Math.min(12, Math.hypot(dx, dz) / dt) : 0);
  const prev = h.spd;
  if (fallen && h.deathSpeed === undefined) h.deathSpeed = prev;
  h.spd += (inst - h.spd) * Math.min(1, dt * 6);
  // 曲がる速さと、止まりかけ（馬上の体の傾きに使う）
  const hd0 = h.lastH ?? u.heading; h.lastH = u.heading;
  let dh = u.heading - hd0; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
  h.turn = (h.turn || 0) + ((dt > 0 ? dh / dt : 0) - (h.turn || 0)) * Math.min(1, dt * 4);
  h.decel = (h.decel || 0) + (Math.max(0, dt > 0 ? (prev - h.spd) / dt : 0) * 0.3 - (h.decel || 0)) * Math.min(1, dt * 3);
  // 押されて滑る間は、地面の移動を歩きの速さに数えない。
  const sp = u.mounted || fallen ? 0 : u.slipT > 0 ? Math.hypot(u.mv.x, u.mv.z) : h.spd;
  // 接敵した徒歩は大股の走りから、構えを保った短い足運びへ移る。
  // 今ある相手だけを見る。兵の位置・速さ・攻撃の時計には触れない。
  const gaitWeapon = u.wpnKind || u.lookWeapon;
  const gaitFoe = u.atk?.target || u.swing?.target || u.target || u.poseTarget;
  let closeGait = 0;
  if (!h.far && !fallen && !u.isPlayer && !u.mounted && !u.fleeing && !u.downed && !u.climb
    && !u.dodging && !u.hit && !(u.stagger > 0) && !(u.pinT > (ARMY?.time ?? 0))
    && (gaitWeapon === 'spear' || gaitWeapon === 'sword') && gaitFoe?.alive && gaitFoe.pos && !gaitFoe.isStruct
    && gaitFoe.team !== u.team && Math.abs(gaitFoe.pos.y - u.pos.y) < 1.2) {
    const reach = gaitWeapon === 'spear' ? 5.2 : 3;
    closeGait = clamp01((reach - Math.hypot(gaitFoe.pos.x - u.pos.x, gaitFoe.pos.z - u.pos.z)) / 1.8)
      * (1 - clamp01((sp - 4.2) / 1.8));
  }
  // 後列は敵を直接狙っていなくても、前列から伝わる押し合いに合わせて足を刻む。
  // 脚だけが大股で走り続ける姿を避け、既存の接触量を使う。
  if (!fallen && !u.isPlayer && !u.mounted && !u.fleeing && !u.downed && !u.climb
    && !u.dodging && !u.hit && !(u.stagger > 0) && sp < 3.2) {
    closeGait = Math.max(closeGait, (u.contactBrace || 0) * (1 - clamp01((sp - 1.6) / 1.6)));
  }
  h.closeGait = (h.closeGait || 0) + (closeGait - (h.closeGait || 0)) * Math.min(1, dt * 7);
  const combatGait = !fallen && !u.mounted && !u.isPlayer && !h.far ? h.closeGait : 0;
  // 敵へ胸を向けた横移動は、前へ歩く見本のまま滑らせず、短い送り足へ。
  // 実際の移動を読むだけ。遠い兵・騎馬・回避・被弾には重ねない。
  const travel = Math.hypot(dx, dz);
  const sideWant = combatGait > 0 && closeGait > 0 && sp > 0.25 && travel > 1e-4 && HUM.fx && !reduceMotion()
    ? (dx * Math.cos(u.heading) - dz * Math.sin(u.heading)) / travel * combatGait : 0;
  h.gaitSide = (h.gaitSide || 0) + (sideWant - (h.gaitSide || 0)) * Math.min(1, dt * 8);
  const sideGait = combatGait > 0 && closeGait > 0 && HUM.fx && !reduceMotion() ? Math.abs(h.gaitSide) : 0;
  const shortStride = (1 - 0.18 * combatGait) * (1 - 0.65 * sideGait);
  const wRun = Math.max(0, Math.min(1, (sp - 2.6) / 1.6)) * (1 - combatGait);
  const wWalk = Math.max(0, Math.min(1, sp / 1.1)) * (1 - wRun);
  const wIdle = Math.max(0, 1 - wWalk - wRun);
  const A = h.act;
  A.idle.setEffectiveWeight(wIdle); A.walk.setEffectiveWeight(wWalk); A.run.setEffectiveWeight(wRun);
  // 録った動きが地面を送る速さ（SRC.vWalk・vRun）に合わせる（足が滑らない）
  // 歩幅は人ごとに少し違う（背丈・癖）：歩幅の広い人は拍子がゆっくり、狭い人は速い（同じ速さで歩く隊でも、足の運びがそろい過ぎない）
  const strideK = h.strideK || (h.strideK = 0.9 + ((h.seed * 17.3) % 1) * 0.2);
  // 後ずさり：向きと逆へ動く時は、歩みの録った動きを逆に回す（前へ歩く足で後ろへ滑らない）
  const back = sp > 0.25 && Math.hypot(dx, dz) > 1e-4 ? (dx * Math.sin(u.heading) + dz * Math.cos(u.heading)) / Math.hypot(dx, dz) : 1;
  h.backK = (h.backK ?? 1) + ((back < -0.35 ? -1 : 1) - (h.backK ?? 1)) * Math.min(1, dt * 8);
  A.walk.timeScale = Math.min(sideGait > 0.05 ? 2.2 : Infinity, Math.max(0.5, sp / (SRC.vWalk * strideK * shortStride))) * (h.backK < 0 ? -0.8 : 1); A.run.timeScale = Math.max(0.7, Math.min(1.35, sp / (SRC.vRun * strideK)));   // 駆け足は録った動きが小走りなので、拍子を速めすぎない（足の回りが漫画のように速くならないよう）
  // 同じ接地の拍子で歩きから走りへつなぐ。足を置く間は少しゆっくり、運ぶ間は速く。
  // 録った骨の動きは保ち、時計だけをずらす。遠い兵の更新回数は増やさない。
  if (!fallen && !u.mounted) {
    const wd = A.walk.getClip().duration, rd = A.run.getClip().duration;
    const moving = wWalk + wRun;
    const rate = moving > 0.01 ? (wWalk * A.walk.timeScale / wd + wRun * A.run.timeScale / rd) / moving : 0;
    h.gaitPhase = ((h.gaitPhase + dt * rate) % 1 + 1) % 1;
    const phase = h.gaitPhase - Math.sin(h.gaitPhase * Math.PI * 4) * (0.012 * wWalk + 0.005 * wRun);
    // mixer がこの後 dt だけ進む分を引き、二つの足が同じ位置に着くようにする。
    A.walk.time = ((phase * wd - dt * A.walk.timeScale) % wd + wd) % wd;
    A.run.time = ((phase * rd - dt * A.run.timeScale) % rd + rd) % rd;
  }
  // 同じ値の録画は骨を書き直さない。馬上の待機や徒歩の静止中も、前のコマの
  // 構え・手綱・接地の補正を先に外す。補正済みの骨を次の基準にすると震えが積み重なる。
  if (h.poseReady) for (let i = 0; i < h.animB.length; i++) {
    h.animB[i].quaternion.copy(h.pose[i]);
  }
  if (!fallen || !h.poseReady) {
    h.mixer.update(!fallen ? dt : 0);
    const bs = h.animB, P = h.pose;
    for (let i = 0; i < bs.length; i++) P[i].copy(bs[i].quaternion);
    h.poseReady = true;
  }
  // 基準を戻した骨と録画が動かした骨を、まとめて一度だけ行列へ写す。
  for (const b of h.animB) b.updateMatrix();
  // 速く駆ける時は、録った小走りの拍子を速めすぎない代わりに、腿と膝の振りを大きくして歩幅を広げる（足が地面を滑らない）
  // 人ごとの歩幅（strideK）も、腿と膝の振りの大きさで出す
  if (!fallen && !u.mounted && (wRun > 0.05 || wWalk > 0.05) && SRC.restQ) {
    const need = Math.max(0, Math.min(0.45, sp / (SRC.vRun * 1.35 * strideK) - 1)) * wRun;
    // 歩幅を縮めた分は上の時計を進め、足だけが地面を滑らないようにする。
    const amp = (1 + need) * (1 + (strideK - 1) * Math.min(1, wWalk + wRun)) * shortStride;
    if (Math.abs(amp - 1) > 0.01) for (const nm in SRC.restQ) { const b = h.bones[nm]; _fq.copy(SRC.restQ[nm]).slerp(b.quaternion, amp); b.quaternion.copy(_fq); b.updateMatrix(); }
    // 鎧を着た駆け足は腿を腰より上へ振り上げない。録画の脚だけを抑え、
    // この後の踏み込み・受け・坂の足裏補正には制限を重ねない。
    for (const nm in SRC.restQ) {
      const b = B[nm], rest = SRC.restQ[nm];
      const angle = rest.angleTo(b.quaternion);
      const limit = nm.endsWith('UpLeg') ? 0.88 - combatGait * 0.2 : 1.3 - combatGait * 0.2;
      if (angle > limit) { _fq.copy(rest).slerp(b.quaternion, limit / angle); b.quaternion.copy(_fq); b.updateMatrix(); }
    }
  }
  // 根元の向き（人は兵の根元の子）。倒れる途中は根元がコマごとに大きく回るので、先に今のコマの行列にしておく（前のコマの向きで骨を回すと、体がねじれて跳ねる）
  if (!u.mounted) u.mesh.updateWorldMatrix(false, false);
  syncBones(h);
  const m = u.mesh.matrixWorld.elements;
  _right.set(m[0], m[1], m[2]).normalize(); _fwd.set(m[8], m[9], m[10]).normalize();
  const w = u.wpnKind || u.lookWeapon;
  const engaged = !!(u.target?.alive || u.atk || u.poseTarget?.alive || u.contactBrace > 0.2) && !fallen && !u.fleeing && !u.downed && !(u.pinT > (ARMY?.time ?? 0));
  const ranged = w === 'gun' || w === 'bow';
  // 構え（腰を落とし、左足を前へ）：敵と向き合って立ち止まっている時
  const wantSt = !fallen && !u.fleeing && !u.downed && !(u.pinT > (ARMY?.time ?? 0)) && !u.dropped &&
    (engaged && sp < 1.6 && !u.mounted && !ranged || u.guarding > 0 || u.guard) ? 1 : 0;
  const gaitStance = Math.max(wantSt, combatGait * 0.65);
  h.stance = (h.stance || 0) + (gaitStance - (h.stance || 0)) * Math.min(1, dt * 4);
  const st = h.stance * (1 - wRun);
  // 胴の傾き（本編の胴と同じ：のけぞり・踏み込み・走りの前傾・ひねり）
  // 被弾は後段の骨の反応だけで受ける。簡易な胴の崩れまで重ねると、
  // 同じ当たりで胸が二重に折れ、腰と足の支えから外れてしまう。
  const br = u.body && !(u.hit && !fallen && !u.mounted) ? u.body.rotation : null;
  const lk = u.mounted ? 0.3 : 1;
  // 走りの前傾は骨の歩みが自前で持つので、軽い形の前傾（u._runLean）を引く
  const brx = (br?.x || 0) - (br ? u._runLean || 0 : 0);
  rotWorld(B.Spine, _right, brx * 0.6 * lk + st * 0.1); rotWorld(B.Spine1, _right, brx * 0.4 * lk);
  rotWorld(B.Spine1, _up, (br?.y || 0) * 0.6);
  rotWorld(B.Spine, _fwd, -(br?.z || 0));
  // 半身：長柄・刀を構える時は、左の肩を前へ出して胸を右へ開く（顔は前のまま）。人ごとに少し違う
  if (!u.mounted && !fallen && (w === 'spear' || w === 'sword')) {
    const tw = (1 - (h.upK || 0)) * (1 - wRun) * (w === 'spear' ? 0.42 + (h.seed - 0.5) * 0.2 : 0.15 + h.seed * 0.1) * Math.max(st, w === 'spear' ? 0.6 : 0);
    if (tw > 0.01) { rotWorld(B.Hips, _up, tw * 0.15 * st); rotWorld(B.Spine, _up, tw * 0.4); rotWorld(B.Spine1, _up, tw * 0.35); rotWorld(B.Spine2, _up, tw * 0.25); rotWorld(B.Neck, _up, -tw * 0.8); }
  }
  // 腰の上下（膝つき・かわし・息づかい）
  const by = u.body ? u.body.position.y - (u.mounted ? RIDE.y : 0) : 0;
  h.model.position.y = Math.min(0.05, by) * 0.8;
  h.model.position.z = 0;
  h.model.position.x = 0;
  // 馬上でも、手負いの胸と肩に息の荒さを出す。
  if (HUM.fx && !fallen) vitals(h, B, dt, time, sp, wIdle, wWalk, wRun, st);
  if (!u.mounted && !fallen) {
    lowerBody(h, B, dt, time, st, wIdle, sp, w);
    if (HUM.fx) gaitWeight(h, B, dt, wWalk, wRun, st);
    // 間合いの内では膝をゆるめて胸を前へ預ける。兵ごとに支える脚を替え、
    // 同じ立ち姿の列にしない。足の接地と得物の握りは後段で合わせる。
    // 膝・腰・胸を別々に合わせるのは、足も接地させる近景の十八人だけ。
    // 中景は既存の contactBrace による構えを使い、骨の親行列を何度も辿らない。
    if (HUM.fx && !h.far && h.groundFeet && WORLD?.def.infantryWeight && !u.isPlayer && !u.hit && !u.downed && !u.fleeing) {
      // 柵は線分、小屋は x・z を持ち、人の pos はない。踏ん張りの間合いは人だけで測る。
      const foe = u.target || u.poseTarget;
      const target = foe?.alive && !foe.isStruct && foe.pos ? foe : null;
      const dx = target ? target.pos.x - u.pos.x : 0, dz = target ? target.pos.z - u.pos.z : 0;
      const front = u._contactFront?.alive || u._lineFront?.alive || u.pressBack?.alive;
      // 直前の味方に付く後列にも踏ん張りを渡す。揺れの拍子だけを人ごとにずらす。
      // 槍先が届く距離から腰を落とす。走り込みの最中は踏ん張りを重ねない。
      const reach = w === 'spear' ? 4.8 : 2.2;
      const want = Math.max(sp < 1.8 ? u.contactBrace || 0 : 0, target?.alive && sp < 1.8 ? 1 - ease(reach * 0.3, reach, Math.hypot(dx, dz)) : 0,
        front && sp < 1.2 ? 0.45 : 0);
      h.pressWeight = (h.pressWeight || 0) + (want - (h.pressWeight || 0)) * Math.min(1, dt * 5);
      const k = h.pressWeight * (reduceMotion() ? 1 : 0.85 + 0.15 * Math.sin(time * 1.7 + h.seed * 23)), left = h.seed > 0.5;
      if (k > 0.01) {
        // 腰を支える脚と胸の向きを人ごとに変え、同じ人形を並べた列にしない。
        const weight = k * (0.8 + h.seed * 0.4), side = left ? 1 : -1;
        rotWorld(left ? B.LeftUpLeg : B.RightUpLeg, _right, -0.3 * weight);
        rotWorld(left ? B.LeftLeg : B.RightLeg, _right, 0.48 * weight);
        rotWorld(left ? B.RightLeg : B.LeftLeg, _right, 0.17 * weight);
        rotWorld(B.Hips, _fwd, side * 0.035 * weight);
        rotWorld(B.Spine, _right, 0.16 * weight); rotWorld(B.Spine1, _up, (h.seed - 0.5) * 0.32 * k);
        // 支える脚の側へ肩も沈める。左右同じ胸と肩の反復を既存の骨だけで崩す。
        rotWorld(B.Spine2, _fwd, -side * 0.065 * weight);
        // 槍の届く間合いでも、相手の突きに合わせて胸と膝を引き、重みを後ろ足へ渡す。
        const receive = reduceMotion() ? 0 : (u.contactLoad || 0) * k;
        rotWorld(B.Spine1, _right, -0.28 * receive);
        rotWorld(left ? B.RightLeg : B.LeftLeg, _right, 0.3 * receive);
        rotWorld(B.Hips, _right, -0.08 * receive);
        h.model.position.y -= 0.055 * weight;
      }
    }
    if (HUM.fx && !h.far && !engaged && wIdle > 0.2 && !u.isPlayer && !(u.idl && (u.idl.a || u.idl.sit > 0.3))) idleLife(h, B, dt, wIdle, st);
    // 向きを変える時は、体が一瞬では回らない：顔と胸が先に向き、腰と脚は遅れて付いて行く（兵の向きは units.js が一度に変える）
    h.turnLag = Math.max(-1.2, Math.min(1.2, ((h.turnLag || 0) - dh) * Math.exp(-dt * (5 + sp))));
    if (HUM.fx && Math.abs(h.turnLag) > 0.01) { rotWorld(B.Hips, _up, h.turnLag); rotWorld(B.Spine1, _up, -h.turnLag * 0.35); rotWorld(B.Neck, _up, -h.turnLag * 0.4); }
    // 坂や凸凹の地面：足の裏を、その足の下の地面に合わせる（低い方の足に合わせて腰を落とし、高い方の足は膝を曲げる）
    // 足の補正は構え・被弾・踏み込みを重ねた後に一度だけ行う。
  }
  // 乱戦の横詰め：前進用の歩みを実際の移動方向へ向け、胸と得物は敵へ残す。
  // 後ずさりは上で逆再生しているので、脚の向きもその逆へ合わせる。
  // 既に測った移動量だけを使い、敵の探索・兵の位置・攻撃の間合いは変えない。
  const sideStep = HUM.fx && !h.far && combatGait > 0.01 && !u.hit && !u.downed
    && !u.dodging && !u.climb && !u.perch && !u.naka && !u.dragging && !u.tech
    && !(u.stagger > 0) && !(u.slipT > 0) && !(u.woundRest > 0.01);
  let stepYaw = 0;
  if (sideStep && sp > 0.25 && dt > 0 && dx * dx + dz * dz > 1e-8) {
    const sn = Math.sin(u.heading), cs = Math.cos(u.heading);
    const forward = dx * sn + dz * cs, side = dx * cs - dz * sn;
    const playback = h.backK < 0 ? -1 : 1;
    stepYaw = Math.max(-1.1, Math.min(1.1, Math.atan2(side * playback, Math.abs(forward))))
      * combatGait * clamp01((sp - 0.25) / 0.65);
  }
  h.meleeStepYaw = (h.meleeStepYaw || 0) + (stepYaw - (h.meleeStepYaw || 0)) * Math.min(1, dt * 9);
  if (sideStep && Math.abs(h.meleeStepYaw) > 0.005) {
    // 腰から両脚を同じ方向へ送り、胸で逆に戻す。足裏は後段の共通の接地補正へ渡す。
    rotWorld(B.Hips, _up, h.meleeStepYaw);
    rotWorld(B.Spine, _up, -h.meleeStepYaw * 0.6);
    rotWorld(B.Spine1, _up, -h.meleeStepYaw * 0.4);
  }
  // かわし：身をかがめ、跳ぶ向きへ体を倒す（位置が滑るだけに見せない）
  h.dodgeK = (h.dodgeK || 0) + ((u.dodging && !fallen && !u.mounted ? 1 : 0) - (h.dodgeK || 0)) * Math.min(1, dt * 14);
  if (h.dodgeK > 0.02) {
    const dk = h.dodgeK, lat = dt > 0 ? (dx * _right.x + dz * _right.z) / dt : 0, lean = Math.max(-1, Math.min(1, lat / 4));
    rotWorld(B.LeftUpLeg, _right, -0.55 * dk); rotWorld(B.RightUpLeg, _right, -0.4 * dk);
    rotWorld(B.LeftLeg, _right, 0.9 * dk); rotWorld(B.RightLeg, _right, 0.75 * dk);
    rotWorld(B.Spine, _right, 0.25 * dk); rotWorld(B.Spine1, _fwd, -0.3 * lean * dk);
  }
  // 崩れて膝をつく
  // 膝をつく・立ち上がるは、一コマで形を切り替えずに滑らかに（崩れる時は速く、起き上がる時は手をつくように遅れて）
  const kwant = u.stagger > 0.7 && u.hit?.kind !== 'kneel' && u.hit?.res !== 'block' && !u.mounted && !u.isPlayer && !fallen ? 1 : 0;
  h.kneelK = (h.kneelK || 0) + (kwant - (h.kneelK || 0)) * Math.min(1, dt * (kwant ? 9 : 3.2));
  if (h.kneelK > 0.01 && !u.mounted && !u.isPlayer && !fallen) {
    // 人ごとに、つく膝の左右と深さを変える（皆が同じ形で膝をつかない）
    const L_ = h.seed > 0.5, dp = (0.8 + ((h.seed * 23.7) % 1) * 0.35) * (h.kneelK * h.kneelK * (3 - 2 * h.kneelK));
    // 起き上がる途中：上体を前へ倒して重心を膝の上へ運ぶ
    if (!kwant) rotWorld(B.Spine, _right, 0.35 * Math.sin(h.kneelK * Math.PI));
    const fU = L_ ? B.LeftUpLeg : B.RightUpLeg, fL = L_ ? B.LeftLeg : B.RightLeg;
    const bU = L_ ? B.RightUpLeg : B.LeftUpLeg, bL = L_ ? B.RightLeg : B.LeftLeg;
    rotWorld(fU, _right, -1.0 * dp); rotWorld(fL, _right, 1.6 * dp);
    rotWorld(bU, _right, 0.15 * dp); rotWorld(bL, _right, 1.4 * dp);
    h.model.position.y = Math.min(h.model.position.y, -0.3 * dp);
  }
  // 槍を受ける足は人ごとに前後を替え、同じ姿勢の列にしない。
  if (!fallen && !u.mounted && !u.isPlayer && u.contactBrace > 0.01 && h.kneelK < 0.01 && !u.hit && !u.downed) {
    const k = u.contactBrace * (0.75 + ((u.id * 0.618) % 1) * 0.5), left = u.id % 2;
    // 具足が同じでも、腰の据え方と肩の開きで一人ずつ違う輪郭を残す。
    // 見た目の骨だけを動かし、兵の体格・当たりの半径は変えない。
    const set = (0.8 + h.seed * 0.4) * k;
    const spread = (0.035 + h.seed * 0.04) * k;
    rotWorld(B.LeftUpLeg, _fwd, -spread);
    rotWorld(B.RightUpLeg, _fwd, spread);
    rotWorld(B.Spine1, _up, (h.seed - 0.5) * 0.16 * k);

    const load = !u.atk && !u.swing && !reduceMotion() ? (u.contactLoad || 0) * k : 0;
    // 押し合う後列は腰を前へ、受ける前列は後ろ足へ。既存の圧力で姿勢だけを分ける。
    const rear = !!(u.spearRear || u._contactFront?.alive && u._contactFront.team === u.team);
    const weightShift = reduceMotion() ? 0 : Math.sin(time * (1.25 + h.seed * 0.6) + h.seed * 13) * 0.018 * k;
    rotWorld(B.Hips, _right, (rear ? 0.055 : -0.025) * k);
    rotWorld(B.Spine1, _right, (rear ? 0.065 : 0.025) * k + weightShift);
    h.model.position.y -= (0.035 + h.seed * 0.035) * set;

    // 胸と腰も相手へ向け、槍を待つ前列と後ろから支える兵の重さを出す。
    rotWorld(B.Spine, _right, 0.12 * k - 0.16 * load);
    rotWorld(B.Spine2, _fwd, (left ? 1 : -1) * (0.04 * k + 0.05 * load));
    rotWorld(left ? B.LeftUpLeg : B.RightUpLeg, _right, -0.24 * k);
    rotWorld(left ? B.LeftLeg : B.RightLeg, _right, 0.4 * k);
    rotWorld(left ? B.RightUpLeg : B.LeftUpLeg, _right, 0.12 * k);
    rotWorld(left ? B.RightLeg : B.LeftLeg, _right, 0.22 * k);
    // 相手の振りに合わせ、前膝を戻し、後ろ膝で腰を支える。足の接地は後段の共通処理へ。
    if (!h.far && load > 0.001) {
      // 受ける肩を引き、腰は支える脚へ残す。胴・腰が一枚の板のように動くのを防ぐ。
      const side = left ? 1 : -1;
      rotWorld(B.Hips, _up, -side * 0.045 * load);
      rotWorld(B.Spine1, _up, side * 0.12 * load);
      rotWorld(B.Spine2, _right, -0.065 * load);
      rotWorld(left ? B.LeftUpLeg : B.RightUpLeg, _right, 0.16 * load);
      rotWorld(left ? B.RightUpLeg : B.LeftUpLeg, _right, -0.18 * load);
      rotWorld(left ? B.RightLeg : B.LeftLeg, _right, 0.24 * load);
      h.model.position.z -= 0.075 * load;
      h.model.position.y -= 0.025 * load;
      // 柄を寄せる腕だけでなく胸も打ち筋から外し、後ろ膝へ重さを逃がす。
      // 手は後段で同じ武器の握りへ合わせるので、両手と柄が離れない。
      const parry = !reduceMotion() ? (u.contactParry || 0) : 0;
      rotWorld(B.Spine1, _up, (u.contactParrySide || 0) * 0.2 * parry);
      rotWorld(B.Spine, _right, -0.12 * parry);
      rotWorld(B.Neck, _right, 0.08 * parry);
    }
    // 受け止められた突きの反動。相手の受けと同じ衝突時刻で、後ろ脚へ踏み直す。
    const stop = !h.far && !reduceMotion() && !u.dodging ? (u.contactStop || 0) : 0;
    if (stop > 0.001) {
      rotWorld(B.Spine, _right, -0.16 * stop);
      rotWorld(B.Spine1, _up, (left ? 1 : -1) * 0.10 * stop);
      rotWorld(left ? B.RightUpLeg : B.LeftUpLeg, _right, -0.18 * stop);
      rotWorld(left ? B.RightLeg : B.LeftLeg, _right, 0.28 * stop);
      h.model.position.z -= 0.07 * stop;
      h.model.position.y -= 0.035 * stop;
    }
    // 前列と後列で共用する踏み込み。近い骨のある人にも同じ腰・膝の重さを渡す。
    const push = !u.dodging && !reduceMotion() ? (u.contactPush || 0) * u.contactBrace : 0;
    if (!h.far && push > 0.001) {
      rotWorld(left ? B.LeftUpLeg : B.RightUpLeg, _right, -0.16 * push);
      rotWorld(left ? B.LeftLeg : B.RightLeg, _right, 0.2 * push);
      rotWorld(left ? B.RightUpLeg : B.LeftUpLeg, _right, 0.12 * push);
    }
    // 槍を出す拍子に前膝へ重さを移す。骨の接地補正へ渡し、兵の当たりは動かさない。
    const drive = !h.far && !reduceMotion() ? (u.contactDrive || 0) * k : 0;
    if (drive > 0.001) {
      rotWorld(left ? B.LeftUpLeg : B.RightUpLeg, _right, -0.18 * drive);
      rotWorld(left ? B.LeftLeg : B.RightLeg, _right, 0.22 * drive);
      rotWorld(left ? B.RightUpLeg : B.LeftUpLeg, _right, 0.12 * drive);
      h.model.position.y -= 0.035 * drive;
    }
  }
  if (!fallen && !u.mounted && !u.isPlayer && u.woundRest > 0.01 && h.kneelK < 0.01 && !u.hit) {
    const k = u.woundRest;
    rotWorld(B.LeftUpLeg, _right, -0.85 * k); rotWorld(B.LeftLeg, _right, 1.35 * k);
    rotWorld(B.RightUpLeg, _right, 0.12 * k); rotWorld(B.RightLeg, _right, 1.45 * k);
    h.model.position.y = Math.min(h.model.position.y, -0.3 * k);
  }
  // 倒れる途中の膝の折れ（units.js の animDeath が u.deathKneel に 0〜1 で出す）。途中で跳ばないよう、量のまま折る
  if (fallen && u.death && !u.mounted) {
    const kn = u.deathKneel || 0;
    if (kn > 0.001) {
      const right = (u.death.side || (h.seed > 0.5 ? 1 : -1)) > 0;
      rotWorld(right ? B.RightUpLeg : B.LeftUpLeg, _right, -1.0 * kn);
      rotWorld(right ? B.RightLeg : B.LeftLeg, _right, 1.6 * kn);
      rotWorld(right ? B.LeftUpLeg : B.RightUpLeg, _right, 0.15 * kn);
      rotWorld(right ? B.LeftLeg : B.RightLeg, _right, 1.4 * kn);
      h.model.position.y = Math.min(h.model.position.y, -0.3 * kn);
    }
  }
  // 討たれて倒れる：膝から崩れ、背を丸め、腕が落ちる（倒れる向きは units.js が根元を回す）
  // （units.js が倒れ方 u.death を動かす時は、膝は上の deathKneel で折り、ここでは力の抜けた腕と首だけ）
  if (fallen && !u.mounted) {
    const dT = u.death ? u.death.t : u.deadT || 0;
    const k = u.death ? 0 : ease(0, 0.5, dT), k2 = ease(0.15, 0.9, dT);
    // 倒れ切った後も、脚はまっすぐにせず少し曲げたまま（棒のように寝ない）
    if (u.death && u.death.kind !== 'unhorse' && dT > 0.5) {
      const r = ease(0.5, 1.1, dT) * (0.6 + h.seed * 0.5);
      rotWorld(B.LeftUpLeg, _right, -0.5 * r); rotWorld(B.LeftLeg, _right, 0.9 * r);
      rotWorld(B.RightUpLeg, _right, -0.15 * r * h.seed); rotWorld(B.RightLeg, _right, 0.5 * r);
    }
    const f = u.fall || 1;
    rotWorld(B.LeftUpLeg, _right, -0.75 * k); rotWorld(B.LeftLeg, _right, 1.25 * k);
    rotWorld(B.RightUpLeg, _right, -0.35 * k); rotWorld(B.RightLeg, _right, 0.9 * k);
    rotWorld(B.Spine1, _right, 0.35 * k * f); rotWorld(B.Spine2, _fwd, (h.seed - 0.5) * 0.6 * k);
    // 腕：仰向け・うつ伏せは脇へ投げ出す。横向きに寝る時は、上の腕が宙に立たないよう体の前へ落とす（units.js の軽い形と同じ形に）
    const sideLie = u.death && (u.death.kind === 'side' || u.death.kind === 'unhorse' || (u.death.kind === 'crumple' && !u.death.fwd));
    if (sideLie) { rotWorld(B.LeftArm, _right, -0.8 * k2); rotWorld(B.RightArm, _right, -0.6 * k2); }
    else { rotWorld(B.LeftArm, _fwd, -(u.iwaGrounded || u.tennojiGrounded ? 0.3 : 0.9) * k2); rotWorld(B.RightArm, _fwd, (u.iwaGrounded || u.tennojiGrounded ? 0.25 : 0.7) * k2); }
    rotWorld(B.LeftForeArm, _right, -0.6 * k2); rotWorld(B.RightForeArm, _right, -0.4 * k2);
    rotWorld(B.Neck, _right, 0.4 * k2 * f);
    if (!u.death) h.model.position.y = -0.22 * k;
  }
  // 倒れる途中の体（units.js の u.death.kind。根元の倒れは units.js が回す。ここは骨の形）
  if (fallen && u.death && !u.mounted && HUM.fx && !h.far) deathBody(h, B, u.death);
  // 這う兵と、傷ついた仲間を担いで退く者。新しい骨や材質は作らず、今の骨を動かす。
  if (fallen && u.death?.crawl > 0) {
    const D = u.death, c = D.crawl, a = Math.sin(D.aidT * 4.8 + u.id);
    rotWorld(B.LeftArm, _right, -0.55 * c); rotWorld(B.RightArm, _right, -0.55 * c);
    rotWorld(B.LeftForeArm, _right, -(0.55 + 0.2 * a) * c);
    rotWorld(B.RightForeArm, _right, -(0.55 - 0.2 * a) * c);
    rotWorld(B.RightUpLeg, _right, -0.25 * (1 - a) * c); rotWorld(B.RightLeg, _right, 0.45 * (1 - a) * c);
    rotWorld(B.Neck, _right, -0.25 * c);
  }
  // 倒れ切った後の小さな動き（army_anim の animDeath が u.death.thK に 0〜1 で出す）：片腕が地を探り、片脚を引き寄せる
  if (fallen && u.death?.thK > 0.001) {
    const c = u.death.thK, r = h.seed > 0.5;
    rotWorld(r ? B.RightArm : B.LeftArm, _right, -0.55 * c); rotWorld(r ? B.RightForeArm : B.LeftForeArm, _right, -0.5 * c);
    rotWorld(r ? B.LeftUpLeg : B.RightUpLeg, _right, -0.45 * c); rotWorld(r ? B.LeftLeg : B.RightLeg, _right, 0.75 * c);
    rotWorld(B.Neck, _right, -0.22 * c);
  }
  if (fallen && u.death?.carry > 0) {
    const c = u.death.carry;
    rotWorld(B.Spine1, _right, 0.3 * c);
    rotWorld(B.LeftUpLeg, _right, -0.4 * c); rotWorld(B.RightUpLeg, _right, -0.55 * c);
    rotWorld(B.LeftLeg, _right, 0.7 * c); rotWorld(B.RightLeg, _right, 0.9 * c);
    rotWorld(B.LeftArm, _right, -0.4 * c); rotWorld(B.RightArm, _right, -0.5 * c);
  }
  if (!fallen && u.dragging && u.dragging.death?.mercyT == null) {
    const c = u.dragging.death?.carry || 0;
    rotWorld(B.Spine, _right, 0.4 - 0.2 * c); rotWorld(B.LeftArm, _right, -0.65 - 0.6 * c); rotWorld(B.RightArm, _right, -0.65 - 0.6 * c);
    rotWorld(B.LeftForeArm, _right, -0.4); rotWorld(B.RightForeArm, _right, -0.4);
    h.model.position.y -= 0.14;
  }
  // 当たった時の体の反応（units.js の u.hit）：のけぞる・首が跳ねる・横へ折れる・よろめく
  if (u.hit && !fallen) hitReact(h, B, u.hit);
  // 押し負けた足は踏ん張ったまま滑り、腰を低くして踏み直す。
  if (!fallen && !u.mounted && !u.isPlayer && u.slipT > 0 && HUM.fx && !h.far) {
    const slip = Math.min(1, u.slipT / 0.12);
    rotWorld(B.LeftLeg, _right, 0.22 * slip); rotWorld(B.RightLeg, _right, 0.18 * slip);
    rotWorld(B.Spine, _right, 0.08 * slip); h.model.position.y -= 0.035 * slip;
  }
  // 振りの体の入り（u.swing）：振りかぶりで胸をひねり、振り抜きで戻す
  if (u.swing && !fallen && !u.mounted && w !== 'spear') {
    const q = clamp01(u.swing.t / Math.max(0.05, u.swing.dur));
    const tw = (u.swing.side || 1) * (q < 0.35 ? q / 0.35 : 1 - (q - 0.35) / 0.65) * 0.3;
    rotWorld(B.Spine1, _up, -tw); rotWorld(B.Spine, _right, 0.06 * Math.sin(q * Math.PI));
  }
  // 馬上：鞍にまたがる。腰は馬の背の弾みを受け、上体は駆ける波に合わせて揺れる
  if (u.mounted) rideHuman(h, dt);
  // 槍の突き・刀の振りに体を入れる（腰を落とし、後ろ足で押して踏み込む。馬上は鐙に立つ）
  if (!fallen && (w === 'spear' || w === 'sword')) {
    attackBody(h, B, u, w, dt);
    if (!u.mounted && !h.far) guardBody(h, B, u, dt);
  }
  // 技：時を進め、体（胸のひねり・反り・腰の沈み・足の開き）を型に合わせる。技を出すのは武将だけ（足軽・侍は出さない。軽く）
  if (!fallen && !u.mounted && (w === 'spear' || w === 'sword') && !(w === 'spear' && u.look?.spearThrust)) {
    // 豪傑（named_gear.js の gouketsu）：ほぼ毎振り技を出し、槍は頭上で大きく振り回す型を多く
    const gou = u.look?.style === 'gouketsu';
    // 突きの豪傑は頭上回しへ移らず、通常の攻撃に腰と踏み込みを入れる。
    if (!u.isPlayer && u.look?.style !== 'gouketsu_thrust' && u.swing && u.swing !== h.lastSwing && !u.tech && HUM.fx && !h.far && (u.type === 'busho' || (u.look && isNamed(u.look))) && Math.random() < (gou ? 0.85 : 0.35)) {
      const L = gou ? GOU_TECH[w] : TECH_OF[w]; startTech(u, L[Math.floor(Math.random() * L.length)]);
    }
    h.lastSwing = u.swing;
    if (u.tech) { u.tech.t += dt; if (u.tech.t >= TECH[u.tech.k].dur) u.tech = null; else techBody(h, B, u); }
  } else if (u.tech) u.tech = null;
  // 横へ詰める兵も前歩きの脚で滑らせず、運ぶ方向へ腰と草鞋を向ける。
  // 胸は逆に戻して相手と得物へ残す。既存の移動量だけを使い、位置・当たりは変えない。
  let gaitYaw = 0;
  if (HUM.fx && combatGait > 0.05 && u.camD < 36 && sp > 0.25 && !reduceMotion()
    && !u.atk && !u.swing && !u.tech && !u.hit && !u.dodging && !u.downed && !u.climb
    && !u.perch && !u.naka && !(u.slipT > 0) && !(u.stagger > 0) && !(u.woundRest > 0.01)) {
    const along = dx * _fwd.x + dz * _fwd.z, across = dx * _right.x + dz * _right.z;
    const reverse = h.backK < 0 ? -1 : 1;
    if (Math.hypot(dx, dz) > 0.0001) {
      gaitYaw = Math.max(-1.05, Math.min(1.05, Math.atan2(across * reverse, along * reverse)))
        * combatGait * ease(0.25, 0.7, sp);
    }
  }
  h.gaitYaw = (h.gaitYaw || 0) + (gaitYaw - (h.gaitYaw || 0)) * Math.min(1, dt * 9);
  if (!fallen && !u.mounted && !u.isPlayer && !h.far && HUM.fx && !reduceMotion() && Math.abs(h.gaitYaw) > 0.005) {
    rotWorld(B.Hips, _up, h.gaitYaw);
    rotWorld(B.Spine, _up, -h.gaitYaw);
  } else h.gaitYaw = 0;
  // 構え・突き・斬りの足は地を踏む：止まって戦う者の、浮いた足を地面へ下ろす（前の足を上げたまま宙に浮いて見えないよう）
  const plantCombat = !fallen && !u.mounted && !(u.woundRest > 0.01) && !(u.slipT > 0) && (w === 'spear' || w === 'sword') && HUM.fx && !h.far && WORLD && (h.spd || 0) < 0.8 && (st > 0.2 || (h.atkB && h.atkB.W + h.atkB.L > 0.02)) && !(u.isPlayer && (u.fpk || 0) > 0.5) && !u.dodging && !(u.hit && u.hit.kind === 'kneel') && !u.climb && !u.downed && !u.perch && !u.naka;
  // 共通の戦場指定も、近い十八人の足合わせの枠内で働かせる。
  const plantBattle = (u.tennojiGrounded || WORLD?.def.meleeGroundedFeet && (u.isPlayer || h.groundFeet)) && HUM.fx && !fallen && !u.mounted && !u.climb && !u.downed && !u.perch && !u.dodging && !u.naka && WORLD && !h.far && (u.atk || u.swing || engaged) && (w === 'spear' || w === 'sword');
  // 被弾の接地も既存の近景の人数枠を使う。交戦相手を失った直後も足で受ける。
  const plantHit = u.hit && u.hit.kind !== 'kneel' && !fallen && !u.isPlayer && !u.mounted
    && !u.climb && !u.downed && !u.perch && !u.dodging && !u.naka && WORLD && HUM.fx && !h.far && h.groundFeet;
  // 駆け寄る間は歩行の支持脚を使う。両足を固定して腰だけ進ませない。
  if ((plantCombat && (u.isPlayer || h.groundFeet)) || (plantBattle && (h.spd || 0) < 0.8) || plantHit) plantFeet(h, B, dt);
  else {
    h.combatFeetReady = false;
    if ((h.groundFeet || u.isPlayer) && HUM.fx && WORLD && !h.far && !fallen && !u.mounted && !u.climb && !u.downed &&
        !u.perch && !u.naka && !u.dodging && !(u.slipT > 0) && !(h.kneelK > 0.01)) footPlant(h, B, dt);
  }
  // 頭：体が傾いても顔は前を見る（首で七割ほど戻す）
  if (B.HeadTop_End && !fallen) {
    B.Head.getWorldPosition(v0); B.HeadTop_End.getWorldPosition(_tgt);
    const up = _tgt2.copy(_tgt).sub(v0); const L = up.length(); up.multiplyScalar(1 / L);
    up.lerp(_up, 0.7).normalize();
    aimBone(B.Head, _tgt, _pole.copy(v0).addScaledVector(up, L));
  }
  // 見回す：待つ間は時々よそを見、戦う時は敵へ目を向ける
  if (!fallen && !h.far) lookAround(h, B, dt, engaged, wIdle);
  if (h.expr && !h.far) faceExpr(h, u, dt, engaged);
  // 腕：武器の握りへ（本編の手の位置＝ u.hand）
  if (arms && u.hand && !fallen && (!u.dragging || u.dragging.death?.mercyT != null) && u.wpn && u.wpn.parent) { if (!cmdPose(h, B, dt, time, w, engaged)) armsPose(h, B, dt, time, w); }
  else {
    if (h.cmdHid || h.saihai) cmdOff(h);
    // 馬上で武器を持たない（納めた）：両手で手綱を持つ
    if (arms && u.mounted && !fallen) reinPose(h, B, u, u.isPlayer && SRC.fingers ? (u.fpk || 0) : 0, true);
  }
  // 手首のねじれを前腕へ半分分ける（柄を握る手を返すと、手首の皮が飴の包み紙のように細くねじれて帯に見えるので）
  if (!h.far && h.body && h.body.visible !== false) { spreadTwist(B, 'Left'); spreadTwist(B, 'Right'); }
  // 指：武器を持つ手は柄を握り、空いた手は力を抜いて軽く曲げる（開いた人形の手にしない）
  if (HUM.fx && !h.far && SRC.fingers) {
    const has = !!(u.wpn && u.wpn.parent && u.wpn.visible !== false) && w && (w !== 'none' || u.look?.standard);
    const alive = !fallen;
    const shouldered = !u.mounted && !(u.isPlayer && (u.fpk || 0) > 0.5) && (w === 'spear' ? (h.upK || 0) > 0.5 : w === 'gun' && u.hand && u.hand.rotation.x < -0.4 && !u.lh);
    // 一人称の本人は柄・手綱を強く握り込む（指先が柄・拳に沈む。緩い鉤の手に見せない）
    const tight = u.isPlayer && (u.fpk || 0) > 0.5 ? 1 : 0;
    // 受けと突きの拍子だけ柄を握り込み、戻す時は指の力をゆるめる。
    const gripLoad = alive && has && !shouldered && !reduceMotion() && (w === 'spear' || w === 'sword')
      ? Math.min(1, Math.max(u.contactLoad || 0, u.contactDrive || 0)) * 0.07 : 0;
    const gR = !alive ? 0.25 : h.saihai && h.saihai.visible ? 1 : has ? (w === 'bow' ? 0.6 : 1 + 0.1 * tight + gripLoad) : u.mounted && alive ? 1.2 : 0.52;
    const spearRun = w === 'spear' && (h.spd || 0) > 2.6;
    const gL = !alive ? 0.2 : u.look?.standard ? 0.2 : u.mounted ? 1.2 + 0.1 * tight : has && (!shouldered || spearRun) ? 1 + (w === 'bow' ? 0 : 0.1 * tight + gripLoad) : 0.52;
    // 握りが変わった時だけ曲げ直す（録った動きは指を動かさないので、曲げた形がそのまま残る）
    // 一人称の本人は毎コマ握り直す（振る・突く動きが指を開いても、柄を握った拳のまま）
    if (h.gR === undefined || Math.abs(gR - h.gR) > 0.02 || tight) { h.gR = h.gR === undefined ? gR : h.gR + (gR - h.gR) * Math.min(1, dt * 10); curlFingers(h, 'Right', h.gR); }
    if (h.gL === undefined || Math.abs(gL - h.gL) > 0.02 || tight) { h.gL = h.gL === undefined ? gL : h.gL + (gL - h.gL) * Math.min(1, dt * 10); curlFingers(h, 'Left', h.gL); }
  }
  // 甲冑の遅れた揺れ（草摺・袖）：体の上下と前後の速さの変わりから、ばねで
  // 倒れた人の手足が地面にめり込まないよう持ち上げる
  // 倒れた後の寝姿：人ごとに四通り（身を丸める・胸へ手を寄せる・片膝を折る・腰がねじれる）。頭は横へ落ち、ゆっくり形に落ち着く
  if (fallen && !u.mounted && u.death && u.death.kind !== 'unhorse') {
    const r = ease(0.9, 2.2, u.death.t || 0);
    if (r > 0.01) {
      const vk = Math.floor(((h.seed * 7.77) % 1) * 4), sd = h.seed > 0.5 ? 1 : -1;
      if (vk === 0) { rotWorld(B.LeftUpLeg, _right, -0.5 * r); rotWorld(B.RightUpLeg, _right, -0.45 * r); rotWorld(B.LeftLeg, _right, 0.7 * r); rotWorld(B.RightLeg, _right, 0.8 * r); rotWorld(B.Spine1, _right, 0.25 * r); rotWorld(B.LeftArm, _right, -0.4 * r); rotWorld(B.RightArm, _right, -0.5 * r); }
      else if (vk === 1) { rotWorld(B.LeftArm, _right, -0.45 * r); rotWorld(B.RightArm, _right, -0.65 * r); rotWorld(B.LeftForeArm, _right, -0.55 * r); rotWorld(B.RightUpLeg, _right, -0.4 * r); rotWorld(B.RightLeg, _right, 0.7 * r); }
      else if (vk === 2) { rotWorld(sd > 0 ? B.RightArm : B.LeftArm, _right, -1.1 * r); rotWorld(sd > 0 ? B.RightForeArm : B.LeftForeArm, _right, 0.3 * r); rotWorld(sd > 0 ? B.LeftUpLeg : B.RightUpLeg, _right, -0.6 * r); rotWorld(sd > 0 ? B.LeftLeg : B.RightLeg, _right, 0.9 * r); }
      else { rotWorld(B.Hips, _up, 0.35 * sd * r); rotWorld(B.Spine1, _up, -0.25 * sd * r); rotWorld(B.RightUpLeg, _right, -0.3 * r); rotWorld(B.RightLeg, _right, 0.6 * r); }
      // 首は力が抜けて横へ落ちる
      rotWorld(B.Neck, _up, 0.5 * sd * r); rotWorld(B.Head, _fwd, 0.25 * sd * r);
      // 手首と指も垂れる
      rotWorld(B.LeftHand, _right, 0.4 * r); rotWorld(B.RightHand, _right, 0.35 * r);
    }
  }
  if (fallen && u.tennojiGrounded && !u.mounted && !(u.death?.carry > 0)) {
    // 斬りの最後の肩のひねりを亡骸へ残さない。腕の付け根は元の関節の所へ戻す。
    for (const sd of ['Left', 'Right']) {
      const sh = B[sd + 'Shoulder'], ar = B[sd + 'Arm'], template = SRC.template?.bones;
      if (sh && template?.[sd + 'Shoulder']) {
        sh.position.copy(template[sd + 'Shoulder'].position);
        sh.quaternion.copy(template[sd + 'Shoulder'].quaternion);
        sh.updateMatrix();
      }
      if (ar && template?.[sd + 'Arm']) {
        ar.position.copy(template[sd + 'Arm'].position);
        ar.quaternion.slerp(template[sd + 'Arm'].quaternion, .45);
        ar.updateMatrix();
      }
    }
    h.model.updateMatrixWorld(true);
  }
  if (fallen && WORLD?.def.settledFalls && !u.mounted && u.death &&
      !u.death.floor && !u.death.aid && !(u.death.carry > 0) && u.death.t > 0.9) {
    // 手足の沈みだけを直すと、胴が宙に残る。胴・腰・頭が土へ触れる高さまで下ろす。
    h.model.updateMatrixWorld(true);
    let drop = 0.35;
    for (let i = 0; i < 3; i++) {
      const bone = i === 0 ? B.Hips : i === 1 ? B.Spine2 : B.Head;
      if (!bone) continue;
      bone.getWorldPosition(_T);
      drop = Math.min(drop, _T.y - WORLD.heightAt(_T.x, _T.z) - 0.16);
    }
    if (drop > 0.01) {
      _P.setFromMatrixPosition(h.model.matrixWorld);
      _P.y -= drop * ease(0.9, 1.5, u.death.t);
      h.model.parent.worldToLocal(_P);
      h.settledX = _P.x - h.model.position.x;
      h.settledY = _P.y - h.model.position.y;
      h.settledZ = _P.z - h.model.position.z;
      h.settledOffset = true;
      h.model.position.copy(_P);
      h.model.updateMatrixWorld(true);
    }
  }
  if (fallen && !u.mounted && !(u.death?.carry > 0)) groundLimbs(h);
  if (fallen && (u.igaGrounded || u.tennojiGrounded) && !u.mounted && !h.far) {
    // 伊賀の近景の亡骸：地面へ腕を戻した後、手首を前腕とつなぐ。
    straightWrist(B.LeftForeArm, B.LeftHand, B.LeftHandMiddle1);
    straightWrist(B.RightForeArm, B.RightHand, B.RightHandMiddle1);
    spreadTwist(B, 'Left'); spreadTwist(B, 'Right');
  }
  // 倒れて陣笠が落ちた（units.js が地面に笠を置いた）：頭の笠は隠す
  if (u.hatOff && !h.hatOff) { h.hatOff = true; if (h.xb && h.xb.swHat) h.xb.swHat.matrix.makeScale(0, 0, 0); if (h.parts.hat) h.parts.hat.visible = false; }
  // 倒れた人は草摺・袖を揺らさない（寝た体の甲冑がばねで震えないよう、元の形へ戻して止める）
  if (fallen) { if (h.sw) { h.sw.a = h.sw.va = h.sw.b = h.sw.vb = 0; } if (fine || h.sw || u.iwaFlagRig || u.tennojiFlagRig) sway(h, 0); }
  else sway(h, dt);
}

export { driveHuman };
