// 城攻め共通の手触り。兵は足さず、落ちる石・矢は十二枠を使い回す。
import * as THREE from 'three';
import { FL } from './floors.js';
import { hashigo } from './props.js';
import { placeLadder, startClimb, ladderAlive } from './siege_ladder.js';
import { makeRam } from './hajo.js';
import { S } from './settings.js';
import { inCoverOf } from './taketaba.js';

let rockGeo, arrowGeo, rockMat, arrowMat, crackGeo, crackMat;
function pool(rt) {
  if (!rockGeo) {
    rockGeo = new THREE.IcosahedronGeometry(0.27, 0);
    arrowGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.95, 4);
    rockMat = new THREE.MeshLambertMaterial({ color: 0x726d62 });
    arrowMat = new THREE.MeshLambertMaterial({ color: 0x65462d });
  }
  const a = [];
  for (let i = 0; i < 12; i++) {
    const mesh = new THREE.Mesh(rockGeo, rockMat);
    mesh.visible = false; mesh.userData.noFreeze = true; rt.scene.add(mesh);
    a.push({ mesh, active: false, t: 0, dur: 0, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, source: null, arrow: false });
  }
  return a;
}

// 扉の外の面に細い割れ目を置く。板の形や材質はそのまま使う。
function cracks(s) {
  const leaves = s.mesh && s.mesh.userData.leaves;
  if (!leaves) return [];
  if (!crackGeo) { crackGeo = new THREE.BoxGeometry(0.035, 0.65, 0.008); crackMat = new THREE.MeshBasicMaterial({ color: 0x20160e }); }
  const out = [], width = Math.hypot(s.seg[2] - s.seg[0], s.seg[3] - s.seg[1]) / 2;
  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i], board = leaf.children[0];
    if (!board || !board.geometry) continue;
    if (!board.geometry.boundingBox) board.geometry.computeBoundingBox();
    const box = board.geometry.boundingBox;
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(crackGeo, crackMat);
      m.position.set((i ? -1 : 1) * width * (0.3 + k * 0.18), 0.9 + k * 0.5, box.max.z + 0.015);
      m.rotation.z = k % 2 ? -0.3 : 0.25; m.visible = false;
      leaf.add(m); out.push(m);
    }
  }
  return out;
}

function isGate(s) {
  return s.seg && /門|木戸/.test(s.name || '') && !/郭|曲輪/.test(s.name || '') &&
    (s.gate != null || Math.hypot(s.seg[2] - s.seg[0], s.seg[3] - s.seg[1]) < 10) && s.maxHp <= 1e8 && !s.noTarget;
}

function rush(rt, e) {
  const s = e.s;
  // 門へ攻めていた近い隊だけを、口の内側へ進める。待機・退却・射手の持ち場は尊重する。
  for (const g of rt.army.groups) {
    if (g.team === s.team || g.routed || !/^(attack|assault)$/.test(g.order)) continue;
    let n = 0, targeted = e.attackers.has(g), cx = 0, cz = 0;
    for (const u of g.units) if (u.alive && !u.isPlayer && !u.fleeing && !u.climb && !u.mounted && u.type !== 'bow' && u.type !== 'gun') {
      if (Math.hypot(u.pos.x - e.x, u.pos.z - e.z) < 14) { n++; cx += u.pos.x; cz += u.pos.z; }
      if (u.target === s) targeted = true;
    }
    if (!n || (!targeted && g.order !== 'assault')) continue;
    const side = ((cx / n - e.x) * e.nx + (cz / n - e.z) * e.nz) < 0 ? -1 : 1;
    const order = g.order, assault = g.assault;
    g.focus = null; g.assault = null; g.order = 'move';
    g.anchor.x = cx / n; g.anchor.z = cz / n;
    g.dest = { x: e.x - e.nx * side * 6, z: e.z - e.nz * side * 6 };
    const dest = g.dest;
    g.onArrive = (q) => { if (q.order !== 'move' || q.dest !== dest) return; q.order = order; q.assault = assault; q.dest = null; };
    for (const u of g.units) if (u.target === s) { u.target = null; u.atk = null; }
  }
}

