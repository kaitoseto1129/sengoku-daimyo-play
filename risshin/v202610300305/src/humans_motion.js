// 人の処理：足と体の動き。外部向けの入口は humans.js。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isNamed, SRC, v3, m0, v1, HUM } from './humans_shared.js';
import { _tgt2, rotWorld, _right, clamp01, _tgt, _up, _fwd, ik2, _pole, ease, _T, _P, aimBone } from './humans_pose.js';
import { GENERALS, RIDE, DEATH_END, angleDiff } from './units.js';
import { reinPose } from './humans_arms.js';
import { WORLD, ARMY } from './humans_context.js';
import { groundAt } from './floors.js';
import { cutReaction } from './army_anim.js';
import { reduceMotion } from './settings.js';
import { setFaceMorph } from './humans_face_geometry.js';
import { syncBones } from './humans_bones.js';


// ---- 名のある武将の立ち姿：戦っていない時は刀を納め、右手に采配。胸を張り、采配を上げる・前を指す・振る ----
// 戦い始めたら（敵を狙う・打ち合う・受ける）、采配を下げて刀を抜く（今の armsPose へ）
let SAIHAI = null;
function saihaiMesh() {
  if (!SAIHAI) {
    const lac = new THREE.MeshStandardMaterial({ color: 0x14110e, roughness: 0.35 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.8 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xece4d0, roughness: 0.9, side: THREE.DoubleSide });
    const hd = new THREE.CylinderGeometry(0.011, 0.013, 0.42, 6); hd.translate(0, 0.13, 0);
    const cap = new THREE.CylinderGeometry(0.016, 0.016, 0.03, 8); cap.translate(0, 0.34, 0);
    // 房：短冊を短く束ねる。正の y 軸を下へ向けるのは cmdPose の共通処理。
    const strips = [];
    for (let i = 0; i < 24; i++) {
      const L = 0.12 * (0.85 + (i % 4) * 0.05);
      const st = new THREE.PlaneGeometry(0.013, L, 1, 3); st.translate(0, L / 2, 0);
      { const p = st.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k); p.setZ(k, 0.08 * y * y / L); } }
      const a = i * 2.39996;
      st.rotateY(a); st.rotateZ(0.06 * Math.cos(a));
      st.translate(0.01 * Math.cos(a), 0, 0.01 * Math.sin(a));
      strips.push(st);
    }
    const tuftG = mergeGeometries(strips);
    SAIHAI = { lac, gold, paper, hd, cap, tuftG };
  }
  const S_ = SAIHAI;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(S_.hd, S_.lac), new THREE.Mesh(S_.cap, S_.gold));
  const tuft = new THREE.Mesh(S_.tuftG, S_.paper); tuft.position.y = 0.34;
  g.add(tuft); g.userData.tuft = tuft;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return g;
}
const _cq = new THREE.Quaternion();
const _cq2 = new THREE.Quaternion();
const _cm = new THREE.Matrix4();
const _cv = new THREE.Vector3();
const _cv2 = new THREE.Vector3();
const _ch = new THREE.Vector3();
const _cy = new THREE.Vector3(0, 1, 0);
// 采配を仕舞い、刀を戻す（人をやめる時も）
function cmdOff(h) { if (h.saihai) h.saihai.visible = false; if (h.cmdHid) { h.cmdHid = false; if (h.u.wpn) h.u.wpn.visible = true; } }
function cmdPose(h, B, dt, time, w, engaged) {
  const u = h.u;
  if (u.isPlayer || w !== 'sword' || !isNamed(h.look) || h.far) { cmdOff(h); return false; }
  // 敵が近い（7m）か、打ち合っている時だけ刀を抜く（遠くの敵を狙っているだけなら采配のまま）
  const tg = lookTarget(u, _tgt2) ? _tgt2 : null, near = !!tg && Math.hypot(tg.x - u.pos.x, tg.z - u.pos.z) < 7;
  const calm = !near && !u.atk && !u.pAtk && !u.swing && !(u.guard || u.guardFlash > 0 || u.guarding > 0) && !(u.stagger > 0.3);
  h.cmdK = (h.cmdK ?? (calm ? 1 : 0)) + ((calm ? 1 : 0) - (h.cmdK ?? 0)) * Math.min(1, dt * 4);
  const on = h.cmdK > 0.5;
  if (!on) { cmdOff(h); return false; }
  u.wpn.visible = false; h.cmdHid = true;
  if (!h.saihai) { h.saihai = saihaiMesh(); h.root.add(h.saihai); }
  h.saihai.visible = true;
  // しぐさ：構え（腰の前）・掲げる（胸の前）・指す（腕を伸ばして前か斜め前）・振る（指して上下に）
  const C = h.cmd || (h.cmd = { t: 1 + h.seed * 3, mode: 0, yaw: 0, cur: new THREE.Vector3(0.05, -0.4, 0.2) });
  C.t -= dt;
  if (C.t <= 0) {
    // 武将ごとの采配の癖（GENERALS の cmd）：bold 大きく振り下ろす・lively 指して振る事が多い・calm 構えて掲げる事が多い
    const gd = (typeof h.look.face === 'string' && GENERALS[h.look.face.slice(2)]) || {};
    const P = gd.cmd === 'bold' ? [0.28, 0.42, 0.62, 0.74] : gd.cmd === 'lively' ? [0.2, 0.32, 0.62, 0.86] : gd.cmd === 'calm' ? [0.5, 0.78, 0.92, 0.97] : [0.36, 0.56, 0.8, 0.92];
    const r = Math.random();
    C.mode = r < P[0] ? 0 : r < P[1] ? 1 : r < P[2] ? 2 : r < P[3] ? 3 : 4;
    C.yaw = (Math.random() - 0.5) * 0.9;
    C.t = C.mode === 0 ? 3 + Math.random() * 4 : C.mode === 3 ? 1.6 : C.mode === 4 ? 1.3 : 2 + Math.random() * 2;
    C.t0 = C.t;
  }
  // 胸を張る（馬上は小さく）。馬上の武将は腰を据えて背を立て、顎を引いて前を見下ろす
  const mk = u.mounted ? 0.4 : 1;
  rotWorld(B.Spine1, _right, -0.05 * mk); rotWorld(B.Spine2, _right, -0.06 * mk);
  if (u.mounted) { rotWorld(B.Spine, _right, -0.05); rotWorld(B.Neck, _right, 0.06); }
  // 右手の置き所（肩からの、体の右・上・前の量）
  let tx = 0.06, ty = -0.4, tz = 0.2;
  if (C.mode === 1) { tx = 0.0; ty = -0.14; tz = 0.34; }
  else if (C.mode === 4) {
    // 号令の振り下ろし：頭の上へ高く掲げ、溜めてから、前へ一気に振り下ろして止める
    const q = 1 - clamp01(C.t / (C.t0 || 1.3));
    tx = 0.05 + Math.sin(C.yaw) * 0.2; tz = q < 0.45 ? 0.15 : 0.5 * Math.cos(C.yaw); ty = q < 0.45 ? 0.42 : q < 0.6 ? 0.42 - (q - 0.45) / 0.15 * 0.5 : -0.08;
    if (q > 0.45 && q < 0.62) rotWorld(B.Spine1, _right, 0.08);
  } else if (C.mode >= 2) {
    tx = Math.sin(C.yaw) * 0.5 + 0.02; tz = Math.cos(C.yaw) * 0.5; ty = 0.06 + (C.mode === 3 ? Math.sin(time * 7) * 0.12 : 0);
  }
  const k = Math.min(1, dt * (C.mode === 4 ? 12 : 3));
  C.cur.x += (tx - C.cur.x) * k; C.cur.y += (ty - C.cur.y) * k; C.cur.z += (tz - C.cur.z) * k;
  B.RightArm.getWorldPosition(_ch);
  _tgt.copy(_ch).addScaledVector(_right, C.cur.x).addScaledVector(_up, C.cur.y).addScaledVector(_fwd, C.cur.z);
  ik2(B.RightArm, B.RightForeArm, B.RightHand, _tgt, _pole.copy(_right).multiplyScalar(0.7).addScaledVector(_up, -1).addScaledVector(_fwd, -0.2));
  // 指す時は、顔もそちらへ
  if (C.mode >= 2) { const a = C.yaw * clamp01(C.cur.y + 0.4); rotWorld(B.Neck, _up, a * 0.35); rotWorld(B.Head, _up, a * 0.3); }
  // 左手：馬上は手綱、徒は太刀の柄に置く
  if (u.mounted) reinPose(h, B, u, u.isPlayer && SRC.fingers ? (u.fpk || 0) : 0, false);
  else if (h.parts.koshi) {
    h.parts.koshi.updateWorldMatrix(true, false);
    _tgt2.set(-0.215, 0.975, 0.3).applyMatrix4(h.parts.koshi.matrixWorld);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, _tgt2, _pole.copy(_right).multiplyScalar(-1).addScaledVector(_up, -0.4).addScaledVector(_fwd, -0.3));
  }
  // 采配を右手に：柄は前腕の向きから少し上へ。房は下へ垂れ、振ると遅れてなびく
  B.RightForeArm.getWorldPosition(_cv); B.RightHand.getWorldPosition(_cv2);
  // 構え・掲げる時は柄を前の斜め上へ、指す・振る時は腕の向きの先へ
  const pk = clamp01((C.cur.y + 0.2) / 0.25);
  const dir = _ch.copy(_cv2).sub(_cv).normalize().multiplyScalar(pk).addScaledVector(_fwd, 0.4 * (1 - pk)).addScaledVector(_up, 0.25 + 0.75 * (1 - pk)).addScaledVector(_right, 0.1 * (1 - pk)).normalize();
  const sh = h.saihai;
  _cq.setFromUnitVectors(_cy, dir);
  h.root.updateWorldMatrix(true, false);
  _cm.compose(_cv2.addScaledVector(dir, 0.04), _cq, v3.set(1, 1, 1));
  sh.matrixAutoUpdate = false;
  sh.matrix.copy(m0.copy(h.root.matrixWorld).invert()).multiply(_cm);
  // 房：世界の下へ寄せる（柄の座標で）
  const td = v1.copy(dir).multiplyScalar(0.25).addScaledVector(_up, -1).addScaledVector(_fwd, C.mode === 3 ? Math.cos(time * 7) * 0.3 : 0).normalize();
  _cq2.copy(_cq).invert();
  td.applyQuaternion(_cq2);
  sh.userData.tuft.quaternion.setFromUnitVectors(_cy, td);
  return true;
}

