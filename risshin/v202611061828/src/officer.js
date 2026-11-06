// 武将の強さと近習。兵は増やさず、既存の侍・馬廻を使う。
export function officerBroken(u) {
  const g = u.group;
  if (!g) return true;
  let n = 0;
  for (const v of g.units) if (v !== u && v.alive && !v.fleeing && !v.woundOut) n++;
  return g.routed || n <= Math.floor(Math.max(0, g.initial - 1) * 0.25);
}

export function officerSetup(u) {
  if (u.isOfficer || u.isPlayer || u.isSub || u.isTomo || u.type === 'dummy' || !(u.type === 'busho' || (u.name && u.isLord))) return;
  u.isOfficer = true;
  u.maxHp *= 2.4; u.hp = u.maxHp;
  u.dmg *= 1.5;
  u.officerPoint = { x: u.pos.x, z: u.pos.z };
}

export function officerEscort(g) {
  if (g.isPlayerSquad) return;
  for (const chief of g.units) {
    if (!chief.isOfficer || !chief.alive) continue;
    // 名のある武将の旗本の侍（六人まで）は武将のそばを離れない（kaito 11/2 P：乱戦で将だけが残らないように）。侍がいなければ足軽を三人まで
    let n = 0, used = 0;
    for (const v of g.units) if (v.officerGuard === chief && v.alive && !v.isStandard) { n++; used |= 1 << v.officerGuardSlot; }
    const take = (v) => { let s = 0; while (used & (1 << s)) s++; used |= 1 << s; v.officerGuard = chief; v.officerGuardSlot = s; n++; };
    for (const v of g.units) {
      if (n >= (chief.name ? 6 : 3) || !v.alive || v.name || v.officerGuard || (v.type !== 'samurai' && v.type !== 'cavalry')) continue;
      take(v);
    }
    for (const v of g.units) {
      if (n >= 3 || !v.alive || v.name || v.officerGuard || v.type === 'gun' || v.type === 'bow' || v.type === 'porter' || v.type === 'dummy') continue;
      take(v);
    }
  }
}

// 供回りの持ち場：前の三人は従来どおり将の前に横並び、四人目からは将を囲む輪（左右・斜め後ろ・後ろ・斜め前）。
//   旗持ち・馬印持ち（isStandard）は将の後ろ。p は使い回しの入れ物
const RING = [Math.PI / 2, -Math.PI / 2, Math.PI * 0.75, -Math.PI * 0.75, Math.PI, Math.PI / 4, -Math.PI / 4, Math.PI * 0.6, -Math.PI * 0.6, Math.PI * 0.88, -Math.PI * 0.88];
export function guardSpot(g, chief, u, p) {
  const f = g.forward(), slot = u.officerGuardSlot || 0;
  if (u.isStandard || slot < 3) {
    const side = slot - 1, ahead = u.isStandard ? -2.5 : 2.5;
    p.x = chief.pos.x + f.x * ahead + f.z * side * 1.8;
    p.z = chief.pos.z + f.z * ahead - f.x * side * 1.8;
    return p;
  }
  const k = slot - 3, a = RING[k % RING.length], r = (chief.mounted ? 3.1 : 2.3) + Math.floor(k / RING.length) * 1.5;
  const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
  p.x = chief.pos.x + f.x * ca + f.z * sa;
  p.z = chief.pos.z + f.z * ca - f.x * sa;
  return p;
}
// 供回りと将を除いた兵の真ん中。そういう兵がいなければ隊の要（body: false）
const BC = { x: 0, z: 0, body: false };
function bodyCenter(g) {
  let x = 0, z = 0, n = 0;
  for (const v of g.units) if (v.alive && !v.fleeing && !v.officerGuard && !v.isOfficer) { x += v.pos.x; z += v.pos.z; n++; }
  if (n) { BC.x = x / n; BC.z = z / n; BC.body = true; } else { BC.x = g.anchor.x; BC.z = g.anchor.z; BC.body = false; }
  return BC;
}

