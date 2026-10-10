// 本陣の報告・地図と、深手の兵の後送。戦の筋や名のある者には下知を出さない。
import * as THREE from 'three';
import { buildModel, poseArms, FACTION } from './units.js';
import { SOLIDS } from './props.js';
import { S } from './settings.js';
import { warPeopleInit, warPeopleTick, warPeopleDispose } from './war_people.js';

function clearPath(rt, from, to, team) {
  if (rt.army.wallBetween(from, team, to)) return false;
  const n = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.6);
  for (let i = 0; i <= n; i++) {
    const k = i / Math.max(1, n), x = from.x + (to.x - from.x) * k, z = from.z + (to.z - from.z) * k;
    if (!rt.world.walkable(x, z) || rt.world.inWaterAt?.(x, z)) return false;
    for (const s of SOLIDS) if (x > s.x0 - 0.35 && x < s.x1 + 0.35 && z > s.z0 - 0.35 && z < s.z1 + 0.35) return false;
  }
  return true;
}

function ordinary(u) {
  const g = u.group;
  return u.alive && g && !u.isPlayer && !u.isSub && !u.name && !u.invuln && !u.noTarget && !u.mounted && !u.perch && !u.loopP && !u.stdHeld && !u.stdPickup && !u.fleeing && !g.routed && !g.isPlayerSquad && !g.isRunner && !g.people && u !== g.leader && (u.type === 'ashigaru' || u.type === 'samurai');
}

export function campLifeInit(rt) {
  if (rt.def.dojo) return;
  const L = rt.campLife = { camps: [], scan: 0, active: [0, 0], geo: [], mat: [] };
  rt.scene.traverse((node) => {
    const c = node.userData.commandPost;
    if (!c || L.camps.length >= 2) return;
    let team = -1;
    for (const g of rt.army.groups) if (FACTION[g.faction]?.flag === c.mon) { team = g.team; break; }
    if (rt.def.sides?.a?.mon === c.mon) team = 0;
    else if (rt.def.sides?.b?.mon === c.mon) team = 1;
    if (team < 0 || team > 1 || L.camps.some((p) => p.team === team)) return;
    // 後送先は幕の外。入口へ通じる道が塞がれていれば、この陣には足さない。
    const to = { x: c.x, z: c.z + c.d / 2 + 4 };
    const C = { ...c, team, to, node, phase: team * 11, danger: false, heat: 0, actors: [], tokens: [] };
    L.camps.push(C);
  });
  warPeopleInit(rt, L.camps);
  if (!L.camps.length) return;
  const box = new THREE.BoxGeometry(1, 1, 1); L.geo.push(box);
  const wood = new THREE.MeshLambertMaterial({ color: 0x514334 });
  const paper = new THREE.MeshLambertMaterial({ color: 0xb6a77e });
  const ink = new THREE.MeshLambertMaterial({ color: 0x48493b });
  L.mat.push(wood, paper, ink);
  for (const C of L.camps) {
    const root = C.map = new THREE.Group(); root.userData.noFreeze = true; rt.scene.add(root);
    root.position.set(C.x + 1.7, rt.world.heightAt(C.x + 1.7, C.z), C.z);
    const part = (mat, x, y, z, w, h, d) => { const m = new THREE.Mesh(box, mat); m.position.set(x, y, z); m.scale.set(w, h, d); root.add(m); return m; };
    part(wood, 0, 0.7, 0, 1.4, 0.09, 1);
    part(wood, -0.5, 0.35, 0, 0.1, 0.7, 0.7); part(wood, 0.5, 0.35, 0, 0.1, 0.7, 0.7);
    part(paper, 0, 0.755, 0, 1.2, 0.015, 0.85);
    // 川と道を細い形で示す。戦況の駒は実際の両軍の重心へ動かす。
    part(ink, -0.15, 0.768, 0, 0.025, 0.008, 0.8);
    part(ink, 0, 0.768, 0.18, 1.1, 0.008, 0.018);
    C.tokens.push(part(wood, -0.3, 0.8, 0, 0.08, 0.06, 0.08), part(ink, 0.3, 0.8, 0, 0.08, 0.06, 0.08));
    for (let i = 0; i < 2; i++) {
      const u = {};
      const mesh = buildModel(u, { armor: 0x383631, lace: 0x665b46, hat: i ? 'jingasa' : 'kabuto', flag: null, weapon: 'none', skin: 0xa88868 });
      u.lookWeapon = 'none'; poseArms(u); mesh.userData.noFreeze = true; rt.scene.add(mesh);
      C.actors.push({ mesh, u });
    }
  }
}

