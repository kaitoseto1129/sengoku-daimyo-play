// 地図の城方。門の槍衾・曲輪内の予備・次の曲輪への退き・櫓の石落とし。
// 兵を増やさず、判断は半秒ごと。落とす石は櫓ごとに一つを使い回す。
import * as THREE from 'three';
import { nakaRoomAt } from './naka.js';

let rockGeo, rockMat;

export function makeCastleGuard(rt, P, team, route) {
  const F = rt.flags;
  const moving = new Map(), passages = new Map();
  const brokenAt = P.gates.map(() => null);
  const stones = [];
  for (const t of P.towers) {
    if (!t.garrison) continue;
    rockGeo ||= new THREE.IcosahedronGeometry(.24, 0);
    rockMat ||= new THREE.MeshStandardMaterial({ color: 0x797269, roughness: 1 });
    const mesh = new THREE.Mesh(rockGeo, rockMat);
    mesh.visible = false; rt.scene.add(mesh);
    stones.push({ t, mesh, next: 0, falling: false, speed: 0, owner: null });
  }
  let acc = 0, lastSay = -99;
  const say = text => { if (rt.t - lastSay >= 8) { lastSay = rt.t; rt.say('城兵', text, 3); } };
  const isShooter = g => F.shooters.includes(g);
  const place = (gate, depth, side = 0) => ({
    x: gate.c.x - gate.n.x * depth + gate.n.z * side,
    z: gate.c.z - gate.n.z * depth - gate.n.x * side,
  });
  function move(g, gi, at) {
    if (moving.has(g)) return;
    const c = g.center();
    g.anchor.x = c.x; g.anchor.z = c.z;
    g.order = 'move'; g.dest = at; g.onArrive = null; g.focus = null;
    g.speed = 3.2; g.fire = false; g.breach = null;
    g.formation = 'column'; g.colW = 2;
    g.noAI = true; g.siegeAI = true;
    for (const u of g.units) {
      u.target = null; u.atk = null;
      if (u.sama || u.loopP) rt.army.freeSama(u);
    }
    moving.set(g, { gi, at });
  }
  function open(gate, g) {
    if (!gate.st.alive) return;
    if (!passages.has(gate)) {
      passages.set(gate, new Set());
      gate.st.opened = true; gate.part.open();
    }
    passages.get(gate).add(g);
  }
  function tickMoves() {
    for (const [g, m] of moving) {
      if (!g.count || g.routed) { moving.delete(g); continue; }
      const gate = P.gates[m.gi], c = g.center(), goal = gate.i + 1;
      // 同じ開門を後から通る隊も、閉める前の人数に含める。
      if (passages.has(gate)) passages.get(gate).add(g);
      let arrived = Math.hypot(c.x - m.at.x, c.z - m.at.z) < 5;
      for (const u of g.units) if (u.alive && !u.fleeing && P.regionOf(u.pos.x, u.pos.z) < goal) arrived = false;
      if (arrived) {
        g.order = 'hold'; g.dest = null; g.anchor.x = m.at.x; g.anchor.z = m.at.z;
        g.facing = Math.atan2(gate.n.x, gate.n.z);
        g.formation = isShooter(g) ? 'line' : 'yari';
        g.fire = true; g.aggro = isShooter(g) ? 36 : 6;
        moving.delete(g); continue;
      }
      // 要だけ先へ走らせず、実際の兵が追いついてから道の次の角へ進める。
      if (Math.hypot(c.x - g.anchor.x, c.z - g.anchor.z) > 7) {
        g.dest = g.anchor; continue;
      }
      let q = route(P, g.anchor, goal, m.at);
      if (q?.isStruct) {
        const door = P.gates.find(x => x.st === q);
        if (door && Math.hypot(c.x - door.c.x, c.z - door.c.z) < 7) {
          open(door, g); q = route(P, g.anchor, goal, m.at);
        } else q = door ? door.app : m.at;
      }
      g.dest = q;
    }
    for (const [gate, groups] of passages) {
      let outside = false;
      for (const g of groups) for (const u of g.units) {
        if (u.alive && !u.fleeing && !g.routed && P.regionOf(u.pos.x, u.pos.z) <= gate.i) outside = true;
      }
      if (outside && gate.st.alive) continue;
      if (gate.st.alive && rt.army.units.some(u => u.alive && !u.isStruct && u.team !== team && Math.hypot(u.pos.x - gate.c.x, u.pos.z - gate.c.z) < 2.5)) continue;
      // 敵も通れる実際の開門。城兵が通り切れば閉め、破れた門は戻さない。
      if (gate.st.alive) {
        gate.st.opened = false;
        const door = gate.part.door || gate.part.mesh;
        for (const leaf of door?.userData.leaves || []) leaf.rotation.set(0, 0, 0);
        if (door?.children[2]) door.children[2].visible = true;
      }
      passages.delete(gate);
    }
  }
  function tickPosts() {
    for (let gi = 0; gi < P.gates.length; gi++) {
      const gate = P.gates[gi];
      if (!gate.st.alive && brokenAt[gi] == null) brokenAt[gi] = rt.t;
      const zone = F.SZ?.zones.find(z => z.id === `z${gate.i + 1}`);
      const lost = zone?.owner === 'friend';
      const retreat = lost || (brokenAt[gi] != null && rt.t - brokenAt[gi] >= 12);
      const gs = F.garrison[gi];
      if (retreat) {
        let ni = gi + 1;
        while (ni < P.gates.length && !P.gates[ni].st.alive) ni++;
        if (ni >= P.gates.length) continue;
        const next = P.gates[ni];
        for (let j = gs.length - 1; j >= 0; j--) {
          const g = gs[j];
          if (!g.count || g.routed || moving.has(g)) continue;
          move(g, ni, place(next, isShooter(g) ? 4 : 8, isShooter(g) ? 6 : 0));
          gs.splice(j, 1); F.garrison[ni].push(g);
          say(`${next.name}へ退け！　槍を揃えて食い止めよ！`);
        }
        continue;
      }
      // 各曲輪の控えを、弱った門か、乗り越えられた塀へ送る。
      for (const g of gs) {
        if (!g.castleReserve || g.reserveUsed || !g.count || g.routed || moving.has(g)) continue;
        let threat = null;
        for (const u of rt.army.units) {
          if (u.alive && !u.isStruct && u.team !== team && !u.fleeing && !u.noTarget && P.regionOf(u.pos.x, u.pos.z) === gate.i + 1) { threat = u; break; }
        }
        if (!threat && gate.st.alive && gate.st.hp > gate.st.maxHp * .4) continue;
        g.reserveUsed = true;
        move(g, gi, threat ? { x: threat.pos.x, z: threat.pos.z } : place(gate, 5));
        say('控えの槍組、危ない口へ回れ！');
      }
    }
  }
  function tickStones(dt, decide) {
    for (const s of stones) {
      if (s.falling) {
        s.speed += 9.8 * dt; s.mesh.position.y -= s.speed * dt;
        const p = s.mesh.position, y = rt.world.heightAt(p.x, p.z);
        if (p.y <= y + .8) {
          for (const u of rt.army.units) {
            if (!u.alive || u.isStruct || u.team === team || Math.abs(u.pos.y - y) > 2 || nakaRoomAt(u.pos.x, u.pos.z, u.pos.y)) continue;
            if (Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 1.1) rt.army.damage(u, 44, s.owner, { kind: 'rock' });
          }
          rt.army.spark(p.x, y + .2, p.z, 6);
          s.falling = false; s.mesh.visible = false;
        }
        continue;
      }
      if (!decide || rt.t < s.next || !s.t.garrison.count || s.t.garrison.fire === false) continue;
      let target = null, guard = null, best = 3.2;
      for (const u of rt.army.units) {
        if (!u.alive || u.isStruct || u.team === team || u.fleeing || u.noTarget || Math.hypot(u.pos.x - s.t.x, u.pos.z - s.t.z) > 7 || nakaRoomAt(u.pos.x, u.pos.z, u.pos.y)) continue;
        for (const v of s.t.garrison.units) {
          if (!v.alive || v.fleeing || v.pos.y - u.pos.y < 2) continue;
          const d = Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z);
          if (d < best) { best = d; target = u; guard = v; }
        }
      }
      if (!target) continue;
      s.next = rt.t + 7; s.speed = 0; s.owner = guard; s.falling = true;
      s.mesh.position.set(target.pos.x, guard.pos.y, target.pos.z); s.mesh.visible = true;
      rt.army.play('knock', guard.pos, .7);
      say('櫓から石が落ちるぞ！');
    }
  }
  return { tick(dt) {
    if (F.ending || F.duel || F.step < 1) return;
    acc += dt;
    const decide = acc >= .5;
    if (decide) { acc = 0; tickPosts(); tickMoves(); }
    tickStones(dt, decide);
  } };
}
