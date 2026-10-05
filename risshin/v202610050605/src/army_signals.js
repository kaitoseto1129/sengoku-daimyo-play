// 下知が隊に届いてから、旗持ち・組頭の合図を兵が聞き分けるまでの間。
// 合図の打ち方はこの遊びの約束。家ごとの史料上の符号とは分けて扱う。
const KIND = { attack: 'susume', assault: 'susume', move: 'susume', path: 'susume', follow: 'susume', hold: 'tomare', yari: 'tomare', retreat: 'hike' };

export function signalWait(army, g, u) {
  if (!(g.signalUntil > 0) || g.routed || u?.fleeing || u?.isPlayer) return false;
  return army.time < (g.signalUntil || 0) + (u ? (u.slot % 3) * 0.09 : 0);
}

export function groupSignal(army, g) {
  const old = g.signalOrder;
  const dest = g.dest;
  let pathRevision = 0;
  if (g.path) for (const p of g.path) { pathRevision = (pathRevision * 31 + Math.round(p[0] * 100)) | 0; pathRevision = (pathRevision * 31 + Math.round(p[1] * 100)) | 0; }
  g.pathRevision = pathRevision;
  const tracking = g.order === 'follow' || g.isRunner || !!g.focus;
  const changed = g.signalPathRevision !== pathRevision || g.signalDest !== !!dest || dest && !tracking && (Math.abs(dest.x - g.signalDestX) > 3 || Math.abs(dest.z - g.signalDestZ) > 3) ||
    g.signalPath !== g.path || g.signalFocus !== g.focus || g.signalAssault !== g.assault;
  g.signalOrder = g.order;
  if (old !== g.order || changed) {
    g.signalDest = !!dest; g.signalDestX = dest?.x; g.signalDestZ = dest?.z;
    g.signalPathRevision = pathRevision; g.signalPath = g.path; g.signalFocus = g.focus; g.signalAssault = g.assault;
  }
  if (g.routed || g.civ || g.isRunner || !KIND[g.order]) { g.signalUntil = 0; return; }
  // 最初から守る隊は、戦の始まりに合図を重ねない。
  if (old === undefined && (g.order === 'hold' || g.order === 'yari')) return;
  if (old === g.order && !changed) return;
  g.signalSerial = (g.signalSerial || 0) + 1;
  if (!(army.time < (g.signalUntil || 0))) g.signalFrom = old || 'hold';
  const kind = KIND[g.order];
  const at = g.signalAt || (g.signalAt = { x: 0, z: 0 });
  const leader = g.leader;
  let from = leader?.alive && !leader.fleeing && !leader.woundOut && !leader.rearWound && !leader.downed && !(leader.pinT > army.time) && !(leader.stagger > 0) ? leader : null;
  if (!from) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed && !(u.pinT > army.time) && !(u.stagger > 0) && (u.stdHeld || u.banner)) { from = u; break; }
  at.x = from ? from.pos.x : g.anchor.x; at.z = from ? from.pos.z : g.anchor.z;
  let far = 0;
  for (const u of g.units) if (u.alive && !u.isPlayer) far = Math.max(far, Math.hypot(u.pos.x - at.x, u.pos.z - at.z));
  // 音の到着と聞き分け。士気が低い隊は組頭の声の継ぎも遅れる。
  const pending = army.time < (g.signalUntil || 0);
  if (!pending || old !== g.order) g.signalUntil = army.time + far / 343 + (kind === 'hike' ? 0.8 : kind === 'tomare' ? 0.65 : 0.95) + (g.morale < 45 ? 0.25 : 0);
  g.signalKind = kind; g.signalStart = army.time;
  for (const u of g.units) if (u.alive && !u.isPlayer) u.aiT = Math.min(u.aiT, 0.08);
  if (army.hooks.onSignal && army.hooks.onSignal(g, kind, at) === false) { g.signalUntil = 0; g.signalStart = -99; }
}