// 倒れた体の接地。調べる関節の表は使い回し、毎コマ配列を作らない。
const FALL_SUPPORT = [['Hips', 0.16], ['Spine2', 0.2]];
const LIMBS = [['LeftArm', 'LeftForeArm', 0.08], ['LeftForeArm', 'LeftHand', 0.06],
  ['RightArm', 'RightForeArm', 0.08], ['RightForeArm', 'RightHand', 0.06],
  ['LeftUpLeg', 'LeftLeg', 0.08], ['LeftLeg', 'LeftFoot', 0.06],
  ['RightUpLeg', 'RightLeg', 0.08], ['RightLeg', 'RightFoot', 0.06]];
function groundLimbs(h) {
  if (!WORLD) return;
  const B = h.bones;
  // 回廊・上階では下の庭へ手足を引かない。救助中は体を下ろさない。
  const floor = h.u.corpseFloorY ?? (h.u.death?.floor ? h.u.pos.y : undefined);
  const settle = (!h.far || floor !== undefined || WORLD.def.settleFallenLimbs) && !h.u.death?.aid
    ? ease(0.9, 2.2, h.u.death?.t || 0) : 0;
  // 鳥取は軽い姿も腰と胸で支える。手足だけを下ろして胴が浮くのを防ぐ。
  // 指定のない戦は従来どおり近景だけ。止まった亡骸の姿は既存の処理で使い回す。
  // 根元の倒れと別に骨を下ろすので、兵の位置や当たり、救助の進行には触れない。
  if (settle > 0 && (!h.far || WORLD.def.settleFallenBody)) {
    let shift = -Infinity;
    for (let i = 0; i < FALL_SUPPORT.length; i++) {
      const support = FALL_SUPPORT[i];
      B[support[0]].getWorldPosition(_T);
      shift = Math.max(shift, (floor ?? groundAt(WORLD, _T.x, _T.z, h.u.pos.y)) + support[1] - _T.y);
    }
    if (Math.abs(shift) > 0.005) {
      h.model.getWorldPosition(_T); _T.y += shift * settle;
      h.model.position.copy(h.model.parent.worldToLocal(_T));
      // 手足の座標を読む時に必要な骨の枝だけ更新する。ここで全身を辿り直さない。
      h.model.updateWorldMatrix(true, false);
    }
  }
  for (let i = 0; i < LIMBS.length; i++) {
    const limb = LIMBS[i], root = B[limb[0]], end = B[limb[1]], lift = limb[2];
    for (let k = 0; k < 2; k++) {
      end.getWorldPosition(_T);
      const gy = (floor ?? groundAt(WORLD, _T.x, _T.z, h.u.pos.y)) + lift;
      if (_T.y >= gy - 0.005 && (!settle || _T.y <= gy + 0.005)) break;
      _P.copy(_T); _P.y = _T.y > gy ? _T.y + (gy - _T.y) * settle : gy;
      aimBone(root, _T, _P);
    }
  }
}
// 当たった時の反応：envelope は当たってすぐ強く、ゆっくり戻る
function hitReact(h, B, H) {
  const q = clamp01(H.t / Math.max(0.05, H.dur || 0.4));
  // 当たりごとに崩れの大きさを変える（同じ打たれ方を皆が同じ形でしない）。深手ほど大きい
  if (H.amp === undefined) H.amp = (0.75 + Math.random() * 0.5) * (H.heavy ? 1.3 : 1);
  // 深手でも胸・首・斬られた肩の角度を足し過ぎない。強さは膝の沈みで受ける。
  const e = Math.sin(Math.min(1, q * 2.2) * Math.PI / 2) * (1 - ease(0.3, 1, q)) * Math.min(H.byP ? 1.6 : 1.15, H.amp);
  const sd = H.side || (h.seed > 0.5 ? 1 : -1);
  const k = H.kind;
  // 体の崩れ：重い当たりは膝が抜けて腰が落ち、遅れて立て直す（上体だけが揺れる人形にしない）
  if (HUM.fx && !h.far && k !== 'flinch' && k !== 'kneel' && !h.u.mounted) {
    const kn = e * (H.heavy || H.byP ? 0.55 : 0.25);
    const a = sd > 0 ? B.RightLeg : B.LeftLeg, b = sd > 0 ? B.LeftLeg : B.RightLeg;
    rotWorld(a, _right, 0.5 * kn); rotWorld(b, _right, 0.3 * kn);
    rotWorld(B.LeftUpLeg, _right, -0.2 * kn); rotWorld(B.RightUpLeg, _right, -0.2 * kn);
    h.model.position.y -= 0.05 * kn;
  }
  if (k === 'flinch') { rotWorld(B.Spine1, _right, -0.12 * e); rotWorld(B.Neck, _right, -0.25 * e); rotWorld(B.Head, _fwd, 0.15 * sd * e); }
  else if (k === 'recoil') { rotWorld(B.Spine, _right, -0.22 * e); rotWorld(B.Spine2, _right, -0.12 * e); rotWorld(B.Neck, _right, -0.3 * e); rotWorld(B.Spine1, _up, 0.12 * sd * e); }
  else if (k === 'side') { rotWorld(B.Spine, _fwd, 0.3 * sd * e); rotWorld(B.Spine2, _up, 0.25 * sd * e); rotWorld(B.Head, _fwd, 0.2 * sd * e); }
  else if (k === 'kneel' && !h.u.mounted && !h.u.isPlayer) {
    // 当たりで胸が先に跳ね、遅れて片膝が折れる。立ち直る時は足の上へ胸を戻す。
    const down = ease(0.03, 0.24, q) * (1 - ease(0.58, 1, q));
    const rise = Math.sin(ease(0.58, 1, q) * Math.PI) * 0.25;
    const frontU = sd > 0 ? B.LeftUpLeg : B.RightUpLeg, frontL = sd > 0 ? B.LeftLeg : B.RightLeg;
    const rearU = sd > 0 ? B.RightUpLeg : B.LeftUpLeg, rearL = sd > 0 ? B.RightLeg : B.LeftLeg;
    rotWorld(frontU, _right, -0.85 * down); rotWorld(frontL, _right, 1.35 * down);
    rotWorld(rearU, _right, 0.12 * down); rotWorld(rearL, _right, 1.45 * down);
    rotWorld(B.Spine, _right, -0.18 * e * (1 - down) + 0.22 * down + rise);
    rotWorld(B.Spine1, _fwd, 0.12 * sd * down); rotWorld(B.Neck, _right, -0.15 * e);
    h.model.position.y = Math.min(h.model.position.y, -0.31 * down);
  }
  else if (k === 'stumble') {
    rotWorld(B.Spine, _right, 0.2 * e); rotWorld(B.RightUpLeg, _right, 0.35 * e); rotWorld(B.LeftUpLeg, _right, -0.3 * e); rotWorld(B.LeftLeg, _right, 0.5 * e);
    rotWorld(B.LeftArm, _fwd, -0.4 * e);
    h.model.position.y -= 0.06 * e;
  }
  const cut = !h.u.mounted && !h.u.isPlayer ? cutReaction(H, h.u.id) : 0;
  // 肩を引かれて折れる／胸を押し返される／片脚が抜けて横へ崩れる。
  if (cut === 1) {
    rotWorld(B.Spine, _right, 0.3 * e); rotWorld(B.Spine1, _up, 0.22 * sd * e);
    rotWorld(B.Neck, _right, 0.16 * e);
  } else if (cut === 2) {
    rotWorld(B.Spine, _right, -0.2 * e); rotWorld(B.Hips, _fwd, 0.12 * sd * e);
    rotWorld(sd > 0 ? B.LeftUpLeg : B.RightUpLeg, _right, -0.24 * e);
  } else if (cut === 3) {
    rotWorld(B.Spine, _right, 0.16 * e); rotWorld(B.Hips, _fwd, -0.25 * sd * e);
    rotWorld(sd > 0 ? B.RightLeg : B.LeftLeg, _right, 0.42 * e);
    h.model.position.y -= 0.06 * e;
  }
}

