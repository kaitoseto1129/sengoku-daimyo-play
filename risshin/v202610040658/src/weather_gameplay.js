import { terrainSees } from './terrain_tags.js';
import { smokeDepth } from './wind_smoke.js';
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
  return dx * dx + dz * dz <= r * r && terrainSees(world, from, to) && smokeDepth(world, from, to) < 0.85;
}

// 雨上がりも土はしばらく湿る。石段と水中は元の地形の遅さを使う。
export function mudSpeed(world, mounted, tag) {
  if (tag === 'stairs' || tag === 'water') return 1;
  const wet = Math.max(clamp(world.rainLevel), clamp(world.wetness), clamp(world.def?.muddy));
  return 1 - wet * (mounted ? 0.25 : 0.18);
}

// 雨除けのない野外の筒は、雨で口薬と火縄が湿る。地面の湿りだけでは不発にしない。
export function gunMisfireChance(world, rain = 0) {
  const wet = clamp(world?.rainLevel ?? rain);
  return wet >= 0.2 ? 1 : wet * 5;
}
