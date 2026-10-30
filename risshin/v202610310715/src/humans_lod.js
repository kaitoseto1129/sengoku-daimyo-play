// 人の処理：遠さと影。外部向けの入口は humans.js。
import * as THREE from 'three';
import { namedKacchu } from './named_kacchu.js';
import { SRC, limbFit, PART, HSTAT, v0, HUM, qualityKeeper } from './humans_shared.js';

const BSPH = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0), 1.9);
// 骨の入った体（一万一千の三角）の、遠目用の細かさを落とした形。同じ骨・同じ絵・同じ色で、形の輪郭はそのまま
//   10/8 測ると、森部の 30〜60m の兵 29 人の体だけで三十二万の三角＝一コマの三角の四割。30m 先では 4cm の凹凸は一画素より小さい。
//   頂点を格子（cell）でまとめる（部位をまたがない）。重みと絵の座標は代表の頂点の物、位置と向きは平均
// 部品の甲冑の足軽：見えない頭・足と、装備の中央に隠れた体の面を送らない。
// 首・肩・関節・草摺の隙間は残す。色や顔にかかわらず、同じ装備は形を共有する。
const coveredBodyGeos = new Map();
function coveredBodyGeo(geo, P, L) {
  if ((L.tier || 0) !== 0 || L.sohei || L.kosode || L.nanban || L.hero || namedKacchu(L)) return geo;
  const torso = !!P.torso && !L.backOpening && !L.rightOpening;
  const upperP = !!P.upperP?.attributes.position.count, upperN = !!P.upperN?.attributes.position.count;
  const thigh = !!P.thigh && (L.vi || 0) % 2 === 0;
  const loan = L.lacquer != null;   // 簡素な貸し具足：体に沿う胴（units_model.js ashiDo）が腰から胸まで包むので、その内の体は描かない
  const key = [geo.uuid, torso, upperP, upperN, thigh, loan].join('|');
  if (coveredBodyGeos.has(key)) return coveredBodyGeos.get(key);
  const pos = geo.attributes.position, part = geo.attributes.part, ix = geo.index;
  if (!part || !ix) return geo;
  const hidden = new Uint8Array(pos.count), w = new THREE.Vector3(), q = new THREE.Vector3();
  const toTorso = SRC.fitTi;
  const arms = {}, legs = {}, shins = {};
  for (const side of ['Right', 'Left']) {
    const r = SRC.radius[side + 'Arm']?.r || 0.058;
    arms[side] = limbFit(side + 'Arm', side + 'ForeArm', 0.27, Math.max(1, r * 1.12 / 0.058)).invert();
    const t = SRC.radius[side + 'UpLeg']?.r || 0.11;
    legs[side] = limbFit(side + 'UpLeg', side + 'Leg', 0.4, Math.max(1, t * 1.12 / 0.11)).invert();
    shins[side] = limbFit(side + 'Leg', side + 'Foot', 0.3, Math.max(1, (SRC.radius[side + 'Leg']?.r || 0.078) * 1.12 / 0.078)).invert();
  }
  for (let i = 0; i < pos.count; i++) {
    const p = part.getX(i);
    // 元から材質が捨てる部位。部位の境の面は三頂点とも隠れる時だけ除く。
    if (p > 3.5) { hidden[i] = 1; continue; }
    w.fromBufferAttribute(pos, i).applyMatrix4(SRC.bodyToRest);
    const side = w.x * SRC.rest.RightArm.x >= 0 ? 'Right' : 'Left';
    // 簡素な貸し具足：腰（草摺の下の布の腰巻の内）も描かない
    if (loan && (p === PART.torso || p === PART.leg)) {
      q.copy(w).applyMatrix4(toTorso);
      if (q.y > 0.72 && q.y <= 0.885 && Math.abs(q.x) < 0.158 && Math.abs(q.z) < 0.104) { hidden[i] = 1; continue; }
    }
    if (p === PART.torso && torso) {
      q.copy(w).applyMatrix4(toTorso);
      hidden[i] = loan ? q.y > 0.885 && q.y < 1.34 && (Math.abs(q.x) < 0.14 || q.y < 1.19 && Math.abs(q.x) < 0.2) ? 1 : 0
        : q.y > 0.99 && q.y < 1.29 && Math.abs(q.x) < 0.17 && Math.abs(q.z) < 0.14 ? 1 : 0;
    } else if (p === PART.arm && (side === 'Right' ? upperP : upperN)) {
      q.copy(w).applyMatrix4(arms[side]);
      // 籠手の筒の端と、外へはみ出す小袖は残す。
      hidden[i] = q.y < -0.07 && q.y > -0.21 && Math.hypot(q.x, q.z) < 0.044 ? 1 : 0;
    } else if (p === PART.arm && loan) {
      // 籠手の無い足軽の二の腕は小袖の袖（humans_dress.js sleeveGeo）が包む
      q.copy(w).applyMatrix4(arms[side]);
      hidden[i] = q.y < -0.03 && q.y > -0.24 && Math.hypot(q.x, q.z) < 0.07 ? 1 : 0;
    } else if (p === PART.leg && loan) {
      // 脛は布の脚絆（units_model.js shinGeometry）が包むので、体の脛は描かない（腿の袴は体のまま）
      q.copy(w).applyMatrix4(shins[side]); hidden[i] = q.y < 0.0 && q.y > -0.27 ? 1 : 0;
    } else if (p === PART.leg && thigh) {
      q.copy(w).applyMatrix4(legs[side]);
      // 足軽の佩楯は前だけ。後ろ・脇・膝の袴は消さない。
      hidden[i] = q.y < -0.12 && q.y > -0.23 && q.z > 0.045 && Math.abs(q.x) < q.z * 0.45 && Math.hypot(q.x, q.z) < 0.095 ? 1 : 0;
    }
  }
  const keep = [];
  for (let i = 0; i < ix.count; i += 3) {
    const a = ix.getX(i), b = ix.getX(i + 1), c = ix.getX(i + 2);
    if (!(hidden[a] && hidden[b] && hidden[c])) keep.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  // 頂点の属性は原本と共有し、描く面の番号だけ替える。
  for (const [name, a] of Object.entries(geo.attributes)) g.setAttribute(name, a);
  g.setIndex(keep); g.boundingBox = geo.boundingBox; g.boundingSphere = geo.boundingSphere;
  coveredBodyGeos.set(key, g);
  HSTAT.bodyCovered = [ix.count / 3, keep.length / 3];
  return g;
}
const bodyLoGeos = new Map();
function bodyLoGeo(geo, frac) {
  const key = geo.uuid + '|' + frac;
  let g = bodyLoGeos.get(key);
  if (g !== undefined) return g;
  g = null;
  if (geo.index && geo.attributes.position) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox, cell = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) * frac;
    const pos = geo.attributes.position, nor = geo.attributes.normal, part = geo.attributes.part, n = pos.count;
    const skin = geo.attributes.skinIndex, weight = geo.attributes.skinWeight;
    const map = new Map(), rep = new Int32Array(n), cnt = [], sum = [];
    for (let i = 0; i < n; i++) {
      // 同じ升でも関節の重みが違う頂点は合わせない。肘・膝・首の皮が別の骨へ引かれるのを防ぐ。
      const joint = skin && weight ? ',' + skin.getX(i) + ':' + Math.round(weight.getX(i) * 16) +
        ',' + skin.getY(i) + ':' + Math.round(weight.getY(i) * 16) +
        ',' + skin.getZ(i) + ':' + Math.round(weight.getZ(i) * 16) +
        ',' + skin.getW(i) + ':' + Math.round(weight.getW(i) * 16) : '';
      const k = Math.floor((pos.getX(i) - bb.min.x) / cell) + ',' + Math.floor((pos.getY(i) - bb.min.y) / cell) + ',' + Math.floor((pos.getZ(i) - bb.min.z) / cell) + ',' + (part ? part.getX(i) : 0) + joint;
      let j = map.get(k);
      if (j === undefined) { j = cnt.length; map.set(k, j); cnt.push(0); sum.push([0, 0, 0, 0, 0, 0, i]); }
      rep[i] = j; cnt[j]++; const s = sum[j];
      s[0] += pos.getX(i); s[1] += pos.getY(i); s[2] += pos.getZ(i);
      if (nor) { s[3] += nor.getX(i); s[4] += nor.getY(i); s[5] += nor.getZ(i); }
    }
    const m = cnt.length, out = new THREE.BufferGeometry();
    // 元の形は詰めた（交互に並べた・整数に縮めた）並びの事があるので、getX〜getW で読んで、浮動小数の並びに書き直す
    const GET = ['getX', 'getY', 'getZ', 'getW'];
    for (const [name, a] of Object.entries(geo.attributes)) {
      const A = name === 'skinIndex' ? new Uint16Array(m * a.itemSize) : new Float32Array(m * a.itemSize);
      for (let j = 0; j < m; j++) { const src = sum[j][6]; for (let c = 0; c < a.itemSize; c++) A[j * a.itemSize + c] = a[GET[c]](src); }
      const B = name === 'skinIndex' ? new THREE.Uint16BufferAttribute(A, a.itemSize) : new THREE.BufferAttribute(A, a.itemSize);
      if (name === 'position') for (let j = 0; j < m; j++) B.setXYZ(j, sum[j][0] / cnt[j], sum[j][1] / cnt[j], sum[j][2] / cnt[j]);
      if (name === 'normal') for (let j = 0; j < m; j++) { v0.set(sum[j][3], sum[j][4], sum[j][5]).normalize(); B.setXYZ(j, v0.x, v0.y, v0.z); }
      out.setAttribute(name, B);
    }
    const ix = geo.index, I = [], seen = new Set();
    for (let t = 0; t < ix.count; t += 3) {
      const a = rep[ix.getX(t)], b = rep[ix.getX(t + 1)], c = rep[ix.getX(t + 2)];
      if (a === b || b === c || a === c) continue;
      const lo = Math.min(a, b, c), hi = Math.max(a, b, c), k = lo * m * m + (a + b + c - lo - hi) * m + hi;
      if (seen.has(k)) continue; seen.add(k);
      I.push(a, b, c);
    }
    out.setIndex(m > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
    out.boundingBox = geo.boundingBox; if (geo.boundingSphere) out.boundingSphere = geo.boundingSphere;
    // 減りが少なければ使わない（元の形のまま）
    if (I.length / 3 < (ix.count / 3) * 0.7) g = out; else out.dispose();
  }
  bodyLoGeos.set(key, g);
  return g;
}
// 画面用の体は従来の距離で選び、本人は細かい形。高画質の影だけ、本人と五メートル以内は中、その先は粗くする。
function bodyLod(m, h) {
  const hi = m.geometry, mid = bodyLoGeo(hi, 1 / 70), lo = bodyLoGeo(hi, 1 / 42);
  HSTAT.bodyLo = [hi.index && hi.index.count / 3, mid && mid.index.count / 3, lo && lo.index.count / 3];
  if (!mid && !lo) return;
  m.onBeforeRender = (r, s, cam) => {
    if (cam.isOrthographicCamera) {
      if (true) {
        // 光のカメラとの距離ではなく、直前の画面描画で測った距離を使う。初回は中の形を残す。
        const far = !h.u.isPlayer && h.bodyD2 > 25;
        m.geometry = HUM.lodOff ? hi : (far && lo) || mid || hi;
      }
      return;
    }
    if (qualityKeeper(h.u)) { m.geometry = hi; return; }
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
    h.bodyD2 = d2;
    // 体の形の切り替え：高は 14m で中・32m で粗く（以前は 22m・42m）、中はさらに近く。900p で 14m の人は背丈 80px ほどで、細かい形の差は見えない
    const q2 = 0;
    // 簡素な貸し具足の足軽は 3m で中・5m で粗く（体は胴・草摺・脚絆・袖でほとんど隠れ、見えるのは腿の袴・前腕・手・足だけ。胴丸のスキャンも 3m で軽い形だった）
    const loan = h.look.lacquer != null;
    const fF = loan ? 5 : q2 === 1 ? 18 : q2 === 0 ? 24 : 42, mF = loan ? 3 : q2 === 1 ? 6 : q2 === 0 ? 8 : 22;
    const far = h.bodyFar ? fF - (loan ? 0.5 : 2) : fF, mfar = h.bodyMid ? mF - (loan ? 0.3 : 1) : mF;   // 境目で行き来しないよう 1〜2m の幅
    h.bodyFar = d2 > far * far || HUM.bodyLoD === 2; h.bodyMid = d2 > mfar * mfar || HUM.bodyLoD === 1;
    const want = HUM.lodOff ? hi : (h.bodyFar && lo) || (h.bodyMid && mid) || hi;   // lodOff：前と比べて測る時だけ
    if (m.geometry !== want) m.geometry = want;
  };
}
// 影の処理は画面用の onBeforeRender を呼ばない。形の転送より前に切り替え、画面用の形は必ず戻す。
// 骨番号の並べ替えも shareHumanSkeleton の包みを通す。顔・歯・目・兜には触らない。
const BODY_SHADOW_CAMERA = { isOrthographicCamera: true };
// 影に描く形：升（1/48）でまとめた軽い形。元の形に持たせ、元の形を手放す時に一緒に手放す（sweepCrowdGeos）
function shadowGeoOf(base) {
  const ud = base.userData;
  if (ud.shGeo === undefined) ud.shGeo = bodyLoGeo(base, 1 / 48) || null;
  return ud.shGeo || base;
}
const disposeShGeo = (g) => { const sg = g.userData && g.userData.shGeo; if (sg) { sg.dispose(); bodyLoGeos.delete(g.uuid + '|' + (1 / 48)); g.userData.shGeo = undefined; } };
// 近くは細かい形、遠く（HUM.lod より先）と影は軽い形（描く直前に距離で入れ替える）
function lodGeo(m, hi, lo, h = null) {
  if (!lo || hi === lo) return;
  m.onBeforeRender = (r, s, cam) => {
    // 遠い人（h.lodFar）は、体ごと一つにまとめた軽い形
    if (h && h.lodFar) { if (m.geometry !== h.geoFar) m.geometry = h.geoFar; return; }
    const e = m.matrixWorld.elements, c = cam.matrixWorld.elements;
    const d2 = (e[12] - c[12]) ** 2 + (e[13] - c[13]) ** 2 + (e[14] - c[14]) ** 2;
    const near = false && !(h && h.u.isPlayer) ? 9 : HUM.lod;
    const want = !cam.isOrthographicCamera && (h && qualityKeeper(h.u) || d2 < near * near) ? hi : lo;
    if (m.geometry !== want) m.geometry = want;
  };
}

export { BSPH, coveredBodyGeos, coveredBodyGeo, bodyLoGeos, bodyLoGeo, bodyLod, BODY_SHADOW_CAMERA, shadowGeoOf, disposeShGeo, lodGeo };
