import { useTerrain } from './asset_manifest.js';
import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
// ======================================================================
// 織田家編　稲葉山城の戦い（永禄十年八月）
// 美濃三人衆が織田方につき、信長はすぐに兵を出して稲葉山城（金華山）を囲んだ。
// 足軽は木下藤吉郎の手。①城下の井口の町に火を放つ（時刻は不明） ②大手口から打って出た斎藤勢を退ける
// ③藤吉郎について、山の裏の道（搦手）を登り、木戸の守りを破る ④本丸の脇に火を放って、大手の味方へ合図を送る
// 放火の日と翌日以後の囲みを分け、八月十五日の開城は後日談で描く
// 向き：北（-z）が金華山と本丸。南（+z）が井口の町。南西（-x・+z）の瑞龍寺山に信長の本陣。長良川は北から西へ回る
// ======================================================================
import * as THREE from 'three';
import { gradeOf, copyGrade } from './grade.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { kitFence, paintGeo, WOOD_MAT, kobune, SOLIDS, solidRect } from './props.js';
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
import { TIER } from './device_tier.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, wallLine } from './bhelp.js';
import { camp } from './b_mid.js';
import { placeGroup, placePlayer } from './b_opening.js';
import { pressureTick } from './battle_pressure.js';
import { timeslipField } from './timeslip_field.js';
import { demDetail, demSample } from './dem.js';
import { yamaLift } from './yamalift.js';
import { distToPolyline, WIND_STATE } from './world.js';
import { drawGroundAt, guardDrawCamera } from './render_camera.js';
import { rockShape, rockTuftShape, groundRocks } from './rock_shape.js';

// 実測地形（国土地理院 標高タイル下ごしらえ）：金華山の本当の尾根・谷の形に混ぜる（城の部品の位置はそのまま）。
// いつも使う（quality-upgrade-plan 束2。DEM_ON の分かれはやめた）。最初の画面を軽くするため遅れて読む（他の戦と同じやり方）
let DEM = null;
// 読めた時・外れた時は、前に作った高さの覚えを捨てて作り直す（実測の無い高さが残らないように）
useTerrain('dem_inabayama', (data) => { DEM = data; DEM_MT.ring = null; CASTLE_HEIGHT = null; BENCHED = null; LIFT.rise = null; });
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
  // 主殿も館・本堂と同じく、表の中央から広間へ通る引き分け障子口にする推定。
  // 狭く片寄った既定の戸口を使わず、外壁・上がり台・室内の障子を同じ幅と軸へ揃える。
  // 共通室内へ寸法だけ渡し、引き溝・開閉の札・動く戸の当たりを使い回す。
  lordSeat: { ...INABAYAMA_BASE_PLAN.lordSeat,
    ...(S.quality === 'high' ? { doorX: 0, entryW: 2.4 } : {}),
  },
  // 切岸に逆茂木を自動で並べると、地面の高低差で幹が巨大な黒い針になる。
  // 枝先まで支えられる緩い地面だけに置き、裏道の通り口も空ける。
  sakamogiMaxRise: 0.8,
  // 土塁は歩く地面に含まれる。別の土の帯を重ねず、曲輪の内外も同じ高さでつなぐ。
  terrainBanks: true, continuousEdges: true,
  paths: INABA_PATHS.map((pts) => ({ pts })),
  // 岐阜市の令和七年度調査で一ノ門北側の竪堀（幅約八・五メートル）が確定。
  // https://www.city.gifu.lg.jp/info/kouhou/1001155/1037037/1038015/1038019.html
  // 市は斎藤期の構築と信長期の埋め立てを推定。攻略前の開いた堀として補う。
  // 斎藤期の登城路は堀の手前から尾根へ迂回したとされる。位置・長さ・深さは推定。
  // 大手道・東の尾根道・曲輪の平場から離し、既存の地面と堀の仕組みを使う。
  hori: [...INABAYAMA_BASE_PLAN.hori,
    { kind: 'tatebori', pts: [[14, -80], [24, -80]], w: 8.5, deep: 2.8 },
    // 入口脇の短い窪みで終わらせず、東斜面の下方にも溝を続ける。
    // 市の調査では一ノ門北側の東側斜面下方にも竪堀を確認。
    // https://www.city.gifu.lg.jp/_res/projects/default_project/_page_/001/021/639/r7genthikoukai.pdf
    // 間の尾根道は遊びの通行口として掘り残す。延長の位置・長さ・深さは推定。
    // 道の中心から十歩以上、曲輪の縁から十三歩離し、戦う場所を削らない。
    { kind: 'tatebori', pts: [[52, -80], [92, -80]], w: 8.5, deep: 2.8 },
  ],
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
const KARA_SHOULDER = 4.4, KARA_BLEND = 16;   // 10/28 夜：22→16。水手道の肩を広く均すと、山上の西が幅広い平らな台に見えた
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

// 折り返しの別の段にいる時は、先頭の知らせと目の前の敵を区別する。
function nearClimbSpot(rt, p, i, radius) {
  const x = i === 1 ? KARA_SCOUT.x : KARA[i][0];
  const z = i === 1 ? KARA_SCOUT.z : KARA[i][1];
  return Math.hypot(p.x - x, p.z - z) < radius
    && Math.abs(p.y - rt.world.heightAt(x, z)) < 4;
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

// 守りを退けて木戸前に着いたら、最後の曲がり角へ戻さず列を待つ。
function inabaWoodGateWait(rt) {
  const F = rt.flags;
  return F.step === 3 && F.guardOn && gone(F.kguard) && inabaAtWoodGate(rt);
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

// 文化庁「瑞龍寺山頂遺跡」：金華山から延びる山稜の南西端。
// https://online.bunka.go.jp/heritages/detail/231028
// 方位を合わせ、町との距離は戦場の範囲へ圧縮する。本陣・旗本・開始位置はこの一点を共有。
const ZUI = { x: -55, z: 150 };           // 瑞龍寺山（信長の本陣）
// 公記の瑞龍寺山からの囲みを参考に、城へ向く本陣として補う。細かな向きは推定。
// https://kininaruart.com/artist/shincho/n0.html （首巻「稲葉山御取り候事」）
// 備え表だけ真北へ向けず、既存の床几・旗本・遠景と同じ向きを使う。
const ZUI_FACING = Math.atan2(HON.x - ZUI.x, HON.z - ZUI.z);
// 公記の囲みは城外。攻城開始前の池田勢を、守備曲輪と並ぶ山腹へ先回りさせない。
// 東の山裾の控えへ下げ、備え表と実際の兵で同じ位置を使う。池田の持ち場自体は推定。
const IKEDA_YOSE = { x: 112, z: 40 };
const SAKUMA_YOSE = { x: 80, z: 60 };
// 公記の四方の囲みに合わせ、控えは一律の北や真西でなく山城を向く。
// 各将の持ち場・向きは推定。設営時の向きだけを備え表と兵で共有する。
// https://kininaruart.com/artist/shincho/n0.html （首巻「稲葉山御取り候事」）
const IKEDA_FACING = Math.atan2(HON.x - IKEDA_YOSE.x, HON.z - IKEDA_YOSE.z);
const SAKUMA_FACING = Math.atan2(HON.x - SAKUMA_YOSE.x, HON.z - SAKUMA_YOSE.z);
// 森・坂井の寄せ手も、放火と囲みの間は山腹へ先回りさせない。
// 山そのものが要害だったことは岐阜市の史跡解説を参照。各将の持ち場は推定。
// https://www.city.gifu.lg.jp/kankoubunka/bunkazai/1005557/1005558.html
// 麓の鹿垣より南、町の家と道の外で構える。備え表と実際の兵で座標を共有する。
const MORI_YOSE = { x: -48, z: 48 };
const SAKAI_YOSE = { x: 68, z: 48 };
// 公記の四方の囲みに合わせ、左右の寄せ手も一律の真北でなく山城へ向ける。
// 各将の向きは推定。備え表・遠景・実兵で共用し、人数と出撃後の下知は変えない。
// https://kininaruart.com/artist/shincho/n0.html （首巻「稲葉山御取り候事」）
const MORI_FACING = Math.atan2(HON.x - MORI_YOSE.x, HON.z - MORI_YOSE.z);
const SAKAI_FACING = Math.atan2(HON.x - SAKAI_YOSE.x, HON.z - SAKAI_YOSE.z);
// 公記の三人衆は囲みの後に参着。備え表・兵・旗を同じ城外の持ち場にそろえる。
// 位置は推定。西の乱戦（中心は西六十八・北から三十）の後方に参着し、城へ向いて控える。
// 家並みと町の間に収めるため、同じ人数を幅二十四・奥行き十五の備へ並べる。
// 原文：https://ja.wikisource.org/wiki/信長公記 （首巻「いなは山御取候事」）
const MINO_YOSE = { x: -58, z: 84 };
// 四方の囲みへ参着する控えも城へ向ける。持ち場・向き・十歩の前進は推定。
// 備え表・遠景・前進先で同じ向きを使い、移動の下知で真北へ戻さない。
const MINO_FACING = Math.atan2(HON.x - MINO_YOSE.x, HON.z - MINO_YOSE.z);
const MINO_HOLD = { x: MINO_YOSE.x + Math.sin(MINO_FACING) * 10, z: MINO_YOSE.z + Math.cos(MINO_FACING) * 10 };
// 東の尾根道の守り。備え表と実際の弓の備を同じ道の上へ置く（持ち場は推定）。
const NAGAI_MAMORI = { x: HYAKU[3][0], z: HYAKU[3][1] };
// 南東の山肌でなく、直前の折れから登ってくる南西の道を向いて守る。
// 公記に道や守将の割り振りはない。仮道に沿う推定の向きを備え表と兵で共有する。
const NAGAI_FACING = Math.atan2(HYAKU[2][0] - NAGAI_MAMORI.x, HYAKU[2][1] - NAGAI_MAMORI.z);
// 西の曲輪も、折り返した道を登ってくる側へ向ける。持ち場・向きは遊びの推定。
// 公記に攻城路の記録はないため、史実の水手道とは扱わない。
const KOSHI_MAMORI = { x: -60, z: -84 };
const KOSHI_FACING = Math.atan2(KARA_LEGS[1][3][0] - KOSHI_MAMORI.x, KARA_LEGS[1][3][1] - KOSHI_MAMORI.z);
// 裏道の物見・見回り・伏兵も、古い一律の南東向きでなく、直前の折れの下り側を向く。
// 『信長公記』にこの局地戦の記録はない。仮道に沿う守り方の推定で、史実の陣図ではない。
// 道の点だけから読み込み時に求め、兵数・位置・列幅・出撃の下知は保つ。
const SCOUT_FACING = Math.atan2(KARA_LEGS[0].at(-2)[0] - KARA[1][0], KARA_LEGS[0].at(-2)[1] - KARA[1][1]);
const PATROL_FACING = Math.atan2(KARA[1][0] - KARA_LEGS[1][1][0], KARA[1][1] - KARA_LEGS[1][1][1]);
const AMBUSH_FACING = Math.atan2(KARA_LEGS[1].at(-2)[0] - KARA[2][0], KARA_LEGS[1].at(-2)[1] - KARA[2][1]);
// 櫓の射手も直下の登り道へ向ける。木戸と上の鉄砲は、折り返し後の北の曲がり角へ備える。
// 旧道の西向き・南向きを残すと、登ってくる道を横や背にしてしまう。
// 公記に搦手の局地戦の記載はなく、いずれも仮道に沿う推定。読み込み時だけ求める。
// https://kininaruart.com/artist/shincho/n0.html （首巻「稲葉山御取り候事」）
const TOWER_FACING = Math.atan2(KARA_LEGS[1].at(-2)[0] - TOWER.x, KARA_LEGS[1].at(-2)[1] - TOWER.z);
const KIDO_MAMORI = { x: -30, z: -118 };
const UPPER_GUN_MAMORI = { x: KARA[4][0] - 4, z: KARA[4][1] - 8 };
const KIDO_APPROACH = KARA_LEGS[3].at(-2);
const KIDO_FACING = Math.atan2(KIDO_APPROACH[0] - KIDO_MAMORI.x, KIDO_APPROACH[1] - KIDO_MAMORI.z);
const UPPER_GUN_FACING = Math.atan2(KIDO_APPROACH[0] - UPPER_GUN_MAMORI.x, KIDO_APPROACH[1] - UPPER_GUN_MAMORI.z);
// 二の丸は北西の仮道の入口へ備える。真東の山肌へ向けず、備え表と遠景・実兵で共有する。
// 岐阜市の史跡解説にある登城路と要所の守りを参考にした推定。斎藤期の陣図の復元ではない。
// https://www.city.gifu.lg.jp/kankoubunka/bunkazai/1005557/1005558.html
const NI_MAMORI = { x: NI.x, z: NI.z - 2 };
const NI_FACING = Math.atan2(NI_ROAD[0][0] - NI_MAMORI.x, NI_ROAD[0][1] - NI_MAMORI.z);
// 主殿は南の縁側が上がり口。旗本と城主を建物の奥へ向けず、戸口側へ向ける（姿は推定）。
const SHUDEN_FACING = 0;
// 公記は本丸の守兵の持ち場・向きを記さない。既存の西の虎口に備える遊びの推定。
// https://ja.wikisource.org/wiki/信長公記 （首巻「いなは山御取候事」）
// 真西へ一律に向けず、各持ち場から実際の入口を見る。位置・兵数・列幅は保つ。
// 設営時に使う向きだけを読み込み時に求め、戦闘中の下知や主殿の入口の守りは変えない。
const HON_MAMORI = [
  { x: HON.x - 3, z: HON.z + 2 },
  { x: HON.x - 8, z: HON.z + 3 },
  { x: HON.x + 8, z: HON.z + 1 },
].map((p) => ({ ...p, facing: Math.atan2(HON_GATE_OUT.x - p.x, HON_GATE_OUT.z - p.z) }));
// 峰続きの関係を、町の南から東の山裾へ回る低い尾根で表す。
// 尾根の線・幅・高さは圧縮した推定。町と既存の登山道を盛り上げない。
const ZUI_RIDGE = [[ZUI.x, ZUI.z], [35, 150], [110, 135], [110, 25], [65, -25]];
// 長良川は金華山の北側の天然の堀。北の流れから西岸側へ曲げる（川幅と河道は縮尺を詰めた推定）。
// 岐阜市「長良川中流域における岐阜の文化的景観」第２章の地形を参照。
// https://www.city.gifu.lg.jp/_res/projects/default_project/_page_/001/005/555/2-3syou.pdf
const NAGARA_NORTH = [[190, -176], [70, -176], [-32, -176], [-90, -162], [-133, -110]];
const NAGARA_WIDTH = 24;
const NAGARA = [...NAGARA_NORTH, [-127, -30], [-139, 60], [-165, 170]];
// 岐阜市「長良川中流域における岐阜の文化的景観」第２章：城下町は金華山の西麓。
// https://www.city.gifu.lg.jp/_res/projects/default_project/_page_/001/005/555/2-3syou.pdf
// 遠景の二群を西麓へ寄せる。南の戦闘用の町は圧縮した仮配置のまま保つ。
// 家と煙は同じ中心を使う。家の数・形と材質の仕組みは共通で、設営時だけ作る。
// 西の家並みは南北へ伸ばし、川・山麓館・七曲り・本陣の間の戦わない場所へ収める。
// 南の一群も本陣の東の尾根上から西側へ移す。戸数・形は保ち、煙と焼け跡も追随させる。
const INABA_FAR_TOWN = [
  { x: -86, z: 96, n: 7, r: 26, rot: Math.PI / 2, seed: 67, smokeSize: 2.6 },
  { x: -98, z: 164, n: 6, r: 22, rot: Math.PI / 2, seed: 68, smokeSize: 2.4 },
];
// 『信長公記』首巻「稲葉山御取り候事」は龍興の舟による長島への退去を記す。
// https://note.com/senmi/n/n2d9649c5ce53
// 乗船地点・舟の形・隻数は不明。仮の舟着きに川舟二艘を補い、水運の口を見せる。
// 川の折れ線から城側の岸を求める。設営時だけ計算し、同寸の舟の形と材質を共用する。
function buildInabaBoats(rt) {
  let best = Infinity, cx = 0, cz = 0, tx = 0, tz = 1, downstream = 1;
  for (let i = 1; i < NAGARA.length; i++) {
    const a = NAGARA[i - 1], b = NAGARA[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((FUNA.x - a[0]) * dx + (FUNA.z - a[1]) * dz) / (len * len)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(FUNA.x - x, FUNA.z - z);
    if (d < best) { best = d; cx = x; cz = z; tx = dx / len; tz = dz / len; downstream = i; }
  }
  const nx = (FUNA.x - cx) / best, nz = (FUNA.z - cz) / best, W = rt.world;
  // 岸ぎりぎりは水深が足りず船底が川床に埋まる。城側の岸を保ち、深みへ六歩寄せる。
  const bankOff = NAGARA_WIDTH - 10;
  for (const off of [-5, 5]) {
    const x = cx + nx * bankOff + tx * off;
    const z = cz + nz * bankOff + tz * off;
    const y = W.heightAt(x, z) + W.waterDepthAt(x, z);
    const boat = kobune(x, y - 0.12, z, Math.atan2(tx, tz), 7);
    rt.scene.add(boat);
    if (off !== 5 || S.quality !== 'high') continue;
    // 公記にある舟での退去を後日の開城から示す。乗船地点・航路・速さは推定。
    // 原文掲載：https://kininaruart.com/artist/shincho/n0.html （首巻「稲葉山御取り候事」）
    // 既存の一艘だけを動かし、戦闘中の城主・守兵・舟着きの占拠には結び付けない。
    // 川の折れ線は北から下流の順。岸から本流へ寄せ、陸へ直進させない。
    let leg = downstream, ticks = 75, started = false;
    const sail = () => {
      if (rt.ended || reduceMotion() || ticks-- <= 0 || leg >= NAGARA.length) return;
      const end = NAGARA[leg], p = boat.position;
      const dx = end[0] - p.x, dz = end[1] - p.z, distance = Math.hypot(dx, dz);
      const travel = Math.min(0.5, distance);
      if (distance > 0) {
        p.x += dx / distance * travel; p.z += dz / distance * travel;
        p.y = W.heightAt(p.x, p.z) + W.waterDepthAt(p.x, p.z) - 0.12;
        boat.rotation.y = Math.atan2(dx, dz);
      }
      if (distance <= 0.5) leg++;
      // 終幕の時計を使い、毎コマの処理・形・材質を増やさない。
      rt.after(0.2, sail);
    };
    rt.flags.departBoat = () => {
      if (started) return;
      started = true; sail();
    };
  }
}
// 竹束の置き場（搦手の登り口。抱えて登れば、落石・矢を前から 7 割防ぐ。castle-design 7-3）
const TABA_PILE = { x: KARA[0][0] - 3, z: KARA[0][1] + 1 };

// ---------------- 軍議の三つの作戦（七曲り・東の尾根道・西の裏道）と、部隊の道 ----------------
// 各手は山道と門の口を通る。足軽一人が入るまで全軍を止める扱いはしない。
const HON_IN = [[HON_GATE_OUT.x, HON_GATE_OUT.z], [KARA[5][0], KARA[5][1]]];
const R_NANA = [...ROAD.slice(4, -2), [OTE.x, OTE.z, 'ote'], ...TOP_ROAD.slice(0, -2), ...HON_IN];
const R_HYAKU = [...HYAKU.slice(0, 5), [24, -94, 'hon'], ...TOP_ROAD.slice(0, -2), ...HON_IN];
// 腰曲輪の既存の出口を抜けてから二の丸へ。喰違いの柵を横切らない。
const R_MIZU = [...KARA_TRAIL.slice(0, KARA_TRAIL.indexOf(KARA[3]) + 1), [NI.x, NI.z, 'ni'], KARA[4], ...HON_IN];
export const STRATS = {
  // 公記に攻め上った道の記事はない。三案とも遊びの作戦として示す。
  // 東西の仮道に実在の百曲り・水手道の名を当てない。作戦の内部の鍵と道筋は保つ。
  // 岐阜市の登山案内では水手道は北側を回る。山頂案内図では百曲りは西側。
  // https://www.city.gifu.lg.jp/kankoubunka/kankou/1013265/
  // https://gifu-nature.net/tool/activity_map_chyoujyou.pdf
  nanamagari: { name: '七曲りから攻め上る（遊びの作戦）', short: '七曲り' },
  hyakumagari: { name: '東の尾根道から脇を突く（遊びの仮道）', short: '東の尾根道' },
  mizunote: { name: '西の裏道へ大勢を回す（遊びの仮道）', short: '西の裏道' },
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
const CIVIL_WEST = [[-105, 110], [-120, 142], [-120, 172]];
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
  { x: -119, z: 132, watchAt: { x: -86, z: 96 }, kinds: ['farmer'],
    route: civilRoute([[-120, 146], [-120, 172]]) },
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
  if (rt.G.lord || rt.over || F.ending || F.carry || F.step !== 1 || F.lit >= NEED || !rt.player.u.alive) return null;
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
function shikaWall(W, seg) { return shikaWalls(W, [seg]); }
// 公記の「翌日、御普請配り」に合わせ、囲みの後方へ杭と柴の用材を補う。
// https://kininaruart.com/artist/shincho/n0.html （首巻「稲葉山御取り候事」）
// 集積場所・寸法・本数は推定。道と乱戦の外へ置き、当たりや兵は増やさない。
function buildShikaMaterials(rt) {
  if (S.quality !== 'high') return;
  const W = rt.world, logs = [], brush = [], o = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const beam = (list, x, z, dx, dz, length, radius, lift) => {
    direction.set(dx, 0, dz).normalize(); dx = direction.x; dz = direction.z;
    const y = Math.max(W.heightAt(x - dx * length / 2, z - dz * length / 2),
      W.heightAt(x + dx * length / 2, z + dz * length / 2));
    o.position.set(x, y + radius + lift, z);
    o.quaternion.setFromUnitVectors(up, direction);
    o.scale.set(radius, length, radius); o.updateMatrix(); list.push(o.matrix.clone());
  };
  for (const [x, z] of [[-42, 70], [72, 72]]) {
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5 - row; i++)
      beam(logs, x + (i - (4 - row) / 2) * .3, z, 0, 1, 3.4 + (i % 2) * .3, .14, row * .25);
    for (let i = 0; i < 12; i++) {
      const bx = x + 2.2 + (i % 4) * .14, bz = z + (i % 3) * .12, lift = Math.floor(i / 4) * .1;
      beam(brush, bx, bz, .18, 1, 2.4, .045, lift);
      beam(brush, bx, bz + .4, i % 2 ? .7 : -.7, 1, 1.2, .022, lift + .07);
    }
  }
  // 鹿垣の形と材質を共用し、設営時の二つのまとめ描画だけで残材を見せる。
  for (const list of [logs, brush]) {
    const mesh = new THREE.InstancedMesh(SHIKA_GEO, SHIKA_MAT, list.length);
    for (let i = 0; i < list.length; i++) mesh.setMatrixAt(i, list[i]);
    mesh.castShadow = mesh.receiveShadow = true; rt.scene.add(mesh);
  }
}
function shikaWalls(W, segments) {
  const g = new THREE.Group(), logs = [], canes = [], ties = [], knots = [];
  for (const seg of segments) {
    const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az);
    const tx = (bx - ax) / len, tz = (bz - az) / len;
    let nx = -tz, nz = tx;
    // 公記の四方の囲みを参考に、控え柱と縄の結び目は寄せ手側、柴は城側へそろえる。
    // https://kininaruart.com/artist/shincho/n0.html （首巻「稲葉山御取り候事」）
    // 部材の組み方は推定。線の描き順で西・北の支えが城側へ反転していたのを直す。
    // 南の戦列と同じく、城から外へ向く側を正にする。形・材質・当たりは共用のまま。
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (nx * (HON.x - mx) + nz * (HON.z - mz) > 0) { nx = -nx; nz = -nz; }
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
  }
  for (const [list, geo, mat] of [[logs, SHIKA_GEO, SHIKA_MAT], [canes, SHIKA_GEO, TAKE_MAT.cane], [ties, SHIKA_ROPE_GEO, TAKE_MAT.rope], [knots, SHIKA_GEO, TAKE_MAT.rope]]) {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    for (let i = 0; i < list.length; i++) m.setMatrixAt(i, list[i]);
    m.castShadow = m.receiveShadow = true; m.userData.camBlock = true;
    g.add(m);
  }
  if (segments.length === 1) {
    const [ax, az, bx, bz] = segments[0];
    g.add(nobori(W, (ax + bx) / 2, (az + bz) / 2, 'oda', 3.4));
  }
  return g;
}
// 公記の「四方鹿垣」を、南の戦列だけでなく東西の山裾と北の川沿いにも示す。
// 線の位置は推定。川・急坂・道・舟着き・本陣を避け、通行口を残す。
// 設営時に一度だけ作り、外周全体を既存と同じ四つのまとめ描画へ収める。
function buildShikaFlanks(rt) {
  const W = rt.world, segments = [];
  for (const [ax, az, bx, bz] of [[-105, 20, -105, -32], [145, 20, 145, -120], [74, -140, 134, -140]]) {
    const start = segments.length;
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / SHIKA_W);
    for (let i = 0; i < n; i++) {
      const seg = [ax + (bx - ax) * i / n, az + (bz - az) * i / n,
        ax + (bx - ax) * (i + 1) / n, az + (bz - az) * (i + 1) / n];
      let clear = true, prev = null;
      for (let j = 0; j <= 8; j++) {
        const x = seg[0] + (seg[2] - seg[0]) * j / 8, z = seg[1] + (seg[3] - seg[1]) * j / 8;
        const y = W.heightAt(x, z);
        if (distToPolyline(x, z, NAGARA) < NAGARA_WIDTH + 2 || inabaPathDistance(x, z) < 8
          || Math.hypot(x - FUNA.x, z - FUNA.z) < 16 || Math.hypot(x - ZUI.x, z - ZUI.z) < 28
          || prev !== null && Math.abs(y - prev) > len / n / 8 * 0.6) { clear = false; break; }
        prev = y;
      }
      if (!clear) continue;
      segments.push(seg);
      const dx = seg[2] - seg[0], dz = seg[3] - seg[1], d = Math.hypot(dx, dz);
      rt.army.addStruct({ seg, nx: -dz / d, nz: dx / d, hp: 260, maxHp: 260, team: 0, name: '鹿垣', h: 1.4, noTarget: true });
    }
    // 南だけに旗があると、東西・北の鹿垣が城方の守りに見える。
    // 公記の四方の囲みに合わせ、実際に結べた柵に織田の持ち場を示す。
    // 旗の本数・位置は推定。高画質だけ各方面に一本、既存の共用形・材質を使う。
    // 柵の中心へ据え、空けた道・舟着きと川の中には立てない。当たりも増やさない。
    if (S.quality === 'high' && segments.length > start) {
      const seg = segments[start + Math.floor((segments.length - start) / 2)];
      rt.scene.add(nobori(W, (seg[0] + seg[2]) / 2, (seg[1] + seg[3]) / 2, 'oda', 5.5));
      // 公記の「取り籠め」を、柵だけでなく城へ向く番兵でも示す。
      // https://kininaruart.com/artist/shincho/n0.html （首巻「稲葉山御取り候事」）
      // 持ち場と人数は推定。総勢の一部を描く遠景で、実兵・兵数表示には加算しない。
      // 実際に結べた柵の外側だけに置き、道・舟着きの口と川・急坂へは広げない。
      // 中央の一間へ全員を固めず、結べた各区間から安全な足場を拾う。
      // 従来の中央区間の候補も含め、配置できた番兵を減らさず八人以内で分散する。
      // 候補作りと間引きは設営時だけ。遠景の組数・形・材質は増やさない。
      const candidates = [], people = [];
      for (let i = start; i < segments.length; i++) {
        const s = segments[i], mx = (s[0] + s[2]) / 2, mz = (s[1] + s[3]) / 2;
        const length = Math.hypot(s[2] - s[0], s[3] - s[1]);
        let nx = -(s[3] - s[1]) / length, nz = (s[2] - s[0]) / length;
        if (nx * (HON.x - mx) + nz * (HON.z - mz) > 0) { nx = -nx; nz = -nz; }
        for (let j = 0; j < 8; j++) {
          const t = (j + 0.5) / 8;
          const fx = s[0] + (s[2] - s[0]) * t, fz = s[1] + (s[3] - s[1]) * t;
          const x = fx + nx * 1.8, z = fz + nz * 1.8;
          if (distToPolyline(x, z, NAGARA) < NAGARA_WIDTH + 2 || inabaPathDistance(x, z) < 8
            || Math.hypot(x - FUNA.x, z - FUNA.z) < 16
            || Math.abs(W.heightAt(x, z) - W.heightAt(fx, fz)) > 0.9) continue;
          candidates.push({ x, z, facing: Math.atan2(-nx, -nz), k: 'spear', flag: 0 });
        }
      }
      const count = Math.min(8, candidates.length);
      for (let j = 0; j < count; j++)
        people.push(candidates[Math.floor((j + 0.5) * candidates.length / count)]);
      if (people.length) {
        // 既存の兵の形と材質を共用し、翌日の設営時に各方面一組だけ作る。
        const watch = W.addDistantArmy({ people, team: 0, flag: 'oda', armor: 0x2a2622,
          seed: 15680 + start, host: false });
        watch.army.noWake = true;
      }
    }
  }
  if (segments.length) rt.scene.add(shikaWalls(W, segments));
}
// 搦手へ移る時は、実際に歩く最初の道の内へ二列で置く。
// 町と同じ横並びで西へずらすと、十歩先の仲間が四十歩も高い切岸へ出る。
// 登りは下の二つの折り返し（約二百八十歩）を暗転の間に済ませ、腰曲輪の下の折れ（KARA_TRAIL[9]）から始める。
// 戦全体を四〜七分に収める（kaito の決まり）。道・曲輪は変えず、物見と見回りの組は始まりの先の直線へ移す。
const KARA_START = 9;
// 物見と見回りの組を置く所（始まりの次の直線の途中）。登り始めてすぐ列の頭とぶつかる。
const KARA_SCOUT = { x: KARA_TRAIL[KARA_START][0] + (KARA_TRAIL[KARA_START + 1][0] - KARA_TRAIL[KARA_START][0]) * .45, z: KARA_TRAIL[KARA_START][1] + (KARA_TRAIL[KARA_START + 1][1] - KARA_TRAIL[KARA_START][1]) * .45 };
const KARA_PATROL = { x: KARA_TRAIL[KARA_START][0] + (KARA_TRAIL[KARA_START + 1][0] - KARA_TRAIL[KARA_START][0]) * .8, z: KARA_TRAIL[KARA_START][1] + (KARA_TRAIL[KARA_START + 1][1] - KARA_TRAIL[KARA_START][1]) * .8 };
const KARA_FOOT = { x: KARA_TRAIL[KARA_START][0], z: KARA_TRAIL[KARA_START][1] };
// 始まりの折れへ来る一つ手前の直線（後ろ向き）。列はこの直線の上に二人ずつ並べる。
const KARA_BACK = (() => {
  const a = KARA_TRAIL[KARA_START - 1], b = KARA_TRAIL[KARA_START], len = Math.hypot(a[0] - b[0], a[1] - b[1]);
  return { x: (a[0] - b[0]) / len, z: (a[1] - b[1]) / len, len, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
})();
// 始まりの直線の上、折れから back 歩後ろ・横へ side 歩の所。
function karaSpot(back, side = 0) {
  const B = KARA_BACK, d = Math.max(1, Math.min(B.len - 1, back));
  return { x: KARA_FOOT.x + B.x * d - B.z * side, z: KARA_FOOT.z + B.z * d + B.x * side };
}
function placeKaraGroup(rt, g, front) {
  const B = KARA_BACK, c = karaSpot(front);
  g.formation = 'column'; g.colW = 2; g.facing = B.heading; g._face = B.heading;
  g.roadCenterGap = 1.8;
  placeGroup(rt, g, c.x, c.z);
  for (const u of g.units) {
    if (!u.alive || u.gone || u.fleeing || u.woundOut || u.rearWound) continue;
    // 山の細道は徒歩の二人列。町の騎馬を持ち込み、馬腹で道を塞がない。
    if (u.mounted) rt.army.setMounted(u, false);
    // 道の向きに沿って二列を置き、中央の通り道を空ける。
    const dx = u.pos.x - KARA_FOOT.x, dz = u.pos.z - KARA_FOOT.z;
    const along = dx * B.x + dz * B.z;
    const q = karaSpot(along, u.slot % 2 ? -g.roadCenterGap : g.roadCenterGap);
    u.pos.x = q.x; u.pos.z = q.z;
    u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
    u.heading = B.heading; u.mesh.position.copy(u.pos); u.mesh.rotation.y = B.heading;
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
  // 戦を出た時は幕をすぐ外す。次の戦や町に黒い幕を残さない（稲生 7）。
  const drop = () => d.remove();
  rt.cleanupTasks?.add(drop);
  setTimeout(drop, 6000);
  // 場面替えの中で例外が出ても、幕を上げて戦を続ける（段の切り替えで止めない。稲生 1）。
  rt.after(still ? 0.1 : 0.8, () => {
    try { mid(); } catch (e) { console.error(e); }
    d.style.opacity = '0'; rt.after(1.2, drop);
  });
}

const ODA = { flag: 'oda' };

// 夜明けの色（鳶ヶ巣山砦夜襲・強右衛門と同じ作り）。のちに setTime('morning') で朝へ移ろう
const DAWN = { time: 'morning', sky: 0x7e7a88, fog: 0x6e6c7a, sun: 0xffbe86, sunI: 1.05, hs: 0xa4a0b4, hg: 0x362e26, hI: 1.0, top: 0x46506c, glow: 0.24, dir: [1, 0.08, 0.3], mount: 0x262624 };
// env：空の映り込み（PMREM）を作り直すか。重いので、少しずつ移ろう間は false にし、最後に一度だけ作る
export function applyLook(rt, L, env = true) {
  const W = rt.world;
  // 同じ時間帯なら空の映り込みを作り直さない。夜は遠景の見通しも夜にそろえる。
  const time = L.time || (L === NIGHT ? 'night' : 'dusk');
  if (W.timeKey !== time) W.setTime(time);
  // 戦の途中で呼ぶと setTime が夕暮れへの移ろいを始めて、下の色を上書きしてしまうので止める
  W.fade = null;
  const grade = gradeOf(time, W.mood);
  W.scene.userData.colorGrade = copyGrade(grade);
  // 夜の色を渡した時は、画質「低」でも月明かりが見えるよう描画側へ知らせる。
  W.lookDark = time === 'night';
  W.scene.background.set(L.sky);
  W.scene.fog.color.set(L.fog).lerp(new THREE.Color(grade.fog), 0.35);
  W.sun.color.set(L.sun); W.sun.intensity = L.sunI;
  W.hemi.color.set(L.hs); W.hemi.groundColor.set(L.hg); W.hemi.intensity = L.hI; W.baseHemi = L.hI;
  W.sunOffset.set(...L.dir).normalize().multiplyScalar(120);
  const U = W.skyMat.uniforms;
  U.top.value.set(L.top); U.bottom.value.copy(W.scene.fog.color);
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
export function customFlag(key, draw, bg, nobori = false) {
  const t = flagTexture(key, nobori);
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

// 旗から横へ離れても、さくの内で仲間と戦っていれば持ち場にいる。
// 案内に使う守りの帯とそろえ、左右の味方へ寄っただけで集合へ戻さない。
function inabaInsideHoldLine(rt) {
  const p = rt.player.u.pos, point = rt.flags.holdPoint;
  return !!point && Math.abs(p.x - point.x) <= 34
    && p.z >= SHIKA_Z && p.z <= SHIKA_Z + 14;
}

// 敵の出発を待つ間も、持ち場と待つ長さを同じ札で伝える。
function inabaSallyWait(rt, showSeconds = false) {
  const F = rt.flags;
  if (rt.t - F.stepT < 16 && !gone(F.ote)) return showSeconds
    ? `敵が動くまであと${Math.ceil(16 - (rt.t - F.stepT))}秒。坂へ追うな`
    : 'さくの中で敵を待て';
  if (gone(F.ote) && !F.ote2.sent) {
    const left = Math.max(0, Math.ceil(F.ote2Due - rt.t));
    return showSeconds ? left > 0 ? `新手が動くまであと${left}秒。坂へ追うな` : '新手が坂を下りてくる。坂へ追うな'
      : 'さくの中で次の敵を待て';
  }
  return '';
}

// 組の先頭ではなく、今いる所から近い守兵を指す。位置は兵の物を使い回す。
function nearGuard(rt, group) {
  const p = rt.player.u.pos;
  let target = null, nearest = Infinity;
  for (const u of group.units) {
    if (!u.alive || u.fleeing || u.noTarget) continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z) + Math.abs(u.pos.y - p.y) * 4;
    if (d < nearest) { target = u; nearest = d; }
  }
  return target ? target.pos : null;
}
// 隊の中心は高さを持たず、折り返す山道では無人の斜面にもなる。
// 合図は戦える兵の足元から鳴らし、負傷者・敗走兵だけの隊には鳴らさせない。
// 長く伸びた列の先頭に固定すると、近くの仲間がいても小声や警戒声が届かない。
// 高低差も含めて近い兵を選ぶ。座標と兵は使い回し、音の数は増やさない。
function inabaCaller(rt, g) {
  if (gone(g)) return null;
  const p = rt.player.u.pos;
  let caller = null, nearest = Infinity;
  for (const u of g.units) {
    if (!u.alive || u.dying || u.gone || u.noTarget || u.fleeing || u.woundOut || u.evacuatedWound
      || u.rearWound || u.downed || u.pinT > rt.army.time) continue;
    const dx = u.pos.x - p.x, dy = u.pos.y - p.y, dz = u.pos.z - p.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < nearest) { nearest = d; caller = u; }
  }
  return caller;
}
function inabaGroupCall(rt, g, name, vol, nearby = false) {
  const u = inabaCaller(rt, g);
  if (!u) return false;
  if (nearby) rt.army.play(name, u.pos, vol);
  else rt.army.playFar(name, u.pos, vol);
  return true;
}
// 裏道の警戒声は八秒の連打制限より間を空ける。兵の寄せは待たせず、
// 声が出る時に生きた番兵を選び直し、台詞と任務札もその時から示す。
function inabaAlarm(rt, groups, vol, onCall) {
  const F = rt.flags;
  const at = Math.max(rt.t, (F.alarmNextT ?? -Infinity));
  F.alarmNextT = at + 8.5;
  const call = () => {
    if (rt.over || F.ending || F.step !== 3) return;
    let sentry = null, nearest = Infinity;
    const p = rt.player.u.pos;
    for (const g of groups) {
      const u = inabaCaller(rt, g);
      if (!u) continue;
      const dx = u.pos.x - p.x, dy = u.pos.y - p.y, dz = u.pos.z - p.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < nearest) { nearest = d; sentry = u; }
    }
    if (!sentry) return;
    rt.army.playFar('eshoutOrder', sentry.pos, vol);
    onCall();
  };
  if (at > rt.t) rt.after(at - rt.t, call); else call();
}
// 警戒声の間は、任務の文と案内先を同じ味方へそろえる。
function townAllyGuide(rt) {
  const F = rt.flags;
  return F.step === 1 && !F.retreatMarked && !F.ending &&
    (rt.t - (F.townGuardShoutT ?? -Infinity) < 6 || rt.t - (F.townShoutT ?? -Infinity) < 6);
}
// 火付けの法螺と敵の警戒声が重なっても、両方の出どころと意味を札に残す。
function townSignalText(rt) {
  const F = rt.flags;
  let call = F.townHorn && rt.t - F.stepT < 8 ? '法螺貝は火付けの合図。' : '';
  if (rt.t - Math.max(F.townGuardShoutT ?? -Infinity, F.townShoutT ?? -Infinity) < 6) call += '敵の声じゃ。仲間と並ぼう。';
  return call;
}
// 木戸へ着いても、直前に聞こえた見回り・伏兵の警戒声を札から消さない。
function karaAlarmText(rt) {
  const F = rt.flags;
  let call = '';
  if (rt.t - (F.patrolShoutT ?? -Infinity) < 6) call += '裏道の叫びは敵の見回り。';
  if (rt.t - (F.ambushShoutT ?? -Infinity) < 6) call += '岩陰の叫びは敵の伏兵。';
  if (rt.t - (F.guardShoutT ?? -Infinity) < 8) call += '木戸の叫びは敵の警戒の声。';
  return call ? call + '太鼓と法螺は控え、声をひそめよ。列の仲間と道を進み、残る守りを退けよ' : '';
}
// 法螺に続く早打ちは、大太鼓の余韻まで十秒ほど空けてから鬨で応じる。
const KAKARI_SOUND_SECONDS = 10;
// 麓の合図を裏道へ持ち越さない。敵の鬨には二・五秒後の味方の返しも含める。
// 鳴らしていない合図では待たず、既存の時刻だけを読む。
function inabaFootSoundUntil(F) {
  return Math.max(
    F.oteReadyCall ? F.oteReadyUntil : -Infinity,
    F.oteSignal ? F.oteSignalT + KAKARI_SOUND_SECONDS + 0.5 : -Infinity,
    F.oteWarnHorn ? F.oteWarnT + KAKARI_SOUND_SECONDS + 0.5 : -Infinity,
    (F.oteShoutT ?? -Infinity) + 8.5,
    (F.ote2ShoutT ?? -Infinity) + 8.5,
    (F.oteReplyT ?? -Infinity) + 6,
    (F.oteVolleyUntil ?? -Infinity) + 0.5,
    F.retreatSignalStep === 2 && !F.retreatByVoice ? F.retreatSignalAt + 10 : -Infinity);
}
// 本丸の合図は、守兵を早く退けて火付けへ移った時も札に残す。
function honSignalText(rt) {
  const F = rt.flags;
  if (rt.t < F.honCallT) return (F.honAfterRetreat ? '先の退き太鼓が収まるまで待て。' : '裏道の叫びは敵の警戒。') + '味方の法螺と早打ちは、その後の懸かれの合図。';
  let call = '';
  // 二ノ門が応じても、先に上がった藤吉郎の鬨の説明を途中で消さない。
  if (F.honShoutT !== undefined && rt.t - F.honShoutT < 8) call += '藤吉郎の手の鬨。';
  if (F.oteUpT !== undefined && rt.t - F.oteUpT < 8) call += '二ノ門の鬨は大手の味方。';
  return call ? call + '声を合わせよ。'
    : F.honHorn && rt.t - F.honCallT < KAKARI_SOUND_SECONDS ? '味方の法螺と早打ちは懸かれの合図。' : '';
}
// 斉射が鬨と重なっても、どちらの軍の合図かを札から消さない。
function oteSignalText(rt, cueOnly = false) {
  const F = rt.flags;
  let call = F.oteReadyCall && rt.t < F.oteReadyUntil ? '法螺貝と太鼓三つは備えの合図。' : '';
  if (rt.t - (F.oteShoutT ?? -Infinity) < 6) call += '坂の上の鬨は城兵の寄せ。';
  if (rt.t - (F.ote2ShoutT ?? -Infinity) < 6) call += '坂の上の鬨は敵の新手。';
  if (F.oteSignal && rt.t - F.oteSignalT < KAKARI_SOUND_SECONDS) call += '敵の法螺と陣太鼓の早打ち。';
  if (F.oteWarnHorn && rt.t - F.oteWarnT < KAKARI_SOUND_SECONDS) call += '敵の法螺と陣太鼓が再び鳴る。';
  // 敵の鬨に応じる間は、寄せ手と味方の返しを並べて伝える。
  if (rt.t - (F.oteReplyT ?? -Infinity) < 6) call += '藤吉郎の手の鬨は味方の返し。';
  if (rt.t < (F.oteVolleyUntil || 0)) return call + '「放て」は味方の鉄砲への下知。' + (cueOnly ? '' : '鹿垣を出ず、仲間と押し返せ');
  if (cueOnly) return call;
  return call ? call + '鹿垣の内で仲間と槍をそろえよ' : '';
}
// 自分の組が大きいほど、敵を厚くする（組の人数の k 倍を足す）
export const more = (rt, k = 0.5) => Math.round((RANKS[rt.G.rank].squad || 0) * k);
// 鹿垣の斉射は、生きた鉄砲兵から実際に射線が通る寄せ手を見て決める。
// 持ち場の座標や隊の中心では、移動中や遮蔽物の裏でも発砲音だけが鳴ってしまう。
function inabaVolleyGun(rt, guns, foes) {
  if (gone(guns)) return null;
  for (const u of guns.units) {
    // 弾切れ・負傷退避・転倒中の兵を、斉射できる射手として数えない。
    // 未設定の弾数は共通の発砲処理で初期化されるため、そのまま認める。
    if (!u.alive || u.dying || u.gone || u.noTarget || u.fleeing || u.woundOut || u.evacuatedWound
      || u.rearWound || u.downed || u.pinT > rt.army.time || u.reload || u.mounted || u.type !== 'gun' || u.sidearm
      || u.gunAmmo <= 0 || u.cd > 0 || u.stagger > 0) continue;
    for (const g of foes) {
      if (gone(g)) continue;
      for (const v of g.units) {
        if (!v.alive || v.dying || v.gone || v.noTarget || v.isStruct || v.fleeing || v.woundOut || v.evacuatedWound) continue;
        const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z);
        // 弾込め中・近すぎる敵・味方の背中越しでは斉射の音だけを先に鳴らさない。
        if (d <= 4 || d >= 26 || d > u.range || rt.army.allyInLine(u, v, d)) continue;
        if (!rt.army.terrainBlocks(u.pos, v.pos) && !rt.army.hiddenBehind(u, v) && !rt.army.shotBlocked(u, v.pos)) return u;
      }
    }
  }
  return null;
}
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
  // 本陣を孤立した丸い丘にせず、金華山から続く山稜の端にする。
  // 既存の山肌と高い方を採り、境目は滑らかに戻す。形・材質は増やさない。
  if (x > -87 && x < 142 && z > -57 && z < 182) {
    const d = distToPolyline(x, z, ZUI_RIDGE);
    if (d < 32) {
      const t = 1 - d / 32;
      h = Math.max(h, (18 + 2 * Math.sin(z * 0.035)) * t * t * (3 - 2 * t));
    }
  }
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
// 実測の金華山（国土地理院 DEM5A）を山の形の既定にする（10/28）。ゲームの 1 は実の 2.6m（山の裾 R=150 が実の約 400m＝格子の端に届く）。
// 実測の山頂（格子の (-20,10)m）を本丸に合わせる。山頂から同じ距離の輪の平均より高い所（尾根）は山を太らせ、低い所（谷）は削る。
// 掛けるのは手書きの山の持ち上げ（yamaLift）に対してだけ＝裾の町・川は持ち上げない。山上の曲輪と道の段（上 45%）は縄張りのまま。
const DEM_MT = { xy: 2.6, px: -20, pz: 10, k: 0.005, lo: 0.6, hi: 1.2, ring: null };
const DEM_DETAIL = { xy: DEM_MT.xy, ox: HON.x - DEM_MT.px / DEM_MT.xy, oz: HON.z - DEM_MT.pz / DEM_MT.xy, win: 40, scale: 0.3 };
function demRing(d) {
  const lim = d.range || (d.n - 1) / 2 * d.step, s = new Float64Array(120), c = new Float64Array(120);
  for (let z = -lim; z <= lim; z += 5) for (let x = -lim; x <= lim; x += 5) {
    const i = Math.round(Math.hypot(x - DEM_MT.px, z - DEM_MT.pz) / 5);
    if (i < 120) { s[i] += demSample(d, x, z); c[i]++; }
  }
  return Array.from(s, (v, i) => (c[i] ? v / c[i] : 0));
}
function demShape(x, z) {
  if (!DEM) return 1;
  const M = DEM_MT, lim = DEM.range || (DEM.n - 1) / 2 * DEM.step;
  const sx = (x - HON.x) * M.xy + M.px, sz = (z - HON.z) * M.xy + M.pz;
  const e = lim - Math.max(Math.abs(sx), Math.abs(sz));
  if (e <= 0) return 1;
  if (!M.ring) M.ring = demRing(DEM);
  const r = Math.hypot(sx - M.px, sz - M.pz) / 5, i = Math.min(118, Math.floor(r)), t = r - i;
  const a = (demSample(DEM, sx, sz) - (M.ring[i] * (1 - t) + M.ring[i + 1] * t)) * Math.min(1, e / 60);
  return Math.max(M.lo, Math.min(M.hi, 1 + a * M.k));
}
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
    [HON.x + 13, HON.z + 5, 7, 5],
    [HON.x - 12, HON.z - 9, 5, 4],
    [HON.x - 6, HON.z + 8, 9, 4],
    [HON.x + 8, HON.z + 9, 3, 2],
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
const LIFT = { x: HON.x, z: HON.z, tx: HON.x, tz: -90, w: 32, R: 150, rise: null };   // 10/28 夜：頂の平らな幅を 136m→64m に。縄張図の細い尾根へ（裾の長さ R は保つ）
// 尾根に残す物：曲輪（縁から 3m）・道（中心から 6m）・山上の持ち場（5m）。そこから外へ約 40 度で下がる。
const RIDGE_SPOTS = [...HON_MAMORI, KIDO_MAMORI, UPPER_GUN_MAMORI, NI_MAMORI, KOSHI_MAMORI, TOWER, HON_GATE_OUT, IRI, NAKA, NIMON, OTE];
function polyDistance(x, z, poly) {
  let inside = false, d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    if ((bz > z) !== (az > z) && x < (ax - bx) * (z - bz) / (az - bz) + bx) inside = !inside;
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    d = Math.min(d, Math.hypot(x - ax - ex * t, z - az - ez * t));
  }
  return inside ? 0 : d;
}
const RIDGE_ROADS = [TOP_ROAD, NI_ROAD];
function ridgeDrop(x, z) {
  let d = Infinity;
  for (const k of INABAYAMA_PLAN.kuruwa) d = Math.min(d, polyDistance(x, z, k.poly) - 3);
  // 山上の通り道（主郭の内の道と二の丸への道）だけを尾根に残す。登り道（七曲り・百曲り・水手道）は尾根の外の斜面を下げた地面に沿って登る。
  for (const pts of RIDGE_ROADS) d = Math.min(d, distToPolyline(x, z, pts) - 4.5);
  for (const p of RIDGE_SPOTS) d = Math.min(d, Math.hypot(x - p.x, z - p.z) - 5);
  if (d <= 0) return 0;
  return 1.3 * (d < 4 ? d * d / 8 : d - 2);
}
function liftedBase(x, z) {
  if (LIFT.rise == null) LIFT.rise = 300 + base(YAKATA.x, YAKATA.z) - base(HON.x, HON.z);
  let lift = yamaLift(x, z, LIFT);
  if (lift > 0) {
    // 実測の尾根と谷（上 45% の山上部へは薄めて、縄張りの段はそのまま）
    const u = lift / LIFT.rise, w = u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) / 0.2);
    if (w > 0) lift *= 1 + (demShape(x, z) - 1) * w;
    const r = lift / LIFT.rise;
    // 裾は町へ向かって緩く寝かせる（一直線の崖の壁にしない）。裾の長さを東西で揺らし、尾根と谷の出入りを付ける
    const toe = 0.15 * (0.75 + 0.3 * Math.sin(x * 0.043 + 0.7) + 0.15 * Math.sin(x * 0.11 + 2.1));
    if (r < toe) { const k = r / toe; lift *= k * k * (3 - 2 * k); }
    // 中腹の山肌に、上から下へ走る小さな尾根と沢（平らな板の斜面にしない）
    lift += LIFT.rise * 0.03 * Math.sin(x * 0.09 + z * 0.025) * Math.sin(Math.PI * Math.min(1, r * 1.6));
  }
  // 山上を幅 130m の平らな台にせず、中井均氏の山上部縄張図のように、曲輪と道の通る細い尾根だけを残す（10/28）。
  // 曲輪・道・持ち場から離れた所だけを下げる（上げる所は無い）。頂から約 135m 下までの山上部を尾根と道の段にし、その下の山腹は今のまま（10/28 夜：幅 140m の頂を細い尾根に）。
  if (lift > LIFT.rise * 0.55) {
    const ridge = LIFT.rise - ridgeDrop(x, z);
    if (ridge < lift) {
      const k = Math.min(1, (lift / LIFT.rise - 0.55) / 0.13), w = k * k * (3 - 2 * k);
      lift -= (lift - ridge) * w;
    }
  }
  let h = base(x, z) + lift;
  // 北から西へ回る川床の全体を山の持ち上げから外す。西の舟着き付近にも高い川床を残さない。
  // 川幅と岸の帯だけをならし、曲輪や道の位置は保つ。地形生成時に既存の折れ線計算を使う。
  const d = distToPolyline(x, z, NAGARA);
  if (d < NAGARA_WIDTH * 1.6) {
    const t = Math.max(0, (d - NAGARA_WIDTH) / (NAGARA_WIDTH * 0.6));
    h = -1 + (h + 1) * t * t * (3 - 2 * t);
  }
  return h;
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
  // 火が移った時は短いはぜ音。梁が折れる音は屋根が落ちる時に鳴らす。
  rt.army.play('fireSpread', h.m.position, 0.8);
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

