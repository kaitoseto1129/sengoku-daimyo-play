// 本物の馬（洋種の形）を、日本の在来馬（小柄でずんぐり・脚が太く短い・首が太く短い・頭が大きい）の体つきに組み直す（読み込みの時に一度だけ）。
// 骨ごとに「骨の向き（y）の長さ」と「太さ（x・z）」の倍率を決め、縛りの形の頂点・骨の立ち姿・録った動きの位置の線を同じ倍率で直す。
// 脚を縮めた分だけ胴を下げ、全体を少し大きくして鞍の高さ（乗り手の腰）を元の所に保つ。毎コマの仕事は増えない（kaito 11/1 騎馬武者の手本 ref7_kiba）
// 組み直した後は、骨の立ち姿をそのまま縛りの姿にする（元の縛りの行列は鎖でたどると崩れる骨があるので使わない）
import * as THREE from 'three';

// 倍率：[長さ, 太さ]。脚は前腕・脛から下を短く太く、首は短く太く、胴は詰める
const FRONT = ['BN_L_UpperArm', 'BN_l_Forearm', 'BN_L_Hand', 'BN_R_UpperArm', 'BN_R_Forearm', 'BN_R_Hand'];
const HIND = ['BN_L_Calf', 'BN_L_HorseLink', 'BN_L_Foot', 'BN_R_Calf', 'BN_R_HorseLink', 'BN_R_Foot'];
const SHAPE = {
  // 組み直しは止める：馬は 9/29 の形（kaito 11/3「馬も9月に乗ってた馬を使おう」）。true にすると在来馬の体つきへ
  on: false,
  // 木曽馬（体高 雌133・雄136cm、短足胴長・体幅広め・後肢の蹄は外向き。docs/horse_ref_1102.md）に寄せた値（11/2）
  drop: 0.24,          // 脚を縮める高さ（m、大きくする前）
  legThick: 1.3,      // 脚の太さ
  neck: [0.78, 1.16],  // 首（短く太く）
  spine: [0.9, 1.07],  // 胴（背の骨の向きを詰め、腹を太く）
  head: 1.08,          // 頭（在来馬は体に比べて頭が大きい）
};
const isFront = (n) => FRONT.some((p) => n.startsWith(p));
const isHind = (n) => HIND.some((p) => n.startsWith(p));
const isLeg = (n) => isFront(n) || isHind(n);

