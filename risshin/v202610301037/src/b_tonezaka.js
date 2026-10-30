import { useTerrain } from './asset_manifest.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { S as SETTINGS } from './settings.js';
import { pressureTick } from './battle_pressure.js';
import { retreatRequired as dangerRetreatRequired } from './battle_danger.js';
import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
// ======================================================================
// 織田家編　刀根坂の戦い（天正元年八月十三日）
// 小谷城を囲む信長に、朝倉義景が後詰に出てきた。大嵐の夜、信長は朝倉方の砦を落とし、
// 朝倉が陣を払って越前へ退くと見るや、自ら先に立って追った。刀根坂で追いついた織田勢は朝倉勢を崩し、
// 名のある者が多く討たれた。美濃を追われて朝倉に身を寄せていた斎藤龍興も、ここで討ち死にしたと伝わる。
// 足軽は信長の馬廻の供。①夜、信長について峠道を追う ②殿（しんがり）の一の手を破る
// ③山崎吉家・斎藤龍興の殿を破る ④刀根坂の峠を越え、街道から一乗谷の城下まで追う
// 向き：南東の余呉から北西の刀根坂・敦賀へ上る峠道。
// ======================================================================
import { hut, dou, tawara, nobori, kagaribi, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { goten } from './castle_parts.js';
import { toneJourney, toneJourneyGroup } from './b_tonezaka_journey.js';
import { RANKS } from './state.js';
import { gauss, enemyGroup, allyGroup, unitPos } from './bhelp.js';
import { dress } from './b_inabayama.js';
import { distToPolyline, WIND_STATE, WIND_DIR, GUST } from './world.js';
import { demSample } from './dem.js';
import { rockShape } from './rock_shape.js';
import { leafTex } from './nature.js';
import { drawGroundAt } from './render_camera.js';
import { sightPoint, sightUnit, sightScreenUnit } from './battle_sight.js';
import { butaiTick, adoptGroup } from './butai.js';
import { fieldButai, routButai } from './b_yasen.js';
import { SWING } from './units.js';
import { flagBlocksView } from './units_flags.js';
import { isTouch } from './touch.js';
import { timeslipField } from './timeslip_field.js';
import { wayLitter, fallenHorses } from './gap_scene.js';
import { sfx, withPan } from './audio.js';

// 止血した浅い手足の傷だけで、追撃が終わるまで退く札を出し続けない。
// 出血・深手は退避を続ける。傷による歩みや槍の弱りはそのまま残す。
function toneWoundRetreat(rt) {
  const u = rt.player.u;
  return !!(u.wounds?.bleed > 0.0001 || u.hp < u.maxHp * 0.3 ||
    u.woundSlow > 0.25 || u.armWound > 0.25);
}
function retreatRequired(rt) {
  return dangerRetreatRequired(rt) || !rt.over && rt.player.u.alive && toneWoundRetreat(rt);
}

// 捨て槍の長さ全体を描く地面へ合わせる。谷をまたいで宙に残る場所には置かない。
// 近場の飾りを並べ直す時だけ呼び、受け取った行列を使い回す。
function toneGroundSpear(W, x, z, rot, m) {
  const c = Math.cos(rot), s = Math.sin(rot), reach = 2.6;
  const a = drawGroundAt(W, x - c * reach, z + s * reach);
  const b = drawGroundAt(W, x + c * reach, z - s * reach);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const slope = (b - a) / (reach * 2), k = 1 / Math.hypot(1, slope);
  const h = (a + b) * 0.5;
  let low = Infinity, high = -Infinity;
  // 石突から穂先までを調べ、直線の柄を浮かせる深い窪みや土へのめり込みを避ける。
  for (let i = 0; i <= 8; i++) {
    const t = -2.3 + i * (4.9 / 8);
    const ground = drawGroundAt(W, x + c * k * t, z - s * k * t);
    if (!Number.isFinite(ground)) return false;
    const gap = ground - (h + slope * k * t);
    low = Math.min(low, gap); high = Math.max(high, gap);
  }
  if (high - low > 0.18) return false;
  m.set(c * k, -c * slope * k, s, x,
    slope * k, k, 0, h + high + 0.01,
    -s * k, s * slope * k, c, z,
    0, 0, 0, 1);
  return true;
}

// 向きと皺を直した後の隊旗で、胸への視線と画面中央の見通しを調べる。
// 近い敵の旗も対象にするが、倒れた旗と遠い軍勢の旗は残す。
function toneStandardBlocks(rt, s, viewAhead) {
  const d = s.userData.std, carrier = s.userData.carrier;
  if (!s.visible || d.down || !carrier ||
      Math.hypot(carrier.pos.x - rt.camera.position.x, carrier.pos.z - rt.camera.position.z) >= 14) return false;
  return flagBlocksView(d.cloth, rt.camera.position, rt.player.u.pos) ||
    flagBlocksView(d.cloth, rt.camera.position, viewAhead, 0.8);
}

// 下知の節目だけ合成の合図を鳴らす。道案内の札が変わるたびには鳴らさない。
function toneAdvanceCue(rt, kind, source) {
  const F = rt.flags;
  if (rt.over || F.ending || rt.t < (F.advanceCueAt ?? -99) + 30) return false;
  F.advanceCueAt = rt.t;
  const o = rt.objectives.find((q) => q.id === 'main');
  if (o) {
    o.cue = kind === 'susume' ? '合図：法螺貝と進み太鼓。馬廻に続け' : '合図：陣太鼓の早打ち。味方と敵を崩せ';
    o.cueT = rt.t;
  }
  rt.army.playFar('sig_' + kind, source, 0.8);
  const step = F.step;
  rt.after(kind === 'susume' ? 3.2 : 4, () => {
    if (rt.over || F.ending || F.step !== step || !rt.player.u.alive) return;
    // 人声の録音へ渡さず、既存の合成の鬨を一度だけ重ねる。
    const p = kind === 'susume' ? F.nobuU.pos : F.late.center();
    withPan(rt.panAt(p), () => sfx('toki', 0.45 * rt.volumeAt(p)));
  });
  return true;
}

// 足軽大将ほどの身分：馬廻の足軽の一手を預かり、信長の脇を固めて追う
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 略図の余呉→刀根坂（西へ約2500m、北へ約17000m）に向きを合わせる。
// 回転だけで道幅・距離・坂の高さ・兵の間隔を保つ。変換は配置時、逆変換は数値だけ。
const TURN = Math.atan2(2500, 17000), CS = Math.cos(TURN), SN = Math.sin(TURN);
const at = (x, z) => ({ x: x * CS + z * SN, z: z * CS - x * SN });
const xz = (x, z) => [x * CS + z * SN, z * CS - x * SN];
const along = (x, z) => x * SN + z * CS;
const NORTHWEST = at(0, -1), EAST = at(1, 0);
// 地形の元の座標と、実際に歩く北西向きの道を分ける。
const LOCAL_ROAD = [[4, 170], [0, 110], [-10, 60], [-4, 10], [10, -40], [6, -90], [-8, -140], [-4, -190]];
const ROAD = LOCAL_ROAD.map(([x, z]) => xz(x, z));
const PASS = at(-6, -150);           // 刀根坂の峠
// 敦賀・府中を経る数日の追撃を、場の内に縮める。実際の距離・方角を表す道ではない。
const LOCAL_CHASE = [[-6, -150], [24, -160], [62, -148], [94, -128], [120, -104], [132, -80]];
const CHASE_ROAD = LOCAL_CHASE.map(([x, z]) => xz(x, z));
const STREET = at(62, -148), TOWN = at(120, -104), INNER = at(132, -80);
// 街道の曲がりにかかる家を西へ寄せ、奥への通りを空ける。家の当たりと火は同じ場所を使う。
// 人夫の背の荷（俵を縄で背負子に括った形）。形と材質は全員で共用する。
let porterLoadGeo = null, porterLoadMat = null;
const PORTER_LOAD = () => porterLoadGeo ||= (() => {
  const a = new THREE.CylinderGeometry(.2, .2, .62, 8); a.rotateZ(Math.PI / 2); a.translate(0, 1.42, -.26);
  const b = new THREE.BoxGeometry(.5, .08, .36); b.translate(0, 1.16, -.24);
  const g = mergeGeometries([a.toNonIndexed(), b.toNonIndexed()]); a.dispose(); b.dispose(); return g;
})();
const PORTER_MAT = () => porterLoadMat ||= new THREE.MeshStandardMaterial({ color: 0x8a7550, roughness: 1 });
// 退く人夫・足軽が落とした陣笠（浅い円錐を傾けて地に転がす）。準備時に一つの形へ合わせ、毎コマ作らない。
function droppedKasa(rt, spots) {
  const W = rt.world, parts = [];
  for (const [lx, lz, r] of spots) {
    const p = at(lx, lz), g = new THREE.ConeGeometry(0.36, 0.15, 12, 1, true);
    g.rotateZ(0.25 + (r % 1) * 0.9); g.rotateY(r); g.translate(p.x, W.heightAt(p.x, p.z) + 0.1, p.z);
    parts.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: 0x2a2219, side: THREE.DoubleSide }));
  for (const g of parts) g.dispose();
  m.receiveShadow = true; rt.scene.add(m);
}
const TOWN_HOUSES = [[96, -108], [130, -120], [102, -78], [148, -96]].map(([x, z]) => xz(x, z));
// 家の足元だけを均す。街道と山腹の起伏は残し、高い束の上に民家を浮かせない。
const HOME_PADS = [[-30, 70, 6, 4], [96, -108, 7, 5], [130, -120, 7, 5], [102, -78, 7, 5], [148, -96, 7, 5], [80, -102, 12, 10]];
// 刀根の里と、数日後の一乗谷の暮らしを分ける。民は兵の中心や峠の殿に置かない。
// 一乗谷の町屋・寺院は博物館の遺跡案内を参考にする。堂と避難路は縮めた場での推定。
// https://asakura-museum.pref.fukui.lg.jp/site/walk
// 避難路は家の外の谷筋・集落の脇。追撃の街道や城下の守り場を横切らない。
const PEOPLE_PATHS = [
  [[-43, 90], [-38, 114], [-32, 144], [-28, 176], [-28, 208]],
  [[94, -125], [106, -140], [150, -148], [190, -148], [218, -148]],
  [[166, -132], [190, -145], [218, -148]],
  [[160, -116], [180, -132], [210, -152], [230, -152]],
  [[72, -92], [72, -125], [84, -156], [96, -184], [96, -218]],
].map((path) => path.map(([x, z]) => xz(x, z)));
const PEOPLE_BANDS = [
  { ...at(-43, 78), kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'], route: 0 },
  { ...at(99, -115), kinds: ['townsman', 'woman', 'child'], mode: 'inside', route: 1 },
  { ...at(156, -126), kinds: ['merchant', 'townsman', 'woman', 'child'], route: 2 },
  { ...at(152, -104), kinds: ['townsman', 'woman', 'child'], mode: 'inside', route: 3 },
  { ...at(80, -92), kinds: ['monk', 'monk', 'elder'], mode: 'inside', route: 4 },
].map((band) => ({ ...band, route: PEOPLE_PATHS[band.route].map(([x, z]) => ({ x, z })) }));
const peopleNear = (x, z) => PEOPLE_PATHS.some((path) => distToPolyline(x, z, path) < 4);
let homeHeights = null;
const chaseNear = (x, z) => distToPolyline(x, z, CHASE_ROAD);
const ODA = { flag: 'oda' };
const ASA = { flag: 'asakura' };

const FIRST_END = at(-4, 8);
const SAKA = at(4, -88);             // 刀根坂の中ほど（殿が構える坂）
// 国土地理院の標高（刀根坂。束0 の asset_dem_tonezaka.js）。ゲームの 1 を実の 3m に縮め、道の谷から離れた所の
// 尾根と沢の起伏だけを足す（道の上は手書きのまま：登れる坂は道だけ）
let tzDem = null;
let terrainDem = null;
let terrainFixed = false;
useTerrain('dem_tonezaka', (data) => { tzDem = data; terrainDem = null; terrainFixed = false; });
const DEM_XY = 3, DEM_OX = 900;
const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
// 元の座標で、峠道の z における道の x。
function roadX(z) {
  for (let i = 0; i < LOCAL_ROAD.length - 1; i++) {
    const [x0, z0] = LOCAL_ROAD[i], [x1, z1] = LOCAL_ROAD[i + 1];
    if (z <= z0 && z >= z1) return x0 + (x1 - x0) * ((z0 - z) / (z0 - z1));
  }
  return z > LOCAL_ROAD[0][1] ? LOCAL_ROAD[0][0] : LOCAL_ROAD[LOCAL_ROAD.length - 1][0];
}
// 兵も主人公も長い移動では街道の折れをたどる。近い斬り合いでは行き先を保つ。
function chaseWay(army, u, want) {
  // 主人公の案内は曲がりに近づいたら先へ送る。兵の列の細かな通り方は保つ。
  const bendReach = u.isPlayer ? 8 : 2;
  const z = along(u.pos.x, u.pos.z), end = along(want.x, want.z);
  const x = u.pos.x * CS - u.pos.z * SN, endX = want.x * CS - want.z * SN;
  // 峠から東へ曲がった街道は別の道。城下の兵を元の峠道へ戻さない。
  const chase = (x > 18 || endX > 18) && z < -58 && end < -58 &&
    (chaseNear(u.pos.x, u.pos.z) < distToPolyline(u.pos.x, u.pos.z, ROAD) ||
      chaseNear(want.x, want.z) < distToPolyline(want.x, want.z, ROAD));
  // 近い相手との槍合わせは保つ。山腹での短い退避は道順を省かない。
  if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 14 &&
      (chase || Math.abs(x - roadX(z)) <= 10 && Math.abs(endX - roadX(end)) <= 10)) return want;
  if (chase) {
    let from = 0, to = 0, fromD = Infinity, toD = Infinity, lane = 0;
    for (let i = 0; i < CHASE_ROAD.length - 1; i++) {
      const a = CHASE_ROAD[i], b = CHASE_ROAD[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((u.pos.x - a[0]) * dx + (u.pos.z - a[1]) * dz) / len2));
      const v = Math.max(0, Math.min(1, ((want.x - a[0]) * dx + (want.z - a[1]) * dz) / len2));
      const d = Math.hypot(u.pos.x - a[0] - t * dx, u.pos.z - a[1] - t * dz);
      const e = Math.hypot(want.x - a[0] - v * dx, want.z - a[1] - v * dz);
      if (d < fromD) { fromD = d; from = i; lane = Math.max(-2, Math.min(2, ((u.pos.x - a[0]) * dz - (u.pos.z - a[1]) * dx) / Math.sqrt(len2))); }
      if (e < toD) { toD = e; to = i; }
    }
    if (from === to) return want;
    let i = to > from ? from + 1 : from;
    if (Math.hypot(u.pos.x - CHASE_ROAD[i][0], u.pos.z - CHASE_ROAD[i][1]) < (u.isPlayer ? bendReach : 3)) i += to > from ? 1 : -1;
    i = Math.max(0, Math.min(CHASE_ROAD.length - 1, i));
    const a = CHASE_ROAD[Math.max(0, i - 1)], b = CHASE_ROAD[Math.max(1, i)];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const q = u._toneWay || (u._toneWay = { x: 0, z: 0, botRadius: 1 });
    q.x = CHASE_ROAD[i][0] + dz / len * lane; q.z = CHASE_ROAD[i][1] - dx / len * lane;
    return q;
  }
  if (z < -150 || end < -150) return want;
  const lane = Math.max(-3, Math.min(3, x - roadX(z)));
  let next = end;
  if (Math.abs(x - roadX(z)) > 5) next = z;
  else if (end < z) {
    for (const p of LOCAL_ROAD) if (p[1] < z - bendReach && p[1] > end) { next = p[1]; break; }
  } else {
    for (let i = LOCAL_ROAD.length - 1; i >= 0; i--) {
      const p = LOCAL_ROAD[i];
      if (p[1] > z + bendReach && p[1] < end) { next = p[1]; break; }
    }
  }
  if (next === end && Math.abs(x - roadX(z)) <= 5) return want;
  const q = u._toneWay || (u._toneWay = { x: 0, z: 0, botRadius: 1 });
  const side = roadX(next) + lane;
  q.x = side * CS + next * SN; q.z = next * CS - side * SN;
  return q;
}
// 自動操作の退避先も、味方の列の脇へ収める。敵と反対というだけで山腹へ登らない。
function toneRetreatWay(rt, want) {
  if (rt.flags.step < 1 || rt.flags.step > 3) return chaseWay(rt.army, rt.player.u, want);
  const z = along(want.x, want.z), x = want.x * CS - want.z * SN;
  const side = roadX(z) + Math.max(-6, Math.min(6, x - roadX(z)));
  const q = rt.flags.retreatGuide || (rt.flags.retreatGuide = { x: 0, z: 0 });
  q.x = side * CS + z * SN; q.z = z * CS - side * SN;
  return chaseWay(rt.army, rt.player.u, q);
}
// 峠の敗兵は北西へ直進せず、曲がる街道を走る。城下の東への退き足は保つ。
// 行き先は兵ごとに使い回し、今いる列の脇を保って全員を道の中央へ集めない。
function toneFleeWay(army, u, want) {
  const x = u.pos.x * CS - u.pos.z * SN, z = along(u.pos.x, u.pos.z);
  if (u.team !== 1 || x > 18 && z < -58) return want;
  const lane = Math.max(-2.8, Math.min(2.8, x - roadX(z)));
  // 道から押し出された者は斜めに戻る。足元を飛ばさず、四歩先へ向ける。
  const next = z - 4, side = roadX(next) + lane;
  const q = u._toneFleeWay || (u._toneFleeWay = { x: 0, z: 0 });
  q.x = side * CS + next * SN; q.z = next * CS - side * SN;
  return q;
}
// 道の両側の急な山腹。見えない壁は置かず、実際の傾斜を使う。
const KIRI = { z0: 16, z1: 104, off: 20 };
function kiriH(x, z) {
  const fz = sstep(KIRI.z0, KIRI.z0 + 8, z) * sstep(KIRI.z1, KIRI.z1 - 8, z);
  if (fz <= 0) return 0;
  return 6 * fz * sstep(KIRI.off - 2, KIRI.off + 10, Math.abs(x - roadX(z)));
}
function heightBase(wx, wz) {
  const x = wx * CS - wz * SN, z = along(wx, wz);
  if (!terrainFixed) { terrainDem = tzDem; terrainFixed = true; }
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  // 道に沿って上る谷。両側は山
  h += z >= -150 ? Math.max(0, 120 - z) * 0.11 : Math.max(8, 29.7 + (z + 150) * 0.12);
  const d = distToPolyline(x, z, LOCAL_ROAD);
  h += Math.min(34, Math.max(0, d - 14) * 0.5);
  h += 16 * gauss(x, z, 70, -60, 2600) + 18 * gauss(x, z, -70, -100, 2600);
  h += kiriH(x, z);
  if (terrainDem && d > 55) {
    const sx = x * DEM_XY + DEM_OX, sz = z * DEM_XY;
    if (Math.abs(sx) < 1580 && Math.abs(sz) < 1580) h += sstep(55, 85, d) * Math.max(0, demSample(terrainDem, sx, sz) - 60) * 0.05;
  }
  // 元の峠と尾根を残し、その先だけ城下へ下る谷道にする。
  // 奥の道は北へ戻るため、城下の入口より南まで谷をつなぐ。
  // 終点だけ元の山腹へ戻すと、守り場の印が急斜面へ誘ってしまう。
  const blend = sstep(20, 54, x) * sstep(-58, -76, z);
  if (blend > 0) h += (31 + Math.min(22, Math.max(0, distToPolyline(x, z, LOCAL_CHASE) - 18) * 0.35) - h) * blend;
  return h;
}
function height(wx, wz) {
  let h = heightBase(wx, wz);
  if (!homeHeights) homeHeights = HOME_PADS.map(([x, z]) => heightBase(x * CS + z * SN, z * CS - x * SN));
  const x = wx * CS - wz * SN, z = along(wx, wz);
  let original = h, flatDistance = Infinity;
  for (let i = 0; i < HOME_PADS.length; i++) {
    const p = HOME_PADS[i];
    // 家の角を囲む格子点は水平に保ち、その外を丸い裾で山腹へ戻す。
    // 三歩で高さを戻す四角い台地を避ける。街道の足場は従来のまま保つ。
    const dx = Math.abs(x - p[0]) - p[2] / 2 - 5, dz = Math.abs(z - p[1]) - p[3] / 2 - 5;
    const edge = Math.hypot(Math.max(0, dx), Math.max(0, dz));
    flatDistance = Math.min(flatDistance, edge);
    original += (homeHeights[i] - original) * (1 - sstep(0, 3, Math.max(dx, dz)));
    if (edge < 14) {
      const skirt = 1 - sstep(0, 14, edge);
      h += (homeHeights[i] - h) * skirt;
    }
  }
  // 隣の家の裾が重なっても床下を傾けない。道と床下から離れた所だけを均す。
  const blend = sstep(0, 6, flatDistance) * sstep(8, 14, Math.min(distToPolyline(wx, wz, ROAD), chaseNear(wx, wz)));
  return original + (h - original) * blend;
}