function scan(rt, L) {
  L.active[0] = L.active[1] = 0;
  for (const u of rt.army.units) if (u.alive && u.rearWound && u.rearWound.t > rt.army.time && !u.fleeing) L.active[u.team]++;
  for (const C of L.camps) {
    C.danger = false; C.heat = 0;
    let ax = 0, az = 0, an = 0, bx = 0, bz = 0, bn = 0;
    for (const u of rt.army.units) {
      if (!u.alive || u.type === 'dummy' || u.type === 'porter') continue;
      const d = Math.hypot(u.pos.x - C.x, u.pos.z - C.z);
      if (u.team !== C.team && d < 12 && !u.fleeing) C.danger = true;
      if (u.target?.alive && d < 70) C.heat++;
      if (u.team === C.team) { ax += u.pos.x; az += u.pos.z; an++; }
      else { bx += u.pos.x; bz += u.pos.z; bn++; }
    }
    for (let i = 0; i < 2; i++) {
      const n = i ? bn : an, x = i ? bx : ax, z = i ? bz : az, m = C.tokens[i];
      m.visible = n > 0;
      if (n) { m.position.x = Math.max(-0.5, Math.min(0.5, (x / n - C.x) / 160)); m.position.z = Math.max(-0.32, Math.min(0.32, (z / n - C.z) / 160)); }
    }
    if (C.danger || L.active[C.team] >= 2) continue;
    for (const u of rt.army.units) {
      if (L.active[C.team] >= 2) break;
      if (u.team !== C.team || !ordinary(u) || u.rearTreated || u.escort || u.hp >= u.maxHp * 0.3 || u.group.count <= 4 || u.atk || u.swing) continue;
      const d = Math.hypot(u.pos.x - C.to.x, u.pos.z - C.to.z);
      if (d < 8 || d > 38 || !clearPath(rt, u.pos, C.to, u.team)) continue;
      // 撤く向きの近くに敵がいる時は動かさず、今の持ち場で身を守らせる。
      let unsafe = false, helper = null, hd = 7;
      for (const o of rt.army.units) {
        if (!o.alive) continue;
        const od = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (o.team !== u.team && !o.fleeing && od < 6) unsafe = true;
        if (o.team === u.team && o !== u && ordinary(o) && !o.escort && !o.rearWound && !o.cover && !o.target?.alive && !o.atk && o.hp > o.maxHp * 0.6 && od < hd) { helper = o; hd = od; }
      }
      if (unsafe) continue;
      u.rearWound = { to: C.to, t: rt.army.time + d / Math.max(0.5, u.speed * 0.6) + 15 };
      u.rearTreated = true; u.aiT = 0; L.active[u.team]++;
      if (helper) { helper.escort = { u, s: 1 }; helper.aiT = 0; }
    }
  }
}

export function campLifeTick(rt, dt) {
  warPeopleTick(rt, dt);
  const L = rt.campLife;
  if (!L || !L.camps.length) return;
  L.scan -= dt;
  if (!rt.over && L.scan <= 0) { L.scan = 1; scan(rt, L); }
  for (const C of L.camps) {
    const near = Math.hypot(rt.camera.position.x - C.x, rt.camera.position.z - C.z) < 90;
    C.map.visible = near;
    if (!S.reduceMotion && !rt.over) C.phase += dt * (C.heat > 4 ? 1.4 : 0.7);
    const t = C.phase % 28;
    for (let i = 0; i < C.actors.length; i++) {
      const A = C.actors[i], U = A.u;
      A.mesh.visible = near && !C.danger;
      if (!A.mesh.visible) continue;
      // 報告役は入口から床几の手前へ来て一礼し、戻る。書役は地図を指す。
      const travel = i === 0 && (t < 7 || t > 17 && t < 24);
      const k = t < 7 ? t / 7 : t < 17 ? 1 : t < 24 ? 1 - (t - 17) / 7 : 0;
      const x = C.x + (i ? 1.7 : 0), z = C.z + (i ? 1 : (1 - k) * (C.d / 2 + 1.5) - k);
      A.mesh.position.set(x, rt.world.heightAt(x, z), z);
      A.mesh.rotation.y = i || t < 17 ? Math.PI : 0;
      const sw = travel && !S.reduceMotion && !rt.over ? Math.sin(C.phase * 8) * 0.35 : 0;
      U.legL.rotation.x = sw; U.legR.rotation.x = -sw;
      U.body.rotation.x = i ? 0.18 : t >= 7 && t < 10 ? 0.35 : 0;
      U.moving = travel ? 1 : 0; poseArms(U, C.phase * 8);
      if (i && U.armR) U.armR.rotation.x = -0.65;
    }
  }
}

export function campLifeDispose(rt) {
  warPeopleDispose(rt);
  const L = rt.campLife;
  if (!L) return;
  for (const C of L.camps) { rt.scene.remove(C.map); for (const A of C.actors) rt.scene.remove(A.mesh); }
  for (const g of L.geo) g.dispose();
  for (const m of L.mat) m.dispose();
  rt.campLife = null;
}