// 隊の後ろに下がる将の横の並び（真ん中・左・右・その外）
const OFFICER_SIDE = [0, -1, 1, -2, 2];
// 判断の間だけ呼ぶ。行き先の入れ物は作成時の物を使い回す。
export function officerThink(army, u, g) {
  if (g.isPlayerSquad || g.order === 'retreat' || g.routed || u.fleeing || u.woundOut || u.keep) return false;
  // 行軍では主将も近習も下知された持ち場を追う。
  // 隊の重心へ下がる判断を続けると、主将と近習が互いを待ち、列から取り残される。
  if ((g.order === 'path' || g.order === 'move') && (u.isOfficer || u.officerGuard || u.isStandard)) {
    const enemy = u.isStandard ? null : army.nearestEnemy(u, 1.8, (v) => !v.fleeing);
    u.target = enemy; u.watch = null;
    if (!enemy) {
      const slot = g.slotPos(u.slot, g.initial), p = u.officerPoint || u.moralePoint;
      p.x = slot.x; p.z = slot.z;
      u.atk = null; u.moveTo = p;
    }
    return true;
  }
  const chief = u.officerGuard;
  if (chief && chief.alive && chief.group === g && !chief.fleeing && !officerBroken(chief)) {
    // 家臣は殿を必死に守る：殿へ九歩の内に迫った本人（遊び手）には、間に割って入って斬りかかる（十八の3・BZ）
    const pl = army.playerUnit;
    const rush = !u.isStandard && pl && pl.alive && pl.team !== u.team && !pl.noTarget && Math.hypot(pl.pos.x - chief.pos.x, pl.pos.z - chief.pos.z) < 9 &&
      Math.hypot(pl.pos.x - u.pos.x, pl.pos.z - u.pos.z) < 12 && !army.duel ? pl : null;
    const enemy = rush || (u.isStandard ? null : army.nearestEnemy(u, 5, (v) => !v.fleeing && Math.hypot(v.pos.x - chief.pos.x, v.pos.z - chief.pos.z) < 7));
    u.target = enemy; u.watch = null;
    if (!enemy) u.moveTo = guardSpot(g, chief, u, u.moralePoint);
    return true;
  }
  // 馬印持ちは、主将が倒れても竿を武器にして斬り合わない。崩れた時の退却は通常の仕組みに任せる。
  if (u.isStandard) { u.target = null; u.watch = null; u.moveTo = null; return true; }
  if (!u.isOfficer || u.isTaisho) return false;
  // 供回りを失った敵の名のある将（kaito 11/2 Q）：自分から足軽へ斬りかからず、持ち場の奥へ退いて追い詰められるのを待つ。
  //   退く先は持ち場から六歩まで（馬でも逃げ切らない）。間近（二歩）へ追い詰められた時だけ刀を振るう
  if (officerBroken(u)) {
    const pl = army.playerUnit;
    if (!u.name || u.type !== 'busho' || !pl || u.team === pl.team || u.allyFight) return false;
    const close = army.nearestEnemy(u, 2.1, (v) => !v.fleeing);
    u.watch = null; u.target = close;
    if (close) return true;
    const foe = army.nearestEnemy(u, 10, (v) => !v.fleeing && !v.isStruct);
    const home = u.lordHome || (u.lordHome = { x: u.pos.x, z: u.pos.z }), p = u.officerPoint;
    u.atk = null;
    if (!foe) { p.x = home.x; p.z = home.z; u.moveTo = Math.hypot(u.pos.x - home.x, u.pos.z - home.z) > 1.5 ? p : null; return true; }
    const ax = home.x - foe.pos.x, az = home.z - foe.pos.z, ad = Math.hypot(ax, az) || 1;
    const lim = (army.world.def.moveLim || 176) - 1;
    p.x = Math.max(-lim, Math.min(lim, home.x + ax / ad * 6)); p.z = Math.max(-lim, Math.min(lim, home.z + az / ad * 6));
    if (army.wallBetween(u.pos, -1, p)) { p.x = home.x; p.z = home.z; }
    u.moveTo = p;
    if (!(u.cheerT > army.time)) { u.cheerT = army.time + 3; u.cheer = 1; }
    return true;
  }
  // 討たれた旗本の代わりに、隊の残る侍を将のそばへ呼ぶ（四秒に一度）
  if (u.name && !(u.escortT > army.time)) { u.escortT = army.time + 4; officerEscort(g); }
  // 間合いの内の相手には、深手でも下がる途中でも必ず打ち返す（馬上は槍の長さの分だけ広く。kaito 11/2 T）
  const reachR = Math.max(2.3, (u.reach || 2) + (u.mounted ? 1.8 : 1));
  const enemy = army.nearestEnemy(u, reachR, (v) => !v.fleeing);
  u.watch = null; u.target = enemy;
  if (enemy) return true;
  // 隊の真ん中は供回りを除いて測る（将について歩く供回りまで数えると、真ん中が将と一緒に下がり続ける）
  const f = g.forward(), c = bodyCenter(g), p = u.officerPoint;
  const back = !c.body ? 0 : u.hp < u.maxHp * 0.45 || u.officerBackUntil > army.time ? 12 : 7;
  // 将が何人もいる備は、隊の後ろで横に並ぶ（全員が同じ一点へ寄って重ならない。kaito 10/27）
  let k = 0;
  for (const o of g.units) { if (o === u) break; if (o.isOfficer && o.alive) k++; }
  const side = OFFICER_SIDE[k % 5] * 2.2;
  p.x = c.x - f.x * back + f.z * side; p.z = c.z - f.z * back - f.x * side;
  u.target = null; u.moveTo = p;
  if (!(u.cheerT > army.time)) { u.cheerT = army.time + 6; u.cheer = 1; }
  return true;
}
