// 馬具の原形。色や馬の大きさによらず、一度作った形を使い回す。
import * as THREE from 'three';

const bows = new Map();
export function saddleBow(w, h, wi, hi) {
  const key = [w, h, wi, hi].join('|');
  if (!bows.has(key)) {
    const s = new THREE.Shape();
    s.moveTo(-w, 0);
    s.bezierCurveTo(-w * 1.02, h * 0.62, -w * 0.62, h, 0, h);
    s.bezierCurveTo(w * 0.62, h, w * 1.02, h * 0.62, w, 0);
    s.lineTo(wi, 0);
    s.bezierCurveTo(wi * 0.95, hi * 1.3, -wi * 0.95, hi * 1.3, -wi, 0);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.028, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 8 });
    g.translate(0, 0, -0.014); bows.set(key, g);
  }
  return bows.get(key);
}

let stirrup = null;
// 足裏の面を原点にする。前が爪先、後ろへ長く延びる舌。輪だけの洋鐙にしない。
export function stirrupParts() {
  if (stirrup) return stirrup;
  const plate = new THREE.BoxGeometry(0.12, 0.014, 0.32); plate.translate(0, -0.007, -0.045);
  const hood = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  // 11/19 imac/look-cavalry：鳩胸が低い半球と細い棒で、板に載った黒い玉に見えた。舌長鐙（平塚市博物館の鉄舌長鐙・東博「芦穂蒔絵鞍・鐙」）は
  //   鳩胸が爪先を高く包んで、幅のある紋板へ細りながら鉸具頭へ立ち上がる。鳩胸を高く、棒を幅のある板に（面の数は同じ。docs/cavalry_look_1119.md）
  hood.scale(0.067, 0.125, 0.078); hood.translate(0, 0, 0.07);
  const neck = new THREE.BoxGeometry(0.052, 0.1, 0.014); neck.rotateX(0.25); neck.translate(0, 0.145, 0.06);
  const eye = new THREE.TorusGeometry(0.018, 0.005, 4, 8); eye.rotateY(Math.PI / 2); eye.translate(0, 0.2, 0.05);
  const red = new THREE.BoxGeometry(0.106, 0.003, 0.24); red.translate(0, 0.0015, -0.065);
  // 11/20 imac/look-cavalry 二回目：舌が平らな板一枚で深みが無かった。舌の両脇に低い縁を立て、足を載せる浅い舟の形に（色は東博「芦穂蒔絵鞍・鐙」と同じ、表は黒漆・足を置く面は朱漆のまま。形の縁は手本の頁で確かめていない）
  const rims = [1, -1].map((sd) => { const g = new THREE.BoxGeometry(0.008, 0.024, 0.3); g.translate(sd * 0.057, 0.004, -0.05); return [g, 0x141010]; });
  stirrup = [[plate, 0x141010], [hood, 0x141010], [neck, 0x141010], [eye, 0x3a3634], [red, 0x4a1612], ...rims];   // 11/8 critic60 根来 八1：踏み板の朱が日なたで桃色の平たい板に見えた。古びた朱漆の暗い赤へ
  return stirrup;
}

function flatBand(curve, N, w, c) {
  const pos = [], idx = [], tg = new THREE.Vector3(), n = new THREE.Vector3(), wd = new THREE.Vector3(), cc = new THREE.Vector3(...c);
  for (let i = 0; i <= N; i++) {
    const p = curve.getPointAt(i / N); curve.getTangentAt(i / N, tg);
    n.copy(p).sub(cc); n.y *= 0.5; n.addScaledVector(tg, -n.dot(tg)).normalize();
    wd.crossVectors(tg, n).normalize();
    for (const s of [-1, 1]) { const q = p.clone().addScaledVector(wd, s * w * 0.5).addScaledVector(n, 0.008); pos.push(q.x, q.y, q.z); }
  }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2, a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // 表裏で同じ点を使うので、面の向きは外向き（体の芯から離れる向き）に揃える
  const na = g.attributes.normal, pa = g.attributes.position;
  for (let i = 0; i < na.count; i++) { n.set(pa.getX(i) - cc.x, (pa.getY(i) - cc.y) * 0.5, pa.getZ(i) - cc.z).normalize(); na.setXYZ(i, n.x, n.y, n.z); }
  return g;
}
const harnesses = new Map();
// 簡略な馬にも、鞍から胸・尾の下へ続く紐と房を付ける。胴の一枚に混ぜる形を共有。
export function harnessParts(detail = false) {
  if (harnesses.has(detail)) return harnesses.get(detail);
  const parts = [];
  const paths = [
    [[0.24, 1.52, 0.25], [0.315, 1.4, 0.45], [0.3, 1.25, 0.68], [0.17, 1.15, 0.85], [0, 1.13, 0.9]],
    [[0.24, 1.5, -0.22], [0.33, 1.43, -0.42], [0.33, 1.29, -0.66], [0.2, 1.25, -0.83], [0, 1.3, -0.94]],
  ];
  const fringe = new THREE.CylinderGeometry(0.009, 0.032, 1, 5, 1, true);
  paths.forEach((pts, i) => {
    const all = [...pts, ...pts.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])];
    const curve = new THREE.CatmullRomCurve3(all.map((p) => new THREE.Vector3(...p)));
    // 11/20 imac/look-cavalry 三回目：遠くの馬の胸懸・尻懸も、近くの馬（humans_horse_tack.js の braid）と同じ平たい帯に（丸い管だと 30m の境で太さと形が跳ぶ）。
    //   体の面に沿って寝た表裏二枚の帯。面の数は管（四角・16 節＝128 三角）の半分
    parts.push([flatBand(curve, detail ? 24 : 16, 0.046, [0, 1.3, i === 0 ? 0.3 : -0.45]), false]);
    const ts = i === 0 ? (detail ? [0.3, 0.4, 0.5, 0.6, 0.7] : [0.3, 0.5, 0.7])
      : (detail ? [0.18, 0.26, 0.34, 0.66, 0.74, 0.82] : [0.22, 0.32, 0.68, 0.78]);
    const len = i === 0 ? 0.17 : 0.23;
    for (const t of ts) {
      const p = curve.getPointAt(t), g = fringe.clone();
      g.scale(1, len, 1); g.translate(p.x, p.y - len / 2, p.z);
      parts.push([g, true]);
    }
  });
  fringe.dispose();
  harnesses.set(detail, parts);
  return parts;
}
