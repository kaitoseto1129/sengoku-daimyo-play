import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { jinkeiSlot } from './jinkei.js';
import { TIER } from './device_tier.js';

// 隊ごとに替えるのは兵の並びだけ。弱い端末では頂点と面番号を共有し、
// 見回しで新しい隊を作る時も、描画装置から形を読み戻して複製しない。
export function armyGeometryCopy(base) {
  if (!TIER.weak) return base.clone();
  const g = new THREE.BufferGeometry();
  g.name = base.name;
  g.index = base.index;
  g.attributes = { ...base.attributes };
  g.morphAttributes = { ...base.morphAttributes };
  g.morphTargetsRelative = base.morphTargetsRelative;
  g.groups = base.groups.map((group) => ({ ...group }));
  g.drawRange = { ...base.drawRange };
  g.boundingBox = base.boundingBox ? base.boundingBox.clone() : null;
  g.boundingSphere = base.boundingSphere ? base.boundingSphere.clone() : null;
  g.userData = { ...base.userData };
  return g;
}

// 形の部品に色と部品の番号を付ける
// 形は頂点を分け合う形（index 付き）のまま束ねる：三角ごとに頂点を分けると、描くたびの頂点の計算（高さの絵の読み取り・揺れ）が三倍ほどになる
function armyPart(list, geo, hex, part) {
  const g = geo;
  if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
  // 笠や槍先の先端では、別の頂点番号が同じ位置を指す。
  // 同じ部品の同じ位置は動かしても重なるため、その三角だけ設営時に外す。
  // 細い穂先や、動くと面積を持つ可能性のある一直線の三角は残す。
  const position = g.attributes.position, indices = g.index;
  const same = (a, b) => position.getX(a) === position.getX(b)
    && position.getY(a) === position.getY(b) && position.getZ(a) === position.getZ(b);
  const kept = [];
  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
    if (!same(a, b) && !same(b, c) && !same(c, a)) kept.push(a, b, c);
  }
  if (kept.length !== indices.count) g.setIndex(kept);
  const n = g.attributes.position.count, c = new THREE.Color(hex);
  const col = new Float32Array(n * 3), pa = new Float32Array(n).fill(part);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(pa, 1));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  list.push(g);
}
// 兵一人の形（near は近くで見る少人数向けに角を増やす）
const SOLDIER_GEO = new Map();
// near：true＝近く（十角）・false＝中ほど（七角）・'lo'＝遠く（五角。38m より遠い塊だけに使う＝lodTwin）
// 画質「低」（携帯）では、軽い大軍（遠くの軍勢・後詰め・合戦の後ろの列）の描く人数を半分ほどに（大事な者と前の列は残る）
//   遠いほど多く間引く（60m 内は半分ほど・150m 内は四分の一・その先は六分の一ほど）。back：後詰め（奥の列）はさらに七割
const lowKeep = (dd = 100, back = false) => (1);
// 三方ヶ原の前線は列の密度を保つ。百十メートルの外だけ、霞に合わせて奥の列を減らす。
const frontKeep = (def, dd, back = false) => def.denseFront ? 1 + (lowKeep(dd, back) - 1) * Math.max(0, Math.min(1, (dd - 110) / 80)) : lowKeep(dd, back);
// 束全体の範囲で画面外を判定する。旗・槍・押し出しと、逃げる動きの余裕を残す。
// 範囲は人数を絞る前に記録し、毎コマの形・行列の作り直しを避ける。
function armyViewTest(mesh, extra = null) {
  mesh.computeBoundingSphere();
  const bounds = mesh.boundingSphere.clone(), sphere = new THREE.Sphere();
  if (extra) for (const part of extra) {
    part.computeBoundingSphere();
    bounds.union(part.boundingSphere);
  }
  const frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
  return (cam, padding = 48) => {
    // 全画質で、画面の外（余裕つき）の隊を描かない（高でも見えない大軍の三角を数えない）
    projection.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    sphere.copy(bounds); sphere.radius += padding;
    sphere.applyMatrix4(mesh.matrixWorld);
    return !frustum.intersectsSphere(sphere);
  };
}
function soldierGeo(armor, near) {
  if (near === 'xlo' || near === 'xxlo' || near === 'x3lo' || near === 'x4lo') return soldierGeoX(armor, near === 'x4lo' ? 4 : near === 'x3lo' ? 3 : near === 'xxlo');
  const lo = near === 'lo';
  if (lo) near = false;
  const key = armor + (near ? 'n' : lo ? 'l' : 'f');
  if (SOLDIER_GEO.has(key)) return SOLDIER_GEO.get(key);
  // 角の少ない筒は遠目でも四角い箱に見えるので、遠い形でも六角より上にする（近くは十角）。肩は箱でなく曲げた板、頭は丸
  // 中くらいの遠さ（14〜80m）でも人の形に見えるよう、遠い形も七角で蓋を閉じる（棒の束に見えないように）
  const P = [], s = near ? 10 : lo ? 5 : 7, s2 = lo ? 6 : s + 2, sp = lo ? 4 : s;
  const arm = new THREE.Color(armor), dark = arm.clone().multiplyScalar(0.72).getHex(), lite = arm.clone().lerp(new THREE.Color(0x8a8070), 0.18).getHex();
  const cyl = (rt, rb, h, seg, x, y, z) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, false); g.translate(x, y, z); return g; };
  // 脚：袴の腿（ふくらむ）・脚絆の脛（細い）・足
  for (const [sx, pt] of [[-0.11, 8], [0.11, 9]]) {
    armyPart(P, cyl(0.085, 0.07, 0.4, s, sx, 0.62, 0), 0x4c4438, pt);
    armyPart(P, cyl(0.062, 0.05, 0.42, s, sx, 0.23, 0), 0x403a30, pt);
    const ft = new THREE.SphereGeometry(0.055, sp, lo ? 2 : 3); ft.scale(1, 0.5, 1.8); ft.translate(sx, 0.03, 0.05); armyPart(P, ft, 0x3a3228, pt);
  }
  // 草摺（腰の裾）と胴。胴は少し平たく、胸から腰へ絞る
  // 近い軽い兵も草摺の重なりを持つ。共用する形だけに段を刻み、描く回数は増やさない。
  const skirt = near ? new THREE.LatheGeometry([
    new THREE.Vector2(0.27, 0.73), new THREE.Vector2(0.246, 0.83),
    new THREE.Vector2(0.257, 0.83), new THREE.Vector2(0.222, 0.94),
    new THREE.Vector2(0.233, 0.94), new THREE.Vector2(0.19, 1.07),
  ], s2) : cyl(0.19, 0.27, 0.34, s2, 0, 0.9, 0);
  skirt.scale(1, 1, 0.8); armyPart(P, skirt, dark, 0);
  const dou = cyl(0.21, 0.175, 0.5, s2, 0, 1.33, 0); dou.scale(1, 1, 0.9); armyPart(P, dou, armor, 0);
  // 肩の丸み（胴の上を閉じる）と首
  const sh = new THREE.SphereGeometry(0.21, s2, lo ? 2 : 4, 0, Math.PI * 2, 0, Math.PI / 2); sh.scale(1, 0.4, 0.74); sh.translate(0, 1.57, 0); armyPart(P, sh, armor, 0);
  armyPart(P, cyl(0.05, 0.055, 0.1, s, 0, 1.63, 0.01), 0x8a6a4e, 0);
  // 袖（肩の板）：肩の丸みに沿って垂れる曲げた板（箱にしない）
  for (const sx of [-1, 1]) {
    const b = new THREE.CylinderGeometry(0.13, 0.15, 0.26, near ? 8 : lo ? 4 : 5, 1, true, sx > 0 ? -Math.PI * 0.1 : Math.PI * 0.9, Math.PI * 1.2);
    b.scale(0.75, 1, 1); b.rotateZ(sx * 0.2); b.translate(sx * 0.22, 1.43, 0); armyPart(P, b, lite, 0);
  }
  // 腕（小袖の袖）と手：左は垂らし、右は得物を持って少し前へ
  const la = cyl(0.05, 0.042, 0.5, s, -0.29, 1.2, 0.02); armyPart(P, la, 0x47526c, 0);
  const lh = new THREE.SphereGeometry(0.042, sp, lo ? 2 : 3); lh.translate(-0.29, 0.93, 0.03); armyPart(P, lh, 0x8a6a4e, 0);
  const ra = cyl(0.05, 0.042, 0.5, s, 0, 0, 0); ra.rotateX(-0.45); ra.translate(0.29, 1.2, 0.08); armyPart(P, ra, 0x47526c, 0);
  const rh = new THREE.SphereGeometry(0.042, sp, lo ? 2 : 3); rh.translate(0.29, 0.97, 0.19); armyPart(P, rh, 0x8a6a4e, 0);
  // 頭（顔の色）：いつも丸く
  const head = new THREE.SphereGeometry(0.105, near ? 10 : lo ? 6 : 7, near ? 7 : lo ? 4 : 5); head.scale(0.95, 1.12, 1); head.translate(0, 1.72, 0.01); armyPart(P, head, 0x7a5c46, 0);
  if (near) {
    const nose = new THREE.ConeGeometry(0.023, 0.055, 3); nose.rotateX(Math.PI / 2); nose.translate(0, 1.72, 0.11); armyPart(P, nose, 0xb18a68, 0);
    for (const x of [-0.04, 0.04]) { const eye = new THREE.BoxGeometry(0.025, 0.009, 0.005); eye.translate(x, 1.75, 0.102); armyPart(P, eye, 0x30231b, 0); }
  }
  // 威糸は胴の頂点の色で描く。部品と描く回数を増やさない。
  {
    const colors = dou.attributes.color, positions = dou.attributes.position, lace = new THREE.Color(lite);
    for (let i = 0; i < positions.count; i++) if (positions.getY(i) > 1.55) colors.setXYZ(i, lace.r, lace.g, lace.b);
  }
  // 陣笠（なだらかに反った笠）
  const kp = [[0.0, 0.13], [0.08, 0.115], [0.2, 0.07], [0.3, 0.02], [0.33, 0.0]].map(([r, y]) => new THREE.Vector2(r, y));
  const kasa = new THREE.LatheGeometry(lo ? [kp[0], kp[2], kp[4]] : kp, near ? 14 : lo ? 6 : 8); kasa.translate(0, 1.76, 0); armyPart(P, kasa, 0x2c261e, 1);
  const kb = new THREE.CylinderGeometry(0.33, 0.33, 0.012, near ? 14 : lo ? 6 : 8, 1, true); kb.translate(0, 1.757, 0); armyPart(P, kb, 0x1e1a14, 1);
  // 兜：鉢と、下へ広がる錣。近くでは金の前立
  const hachi = new THREE.SphereGeometry(0.14, near ? 10 : lo ? 5 : 7, near ? 5 : lo ? 2 : 3, 0, Math.PI * 2, 0, Math.PI / 2); hachi.translate(0, 1.75, 0); armyPart(P, hachi, 0x1c1a18, 2);
  const shikoro = new THREE.CylinderGeometry(0.15, 0.24, 0.12, near ? 12 : lo ? 5 : 7, 1, true, Math.PI * 0.3, Math.PI * 1.4); shikoro.translate(0, 1.72, -0.02); armyPart(P, shikoro, 0x24201c, 2);
  if (near) { for (const sd of [-1, 1]) { const md = new THREE.BoxGeometry(0.03, 0.16, 0.008); md.rotateZ(-sd * 0.35); md.translate(sd * 0.05, 1.93, 0.13); armyPart(P, md, 0xb08a3a, 2); } }
  // 背の指物の竿
  armyPart(P, cyl(0.012, 0.012, 1.4, 3, 0, 1.95, -0.17), 0x2f2419, 10);
  // 槍（長さは人ごとに伸ばす）と穂先
  armyPart(P, cyl(0.016, 0.02, 4.3, 3, 0.3, 2.1, 0.14), 0x3b2a1a, 3);
  const ho = new THREE.ConeGeometry(0.028, 0.3, 3); ho.translate(0.3, 4.4, 0.14); armyPart(P, ho, 0x9a9a98, 3);
  // 鉄砲：右の肩に担ぐ
  const gun = cyl(0.025, 0.03, 1.3, 3, 0, 0, 0); gun.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.85, -0.5).normalize())); gun.translate(0.22, 1.1 + 0.55, 0.15 - 0.33); armyPart(P, gun, 0x3a2a1a, 4);
  // 弓と、背の箙
  const bow = cyl(0.012, 0.012, 2.1, 3, 0, 0, 0); bow.rotateZ(0.12); bow.translate(-0.32, 1.25, 0.08); armyPart(P, bow, 0x4a3020, 5);
  const ebira = new THREE.BoxGeometry(0.1, 0.5, 0.1); ebira.rotateZ(-0.3); ebira.translate(0.14, 1.35, -0.2); armyPart(P, ebira, 0x3a2a1a, 5);
  // 幟の竿と横木（旗持ち）
  armyPart(P, cyl(0.028, 0.034, 5.4, 4, 0.3, 2.6, 0.14), 0x2f2419, 6);
  const bar = cyl(0.018, 0.018, 0.8, 3, 0, 0, 0); bar.rotateZ(Math.PI / 2); bar.translate(0.7, 5.22, 0.14); armyPart(P, bar, 0x2f2419, 6);
  if (near) {
    for (const x of [0.32, 0.62, 0.96]) armyPart(P, cyl(0.024, 0.024, 0.08, 4, x, 5.18, 0.14), 0x78684c, 6);
  }
  const g = mergeGeometries(P);
  g.computeBoundingSphere();
  SOLDIER_GEO.set(key, g);
  return g;
}
// とても遠い兵（塊のいちばん近い端が 50m より先。背丈が画面の 3% ほど）の形：部品の分け方（aPart）と置き場は同じで、角を三つ〜六つに。
//   脚は腿と脛を一本の筒に、胴は草摺から肩まで一本の筒に。一人 160 面ほど（遠い形の三分の一）
//   xx：さらに遠い兵（100m より先。背丈が十数画素）の形。腕・袖・穂先・横木を省き、胴は四角の筒に（一人 80 面ほど）
function soldierGeoX(armor, xx = false) {
  const key = armor + (xx === 4 ? 'x4' : xx === 3 ? 'x3' : xx ? 'xx' : 'x');
  if (SOLDIER_GEO.has(key)) return SOLDIER_GEO.get(key);
  if (xx === 4) {
    // 高の、とても遠い塊（120m ほど先。人の背丈が八画素ほど）：74 面 → 45 面ほど。脚・胴（草摺と一つの筒）・頭・笠と兜・槍と背の旗の竿
    const P4 = [], a4 = new THREE.Color(armor);
    const cy = (rt, rb, h, seg, x, y, z) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, true); g.translate(x, y, z); return g; };
    for (const [sx, pt] of [[-0.11, 8], [0.11, 9]]) armyPart(P4, cy(0.08, 0.055, 0.82, 3, sx, 0.41, 0), 0x4c4438, pt);
    const dou = cy(0.2, 0.25, 0.86, 3, 0, 1.15, 0); dou.scale(1, 1, 0.8); armyPart(P4, dou, a4.getHex(), 0);
    const hd = new THREE.SphereGeometry(0.11, 3, 2); hd.translate(0, 1.72, 0.01); armyPart(P4, hd, 0x6e5440, 0);
    const ks = new THREE.ConeGeometry(0.33, 0.13, 3, 1, true); ks.translate(0, 1.825, 0); armyPart(P4, ks, 0x2c261e, 1);
    const helmet = new THREE.SphereGeometry(0.15, 3, 1, 0, Math.PI * 2, 0, Math.PI / 2); helmet.translate(0, 1.75, 0); armyPart(P4, helmet, 0x1c1a18, 2);
    armyPart(P4, cy(0.016, 0.02, 4.3, 3, 0.3, 2.1, 0.14), 0x3b2a1a, 3);
    const ho4 = new THREE.ConeGeometry(0.035, 0.3, 3, 1, true); ho4.translate(0.3, 4.4, 0.14); armyPart(P4, ho4, 0x9a9a98, 3);
    armyPart(P4, cy(0.028, 0.034, 5.4, 3, 0.3, 2.6, 0.14), 0x2f2419, 6);
    const g4 = mergeGeometries(P4); g4.computeBoundingSphere(); SOLDIER_GEO.set(key, g4); return g4;
  }
  if (xx === 3) {
    // 画質「低」の、いちばん遠い塊（66m より先。人の背丈が画面の 1/50）：94 面 → 60 面ほど。脚・胴・頭・笠と、槍の穂先の竿だけ（鉄砲・弓・背の旗の竿は、影絵では見分けが付かない）
    const P3 = [], a3 = new THREE.Color(armor), dk = a3.clone().multiplyScalar(0.72).getHex();
    const cy = (rt, rb, h, seg, x, y, z, open = true) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); g.translate(x, y, z); return g; };
    for (const [sx, pt] of [[-0.11, 8], [0.11, 9]]) armyPart(P3, cy(0.08, 0.055, 0.82, 3, sx, 0.41, 0), 0x4c4438, pt);
    const sk = cy(0.19, 0.27, 0.34, 4, 0, 0.9, 0); sk.scale(1, 1, 0.8); armyPart(P3, sk, dk, 0);
    const dou = cy(0.21, 0.175, 0.5, 4, 0, 1.33, 0); dou.scale(1, 1, 0.74); armyPart(P3, dou, armor, 0);
    const hd = new THREE.SphereGeometry(0.105, 4, 2); hd.scale(0.95, 1.12, 1); hd.translate(0, 1.72, 0.01); armyPart(P3, hd, 0x6e5440, 0);
    const ks = new THREE.ConeGeometry(0.33, 0.13, 4, 1, true); ks.translate(0, 1.825, 0); armyPart(P3, ks, 0x2c261e, 1);
    const helmet = new THREE.SphereGeometry(0.15, 4, 2, 0, Math.PI * 2, 0, Math.PI / 2); helmet.translate(0, 1.75, 0); armyPart(P3, helmet, 0x1c1a18, 2);
    armyPart(P3, cy(0.016, 0.02, 4.3, 3, 0.3, 2.1, 0.14), 0x3b2a1a, 3);
    const ho3 = new THREE.ConeGeometry(0.035, 0.3, 3, 1, true); ho3.translate(0.3, 4.4, 0.14); armyPart(P3, ho3, 0x9a9a98, 3);
    armyPart(P3, cy(0.028, 0.034, 5.4, 3, 0.3, 2.6, 0.14), 0x2f2419, 6);
    const g3 = mergeGeometries(P3); g3.computeBoundingSphere(); SOLDIER_GEO.set(key, g3); return g3;
  }
  const P = [], arm = new THREE.Color(armor), dark = arm.clone().multiplyScalar(0.72).getHex(), lite = arm.clone().lerp(new THREE.Color(0x8a8070), 0.18).getHex();
  const cyl = (rt, rb, h, seg, x, y, z, open = true) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); g.translate(x, y, z); return g; };
  for (const [sx, pt] of [[-0.11, 8], [0.11, 9]]) armyPart(P, cyl(0.08, 0.055, 0.82, xx ? 3 : 4, sx, 0.41, 0), 0x4c4438, pt);
  // 胴は六角（四角・五角の筒は遠目に黒い板に見えた）
  const skirt = cyl(0.19, 0.27, 0.34, xx ? 5 : 6, 0, 0.9, 0, false); skirt.scale(1, 1, 0.8); armyPart(P, skirt, dark, 0);
  const dou = cyl(0.21, 0.175, 0.5, xx ? 5 : 6, 0, 1.33, 0, false); dou.scale(1, 1, 0.9); armyPart(P, dou, armor, 0);
  { const positions = dou.attributes.position, colors = dou.attributes.color, lace = new THREE.Color(lite);
    for (let i = 0; i < positions.count; i++) if (positions.getY(i) > 1.55) colors.setXYZ(i, lace.r, lace.g, lace.b); }
  if (!xx) for (const sx of [-1, 1]) { const b = cyl(0.14, 0.15, 0.26, 3, sx * 0.22, 1.43, 0); b.scale(0.75, 1, 1); armyPart(P, b, lite, 0); }
  if (!xx) armyPart(P, cyl(0.05, 0.042, 0.5, 3, -0.29, 1.2, 0.02), 0x47526c, 0);
  const ra = cyl(0.05, 0.042, 0.5, 3, 0, 0, 0); ra.rotateX(-0.45); ra.translate(0.29, 1.2, 0.08); if (!xx) armyPart(P, ra, 0x47526c, 0);
  // 頭は日に焼けたくすんだ肌（明るい橙の玉に見えないよう）。笠は頂のある円錐で裏も閉じる（平たい円盤に見えないよう）
  const head = new THREE.SphereGeometry(0.105, xx ? 5 : 6, xx ? 3 : 4); head.scale(0.95, 1.12, 1); head.translate(0, 1.72, 0.01); armyPart(P, head, 0x6e5440, 0);
  const kasa = new THREE.ConeGeometry(0.31, 0.17, xx ? 6 : 8, 1, false); kasa.translate(0, 1.84, 0); armyPart(P, kasa, 0x2c261e, 1);
  const hachi = new THREE.SphereGeometry(0.15, xx ? 4 : 5, xx ? 1 : 2, 0, Math.PI * 2, 0, Math.PI / 2); hachi.translate(0, 1.73, 0); armyPart(P, hachi, 0x1c1a18, 2);
  armyPart(P, cyl(0.012, 0.012, 1.4, 3, 0, 1.95, -0.17), 0x2f2419, 10);
  armyPart(P, cyl(0.016, 0.02, 4.3, 3, 0.3, 2.1, 0.14), 0x3b2a1a, 3);
  const ho = new THREE.ConeGeometry(0.028, 0.3, 3, 1, true); ho.translate(0.3, 4.4, 0.14); armyPart(P, ho, 0x9a9a98, 3);
  const gun = cyl(0.025, 0.03, 1.3, 3, 0, 0, 0); gun.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.85, -0.5).normalize())); gun.translate(0.22, 1.1 + 0.55, 0.15 - 0.33); armyPart(P, gun, 0x3a2a1a, 4);
  const bow = cyl(0.012, 0.012, 2.1, 3, 0, 0, 0); bow.rotateZ(0.12); bow.translate(-0.32, 1.25, 0.08); armyPart(P, bow, 0x4a3020, 5);
  armyPart(P, cyl(0.028, 0.034, 5.4, 3, 0.3, 2.6, 0.14), 0x2f2419, 6);
  const bar = cyl(0.018, 0.018, 0.8, 3, 0, 0, 0); bar.rotateZ(Math.PI / 2); bar.translate(0.7, 5.22, 0.14); if (!xx) armyPart(P, bar, 0x2f2419, 6);
  const g = mergeGeometries(P);
  g.computeBoundingSphere();
  SOLDIER_GEO.set(key, g);
  return g;
}
// 後詰めの兵一人の形：遠くからしか見ないので、角をさらに減らし、得物は槍と幟の竿だけ（影絵で人と槍と笠が分かれば足りる）
const HOST_GEO = new Map();
function hostGeo(armor) {
  if (HOST_GEO.has(armor)) return HOST_GEO.get(armor);
  const P = [], arm = new THREE.Color(armor), dark = arm.clone().multiplyScalar(0.72).getHex();
  const cyl = (rt, rb, h, seg, x, y, z) => { const g = new THREE.CylinderGeometry(rt, rb, h, Math.max(6, seg), 1, false); g.translate(x, y, z); return g; };
  for (const [sx, pt] of [[-0.1, 8], [0.1, 9]]) armyPart(P, cyl(0.075, 0.055, 0.82, 6, sx, 0.42, 0), 0x4c4438, pt);
  const skirt = cyl(0.19, 0.26, 0.34, 5, 0, 0.9, 0); skirt.scale(1, 1, 0.8); armyPart(P, skirt, dark, 0);
  const dou = cyl(0.22, 0.18, 0.55, 5, 0, 1.33, 0); dou.scale(1, 1, 0.75); armyPart(P, dou, armor, 0);
  for (const sx of [-1, 1]) { const a = cyl(0.05, 0.045, 0.5, 3, sx * 0.28, 1.2, 0.03); armyPart(P, a, 0x47526c, 0); }
  const head = new THREE.SphereGeometry(0.1, 7, 4); head.scale(0.95, 1.1, 1); head.translate(0, 1.7, 0.01); armyPart(P, head, 0x8a6a4e, 0);
  const kasa = new THREE.ConeGeometry(0.32, 0.13, 6, 1, true); kasa.translate(0, 1.82, 0); armyPart(P, kasa, 0x2c261e, 1);
  const hachi = new THREE.ConeGeometry(0.2, 0.2, 5, 1, true); hachi.translate(0, 1.8, 0); armyPart(P, hachi, 0x1c1a18, 2);
  armyPart(P, cyl(0.012, 0.012, 1.4, 3, 0, 1.95, -0.17), 0x2f2419, 10);
  armyPart(P, cyl(0.016, 0.02, 4.3, 3, 0.3, 2.1, 0.14), 0x3b2a1a, 3);
  const ho = new THREE.ConeGeometry(0.03, 0.3, 3); ho.translate(0.3, 4.4, 0.14); armyPart(P, ho, 0x9a9a98, 3);
  armyPart(P, cyl(0.028, 0.034, 5.4, 3, 0.3, 2.6, 0.14), 0x2f2419, 6);
  const bar = cyl(0.018, 0.018, 0.8, 3, 0, 0, 0); bar.rotateZ(Math.PI / 2); bar.translate(0.7, 5.22, 0.14); armyPart(P, bar, 0x2f2419, 6);
  const g = mergeGeometries(P);
  g.computeBoundingSphere();
  HOST_GEO.set(armor, g);
  return g;
}
// 兵ごとの色：使い込んだ具足の明るさのむらに、日焼け・褪せ（暖かい）と、濡れ・煤（冷たい）の寄りを少し
function soldierTint(col, R) {
  const v = 0.76 + R() * 0.36, w = (R() - 0.5) * 0.12;
  return col.setRGB(v * (1 + w), v * (1 + w * 0.3), v * (1 - w * 0.8));
}
// 馬（騎馬の兵の下に置く）。胴・首・頭・脚・尾。馬具の色を o.tack で
let HORSE_GEO = null;
// lo：遠い馬（38m より先）の形。角を半分ほどに（一頭 250 面ほど）
let HORSE_LO = null, HORSE_X3 = null;
// 高の 44m より先（本物の兵に替わる輪の外。馬の長さが二十画素ほど）の馬：250 面 → 110 面ほど。蹄と耳は省き、鞍と泥障の色は残す
function horseGeoX3() {
  if (HORSE_X3) return HORSE_X3;
  const P = [];
  const body = new THREE.CapsuleGeometry(0.3, 0.95, 1, 5); body.rotateX(Math.PI / 2); body.scale(0.9, 1.1, 1); body.translate(0, 1.28, 0); armyPart(P, body, 0xffffff, 20);
  const chest = new THREE.SphereGeometry(0.3, 5, 3); chest.scale(0.85, 1.05, 0.8); chest.translate(0, 1.3, 0.55); armyPart(P, chest, 0xffffff, 20);
  const neck = new THREE.CylinderGeometry(0.11, 0.2, 0.7, 4, 1, true); neck.rotateX(0.62); neck.translate(0, 1.66, 0.8); armyPart(P, neck, 0xffffff, 23);
  const hd = new THREE.CylinderGeometry(0.065, 0.1, 0.5, 3, 1, true); hd.rotateX(Math.PI / 2 + 0.5); hd.translate(0, 1.84, 1.12); armyPart(P, hd, 0xffffff, 23);
  const mane = new THREE.BoxGeometry(0.04, 0.55, 0.1); mane.rotateX(0.62); mane.translate(0, 1.8, 0.68); armyPart(P, mane, 0x1a1512, 23);
  const kura = new THREE.CylinderGeometry(0.34, 0.34, 0.5, 3, 1, true, -Math.PI / 2, Math.PI); kura.rotateX(Math.PI / 2); kura.scale(1, 0.55, 1); kura.translate(0, 1.47, -0.05); armyPart(P, kura, 0x3a1a14, 20);
  for (const sd of [-1, 1]) { const ao = new THREE.CylinderGeometry(0.34, 0.34, 0.48, 2, 1, true, sd > 0 ? Math.PI * 0.35 : Math.PI * 1.35, Math.PI * 0.3); ao.rotateX(Math.PI / 2); ao.translate(0, 1.25, -0.05); armyPart(P, ao, 0x3a1a14, 20); }
  for (const [x, z, pt] of [[-0.16, 0.6, 21], [0.16, 0.6, 22], [-0.16, -0.6, 22], [0.16, -0.6, 21]]) {
    const l = new THREE.CylinderGeometry(0.08, 0.05, 1.06, 3, 1, true); l.translate(x, 0.53, z); armyPart(P, l, 0xd8d0c8, pt);
  }
  const tail = new THREE.CylinderGeometry(0.04, 0.1, 0.75, 3, 1, true); tail.rotateX(-0.35); tail.translate(0, 1.05, -0.87); armyPart(P, tail, 0x1a1512, 20);
  HORSE_X3 = mergeGeometries(P); return HORSE_X3;
}
function horseGeo(lo = false) {
  if (!lo && HORSE_GEO) return HORSE_GEO;
  if (lo && HORSE_LO) return HORSE_LO;
  // 丸みのある胴・首・頭（箱の馬にしない）。胴は腹が張って背がくぼむ
  const P = [], q = (n, m) => (lo ? m : n);
  const body = new THREE.CapsuleGeometry(0.3, 0.95, q(4, 2), q(10, 6)); body.rotateX(Math.PI / 2); body.scale(0.9, 1.1, 1); body.translate(0, 1.28, 0); armyPart(P, body, 0xffffff, 20);
  const chest = new THREE.SphereGeometry(0.3, q(10, 6), q(6, 4)); chest.scale(0.85, 1.05, 0.8); chest.translate(0, 1.3, 0.55); armyPart(P, chest, 0xffffff, 20);
  const neck = new THREE.CylinderGeometry(0.11, 0.2, 0.7, q(8, 5), 1, lo); neck.rotateX(0.62); neck.translate(0, 1.66, 0.8); armyPart(P, neck, 0xffffff, 23);
  const hd = new THREE.CylinderGeometry(0.065, 0.1, 0.5, q(8, 4)); hd.rotateX(Math.PI / 2 + 0.5); hd.translate(0, 1.84, 1.12); armyPart(P, hd, 0xffffff, 23);
  for (const sd of [-1, 1]) { const ear = new THREE.ConeGeometry(0.025, 0.09, q(4, 3), 1, lo); ear.translate(sd * 0.05, 2.0, 0.95); armyPart(P, ear, 0xffffff, 23); }
  const mane = new THREE.BoxGeometry(0.04, 0.55, 0.1); mane.rotateX(0.62); mane.translate(0, 1.8, 0.68); armyPart(P, mane, 0x1a1512, 23);
  // 鞍と泥障（あおり）：馬具の色。鞍は丸く、泥障は脇に垂れる板
  const kura = new THREE.CylinderGeometry(0.34, 0.34, 0.5, q(10, 5), 1, false, -Math.PI / 2, Math.PI); kura.rotateX(Math.PI / 2); kura.scale(1, 0.55, 1); kura.translate(0, 1.47, -0.05); armyPart(P, kura, 0x3a1a14, 20);
  for (const sd of [-1, 1]) { const ao = new THREE.CylinderGeometry(0.34, 0.34, 0.48, q(8, 3), 1, true, sd > 0 ? Math.PI * 0.35 : Math.PI * 1.35, Math.PI * 0.3); ao.rotateX(Math.PI / 2); ao.translate(0, 1.25, -0.05); armyPart(P, ao, 0x3a1a14, 20); }
  for (const [x, z, pt] of [[-0.16, 0.6, 21], [0.16, 0.6, 22], [-0.16, -0.6, 22], [0.16, -0.6, 21]]) {
    const l = new THREE.CylinderGeometry(0.08, 0.045, 1.02, q(6, 4), 1, true); l.translate(x, 0.5, z); armyPart(P, l, 0xd8d0c8, pt);
    const hf = new THREE.CylinderGeometry(0.05, 0.06, 0.08, q(6, 4), 1, lo); hf.translate(x, 0.02, z); armyPart(P, hf, 0x2a2420, pt);
  }
  const tail = new THREE.CylinderGeometry(0.04, 0.1, 0.75, q(5, 3), 1, true); tail.rotateX(-0.35); tail.translate(0, 1.05, -0.87); armyPart(P, tail, 0x1a1512, 20);
  if (lo) { HORSE_LO = mergeGeometries(P); return HORSE_LO; }
  HORSE_GEO = mergeGeometries(P);
  return HORSE_GEO;
}
// 背の指物の布（竿から横へ）と、幟の布（竿の横木から垂れる）
function clothGeo(w, h, sx, sy, x0, y0, z0, part) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy); g.translate(x0 + w / 2, y0 - h / 2, z0);
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
  return g;
}

