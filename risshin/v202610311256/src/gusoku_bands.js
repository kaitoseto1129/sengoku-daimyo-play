// 名のある武将の近い具足に重ねる「形の」小札の段と籠手の篠（kaito 10/29：網が粗く、絵と法線だけでは段の凹凸が出ない）。
// 胴丸のスキャン（DM.hi）の立ち姿の面から、段ごとに少しずつ外へ出る帯を作る：段の頭は面に沿い、裾は 4mm ほど前へ出て下の段へ被さる。
// 裾の下に戻りの面（段差）を付けるので、日の向きで段ごとに陰が切れる。籠手は前腕の外側に、縦の細い篠を三本。
// 各頂点は一番近いスキャンの頂点の骨の重み・絵の座標をそのまま借りる（同じ骨と材質で描き、絵の色と模様も段にそろう）。
// 10/30：籠手は篠の下に鎖の地（前腕の外側を巻く薄い面）を敷き、篠は面取りした鉄の筋に。草摺は段を深くし、板（間）の切れ目を付ける。
// 各頂点に aBand（種類・沿う長さ・幅の位置）を持たせ、humans_armor.js の段の材質が陰・鎖の目・篠の黒漆を描く（0 胴の段・1 草摺・2 篠・3 鎖）。
// 読み込みの後に一度だけ作り、全員で使い回す（毎コマ作らない）。描く回数は武将一人につき一つ増えるだけ（近い段だけ）。
import * as THREE from 'three';

const ROW = 0.034;   // 札一段の高さ（humans_armor.js の小札の段の模様と同じ）
const NA = 64;       // 胴のまわりの割り（角度）

