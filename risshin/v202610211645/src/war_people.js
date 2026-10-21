// 戦の周りの暮らし。兵の名簿・当たり・戦功には入れない、武器を持たない少人数の人。
import * as THREE from 'three';
import { buildModel, poseArms } from './units.js';
import { SOLIDS } from './props.js';
import { S } from './settings.js';
import { personGeo, tintMat } from './town_crowd.js';
import { sfx } from './audio.js';

const NAMES = { farmer: '百姓', porter: '人夫', merchant: '商人', monk: '僧' };
const COLORS = { farmer: 0x62533e, porter: 0x484b3b, merchant: 0x3e4754, monk: 0x2e2925 };

function openGround(rt, x, z) {
  if (Math.abs(x) > rt.world.half - 3 || Math.abs(z) > rt.world.half - 3 || !rt.world.walkable(x, z) || rt.world.inWaterAt(x, z)) return false;
  // 大きな火のそばにも寄らない。
  for (const f of rt.world.fires || []) if (f.size >= 2 && Math.hypot(x - f.x, z - f.z) < 5) return false;
  for (const s of SOLIDS) if (x > s.x0 - 0.4 && x < s.x1 + 0.4 && z > s.z0 - 0.4 && z < s.z1 + 0.4) return false;
  return true;
}

function pathClear(rt, a, b, crowd = false) {
  if (rt.army.wallBetween(a, 0, b) || rt.army.wallBetween(a, 1, b)) return false;
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.6));
  const h = rt.world.heightAt(a.x, a.z);
  let last = h;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    // 外周の村・城下へも逃げられるよう、民の指定範囲を使う。
    if (crowd ? !lightOpen(rt, x, z) : !openGround(rt, x, z)) return false;
    if (crowd) for (const f of rt.world.fires || []) if (f.lit !== false && f.size >= (rt.def.civilianCrowd?.fireSize ?? 2) && Math.hypot(x - f.x, z - f.z) < 5) return false;
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
  const L = rt.warPeople = { actors: [], goods: [], cap: 8, scan: 0, box: new THREE.BoxGeometry(1, 1, 1), straw: new THREE.MeshLambertMaterial({ color: 0x8b7854 }) };
  // 土地ごとの民を指定した戦は、本陣や砦へ里の者を自動で足さない。
  if (rt.def.civilianCrowd) { crowdInit(rt); return; }
  // 本陣の入口を空け、幕の側面の外で荷を運び、物を売る。
  for (const c of camps) {
    addPerson(rt, L, 'porter', c.x + c.w / 2 + 4, c.z + c.d / 2 + 3, Math.PI);
    addPerson(rt, L, 'merchant', c.x - c.w / 2 - 4, c.z + c.d / 2 + 3, 0);
  }
  let farmers = 0, monks = 0;
  const perSite = 2;
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
  if (!rt.def.mapCastle) crowdInit(rt);
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
  crowdTick(rt, dt);
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
  crowdDispose(rt);
  L.box.dispose(); L.straw.dispose(); rt.warPeople = null;
}

// ======================================================================
// 見物と逃げる人（kaito 10/14）。兵ではない百姓・町人・女・子・僧・商人。
// 戦の合間は遠巻きに見物し、戦や火が近づくと悲鳴を上げて逃げる。山の寺の人は堂から谷へ下り、町の人は家から逃げ出す。
// 兵の名簿・当たりには入れない。遠くは一つの InstancedMesh（軽い形）で描き、近い数人だけ本物の形に入れ替える。
// ======================================================================
const CROWD = {
  farmer: [0x62533e, 0x5c5444, 0x6a5a40], woman: [0x5a4048, 0x4a5058, 0x6a5048], child: [0x6b5a40, 0x5a5a48],
  elder: [0x575046, 0x4e4a40], merchant: [0x3e4754, 0x464036], monk: [0x2e2925, 0x34302a],
};
CROWD.townsman = CROWD.merchant;
const CROWD_NAMES = { townsman: '町人', farmer: '百姓', woman: '里の女', child: '里の子', elder: '年寄り', merchant: '商人', monk: '僧' };
// 戦ごとの場の型。山の寺は堂から谷へ下る。町は家から逃げ出す。
const MOUNTAIN = new Set(['hieizan', 'hiei_mtn', 'echizen_ikko', 'shigisan']);
const TOWN = new Set(['nagashima', 'honnoji', 'arioka', 'saika', 'iga', 'tennoji', 'odani', 'inabayama']);
const POOL = ['farmer', 'farmer', 'woman', 'woman', 'child', 'monk', 'elder'];
const NEAR = 26, CAP = 44;
let LGEO = null, LMAT = null;

