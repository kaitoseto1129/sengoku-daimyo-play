// 名のある武将の前立・脇立・後立を本物の形で作る（kaito 10/28「兜と甲冑を写真の水準に」）。
// 形の座標：錣の裾が y=0、鉢の軸が x=z=0、前が +z、1 = 1m（kabuto_real.js・named_kacchu の立物と同じ）。
// 返す形：[主の形, 材質の鍵, [[添えの形, 材質の鍵], ...]]。鍵は gold・silver・black・white（humans_armor の crestMats と furMaterial）。
// hi：近い形（縁の面取り・細かい枝・銭の郭・毛の三層）。遠い形は枚数を落とした輪郭だけ。一度作って使い回す（毎コマ作らない）。
// 寸法と枚数は伝来品の写真の見え方に合わせた復元案（実測ではない）。字は入れない。
//   政宗：黒漆五枚胴具足の兜の弦月（仙台市博物館）　信繁：鹿角脇立と六文銭（伝来の写し）　信玄：諏訪法性の兜（白熊・獅子噛・鍬形）
//   謙信：飯綱明神の前立（稽照殿）　家康：伊予札黒糸威胴丸具足の歯朶の前立（久能山東照宮）　秀吉：一の谷馬藺後立付兜
//   如水：銀白檀塗合子形兜（もりおか歴史文化館）　高虎：黒漆塗唐冠形兜（伊賀上野）　忠勝：黒糸威胴丸具足の鹿角脇立
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 武将 → 前立の種類（kacchu_data.js の KACCHU[名].crest に入れる）
export const MAEDATE = {
  伊達政宗: 'date_moon',
  真田信繁: 'sanada_rokumon', 真田幸村: 'sanada_rokumon',
  武田信玄: 'suwa_hossho',
  上杉謙信: 'kenshin_izuna',
  徳川家康: 'ieyasu_shida',
  羽柴秀吉: 'hideyoshi_bari', 豊臣秀吉: 'hideyoshi_bari',
  黒田官兵衛: 'kuroda_goshi', 黒田如水: 'kuroda_goshi',
  藤堂高虎: 'todo_tokan',
  本多忠勝: 'honda_shika',
};
const KINDS = new Set(Object.values(MAEDATE));
export const isMaedate = (k) => KINDS.has(k);
const cache = new Map();

const clean = (g) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const a of Object.keys(n.attributes)) if (a !== 'position' && a !== 'normal') n.deleteAttribute(a);
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
};
const join = (gs) => { const g = mergeGeometries(gs.map(clean)); g.computeBoundingSphere(); return g; };
const V2 = (pts) => pts.map(([a, b]) => new THREE.Vector2(a, b));
// 打ち出しの薄板。近い形は縁を丸く落として照りの線を立てる
const plate = (pts, hi, d = 0.004, holes = []) => {
  const s = new THREE.Shape(V2(pts));
  for (const h of holes) s.holes.push(new THREE.Path(V2(h)));
  const g = new THREE.ExtrudeGeometry(s, hi
    ? { depth: d, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0013, bevelSegments: 1, curveSegments: 6 }
    : { depth: d, bevelEnabled: false, curveSegments: 3 });
  g.translate(0, 0, -d / 2); return g;
};
// 根元から先へ細る管（鹿角の枝・狐の尾）。先は丸く閉じる
const horn = (pts, r0, r1, hi, ease = 0.8) => {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), T = hi ? 12 : 4, R = hi ? 7 : 4;
  const g = new THREE.TubeGeometry(c, T, 1, R), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i <= T; i++) {
    const o = c.getPointAt(i / T), r = r0 + (r1 - r0) * Math.pow(i / T, ease);
    for (let j = 0; j <= R; j++) { const k = i * (R + 1) + j; v.fromBufferAttribute(p, k).sub(o).multiplyScalar(r).add(o); p.setXYZ(k, v.x, v.y, v.z); }
  }
  g.computeVertexNormals();
  const tip = new THREE.SphereGeometry(r1, hi ? 5 : 3, hi ? 4 : 2); tip.translate(...pts[pts.length - 1]);
  return join([g, tip]);
};
// 鉢の丸みに沿って左右の先を後ろへ反らす
const bend = (g, k) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, p.getZ(i) - k * x * x); } return g; };
const ball = (r, x, y, z, sx = 1, sy = 1, sz = 1, hi = true) => { const g = new THREE.SphereGeometry(r, hi ? 10 : 5, hi ? 7 : 4); g.scale(sx, sy, sz); g.translate(x, y, z); return g; };
// 立物を挿す黒漆の台（祓立）。前立の根元を鉢へ付ける
const haraidate = (y, z, w = 0.034, hi = true) => {
  const g = new THREE.CylinderGeometry(w * 0.5, w * 0.38, 0.034, hi ? 12 : 6); g.scale(1, 1, 0.45); g.translate(0, y, z); return g;
};
// 鍬形の刃：二次曲線の芯に沿って幅 w0→w1 で細る板（sd で左右）
const blade = (sd, p0, p1, p2, w0, w1, hi) => {
  const L = [], R = [], N = hi ? 16 : 6;
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = (1 - t) ** 2, b = 2 * (1 - t) * t, e = t * t;
    const x = a * p0[0] + b * p1[0] + e * p2[0], y = a * p0[1] + b * p1[1] + e * p2[1];
    const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    const l = Math.hypot(dx, dy) || 1, w = (w0 + (w1 - w0) * t) / 2;
    L.push([sd * (x - dy / l * w), y + dx / l * w]); R.push([sd * (x + dy / l * w), y - dx / l * w]);
  }
  return plate(sd > 0 ? [...R, ...L.reverse()] : [...L, ...R.reverse()], hi, 0.004);
};

