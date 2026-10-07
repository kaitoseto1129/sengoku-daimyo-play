// 四人以上が本人へ迫る時は、前の二人の後ろで順番を待つ。
// 傷の重さは変えず、味方が横から入れる場所と退き口を残す。
export function playerPressureTick(army) {
  if (army._playerPressureAt > army.time) return;
  army._playerPressureAt = army.time + 0.25;
  const foes = army._playerPressureFoes || (army._playerPressureFoes = []);
  foes.length = 0;
  const p = army.playerUnit;
  for (const o of army.units) {
    o.playerQueue = false;
    if (!p?.alive || army.duel || !o.alive || o.team === p.team || o.isStruct || o.noTarget ||
        o.fleeing || o.group?.routed || o.group?.hidden || o.woundOut || o.rearWound || o.downed ||
        o.pinT > army.time || o.climb || o.perch || o.type === 'dummy' || o.type === 'porter' ||
        !o.sidearm && (o.type === 'gun' || o.type === 'bow')) continue;
    const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
    if (d > 8 || Math.abs(o.pos.y - p.pos.y) > 1.8 ||
        !(o.target === p || o.atk?.target === p || o.swing?.target === p) ||
        army.wallBetween(o.pos, -1, p.pos, (o.wpnKind || o.lookWeapon) === 'spear')) continue;
    foes.push(o);
  }
  if (foes.length < 4) return;
  // 振り始めた二人を優先し、遠い後続が先に枠を取らないようにする。
  let first = null, second = null, best = Infinity, next = Infinity;
  for (const o of foes) {
    const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
    const busy = o.atk?.target === p || o.swing?.target === p && !o.swing.done;
    const score = d - (busy && d < 4.5 ? 10 : o.playerMeleeUntil > army.time && d < 4.5 ? 5 : 0);
    if (score < best) { second = first; next = best; first = o; best = score; }
    else if (score < next) { second = o; next = score; }
  }
  for (const o of foes) {
    if (o === first || o === second) continue;
    o.playerQueue = true;
    o.playerQueueFront = Math.hypot(o.pos.x - first.pos.x, o.pos.z - first.pos.z) <
      Math.hypot(o.pos.x - second.pos.x, o.pos.z - second.pos.z) ? first : second;
    // 後続の支度も止める。飛んでいる矢玉と味方への打ち込みは止めない。
    if (o.atk?.target === p && !o.atk.ranged && !o.atk.bow) o.atk = null;
    if (o.swing?.target === p) o.swing = null;
    if (o.bind?.o === p) { if (p.bind?.o === o) p.bind = null; o.bind = null; }
    o.playerMeleeUntil = 0;
    o.charging = false;
  }
  // 目前の打ち手へ、手の空いた徒歩の味方二人までを呼ぶ。
  // 退却・行軍・射撃・筋書きの持ち場は守り、既に打ち合う者は取り上げない。
  let helpers = 0;
  for (const o of army.units) {
    if (helpers >= 2) break;
    if (o === p || !o.alive || o.team !== p.team || o.isPlayer || o.isStruct || o.noTarget ||
        o.fleeing || o.group?.routed || o.group?.hidden || o.mounted || o.woundOut || o.rearWound ||
        o.downed || o.dropped || o.pinT > army.time || o.stagger > 0 || o.confused > 0 ||
        o.atk || o.swing || o.bind || o.dragging || o.climb || o.perch || o.stdHeld || o.banner ||
        o.type === 'dummy' || o.type === 'porter' || !o.sidearm && (o.type === 'gun' || o.type === 'bow') ||
        !o.group || o.group.interiorHold || o.group.order !== 'attack' && o.group.order !== 'follow' ||
        o.target?.alive && army.distTo(o, o.target) < 4) continue;
    const t = helpers === 0 ? first : second;
    if (Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) > 9 ||
        Math.abs(o.pos.y - t.pos.y) > 1.8 || army.wallBetween(o.pos, -1, t.pos)) continue;
    o.target = t; o.aiT = Math.max(o.aiT || 0, 0.5);
    o.playerHelpUntil = army.time + 1; o.playerHelpSide = helpers === 0 ? 1 : -1; helpers++;
  }
}