export function buildBands(DM, torso = true) {
  const g = DM.hi, P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
  const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bones = DM.bones;
  const main = (i) => { let bi = 0, bw = -1; for (let c = 0; c < 4; c++) { const w = SW.getComponent(i, c); if (w > bw) { bw = w; bi = SI.getComponent(i, c); } } return bones[bi] || ''; };
  const cz = -0.03;
  const pos = [], uv = [], si = [], sw = [], idx = [], bd = [];
  let kind = 0;
  const put = (x, y, z, src, a = 0, b = 0) => {
    pos.push(x, y, z); bd.push(kind, a, b); uv.push(UV ? UV.getX(src) : 0, UV ? UV.getY(src) : 0);
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
  // gap：草摺の板（間）の切れ目を、まわりの何割りごとに空けるか（0 は空けない）
  const rows = ({ ys, best }, out0, out1, gap = 0) => {
    for (let k = 0; k + 1 < ys.length; k++) {
      const T = best[k], B = best[k + 1];
      let prev = null;
      for (let a = 0; a <= NA; a++) {
        const ai = a % NA, t = T[ai], b = B[ai];
        if (!t || !b || Math.abs(t.r - b.r) > 0.05 || gap && ai % gap === 0) { prev = null; continue; }
        const th = (ai + 0.5) / NA * Math.PI * 2, sx = Math.sin(th), sz = Math.cos(th);
        // 頭（面に沿う）・裾（前へ出る）・裾の戻り（段差の面）
        const v0 = put(sx * (t.r + out0), ys[k] - 0.002, sz * (t.r + out0) + cz, t.i, 0, 0);
        const v1 = put(sx * (b.r + out1), ys[k + 1] + 0.001, sz * (b.r + out1) + cz, b.i, 0, 1);
        const v2 = put(sx * (b.r + 0.0008), ys[k + 1] + 0.004, sz * (b.r + 0.0008) + cz, b.i, 0, 2);
        // 裾の縁は戻りの面と頂点を分ける（法線をならさず、段の縁で光と陰をはっきり切る）
        const v1b = put(sx * (b.r + out1), ys[k + 1] + 0.001, sz * (b.r + out1) + cz, b.i, 0, 1);
        if (prev) { idx.push(prev[0], prev[1], v0, v0, prev[1], v1, prev[3], prev[2], v1b, v1b, prev[2], v2); }
        prev = [v0, v1, v2, v1b];
      }
    }
  };
  // 胴（胸板の下から胴の裾まで）：胴と腰の骨だけ（袖・腕は拾わない）
  kind = 0;
  if (torso) rows(sample(0.99, 1.39, (b) => /^(Spine|Hips|Chest)/.test(b)), 0.0012, 0.0042);
  // 草摺（腰から腿の上）：腰と腿の骨。胴より段を深く（裾 8mm）、八間の板の切れ目
  kind = 1;
  rows(sample(0.7, 0.97, (b) => /^(Hips|Spine|RightUpLeg|LeftUpLeg)/.test(b)), 0.0012, 0.008, NA / 8);
  // 籠手：前腕の外側を巻く鎖の地と、その上の縦の篠三本（肘から手首の手前まで）
  const ANG = [-1.5, -1.2, -0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2, 1.5], SHINO = [3, 5, 7];   // 篠は -0.6・0・0.6 の向き
  for (const sd of ['Left', 'Right']) {
    const je = DM.joints[sd + 'ForeArm'], jh = DM.joints[sd + 'Hand'];
    if (!je || !jh) continue;
    const e = new THREE.Vector3(...je), h = new THREE.Vector3(...jh), ax = h.clone().sub(e), L = ax.length(); ax.normalize();
    // 外側：体の中心から離れる向き（腕の軸に直交）
    const outv = new THREE.Vector3(e.x, 0, 0).normalize(); outv.addScaledVector(ax, -outv.dot(ax)).normalize();
    const side = ax.clone().cross(outv).normalize();
    const fa = [];   // 前腕の頂点だけを先に集める
    for (let i = 0; i < P.count; i++) if (main(i) === sd + 'ForeArm') fa.push(i);
    const S = 12, grid = [];
    for (let s = 0; s <= S; s++) {
      const t = 0.1 + 0.76 * s / S, c = e.clone().addScaledVector(ax, L * t);
      const row = ANG.map((ang) => {
        const d = outv.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang));
        let bi = -1, br = 0;
        for (const i of fa) {
          const v = new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i)).sub(c), al = v.dot(ax);
          if (Math.abs(al) > 0.02) continue;
          v.addScaledVector(ax, -al); const r = v.length(); if (r < 0.01 || v.dot(d) / r < 0.9) continue;
          if (r > br) { br = r; bi = i; }
        }
        return bi < 0 ? null : { i: bi, r: br, c, d, ang };
      });
      // 網が粗いので、まわりの半径をならす（鎖の地が波打たない）
      //   ならした値が元の点より内へ入る所は元の点のまま（面の内へ沈めない）
      const rr = row.map((q, j) => { if (!q) return 0; let sm = 0, n = 0; for (const k of [j - 1, j, j + 1]) if (row[k]) { sm += row[k].r; n++; } return Math.max(q.r, sm / n); });
      row.forEach((q, j) => { if (q) q.r = rr[j]; });
      grid.push({ row, al: L * t });
    }
    // 鎖の地：篠の下に 1.6mm 浮かせた面。絵の座標は近いスキャンの点（色は材質の側で鎖に描き替える）
    kind = 3;
    const cv = grid.map(({ row, al }) => row.map((q) => q && put(...q.c.clone().addScaledVector(q.d, q.r + 0.0016).toArray(), q.i, al, q.ang * q.r)));
    for (let s = 0; s < S; s++) for (let j = 0; j + 1 < ANG.length; j++) {
      const a0 = cv[s][j], a1 = cv[s][j + 1], b0 = cv[s + 1][j], b1 = cv[s + 1][j + 1];
      if (a0 == null || a1 == null || b0 == null || b1 == null) continue;
      // 外を向く巻き（ax × side は内向きなので、side を先に）
      idx.push(a0, a1, b0, a1, b1, b0);
    }
    // 篠：面取りした鉄の筋（端・肩・稜・肩・端の五点）。鎖の地の上に据える
    kind = 2;
    const w = 0.0068, up = 0.0048;
    for (const j of SHINO) {
      let prev = null;
      for (let s = 0; s <= S; s++) {
        const q = grid[s].row[j]; if (!q) { prev = null; continue; }
        const p = q.c.clone().addScaledVector(q.d, q.r + 0.0018), tg = q.d.clone().cross(ax).normalize(), tt = s / S;
        const cur = [[-w, 0, 0], [-w * 0.6, up, 0.25], [0, up * 1.12, 0.5], [w * 0.6, up, 0.75], [w, 0, 1]]
          .map(([o, hgt, bb]) => put(...p.clone().addScaledVector(tg, o).addScaledVector(q.d, hgt).toArray(), q.i, tt, bb));
        if (prev) for (let k = 0; k < 4; k++) idx.push(prev[k], cur[k], prev[k + 1], prev[k + 1], cur[k], cur[k + 1]);
        prev = cur;
      }
    }
  }
  if (!idx.length) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  out.setAttribute('aBand', new THREE.Float32BufferAttribute(bd, 3));
  out.setIndex(idx); out.computeVertexNormals(); out.computeBoundingSphere();
  return out;
}
