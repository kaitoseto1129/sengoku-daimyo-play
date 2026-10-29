// 名のある武将の近い具足に重ねる「形の」小札の段と籠手の篠（kaito 10/29：網が粗く、絵と法線だけでは段の凹凸が出ない）。
// 胴丸のスキャン（DM.hi）の立ち姿の面から、段ごとに少しずつ外へ出る帯を作る：段の頭は面に沿い、裾は 4mm ほど前へ出て下の段へ被さる。
// 裾の下に戻りの面（段差）を付けるので、日の向きで段ごとに陰が切れる。籠手は前腕の外側に、縦の細い篠を三本。
// 各頂点は一番近いスキャンの頂点の骨の重み・絵の座標をそのまま借りる（同じ骨と材質で描き、絵の色と模様も段にそろう）。
// 読み込みの後に一度だけ作り、全員で使い回す（毎コマ作らない）。描く回数は武将一人につき一つ増えるだけ（近い段だけ）。
import * as THREE from 'three';

const ROW = 0.034;   // 札一段の高さ（humans_armor.js の小札の段の模様と同じ）
const NA = 64;       // 胴のまわりの割り（角度）

export function buildBands(DM, torso = true) {
  const g = DM.hi, P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
  const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bones = DM.bones;
  const main = (i) => { let bi = 0, bw = -1; for (let c = 0; c < 4; c++) { const w = SW.getComponent(i, c); if (w > bw) { bw = w; bi = SI.getComponent(i, c); } } return bones[bi] || ''; };
  const cz = -0.03;
  const pos = [], uv = [], si = [], sw = [], idx = [];
  const put = (x, y, z, src) => {
    pos.push(x, y, z); uv.push(UV ? UV.getX(src) : 0, UV ? UV.getY(src) : 0);
    si.push(SI.getX(src), SI.getY(src), SI.getZ(src), SI.getW(src)); sw.push(SW.getX(src), SW.getY(src), SW.getZ(src), SW.getW(src));
    return pos.length / 3 - 1;
  };
  // 段の縁の高さごとに、角度の割りの一番外の頂点（体の面）を集める
  const sample = (y0, y1, ok) => {
    const ys = []; for (let y = y1; y >= y0 - 1e-6; y -= ROW) ys.push(y);
    const best = ys.map(() => new Array(NA).fill(null));
    for (let i = 0; i < P.count; i++) {
      // 網が粗いので、段の縁の高さの上下 1.2cm の内の一番外の点を使う
      const y = P.getY(i); if (y < y0 - 0.012 || y > y1 + 0.012) continue;
      const k = Math.round((y1 - y) / ROW); if (k < 0 || k >= ys.length || Math.abs(ys[k] - y) > 0.012) continue;
      const x = P.getX(i), z = P.getZ(i) - cz, r = Math.hypot(x, z);
      if (r < 0.05 || (N.getX(i) * x + N.getZ(i) * z) / r < 0.25 || !ok(main(i))) continue;
      const a = Math.floor(((Math.atan2(x, z) / (Math.PI * 2)) + 1) % 1 * NA);
      if (!best[k][a] || best[k][a].r < r) best[k][a] = { r, i };
    }
    return { ys, best };
  };
  const rows = ({ ys, best }, out0, out1) => {
    for (let k = 0; k + 1 < ys.length; k++) {
      const T = best[k], B = best[k + 1];
      let prev = null;
      for (let a = 0; a <= NA; a++) {
        const ai = a % NA, t = T[ai], b = B[ai];
        if (!t || !b || Math.abs(t.r - b.r) > 0.05) { prev = null; continue; }
        const th = (ai + 0.5) / NA * Math.PI * 2, sx = Math.sin(th), sz = Math.cos(th);
        // 頭（面に沿う）・裾（前へ出る）・裾の戻り（段差の面）
        const v0 = put(sx * (t.r + out0), ys[k] - 0.002, sz * (t.r + out0) + cz, t.i);
        const v1 = put(sx * (b.r + out1), ys[k + 1] + 0.001, sz * (b.r + out1) + cz, b.i);
        const v2 = put(sx * (b.r + 0.0008), ys[k + 1] + 0.004, sz * (b.r + 0.0008) + cz, b.i);
        if (prev) { idx.push(prev[0], prev[1], v0, v0, prev[1], v1, prev[1], prev[2], v1, v1, prev[2], v2); }
        prev = [v0, v1, v2];
      }
    }
  };
  // 胴（胸板の下から胴の裾まで）：胴と腰の骨だけ（袖・腕は拾わない）
  if (torso) rows(sample(0.99, 1.39, (b) => /^(Spine|Hips|Chest)/.test(b)), 0.0012, 0.0042);
  // 草摺（腰から腿の上）：腰と腿の骨
  rows(sample(0.7, 0.97, (b) => /^(Hips|Spine|RightUpLeg|LeftUpLeg)/.test(b)), 0.0012, 0.0045);
  // 籠手の篠：前腕の外側に三本の縦の鉄の筋（肘から手首の手前まで）
  for (const sd of ['Left', 'Right']) {
    const je = DM.joints[sd + 'ForeArm'], jh = DM.joints[sd + 'Hand'];
    if (!je || !jh) continue;
    const e = new THREE.Vector3(...je), h = new THREE.Vector3(...jh), ax = h.clone().sub(e), L = ax.length(); ax.normalize();
    // 外側：体の中心から離れる向き（腕の軸に直交）
    const outv = new THREE.Vector3(e.x, 0, 0).normalize(); outv.addScaledVector(ax, -outv.dot(ax)).normalize();
    const side = ax.clone().cross(outv).normalize();
    const S = 7, st = [];
    for (let s = 0; s <= S; s++) {
      const t = 0.12 + 0.72 * s / S, c = e.clone().addScaledVector(ax, L * t);
      const row = [];
      for (const ang of [-0.5, 0, 0.5]) {
        const d = outv.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang));
        let bi = -1, br = 0;
        for (let i = 0; i < P.count; i++) {
          if (main(i) !== sd + 'ForeArm') continue;
          const v = new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i)).sub(c), al = v.dot(ax);
          if (Math.abs(al) > 0.02) continue;
          v.addScaledVector(ax, -al); const r = v.length(); if (r < 0.01 || v.dot(d) / r < 0.9) continue;
          if (r > br) { br = r; bi = i; }
        }
        row.push(bi < 0 ? null : { i: bi, p: c.clone().addScaledVector(d, br), d });
      }
      st.push(row);
    }
    for (let j = 0; j < 3; j++) {
      let prev = null;
      for (let s = 0; s <= S; s++) {
        const q = st[s][j]; if (!q) { prev = null; continue; }
        const w = 0.0055, up = 0.0035;
        const tg = q.d.clone().cross(ax).normalize();
        const a0 = put(...q.p.clone().addScaledVector(tg, -w).addScaledVector(q.d, 0.0008).toArray(), q.i);
        const a1 = put(...q.p.clone().addScaledVector(q.d, up).toArray(), q.i);
        const a2 = put(...q.p.clone().addScaledVector(tg, w).addScaledVector(q.d, 0.0008).toArray(), q.i);
        if (prev) idx.push(prev[0], a0, prev[1], prev[1], a0, a1, prev[1], a1, prev[2], prev[2], a1, a2);
        prev = [a0, a1, a2];
      }
    }
  }
  if (!idx.length) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  out.setIndex(idx); out.computeVertexNormals(); out.computeBoundingSphere();
  return out;
}
