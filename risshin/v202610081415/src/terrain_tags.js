import { mudSpeed } from './weather_gameplay.js';
// 地形の種類（terrain_tags.js）… docs/siege-plan.md M1／docs/mountain-spec.md 4〜10・16・17・20章
// tagAt(world, x, z) が地形の種類を返す：'steep'（急な斜面）・'slope'（ゆるい斜面）・
// 'stairs'（石段）・'path'（細道）・'forest'（森）・'mud'（ぬかるみ）・'hori'（空堀・堀切・竪堀の底）・'open'（平場）。
// 堀の底は castle_plan.js の buildCastlePlan が置く world.def.horiAt を見る（束21）。
// 斜面は heightAt の傾き、石段と細道は戦の定義の world.def.paths（折れ線の道）から、
// 森は木の場所（world.treePoints）の込み具合から出す。道・木の無い戦は 'open' ばかりになり、
// 地形のない所は平場として扱う。
import { distToPolyline } from './world.js';
import { groundAt } from './floors.js';

const E = 0.5;   // 傾きを測る半径（m）

// 傾き（0＝平ら、1 でおよそ 45°）。heightAt の中央差分
export function slopeAt(world, x, z) {
  const dx = world.heightAt(x - E, z) - world.heightAt(x + E, z);
  const dz = world.heightAt(x, z - E) - world.heightAt(x, z + E);
  return Math.hypot(dx, dz) / (2 * E);
}

// 森・竹林を十二歩の升に分ける。木の全数を兵ごと・毎コマ走査しない。
const woods = new WeakMap();
export function forestAt(world, x, z, r = 6) {
  const pts = world.treePoints;
  if (!pts || !pts.length) return 0;
  let grid = woods.get(world);
  if (!grid || grid.pts !== pts || grid.n !== pts.length) {
    grid = { pts, n: pts.length, cells: new Map() };
    for (const p of pts) {
      const key = (Math.floor(p[0] / 12) + 32768) * 65536 + Math.floor(p[1] / 12) + 32768;
      let cell = grid.cells.get(key);
      if (!cell) { cell = []; grid.cells.set(key, cell); }
      cell.push(p);
    }
    woods.set(world, grid);
  }
  let n = 0;
  for (let iz = Math.floor((z - r) / 12); iz <= Math.floor((z + r) / 12); iz++) {
    for (let ix = Math.floor((x - r) / 12); ix <= Math.floor((x + r) / 12); ix++) {
      const cell = grid.cells.get((ix + 32768) * 65536 + iz + 32768);
      if (!cell) continue;
      for (const p of cell) {
        const dx = p[0] - x, dz = p[1] - z;
        if (dx * dx + dz * dz < r * r && ++n >= 5) return 1;
      }
    }
  }
  return n / 5;
}

// 足元一歩先の勾配。遠い目的地の高さでは途中の登り下りが分からない。
export function uphillAt(world, x, z, dx, dz) {
  const d = Math.hypot(dx, dz);
  return d > 0.001 && world.heightAt(x + dx / d, z + dz / d) - world.heightAt(x, z) > 0.08;
}

// 茂みを通る見通し。積もった木の密度で遮り、至近の相手は見える。
export function terrainSees(world, from, to) {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.hypot(dx, dz);
  if (d <= 8 || !world.treePoints?.length) return true;
  const steps = Math.min(24, Math.ceil(d / 6)), span = d / steps;
  let cover = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    cover += forestAt(world, from.x + dx * t, from.z + dz * t) * span;
    if (cover > 12) return false;
  }
  return true;
}

// 道の半幅と石段の指定を読む。急な土の道を勝手に石段に変えない。
function pathTag(world, x, z) {
  const paths = world.def && world.def.paths;
  if (!paths || !paths.length) return '';
  let best = Infinity, tag = '';
  for (const p of paths) {
    const pts = p && p.pts ? p.pts : p;
    if (!pts || !pts.length) continue;
    const d = distToPolyline(x, z, pts) / (p.w ?? world.def.pathWidth ?? 2);
    if (d < best && d < 1) { best = d; tag = p.stairs || p.kind === 'stairs' ? 'stairs' : 'path'; }
  }
  return tag;
}

