// 天気の絵と遊びを同じ値でつなぐ。数だけを返し、毎コマ物を作らない。
const clamp = (v) => Math.max(0, Math.min(1, v || 0));

// 戦ごとに上書きする朝霧も含め、今描いている霧の遠さを読む。
// 晴れた広い見通しは制限せず、深い霧では近づいて初めて見える。
export function weatherSight(world) {
  const vis = Math.min(world.vis ?? Infinity, world.scene?.fog?.far ?? Infinity);
  return vis < 180 ? Math.max(12, vis * 0.7) : Infinity;
}

export function weatherSees(world, from, to) {
  const r = weatherSight(world), dx = to.x - from.x, dz = to.z - from.z;
  return dx * dx + dz * dz <= r * r;
}

// 雨上がりも土はしばらく湿る。石段と水中は元の地形の遅さを使う。
export function mudSpeed(world, mounted, tag) {
  if (tag === 'stairs' || tag === 'water') return 1;
  const wet = Math.max(clamp(world.rainLevel), clamp(world.wetness), clamp(world.def?.muddy));
  return 1 - wet * (mounted ? 0.25 : 0.18);
}

// 弱い雨から豪雨まで少しずつ不発が増える。濡れた地面だけでは火縄を湿らせない。
export function gunMisfireChance(world, rain = 0) {
  return clamp(world?.rainLevel ?? rain) * 0.7;
}
