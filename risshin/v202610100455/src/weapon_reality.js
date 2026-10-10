// 槍の実寸と手の出を、本人・兵・届く印で共有する。形は縮めない。
export function spearReach(u, kind = 'thrust') {
  const data = u.wpn?.userData;
  if (!data?.tip) return u.reach || 2.9;
  const scale = u.mesh?.scale.z || 1;
  if (kind === 'butt') return (Math.abs(data.butt || -1) + 0.33) * scale;
  // 構えの拳は体の前十八糎。技の手の出は描く姿と同じ寸法。
  const hand = kind === 'thrust' || kind === 'charged' || kind === 'charge' ? 0.8 : kind === 'hook' ? 0.73 : kind === 'slam' ? 0.08 : 0.18;
  return (data.tip + hand) * scale;
}

// 雨覆は火皿、空いた手や覆いは火縄を守る。屋内でも濡れた薬はすぐには戻らない。
export function gunWeather(army, u, dt) {
  if (u.type !== 'gun' && !u.isPlayer) return;
  const rain = Math.max(0, Math.min(1, army.world.rainLevel ?? army.rain ?? 0));
  const sheltered = u.naka != null && u.naka !== false;
  const panRain = sheltered ? 0 : rain * (u.gunRainCover ? 0.1 : 1);
  // 片手が空く待機・弾込めの間は、既存の覆う姿で火縄を守る。
  const cordProtected = u.gunCordCover || (!u.atk && !u.fireT);
  const cordRain = sheltered ? 0 : rain * (cordProtected ? 0.1 : 1);
  u.gunPanWet = Math.min(1, Math.max(0, (u.gunPanWet || 0) + (panRain > 0 ? panRain * dt * 0.3 : -dt / 60)));
  u.gunCordWet = Math.min(1, Math.max(0, (u.gunCordWet || 0) + (cordRain > 0 ? cordRain * dt * 0.2 : -dt / 40)));
  // 装薬が濡れたら乾かして再使用せず、次の込め直しで取り替える。
  if (panRain > 0) u.gunPowderWet = Math.min(1, (u.gunPowderWet || 0) + panRain * dt * 0.08);
}

// 既存の荷駄のうち、弾薬を持つ者からだけ有限の補給。荷駄を増やさない。
export function rangedSupply(army, u, time) {
  const gun = u.type === 'gun' || u.isPlayer && u.wpnKind === 'gun';
  const bow = u.type === 'bow' || u.isPlayer && u.wpnKind === 'bow';
  if (!gun && !bow || u.nextSupply > time || u.mounted || u.fleeing || u.atk || u.swing || Math.hypot(u.vel.x, u.vel.z) > 0.3) return false;
  u.nextSupply = time + 8;
  const key = gun ? 'gunSupply' : 'arrowSupply', ammo = gun ? 'gunAmmo' : 'arrowAmmo', max = gun ? 20 : 24;
  if ((u[ammo] ?? max) >= max) return false;
  for (const p of army.units) {
    if (p.type === 'porter' && p.isSub) { p.gunSupply ??= 60; p.arrowSupply ??= 72; }
    if (p.type !== 'porter' || !p.alive || p.fleeing || p.team !== u.team || !(p[key] > 0) || Math.abs(p.pos.y - u.pos.y) > 1.5 || Math.hypot(p.pos.x - u.pos.x, p.pos.z - u.pos.z) > 2.4 || army.wallBetween(u.pos, u.team, p.pos)) continue;
    const n = Math.min(max - (u[ammo] || 0), p[key]);
    p[key] -= n; u[ammo] = (u[ammo] || 0) + n; return true;
  }
  return false;
}

// 不発の薬は抜き、新しい乾いた薬で込め直す。火縄は別に乾くまで待つ。
export function renewGunPowder(u) {
  u.gunPowderWet = 0; u.gunPanWet = 0;
}
