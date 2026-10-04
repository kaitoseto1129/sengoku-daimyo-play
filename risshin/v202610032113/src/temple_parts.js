// ======================================================================
// temple_parts.js … 山岳寺院の部品（docs/siege-plan.md M2・mountain-spec 11・12・30）
// 本堂・講堂・堂舎・僧坊・鐘楼・倉・見張り台・山門・総門・木戸・石段。
// 大きな形（堂・楼門）は props.js の dou・romon・kabukimon・hut を使い回し、
// 新しく作るのは鐘楼・石段・見張り台（山の砦向けの軽い形）だけにする。
// 木造の部品には userData.flammable = true を付けておく（siege_fire.js が見るのは M7）。
// ======================================================================
import * as THREE from 'three';
import { solidRect, solidCircle, dou, romon, kabukimon, hut } from './props.js';

// 使い回す材質（毎回 new しない）
const MAT = new Map();
function mat(hex, rough = 0.9) {
  const k = hex + ':' + rough;
  if (!MAT.has(k)) MAT.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 }));
  return MAT.get(k);
}
function box(w, h, d, hex, rough) { const g = new THREE.BoxGeometry(w, h, d); const m = new THREE.Mesh(g, mat(hex, rough)); m.castShadow = true; m.receiveShadow = true; return m; }
function cyl(r0, r1, h, hex, seg = 8) { const g = new THREE.CylinderGeometry(r0, r1, h, seg); const m = new THREE.Mesh(g, mat(hex)); m.castShadow = true; m.receiveShadow = true; return m; }
function flammable(o) { o.userData.flammable = true; return o; }

// ---- 堂（本堂・講堂・堂舎）：大きさだけ変えて dou を使い回す ----
export function hondo(world, x, z, rot = 0) { return flammable(dou(world, x, z, 14, 10, rot, { h: 4.4 })); }
export function kodo(world, x, z, rot = 0) { return flammable(dou(world, x, z, 11, 8, rot, { h: 3.8 })); }
export function doja(world, x, z, rot = 0) { return flammable(dou(world, x, z, 7.5, 6, rot, { h: 3.2 })); }

// ---- 僧坊・倉：hut を使い回す（倉は板葺き・小さな戸で見分ける） ----
export function sobo(world, x, z, rot = 0) { return flammable(hut(world, x, z, 6.5, 5, rot, { h: 2.5 })); }
export function kura(world, x, z, rot = 0) { return flammable(hut(world, x, z, 5, 4, rot, { h: 2.6, ita: true, wall: 0x6a5c48 })); }

// ---- 山門・総門・木戸：romon・kabukimon を使い回す ----
export function sanmon(world, x, z, rot = 0) { return flammable(romon(world, x, z, 6.4, rot)); }
export function somon(world, x, z, rot = 0) { return flammable(romon(world, x, z, 8.4, rot)); }
export function kido(world, x, z, rot = 0) { return flammable(kabukimon(world, x, z, 3.2, rot)); }

// ---- 鐘楼（しょうろう）：四本柱の小さな楼に釣り鐘。木造で軽い（数十角） ----
export function shoro(world, x, z, rot = 0) {
  solidCircle(x, z, 1.6);
  const y0 = world.heightAt(x, z);
  const grp = new THREE.Group();
  const H = 2.6;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const p = cyl(0.13, 0.15, H, 0x5e4a34); p.position.set(sx * 1.3, H / 2, sz * 1.0); grp.add(p);
  }
  const floor = box(2.9, 0.12, 2.3, 0x5a4a36); floor.position.set(0, H, 0); grp.add(floor);
  const bell = cyl(0.35, 0.55, 1.1, 0x3a3226, 10); bell.position.set(0, H - 0.65, 0); grp.add(bell);
  const beam = box(2.6, 0.14, 0.14, 0x3a2c1c); beam.position.set(0, H + 0.16, 0); grp.add(beam);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.4, 4), mat(0x2c2620));
  roof.rotation.y = Math.PI / 4; roof.position.set(0, H + 1.0, 0); roof.castShadow = true; grp.add(roof);
  grp.position.set(x, y0, z); grp.rotation.y = rot;
  return flammable(grp);
}

// ---- 見張り台（monomidai）：山道を見おろす軽い物見（城の櫓より小さく壁が無い） ----
export function monomidai(world, x, z, rot = 0) {
  solidCircle(x, z, 1.2);
  const y0 = world.heightAt(x, z);
  const grp = new THREE.Group();
  const H = 4.2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const p = cyl(0.11, 0.14, H, 0x5a4c3a); p.position.set(sx * 0.9, H / 2, sz * 0.9); grp.add(p);
  }
  const floor = box(2.1, 0.1, 2.1, 0x5e4c36); floor.position.set(0, H, 0); grp.add(floor);
  const rail = box(2.1, 0.5, 0.06, 0x4a3c2a);
  for (const [sx, sz, ry] of [[0, -1, 0], [0, 1, 0], [-1, 0, Math.PI / 2], [1, 0, Math.PI / 2]]) {
    const r = rail.clone(); r.rotation.y = ry; r.position.set(sx * 1.03, H + 0.3, sz * 1.03); grp.add(r);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.1, 4), mat(0x2c2620));
  roof.rotation.y = Math.PI / 4; roof.position.set(0, H + 0.9, 0); roof.castShadow = true; grp.add(roof);
  grp.position.set(x, y0, z); grp.rotation.y = rot;
  return flammable(grp);
}

// ---- 石段：a→b の間に、地形の高さに沿って段を刻む（燃えない）。戻り値は Group ----
export function ishidan(world, ax, az, bx, bz, w = 3.2) {
  const len = Math.hypot(bx - ax, az - bz || bz - az);
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1e-6, ux = dx / L, uz = dz / L;
  const n = Math.max(2, Math.round(L / 0.9));
  // 石段は歩く道。建物用の通れない当たりを置くと、山門の先をふさいでしまう。
  const grp = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = ax + dx * t, z = az + dz * t;
    const y = world.heightAt(x, z);
    const step = box(w, 0.22, L / n + 0.05, i % 2 ? 0x8a857a : 0x837e72);
    step.rotation.y = Math.atan2(dx, dz);
    step.position.set(x, y + 0.11, z);
    grp.add(step);
  }
  void len;
  return grp;
}