function drop(rt, state, e) {
  let guard = null, victim = null, best = 100;
  // 梯子の途中にも落ちる。着弾点は投げた時に決まり、登り続けたり避けたりできる。
  for (const u of rt.army.units) if (u.alive && u.team !== e.s.team && u.climb && u.climb.ladder && Math.hypot(u.pos.x - e.x, u.pos.z - e.z) < 20) { victim = u; break; }
  const lx = victim ? victim.climb.ladder.topX : e.x, lz = victim ? victim.climb.ladder.topZ : e.z;
  rt.army.forNear(lx, lz, 9, (u) => {
    if (!u.alive || u.isStruct || u.fleeing) return;
    if (u.team === e.s.team) { if (!guard || u.pos.y > guard.pos.y) guard = u; return; }
    if (victim && victim.climb) return;
    const dx = u.pos.x - e.x, dz = u.pos.z - e.z;
    if (dx * e.nx + dz * e.nz < 0.3) return;
    const d = dx * dx + dz * dz;
    if (d < best) { best = d; victim = u; }
  });
  if (!guard || !victim) return;
  const p = state.falls.find((q) => !q.active);
  if (!p) return;
  p.active = true; p.t = 0; p.source = guard; p.arrow = e.arrow = !e.arrow;
  p.x = lx; p.z = lz; p.y = Math.max(guard.pos.y + 1.6, victim.pos.y + 2.5, rt.world.heightAt(lx, lz) + 4);
  p.tx = victim.pos.x; p.tz = victim.pos.z; p.ty = victim.pos.y + 0.4;
  p.dur = p.arrow ? 0.65 : 1.05;
  p.mesh.geometry = p.arrow ? arrowGeo : rockGeo; p.mesh.material = p.arrow ? arrowMat : rockMat;
  p.mesh.visible = true; p.mesh.rotation.set(0, 0, 0);
  if (!p.arrow && rt.t - state.warnT >= 8) { state.warnT = rt.t; rt.bark('上から石が来るぞ！', true); }
}

function ladderHint(rt, state) {
  const P = rt.player.u;
  // 地図の城は既に梯子を掛ける手を持つ。ほかの城は門の横の塀を使う。
  if (rt.def.mapCastle || !P.alive || state.ladders.length >= 2) { rt.uninteract('_siegeLadder'); state.hintWall = null; return; }
  let wall = null, gx = 0, gz = 0, distance = 64;
  for (const e of state.gates) {
    if (!e.s.alive || e.s.opened || e.s.team === P.team || Math.hypot(P.pos.x - e.x, P.pos.z - e.z) > 24) continue;
    for (const s of rt.army.structs) {
      if (!s.alive || s.team !== e.s.team || !s.seg || !/塀|柵|石垣/.test(s.name || '') || state.usedWalls.has(s)) continue;
      const [ax, az, bx, bz] = s.seg, dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
      if (len2 < 25) continue;
      const f = Math.max(0.2, Math.min(0.8, ((P.pos.x - ax) * dx + (P.pos.z - az) * dz) / len2));
      const x = ax + dx * f, z = az + dz * f, d = (x - P.pos.x) ** 2 + (z - P.pos.z) ** 2;
      if (d >= distance || Math.hypot(x - e.x, z - e.z) > 20 || Math.hypot(x - e.x, z - e.z) < 5) continue;
      if (FL.ladders.some((l) => ladderAlive(l) && Math.hypot(l.x - x, l.z - z) < 6)) continue;
      distance = d; wall = s; gx = x; gz = z;
    }
  }
  if (!wall) { rt.uninteract('_siegeLadder'); state.hintWall = null; return; }
  // 長押しの途中で同じ手を登録し直さない。
  if (state.hintWall === wall && Math.hypot(gx - state.hintX, gz - state.hintZ) < 2) return;
  state.hintWall = wall; state.hintX = gx; state.hintZ = gz;
  const dx = wall.seg[2] - wall.seg[0], dz = wall.seg[3] - wall.seg[1], len = Math.hypot(dx, dz);
  let nx = -dz / len, nz = dx / len;
  if ((P.pos.x - gx) * nx + (P.pos.z - gz) * nz < 0) { nx = -nx; nz = -nz; }
  const foot = { x: gx + nx * 2, z: gz + nz * 2 };
  rt.uninteract('_siegeLadder');
  rt.addInteract('_siegeLadder', foot, '梯子を掛けて登る', () => {
    if (!wall.alive || state.usedWalls.has(wall)) return;
    const y0 = rt.world.heightAt(foot.x, foot.z), ground = rt.world.heightAt(gx, gz);
    const bounds = wall.mesh ? new THREE.Box3().setFromObject(wall.mesh) : null;
    const y1 = Math.max(ground + 2, Math.min(ground + 8, bounds && !bounds.isEmpty() ? bounds.max.y + 0.15 : ground + 3.3));
    const landing = { x: gx - nx * 2, z: gz - nz * 2, y: rt.world.heightAt(gx - nx * 2, gz - nz * 2) };
    const l = placeLadder(rt.world, { foot, topX: gx, topZ: gz, topY: y1, landing, team: P.team, rt, autoKnock: true });
    l.autoUse = true; l.placed = false;
    const mesh = hashigo({ x: 0, y: 0, z: 0 }, { x: 0, y: y1 - y0, z: -2 });
    mesh.position.set(foot.x, y0, foot.z); mesh.rotation.y = Math.atan2(nx, nz); mesh.rotation.x = S.reduceMotion ? 0 : -1.1; mesh.userData.noFreeze = true;
    rt.scene.add(mesh); l.mesh = mesh;
    state.ladders.push({ l, mesh, t: 0, player: P }); state.usedWalls.add(wall);
    rt.uninteract('_siegeLadder');
  }, { r: 3, hold: 1.4 });
}

