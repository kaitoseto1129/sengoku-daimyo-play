import { ODA_LINE } from './state.js';

// 戦の難しさの段（0〜1）。無料の3戦は0、稲葉山から上がり、設楽原のあと（終盤）で1。
let _ti = null;
export function battleTier(key) {
  if (!_ti) { _ti = {}; ODA_LINE.filter((b) => !b.pre).forEach((b, i) => { _ti[b.id] = i; }); for (const b of ODA_LINE) if (b.pre) _ti[b.id] = 0; }
  const i = _ti[key];
  if (i == null) return 0.3;
  if (i < 3) return 0;
  return Math.min(1, (i - 2) / 26);
}

// 四人以上が本人へ迫る時は、前の二人の後ろで順番を待つ。
// 傷の重さは変えず、味方が横から入れる場所と退き口を残す。
export function playerPressureTick(army) {
  if (army._playerPressureAt > army.time) return;
  army._playerPressureAt = army.time + 0.25;
  if (army.tier == null) army.tier = battleTier(army.world?.def?.battleKey);
  // def.playerAtkMax：乱戦の戦（稲生）は四方から同時に打たせる数を戦ごとに決める（kaito 10/29 夜「乱戦激戦」）
  army.playerAtkMax = army.world?.def?.playerAtkMax ?? (army.tier >= 0.75 ? 3 : 2);
  army.playerReach = 13 + 5 * army.tier;
  army.playerPullMax = 2 + Math.round(6 * Math.pow(army.tier, 1.5));
  let pn = 0;
  for (const o of army.units) if (o.pullUntil > army.time && o.alive) pn++;
  army.playerPullN = pn;
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
  if (!foes.length) return;
  // 振り始めた二人を優先し、遠い後続が先に枠を取らないようにする。
  let first = null, second = null, best = Infinity, next = Infinity;
  for (const o of foes) {
    const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
    const busy = o.atk?.target === p || o.swing?.target === p && !o.swing.done;
    const score = d - (busy && d < 4.5 ? 10 : o.playerMeleeUntil > army.time && d < 4.5 ? 5 : 0);
    if (score < best) { second = first; next = best; first = o; best = score; }
    else if (score < next) { second = o; next = score; }
  }
  // 退き口：一番近い味方の向き（味方がいなければ目前の敵の逆＝来た道）。この向きの90°には後続を入れない。
  let safeA = null, rank = 0;
  if (foes.length >= 4) {
    let bd = 60 * 60;
    for (const o of army.units) {
      if (o === p || !o.alive || o.team !== p.team || o.isStruct || o.noTarget || o.fleeing || o.downed ||
          o.type === 'dummy' || o.type === 'porter') continue;
      const ax = o.pos.x - p.pos.x, az = o.pos.z - p.pos.z, d2 = ax * ax + az * az;
      if (d2 < bd && d2 > 1) { bd = d2; safeA = Math.atan2(ax, az); }
    }
    if (safeA == null) safeA = Math.atan2(p.pos.x - first.pos.x, p.pos.z - first.pos.z);
    foes.sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z));
  }
  army.playerSafeA = safeA;
  // 打ち手が三人以上の戦は、近い者から playerAtkMax 人を待たせない（四方から同時に寄る）
  const N = army.playerAtkMax, free = army._playerFree || (army._playerFree = new Set());
  free.clear();
  if (N > 2 && foes.length >= 4) for (let k = 0; k < Math.min(N, foes.length); k++) free.add(foes[k]);
  for (const o of foes) {
    if (foes.length < Math.max(4, N + 2) || o === first || o === second || free.has(o)) continue;
    o.playerQueue = true;
    o.playerQueueFront = Math.hypot(o.pos.x - first.pos.x, o.pos.z - first.pos.z) <
      Math.hypot(o.pos.x - second.pos.x, o.pos.z - second.pos.z) ? first : second;
    // 待つ所：前の打ち手の後ろ2.5m、本人から見て ±60° の扇。6m 内は前の二人と後続四人まで、七人目からは 8m の外。
    const f = o.playerQueueFront;
    const fa = Math.atan2(f.pos.x - p.pos.x, f.pos.z - p.pos.z);
    const off = rank === 0 ? 0 : ((rank + 1) >> 1) * 0.35 * (rank % 2 ? 1 : -1);
    let a = fa + Math.max(-1.05, Math.min(1.05, off));
    let da = Math.atan2(Math.sin(a - safeA), Math.cos(a - safeA));
    if (Math.abs(da) < Math.PI / 4) a = safeA + (da < 0 ? -1 : 1) * Math.PI / 4;
    const fd = Math.hypot(f.pos.x - p.pos.x, f.pos.z - p.pos.z);
    o.playerQueueA = a;
    o.playerQueueR = rank < 4 ? Math.min(5.8, Math.max(4.6, fd + 2.5)) : 8.5 + (rank - 4) % 3 * 0.6;
    rank++;
    // 後続の支度も止める。飛んでいる矢玉と味方への打ち込みは止めない。
    if (o.atk?.target === p && !o.atk.ranged && !o.atk.bow) o.atk = null;
    if (o.swing?.target === p) o.swing = null;
    if (o.bind?.o === p) { if (p.bind?.o === o) p.bind = null; o.bind = null; }
    o.playerMeleeUntil = 0;
    o.charging = false;
  }
  // 目前の打ち手へ、手の空いた徒歩の味方を呼ぶ。深手で退く時は三人まで。
  // 退却・行軍・射撃・筋書きの持ち場は守り、既に打ち合う者は取り上げない。
  const dx = first.pos.x - p.pos.x, dz = first.pos.z - p.pos.z;
  const retreating = p.hp <= p.maxHp * 0.3 &&
    ((p.vel?.x || 0) * dx + (p.vel?.z || 0) * dz < -0.1 || Math.hypot(dx, dz) > 4.5);
  if (foes.length < 4 && !retreating) return;
  // 体力三割以下で 6m 内に味方がいない時は、遠くの味方も呼ぶ（20m 内の四人まで）。
  let lone = false;
  if (retreating && !((army.playerSupport || 0) > 0)) {
    lone = true;
    for (const o of army.units) {
      if (o !== p && o.alive && o.team === p.team && !o.isStruct && !o.noTarget && o.type !== 'dummy' &&
          Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) < 6) { lone = false; break; }
    }
  }
  let helpers = 0;
  for (const o of army.units) {
    if (helpers >= (retreating ? (lone ? 4 : 3) : 2)) break;
    if (o === p || !o.alive || o.team !== p.team || o.isPlayer || o.isStruct || o.noTarget ||
        o.fleeing || o.group?.routed || o.group?.hidden || o.mounted || o.woundOut || o.rearWound ||
        o.downed || o.dropped || o.pinT > army.time || o.stagger > 0 || o.confused > 0 ||
        o.atk || o.swing || o.bind || o.dragging || o.climb || o.perch || o.stdHeld || o.banner ||
        o.type === 'dummy' || o.type === 'porter' || !o.sidearm && (o.type === 'gun' || o.type === 'bow') ||
        !o.group || o.group.interiorHold ||
        o.group.order !== 'attack' && o.group.order !== 'follow' && !(retreating && o.group.order === 'hold') ||
        o.target?.alive && army.distTo(o, o.target) < 4) continue;
    const t = helpers === 1 && second ? second : first;
    if (Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) > (retreating ? (lone ? 20 : 14) : 9) ||
        Math.abs(o.pos.y - t.pos.y) > 1.8 || army.wallBetween(o.pos, -1, t.pos)) continue;
    o.target = t; o.aiT = Math.max(o.aiT || 0, 0.5);
    o.playerHelpUntil = army.time + (retreating ? 2 : 1); o.playerHelpSide = helpers === 0 ? 1 : -1; helpers++;
  }
}

