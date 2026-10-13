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
