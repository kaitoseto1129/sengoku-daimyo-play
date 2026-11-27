// K657②（11/25 わ）：毛利家編の木津川口（m07 第一次・m08 第二次）を「その戦と分かる」戦場にする足し。見た目だけ（兵・段・手柄には触れない）
//   ・湾：大坂の河口の目印の澪標（みおつくし・難波の舟の道しるべ。『万葉集』以来の難波の景・大坂の市章）を沖へ一列、河口の浜に葦原
//   ・舟：織田家編 b_kizugawa.js の安宅船（atakeLite）をそのまま呼ぶ（K651：写さず import）。m07 は白木の安宅、m08 は九鬼の鉄甲船六艘と滝川の白船
//   ・燃える舟：m07 は段が進むと織田の大船が焙烙で一艘ずつ燃える（world.addBlaze。焼け落ちは作らず、火と黒い煙の柱だけ）
//   形と材質は一つを使い回し（InstancedMesh）、戦の片付けで返す。記憶（K643）は舟の形の束が六艘でも一つ
import * as THREE from 'three';
import { kzAtake, kzShipCachesDispose } from './b_kizugawa.js';

const SEA_Y = -0.5;   // 軽い型の海の面（light_battle.js の sea.levelAt）

// 澪標：太い杭に、上で交わる二本の斜めの木と横木（四つの箱を一つの束で）。pts は [x, z] の列
function mio(rt, pts) {
  const geo = new THREE.BoxGeometry(1, 1, 1), mat = new THREE.MeshStandardMaterial({ color: 0x4a3c2c, roughness: 0.95 });
  const im = new THREE.InstancedMesh(geo, mat, pts.length * 4), D = new THREE.Object3D();
  let n = 0;
  const put = (x, y, z, sx, sy, sz, rz, ry) => { D.position.set(x, y, z); D.rotation.set(0, ry, rz); D.scale.set(sx, sy, sz); D.updateMatrix(); im.setMatrixAt(n++, D.matrix); };
  pts.forEach(([x, z], i) => {
    const ry = 0.3 + (i % 3) * 0.4, c = Math.cos(ry), s = Math.sin(ry), top = SEA_Y + 5.2 + (i % 2) * 0.5;
    put(x, top / 2 - 2, z, 0.32, top + 4, 0.32, 0, ry);                         // 杭（水の底から）
    for (const sd of [-1, 1]) put(x + c * sd * 0.7, top - 0.2, z - s * sd * 0.7, 0.2, 3.2, 0.2, sd * 0.62, ry);   // 交わる二本
    put(x, top - 1.3, z, 2.6, 0.18, 0.2, 0, ry);                                // 横木
  });
  im.count = n; im.castShadow = true; rt.scene.add(im);
  return () => { rt.scene.remove(im); im.dispose(); geo.dispose(); mat.dispose(); };
}

// 葦原：水際（海の面の少し上下）だけに三枚の葉の束を立てる
function reeds(rt, coast, ranges) {
  const W = rt.world, v = [];
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3, x = Math.cos(a), z = Math.sin(a); v.push(-z * .1, 0, x * .1, z * .1, 0, -x * .1, x * .5, 1.5 + i * .25, z * .5); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8f8460, roughness: 1, side: THREE.DoubleSide });
  const N = 260, im = new THREE.InstancedMesh(geo, mat, N), D = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < N * 3 && n < N; i++) {
    const [x0, x1] = ranges[i % ranges.length], x = x0 + ((i * 37.7) % (x1 - x0)), z = coast(x) - 3.4 + ((i * 7.3) % 5.2);
    const y = W.heightAt(x, z); if (y < SEA_Y - 0.7 || y > SEA_Y + 0.9) continue;
    D.position.set(x, Math.max(y, SEA_Y - 0.4), z); D.rotation.set(0, i * 2.4, 0); D.scale.setScalar(0.7 + (i % 5) * 0.15); D.updateMatrix(); im.setMatrixAt(n++, D.matrix);
  }
  im.count = n; rt.scene.add(im);
  return () => { rt.scene.remove(im); im.dispose(); geo.dispose(); mat.dispose(); };
}

// 安宅船を海に浮かべる（舳先の向き rot・white：白木の安宅）
function atake(rt, x, z, rot, white) {
  const m = kzAtake(rt.world, white); m.position.set(x, SEA_Y, z); m.rotation.y = rot; rt.scene.add(m);
  return { m, x, z, rot, fire: null };
}
// 舟を燃やす（甲板の上に火、黒い煙の柱）
function burn(rt, s, deck = 4.8) {
  if (s.fire || !rt.world.addBlaze) return;
  try { s.fire = rt.world.addBlaze(s.x, s.z, { w: 9, d: 26, h: SEA_Y + deck - rt.world.heightAt(s.x, s.z), rot: s.rot, n: 3, size: 4.4 }); } catch (e) { /* 火が無くても戦は続ける */ }
}

