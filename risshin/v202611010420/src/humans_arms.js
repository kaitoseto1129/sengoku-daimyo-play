// 人の処理：腕と武器。外部向けの入口は humans.js。
import * as THREE from 'three';
import { _tgt, _tgt2, ik2, _pole, _right, _up, _dir, _fwd, rotWorld, clamp01, aimBone } from './humans_pose.js';
import { bowHold, gripHand, fpReach, fpLift, handFrame, _ggw } from './humans_grip.js';
import { WORLD, ARMY } from './humans_context.js';
import { SRC, v3 } from './humans_shared.js';
import { WIND_STATE } from './world.js';
import { RIDE } from './units.js';


// 腕：右手は武器の握り、左手は柄の先。鉄砲の込め直し（槊杖で突き固める）、弓を引く、槍を持ち替える
const RIGHT_POLE = new THREE.Vector3();
const LEFT_POLE = new THREE.Vector3();
const spearShoulder = new THREE.Vector3();
const spearElbow = new THREE.Vector3();
const spearWrist = new THREE.Vector3();
const spearGrip = new THREE.Vector3();
const _headP = new THREE.Vector3();
function armsPose(h, B, dt, time, w) {
  const u = h.u;
  const hd = u.hand;
  const closeSpear = w === 'spear' && !u.mounted && (u.isPlayer || h.near || u.focusD <= 15);
  if (u.ramGrip) {
    // 丸太の両手の支えは世界の位置で受け、兵の向きや坂でも木から手が離れない。
    _tgt.copy(u.ramGrip.right); _tgt2.copy(u.ramGrip.left);
    ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt, _pole.copy(_right).addScaledVector(_up, -1));
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole.copy(_right).negate().addScaledVector(_up, -1));
    return;
  }
  // 弓：units.js が弓の手と右手の置き所（u.bowR）を動かす時はそれに従う。なければ、引く間は弓を顔の前へ上げる
  const own = u.bowPh !== undefined || u.gunPh !== undefined;
  if (w === 'bow' && !u.mounted && !own) bowHold(h, dt);
  hd.updateWorldMatrix(true, false);
  // 身の回りの槍は、頭越しの構えでも握りを右腕の届く所へ収める。
  // 手だけを槍へ伸ばし切らず、槍ごと寄せてから両腕を合わせる。得物の当たりは変えない。
  if ((closeSpear || WORLD?.def.reachableSpearGrip && w === 'spear' && !u.isPlayer && !u.mounted) &&
      u.alive && !u.dying && !u.downed && !h.far && (closeSpear || u.camD < 18)) {
    B.RightArm.getWorldPosition(spearShoulder);
    B.RightForeArm.getWorldPosition(spearElbow);
    B.RightHand.getWorldPosition(spearWrist);
    const reach = (spearShoulder.distanceTo(spearElbow) + spearElbow.distanceTo(spearWrist)) * 0.9;
    spearGrip.setFromMatrixPosition(hd.matrixWorld).sub(spearShoulder);
    if (reach > 0 && spearGrip.lengthSq() > reach * reach) {
      spearGrip.setLength(reach).add(spearShoulder);
      hd.parent.worldToLocal(spearGrip); hd.position.copy(spearGrip);
      hd.updateWorldMatrix(false, false);
    }
  }
  const e = hd.matrixWorld.elements;
  _tgt.set(e[12], e[13], e[14]);
  // 一人称の本人（fpg）：手のひらを柄に合わせて握らせる。馬上の握りは gripPose が武器ごと下げてある
  const fpk = u.isPlayer && SRC.fingers ? (u.fpk || 0) : 0, fpg = fpk > 0.5;
  if (u.mounted) _tgt.y -= 0.18 * (u.isPlayer && w !== 'bow' && (u.fpk || 0) > 0.01 ? 1 - u.fpk : 1);   // 馬上の人は本編の形より肩が低いので、握りも下げる
  const dir = _dir.set(e[8], e[9], e[10]).normalize();
  RIGHT_POLE.copy(_right).multiplyScalar(0.6).addScaledVector(_up, -1).addScaledVector(_fwd, -0.3);
  LEFT_POLE.copy(_right).multiplyScalar(-0.6).addScaledVector(_up, -1).addScaledVector(_fwd, -0.3);
  // 構えの癖（人ごと）：肘を脇に締める人・横へ張る人、肘を下げる人。馬上と一人称の本人は変えない
  if (!u.mounted && !u.isPlayer) {
    const S = h.hold || (h.hold = { eb: ((h.seed * 23.1) % 1 - 0.5) * 0.9, dn: ((h.seed * 17.9) % 1 - 0.5) * 0.5, sp: ((h.seed * 31.7) % 1 - 0.5) * 0.16 });
    RIGHT_POLE.addScaledVector(_right, S.eb).addScaledVector(_up, -S.dn); LEFT_POLE.addScaledVector(_right, -S.eb * 0.8).addScaledVector(_up, -S.dn);
  }
  if (w === 'spear' && !u.mounted && !fpg) {
    // 手は柄に合わせたまま、重みを受ける肘を下へ、突く肘を後ろへ張る。
    const load = h.atkB ? Math.max(0, h.atkB.W) : 0, thrust = h.atkB ? Math.max(0, h.atkB.L) : 0;
    RIGHT_POLE.addScaledVector(_fwd, -0.22 * load).addScaledVector(_up, 0.16 * thrust);
    LEFT_POLE.addScaledVector(_up, -0.18 * (1 - thrust));
  }
  if (w === 'bow' && own) {
    // 騎射：鞍の上で腰から左へひねり、左の肩を的へ向けて引く（馬の首を越えて射る）
    if (u.mounted) {
      const dr = u.bowPh === 'draw' || u.bowPh === 'kai' || u.bowPh === 'raise' || u.bowPh === 'nock';
      h.kisha = (h.kisha || 0) + ((dr ? 1 : 0) - (h.kisha || 0)) * Math.min(1, dt * 5);
      if (h.kisha > 0.02) { rotWorld(B.Spine, _up, 0.22 * h.kisha * (fpg ? 0.5 : 1)); rotWorld(B.Spine1, _up, 0.3 * h.kisha * (fpg ? 0.5 : 1)); rotWorld(B.Spine1, _right, 0.08 * h.kisha); }
    }
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt, _pole.copy(_right).multiplyScalar(-0.6).addScaledVector(_up, -1));
    if (u.bowR) {
      _tgt2.copy(u.bowR);
      // 一人称で弓の手を寄せた分（gripPose）だけ、弦を引く右手も寄せる（弓と弦から手が離れない）
      if (h.fpOff && (u.bowPh === 'nock' || u.bowPh === 'draw' || u.bowPh === 'kai' || u.bowPh === 'raise')) { _tgt2.x += h.fpOff.dx; _tgt2.y += h.fpOff.dy; _tgt2.z += h.fpOff.dz; }
      _tgt2.applyMatrix4(hd.parent.matrixWorld);
      const drawn = u.bowPh === 'draw' || u.bowPh === 'kai' || u.bowPh === 'raise';
      // 引く腕は肘を肩の高さで後ろへ張る
      ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt2, drawn ? _pole.copy(_right).multiplyScalar(0.8).addScaledVector(_up, 0.9).addScaledVector(_fwd, -0.9) : RIGHT_POLE);
      // 弦を引く手は指を矢の向き（弓の手の方）へ（指が上を向いて手を振るように見えない）
      if (drawn) straightWrist(B.RightForeArm, B.RightHand, B.RightHandMiddle1, _tgt);
      if (u.bowPh === 'draw' || u.bowPh === 'kai') { rotWorld(B.Neck, _up, -0.3); rotWorld(B.Head, _up, -0.25); }
    }
    return;
  }
  if (w === 'bow') {
    // 体は横を向く（左の肩を的へ）
    if ((h.bowK || 0) > 0.05) rotWorld(B.Spine1, _up, 0.35 * h.bowK);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt, _pole.copy(_right).multiplyScalar(-0.6).addScaledVector(_up, -1));
    // 右手：弦を引く（引くほど頬の横へ）。引かない時は矢を持って下ろす
    const k = h.bowK || 0;
    if (k > 0.05) {
      _tgt2.copy(_tgt).addScaledVector(_fwd, -0.12 - 0.5 * k).addScaledVector(_right, 0.06 + 0.1 * k).addScaledVector(_up, 0.03);
      ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt2, _pole.copy(_right).addScaledVector(_up, 0.4 * k).addScaledVector(_fwd, -0.6));
      // 顔は的へ
      rotWorld(B.Neck, _up, -0.3 * k); rotWorld(B.Head, _up, -0.25 * k);
    }
    return;
  }
  if (u.look?.standard && w === 'none') {
    ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt, RIGHT_POLE);
    gripHand(B, 'Right', _tgt, _up, _fwd, 0, RIGHT_POLE);
    return;
  }
  if (!w || w === 'none') return;
  // 一人称の本人は担がず、左手で柄・台木を支えたまま（手が武器から離れて見えない）
  const shouldered = !u.mounted && !fpg && (w === 'spear' ? (h.upK || 0) > 0.5 && !u.spearSupport && !(u.contactBrace > 0.1) : w === 'gun' && hd.rotation.x < -0.4);
  const reload = w === 'gun' && !u.isPlayer && u.cd > 0.6 && !u.atk && (u.moving || 0) < 0.6 && !u.mounted;
  const aimGun = w === 'gun' && (u.gunPh !== undefined ? u.gunPh === 'aim' || u.gunPh === 'fire' : u.atk && u.atk.ranged);
  // 一人称の込め直し（馬上も）：gripPose が筒を体の前へ斜めに下げてある。左手は筒を支え、右手は込め矢を握って突く
  if (fpg && w === 'gun' && (h.fpRl || 0) > 0.5 && u.wpn) {
    const gw = u.wpn, R = gw.userData.ram;
    gw.updateWorldMatrix(false, false);
    // 左手：筒の中ほど（肩から届く所）を下から支える
    fpReach(B, 'Left', _tgt2.set(0, -0.02, 0.55), _tgt3.set(0, -0.02, 0.2), gw);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole.copy(_right).multiplyScalar(-0.6).addScaledVector(_up, -0.8).addScaledVector(_fwd, -0.3));
    gripHand(B, 'Left', _tgt2, dir, _gU.set(e[0], e[1], e[2]).normalize(), 0.2, _pole);
    // 右手：突き固める間は込め矢の頭、火薬・弾は筒口の上、ほかは握り
    const ph = u.gunPh;
    if (ph === 'ram' && R) fpReach(B, 'Right', _tgt3.set(0, R.position.y, R.position.z + 0.86), _tgt2.set(0, 0.034, 1.0), gw);
    else if (ph === 'powder' || ph === 'ball') { _tgt3.set(0.02, 0.06, 1.08); gw.localToWorld(_tgt3); }
    else _tgt3.copy(_tgt);
    const rp = _pole.copy(_right).multiplyScalar(0.7).addScaledVector(_up, -0.8).addScaledVector(_fwd, -0.3);
    ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt3, rp);
    if (ph === 'ram') gripHand(B, 'Right', _tgt3, dir, _gU.set(e[0], e[1], e[2]).normalize(), 0.3, rp);
    if (h.rod) h.rod.visible = false;
    return;
  }
  // 込め直し：units.js が左手の置き所（u.lh：筒先・火皿）を出す時はそれに従う
  if (w === 'gun' && u.lh && !u.mounted) {
    if (h.rod) h.rod.visible = false;
    ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt, RIGHT_POLE);
    if (fpg) gripHand(B, 'Right', _tgt, dir, _gU.set(-e[4], -e[5], -e[6]).normalize(), 0.4, RIGHT_POLE);
    _tgt2.set(u.lh[0], u.lh[1], u.lh[2]).applyMatrix4(hd.parent.matrixWorld);
    const cover = u.gunPh === 'cover';
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole.copy(_right).multiplyScalar(cover ? -1 : -0.5).addScaledVector(_up, cover ? 0.2 : -0.4).addScaledVector(_fwd, -0.5));
    // 一人称：構えた鉄砲の台木を、左手で下から手のひらを上にして支える（手と台木の間に隙間を作らない）
    if (fpg) {
      // 左手の置き所を筒の線の上へ寄せる（units.js の置き所は筒の横にずれることがある）
      _tgt3.copy(_tgt2).sub(_tgt); _tgt3.copy(_tgt).addScaledVector(dir, Math.max(0.2, Math.min(0.45, _tgt3.dot(dir))));
      _tgt3.addScaledVector(_gU.set(e[4], e[5], e[6]).normalize(), -0.012);
      gripHand(B, 'Left', _tgt3, dir, _gU.set(e[0], e[1], e[2]).normalize(), 0.2, _pole);
    }
    rotWorld(B.Neck, _right, 0.22); rotWorld(B.Head, _right, 0.1);
    return;
  }
  if (reload && u.gunPh === undefined) { gunReload(h, B, dt, time, dir); return; }
  if (h.rod) h.rod.visible = false;
  // 右手：握り。鉄砲を構える時は肘を横へ張る
  if (aimGun) rotWorld(B.Spine1, _up, 0.12);
  const rp = aimGun ? _pole.copy(_right).addScaledVector(_up, 0.15).addScaledVector(_fwd, -0.4) : RIGHT_POLE;
  ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt, rp);
  // 一人称：柄を拳の中に通して握る（指は柄の刃の側・下へ巻く）
  if (fpg) gripHand(B, 'Right', _tgt, dir, _gU.set(-e[4], -e[5], -e[6]).normalize(), 0.4, rp);
  // 目の前の徒歩の槍も、手首の点ではなく拳の中へ柄を通す。
  // 遠い兵は元の二関節の補正だけに留める。
  const nearSpearGrip = closeSpear && !h.far;
  if (nearSpearGrip && !fpg) gripHand(B, 'Right', _tgt, dir, _gU.set(-e[4], -e[5], -e[6]).normalize(), 0.4, rp);
  if (aimGun) {
    // 頬を台に付けて狙う：首を傾け、顔を下げる
    rotWorld(B.Neck, _right, 0.22); rotWorld(B.Head, _fwd, -0.22);
  }
  // 馬上：左手は手綱（鞍の前）。馬の首の振りに合わせて前後する
  if (u.mounted) { reinPose(h, B, u, fpk, false); return; }
  // 昌恒の片手斬り（伝承）：左手は腰の外で釣り合いを取り、右手だけで刀を振るう。
  // 蔓を実際に掴む姿ではなく、移動できる戦場での復元。既存の作業ベクトルを使う。
  if (w === 'sword' && u.look?.swordHand === 'right' && !u.isPlayer) {
    if (!h.far) {
      B.LeftArm.getWorldPosition(_tgt2);
      _tgt2.addScaledVector(_right, -0.22).addScaledVector(_up, -0.38).addScaledVector(_fwd, -0.12);
      ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, LEFT_POLE);
    }
    return;
  }
  // 担いで駆ける時は、左手も柄に添えて抱える（今の世の腕振りにしない）。歩む時は左手を歩みに合わせて振る（録った動きのまま）
  if (shouldered) {
    const runK = clamp01(((h.spd || 0) - 2.6) / 1.5);
    if (w === 'spear' && runK > 0.05 && !h.far) {
      _tgt2.copy(_tgt).addScaledVector(dir, 0.3).addScaledVector(_right, -0.06);
      B.LeftHand.getWorldPosition(_tgt3); _tgt3.lerp(_tgt2, runK);
      ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt3, LEFT_POLE);
    }
    return;
  }
  // 左手：柄の先。待つ間は時々持ち替える（手を柄に沿ってずらし、握り直す）
  let k = w === 'sword' ? -0.13 : w === 'gun' ? (fpg ? 0.2 : 0.36)
    : (fpg || u.mounted ? 0.36 + (h.seed - 0.5) * 0.08 : 0.46 + (h.seed - 0.5) * 0.12), lift = 0;
  if (closeSpear) k = 0.62 + (h.seed - 0.5) * 0.08;
  // 両手の間（人ごと）：槍は手を広く取る人・詰める人。鉄砲は台木を支える所が少しずつ違う。刀は柄頭へ寄せる人・鍔元へ寄せる人
  if (h.hold && !fpg) k += w === 'spear' ? h.hold.sp : w === 'gun' ? h.hold.sp * 0.3 : w === 'sword' ? h.hold.sp * 0.15 : 0;
  // 怯えた者・疲れ切った者は、柄を持つ手が小さく震える
  if (!fpg && !u.isPlayer) { const tr = Math.max(u.group && u.group.morale < 35 ? (35 - u.group.morale) / 35 : 0, clamp01(((h.heavy || 0) - 0.6) / 0.3)); if (tr > 0.05) lift += Math.sin(time * 23 + h.seed * 9) * 0.006 * tr; }
  if (w === 'spear' && !u.atk && !u.pAtk && !u.swing && !(u.strikeT > 0)) {
    const G = h.grip || (h.grip = { k: 0, tk: 0, t: 3 + h.seed * 8, lift: 0 });
    G.t -= dt;
    if (G.t <= 0) { G.t = 5 + Math.random() * 9; G.tk = (Math.random() - 0.4) * 0.28; G.lift = 0.35; }
    G.lift = Math.max(0, G.lift - dt);
    G.k += (G.tk - G.k) * Math.min(1, dt * 3);
    k += G.k; lift += Math.sin(clamp01(G.lift / 0.35) * Math.PI) * 0.06;
  }
  if (h.far) return;   // 遠い人は左手を省く（録った動きのまま）
  // 槍をしごく：突き出す間、前の左手は柄の上を滑ってその場に残り、後ろの右手だけが前へ押し出す（両手が一緒に動く棒突きにしない）
  if (w === 'spear' && h.atkB && h.atkB.L > 0.01 && (!closeSpear || u.swing?.kind === 'thrust' || u.swing?.kind === 'charge')) k = Math.max(closeSpear ? 0.18 : 0.1, k - 0.5 * h.atkB.L);
  // 立ち気味の槍で、柄の先へ添える左手が頭より上へ行かないよう、柄の上の握り所を手元へ寄せる（両手を頭上へ上げた崩れた姿にしない）
  if (w === 'spear' && !fpg && !(u.cheer > 0) && dir.y > 0.5 && B.Head) {
    const top = B.Head.getWorldPosition(_headP).y - 0.12 - _tgt.y;
    if (dir.y * k > top) k = Math.max(0.12, top / dir.y);
  }
  _tgt2.copy(_tgt).addScaledVector(dir, k).addScaledVector(_right, -0.05).addScaledVector(_up, lift);
  const calm =!u.atk && !u.target && !(u.strikeT > 0) && (u.moving || 0) < 0.3 && !aimGun && !u.isPlayer;
  // 火縄を袖で庇う：待つ鉄砲足軽は、時々左の袖で火皿と火縄を覆う（風が強いほど、雨の時ほど多く）
  if (w === 'gun') {
    const C = h.cover || (h.cover = { t: 2 + h.seed * 8, on: 0, k: 0 });
    C.t -= dt;
    if (C.t <= 0) { C.on = C.on || !calm ? 0 : 1; const wg = Math.max(0.6, (WIND_STATE.gust ?? 1) + (WORLD && WORLD.rainLevel ? WORLD.rainLevel * 2 : 0)); C.t = C.on ? 2.5 + Math.random() * 3.5 : (7 + Math.random() * 12) / wg; }
    if (!calm) C.on = 0;
    C.k += (C.on - C.k) * Math.min(1, dt * 3);
    if (C.k > 0.02) {
      // 火皿（握りの少し前、右の脇）の上へ左手をかざす。肘を張って袖を垂らし、顔も手元へ
      _tgt3.copy(_tgt).addScaledVector(dir, 0.13).addScaledVector(_right, 0.02).addScaledVector(_up, 0.08).addScaledVector(_fwd, 0.03);
      _tgt2.lerp(_tgt3, C.k);
      _pole.copy(LEFT_POLE).lerp(v3.copy(_right).multiplyScalar(-1).addScaledVector(_up, 0.2).addScaledVector(_fwd, -0.3), C.k);
      ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole);
      rotWorld(B.Neck, _right, 0.2 * C.k); rotWorld(B.Head, _up, -0.15 * C.k);
      return;
    }
  }
  // 息が尽きた者：待つ間は前へかがみ、左手を膝について肩で息をする
  const tired = calm ? clamp01(((h.heavy || 0) - 0.6) / 0.25) : 0;
  h.tiredK = (h.tiredK || 0) + (tired - (h.tiredK || 0)) * Math.min(1, dt * 2);
  if (h.tiredK > 0.02 && w !== 'gun') {
    const tk = h.tiredK;
    // 背の丸め（vitals の slump）は腕より先に掛かっている。ここでは首だけ（胸を回すと右手が武器から離れる）
    rotWorld(B.Neck, _right, -0.15 * tk);
    B.LeftLeg.getWorldPosition(_tgt3); _tgt3.addScaledVector(_fwd, 0.07).addScaledVector(_up, 0.06).addScaledVector(_right, 0.02);
    _tgt2.lerp(_tgt3, tk);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole.copy(LEFT_POLE).addScaledVector(_fwd, -0.6 * tk));
    return;
  }
  // 柵を揺する：味方の柵のすぐ前で待つ者は、時々左手で横木をつかみ、押し引きして結わえを確かめる
  if (calm && h.near && ARMY && ARMY.structs.length) {
    const F = h.fence || (h.fence = { t: 3 + h.seed * 10, on: 0, k: 0, p: new THREE.Vector3() });
    F.t -= dt;
    if (F.t <= 0) {
      F.t = F.on ? 6 + Math.random() * 14 : 1.6 + Math.random() * 1.6;
      F.on = F.on ? 0 : fenceNear(u, F.p) ? 1 : 0;
    }
    F.k += (F.on - F.k) * Math.min(1, dt * 4);
    if (F.k > 0.02) {
      const sh = Math.sin(time * 9 + h.seed * 5) * 0.035;
      _tgt3.copy(F.p).addScaledVector(_fwd, sh);
      _tgt2.lerp(_tgt3, F.k);
      ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, LEFT_POLE);
      rotWorld(B.Neck, _right, 0.1 * F.k);
      return;
    }
  }
  ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, LEFT_POLE);
  if (nearSpearGrip && !fpg) {
    _tgt3.copy(_tgt).addScaledVector(dir, k);
    gripHand(B, 'Left', _tgt3, dir, _gU.set(-e[4], -e[5], -e[6]).normalize(), 0.4, LEFT_POLE);
  }
  // 一人称：左手も柄を拳の中に通して握る（刀は柄頭の側、槍・鉄砲は前の方）
  if (fpg) {
    // 槍は前の手の中を柄が滑る：左手は胸の前の同じ所に置いたまま、突けば柄だけが前へ出る
    if (w === 'spear') {
      B.LeftArm.getWorldPosition(_tgt3).addScaledVector(_fwd, 0.48).addScaledVector(_up, -0.3).addScaledVector(_right, 0.06);
      k = Math.max(0.18, Math.min(0.9, _tgt3.sub(_tgt).dot(dir)));
      ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt3.copy(_tgt).addScaledVector(dir, k), LEFT_POLE);
    }
    _tgt3.copy(_tgt).addScaledVector(dir, k).addScaledVector(_up, lift);
    // 鉄砲の左手は台木の下から手のひらを上に向けて支え、指を右の側へ回す
    if (w === 'gun') gripHand(B, 'Left', _tgt3.addScaledVector(_gU.set(e[4], e[5], e[6]).normalize(), -0.012), dir, _gU.set(e[0], e[1], e[2]).normalize(), 0.2, LEFT_POLE);
    else gripHand(B, 'Left', _tgt3, dir, _gU.set(-e[4], -e[5], -e[6]).normalize(), 0.4, LEFT_POLE);
  }
}
const _gU = new THREE.Vector3();
const _gB = new THREE.Vector3();
// 馬上の手綱の拳：拳を立てて（親指が上、指の付け根は馬の首の前へ）、手綱を小指の下から拳の中へ通す。
// two：右手も空いている時（刀を納めた・武器なし）は両手で左右の手綱を一本ずつ持つ
const _rF = new THREE.Vector3();
const _rA = new THREE.Vector3();
const _rP = new THREE.Vector3();
const _rPole = new THREE.Vector3();
function reinPose(h, B, u, fpk, two) {
  // 手綱の置き所は馬が出す（鞍と一緒に揺れ、首の前後に引かれる）。なければ今の形の馬の首の振りから
  const Hh = u.horse && u.horse.userData.horse;
  if (Hh && Hh.hand) _tgt3.copy(Hh.hand);
  else _tgt3.set(-0.08, 1.02 + RIDE.y, 0.42 + (Hh ? Hh.neck.rotation.x * 0.25 : 0));
  // 駆ける時は、拳が馬の首の振りに合わせて小さく上下する
  const run = clamp01((((Hh && Hh.speed) || 0) - 4) / 6);
  if (run > 0) _tgt3.y += Math.sin((h.clock || 0) * 11 + h.seed * 6) * 0.018 * run;
  // 曲がる時は、拳を曲がる側へ寄せて少し引く（内の手綱を引き、外の手綱を首に当てる）
  const tr = Math.max(-1.2, Math.min(1.2, h.turn || 0));
  _tgt3.x += tr * 0.05; _tgt3.z -= Math.abs(tr) * 0.035;
  // 手綱が張ると拳が前へ引かれ、腕が伸びる（馬が首を伸ばす・下げる時）。緩めば戻る
  if (Hh && Hh.reinTaut) { _tgt3.z += 0.045 * Hh.reinTaut; _tgt3.y -= 0.015 * Hh.reinTaut; }
  // 左の拳は体の左寄り（馬の首が振れても、体の真ん中を越えて右へ出さない。-x が乗り手の左）
  _tgt3.x = Math.max(-0.22, Math.min(-0.03, _tgt3.x));
  // 一人称：拳は画面の下の左寄り（前を塞がない）。持ち上げは少しだけ、左へ寄せる
  if (fpk > 0.01) { const L = fpLift(_tgt3.y, _tgt3.z, 1.62 + RIDE.y - 0.18, fpk, 0.13, 0.12); _tgt3.y += L[0]; _tgt3.z += L[1]; _tgt3.x -= 0.1 * fpk; }
  // 両手：左右の拳を拳ひとつ半ほど離す
  if (two) _tgt3.x -= 0.05;
  _rP.copy(_tgt3);
  _tgt2.copy(_tgt3).applyMatrix4(u.mesh.matrixWorld);
  const rpL = _pole.copy(_right).multiplyScalar(-0.7).addScaledVector(_up, -1);
  ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, rpL);
  h.reinTwo = two;
  if (h.far || !B.LeftHandPinky1) return;
  // 拳の向き：人差し指の側（手綱の抜ける側）は上へ、少し乗り手の側へ倒す。指の付け根は前（馬の首）へ、少し内へ
  _rA.copy(_up).addScaledVector(_fwd, -0.35).normalize();
  _rF.copy(_fwd).addScaledVector(_right, 0.3).addScaledVector(_up, -0.15).normalize();
  gripHand(B, 'Left', _tgt2, _rA, _rF, 0.25, rpL);
  if (two && B.RightHandPinky1) {
    _tgt2.copy(_rP); _tgt2.x += 0.11; _tgt2.applyMatrix4(u.mesh.matrixWorld);
    _rPole.copy(_right).multiplyScalar(0.7).addScaledVector(_up, -1);
    ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt2, _rPole);
    _rF.copy(_fwd).addScaledVector(_right, -0.3).addScaledVector(_up, -0.15).normalize();
    gripHand(B, 'Right', _tgt2, _rA, _rF, 0.25, _rPole);
  }
}
// 手綱の通る所：拳の中（手のひらの真ん中から、指の巻く側へ手綱の太さ）。gripHand が柄の点を置く所と同じ
function fistPoint(B, sd, out) {
  if (!B[sd + 'HandPinky1'] || !B[sd + 'HandMiddle3']) { B[sd + 'Hand'].getWorldPosition(out); return out; }
  const L = handFrame(B, sd, _rF, _rA, out);
  return out.multiplyScalar(L * 0.3).add(_ggw).addScaledVector(_rF, L * 0.8);
}
// 前にある味方の柵（0.5〜1.1m）の、胸の高さの横木の点を p に。無ければ false
const _tgt3 = new THREE.Vector3();
function fenceNear(u, p) {
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  for (const s of ARMY.structs) {
    if (!s.seg || !s.alive || (s.team !== undefined && s.team !== u.team)) continue;
    const [ax, az, bx, bz] = s.seg, vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
    if (L2 < 1e-4) continue;
    const q = Math.max(0, Math.min(1, ((u.pos.x - ax) * vx + (u.pos.z - az) * vz) / L2));
    const cx = ax + vx * q, cz = az + vz * q, dx = cx - u.pos.x, dz = cz - u.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.45 || d > 1.1 || (dx * fx + dz * fz) / d < 0.6) continue;
    // 手は体の少し左（左手）で横木をつかむ
    const lx = -fz, lz = fx;
    p.set(cx + lx * 0.12, (WORLD ? WORLD.heightAt(cx, cz) : u.pos.y) + 1.12, cz + lz * 0.12);
    return true;
  }
  return false;
}