export function siegeFeelTick(rt, dt) {
  if (rt.over || rt.def.dojo || rt.def.town || !rt.player.u) return;
  const A = rt.army;
  const state = rt._siegeFeel || (rt._siegeFeel = { scanT: 0, gates: [], known: new Set(), falls: null, ladders: [], usedWalls: new Set(), warnT: -99 });
  if ((state.scanT -= dt) <= 0) {
    state.scanT = 1;
    for (const s of A.structs) if (s.alive && isGate(s) && !state.known.has(s)) {
      state.known.add(s);
      const dx = s.seg[2] - s.seg[0], dz = s.seg[3] - s.seg[1], len = Math.hypot(dx, dz) || 1;
      const x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2;
      let nx = s.nx ?? -dz / len, nz = s.nz ?? dx / len;
      // 向きを持たない古い門は、近い門兵のいる側を内とする。
      if (s.nx == null) {
        let nearest = 100, side = 0;
        A.forNear(x, z, 10, (u) => {
          if (!u.alive || u.isStruct || u.team !== s.team) return;
          const ux = u.pos.x - x, uz = u.pos.z - z, d = ux * ux + uz * uz, dot = ux * nx + uz * nz;
          if (d < nearest && Math.abs(dot) > 0.5) { nearest = d; side = dot; }
        });
        if (side > 0) { nx = -nx; nz = -nz; }
      }
      state.gates.push({ s, x, z, nx, nz, hp: s.hp, shake: 0, dropT: 4, broken: false, ram: null, cracks: cracks(s), attackers: new Set() });
    }
    if (state.gates.length) {
      if (!state.falls) state.falls = pool(rt);
      ladderHint(rt, state);
    }
  }
  for (const e of state.gates) {
    const s = e.s;
    if ((!s.alive || s.opened) && !e.broken) { e.broken = true; rush(rt, e); }
    if (e.ram) e.ram.tick(dt);
    if (!s.alive || s.opened) continue;
    // 打っていた隊は破れる前に覚える（破れたコマで兵の標的が外れるため）。
    if (e.dropT <= dt || !e.ram) for (const u of A.units) if (u.alive && u.target === s && u.group) e.attackers.add(u.group);
    if (s.hp < e.hp) e.shake = 0.32;
    e.hp = s.hp;
    const wear = s.hp / s.maxHp, level = wear < 0.25 ? 3 : wear < 0.5 ? 2 : wear < 0.75 ? 1 : 0;
    for (let i = 0; i < e.cracks.length; i++) e.cracks[i].visible = i % 3 < level;
    if (e.shake > 0) {
      e.shake = Math.max(0, e.shake - dt);
      const leaves = s.mesh && s.mesh.userData.leaves;
      if (leaves && !S.reduceMotion) for (let i = 0; i < leaves.length; i++) {
        leaves[i].rotation.y = (i ? -1 : 1) * (0.03 * (s.wearLv || 0) + Math.sin(e.shake * 55) * e.shake * 0.22);
      }
    }
    if (Math.hypot(e.x - rt.player.u.pos.x, e.z - rt.player.u.pos.z) > 70) continue;
    if (!rt.def.mapCastle && !s._ramMesh && !e.ram && !(rt.flags && rt.flags.ram)) {
      let group = null;
      A.forNear(e.x, e.z, 5, (u) => {
        if (!group && u.alive && !u.isStruct && !u.isPlayer && !u.climb && u.team !== s.team && u.target === s && u.group && !u.group.routed && u.group.count >= 3) group = u.group;
      });
      if (group) e.ram = makeRam(rt, { group, gate: { struct: s, get breached() { return !s.alive || s.opened; } }, kind: '破城槌' });
    }
    if ((e.dropT -= dt) <= 0) { e.dropT = 6; drop(rt, state, e); }
  }
  for (const q of state.ladders) if (q.t < 1) {
    q.t = Math.min(1, q.t + dt);
    q.mesh.rotation.x = S.reduceMotion ? 0 : -(1 - q.t) * 1.1;
    if (q.t === 1) { q.l.placed = true; if (q.player.alive && Math.hypot(q.player.pos.x - q.l.x, q.player.pos.z - q.l.z) < 3) startClimb(q.player, q.l); }
  }
  if (!state.falls) return;
  for (const p of state.falls) {
    if (!p.active) continue;
    p.t += dt;
    const f = Math.min(1, p.t / p.dur), fall = f * f;
    p.mesh.position.set(p.x + (p.tx - p.x) * f, p.y + (p.ty - p.y) * fall, p.z + (p.tz - p.z) * f);
    if (!p.arrow) p.mesh.rotation.x += dt * 5;
    if (f < 1) continue;
    p.active = false; p.mesh.visible = false;
    A.forNear(p.tx, p.tz, p.arrow ? 0.65 : 1.1, (u) => {
      if (!u.alive || u.isStruct || u.team === p.source.team || u.invuln || Math.abs(u.pos.y - p.ty) > 1.8) return;
      const covered = u.tatake || (u.isPlayer && rt.flags.carry) || inCoverOf(rt, u.pos.x, u.pos.z, u.team);
      A.damage(u, (p.arrow ? 9 : 18) * (covered ? 0.3 : 1), p.source, { kind: p.arrow ? 'arrow' : 'slam' });
    });
    if (!p.arrow) A.play('knock', p.mesh.position, 0.7);
  }
}
