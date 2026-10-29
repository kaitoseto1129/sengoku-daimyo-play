// 遮蔽の案内だけを選ぶ。兵・弾・被害の判定は変えない。
import { groundAt } from './floors.js';
import { localClear } from './army_local_way.js';
import { projectileCover } from './projectile_cover.js';

export function clearFoot(rt, q) {
  if (!rt.world.walkable(q.x, q.z, q.y)) return false;
  for (const w of rt.army.solids) {
    if ((w.struct && (!w.struct.alive || w.struct.opened)) ||
        q.x < w.x0 - .55 || q.x > w.x1 + .55 || q.z < w.z0 - .55 || q.z > w.z1 + .55 ||
        (w.yTop != null && q.y >= w.yTop - .05) || (w.yBot != null && q.y + (w.bodyOverlap ? 1.7 : 0) < w.yBot)) continue;
    if (w.k === 'r') {
      const dx = q.x - w.x, dz = q.z - w.z, x = dx * w.c - dz * w.s, z = dx * w.s + dz * w.c;
      if (Math.hypot(x - Math.max(-w.hw, Math.min(w.hw, x)), z - Math.max(-w.hd, Math.min(w.hd, z))) < .55) return false;
    } else if (w.k === 'c') {
      if (Math.hypot(q.x - w.x, q.z - w.z) < w.r + .55) return false;
    } else {
      const dx = w.bx - w.ax, dz = w.bz - w.az;
      const t = Math.max(0, Math.min(1, ((q.x - w.ax) * dx + (q.z - w.az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(q.x - w.ax - dx * t, q.z - w.az - dz * t) < (w.r || 0) + .55) return false;
    }
  }
  const hot = rt.flags.heatZone;
  if (hot && rt.t >= rt.flags.heatAt && q.x > hot.x0 - 1 && q.x < hot.x1 + 1 && q.z > hot.z0 - 1 && q.z < hot.z1 + 1) return false;
  for (const f of rt.world.fires) {
    if (f.torch || f.lit === false || (f.base != null && f.base > q.y + 2)) continue;
    if (Math.hypot(q.x - f.x, q.z - f.z) < (f.size || 1) + 1.5) return false;
  }
  return true;
}

function sheltered(rt, g, sources) {
  for (const u of sources) {
    const ranged = !u.sidearm && (u.type === 'gun' || u.type === 'bow') || u.atk?.bow || u.atk?.ranged;
    if (!ranged) continue;
    // 弾と同じ当たりで、胸と頭へ向かう射線を確かめる。破れた襖は遮蔽にならない。
    const q = g.probe.pos;
    for (const height of [1.2, 1.7]) {
      const hit = projectileCover(rt.army, u.pos.x, u.pos.y + 1.46, u.pos.z, q.x, q.y + height, q.z, u);
      if (hit.q > 1 || hit.object?.tatake) return false;
      // 戦ごとに、遠い城壁で遮られただけの野原を隠れ場所から外せる。
      if (rt.def.coverHitAllowed && !rt.def.coverHitAllowed(rt, hit, q, u)) return false;
    }
  }
  return true;
}

function usable(rt, g, sources, q) {
  const p = rt.player.u.pos;
  if (Math.abs(q.y - p.y) > .6 || !clearFoot(rt, q) || !localClear(rt.army, p, q)) return false;
  if (!sheltered(rt, g, sources)) return false;
  if (rt.army.nearestEnemy(g.probe, 4, (u) => !rt.army.wallBetween(q, -1, u.pos))) return false;
  const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / .4));
  for (let i = 1; i <= n; i++) {
    const a = g.step;
    a.x = p.x + (q.x - p.x) * i / n; a.z = p.z + (q.z - p.z) * i / n;
    a.y = groundAt(rt.world, a.x, a.z, p.y);
    if (!clearFoot(rt, a)) return false;
  }
  return true;
}

export function coverGuide(rt, sources) {
  const p = rt.player.u;
  const g = rt.coverGuide || (rt.coverGuide = { at: -1, valid: false,
    pos: { x: 0, y: 0, z: 0 }, mark: { x: 0, y: 0, z: 0 }, label: '物かげへ', step: { x: 0, y: 0, z: 0 },
    probe: { pos: { x: 0, y: 0, z: 0 }, team: p.team, naka: p.naka } });
  // 射手がいなければ、根拠のない隠れ場所を案内しない。
  const shooter = sources.find(u => u.alive && (!u.sidearm && (u.type === 'gun' || u.type === 'bow') || u.atk?.bow || u.atk?.ranged));
  if (!shooter) { g.valid = false; return null; }
  // 半秒ごとに再確認し、まだ使える場所は動かさない。
  if (rt.t < g.at) return g.valid ? g.pos : null;
  g.at = rt.t + .5; g.probe.naka = p.naka;
  const q = g.probe.pos;
  if (g.valid) {
    Object.assign(q, g.pos);
    if (Math.hypot(q.x - p.pos.x, q.z - p.pos.z) <= 10 && usable(rt, g, sources, q)) return g.pos;
  }
  g.valid = false;
  // 柱の根元から射手と反対側へ。実際の射線と通れる道が保たれる場所だけ使う。
  for (const w of rt.army.solids) {
    if (w.k !== 'c' || w.r > .4 || Math.hypot(w.x - p.pos.x, w.z - p.pos.z) > 9) continue;
    const dx = w.x - shooter.pos.x, dz = w.z - shooter.pos.z, len = Math.hypot(dx, dz) || 1;
    q.x = w.x + dx / len * (w.r + .65); q.z = w.z + dz / len * (w.r + .65);
    q.y = groundAt(rt.world, q.x, q.z, p.pos.y);
    if (!usable(rt, g, sources, q)) continue;
    Object.assign(g.pos, q); g.mark.x = w.x; g.mark.z = w.z; g.mark.y = q.y;
    g.label = rt.def.coverGuideLabel || (rt.def.fenceUseOK ? 'しるしまで さがろう' : '柱のうしろへ'); g.valid = true; return g.pos;
  }
  for (let r = 1.5; r <= 9; r += 1.5) for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    q.x = p.pos.x + Math.sin(a) * r; q.z = p.pos.z + Math.cos(a) * r;
    q.y = groundAt(rt.world, q.x, q.z, p.pos.y);
    if (!usable(rt, g, sources, q)) continue;
    Object.assign(g.pos, q); Object.assign(g.mark, q); g.label = rt.def.coverGuideLabel || (rt.def.fenceUseOK ? 'しるしまで さがろう' : '物かげへ'); g.valid = true; return g.pos;
  }
  return null;
}