// 鉄砲の込め直し：筒を立て、左手で筒を支え、右手で火薬と玉を入れ、槊杖で突き固め、火皿に口薬を盛る
let ROD_GEO = null;
let ROD_MAT = null;
function gunReload(h, B, dt, time, dir) {
  const u = h.u;
  const cdB = Math.max(1.2, u.cdBase || 7);
  const p = clamp01((u.cd - 0.6) / (cdB - 0.6));   // 1 → 0
  // 左手：筒の中ほど
  _tgt2.copy(_tgt).addScaledVector(dir, 0.3).addScaledVector(_right, -0.04);
  ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, LEFT_POLE);
  // 槊杖（筒の先から出し入れする細い棒）
  if (!h.rod) {
    if (!ROD_GEO) { ROD_GEO = new THREE.CylinderGeometry(0.0055, 0.0055, 0.95, 4); ROD_GEO.rotateX(Math.PI / 2); ROD_GEO.translate(0, 0, 0.475); ROD_MAT = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.8 }); }
    h.rod = new THREE.Mesh(ROD_GEO, ROD_MAT); h.rod.castShadow = false;
    u.hand.add(h.rod);
  }
  const ph = (h.seed * 3 + time * 2.6) % 1;
  let reach;   // 右手の置き所：筒の軸に沿った長さ（握りから）
  if (p > 0.72) {
    // 火薬と玉を筒口へ（筒口の上で手を傾ける）
    h.rod.visible = false;
    reach = 1.0 + Math.sin(time * 5 + h.seed * 7) * 0.02;
    _tgt2.copy(_tgt).addScaledVector(dir, reach).addScaledVector(_fwd, 0.06).addScaledVector(_right, 0.02);
  } else if (p > 0.28) {
    // 槊杖で突き固める（上下に三度ほど）
    const stroke = Math.abs(Math.sin(ph * Math.PI)) ;
    const depth = 0.25 + stroke * 0.3;
    h.rod.visible = true;
    h.rod.position.set(0, 0.026, 0.98 - depth);
    reach = 1.2 - depth * 0.4;   // 槊杖を筒口の少し上で握って押し込む（手が笠より上へ行かない）
    _tgt2.copy(_tgt).addScaledVector(dir, reach).addScaledVector(_fwd, 0.015);
  } else {
    // 火皿に口薬を盛り、火蓋を閉じる
    h.rod.visible = false;
    reach = 0.05;
    _tgt2.copy(_tgt).addScaledVector(dir, 0.08).addScaledVector(_right, 0.07).addScaledVector(_fwd, 0.05);
  }
  ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt2, _pole.copy(_right).addScaledVector(_up, -0.3).addScaledVector(_fwd, -0.3));
  // 手元を見る
  rotWorld(B.Neck, _right, 0.25); rotWorld(B.Head, _right, 0.12);
}