// 当たる瞬間にも三人枠を確かめる。踏み当たりや筋書きの一撃も抜け道にしない。
export function playerMeleeSlot(army, src) {
  const slots = army._playerHitters || (army._playerHitters = [null, null, null]);
  let free = -1;
  for (let i = 0; i < 3; i++) {
    if (slots[i] === src && src.playerHitUntil > army.time) {
      src.playerHitUntil = army.time + 0.9; return true;
    }
    if (!slots[i]?.alive || !(slots[i].playerHitUntil > army.time)) free = i;
  }
  if (free < 0) return false;
  slots[free] = src; src.playerHitUntil = army.time + 0.9;
  return true;
}

// 部位の倍率を掛けた後の実際の傷を記録する。矢玉も近接も二秒で四割まで。
// 六十四枠を使い回し、連打のたびに入れ物を増やさない。
export function playerHitLimit(army, p, amount, src, kind, record = true) {
  if (!(amount > 0) || !src || src.isStruct || src.team === p.team) return amount;
  const times = army._playerHitTimes || (army._playerHitTimes = new Float64Array(64));
  const values = army._playerHitValues || (army._playerHitValues = new Float64Array(64));
  let sum = 0, free = -1;
  for (let i = 0; i < 64; i++) {
    if (values[i] > 0 && army.time - times[i] < 2) sum += values[i];
    else if (free < 0) free = i;
  }
  const cap = kind === 'gun' ? 0.35 : kind === 'arrow' ? 0.25 : src.pos && army.behindOf(p, src) ? 0.3 : 0.35;
  const taken = free < 0 ? 0 : Math.max(0, Math.min(amount, p.maxHp * cap, p.maxHp * (p.hp < p.maxHp * 0.5 ? 0.3 : 0.4) - sum));
  if (record && taken > 0) { times[free] = army.time; values[free] = taken; }
  return taken;
}
