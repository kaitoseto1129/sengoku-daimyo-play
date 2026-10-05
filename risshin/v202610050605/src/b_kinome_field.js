// 木ノ芽峠だけの制圧。通常は実兵と控えで判定し、長引いた持ち場は味方の後詰に任せる。
export function makeKinomeZones(rt, o) {
  const zones = o.zones, byId = {};
  for (const z of zones) {
    byId[z.id] = z; z.owner = 'enemy'; z.state = 'enemy'; z.holdT = 0;
    z.initialNeed = z.need; z.scanT = 0; z.friends = 0; z.enemies = 0;
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
        const age = rt.t - z.startedAt;
        const gate = z.gate && rt.army.structs.find((s) => s.name === z.gate);
        // 打ち手が法面や守兵に阻まれても、後詰が木戸を破る。壊す時は共通の音・当たりの処理を通す。
        if (gate?.alive && age >= 45) {
          rt.army.damage(gate, gate.hp / Math.max(0.01, 1 - (gate.armor || 0)), null);
          rt.say('組頭', '後詰が木戸を破った！　味方と中へ続け', 3);
        }
        if (!z.assisted && age >= (z.max ?? 90) && (z.owner !== 'friend' || z.honmaru)) {
          z.assisted = true;
          o.onAssist(z);
          z.owner = z.state = 'friend'; z.holdT = z.hold; z.retakeT = 0;
          o.onFall(z.id);
          if (z.honmaru) o.onHonmaru();
          if (rt.flags.ending) break;
        }
        // 後詰に任せた持ち場は再び待ち直さない。主郭への本人の到着待ちにも上限を付ける。
        if (z.assisted) continue;
        // 近い郭は共通の備えと同じ半秒、離れた郭は一秒ごとに数える。
        z.scanT += span;
        const p = rt.player.u.pos;
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
        if (!ready || enemies || friends < z.initialNeed) { z.holdT = 0; continue; }
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
