// 馬の怯えと進路の拒み。周囲は四分の一秒ごとに調べ、入れ物を毎コマ作らない。
export function horseGunshot(army, pos) {
  for (const u of army.units) {
    const H = (u.mounted || u.isPlayer) && u.alive && u.horse?.userData.horse;
    if (!H) continue;
    const d = Math.hypot(u.pos.x - pos.x, u.pos.z - pos.z);
    if (d < 35) H.shock = Math.min(2, (H.shock || 0) + (1 - d / 35) * 0.8);
  }
  for (const o of army.looseHorses || []) {
    const p = o.h.position;
    if (Math.hypot(p.x - pos.x, p.z - pos.z) < 35 && !(o.held > 0)) {
      o.kept = false; o.shyT = 4; o.shyDir = Math.atan2(p.x - pos.x, p.z - pos.z);
      if (o.h.userData.horse) o.h.userData.horse.spook = 1;
    }
  }
}

export function horseStartle(army, u, strength, player = null) {
  const H = u.horse?.userData.horse, now = player ? player.rt.t : army.time;
  if (!H || H.dead || H.startleAt > now) return;
  H.startleAt = now + 1.8;
  H.fear = Math.min(2, (H.fear || 0) + strength);
  H.rear = Math.min(1, 0.5 + strength * 0.4); H.spook = 1;
  u.charging = false; u.chargeCd = army.time + 6;
  u.mv.x = u.mv.z = u.vel.x = u.vel.z = 0;
  u.atk = null; u.swing = null; u.pAtk = null;
  army.play('neigh', u.pos, 0.8);
  if (player) {
    player.hspd = 0; player.horseStopUntil = now + 1.4;
    player.pending = null; player.buffer = 0; player.chargeT = 0;
    // 慣れた乗馬は銃声だけでは主を落とさない。開戦の間（味方の斉射）は竿立ちまで。落ちるのは敵が間近で、ひどく怯えた時だけ
    const rt = player.rt, early = rt.t < Math.max(45, rt.def.openingSafe || 0);
    const foeNear = !early && army.nearestEnemy && army.nearestEnemy(player.u, 10);
    if (H.fear > 1.4 && foeNear && Math.random() < 0.25) player.fall();
    else if (!(player.horseFearWarnAt > now)) {
      player.horseFearWarnAt = now + 30; player.rt.hud.flash(H.refuseReason ? `馬が${H.refuseReason}を避けている。横か後ろへ退く` : '馬が音に怯えた。危ない所から離れよ', 'dim');
    }
  } else {
    u.stagger = Math.max(u.stagger || 0, 1.4);
    if (!u.invuln && H.fear > 1.1 && Math.random() < 0.3) army.pullOff(u, null);
  }
}

export function horseThreatTick(army, u, dt, player = null) {
  const H = u.mounted && u.horse?.userData.horse;
  if (!H || H.dead) return false;
  const now = player ? player.rt.t : army.time;
  H.fear = Math.max(0, (H.fear || 0) - dt * 0.08);
  if (H.shock > 0) { const shock = H.shock; H.shock = 0; horseStartle(army, u, shock, player); }
  if (!u.mounted) return false;
  if (H.senseAt > now) return H.refuseUntil > now;
  H.senseAt = now + 0.25;
  const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
  const reach = Math.min(7, 3.8 + Math.hypot(u.vel.x, u.vel.z) * 0.3);
  let danger = false, strength = 0.35; H.refuseReason = '';
  for (const s of army.structs) {
    if (!s.alive || !s.seg || s.opened) continue;
    const a = s.seg, dx = a[2] - a[0], dz = a[3] - a[1], len = dx * dx + dz * dz;
    if (!len) continue;
    const k = Math.max(0, Math.min(1, ((u.pos.x - a[0]) * dx + (u.pos.z - a[1]) * dz) / len));
    const x = a[0] + k * dx - u.pos.x, z = a[1] + k * dz - u.pos.z;
    const forward = x * fx + z * fz;
    // 自分の馬は、壁沿いの並足や向き直りで怯え続けない。敵の柵へ正面から駆け込む時だけ拒む。
    if (player && (s.team === u.team || Math.hypot(u.vel.x, u.vel.z) <= 7 || Math.abs(fx * dz - fz * dx) / Math.sqrt(len) < 0.55)) continue;
    if (forward > 0 && forward < (player ? 2.2 : reach) && Math.abs(x * fz - z * fx) < (player ? 0.75 : 1.3)) { danger = true; H.refuseReason = '柵や壁'; break; }
  }
  if (!danger) for (const o of army.units) {
    const g = o.group;
    if (!o.alive || o.mounted || o.team === u.team || o.fleeing || o.stagger > 0.3 || !g || g.routed || g.formation !== 'yari' || (g.order !== 'yari' && g.order !== 'hold') || (o.wpnKind || o.lookWeapon) !== 'spear') continue;
    const x = o.pos.x - u.pos.x, z = o.pos.z - u.pos.z, d = Math.hypot(x, z);
    if (d > reach || Math.abs(o.pos.y - u.pos.y) > 2 || x * fx + z * fz <= 0 || Math.abs(x * fz - z * fx) > 1.8) continue;
    if ((-x * Math.sin(o.heading) - z * Math.cos(o.heading)) / (d || 1) > 0.5) { danger = true; H.refuseReason = '槍の列'; strength = 0.6; break; }
  }
  for (const f of army.world.fires || []) {
    if (f.lit === false || Math.abs((f.base || 0) - u.pos.y) > 5) continue;
    const x = f.x - u.pos.x, z = f.z - u.pos.z, d = Math.hypot(x, z);
    if (d < 1.8 + (f.size || 1) && (d < 2 || x * fx + z * fz > 0)) { danger = true; H.refuseReason = '火'; strength = 0.8; break; }
  }
  H.refuseUntil = danger ? now + 0.3 : 0;
  if (danger) horseStartle(army, u, strength, player);
  return danger;
}