// 本の野戦兵器の丸太・縄結いと清洲の板囲いを、山麓の小さな補給場へ。
// 配置は復元の補い。攻城塔を山へ持ち込まず、通りと乱戦の外側だけを使う。
function buildInabaFieldLife(rt) {
  const W = rt.world, unit = new THREE.BoxGeometry(1, 1, 1);
  const cane = new THREE.CylinderGeometry(1, 1, 1, 5);
  const ring = new THREE.TorusGeometry(.29, .025, 3, 8);
  const wood = new THREE.MeshLambertMaterial({ vertexColors: true, map: barkTex('pine') });
  const cloth = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const stem = new THREE.MeshLambertMaterial({ vertexColors: true });
  // 三つの材質・基本形を全置き場で共用。区画ごとに結合し、画面外は丸ごと省く。
  const blocked = (x, z, pad) => inabaPathDistance(x, z) < pad + 3
    || SOLIDS.some((s) => x > s.x0 - pad && x < s.x1 + pad && z > s.z0 - pad && z < s.z1 + pad);
  const finish = (parts, mat, parent = rt.scene) => {
    if (!parts.length) return;
    const geo = mergeGeometries(parts); parts.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true;
    parent.add(mesh);
  };
  // 一つ八歩四方、南向きの口は開放。山の本陣は斜面なら無理に建てない。
  for (const [x, z] of [[76, 118], [94, 88], [ZUI.x + 25, ZUI.z + 2]]) {
    if (blocked(x, z, 5)) continue;
    const y = drawGroundAt(W, x, z), timber = [], fabric = [];
    let low = y, high = y;
    for (const dx of [-4, 0, 4]) for (const dz of [-3, 0, 3]) {
      const h = drawGroundAt(W, x + dx, z + dz); low = Math.min(low, h); high = Math.max(high, h);
    }
    if (high - low > .9) continue;
    const box = (list, dx, dy, dz, sx, sy, sz, color, tilt = 0) => {
      const g = unit.clone(); g.scale(sx, sy, sz); g.rotateZ(tilt);
      g.translate(x + dx, y + dy, z + dz); list.push(paintGeo(g, color));
    };
    const post = (dx, dz, top) => {
      const bottom = drawGroundAt(W, x + dx, z + dz) - .12;
      const g = cane.clone(); g.scale(.075, y + top - bottom, .075);
      g.translate(x + dx, (bottom + y + top) / 2, z + dz); timber.push(paintGeo(g, 0x6b5941));
    };
    // 強風に垂れた麻の陣幕。継ぎ目ごとに高さを落とし、白い板にしない。
    for (let i = 0; i <= 4; i++) post(-4 + i * 2, -2.6, 2.25);
    for (let i = 0; i < 24; i++) {
      const dx = -4 + (i + .5) / 3, sag = .16 * Math.sin((i % 6 + .5) / 6 * Math.PI);
      box(fabric, dx, 1.37 - sag, -2.6 + .09 * Math.sin(i * .8), .35, 1.55, .025,
        i % 6 === 0 ? 0x9b927c : 0xc0b59a);
    }
    solidSeg(x - 4, z - 2.6, x + 4, z - 2.6, .12);
    // 陣小屋は開いた片流れの板庇。柱・桁・垂木・屋根板の順に受ける推定の木組み。
    // 柱の高低差から勾配を決め、屋根の上に横木を浮かせない。
    const roofTilt = -Math.atan2(.55, 3), roofCos = Math.cos(roofTilt);
    const rafterY = 2.225 + .14 + .06 / roofCos;
    const roofY = 2.225 + .14 + (.12 + .035) / roofCos;
    for (const dx of [-3.5, -.5]) {
      const top = dx < -2 ? 2.5 : 1.95;
      for (const dz of [-1.8, .6]) {
        post(dx, dz, top);
        // 細い柱身だけを塞ぐ。正面と柱間には壁の当たりを足さない。
        const pillar = solidSeg(x + dx, z + dz, x + dx, z + dz, .075);
        pillar.yBot = drawGroundAt(W, x + dx, z + dz) - .12;
        pillar.yTop = y + top;
      }
      box(timber, dx, top + .07, -.6, .15, .14, 2.7, 0x514631);
    }
    for (const dz of [-1.8, -.6, .6])
      box(timber, -2, rafterY, dz, 3.5, .12, .1, 0x514631, roofTilt);
    // 板は端を突き合わせ、継ぎ目を押縁で覆う。形・材質は既存の束へ結合する。
    for (let i = 0; i < 9; i++) box(timber, -2, roofY, -1.8 + i * .3,
      3.5, .07, .3, i % 3 ? 0x78684f : 0x95815e, roofTilt);
    for (let i = 1; i < 9; i++) box(timber, -2, roofY + .05 / roofCos,
      -1.95 + i * .3, 3.5, .03, .045, 0x67553d, roofTilt);
    // 兵糧と薪は庇の奥。既存の俵の形を使い、戦う兵を増やさない。
    rt.scene.add(tawara(W, x - 2, z - 1, 0, 6));
    for (let i = 0; i < 9; i++) box(timber, -3 + i % 3 * .23, .17 + Math.floor(i / 3) * .13, .35, .16, .12, .85, 0x67553d);
    // 結束済みの竹束を仕寄りへ運ぶ前の置き場。個々の竹と二本の縄を残す。
    for (let b = 0; b < 3; b++) {
      const bx = x + 1.2 + b * .85, bz = z - 1.5, baseY = drawGroundAt(W, bx, bz);
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI / 3, dx = i === 6 ? 0 : Math.cos(a) * .19, dz = i === 6 ? 0 : Math.sin(a) * .19;
        const g = cane.clone(); g.scale(.067, 1.65 + i % 3 * .09, .067);
        g.translate(bx + dx, baseY + .85, bz + dz); timber.push(paintGeo(g, i % 2 ? 0x8b945e : 0xaaa477));
      }
      for (const h of [.4, 1.2]) {
        const g = ring.clone(); g.rotateX(Math.PI / 2); g.translate(bx, baseY + h, bz);
        timber.push(paintGeo(g, 0x736044));
      }
    }
    W.stampWear(x, z + 1, 4.3, 100);
    finish(timber, wood); finish(fabric, cloth);
  }
  // 八月の青田は刈り束にせず、畦の内に青い株と出穂前後の穂先。
  // 長良川側の低地だけ。水の大きな平面を斜面へ重ねず、各株を地面へ据える。
  for (const [x, z] of [[-65, 87], [-66, 105]]) {
    if (blocked(x, z, 7)) continue;
    const plants = [], banks = [], farPlants = [];
    for (let row = 0; row < 12; row++) for (let col = 0; col < 10; col++) {
      const px = x - 4.5 + col, pz = z - 5.5 + row, y = drawGroundAt(W, px, pz);
      for (const side of [-1, 1]) {
        const g = unit.clone(); g.scale(.045, .67 + .1 * Math.sin(row + col), .11); g.rotateZ(side * .24);
        g.translate(px + side * .11, y + .34, pz); plants.push(paintGeo(g, col % 3 ? 0x657641 : 0x839052));
      }
      if ((row + col) % 3 === 0) {
        const g = unit.clone(); g.scale(.05, .15, .07); g.rotateZ(.3);
        g.translate(px + .12, y + .67, pz); plants.push(paintGeo(g, 0x969453));
      }
      // 遠景は二十の小区画へまとめ、地面の起伏にも追随させる。
      if (row % 3 === 0 && col % 2 === 0) {
        const g = unit.clone(); g.scale(1.8, .4, 2.5);
        g.translate(px + .5, drawGroundAt(W, px + .5, pz + 1) + .2, pz + 1);
        farPlants.push(paintGeo(g, col % 3 ? 0x657641 : 0x79884b));
      }
    }
    for (let i = 0; i < 12; i++) for (const side of [-1, 1]) {
      const px = x + side * 5.3, pz = z - 5.5 + i, y = drawGroundAt(W, px, pz);
      const g = unit.clone(); g.scale(.65, .22, 1.04); g.translate(px, y + .04, pz); banks.push(paintGeo(g, 0x706348));
    }
    const lod = new THREE.LOD(), near = new THREE.Group(), far = new THREE.Group();
    // 形の座標は区画の中心へ戻し、距離による切り替えの中心も田へ合わせる。
    const y = drawGroundAt(W, x, z);
    for (const parts of [plants, farPlants]) for (const g of parts) g.translate(-x, -y, -z);
    finish(plants, stem, near); finish(farPlants, stem, far);
    lod.addLevel(near, 0); lod.addLevel(far, 65, .12); lod.position.set(x, y, z); rt.scene.add(lod);
    finish(banks, wood);
  }
  unit.dispose(); cane.dispose(); ring.dispose();
}

// 町の焼け跡は、箱を傾けず黒い柱と落ちた梁で示す。形と材質は十軒で共用する。
const CHAR_GEO = new THREE.BoxGeometry(1, 1, 1);
const TOWN_RUBBLE_GEO = new THREE.IcosahedronGeometry(1, 0);
const TOWN_RUBBLE_MAT = new THREE.MeshStandardMaterial({ roughness: 1 });
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
  // 土壁の割れた塊と小片をまとめて描く。焼けた木と違う厚い断面を残す。
  const rubble = new THREE.InstancedMesh(TOWN_RUBBLE_GEO, TOWN_RUBBLE_MAT, 32);
  const clay = new THREE.Color();
  for (let i = 0; i < 32; i++) {
    const side = i % 4, t = Math.sin(i * 17.13 + h.i * 3.7) * 0.5;
    const spread = 0.2 + (i % 5) * 0.18;
    const x = side < 2 ? (side ? 1 : -1) * (w / 2 + spread) : t * w;
    const z = side < 2 ? t * d : (side === 2 ? 1 : -1) * (d / 2 + spread);
    const size = i < 8 ? 0.42 : 0.13 + i % 4 * 0.055;
    board.position.set(x, ground(x, z) + size * 0.18, z);
    board.rotation.set(i * 0.51, i * 2.39, i * 0.29);
    board.scale.set(size * 1.8, size * 0.55, size);
    board.updateMatrix(); rubble.setMatrixAt(i, board.matrix);
    rubble.setColorAt(i, clay.setHex(i % 3 ? 0x988264 : 0x655443));
  }
  rubble.receiveShadow = true; h.m.add(rubble);
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
  rt.after(35 + h.i * 2, () => {
    // 翌日の焼け跡へ切り替え済みなら、倒壊音だけを後から鳴らさない。
    if (rt.over || h.ruin) return;
    townRuin(rt.world, h);
    rt.army.play('houseCollapse', h.m.position, 0.9);
  });
}
function charHouse(rt, h) {
  for (const f of h.fires || []) rt.world.removeFire(f);
  h.fires = null; h.burnt = true;
  townRuin(rt.world, h);
}

