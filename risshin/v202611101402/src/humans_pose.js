// 人の処理：骨の姿勢。外部向けの入口は humans.js。
import * as THREE from 'three';
import { m0, m1, q0, v0, v1, v2, v3, SRC } from './humans_shared.js';

const _wq = new THREE.Quaternion();
function rotWorld(bone, axis, ang) {
  if (!ang) return;
  _wq.setFromAxisAngle(axis, ang);
  applyWorldRot(bone, _wq);
}
// 世界での回転を骨に掛ける。親に鏡（前後を返した）が入っていても正しく回るよう、行列で挟む
// 親の行列だけを新しくしてから回し、その骨の行列だけを直す（子の骨は、使う時に親から辿って直す）
function applyWorldRot(bone, q) {
  bone.parent.updateWorldMatrix(true, false);
  const P = bone.parent.matrixWorld;
  m0.copy(P).invert().multiply(m1.makeRotationFromQuaternion(q)).multiply(P);
  q0.setFromRotationMatrix(m0);
  bone.quaternion.premultiply(q0);
  bone.updateMatrix();
  bone.matrixWorld.multiplyMatrices(P, bone.matrix);
}
// 骨の向きを変えて、その子の関節を狙いの点へ向ける（世界の座標）
function aimBone(bone, childPos, target) {
  bone.getWorldPosition(v0);
  v1.copy(childPos).sub(v0).normalize();
  v2.copy(target).sub(v0).normalize();
  if (v1.lengthSq() < 1e-8 || v2.lengthSq() < 1e-8) return;
  _wq.setFromUnitVectors(v1, v2);
  applyWorldRot(bone, _wq);
}
// 二つの骨の腕（肩・肘・手首）で手首を狙いの点へ。pole は肘を向ける向き
const _S = new THREE.Vector3();
const _E = new THREE.Vector3();
const _W = new THREE.Vector3();
const _T = new THREE.Vector3();
const _P = new THREE.Vector3();
const _E2 = new THREE.Vector3();
function ik2(upper, lower, hand, target, pole) {
  upper.getWorldPosition(_S); lower.getWorldPosition(_E); hand.getWorldPosition(_W);
  const a = _S.distanceTo(_E), b = _E.distanceTo(_W);
  _T.copy(target);
  let d = _T.distanceTo(_S);
  const maxD = (a + b) * 0.999;
  if (d > maxD) { _T.sub(_S).setLength(maxD).add(_S); d = maxD; }
  d = Math.max(d, Math.abs(a - b) + 0.01);
  // 肘の位置：肩から狙いへの線の上で、肘の出る向き（pole）へ
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const ang = Math.acos(Math.min(1, Math.max(-1, cosA)));
  const dir = v3.copy(_T).sub(_S).normalize();
  _P.copy(pole).sub(v0.copy(dir).multiplyScalar(pole.dot(dir))).normalize();
  _E2.copy(_S).add(v1.copy(dir).multiplyScalar(Math.cos(ang) * a)).add(v2.copy(_P).multiplyScalar(Math.sin(ang) * a));
  aimBone(upper, _E, _E2);
  lower.getWorldPosition(_E); hand.getWorldPosition(_W);
  aimBone(lower, _W, _T);
}

const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _tgt2 = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _dir = new THREE.Vector3();
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// 一人ぶんの動き：速さで立つ・歩く・走るを混ぜ、その上に構え・突き・受け・よろめき・倒れる・鉄砲・弓・待つ間のしぐさを骨に重ねる
// fine：近い人（草摺の揺れ）。arms：腕を武器に合わせる
// 手首・肘の捻りを分ける（下の spreadTwist）
const _twA = new THREE.Vector3();
const _twD = new THREE.Quaternion();
const _twT = new THREE.Quaternion();
const _twI = new THREE.Quaternion();
// 骨の、立ち姿からのねじれ（その骨の向き＝親から見た位置の軸まわり）を out に。小さい（約 11 度まで）時は false
function twistOf(bone, R0, out) {
  _twA.copy(bone.position).normalize();
  _twD.copy(R0.quaternion).invert().premultiply(bone.quaternion);
  const d = _twD.x * _twA.x + _twD.y * _twA.y + _twD.z * _twA.z;
  out.set(_twA.x * d, _twA.y * d, _twA.z * d, _twD.w);
  const l = Math.hypot(out.x, out.y, out.z, out.w);
  if (l < 1e-6) { out.identity(); return false; }
  out.x /= l; out.y /= l; out.z /= l; out.w /= l;
  if (out.w < 0) { out.x = -out.x; out.y = -out.y; out.z = -out.z; out.w = -out.w; }
  return out.w <= 0.995;
}
// 捻りの骨（tools/mhbody.mjs：二の腕と前腕の中ほど。皮の先の半分が付く）がある体：
//   手の捻り（前腕から見て）の半分を前腕の中ほどへ、前腕の捻り（二の腕から見て。腕を狙いへ向けた時に出る）の半分を二の腕の中ほどへ。
//   骨の向き・手の位置は変えず、皮だけが肘から手首まで少しずつ捻れる（本物の前腕の、橈骨が尺骨の上を回る捻れ）
function spreadTwist(B, sd) {
  const T = SRC.template && SRC.template.bones;
  if (!T) return;
  const H = B[sd + 'Hand'], F = B[sd + 'ForeArm'], FT = B[sd + 'ForeArmTwist'], AT = B[sd + 'ArmTwist'];
  if (!H || !F) return;
  if (FT && AT && T[sd + 'Hand'] && T[sd + 'ForeArm']) {
    twistOf(H, T[sd + 'Hand'], _twT); FT.quaternion.copy(_twI).slerp(_twT, 0.5);
    twistOf(F, T[sd + 'ForeArm'], _twT); AT.quaternion.copy(_twI).slerp(_twT, 0.5);
    FT.updateMatrix(); AT.updateMatrix();
    return;
  }
  // 捻りの骨の無い体（見本の体）：手の捻りの半分を前腕の骨へ移す（前腕の骨は録った動き（mixer）が毎コマ置き直すので、積み重ならない）
  const R0 = T[sd + 'Hand'];
  if (!R0 || !twistOf(H, R0, _twT)) return;
  _twT.slerp(_twI, 0.5);
  F.quaternion.multiply(_twT);
  H.quaternion.premultiply(_twT.invert());
  F.updateMatrix(); H.updateMatrix();
}

export { rotWorld, applyWorldRot, aimBone, _T, _P, ik2, _up, _right, _fwd, _tgt, _tgt2, _pole, _dir, clamp01, ease, spreadTwist };