// 隊の並び：兵一人ずつの置き場所と種類を作る
// kind：'mixed'（前に鉄砲、中に槍、後ろに旗と騎馬の備え）・'spear'（槍の林）・'gun'（鉄砲の横列）・'bow'・'cavalry'（騎馬の塊）・'honjin'（陣幕の本陣）
function armyLayout(o, R) {
  const N = o.count || 300, w = o.w || 20, d = o.d || 10, kind = o.kind || 'mixed';
  const fieldRanks = o.fieldRanks === true && kind === 'spear';
  // 大軍は一つの描画の中で備えに分ける。小さな備・本陣・鉄砲列は元の並びを保つ。
  const parts = o.sonae || (!o.yose && !o._sonae && kind === 'mixed' && N >= 240 && w >= 24 && d >= 10
    ? Array.from({ length: 3 }, (_, i) => ({ ...jinkeiSlot(o.jinkei || '横陣', i, 3, w * 0.7, d * 0.5), count: Math.floor(N / 3) + (i < N % 3 ? 1 : 0), w: w * 0.26, d: d * 0.65 })) : null);
  if (parts) {
    const list = [];
    for (const p of parts) {
      const L = armyLayout({ ...o, ...p, sonae: null, kind: p.kind || 'mixed', _sonae: true }, R);
      for (const q of L.list) { q.lx += p.right || 0; q.lz += p.front || 0; list.push(q); }
    }
    const important = list.filter((q) => q.imp || q.k === 4);
    return { list: important.concat(list.filter((q) => !(q.imp || q.k === 4))), nImp: important.length };
  }
  const flagP = o.flagRate ?? (kind === 'cavalry' ? 0.95 : 0.85);
  const S = [];
  const put = (lx, lz, k, x = {}) => S.push({
    lx, lz, k, helm: x.helm ?? (k === 3 || k === 5 || k === 6 ? 1 : (R() < 0.08 ? 1 : 0)),
    ex: x.ex ?? 0, flag: x.flag ?? (k === 4 || k === 6 ? 0 : (R() < flagP ? 1 : 0)), yaw: x.yaw || 0, imp: k >= 3 ? 1 : 0, general: x.general,
  });
  // 四角の中に n 人を横の間 sx・縦の間 sz で前から詰める（入りきらなければ縦を詰める）
  const block = (n, x0, x1, z0, z1, k, sx, sz, f) => {
    if (n <= 0) return;
    const cols = Math.max(1, Math.min(n, Math.round((x1 - x0) / sx)));
    const rows = Math.ceil(n / cols);
    const gz = Math.min(sz, Math.max(0.5, (z1 - z0)) / rows);
    const ph = R() * 6;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const inRow = r === rows - 1 ? n - r * cols : cols;
      const cx = c + (cols - inRow) / 2;
      const lx = x0 + (cx + 0.5) * (x1 - x0) / cols + (R() - 0.5) * sx * (fieldRanks ? 0.08 : 0.35);
      const lz = z1 - (r + 0.5) * gz + Math.sin(lx * 0.23 + ph + r) * (fieldRanks ? 0.04 : 0.25) + (R() - 0.5) * gz * (fieldRanks ? 0.06 : 0.3);
      put(lx, lz, k, f ? f(r, c, rows) : {});
    }
  };
  const hw = w / 2, hd = d / 2;
  const nb = o.banners ?? Math.max(1, Math.min(12, Math.round(w / 4), Math.round(N * 0.08)));
  const banners = (z) => { for (let i = 0; i < nb; i++) put(-hw + (i + 0.5) * w / nb + (R() - 0.5) * (fieldRanks ? 0.08 : 0.8), z + (R() - 0.5) * (fieldRanks ? 0.06 : 0.5), 4); };
  // 近い控えの短い槍だけ指定で縮める。指定のない戦の長さは保つ。
  const spearF = (r, c) => fieldRanks
    ? { ex: 1.36 + R() * 0.04, flag: (r + c) % 2 === 0 ? 1 : 0 }
    : { ex: (1.25 + R() * 0.3) * (o.spearScale ?? 1) };
  if (o.yose && (kind === 'mixed' || kind === 'cavalry') && N >= 12) {
    // 前列は一続きの騎馬横隊。中央の侍大将と両脇の旗本を、徒歩の林が追う。
    const cols = Math.max(3, Math.min(N - 5, 21, Math.floor(w / 1.35))) | 1;
    const nBanner = Math.min(36, Math.max(3, Math.floor(N * 0.16)), N - cols - 2);
    const centre = Math.floor(cols / 2);
    for (let i = 0; i < cols; i++) put((i - centre) * Math.min(1.45, w / cols), hd - 0.7, 5,
      { helm: 1, ex: i === centre ? 2 : 0, general: i === centre ? o.general : undefined });
    for (let i = 0; i < nBanner; i++) {
      const per = Math.max(3, Math.ceil(nBanner / 3)), row = Math.floor(i / per), c = i % per;
      put(-hw + (c + 0.5) * w / per, hd - 3.2 - row * Math.max(1.1, (d - 4) / 3), 4, { ex: i % 6 });
    }
    const rest = N - S.length;
    const guns = kind === 'mixed' ? Math.floor(rest * 0.14) : 0;
    const bows = kind === 'mixed' ? Math.floor(rest * 0.06) : 0;
    block(guns, -hw, hw, -hd, -hd + 1.2, 1, 1, 1);
    block(bows, -hw, hw, -hd + 1.3, -hd + 2.3, 2, 1, 1);
    block(rest - guns - bows, -hw, hw, -hd + 2.4, hd - 3.4, 0, 0.95, 1, spearF);
  } else if (kind === 'spear') {
    banners(-hd + 0.5);
    put(0, hd - 0.2, 3); put(-hw * 0.5, hd - 0.2, 3);
    block(N - nb - 2, -hw, hw, -hd + 1.3, hd - 1.0, 0, 0.95, 1.0, spearF);
  } else if (kind === 'gun' || kind === 'bow') {
    const k = kind === 'gun' ? 1 : 2;
    const nr = Math.max(1, Math.min(3, Math.floor(d / 2)));
    banners(-hd + 0.4);
    put(0, -hd + 1.4, 3); put(hw * 0.6, -hd + 1.4, 3);
    const n = N - nb - 2, per = Math.ceil(n / nr);
    for (let r = 0; r < nr; r++) {
      const z = hd - 0.4 - r * Math.min(2.2, (d - 1.5) / nr);
      block(Math.min(per, n - r * per), -hw, hw, z - 0.5, z + 0.5, k, Math.max(0.9, w / per), 1, () => ({ ex: k === 1 && r === 0 ? 1 : 0 }));
    }
  } else if (kind === 'cavalry') {
    // 騎馬は塊ごとに間を空け、塊の中は前後左右に詰める。後ろに徒の旗持ち
    const foot = Math.min(nb, 6);
    for (let i = 0; i < foot; i++) put(-hw + (i + 0.5) * w / foot, -hd + 0.4, 4);
    put(0, hd - 0.6, 5, { helm: 1 });
    const n = N - foot - 1;
    const clumps = Math.max(1, Math.round(w / 9));
    const cw = w / clumps;
    for (let c = 0; c < clumps; c++) {
      const m = Math.round(n / clumps) + (c === clumps - 1 ? n - Math.round(n / clumps) * clumps : 0);
      block(m, -hw + c * cw + 0.8, -hw + (c + 1) * cw - 0.8, -hd + 1.6, hd - 2.2, 5, 1.25, 2.7, () => ({ helm: R() < 0.6 ? 1 : 0 }));
    }
  } else if (kind === 'honjin') {
    // 真ん中に陣幕。中の奥に床几の大将、左右に並ぶ旗本。幕の後ろに旗の林、周りを槍の備えが囲む
    const jw = Math.min(16, w * 0.55), jd = Math.min(12, d * 0.55), jz = -hd * 0.1;
    o._maku = { w: jw, d: jd, z: jz };
    put(0, jz - jd / 2 + 1.8, 6, { flag: 0 });
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) put(sx * (jw / 2 - 1.6), jz - jd / 2 + 3.2 + i * 1.5, 3, { yaw: -sx * Math.PI / 2, flag: 1 });
    const nbj = Math.min(26, Math.max(6, Math.round(N * 0.14)));
    for (let i = 0; i < nbj; i++) put(-jw / 2 + (i % 13 + 0.5) * jw / 13 + (R() - 0.5) * 0.4, jz - jd / 2 - 1.2 - Math.floor(i / 13) * 1.4, 4);
    const rest = N - S.length;
    const front = Math.round(rest * 0.45), side = Math.round(rest * 0.2);
    block(front, -hw, hw, jz + jd / 2 + 1.5, hd, 0, 1.0, 1.0, spearF);
    block(side, -hw, -jw / 2 - 1.2, -hd, jz + jd / 2, 0, 1.0, 1.0, spearF);
    block(side, jw / 2 + 1.2, hw, -hd, jz + jd / 2, 0, 1.0, 1.0, spearF);
    block(rest - front - side * 2, -hw, hw, -hd, jz - jd / 2 - 3.2, 3, 1.1, 1.1);
  } else if (Math.min(w, d) < 7) {
    // 細長い列：長い辺の後ろに旗、前に鉄砲が一列（入る時だけ）、あとは槍
    const long = w >= d;
    const nb2 = Math.max(1, Math.round(Math.max(w, d) / 5));
    for (let i = 0; i < nb2; i++) { const t = (i + 0.5) / nb2 - 0.5; if (long) put(t * w, -hd + 0.3, 4); else put(-hw + 0.3, t * d, 4); }
    if (long && d >= 3) { const g = Math.round(w / 1.1); block(g, -hw, hw, hd - 0.8, hd, 1, 1.1, 1, () => ({ ex: 1 })); }
    block(N - S.length, long ? -hw : -hw + 0.8, hw, -hd + (long ? 0.8 : 0), long && d >= 3 ? hd - 1.2 : hd, 0, 0.95, 1.0, spearF);
  } else {
    // 混ぜた備え：前に鉄砲の二列（前列は片膝）、次に弓、中は槍、後ろに旗持ちと騎馬の武者
    const gunN = Math.round(N * 0.16), bowN = Math.round(N * 0.07), cav = N >= 120 && d >= 8 ? Math.min(10, Math.round(N * 0.04)) : 0;
    banners(-hd + 0.4);
    put(0, o.generalRear ? -hd + 3 : 0, 5, { helm: 1, general: o.general }); put(0.9, o.generalRear ? -hd + 2.2 : -0.8, 4); // 指定した備えの大将と馬印は槍の後ろ
    put(-hw * 0.3, -hd + 1.6, 3); put(hw * 0.3, -hd + 1.6, o.secondGeneral ? 5 : 3, { general: o.secondGeneral });
    const g1 = Math.ceil(gunN / 2);
    block(g1, -hw, hw, hd - 0.9, hd - 0.1, 1, Math.max(0.9, w / g1), 1, () => ({ ex: 1 }));
    block(gunN - g1, -hw, hw, hd - 2.2, hd - 1.2, 1, Math.max(0.9, w / (gunN - g1 || 1)), 1);
    block(bowN, -hw, hw, hd - 3.4, hd - 2.5, 2, Math.max(0.9, w / (bowN || 1)), 1);
    block(cav, -Math.min(hw, 6), Math.min(hw, 6), -hd + 1.0, -hd + 3.8, 5, 1.3, 2.6);
    const spN = N - S.length;
    block(spN, -hw, hw, -hd + (cav ? 4.2 : 1.2), hd - 3.6, 0, 0.95, 1.0, spearF);
  }
  // 塊の縁を崩す：縁の兵は前後左右に散り、ところどころ列から遅れた者・後ろへ下がった者がいる（長方形の塊に見えないように）
  if (kind !== 'honjin' && !o.yose && !fieldRanks) {
    for (const q of S) {
      if (q.imp || q.k === 4) continue;
      const ex = Math.abs(q.lx) > hw - 1.6, ez = Math.abs(q.lz) > hd - 1.3;
      if (ex || ez) { q.lx += (R() - 0.5) * 2.2; q.lz += (R() - 0.5) * 1.6; }
      const r = R();
      if (r < 0.03) q.lz -= hd * 0.6 + R() * 5;                                   // 後ろへ遅れた者
      else if (r < 0.045) q.lx += (q.lx >= 0 ? 1 : -1) * (1.5 + R() * 3);        // 横へはみ出した者
    }
  }
  // 大事な者（旗持ち・侍・騎馬・大将）を先に、残りは混ぜる。遠くで数を間引く時に、旗と騎馬が残るように
  const imp = S.filter((s) => s.imp || s.k === 4), rest = S.filter((s) => !(s.imp || s.k === 4));
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return { list: imp.concat(rest), nImp: imp.length };
}


export { armyLayout, soldierGeo, clothGeo, soldierTint, horseGeo, horseGeoX3, armyPart, armyViewTest, frontKeep, lowKeep, hostGeo };