// 戦える殿を数える。追撃の区切りでは残兵も本隊を追って退く。
const fighter = (u) => u.alive && !u.dying && !u.evacuatedWound && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget;
const fighting = (g) => g && !g.routed && g.units.some(fighter);
// 殿を崩した跡の深手や倒れた兵は、追い手を囲む人数に含めない。
const toneCrowdFighter = (u) => fighter(u) && !u.rearWound && !u.downed && !u.dropped && !u.civ && !u.isStruct;
// 敵の気配は十八歩で知らせる。構える下知は槍の間合いに近づいてから。
const CLOSE_REAR = 18;
// 遠い兵も実際に見通せる時だけ敵として知らせる。霧と坂の判定は共通処理に任せる。
const VISIBLE_REAR = 60;
const GUARD_REAR = 6;
function toneGuardEnemy(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  // 打ち込みを受けた相手は、振り向く途中で画面外へ出ても四秒だけ覚える。
  // 視界に入るまで『進め』へ戻すと、背後から打つ敵へ背を向けさせてしまう。
  const attacker = F.guardEnemy;
  if (rt.t < (F.guardEnemyUntil || 0) && attacker && fighter(attacker) &&
      !attacker.rearWound && !attacker.downed && Math.abs(attacker.pos.y - p.y) < 3 &&
      near(p, attacker.pos, GUARD_REAR)) return attacker;
  for (let i = 0; i < 2; i++) {
    const u = i === 0 ? F.nearEnemy : F.guideEnemy;
    if (u && fighter(u) && !u.rearWound && !u.downed && Math.abs(u.pos.y - p.y) < 3 &&
        near(p, u.pos, GUARD_REAR) && sightScreenUnit(rt, u)) return u;
  }
  return null;
}
// 隊の中心には深手の兵も残る。今の持ち場で戦える兵へ道をたどる。
// 印の座標は使い回し、道の途中を敵の居場所として表示しない。
function toneGuide(rt, fallback) {
  const F = rt.flags, p = rt.player.u.pos;
  let next = null, distance = Infinity;
  for (const g of F.stageDefenders[F.step] || []) {
    if (!fighting(g)) continue;
    for (const u of g.units) {
      if (!fighter(u) || u.rearWound || u.downed) continue;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (d < distance) { distance = d; next = u; }
    }
    // 今の任務の二つの備から近い兵を選ぶ。先の任務の備へは飛ばさない。
  }
  // 最寄りの残敵を保つ。見えるかどうかは印の描画側で判定する。
  // 目の前で槍を向ける兵を、先の備や曲がりの印より優先する。
  const close = F.nearEnemy;
  if (!next && close && fighter(close) && !close.rearWound && !close.downed &&
      near(p, close.pos, CLOSE_REAR) && sightScreenUnit(rt, close)) next = close;
  const enemyAt = next ? next.pos : fallback;
  const closeSeen = next && near(p, enemyAt, CLOSE_REAR) && sightScreenUnit(rt, next);
  let target = enemyAt;
  // 遠い敵が山腹へ押し出されても、追い手の矢印は街道に置く。
  // 目前の槍合わせは実際の兵へ向け、城下の別の街道には触れない。
  if (next && !closeSeen && F.step <= 3) {
    const z = along(enemyAt.x, enemyAt.z), x = enemyAt.x * CS - enemyAt.z * SN;
    const center = roadX(z), lane = Math.max(-4, Math.min(4, x - center));
    if (Math.abs(x - center) > 4) {
      target = F.enemyRoadPoint;
      target.x = (center + lane) * CS + z * SN;
      target.z = z * CS - (center + lane) * SN;
    }
  }
  const guide = closeSeen ? target : chaseWay(rt.army, rt.player.u, target);
  F.roadGuide.x = guide.x; F.roadGuide.z = guide.z;
  F.guideBend = guide !== enemyAt; F.guideEnemy = next; F.guideJoin = false;
  // 霧や坂の向こうの兵は、道の行き先として案内する。敵の札は姿が見えてから。
  F.guideVisible = !!next && near(p, enemyAt, VISIBLE_REAR) && sightScreenUnit(rt, next);
}
// 敵が退いた後と守り場への移動は、残兵を追わず道の曲がりを案内する。
function toneDestinationGuide(rt, target) {
  const F = rt.flags, guide = chaseWay(rt.army, rt.player.u, target);
  F.roadGuide.x = guide.x; F.roadGuide.z = guide.z;
  F.guideBend = guide !== target;
  F.guideEnemy = null; F.guideVisible = false; F.guideJoin = false;
}
// 合流を命じる時は敵の先の曲がりへ誘わず、今戦える味方へ戻す。
// 馬の胴へ向かわせないよう徒歩兵を優先し、印の座標は使い回す。
function toneJoinable(rt, u) {
  return u !== rt.player.u && u.team === rt.player.u.team && fighter(u) &&
    !u.rearWound && !u.downed && !u.climb &&
    // 支えに数えない高さの兵や、道の外の兵へ戻る印を出さない。
    // 峠道と城下の道の両方を調べ、合流と退避で同じ候補を使う。
    Math.abs(u.pos.y - rt.player.u.pos.y) <= 3 &&
    Math.min(distToPolyline(u.pos.x, u.pos.z, ROAD), chaseNear(u.pos.x, u.pos.z)) <= 4 &&
    rt.world.walkable(u.pos.x, u.pos.z, u.pos.y);
}
function toneRegroupGuide(rt, group = null) {
  const F = rt.flags, p = rt.player.u.pos;
  // 近くの合流相手は保つ。相手が先へ進んだら、そばの味方を選び直す。
  const saved = F.regroupAlly;
  let ally = saved && (!group || saved.group === group) && toneJoinable(rt, saved) ? saved : null;
  const supportRange = 22;
  let distance = ally ? Math.hypot(ally.pos.x - p.x, ally.pos.z - p.z) : Infinity;
  if (distance >= supportRange) { ally = null; distance = Infinity; }
  else if (ally.mounted) distance += supportRange;
  // 走り去る徒歩兵を追わせず、十分近い味方が来たら合流相手を替える。
  // 四歩分の差を残し、隣り合う兵の間で印を細かく往復させない。
  for (const u of group ? group.units : rt.army.units) {
    if (!toneJoinable(rt, u)) continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    // 遠い徒歩兵より近い味方を案内し、支えになる範囲内だけ徒歩兵を優先する。
    const rank = d < supportRange ? (u.mounted ? supportRange : 0) + d : supportRange * 2 + d;
    if (rank + (ally ? 3 : 0) < distance) { distance = rank; ally = u; }
  }
  F.regroupAlly = ally;
  if (!ally) return false;
  // 隣の兵への合流で、通り過ぎた曲がりへ引き返させない。
  const onRoad = Math.abs(p.x * CS - p.z * SN - roadX(along(p.x, p.z))) <= 10;
  let target = ally.pos;
  if (ally.mounted) {
    // 騎馬しかいない時も胴の中心を指さず、街道の脇で並べる所を示す。
    const q = F.joinPoint || (F.joinPoint = { x: 0, z: 0 });
    const z = along(ally.pos.x, ally.pos.z), x = ally.pos.x * CS - ally.pos.z * SN;
    const side = x + (x >= roadX(z) ? -4.5 : 4.5);
    q.x = side * CS + z * SN; q.z = z * CS - side * SN;
    target = q;
  }
  const guide = onRoad && near(p, target, supportRange) && sightUnit(rt, ally) ? target : chaseWay(rt.army, rt.player.u, target);
  F.roadGuide.x = guide.x; F.roadGuide.z = guide.z;
  F.guideBend = guide !== target; F.guideJoin = true;
  return true;
}
// 槍を受けている味方も支えになる。隊の到着判定だけでは、隣の組や交戦中の兵を見落とす。
function toneSupported(rt, p, range = 22) {
  let n = 0;
  for (const u of rt.army.units) {
    if (u === rt.player.u || u.team !== rt.player.u.team || !fighter(u) || u.rearWound || u.downed || u.climb || Math.abs(u.pos.y - p.y) > 3) continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (d < 8 || d < range && ++n >= 2) return true;
  }
  return false;
}
// 合流は列のそばまで戻ってから終える。二十二歩の境目をまたぐだけで
// 前進と引き返しを繰り返さず、十二歩まで寄ってから追撃へ戻す。
function toneRegroupNeeded(rt, supported, joined) {
  const F = rt.flags;
  if (toneSupported(rt, rt.player.u.pos, 12)) {
    F.regrouping = false; F.regroupUntil = 0;
  } else if (!joined || !supported && (rt.player.u.mobbed || rt.t < (F.regroupUntil || 0))) {
    F.regrouping = true;
  }
  return !!F.regrouping;
}
// 夜の退き先は街道の内の味方の後ろ。共通の敵と反対向きの探索で山腹へ誘わない。
// 半秒ごとに候補と通り道を調べ、座標の入れ物は設営時の物を使い回す。
function toneShelter(rt) {
  const F = rt.flags, out = F.shelter;
  if (!out || F.step < 1 || F.step > 3 || F.ending || !retreatRequired(rt)) return null;
  if (rt.t < out.scanAt) return out.valid ? out : null;
  out.scanAt = rt.t + 0.5;
  // 安全な退き先は地面に保つ。歩く味方の四歩後ろを追い続けさせない。
  if (out.valid && out.ally && toneJoinable(rt, out.ally) && !out.ally.mounted &&
      near(out, out.ally.pos, 12) && sightUnit(rt, out.ally) &&
      toneShelterClear(rt, out.x, out.z, out.ally)) return out;
  out.valid = false; out.ally = null;
  const p = rt.player.u.pos, q = out.point;
  let best = Infinity;
  for (const ally of rt.army.units) {
    if (!toneJoinable(rt, ally) || ally.mounted || !sightUnit(rt, ally) || !near(p, ally.pos, 24)) continue;
    const z = along(ally.pos.x, ally.pos.z) + 4;
    const lane = Math.max(-3, Math.min(3, ally.pos.x * CS - ally.pos.z * SN - roadX(z)));
    const side = roadX(z) + lane, x = side * CS + z * SN, wz = z * CS - side * SN;
    const d = Math.hypot(x - p.x, wz - p.z);
    if (d >= best || d > 28) continue;
    if (!toneShelterClear(rt, x, wz, ally)) continue;
    best = d; out.x = x; out.z = wz; out.y = q.y; out.ally = ally; out.valid = true;
  }
  return out.valid ? out : null;
}
// 保った退き先にも、新しい退き先と同じ敵・坂・壁の検査を通す。
function toneShelterClear(rt, x, z, ally) {
  const p = rt.player.u.pos, q = rt.flags.shelter.point;
  const d = Math.hypot(x - p.x, z - p.z);
  if (d > 28) return false;
  for (const enemy of rt.army.units) {
    if (enemy.team === ally.team || !fighter(enemy) || enemy.civ || enemy.isStruct || Math.abs(enemy.pos.y - p.y) >= 4) continue;
    const from = Math.hypot(enemy.pos.x - p.x, enemy.pos.z - p.z);
    const to = Math.hypot(enemy.pos.x - x, enemy.pos.z - z);
    const t = Math.max(0, Math.min(1, ((enemy.pos.x - p.x) * (x - p.x) + (enemy.pos.z - p.z) * (z - p.z)) / Math.max(0.01, d * d)));
    if (to < 6 || from < 6 && to < from + 2 || from >= 6 &&
        Math.hypot(enemy.pos.x - p.x - t * (x - p.x), enemy.pos.z - p.z - t * (z - p.z)) < 4) return false;
  }
  const steps = Math.max(1, Math.ceil(d / 2));
  for (let i = 1; i <= steps; i++) {
    q.x = p.x + (x - p.x) * i / steps; q.z = p.z + (z - p.z) * i / steps;
    q.y = rt.world.heightAt(q.x, q.z);
    if (distToPolyline(q.x, q.z, ROAD) > 5 || !rt.world.walkable(q.x, q.z, q.y) ||
        Math.abs(q.y - p.y) > d * i / steps * 0.5 + 0.5 || rt.army.wallBetween(p, -1, q)) return false;
  }
  return true;
}
// 守り場の端同士で十八歩離れた兵を、隣で共に守る味方には数えない。
function toneSecureSupport(rt) {
  const p = rt.player.u.pos;
  let n = 0;
  for (const u of rt.flags.late.units) {
    if (toneJoinable(rt, u) && Math.abs(u.pos.y - p.y) < 3 && near(u.pos, INNER, 12) &&
        near(u.pos, p, 8) && sightUnit(rt, u) && ++n >= 2) return true;
  }
  return false;
}
function fighters(g) {
  if (!g || g.routed) return 0;
  let n = 0;
  for (const u of g.units) if (fighter(u)) n++;
  return n;
}
function arrived(g, p, r) {
  if (!g || g.routed) return false;
  let n = 0;
  for (const u of g.units) if (fighter(u) && !u.rearWound && !u.downed && !u.climb && !(u.pinT > g._t) && near(u.pos, p, r)) n++;
  return n >= Math.min(3, fighters(g)) && n > 0;
}
const near = (p, at, r) => Math.hypot(p.x - at.x, p.z - at.z) < r;
// 槍衾は width では横幅が決まらない。六人を越す分は後ろへ並べ、山腹へ広げない。
const toneYariRanks = (n) => Math.max(3, Math.ceil(n / 6));
function toneHold(g) {
  g.order = 'hold'; g.formation = 'yari'; g.yariRanks = toneYariRanks(g.initial);
  // 追い手が止まった時、後ろの兵の柄と腕を前の背へ詰めすぎない。横幅は保つ。
  if (g.team === 0) g.rankSpacing = 1.35;
}
function march(g, path, arrive) {
  if (!g || !g.count || g.routed) return;
  g.order = 'path'; g.formation = 'column'; g.colW = 2; g.roadColumn = true;
  g.rankSpacing = 1;
  // 後列も、出発点から街道の曲がりをたどる。山腹へ列を伸ばさない。
  g.path = [[g.anchor.x, g.anchor.z], ...path]; g.pathIdx = 1; g.speed = 2.8;
  g.onArrive = arrive || toneHold;
}
// 後続の供も開いた道を追う。最初の六十歩だけで止めず、今の位置から次の持ち場へ送る。
// 道順は段が替わる時だけ作り、兵や馬の数は増やさない。
function followChase(rt, end) {
  for (const g of rt.flags.followers) {
    if (!fighting(g)) continue;
    const z = along(g.anchor.x, g.anchor.z);
    if (z <= end) continue;
    const path = ROAD.filter((p) => {
      const next = along(p[0], p[1]);
      return next < z - 2 && next > end;
    });
    path.push(xz(roadX(end), end));
    march(g, path);
  }
}
function retreat(g) {
  if (!g || g.routed) return;
  g.noRout = false; g.routed = true; g.order = 'flee';
  for (const u of g.units) if (u.alive) u.fleeing = true;
}

// 前の備が崩れたら、既にいる次の備が街道で返し合わせる。味方の到着待ちと分ける。
const COUNTER_PATHS = [
  [xz(roadX(-40), -40), xz(roadX(-24), -24)],
  [xz(roadX(-90), -90), xz(roadX(-64), -64)],
  [xz(roadX(-140), -140), xz(roadX(-112), -112)],
  [CHASE_ROAD[1]], [CHASE_ROAD[3]],
];
function counterMarch(g, path) {
  if (!fighting(g) || g._countermarch) return;
  g._countermarch = true;
  march(g, path, toneHold);
}

// 後衛の敗走は、夜の知らせと実際に流れ込む兵で次の備へ伝わる。
// 五つの備だけを半秒ほどごとに調べ、同じ敗走で士気を削り続けない。
function retreatCascade(rt) {
  const F = rt.flags;
  for (let i = 0; i < F.rears.length; i++) {
    const rear = F.rears[i];
    if (fighting(rear)) continue;
    if (rear._collapseAt == null) {
      rear._collapseAt = rt.t;
      F.pursueUntil = rt.t + 8;
      const b = F.rearCrowds[i];
      routButai(b, 18);
    }
    const next = F.rears[i + 1];
    if (next && fighting(next) && !rear._collapseSent && rt.t >= rear._collapseAt + 6) {
      rear._collapseSent = true;
      // 知らせだけで無傷の備を敗走させず、将と供は奥で守りを続ける。
      next.morale = Math.min(next.morale, Math.max(24, next.morale - 12));
    }
    for (let j = i + 1; j < F.rears.length; j++) {
      const g = F.rears[j], bit = 1 << i;
      if (!fighting(g) || (g._fleeContact & bit)) continue;
      let touched = false;
      for (const v of rear.units) {
        if (!v.alive || !v.fleeing || v.gone) continue;
        for (const u of g.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.noTarget ||
              Math.abs(u.pos.y - v.pos.y) > 2 || !near(u.pos, v.pos, 4)) continue;
          touched = true;
          if (!u.name && !u.mounted) { u.confused = Math.max(u.confused || 0, 2.5); u.aiT = 0; }
        }
      }
      if (touched) { g._fleeContact |= bit; g.morale = Math.min(g.morale, Math.max(24, g.morale - 8)); }
    }
  }
}

// 狭い街道で二つの味方の列を重ねず、供が離れた時は先頭が足を緩める。
// 半秒ほどごとの任務確認でだけ呼ぶ。道順・兵数・終戦までの上限は変えない。
function toneMarchPace(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  for (const g of F.oda) {
    if (g.order !== 'path' || g.routed) continue;
    let speed = rt.t < F.pursueUntil ? 3.2 : 2.8;
    const z = along(g.anchor.x, g.anchor.z);
    const lag = along(p.x, p.z) - z;
    // 隊の先頭ではなく、実際に支えとなる徒歩兵との間を見る。
    // 支えの届く範囲を出る前に待ち、戻ってから歩き出す。
    let escortDistance = Infinity;
    for (const u of g.units) {
      if (!fighter(u) || u.mounted || u.rearWound || u.downed || u.climb || Math.abs(u.pos.y - p.y) > 3) continue;
      escortDistance = Math.min(escortDistance, Math.hypot(u.pos.x - p.x, u.pos.z - p.z));
    }
    g._toneWaitPlayer = lag > 0 && escortDistance > (g._toneWaitPlayer ? 12 : 18);
    // 足を負傷した供を、減速だけで置き去りにしない。列は持ち場で待つ。
    if (g._toneWaitPlayer) speed = 0;
    if (g === F.late && fighting(F.uma)) {
      const gap = z - along(F.uma.anchor.x, F.uma.anchor.z);
      g._toneQueue = gap < (g._toneQueue ? 32 : 26);
      if (g._toneQueue) speed = 0;
    }
    // 先頭の持ち場を敵の体へ進め続けない。兵自身は今の間合いから槍を合わせる。
    const height = rt.world.heightAt(g.anchor.x, g.anchor.z);
    const fx = Math.sin(g.facing), fz = Math.cos(g.facing);
    for (const rear of F.stageDefenders[F.step]) {
      if (!fighting(rear)) continue;
      for (const u of rear.units) {
        if (!fighter(u) || u.rearWound || u.downed) continue;
        const dx = u.pos.x - g.anchor.x, dz = u.pos.z - g.anchor.z;
        if (dx * fx + dz * fz > 0 &&
            Math.hypot(dx, dz) < 7 && Math.abs(u.pos.y - height) < 3) {
          speed = 0; break;
        }
      }
      if (!speed) break;
    }
    g.speed = speed;
  }
}

// 刀根坂の葉だけ、目の前の房を透かす。追加の林にも同じ処理を使う。
// 材質・形・描画回数は増やさない。
function toneLeafFade(sh) {
  // 距離は描く点の視点からの長さ（vViewPosition）で測る。共通の揺れの式が頂点の段を置き換えても
  // 距離が0のまま残らず、杉の葉が全部透けて幹だけの柱になるのを防ぐ（10/28）。
  sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `
    diffuseColor.a *= smoothstep(2.5, 7.5, length(vViewPosition));
    diffuseColor.rgb *= vec3(0.6, 0.66, 0.58);   // 雨の夜の杉は濃い緑。補光で青白い粉に見せない
    #include <alphatest_fragment>`);
}

// 刀根坂だけの外側の山腹。地面の端から続く面を折り、三つの尾根を距離の霞で重ねる。
// 一度だけ作り、木の幹と葉はそれぞれ一回の描画にまとめる。
// 夜の地形の外周は空と同じ霞へつなぐ。高さで薄まる共通の霧だけでは、
// 高い山腹の四角い端が残る。遠景と地面に同じ式を使い、昼の城下は保つ。
function toneHorizonFog(sh, W) {
  sh.uniforms.toneHorizonNight = W.nightU;
  sh.fragmentShader = 'uniform float toneHorizonNight;\n' + sh.fragmentShader.replace(
    '#include <fog_fragment>', `#include <fog_fragment>
      vec3 toneHorizonWorld = vFogOff + cameraPosition;
      float toneHorizonEdge = smoothstep(240.0, 290.0, max(abs(toneHorizonWorld.x), abs(toneHorizonWorld.z)));
      // 高い山腹も距離で霞へ溶かす。高さで薄まる共通の霧だけでは近い視点に角が残る。
      float toneHorizonDistance = smoothstep(fogFar * 0.9, fogFar * 1.65, length(vFogOff));
      float toneHorizonUp = max(vFogOff.y / max(length(vFogOff), 0.001), 0.0);
      vec3 toneHorizonColor = fogColor * (1.0 - 0.15 * smoothstep(0.0, 0.85, toneHorizonUp));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, toneHorizonColor, toneHorizonNight * max(toneHorizonEdge, toneHorizonDistance));`);
}