// 倒れる途中の骨の形（倒れ切った後は少し残して、寝姿がねじれないよう弱める）
//   crumple：膝から崩れる。背が丸まり、首が落ち、両膝が折れる
//   forward：前へつんのめる。片足が泳いで前へ出て、上体が前へ折れ、手を前へ突こうとする
//   back：後ろへ吹っ飛ぶ。背が反り、首が後ろへ跳ね、腕が宙へ投げ出され、脚が前へ浮く
//   side：横へ崩れる。倒れる側の腰が落ち、体が横へ折れ、反対の腕が泳ぐ
function deathBody(h, B, D) {
  const paceK = Math.max(0, 1 - (D.t || 0) / DEATH_END);
  const t = (D.t || 0) / (1 + ((D.pace || 1) - 1) * paceK);
  const pv = h.dvar || (h.dvar = 0.8 + h.seed * 0.45);
  const hit = h.u.lastHit;
  const force = Math.min(1, (h.deathSpeed || 0) / 6 + (hit && (hit.heavy || hit.wkind === 'gun') ? 0.45 : 0));
  // 勢いがあるほど、胸に遅れて手足が投げ出される。着地後は力を抜いた寝姿へ戻す。
  const fling = Math.sin(ease(0.04, 0.7, t) * Math.PI) * force;
  const on = ease(0, 0.18, t) * (1 - 0.65 * ease(0.8, 1.6, t)) * pv;
  if (on < 0.01) return;
  const sd = D.side || 1;
  rotWorld(B.Hips, _up, 0.12 * sd * fling); rotWorld(B.Spine2, _up, -0.18 * sd * fling);
  rotWorld(B.LeftForeArm, _right, -0.22 * fling); rotWorld(B.RightForeArm, _right, -0.35 * fling);
  if (D.kind === 'crumple') {
    const c = on * ease(0.05, 0.6, t);
    rotWorld(B.Spine, _right, 0.25 * c); rotWorld(B.Spine1, _right, 0.3 * c); rotWorld(B.Neck, _right, 0.45 * c);
    rotWorld(B.LeftLeg, _right, 0.5 * c); rotWorld(B.RightLeg, _right, 0.35 * c);
    rotWorld(B.Spine2, _fwd, (h.seed - 0.5) * 0.4 * c);
  } else if (D.kind === 'forward') {
    // 泳ぐ足：はじめの 0.35 秒で片足が前へ出て、支えきれずに折れる
    const st_ = Math.sin(clamp01(t / 0.45) * Math.PI) * on;
    const fU = sd > 0 ? B.LeftUpLeg : B.RightUpLeg, fL = sd > 0 ? B.LeftLeg : B.RightLeg;
    rotWorld(fU, _right, -(0.7 + 0.25 * force) * st_); rotWorld(fL, _right, 0.6 * st_);
    rotWorld(B.Spine, _right, 0.35 * on); rotWorld(B.Spine1, _right, 0.25 * on);
    rotWorld(B.Neck, _right, -0.3 * on);   // 顔は地面を見まいと上がる
    // 腕は前へ（地に手を突こうとする）
    rotWorld(B.LeftArm, _right, -0.9 * on); rotWorld(B.RightArm, _right, -0.8 * on);
  } else if (D.kind === 'back') {
    const w = on * (1 - ease(0.1, 0.7, t) * 0.4) * (1 + 0.25 * force);
    rotWorld(B.Spine, _right, -0.35 * w); rotWorld(B.Spine1, _right, -0.2 * w); rotWorld(B.Neck, _right, -0.55 * w);
    // 腕は宙へ投げ出される（左右で高さを変える）
    rotWorld(B.LeftArm, _fwd, -1.1 * w); rotWorld(B.RightArm, _fwd, (0.8 + h.seed * 0.5) * w);
    rotWorld(B.LeftArm, _right, -0.4 * w * h.seed);
    // 脚は前へ浮く
    rotWorld(B.LeftUpLeg, _right, -0.45 * w); rotWorld(B.RightUpLeg, _right, -0.25 * w);
  } else if (D.kind === 'side') {
    rotWorld(B.Spine, _fwd, 0.35 * sd * on); rotWorld(B.Spine1, _fwd, 0.2 * sd * on);
    const dn = sd > 0 ? B.RightLeg : B.LeftLeg, up = sd > 0 ? B.LeftUpLeg : B.RightUpLeg;
    rotWorld(dn, _right, 0.9 * on); rotWorld(up, _fwd, -0.3 * sd * on);
    rotWorld(sd > 0 ? B.LeftArm : B.RightArm, _fwd, -0.9 * sd * on);
    rotWorld(B.Neck, _fwd, -0.3 * sd * on);
  }
}