// 既存の川・田・木・坂の印を全戦で読む。地形のない所は平場。
export function tagAt(world, x, z, y) {
  // 川・水田は、描いている水と共通の判定を使う。
  if (world && world.def && world.inWaterAt && world.inWaterAt(x, z, y)) return 'water';
  if (!world || !world.heightAt || !world.def) return 'open';
  // 橋・櫓の床に、下の川床の傾きや泥を当てはめない。
  if (y != null && y > world.heightAt(x, z) + 0.3) return 'open';
  if (world.def.horiAt && world.def.horiAt(x, z)) return 'hori';
  if (world.koguchiAreas) for (const area of world.koguchiAreas) {
    const dx = x - area.x, dz = z - area.z;
    if (Math.abs(dx * area.px + dz * area.pz) < area.half && Math.abs(dx * area.ux + dz * area.uz) < area.half) return 'koguchi';
  }
  const slope = slopeAt(world, x, z);
  const path = pathTag(world, x, z);
  if (slope > 0.08 && path) return path;
  if (forestAt(world, x, z) > 0.35) return 'forest';
  if (slope < 0.15 && ((world.def.muddy || 0) > 0.55 || (world.def.paddy && world.def.paddy(x, z) > 0.55))) return 'mud';
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
  const footY = groundAt(world, x, z, u.pos?.y ?? world.heightAt(x, z));
  const tag = tagAt(world, x, z, footY);
  if (footY > world.heightAt(x, z) + 0.3) uphill = false;
  const mounted = !!u.mounted;
  let spd = 1, turn = 1, tire = 0, acc = 1, def = 1, defHigh = false, loose = false;
  if (tag === 'water') { spd = world.waterSpeedAt ? world.waterSpeedAt(x, z, mounted, footY) : mounted ? 0.45 : 0.82; tire = mounted ? 1.3 : 0.4; turn = 0.75; loose = true; }
  else if (tag === 'hori') { spd = mounted ? 0.4 : 0.6; tire = uphill ? 1.6 : 0.6; turn = 0.7; def = 1.3; defHigh = true; loose = true; }
  // 虎口は歩み・向き変えが重く、上から狙われる。歩みをゼロにはしない。
  else if (tag === 'koguchi') { spd = mounted ? 0.45 : 0.8; turn = 0.55; tire = 0.7; def = 1.2; defHigh = true; }
  else if (tag === 'steep') { spd = uphill ? (mounted ? 0.32 : 0.55) : (mounted ? 0.55 : 0.85); tire = uphill ? 2.2 : 1.2; if (mounted) turn = 0.6; if (uphill) { def = 1.25; loose = true; } }
  else if (tag === 'slope') { spd = uphill ? (mounted ? 0.6 : 0.8) : (mounted ? 0.85 : 1.05); tire = uphill ? 1.4 : 0.7; }
  else if (tag === 'stairs' || tag === 'path') { spd = mounted ? 0.55 : 0.9; turn = 0.55; tire = uphill ? 1.3 : 0.5; }
  else if (tag === 'forest') { spd = mounted ? 0.45 : 0.75; turn = 0.7; acc = 0.7; tire = 0.6; loose = true; }
  else if (tag === 'mud') { spd = 0.7; tire = 0.8; }
  // 騎馬は山（急坂・石段・森）で大きく弱い（docs/mountain-spec.md 17章）
  if (mounted && (tag === 'steep' || tag === 'stairs' || tag === 'forest')) spd *= 0.55;
  // 森や田の中の登りにも、坂の負担を掛ける。
  if (uphill && (tag === 'open' || tag === 'forest' || tag === 'mud' || tag === 'water')) {
    spd *= mounted ? 0.6 : 0.8; tire += 1.4;
  }
  const rain = world.rainLevel || 0, fog = (world.def && world.def.mist) ? 1 : 0, night = world.timeKey === 'night';
  if (rain > 0.3) { acc *= 0.85; if (tag === 'mud' || tag === 'slope' || tag === 'steep' || tag === 'hori') spd *= 0.9; }
  spd *= mudSpeed(world, mounted, tag);
  if (fog > 0) acc *= 0.85;
  if (night) acc *= 0.9;
  const fx = u._terrainFx || (u._terrainFx = {});
  fx.tag = tag; fx.spd = spd; fx.turn = turn; fx.tire = tire;
  fx.acc = acc; fx.def = def; fx.defHigh = defHigh; fx.loose = loose;
  return fx;
}