// 片付け（舟の形の束・澪標・葦・火）を戦の終わりに返す
function onDispose(rt, list, ships) {
  const dispose = rt.dispose;
  rt.dispose = function () {
    for (const s of ships) try { s.fire?.stop(); } catch (e) { /* 片付けは続ける */ }
    for (const f of list) try { f(); } catch (e) { /* 同上 */ }
    try { dispose.call(this); } finally { try { kzShipCachesDispose(); } catch (e) { /* 同上 */ } }
  };
}

// 澪標の列：河口の内（西）から沖へ、舟の道に沿って
const mioLine = (coast) => [[-150, 6], [-138, 20], [-124, 34], [-108, 48], [-92, 62]].map(([x, d]) => [x, coast(x) - d]);

// m07 第一次（1576・昼）：沖に織田の白木の安宅四艘。段が進むと焙烙で一艘ずつ燃える
export function kizuBay1576(rt, coast) {
  const ships = [[-86, 18, -0.25], [-46, 28, 0.35], [-6, 18, -0.2], [34, 28, 0.3]].map(([x, d, r]) => atake(rt, x, coast(x) - d, Math.PI / 2 + r, true));
  onDispose(rt, [mio(rt, mioLine(coast)), reeds(rt, coast, [[-200, -120], [150, 210]])], ships);
  rt.flags.kzBay = { ships, t: 0 };
}
// 段の進みで燃やす：浜で焙烙を投げ始めた所で一艘（20秒後）、大船の炎上の段で二艘、河口の内を追う段で最後の一艘
export function kizuBay1576Tick(rt, dt) {
  const B = rt.flags.kzBay, i = rt.flags.dp?.i ?? -1; if (!B) return;
  B.t = i >= 2 ? B.t + dt : 0;
  if (i >= 2 && B.t > 20) burn(rt, B.ships[2]);
  if (i >= 4) { burn(rt, B.ships[1]); burn(rt, B.ships[0]); }
  if (i >= 6) burn(rt, B.ships[3]);
}
// m08 第二次（1578・朝）：九鬼の鉄甲船六艘を河口の沖に一列、端に滝川の白船。浜に乗り上げた毛利の舟が二艘燃える
export function kizuBay1578(rt, coast, wreck = []) {
  const ships = [];
  for (let i = 0; i < 6; i++) { const x = -112 + i * 38; ships.push(atake(rt, x, coast(x) - 30 - (i % 2) * 7, Math.PI / 2 + (i % 2 ? 0.12 : -0.1), false)); }
  ships.push(atake(rt, 124, coast(124) - 40, Math.PI / 2 + 0.2, true));
  const fires = wreck.map(([x, z]) => ({ x, z, rot: Math.PI / 2, fire: null }));
  for (const f of fires) try { f.fire = rt.world.addBlaze?.(f.x, f.z, { w: 2.4, d: 8, h: 1.1, rot: f.rot, n: 1, size: 2 }) || null; } catch (e) { /* 同上 */ }
  onDispose(rt, [mio(rt, mioLine(coast)), reeds(rt, coast, [[-200, -120], [150, 210]])], ships.concat(fires));
  rt.flags.kzGuns = { ships: ships.slice(0, 6), t: 0, k: 0 };   // K716 m08：大船の舷から鉄砲・大筒が鳴る（kizuBay1578Guns）
}

// K716 m08 見せ場：第二次の大型船は、毛利の舟が寄る前から舷の鉄砲を鳴らす。段 i>=1 から、数秒ごとに一艘ずつ舷が閃き、煙が立つ
export function kizuBay1578Guns(rt, dt) {
  const G = rt.flags.kzGuns, i = rt.flags.dp?.i ?? -1;
  if (!G || i < 1) return;
  G.t += dt;
  if (G.t < 3.2) return;
  G.t = 0;
  const s = G.ships[G.k++ % G.ships.length], W = rt.world;
  try {
    const dx = Math.cos(s.rot + Math.PI / 2) * 5, dz = Math.sin(s.rot + Math.PI / 2) * 5;
    const f = W.addFire?.(s.x + dx * ((G.k % 3) - 1), s.z + dz * ((G.k % 3) - 1), { h: 5.2, size: 1.3 });
    if (f) rt.after(0.35, () => { try { W.removeFire(f); } catch (e) { /* 閃きが残っても戦は続ける */ } });
    if (G.k <= 6) W.addSmokeColumn?.(s.x, 5.5, s.z, { size: 1.1, black: true });
  } catch (e) { /* 閃きが無くても戦は続ける */ }
}