// 待つ間の暮らし：ときどき重心を片足へ移して長く休め、武器を持ち直し（肩をゆすって握りを確かめる）、首を回す
//   人ごとに間合いと癖が違う（せわしない人・じっとしている人）
function idleLife(h, B, dt, wIdle, st) {
  const I = h.idle || (h.idle = { t: 1 + h.seed * 6, lean: 0, leanT: 0, grip: -1, neck: -1, rate: 0.6 + ((h.seed * 19.3) % 1) * 0.9 });
  const k = wIdle * (1 - st);
  I.t -= dt * I.rate;
  if (I.t <= 0) {
    const r = Math.random();
    if (r < 0.45) { I.leanT = I.leanT > 0 ? -1 : I.leanT < 0 ? (Math.random() < 0.5 ? 0 : 1) : (Math.random() < 0.5 ? 1 : -1); I.t = 4 + Math.random() * 6; }
    else if (r < 0.8) { I.grip = 0; I.t = 3 + Math.random() * 5; }
    else { I.neck = 0; I.t = 3 + Math.random() * 4; }
  }
  // 胸を張って立つ（本の写真の具足の立ち姿）：待つ間は背を起こし、胸を開き、顎を引かずに前を見る。録った待ちの動きは前かがみで縮こまって見えた（10/28）
  //   侍・武将ほど大きく、足軽は半分。骨を足したり形を変えたりせず、角度だけ
  {
    const tier = h.u.look?.tier ?? (h.u.look?.haori ? 2 : 0);
    const up = k * (tier >= 2 ? 1 : tier >= 1 ? 0.8 : 0.5);
    if (up > 0.01 && !globalThis.__noUpright) {
      rotWorld(B.Spine, _right, -0.07 * up); rotWorld(B.Spine1, _right, -0.06 * up); rotWorld(B.Spine2, _right, -0.05 * up);
      rotWorld(B.Neck, _right, -0.1 * up); rotWorld(B.Head, _right, -0.04 * up);
      // 膝を伸ばして腰を上げる（膝を曲げて屈んだ構えに見せない）
      for (const sd of ['Left', 'Right']) { rotWorld(B[sd + 'Leg'], _right, -0.16 * up); rotWorld(B[sd + 'UpLeg'], _right, 0.08 * up); }
      h.model.position.y += 0.018 * up;
    }
  }
  // 見本は毎回同じ立ち姿（重心の移しや持ち直しの揺れを入れない）
  if (h.u.portrait) return;
  // 片足へ重心：休める足の膝がゆるみ、腰がそちらへ落ち、肩は逆へ傾く
  I.lean += (I.leanT - I.lean) * Math.min(1, dt * 1.2);
  const l = I.lean * k;
  if (Math.abs(l) > 0.01) {
    rotWorld(B.Hips, _fwd, 0.07 * l); rotWorld(B.Spine1, _fwd, -0.06 * l); rotWorld(B.Neck, _fwd, -0.03 * l);
    rotWorld(l > 0 ? B.LeftLeg : B.RightLeg, _right, 0.22 * Math.abs(l)); rotWorld(l > 0 ? B.LeftUpLeg : B.RightUpLeg, _right, -0.06 * Math.abs(l));
    h.model.position.y -= 0.01 * Math.abs(l);
    h.model.position.x += 0.008 * l;
  }
  // 持ち直し：一度沈んで、肩をすくめ、胸をひねって握りを確かめる（0.9 秒）
  if (I.grip >= 0) {
    I.grip += dt;
    const g = Math.sin(clamp01(I.grip / 0.9) * Math.PI) * k;
    rotWorld(B.Spine2, _up, -0.1 * g); rotWorld(B.Spine2, _right, -0.05 * g);
    h.model.position.y += 0.012 * Math.sin(clamp01(I.grip / 0.9) * Math.PI * 2) * k;
    for (const sd of ['Left', 'Right']) {
      const sh = B[sd + 'Shoulder'], ar = B[sd + 'Arm'];
      if (sh && ar) { ar.getWorldPosition(_T); _P.copy(_T); _P.y += 0.025 * g; aimBone(sh, _T, _P); }
    }
    if (I.grip > 0.9) I.grip = -1;
  }
  // 首を回す：凝った首を左右へ倒す
  if (I.neck >= 0) {
    I.neck += dt;
    const n = Math.sin(clamp01(I.neck / 1.6) * Math.PI * 2) * Math.sin(clamp01(I.neck / 1.6) * Math.PI) * k;
    rotWorld(B.Neck, _fwd, 0.22 * n); rotWorld(B.Head, _right, 0.1 * Math.abs(n));
    if (I.neck > 1.6) I.neck = -1;
  }
}

// 脚：構え（左足を前・腰を落とす）・突きの踏み込み・待つ間の重心の移し替え・鉄砲と弓の構え
function lowerBody(h, B, dt, time, st, wIdle, sp, w) {
  const u = h.u;
  let lf = 0, rf = 0, lk = 0, rk = 0, drop = 0, spread = 0;
  // 構え
  // 前の足は腿を出して膝を曲げ、後ろの足は膝を折って踵を返す（足の裏が地面から浮かないよう腰を落とす）
  // 人ごとに足の出し方・膝の曲げ・腰の落とし・足の開きを変える（皆が同じ形にならないよう）
  const V = h.var || (h.var = { f: 0.75 + ((h.seed * 7.31) % 1) * 0.5, kn: 0.7 + ((h.seed * 3.17) % 1) * 0.6, sp: 0.6 + ((h.seed * 5.73) % 1) * 0.9, lean: ((h.seed * 9.1) % 1) - 0.5, out: ((h.seed * 11.3) % 1) - 0.5 });
  // 接触中は受け・突きの膝も重なる。構えだけを浅くし、片膝まで沈む二重曲げを防ぐ。
  const stance = st * (1 - clamp01(u.contactBrace || 0) * 0.45);
  lf += -0.45 * stance * V.f; lk += 0.55 * stance * V.kn; rf += -0.15 * stance * (2 - V.f); rk += 0.45 * stance * V.kn; drop += 0.035 * st * (V.kn + V.f) * 0.5; spread += 0.06 * st * V.sp;
  // 半身の構えでは後ろ足にも重みを残し、足首で膝の曲がりを戻して足裏を寝かせる。
  h.model.position.z -= 0.018 * st;
  if (st > 0.05) { rotWorld(B.LeftFoot, _right, (0.45 * V.f - 0.55 * V.kn) * stance); rotWorld(B.RightFoot, _right, (0.15 * (2 - V.f) - 0.45 * V.kn) * stance); }
  // 足先の向き（外へ開く人・まっすぐの人）
  if (st > 0.05) { rotWorld(B.LeftUpLeg, _up, 0.12 * V.out * st); rotWorld(B.RightUpLeg, _up, -0.25 * (0.6 + V.out) * st); }
  // 横へ開く足と、後から寄せる足を交互に運ぶ。膝を緩めたまま足を交差させない。
  // 骨と歩みの時計を使い回し、接地は後段の共通補正で坂にも合わせる。
  const side = !h.far && !u.isPlayer && h.closeGait > 0.01 && HUM.fx && !reduceMotion()
    && !u.fleeing && !u.hit && !u.dodging && !u.downed && !u.climb && !(u.stagger > 0)
    && !(u.pinT > (ARMY?.time ?? 0)) && (w === 'spear' || w === 'sword')
    ? (h.gaitSide || 0) * clamp01((sp - 0.2) / 0.6) : 0;
  if (Math.abs(side) > 0.01) {
    const ph = h.gaitPhase * Math.PI * 2, shift = Math.sin(ph) * side;
    const weight = Math.abs(side), liftL = Math.max(0, Math.cos(ph) * Math.sign(side)) * weight;
    const liftR = Math.max(0, -Math.cos(ph) * Math.sign(side)) * weight;
    spread += 0.14 * weight;
    rotWorld(B.LeftUpLeg, _fwd, shift * 0.12);
    rotWorld(B.RightUpLeg, _fwd, -shift * 0.12);
    lf -= 0.07 * liftL; rf -= 0.07 * liftR;
    lk += 0.16 * liftL + 0.08 * weight; rk += 0.16 * liftR + 0.08 * weight;
    rotWorld(B.Spine, _fwd, -side * 0.045);
    h.model.position.x += side * 0.018;
    drop += 0.025 * weight;
  }
  // 突きの踏み込みは attackBody でまとめ、叩きは両膝で受ける
  if (u.strikeT > 0 && w !== 'spear' && w !== 'sword') { const s = Math.sin((1 - u.strikeT / 0.2) * Math.PI); lf -= 0.3 * s; rf += 0.22 * s; drop += 0.05 * s; }
  if (u.slamT > 0) { const s = Math.sin((1 - u.slamT / 0.26) * Math.PI); lk += 0.3 * s; rk += 0.3 * s; drop += 0.08 * s; }
  // 鉄砲を撃つ・弓を引く：左足を前に開いて立つ
  const aim = (u.atk && (u.atk.ranged || u.atk.bow)) || u.gunPh === 'aim' || u.gunPh === 'kiri' || u.bowPh === 'draw' || u.bowPh === 'kai' ? 1 : 0;
  h.aimK = (h.aimK || 0) + (aim - (h.aimK || 0)) * Math.min(1, dt * 5);
  if ((w === 'gun' || w === 'bow') && sp < 1.2) { lf -= 0.22 * h.aimK; rf += 0.12 * h.aimK; lk += 0.12 * h.aimK; spread += 0.06 * h.aimK; drop += 0.02 * h.aimK; }
  // 待つ間：ゆっくり重心を左右へ移し、力を抜いた脚の膝がゆるむ（棒立ちにしない）
  if (wIdle > 0.2) {
    const V = h.var;
    const sh = Math.sin(time * (0.35 + h.seed * 0.2) + h.seed * 9) * wIdle * (1 - st) + V.lean * 0.6 * wIdle * (1 - st);
    rotWorld(B.Hips, _fwd, 0.045 * sh);
    // 立ち方の癖：足を広めに開く人・閉じる人
    spread += (V.sp - 1) * 0.05 * wIdle * (1 - st);
    rotWorld(B.Spine, _fwd, -0.05 * sh);
    if (sh > 0) { lk += 0.16 * sh; lf -= 0.05 * sh; } else { rk -= 0.16 * sh; rf += 0.05 * sh; }
    drop += Math.abs(sh) * 0.012;
  }
  // 待つ間の身構えと膝つき（units.js の idleFx が決める u.idl.low・u.idl.sit）
  // 敵が近ければ膝を曲げて腰を落とす。陣の中では右の膝を立て、左の膝を地につける
  const I = u.idl;
  if (I && wIdle > 0.2) {
    if (I.low > 0.01 && st < 0.5) { lf -= 0.3 * I.low; lk += 0.4 * I.low; rf += 0.05 * I.low; rk += 0.35 * I.low; drop += 0.05 * I.low; }
    if (I.sit > 0.01) { rf -= 1.0 * I.sit; rk += 1.6 * I.sit; lf += 0.15 * I.sit; lk += 1.4 * I.sit; drop += 0.3 * I.sit; }
  }
  if (lf) rotWorld(B.LeftUpLeg, _right, lf);
  if (rf) rotWorld(B.RightUpLeg, _right, rf);
  if (spread) { rotWorld(B.LeftUpLeg, _fwd, -spread); rotWorld(B.RightUpLeg, _fwd, spread); }
  if (lk) rotWorld(B.LeftLeg, _right, lk);
  if (rk) rotWorld(B.RightLeg, _right, rk);
  h.model.position.y -= drop;
}

