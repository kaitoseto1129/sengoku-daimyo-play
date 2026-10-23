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
  hood.scale(0.067, 0.085, 0.075); hood.translate(0, 0, 0.07);
  const neck = new THREE.BoxGeometry(0.03, 0.12, 0.018); neck.rotateX(0.25); neck.translate(0, 0.13, 0.065);
  const eye = new THREE.TorusGeometry(0.018, 0.005, 4, 8); eye.rotateY(Math.PI / 2); eye.translate(0, 0.2, 0.05);
  const red = new THREE.BoxGeometry(0.106, 0.003, 0.24); red.translate(0, 0.0015, -0.065);
  stirrup = [[plate, 0x141010], [hood, 0x141010], [neck, 0x141010], [eye, 0x3a3634], [red, 0x7a1a12]];
  return stirrup;
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
    parts.push([new THREE.TubeGeometry(curve, detail ? 24 : 16, 0.018, 4, false), false]);
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