// 疲れ切った馬は駆けられない。休んでからでなければ駆け足を再開しない。
export function horseExhausted(H, fatigue) {
  if (!H) return fatigue >= 0.85;
  if (fatigue >= 0.85) H.exhausted = true;
  else if (fatigue < 0.55) H.exhausted = false;
  return !!H.exhausted;
}

// 空馬も柵・急斜面・深い水を抜けない。移動線が柵をまたいだ時も止める。
export function horseLooseMove(army, o, dt) {
  if (Math.abs(o.spd) < 0.01) return;
  const p = o.h.position, ox = p.x, oz = p.z;
  const x = ox + Math.sin(o.heading) * o.spd * dt, z = oz + Math.cos(o.heading) * o.spd * dt;
  let blocked = false;
  for (const s of army.structs) {
    if (!s.alive || !s.seg || s.opened) continue;
    const a = s.seg, dx = a[2] - a[0], dz = a[3] - a[1], len = dx * dx + dz * dz;
    if (!len) continue;
    const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len));
    const d = Math.hypot(x - a[0] - k * dx, z - a[1] - k * dz);
    const side0 = (ox - a[0]) * dz - (oz - a[1]) * dx, side1 = (x - a[0]) * dz - (z - a[1]) * dx;
    const mx = x - ox, mz = z - oz;
    const end0 = (a[0] - ox) * mz - (a[1] - oz) * mx, end1 = (a[2] - ox) * mz - (a[3] - oz) * mx;
    if (d < 0.8 || (side0 * side1 < 0 && end0 * end1 <= 0)) { blocked = true; break; }
  }
  const y = army.world.heightAt(x, z);
  if (Math.abs(y - p.y) > 0.35 + Math.hypot(x - ox, z - oz) * 0.65 || (army.world.waterDepthAt && army.world.waterDepthAt(x, z) > 0.8)) blocked = true;
  // 建物・陣幕にも馬の幅を残す。短く区切って薄い壁を飛び越さない。
  const steps = Math.max(1, Math.ceil(Math.hypot(x - ox, z - oz) / 0.4));
  for (let i = 1; i <= steps && !blocked; i++) {
    const px = ox + (x - ox) * i / steps, pz = oz + (z - oz) * i / steps;
    for (const s of army.structs) {
      if (s.alive && !s.opened && s.solidR && Math.hypot(px - s.x, pz - s.z) < s.solidR) { blocked = true; break; }
    }
    if (blocked) break;
    for (const w of army.solids || []) {
      if (w.struct && (!w.struct.alive || w.struct.opened)) continue;
      if (w.yTop != null && p.y >= w.yTop - 0.05 || w.yBot != null && p.y + (w.bodyOverlap ? 2.4 : 0) < w.yBot) continue;
      if (px < w.x0 - 0.8 || px > w.x1 + 0.8 || pz < w.z0 - 0.8 || pz > w.z1 + 0.8) continue;
      let d;
      if (w.k === 'r') {
        const dx = px - w.x, dz = pz - w.z, lx = dx * w.c - dz * w.s, lz = dx * w.s + dz * w.c;
        d = Math.hypot(Math.max(0, Math.abs(lx) - w.hw), Math.max(0, Math.abs(lz) - w.hd));
        blocked = d < 0.8;
      } else if (w.k === 'c') blocked = Math.hypot(px - w.x, pz - w.z) < w.r + 0.8;
      else {
        const dx = w.bx - w.ax, dz = w.bz - w.az, len = dx * dx + dz * dz || 1;
        const k = Math.max(0, Math.min(1, ((px - w.ax) * dx + (pz - w.az) * dz) / len));
        blocked = Math.hypot(px - w.ax - k * dx, pz - w.az - k * dz) < w.r + 0.8;
      }
      if (blocked) break;
    }
  }
  if (blocked) {
    o.spd = 0; o.heading += 1.3;
    // 驚いて逃げる向きも替え、次のコマで壁へ向き直り続けない。
    if (o.shyT > 0) o.shyDir = o.heading;
    if (o.mode === 'come') o.mode = 'wait';
  }
  else { p.x = x; p.z = z; p.y = y; }
}

export function horseLooseDanger(army, h, now) {
  const H = h?.userData.horse;
  if (!H || H.dead) return false;
  let danger = H.shock > 0;
  H.shock = 0;
  if (!(H.looseSenseAt > now)) {
    H.looseSenseAt = now + 0.25; H.looseFire = false;
    for (const f of army.world.fires || []) {
      if (f.lit !== false && Math.abs((f.base || 0) - h.position.y) < 5 && Math.hypot(f.x - h.position.x, f.z - h.position.z) < 2 + (f.size || 1)) { H.looseFire = true; break; }
    }
  }
  danger = danger || H.looseFire;
  if (danger) H.spook = 1;
  return danger;
}