const _fp = [new THREE.Vector3(), new THREE.Vector3()];
const _fk = new THREE.Vector3();
const _pf = new THREE.Vector3();
const _pfp = new THREE.Vector3();
function plantFeet(h, B, dt) {
  const R = SRC.rest;
  if (!R || !R.LeftFoot || !R.RightFoot) return;
  // 関節の getWorldPosition と逆運動学が必要な親だけを更新する。
  // 人体・甲冑・指を含む全子孫の強制更新を、足合わせの前後に繰り返さない。
  h.root.getWorldScale(_pfp);
  const scaleY = Math.max(0.01, _pfp.y);
  // 腰の踏み込みを足先へそのまま写すと、両足が地面を滑ってしまう。
  // 止まって戦う近い徒歩だけ接地点を覚え、後ろ足を残して前足を踏み直す。
  // 足の目標だけを変え、兵の位置・当たり・攻撃の時計には触れない。
  const u = h.u;
  const hit = u.hit && u.hit.kind !== 'kneel' && !u.hit.tumble ? u.hit : null;
  const lock = !h.far && !u.isPlayer && (!u.hit || hit) && (hit || !(u.stagger > 0)) && !u.fleeing
    && !u.downed && !(h.kneelK > 0.01) && (hit || (h.spd || 0) < 0.25) && !reduceMotion();
  // 胴の伸びに足を直結すると、命中する瞬間も草鞋が滑り、戻しも地面を擦る。
  // 今ある攻撃の時計で「足を運ぶ→接地して打つ→足を上げて戻す」を分ける。
  // 後ろ足は固定。人ごとの歩幅と残心の長さだけを変え、攻撃の拍子は変えない。
  const swing = lock && !hit ? u.swing : null;
  let step = 0, lift = 0;
  if (swing && !swing.ranged && !swing.bow) {
    const hitAt = Math.max(0.08, swing.dur * (swing.at ?? 0.5));
    const landAt = Math.max(0.05, hitAt - 0.025);
    const returnAt = Math.max(hitAt + 0.08 + h.seed * 0.04, swing.dur * 0.7);
    const advance = ease(0, landAt, swing.t);
    const recover = ease(returnAt, swing.dur + 0.26, swing.t);
    const stride = (u.wpnKind || u.lookWeapon) === 'spear' ? 0.14 : 0.1;
    step = (stride + h.seed * 0.06) * advance * (1 - recover);
    // 前足は当たりより先に下ろし、残心の間は足裏を地につけて腰を受ける。
    // 往復とも端で高さと速さがゼロになる弧。毎コマの入れ物は作らない。
    const arc = advance < 1 ? advance : recover;
    lift = 16 * arc * arc * (1 - arc) * (1 - arc) * (0.035 + h.seed * 0.015);
  }
  if (lock) {
    // 一人につき一度だけ確保し、構えを解いても同じ入れ物を使い回す。
    if (!h.combatFeet) h.combatFeet = new Float64Array(4);
    if (!h.combatFeetReady || h.combatHit !== hit || Math.hypot(u.pos.x - h.combatFeetX, u.pos.z - h.combatFeetZ) > (hit ? 0.7 : 0.32)
      || Math.abs(angleDiff(h.combatFeetHeading, u.heading)) > (hit ? 0.35 : 1.1)
      || Math.abs(u.pos.y - h.combatFeetY) > 0.15) {
      B.LeftFoot.getWorldPosition(_fp[0]); B.RightFoot.getWorldPosition(_fp[1]);
      for (let i = 0; i < 2; i++) {
        h.combatFeet[i * 2] = _fp[i].x - (i ? 0 : _fwd.x * step);
        h.combatFeet[i * 2 + 1] = _fp[i].z - (i ? 0 : _fwd.z * step);
      }
      h.combatFeetX = u.pos.x; h.combatFeetZ = u.pos.z; h.combatFeetY = u.pos.y;
      h.combatFeetHeading = u.heading; h.combatFeetReady = true;
      h.pivotStep = 0;
    }
  } else { h.combatFeetReady = false; h.pivotStep = 0; }
  h.combatHit = hit;
  // 向き直るたびに両足の固定を解くと、草鞋が一緒に跳び、腰だけが回る。
  // 片足を地面に残し、もう片足を運んでから支えを交代する。近景の既存の接地枠だけで行う。
  let pivotFoot = -1, pivotLift = 0;
  if (lock && !hit && !u.atk && !u.swing && !u.tech && !(u.slipT > 0)) {
    if (!h.pivotStep && Math.abs(angleDiff(h.combatFeetHeading, u.heading)) > 0.18) {
      h.pivotStep = 1; h.pivotTime = 0;
      h.pivotFirst = angleDiff(h.combatFeetHeading, u.heading) > 0 ? 1 : 0;
    }
    if (h.pivotStep) {
      pivotFoot = h.pivotStep === 1 ? h.pivotFirst : 1 - h.pivotFirst;
      const at = pivotFoot * 2;
      // 一人一つの小さな入れ物を繰り返し使い、毎コマは数値だけを更新する。
      if (!h.pivotFeet) h.pivotFeet = new Float64Array(4);
      if (!h.pivotTime) {
        (pivotFoot ? B.RightFoot : B.LeftFoot).getWorldPosition(_fk);
        h.pivotFeet[0] = h.combatFeet[at]; h.pivotFeet[1] = h.combatFeet[at + 1];
        h.pivotFeet[2] = _fk.x; h.pivotFeet[3] = _fk.z;
      }
      h.pivotTime += dt;
      const q = clamp01(h.pivotTime / (0.18 + h.seed * 0.05)), k = q * q * (3 - 2 * q);
      h.combatFeet[at] = h.pivotFeet[0] + (h.pivotFeet[2] - h.pivotFeet[0]) * k;
      h.combatFeet[at + 1] = h.pivotFeet[1] + (h.pivotFeet[3] - h.pivotFeet[1]) * k;
      pivotLift = 16 * q * q * (1 - q) * (1 - q) * 0.045;
      if (q >= 1) {
        h.pivotTime = 0;
        if (h.pivotStep === 1) h.pivotStep = 2;
        else { h.pivotStep = 0; h.combatFeetHeading = u.heading; }
      }
    }
  } else h.pivotStep = 0;
  let drop = 0;
  // 足先だけを下げても、腰が高いままでは脚が届かず、逆運動学が途中で止まる。
  // 両脚の実際の長さから届く腰の高さを先に求める。左右の目標は共有の入れ物へ。
  for (let i = 0; i < 2; i++) {
    const sd = i ? 'Right' : 'Left', a = B[sd + 'UpLeg'], b = B[sd + 'Leg'], c = B[sd + 'Foot'];
    a.getWorldPosition(_fk); b.getWorldPosition(_pf); c.getWorldPosition(_fp[i]);
    const reach = (_fk.distanceTo(_pf) + _pf.distanceTo(_fp[i])) * 0.97;
    if (lock) {
      _fp[i].x = h.combatFeet[i * 2] + (i ? 0 : _fwd.x * step);
      _fp[i].z = h.combatFeet[i * 2 + 1] + (i ? 0 : _fwd.z * step);
      if (hit) {
        // 当たり側の足を先に運び、反対の足は残して腰を支える。
        // 押される実際の位置だけを追う。兵の位置や怯む時間は変えない。
        const q = clamp01(hit.t / Math.max(0.05, hit.dur || 0.4));
        const first = i === ((hit.side || 1) > 0 ? 1 : 0);
        const transfer = first ? ease(0.02, 0.48, q) : ease(0.48, 1, q);
        _fp[i].x += (u.pos.x - h.combatFeetX) * transfer;
        _fp[i].z += (u.pos.z - h.combatFeetZ) * transfer;
        lift = 16 * transfer * transfer * (1 - transfer) * (1 - transfer) * (hit.heavy ? 0.055 : 0.035);
      }
    }
    const dx = _fp[i].x - _fk.x, dz = _fp[i].z - _fk.z, span = Math.hypot(dx, dz);
    // 深い構えに歩きの脚が重なっても、足を届かない遠さへ投げ出さない。
    if (span > reach * 0.7) {
      const k = reach * 0.7 / span;
      _fp[i].x = _fk.x + dx * k; _fp[i].z = _fk.z + dz * k;
    }
    _fp[i].y = groundAt(WORLD, _fp[i].x, _fp[i].z, h.u.pos.y) + R[sd + 'Foot'].y * scaleY;
    if (lock && (hit || !i)) _fp[i].y += lift;
    if (i === pivotFoot) _fp[i].y += pivotLift;
    const horizontal = Math.min(span, reach * 0.7);
    drop = Math.max(drop, _fk.y - _fp[i].y - Math.sqrt(Math.max(0, reach * reach - horizontal * horizontal)));
  }
  h.model.position.y -= Math.min(0.28, drop / scaleY);
  for (let i = 0; i < 2; i++) {
    const sd = i ? 'Right' : 'Left', c = B[sd + 'Foot'];
    const yaw = h.gaitYaw || 0;
    ik2(B[sd + 'UpLeg'], B[sd + 'Leg'], c, _fp[i], _pfp.copy(_fwd).multiplyScalar(Math.cos(yaw)).addScaledVector(_right, Math.sin(yaw)).addScaledVector(_up, 0.1));
    // 足首も戻して草鞋を寝かせる。爪先立ちのまま突き・受けを終えない。
    const toe = B[sd + 'ToeBase'];
    if (toe && R[sd + 'ToeBase']) {
      c.getWorldPosition(_pf); toe.getWorldPosition(_fk);
      _pfp.copy(_fk); _pfp.y = _pf.y + (R[sd + 'ToeBase'].y - R[sd + 'Foot'].y) * scaleY;
      aimBone(c, _fk, _pfp);
    }
  }
}
function footPlant(h, B, dt) {
  const u = h.u;
  const R = SRC.rest;
  if (!R?.LeftFoot || !R.RightFoot) return;
  h.root.getWorldScale(_pfp);
  const scaleY = Math.max(0.01, _pfp.y);
  const g0 = groundAt(WORLD, u.pos.x, u.pos.z, u.pos.y);
  B.LeftFoot.getWorldPosition(_fp[0]); B.RightFoot.getWorldPosition(_fp[1]);
  const left = groundAt(WORLD, _fp[0].x, _fp[0].z, u.pos.y) - g0;
  const right = groundAt(WORLD, _fp[1].x, _fp[1].z, u.pos.y) - g0;
  // 腰：低い方の足が届くように落とす（ばねで滑らかに）
  const want = Math.max(0, -Math.min(left, right));
  h.fpDrop = (h.fpDrop || 0) + (Math.min(0.25, want) - (h.fpDrop || 0)) * Math.min(1, dt * 10);
  const planted = (h.spd || 0) < 0.3 && !u.hit;
  // 低い方の草鞋が着く拍子に、腰の弾みで数センチ浮く分を吸収する。
  // 駆け足の高い跳躍相は残し、歩幅・兵の速さ・地面には触れない。
  const ankle = R.LeftFoot.y * scaleY;
  const low = Math.min(_fp[0].y - g0 - left - ankle, _fp[1].y - g0 - right - ankle);
  const settle = !planted && !u.hit && low > 0 && low < 0.22 ? Math.min(0.11, low) * (1 - low / 0.22) : 0;
  h.fpSettle = (h.fpSettle || 0) + (settle - (h.fpSettle || 0)) * Math.min(1, dt * 18);
  h.model.position.y -= h.fpSettle / scaleY;
  // すり足：間合いの内で詰める・下がる時は、草鞋を地から高く上げず滑らせて運ぶ（見た目だけ。歩幅・速さは変えない）
  const suri = !planted && !u.hit && !u.isPlayer && !u.mounted && !u.fleeing && !h.far && !reduceMotion()
    ? clamp01(((h.closeGait || 0) - 0.15) / 0.5) * 0.7 * (1 - clamp01(((h.spd || 0) - 2.2) / 1.2)) : 0;
  if (!suri && !planted && Math.abs(left) + Math.abs(right) < 0.012 && h.fpDrop < 0.005) return;
  h.model.position.y -= h.fpDrop;
  syncBones(h);
  for (let i = 0; i < 2; i++) {
    const a = i ? B.RightUpLeg : B.LeftUpLeg, b = i ? B.RightLeg : B.LeftLeg, c = i ? B.RightFoot : B.LeftFoot;
    c.getWorldPosition(_fp[i]);
    // 足が地面から持ち上がっている分（歩みで上げた足）はそのまま、地面の高さの差だけ動かす
    const ankle = R[i ? 'RightFoot' : 'LeftFoot'].y * scaleY;
    const floor = g0 + (i ? right : left) + ankle;
    _fp[i].y = planted ? floor : Math.max(floor, _fp[i].y + (i ? right : left) + h.fpDrop);
    if (suri > 0.01) _fp[i].y = floor + (_fp[i].y - floor) * (1 - suri);
    // 横へ踏み替える時は、膝も草鞋と同じ方向へ。
    const yaw = h.gaitYaw || 0;
    _fk.copy(_fwd).multiplyScalar(Math.cos(yaw)).addScaledVector(_right, Math.sin(yaw)).addScaledVector(_up, 0.1);
    ik2(a, b, c, _fp[i], _fk);
  }
}