function toneMountains(W) {
  W.mountains.visible = false;
  const group = new THREE.Group(), positions = [], colors = [], indices = [];
  const N = 128, ROWS = 18, color = new THREE.Color(), haze = new THREE.Color(0x718093);
  const slope = (a, row) => {
    const sa = Math.sin(a), ca = Math.cos(a), edge = 300 / Math.max(Math.abs(sa), Math.abs(ca));
    const r = edge + row * 28, x = sa * r, z = ca * r;
    const base = height(sa * edge, ca * edge);
    const peaks = 45 + 27 * Math.sin(a * 5 + row * 0.12) + 16 * Math.sin(a * 11 - row * 0.3);
    const rise = Math.sin(Math.min(1, row / 6) * Math.PI / 2);
    const folds = 18 * Math.sin(row * 0.8 + a * 3) * Math.min(1, row / 3);
    return { x, z, y: base + rise * peaks + folds };
  };
  for (let row = 0; row <= ROWS; row++) for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI * 2, q = slope(a, row);
    positions.push(q.x, q.y - 0.15, q.z);
    // 土と林の斑。遠い尾根ほど薄くし、実際の霧も材質へ掛ける。
    color.setHex(Math.sin(a * 29 + row * 1.7) > 0 ? 0x665847 : 0x3d5140);
    color.lerp(haze, row / ROWS * 0.38);
    colors.push(color.r, color.g, color.b);
    if (row < ROWS && i < N) {
      const k = row * (N + 1) + i;
      indices.push(k, k + 1, k + N + 1, k + 1, k + N + 2, k + N + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  // 外の山腹は視点の描画距離（六百歩）より遠くまで続く。
  // 面がそこで切れて空に大きな角を作らないよう、手前から霞へ消す。
  // 地面の高さ・頂点数は保ち、この山腹一枚の材質だけを替える。
  const ridgeMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide,
    transparent: true, depthWrite: false, forceSinglePass: true });
  ridgeMat.customProgramCacheKey = () => 'tonezaka-ridge-horizon';
  ridgeMat.onBeforeCompile = (sh) => {
    toneHorizonFog(sh, W);
    sh.vertexShader = 'varying vec3 toneRidgeView;\n' + sh.vertexShader.replace(
      '#include <project_vertex>', '#include <project_vertex>\n toneRidgeView = mvPosition.xyz;');
    // 大きな三角の頂点距離を補間せず、画素の距離で消す。夜は夜の見通しに合わせる。
    sh.fragmentShader = 'varying vec3 toneRidgeView;\n' + sh.fragmentShader.replace(
      '#include <opaque_fragment>', `#include <opaque_fragment>
        float toneRidgeEnd = clamp(floor(fogFar) * 2.2, 260.0, 540.0);
        gl_FragColor.a *= 1.0 - smoothstep(toneRidgeEnd * (2.0 / 3.0), toneRidgeEnd, length(toneRidgeView));`);
  };
  group.add(new THREE.Mesh(geo, ridgeMat));
  const count = 240, dummy = new THREE.Object3D();
  const wood = [new THREE.CylinderGeometry(0.12, 0.38, 4, 7)];
  for (let i = 0; i < 3; i++) {
    const branch = new THREE.CylinderGeometry(0.035, 0.12, 1.5, 5);
    branch.rotateZ(-0.85); branch.translate(0.5, 1.15 + i * 0.22, 0); branch.rotateY(i * 2.39996);
    wood.push(branch);
  }
  const woodGeo = mergeGeometries(wood);
  for (const part of wood) part.dispose();
  const bark = new THREE.InstancedMesh(woodGeo, new THREE.MeshLambertMaterial({ color: 0x5b4b3a }), count);
  // 道から見える雑木も共通の透ける葉房を使う。閉じた多面体を輪郭に残さない。
  const crowns = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996, r = i === 8 ? 0.12 : 0.46 + (i % 3) * 0.13;
    for (let j = 0; j < 2; j++) {
      const crown = new THREE.PlaneGeometry(1.05 + (i % 3) * 0.12, 1.25);
      crown.rotateX(-0.18 + (i % 3) * 0.2);
      crown.rotateY(a + j * Math.PI / 2);
      crown.translate(Math.cos(a) * r, i === 8 ? 0.68 : -0.28 + (i % 4) * 0.23, Math.sin(a) * r);
      crowns.push(crown);
    }
  }
  const crownGeo = mergeGeometries(crowns);
  for (const crown of crowns) crown.dispose();
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x829479, map: leafTex('broad'), alphaTest: 0.42, side: THREE.DoubleSide });
  crownMat.customProgramCacheKey = () => 'tonezaka-crowns-near-fade';
  crownMat.onBeforeCompile = (sh) => {
    toneLeafFade(sh);
    sh.uniforms.toneWind = { get value() { return SETTINGS.reduceMotion ? 0 : WIND_STATE.t; } };
    sh.uniforms.toneGust = { get value() { return SETTINGS.reduceMotion ? 0 : GUST.value; } };
    sh.uniforms.toneWindDir = WIND_DIR;
    sh.vertexShader = 'uniform float toneWind, toneGust; uniform vec2 toneWindDir;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float phase = dot(instanceMatrix[3].xz, toneWindDir) * 0.12;
      transformed.xz += toneWindDir * sin(toneWind * 1.6 + phase) * toneGust * 0.018 * max(0.0, position.y + 0.8);`);
  };
  const leaves = new THREE.InstancedMesh(crownGeo, crownMat, count);
  for (let i = 0; i < count; i++) {
    let x, z, y;
    if (i < 160) {
      // 同じ本数を沢ごとの小群へ。道に平行な等間隔の植え込みを崩す。
      const cluster = Math.floor((i % 80) / 5), within = i % 5;
      const localZ = 144 - cluster * 21 + Math.sin(cluster * 4.17) * 7 + Math.sin(within * 2.4) * 6;
      const localX = roadX(localZ) + (i < 80 ? -1 : 1) * (23 + (cluster * 17 % 29) + Math.cos(within * 2.4) * 6);
      const q = at(localX, localZ); x = q.x; z = q.z; y = W.heightAt(x, z) - 0.2;
    } else {
      const q = slope(i * 2.39996, 1 + (i % 6)); x = q.x; z = q.z; y = q.y;
    }
    const scale = 0.7 + (i % 5) * 0.12;
    dummy.position.set(x, y + 2 * scale, z); dummy.scale.set(scale, scale, scale);
    dummy.rotation.y = i * 2.39996; dummy.updateMatrix(); bark.setMatrixAt(i, dummy.matrix);
    dummy.position.y = y + 4.4 * scale; dummy.scale.set(2.6 * scale, 2.4 * scale, 2.1 * scale);
    dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix);
  }
  // 道脇は苔のある石だけ。浮いて見える箱形の土留めは置かない。
  // 月明かりの濡れた石は灰に光る。暗いままだと草地に黒い穴が並んで見えるので、わずかに自ら照らす（10/28）。
  const stones = new THREE.InstancedMesh(rockShape(1, true), new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x2a2c28 }), 144);
  const stonePoint = new THREE.Vector3(), stoneVertices = stones.geometry.attributes.position;
  for (let i = 0; i < 144; i++) {
    const cluster = Math.floor(i / 6), a = i * 2.39996;
    const z = 134 - cluster * 12.2 + Math.sin(cluster * 3.7) * 5 + Math.sin(a) * 3;
    const x = roadX(z) + (cluster % 2 ? -1 : 1) * (9 + (cluster * 17 % 24)) + Math.cos(a) * 3;
    const q = at(x, z), size = (i % 6 === 0 ? 0.65 : 0.22) + (i * 13 % 11) * 0.035;
    dummy.position.set(q.x, drawGroundAt(W, q.x, q.z) - 0.04, q.z);
    dummy.scale.set(size * 1.1, size * (1.15 + i % 3 * 0.15), size);   // 平たい黒い板に見えないよう、背を高くして肩を土から出す
    dummy.rotation.set(0, i * 2.39996, 0); dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
    // 腹の縁まで坂の土へ埋める。下端だけでは下り側に黒い腹が露出する。
    // 頂点の確認は設営時だけ。街道の当たりと兵の通り道は変えない。
    let sink = 0;
    for (let j = 0; j < stoneVertices.count; j++) {
      if (stoneVertices.getY(j) > 0.08) continue;
      stonePoint.fromBufferAttribute(stoneVertices, j).applyMatrix4(dummy.matrix);
      sink = Math.max(sink, stonePoint.y - drawGroundAt(W, stonePoint.x, stonePoint.z) + 0.04);
    }
    dummy.position.y -= sink; dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
  }
  // 『信長公記』巻六は峰で返し合わせる追撃戦を記す。
  // 準備済みの防衛線に見える常設の柵は置かず、道と山腹で殿の持ち場を示す。
  // https://ja.wikisource.org/wiki/信長公記
  group.add(bark, leaves, stones); W.scene.add(group);
  // 追加の林と露岩も、共通の林と同じく見える個体だけを詰めて描く。
  // 幹と葉は中心と拡大率が違うので、それぞれの外形で判定する。
  for (const mesh of [bark, leaves, stones]) W.viewCull([mesh], 0);
  return () => {
    group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    group.removeFromParent();
  };
}

// 本の野戦兵器の丸太・縄結びと、清洲の板囲いを手本にした道端の生活道具。
// 峠での追撃に常設の陣・攻城具は置かない。配置は史料にない補完。
function toneRoadside(W) {
  const group = new THREE.Group(), batches = [], dummy = new THREE.Object3D();
  // 木目は設営時に一枚だけ描き、丸太・箱で使い回す。外の素材は読み込まない。
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#66513c'; ctx.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 28; i++) {
    ctx.strokeStyle = i % 3 ? '#514432' : '#827056'; ctx.lineWidth = i % 4 ? 0.6 : 1.2;
    ctx.beginPath();
    for (let y = 0; y <= 128; y += 4) {
      const x = i * 2.4 + Math.sin(y * 0.08 + i * 1.7) * 0.7;
      if (!y) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const grain = new THREE.CanvasTexture(canvas); grain.colorSpace = THREE.SRGBColorSpace;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  const wood = new THREE.MeshLambertMaterial({ map: grain });
  const bamboo = new THREE.MeshLambertMaterial({ color: 0x77724a });
  const rope = new THREE.MeshLambertMaterial({ color: 0x9c8860 });
  const cloth = new THREE.MeshLambertMaterial({ color: 0x928773, side: THREE.DoubleSide });
  const riceMat = new THREE.MeshLambertMaterial({ color: 0x777b3d, side: THREE.DoubleSide });
  const kit = (geo, mat, far) => {
    const b = { geo, mat, far, matrices: [] }; batches.push(b); return b;
  };
  const logs = kit(new THREE.CylinderGeometry(1, 1, 1, 5), wood, 95);
  const canes = kit(new THREE.CylinderGeometry(1, 1, 1, 5), bamboo, 65);
  const ties = kit(new THREE.TorusGeometry(1, 0.09, 3, 7), rope, 32);
  const boards = kit(new THREE.BoxGeometry(1, 1, 1), wood, 85);
  // 雨を含んだ布を竿へ二つ折り。端は地面から浮かせ、平たい板にしない。
  const fold = new THREE.PlaneGeometry(1, 1, 6, 2), fp = fold.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(fp.getX(i) * 19) * 0.04 + Math.abs(fp.getX(i)) * 0.12);
  fold.computeVertexNormals();
  const cloths = kit(fold, cloth, 65);
  // 葉の先が垂れ、穂が曲がる稲株。一株三十六面だけで、近くに寄った時だけ描く。
  const riceParts = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 2.39996, blade = new THREE.PlaneGeometry(0.035, 0.8, 1, 2);
    const p = blade.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const h = p.getY(j) + 0.4;
      p.setXYZ(j, p.getX(j) + h * h * 0.24, h, 0);
    }
    blade.rotateY(a); riceParts.push(blade);
    const ear = new THREE.PlaneGeometry(0.07, 0.2);
    ear.rotateZ(0.7); ear.translate(0.18, 0.72, 0); ear.rotateY(a); riceParts.push(ear);
  }
  const riceGeo = mergeGeometries(riceParts);
  for (const p of riceParts) p.dispose();
  const rice = kit(riceGeo, riceMat, 42);
  const put = (batch, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    const q = at(x, z);
    dummy.position.set(q.x, y, q.z); dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(rx, ry + TURN, rz, 'YXZ'); dummy.updateMatrix();
    batch.matrices.push(dummy.matrix.clone());
  };
  const ground = (x, z) => { const q = at(x, z); return drawGroundAt(W, q.x, q.z); };
  const beam = (batch, x, z, endX, endZ, h, r) => {
    const y = ground(x, z) + h, endY = ground(endX, endZ) + h;
    const dx = endX - x, dz = endZ - z, len = Math.hypot(dx, dz);
    put(batch, (x + endX) / 2, (y + endY) / 2, (z + endZ) / 2,
      r, Math.hypot(len, endY - y), r, Math.atan2(len, endY - y), Math.atan2(dx, dz));
  };
  // 里の小屋の裏の低い境柵。道・避難路は横切らず、出入口を開ける。
  for (let i = 0; i < 8; i++) {
    const x = -35 + i * 1.4, z = 75.5, y = ground(x, z);
    put(logs, x, y + 0.55, z, 0.065, 1.25, 0.065, 0, 0, (i % 3 - 1) * 0.04);
    if (i < 7) for (const h of [0.4, 0.85]) beam(canes, x, z, x + 1.4, z, h, 0.035);
    put(ties, x, y + 0.85, z, 0.09, 0.09, 0.09, Math.PI / 2);
  }
  // 撤収中に残された担い棒・竹束と畳んだ幕。幕は低く、無人の大旗は足さない。
  for (const [x, z] of [[19, -24], [-21, -124]]) {
    for (const side of [-1, 1]) {
      const px = x + side * 1.1, y = ground(px, z);
      put(logs, px, y + 0.65, z, 0.07, 1.5, 0.07);
      put(ties, px, y + 1.15, z, 0.1, 0.1, 0.1, Math.PI / 2);
    }
    beam(logs, x - 1.2, z, x + 1.2, z, 1.2, 0.055);
    put(cloths, x, ground(x, z) + 0.91, z + 0.06, 1.8, 0.55, 1, 0.12);
    for (let i = 0; i < 9; i++) {
      const bx = x + (i % 3) * 0.11 - 0.1, bz = z + 1.2;
      beam(canes, bx, bz - 1.3, bx + 0.15, bz + 1.3, 0.12 + Math.floor(i / 3) * 0.1, 0.048);
    }
    for (const dz of [-0.7, 0.7]) put(ties, x + 0.07, ground(x, z + 1.2 + dz) + 0.24,
      z + 1.2 + dz, 0.21, 0.21, 0.21);
    // 空の木箱。上を塞がず、板の厚みと底を残す。
    const bx = x + 1.6, bz = z + 1.1, by = ground(bx, bz);
    put(boards, bx, by + 0.08, bz, 0.9, 0.12, 0.65);
    for (const s of [-1, 1]) {
      put(boards, bx + s * 0.43, by + 0.3, bz, 0.06, 0.5, 0.65);
      put(boards, bx, by + 0.3, bz + s * 0.3, 0.8, 0.5, 0.06);
    }
  }
  // 谷底の二枚の小田だけ。夜の峠の山腹へ田畑を敷き詰めない。
  for (const [cx, cz] of [[-10, 123], [-14, 108]]) {
    for (let row = 0; row < 12; row++) for (let col = 0; col < 8; col++) {
      const x = cx + (col - 3.5) * 0.43 + Math.sin(row * 7 + col) * 0.06;
      const z = cz + (row - 5.5) * 0.48, q = at(x, z);
      if (W.slopeTan(q.x, q.z) > 0.35 || peopleNear(q.x, q.z) || distToPolyline(q.x, q.z, ROAD) < 6) continue;
      put(rice, x, ground(x, z) - 0.03, z, 0.9, 0.85 + (row % 3) * 0.06, 0.9, 0, row * 1.7 + col);
    }
  }
  for (const b of batches) {
    if (!b.matrices.length) { b.geo.dispose(); continue; }
    const mesh = new THREE.InstancedMesh(b.geo, b.mat, b.matrices.length);
    for (let i = 0; i < b.matrices.length; i++) mesh.setMatrixAt(i, b.matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh); W.viewCull([mesh], 0, b.far);
  }
  W.scene.add(group);
  return () => {
    group.removeFromParent();
    for (const mesh of group.children) mesh.dispose();
    for (const b of batches) b.geo.dispose();
    for (const mat of [wood, bamboo, rope, cloth, riceMat]) mat.dispose();
    grain.dispose();
  };
}

// 各任務の上限。夜の追撃から城下の守りまで、残兵探しで長引かせない。
const STAGE_LIMIT = { 1: 75, 2: 100, 3: 55, 5: 60, 6: 45 };
// 台詞は場面の復元。史料の発言をそのまま再現したものではない。
const REAR_VOICE = {
  '河合吉統': 'ここで食い止める！　皆の衆、槍を向けよ！',
  '山崎吉家': '坂で返せ！　義景様を敦賀へお通しする！',
  '斎藤龍興': 'まだ退くな！　この坂は渡さぬ！',
  '詫美越後守': '峠を守れ！　本隊が抜けるまで踏みとどまれ！',
};
function withdrawStage(rt) {
  const F = rt.flags, groups = F.stageDefenders[F.step];
  for (const g of groups) {
    // 自分と組が三人を倒すと、三割弱の損失でも守りが崩れる。無傷の備は退かせない。
    const threshold = g._toneHelp >= 3 ? 0.75 : 0.6;
    if (fighting(g) && (fighters(g) <= g.initial * threshold || rt.t - F.stepT >= STAGE_LIMIT[F.step])) {
      retreat(g); tonezaka.onRout(rt, g);
    }
  }
}

// 討った瞬間にも古い段を指さない。次の備の最寄りへ同じコマで替える。
function toneMissionStep(rt) {
  let step = rt.flags.step;
  while (step >= 1 && step <= 3 && !rt.flags.stageDefenders[step].some(fighting)) step++;
  return step;
}
function toneMissionEnemy(rt) {
  const F = rt.flags, step = toneMissionStep(rt), p = rt.player.u.pos;
  if (F.ending || rt.over) return null;
  const old = F.missionEnemy;
  // 曲がりへ進む時に、見えない敵の▼を探させない。道案内と同じ一手にする。
  if (step === F.step && F.guideBend) return null;
  if (F.missionEnemyStep === step && F.missionEnemyAt > rt.t && old && fighter(old) && !old.downed && !old.rearWound &&
      near(p, old.pos, VISIBLE_REAR) && Math.abs(old.pos.y - p.y) < 3 && sightScreenUnit(rt, old)) return old;
  F.missionEnemyAt = rt.t + .2; F.missionEnemyStep = step;
  let best = null, distance = Infinity;
  for (const g of F.stageDefenders[step] || []) {
    if (!fighting(g)) continue;
    for (const u of g.units) {
      if (!fighter(u) || u.downed || u.rearWound || !near(p, u.pos, VISIBLE_REAR) ||
          Math.abs(u.pos.y - p.y) >= 3 || !sightScreenUnit(rt, u)) continue;
      const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
      if (d < distance) { best = u; distance = d; }
    }
  }
  return (F.missionEnemy = best);
}

const tonezaka = {
  // 稲生の水準：任務一行・ピン・敵の▼だけで現在の一手を示す。
  missionSingleLine: true,
  hideMissionDots: true,
  hideGuideSteps: true,
  noPlayerFoot: true,
  quietMiss: true,
  noDodgeCard: true,
  enemyTriangleSigns: true,
  nearbyAllySignLimit: 0,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  bannerAllowed: (rt, title) => rt.over || !!rt.flags.ending || /討ち取|討死|勝|一乗谷の火/.test(title),
  missions: ['味方と集まれ', '▼の敵を倒せ', '味方と進め', 'ここを守れ'],
  missionOf(rt) {
    const F = rt.flags, step = toneMissionStep(rt);
    if (F.ending) return 3;
    if (step === 0 || toneShelter(rt) || step === F.step && F.guideJoin && (step < 4 || step === 6)) return 0;
    if (step === 6) return near(rt.player.u.pos, INNER, 12) ? 3 : 2;
    if (step === 5 && !fighting(F.townG)) return near(rt.player.u.pos, TOWN, 14) ? 3 : 2;
    return toneMissionEnemy(rt) ? 1 : 2;
  },
  missionHeading(rt) { return toneShelter(rt) ? '味方へ下がれ' : this.missions[this.missionOf(rt)]; },
  missionSignTarget(rt) { return this.missionOf(rt) === 1 ? toneMissionEnemy(rt) : null; },
  // 総大将は退く義景本人。討ち取りの任務や勝ちの条件は足さない。
  commanderSignTarget(rt) {
    const F = rt.flags, u = F.yoshikageU;
    return !rt.over && !F.ending && F.step < 4 && u?.alive && !u.gone && !u.dying && !u.woundOut ? u : null;
  },
  namedGuideTarget(rt) { return this.commanderSignTarget(rt); },
  commanderTarget(rt) {
    const u = this.missionSignTarget(rt);
    return u?.type === 'busho' ? u : null;
  },
  missionPin(rt) {
    const F = rt.flags, step = toneMissionStep(rt);
    if (F.ending || rt.over || F.step === 4 || !rt.player.u.alive) return null;
    const pin = F.missionPin || (F.missionPin = { x: 0, z: 0, r: 0, hide: 0, silent: true, always: true });
    pin.unit = null; pin.enemy = false; pin.waiting = false; pin.defend = false;
    pin.arrived = false; pin.route = false; pin.approach = false;
    const shelter = toneShelter(rt);
    if (shelter) {
      const way = chaseWay(rt.army, rt.player.u, shelter);
      pin.x = way.x; pin.z = way.z; pin.r = 3; pin.hide = 0;
      pin.route = way !== shelter;
      pin.arrived = near(rt.player.u.pos, shelter, 3);
      return pin;
    }
    if (step === 4) return null;
    // 合流の下知と同じ道を指す。奥の守り場へ直行させ、勝家の手を置き去りにしない。
    if (step === F.step && F.guideJoin && (step < 4 || step === 6)) {
      pin.x = F.roadGuide.x; pin.z = F.roadGuide.z; pin.r = 3; pin.hide = 0;
      pin.route = F.guideBend;
      return pin;
    }
    const enemy = this.missionSignTarget(rt);
    if (enemy) {
      if (rt.player.inRange && rt.player.rangeCueTarget === enemy) return null;
      const way = chaseWay(rt.army, rt.player.u, enemy.pos);
      pin.x = way.x; pin.z = way.z; pin.r = pin.hide = .2;
      pin.route = way !== enemy.pos; pin.unit = pin.route ? null : enemy;
      pin.enemy = !pin.route; pin.approach = true;
      return pin;
    }
    // 守り場に着いてもピンを残す。勝家の兵も同じ持ち場へ進む。
    const post = step === 6 ? INNER : step === 5 ? TOWN : F.roadGuide;
    const reached = step >= 5 && near(rt.player.u.pos, post, step === 6 ? 12 : 14);
    const way = reached ? post : chaseWay(rt.army, rt.player.u, step === 0 ? F.nobuU.pos : post);
    pin.x = way.x; pin.z = way.z; pin.r = reached ? (step === 6 ? 12 : 14) : 3;
    pin.hide = 0; pin.route = !reached; pin.waiting = pin.defend = step >= 5;
    pin.arrived = reached;
    return pin;
  },
  compactIntro: true,
  introKeepControls: true, // 初めての追撃でも、進むキーと槍の操作を開始前に読める。
  introTaskFirst: true, // 横持ちでも人物紹介より先に、進み方と勝つ条件を読めるようにする。
  introPeopleFolded: true, // 人物の説明は開いて読む。初めは進み方と勝つ条件を一枚に収める。
  compactFieldGuides: true, // 敵を人型の太い枠で覆わず、頭の脇の小さな印で示す。
  noUnitContrast: true, // 白い簡略人型は別の描画。頭上の敵味方の印を残し、具足を見せる。
  compactCombatGuides: true,
  compactApproachGuide: true, keepApproachTaskPanel: true, // 接近先の大札を重ねず、足元の向きと左上の下知で近づく。
  enemyCornerSign: true, enemyFrameAtPosition: true, enemyFootRingRadius: 0.4, // 接近中の敵も現在地の四隅と小さな輪で示し、具足を空ける。
  nearbyEnemySignRange: 0, // 刀は狙う一人だけ。周囲の三人にも重ねて槍先を隠さない。
  compactWaitGuard: true, // 横持ちでは防御札を親指側の端へ固定し、敵の槍を空ける。
  compactRetreatSign: true, compactRetreatArea: true, // 退き先の旗と輪で左下の命の札を覆わない。
  singleRetreatArrow: true, retreatArrowLength: 72, // 足元に退く向きだけを示し、目前の兵へ長い白線を重ねない。
  retreatDestinationArrowOnly: true, // 退き先も矢印一つ。敵の印に大旗・白い輪・「ここへ」を重ねない。
  nearAllySolidBody: true, nearAllyWholeOcclusion: true, // 視点に重なる味方は、顔や胴を別々に透かさず描く間だけ避ける。
  enemyCornerSign: true, // 描画側が読む指定で四隅を細くし、敵の槍と具足を空ける。
  enemyFrameAtPosition: true, // 動く骨の更新順に左右されず、兵の現在地へ印を合わせる。
  enemyFootRingRadius: 0.4, // 相手の足元だけを示し、隣の兵まで大きな白輪で囲まない。
  bodyHeightGuides: true, // 徒歩兵を一律の高さで囲まず、笠のすぐ上へ敵の印を寄せる。
  namedGuideMarkers: true, // 同じ旗印でも、味方・敵・道の曲がりを言葉で分ける。
  singleDestinationArrow: true, // 道の先と足元に矢印を重ねず、次の行き先一つへ導く。
  routeGuideArrowOnly: true, // 道の曲がりは矢印だけ。そこに実物の旗があるように見せない。
  directionalDestinationArrow: true, // 道の先を指す印も進む向きにそろえ、下がる操作と取り違えさせない。
  hideEdgeGoalDistance: true, // 歩数の字を足さず、行き先はピンで示す。
  avoidDestinationNotices: true, // 上の軍勢札や右の任務札に印が隠れる時は、空いた側へ向きを示す。
  compactDestinationSign: true, // 近い兵や槍を覆わず、携帯でも読める大きさの案内にする。
  hidePlayerSign: true, // 自分は姿と視点で分かる。肩越しで体から離れて見える輪を重ねない。
  standardClothScale: 0.72, // 狭い峠の肩越しでも、布の脇から敵の顔と槍先を見渡せる大きさにする。
  fadeCloseStandards: true, fadeCloseStandardFrame: true, // 近い旗の判定に使う。薄くする範囲の隊旗は下の更新で竿ごと隠す。
  woundedStandardsFall: true, // 生きていても深手で持てない旗は地へ落とし、隣の兵が拾う。
  immediateTaskChanges: true,
  immediatePhaseTasks: true,
  keepTaskLabel: true,
  keepDestinationTask: true, // 「次の曲がりへ。道の印へ」と重ねず、今の下知をそのまま読む。
  keepRetreatReason: true, // 命が多くても、息切れ・包囲・手傷のどれで退くかを残す。
  keepWoundRetreatReason: true,
  woundRetreatNeeded: toneWoundRetreat, // 任務と地面の印で同じ負傷の判定を使う。
  keepTaskPanel: true, // 接敵しても札を敵の胴へ移さず、左上の同じ欄で読む。
  combatTaskLabel: () => '',
  keepCombatTaskHeading: true,
  keepTaskWithGuard: true,
  distanceText: () => '',
  taskDetail: () => '',
  retreatGuideLabel: () => '',
  travelGuideLabel: () => '',
  nobiki: true, // 追い手が崩れた時は、鉦だけでなく法螺貝と退き太鼓で退く。
  civilianCrowd: { bands: PEOPLE_BANDS },
  camMaxDown: .18, // 峠の下り坂で後ろの地形が高くても、真上から見下ろさず低い肩越しに保つ（共通の口）。
  spawn: { ...at(roadX(86) + 3, 86), heading: Math.PI + TURN },
  introText: isTouch ? `${SETTINGS.touchSwap ? '右' : '左'}側を上へなぞって進もう。馬に乗った信長公と供の兵に続こう。敵へ向いて「構える」を押そう。「突く」を長く押し、離して突こう。`
    : `馬に乗った信長公と供の兵に続こう。敵へ向いて右押し${SETTINGS.guardToggle ? 'で槍を構えよう。もう一度押すと構えを解く。' : 'を押し続け、槍を構えよう。'}左押しを長く押し、離して突こう。`,
  softOpen: 90, // 最初の追撃は本人の傷を半分にし、構えと退き方を覚える間を残す。
  // 任務の言葉との部分一致に頼らず、既に置いた道と味方の印を選ぶ。
  guideMarker(rt) {
    if (rt.flags.ending) return null;
    if (toneShelter(rt)) return 'toneShelter';
    switch (rt.flags.step) {
      case 0: return 'nobu';
      case 1: return 'toneFront';
      case 2: return 'toneRoad';
      case 3: return 'pass';
      // 城下へ着いたら味方を待つ。到着の半径と矢印を消す半径をそろえる。
      case 5: return !fighting(rt.flags.townG) && near(rt.player.u.pos, TOWN, 14) ? 'townAllies' : 'town';
      case 6: return !rt.flags.guideJoin && near(rt.player.u.pos, INNER, 12) ? null : 'inner';
      default: return null;
    }
  },
  // 肩越しの視点を低く構え、真上から見下ろさない（10/28 資料との差：地面から2m ほど）。一人称の目の高さは保つ。
  clampCamera(rt, p) {
    if (!rt.player.u.alive || rt.over) return;
    p.y = Math.max(rt.world.heightAt(p.x, p.z) + 1.0, Math.min(p.y, rt.player.u.pos.y + 2.3));
  },
  playerRegen: 0.02,   // 稲生の標準：戦っていない間は命が戻り、血も止まる（player_hurt.js）
  playerTaken: 0.75,   // 受ける傷を七割五分に（稲生の初陣は六割。最後まで戦い通せるように）
  // 身の回りの当時の場（timeslip_field.js）。天正元年八月十三日は今の九月半ば。夜の風雨（『信長公記』）。
  // 退く朝倉勢を追う峠道はぬかるみ、水たまりと折れた枝。道に沿って朝倉方の旗・槍・脱げた陣笠が捨てられている。
  timeslip: {
    laySpear: toneGroundSpear,
    wet: 1, dust: 0.05, trample: 0.4, debris: 1.2, arrows: 0.35, branches: 0.05,
    grass: 0x748a4c, grassTints: [0xffffff, 0xe0e6c0, 0xc8d0a0], grassH: 1.05, tallGrass: 0.9,
    flagColors: [0xe8e4d8, 0x1e1c1a, 0x30405a], hazeColor: 0x4a5258, mudOpacity: 0.3, pools: 0,   // 夜の月明かりでは泥と水たまりが黒い穴に見える。薄い踏み跡だけ
    fights: [...ROAD.map(([x, z]) => [x, z, 22]), ...CHASE_ROAD.map(([x, z]) => [x, z, 18])],
  },
  world: {
    seed: 15738,
    // 静かな景物は材質で結合し、画面外と遠い小屋の細部を送らない。
    compactScenery: true,
    mergeStaticBatches: true,
    // 本物の義景の供と南の後続は歩ける地面に収め、軽い本隊は場の外に置く。
    moveLim: 280,
    groundHalf: 300,
    time: 'night',   // 十三日夜中の追撃から始める。
    crowdFighter: toneCrowdFighter,
    // 馬の土煙で共通の見通しが十八歩まで縮み、先の供まで消えるのを防ぐ。
    // 煙そのものと夜の霞は残し、この谷の追い手と次の曲がりを見渡せる範囲を保つ。
    smokeFogFloor: 100,
    unitNightScale: 0.45, // 近い兵の補光を抑え、漆の胴と袖を白い縁で囲まない。夜道の照明は保つ。
    // 厚い雲の夜に晴夜用の月光を重ねず、山腹の白飛びを抑える。
    nightMoonMin: 0.55,
    nightFill: 0.45,
    ordinaryFlagStride: 3, // 無名の足軽の指物を減らし、騎馬と槍先を見せる。割合は補完。
    rainOpacity: 0.62, // 雨筋を夜にも見せる（既定 0.24）。0.95 では白い描いた線に見えた（10/29 点付け）
    rainDir: [2.6, 0.4], // 風下へ横から強く吹きつけ、雨筋を画面の斜めに流す（長さが横風の強さ。南を向く画面で約25度傾く）。
    windStrength: 1.8, // 雨と一緒に風が吹き、道の脇の草が大きくなびく。
    lightning: false, // 追撃の夜まで雷が続いたとは確定できない。
    rainSplashScale: 0.3, // 弱い雨の跳ねを小さくし、街道を白い虫の群れのように見せない。
    muddy: 0.95,
    softEarthCrust: true, // 土塊の境だけを残し、道に升目の陰を並べない。
    erodedSlopes: true,
    noHaori: true, // 足軽を主に、武将にも陣羽織・母衣を着せない。
    variedInfantry: true, variedLoanArmor: true, variedHeadgear: true,
    completeCrowdLegs: true, // 遠目で中の体を隠す時も、草摺から臑当まで袴と布を残す。
    kasaDrape: false, // 資料本四十七頁は首布付きの陣笠を江戸期と区別。天正の兵へ一律に足さない。
    longHoro: 'round', // 母衣は既存の丸い籠と布を使い、騎馬の背へ細い板を垂らさない。
    livingSpearHedge: true, contactDust: true,
    meleeGroundedFeet: true, // 構えと突きの足を坂へ据える。既存の近景十八人の枠を使う。
    variedMarch: true, strideLimit: 1.25, // 退く列の歩調をばらし、走る腿を頭まで上げない。
    drawTimeUnitParts: true, // 移動後の骨と具足の逆行列を描く時にそろえ、部品や槍を取り残さない。
    fullTipMatrices: true, // 遠い兵も手首と指をそろえ、近景まで皮膚が帯状に伸びるのを防ぐ。
    movingHiddenBones: true, // 画面外を進む兵も、根元が動いた時だけ骨を同じ位置へ移す。
    groundedFalls: true, settleSideFalls: true, // 横斬りで崩れた肩と胴を坂へ寝かせる。
    terrainContactFalls: true, slopeContactFalls: true, // 倒れる先の坂と腰・胸を支え、携帯でも亡骸を浮かせない。
    groundedFallImpact: true, wetEarthBursts: true, // 地を打つ時に音と低い泥粒。雨後に白い土煙を立てない。
    bareFallenHats: true, slopeLitter: true, // 落ちた笠は首布を外し、笠と武具を坂へ沿わせる。
    rocks: 0, // 黒い大岩を重ねず、刀根坂で設営する百四十四個の小さな露岩を使う。
    slopeRockFaces: true, // 坂の外へ岩の厚みを向け、黒い薄板に見せない。
    groundedSlopeRocks: true, // 岩を坂へ埋め、谷をまたぐ黒い扇形の接地影を省く。
    templeNeedles: true, thickTrees: true, // 共通の丸い葉房と枝付きの幹を使う。
    layeredNeedles: true, raggedNeedles: true, // 既存の枝先の凹凸を使い、杉の整った三角の段を崩す。
    closedFarCrowns: true, // 遠い雑木の重なる頂点を同じ量だけ動かし、黒い房の継ぎ目を閉じる。
    terrainTags: true,   // F1：ぬかるみ・坂・道で速さと疲れが変わる（terrain_tags.js。騎馬はぬかるみと坂で弱る）
    yieldAlliedHorse: true, // 徒歩の主人公も味方の馬の胴をすり抜けず、列の脇へ譲る。
    keepSpawnInside: true,
    noticeRepeatGap: 1e9, // この戦で一度見た知らせは再掲しない。任務の札は残す。
    blockedEscape: true,
    blockedEscapeAfter: 0.7, // 通れる横道を確かめて列の脇へ出る。
    blockedHint: (rt) => `${rt.blockedMove?.cause || '道の障り'}で足が止まった。${rt.phase === 'brief' ? '下知を聞き、馬廻が動いてから続け' : '山腹へ登らず、街道の内で列の脇を通れ'}`,
    paths: [ROAD, CHASE_ROAD],
    height,
    moveWay: chaseWay,
    fleeWay: toneFleeWay,
    guideWay: (u, p) => chaseWay(null, u, p), // 足が止まった時の案内も街道の曲がりに沿わせる。
    tint(x, z, h, c) { if (Math.min(distToPolyline(x, z, ROAD), chaseNear(x, z)) > 16) c.setRGB(c.r * 0.82, c.g * 0.88, c.b * 0.8); },
    clear: (x, z) => Math.min(distToPolyline(x, z, ROAD), chaseNear(x, z)) < 13 || Math.hypot(x - TOWN.x, z - TOWN.z) < 38 || peopleNear(x, z),
    trees: 700,
    tufts: 2600,
    tuftTint: 0x69755c, // 夜の補光で葉先が白い粒に見えないよう、湿った林床へ寄せる。
    treeDensity: (x, z) => {
      if (Math.min(distToPolyline(x, z, ROAD), chaseNear(x, z)) < 18 || Math.hypot(x - TOWN.x, z - TOWN.z) < 38) return 0.15;
      return 0.25 + 0.75 * sstep(-0.45, 0.55, Math.sin(x * 0.065 + Math.sin(z * 0.037) * 2) * Math.cos(z * 0.09));
    },
    // 葉が画面の上へ抜ける背の高い竹藪を置かず、枝葉のある雑木の林縁にする。
    noBamboo: true,
    // 刀根坂の峠の両脇は杉の森（街道の口は開ける）。
    groves: [{ ...at(30, 40), r: 12, n: 16, kind: 'broad' }, { ...at(-34, -60), r: 12, n: 16, kind: 'broad' },
      { ...at(-30, -150), r: 11, n: 14, kind: 'sugi' }, { ...at(16, -186), r: 8, n: 12, kind: 'sugi' },
      { ...at(-28, -125), r: 9, n: 10, kind: 'sugi' }, { ...at(22, -128), r: 9, n: 10, kind: 'sugi' },
      // 持ち場の先の街道の両脇にも杉を並べ、最初の画面から峠の杉の森が道を挟んで見えるように。
      { ...at(-27, 62), r: 8, n: 11, kind: 'sugi' }, { ...at(12, 56), r: 6, n: 10, kind: 'sugi' },
      { ...at(-26, 30), r: 9, n: 12, kind: 'sugi' }, { ...at(14, 28), r: 7, n: 12, kind: 'sugi' },
      // 持ち場の右手の明るい斜面にも杉の群れ（最初の画面の右半分が裸の草地に見えないように）。
      { ...at(9, 48), r: 5, n: 8, kind: 'sugi' }, { ...at(13, 30), r: 6, n: 9, kind: 'sugi' }],
    fleeOut: (x, z, team) => team === 1 && along(x, z) < -235,
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world, F = rt.flags;
    timeslipField(rt);   // 身の回りの雨のぬかるみ・水たまり・捨てられた旗と槍（def.timeslip）
    // 退く朝倉勢が道に捨てた荷駄（荷車・俵・樽・箱）と、倒れた荷駄馬（資料との差 10/28：退く軍の見た目）
    wayLitter(rt, LOCAL_ROAD.filter(([, z]) => z < 150 && z > -175).map(([x, z]) => xz(x, z)), { seed: 1573, step: 15, off: 5.4, clear: 3.6,
      // 持ち場の近く（z 28〜95）は外の素材の角ばった袋（橙の箱に見えた）を置かず、下の丸い俵と倒れた馬で荷駄の崩れを見せる。
      skip: (x, z) => { const lz = z * CS + x * SN; return lz > 28 && lz < 95; } });
    wayLitter(rt, CHASE_ROAD.slice(0, 4), { seed: 813, step: 18, off: 5.6, clear: 3.8, kinds: ['cart', 'sack', 'barrel', 'sack'] });
    // 一頭目は持ち場から十数歩先の道の左の肩に、二頭目は右の肩に倒し、こぼれた俵と脱げた笠を添える（最初の画面に荷駄の崩れを。10/28 二度目）。
    // 25秒の時、主人公は持ち場から十五歩ほど進み（z≈55）、カメラは南（z の小さい方）を向く。崩れはその先 z 33〜46 の道の両肩へ。
    // 25秒の時、主人公は道の右（x≈-3, z≈56）に立ち、画面の右半分が空いた草地になる。その右の肩（x 2〜7, z 44〜50）にも倒れた荷駄馬と俵・笠を（10/29）。
    fallenHorses(rt, [[-14, 44, 0.5], [-1, 37, 2.2], [4, 47, 1.3], [9, 22, -0.4], [14, -66, 2.6], [-12, -118, 0.2]].map(([x, z, r]) => [...xz(x, z), r]));
    for (const [x, z, r, n] of [[-12.5, 40, 0.3, 3], [-2.5, 41.5, -0.6, 2], [-15, 48, 1.1, 2], [0, 33, 0.8, 2], [5.8, 44.5, 0.9, 3], [2.2, 49.5, -0.3, 2]]) { const p = at(x, z); rt.scene.add(tawara(W, p.x, p.z, r + TURN, n)); }
    droppedKasa(rt, [[-11, 42.5, 0.4], [-4, 46, 2.1], [-3, 35, 4.0], [-12.5, 36, 5.2], [1.5, 40, 1.3], [6.8, 48.5, 0.7], [3, 43.5, 2.9], [1.2, 47, 3.6]]);
    { const label = document.querySelector('#h-breath span'); if (label) label.textContent = ''; } // 左下の「馬の息」の字を消し、帯だけを残す（10/28 共通：字を消す）。
    // 夜の遠い山腹は霧の色まで薄れる。空も低い所を同じ霞へつなぎ、
    // 地面の外周や描画距離の切れ目を黒い空との大きな角に見せない。
    // 見上げても霞を残し、急な山の稜線のすぐ上だけ黒い天井へ戻さない。
    // 刀根坂の空だけを変え、昼・歩く地形・遠景の頂点数は保つ。
    W.skyMat.uniforms.toneHaze = { value: W.scene.fog.color };
    W.skyMat.uniforms.toneNight = W.nightU;
    // 空は実際の視点を中心に描く。高い坂や近い描画距離でも球面を切らない。
    // 奥行きを書かず先に描くので、山・林・兵は従来どおり空の手前に重なる。
    W.sky.frustumCulled = false;
    W.skyMat.depthTest = false;
    W.skyMat.vertexShader = `varying vec3 vP;
      void main() {
        vP = normalize(position);
        vec4 skyClip = projectionMatrix * vec4(mat3(viewMatrix) * mat3(modelMatrix) * position, 1.0);
        gl_Position = skyClip.xyww;
      }`;
    // 霧は色の仕上げ後に掛かる。空も同じ段で合わせ、画質による境目を作らない。
    W.skyMat.fragmentShader = 'uniform vec3 toneHaze; uniform float toneNight;\n' + W.skyMat.fragmentShader.replace(
      '#include <colorspace_fragment>', `#include <colorspace_fragment>
          vec3 toneSkyHaze = toneHaze * (1.0 - 0.15 * smoothstep(0.0, 0.85, max(d.y, 0.0)));
          // 一色の紺の天井にしない：低く垂れた雨雲の濃淡（向きだけで決まる、毎コマの計算は少し）。
          vec2 tcU = d.xz / (max(d.y, 0.0) + 0.22);
          float tc = sin(tcU.x * 1.7 + sin(tcU.y * 1.3) * 1.6) * sin(tcU.y * 1.9 + sin(tcU.x * 2.3) * 1.1);
          tc += 0.5 * sin(tcU.x * 4.1 - tcU.y * 3.3 + sin(tcU.y * 5.0)) * sin(tcU.y * 4.7 + tcU.x * 1.9);
          toneSkyHaze *= 0.7 + 0.6 * smoothstep(-1.1, 1.3, tc) * (1.0 - 0.35 * smoothstep(0.2, 0.95, d.y));
          // 霞の色は線形の値。色の仕上げの後で混ぜるので出力の色へ直す（直さないと空が真っ黒な天井になる）。
          gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(toneSkyHaze, 1.0)).rgb, toneNight * 0.92);`);
    W.skyMat.needsUpdate = true;
    // 共通の林の形は保ち、この戦で作った葉の材質だけを変更する。
    const shadedLeaves = new Set();
    for (const mesh of W.treeMeshes || []) {
      const mat = mesh.material;
      if ((!mesh.customDepthMaterial && !mesh.userData.treeFoliage) || !mat?.alphaTest || shadedLeaves.has(mat)) continue;
      shadedLeaves.add(mat);
      const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
      mat.customProgramCacheKey = () => key + '|tonezaka-near-leaves';
      mat.onBeforeCompile = function (sh) { compile.call(this, sh); toneLeafFade(sh); };
      mat.needsUpdate = true;
    }
    // 刀根坂の地面だけに土の斑・砂利・途切れた踏み跡を重ねる。
    // 既存の絵と地面の一回の描画を使い、低画質でも濃淡を残す。
    const groundMat = W.terrain.material, compileGround = groundMat.onBeforeCompile;
    const groundKey = groundMat.customProgramCacheKey();
    const roadSegments = [ROAD, CHASE_ROAD].flatMap((road) => road.slice(1).map((p, i) => {
      const a = road[i], dx = p[0] - a[0], dz = p[1] - a[1];
      return `{
        vec2 a = vec2(${a[0].toFixed(5)}, ${a[1].toFixed(5)});
        vec2 d = vec2(${dx.toFixed(5)}, ${dz.toFixed(5)});
        vec2 q = wuv - a;
        float t = clamp(dot(q, d) / dot(d, d), 0.0, 1.0);
        toneRoad = min(toneRoad, length(q - d * t));
      }`;
    })).join('\n');
    groundMat.customProgramCacheKey = () => groundKey + '|tonezaka-road-horizon-wet';
    groundMat.onBeforeCompile = function (sh) {
      compileGround.call(this, sh);
      toneHorizonFog(sh, W);
      // 山腹の土色と岩の投影を、三角ごとの面法線で切り替えない。
      // 既存の頂点法線を補間し、同じ坂で草・土・岩が連続するようにする。
      // 地面の形・歩く高さ・切岸の当たりは変えない。
      sh.fragmentShader = sh.fragmentShader.replace(
        'vec3 gN = normalize(cross(dFdx(vWP), dFdy(vWP)));',
        'vec3 gN = normalize(vWN);');
      // 斜面の向きで絵の座標を回すと、地面の三角ごとに雨溝が飛ぶ。
      // 刀根坂だけ連続した地面の座標へ固定し、土の斑で溝を崩す。
      sh.fragmentShader = sh.fragmentShader.replace(
        `vec2 bankUv = vec2(vWP.x * 0.096 + vWP.z * 0.072,
              vWP.y * 0.035 + vWP.z * 0.024) + vec2(macro2, macro) * 0.12;`,
        'vec2 bankUv = vWP.xz * 0.085 + vec2(macro2 - 0.5, macro - 0.5) * 0.22;');
      // 既定の窪みを一面に並べず、薄い跡をまばらに残す。
      // 歩いて刻む足跡と轍は保ち、ほかの戦の地面には触れない。
      sh.fragmentShader = sh.fragmentShader.replace('float clodK =',
        'float clodSparse = smoothstep(0.55, 0.85, clodSeed) * mix(0.06, 0.22, trod);\n          float clodK = clodSparse *');
      sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb *= col;', `
        float toneRoad = 10000.0;
        ${roadSegments}
        float toneLane = 1.0 - smoothstep(2.4, 4.8, toneRoad);
        float toneSoil = smoothstep(0.38, 0.7, macro2) * (1.0 - steep * 0.35);
        // 通れる幅は変えず、踏み固めた中央だけ湿った土として見せる。
        vec3 toneEarth = mix(dirt, mud, uWet * 0.45) * vec3(0.9, 0.82, 0.7);
        col = mix(col, toneEarth, max(toneLane * 0.72, toneSoil * 0.48 * (1.0 - smoothstep(5.0, 13.0, toneRoad))) * (1.0 - steep));
        // 道の肩から二十歩ほどは雨に踏み荒らされた濡れ土と倒れた草の斑。平らな緑の一枚に見せない（点検表 5）。
        float toneShoulder = (1.0 - smoothstep(4.0, 24.0, toneRoad)) * (0.45 + 0.4 * smoothstep(0.3, 0.7, macro));
        col = mix(col, mix(toneEarth, mud * vec3(0.7, 0.66, 0.58), 0.5), toneShoulder * 0.55 * (1.0 - steep * 0.5));
        float toneGravel = smoothstep(0.55, 0.76, edge) * smoothstep(0.38, 0.65, macro2);
        col = mix(col, stone * vec3(0.9, 0.86, 0.78), toneGravel * (0.1 + toneLane * 0.16));
        // 真っ直ぐな二本線を避け、雨で崩れた踏み跡を土の斑へなじませる。
        float toneTrail = 0.8 + macro * 0.6 + sin(wuv.x * 0.53 + wuv.y * 0.19) * 0.24;
        float toneRut = (1.0 - smoothstep(0.08, 0.65, abs(toneRoad - toneTrail))) * toneLane;
        toneRut *= smoothstep(0.38, 0.62, macro2) * (0.4 + edge * 0.6);
        col = mix(col, mud * vec3(0.65, 0.61, 0.53), toneRut * 0.22);
        col *= 1.0 - toneRut * 0.08;
        // 二枚の小田の湿った土と畦。地面の一回の描画に含め、面を重ねない。
        vec2 toneLocal = vec2(wuv.x * ${CS.toFixed(7)} - wuv.y * ${SN.toFixed(7)},
          wuv.x * ${SN.toFixed(7)} + wuv.y * ${CS.toFixed(7)});
        vec2 toneFieldA = abs(toneLocal - vec2(-10.0, 123.0)) - vec2(1.9, 3.0);
        vec2 toneFieldB = abs(toneLocal - vec2(-14.0, 108.0)) - vec2(1.9, 3.0);
        float toneFieldEdge = min(max(toneFieldA.x, toneFieldA.y), max(toneFieldB.x, toneFieldB.y));
        float toneField = (1.0 - smoothstep(-0.1, 0.15, toneFieldEdge)) * (1.0 - smoothstep(0.25, 0.4, steep));
        col = mix(col, mud * vec3(0.79, 0.8, 0.64), toneField * 0.65);
        float toneBank = (1.0 - smoothstep(0.05, 0.35, abs(toneFieldEdge - 0.25))) * (1.0 - steep);
        col = mix(col, dirt * vec3(0.75, 0.78, 0.58), toneBank * 0.65);
        // 夜の裸の山腹だけを湿った土色へ寄せる。街道と昼の城下の明るさは保つ。
        col *= mix(vec3(1.0), vec3(0.52, 0.55, 0.48), steep * uNight * 0.7);
        diffuseColor.rgb *= col;`);
      // 強い雨の街道：踏み固めた中央に水の膜が張り、篝火と空を鈍く映す（土の斑の所はざらつきを残す）
      sh.fragmentShader = sh.fragmentShader.replace('roughnessFactor = mix(roughnessFactor, 0.26, pool);', `roughnessFactor = mix(roughnessFactor, 0.26, pool);
          roughnessFactor = mix(roughnessFactor, 0.16, toneLane * (1.0 - steep) * smoothstep(0.2, 0.7, uWet) * (0.6 + 0.4 * smoothstep(0.35, 0.7, macro2)));`);
      // 夜は映す空が暗いので、浅い角度で見る濡れた道の面に空の照りを足す（遠くへ続く道が白く光って見える）
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float toneFr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
          totalEmissiveRadiance += uSoilSky * toneFr * toneLane * (1.0 - steep) * smoothstep(0.2, 0.7, uWet) * smoothstep(0.42, 0.72, macro2) * 0.2;
        }`);
    };
    groundMat.needsUpdate = true;
    // 峠全体に等間隔の篝火を並べず、里の小屋脇の灯だけを補う。
    // 追撃路の見通しは既存の夜の補光で保つ。灯の位置は史料にない復元。
    {
      const p = at(-24, 70);
      W.scene.add(kagaribi(W, p.x, p.z));
      W.addFire(p.x, p.z, { h: 1.35, size: 1.1, nightOnly: true });
    }
    // 雲のある夜の補光は控え、近い兵の輪郭は既存の補光で保つ。
    const lookOf = W.lookOf;
    W.lookOf = function (key) {
      const look = lookOf.call(this, key);
      if (key === 'night') {
        look.cover = 0.72; // 弱い雨の夜は雲を厚くし、晴天の星空を避ける。
        look.sunI = Math.max(look.sunI, 0.36);
        look.hemiI = Math.max(look.hemiI, 0.55);
        look.hemiSky.setHex(0x8999ad); look.hemiGround.setHex(0x514c41);
      }
      return look;
    };
    W.setTime('night');
    // 雨の夜は星を隠し、近い房は高さと向きをばらす。設営時だけ整える。
    if (W.stars) W.stars.material.opacity = 0;
    for (let i = 0; i < (W.nearOff?.length || 0); i++) {
      const off = W.nearOff[i];
      off[2] = 0.28 + ((i * 37) % 101) / 100 * 1.55;
      off[3] = i * 2.39996;
    }
    const grassAt = W.grassAt;
    W.grassAt = function (x, z) {
      const d = Math.min(distToPolyline(x, z, ROAD), chaseNear(x, z));
      if (d < 5) return 0;
      const patch = 0.5 + 0.5 * Math.sin(x * 0.31 + Math.cos(z * 0.23)) * Math.cos(z * 0.27);
      const slope = this.slopeTan(x, z);
      return grassAt.call(this, x, z) * sstep(0.28, 0.72, patch) * (1 - sstep(0.55, 1.0, slope));
    };
    W.nearCell = null;
    // 肩越しの本人の槍は、三節の別描画を重ねず、つながった一つの形で見せる。
    // 手元の構え・突き・柄の送りと、元の長さ・穂先・当たりは保つ。
    // 既存の共有形へ戻すだけで、新しい形や材質を毎コマ作らない。
    const poseSpear = rt.army.poseSpear;
    rt.army.poseSpear = function (u, dt, engaged) {
      poseSpear.call(this, u, dt, engaged);
      if (!u.isPlayer) return;
      const w = u.wpn, f = w?.userData.flex;
      if (!f || w.userData.standard) return;
      w.geometry = f.G.full;
      f.a.visible = false;
      f.on = false; f.ang = 0; f.vel = 0;
    };
    // 落とした槍は坂に沿って寝かせる。穂先と石突を地面の高さへ合わせる。
    const dropWeapon = rt.army.dropWeapon;
    // 大旗の下端は雨で重く折れ重なる。落ちた時だけ作り、同じ布は形を共用する。
    const fallenCloths = new Map();
    // 坂ごとに違う接地だけは旗ごとに持つ。同じ旗が再び倒れた時も形を再利用する。
    const groundedCloths = new Map(), clothPoint = new THREE.Vector3(), clothInverse = new THREE.Matrix4();
    const groundCloth = (cloth) => {
      // 土へ落ちた布には、宙の布用に足した風の揺れを掛けない。
      cloth.material = wetSources.get(cloth.material) || cloth.material;
      const source = cloth.geometry;
      let geo = groundedCloths.get(cloth);
      if (!geo) { geo = source.clone(); groundedCloths.set(cloth, geo); }
      else geo.copy(source);
      cloth.updateWorldMatrix(true, false);
      clothInverse.copy(cloth.matrixWorld).invert();
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        clothPoint.fromBufferAttribute(p, i).applyMatrix4(cloth.matrixWorld);
        clothPoint.y = drawGroundAt(W, clothPoint.x, clothPoint.z) + 0.025
          + Math.abs(Math.sin(p.getX(i) * 24 + p.getY(i) * 13)) * 0.018;
        clothPoint.applyMatrix4(clothInverse);
        p.setXYZ(i, clothPoint.x, clothPoint.y, clothPoint.z);
      }
      p.needsUpdate = true;
      geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
      cloth.geometry = geo;
    };
    // この戦の大旗だけ、雨で重い裾に折れを残す。横木と竿際は動かさない。
    // 設営時に形を作り、同じ大きさの布で使い回す。共通の旗の形は変えない。
    const wetCloths = new Map(), wetFlagMats = new Map(), wetMaterials = new WeakSet(), wetSources = new WeakMap();
    const creaseFlag = (cloth) => {
      if (!cloth) return;
      const source = cloth.geometry;
      let folded = wetCloths.get(source);
      if (!folded) {
        folded = source.clone();
        const p = folded.attributes.position, uv = folded.attributes.uv;
        folded.computeBoundingBox();
        const width = folded.boundingBox.max.x - folded.boundingBox.min.x;
        for (let i = 0; i < p.count; i++) {
          const free = uv.getX(i), loose = 1 - uv.getY(i), k = free * loose;
          // 裾だけを曲げると上半分が板に見える。横木のすぐ下から縦の折れを通す。
          // 竿際と上端は留めたまま、雨で重い布の折れを共有形に刻む。
          const pleat = free * sstep(0, 0.2, loose);
          p.setXYZ(i, p.getX(i) - width * 0.22 * k * k,
            p.getY(i) - width * 0.06 * k,
            p.getZ(i) + width * 0.38 * Math.sin(free * Math.PI * 4 + loose * 1.4) * pleat);
        }
        folded.computeVertexNormals(); folded.computeBoundingBox(); folded.computeBoundingSphere();
        wetCloths.set(source, folded);
      }
      cloth.geometry = folded;
      // 共通の波の法線で折り形の法線を上書きしない。この戦の材質だけ写して共用する。
      const base = cloth.material;
      // 拾い直した旗は既にこの戦の材質。写しを重ねて揺れを二重にしない。
      if (wetMaterials.has(base)) return;
      let material = wetFlagMats.get(base);
      if (!material) {
        material = base.clone();
        material.onBeforeCompile = (shader, renderer) => {
          base.onBeforeCompile(shader, renderer);
          // 隊旗の共通材質には布の揺れがない。刀根坂の写しだけに風を通す。
          // 横木と竿側は留め、裾と外縁だけを動かす。毎コマ形を作り直さない。
          shader.uniforms.toneClothTime = { get value() { return SETTINGS.reduceMotion ? 0 : WIND_STATE.t; } };
          shader.uniforms.toneClothGust = { get value() { return SETTINGS.reduceMotion ? 0 : GUST.value; } };
          shader.vertexShader = 'uniform float toneClothTime, toneClothGust;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
            float toneLoose = uv.x * (1.0 - uv.y);
            float toneWave = toneClothTime * 2.4 + position.y * 3.1 + uv.x * 4.0;
            transformed.z += sin(toneWave) * toneLoose * 0.07 * toneClothGust;
            transformed.x -= (0.5 + 0.5 * sin(toneWave)) * toneLoose * 0.025 * toneClothGust;`);
          shader.vertexShader = shader.vertexShader.replace(
            'objectNormal = normalize(vec3(-dzdx, -dzdy, 1.0));',
            'objectNormal = normalize(objectNormal + vec3(-dzdx, -dzdy, 0.0));');
        };
        material.customProgramCacheKey = () => base.customProgramCacheKey() + '刀根坂の折り布';
        wetFlagMats.set(base, material);
        wetMaterials.add(material);
        wetSources.set(material, base);
      }
      cloth.material = material;
    };
    rt.army.dropWeapon = function (u) {
      const w = u.wpn, standard = !!w?.userData.standard;
      const spear = (u.wpnKind || u.lookWeapon) === 'spear' && !standard;
      dropWeapon.call(this, u);
      if ((!spear && !standard) || !w || u.dropped !== w || w.parent !== this.scene || w.userData.toneGround) return;
      w.userData.toneGround = true;
      if (standard && u.standardFlag) {
        const cloth = u.standardFlag, source = cloth.geometry;
        let folded = fallenCloths.get(source);
        if (!folded) {
          folded = source.clone();
          const p = folded.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i);
            const loose = Math.max(0, Math.min(1, (0.36 - y) / 0.64));
            const free = Math.max(0, Math.min(1, x / 0.36));
            // 横木と竿側の留めは残し、自由な下端ほど幅をすぼめてたたむ。
            p.setXYZ(i, x * (1 - loose * 0.55), y + loose * loose * free * 0.22,
              -0.012 - Math.abs(Math.sin(loose * Math.PI * 4 + x * 24)) * loose * free * 0.018);
          }
          folded.computeVertexNormals(); folded.computeBoundingBox(); folded.computeBoundingSphere();
          fallenCloths.set(source, folded);
        }
        cloth.geometry = folded;
      }
      // 共通側で決めた、体と隊列に沿う倒れ方を保つ。全員を北西へ回し直さない。
      const a = w.rotation.y;
      const tip = w.userData.tip ?? 2.2, butt = w.userData.butt ?? -1.2, L = tip - butt;
      const dx = Math.sin(a), dz = Math.cos(a), x = w.position.x, z = w.position.z;
      const y0 = drawGroundAt(W, x + dx * butt, z + dz * butt), y1 = drawGroundAt(W, x + dx * tip, z + dz * tip);
      const slope = Math.max(-0.35, Math.min(0.35, Math.atan2(y1 - y0, L)));
      // 幟の柄は縦の形。共通の皺の形を使い、石突と竿先を同じ坂へ接地する。
      w.rotation.set(standard ? Math.PI / 2 - slope : -slope, a, 0, 'YXZ');
      w.position.y = Math.max(y0 - Math.sin(slope) * butt, y1 - Math.sin(slope) * tip) + 0.06;
      if (standard && u.standardFlag) groundCloth(u.standardFlag);
    };
    const clearMountains = toneMountains(W);
    const clearRoadside = toneRoadside(W);
    // 共通の勝ち名乗りは名のある敵将の討取りだけ。肉声と字幕を共に三十秒あける。
    const onKill = rt.onKill, say = rt.say, bark = rt.bark;
    const voiceTimes = new Map();
    const allowVoice = (line) => {
      const last = voiceTimes.get(line);
      if (last != null && rt.t - last < 120) return false;
      voiceTimes.set(line, rt.t); return true;
    };
    rt.bark = function (line, ...args) {
      // 横持ちの警告札で「下がれ」の末尾だけが次の行に落ちない長さにする。
      if (line === '囲まれた！　味方のいる所まで下がれ') {
        line = '囲まれた！　味方の列へ下がれ';
        F.regroupUntil = rt.t + 8;
      }
      if (line === '敵が脇へ回るぞ！　退き口を見ておけ！' ||
          line === '横へ回られるぞ！　囲まれる前に動け！' ||
          line === '左右へ回られた！　退き口を空けよ！' ||
          line === '脇へ回る敵がおる！　背を取られるな！') line = '敵が横へ回る！　味方の列で構えよ';
      if (allowVoice(line)) return bark.call(this, line, ...args);
    };
    rt.onKill = function (victim, killer) {
      const chief = victim.team !== this.player.u.team && !victim.civ && !victim.isStruct &&
        (victim.isTaisho || victim.type === 'busho' && victim.name);
      if (killer && (!chief || this.t < (F.victoryVoiceAt || 0))) killer.killCryT = this.t;
      else if (killer?.alive && (killer.killCryT ?? -99) + 8 <= this.t) F.victoryVoiceAt = this.t + 30;
      const down = victim.team === this.player.u.team && !victim.civ && !victim.isStruct;
      const previous = F.allyDownNow; F.allyDownNow = down;
      try {
        // 倒れた体に槍を握らせたまま回さず、倒れる時から地面へ置く。
        if ((victim.wpnKind || victim.lookWeapon) === 'spear' && !victim.isPlayer) this.army.dropWeapon(victim);
        return onKill.call(this, victim, killer);
      } finally { F.allyDownNow = previous; }
    };
    rt.say = function (who, line, seconds) {
      if (who === '柴田勝家' && line.includes('嘆くのは後じゃ') && !F.allyDownNow) return;
      if (allowVoice(line)) return say.call(this, who, line, seconds);
    };
    // 足軽・信長とも、最初の打ち込みを受ける前に構えを教える。
    // 急ぎの字幕にして、下知の待ち列で案内が遅れないようにする。
    const windup = rt.army.hooks.onWindup;
    rt.army.hooks.onWindup = (enemy, target) => {
      windup?.(enemy, target);
      if (rt.over || !target.isPlayer || !target.alive || enemy.team === target.team || enemy.atk?.ranged || enemy.atk?.bow) return;
      F.guardEnemy = enemy; F.guardEnemyUntil = rt.t + 4;
      if (F.guardTip || rt.player.guard) return;
      F.guardTip = true;
      rt.hud.say('', isTouch ? '敵が打ってくる！　敵へ向いて「構える」を押す' : '敵が打ってくる！　敵へ向いて右押しで構える', 4, true);
    };
    // 構えと狙いの名札は一つにまとめ、道の印とは既存の重なり避けで離す。
    const style = F.labelStyle = document.createElement('style');
    // 本文を指で送れ、出陣の釦は常に札の下へ残す。ほかの戦の札には触れない。
    style.textContent = '#hud[data-tonezaka] #boss,#hud[data-tonezaka] #target{top:24%;left:50%;right:auto;bottom:auto;transform:translateX(-50%);max-width:42vw;box-sizing:border-box;background:#14120f;color:#ece4d2;border:2px solid #c2a25a;padding:4px 8px;font-size:15px;line-height:1.4}#hud[data-tonezaka]:has(#target:not([hidden])) #boss{display:none}#hud[data-tonezaka] #markers .mk b{background:#14120f;color:#ece4d2;border:1px solid #c2a25a;padding:4px 8px}';
    // 人物紹介を開く所も指で押せる広さにする。本文だけを送り、出陣の釦を残す。
    style.textContent += `
      html body #hud[data-tonezaka] #intro .intro-people summary{
        box-sizing:border-box;min-height:44px;padding:10px 8px;margin-top:8px;
        color:#f2cd72;font-size:max(15px,calc(15px * var(--text-scale,1)));line-height:1.6;
        text-decoration:underline;cursor:pointer;
      }
      html body #hud[data-tonezaka] #intro .intro-people summary:focus-visible{
        outline:3px solid #c2a25a;outline-offset:-3px;box-shadow:0 0 0 2px #14120f;
      }
      @media(min-height:501px){
        html body #hud[data-tonezaka] #intro:has(#intro-go)>.card.card{height:auto;min-height:0}
        html body #hud[data-tonezaka] #intro .intro-reading{flex:0 1 auto;min-height:0;overflow-y:auto}
      }
    `;
    // 後から手ほどきの見た目が入っても、任務と同じ欄で縦に積む。
    style.textContent += '#hud[data-tonezaka] #battle-notices > :is(#objectives,#tutorial){position:relative !important;inset:auto !important;transform:none !important;width:100% !important;min-width:0 !important;max-width:100% !important;flex:0 0 auto;box-sizing:border-box;white-space:normal;overflow-wrap:anywhere}#hud[data-tonezaka] #battle-notices #objectives .battle-action{white-space:normal;overflow-wrap:anywhere}';
    // 開始直後の指の絵にも、押すだけでなくなぞる操作だと明記する。
    style.textContent += '#hud[data-tonezaka] #battle-opening .opening-move b{font-size:0}#hud[data-tonezaka] #battle-opening .opening-move b::after{content:"上へなぞって進む";font-size:max(16px,calc(16px * var(--text-scale,1)))}';
    // 道案内中の共通指定は任務を画面上端へ浮かせる。刀根坂では欄の中へ戻して重なりを防ぐ。
    style.textContent += 'html body #hud[data-tonezaka] #battle-notices:not(.choosing) #objectives.ground-order:not(.expand){position:relative !important;inset:auto !important;width:100% !important;max-width:100% !important}html body #hud[data-tonezaka] #battle-notices #objectives.travel-retreat.ground-order:not(.expand) li.cur .obj-now{white-space:normal !important;overflow-wrap:anywhere !important;word-break:normal !important;font-size:max(16px,calc(16px * var(--text-scale,1))) !important}';
    // 共通の二列組や縮まない本文を持ち越さず、下知を札の横幅いっぱいで読む。
    style.textContent += `
      html body #hud[data-tonezaka] #battle-notices #objectives:not(.expand) li.cur{
        display:block !important;grid-template-columns:minmax(0,1fr);width:100%;box-sizing:border-box;
      }
      html body #hud[data-tonezaka] #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now){
        display:block;width:auto !important;min-width:0 !important;max-width:100% !important;
        flex:1 1 auto !important;white-space:normal !important;overflow-wrap:anywhere !important;
        word-break:normal !important;overflow:visible !important;
        font-size:max(16px,calc(16px * var(--text-scale,1))) !important;line-height:1.4 !important;
      }
    `;
    style.textContent += '#hud[data-tonezaka] #intro:has(#intro-go) > .card{display:flex;flex-direction:column;gap:8px;padding:16px 24px}#hud[data-tonezaka] #intro .intro-reading{width:100%;min-height:0;flex:1 1 auto;overflow-y:auto;touch-action:pan-y;pointer-events:auto;overscroll-behavior:contain;scroll-padding-bottom:16px}#hud[data-tonezaka] #intro .intro-reading > *{flex-shrink:0}#hud[data-tonezaka] #intro-go{flex:none}';
    // 合図の詳説は任務を開いて読む。退避中に古い進撃の合図を並べない。
    style.textContent += 'html body #hud[data-tonezaka] #battle-notices #objectives:not(.expand) #obj-list li.cur .obj-cue{display:none !important}';
    // パソコンでも道案内の補足を小字にしない。距離と下知を同じ欄で折り返す。
    style.textContent += `
      html body #hud[data-tonezaka] #battle-notices #objectives:not(.expand) li.cur small.goal-place{
        display:block !important;font-size:max(15px,calc(15px * var(--text-scale,1))) !important;
        line-height:1.5 !important;white-space:normal !important;overflow-wrap:anywhere !important;
      }
    `;
    // 本文欄の高さを先に確保する。高さ自動の札と伸縮するスクロール欄の組合せは本文をつぶす。
    // 折り畳んだ人物紹介の下に大きな空白を残さない。任務は軍の帯の下、地図の左へ収める。
    style.textContent += '@media(min-height:501px){html body #hud[data-tonezaka] #intro:has(#intro-go)>.card.card{width:min(560px,calc(100vw - 32px));height:min(520px,calc(100dvh - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)));max-height:calc(100dvh - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)) !important}}@media(min-width:901px) and (min-height:501px){html body #hud[data-tonezaka] #battle-notices:not(.choosing),html body #hud[data-tonezaka] #battle-notices:not(.choosing):not(:has(#objectives.expand)){left:auto !important;right:calc(210px + env(safe-area-inset-right,0px)) !important;top:calc(104px + env(safe-area-inset-top,0px)) !important;width:min(320px,28vw) !important;max-height:calc(100% - 208px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)) !important}}';
    // 共通の一本案内より優先する。向きは戦場の矢印だけで示す。
    style.textContent += `
      /* 共通の道案内は二重の識別子で画面中央へ固定される。同じ強さで任務欄へ戻す。 */
      html:root body #hud[data-tonezaka].single-guide #battle-notices:not(.choosing) #objectives#objectives.route-summary:not(.expand){
        position:relative !important;inset:auto !important;transform:none !important;
        width:100% !important;min-width:0 !important;max-width:100% !important;
      }
      html:root body #hud[data-tonezaka].single-guide #battle-notices #objectives#objectives.route-summary:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now){
        font-size:max(16px,calc(16px * var(--text-scale,1))) !important;line-height:1.4 !important;
        white-space:normal !important;overflow-wrap:anywhere !important;
      }
      html body #hud[data-tonezaka].single-guide #battle-notices #objectives.route-order:not(.expand) #obj-list li.cur .obj-now::before{display:none !important}
      html body #hud[data-tonezaka].single-guide #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-now{
        font-size:max(16px,calc(16px * var(--text-scale,1))) !important;line-height:1.4 !important;text-wrap:pretty;
      }
      html body #hud[data-tonezaka].single-guide #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small.goal-place{
        font-size:max(15px,calc(15px * var(--text-scale,1))) !important;line-height:1.4 !important;
      }
      @media(max-height:500px){
        html body #hud[data-tonezaka].single-guide #battle-notices:not(.choosing):not(:has(#objectives.expand)){
          left:calc(16px + env(safe-area-inset-left,0px)) !important;top:calc(52px + env(safe-area-inset-top,0px)) !important;
          width:min(280px,32vw) !important;max-height:33vh !important;
        }
      }
    `;
    // 横持ちで任務と二行の知らせを最後まで収める。欄は戦場の三分の一以内に保つ。
    style.textContent += `@media(max-height:500px){
      html body #hud[data-tonezaka] #intro:has(#intro-go)>.card.card{
        width:min(620px,calc(100vw - 32px));
        height:calc(100dvh - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));
        max-height:calc(100dvh - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)) !important;
      }
      html body #hud[data-tonezaka] #intro:has(#intro-go)>.card::after{
        content:'人物の説明は、上の「人物と砦の説明を読む」を押す';
        order:1;flex:none;font-size:max(13px,calc(13px * var(--text-scale,1)));line-height:1.4;color:#ece4d2;
      }
      html body #hud[data-tonezaka] #intro-go{order:2}
      html body #hud[data-tonezaka] #intro .intro-person{grid-template-columns:auto minmax(0,1fr);gap:8px;text-align:left;padding:4px 8px}
      html body #hud[data-tonezaka] #intro .intro-person b{font-size:max(16px,calc(16px * var(--text-scale,1)));line-height:1.5}
      html body #hud[data-tonezaka] #battle-notices:not(.choosing){
        left:calc(16px + env(safe-area-inset-left,0px)) !important;right:auto !important;
        top:calc(52px + env(safe-area-inset-top,0px)) !important;bottom:auto !important;
        transform:none !important;width:min(280px,32vw) !important;
        max-height:min(33vh,calc(100% - 180px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))) !important;gap:4px !important;
      }
      html body #hud[data-tonezaka] #battle-notices #objectives:not(.expand) :is(.battle-action,li.cur,.obj-now){
        font-size:max(16px,calc(16px * var(--text-scale,1))) !important;line-height:1.4 !important;
      }
      html body #hud[data-tonezaka] #battle-notices #objectives:not(.expand) li.cur small.goal-place{
        font-size:max(15px,calc(15px * var(--text-scale,1))) !important;line-height:1.4 !important;
      }
      html body #hud[data-tonezaka] #battle-notices #objectives:not(.expand) li.cur .obj-cue,
      html body #hud[data-tonezaka] #battle-notices #objectives.has-action:not(.expand) li.cur .obj-text{display:none !important}
      html body #hud[data-tonezaka] #battle-notices #objectives.has-action:not(.expand) li.cur::before{content:none !important}
      html body #hud[data-tonezaka] #battle-notices:not(.choosing) #objectives.keep-combat-task.has-action:not(.expand) #obj-list{display:block !important;margin-top:4px}
      html body #hud[data-tonezaka] #battle-notices #objectives.keep-combat-task.has-action:not(.expand) li.cur > small:not(.goal-place):not(.obj-cue){display:block !important;font-size:max(15px,calc(15px * var(--text-scale,1))) !important;line-height:1.4 !important;white-space:normal !important}
      html body #hud[data-tonezaka] #battle-notices:not(.choosing) #objectives.has-action:not(.expand) li.cur small.goal-place{display:block !important;margin-top:4px}
      html body #hud[data-tonezaka] #battle-notices #battle-message{gap:4px !important}
      html body #hud[data-tonezaka] #battle-notices #battle-message > :is(#subtitle,.battle-notice){padding:4px 8px !important;line-height:1.45 !important}
    }`;
    // 退く札も左上の欄へ戻す。地面の輪を追う配置で主人公と敵の槍を覆わない。
    style.textContent += `@media(max-height:500px){
      html body #hud[data-tonezaka].single-guide #battle-notices:not(.choosing) #objectives.travel-retreat.ground-order.destination-sign:not(.expand){
        position:relative !important;inset:auto !important;transform:none !important;
        width:100% !important;max-width:100% !important;
      }
      html body #hud[data-tonezaka].single-guide #battle-notices:not(.choosing) #objectives.travel-retreat.ground-order.destination-sign:not(.expand) #obj-list li.cur .obj-now{
        font-size:max(16px,calc(16px * var(--text-scale,1))) !important;line-height:1.4 !important;
        text-wrap:pretty;
      }
    }`;
    // けがの長い文が格子の最小幅を押し広げ、帯と残量を下地からはみ出させない。
    style.textContent += `
      html body #hud[data-tonezaka] .bl #h-hp.hp{
        grid-template-columns:minmax(0,1fr) max-content !important;max-width:calc(100vw - 32px);
      }
      html body #hud[data-tonezaka] .bl #h-hp.hp > :is(i,em){min-width:0;max-width:100%;box-sizing:border-box}
      html body #hud[data-tonezaka] .bl #h-hp.hp em{
        overflow-wrap:anywhere;word-break:normal;white-space:normal;
        font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
      }
      html body #hud[data-tonezaka] .bl #h-hp.hp em svg{width:18px;height:20px}
      html body #hud[data-tonezaka] .bl #h-hp.hp:has(em:not([hidden])){
        width:max(192px,calc(176px * var(--text-scale,1) + 24px)) !important;
      }
      html.touch body #hud[data-tonezaka] #wait-guard{
        grid-template-columns:32px minmax(0,1fr) 24px;column-gap:4px;
        width:max(264px,calc(198px * var(--text-scale,1) + 80px));
      }
      html.touch body #hud[data-tonezaka] #wait-guard svg:first-child{width:32px}
      html.touch body #hud[data-tonezaka] #wait-guard svg + svg{width:24px}
      html.touch body #hud[data-tonezaka] #wait-guard :is(span,small){
        min-width:0;font-size:max(16px,calc(16px * var(--text-scale,1)));line-height:1.4;
        overflow-wrap:anywhere;text-wrap:pretty;
      }
    `;
    // 横持ちだけ端へ固定する。左利きの配置では命の札より上へ離す。
    style.textContent += `@media(max-height:500px){
      html.touch body #hud[data-tonezaka] #wait-guard{
        left:auto !important;right:calc(16px + env(safe-area-inset-right,0px)) !important;
        top:auto !important;bottom:calc(16px + env(safe-area-inset-bottom,0px));
        width:min(240px,calc(100vw - 32px));min-height:64px;padding:6px;
        grid-template-columns:24px minmax(0,1fr);column-gap:8px;row-gap:2px;
        border-width:2px;border-radius:8px;
      }
      html.touch body #hud[data-tonezaka] #wait-guard svg:first-child{width:24px;height:36px}
      html.touch body #hud[data-tonezaka] #wait-guard svg + svg{display:none}
      html.touch.tc-sw body #hud[data-tonezaka] #wait-guard{
        left:calc(16px + env(safe-area-inset-left,0px)) !important;right:auto !important;
        bottom:calc(128px + env(safe-area-inset-bottom,0px));
      }
    }`;
    document.head.append(style); rt.hud.root.dataset.tonezaka = '';
    const dispose = W.dispose.bind(W);
    W.dispose = () => { F.restoreNobuLabel?.(); style.remove(); delete rt.hud.root.dataset.tonezaka; for (const g of groundedCloths.values()) g.dispose(); groundedCloths.clear(); for (const g of fallenCloths.values()) g.dispose(); fallenCloths.clear(); for (const g of wetCloths.values()) g.dispose(); wetCloths.clear(); for (const m of wetFlagMats.values()) m.dispose(); wetFlagMats.clear(); clearRoadside(); clearMountains(); dispose(); };
    // 手前の太い雨筋を夜でも見える濃さに（共通の上限 0.22 はこの戦だけ上げる。形と数は同じ）。
    const nearRain = W.updateNearRain;
    W.updateNearRain = function (dt, r, wdx, wdz) { nearRain.call(this, dt, r, wdx, wdz); if (this.rainNear.visible) this.rainNear.material.uniforms.op.value = Math.min(0.34, r * 0.45); };
    W.setRainTarget(0.8); W.rainLevel = 0.8; // 強い雨の夜（kaito 52番）。始めから手前の太い雨筋が見え、街道が濡れて光る。
    // 小さくした跳ねも一画素の白点は残る。この戦の雨だけ、濡れた土へなじませる。
    W.splashPts.material.opacity = 0.18;
    F.step = 0; F.ek = 0; F.ak = 0; F.poll = 0; F.pollAt = rt.t; F.briefAt = rt.t;
    F.roadGuide = { x: FIRST_END.x, z: FIRST_END.z };
    F.enemyRoadPoint = { x: FIRST_END.x, z: FIRST_END.z };
    F.shelter = { x: 0, y: 0, z: 0, scanAt: 0, valid: false, ally: null, point: { x: 0, y: 0, z: 0 } };
    F.chaseWait = { t: 0, step: 0, enemies: 0, joined: false, umaX: 0, umaZ: 0, lateX: 0, lateZ: 0, umaStopped: false, lateStopped: false, rearX: 0, rearZ: 0 };
    const chief = (name, survives = false, horse = false) => ({ type: 'busho', n: 1, o: { name, horse, invuln: survives } });
    // 本の足軽の図と着装写真：黒漆の胴、赤茶の陣笠、紺の小袖。味方を青く見せない決まり（10/28）で小袖は濃い褐（柿渋の焦げ茶）に。既存の形と材質を使う。
    const A = (n) => ({ type: 'ashigaru', n, o: { armor: 0x25211c, hat: 'jingasa', hatColor: 0x61332b, lace: 0x9c927b, cloth: 0x3b3127, doStyle: 'okegawa', sode: false } });
    const S = (n) => ({ type: 'samurai', n });
    const foe = (name, at, list, width = 5) => enemyGroup(rt, {
      fixed: true, noAI: true, faction: 'asakura', name, anchor: at, facing: TURN,
      order: 'hold', formation: 'yari', yariRanks: toneYariRanks(list.reduce((n, part) => n + part.n, 0)), width, aggro: 8, morale: 78, guardOn: true,
      fleeDir: { ...NORTHWEST },
    }, dress(list, ASA));
    // 峠道はこの辺りで西へ曲がる。列の中心を道へ置き、山腹から斜めに合流させない。
    F.uma = allyGroup(rt, { fixed: true, fullStrength: true, noAI: true, name: '信長の馬廻', anchor: at(roadX(66), 66), facing: Math.PI + TURN,
      colW: 2, width: 5, formation: 'column', aggro: 8, guardOn: true, noRout: true },
      dress(rt.G.lord ? [S(4), S(4), A(16)] : [A(8), S(4), chief('織田信長', true, true), S(4), A(8)], ODA));
    F.nobuU = rt.G.lord ? rt.player.u : F.uma.units.find((u) => u.name === '織田信長');
    // この戦の信長の名札だけ、固定の高さでなく揺れる兜のすぐ上へ寄せる。
    if (!rt.G.lord && F.nobuU.head) {
      const head = F.nobuU.head, project = rt.hud.project, headAt = new THREE.Vector3();
      head.geometry.computeBoundingBox();
      const headTop = head.geometry.boundingBox.max.y + 0.12;
      const nobuProject = function (p, y, battle) {
        if (p === F.nobuU.pos && y === p.y + (F.nobuU.mounted ? 3.3 : 2.35)) {
          headAt.set(0, headTop, 0); head.localToWorld(headAt);
          return project.call(this, headAt, headAt.y, battle);
        }
        return project.call(this, p, y, battle);
      };
      rt.hud.project = nobuProject;
      F.restoreNobuLabel = () => { if (rt.hud.project === nobuProject) rt.hud.project = project; };
    }
    F.uma.leader = rt.G.lord ? F.uma.units[0] : F.nobuU;
    if (!rt.G.lord) F.nobuU.allyOk = true;
    F.late = allyGroup(rt, { fixed: true, fullStrength: true, noAI: true, name: '柴田勝家の手', anchor: at(roadX(90), 90), facing: Math.PI + TURN,
      colW: 2, width: 5, formation: 'column', aggro: 8, guardOn: true, noRout: true },
      dress([S(3), chief('柴田勝家', true, true), S(3), A(14)], ODA));
    F.late.leader = F.late.units.find((u) => u.type === 'busho'); F.late.leader.allyOk = true;
    F.oda = [F.uma, F.late];
    // 前へ出る実兵の後ろを軽い後続でつなぐ。戦力・当たり・任務の数には入れない。
    // 道幅と曲がりに沿わせ、城下への暗転後は夜の後続を残さない。
    F.pressureBacks = F.oda.map((g, i) => {
      const z0 = along(g.anchor.x, g.anchor.z) + 18, start = at(roadX(z0), z0);
      const b = W.addDistantArmy({ x: start.x, z: start.z, facing: Math.PI + TURN,
        w: 5, d: 16, count: 42, kind: 'spear', flag: 'oda', armor: 0x2a2622,
        host: false, seed: 15738 + i * 97 });
      b.army.noWake = true; b.army.team = 0;
      const p = { x: start.x, z: start.z, facing: Math.PI + TURN };
      let scanAt = 0;
      b.follow(() => {
        b.visible = F.step < 4 && !g.routed && g.count > 0;
        if (!b.visible) return null;
        if (rt.t >= scanAt) {
          scanAt = rt.t + 0.5;
          let rear = -Infinity;
          for (const u of g.units) if (fighter(u) && !u.mounted) rear = Math.max(rear, along(u.pos.x, u.pos.z));
          if (Number.isFinite(rear)) {
            const z = rear + 12, x = roadX(z);
            p.x = x * CS + z * SN; p.z = z * CS - x * SN;
          }
        }
        return p;
      }, { gap: 0 });
      return b;
    });
    const n = Math.min(30, RANKS[rt.G.rank || 0].squad || 0);
    if (n) rt.makeSquad(at(roadX(98) + 3, 98), Math.PI + TURN, [{ kind: 'spear', n }]);
    // 供は馬廻の後ろから出る。傷は通すが、疲れた殿の一突きで組が溶けないようにする。
    for (const g of rt.squadGroups) g.defMult = 1.25;
    // 全ての戦う兵を初めに置く。武将は槍の前列より後ろで供に守られる。
    F.r1 = foe('河合吉統の殿', at(-6, 40), [A(23), S(3), chief('河合吉統'), S(3)]);
    F.r1b = foe('朝倉の殿の二の手', at(-4, 8), [A(6), S(2)]);
    F.r2 = foe('山崎吉家の手', at(4, -74), [A(23), S(3), chief('山崎吉家'), S(3)]);
    F.r3 = enemyGroup(rt, { fixed: true, noAI: true, faction: 'saito', name: '斎藤龍興の手', anchor: at(6, -106), facing: TURN,
      order: 'hold', formation: 'yari', yariRanks: toneYariRanks(30), width: 5, aggro: 8, morale: 78, guardOn: true, fleeDir: { ...NORTHWEST } },
      dress([A(23), S(3), chief('斎藤龍興'), S(3)], { flag: 'saito' }));
    F.r4 = foe('詫美越後守の殿', at(-4, -142), [A(23), S(3), chief('詫美越後守'), S(3)]);
    F.roadG = enemyGroup(rt, { fixed: true, noAI: true, faction: 'asakura', name: '街道で向き直る朝倉勢', anchor: STREET, facing: -Math.PI / 2 + TURN,
      order: 'hold', formation: 'yari', yariRanks: 3, aggro: 8, morale: 65, fleeDir: { ...EAST } }, dress([A(6), S(2)], ASA));
    F.townG = enemyGroup(rt, { fixed: true, noAI: true, faction: 'asakura', name: '城下に残った朝倉の兵', anchor: TOWN, facing: -Math.PI / 2 + TURN,
      order: 'hold', formation: 'yari', yariRanks: 3, aggro: 8, morale: 65, fleeDir: { ...EAST } }, dress([A(6), S(2)], ASA));
    F.hurtG = foe('道脇を退く朝倉の兵', at(-8, -48), [A(4)], 2);
    for (const u of F.hurtG.units) { u.hp = Math.min(u.hp, u.maxHp * 0.25); u.dmg = 0; u.yariOpenUntil = 1e9; }
    // 荷を担いで峠へ退く朝倉の人夫（資料との差 10/28：退く軍の小者・陣夫が道に一人もいなかった）。戦わない荷運びの兵として置く。
    // 道を北へ歩き続け、追い手が三十五歩まで寄れば荷を担いだまま走って逃げる（立ち尽くさない）。人数と場所は推定。
    // 一組目は持ち場の二十歩ほど先から荷を担いで峠へ退く（始めから見える）。人数は二組目から寄せて七人に（合計九人は同じ。10/29）。
    F.porters = [[-9, 64], [-2, -96]].map(([lx, lz], i) => {
      const g = enemyGroup(rt, { fixed: true, faction: 'asakura', name: '荷を担いで退く人夫', anchor: at(lx, lz), facing: TURN + Math.PI,
        formation: 'column', colW: 2, speed: 0.95, aggro: 0, civ: true, noRout: true, arriveNoncombat: true, fleeDir: { ...NORTHWEST } },
        // 荷運びの型（porter）は骨の人に替わらず霧の手前で隠れるので、得物を持たない足軽の体に荷を背負わせる
        [{ type: 'ashigaru', n: i ? 2 : 7, o: { flag: null, weapon: 'none', kosode: 1, kosodeCol: [0x5a4a36, 0x4b4434, 0x625240][i % 3], cloth: 0x4a3e2e, hat: 'none', armor: 0x3a342a } }]);
      for (const u of g.units) {
        u.noTarget = true; u.dmg = 0; u.civ = true;
        const load = new THREE.Mesh(PORTER_LOAD(), PORTER_MAT()); u.mesh.add(load);
      }
      g.order = 'path'; g.path = LOCAL_ROAD.filter(([, z]) => z < lz - 6).map(([x, z]) => xz(x, z)); g.pathIdx = 0;
      g.fleePath = g.path.slice();
      return g;
    });
    retreat(F.hurtG);
    // 義景は峠の向こうへ退く本隊の内。静止した陣幕・床几は置かない。
    F.yoshikage = enemyGroup(rt, { fixed: true, noAI: true, faction: 'asakura', name: '朝倉義景と旗本', anchor: at(-4, -200), facing: Math.PI + TURN,
      order: 'hold', formation: 'column', colW: 2, aggro: 2, morale: 60, noRout: true, arriveNoncombat: true, fleeDir: { ...NORTHWEST } },
      dress([S(3), chief('朝倉義景', true, true), S(3), A(3)], ASA));
    F.yoshikageU = F.yoshikage.units.find((u) => u.name === '朝倉義景');
    // 峠の殿が持ちこたえる間は、供と先の曲がりで待つ。開戦直後の逃亡札を出さない。
    for (const u of F.yoshikage.units) u.noTarget = true;
    march(F.yoshikage, [xz(-4, -216)], (g) => { g.order = 'hold'; });
    F.yoshikage.speed = 0.6; F.yoshikage.aggro = 0;
    F.rears = [F.r1, F.r1b, F.r2, F.r3, F.r4];
    F.stageDefenders = { 1: [F.r1, F.r1b], 2: [F.r2, F.r3], 3: [F.r4], 5: [F.townG] };
    // 殿だけが先に向き直る。中ほどの備は疲れた二列の退き足で、接敵してから槍をそろえる。
    for (let i = 0; i < F.rears.length; i++) {
      const g = F.rears[i];
      g.morale = i < 2 ? 68 : 58; g._fleeContact = 0;
      for (const u of g.units) { u.fat = Math.max(u.fat || 0, 0.35); if (u.mounted) u.hfat = Math.max(u.hfat || 0, 0.3); }
      if (i < 2) continue;
      const z = along(g.anchor.x, g.anchor.z) - 8;
      march(g, [xz(roadX(z), z)], (q) => { q.order = 'hold'; });
      g.speed = 1.6; g.facing = Math.PI + TURN; g._retreatColumn = true;
      // 疲れた徒歩は歩幅も間隔もそろわない。接敵後は元の槍の持ち場へ戻す。
      const slot = g.slotPos;
      g.slotPos = function (i, n) {
        const p = slot.call(this, i, n);
        if (this._retreatColumn) {
          const side = this.slotJit(i, 4) * 0.45, lag = (i % 4) * 0.55;
          p.x += side * CS + lag * SN; p.z += lag * CS - side * SN;
        }
        return p;
      };
      for (let j = 0; j < g.units.length; j++) {
        const u = g.units[j];
        if (!u.mounted && !u.name) { u.fat = 0.35 + (j % 4) * 0.08; u.speed *= 0.85 + (j % 3) * 0.05; }
      }
    }
    // 退く殿の旗は既存の旗持ちに任せる。無人の大旗を街道に立て並べない。
    F.defenders = [...F.rears, F.roadG, F.townG];
    // 正面決戦の精兵ではなく、退きながら道を塞ぐ疲れた小勢。
    for (const g of F.defenders) g.dmgMult = 0.85;
    for (const g of [...F.rears, F.roadG, F.townG, F.yoshikage]) for (const u of g.units) u.duelDone = true;
    // 遠景は道幅に合わせた長い列。近い退く兵だけ、共通の人数枠の中で本物へ替える。
    const fb = (name, team, nominal, x, z, facing, more) => fieldButai(rt, {
      name, team, nominal, at: at(x, z), facing: facing + TURN, kind: 'ashigaru', faction: team ? 'asakura' : 'oda',
      armor: team ? 0x33291f : 0x2a2622, flag: team ? 'asakura' : 'oda',
      lightWidth: 5, lightDepth: 24, realMax: team ? 6 : 0, morale: team ? 60 : 85, ...more,
    });
    // 殿の後ろの逃げ足は軽い列で見せる。戦う兵への切替は止める。
    F.rearCrowds = F.rears.map((g) => {
      const z = along(g.anchor.x, g.anchor.z) - 16;
      // 軽い作りは主人公の四十四歩内では描かれず（humans_shared.js の realNear）、杉の林の中も見えない。
      // 道の上だけに、殿の背の四十五歩より奥を道幅いっぱいの厚い列で退かせる（25秒の画面で殿の奥に退く群れ。点検表 6・10/29）。
      const b = fb('殿の後ろを退く朝倉勢', 1, 110, roadX(z), z, Math.PI, { lightWidth: 9, lightDepth: 22, armor: 0x463a2c });
      b.realMax = 0; b._autoSwitch = () => {};
      // 守る殿とは分け、後ろの列は北西へ歩き続ける。曲がりを十歩ほどずつたどる。
      // 行き先の入れ物は設営時に作り、次の曲がりに着いた時だけ移動を頼む。
      b.toneRetreatZ = z;
      b.toneRetreatTo = { x: b.pos.x, z: b.pos.z };
      return b;
    });
    // 後続の将と供も初めから本物。先の馬廻へ新手として加えず、後ろの列を守る。
    F.followers = [];
    const follow = (name, nominal, x, z) => {
      const b = fb(name + 'の備', 0, nominal, x, z, Math.PI);
      const g = allyGroup(rt, { fixed: true, fullStrength: true, noAI: true, name: name + 'と供',
        anchor: at(x, z), facing: Math.PI + TURN, formation: 'column', colW: 2, width: 5, aggro: 4 },
        dress([S(2), chief(name, true, true), S(2)], ODA));
      g.leader = g.units.find((u) => u.type === 'busho'); g.leader.allyOk = true;
      adoptGroup(b, g);
      // fieldButai の固有の切替は noSwitch を読まないため、この備では明示して止める。
      b._autoSwitch = () => {};
      F.followers.push(g);
      return b;
    };
    F.bO = {
      niwa: follow('丹羽長秀', 150, 2, 186),
      hashiba: follow('羽柴秀吉', 150, 10, 214),
      takigawa: follow('滝川一益', 120, -2, 238),
      sakuma: follow('佐久間信盛', 60, 4, 260),
    };
    // 峠の向こうの旗と退く列を残す。近い義景の供は上で本物を置く。
    F.fleeB = [fb('朝倉義景の本隊', 1, 260, -4, -230, Math.PI), fb('朝倉の荷駄と後備え', 1, 200, 10, -260, Math.PI)];
    for (const b of F.fleeB) {
      b.realMax = 0; // 義景の供は既に置いてある。逃げる本隊から戦う兵を足さない。
      b.order({ id: 'retreat', to: { x: b.pos.x + NORTHWEST.x * 40, z: b.pos.z + NORTHWEST.z * 40 }, form: 'column' });
      b.light.moveTo(b.pos.x + NORTHWEST.x * 40, b.pos.z + NORTHWEST.z * 40, 500, { back: true });
    }
    // 荷駄の歩みは遅く、前が止まれば後ろも詰まる。戦う殿の進みを待たせない。
    F.baggage = F.fleeB[1]; F.baggageStopAt = rt.t + 12; F.baggageResumeAt = 0;
    F.baggageTo = { x: F.baggage.pos.x + NORTHWEST.x * 100, z: F.baggage.pos.z + NORTHWEST.z * 100 };
    F.baggage.light.moveTo(F.baggageTo.x, F.baggageTo.z, 85, { back: true });
    const loadX = F.baggage.pos.x + NORTHWEST.x * (100 * 12 / 85), loadZ = F.baggage.pos.z + NORTHWEST.z * (100 * 12 / 85);
    rt.scene.add(tawara(W, loadX + CS * 3, loadZ - SN * 3, TURN, 4));
    for (const [x, z, r] of [[-14, 30, 0.4], [16, -20, -0.3], [-10, -70, 0.2], [14, -118, 0.1]]) { const p = at(x, z); rt.scene.add(tawara(W, p.x, p.z, r + TURN, 4)); }
    const houses = makeSimpleBatch();
    { const p = at(-30, 70); hut(W, p.x, p.z, 6, 4, TURN, { wall: 0x5a4a38, groundedHome: true, batch: houses }); }
    finalizeSimpleBatch(rt, houses);
    // 25秒の時のカメラは撮るたびに向きが変わる（10/29 三回：南西・南・西。主人公は x≈-8, z≈66、カメラはその十歩ほど脇で高さ2m）。
    // 前の崩れ（z 37〜48）は南と南西の画面にしか入らず、西を向くと草の斜面と里の家だけになった。
    // 主人公の三十歩以内の四方（西の家の前・東の肩・南の道脇・北西の斜面）に、倒れた荷駄馬とこぼれた俵・脱げた笠を（点検表 2）。
    const WRECKS = [[-18, 63, 1.9], [-17, 78, -0.6], [3, 63, 0.3], [-1, 53, 2.8], [-22, 52, 0.9]];
    fallenHorses(rt, WRECKS.map(([x, z, r]) => [...xz(x, z), r]));
    for (const [x, z, r] of WRECKS) {
      // 荷鞍から外れた俵は馬の背の側へ転がり、二つ三つ重なる。
      const p = at(x + Math.cos(r) * 1.6, z - Math.sin(r) * 1.6); rt.scene.add(tawara(W, p.x, p.z, r + TURN + 0.4, 3));
      const q = at(x - Math.sin(r) * 1.9, z - Math.cos(r) * 1.9); rt.scene.add(tawara(W, q.x, q.z, r + TURN - 1.1, 1));
    }
    droppedKasa(rt, WRECKS.flatMap(([x, z, r], i) => [[x + 2.4, z + 0.8, r + i], [x - 1.2, z + 2.2, r * 2 + 1.7]]));
    // 城下の西の山際にある寺の堂。特定の寺の建物を復元したものではない。
    { const p = at(80, -102); rt.scene.add(dou(W, p.x, p.z, 8, 6, TURN)); }
    // 個々の家の復元図ではなく、城下の用途に合わせた推定の間取り。
    // 既存の位置・広さを保ち、土間のある町家と座敷のある屋敷を分ける。
    // 中は naka.js に任せ、竿縁天井・畳・柱と長押、横に滑る襖と障子を使い回す。
    for (let i = 0; i < TOWN_HOUSES.length; i++) {
      const [x, z] = TOWN_HOUSES[i], residence = i >= 2;
      goten(rt, x, z, { w: 7, d: 5, rot: TURN, team: 1, tile: false,
        earth: 0x947b55, naka: true, noTarget: true, doorX: 0, profile: 'tonezaka',
        kind: residence ? 'yashiki' : 'machiya', name: residence ? '一乗谷の屋敷' : '一乗谷の町家' });
    }
    rt.setPhase('brief');
    rt.obj('main', '馬が動いたら、信長公に続け', 'main');
    rt.say('組頭', '前の馬に乗ったお方が信長公じゃ。供の兵が動いたら続け', 5);
    rt.marker('nobu', unitPos(F.nobuU), '馬に乗った信長公', {});
    rt.marker('toneShelter', () => toneShelter(rt), '味方の後ろで息を整える所',
      { guideArea: 'retreat', guideRadius: 3, guideAlly: () => F.shelter.ally, h: 0.3 });
    F.asakuraBearer = F.yoshikage.units.find((u) => u.type === 'samurai');
    F.asakuraFlag = nobori(W, F.asakuraBearer.pos.x, F.asakuraBearer.pos.z, 'asakura', 4);
    creaseFlag(F.asakuraFlag.userData.flag);
    for (const u of rt.army.units) {
      creaseFlag(u.standardFlag);
      // 雨の指物も裾を折る。騎馬の布は背の竿と同じ座標で揺らす。
      if (u.flag) { creaseFlag(u.flag); u.flag.userData.followPole = true; }
    }
    // 備の隊旗も雨の布へそろえる。旗持ちが視点のため隠れた時は旗だけを残さない。
    // 地へ倒れた旗は共通の皺を使い、拾われたら元の雨の布へ戻す。
    const updateStandards = rt.updateStandards;
    const standardViewAhead = new THREE.Vector3();
    rt.updateStandards = function (dt) {
      updateStandards.call(this, dt);
      this.camera.getWorldDirection(standardViewAhead).multiplyScalar(18).add(this.camera.position);
      // 共通の判定は足元の位置に胸の高さを足すので、中央への線では差し引く。
      standardViewAhead.y -= 1.4;
      for (const g of this.army.groups) {
        if (!g.stds) continue;
        for (const s of g.stds) {
          const d = s.userData.std, carrier = s.userData.carrier;
          if (d.kind === 'cavalry') continue;
          if (d.down) {
            // 共通側で求めた竿先は、方角へ向けてから倒す回転に対応する。
            // 順を逆にすると竿先が別の坂へ向き、旗全体が宙に残る。
            s.rotation.set(s.rotation.x, s.rotation.y, 0, 'YXZ');
            if (d.downT >= 0.7 && !d.toneFolded) {
              this.army.foldGroundFlag(d.cloth); groundCloth(d.cloth); d.toneFolded = true;
            }
          } else {
            d.toneFolded = false;
            // 逃げる旗持ちは竿を抱えて運ぶ。布を横倒しにしたまま地面へ下げない。
            // 討死して落とした旗の接地と、拾い直す動きは上の枝に任せる。
            if (g.routed) {
              s.rotation.x = Math.max(-0.35, s.rotation.x);
              s.rotation.z = Math.max(-0.1, Math.min(0.1, s.rotation.z));
              s.position.y = d.baseY - Math.min(d.low, 0.35) + (s.parent === this.scene ? carrier.pos.y : 0);
            }
            // 縦の乳で竿に留めた雨の幟。布だけを風下へ回して竿から離さない。
            d.cloth.rotation.y = 0;
            if (d.cloth.geometry === d.clothGeo) {
              const faint = d.faintClothMat && d.cloth.material === d.faintClothMat;
              if (d.fullClothMat) d.cloth.material = d.fullClothMat;
              creaseFlag(d.cloth);
              if (d.fullClothMat) d.fullClothMat = d.cloth.material;
              if (faint) d.cloth.material = d.faintClothMat;
            }
            // 半透明の大旗を敵へ重ねない。共通側が近い味方用の材質を選んだ間は竿ごと省く。
            // 風向きから竿際へ戻した後に再判定し、裸の竿も中央へ残さない。
            // 離れた時の表示は共通側が毎回戻す。旗持ちの体・戦力は変えない。
            if (carrier?.camHidden || d.faintClothMat && d.cloth.material === d.faintClothMat ||
                toneStandardBlocks(this, s, standardViewAhead)) s.visible = false;
          }
        }
      }
    };
    rt.scene.add(F.asakuraFlag);
    rt.marker('asakuraMain', () => F.asakuraFlag.visible && sightUnit(rt, F.asakuraBearer) ? F.asakuraBearer.pos : null, '峠の先へ退く朝倉の旗', { h: 4 });
    rt.after(5, () => { if (rt.phase === 'brief') this.chase(rt); });
  },
  chase(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t; F.guideTask = null; rt.setPhase('chase');
    // 出立待ちの説明はここまで。ほかの札に隠れて読了が止まっていても、接敵後へ持ち越さない。
    const H = rt.hud, departureLine = '前の馬に乗ったお方が信長公じゃ';
    for (let i = H.subQ.length - 1; i >= 0; i--) {
      if (H.subQ[i].text.includes(departureLine)) H.subQ.splice(i, 1);
    }
    if (H.shownLine?.text.includes(departureLine)) { H.nextSub(); H.subT = 0; H.shownLine = null; }
    // 馬廻が後ろで戦っていても、前の敵を見ている者を振り向かせない。
    rt.unmark('nobu');
    toneGuide(rt, FIRST_END);
    rt.marker('toneFront', () => F.roadGuide,
      () => F.guideJoin ? F.guideBend ? '味方へ合流する道' : '合流する味方の兵' : F.guideBend ? '次の道の曲がり' : F.guideVisible ? '道を塞ぐ敵の列' : '坂へ続く道', { h: 0.35, hideNear: 8 });
    rt.banner('朝倉が退く。信長公が追う', '前の敵は、仲間を逃がすために道を塞ぐ兵だ');
    F.chiefNoteT = rt.t + 8;
    rt.obj('main', '味方に続き、道を塞ぐ敵を崩せ', 'main', true);
    toneAdvanceCue(rt, 'susume', F.nobuU.pos);
    rt.say('織田信長', '法螺貝と進み太鼓じゃ。先手を待つな。敦賀へ追え！', 4);
    march(F.uma, [[-10, 60], [-6, 48], [-4, 16]].map(([x, z]) => xz(x, z)));
    march(F.late, [[roadX(82), 82], [-10, 60], [-6, 48], [-4, 24]].map(([x, z]) => xz(x, z)));
    for (const b of Object.values(F.bO)) {
      if (b.light) b.light.advance(60, 45);
      const z = along(b.real.anchor.x, b.real.anchor.z);
      march(b.real, [xz(roadX(z - 60), z - 60)]);
    }
  },
  second(rt) {
    const F = rt.flags;
    F.step = 2; F.stepT = rt.t; F.guideTask = null; rt.setPhase('second');
    rt.unmark('toneFront');
    rt.unmark('nobu');
    toneGuide(rt, SAKA);
    rt.marker('toneRoad', () => F.roadGuide,
      () => F.guideJoin ? F.guideBend ? '味方へ合流する道' : '合流する味方の兵' : F.guideBend ? '次の道の曲がり' : F.guideVisible ? '坂道で向き直る敵' : '峠へ続く道', { h: 0.35, hideNear: 8 });
    rt.obj('main', '味方と坂を上り、敵の槍を崩せ', 'main', true);
    const signaled = toneAdvanceCue(rt, 'kakari', F.late.center());
    rt.say('柴田勝家', signaled ? '陣太鼓の早打ちじゃ！　坂の敵を、共に押し崩せ' : '道が開いた！　坂で向き直る敵を、共に押し崩せ', 4);
    F.chiefNoteT = rt.t + 8;
    counterMarch(F.r2, COUNTER_PATHS[0]);
    march(F.uma, [...ROAD.slice(3, 6), xz(roadX(-98), -98)]);
    march(F.late, ROAD.slice(3, 6));
    followChase(rt, -64);
  },
  toPass(rt) {
    const F = rt.flags;
    F.step = 3; F.stepT = rt.t; F.guideTask = null; rt.setPhase('pass'); rt.unmark('toneRoad');
    rt.obj('main', '峠口の敵を崩し、味方と峠へ', 'main', true);
    const signaled = toneAdvanceCue(rt, 'kakari', F.late.center());
    toneGuide(rt, PASS);
    rt.unmark('nobu'); rt.marker('pass', () => F.roadGuide,
      () => F.guideJoin ? F.guideBend ? '味方へ合流する道' : '合流する味方の兵' : F.guideBend ? '次の道の曲がり' : F.guideVisible ? '峠口を守る敵' : '刀根坂の峠', { h: 0.35, hideNear: 8 });
    rt.say('組頭', signaled ? '陣太鼓の早打ちだ！　味方と峠口の敵を突き崩せ' : '首に気を取られるな。峠口の敵を突き崩せ', 4);
    F.chiefNoteT = rt.t + 8;
    march(F.uma, ROAD.slice(6, 7)); march(F.late, ROAD.slice(6, 7));
    followChase(rt, -112);
  },
  toIchijodani(rt) {
    const F = rt.flags;
    F.step = 4; F.stepT = rt.t; rt.setPhase('road');
    rt.unmark('asakuraMain'); retreat(F.yoshikage);
    for (const b of F.fleeB) b.order({ id: 'retreat', to: { x: b.pos.x + NORTHWEST.x * 100, z: b.pos.z + NORTHWEST.z * 100 }, form: 'column' });
    rt.unmark('pass'); rt.unmark('nobu');
    rt.world.setRainTarget(0);
    // 実際には敦賀に十四〜十六日留まり、十七日に木ノ芽峠を越える。
    rt.banner('越前への追撃', '敦賀に留まること三日。八月十七日、木の芽峠を越えて府中へ');
    rt.obj('main', '数日の道のりを略図でたどる', 'main');
    F.journey = toneJourney(rt);
  },
  townAttack(rt) {
    const F = rt.flags;
    F.step = 5; F.stepT = rt.t; rt.setPhase('town'); rt.unmark('chase');
    F.guideTask = null;
    rt.world.setTime('day');
    rt.banner('一乗谷の城下', '八月十八日以後。信長公は府中、先手は一乗谷へ');
    rt.obj('main', '勝家の手に続き、城下の敵を崩せ', 'main', true);
    const signaled = toneAdvanceCue(rt, 'kakari', F.late.center());
    rt.say('使番', signaled ? '陣太鼓の早打ちじゃ。柴田殿の手に続き、城下の道を押さえよ' : '柴田殿の手に加われとの御下知じゃ。城下の道を押さえよ', 4);
    toneGuide(rt, TOWN);
    rt.marker('town', () => !fighting(F.townG) && near(rt.player.u.pos, TOWN, 14) ? null : F.roadGuide,
      () => F.guideBend ? '城下へ続く道の曲がり' : F.guideVisible ? '城下の道を守る敵' : '城下の道', { h: 0.35, hideNear: 8 });
    // 持ち場に着いたら前進の印を消し、到着を待つ実際の兵だけを示す。
    rt.marker('townAllies', () => {
      if (F.step !== 5 || F.ending || !F.waitingTown) return null;
      let closest = null, distance = Infinity;
      for (const u of F.late.units) {
        if (!toneJoinable(rt, u)) continue;
        const d = u.pos.distanceToSquared(rt.player.u.pos);
        if (d < distance) { distance = d; closest = u; }
      }
      return closest?.pos || null;
    }, '到着を待つ味方', { h: 2.2, hideNear: 8 });
    // 府中で下知する信長を城下へ同行させない。街道の位置は場の圧縮。
    march(F.uma, [CHASE_ROAD[2]]);
    F.townFriends = [F.late]; march(F.late, CHASE_ROAD.slice(3, 5));
  },
  townFire(rt) {
    const F = rt.flags;
    F.waitingTown = false; rt.unmark('townAllies');
    F.step = 6; F.stepT = rt.t; F.secureT = 0;
    rt.setPhase('fire'); rt.unmark('town');
    rt.say('使番', '城下に火が上がった。勝家の手と奥の道へ進め', 4);
    TOWN_HOUSES.forEach(([x, z], i) => rt.after(i * 2, () => { rt.world.addFire(x, z, { h: 2, size: 2.4 }); }));
    rt.banner('一乗谷の火', '城下に火が上がる。義景は大野へ逃れたという');
    F.guideTask = null;
    // 目の前の持ち場替えはその場で知らせ、前の任務を運ぶ使番も取り消す。
    rt.obj('main', '奥の道へ進み、勝家の手に続け', 'main', true);
    toneDestinationGuide(rt, INNER);
    rt.marker('inner', () => !F.guideJoin && near(rt.player.u.pos, INNER, 12) ? null : F.roadGuide,
      () => F.guideJoin ? F.guideBend ? '勝家の手へ合流する道' : '合流する勝家の手' : F.guideBend ? '奥の道へ続く曲がり' : '奥の道の守り場', { h: 0.35, hideNear: 8 });
    rt.zone('inner', INNER.x, INNER.z, 12);
    march(F.late, CHASE_ROAD.slice(4));
  },
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end'); rt.unmark('inner'); rt.unzone('inner');
    for (let i = 0; i < F.rears.length; i++) rt.unmark('rear' + i);
    rt.objDone('main'); rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '城下の道を押さえた', pts: 20 }; }, '城下の道を守り通した');
    rt.banner('城下の道を押さえた', '後日、義景は大野で自害し、朝倉家は滅ぶ。織田勢は近江へ戻り、小谷城へ');
    // 後日の自害は見出しの語りに留め、足軽の現在の下知とは分ける。
    rt.say('組頭', 'よし、道は押さえたぞ。次の下知があるまで、ここを守れ', 4);
    // 終幕の見出しは後日の語り。共通の追撃を挟まず、この戦の余韻で閉じる。
    rt.player.u.invuln = true; rt.finish({ scriptedEnd: true }, 10);
  },
  lose(rt, why) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end'); rt.unmark('toneRoad'); rt.unmark('asakuraMain');
    rt.unmark('toneFront');
    for (let i = 0; i < F.rears.length; i++) rt.unmark('rear' + i);
    rt.objFail('main'); rt.tracker.main = false;
    rt.unmark('nobu'); rt.unmark('pass'); rt.unmark('chase'); rt.unmark('town'); rt.unmark('inner');
    rt.say('組頭', '法螺貝と退き太鼓じゃ。生き残った者は来た道を退け。旗の下へ集まれ！', 4);
    rt.banner('追い手の列が崩れた', why || 'この組では追い討ちを続けられぬ');
    rt.objProgress('main', (why ? why + '。' : '') + '合図：法螺貝と退き太鼓。来た道を退き、旗の下へ'); rt.unzone('inner');
    rt.finish({ failureReason: why || 'この組では追い討ちを続けられぬ' }, 8);
  },
  update(rt, dt) {
    // 退く人夫は追い手が寄ると走って逃げる（戦わない。士気を落として既存の逃げ足に任せる）
    for (const g of rt.flags.porters || []) {
      if (g.portersFled) continue;
      const c = g.center?.();
      if (c && Math.hypot(c.x - rt.player.u.pos.x, c.z - rt.player.u.pos.z) < 15) { g.portersFled = true; g.noRout = false; g.morale = 0; }
    }
    const F = rt.flags;
    if (F.journey) {
      if (F.ending || !rt.player.u.alive || rt.over) { F.journey.close(); F.journey = null; return; }
      if (!F.journey.tick()) return;
      // 道中の空歩きは省き、勝家の手と共に城下の入口へ着く。
      toneJourneyGroup(rt, F.uma, STREET, Math.PI / 2 + TURN);
      toneJourneyGroup(rt, F.late, at(92, -132), Math.PI / 2 + TURN);
      const entry = at(88, -132), P = rt.player.u;
      P.pos.set(entry.x, rt.world.heightAt(entry.x, entry.z), entry.z);
      P.vel.x = P.vel.z = rt.player.vel.x = rt.player.vel.z = 0;
      P.target = P.moveTo = rt.player.lock = null;
      rt.player.yaw = P.heading = Math.PI / 2 + TURN;
      for (const g of rt.squadGroups) toneJourneyGroup(rt, g, at(84, -134), rt.player.yaw);
      let i = 0;
      for (const u of rt.tomoUnits || []) if (u.alive && !u.gone && !u.woundOut) {
        const q = at(84 - i++, -130);
        u.pos.set(q.x, rt.world.heightAt(q.x, q.z), q.z); u.target = u.moveTo = null; u.vel.x = u.vel.z = 0;
      }
      // 隊の列を置いた後で道の脇を選ぶ。騎馬の胴へ主人公を重ねない。
      // 暗転中の一度だけ。既存の兵との距離を見て、城下へ続く道の内に収める。
      let bestGap = -Infinity;
      for (let j = 0; j < 24; j++) {
        const q = at(88 - Math.floor(j / 3) * 2, -132 + (j % 3 - 1) * 4);
        if (chaseNear(q.x, q.z) > 7) continue;
        let gap = Infinity;
        for (const u of rt.army.units) {
          if (u === P || !u.alive || u.gone || u.woundOut) continue;
          gap = Math.min(gap, Math.hypot(q.x - u.pos.x, q.z - u.pos.z) - (u.mounted ? 4.5 : 2));
        }
        if (gap > bestGap) { bestGap = gap; entry.x = q.x; entry.z = q.z; }
        if (gap >= 0) break;
      }
      P.pos.set(entry.x, rt.world.heightAt(entry.x, entry.z), entry.z);
      retreat(F.roadG);
      F.journey.close(); F.journey = null;
      this.townAttack(rt); return;
    }
    if (F.asakuraFlag) {
      // 体と別に置いた本隊の旗も、深手や倒れた持ち主だけを残して宙を進ませない。
      F.asakuraFlag.visible = F.step < 4 && toneCrowdFighter(F.asakuraBearer) && !F.asakuraBearer.camHidden;
      if (F.asakuraFlag.visible) F.asakuraFlag.position.copy(F.asakuraBearer.pos);
    }
    butaiTick(rt, dt);
    if (F.ending || !rt.player.u.alive) return;
    const bag = F.baggage;
    if (!F.baggageResumeAt && rt.t >= F.baggageStopAt) {
      bag.light.halt(); F.baggageResumeAt = rt.t + 4;
    } else if (F.baggageResumeAt && rt.t >= F.baggageResumeAt) {
      bag.light.moveTo(F.baggageTo.x, F.baggageTo.z, 60, { back: true });
      F.baggageResumeAt = 0; F.baggageStopAt = Infinity;
    }
    // 実際に姿が見える近い敵だけ知らせる。二分はあける。
    if (F.step >= 1 && rt.t >= (F.enemyListenAt || 0)) {
      F.enemyListenAt = rt.t + 1;
      const p = rt.player.u.pos;
      let closest = null, distance = CLOSE_REAR;
      for (const u of rt.army.units) {
        if (!fighter(u) || u.rearWound || u.downed || u.team === rt.player.u.team || u.group?.hidden || u.group?.ambush) continue;
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d >= distance || !sightScreenUnit(rt, u)) continue;
        closest = u; distance = d;
      }
      F.nearEnemy = closest;
      if (closest && rt.t >= (F.enemyVoiceAt || 0)) {
        const dx = closest.pos.x - p.x, dz = closest.pos.z - p.z;
        const e = rt.camera?.matrixWorld.elements;
        const side = e ? dx * e[0] + dz * e[2] : dx * Math.cos(rt.player.yaw) - dz * Math.sin(rt.player.yaw);
        const front = e ? -dx * e[8] - dz * e[10] : dx * Math.sin(rt.player.yaw) + dz * Math.cos(rt.player.yaw);
        const direction = Math.abs(side) > Math.abs(front) ? side > 0 ? '右' : '左' : front > 0 ? '前' : '後ろ';
        F.enemyVoiceAt = rt.t + 120;
        rt.bark(distance < GUARD_REAR ? `${direction}に敵の槍！　味方の列で構えよ` : `${direction}の道に敵！　味方の列に続け`, true);
      }
    }
    // 味方の曲がり角での停滞だけをほどく。殿全隊が主人公へ総攻撃する下知は出さない。
    if (F.step >= 1 && rt.t >= (F.pressureAt || 0)) pressureTick(rt, F.step, [], F.oda, F.step <= 3 ? '街道を北西へ。味方と敵の殿を崩せ' : '街道の印へ進み、先手に続け');
    const hit = rt.player.lastHit;
    // 四割まで減ってからでは遅い。退ける体力があるうちに一度だけ案内する。
    const player = rt.player, u = player.u;
    if (!F.dangerTip && !rt.over && u.hp > 0 && u.hp <= u.maxHp * 0.65) {
      F.dangerTip = true;
      const ranged = hit?.ranged && rt.t - hit.t < 6;
      const text = ranged ? '矢玉は構えでは防げない。木や屋敷の陰へ退け'
        : player.sta <= 0 || player.guardBroken > 0 ? '構える力が尽きた。味方の後ろへ退き、息を整えよ'
        : isTouch ? '危ない！　敵へ向いて「構える」を押す。味方の後ろへ下がれ'
        : '危ない！　敵へ向いて右押しで構える。味方の後ろへ下がれ';
      rt.hud.say('', text, 4, true);
      // 傷の原因の声も同時に重ねず、次の被弾まで待つ。
      F.hurtHitT = hit?.t; F.hurtWarnT = rt.t + 8;
    }
    if (hit && rt.t - hit.t < 8 && hit.t !== F.hurtHitT && rt.t >= (F.hurtWarnT || 0)) {
      F.hurtHitT = hit.t; F.hurtWarnT = rt.t + 120;
      const cause = hit.ranged ? (hit.type === 'bow' ? '矢が当たった。' : '撃たれた。') : hit.back ? '背を突かれた。' : hit.side ? '横から打たれた。' : '前から突かれた。';
      rt.bark(cause + (hit.ranged ? '避けて味方へ退け' : hit.exhausted || hit.guardBroken ? '退いて息を整えよ' : '構えて味方へ退け'), true);
    }
    for (const g of F.rears) if (!g._shown && fighting(g)) {
      let seen = false;
      for (const u of g.units) if (u.alive && near(u.pos, rt.player.u.pos, 30) && sightPoint(rt, u.pos)) { seen = true; break; }
      if (seen) g._shown = true;
    }
    if (rt.t >= (F.chiefNoteT || 0)) for (const g of F.rears) {
      if (g._chiefNamed || !fighting(g)) continue;
      const u = g.units.find((q) => q.type === 'busho' && q.alive && !q.fleeing);
      if (u && near(u.pos, rt.player.u.pos, 18) && sightUnit(rt, u)) {
        g._chiefNamed = true; F.chiefNoteT = rt.t + 8;
        rt.say(u.name, REAR_VOICE[u.name], 4); break;
      }
    }
    for (let i = 0; i < F.rears.length; i++) if (!fighting(F.rears[i])) rt.unmark('rear' + i);
    F.poll -= dt;
    if (F.poll > 0) return;
    const elapsed = Math.max(0, rt.t - F.pollAt); F.pollAt = rt.t; F.poll = 0.4;
    const p = rt.player.u.pos;
    for (const b of F.rearCrowds) {
      if (b.routedL || b.toneRetreatZ <= -220 || !near(b.pos, b.toneRetreatTo, 1)) continue;
      b.toneRetreatZ = Math.max(-220, b.toneRetreatZ - 8);
      const z = b.toneRetreatZ, x = roadX(z), to = b.toneRetreatTo;
      to.x = x * CS + z * SN; to.z = z * CS - x * SN;
      b.light.moveTo(to.x, to.z, 15, { back: false }); // 疲れた退き足（八歩に十五秒）。速いと25秒で峠の闇へ消えた
    }
    if (F.step >= 1 && F.step <= 3) {
      for (const g of F.rears) {
        if (!g._retreatColumn || !fighting(g)) continue;
        let close = near(p, g.anchor, 24);
        for (const a of F.oda) for (const u of a.units) {
          if (u.alive && !u.fleeing && !u.woundOut && near(u.pos, g.anchor, 24)) close = true;
        }
        if (!close) continue;
        g._retreatColumn = false; g.path = null;
        toneHold(g); g.facing = TURN; g._face = TURN;
      }
      retreatCascade(rt);
      toneMarchPace(rt);
    }
    if ((F.step >= 1 && F.step <= 3) || F.step === 5) withdrawStage(rt);
    // 他の守りも少数になれば退く。
    for (const g of F.defenders) {
      const n = fighters(g);
      if (n > 0 && n <= 3 && n <= g.initial * 0.2) { retreat(g); this.onRout(rt, g); }
    }
    if (F.step >= 1 && !fighting(F.r1) && !fighting(F.r1b)) {
      counterMarch(F.r2, COUNTER_PATHS[0]);
      if (!fighting(F.r2)) {
        counterMarch(F.r3, COUNTER_PATHS[1]);
        if (!fighting(F.r3)) {
          counterMarch(F.r4, COUNTER_PATHS[2]);
          if (!fighting(F.r4)) {
            counterMarch(F.roadG, COUNTER_PATHS[3]);
            if (!fighting(F.roadG)) counterMarch(F.townG, COUNTER_PATHS[4]);
          }
        }
      }
    }
    if (F.step === 0) rt.objProgress('main', `馬廻の出立まで${Math.max(0, Math.ceil(5 - (rt.t - F.briefAt)))}秒。列に続け`);
    if (F.step >= 1 && F.step <= 3) {
      // 兵が一歩離れただけで進め／戻れを繰り返さない。敵が目前なら猶予を切る。
      const supported = toneSupported(rt, p);
      if (supported) F.supportUntil = rt.t + 3;
      const joined = supported || rt.t < (F.supportUntil || 0) && !(F.nearEnemy && fighter(F.nearEnemy) && near(p, F.nearEnemy.pos, 6));
      // 囲まれた知らせの後でも、味方へ着いたら合流は済み。列の中で戻れを繰り返さない。
      const regroup = toneRegroupNeeded(rt, supported, joined);
      if (joined && !regroup) F.regroupAlly = null;
      const n = F.step === 1 ? fighters(F.r1) + fighters(F.r1b) : F.step === 2 ? fighters(F.r2) + fighters(F.r3) : fighters(F.r4);
      const wait = F.chaseWait, uc = F.uma.center(), lc = F.late.center();
      wait.umaStopped = wait.t > 0 && Math.hypot(uc.x - wait.umaX, uc.z - wait.umaZ) < 0.1;
      wait.lateStopped = wait.t > 0 && Math.hypot(lc.x - wait.lateX, lc.z - wait.lateZ) < 0.1;
      wait.t = rt.t; wait.step = F.step; wait.enemies = n; wait.joined = joined;
      wait.umaX = uc.x; wait.umaZ = uc.z; wait.lateX = lc.x; wait.lateZ = lc.z;
      toneGuide(rt, F.step === 1 ? FIRST_END : F.step === 2 ? SAKA : PASS);
      const seenRear = F.guideVisible;
      // 道の案内先とは別の隊も、目の前で槍を向けているなら優先する。
      const closeRear = seenRear && near(p, F.guideEnemy.pos, CLOSE_REAR);
      const guardRear = !!toneGuardEnemy(rt);
      // 敵がまだ遠い時も、独りになった供を味方へ戻す。
      // 曲がりの印だけを追わせると、足を負傷した供が列から離れ続ける。
      if (regroup || !joined) toneRegroupGuide(rt);
      // 携帯では詳しい任務が隠れる。曲がりの距離を敵との距離と取り違えないよう、主の札も合わせる。
      const task = F.guideJoin ? guardRear ? '敵を見て、味方へ戻れ'
        : F.guideBend ? '道の印をたどり、味方の列へ戻れ' : '印の味方の列へ戻れ'
        : guardRear ? '敵へ構え、味方と押せ'
        // 肩越しでは背後の兵も画面に映る。進行方向の前だと決めつけない。
        : closeRear ? '印の敵へ、味方と近づけ'
        : !n ? F.step === 1 ? '敵は退いた。味方と北西の坂へ進め'
          : F.step === 2 ? '敵は退いた。味方と峠へ進め' : '敵は退いた。味方と峠を越えよ'
        : n && F.guideBend ? seenRear ? '道の曲がりへ進み、味方と敵を崩せ' : '道の曲がりへ、味方と進め'
        : n && !seenRear ? '道の印へ、味方と進め'
        : '味方と印の敵へ進め';
      if (F.guideTask !== task) { F.guideTask = task; rt.obj('main', task, 'main', true); }
      if (seenRear) { wait.rearX = F.guideEnemy.pos.x; wait.rearZ = F.guideEnemy.pos.z; }
      const direction = along(wait.rearX, wait.rearZ) < along(p.x, p.z) ? '北西' : '南東';
      const remaining = F.guideJoin ? F.guideBend ? '印は戻る道の曲がり。道なりに味方へ'
        : guardRear ? '印は味方の列。敵を見ながら戻れ' : '印は合流する味方。道をたどって寄れ'
        : guardRear ? '近くの敵へ向き、構えて味方と押せ'
        : closeRear ? '印の敵が道を塞ぐ。味方と並んで近づけ'
        : F.guideBend && seenRear ? '印は道の曲がり。敵の列へは道をたどれ'
        : F.guideBend ? '印は次の曲がり。敵は道の先にいる'
        : seenRear ? `${direction}の敵を味方と崩せ` : '街道を北西へ。味方と敵を崩せ';
      rt.objProgress('main', F.guideJoin ? remaining : n ? remaining + '。逃げる兵は追わず、槍を向ける敵を押せ' : !joined ? '近い味方の兵へ寄り、列に続け' : F.step === 1 ? '敵は崩れた。北西の坂へ進め' : F.step === 2 ? '坂の敵は崩れた。街道を北西へ' : '敵は退いた。刀根坂の峠へ');
    }
    else if (F.step === 5) {
      const cleared = !fighting(F.townG), atTown = near(p, TOWN, 14);
      F.waitingTown = cleared && atTown;
      if (cleared) toneDestinationGuide(rt, TOWN);
      else toneGuide(rt, TOWN);
      const task = cleared ? atTown ? 'ここで勝家の兵を待て' : '敵は退いた。印の城下の道へ進め'
        : F.guideVisible ? '勝家の手に続き、城下の敵を崩せ' : '城下の道へ進み、勝家の手に続け';
      if (F.guideTask !== task) { F.guideTask = task; rt.obj('main', task, 'main', true); }
      rt.objProgress('main', cleared ? atTown ? '逃げる兵は追わず、ここで味方と合流せよ' : '道の印をたどり、城下で味方と合流せよ'
        : F.guideVisible ? '勝家の旗に続き、道を守る敵を崩せ' : '道の印へ進み、勝家の旗に続け');
    }
    else if (F.step === 6) {
      toneDestinationGuide(rt, INNER);
      const supported = toneSecureSupport(rt);
      // 守り場までは勝家の手に続く。ほかの組の支えだけで先へ送らない。
      // 守り場へ着いた者はそこで待ち、来た道へ引き返させない。
      if (!supported && !near(p, INNER, 12)) toneRegroupGuide(rt, F.late);
      const task = F.guideJoin ? F.guideBend ? '道をたどり、勝家の手へ' : '印の味方と奥の道へ'
        : !near(p, INNER, 12) ? '奥の道へ進み、勝家の手に続け'
        : !supported ? '守り場で勝家の手を待て' : `味方と道を守れ。残り${Math.max(0, Math.ceil(8 - F.secureT))}秒`;
      if (F.guideTask !== task) { F.guideTask = task; rt.obj('main', task, 'main', true); }
      rt.objProgress('main', F.guideJoin ? F.guideBend ? '印は勝家の手へ続く道。道なりに進め' : '印は合流する味方。列に寄り、共に進め' : !near(p, INNER, 12) ? '奥の道の印へ進み、勝家の手と合流せよ' : !supported ? '守り場に着いた。ここで勝家の手を待て' : `味方と道を守れ。残り${Math.max(0, Math.ceil(8 - F.secureT))}秒`);
    }
    // 馬廻は士気だけで総崩れにしない。供が実際に倒れ、三人を切った時だけ追撃を断つ。
    const shaky = (F.step >= 5 && !fighting(F.late)) || (F.step > 0 && F.step < 5 && !fighting(F.uma) && !fighting(F.late));
    if (shaky && !F.shakyWarn) { F.shakyWarn = true; rt.say('組頭', F.step >= 5 ? '柴田の手が持たぬぞ！　旗の下へ寄り、踏みとどまれ' : '馬廻が押されておる！　信長公の旗を守れ', 4); }
    if ((F.step >= 5 && fighters(F.late) < 3) || (F.step > 0 && F.step < 5 && fighters(F.uma) < 3 && fighters(F.late) < 3)) {
      this.lose(rt, F.step >= 5 ? '城下の道を守る先手が崩れた' : '峠へ追う信長公の馬廻と後続が崩れた'); return;
    }
    // 殿が退いたら次の任務へ。列の後ろや逃げる残兵の到着を待たない。
    if (F.step === 1 && !fighting(F.r1) && !fighting(F.r1b)) this.second(rt);
    else if (F.step === 2 && !fighting(F.r2) && !fighting(F.r3)) this.toPass(rt);
    else if (F.step === 3 && !fighting(F.r4)) this.toIchijodani(rt);
    else if (F.step === 5 && !fighting(F.townG) && (near(p, TOWN, 14) && arrived(F.late, TOWN, 22) || rt.t - F.stepT >= 60)) this.townFire(rt);
    else if (F.step === 6) {
      if (near(p, INNER, 12) && toneSecureSupport(rt) && !fighting(F.townG)) F.secureT += elapsed;
      else F.secureT = 0;
      // 早く崩した場合は味方と持ち場を守る。各段の上限と合わせ四〜七分に収める。
      if (rt.t >= 240 && (F.secureT >= 8 || rt.t - F.stepT >= 45)) this.win(rt);
    }
  },
  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.type === 'busho' && v.team === 1 && v.group) v.group.morale -= 35;
    // 逃げる残兵を狩る手柄にはせず、持ち場を守る敵への自分と組の働きだけを数える。
    if (v.team === 1 && !v.civ && !v.isStruct && !v.fleeing &&
        F.stageDefenders[F.step]?.includes(v.group) &&
        (k === rt.player.u || k?.team === rt.player.u.team && (k.isSub || k.isTomo))) {
      v.group._toneHelp = Math.min(3, (v.group._toneHelp || 0) + 1);
    }
  },
  onFinish(rt) { rt.flags.journey?.close(); rt.flags.journey = null; rt.flags.restoreNobuLabel?.(); rt.flags.labelStyle?.remove(); delete rt.hud.root.dataset.tonezaka; },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team === 1 && g._toneHelp >= 3 && !g._toneHelpAward && F.stageDefenders[F.step]?.includes(g)) {
      g._toneHelpAward = true;
      const label = g.name + 'を崩す働き';
      rt.award((t) => t.side.push(label), '自分たちの働きで道が開いた');
    }
    if (g.team !== 1 || g._routSaid || rt.t < (F.routSayT || 0) || !near(rt.player.u.pos, g.center(), 35)) return;
    g._routSaid = true; F.routSayT = rt.t + 8;
    const line = F.routLine = ((F.routLine || 0) + 1) % 3;
    rt.say('足軽', line === 0 ? '敵が逃げてくがね！　味方の旗に続け！' : line === 1 ? '槍が崩れたで！　道を押さえろ！' : '道が空いたで！　一人で追うでねえ！', 3);
  },
};
// 総勢は参考値。局地の一人の死を三十人・六十人の死へ換算しない。
tonezaka.force = () => ({ a: 30000, a0: 30000, b: 20000, b0: 20000 });
tonezaka.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '朝倉軍', mon: 'asakura' } };
tonezaka.taisho = { a: null, b: null }; // 固有の馬廻と退く本隊を使い、共通の討ち取り勝ちを足さない。
tonezaka.noTaishoRaid = true;
tonezaka.noWake = true;
tonezaka.noRevive = true; // 深手から数秒で体力を戻し、戦い直す救済を足さない。
tonezaka.noDistantBattle = true;
tonezaka.lordHata = { spear: 12 };
tonezaka.rts = false;
tonezaka.gungi = () => null; // 足軽が柴田勝家の進路・全軍の作戦を決める軍議を作らない。
tonezaka.famous = []; // 河合らは初めから供と配置し、共通の名将追加を重ねない。
tonezaka.date = (rt) => rt.flags.step >= 5 ? '天正元年八月十八日以後　一乗谷の城下' : rt.flags.step >= 4 ? '天正元年八月十四日〜十八日　越前への追撃' : '天正元年八月十三日〜十四日　刀根坂の追撃';
tonezaka.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '追い討ちの下知まで待つ' : '');
tonezaka.skip = (rt) => { if (rt.phase === 'brief') tonezaka.chase(rt); };
tonezaka.history = '天正元年（1573）八月、織田信長は浅井長政の小谷城を囲んだ。後詰に出てきた朝倉義景は、大嵐の夜に大嶽などの砦を落とされると、陣を払って越前へ退き始めた。信長はこれを読んでいて、諸将に「油断するな」と命じていた。しかし先手の諸将は遅れ、信長は自ら先に立って追った（あとで諸将を叱ったと『信長公記』は伝える）。刀根山の峰で追いついた織田勢は、敦賀まで追い討ちを続けた。『信長公記』は、この追撃で三千余りの首を取ったと記す。朝倉の重臣・山崎吉家や、美濃を追われて朝倉に身を寄せていた斎藤龍興も討ち死にしたと伝わる。義景は一乗谷へ逃れたが、織田勢の追撃は敦賀から府中へ続いた。『信長公記』巻六は、八月十八日に信長が府中の龍門寺に陣を置き、義景が一乗谷を捨てて大野へ逃れ、柴田勝家らが追ったと記す。一乗谷は焼かれた。朝倉景鏡は織田方へ寝返り、八月二十日、義景は大野で自害して朝倉家は滅んだ。夜の追撃は八月十三日、十二日の大風雨とは分けている。総勢と各備の人数は参考値で、『信長公記』に各備の内訳はない。遊びでは数日の道のりを縮め、街道や城下に残る兵との戦いを補っている。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる）
tonezaka.lordAt = { ...at(2, 128), r: 12, why: '馬廻の先頭（信長は自ら馬を出し、朝倉勢を追った）' };

// 自動操作も、戦う殿と持ち場を同じ条件で進む。
tonezaka.botOrders = true;
tonezaka.botRetreatWay = toneRetreatWay;
tonezaka.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null; inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false; inp.runHeld = false;
  if (b.squad.length && !(b.botCmdT > b.t) && b.squadGroups.some((g) => g.order !== 'follow')) {
    inp.quickCmd = 'follow'; b.botCmdT = b.t + 2;
  }
  // 下知の間は静止した馬廻の中央へ歩かない。列が進み始めてから供として続く。
  if (F.step === 0 || F.step === 4) return;
  // 近い兵より、実際にこちらへ打ち込んでいる兵を先に受ける。
  let attacker = null, ad = 10, soonest = Infinity;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.noTarget || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos, false)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 馬廻や組の兵への振りを、自分への打ち込みとして受け続けない。
    const charge = o.charging && o.target === u;
    const swing = o.swing && !o.swing.done && o.swing.target === u;
    const atk = o.atk && o.atk.target === u && !o.atk.bow;
    if (!charge && !atk && !swing) continue;
    // 近い兵がまだ溜めていても、横の兵の穂先が先に届くならそちらを受ける。
    const motion = atk ? (SWING[o.atk.kind] || SWING.thrust) : null;
    const soon = charge ? 0 : swing ? Math.max(0, o.swing.dur * o.swing.at - o.swing.t) :
      o.atk.t + motion[0] * motion[1] * (o.atk.fast ? 0.7 : 1);
    if (d < 10 && (soon < soonest || soon === soonest && d < ad)) { attacker = o; ad = d; soonest = soon; }
  }
  // 坂の上や物陰の兵を、届く相手として追い続けない。
  const e = attacker || strikeTarget(b, F.guideJoin ? GUARD_REAR : 12);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    // 敵へ詰める時も、当たりで止まったら回り込む共通の歩きを使う。
    // 狙いの固定で、その回り込みの向きへ引き戻されないようにする。
    if (p.lock) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 敵の槍は三歩余り、自分の槍は二歩余り。打ち込みを見た時に足を止めると、
    // こちらだけ届かない所で受け続ける。騎馬の突進以外は受けながら間合いを詰める。
    if (d > reach * 0.85 && !e.charging) {
      goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
      // 回り込む歩みを残し、突きも構えも相手へ向ける。
      // 間合いの端で歩く向きのまま突くと、敵の横へ空振りする。
      const walk = p.yaw;
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      inp.k.delete('KeyW');
      const turn = walk - p.yaw;
      if (Math.cos(turn) > 0.3) inp.k.add('KeyW');
      else if (Math.cos(turn) < -0.3) inp.k.add('KeyS');
      if (Math.sin(turn) > 0.3) inp.k.add('KeyA');
      else if (Math.sin(turn) < -0.3) inp.k.add('KeyD');
    }
    if (attacker) {
      // 振りかぶりの初めから構えると、穂先が来る頃には受け流しの間が終わる。
      // 大振りも、実際に穂先が届く直前に構える。長い溜めの間は気力を戻す。
      const guardLead = p.parryWin() * (u.mobbed ? 0.7 : 1) * 0.65;
      inp.guardHold = !!e.charging || soonest <= guardLead;
      if (inp.guardHold) p.botStrikeUntil = 0;
      // 打ち手が交代しても、まだ長く溜めているなら普通の突きを出せる。
      // 全ての打ち手のうち最も早い一撃まで、余裕がある時だけ割り込む。
      else if (d < reach && soonest > 0.85 && e.atk?.t > 0.65) patientStrike(p, inp, e, d, true);
    }
    // 構えをくじで切り替えると、解いた直後の払いに化けて気力が尽きる。
    // 打ち込みを受けた後、構えを解く時間を保ってから突く。
    else if (d < reach) patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  // 待つ下知の間は、消えた矢印の先へさらに歩かない。
  if (F.step === 5 && !fighting(F.townG) && near(u.pos, TOWN, 14)) return;
  // 夜の峠でも合流の下知に従う。遠い敵だけを追って味方の列から離れない。
  // 目前の打ち合いは上で受け、敵が離れたら札と同じ道を戻る。
  if ((F.step >= 1 && F.step <= 3 || F.step === 6) && F.guideJoin) {
    goTo(p, inp, F.roadGuide.x, F.roadGuide.z, 3); return;
  }
  if (F.step >= 1 && F.step <= 3 || F.step === 5 || F.step === 6) {
    // 道中は人に見せた印をたどる。別の敵への直進で曲がりや合流を無視しない。
    // 目前の槍合わせは上で処理し、霧の先や山腹の兵には街道から近づく。
    goTo(p, inp, F.roadGuide.x, F.roadGuide.z, F.guideBend ? 2 : 3); return;
  }
  const at = F.step === 1 ? FIRST_END : F.step === 2 ? SAKA : F.step === 3 ? PASS : F.step === 5 ? TOWN : F.step === 6 ? INNER : F.uma.center();
  goTo(p, inp, at.x, at.z, 3);
};

// 信長公記巻六：信長の先駆けと遅れる先手、朝倉の退却。
// 長蛇は軍学上の史実の陣名でなく、細い街道に沿う並びの呼び名。
// 各備の内訳は史料にないため不明とする。描く兵の数・隊列・総勢は変えない。
installBattleJinkei(tonezaka, [
  battleJin('街道に続く追い手', 0, at(2, 124), Math.PI + TURN, [
    ['tone_nobunaga', '追い手の先頭・馬廻', '織田信長', null, at(2, 124), 'eiraku', 'oda', (r) => r.flags.uma, { form: 'column' }],
    ['tone_shibata', '遅れて追いつく先手', '柴田勝家', null, at(6, 164), 'oda', 'oda', (r) => r.flags.late, { form: 'column' }],
    ['tone_niwa', '後続の備え', '丹羽長秀', null, at(2, 186), 'oda', 'oda', (r) => r.flags.bO?.niwa],
    ['tone_hashiba', '後続の備え', '羽柴秀吉', null, at(10, 214), 'oda', 'oda', (r) => r.flags.bO?.hashiba],
    ['tone_takigawa', '後続の備え', '滝川一益', null, at(-2, 238), 'takigawa', 'takigawa', (r) => r.flags.bO?.takigawa],
    ['tone_sakuma', '後続の備え', '佐久間信盛', null, at(4, 260), 'oda', 'oda', (r) => r.flags.bO?.sakuma],
  ], '諸将の参戦を採用。各備の兵数は不明。後続の順は推定で、信長が先手を待たず追う筋を保つ。'),
  battleJin('殿から峠へ続く退きの備え', 1, at(-4, -200), TURN, [
    ['tone_kawai', '街道の殿', '河合吉統', null, at(-6, 40), 'asakura', 'asakura', (r) => r.flags.r1],
    ['tone_yamazaki', '坂の返し合わせ', '山崎吉家', null, at(4, -74), 'asakura', 'asakura', (r) => r.flags.r2],
    ['tone_saito', '坂の脇の備え', '斎藤龍興', null, at(6, -106), 'saito', 'saito', (r) => r.flags.r3],
    ['tone_takumi', '峠口の後備え', '詫美越後守', null, at(-4, -142), 'asakura', 'asakura', (r) => r.flags.r4],
    ['tone_yoshikage', '峠を越える本隊', '朝倉義景', null, at(-4, -200), 'asakura', 'asakura', (r) => r.flags.fleeB?.[0]],
    ['tone_nida', '先へ退く荷駄と後備え', '将の名は不明', null, at(10, -240), 'asakura', 'asakura', (r) => r.flags.fleeB?.[1], { named: false }],
  ], '総勢二万は参考値。各備の兵数は不明で、持ち場は復元。朝倉は初めから疲れと乱れがあり、向きをそろえて正面決戦にはしない。'),
]);

export { tonezaka };