function build(kind, hi, near) {
  if (kind === 'date_moon') {
    // 弦月：大きな円の下の細い弧を二つの円で切り抜いた三日月。鉢の幅の三倍に届き、真ん中で指二本ほど、両の先は針のように尖る。
    // 本人の右（-x）が少し短い（刀を振る邪魔にならないように、と伝わる）。台は黒漆の祓立
    const N = hi ? 56 : 18, R0 = 0.62, W = 0.036, A = 0.88;   // 円の中心は上（0, R0）。A：真下から先までの角
    const outer = [], inner = [];
    for (let i = 0; i <= N; i++) {
      const a = -A + (2 * A) * i / N, s = Math.sin(a), c = Math.cos(a);
      const k = s < 0 ? 0.9 : 1;   // 右の先を詰める
      outer.push([R0 * s * k, R0 * (1 - c)]);
      // 上の縁：同じ中心で半径を w だけ小さく。先で外の弧に寄って尖る
      const w = W * Math.pow(Math.max(0, 1 - Math.abs(a) / A), 0.85);
      inner.push([(R0 - w) * s * k, R0 - (R0 - w) * c]);
    }
    const g = plate([...outer, ...inner.reverse().slice(1, -1)], hi, 0.005);
    g.translate(0, 0.215, 0.172); bend(g, 0.28);
    // 月の中ほどを台で受ける
    const parts = [haraidate(0.205, 0.168, 0.034, hi)];
    return [join([g]), 'gold', [[join(parts), 'black']]];
  }
  if (kind === 'sanada_rokumon') {
    // 真田の兜：黒漆の大きな鹿角の脇立と、前に金の六文銭（三つずつ二段）。銭は縁の輪と四角い穴の郭を鋳出す
    const coins = [], cr = 0.023, q = 0.0065;
    for (let r = 0; r < 2; r++) for (let c = -1; c <= 1; c++) {
      const x = c * 0.051, y = 0.262 - r * 0.05, z = 0.17 + (r ? 0.004 : 0), M = hi ? 20 : 8, ring = [];
      for (let i = 0; i < M; i++) { const a = i / M * Math.PI * 2; ring.push([Math.cos(a) * cr, Math.sin(a) * cr]); }
      const g = plate(ring, hi, 0.003, [[[-q, -q], [-q, q], [q, q], [q, -q]].reverse()]); g.translate(x, y, z); coins.push(g);
      if (hi) {
        const rim = new THREE.TorusGeometry(cr - 0.0016, 0.0016, 3, 20); rim.translate(x, y, z + 0.0035); coins.push(rim);
        const sq = new THREE.TorusGeometry(q * 1.45, 0.0013, 3, 4); sq.rotateZ(Math.PI / 4); sq.translate(x, y, z + 0.0035); coins.push(sq);
      }
    }
    const black = [];
    // 銭を並べる黒漆の板（前立の台）
    if (hi) { const b = new THREE.BoxGeometry(0.17, 0.11, 0.004); b.translate(0, 0.237, 0.166); black.push(b); }
    black.push(haraidate(0.19, 0.163, 0.04, hi));
    for (const sd of [-1, 1]) {
      const X = (p) => [sd * p[0], p[1], p[2]];
      // 本角：太い根元から外へ開いて上へ伸び、先は後ろへ流れる。枝は前と外へ三本。どれも先へ細る
      black.push(horn([[0.125, 0.16, 0.02], [0.17, 0.25, 0.01], [0.2, 0.36, -0.02], [0.215, 0.5, -0.06], [0.2, 0.64, -0.1]].map(X), 0.022, 0.005, hi));
      black.push(horn([[0.183, 0.3, -0.004], [0.25, 0.36, 0.01], [0.3, 0.44, 0.0]].map(X), 0.014, 0.004, hi));
      black.push(horn([[0.212, 0.46, -0.05], [0.28, 0.52, -0.06], [0.32, 0.62, -0.08]].map(X), 0.012, 0.0035, hi));
      if (hi) black.push(horn([[0.2, 0.22, 0.015], [0.245, 0.245, 0.04], [0.265, 0.29, 0.05]].map(X), 0.011, 0.003, hi));
      black.push(ball(0.026, sd * 0.127, 0.163, 0.02, 1.1, 0.9, 1, hi));
    }
    return [join(coins), 'gold', [[join(black), 'black']]];
  }
  if (kind === 'suwa_hossho') {
    // 諏訪法性：鉢を覆って肩まで垂れる白熊（ヤクの白い毛）、前に金の獅子噛と大きな鍬形。
    // 遠い形は units_model の kabuto_suwa が白熊と獅子を描くので、近い兜（スキャン）だけで足す
    const gold = [];
    for (const sd of [-1, 1]) gold.push(bend(clean(blade(sd, [0.03, 0], [0.2, 0.06], [0.27, 0.33], 0.07, 0.03, hi)).translate(0, 0.175, 0.166), 0.4));
    // 獅子噛：たてがみの波打つ縁の顔。眉・目・鼻・牙を盛り上げる
    const M = hi ? 22 : 10, face = [];
    for (let i = 0; i < M; i++) { const a = i / M * Math.PI * 2, r = i % 2 ? 0.042 : 0.052; face.push([Math.cos(a) * r, Math.sin(a) * r * 0.9]); }
    const fg = new THREE.ExtrudeGeometry(new THREE.Shape(V2(face)), { depth: 0.012, bevelEnabled: hi, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
    fg.translate(0, 0.215, 0.16); gold.push(fg);
    gold.push(ball(0.012, 0, 0.208, 0.182, 1.2, 0.9, 1, hi));
    if (hi) for (const sd of [-1, 1]) {
      gold.push(ball(0.009, sd * 0.018, 0.226, 0.181));
      const brow = new THREE.BoxGeometry(0.026, 0.007, 0.008); brow.rotateZ(sd * -0.35); brow.translate(sd * 0.02, 0.239, 0.179); gold.push(brow);
      const fang = new THREE.ConeGeometry(0.004, 0.015, 4); fang.rotateX(Math.PI); fang.translate(sd * 0.012, 0.191, 0.181); gold.push(fang);
      const ear = new THREE.ConeGeometry(0.008, 0.02, 4); ear.rotateZ(sd * -0.6); ear.translate(sd * 0.04, 0.255, 0.17); gold.push(ear);
    }
    // 白熊：細い房を層に重ねる。内の層は短く鉢に沿い、外の層ほど長く広がる。顔の前（±50°）には出さない。
    // 毛先の抜きと陰は kabuto_real の furMaterial が位置から描く（y の範囲を合わせる）
    const fur = [];
    const cap = new THREE.SphereGeometry(0.152, hi ? 20 : 10, hi ? 8 : 4, 0, Math.PI * 2, 0, 1.15); cap.scale(1.14, 1.12, 1.16); cap.translate(0, 0.135, -0.01); fur.push(cap);
    const layers = hi ? [[0.0, 0.85, 110], [0.035, 1.0, 100], [0.07, 1.12, 84]] : [[0.03, 1.0, 26]];
    let k = 0;
    for (const [dr, lk, N] of layers) for (let i = 0; i < N; i++, k++) {
      const h1 = ((k * 53) % 17) / 17, j = ((k * 37) % 11) / 11;
      const a = Math.PI * 0.3 + ((i + h1 * 0.8) / N) * Math.PI * 1.4, sa = Math.sin(a), ca = Math.cos(a);
      const len = (0.46 + j * 0.18 + (Math.abs(ca) > 0.8 ? 0.08 : 0)) * lk, out = (0.22 + j * 0.07) * lk + dr, r0 = 0.13 + dr * 0.4, y0 = 0.31 - j * 0.04 - dr * 0.3;
      const w0 = hi ? 0.006 : 0.03, w1 = hi ? 0.016 + 0.012 * j : 0.07, seg = hi ? 3 : 2, pos = [], idx = [];
      for (let qq = 0; qq <= 3; qq++) {
        const t = qq / 3, sw = Math.sqrt(t), rr = r0 + (out - 0.13) * sw, w = qq === 3 ? w0 * 0.3 : w0 + (w1 - w0) * Math.sin(t * Math.PI * 0.6);
        const cx = sa * rr, cy = y0 - len * t, cz = ca * rr - 0.03 * t;
        for (let r = 0; r <= seg; r++) { const u = r / seg * 2 - 1, bu = Math.sqrt(1 - u * u) * w * 0.35; pos.push(cx + ca * u * w + sa * bu, cy, cz - sa * u * w + ca * bu); }
      }
      for (let qq = 0; qq < 3; qq++) for (let r = 0; r < seg; r++) { const a0 = qq * (seg + 1) + r, b0 = a0 + seg + 1; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      fur.push(g);
    }
    return [join(gold), 'gold', [[join(fur), 'white']]];
  }
  if (kind === 'kenshin_izuna') {
    // 飯綱明神：雲の上を駆ける白狐に、翼を広げた烏天狗の姿の明神が立つ。右手に剣、左手に索。背に舟形の火焔の光背。
    // 金の打ち出し。近い形は狐と明神を立体で、遠い形は光背・雲・狐・明神を輪郭の板で
    const gold = [], Z = 0.17;
    // 火焔の光背：下が広く上が尖る舟形。縁に小さな炎の波
    {
      const pts = [], N = hi ? 52 : 18;
      for (let i = 0; i < N; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / N, up = Math.max(0, Math.sin(a));
        const r = 0.085 * (1 + (hi ? 0.12 : 0.06) * Math.sin(a * 9) ** 2 * (0.3 + up));
        pts.push([Math.cos(a) * r * (1 - 0.35 * up * up), Math.max(-0.06, Math.sin(a) * r * (1.25 + 0.6 * up ** 3))]);
      }
      const g = plate(pts, hi, 0.003); g.translate(0, 0.335, Z - 0.022); gold.push(g);
    }
    // 雲：足元に敷く三つ巻きの雲
    const cloud = [[-0.11, 0], [-0.125, 0.018], [-0.1, 0.034], [-0.07, 0.024], [-0.045, 0.04], [-0.012, 0.03], [0.02, 0.042], [0.05, 0.026], [0.08, 0.038], [0.115, 0.02], [0.1, 0], [0.03, -0.008], [-0.05, -0.008]];
    { const g = plate(cloud, hi, 0.008); g.translate(0, 0.19, Z); gold.push(g); }
    if (hi) for (const [x, y, r] of [[-0.085, 0.215, 0.016], [-0.02, 0.222, 0.018], [0.05, 0.218, 0.016]]) gold.push(ball(r, x, y, Z + 0.004, 1.3, 0.8, 0.7));
    if (hi) {
      // 狐：右（+x）へ駆ける。胴・首・頭・尖った鼻・立つ耳・四つの脚・後ろへ巻き上がる太い尾
      gold.push(ball(0.05, 0, 0.255, Z, 1, 0.42, 0.42));
      gold.push(horn([[0.035, 0.258, Z], [0.055, 0.275, Z], [0.065, 0.287, Z]], 0.016, 0.014, true));
      gold.push(ball(0.017, 0.072, 0.29, Z, 1.1, 0.9, 0.9));
      { const s = new THREE.ConeGeometry(0.009, 0.03, 6); s.rotateZ(-Math.PI / 2 - 0.15); s.translate(0.098, 0.286, Z); gold.push(s); }
      for (const dz of [-0.007, 0.007]) { const e = new THREE.ConeGeometry(0.005, 0.018, 4); e.rotateZ(-0.25); e.translate(0.07, 0.31, Z + dz); gold.push(e); }
      for (const [x, ax, dz] of [[0.032, 0.5, 0.008], [0.025, 0.9, -0.008], [-0.03, -0.6, 0.008], [-0.036, -1.0, -0.008]]) {
        gold.push(horn([[x, 0.25, Z + dz], [x + ax * 0.012, 0.232, Z + dz], [x + ax * 0.024, 0.218, Z + dz]], 0.0055, 0.0035, true));
      }
      gold.push(horn([[-0.045, 0.258, Z], [-0.08, 0.265, Z - 0.004], [-0.1, 0.295, Z - 0.008], [-0.085, 0.325, Z - 0.01]], 0.013, 0.006, true, 1.4));
      // 明神：狐の背に立つ。胴・袴の裾・頭と嘴・兜巾。翼は背から左右へ。右手に剣、左手に索の輪
      gold.push(ball(0.02, 0, 0.312, Z + 0.006, 1, 1.5, 0.75));
      { const h = new THREE.CylinderGeometry(0.016, 0.026, 0.03, 10); h.scale(1, 1, 0.7); h.translate(0, 0.283, Z + 0.006); gold.push(h); }
      gold.push(ball(0.014, 0, 0.352, Z + 0.008));
      { const b = new THREE.ConeGeometry(0.0055, 0.018, 6); b.rotateX(Math.PI / 2); b.translate(0, 0.348, Z + 0.026); gold.push(b); }
      { const t = new THREE.CylinderGeometry(0.006, 0.009, 0.01, 8); t.translate(0, 0.368, Z + 0.008); gold.push(t); }
      for (const sd of [-1, 1]) {
        // 翼：羽根の先が三つ四つに分かれる板
        const w = plate([[0, 0], [0.03, 0.012], [0.07, 0.045], [0.072, 0.03], [0.06, 0.018], [0.075, 0.012], [0.062, 0.0], [0.07, -0.012], [0.05, -0.012], [0.035, -0.02], [0.015, -0.012]].map(([x, y]) => [sd * x, y]), true, 0.003);
        w.translate(sd * 0.012, 0.325, Z - 0.006); gold.push(bend(clean(w), 0.6));
        gold.push(horn([[sd * 0.016, 0.33, Z + 0.006], [sd * 0.03, 0.315, Z + 0.016], [sd * 0.032, 0.33, Z + 0.022]], 0.0045, 0.004, true));
      }
      { const sw = new THREE.BoxGeometry(0.004, 0.065, 0.0025); sw.translate(0.033, 0.362, Z + 0.022); gold.push(sw); }
      { const gd = new THREE.BoxGeometry(0.014, 0.003, 0.004); gd.translate(0.033, 0.33, Z + 0.022); gold.push(gd); }
      { const rope = new THREE.TorusGeometry(0.011, 0.0015, 3, 14); rope.translate(-0.036, 0.322, Z + 0.022); gold.push(rope); }
    } else {
      gold.push(plate([[-0.08, 0.03], [-0.06, 0.07], [0.06, 0.07], [0.1, 0.11], [0.11, 0.07], [0.08, 0.03]], false, 0.012).translate(0, 0.2, Z));
      gold.push(plate([[-0.02, 0.14], [-0.07, 0.17], [-0.02, 0.18], [0, 0.2], [0.02, 0.18], [0.07, 0.17], [0.02, 0.14]], false, 0.01).translate(0, 0.17, Z + 0.004));
    }
    return [join(gold), 'gold', [[join([haraidate(0.18, Z - 0.004, 0.04, hi)]), 'black']]];
  }
  if (kind === 'ieyasu_shida') {
    // 歯朶（裏白）の前立：台から左右へ扇に開く二枚の大きな金の葉と、真ん中に立つ短い一枚。軸に沿って小葉が並び、先ほど小さい
    const parts = [];
    const frond = (P, n, L0, w0) => {
      for (let i = 0; i < n; i++) {
        const t = 0.06 + 0.92 * i / n, p = P(t), q = P(t + 0.02), dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy);
        const tx = dx / l, ty = dy / l, L = L0 * (1 - t * 0.75), w = w0 * (1 - t * 0.5);
        for (const s of [-1, 1]) {
          const nx = -ty * s, ny = tx * s, ax = nx * 0.8 + tx * 0.6, ay = ny * 0.8 + ty * 0.6;
          // 小葉：根元が広く先が尖る。近い形は縁に一つ鋸の歯
          const pts = [[p.x - tx * w, p.y - ty * w], [p.x + ax * L * 0.5 - tx * w * 0.7, p.y + ay * L * 0.5 - ty * w * 0.7]];
          if (hi) pts.push([p.x + ax * L * 0.72 - tx * w * 0.2, p.y + ay * L * 0.72 - ty * w * 0.2]);
          pts.push([p.x + ax * L, p.y + ay * L], [p.x + ax * L * 0.5 + tx * w, p.y + ay * L * 0.5 + ty * w], [p.x + tx * w, p.y + ty * w]);
          parts.push(plate(pts, hi, 0.003));
        }
      }
      const sp = []; for (let i = 0; i <= 10; i++) { const p = P(i / 10); sp.push([p.x, p.y]); }
      for (let i = 10; i >= 0; i--) { const p = P(i / 10); sp.push([p.x, p.y + 0.007 * (1 - i / 12)]); }
      parts.push(plate(sp, hi, 0.004));
    };
    const n = hi ? 13 : 6;
    for (const sd of [-1, 1]) frond((t) => new THREE.Vector2(sd * (0.012 + 0.2 * t + 0.03 * t * t), 0.03 + 0.27 * t - 0.06 * t * t), n, 0.075, 0.011);
    frond((t) => new THREE.Vector2(0.004 * Math.sin(t * 3), 0.035 + 0.16 * t), hi ? 8 : 4, 0.045, 0.008);
    const g = join(parts.map((q) => q.translate(0, 0.17, 0.165))); bend(g, 0.5);
    return [g, 'gold', [[join([haraidate(0.18, 0.163, 0.04, hi)]), 'black']]];
  }
  if (kind === 'hideyoshi_bari') {
    // 一の谷馬藺後立：鉢の後ろから光の輪のように開く二十九本の細く尖った金の葉。葉は中ほどで少しひねり、外の葉ほど後ろへ寝る
    const parts = [], N = hi ? 29 : 13, L = 0.5;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1) - 0.5, a = u * Math.PI * 1.15, w = 0.016;
      const g = plate([[0, 0], [w, L * 0.25], [w * 0.75, L * 0.75], [0, L], [-w * 0.75, L * 0.75], [-w, L * 0.25]], hi, 0.003);
      if (hi) g.rotateY(u * 0.6);
      g.rotateZ(-a); g.rotateX(-0.18 - Math.abs(u) * 0.25); g.translate(0, 0, -i * 0.0004); parts.push(g);
    }
    const g = join(parts); g.translate(0, 0.27, -0.145);
    const dai = new THREE.CylinderGeometry(0.03, 0.02, 0.07, hi ? 12 : 6); dai.translate(0, 0.25, -0.145);
    return [g, 'gold', [[join([dai]), 'black']]];
  }
  if (kind === 'kuroda_goshi') {
    // 銀白檀塗の合子形：鉢の上へ伏せた蓋付きの椀。中ほどに蓋の合わせ目の段、頂は平らな蓋の上に低い高台の輪
    const prof = [[0.158, 0.13], [0.166, 0.16], [0.18, 0.22], [0.184, 0.262], [0.188, 0.268], [0.186, 0.276], [0.178, 0.31], [0.158, 0.35], [0.12, 0.383], [0.07, 0.398], [0.0, 0.4]].map(([r, y]) => new THREE.Vector2(r, y));
    const parts = [new THREE.LatheGeometry(prof, hi ? 36 : 12)];
    const lip = new THREE.TorusGeometry(0.16, 0.006, 4, hi ? 32 : 12); lip.rotateX(Math.PI / 2); lip.translate(0, 0.135, 0); parts.push(lip);
    if (hi) { const foot = new THREE.CylinderGeometry(0.05, 0.055, 0.014, 24, 1, true); foot.translate(0, 0.405, 0); parts.push(foot); }
    else parts.push(ball(0.04, 0, 0.402, 0, 1, 0.25, 1, false));
    const g = join(parts); g.scale(1, 1, 1.06); g.translate(0, 0, -0.008);
    return [g, 'silver'];
  }
  if (kind === 'todo_tokan') {
    // 唐冠形：黒漆の冠形の鉢、後ろに丸く立つ巾子（こじ）、左右へ長く張った銀の纓（えい）。
    // 遠い形は units_model の丸い頭形の鉢が冠を兼ねるので、巾子と纓だけを載せる
    const prof = [[0.156, 0.13], [0.16, 0.2], [0.155, 0.27], [0.135, 0.315], [0.08, 0.335], [0.0, 0.34]].map(([r, y]) => new THREE.Vector2(r, y));
    const cap = new THREE.LatheGeometry(prof, hi ? 28 : 10); cap.scale(1, 1, 1.06);
    const kp = [[0.07, 0], [0.072, 0.06], [0.066, 0.095], [0.05, 0.118], [0.026, 0.128], [0, 0.131]].map(([r, y]) => new THREE.Vector2(r, y));
    const koji = new THREE.LatheGeometry(kp, hi ? 20 : 8); koji.scale(1.15, 1, 0.62); koji.translate(0, near ? 0.27 : 0.25, near ? -0.07 : -0.1);
    const wings = [];
    for (const sd of [-1, 1]) {
      // 纓：根元が細く、先が丸く広がる長い薄板。少し上へ反り、先ほど後ろへ流れる
      const pts = [[0.05, -0.012]], N = hi ? 8 : 4;
      for (let i = 0; i <= N; i++) { const a = -Math.PI / 2 + i * Math.PI / N; pts.push([0.52 + Math.cos(a) * 0.04, 0.012 + Math.sin(a) * 0.04]); }
      pts.push([0.05, 0.012]);
      const g = plate(pts.map(([x, y]) => [sd * x, y]), hi, 0.005);
      g.rotateZ(sd * 0.14); bend(g, 0.12); g.translate(0, near ? 0.34 : 0.33, near ? -0.08 : -0.11); wings.push(g);
    }
    return [join(near ? [cap, koji] : [koji]), 'black', [[join(wings), 'silver']]];
  }
  if (kind === 'honda_shika') {
    // 鹿角脇立：和紙を張り重ねた黒漆の大きな鹿角。鉢の左右から外へ開き、頭の二倍の高さまで立つ。
    // 本角に前へ出る眉枝・外への二の枝・先の二股。太い根元から先へ細る（平たい板にしない）
    const parts = [];
    for (const sd of [-1, 1]) {
      const X = (p) => [sd * p[0], p[1], p[2]];
      parts.push(horn([[0.12, 0.17, -0.01], [0.165, 0.28, -0.02], [0.215, 0.42, -0.045], [0.25, 0.56, -0.07], [0.255, 0.7, -0.095]].map(X), 0.027, 0.012, hi));
      parts.push(horn([[0.15, 0.24, -0.015], [0.2, 0.27, 0.03], [0.24, 0.32, 0.06]].map(X), 0.016, 0.004, hi));
      parts.push(horn([[0.205, 0.39, -0.04], [0.29, 0.44, -0.04], [0.36, 0.52, -0.05]].map(X), 0.015, 0.004, hi));
      parts.push(horn([[0.252, 0.66, -0.09], [0.31, 0.72, -0.1], [0.35, 0.8, -0.11]].map(X), 0.012, 0.003, hi));
      parts.push(horn([[0.255, 0.68, -0.093], [0.235, 0.76, -0.1], [0.23, 0.83, -0.105]].map(X), 0.011, 0.003, hi));
      if (hi) parts.push(horn([[0.235, 0.5, -0.06], [0.2, 0.57, -0.04], [0.19, 0.63, -0.035]].map(X), 0.011, 0.003, hi));
      parts.push(ball(0.03, sd * 0.12, 0.17, -0.01, 1.1, 0.9, 1, hi));
    }
    return [join(parts), 'black'];
  }
  return null;
}

// near：近い兜（スキャン）の時だけ true。諏訪法性は遠い形では返さない（units_model の kabuto_suwa が描く）
export function maedateGeometry(kind, hi = true, near = false) {
  if (!KINDS.has(kind)) return undefined;
  if (kind === 'suwa_hossho' && !near) return null;
  const key = kind + (hi ? '|近' : '|遠') + (near && kind === 'todo_tokan' ? '|兜' : '');
  if (!cache.has(key)) cache.set(key, build(kind, hi, near));
  return cache.get(key);
}