// 一歩の重さ：接地で膝が受け、腰が反対へ回り、胸と腕が遅れて戻る。見本の足運びは保つ。
function gaitWeight(h, B, dt, wWalk, wRun, st) {
  const acc = dt > 0 ? (h.spd - (h.pSpd ?? h.spd)) / dt : 0; h.pSpd = h.spd;
  h.accS = (h.accS || 0) + (Math.max(-12, Math.min(12, acc)) - (h.accS || 0)) * (1 - Math.exp(-dt * 8));
  const push = clamp01(h.accS / 7), brake = clamp01(-h.accS / 7);
  const load = Math.max(push, brake) * (1 - (h.u.dodging ? 1 : 0));
  // 駆け出しで膝に力を溜め、止まる時は前足で受けて腰が沈む。
  rotWorld(B.Spine, _right, (0.18 * push - 0.14 * brake) * (1 - st * 0.4));
  rotWorld(B.LeftUpLeg, _right, -0.12 * load); rotWorld(B.RightUpLeg, _right, -0.1 * load);
  rotWorld(B.LeftLeg, _right, 0.23 * load); rotWorld(B.RightLeg, _right, 0.2 * load);
  h.model.position.y -= 0.035 * load;
  if (h.far || wWalk + wRun < 0.03) return;
  const A = h.act;
  const ph = A.walk.time / Math.max(0.01, A.walk.getClip().duration) * Math.PI * 2;
  const rph = A.run.time / Math.max(0.01, A.run.getClip().duration) * Math.PI * 2;
  const sway = Math.sin(ph) * wWalk + Math.sin(rph) * wRun;
  const left = Math.max(0, Math.cos(ph)) * wWalk + Math.max(0, Math.cos(rph)) * wRun;
  const right = Math.max(0, -Math.cos(ph)) * wWalk + Math.max(0, -Math.cos(rph)) * wRun;
  const tired = 1 - clamp01(h.heavy || 0) * 0.3;
  rotWorld(B.Hips, _up, sway * 0.055 * tired); rotWorld(B.Spine1, _up, -sway * 0.07 * tired);
  rotWorld(B.Hips, _fwd, sway * 0.025); rotWorld(B.Spine2, _fwd, -sway * 0.02);
  rotWorld(B.LeftUpLeg, _right, -0.025 * left); rotWorld(B.LeftLeg, _right, 0.065 * left);
  rotWorld(B.RightUpLeg, _right, -0.025 * right); rotWorld(B.RightLeg, _right, 0.065 * right);
  // 足を着く側へ腰を預け、反対の膝を送り出す。棒立ちの脚と胸を別々に動かさない。
  // 既存の接地の拍子を使い、当たり・移動・攻撃の時計は変えない。
  const support = (left + right) * (1 - st * 0.6);
  rotWorld(B.LeftUpLeg, _right, -0.035 * left * tired);
  rotWorld(B.LeftLeg, _right, 0.075 * left * tired);
  rotWorld(B.RightUpLeg, _right, -0.035 * right * tired);
  rotWorld(B.RightLeg, _right, 0.075 * right * tired);
  rotWorld(B.Spine, _right, 0.025 * support);
  h.model.position.y -= 0.012 * support;
  // 二歩に二度の重心移動。走りの弾みは歩きより大きく、疲れると小さくなる。
  h.model.position.x += sway * (0.012 * wWalk + 0.007 * wRun) * tired;
  // 空いた腕は脚と逆に振り、肘は少し遅れる。槍と両手の武器は握り合わせに任せる。
  const w = h.u.wpnKind || h.u.lookWeapon;
  const free = !h.u.wpn || !h.u.wpn.parent || !w || w === 'none';
  const swing = (Math.sin(ph) * 0.045 * wWalk + Math.sin(rph) * 0.07 * wRun) * tired;
  if (free && !h.u.look?.standard) rotWorld(B.RightArm, _right, -swing);
  if (free && !h.u.look?.standard) {
    rotWorld(B.LeftArm, _right, swing);
    rotWorld(B.LeftForeArm, _right, -Math.max(0, Math.sin(ph - 0.4)) * 0.035 * wWalk);
  }
  h.model.position.y += ((Math.abs(Math.sin(ph)) - 0.64) * 0.018 * wWalk + (Math.abs(Math.sin(rph)) - 0.64) * 0.032 * wRun) * tired;
}

