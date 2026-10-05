// 戦の周りの暮らし。兵の名簿・当たり・戦功には入れない、武器を持たない少人数の人。
import * as THREE from 'three';
import { buildModel, poseArms } from './units.js';
import { SOLIDS } from './props.js';
import { S } from './settings.js';

const NAMES = { farmer: '百姓', porter: '人夫', merchant: '商人', monk: '僧' };
const COLORS = { farmer: 0x62533e, porter: 0x484b3b, merchant: 0x3e4754, monk: 0x2e2925 };

function openGround(rt, x, z) {
  if (Math.abs(x) > rt.world.half - 3 || Math.abs(z) > rt.world.half - 3 || !rt.world.walkable(x, z) || rt.world.inWaterAt(x, z)) return false;
  // 大きな火のそばにも寄らない。
  for (const f of rt.world.fires || []) if (f.size >= 2 && Math.hypot(x - f.x, z - f.z) < 5) return false;
  for (const s of SOLIDS) if (x > s.x0 - 0.4 && x < s.x1 + 0.4 && z > s.z0 - 0.4 && z < s.z1 + 0.4) return false;
  return true;
}

function pathClear(rt, a, b) {
  if (rt.army.wallBetween(a, 0, b) || rt.army.wallBetween(a, 1, b)) return false;
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.6));
  const h = rt.world.heightAt(a.x, a.z);
  let last = h;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    if (!openGround(rt, x, z)) return false;
    const y = rt.world.heightAt(x, z);
    if (Math.abs(y - last) > 0.45) return false;
    last = y;
  }
  return true;
}

function addPerson(rt, L, kind, x, z, heading) {
  if (L.actors.length >= L.cap || !openGround(rt, x, z)) return false;
  for (const u of rt.army.units) {
    if (!u.alive || u.group?.people || u.type === 'dummy' || u.type === 'porter') continue;
    const d = Math.hypot(u.pos.x - x, u.pos.z - z);
    if (d < 7 || (u.target?.alive || u.atk) && d < 28) return false;
  }
  for (const a of L.actors) if (Math.hypot(a.home.x - x, a.home.z - z) < 3) return false;
  const col = COLORS[kind], monk = kind === 'monk', u = {};
  const mesh = buildModel(u, {
    sohei: 1, soheiV: 9, kosode: !monk, monk: monk ? 1 : 0, tier: 0,
    cloth: col, kesa: monk ? 0x7a6547 : col, armor: col, lace: col, skin: 0xa88868,
    hat: 'none', kato: 0, kote: 0, sode: false, saya: false, flag: null, weapon: 'none',
  });
  mesh.userData.noFreeze = true; mesh.userData.civilian = NAMES[kind];
  mesh.position.set(x, rt.world.heightAt(x, z), z); mesh.rotation.y = heading;
  rt.scene.add(mesh);
  const a = { kind, u, mesh, home: { x, z }, end: { x, z }, probe: { x, z }, heading, fleeing: false, moving: false, wait: 2 + L.actors.length, phase: L.actors.length * 3 };
  L.actors.push(a);
  if (kind === 'porter' || kind === 'farmer') {
    // 背負った藁包み。形と材質はこの戦の全員で共有する。
    const load = new THREE.Mesh(L.box, L.straw);
    load.position.set(0, 1.05, -0.31); load.scale.set(0.48, 0.6, 0.3); mesh.add(load);
  } else if (kind === 'merchant') {
    const stall = new THREE.Mesh(L.box, L.straw);
    stall.position.set(x + Math.cos(heading) * 1.1, rt.world.heightAt(x + Math.cos(heading) * 1.1, z) + 0.2, z);
    stall.scale.set(0.8, 0.4, 0.6); rt.scene.add(stall); L.goods.push(stall);
  }
  return true;
}

export function warPeopleInit(rt, camps) {
  if (rt.def.dojo) return;
  const L = rt.warPeople = { actors: [], goods: [], cap: S.quality === 'low' ? 6 : 8, scan: 0, box: new THREE.BoxGeometry(1, 1, 1), straw: new THREE.MeshLambertMaterial({ color: 0x8b7854 }) };
  // 本陣の入口を空け、幕の側面の外で荷を運び、物を売る。
  for (const c of camps) {
    addPerson(rt, L, 'porter', c.x + c.w / 2 + 4, c.z + c.d / 2 + 3, Math.PI);
    addPerson(rt, L, 'merchant', c.x - c.w / 2 - 4, c.z + c.d / 2 + 3, 0);
  }
  let farmers = 0, monks = 0;
  const perSite = S.quality === 'low' ? 1 : 2;
  for (const s of SOLIDS) {
    const kind = s.civilianSite === 'home' ? 'farmer' : s.civilianSite === 'temple' ? 'monk' : null;
    if (!kind || kind === 'farmer' && farmers >= perSite || kind === 'monk' && monks >= perSite) continue;
    // 戸口の正面を避け、建物の端からさらに三メートル離す。
    const x = s.x + s.c * (s.hw + 3) + s.s * (s.hd + 2);
    const z = s.z - s.s * (s.hw + 3) + s.c * (s.hd + 2);
    if (addPerson(rt, L, kind, x, z, Math.atan2(s.s, s.c))) {
      if (kind === 'farmer') farmers++; else monks++;
    }
  }
}