function lightOpen(rt, x, z) {
  const w = rt.world;
  const b = rt.def.civilianCrowd?.bounds;
  if ((b ? x < b.minX + 2 || x > b.maxX - 2 || z < b.minZ + 2 || z > b.maxZ - 2 : Math.abs(x) > w.half - 2 || Math.abs(z) > w.half - 2) || !w.walkable(x, z) || w.inWaterAt(x, z)) return false;
  for (const s of SOLIDS) if (x > s.x0 - 0.3 && x < s.x1 + 0.3 && z > s.z0 - 0.3 && z < s.z1 + 0.3) return false;
  return true;
}

const soldier = (u) => u.alive && !u.civ && !u.group?.civ && !u.group?.people && u.type !== 'dummy';

function nearSoldier(rt, x, z, r) {
  for (const u of rt.army.units) if (soldier(u) && Math.abs(u.pos.x - x) < r && Math.abs(u.pos.z - z) < r && Math.hypot(u.pos.x - x, u.pos.z - z) < r) return true;
  return false;
}

function battleCenter(rt) {
  const s = [[0, 0, 0], [0, 0, 0]];
  for (const u of rt.army.units) if (soldier(u) && (u.team === 0 || u.team === 1)) { const c = s[u.team]; c[0] += u.pos.x; c[1] += u.pos.z; c[2]++; }
  if (s[0][2] && s[1][2]) return { x: (s[0][0] / s[0][2] + s[1][0] / s[1][2]) / 2, z: (s[0][1] / s[0][2] + s[1][1] / s[1][2]) / 2 };
  const c = s[0][2] ? s[0] : s[1];
  return c[2] ? { x: c[0] / c[2], z: c[1] / c[2] } : { x: 0, z: 0 };
}

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function addBand(rt, C, x, z, kinds, mode, face, route = null, routeEnd = null) {
  const g = { home: { x, z }, mode, route, routeEnd, state: mode === 'inside' ? 'inside' : 'watch', agents: [], calm: 0, from: { x, z } };
  for (const [i, kind] of kinds.entries()) {
    if (C.agents.length >= CAP) break;
    let px = x, pz = z, found = false;
    for (let k = 0; k < 6; k++) {
      const a = i * 2.4 + k, r = 0.9 + i * 0.55 + k * 0.3;
      const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
      if (lightOpen(rt, tx, tz) && (!route || mode !== 'watch' || !nearSoldier(rt, tx, tz, 34))) { px = tx; pz = tz; found = true; break; }
    }
    if (!found) continue;
    const cols = CROWD[kind];
    g.agents.push({
      kind, g, x: px, z: pz, h: face + (rnd() - 0.5) * 0.5, col: new THREE.Color(cols[i % cols.length]),
      sc: kind === 'child' ? 0.64 : kind === 'elder' ? 0.93 : 0.95 + rnd() * 0.08, ph: rnd() * 6,
      spd: (kind === 'child' ? 2.6 : kind === 'elder' ? 1.9 : 3.0) + rnd() * 0.5,
      tx: px, tz: pz, wpT: 0, ran: 0, routeIndex: 0, model: null, out: mode !== 'inside', idle: rnd() * 6,
    });
  }
  if (g.agents.length) { C.bands.push(g); C.agents.push(...g.agents); }
}