// 息・疲れ・傷：胸が息で上下し、駆けた後や疲れた者は肩で息をして背を丸める。深手の者は片足をかばって歩き、背を丸める
// （units.js の u.fat＝疲れ 0..1、u.hp の減り。駆けた後の息の荒さは h.exert に貯める）
function vitals(h, B, dt, time, sp, wIdle, wWalk, wRun, st) {
  const u = h.u;
  h.exert = clamp01((h.exert || 0) + dt * (wRun > 0.3 ? 1 / 10 : sp > 1.2 ? 1 / 60 : -1 / 25));
  const hurt = u.maxHp > 0 ? clamp01((1 - u.hp / u.maxHp) / 0.75) : 0;
  const heavy = Math.max(u.fat || 0, h.exert * 0.9, hurt);
  h.heavy = (h.heavy || 0) + (heavy - (h.heavy || 0)) * Math.min(1, dt * 1.5);
  const hv = h.heavy;
  // 息の拍子：落ち着いていれば四秒に一度ほど、荒いと一秒に一度。拍子を少しずつ進める（速さが変わっても跳ばない）
  h.brPh = (h.brPh ?? h.seed * 6.28) + dt * Math.PI * 2 * (0.24 + h.seed * 0.06 + hv * 0.75);
  const br = reduceMotion() ? 0 : Math.sin(h.brPh), still = 1 - wRun * 0.8;
  // 待つ兵の吸う息で腰もわずかに動く。胸と同じ拍子を使い、隣とは開始時をずらす。
  h.model.position.y += br * 0.0015 * wIdle * (1 - st);
  // 胸を張って吸う（背骨の上を少し起こす）
  rotWorld(B.Spine2, _right, -br * (0.012 + hv * 0.035) * still);
  // 肩で息をする：吸う時に両肩が上がる。疲れた者は肩が落ち、腕がだらりと下がる
  const lift = (0.003 + hv * 0.022) * Math.max(0, br) * still - Math.max(0, hv - 0.3) * 0.055 * (1 - wRun * 0.5);
  if (Math.abs(lift) > 0.0005 && !h.far && (h.u.isPlayer || h.near !== false)) for (let side = 0; side < 2; side++) {
    const sd = side === 0 ? 'Left' : 'Right';
    const sh = B[sd + 'Shoulder'], ar = B[sd + 'Arm'];
    if (!sh || !ar) continue;
    ar.getWorldPosition(_T); _P.copy(_T); _P.y += lift;
    aimBone(sh, _T, _P);
  }
  // ひどく疲れた者は、待つ間に背を丸めて頭を垂れる
  const slump = Math.max(0, hv - 0.45) * wIdle * (1 - st);
  if (slump > 0.01) { rotWorld(B.Spine1, _right, 0.28 * slump); rotWorld(B.Spine, _right, 0.3 * Math.max(0, hv - 0.65) * wIdle * (1 - st)); rotWorld(B.Neck, _right, 0.25 * slump); h.model.position.y -= 0.02 * slump; }
  // 歩き方の癖（皆が同じ録った動きで歩くと、同じ人形が並んで見える）：前かがみの人・胸を張る人、腰を左右に振る人、首を前へ出す人
  const mv = wWalk + wRun;
  if (mv > 0.05 && !h.far) {
    const V = h.var;
    rotWorld(B.Spine, _right, (V?.lean || 0) * 0.14 * mv + wRun * 0.08 * (h.seed - 0.3));
    rotWorld(B.Neck, _right, ((h.seed * 13.7) % 1 - 0.4) * 0.12 * mv);
    const A = h.act, ph = (A.walk.time / Math.max(0.01, A.walk.getClip().duration)) * Math.PI * 2;
    rotWorld(B.Hips, _fwd, Math.sin(ph) * 0.05 * (V?.out || 0) * wWalk);
    // 疲れて歩く者は、頭が前へ落ち、背が丸まる
    if (hv > 0.35) { const tk = (hv - 0.35) * wWalk; rotWorld(B.Spine1, _right, 0.18 * tk); rotWorld(B.Neck, _right, 0.2 * tk); }
    // 走る：人ごとに違う前傾、腕の振りと逆に胸がひねれ、一歩ごとに体が弾んで具足が跳ねる（sway が上下の速さで揺らす）
    if (wRun > 0.05) {
      const R_ = A.run, rph = (R_.time / Math.max(0.01, R_.getClip().duration)) * Math.PI * 2;
      h.runPh = rph;
      rotWorld(B.Spine, _right, wRun * (0.08 + (V?.f || 1) * 0.06 + hv * 0.06));
      rotWorld(B.Spine2, _up, Math.sin(rph) * 0.08 * wRun);
      rotWorld(B.Neck, _right, -wRun * 0.1);
    }
  }
  h.runW = mv > 0.05 && !h.far ? wRun : 0;
  // 深手（残りの力が三割ほどより下）：片足をかばう。歩む拍子のうち痛む足で踏む間、腰が沈み、体が痛む足の側へ傾く
  const hurtW = u.maxHp ? clamp01((0.35 - u.hp / u.maxHp) / 0.2) : 0;
  h.hurt = (h.hurt || 0) + (hurtW - (h.hurt || 0)) * Math.min(1, dt * 2);
  if (h.hurt > 0.02) {
    const hk = h.hurt;
    const sd = h.seed > 0.5 ? 1 : -1;
    const A = h.act, ph = A.walk.getClip().duration > 0 ? (A.walk.time / A.walk.getClip().duration) * Math.PI * 2 : 0;
    const step = Math.max(0, Math.sin(ph) * sd) * wWalk;
    h.model.position.y -= 0.045 * hk * step;
    rotWorld(B.Spine, _fwd, 0.1 * sd * hk * step);
    rotWorld(B.Spine1, _right, 0.12 * hk);
  }
}

