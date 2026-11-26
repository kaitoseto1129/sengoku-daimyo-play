import * as THREE from 'three';
import { S } from '../settings.js';
import { isNoRender } from '../world_common.js';

// 巻二・九月九日の多芸焼き。城の近隣には置かず、封鎖を果たした後の別景とする。
// 谷・御殿・田の細かな形は推定。人・甲冑は作らない。
export function play(rt) {
  const duration = 6;
  if (isNoRender()) return duration;
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;z-index:45;background:#353b39;pointer-events:none';
  root.setAttribute('aria-label', '九月九日　多芸谷の焼き払い');
  const title = document.createElement('div');
  title.textContent = '九月九日　多芸谷';
  title.style.cssText = 'position:absolute;top:8%;width:100%;text-align:center;color:#fff4dc;font:22px serif;text-shadow:0 2px 5px #000';
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false }); }
  catch { return 0; } // 描けない端末でも開城と結果を止めない。
  renderer.setPixelRatio(1);
  renderer.setSize(800, 450);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover';
  root.append(renderer.domElement, title);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x626a68);
  scene.fog = new THREE.Fog(0x626a68, 45, 135);
  const camera = new THREE.PerspectiveCamera(46, 800 / 450, .1, 180);
  camera.position.set(27, 16, 43); camera.lookAt(0, 3, -9);
  scene.add(new THREE.HemisphereLight(0xc4cfcd, 0x393527, 2));
  const sun = new THREE.DirectionalLight(0xe2d2b1, 1.3);
  sun.position.set(-20, 35, 15); scene.add(sun);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const hill = new THREE.SphereGeometry(1, 12, 8);
  const flame = new THREE.ConeGeometry(1, 1, 7);
  const smokeShape = new THREE.IcosahedronGeometry(1, 1);
  const soil = new THREE.MeshStandardMaterial({ color: 0x5c5540, roughness: 1 });
  const green = new THREE.MeshStandardMaterial({ color: 0x424e36, roughness: 1 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2c21, roughness: 1 });
  const ash = new THREE.MeshStandardMaterial({ color: 0x25231f, roughness: 1 });
  const fire = new THREE.MeshBasicMaterial({ color: 0xee7924 });
  const core = new THREE.MeshBasicMaterial({ color: 0xffbd51 });
  const smoke = new THREE.MeshStandardMaterial({ color: 0x504d46, roughness: 1 });
  const add = (geometry, material, x, y, z, sx, sy, sz) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); scene.add(mesh); return mesh;
  };
  add(box, soil, 0, -.4, -15, 110, .8, 120);
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1;
    add(hill, green, side * (39 + i % 3 * 4), -2, 12 - i * 12, 23, 17 + i % 4 * 3, 27);
  }
  // 刈り捨てた田と畦。材質・形を共有し、地面の升目は増やさない。
  for (let i = 0; i < 6; i++) {
    add(box, ash, -16 + i % 3 * 12, .03, 8 + Math.floor(i / 3) * 11, 10, .06, 9);
    add(box, soil, -16 + i % 3 * 12, .14, 13 + Math.floor(i / 3) * 11, 11, .28, .5);
  }
  for (const [x, z, width] of [[0, -10, 15], [-14, -18, 7], [16, -22, 8]]) {
    add(box, wood, x, 1.8, z, width, 3.6, 6);
    // 切妻の二面。天守や石垣を持つ城にはしない。
    for (const side of [-1, 1]) {
      const roof = add(box, ash, x, 4.4, z + side * 1.8, width + 2, .3, 4.4);
      roof.rotation.x = side * .55;
    }
  }
  const flames = [], clouds = [];
  for (let i = 0; i < 15; i++) {
    const x = -6 + i % 5 * 3, z = -8 - Math.floor(i / 5) * 3;
    flames.push(add(flame, i % 2 ? core : fire, x, 4, z, 1.1, 4 + i % 3, 1.1));
    clouds.push(add(smokeShape, smoke, x, 7 + i * .65, z - i * .4, 2 + i * .12, 2.3, 2));
  }
  document.body.appendChild(root);
  const start = performance.now();
  let frame = 0, closed = false;
  const clean = () => {
    if (closed) return;
    closed = true; cancelAnimationFrame(frame); root.remove();
    for (const geometry of [box, hill, flame, smokeShape]) geometry.dispose();
    for (const material of [soil, green, wood, ash, fire, core, smoke]) material.dispose();
    renderer.dispose(); renderer.forceContextLoss(); rt.cleanupTasks.delete(clean);
  };
  rt.cleanupTasks.add(clean);
  const draw = () => {
    if (closed) return;
    if (rt.disposed || rt.ended) { clean(); return; }
    const t = S.reduceMotion ? 0 : (performance.now() - start) / 1000;
    for (let i = 0; i < flames.length; i++) {
      flames[i].scale.y = (4 + i % 3) * (1 + .15 * Math.sin(t * 6 + i * 2));
      clouds[i].position.x = -6 + i % 5 * 3 + Math.sin(t * .7 + i) * .6;
      clouds[i].position.y = 7 + i * .65 + (t * .7 + i * .2) % 2;
    }
    renderer.render(scene, camera);
    frame = requestAnimationFrame(draw);
  };
  draw();
  rt.after(duration, clean);
  return duration;
}
