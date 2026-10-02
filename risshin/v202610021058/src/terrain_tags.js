// 地形の種類（terrain_tags.js）… docs/siege-plan.md M1／docs/mountain-spec.md 4〜10・16・17・20章
// tagAt(world, x, z) が地形の種類を返す：'steep'（急な斜面）・'slope'（ゆるい斜面）・
// 'stairs'（石段）・'path'（細道）・'forest'（森）・'mud'（ぬかるみ）・'hori'（空堀・堀切・竪堀の底）・'open'（平場）。
// 堀の底は castle_plan.js の buildCastlePlan が置く world.def.horiAt を見る（束21）。
// 斜面は heightAt の傾き、石段と細道は戦の定義の world.def.paths（折れ線の道）から、
// 森は木の場所（world.treePoints）の込み具合から出す。道・木の無い戦は 'open' ばかりになり、
// 今までの野戦の動きのまま変わらない。
import { distToPolyline } from './world.js';

const E = 0.5;   // 傾きを測る半径（m）

// 傾き（0＝平ら、1 でおよそ 45°）。heightAt の中央差分
export function slopeAt(world, x, z) {
  const dx = world.heightAt(x - E, z) - world.heightAt(x + E, z);
  const dz = world.heightAt(x, z - E) - world.heightAt(x, z + E);
  return Math.hypot(dx, dz) / (2 * E);
}

// 近くの木の込み具合（0〜1。treePoints の無い戦は 0）
export function forestAt(world, x, z, r = 6) {
  const pts = world.treePoints;
  if (!pts || !pts.length) return 0;
  let n = 0;
  for (const p of pts) { const dx = p[0] - x, dz = p[1] - z; if (dx * dx + dz * dz < r * r) n++; }
  return Math.min(1, n / 5);
}

// 世界に登録した道（world.def.paths。素の折れ線の配列、または {pts} を持つ物）の一番近い距離
function pathDist(world, x, z) {
  const paths = world.def && world.def.paths;
  if (!paths || !paths.length) return Infinity;
  let best = Infinity;
  for (const p of paths) {
    const pts = p && p.pts ? p.pts : p;
    if (!pts || !pts.length) continue;
    const d = distToPolyline(x, z, pts);
    if (d < best) best = d;
  }
  return best;
}

// 地形のタグを付ける戦だけ効かせる（world.def.terrainTags = true）。
// 今の戦の多くは、飾りの木（world.treePoints）や道（world.def.paths＝土ぼこり・道筋の絵のため。平地の戦にも付いている）
// 濡れ地（world.def.muddy＝転ぶ判定・足音の絵のため）を持っていて、それをそのまま地形タグへ流すと
// 平らな野戦まで重く・向き変えにくくなってしまう（桶狭間で確かめ、動けなくなる所が出た）。
// 山・砦・城の坂で使う戦（M2 以降・C1 以降）が world.def.terrainTags = true を付けて、初めて効く。
// タグの無い戦（今までの戦）は必ず 'open' のまま＝今までの動きと変わらない。
export function tagAt(world, x, z) {
  // 川・水田（world.def.waterSlow で選んだ戦だけ。既存の戦の streams・paddy は絵だけのままにする。長篠・設楽原 統合版 3〜4 章）
  if (world && world.def && world.def.waterSlow && world.inWaterAt && world.inWaterAt(x, z)) return 'water';
  if (!world || !world.heightAt || !world.def || !world.def.terrainTags) return 'open';
  if (world.def.horiAt && world.def.horiAt(x, z)) return 'hori';
  const slope = slopeAt(world, x, z);
  if (slope > 0.08 && pathDist(world, x, z) < 2.6) return slope > 0.32 ? 'stairs' : 'path';
  if (forestAt(world, x, z) > 0.35) return 'forest';
  if (slope < 0.15 && ((world.def && world.def.muddy) || 0) > 0.55) return 'mud';
  if (slope > 0.55) return 'steep';
  if (slope > 0.18) return 'slope';
  return 'open';
}

// 地形・天気による速さ・向き変え・疲れ・当たりの補正。u は units.js の兵（mounted を見る）
// uphill は登り向きか（呼び手が want と今の高さから決める）
// 戻り値：{ tag, spd（速さの倍率）, turn（向きを変える速さの倍率）, tire（疲れの増え方）, acc（当たりやすさの倍率。1 未満で当てにくい）,
//          def（受ける損の倍率）, defHigh（def は撃つ・打つ者が 1.5m 以上高い時だけ）, loose（陣形が保てない） }
// 切岸（steep の登り）：歩み 40〜60%・疲れ増・受ける損 1.25 倍・陣形が崩れる（castle-fort-system-spec 9 章）
// 堀の底（hori）：歩み 0.6・出る登りの疲れ 1.6・上から打たれると 1.3 倍・陣形が崩れる（12・14〜16 章）
export function terrainFx(world, u, x, z, uphill) {
  const tag = tagAt(world, x, z);
  const mounted = !!u.mounted;
  let spd = 1, turn = 1, tire = 0, acc = 1, def = 1, defHigh = false, loose = false;
  if (tag === 'water') { spd = mounted ? 0.45 : 0.82; tire = mounted ? 1.3 : 0.4; turn = 0.75; loose = true; }
  else if (tag === 'hori') { spd = mounted ? 0.4 : 0.6; tire = uphill ? 1.6 : 0.6; turn = 0.7; def = 1.3; defHigh = true; loose = true; }
  else if (tag === 'steep') { spd = uphill ? (mounted ? 0.32 : 0.55) : (mounted ? 0.55 : 0.85); tire = uphill ? 2.2 : 1.2; if (mounted) turn = 0.6; if (uphill) { def = 1.25; loose = true; } }
  else if (tag === 'slope') { spd = uphill ? (mounted ? 0.6 : 0.8) : (mounted ? 0.85 : 1.05); tire = uphill ? 1.4 : 0.7; }
  else if (tag === 'stairs' || tag === 'path') { spd = mounted ? 0.55 : 0.9; turn = 0.55; tire = uphill ? 1.3 : 0.5; }
  else if (tag === 'forest') { spd = mounted ? 0.45 : 0.75; turn = 0.7; acc = 0.7; tire = 0.6; }
  else if (tag === 'mud') { spd = 0.7; tire = 0.8; }
  // 騎馬は山（急坂・石段・森）で大きく弱い（docs/mountain-spec.md 17章）
  if (mounted && (tag === 'steep' || tag === 'stairs' || tag === 'forest')) spd *= 0.55;
  const rain = world.rainLevel || 0, fog = (world.def && world.def.mist) ? 1 : 0, night = world.timeKey === 'night';
  if (rain > 0.3) { acc *= 0.85; if (tag === 'mud' || tag === 'slope' || tag === 'steep' || tag === 'hori') spd *= 0.9; }
  if (fog > 0) acc *= 0.85;
  if (night) acc *= 0.9;
  return { tag, spd, turn, tire, acc, def, defHigh, loose };
}