function choosePath(rt, a, angle, fleeing) {
  const p = a.mesh.position, q = a.probe;
  // 壁や川へ突っ込まず、逃げる時は危険から離れる半円の中で道を探す。
  for (let i = 0; i < 7; i++) {
    const turn = i === 0 ? 0 : Math.ceil(i / 2) * 0.4 * (i % 2 ? 1 : -1);
    const h = angle + turn, d = fleeing ? 9 : 4;
    q.x = p.x + Math.sin(h) * d; q.z = p.z + Math.cos(h) * d;
    if (!pathClear(rt, p, q)) continue;
    let blocked = false;
    for (const u of rt.army.units) if (u.alive && !u.group?.people && u.type !== 'dummy' && Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < 7) { blocked = true; break; }
    if (blocked) continue;
    a.end.x = q.x; a.end.z = q.z; a.heading = h; a.moving = true;
    return;
  }
  a.moving = false;
}

function scanPeople(rt, L) {
  for (const a of L.actors) {
    const p = a.mesh.position;
    let danger = null, closest = 26;
    for (const u of rt.army.units) {
      if (!u.alive || u.group?.people || u.type === 'dummy' || u.type === 'porter') continue;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (d < closest && (d < 8 || u.atk || u.swing || u.target?.alive)) { danger = u.pos; closest = d; }
    }
    for (const f of rt.world.fires || []) if (f.size >= 2 && Math.hypot(f.x - p.x, f.z - p.z) < closest) { danger = f; closest = Math.hypot(f.x - p.x, f.z - p.z); }
    if (danger) {
      a.fleeing = true;
      choosePath(rt, a, Math.atan2(p.x - danger.x, p.z - danger.z), true);
    } else if (!a.moving && a.wait <= 0) {
      if (a.fleeing) {
        if (Math.hypot(p.x - a.home.x, p.z - a.home.z) < 36) choosePath(rt, a, a.heading, true);
      } else if (a.kind === 'porter') {
        choosePath(rt, a, Math.hypot(p.x - a.home.x, p.z - a.home.z) > 2 ? Math.atan2(a.home.x - p.x, a.home.z - p.z) : a.heading + Math.PI, false);
      }
      a.wait = 4;
    }
  }
}

export function warPeopleTick(rt, dt) {
  const L = rt.warPeople;
  if (!L) return;
  L.scan -= dt;
  if (!rt.over && L.scan <= 0) { L.scan = 1; scanPeople(rt, L); }
  for (const a of L.actors) {
    const p = a.mesh.position, u = a.u;
    a.wait -= dt;
    if (!rt.over && a.moving) {
      const dx = a.end.x - p.x, dz = a.end.z - p.z, d = Math.hypot(dx, dz);
      const step = Math.min(d, dt * (a.fleeing ? 2.5 : 0.8));
      if (d > 0.05) {
        const x = p.x + dx / d * step, z = p.z + dz / d * step;
        if (openGround(rt, x, z)) { p.set(x, rt.world.heightAt(x, z), z); a.mesh.rotation.y = Math.atan2(dx, dz); }
        else a.moving = false;
      } else { a.moving = false; a.wait = a.fleeing ? 0 : 4; }
    }
    const near = Math.hypot(rt.camera.position.x - p.x, rt.camera.position.z - p.z) < 85;
    a.mesh.visible = near;
    if (!near) continue;
    const moving = a.moving && !rt.over;
    if (!S.reduceMotion && moving) a.phase += dt * (a.fleeing ? 10 : 5);
    const sw = moving && !S.reduceMotion ? Math.sin(a.phase) * 0.3 : 0;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.body.rotation.x = a.fleeing ? 0.18 : a.kind === 'porter' ? 0.12 : 0;
    u.moving = S.reduceMotion ? 0 : moving ? 1 : 0;
    poseArms(u, a.phase);
    if (a.kind === 'monk' && !moving) { u.armL.rotation.x = -0.7; u.armR.rotation.x = -0.7; }
  }
}

export function warPeopleDispose(rt) {
  const L = rt.warPeople;
  if (!L) return;
  for (const a of L.actors) rt.scene.remove(a.mesh);
  for (const m of L.goods) rt.scene.remove(m);
  L.box.dispose(); L.straw.dispose(); rt.warPeople = null;
}
