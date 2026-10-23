import { useTerrain } from './asset_manifest.js';
import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
// ======================================================================
// 織田家編　稲葉山城の戦い（永禄十年八月）
// 美濃三人衆が織田方につき、信長はすぐに兵を出して稲葉山城（金華山）を囲んだ。
// 足軽は木下藤吉郎の手。①城下の井口の町に火を放つ（時刻は不明） ②大手口から打って出た斎藤勢を退ける
// ③藤吉郎について、山の裏の道（搦手）を登り、木戸の守りを破る ④本丸の脇に火を放って、大手の味方へ合図を送る
// 放火の日と翌日以後の囲みを分け、八月十五日の開城は後日談で描く
// 向き：北（-z）が金華山と本丸。南（+z）が井口の町。東（+x）の瑞龍寺山に信長の本陣。西の外を長良川が流れる
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { kitFence, paintGeo, WOOD_MAT, SOLIDS } from './props.js';
import { nobori, hut, dou, kabukimon, yagura, tawara, campfire, palisade, village, ishigaki, sakamogi, kagaribi, dorui, dobei, kuruwaBldg, makeKitBatch, finalizeKitBatch, makeSimpleBatch, finalizeSimpleBatch, solidSeg, carryTorches } from './props.js';
import { flagTexture } from './textures.js';
import { stoneTex, barkTex, dirtTex, mudTex, leafTex } from './nature.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { reduceMotion, S } from './settings.js';
import { sightPoint, sightScreenUnit } from './battle_sight.js';
import { revealName } from './battle_intel.js';
import { makeTownWay } from './inabayama_town_way.js';
import { VIEW } from './viewport.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, wallLine } from './bhelp.js';
import { camp } from './b_mid.js';
import { placeGroup, placePlayer } from './b_opening.js';
import { pressureTick } from './battle_pressure.js';
import { demDetail } from './dem.js';
import { yamaLift } from './yamalift.js';
import { distToPolyline } from './world.js';
import { drawGroundAt, guardDrawCamera } from './render_camera.js';
import { rockShape, rockTuftShape, groundRocks } from './rock_shape.js';

// 実測地形（国土地理院 標高タイル下ごしらえ）：金華山の本当の尾根・谷の形に混ぜる（城の部品の位置はそのまま）。
// いつも使う（quality-upgrade-plan 束2。DEM_ON の分かれはやめた）。最初の画面を軽くするため遅れて読む（他の戦と同じやり方）
let DEM = null;
useTerrain('dem_inabayama', (data) => { DEM = data; });
import { reset as flReset, addRamp } from './floors.js';
import { monomi, goten, horiboriHeight } from './castle_parts.js';
import { heightOf, inPoly, buildCastlePlan, garrisonKuruwa, makeLordKeep } from './castle_plan.js';
import { makeRockTraps } from './siege_rocks.js';
import { tickTabas, tabaInteractTick, makeTabaAdvance } from './taketaba.js';
import { makeButai, adoptGroup, butaiTick, lightClash } from './butai.js';
import { makeSiegeZones, ZONE_STATE } from './siege_zones.js';
import { makeNawabari } from './nawabari.js';
import { makeDefenseAI } from './siege_ai.js';
import { HON, NI, TSUKE, OTE, ROAD, KARA, TOWER, INABAYAMA_PLAN as INABAYAMA_BASE_PLAN, HYAKU, FUNA, HON_GATE_OUT, IRI, NAKA, NIMON, LAYERS, INABAYAMA_HIST, MATSU, DEMARU, UMAYA, YAKATA, NI_ROAD, TOP_ROAD, CASTLE_PATHS } from './castles/inabayama.js';


// 曲輪と物見の位置は保ち、下の急坂だけを西へ折り返す。この戦だけの道。
// 折り返しの間を二十歩あけ、折れを二つの角で回る。
// 鋭い折れの内側で上下の肩が重なると、道の内まで横向きの崖になる。
const KARA_LEGS = [
  [KARA[0], [-6, -10], [-68, -10], [-68, -36], [-26, -36], [-26, -58], KARA[1]],
  [KARA[1], [-92, -50], [-92, -72], [-66, -72], [-66, -90], KARA[2]],
  [KARA[2], [-82, -110], KARA[3]],
  [KARA[3], [-54, -140], [-26, -140], KARA[4]], [KARA[4], KARA[5]],
];
const KARA_TRAIL = KARA_LEGS.flatMap((p, i) => i ? p.slice(1) : p);
const INABA_PATHS = CASTLE_PATHS.map((p) => p === KARA ? KARA_TRAIL : p);
const INABA_CLIMB_MAP = [KARA_TRAIL];
// 新しい折れが腰曲輪の柵を横切る口も、この戦の縄張りだけに足す。
const INABAYAMA_PLAN = { ...INABAYAMA_BASE_PLAN, exactGapEdges: true,
  // 切岸に逆茂木を自動で並べると、地面の高低差で幹が巨大な黒い針になる。
  // 枝先まで支えられる緩い地面だけに置き、裏道の通り口も空ける。
  sakamogiMaxRise: 0.8,
  // 土塁は歩く地面に含まれる。別の土の帯を重ねず、曲輪の内外も同じ高さでつなぐ。
  terrainBanks: true, continuousEdges: true,
  paths: INABA_PATHS.map((pts) => ({ pts })),
  kuruwa: INABAYAMA_BASE_PLAN.kuruwa.map((k) => {
    // 古い裏道の口を混ぜず、実際に歩く全ての道から口を取り直す。
    const gaps = [];
    for (const path of INABA_PATHS) for (let j = 1; j < path.length; j++) {
      const a = path[j - 1], b = path[j], dx = b[0] - a[0], dz = b[1] - a[1];
      for (let i = 0; i < k.poly.length; i++) {
        const c = k.poly[i], e = k.poly[(i + 1) % k.poly.length], ex = e[0] - c[0], ez = e[1] - c[1], cross = dx * ez - dz * ex;
        if (Math.abs(cross) < 0.00001) continue;
        const qx = c[0] - a[0], qz = c[1] - a[1], t = (qx * ez - qz * ex) / cross, u = (qx * dz - qz * dx) / cross;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const x = a[0] + dx * t, z = a[1] + dz * t;
        const near = gaps.find((p) => p.edge === i && Math.hypot(p[0] - x, p[1] - z) < 6);
        if (near) { near[0] = (near[0] + x) / 2; near[1] = (near[1] + z) / 2; }
        else { const mouth = [x, z]; mouth.edge = i; gaps.push(mouth); }
      }
    }
    // 中心線の交点だけでは、斜めに横切る口や角の脇へ柵が残る。
    // 列が避ける肩（四・四歩）と杭の太さまで空け、見える柵と当たりを一緒に切る。
    // 近い口を平均せず並べ、重なる切り口は城の共通処理でつなぐ。
    if (k.wall) for (let i = 0; i < k.poly.length; i++) {
      const a = k.poly[i], b = k.poly[(i + 1) % k.poly.length];
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
      for (let j = 0; j <= steps; j++) {
        const x = a[0] + (b[0] - a[0]) * j / steps, z = a[1] + (b[1] - a[1]) * j / steps;
        if (distToPolyline(x, z, KARA_TRAIL) >= 5
          || gaps.some((p) => p.edge === i && Math.hypot(p[0] - x, p[1] - z) < 2)) continue;
        const mouth = [x, z]; mouth.edge = i; gaps.push(mouth);
      }
    }
    return { ...k, gapAt: gaps.length ? gaps : null };
  }),
};
let KARA_GRADES = [];
// 列の脇で避けても切岸へ落ちない肩と、山肌へ戻す幅。この戦の裏道だけに使う。
const KARA_SHOULDER = 4.4, KARA_BLEND = 22;
// 戻り値と区間は使い回す。道の左右を水平にし、横向きの貼り付きも防ぐ。
const KARA_SAMPLE = { y: 0, d: Infinity, grade: 0, dx: 0, dz: 0, leg: -1 };
function karaSample(x, z) {
  const out = KARA_SAMPLE; out.d = Infinity;
  let nearest = -1;
  for (let i = 0; i < KARA_GRADES.length; i++) {
    const q = KARA_GRADES[i];
    if (x < q.x0 || x > q.x1 || z < q.z0 || z > q.z1) continue;
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
    const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
    if (d < out.d) { nearest = i; out.d = d; out.y = q.ya + (q.yb - q.ya) * t; out.grade = (q.yb - q.ya) / q.len; out.dx = q.dx / q.len; out.dz = q.dz / q.len; }
  }
  // 道の中心では近い区間だけを採る。折り返しの間の山肌では、
  // 同じ距離の区間を混ぜる。最寄りが替わる線に縦の壁を作らない。
  if (nearest >= 0 && out.d < KARA_BLEND) {
    let weight = 0, y = 0, grade = 0, dx = 0, dz = 0;
    // 道の肩は保ち、折り返しの間では広く高さを混ぜる。
    // 高低差の大きい二本の道を細い帯だけでつなぐと、尖った壁が残る。
    const blend = KARA_SHOULDER + Math.max(0, out.d - KARA_SHOULDER) * 1.6;
    for (let i = 0; i < KARA_GRADES.length; i++) {
      const q = KARA_GRADES[i];
      if (x < q.x0 || x > q.x1 || z < q.z0 || z > q.z1) continue;
      const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
      const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
      // 距離の差で重みを切ると、角の内側で高さが急に替わる。
      // 距離の二乗で緩く混ぜ、道幅の中に歩けない折れ目を作らない。
      const w = Math.exp(-(d * d - out.d * out.d) / (blend * blend));
      weight += w; y += (q.ya + (q.yb - q.ya) * t) * w;
      grade += (q.yb - q.ya) / q.len * w; dx += q.dx / q.len * w; dz += q.dz / q.len * w;
    }
    out.y = y / weight; out.grade = grade / weight;
    const len = Math.hypot(dx, dz) || 1;
    out.dx = dx / len; out.dz = dz / len;
  }
  out.leg = nearest;
  return out;
}

// 折れを通り過ぎて次の区間に入った時も案内を進める。別の高さの道へは飛ばさない。
function roadCornerPassed(world, p, path, i, radius) {
  const a = path[i];
  // 折れの肩は隣の区間と高さを混ぜている。中心線の高さだけと
  // 比べると、道の上にいるのに未到着となる。本人の足場で照合する。
  const grounded = Math.abs(p.y - world.heightAt(p.x, p.z)) < 2;
  if (Math.hypot(p.x - a[0], p.z - a[1]) < radius && grounded) return true;
  // すぐ先の区間へ出た時だけ進める。先の全区間を探すと、
  // 折り返しの向こうに寄っただけで間の角を全て通過扱いにしてしまう。
  if (i + 1 < path.length) {
    const a = path[i], b = path[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    if (!l2) return false;
    const t = ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / l2;
    if (t <= 0 || t > 1) return false;
    const along = Math.min(1, t);
    const x = a[0] + dx * along, z = a[1] + dz * along;
    // 角から一・二歩を過ぎたのに、二歩まで未通過とすると案内が後ろへ戻る。
    // 次の道へ半歩入った所から認める。道幅と高さの条件は残す。
    // 兵に押されて歩ける肩へ寄っても通過を認める。移動できる幅より
    // 判定を狭めると、角を過ぎたのに印が後ろへ残り続ける。
    if (t * Math.sqrt(l2) > 0.6 && Math.hypot(p.x - x, p.z - z) <= KARA_SHOULDER - 0.6 + 0.00001 && grounded) return true;
  }
  return false;
}

// 道を外れた時は、通ってきた区間へ戻してから折れへ向かう。
// 隣の折り返しを高さで区別し、案内と試験の遊び手で同じ的を使う。
function roadApproach(world, p, path, i, out) {
  const goal = path[i];
  const wasReturning = out.returning;
  out.x = goal[0]; out.z = goal[1]; out.returning = false;
  let near = Infinity, leg = -1, along = 0, side = 0;
  for (let j = 0; j < i; j++) {
    const a = path[j], b = path[j + 1], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    if (!l2) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / l2));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
    // 肩の実際の足場と中心線には高低差がある。二歩までの差で
    // 通過済みの角を近いと判定せず、別の高さの折り返しだけを遠ざける。
    // 今歩いている区間の肩は、中心より高いことがある。本人が描く面に
    // 接地していれば、その高さの差で通過済みの角へ引き戻さない。
    const onCurrent = j === i - 1 && d <= KARA_SHOULDER - 0.6
      && Math.abs(p.y - world.heightAt(p.x, p.z)) < 2;
    const score = onCurrent ? d : d + Math.max(0, Math.abs(p.y - world.heightAt(x, z)) - 2) * 4;
    // 角のちょうど上では、入ってきた区間より出ていく区間を選ぶ。
    if (score <= near + 0.00001) { near = score; leg = j; along = t; side = d; }
  }
  // 二人の列の脇を歩いても戻れと言わない。土の道幅を外れた時だけ中央へ案内する。
  // 歩ける肩は中心から三・八歩まで。案内だけ狭くすると道の上でも戻される。
  // 戻り始めたら二・八歩まで寄せ、兵に押された時の札の往復を抑える。
  const offRoad = side > (wasReturning ? 2.8 : KARA_SHOULDER - 0.6);
  if (leg >= 0 && (leg < i - 1 || offRoad)) {
    const a = path[leg], b = path[leg + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    // 戻る角へ着いたら、その先の道へ一歩進める。角そのものを指し続けると
    // 「道へ戻れ・零歩」のまま止まり、押された兵が切岸へはみ出す。
    if (leg < i - 1 && Math.hypot(p.x - b[0], p.z - b[1]) < 1.2
      && roadCornerPassed(world, p, path, leg + 1, 1.2)) {
      const c = path[leg + 2], length = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
      const step = Math.min(1, 1.2 / length);
      out.x = b[0] + (c[0] - b[0]) * step; out.z = b[1] + (c[1] - b[1]) * step;
      out.returning = offRoad; return out;
    }
    // 肩を外れた時は真横の足場へ戻す。先へ斜めに寄せると、
    // 折れの内側の高い山肌を横切り、戻る印そのものへ歩けなくなる。
    const t = offRoad ? along : 1;
    // 戦って前の区間へ下がっただけなら、次の角へ案内する。道外れとは呼ばない。
    out.x = a[0] + dx * t; out.z = a[1] + dz * t; out.returning = offRoad;
  }
  return out;
}

// 先頭だけが木戸へ着いても、自分の道案内は消さない。
// 近い別の折り返しから守兵へ直進させず、最後の折れと高さを確かめる。
function inabaAtWoodGate(rt) {
  const p = rt.player.u.pos;
  return rt.flags.karaNext >= KARA_TRAIL.indexOf(KARA[4])
    && Math.hypot(p.x + 30, p.z + 118) < 14
    && Math.abs(p.y - rt.world.heightAt(-30, -118)) < 6;
}

// 裏道の列は曲がり角をたどる。共通の移動は変えず、町では従来の道案内を使う。
function inabaMoveWay(army, u, want, fightApproach = false) {
  if (!want) return want;
  const g = u.group;
  // 騎馬も、戦う時と列を解いて持ち場へ並ぶ時に同じ角を回る。
  // 徒歩の追撃だけを制限すると、馬と待機中の味方が切岸へ直進してしまう。
  // 町と曲輪の平場、敗走の経路は従来どおり。
  if ((!u.isPlayer || fightApproach) && !u.fleeing && !u.naka && u.pos.z < 28 && u.pos.y > 20 && !inabaClearing(u.pos.x, u.pos.z)
    && (fightApproach || u.target || g?.team === 1 || g?.roadColumn && g.order !== 'path')) {
    const sample = karaSample(u.pos.x, u.pos.z), leg = sample.leg;
    if (leg >= 0 && sample.d < KARA_BLEND && Math.abs(u.pos.y - sample.y) < 6) {
      const q = u._inabaFightWay || (u._inabaFightWay = { x: 0, z: 0, at: -1, gx: 0, gz: 0 });
      if (q.at > army.time && Math.hypot(want.x - q.gx, want.z - q.gz) < 0.5) return q;
      q.at = army.time + 0.25; q.gx = want.x; q.gz = want.z;
      const segment = KARA_GRADES[leg], offRoad = sample.d > 3.4;
      const to = karaSample(want.x, want.z).leg;
      if (offRoad) {
        // 押し合いで肩を外れたら、敵を追う前に同じ区間の足場へ戻る。
        const t = Math.max(0, Math.min(1, ((u.pos.x - segment.ax) * segment.dx + (u.pos.z - segment.az) * segment.dz) / segment.l2));
        q.x = segment.ax + segment.dx * t; q.z = segment.az + segment.dz * t;
      } else if (to !== leg && to >= 0) {
        // 隣の折れへも角を回る。壁の上にいる相手へ斜めに登らない。
        const t = to > leg ? 1 : 0;
        q.x = segment.ax + segment.dx * t; q.z = segment.az + segment.dz * t;
        // 角に着いたら隣の区間へ一歩。最寄り区間の同点で角に止め続けない。
        if (Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < 1.2) {
          const next = KARA_GRADES[leg + (to > leg ? 1 : -1)];
          if (next) {
            const along = to > leg ? Math.min(1, 1.2 / next.len) : Math.max(0, 1 - 1.2 / next.len);
            q.x = next.ax + next.dx * along; q.z = next.az + next.dz * along;
          }
        }
      } else {
        const t = Math.max(0, Math.min(1, ((want.x - segment.ax) * segment.dx + (want.z - segment.az) * segment.dz) / segment.l2));
        const side = Math.max(-2.2, Math.min(2.2, ((want.x - segment.ax) * segment.dz - (want.z - segment.az) * segment.dx) / segment.len));
        q.x = segment.ax + segment.dx * t + segment.dz / segment.len * side;
        q.z = segment.az + segment.dz * t - segment.dx / segment.len * side;
      }
      return q;
    }
  }
  if (!want || u.isPlayer || u.target || u.fleeing || g?.team !== 0 || !g.roadColumn || g.order !== 'path' || g.pathIdx < 1) return townWay(army, u, want);
  const q = u._inabaWay || (u._inabaWay = { x: 0, z: 0, at: -1, gx: 0, gz: 0 });
  if (q.at > army.time && Math.hypot(want.x - q.gx, want.z - q.gz) < 0.5) return q;
  q.at = army.time + 0.25; q.gx = want.x; q.gz = want.z;
  let from = 1, to = 1, near = Infinity, goal = Infinity, px = u.pos.x, pz = u.pos.z;
  for (let i = 1; i <= Math.min(g.pathIdx, g.path.length - 1); i++) {
    const a = g.path[i - 1], b = g.path[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((u.pos.x - a[0]) * dx + (u.pos.z - a[1]) * dz) / l2));
    const x = a[0] + dx * t, z = a[1] + dz * t;
    const d = Math.hypot(u.pos.x - x, u.pos.z - z) + Math.abs(u.pos.y - army.world.heightAt(x, z));
    if (d < near) { near = d; from = i; px = x; pz = z; }
    const t2 = Math.max(0, Math.min(1, ((want.x - a[0]) * dx + (want.z - a[1]) * dz) / l2));
    const x2 = a[0] + dx * t2, z2 = a[1] + dz * t2, d2 = Math.hypot(want.x - x2, want.z - z2);
    if (d2 < goal) { goal = d2; to = i; }
  }
  if (Math.hypot(u.pos.x - px, u.pos.z - pz) > 1.8) { q.x = px; q.z = pz; }
  else if (from !== to) {
    const forward = from < to, corner = forward ? from : from - 1;
    const p = g.path[corner]; q.x = p[0]; q.z = p[1];
    // 角では二つの区間までの距離が同じになり、入ってきた区間が選ばれる。
    // 同じ一点へ止め続けず、次の区間へ一歩踏み出す。折れを飛ばして斜めに進めない。
    if (Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < 1.2) {
      const next = g.path[corner + (forward ? 1 : -1)];
      if (next) {
        const step = Math.min(1, 1.2 / (Math.hypot(next[0] - p[0], next[1] - p[1]) || 1));
        q.x += (next[0] - p[0]) * step; q.z += (next[1] - p[1]) * step;
      }
    }
  }
  else { q.x = want.x; q.z = want.z; }
  return q;
}

// 足軽大将ほどの身分（信長で遊ぶ時は除く）：藤吉郎の手の一隊を預かる
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const ZUI = { x: 112, z: -30 };           // 瑞龍寺山（信長の本陣）
// 竹束の置き場（搦手の登り口。抱えて登れば、落石・矢を前から 7 割防ぐ。castle-design 7-3）
const TABA_PILE = { x: KARA[0][0] - 3, z: KARA[0][1] + 1 };

// ---------------- 軍議の三つの作戦（七曲り・百曲り・水の手）と、部隊の道 ----------------
// 各手は山道と門の口を通る。足軽一人が入るまで全軍を止める扱いはしない。
const HON_IN = [[HON_GATE_OUT.x, HON_GATE_OUT.z], [KARA[5][0], KARA[5][1]]];
const R_NANA = [...ROAD.slice(4, -2), [OTE.x, OTE.z, 'ote'], ...TOP_ROAD.slice(0, -2), ...HON_IN];
const R_HYAKU = [...HYAKU.slice(0, 5), [24, -94, 'hon'], ...TOP_ROAD.slice(0, -2), ...HON_IN];
// 腰曲輪の既存の出口を抜けてから二の丸へ。喰違いの柵を横切らない。
const R_MIZU = [...KARA_TRAIL.slice(0, KARA_TRAIL.indexOf(KARA[3]) + 1), [NI.x, NI.z, 'ni'], KARA[4], ...HON_IN];
export const STRATS = {
  nanamagari: { name: '七曲り（大手）から攻め上る', short: '七曲り' },
  hyakumagari: { name: '百曲りから本丸の脇を突く', short: '百曲り' },
  mizunote: { name: '水の手（搦手）へ大勢を回す', short: '水の手' },
};
function setRoute(b, pts, F) { b._route = pts; b._i = 0; b._wait = null; b._legT = 0; advance(b, F); }
function advance(b, F) {
  if (!b._route || b._i >= b._route.length) { b.order({ id: 'attack' }); b._route = null; b._wait = null; b._done = true; return; }
  const p = b._route[b._i];
  b._i++; b._wait = null; b._legT = 0;
  b.order({ id: 'move', to: { x: p[0], z: p[1] } });
}
function tickRoutes(list, F, dt) {
  for (const b of list) {
    if (!b._route || b.aliveNominal() <= 0) continue;
    const [x, z] = b._route[b._i - 1];
    b._legT += dt;
    // 道に詰まっても、時間だけで次の折れへ飛ばさない。
    if (Math.hypot(b.pos.x - x, b.pos.z - z) < 4) advance(b, F);
  }
}
// 軽い大軍どうしの押し合い（butai.js の lightClash）。減った数だけ、軽い大軍の兵も隠す（名目＝本物＋軽い を崩さない）
function clash(a, d, dt, k) {
  const la = a.lost, ld = d.lost;
  lightClash(a, d, dt, k);
  for (const [b, l0] of [[a, la], [d, ld]]) {
    b._cl = (b._cl || 0) + (b.lost - l0);
    if (b._cl >= 1 && b.light) { const n = Math.floor(b._cl); b._cl -= n; b.light.take(b.pos.x, b.pos.z, n); }
  }
}
// 持ち運ぶ竹束の見た目（b_nodafukushima.js と同じ軽い作り。props.js の takataba は当たりを置きっぱなしにするので、
// 動かす物には使わない）
const TAKE_MAT = { cane: new THREE.MeshStandardMaterial({ color: 0x6f7a44, roughness: 0.8 }), rope: new THREE.MeshStandardMaterial({ color: 0x8a7650, roughness: 1 }) };
function tabaMesh(W, x, z, rot = 0) {
  const g = new THREE.Group();
  for (let i = 0; i < 11; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 2.2, 6), TAKE_MAT.cane);
    c.position.set(-0.8 + i * 0.16, 1.1, (i % 2) * 0.1);
    c.castShadow = true;
    g.add(c);
  }
  for (const y of [0.5, 1.6]) { const r = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.26), TAKE_MAT.rope); r.position.y = y; g.add(r); }
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5), TAKE_MAT.rope);
  s.position.set(0, 0.8, 0.55); s.rotation.x = -0.6; g.add(s);
  g.rotation.set(-0.12, rot, 0);
  g.position.set(x, W.heightAt(x, z), z);
  return g;
}
// 井口の町の家（x, z, 向き）。はじめの五つが自分で火を放つ候補
// 町の中央（東西二十七歩ほど）の通りを空ける。高床の家の脚へ突き当てない。
const HOUSES = [[24, 80, 0.1], [4, 64, -0.2], [38, 54, 0.3], [-10, 44, 0.05], [44, 78, -0.1], [-18, 70, 0.2], [16, 38, 0.15], [42, 44, -0.25], [-4, 86, 0.1], [8, 100, -0.1]];
const townWay = makeTownWay(HOUSES);
// 常在寺は斎藤家ゆかりの麓の寺。山上の軍用建物を民家や寺と取り違えない。
// 根拠：岐阜市「ナビ番号：315 常在寺」。町・寺・里の間隔と避難路は圧縮地形への推定配置。
// https://www.city.gifu.lg.jp/kankoubunka/kankou/1013050/1005149/1017450/1017461/1020354.html
const TERA = { x: -58, z: 50 };
const civilRoute = (pts) => pts.map(([x, z]) => ({ x, z }));
// 村の戸口から外縁へ、隣家の軒を横切らない生活道を設営時だけ求める。
// 家の角を結ぶ最短路。避難中の形・材質や毎コマの探索は増やさない。
function villageCivilWay(world, homes, door, edge, south, onward, army, burnHome) {
  const boxes = homes.map((h) => ({ x0: h.x0 - 2, x1: h.x1 + 2, z0: h.z0 - 2, z1: h.z1 + 2 }));
  // 後から延焼する家も先に避ける。火が上がってから生活道が塞がるのを防ぐ。
  const fires = (world.fires || []).filter((f) => f.lit !== false && f.size >= 1);
  if (burnHome) {
    fires.push(burnHome);
    edge = edge > burnHome.x ? Math.max(edge, burnHome.x + 11) : Math.min(edge, burnHome.x - 11);
    south = Math.max(south, burnHome.z + 11);
  }
  // 外縁へ出てから家並みの南を回る。目印を候補に混ぜるだけでは、
  // 最短路がそれらを省き、家の間や軍の通る中央へ戻ってしまう。
  // 外側の生活道を順に通り、川を渡らない南の退き口まで検査する。
  const nodes = [{ x: door.x, z: door.z }, { x: edge, z: door.z },
    { x: edge, z: south }, ...onward.map(([x, z]) => ({ x, z }))];
  const stops = nodes.length;
  for (const b of boxes) for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) nodes.push({ x, z });
  // 道端の焚き火も家と同じく迂回する。避難中と同じ十歩を空ける。
  for (const f of fires) for (const dx of [-11, 11]) for (const dz of [-11, 11]) nodes.push({ x: f.x + dx, z: f.z + dz });
  const clear = (a, b) => {
    // 戸口では通れても、道の先で柵に突き当たる経路を作らない。
    if (army.wallBetween(a, 0, b) || army.wallBetween(a, 1, b)) return false;
    for (const box of boxes) {
      let enter = 0, leave = 1;
      // 角に沿う線は通し、矩形の内側へ入る線だけを止める。
      for (const axis of ['x', 'z']) {
        const delta = b[axis] - a[axis], lo = box[`${axis}0`] + 0.001, hi = box[`${axis}1`] - 0.001;
        if (Math.abs(delta) < 0.00001) {
          if (a[axis] <= lo || a[axis] >= hi) { leave = -1; break; }
        } else {
          const t0 = (lo - a[axis]) / delta, t1 = (hi - a[axis]) / delta;
          enter = Math.max(enter, Math.min(t0, t1)); leave = Math.min(leave, Math.max(t0, t1));
        }
      }
      if (enter < leave) return false;
    }
    // 実際の避難と同じ間隔で水・斜面・段差を見る。家だけを避けた直線で
    // 川岸や急な斜面へ案内しない。探索は村を置く時の一度だけ。
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.6));
    let last = world.heightAt(a.x, a.z);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (Math.abs(x) > 174 || Math.abs(z) > 174) return false;
      if (!world.walkable(x, z) || world.inWaterAt(x, z)) return false;
      for (const f of fires) if (Math.hypot(x - f.x, z - f.z) < 10) {
        // 火元の家の戸口だけは、実際の避難と同じく離れ続ける向きへ出られる。
        if (Math.hypot(a.x - f.x, a.z - f.z) >= 10
          || (a.x - f.x) * (b.x - a.x) + (a.z - f.z) * (b.z - a.z) < 0) return false;
      }
      // 村の家だけでなく、接続先の町家・塀・寺の当たりも避ける。
      for (const s of SOLIDS) if (x > s.x0 - 0.3 && x < s.x1 + 0.3 && z > s.z0 - 0.3 && z < s.z1 + 0.3) return false;
      const y = world.heightAt(x, z);
      if (Math.abs(y - last) > 0.45) return false;
      last = y;
    }
    return true;
  };
  const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = nodes.map(() => false);
  // 区間で共用する通行結果。設営時の地形・家・火は変わらない。
  const links = new Int8Array(nodes.length * nodes.length), route = [];
  for (let goal = 1; goal < stops; goal++) {
    const start = goal - 1;
    dist.fill(Infinity); prev.fill(-1); done.fill(false); dist[start] = 0;
    for (let n = 0; n < nodes.length; n++) {
      let at = -1;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && Number.isFinite(dist[i]) && (at < 0 || dist[i] < dist[at])) at = i;
      if (at < 0 || at === goal) break;
      done[at] = true;
      for (let i = 0; i < nodes.length; i++) {
        // ほかの区間の目印へ先回りしない。家の角は迂回に使える。
        if (done[i] || i < stops && i !== goal) continue;
        const d = dist[at] + Math.hypot(nodes[i].x - nodes[at].x, nodes[i].z - nodes[at].z);
        if (d >= dist[i]) continue;
        const key = at * nodes.length + i;
        if (!links[key]) {
          const pass = clear(nodes[at], nodes[i]) ? 1 : -1;
          // 火元から出る道と火元へ戻る道は通行の可否が違う。
          links[key] = pass;
        }
        if (links[key] < 0) continue;
        dist[i] = d; prev[i] = at;
      }
    }
    if (!Number.isFinite(dist[goal])) return null;
    const leg = [];
    for (let i = goal; i !== start; i = prev[i]) leg.push([nodes[i].x, nodes[i].z]);
    route.push(...leg.reverse());
  }
  return route;
}
// 西の川を渡らず東岸を南へ。東の町人は瑞龍寺山の本陣へ登らず、町の外へ抜ける。
const CIVIL_WEST = [[-88, 110], [-90, 142], [-88, 172]];
// 東側も町と南の里の外縁を通る。位置は圧縮地形への推定で、史実の避難路とはしない。
const CIVIL_EAST = [[124, 112], [124, 150], [110, 172]];
// 通常は民家の南面。南を隣家が塞ぐ家は東の脇へ出し、家族が軒の当たりに入らない所へ置く。
// 町や寺の位置と同じく、戸口と退き道の細部は遊びのための推定。
const civilDoor = (i, side = 0) => {
  const [x, z, rot] = HOUSES[i];
  return { x: x + Math.sin(rot + side) * 8, z: z + Math.cos(rot + side) * 8 };
};
const CIVILIAN_BANDS = [
  { x: -62, z: 95, watchAt: { x: -18, z: 70 }, kinds: ['townsman', 'merchant', 'woman', 'child'],
    route: civilRoute([[-78, 100], ...CIVIL_WEST]) },
  // 南西の遠景の里の脇。織田勢の列と家並みから離れて見物する。
  // 女と子は村の戸口に残し、兵や火が迫った時に家から逃がす。
  { x: -64, z: 132, watchAt: { x: -4, z: 86 }, kinds: ['farmer'],
    route: civilRoute([[-80, 146], [-88, 172]]) },
  // 八十、六十の佐久間勢は、軽い大軍の列の外縁まで避けて見物する。
  // 逃げる時も備へ戻らず、南の篝火（六十、百二十付近）と里の家並みを東へ避ける。
  { x: 124, z: 78, watchAt: { x: 34, z: 66 }, kinds: ['townsman', 'merchant', 'woman', 'child'],
    route: civilRoute([[132, 96], ...CIVIL_EAST]) },
  // 南東の里（四十、百四十二）の畑の外。軍の通る中央へ戻らず、家並みの東を南へ逃げる。
  { x: 84, z: 150, watchAt: { x: 44, z: 78 }, kinds: ['farmer', 'elder'],
    route: civilRoute([[96, 156], [110, 172]]) },
  // 寺の正面は北の美濃三人衆に近い。備の幅も避けて南西の道端で見物し、川の東岸を南へ逃げる。
  { x: TERA.x - 30, z: TERA.z + 44, watchAt: { x: -18, z: 70 }, kinds: ['monk', 'monk'],
    route: civilRoute([[-94, 96], ...CIVIL_WEST]) },
  // 堂に残る僧と里の者。南の戸口から出て、北の備・東の町の乱戦を避けて川沿いへ退く。
  // 堂の当たり（奥行きに縁側を含めて九・四）より外に置く。避難路は地形に合わせた推定。
  { x: TERA.x, z: TERA.z + 7, mode: 'inside', kinds: ['monk', 'woman', 'elder'],
    route: civilRoute([[-58, 70], [-62, 95], [-78, 100], ...CIVIL_WEST]) },
  // 戸口にいる者は、兵や火が近づくまで家に籠もる。
  // 火付け候補の五軒すべてに住人を置く。既存の共用描画と四十四人の上限内で扱う。
  { ...civilDoor(0), mode: 'inside', kinds: ['woman', 'child'],
    // 西へ抜けると南隣の家の火から六歩まで寄る。家の東を回り、南東の退き口へ。
    route: civilRoute([[38, 96], [54, 98], [84, 98], [112, 98], [132, 96], ...CIVIL_EAST]) },
  { ...civilDoor(1), mode: 'inside', kinds: ['merchant', 'elder'],
    // 西隣と南隣の家の間を抜け、南北の軍の往来を外れる。
    // 南の家（負四、八十六）の延焼からも十歩を空けて路地へ出る。
    route: civilRoute([[-8, 76], [-22, 84], [-22, 104], [-62, 110], ...CIVIL_WEST]) },
  { ...civilDoor(3), mode: 'inside', kinds: ['townsman', 'woman'],
    // 大手へ戻らず、寺の南と西の乱戦の外をたどる。
    route: civilRoute([[-24, 54], [-44, 62], [-48, 90], [-62, 110], ...CIVIL_WEST]) },
  { ...civilDoor(4), mode: 'inside', kinds: ['woman', 'child'],
    // 東の乱戦の南へ退き、二つの焚き火より北を回って町の東へ。
    route: civilRoute([[54, 98], [84, 98], [112, 98], [132, 96], ...CIVIL_EAST]) },
  { ...civilDoor(5), mode: 'inside', kinds: ['townsman', 'woman', 'child', 'elder'],
    // 西の町外れの乱戦へ入らず、家の南から川の東岸へ回る。
    route: civilRoute([[-22, 84], [-22, 104], [-62, 110], ...CIVIL_WEST]) },
  { ...civilDoor(2), mode: 'inside', kinds: ['merchant', 'townsman', 'woman', 'child'],
    // 北の六十二、二十八には包囲後も乱戦が残る。麓へ戻らず、町の東脇を南へ退く。
    // 四十四、七十八の家の火から十歩以上離れ、既存の南の脇道へ合流する推定の退き道。
    // 火元の戸口から北東へ切り返さず、まず東へ離れてから南へ向く。
    route: civilRoute([[54, 64], [56, 98], [84, 98], [112, 98], [132, 96], ...CIVIL_EAST]) },
  // 南端の二軒にも家の者を残す。見物人の二人分を振り替え、全体は四十四人以内。
  // 町の中央にいる藤吉郎の手へ寄らず、西へ抜けて里の家並みの外を南下する。
  { ...civilDoor(8), mode: 'inside', kinds: ['woman', 'child'],
    route: civilRoute([[-14, 98], [-22, 104], [-62, 110], ...CIVIL_WEST]) },
  { ...civilDoor(9), mode: 'inside', kinds: ['merchant', 'elder'],
    route: civilRoute([[-8, 112], [-22, 114], [-62, 110], ...CIVIL_WEST]) },
  // 見物の四人を北端の二軒へ振り分け、民の総数は四十四人のまま。十軒とも住人を残す。
  { ...civilDoor(6), mode: 'inside', kinds: ['woman', 'child'],
    // 大手の坂へ登らず、西隣の家と南の家の間を通って寺の南へ抜ける。
    // 負十八、七十の家が燃えても、北を回ってから西の脇へ出られる道幅を残す。
    route: civilRoute([[8, 50], [-18, 58], [-32, 56], [-34, 74], [-48, 90], [-62, 110], ...CIVIL_WEST]) },
  { ...civilDoor(7, Math.PI / 2), mode: 'inside', kinds: ['townsman', 'elder'],
    // 南面は三十八、五十四の家が塞ぐため東の脇から出る。年寄りを麓の乱戦へ戻さない。
    route: civilRoute([[54, 56], [56, 98], [84, 98], [112, 98], [132, 96], ...CIVIL_EAST]) },
];
const MINE = 5;
const NEED = 3;                            // 自分で火を放つ数
const HOUSE_FIRE_R = 4.5;
// 戸口の足場から届く家を一軒だけ選ぶ。体や視点の向き、長押しは問わない。
function nearFireHouse(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  if (rt.G.lord || rt.over || F.ending || F.step !== 1 || F.lit >= NEED || !rt.player.u.alive) return null;
  let best = null, distance = HOUSE_FIRE_R;
  for (const h of F.houses) {
    if (!h.mine || h.burnt) continue;
    const d = Math.hypot(h.approach.x - p.x, h.approach.z - p.z);
    if (d <= distance) { best = h; distance = d; }
  }
  return best;
}
// 翌日の鹿垣：町の北の端（山の麓。z 26 から北は金華山の斜面）に東西に結う。三か所は打って出る口
const SHIKA_Z = 33, SHIKA_X0 = -34, SHIKA_W = 8.5, SHIKA_GAPS = [1, 3, 5];
// 鹿垣は丸太に竹と柴を結う。形・材質を共用し、一間を四つのまとめ描画で返す。
const SHIKA_GEO = new THREE.CylinderGeometry(1, 1, 1, 6);
const SHIKA_ROPE_GEO = new THREE.TorusGeometry(0.17, 0.025, 4, 8);
const SHIKA_EDGE_DARK = new THREE.MeshBasicMaterial({ color: 0x14120f });
const SHIKA_EDGE_GOLD = new THREE.MeshBasicMaterial({ color: 0xffedb0 });
const SHIKA_MAT = new THREE.MeshStandardMaterial({ color: 0x786047, map: barkTex('pine'), roughness: 1 });
function shikaWall(W, seg) {
  const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az);
  const tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz, nz = tx;
  const g = new THREE.Group(), logs = [], canes = [], ties = [], knots = [], edgeDark = [], edgeGold = [];
  const point = (u, h, off = 0) => {
    const x = ax + tx * u + nx * off, z = az + tz * u + nz * off;
    return new THREE.Vector3(x, W.heightAt(x, z) + h, z);
  };
  const beam = (list, a, b, r) => {
    const o = new THREE.Object3D(), d = b.clone().sub(a);
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    o.scale.set(r, d.length(), r); o.updateMatrix(); list.push(o.matrix);
  };
  // 守るさくの上辺と両端だけを二重の太い縁で囲む。出入口はふさがない。
  for (const [list, radius] of [[edgeDark, .12], [edgeGold, .065]]) {
    beam(list, point(0, 1.65), point(len, 1.65), radius);
    for (const u of [0, len]) beam(list, point(u, .08), point(u, 1.65), radius);
  }
  const n = Math.ceil(len / 1.7);
  for (let i = 0; i <= n; i++) {
    const u = len * i / n;
    beam(logs, point(u, -0.18), point(u, 1.55 + Math.sin(i * 3) * 0.08), 0.13);
    beam(logs, point(u, 0.05, 0.85), point(u, 1.12), 0.065);
    for (const h of [0.42, 0.92, 1.25]) {
      const o = new THREE.Object3D(); o.position.copy(point(u, h));
      o.rotation.x = Math.PI / 2; o.updateMatrix(); ties.push(o.matrix);
      // 結び目と短い縄の端。
      beam(knots, point(u, h + 0.04, 0.18), point(u + 0.07, h - 0.06, 0.2), 0.045);
      beam(knots, point(u + 0.03, h - 0.03, 0.2), point(u + 0.07, h - 0.17, 0.2), 0.025);
    }
  }
  for (let i = 0; i < Math.ceil(len / 0.32); i++) {
    const u = i * 0.32, side = i % 2 ? 1 : -1;
    const top = Math.max(0, Math.min(len, u + side * 0.72));
    beam(canes, point(u, -0.08, 0.1), point(top, 1.35 + Math.sin(i * 2) * 0.12, 0.14), 0.055);
    // 柴を竹の裏へ重ね、枝先を横へ広げる。地面から生やして額縁にしない。
    beam(logs, point(u, -0.12, -0.1), point(top, 1.25, -0.14), 0.035);
    for (const h of [0.48, 0.88]) {
      const mid = u + (top - u) * h / 1.35;
      beam(logs, point(mid, h, -0.12), point(Math.max(0, Math.min(len, mid - side * 0.4)), h + 0.3, -0.16), 0.022);
    }
  }
  for (const [list, geo, mat] of [[logs, SHIKA_GEO, SHIKA_MAT], [canes, SHIKA_GEO, TAKE_MAT.cane], [ties, SHIKA_ROPE_GEO, TAKE_MAT.rope], [knots, SHIKA_GEO, TAKE_MAT.rope], [edgeDark, SHIKA_GEO, SHIKA_EDGE_DARK], [edgeGold, SHIKA_GEO, SHIKA_EDGE_GOLD]]) {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    for (let i = 0; i < list.length; i++) m.setMatrixAt(i, list[i]);
    m.castShadow = m.receiveShadow = true; m.userData.camBlock = true;
    if (mat === SHIKA_EDGE_GOLD) { m.position.x += nx * .085; m.position.z += nz * .085; }
    g.add(m);
  }
  const flag = nobori(W, (ax + bx) / 2, (az + bz) / 2, 'oda', 3.4);
  g.add(flag);
  return g;
}
// 搦手へ移る時は、実際に歩く最初の道の内へ二列で置く。
// 町と同じ横並びで西へずらすと、十歩先の仲間が四十歩も高い切岸へ出る。
const KARA_FOOT = { x: KARA_TRAIL[0][0], z: KARA_TRAIL[0][1] };
function placeKaraGroup(rt, g, front) {
  g.formation = 'column'; g.colW = 2; g.facing = 0; g._face = 0;
  placeGroup(rt, g, KARA_FOOT.x, KARA_FOOT.z + front);
  for (const u of g.units) {
    if (!u.alive || u.gone || u.fleeing || u.woundOut || u.rearWound) continue;
    // 山の細道は徒歩の二人列。町の騎馬を持ち込み、馬腹で道を塞がない。
    if (u.mounted) rt.army.setMounted(u, false);
    u.pos.x = Math.max(KARA_FOOT.x - 1.6, Math.min(KARA_FOOT.x + 1.6, u.pos.x));
    u.pos.z = Math.max(KARA_FOOT.z + 1, Math.min(KARA_TRAIL[1][1] - 1, u.pos.z));
    u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
    u.heading = 0; u.mesh.position.copy(u.pos); u.mesh.rotation.y = 0;
  }
}
// 短い暗転（場面の移り。動きを減らす設定では、すぐ切り替える）
function blackCut(rt, mid, text) {
  const still = reduceMotion();
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;inset:0;background:#000;color:#ece4d2;display:grid;place-items:center;padding:24px;box-sizing:border-box;text-align:center;font-size:24px;line-height:1.6;white-space:pre-line;opacity:0;pointer-events:none;z-index:1;transition:opacity ${still ? 0 : 0.6}s`;
  // 真っ暗な故障や夜と取り違えないよう、移る時と行き先を幕に書く。
  d.textContent = text;
  d.setAttribute('role', 'status');
  document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.opacity = '1'; });
  setTimeout(() => d.remove(), 6000);   // 戦が先に終わっても黒い幕を残さない
  rt.after(still ? 0.1 : 0.8, () => { mid(); d.style.opacity = '0'; rt.after(1.2, () => d.remove()); });
}

const ODA = { flag: 'oda' };

// 夜明けの色（鳶ヶ巣山砦夜襲・強右衛門と同じ作り）。のちに setTime('morning') で朝へ移ろう
const DAWN = { sky: 0x7e7a88, fog: 0x6e6c7a, sun: 0xffbe86, sunI: 1.05, hs: 0xa4a0b4, hg: 0x362e26, hI: 1.0, top: 0x46506c, glow: 0.24, dir: [1, 0.08, 0.3], mount: 0x262624 };
// env：空の映り込み（PMREM）を作り直すか。重いので、少しずつ移ろう間は false にし、最後に一度だけ作る
export function applyLook(rt, L, env = true) {
  const W = rt.world;
  // 同じ時間帯なら空の映り込みを作り直さない。夜は遠景の見通しも夜にそろえる。
  const time = L.time || (L === NIGHT ? 'night' : 'dusk');
  if (W.timeKey !== time) W.setTime(time);
  // 戦の途中で呼ぶと setTime が夕暮れへの移ろいを始めて、下の色を上書きしてしまうので止める
  W.fade = null;
  // 夜の色を渡した時は、画質「低」でも月明かりが見えるよう描画側へ知らせる。
  W.lookDark = time === 'night';
  W.scene.background.set(L.sky);
  W.scene.fog.color.set(L.fog);
  W.sun.color.set(L.sun); W.sun.intensity = L.sunI;
  W.hemi.color.set(L.hs); W.hemi.groundColor.set(L.hg); W.hemi.intensity = L.hI; W.baseHemi = L.hI;
  W.sunOffset.set(...L.dir).normalize().multiplyScalar(120);
  const U = W.skyMat.uniforms;
  U.top.value.set(L.top); U.bottom.value.set(L.fog);
  U.sunDir.value.set(...L.dir).normalize(); U.sunCol.value.set(L.sun);
  U.glowK.value = L.glow; U.cover.value = 0.35;
  W.mountMats.forEach((m, k) => { const far = m.color.clone().set(L.mount); m.color.set(L.fog).lerp(far, [0.78, 0.52, 0.3][k]); });
  if (env) W.updateEnv();
}

// 夜の色（箕作城の夜攻め・本能寺で使う）
export const NIGHT = { sky: 0x2a3446, fog: 0x283244, sun: 0x9eb0d0, sunI: 0.7, hs: 0x8494b4, hg: 0x2a2a2c, hI: 1.25, top: 0x151c2e, glow: 0.05, dir: [0.8, 0.16, -0.4], mount: 0x13171e };
export { DAWN };

// textures.js に無い家の紋・字の旗：flagTexture の無地の布に、ここで描き足す（一度だけ。兵の指物・幟・遠くの大軍が同じ布を使う）
// draw(g) は 128×256 の布の上に描く（紋の真ん中はおよそ (64, 82)、半径 43）。すでに紋が描かれている布なら何もしない
export function customFlag(key, draw, bg) {
  const t = flagTexture(key);
  if (t.userData.custom) return t;
  t.userData.custom = true;
  const g = t.image.getContext('2d');
  // 布の絵は 128×256 で描いた頃の座標で描く（今の布が倍の細かさなら、その分だけ拡げる）
  const k = (t.image.width || 128) / 128;
  const d = g.getImageData(24 * k, 40 * k, 80 * k, 84 * k).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 16 * k * k) if (d[i] + d[i + 1] + d[i + 2] < 240) ink++;
  if (ink > 40) return t;
  if (bg) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = bg; g.fillRect(0, 0, 128 * k, 256 * k); g.restore(); }
  g.save(); g.scale(k, k); g.fillStyle = g.strokeStyle = '#17130f'; draw(g); g.restore();
  t.needsUpdate = true;
  return t;
}
// 縦書きの字（字の旗）
export function flagColumn(g, text, x, y0, y1, size) {
  g.font = `bold ${Math.round(size)}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const cs = [...text], step = (y1 - y0) / cs.length;
  cs.forEach((ch, i) => { g.globalAlpha = 0.35; g.fillText(ch, x + 0.8, y0 + step * (i + 0.5) + 0.6); g.globalAlpha = 1; g.fillText(ch, x, y0 + step * (i + 0.5)); });
}
export const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
export const gone = (g) => !g || g.count === 0 || g.routed;
// 自分の組が大きいほど、敵を厚くする（組の人数の k 倍を足す）
export const more = (rt, k = 0.5) => Math.round((RANKS[rt.G.rank].squad || 0) * k);
// 味方の鉄砲の一斉射：敵の隊が鉄砲の組へ寄せた所で一度だけ「放て」。当たった隊の士気を落として崩れやすくする
// o = { guns: () => 組, foes: () => [隊], r: 寄せの距離, who, line, sub, drop: 士気の落ち }。update で毎コマ呼ぶ
export function volleyWatch(rt, key, o) {
  const F = rt.flags, k = 'vw_' + key;
  if (F[k]) return;
  const g = o.guns && o.guns();
  if (gone(g)) return;
  const c = g.center(), r = o.r || 30;
  const near = (o.foes() || []).filter((q) => { if (gone(q)) return false; const d = q.center(); return Math.hypot(d.x - c.x, d.z - c.z) < r; });
  if (!near.length) return;
  F[k] = true;
  g.fire = true;
  rt.say(o.who || '鉄砲頭', o.line || '引きつけた……放て！', 2.5);
  rt.banner('放て！', o.sub || '鉄砲の一斉射');
  sfx('volley', 1);
  rt.after(1.4, () => {
    for (const q of near) if (!gone(q)) { q.morale = Math.max(0, q.morale - (o.drop || 30)); }
    rt.bark('敵の前が崩れた。今こそ突け', false);
  });
}

function proceduralBase(x, z) {
  let h = 0.6 * Math.sin(x * 0.031 + 0.4) * Math.cos(z * 0.027) + 0.3 * Math.sin(z * 0.07 + x * 0.02);
  // 金華山：本丸の峰と、西の肩（搦手の道が通る）
  h += 44 * gauss(x, z, HON.x, HON.z - 4, 2600) + 14 * gauss(x, z, -40, -130, 1800) + 20 * gauss(x, z, 40, -150, 2600);
  // 瑞龍寺山
  h += 20 * gauss(x, z, ZUI.x, ZUI.z, 1500);
  // 北と西の山並み
  h += Math.max(0, -z - 170) * 0.3 + Math.max(0, x - 150) * 0.2;
  // 西は長良川の川べりへ下がる
  if (x < -90) h -= Math.min(3, (-90 - x) * 0.08);
  return h;
}
// 地形の下地は差し替えられる形にしておく（国土地理院の標高などに替える係のための口）。
// 既定は上の proceduralBase。setInabayamaBase(fn) を呼べば、以後の height() がそちらを使う
let baseOverride = null;
export function setInabayamaBase(fn) { baseOverride = fn; CASTLE_HEIGHT = null; BENCHED = null; LIFT.rise = null; }
const DEM_DETAIL = { xy: 1.5, ox: HON.x, oz: HON.z, win: 40, scale: 0.3 };
function base(x, z) {
  const b = (baseOverride || proceduralBase)(x, z);
  // 実測の尾根・谷の凹凸だけを足す（DEM の原点＝本丸に合わせる。前は原点がずれて、道の途中に山頂が出ていた）
  return DEM ? b + demDetail(DEM, x, z, DEM_DETAIL) : b;
}

// 城の縄張り（曲輪）は castles/inabayama.js（docs/castle-design.md 6章・siege-plan 7章「稲葉山」）。
// 七曲りの大手道・竪堀・搦手の腰曲輪の段を、そこの INABAYAMA_PLAN に持つ。level は base() から取る
// ＝下地を差し替えても段が追随する。ここでは、その縄張りに合わせて高さの関数を作るだけ
let CASTLE_HEIGHT = null;
const CLEAR_BOUNDS = INABAYAMA_PLAN.kuruwa.map((k) => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of k.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { x0: x0 - 2, x1: x1 + 2, z0: z0 - 2, z1: z1 + 2, poly: k.poly };
});
function height(x, z) {
  if (!CASTLE_HEIGHT) {
    // 山を持ち上げてから平場を切る。曲輪の床と土塁が斜めにならない。
    const ditches = INABAYAMA_PLAN.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep, width: h.w, closed: h.closed }));
    const withHori = (px, pz) => {
      let h = liftedBase(px, pz);
      for (const f of ditches) h += f(px, pz);
      return h;
    };
    CASTLE_HEIGHT = heightOf(INABAYAMA_PLAN, withHori, 5);
  }
  if (!BENCHED) BENCHED = gradeTownHomes(gradeCastleHomes(gradeInabayamaRoads(CASTLE_HEIGHT)));
  return BENCHED(x, z);
}
// 家の床下だけを地面へつなぐ。町全体や山道は均さず、庭の外へ滑らかに戻す。
// 回転と床の高さは初回だけ求める。歩く地面にも描く地面にも同じ高さを渡す。
function gradeTownHomes(terrain) {
  const pads = HOUSES.map(([x, z, r], i) => ({ x, z, c: Math.cos(r), s: Math.sin(r),
    w: (6 + i % 3) / 2 + 1.6, d: 4.5 / 2 + 1.6, y: terrain(x, z) }));
  return (x, z) => {
    const original = terrain(x, z);
    if (z < 28 || z > 108 || x < -28 || x > 54) return original;
    let blend = 1, change = 0;
    for (const p of pads) {
      const dx = x - p.x, dz = z - p.z;
      const edge = Math.max(Math.abs(dx * p.c - dz * p.s) - p.w,
        Math.abs(dx * p.s + dz * p.c) - p.d);
      if (edge >= 3.5) continue;
      if (edge <= 0) return p.y;
      const t = edge / 3.5, weight = 1 - t * t * (3 - 2 * t);
      const influence = weight / Math.max(0.000001, 1 - weight);
      blend += influence; change += (p.y - original) * influence;
    }
    return original + change / blend;
  };
}
let BENCHED = null;
// 裏道を均した後に、建物の床下を水平へ戻す。曲輪全体は削り直さず、
// 主殿・遠侍・蔵・長屋・番所の柱と戸口だけを支える。
function gradeCastleHomes(terrain) {
  const pads = [
    [HON.x + 2, HON.z - 6, 11, 6.5],
    [HON.x + 12, HON.z + 6, 7, 5],
    [HON.x - 12, HON.z - 9, 5, 4],
    [HON.x - 6, HON.z + 10, 9, 4],
    [NI.x - 5, NI.z + 2, 5, 4],
  ].map(([x, z, w, d]) => ({ x, z, w: w / 2 + 1.4, d: d / 2 + 1.4, y: terrain(x, z) }));
  return (x, z) => {
    const original = terrain(x, z);
    if (z < HON.z - 16 || z > NI.z + 9 || x < NI.x - 12 || x > HON.x + 20) return original;
    // 歩く肩を盛ると、木戸の直前に登れない段ができる。道の外でだけ均す。
    const distance = karaSample(x, z).d;
    if (distance <= KARA_SHOULDER) return original;
    const fade = Math.min(1, (distance - KARA_SHOULDER) / 1.4);
    const roadWeight = fade * fade * (3 - 2 * fade);
    let blend = 1, change = 0;
    for (const p of pads) {
      const edge = Math.max(Math.abs(x - p.x) - p.w, Math.abs(z - p.z) - p.d);
      if (edge >= 2.5) continue;
      if (edge <= 0 && roadWeight === 1) return p.y;
      const t = Math.max(0, edge / 2.5), weight = (1 - t * t * (3 - 2 * t)) * roadWeight;
      const influence = weight / Math.max(0.000001, 1 - weight);
      blend += influence; change += (p.y - original) * influence;
    }
    return original + change / blend;
  };
}
// 金華山の比高約300mを縮めない。山麓館を基準に、本丸の下地との差を初回だけ求める。
// 高い肩を山頂側へ戻し、裾は従来と同じ z=28 で終える。町・館・川は持ち上げない。
const LIFT = { x: HON.x, z: HON.z, tx: HON.x, tz: -90, w: 68, R: 118, rise: null };
function liftedBase(x, z) {
  if (LIFT.rise == null) LIFT.rise = 300 + base(YAKATA.x, YAKATA.z) - base(HON.x, HON.z);
  let lift = yamaLift(x, z, LIFT);
  if (lift > 0) {
    const r = lift / LIFT.rise;
    // 裾は町へ向かって緩く寝かせる（一直線の崖の壁にしない）。裾の長さを東西で揺らし、尾根と谷の出入りを付ける
    const toe = 0.15 * (0.75 + 0.3 * Math.sin(x * 0.043 + 0.7) + 0.15 * Math.sin(x * 0.11 + 2.1));
    if (r < toe) { const k = r / toe; lift *= k * k * (3 - 2 * k); }
    // 中腹の山肌に、上から下へ走る小さな尾根と沢（平らな板の斜面にしない）
    lift += LIFT.rise * 0.03 * Math.sin(x * 0.09 + z * 0.025) * Math.sin(Math.PI * Math.min(1, r * 1.6));
  }
  return base(x, z) + lift;
}

// 焼けた家：屋根を焦がし、炎と煙を上げる
export function burnHouse(rt, h) {
  if (h.burnt) return;
  h.burnt = true;
  const W = rt.world;
  const roof = h.m.children[1];
  if (roof && roof.material) { roof.material = roof.material.clone(); roof.material.color.setRGB(0.18, 0.15, 0.12); }
  // 一軒に炎は一つ（大きめ）。煙の柱は炎が上げる（数を絞って重くしない）
  h.fires = [W.addFire(h.x + 0.6, h.z - 0.4, { h: 1.6, size: 2.2 })];
  rt.army.play('wood', { x: h.x, z: h.z }, 0.8);
  // 燃え続けた家は、屋根から崩れ落ちる（少しずつ傾き、沈み、最後に壁が潰れる）
  rt.after(30 + Math.random() * 25, () => {
    if (h.collapsed) return;
    h.collapsed = true;
    const wall = h.m.children[0], tilt = Math.random() < 0.5 ? -1 : 1;
    for (let i = 1; i <= 14; i++) rt.after(i * 0.07, () => {
      for (const r of [roof, h.m.children[2]]) if (r) { r.position.y -= 0.16; r.rotation.z = tilt * 0.025 * i; r.rotation.x = 0.012 * i; }
      if (wall && i > 8) wall.scale.y = Math.max(0.35, 1 - (i - 8) * 0.11);
    });
    rt.army.play('wood', { x: h.x, z: h.z }, 1.2);
    rt.army.smoke && rt.army.smoke(h.x, W.heightAt(h.x, h.z) + 1, h.z, 0, 0);
  });
}

// 畑の畝だけに使う共用形。民家は共通部品の柱・土壁・茅束をそのまま使う。
const TOWN_BOX = new THREE.BoxGeometry(1, 1, 1);

// 町の道脇に石・浅い水たまり・畑の畝を少数だけ置く。任務の通りと家の前は空ける。
function buildTownGround(rt) {
  const W = rt.world, dummy = new THREE.Object3D();
  // 家を避ける町の往来。開戦前から使われた土道と荷車の二筋を残す。
  const lanes = [[[30, 118], [32, 98], [34, 83], [30, 70], [24, 58], [25, 44], [23, 30]],
    [[-12, 112], [-14, 96], [-14, 83], [-6, 76], [14, 72], [28, 68], [54, 62]],
    [[12, 105], [18, 93], [14, 81], [14, 72], [16, 58], [9, 49], [5, 32]]];
  for (const lane of lanes) {
    W.stampTrail(lane, 3.3, 70);
    for (const offset of [-0.95, 0.95]) W.stampTrail(lane.map(([x, z]) => [x + offset, z]), 0.95, 110);
  }
  // 戸口の庭もまだらに踏み固め、草の均一な敷き詰めを崩す。
  for (const h of rt.flags.houses) {
    W.stampWear(h.x, h.z + 4.2, 4.5, 170);
    W.stampWear(h.x - 2, h.z + 6, 2.8, 110);
  }
  const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ map: stoneTex(), color: 0x9c9685 }), 72);
  for (let i = 0; i < 72; i++) {
    const x = -28 + (i * 17.31 % 84), z = 34 + (i * 11.73 % 80);
    dummy.position.set(x, drawGroundAt(W, x, z) + 0.045, z); dummy.rotation.set(0.2 * Math.sin(i), i, 0); dummy.scale.set(0.09 + i % 3 * 0.055, 0.07, 0.14 + i % 4 * 0.035);
    dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
  }
  // 坂に水平な円板を重ねると、青い穴や浮く蓋に見える。
  // 小さな窪みは既存の地面の踏み跡へ混ぜ、別の面を重ねない。
  for (let i = 0; i < 4; i++) {
    const x = 31 + i % 2 * 2, z = 108 - i * 13;
    W.stampWear(x, z, 1.1, 100);
  }
  const ridges = new THREE.InstancedMesh(TOWN_BOX, new THREE.MeshLambertMaterial({ color: 0x776044, map: dirtTex() }), 36);
  for (let i = 0; i < 36; i++) {
    const x = -27 + i % 6 * 0.85, z = 91 + Math.floor(i / 6) * 1.4;
    dummy.position.set(x, W.heightAt(x, z) + 0.08, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(0.38, 0.17, 1.5);
    dummy.updateMatrix(); ridges.setMatrixAt(i, dummy.matrix);
  }
  rt.scene.add(stones, ridges);
}

// 町の焼け跡は、箱を傾けず黒い柱と落ちた梁で示す。形と材質は十軒で共用する。
const CHAR_GEO = new THREE.BoxGeometry(1, 1, 1);
const CHAR_MAT = new THREE.MeshStandardMaterial({ color: 0x211c18, roughness: 1 });
const CHAR_TREE_MATRIX = new THREE.Matrix4(), CHAR_TREE_COLOR = new THREE.Color(0x51443a);
function charTownTrees(W, h) {
  // 火を放った家の近くのみ焼く。既存の幹・枝を残し、形と材質を増やさない。
  for (const mesh of W.treeMeshes || []) {
    const foliage = mesh.userData.treeFoliage || mesh.material.alphaTest > 0;
    let changed = false;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, CHAR_TREE_MATRIX);
      const e = CHAR_TREE_MATRIX.elements;
      if (Math.hypot(e[12] - h.x, e[14] - h.z) > 12) continue;
      if (foliage) {
        for (let j = 0; j < 12; j++) e[j] = 0;
        mesh.setMatrixAt(i, CHAR_TREE_MATRIX);
      } else mesh.setColorAt(i, CHAR_TREE_COLOR);
      changed = true;
    }
    if (changed) {
      if (foliage) mesh.instanceMatrix.needsUpdate = true;
      else mesh.instanceColor.needsUpdate = true;
    }
  }
}
function townRuin(W, h) {
  if (h.ruin) return;
  h.ruin = true; h.collapsed = true;
  for (const c of h.m.children) c.visible = false;
  // 屋根が落ちたら火口も焼けた梁へ下ろす。炎・煙・光の入れ物は使い回す。
  for (const f of h.fires || []) {
    f.size *= 0.65;
    f.base = drawGroundAt(W, f.x, f.z) + 0.2 + f.size * 0.35;
    f.flame.position.y = f.base;
    f.inner.position.y = f.base - f.size * 0.08;
    f.ly = f.base - W.heightAt(f.x, f.z) + f.size * 0.3;
    W.moveSmokeColumn(f.smoke, f.x, f.base + f.size * 0.5, f.z);
  }
  const w = 6 + h.i % 3, d = 4.5;
  const cos = Math.cos(h.m.rotation.y), sin = Math.sin(h.m.rotation.y);
  // 土台の水平面ではなく、回転した家の各部の地面を測る。
  const ground = (x, z) => drawGroundAt(W, h.x + x * cos + z * sin, h.z - x * sin + z * cos) - h.m.position.y;
  const beam = (x, y, z, sx, sy, sz, tilt = 0) => {
    const m = new THREE.Mesh(CHAR_GEO, CHAR_MAT);
    m.userData.camBlock = true;
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.z = tilt;
    h.m.add(m);
  };
  const up = new THREE.Vector3(0, 1, 0), span = new THREE.Vector3();
  const lay = (m, ax, az, bx, bz, width, thick) => {
    const ay = ground(ax, az) + thick / 2, by = ground(bx, bz) + thick / 2;
    span.set(bx - ax, by - ay, bz - az);
    const length = span.length();
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.quaternion.setFromUnitVectors(up, span.divideScalar(length));
    m.scale.set(width, length, thick);
  };
  // 焼け跡を一枚の黒い床で塞がず、落ちた床板の間に地面を残す。
  const boards = new THREE.InstancedMesh(CHAR_GEO, CHAR_MAT, 5), board = new THREE.Object3D();
  for (let i = 0; i < 5; i++) {
    const x = -w * 0.4 + i * w * 0.2, z = (i % 2 ? 1 : -1) * d * 0.1;
    const half = d * (0.52 + i % 3 * 0.12) / 2, lean = (i % 3 - 1) * 0.06;
    lay(board, x - half * lean, z - half, x + half * lean, z + half, 0.22 + i % 2 * 0.08, 0.12);
    board.updateMatrix(); boards.setMatrixAt(i, board.matrix);
  }
  h.m.add(boards);
  let stump = h.i;
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) {
    const foot = ground(x, z), height = 0.55 + (stump++ % 4) * 0.42;
    beam(x, foot + height / 2 - 0.08, z, 0.18, height, 0.18, (stump % 3 - 1) * 0.12);
  }
  // 全戸に同じ門形の梁を残さず、折れた柱と落ちた梁で焼け跡を示す。
  for (const [ax, az, bx, bz, width, thick] of [[-w / 2, d / 3, w / 2, d / 3, 0.22, 0.2], [w / 4, -d / 2, w / 4, d / 2, 0.25, 0.22]]) {
    const m = new THREE.Mesh(CHAR_GEO, CHAR_MAT);
    m.userData.camBlock = true;
    lay(m, ax, az, bx, bz, width, thick); h.m.add(m);
  }
}
function burnTownHouse(rt, h) {
  // 共用の焼け方は替えず、この町だけ箱の倒壊を止める。
  h.collapsed = true;
  burnHouse(rt, h);
  // 軒と屋根の斜面に別々の火口を置く。共通の濃淡のある炎・黒煙・光の枠を使う。
  const W = rt.world, rot = h.m.rotation.y;
  for (const f of h.fires) W.removeFire(f);
  h.fires = [-1, 1].map((side) => {
    const dx = side * (1.6 + h.i % 3 * 0.2), dz = side * 0.6;
    const x = h.x + dx * Math.cos(rot) + dz * Math.sin(rot), z = h.z - dx * Math.sin(rot) + dz * Math.cos(rot);
    return W.addFire(x, z, { h: h.m.position.y - W.heightAt(x, z) + 2.8, size: side < 0 ? 1.4 : 1.7, blackSmoke: true });
  });
  charTownTrees(rt.world, h);
  h.m.userData.townBurning = true;
  for (const f of h.fires) townFlame(rt, f);
  rt.after(35 + h.i * 2, () => { if (!rt.over) townRuin(rt.world, h); });
}
function charHouse(rt, h) {
  for (const f of h.fires || []) rt.world.removeFire(f);
  h.fires = null; h.burnt = true;
  townRuin(rt.world, h);
}

// 火の舌・風・黒煙は共通部品を使い、手持ちの火だけ小さくする。
const TOWN_UNLIT = new THREE.Vector3(0, -10000, 0);
function townFlame(rt, f) {
  const materials = rt.flags.townFlameMaterials;
  if (!materials) return;
  // この戦の二つの材質だけを共用する。板の四辺まで明るい色を残さない。
  const soften = (m) => {
    if (m.material.userData.inabaFlame) return;
    const source = m.material;
    let mat = materials.get(source);
    if (!mat) {
      mat = source.clone(); mat.uniforms = source.uniforms;
      // 色の計算より後で四辺の透明度を落とす。芯や第三の舌にも
      // 同じ縁を使い、接近した軒の火で板の下辺を残さない。
      mat.fragmentShader = mat.fragmentShader.replace('if (a < 0.004) discard;',
        'a *= smoothstep(0.0, 0.18, uv.x) * smoothstep(0.0, 0.18, 1.0 - uv.x) * smoothstep(0.0, 0.18, uv.y) * (1.0 - smoothstep(0.65, 1.0, uv.y));\nif (a < 0.004) discard;');
      mat.userData.inabaFlame = true; materials.set(source, mat);
    }
    m.material = mat;
  };
  f.flame.traverse((m) => { if (m.isMesh) soften(m); });
  soften(f.inner);
  if (f.torch) {
    f.size = 0.4;
    // 一つの松明から横並びの三本の火を出さない。芯と外側の舌は残す。
    for (const m of f.flame.children) m.visible = false;
  }
}

// 高床の柱も含む木部を、この町だけ高さと距離で照らす。元の頂点色と木目を残す。
function townWoodLight(rt, m, x, z) {
  const wood = m.children[0];
  if (!wood?.isMesh) return;
  const mat = wood.material.clone(), prior = wood.material.onBeforeCompile;
  const source = new THREE.Vector3(x + 0.6, rt.world.heightAt(x, z) + 0.15, z - 0.4);
  mat.onBeforeCompile = (sh, renderer) => {
    prior.call(mat, sh, renderer);
    sh.uniforms.uTownSource = { value: source };
    sh.uniforms.uTownLit = { get value() { return m.userData.townBurning ? 1 : 0; } };
    for (let i = 0; i < 3; i++) sh.uniforms['uTownTorch' + i] = {
      get value() {
        const f = rt.flags.townTorchFires?.[i];
        return f && rt.world.fires.includes(f) ? f.glow.position : TOWN_UNLIT;
      },
    };
    sh.vertexShader = 'varying vec3 vTownWood; varying vec3 vTownWorld;\n' + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTownWood = position; vTownWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = `varying vec3 vTownWood; varying vec3 vTownWorld;
      uniform vec3 uTownSource, uTownTorch0, uTownTorch1, uTownTorch2; uniform float uTownLit;
      float townTorchWarmth(vec3 source) {
        vec3 delta = vTownWorld - source;
        return exp(-max(0.0, delta.y) * 0.65) / (1.0 + dot(delta.xz, delta.xz) * 0.5);
      }\n` + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float grain = sin(vTownWood.x * 185.0 + sin(vTownWood.y * 2.3) * 1.8)
        * sin(vTownWood.z * 157.0 + vTownWood.y * 0.8);
      diffuseColor.rgb *= 0.92 + grain * 0.08;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float rise = max(0.0, vTownWorld.y - uTownSource.y);
      float reach = 1.0 / (1.0 + dot(vTownWorld.xz - uTownSource.xz, vTownWorld.xz - uTownSource.xz) * 0.12);
      float torchWarmth = max(townTorchWarmth(uTownTorch0), max(townTorchWarmth(uTownTorch1), townTorchWarmth(uTownTorch2)));
      float warmth = max(uTownLit * reach * exp(-rise * 0.65), torchWarmth * 0.65);
      outgoingLight = mix(outgoingLight, diffuseColor.rgb * vec3(1.7, 1.05, 0.55), warmth * 0.45);
      #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'inabayama-town-wood';
  wood.material = mat;
}

// 松明は火付けの者だけに渡す。柄は全員で共用する。
const TORCH_GEO = new THREE.CylinderGeometry(0.035, 0.045, 0.8, 5);
const TORCH_MAT = new THREE.MeshStandardMaterial({ color: 0x55402c, roughness: 1 });
function townTorches(rt) {
  const units = rt.flags.torchG.units.filter((u) => u.alive);
  // 自分の頭上に炎を重ねない。火付けの行き先は戸口の「火」の印へまとめる。
  const start = rt.world.fires.length, rods = [];
  const flames = carryTorches(rt.world, units, { smoke: true, size: 0.4 });
  const fires = rt.world.fires.slice(start);
  rt.flags.townTorchFires = fires;
  for (const f of fires) townFlame(rt, f);
  for (const u of units) {
    const m = new THREE.Mesh(TORCH_GEO, TORCH_MAT);
    m.position.set(0.35, 1.7, 0); u.mesh.add(m); rods.push(m);
  }
  const tip = new THREE.Vector3(), smokeAt = [];
  return { update() {
    flames.update();
    // 坂や足運びで、補間した地面と兵の根元の高さはずれる。
    // 火口は地面から測らず、実際に描く柄の先へ合わせる。
    for (let i = 0; i < rods.length; i++) {
      const f = fires[i], u = units[i];
      rods[i].visible = u.alive && !u.gone;
      if (!u.alive || u.gone || !f) continue;
      // 胸の横に浮かせず、動いている左手の位置へ柄の握りを合わせる。
      // 人の骨を省く距離では、同じ兵の左腕の先を使う。
      const hand = u.human?.root.visible && u.human.bones.LeftHand;
      const arm = hand || u.armL || u.hand;
      if (arm) {
        arm.updateWorldMatrix(true, false);
        tip.set(0, hand ? -0.04 : arm === u.armL ? -0.5 : 0, 0).applyMatrix4(arm.matrixWorld);
        u.mesh.worldToLocal(tip);
        rods[i].position.copy(tip); rods[i].position.y += 0.28;
      }
      rods[i].updateWorldMatrix(true, false);
      tip.set(0, 0.4, 0).applyMatrix4(rods[i].matrixWorld);
      const x = tip.x - f.x, z = tip.z - f.z, y = tip.y + f.size * 0.3 - f.base;
      f.x = tip.x; f.z = tip.z; f.base += y;
      f.flame.position.x += x; f.flame.position.y += y; f.flame.position.z += z;
      f.inner.position.x += x; f.inner.position.y += y; f.inner.position.z += z;
      if (f.light) { f.light.position.x += x; f.light.position.y += y; f.light.position.z += z; }
      if (f.glow) f.glow.position.set(tip.x, drawGroundAt(rt.world, tip.x, tip.z) + 0.06, tip.z);
      if (f.smoke != null && smokeAt[i] !== f.smokeAt) {
        smokeAt[i] = f.smokeAt;
        rt.world.moveSmokeColumn(f.smoke, tip.x, f.base + f.size * 0.55, tip.z);
      }
    }
  }, stop() {
    rt.flags.townTorchFires = null;
    for (const f of fires) rt.world.removeFire(f);
    for (const m of rods) m.removeFromParent();
  } };
}

// 道の左右だけでなく、段の縁の急な高さの変化もならす。曲輪に入る点は同じ床の高さ。
function gradeInabayamaRoads(terrain) {
  const segments = [];
  KARA_GRADES = [];
  for (const pts of KARA_LEGS) {
    const first = pts[0], last = pts[pts.length - 1];
    const ya = terrain(first[0], first[1]), yb = terrain(last[0], last[1]);
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let walked = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], dx = pts[i][0] - ax, dz = pts[i][1] - az, len = Math.hypot(dx, dz);
      KARA_GRADES.push({ ax, az, dx, dz, len, l2: len * len, ya: ya + (yb - ya) * walked / length, yb: ya + (yb - ya) * (walked + len) / length,
        x0: Math.min(ax, ax + dx) - KARA_BLEND * 2.5, x1: Math.max(ax, ax + dx) + KARA_BLEND * 2.5, z0: Math.min(az, az + dz) - KARA_BLEND * 2.5, z1: Math.max(az, az + dz) + KARA_BLEND * 2.5 });
      walked += len;
    }
  }
  for (const pts of CASTLE_PATHS.filter((p) => p !== KARA)) for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az;
    // 曲輪の縁で分ける。麓から曲輪の中心まで一線で均すと、平場の中まで斜面になる。
    // 交点は初回だけ求め、毎コマは作っておいた区間を読むだけ。
    const cuts = [0, 1];
    for (const k of INABAYAMA_PLAN.kuruwa) for (let j = 0; j < k.poly.length; j++) {
      const a = k.poly[j], b = k.poly[(j + 1) % k.poly.length], ex = b[0] - a[0], ez = b[1] - a[1];
      const cross = dx * ez - dz * ex;
      if (Math.abs(cross) < 0.00001) continue;
      const qx = a[0] - ax, qz = a[1] - az;
      const t = (qx * ez - qz * ex) / cross, u = (qx * dz - qz * dx) / cross;
      if (t > 0 && t < 1 && u >= 0 && u <= 1 && !cuts.some((q) => Math.abs(q - t) < 0.00001)) cuts.push(t);
    }
    cuts.sort((a, b) => a - b);
    for (let j = 0; j + 1 < cuts.length; j++) {
      const x0 = ax + dx * cuts[j], z0 = az + dz * cuts[j], x1 = ax + dx * cuts[j + 1], z1 = az + dz * cuts[j + 1];
      const sx = x1 - x0, sz = z1 - z0;
      // 縁の一点は切岸側と判定されることがある。口は内側の床までつなぎ、段差を残さない。
      const e = 0.01 / (Math.hypot(sx, sz) || 1), ex = sx * e, ez = sz * e;
      const ya = Math.max(terrain(x0, z0), terrain(x0 - ex, z0 - ez), terrain(x0 + ex, z0 + ez));
      const yb = Math.max(terrain(x1, z1), terrain(x1 - ex, z1 - ez), terrain(x1 + ex, z1 + ez));
      segments.push({ ax: x0, az: z0, dx: sx, dz: sz, l2: sx * sx + sz * sz || 1, ya, yb,
        x0: Math.min(x0, x1) - 8.5, x1: Math.max(x0, x1) + 8.5, z0: Math.min(z0, z1) - 8.5, z1: Math.max(z0, z1) + 8.5 });
    }
  }
  return (x, z) => {
    const h = terrain(x, z), trail = karaSample(x, z);
    // 二人の列と避け足が切岸へ出ないよう、左右四・四歩に平らな肩を残す。
    // 携帯の粗い格子でも、道の端の三角形を急な山肌まで引っ張らない。
    if (trail.d <= KARA_SHOULDER) return trail.y;
    // 重なる腰曲輪では高い段が優先される。口の中はその床と土塁の高さを保つ。
    let clearing = false;
    for (const q of CLEAR_BOUNDS) if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && inPoly(q.poly, x, z)) { clearing = true; break; }
    let best = 8.5 * 8.5, road = h;
    if (!clearing) for (const q of segments) {
      // 道から遠い区間は距離の計算を省く。範囲は初回だけ作り、高さと門の段差は変えない。
      if (x < q.x0 || x > q.x1 || z < q.z0 || z > q.z1) continue;
      const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
      const dx = x - q.ax - q.dx * t, dz = z - q.az - q.dz * t, d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; road = q.ya + (q.yb - q.ya) * t; }
    }
    const d = Math.sqrt(best), t = Math.max(0, Math.min(1, (8.5 - d) / 5.7));
    const ground = h + (road - h) * t * t * (3 - 2 * t);
    // 高い山肌へ狭い幅で戻すと、道のすぐ脇が縦の壁になる。外縁まで緩くつなぐ。
    if (trail.d < KARA_BLEND) { const fade = (KARA_BLEND - trail.d) / (KARA_BLEND - KARA_SHOULDER); return ground + (trail.y - ground) * fade * fade * (3 - 2 * fade); }
    return ground;
  };
}

// 急な山肌へ続く手すりは置かない。道の肩の上で両端と途中を支えられる所だけ。
function inabaRailFooting(ground, x, z, dx, dz, span) {
  let previous = ground(x, z);
  if (!Number.isFinite(previous)) return false;
  for (let i = 0; i <= 4; i++) {
    const px = x + dx * span * i / 4, pz = z + dz * span * i / 4;
    const y = ground(px, pz);
    const across = ground(px - dz * .35, pz + dx * .35) - ground(px + dz * .35, pz - dx * .35);
    if (!Number.isFinite(y) || !Number.isFinite(across) || Math.abs(across) > .7
      || i > 0 && Math.abs(y - previous) > span / 4 * .8) return false;
    previous = y;
  }
  return true;
}

// 搦手の山道：土留め・岩の段・根・草・若木を設営時だけまとめ描画で置く。
function buildKaraRoadWorks(rt) {
  const W = rt.world;
  const ground = (x, z) => drawGroundAt(W, x, z);
  const logs = [], posts = [], rails = [], stones = [], roots = [], grass = [], trunks = [], leaves = [];
  for (let i = 0; i + 1 < KARA_TRAIL.length; i++) {
    const [ax, az] = KARA_TRAIL[i], [bx, bz] = KARA_TRAIL[i + 1], L = Math.hypot(bx - ax, bz - az) || 1;
    const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
    for (let d = 2.0; d < L - 1; d += 5.2 + (i % 3) * 0.6) {
      const x = ax + dx * d, z = az + dz * d, ya = W.heightAt(x - dx * 0.6, z - dz * 0.6), yb = W.heightAt(x + dx * 0.6, z + dz * 0.6);
      // 登りの急な所にだけ段を置く（平らな所は踏み固めた土のまま）
      if ((yb - ya) / 1.2 > 0.12) {
        const len = 1.3 + ((i * 7 + Math.round(d)) % 3) * 0.2;
        logs.push({ x, z, rot: Math.atan2(dx, dz) + Math.sin(i + d) * 0.12, len });
      }
    }
    // 道の端に割れた岩と根。歩く中央は空け、草で土の帯の縁を崩す。
    for (let d = 3; d < L - 2; d += 4.1 + (Math.sin(i * 7 + d * 3) + 1) * 1.7) {
      const side = (i + Math.floor(d)) % 2 ? 1 : -1;
      const edge = 2.7 + Math.sin(i * 3 + d) * 0.4;
      const x = ax + dx * d + nx * edge * side, z = az + dz * d + nz * edge * side;
      // 道の内へ大きな丸い蓋を交互に並べない。小さな割れ石を肩へまばらに置く。
      // 根と草の位置は保ち、石だけを歩く中央から遠ざける。
      const sx = x + nx * side * 0.8, sz = z + nz * side * 0.8;
      if (Math.sin(i * 11 + d * 1.9) > -0.25 && inabaRockFooting(W, sx, sz)) {
        stones.push({ x: sx, z: sz, rot: d * 2.3 + i,
          len: 0.28 + (Math.sin(i + d) + 1) * 0.14 });
      }
      const rx = x - dx * 0.9 + nx * 0.9 * side, rz = z - dz * 0.9 + nz * 0.9 * side;
      // 長い一本の根で谷をまたがず、四つの短い節を地面へ沿わせる。
      for (let j = 0; j < 4; j++) {
        const sx = x + (rx - x) * j / 4, sz = z + (rz - z) * j / 4;
        const ex = x + (rx - x) * (j + 1) / 4, ez = z + (rz - z) * (j + 1) / 4;
        roots.push({ x: sx, z: sz, y: ground(sx, sz) + 0.025, rx: ex, rz: ez, ry: ground(ex, ez) + 0.025 });
      }
      for (let k = 0; k < 3; k++) {
        const gx = x + nx * side * (0.4 + k * 0.3) + dx * k * 0.55;
        const gz = z + nz * side * (0.4 + k * 0.3) + dz * k * 0.55;
        grass.push({ x: gx, z: gz, y: ground(gx, gz), rot: d + k, h: 0.35 + k * 0.15 });
      }
      // 二十歩ごとに若木。幹と透ける葉を共用し、道の当たりを増やさない。
      if (Math.floor(d / 4.8) % 4 === 0) {
        const tx = x + nx * side * 4.8, tz = z + nz * side * 4.8, y = ground(tx, tz);
        if (!inabaClearing(tx, tz, 1) && inabaPathDistance(tx, tz) > 3 && inabaRockFooting(W, tx, tz)) {
          trunks.push({ x: tx, z: tz, y, h: 3.5 + i % 2 });
          for (let k = 0; k < 5; k++) leaves.push({ x: tx + Math.sin(k * 2) * 0.65, z: tz + Math.cos(k * 2) * 0.65, y: y + 2.5 + k * 0.28, rot: k * 1.9, h: 1.7 });
        }
      }
    }
    // 平らに均した肩の中を比べても谷側は分からない。肩の外で低い側を拾う。
    // 折り返しでは谷側も反転する。角の通り口には横木を渡さない。
    const midX = (ax + bx) / 2, midZ = (az + bz) / 2;
    const outside = KARA_SHOULDER + 3;
    const valley = ground(midX + nx * outside, midZ + nz * outside) <= ground(midX - nx * outside, midZ - nz * outside) ? 1 : -1;
    let railEndX = Infinity, railEndZ = Infinity;
    for (let d = 3.2; d < L - 3.2; d += 1.9) {
      for (const sd of [valley]) {
        // 歩ける肩の内側に杭を並べない。避け足の余白を保って縁を示す。
        const edge = KARA_SHOULDER - 0.4;
        const x = ax + dx * d + nx * edge * sd, z = az + dz * d + nz * edge * sd;
        const span = Math.min(1.9, L - 3.2 - d), parts = Math.ceil(span / 0.65);
        // ほかの区間の口を横切る横木は置かない。
        if (KARA_GRADES.some((q, j) => {
          if (j === i) return false;
          for (let k = 0; k <= 2; k++) {
            const px = x + dx * span * k / 2, pz = z + dz * span * k / 2;
            const t = Math.max(0, Math.min(1, ((px - q.ax) * q.dx + (pz - q.az) * q.dz) / q.l2));
            if (Math.hypot(px - q.ax - q.dx * t, pz - q.az - q.dz * t) < KARA_SHOULDER + 0.3) return true;
          }
          return false;
        })) continue;
        if (!inabaRailFooting(ground, x, z, dx, dz, span)) continue;
        if (Math.hypot(x - railEndX, z - railEndZ) > .01)
          posts.push({ x, z, y: ground(x, z), h: 0.8 + ((i + Math.round(d)) % 3) * 0.12 });
        // 途切れる所も横木の先を杭で受ける。隣の区間が省かれても宙へ出さない。
        posts.push({ x: x + dx * span, z: z + dz * span, y: ground(x + dx * span, z + dz * span), h: .8 });
        railEndX = x + dx * span; railEndZ = z + dz * span;
        // 描く地面の折れにも沿わせ、手すりだけが谷の上へ浮かないようにする。
        for (let j = 0; j < parts; j++) {
          const x1 = x + dx * span * j / parts, z1 = z + dz * span * j / parts;
          const x2 = x + dx * span * (j + 1) / parts, z2 = z + dz * span * (j + 1) / parts;
          const ya = ground(x1, z1) + 0.55, yb = ground(x2, z2) + 0.55;
          rails.push({ x: (x1 + x2) / 2, z: (z1 + z2) / 2, y: (ya + yb) / 2, rot: Math.atan2(dx, dz), pitch: -Math.atan2(yb - ya, span / parts), len: Math.hypot(span / parts, yb - ya) });
        }
      }
    }
  }
  // 七曲り・百曲りも、急な土の坂にだけ岩の段を混ぜる。裏道と同じ形を共用する。
  for (const path of [ROAD, HYAKU]) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / (len || 1), dz = (b[1] - a[1]) / (len || 1);
    for (let d = 2; d < len - 1; d += 4.8) {
      const side = Math.floor(d) % 2 ? 1 : -1;
      const x = a[0] + dx * d - dz * side * 1.6, z = a[1] + dz * d + dx * side * 1.6;
      if (Math.abs(W.heightAt(x + dx, z + dz) - W.heightAt(x - dx, z - dz)) < 0.3) continue;
      if (Math.sin(i * 11 + d * 1.9) > 0 && inabaRockFooting(W, x, z))
        stones.push({ x, z, rot: Math.atan2(dx, dz) + d, len: 0.38 + 0.12 * Math.sin(d) });
    }
  }
  const mkI = (geo, color, list, place, mat = null) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(geo, mat || new THREE.MeshLambertMaterial({ color }), list.length);
    const o = new THREE.Object3D();
    list.forEach((q, i) => { place(o, q); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false;
    rt.scene.add(m);
  };
  // 両端だけで支えた箱は、地面に中央を切られて黒い蝶形の板になる。
  // 短く区切った丸木を描く面へ沿わせ、上半分を土から出す。設営時に一束へまとめる。
  const logParts = [];
  for (const q of logs) {
    const g = new THREE.CylinderGeometry(0.13, 0.16, q.len, 6, 8);
    g.rotateZ(Math.PI / 2); g.rotateY(q.rot); g.translate(q.x, 0, q.z);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // 表面だけを四センチ出すと平たい黒線に見える。丸い肩まで土から出す。
      p.setY(i, ground(p.getX(i), p.getZ(i)) + p.getY(i) - 0.025);
    }
    // 樹皮の暗い絵を掛けず、削れた木肌を頂点色で残す。
    // 木口も同じ束へ入れ、陰でも真っ黒な横板に見せない。
    logParts.push(paintGeo(g, logParts.length % 3 ? 0x9b805a : 0xb29a73));
  }
  if (logParts.length) {
    const geo = mergeGeometries(logParts); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x5d4a31, emissiveIntensity: 0.35 }));
    mesh.receiveShadow = true; rt.scene.add(mesh);
    for (const g of logParts) g.dispose();
  }
  const postG = new THREE.CylinderGeometry(0.05, 0.07, 1, 5); postG.translate(0, 0.5, 0);
  mkI(postG, 0x6a5640, posts, (o, q) => { o.position.set(q.x, q.y - 0.1, q.z); o.rotation.set(0, 0, 0); o.scale.set(1, q.h + 0.1, 1); });
  const railG = new THREE.BoxGeometry(0.07, 0.07, 1);
  mkI(railG, 0x76603f, rails, (o, q) => { o.position.set(q.x, q.y, q.z); o.rotation.set(q.pitch, q.rot, 0, 'YXZ'); o.scale.set(1, 1, q.len); });
  // 薄い石を水平に置くと、坂の下側へ黒い板が突き出す。
  // 共用の割れた岩を坂へ向け、下縁を描く地面へ埋める。設営時だけ測る。
  const rockG = rockShape(1, false, 1), rockP = rockG.attributes.position;
  const stoneUp = new THREE.Vector3(0, 1, 0), stoneNormal = new THREE.Vector3(), stoneVertex = new THREE.Vector3();
  mkI(rockG, 0xffffff, stones, (o, q) => {
    const gx = ground(q.x + 0.4, q.z) - ground(q.x - 0.4, q.z);
    const gz = ground(q.x, q.z + 0.4) - ground(q.x, q.z - 0.4);
    stoneNormal.set(-gx, 0.8, -gz).normalize();
    o.position.set(q.x, drawGroundAt(W, q.x, q.z), q.z);
    o.quaternion.setFromUnitVectors(stoneUp, stoneNormal); o.rotateY(q.rot);
    // 幅と厚みを一緒に変え、同じ楕円の天板を繰り返さない。
    o.scale.set(q.len, q.len * (0.8 + Math.sin(q.rot) * 0.15), q.len * (0.75 + Math.cos(q.rot) * 0.15)); o.updateMatrix();
    let buried = o.position.y;
    for (let i = 0; i < rockP.count; i++) {
      stoneVertex.fromBufferAttribute(rockP, i).applyMatrix4(o.matrix);
      // 回転前に上側だった縁も、谷側へ下がれば地面で受ける。
      if (rockP.getY(i) > 0.05 && stoneVertex.y > o.position.y + 0.05) continue;
      const ground = drawGroundAt(W, stoneVertex.x, stoneVertex.z);
      if (Number.isFinite(ground)) buried = Math.min(buried, ground - (stoneVertex.y - o.position.y) - 0.06);
    }
    o.position.y = buried;
  }, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x40392e, emissiveIntensity: 0.35 }));
  const up = new THREE.Vector3(0, 1, 0), end = new THREE.Vector3();
  mkI(new THREE.CylinderGeometry(0.035, 0.09, 1, 5), 0x77634c, roots, (o, q) => {
    end.set(q.rx - q.x, q.ry - q.y, q.rz - q.z); const len = end.length();
    o.position.set((q.x + q.rx) / 2, (q.y + q.ry) / 2, (q.z + q.rz) / 2);
    o.quaternion.setFromUnitVectors(up, end.normalize()); o.scale.set(1, len, 1);
  });
  const grassG = rockTuftShape(true);
  mkI(grassG, 0x687342, grass, (o, q) => { o.position.set(q.x, q.y - 0.02, q.z); o.rotation.set(0, q.rot, 0); o.scale.set(1, q.h * 2, 1); }, new THREE.MeshLambertMaterial({ color: 0x82905c, emissive: 0x39432a, emissiveIntensity: 0.3, side: THREE.DoubleSide }));
  mkI(new THREE.CylinderGeometry(0.06, 0.13, 1, 5), 0x79634c, trunks, (o, q) => { o.position.set(q.x, q.y + q.h / 2, q.z); o.rotation.set(0, 0, 0.08); o.scale.set(1, q.h, 1); });
  mkI(new THREE.PlaneGeometry(1, 1), 0xffffff, leaves, (o, q) => { o.position.set(q.x, q.y, q.z); o.rotation.set(0.25, q.rot, 0.15); o.scale.set(q.h, q.h, 1); }, new THREE.MeshLambertMaterial({ map: leafTex('broad'), color: 0x829569, emissive: 0x52613d, emissiveIntensity: 0.35, alphaTest: 0.45, side: THREE.DoubleSide }));

}

// 虎口の石段。段の上面を歩く高さにも登録し、形と材質を一つずつ使い回す。
function buildInabayamaSteps(rt) {
  const W = rt.world, runs = [
    [[-26, -114], [-20, -114]],
    [[KARA[3][0] + (NI.x - KARA[3][0]) * 0.48, KARA[3][1] + (NI.z - KARA[3][1]) * 0.48], [KARA[3][0] + (NI.x - KARA[3][0]) * 0.8, KARA[3][1] + (NI.z - KARA[3][1]) * 0.8]],
    [[DEMARU.x, DEMARU.z - 14], [DEMARU.x, DEMARU.z - 6]],
  ];
  const steps = [];
  for (const [a, b] of runs) {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), n = Math.max(4, Math.ceil(len / 0.45));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const ax = a[0] + dx * t0, az = a[1] + dz * t0, bx = a[0] + dx * t1, bz = a[1] + dz * t1;
      const y = Math.max(W.heightAt(ax, az), W.heightAt(bx, bz)) + 0.08;
      addRamp({ ax, az, bx, bz, w: 3.4, ya: y, yb: y, step: true });
      steps.push({ x: (ax + bx) / 2, z: (az + bz) / 2, y, len: len / n, rot: Math.atan2(dx, dz) });
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x827f70 }), steps.length);
  const dummy = new THREE.Object3D();
  steps.forEach((q, i) => {
    dummy.position.set(q.x, q.y - 0.12, q.z); dummy.rotation.set(0, q.rot, 0); dummy.scale.set(3.4, 0.24, q.len);
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  rt.scene.add(mesh);
}

// 瑞龍寺山の本陣・大手と裏手の寄せ。曲輪ごとの将と人数は確かな図がなく推定。
const INABAYAMA_JIN = [
  battleJin('山麓の囲み', 0, ZUI, Math.PI, [
    ['ibNobu', '本陣', '織田信長', 3000, ZUI.x, ZUI.z, 'odaCamp', 'eiraku', 'oda'],
    ['ibKino', '裏手の仕寄り', '木下藤吉郎', 1500, 28, 104, 'kino', 'oda'],
    ['ibShiba', '大手の仕寄り', '柴田勝家', 2000, 52, 96, 'shiba', 'oda', 'kari'],
    ['ibNiwa', '大手の控え', '丹羽長秀', 1500, 8, 116, 'niwa', 'oda', 'sujikai'],
    ['ibMori', '大手左の囲み', '森可成', 1200, -40, 8, 'oteYose1', 'oda', 'tsuru'],
    ['ibSakai', '大手右の囲み', '坂井政尚', 1000, 40, 4, 'oteYose2', 'eiraku', 'oda'],
    ['ibSaku', '南の控え', '佐久間信盛', 1500, 80, 60, 'sakuma', 'oda'],
    ['ibIkeda', '東の囲み', '池田恒興', 1000, 70, -86, 'ikeda', 'oda', 'ageha'],
    ['ibMino', '西の囲み', '稲葉一鉄・氏家卜全・安藤守就', 2300, -64, 40, 'sannin', 'inaba'],
  ], '織田一万五千を仮の総数とする。長期の付城は断定せず山麓の陣とする。'),
  battleJin('曲輪の守り', 1, HON, 0, [
    ['ibHineno', '大手の曲輪', '日根野弘就', 1000, OTE.x, OTE.z - 6, 'ote', 'saito'],
    ['ibNagai', '百曲りの守り', '長井道利', 800, 22, -92, 'hyakuB', 'saito'],
    ['ibWater', '水の手の曲輪', '名は伝わらない', 400, -60, -84, 'koshiB', 'saito'],
    ['ibNi', '二の丸', '名は伝わらない', 600, NI.x, NI.z - 2, 'niB', 'saito'],
    ['ibTatsu', '本陣', '斎藤龍興', 1200, HON.x + 2, HON.z - 4, 'keep', 'saito'],
  ], '城兵四千を仮の総数とする。守り所への将の割り振りは復元。'),
];

// 腰曲輪と厩は、板で塞いだ主郭と違う透いた丸太柵。地面の段・口・当たりは縄張りと共通。
// 五角の丸太と二段の横木を城の共通の束へまとめる。生成は設営時だけ。
function inabaOpenFence(W, seg, o = {}) {
  const [ax, az, bx, bz] = seg, length = Math.hypot(bx - ax, bz - az);
  if (length < .01) return new THREE.Group();
  const parts = [], up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const timber = new THREE.CylinderGeometry(.85, 1, 1, 5), turn = new THREE.Quaternion();
  const point = new THREE.ConeGeometry(.081, .28, 5);
  const binding = new THREE.CylinderGeometry(.13, .13, .11, 5, 1, true);
  const log = (x0, y0, z0, x1, y1, z1, radius, color) => {
    direction.set(x1 - x0, y1 - y0, z1 - z0);
    const g = timber.clone(); g.scale(radius, direction.length(), radius);
    g.applyQuaternion(turn.setFromUnitVectors(up, direction.normalize()));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    parts.push(paintGeo(g, color));
  };
  const n = Math.max(1, Math.ceil(length / .65)), tx = (bx - ax) / length, tz = (bz - az) / length;
  for (let i = 0; i <= n; i++) {
    const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, y = W.heightAt(x, z);
    const h = 1.95 + .12 * Math.sin(x * 2.1 + z * 1.7);
    // 先を削った乱杭。尖りを含む全高は従来のまま、下の木肌は湿った灰茶へ落とす。
    log(x, y - .22, z, x + .035, y + h - .28, z, .095, i % 3 ? 0x756653 : 0x95836a);
    const post = parts[parts.length - 1], colors = post.attributes.color, vertices = post.attributes.position;
    for (let j = 0; j < vertices.count; j++) {
      const damp = Math.max(0, 1 - (vertices.getY(j) - y) / .6) * .28;
      colors.setXYZ(j, colors.getX(j) * (1 - damp), colors.getY(j) * (1 - damp * .9), colors.getZ(j) * (1 - damp));
    }
    const tip = point.clone(); tip.translate(x + .035, y + h - .14, z);
    parts.push(paintGeo(tip, i % 3 ? 0x9a8b73 : 0xad9b7f));
    // 三本おきの支柱を二段の横木へ縄留め。細かな縄目は増やさず、煤けた藁縄の帯にする。
    if (i % 3 === 0) for (const railH of [.5, 1.4]) {
      const tie = binding.clone();
      tie.translate(x + .035 * railH / h, y + railH, z);
      parts.push(paintGeo(tie, 0x9a8966));
    }
  }
  // 坂の横木も地面を拾って折り、長い丸太を斜面から浮かせない。
  const spans = Math.max(1, Math.ceil(length / 2.5));
  for (let i = 0; i < spans; i++) {
    const x0 = ax + (bx - ax) * i / spans, z0 = az + (bz - az) * i / spans;
    const x1 = ax + (bx - ax) * (i + 1) / spans, z1 = az + (bz - az) * (i + 1) / spans;
    for (const h of [.5, 1.4]) log(x0, W.heightAt(x0, z0) + h, z0, x1, W.heightAt(x1, z1) + h, z1, .065, 0x5f503d);
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    // 控え木の足を切岸の底へ落とすと、長い黒木が山腹へ張り出す。
    // 近い平場で支えられる側を選ぶ。両側とも急なら控え木だけ省く。
    const y = W.heightAt(x, z);
    for (const side of [1, -1]) {
      const fx = x - tz * .8 * side, fz = z + tx * .8 * side, fy = W.heightAt(fx, fz);
      if (!Number.isFinite(fy) || Math.abs(fy - y) > .6) continue;
      log(fx, fy - .1, fz, x, y + 1.25, z, .065, 0x66553f);
      break;
    }
  }
  const geometry = mergeGeometries(parts); parts.forEach((g) => g.dispose()); timber.dispose(); point.dispose(); binding.dispose();
  const batched = kitFence(o.batch, geometry, WOOD_MAT());
  if (batched) return batched;
  const mesh = new THREE.Mesh(geometry, WOOD_MAT());
  mesh.castShadow = mesh.receiveShadow = true; mesh.userData.camBlock = true;
  return mesh;
}

// 写真の屋敷前の低い囲いと木材置き場。建物の前に二歩の庭を取り、
// 正面の戸口を一・八歩空ける。斎藤期の細部は推定、道と急な肩には設けない。
function buildInabaServiceYard(rt, batch, k, x, z, w, d, rot) {
  const W = rt.world, c = Math.cos(rot), s = Math.sin(rot);
  const point = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
  const side = w / 2 + .35, back = d / 2 + .35, front = back + 2;
  const level = W.heightAt(x, z);
  // 庭全体を半歩ごとに測り、屋根の下と同じ平場に収まる場合だけ一組置く。
  for (let dx = -side; dx <= side + .001; dx += side / 6) for (let dz = back; dz <= front + .001; dz += .5) {
    const [px, pz] = point(dx, dz);
    if (!inPoly(k.poly, px, pz) || inabaPathDistance(px, pz) < 2.8
      || Math.abs(W.heightAt(px, pz) - level) > .45) return;
  }
  const parts = [], unit = new THREE.BoxGeometry(1, 1, 1);
  const box = (dx, dz, h, bw, bh, bd, color) => {
    const [px, pz] = point(dx, dz), g = unit.clone();
    g.scale(bw, bh, bd); g.rotateY(rot); g.translate(px, W.heightAt(px, pz) + h, pz);
    parts.push(paintGeo(g, color));
  };
  const rails = [[-side, back, -side, front], [side, front, side, back],
    [-side, front, -.9, front], [.9, front, side, front]];
  for (const [ax, az, bx, bz] of rails) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 1.1);
    for (let i = 0; i <= n; i++) {
      const dx = ax + (bx - ax) * i / n, dz = az + (bz - az) * i / n;
      box(dx, dz, .48, .10, 1.08, .10, i % 2 ? 0x776b57 : 0x655946);
    }
    for (let i = 0; i < n; i++) for (const h of [.36, .84]) {
      const dx = ax + (bx - ax) * (i + .5) / n, dz = az + (bz - az) * (i + .5) / n;
      box(dx, dz, h, ax === bx ? .065 : len / n + .04, .08,
        az === bz ? .065 : len / n + .04, 0x81735c);
    }
    const a = point(ax, az), b = point(bx, bz);
    solidSeg(a[0], a[1], b[0], b[1], .08);
  }
  // 戸口の脇へ、二本の枕木に載せた短い普請板。
  // 薪の山で庭を埋めず、灰茶の古材と黄褐色の差し替え板を少数の角材で表す。
  const stockX = -side + .7, stockZ = back + .95;
  for (const dx of [-.35, .35]) box(stockX + dx, stockZ, .12, .13, .24, 1.25, 0x554a3b);
  for (let row = 0; row < 3; row++) for (let i = 0; i < 3; i++)
    box(stockX + (i - 1) * .23, stockZ, .29 + row * .095, .21, .075, 1.1,
      (i + row) % 3 ? 0x8a795e : 0xa08b68);
  // 板材と同じ場所に当たりを付け、見える囲い・置き場と歩ける所をそろえる。
  const a = point(stockX - .44, stockZ), b = point(stockX + .44, stockZ);
  solidSeg(a[0], a[1], b[0], b[1], .6);
  unit.dispose();
  const geo = mergeGeometries(parts); parts.forEach((g) => g.dispose());
  const mesh = kitFence(batch, geo, WOOD_MAT());
  if (!mesh?.isBatchedPart) {
    const fallback = new THREE.Mesh(geo, WOOD_MAT());
    fallback.castShadow = fallback.receiveShadow = true; rt.scene.add(fallback);
  }
}

// 写真の段ごとの屋敷群は、既存の平場の端へ板葺きの番所・蔵と所属旗で表す。
// 建物の大きさは増やさず、通り道・門・既存の家・急な肩を避ける。斎藤期の配置の補い。
function buildInabaWardLife(rt, batch) {
  const W = rt.world;
  const places = [
    ['ni', 'bansho', NI.x + 5, NI.z + 5, 0],
    ['matsu', 'bansho', MATSU.x - 4, MATSU.z - 6, Math.PI / 2],
    ['demaru', 'kura', DEMARU.x + 6, DEMARU.z - 5, 0],
    ['yakata', 'bansho', YAKATA.x - 10, YAKATA.z + 6, 0],
    ['yakata', 'kura', YAKATA.x + 10, YAKATA.z - 6, 0],
  ];
  for (const [id, kind, x, z, rot] of places) {
    const k = INABAYAMA_PLAN.kuruwa.find((q) => q.id === id);
    const w = kind === 'kura' ? 5.4 : 4.4, d = kind === 'kura' ? 4 : 3.4;
    const c = Math.cos(rot), s = Math.sin(rot), y = W.heightAt(x, z);
    let fits = true;
    for (const dx of [-w / 2 - .8, w / 2 + .8]) for (const dz of [-d / 2 - .8, d / 2 + .8]) {
      const px = x + dx * c + dz * s, pz = z - dx * s + dz * c;
      if (!inPoly(k.poly, px, pz) || Math.abs(W.heightAt(px, pz) - y) > .65 || inabaPathDistance(px, pz) < 2) fits = false;
    }
    if (!fits || inabaPathDistance(x, z) < Math.hypot(w, d) / 2 + 2) continue;
    const mesh = kuruwaBldg(W, kind, x, z, rot, { ita: true, boardRoof: true, timberStore: true, batch });
    if (!mesh.isBatchedPart) rt.scene.add(mesh);
    buildInabaServiceYard(rt, batch, k, x, z, w, d, rot);
  }
  for (const [x, z] of [[NI.x + 7, NI.z - 6], [MATSU.x - 7, MATSU.z + 6],
    [UMAYA.x + 8, UMAYA.z - 5], [DEMARU.x - 8, DEMARU.z - 5], [YAKATA.x - 12, YAKATA.z - 8]]) {
    rt.scene.add(nobori(W, x, z, 'saito', 5.5));
  }
}

// 本丸の板塀の内側に差し掛ける板庇。写真の長い軒と細い柱の並びを、
// 門・屋敷・井楼から離れた二辺だけに補う。斎藤期の細部は推定。
function buildInabaWallEaves(rt, batch) {
  const W = rt.world, parts = [], unit = new THREE.BoxGeometry(1, 1, 1);
  const box = (x, y, z, w, h, d, color, tilt = 0) => {
    const g = unit.clone(); g.scale(w, h, d); g.rotateX(tilt); g.translate(x, y, z);
    parts.push(paintGeo(g, color));
  };
  // 本丸の北西・南東。虎口は西、井楼は北東、長屋は南西にある。
  for (const [x0, x1, z, inward] of [[-18, -7, HON.z - 20, 1], [2, 17, HON.z + 16, -1]]) {
    const depth = 2, drop = .45, tilt = inward * Math.atan(drop / depth);
    const n = Math.ceil((x1 - x0) / .45), step = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + .5) * step, y = W.heightAt(x, z) + 2.85;
      box(x, y - drop / 2, z + inward * depth / 2, step - .009, .065,
        Math.hypot(depth, drop), i % 5 === 1 ? 0x88745c : i % 3 ? 0x70634f : 0x625748, tilt);
    }
    // 写真の板庇の押縁。板の上に三筋の細い木を通し、斜面に沿って高さも下げる。
    // 長い一本を斜めに浮かせず、屋根と同じ地面の高さを拾う小区間にまとめる。
    for (const t of [.12, .5, .88]) for (let i = 0; i < n; i++) {
      const x = x0 + (i + .5) * step;
      box(x, W.heightAt(x, z) + 2.85 - drop * t + .065,
        z + inward * depth * t, step + .004, .065, .085, 0x514939);
    }
    const bays = Math.ceil((x1 - x0) / 2.5);
    for (let i = 0; i <= bays; i++) {
      const x = x0 + (x1 - x0) * i / bays, pz = z + inward * 1.75;
      const foot = W.heightAt(x, pz), top = W.heightAt(x, z) + 2.85 - drop * 1.75 / depth - .12;
      box(x, (foot + top) / 2, pz, .12, top - foot, .12, 0x5e503e);
      box(x, W.heightAt(x, z) + 2.85 - drop / 2 - .12, z + inward * depth / 2,
        .09, .12, Math.hypot(depth, drop), 0x534633, tilt);
      // 柱だけに当たりを付け、庇の下と板塀の狭間を通れるままにする。
      solidSeg(x - .06, pz, x + .06, pz, .06);
    }
  }
  unit.dispose();
  const geometry = mergeGeometries(parts); parts.forEach((g) => g.dispose());
  const mesh = kitFence(batch, geometry, WOOD_MAT());
  if (!mesh.isBatchedPart) rt.scene.add(mesh);
}

function officer(rt) {
  const u = rt.flags.kinoU, p = rt.player.u.pos;
  return u?.alive && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 12 ? '藤吉郎（とうきちろう）' : '旗の人の使い';
}

// 切岸へ小石を貼ると、道側から腹が見えて宙の黒い板になる。
// 設営時だけ描く面を測る。急な面は山肌の岩模様に任せ、独立した石を減らす。
function inabaRockFooting(W, x, z) {
  const y = drawGroundAt(W, x, z);
  if (!Number.isFinite(y)) return false;
  for (const [dx, dz] of [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) {
    const near = drawGroundAt(W, x + dx, z + dz);
    if (!Number.isFinite(near) || Math.abs(near - y) > 1) return false;
  }
  return true;
}

function trimInabaRocks(W, rocks) {
  const matrix = new THREE.Matrix4();
  let kept = 0;
  for (let i = 0; i < rocks.count; i++) {
    rocks.getMatrixAt(i, matrix);
    if (!inabaRockFooting(W, matrix.elements[12], matrix.elements[14])) continue;
    rocks.setMatrixAt(kept++, matrix);
  }
  rocks.count = kept;
}

// 稲葉山だけの露岩帯。高低ではなく、尾根と沢に沿った斑で林床・岩場を分ける。
function inabaRockBand(x, z) {
  return Math.max(0, Math.min(1, (Math.sin(x * 0.095 + z * 0.027 + 0.8)
    + Math.sin(x * 0.037 - z * 0.063) * 0.55 - 0.15) * 1.25));
}
// 切岸へ幹を貼り付けない。設営時だけ根元の周りを測り、緩い林床へ本数を振り分ける。
function inabaTreeDensity(x, z) {
  if (z > 28) return 0.10;
  const y = height(x, z);
  const slope = Math.max(Math.abs(height(x + 1, z) - y), Math.abs(height(x - 1, z) - y),
    Math.abs(height(x, z + 1) - y), Math.abs(height(x, z - 1) - y));
  if (slope >= 1.2) return 0;
  const density = z > -145 && Math.abs(x) < 95 ? 1 - inabaRockBand(x, z) * 0.72 : 0.22;
  return density * Math.min(1, (1.2 - slope) / 0.6);
}
function inabaPathDistance(x, z) {
  let d = Infinity;
  for (const pts of INABA_PATHS) d = Math.min(d, distToPolyline(x, z, pts));
  return d;
}
function inabaClearing(x, z, pad = 0) {
  // 歩行は実際の曲輪の内側だけ。外接四角形の角は切岸なので、
  // 平場と見なして道幅の制限や曲がり角の案内を外さない。
  // 木や岩を避ける設営用の余白は、従来の広い範囲を保つ。
  return CLEAR_BOUNDS.some((q) => x >= q.x0 - pad && x <= q.x1 + pad && z >= q.z0 - pad && z <= q.z1 + pad
    && (pad > 0 || inPoly(q.poly, x, z)));
}

// 設営時に一度だけ作る。共通地形を替えず、この山の材質に露岩と細い土の道筋を足す。
function buildInabaMountain(rt) {
  const W = rt.world, geo = W.terrain.geometry, pos = geo.attributes.position;
  const bands = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    // 薄い下地を残し、露岩の斑の外でも急な崖は灰褐色の肌にする。
    bands[i] = z < 28 && z > -170 && Math.abs(x) < 100 && !inabaClearing(x, z) ? 0.15 + inabaRockBand(x, z) * 0.85 : 0;
  }
  geo.setAttribute('inabaRock', new THREE.BufferAttribute(bands, 1));
  // 格子より細い道も残す。一枚の小さな絵に全ての九十九折を描き、毎コマ描き直さない。
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'), scale = 512 / (W.half * 2);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#fff'; ctx.lineCap = ctx.lineJoin = 'round';
  for (const pts of INABA_PATHS) {
    ctx.lineWidth = (pts === KARA_TRAIL ? 4.8 : pts === HYAKU ? 1.7 : 2.1) * scale;
    ctx.beginPath();
    pts.forEach(([x, z], i) => { const u = (x + W.half) * scale, v = (W.half - z) * scale; if (i) ctx.lineTo(u, v); else ctx.moveTo(u, v); });
    ctx.stroke();
  }
  ctx.lineWidth = 4.8 * scale; ctx.beginPath();
  for (const [i, x, z] of [[0, 36, 122], [1, 28, 104], [2, 26, 92], [3, 20, 74], [4, 26, 52], [5, 24, 30]]) {
    const u = (x + W.half) * scale, v = (W.half - z) * scale;
    if (i) ctx.lineTo(u, v); else ctx.moveTo(u, v);
  }
  ctx.stroke();
  const trail = new THREE.CanvasTexture(canvas);
  // 山肌が抜ける時に、共通の土の細工へさらに描画処理を継ぎ足さない。
  // この戦の地面だけ軽い材質へ。足場・索引・陰・霧は同じものを使う。
  const previousGround = W.terrain.material;
  // 夏の裸地を白い雪面に見せない。照り返しを抑えた材質にも灰褐色の下地を残す。
  const mat = new THREE.MeshLambertMaterial({ color: 0xb9aa8d });
  // r160 の MeshLambertMaterial に extensions は無い（WebGL2 は微分が標準）。触ると稲葉山が読み込みで止まる。
  mat.userData.camNearSolid = true;
  mat.customProgramCacheKey = () => 'inaba-ground-soil-rock-trail';
  mat.onBeforeCompile = (sh) => {
    for (const name of ['tGrass', 'tDirt', 'tStone', 'tWear', 'uWet']) sh.uniforms[name] = W.groundU[name];
    sh.uniforms.inabaTrail = { value: trail };
    sh.vertexShader = 'attribute vec3 splat;\nattribute float inabaRock;\nvarying vec4 vInabaSoil;\nvarying vec3 vInabaPoint;\n' + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vInabaSoil = vec4(splat, inabaRock);
      vInabaPoint = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = 'uniform sampler2D tGrass, tDirt, tStone, tWear, inabaTrail;\nuniform float uWet;\nvarying vec4 vInabaSoil;\nvarying vec3 vInabaPoint;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec3 gN = normalize(cross(dFdx(vInabaPoint), dFdy(vInabaPoint)));
      vec2 ibUv = vInabaPoint.xz;
      vec2 ibMap = (ibUv + ${W.half.toFixed(1)}) / ${(W.half * 2).toFixed(1)};
      vec2 ibWear = texture2D(tWear, ibMap).rg;
      vec3 grass = texture2D(tGrass, ibUv * 0.21).rgb;
      vec3 dirt = texture2D(tDirt, ibUv * 0.23).rgb;
      // 立った面は横から貼る。法線で座標を混ぜず、色を混ぜて筋の圧縮を避ける。
      vec3 ibAxes = abs(gN); ibAxes *= ibAxes;
      ibAxes /= max(0.001, ibAxes.x + ibAxes.y + ibAxes.z);
      vec3 stone = texture2D(tStone, vInabaPoint.zy * 0.12).rgb * ibAxes.x
        + texture2D(tStone, vInabaPoint.xy * 0.12).rgb * ibAxes.z
        + texture2D(tStone, ibUv * 0.12).rgb * ibAxes.y;
      vec3 ibWeights = max(vInabaSoil.xyz, vec3(0.0));
      ibWeights /= max(0.001, ibWeights.x + ibWeights.y + ibWeights.z);
      vec3 col = grass * ibWeights.x + dirt * (ibWeights.y + ibWeights.z);
      col = mix(col, dirt * vec3(0.76, 0.72, 0.65), ibWear.r * 0.75);
      col *= 1.0 - uWet * (0.2 + ibWeights.z * 0.15);
      float ibSlope = 1.0 - abs(gN.y);
      float ibRock = max(vInabaSoil.w * smoothstep(0.08, 0.38, ibSlope) * 0.85,
        smoothstep(0.02, 0.14, vInabaSoil.w) * smoothstep(0.18, 0.5, ibSlope));
      col = mix(col, stone * vec3(0.83, 0.80, 0.75), ibRock);
      float ibTrail = texture2D(inabaTrail, ibMap).r * smoothstep(0.55, 0.72, abs(gN.y));
      col = mix(col, dirt * vec3(0.92, 0.83, 0.72), ibTrail * 0.94);
      // 土の細粒と乾湿の斑を別の大きさで重ねる。面は増やさず、遠くの粒は薄める。
      vec3 ibGrain = texture2D(tDirt, ibUv * 1.7).rgb;
      float ibFine = dot(ibGrain, vec3(0.3, 0.5, 0.2));
      float ibNear = 1.0 - smoothstep(15.0, 48.0, distance(cameraPosition, vInabaPoint));
      col *= mix(1.0, 0.82 + ibFine * 0.46, ibNear * (1.0 - ibRock));
      float ibPatch = sin(ibUv.x * 0.31 + sin(ibUv.y * 0.19) * 1.8)
        * sin(ibUv.y * 0.27 - ibUv.x * 0.13);
      col *= 1.0 + ibPatch * 0.09 * (1.0 - ibRock);
      col = mix(col, col * vec3(0.55, 0.3, 0.26), ibWear.g * 0.7);
      diffuseColor.rgb *= col;`);
  };
  W.terrain.material = mat;
  previousGround.dispose();
  mat.addEventListener('dispose', () => trail.dispose());

  // 丸石を増やす代わりに、道の外へ薄い岩の段を集める。割れ目は二枚の隙間で表す。
  // 箱の上面と暗い絵を重ねると黒い板に見える。割れと頂点色を共用する。
  const rockGeo = rockShape(1, true, 1), rp = rockGeo.attributes.position;
  const rocks = new THREE.InstancedMesh(rockGeo,
    new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x302c23, emissiveIntensity: 0.3 }), 160);
  const roots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.13, 1, 5),
    new THREE.MeshLambertMaterial({ map: barkTex('broad'), color: 0x756044 }), 80);
  const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3(), end = new THREE.Vector3(), across = new THREE.Vector3(), color = new THREE.Color(), vertex = new THREE.Vector3();
  let nr = 0, nt = 0;
  for (const pts of [ROAD, KARA_TRAIL, HYAKU]) for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], length = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / length, dz = (bz - az) / length;
    for (let d = 3; d < length; d += 7) {
      const side = (i + Math.floor(d / 7)) % 2 ? 1 : -1;
      const x = ax + dx * d - dz * side * 7, z = az + dz * d + dx * side * 7;
      if (z > 24 || z < -145 || inabaClearing(x, z, 2) || inabaPathDistance(x, z) < 5.5) continue;
      if (!inabaRockFooting(W, x, z)) continue;
      const gx = (drawGroundAt(W, x + 1, z) - drawGroundAt(W, x - 1, z)) / 2;
      const gz = (drawGroundAt(W, x, z + 1) - drawGroundAt(W, x, z - 1)) / 2;
      normal.set(-gx, 1, -gz).normalize();
      if (inabaRockBand(x, z) > 0.22 && nr + 2 <= rocks.instanceMatrix.count) {
        dummy.quaternion.setFromUnitVectors(up, normal); dummy.rotateY(0.25 + i * 0.13);
        across.set(1, 0, 0).applyQuaternion(dummy.quaternion);
        for (let split = 0; split < 2; split++) {
          const offset = (split ? 1 : -1) * 1.2, rx = x + across.x * offset, rz = z + across.z * offset;
          if (!inabaRockFooting(W, rx, rz)) continue;
          dummy.position.set(rx, drawGroundAt(W, rx, rz), rz);
          dummy.scale.set(0.9, 0.6 + (i % 3) * 0.12, 1.25 + (Math.floor(d) % 3) * 0.35);
          dummy.updateMatrix();
          // 斜面へ回した岩の下縁を、描く地面へ埋める。設営時だけ測る。
          let buried = dummy.position.y;
          for (let v = 0; v < rp.count; v++) {
            vertex.fromBufferAttribute(rp, v).applyMatrix4(dummy.matrix);
            if (rp.getY(v) > 0.05 && vertex.y > dummy.position.y + 0.05) continue;
            buried = Math.min(buried, drawGroundAt(W, vertex.x, vertex.z) - (vertex.y - dummy.position.y) - 0.08);
          }
          dummy.position.y = buried; dummy.updateMatrix(); rocks.setMatrixAt(nr, dummy.matrix);
          color.setHex((nr % 3) === 0 ? 0xc7cfad : (nr % 3) === 1 ? 0xe0d6c8 : 0xc9bfb3); rocks.setColorAt(nr++, color);
        }
      }
      // 根は道を塞がず、林床から沢側へ這わせる。上下端を山肌の高さに合わせる。
      if (nt < roots.instanceMatrix.count) {
        const rx = x + dx * 1.7 - dz * side, rz = z + dz * 1.7 + dx * side;
        for (let j = 0; j < 4 && nt < roots.instanceMatrix.count; j++) {
          const sx = x + (rx - x) * j / 4, sz = z + (rz - z) * j / 4;
          const ex = x + (rx - x) * (j + 1) / 4, ez = z + (rz - z) * (j + 1) / 4;
          const y = drawGroundAt(W, sx, sz) + 0.025, ry = drawGroundAt(W, ex, ez) + 0.025;
          end.set(ex - sx, ry - y, ez - sz); const len = end.length();
          dummy.position.set((sx + ex) / 2, (y + ry) / 2, (sz + ez) / 2);
          dummy.quaternion.setFromUnitVectors(up, end.normalize()); dummy.scale.set(1, len, 1);
          dummy.updateMatrix(); roots.setMatrixAt(nt++, dummy.matrix);
        }
      }
    }
  }
  rocks.count = nr; roots.count = nt;
  for (const mesh of [rocks, roots]) { mesh.receiveShadow = true; W.viewCull([mesh], 0); rt.scene.add(mesh); }
}

// 小屋へ直進すると西の長屋や東の遠侍に入る。外の通り道を人と試験の遊び手で共有する。
function inabaSignalApproach(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  const q = F.sigGuide || (F.sigGuide = { x: 0, y: 0, z: 0 });
  q.x = F.sig.x - 4; q.z = F.sig.z;
  if (p.x < HON.x + 1.5) {
    q.z = HON.z + (p.z > HON.z + 10 ? 16 : 3);
    if (p.z > HON.z + 6 && p.z < HON.z + 14) q.x = p.x;
  } else if (p.x > HON.x + 7 && p.z < HON.z + 10) {
    q.x = HON.x + 6;
    q.z = HON.z + (p.z > HON.z + 6 ? 11 : 1);
    if (p.z > HON.z + 2) q.x = p.x;
  }
  q.y = rt.world.heightAt(q.x, q.z);
  return q;
}

// 町・大手から続く時計だけで、登っている最中や合図後の終幕を切らない。
// 登りと本丸にはそれぞれ上限を残す。待つだけで任務達成にはしない。
function inabaPacingWait(rt) {
  const F = rt.flags;
  if (F.ending) return true;
  if (F.step < 3) return false;
  // 角の間でも前へ登っていれば、残りの寄せを九十秒確保する。
  // 最も進んだ距離だけを控え、往復や待機では延ばさない。
  // 次の区間へは角の通過判定が済んでから進む。登りは八分が上限。
  if (F.step === 3) {
    const i = Math.min(F.karaNext || 0, KARA_TRAIL.length - 1);
    const p = rt.player.u.pos;
    // 細道で仲間と守兵を押し返す間も、実際に敵を傷つけていれば寄せを続ける。
    // 構えるだけ・遠い段での戦い・回復後の同じ傷では延ばさない。登り全体の上限は保つ。
    if (F.climbFoes && rt.t >= (F.pacingFightAt || 0)) {
      F.pacingFightAt = rt.t + 1;
      const health = F.pacingEnemyHp || (F.pacingEnemyHp = new WeakMap());
      for (const g of F.climbFoes) if (g) for (const u of g.units) {
        const hp = Math.max(0, u.hp), before = health.get(u);
        if (before == null || hp <= before - 2) {
          health.set(u, hp);
          if (before != null && Math.abs(u.pos.y - p.y) < 3 && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 12) F.pacingClimbT = rt.t;
        }
      }
    }
    let walked = 0;
    for (let j = 1; j <= i; j++) {
      const a = KARA_TRAIL[j - 1], b = KARA_TRAIL[j];
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (j < i) { walked += length; continue; }
      const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (length * length || 1)));
      const x = a[0] + dx * t, z = a[1] + dz * t;
      // 肩は隣の坂と高さを混ぜている。中心線との高低差で、
      // 実際に道を登っている者を足止め扱いにしない。
      if (Math.hypot(p.x - x, p.z - z) <= KARA_SHOULDER - .6
        && Math.abs(p.y - rt.world.heightAt(p.x, p.z)) < 2) walked += length * t;
    }
    if (walked > (F.pacingDistance || 0) + 2) {
      F.pacingDistance = walked; F.pacingClimbT = rt.t;
    }
  }
  if (F.step === 3 && F.karaNext > (F.pacingCorner || 0)) {
    F.pacingCorner = F.karaNext; F.pacingClimbT = rt.t;
  }
  const climbEnd = Math.min(F.stepT + 480, Math.max(F.stepT + 300, (F.pacingClimbT || F.stepT) + 90));
  // 守りを退けた直後に時計を切らず、本人が小屋へ歩いて火をつける時間を残す。
  // 放置では延びず、本丸へ入ってからの上限も残す。
  const signalEnd = F.sig ? Math.min(F.stepT + 135, F.sigT + 45) : 0;
  const end = Math.max(480, F.step === 3 ? climbEnd : Math.max(F.stepT + 90, signalEnd));
  if (rt.t >= end - 40 && !rt.pacingWarned) {
    rt.pacingWarned = true;
    rt.say('組頭', '寄せを続けられるのも、あとわずかじゃ。道の印をたどり、合図の火を急げ', 4);
  }
  return rt.t < end;
}

// 山道を歩く間は縦列。下り切ってから槍をそろえ、打って出る。
function march(g, path, next = 'hold') {
  if (gone(g)) return;
  g.order = 'path'; g.path = path; g.pathIdx = 0; g.formation = 'column'; g.colW = 2; g.roadColumn = true; g.speed = 2.4;
  g.onArrive = (q) => { q.anchor = { x: path[path.length - 1][0], z: path[path.length - 1][1] }; q.formation = 'yari'; q.order = next; q.aggro = 12; q.seekRange = 24; };
}

// 裏道の守兵は持ち場と物見の合図で動く。時間だけで全組を主人公へ集めない。
// 共通の足止め救済には味方の列だけを渡し、空の配列も使い回す。
const CLIMB_NO_CHASE = [];

// 小勢と味方の列が実際に槍を交えた時間だけを数える。隊の目標点が
// 進んでいても、兵本人が同じ場所で戦い続ける行き詰まりを残さない。
function inabaClimbClash(rt) {
  const F = rt.flags;
  if (rt.t < (F.climbClashAt || 0)) return;
  F.climbClashAt = rt.t + 1;
  let broke = false;
  for (const g of F.climbSkirmishes || []) {
    // 腰曲輪で待ち構える守兵も、実際に槍を交えている間は押し合いを数える。
    if (gone(g) || g.morale <= 0 || g.noAI || g.hidden || g.order !== 'attack' && g.order !== 'hold') continue;
    let contact = false;
    for (const u of g.units) {
      const t = u.target;
      if (t?.team !== 0 || !inabaMeleeContact(rt, u, t)) continue;
      contact = true; break;
    }
    // 受けに回った守兵が的を外しても、味方が槍を交えていれば押し合いは続いている。
    if (!contact) for (const u of rt.army.units || []) {
      if (u.team !== 0 || u.target?.group !== g || !inabaMeleeContact(rt, u, u.target)) continue;
      contact = true; break;
    }
    // 自分の槍は兵の自動目標を持たない。狙いを固定せず応戦しても、
    // 目の前で槍を交える小勢には同じ押し返しを適用する。
    if (!contact) for (const u of g.units) {
      if (!inabaMeleeContact(rt, rt.player.u, u)) continue;
      contact = true; break;
    }
    if (!contact) continue;
    g.inabaClashFor = (g.inabaClashFor || 0) + 1;
    // 構えて列と押し合う間も前進の猶予を残す。対象の小勢は二十五秒で
    // 崩れるので、待つだけ・離れた戦いで時計を延ばし続けることはない。
    const p = rt.player.u;
    if (p.alive) for (const u of g.units) {
      if (!inabaMeleeContact(rt, u, p) && !inabaMeleeContact(rt, p, u)) continue;
      F.pacingClimbT = rt.t; break;
    }
    if (g.inabaClashFor < 25) continue;
    g.noRout = false; g.morale = 0; broke = true;
  }
  if (broke) rt.bark('道の守りを押し返した。列に続いて登れ', true);
}

function inabaMeleeContact(rt, u, t) {
  return u.alive && !u.fleeing && t?.alive && !t.fleeing && !t.isStruct
    && Math.abs(u.pos.y - t.pos.y) <= 3
    && Math.hypot(u.pos.x - t.pos.x, u.pos.z - t.pos.z) <= Math.max(3, (u.reach || 0) + 1)
    && !rt.army.wallBetween(u.pos, -1, t.pos, (u.wpnKind || u.lookWeapon) === 'spear')
    && !rt.army.terrainBlocks(u.pos, t.pos);
}

// 山道の案内と敵の枠は同じ一人を使う。戦いの判定や兵の動きには使わない。
function inabaClimbGuideEnemy(rt) {
  const F = rt.flags;
  if (F.step !== 3 || F.ending || F.retreatMarked || F.regroup) return null;
  const previous = F.climbGuideEnemy;
  if (F.climbGuideAt > rt.t && previous?.alive && !previous.fleeing && !previous.gone) return previous;
  F.climbGuideAt = rt.t + .1;
  let best = null, distance = Infinity;
  for (const group of F.climbFoes || []) {
    if (gone(group)) continue;
    for (const enemy of group.units) {
      if (enemy.gone || enemy.woundOut || enemy.noTarget || enemy.offscreen || !sightScreenUnit(rt, enemy) ||
          !inabaMeleeContact(rt, enemy, rt.player.u) && !inabaMeleeContact(rt, rt.player.u, enemy)) continue;
      const d = Math.hypot(enemy.pos.x - rt.player.u.pos.x, enemy.pos.z - rt.player.u.pos.z) - (enemy === previous ? 2 : 0);
      if (d < distance) { best = enemy; distance = d; }
    }
  }
  return F.climbGuideEnemy = best;
}


// 射線が通っても、間に谷や道の肩があれば歩いて退けない。
// 半秒ごとの候補選びだけで、実際の歩行判定を短い歩幅でたどる。
function inabaRetreatReachable(rt, q) {
  if (rt.flags.step !== 3) return true;
  const p = rt.player.u.pos, dx = q.x - p.x, dz = q.z - p.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.5));
  let x = p.x, z = p.z, y = p.y;
  for (let i = 1; i <= steps; i++) {
    const nx = p.x + dx * i / steps, nz = p.z + dz * i / steps;
    if (!rt.player.canStep(x, z, nx, nz, y)) return false;
    x = nx; z = nz; y = rt.world.heightAt(x, z);
  }
  return Math.abs(y - q.y) < 2;
}

function inabaCanBind(rt) {
  const p = rt.player, u = p.u;
  if (!(u.wounds?.bleed > .0001) || p.treatmentLeft <= 0 || p.treatmentNext > rt.t || p.mounted) return false;
  for (const o of rt.army.units) {
    if (!o.alive || o.team === u.team || o.fleeing || o.noTarget || o.isStruct || o.civ || o.group?.civ) continue;
    if (Math.abs(o.pos.y - u.pos.y) < 3 && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 8
      && !rt.army.wallBetween(u.pos, -1, o.pos)) return false;
  }
  return true;
}

// 半秒に一度だけ周囲を見る。傷が深くなる前に、敵から離れる味方を退き口にする。
function inabaRetreatTick(rt) {
  const F = rt.flags;
  if (rt.t < (F.retreatCheckAt || 0)) return;
  F.retreatCheckAt = rt.t + 0.5;
  const player = rt.player.u, p = player.pos;
  let enemies = 0, ex = 0, ez = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u.team !== 1 || u.isStruct || u.noTarget || u.fleeing || u.group?.civ || Math.abs(u.pos.y - p.y) > 5) continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    // 別の折れや家の向こうの兵では退かせない。数人が見えるだけで任務を隠さない。
    if (d > Math.max(5, (u.reach || 0) + 1) || rt.army.wallBetween(u.pos, -1, p, (u.wpnKind || u.lookWeapon) === 'spear') || rt.army.terrainBlocks(u.pos, p)) continue;
    enemies++; ex += u.pos.x - p.x; ez += u.pos.z - p.z;
  }
  // 槍を交えるだけで下知を隠さない。囲まれて傷が増えた時か、深手の時に退かせる。
  const danger = (enemies >= 3 && player.hp < player.maxHp * 0.75)
    || (enemies > 0 && player.hp < player.maxHp * 0.4);
  if (F.retreatMarked && Math.hypot(p.x - F.retreatPoint.x, p.z - F.retreatPoint.z) < 2.5
    && Math.abs(p.y - F.retreatPoint.y) < 2) {
    rt.unmark('retreat'); rt.objRemove('retreat'); F.retreatMarked = false;
    F.retreatRestUntil = rt.t + 8;
  }
  if (F.retreatMarked && (F.retreatStep !== F.step || !F.retreatUnit?.alive || (!danger && rt.t - F.retreatDangerAt >= 8))) {
    rt.unmark('retreat'); rt.objRemove('retreat'); F.retreatMarked = false;
  }
  if (!danger || F.step < 1 || rt.t < (F.retreatRestUntil || 0)) return;
  F.retreatDangerAt = rt.t;
  // 印は兵の現在位置を追わない。歩いて届く安全な退き口を保つ。
  if (F.retreatMarked) {
    const q = F.retreatPoint;
    let safe = inabaRetreatReachable(rt, q) && Math.hypot(F.retreatUnit.pos.x - q.x, F.retreatUnit.pos.z - q.z) < 8
      && !rt.army.wallBetween(p, -1, q) && !rt.army.terrainBlocks(p, q);
    for (const u of rt.army.units) {
      if (u.alive && u.team === 1 && !u.isStruct && !u.noTarget && !u.fleeing && !u.group?.civ
        && Math.abs(u.pos.y - q.y) < 5 && Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < 6) { safe = false; break; }
    }
    if (safe) return;
    rt.unmark('retreat'); rt.objRemove('retreat'); F.retreatMarked = false;
  }
  const length = Math.hypot(ex, ez) || 1;
  let best = null, score = Infinity;
  for (const u of rt.army.units) {
    if (!u.alive || u.team !== 0 || u === player || u.isStruct || u.fleeing || u.woundOut || u.naka || Math.abs(u.pos.y - p.y) > 4) continue;
    const dx = u.pos.x - p.x, dz = u.pos.z - p.z, d = Math.hypot(dx, dz);
    if (d < 4 || d > 28 || d >= score) continue;
    // 敵へ進む仲間は選ばない。近い敵から六歩以上離れた味方を指す。
    if ((dx * ex + dz * ez) / length > 1) continue;
    // 別の折れの仲間へ崖を横切らせない。退き口は歩いて届く所に限る。
    if (!inabaRetreatReachable(rt, u.pos) || rt.army.wallBetween(p, -1, u.pos) || rt.army.terrainBlocks(p, u.pos)) continue;
    let safe = true;
    for (const v of rt.army.units) {
      if (v.alive && v.team === 1 && !v.isStruct && !v.noTarget && !v.fleeing && !v.group?.civ
        && Math.abs(v.pos.y - u.pos.y) < 5 && Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z) < 6) { safe = false; break; }
    }
    if (safe && d < score) { best = u; score = d; }
  }
  if (!best) {
    if (F.retreatMarked) { rt.unmark('retreat'); rt.objRemove('retreat'); F.retreatMarked = false; }
    if (!F.retreatNoWayAdvice) {
      F.retreatNoWayAdvice = true;
      rt.bark('敵が寄ってくる。来た道から味方の後ろへ下がれ', true);
    }
    return;
  }
  F.retreatUnit = best;
  const q = F.retreatPoint;
  q.x = best.pos.x - ex / length * 2; q.z = best.pos.z - ez / length * 2;
  q.y = rt.world.heightAt(q.x, q.z);
  let clear = true;
  for (const u of rt.army.units) {
    if (u.alive && u.team === 1 && !u.isStruct && !u.noTarget && !u.fleeing && !u.group?.civ
      && Math.abs(u.pos.y - q.y) < 5 && Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < 6) { clear = false; break; }
  }
  // 仲間のすぐ後ろに壁や崖があれば、その足場を退き口にする。
  if (!clear || !inabaRetreatReachable(rt, q) || rt.army.wallBetween(p, -1, q) || rt.army.terrainBlocks(p, q)) {
    q.x = best.pos.x; q.y = best.pos.y; q.z = best.pos.z;
  }
  if (!F.retreatMarked) {
    F.retreatMarked = true; F.retreatStep = F.step;
    rt.marker('retreat', F.retreatPosition, '退き口・味方の後ろへ', { guideAlways: true, guideArea: 'retreat', guideRadius: 2.5, guideAlly: () => F.retreatUnit });
    rt.obj('retreat', '敵が寄った。退き口から味方の後ろへ下がれ', 'order', true);
    rt.objProgress('retreat', '囲まれる前に、仲間の後ろへ。離れたら元の任務へ戻れ');
    // 組の後ろから退き太鼓。退き口の選び直しで連打せず、裏道では声だけにする。
    if (F.step !== 3 && (F.retreatSignalAt ?? -99) + 30 <= rt.t) {
      F.retreatSignalAt = rt.t;
      rt.army.playFar('sig_nobiki', best.pos, 0.7);
      rt.objProgress('retreat', '合図：法螺貝と退き太鼓。味方の後ろへ下がり、離れたら元の任務へ');
      rt.bark('法螺貝と退き太鼓じゃ！　囲まれる前に、退き口の印へ下がれ', true);
      F.retreatAdvice = true;
    }
  }
  if (!F.retreatAdvice) {
    F.retreatAdvice = true;
    rt.bark('敵が寄ってくる。囲まれる前に、退き口の印へ下がれ', true);
  }
}

// 自分の歩きだけでなく、兵や柵からの押し戻しにも同じ道幅を使う。
// 先に距離を控える。高さの見本は次の呼び出しでも同じ入れ物を使う。
function karaPushBlocked(x0, z0, x, z, y) {
  if (y <= 20 || z >= 28 || inabaClearing(x, z)) return false;
  const sample = karaSample(x0, z0), before = sample.d;
  if (before >= KARA_BLEND || Math.abs(y - sample.y) >= 6) return false;
  const after = karaSample(x, z).d;
  return after > KARA_SHOULDER - 0.6 && after > before + 0.0001;
}

function guardKaraPush(rt, move) {
  return function (u, dt) {
    if (rt.flags.step === 0 && u === rt.flags.kinoU) return;
    const x = u.pos.x, z = u.pos.z;
    const result = move.call(this, u, dt);
    if ((u.pos.x !== x || u.pos.z !== z) && rt.flags.step === 3 && u.alive && !u.isStruct && !u.naka && !u.climb && !u.fall
      && karaPushBlocked(x, z, u.pos.x, u.pos.z, u.pos.y)) {
      u.pos.x = x; u.pos.z = z;
    }
    return result;
  };
}

// 共通の台詞と視点を、この戦の間だけ差し替える。次の戦へ持ち越さない。
function installInabaPresentation(rt) {
  const F = rt.flags, player = rt.player, hud = rt.hud;
  const W = rt.world;
  const addFire = W.addFire;
  F.townFlameMaterials = new Map();
  W.addFire = function (x, z, options) {
    const fire = addFire.call(this, x, z, options);
    townFlame(rt, fire); return fire;
  };
  // 急坂の肩から外へ歩き続けない。押し合い後の一歩も同じ判定を使う。
  // 平場・町は従来どおり。肩を外れた者は道へ戻る向きを通す。
  const canStep = player.canStep;
  player.canStep = function (x0, z0, x, z, y) {
    if (karaPushBlocked(x0, z0, x, z, y)) return false;
    return canStep.call(this, x0, z0, x, z, y);
  };
  // 合流するまでは歩きも押し戻しも止め、本人の位置を保つ。
  const steer = rt.army.steer;
  rt.army.steer = function (u, dt, want, speed, face) {
    if (F.step === 0 && u === F.kinoU) {
      u.mv.x = u.mv.z = u.push.x = u.push.z = u.vel.x = u.vel.z = u.moving = 0;
      return;
    }
    return steer.call(this, u, dt, want, speed, face);
  };
  rt.army.bodies = guardKaraPush(rt, rt.army.bodies);
  rt.army.collide = guardKaraPush(rt, rt.army.collide);
  // 矢の危険が去ったら警告を畳み、共通の退避先と同じ呼び方にする。
  const onArrowRain = rt.army.hooks.onArrowRain;
  rt.army.hooks.onArrowRain = (v, under) => {
    if (!under || rt.t < 5 || rt.over || rt.ended || !player.u.alive) return;
    hud.notices.push('矢が来る！', 110, Math.max(.5, v.T - v.t + .6), 'warn',
      () => !rt.over && !rt.ended && player.u.alive && v.t < v.T + .6 &&
        Math.hypot(player.u.pos.x - v.x, player.u.pos.z - v.z) < v.r + 1);
  };
  const nearAllyVisit = player.nearAllyVisit;
  player.nearAllyVisit = (u) => {
    nearAllyVisit(u);
    const camera = player.nearAllyCam;
    if (!camera || u === player.u || !u.alive || !u.mounted || u.team !== player.u.team) return;
    // 馬腹や騎手の中へ視点が入った時は、透けた顔を重ねず描く間だけ避ける。
    const dx = u.pos.x - camera.position.x, dz = u.pos.z - camera.position.z;
    if (dx * dx + dz * dz > 1.7 * 1.7 || camera.position.y < u.pos.y - 0.2 || camera.position.y > u.pos.y + 4) return;
    player.hideNearFlag(u.mesh); player.hideNearFlag(u.human?.root);
    player.hideNearFlag(u.horse); player.hideNearFlag(u.wpn);
  };
  // 足場を透かすと地面の向こうの空が出る。この戦の地面だけを不透明に保つ。
  W.terrain.material.userData.camNearSolid = true;
  // 案内と視点にも、兵が使う家の角を回る道を渡す。当たりや兵の動きは変えない。
  W.def.guideWay = (u, goal) => townWay(rt.army, u, goal);
  const cameraMeasure = {};
  // この山の葉だけ、縮小時の不透明の増幅を外し、影にも緑を少し残す。
  for (const mesh of W.treeMeshes || []) {
    const mat = mesh.material;
    if (!mat.alphaTest || !mat.map) continue;
    const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
    mat.onBeforeCompile = function (sh, renderer) {
      compile.call(this, sh, renderer);
      sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.a *= 1.0 + mipL * 0.28;',
        'diffuseColor.a = texture2D(map, vMapUv, -1.0).a * opacity;');
    };
    mat.customProgramCacheKey = () => key + '|inaba-leaves';
    mat.emissive.setHex(0x52613d); mat.emissiveIntensity = 0.35; mat.needsUpdate = true;
  }
  // 粒の数は増やさず、黒煙の縁を丸く薄くし、一粒ずつ太さを散らす。
  W.buildSmokeColumns();
  const smokeMat = W.smokeCol.pts.material;
  smokeMat.vertexShader = smokeMat.vertexShader.replace('(0.8 + t * 5.0) * seed.y * scale',
    '(0.8 + t * 5.0) * seed.y * (0.7 + 0.6 * fract(seed.x * 17.31)) * scale');
  smokeMat.fragmentShader = `uniform sampler2D map; uniform vec3 color; varying float vA; varying float vSoot;
    void main() {
      float radius = length((gl_PointCoord - 0.5) * 2.0);
      float alpha = texture2D(map, gl_PointCoord).a * (1.0 - smoothstep(0.25, 0.95, radius)) * vA * mix(0.24, 0.62, vSoot);
      if (alpha < 0.004) discard;
      gl_FragColor = vec4(mix(color, vec3(0.085, 0.075, 0.065), vSoot), alpha);
    }`;
  smokeMat.needsUpdate = true;
  F.retreatPoint = { x: 0, y: 0, z: 0 };
  F.retreatPosition = () => F.retreatMarked ? F.retreatPoint : null;
  const say = rt.say, bark = rt.bark, updateCamera = player.updateCamera, dispose = rt.dispose;
  const hudSay = hud.say;
  // 使番が町の下知を持って山へ遅れて着いても、済んだ火付けへ戻さない。
  // 予約された台詞もあるため、実際に札へ出す時の段で確かめる。
  hud.say = function (who, text, dur) {
    if (F.step >= 2 && /印の家に火をかけよ/.test(text)) return false;
    // 歩数は今の位置から任務札で出す。使番の遅れた声で古い距離を重ねない。
    if (F.step === 3 && /(?:道の印|次の曲がり角)へ\s*あと\s*\d+歩/.test(text)) return false;
    return hudSay.call(this, who, text, dur);
  };
  const clean = (text) => {
    text = text.replace(/([左右])手から味方が来るぞ[！!]?/g, '$1手から味方の加勢じゃ');
    return /討死|討ち死|討たれ|戦死/.test(text) ? text.replace(/佐久間信盛/g, '味方の組頭') : text;
  };
  const pass = (text) => {
    if (!/使番が.*本陣へ走った/.test(text)) return true;
    if (rt.t < (F.honjinRunnerAt ?? -Infinity) + 30) return false;
    F.honjinRunnerAt = rt.t; return true;
  };
  rt.say = function (who, text, dur) { text = clean(String(text)); if (pass(text)) return say.call(this, who, text, dur); };
  rt.bark = function (text, warn) { text = clean(String(text)); if (pass(text)) return bark.call(this, text, warn); };
  const style = document.createElement('style');
  hud.root.classList.add('inaba-notices');
  style.textContent = '#hud #subtitle, #hud #subtitle span, #hud #subtitle em, #hud #subtitle i { font-style: normal; }'
    // 小地図の左に余白を空け、任務と台詞を重ねない。
    + '@media(min-width:1000px) and (min-height:501px){html body #hud.inaba-notices.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)), html body #hud.inaba-notices #battle-notices:not(.choosing){left:auto !important; right:208px !important; top:20px !important; width:304px !important;} html body #hud.inaba-notices #battle-notices:not(.choosing) > :is(#objectives:not(.expand),#battle-message){position:relative !important; inset:auto !important; transform:none !important; width:100% !important; max-width:100% !important; height:auto !important; flex:0 0 auto; min-width:0;}}'
    // 共通の台詞の表示指定より優先して、隠した札を畳む。空の黒帯を残さない。
    + 'html body #hud.inaba-notices #battle-notices #battle-message > div#subtitle:is([hidden],.notice-muted){display:none !important;}'
    // 札の幅を保ったまま縦だけ広げる。三行の台詞を任務の下端で切らない。
    + '@media(max-height:500px){html body #hud #battle-notices:not(.choosing){top:60px !important; width:min(300px,34vw) !important; max-height:calc(100% - 124px) !important;} html body #hud #battle-notices #battle-message > :is(#subtitle,.battle-notice){font-size:max(15px,calc(15px * var(--text-scale,1))) !important; line-height:1.6 !important; white-space:normal; overflow:visible; max-height:none !important;} html body #hud #battle-notices #objectives:not(.expand) #obj-list{max-height:60px; overflow:hidden;} html body #hud:has(#battle-message:not([hidden]) #subtitle:not(:empty)) #crosshair{visibility:hidden;} }'
    + '#hud #vignette.dying, #hud.inaba-down #vignette { backdrop-filter:none; -webkit-backdrop-filter:none; mask-image:none; -webkit-mask-image:none; animation:none; background:rgba(12,10,8,.18); box-shadow:inset 0 0 170px rgba(0,0,0,.65); }';
  // 横持ちでも下知の札に高さを与える。読む部分だけ送り、出陣の釦は残す。
  // 手ほどきも任務札の中に入る。本文の高さを確保し、下の操作文を切らない。
  style.textContent += '@media(max-height:500px){html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list{max-height:none !important; overflow:visible !important;} html body #hud #battle-notices #objectives > #tutorial.coach:not([hidden]):not(.notice-muted){height:auto !important; min-height:min-content; max-height:none !important; overflow:visible !important; flex-shrink:0;} html body #hud #battle-notices #tutorial.coach :is(.what,.how){white-space:normal; max-height:none !important; overflow:visible !important;}}';
  style.textContent += '#hud #intro[data-battle="inabayama"] > .card.card {display:flex; flex-direction:column; min-height:0;}'
    + '#hud #intro[data-battle="inabayama"] .intro-reading {flex:1 1 auto; min-height:0; overflow-y:auto; touch-action:pan-y; overscroll-behavior:contain; padding-bottom:12px;}'
    + '#hud #intro[data-battle="inabayama"] #intro-go {flex:0 0 auto; margin-top:8px;}'
    // 高い画面では人物紹介まで読める高さを使い、名の途中で切れた細い帯を残さない。
    + '@media(min-height:501px){html body #hud #intro[data-battle="inabayama"] > .card.card {width:min(560px,calc(100vw - 32px)); height:min(680px,calc(100dvh - 32px)); max-height:calc(100dvh - 32px) !important;}}'
    + '@media(max-height:500px){html body #hud #intro[data-battle="inabayama"] > .card.card {width:min(560px,calc(100vw - 32px)); height:calc(100dvh - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)); max-height:calc(100dvh - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)) !important;} html body #hud #intro[data-battle="inabayama"] .ttl {font-size:max(24px,calc(24px * var(--text-scale,1))); line-height:1.4;}}';
  hud.root.appendChild(style);
  const look = new THREE.Vector3(), safe = new THREE.Vector3(), forward = new THREE.Vector3();
  const candidate = new THREE.Vector3(), body = new THREE.Vector3(), foeBody = new THREE.Vector3(), downOrigin = new THREE.Vector3();
  const viewProbe = new THREE.Vector3();
  const clearFallFog = () => {
    // 霧の小数部は雲の影に使う。見通しだけ広げ、谷底の形を残す。
    const fog = W.scene.fog;
    fog.far = Math.max(280, Math.floor(fog.far)) + fog.far % 1;
  };
  // 地面すれすれの視点は横画面を土で埋める。体まで見通せる位置へ戻す。
  // 候補と見本は使い回し、近い山肌に遮られた時だけ調べる。
  const clearMountainView = (camera) => {
    body.copy(player.u.pos); body.y += 1.2;
    const ground = drawGroundAt(W, camera.position.x, camera.position.z);
    // 視点が地上にあっても、持ち上げた後の角度制限で体が画面外へ
    // 出ることがある。最後の向きで胸が見えるかも確かめる。
    const thirdPerson = player.fpK < 0.5 && player.u.alive;
    camera.updateMatrixWorld();
    viewProbe.copy(body).project(camera);
    const bodyVisible = !thirdPerson || Math.abs(player.pitch) > 0.3 || (Math.abs(viewProbe.x) < 0.8 && Math.abs(viewProbe.y) < 0.75
      && viewProbe.z > -1 && viewProbe.z < 1 && camera.position.distanceToSquared(body) > 1);
    // 胸が見えていても、すぐ前の山肌で画面が埋まる向きは選び直す。
    camera.getWorldDirection(forward);
    const frontX = camera.position.x + forward.x * 3, frontZ = camera.position.z + forward.z * 3;
    const frontClear = camera.position.y + forward.y * 3 > drawGroundAt(W, frontX, frontZ) + 0.3;
    if (bodyVisible && frontClear && camera.position.y - ground >= 0.8 && player.camBlockHit(body, camera.position) === null) return;
    const yaw = player.yaw;
    let found = false;
    for (let i = 0; i < 16; i++) {
      const side = i % 8;
      const angle = yaw + (side % 2 ? 1 : -1) * Math.ceil(side / 2) * Math.PI / 4;
      // 高く上げる代わりに胸へ寄せる。狭い折れで真下を向く視点にしない。
      const distance = i < 8 ? 3 : 1.4;
      // 近くへ寄せた時は高さも下げる。高さだけを残すと、最後に
      // 下向きを抑えた際に主人公が画面の下へ消える。
      candidate.set(body.x - Math.sin(angle) * distance, body.y + distance * 0.35,
        body.z - Math.cos(angle) * distance);
      let clear = true;
      for (let j = 0; j < 5; j++) {
        const x = candidate.x + (j === 1 ? 0.7 : j === 2 ? -0.7 : 0);
        const z = candidate.z + (j === 3 ? 0.7 : j === 4 ? -0.7 : 0);
        if (candidate.y < Math.max(W.heightAt(x, z), drawGroundAt(W, x, z)) + 0.8) { clear = false; break; }
      }
      if (!clear || player.camBlockHit(body, candidate) !== null) continue;
      camera.position.copy(candidate); found = true; break;
    }
    if (!found) {
      // 横へ引けない時は肩のすぐ後ろ。頭上から足元を見下ろさない。
      candidate.set(body.x - Math.sin(yaw) * 0.2, body.y + 0.07, body.z - Math.cos(yaw) * 0.2);
      if (candidate.y > drawGroundAt(W, candidate.x, candidate.z) + 0.8
        && player.camBlockHit(body, candidate) === null) camera.position.copy(candidate);
    }
    look.copy(camera.position).add(forward); camera.up.set(0, 1, 0); camera.lookAt(look); camera.updateMatrixWorld();
    guardDrawCamera(W, camera, cameraMeasure);
    look.copy(camera.position).add(forward); camera.lookAt(look); camera.updateMatrixWorld();
  };
  // 倒れた体を上から見る。歩行用の補間だけでなく、描く山肌と建物も避ける。
  F.downCamera = () => {
    // 倒れた体が坂を滑ったら、最初の位置の足場の裏を見続けない。
    if (F.downCameraReady && downOrigin.distanceToSquared(player.u.pos) > 0.25) F.downCameraReady = false;
    if (!F.downCameraReady) {
      const p = player.u.pos;
      forward.set(W.heightAt(p.x + 3, p.z) - W.heightAt(p.x - 3, p.z), 0,
        W.heightAt(p.x, p.z + 3) - W.heightAt(p.x, p.z - 3));
      const last = player.lastHit;
      F.downHit = last && rt.t - last.t < 6 && Number.isFinite(last.x) && Number.isFinite(last.y) && Number.isFinite(last.z)
        && last.kind !== 'fire' && last.kind !== 'fall' ? last : null;
      if (F.downHit) forward.set(F.downHit.x - p.x, 0, F.downHit.z - p.z);
      if (forward.lengthSq() < 0.04) { rt.camera.getWorldDirection(forward); forward.y = 0; }
      if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
      forward.normalize();
      body.set(p.x, p.y + 0.65, p.z);
      body.y = Math.max(body.y, W.heightAt(p.x, p.z) + 0.35, drawGroundAt(W, p.x, p.z) + 0.35);
      look.copy(body);
      if (F.downHit) {
        foeBody.set(F.downHit.x, F.downHit.y + 1.1, F.downHit.z);
        foeBody.sub(body).clampLength(0, 2); look.copy(body).addScaledVector(foeBody, 0.35);
      }
      safe.copy(body); safe.y += 3.5;
      // 真下を向くと上向きの軸が視線と重なる。体の斜め上から見る。
      safe.x -= forward.x * 0.3; safe.z -= forward.z * 0.3;
      // どの横向きも塞がる時の真上の視点も、屋根・板を突き抜けさせない。
      const overheadHit = player.camBlockHit(body, safe);
      if (overheadHit !== null) safe.lerpVectors(body, safe, Math.max(0, overheadHit - 0.1));
      let best = -Infinity;
      for (let i = 0; i < 27; i++) {
        const side = i % 9, lift = Math.floor(i / 9) * 2;
        const a = Math.atan2(forward.x, forward.z) + side * Math.PI / 4;
        const distance = side === 8 || player.u.naka ? 0.2 : 3.2;
        candidate.set(p.x - Math.sin(a) * distance, p.y + 4.5 + lift, p.z - Math.cos(a) * distance);
        candidate.x = Math.max(-W.half + 4, Math.min(W.half - 4, candidate.x));
        candidate.z = Math.max(-W.half + 4, Math.min(W.half - 4, candidate.z));
        // 持ち上げは壁の判定より先。判定の後で上げると屋根の中へ戻ってしまう。
        for (let j = 0; j < 6; j++) {
          const x = candidate.x + Math.sin(j * Math.PI / 3) * 0.9, z = candidate.z + Math.cos(j * Math.PI / 3) * 0.9;
          candidate.y = Math.max(candidate.y, W.heightAt(x, z) + 0.8, drawGroundAt(W, x, z) + 0.8);
        }
        const hit = player.camBlockHit(body, candidate);
        if (hit !== null) candidate.lerpVectors(body, candidate, Math.max(0, hit - 0.35 / body.distanceTo(candidate)));
        // 視線の中心だけでなく、画面の端を塞ぐ近い壁も避ける。
        player.camFrontClear(body, candidate, look, !!player.u.naka);
        if (player.camBlockHit(body, candidate) !== null) continue;
        if (candidate.y < p.y + 1.6) continue;
        let clear = true;
        for (let j = 1; j <= 12; j++) {
          const t = j / 12, x = body.x + (candidate.x - body.x) * t, z = body.z + (candidate.z - body.z) * t;
          const ground = Math.max(W.heightAt(x, z), drawGroundAt(W, x, z));
          if (body.y + (candidate.y - body.y) * t < ground + 0.35) { clear = false; break; }
        }
        if (!clear) continue;
        const foeClear = F.downHit && player.camBlockHit(foeBody, candidate) === null;
        const score = Math.min(25, candidate.distanceToSquared(body)) - side * 0.1 - lift
          + (foeClear ? 12 : 0);
        if (score > best) { best = score; safe.copy(candidate); }
      }
      player.fpK = 0; player.u.fpk = 0;
      rt.camera.near = 0.1; rt.camera.updateProjectionMatrix();
      F.downCameraReady = true;
      downOrigin.copy(player.u.pos);
      hud.root.classList.add('inaba-down');
    }
    if (F.downHit) {
      const hit = F.downHit, foe = hit.source;
      const live = foe?.pos && !foe.gone && Math.hypot(foe.pos.x - hit.x, foe.pos.z - hit.z) < 12;
      foeBody.set(live ? foe.pos.x : hit.x, (live ? foe.pos.y : hit.y) + 1.1, live ? foe.pos.z : hit.z);
      foeBody.sub(body).clampLength(0, 2); look.copy(body).addScaledVector(foeBody, 0.35);
    }
    look.y = Math.min(look.y, safe.y - 0.8);
    rt.camera.position.copy(safe); player.camPos.copy(safe);
    clearFallFog();
    rt.camera.up.set(0, 1, 0); rt.camera.lookAt(look); rt.camera.updateMatrixWorld();
    guardDrawCamera(W, rt.camera, cameraMeasure);
    if (!player.u.naka) clearMountainView(rt.camera);
    safe.copy(rt.camera.position);
    player.camPos.copy(rt.camera.position);
  };
  player.updateCamera = function (dt, camera) {
    if (!this.u.alive || rt.result?.down) { F.downCamera(); return; }
    // 山道でも手で決めた向きと上下角を保つ。
    const onMountain = F.step >= 3 || this.u.pos.y > 20;
    updateCamera.call(this, dt, camera);
    // 足元は水平に切った細道。体は横へ倒さず、進む坂に合わせて前へ折る。
    for (const u of rt.army.units) {
      if (!u.alive || u.mounted || u.isStruct || u.naka || u.climb || u.fall) continue;
      const q = F.step === 3 ? karaSample(u.pos.x, u.pos.z) : null, on = q && q.d <= KARA_SHOULDER && Math.abs(u.pos.y - q.y) < 2;
      if (on || u._inabaLean) {
        const uphill = on ? q.grade * (q.dx * Math.sin(u.heading) + q.dz * Math.cos(u.heading)) : 0;
        u._inabaLean = on;
        u.mesh.rotation.set(Math.max(-0.12, Math.min(0.24, Math.atan(uphill) * 0.4)), u.heading, 0, 'YXZ');
      }
    }
    if (F.downCameraReady) hud.root.classList.remove('inaba-down');
    F.downCameraReady = false;
    // 坂による持ち上げや被弾の揺れも含め、水平線と前方を保つ。
    camera.getWorldDirection(forward);
    const falling = this.lastHit?.kind === 'fall' && rt.t - this.lastHit.t < 3;
    if (falling) {
      clearFallFog();
      look.copy(this.u.pos); look.y += 0.65;
      camera.up.set(0, 1, 0); camera.lookAt(look); camera.updateMatrixWorld();
      camera.getWorldDirection(forward);
    } else if (onMountain) {
      const horizontal = Math.hypot(forward.x, forward.z);
      forward.y = Math.max(-horizontal * 2, Math.min(horizontal * 2, forward.y));
      forward.normalize();
      camera.up.set(0, 1, 0); look.copy(camera.position).add(forward);
      camera.lookAt(look); camera.updateMatrixWorld();
    }
    if (onMountain && !this.u.naka) {
      // 地面を避けて視点だけ上げると、手前の山肌が人物を隠す。
      // 胸から視点への線を調べ、壁の手前まで寄せてから描く面を避ける。
      body.copy(this.u.pos); body.y += 1.2;
      candidate.copy(camera.position).sub(body);
      const n = Math.min(48, Math.max(1, Math.ceil(candidate.length() / 0.3)));
      let blocked = false;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        look.copy(body).addScaledVector(candidate, t);
        if (look.y >= Math.max(W.heightAt(look.x, look.z), drawGroundAt(W, look.x, look.z)) + 0.18) continue;
        camera.position.copy(body).addScaledVector(candidate, Math.max(0, (i - 1) / n));
        blocked = true; break;
      }
      const lift = guardDrawCamera(W, camera, cameraMeasure);
      if (blocked || lift > 0.05) {
        look.copy(camera.position).add(forward);
        camera.lookAt(look); camera.updateMatrixWorld(); camera.getWorldDirection(forward);
      }
      // 地形を避けて寄っても、手で決めた視線を保つ。
      look.copy(camera.position).add(forward);
      // 柱・屋根と画面の手前を避ける。
      this.camFrontClear(body, camera.position, look, false);
      const hit = this.camBlockHit(body, camera.position);
      if (hit !== null) camera.position.lerpVectors(body, camera.position,
        Math.max(0, hit - 0.2 / Math.max(0.2, body.distanceTo(camera.position))));
      camera.lookAt(look); camera.updateMatrixWorld();
      guardDrawCamera(W, camera, cameraMeasure);
      camera.getWorldDirection(forward);
      // 遮蔽物を避けた後の向きにも制限を掛ける。上で制限した向きは
      // camFrontClear の lookAt で変わることがある。
      if (!falling) {
        const horizontal = Math.hypot(forward.x, forward.z);
        if (horizontal < 0.01) forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        else forward.y = Math.max(-horizontal * 2, Math.min(horizontal * 2, forward.y));
        forward.normalize(); look.copy(camera.position).add(forward);
        camera.up.set(0, 1, 0); camera.lookAt(look); camera.updateMatrixWorld();
        guardDrawCamera(W, camera, cameraMeasure);
      }
      // ここより後で角度を変えない。補正後も体を見通せる位置で確定する。
      clearMountainView(camera);
      camera.getWorldDirection(forward);
      this.camPos.copy(camera.position);
    }
    // 町の軒先でも、屋根に遮られた背中を見通せる所へ寄せる。
    if (!onMountain && !this.u.naka && this.fpK < 0.5) {
      clearMountainView(camera);
      camera.getWorldDirection(forward);
      this.camPos.copy(camera.position);
    }
    safe.copy(camera.position); look.copy(safe).add(forward);
  };
  rt.dispose = function () {
    W.addFire = addFire;
    for (const mat of F.townFlameMaterials.values()) mat.dispose();
    F.townFlameMaterials.clear();
    rt.army.hooks.onArrowRain = onArrowRain;
    player.nearAllyVisit = nearAllyVisit;
    player.canStep = canStep;
    rt.army.steer = steer;
    hud.say = hudSay;
    hud.root.classList.remove('inaba-down', 'inaba-notices'); style.remove(); this.say = say; this.bark = bark; player.updateCamera = updateCamera; this.dispose = dispose;
    return dispose.call(this);
  };
}

// 裏道と民家の造成面だけ細分する。足場・庭・山肌を一枚の地面にする。
function buildKaraTrail(rt) {
  const W = rt.world, oldHeight = W.heightAt;
  // 造成の境目を大きな三角形でまたぐと、水平にした庭が再び斜面になる。
  // 家の周りだけ既存の細分枠へ入れる。調べる入れ物は読み込み時に一度だけ作る。
  const homes = HOUSES.map(([x, z, r], i) => ({ x, z, c: Math.cos(r), s: Math.sin(r),
    w: (6 + i % 3) / 2 + 5.1, d: 4.5 / 2 + 5.1 }));
  const nearHome = (x, z, radius = 0) => {
    for (const h of homes) {
      const dx = x - h.x, dz = z - h.z;
      if (Math.abs(dx * h.c - dz * h.s) < h.w + radius
        && Math.abs(dx * h.s + dz * h.c) < h.d + radius) return true;
    }
    return false;
  };
  const old = W.terrain.geometry, attrs = old.attributes, p = attrs.position;
  // 描く面の間引きが済んでいても、山肌全体から道を作る。詰めた描画用の索引は使わない。
  const source = old.userData.terrainViewIndex || old.index.array;
  const names = Object.keys(attrs).filter((name) => name !== 'normal');
  const arrays = names.map((name) => Array.from(attrs[name].array));
  const vertices = arrays[names.indexOf('position')], indices = [], shared = new Map(), coarse = [];
  for (let i = 0; i < p.count; i++) shared.set(`${p.getX(i).toFixed(5)},${p.getZ(i).toFixed(5)}`, i);
  // 一つの面を十六枚へ。隣の面と頂点を共用し、折れや境目に穴を作らない。
  const vertex = (a, b, c, u, v) => {
    const w = 1 - u - v;
    const x = p.getX(a) * w + p.getX(b) * u + p.getX(c) * v;
    const z = p.getZ(a) * w + p.getZ(b) * u + p.getZ(c) * v;
    const key = `${x.toFixed(5)},${z.toFixed(5)}`;
    if (shared.has(key)) return shared.get(key);
    const at = vertices.length / 3;
    for (let k = 0; k < names.length; k++) {
      const attr = attrs[names[k]], out = arrays[k], n = attr.itemSize;
      for (let j = 0; j < n; j++) out.push(attr.array[a * n + j] * w + attr.array[b * n + j] * u + attr.array[c * n + j] * v);
    }
    shared.set(key, at); return at;
  };
  for (let i = 0; i < source.length; i += 3) {
    const a = source[i], b = source[i + 1], c = source[i + 2];
    const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3, z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
    const radius = Math.max(Math.hypot(p.getX(a) - x, p.getZ(a) - z), Math.hypot(p.getX(b) - x, p.getZ(b) - z), Math.hypot(p.getX(c) - x, p.getZ(c) - z));
    if (karaSample(x, z).d > KARA_BLEND + radius && !nearHome(x, z, radius)) { coarse.push([a, b, c]); continue; }
    for (let u = 0; u < 4; u++) for (let v = 0; u + v < 4; v++) {
      const va = vertex(a, b, c, u / 4, v / 4), vb = vertex(a, b, c, (u + 1) / 4, v / 4), vc = vertex(a, b, c, u / 4, (v + 1) / 4);
      indices.push(va, vb, vc);
      if (u + v < 3) indices.push(vb, vertex(a, b, c, (u + 1) / 4, (v + 1) / 4), vc);
    }
  }
  // 細分した面と元の面の境目も同じ頂点で閉じる。辺の途中の高さが
  // 変わった時に、元の三角形だけが直線のまま残ると山肌が裂ける。
  for (const [a, b, c] of coarse) {
    const rim = [];
    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      rim.push(from);
      for (let j = 1; j < 4; j++) {
        const t = j / 4, x = p.getX(from) * (1 - t) + p.getX(to) * t, z = p.getZ(from) * (1 - t) + p.getZ(to) * t;
        const at = shared.get(`${x.toFixed(5)},${z.toFixed(5)}`);
        if (at !== undefined) rim.push(at);
      }
    }
    if (rim.length === 3) { indices.push(a, b, c); continue; }
    const center = vertex(a, b, c, 1 / 3, 1 / 3);
    for (let j = 0; j < rim.length; j++) indices.push(center, rim[j], rim[(j + 1) % rim.length]);
  }
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i], z = vertices[i + 2];
    if (karaSample(x, z).d < KARA_BLEND || nearHome(x, z)) vertices[i + 1] = height(x, z);
  }
  const geo = new THREE.BufferGeometry();
  for (let k = 0; k < names.length; k++) geo.setAttribute(names[k], new THREE.Float32BufferAttribute(arrays[k], attrs[names[k]].itemSize));
  geo.setIndex(indices); geo.computeVertexNormals(); geo.computeBoundingSphere();
  W.terrain.geometry = geo; old.dispose();
  // 格子の上下差も実際の道へ合わせる。画質によって格子の番号を取り違えない。
  const row = Math.round(W.half * 2 / W.step) + 1;
  for (let z = 0; z < row; z++) for (let x = 0; x < row; x++) {
    const px = -W.half + x * W.step, pz = -W.half + z * W.step;
    if (karaSample(px, pz).d < KARA_BLEND || nearHome(px, pz)) W.grid[z * row + x] = drawGroundAt(W, px, pz);
  }
  W.heightAt = function (x, z) {
    if (karaSample(x, z).d < KARA_BLEND || (x > -28 && x < 54 && z > 28 && z < 108)) {
      const y = drawGroundAt(this, x, z);
      if (Number.isFinite(y)) return y;
    }
    return oldHeight.call(this, x, z);
  };
  // 視点も同じ地面を避ける。毎コマは近い格子の面だけを読む。
  const cameraBlock = W.cameraBlockFraction;
  W.cameraBlockFraction = function (from, to) {
    let hit = cameraBlock?.call(this, from, to) ?? null;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const n = Math.min(48, Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / 0.4)));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (hit !== null && t >= hit) break;
      const x = from.x + dx * t, z = from.z + dz * t;
      if (karaSample(x, z).d < KARA_BLEND && from.y + dy * t < this.heightAt(x, z) + 0.12) { hit = Math.max(0, (i - 1) / n); break; }
    }
    return hit;
  };
}

const inabayama = {
  // 近い屋根・壁だけ共通の見通し処理で抜き、町と柵の向こうを見渡せるようにする。
  nearFade: true,
  jinkei: INABAYAMA_JIN,
  // 見出しは大きな出来事（討ち取り・勝ち負け・雨上がり・合図の火）だけ。行き先や構えの指示の見出しは出さない（kaito 10/23）。
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /討ち取|討死|勝|崩れ|城が開く|合図の火|雨が上がった|届かず|進めず/.test(t),
  // ミッション（kaito 10/23 1・49・50）。右上の一行は「何をするか」だけ。向き・行き先の字は書かない。
  lendBow: true, // 美濃攻めは弓を覚える戦（kaito の役割分担）。問屋で買っていなくても弓を貸す。
  noSiegeCards: true, // 右の曲輪の札（未見・様子不明）は出さない。字は右上の一行だけ（kaito 10/23）。
  missions: ['この人についていく', '火の印へ', 'さくを守れ', '山道をのぼれ', '斎藤龍興の馬廻を討つ', '本丸に合図の火を放つ'],
  missionHeading(rt) {
    if (this.missionOf(rt) === 1) {
      if (rt.flags.lit >= NEED) return '町の出口へ';
      if (rt.G.lord) return '足軽の火付けを守れ';
    }
    return this.missions[this.missionOf(rt)];
  },
  missionOf(rt) {
    const F = rt.flags, ph = rt.phase;
    if (ph === 'end') return 5;
    if (ph === 'honmaru') {
      if (F.hata?.every(gone) && gone(F.tatsu) && gone(F.keep?.guard)) return 5;
      revealName(rt, '斎藤龍興'); return 4;
    }
    return ph === 'karamete' ? 3 : ph === 'ote' ? 2 : ph === 'burn' ? 1 : 0;
  },
  // 民は描画専用。兵の名簿・人数・当たり・戦功には入れない（war_people.js）。
  civilianCrowd: {
    bounds: { minX: -176, maxX: 176, minZ: -176, maxZ: 176 }, bands: CIVILIAN_BANDS,
    // 決着後の終幕でも町の火は残る。家に残る者の警戒と南への避難を続ける。
    evacuateAfterBattle: true,
    // 家や踏み跡と同じ描画面へ足を据える。通行・兵の警戒に使う地形は保つ。
    drawHeight: drawGroundAt,
    // 山上の守備兵の平均位置ではなく、それぞれの町外れから井口の騒ぎを見る。
    // 近景も七人の使い回しのまま、町人・商人・年寄りを百姓の姿で代用しない。
    nearKinds: ['farmer', 'townsman', 'merchant', 'woman', 'child', 'monk', 'elder'],
    // 同じ身分の近景が使用中なら共用の軽い姿を保つ。空いた百姓の姿へ着替えさせない。
    strictNearKinds: true,
    // 列が見物場所へ張り出した時は、川の東岸・里の脇へ続く退き道の手前で見物する。
    // 水や家を横切らず、元の場所から二十四歩以内。民の上限は増やさない。
    watchPlacementDistance: 24,
    // 寺や町外れの最初の角が兵に近ければ、その先の道端まで探す。
    // 見物を始めた角から南へ逃がし、通過済みの角へ引き返させない。
    followWatchEscape: true,
    // 見物の立ち位置から退き道の次の角まで、水や家を横切らずに出られること。
    checkWatchEscape: true,
    // 立つ所だけでなく、最初の角まで兵の列を横切らず退ける道端で見物する。
    checkWatchEscapeSoldiers: true,
    // 交戦中の兵や大火の警戒も逃走時と揃え、初めは安全な道端から見物する。
    checkWatchDanger: true,
    // 町・寺・村の戸口も最初の角へ出られる位置にする。家の脇から六歩以内で探す。
    // 女・子・年寄りが配置の散らばりで軒の反対側へ回り、逃げ出せなくなるのを防ぐ。
    doorPlacementDistance: 6, checkDoorEscape: true,
    avoidLightArmies: true, avoidClashes: true, scanIndividuals: true,
    // 頭上の曲輪や別の尾根の兵を、麓の路地にいる兵として扱わない。
    // 八歩以内の高さにいる兵は従来どおり警戒する。地形を縮めた遊び上の目安。
    soldierHeightClearance: 8,
    // 主人公の刀・槍だけでなく、弓を引く姿や鉄砲の発射も町・寺・里の者が警戒する。
    watchPlayerCombat: true,
    // 兵の短い発砲も見落とさず、撃った直後に的を失っても民は遠巻きに退く。
    rememberSoldierCombat: true,
    // 南へ逃げる途中も、進んでくる兵・乱戦や新しい火で路地が塞がれたら一歩を選び直す。
    recheckEscapeStep: true,
    // 兵が去り火も落ちた路地では、古い危険を避け続けず南の退き道をたどる。
    followRouteWhenCalm: true,
    // 曲がった路地で退く向きが塞がれた時だけ、安全な脇道も探す。
    // 兵・火・水・家の通行判定は保ち、危険からの距離だけで戸口に閉じ込めない。
    allowSafeRouteDetour: true,
    // 延焼や兵で生活道の角が塞がれたら、通れる次の道へ手前から回り込む。
    // 寺・町・里の南への退き道は保ち、家や川を横切る近道は選ばない。
    bypassUnsafeRouteCorner: true,
    // 民家の大火だけでなく、道端の焚き火も避ける。兵の手の松明は兵との距離で避ける。
    fireSize: 1,
    // 逃げる先の判定と歩行中の見直しで、すべての火から同じ十歩を空ける。
    // 一番近い火だけを見て、隣の燃える家や焚き火へ逃げ込ませない。
    fireClearance: 10,
    // 強風の日の町の大火は遠巻きの民や南の里にも見えるとする推定。
    // 南の里の見物人は町から八十〜百三十歩ほど離れる。延焼を待たず、大火を見て退く。
    // 小さな焚き火で里全体を逃がさず、退く一歩の安全判定は近い火だけを見る。
    fireAlarm: { size: 2, radius: 140 },
    // 路地を逃げる隣人の声が近くの戸口にも届く。距離は遊び上の推定。
    // 町・寺・里の者は兵を直に見るまで待たず、指定済みの南の道へ退く。
    neighborAlarmRadius: 18,
    // 大火から退く途中は、見物をやめた時と同じ範囲で家族の待ち止まりを避ける。
    waitFireAlarm: true,
    // 家や寺の戸口へ兵が迫っても、既存の南への避難路へ退けるようにする。
    retreatFromSoldiers: true,
    // 町外れや川沿いで兵・火を迂回したら、越えた角へ戻らず南の退き道を続ける。
    passRouteCorners: true,
    // 路地の角を省く前に次の目印まで通れるかを見る。先の家・塀へ向けて角を捨てない。
    // 次の路地を見通せない時は、町・寺・村の角まで歩幅を詰めてから曲がる。
    checkFullEscapeCorner: true,
    // 川の東岸・南の町外れも、兵や火が迫る間は退避済みにしない。
    safeRouteExit: true,
    // 南の退き口が塞がれた時は、同じ南端の近い脇へ退く。川を渡る道や
    // 里の家・急斜面を横切る道は共通の通行判定で除く。避難口の幅は推定。
    routeExitOffsets: [16, -16, 32, -32, 48, -48],
    // 退き口までの道に兵や火が入った時も、家族全員が歩ける別の退き口を選ぶ。
    checkRouteExitApproach: true,
    // 町・寺・里の家族は、子や年寄りを置き去りにせず南の退き道を走る。
    keepFamiliesTogether: true,
    // 路地で離れた家族は、安全な道端で六歩以内に揃うまで待つ。
    familyWaitDistance: 6,
    // 家の角や寺の塀越しに近く見えても、生活道で遅れている子・年寄りを待つ。
    familyFollowPath: true,
    // 町・寺・村から川沿いへ合流しても、前の人をすり抜けず空いた脇へ退く。
    keepCivilianSpacing: true,
  },
  // 視点へ入り込む一人だけ全身を避け、隣の味方の顔や具足を透かさない。
  nearAllyFadeRadius: 1.1,
  nearAllySolidBody: true,
  nearAllyHorseFade: true,
  nearAllyBodyOnly: true,
  // 屋根や壁を画面の四角で切らず、視点の直近だけ既存の距離の処理で避ける。
  nearSceneryScreenCut: false,
  nearLongWeaponRadius: 2.8,
  nearHoroRadius: 3.8,
  nearHoroHide: true,
  battleVoices: { lines: { ally: { order: ['組頭「藤吉郎の旗に続け。列を離れるな」', '組頭「道を確かめ、前の仲間と並べ」'] } } },
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  compactIntro: true,
  // 自分は足元の輪とひし形。相手の囲みや行き先の旗と形で分ける。
  compactPlayerSign: true,
  playerSignMinScale: .55,
  playerSignScale: .55,
  compactFieldGuides: true,
  // 具足と手足を白い人形で覆わず、敵の刀・味方の丸・自分の足元で見分ける。
  noUnitContrast: true,
  compactCombatGuides: true,
  groundCombatMarkers: true,
  compactFloorGuides: true,
  // 手前の騎手や旗を視点から避けた時は、空の旗枠を残さない。
  visibleFlagGuides: true,
  // 家や退き口の大輪で地面と兵を覆わず、中心の印だけを残す。
  smallTaskAreas: true,
  smallRetreatAreas: true,
  taskAreaFootRing: true,
  // 止血後に残る手足の傷だけで、登る道の案内を退避へ替え続けない。
  retreatForLimbWounds: false,
  keepRetreatReason: true,
  keepWoundRetreatReason: true,
  retreatGuideLabel(rt, reached) {
    const u = rt.player.u;
    // 横持ちの狭い札でも、理由と動作を十一字以内で読めるようにする。
    // 手当ての操作と道沿いの退避は、省略して分からなくしない。
    if (u.wounds?.bleed > .0001) return reached ? '「手当て」を三秒長押し' : '出血。道なりに味方へ';
    if (u.hp < u.maxHp * .3) return reached ? '命が少ない。構えよう' : '命が少ない。味方へ退く';
    return reached ? '味方と かまえよう' : '道なりに 味方の後ろへ';
  },
  treatmentApproachLabel: '下がって 手当てしよう',
  retreatPathAllowed(rt, point) {
    // 手当ての場所も同じ歩幅で調べ、切岸を横切る直線へ案内しない。
    point.y = rt.world.heightAt(point.x, point.z);
    return inabaRetreatReachable(rt, point);
  },
  // 共通の退避は本人の行き先も読む。通常の移動では本人を除外するため、
  // 退く時だけ兵と同じ曲がり角をたどらせる。ほかの戦には持ち越さない。
  botRetreatWay(rt, point) {
    return inabaMoveWay(rt.army, rt.player.u, point, rt.flags.step === 3);
  },
  botRetreatStepAllowed(rt, point) {
    point.y = rt.world.heightAt(point.x, point.z);
    return inabaRetreatReachable(rt, point);
  },
  // 傷ついた味方の救援だけで、山道や火付けの行き先を上書きしない。
  keepRescueTaskLabel: true,
  // 出口で共に戦う味方を一人示す。印のために命令や戦力は変えない。
  rescueGuideTarget(rt) {
    const F = rt.flags;
    if (F.step !== 1 || F.lit < NEED || !F.exitArrived || F.ending || F.regroup || F.retreatMarked) return null;
    const p = rt.player.u.pos;
    if (F.helpGuideAt > rt.t && F.helpGuideUnit?.alive && !F.helpGuideUnit.gone &&
        !F.helpGuideUnit.fleeing && !F.helpGuideUnit.woundOut &&
        Math.hypot(F.helpGuideUnit.pos.x - p.x, F.helpGuideUnit.pos.z - p.z) < 40) return F.helpGuideUnit;
    F.helpGuideAt = rt.t + .5;
    let best = null, score = Infinity;
    for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.fleeing || u.woundOut || u.isPlayer || u.isStruct || u.civ || u.team !== rt.player.u.team) continue;
      const distance = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (distance >= 40) continue;
      const fighting = u.target?.alive && u.target.team !== u.team;
      const d = distance - (fighting ? 12 : 0) - (u === F.helpGuideUnit ? 6 : 0);
      if (d < score) { best = u; score = d; }
    }
    F.helpGuideUnit = best;
    return best;
  },
  // 角へ近づいても地面の印で人の全身を覆わない。向きと先端は保つ。
  cornerArrowMaxPixels: 64,
  // 振り向く説明は一度に四秒まで。その後も端の方向印は残す。
  dodgeTurnDuration: 4,
  // 町の敵が動き始めた後も、見回す練習だけで戦の時計を止め続けない。
  pauseTurnPractice: false,
  pacingWait: inabaPacingWait,
  dodgeTurnLabel: (rt, right, touch) => `${touch ? '画面を' : ''}${right ? '右' : '左'}へ${touch ? 'なぞる' : '向く'}`,
  keepDestinationTask: true,
  // 曲がり角の下知を「この旗へ」で上書きせず、歩数は任務札の一か所にまとめる。
  keepFlagTravelTask: true,
  hideGuideSteps: true,
  namedGuideMarkers: true,
  groundRouteGuide: true,
  // 遠い角が画面外でも、今歩く道の上に短い案内を残す。
  // 角を回る順序は従来の案内と共有し、到着や兵の移動の判定は変えない。
  guidePath(rt, marker) {
    const F = rt.flags, goal = F.karaGuide;
    if (F.step !== 3 || marker?.id !== 'karaGuide' || !goal) return null;
    const p = rt.player.u.pos, dx = goal.x - p.x, dz = goal.z - p.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.6) return null;
    const path = F.karaFloorPath || (F.karaFloorPath = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]);
    const t = Math.min(1, 6 / distance);
    path[0].x = p.x; path[0].y = p.y; path[0].z = p.z;
    path[1].x = p.x + dx * t; path[1].z = p.z + dz * t;
    path[1].y = rt.world.heightAt(path[1].x, path[1].z);
    return path;
  },
  travelGuideLabel: (rt) => rt.missionGuide?.marker?.entrance ? 'この家へ' : rt.flags.step === 1 && rt.flags.lit >= NEED ? '出口へすすもう' : rt.flags.step === 3 ? '道の印へすすもう' : rt.flags.step === 2 ? 'このはたへ' : '味方の旗へ',
  // 小地図では登っている裏道を残す。高さの違う大手・百曲りを重ねない。
  // 開いた全図では全ての道を読める。配列は設営前に一度だけ作り、使い回す。
  mapPaths: (rt, small) => small && rt.flags.step === 3 ? INABA_CLIMB_MAP : INABA_PATHS,
  introTaskFirst: true, // 人物紹介より先に、初めの行き先と勝つ条件を読めるようにする。
  introPeopleFolded: true,
  introText: 'まず印の人、藤吉郎のそばへ。三軒焼いたら、仲間と城を囲む。山では道の印をたどろう。',
  immediateTaskChanges: true, // 道へ戻る下知は、携帯の畳んだ任務にもすぐ出す。
  // 火付けと道の下知を、近くの射手による空き地への退避案内で隠さない。
  // 深手の時は、この戦で歩ける所を調べた味方の後ろの退き口を優先する。
  // 守兵と戦う段と矢の落下範囲の警告は、共通の案内を残す。
  routeGuidePriority(rt) {
    const F = rt.flags;
    if (F.ending) return false;
    return !!F.retreatMarked || !!F.regroup || F.step === 0 || F.step === 1 ||
      F.step === 3 && !inabaClimbGuideEnemy(rt) && (!F.guardOn || gone(F.kguard) || !inabaAtWoodGate(rt)) || F.step === 4 && !!F.sig;
  },
  combatTaskLabel: (rt) => inabaClimbGuideEnemy(rt) ? 'この敵をたおそう' : '',
  enemyTaskLabel: () => 'この人を たおす',
  noWake: true,   // 城の部隊が本物の兵を受け持ち、遠景から重ねて増やさない。
  // 斎藤勢が瑞龍寺山の信長の本陣を突いた記録はない。町の焼き討ちの最中に本陣の守りへ呼び戻さない。
  noTaishoRaid: true,
  uchisute: true, // 火付けと攻城を急ぐ。首を集める札を出さない。
  // 普通・易では、槍が重なっても満身から十八秒以上は退く余地を残す。
  meleeGrace: { rate: 0.05, burst: 0.08, interval: 0.85 },
  // 列や建物の当たりを残し、組の脇の空いた所から始める。
  spawn: { x: 44, z: 112, heading: Math.atan2(28 - 44, 104 - 112) },
  taskText(rt, text) {
    const F = rt.flags, it = rt.nearestInteract();
    text = text.replace(/藤吉郎の旗/g, '旗の人').replace(/鹿垣/g, 'さく').replace(/城兵/g, '城の敵').replace(/下知/g, '話');
    if (F.ending || F.retreatMarked || F.regroup && F.step !== 3) return text;
    if (F.step === 0) return it && !it.hold && /話す|話を聞く/.test(it.label) ? '話す' : '藤吉郎へ 近づく';
    if (!rt.G.lord && (F.step === 1 && F.lit < NEED || F.step === 4 && F.sig)) {
      const fire = it && (F.step === 1 ? /^h[0-9]+$/.test(it.id) : it.id === 'sig');
      return fire ? `「${it.label}」を長押し` : '戸口へ いこう';
    }
    // 放火を終えた後も、横持ちの行き先札へ長い下知をそのまま流さない。
    // 細かな説明は任務の本文に残し、今する事を一行に収める。
    if (F.step === 1 && F.lit >= NEED) return F.exitArrived ? '仲間をたすけよう' : '出口へ にげよう';
    if (F.step === 2) return this.waitOrderLabel(rt, F.holdPoint && Math.hypot(rt.player.u.pos.x - F.holdPoint.x, rt.player.u.pos.z - F.holdPoint.z) < 3);
    if (F.step === 3 && (!F.guardOn || gone(F.kguard) || !inabaAtWoodGate(rt))) {
      const q = F.karaGuide;
      if (!q) return '藤吉郎の列について登る';
      // 狙いの固定がなくても、実際に槍が届く敵を下知に反映する。
      // 遠い段の守兵や壁の向こうの敵では道の案内を隠さない。
      if (inabaClimbGuideEnemy(rt)) return 'この敵をたおそう';
      if (q.returning) return '道の中央へ戻ろう';
      const p = rt.player.u.pos;
      const distance = Math.hypot(p.x - q.x, p.z - q.z);
      // 遠い角の曲がり方を出し続けると、途中で道の縁へ曲がってしまう。
      // 長い直線ではまず印まで歩き、角が近づいてから曲がり方を伝える。
      if (distance > 8) return '道の印へすすもう';
      // 角の直前だけでは、通過判定で次の印へ替わり、曲がる下知を読む暇がない。
      // 遠い間は次の角の曲がり方を予告し、直前で曲がるよう伝える。
      let corner = F.karaNext || 1;
      for (let i = 1; i < corner; i++) {
        if (Math.hypot(q.x - KARA_TRAIL[i][0], q.z - KARA_TRAIL[i][1]) < .2) { corner = i; break; }
      }
      const a = KARA_TRAIL[corner - 1], b = KARA_TRAIL[corner], c = KARA_TRAIL[corner + 1];
      if (!a || !b || !c) return '道の印へすすもう';
      const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(turn) < .01) return '道の印へすすもう';
      const side = turn < 0 ? '左' : '右';
      return distance > 1.5 ? `次の角で${side}へ` : `${side}へまがる`;
    }
    if (F.step === 3) return '仲間と 木戸の敵を退けよう';
    if (F.step === 4 && !F.sig) return '仲間と 本丸の敵を退けよう';
    return text;
  },
  treatmentHouses(rt) { return rt.flags.houses; },
  waitOrderLabel: (rt, reached) => reached ? 'ここで まとう' : 'さくの旗へ すすもう',
  waitTravelLabel: () => 'さくの旗へ すすもう',
  // 案内だけに使う持ち場。兵の人数・動き・勝敗の判定は変えない。
  defenseLine(rt) {
    const F = rt.flags;
    if (F.step !== 2 || F.ending || F.regroup || !F.holdArrived) return null;
    return F.holdGuideLine || (F.holdGuideLine = {
      x: -4, z: SHIKA_Z, halfWidth: 34, depth: 14, flagZ: SHIKA_Z + 5,
      keepVisibleWithEnemy: true, flagOnly: true, label: 'さくの内・ここを守ろう',
    });
  },
  cornerEnemyGuide: true,
  objectiveEnemies(rt) {
    const F = rt.flags, marks = F.holdEnemyMarks || (F.holdEnemyMarks = []);
    if (F.step === 3) {
      const enemy = inabaClimbGuideEnemy(rt);
      marks.length = enemy ? 1 : 0;
      if (enemy) marks[0] = enemy;
      return marks;
    }
    if (F.step !== 2 || F.ending || F.regroup) { marks.length = 0; return marks; }
    if (F.holdEnemyScan > rt.t) return marks;
    F.holdEnemyScan = rt.t + .2;
    const p = rt.player.u.pos;
    let best = null, distance = 18;
    for (let i = 0; i < 2; i++) {
      const group = i ? F.ote2 : F.ote;
      if (!group || group === F.ote2 && !group.sent) continue;
      for (const u of group.units) {
        if (!u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget || u.offscreen || !sightScreenUnit(rt, u)) continue;
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z) - (u === marks[0] ? 2 : 0);
        if (d < distance) { best = u; distance = d; }
      }
    }
    marks.length = best ? 1 : 0;
    if (best) marks[0] = best;
    return marks;
  },
  // 戦いの最中も次の行き先を保ち、敵の近さでピンを消さない。
  missionPin(rt) {
    const F = rt.flags;
    if (F.ending) return null;
    let id = this.guideMarker(rt);
    // 追う先と敵の▼を分ける。木戸で戦う間も藤吉郎を見失わせない。
    if (id === 'kguard' || id === 'town' || id === 'town2' || id === 'honGuard') id = 'kino';
    const marker = rt.markers.find((m) => m.id === id);
    const pos = marker && (marker.guideDestination?.() || (typeof marker.pos === 'function' ? marker.pos() : marker.pos));
    if (!pos) return null;
    const pin = F.missionPin || (F.missionPin = { r: 0, hide: -2, waiting: false, arrived: false, always: true, silent: true });
    // 共通の印へ人・炎・入口の情報も渡す。位置だけでは自分を指す矢印になる。
    pin.marker = marker; pin.key = id;
    pin.unit = id === 'kino' && F.kinoU?.alive ? F.kinoU : null;
    pin.follow = !!pin.unit; pin.footRing = !!pin.unit;
    pin.fire = marker.guideSymbol === 'fire';
    pin.gate = marker.guideSymbol === 'gate';
    pin.x = pin.unit ? pin.unit.pos.x : pos.x; pin.z = pin.unit ? pin.unit.pos.z : pos.z;
    // 最初は登り口、その後は今まで通りの曲がり角。案内だけを切り替える。
    if (id === 'karaGuide' && F.karaNext === 1 && !F.karaEntryShown) {
      if (Math.hypot(rt.player.u.pos.x - KARA_FOOT.x, rt.player.u.pos.z - KARA_FOOT.z) <= 3) F.karaEntryShown = true;
      else { pin.x = KARA_FOOT.x; pin.z = KARA_FOOT.z; }
    }
    return pin;
  },
  // 火付け先は共通の大きな炎一本に集め、ほかの家に紛らわしい印を重ねない。
  guideMarker(rt) {
    const F = rt.flags;
    if (F.ending) return null;
    if (F.retreatMarked) return 'retreat';
    if (F.step === 0) return 'kino';
    if (F.step === 1 && F.lit >= NEED) return F.exitArrived ? 'kino' : 'townExit';
    // 山道では、離れた旗へ直進せず、次の折れをたどって列へ戻る。
    if (F.step === 3 && (!F.guardOn || gone(F.kguard) || !inabaAtWoodGate(rt))) return F.karaGuideMarked ? 'karaGuide' : F.guardOn ? 'kino' : 'kido';
    if (F.regroup && F.step !== 3) return 'kino';
    // 守備中は話し相手へ誘導せず、持ち場の旗と近い敵を示す。
    if (F.step === 2) return 'holdFlag';
    if (F.step === 1 && F.lit < NEED) return rt.G.lord ? (!gone(F.town) ? 'town' : F.town2.sent && !gone(F.town2) ? 'town2' : 'kino') : F.houseTargets?.[0] ? 'h' + F.houseTargets[0].i : 'kino';
    if (F.step === 3 && F.guardOn) return 'kguard';
    if (F.step === 4) return F.sig ? 'sig' : 'honGuard';
    return 'kino';
  },
  world: {
    compactScenery: true,
    // 視点を直接描く時も、面を選ぶ前に実際の山肌と手前の四隅を避ける。
    terrainContactView: true,
    lookoutLogFrame: true, // 高画質の各曲輪の井楼で、指定済みの丸太組みを描く。
    // 落ちた笠に頭の垂れ布を残さず、首のような支柱で立たせない。
    bareFallenHats: true,
    // 骨入りの体へ切り替わった後も、刺さった矢を飛来時の実寸へ戻す。
    keepPinnedArrowSize: true,
    // 斜めの矢も三軸で実寸を保ち、描く直前の胴や骨の倍率に追従する。
    pinnedArrowAxisScale: true,
    pinnedArrowRenderScale: true,
    // 落ちた笠と長柄も坂へ沿わせ、水平なまま宙へ張り出させない。
    slopeLitter: true,
    // 坂で倒れた兵は足元でなく胴の下を支え、宙に寝かせない。
    slopeContactFalls: true,
    groundedFalls: true,
    settleFallenLimbs: true,
    variedInfantry: true,
    infantryWeight: true,
    // 高画質の落ち影にも足元の柔らかい陰を重ねる。接触の土煙は見た目だけ。
    contactShadows: true,
    contactDust: true,
    livingSpearHedge: true,
    // 後列も前の兵の相手へ槍を添える。人数と攻撃判定はそのまま。
    rearSpearSupport: true,
    variedMarch: true,
    strideLimit: 1.25,
    // 伏せた指物は短くしわを寄せ、町に白い板を残さない。
    crumpledFlags: true,
    // 一歩先の急な下りで止める見えない縁。緩い道と登録済みの階段は通れる。
    maxWalkDrop: 1.2,
    // 道と曲輪を残し、戦の段階に関わらず切岸へ歩いて登らせない。
    climbTan: 0.9,
    // この戦の間、表示済みの台詞・知らせは再掲しない。任務と印は常に残る。
    noticeRepeatGap: Infinity,
    blockedHint: (rt) => rt.flags.step >= 3
      ? '急な山肌は登れない。曲がり角の印へ戻り、道の内を進め'
      : '家の間を通れ。藤吉郎の旗へ寄り、町の道を北へ進め',
    seed: 1567,
    terrainTags: true,
    // 裏道の外も、歩く兵と遠い備えの足を描く三角形にそろえる。
    terrainTriangles: true,
    distantTerrainTriangles: true,
    // 写真用に直接描く時も、地面の選別より先に視点の四隅まで山肌の上へ戻す。
    terrainContactView: true,
    wind: [0.5, 0.86],   // 放火の日は強風と信長公記にある。風向きは復元。
    windStrength: 1.6,   // 強風の強さは遊びのための復元値。
    // 放火・包囲の時刻は記録にない。見通しを保つ日中の光は遊びの仮設定。
    time: 'day',
    dayBounce: 1.38,
    bounceGround: 0x82745e,
    muddy: 0.2,
    fireLightLift: 2.6,
    // 屋根の火を同じ三角形の並びにせず、既存の丸くしなる火の舌を使う。
    roundedFire: true,
    // 町の煙を残しつつ、すぐ前の兵と退き口を白い壁で隠さない。
    smokeFogFloor: 110,
    // 補助の斉射は射手一人に一本。空を覆う黒い束と濃い丸影を抑える。
    naturalArrowRain: true,
    arrowRainPerBow: 1,
    // 本人に当たらない味方の矢で、火付けや登る道から退かせない。
    enemyArrowWarnings: true,
    // 町を白黒の帯で囲まず、矢の影・警告の声・退き先の印で知らせる。
    arrowRainGroundCue: false,
    // 町の押し合いは十六歩で腕を省かず、三十二歩まで袖と両腕のある共用形を残す。
    // 遠い軍勢の形・人数は保ち、設営時に作る形だけを替える。
    middleInfantryArms: true,
    clashMiddleDetail: 32,
    paths: INABA_PATHS,
    moveWay: inabaMoveWay,
    height,
    tint(x, z, h, c) {
      // 城下の土の道と町の庭
      if (z > 30 && z < 108 && x > -30 && x < 56) {
        // 通りの踏み土と庭の草を分ける。全面を同じ黄土色にしない。
        const lane = Math.abs(x - (23 + Math.sin(z * 0.055) * 4));
        const verge = Math.max(0, Math.min(1, (lane - 3.5) / 5));
        const patch = 0.5 + 0.5 * Math.sin(x * 0.31 + z * 0.13) * Math.cos(z * 0.23);
        c.setRGB(0.37 - verge * 0.13, 0.30 - verge * 0.025, 0.20 - verge * 0.055);
        c.multiplyScalar(0.9 + patch * 0.18);
      }
      else if (z < 28 && h > 4) {
        const d = inabaPathDistance(x, z), rock = inabaRockBand(x, z);
        const litter = 0.5 + 0.5 * Math.sin(x * 0.13 + z * 0.09);
        // 色の差を草・土の割合にも渡す。高い所を一様に緑のまま暗くしない。
        if (d < 1.4 || inabaClearing(x, z)) c.setRGB(0.36, 0.29, 0.20);
        else if (rock > 0.45) c.setRGB(0.33, 0.30, 0.27);
        else c.setRGB(0.20 + litter * 0.06, 0.23 + litter * 0.03, 0.13 + litter * 0.04);
      }
    },
    clear: (x, z) => (z > 26 && z < 112 && x > -34 && x < 60) || Math.hypot(x - HON.x, z - HON.z) < 24 || Math.hypot(x - ZUI.x, z - ZUI.z) < 26 ||
      inabaClearing(x, z) || inabaPathDistance(x, z) < 7,
    waterSlow: true,   // 川を渡る間は遅く、馬はもっと遅い（terrain_tags.js の water。10/2）
    streams: [{ pts: [[-150, -190], [-118, -110], [-112, -30], [-124, 60], [-150, 170]], w: 9, depth: 1.4 }],
    slopeForest: 0.65,   // 林床と露岩を残し、斜面全体を樹冠の緑で覆い切らない。
    trees: 700,
    // 葉のないように見える斜面の杉も、幹から分かれる枝で木と分かる形にする。
    branchTrees: true,
    layeredNeedles: true,
    raggedNeedles: true,
    branchFoliage: true,
    // 同じ松の棚を反復せず枝先を上下に散らし、葉房の重なる腹を暗くする。
    raggedPineCrowns: true,
    // 高画質でも杉全体を三枚の板へ戻さず、使い回す枝房を残す。
    nearCedarBranches: true,
    slopingNeedleBoughs: true,
    treePadMul: 1,
    rocks: 360,   // 減らした丸石の分を、道沿いの割れた岩の段へ回す。
    // 急斜面をまたぐ接地用の平面を出さず、岩の厚みを山肌の外へ向ける。
    groundedSlopeRocks: true,
    // 下端だけでなく腹の縁まで埋め、急な道の肩へ岩を浮かせない。
    rockBuriedRim: true,
    // 岩を坂へ傾けた後の腹も埋め、元の下半分だけを測って隙間を残さない。
    rockSlopeContact: true,
    // 斜面を向いた腹だけでなく、回転後の下縁も埋める。
    // 谷側へ張り出した岩の下に空間を残さない。この戦だけの指定。
    rockLowerRimContact: true,
    slopeRockFaces: true,
    // 粗い格子の補間で岩や根草を浮かせず、実際に描く面へ据える。
    rockDrawGround: true,
    // 裏道を細分してから岩を置く。古い山肌の高さに岩と根草を残さない。
    deferRockGround: true,
    // 接地より先に省略用の位置を控えると、首を振った時に岩が元の空中へ戻る。
    deferRockCull: true,
    litRockTufts: true,
    curvedRockTufts: true,
    tufts: 3800,
    patchyGround: true,
    // 実際の往来と乱戦で踏まれた帯を、土の色と伏せた草で共用する。
    wetFieldRuts: 'wear',
    nearGrassClumpBase: 0.06,
    nearGrassClumpGain: 1.8,
    tuftHeight(x, z) {
      return 0.72 + 0.2 * Math.sin(x * 0.37 + z * 0.16) * Math.sin(z * 0.29 - x * 0.11);
    },
    // 土塊の升目の陰を縁で消し、町と裏道を四角い敷石に見せない。
    softEarthCrust: true,
    // 同じ穴を裸地全体へ並べず、踏まれた泥の所だけ薄く残す。
    subtleMudRelief: true,
    // 戸口から通りへ出る所は裸地、庭の外縁には草が残る。
    groundCover(x, z) {
      if (z < 26 || z > 120) return 1;
      const lane = Math.abs(x - (23 + Math.sin(z * 0.055) * 4));
      let cover = 0.08 + Math.max(0, Math.min(1, (lane - 3) / 4)) * 0.92;
      for (const [hx, hz] of HOUSES) {
        const d = Math.hypot((x - hx) * 0.85, z - hz - 4);
        cover = Math.min(cover, Math.max(0.05, Math.min(1, (d - 2) / 4)));
      }
      return cover;
    },
    sugiAt: (x, z) => (z < 28 ? 0.12 + Math.max(0, Math.sin(x * 0.06 + z * 0.035)) * 0.42 : 0),
    treeDensity: inabaTreeDensity,
    // 木の総数を増やさず、露岩の間と登り口へ林を寄せる。竹の固まりは山肌に置かない。
    noBamboo: true,
    groves: [],
    // 崩れた斎藤の兵は、山の奥（北）で消す
    fleeOut: (x, z, team) => team === 1 && (z < -150 || (z < -90 && Math.abs(x) > 40)),
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    installInabaPresentation(rt);
    buildKaraTrail(rt);
    // 城下の使われた往来。足跡の個数や戦う兵には触れず、初期の踏み跡だけを敷く。
    W.stampTrail([[36, 122], [28, 104], [26, 92], [20, 74], [26, 52], [24, 30]], 1.6, 32);
    for (const [hx, hz] of HOUSES) W.stampTrail([[hx, hz + 3], [hx, hz + 7], [23 + Math.sin((hz + 7) * 0.055) * 4, hz + 7]], 0.8, 20);
    // 大きな土塊と足形を同じ間隔で繰り返すと、坂まで敷石に見える。
    // 稲葉山だけ粒の細かな土へ替え、広い湿乾の斑と道の色は残す。
    W.groundU.tDirt.value = dirtTex(true);
    // 泥の絵にも足形が焼き込まれている。実際に歩いた跡だけを残す。
    W.groundU.tMud.value = mudTex(true);
    if (W.deferredGroundRocks) {
      trimInabaRocks(W, W.deferredGroundRocks);
      groundRocks(W, W.deferredGroundRocks);
      // 谷側の岩も輪郭と割れ目を残す。材質はこの束の一つだけを使う。
      W.deferredGroundRocks.material.emissive.setHex(0x302c23);
      W.deferredGroundRocks.material.emissiveIntensity = 0.3;
      W.viewCull([W.deferredGroundRocks], false && !window.__vegFull ? 0 : 40);
      W.deferredGroundRocks = null;
    }
    buildInabaMountain(rt);
    // 名のある敵に寄っただけで、周りの兵を止める一騎打ちへ移さない。
    rt.army.hooks.canDuel = () => false;
    F.step = 0; F.ek = 0; F.ak = 0; F.lit = 0; F.entered = {}; F.layer = null; F.layerSeen = {};
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { ...INABAYAMA_HIST, honjinOda: 'HIST_A', honjinSaito: 'HIST_B' };
    rt.banner('井口の町', '信長公記の八月一日。城下に火をかける');
    // ---- 床の層（floors.js）を作り直す。搦手の物見櫓はここへ床・梯子を登録する ----
    flReset();
    const high = true;
    F.tower = monomi(rt, TOWER.x, TOWER.z, { name: '水手道の物見櫓', ...(high ? { logFrame: true, height: 8.8, boarded: false, mon: 'saito', team: 1 } : {}) });
    rt.scene.add(F.tower.mesh);
    F.towerArchers = enemyGroup(rt, { fixed: true, faction: 'saito', name: '物見櫓の射手', anchor: { x: TOWER.x, z: TOWER.z }, facing: 0, order: 'hold', aggro: 10, width: 2, morale: 80 },
      [{ type: 'bow', n: 2 }]);
    // 射手を物見櫓の床の高さに乗せる（floors.js の床の上に立つ扱い。以後は groundAt が高さを保つ）
    for (const u of F.towerArchers.units) { u.pos.y = F.tower.topY; if (u.mesh) u.mesh.position.y = F.tower.topY; }
    // 登り降りは登録済みの梯子を伝って行う。上下へ瞬間移動する札は置かない。
    // ---- 城の縄張り（曲輪）：本丸・大手の三の丸・二の丸を段に、腰曲輪は喰違いの柵で囲う ----
    // 本丸から出丸まで縁に土塁と柵。三の丸の大手だけ既存の喰違いの柵を使う。
    const castleLook = high ? {
      ...INABAYAMA_PLAN, year: 1567,
      lordSeat: { ...INABAYAMA_PLAN.lordSeat, earth: 0xb1a085 },
      kuruwa: INABAYAMA_PLAN.kuruwa.map((k) => {
        if (['koshi1', 'koshi2', 'umaya'].includes(k.id))
          return { ...k, wallMesh: inabaOpenFence, wallOpt: { ...k.wallOpt, h: 2.1 } };
        if (k.wall !== 'saku') return k;
        // 写真の上段は、尖った乱杭を密に添えた壁より、笠板の続く板塀。
        // 狭間と高さは保ち、縦板の目地と内面の横桟を共通部品の指定で補う。
        const area = k.poly.reduce((sum, a, i) => {
          const b = k.poly[(i + 1) % k.poly.length]; return sum + a[0] * b[1] - b[0] * a[1];
        }, 0);
        return { ...k, wallOpt: { ...k.wallOpt, boardCap: true, boardSeams: true, boardRailsSide: area >= 0 ? 1 : -1 } };
      }),
    } : INABAYAMA_PLAN;
    F.castle = buildCastlePlan(rt, castleLook, { life: false, ladders: true, baseHeight: liftedBase, edgeW: 5, skipWalls: ['ote'] });
    const noT2 = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    noT2(F.castle.walls);
    F.koshiGuard = garrisonKuruwa(rt, enemyGroup, F.castle, 'koshi1', 'saito', [{ type: 'ashigaru', n: 3 }], { name: '腰曲輪の喰違いの守り', width: 4, aggro: 10 });
    // ---- 落石・丸太（castle-design 7-1）：腰曲輪の守りが生きている間、搦手の坂を落ちてくる ----
    F.rocks = makeRockTraps(rt, {
      posts: [{
        id: 'koshi1', team: 1, stock: 2, interval: [26, 36],
        lane: [[KARA[2][0] + 2, KARA[2][1] + 12], [(KARA[1][0] + KARA[2][0]) / 2, (KARA[1][1] + KARA[2][1]) / 2], [KARA[1][0] - 3, KARA[1][1] + 6]],
        active: () => F.step === 3 && !F.guardOn && !gone(F.koshiGuard),
      }],
    });
    // ---- 竹束の置き場（castle-design 7-3）：搦手の登り口。抱えて登れば、前から来る石・矢を 7 割防ぐ ----
    F.tabaPile = tabaMesh(W, TABA_PILE.x, TABA_PILE.z, Math.PI);
    rt.scene.add(F.tabaPile);
    rt.addInteract('tabaPile', TABA_PILE, '竹束を担ぐ', () => this.tabaTake(rt), { r: 3, hold: 1 });
    // ---- 井口の町 ----
    // 家の見た目だけ描画面へ合わせる。兵の歩行用の高さは変えない。
    const townGround = { heightAt: (x, z) => drawGroundAt(W, x, z) };
    F.houses = HOUSES.map(([x, z, r], i) => {
      const m = hut(townGround, x, z, 6 + (i % 3), 4.5, r, { wall: i % 2 ? 0xa38b68 : 0x968160, groundedHome: true });
      townWoodLight(rt, m, x, z);
      rt.scene.add(m);
      // 戸口は家の正面中央。家の回転と土台の高さも案内へ渡す。
      const entrance = { x: x + Math.sin(r) * 2.3, y: m.position.y + .15, z: z + Math.cos(r) * 2.3 };
      // 操作する足場も戸口と同じ向きへ。壁の中を歩く的にしない。
      const approach = { x: x + Math.sin(r) * 3.3, z: z + Math.cos(r) * 3.3 };
      return { x, z, m, i, entrance, approach, frontX: Math.sin(r), frontZ: Math.cos(r), mine: i < MINE };
    });
    buildTownGround(rt);
    rt.scene.add(dou(W, TERA.x, TERA.z, 8, 6, 0));
    rt.scene.add(tawara(W, 12, 72, 0.3, 5), tawara(W, -2, 52, -0.4, 4));
    rt.after(8, () => { if (!rt.over) rt.bark('七曲りは緩い。百曲りは急じゃ', true); });   // A056
    // 裏道の切岸は細分した地面そのもので表す。重ねた土の帯は
    // 折れの内外で別の高さを拾い、山腹へ浮く庇のように張り出す。
    // 写真の幟は屋根と井楼より低い。高画質では主殿・蔵・通路を避けて縁へ分散する。
    const summitFlags = high ? [[HON.x - 15, HON.z + 7], [HON.x + 15, HON.z - 3], [HON.x, HON.z - 14]]
      : [[HON.x - 8, HON.z + 4], [HON.x + 8, HON.z + 4], [HON.x, HON.z - 2]];
    for (const [x, z] of summitFlags) rt.scene.add(nobori(W, x, z, 'saito', 5.5));
    // ---- 大手の木戸（七曲りの道を切る柵。口は開いている） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    // この別置きの柵にも裏道の口を空ける。旧端の西二十六は裏道の中心に重なる。
    // 西二十まで引き、道の肩四・四歩と杭・控え木の余白を保つ。
    noT(wallLine(rt, [[-20, OTE.z + 4.4], [-4, OTE.z]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    noT(wallLine(rt, [[4, OTE.z], [26, OTE.z + 6]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    rt.scene.add(kabukimon(W, OTE.x, OTE.z, 7.4, 0));
    // 西の虎口。曲輪の縁と当たりを同じ縄張りから作り、門幅だけを空ける。
    rt.scene.add(kabukimon(W, -20, -116, 7, Math.PI / 2));
    rt.scene.add(kabukimon(W, DEMARU.x, DEMARU.z - 10, 6, 0));
    rt.scene.add(kabukimon(W, YAKATA.x + 17, YAKATA.z, 6, Math.PI / 2, { yakui: true }));   // 館の表門は薬医門
    // 小曲輪の東は切岸と土塀だけ（1567 年の稲葉山に石垣は出さない）
    // 主殿（板葺きの木造。天守・二重櫓は置かない）と、物見の櫓（木造）
    // 主殿は縄張り（castles/inabayama.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に龍興（kaito 10/2）
    // 山頂の曲輪：主殿のほかに、遠侍（板葺きの御殿）・兵糧蔵・長屋を構えて、御殿と蔵と詰所のある城らしくする（kaito 10/2 の見回り）
    goten(rt, HON.x + 12, HON.z + 6, { w: 7, d: 5, tile: false, team: 1, name: '遠侍', kind: 'tamari', hp: 600, naka: true, profile: 'inabayama', noTarget: true });
    // 主殿と遠侍・館の厚い檜皮屋根は残し、実務の小屋は浅い切妻板葺きと縦板壁にする。
    // 既存の部品の指定だけを使い、室内の床・戸口と建物の位置は保つ。
    const serviceLook = high ? { fieldFort: true } : {};
    // 裏道の肩と床下が重ならないよう、蔵と中の俵を本丸の奥へ三歩寄せる。
    const riceStore = goten(rt, HON.x - 12, HON.z - 9, { w: 5, d: 4, tile: false, team: 1, name: '兵糧蔵', kind: 'kura', ...serviceLook, oku: 0, naka: true, profile: 'inabayama', noTarget: true });
    const rice = tawara(W, HON.x - 10.7, HON.z - 10.1, 0, 3);
    rice.position.y = riceStore.naka.levels[0].y; rt.scene.add(rice);
    goten(rt, HON.x - 6, HON.z + 10, { w: 9, d: 4, tile: false, team: 1, name: '兵の長屋', kind: 'nagaya', ...serviceLook, naka: true, profile: 'inabayama', noTarget: true });
    // 番所・厩・小祠・山麓館は斎藤期の美濃から推定。信長の庭園や天守を先取りしない。
    goten(rt, NI.x - 5, NI.z + 2, { w: 5, d: 4, tile: false, team: 1, name: '二の丸の番所', kind: 'bansho', ...serviceLook, naka: true, profile: 'inabayama', noTarget: true });
    goten(rt, MATSU.x + 6, MATSU.z - 5, { w: 4, d: 3, tile: false, team: 1, name: '小さな祠', kind: 'shrine', naka: true, profile: 'inabayama', noTarget: true });
    goten(rt, DEMARU.x - 6, DEMARU.z + 3, { w: 5, d: 4, tile: false, team: 1, name: '出丸の番所', kind: 'bansho', ...serviceLook, naka: true, profile: 'inabayama', noTarget: true });
    goten(rt, YAKATA.x - 2, YAKATA.z - 5, { w: 12, d: 7, tile: false, team: 1, name: '斎藤の山麓館', naka: true, profile: 'inabayama', noTarget: true });
    const lifeBatch = makeKitBatch();
    // 厩を尾根に沿って向け、長い屋根を平場へ収めながら東側の通り道を空ける。
    const stable = kuruwaBldg(W, 'umaya', UMAYA.x - (high ? 7 : 8), UMAYA.z, high ? Math.PI / 2 : 0, { batch: lifeBatch, ita: high, boardRoof: high });
    if (!stable.isBatchedPart) rt.scene.add(stable);
    if (high) buildInabaWardLife(rt, lifeBatch);
    finalizeKitBatch(rt, lifeBatch);
    monomi(rt, HON.x + 10, HON.z - 14, { name: '本丸の井楼', logFrame: high, ...(high ? { height: 10, boarded: false, mon: 'saito', team: 1 } : {}) });
    monomi(rt, OTE.x + 12, OTE.z - 6, { name: '大手の井楼', logFrame: high, ...(high ? { height: 8.8, boarded: false, mon: 'saito', team: 1 } : {}) });
    monomi(rt, DEMARU.x + 7, DEMARU.z + 4, { name: '出丸の物見櫓', logFrame: high, ...(high ? { height: 8.8, boarded: false, mon: 'saito', team: 1 } : {}) });
    // 切岸の上は板を笠にした土塀。小曲輪の南北は柵、西は本丸からの通り口。
    const edgeBatch = makeKitBatch();
    if (high) buildInabaWallEaves(rt, edgeBatch);
    // 石垣を置かないので、土塀は切岸の肩より内（平場の上）に建て、足もとは地面に合わせる（宙に浮かせない）。
    // 漆喰の白壁にしない：土を突いた土塀に板の笠（1567 年の斎藤の山城）
    const eastX = TSUKE.x + TSUKE.half - 1.6;
    dobei(W, [eastX, TSUKE.z + TSUKE.half, eastX, TSUKE.z - TSUKE.half], { ita: true, tera: true, earth: 0x9a8064, batch: edgeBatch });
    finalizeKitBatch(rt, edgeBatch);
    Object.assign(solidSeg(eastX, TSUKE.z - TSUKE.half, eastX, TSUKE.z + TSUKE.half, 0.25), { missileH: 2.3, missileType: 'wood' });
    noT(wallLine(rt, [[20, TSUKE.z - TSUKE.half], [eastX, TSUKE.z - TSUKE.half]], { team: 1, hp: 1e9, name: '小曲輪の柵' }));
    noT(wallLine(rt, [[20, TSUKE.z + TSUKE.half], [eastX, TSUKE.z + TSUKE.half]], { team: 1, hp: 1e9, name: '小曲輪の柵' }));
    buildInabayamaSteps(rt);
    buildKaraRoadWorks(rt);
    // 山頂の小曲輪：入口曲輪（七曲りと百曲りが合う所）→ 二ノ門 → 中枢曲輪（本丸の口の前）
    rt.scene.add(kabukimon(W, NIMON.x, NIMON.z, 4.2, Math.atan2(-(NAKA.z - IRI.z), NAKA.x - IRI.x) + Math.PI / 2));
    for (const [x, z] of [[NIMON.x - 2.6, NIMON.z + 1.6], [NIMON.x + 2.6, NIMON.z - 1.6]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.2 }); }
    rt.scene.add(nobori(W, IRI.x + 5, IRI.z - 3, 'saito', 5.5), nobori(W, NAKA.x - 4, NAKA.z + 3, 'saito', 5.5));
    // 城の見栄え：大手の前に逆茂木、木戸に篝火
    {
      rt.scene.add(sakamogi(W, OTE.x - 13, OTE.z + 9, 0.2, 7), sakamogi(W, OTE.x + 13, OTE.z + 9, -0.2, 7));
      for (const [x, z] of [[OTE.x - 5.5, OTE.z + 2], [OTE.x + 5.5, OTE.z + 2]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
      // 本丸の守備は主殿前・馬廻・控えの実兵で示す。別の大軍を重ねない。
      // 総大将・斎藤龍興は主殿の中（天守の無い城。高遠の盛信と同じ作り）。旗本が縁側の上がり口を守り、踏み込むまで討てない
      F.keep = makeLordKeep(rt, {
        name: '斎藤龍興', spot: { x: HON.x + 2, z: HON.z - 6 }, mouth: { x: HON.x + 2, z: HON.z - 0.5 }, facing: Math.PI, guardN: 5,
        faction: 'saito', flag: 'saito', hat: 'kabuto_w', haori: 0x2e3a2a,
        onReach: () => this.reachTatsu(rt),
      });
      if (F.keep.lord) { F.keep.lord.mustLive = true; F.keep.lord.noTarget = true; }
      F.keep.guard.noRout = false; F.keep.guard.formation = 'yari';
      for (const g of F.keep.kin) g.noRout = false;
      // 主殿の前の馬廻（見上げに来れば旗が見える。寄り過ぎなければ打って出ない）
      F.tatsu = enemyGroup(rt, { fixed: true, faction: 'saito', name: '斎藤龍興の馬廻', anchor: { x: HON.x - 3, z: HON.z + 2 }, facing: -Math.PI / 2, order: 'hold', aggro: 3, width: 6, morale: 100, fleeDir: { x: 0, z: -1 } },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }], { flag: 'saito' }));
      // 城主は居所の隊の頭。馬廻は別の組頭が指揮する。
    }
    // 長屋の中と遠侍の軒際に残っていた幟を外へ。井楼脇の幟とも重ねない。
    const wardFlags = high ? [[HON.x + 17, HON.z - 8], [OTE.x - 8, OTE.z - 6], [-30, -120]]
      : [[HON.x - 4, HON.z + 10], [HON.x + 10, HON.z + 2], [OTE.x - 8, OTE.z - 6], [OTE.x + 8, OTE.z - 6], [-30, -120]];
    for (const [x, z] of wardFlags) rt.scene.add(nobori(W, x, z, 'saito', 5.5));
    // 中枢曲輪の道の上の小屋は置かず、番所は平場の脇へ寄せる。
    rt.scene.add(hut(W, 22, -84, 6, 4, -0.3, high
      ? { ita: true, boardRoof: true, weatheredBoards: true, wall: 0x786650,
        boardRoofColors: [0x746650, 0x85745d, 0x6a604f, 0x958066, 0x7c705d] }
      : { wall: 0x6a5238 }));
    // ---- 織田勢：木下藤吉郎の手（自分の持ち場）、柴田勝家の手、丹羽長秀の手 ----
    F.kino = allyGroup(rt, { fixed: true, name: '木下藤吉郎の手', anchor: { x: 28, z: 104 }, facing: Math.PI, width: 12, aggro: 8 },
      dress([{ type: 'busho', n: 1, o: { name: '木下藤吉郎', invuln: true } }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], ODA));
    F.kinoU = F.kino.units[0];
    customFlag('inabaGuide', (g) => flagColumn(g, '藤吉郎', 64, 30, 224, 32), '#d5b44e');
    const guideFlag = nobori(W, 0, 0, 'inabaGuide', 5.5);
    guideFlag.position.set(-0.7, 0, -0.35); guideFlag.scale.set(1.5, 1, 1.5);
    F.kinoU.mesh.add(guideFlag);
    F.kinoFlag = guideFlag.userData.flag;
    F.shiba = allyGroup(rt, { fixed: true, name: '柴田勝家の手', anchor: { x: 52, z: 96 }, facing: Math.PI, width: 14, aggro: 8 },
      dress([{ type: 'samurai', n: 1, o: { name: '柴田勝家', invuln: true, horse: true } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }], { flag: 'kari' }));
    F.niwa = allyGroup(rt, { fixed: true, name: '丹羽長秀の手', anchor: { x: 8, z: 116 }, facing: Math.PI, width: 12, aggro: 8 },
      dress([{ type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true, horse: true } }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 3 }], { flag: 'sujikai' }));
    F.oda = [F.kino, F.shiba, F.niwa];
    // 藤吉郎の手は崩れても旗の下へ戻る（手が崩れただけで攻めを打ち切らない）
    F.kino.noRout = true;
    for (const g of F.oda) { g.formation = 'yari'; }
    // 話す相手は列の端でなく、出だしから見える通り側の持ち場へ。
    // 一人と持ち場を交換するだけで、兵の数と列の密度を保つ。
    const slotPoint = { x: 0, z: 0 };
    let talkSlot = F.kinoU, talkDistance = Infinity;
    for (const u of F.kino.units) {
      F.kino.slotPos(u.slot, F.kino.units.length, slotPoint);
      const d = Math.hypot(slotPoint.x - 32, slotPoint.z - 108);
      if (d < talkDistance) { talkDistance = d; talkSlot = u; }
    }
    const oldSlot = F.kinoU.slot;
    F.kinoU.slot = talkSlot.slot; talkSlot.slot = oldSlot;
    for (const u of [F.kinoU, talkSlot]) {
      F.kino.slotPos(u.slot, F.kino.units.length, slotPoint);
      u.pos.set(slotPoint.x, W.heightAt(slotPoint.x, slotPoint.z), slotPoint.z);
      u.mesh.position.copy(u.pos);
    }
    // カメラから本人まで幹が重ならない余白。設営時だけ調べる。
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      W.clearTreesAround(44 + (F.kinoU.pos.x - 44) * t, 112 + (F.kinoU.pos.z - 112) * t, 5);
    }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 36, z: 114 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 町に残る斎藤の番の兵 ----
    // 十八人のうち九人は戸口の脇を守る。家までの距離と列の密度を保ち、正面を空ける。
    F.town = enemyGroup(rt, { fixed: true, faction: 'saito', name: '町の番の兵', anchor: { x: 40, z: 88 }, facing: 0, order: 'hold', seekRange: 80, width: 8, aggro: 9, morale: 80, fleeDir: { x: 0, z: -1 } },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 8 }]);
    F.houseGuards = F.houses.slice(0, 3).map((h) => enemyGroup(rt, {
      fixed: true, faction: 'saito', name: '火付けを防ぐ足軽',
      anchor: { x: h.x + h.frontX * 3.6 + h.frontZ * 3.6, z: h.z + h.frontZ * 3.6 - h.frontX * 3.6 }, facing: 0, order: 'hold',
      width: 2, aggro: 0, seekRange: 10, morale: 65, formation: 'yari', fleeDir: { x: 0, z: -1 },
    }, dress([{ type: 'ashigaru', n: 3 }], { flag: 'saito' })));
    // 後続はすでに町の通りまで下りている。山道の移動で斬り合いを長く途切れさせない。
    // 物見・伏兵・旗本は持ち場を守る。段の切り替えで兵を増やさない。
    F.town2 = enemyGroup(rt, { fixed: true, faction: 'saito', name: '城から下りた斎藤勢', anchor: { x: 32, z: 36 }, facing: 0, order: 'hold', aggro: 10, width: 7, morale: 85, fleeDir: { x: 0, z: -1 } },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 3 }]);
    F.townGuards = [F.town, F.town2, ...F.houseGuards];
    // 味方が並ぶ持ち場だけを戸口の両脇へ寄せる。戦う相手・追撃・兵数は変えない。
    for (const g of F.oda) {
      const slotPos = g.slotPos;
      g.slotPos = function (i, n, out) {
        const point = slotPos.call(this, i, n, out);
        if (F.step !== 1 || this.routed) return point;
        for (const h of F.houses) {
          const dx = point.x - h.entrance.x, dz = point.z - h.entrance.z;
          const along = dx * h.frontX + dz * h.frontZ;
          const across = dx * h.frontZ - dz * h.frontX;
          if (along < -.4 || along > 6 || Math.abs(across) >= 1.6) continue;
          const shift = across >= 0 ? 2.2 : -2.2;
          point.x += h.frontZ * shift; point.z -= h.frontX * shift;
        }
        return point;
      };
    }
    // 打って出る兵は七曲りの一番下の坂で待ち、鹿垣の開いた口まで縦列で下る。
    F.ote = enemyGroup(rt, { fixed: true, faction: 'saito', name: '大手の斎藤勢', anchor: { x: -20, z: 25 }, facing: 0, order: 'hold', aggro: 0, fire: false, noAI: true, historicalOrders: true, width: 8, morale: 72, fleeDir: { x: 0, z: -1 }, formation: 'yari' },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 3 }, { type: 'gun', n: 1 }]);
    F.ote2 = enemyGroup(rt, { fixed: true, faction: 'saito', name: '大手の新手', anchor: { x: -24, z: 21 }, facing: 0, order: 'hold', aggro: 0, fire: false, noAI: true, historicalOrders: true, width: 7, morale: 66, fleeDir: { x: 0, z: -1 } },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 2 }]);
    // 最初の折れの先で迎える。場面替え直後の味方の列へ守兵を重ねない。
    // 登り口の守りは一組だけ（小さな斬り合いを重ねて搦手を長くしない。一つの戦は4〜7分）。
    F.climbGuards = [0.25].map((t, i) => enemyGroup(rt, { fixed: true, faction: 'saito',
      name: i ? '裏道の下の段の守り' : '裏道の登り口の守り',
      anchor: { x: KARA_TRAIL[1][0] + (KARA_TRAIL[2][0] - KARA_TRAIL[1][0]) * t, z: KARA_TRAIL[1][1] + (KARA_TRAIL[2][1] - KARA_TRAIL[1][1]) * t },
      facing: Math.PI / 2, order: 'hold', aggro: 0, width: 2, morale: 85, noAI: true, historicalOrders: true }, [{ type: 'ashigaru', n: 5 }]));
    // 物見の後ろの見回りの組。細い道の上で列の頭とぶつかる（裏道の一番の斬り合い）
    F.patrol = enemyGroup(rt, { fixed: true, faction: 'saito', name: '裏道の見回りの組', anchor: { x: KARA[1][0] + (KARA_LEGS[1][1][0] - KARA[1][0]) * 0.22, z: KARA[1][1] + (KARA_LEGS[1][1][1] - KARA[1][1]) * 0.22 }, facing: 0.5, order: 'hold', aggro: 0, width: 3, morale: 75, noAI: true, historicalOrders: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], { flag: 'saito' }));
    F.kguard = enemyGroup(rt, { fixed: true, faction: 'saito', name: '搦手の守り', anchor: { x: -30, z: -118 }, facing: -Math.PI / 2, order: 'hold', aggro: 14, width: 8, morale: 90, fleeDir: { x: 1, z: 0 }, formation: 'yari' },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'gun', n: 2 }]);
    F.scout = enemyGroup(rt, { fixed: true, faction: 'saito', name: '斎藤の物見', anchor: { x: KARA[1][0], z: KARA[1][1] }, facing: 0.4, order: 'hold', aggro: 10, width: 2, morale: 70, fleeDir: { x: 0.4, z: -1 } },
        [{ type: 'ashigaru', n: 2 }]);
    F.ambush = enemyGroup(rt, { fixed: true, faction: 'saito', name: '岩陰の伏兵', ambush: true, anchor: { x: KARA[2][0], z: KARA[2][1] }, facing: 0.6, order: 'hold', aggro: 12, width: 3, morale: 80, fleeDir: { x: 0.5, z: -1 }, formation: 'yari' },
          dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }], { flag: 'saito' }));
    F.ambushGun = enemyGroup(rt, { fixed: true, faction: 'saito', name: '上の段の鉄砲', anchor: { x: KARA[4][0] - 4, z: KARA[4][1] - 8 }, facing: 0.3, order: 'hold', aggro: 30, width: 2, morale: 70, fleeDir: { x: 0.5, z: -1 } },
          [{ type: 'gun', n: 2 }]);
    F.hata = [enemyGroup(rt, { fixed: true, faction: 'saito', name: '本丸の旗本', anchor: { x: HON.x - 8, z: HON.z + 3 }, facing: -Math.PI / 2, order: 'hold', width: 4, aggro: 8, morale: 90, formation: 'yari' }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }]), enemyGroup(rt, { fixed: true, faction: 'saito', name: '御殿前の控え', anchor: { x: HON.x + 8, z: HON.z + 1 }, facing: -Math.PI / 2, order: 'hold', width: 4, aggro: 6, morale: 90, formation: 'yari' }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }])];
    // 合図の前に退ける守りを一度だけ束ね、任務と印と自動操作で共有する。
    F.honGuards = [...F.hata, F.tatsu, F.keep.guard];
    F.nGun = allyGroup(rt, { fixed: true, name: '丹羽の鉄砲衆', anchor: { x: 2, z: 112 }, facing: Math.PI, width: 8, aggro: 4, formation: 'line' }, dress([{ type: 'gun', n: 4 }], ODA));
    F.torchG = allyGroup(rt, { fixed: true, name: '火付けの足軽', anchor: { x: 26, z: 110 }, facing: Math.PI, width: 2, aggro: 0 }, dress([{ type: 'ashigaru', n: 2, o: { weapon: 'none' } }], ODA)); F.torchQueue = [];
    for (const g of [F.town2, F.ote, F.ote2, F.kguard, F.scout, F.ambush, F.ambushGun]) { g.formation = 'yari'; g.yariRanks = Math.max(2, Math.ceil(g.count / 6)); g.aggro = Math.min(g.aggro, 10); }
    for (const g of [F.town, ...F.hata, F.tatsu]) { g.formation = 'yari'; g.yariRanks = Math.max(2, Math.ceil(g.count / 6)); }
    F.town2.sent = false; F.ote2.sent = false;
    rt.scene.add(hut(W, HON.x + 8, HON.z + 12, 3, 2, 0,
      high ? { ita: true, boardRoof: true, weatheredBoards: true, wall: 0x786650 } : {}));
    // ---- 大軍（軽い作り）：瑞龍寺山の信長の本陣、美濃三人衆、城を囲む織田勢 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    // 瑞龍寺山の本陣：信長と旗本（控えは周りの大軍。信長で遊ぶ時は旗本だけ）
    F.odaCamp = camp(rt, { x: ZUI.x, z: ZUI.z, facing: Math.atan2(HON.x - ZUI.x, HON.z - ZUI.z), team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 15, reserve: 0, runTo: { x: 70, z: 20 } });
    for (const [x, z, k] of [[ZUI.x - 10, ZUI.z + 8, 'oda'], [ZUI.x - 4, ZUI.z + 9, 'eiraku'], [ZUI.x + 4, ZUI.z + 9, 'oda'], [ZUI.x + 10, ZUI.z + 8, 'eiraku']]) rt.scene.add(nobori(W, x, z, k, 5.5));
    DA(ZUI.x - 16, ZUI.z + 20, 26, 12, 220, -Math.PI * 0.75, 0x2b3140, 'oda', 15671);
    DA(ZUI.x + 14, ZUI.z - 12, 24, 10, 160, -Math.PI * 0.7, 0x2b3140, 'eiraku', 15672);
    for (const [x, z] of [[-58, 26], [-70, 30]]) rt.scene.add(nobori(W, x, z, 'inaba', 5.5));
    // ---- 部隊（butai.js）：囲む織田の備と、山の曲輪に籠もる斎藤の備。名目の数を持ち、近い所だけ本物の兵になる ----
    // （物語の組＝藤吉郎・柴田・丹羽の手はそのまま。部隊は、その外の大きな流れ＝軍議の作戦で動く手）
    const mkB = (o) => makeButai(rt, { real: 0, ...o });
    const ODA_B = { team: 0, faction: 'oda', armor: 0x2b3140 };
    // 名目の兵数は保ち、各隊の一人だけを実在の将にする。森は名のある装備表の十文字槍と豪傑の型。
    F.oteYose1 = mkB({ ...ODA_B, armor: 0, name: '森可成の手', general: '森可成', kind: 'ashigaru', mix: { ashigaru: 1 }, nominal: 180, real: 1, maxReal: 1, at: { x: -40, z: 8 }, facing: Math.PI, flag: 'tsuru' });
    F.oteYose2 = mkB({ ...ODA_B, name: '坂井政尚の手', general: '坂井政尚', kind: 'ashigaru', nominal: 180, maxReal: 0, at: { x: 40, z: 4 }, facing: Math.PI, flag: 'eiraku' });
    F.sakuma = mkB({ ...ODA_B, name: '佐久間信盛の手', general: '佐久間信盛', kind: 'ashigaru', nominal: 220, maxReal: 0, at: { x: 80, z: 60 }, facing: Math.PI * 1.2, flag: 'oda' });
    F.ikeda = mkB({ ...ODA_B, armor: 0, name: '池田恒興の手', general: '池田恒興', kind: 'bow', mix: { bow: 1 }, nominal: 160, real: 1, maxReal: 1, at: { x: 70, z: -86 }, facing: -Math.PI / 2, flag: 'ageha' });
    F.sannin = mkB({ ...ODA_B, armor: 0x33302a, name: '美濃三人衆（稲葉一鉄の手）', kind: 'ashigaru', nominal: 240, maxReal: 0, at: { x: -64, z: 40 }, facing: Math.PI * 0.85, flag: 'inaba' });
    F.attackers = [F.oteYose1, F.oteYose2, F.sakuma, F.ikeda, F.sannin];
    const SAI_B = { team: 1, faction: 'saito', armor: 0x5a6682, flag: 'saito' };   // 暗い具足は影で黒い筒に見える。紺の胴に明るい威糸で、遠目にも腕と笠が分かれる
    F.oteB = mkB({ ...SAI_B, name: '大手の備（日根野弘就）', kind: 'ashigaru', nominal: 100, real: 4, maxReal: 4, at: { x: OTE.x, z: OTE.z - 6 }, facing: 0 });
    F.hyakuB = mkB({ ...SAI_B, armor: 0x5c6a58, name: '百曲りの備（長井道利）', kind: 'bow', nominal: 80, real: 4, maxReal: 4, at: { x: HYAKU[3][0], z: HYAKU[3][1] }, facing: 0.6 });
    F.koshiB = mkB({ ...SAI_B, name: '水の手の備', kind: 'ashigaru', nominal: 40, maxReal: 0, at: { x: -60, z: -84 }, facing: 0.4 });
    F.niB = mkB({ ...SAI_B, armor: 0x5c6a58, name: '二の丸の備', kind: 'ashigaru', nominal: 40, maxReal: 0, at: { x: NI.x, z: NI.z - 2 }, facing: Math.PI / 2 });
    F.honB = adoptGroup(mkB({ ...SAI_B, name: '主殿前の旗本', nominal: F.keep.guard.count, maxReal: 0, at: F.keep.guard.anchor }), F.keep.guard);
    F.defenders = [F.oteB, F.hyakuB, F.koshiB, F.niB, F.honB];
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
    for (const b of [...F.attackers, ...F.defenders]) b.order({ id: 'hold' });
    // ---- 区域（siege_zones.js）：大手（三の丸）・腰曲輪・二の丸・本丸、と長良川の舟着き（龍興の退路） ----
    // 本丸は、自分が合図の段（step 4）に入るまで数えない（物語より先に味方が本丸を取ってしまわないように）
    const C = F.castle;
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'ote', name: '大手（三の丸）', test: C.kuruwa.ote.test, pos: C.kuruwa.ote.centroid, need: 4, hold: 10, next: 'hon' },
        { id: 'koshi', name: '腰曲輪', test: (x, z) => C.kuruwa.koshi1.test(x, z) || C.kuruwa.koshi2.test(x, z), pos: C.kuruwa.koshi1.centroid, need: 3, hold: 8, next: 'ni' },
        { id: 'ni', name: '二の丸', test: C.kuruwa.ni.test, pos: C.kuruwa.ni.centroid, need: 4, hold: 10, next: 'hon' },
        // kaito 10/1：本丸の hold を 40→24 に詰めた（遊んで10分ほどかかる戦を4〜7分に。ここが一番長い待ちだった）
        { id: 'hon', name: '本丸', test: (x, z) => F.step >= 4 && C.kuruwa.hon.test(x, z), pos: { x: HON.x, z: HON.z }, need: 5, hold: 24 },
        { id: 'funa', name: '長良川の舟着き', test: (x, z) => Math.hypot(x - FUNA.x, z - FUNA.z) < 12, pos: FUNA, need: 3, hold: 8, start: ZONE_STATE.NEUTRAL },
      ],
      links: [['ote', 'hon'], ['koshi', 'ni'], ['ni', 'hon']],
      friendTeam: 0, enemyTeam: 1,
      totalDefenders: 60,
      commander: () => F.keep && F.keep.lord,
      noReinforce: () => true,
      escape: { zoneId: 'funa', rally: FUNA },
      quietRange: [15, 25],
      onFall: (id) => this.onZoneFall(rt, id),
      // 曲輪の占拠は局地の働き。城全体の開城は合図の後の包囲で描く。
    });
    // ---- 城の頭（siege_ai.js）：持ち場・圧された時に退く・攻め手が乱れたら打って出る ----
    F.DA = makeDefenseAI(rt, {
      posts: [
        { id: 'ote', butai: F.oteB, at: { x: OTE.x, z: OTE.z - 4 }, next: 'hon', watch: [{ at: { x: 0, z: -40 }, range: 30 }] },
        { id: 'hyaku', butai: F.hyakuB, at: { x: HYAKU[3][0], z: HYAKU[3][1] }, next: 'hon', watch: [{ at: { x: HYAKU[2][0], z: HYAKU[2][1] }, range: 26 }] },
        { id: 'koshi', butai: F.koshiB, at: { x: -60, z: -84 }, next: 'ni' },
        { id: 'ni', butai: F.niB, at: { x: NI.x, z: NI.z - 2 }, next: 'hon' },
        { id: 'hon', butai: F.honB, at: { x: HON.x + 2, z: HON.z - 4 } },
      ],
      reserves: [],
      fallback: { x: HON.x, z: HON.z - 6 },
    });
    // 束33：縄張りの今の様子（nawabari.js・束19）を rt にも持たせる（軍議の俯瞰の説明・小地図・制圧の札）
    F.K = makeNawabari(rt, F.castle, { SZ: F.SZ, team: 1, friendTeam: 0 });
    rt.nawabari = F.K;
    F.keep.guard.formation = 'yari';
    for (const [x, z] of [[-24, -90], [22, -86], [OTE.x - 14, OTE.z - 12], [36, -116]]) rt.scene.add(nobori(W, x, z, 'saito', 5.5));
    // 井口の町の奥へ続く家並み（遠景）。焼き討ちが進むと、こちらにも煙が上がる
    // 見物の四人を二つの村の住人へ振り替える。配置は推定で、民の上限は四十四人のまま。
    // 村を作った時の当たりから戸口を求め、乱数で並ぶ家にも位置を合わせる。
    rt.civilianBands = [...CIVILIAN_BANDS];
    // 生活道を求める前に火を置く。道を描いた後で焚き火が退き口を塞がないようにする。
    for (const [x, z] of [[60, 120], [68, 110]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    F.farHomes = []; F.farFires = [];
    F.farTown = [[40, 142, 7, 26, 67, 1], [-30, 130, 6, 22, 68, -1]].map(([x, z, n, r, seed, side]) => {
      const first = SOLIDS.length;
      // 避難する家族の戸口も町と同じ地面に据え、斜面の低い側は土台で支える。
      const v = village(W, x, z, { n, r, rot: Math.PI, fields: 4, seed, smoke: 0, groundedHomes: true });
      const homes = SOLIDS.slice(first).filter((s) => s.k === 'r' && s.hw > 3 && s.hd > 2.4);
      // 家並みの外端の家から脇を回る。北の軍勢や、中央の家・畑へ戻らない。
      // 外端の一軒の戸口が塞がれていても、村の住人を省かず次の家を探す。
      // 探索は設営時だけ。置く家族は従来どおり一組で、人数や描画は増やさない。
      const candidates = [...homes].sort((a, b) => side > 0 ? b.x1 - a.x1 : a.x0 - b.x0);
      // 遠景の火は従来の外端の家に残し、避難する戸口の選び直しと分ける。
      if (candidates.length) F.farHomes.push(candidates[0]);
      const edge = side > 0 ? Math.max(...homes.map((s) => s.x1)) + 5 : Math.min(...homes.map((s) => s.x0)) - 5;
      const south = Math.max(...homes.map((s) => s.z1)) + 5;
      const joinZ = Math.max(south, side > 0 ? 156 : 146);
      const onward = side > 0 ? [[96, joinZ], [110, 172]] : [[-80, joinZ], [-88, 172]];
      // 村外れの百姓も、固定の直線ではなく実際の家並みの外を退く。
      // 外端の家の延焼も先に避ける。見物場所が塞がる時は同じ外縁の道端を探す。
      // 定義の共用配列は変えず、設営時だけこの戦の二組を選び直す。
      const watchIndex = rt.civilianBands.findIndex((b) => b.mode !== 'inside'
        && b.kinds.includes('farmer') && (b.x > 0) === (side > 0));
      if (watchIndex >= 0) {
        const watch = rt.civilianBands[watchIndex];
        let placed = false;
        // 家並みの無い時や道を結べない時に、定義の固定路を残さない。
        // 安全な生活道のある場所だけで見物させ、川・軒・火を横切る避難を防ぐ。
        const spots = homes.length ? [watch, { x: edge, z: watch.z }, { x: edge, z: south }] : [];
        for (const spot of spots) {
          const way = villageCivilWay(W, homes, spot, edge, south, onward, rt.army, candidates[0]);
          if (!way) continue;
          rt.civilianBands[watchIndex] = { ...watch, x: spot.x, z: spot.z, route: civilRoute(way) };
          placed = true;
          break;
        }
        if (!placed) rt.civilianBands.splice(watchIndex, 1);
      }
      for (const h of candidates) {
        const dx = -0.3 * (h.hw - 0.15);
        // 戸口の向きは家ごとに違う。民の配置判定が使う外接矩形からも離す。
        // 二人分の散らばりを含め、正面への線が最初に矩形を出る所まで延ばす。
        const outX = Math.abs(h.s) > 0.001 ? ((h.x1 - h.x) + 3.5 - Math.sign(h.s) * dx * h.c) / Math.abs(h.s) : Infinity;
        const outZ = Math.abs(h.c) > 0.001 ? ((h.z1 - h.z) + 3.5 + Math.sign(h.c) * dx * h.s) / Math.abs(h.c) : Infinity;
        const dz = Math.max(h.hd + 3, Math.min(outX, outZ));
        const door = { x: h.x + dx * h.c + dz * h.s, z: h.z - dx * h.s + dz * h.c };
        // 一軒の軒を回っただけで村の中へ斜めに戻らない。
        // 家並み全体の外側を南端までたどる。設営時だけ求める推定の生活道。
        const way = villageCivilWay(W, homes, door, edge, south, onward, rt.army, candidates[0]);
        // 道を結べない戸口には民を閉じ込めない。歩行中も既存の水・斜面・兵・火の判定を使う。
        if (!way) continue;
        rt.civilianBands.push({ ...door, mode: 'inside', kinds: ['woman', 'child'],
          route: civilRoute(way) });
        break;
      }
      return v;
    });
    for (const v of F.farTown) rt.scene.add(v);
    // 寺・町の戸口と村の脇道を、民が実際に逃げる道へつなぐ。
    // 圧縮地形に合わせた推定の生活道。既存の踏み跡へ設営時だけ描き、面と材質は増やさない。
    // 共通の南の道は一度だけ踏む。重なる退き道だけが濃い大通りになるのを避ける。
    const civilLegs = new Set();
    for (const band of rt.civilianBands) {
      let from = [band.x, band.z];
      for (const point of band.route) {
        const to = [point.x, point.z];
        const a = `${from[0]},${from[1]}`, b = `${to[0]},${to[1]}`;
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (!civilLegs.has(key)) {
          civilLegs.add(key);
          W.stampTrail([from, to], 1.4, 65);
        }
        from = to;
      }
    }

    // 出兵して瑞龍寺山へ登った後の放火。時刻は不明なので夜襲にはせず、日のある場面にする。
    W.lookDark = false;
    rt.setPhase('brief');
    rt.obj('main', '藤吉郎へ', 'main', true);
    // 始まりの知らせ：美濃三人衆の寝返り（信長公記）。字と声だけで、地形は触らない
    rt.say('', '――西美濃の三人衆（稲葉・氏家・安藤）が、織田方へ寝返った', 4);
    rt.say('', '――信長はすぐに兵を出し、稲葉山の城を囲みにかかる', 3.5);
    rt.say(officer(rt), `${nm(rt)}、来たか。今日は風が強い。城下の井口の町に火をかける`, 4.5);
    rt.say(officer(rt), '城下を焼き、囲みの支度をする。……松明を用意せい', 4);
    // 話を聞くまでは旗を動かさず、町の敵の手前で下知を渡す。
    rt.marker('kino', () => F.kinoU.alive ? F.kinoU.pos : null, 'とうきちろう', { group: F.kino, guideAlways: true, guidePerson: () => F.kinoU, guideFootRing: true, guideRadius: 8, guideName: 'とうきちろうへ', guideTalk: false, guideVisibleOnly: true, guideCompact: true });
    buildBattleJin(rt);
  },

  // ① 城下に火を放つ
  burnStart(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    F.torches = townTorches(rt);
    rt.setPhase('burn');
    rt.army.playFar('horagai', F.kinoU.pos, 0.9);
    rt.marker('kino', () => F.kinoU.alive ? F.kinoU.pos : null, '藤吉郎の旗', { group: F.kino, guideAlways: true, guideFlagMesh: () => F.kinoU.alive ? F.kinoFlag : null });
    rt.uninteract('talk');
    rt.banner('井口の町を焼け', '城下を焼いて、城を裸にする');
    // 信長で遊ぶ時：火付けは足軽の役目。当主は町の番の兵を払わせ、焼き働きを見届ける
    rt.obj('main', rt.G.lord ? `足軽の火付けを守れ。町の番の兵を払え（${NEED}軒）` : `目印の家に近づこう（${NEED}軒）`, 'main', true);
    rt.say(officer(rt), rt.G.lord ? '火付けは足軽が担います。町の兵を払い、足軽をお守りくだされ' : '火の印の家へ すすめ', 4);
    if (!rt.G.lord) rt.after(9, () => { if (!rt.over) rt.say('足軽', '逃げ遅れた町の者がおる。刃を向けるな', 3.5); });   // 焼く迷い（A054）
    // 火を移せる距離と家は攻撃操作と共通。近づいた時だけ専用の釦を出す。
    if (!rt.G.lord) for (const h of F.houses) if (h.mine) {
      rt.addInteract('h' + h.i, () => nearFireHouse(rt) === h ? h.approach : null, '火をつける', () => {
        if (nearFireHouse(rt) === h) this.light(rt, h);
      }, { r: HOUSE_FIRE_R + .01, prio: 10 });
    }
    if (rt.G.lord) { for (const h of F.houses) if (h.mine) this.sendTorch(rt, h); }
    this.markHouses(rt);
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.4; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 12; }; };
    // 藤吉郎の旗は町の後ろ。先手と控えの間を退き道にする。
    go(F.kino, 32, 90); go(F.shiba, 40, 62); go(F.niwa, 0, 90);
    // 町の外れの見せ場を、家のない三本の往来へ寄せる。幅の合計を保ち、控えを一列厚くする。
    // 任務・当たり・実兵数は変えず、軽い兵と既存の土煙で前線をつなぐ。
    // 近い二十四歩は実兵の領分にし、家の脇へ寄った時も軽い影絵を正面に残さない。
    // 軽い兵は奥の押し合いを受け持つ。任務の敵と味方の数・当たりは保つ。
    F.townClash = [[14, 82, 10], [34, 66, 12], [-10, 57, 10]].map(([x, z, w], i) => rt.world.addClash({
      x, z, w, facing: Math.PI, seed: 156780 + i, gap: 2.8,
      noWake: true, noRout: true, host: false, nearHide: 24, realNear: 24,
      measuredMelee: true, killRate: 0.025, maxDrift: 0.6, corpses: 16,
      A: { flag: 'oda', armor: 0x3d4248, count: w * 6, team: 0, faction: 'oda', flagRate: 0.35 },
      B: { flag: 'saito', armor: 0x454957, count: w * 6, team: 1, faction: 'saito', flagRate: 0.4 },
      play: (k, p, v) => rt.army.play(k, p, v * 0.65),
    }));
    // 火の手を見た町の番の兵が、松明の組へ斬りかかってくる
    F.town.order = 'attack'; F.town.seekRange = 60; F.town.aggro = 16;
    for (const g of F.houseGuards) { g.aggro = 10; g.seekRange = 10; }
    rt.army.play('eshout', F.town.anchor, 1.3);
    rt.after(2, () => { if (!rt.over && F.step === 1) rt.say('斎藤方の足軽', '織田じゃ！　火付けじゃ、斬れ、斬れい！', 3); });
    rt.marker('town', centerOf(F.town), '町の番の兵', { red: true, group: F.town });
    // 味方もほかの家に火を放っていく
    // 松明を持った足軽が家に寄ってから火が上がる
    F.houses.filter((h) => !h.mine).forEach((h, k) => rt.after(14 + k * 9, () => this.sendTorch(rt, h)));
    rt.after(40, () => {
      if (F.step !== 1 || F.ending || rt.over) return;
      // 延焼する家の位置は遊びの補い。煙だけにせず、里の者が察知できる火を各里に一つ置く。
      // 炎が煙も出すため、煙の柱を重ねて足さない。
      for (const h of F.farHomes) F.farFires.push(rt.world.addFire(h.x, h.z, { h: 2.8, size: 2.4, blackSmoke: true }));
    });
    // 家に火が付くのを待たず、町の後続も斬り込む。
    rt.after(12, () => {
      if (F.step !== 1) return;
      F.town2.sent = true;
      F.town2.order = 'attack'; F.town2.seekRange = 70;
      rt.army.play('eshout', F.town2.anchor, 1.5);
      rt.say('足軽', '城から斎藤勢じゃ！　一人で出るな、仲間と並べ！', 3.5);
      rt.marker('town2', centerOf(F.town2), '城から下りた斎藤勢', { red: true, group: F.town2 });
    });
  },

  attackAction(rt) {
    const h = nearFireHouse(rt);
    if (!h) return false;
    this.light(rt, h);
    return true;
  },
  markHouses(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    // 今の目当ては八歩ほど優先する。等距離の家の間で印を揺らさない。
    const want = F.houseTargets || (F.houseTargets = [null]);
    const old0 = want[0];
    const action = nearFireHouse(rt);
    let first = null, d1 = Infinity;
    if (F.lit < NEED) for (const q of F.houses) {
      if (!q.mine || q.burnt) continue;
      // 攻撃ボタンで火を移す家と、印の家をそろえる。
      if (action === q) { first = q; break; }
      const d = Math.hypot(q.x - p.x, q.z - p.z) - (q === old0 ? 8 : 0);
      if (d < d1 || (d === d1 && q.i < first.i)) { first = q; d1 = d; }
    }
    want.length = 1; want[0] = first;
    for (const q of F.houses) {
      if (q !== first || !q.mine || q.burnt || F.lit >= NEED) { rt.unmark('h' + q.i); continue; }
      const label = rt.G.lord ? '足軽が焼く家' : '火をつける家';
      const marker = rt.markers.find((m) => m.id === 'h' + q.i);
      if (marker) marker.label = label;
      else rt.marker('h' + q.i, q.entrance, label, { h: 0, entrance: true, guideAlways: true, guideSymbol: 'fire', guideAttack: true, guideObject: q.m, guideDestination: () => q.approach });
    }
  },
  // 味方の足軽が松明を持って家に寄り、着いてから火が上がる
  sendTorch(rt, h) {
    const F = rt.flags;
    if (h.burnt || F.ending || rt.over || F.step !== 1 || F.torchHouse === h || F.torchQueue.includes(h)) return;
    F.torchQueue.push(h);
  },
  torchTick(rt) {
    const F = rt.flags, g = F.torchG;
    if (F.ending || gone(g) || g.woundOut) return;
    if (!F.torchHouse) {
      while (F.torchQueue.length && F.torchQueue[0].burnt) F.torchQueue.shift();
      if (!F.torchQueue.length) return;
      F.torchHouse = F.torchQueue.shift();
      const h = F.torchHouse;
      g.order = 'move'; g.dest = h.approach; g.speed = 2.4;
      g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = gg.dest; };
    }
    const h = F.torchHouse, c = g.center();
    if (Math.hypot(c.x - h.approach.x, c.z - h.approach.z) > 3) { F.torchHold = 0; return; }
    F.torchHold = (F.torchHold || 0) + 0.5;
    if (F.torchHold < 1.5) return;
    if (h.mine && F.lit < NEED) this.light(rt, h, false); else burnTownHouse(rt, h);
    F.torchHouse = null; F.torchHold = 0;
  },
  // そばの組頭の下知は即座に出す。達成札や遠い使番で次の行動を隠さない。
  nextObj(rt, text) {
    if (!rt.over && !rt.flags.ending) rt.obj('main', text, 'main', true);
  },

  light(rt, h, own = true) {
    const F = rt.flags;
    if (h.burnt || F.ending || rt.over || F.step !== 1) return;
    burnTownHouse(rt, h);
    rt.uninteract('h' + h.i); rt.unmark('h' + h.i);
    F.lit++;
    if (own && !rt.G.lord) rt.award((t) => { t.special = { label: '城下に火を放った', pts: 4 * F.lit }; }, '家に火を放った');
    if (F.lit === NEED) {
      this.nextObj(rt, '出口へすすもう');
      // 家のない東の往来の先。動く武将の旗を出口の代わりにしない。
      rt.marker('townExit', { x: 25, z: 44 }, '町の出口', { h: 0, guideAlways: true, guideRadius: 8, guideSymbol: 'gate' });
      for (const q of F.houses.filter((x) => x.mine && !x.burnt)) { rt.uninteract('h' + q.i); rt.unmark('h' + q.i); this.sendTorch(rt, q); }
      rt.say(officer(rt), '町は燃えた。まず出口へにげ、仲間と合流せよ！', 3.5);
      // 井ノ口の町が燃え上がり、黒い煙が金華山へ上っていく（煙の柱は数を絞る）
      if (!F.townSmoke) {
        F.townSmoke = true;
        for (const [x, z, sz] of [[14, 74, 3.6], [-4, 56, 3.2], [32, 60, 3.4]]) rt.world.addSmokeColumn(x, rt.world.heightAt(x, z) + 5, z, { size: sz, black: true });
        rt.after(4, () => { if (!rt.over && F.step === 1) rt.say('足軽', '煙が山へ上っていく……城からも、この火は見えておろう', 3); });
      }
      // 町の斎藤の兵を追い払うまで、次の攻めへ進まない。
      F.clearT = rt.t;
    } else {
      this.markHouses(rt);
      rt.objProgress('main', rt.G.lord ? `${F.lit}／${NEED}軒・火付けの足軽を守れ` : `${F.lit}／${NEED}軒・次の目印の家へ`);
      if (own && !rt.G.lord) rt.say('足軽', F.lit === 1 ? '火が付いた。次は印の家じゃ' : 'あと一軒じゃ。ほかの家はわしらが焼く', 3);
    }
  },

  // ② 翌日：山の麓に鹿垣を結い、大手の坂を駆け下りる斎藤勢を受け止める
  // （信長公記：町を焼いた翌日、四方に鹿垣を結い廻して取り籠めた。鹿垣は麓に結う。山の中腹には置かない）
  sally(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    if (F.torches) { F.torches.stop(); F.torches = null; }
    rt.setPhase('ote');
    rt.unmark('town'); rt.unmark('town2'); rt.unmark('townExit');
    for (const q of F.townGuards) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 20); }
    // 日をまたぐ移動は暗転で区切り、味方と一緒に翌日の持ち場から再開する（時刻は仮設定）。
    blackCut(rt, () => {
      if (rt.over || F.ending || F.step !== 2) return;
      const W = rt.world;
      // 鹿垣の内から、坂を下る斎藤勢を弓で迎える（弓を覚える場面）。寄られたら持ち替えて槍で突く。
      if (rt.player.hasBow && rt.player.weapon !== 'bow' && !rt.player.mounted) rt.player.switchWeapon('bow');
      // 放火の日から一夜が過ぎた。民だけ逃走の数秒後のまま焼け跡へ残さない。
      // 南の里・川沿いへ退避した扱いにする遊び上の補い。避難の実際の時刻は不明。
      // 日中は既存の道で逃がし、日をまたぐ暗転の中だけで退避を完了する。
      const crowd = rt.warCrowd;
      if (crowd) {
        for (const band of crowd.bands) band.state = 'gone';
        for (const a of crowd.agents) { a.out = false; a.model = null; }
        for (const p of crowd.pool) { p.a = null; p.mesh.visible = false; }
        crowd.im.visible = false;
      }
      // 日をまたぐ暗転の中で町の乱戦を片付け、麓の戦と二重に数えない。
      if (F.townClash) {
        const meshes = new Set();
        for (const C of F.townClash) {
          C.mesh.removeFromParent();
          C.mesh.traverse((m) => { meshes.add(m); m.geometry?.dispose(); });
        }
        W.clashes = W.clashes.filter((c) => !F.townClash.includes(c));
        W.lodList = (W.lodList || []).filter((m) => !meshes.has(m));
        F.townClash = null;
      }
      W.lookDark = false; W.setTime('day');
      if (W.fade) { W.fade = null; W.applyLook(W.lookOf('day')); W.updateEnv(); }
      for (const g of [F.kino, F.shiba, F.niwa, F.nGun]) {
        const x = g === F.kino ? -4 : g === F.shiba ? 13 : g === F.niwa ? -21 : -12;
        placeGroup(rt, g, x, SHIKA_Z + (g === F.nGun ? 3 : 5));
        g.aggro = 12; g.facing = Math.PI;
      }
      placePlayer(rt, 2, SHIKA_Z + 7, Math.PI);
      let row = 0;
      for (const q of rt.squadGroups || []) placeGroup(rt, q, 4 + row++ * 3, SHIKA_Z + 12);
      rt.banner('翌日、城を囲む', '仲間とさくの中で敵を引きつける');
    }, '翌日、城を囲む\n仲間と、ふもとのさくの内へ');
    sfx('taiko', 1);
    // 一夜明けて、町は焼け跡。火は落ち、煙だけが残る
    for (const h of F.houses) charHouse(rt, h);
    // 南の里も同じ夜に火が落ちる。翌日の民の警戒に、前日の炎を残さない。
    for (const fire of F.farFires) rt.world.removeFire(fire);
    F.farFires.length = 0;
    for (const [x, z, sz] of [[10, 70, 2.4], [-6, 50, 2], [38, 52, 2.2]]) rt.world.addSmokeColumn(x, rt.world.heightAt(x, z) + 4, z, { size: sz });
    this.nextObj(rt, '旗の人の所へ。さくの中の敵を引きつけよう');
    F.holdArrived = false;
    F.holdPoint = { x: -4, z: SHIKA_Z + 5 };
    rt.marker('holdFlag', F.holdPoint, 'さくの内', { h: 0, group: F.kino, guideFlagMesh: () => F.kinoFlag, guideAlways: true, guideArea: 'wait', guideWaitRing: true, guideDefend: true, guideFootRing: true, guideRadius: 3 });
    // 足軽が鹿垣（枝を組んだ低い垣）を一間ずつ結っていく。三か所は打って出る口に空けておく
    for (let i = 0; i < 8; i++) rt.after(2 + i * 1.5, () => {
      if (F.step !== 2 || SHIKA_GAPS.includes(i)) return;
      const x = SHIKA_X0 + i * SHIKA_W, z0 = SHIKA_Z + Math.sin(i) * 1.2, z1 = SHIKA_Z + Math.sin(i + 1) * 1.2;
      const seg = wallLine(rt, [[x, z0], [x + SHIKA_W, z1]], { team: 0, hp: 260, name: '鹿垣', segLen: SHIKA_W, h: 1.4, mesh: shikaWall });
      for (const q of seg) q.noTarget = true;
      rt.army.play('knock', { x: x + SHIKA_W / 2, z: z0 }, 0.6);
    });
    // 鹿垣を結い終えたら、すぐ内に織田木瓜と永楽通宝の幟を立て並べる（打って出る口と組の立つ所は避ける）
    rt.after(14, () => {
      if (rt.over || F.shikaFlags) return;
      F.shikaFlags = true;
      [[-32, 'oda'], [-28.5, 'eiraku'], [23, 'oda'], [28, 'eiraku'], [33, 'oda']].forEach(([x, k]) => rt.scene.add(nobori(rt.world, x, SHIKA_Z + 2.2, k, 5.5)));
    });
    F.ote.order = 'hold';
    // 鹿垣の内の組は藤吉郎・柴田・丹羽がその場で下知する（瑞龍寺山からの使番を待たない。待つと列が揃わず、搦手へも出られない）
    for (const g of [F.kino, F.shiba, F.niwa, F.nGun]) g.siegeAI = true;
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.6; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.facing = Math.PI; gg.aggro = 12; }; };
    go(F.kino, -4, SHIKA_Z + 5); go(F.shiba, 13, SHIKA_Z + 5); go(F.niwa, -21, SHIKA_Z + 5); go(F.nGun, -12, SHIKA_Z + 3);
    // 森・坂井の手は大手の坂の下で城兵を引き付けたまま（本物の兵に替えない。鹿垣の内は物語の組が受け持つ）
    // 美濃三人衆は西の端の後ろに控える（下の軽い合戦と重ねない）
    F.sannin.order({ id: 'move', to: { x: -66, z: 58 } });
    // 竹束（taketaba.js）：鉄砲衆の前に竹束を押し立て、陰から撃つ
    F.TA = makeTabaAdvance(rt, {
      near: 30, holdRanged: 20, holdMelee: 8,
      items: [{ g: F.nGun, yose: { x: -12, z: SHIKA_Z + 3 } }],
      avoid: [rt.player.u.pos && { x: rt.player.u.pos.x, z: rt.player.u.pos.z }],
    });
    // 竹束の後ろへ視点が入り込むと横画面を塞ぐ。この戦の束だけ既存の視点避けへ渡す。
    for (const tb of F.tabas || []) tb.m.userData.camBlock = true;
    // 麓の左右でも、囲みの手と打って出た城兵がぶつかる（軽い大軍の合戦。兵力には数えない）
    const side = (flag, armor, count, team, faction) => ({ flagTex: flagTexture(flag), armor, count, team, faction });
    const lc = (o) => rt.world.addClash({ rt, measuredMelee: true, play: (k, p, v) => rt.army.play(k, p, v), smoke: (x, y, z, fx, fz) => rt.army.smoke(x, y, z, fx, fz), ...o });
    F.footClash = [
      lc({ x: -68, z: 30, facing: Math.PI, w: 34, gap0: 18, closeSpeed: 2.6, seed: 15673, noRout: true, killRate: 0.1, A: side('inaba', 0x33302a, 150, 0, 'oda'), B: side('saito', 0x3a3a30, 110, 1, 'saito') }),
      lc({ x: 62, z: 28, facing: Math.PI, w: 32, gap0: 18, closeSpeed: 2.6, seed: 15674, noRout: true, killRate: 0.1, A: side('oda', 0x2b3140, 150, 0, 'oda'), B: side('saito', 0x3a3a30, 110, 1, 'saito') }),
    ];
    rt.say(officer(rt), '町は焼けた。今日は麓に鹿垣を結い、城を取り籠める', 3.5);
    rt.after(4, () => { if (F.step === 2) rt.say(officer(rt), '敵が坂を下ってくるぞ。さくの中で引きつけよ！', 3.5); });
    rt.after(9, () => { if (F.step === 2) rt.say('鉄砲頭', '鉄砲は引きつけてから放つ。崩れてから突け', 3.5); });
    // 山の上で法螺と太鼓。坂の上に旗が並び、鬨の声とともに駆け下りてくる
    rt.after(12, () => {
      if (rt.over || F.step !== 2 || gone(F.ote)) return;
      F.oteSignal = true;
      rt.army.playFar('sig_kakari', F.ote.anchor, 1);
      rt.say('足軽', '坂の上から敵が来るぞ！　さくの中で待ち構えよ！', 4);
    });
    rt.after(16, () => {
      if (F.step !== 2 || gone(F.ote)) return;
      F.ote.noAI = false; F.ote.siegeAI = true; F.ote.fire = true;
      march(F.ote, [[-20, 25], [-20, 31], [-21, SHIKA_Z + 5]], 'attack');
      rt.army.play('eshout', F.ote.anchor, 1.7);
      rt.army.play('toki', F.ote.anchor, 1.3);
      rt.say('斎藤方の侍', '町を焼いた織田の者どもを追い落とせ！', 3);
      rt.marker('ote', centerOf(F.ote), '大手の斎藤勢', { red: true, group: F.ote });
      for (const C of F.footClash) C.go();
    });
    // 新手は初めの勢が崩れたら五秒後、遅くとも四十五秒で下りてくる
    rt.after(36, () => this.oteWarn(rt));
    rt.after(45, () => this.ote2(rt));
  },
  oteWarn(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step !== 2 || F.ote2.sent || F.oteWarned) return;
    F.oteWarned = true;
    rt.say('足軽', '大手の控えが動いた！　仲間と並んで新手に備えよ', 3);
  },
  ote2(rt) {
    const F = rt.flags;
    {
      if (F.step !== 2 || F.ote2.sent) return;
      F.ote2.sent = true; F.ote2T = rt.t;
      F.ote2.noAI = false; F.ote2.siegeAI = true; F.ote2.fire = true;
      march(F.ote2, [[-24, 21], [-20, 28], [-20, 31], [-21, SHIKA_Z + 5]], 'attack');
      rt.army.play('eshout', F.ote2.anchor, 1.4);
      rt.say('足軽', '坂の上から新手じゃ！　鹿垣を破らせるな！', 3);
      // 麓の左右の城兵も新手に合わせて押し出す
      for (const C of F.footClash || []) C.push('A', 0.35);
      rt.marker('ote2', centerOf(F.ote2), '大手の新手', { red: true, group: F.ote2 });
    }
  },

  // ③ 搦手の道を登る
  // 麓から金華山の急な斜面を組ごと登らせると列が詰まって動かない。大手で城兵を引き付ける間に、
  // 藤吉郎の手は裏道の登り口まで回った所から始める（傷・組の数・身分はそのまま）
  karamete(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.unmark('holdFlag');
    rt.setPhase('karamete');
    // 細い山道は槍で登る。
    if (rt.player.weapon === 'bow') rt.player.switchWeapon('spear');
    rt.unmark('ote'); rt.unmark('ote2');
    for (const q of [F.ote, F.ote2]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('大手の打って出を退けた'), '大手の斎藤勢を退けた');
    rt.say(officer(rt), '大手は固い。……じゃが、山の裏に細い道があると、この辺りの者に聞いた', 3.5);
    const K = F.kino;
    // 暗転の間に、裏道の登り口へ回る
    blackCut(rt, () => {
      if (rt.over || F.ending) return;
      // 麓の軽い合戦は山の裏からは見えない。描く物と毎コマの計算を外す（形は合戦ごとの複製なので捨ててよい）
      if (F.footClash) {
        const W = rt.world;
        W.clashes = (W.clashes || []).filter((c) => !F.footClash.includes(c));
        for (const C of F.footClash) { C.mesh.removeFromParent(); C.mesh.traverse((o) => o.geometry?.dispose()); }
        F.footClash = null;
      }
      placeKaraGroup(rt, K, 16);
      placePlayer(rt, KARA_FOOT.x + 2.2, KARA_FOOT.z + 12, 0);
      roadApproach(rt.world, rt.player.u.pos, KARA_TRAIL, F.karaNext, F.karaGuide);
      let companionRow = 0;
      for (const u of rt.tomoUnits || []) if (u.alive && !u.gone && !u.woundOut) {
        u.pos.x = KARA_FOOT.x + 2.2; u.pos.z = KARA_FOOT.z + Math.max(1, 10 - companionRow++ * 1.5);
        u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); u.mesh.position.copy(u.pos);
      }
      let row = 0;
      for (const q of rt.squadGroups || []) placeKaraGroup(rt, q, Math.max(5, 11 - row++ * 3));
      // 小六の手も切岸へ横並びにせず、同じ道の後列から登る。
      if (!F.hachi) {
        F.hachi = allyGroup(rt, { fixed: true, name: '蜂須賀小六の手', anchor: { x: KARA_FOOT.x, z: KARA_FOOT.z + 6 }, facing: 0, width: 2, aggro: 10 },
          dress([{ type: 'samurai', n: 1, o: { name: '蜂須賀小六' } }, { type: 'ashigaru', n: 7 }], { flag: 'hachisuka' }));
        F.hachi.siegeAI = true; F.hachi.noRout = true;
        placeKaraGroup(rt, F.hachi, 6);
        march(F.hachi, KARA_TRAIL.slice(0, -1), 'attack'); F.hachi.pathIdx = 1; F.hachi.speed = 3.2;
      }
      rt.banner('搦手へ（伝え）', '藤吉郎の手が山の裏道から登った、と伝わる');
      rt.say('', '――藤吉郎の手が山の裏道から登った、と伝わる', 4);
      // 搦手の別働隊の知らせ（本隊は大手、藤吉郎の手は裏から。本丸で挟む）
      rt.after(9, () => { if (!rt.over && !F.ending && F.step === 3) rt.say('使番', '殿の下知じゃ。大手の本隊は正面を押す。藤吉郎の手は別働隊として搦手から本丸を突け', 4); });
      rt.after(4, () => { if (!rt.over && !F.ending) rt.say(officer(rt), `${nm(rt)}、ついて来い。わしらは裏から登って、本丸の脇に火をつける`, 4); });
      K.order = 'path'; K.path = KARA_TRAIL.slice(0, -1); K.pathIdx = 1; K.speed = 3.2; K.formation = 'column'; K.colW = 2; K.roadColumn = true; K.aggro = 6; K.holdFire = true; K.fire = false;   // 細道を登る間は鉄砲を撃たず列に付いて歩く
      K.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: KARA[KARA.length - 2][0], z: KARA[KARA.length - 2][1] }; g.formation = 'yari'; g.aggro = 14; g.seekRange = 24; if (F.guardOn) g.order = 'attack'; };
      F.climbFriends = [K, F.hachi];
      F.climbSkirmishes = [F.scout, F.patrol, F.ambush, F.koshiGuard];
      F.climbFoes = [...F.climbGuards, F.scout, F.patrol, F.ambush, F.koshiGuard, F.kguard];
    }, '山の裏へ回る\n藤吉郎の列と、裏道の登り口へ');
    this.nextObj(rt, 'この先へ');
    // 印は進み具合と同じ的（搦手の木戸）に。藤吉郎の名札は頭の上に出る
    rt.marker('kido', { x: -30, z: -118 }, '搦手の木戸', { h: 3, guideAlways: true });
    F.climbSpots = 0; F.karaNext = 1;
    F.karaGuide = { x: KARA_TRAIL[1][0], z: KARA_TRAIL[1][1], returning: false };
    rt.marker('karaGuide', () => F.karaGuide, () => F.karaGuide.returning ? '道の中央' : '次の曲がり角', { guideAlways: true, guideArea: 'move', guideRadius: 1.2, h: 0 });
    F.karaGuideMarked = true;
    // 大手には柴田・丹羽が残って押さえる
    for (const g of [F.shiba, F.niwa]) { g.order = 'hold'; g.anchor = { x: g === F.shiba ? 20 : -16, z: SHIKA_Z + 6 }; }
    // 軍議で決めた作戦で、外の部隊が動き出す（七曲り・百曲り・水の手）
    this.runStrategy(rt);
    // 搦手の木戸の守り
    F.kguard.order = 'hold';
  },

  // 搦手の登りの途中の出来事：岩場の足止め、藤吉郎の小声、物見との小競り合い
  climbEvents(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    const lead = F.kinoU.pos;
    // 折り返しは平面では近い。別の高さを通っただけで上の物見や伏兵を動かさない。
    const near = (i, r) => {
      const [x, z] = KARA[i], y = rt.world.heightAt(x, z), rise = Math.max(4, r * 0.8);
      return Math.hypot(p.x - x, p.z - z) < r && Math.abs(p.y - y) < rise
        || Math.hypot(lead.x - x, lead.z - z) < r && Math.abs(lead.y - y) < rise;
    };
    if (F.climbSpots === 0 && near(1, 9)) {
      F.climbSpots = 1;
      rt.say(officer(rt), '（小声で）ここから岩場じゃ。細い道を歩き、藤吉郎の旗を離れるな', 3.5);
      // 足止めのために隊の歩みを半分にしない。岩場でも同じ道を進む。
      rt.army.play('knock', { x: KARA[1][0], z: KARA[1][1] }, 0.5);
    } else if (F.climbSpots === 1 && near(1, 14)) {
      F.climbSpots = 2;
      // 斎藤の物見が二人。見つかれば声を上げられる前に討て
      F.scout.order = 'attack';
      rt.say('足軽', '物見じゃ！　声を上げさせるな！', 2.5);
      rt.marker('scout', centerOf(F.scout), '物見', { red: true, group: F.scout });
      // 物見の声で、見回りの組が細道を駆け下りてくる。列の頭と槍がぶつかる
      rt.after(2, () => {
        if (F.ending || F.guardOn || gone(F.patrol)) return;
        F.patrol.order = 'attack'; F.patrol.noAI = false; F.patrol.seekRange = 30; F.patrol.aggro = 14;
        rt.army.play('eshout', F.patrol.anchor, 1.3);
        rt.say('斎藤方の侍', '裏から織田じゃ！　ここで止めよ、通すな！', 3);
        rt.marker('patrol', centerOf(F.patrol), '見回りの組', { red: true, group: F.patrol });
        F.kino.aggro = 14; F.kino.seekRange = 18;
      });
    } else if (F.climbSpots === 2 && near(2, 14)) {
      F.climbSpots = 3;
      rt.unmark('scout');
      rt.say(officer(rt), '（小声で）あの木戸を抜ければ本丸の裏じゃ。……一気に行くぞ', 3.5);
      // 曲がり角の伏兵（GAME_C）：岩陰に槍が潜み、上の段から鉄砲が二挺。細い道なので一度に当たれる数は少ない
      rt.after(3, () => {
        if (F.ending || F.guardOn) return;
        F.ambush.order = 'attack';
        // 列の藤吉郎の手も槍を返して伏兵に当たる（自分ひとりに伏兵を受けさせない）
        F.kino.aggro = 14; F.kino.seekRange = 18;
        F.ambushGun.order = 'hold';
        rt.army.play('eshout', F.ambush.anchor, 1.2);
        rt.say('足軽', '岩陰じゃ！　曲がり角に伏せておった！', 2.5);
        rt.marker('ambush', centerOf(F.ambush), '岩陰の伏兵', { red: true, group: F.ambush });
      });
    }
    // 物見櫓：搦手の岩場を過ぎた辺りで気付く（任務ではない。登って射手を討てば手柄）
    if (!F.towerSeen && F.climbSpots >= 1 && Math.hypot(p.x - TOWER.x, p.z - TOWER.z) < 22) {
      F.towerSeen = true;
      rt.say(officer(rt), '（小声で）物見櫓じゃ。射手が気付く前に、登って黙らせられればよいが……', 3.5);
      rt.marker('tower', { x: TOWER.x, z: TOWER.z }, () => gone(F.towerArchers) ? null : '物見櫓の射手', { red: true, group: F.towerArchers });
    }
  },
  // 竹束を抱える／据える（castle-design 7-3）：抱えている間は速さ 6 割・突けない（player.js の flags.carry）。
  // 落石・矢を前から 7 割防ぐ（siege_rocks.js の guarded・army_ranged.js の竹束の陰と同じ考え）
  tabaBack(rt, on) {
    const F = rt.flags;
    if (on && !F.tabaBackMesh) {
      const m = tabaMesh(rt.world, 0, 0, 0);
      m.position.set(0, 0.2, -0.35); m.rotation.set(0.25, 0, 0); m.scale.setScalar(0.62);
      rt.player.u.mesh.add(m);
      F.tabaBackMesh = m;
    } else if (!on && F.tabaBackMesh) { rt.player.u.mesh.remove(F.tabaBackMesh); F.tabaBackMesh = null; }
  },
  tabaTake(rt) {
    const F = rt.flags;
    if (F.carry) return;
    F.carry = true;
    F.carryPrev = { x: rt.player.u.pos.x, z: rt.player.u.pos.z };
    this.tabaBack(rt, true);
    rt.uninteract('tabaPile'); rt.scene.remove(F.tabaPile);
    rt.addInteract('tabaSet', rt.player.u.pos, '竹束を据える', () => this.tabaSet(rt), { r: 3, hold: 1 });
    rt.obj('carry', '竹束を担いでいる。歩みが遅い。「竹束を据える」で置く', 'order');
    rt.bark('竹束を担いだ。歩みが遅くなる。「竹束を据える」を長く押すと置ける', true);
  },
  tabaSet(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (!F.carry) return;
    F.carry = false; F.carryPrev = null; rt.objRemove('carry');
    this.tabaBack(rt, false);
    rt.uninteract('tabaSet');
    const m = tabaMesh(rt.world, p.x, p.z, rt.player.yaw || 0);
    rt.scene.add(m);
    F.tabaPile = m;
    rt.addInteract('tabaPile', { x: p.x, z: p.z }, '竹束を担ぐ', () => this.tabaTake(rt), { r: 3, hold: 1 });
  },
  // 搦手の守りとぶつかる
  guardFight(rt) {
    const F = rt.flags;
    if (F.guardOn) return;
    F.guardOn = true; F.guardT = rt.t;
    rt.unmark('kido');
    this.nextObj(rt, '搦手の守りを破れ');
    F.kguard.order = 'hold'; F.kguard.aggro = 12;
    // 曲がり角の手前で縦列を解くと柵へ直進する。木戸まで道をたどってから槍をそろえる。
    if (F.kino.order !== 'path') { F.kino.order = 'attack'; F.kino.formation = 'yari'; }
    F.kino.seekRange = 24; F.kino.holdFire = false; F.kino.fire = true;
    if (F.hachi && !gone(F.hachi) && F.hachi.order !== 'path') { F.hachi.order = 'attack'; F.hachi.seekRange = 24; }
    rt.army.play('eshout', { x: -30, z: -118 }, 1.4);
    rt.say('斎藤方の足軽', '裏から来たぞ！　こんな所まで……！', 3);
    rt.marker('kguard', centerOf(F.kguard), '搦手の守り', { red: true, group: F.kguard });
  },

  // ④ 本丸の脇に火を放つ
  signal(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('honmaru');
    rt.unmark('kguard');
    rt.unmark('karaGuide'); F.karaGuideMarked = false;
    rt.award((t) => t.side.push('搦手の木戸を破った'), '搦手の守りを破った');
    rt.say(officer(rt), '本丸の守りを退け、小屋に火を放て。瑞龍寺山の本陣への合図じゃ', 4);
    this.nextObj(rt, '仲間と本丸の旗本を退けよ。城主を討つ任務ではない');
    march(F.kino, [[HON_GATE_OUT.x, HON_GATE_OUT.z], KARA[KARA.length - 1]], 'attack');
    // 木戸が破れ、裏道に残った鉄砲・射手も本丸の奥へ退く（背中から撃ち続けさせない）
    for (const g of [F.kguard, F.ambushGun, F.towerArchers, F.ambush, F.koshiGuard, F.scout, F.patrol, ...F.climbGuards]) if (g && !gone(g)) { g.noRout = false; g.morale = 0; }
    // 櫓の上の射手は降りられない。弓を下ろして黙る
    if (F.towerArchers) { F.towerArchers.fire = false; F.towerArchers.holdFire = true; F.towerArchers.aggro = 0; }
    if (F.hachi && !gone(F.hachi)) march(F.hachi, [[HON_GATE_OUT.x, HON_GATE_OUT.z], KARA[KARA.length - 1]], 'attack');
    // 搦手の騒ぎで本丸の守りが割れた所へ、七曲りを押し上げた大手の寄せ手の先手が本丸の口へ上がってくる（遊びの補い）。
    // 旗本を表と裏から挟み、本丸の前が入り乱れる。城主を討つ役ではない
    if (!F.oteUp) {
      rt.after(8, () => {
        if (rt.over || F.ending || F.step !== 4) return;
        F.oteUp = allyGroup(rt, { fixed: true, name: '大手から上がった寄せ手', anchor: { x: NIMON.x + 4, z: NIMON.z + 4 }, facing: Math.atan2(HON.x - NIMON.x, HON.z - NIMON.z), width: 4, aggro: 14, seekRange: 30, order: 'attack', formation: 'yari' },
          dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }], ODA));
        F.oteUp.noRout = true;
        rt.army.play('eshout', NIMON, 1.6);
        rt.say('足軽', '二の門から味方じゃ！　大手の衆が上がってきたぞ！', 3);
        rt.banner('本丸を挟む', '表から大手の本隊、裏から藤吉郎の手');
      });
    }
    // 裏から破られた本丸の守りは浮き足立つ（三人衆の寝返りの後で、もともと士気が低い）
    for (const g of [...F.hata, F.tatsu]) if (!gone(g)) { g.order = 'hold'; g.aggro = 10; g.morale = Math.min(g.morale, 60); }
    this.guideHon(rt);
  },
  // 次に退ける守りを一組だけ指す。主殿の奥へ城主を追わせない。
  guideHon(rt) {
    const F = rt.flags;
    let target = null, left = 0;
    for (const g of F.honGuards) if (!gone(g)) { if (!target) target = g; left++; }
    if (!target) return;
    if (F.honTarget !== target) {
      F.honTarget = target;
      rt.marker('honGuard', () => {
        for (const u of target.units) if (u.alive && !u.fleeing) return u.pos;
        return null;
      }, target.name, { red: true, group: target });
    }
    rt.objProgress('main', `${target.name}を仲間と退けよ。残る守りは${left}組`);
  },
  // 主殿への到達だけでは開城や城主の討死にしない。
  reachTatsu(rt) {
    const F = rt.flags;
    if (F.ending || F.step < 4) return;
    F.reachedTatsu = true;
    if (F.keep.lord) {
      const u = F.keep.lord, g = u.group;
      u.noTarget = true;
      g.order = 'move'; g.dest = { x: F.keep.spot.x, z: F.keep.spot.z - 1.5 };
      g.onArrive = (q) => { q.order = 'hold'; q.anchor = q.dest; };
    }
    rt.bark('近習が城主を守り、奥で退く支度をしている。組へ戻り、合図の火を守れ');
  },
  // 旗本を退けたら、合図の火
  lightSig(rt) {
    const F = rt.flags;
    if (F.sig || F.step !== 4 || !F.hata.every(gone) || !gone(F.tatsu) || !gone(F.keep.guard)) return;
    for (const n2 of ['本丸の旗本', '御殿から出た旗本', '二の丸から上がった斎藤勢']) rt.unmark(n2);
    rt.unmark('honGuard');
    const S = { x: HON.x + 8, z: HON.z + 12 };
    F.sig = S; F.sigT = rt.t;
    // 本丸の守りを退けた時点で合図を上げ、移動や操作を待たず勝ちにする。
    this.win(rt);
  },

  // 軍議の作戦（七曲り・百曲り・水の手）で、外の部隊を動かす。自分の筋（藤吉郎の手と搦手）はそのまま
  runStrategy(rt) {
    const F = rt.flags;
    if (F.stratRun) return;
    F.stratRun = true;
    const requested = window.__inabaStrategy || F.strategy;
    const s = F.strategy = STRATS[requested] ? requested : 'nanamagari';
    const pin = (b, x) => b.order({ id: 'move', to: { x, z: -30 } });
    // （本物が出るのを待って、道の下知を出し直す。軽い大軍だけの間に出した下知は、新しく出た本物の組へ届かない）
    rt.after(3, () => { for (const b of F.attackers) if (b._route && !b._wait && b._i > 0) { const p = b._route[b._i - 1]; b.order({ id: 'move', to: { x: p[0], z: p[1] } }); } });
    if (s === 'hyakumagari') {
      // 大手は鹿垣で構えて引き付け、佐久間・池田が東の百曲りを登って本丸の脇へ
      setRoute(F.sakuma, R_HYAKU, F); setRoute(F.ikeda, R_HYAKU, F);
      pin(F.oteYose1, -24); pin(F.oteYose2, 24);
      rt.after(5, () => rt.say('柴田勝家', '佐久間と池田が百曲りを登る。大手は引き付けておくだけでよい', 3.5));
    } else if (s === 'mizunote') {
      // 大勢を水の手へ。池田と美濃三人衆が藤吉郎の手の後ろから登る（大手は手薄になる）
      setRoute(F.ikeda, R_MIZU, F); setRoute(F.sannin, R_MIZU, F);
      pin(F.oteYose1, -24); pin(F.oteYose2, 24);
      rt.after(5, () => rt.say('稲葉一鉄', '水の手へは、わしらも続く。藤吉郎が先じゃ、わしらはその後ろを固める', 3.5));
    } else {
      // 七曲り（史実の既定）：大手の寄せ手が七曲りを押し上げ、大手の木戸の前で城兵を引き付ける
      setRoute(F.oteYose1, R_NANA, F); setRoute(F.oteYose2, R_NANA, F); setRoute(F.sakuma, R_NANA, F);
      rt.after(5, () => rt.say('柴田勝家', '森と坂井が七曲りを押し上げる。木戸の前で城兵を引き付けるぞ', 3.5));
    }
    rt.bark(`下知：${STRATS[s].short}へ寄せる`);
  },

  // 区域が落ちた（siege_zones の onFall）：知らせだけ。勝ち負けは筋（合図の火）と本丸で決める
  onZoneFall(rt, id) {
    const F = rt.flags;
    F.fell = F.fell || {};
    if (F.fell[id]) return;
    F.fell[id] = true;
    if (id === 'hon') rt.bark('本丸の持ち場を確保した。旗本を退け、脇の小屋の合図を忘れるな');
    if (id === 'ote' && F.step < 4 && sightPoint(rt, OTE)) rt.say('柴田勝家', '大手の木戸を取ったぞ！　城兵は本丸へ退いた', 3);
    // 舟着きの占拠だけでは城主の退路全体を断ったと判断しない。
  },

  // 囲みの部隊と山の曲輪の備の押し合い（遠くの数の戦い）。一番乗りで待っている所・着いた所で、近い備と削り合う
  siegeClash(rt, dt) {
    const F = rt.flags;
    for (const a of F.attackers) {
      // 近くの戦いと本物の兵の損害は、槍・矢の当たりで決める。
      if (a.aliveNominal() <= 0 || !a._done || a.realCount() > 0 || Math.hypot(a.pos.x - rt.player.u.pos.x, a.pos.z - rt.player.u.pos.z) < 35) continue;
      for (const d of F.defenders) {
        if (d === F.honB || d.aliveNominal() <= 0 || d.realCount() > 0 || Math.hypot(d.pos.x - rt.player.u.pos.x, d.pos.z - rt.player.u.pos.z) < 35) continue;
        if (Math.hypot(a.pos.x - d.pos.x, a.pos.z - d.pos.z) < 14 && Math.abs(rt.world.heightAt(a.pos.x, a.pos.z) - rt.world.heightAt(d.pos.x, d.pos.z)) < 3 && !rt.army.wallBetween(a.pos, -1, d.pos, false)) clash(a, d, dt, 0.12);
      }
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 4 || !F.sig || !F.hata.every(gone) || !gone(F.tatsu) || !gone(F.keep.guard)) return;
    F.ending = true; F.win = true; F.endT = rt.t;
    rt.setPhase('end');
    rt.uninteract('sig'); rt.unmark('sig');
    const S = F.sig;
    rt.world.addFire(S.x, S.z, { h: 1.6 });
    rt.world.addSmokeColumn(S.x, rt.world.heightAt(S.x, S.z) + 6, S.z, { size: 3 });
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '搦手から本丸に火を放った', pts: 20 }; }, '任務達成・本丸に合図の火');
    rt.unzone('ote'); rt.unmark('ote3');
    // 合図だけで、まだ別の曲輪にいる守兵まで崩さない。
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('合図の火が上がる', '組をまとめ、持ち場を守れ。囲みはまだ続く');
    rt.after(5, () => {
      rt.banner('囲みの末、城が開く', '信長公記では八月十五日。龍興は舟で長島へ退いた');
      rt.say('', '――信長公記の日付に沿い、半月ほど後の開城を描く。落城を九月とする説もある', 5);
    });
    // 龍興が逃げた知らせで終わる（次の戦の前ふりは置かない）
    rt.after(15.5, () => rt.say('使番', '龍興は川を舟で下り、長島へ逃げたぞ！', 4));
    // 合図の後も各備は持ち場を保つ。
    for (const b of F.attackers) b.order({ id: 'hold' });
    rt.army.play('eshout', { x: OTE.x, z: OTE.z + 20 }, 2);
    rt.after(2, () => { if (F.kinoU.alive) rt.say(officer(rt), '聞こえるか、麓の鬨じゃ。瑞龍寺山の殿にも、この火は見えておる', 3); });
    rt.after(11, () => rt.say('', '――信長は井口を「岐阜」と改め、「天下布武」の印を使い始めた', 4));
    rt.player.u.invuln = true;
    // 戦固有の終幕（開城・岐阜・箕作城への一行）を最後まで見せる。共通の追撃に替えて時計を消さない
    rt.finish({ scriptedEnd: true }, 20);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 藤吉郎のそばへ寄るだけで組に加わる（「話す」を押させない。kaito 10/23 39・初めての人の迷い）。
    if (F.step === 0 && !F.joinedKino && F.kinoU?.alive && rt.player.u.alive &&
        Math.hypot(F.kinoU.pos.x - rt.player.u.pos.x, F.kinoU.pos.z - rt.player.u.pos.z) <= 8) {
      F.joinedKino = true; rt.uninteract('talk');
      rt.say(officer(rt), 'よし、行くぞ。わしの手から離れるな', 2.5);
      rt.after(2.5, () => this.burnStart(rt));
    }
    if (F.torches) {
      if (F.step === 1 && !F.ending && !rt.over && rt.player.u.alive) F.torches.update();
      else { F.torches.stop(); F.torches = null; }
    }
    // 旗から離れた時は任務と同じ矢印で戻り道を伝える。距離に余裕を持たせ、札を揺らさない。
    if (rt.t >= (F.regroupAt || 0)) {
      F.regroupAt = rt.t + 1;
      const p = rt.player.u.pos, q = F.kinoU.pos;
      let d = Math.hypot(q.x - p.x, q.z - p.z);
      // 火付けは旗から離れて働く任務。未達の家も持ち場として数える。
      // 話す前や合図の小屋では、旗へ戻る案内で任務を取り上げない。
      if (F.step === 1 && F.lit < NEED) for (const h of F.houses) {
        if (h.mine && !h.burnt) d = Math.min(d, Math.hypot(h.approach.x - p.x, h.approach.z - p.z));
      }
      F.regroup = F.step > 0 && !(F.step === 4 && F.sig) && d > (F.regroup ? 24 : 40);
      if (F.regroup && !F.ending && !F.regroupSaid) {
        F.regroupSaid = true;
        rt.bark(F.step === 3 ? '味方から離れた。曲がり角をたどり、藤吉郎の列へ戻れ' : '味方から離れた。矢印の先の藤吉郎の旗へ戻れ', true);
      }
    }
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    // 固有の守兵・供も含めた実兵枠。部隊だけの枠に任せて二百五十人を越さない。
    if (rt.t >= (F.budgetAt || 0)) {
      F.budgetAt = rt.t + 1;
      let live = 0;
      for (const u of rt.army.units) if (u.alive && !u.isStruct) live++;
      let room = Math.max(0, 235 - live);
      for (const b of rt.butai || []) {
        if (b.noSwitch) continue;
        const have = b.realCount();
        const near = Math.hypot(b.pos.x - rt.player.u.pos.x, b.pos.z - rt.player.u.pos.z) < 35;
        const target = F.ending ? have : near ? (F.defenders.includes(b) ? (F.step === 3 && (b === F.koshiB || b === F.niB) ? 0 : 4) : Math.max(12, have)) : F.attackers.includes(b) ? (F.step >= 3 ? 4 : 0) : (b === F.oteB || b === F.hyakuB ? 4 : 0);
        b.maxReal = Math.min(target, have + room); room -= Math.max(0, b.maxReal - have);
        // 囲みの備は一万五千の内の一手。近くで本物になった数人が崩れて「崩れました」を重ねない
        if (b.real && F.attackers.includes(b)) b.real.noRout = true;
      }
    }
    butaiTick(rt, dt);
    if (F.step >= 3) tickRoutes(F.attackers, F, dt);
    if (rt.t >= (F.torchTickAt || 0)) { F.torchTickAt = rt.t + 0.5; this.torchTick(rt); }
    if (rt.over || F.ending || !rt.player.u.alive) return;
    if (F.SZ) F.SZ.tick(dt);
    if (F.keep && F.step >= 4) { F.keep.tick(); if (F.keep.lord) F.keep.lord.noTarget = true; }
    if (F.ending || rt.over) return;
    inabaRetreatTick(rt);
    if (!F.woundAdvice && rt.player.u.alive && rt.player.u.hp < rt.player.u.maxHp * 0.75) {
      F.woundAdvice = true;
      F.woundAdviceAt = rt.t;
      rt.bark(F.step === 2 ? '傷が深い。下がれ！　鹿垣の内の味方へ退け' : '傷が深い。下がれ！　来た道から味方の後ろへ退け', true);
    }
    if (F.woundAdvice && !F.deepWoundAdvice && rt.t - F.woundAdviceAt >= 8 && rt.player.u.hp < rt.player.u.maxHp * 0.4) {
      F.deepWoundAdvice = true;
      rt.bark('このままでは倒れる。敵を追わず、味方の後ろへ退け！', true);
    }
    // 層（Z0〜Z5）：自分が新しい層へ入ったら一度だけ知らせる（金華山を下から上へ登っている手応え）
    { const p = rt.player.u.pos, L = LAYERS.find((q) => q.test(p.x, p.z)); if (L && L.id !== F.layer) { const first = !F.layerSeen[L.id]; F.layer = L.id; F.layerSeen[L.id] = true; if (first && L.id !== 'Z0') rt.bark(L.name); } }
    if (F.DA) F.DA.tick(dt);
    if (F.K) F.K.tick(dt);
    F.clashSeconds = F.step >= 3 ? (F.clashSeconds || 0) + dt : 0;
    if (F.step >= 3 && F.clashSeconds >= 1) { this.siegeClash(rt, F.clashSeconds); F.clashSeconds = 0; }
    // 合図を放つか本人が倒れるまで続く。歩行時間だけで任務を失敗にしない。
    if (F.TA) F.TA.tick(dt);
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: true, team: 0 });
    if (F.rocks) F.rocks.tick(dt);
    // 竹束を抱えている間は、重くて速く歩けない（前の足どりの六割に。castle-design 7-3）
    if (F.carry && F.carryPrev) {
      const u = rt.player.u;
      u.pos.x = F.carryPrev.x + (u.pos.x - F.carryPrev.x) * 0.6;
      u.pos.z = F.carryPrev.z + (u.pos.z - F.carryPrev.z) * 0.6;
      if (!u.naka) u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
      u.mesh.position.copy(u.pos);
    }
    if (F.carryPrev) { F.carryPrev.x = rt.player.u.pos.x; F.carryPrev.z = rt.player.u.pos.z; }
    if (F.step === 1) {
      if (F.lit < NEED) rt.objProgress('main', rt.G.lord ? `${F.lit}／${NEED}軒・火付けの足軽を守れ。町の兵を払え` : `${F.lit}／${NEED}軒・目印の家へ`);
      if (rt.t > (F.mhT || 0)) { F.mhT = rt.t + 1; if (F.lit < NEED) this.markHouses(rt); }
      // 火を放ちに来ない時は、藤吉郎がやり方を言う（一度だけ）
    }
    if (F.step === 2) {
      // 到着は案内だけの区切り。敵の動きや戦の進みはそのまま。
      if (!F.holdArrived && F.holdPoint && Math.hypot(rt.player.u.pos.x - F.holdPoint.x, rt.player.u.pos.z - F.holdPoint.z) < 3) {
        F.holdArrived = true;
      }
      const qs = [F.ote, F.ote2].filter(Boolean);
      if (rt.t - F.stepT > 3) rt.objProgress('main', rt.t - F.stepT < 16 ? (F.oteSignal ? '敵の法螺と陣太鼓の早打ち。鹿垣の内で城兵の寄せに備えよ' : '鹿垣を結う間に、藤吉郎の旗の横へ並べ') : gone(F.ote) && !F.ote2.sent ? '初めの寄せは退いた。坂の上の新手に備えよ' : '鹿垣の内で槍をそろえ、坂を下る城兵を押し返せ');
      // 引きつけて一斉に放つ。麓の左右の鉄砲も同時に鳴る
      if (!F.oteVolley && F.nGun.count && qs.some((q) => !gone(q) && Math.hypot(q.center().x - F.nGun.anchor.x, q.center().z - F.nGun.anchor.z) < 26)) {
        F.oteVolley = true; F.nGun.fire = true;
        rt.say('鉄砲頭', '引きつけた……放て！', 2.5);
        rt.army.play('volley', F.nGun.anchor, 1.4);
        for (const C of F.footClash || []) C.volley('A');
        for (const q of qs) if (!gone(q)) q.morale = Math.max(0, q.morale - 15);
      }
      if (gone(F.ote) && !F.ote2.sent && !F.ote2Q) { F.ote2Q = true; this.oteWarn(rt); rt.after(5, () => this.ote2(rt)); }
      // 坂の上に残って矢玉を放つだけの数人を、いつまでも追わせない。新手が下りて七十秒か、残りが三人ずつ以下なら山へ退く
      if (F.ote2.sent && !qs.every(gone) && (rt.t - F.ote2T > 70 || qs.every((q) => gone(q) || q.count <= 3))) for (const q of qs) if (!gone(q)) { q.noRout = false; q.morale = 0; }
      if (F.ote2.sent && qs.every(gone)) {
        rt.unmark('ote'); rt.unmark('ote2');
        rt.objDone('main');
        // 坂の城兵が崩れ、麓の左右の城兵も山へ逃げ上る
        for (const C of F.footClash || []) C.rout('B', { from: 0, minFight: 0 });
        this.karamete(rt);
      }
    }
    if (F.step === 3) {
      inabaClimbClash(rt);
      if (F.climbFriends && rt.t >= (F.pressureAt || 0)) pressureTick(rt, '裏道', CLIMB_NO_CHASE, F.climbFriends, '藤吉郎の列と次の曲がり角へ進め。近い守兵を仲間と退けよ');
      const p = rt.player.u.pos;
      const kd = Math.hypot(p.x + 30, p.z + 118);
      const guardCleared = F.guardOn && gone(F.kguard);
      if (guardCleared && !F.guardCleared) {
        F.guardCleared = true; F.karaGuideAt = 0;
        rt.unmark('kguard');
        rt.say(officer(rt), '木戸の守りは退いた。道の印をたどり、列で登り切れ', 3.5);
      }
      const followRoad = !F.guardOn || guardCleared || !inabaAtWoodGate(rt);
      if (followRoad && rt.t >= (F.karaGuideAt || 0)) {
        // 一秒ごとでは走る足が角を通り過ぎる。四分の一秒で行き先を替える。
        F.karaGuideAt = rt.t + 0.25;
        // 登り口から順に案内し、近くの別の折れへ印を戻さない。
        let next = F.karaNext;
        // 角まで寄ってから次へ進める。三歩手前では斜めに山肌を切ってしまう。
        while (next < KARA_TRAIL.length - 2 && roadCornerPassed(rt.world, p, KARA_TRAIL, next, 1.2)) next++;
        F.karaNext = next;
        const q = F.karaGuide || (F.karaGuide = { x: 0, z: 0 });
        roadApproach(rt.world, p, KARA_TRAIL, next, q);
        if (!F.karaGuideMarked) { F.karaGuideMarked = true; rt.marker('karaGuide', () => F.karaGuide, () => F.karaGuide.returning ? '道の中央' : '次の曲がり角', { guideAlways: true, guideArea: 'move', guideRadius: 1.2, h: 0 }); }
        this.nextObj(rt, q.returning ? '道の中央へ' : 'この先へ');
        rt.objProgress('main', q.returning ? '崖を横切らず、土の道の印へ寄れ。仲間と曲がり角へ進め' : `裏道の次の曲がり角まで ${Math.ceil(Math.hypot(p.x - q.x, p.z - q.z) / .75)}歩ほど・藤吉郎の旗に続け`);
      }
      else if (!followRoad) { rt.unmark('karaGuide'); F.karaGuideMarked = false; rt.objProgress('main', '仲間と槍をそろえ、木戸の守りを退けよ'); }
      const kc = F.kino.center();
      // 藤吉郎の列が腰曲輪を抜けると、背を取られた腰曲輪・物見櫓・伏兵は山上へ退く（細道で足を止めた者を囲み続けない）
      // 列が十五秒進まない時（腰曲輪の喰違いで詰まる等）は、藤吉郎の手が槍を入れて道の守りを崩す
      if (F.kino.order === 'path' && rt.t >= (F.kinoMoveAt || 0)) {
        const a = F.kino.anchor, m = F.kinoMoved || (F.kinoMoved = { x: a.x, z: a.z, t: rt.t });
        F.kinoMoveAt = rt.t + 1;
        if (Math.hypot(a.x - m.x, a.z - m.z) > 2) { m.x = a.x; m.z = a.z; m.t = rt.t; }
        else if (rt.t - m.t > 15) {
          m.t = rt.t;
          const kc2 = F.kino.center();
          let broke = false;
          for (const g of [F.koshiGuard, F.ambush, F.ambushGun, F.towerArchers, F.scout, F.patrol, ...F.climbGuards]) {
            if (!g || gone(g)) continue;
            const c = g.center();
            if (Math.hypot(c.x - kc2.x, c.z - kc2.z) < 30) { g.noRout = false; g.morale = 0; broke = true; }
          }
          if (broke) rt.bark('藤吉郎の手が槍を入れた。道の守りが崩れて山上へ退く', true);
          for (const u of F.kino.units) if (u.alive && !u.atk) { u.target = null; u.moveTo = null; u.aiT = 0; }
        }
      }
      if (!F.koshiBroke && F.kino.order === 'path' && F.kino.pathIdx >= KARA_TRAIL.indexOf(KARA[4])) {
        F.koshiBroke = true;
        for (const g of [F.ambush, F.ambushGun, F.koshiGuard, F.towerArchers, F.scout]) if (g && !gone(g)) { g.noRout = false; g.morale = 0; }
        rt.bark('腰曲輪の守りが背を取られて退いた。藤吉郎の旗を追い、木戸へ急げ', true);
      }
      // 縦列で登る間、遅れた一人（遠い的を狙う鉄砲など）を待ち続けて列が止まらないよう、的を外して列へ戻す
      if (F.kino.order === 'path' && (F.kino._waitT || 0) > 8) for (const u of F.kino.units) if (u.alive && !u.atk && Math.hypot(u.pos.x - F.kino.anchor.x, u.pos.z - F.kino.anchor.z) > 9) { u.target = null; u.moveTo = null; u.aiT = 0; }
      for (const g of F.climbGuards) if (!g.sent && !gone(g) && Math.hypot(p.x - g.anchor.x, p.z - g.anchor.z) < 16 && Math.abs(p.y - rt.world.heightAt(g.anchor.x, g.anchor.z)) < 8) {
        g.sent = true; g.sentAt = rt.t; g.noAI = false; g.order = 'attack'; g.seekRange = 24; g.aggro = 12;
        rt.marker(g.name, centerOf(g), g.name, { red: true, group: g });
      }
      // 小勢は列を止めて二十秒で引く。麓の守兵を山上まで追わせない。
      for (const g of F.climbGuards) if (g.sent && !gone(g) && rt.t - g.sentAt > 20) { g.noRout = false; g.morale = 0; }
      if (!F.guardOn) this.climbEvents(rt);
      if (!F.guardOn && (kd < 30 || Math.hypot(kc.x + 30, kc.z + 118) < 26)) this.guardFight(rt);
      // 木戸の守りと三十秒斬り合えば、裏を取られた守りは本丸へ退く（切岸の上に残る数人を探し続けさせない）
      if (F.guardOn && !gone(F.kguard) && rt.t - F.guardT > 30 && !F.kguardBroke) { F.kguardBroke = true; F.kguard.noRout = false; F.kguard.morale = 0; rt.bark('搦手の守りが崩れた。本丸の旗本へ退いていく', true); }
      if (F.guardOn && gone(F.kguard)) {
        // 先に守りが崩れても、藤吉郎の縦列は最後の曲がり角を通す。
        if (inabaAtWoodGate(rt) && (F.kino.order !== 'path' || Math.hypot(kc.x + 30, kc.z + 118) < 10 || rt.t - F.guardT > 20)) this.signal(rt);
      }
    }
    if (F.step === 1 && F.clearT !== undefined) {
      const qs = F.townGuards, p = rt.player.u.pos;
      if (!F.exitArrived && Math.hypot(p.x - 25, p.z - 44) < 8) {
        F.exitArrived = true; rt.unmark('townExit');
        this.nextObj(rt, '仲間をたすけよう');
      }
      rt.objProgress('main', gone(F.town) && !F.town2.sent ? '城兵が下りてくる。町の出口を仲間と固めよ' : '町の出口で、残る城兵を仲間と退けよ');
      if (F.town2.sent && qs.every(gone)) {
        F.clearT = undefined; F.step = 1.5;
        rt.unmark('town'); rt.unmark('town2'); rt.unmark('townExit');
          rt.objDone('main');
        this.sally(rt);
      }
    }
    if (F.step === 4 && F.hata) {
      // 本丸の口へ歩く列も、遅れた一人を待ち続けない
      for (const K2 of [F.kino, F.hachi]) if (K2 && K2.order === 'path' && (K2._waitT || 0) > 8) for (const u of K2.units) if (u.alive && !u.atk && Math.hypot(u.pos.x - K2.anchor.x, u.pos.z - K2.anchor.z) > 9) { u.target = null; u.moveTo = null; u.aiT = 0; }
      if (!F.sig && rt.t >= (F.honGuideAt || 0)) { F.honGuideAt = rt.t + 1; this.guideHon(rt); }
      // 表と裏から挟まれて四十五秒、残る旗本も主殿の奥へ退く（合図の火を放てないまま囲みの時間切れにしない）
      if (!F.sig && !F.honBroke && rt.t - F.stepT > 45) { F.honBroke = true; for (const g of F.honGuards) if (!gone(g)) { g.noRout = false; g.morale = 0; } }
      if (!F.sig && F.hata.every(gone) && gone(F.tatsu) && gone(F.keep.guard)) this.lightSig(rt);
    }
  },

  onFinish(rt, info) {
    const F = rt.flags;
    rt.unmark('retreat'); rt.objRemove('retreat'); F.retreatMarked = false;
    if (info?.down) F.downCamera();
    if (F.torches) { F.torches.stop(); F.torches = null; }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (!sightPoint(rt, g.center()) || g.team !== 1 || g.civ || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    rt.flags.routSayT = rt.t + 9; g._routSaid = true;   // 隊ごとに一度（崩れて立て直す隊が、同じ一言を繰り返していた）
    rt.say('足軽', `${g.name}が山へ逃げていく！`, 2.5);
  },
};

// 両軍の総勢（織田 一万五千を仮置き、斎藤 四千を仮置き。数には諸説ある）
inabayama.force = () => ({ a: 15000, a0: 15000, b: 4000, b0: 4000 });
inabayama.sides = { a: { name: '織田軍（出陣時の目安）', mon: 'oda' }, b: { name: '斎藤軍（出陣時の目安）', mon: 'saito' } };

// 軍議（gungi.js）：金華山を回して見て、外の部隊の攻め口を三つから選ぶ（遊びの既定は七曲り）。
// 自分（藤吉郎の手）は、どの作戦でも町を焼いてから搦手を登る。作戦で変わるのは、外の部隊の道・本丸の守りの厚さ・大手の手薄さ
inabayama.gungi = (rt) => {
  if (!rt.G.lord) return null;
  const F = rt.flags;
  const nom = (b) => (b ? Math.round(b.aliveNominal()) : 0);
  const G = {
    center: { x: 0, z: -60 }, dist: 170,
    // 束31：info を足す（俯瞰の説明）
    landmarks: [
      { name: '本丸', x: HON.x, z: HON.z, info: '主殿を守る曲輪。東は切岸と土塀（推定）' },
      { name: '大手の木戸', x: OTE.x, z: OTE.z, info: '正面の口　守備兵が多い' },
      { name: '二の丸', x: NI.x, z: NI.z, info: '腰曲輪の先。道が狭い' },
      { name: '七曲り', x: 16, z: -14, info: '長く緩やか。大手へ続く' },
      { name: '百曲り', x: HYAKU[2][0], z: HYAKU[2][1], info: '短い急坂。守りの様子は不明' },
      { name: '水の手', x: KARA[2][0], z: KARA[2][1], info: '搦手の水汲み道。守りの様子は不明' },
      { name: '井口の町', x: 16, z: 70, info: '城下の町' },
      { name: '長良川の舟着き', x: FUNA.x, z: FUNA.z, info: '舟着きの場所は推定。ほかの退路は不明' },
    ],
    nawabari: F.K,
    lines: [
      { name: '大手（三の丸）', owner: '敵' }, { name: '腰曲輪', owner: '敵' }, { name: '二の丸', owner: '敵' }, { name: '本丸', owner: '敵' },
    ],
    units: [{ id: 'main', name: '囲みの部隊（森・坂井・佐久間・池田・美濃三人衆）', group: () => F.oteYose1 && F.oteYose1.real, nominal: () => (F.attackers || []).reduce((s, b) => s + nom(b), 0) }],
    routes: Object.entries(STRATS).map(([id, s]) => ({ id, name: s.name })),
    default: { main: 'nanamagari' },
    enemy: [
      { name: '大手の備（日根野弘就）', known: false },
      { name: '百曲りの備（長井道利）', known: false },
      { name: '水の手・二の丸の備', known: false },
      { name: '本丸の旗本（斎藤龍興）', known: false },
    ],
    cinema: { attackers: { x: 0, z: -26 }, gate: { x: OTE.x, z: OTE.z }, defenders: { x: HON.x, z: HON.z } },
    onStart: (assign) => inabayama.onGungiStart(rt, assign),
  };
  // bot・sim の確かめ：window.__inabaStrategy で決め打ち。?bot なら軍議を出さず、遊びの既定の七曲りで
  if (window.__inabaStrategy) { inabayama.onGungiStart(rt, { main: window.__inabaStrategy }); return null; }
  if (/[?&]bot/.test(location.search)) return null;
  return G;
};
inabayama.onGungiStart = (rt, assign) => { rt.flags.strategy = STRATS[assign?.main] ? assign.main : 'nanamagari'; };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
inabayama.famous = [
  { name: '稲葉良通', team: 0, g: /稲葉/, line: '稲葉一鉄じゃ。今日よりは織田の者として働く！' },
  { name: '日根野弘就', g: /大手/, loose: 1, line: '日根野弘就なり！　稲葉山は落ちぬ。下がれ下がれ！' },
];
// 八月の日付は信長公記の記述に沿う。永禄十年九月の落城とする説もある。
inabayama.date = (rt) => rt.flags.win && rt.t - rt.flags.endT >= 5 ? '永禄十年　開城（公記では八月十五日）' : rt.flags.step >= 2 ? '永禄十年　囲み（公記の放火翌日）' : '永禄十年　井口（公記では八月一日）';
inabayama.canSkip = () => '';
inabayama.history = 'この戦の八月一日・翌日・十五日という日付は『信長公記』の記述に沿う。『岐阜市史』などには永禄十年九月の落城とする説があり、八月の落城を確定した事実とはしない。放火と包囲の時刻は不明で、日中の光は遊びの仮設定である。永禄十年（1567）、西美濃の稲葉良通（一鉄）・氏家直元（卜全）・安藤守就の三人――美濃三人衆が織田方についた。八月一日、織田信長は三人衆の人質がまだ来ないうちに兵を出し、稲葉山城の東の瑞龍寺山へ駆け上がった。その日は風が強く、すぐに城下の井口の町を焼いて城を裸にした。翌日、普請を割り当て、四方に鹿垣を結って囲んだ。八月十五日、城主の斎藤龍興は降参し、舟で川を下って伊勢長島へ逃れた（信長公記は飛騨川続きと記す）。信長は井口を「岐阜」と改め、この城を新しい居城として、天下布武の印を使い始める。木下藤吉郎（のちの豊臣秀吉）が山の裏道から登った、と伝わる。これは後の『太閤記』などの話で、『信長公記』には城へ攻め上った記事はない。この戦では、放火の日と翌日の囲みを分け、八月十五日の開城は後日談で描く。搦手での局地戦と合図は遊びの補いで、これだけで城が降ったとはしない。総勢と各備の人数は仮の目安で、確定した兵数ではない。曲輪の広さ、出丸と厩の位置、土塁・木戸・井楼・建物・小祠と斎藤期の山麓館は、絵図と同時代の美濃の土の城からの推定である。東の小曲輪は後世の絵図を手掛かりにし、斎藤期の細かな姿まで確かとはしない。この戦では東の囲いを切岸と土塀で表し、後世の絵図の石垣を斎藤期の姿として置かない。百曲りと水の手の向き、川の幅と流れ、舟着きの場所は遊びの補いで、当時の道や川を確かに再現したものではない。山の比高は約三百歩を保つが、登山道の長さは実距離に達していない。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
inabayama.lordAt = { x: 112, z: -24, r: 14, why: '瑞龍寺山の本陣（信長は瑞龍寺山に陣を取り、井口の町を焼かせた）' };
inabayama.lordSpawn = { x: 112, z: -16, heading: -0.55 };

// 素直な遊び手：印の家に火を放ち、大手では斎藤勢と戦い、藤吉郎について搦手を登り、本丸の小屋に火を放つ
const nearIt = (b, pre) => {
  const u = b.player.u;
  let it = null, bd = Infinity;
  for (const x of b.interacts) if (x.id.startsWith(pre)) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
  return it ? { it, d: bd } : null;
};
// 山の上の隊へ直進すると切岸で止まる。折れと木戸の口を順に通る。
const BOT_KARA = [...KARA_TRAIL.slice(0, -1), [HON_GATE_OUT.x, HON_GATE_OUT.z], KARA[KARA.length - 1]];
function botRoad(b, inp, goTo, path, end) {
  const p = b.player, u = p.u;
  if (b.botRoadPath !== path) {
    b.botRoadPath = path; b.botRoadIndex = 0;
    let best = Infinity;
    for (let i = 1; i <= end; i++) {
      const a = path[i - 1], w = path[i], dx = w[0] - a[0], dz = w[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((u.pos.x - a[0]) * dx + (u.pos.z - a[1]) * dz) / l2));
      const x = a[0] + dx * t, z = a[1] + dz * t;
      const score = Math.hypot(x - u.pos.x, z - u.pos.z) + Math.abs(b.world.heightAt(x, z) - u.pos.y) * 4;
      if (score < best) { best = score; b.botRoadIndex = i; }
    }
  }
  while (b.botRoadIndex <= end) {
    if (!roadCornerPassed(b.world, u.pos, path, b.botRoadIndex, 1.2)) {
      const q = b.botRoadGoal || (b.botRoadGoal = { x: 0, z: 0 });
      roadApproach(b.world, u.pos, path, b.botRoadIndex, q);
      p._gtStuckT = 0; p._gtDetourT = 0;
      // 案内の一歩手前で停止すると、急な角の高さ判定が済まず列が止まる。
      // 角の通過が確かになるまで足を進める。共通の回り道は使わない。
      goTo(p, inp, q.x, q.z, 0.35, true);
      // 平地用の大きな横回りは切岸へ出る。山道では既に選んだ折れへ向く。
      p._gtDetourT = 0;
      p.yaw = Math.atan2(q.x - u.pos.x, q.z - u.pos.z);
      p._botGoToYaw = p.yaw;
      return true;
    }
    b.botRoadIndex++;
  }
  return false;
}
inabayama.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false; inp.runHeld = false;
  b.botRest = false;
  // 出血は命が六割を切る前にも止められる。人に示す手当ての印と
  // 同じ場所へ寄り、安全になってから三秒長押しする。布や傷は通常どおり。
  if (!(F.botBindNext > b.t) && inabaCanBind(b)) {
    const cue = b.hud.retreatDestination(b, null, true);
    if (cue?.valid && inabayama.botRetreatStepAllowed(b, cue)) {
      // 陰が移動したり矢が届いたりしても、手当て待ちだけで任務を止め続けない。
      if (!F.botBindUntil) F.botBindUntil = b.t + 12;
      if (b.t >= F.botBindUntil) { F.botBindUntil = 0; F.botBindNext = b.t + 15; }
      else {
        if (p.lock) inp.e.add('KeyQ');
        if (p.treatmentReady) inp.k.add('KeyE');
        else if (Math.hypot(cue.x - u.pos.x, cue.z - u.pos.z) > 0.7) goTo(p, inp, cue.x, cue.z, 0.6);
        return;
      }
    }
  } else F.botBindUntil = 0;
  // 敵の前での退避は共通の survive に任せ、上役へ背を向けない。
  const c = F.kino.center();
  if (F.step === 0) {
    if (!F.joinedKino) goTo(p, inp, F.kinoU.pos.x, F.kinoU.pos.z, 6);
    return;
  }
  // 構えは正面だけに効く。近い兵より、実際に打ち込む兵へ向く。
  // 裏道では遠い守兵を追い続けず、まず列で登る。届く敵の槍には構える。
  let attacker = null, ad = F.step === 3 ? 4.5 : 10;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 敵の槍が低い柵を越えて届く時も、打ち手へ向いて受ける。
    const over = (o.wpnKind || o.lookWeapon) === 'spear' && d <= o.reach + 0.3;
    if (b.army.wallBetween(o.pos, -1, u.pos, over) || F.step === 3 && b.army.terrainBlocks(o.pos, u.pos)) continue;
    if (d < ad) { attacker = o; ad = d; }
  }
  // 道を外れた時は、届かない守兵を追う前に足場へ寄る。目の前の槍には従来どおり応戦する。
  if (F.step === 3 && F.karaGuide?.returning && (!attacker || ad > 2.8)) {
    inp.guardHold = !!attacker;
    if (p.lock) inp.e.add('KeyQ');
    if (botRoad(b, inp, goTo, BOT_KARA, BOT_KARA.length - 2)) return;
  }
  // 本丸の守りを退けた後は、遠い残兵を追わず合図へ進む。目の前の槍には応戦する。
  if (F.step === 4 && F.sig && (!attacker || ad > 3)) {
    if (p.lock) inp.e.add('KeyQ');
    if (botRoad(b, inp, goTo, BOT_KARA, BOT_KARA.length - 1)) return;
    const q = nearIt(b, 'sig');
    if (q && b.nearestInteract() === q.it) inp.k.add('KeyE');
    else { const to = inabaSignalApproach(b); goTo(p, inp, to.x, to.z, .6); }
    return;
  }
  // 構えを解く半秒の間は相手を保つ。近い兵へ替え続けると反撃が出ない。
  const pending = p.botStrikeUntil > p.time ? strikeTarget(b, 0) : null;
  const pendingClear = pending && (F.step !== 3 || Math.hypot(pending.pos.x - u.pos.x, pending.pos.z - u.pos.z) < 4.5 && !b.army.terrainBlocks(u.pos, pending.pos));
  const e = attacker || (pendingClear && !pending.isStruct && !pending.group?.civ ? pending : null) || b.army.nearestEnemy(u, F.step === 3 ? 4.5 : F.step === 1 ? 7 : 12, (o) => !o.fleeing && !o.noTarget && !o.invuln && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos, p.weapon === 'spear' && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 2.8) && !(o.group && o.group.civ) &&
    (F.step !== 3 || !b.army.terrainBlocks(u.pos, o.pos)) &&
    (F.step !== 2 || o.pos.z >= SHIKA_Z - 14));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    // 振りかぶりを見ただけで止まると、敵の槍だけが届く所に居残る。
    // 振り出す前は構えて詰める。突進や振っている刃には踏み込まない。
    let walkYaw = p.yaw, walking = false;
    const incoming = attacker && (attacker.charging || attacker.swing && !attacker.swing.done)
      && d <= (attacker.reach || 2.8) + 0.3;
    if (d > reach * 0.85 && !incoming) {
      // 鹿垣の折れに沿った内側まで寄る。止まる半径を敵ではなく
      // 内側の行き先にも付けると、槍の届かない二歩手前で止まってしまう。
      let z = e.pos.z;
      if (F.step === 2) {
        const at = Math.max(0, Math.min(7.999, (e.pos.x - SHIKA_X0) / SHIKA_W));
        const i = Math.floor(at), t = at - i;
        const fenceZ = SHIKA_Z + Math.sin(i) * 1.2 * (1 - t) + Math.sin(i + 1) * 1.2 * t;
        z = Math.max(fenceZ + 0.6, z);
      }
      // 兵と同じ角を回る。敵へ直進する足だけが切岸へ出ないようにする。
      const way = F.step === 3 ? inabaMoveWay(b.army, u, e.pos, true) : e.pos;
      if (F.step === 3 && way !== e.pos) { p._gtStuckT = 0; p._gtDetourT = 0; }
      goTo(p, inp, way.x, F.step === 3 ? way.z : z, way !== e.pos || z !== e.pos.z ? 0.15 : reach * 0.85);
      if (F.step === 3 && way !== e.pos) p._gtDetourT = 0;
      walkYaw = p.yaw; walking = inp.k.has('KeyW');
    }
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 敵へ向き直しても、内側へ寄る足や障害物を回る足の向きは保つ。
    if (walking) {
      const da = walkYaw - p.yaw;
      inp.k.delete('KeyW');
      if (Math.abs(Math.cos(da)) > 0.3) inp.k.add(Math.cos(da) > 0 ? 'KeyW' : 'KeyS');
      if (Math.abs(Math.sin(da)) > 0.3) inp.k.add(Math.sin(da) > 0 ? 'KeyA' : 'KeyD');
    }
    // 振りかぶりから受け、打ち終えた隙に構えを解いて突き返す。
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (p.lock) inp.e.add('KeyQ');
  if (F.step === 1) {
    const h = F.lit < NEED && !b.G.lord && (nearFireHouse(b) || F.houseTargets?.[0]);
    // 遊び手と同じ足場へ寄り、攻撃ボタンを一度押す。
    if (h) { if (nearFireHouse(b)) inp.leftPressed = true; else goTo(p, inp, h.approach.x, h.approach.z, 1.2); return; }
    // 散った隊の中心は家の中や誰もいない所にもなる。残る兵本人へ寄る。
    let t = null, td = Infinity;
    for (const g of F.townGuards) {
      if (!g || gone(g)) continue;
      for (const o of g.units) {
        if (!o.alive || o.fleeing || o.noTarget || o.invuln) continue;
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d < td) { t = o; td = d; }
      }
    }
    // 下りてくる城兵を山の斜面へ直線で追わず、町の出口で迎える。
    if (t) { goTo(p, inp, t.pos.z < 30 ? 2 : t.pos.x, t.pos.z < 30 ? 34 : t.pos.z, 2); return; }
  }
  if (F.step === 2) {
    // 打って出る敵を鹿垣の内で迎える。山上の控えへ登って待たない。
    goTo(p, inp, 2, SHIKA_Z + 5, 3); return;
  }
  if (F.step === 3) {
    // 旗の現在地へ直進すると別の折れの崖へ出る。案内と同じ道を順に歩く。
    if (botRoad(b, inp, goTo, BOT_KARA, BOT_KARA.length - 2)) return;
    if (F.guardOn && !gone(F.kguard)) { const t = F.kguard.center(); goTo(p, inp, t.x, t.z, 2); return; }
    return;
  }
  if (F.step === 4) {
    if (botRoad(b, inp, goTo, BOT_KARA, BOT_KARA.length - 1)) return;
    // 任務で要る馬廻と主殿前の旗本も相手にする。倒れた隊の中心で待たない。
    let target = null, distance = Infinity;
    for (const g of F.honGuards) {
      if (gone(g)) continue;
      for (const o of g.units) {
        if (!o.alive || o.fleeing || o.noTarget || o.invuln) continue;
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d < distance) { target = o; distance = d; }
      }
    }
    if (target) { goTo(p, inp, target.pos.x, target.pos.z, 2); return; }
    return;
  }
  goTo(p, inp, c.x + 3, c.z + 4, 3);
};

// 焼き討ちと城攻めは討ち捨て（首を取りに止まらせない。信長は城攻めでたびたび討ち捨てを命じた）
inabayama.uchisute = true;
inabayama.rts = true;
export { inabayama };
