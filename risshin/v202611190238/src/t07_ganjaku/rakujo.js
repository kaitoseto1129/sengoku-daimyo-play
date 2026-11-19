// ======================================================================
// 岩石城　落城の後（14〜15分）：山じゅうの尾根に豊臣の旗が次々と立ち、麓の大軍は南へ動き出す。本陣から「九州を南へ」
//   巨大な豊臣軍が一城を飲み込む怖さで締める。
// 呼び方：本体の win から play(rt)。戻り値は終わりまでの秒
// ======================================================================
import { nobori } from '../props.js';
import * as THREE from 'three';
import { sfx } from '../audio.js';
import { liteMat } from '../world_vegetation_materials.js';

const FLAGS = [[-46, 46, 'sashi:tsuru:#ece6d6:#201f1c'], [-24, 30, 'sashi:tsuru:#ece6d6:#201f1c'], [40, 40, 'toyotomi'], [52, 30, 'toyotomi'], [-60, -20, 'sashi:tsuru:#ece6d6:#201f1c'], [-50, -32, 'sashi:tsuru:#ece6d6:#201f1c'],
  [30, -30, 'maeda'], [20, -40, 'maeda'], [-10, 20, 'toyotomi'], [12, 14, 'toyotomi']];

export function play(rt) {
  const W = rt.world;
  FLAGS.forEach(([x, z, k], i) => rt.after(1.5 + i * 0.9, () => { try { rt.scene.add(nobori(W, x, z, k, 6)); } catch (e) { /* 飾り */ } if (i % 3 === 0) rt.army.play('toki', { x, z }, 0.9); }));
  rt.after(11, () => rt.say('使番', '馬ヶ岳の本陣より：岩石は落ちた。このまま九州を南へ、と', 3.6));
  rt.after(15, () => { rt.say('蒲生郷成', '一日で、この岩山が……。島津も、これを聞けば震えよう', 3.4); sfx('horagai', 0.6); });
  // 11/19 k365-cloud-41（K306 史実の場面）：秀吉は岩石の落城の後、秋月の益富城の向かいの山に一夜で白壁の城を見せ（紙を張った壁と伝わる）、秋月を降らせた。
  //   本人の向く先、百六十 m の山に白壁の城が三秒でせり上がる（箱だけ・材質は一度）。使番の知らせで締める
  rt.after(18, () => { try { ichiya(rt); } catch (e) { /* 飾り */ } });
  rt.after(19.5, () => rt.say('使番', '秋月の益富城の向かいの山に、一夜で白い城が立ちました。秋月殿は降られるそうな', 4.2));
  return 27;
}
let ICHIYA_MAT = null;
const HUTS = [[6, -6], [5, 9]];
function ichiya(rt) {
  // 11/19 司令塔「カメラは動かさず、城の置き場を見える向きへ」：本人の目（カメラ）の向く先から左右三十度の内で、本丸の焼ける小屋を挟まない向きを選び、
  //   百五 m 先（見通し百五十 m の内）に置く。尾根が目より低い所は、城の下に土と石垣の丘を盛って目の高さの少し下まで上げる（本丸の塀と霞の下に沈ませない）
  const W = rt.world, cam = rt.camera;
  if (!cam) return;
  const cp = cam.position, fw = new THREE.Vector3(); cam.getWorldDirection(fw);
  const base = Math.atan2(fw.x, fw.z);
  let yaw = null;
  for (const d of [0, 10, -10, 20, -20, 30, -30]) {
    const a = base + d * Math.PI / 180;
    const hid = HUTS.some(([hx, hz]) => { const dx = hx - cp.x, dz = hz - cp.z, along = dx * Math.sin(a) + dz * Math.cos(a); return along > 0 && along < 40 && Math.abs(dx * Math.cos(a) - dz * Math.sin(a)) < 9; });
    if (!hid) { yaw = a; break; }
  }
  if (yaw === null) yaw = base;
  const lim = 240, cx = Math.max(-lim, Math.min(lim, cp.x + Math.sin(yaw) * 105)), cz = Math.max(-lim, Math.min(lim, cp.z + Math.cos(yaw) * 105));
  const gy = W.heightAt(cx, cz), top = Math.max(gy, cp.y - 7);
  ICHIYA_MAT = ICHIYA_MAT || { wall: liteMat({ color: 0xeeeae0, roughness: 0.9 }), roof: liteMat({ color: 0x34302c, roughness: 0.8 }), hill: liteMat({ color: 0x4a4636, roughness: 1 }), stone: liteMat({ color: 0x6b675e, roughness: 1 }) };
  const box = new THREE.BoxGeometry(1, 1, 1), g = new THREE.Group();
  const add = (mat, sx, sy, sz, px, py, pz) => { const m = new THREE.Mesh(box, mat); m.scale.set(sx, sy, sz); m.position.set(px, py, pz); g.add(m); };
  for (const [sx, sz, px, pz] of [[34, 1.2, 0, -17], [34, 1.2, 0, 17], [1.2, 34, -17, 0], [1.2, 34, 17, 0]]) add(ICHIYA_MAT.wall, sx, 5, sz, px, 2.5, pz);
  for (const [px, pz] of [[-17, -17], [17, -17], [-17, 17], [17, 17]]) { add(ICHIYA_MAT.wall, 5, 7, 5, px, 3.5, pz); add(ICHIYA_MAT.roof, 6.4, 0.8, 6.4, px, 7.4, pz); }
  add(ICHIYA_MAT.wall, 12, 8, 10, 0, 4, 0); add(ICHIYA_MAT.roof, 14.5, 1, 12.5, 0, 8.4, 0);
  add(ICHIYA_MAT.wall, 8, 6, 7, 0, 11.6, 0); add(ICHIYA_MAT.roof, 10.5, 1, 9.5, 0, 15, 0);
  // 城の下の丘（土）と石垣の段。目より低い尾根でも城が塀と霞の上に出る
  let hill = null;
  if (top - gy > 0.5) {
    const hh = top - gy + 3, geo = new THREE.CylinderGeometry(30, 46, hh, 14); geo.translate(0, hh / 2, 0);
    hill = new THREE.Mesh(geo, ICHIYA_MAT.hill); hill.position.set(cx, gy - 3, cz); rt.scene.add(hill);
  }
  const ishi = new THREE.Mesh(new THREE.CylinderGeometry(27, 30, 3, 4), ICHIYA_MAT.stone);
  ishi.rotation.y = yaw + Math.PI / 4; ishi.position.set(cx, top - 0.2, cz); rt.scene.add(ishi);
  g.position.set(cx, top + 1, cz); g.rotation.y = yaw; g.scale.set(1.4, 0.02, 1.4);
  rt.scene.add(g);
  const t0 = rt.t;
  const grow = () => { const k = Math.min(1, (rt.t - t0) / 3), e = k * k * (3 - 2 * k); g.scale.y = 0.02 + 1.38 * e; if (k < 1) rt.after(0.05, grow); };
  grow();
  sfx('horagai', 0.4);
}
