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

// K384：本人が狙う時の見通し（霧の描きの遠さの九割五分まで。兵が見つける七割より遠い。地形と煙はそのまま数える）
export function playerSees(world, from, to) {
  const vis = Math.min(world.vis ?? Infinity, world.scene?.fog?.far ?? Infinity), r = vis < 180 ? Math.max(12, vis * 0.95) : Infinity;
  const dx = to.x - from.x, dz = to.z - from.z;
  return dx * dx + dz * dz <= r * r && terrainSees(world, from, to) && smokeDepth(world, from, to) < 0.85;
}

// K360⑥（11/17 n-atsumi・密集の重さ）：森と煙の見通しは、6m の升の組ごとに 0.4 秒だけ覚えて使い回す（兵の索敵ごとに同じ二つの升の間を
//   何百回も数えていた。鉄砲の煙の多い長篠で一コマの約一割）。3m 内は前と同じに毎回数える（間近の煙の濃さは升より細かく変わる）
const SEE = new Map();
let seeT = 0, SEE_N = 0;
export function weatherSees(world, from, to) {
  const r = weatherSight(world), dx = to.x - from.x, dz = to.z - from.z, d2 = dx * dx + dz * dz;
  if (d2 > r * r) return false;
  if (d2 < 9) return terrainSees(world, from, to) && smokeDepth(world, from, to) < 0.85;
  const now = performance.now();
  if (now - seeT > 400 || SEE_N > 40000) { SEE.clear(); SEE_N = 0; seeT = now; }
  const ax = Math.floor(from.x / 6) + 512, az = Math.floor(from.z / 6) + 512, bx = Math.floor(to.x / 6) + 512, bz = Math.floor(to.z / 6) + 512;
  // 11/21 クラウド k365-03（K564 掃除の跳ね）：四十 bit の鍵は小さな整数に収まらず、引くたびに数の箱を作っていた。升の組を二段の表（どちらも二十 bit の鍵）で引く（覚える物は同じ）
  const ka = ax * 1024 + az, kb = bx * 1024 + bz;
  let row = SEE.get(ka);
  if (row === undefined) { row = new Map(); SEE.set(ka, row); }
  const hit = row.get(kb);
  if (hit !== undefined) return hit;
  const v = terrainSees(world, from, to) && smokeDepth(world, from, to) < 0.85;
  row.set(kb, v); SEE_N++;
  return v;
}

// 雨上がりも土はしばらく湿る。石段と水中は元の地形の遅さを使う。
export function mudSpeed(world, mounted, tag) {
  if (tag === 'stairs' || tag === 'water') return 1;
  const wet = Math.max(clamp(world.rainLevel), clamp(world.wetness), clamp(world.def?.muddy));
  return 1 - wet * (mounted ? 0.25 : 0.18);
}

// 雨除けのない野外の筒は、雨で口薬と火縄が湿る。地面の湿りだけでは不発にしない。
export function gunMisfireChance(world, rain = 0, u = null) {
  const sheltered = u && u.naka != null && u.naka !== false;
  const wet = sheltered ? 0 : clamp(world?.rainLevel ?? rain) * (u?.gunRainCover ? 0.1 : 1);
  const current = wet >= 0.2 ? 1 : wet * 5;
  // 火縄と口薬は雨上がりにも湿りを持ち越す。濡れた装薬は込め直す。
  return Math.max(current, clamp(u?.gunCordWet) * 0.95, clamp(u?.gunPanWet) * 0.95, clamp(u?.gunPowderWet) * 0.95);
}