// 手首をまっすぐに：手の向きを前腕の向きにそろえる
const _sw0 = new THREE.Vector3();
const _sw1 = new THREE.Vector3();
const _sw2 = new THREE.Vector3();
// toward：指をその点の方へ向ける
function straightWrist(fore, hand, mid, toward = null) {
  if (!mid) return;
  fore.getWorldPosition(_sw0); hand.getWorldPosition(_sw1); mid.getWorldPosition(_sw2);
  const L = _sw2.distanceTo(_sw1);
  if (toward) v3.copy(toward).sub(_sw1); else v3.copy(_sw1).sub(_sw0);
  aimBone(hand, _sw2, v3.setLength(L).add(_sw1));
}
// 骨の入った人の武器の握り（u.hand）を、人の体に合う所へ置き直す（units.js が毎コマ決めた構えの上から）
// ・長柄（槍・薙刀）：構えは右手を右の腰の後ろ、左手を前に（肘を曲げて腰〜胸の高さ）。待つ・歩く時は槍を立てて石突を地面の近くへ
// ・鉄砲の込め直し：台尻を地面に着けて筒を立てる（筒先が胸の高さ。手が笠より上へ行かない）
// 武器は見た目だけ（当たりの計算は units.js の数で行う）なので、人の時だけ置き直してよい
const GUN_BUTT = 0.37;
const _fpA = new THREE.Vector3();
const _fpB = new THREE.Vector3();
const _fpC = new THREE.Vector3();
const _fpD = new THREE.Vector3();
const _fpE = new THREE.Vector3();

export { armsPose, _rF, _rA, reinPose, fistPoint, ROD_GEO, ROD_MAT, straightWrist, GUN_BUTT, _fpA, _fpB, _fpC, _fpD, _fpE };