// 公記の城下放火を遠景にも反映する。焼失範囲と残り方は推定。
// village の先頭二枚は壁と屋根。田畑・竹林は残し、既存の形と共通の焦げ材質を使う。
function charFarTown(rt, collapse = false) {
  for (const town of rt.flags.farTown) {
    if (!town.userData.charred) {
      town.userData.charred = true;
      // 遠景の村の形が束ね直されて、先頭が材質を持たない入れ物の時もある（10/28 放火の 40 秒後に落ちた）。
      for (const mesh of town.children.slice(0, 2)) {
        if (!mesh?.material || Array.isArray(mesh.material)) continue;
        mesh.material.dispose();
        mesh.material = CHAR_MAT;
      }
    }
    if (!collapse || town.userData.collapsed) continue;
    town.userData.collapsed = true;
    // 暗転の間だけ、壁と屋根の高さを地面から縮める。毎コマの変形や描画の追加はしない。
    for (let j = 0; j < 2; j++) {
      const geo = town.children[j]?.geometry, pos = geo?.attributes?.position;
      if (!pos) continue;
      for (let i = 0; i < pos.count; i++) {
        const ground = rt.world.heightAt(pos.getX(i), pos.getZ(i));
        pos.setY(i, ground + Math.max(0, pos.getY(i) - ground) * (j ? 0.12 : 0.3));
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
    }
  }
}

// 岐阜市歴史博物館「博物館だより」第百二十一号（二・三頁）：
// 斎藤氏館は永禄十年の攻略時に焼失したと考えられる。出火の時刻は不明。
// 焼ける館の位置・残り方は推定。床と当たりは残し、焦げた建物で被災を示す。
function burnInabaManor(rt) {
  const h = rt.flags.manor;
  if (h.burnt) return;
  h.burnt = true;
  const mats = new Map();
  h.mesh.traverse((m) => {
    if (!m.isMesh || !m.material) return;
    const char = (source) => {
      if (!mats.has(source)) {
        const mat = source.clone();
        if (mat.color) mat.color.setHex(0x39312b);
        mats.set(source, mat);
      }
      return mats.get(source);
    };
    m.material = Array.isArray(m.material) ? m.material.map(char) : char(m.material);
  });
  h.fires = [-3, 3].map((dx) => rt.world.addFire(YAKATA.x - 2 + dx, YAKATA.z - 5,
    { h: 3, size: 2.7, blackSmoke: true }));
}

// この戦の炎だけを差し替える。二枚の舌と建物の脇の舌は元の数のまま、火の粉も既存の粒を使う。
const TOWN_FLAME_GEO = new THREE.PlaneGeometry(1, 1, 6, 10);
const TOWN_UNLIT = new THREE.Vector3(0, -10000, 0);
function townFlame(rt, f) {
  // 家の火は共通の乱れた舌を残す。輪郭の単純な専用材質は手持ちの松明だけ。
  if (!f.torch) {
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
    return;
  }
  if (!rt.flags.townFlameMats) {
    const time = { get value() { return reduceMotion() ? 0 : rt.t; } };
    // 公記の放火日の強風を、旗・煙と同じ風で松明にも伝える。風向き自体は遊びの仮設定。
    // 原文：https://ja.wikisource.org/wiki/信長公記 （首巻「いなは山御取候事」）
    // 動きを減らす時は突風の変動を止め、風下への傾きは残す。材質は全ての松明で共有。
    const windX = { get value() { return WIND_STATE.dirX * (reduceMotion() ? rt.world.def.windStrength : WIND_STATE.gust); } };
    const windZ = { get value() { return WIND_STATE.dirZ * (reduceMotion() ? rt.world.def.windStrength : WIND_STATE.gust); } };
    rt.flags.townFlameMats = [0, 1].map((core) => new THREE.ShaderMaterial({
      uniforms: { uTime: time, uWindX: windX, uWindZ: windZ, uCore: { value: core }, uTorch: { value: 0 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      vertexShader: `uniform float uTime; uniform float uWindX; uniform float uWindZ; uniform float uCore; uniform float uTorch; varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float seed = c.x * 0.73 + c.z * 0.31 + uCore * 2.0;
          float y = uv.y;
          // 松明は細長い舌。芯の太さを残し、先ほど風に揺らす。
          float width = uTorch > 0.5 ? 0.55 : pow(1.0 - y, 0.8);
          float sway = (sin(uTime * 3.7 + seed + y * 6.0) * 0.12
            + sin(uTime * 6.1 + seed + y * 11.0) * 0.055) * y * y;
          vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]) + vec3(0.00001, 0.0, 0.0));
          float sx = length(modelMatrix[0].xyz), sy = length(modelMatrix[1].xyz);
          vec3 p = c + right * (position.x * width + sway) * sx + vec3(0.0, position.y * sy, 0.0);
          p += vec3(uWindX, 0.0, uWindZ) * (sy * y * y * 0.28);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform float uTime; uniform float uCore; uniform float uTorch; varying vec2 vUv;
        void main() {
          float edge = 1.0 - smoothstep(0.24, 0.5, abs(vUv.x - 0.5));
          float ripple = 0.82 + 0.18 * sin(vUv.y * 24.0 - uTime * 5.0 + uCore * 2.0);
          float alpha = edge * smoothstep(0.0, 0.1, vUv.y) * (1.0 - smoothstep(0.65, 1.0, vUv.y)) * ripple;
          if (uTorch > 0.5) {
            // 丸い裾から二つの舌へほぐす。板の縁は透かし、弱い明滅に留める。
            float radius = 0.34 * pow(max(0.0, sin(vUv.y * 3.14159)), 0.7);
            float tongue = sin(vUv.y * 9.0 - uTime * 3.1 + uCore) * vUv.y * 0.09;
            alpha = (1.0 - smoothstep(radius * 0.5, radius + 0.025, abs(vUv.x - 0.5 - tongue)))
              * smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y))
              * (0.92 + 0.08 * sin(uTime * 5.0 + uCore));
          }
          vec3 outer = mix(vec3(0.95, 0.10, 0.015), vec3(0.65, 0.025, 0.006), vUv.y);
          vec3 core = mix(vec3(1.0, 0.78, 0.12), vec3(1.0, 0.35, 0.025), vUv.y);
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(mix(outer, core, uCore), alpha * 0.9);
        }`,
    }));
  }
  let [outer, inner] = rt.flags.townFlameMats;
  if (f.torch) {
    // 手持ちの炎は竿の先の小さな火。近くでも顔と進路を隠さない。
    f.size = 0.4;
    // 松明の脇に第三の舌を並べず、芯と外側の舌を残す。
    for (const m of f.flame.children) m.visible = false;
    if (!rt.flags.townTorchMats) rt.flags.townTorchMats = rt.flags.townFlameMats.map((m) => {
      const mat = m.clone();
      mat.uniforms.uTime = m.uniforms.uTime;
      mat.uniforms.uWindX = m.uniforms.uWindX; mat.uniforms.uWindZ = m.uniforms.uWindZ;
      mat.uniforms.uTorch.value = 1; return mat;
    });
    [outer, inner] = rt.flags.townTorchMats;
  }
  f.flame.traverse((m) => { if (m.isMesh) { m.geometry = TOWN_FLAME_GEO; m.material = outer; } });
  f.inner.geometry = TOWN_FLAME_GEO; f.inner.material = inner;
  // 芯は外側より手前へ少しずらし、赤い舌の間から見せる。
  f.inner.renderOrder = 3;
  // 松明の脇の舌は重ねず、芯と外側の舌を残す。
  for (const m of f.flame.children) m.visible = false;
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
  // 七曲り・東の尾根道も、急な土の坂にだけ岩の段を混ぜる。裏道と同じ形を共用する。
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
  battleJin('山麓の囲み（配置は推定）', 0, ZUI, Math.PI, [
    ['ibNobu', '本陣', '織田信長', 3000, ZUI.x, ZUI.z, 'odaCamp', 'eiraku', 'oda', ZUI_FACING],
    ['ibKino', '裏手の仕寄り', '木下藤吉郎', 1500, 28, 104, 'kino', 'oda'],
    ['ibShiba', '大手の仕寄り', '柴田勝家', 2000, 52, 96, 'shiba', 'oda', 'kari'],
    ['ibNiwa', '大手の控え', '丹羽長秀', 1500, 8, 116, 'niwa', 'oda', 'sujikai'],
    ['ibMori', '大手左の囲み', '森可成', 1200, MORI_YOSE.x, MORI_YOSE.z, 'oteYose1', 'oda', 'tsuru', MORI_FACING],
    ['ibSakai', '大手右の囲み', '坂井政尚', 1000, SAKAI_YOSE.x, SAKAI_YOSE.z, 'oteYose2', 'eiraku', 'oda', SAKAI_FACING],
    ['ibSaku', '南の控え', '佐久間信盛', 1500, SAKUMA_YOSE.x, SAKUMA_YOSE.z, 'sakuma', 'oda', 'oda', SAKUMA_FACING],
    ['ibIkeda', '東の山裾の控え', '池田恒興', 1000, IKEDA_YOSE.x, IKEDA_YOSE.z, 'ikeda', 'oda', 'ageha', IKEDA_FACING],
    ['ibMino', '西麓の控え', '稲葉一鉄・氏家卜全・安藤守就', 2300, MINO_YOSE.x, MINO_YOSE.z, 'sannin', 'inaba', 'inaba', MINO_FACING],
  ], '織田一万五千は仮の総数。瑞龍寺山への出兵は公記にあるが、各将の持ち場と兵数は推定。森・坂井の寄せ手は山腹へ先回りせず、麓のさくの南に置く。'),
  battleJin('曲輪の守り（配置は推定）', 1, HON, 0, [
    // 仮の千人を山上・町・麓で共有し、出撃隊の敗走だけで山上の残兵まで消さない。
    ['ibHineno', '大手の曲輪', '日根野弘就', 1000, OTE.x, OTE.z - 6, 'oteB', 'saito'],
    ['ibNagai', '東の尾根道の守り', '長井道利', 800, NAGAI_MAMORI.x, NAGAI_MAMORI.z, 'hyakuB', 'saito', 'saito', NAGAI_FACING],
    ['ibWater', '西の裏道の曲輪', '名は伝わらない', 400, KOSHI_MAMORI.x, KOSHI_MAMORI.z, 'koshiB', 'saito', 'saito', KOSHI_FACING],
    ['ibNi', '二の丸', '名は伝わらない', 600, NI_MAMORI.x, NI_MAMORI.z, 'niB', 'saito', 'saito', NI_FACING],
    ['ibTatsu', '本陣', '斎藤龍興', 1200, HON.x + 2, HON.z - 4, 'keep', 'saito', 'saito', SHUDEN_FACING],
  ], '城兵四千を仮の総数とする。大手の千人は町・麓へ出た守兵も含み、各隊の残存率を表示へ反映する。人数と守り所への将の割り振りは推定。'),
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
// 正面の庭口は玄関の階段幅に揃える。斎藤期の細部は推定、道と急な肩には設けない。
function buildInabaServiceYard(rt, batch, k, x, z, w, d, rot, entryW) {
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
  // 階段の降り口に庭の柵を張り出させない。玄関幅に段の左右十五センチと
  // 柵の当たり半径八センチを足し、見える口と通れる口を一緒に揃える。
  const gateHalf = (entryW + .3) / 2 + .08;
  const rails = [[-side, back, -side, front], [side, front, side, back],
    [-side, front, -gateHalf, front], [gateHalf, front, side, front]];
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
  // 太い線分の当たりでは両端が六十センチ膨らみ、番所・蔵の玄関前を狭める。
  // 枕木の外寸（幅八十三センチ・奥行き一・二五歩）へ四角い当たりを揃える。
  // 建物と同じ向きに回し、見える材木の脇から戸口へ通れるようにする。
  const [stockWorldX, stockWorldZ] = point(stockX, stockZ);
  solidRect(stockWorldX, stockWorldZ, .83, 1.25, rot);
  unit.dispose();
  const geo = mergeGeometries(parts); parts.forEach((g) => g.dispose());
  const mesh = kitFence(batch, geo, WOOD_MAT());
  if (!mesh?.isBatchedPart) {
    const fallback = new THREE.Mesh(geo, WOOD_MAT());
    fallback.castShadow = fallback.receiveShadow = true; rt.scene.add(fallback);
  }
}

// 岐阜市の金銘水の解説：岩山の籠城用水は雨水・しみ出す水をためて確保した。
// https://www.city.gifu.lg.jp/kankoubunka/kankou/1013050/1005149/1017450/1017462/1020441.html
// 自動の曲輪小物を止めているため失われていた水の備えを補う。
// 国土交通省の井戸跡解説では、岩をくりぬいて雨水をためる貯水槽。
// https://www.mlit.go.jp/tagengo-db/H30-00676.html
// 金銘水そのものの復元ではない。斎藤期の位置・寸法・岩の縁の姿と貯水量は推定。
function buildInabaCisterns(rt) {
  const wall = new THREE.CylinderGeometry(1.1, 1.18, .45, 12, 1, true);
  const inside = new THREE.CylinderGeometry(.87, .82, .45, 12, 1, true);
  const rim = new THREE.RingGeometry(.87, 1.1, 12);
  rim.rotateX(-Math.PI / 2); rim.translate(0, .225, 0);
  const stone = mergeGeometries([wall, inside, rim]); wall.dispose(); inside.dispose(); rim.dispose();
  const surface = new THREE.CircleGeometry(.88, 12); surface.rotateX(-Math.PI / 2);
  // 均一な円筒の井筒をやめ、岩を削った不揃いな口にする。内壁と水面も同じ輪郭へそろえる。
  // 底の地形を掘り変えず、従来と同じ範囲と当たりの内側だけで表す。
  for (const geo of [stone, surface]) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
      const scale = .95 + .035 * Math.sin(a * 3) + .015 * Math.cos(a * 5);
      p.setXYZ(i, x * scale, p.getY(i), z * scale);
    }
    geo.computeVertexNormals();
  }
  // 二か所とも形・材質を共用し、水は静かな暗い面にする。毎コマの更新は不要。
  const wells = new THREE.InstancedMesh(stone,
    new THREE.MeshLambertMaterial({ map: stoneTex(), color: 0x817c70, side: THREE.DoubleSide }), 2);
  const water = new THREE.InstancedMesh(surface, new THREE.MeshLambertMaterial({ color: 0x273737 }), 2);
  const pose = new THREE.Object3D();
  // 主殿・蔵・番所と道を避け、既存の平場の内側に置く。山肌や進軍路は掘り変えない。
  [[HON.x - 17, HON.z + 9], [NI.x - 7, NI.z - 6]].forEach(([x, z], i) => {
    const y = rt.world.heightAt(x, z);
    pose.position.set(x, y + .18, z); pose.updateMatrix(); wells.setMatrixAt(i, pose.matrix);
    pose.position.y = y + .035; pose.updateMatrix(); water.setMatrixAt(i, pose.matrix);
    solidSeg(x - .3, z, x + .3, z, .9);
  });
  wells.instanceMatrix.needsUpdate = water.instanceMatrix.needsUpdate = true;
  wells.castShadow = wells.receiveShadow = water.receiveShadow = true;
  rt.scene.add(wells, water);
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
  for (const [id, kind, x, z, facing] of places) {
    let rot = facing;
    const k = INABAYAMA_PLAN.kuruwa.find((q) => q.id === id);
    const w = kind === 'kura' ? 5.4 : 4.4, d = kind === 'kura' ? 4 : 3.4;
    // 内寸から隅柱と引き先の余白を引き、内側の板戸と玄関の幅を揃える。
    // 小番所は一・七五歩、蔵は二・一歩とし、荷を運ぶ口だけ細くしない。
    const entryW = Math.min(2.1, (w - .9) / 2);
    // 上がり台・階段は戸幅に三十センチを足す。両端の外にも足場を取る。
    const entryHalf = (entryW + .3) / 2 + .1;
    const c = Math.cos(rot), s = Math.sin(rot), y = W.heightAt(x, z);
    let fits = true;
    for (const dx of [-w / 2 - .8, w / 2 + .8]) for (const dz of [-d / 2 - .8, d / 2 + .8]) {
      const px = x + dx * c + dz * s, pz = z - dx * s + dz * c;
      if (!inPoly(k.poly, px, pz) || Math.abs(W.heightAt(px, pz) - y) > .65 || inabaPathDistance(px, pz) < 2) fits = false;
    }
    if (!fits || inabaPathDistance(x, z) < Math.hypot(w, d) / 2 + 2) continue;
    // 小屋の四隅だけでは、玄関前の上がり台と階段が切岸へ出る。
    // 共通室内の台一・三五歩＋階段一・一歩と、降りた先の足場まで調べる。
    // 半回転なら建物の占める場所は同じ。庭と荷も採った玄関の向きへ揃える。
    let entryFits = false;
    for (let turn = 0; turn < 2; turn++) {
      const direction = turn ? -1 : 1;
      let clear = true;
      for (let step = 0; step <= 7 && clear; step++) for (const dx of [-entryHalf, 0, entryHalf]) {
        const dz = d / 2 - .15 + step * .4;
        const px = x + direction * (dx * c + dz * s);
        const pz = z + direction * (-dx * s + dz * c);
        if (!inPoly(k.poly, px, pz) || Math.abs(W.heightAt(px, pz) - y) > .65) { clear = false; break; }
      }
      if (clear) { rot = facing + turn * Math.PI; entryFits = true; break; }
    }
    // どちらにも足場がない所へ、入れない飾りの小屋を建てない。
    if (!entryFits) continue;
    // 外形だけの小屋を重ねず、板間・梁・板戸を持つ共通の室内へつなぐ。
    goten(rt, x, z, {
      w, d, rot, tile: false, fieldFort: true, weatheredBoards: true, utilityBoardWalls: true,
      name: `${k.name}の${kind === 'kura' ? '兵糧蔵' : '番所'}`, kind, team: 1,
      naka: true, profile: 'inabayama', doorX: 0, entryW, doorFire: false, noTarget: true,
    });
    // 蔵の米俵は室内の間取りが板床と同じ高さへ置く。
    buildInabaServiceYard(rt, batch, k, x, z, w, d, rot, entryW);
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
  for (const [x0, x1, z, inward] of [[-18, -7, HON.z - 13, 1], [2, 17, HON.z + 13, -1]]) {
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
// 岐阜大学「岐阜の地学／金華山」：主に赤色・灰色のチャートからなる。
// https://chigaku.ed.gifu-u.ac.jp/chigakuhp/html/kyo/chisitsu/gifunochigaku/topography/kinkazan/index.html
// 色の分布は実測ではなく推定。地面と道脇の露岩で同じ斑を使い、設営時だけ計算する。
function inabaChertRed(x, z) {
  return THREE.MathUtils.smoothstep(Math.sin(x * 0.07 + z * 0.043)
    + Math.sin(x * 0.031 - z * 0.085) * 0.45, -0.55, 0.65);
}
// 岐阜市「史跡岐阜城跡整備基本計画」第２章・動植物：戦国期は大半の樹木が伐採されたと推定。
// https://www.city.gifu.lg.jp/_res/projects/default_project/_page_/001/005/558/seibi1.2s.pdf
// 伐採範囲の細部は未詳。城の斜面を疎らにし、残る林は戦場外縁へ寄せる仮の分布。
function inabaTreeDensity(x, z) {
  if (z > 28) return 0.10;
  // 根元の周囲が急な切岸なら置かない。伐採後の疎林にも同じ足場の条件を使う。
  const y = height(x, z);
  const slope = Math.max(Math.abs(height(x + 1, z) - y), Math.abs(height(x - 1, z) - y),
    Math.abs(height(x, z + 1) - y), Math.abs(height(x, z - 1) - y));
  // 町から見上げる南の山すそ（z -30〜28）は、急な崖の間の岩棚にも林を残す。最初の画面で岩肌と樹冠が交じって見える（10/28 点付け）。
  const foot = z > -30 && x > -36 && x < 96 ? Math.min(1, (z + 30) / 24) : 0;
  if (slope >= 1.2 + foot * 0.6) return 0;
  if (foot > 0 && slope > 0.35) return (0.18 + 0.32 * foot) * Math.min(1, (1.8 - slope) / 0.5);
  const edge = Math.max(Math.abs(x) / 108, Math.abs(z + 62) / 100);
  const t = Math.max(0, Math.min(1, (edge - 0.85) / 0.35));
  const density = 0.035 + (1 - inabaRockBand(x, z)) * 0.04 + 0.60 * t * t * (3 - 2 * t);
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
  const high = S.quality === 'high';
  const bands = new Float32Array(pos.count);
  const chert = high ? new Float32Array(pos.count) : null;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    // 薄い下地を残し、露岩の斑の外でも急な崖は灰褐色の肌にする。
    bands[i] = z < 28 && z > -170 && Math.abs(x) < 100 && !inabaClearing(x, z) ? 0.15 + inabaRockBand(x, z) * 0.85 : 0;
    if (chert) chert[i] = inabaChertRed(x, z);
  }
  geo.setAttribute('inabaRock', new THREE.BufferAttribute(bands, 1));
  if (chert) geo.setAttribute('inabaChert', new THREE.BufferAttribute(chert, 1));
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
  const mat = W.terrain.material, compile = mat.onBeforeCompile, cacheKey = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => cacheKey + '|inaba-mountain-slope' + (high ? '|chert' : '');
  mat.onBeforeCompile = (sh) => {
    // 共通の高画質の土・濡れ・踏み跡を先に組み、稲葉山の露岩と道筋を重ねる。
    compile(sh);
    for (const name of ['tGrass', 'tDirt', 'tStone', 'tWear', 'uWet']) sh.uniforms[name] = W.groundU[name];
    sh.uniforms.inabaTrail = { value: trail };
    sh.vertexShader = 'attribute float inabaRock;\nvarying float vInabaRock;\n' + sh.vertexShader;
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInabaRock = inabaRock;');
    sh.fragmentShader = 'uniform sampler2D inabaTrail;\nvarying float vInabaRock;\n' + sh.fragmentShader;
    if (high) {
      sh.vertexShader = 'attribute float inabaChert;\nvarying float vInabaChert;\n' + sh.vertexShader;
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvInabaChert = inabaChert;');
      sh.fragmentShader = 'varying float vInabaChert;\n' + sh.fragmentShader;
    }
    sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb *= col;', `
      // 急な崖は橙の長い筋を重ねず、縮尺を合わせた岩肌を見せる。緩い林床には露岩の斑を残す。
      float ibSlope = 1.0 - abs(gN.y);
      vec3 ibStone = stone * vec3(0.83, 0.80, 0.75);
      ${high ? 'ibStone = stone * mix(vec3(0.79, 0.80, 0.81), vec3(0.94, 0.68, 0.62), vInabaChert);' : ''}
      float ibRock = max(vInabaRock * smoothstep(0.08, 0.38, ibSlope) * 0.85,
        smoothstep(0.02, 0.14, vInabaRock) * smoothstep(0.18, 0.5, ibSlope));
      // 曲輪の切岸・土塁は本の CG の草の土手を残す（城の地面の効きの分だけ岩肌を引く）
      ibRock *= 1.0 - castleCover;
      // 遠くの崖が一枚の灰の板に見えないよう、チャートの層の筋・岩の濃淡・岩棚の笹の斑を重ねる。
      float ibN = sin(vWP.x * 0.21 + vWP.z * 0.13) * sin(vWP.z * 0.17 - vWP.x * 0.07 + vWP.y * 0.09);
      float ibLayer = smoothstep(0.6, 0.95, abs(sin(vWP.y * 0.8 + vWP.x * 0.11 + ibN * 1.6)));
      ibStone *= mix(0.62, 1.04, macro) * (1.0 - ibLayer * 0.34) * (0.88 + ibN * 0.14);
      float ibScrub = smoothstep(0.1, 0.55, ibN + macro2 * 0.6 - 0.2) * smoothstep(0.9, 0.35, ibSlope);
      ibStone = mix(ibStone, grass * vec3(0.5, 0.58, 0.4), ibScrub * 0.8);
      col = mix(col, ibStone, ibRock);
      float ibTrail = texture2D(inabaTrail, (vWP.xz + ${W.half.toFixed(1)}) / ${(W.half * 2).toFixed(1)}).r;
      // 上から描いた道の帯を縦の切岸へ引き延ばさない。歩ける坂の土色は残す。
      ibTrail *= smoothstep(0.55, 0.72, abs(gN.y)) * (1.0 - castleCover * 0.7);
      col = mix(col, dirt * vec3(0.92, 0.83, 0.72), ibTrail * 0.94);
      diffuseColor.rgb *= col;`);
    // 井口の町から金華山の山頂（比高約300m）が霧で消え、山城の戦なのに城山が画面に無かった（10/28）。
    // 高い所（標高20m〜110m で次第に）の山肌だけ、霧の見通しの外でも霞んだ山影として残す。兵・建物・低い地面の霧は変えない。
    // 町（z>30）から見上げる金華山の南の斜面（z<60・地面から一・五メートルより上）は霧を六割五分まで薄め、チャートの岩肌と林の色を見せる（10/28）。
    // 南の崖は日の陰で黒い壁に見えた（10/28 点付け：山を明るく）。山すそから上の山肌だけを最大五割五分明るくする。
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace(
      'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );',
      'fogFactor = min(fogFactor, mix(1.0, 0.5, smoothstep(6.0, 60.0, vWP.y)));\n  fogFactor = min(fogFactor, mix(1.0, 0.65, (1.0 - smoothstep(60.0, 90.0, vWP.z)) * smoothstep(1.5, 10.0, vWP.y)));\n  gl_FragColor.rgb *= 1.0 + 0.55 * (1.0 - smoothstep(30.0, 70.0, vWP.z)) * smoothstep(4.0, 30.0, vWP.y) * (1.0 - smoothstep(120.0, 220.0, vWP.y));\n  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );'));
  };
  mat.addEventListener('dispose', () => trail.dispose());

  // 丸石を増やす代わりに、道の外へ薄い岩の段を集める。割れ目は二枚の隙間で表す。
  // 箱の上面と暗い絵を重ねると黒い板に見える。割れと頂点色を共用する。
  const rockGeo = rockShape(1, true, 1), rp = rockGeo.attributes.position;
  const rocks = new THREE.InstancedMesh(rockGeo,
    new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x302c23, emissiveIntensity: 0.3 }), 160);
  const roots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.13, 1, 5),
    new THREE.MeshLambertMaterial({ map: barkTex('broad'), color: 0x756044 }), 80);
  const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), normal = new THREE.Vector3(), end = new THREE.Vector3(), across = new THREE.Vector3(), color = new THREE.Color(), vertex = new THREE.Vector3();
  const chertRed = high ? new THREE.Color().setRGB(0.94, 0.68, 0.62) : null;
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
          if (high) {
            // 形・材質・岩の数は共用のまま。灰色からくすんだ赤へ、地面と同じ分布で染める。
            color.setRGB(0.79, 0.80, 0.81).lerp(chertRed, inabaChertRed(rx, rz));
            color.multiplyScalar(0.94 + (nr % 3) * 0.06);
          } else color.setHex((nr % 3) === 0 ? 0xc7cfad : (nr % 3) === 1 ? 0xe0d6c8 : 0xc9bfb3);
          rocks.setColorAt(nr++, color);
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

  // 伐採跡は低い切り株で示す。位置・本数は推定の演出。道と曲輪には置かない。
  // 形と二つの材質、作業用の行列を全株で共用し、設営後の更新はしない。
  const stumpBark = new THREE.MeshLambertMaterial({ map: barkTex('broad'), color: 0x756044 });
  const stumpCut = new THREE.MeshLambertMaterial({ color: 0x9a8766 });
  const stumps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.34, 1, 7),
    [stumpBark, stumpCut, stumpCut], 48);
  let ns = 0;
  for (let i = 0; i < 384 && ns < 48; i++) {
    const x = -95 + 190 * ((i * 0.61803398875) % 1), z = -148 + 170 * ((i * 0.41421356237) % 1);
    if (inabaTreeDensity(x, z) > 0.09 || inabaClearing(x, z, 3) || inabaPathDistance(x, z) < 8
      || distToPolyline(x, z, NAGARA) < NAGARA_WIDTH * 1.6) continue;
    const y = drawGroundAt(W, x, z);
    const gx = drawGroundAt(W, x + 0.4, z) - drawGroundAt(W, x - 0.4, z);
    const gz = drawGroundAt(W, x, z + 0.4) - drawGroundAt(W, x, z - 0.4);
    if (Math.hypot(gx, gz) > 0.72) continue;
    const h = 0.70 + (i % 4) * 0.07, r = 0.8 + (i % 3) * 0.15;
    dummy.position.set(x, y + h / 2 - 0.40, z);
    dummy.rotation.set(0, i * 2.4, 0); dummy.scale.set(r, h, r);
    dummy.updateMatrix(); stumps.setMatrixAt(ns++, dummy.matrix);
  }
  stumps.count = ns; stumps.receiveShadow = true;
  W.viewCull([stumps], 0); rt.scene.add(stumps);
}

// 小屋へ直進すると西の長屋や東の遠侍に入る。外の通り道を人と試験の遊び手で共有する。
function inabaSignalApproach(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  const q = F.sigGuide || (F.sigGuide = { x: 0, y: 0, z: 0 });
  q.x = F.sig.x - 4; q.z = F.sig.z;
  // 本丸を細い尾根の平場にした（10/28）ので、長屋の南を回る道は無い。西からは長屋の北を、東からは遠侍の北を回る。
  if (p.z < HON.z - 5 && p.x < HON.x - 3) {
    // 北西の隅（兵糧蔵の裏）からは、蔵と主殿の間の通りを南へ抜ける。蔵の西は細いので通らない。
    if (p.x > HON.x - 9) { q.x = HON.x - 6.5; q.z = HON.z - 1; }
    else if (p.z < HON.z - 10.5) { q.x = HON.x - 6.5; q.z = p.z; }
    else { q.x = HON.x - 17; q.z = HON.z + 1; }
  } else if (p.x < HON.x + 1.5) {
    q.z = HON.z + 3;
    if (p.z > HON.z + 5) q.x = p.x;
  } else if (p.x > HON.x + 7 && p.z < HON.z + 7.5) {
    q.x = HON.x + 6;
    q.z = HON.z + 1;
    if (p.z > HON.z + 1) q.x = p.x;
  }
  q.y = rt.world.heightAt(q.x, q.z);
  return q;
}

// 目印が小屋そのものではなく、建物を避ける途中の道を指す時の案内。
function inabaSignalDetour(rt) {
  const sig = rt.flags.sig;
  if (!sig) return false;
  const q = inabaSignalApproach(rt);
  return Math.hypot(q.x - (sig.x - 4), q.z - sig.z) > 0.5;
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
  // 道の中心から少し外れて歩いても、搦手の木戸へ近づいていれば寄せは続く（立ち止まった時だけ打ち切る）。
  if (F.step === 3) {
    const p = rt.player.u.pos, dg = Math.hypot(p.x + 30, p.z + 118) + Math.abs(p.y - rt.world.heightAt(-30, -118)) * .5;
    if (F.pacingGate == null) F.pacingGate = dg;   // 初めの一回は基準だけ。
    else if (dg < F.pacingGate - 2) { F.pacingGate = dg; F.pacingClimbT = rt.t; }
  }
  // 角で列を待つ間も、藤吉郎の列が登っていれば寄せは続く。
  if (F.step === 3 && F.kino?.order === 'path' && F.kino.pathIdx > (F.pacingKino || 0)) {
    F.pacingKino = F.kino.pathIdx; F.pacingClimbT = rt.t;
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
    g.noRout = false; g.morale = 0;
  }
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

// 退き口へ着いても、声は四秒、太鼓は十秒、その意味を札に残す。
function inabaRetreatCueHeld(rt) {
  const F = rt.flags;
  return F.retreatSignalStep === F.step
    && rt.t - (F.retreatSignalAt ?? -Infinity) < (F.step === 3 || F.retreatByVoice ? 4 : 10);
}
function inabaClearRetreat(rt) {
  const F = rt.flags;
  rt.unmark('retreat'); F.retreatMarked = false;
  F.retreatCueHeld = inabaRetreatCueHeld(rt);
  if (F.retreatCueHeld) rt.objProgress('retreat', F.step === 3
    ? '組頭の小声は退けの下知。声をひそめ、仲間の後ろで列を整えよ'
    : F.retreatByVoice ? '近くの組頭の声は退けの下知。仲間の後ろで隊を整えよ'
      : '法螺貝と退き太鼓、続く鉦は退けの合図。仲間の後ろで隊を整えよ');
  else rt.objRemove('retreat');
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
  if (F.retreatCueHeld && !inabaRetreatCueHeld(rt)) {
    F.retreatCueHeld = false;
    if (!F.retreatMarked) rt.objRemove('retreat');
  }
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
    inabaClearRetreat(rt);
    F.retreatRestUntil = rt.t + 8;
  }
  if (F.retreatMarked && (F.retreatStep !== F.step || !F.retreatUnit?.alive || (!danger && rt.t - F.retreatDangerAt >= 8))) {
    inabaClearRetreat(rt);
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
    inabaClearRetreat(rt);
  }
  const length = Math.hypot(ex, ez) || 1;
  let best = null, score = Infinity;
  for (const u of rt.army.units) {
    if (!u.alive || u.team !== 0 || u === player || u.isStruct || u.dying || u.gone || u.noTarget
      || u.fleeing || u.woundOut || u.evacuatedWound || u.rearWound || u.downed || u.pinT > rt.army.time
      || u.naka || Math.abs(u.pos.y - p.y) > 4) continue;
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
    if (F.retreatMarked) { inabaClearRetreat(rt); }
    if (!F.retreatNoWayAdvice) {
      F.retreatNoWayAdvice = true;
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
    // 退き口を選び直しても、鳴っている合図の説明を消さない。裏道は常に小声で伝える。
    rt.objProgress('retreat', F.step === 3
      ? '声をひそめ、退き口の印へ下がれ。太鼓と法螺は控え、離れたら列へ戻れ'
      : F.retreatStep === F.retreatSignalStep && rt.t - F.retreatSignalAt < 10
        ? F.retreatByVoice ? '近くの組頭の声は退けの下知。退き口から味方の後ろへ下がれ'
          : '法螺貝と退き太鼓、続く鉦は退けの合図。味方の後ろへ下がれ'
        : '囲まれる前に、仲間の後ろへ。離れたら元の任務へ戻れ');
    // 組の後ろから退き太鼓。退き口の選び直しで連打せず、裏道では声だけにする。
    if ((F.retreatSignalAt ?? -99) + 30 <= rt.t) {
      F.retreatSignalAt = rt.t;
      F.retreatSignalStep = F.step;
      // 退き太鼓は八秒ほど続く。次の懸かりや鬨の返しにも重ならないよう、
      // 町の初動・城兵の新手が出るまで・斉射の余韻・本丸の両手の鬨の間は組頭の声で退かせる。
      F.retreatByVoice = F.step === 1 && rt.t - F.stepT < 18
        || F.step === 2 && (F.karaWaiting || !F.ote2.sent
          || rt.t < (F.oteReadyUntil ?? -Infinity)
          || rt.t < (F.oteSignalT ?? -Infinity) + KAKARI_SOUND_SECONDS + 0.5
          || F.oteWarned && rt.t < F.oteWarnT + KAKARI_SOUND_SECONDS + 0.5
          || rt.t < (F.oteShoutT ?? -Infinity) + 6
          || rt.t < (F.ote2ShoutT ?? -Infinity) + 6
          || rt.t < (F.oteReplyT ?? -Infinity) + 6
          || rt.t < (F.oteVolleyUntil ?? -Infinity) + 0.5)
        || F.step === 4 && rt.t - F.honCallT < KAKARI_SOUND_SECONDS + 12;
      if (F.step === 3) {
        rt.army.play('jinchuWhisper', best.pos, 0.7);
        rt.objProgress('retreat', '声をひそめ、退き口の印へ下がれ。太鼓と法螺は控え、離れたら列へ戻れ');
        rt.say('組頭', '（小声で）囲まれるぞ。退き口の印へ下がれ。太鼓と法螺は鳴らすな', 3.5);
      } else if (F.retreatByVoice) {
        // 鬨の声では懸かれと紛らわしい。組頭一人の退けの声で伝える。
        rt.army.play('retreatOrder', best.pos, 0.7);
        const afterVolley = F.step === 2 && rt.t < (F.oteVolleyUntil ?? -Infinity) + 0.5;
        rt.objProgress('retreat', (afterVolley ? '斉射は味方。' : '') + '近くの組頭の声は退けの下知。退き口から味方の後ろへ下がれ');
        rt.say('組頭', (afterVolley ? '今の斉射は味方じゃ。' : '囲まれるぞ！　') + '今の退けの声はこの組への下知じゃ。退き口から味方の後ろへ下がれ！', 3.5);
      } else {
        rt.army.playFar('sig_nobiki', best.pos, 0.7);
        rt.objProgress('retreat', '法螺貝と退き太鼓、続く鉦は退けの合図。味方の後ろへ下がれ');
        rt.say('組頭', '法螺と退き太鼓、続く鉦も退けの合図じゃ！　退き口の印へ下がれ', 3.5);
      }
      F.retreatAdvice = true;
    }
  }
  if (!F.retreatAdvice) {
    F.retreatAdvice = true;
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
  const hudTaskRepeats = hud.taskRepeats;
  // 使番が町の下知を持って山へ遅れて着いても、済んだ火付けへ戻さない。
  // 待ち列へ入れる時だけでなく、表示直前と表示中にも同じ判定を使う。
  hud.taskRepeats = function (who, text) {
    if ((F.step > 0 || F.joinedKino) && /藤吉郎の旗で話を聞こう|まず、わしの旗へ集まれ|わしの旗へ来い。町へ出る前/.test(text)) return true;
    if (F.step >= 2 && /印の家|火の印の家|家に火を放つ|火付けの足軽を守れ|火付けじゃ|家の脇の敵|火は付いた。印の守兵|わしの旗で新手を迎えよ/.test(text)) return true;
    // 火付け中に予約した残り軒数も、三軒焼いた後には読ませない。
    if (F.step === 1 && F.lit >= NEED && /次は印の家|あと(?:一|\d+)軒じゃ|印の家で|火の印の家へ|家に火を放つ/.test(text)) return true;
    // 信長の護衛も、火付けが済んだら残る守兵への案内に切り替える。
    if (F.step === 1 && F.lit >= NEED && /火付けの足軽を守れ/.test(text)) return true;
    // 新手が着いた後に、待ち列の古い集合命令へ戻さない。
    if (F.step >= 2 || F.step === 1 && F.townTarget && !gone(F.townTarget)) {
      if (/近くの敵は去った。わしの旗で新手を迎えよ/.test(text)) return true;
    }
    if (F.step === 1 && F.townWaiting && /火は付いた。(?:家の脇の敵も|印の守兵を)/.test(text)) return true;
    // 待つ声が遅れて届いても、出発済みの敵を待たせない。
    if (F.step === 2) {
      if ((rt.t - F.stepT >= 16 || gone(F.ote)) && /敵はまだ坂の上じゃ/.test(text)) return true;
      if (F.ote2.sent && /次は新手が来る。仲間と並べ/.test(text)) return true;
    }
    // 迎撃が終わった後は、遅れた敵の出撃の声でも麓へ呼び戻さない。
    if (F.step >= 3 && /坂の上から(?:敵が来るぞ|新手じゃ)|町を焼いた織田の者ども|崩れてから突け|敵はまだ坂の上じゃ/.test(text)) return true;
    if (F.step >= 3 && /さくの旗へ集まれ|さくの中で引きつけよ|さくの中で待ち構えよ|仲間と並んで新手に備えよ|鹿垣を破らせるな|ここで仲間と並べ|鉄砲は引きつけてから|さくの内で備えよ|新手が来る。仲間と並べ/.test(text)) return true;
    // 本丸に入った後は、列の後ろへ遅れて届いた物見・伏兵の声へ戻さない。
    if (F.step >= 4 && /道の印をたど|山の裏へ回る|裏道を登れ|木戸の守りじゃ|木戸の守りは退いた|先頭が木戸に着いた|仲間と槍をそろえよ|物見櫓じゃ|物見じゃ|先頭に物見が出た|先頭が岩場に着いた|木戸の先が本丸の裏じゃ|岩陰に伏兵じゃ|先頭が伏兵に会った/.test(text)) return true;
    // 登りの途中でも、すでに退いた相手へ引き返させない。
    if (F.step === 3) {
      if (gone(F.scout) && /物見じゃ|先頭に物見が出た/.test(text)) return true;
      if (gone(F.ambush) && gone(F.ambushGun) && /岩陰に伏兵じゃ|先頭が伏兵に会った/.test(text)) return true;
      if (gone(F.towerArchers) && /物見櫓じゃ/.test(text)) return true;
    }
    // 木戸の守りが退いた後は、遅れて届いた交戦の声で足を止めさせない。
    if (F.guardCleared && /木戸の守りじゃ|先頭が木戸に着いた|仲間と槍をそろえよ/.test(text)) return true;
    if (!inabaWoodGateWait(rt) && /木戸前で列をそろえよ/.test(text)) return true;
    if (F.sig && /印の守兵を(?:仲間と)?(?:退けよ|追い払え)|城主は追うな。仲間と印の守兵/.test(text)) return true;
    // 小屋へ着いた後に、遅れた声で建物の外へ引き返させない。
    if (F.sig && !inabaSignalDetour(rt) && /建物の外の道を回れ|建物の外を回って小屋へ行け/.test(text)) return true;
    // 火付け口から離れた時は、今の印をたどる案内を優先する。
    if (F.sig && inabaSignalDetour(rt) && /小屋の手前へ寄れ|小屋の手前の印じゃ|小屋の手前の印へ/.test(text)) return true;
    // 竹束を置いた直後に、予約済みの下知で同じ操作へ戻さない。
    if (!F.carry && /まず竹束を置け|竹束を置いて手を空けよ|竹束を置け。それから|まず[「『]?竹束を据え/.test(text)) return true;
    // 火付けを済ませたら、建物を回る案内や長押しの下知も終える。
    if (F.ending && /小屋の手前|合図の火じゃ|合図を送れ|小屋に火を付け|小屋の印へ戻り|建物の外の道|小屋へ行け|竹束を置|竹束を据え/.test(text)) return true;
    // 歩数は今の位置から任務札で出す。使番の遅れた声で古い距離を重ねない。
    if (F.step === 3 && /(?:道の印|次の曲がり角)へ\s*あと\s*\d+歩/.test(text)) return true;
    return hudTaskRepeats.call(this, who, text);
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
    // 携帯横画面でも札の幅は三分の一以内。台詞は折り返し、任務の下端で切らない。
    + '@media(max-height:500px){html body #hud #battle-notices:not(.choosing){top:60px !important; width:min(280px,32vw) !important; max-height:calc(100% - 124px) !important;} html body #hud #battle-notices #battle-message > :is(#subtitle,.battle-notice){font-size:max(15px,calc(15px * var(--text-scale,1))) !important; line-height:1.6 !important; white-space:normal; overflow:visible; max-height:none !important;} html body #hud:has(#battle-message:not([hidden]) #subtitle:not(:empty)) #crosshair{visibility:hidden;} }'
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
    const bodyVisible = !thirdPerson || (Math.abs(viewProbe.x) < 0.8 && Math.abs(viewProbe.y) < 0.75
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
    if (thirdPerson) player.framePlayerCamera(camera);
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
    // 山肌・軒・兵を避けた最終位置から、本人へ視線を合わせ直す。
    this.framePlayerCamera(camera);
    camera.getWorldDirection(forward);
    safe.copy(camera.position); look.copy(safe).add(forward);
    // この戦の山肌補正で位置を変えた後にも、共通の壁よけを通す。
    // 見回し中の軒先も含め、画面の三分の二を目安に空く肩位置へ戻す。
    this.clearWallView(camera.position, look);
    camera.lookAt(look); camera.updateMatrixWorld();
    this.camPos.copy(camera.position);
  };
  rt.dispose = function () {
    W.addFire = addFire;
    for (const mat of F.townFlameMaterials.values()) mat.dispose();
    F.townFlameMaterials.clear();
    rt.army.hooks.onArrowRain = onArrowRain;
    player.nearAllyVisit = nearAllyVisit;
    player.canStep = canStep;
    hud.taskRepeats = hudTaskRepeats;
    rt.army.steer = steer;
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

// 稲生の水準（10/25）：倒す相手は、残りに数える組の中で一番近い一人。札・ピン・▼で同じ本人を使う。
// 深手・逃げる兵・建物は数えない。選び直しは一コマに一度だけ。
const inabaFoe = (u) => !!u?.alive && u.hp > 0 && !u.gone && !u.dying && !u.downed && !u.woundOut && !u.fleeing &&
  !u.noTarget && !u.isStruct && !u.civ && u.mesh?.visible !== false;
function honTargetGroup(rt) {
  const F = rt.flags;
  if (F.step !== 4 || F.sig || F.ending) return null;
  for (const g of F.honGuards || []) if (!gone(g) && g.units.some(inabaFoe)) return g;
  return null;
}
function nearestFoeOf(rt, group) {
  const F = rt.flags;
  if (F.foePickT === rt.t && F.foePickG === group) return F.foePick;
  F.foePickT = rt.t; F.foePickG = group;
  if (!group) return (F.foePick = null);
  const list = Array.isArray(group) ? group : [group];
  const has = (u) => list.includes(u.group);
  const p = rt.player, me = p.u.pos, reach = p.inRange && p.rangeCueTarget;
  if (inabaFoe(reach) && has(reach)) return (F.foePick = reach);
  let best = null, bd = Infinity;
  for (const g of list) {
    if (gone(g) || g.sent === false) continue;
    for (const u of g.units) {
      if (!inabaFoe(u)) continue;
      const d = Math.hypot(u.pos.x - me.x, u.pos.z - me.z);
      if (d < bd) { bd = d; best = u; }
    }
  }
  // 少しの前後では替えず、別の兵が三歩以上近い時だけ渡す。
  const prev = F.foePrev;
  if (best && best !== prev && inabaFoe(prev) && has(prev) && bd + 3 >= Math.hypot(prev.pos.x - me.x, prev.pos.z - me.z)) best = prev;
  F.foePrev = best;
  return (F.foePick = best);
}
// 本丸の柵の外から中の守りへ直進させない。柵の口→口の内→相手の順にピンを進める（城の中で迷わない）。
const HON_INNER = { x: KARA[5][0], z: KARA[5][1] };
function honGateStep(rt, enemy) {
  const p = rt.player.u.pos;
  // 壁の見通しは相手ごとに四分の一秒に一度だけ調べる。
  if (enemy._inaGateAt > rt.t && enemy._inaGateAt - rt.t <= .25) return enemy._inaGate;
  enemy._inaGateAt = rt.t + .25;
  if (!rt.army.wallBetween(p, -1, enemy.pos, false)) return (enemy._inaGate = null);
  return (enemy._inaGate = p.x < HON_GATE_OUT.x + 1.5 ? HON_GATE_OUT : HON_INNER);
}
const inabayama = {
  // 共通の壁よけで視点を離し、残る手前の壁と軒だけ描画時に透かす。
  nearFade: true,
  jinkei: INABAYAMA_JIN,
  // 見出しは大きな出来事（討ち取り・勝ち負け・雨上がり・合図の火）だけ。行き先や構えの指示の見出しは出さない（kaito 10/23）。
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /討ち取|討死|勝|崩れ|城が開く|合図の火|雨が上がった|届かず|進めず/.test(t),
  // ミッション（kaito 10/23 1・49・50）。右上の一行は「何をするか」だけ。向き・行き先の字は書かない。
  lendBow: true, // 美濃攻めは弓を覚える戦（kaito の役割分担）。問屋で買っていなくても弓を貸す。
  noSiegeCards: true, // 右の曲輪の札（未見・様子不明）は出さない。字は右上の一行だけ（kaito 10/23）。
  // 稲生の水準（reports/inou-standard.md 10/25）：右上は任務の一行だけ。段の丸・味方の小旗・避ける札は出さない。
  missionSingleLine: true,
  hideMissionDots: true,
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  inouFeel: true, // 当たりは音・よろけ・血で返し、空振りは鳴らさない（player.js）。
  missions: ['この人と話そう', '火の印へ', 'さくを守れ', '山の上へ', '斎藤龍興の馬廻を討つ', '本丸に合図の火を放つ'],
  missionHeading(rt) {
    const F = rt.flags;
    if (F.ending) return '任務は達成。仲間と持ち場を守ろう';
    if (F.retreatMarked) {
      if (F.step === 3) return '声をひそめ、味方の後ろへ';
      return '仲間の後ろへ下がれ';
    }
    if (F.regroup && F.step === 2) return 'さくの旗へ戻ろう。仲間と並ぼう';
    // 右上の一行も詳しい札と同じ判定を使い、済んだ仕事へ戻さない。
    return this.taskText(rt, this.missions[this.missionOf(rt)]);
  },
  missionOf(rt) {
    const F = rt.flags, ph = rt.phase;
    if (ph === 'end') return 5;
    if (ph === 'honmaru') {
      if (F.sig) return 4;
      revealName(rt, '斎藤龍興'); return 4;
    }
    return ph === 'karamete' ? 3 : ph === 'ote' ? 2 : ph === 'burn' ? 1 : 0;
  },
  // 民は描画専用。兵の名簿・人数・当たり・戦功には入れない（war_people.js）。
  civilianCrowd: {
    bounds: { minX: -176, maxX: 176, minZ: -176, maxZ: 176 }, bands: CIVILIAN_BANDS,
    openCache: 0.3,   // 民の逃げ道の地面の調べを 30cm の格子で使い回す（war_people.js lightOpen。戦の計算の七割を占めていた）
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
    // 町家の炎は一・四と一・七。二以上を待つと、町が燃えても里の者が見物を続ける。
    // 焚き火（一・三）や松明（〇・四）とは分け、退く一歩の安全判定は近い火だけを見る。
    fireAlarm: { size: 1.4, radius: 140 },
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
  // 火付け後に共に戦う味方を一人示す。命令や戦力は変えない。
  rescueGuideTarget(rt) {
    const F = rt.flags;
    if (F.step !== 1 || F.lit < NEED || F.clearT === undefined || F.ending || F.regroup || F.retreatMarked) return null;
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
  // 搦手の細道は伏兵と守兵が続き、道の外へ逃げ場が無い。五戦目の受ける傷を五割五分に、戦わない間は少しずつ戻す（10/28 bot が登りの伏兵で倒れ続けた）。
  playerTaken: 0.55,
  playerRegen: 0.015,
  dodgeTurnLabel: (rt, right, touch) => `${touch ? '画面を' : ''}${right ? '右' : '左'}へ${touch ? 'なぞる' : '向く'}`,
  keepDestinationTask: true,
  // 曲がり角の下知を「この旗へ」で上書きせず、歩数は任務札の一か所にまとめる。
  keepFlagTravelTask: true,
  hideGuideSteps: true,
  namedGuideMarkers: true,
  travelGuideLabel(rt) {
    const F = rt.flags;
    if (F.retreatMarked) return '退き口の印へ';
    if (F.step === 1 && F.townSoundWait) return '町の出口の印へ';
    if (F.step === 1 && F.lit < NEED) return rt.G.lord ? '家の敵をたおせ' : '火の印の家へ';
    if (F.step === 1 && F.lit >= NEED) return F.townTarget && !gone(F.townTarget) ? '印の守兵へ' : '味方の旗へ';
    if (F.step === 2) return F.regroup ? '味方の旗へ' : F.holdArrived ? inabaSallyWait(rt) || 'さくの中の敵をたおせ' : 'さくの旗へ';
    if (inabaWoodGateWait(rt)) return '木戸前で仲間と並ぼう';
    if (F.step === 3) return F.karaGuideMarked
      ? F.karaGuide?.returning ? '道の中央へ' : F.karaGuide?.fighting ? '近い守兵へ' : '道の印へ'
      : '木戸の守りへ';
    if (F.step === 4) return F.sig ? inabaSignalDetour(rt) ? '建物の外の道へ' : '火の印の小屋へ' : '印の守兵へ';
    return '味方の旗へ';
  },
  groundRouteGuide: true,
  // 遠い角が画面外でも、今歩く道の上に短い案内を残す。
  // 角を回る順序は従来の案内と共有し、到着や兵の移動の判定は変えない。
  guidePath(rt, marker) {
    const F = rt.flags;
    const fire = F.step === 1 && marker?.guideSymbol === 'fire';
    const goal = fire ? marker.guideDestination?.() : F.step === 3 && marker?.id === 'karaGuide' ? F.karaGuide : null;
    if (!goal) return null;
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
  // 小地図では登っている裏道を残す。高さの違う大手・百曲りを重ねない。
  // 開いた全図では全ての道を読める。配列は設営前に一度だけ作り、使い回す。
  mapPaths: (rt, small) => small && rt.flags.step === 3 ? INABA_CLIMB_MAP : INABA_PATHS,
  introTaskFirst: true, // 人物紹介より先に、初めの行き先と勝つ条件を読めるようにする。
  introPeopleFolded: true,
  introText(rt) {
    return 'まず印の人、藤吉郎（とうきちろう）と話そう。'
      + (rt.G.lord ? '町では敵を払い、火付けの足軽を守ろう。' : '火の印の家へ。「火をつける」を押して三軒焼こう。')
      + '次は仲間とさくを守る。山では道の印をたどり、本丸の小屋に合図の火を付けよう。'
      + '七曲りは緩く、東の尾根道は急。今回は裏道の印へ。'
      + '三人衆は味方になると申し入れ、信長は人質を待たず瑞龍寺山へ出兵した。'
      + '兵数は仮の目安。裏道攻めは後世の伝えで、道筋と合図の火は遊びの補い。';
  },
  immediateTaskChanges: true, // 道へ戻る下知は、携帯の畳んだ任務にもすぐ出す。
  // 合図は各段の下知から鳴らす。「敵を退けよ」を味方の退却と誤読せず、裏道で自動の太鼓を鳴らさない。
  // 忍び用の quiet は遠景の兵も隠すため使わず、兵の数と乱戦は保つ。
  armySignals: false,
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
  // 稲生の標準（kaito 10/23）：小地図・足元の輪・浮かぶ字の札を出さず、行き先のピン・敵の頭上の▼・右上の任務一行に絞る。
  noControlsHelp: true,   // 操作の字は尾張の戦で覚える。この戦では出さない
  missionStyle: 'field',   // 敵は共通の刀、味方は旗。ピンは判定地点に固定する。
  noPlayerFoot: true,
  noFieldMap: true,
  hideArmyPeek: true,
  foeMarks: true,
  enemyTriangleSigns: true,
  missionPinCaption: '',
  keepTaskLabel: true,
  // 藤吉郎（28,104）と金華山の間を向いて立つ。両方が最初の画面に入る（10/28）。
  spawn: { x: 44, z: 112, heading: Math.atan2(-0.65, -0.76) },
  // 身の回りの当時の場（timeslip_field.js）。公記の強風は放火の日の記事で、八月十五日の開城日の天候ではない。
  // 井口の城下の往来は乾いて踏まれ、焼き払いの土埃が流れる。辻と木戸ほど倒れた槍・矢・斎藤方の旗が多い。
  // 置くのは城下（z 26 より南）だけ。家と寺の床、山の上の曲輪には置かない。
  timeslip: {
    wet: 0, dust: 0.9, trample: 0.3, debris: 0.9, arrows: 0.7,
    grass: 0x9c9c60, grassTints: [0xffffff, 0xe8dcaa, 0xccd09a], grassH: 1.05, tallGrass: 0.7,
    flagColors: [0xe2ded2, 0x2a2826, 0x3a4a6a],
    fights: [[26, 80, 30], [22, 52, 28], [24, 34, 22]],
    skip: (x, z) => z < 26 || Math.hypot(x - TERA.x, z - TERA.z) < 12 || HOUSES.some(([hx, hz]) => Math.abs(x - hx) < 6 && Math.abs(z - hz) < 5),
  },
  taskText(rt, text) {
    const F = rt.flags, it = rt.nearestInteract();
    text = text.replace(/藤吉郎の旗/g, '旗の人').replace(/鹿垣/g, 'さく').replace(/城兵/g, '城の敵').replace(/下知/g, '話');
    if (F.ending) return '任務は達成。仲間と持ち場を守ろう';
    if (F.retreatMarked || F.regroup && F.step !== 3) return text;
    if (F.step === 0) return it?.id === 'talk' ? '「話す」を押そう' : '近づいて話す';
    // 全ての守兵が退いた後は、新手待ちや交戦の案内で出口への下知を隠さない。
    if (F.step === 1 && F.townSoundWait) return '町の出口で仲間と並ぼう。合図の後、翌日の囲みへ';
    // 新手を待つ間は、敵のいない印や竹束を置く操作へ呼ばない。
    if (F.step === 1 && F.townWaiting) {
      if (F.kinoU.alive && rt.distTo(F.kinoU.pos) > 8) return '藤吉郎の旗へ戻ろう。仲間と新手に備えよう';
      return '旗の横で並ぼう。次の敵を待とう';
    }
    if (inabaWoodGateWait(rt)) return '木戸前で仲間と並ぼう。列がそろったら本丸へ';
    // 道の外では、竹束や近い守兵の案内より安全な足場を先にする。
    if (F.step === 3 && F.karaGuideMarked && F.karaGuide?.returning) return '道の印へ戻ろう。崖を横切らずに進もう';
    // 竹束の操作が火付けより先に選ばれる。町でも先に手を空ける。
    if (F.step === 1 && F.carry && F.lit < NEED && !rt.G.lord) return 'まず「竹束を据える」を長押し';
    if (F.step === 4 && F.sig && F.carry) return 'まず「竹束を据える」を長押し';
    // 道を歩く時は道案内を保ち、槍を交える時だけ手を空ける操作を優先する。
    if (F.carry && (F.step === 1 || F.step === 2 && F.holdArrived && !inabaSallyWait(rt)
      || F.step === 3 && (F.karaGuide?.fighting || F.guardOn && !F.karaGuideMarked)
      || F.step === 4 && !F.sig)) return 'まず「竹束を据える」を長押し';
    // 放火後も守兵がいる間は、その印へ案内する。
    if (F.step === 1 && F.lit >= NEED) return '印の守兵を仲間と追い払おう';
    if (F.step === 1 && rt.G.lord) return '家の敵をたおせ';
    // 最後の合図は、信長で遊ぶ時も本人が火を付ける。
    if ((F.step === 1 && F.lit < NEED && !rt.G.lord) || (F.step === 4 && F.sig)) {
      const fire = it && (F.step === 1 ? /^h[0-9]+$/.test(it.id) : it.id === 'sig');
      return fire ? `「${it.label}」を${it.hold ? '長押し' : '押そう'}`
        : F.step === 1 ? '火の印の家へ'
        : inabaSignalDetour(rt) ? '建物の外の道を回って、小屋の印へ' : '火の印の小屋へ';
    }
    // 集合・新手待ち・交戦の下知を、畳んだ任務でも区別する。
    if (F.step === 2 && F.karaWaiting) return 'さくの中で仲間を待て';
    if (F.step === 2) return !F.holdArrived ? 'さくの旗へ進め'
      : inabaSallyWait(rt) || 'さくの中の敵をたおせ';
    // 遠い先頭の状況より、自分の足元の道と守兵を案内する。
    if (F.step === 3 && F.karaGuideMarked) {
      const q = F.karaGuide;
      if (!q) return '藤吉郎の列について登ろう';
      // 敵の印と同じ相手を示し、道案内と戦う下知を食い違わせない。
      if (inabaClimbGuideEnemy(rt)) return '近い敵を仲間と追い払おう';
      const p = rt.player.u.pos, distance = Math.hypot(p.x - q.x, p.z - q.z);
      const steps = Math.max(1, Math.round(distance));
      // 遠くでは次の角を予告し、手前で曲がる向きを伝える。
      // 最後の角と到着時は、木戸前への案内と一歩進む案内を保つ。
      if (distance >= 1 && distance <= 8 && !q.lastCorner) {
        let corner = F.karaNext || 1;
        for (let i = 1; i < corner; i++) {
          if (Math.hypot(q.x - KARA_TRAIL[i][0], q.z - KARA_TRAIL[i][1]) < 0.2) { corner = i; break; }
        }
        const a = KARA_TRAIL[corner - 1], b = KARA_TRAIL[corner], c = KARA_TRAIL[corner + 1];
        if (a && b && c) {
          const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
          if (Math.abs(turn) >= 0.01) {
            const side = turn < 0 ? '左' : '右';
            return distance <= 5 ? `印で${side}へ曲がろう` : `次の角で${side}へ（あと${steps}歩ほど）`;
          }
        }
      }
      return distance < 1 ? '道の印の先へ一歩進もう'
        : distance > 8 && !q.lastCorner ? '道の印へすすもう'
        : `印の${q.lastCorner ? '木戸前' : '曲がり角'}へ（あと${steps}歩ほど）`;
    }
    if (F.step === 3) return '仲間と 木戸の敵を退けよう';
    if (F.step === 4 && !F.sig) return F.honTarget && !gone(F.honTarget)
      ? `印の${F.honTarget.name}を仲間と退けよう` : '仲間と 本丸の敵を退けよう';
    return text;
  },
  treatmentHouses(rt) { return rt.flags.houses; },
  waitOrderLabel: (rt, reached) => reached ? inabaSallyWait(rt) || 'さくの中の敵をたおせ' : 'さくの旗へ進め',
  waitTravelLabel: () => 'さくの旗へ進め',
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
  // 稲生の水準：倒す段の相手（頭上の▼・ピン・小さな地図で同じ一人）。
  missionSignTarget(rt) {
    const F = rt.flags;
    if (F.ending || F.retreatMarked) return null;
    if (F.step === 4) {
      // 柵の向こうの相手は、口を通るまで▼で指さない（ピンが口を指す）。
      const u = nearestFoeOf(rt, honTargetGroup(rt));
      return u && !honGateStep(rt, u) ? u : null;
    }
    if (F.step === 3 && F.guardOn && !gone(F.kguard) && inabaAtWoodGate(rt)) return nearestFoeOf(rt, F.kguard);
    if (F.step === 3) return inabaClimbGuideEnemy(rt);
    if (F.step === 2) return this.objectiveEnemies(rt)[0] || null;
    if (F.step === 1 && F.clearT !== undefined) return nearestFoeOf(rt, F.townGuards);
    return null;
  },
  // 名のある守り（龍興の馬廻）の頭は、▼を大きくして目立たせる（稲生 5）。
  commanderTarget(rt) {
    const g = honTargetGroup(rt);
    if (!g || g !== rt.flags.tatsu) return null;
    for (const u of g.units) if (inabaFoe(u) && (u.type === 'samurai' || u.type === 'busho')) return honGateStep(rt, u) ? null : u;
    return null;
  },
  // 戦いの最中も次の行き先を保ち、敵の近さでピンを消さない。
  missionPin(rt) {
    const F = rt.flags;
    if (F.ending) return null;
    // 倒す段は、ピンを一番近い残りの敵の足元へ（稲生 4）。柵の向こうなら口を先に指す。
    // 槍が届いたら頭上の▼に任せ、ピンは消す。
    if (!F.retreatMarked && !F.regroup && (F.step === 4 && !F.sig || F.step === 1 && F.clearT !== undefined ||
        F.step === 3 && F.guardOn && !gone(F.kguard) && inabaAtWoodGate(rt))) {
      const enemy = F.step === 4 ? nearestFoeOf(rt, honTargetGroup(rt)) : this.missionSignTarget(rt);
      if (enemy) {
        const p = rt.player;
        if (p.inRange && p.rangeCueTarget === enemy) return null;
        const pin = F.foePin || (F.foePin = { r: .2, hide: .2, always: true, silent: true, arrow: false });
        const gate = F.step === 4 ? honGateStep(rt, enemy) : null;
        pin.marker = null; pin.key = gate ? 'honGate' : 'foe';
        pin.unit = gate ? null : enemy; pin.enemy = !gate; pin.approach = true;
        pin.follow = !gate; pin.footRing = false; pin.fire = false; pin.gate = !!gate;
        pin.defend = false; pin.waiting = false;
        pin.x = gate ? gate.x : enemy.pos.x; pin.z = gate ? gate.z : enemy.pos.z;
        pin.r = gate ? 2 : .2; pin.hide = gate ? 1 : .2;
        return pin;
      }
    }
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
    pin.allyGather = id === 'kino' && !!F.townWaiting;
    pin.fire = marker.guideSymbol === 'fire';
    pin.gate = marker.guideSymbol === 'gate';
    pin.x = pin.unit ? pin.unit.pos.x : pos.x; pin.z = pin.unit ? pin.unit.pos.z : pos.z;
    // 「さくを守れ」の段は、守る所に刺したまま。味方はその旗の下へ集まる（稲生 3）。
    pin.defend = pin.waiting = id === 'holdFlag';
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
    // 持ち場にいる間は旗へ引き返させず、鹿垣の前の城兵を迎える。
    if (F.step === 2) return F.regroup ? 'kino' : F.holdArrived ? null : 'holdFlag';
    // 山道では、離れた旗へ直進せず、次の折れをたどって列へ戻る。
    if (F.step === 3 && F.karaGuideMarked) return 'karaGuide';
    if (F.step === 3 && (!F.guardOn || gone(F.kguard))) return F.guardOn ? 'kino' : 'kido';
    // 火付けの持ち場まで来たら、遠い旗へ呼び戻さない。
    if (F.step === 4 && F.sig) return 'sig';
    if (F.step === 1 && F.clearT !== undefined) return F.townTarget && !gone(F.townTarget) ? 'townGuard' : 'kino';
    if (F.step === 1 && F.lit < NEED) return rt.G.lord ? (F.townTarget && !gone(F.townTarget) ? 'townGuard' : F.houseTargets?.[0] ? 'h' + F.houseTargets[0].i : 'kino') : F.houseTargets?.[0] ? 'h' + F.houseTargets[0].i : 'kino';
    if (F.step === 3 && F.guardOn) return 'kguard';
    if (F.step === 4) return F.sig ? 'sig' : 'honGuard';
    return 'kino';
  },
  world: {
    syntheticSound: true, // 鬨・鉄砲・馬・川も、録音に替えず合成音でそろえる。
    // 合図は台詞と任務に結び付ける。環境音の太鼓・法螺が下知と混ざるのを防ぐ。
    ambientSignals: false,
    // 出どころのない遠景の叫びで、裏道の警戒声や任務の合図を紛らわせない。
    // 実際の兵・乱戦の声と、各段の下知による合成音は引き続き鳴らす。
    ambientWarCalls: false,
    // 裏道の木戸を破っただけで味方の鬨を足さない。本丸の懸かれと返しは下知から鳴らす。
    gateBreakSound: 'gateBreakWood',
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
    meleeGroundedFeet: true, // 踏み込む両足も描く地面へ据える。攻撃の判定は保つ。
    // 高画質の落ち影にも足元の柔らかい陰を重ねる。接触の土煙は見た目だけ。
    contactShadows: true,
    contactShadowRange: 55, // 町の向こうの実兵も既存の影の一束へ入れる。
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
    // 道に迷い直した時も案内を出せるようにする。同文は三十秒以上あける。
    noticeRepeatGap: 30,
    // 行き止まりの案内も今の持ち場に合わせ、済んだ旗や消えた道の印へ戻さない。
    blockedHint: (rt) => {
      const F = rt.flags;
      if (F.retreatMarked) return '壁や崖は越えられない。来た道から、退き口の印へ下がれ';
      if (F.step === 0) return '家の間の道を通り、藤吉郎の旗へ近づけ';
      if (F.step === 1 && F.townWaiting) return '家の間の道を通り、藤吉郎の旗へ戻れ。仲間と新手に備えよ';
      if (F.step === 1) return F.lit < NEED
        ? rt.G.lord ? '家の間の道を通れ。印のそばで火付けの足軽を守れ' : '家の間の道を通れ。火を放つ家の印へ進め'
        : '家の間の道を通れ。印の守兵を仲間と追い払え';
      if (F.step === 2) return 'さくを越えて追うな。内側の仲間と並べ';
      if (F.step === 3) return F.karaGuideMarked
        ? '急な山肌は登れない。道の印へ戻り、道の内を進め'
        : '切岸は登れない。道を通り、仲間と木戸の守りを追い払え';
      return F.sig ? '塀を回り、小屋の手前の印へ進め' : '塀を回り、印の守兵を仲間と追い払え';
    },
    seed: 1567,
    terrainTags: true,
    // 裏道の外も、歩く兵と遠い備えの足を描く三角形にそろえる。
    terrainTriangles: true,
    distantTerrainTriangles: true,
    // 写真用に直接描く時も、地面の選別より先に視点の四隅まで山肌の上へ戻す。
    terrainContactView: true,
    wind: [0.5, 0.86],   // 公記にあるのは強風。風向きは不明なので、演出用の仮設定。
    windStrength: 1.6,   // 放火の日の強風。翌日の囲みへ移る時は仮の通常風へ戻す。
    // 放火・包囲の時刻は記録にない。見通しを保つ日中の光は遊びの仮設定。
    time: 'day',
    dayBounce: 1.38,
    bounceGround: 0x82745e,
    muddy: 0.2,
    fireLightLift: 2.6,
    // 山道では麓の火からの高さも測り、足元で燃えるような音にしない。
    fireSoundHeight: true,
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
    waterSlow: true,   // 岸の浅い水では遅く、馬はもっと遅い。
    // 岐阜市の文化的景観保存計画では長良川が北の堀として機能したとする。
    // 減速だけで深い本流まで歩いて横断できていたため、本人も兵も既存の水深判定を使う。
    // 水深と渡れる限界は遊びの仮値。町・山道・舟着きは城側の岸にあり、進軍路は変えない。
    riverCross: true,
    // 北側を天然の堀として流れ、西へ回る長良川。西側の東岸と舟着きの関係は保つ。
    // 水面の全幅四十八歩は縮めた戦場用の仮値。当時の川幅・河道の実測復元ではない。
    // 北と西は一続きの水面にまとめ、材質と波の仕組みを使い回す。
    // 岸の高さで水面も下がるため、掘り下げ量一・四では平坦な本流も水深約〇・七六となる。
    // 歩ける限界〇・八五を上回る深みを確保する。三・二は当時の実測水深ではなく、遊びの川床の値。
    // 高い裏道では、水面との高低差も川音へ反映する。
    streams: [{ pts: NAGARA, w: NAGARA_WIDTH, depth: 3.2, soundHeight: true }],
    slopeForest: 0.65,   // 林床と露岩を残し、斜面全体を樹冠の緑で覆い切らない。
    trees: 700,
    // 岐阜市の調査では、戦国期以前から江戸期まで稲葉山はアカマツ主体。
    // https://www.city.gifu.lg.jp/_res/projects/default_project/_page_/001/005/558/seibi3.4s.pdf
    // 高画質だけ杉主体の既定配分を改める。累積の境界なので松は約七割、細かな割合は推定。
    // 本数・配置・伐採した斜面は保ち、共通の松の形と材質を使う。
    treeMix: S.quality === 'high' ? { sugi: 0.08, matsu: 0.78 } : undefined,
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
    nearGrassClumpBase: 0.24,
    nearGrassClumpGain: 1.65,
    nearGrassMinCover: 0.045,
    curvedNearGrass: true,
    tuftTint: 0x92996a,
    nearGrassTint: 0x92996a,
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
    // 木の総数は保ち、伐採された城の斜面から周辺の林へ寄せる。竹の固まりは山肌に置かない。
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
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
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
    // 公記の八月一日は内応の申し入れ。放火の日付は史実札と同じく未詳とする。
    rt.banner('井口の町', '放火の日付・時刻・風向きは不明。強風は公記の記録、日中の光と風向きは仮設定');
    // ---- 床の層（floors.js）を作り直す。搦手の物見櫓はここへ床・梯子を登録する ----
    flReset();
    const high = true;
    // 西の仮道を、北側を回る実在の水手道と取り違えない。櫓の位置・形は推定。
    F.tower = monomi(rt, TOWER.x, TOWER.z, { name: '西の裏道の物見櫓', logFrame: true, height: 8.8, boarded: false, mon: 'saito', team: 1 });
    rt.scene.add(F.tower.mesh);
    F.towerArchers = enemyGroup(rt, { fixed: true, faction: 'saito', name: '物見櫓の射手', anchor: { x: TOWER.x, z: TOWER.z }, facing: TOWER_FACING, order: 'hold', aggro: 10, width: 2, morale: 80 },
      [{ type: 'bow', n: 2 }]);
    // 射手を物見櫓の床の高さに乗せる（floors.js の床の上に立つ扱い。以後は groundAt が高さを保つ）
    for (const u of F.towerArchers.units) { u.pos.y = F.tower.topY; if (u.mesh) u.mesh.position.y = F.tower.topY; }
    // 登り降りは登録済みの梯子を伝って行う。上下へ瞬間移動する札は置かない。
    // ---- 城の縄張り（曲輪）：本丸・大手の三の丸・二の丸を段に、腰曲輪は喰違いの柵で囲う ----
    // 本丸から出丸まで縁に土塁と柵。三の丸の大手だけ既存の喰違いの柵を使う。
    const castleLook = high ? {
      ...INABAYAMA_PLAN, year: 1567,
      // 主殿も山麓館と同じ中央の広い引き分け障子にし、縁側への出入りを揃える推定。
      // 外壁・上がり口・動く戸は共通の入口指定から作る。
      lordSeat: { ...INABAYAMA_PLAN.lordSeat, earth: 0xb1a085, doorX: 0, entryW: 2.4 },
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
    // 堂の外形だけで塞がず、内陣・外陣と格子の引き戸を持つ共通の室内を使う。
    // 本堂の正面は住居用の狭い戸口でなく、中央に広い引き分けの格子戸を構える推定。
    // 外壁の開口・縁側からの上がり口・動く戸の幅は共通処理で一緒に揃える。
    goten(rt, TERA.x, TERA.z, {
      w: 8, d: 6, team: 1, name: '井口の寺の本堂', kind: 'hondo',
      naka: true, profile: 'inabayama', templePaper: true, noTarget: true,
      ...(high ? { doorX: 0, entryW: 2.4 } : {}),
    });
    rt.scene.add(tawara(W, 12, 72, 0.3, 5), tawara(W, -2, 52, -0.4, 4));
    // 町では火付けの下知を優先する。登り道の説明は裏道へ回る時に出す。
    // 裏道の切岸は細分した地面そのもので表す。重ねた土の帯は
    // 折れの内外で別の高さを拾い、山腹へ浮く庇のように張り出す。
    // 写真の幟は屋根と井楼より低い。高画質では主殿・蔵・通路を避けて縁へ分散する。
    const summitFlags = high ? [[HON.x - 15, HON.z + 7], [HON.x + 15, HON.z - 3], [HON.x, HON.z - 11]]
      : [[HON.x - 8, HON.z + 4], [HON.x + 8, HON.z + 4], [HON.x, HON.z - 2]];
    for (const [x, z] of summitFlags) rt.scene.add(nobori(W, x, z, 'saito', 5.5));
    // ---- 大手の木戸（七曲りの道を切る柵。口は開いている） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    // この別置きの柵にも裏道の口を空ける。旧端の西二十六は裏道の中心に重なる。
    // 西二十まで引き、道の肩四・四歩と杭・控え木の余白を保つ。
    noT(wallLine(rt, [[-20, OTE.z + 4.4], [-4, OTE.z]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    noT(wallLine(rt, [[4, OTE.z], [26, OTE.z + 6]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    rt.scene.add(kabukimon(W, OTE.x, OTE.z, 7.4, 0));
    // 岐阜市の令和六年度発掘成果：一ノ門・上台所には道三期とみられる巨石石垣がある。
    // https://www.city.gifu.lg.jp/kankoubunka/bunkazai/1005557/1021639/1030969.html
    // 全山を土だけの城にせず、山頂入口の脇に自然石を補う。位置・高さ・石の割付は推定。
    // 入口の幅と当たりは保つ。設営時に共通の石材を一つの束へまとめる。
    const entranceStone = makeKitBatch();
    for (const x of [IRI.x - 6, IRI.x + 6]) {
      ishigaki(W, [[x, IRI.z + 3], [x, IRI.z - 3]], {
        kind: 'nozura', top: 0.6, minH: 1, maxH: 1.6, big: 1.6,
        out: x < IRI.x ? 1 : -1, batch: entranceStone, noKit: true,
      });
    }
    if (high) {
      // 同調査の上台所では「コの字状」の巨石石垣と小さい石の石垣が同時に築かれていた。
      // 入口の二本だけでは表せなかった折れを、大手の西の肩へ補う。位置・寸法は推定。
      // 中央の登り道・木戸・守備兵の平場を空け、既存の石材とまとめ描画を使う。
      ishigaki(W, [[OTE.x - 17, OTE.z - 2], [OTE.x - 17, OTE.z - 6],
        [OTE.x - 12, OTE.z - 6], [OTE.x - 12, OTE.z - 2]], {
        kind: 'nozura', top: 1.2, minH: 1.5, maxH: 2.2, big: 1.8,
        out: 1, batch: entranceStone, noKit: true,
      });
      // 同調査は上台所の入口に道三期の城門があった可能性を示す。
      // 石垣だけの囲いで終わらせず、開いた側に小さな冠木門を補う。
      // 位置・幅・形式は推定。瓦屋根は付けず、扉は開いて通り幅を保つ。
      // 共通の門の形と木材を設営時にだけ使い、毎コマの処理は増やさない。
      const gateX = OTE.x - 14.5, gateZ = OTE.z - 2;
      rt.scene.add(kabukimon(W, gateX, gateZ, 3.2, 0,
        { roof: false, groundedGate: true, slopeDoorBottom: true, openFlat: true }));
      // 柱と控柱だけに当たりを付け、中央を新たな関門にはしない。
      for (const dx of [-1.77, 1.77]) for (const dz of [0, -1.6])
        solidSeg(gateX + dx - .1, gateZ + dz, gateX + dx + .1, gateZ + dz, .2);
    }
    finalizeKitBatch(rt, entranceStone);
    // 西の虎口。曲輪の縁と当たりを同じ縄張りから作り、門幅だけを空ける。
    rt.scene.add(kabukimon(W, -20, -116, 7, Math.PI / 2));
    rt.scene.add(kabukimon(W, DEMARU.x, DEMARU.z - 10, 6, 0));
    rt.scene.add(kabukimon(W, YAKATA.x + 17, YAKATA.z, 6, Math.PI / 2, { yakui: true }));   // 館の表門は薬医門
    // 小曲輪の東は時期を確定できない絵図の石垣を採らず、切岸と土塀で補う。
    // 主殿（板葺きの木造。天守・二重櫓は置かない）と、物見の櫓（木造）
    // 主殿は縄張り（castles/inabayama.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に龍興（kaito 10/2）
    // 山頂の曲輪：主殿のほかに、遠侍（板葺きの御殿）・兵糧蔵・長屋を構えて、御殿と蔵と詰所のある城らしくする（kaito 10/2 の見回り）
    const BOOK_BOARDS = [0xb8a688, 0xa89678, 0xc4b292, 0xae9c7e];   // 白茶けた古板の色を共用する。
    // 遠侍の表口も取次へ通る障子口と同じ二・一歩幅にする推定の納まり。
    // 外壁・上がり口・動く障子へ同じ幅を渡し、開いた戸も左右の壁幅へ収める。
    goten(rt, HON.x + 13, HON.z + 5, {
      w: 7, d: 5, tile: false, team: 1, name: '遠侍', kind: 'tamari',
      fieldFort: true, weatheredBoards: true, boardRoofColors: BOOK_BOARDS,
      ...(high ? { doorX: 0, entryW: 2.1 } : {}),
      hp: 600, naka: true, profile: 'inabayama', noTarget: true,
    });
    // 遠侍・館は古板の外観と座敷を両立し、実務の小屋は縦板壁と連子窓にする。
    // 既存の部品の指定だけを使い、室内の床・戸口と建物の位置は保つ。
    // 小さな板倉・番所は玄関を中央へ寄せ、左右に引く板戸と敷居を壁幅へ収める。
    // 五歩幅の小屋で従来の片寄った戸口を使うと、開いた右の戸が妻壁の外へ出る。
    // 妻側まで板壁で揃える。居館用の障子面を残さず、裏の小さな連子窓で明かりを取る。
    // 五歩幅の番所・兵糧蔵は、内側の板戸と同じ二・〇五歩の玄関口にする。
    // 外壁・上がり台・開閉する板戸へ同じ幅を渡し、荷運びや出入りの口を細めない。
    // 左右へ引いた戸と敷居は、内寸四・七歩の隅柱より内へ収める。
    const serviceLook = high ? {
      fieldFort: true, weatheredBoards: true, boardRoofColors: BOOK_BOARDS,
      utilityBoardWalls: true, doorX: 0, entryW: 2.05,
    } : {};
    // 裏道から離した蔵の板床へ俵を載せ、入口の土間と通り道を空ける。
    const riceStore = goten(rt, HON.x - 12, HON.z - 9, { w: 5, d: 4, tile: false, team: 1, name: '兵糧蔵', kind: 'kura', ...serviceLook, oku: 0, naka: true, profile: 'inabayama', noTarget: true });
    if (!high) {
      const rice = tawara(W, HON.x - 10.7, HON.z - 10.1, 0, 3);
      const riceFloor = riceStore.naka.levels[0];
      rice.position.y = riceFloor.y + (riceFloor.layout.rooms[0].y || 0); rt.scene.add(rice);
    }
    // 長屋の玄関は内側の板戸と同じ二・一歩の引き分け口にする推定。
    // 外壁の開口・上がり台・動く板戸と当たりへ共通の幅を渡し、入口だけ細くしない。
    goten(rt, HON.x - 6, HON.z + 8, { w: 9, d: 4, tile: false, team: 1, name: '兵の長屋', kind: 'nagaya', ...serviceLook, ...(high ? { entryW: 2.1 } : {}), naka: true, profile: 'inabayama', noTarget: true });
    // 番所・厩・小祠・山麓館は斎藤期の美濃から推定。信長の庭園や天守を先取りしない。
    goten(rt, NI.x - 5, NI.z + 2, { w: 5, d: 4, tile: false, team: 1, name: '二の丸の番所', kind: 'bansho', ...serviceLook, naka: true, profile: 'inabayama', noTarget: true });
    // 小祠は内側の板壁と外側も揃え、塞がった妻壁の飾り障子を残さない。
    // 裏の連子窓は外壁・内壁・当たりを同じ開口にし、格子の玄関と神前の引き戸は保つ。
    // 玄関も神前の格子戸と同じ一・五歩幅にし、外の口だけ十センチ狭くしない。
    // 外壁・上がり台・敷居と可動戸へ共通の幅を渡し、左右の引き先も内幅へ収める。
    goten(rt, MATSU.x + 6, MATSU.z - 5, { w: 4, d: 3, tile: false, team: 1, name: '小さな祠', kind: 'shrine', ...(high ? { doorX: 0, entryW: 1.5, utilityBoardWalls: true } : {}), naka: true, profile: 'inabayama', noTarget: true });
    goten(rt, DEMARU.x - 6, DEMARU.z + 3, { w: 5, d: 4, tile: false, team: 1, name: '出丸の番所', kind: 'bansho', ...serviceLook, naka: true, profile: 'inabayama', noTarget: true });
    // 館の表口は中央の広い引き分け障子とする推定。外壁・石段・玄関の戸と
    // 広間への障子口を同じ軸へ揃え、片寄った狭い口から入らせない。
    F.manor = goten(rt, YAKATA.x - 2, YAKATA.z - 5, {
      w: 12, d: 7, tile: false, team: 1, name: '斎藤の山麓館',
      fieldFort: true, weatheredBoards: true, boardRoofColors: BOOK_BOARDS,
      naka: true, profile: 'inabayama', noTarget: true, doorFire: false,
      ...(high ? { doorX: 0, entryW: 2.4 } : {}),
    });
    const lifeBatch = makeKitBatch();
    // 厩を尾根に沿って向け、長い屋根を平場へ収めながら東側の通り道を空ける。
    const stable = kuruwaBldg(W, 'umaya', UMAYA.x - (high ? 7 : 8), UMAYA.z, high ? Math.PI / 2 : 0, { batch: lifeBatch, ita: high, boardRoof: high, openStable: high });
    if (!stable.isBatchedPart) rt.scene.add(stable);
    if (high) {
      buildInabaWardLife(rt, lifeBatch);
      buildInabaCisterns(rt);
    }
    finalizeKitBatch(rt, lifeBatch);
    monomi(rt, HON.x + 12, HON.z - 9, { name: '本丸の井楼', logFrame: high, ...(high ? { height: 10, boarded: false, mon: 'saito', team: 1 } : {}) });
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
    // 同館の発掘成果では二ノ門は信長期の新設。斎藤期へ先取りせず、
    // 遊びの道筋は保ち、ここは篝火のある通路として描く。
    for (const [x, z] of [[NIMON.x - 2.6, NIMON.z + 1.6], [NIMON.x + 2.6, NIMON.z - 1.6]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.2 }); }
    rt.scene.add(nobori(W, IRI.x + 5, IRI.z - 3, 'saito', 5.5), nobori(W, NAKA.x - 4, NAKA.z + 3, 'saito', 5.5));
    // 城の見栄え：大手の前に逆茂木、木戸に篝火
    {
      rt.scene.add(sakamogi(W, OTE.x - 13, OTE.z + 9, 0.2, 7), sakamogi(W, OTE.x + 13, OTE.z + 9, -0.2, 7));
      for (const [x, z] of [[OTE.x - 5.5, OTE.z + 2], [OTE.x + 5.5, OTE.z + 2]]) { rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { h: 1.4 }); }
      // 本丸の守備は主殿前・馬廻・控えの実兵で示す。別の大軍を重ねない。
      // 総大将・斎藤龍興は主殿の中（天守の無い城。高遠の盛信と同じ作り）。旗本が縁側の上がり口を守り、踏み込むまで討てない
      F.keep = makeLordKeep(rt, {
        name: '斎藤龍興', spot: { x: HON.x + 2, z: HON.z - 6 }, mouth: { x: HON.x + 2, z: HON.z - 0.5 }, facing: SHUDEN_FACING, guardN: 5,
        faction: 'saito', flag: 'saito', hat: 'kabuto_w', haori: 0x2e3a2a,
        onReach: () => this.reachTatsu(rt),
      });
      if (F.keep.lord) { F.keep.lord.mustLive = true; F.keep.lord.noTarget = true; }
      F.keep.guard.noRout = false; F.keep.guard.formation = 'yari';
      for (const g of F.keep.kin) g.noRout = false;
      // 主殿の前の馬廻（見上げに来れば旗が見える。寄り過ぎなければ打って出ない）
      F.tatsu = enemyGroup(rt, { fixed: true, faction: 'saito', name: '斎藤龍興の馬廻', anchor: { x: HON_MAMORI[0].x, z: HON_MAMORI[0].z }, facing: HON_MAMORI[0].facing, order: 'hold', aggro: 3, width: 6, morale: 100, fleeDir: { x: 0, z: -1 } },
        dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 2 }], { flag: 'saito' }));
      // 城主は居所の隊の頭。馬廻は別の組頭が指揮する。
    }
    // 長屋の中と遠侍の軒際に残っていた幟を外へ。井楼脇の幟とも重ねない。
    const wardFlags = high ? [[HON.x + 17, HON.z - 8], [OTE.x - 8, OTE.z - 6], [-30, -120]]
      : [[HON.x - 4, HON.z + 10], [HON.x + 10, HON.z + 2], [OTE.x - 8, OTE.z - 6], [OTE.x + 8, OTE.z - 6], [-30, -120]];
    for (const [x, z] of wardFlags) rt.scene.add(nobori(W, x, z, 'saito', 5.5));
    // 中枢曲輪の道の上の小屋は置かず、番所は平場の脇へ寄せる。
    if (high) goten(rt, 22, -84, {
      w: 6, d: 4, rot: -0.3, tile: false, fieldFort: true, weatheredBoards: true, utilityBoardWalls: true,
      boardRoofColors: [0x746650, 0x85745d, 0x6a604f, 0x958066, 0x7c705d],
      name: '中枢曲輪の番所', kind: 'bansho', team: 1, naka: true,
      // 六歩幅の番所も、内側の板戸と玄関の開口を揃える。
      profile: 'inabayama', doorX: 0, entryW: 2.1, doorFire: false, noTarget: true,
    });
    else rt.scene.add(hut(W, 22, -84, 6, 4, -0.3, { wall: 0x6a5238 }));
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
    // 町と麓の守兵も、大手に割り振った仮の千人の一部として表示する。
    // 山上の備だけでは、放火と出撃の戦いの損耗が総勢へ全く反映されない。
    // 表示専用の参照を設営時にまとめ、兵・命令・乱戦の人数は変えない。
    F.oteForceGroups = [...F.townGuards, F.ote, F.ote2];
    // 最初の折れの先で迎える。場面替え直後の味方の列へ守兵を重ねない。
    // 登り口の守りは一組だけ（小さな斬り合いを重ねて搦手を長くしない。一つの戦は4〜7分）。
    F.climbGuards = [0.25].map((t, i) => enemyGroup(rt, { fixed: true, faction: 'saito',
      name: i ? '裏道の下の段の守り' : '裏道の登り口の守り',
      anchor: { x: KARA_TRAIL[1][0] + (KARA_TRAIL[2][0] - KARA_TRAIL[1][0]) * t, z: KARA_TRAIL[1][1] + (KARA_TRAIL[2][1] - KARA_TRAIL[1][1]) * t },
      facing: Math.PI / 2, order: 'hold', aggro: 0, width: 2, morale: 85, noAI: true, historicalOrders: true }, [{ type: 'ashigaru', n: 5 }]));
    // 物見の後ろの見回りの組。細い道の上で列の頭とぶつかる（裏道の一番の斬り合い）
    F.patrol = enemyGroup(rt, { fixed: true, faction: 'saito', name: '裏道の見回りの組', anchor: { x: KARA[1][0] + (KARA_LEGS[1][1][0] - KARA[1][0]) * 0.22, z: KARA[1][1] + (KARA_LEGS[1][1][1] - KARA[1][1]) * 0.22 }, facing: PATROL_FACING, order: 'hold', aggro: 0, width: 3, morale: 75, noAI: true, historicalOrders: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }], { flag: 'saito' }));
    F.kguard = enemyGroup(rt, { fixed: true, faction: 'saito', name: '搦手の守り', anchor: { ...KIDO_MAMORI }, facing: KIDO_FACING, order: 'hold', aggro: 14, width: 8, morale: 90, fleeDir: { x: 1, z: 0 }, formation: 'yari' },
      // 木戸前の最後の折れは上の段の鉄砲二挺にも撃たれる。木戸の守りの鉄砲は一挺にし、槍の守りと斬り合える間を残す（10/28）。
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 1 }]);
    F.scout = enemyGroup(rt, { fixed: true, faction: 'saito', name: '斎藤の物見', anchor: { x: KARA[1][0], z: KARA[1][1] }, facing: SCOUT_FACING, order: 'hold', aggro: 10, width: 2, morale: 70, fleeDir: { x: 0.4, z: -1 } },
        [{ type: 'ashigaru', n: 2 }]);
    F.ambush = enemyGroup(rt, { fixed: true, faction: 'saito', name: '岩陰の伏兵', ambush: true, anchor: { x: KARA[2][0], z: KARA[2][1] }, facing: AMBUSH_FACING, order: 'hold', aggro: 12, width: 3, morale: 80, fleeDir: { x: 0.5, z: -1 }, formation: 'yari' },
          dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4 }], { flag: 'saito' }));
    F.ambushGun = enemyGroup(rt, { fixed: true, faction: 'saito', name: '上の段の鉄砲', anchor: { ...UPPER_GUN_MAMORI }, facing: UPPER_GUN_FACING, order: 'hold', aggro: 30, width: 2, morale: 70, fleeDir: { x: 0.5, z: -1 } },
          [{ type: 'gun', n: 2 }]);
    // 本丸の旗本は持ち場を離れない（共通の寄せで山の下まで追って来て、本丸が空になっていた。10/28）。
    F.hata = [enemyGroup(rt, { fixed: true, faction: 'saito', name: '本丸の旗本', anchor: { x: HON_MAMORI[1].x, z: HON_MAMORI[1].z }, facing: HON_MAMORI[1].facing, order: 'hold', width: 4, aggro: 8, morale: 90, formation: 'yari', historicalOrders: true }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }]), enemyGroup(rt, { fixed: true, faction: 'saito', name: '御殿前の控え', anchor: { x: HON_MAMORI[2].x, z: HON_MAMORI[2].z }, facing: HON_MAMORI[2].facing, order: 'hold', width: 4, aggro: 6, morale: 90, formation: 'yari', historicalOrders: true }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }])];
    // 合図の前に退ける守りを一度だけ束ね、任務と印と自動操作で共有する。
    F.honGuards = [...F.hata, F.tatsu, F.keep.guard];
    // 山道と主殿の別組も、それぞれ仮の四百・千二百の内数として損耗表示へ結ぶ。
    // 主殿入口の旗本は備え表の接続先なので重ねない。兵・命令・乱戦は変えない。
    // 設営時に参照をまとめ、表示を更新するたびに配列を作らない。
    F.saitoForceGroups = {
      ibHineno: F.oteForceGroups,
      ibWater: [...F.climbGuards, F.scout, F.patrol, F.ambush, F.koshiGuard, F.kguard, F.ambushGun, F.towerArchers].filter(Boolean),
      ibTatsu: [...F.hata, F.tatsu, ...F.keep.kin],
    };
    F.nGun = allyGroup(rt, { fixed: true, name: '丹羽の鉄砲衆', anchor: { x: 2, z: 112 }, facing: Math.PI, width: 8, aggro: 4, formation: 'line' }, dress([{ type: 'gun', n: 4 }], ODA));
    F.torchG = allyGroup(rt, { fixed: true, name: '火付けの足軽', anchor: { x: 26, z: 110 }, facing: Math.PI, width: 2, aggro: 0 }, dress([{ type: 'ashigaru', n: 2, o: { weapon: 'none' } }], ODA)); F.torchQueue = [];
    // 公記に確かな総勢はなく、備え表の仮数の内訳として扱う。
    // https://ja.wikisource.org/wiki/信長公記 （首巻「いなは山御取候事」）
    // 火付け組は藤吉郎、鉄砲組は丹羽の内数。別組の損耗も表示へ含め、総勢へ重ねて足さない。
    // 設営時だけ参照を束ね、戦う兵・命令・毎コマの割り当ては増やさない。
    F.odaForceGroups = { ibKino: [F.torchG], ibNiwa: [F.nGun] };
    for (const g of [F.town2, F.ote, F.ote2, F.kguard, F.scout, F.ambush, F.ambushGun]) { g.formation = 'yari'; g.yariRanks = Math.max(2, Math.ceil(g.count / 6)); g.aggro = Math.min(g.aggro, 10); }
    for (const g of [F.town, ...F.hata, F.tatsu]) { g.formation = 'yari'; g.yariRanks = Math.max(2, Math.ceil(g.count / 6)); }
    F.town2.sent = false; F.ote2.sent = false;
    // 合図の小屋も中へ入れる板倉にする推定復元。位置と外寸、外から火を付ける札は保つ。
    // 小さな幅に合わせた板戸を左右へ引き、板床・梁・蓋箱は共通の室内で使い回す。
    // 戸の重なりと当たりで狭まる分を見込み、荷を持って通る口に余裕を取る。
    // 内幅二・七歩に、全開の戸二・三歩と左右二十センチの逃げを収める。
    if (high) goten(rt, HON.x + 8, HON.z + 9, {
      w: 3, d: 2, tile: false, fieldFort: true, weatheredBoards: true, utilityBoardWalls: true,
      name: '本丸の小さな板倉', kind: 'kura', team: 1, naka: true, profile: 'inabayama',
      doorX: 0, entryW: 1.15, doorFire: false, noTarget: true,
    });
    else rt.scene.add(hut(W, HON.x + 8, HON.z + 9, 3, 2, 0));
    // ---- 大軍（軽い作り）：瑞龍寺山の信長の本陣、美濃三人衆、城を囲む織田勢 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    // 瑞龍寺山の本陣：信長と旗本（控えは周りの大軍。信長で遊ぶ時は旗本だけ）
    F.odaCamp = camp(rt, { x: ZUI.x, z: ZUI.z, facing: ZUI_FACING, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 15, reserve: 0, runTo: { x: -25, z: 100 } });
    for (const [x, z, k] of [[ZUI.x - 10, ZUI.z + 8, 'oda'], [ZUI.x - 4, ZUI.z + 9, 'eiraku'], [ZUI.x + 4, ZUI.z + 9, 'oda'], [ZUI.x + 10, ZUI.z + 8, 'eiraku']]) rt.scene.add(nobori(W, x, z, k, 6.5));
    DA(ZUI.x - 16, ZUI.z + 20, 26, 12, 220, ZUI_FACING, 0x2a2622, 'oda', 15671);
    DA(ZUI.x + 14, ZUI.z - 12, 24, 10, 160, ZUI_FACING, 0x2a2622, 'eiraku', 15672);
    // ---- 部隊（butai.js）：囲む織田の備と、山の曲輪に籠もる斎藤の備。名目の数を持ち、近い所だけ本物の兵になる ----
    // （物語の組＝藤吉郎・柴田・丹羽の手はそのまま。部隊は、その外の大きな流れ＝軍議の作戦で動く手）
    const mkB = (o) => makeButai(rt, { real: 0, ...o });
    const ODA_B = { team: 0, faction: 'oda', armor: 0x2a2622 };
    // 名目の兵数は保ち、各隊の一人だけを実在の将にする。森は名のある装備表の十文字槍と豪傑の型。
    F.oteYose1 = mkB({ ...ODA_B, armor: 0, name: '森可成の手', general: '森可成', kind: 'ashigaru', mix: { ashigaru: 1 }, nominal: 180, real: 1, maxReal: 1, at: MORI_YOSE, facing: MORI_FACING, flag: 'tsuru' });
    F.oteYose2 = mkB({ ...ODA_B, name: '坂井政尚の手', general: '坂井政尚', kind: 'ashigaru', nominal: 180, maxReal: 0, at: SAKAI_YOSE, facing: SAKAI_FACING, flag: 'eiraku' });
    F.sakuma = mkB({ ...ODA_B, name: '佐久間信盛の手', general: '佐久間信盛', kind: 'ashigaru', nominal: 220, maxReal: 0, at: SAKUMA_YOSE, facing: SAKUMA_FACING, flag: 'oda' });
    F.ikeda = mkB({ ...ODA_B, armor: 0, name: '池田恒興の手', general: '池田恒興', kind: 'bow', mix: { bow: 1 }, nominal: 160, real: 1, maxReal: 1, at: IKEDA_YOSE, facing: IKEDA_FACING, flag: 'ageha' });
    // 公記では三人衆の参着は翌日の囲みの後。放火の時点では備も旗も置かない。
    F.sannin = null;
    F.attackers = [F.oteYose1, F.oteYose2, F.sakuma, F.ikeda];
    const SAI_B = { team: 1, faction: 'saito', armor: 0x5a6682, flag: 'saito' };   // 暗い具足は影で黒い筒に見える。紺の胴に明るい威糸で、遠目にも腕と笠が分かれる
    F.oteB = mkB({ ...SAI_B, name: '大手の備（日根野弘就）', kind: 'ashigaru', nominal: 100, real: 4, maxReal: 4, at: { x: OTE.x, z: OTE.z - 6 }, facing: 0 });
    F.hyakuB = mkB({ ...SAI_B, armor: 0x5c6a58, name: '東の尾根道の備（長井道利）', kind: 'bow', nominal: 80, real: 4, maxReal: 4, at: NAGAI_MAMORI, facing: NAGAI_FACING });
    F.koshiB = mkB({ ...SAI_B, name: '西の裏道の備', kind: 'ashigaru', nominal: 40, maxReal: 0, at: KOSHI_MAMORI, facing: KOSHI_FACING });
    F.niB = mkB({ ...SAI_B, armor: 0x5c6a58, name: '二の丸の備', kind: 'ashigaru', nominal: 40, maxReal: 0, at: NI_MAMORI, facing: NI_FACING });
    F.honB = adoptGroup(mkB({ ...SAI_B, name: '主殿前の旗本', nominal: F.keep.guard.count, maxReal: 0, at: F.keep.guard.anchor, facing: SHUDEN_FACING }), F.keep.guard);
    F.defenders = [F.oteB, F.hyakuB, F.koshiB, F.niB, F.honB];
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
    for (const b of [...F.attackers, ...F.defenders]) b.order({ id: 'hold' });
    // ---- 区域（siege_zones.js）：大手（三の丸）・腰曲輪・二の丸・本丸、と長良川の舟着き（龍興の退路） ----
    buildInabaBoats(rt);
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
        { id: 'koshi', butai: F.koshiB, at: KOSHI_MAMORI, next: 'ni' },
        { id: 'ni', butai: F.niB, at: NI_MAMORI, next: 'hon' },
        { id: 'hon', butai: F.honB, at: { x: HON.x + 2, z: HON.z - 4 } },
      ],
      reserves: [],
      fallback: { x: HON.x, z: HON.z - 6 },
    });
    // 束33：縄張りの今の様子（nawabari.js・束19）を rt にも持たせる（軍議の俯瞰の説明・小地図・制圧の札）
    F.K = makeNawabari(rt, F.castle, { SZ: F.SZ, team: 1, friendTeam: 0 });
    rt.nawabari = F.K;
    F.keep.guard.formation = 'yari';
    for (const [x, z] of [[-24, -90], [22, -86], [OTE.x - 14, OTE.z - 12], [36, -116]]) rt.scene.add(nobori(W, x, z, 'saito', 6));
    rt.civilianBands = [...CIVILIAN_BANDS];
    for (const [x, z] of [[60, 120], [68, 110]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    F.farHomes = []; F.farFires = [];
    F.farTown = INABA_FAR_TOWN.map(({ x, z, n, r, rot, seed }) => {
      const side = -1;
      const first = SOLIDS.length;
      // 避難する家族の戸口も町と同じ地面に据え、斜面の低い側は土台で支える。
      const v = village(W, x, z, { n, r, rot, fields: 4, seed, smoke: 0, groundedHomes: true });
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
      const onward = side > 0 ? [[96, joinZ], [110, 172]] : [[-120, Math.min(joinZ, 172)], [-120, 172]];
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
    buildInabaFieldLife(rt);
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
    rt.obj('main', '印の人、藤吉郎（とうきちろう）と話そう', 'main', true);
    // 背景は戦の前の説明へ残し、冒頭は今の行動を短く伝える。
    rt.say('', '印の人、藤吉郎と話そう', 3);
    rt.after(4, () => {
      if (F.step === 0 && !F.joinedKino && !F.ending && !rt.over) rt.say(officer(rt), '今日は風が強い。井口の町に火をかける。まず話を聞け', 4);
    });
    // 話を聞くまでは旗を動かさず、町の敵の手前で下知を渡す。
    rt.marker('kino', () => F.kinoU.alive ? F.kinoU.pos : null, 'とうきちろう', { group: F.kino, guideAlways: true, guidePerson: () => F.kinoU, guideFootRing: true, guideRadius: 8, guideName: 'この人と話そう', guideTalk: true, guideVisibleOnly: true, guideCompact: true });
    F.talkKino = () => {
      if (F.joinedKino || F.step !== 0) return;
      F.joinedKino = true; rt.uninteract('talk');
      rt.say(officer(rt), 'よし、行くぞ。わしの手から離れるな', 2.5);
      rt.after(2.5, () => this.burnStart(rt));
    };
    // 藤吉郎の周りは手の兵が囲み、輪（8m）の縁で人垣に止められる。話せる間合いを人垣の外まで広げる（10/28 bot が 8 分止まった）。
    // 人垣の外まで届く共通の「話す」釦から、本人の意思で話を聞く。
    rt.addInteract('talk', () => F.kinoU.alive ? F.kinoU.pos : null, '話す', F.talkKino, { r: 12, prio: 10 });
    buildBattleJin(rt);
  },

  // ① 城下に火を放つ
  burnStart(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    F.torches = townTorches(rt);
    rt.setPhase('burn');
    F.townHorn = inabaGroupCall(rt, F.kino, 'horagai', 0.9);
    // 集合は済んだ。火付け中は旗へ呼び戻さず、家の印をたどらせる。
    rt.unmark('kino');
    rt.uninteract('talk');
    rt.banner('井口の町を焼け', '城下を焼いて、城を裸にする');
    // 信長で遊ぶ時：火付けは足軽の役目。当主は町の番の兵を払わせ、焼き働きを見届ける
    rt.obj('main', rt.G.lord ? `足軽の火付けを守れ。町の番の兵を払え（${NEED}軒）` : `火の印の家へ。「火をつける」を押そう（${NEED}軒）`, 'main', true);
    rt.say(officer(rt), rt.G.lord ? '町の兵を払え。火付けの足軽を守れ' : '火の印の家へ。「火をつける」を押せ', 4);
    if (!rt.G.lord) rt.after(9, () => { if (!rt.over && !F.ending && F.step === 1) rt.say('足軽', '町の者に刃を向けるな', 3); });   // 焼く迷い（A054）
    // 家の印は今向かう一軒だけ（焼けたら次を示す。update の markHouses）
    if (rt.G.lord) { for (const h of F.houses) if (h.mine) this.sendTorch(rt, h); }
    else for (const h of F.houses) if (h.mine) {
      rt.addInteract('h' + h.i, () => nearFireHouse(rt) === h ? h.approach : null, '火をつける', () => {
        if (nearFireHouse(rt) === h) this.light(rt, h);
      }, { r: HOUSE_FIRE_R + .01, prio: 10 });
    }
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
      // 町の奥の軽い乱戦。弱い端末では六割にする（遠景の数だけ。本物の兵は変えない）。
      A: { flag: 'oda', armor: 0x3d4248, count: Math.round(w * (TIER.weak ? 3.6 : 6)), team: 0, faction: 'oda', flagRate: 0.35 },
      B: { flag: 'saito', armor: 0x454957, count: Math.round(w * (TIER.weak ? 3.6 : 6)), team: 1, faction: 'saito', flagRate: 0.4 },
      play: (k, p, v) => rt.army.play(k, p, v * 0.65),
    }));
    // 火の手を見た町の番の兵が、松明の組へ斬りかかってくる
    F.town.order = 'attack'; F.town.seekRange = 60; F.town.aggro = 16;
    for (const g of F.houseGuards) { g.aggro = 10; g.seekRange = 10; }
    rt.after(2, () => {
      if (rt.over || F.ending || F.step !== 1 || gone(F.town)) return;
      // 転倒・退避中の番兵には叫ばせず、今いる戦える兵の足元から響かせる。
      if (!inabaGroupCall(rt, F.town, 'eshoutOrder', 1.3)) return;
      F.townGuardShoutT = rt.t;
      // 公記の敵味方を見分けかねた初動。戦う兵数・強さ・動きは保つ。
      rt.say('斎藤方の足軽', F.houses.some((h) => h.burnt) ? '火付けじゃ！　町を守れ！' : 'あの軍勢は敵か、味方か……町へ入って来るぞ！', 3);
    });
    rt.marker('town', centerOf(F.town), '町の番の兵', { red: true, group: F.town });
    // 味方もほかの家に火を放っていく
    // 松明を持った足軽が家に寄ってから火が上がる
    F.houses.filter((h) => !h.mine).forEach((h, k) => rt.after(14 + k * 9, () => this.sendTorch(rt, h)));
    rt.after(40, () => {
      if (F.ending || rt.over || F.step !== 1) return;
      charFarTown(rt);
      // 遠景も放火の日の煙として記録する。翌日の焼け跡へ高い煙を持ち越さない。
      // 公記は放火と翌日の囲みを分ける。煙の色・高さ・残り方は演出上の推定。
      F.farTownSmoke = INABA_FAR_TOWN.map(({ x, z, smokeSize }) =>
        rt.world.addSmokeColumn(x, rt.world.heightAt(x, z) + 5, z, { size: smokeSize, black: true }));
      for (const h of F.farHomes) F.farFires.push(rt.world.addFire(h.x, h.z, { h: 2.8, size: 2.4, blackSmoke: true }));
    });
    // 家に火が付くのを待たず、町の後続も斬り込む。
    rt.after(12, () => {
      if (rt.over || F.ending || F.step !== 1 || gone(F.town2)) return;
      F.town2.sent = true;
      F.town2.order = 'attack'; F.town2.seekRange = 70;
      // 新手も同じ発声条件にそろえ、声を出せる兵がいる時だけ台詞と札へ伝える。
      if (inabaGroupCall(rt, F.town2, 'eshoutOrder', 1.5)) {
        F.townShoutT = rt.t;
        rt.say('足軽', '城からの叫びは斎藤の新手じゃ！　一人で出るな、仲間と並べ！', 3.5);
      }
      if (F.lit < NEED) rt.marker('town2', centerOf(F.town2), '城から下りた斎藤勢', { red: true, group: F.town2 });
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
    // 信長には松明の組の行き先を示し、空の家で待たせない。
    const torchTarget = rt.G.lord ? (F.torchHouse || F.torchQueue.find((q) => !q.burnt && q.mine)) : null;
    const action = nearFireHouse(rt);
    let first = null, d1 = Infinity;
    if (F.lit < NEED) for (const q of F.houses) {
      if (!q.mine || q.burnt) continue;
      // 足軽には今火を付けられる家、信長には松明の組が向かう家を示す。
      if (action === q) { first = q; break; }
      const d = q === torchTarget ? -Infinity : Math.hypot(q.x - p.x, q.z - p.z) - (q === old0 ? 8 : 0);
      if (d < d1 || (d === d1 && q.i < first.i)) { first = q; d1 = d; }
    }
    // 家の印は今向かう一軒だけ。焼けた家と次の候補の印も消す。
    want.length = 1; want[0] = first;
    for (const q of F.houses) if (q.mine && q !== first) rt.unmark('h' + q.i);
    if (first) {
      const q = first;
      const label = rt.G.lord ? (q === torchTarget ? '火付けの足軽が向かう家' : '次に足軽が焼く家') : '火を放つ家';
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

  // 信長の火付け護衛も、家の脇に残る守兵まで案内する。
  guideTorchGuard(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    let target = null, nearest = Infinity;
    for (const g of F.townGuards) if (!gone(g) && (g !== F.town2 || g.sent)) {
      const c = g.center();
      const d = Math.hypot(c.x - p.x, c.z - p.z) - (g === F.townTarget ? 8 : 0);
      if (d < nearest) { target = g; nearest = d; }
    }
    if (F.townTarget !== target) {
      F.townTarget = target;
      rt.unmark('townGuard');
      if (target) rt.marker('townGuard', () => nearGuard(rt, target), target.name, { red: true, group: target });
    }
    this.nextObj(rt, target ? '印の守兵を払え。火付けの足軽を守れ' : '足軽が向かう家の印へ。火付けを守れ');
    rt.objProgress('main', `${F.lit}／${NEED}軒・${target ? target.name : '火付けは足軽が家に着いてから'}`);
  },

  light(rt, h, own = true) {
    const F = rt.flags;
    if (h.burnt || F.ending || rt.over || F.step !== 1) return;
    burnTownHouse(rt, h);
    rt.uninteract('h' + h.i); rt.unmark('h' + h.i);
    F.lit++;
    if (own && !rt.G.lord) rt.award((t) => { t.special = { label: '城下に火を放った', pts: 4 * F.lit }; }, '家に火を放った');
    if (F.lit === NEED) {
      burnInabaManor(rt);
      // 火付けの印を残さず、ここからは残る守兵の印一つへ絞る。
      rt.unmark('town'); rt.unmark('town2');
      this.nextObj(rt, townSignalText(rt) + '印の守兵を仲間と追い払え。家の脇にも残っている');
      for (const q of F.houses.filter((x) => x.mine && !x.burnt)) { rt.uninteract('h' + q.i); rt.unmark('h' + q.i); this.sendTorch(rt, q); }
      // 「退け」は味方の撤退と取り違えるため、敵を払う下知と区別する。
      rt.say(officer(rt), '火は付いた。家の脇の敵も仲間と追い払え', 3);
      // 強風下の放火。風向きは不明なので、煙が金華山へ流れたとは断定しない。
      if (!F.townSmoke) {
        F.townSmoke = [[14, 74, 3.6], [-4, 56, 3.2], [32, 60, 3.4]].map(([x, z, sz]) =>
          rt.world.addSmokeColumn(x, rt.world.heightAt(x, z) + 5, z, { size: sz, black: true }));
        rt.after(4, () => { if (!rt.over && F.step === 1) rt.say('足軽', '風が強い……城からも、この火は見えておろう', 3); });
      }
      // 町の斎藤の兵を追い払うまで、次の攻めへ進まない。
      F.clearT = rt.t;
    } else {
      this.markHouses(rt);
      rt.objProgress('main', rt.G.lord ? `${F.lit}／${NEED}軒・火付けの足軽を守れ` : `${F.lit}／${NEED}軒・次の印へ。「火をつける」を押そう`);
      if (own && !rt.G.lord) rt.say('足軽', F.lit === 1 ? '火が付いた。次は印の家じゃ' : 'あと一軒じゃ。ほかの家はわしらが焼く', 3);
    }
  },

  // ② 翌日：山の麓に鹿垣を結い、大手の坂を駆け下りる斎藤勢を受け止める
  // （信長公記：町を焼いた翌日、四方に鹿垣を結い廻して取り籠めた。鹿垣は麓に結う。山の中腹には置かない）
  sally(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    // 鹿垣では弾を込めたまま待ち、鉄砲頭の「放て」で初めて撃つ。
    F.nGun.holdFire = true;
    if (F.torches) { F.torches.stop(); F.torches = null; }
    rt.setPhase('ote');
    rt.unmark('town'); rt.unmark('town2'); rt.unmark('townGuard');
    rt.unmark('townExit');
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
        if (crowd.shade) crowd.shade.visible = false;
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
      for (const fire of F.farFires) W.removeFire(fire);
      F.farFires.length = 0;
      charFarTown(rt, true);
      // 公記の放火翌日へ移る暗転で、燃焼中の黒煙を焼け跡の煙へ替える。
      // 煙の残り方は演出。独立した煙は火を消しても残るため、記録した柱だけを消す。
      for (const id of F.townSmoke || []) W.removeSmokeColumn(id);
      F.townSmoke = null;
      for (const id of F.farTownSmoke || []) W.removeSmokeColumn(id);
      F.farTownSmoke = null;
      for (const h of F.houses) charHouse(rt, h);
      burnInabaManor(rt);
      for (const f of F.manor.fires || []) W.removeFire(f);
      F.manor.fires = null;
      W.addSmokeColumn(YAKATA.x - 2, W.heightAt(YAKATA.x - 2, YAKATA.z - 5) + 3, YAKATA.z - 5, { size: 2 });
      for (const [x, z, sz] of [[10, 70, 2.4], [-6, 50, 2], [38, 52, 2.2]]) W.addSmokeColumn(x, W.heightAt(x, z) + 4, z, { size: sz });
      W.lookDark = false; W.setTime('day');
      // 公記の強風の記事は放火の日。翌日も強風だったとは決めず、通常風を仮置きする。
      // 共通の戦定義を変えると、次に遊ぶ放火の日まで弱風になる。その回の戦場だけに適用する。
      W.def = { ...W.def, windStrength: 1 };
      if (W.fade) { W.fade = null; W.applyLook(W.lookOf('day')); W.updateEnv(); }
      for (const g of [F.kino, F.shiba, F.niwa, F.nGun]) {
        const x = g === F.kino ? -4 : g === F.shiba ? 13 : g === F.niwa ? -21 : -12;
        placeGroup(rt, g, x, SHIKA_Z + (g === F.nGun ? 3 : 5));
        g.aggro = 12; g.facing = Math.PI;
      }
      placePlayer(rt, 2, SHIKA_Z + 7, Math.PI);
      let row = 0;
      for (const q of rt.squadGroups || []) placeGroup(rt, q, 4 + row++ * 3, SHIKA_Z + 12);
      buildShikaMaterials(rt);
      if (!F.shikaEntryMarks) {
        F.shikaEntryMarks = true;
        for (const i of SHIKA_GAPS) for (const end of [0, 1]) {
          const x = SHIKA_X0 + (i + end) * SHIKA_W;
          const z = SHIKA_Z + Math.sin(i + end) * 1.2;
          for (const [mat, radius, height] of [[SHIKA_EDGE_DARK, .2, 2.4], [SHIKA_EDGE_GOLD, .14, 2.1]]) {
            const post = new THREE.Mesh(SHIKA_GEO, mat);
            post.position.set(x, W.heightAt(x, z) + 1.2, z);
            post.scale.set(radius, height, radius); rt.scene.add(post);
          }
        }
      }
      // 翌日の持ち場に着いてから、藤吉郎の組で備えの合図を出す。
      const readyCall = inabaGroupCall(rt, F.kino, 'sig_hajime', 0.8);
      F.oteReadyCall = readyCall;
      F.oteReadyUntil = rt.t + 8;
      rt.banner('翌日、城を取り籠める', readyCall ? '法螺貝と太鼓三つ。藤吉郎の手と鹿垣の内へ' : '仲間と鹿垣の内へ。城兵に備えよ');
      this.nextObj(rt, (readyCall ? '法螺貝と太鼓三つは備えの合図。' : '') + '藤吉郎の旗へ、鹿垣の内で城兵を迎えよ');
      rt.say(readyCall ? officer(rt) : '使番', (readyCall ? '法螺と太鼓三つは備えの合図じゃ。' : '') + '今日は麓に鹿垣を結い、城を取り籠める', 4);
    }, '翌日、城を囲む\n仲間と、ふもとのさくの内へ');
    // 焼け跡と炎・煙の切り替えは、翌日への暗転の中で一度だけ行う。
    this.nextObj(rt, '翌日は城を囲む。ふもとのさくの旗へ');
    F.holdArrived = false;
    F.holdPoint = { x: -4, z: SHIKA_Z + 5 };
    rt.marker('kino', () => F.kinoU.alive ? F.kinoU.pos : null, '藤吉郎の旗・さくの内', { group: F.kino });
    rt.marker('holdFlag', F.holdPoint, 'さくの旗', { h: 0, guideAlways: true, guideArea: 'wait', guideWaitRing: true, guideFlag: true, guideFlagFrame: true, guideRadius: 3, guideFlagMesh: () => F.kinoU.alive ? F.kinoFlag : null });
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
      buildShikaFlanks(rt);
      [[-32, 'oda'], [-28.5, 'eiraku'], [23, 'oda'], [28, 'eiraku'], [33, 'oda']].forEach(([x, k]) => rt.scene.add(nobori(rt.world, x, SHIKA_Z + 2.2, k, 5.5)));
      // 鹿垣ができた後に参着。従来の備をここで作り、乱戦の兵・左右の合戦は変えない。
      F.sannin = makeButai(rt, { team: 0, faction: 'oda', armor: 0x33302a, name: '美濃三人衆の手', kind: 'ashigaru', nominal: 240, real: 0, maxReal: 0, at: MINO_YOSE, facing: MINO_FACING, lightWidth: 24, lightDepth: 15, flag: 'inaba' });
      F.attackers.push(F.sannin); F.attackTotal += F.sannin.nominal;
      // 公記の三人は稲葉・氏家・安藤。控え全体を稲葉一人の軍と見せない。
      // 稲葉の隊旗は既存の兵に残し、別置き二本を氏家・安藤の名札に替える。
      // 字の旗は識別用の補いで、当時の旗印の復元ではない。位置と本数は保つ。
      // 設営時に一度だけ字を描き、共通の幟の形・布の仕組みを使い回す。
      for (const [dx, dz, key, name] of [[6, 4, 'inabaUjiieGuide', '氏家'], [-2, 14, 'inabaAndoGuide', '安藤']]) {
        customFlag(key, (g) => flagColumn(g, name, 64, 30, 224, 32), undefined, true);
        rt.scene.add(nobori(rt.world, MINO_YOSE.x + dx, MINO_YOSE.z + dz, key, 6));
      }
      // 初期化で空けておいた備え表の枠へ結ぶ。他の備や旗を作り直さない。
      const spec = INABAYAMA_JIN[0].sonae.find((s) => s.id === 'ibMino');
      F.sannin.jinkeiSpec = spec;
      const light = F.sannin.light;
      light.army.jinkeiSpec = spec; light.army.team = 0; light.army.commanderName = spec.general;
      const bound = F.earlyJin.ibMino = { pos: F.sannin.pos, light, real: null, source: F.sannin, general: spec.general, soldiers: spec.soldiers, morale: 100 };
      for (const J of rt.jinkei || []) for (const slot of J.slots) if (slot.spec.id === spec.id) slot.b = bound;
      F.sannin.order({ id: 'move', to: MINO_HOLD });
      rt.say('使番', '稲葉・氏家・安藤の三人衆が参着。すでに城が囲まれておると驚いております', 4);
    });
    F.ote.order = 'hold';
    // 鹿垣の内の組は藤吉郎・柴田・丹羽がその場で下知する（瑞龍寺山からの使番を待たない。待つと列が揃わず、搦手へも出られない）
    for (const g of [F.kino, F.shiba, F.niwa, F.nGun]) g.siegeAI = true;
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.6; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.facing = Math.PI; gg.aggro = 12; }; };
    go(F.kino, -4, SHIKA_Z + 5); go(F.shiba, 13, SHIKA_Z + 5); go(F.niwa, -21, SHIKA_Z + 5); go(F.nGun, -12, SHIKA_Z + 3);
    // 森・坂井の手は大手の坂の下で城兵を引き付けたまま（本物の兵に替えない。鹿垣の内は物語の組が受け持つ）
    // 三人衆の控えは鹿垣完成後に参着。左右の軽い合戦とは重ねない。
    // 竹束（taketaba.js）：鉄砲衆の前に竹束を押し立て、陰から撃つ
    F.TA = makeTabaAdvance(rt, {
      near: 30, holdRanged: 20, holdMelee: 8,
      items: [{ g: F.nGun, yose: { x: -12, z: SHIKA_Z + 3 } }],
      avoid: [rt.player.u.pos && { x: rt.player.u.pos.x, z: rt.player.u.pos.z }],
    });
    // 竹束の後ろへ視点が入り込むと横画面を塞ぐ。この戦の束だけ既存の視点避けへ渡す。
    for (const tb of F.tabas || []) tb.m.userData.camBlock = true;
    // 麓の左右でも、囲みの手と打って出た城兵がぶつかる（軽い大軍の合戦。兵力には数えない）
    // 公記では鹿垣の包囲後に三人衆が参着する。先に始まる西の乱戦も織田の旗とし、稲葉の旗を先出ししない。
    // 参照：『信長公記』首巻「稲葉山御取り候事」本文 https://note.com/senmi/n/n2d9649c5ce53
    const side = (flag, armor, count, team, faction) => ({ flagTex: flagTexture(flag), armor, count, team, faction });
    const lc = (o) => rt.world.addClash({ rt, measuredMelee: true, play: (k, p, v) => rt.army.play(k, p, v), smoke: (x, y, z, fx, fz) => rt.army.smoke(x, y, z, fx, fz), ...o });
    F.footClash = [
      lc({ x: -68, z: 30, facing: Math.PI, w: 34, gap0: 18, closeSpeed: 2.6, seed: 15673, noRout: true, killRate: 0.1, A: side('oda', 0x33302a, 150, 0, 'oda'), B: side('saito', 0x3a3a30, 110, 1, 'saito') }),
      lc({ x: 62, z: 28, facing: Math.PI, w: 32, gap0: 18, closeSpeed: 2.6, seed: 15674, noRout: true, killRate: 0.1, A: side('oda', 0x2a2622, 150, 0, 'oda'), B: side('saito', 0x3a3a30, 110, 1, 'saito') }),
    ];
    rt.say(officer(rt), 'さくの旗へ集まれ。杭を打ち、枝を結べ', 3.5);
    rt.after(4, () => { if (F.step === 2) rt.say(officer(rt), '敵はまだ坂の上じゃ。さくの内で備えよ', 3.5); });
    rt.after(9, () => { if (F.step === 2) rt.say('鉄砲頭', '鉄砲は引きつけてから放つ。崩れてから突け', 3.5); });
    // 山の上で法螺と太鼓。坂の上に旗が並び、鬨の声とともに駆け下りてくる
    rt.after(12, () => {
      if (rt.over || F.step !== 2 || gone(F.ote)) return;
      F.oteSignalT = rt.t;
      F.oteSignal = inabaGroupCall(rt, F.ote, 'sig_kakari', 1);
      rt.say('足軽', F.oteSignal
        ? '坂の上の法螺と早打ちは敵の懸かれの合図じゃ！　さくの中で待ち構えよ！'
        : '坂の上に城兵がおる！　さくの中で待ち構えよ！', 4);
    });
    rt.after(16, () => {
      if (F.step !== 2 || gone(F.ote)) return;
      F.oteCharging = true;
      F.oteChargeT = rt.t;
      F.ote.noAI = false; F.ote.siegeAI = true; F.ote.fire = true;
      march(F.ote, [[-20, 25], [-6, 28], [-4, 31], [-4, SHIKA_Z + 4]], 'attack');
      // 兵はそのまま寄せ、合図から十秒、最後の大太鼓の余韻の後に鬨を上げる。
      rt.after(Math.max(0, F.oteSignalT + KAKARI_SOUND_SECONDS - rt.t), () => {
        if (rt.over || F.ending || F.step !== 2 || gone(F.ote)) return;
        if (!inabaGroupCall(rt, F.ote, 'eshoutOrder', 1.7)) return;
        F.oteShoutT = rt.t;
        rt.say('足軽', '坂の上の鬨は城兵じゃ！　鹿垣の内から鬨を返せ。仲間と迎えよ！', 3.5);
        rt.after(2.5, () => {
          if (rt.over || F.ending || F.step !== 2 || gone(F.kino)) return;
          if (!inabaGroupCall(rt, F.kino, 'tokiOrder', 1.3)) return;
          F.oteReplyT = rt.t;
          rt.say('組頭', '今の鬨は藤吉郎の手の返しじゃ！　鹿垣を出ず、仲間と槍をそろえよ！', 3);
        });
      });
      rt.marker('ote', centerOf(F.ote), '大手の斎藤勢', { red: true, group: F.ote });
      for (const C of F.footClash) C.go();
    });
    // 新手の予定は四十五秒。合図が重なる時は、実際の出発時刻へ更新する
    F.ote2Due = rt.t + 45;
    rt.after(36, () => this.oteWarn(rt));
    rt.after(45, () => this.ote2(rt));
  },
  oteWarn(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step !== 2 || gone(F.ote2) || F.ote2.sent || F.oteWarned || F.oteWarnWaiting) return;
    // 初めの早打ちに続く敵の鬨と味方の返しまで聞いてから、新手の合図を出す。
    // 返しは太鼓の余韻の二・五秒後。六秒の任務表示も次の太鼓で覆わない。
    // 待つ間も、出撃側が参照する時刻を先に決めておく。
    const ready = Math.max((F.oteSignalT ?? -Infinity) + KAKARI_SOUND_SECONDS + 8.5,
      (F.oteShoutT ?? -Infinity) + 6, (F.oteReplyT ?? -Infinity) + 6);
    if (rt.t < ready) {
      F.oteWarnT = ready; F.ote2Due = ready + 5; F.oteWarnWaiting = true;
      rt.after(ready - rt.t, () => { F.oteWarnWaiting = false; this.oteWarn(rt); });
      return;
    }
    F.oteWarned = true; F.oteWarnT = rt.t; F.ote2Due = rt.t + 5;
    F.oteWarnHorn = inabaGroupCall(rt, F.ote2, 'sig_kakari', 0.8);
    rt.say('足軽', F.oteWarnHorn
      ? 'また坂の上で法螺と陣太鼓じゃ！　仲間と並んで新手に備えよ'
      : '坂の上に新手がおる！　仲間と並んで備えよ', 3);
  },
  ote2(rt) {
    const F = rt.flags;
    {
      if (rt.over || F.ending || F.step !== 2 || F.ote2.sent) return;
      // 出撃前に崩れた新手は合図も寄せも行わない。処理済みにして次の任務へ進める。
      if (gone(F.ote2)) {
        F.ote2.sent = true; F.ote2T = rt.t;
        return;
      }
      this.oteWarn(rt);
      // 初めの寄せが早く崩れても、法螺と早打ちを聞いてから新手が動く。
      // 定刻の呼び出しと重なっても、待つ仕事は一つだけにする。
      const wait = F.oteWarnT + 5 - rt.t;
      if (wait > 0) {
        if (!F.ote2Waiting) {
          F.ote2Waiting = true;
          rt.after(wait, () => { F.ote2Waiting = false; this.ote2(rt); });
        }
        return;
      }
      F.ote2.sent = true; F.ote2T = rt.t;
      F.ote2.noAI = false; F.ote2.siegeAI = true; F.ote2.fire = true;
      march(F.ote2, [[-24, 21], [-8, 27], [-4, 31], [-4, SHIKA_Z + 4]], 'attack');
      rt.after(Math.max(0, F.oteWarnT + KAKARI_SOUND_SECONDS - rt.t), () => {
        if (rt.over || F.ending || F.step !== 2 || gone(F.ote2)) return;
        if (!inabaGroupCall(rt, F.ote2, 'eshoutOrder', 1.4)) return;
        F.ote2ShoutT = rt.t;
        rt.say('足軽', '坂の上の鬨は敵の新手じゃ！　鹿垣の内から鬨を返し、槍をそろえよ！', 3.5);
        rt.after(2.5, () => {
          if (rt.over || F.ending || F.step !== 2 || gone(F.kino)) return;
          if (!inabaGroupCall(rt, F.kino, 'tokiOrder', 1.2)) return;
          F.oteReplyT = rt.t;
          rt.say('組頭', '今の鬨は味方の返しじゃ！　新手にも鹿垣を出るな。仲間と迎えよ！', 3);
        });
      });
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
    rt.unmark('ote'); rt.unmark('ote2'); rt.unmark('kino');
    for (const q of [F.ote, F.ote2]) if (q && !gone(q)) { q.noRout = false; q.morale = Math.min(q.morale, 15); }
    rt.award((t) => t.side.push('大手の打って出を退けた'), '大手の斎藤勢を退けた');
    rt.say(officer(rt), '大手は仲間に任せる。わしらは山の裏へ回るぞ', 3.5);
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
      { const q = karaSpot(12, 1.2); placePlayer(rt, q.x, q.z, KARA_BACK.heading); }
      // 下の折り返しの守りは、暗転の間に列が退けた扱い（見えない所に立つだけの兵を残さない）。
      for (const g of F.climbGuards) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
      // 物見と見回りの組は、始まりの先の細道へ。斬り合いの数は減らさない。
      for (const [g, at] of [[F.scout, KARA_SCOUT], [F.patrol, KARA_PATROL]]) if (g && !gone(g)) { g.anchor = { x: at.x, z: at.z }; placeGroup(rt, g, at.x, at.z); }
      roadApproach(rt.world, rt.player.u.pos, KARA_TRAIL, F.karaNext, F.karaGuide);
      let companionRow = 0;
      for (const u of rt.tomoUnits || []) if (u.alive && !u.gone && !u.woundOut) {
        const q = karaSpot(Math.max(1, 10 - companionRow++ * 1.5), 1.2); u.pos.x = q.x; u.pos.z = q.z;
        u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); u.mesh.position.copy(u.pos);
      }
      let row = 0;
      for (const q of rt.squadGroups || []) placeKaraGroup(rt, q, Math.max(5, 11 - row++ * 3));
      // 小六の手も切岸へ横並びにせず、同じ道の後列から登る。
      if (!F.hachi) {
        F.hachi = allyGroup(rt, { fixed: true, name: '蜂須賀小六の手', anchor: karaSpot(6), facing: KARA_BACK.heading, width: 2, aggro: 10 },
          dress([{ type: 'samurai', n: 1, o: { name: '蜂須賀小六' } }, { type: 'ashigaru', n: 7 }], { flag: 'hachisuka' }));
        F.hachi.siegeAI = true; F.hachi.noRout = true;
        placeKaraGroup(rt, F.hachi, 6);
        march(F.hachi, KARA_TRAIL.slice(0, -1), 'attack'); F.hachi.pathIdx = KARA_START + 1; F.hachi.speed = 3.2;
      }
      rt.banner('搦手へ（伝え）', '太鼓と法螺を控え、藤吉郎の列で裏道へ');
      rt.say('', '――藤吉郎の手が山の裏道から登った、と伝わる', 4);
      // 搦手の別働隊の知らせ（本隊は大手、藤吉郎の手は裏から。本丸で挟む）
      rt.after(9, () => { if (!rt.over && !F.ending && F.step === 3) rt.say('使番', '殿の下知じゃ。大手の本隊は正面を押す。藤吉郎の手は別働隊として搦手から本丸を突け', 4); });
      rt.after(4, () => {
        if (rt.over || F.ending || F.step !== 3 || gone(K)) return;
        // 忍び歩きの下知は近くの小声だけ。陣太鼓や法螺で裏道を知らせない。
        // 折り返しの列の中心は無人の斜面になる。実際にいる兵の足元から伝える。
        if (!inabaGroupCall(rt, K, 'jinchuWhisper', 0.7, true)) return;
        rt.say(officer(rt), `${nm(rt)}、太鼓と法螺は控えよ。声をひそめ、わしの列で裏から登るぞ`, 4);
      });
      K.order = 'path'; K.path = KARA_TRAIL.slice(0, -1); K.pathIdx = KARA_START + 1; K.speed = 3.2; K.formation = 'column'; K.colW = 2; K.roadColumn = true; K.aggro = 6; K.holdFire = true; K.fire = false;   // 細道を登る間は鉄砲を撃たず列に付いて歩く
      K.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: KARA[KARA.length - 2][0], z: KARA[KARA.length - 2][1] }; g.formation = 'yari'; g.aggro = 14; g.seekRange = 24; if (F.guardOn) g.order = 'attack'; };
      F.climbFriends = [K, F.hachi];
      F.climbSkirmishes = [F.scout, F.patrol, F.ambush, F.koshiGuard];
      F.climbFoes = [...F.climbGuards, F.scout, F.patrol, F.ambush, F.koshiGuard, F.kguard];
    }, '山の裏へ回る\n藤吉郎の列と、裏道の登り口へ');
    this.nextObj(rt, '道の印をたどれ。藤吉郎の列で登れ');
    // 遠い木戸を指すと折り返しの崖へ直進してしまう。最後の段へ来てから示す。
    rt.marker('kido', () => inabaAtWoodGate(rt) ? F.kguard.anchor : null, '搦手の木戸', { h: 3 });
    F.climbSpots = 0; F.karaNext = KARA_START + 1; F.karaEntryShown = true;
    F.karaGuide = { x: KARA_TRAIL[KARA_START + 1][0], z: KARA_TRAIL[KARA_START + 1][1], returning: false };
    rt.marker('karaGuide', () => F.karaGuide, () => F.karaGuide.returning ? '道の中央' : F.karaGuide.fighting ? '近い守兵・仲間と追い払え' : F.karaGuide.lastCorner ? '搦手の木戸前' : '次の曲がり角', { guideAlways: true, guideArea: 'move', guideRadius: 1.2, h: 0 });
    F.karaGuideMarked = true;
    // 大手には柴田・丹羽が残って押さえる
    for (const g of [F.shiba, F.niwa]) { g.order = 'hold'; g.anchor = { x: g === F.shiba ? 20 : -16, z: SHIKA_Z + 6 }; }
    // 軍議で決めた作戦で、外の部隊が動き出す（七曲り・東の尾根道・西の裏道）
    this.runStrategy(rt);
    // 搦手の木戸の守り
    F.kguard.order = 'hold';
  },

  // 搦手の登りの途中の出来事：岩場の足止め、藤吉郎の小声、物見との小競り合い
  climbEvents(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    const lead = F.kinoU.pos;
    // 折り返しの下の段を通っただけで、上の物見や伏兵を呼び出さない。
    const near = (i, r) => nearClimbSpot(rt, p, i, r)
      || F.kinoU.alive && nearClimbSpot(rt, lead, i, r);
    if (F.climbSpots === 0 && near(1, 9)) {
      F.climbSpots = 1;
      // すぐ次の物見の知らせに重なる台詞は出さない。道順は任務の札に残す。
      // 足止めのために隊の歩みを半分にしない。岩場でも同じ道を進む。
      // 先頭が踏む岩と小石の音。木戸を叩く音は使わず、実際の先頭の位置から鳴らす。
      rt.army.play('stepRock', lead, 0.5);
    } else if (F.climbSpots === 1 && near(1, 14)) {
      F.climbSpots = 2;
      // 斎藤の物見が二人。見つかれば声を上げられる前に討て
      F.scout.order = 'attack';
      rt.say('足軽', nearClimbSpot(rt, p, 1, 14)
        ? '物見じゃ！　仲間と槍をそろえよ'
        : '先頭に物見が出た。道の印をたどれ', 3);
      F.climbNoticeUntil = rt.t + 3;
      rt.marker('scout', centerOf(F.scout), '物見', { red: true, group: F.scout });
      // 小競り合いに見回りの組も気付く。警戒の声は生きている兵の位置から出す。
      rt.after(2, () => {
        if (rt.over || F.ending || F.step !== 3 || F.guardOn || gone(F.patrol)) return;
        F.patrol.order = 'attack'; F.patrol.noAI = false; F.patrol.seekRange = 30; F.patrol.aggro = 14;
        inabaAlarm(rt, [F.scout, F.patrol], 1.3, () => {
          F.patrolShoutT = rt.t;
          rt.say('斎藤方の足軽', '裏から織田じゃ！　ここで止めよ、通すな！', 3);
        });
        rt.marker('patrol', centerOf(F.patrol), '見回りの組', { red: true, group: F.patrol });
        F.kino.aggro = 14; F.kino.seekRange = 18;
      });
    } else if (F.climbSpots === 2 && near(2, 14)) {
      F.climbSpots = 3;
      rt.unmark('scout');
      rt.say(officer(rt), nearClimbSpot(rt, p, 2, 14)
        ? '木戸の先が本丸の裏じゃ。道を進め'
        : '先頭が岩場に着いた。道の印をたどれ', 3);
      F.climbNoticeUntil = rt.t + 3;
      // 曲がり角の伏兵（GAME_C）：岩陰に槍が潜み、上の段から鉄砲が二挺。細い道なので一度に当たれる数は少ない
      rt.after(3, () => {
        if (rt.over || F.ending || F.step !== 3 || F.guardOn || gone(F.ambush)) return;
        F.ambush.order = 'attack';
        // 列の藤吉郎の手も槍を返して伏兵に当たる（自分ひとりに伏兵を受けさせない）
        F.kino.aggro = 14; F.kino.seekRange = 18;
        F.ambushGun.order = 'hold';
        // 伏兵の叫びも生きた兵の現在位置から。古い持ち場や退いた隊からは鳴らさない。
        inabaAlarm(rt, [F.ambush], 1.2, () => {
          F.ambushShoutT = rt.t;
          rt.say('足軽', '岩陰の叫びは敵じゃ！　太鼓と法螺は控え、列で伏兵を退けよ！', 3.5);
          if (!F.guardOn) rt.objProgress('main', '岩陰の叫びは敵の伏兵。太鼓と法螺は控え、列の仲間と退けよ');
        });
        rt.marker('ambush', centerOf(F.ambush), '岩陰の伏兵', { red: true, group: F.ambush });
      });
    }
    // 物見櫓：搦手の岩場を過ぎた辺りで気付く（任務ではない。登って射手を討てば手柄）
    if (!F.towerSeen && F.climbSpots >= 1 && rt.t >= (F.climbNoticeUntil || 0) && Math.hypot(p.x - TOWER.x, p.z - TOWER.z) < 22
      && Math.abs(p.y - rt.world.heightAt(TOWER.x, TOWER.z)) < 8) {
      F.towerSeen = true;
      rt.say(officer(rt), '物見櫓じゃ。登るかは任せる。わしらの目当ては木戸じゃ', 3.5);
      rt.marker('tower', { x: TOWER.x, z: TOWER.z }, () => gone(F.towerArchers) ? null : '物見櫓の射手（任意）', { red: true, group: F.towerArchers });
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
    // 担いだままでも道と次の任務を示す。据える操作は火付けより先に選べる。
    rt.addInteract('tabaSet', rt.player.u.pos, '竹束を据える', () => this.tabaSet(rt), { r: 3, hold: 1, prio: 3 });
    rt.obj('carry', '突く前に「竹束を据える」を長押し', 'side', true);
    rt.bark('竹束は前の矢と石を防ぐが、歩みが遅くなる。突く前に据えよ', true);
    if (F.step === 4 && F.sig) this.guideSig(rt);
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
    if (F.step === 4 && F.sig) this.guideSig(rt);
  },
  // 搦手の守りとぶつかる
  guardFight(rt) {
    const F = rt.flags;
    if (F.guardOn) return;
    F.guardOn = true; F.guardT = rt.t;
    rt.unmark('kido');
    // 先頭だけが着いた時は、後列の任務を木戸への直進に替えない。
    const nearGate = inabaAtWoodGate(rt);
    if (nearGate) this.nextObj(rt, F.carry ? 'まず「竹束を据える」を長押し。仲間と木戸の守りを追い払え' : '仲間と木戸の守りを追い払え');
    F.kguard.order = 'hold'; F.kguard.aggro = 12;
    // 曲がり角の手前で縦列を解くと柵へ直進する。木戸まで道をたどってから槍をそろえる。
    if (F.kino.order !== 'path') { F.kino.order = 'attack'; F.kino.formation = 'yari'; }
    F.kino.seekRange = 24; F.kino.holdFire = false; F.kino.fire = true;
    if (F.hachi && !gone(F.hachi) && F.hachi.order !== 'path') { F.hachi.order = 'attack'; F.hachi.seekRange = 24; }
    inabaAlarm(rt, [F.kguard], 1.4, () => {
      F.guardShoutT = rt.t;
      rt.say('斎藤方の足軽', '裏から来たぞ！　木戸を守れ、通すな！', 3);
      if (inabaAtWoodGate(rt)) rt.objProgress('main', '木戸の声は敵じゃ。仲間と守りを追い払え');
    });
    rt.marker('kguard', () => nearGuard(rt, F.kguard), '搦手の守り', { red: true, group: F.kguard });
    rt.say(officer(rt), nearGate ? F.carry ? '竹束を置け。仲間と木戸を攻めよ' : '仲間と木戸の守りを追い払え' : '先頭が木戸に着いた。道の印をたどれ', 3);
  },

  // ④ 本丸の脇に火を放つ
  signal(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('honmaru');
    rt.unmark('kguard'); rt.unmark('kido');
    rt.unmark('karaGuide'); F.karaGuideMarked = false;
    // 裏道の働きは済んだ。本丸へ移った後に物見や伏兵へ呼び戻さない。
    for (const id of ['scout', 'patrol', 'ambush', 'tower']) rt.unmark(id);
    for (const g of F.climbGuards) rt.unmark(g.name);
    rt.award((t) => t.side.push('搦手の木戸を破った'), '搦手の守りを破った');
    // 木戸を早く抜いても、直前の警戒声と札の説明を味方の太鼓で覆わない。
    // 待つのは音だけ。列と大手の兵は従来どおり動かす。
    // 退けを太鼓で伝えた直後も、懸かれの早打ちと重ねない。裏道の小声は除く。
    const retreatUntil = F.retreatSignalStep !== 3 && !F.retreatByVoice ? (F.retreatSignalAt ?? -Infinity) + 10 : -Infinity;
    F.honAfterRetreat = rt.t < retreatUntil;
    F.honCallT = Math.max(rt.t, (F.patrolShoutT ?? -Infinity) + 8.5,
      (F.ambushShoutT ?? -Infinity) + 8.5, (F.guardShoutT ?? -Infinity) + 8.5, retreatUntil);
    const callWait = F.honCallT - rt.t;
    const chargeCall = () => {
      if (rt.over || F.ending || F.step !== 4) return;
      F.honHorn = inabaGroupCall(rt, F.kino, 'sig_kakari', 0.85);
      rt.say(F.honHorn ? officer(rt) : '使番', (F.honHorn ? '法螺と早打ちは懸かれの合図じゃ！　' : '') + '仲間と本丸の守りを退けよ。小屋の火で本陣へ知らせるぞ', 4.5);
    };
    if (callWait > 0) {
      rt.say(officer(rt), (F.honAfterRetreat ? '先の退き太鼓が収まるのを待て。' : '今の叫びは敵の警戒じゃ。') + '味方の法螺と早打ちは、その後に鳴らす。仲間と本丸へ押せ！', 4);
      rt.after(callWait, chargeCall);
    } else chargeCall();
    // 最後の早打ちを聞いてから組が鬨で応じる。裏道や終幕へ持ち越さない。
    rt.after(callWait + KAKARI_SOUND_SECONDS, () => {
      if (rt.over || F.ending || F.step !== 4 || gone(F.kino)) return;
      if (!inabaGroupCall(rt, F.kino, 'tokiOrder', 1)) return;
      F.honShoutT = rt.t;
      rt.say('組頭', '今の鬨は藤吉郎の手じゃ！　声を合わせ、仲間と本丸の守りを押せ！', 3.5);
      if (!F.sig) this.guideHon(rt);
    });
    this.nextObj(rt, honSignalText(rt) + '仲間と本丸の旗本を退けよ。城主を討つ任務ではない');
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
        // 藤吉郎の鬨と五秒以上空け、同じ音の連打制限で大手の返しが消えないようにする。
        rt.after(callWait + KAKARI_SOUND_SECONDS - 8 + 5.5, () => {
          if (rt.over || F.ending || F.step !== 4 || gone(F.oteUp)) return;
          if (!inabaGroupCall(rt, F.oteUp, 'tokiOrder', 1.2)) return;
          F.oteUpT = rt.t;
          rt.say('足軽', '表の道の鬨は味方じゃ！　大手の衆と声を合わせ、本丸の守りを押せ！', 3.5);
          rt.banner('本丸を挟む', '表の道の鬨は大手の味方。藤吉郎の手と挟め');
        });
      });
    }
    // 裏から破られた本丸の守りは浮き足立つ（三人衆の寝返りの後で、もともと士気が低い）
    for (const g of [...F.hata, F.tatsu]) if (!gone(g)) { g.order = 'hold'; g.aggro = 10; g.morale = Math.min(g.morale, 60); }
    this.guideHon(rt);
  },
  // 次に退ける守りを一組だけ指す。主殿の奥へ城主を追わせない。
  guideHon(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    let target = null, nearest = Infinity, left = 0;
    // 町と同じく、近い守りから仲間と払う。八歩の余裕で印の行き来を防ぐ。
    for (const g of F.honGuards) if (!gone(g)) {
      left++;
      const c = g.center();
      const d = Math.hypot(c.x - p.x, c.z - p.z) - (g === F.honTarget ? 8 : 0);
      if (d < nearest) { target = g; nearest = d; }
    }
    if (!target) return;
    if (F.honTarget !== target) {
      F.honTarget = target;
      rt.marker('honGuard', () => nearGuard(rt, target), target.name, { red: true, group: target });
    }
    this.nextObj(rt, F.carry ? 'まず「竹束を据える」を長押し。仲間と守兵を追い払え'
      : `${target.name}を仲間と追い払え`);
    rt.objProgress('main', `守りは残り${left}組。城主を追わず、合図の火を目指せ`);
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
    rt.bark(F.sig ? '城主は追うな。小屋の印へ戻り、合図の火を付けよ'
      : '城主は追うな。仲間と印の守兵を追い払え');
  },
  // 竹束を担いでいる間は、先に押せる操作を主の札でも伝える。
  guideSig(rt) {
    const F = rt.flags, detour = inabaSignalDetour(rt);
    this.nextObj(rt, F.carry ? 'まず「竹束を据える」を長押し。それから小屋の印へ'
      : detour ? '道の印へ。建物の外を回って小屋へ進め'
      : '小屋の手前の印へ。「小屋に火をつける」を長押し');
    rt.objProgress('main', F.carry ? '竹束を置いたら、合図の火を付けよ'
      : detour ? '建物に入らず、外の道をたどれ。小屋で合図の火を付けよ'
      : '火が付くまで押し続けよ。本陣への合図じゃ');
  },
  // 旗本を退けたら、合図の火
  lightSig(rt) {
    const F = rt.flags;
    if (F.sig || F.step !== 4 || !F.hata.every(gone) || !gone(F.tatsu) || !gone(F.keep.guard)) return;
    for (const n2 of ['本丸の旗本', '御殿から出た旗本', '二の丸から上がった斎藤勢']) rt.unmark(n2);
    rt.unmark('honGuard');
    const S = { x: HON.x + 8, y: rt.world.heightAt(HON.x + 8, HON.z + 9), z: HON.z + 9 };
    F.sig = S; F.sigT = rt.t;
    const approach = { x: S.x - 4, z: S.z };
    this.guideSig(rt);
    rt.say(officer(rt), F.carry ? 'まず竹束を置け。それから小屋に火を付けよ'
      : inabaSignalDetour(rt) ? '建物の外の道を回れ。小屋に火を付けるぞ'
      : '小屋の手前へ寄れ。火を付けて本陣へ知らせよ', 3);
    rt.marker('sig', approach, () => inabaSignalDetour(rt) ? '建物の外の道' : '小屋の火付け口', { h: 1.8, entrance: true, guideAlways: true, guideSymbol: 'fire', guideAnchor: { x: S.x, y: rt.world.heightAt(S.x, S.z) + 6, z: S.z }, guideDestination: () => inabaSignalApproach(rt) });
    rt.addInteract('sig', approach, '小屋に火をつける', () => this.win(rt), { r: 4, hold: 1.6, prio: 2 });
  },

  // 軍議の作戦（七曲り・東の尾根道・西の裏道）で、外の部隊を動かす。自分の筋（藤吉郎の手と搦手）はそのまま
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
      // 大手は鹿垣で構えて引き付け、佐久間・池田が東の尾根道を登って本丸の脇へ
      setRoute(F.sakuma, R_HYAKU, F); setRoute(F.ikeda, R_HYAKU, F);
      pin(F.oteYose1, -24); pin(F.oteYose2, 24);
      rt.after(5, () => rt.say('柴田勝家', '佐久間と池田が東の尾根道を登る。大手は引き付けておくだけでよい', 3.5));
    } else if (s === 'mizunote') {
      // 大勢を西の裏道へ。池田と美濃三人衆が藤吉郎の手の後ろから登る（大手は手薄になる）
      setRoute(F.ikeda, R_MIZU, F); setRoute(F.sannin, R_MIZU, F);
      pin(F.oteYose1, -24); pin(F.oteYose2, 24);
      rt.after(5, () => rt.say('稲葉一鉄', '西の裏道へは、わしらも続く。藤吉郎が先じゃ、わしらはその後ろを固める', 3.5));
    } else {
      // 七曲り（遊びの既定）：大手の寄せ手が七曲りを押し上げ、大手の木戸の前で城兵を引き付ける
      setRoute(F.oteYose1, R_NANA, F); setRoute(F.oteYose2, R_NANA, F); setRoute(F.sakuma, R_NANA, F);
      rt.after(5, () => rt.say('柴田勝家', '森と坂井が七曲りを押し上げる。木戸の前で城兵を引き付けるぞ', 3.5));
    }
  },

  // 区域が落ちた（siege_zones の onFall）：知らせだけ。勝ち負けは筋（合図の火）と本丸で決める
  onZoneFall(rt, id) {
    const F = rt.flags;
    F.fell = F.fell || {};
    if (F.fell[id]) return;
    F.fell[id] = true;
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
    // 終幕では退き口の更新を止めるため、集合へ移る前に古い下知を片付ける。
    rt.unmark('retreat'); rt.objRemove('retreat');
    F.retreatMarked = false; F.retreatCueHeld = false;
    rt.uninteract('sig'); rt.unmark('sig');
    // 達成後に退き口や竹束の古い下知を残し、次の働きがあるように見せない。
    rt.objRemove('carry');
    const S = F.sig;
    rt.world.addFire(S.x, S.z, { h: 1.6 });
    // 小さな合図の火は大火の出来事に数えられないため、着火のはぜる音をここで一度だけ鳴らす。
    // 法螺の集合とは別の音。既存の合成音と火元の座標を使う。
    rt.army.play('fireSpread', S, 0.8);
    rt.world.addSmokeColumn(S.x, rt.world.heightAt(S.x, S.z) + 6, S.z, { size: 3 });
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '搦手から本丸に火を放った', pts: 20 }; }, '任務達成・本丸に合図の火');
    rt.unzone('ote'); rt.unmark('ote3');
    // 早く火を付けても、懸かり・退きの太鼓や直前の鬨に集合の二声を重ねない。
    // 太鼓は十秒、鬨は札で意味を伝える六秒と届くまでの間を空ける。
    // 待つのは合図と後日談だけで、火付けはその場で済ませる。
    // 火付けで終幕へ移ると、未実行の懸かれは取りやめになる。鳴った合図だけを待つ。
    const signalWait = Math.max(0, F.honHorn ? F.honCallT + KAKARI_SOUND_SECONDS - rt.t : 0,
      (F.honShoutT ?? -Infinity) + 6.5 - rt.t, (F.oteUpT ?? -Infinity) + 6.5 - rt.t,
      F.retreatSignalStep === 4 ? F.retreatSignalAt + (F.retreatByVoice ? 4 : 10) - rt.t : 0);
    // 吹き手が残っていなくても成り立つ任務を先に示す。法螺の説明は実際の呼び出し時に足す。
    rt.obj('signalHold', '合図の火を守れ。近くの仲間と持ち場を守れ', 'order', true);
    if (signalWait > 0) {
      rt.objProgress('signalHold', '先の合図と声が収まるまで、仲間と持ち場を守れ');
      rt.banner('合図の火が上がる', '本陣への知らせ。仲間と持ち場を守れ');
      rt.say('組頭', '火は本陣への知らせじゃ。先の合図と声が収まるまで、仲間と持ち場を守れ！', 4);
    }
    const gather = () => {
      // 終幕は finish が勝敗を確定した後も続く。
      if (!F.win) return;
      if (!inabaGroupCall(rt, F.kino, 'sig_atsumare', 0.8)) {
        rt.banner('合図の火が上がる', '本陣への知らせ。仲間と持ち場を守れ');
        rt.objProgress('signalHold', '合図の火を守れ。近くの仲間と持ち場を守れ');
        rt.say('足軽', '合図の火が上がったぞ。近くの仲間と持ち場を守れ', 4);
        return;
      }
      F.gatherCalled = true;
      rt.objProgress('signalHold', '法螺貝の二声は集合の合図。組をまとめ、持ち場を守れ');
      rt.banner('合図の火が上がる', '法螺貝の二声で組をまとめ、持ち場を守れ');
      rt.say('組頭', '法螺の二声は集合じゃ！　火は本陣への知らせ。組をまとめ、持ち場を守れ！', 4);
    };
    if (signalWait > 0) rt.after(signalWait, gather); else gather();
    // 二声目は三秒後から鳴り、余韻と山道を伝わる遅れもある。
    // 集合の七秒間と届く間を空け、返す鬨の意味も六秒伝えてから後日談へ移す。
    const replyAt = signalWait + 8.5;
    rt.after(replyAt + 6.5, () => {
      // 公記の開城・舟による退去は局地戦の後日談。合図直後と同じ日には見せない。
      // 原文：https://note.com/senmi/n/n2d9649c5ce53
      blackCut(rt, () => {
        F.opened = true;
        // 舟が出ても城内に龍興が残っていた。討取りを起こさず、既存の退場処理で居所から外す。
        // 乗船地点・移動経路は未詳なので、城から川への瞬間移動は見せない。
        if (F.keep.lord && !F.keep.lord.gone) rt.army.despawn(F.keep.lord);
        rt.banner('囲みの末、城が開く', '信長公記では八月十五日。龍興は舟で長島へ退いた');
        F.departBoat?.();
        // 放火の日付が未詳なので、開城までの日数も確定しない。
        rt.say('', '――後日の開城。包囲の日数は未詳。落城を九月とする説もある', 5);
      }, '後日の開城\n囲みが続いたのち、龍興は舟で長島へ');
    });
    // 龍興が逃げた知らせで終わる（次の戦の前ふりは置かない）
    rt.after(replyAt + 13.5, () => rt.say('使番', '龍興は川を舟で下り、長島へ逃げたぞ！', 4));
    // 合図の後も各備は持ち場を保つ。
    for (const b of F.attackers) b.order({ id: 'hold' });
    // 集合の二声の後、麓に残る味方の現在位置から返す。無人の大手口からは鳴らさない。
    rt.after(replyAt, () => {
      if (!F.win || !F.gatherCalled) return;
      if (!inabaGroupCall(rt, F.shiba, 'tokiOrder', 0.8)
        && !inabaGroupCall(rt, F.niwa, 'tokiOrder', 0.8)) return;
      rt.objProgress('signalHold', '麓の鬨は味方の返し。集合の合図に従い、組で持ち場を守れ');
      rt.say(F.kinoU.alive ? officer(rt) : '組頭', '麓の鬨は味方の返しじゃ。法螺貝の二声に従い、組をまとめて持ち場を守れ', 3);
    });
    rt.after(replyAt + 10.5, () => rt.say('', '――信長は井口を「岐阜」と改め、「天下布武」の印を使い始めた', 3));
    rt.player.u.invuln = true;
    // 戦固有の終幕（開城・岐阜・箕作城への一行）を最後まで見せる。共通の追撃に替えて時計を消さない
    rt.finish({ scriptedEnd: true }, replyAt + 17.5);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.torches) {
      if (F.step === 1 && !F.ending && !rt.over && rt.player.u.alive) F.torches.update();
      else { F.torches.stop(); F.torches = null; }
    }
    // 旗から離れた時は任務と同じ矢印で戻り道を伝える。距離に余裕を持たせ、札を揺らさない。
    if (rt.t >= (F.regroupAt || 0)) {
      F.regroupAt = rt.t + 1;
      const p = rt.player.u.pos, q = F.kinoU.pos;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      // 旗へ戻すのは麓の守りだけ。家の火付けや本丸の任務から呼び戻さない。
      F.regroup = F.step === 2 && !inabaInsideHoldLine(rt) && d > (F.regroup ? 24 : 40);
      if (F.regroup && !F.sig && F.clearT === undefined && !F.ending && !F.regroupSaid) {
        F.regroupSaid = true;
        rt.bark('味方から離れた。藤吉郎の旗へ戻り、鹿垣の内で備えよ', true);
      }
    }
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    // 固有の守兵・供も含めた実兵枠。部隊だけの枠に任せて二百五十人を越さない。
    if (rt.t >= (F.budgetAt || 0)) {
      F.budgetAt = rt.t + 1;
      let live = 0;
      for (const u of rt.army.units) if (u.alive && !u.isStruct) live++;
      // 弱い端末（device_tier.js）は遠い備の本物を少し早めに止める。目の前の乱戦の兵は減らさない（稲生 1）。
      let room = Math.max(0, (TIER.weak ? 200 : 235) - live);
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
    }
    if (F.woundAdvice && !F.deepWoundAdvice && rt.t - F.woundAdviceAt >= 8 && rt.player.u.hp < rt.player.u.maxHp * 0.4) {
      F.deepWoundAdvice = true;
    }
    // 層（Z0〜Z5）：自分が新しい層へ入ったら一度だけ知らせる（金華山を下から上へ登っている手応え）
    { const p = rt.player.u.pos, L = LAYERS.find((q) => q.test(p.x, p.z)); if (L && L.id !== F.layer) { F.layer = L.id; F.layerSeen[L.id] = true; } }
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
      if (F.lit < NEED && !rt.G.lord) {
        // 畳んだ案内と主の札で、先に必要な操作をそろえる。
        this.nextObj(rt, F.carry ? 'まず「竹束を据える」を長押し。それから火の印の家へ'
          : `火の印の家へ。「火をつける」を押そう（${NEED}軒）`);
        rt.objProgress('main', F.carry ? `${F.lit}／${NEED}軒・竹束を置き、手を空けよ`
          : `${F.lit}／${NEED}軒・印の家へ。「火をつける」を押そう`);
      }
      if (F.lit < NEED && rt.G.lord && rt.t >= (F.torchGuideAt || 0)) {
        F.torchGuideAt = rt.t + 1;
        this.guideTorchGuard(rt);
      }
      if (rt.t > (F.mhT || 0)) { F.mhT = rt.t + 1; if (F.lit < NEED) this.markHouses(rt); }
      // 火を放ちに来ない時は、藤吉郎がやり方を言う（一度だけ）
      if (rt.t - F.stepT > 45 && F.lit < NEED && !F.burnCall) {
        F.burnCall = true;
        rt.say(officer(rt), rt.G.lord ? '火付けの足軽を守れ。家の脇の敵を払うのじゃ'
          : F.carry ? 'まず「竹束を据える」を長押し。それから火の印の家へ'
          : '火の印の家へ。「火をつける」を押せ', 4);
      }
    }
    if (F.step === 2) {
      // さくの左右で戦っている間は集合へ戻さない。持ち場の外へ離れた時だけ印を戻す。
      if (F.holdArrived && F.holdPoint && !inabaInsideHoldLine(rt) && Math.hypot(rt.player.u.pos.x - F.holdPoint.x, rt.player.u.pos.z - F.holdPoint.z) > 18) {
        F.holdArrived = false;
        rt.marker('holdFlag', F.holdPoint, 'さくの旗', { h: 0, guideAlways: true, guideArea: 'wait', guideWaitRing: true, guideFlag: true, guideFlagFrame: true, guideRadius: 3, guideFlagMesh: () => F.kinoU.alive ? F.kinoFlag : null });
      }
      // 左右の仲間と並んだ時も到着。旗の真下まで戻らせず、守りの帯と判定をそろえる。
      // 到着は案内だけの区切り。敵の動きや戦の進みはそのまま。
      if (!F.holdArrived && inabaInsideHoldLine(rt)) {
        F.holdArrived = true; rt.unmark('holdFlag');
        // 持ち場を出入りしても、同じ呼びかけは八秒あける。
        if (rt.t - (F.holdSaidAt ?? -Infinity) >= 8) {
          F.holdSaidAt = rt.t;
          rt.say(officer(rt), 'ここで仲間と並べ。敵は坂へ追うな', 3);
        }
      }
      const qs = [F.ote, F.ote2].filter(Boolean);
      // 先の勢が崩れた時は、札の待ち時間も実際の出発に合わせる。
      if (gone(F.ote) && !F.ote2.sent && !F.ote2Q) {
        F.ote2Q = true; F.ote2Due = Math.min(F.ote2Due, rt.t + 5);
        this.oteWarn(rt); rt.after(5, () => this.ote2(rt));
      }
      if (rt.t - F.stepT > 3) {
        this.nextObj(rt, F.regroup ? '藤吉郎の旗へ戻れ。さくの内で備えよ'
          : !F.holdArrived ? 'さくの旗へ。仲間と並んで敵を迎えよ'
          : inabaSallyWait(rt) || (F.carry ? 'まず「竹束を据える」を長押し。さくの内で仲間と押し返せ'
          : 'さくの内で、城の敵を仲間と押し返せ'));
        // まだ坂を下りていない新手も数え、全て倒したように見せない。
        const left = (gone(F.ote) ? 0 : 1) + (gone(F.ote2) ? 0 : 1);
        rt.objProgress('main', F.regroup ? '坂へ進まず、旗の印へ戻れ。仲間と並んで迎えよ' : inabaSallyWait(rt, true)
          || (F.ote2.sent ? `残る敵は${left}組。坂へ追わず、仲間と押し返せ`
          : `坂の上の新手も含め、残り${left}組。さくの内で迎えよ`));
      }
      // 引きつけて一斉に放つ。麓の左右の鉄砲も同時に鳴る
      // 坂の待機位置も射程内。城兵が動く前に「引きつけた」と撃たせない。
      // 射線の確認は半秒に一度だけ。兵と座標は既存の物を使う。
      let volleyGun = null;
      if (!F.oteVolley && (F.oteCharging || F.ote2.sent) && rt.t >= (F.oteVolleyCheckAt || 0)) {
        F.oteVolleyCheckAt = rt.t + 0.5;
        volleyGun = inabaVolleyGun(rt, F.nGun, qs);
      }
      if (volleyGun) {
        F.oteVolley = true; F.nGun.fire = true; F.nGun.holdFire = false;
        F.oteVolleyUntil = rt.t + 6;
        rt.say('鉄砲頭', '引きつけた……放て！', 2.5);
        // 下知の時点ではまだ構え中。発砲音は実際に筒先が火を吹いた時の共通の合成音に任せる。
        // 撃てた数と間隔から斉射・ばら撃ちをまとめるため、一挺だけでも四挺分を先鳴らししない。
        for (const C of F.footClash || []) C.volley('A');
        for (const q of qs) if (!gone(q)) q.morale = Math.max(0, q.morale - 15);
      }
      // 「放て」の下知も、鳴っている法螺・太鼓・鬨と一緒に伝える。
      const call = oteSignalText(rt, true);
      if (call) rt.objProgress('main', call + 'さくの内で仲間と迎えよ');
      // 坂の上に残って矢玉を放つだけの数人を、いつまでも追わせない。新手が下りて七十秒か、残りが三人ずつ以下なら山へ退く
      if (F.ote2.sent && !qs.every(gone) && (rt.t - F.ote2T > 70 || qs.every((q) => gone(q) || q.count <= 3))) for (const q of qs) if (!gone(q)) { q.noRout = false; q.morale = 0; }
      // 公記の順序を保ち、翌日の鹿垣と三人衆の参着を済ませてから山へ進む。
      if (F.sannin && F.ote2.sent && qs.every(gone)) {
        // 坂の城兵が崩れ、麓の左右の城兵も山へ逃げ上る
        if (!F.karaWaiting) {
          F.karaWaiting = true;
          rt.unmark('ote'); rt.unmark('ote2');
          for (const C of F.footClash || []) C.rout('B', { from: 0, minFight: 0 });
          if (rt.t < inabaFootSoundUntil(F)) rt.say(officer(rt), '城兵は退いた。先の合図が収まるまで鹿垣の内で組を整えよ。その後は太鼓と法螺を控え、裏道へ回るぞ', 4);
        }
        if (rt.t < inabaFootSoundUntil(F)) {
          rt.objProgress('main', oteSignalText(rt, true) + '先の合図が収まるまで鹿垣の内で組を整えよ。その後は太鼓と法螺を控え、裏道へ');
        } else {
          rt.objDone('main');
          this.karamete(rt);
        }
      }
    }
    if (F.step === 3) {
      inabaClimbClash(rt);
      if (F.climbFriends && rt.t >= (F.pressureAt || 0)) pressureTick(rt, '裏道', CLIMB_NO_CHASE, F.climbFriends, '藤吉郎の列と次の曲がり角へ進め。近い守兵を仲間と退けよ');
      const p = rt.player.u.pos;
      const guardCleared = F.guardOn && gone(F.kguard);
      // 先頭が木戸に着いても、後ろの自分には曲がり角を案内し続ける。
      if (guardCleared && !F.guardCleared) {
        F.guardCleared = true; F.karaGuideAt = 0;
        rt.unmark('kguard');
        // 木戸前まで来た本人へ、済んだ登りをもう一度命じない。
        if (!inabaAtWoodGate(rt)) rt.say(officer(rt), '木戸の守りは退いた。道の印をたどれ', 3);
      }
      const followRoad = !F.guardOn || guardCleared || !inabaAtWoodGate(rt);
      if (inabaWoodGateWait(rt)) {
        if (F.karaGuideMarked) { rt.unmark('karaGuide'); F.karaGuideMarked = false; }
        this.nextObj(rt, '木戸前で仲間と並べ。列がそろったら本丸へ');
        rt.objProgress('main', '木戸の守りは退いた。藤吉郎の列を待て');
        if (!F.gateWaitSaid) {
          F.gateWaitSaid = true;
          rt.say(officer(rt), '木戸の守りは退いた。木戸前で列をそろえよ', 3);
        }
      }
      else if (followRoad && rt.t >= (F.karaGuideAt || 0)) {
        // 一秒ごとでは走る足が角を通り過ぎる。四分の一秒で行き先を替える。
        F.karaGuideAt = rt.t + 0.25;
        // 登り口から順に案内し、近くの別の折れへ印を戻さない。
        let next = F.karaNext;
        // 角まで寄ってから次へ進める。三歩手前では斜めに山肌を切ってしまう。
        while (next < KARA_TRAIL.length - 2 && roadCornerPassed(rt.world, p, KARA_TRAIL, next, 1.2)) next++;
        F.karaNext = next;
        const q = F.karaGuide || (F.karaGuide = { x: 0, z: 0 });
        roadApproach(rt.world, p, KARA_TRAIL, next, q);
        // 後ろの区間へ戻る途中は、到達済みの段で木戸前と呼ばない。
        const goal = KARA_TRAIL[next];
        q.lastCorner = next === KARA_TRAIL.length - 2
          && Math.hypot(q.x - goal[0], q.z - goal[1]) < 0.2;
        if (!F.karaGuideMarked) { F.karaGuideMarked = true; rt.marker('karaGuide', () => F.karaGuide, () => F.karaGuide.returning ? '道の中央' : F.karaGuide.fighting ? '近い守兵・仲間と追い払え' : F.karaGuide.lastCorner ? '搦手の木戸前' : '次の曲がり角', { guideAlways: true, guideArea: 'move', guideRadius: 1.2, h: 0 }); }
        // 近い守兵を一秒ごとに探し、印は既存の兵の現在地をたどる。
        // 道案内の更新を速めても、全兵の探索は増やさない。
        if (rt.t >= (F.karaFightAt || 0)) {
          F.karaFightAt = rt.t + 1;
          F.karaFightUnit = null;
          for (const u of rt.army.units) {
            if (u.team !== 1 || u.isStruct || u.group?.hidden || u.group?.noAI || u.group?.civ) continue;
            if (!u.noTarget && inabaMeleeContact(rt, rt.player.u, u)) {
              F.karaFightUnit = u;
              break;
            }
          }
        }
        const foe = F.karaFightUnit;
        // 同じ段で槍が届く相手だけを案内する。敵が壁の向こうへ動いたら道案内へ戻す。
        const fighting = !!foe && !foe.noTarget && inabaMeleeContact(rt, rt.player.u, foe);
        q.fighting = fighting && !q.returning;
        // 道を外れた時は、安全な足場への案内を先にする。
        if (q.fighting) { q.x = foe.pos.x; q.z = foe.pos.z; }
        this.nextObj(rt, q.returning ? '道の印へ戻れ。そこから曲がり角へ進め'
          : fighting ? F.carry ? 'まず「竹束を据える」を長押し。近い守兵を仲間と追い払え' : '近い守兵を仲間と追い払え'
          : q.lastCorner ? '道の印へ。藤吉郎の列で木戸前まで登れ' : '声をひそめ、道の印をたどれ。藤吉郎の列で登れ');
        rt.objProgress('main', q.returning ? '崖を横切らず、土の道の印へ寄れ。仲間と曲がり角へ進め'
          : fighting ? '列を離れるな。敵が退いたら、道の印へ進め'
          : `${q.lastCorner ? '木戸前' : '次の曲がり角'}まで ${Math.max(0, Math.round(Math.hypot(p.x - q.x, p.z - q.z)))}歩ほど・藤吉郎の旗に続け`);
      }
      else if (!followRoad) {
        if (F.karaGuideMarked) { rt.unmark('karaGuide'); F.karaGuideMarked = false; }
        this.nextObj(rt, F.carry ? 'まず「竹束を据える」を長押し。仲間と木戸の守りを追い払え'
          : '仲間と木戸の守りを追い払え');
        rt.objProgress('main', '藤吉郎の列と槍をそろえよ');
      }
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
          for (const g of [F.koshiGuard, F.ambush, F.ambushGun, F.towerArchers, F.scout, F.patrol, ...F.climbGuards]) {
            if (!g || gone(g)) continue;
            const c = g.center();
            if (Math.hypot(c.x - kc2.x, c.z - kc2.z) < 30) { g.noRout = false; g.morale = 0; }
          }
          for (const u of F.kino.units) if (u.alive && !u.atk) { u.target = null; u.moveTo = null; u.aiT = 0; }
        }
      }
      if (!F.koshiBroke && F.kino.order === 'path' && F.kino.pathIdx >= KARA_TRAIL.indexOf(KARA[4])) {
        F.koshiBroke = true;
        for (const g of [F.ambush, F.ambushGun, F.koshiGuard, F.towerArchers, F.scout]) if (g && !gone(g)) { g.noRout = false; g.morale = 0; }
      }
      // 縦列で登る間、遅れた一人（遠い的を狙う鉄砲など）を待ち続けて列が止まらないよう、的を外して列へ戻す
      if (F.kino.order === 'path' && (F.kino._waitT || 0) > 8) for (const u of F.kino.units) if (u.alive && !u.atk && Math.hypot(u.pos.x - F.kino.anchor.x, u.pos.z - F.kino.anchor.z) > 9) { u.target = null; u.moveTo = null; u.aiT = 0; }
      // 折れの多い細道では、列の持ち場が道の曲がりに合わず、いつも「少し伸びた」扱いで三割の歩みになる。
      // その間だけ先頭の歩みを倍にし、登りを七分の上限の内に収める（兵の歩く速さ・当たりは変えない）。
      if (F.kino.order === 'path') F.kino.speed = (F.kino._tailLag || 0) > 5 ? 6.4 : 3.2;
      // 遅れた一人が切岸や折れの外の持ち場へ寄れず、六秒動けない時は、その者を列の待ちに数えない。
      // 先頭が進めば持ち場も道の先へ移り、遅れた者は自分の足で後を追う（位置は書き換えない）。
      if (F.kino.order === 'path' && rt.t >= (F.kinoStuckAt || 0)) {
        F.kinoStuckAt = rt.t + .25;
        const K = F.kino, s = F.kinoStuck || (F.kinoStuck = { u: null, x: 0, z: 0, t: 0, skip: null });
        let worst = null, wd = 9, rest = 0;
        for (const u of K.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.rearWound || u.downed || u.noTarget) continue;
          const home = K.slotPos(u.slot, K.initial), d = Math.hypot(home.x - u.pos.x, home.z - u.pos.z);
          if (u === s.skip) { if (d < 6) s.skip = null; continue; }
          if (d > wd) { wd = d; worst = u; }
          rest = Math.max(rest, d);
        }
        if (!worst || s.u !== worst || Math.hypot(worst.pos.x - s.x, worst.pos.z - s.z) > 1) {
          s.u = worst; s.t = rt.t; if (worst) { s.x = worst.pos.x; s.z = worst.pos.z; }
        } else if ((K._waitT || 0) > 0 && rt.t - s.t > 6) { s.skip = worst; s.u = null; }
        if (s.skip?.alive) { K._tailLag = rest; K._tailCheckAt = rt.army.time + .5; }
        else s.skip = null;
      }
      // 深手で足の遅い者・道で引っかかった者が列を何分も止めると、自分だけが先へ登って迷う。
      // 列が八秒待っても追いつかず、画面に映らない遅れた者だけ、後ろへ残った扱いで場から外す。斬り合い中の兵は外さない。
      if (F.kino.order === 'path' && (F.kino._waitT || 0) > 8) {
        const me = rt.player.u.pos;
        for (const u of F.kino.units) {
          if (!u.alive || u.atk || u.swing || u.target || u === F.kinoU || u.name) continue;
          const home = F.kino.slotPos(u.slot, F.kino.initial);
          if (Math.hypot(home.x - u.pos.x, home.z - u.pos.z) > 9 && Math.hypot(me.x - u.pos.x, me.z - u.pos.z) > 15 && !sightScreenUnit(rt, u)) rt.army.despawn(u);
        }
      }
      for (const g of F.climbGuards) if (!g.sent && !gone(g) && Math.hypot(p.x - g.anchor.x, p.z - g.anchor.z) < 16 && Math.abs(p.y - rt.world.heightAt(g.anchor.x, g.anchor.z)) < 8) {
        g.sent = true; g.sentAt = rt.t; g.noAI = false; g.order = 'attack'; g.seekRange = 24; g.aggro = 12;
        rt.marker(g.name, centerOf(g), g.name, { red: true, group: g });
      }
      // 小勢は列を止めて二十秒で引く。麓の守兵を山上まで追わせない。
      for (const g of F.climbGuards) if (g.sent && !gone(g) && rt.t - g.sentAt > 20) { g.noRout = false; g.morale = 0; }
      if (!F.guardOn) this.climbEvents(rt);
      // 木戸前の段へ実際に着いてから斬り合いを始める。
      // 下の折れや、離れた列の中心から退却までの時間を数え始めない。
      if (!F.guardOn && (nearClimbSpot(rt, p, 4, 12)
        || F.kinoU.alive && nearClimbSpot(rt, F.kinoU.pos, 4, 12))) this.guardFight(rt);
      // 木戸の守りと三十秒斬り合えば、裏を取られた守りは本丸へ退く（切岸の上に残る数人を探し続けさせない）
      if (F.guardOn && !gone(F.kguard) && rt.t - F.guardT > 30 && !F.kguardBroke) { F.kguardBroke = true; F.kguard.noRout = false; F.kguard.morale = 0; }
      if (F.guardOn && gone(F.kguard)) {
        // 先に守りが崩れても、藤吉郎の縦列は最後の曲がり角を通す。
        if (inabaAtWoodGate(rt) && (F.kino.order !== 'path' || Math.hypot(kc.x + 30, kc.z + 118) < 10 || rt.t - F.guardT > 20)) this.signal(rt);
      }
    }
    if (F.step === 1 && F.clearT !== undefined) {
      const qs = F.townGuards;
      // 全て退いたら先に持ち場を替える。もう来ない新手を待つ下知を積まない。
      if (F.town2.sent && qs.every(gone)) {
        // 退き太鼓や番兵の声を、暗転後の翌日の備えの合図へ持ち越さない。
        const soundUntil = Math.max(F.townHorn ? F.stepT + 8 : -Infinity,
          (F.townGuardShoutT ?? -Infinity) + 6.5, (F.townShoutT ?? -Infinity) + 6.5,
          F.retreatSignalStep === 1 && !F.retreatByVoice ? F.retreatSignalAt + 10 : -Infinity);
        if (rt.t < soundUntil) {
          this.nextObj(rt, '町の出口で仲間と並べ。合図の後、翌日の囲みへ');
          rt.objProgress('main', townSignalText(rt) + '先の合図が収まるまで、町の出口で仲間と隊を整えよ');
          if (!F.townSoundWait) {
            F.townSoundWait = true;
            rt.unmark('kino'); rt.unmark('townGuard');
            // 家のない東の往来の先。守兵を払ってから出口へ案内する。
            rt.marker('townExit', { x: 25, z: 44 }, '町の出口', { h: 0, guideAlways: true, guideRadius: 8, guideSymbol: 'gate' });
            rt.say(officer(rt), '敵は退いた。出口で並べ。合図の後、翌日の囲みへ移るぞ', 4);
          }
          return;
        }
        F.clearT = undefined; F.step = 1.5;
        rt.unmark('town'); rt.unmark('town2');
        rt.objDone('main');
        this.sally(rt);
      }
      // 家の脇の守兵も達成条件に入る。同じ名の組は残りの数で区別する。
      else if (rt.t >= (F.townGuideAt || 0)) {
        F.townGuideAt = rt.t + 1;
        // 遠い新手より近くの守りを先に示す。八歩の余裕を持たせ、同じ名の組の間で印を揺らさない。
        let target = null, nearest = Infinity, left = 0;
        const p = rt.player.u.pos;
        for (const g of qs) if (!gone(g) && (g !== F.town2 || g.sent)) {
          left++;
          const c = g.center();
          const d = Math.hypot(c.x - p.x, c.z - p.z) - (g === F.townTarget ? 8 : 0);
          if (d < nearest) { target = g; nearest = d; }
        }
        if (target && F.townTarget !== target) {
          F.townTarget = target;
          rt.unmark('kino');
          // 敵が動いても古い中心へ向かわせず、残る守兵を指す。
          rt.marker('townGuard', () => nearGuard(rt, target), target.name, { red: true, group: target });
          // 続けて組が崩れても、同じ下知は八秒あける。
          if (rt.t - (F.townGuideSaidAt ?? -Infinity) >= 8) {
            F.townGuideSaidAt = rt.t;
            rt.say(officer(rt), '火は付いた。印の守兵を仲間と追い払え', 3);
          }
        }
        if (!target) {
          // 火付けの初めに消した旗の印を、集合の任務に合わせて戻す。
          if (!F.townWaiting) {
            rt.marker('kino', () => F.kinoU.alive ? F.kinoU.pos : null, '藤吉郎の旗・新手に備えよ', { group: F.kino, guideAlways: true });
            if (rt.t - (F.townWaitSaidAt ?? -Infinity) >= 8) {
              F.townWaitSaidAt = rt.t;
              rt.say(officer(rt), '近くの敵は去った。わしの旗で新手を迎えよ', 3);
            }
          }
          F.townTarget = null; rt.unmark('townGuard');
        }
        F.townWaiting = !target;
        // 畳んだ札でも、敵を探す時と新手を迎える時を取り違えさせない。
        this.nextObj(rt, target ? F.carry ? 'まず「竹束を据える」を長押し。印の守兵を仲間と追い払え'
          : `${target.name}を仲間と追い払え`
          : F.kinoU.alive && rt.distTo(F.kinoU.pos) > 8 ? '藤吉郎の旗へ。仲間と新手に備えよ'
          : '旗の横で仲間と並べ。新手を迎えよ');
        rt.objProgress('main', target ? `${target.name}・残る守りは${left}組${F.carry ? '。竹束を置いて手を空けよ' : ''}`
          : F.town2.sent ? '近くの敵は退いた。仲間と次の持ち場へ'
          : rt.t - F.stepT < 12 ? `旗の横で並べ。新手が動くまであと${Math.ceil(12 - (rt.t - F.stepT))}秒`
          : '旗の横で並べ。新手がこちらへ来る');
      }
    }
    if (F.step === 4 && F.hata) {
      // 竹束を担いでいる間は、火付けより先に手を空ける案内を保つ。
      if (F.sig && F.carry) rt.objProgress('main', '竹束を置いて手を空けよ。それから小屋に火を付けよ');
      // 本丸の口へ歩く列も、遅れた一人を待ち続けない
      for (const K2 of [F.kino, F.hachi]) if (K2 && K2.order === 'path' && (K2._waitT || 0) > 8) for (const u of K2.units) if (u.alive && !u.atk && Math.hypot(u.pos.x - K2.anchor.x, u.pos.z - K2.anchor.z) > 9) { u.target = null; u.moveTo = null; u.aiT = 0; }
      if (rt.t >= (F.honGuideAt || 0)) {
        F.honGuideAt = rt.t + 1;
        if (F.sig) this.guideSig(rt); else this.guideHon(rt);
      }
      // 表と裏から挟まれて四十五秒、残る旗本も主殿の奥へ退く（合図の火を放てないまま囲みの時間切れにしない）
      if (!F.sig && !F.honBroke && rt.t - F.stepT > 45) { F.honBroke = true; for (const g of F.honGuards) if (!gone(g)) { g.noRout = false; g.morale = 0; } }
      if (!F.sig && F.hata.every(gone) && gone(F.tatsu) && gone(F.keep.guard)) this.lightSig(rt);
      // 合図は本人が実際に火を付けるまで待つ。
      if (F.sig && rt.t - F.sigT > 20 && !F.sigCall) { F.sigCall = true; rt.say(officer(rt), F.carry ? '竹束を置いて手を空けよ。それから合図の火じゃ' : inabaSignalDetour(rt) ? '道の印へ。建物の外を回って小屋へ行け' : '小屋の手前の印じゃ。火を付けて合図を送れ', 3); }
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

// 総勢は備え表の仮数。未参着の三人衆を、戦場にいる兵として先に数えない。
// 参着による増加を損耗と混同しないよう、表示の基準数も一緒に替える。実兵・乱戦は変えない。
const INABAYAMA_ODA_TOTAL = INABAYAMA_JIN[0].sonae.reduce((sum, s) => sum + s.soldiers, 0);
const INABAYAMA_MINO_TOTAL = INABAYAMA_JIN[0].sonae.find((s) => s.id === 'ibMino').soldiers;
const INABAYAMA_SAITO_TOTAL = INABAYAMA_JIN[1].sonae.reduce((sum, s) => sum + s.soldiers, 0);
const INABAYAMA_FORCE = { a: 0, a0: 0, b: 0, b0: INABAYAMA_SAITO_TOTAL };
// 備え表と同じ仮数に、結び付いた部隊の残存率を掛ける。
// 軽い兵と本物の兵を二重に数えず、退いた生存兵を戦死者にも数えない。
function inabaRemaining(spec, bound, detached) {
  const source = bound?.source, group = bound?.real;
  let initial = 0, alive = 0;
  // 部隊の名目人数は、その部隊に含まれる実兵を含む。実兵を重ねて足さない。
  if (source?.aliveNominal) { initial = source.nominal; alive = source.aliveNominal(); }
  else if (group?.initial > 0) { initial = group.initial; alive = group.count; }
  if (detached) for (const g of detached) {
    initial += g.initial; alive += g.count;
  }
  const rate = initial > 0 ? alive / initial : 1;
  return Math.round(spec.soldiers * Math.max(0, Math.min(1, rate)));
}
inabayama.force = (rt) => {
  const F = rt.flags;
  INABAYAMA_FORCE.a0 = INABAYAMA_ODA_TOTAL - (F.sannin ? 0 : INABAYAMA_MINO_TOTAL);
  INABAYAMA_FORCE.a = 0; INABAYAMA_FORCE.b = 0;
  for (const spec of INABAYAMA_JIN[0].sonae) {
    if (spec.id === 'ibMino' && !F.sannin) continue;
    INABAYAMA_FORCE.a += inabaRemaining(spec, F.earlyJin?.[spec.id], F.odaForceGroups?.[spec.id]);
  }
  for (const spec of INABAYAMA_JIN[1].sonae)
    INABAYAMA_FORCE.b += inabaRemaining(spec, F.earlyJin?.[spec.id], F.saitoForceGroups?.[spec.id]);
  return INABAYAMA_FORCE;
};
inabayama.sides = { a: { name: '織田軍（兵数は仮）', mon: 'oda' }, b: { name: '斎藤軍（兵数は仮）', mon: 'saito' } };

// 軍議（gungi.js）：金華山を回して見て、外の部隊の攻め口を三つから選ぶ（遊びの既定は七曲り）。
// 自分（藤吉郎の手）は、どの作戦でも町を焼いてから搦手を登る。作戦で変わるのは、外の部隊の道・本丸の守りの厚さ・大手の手薄さ
inabayama.gungi = (rt) => {
  if (!rt.G.lord) return null;
  const F = rt.flags;
  // 戦闘用に圧縮した内部人数ではなく、備え表の仮の兵数へ残存率を掛ける。
  // 未参着の三人衆は attackers に入るまで数えない。戦う兵や損耗の計算は変えない。
  const nom = (b) => b ? Math.round((b.jinkeiSpec?.soldiers ?? b.nominal) * b.aliveNominal() / b.nominal) : 0;
  const G = {
    center: { x: 0, z: -60 }, dist: 170,
    // 束31：info を足す（俯瞰の説明）
    landmarks: [
      { name: '本丸', x: HON.x, z: HON.z, info: '主殿を守る曲輪。東は切岸と土塀（推定）' },
      { name: '大手の木戸', x: OTE.x, z: OTE.z, info: '正面の口。市の調査では斎藤期の登城路は北の竪堀の手前から尾根へ登ったと推定。画面の道筋と木戸の位置は遊びの補い' },
      { name: '上台所の石垣と城門（推定配置）', x: OTE.x - 14.5, z: OTE.z - 2, info: '岐阜市の発掘で道三期とみられるコの字状の石垣を確認。城門があった可能性も示されている。高画質では石垣の開いた側に冠木門を補う。位置・寸法・門の形式は推定' },
      { name: '東斜面の竪堀', x: 72, z: -80, info: '市の調査では斎藤期に掘り、信長期に埋めて通路にしたと推定。この戦では攻略前の開いた堀を補う。位置・長さ・深さと途中の通行口は遊びの補い' },
      { name: '二の丸', x: NI.x, z: NI.z, info: '腰曲輪の先。道が狭い' },
      { name: '山上の水の備え', x: NI.x - 7, z: NI.z - 6, info: '岩をくりぬき、雨水としみ出す水をためて籠城に備える。二か所の配置・寸法・岩の口と斎藤期の姿は推定。金銘水の実測復元ではない' },
      // 岐阜市の案内では七曲りの登山口は山の南西側。東の斜面に札を置かず、描く道の座標を共有する。
      // https://www.city.gifu.lg.jp/kankoubunka/kankou/1013265/1013573.html
      { name: '七曲りの登り口', x: ROAD[3][0], z: ROAD[3][1], info: '南西の山裾から登る道。入口と道筋は圧縮した推定。ここからの攻撃は公記に記載なし' },
      { name: '七曲り', x: ROAD[4][0], z: ROAD[4][1], info: '大手へ折り返して登る道。長さは短縮した推定で、当時の道筋の実測復元ではない' },
      { name: '東の尾根道', x: HYAKU[2][0], z: HYAKU[2][1], info: '東の肩に置いた遊びの仮道。実在する百曲りの位置を表さない' },
      { name: '西の裏道', x: KARA[2][0], z: KARA[2][1], info: '西の肩に置いた遊びの仮道。北側を回る水手道の再現ではない' },
      { name: '井口の町', x: 16, z: 70, info: '公記では強風の日に放火。風向きと時刻は不明。日中の光と煙の流れる向きは遊びの仮設定' },
      { name: '西麓の城下町', x: INABA_FAR_TOWN[0].x, z: INABA_FAR_TOWN[0].z, info: '市の文化的景観の資料では城下町は金華山の西麓。遠景の二群を本陣の西側へ南北に並べる。家の位置・道筋・焼失範囲は推定。南の戦う町は遊びのために圧縮した仮配置' },
      { name: '瑞龍寺山の本陣', x: ZUI.x, z: ZUI.z, info: '金華山から続く山稜の南西端。尾根の線・幅・高さと町との距離は圧縮した推定' },
      { name: '長良川（北の天然の堀）', x: NAGARA_NORTH[2][0], z: NAGARA_NORTH[2][1], info: '金華山の北を流れ、西へ回って下る。深い本流は徒歩で渡れない。川幅・河道・水深は遊びの仮値' },
      { name: '長良川の舟着き', x: FUNA.x, z: FUNA.z, info: '龍興の舟による退去は公記に記録あり。開城の後日談で一艘が川下へ進む。乗船地点・舟の形・隻数・航路・速さは遊びの推定' },
    ],
    nawabari: F.K,
    lines: [
      { name: '大手（三の丸）', owner: '敵' }, { name: '腰曲輪', owner: '敵' }, { name: '二の丸', owner: '敵' }, { name: '本丸', owner: '敵' },
    ],
    units: [{ id: 'main', name: '囲みの別働隊（総勢の一部。兵数・配置は仮。三人衆は翌日参着）', group: () => F.oteYose1 && F.oteYose1.real, nominal: () => (F.attackers || []).reduce((s, b) => s + nom(b), 0) }],
    routes: Object.entries(STRATS).map(([id, s]) => ({ id, name: s.name })),
    default: { main: 'nanamagari' },
    enemy: [
      { name: '大手の備（日根野弘就の配置は推定）', known: false },
      { name: '東の尾根道の備（長井道利の配置は推定）', known: false },
      { name: '西の裏道・二の丸の備', known: false },
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
// 公記の八月一日は内応の申し入れ。出兵・放火の日付までは断定しない。
// 原文掲載：https://note.com/senmi/n/n2d9649c5ce53
inabayama.date = (rt) => rt.flags.opened ? '永禄十年　開城（公記では八月十五日）' : rt.flags.step >= 2 ? '永禄十年　囲み（公記の放火翌日）' : '永禄十年　井口の放火・強風（日付未詳）';
// 裏道で深手の時、bot の退避は道の次の曲がり角（藤吉郎の列のいる側）へ。法面へ退こうとして二分余り立ち止まった（10/26）。
inabayama.botRetreatWay = (rt, want) => (rt.flags.step === 3 && rt.flags.karaGuide ? rt.flags.karaGuide : want);
inabayama.canSkip = () => '';
inabayama.history = '『信長公記』は八月一日に美濃三人衆が内応を申し入れたと記す。続く出兵と井口の放火を同日とは断定せず、この戦では日付を未詳とする。放火翌日の囲みと八月十五日の開城は公記の記述に沿う。『岐阜市史』などには永禄十年九月の落城とする説があり、八月の落城を確定した事実とはしない。放火と包囲の時刻は不明で、日中の光は遊びの仮設定である。強風の記録は放火の日についてであり、翌日の囲みでは通常の風を仮に置く。永禄十年（1567）、西美濃の稲葉良通（一鉄）・氏家直元（卜全）・安藤守就の三人――美濃三人衆が織田方についた。内応の申し入れを受けた織田信長は、三人衆の人質がまだ来ないうちに兵を出し、稲葉山城と山続きの瑞龍寺山へ駆け上がった。瑞龍寺山は金華山から延びる山稜の南西端にある。この戦も本陣を南西へ置き、町の南から東の山裾へ回る低い尾根で金華山との峰続きを表す。尾根の線・幅・高さと町との距離は圧縮した推定で、実測復元ではない。本陣は城へ向く既存の配置に備え表の向きをそろえる。東の仮の尾根道の守兵は直前の折れから登ってくる側へ向け、備え表と兵で向きをそろえる。西の裏道の曲輪も、折り返した道の下り側へ備を向け、備え表と遠景の向きをそろえる。同じ仮道の物見・見回り・伏兵も、それぞれ直前の折れから登ってくる側を向く。物見櫓の射手も直下の登り道へ向け、木戸の守兵と上の段の鉄砲は、折り返し後の北の曲がり角へ備える。三か所の向きは仮道に合わせた推定で、兵数・持ち場・列幅と戦闘の下知は保つ。守備方向は道に沿う遊びの推定で、兵数・持ち場・列幅は保つ。位置は従来のままとし、攻め手に背を向ける向きだけを改める。いずれも細かな向きは遊びの推定である。本丸の馬廻・旗本・御殿前の控えも、一律の真西ではなく既存の西の虎口へ向ける。各持ち場と向きは史料にない遊びの推定で、位置・兵数・列幅は保つ。その日は風が強く、すぐに城下の井口の町を焼いて城を裸にした。翌日、普請を割り当て、四方に鹿垣を結って囲んだ。この戦でも組ごとの持ち場を台詞で伝え、高画質では囲みの後方に杭と柴の用材を置く。用材の集積場所・寸法・本数は推定である。そこへ美濃三人衆が参着し、進軍の早さに驚いて礼を述べた。この戦でも三人衆の備と旗は翌日の鹿垣完成後に現れる。鹿垣は南の戦列に加え、東西の山裾と北の川沿いにも置く。高画質では東西と北の柵にも織田の旗を添え、城方の防御柵ではなく包囲の持ち場として示す。旗の位置・高さ・本数は推定である。高画質では翌日に結べた東西・北の鹿垣の外へ、城を向く番兵も少人数の遠景で補う。番兵の持ち場・人数は推定で、総勢の一部を描くものであり、実兵と表示兵数へは加算しない。道・舟着き・川・急坂は避ける。外周の線は推定で、川・急坂・道・舟着きには通行口を残している。八月十五日、城主の斎藤龍興は降参し、舟で川を下って伊勢長島へ逃れた（信長公記は飛騨川続きと記す）。信長は井口を「岐阜」と改め、この城を新しい居城として、天下布武の印を使い始める。木下藤吉郎（のちの豊臣秀吉）が山の裏道から登った、と伝わる。これは後の『太閤記』などの話で、『信長公記』には城へ攻め上った記事はない。この戦では、放火の日と翌日の囲みを分け、八月十五日の開城は後日談で描く。搦手での局地戦と合図は遊びの補いで、これだけで城が降ったとはしない。総勢と各備の人数は仮の目安で、確定した兵数ではない。画面の兵数は備え表の仮数を基準とし、織田勢は三人衆の参着前に一万二千七百、参着後に一万五千、斎藤勢は四千を初期の目安とする。残存兵数には各備に結び付く部隊の残存率を掛けるが、これは遊びの損耗表示で、史実の戦死者数ではない。西の裏道の四百には道の守り・物見・伏兵・射手を、本丸の千二百には馬廻・控え・主殿内の守兵も含める。これらの別組の損耗も同じ仮数へ反映し、兵を重ねて加算しない。三人衆の二千三百も推定の割り振りであり、戦う兵や乱戦の数を増減させるものではない。参着する三人衆は西の乱戦へ重ねず、西麓の後方に控え、城へ向く。備え表・兵・旗の場所をそろえ、家並みと町の間へ同じ人数を並べる。稲葉だけの手と見せないよう、控えの呼び名を三人衆とし、稲葉の隊旗に加えて氏家・安藤の字の旗を置く。字の旗は識別用の補いで、当時の旗印の復元ではない。控えの位置・隊列の幅と奥行きは遊びの推定である。森・坂井の寄せ手は、放火と囲みの段では山腹へ先回りさせず、麓の鹿垣より南へ置く。両隊の位置は遊びのための推定で、兵数と左右の乱戦は保つ。曲輪の広さ、出丸と厩の位置、土塁・木戸・井楼・建物・小祠と斎藤期の山麓館は、絵図と同時代の美濃の土の城からの推定である。岐阜市歴史博物館の発掘成果では、斎藤氏の山麓館は永禄十年の攻略時に焼失したと考えられる。岐阜市の文化的景観の資料では城下町は金華山の西麓に広がる。この戦では遠景の二群を西麓へ置き、本陣の東の尾根上には家並みを置かない。移した家の煙と焼け跡も同じ位置へ追随させ、町人は家並みの川側を通って南へ逃れる。南の戦う町は遊びのために圧縮した仮配置とする。遠景の家の位置・道筋は推定である。遠景の家並みにも焼け焦げを反映し、翌日は低く崩れた壁と屋根を残す。遠景の焼失範囲と残り方は推定である。町の放火に合わせて館も燃え、翌日は焦げた建物と煙を残すが、出火時刻と焼け残り方は演出である。同館の報告で信長期の新設とされる二ノ門は置かず、その場所は遊びの通路として残した。東の小曲輪は後世の絵図を手掛かりにし、斎藤期の細かな姿まで確かとはしない。この戦では東の囲いを切岸と土塀で表し、後世の絵図の石垣を斎藤期の姿として置かない。ただし斎藤期にも石垣はあり、岐阜市の令和六年度発掘成果では一ノ門と上台所の巨石石垣が道三期とみられる。この戦では山頂入口の脇に自然石の石垣を部分的に補う。同調査で上台所に確認されたコの字状の巨石石垣も、高画質では大手の西の肩に補う。同調査は上台所の入口に道三期の城門があった可能性も示すため、この戦では石垣の開いた側に小さな冠木門を補う。門の位置・幅・形式と扉の開き方は推定で、瓦屋根は付けない。巨石と小さい石の石垣が同時に築かれた点を参考にするが、石垣の位置・高さ・石の割付は推定で、発掘遺構を実測復元したものではない。岐阜市の令和七年度調査では、一ノ門北側の竪堀の存在と幅約八・五メートルが確認された。同調査は大桑城の伝岩門との構造の類似から、斎藤期に竪堀を掘り、信長期に埋めて通路を造成したと推定する。斎藤期の登城路は、堀の手前から太鼓櫓の側へ登って尾根を通ったと考えられる。現在の通路を攻略時の道と同一視せず、この戦の道筋と堀の途中の通行口は遊びの補いとする。この戦では山頂入口の北側から東斜面へ延びる竪堀を補う。入口脇の短い窪みだけで終わらせず、東斜面の下方にも溝を続ける。下方の延長は岐阜市の調査成果を参考にした推定で、間の尾根道は遊びの通行口として掘り残す。配置・長さ・深さと永禄十年の攻略時に開いていた姿は推定で、発掘遺構の実測復元ではない。既存の大手道と東の尾根道は遊びの進路として残す。岐阜市の登山案内では水手道は山の北側を回り、山頂案内図では百曲りは西側に通じる。この戦の東の尾根道と西の裏道は、その二道の位置を再現したものではないため、実在の道名を当てず遊びの仮道として示す。仮道の道筋、川の幅と流れ、舟着きの場所は遊びの補いで、当時の道や川を確かに再現したものではない。長良川は金華山の北側を天然の堀として流れ、西へ回る地形に合わせた。北から西へ回る川床全体を山の持ち上げから外し、舟着き付近でも川が山腹を登る形にしない。ただし川幅と河道は縮めた戦場用の推定で、永禄十年当時の流路の実測復元ではない。本流には歩いて横断できない深みを設け、舟は城側の岸寄りで船底が川床に埋まらない位置へ寄せる。川床の掘り下げ量と舟の岸からの距離も遊びの仮値で、当時の実測水深ではない。山の比高は約三百メートルを保つが、登山道の長さは実距離に達していない。岐阜大学「岐阜の地学」の地質解説では、金華山は主に赤色・灰色のチャートからなる。高画質では地面の露岩と道脇の岩に共通の赤灰の斑を付ける。色の分布は推定で、地質境界の実測復元ではない。岐阜市の整備基本計画では、戦国期の金華山は大半の樹木が伐採されていたと推定される。この戦では城の斜面を疎らな林と切り株で表し、木は周辺へ寄せる。伐採範囲と切り株の位置・本数は推定の演出である。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
inabayama.lordAt = { x: ZUI.x, z: ZUI.z + 6, r: 14, why: '瑞龍寺山の本陣（信長は瑞龍寺山に陣を取り、井口の町を焼かせた）' };
inabayama.lordSpawn = { x: ZUI.x, z: ZUI.z + 14, heading: Math.atan2(28 - ZUI.x, 104 - (ZUI.z + 14)) };

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
  // 登りは中腹の折れから始まる。後ろの折れへ戻らないよう、次の角から道をたどる。
  if (F.step === 3 && !F.botKaraInit) { F.botKaraInit = true; b.botRoadPath = BOT_KARA; b.botRoadIndex = KARA_START + 1; }
  // 敵の前での退避は共通の survive に任せ、上役へ背を向けない。
  const c = F.kino.center();
  if (F.step === 0) {
    if (!F.joinedKino) {
      // 指の遊びでは一度だけ叩く札（inp.e）でないと「話す」が押されない（10/28 bot が 8 分ここで止まった）。
      if (b.nearestInteract()?.id === 'talk') { inp.e.add('KeyE'); inp.k.add('KeyE'); }
      else goTo(p, inp, F.kinoU.pos.x, F.kinoU.pos.z, 4);
    }
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