function crowdInit(rt) {
  const key = rt.def.key || '', mtn = MOUNTAIN.has(key), town = TOWN.has(key);
  seed = 7 + key.length * 131;
  const C = rt.warCrowd = { agents: [], bands: [], pool: [], scan: 0, poolT: 0, screamT: -99, barked: false, mtn, center: battleCenter(rt) };
  const ctr = C.center, half = rt.world.half;
  // 土地ごとの在所・堂と逃げ道が指定された戦は、兵の中心から民を散らさない。
  const bands = rt.civilianBands ?? rt.def.civilianCrowd?.bands;
  if (bands) {
    for (const s of bands) addBand(rt, C, s.x, s.z, s.kinds, s.mode ?? 'watch',
      Math.atan2(ctr.x - s.x, ctr.z - s.z), s.route, s.routeEnd);
  } else {
    // 1) 遠巻きに見物する組（戦場の外。兵から三十メートル以上離す）。
    const want = mtn ? 1 : town ? 2 : 3, spots = [];
    for (let i = 0; i < 28 && spots.length < want; i++) {
      const a = i * 2.39996 + 0.4, r = 56 + (i % 4) * 9;
      const x = ctr.x + Math.cos(a) * r, z = ctr.z + Math.sin(a) * r;
      if (Math.abs(x) > half - 12 || Math.abs(z) > half - 12 || !lightOpen(rt, x, z) || nearSoldier(rt, x, z, 34)) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 40)) continue;
      spots.push({ x, z });
    }
    const mix = [['farmer', 'woman', 'child', 'farmer', 'elder'], ['merchant', 'woman', 'farmer', 'child', 'farmer', 'woman'], ['farmer', 'elder', 'woman', 'child']];
    for (const [i, s] of spots.entries()) addBand(rt, C, s.x, s.z, mix[i % mix.length], 'watch', Math.atan2(ctr.x - s.x, ctr.z - s.z));
    // 2) 家・寺に籠もる人。戦や火が来ると飛び出して逃げる（山の寺は谷へ下る）。
    let sites = SOLIDS.filter((s) => s.civilianSite);
    // 印の無い寺・町（比叡山・長島・本能寺など）は、四角い建物の当たりを家・堂と見る（細長い塀・柵は外す）。
    if (sites.length < 3 && (mtn || town)) sites = SOLIDS.filter((s) => s.k === 'r' && !s.yTop && Math.min(s.hw, s.hd) > 1.8 && s.hw * s.hd < 160);
    sites.sort((a, b) => Math.hypot(a.x - ctr.x, a.z - ctr.z) - Math.hypot(b.x - ctr.x, b.z - ctr.z));
    const maxSites = mtn ? 7 : town ? 6 : 3;
    let used = 0;
    for (const s of sites) {
      if (used >= maxSites || C.agents.length >= CAP) break;
      if (C.bands.some((g) => Math.hypot(g.home.x - s.x, g.home.z - s.z) < 14)) continue;
      // 戸口の前（建物の正面から外へ）。塞がっていれば裏口。
      let x = s.x + s.s * (s.hd + 1.6), z = s.z + s.c * (s.hd + 1.6);
      if (!lightOpen(rt, x, z)) { x = s.x - s.s * (s.hd + 1.6); z = s.z - s.c * (s.hd + 1.6); if (!lightOpen(rt, x, z)) continue; }
      const kinds = s.civilianSite === 'temple' || !s.civilianSite && mtn ? (mtn ? ['monk', 'monk', 'woman', 'child', 'elder'] : ['monk', 'monk', 'farmer'])
        : (used % 2 ? ['woman', 'child', 'elder', 'farmer'] : ['farmer', 'woman', 'child']);
      addBand(rt, C, x, z, kinds, 'inside', Math.atan2(x - s.x, z - s.z));
      used++;
    }
  }
  if (!C.agents.length) { rt.warCrowd = null; return; }
  if (!LGEO) { LGEO = personGeo(); LMAT = tintMat(); }
  const im = new THREE.InstancedMesh(LGEO, LMAT, C.agents.length);
  im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
  for (const [i, a] of C.agents.entries()) im.setColorAt(i, a.col);
  rt.scene.add(im);
  C.im = im; C.m4 = new THREE.Matrix4(); C.q = new THREE.Quaternion(); C.e = new THREE.Euler(); C.p = new THREE.Vector3(); C.sv = new THREE.Vector3();
  C.zero = new THREE.Matrix4().makeScale(0, 0, 0); C.wp = { x: 0, z: 0 };
  // 近くで本物の形に入れ替える数人（使い回す。毎コマ作らない）。
  for (const kind of POOL) {
    const col = CROWD[kind][0], monk = kind === 'monk', u = {};
    const mesh = buildModel(u, {
      sohei: 1, soheiV: 9, kosode: !monk, monk: monk ? 1 : 0, tier: 0,
      cloth: col, kesa: monk ? 0x7a6547 : col, armor: col, lace: col, skin: kind === 'child' ? 0xb09070 : 0xa88868,
      hat: 'none', kato: 0, kote: 0, sode: false, saya: false, flag: null, weapon: 'none',
    });
    if (kind === 'child') mesh.scale.setScalar(0.64);
    mesh.userData.noFreeze = true; mesh.userData.civilian = CROWD_NAMES[kind];
    mesh.visible = false; rt.scene.add(mesh);
    C.pool.push({ kind, u, mesh, a: null });
  }
}

