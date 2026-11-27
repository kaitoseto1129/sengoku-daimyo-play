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
// K675 Sanae：見通しの覚え。前は0.4秒ごとに二段の Map を捨てて作り直し、升の組ごとに Map と入れ物が JSC の山に生まれていた
//   （一秒に約6千）。同じ物を、前もって作った型付き配列の表（開いた番地・何回目の覚えかの印で消す）に持つ。覚える物と答えは同じ
const SEE_SZ = 1 << 17, SEE_M = SEE_SZ - 1;
const SEE_A = new Int32Array(SEE_SZ), SEE_B = new Int32Array(SEE_SZ), SEE_G = new Uint16Array(SEE_SZ), SEE_V = new Uint8Array(SEE_SZ);
let seeGen = 1;
let seeT = 0, SEE_N = 0;
function seeClear() { if (++seeGen > 65535) { SEE_G.fill(0); seeGen = 1; } }
export function weatherSees(world, from, to) {
  const r = weatherSight(world), dx = to.x - from.x, dz = to.z - from.z, d2 = dx * dx + dz * dz;
  if (d2 > r * r) return false;
  if (d2 < 9) return terrainSees(world, from, to) && smokeDepth(world, from, to) < 0.85;
  const now = performance.now();
  if (now - seeT > 400 || SEE_N > 40000) { seeClear(); SEE_N = 0; seeT = now; }
  const ax = Math.floor(from.x / 6) + 512, az = Math.floor(from.z / 6) + 512, bx = Math.floor(to.x / 6) + 512, bz = Math.floor(to.z / 6) + 512;
  // 11/21 クラウド k365-03（K564 掃除の跳ね）：四十 bit の鍵は小さな整数に収まらず、引くたびに数の箱を作っていた。升の組を二段の表（どちらも二十 bit の鍵）で引く（覚える物は同じ）
  const ka = ax * 1024 + az, kb = bx * 1024 + bz;
  let h = (Math.imul(ka, 0x9E3779B1) ^ Math.imul(kb, 0x85EBCA77)) >>> 15 & SEE_M;
  while (SEE_G[h] === seeGen) { if (SEE_A[h] === ka && SEE_B[h] === kb) return SEE_V[h] === 1; h = (h + 1) & SEE_M; }
  const v = terrainSees(world, from, to) && smokeDepth(world, from, to) < 0.85;
  SEE_G[h] = seeGen; SEE_A[h] = ka; SEE_B[h] = kb; SEE_V[h] = v ? 1 : 0; SEE_N++;
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
