// 資料との差を埋める当時の場の小物（10/28 gap100-c）。どれも置く時だけ組み、毎コマは何もしない。
//   wayLitter(rt, road, o)   道に沿って、捨てた荷車・俵・樽・箱を道の脇へ（外の素材 props_ext。読めない時は何も出ない）
//   fallenHorses(rt, spots)  伏せた馬（荷駄馬）を一度に描く。spots：[[x, z, 向き], ...]
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { extScatter } from './props_ext.js';
import { buildHorse } from './units_model.js';

// 決まった種から 0〜1 を返す（毎回同じ並び）
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// road：[[x, z], ...]。step ごとに左右へ交互に off（m）離して小物の山を置く。
// o.kinds：一つの山に使う形の名前。o.skip(x, z) が真の所には置かない。o.clear：道の中心から空ける幅
export function wayLitter(rt, road, o = {}) {
  const W = rt.world, rnd = seeded(o.seed || 7), step = o.step || 16, off = o.off || 5.2;
  const kinds = o.kinds || ['cart', 'sack', 'barrel', 'box_a', 'crate', 'sack'];
  const by = {};
  const put = (n, x, z, rot, s = 1) => (by[n] ||= []).push({ x, z, rot, s });
  let side = 1, carry = rnd() * step;
  for (let i = 1; i < road.length; i++) {
    const [ax, az] = road[i - 1], [bx, bz] = road[i];
    const len = Math.hypot(bx - ax, bz - az); if (len < 1e-3) continue;
    const tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz, nz = tx;
    for (let d = carry; d < len; d += step * (0.75 + rnd() * 0.5)) {
      side = -side;
      const o2 = off + rnd() * 2.2;
      const cx = ax + tx * d + nx * o2 * side, cz = az + tz * d + nz * o2 * side;
      if (o.skip && o.skip(cx, cz)) continue;
      const head = Math.atan2(tx, tz);
      // 山の主（荷車か俵の束）と、こぼれた荷を二つ三つ
      const main = kinds[Math.floor(rnd() * kinds.length)];
      put(main, cx, cz, head + (rnd() - 0.5) * 1.4 + (main === 'cart' ? Math.PI / 2 * side : 0), main === 'cart' ? 1 : 0.9 + rnd() * 0.2);
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, r = 1.2 + rnd() * 1.4;
        const sx = cx + Math.cos(a) * r, sz = cz + Math.sin(a) * r;
        // こぼれた荷は道の中へ出しすぎない
        const lat = (sx - ax) * nx + (sz - az) * nz;
        if (Math.abs(lat) < (o.clear || 3.4)) continue;
        put(rnd() < 0.6 ? 'sack' : (rnd() < 0.5 ? 'barrel' : 'box_b'), sx, sz, rnd() * 6.28, 0.85 + rnd() * 0.25);
      }
    }
    carry = 0;
  }
  const grp = new THREE.Group(); grp.name = 'wayLitter';
  for (const n of Object.keys(by)) extScatter(grp, n, by[n], W);
  rt.scene.add(grp);
  return by;
}

// 伏せた馬（重さ：一つの InstancedMesh。形は馬の近い形を一度だけ結合）
export function fallenHorses(rt, spots) {
  if (!spots.length) return null;
  const W = rt.world, source = buildHorse(), horse = source.userData.horse;
  if (!horse) return null;
  for (let i = 0; i < horse.legs.length; i++) {
    horse.legs[i].rotation.x = i < 2 ? 0.35 : -0.3;
    if (horse.lowers?.[i]) horse.lowers[i].rotation.x = i < 2 ? -0.85 : 0.75;
  }
  horse.neck?.rotation.set(0.25, 0, -0.1);
  for (const ear of horse.ears || []) ear.rotation.x = -0.35;
  source.updateMatrixWorld(true);
  const list = []; let material;
  source.traverse((m) => {
    if (!m.isMesh) return;
    material = m.material;
    const geo = m.userData.lod ? m.userData.lod[0] : m.geometry;
    list.push(geo.clone().applyMatrix4(m.matrixWorld));
  });
  const geo = mergeGeometries(list); for (const g of list) g.dispose();
  if (!geo) return null;
  const mesh = new THREE.InstancedMesh(geo, material, spots.length);
  const place = new THREE.Object3D(), normal = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tilt = new THREE.Quaternion();
  spots.forEach(([x, z, r], i) => {
    normal.set(W.heightAt(x - 1, z) - W.heightAt(x + 1, z), 2, W.heightAt(x, z - 1) - W.heightAt(x, z + 1)).normalize();
    place.position.set(x, W.heightAt(x, z) + 0.42, z);
    place.rotation.set(0, r, Math.PI / 2);
    place.quaternion.premultiply(tilt.setFromUnitVectors(up, normal));
    place.updateMatrix();
    mesh.setMatrixAt(i, place.matrix);
  });
  mesh.castShadow = mesh.receiveShadow = true;
  rt.scene.add(mesh);
  return mesh;
}