function startFlee(rt, C, g, from) {
  g.state = 'flee'; g.from.x = from.x; g.from.z = from.z; g.calm = 0;
  for (const a of g.agents) { a.out = true; a.ran = 0; a.wpT = rnd() * 0.3; }
  const cam = rt.camera.position, d = Math.hypot(cam.x - g.home.x, cam.z - g.home.z);
  if (d < 90 && rt.t - C.screamT > 6) {
    C.screamT = rt.t;
    const v = Math.max(0.15, 1 - d / 90);
    sfx('himei', v);
    rt.after?.(0.5 + rnd() * 0.4, () => { if (!rt.over) sfx('himei', v * 0.7); });
    if (!C.barked && d < 60 && !rt.over) { C.barked = true; rt.bark?.(g.mode === 'inside' ? '悲鳴。家の者が逃げ出していく' : '悲鳴。見物の者が逃げていく'); }
  }
}

function dangerNear(rt, x, z, rFight, rWalk, rFire) {
  let best = null, bd = 1e9;
  for (const u of rt.army.units) {
    if (!soldier(u)) continue;
    const dx = u.pos.x - x, dz = u.pos.z - z;
    if (Math.abs(dx) > rFight || Math.abs(dz) > rFight) continue;
    const d = Math.hypot(dx, dz), hot = u.atk || u.swing || u.target?.alive;
    if ((hot && d < rFight || d < rWalk) && d < bd) { bd = d; best = u.pos; }
  }
  for (const f of rt.world.fires || []) if (f.lit !== false && f.size >= (rt.def.civilianCrowd?.fireSize ?? 2)) { const d = Math.hypot(f.x - x, f.z - z); if (d < rFire && d < bd) { bd = d; best = f; } }
  return best;
}

