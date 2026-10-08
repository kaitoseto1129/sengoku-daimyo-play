// 木ノ芽峠の制圧。本人が本道の曲輪に入り、実兵と守りを崩して押さえる。
export function makeKinomeZones(rt, o) {
  const zones = o.zones, byId = {};
  for (const z of zones) {
    byId[z.id] = z; z.owner = 'enemy'; z.state = 'enemy'; z.holdT = 0;
    z.initialNeed = z.need; z.scanT = 0; z.pressT = 0; z.friends = 0; z.enemies = 0;
  }
  let elapsed = 0;
  return {
    zones, byId,
    // 共通の山城守備が呼ぶ退き先。道順はこの戦の定義で渡す。
    retreatFate(b) { return o.retreat(b); },
    tick(dt) {
      elapsed += dt;
      if (elapsed < 0.5 || rt.flags.ending) return;
      const span = elapsed; elapsed = 0;
      for (const z of zones) {
        if (!rt.flags.step || z.enabled && !z.enabled() || z.before && byId[z.before].owner !== 'friend') continue;
        if (z.startedAt === undefined) z.startedAt = rt.t;
        const gate = z.gate && rt.army.structs.find((s) => s.name === z.gate);
        // 本人と実際の打ち手が門前にいる時だけ、詰まった木戸への寄せを助ける。
        const x = gate?.alive ? (gate.seg[0] + gate.seg[2]) / 2 : z.pos.x;
        const dz = gate?.alive ? (gate.seg[1] + gate.seg[3]) / 2 : z.pos.z;
        const p = rt.player.u.pos;
        let pressing = false;
        for (const b of o.attackers) {
          if (b.aliveNominal() <= 0 || b.real?.routed || b.real?.order === 'flee' || b.light?.army.rout || b.cmd.id === 'hold') continue;
          if (b.real?.units.some((u) => u.alive && !u.fleeing && !u.woundOut &&
              Math.hypot(u.pos.x - x, u.pos.z - dz) < 12) && Math.hypot(p.x - x, p.z - dz) < 24) { pressing = true; break; }
        }
        const damaged = gate?.alive && z.lastGateHp !== undefined && gate.hp < z.lastGateHp;
        z.lastGateHp = gate?.hp;
        z.pressT = pressing && !damaged ? z.pressT + span : 0;
        if (gate?.alive && pressing && z.pressT >= 45 && rt.t >= (z.helpAt || 0)) {
          z.helpAt = rt.t + 8;
          rt.army.damage(gate, gate.maxHp * 0.2 / Math.max(0.01, 1 - (gate.armor || 0)), null);
          z.lastGateHp = gate.hp;
          rt.say('組頭', `${z.name}の木戸がつかえた。打ち手を助け、口を開けよ`, 3);
        }
        // 近い郭は共通の備えと同じ半秒、離れた郭は一秒ごとに数える。
        z.scanT += span;
        if (z.scanT < (Math.hypot(p.x - z.pos.x, p.z - z.pos.z) < 100 ? 0.5 : 1)) continue;
        const zoneSpan = z.scanT; z.scanT = 0;
        let friends = 0, enemies = 0;
        for (const u of rt.army.units) {
          if (!u.alive || u.isStruct || u.fleeing || u.woundOut || !z.test(u.pos.x, u.pos.z)) continue;
          if (u.team === 0) friends++; else if (u.team === 1) enemies++;
        }
        for (const b of o.defenders) {
          if (b.real?.routed || b.real?.order === 'flee' || b.light?.army.rout) continue;
          if (z.test(b.pos.x, b.pos.z)) enemies += Math.max(0, b.aliveNominal() - b.realCount());
        }
        z.friends = friends; z.enemies = enemies;
        z.state = friends && enemies ? 'contested' : z.owner;
        const ready = (!z.before || byId[z.before].owner === 'friend') && (!z.gate || (gate && !gate.alive));
        if (z.owner === 'friend') {
          z.retakeT = enemies > friends ? (z.retakeT || 0) + zoneSpan : 0;
          if (z.retakeT >= z.hold) { z.owner = z.state = 'enemy'; z.holdT = 0; z.retakeT = 0; }
        }
        const main = z.id === 'kannon' || z.id.startsWith('kinome_');
        if (!ready || enemies || friends < z.initialNeed || main && !z.test(p.x, p.z)) { z.holdT = 0; continue; }
        if (z.owner === 'friend') continue;
        z.holdT += zoneSpan;
        if (z.holdT < z.hold) continue;
        z.owner = z.state = 'friend';
        o.onFall(z.id);
        if (z.honmaru) o.onHonmaru();
        if (rt.flags.ending) break;
      }
    },
  };
}
