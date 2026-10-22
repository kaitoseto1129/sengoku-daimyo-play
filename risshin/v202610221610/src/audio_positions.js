// 効果音・合成の肉声・録音の声で、位置を持つ音の十二席を共用する。
export const POSITION_CAP = 12;
const seats = Array.from({ length: POSITION_CAP }, () => ({ owner: null, priority: 0, distance: 0, until: 0, stop: null }));
let peak = 0, dropped = 0;
export function takePosition(owner, priority, distance, seconds, stop) {
  const now = performance.now() / 1000;
  let seat = null, free = null, weak = null, live = 0;
  for (const s of seats) {
    if (s.owner === owner) seat = s;
    if (s.until <= now) { if (!free) free = s; continue; }
    live++;
    if (s.priority > priority || (s.priority === priority && s.distance <= distance)) continue;
    if (!weak || s.priority < weak.priority || (s.priority === weak.priority && s.distance > weak.distance)) weak = s;
  }
  if (!seat) seat = free || weak;
  if (!seat) { dropped++; return false; }
  // 音の時計が一時停止中でも、前の持ち主を止めてから席を渡す。
  const added = seat.until <= now ? 1 : 0;
  if (seat.owner && seat.owner !== owner) seat.stop();
  seat.owner = owner; seat.priority = priority; seat.distance = distance;
  seat.until = now + seconds; seat.stop = stop;
  peak = Math.max(peak, live + added);
  return true;
}
export function releasePosition(owner) {
  for (const s of seats) if (s.owner === owner) { s.until = 0; s.owner = null; s.stop = null; }
}
export function positionStats() {
  const now = performance.now() / 1000;
  let live = 0;
  for (const s of seats) if (s.until > now) live++;
  return { live, peak, dropped, cap: POSITION_CAP };
}