function crowdScan(rt, C) {
  for (const g of C.bands) {
    if (g.state === 'gone') continue;
    let cx = 0, cz = 0;
    for (const a of g.agents) { cx += a.x; cz += a.z; }
    cx /= g.agents.length; cz /= g.agents.length;
    const inside = g.state === 'inside';
    const dn = dangerNear(rt, cx, cz, inside ? 34 : 40, inside ? 12 : 14, inside ? 26 : 22);
    if (dn) { if (g.state !== 'flee') startFlee(rt, C, g, dn); else { g.from.x = dn.x; g.from.z = dn.z; } g.calm = 0; continue; }
    if (g.state === 'flee' && !g.route && ++g.calm > 6 && g.agents.every((a) => !a.out || a.ran > 22)) {
      // 十分離れて静かになれば、立ち止まって振り返る（また見物する）。
      g.state = 'watch';
      for (const a of g.agents) { a.tx = a.x; a.tz = a.z; a.h = Math.atan2(g.from.x - a.x, g.from.z - a.z) + (rnd() - 0.5) * 0.4; }
    }
  }
}

// 逃げる先を三メートル先に一つ選ぶ。危険から離れ、山では谷へ下る。
function fleeStep(rt, C, a) {
  const g = a.g, w = rt.world;
  const away = Math.atan2(a.x - g.from.x, a.z - g.from.z), h0 = w.heightAt(a.x, a.z);
  const route = g.route;
  if (route) {
    while (a.routeIndex < route.length && Math.hypot(route[a.routeIndex].x - a.x, route[a.routeIndex].z - a.z) < 4) a.routeIndex++;
    if (a.routeIndex === route.length) {
      a.tx = a.x; a.tz = a.z;
      if (g.routeEnd === 'wait') {
        // 包囲された輪中などでは、退避の終点で消さずに残す。危険が迫れば再び逃げる。
        if (dangerNear(rt, a.x, a.z, 12, 8, 10)) g.route = null;
        else if (g.agents.every((b) => b.routeIndex === route.length)) { g.route = null; g.state = 'watch'; }
      } else { a.out = false; if (g.agents.every((b) => !b.out)) g.state = 'gone'; }
      return;
    }
  }
  const goal = route?.[a.routeIndex], heading = goal ? Math.atan2(goal.x - a.x, goal.z - a.z) : away;
  const fromD = Math.hypot(a.x - g.from.x, a.z - g.from.z);
  let bx = a.x, bz = a.z, bs = -1e9;
  for (let i = 0; i < (goal ? 18 : 9); i++) {
    // 避難路が危険なら、まず危険から離れてから道へ戻る。
    if (i === 9 && bs > -1e9) break;
    const j = i % 9, turn = j === 0 ? 0 : Math.ceil(j / 2) * 0.35 * (j % 2 ? 1 : -1);
    const h = (i < 9 ? heading : away) + turn + (rnd() - 0.5) * 0.2, x = a.x + Math.sin(h) * 3, z = a.z + Math.cos(h) * 3;
    // 塀・柵・建物の角を抜けない（途中の一点と塀の当たりも見る）。
    if (!lightOpen(rt, x, z) || !lightOpen(rt, (a.x + x) / 2, (a.z + z) / 2)) continue;
    C.wp.x = x; C.wp.z = z;
    if (rt.army.wallBetween(a, -1, C.wp)) continue;
    // 指定路でも水路・急な岸・兵・火を横切らない。途中も細かく調べる。
    if (goal && (!pathClear(rt, a, C.wp, true) || nearSoldier(rt, x, z, 12))) continue;
    const dy = w.heightAt(x, z) - h0;
    if (Math.abs(dy) > 2.2) continue;
    // 道を優先しても、近い兵や火へ向かう曲がり角は選ばない。
    if (goal && (fromD < 40 && Math.hypot(x - g.from.x, z - g.from.z) < fromD - 0.2 || dangerNear(rt, x, z, 12, 8, 10))) continue;
    const s = Math.cos(turn) * 2 + (goal ? Math.cos(h - away) : 0) - (C.mtn ? dy * 1.2 : Math.abs(dy) * 0.3);
    if (s > bs) { bs = s; bx = x; bz = z; }
  }
  a.tx = bx; a.tz = bz;
}

