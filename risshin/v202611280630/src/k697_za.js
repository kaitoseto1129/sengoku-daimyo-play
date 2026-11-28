// K697 手順5：座る人（K697 の体に小袖・袴を着せた人＝h.k697z）の小さな動きと持ち物。
//   息（胸の上下）と首（見回し）は今の作り（humans_motion.js vitals・lookAround）がそのまま K697 の骨に効く。ここは扇だけ。
//   正座の客は閉じた扇を膝の前の畳へ横に置く（茶の湯の作法）。胡坐の上様・床几の人は右手に閉じた扇を持ち、ときどき膝を軽く打つ。
//   形と材質は全員で一つ（毎コマ new しない）。描くのは座っていて近い人だけ。
import * as THREE from 'three';
import { sitWeight } from './humans_motion.js';
import { rotWorld, _right } from './humans_pose.js';

// 座る姿勢の直し（腕を膝へ置く前に呼ぶ）：K697 の体は首の骨が前へ 25° 傾いた作り（MakeHuman の首）なのに、録った動きは見本の骨（首がほぼ真っ直ぐ）の回りを書くので、
//   座って背を立てると首が後ろへ反り、顎を上げて天井を見る顔になった（本能寺の茶会で胴 -5°・首 0°・頭 -6°）。座る間だけ胴を少し起こし、首を前へ戻して目を少し伏せる
//   _right は humans_animate.js がこの人の向きで入れた物
export function zaPose(h, B) {
  const u = h.u, j = u.jinchu;
  if (!h.k697z || !j || j.standing || !u.alive || u.mounted || !B.Neck || !B.Spine1) return;
  const s = j.seiza || j.agura ? sitWeight(u) : (u.idl ? u.idl.sit : 0);
  if (s < 0.05) return;
  rotWorld(B.Spine1, _right, -0.08 * s);   // _right の回りは正で後ろへ反る（測った）
  rotWorld(B.Neck, _right, -0.12 * s);   // 頭の頂が前へ 8° ほど（目を少し伏せる）
}
let FAN = null;
function fanParts() {
  if (FAN) return FAN;
  // 閉じた扇（長さ 27cm・幅 2.6cm・厚み 1.4cm。黒漆の親骨に挟まれた地紙の縁）。要の側を少し細く
  const g = new THREE.BoxGeometry(0.026, 0.014, 0.27, 1, 1, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z < 0) p.setX(i, p.getX(i) * (0.62 + 0.38 * (1 + z / 0.135))); }
  g.computeVertexNormals();
  g.translate(0, 0, 0.11);   // 要（根元）を手の中に
  FAN = { g, m: new THREE.MeshStandardMaterial({ color: 0x241c16, roughness: 0.42, metalness: 0.05 }) };
  return FAN;
}
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
const _z = new THREE.Vector3(0, 0, 1), _up = new THREE.Vector3(0, 1, 0);
export function zaFan(h, B, dt) {
  const u = h.u;
  if (!h.k697z) return;
  const j = u.jinchu;
  const s = j && !j.standing ? (j.seiza || j.agura ? sitWeight(u) : (u.idl ? u.idl.sit : 0)) : 0;
  let f = h.parts.zaFan;
  if (s < 0.6 || h.far || !u.alive || u.mounted || u.wpn && u.wpn.visible !== false && u.wpnKind && u.wpnKind !== 'none') { if (f) f.visible = false; return; }
  if (!f) {
    const F = fanParts();
    f = new THREE.Mesh(F.g, F.m); f.castShadow = true; f.name = 'zaFan'; f.userData.noDefer = true;
    h.root.add(f); h.parts.zaFan = f;
  }
  f.visible = true;
  h.root.updateWorldMatrix(true, false);
  if (j.seiza) {
    // 膝の前の畳に、体の向きと直角に寝かせる
    _f.set(Math.sin(u.heading || 0), 0, Math.cos(u.heading || 0));
    // 畳の面は膝の骨から（sitLegs が膝の節を床の 0.07m 上に置く。u.pos.y は広間の床の下の地面で、そこに置くと畳の下に隠れた）
    let fy = u.pos.y + 0.075;   // 本能寺の広間の畳は地面（u.pos.y）より 5cm ほど上
    if (B.LeftLeg && B.RightLeg) { B.LeftLeg.getWorldPosition(_a); let ky = _a.y; B.RightLeg.getWorldPosition(_a); ky = Math.min(ky, _a.y) - 0.07 + 0.012; fy = Math.max(fy, ky); }   // 膝の節は畳へ少し沈むので、地面＋3cm より下には置かない（畳の下に隠れた）
    _p.set(u.pos.x + _f.x * 0.62, fy, u.pos.z + _f.z * 0.62);   // 袴の裾（膝の前 0.5m ほどまで広がる）の外
    _d.set(_f.z, 0, -_f.x);   // 横
    _q.setFromUnitVectors(_z, _d);
    _p.addScaledVector(_d, -0.11);
  } else {
    // 右手に持つ：手首から指先への向きへ扇を通す。ときどき膝を軽く打つ（四秒ほどに一度・小さく）
    const hb = B.RightHand, tip = B.RightHandMiddle1 || B.RightHandIndex1;
    if (!hb) { f.visible = false; return; }
    hb.getWorldPosition(_p);
    if (tip) tip.getWorldPosition(_a); else { B.RightForeArm.getWorldPosition(_a); _a.sub(_p).negate().add(_p); }
    _d.copy(_a).sub(_p).normalize();
    h.zaT = (h.zaT ?? h.seed * 9) + dt;
    const tap = Math.max(0, Math.sin(h.zaT * 1.6)) ** 6 * 0.35;
    _a.crossVectors(_d, _up); if (_a.lengthSq() < 1e-4) _a.set(1, 0, 0); _a.normalize();
    _d.applyAxisAngle(_a, -0.25 - tap);
    _q.setFromUnitVectors(_z, _d);
    _p.addScaledVector(_d, 0.02);
  }
  // 根元（h.root）の座標へ：子の世界の行列＝根元の行列 × 子の行列 なので、根元の逆を掛ける（根元の大きさ・裏返しもそのまま打ち消す）
  _m.compose(_p, _q, _s);
  _mi.copy(h.root.matrixWorld).invert();
  // 行列を直に書く作り（matrixAutoUpdate=false）では人の根元の行列の更新（humans_lifecycle.js skipHiddenMW）と噛み合わず描かれなかったので、
  //   根元の座標の位置・向き・大きさに分けて渡す（根元の大きさの打ち消しも scale に入る）
  _mi.multiply(_m).decompose(f.position, f.quaternion, f.scale);
}