// gl：読んだ glTF。sc は根元の m の入れ物（holder）に入れ、行列を更新してから呼ぶ。
// 戻り値：local(骨の名) … 馬具を骨と一緒に組み直す、骨の中の倍率の行列
function reshapeHorse(gl) {
  if (!SHAPE.on) return null;
  const sc = gl.scene;
  const bones = [];
  sc.traverse((o) => { if (o.isBone) bones.push(o); });
  const byName = new Map(bones.map((b) => [b.name, b]));
  const find = (p) => bones.find((b) => b.name.startsWith(p));
  const R = new Map(bones.map((b) => [b, b.matrixWorld.clone()]));   // 立ち姿の骨の行列（根元の m）
  const wy = (p) => { const b = find(p); return b ? new THREE.Vector3().setFromMatrixPosition(R.get(b)).y : null; };
  // 脚ごとの、縮める所の高さ
  const vert = (names) => { let s = 0; for (let i = 0; i + 1 < names.length; i++) { const a = wy(names[i]), b = wy(names[i + 1]); if (a == null || b == null) return 0; s += Math.abs(a - b); } return s; };
  const vf = vert(['BN_L_UpperArm', 'BN_l_Forearm', 'BN_L_Hand', 'BN_L_Toe_042']);
  const vh = vert(['BN_L_Calf', 'BN_L_HorseLink', 'BN_L_Foot', 'BN_L_Toe_2']);
  const drop = SHAPE.drop;
  const seatY = wy('BN_Spine_01');
  if (!(vf > drop * 2 && vh > drop * 2 && seatY > drop * 2)) return null;
  const kF = 1 - drop / vf, kH = 1 - drop / vh;
  const s = seatY / (seatY - drop);   // 鞍の骨の高さを保つ全体の倍率
  // 骨ごとの倍率（骨の向き＝y）
  const D = new Map();
  for (const b of bones) {
    const n = b.name;
    let along = 1, cross = 1;
    if (isFront(n)) { along = kF; cross = SHAPE.legThick; }
    else if (isHind(n)) { along = kH; cross = SHAPE.legThick; }
    else if (/^BN_Neck_0[0-3]_/.test(n)) [along, cross] = SHAPE.neck;
    else if (/^BN_(Spine_0[0-3]|Pelvis)_/.test(n)) [along, cross] = SHAPE.spine;
    for (let p = b; p && p.isBone; p = p.parent) if (p.name.startsWith('BN_Head_00')) { along = cross = SHAPE.head; break; }
    D.set(b, new THREE.Vector3(cross * s, along * s, cross * s));
  }
  // 骨の立ち姿を組み直す：位置は親の倍率で、背の根は下げる
  const spine0 = find('BN_Spine_00');
  const par0 = spine0.parent;
  const dropL = new THREE.Vector3(0, -drop * s, 0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(par0.matrixWorld).invert());
  const fixPos = (b, v) => { const d = b.parent && D.get(b.parent); if (d) v.multiply(d); if (b === spine0) v.add(dropL); };
  for (const b of bones) fixPos(b, b.position);
  let top = sc; while (top.parent) top = top.parent;
  top.updateMatrixWorld(true);
  const R2 = new Map(bones.map((b) => [b, b.matrixWorld.clone()]));
  // 録った動きの位置の線も同じく
  for (const clip of gl.animations) for (const tr of clip.tracks) {
    if (!tr.name.endsWith('.position')) continue;
    const b = byName.get(tr.name.slice(0, -9)); if (!b) continue;
    const v = tr.values, t = new THREE.Vector3();
    for (let k = 0; k < v.length; k += 3) { t.fromArray(v, k); fixPos(b, t); t.toArray(v, k); }
  }
  // 頂点：立ち姿で骨の中の座標に直し、倍率を掛けて新しい骨へ。脚の太さは付け根から骨の三割までに少しずつ（胴との境目を膨らませない）
  const segLen = new Map(bones.map((b) => { const c = b.children.find((x) => x.isBone); return [b, c ? c.position.length() / (D.get(b)?.y || 1) : 0]; }));
  const done = new Set();
  const meshes = [];
  sc.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const o of meshes) {
    const SK = o.skeleton, Mw = o.matrixWorld.clone(), MwI = Mw.clone().invert();
    if (!done.has(o.geometry)) {
      done.add(o.geometry);
      const g = o.geometry, pa = g.attributes.position, na = g.attributes.normal, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
      const bind = o.bindMatrix;
      // 骨ごとの、元の頂点 → 骨の中の座標（立ち姿）・倍率の後 → 新しい根元の m
      const toLocal = SK.bones.map((b, i) => new THREE.Matrix4().copy(R.get(b) || new THREE.Matrix4()).multiply(SK.boneInverses[i]).multiply(bind));
      const loc = SK.bones.map((b, i) => new THREE.Matrix4().copy(R.get(b) || new THREE.Matrix4()).invert().multiply(toLocal[i]));
      const NM = SK.bones.map((b, i) => { const d = D.get(b) || new THREE.Vector3(1, 1, 1); return new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().copy(R2.get(b) || new THREE.Matrix4()).multiply(new THREE.Matrix4().makeScale(d.x, d.y, d.z)).multiply(loc[i])).invert().transpose(); });
      const p = new THREE.Vector3(), r = new THREE.Vector3(), np = new THREE.Vector3(), nn = new THREE.Vector3(), no = new THREE.Vector3();
      for (let k = 0; k < pa.count; k++) {
        np.set(0, 0, 0); no.set(0, 0, 0);
        p.fromBufferAttribute(pa, k);
        if (na) nn.fromBufferAttribute(na, k);
        for (let c = 0; c < 4; c++) {
          const w = SW.getComponent(k, c); if (w <= 0) continue;
          const bi = SI.getComponent(k, c), b = SK.bones[bi]; if (!b) continue;
          const d = D.get(b) || new THREE.Vector3(1, 1, 1), ln = segLen.get(b) || 0;
          r.copy(p).applyMatrix4(loc[bi]);
          let cx = d.x;
          if (ln > 0 && /UpperArm|Calf/.test(b.name) && isLeg(b.name)) cx = s * (1 + (SHAPE.legThick - 1) * THREE.MathUtils.smoothstep(r.y, 0, ln * 0.35));
          r.set(r.x * cx, r.y * d.y, r.z * cx).applyMatrix4(R2.get(b));
          np.addScaledVector(r, w);
          if (na) no.addScaledVector(r.copy(nn).applyMatrix3(NM[bi]), w);
        }
        np.applyMatrix4(MwI); pa.setXYZ(k, np.x, np.y, np.z);
        if (na) { no.transformDirection(MwI); na.setXYZ(k, no.x, no.y, no.z); }
      }
      pa.needsUpdate = true; if (na) na.needsUpdate = true;
      g.computeBoundingSphere(); g.computeBoundingBox();
    }
    // 新しい縛り：立ち姿の骨で、頂点は形の置き場（Mw）の中
    o.bindMatrix.identity(); o.bindMatrixInverse.identity();
    SK.boneInverses = SK.bones.map((b) => new THREE.Matrix4().copy(R2.get(b) || new THREE.Matrix4()).invert().multiply(Mw));
  }
  const local = (nm) => { const d = D.get(byName.get(nm)); return d ? new THREE.Matrix4().makeScale(d.x, d.y, d.z) : new THREE.Matrix4(); };
  return { s, kF, kH, drop, local };
}

export { reshapeHorse, SHAPE };