function crowdTick(rt, dt) {
  const C = rt.warCrowd;
  if (!C) return;
  C.scan -= dt;
  if (!rt.over && C.scan <= 0) { C.scan = 0.8; crowdScan(rt, C); }
  const cam = rt.camera.position, still = S.reduceMotion, half = rt.world.half;
  // 近い人を本物の形へ（0.3 秒ごと）。
  C.poolT -= dt;
  if (C.poolT <= 0) {
    C.poolT = 0.3;
    for (const P of C.pool) if (P.a && (!P.a.out || Math.hypot(P.a.x - cam.x, P.a.z - cam.z) > NEAR + 4)) { P.a.model = null; P.a = null; P.mesh.visible = false; }
    for (const a of C.agents) {
      if (a.model || !a.out || Math.hypot(a.x - cam.x, a.z - cam.z) > NEAR) continue;
      const P = C.pool.find((p) => !p.a && p.kind === a.kind) || (a.kind === 'merchant' || a.kind === 'townsman' || a.kind === 'elder' ? C.pool.find((p) => !p.a && p.kind === 'farmer') : null);
      if (P) { P.a = a; a.model = P; P.mesh.visible = true; }
    }
  }
  const im = C.im;
  for (const [i, a] of C.agents.entries()) {
    const g = a.g;
    let moving = false;
    if (!rt.over && g.state === 'flee' && a.out) {
      a.wpT -= dt;
      if (a.wpT <= 0 || Math.hypot(a.tx - a.x, a.tz - a.z) < 0.3) { a.wpT = 0.6; fleeStep(rt, C, a); }
      const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const st = Math.min(d, a.spd * dt);
        a.x += dx / d * st; a.z += dz / d * st; a.ran += st; moving = true;
        a.h = Math.atan2(dx, dz);
      }
      // 戦場の端まで逃げきったら消える。
      if (!g.route && (Math.abs(a.x) > half - 3 || Math.abs(a.z) > half - 3)) { a.out = false; if (g.agents.every((b) => !b.out)) g.state = 'gone'; }
    } else if (!still) a.idle += dt;
    if (moving && !still) a.ph += dt * a.spd * 3.4;
    const P = a.model;
    if (!a.out || P) { im.setMatrixAt(i, C.zero); if (!P) continue; }
    const y = rt.world.heightAt(a.x, a.z);
    if (!P) {
      const bob = moving && !still ? Math.abs(Math.sin(a.ph)) * 0.06 : 0;
      C.e.set(moving ? 0.2 : 0, a.h + (!moving && !still ? Math.sin(a.idle * 0.4) * 0.15 : 0), 0);
      C.q.setFromEuler(C.e); C.p.set(a.x, y + bob, a.z); C.sv.setScalar(a.sc);
      C.m4.compose(C.p, C.q, C.sv); im.setMatrixAt(i, C.m4);
      continue;
    }
    const m = P.mesh, u = P.u;
    m.position.set(a.x, y, a.z); m.rotation.y = a.h;
    const sw = moving && !still ? Math.sin(a.ph) * 0.45 : 0;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.body.rotation.x = moving ? 0.22 : a.kind === 'elder' ? 0.15 : 0;
    u.moving = still ? 0 : moving ? 1 : 0;
    poseArms(u, a.ph);
    if (moving) { u.armL.rotation.x = -0.6 + sw * 0.4; u.armR.rotation.x = -0.6 - sw * 0.4; }
    else if (a.kind === 'monk') { u.armL.rotation.x = -0.7; u.armR.rotation.x = -0.7; }  // 合掌
  }
  im.instanceMatrix.needsUpdate = true;
}

function crowdDispose(rt) {
  const C = rt.warCrowd;
  if (!C) return;
  rt.scene.remove(C.im); C.im.dispose();
  for (const P of C.pool) rt.scene.remove(P.mesh);
  rt.warCrowd = null;
}
