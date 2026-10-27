// 人の処理：装備の動き。外部向けの入口は humans.js。
import * as THREE from 'three';
import { applyWorldRot, ik2, clamp01 } from './humans_pose.js';

// 一人称で手を見える所へ寄せる量 [上へ, 前へ]（体の座標）。目から前へ 0.5m より近ければ前へ、目から約十六度より下なら上へ
const _fl = [0, 0];
// 武器の上の二点 a→b（武器の座標）を世界へ移し、肩から腕の長さで届く所まで a を b の方へ寄せる（結果は a に入る）
const _frS = new THREE.Vector3();
const _frE = new THREE.Vector3();
const _frH = new THREE.Vector3();
function fpReach(B, sd, a, b, gw) {
  gw.localToWorld(a); gw.localToWorld(b);
  B[sd + 'Arm'].getWorldPosition(_frS); B[sd + 'ForeArm'].getWorldPosition(_frE); B[sd + 'Hand'].getWorldPosition(_frH);
  const reach = (_frS.distanceTo(_frE) + _frE.distanceTo(_frH)) * 0.97;
  for (let i = 0; i < 8 && a.distanceTo(_frS) > reach; i++) a.lerp(b, 0.25);
  return a;
}
function fpLift(y, z, eyeY, k, capY = 0.34, capZ = 0.4) {
  const dz = Math.min(capZ, Math.max(0, 0.5 - (z - 0.1)));
  const ahead = z + dz - 0.1, drop = eyeY - y;
  const dy = Math.min(capY, Math.max(0, drop - 0.28 * ahead) * 0.9);
  _fl[0] = dy * k; _fl[1] = dz * k;
  return _fl;
}
// 一人称の本人：手のひらの真ん中を柄に当て、指が柄に巻き付く向きに手首を回す（柄が拳の中を通る。指が開いたまま・柄を貫く・隙間を作らない）
// axis：柄の先の向き（人差し指の側）。fing：指の付け根を向けたい向き（柄に直角へならす）。kf：前腕の向きとの混ぜ（0 で fing のまま）
const _gga = new THREE.Vector3();
const _ggf = new THREE.Vector3();
const _ggn = new THREE.Vector3();
const _ggw = new THREE.Vector3();
const _ggm = new THREE.Vector3();
const _ggp = new THREE.Vector3();
const _ggta = new THREE.Vector3();
const _ggtf = new THREE.Vector3();
const _ggtn = new THREE.Vector3();
const _ggpole = new THREE.Vector3();
const _ggm0 = new THREE.Matrix4();
const _ggm1 = new THREE.Matrix4();
const _ggq = new THREE.Quaternion();
let _ggs = 1;
// 手の今の向き：f 手首→中指の付け根、a 人差し指の付け根→小指の付け根、n 手のひらの側。手首は _ggw、返すのは手のひらの長さ
function handFrame(B, sd, f, a, n) {
  B[sd + 'Hand'].getWorldPosition(_ggw);
  B[sd + 'HandMiddle1'].getWorldPosition(_ggm);
  f.copy(_ggm).sub(_ggw); const L = f.length() || 1e-4; f.multiplyScalar(1 / L);
  B[sd + 'HandPinky1'].getWorldPosition(a); B[sd + 'HandIndex1'].getWorldPosition(_ggp); a.sub(_ggp); a.addScaledVector(f, -a.dot(f)).normalize();
  n.crossVectors(f, a);
  // 手のひらの側＝曲げた中指の先のある側
  B[sd + 'HandMiddle3'].getWorldPosition(_ggp); _ggp.sub(_ggm);
  _ggs = _ggp.dot(n) < 0 ? -1 : 1;
  n.multiplyScalar(_ggs);
  return L;
}
function gripHand(B, sd, P, axis, fing, kf, pole) {
  const H = B[sd + 'Hand'];
  if (!B[sd + 'HandPinky1'] || !B[sd + 'HandIndex1'] || !B[sd + 'HandMiddle3']) return;
  _ggpole.copy(pole);
  for (let it = 0; it < 2; it++) {
    const L = handFrame(B, sd, _ggf, _gga, _ggn);
    _ggta.copy(axis).negate();
    // 指の向き：前腕の向き（今の f）と望む向きを混ぜ、柄に直角へ
    _ggtf.copy(fing).lerp(_ggf, kf);
    _ggtf.addScaledVector(_ggta, -_ggtf.dot(_ggta));
    if (_ggtf.lengthSq() < 1e-6) return;
    _ggtf.normalize();
    _ggtn.crossVectors(_ggtf, _ggta).multiplyScalar(_ggs);
    _ggm0.makeBasis(_ggf, _gga, _ggn).transpose();
    _ggm1.makeBasis(_ggtf, _ggta, _ggtn).multiply(_ggm0);
    _ggq.setFromRotationMatrix(_ggm1);
    applyWorldRot(H, _ggq);
    if (it === 1) break;
    // 手のひらの真ん中（指の付け根の少し手前、手のひらの側へ柄の太さだけ）が柄の点に来るよう、手首を動かす
    _ggp.copy(_ggw).addScaledVector(_ggtf, L * 0.8).addScaledVector(_ggtn, L * 0.3);
    _ggp.subVectors(P, _ggp).add(_ggw);
    ik2(B[sd + 'Arm'], B[sd + 'ForeArm'], H, _ggp, _ggpole);
  }
}

// 弓の手（u.hand）：引く間は顔の前、終われば脇へ戻す
function bowHold(h, dt) {
  const u = h.u, hd = u.hand;
  if (!h.bow0) h.bow0 = { x: hd.position.x, y: hd.position.y, z: hd.position.z };
  const drawing = u.atk && u.atk.ranged;
  const want = drawing ? 1 - clamp01(u.atk.t / Math.max(0.2, u.windup || 0.5)) : 0;
  // 構えて打ち起こし（手を上げる）→ 引き分け（弦を引く）
  h.bowUp = (h.bowUp || 0) + ((drawing ? 1 : 0) - (h.bowUp || 0)) * Math.min(1, dt * (drawing ? 6 : 3));
  h.bowK = (h.bowK || 0) + (want * h.bowUp - (h.bowK || 0)) * Math.min(1, dt * 10);
  if (!drawing && h.bowUp < 0.01 && !h.bowMoved) return;
  const k = h.bowUp, o = h.bow0;
  hd.position.set(o.x + (-0.02 - o.x) * k, o.y + (1.45 - o.y) * k, o.z + (0.5 - o.z) * k);
  hd.rotation.z = 0.12 * k;
  h.bowMoved = k > 0.01;
}

export { fpReach, fpLift, _ggw, handFrame, gripHand, bowHold };