// 表情：突く・振る・駆けてかかる時は叫び、打たれると顔をしかめ、敵と向き合う間は眉を寄せる。討たれた者は口が緩む
//   人ごとに表情の大きさが違い、叫びは一息ごとに開け閉めする
function faceExpr(h, u, dt, engaged) {
  const E = h.expr, K = h.exK || (h.exK = 0.7 + ((h.seed * 41.3) % 1) * 0.5);
  let open = 0, pain = 0, anger = 0;
  if (!u.alive) { open = 0.35; pain = 0.15; }
  else {
    const atk = (u.strikeT > 0) || (u.slamT > 0) || !!u.swing || (engaged && (h.spd || 0) > 3);
    h.shoutT = atk ? 0.9 : Math.max(0, (h.shoutT || 0) - dt);
    if (h.shoutT > 0) open = 0.75 + 0.25 * Math.sin((h.clock || 0) * 9 + h.seed * 5);
    if (u.hit) { const q = clamp01(u.hit.t / Math.max(0.05, u.hit.dur || 0.4)); pain = Math.max(pain, (1 - q) * (u.hit.heavy ? 1 : 0.7)); open = Math.max(open, (1 - q) * 0.4); }
    if (h.hurt > 0.05) pain = Math.max(pain, h.hurt * 0.6);
    // 全員を同じ怒り顔に固定せず、受ける拍子の緊張を頬と眉へ渡す。
    if (engaged) anger = Math.min(1, 0.5 + h.seed * 0.25 + (u.contactLoad || 0) * 0.2);
    if (engaged && WORLD?.def.infantryWeight && !u.isPlayer && !u.mounted) {
      // 目前の打撃を受ける兵は、叫ぶ・歯を食いしばる・息を詰める顔へ分ける。
      // 既存の顔の差分だけを使い、個体ごとの絵や材質を増やさない。
      const strain = clamp01((u.contactLoad || 0) + (u.contactBrace || 0) * .4);
      const fear = clamp01((55 - (u.group?.morale ?? 100)) / 55);
      open *= .25 + h.seed * .65;
      open = Math.max(open, strain * (.06 + h.seed * .2) + fear * .18);
      pain = Math.max(pain, strain * (.12 + (1 - h.seed) * .28) + fear * .25);
      anger *= .65 + h.seed * .3;
    }
    if ((h.heavy || 0) > 0.5) { pain = Math.max(pain, (h.heavy - 0.5) * 0.6); open = Math.max(open, (h.heavy - 0.5) * 0.5 * (0.5 + 0.5 * Math.sin(h.brPh || 0))); }
  }
  // 本能寺の小姓は、歯を食いしばる・息を吐く・声を上げる顔に分ける。
  if (u.honnoExpression != null) {
    const v = u.honnoExpression;
    open *= v === 0 ? 0.12 : v === 1 ? 0.3 : v === 2 ? 0.5 : 0.7;
    if (!u.alive) { open = 0.025 + v * 0.035; pain = 0.08 + v * 0.025; }
    else if (engaged) anger *= 0.65 + v * 0.1;
  }
  const k = Math.min(1, dt * 10);
  E.x += (open * K - E.x) * k; E.y += (pain * K - E.y) * k; E.z += (anger * K - E.z) * Math.min(1, dt * 4);
  // まばたき：人ごとに間を散らし（2〜6秒）、0.14秒で閉じて開く。打たれた時は目をつむり、苦しむ顔は目を細める。討たれた者は半ば閉じる
  let bl = 0;
  if (!u.alive) bl = 0.6;
  else {
    h.blT = (h.blT ?? (1 + h.seed * 4)) - dt;
    if (h.blT < 0) { h.blT = 2 + ((h.seed * 7.7 + (h.clock || 0) * 0.37) % 1) * 4; h.blP = 0; }
    if (h.blP != null) { h.blP += dt / 0.14; bl = h.blP >= 1 ? (h.blP = null, 0) : Math.sin(h.blP * Math.PI); }
    if (u.hit) bl = Math.max(bl, 1 - clamp01(u.hit.t / Math.max(0.05, u.hit.dur || 0.4)));
    bl = Math.max(bl, E.y * 0.4);
  }
  E.w = bl;
  setFaceMorph(h);
}

// 兵は pos、建物は x・z または線分で場所を持つ。近い線分の点を見て、入れ物は使い回す。
function lookTarget(u, out) {
  // 振り終わるまでは実際に打っている相手を見る。後列も構えた槍と視線をそろえる。
  const t = u.swing?.target || u.atk?.target || u.target || u.poseTarget;
  if (!t || t.alive === false || t.gone || t.opened || t.team === u.team) return false;
  let x, z;
  if (t.isStruct) {
    if (t.seg) {
      const s = t.seg, dx = s[2] - s[0], dz = s[3] - s[1];
      const k = Math.max(0, Math.min(1, ((u.pos.x - s[0]) * dx + (u.pos.z - s[1]) * dz) / (dx * dx + dz * dz || 1)));
      x = s[0] + dx * k; z = s[1] + dz * k;
    } else { x = t.x; z = t.z; }
  } else if (t.pos) { x = t.pos.x; z = t.pos.z; }
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  out.x = x; out.z = z;
  return true;
}

// 見回す：首と頭を、ばねで狙いの向きへ
function lookAround(h, B, dt, engaged, wIdle) {
  const u = h.u;
  const tg = lookTarget(u, _tgt2) ? _tgt2 : null;
  const L = h.lk || (h.lk = { yaw: 0, pitch: 0, ty: 0, tp: 0, t: 1 + h.seed * 4 });
  L.t -= dt;
  if (u.fallenLookLeft > 0 && Number.isFinite(u.fallenLookX) && Number.isFinite(u.fallenLookZ) && !u.fleeing && !u.atk && !u.swing && !(engaged && tg && Math.hypot(tg.x - u.pos.x, tg.z - u.pos.z) < 2.5)) {
    let a = Math.atan2(u.fallenLookX - u.pos.x, u.fallenLookZ - u.pos.z) - u.heading;
    while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
    L.ty = Math.max(-0.9, Math.min(0.9, a)); L.tp = 0.12; L.t = 0;
  } else if (engaged && tg) {
    // 敵の方へ（体の向きからのずれ）
    const tx = tg.x - u.pos.x, tz = tg.z - u.pos.z;
    let a = Math.atan2(tx, tz) - u.heading; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2;
    L.ty = Math.max(-0.9, Math.min(0.9, a));
    const foe = u.swing?.target || u.atk?.target || u.target || u.poseTarget;
    const dy = foe?.pos ? foe.pos.y + (foe.mounted ? RIDE.y : 0) - u.pos.y - (u.mounted ? RIDE.y : 0) : 0;
    L.tp = Math.max(-0.35, Math.min(0.35, -Math.atan2(dy, Math.max(1, Math.hypot(tx, tz)))));
  } else if (!u.isPlayer && !u.mounted && !u.fleeing && !u.atk && !u.swing && !u.hit && !(u.stagger > 0) && wIdle > 0.8 && u.idl && u.idl.a) {
    // 軽い兵と同じしぐさを首の骨へ。別々の見回しが重なって打ち消さないように
    L.ty = u.idl.hy; L.tp = u.idl.hp; L.t = 0.5;
  } else if (L.t <= 0) {
    // 時々、横や後ろの様子を見る。隊の崩れかけは落ち着きなく
    const nerv = (u.group && u.group.morale < 40 ? 2 : 1) * (0.7 + ((h.seed * 29.1) % 1) * 0.7);
    L.t = (1.5 + Math.random() * 4) / nerv;
    L.ty = Math.random() < 0.45 ? 0 : (Math.random() - 0.5) * 1.5 * Math.min(1, wIdle + 0.3);
    L.tp = (Math.random() - 0.6) * 0.25;
  }
  const k = Math.min(1, dt * 3.5);
  L.yaw += (L.ty - L.yaw) * k; L.pitch += (L.tp - L.pitch) * k;
  if (Math.abs(L.yaw) + Math.abs(L.pitch) < 0.01) return;
  rotWorld(B.Spine2, _up, L.yaw * 0.15);
  // 大きく振り返る時は、胸と腰もついて回る（首だけが回る人形にしない）
  if (Math.abs(L.yaw) > 0.45) { const ex = (Math.abs(L.yaw) - 0.45) * Math.sign(L.yaw); rotWorld(B.Spine1, _up, ex * 0.3); rotWorld(B.Spine, _up, ex * 0.15); }
  rotWorld(B.Neck, _up, L.yaw * 0.35);
  rotWorld(B.Head, _up, L.yaw * 0.45);
  rotWorld(B.Head, _right, L.pitch);
}

export { SAIHAI, cmdOff, cmdPose, groundLimbs, hitReact, deathBody, idleLife, lowerBody, plantFeet, footPlant, gaitWeight, vitals, faceExpr, lookAround };
