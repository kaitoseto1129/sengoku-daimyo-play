import { NODAFUKUSHIMA_KACCHU } from './kacchu_data.js';
import { pressureTick } from './battle_pressure.js';
import { distToPolyline } from './world.js';
import { sightPoint } from './battle_sight.js';
import { guardDrawCamera } from './render_camera.js';
import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
// ======================================================================
// 織田家編　野田・福島の戦い（元亀元年八月〜九月）
// 三好三人衆が摂津の野田・福島に砦を構え、信長はこれを囲んだ。織田方には紀伊の根来・雑賀の鉄砲衆も加わり、
// 昼も夜も鉄砲の撃ち合いが続いた。公記の十三日夜の射撃に合わせ、本願寺の蜂起を夜の段で表す。
// 足軽は前田利家の手。①竹束を据えて鉄砲で支える ②浅瀬・中洲を渡り、野田・福島へ総攻め
// ③本願寺の早鐘。後ろと横から一揆勢が寄せ、堤へ戻って退き口を保つ
// ④浅井・朝倉が京へ迫る知らせ。囲みを解き、詰め陣の退き口へ退く（数日にわたる戦を続く段にまとめる）
// 向き：西は海、北・東・南の川に囲まれた二城。南東に織田の詰め陣と石山本願寺。
// 水路の形と前線の細かな配置は推定。天王寺の本陣までの約五キロをこの局地へ縮めない。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, hut, tawara, campfire, makeSimpleBatch, finalizeSimpleBatch, castleMat, kabukimon, solidSeg } from './props.js';
import { Garan } from './temple1571.js';
import { facePanels } from './naka.js';
import { flagTexture } from './textures.js';
import { placeGroup } from './b_opening.js';
import { RANKS } from './state.js';
import { reduceMotion, S as SETTINGS } from './settings.js';
import { segHit, buildModel } from './units.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup as spawnEnemy, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { battleEvent, EVENT_MESSENGER, EVENT_RETREAT } from './battle_events.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { volleyScene } from './b_shiga.js';
import { lines, leanAll, camp } from './b_mid.js';
// 束5（docs/quality-upgrade-plan.md）：河川砦の縄張り二つ・堤の土塁・竹束・三好と一揆の部隊・夜の寄せの頭・持ち場の区域
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { doruiLine, doruiHeight, horiboriHeight, sakamogiRow, goten, monomi } from './castle_parts.js';
import { reset as flReset, groundAt } from './floors.js';
import { makeSiegeZones, ZONE_STATE } from './siege_zones.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeAttackAI } from './siege_ai.js';
import { fordWatch } from './toride.js';
import { makeButai, butaiTick, lightClash } from './butai.js';
import { tabaMat, addTaba, patchGunCover, tickTabas } from './taketaba.js';
import { timeslipField } from './timeslip_field.js';
import { NODA_PLAN, FUKU_PLAN, NODA_GATE, FUKU_GATE, FORT_Z, LEVEE_Z, LEVEE_DORUI, LEVEE_TABA, LEVEE_ZONE, ODA_HONJIN, IKKO_ROUTES, RANKUI_LINES, SAKAMOGI_LINES, FORT_BUILDINGS, FORT_STORES } from './castles/nodafukushima.js';
// 足軽大将より上の身分で出た時は、一手を預かる
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 4;

const RIVER = [[-220, -24], [-110, -32], [0, -30], [110, -24], [220, -30]];
// 参照節の「西は海、北・南・東は川」を補う。既存の南の川と浅瀬、二城の寸法はそのまま。
// 北・東の流路は推定。総攻めと夜の寄せが通る南岸には新しい川を横切らせない。
const ISLAND_RIVER = [[-220, -142], [-120, -138], [0, -142], [124, -138], [132, -80], [110, -24]];
const SEA_EDGE = -190;
// 竹束を据える所（堤の下の岸、野田砦へ向けた列）。置き場は堤の側（PILE_BACK 南）に置き、川と砦へ向かって押す。
// 堤の側へ押し戻す並びでは、押す間ずっと視点が土手の法だけを向いた（10/29）。
// 一番目（本人の束）は持ち場の正面。堤から真っ直ぐ砦の門へ向いて押す。二・三番目は味方の二組。
const SPOTS = [{ x: 0, z: -21 }, { x: -14, z: -20 }, { x: 14, z: -20 }];
const PILE_BACK = 4.5;
const CARRY_WAIT = 35; // 印を探し、長押しを覚える間を取る。据え切れなくても総攻めへ進む。
const HONGAN = { x: 170, z: 170 };          // 石山本願寺（遠く）
// 詰め陣の幕は南向き。北から退く兵は、幕の裏へ入らず外の守兵へ合流する。
// 案内・到着の範囲・遊び手を、実際の守兵の持ち場へそろえる。
const ODA_JOIN = { x: ODA_HONJIN.x, z: ODA_HONJIN.z - 16 };
// 河口の在所と本願寺の門前。村・町の存在を踏まえ、細かな位置・人数・道筋は推定復元。
// 大阪市福島区の沿革：https://www.city.osaka.lg.jp/fukushima/page/0000224266.html
// 二城の城下へ現代の市街地を置かず、既存の南岸の家並みと南東の堂を使う。
const VILLAGE_HOUSES = [[-92, 96], [-106, 110], [-86, 123], [91, 102], [107, 116], [89, 133]];
const PEOPLE_PATHS = [
  [[-97, 84], [-124, 84], [-124, 138], [-144, 170]],
  // 東の村の見物は家並みの西南へ。旧位置（95,88）は夜の門徒の列（92,78）の中になる。
  // 列が現れてから横切って逃げさせず、初めから村側の畦に立たせて南の村裏へ退く。
  // 湿地の細道としての推定復元。戸別の路地は従来の西の幹道（x=76）へつなぐ。
  [[82, 140], [76, 140], [76, 152], [92, 170]],
  // 見物は西の木戸（x=136）の外。囲い越しに戦を見る配置にせず、村側を見渡せる門前に立つ。
  // 兵や火が迫れば、囲いへ戻らず外の通りを南へ退く。
  // 道筋の細部は推定。鐘楼と僧坊を横切らず、場の端から十歩内側の乾いた広場へ退く。
  // 南の見物組（128,164）の中を避難路にせず、西側の畦へ出てから広場へ。
  [[128, 154], [122, 154], [122, 170], [128, 170]],
];
// 家の南向きの戸口から幹の畦道へ。家を横切らず、暮らしの場所と避難路をつなぐ。
const PEOPLE_LANES = VILLAGE_HOUSES.map(([x, z]) => {
  // 奥行き五歩の家の戸口の外から、軒先を抜けて幹道へ曲がる。
  // 壁の厚みと民の通行の余白を含む二・八九歩より外を道の始点にする。
  const doorX = x + Math.sin(0.2) * 2.95, doorZ = z + Math.cos(0.2) * 2.95;
  const yardX = x + Math.sin(0.2) * 5, yardZ = z + Math.cos(0.2) * 5;
  return [[doorX, doorZ], [yardX, yardZ], [x < 0 ? -124 : 76, yardZ]];
});
// 東の各戸の路地を村裏までつなぐ幹の畦。見物の道だけでは z=140 より北が
// 水田に途切れ、北側二軒の家族が逃げられない。細かな道筋は推定復元。
const PEOPLE_VILLAGE_ROADS = [[[76, 100], [76, 152]]];
// 村裏・門前の広場にも危険が迫った時の続き道。南の場外へ畦を延ばす。
// 広場で乾いた道を止めると、逃げ直す家族が水田に囲まれて足止めされる。
// 西は海、北は戦場なので、既存の南向きの避難路を継ぐ推定復元とする。
const PEOPLE_REFUGE_ROADS = PEOPLE_PATHS.map(path => {
  const end = path[path.length - 1];
  // 民が歩ける端（百七十八歩）の内側へつなぐ。
  return [end, [end[0], 177]];
});
// 僧坊の者や身を寄せる家族も、見物中は西の木戸の外の通りへ。
// 旧位置の寺内からは板囲いが北西の戦場を遮る。木戸の南北に分かれ、
// 兵や火が迫れば囲いへ戻らず、門前の通りから南の広場へ退く。配置は推定。
const TEMPLE_PEOPLE_LANES = [
  // 木戸前の見物組を縦に貫かず、それぞれ西へ出て同じ南向きの畦へ合流する。
  // 畦の細かな位置は推定。鐘楼・囲いの外を通り、広場の手前で東へ戻る。
  [[128, 144], [122, 144], [122, 170], [128, 170]],
  [[128, 164], [122, 164], [122, 170], [128, 170]],
];
// 各戸の家族は幹の畦にも散って見物する。道幅の五歩だけを乾かすと、
// 脇に立つ子・年寄りの場所へ田の水や木が入り、設営時に家族が省かれる。
// 村・門前と同じ六歩の見物場所を各戸の合流点にも確保する。位置は推定。
const PEOPLE_PLACES = [
  ...[...PEOPLE_PATHS, ...TEMPLE_PEOPLE_LANES].flatMap(path => [path[0], path[path.length - 1]]),
  ...PEOPLE_LANES.map(lane => lane[2]),
];
const PEOPLE_BANDS = PEOPLE_PATHS.map((path, i) => ({
  x: path[0][0], z: path[0][1], mode: 'watch',
  kinds: i === 0 ? ['farmer', 'farmer', 'woman', 'child', 'elder']
    : i === 1 ? ['farmer', 'townsman', 'merchant', 'woman', 'child']
      : ['monk', 'monk', 'townsman', 'merchant', 'woman', 'child', 'elder'],
  route: path.slice(1).map(([x, z]) => ({ x, z })),
  // 村裏・寺前は場内の退避場所。着いた瞬間に消さず、危険が迫ればまた逃げる。
  routeEnd: 'wait',
}));
// 百姓の家族も商いの家の者も、開戦前は戸口につながる畦から遠巻きに様子を見る。
// 南の軒先から北を見ると自分の家が遮るため、家並みの西の幹道へ出す。
// 北の戦場へ向け、兵・火が近づいた時は同じ畦を南の村裏へ逃げる。
// 河口の在所の生業・戸別の家族構成は推定。町人・商人を門前の見物だけにせず、
// 住む家と結ぶ。兵・火が迫れば戸口につながる畦を南へ逃げる。
// 共通の軽い民を使い、人数・近景の形を増やさず、兵の名簿へは加えない。
for (const [i, lane] of PEOPLE_LANES.entries()) {
  const path = PEOPLE_PATHS[VILLAGE_HOUSES[i][0] < 0 ? 0 : 1];
  const kind = i === 4 ? 'merchant' : i === 5 ? 'townsman' : 'farmer';
  PEOPLE_BANDS.push({
    x: lane[2][0], z: lane[2][1], mode: 'watch', facing: Math.PI,
    kinds: [kind, 'woman', i % 2 ? 'elder' : 'child'],
    // 既に畦へ出て見物しているため、最初の行き先は南の曲がり角。
    // 見物の中心を支点にすると、南に立った子も迫る兵の方へ戻ろうとして足止めされる。
    route: path.slice(2).map(([x, z]) => ({ x, z })),
    routeEnd: 'wait',
  });
}
// 門前の組に加え、僧や家族も木戸の外で初めから遠巻きに様子を見る。
// 門の正面へ全員を重ねず、兵や火が迫れば既存の門前の畦を南へ逃げる。
// 全体でも四十三人まで。共通の上限内に収め、形・材質・近景の人を使い回す。
for (const [i, lane] of TEMPLE_PEOPLE_LANES.entries()) {
  PEOPLE_BANDS.push({
    x: lane[0][0], z: lane[0][1], mode: 'watch',
    kinds: i === 0 ? ['monk', 'monk', 'elder', 'townsman'] : ['merchant', 'woman', 'child', 'elder'],
    route: lane.slice(1).map(([x, z]) => ({ x, z })),
    routeEnd: 'wait',
  });
}
// 門前から東岸の鉄砲衆（84,6）を見る線は、河畔の木立（90,40）を通る。
// 木戸の外から家並みと板囲いの間を北へ見て、夜の寄せ手が来る方をうかがう。
// 三組とも同じ通りを見通す配置は推定。家や木を動かさず、避難は南へ保つ。
const TEMPLE_PEOPLE_VIEW = { x: 128, z: 90 };
// 既存の六歩の広場内へ世帯ごとの立ち位置を分け、子・年寄りに歩調を合わせる。
// 細かな避難配置は推定。湿地の畦と寺の木戸の道順は共通の民の仕組みへ渡す。
for (const band of PEOPLE_BANDS) {
  // 戦う兵の平均位置ではなく、村は近い砦、寺前は寄せ手が通る北の野を見守る。
  // 南の戸口と畦から、退く道へ背を向けて遠巻きに見る。
  const view = band.x > 120 ? TEMPLE_PEOPLE_VIEW : band.x < -60 ? FUKU_GATE : NODA_GATE;
  band.facing = Math.atan2(view.x - band.x, view.z - band.z);
  band.refugeSpacing = 1.35;
  band.keepTogether = true;
  // 広場から逃げ直す時も、湿地を横切らず南の畦を使う。
  const end = band.route[band.route.length - 1];
  const road = PEOPLE_REFUGE_ROADS.find(path => path[0][0] === end.x && path[0][1] === end.z);
  // 同じ村の全世帯を場外の一点へ集めると、広場で分けた家族が出口で
  // また一列に詰まる。乾いた畦の幅の内側で、世帯ごとに退き口を分ける。
  // 一・二歩間隔では隣の世帯をよける余地が乏しいため、二・四歩に広げる。
  // 西と東の村は四世帯、門前は三組。最大でも中心から三・六歩に収め、
  // 道・人数・近景の形を増やさない。出口の細かな割り振りは推定。
  const families = PEOPLE_BANDS.filter(other => {
    const target = other.route[other.route.length - 1];
    return target.x === end.x && target.z === end.z;
  });
  const offset = (families.indexOf(band) - (families.length - 1) / 2) * 2.4;
  band.refugeRoute = road.slice(1).map(([x, z]) => ({ x: x + offset, z }));
}
// 民が通れる乾いた幅と、地面に描く道幅をそろえる。
// 既定の二歩幅のままだと、畦の脇を逃げる家族や分けた退き口が草地に見える。
// 道筋・通れる範囲は広げず、開戦時に既存の折れ線を一度だけ束ねる。
const PEOPLE_ROAD_HALF_WIDTH = 5;
const PEOPLE_GROUND_PATHS = [
  ...PEOPLE_PATHS, ...PEOPLE_LANES, ...PEOPLE_VILLAGE_ROADS,
  ...PEOPLE_REFUGE_ROADS, ...TEMPLE_PEOPLE_LANES,
].map(pts => ({ pts, w: PEOPLE_ROAD_HALF_WIDTH * 2 }));
function peopleRoadDistance(x, z) {
  let d = Infinity;
  for (const path of PEOPLE_GROUND_PATHS) d = Math.min(d, distToPolyline(x, z, path));
  return d;
}
function peoplePlace(x, z) {
  // 見物の輪と逃げ着く広場は、道の端へ散った女・子も水田や木へ埋めない広さにする。
  for (const p of PEOPLE_PLACES) if (Math.hypot(x - p[0], z - p[1]) < 6) return true;
  return false;
}
function villageGround(x, z) {
  for (const [hx, hz] of VILLAGE_HOUSES) if (Math.abs(x - hx) < 7 && Math.abs(z - hz) < 6) return true;
  return false;
}
// 控えや包囲の手も描画用の大軍なので、兵の名簿だけでは民が気付けない。
// 隊の中心ではなく列の縁までの距離を見る。避難中も同じ判定で列を避ける。
// 道筋は推定のまま、人数・戦闘・描画には手を加えない。
function peopleColumnCrosses(ax, az, bx, bz, x0, x1, z0, z1) {
  const vx = bx - ax, vz = bz - az;
  let enter = 0, leave = 1;
  if (Math.abs(vx) < 0.000001) {
    if (ax < x0 || ax > x1) return false;
  } else {
    const a = (x0 - ax) / vx, b = (x1 - ax) / vx;
    enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
  }
  if (Math.abs(vz) < 0.000001) {
    if (az < z0 || az > z1) return false;
  } else {
    const a = (z0 - az) / vz, b = (z1 - az) / vz;
    enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
  }
  return enter <= leave;
}
// 兵列に巻き込まれた民は、今いる所から近い縁へ抜ける。
// 行き先だけが列の外でも、途中で列の奥へ進んで反対側へ横断する道は認めない。
function peopleColumnLeaves(ax, az, bx, bz, x0, x1, z0, z1) {
  const gap = Math.min(ax - x0, x1 - ax, az - z0, z1 - az);
  return ax - x0 <= gap + 0.0001 && bx < ax - 0.0001 ||
    x1 - ax <= gap + 0.0001 && bx > ax + 0.0001 ||
    az - z0 <= gap + 0.0001 && bz < az - 0.0001 ||
    z1 - az <= gap + 0.0001 && bz > az + 0.0001;
}
// 畦の両端だけでなく、道中と兵列の角との最短距離も見る。
// 四角を一律に広げず、角を回る乾いた道の余裕を残す。入れ物は作らない。
function peopleColumnPathNear(ax, az, bx, bz, x0, x1, z0, z1, radius) {
  if (peopleColumnCrosses(ax, az, bx, bz, x0, x1, z0, z1)) return true;
  const r2 = radius * radius, vx = bx - ax, vz = bz - az, length2 = vx * vx + vz * vz;
  for (let i = 0; i < 2; i++) {
    const x = i ? bx : ax, z = i ? bz : az;
    const dx = x - Math.max(x0, Math.min(x1, x));
    const dz = z - Math.max(z0, Math.min(z1, z));
    if (dx * dx + dz * dz < r2) return true;
  }
  for (let i = 0; i < 4; i++) {
    const x = i & 1 ? x1 : x0, z = i & 2 ? z1 : z0;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / length2)) : 0;
    const dx = ax + vx * t - x, dz = az + vz * t - z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}
function peopleColumnDanger(rt, x, z, radius, stepFrom = null, stepTo = null) {
  const F = rt.flags;
  let best = radius, found = false;
  const point = F.peopleColumnPoint;
  if (!point) return null;
  for (const A of rt.world.armies || NO_GROUPS) {
    if (!A.mesh.visible || A.n <= (A.took || 0) ||
        A.routHide && A.U.uRoutT.value > A.routHide) continue;
    // 追従時の中心と facing は既に回転済み。中心を元の座標へ戻してから
    // 描画の変換を一度だけ掛ける。列の向きは作成時の向きから求める。
    const rc = Math.cos(A.mesh.rotation.y), rs = Math.sin(A.mesh.rotation.y);
    const localX = A.cx * rc - A.cz * rs, localZ = A.cx * rs + A.cz * rc;
    // people は非戦闘員の印ではなく、兵を一人ずつ配置した備。
    // その備だけ、初回に既存の配置から列の範囲を読む。毎回は走査しない。
    if (A.people && !A._nodaPeopleBounds) {
      const positions = A.body.instanceMatrix.array;
      const c = Math.cos(A.face0), s = Math.sin(A.face0);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < A.n; i++) {
        const dx = positions[i * 16 + 12] - localX, dz = positions[i * 16 + 14] - localZ;
        const x = dx * c - dz * s, z = dx * s + dz * c;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      A._nodaPeopleBounds = { x0: x0 - 1, x1: x1 + 1, z0: z0 - 1, z1: z1 + 1 };
    }
    // 追従する軍勢は組全体も動く。描画と同じ変換で列の位置・向きを読む。
    const probe = F.peopleColumnProbe;
    probe.set(localX + A.off.x, 0, localZ + A.off.z);
    A.mesh.localToWorld(probe);
    const facing = A.face0 + A.mesh.rotation.y;
    const c = Math.cos(facing), s = Math.sin(facing);
    const cx = probe.x, cz = probe.z;
    const dx = x - cx, dz = z - cz;
    const bounds = A._nodaPeopleBounds;
    // 後詰めは本隊より後方へ広がる。村の民がその列へ踏み込まないようにする。
    const hw = A.hw0 * (A.hostD ? 1.25 : 1);
    const lx = Math.max(bounds?.x0 ?? -hw, Math.min(bounds?.x1 ?? hw, dx * c - dz * s));
    const lz = Math.max(bounds?.z0 ?? -A.hd0 - (A.hostD || 0) - 1,
      Math.min(bounds?.z1 ?? A.hd0, dx * s + dz * c));
    const px = cx + lx * c + lz * s, pz = cz - lx * s + lz * c;
    if (stepFrom && stepTo) {
      const x0 = bounds?.x0 ?? -hw, x1 = bounds?.x1 ?? hw;
      const z0 = bounds?.z0 ?? -A.hd0 - (A.hostD || 0) - 1, z1 = bounds?.z1 ?? A.hd0;
      const ax = (stepFrom.x - cx) * c - (stepFrom.z - cz) * s;
      const az = (stepFrom.x - cx) * s + (stepFrom.z - cz) * c;
      if (ax >= x0 && ax <= x1 && az >= z0 && az <= z1) {
        // 兵列が民を覆った時、行き先の縁を「近づく兵」と見なすと出られない。
        // 列の中では最寄りの縁へ近づく一歩を認める。細長い列の中心からの
        // 距離だけでは、横へ抜けつつ列の中央寄りへ進む一歩まで塞いでしまう。
        const vx = (stepTo.x - stepFrom.x) * c - (stepTo.z - stepFrom.z) * s;
        const vz = (stepTo.x - stepFrom.x) * s + (stepTo.z - stepFrom.z) * c;
        if (!peopleColumnLeaves(ax, az, ax + vx, az + vz, x0, x1, z0, z1)) {
          point.x = px; point.z = pz; return point;
        }
        continue;
      }
      // 逃げる一歩は最寄りだけでなく全ての列を見る。別の列へ逃げ込ませない。
      const sx = stepFrom.x - px, sz = stepFrom.z - pz;
      const vx = stepTo.x - stepFrom.x, vz = stepTo.z - stepFrom.z;
      const length2 = vx * vx + vz * vz, dot = sx * vx + sz * vz;
      const start2 = sx * sx + sz * sz;
      const t = length2 > 0 ? Math.max(0, Math.min(1, -dot / length2)) : 0;
      const blocked = start2 < radius * radius
        ? dot < 0 || length2 + 2 * dot <= 0.01
        : (sx + vx * t) ** 2 + (sz + vz * t) ** 2 < radius * radius;
      // 長い避難路では両端から近い列の角だけを見ても、途中の横切りを見落とす。
      // 列と同じ向きへ道を戻し、線分全体が兵のいる範囲を通らないか調べる。
      // 列の中から外へ抜ける処理は上で済ませ、退く民を閉じ込めない。
      const nextX = ax + vx * c - vz * s, nextZ = az + vx * s + vz * c;
      const gapX = ax - Math.max(x0, Math.min(x1, ax));
      const gapZ = az - Math.max(z0, Math.min(z1, az));
      // 既に兵が迫った民は従来の離脱判定を使い、安全圏からは道中も間を空ける。
      const crosses = gapX * gapX + gapZ * gapZ < radius * radius
        ? peopleColumnCrosses(ax, az, nextX, nextZ, x0, x1, z0, z1)
        : peopleColumnPathNear(ax, az, nextX, nextZ, x0, x1, z0, z1, radius);
      if (blocked || crosses) {
        point.x = px; point.z = pz; return point;
      }
      continue;
    }
    const d = Math.hypot(x - px, z - pz);
    if (d >= best) continue;
    best = d; point.x = px; point.z = pz; found = true;
    if (d < 0.001) {
      // 列の内側では最寄り点が民自身になり、兵のいる向きが失われる。
      // 最も近い列の端とは逆側に危険を示し、短い方の退き口へ向かわせる。
      // 通れる一歩は従来どおり全ての列・兵・火で調べる。
      const x0 = bounds?.x0 ?? -hw, x1 = bounds?.x1 ?? hw;
      const z0 = bounds?.z0 ?? -A.hd0 - (A.hostD || 0) - 1, z1 = bounds?.z1 ?? A.hd0;
      let gap = lx - x0, tx = 1, tz = 0;
      if (x1 - lx < gap) { gap = x1 - lx; tx = -1; }
      if (lz - z0 < gap) { gap = lz - z0; tx = 0; tz = 1; }
      if (z1 - lz < gap) { tx = 0; tz = -1; }
      point.x = x + tx * c + tz * s;
      point.z = z - tx * s + tz * c;
    }
  }
  return found ? point : null;
}
// 夜の寄せ手の松明（大きさ〇・七）も、村・門前の民が避ける火に含める。
// 見物・歩く一歩・避難路の全てで同じ下限を使い、消えた火には反応しない。
const PEOPLE_FIRE_SIZE = 0.6;
// 軽い乱戦も兵のいる場所。前線の押し引きと後列を含め、村の避難路へ
// 入ってきた時は見物をやめる。兵の名簿・描画・斬り合いの人数は増やさない。
function peopleClashDanger(rt, x, z, radius, from = null, to = null) {
  const point = rt.flags.peopleClashPoint;
  let best = radius, found = false;
  for (const clash of rt.world.clashes || NO_GROUPS) {
    if (!clash.mesh.visible || !clash.blocks.length ||
        clash.A.alive <= 0 && clash.B.alive <= 0) continue;
    const c = Math.cos(clash.facing), s = Math.sin(clash.facing);
    let half = (clash.o.w || 60) / 2 + 1;
    const depth = (clash.o.gap ?? 3.4) / 2 - clash.app;
    let z0 = Infinity, z1 = -Infinity;
    for (const block of clash.blocks) {
      z0 = Math.min(z0, block.f - depth - clash.A.rows * 1.15 - 1);
      z1 = Math.max(z1, block.f + depth + clash.B.rows * 1.15 + 1);
    }
    // 組み合う列の後ろにも後詰めがいる。前列だけを避けて、その中へ
    // 見物の家族が入らないようにする。配置は初回だけ読み、形は増やさない。
    for (let side = 0; side < 2; side++) {
      const host = (side ? clash.B : clash.A).host;
      const body = host?.g.children[0];
      if (!body || !host.g.visible || host.U.uRout.value) continue;
      if (!host._nodaPeopleBounds) {
        const positions = body.instanceMatrix.array;
        let x0 = Infinity, x1 = -Infinity, back0 = Infinity, back1 = -Infinity;
        for (let i = 0; i < positions.length; i += 16) {
          const dx = positions[i + 12] - clash.x, dz = positions[i + 14] - clash.z;
          const lx = dx * c - dz * s, lz = dx * s + dz * c;
          x0 = Math.min(x0, lx); x1 = Math.max(x1, lx);
          back0 = Math.min(back0, lz); back1 = Math.max(back1, lz);
        }
        host._nodaPeopleBounds = { x0, x1, z0: back0, z1: back1 };
      }
      const bounds = host._nodaPeopleBounds;
      // 寄せ合い・押し引きに伴う組全体の移動も、今の位置へ合わせる。
      const shiftX = host.g.position.x * c - host.g.position.z * s;
      const shiftZ = host.g.position.x * s + host.g.position.z * c;
      half = Math.max(half, Math.abs(bounds.x0 + shiftX) + 1, Math.abs(bounds.x1 + shiftX) + 1);
      z0 = Math.min(z0, bounds.z0 + shiftZ - 1);
      z1 = Math.max(z1, bounds.z1 + shiftZ + 1);
    }
    const dx = x - clash.x, dz = z - clash.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const px = Math.max(-half, Math.min(half, lx)), pz = Math.max(z0, Math.min(z1, lz));
    if (from && to) {
      const ax = (from.x - clash.x) * c - (from.z - clash.z) * s;
      const az = (from.x - clash.x) * s + (from.z - clash.z) * c;
      const bx = (to.x - clash.x) * c - (to.z - clash.z) * s;
      const bz = (to.x - clash.x) * s + (to.z - clash.z) * c;
      if (ax >= -half && ax <= half && az >= z0 && az <= z1) {
        // 乱戦に覆われた民は、近い縁へ抜ける一歩を認める。
        if (peopleColumnLeaves(ax, az, bx, bz, -half, half, z0, z1)) continue;
      } else {
        const ex = ax - Math.max(-half, Math.min(half, ax));
        const ez = az - Math.max(z0, Math.min(z1, az));
        if (ex * ex + ez * ez < radius * radius) {
          const vx = bx - ax, vz = bz - az;
          if (ex * vx + ez * vz >= 0 && vx * vx + vz * vz > 0.0001 &&
              !peopleColumnCrosses(ax, az, bx, bz, -half, half, z0, z1)) continue;
        } else if (!peopleColumnPathNear(ax, az, bx, bz, -half, half, z0, z1, radius)) continue;
      }
      return point;
    }
    const distance = Math.hypot(lx - px, lz - pz);
    if (distance >= best) continue;
    let tx = px, tz = pz;
    if (distance < 0.001) {
      // 内側では自分自身を危険の中心にせず、最寄りの出口と逆を示す。
      const gap = Math.min(lx + half, half - lx, lz - z0, z1 - lz);
      if (gap === lx + half) tx = lx + 1;
      else if (gap === half - lx) tx = lx - 1;
      else if (gap === lz - z0) tz = lz + 1;
      else tz = lz - 1;
    }
    point.x = clash.x + tx * c + tz * s; point.z = clash.z - tx * s + tz * c;
    best = distance; found = true;
  }
  return found ? point : null;
}
// 大きい火は中心までの距離だけでなく、炎の広がりの外から避ける。
function peopleDanger(rt, x, z, radius) {
  let danger = peopleColumnDanger(rt, x, z, radius);
  let nearest = danger ? Math.hypot(danger.x - x, danger.z - z) : Infinity;
  const clash = peopleClashDanger(rt, x, z, radius);
  if (clash && Math.hypot(clash.x - x, clash.z - z) < nearest) {
    danger = clash; nearest = Math.hypot(clash.x - x, clash.z - z);
  }
  const point = rt.flags.peopleFirePoint;
  for (const fire of rt.world.fires || NO_GROUPS) {
    if (fire.lit === false || fire.size < PEOPLE_FIRE_SIZE) continue;
    const distance = Math.hypot(fire.x - x, fire.z - z);
    const edge = Math.max(0, distance - Math.max(0, fire.size - 1));
    if (edge < 22 && edge < nearest) {
      // 火の中心より兵が近くても、炎の縁が迫るなら火から先に離れる。
      // 共通の民の判定にも縁までの距離を渡す。炎の内側では、逃げる向きが
      // 逆転しないよう、現在地から中心側へわずかに戻した点を使う。
      const scale = distance > 0 ? Math.min(distance, Math.max(0.01, edge)) / distance : 0;
      point.x = x + (fire.x - x) * scale;
      point.z = z + (fire.z - z) * scale;
      danger = point; nearest = edge;
    }
  }
  return danger;
}
function peopleColumnEscapeClear(rt, from, to, radius) {
  const vx = to.x - from.x, vz = to.z - from.z, length2 = vx * vx + vz * vz;
  // 大きな火の縁を道の途中で横切らない。既に巻き込まれた民は外へ逃がす。
  for (const fire of rt.world.fires || NO_GROUPS) {
    if (fire.lit === false || fire.size < PEOPLE_FIRE_SIZE) continue;
    const safe = 10 + Math.max(0, fire.size - 1);
    const dx = from.x - fire.x, dz = from.z - fire.z;
    const dot = dx * vx + dz * vz, start2 = dx * dx + dz * dz;
    if (start2 < safe * safe) {
      if (dot < 0 || length2 + 2 * dot <= 0.01) return false;
    } else {
      const t = length2 > 0 ? Math.max(0, Math.min(1, -dot / length2)) : 0;
      if ((dx + vx * t) ** 2 + (dz + vz * t) ** 2 < safe * safe) return false;
    }
  }
  // 両端から列の縁を調べ、曲がった列の角も避ける。共用の点を使い回す。
  return !peopleColumnDanger(rt, from.x, from.z, radius, from, to) &&
    !peopleColumnDanger(rt, to.x, to.z, radius, from, to) &&
    !peopleClashDanger(rt, from.x, from.z, radius, from, to);
}
// 高だけの寺の囲いと裏通り。屋根を木が突き抜けず、内側を草原にしない。
const templeTownGround = (x, z) => x > 133 && x < 208 && z > 133 && z < 210;
// 本の足軽装束：煤けた鉄・革の胴と藍の小袖。所属は既存の旗で示す。
const ODA = { flag: 'oda', armor: 0x302720, lace: 0x615342, cloth: 0x26333a, haori: 0 };
// 三好は共通の装束表にないため、旗だけ渡すと織田の藍の威へ戻ってしまう。
// 遠景の三好勢と同じ煤けた具足へ。色は推定で、所属は三階菱の旗でも示す。
const MIYOSHI = { flag: 'miyoshi', armor: 0x35382c, lace: 0x6b6250, cloth: 0x3a342c, haori: 0 };
const NO_GROUPS = [];
const RETREAT_WAIT = 90;
const canJoin = (u) => u?.alive && !u.fleeing && !u.dying && !u.woundOut && !u.rearWound && !u.downed && !u.noTarget && !u.gone;
// 生き残りが別の場所で戦っていても、無人の詰め陣へ案内しない。
// 到着の判定と同じ十歩以内で、実際に迎えられる守兵だけを数える。
function campJoinAvailable(rt) {
  const guard = rt.flags.campA.guard;
  if (gone(guard)) return false;
  const point = rt.flags.campJoinPoint;
  return guard.units.some(u => canJoin(u) && Math.hypot(u.pos.x - ODA_JOIN.x, u.pos.z - ODA_JOIN.z) < 10 &&
    Math.abs(u.pos.y - point.y) < 3 && !rt.army.wallBetween(point, -1, u.pos) && !rt.army.terrainBlocks(point, u.pos));
}
// 安全な印は据え置く。味方が動くたびに追わせず、着いた場所で息を整えられるようにする。
// 敵の接近・味方の離脱・障害物は半秒ごとに読み直す。
function keepRecoveryPoint(rt, point, radius) {
  const p = rt.player.u;
  if (Math.hypot(point.x - 8, point.z - LEVEE_Z - 4) > radius ||
      Math.hypot(point.x - p.pos.x, point.z - p.pos.z) > 26 ||
      rt.army.wallBetween(p.pos, -1, point) || rt.army.terrainBlocks(p.pos, point)) return false;
  let foe = null, nearest = 45 * 45;
  for (const u of rt.army.units) {
    if (!u.alive || u.fleeing || u.noTarget || u.team === p.team || u.isStruct || u.civ ||
        u.type === 'dummy' || u.type === 'porter' || Math.abs(u.pos.y - point.y) > 3) continue;
    const d = (u.pos.x - point.x) ** 2 + (u.pos.z - point.z) ** 2;
    if (d < 9 * 9) return false;
    if (d < nearest) { nearest = d; foe = u; }
  }
  for (const fire of rt.world.fires) if (fire.lit && !fire.torch &&
      Math.hypot(fire.x - point.x, fire.z - point.z) < 2 + fire.size) return false;
  for (const u of rt.army.units) {
    if (u === p || u.team !== p.team || !canJoin(u) || u.isStruct || u.farSim || u.civ ||
        u.type === 'dummy' || u.type === 'porter' || u.group?.routed || u.group?.hidden ||
        u.stagger > 0 || u.hp < u.maxHp * 0.35 || Math.abs(u.pos.y - point.y) > 2.5 ||
        Math.hypot(u.pos.x - point.x, u.pos.z - point.z) > 6 || rt.army.wallBetween(u.pos, -1, point)) continue;
    if (!foe || (u.pos.x - point.x) * (foe.pos.x - point.x) +
        (u.pos.z - point.z) * (foe.pos.z - point.z) > 0) return true;
  }
  return false;
}
// 手当ての条件と同じく、敵から八メートルより離れ、六メートル内の味方に守られる場所を探す。
// 印と遊び手で同じ位置を使う。半秒ごとに読み、座標の入れ物は設営時の一つを使い回す。
function recoveryPoint(rt) {
  const F = rt.flags, p = rt.player.u, point = F.recoveryPoint;
  // 持ち場の縁の味方から五歩下がる分も含める。守る範囲と休む範囲を混同しない。
  const radius = F.step < 3 ? 48 : 28;
  if (rt.t < F.recoveryScanAt) return F.recoveryFound ? point : null;
  F.recoveryScanAt = rt.t + 0.5;
  if (F.recoveryFound && keepRecoveryPoint(rt, point, radius)) return point;
  F.recoveryFound = false;
  let best = Infinity;
  for (const mate of rt.army.units) {
    if (mate === p || mate.team !== p.team || !canJoin(mate) || mate.isStruct || mate.farSim || mate.civ ||
        mate.type === 'dummy' || mate.type === 'porter' || mate.group?.routed || mate.group?.hidden ||
        mate.stagger > 0 || mate.hp < mate.maxHp * 0.35 || Math.abs(mate.pos.y - p.pos.y) > 2.5 ||
        Math.hypot(mate.pos.x - 8, mate.pos.z - LEVEE_Z - 4) > radius ||
        Math.hypot(mate.pos.x - p.pos.x, mate.pos.z - p.pos.z) > 26) continue;
    let foe = null, nearest = 45 * 45;
    for (const enemy of rt.army.units) {
      if (!enemy.alive || enemy.fleeing || enemy.noTarget || enemy.team === p.team || enemy.isStruct || enemy.civ || enemy.type === 'dummy' || enemy.type === 'porter') continue;
      const d = (enemy.pos.x - mate.pos.x) ** 2 + (enemy.pos.z - mate.pos.z) ** 2;
      if (d < nearest && Math.abs(enemy.pos.y - mate.pos.y) <= 3) { nearest = d; foe = enemy; }
    }
    const dx = foe ? mate.pos.x - foe.pos.x : 0, dz = foe ? mate.pos.z - foe.pos.z : 1;
    const length = Math.hypot(dx, dz) || 1;
    const x = mate.pos.x + dx / length * 5.5, z = mate.pos.z + dz / length * 5.5;
    const d = (x - p.pos.x) ** 2 + (z - p.pos.z) ** 2;
    if (d >= best || Math.hypot(x - 8, z - LEVEE_Z - 4) > radius) continue;
    point.x = x; point.z = z; point.y = rt.world.heightAt(x, z);
    if (Math.abs(point.y - mate.pos.y) > 2.5 || rt.army.wallBetween(p.pos, -1, point) ||
        rt.army.wallBetween(mate.pos, -1, point) || rt.army.terrainBlocks(p.pos, point)) continue;
    let danger = false, nearFoe = null, nearDist = 45 * 45;
    for (const enemy of rt.army.units) {
      if (!enemy.alive || enemy.fleeing || enemy.noTarget || enemy.team === p.team || enemy.isStruct || enemy.civ || enemy.type === 'dummy' || enemy.type === 'porter' || Math.abs(enemy.pos.y - point.y) > 3) continue;
      const distance = (enemy.pos.x - x) ** 2 + (enemy.pos.z - z) ** 2;
      if (distance < 9 * 9) { danger = true; break; }
      if (distance < nearDist) { nearDist = distance; nearFoe = enemy; }
    }
    if (nearFoe && (mate.pos.x - x) * (nearFoe.pos.x - x) + (mate.pos.z - z) * (nearFoe.pos.z - z) <= 0) danger = true;
    if (!danger) for (const fire of rt.world.fires) {
      if (fire.lit && !fire.torch && Math.hypot(fire.x - x, fire.z - z) < 2 + fire.size) { danger = true; break; }
    }
    if (!danger) { best = d; F.recoveryFound = true; F.recoveryX = x; F.recoveryY = point.y; F.recoveryZ = z; }
  }
  if (!F.recoveryFound) return null;
  point.x = F.recoveryX; point.y = F.recoveryY; point.z = F.recoveryZ;
  return point;
}
// 負傷して遠くへ退く将を隊の中心に混ぜない。印・合流判定・遊び手は同じ兵を目指す。
// 追手と戦う一人より、道が通り、敵から離れた旗本を先に選ぶ。
// 半秒ごとに安全を読み直す。印だけは同じ兵の足元へ毎回合わせる。
function retreatGuardScore(rt, u, to) {
  if (!canJoin(u) || Math.abs(u.pos.y - to.y) >= 3 ||
      rt.army.wallBetween(to, -1, u.pos) || rt.army.terrainBlocks(to, u.pos)) return Infinity;
  const danger = rt.army.nearestEnemy(u, 8, enemy => canJoin(enemy) && !enemy.isStruct && !enemy.farSim &&
    enemy.type !== 'dummy' && !enemy.civ && Math.abs(enemy.pos.y - u.pos.y) < 3 &&
    !rt.army.wallBetween(u.pos, -1, enemy.pos) && !rt.army.terrainBlocks(u.pos, enemy.pos));
  return (u.pos.x - to.x) ** 2 + (u.pos.z - to.z) ** 2 + (danger ? 40000 : 0);
}
function retreatPoint(rt) {
  const F = rt.flags, g = F.namedGuards[1];
  if (gone(g)) return null;
  const to = rt.player.u.pos;
  if (rt.t >= (F.retreatScanAt || 0) || !F.retreatGuard || !canJoin(F.retreatGuard)) {
    F.retreatScanAt = rt.t + 0.5;
    // 安全な合流相手は保つ。隣の兵が一歩近づくたびに印を飛ばし、柵際を往復させない。
    let best = F.retreatGuard ? retreatGuardScore(rt, F.retreatGuard, to) : Infinity;
    if (best >= 40000) {
      F.retreatGuard = null; best = Infinity;
      for (const u of g.units) {
        const score = retreatGuardScore(rt, u, to);
        if (score < best) { best = score; F.retreatGuard = u; }
      }
    }
  }
  const guard = F.retreatGuard;
  if (!guard) return null;
  F.retreatPoint.x = guard.pos.x; F.retreatPoint.y = guard.pos.y; F.retreatPoint.z = guard.pos.z;
  return F.retreatPoint;
}
// 退く列は追手へ向き直って攻めず、乾いた道の合流場所で後続を待つ。
// 移動の下知だけでは近い敵への寄せや武将の前進が残るため、撤退の下知を使う。
function retreatColumn(g, to) {
  g.noAI = true; g.focus = null; g.commanderPush = null; g.frontlineMobilize = false;
  g.order = 'retreat'; g.dest = to; g.fire = false; g.aggro = 3;
  g.onArrive = (v) => { v.order = 'hold'; v.focus = null; };
  for (const u of g.units) if (canJoin(u)) { u.target = null; u.watch = null; u.aiT = 0; }
}
// 一揆の門徒：具足は軽く、鉢巻に、南無阿弥陀仏の旗
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, skin: 0xc49b78, hat: 'jingasa', flag: 'namu' };
function cappedList(rt, list) {
  let room = 225; // 新手を出す時だけ数え、味方の追いつく分を空ける。
  for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.farSim && u.type !== 'dummy') room--;
  return list.map((q) => { const n = Math.max(0, Math.min(q.n, room)); room -= n; return { ...q, n }; });
}
const enemyGroup = (rt, o, list) => spawnEnemy(rt, { fixed: true, formation: list.some(q => q.type === 'gun') ? 'line' : 'yari', ...o }, cappedList(rt, list));

// 共通の下知・声も、この戦の札と間隔へ揃える。ほかの戦には持ち越さない。
function installNodaNotices(rt) {
  const say = rt.say, bark = rt.bark, obj = rt.obj, dispose = rt.dispose;
  rt.hud.root.classList.add('nodafukushima');
  const hudUpdate = rt.hud.update;
  const drawTarget = new THREE.Vector3();
  // 描く直前と同じ視点を先に確定する。近い視点で足の輪だけが前の場所へ残らない。
  // 堤の地面を避けて視点が上がる場合も、札と兵に同じ補正を使う。
  const nodaHudUpdate = function (dt, battle) {
    if (battle === rt && rt.player?.u && !rt.game?.photo && !rt.game?.deployment) {
      const measure = rt.flags.drawView || (rt.flags.drawView = { groundGap: 0, waterGap: 0, interpolationGap: 0, lift: 0 });
      // 土手を避けて目線だけ上がっても、もとの注視点を保つ。
      // 本人と足元の印が画面の下へ押し出されないよう、同じ入れ物を使う。
      const camera = rt.camera, p = rt.player.u.pos;
      camera.getWorldDirection(drawTarget);
      drawTarget.multiplyScalar(Math.max(1, Math.hypot(camera.position.x - p.x, camera.position.z - p.z))).add(camera.position);
      if (guardDrawCamera(rt.world, camera, measure) > 0) {
        camera.lookAt(drawTarget);
        camera.updateMatrixWorld();
      }
    }
    return hudUpdate.call(this, dt, battle);
  };
  rt.hud.update = nodaHudUpdate;
  const notices = rt.hud.notices, push = notices.push;
  // 出血の説明で槍先を隠さない。操作と退く先を一文で示す。
  const nodaPush = function (text, priority, seconds, kind, valid) {
    if (text?.startsWith('血が止まらない')) {
      text = text.includes('使い切った') ? '出血。布がない。味方の後ろへ退け' : '味方の後ろへ退き、「血を止める」を三秒押せ';
    }
    return push.call(this, text, priority, seconds, kind, valid);
  };
  notices.push = nodaPush;
  let fireAt = -Infinity, ringAt = -Infinity;
  const heard = new Map(); // この戦だけの声の記録。百二十八件まで。
  const orderText = text => {
    if (!text) return text;
    text = text.replace(/影から出よ/g, '物陰へ退け');
    if (rt.flags.step === 2 && (rt.flags.assaultResting || rt.player.u.mobbed || rt.t < (rt.flags.assaultSafeUntil || 0))) {
      text = text.replace(/前は詰めよ|固まって進め|このまま押し切るぞ|崩れかけておる、休ませるな|玉込めの間に詰めよ|味方と寄せよ/g, '味方へ退け');
    }
    if (rt.flags.step < 3) return text;
    const order = rt.flags.retreating ? '列へ退け' : rt.flags.holdRest || rt.player.u.mobbed || rt.t < (rt.flags.holdSafeUntil || 0) ? '味方へ退け' : '追わず、味方の列を守れ';
    return text.replace(/前へ進め|前は詰めよ|固まって進め|このまま押し切るぞ|崩れかけておる、休ませるな|玉込めの間に詰めよ|味方と寄せよ|休ませるな|今のうちに寄せよ|備えが戻る前に押せ|組み直す前に突け|追え/g, order);
  };
  const allow = (text, speaker) => {
    if (!text) return false;
    // 危険の声も含め、同じ文は二分あける。別の下知は通す。
    if (rt.t - (heard.get(text) ?? -Infinity) < 120) return false;
    if (speaker === '前田利家' && /放て/.test(text)) {
      if (rt.t - fireAt < 30) return false;
      fireAt = rt.t;
    }
    if (/囲まれた|四方から敵|後ろにも敵|取り籠め|左右へ回られ|横へ回られる|脇へ回る敵/.test(text)) {
      if (rt.t - ringAt < 30) return false;
      ringAt = rt.t;
    }
    if (heard.size >= 128 && !heard.has(text)) heard.delete(heard.keys().next().value);
    heard.set(text, rt.t);
    return true;
  };
  rt.say = function (sp, text, dur) {
    if (sp === '本願寺の兵') text = text.replace(/前へ進め/g, '織田の堤へ掛かれ');
    if (!/本願寺|三好|一揆|斎藤/.test(sp)) text = orderText(text);
    if (sp === '斎藤の兵') sp = '三好の兵';
    // 生きた利家が仲間を悼む声は、本人の最期と取り違えない言葉にする。
    if (sp === '前田利家' && this.flags.maedaU?.alive) text = text.replace(/無念じゃ/g, '仲間の働きは忘れぬ');
    if (allow(text, sp)) return say.call(this, sp, text, dur);
  };
  rt.bark = function (text, warn) {
    // 敵の掛け声を、守る本人への前進命令と取り違えさせない。
    text = text.replace(/^本願寺の兵「前へ進め/g, '本願寺の兵「織田の堤へ掛かれ');
    if (!/^(本願寺|三好|一揆|斎藤)/.test(text)) text = orderText(text);
    text = text.replace(/^斎藤の兵「/, '三好の兵「');
    if (allow(text, '')) return bark.call(this, text, warn);
  };
  rt.obj = function (id, text, kind = 'main', local = false) {
    // 砦を落とさず囲みを解く戦。壊せない門の奥へ入る任務は出さない。
    if (id.startsWith('yagura_take_')) return;
    // 将の護衛・櫓など共通側の任務は、今の下知を押しのけない。
    if (id !== 'main') kind = 'side';
    return obj.call(this, id, text, kind, local);
  };
  const style = document.createElement('style');
  style.textContent = '#hud #objectives li.side:not(.done) .obj-text{font-size:13px;color:#b9b09c;line-height:1.6}#hud #objectives li.side:not(.done) .tag{font-size:0}#hud #objectives li.side:not(.done) .tag::after{content:"あとで";font-size:12px;color:#b9b09c}';
  // この戦で頼まれた引き戸の札は、戦場の札を隠す共通指定から除く。
  // 共通の近接判定と押す処理を使い、戸から離れた時や別の操作の札は表示しない。
  // 操作キーの英字を添えず、携帯でも押せる「開ける／閉める」だけにする。
  style.textContent += `
html body #hud.nodafukushima.field-clean #prompt:not([hidden]):has(>button[data-entry="naka_to"]) { display:block!important; }
html body #hud.nodafukushima #prompt>button[data-entry="naka_to"] { min-width:88px;min-height:44px;font-size:max(16px,calc(16px * var(--text-scale,1))); }
html body #hud.nodafukushima #prompt>button[data-entry="naka_to"] kbd { display:none!important; }
`;
  // 本文の分だけ高さを取り、釦までの大きな空白をなくす。長い本文だけを送る。
  // 共通の本文の基準が零なので、自動の高さと合わせて本文の実寸を基準にする。
  style.textContent += '@media(min-height:501px){html body #hud #intro:has(#intro-go)>.card.card{width:min(560px,calc(100vw - 32px));height:auto;max-height:72dvh;padding:16px 24px;gap:16px}html body #hud #intro:has(#intro-go) .intro-reading{flex:0 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}}';
  // 横持ちでは下知を広く取り、長い説明も出陣の釦の上で最後まで読めるようにする。
  // この戦を片付ける時に外すため、ほかの戦の札には持ち越さない。
  style.textContent += '@media(max-height:500px){html body #hud #intro>.card.card{width:min(560px,calc(100vw - 32px));height:auto;max-height:calc(100dvh - 16px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))!important;padding:12px 16px;display:flex;flex-direction:column;gap:8px}html body #hud #intro .intro-reading{flex:0 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}#hud #intro-go{flex-shrink:0}#hud #intro .card .sides{letter-spacing:0}}';
  // 隠れる先の案内中も、堤を守る下知は右上に残す。短い任務だけにして戦場を空ける。
  style.textContent += 'html body #hud.cover-guidance #battle-notices #objectives.keep-combat-task:not(.expand){display:block!important}html body #hud.compact-battle #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) li.cur small{display:none!important}';
  // 方位の帯の下・小地図の左へ。長い下知や警告が地図の兵を覆わない。
  style.textContent += '@media(min-width:901px) and (min-height:621px){html body #hud #battle-notices:not(.choosing){left:auto!important;right:calc(208px + env(safe-area-inset-right,0px))!important;top:104px!important;width:min(320px,28vw)!important;max-height:calc(100% - 300px)!important}}';
  // 大きな下知も欄内で折り返す。警告と任務はそれぞれ全文の高さを取り、重ねない。
  style.textContent += 'html body #hud #battle-notices #objectives.keep-combat-task:not(.expand) li.cur{height:auto!important;max-height:none!important;align-items:baseline;line-height:1.5!important}html body #hud #battle-notices #objectives.keep-combat-task:not(.expand) li.cur .obj-text{min-width:0!important;flex:1 1 0!important;max-width:100%;height:auto!important}html body #hud #battle-notices #objectives.keep-combat-task:not(.expand) li.cur .obj-now{display:block!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important;font-size:max(20px,calc(20px * var(--text-scale,1)))!important;line-height:1.5!important}html body #hud #battle-notices #battle-message>.battle-notice{position:relative!important;inset:auto!important;height:auto!important;max-height:none!important;white-space:normal!important;overflow-wrap:anywhere!important}';
  // パソコンの傷の説明を六十画素の欄へ押し込まず、体力の下の一行で読む。
  // 携帯と、体力だけの細い表示には共通の並びを使う。
  style.textContent += '@media(min-width:901px) and (min-height:621px){#hud:not(.lean) .bl #h-hp{grid-template-columns:34px minmax(0,1fr)}#hud:not(.lean) .bl #h-hp em{grid-column:1/-1;text-align:left;white-space:normal;overflow-wrap:normal;font-size:max(12px,calc(13px * var(--text-scale,1)));line-height:1.4}}';
  // 任務と警告は同じ欄の通常の流れへ。親からはみ出す大きな字を残さない。
  style.textContent += `
html body #hud #battle-notices:not(.choosing) { overflow-x:hidden; }
html body #hud #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
 font-size:max(16px,calc(18px * var(--text-scale,1)))!important; line-height:1.45!important;
 white-space:normal!important; overflow-wrap:anywhere!important; min-width:0!important;
}
html body #hud #battle-notices #battle-message { position:relative!important; inset:auto!important; flex-shrink:0; }
html body #hud #battle-notices #battle-message>.battle-notice { font-size:max(14px,calc(15px * var(--text-scale,1)))!important; line-height:1.5!important; }
/* 地面の印へ札を移す共通指定を戻す。欄の切り抜きで黒い端だけ残さない。 */
html body #hud.nodafukushima #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) {
 display:block!important; position:relative!important; inset:auto!important; transform:none!important;
 width:100%!important; min-width:0!important; max-width:100%!important;
 height:auto!important; min-height:44px!important; max-height:none!important; overflow:visible!important;
}
html body #hud.nodafukushima #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list,
html body #hud.nodafukushima #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list li.cur .obj-text {
 display:block!important;
}
html body #hud.nodafukushima #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list li.cur .obj-now {
 display:block!important; height:auto!important; max-height:none!important; overflow:visible!important;
 -webkit-line-clamp:unset!important; line-clamp:unset!important;
 white-space:normal!important; overflow-wrap:anywhere!important;
 font-size:max(18px,calc(18px * var(--text-scale,1)))!important; line-height:1.45!important;
}
/* 手当ての操作は下知と分け、末尾だけ次の行へ残さない。 */
html body #hud.nodafukushima #battle-notices #objectives:not(.expand) #obj-list li.cur .retreat-caption {
 display:block!important; font-size:max(14px,calc(15px * var(--text-scale,1)))!important;
 line-height:1.45!important; font-weight:normal!important; color:#b9b09c;
}
/* 一行目は下知、次の行は指の操作。同じ大きさの二枚の命令に見せない。 */
html body #hud.nodafukushima #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) .battle-action:not([hidden]) {
 font-size:max(14px,calc(15px * var(--text-scale,1)))!important;
 line-height:1.45!important; font-weight:normal!important; color:#b9b09c;
}
@media(min-width:901px) and (min-height:621px) {
 html body #hud.nodafukushima #battle-notices:not(.choosing),
 html body #hud.nodafukushima.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:auto!important; right:calc(208px + env(safe-area-inset-right,0px))!important; top:104px!important; width:min(300px,26vw)!important; max-height:32vh!important;
 }
}
/* 横持ちでは、下知と危険の声を二枚とも読める高さを取る。
   個々の札だけ伸ばしても、親の四分の一画面の上限で末尾が切れていた。 */
@media(max-height:500px) {
 /* 傷の長い文で列を押し広げず、棒・残りの数も同じ下地へ収める。 */
 html body #hud.nodafukushima .bl {
  width:max-content!important; max-width:calc(100vw - 32px)!important;
 }
 html body #hud.nodafukushima .bl #h-hp.hp {
  width:max-content!important; min-width:0!important; max-width:100%;
  grid-template-columns:minmax(0,1fr) max-content!important;
 }
 html body #hud.nodafukushima .bl #h-hp.hp .hp-remaining {
  font-size:max(18px,calc(18px * var(--text-scale,1)))!important;
 }
 html body #hud.nodafukushima .bl #h-hp.hp i { width:154px!important; height:12px!important; }
 html body #hud.nodafukushima .bl #h-hp.hp em {
  min-width:0; max-width:100%; white-space:normal!important;
  word-break:normal!important; overflow-wrap:anywhere!important;
  font-size:max(16px,calc(16px * var(--text-scale,1)))!important; line-height:1.5!important;
 }
 html body #hud.nodafukushima .bl #h-hp.hp em svg { width:18px; height:21px; }
 html body #hud.nodafukushima.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-now {
  font-size:max(18px,calc(18px * var(--text-scale,1)))!important; line-height:1.45!important;
 }
 html.touch body #hud #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  max-height:min(40dvh,calc(100dvh - var(--notice-top,60px) - env(safe-area-inset-top,0px) - var(--notice-floor,96px)))!important;
 }
 /* 指の絵で砦の門や寄せ手の頭を隠さない。案内の文字は元の大きさを保つ。 */
 html.touch body #hud .dodge-guide .escape-gesture > * { scale:.65; }
}
/* 稲生の標準：戦中は右上のミッション一行だけ。上の下知の札を mission-only の間は重ねない（10/23）。 */
html:root body #hud.nodafukushima.prog-on.mission-only #battle-notices:not(.choosing):has(#obj-list) > #objectives:not(.expand) {
 display:none !important;
}
`;
  document.head.appendChild(style);
  rt.dispose = function () {
    if (this.hud.update === nodaHudUpdate) this.hud.update = hudUpdate;
    if (notices.push === nodaPush) notices.push = push;
    this.hud.root.classList.remove('nodafukushima');
    style.remove(); this.flags.handGeo?.dispose(); this.flags.handMat?.dispose();
    for (const geo of this.flags.bellGeos || []) geo.dispose();
    this.flags.bellMat?.dispose();
    return dispose.call(this);
  };
}

// この戦の堤だけ、落ちた笠を縁の中心で傾け直す。落下時のみ計算する。
function installNodaFallenHats(rt) {
  const A = rt.army, W = rt.world, dropHat = A.dropHat;
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), turn = new THREE.Quaternion();
  A.dropHat = function (u) {
    if (u.hatOff) return;
    dropHat.call(this, u);
    const hat = u.hatOff;
    if (!hat?.isMesh) return;
    hat.updateMatrix(); point.set(0, 1.66, 0).applyMatrix4(hat.matrix);
    const x = point.x, z = point.z, y = u.pos.y, e = 0.4;
    normal.set(groundAt(W, x - e, z, y) - groundAt(W, x + e, z, y), 2 * e,
      groundAt(W, x, z - e, y) - groundAt(W, x, z + e, y)).normalize();
    // 共通の乱れた傾きを足さず、笠の縁を斜面へ寝かせる。
    hat.rotation.set(0, u.id * 2.4, 0);
    hat.quaternion.premultiply(turn.setFromUnitVectors(up, normal));
    hat.updateMatrix(); point.set(0, 1.66, 0).applyMatrix4(hat.matrix);
    hat.position.x += x - point.x; hat.position.z += z - point.z;
    hat.updateMatrix();
    const positions = hat.geometry.attributes.position;
    let lift = -Infinity;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(hat.matrix);
      lift = Math.max(lift, groundAt(W, point.x, point.z, y) + 0.01 - point.y);
    }
    if (Number.isFinite(lift)) hat.position.y += lift;
  };
}

// 目前で隠れる隊旗は竿ごと畳む。敵の旗も裸の横木だけ空へ残さない。
function installNodaStandards(rt) {
  const update = rt.updateStandards;
  rt.updateStandards = function (dt) {
    update.call(this, dt);
    for (const g of this.army.groups) {
      if (!g.stds) continue;
      for (const s of g.stds) {
        const d = s.userData.std;
        if (!d.down && (!d.cloth.visible || d.faintClothMat && d.cloth.material === d.faintClothMat)) s.visible = false;
      }
    }
  };
}

// 地面の矢の細い柄が携帯で消え、羽だけ浮いて見えるのを防ぐ。
// 飛ぶ矢と柵の矢は共通の処理。体の矢は手が空いた時に柄を折る。
function installNodaGroundFx(rt) {
  const pinArrow = rt.army.pinArrow, bakeArrow = rt.army.bakeArrow;
  rt.army.hooks.onArrowRain = function (volley, under) {
    if (!under || rt.t < 5 || rt.over || rt.ended) return;
    // 独立した中央の札は任務に重なる。既存の三枠と繰り返しの間隔へ揃える。
    rt.hud.notices.push('▲ 矢の雨。竹束の陰へ退け', 110, Math.max(3, volley.T + 0.4), 'warn', () => !rt.over && !rt.ended && rt.player.u.alive);
  };
  rt.army.pinArrow = function (a, life, parent, support) {
    const pinned = pinArrow.call(this, a, life, parent, support);
    if (pinned && a.groundPinned) { a.life = 0; a.mesh.visible = false; }
    // 本人だけでなく周りの生きた兵も、手が空いた時に柄を折る。
    // 傷・鏃は保つ。柵は対象外。馬や倒れた兵は共通の判定で折らない。
    if (pinned && parent && !support) a.snapT = this.time + 3.5;
    return pinned;
  };
  rt.army.bakeArrow = function (a) {
    if (a.groundPinned) { a.life = 0; return; }
    return bakeArrow.call(this, a);
  };
  // 既存の粒・材質を使い、松明からは出さず、風で野へ流さない。
  rt.world.updateEmbers = function (dt, focus) {
    if (!this.embers) {
      if (!this.fires.some(f => f.lit && !f.torch)) return;
      this.buildEmbers();
    }
    const E = this.embers;
    for (const f of this.fires) {
      if (!f.lit || f.torch || Math.hypot(f.x - focus.x, f.z - focus.z) > 60) continue;
      for (let n = dt * 3.5; n > 0; n--) {
        if (n < 1 && Math.random() > n) break;
        const i = E.i = (E.i + 1) % E.N, k = i * 3;
        E.pos[k] = f.x; E.pos[k + 1] = f.base + f.size * 0.3; E.pos[k + 2] = f.z;
        E.vel[k + 1] = 1.2 + Math.random() * 1.5;
        E.life[i] = 1 + Math.random();
      }
    }
    for (let i = 0; i < E.N; i++) {
      if (E.life[i] <= 0) continue;
      E.life[i] -= dt;
      if (E.life[i] <= 0) E.pos[i * 3 + 1] = -999;
      else E.pos[i * 3 + 1] += E.vel[i * 3 + 1] * dt;
    }
    E.pts.geometry.attributes.position.needsUpdate = true;
    E.pts.geometry.attributes.life.needsUpdate = true;
  };
}

// 遠い槍の長さは一隊につき一度だけ変える。新しい隊だけ一秒ごとに拾う。
function nodaPeople(rt) {
  const F = rt.flags;
  if (rt.t < (F.peopleAt || 0)) return;
  F.peopleAt = rt.t + 1;
  for (const A of rt.world.armies || []) {
    if (A._nodaSpears) continue;
    A._nodaSpears = true;
    for (const m of A.mesh.children) {
      const a = m.geometry?.getAttribute('aInfo');
      if (!a) continue;
      for (let i = 0; i < a.count; i++) if (a.getY(i) === 0) a.setW(i, 1.05 + (i % 5) * 0.14);
      a.needsUpdate = true;
    }
  }
  for (const a of rt.warPeople?.actors || []) {
    if (a.kind !== 'monk' || a._nodaFace) continue;
    a._nodaFace = true;
    const old = a.mesh, mesh = buildModel(a.u, { ...a.u.look, hat: 'jingasa', skin: 0xc49b78, cloth: 0x403b36, dirt: 0.15 });
    mesh.position.copy(old.position); mesh.rotation.copy(old.rotation); mesh.userData = old.userData;
    rt.scene.remove(old); rt.scene.add(mesh); a.mesh = mesh;
    // 広い袖の外へ手を出す。袖と一緒に動き、形と材質は僧同士で共有する。
    if (!F.handGeo) { F.handGeo = new THREE.SphereGeometry(0.055, 6, 4); F.handMat = new THREE.MeshLambertMaterial({ color: 0xc49b78 }); }
    for (const arm of [a.u.armL, a.u.armR]) { const hand = new THREE.Mesh(F.handGeo, F.handMat); hand.position.set(0, -0.49, 0.04); hand.scale.set(1, 1.35, 1); arm.add(hand); }
  }
}

// この戦だけの幕間。更新を止め、読んでいる間に兵が討たれるのを防ぐ。
// 巻き戻しの記録には幕の進みを入れず、終幕・戦の破棄で必ず外す。
const DAY_CUTS = new WeakMap();
function installDayCuts(rt) {
  const cut = { shade: null, t: 0, changed: false };
  DAY_CUTS.set(rt, cut);
  const update = rt.update, dispose = rt.dispose;
  rt.update = function (dt, input) {
    if (cut.shade) {
      if (this.over || !this.player.u.alive) {
        cut.shade.remove(); cut.shade = null;
      } else {
        cut.t += dt;
        if (!cut.changed && cut.t >= 0.8) {
          cut.changed = true;
          this.flags.day = cut.day;
          this.world.setTime(cut.time);
          // 空を替えるのは幕が覆った後。戦場を見せたまま昼夜を飛ばさない。
          this.world.fade = null;
          this.world.applyLook(this.world.lookOf(cut.time));
          this.world.updateEnv();
        }
        cut.shade.style.opacity = cut.still ? '1' : String(Math.max(0, Math.min(1, cut.t / 0.8, 5 - cut.t)));
        if (cut.t >= 5) {
          cut.shade.remove(); cut.shade = null;
          input?.clear?.();
        }
        return;
      }
    }
    return update.call(this, dt, input);
  };
  rt.dispose = function () {
    cut.shade?.remove(); DAY_CUTS.delete(this);
    return dispose.call(this);
  };
}

// 日付と経った日数を、五秒の暗転の中で読めるようにする。
function dayCut(rt, day, time, title, word) {
  if (rt.flags.ending || rt.over || !rt.player.u.alive) return;
  const cut = DAY_CUTS.get(rt), shade = document.createElement('div');
  cut.shade?.remove();
  cut.shade = shade; cut.t = 0; cut.changed = false;
  cut.day = day; cut.time = time; cut.still = reduceMotion();
  shade.style.cssText = `position:fixed;inset:0;background:#14120f;color:#ece4d2;opacity:${cut.still ? 1 : 0};z-index:40;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;box-sizing:border-box;text-align:center;pointer-events:auto`;
  shade.setAttribute('role', 'status');
  const date = document.createElement('div'), heading = document.createElement('div'), note = document.createElement('div');
  const passed = day - (rt.flags.day || 12);
  date.textContent = `九月${day}日${time === 'night' ? 'の夜' : ''}${passed > 0 ? `・${passed === 1 ? '一日' : passed + '日'}が過ぎた` : ''}`;
  date.style.cssText = 'font-size:16px;line-height:1.6;color:#c2a25a';
  heading.textContent = title;
  heading.style.cssText = 'font-size:24px;line-height:1.4';
  note.textContent = word;
  note.style.cssText = 'font-size:16px;line-height:1.6;max-width:32em';
  shade.append(date, heading, note);
  document.body.appendChild(shade);
}

// 共通の絵を使い、どの戦から始めても旗と指物に紋が出る
function sagarifujiTex() { return flagTexture('sagarifuji'); }
function namuTex() { return flagTexture('namu'); }

// 一本の太い三角を、途中から倒れる細い葉にする。設営時だけ既存の草の束へ足す。
function nodaBlade(points, x, y, z, dx, dz, h) {
  for (let j = 0; j < 3; j++) {
    const t = j / 3, next = (j + 1) / 3;
    const edge = (v, side) => {
      const bend = h * 0.65 * v * v, w = 0.012 * (1 - v);
      return [x + dx * bend - dz * w * side, y + h * (1.3 * v - 0.3 * v * v), z + dz * bend + dx * w * side];
    };
    points.push(...edge(t, -1), ...edge(t, 1), ...edge(next, -1),
      ...edge(t, 1), ...edge(next, 1), ...edge(next, -1));
  }
}

// 土塁は地形の盛りと土色で見せる。別の面を重ねると黒い帯と継ぎ目が残る。
// 矢玉を止める土塁の判定は残し、草だけ開戦時に一枚へまとめる。
function nodaLevee(rt) {
  const first = rt.scene.children.length;
  const wall = doruiLine(rt, LEVEE_DORUI, { w: 3, h: 0.7, name: '堤の土塁', noBatch: true, terrainFloor: true });
  const meshes = rt.scene.children.slice(first);
  for (const mesh of meshes) { rt.scene.remove(mesh); mesh.geometry.dispose(); }
  let seed = 157012;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x82714b, side: THREE.DoubleSide });
  const grass = [];
  for (let s = 0; s < meshes.length; s++) {
    const [ax, az] = LEVEE_DORUI[s], [bx, bz] = LEVEE_DORUI[s + 1];
    const len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
    const surface = (d, u) => {
      const x = ax + (bx - ax) * d / len + nx * (u * 3 - 0.3);
      const z = az + (bz - az) * d / len + nz * (u * 3 - 0.3);
      return [x, rt.world.heightAt(x, z) + 0.025, z];
    };
    // 踏まれた天端を避け、法面に低い枯れ草の房。一枚の形へまとめる。
    for (let i = 0; i < Math.ceil(len * 1.5); i++) {
      const [x, y, z] = surface(0.3 + rnd() * (len - 0.6), 0.38 + rnd() * 0.48);
      for (let b = 0; b < 5; b++) {
        const angle = rnd() * Math.PI * 2, dx = Math.cos(angle), dz = Math.sin(angle), h = 0.13 + rnd() * 0.22;
        nodaBlade(grass, x, y - 0.02, z, dx, dz, h);
      }
    }
  }
  // 堤と道の土色は地面そのものへ混ぜる。四角い貼り物と地形の交差を残さない。
  // 天端の通り道を空け、斜面の草は胸壁の草と一枚にまとめる。
  for (let i = 0; i < 320; i++) {
    // 房を大小の群落へ寄せ、法尻まで点々と等間隔に並べない。同じ葉の総数を使う。
    const cluster = i % 24;
    const cx = -44 + (cluster * 17 % 24) / 23 * 88;
    const x = cx + (rnd() - .5) * 5;
    const z = LEVEE_Z + (i % 2 ? 1 : -1) * (4 + (cluster % 5) * 1.6 + rnd() * 3);
    const y = rt.world.heightAt(x, z) + 0.025;
    for (let b = 0; b < 4; b++) {
      const angle = rnd() * Math.PI * 2, dx = Math.cos(angle), dz = Math.sin(angle), h = 0.16 + rnd() * 0.24;
      nodaBlade(grass, x, y, z, dx, dz, h);
    }
  }
  // 泥の通り道の縁へ、踏み倒された短い草を寄せる。胸壁と同じ一枚の形・材質へ入れる。
  for (let i = 0; i < 140; i++) {
    const x = (i % 2 ? -1 : 1) * (5 + rnd() * 12);
    const z = i < 48 ? -39 + rnd() * 5 : -16 + rnd() * 23;
    if (rt.world.inWaterAt(x, z) || rt.world.slopeTan(x, z) > .55) continue;
    for (let b = 0; b < 4; b++) {
      const angle = rnd() * Math.PI * 2;
      nodaBlade(grass, x, rt.world.heightAt(x, z) + .012, z,
        Math.cos(angle), Math.sin(angle), .06 + rnd() * .12);
    }
  }
  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(grass, 3)); grassGeo.computeVertexNormals();
  // 細い葉の裏側まで空の光を受け、斜面の房を黒い杭にしない。
  const grassNormals = grassGeo.attributes.normal;
  for (let i = 0; i < grassNormals.count; i++) grassNormals.setXYZ(i, 0, 1, 0);
  rt.scene.add(new THREE.Mesh(grassGeo, grassMat));
  const dispose = rt.dispose;
  rt.dispose = function () {
    grassGeo.dispose(); grassMat.dispose();
    return dispose.call(this);
  };
  return wall;
}

function baseHeight(x, z) {
  let h = 0.35 * Math.sin(x * 0.03 + 0.4) * Math.cos(z * 0.025) + 0.2 * Math.sin(z * 0.07 + x * 0.02);
  // 堤（川の南岸を東西に）。真ん中の持ち場は少し高く、背を平らに
  const lv = Math.exp(-((z - LEVEE_Z) ** 2) / 26) * Math.max(0, 1 - Math.max(0, Math.abs(x) - 120) / 30);
  h += 2.6 * lv;
  // 砦の島は少し高い
  h += 1.2 * Math.max(0, Math.min(1, (-(z + 36)) / 8)) * Math.max(0, 1 - Math.max(0, Math.abs(x) - 70) / 20);
  // 遠くの上町台地（本願寺）
  h += 12 * gauss(x, z, HONGAN.x, HONGAN.z, 5000);
  // 西の海へ低くなる岸。福島砦と浦江への既存の寄せ道より外に置く。
  if (x < SEA_EDGE + 10) h = Math.min(h, -2.4 + 2.5 * Math.max(0, Math.min(1, (x - SEA_EDGE + 8) / 18)));
  return h;
}
// 砦の水堀の窪み・堤の土塁の盛りを混ぜてから、二つの砦の曲輪を平らに（castle_plan の heightOf を重ねる）
const HORI_FNS = [...NODA_PLAN.hori, ...FUKU_PLAN.hori].map((q) => horiboriHeight(q.pts, { depth: q.deep ?? 2, width: q.w ?? 6 }));
const DORUI_H = doruiHeight(LEVEE_DORUI, { w: 3, h: 0.7 });
function withHori(x, z) { let h = baseHeight(x, z) + DORUI_H(x, z); for (const f of HORI_FNS) h += f(x, z); return h; }
let HEIGHT_FN = null;
// 虎口の切岸を道だけ緩い坂へ直す。高さ・幅は見た目と歩く地形が共有する。
// 支点・区間は最初の一回だけ作り、川と堤の区間は既存の浅瀬を残す。
function fortRoadHeight(raw) {
  const segs = [];
  // 多角形の境界点は内外判定で外になる場合がある。虎口の支点は曲輪の床へ合わせる。
  const anchor = (x, z) => {
    let y = null;
    for (const plan of [NODA_PLAN, FUKU_PLAN]) for (const k of plan.kuruwa) for (let i = 0; i < k.poly.length; i++) {
      const [ax, az] = k.poly[i], [bx, bz] = k.poly[(i + 1) % k.poly.length];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < .01) y = Math.max(y ?? -Infinity, k.level);
    }
    return y ?? raw(x, z);
  };
  for (const p of [...NODA_PLAN.paths, ...FUKU_PLAN.paths]) {
    for (let i = 0; i + 1 < p.pts.length; i++) {
      const [ax, az] = p.pts[i], [bx, bz] = p.pts[i + 1];
      if (az > -36 || bz > -36) continue;
      const dx = bx - ax, dz = bz - az;
      segs.push({ ax, az, dx, dz, l2: dx * dx + dz * dz || 1, ya: anchor(ax, az), yb: anchor(bx, bz), half: (p.w ?? 4) / 2 });
    }
  }
  return (x, z) => {
    if (z > -34 || z < -95 || x < -141 || x > 20 || (x > -106 && x < -20)) return raw(x, z);
    let h = raw(x, z), best = Infinity, road = null, t = 0;
    for (const q of segs) {
      const u = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
      const d = Math.hypot(x - q.ax - q.dx * u, z - q.az - q.dz * u);
      if (d < best) { best = d; road = q; t = u; }
    }
    if (road && best < road.half + 1.2) {
      const k = Math.max(0, Math.min(1, (road.half + 1.2 - best) / 1.2));
      h += (road.ya + (road.yb - road.ya) * t - h) * k * k * (3 - 2 * k);
    }
    return h;
  };
}
function height(x, z) {
  if (!HEIGHT_FN) { const noda = heightOf(NODA_PLAN, withHori, 3); HEIGHT_FN = fortRoadHeight(heightOf(FUKU_PLAN, noda, 3)); }
  return HEIGHT_FN(x, z);
}
// 据えた盾を消さず、その端を回って浅瀬と堤を行き来する。
function tabaWay(army, u, want) {
  const p = u.pos;
  let way = u._tabaWay;
  if (way?.s && (!way.s.alive || Math.hypot(want.x - way.gx, want.z - way.gz) > 3)) way.s = null;
  if (way?.s) {
    if (Math.hypot(p.x - way.x, p.z - way.z) < 1.05) {
      if (!way.cross) { way.cross = true; way.z = way.sz - way.side * 2; }
      else way.s = null;
    }
    if (way.s) return way;
  }
  let blocked = null, nearest = Infinity;
  const dz = want.z - p.z;
  if (Math.abs(dz) < 0.001) return want;
  for (const s of army.structs) {
    if (!s.alive || s.opened || s.name !== '竹束' || !s.seg) continue;
    const [ax, az, bx] = s.seg, t = (az - p.z) / dz;
    if (t <= 0 || t >= 1 || t >= nearest) continue;
    const x = p.x + (want.x - p.x) * t;
    if (x < ax - 0.5 || x > bx + 0.5) continue;
    blocked = s; nearest = t;
  }
  if (!blocked) return want;
  if (!way) way = u._tabaWay = {};
  const [ax, az, bx] = blocked.seg;
  way.s = blocked; way.gx = want.x; way.gz = want.z; way.sz = az;
  way.side = p.z > az ? 1 : -1; way.cross = false;
  way.x = Math.abs(p.x - (ax - 2)) < Math.abs(p.x - (bx + 2)) ? ax - 2 : bx + 2;
  way.z = az + way.side * 2;
  return way;
}
// 部隊（butai.js）の本物の兵を、決めた数より増やさない（味方は遠くで戦う軽い作りのまま。ごちゃごちゃさせない）
function capReal(b, n) {
  b._mapPos = { x: 0, z: 0 };
  if (b.light && b.light.army) b.light.army.noWake = true;   // 軽い大軍は近づいても本物の兵に化けさせない（本物は部隊が決めた数だけ）
  b._autoSwitch = function (dt) {
    this._swT -= dt || 0.05;
    if (this._swT > 0) return;
    this._swT = 1.2;
    const have = this.realCount(), want = Math.min(n, this.aliveNominal());
    if (have > want) this.shrinkReal(have - want);
    else if (have < want && this.cmd.id === 'attack') this.growReal(Math.min(3, want - have));
  };
  return b;
}
// 軽い部隊の今の真ん中（本物が居なければ、軽い大軍の動いた先）
function bPos(b) {
  if (b.real && b.real.count) return b.pos;
  if (b.light && b.light.army) { const A = b.light.army, p = b._mapPos; p.x = A.cx + (A.off ? A.off.x : 0); p.z = A.cz + (A.off ? A.off.z : 0); return p; }
  return b.pos;
}
const bDead = (b) => !b || b.aliveNominal() <= 0;
function bDist(a, b) { const p = bPos(a), q = bPos(b); return Math.hypot(p.x - q.x, p.z - q.z); }

// 資料の弾除け竹束：長い竹の束を縦に並べ、横木と縄、後ろの支えで保つ。
// この戦専用の形を一度だけ作り、据え置き・運搬・敵の盾で共用する。
let NODA_TABA_GEO = null;
function nodaTabaGeo() {
  if (NODA_TABA_GEO) return NODA_TABA_GEO;
  const parts = [], color = new THREE.Color();
  const put = (geo, hex) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    color.setHex(hex);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(g);
  };
  for (let k = 0; k < 5; k++) {
    const x = (k - 2) * 0.34;
    for (let j = 0; j < 7; j++) {
      const h = 1.72 + (k % 3) * 0.04 + (((j * 3 + k) % 5) - 2) * 0.017;
      const angle = j * Math.PI / 3, r = j === 6 ? 0 : 0.105;
      const bx = x + Math.cos(angle) * r, bz = Math.sin(angle) * r;
      const bamboo = new THREE.CylinderGeometry(0.054, 0.06, h, 6);
      bamboo.translate(bx, h / 2, bz); put(bamboo, [0x7b7c49, 0x858451, 0x727543][(k + j) % 3]);
      // 節をずらし、切り口も揃えすぎない。一度だけ束の形へまとめる。
      for (let y = 0.22 + ((k + j) % 4) * 0.045; y < h - 0.1; y += 0.34) {
        const node = new THREE.CylinderGeometry(0.062, 0.064, 0.018, 6);
        node.translate(bx, y, bz); put(node, 0x626b3c);
      }
      const hole = new THREE.CircleGeometry(0.034, 6);
      hole.rotateX(-Math.PI / 2); hole.translate(bx, h + 0.002, bz); put(hole, 0x3e3422);
    }
    for (const y of [0.42, 1.22]) {
      const rope = new THREE.CylinderGeometry(0.177, 0.177, 0.075, 10, 1, true);
      rope.translate(x, y, 0); put(rope, 0x9b8458);
    }
  }
  for (const y of [0.42, 1.22]) {
    const rail = new THREE.CylinderGeometry(0.045, 0.045, 1.9, 6);
    rail.rotateZ(Math.PI / 2); rail.translate(0, y, 0.2); put(rail, 0x777346);
  }
  for (const x of [-0.58, 0.58]) {
    const brace = new THREE.CylinderGeometry(0.04, 0.05, Math.hypot(1.25, 1.1), 6);
    brace.rotateX(-Math.atan2(1.1, 1.25)); brace.translate(x, 0.625, 0.75); put(brace, 0x777346);
  }
  NODA_TABA_GEO = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return NODA_TABA_GEO;
}
function addNodaTaba(rt, x, z, team, options) {
  const tb = addTaba(rt, x, z, team, options);
  tb.m.geometry = nodaTabaGeo();
  registerTabaCamera(rt, tb.m);
  return tb;
}
// 運ぶ束と据えた束の両方を視点の障害物にする。位置と向きは実物から読む。
function registerTabaCamera(rt, mesh) {
  (rt.flags.cameraTabas || (rt.flags.cameraTabas = [])).push(mesh);
}
// 材質は共通のものを使い回す。
// rot は今までどおり「前を向ける向き」（Math.PI＝北の砦の側）
function takeTaba(W, x, z, rot = 0) {
  const m = new THREE.Mesh(nodaTabaGeo(), tabaMat());
  m.castShadow = true;
  m.rotation.set(0, rot + Math.PI, 0);
  m.position.set(x, W.heightAt(x, z), z);
  return m;
}

// 板倉脇の材木・板の作業台、退き口の槍架。中央の道と建物の戸口を空ける。
// 寸法と位置は推定。すべて同じ箱と材質を共有し、一束で描く。
function nodaFieldTools(rt) {
  const pieces = [];
  const box = (x, y, z, w, h, d, rot = 0, pitch = 0, color = 0x80705a) => pieces.push([x, y, z, w, h, d, rot, pitch, color]);
  // 岡崎の作事場のように、製材した板と未製材の丸太を分けて積む。
  // 六角柱を三か所で共用し、木口だけ淡くする。作るのは高の設営時だけ。
  const logGeo = new THREE.CylinderGeometry(.12, .135, 1, 6);
  const logColors = new Float32Array(logGeo.attributes.position.count * 3), shade = new THREE.Color();
  for (let i = 0; i < logGeo.attributes.position.count; i++) {
    shade.setHex(Math.abs(logGeo.attributes.normal.getY(i)) > .9 ? 0xa08b68 : 0x625642);
    logColors.set([shade.r, shade.g, shade.b], i * 3);
  }
  logGeo.setAttribute('color', new THREE.BufferAttribute(logColors, 3));
  const logMeshes = [], pose = new THREE.Object3D();
  for (const [x, z] of [[-10, -76], [-139, -82], [ODA_HONJIN.x + 10, ODA_HONJIN.z - 5]]) {
    // 三か所を一つの範囲にすると、画面外の材木まで描いてしまう。
    // 原形と材質は共用したまま、資材置き場ごとに視界から外せる束にする。
    const logs = new THREE.InstancedMesh(logGeo, castleMat('wood'), 12);
    let logIndex = 0;
    const y = rt.world.heightAt(x, z);
    for (const dx of [-1.1, 1.1]) box(x + dx, y + .12, z, .2, .24, 1.7);
    for (let i = 0; i < 7; i++) box(x, y + .3 + Math.floor(i / 3) * .17, z + (i % 3 - 1) * .42, 3.3 - (i % 2) * .25, .14, .36);
    // 写真の裏方小屋のように、資材の上だけを板屋根で覆う。作業台と通りは外へ出す。
    // 柱は四本とも地形に埋め、壁を張らない。場所・寸法は推定。
    for (const dx of [-1.7, 1.7]) for (const dz of [-.85, .85]) {
      const ground = rt.world.heightAt(x + dx, z + dz), top = y + 2.23;
      box(x + dx, (ground - .2 + top) / 2, z + dz, .13, top - ground + .2, .13, 0, 0, 0x655541);
    }
    for (const dz of [-.85, .85]) box(x, y + 2.17, z + dz, 3.8, .15, .14, 0, 0, 0x554631);
    for (const side of [-1, 1]) for (let i = 0; i < 10; i++) {
      box(x - 1.9 + (i + .5) * .38, y + 2.34, z + side * .54,
        .37, .055, 1.16, 0, side * .3, i % 3 ? 0x81705a : 0x9a866a);
    }
    box(x, y + 2.53, z, 4, .09, .16, 0, 0, 0x584b39);
    for (const dx of [-1, 1]) for (const dz of [-.4, .4]) box(x + dx, y + .48, z + 2.7 + dz, .12, .96, .12);
    for (let i = 0; i < 4; i++) box(x, y + .99, z + 2.2 + i * .32, 2.6, .08, .3);
    // 資材小屋の横。戸口・梯子・作業台の前へは張り出さない。
    const lx = x + 2.9, ly = Math.max(rt.world.heightAt(lx, z - .9), rt.world.heightAt(lx, z + .9));
    for (const dz of [-.6, .6]) box(lx, ly + .09, z + dz, 1.7, .18, .16, 0, 0, 0x514432);
    for (const dx of [-.85, .85]) box(lx + dx, ly + .26, z, .09, .65, .1, 0, 0, 0x65533c);
    for (let row = 0; row < 3; row++) {
      const count = 6 - row * 2;
      for (let j = 0; j < count; j++) {
        pose.position.set(lx + (j - (count - 1) / 2) * .255,
          ly + .31 + row * .225, z + ((j + row) % 3 - 1) * .055);
        pose.rotation.set(Math.PI / 2, 0, ((j + row) % 3 - 1) * .025);
        pose.scale.set(1, 1.65 + (j % 3) * .12, 1); pose.updateMatrix();
        logs.setMatrixAt(logIndex++, pose.matrix);
      }
    }
    logs.receiveShadow = true; logs.matrixAutoUpdate = false;
    logs.computeBoundingSphere(); rt.scene.add(logs); logMeshes.push(logs);
  }
  const dispose = rt.dispose;
  rt.dispose = function () { for (const mesh of logMeshes) mesh.dispose(); logGeo.dispose(); return dispose.call(this); };
  const x = ODA_HONJIN.x - 10, z = ODA_HONJIN.z - 5, y = rt.world.heightAt(x, z);
  for (const dx of [-1.8, 1.8]) {
    box(x + dx, y + .8, z, .15, 1.9, .15);
    box(x + dx, y + .12, z, .35, .2, 1.6);
  }
  box(x, y + 1.35, z, 4.1, .14, .14);
  for (let i = 0; i < 9; i++) box(x - 1.5 + i * .36, y + 1.65, z + .12, .045, 3.3, .045);
  // 写真の井楼の囲いにも使う板盾を、詰め陣の脇で修理待ちにする。
  // 兵の列と退き道から外した道具置き。紋を描かず、木地・横桟・縄留めだけを組む。
  for (let i = 0; i < 4; i++) {
    const sx = ODA_HONJIN.x + 9 + i * 1.1, sz = ODA_HONJIN.z + 5;
    const sy = rt.world.heightAt(sx, sz), pitch = -.16;
    for (let j = 0; j < 4; j++) box(sx + (j - 1.5) * .23, sy + .83, sz,
      .218, 1.65 - (j % 2) * .035, .055, 0, pitch, [0x81705a, 0x73604c, 0x938063, 0x786854][(i + j) % 4]);
    for (const h of [.32, 1.24]) {
      const pz = sz - Math.sin(pitch) * (h - .83) - .075;
      box(sx, sy + h, pz, 1.01, .085, .075, 0, pitch, 0x514532);
      for (const dx of [-.28, .28]) box(sx + dx, sy + h, pz - .045, .032, .15, .028, 0, pitch, 0xa08c65);
    }
    // 背の控えは通路側に張り出さない短いもの。
    box(sx, sy + .33, sz - .32, .09, .72, .09, 0, -.65, 0x65543e);
  }
  // 岡崎の写真の足元の板盾囲い。奥の井楼二基だけ三方を低く囲う。
  // 南の梯子と足元の寄せ道は丸ごと空け、既存の兵の広場へ張り出さない。
  for (const [x, z] of [[-10, -90], [-144, -79]]) {
    for (const [ax, az, bx, bz] of [[x - 2.1, z + 1.5, x - 2.1, z - 2.1],
      [x - 2.1, z - 2.1, x + 2.1, z - 2.1], [x + 2.1, z - 2.1, x + 2.1, z + 1.5]]) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / .95);
      const tx = (bx - ax) / len, tz = (bz - az) / len, rot = Math.atan2(-tz, tx);
      for (let i = 0; i < n; i++) {
        const cx = ax + (bx - ax) * (i + .5) / n, cz = az + (bz - az) * (i + .5) / n;
        const y = rt.world.heightAt(cx, cz), w = len / n - .045, h = 1.25 + (i % 3) * .04;
        for (let j = 0; j < 4; j++) {
          const offset = (j - 1.5) * w / 4;
          box(cx + tx * offset, y + h / 2, cz + tz * offset, w / 4 - .012, h, .055,
            rot, 0, [0x77634c, 0x8a765a, 0x685944][(i + j) % 3]);
        }
        // 横桟と縄留めを内へ向け、表は木地の縦板を見せる。
        for (const yy of [.26, .99]) {
          box(cx - tz * .07, y + yy, cz + tx * .07, w, .085, .08, rot, 0, 0x514532);
          for (const off of [-w * .3, w * .3]) box(cx + tx * off - tz * .12,
            y + yy, cz + tz * off + tx * .12, .028, .15, .025, rot, 0, 0xa08c65);
        }
      }
      solidSeg(ax, az, bx, bz, .1);
    }
  }
  // 一枚の長い板に見えていた番所・長屋の屋根に、短い差し替え板と千鳥の継ぎ目。
  // 共通の屋根と同じ勾配・軒幅を使い、棟や押さえ桟の間へ薄く重ねる。
  const houses = [...FORT_BUILDINGS, ...FORT_STORES.map(([x, z, w, d]) => ({ x, z, w, d }))];
  houses.forEach((b, k) => {
    const lv = rt.flags.fortHouses[k].naka.levels[0], base = lv.y - .55;
    // 共通の長屋は戸口に掛かる一間を丸ごと省くため、扉の脇だけ平らな面が残る。
    // 省かれた一間の両端へ縦板を張り、幅1.6mの戸口と上の通りは空ける。
    const bays = Math.max(2, Math.round(b.w / 3)), bw = b.w / bays;
    for (let i = 0; i < bays; i++) {
      const c0 = -b.w / 2 + i * bw + .12, c1 = c0 + bw - .24, cm = (c0 + c1) / 2;
      if (!(cm > -1.6 && cm < 1.6)) continue;
      for (const [lo, hi] of [[c0, Math.min(c1, -.8)], [Math.max(c0, .8), c1]]) {
        if (hi <= lo) continue;
        const count = Math.ceil((hi - lo) / .28), step = (hi - lo) / count;
        for (let j = 0; j < count; j++) {
          const px = b.x + lo + (j + .5) * step, pz = b.z + b.d / 2 + .1;
          box(px, base + 1.55, pz, step - .012, 2.15, .065, 0, 0,
            (j + k) % 3 ? 0x71604c : 0x86745c);
          box(px, base + .63, pz + .008, step - .014, .3, .07, 0, 0, 0x4c4435);
        }
      }
    }
    // 一枚だった縁板も短い板の目地で区切る。薄い面で既存の床へ重ねる。
    const porchN = Math.ceil((b.w + .6) / .3);
    for (let j = 1; j < porchN; j++) box(b.x - (b.w + .6) / 2 + j * (b.w + .6) / porchN,
      base + .443, b.z + b.d / 2 + .6, .012, .008, 1.17, 0, 0, 0x3e3529);
    // 長浜の家並みの小さな下屋を参考に、番所・長屋の戸口だけ片流れの板庇を掛ける。
    // 主屋の屋根と二段の踏み台は保ち、支柱を立てずに出入りの幅を残す。寸法は推定。
    if (b.kind === 'bansho' || b.kind === 'nagaya') {
      const pitch = .22, cz = b.z + b.d / 2 + .61;
      for (let j = 0; j < 7; j++) box(b.x + (j - 3) * .3, base + 2.84, cz,
        .288, .055, 1.15, 0, pitch, j % 3 ? 0x74634b : 0x8a7558);
      for (const dz of [-.38, .38]) box(b.x, base + 2.89 - Math.tan(pitch) * dz,
        cz + dz, 2.17, .065, .07, 0, pitch, 0x514430);
      for (const dx of [-.98, .98]) {
        box(b.x + dx, base + 2.73, cz, .1, .12, 1.19, 0, pitch, 0x5c4c37);
        box(b.x + dx, base + 2.54, cz - .25, .085, .1, .7, 0, -.65, 0x65533d);
      }
    }
    // 高床の戸口まで土から一足で飛び上がる形をなくし、板縁へ二段の踏み台を置く。
    // 既存の戸口幅内・軒先だけに収める。裏通りと兵の広場へは張り出さない。
    for (let j = 0; j < 2; j++) {
      const pz = b.z + b.d / 2 + 1.39 + j * .38;
      const top = base + .28 - j * .14, ground = rt.world.heightAt(b.x, pz);
      const bottom = Math.min(ground - .04, top - .08);
      box(b.x, (top + bottom) / 2, pz, 1.5, top - bottom, .4, 0, 0, 0x584a37);
      for (const dx of [-.5, 0, .5]) box(b.x + dx, top + .025, pz, .484, .05, .43,
        0, 0, dx === 0 ? 0x87745a : 0x746149);
    }
    // 妻の三角だけでなく、その下も縦板にする。下端の泥染みと横桟を別の板へまとめる。
    // 短辺の補修板も実際の窓割りで抜く。内障子を開けた奥へ板壁を残さない。
    const boards = Math.ceil(b.d / .3), width = b.d / boards;
    for (const side of [-1, 1]) {
      const px = b.x + side * (b.w / 2 + .09);
      const windows = SETTINGS.quality === 'high' ? lv.windows.filter(v => v.face === 'x' && v.s === side) : [];
      for (let j = 0; j < boards; j++) {
        const center = -b.d / 2 + (j + .5) * width, pz = b.z + center;
        const bottom = .48 + (j % 3) * .035;
        const holes = windows.map(v => ({ t0: v.t - v.w / 2 - center, t1: v.t + v.w / 2 - center,
          y0: .55 + v.y0 - bottom, y1: .55 + v.y1 - bottom }));
        for (const [a, c, lo, hi] of facePanels(width - .014, 2.86 - bottom, holes)) {
          box(px, base + bottom + (lo + hi) / 2, pz + (a + c) / 2, .055, hi - lo, c - a,
            0, 0, [0x756450, 0x685846, 0x7c6c58][(j + k) % 3]);
        }
        box(px + side * .008, base + bottom + .14, pz, .06, .28, width - .018, 0, 0, 0x4a4235);
      }
      // 切り欠きの四周を框で受ける。既存の格子と内障子には重ねず、外の板面だけを納める。
      for (const v of windows) {
        const x = px + side * .04, cy = base + .55 + (v.y0 + v.y1) / 2;
        for (const edge of [-1, 1]) box(x, cy, b.z + v.t + edge * (v.w / 2 + .04),
          .1, v.y1 - v.y0, .08, 0, 0, 0x514532);
        for (const h of [v.y0 - .04, v.y1 + .04]) box(x, base + .55 + h, b.z + v.t,
          .1, .08, v.w + .16, 0, 0, 0x514532);
      }
      // 板倉の軒下の通風口も横桟で塞がない。補修板と同じ窓割りで桟を切り、
      // 外から見える穴・室内の穴・格子の当たりをそろえる。
      for (const h of [.86, 2.58]) {
        const bottom = h - .0425;
        const holes = windows.map(v => ({ t0: v.t - v.w / 2, t1: v.t + v.w / 2,
          y0: .55 + v.y0 - bottom, y1: .55 + v.y1 - bottom }));
        for (const [a, c, lo, hi] of facePanels(b.d + .1, .085, holes))
          box(px + side * .045, base + bottom + (lo + hi) / 2, b.z + (a + c) / 2,
            .09, hi - lo, c - a, 0, 0, 0x514532);
      }
    }
    const rw = b.w + 1.2, rd = b.d + 1.2, pitch = .36;
    // 写真の板屋根の軒裏には細い垂木の木口が続く。板の補修跡とは別に下地を通す。
    // 屋根の下へ収め、軒先から棟まで同じ勾配。形は既存の箱の束を共有する。
    const rafters = Math.ceil((rw - .3) / .85);
    for (const side of [-1, 1]) for (let i = 0; i <= rafters; i++) {
      box(b.x - rw / 2 + .15 + i * (rw - .3) / rafters,
        base + 3.08 + Math.tan(pitch) * rd / 4 - .1, b.z + side * rd / 4,
        .105, .12, rd / 2 / Math.cos(pitch), 0, side * pitch,
        i % 3 ? 0x594a36 : 0x706047);
    }
    const n = Math.ceil(rw / .45), step = rw / n;
    for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
      const px = b.x - rw / 2 + (i + .5) * step;
      const offset = rd * (i % 2 ? .27 : .21);
      const py = base + 3.08 + Math.tan(pitch) * (rd / 2 - offset);
      // 明るい木地を少し残した補修板。全面を新材の色にはしない。
      const repaired = (i + k) % 4 === 0;
      if (repaired) box(px, py + .047, b.z + side * offset,
        step - .02, .024, .64, 0, side * pitch, 0x9a866b);
      box(px, py + (repaired ? .064 : .044), b.z + side * offset,
        step - .025, .012, .018, 0, side * pitch, 0x463b2e);
    }
  });
  nodaCookhouses(rt, pieces);
  nodaTimberBatch(rt, pieces);
}

// 清洲の写真の裏方小屋と、野戦兵器の写真の露出した木組みを陣の炊事場へ。
// 位置・寸法は推定。既存の二つの薪火を使い、煙・光・兵・毎コマの処理は増やさない。
// 南の畦道（x=34）と中央の退き道を避け、各六歩四方の脇の空間へ収める。
function nodaCookhouses(rt, pieces) {
  const W = rt.world;
  const box = (x, y, z, w, h, d, rot = 0, pitch = 0, color = 0x736047) => pieces.push([x, y, z, w, h, d, rot, pitch, color]);
  const potGeo = new THREE.CylinderGeometry(.39, .29, .48, 10);
  const pots = new THREE.InstancedMesh(potGeo, castleMat('iron'), 2), pose = new THREE.Object3D();
  [[-20, 60], [24, 64]].forEach(([x, z], k) => {
    const y = W.heightAt(x, z);
    // 火は屋外、雨除けは奥の荷の上だけ。手前は四歩以上の口を開ける。
    for (const dx of [-2.2, 2.2]) for (const dz of [1.6, 4.1]) {
      const ground = W.heightAt(x + dx, z + dz), top = y + 2.65 - (dz - 1.6) * .15;
      box(x + dx, (ground - .15 + top) / 2, z + dz, .13, top - ground + .15, .13);
      // 柱頭の縄掛け。文字や紋は入れず、短い二重の縄で接合を見せる。
      for (const dy of [-.08, .03]) box(x + dx, top + dy, z + dz, .19, .035, .19, 0, 0, 0xa48c61);
    }
    for (const dz of [1.6, 4.1]) box(x, y + 2.65 - (dz - 1.6) * .15, z + dz, 4.8, .14, .14);
    for (let i = 0; i < 12; i++) {
      const px = x + (i - 5.5) * .4;
      box(px, y + 2.53, z + 2.85, .388, .055, 3.05, 0, .15,
        [0x807054, 0x6d5d45, 0x8b7757][(i + k) % 3]);
    }
    // 板屋根を押さえる横木。奥の低い葦簀は隙間を残し、石壁にしない。
    for (const dz of [1.7, 3.95]) box(x, y + 2.59 - (dz - 2.85) * .15, z + dz, 4.95, .08, .09);
    for (let i = 0; i < 30; i++) {
      const px = x + (i - 14.5) * .145, ground = W.heightAt(px, z + 4.1);
      box(px, ground + .6, z + 4.1, .1, 1.2 + (i % 3) * .035, .06, 0, 0,
        i % 3 ? 0x8b8059 : 0x756b47);
    }
    for (const h of [.3, .92]) box(x, y + h, z + 4.14, 4.5, .055, .06, 0, 0, 0x554b35);
    // 荷を湿った土から上げる簀の台。火のすぐ上へ藁俵を積まない。
    for (const dx of [-1.4, 1.4]) box(x + dx, y + .14, z + 2.9, .16, .28, 1.5);
    for (let i = 0; i < 6; i++) box(x, y + .32, z + 2.25 + i * .26, 3.2, .075, .24);
    // 飯櫃の木箱と蓋、束ねた薪。既存の木の一束へ合流させる。
    box(x - .85, y + .62, z + 2.8, .85, .5, .7, 0, 0, 0x827052);
    box(x - .85, y + .91, z + 2.8, .93, .07, .78, 0, 0, 0x998362);
    box(x - .85, y + .97, z + 2.8, .3, .06, .08, 0, 0, 0x5a4933);
    for (let i = 0; i < 6; i++) box(x + .7 + (i % 3) * .18, y + .44 + Math.floor(i / 3) * .13,
      z + 2.9, .14, .12, 1.1 - (i % 2) * .12, 0, 0, 0x554734);
    // 鉄鍋は火の上の横木から吊るす。火口へ新しい当たりや火を足さない。
    for (const dx of [-.85, .85]) {
      const ground = W.heightAt(x + dx, z);
      box(x + dx, (ground + y + 1.85) / 2, z, .1, y + 1.95 - ground, .1, 0, 0, 0x524531);
    }
    box(x, y + 1.85, z, 2, .12, .12, 0, 0, 0x514430);
    box(x, y + 1.49, z, .025, .64, .025, 0, 0, 0x302b24);
    pose.position.set(x, y + .98, z); pose.updateMatrix(); pots.setMatrixAt(k, pose.matrix);
    // 煤けた落とし蓋は鍋の口より少し狭く。遠景では鍋の十角形だけで十分。
    box(x, y + 1.225, z, .58, .04, .58, 0, 0, 0x40392d);
    W.stampWear(x, z + 1.1, 3, 110);
  });
  pots.receiveShadow = true; pots.matrixAutoUpdate = false;
  pots.computeBoundingSphere(); rt.scene.add(pots);
  const dispose = rt.dispose;
  rt.dispose = function () { pots.dispose(); potGeo.dispose(); return dispose.call(this); };
}

// 板囲い・井戸・作業道具を同じ箱と木の材質で描く。作るのは開戦時だけ。
function nodaTimberBatch(rt, pieces) {
  if (!pieces.length) return;
  // 補修板・井戸・道具を戦場全体で一束にすると、遠い砦や門前の細工も
  // 常に描画対象になる。四十歩四方に分け、視界外の束を既存の判定で省く。
  // 建物本体の影を使い、追加した細工を影の描画へ重ねない。
  const cells = new Map();
  for (const piece of pieces) {
    const key = `${Math.floor(piece[0] / 40)},${Math.floor(piece[2] / 40)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(piece);
  }
  const geo = new THREE.BoxGeometry(1, 1, 1), material = castleMat('wood'), meshes = [];
  const pose = new THREE.Object3D(), shade = new THREE.Color();
  for (const list of cells.values()) {
    const m = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach(([px, py, pz, w, h, d, rot, pitch, color], i) => {
      pose.position.set(px, py, pz); pose.rotation.set(pitch, rot, 0, 'YXZ'); pose.scale.set(w, h, d);
      pose.updateMatrix(); m.setMatrixAt(i, pose.matrix);
      shade.setHex(color); m.setColorAt(i, shade);
    });
    m.receiveShadow = true; m.matrixAutoUpdate = false;
    m.computeBoundingSphere(); rt.scene.add(m); meshes.push(m);
  }
  const dispose = rt.dispose;
  rt.dispose = function () { for (const mesh of meshes) mesh.dispose(); geo.dispose(); return dispose.call(this); };
}

// 本願寺周りは堂三棟だけの空地にせず、板囲い・木戸と裏方の家並みで区切る。
// 元亀元年の詳しい町割りは不明。写真の囲い方を参考にした、この戦だけの推定配置。
function nodaTempleTown(rt) {
  const W = rt.world, pieces = [];
  // 西の木戸は門前の人が通る道（z=154）に合わせ、外の避難路（x=132）を空ける。
  const ring = [[136, 150], [136, 136], [204, 136], [204, 206], [136, 206], [136, 158]];
  for (let j = 0; j + 1 < ring.length; j++) {
    const [ax, az] = ring[j], [bx, bz] = ring[j + 1];
    nodaTownFence(rt, pieces, ax, az, bx, bz, 2.4);
  }
  nodaTimberBatch(rt, pieces);
  rt.scene.add(kabukimon(W, 136, 154, 7.6, -Math.PI / 2, { doors: false }));
  // 裏方四棟は寺務・兵糧・器・薪の置き場に分ける推定復元。同じ書写室を四つ並べない。
  // 用途・間取りは推定。元の占有範囲を保ち、並ぶ三棟は庭の切れ目、東一棟は西の通りへ口を向ける。
  // 内装は近づいた時だけ共通部品で組み、板戸は naka_doors.js の札で横に滑る。
  for (const [i, [x, z, w, d, rot]] of [[145, 196, 8, 4, 0], [163, 196, 9, 4, 0],
    [183, 196, 10, 4, 0], [196, 180, 7, 4, Math.PI / 2]].entries()) {
    goten(rt, x, z, { w, d, rot, name: `本願寺の${['寺務の長屋', '兵糧置き', '器置き', '薪置き'][i]}`,
      kind: 'nagaya', profile: 'nodafukushima', interiorUse: ['templeService', 'templeGrain', 'templeUtensils', 'templeFuel'][i], naka: true, door: -1, doorX: 0,
      fieldFort: true, utilityBoardWalls: true, weatheredBoards: true,
      tile: false, boardRoof: true, layeredBoardRoof: true, eave: .45,
      boardRoofColors: [0x79634a, 0x867052, 0x6e5c47, 0x927b5d],
      doorFire: false, team: 1, noTarget: true });
  }
  // 大名の紋を借りず、既存の下り藤で寺の門を示す。
  for (const z of [148, 160]) rt.scene.add(nobori(W, 139, z, 'sagarifuji', 5));
  nodaYards(rt);
}

// 町の板囲いは狭間・乱杭を付けず、縦板と内側の横桟で組む。
// 外周と裏方の敷地で箱・材質を共用し、板の下端だけ泥色を重ねる。
function nodaTownFence(rt, pieces, ax, az, bx, bz, height = 1.42) {
  const W = rt.world;
  const box = (x, y, z, w, h, d, rot = 0, pitch = 0, color = 0x776652) => pieces.push([x, y, z, w, h, d, rot, pitch, color]);
  const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / .3);
  const rot = Math.atan2(-(bz - az), bx - ax), tx = (bx - ax) / len, tz = (bz - az) / len;
  for (let i = 0; i < n; i++) {
    const x = ax + (bx - ax) * (i + .5) / n, z = az + (bz - az) * (i + .5) / n;
    const y = W.heightAt(x, z), h = height + (i % 4) * .025;
    box(x, y + h / 2 - .04, z, len / n - .012, h, .065, rot, 0,
      [0x796b56, 0x71614d, 0x85745e][i % 3]);
    box(x, y + .1, z, len / n - .016, .25, .07, rot, 0, 0x514b3b);
  }
  const bays = Math.ceil(len / 2);
  for (let i = 0; i <= bays; i++) {
    const x = ax + (bx - ax) * i / bays, z = az + (bz - az) * i / bays, y = W.heightAt(x, z);
    box(x, y + height / 2, z, .12, height + .24, .12, rot, 0, 0x584b39);
    if (i === bays) continue;
    const mx = ax + (bx - ax) * (i + .5) / bays, mz = az + (bz - az) * (i + .5) / bays;
    for (const h of [.43, height - .23]) box(mx - tz * .08, W.heightAt(mx, mz) + h, mz + tx * .08,
      len / bays + .08, .08, .07, rot, 0, 0x594b38);
    // 写真の外周の塀のように上端へ雨除けの笠木を掛ける。低い敷地囲いは開いたまま。
    // 瓦は使わず二枚の板を合わせ、小口の継ぎ目を柱ごとに残す。
    if (height > 2) for (const side of [-1, 1]) {
      const offset = side * .115;
      box(mx - tz * offset, W.heightAt(mx, mz) + height + .15, mz + tx * offset,
        len / bays - .025, .045, .26, rot, side * .24,
        i % 3 ? 0x685641 : 0x806b50);
    }
  }
  solidSeg(ax, az, bx, bz, .12);
}

// 清洲・岡崎の写真の、塀で分けた小屋の敷地と四角い井戸枠を参考にする。
// 野田福島の町割りと井戸位置は未確認。裏通りと門前の避難路を残した推定配置。
function nodaYards(rt) {
  const W = rt.world, pieces = [];
  const box = (x, y, z, w, h, d, rot = 0, pitch = 0, color = 0x776652) => pieces.push([x, y, z, w, h, d, rot, pitch, color]);
  const fence = (ax, az, bx, bz) => nodaTownFence(rt, pieces, ax, az, bx, bz);
  // 軍用の狭間や尖った乱杭を町の仕切りへ持ち込まず、低い板囲いにする。
  for (const x of [154, 174, 191]) fence(x, 187, x, 205);
  for (const [ax, bx] of [[136, 142], [148, 160], [166, 180], [186, 191]]) fence(ax, 187, bx, 187);
  // 井戸枠は四面だけを張って口を残す。砦の広場・櫓の梯子・家の戸口を避ける。
  for (const [x, z] of [[-16, -73], [-141, -87], [149, 190], [195, 167]]) {
    const y = W.heightAt(x, z);
    box(x, y + .04, z, 1.12, .025, 1.12, 0, 0, 0x232a24);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const t = (i - 2) * .25;
        box(x + t, y + .42, z + side * .65, .238, .84, .1);
        box(x + side * .65, y + .42, z + t, .1, .84, .238);
      }
      box(x, y + .87, z + side * .66, 1.48, .12, .18, 0, 0, 0x928063);
      box(x + side * .66, y + .87, z, .18, .12, 1.48, 0, 0, 0x928063);
      box(x + side * .82, y + 1.25, z, .14, 2.7, .14, 0, 0, 0x61513b);
      solidSeg(x - .7, z + side * .65, x + .7, z + side * .65, .1);
      solidSeg(x + side * .65, z - .7, x + side * .65, z + .7, .1);
    }
    box(x, y + 2.5, z, 2, .16, .18, 0, 0, 0x514432);
    box(x + .18, y + 1.37, z, .022, 2.1, .022, 0, 0, 0xa8936b);
    // 汲み桶は通り側へ置く。底と四枚の板、二段の箍を同じ束で描く。
    const bx = x + 1.3, by = W.heightAt(bx, z);
    box(bx, by + .04, z, .42, .08, .42);
    for (const side of [-1, 1]) {
      box(bx + side * .23, by + .22, z, .045, .42, .5);
      box(bx, by + .22, z + side * .23, .5, .42, .045);
      for (const h of [.1, .33]) {
        box(bx + side * .26, by + h, z, .025, .045, .53, 0, 0, 0x4d4833);
        box(bx, by + h, z + side * .26, .53, .045, .025, 0, 0, 0x4d4833);
      }
    }
  }
  nodaTimberBatch(rt, pieces);
}

// 水際の乱杭：先を尖らせた杭を水の縁に不揃いに並べる（見た目のみ。柵・逆茂木は castle_parts 側の当たりで足りる）
let RANKUI_GEO = null, RANKUI_MAT = null;
let NODA_STAKE_GEO = null;
function rankui(W, x, z, rot) {
  if (!RANKUI_GEO) { RANKUI_GEO = new THREE.ConeGeometry(0.06, 1, 5); RANKUI_MAT = new THREE.MeshStandardMaterial({ color: 0x4e3c28, roughness: 0.95 }); }
  const m = new THREE.Mesh(RANKUI_GEO, RANKUI_MAT);
  m.rotation.set(0.45, rot, 0);
  m.position.set(x, W.heightAt(x, z) - 0.25, z);
  m.castShadow = true;
  return m;
}
function rankuiLine(rt, pts, spacing = 1.5) {
  if (true) {
    // 写真の乱杭は短い円錐ではなく、地中へ打ち込んだ丸太の先だけを削ったもの。
    // 根元から先まで一つの形を共有。間隔・太さ・傾きをずらして水際の列にする。
    if (!NODA_STAKE_GEO) {
      const shaft = new THREE.CylinderGeometry(.085, .115, 1.7, 6, 1, true);
      shaft.translate(0, .45, 0);
      const tip = new THREE.ConeGeometry(.085, .35, 6, 1, true);
      tip.translate(0, 1.475, 0);
      NODA_STAKE_GEO = mergeGeometries([shaft, tip]); shaft.dispose(); tip.dispose();
    }
    const [[ax, az], [bx, bz]] = pts, len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.ceil(len / .65)), pose = new THREE.Object3D();
    const im = new THREE.InstancedMesh(NODA_STAKE_GEO, castleMat('wood'), n + 1);
    const shade = new THREE.Color();
    for (let i = 0; i <= n; i++) {
      const r = ((i * 7919) % 101) / 101, t = i / n;
      const offset = (r - .5) * .55;
      const x = ax + (bx - ax) * t - (bz - az) / len * offset;
      const z = az + (bz - az) * t + (bx - ax) / len * offset;
      pose.position.set(x, rt.world.heightAt(x, z), z);
      pose.rotation.set(.08 + r * .16, Math.atan2(bx - ax, bz - az) + r, (r - .5) * .18);
      pose.scale.setScalar(.86 + r * .28); pose.scale.y *= .9 + (i % 5) * .055;
      pose.updateMatrix(); im.setMatrixAt(i, pose.matrix);
      shade.setHex([0x776951, 0x8b795c, 0x625442][i % 3]); im.setColorAt(i, shade);
    }
    im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); rt.scene.add(im);
    return;
  }
  const [[ax, az], [bx, bz]] = pts;
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / spacing));
  const ang = Math.atan2(bx - ax, bz - az);
  // 一本の線の杭は一つの束で描く（杭一本ずつ六十回ほど描いていた。置き方は元と同じ）
  rankui(rt.world, 0, 0, 0);
  const im = new THREE.InstancedMesh(RANKUI_GEO, RANKUI_MAT, n + 1);
  im.castShadow = true;
  for (let i = 0; i <= n; i++) {
    const t = i / n, r = ((i * 7919) % 101) / 101 - 0.5;
    const x = ax + (bx - ax) * t + r * 0.5, z = az + (bz - az) * t + r * 0.5;
    const m = rankui(rt.world, x, z, ang + Math.PI / 2 + r * 0.4);
    m.updateMatrix(); im.setMatrixAt(i, m.matrix);
  }
  im.computeBoundingSphere();
  rt.scene.add(im);
}

// 堤の東西の柵。線を横切らない平行な視点にも、柱と描画面の厚みを取る。
// 座標の入れ物は設営時だけ作り、毎コマは数だけで三軸を調べる。
function nodaCameraFenceHit(from, to, wall) {
  let enter = 0, leave = 1;
  for (let axis = 0; axis < 3; axis++) {
    const start = axis === 0 ? from.x : axis === 1 ? from.y : from.z;
    const delta = (axis === 0 ? to.x : axis === 1 ? to.y : to.z) - start;
    const low = axis === 0 ? wall.minX : axis === 1 ? wall.bottom : wall.minZ;
    const high = axis === 0 ? wall.maxX : axis === 1 ? wall.top : wall.maxZ;
    if (Math.abs(delta) < 1e-8) {
      if (start < low || start > high) return null;
      continue;
    }
    const a = (low - start) / delta, b = (high - start) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return null;
  }
  return enter < 1 && leave > 0 ? enter : null;
}

// 深みと堤の柵は短い横木を隣の柱へ組む。起伏をまたぐ長い横木をなくす。
// 地面に四十センチ埋める。近づいても木を透かさず、実物の隙間から向こうを見る。
function nodaWallLine(rt, pts, o = {}) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x8b785a });
  const timberGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
  const owned = [mat];
  const mesh = (W, seg) => {
    const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 1.1)), parts = [];
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    const timber = (a, b, radius) => {
      dir.subVectors(b, a);
      const g = timberGeo.clone(); g.scale(radius, dir.length(), radius);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); parts.push(g);
    };
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, y = W.heightAt(x, z);
      const wear = Math.sin(x * 12.7 + z * 7.3), lean = Math.sin(x * 4.1 - z * 6.7) * .11;
      const q = new THREE.Vector3(x + lean, y, z + wear * .07);
      timber(new THREE.Vector3(x, y - 0.4, z), new THREE.Vector3(q.x, y + 1.85 + wear * .15, q.z), 0.08 + (wear + 1) * .008);
      if (prev) for (const h of [0.65, 1.35]) {
        const end = new THREE.Vector3(q.x, y + h + wear * .06, q.z);
        const start = new THREE.Vector3(prev.x, prev.y + h, prev.z);
        if (h > 1 && wear > .88) end.lerp(start, .22); // 上の横木の先だけ欠く。通行の当たりは保つ。
        timber(start, end, .065);
      }
      prev = q;
    }
    const geo = mergeGeometries(parts); for (const g of parts) g.dispose();
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
    owned.push(geo); return m;
  };
  const walls = wallLine(rt, pts, { ...o, mesh });
  // 深み・砦の外の柵も含め、描いた木柵をすべて視点の障害物へ登録する。
  // 堤の二枚だけでは、浅瀬の横の柵へ視点が入り込んでしまう。
  const cameraWalls = rt.flags.cameraWalls || (rt.flags.cameraWalls = []);
  for (const s of walls) {
    const [ax, az, bx, bz] = s.seg;
    cameraWalls.push({ s, minX: Math.min(ax, bx) - .35, maxX: Math.max(ax, bx) + .35,
      minZ: Math.min(az, bz) - .35, maxZ: Math.max(az, bz) + .35,
      bottom: Math.min(rt.world.heightAt(ax, az), rt.world.heightAt(bx, bz)) - .6,
      top: Math.max(rt.world.heightAt(ax, az), rt.world.heightAt(bx, bz)) + 2.2 });
  }
  timberGeo.dispose();
  const dispose = rt.dispose;
  rt.dispose = function () { for (const item of owned) item.dispose(); return dispose.call(this); };
  return walls;
}

// 堀の水だけに土色の縁、細い流れと泡、岸の草を一度組み立てる。
function nodaMoat(rt, m, q) {
  const [[ax, az], [bx, bz]] = q.pts, len = Math.hypot(bx - ax, bz - az);
  const nx = -(bz - az) / len, nz = (bx - ax) / len, half = (q.w - 1.6) / 2;
  const y = m.geometry.attributes.position.getY(0), pos = [], uv = [], indices = [], bank = [], grass = [];
  const n = Math.ceil(len / 0.8);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const edge = half - 0.16 + 0.12 * Math.sin(i * 1.7);
    for (const side of [-1, 1]) {
      const xx = x + nx * edge * side, zz = z + nz * edge * side;
      pos.push(xx, y, zz); uv.push(i / 5, side < 0 ? 0 : 1);
      const ox = x + nx * (half + 0.8) * side, oz = z + nz * (half + 0.8) * side;
      bank.push(xx, y - 0.02, zz, ox, rt.world.heightAt(ox, oz) + 0.02, oz);
      if (i % 3 === 0) for (let k = 0; k < 3; k++) {
        const h = 0.18 + k * 0.07, gy = rt.world.heightAt(ox, oz);
        const angle = k * 2.4;
        nodaBlade(grass, ox, gy, oz, Math.cos(angle), Math.sin(angle), h);
      }
    }
    if (i < n) { const a = i * 2; indices.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.computeVertexNormals();
  m.geometry.dispose(); m.geometry = geo;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#526760'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 32; i++) {
    ctx.strokeStyle = i % 4 ? 'rgba(181,197,180,0.22)' : 'rgba(39,56,52,0.3)';
    ctx.beginPath(); ctx.moveTo((i * 37) % 128, (i * 19) % 128); ctx.lineTo((i * 37) % 128 + 12, (i * 19) % 128 + 1); ctx.stroke();
  }
  for (let i = 0; i < 18; i++) { ctx.fillStyle = 'rgba(211,211,182,0.4)'; ctx.fillRect(i * 7, i % 2 ? 4 : 121, 2, 1); }
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff, side: THREE.DoubleSide }); m.material = mat;
  const bankIndex = [];
  for (let i = 0; i < n; i++) for (let side = 0; side < 2; side++) { const a = i * 4 + side * 2, b = a + 4; bankIndex.push(a, a + 1, b + 1, a, b + 1, b); }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bank, 3)); bg.setIndex(bankIndex); bg.computeVertexNormals();
  const bm = new THREE.MeshLambertMaterial({ color: 0x756046, side: THREE.DoubleSide }); rt.scene.add(new THREE.Mesh(bg, bm));
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(grass, 3)); gg.computeVertexNormals();
  const gn = gg.attributes.normal;
  for (let i = 0; i < gn.count; i++) gn.setXYZ(i, 0, 1, 0);
  const gm = new THREE.MeshLambertMaterial({ color: 0x77704a, side: THREE.DoubleSide }); rt.scene.add(new THREE.Mesh(gg, gm));
  const dispose = rt.dispose;
  rt.dispose = function () { for (const item of [geo, mat, tex, bg, bm, gg, gm]) item.dispose(); return dispose.call(this); };
}

// 淀川の岸：共通の灰色の平たい川石（岸に浮いて見えた）を外し、水際に葦の群れを立てる。
// 浅瀬の口は空ける。葦は一束の InstancedMesh、形と材質は一つ。毎コマは触らない。
function nodaRiverBanks(rt) {
  const W = rt.world, scene = rt.scene;
  for (const st of W.def.streams) {
    const rock = st.rockMesh;
    if (rock?.parent) { rock.parent.remove(rock); rock.geometry.dispose(); rock.material.dispose(); }
    st.rockMesh = null;
  }
  const bankStone = (o) => o?.isInstancedMesh && o.geometry?.type === 'DodecahedronGeometry' && o.material?.color?.getHex() === 0x68695b;
  for (const mesh of scene.children.slice()) {
    if (!bankStone(mesh)) continue;
    scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();
  }
  // 共通の岸の石は、兵が初めて動いた時（開戦の後）に足される。設営時に外すだけでは堤に残った（10/28）。
  // 後から足される時も、この戦の場面には入れない。足す時だけ調べ、毎コマは触らない。
  const sceneAdd = W.scene.add;
  W.scene.add = function (...items) {
    if (!items.some(bankStone)) return sceneAdd.apply(this, items);
    for (const o of items) if (bankStone(o)) { o.geometry.dispose(); o.material.dispose(); }
    return sceneAdd.apply(this, items.filter((o) => !bankStone(o)));
  };
  const reedGeo = new THREE.BufferGeometry(), blade = [];
  // 細い葉を六枚、先を外へしならせる。
  for (let k = 0; k < 6; k++) {
    const a = k * 1.05, ca = Math.cos(a), sa = Math.sin(a), lean = 0.18 + (k % 3) * 0.08, h = 1 + (k % 2) * 0.35;
    const w = 0.035;
    blade.push(-w * sa, 0, w * ca, w * sa, 0, -w * ca, ca * lean, h, sa * lean);
  }
  reedGeo.setAttribute('position', new THREE.Float32BufferAttribute(blade, 3));
  reedGeo.computeVertexNormals();
  const normals = reedGeo.attributes.normal;
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
  const reedMat = new THREE.MeshLambertMaterial({ color: 0x8a8550, side: THREE.DoubleSide });
  const max = 1800, reeds = new THREE.InstancedMesh(reedGeo, reedMat, max);
  const pose = new THREE.Object3D(), color = new THREE.Color();
  const tones = [0x9a9258, 0x7f7c46, 0xa89c62, 0x6f7040];
  let n = 0;
  for (const st of W.def.streams) {
    const pts = st.pts;
    for (let i = 0; i + 1 < pts.length && n < max; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let d = 0; d < len && n < max; d += 0.6) {
        const t = d / len, cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
        if ((st.fords || []).some((f) => Math.abs(cx - f.x) < f.w)) continue;
        for (const side of [-1, 1]) {
          const j = (i * 131 + d * 7 + side * 3) | 0, r = Math.sin(j * 12.9898) * 43758.5453, q = r - Math.floor(r);
          if (q < 0.3) continue;
          const off = st.w * 0.5 + 0.2 + q * 3, x = cx + nx * off * side + Math.sin(j) * 0.3, z = cz + nz * off * side;
          if (W.inWaterAt?.(x, z) && q < 0.6) continue;
          const sc = 0.9 + q * 0.9;
          pose.position.set(x, W.heightAt(x, z) - 0.05, z); pose.rotation.set(0, j * 2.4, 0.08 * Math.sin(j));
          pose.scale.set(sc, sc * (1.2 + q * 0.6), sc); pose.updateMatrix();
          reeds.setMatrixAt(n, pose.matrix); reeds.setColorAt(n++, color.setHex(tones[j & 3]));
          if (n >= max) break;
        }
      }
    }
  }
  reeds.count = n; reeds.receiveShadow = true; reeds.computeBoundingSphere();
  scene.add(reeds);
  const dispose = rt.dispose.bind(rt);
  rt.dispose = () => { dispose(); reedGeo.dispose(); reedMat.dispose(); };
}

// 堤の枯れ草：背の踏み跡と中央の道は空け、法と肩に枯れ色の株を一束の InstancedMesh で置く。
// 形と材質は一つ、設営時に一度だけ。毎コマは触らない。
function nodaLeveeGrass(rt) {
  const W = rt.world, blades = [];
  // 一株を九枚の葉に。膝ほどの丈で、肩越しの画面の手前の土手を枯れ草で覆う（10/28 点付け：土手に草が無い）。
  for (let k = 0; k < 9; k++) {
    const a = k * 0.7, r = 0.04 + (k % 3) * 0.05, h = 0.42 + (k % 3) * 0.16;
    nodaBlade(blades, Math.cos(a * 1.7) * r, 0, Math.sin(a * 1.7) * r, Math.cos(a), Math.sin(a), h);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
  const nrm = new Float32Array(blades.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const max = 2200, im = new THREE.InstancedMesh(geo, mat, max);
  const pose = new THREE.Object3D(), color = new THREE.Color();
  const tones = [0xa89a62, 0x8f8452, 0xb9a874, 0x7b7146, 0x9c8a58];
  let n = 0;
  for (let i = 0; n < max && i < 9000; i++) {
    const r1 = Math.sin(i * 12.9898) * 43758.5453 % 1, r2 = Math.sin(i * 78.233) * 24634.6345 % 1;
    const x = (Math.abs(r1) - 0.5) * 72, z = LEVEE_Z - 14 + Math.abs(r2) * 22;
    const crest = Math.abs(z - LEVEE_Z - Math.sin(x * 0.22) * 1.4);
    if (crest < 1.5 || Math.abs(x) < 2.4 || W.inWaterAt?.(x, z)) continue;
    if (SPOTS.some((q) => Math.hypot(x - q.x, z - q.z) < 2.2 || Math.hypot(x - q.x, z - q.z - PILE_BACK) < 1.6)) continue;
    const sc = 0.9 + Math.abs(r1 * 7 % 1) * 0.9;
    pose.position.set(x, W.heightAt(x, z) - 0.03, z);
    pose.rotation.set(0, i * 2.4, 0); pose.scale.set(sc, sc * (0.8 + Math.abs(r2 * 5 % 1) * 0.6), sc); pose.updateMatrix();
    im.setMatrixAt(n, pose.matrix); im.setColorAt(n++, color.setHex(tones[i % 5]));
  }
  im.count = n; im.receiveShadow = true; im.computeBoundingSphere();
  rt.scene.add(im);
  const dispose = rt.dispose.bind(rt);
  rt.dispose = () => { dispose(); geo.dispose(); mat.dispose(); };
}

// 川石と足元の水際は、この戦の場面だけで組み立てる。形・配列は最初に確保する。
function installNodaWater(rt) {
  const W = rt.world, scene = rt.scene, dummy = new THREE.Object3D(), owned = [];
  // 中心の川床だけから水を戻すと、低い岸や浅瀬を覆ってしまう。
  // 描く頂点と深さ判定の支点を一緒に下げ、岸より十五センチ下に収める。
  for (const st of W.def.streams) {
    const pos = st.mesh.geometry.attributes.position;
    const bed = st.mesh.geometry.attributes.waterBed;
    const columns = pos.count / (st.surface.length / 3);
    const colors = new Float32Array(pos.count * 3);
    const shallow = new THREE.Color(0x4f5c4c), deep = new THREE.Color(0x1e2c29); // 濁った川の色。灰の平らな面に見せない
    for (let i = 0; i < st.surface.length / 3; i++) {
      const j = i * 3, x = st.surface[j], z = st.surface[j + 1];
      let ford = 0;
      for (const f of st.fords || []) ford = Math.max(ford, Math.max(0, Math.min(1, (f.w - Math.abs(x - f.x)) / 4)));
      const a = i * columns, b = a + columns - 1;
      let y = Math.min(st.surface[j + 2] - 0.05,
        W.heightAt(x, z) + st.depth * (1 - ford) + 0.28 * ford,
        W.heightAt(pos.getX(a), pos.getZ(a)) - 0.15,
        W.heightAt(pos.getX(b), pos.getZ(b)) - 0.15);
      // 浅瀬の横幅にも低い川床がある。中央だけでなく、渡る帯全体を膝以下にする。
      if (ford > 0.99) for (let k = 1; k < 12; k++) {
        const t = k / 12;
        y = Math.min(y, W.heightAt(pos.getX(a) + (pos.getX(b) - pos.getX(a)) * t,
          pos.getZ(a) + (pos.getZ(b) - pos.getZ(a)) * t) + 0.28);
      }
      st.surface[j + 2] = y;
      for (let v = a; v <= b; v++) {
        pos.setY(v, y);
        // 川幅の途中も川床を読む。岸より上へ出た水を三角の板として描かない。
        const depth = y - W.heightAt(pos.getX(v), pos.getZ(v));
        if (bed) bed.setX(v, depth);
        const c = depth <= 0.5 ? shallow : deep;
        colors[v * 3] = c.r; colors[v * 3 + 1] = c.g; colors[v * 3 + 2] = c.b;
      }
    }
    if (bed) {
      bed.needsUpdate = true;
      // 既存の流れ・濁りの材質を使い、水際だけを薄くする。描画の回数は増やさない。
      const compile = st.mesh.material.onBeforeCompile;
      st.mesh.material.onBeforeCompile = function (shader, renderer) {
        compile.call(this, shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          if (vWaterBed.x <= 0.01) discard;
          diffuseColor.a *= smoothstep(0.01, 0.18, vWaterBed.x);`);
      };
    }
    pos.needsUpdate = true;
    st.mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    st.mesh.geometry.computeVertexNormals(); st.mesh.geometry.computeBoundingSphere();
    st.mesh.material.color.setHex(0xffffff); st.mesh.material.vertexColors = true; st.mesh.material.needsUpdate = true;
  }
  // 膝より深い流れには入れない。歩く判定も、下げた水面を使う。
  const walkable = W.walkable;
  W.walkable = function (x, z, y) { return this.waterFootDepthAt(x, z, y ?? this.heightAt(x, z)) <= 0.5 && walkable.call(this, x, z, y); };
  // 浅瀬の口は空け、深みを横切る所だけに壊れない柵を置く。
  const st = W.def.streams[0];
  for (let i = 0; i + 1 < RIVER.length; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    const cuts = [ax, bx];
    for (const f of st.fords) for (const x of [f.x - f.w + 4, f.x + f.w - 4]) if (x > ax && x < bx) cuts.push(x);
    cuts.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cuts.length; k++) {
      const x0 = cuts[k], x1 = cuts[k + 1], x = (x0 + x1) / 2;
      if (st.fords.some(f => Math.abs(x - f.x) < f.w - 4)) continue;
      const zAt = x => az + (bz - az) * (x - ax) / (bx - ax);
      for (const s of nodaWallLine(rt, [[x0, zAt(x0)], [x1, zAt(x1)]], { name: '深みの柵', hp: 1e9, segLen: 10 })) s.noTarget = true;
    }
  }
  const stoneGeo = new THREE.SphereGeometry(1, 10, 6);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x666a64, roughness: 0.94 });
  owned.push(stoneGeo, stoneMat);
  const sourceGeo = new THREE.DodecahedronGeometry(1, 0), stride = sourceGeo.attributes.position.count;
  sourceGeo.dispose();
  // 白い平面の泡を取り除き、その直前に組まれた川石だけを厚みのある丸石へ替える。
  for (const foam of W.streamFoam || []) {
    const index = scene.children.indexOf(foam), source = scene.children[index - 1];
    if (!source?.isMesh || source.material?.color?.getHex() !== 0x6e6a62) continue;
    const pos = source.geometry.attributes.position, count = pos.count / stride;
    if (!Number.isInteger(count)) continue;
    const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, count);
    for (let i = 0; i < count; i++) {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let j = i * stride; j < (i + 1) * stride; j++) {
        x0 = Math.min(x0, pos.getX(j)); x1 = Math.max(x1, pos.getX(j));
        y0 = Math.min(y0, pos.getY(j)); y1 = Math.max(y1, pos.getY(j));
        z0 = Math.min(z0, pos.getZ(j)); z1 = Math.max(z1, pos.getZ(j));
      }
      const x = (x0 + x1) / 2, z = (z0 + z1) / 2, h = Math.max(0.22, (y1 - y0) * 0.8);
      dummy.position.set(x, W.heightAt(x, z) + h * 0.3, z);
      dummy.rotation.set(0.08 * Math.sin(i), i * 2.4, 0.12 * Math.cos(i));
      dummy.scale.set((x1 - x0) * 0.5, h, (z1 - z0) * 0.5); dummy.updateMatrix();
      stones.setMatrixAt(i, dummy.matrix);
    }
    stones.castShadow = stones.receiveShadow = true; scene.add(stones); owned.push(stones);
    scene.remove(source, foam);
    source.geometry.dispose(); source.material.dispose(); foam.geometry.dispose(); foam.material.dispose();
  }
  W.streamFoam = (W.streamFoam || []).filter(m => m.parent);
  const batch = (geo, count, opacity) => {
    const alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    geo.setAttribute('nodaAlpha', alpha);
    const mat = new THREE.MeshBasicMaterial({ color: 0xb4c4ba, transparent: true, opacity, depthWrite: false, fog: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = sh => {
      sh.vertexShader = 'attribute float nodaAlpha; varying float vNodaAlpha;\n' + sh.vertexShader;
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvNodaAlpha = nodaAlpha;');
      sh.fragmentShader = 'varying float vNodaAlpha;\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vNodaAlpha;');
    };
    mat.customProgramCacheKey = () => 'nodaWaterAlpha';
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); alpha.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.count = 0; scene.add(mesh);
    owned.push(geo, mat, mesh); return mesh;
  };
  const ringGeo = () => { const g = new THREE.RingGeometry(0.88, 1, 20); g.rotateX(-Math.PI / 2); return g; };
  const rings = batch(ringGeo(), 48, 0.48), lines = batch(ringGeo(), 128, 0.65);
  const drops = batch(new THREE.SphereGeometry(1, 5, 3), 144, 0.7);
  const waves = new Float32Array(48 * 4), spray = new Float32Array(144 * 7);
  // 全員分を先に確保。後から現れる兵も同じ空き枠を使い、毎コマ入れ物を作らない。
  const tracked = new Array(256).fill(null), steps = new Float32Array(256 * 3);
  const waterMeshes = [rings, lines, drops];
  let waveAt = 0, dropAt = 0;
  const put = (mesh, i, x, y, z, sx, sy, sz, alpha) => {
    dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix); mesh.geometry.attributes.nodaAlpha.setX(i, alpha);
  };
  let reduced = false, contact = 0;
  const visit = u => {
      const p = rt.player.u.pos;
      if (!u.alive || u.isStruct || u.farSim || u.naka || u.mounted || !u.mesh?.visible || (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2 > 38 ** 2) return;
      let slot = tracked.indexOf(u);
      if (slot < 0) { slot = tracked.indexOf(null); if (slot < 0) return; tracked[slot] = u; steps[slot * 3] = u.pos.x; steps[slot * 3 + 1] = u.pos.z; steps[slot * 3 + 2] = 0; }
      const j = slot * 3, dx = u.pos.x - steps[j], dz = u.pos.z - steps[j + 1];
      const depth = W.waterFootDepthAt(u.pos.x, u.pos.z, u.pos.y);
      if (depth < 0.06 || depth > 0.85) { steps[j] = u.pos.x; steps[j + 1] = u.pos.z; return; }
      const y = u.pos.y + depth + 0.025, cx = Math.cos(u.heading || 0), cz = -Math.sin(u.heading || 0);
      // 水面と脛の交点を左右の足に描き、停止中にも浸かる線を残す。
      for (let side = -1; side <= 1 && contact < 128; side += 2) {
        put(lines, contact++, u.pos.x + cx * side * 0.14, y, u.pos.z + cz * side * 0.14, 0.13, 1, 0.11, 0.8);
      }
      if (reduced) { steps[j] = u.pos.x; steps[j + 1] = u.pos.z; return; }
      if (dx * dx + dz * dz < 0.42 ** 2) return;
      steps[j] = u.pos.x; steps[j + 1] = u.pos.z; steps[j + 2] = 1 - steps[j + 2];
      const side = steps[j + 2] ? 1 : -1, x = u.pos.x + cx * side * 0.14, z = u.pos.z + cz * side * 0.14;
      const w = (waveAt++ % 48) * 4; waves[w] = x; waves[w + 1] = y; waves[w + 2] = z; waves[w + 3] = 0.8;
      for (let k = 0; k < 3; k++) {
        const s = (dropAt++ % 144) * 7, a = waveAt * 2.4 + k * 2.1;
        spray[s] = x; spray[s + 1] = y; spray[s + 2] = z;
        spray[s + 3] = Math.cos(a) * 0.65; spray[s + 4] = 1.1 + k * 0.25; spray[s + 5] = Math.sin(a) * 0.65; spray[s + 6] = 0.38;
      }
  };
  rt.flags.waterFeet = dt => {
    reduced = reduceMotion(); contact = 0;
    for (let i = 0; i < tracked.length; i++) if (tracked[i] && !tracked[i].alive) tracked[i] = null;
    visit(rt.player.u);
    for (const u of rt.army.units) if (u !== rt.player.u) visit(u);
    let n = 0;
    for (let i = 0; i < 48; i++) {
      const j = i * 4; waves[j + 3] = reduced ? 0 : Math.max(0, waves[j + 3] - dt);
      if (!waves[j + 3]) continue;
      const age = 0.8 - waves[j + 3], r = 0.16 + age * 0.85;
      put(rings, n++, waves[j], waves[j + 1], waves[j + 2], r, 1, r, waves[j + 3] / 0.8);
    }
    rings.count = n; n = 0;
    for (let i = 0; i < 144; i++) {
      const j = i * 7; spray[j + 6] = reduced ? 0 : Math.max(0, spray[j + 6] - dt);
      if (!spray[j + 6]) continue;
      spray[j] += spray[j + 3] * dt; spray[j + 1] += spray[j + 4] * dt; spray[j + 2] += spray[j + 5] * dt; spray[j + 4] -= 7 * dt;
      put(drops, n++, spray[j], spray[j + 1], spray[j + 2], 0.025, 0.045, 0.025, spray[j + 6] / 0.38);
    }
    drops.count = n; lines.count = contact;
    for (const mesh of waterMeshes) { mesh.instanceMatrix.needsUpdate = true; mesh.geometry.attributes.nodaAlpha.needsUpdate = true; }
  };
  const dispose = rt.dispose;
  rt.dispose = function () { for (const item of owned) item.dispose(); return dispose.call(this); };
}

const nodafukushima = {
  // 稲生の型。兵数・寄せの五組は変えず、任務と行き先だけを一つにする。
  missionSingleLine: true,
  hideMissionDots: true,
  hideGuideSteps: true,
  enemyTriangleSigns: true,
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  noPlayerFoot: true,
  quietMiss: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  missionTimeText: () => '',
  bannerAllowed: (rt, text) => rt.over || !!rt.flags.ending || /討ち取|討死|崩れ|撤退|退き口を失|間に合わなかった/.test(text),
  missions: ['味方と集まれ', '竹束を押せ', '▼の敵を倒せ', '砦前に集まれ', 'ここを守れ', '味方の列へ退け', '味方と合流した'],
  missionOf(rt) {
    const F = rt.flags;
    if (F.ending) return 6;
    if (F.retreating) return 5;
    if (F.step === 3) return 4;
    if (F.step === 2.5 || F.step === 2 && gone(F.sally)) return 3;
    return F.step === 2 ? 2 : F.step === 1 ? 1 : 0;
  },
  missionHeading(rt) {
    const F = rt.flags, stage = this.missionOf(rt);
    if (stage === 6 && !rt.tracker.main) return '戦を終える';
    if (!F.retreating && !F.ending && F.recoveryShown && F.recoveryFound) {
      for (const order of rt.objectives) if (order.id === 'main' && order.state !== 'done' && order.state !== 'fail') return order.text;
    }
    if (stage === 1) {
      if (!F.tabaReady) return '竹束の置き場を選べ';
      if (rt.G.lord || F.tabaDone?.[F.pickIndex]) return 'ここを守れ';
      return F.carry ? '竹束を印へ押せ' : '竹束を押せ';
    }
    // 生存状態から読むので、討ち取り・到着のコマに古い下知を残さない。
    if (stage === 2 && !this.missionSignTarget(rt)) return Math.hypot(rt.player.u.pos.x, rt.player.u.pos.z + 37) < 18 ? '味方を待て' : '砦前に集まれ';
    if (stage === 3 && Math.hypot(rt.player.u.pos.x, rt.player.u.pos.z + 37) < 18) return '味方を待て';
    if (stage === 5) {
      const to = F.retreatAlt ? retreatPoint(rt) : ODA_JOIN;
      if (to && Math.hypot(rt.player.u.pos.x - to.x, rt.player.u.pos.z - to.z) < (F.retreatAlt ? 6 : 10)) return '味方と合流せよ';
    }
    return this.missions[stage];
  },
  // 落城させない戦なので、砦の大将の印と、浅瀬で倒す相手を分ける。
  commanderSignTarget(rt) {
    const u = rt.flags.campB?.general;
    return !rt.flags.ending && !rt.over && u && canJoin(u) ? u : null;
  },
  commanderTarget(rt) {
    const F = rt.flags, u = F.sally?.units[0];
    return F.step === 2 && !F.retreating && !F.ending && !gone(F.sally) && u && canJoin(u) && this.missionSignTarget(rt) === u ? u : null;
  },
  namedGuideTarget(rt) { return this.commanderTarget(rt); },
  missionSignTarget(rt) {
    const F = rt.flags;
    if (F.step !== 2 || F.retreating || F.ending || F.recoveryShown && F.recoveryFound || gone(F.sally)) return null;
    if (rt.t < (F.foePinAt || 0) && canJoin(F.foePinUnit)) return F.foePinUnit;
    F.foePinAt = rt.t + .25;
    const p = rt.player.u.pos;
    let best = Infinity, target = null;
    for (const u of F.sally.units) {
      if (!canJoin(u) || u.isStruct || u.civ) continue;
      const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
      if (d < best) { best = d; target = u; }
    }
    F.foePinUnit = target;
    return target;
  },
  missionPin(rt) {
    const F = rt.flags, stage = this.missionOf(rt);
    if (F.ending || rt.over || !rt.player.u.alive) return null;
    // 休息中は既存の「休む所」の印へ任せ、敵や堤への印を重ねない。
    if (!F.retreating && F.recoveryShown && F.recoveryFound) return undefined;
    // 運搬は既存の折れ曲がる道順と作業の印を使う。
    const carryGuard = stage === 1 && F.tabaReady && (rt.G.lord || F.tabaDone?.[F.pickIndex]);
    if (stage < 2 && !carryGuard) return undefined;
    const q = F.nodaPin || (F.nodaPin = { x: 0, z: 0 });
    q.unit = null; q.enemy = false; q.approach = false;
    q.waiting = false; q.arrived = false; q.always = false; q.defend = false;
    q.progress = null; q.r = q.hide = 0;
    let to;
    if (stage === 2) {
      const u = this.missionSignTarget(rt);
      if (u) {
        if (rt.player.inRange && rt.player.rangeCueTarget === u) return null;
        to = u.pos; q.unit = u; q.enemy = true; q.approach = true; q.r = q.hide = .2;
      }
    }
    if (!to && (stage === 2 || stage === 3)) {
      to = F.fortPin || (F.fortPin = { x: 0, z: -37 });
      q.r = 18; q.waiting = true;
    } else if (carryGuard) {
      // 竹束の列の前、野田砦へ向いた岸で運び手を守る。堤の背へ戻すと、待つ間の視点が土手の法だけを向いた（10/29）。
      to = F.tabaGuardPin || (F.tabaGuardPin = { x: F.spots?.[0]?.x ?? 0, z: -26 });
      q.r = 4; q.waiting = true; q.always = true; q.defend = true;
      q.progress = Math.min(1, (rt.t - F.stepT) / CARRY_WAIT);
    } else if (stage === 4) {
      to = F.holdPin || (F.holdPin = { x: 8, z: LEVEE_Z + 4 });
      q.r = 12; q.waiting = true; q.always = true; q.defend = true;
      q.progress = Math.min(1, (rt.t - F.stepT) / (F.holdMerit ? 168 : 185));
    } else if (stage === 5) {
      to = F.retreatAlt ? retreatPoint(rt) : ODA_JOIN;
      q.r = F.retreatAlt ? 6 : 10;
    }
    if (!to) return null;
    q.x = to.x; q.z = to.z;
    q.arrived = !q.enemy && Math.hypot(rt.player.u.pos.x - to.x, rt.player.u.pos.z - to.z) < q.r;
    return q;
  },
  missionPinFallback: true,
  // 兵の名簿に加えず、共通の軽い民を使う。薪火・夜の松明も危険として避ける。
  civilianCrowd: {
    bands: PEOPLE_BANDS, fireSize: PEOPLE_FIRE_SIZE, dangerNear: peopleDanger, escapeThreats: true, keepResidents: true,
    watchDistance: 26, // 河口の畦では、兵がすぐ脇へ来る前に家族で村裏へ退く。
    // 鉄砲の発砲は民の見回りより短い。直前の戦いも覚え、
    // 村・門前の家族が銃火の合間を平穏と取り違えて見物を続けない。
    rememberSoldierCombat: true,
    watchPlayerCombat: true, // 遊び手の斬り合いにも同じ警戒を使う。
    escapeClear: peopleColumnEscapeClear,
    watchSpacing: 1.1, // 村の畦・寺の通りでは、見物する別世帯の体を重ねない。
    walkSpacing: 0.9, // 避難中も畦の曲がり角で追い越して体を重ねず、前の人に続く。
    escapeBendWidth: 3.6, // 五歩幅で乾かす畦の内側。脇を歩く家族も、過ぎた角へ戻らず先へ進む。
    exactSolids: true, // 斜めの民家・堂も実際の壁で避け、戸口と木戸へ続く路地を通す。
    // 近景も七人の使い回し。門前の町人・商人を百姓の姿へ替えず、それぞれの衣の色を保つ。
    nearKinds: ['farmer', 'townsman', 'merchant', 'woman', 'child', 'monk', 'elder'],
  },
  distanceUnit: 'ken', // 戦場の距離は間で示す。すぐ側では歩き直させない。

  largeWaymarks: true, // 携帯でも竹束と運び道の印を大きく、字と菱形で示す。
  sideTaskAfter: true, // 今の任務は主の一件。護衛や櫓は「あとで」の札へ。
  noAllyReports: true, // 近い将の声だけを聞く。古い下知を使番で繰り返さない。
  // 多数の旗のどれへ寄るか迷わせず、いま守る場所を短い声で示す。
  missionDangerText: rt => rt.flags.retreating ? '味方が少ない。退く列へ戻れ' :
    rt.flags.step >= 3 ? '味方が少ない。堤の列を守れ' : '味方が少ない。近くの味方と防げ',
  uchisute: true, // 矢玉の下では首を拾わせず、帰った味方の証言で討ち取りを認める。
  battleVoices: { lines: { ally: { reload: [], encircle2: ['囲まれた！　味方へ退け'] } } }, // 携帯でも退く先を一行で読める。
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  immediateTaskChanges: true, // 退避・休息の下知を携帯の一行目にもすぐ出す。
  keepTaskLabel: true, // 近い敵の印が付いても、堤を守る・列へ退く下知を残す。
  keepDestinationTask: true, // 「浅瀬の先へ」を防戦の下知へ足さず、一つの行動を短く伝える。
  keepCombatTaskHeading: true, // 携帯の接敵操作でも、浅瀬・堤を守る下知を一行目に残す。
  keepRescueTaskLabel: true, // 近くの味方だけを「守る人」と呼ばず、浅瀬・堤の任務を残す。
  keepTaskWithGuard: true,
  combatTaskLabel(rt) {
    if (rt.flags.retreating || !(rt.hud.guardAlly?.alive || rt.hud.defendEnemy?.alive)) return '';
    return rt.objectives.find(o => o.id === 'main' && !o.done)?.text || '';
  },
  guardLabel: rt => rt.flags.step >= 3 ? '堤で味方と敵を防げ' : '浅瀬で味方と敵を防げ',
  guardStartText: '敵へ向き、押し続けて防ぐ',
  guardWaitText: '敵へ向いて待て',
  keepTaskPanel: true,
  keepApproachTaskPanel: true, // 敵が変わるたびに札を動かさず、同じ欄で下知と操作を読む。
  // 操作の札も段の下知へそろえ、堤を守る時に敵を追わせない。
  meleeApproachText(rt) { return nodafukushima.meleeApproachLabel(rt); },
  keepCombatTask: true, // 物陰への案内で操作の文を畳んでも、任務を空札にしない。
  keepRescueTaskLabel: true, // 近い味方の護衛案内で、堤を守る役目を「守る人」に替えない。
  combatTaskLabel(rt) {
    if (rt.flags.retreating || rt.flags.step < 1 || rt.flags.step > 3) return '';
    // 防戦だけでなく、休息・手当ての下知も現在の主の任務から読む。
    for (const order of rt.objectives) if (order.id === 'main' && order.state !== 'done' && order.state !== 'fail') return order.text;
    return '';
  },
  guardLabel: rt => rt.flags.step >= 3 ? '堤で味方と防げ' : '浅瀬で味方と防げ',
  guardGuideAllowed: rt => !rt.flags.retreating && !rt.flags.recoveryShown && !rt.flags.holdRest &&
    rt.flags.step >= 2 && rt.flags.step <= 3 && !!(rt.flags.step < 3 || rt.flags.holdThreat || rt.flags.waveNear),
  guardStartText: '押し続けて防ぐ',
  guardWaitText: '押したまま防ぐ',
  keepTaskWithDodge: true, // 矢をよける間も、浅瀬・堤へ戻る下知を残す。
  dodgeAvoidNotices: true, // 回避の札で持ち場の下知を隠さない。
  // 届かない敵へ歩く操作の案内も、この戦の防戦の下知に合わせる。
  meleeApproachLabel(rt) {
    if (rt.flags.retreating) return '追わず、味方の列へ退け';
    if (rt.flags.recoveryShown || rt.flags.holdRest || rt.flags.assaultResting) return '味方の後ろへ下がれ';
    if (rt.flags.step >= 3) return '追わず、堤で迎えよ';
    if (rt.flags.step === 2) return '味方と浅瀬で迎えよ';
    return '味方と敵へ すすめ';
  },
  coverGuidePlace: true, // 竹束や柵の陰を、味方の旗への帰還と取り違えさせない。
  coverGuideLabel: '竹束の陰へ',
  compactGunAction: '矢玉だ。竹束か土手の陰へ',
  rangedThreatNeedsShot: true, // 発射予告と飛来中だけ警告し、玉込めの間は堤の任務を読めるようにする。
  taskLabel(_rt, text) {
    return text === '詰め陣の守兵へ退け' ? '詰め陣の印へ退け' : text;
  },
  // 遠い砦の柵に射線が当たるだけの野原へ、隠れ場所の輪を出さない。
  // 胸と頭の射線を、三歩以内の実物の竹束が受ける場所だけ案内する。
  coverHitAllowed(rt, hit, point, shooter) {
    return hit.object?.name === '竹束' &&
      (1 - hit.q) * Math.hypot(point.x - shooter.pos.x, point.z - shooter.pos.z) <= 3;
  },
  // 堤での短い回避を、戦場から逃げ続ける下知と取り違えさせない。
  dodgeLabel: (rt, direction, rain) => direction ? direction.replace('にげる', 'よける') : rain ? '矢の雨の外へ' : '味方のそばで よける',
  dodgeGuideLabel: (rt, reached, rain) => reached ? '敵を見よ' : rain ? '矢をよけよ' : 'この印へよけよ',
  dodgeMoveLabel: (_rt, side, rain) => `${side}へなぞり、${rain ? '矢を' : '攻撃を'}よけよ`,
  escapePlaceLabel: (_rt, rain, direction) => direction ? `${direction}へ${rain ? '矢を' : '一歩'}よけよ` : rain ? '矢をよけ、味方のそばへ' : '味方のそばでよけよ',
  rainDodgeGuideLabel: (_rt, reached) => reached ? '味方のそばで待て' : '矢をよけ、味方のそばへ',
  keepDodgeGuideLabel: true, // 画面外の回避先も「旗まで」に替えず、よけるための印と伝える。
  dodgeTurnDuration: 3, // 見回す手ほどきは三秒まで。寄せ手を見ながら構えられるようにする。
  dodgeTurnInterval: 120, // 方向の印は残し、同じ見回しの手ほどきは二分あける。
  pauseTurnPractice: false, // なぞるまで時計を止めると、携帯では総攻め・早鐘・撤退まで進めなくなる。
  dodgeTurnLabel: (rt, right, touch) => `${right ? '右' : '左'}へ${touch ? 'なぞり' : '動かし'}、よける印を見よ`,
  dodgeGestureBelowNotices: true, // 指と説明を任務の下へ収め、空きがなければ方向の印だけ残す。
  // 手傷や息切れで一時下がる案内を、戦場からの撤退の下知と取り違えさせない。
  retreatGuideLabel(rt, reached) {
    if (rt.flags.retreating) return reached ? '味方のそばで合流を待て' : rt.flags.retreatAlt ? '佐久間の列へ退け' : '詰め陣の印へ退け';
    const p = rt.player, u = p.u;
    if (u.mobbed || rt.army.playerMobbed) return '囲まれた。味方へ退け';
    if (reached) return '止まって休む';
    if (u.wounds?.bleed > 0.0001) return '出血。味方の後ろへ';
    if (u.hp < u.maxHp * 0.3) return '深手だ。味方の後ろへ';
    if (p.sta < p.maxSta * 0.6) return '息切れ。味方の後ろへ';
    return rt.flags.step >= 3 ? '堤の味方へ下がる' : '浅瀬の味方へ下がる';
  },
  // 「ここへ進む」だけでは総攻めと区別できない。手当ての目的を札にも残す。
  treatmentApproachLabel: '手当ての印へ退け',
  treatmentMoveCaption: '丸から印へなぞる',
  retreatMoveGesture: true, // 向きは矢印で示す。歩数を長い下知へ足して敵の頭を隠さない。
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.treatmentNext > rt.t) return '味方の後ろで待て';
    if (p.treatmentReady) return p.treating ? 'そのまま押して血を止める' : '「血を止める」を三秒押せ';
    if (cue?.valid && Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) < cue.radius)
      return document.documentElement.classList.contains('touch') ? '印で止まり、手を放せ' : '印で止まれ';
    return '手当ての印へ退け';
  },
  dodgePointAllowed(rt, point) {
    if (rt.flags.step !== 3 || rt.flags.retreating) return true;
    const p = rt.player.u.pos;
    // 持ち場の外にいる人も戻れるよう、現在地より遠くへ誘う候補だけ外す。
    return Math.hypot(point.x - 8, point.z - LEVEE_Z - 4) <=
      Math.max(28, Math.hypot(p.x - 8, p.z - LEVEE_Z - 4));
  },
  compactCombatGuides: true, // 敵への案内は既存の細い印へ。近い槍や胴を太線で覆わない。
  dodgeActionText: '長押しで矢印へ',
  shortRetreatGesture: true, // 指元の短い線で下がる向きを示し、敵の列まで点線を横断させない。
  compactRetreatSign: true, // 退避専用の旗と矢印も小さくし、目の前の槍と兵を見せる。
  retreatArrowLength: 72, // 回避とは別に描く退避・合流の線も、足元の短い矢印へそろえる。
  retreatLinkLength: 140, // 遠い列まで画面を横断して結ばず、行き先の旗は残す。
  compactRetreatArea: true, // 休む所の輪を足元へ収め、堤いっぱいの白い弧にしない。
  keepRetreatReason: true, // 「ここへ」だけに縮めず、息切れ・包囲・退く先を任務札に残す。
  keepRetreatGestureReason: true, // 携帯のなぞる向きは矢印へ任せ、下がる理由と行き先を消さない。
  keepWoundRetreatReason: true, // 深手の共通案内でも、撤退中は佐久間の列へ退く下知を保つ。
  hidePlayerSign: true, // 肩越しの本人を白輪で囲まず、近い視点で堤いっぱいに広がる弧をなくす。
  noUnitContrast: true, // 夜や柵越しで兵から離れて浮く人型線を消す。敵味方の頭上の印は残す。
  openingFootSignOnly: true, // 開始の説明で本人を画面下まで白い箱で囲まない。
  enemyHeadSignOnly: true, // 竹束に重なる胴の箱を省き、頭上の刀で相手を示す。
  enemyFrameAtPosition: true, // 写真用の視点切替でも、前の骨の位置へ敵の印を残さない。
  woundEffectMin: 0.05, // 歩みへの影響が五分未満の浅い傷は、傷の部位だけを示す。
  groundCombatMarkers: true, // 退避の足元も実際の地面に小さく示す。
  compactDodgeGuide: true, // 一時の回避先は小さい印にし、夜の槍と母衣を覆わない。
  shortDodgeArrow: true, // 回避先への太い長線も、足元の短い矢印へ収める。
  avoidCenteredDodgeNotice: true, // 中央へ戻る回避の説明も操作欄と任務札を避ける。
  groundLockRing: true, // 狙う相手の輪を堤の斜面へ沿わせる。
  softGuideRings: true, // 持ち場の輪は地面になじむ薄い線へ。
  compactDestinationArea: true, // 画面の三分の一を超える範囲の輪は描かず、到着判定は保つ。
  compactFloorGuides: true, // 回避・退避の輪にも大きさの上限と細い点線を使う。
  smallTaskAreas: true, // 待機・退避も中心の小さな点線へ。太い範囲の弧を堤へ残さない。
  smallRetreatAreas: true, // 強調する退避の範囲も小さくし、白い大輪へ戻さない。
  taskAreaFootRing: true, // 近い視点では描画の大きさに上限のある足元の輪を使う。
  compactDestinationSign: true, // 退避先の旗と矢印を既存の小さい形へ。手前の兵を覆わない。
  compactFlagEmphasis: true, // 退く列の旗を大きな黒札へ拡大せず、近い兵と陣幕を見せる。
  hideEdgeGoalDistance: true, // 歩数は行き先の案内へまとめ、下知の下へ同じ距離を重ねない。
  groundFlagGuides: true, // 待機中も実物の隊旗を大きく囲まず、足元の小さい印で持ち場を示す。
  footFlagGuides: true, // 頭上へ持ち上げた旗で寄せ手を隠さず、実際の行き先の足元に小さく示す。
  subtleTargetFrames: true, // 目印の枠を控え、任務の文字を読めるままにする。
  compactHoldGuide: true, // 堤の待機場所は小さな旗と足元の印へ。斜面いっぱいの輪を重ねない。
  compactGuardDestination: true, // 守る場所も足元の小さい輪と矢印へ。旗の大枠で兵を覆わない。
  avoidAllDestinationNotices: true, // 持ち場へ向かう印が上の任務札に隠れる時は、端で方向を示す。
  keepFlagTravelTask: true, // 歩数だけに替えず、堤を守る・詰め陣へ退く目的を残す。
  keepWaitOrderLabel: true,
  keepDefendTaskLabel: true,
  waitOrderLabel(rt, reached) {
    if (rt.flags.retreating) return reached ? '味方のそばで合流を待て' : rt.flags.retreatAlt ? '佐久間の列へ退け' : '詰め陣の印へ退け';
    // 持ち場に着いた後も、敵の有無・休息・手当てを見た現在の下知を保つ。
    // 待機の共通案内で「構えを解いて休め」を「堤を守れ」へ戻さない。
    if (reached) {
      for (const order of rt.objectives) if (order.id === 'main' && order.state !== 'done' && order.state !== 'fail') return order.text;
    }
    return rt.flags.step >= 3 ? reached ? '堤を守れ。敵を追うな' : '堤の印へ戻り、味方と防げ' : '印で味方と並べ';
  },
  standardClothScale: 0.72, // 狭い堤では隊旗の布を控えめにし、隣の兵と寄せ手を見渡せるようにする。
  fadeCloseStandards: true, // 目前の味方の隊旗越しに、敵の構えと退く道を見通す。
  fadeCloseStandardFrame: true, // 布と竿・横木を一緒に薄くし、太い棒だけを残さない。
  groundStandards: true, // 馬上や斜面でも竿の根を地面へ合わせ、体の傾きで旗を振り回さない。
  spacedCombatCues: true, // 届く札は照準の上。斜面の敵の頭上や空へ離さない。
  reserveCombatCues: true, // 休む印が気力・間合いの札に重ならないよう、既存の回避を使う。
  edgeBehindWaymarks: true, // 後ろへ退く印を画面の端へ寄せ、槍の列を見せる。
  botEvacuating: rt => rt.flags.retreating && !rt.flags.ending,
  compactIntro: true,
  introTaskFirst: true,
  introKeepControls: true, // 開戦前は長押しの説明を省かず、そのまま読ませる。
  keepOpeningTaskLabel: true, // 開始直後も「竹束の印へ」の下知を残し、指の操作だけの札にしない。
  introText: '「竹束を押す」を長押しし、道の印へ。据える印でも長押し。二束は味方が運ぶ。太鼓の後は、上の命令に従え。',
  // 夜の任務には「退き口」が入るが、撤退の下知までは堤で斬り合う。
  // 寄せる口と新手はこの戦の道順で決める。本人の周囲へ共通の物見を足さない。
  frontlineDensity: { gap: false, active: (rt) => !rt.flags.retreating && (rt.flags.step === 2 || rt.flags.step === 3),
    canSend: (rt, g) => g.team === 0 ? g === rt.flags.maeda || g === rt.flags.sassa : g === rt.flags.sally || g.ikko },
  // 信長は場外の海老江。共通の本陣・護衛任務・襲撃隊をこの局地へ足さない。
  // 砦の大将の討ち取りでも、早鐘や撤退を飛ばさない。
  taisho: { a: null, b: { def: true } },
  taishoRaidPath(g) {
    const c = g.center();
    if (c.z > FORT_Z + 3) return null;
    // 柵は左右の64mまで続く。自軍の柵でも通れないので、端の外へ回ってから浅瀬を渡る。
    const x = c.x < 0 ? -78 : 78;
    return [[x, c.z], [x, -24], [x, 10]];
  },
  spawn: { x: -2, z: -6, heading: Math.PI }, // 堤の背の柵の切れ目から、淀川の浅瀬と葦原・野田砦の櫓と門を正面に見る（10/28）。
  // 身の回りの当時の場（timeslip_field.js）。元亀元年九月十二日は今の十月なかば。淀川の河口の中洲。
  // 湿った堤と川岸の泥、岸の葦、枯れ色の丈の高い草。竹束の陰に撃ち合いの矢と捨てた笠。
  timeslip: {
    wet: 0.3, dust: 0.1, trample: 0.12, debris: 1.1, arrows: 1.1, reeds: 1,   // 夜の堤で泥の跡が穴に見えないよう薄く
    grass: 0xa49c66, grassTints: [0xffffff, 0xeadcb0, 0xc8c898], grassH: 1.2, tallGrass: 0.9,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
    maxSlope: 0.22,   // 堤の法には泥の跡を貼らない
    fights: [...SPOTS.map((s) => [s.x, s.z, 26]), [NODA_GATE.x, NODA_GATE.z + 10, 30], [ODA_JOIN.x, ODA_JOIN.z, 20]],
  },
  noHorse: true, // 竹束を押し、浅瀬を渡る局地は徒歩で出る。
  smallFlagAvoidNotices: true, // 下知と重なる旗の飾りは畳み、進む向きは足元の矢印で示す。
  guideArrowLength: 64, // 遠い堤や詰め陣まで、太い案内線を兵の上へ伸ばさない。
  footFrameMinDistance: 2.2, // 土手や竹束で視点が寄った時、足を収めようとして地面だけを見下ろさない。
  keepPlayerWeapon: true, // 肩越しの槍を旗と同じ扱いで消さず、構えと穂先を見せる。
  noCouriers: true, // 飾りの騎馬伝令も堤の往復路へ入れず、母衣で寄せ手を隠さない。
  nearAllyFadeRadius: 1.1, // 隣で戦う兵を残し、視点へ入り込む一人だけを避ける。
  nearAllySolidBody: true, // 顔・胴・竿を別々に透かさず、視点が体に入る間だけ全身を避ける。
  nearAllyWholeOcclusion: true, // 視点と本人の間に入った母衣も全身と一緒に避け、胴だけ透かさない。
  nearAllyFadeImportant: true, // 開始時に近い将の馬も同じ扱いにする。
  guideMarker(rt) {
    const F = rt.flags;
    if (F.recoveryShown && F.recoveryFound) return 'recover';
    // 堤に着いたら道案内を畳み、寄せてくる方へ目を向けられるようにする。
    if (F.step === 2 && (F.assaultResting || rt.player.u.mobbed || rt.t < (F.assaultSafeUntil || 0))) return null;
    if (F.step === 3 && !F.retreating && Math.hypot(rt.player.u.pos.x - 8, rt.player.u.pos.z - LEVEE_Z - 4) <= 12) return null;
    return F.retreating ? 'retreat' : F.step === 0 ? 'maeda' : F.step === 1 ? (F.carry ? 'tabaWay' : 'pile') : F.step === 2 || F.step === 2.5 ? 'assault' : F.step === 3 ? 'leveeHold' : null;
  },
  world: {
    noHaori: true, // 本の足軽主体の装束。既存の指定で陣羽織を出さない。
    namedKacchu: NODAFUKUSHIMA_KACCHU,
    seed: 1570,
    wind: [0.9, -0.3],   // 西の海から。風向きは復元
    time: 'after',
    naturalArrowRain: true, // 遠い矢を太い黒い棒にせず、霧と実寸に合わせる。
    arrowRainGroundCue: false, // 矢の警告の白黒帯で足元を覆わない。矢・影・声と回避先は残す。
    noGroundArrows: true, // 一斉射ちの矢も地面へ積み重ねず、白い針山を残さない。
    keepPinnedArrowSize: true, // 胴の倍率を矢へ掛けず、刺さった後も飛来時の長さを保つ。
    pinnedArrowAxisScale: true, // 斜めの矢も矢自身の軸で補正し、胴から長い棒を伸ばさない。
    pinnedArrowRenderScale: true, // 描く直前の体格変更にも合わせ、刺さった矢を再び引き伸ばさない。
    mountainScale: 0.24, // 河口の低地。遠山は低くし、四方を高い峰で囲まない。
    mountainHaze: 0.65,
    smokeFogFloor: 100, // 鉄砲の煙で戦場全体を白くせず、堤の寄せ手と退く列を見せる。
    gunHazeScale: 0.6, // 筒先の煙は残し、狭い堤に長く溜まる煙の広がりを抑える。
    groundMistScale: 0.35, // 川面の薄い靄を残し、堤の足場を隠さない。
    fogFar: 380, battleViewDistance: 110, // 砦の門・櫓・小屋と守る兵を霧に沈めない（見通し80→110m。10/29）。
    nightLift: 3.8,
    unitNightScale: 0, // 兵だけの白い補光を止め、既存の月光と篝火で具足を照らす。
    fireLightLift: 1.6, // 共通の四灯を使い回し、堤と人の輪郭へ暖かな光を足す。
    autumn: true,     // 旧暦九月：枯れ色の草と色づく木
    muddy: 0.55,
    rocks: 0, // 淀川の河口の中洲（砂と泥の低地）。山の岩を転がさない（灰色の平たい岩が堤に浮いて見えた。10/28）
    softPathSoil: true, patchyGround: true,
    softEarthCrust: true, // 土塊の境で飛ぶ陰と凹凸を抑え、地面に格子を残さない。
    // 土と草の境を蛇行させ、堤の肩にも短い草と踏まれた土を混ぜる。歩く高さは保つ。
    grassMix(x, z, pd) {
      const patch = Math.sin(x * .31 + Math.sin(z * .24) * 2) * Math.cos(z * .37 - x * .11);
      const shoulder = Math.abs(z - LEVEE_Z - Math.sin(x * .22) * 1.4);
      const bank = THREE.MathUtils.smoothstep(shoulder, 2.2, 11);
      const road = THREE.MathUtils.smoothstep(pd + patch * .65, .9, 3.4);
      return (.18 + bank * .52 + patch * .22) * road;
    },
    waterSlow: true,   // 川・水路・水田が本当に足を遅くする（terrain_tags.js の 'water'。歩兵は遅く、騎馬はもっと遅い）
    // 退き口の兵道と、各戸・寺の木戸から村裏へ続く民の道をともに残す。
    // 見物の道だけに絞ると、家族の逃げ道が水田や草木で途切れてしまう。
    paths: [[[ODA_HONJIN.x, 160], [ODA_HONJIN.x, ODA_HONJIN.z], [ODA_JOIN.x, ODA_JOIN.z], [0, 12], [0, LEVEE_Z]], ...NODA_PLAN.paths.map(p => p.pts), ...FUKU_PLAN.paths.map(p => p.pts), ...PEOPLE_GROUND_PATHS],
    // 足と土の貼り物が、描かれた堤の三角面へそろう高さを読む。
    terrainTriangles: true,
    keepTerrainGrid: true, // 携帯でも描く面と足場を同じ格子にし、堤の斜面で足や落とし物を浮かせない。
    longHoro: 'round', // 赤母衣・黒母衣は既存の丸い竹籠を使い、背から細い板を垂らさない。
    ordinaryFlagStride: 3, // 狭い堤では無名の長柄足軽の指物を三人に一本へ。隊旗・旗持ち・自分の組は保つ。割合は復元。
    noHorse: true, // 狭い堤と浅瀬では旗本・増援も徒歩。馬で竹束の置き場を塞がない。
    crumpledFlags: true, // 倒れた旗は既存の折れた布へ。地面に四角い板を残さない。
    meleeGroundedFeet: true, // 近い槍・刀の斬り合いは、既存の足合わせを動きの後に使う。
    contactShadows: true, // 高画質でも人馬・味方の足元へ、共用の柔らかな接触影を置く。
    infantryWeight: true, livingSpearHedge: true, variedMarch: true,
    groundedFalls: true, settleSideFalls: true, // 横倒しの肩と胴を堤の斜面へ寝かせる。
    terrainContactFalls: true, // 堤を下りて討たれても、古い足の高さに亡骸を残さない。
    settleFallenBody: true, settleFallenLimbs: true, // 遠い姿も腰・胸と手足を土へ下ろす。既存の接地補正を使う。
    bareFallenHats: true, slopeLitter: true, // 落ちた笠に首を残さず、武具も地面の傾きに合わせる。
    longitudinalSpearFalls: true, // 落とした長柄は両端の坂へ寝かせ、堤の肩から空へ突き出さない。
    height,
    moveWay: tabaWay,
    tint(x, z, h, c) {
      // 川べりの葦と泥
      if (z < -16 && z > -42) c.lerp({ r: 0.42, g: 0.44, b: 0.32 }, 0.4);
      // 堤の斜面から野へ土色をなだらかにつなぐ。地面の既存の絵と陰影を使う。
      const bank = Math.max(0, 1 - Math.abs(z - LEVEE_Z) / 12);
      const edge = Math.max(0, Math.min(1, (132 - Math.abs(x)) / 16));
      c.lerp({ r: 0.42, g: 0.35, b: 0.25 }, bank * bank * (3 - 2 * bank) * edge * 0.7);
      // 川岸の湿った窪みと乾いた草の斑。頂点色だけで昼夜の地肌を分ける。
      const field = Math.max(0, 1 - Math.abs(z + 16) / 60) * Math.max(0, 1 - Math.abs(x) / 85);
      const patch = Math.sin(x * .19 + Math.sin(z * .13) * 1.8) * Math.cos(z * .23 - x * .08);
      if (patch > 0) c.lerp({ r: .30, g: .265, b: .19 }, patch * field * .48);
      else c.lerp({ r: .49, g: .445, b: .30 }, -patch * field * .34);
      // 堤の背の踏み跡と、浅瀬へ下りる道。踏まれて湿った暗い土の筋。
      const crest = Math.abs(z - LEVEE_Z - Math.sin(x * .22) * 1.4), down = z < LEVEE_Z && z > -24 ? Math.abs(x - Math.sin(z * .3) * .6) : 9;
      const trod = Math.max(0, 1 - Math.min(crest, down) / 1.3) * edge;
      if (trod > 0) c.lerp({ r: .22, g: .18, b: .13 }, trod * .55);
    },
    clear: (x, z) => (z > -60 && z < 60 && Math.abs(x) < 90) || Math.hypot(x - ODA_HONJIN.x, z - ODA_HONJIN.z) < 22 || (Math.abs(x) < 26 && z > -100 && z < -58) || (x > -142 && x < -102 && z > -106 && z < -48) || (z > 88 && z < 143 && ((x > -116 && x < -78) || (x > 80 && x < 116))) || peoplePlace(x, z) || peopleRoadDistance(x, z) < PEOPLE_ROAD_HALF_WIDTH || templeTownGround(x, z),
    water: { x: -550, x2: SEA_EDGE, level: -0.75 },
    streams: [
      { pts: RIVER, w: 20, depth: 1.1, sedimentWater: true, fords: [{ x: 0, w: 16 }, { x: -82, w: 12 }, { x: -122, w: 12 }, { x: 60, w: 12 }] },
      { pts: ISLAND_RIVER, w: 12, depth: 1.4, sedimentWater: true },
    ],
    // 摂津の低い田（淀川の河口の島々）
    fieldStage: 'ripe',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      // 家の土間と畦道を乾かし、見物・避難中の民を田の水へ入れない。
      if (villageGround(x, z) || peoplePlace(x, z) || peopleRoadDistance(x, z) < PEOPLE_ROAD_HALF_WIDTH || templeTownGround(x, z)) return 0;
      if (z < 30 || z > 180 || Math.abs(x) < 36 || x < SEA_EDGE + 10 || Math.hypot(x - ODA_HONJIN.x, z - ODA_HONJIN.z) < 22) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.8;
    },
    trees: 260,
    treeMix: { sugi: .1, matsu: .3 }, // 河口の雑木を主体に。残る杉は遠景でも枝先を崩す。
    raggedNeedles: true, // 既存の杉の頂点だけを崩し、三角を重ねた工作物の輪郭を和らげる。
    unevenCrowns: true, // 松と雑木も既存の房を変形する。木の本数や描画の数は増やさない。
    tufts: 5200,
    tuftTint: 0xb2a68d, // 秋の湿った草。明るい葉先が白い線に見えない土色を掛ける。
    curvedRockTufts: true, // 岩際の葉を短い曲線にし、黒い三角の杭を残さない。
    litRockTufts: true, // 岩の子になった根草にも、表裏とも空の光を当てる。
    groundedSlopeRocks: true, // 丸みのある既存の岩を使い、堤の斜面にも根元を埋める。
    rockDrawGround: true, // 歩く高さとのずれで岩と根草を浮かせない。
    rockSlopeContact: true, // 回転後の腹も堤へ埋め、黒い三角の縁を宙へ残さない。
    treeDensity: (x, z) => (z > -70 && z < 70 ? 0.1 : 0.6),
    groves: [{ x: 90, z: 40, r: 14, n: 18 }, { x: -90, z: 50, r: 12, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && (z < -170 || x > 174 || z > 174),
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.peopleColumnPoint = { x: 0, z: 0 };
    F.peopleFirePoint = { x: 0, z: 0 };
    F.peopleClashPoint = { x: 0, z: 0 };
    F.peopleColumnProbe = new THREE.Vector3();
    timeslipField(rt);   // 身の回りの川岸の泥・葦・矢（def.timeslip）
    F.campJoinPoint = { ...ODA_JOIN, y: W.heightAt(ODA_JOIN.x, ODA_JOIN.z) };
    // 建物用の近景透かしで堤の斜面まで抜くと、足元に空の白い面が現れる。
    // 地形の当たり・高さは保ち、この戦の地面だけ透かす対象から外す。
    W.terrain.material.userData.camNearSolid = true;
    // 秋の河口の土を雪のような白にしない。既存の土・草・泥の絵へ土色を掛ける。
    // この戦の材質だけを変え、地形・歩行・描画の数は保つ。
    // 10/29：岸は倒れた枯れ葦の淡い黄土色が積もる（手本）。土色を一段淡い黄土へ。
    W.terrain.material.color.setHex(0xd0bb8c);
    // 空の白い照りも抑え、共通の地肌の絵と昼夜の照明を残す。
    W.terrain.material.envMapIntensity = 0.18;
    // 岸が一色の茶の土だった（10/29 点付け：手本は倒れた枯れ葦の淡い黄土色が厚く積もる）。
    // 地面の色にだけ、斜めに寝た葦の筋の淡い黄土の斑を重ねる。踏まれた所は土の斑を残す。形・歩行・描く数は変えない。
    {
      const mat = W.terrain.material, compile = mat.onBeforeCompile, cacheKey = mat.customProgramCacheKey();
      mat.customProgramCacheKey = () => cacheKey + '|noda-reed-litter';
      mat.onBeforeCompile = (sh, renderer) => {
        compile.call(mat, sh, renderer);
        sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb *= col;', `
          float ndN = sin(vWP.x * 0.37 + sin(vWP.z * 0.29) * 2.0) * cos(vWP.z * 0.41 - vWP.x * 0.13);
          float ndLitter = smoothstep(-0.35, 0.3, ndN + macro2 * 0.5 - 0.1);
          float ndStraw = abs(sin(dot(vWP.xz, vec2(3.1, 1.3)) + sin(vWP.x * 0.9) * 2.0 + sin(vWP.z * 7.0) * 0.6));
          float ndStraw2 = abs(sin(dot(vWP.xz, vec2(-1.2, 3.4)) * 1.3 + sin(vWP.z * 1.1) * 1.5));
          vec3 ndReed = vec3(0.34, 0.28, 0.16) * (0.72 + 0.25 * ndStraw + 0.15 * ndStraw2);
          col = mix(col, ndReed, ndLitter * 0.8);
          diffuseColor.rgb *= col;`);
      };
      mat.needsUpdate = true;
    }
    installNodaNotices(rt);
    installNodaGroundFx(rt);
    installNodaFallenHats(rt);
    installNodaStandards(rt);
    // 据え場と往来の足跡。既存の踏み跡の絵へ設営時だけ描き、面や材質を足さない。
    for (let x = -60; x <= 60; x += 2) {
      const wave = Math.sin(x * .21);
      W.stampWear(x, LEVEE_Z + wave * .8, 2.8, 135);
      if (Math.abs(x) < 24) W.stampWear(x, LEVEE_Z - 3 + wave, 3.2, 110);
    }
    for (let z = -60; z <= 100; z += 2) {
      if (W.inWaterAt(0, z)) continue;
      const bend = Math.sin(z * .065) * .8;
      for (const side of [-1, 1]) W.stampWear(bend + side * 1.2, z, 1.25, 145);
    }
    // 門前の押し合いと堤の戻り道にも、幅の違う踏み跡を先に残す。
    // 草と泥は共通の踏み荒らしの絵を使い、地形・足の速さは変えない。
    for (let z = -39; z <= 18; z += 2.3) {
      for (const side of [-1, 1]) {
        const x = side * (3.5 + Math.sin(z * .18 + side) * 1.6);
        if (!W.inWaterAt(x, z)) W.stampWear(x, z, 1.7 + Math.cos(z * .31) * .4, 105);
      }
    }
    for (let x = -24; x <= 24; x += 2.2) {
      const z = LEVEE_Z + 5.5 + Math.sin(x * .23) * 1.4;
      W.stampWear(x, z, 1.5, 100);
      W.footprint(x, z, false, Math.PI * .5 + Math.sin(x) * .3);
    }

    // 近い草も既存の材質へ同じ色を掛ける。草の数や描画は増やさない。
    W.nearGrass?.material.color.setHex(0xb2a68d);
    // 岩の根元の草だけ上向きの法線へ。葉の裏まで空の光を受ける。
    // 設営時の既存の形を直し、描画数・材質は増やさない。
    for (const mesh of rt.scene.children) {
      if (!mesh.isMesh || mesh.material?.color?.getHex() !== 0x77764f || mesh.material.map) continue;
      const normals = mesh.geometry.attributes.normal;
      if (!normals) continue;
      for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
      normals.needsUpdate = true;
    }
    installDayCuts(rt);
    installNodaWater(rt);
    nodaRiverBanks(rt);
    nodaLeveeGrass(rt);
    // この戦の夜空だけ調整する。白い粒が雪のように見えない大きさと数へ。
    // 既存の形と材質を使い、ほかの戦の星には持ち越さない。
    if (W.stars) {
      W.stars.geometry.setDrawRange(0, 150);
      W.stars.material.size = 0.85;
      W.stars.material.opacity = 0.38;
    }
    const lookOf = W.lookOf;
    W.lookOf = function (key) {
      const look = lookOf.call(this, key);
      if (key === 'after') { look.hemiI = Math.max(look.hemiI, 1.65); look.hemiGround.setHex(0x887052); }
      if (key === 'night') { look.vis = Math.max(look.vis, 240); look.hemiI = Math.max(look.hemiI, 1.1); }
      return look;
    };
    F.step = 0; F.ek = 0; F.ak = 0; F.placed = 0; F.carry = false;
    F.recoveryPoint = { x: 0, y: 0, z: 0 }; F.recoveryScanAt = 0; F.recoveryFound = false;
    // この戦だけ、実際に見えた射撃の煙を組頭が知らせる。構えからの予告は使わない。
    rt.army.hooks.onFoeReload = () => {};
    F.reloadScanAt = 0; F.reloadSayAt = 0; F.reloadVoice = 0;
    sagarifujiTex(); namuTex();
    resetGates(); flReset();
    // ---- 野田砦・福島砦：土塁と柵、冠木門、板葺きの登れる井楼、水堀 ----
    // 堀は組み立て側で一度加える。withHori を渡して二重に掘らない。
    const fortBase = (x, z) => baseHeight(x, z) + DORUI_H(x, z);
    const buildFort = plan => {
      // 写真の細い縦板の目地。狭間を塞がず、乱杭と土塁の既存の形は保つ。
      // 両砦の高だけに指定し、ほかの戦の共通部品の見た目は変えない。
      if (true) plan = {
        ...plan, year: 1570,
        // 岸の広場も縁に長屋・小屋・蔵を並べる（本の CG の砦の密度。真ん中の戦う場は castle_bldg が空ける。10/28）
        kuruwa: plan.kuruwa.map(k => ({ ...k, wallOpt: { ...k.wallOpt, boardSeams: true }, ...(k.id === 'kishi' ? { dense: true } : {}) })),
      };
      // 元亀の河川砦としての推定。高の野田の表門だけ板葺きの渡櫓にする。
      // 元の縄張りは保持し、共通の門作りで脇の塀の切れ目も合わせる。
      if (plan.name === NODA_PLAN.name) plan = {
        ...plan, year: 1570, exactGapEdges: true,
        koguchi: plan.koguchi.map(g => g.id === 'mon' ? { ...g, gate: 'yagura' } : g),
        // 岡崎の写真のように、表の一基は下部と中段を板で囲い、隣は骨組みを見せる。
        // 既存の井楼の形・遠景用の形・梯子口をそのまま使う。元の縄張りは変えない。
        yagura: plan.yagura.map(y => ({ ...y, boarded: y.id === 'monomiW' })),
      };
      const start = rt.scene.children.length;
      const C = buildCastlePlan(rt, plan, { baseHeight: fortBase, edgeW: 3, life: false, buildGates: true, buildTowers: true, team: 1 });
      // 遠近を切り替える井楼は結合しない。子の網を外すと、切替後に
      // 梯子口と守兵だけが空中へ残る。行列を止める軽量化はそのまま使う。
      for (const tower of C.towers) tower.mesh.userData.noMerge = true;
      // 共通部品は未造成の地面から水面を下げる。この戦の地面は既に堀底なので、
      // 最初に作られる水面を底より深さの六割五分だけ上へ戻す（土橋の切れ目は維持）。
      plan.hori.forEach((q, i) => {
        const m = rt.scene.children[start + i];
        if (m?.isMesh && m.geometry?.type === 'BufferGeometry') { m.geometry.translate(0, q.deep * 1.2, 0); m.geometry.computeBoundingSphere(); nodaMoat(rt, m, q); }
      });
      return C;
    };
    F.noda = buildFort(NODA_PLAN);
    F.fuku = buildFort(FUKU_PLAN);
    if (true) {
      // 本の井楼に合わせ、樹皮の通し柱と木口を出す井桁へ。既存の形と遠近切替を共用する。
      monomi(rt, -10, -90, { team: 1, mon: 'miyoshi', logFrame: true, fieldFrame: true, barkPosts: true, boarded: true, name: '野田砦の奥の井楼' }).mesh.userData.noMerge = true;
      monomi(rt, -144, -79, { team: 1, mon: 'miyoshi', logFrame: true, fieldFrame: true, barkPosts: true, boarded: false, name: '福島砦の川際の井楼' }).mesh.userData.noMerge = true;
      // 岸の左右の柵の内にも井楼を一基ずつ。持ち場から左右どちらを向いても、画面の中ほどに櫓と柵が入る（門の一基だけが端に寄らない）。
      monomi(rt, -36, -51, { team: 1, mon: 'miyoshi', logFrame: true, fieldFrame: true, barkPosts: true, boarded: false, name: '野田砦の西の井楼' }).mesh.userData.noMerge = true;
      monomi(rt, 36, -51, { team: 1, mon: 'miyoshi', logFrame: true, fieldFrame: true, barkPosts: true, boarded: true, name: '野田砦の東の井楼' }).mesh.userData.noMerge = true;
      // 公記の「土手や櫓を築いて砦へ攻め寄せた」：織田の仕寄りの井楼を堤の背の内（南）に二基。堤沿いを向いた画面にも櫓が入る。
      monomi(rt, -24, -1, { team: 0, mon: 'oda', logFrame: true, fieldFrame: true, barkPosts: true, boarded: true, name: '織田の仕寄りの井楼・西' }).mesh.userData.noMerge = true;
      monomi(rt, 26, -1, { team: 0, mon: 'oda', logFrame: true, fieldFrame: true, barkPosts: true, boarded: false, name: '織田の仕寄りの井楼・東' }).mesh.userData.noMerge = true;
    }
    F.noda.height = F.fuku.height = height;
    F.nodaGate = makeGate(rt, F.noda.gateObjs.mon, { name: NODA_GATE.name, guardTeam: 1 });
    F.fukuGate = makeGate(rt, F.fuku.gateObjs.mon, { name: FUKU_GATE.name, guardTeam: 1 });
    // 束34：土橋（野田砦・福島砦の水堀の渡り口）を、一揆勢の物見に足す（知らせだけ。縄張り・勝ち方は変えない）
    F.fordWatch = fordWatch(rt, { fords: [[0, -42], [-122, -54]], team: 1, range: 26 });
    // 総攻めは門前まで。史実どおり落城前に囲みを解くため、塀・門は壊させない
    // 門も同じ（追いかけた味方が門を破って砦の奥の三好の本陣まで雪崩れ込み、夜の筋の前に戦が終わらないように）
    for (const s of [...F.noda.walls, ...F.fuku.walls, F.nodaGate.struct, F.fukuGate.struct]) if (s && s.seg) { s.noTarget = true; s.wall = true; s.hp = s.maxHp = 1e9; }
    // ---- 野田砦の左右の柵（岸の広場の柵から、川べりを東西へ） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    F.fortWall = noT(nodaWallLine(rt, [[-64, FORT_Z + 2], [-30, FORT_Z], [-20.5, FORT_Z]], { team: 1, hp: 1e9, name: '柵', segLen: 5 }));
    F.fortWall.push(...noT(nodaWallLine(rt, [[20.5, FORT_Z], [30, FORT_Z], [64, FORT_Z + 2]], { team: 1, hp: 1e9, name: '柵', segLen: 5 })));
    // 兵の中央広場を避けた番所・長屋・詰所。板葺き、共通の戸口・床・室内。
    // 城の購入部品の板床と、和の部屋の部品は naka.js の近づいた時の組み立てで使う。
    // 正背面も戸口・窓を抜く板壁へ揃える。飾りの格子窓を貼らず、
    // 詰所の背面の内障子を外張りの板で塞がない。
    F.fortHouses = FORT_BUILDINGS.map(b => goten(rt, b.x, b.z, { ...b, fieldFort: true, utilityBoardWalls: true, tile: false, naka: true, profile: 'nodafukushima', door: 1, doorX: 0, team: 1, noTarget: true }));
    // 板倉も戸口と土間を持つ。荷は壁際へ寄せ、砦の中央の通路は増築しない。
    for (const [x, z, w, d] of FORT_STORES) F.fortHouses.push(goten(rt, x, z, { w, d, fieldFort: true, utilityBoardWalls: true, name: '砦の兵糧蔵', kind: 'kura', tile: false, naka: true, profile: 'nodafukushima', door: 1, doorX: 0, team: 1, noTarget: true }));
    // 仮設の河川砦の外壁は板壁として補う。共通材質そのものは書き換えない。
    for (const house of F.fortHouses) house.mesh.traverse(m => { if (m.isMesh && m.material === castleMat('plaster')) m.material = castleMat('wood'); });
    nodaFieldTools(rt);
    const huts = makeSimpleBatch();
    for (const [x, z] of [[-40, FORT_Z - 3], [-12, FORT_Z - 3], [12, FORT_Z - 3], [40, FORT_Z - 3], [0, -70]]) rt.scene.add(nobori(W, x, z, 'miyoshi', 6));
    // 福島の砦（西の島。遠く）
    for (const [x, z] of [[-128, -62], [-104, -64], [-122, -92]]) rt.scene.add(nobori(W, x, z, 'miyoshi', 6));
    // 河口の民家。位置と間取りは推定。高では外形と同じ戸口から土間・板間へ入れる。
    // 閉じた外部素材には置き換えず、室内は近づいた時だけ共通部品で組む。
    for (const [i, [x, z]] of VILLAGE_HOUSES.entries()) {
      if (SETTINGS.quality === 'high') rt.scene.add(hut(W, x, z, 7, 5, 0.2, {
        minka: false, interior: { name: `河口の民家・${['一', '二', '三', '四', '五', '六'][i]}`,
          kind: 'minka', profile: 'nodafukushima' },
      }));
      else hut(W, x, z, 7, 5, 0.2, { batch: huts });
    }
    finalizeSimpleBatch(rt, huts);
    // ---- 水際の乱杭・陸路の逆茂木（野田・福島とも、柵の切れ目でない所から回り込めないように） ----
    for (const pts of RANKUI_LINES) rankuiLine(rt, pts);
    for (const pts of SAKAMOGI_LINES) sakamogiRow(rt, pts, { team: 1, hp: 140, spacing: 5 });
    // ---- 堤の土塁（鉄砲衆の胸壁） ----
    F.dorui = nodaLevee(rt);
    // 持ち場のすぐ両脇に柵と火。中央の戻り道と、南東の寄せ道は空ける。
    const cameraWalls = F.cameraWalls;
    for (const pts of [[[-12, LEVEE_Z - 2.5], [-5, LEVEE_Z - 2.5]], [[18, LEVEE_Z - 2.5], [25, LEVEE_Z - 2.5]]]) {
      nodaWallLine(rt, pts, { team: 0, name: '堤の柵', hp: 400 });
    }
    // 束ねた横木を面ごとに探さず、歩く柵と同じ短い線だけ調べる。
    // 本人と視点の間に柵がある時は手前へ寄せ、柱へ視点をめり込ませない。
    F.tabaCameraFrom = { x: 0, y: 0, z: 0 }; F.tabaCameraTo = { x: 0, y: 0, z: 0 };
    // 支えの隙間まで壁にせず、前面の竹と横木の厚みだけを取る。
    F.tabaCameraBounds = { minX: -1, maxX: 1, minZ: -0.25, maxZ: 0.3, bottom: -0.1, top: 1.9 };
    W.cameraBlockFraction = (from, to) => {
      let hit = null;
      for (const w of cameraWalls) {
        if (!w.s.alive || w.s.opened) continue;
        const t = nodaCameraFenceHit(from, to, w);
        if (t !== null && (hit === null || t < hit)) hit = t;
      }
      // 竹束の正面だけでなく、横から覗いた時も同じ実物の厚みを調べる。
      // 入れ物は設営時に一度だけ作り、運搬中も使い回す。
      for (const mesh of F.cameraTabas || NO_GROUPS) {
        if (!mesh.parent || !mesh.visible) continue;
        const p = mesh.position, c = Math.cos(mesh.rotation.y), s = Math.sin(mesh.rotation.y);
        const a = F.tabaCameraFrom, b = F.tabaCameraTo;
        const ax = from.x - p.x, az = from.z - p.z, bx = to.x - p.x, bz = to.z - p.z;
        a.x = ax * c - az * s; a.y = from.y - p.y; a.z = ax * s + az * c;
        b.x = bx * c - bz * s; b.y = to.y - p.y; b.z = bx * s + bz * c;
        const t = nodaCameraFenceHit(a, b, F.tabaCameraBounds);
        if (t !== null && (hit === null || t < hit)) hit = t;
      }
      // 堤の肩では目線が通っても、手前の土に本人の腰まで隠れる。
      // 運び始めは腰の高さまで調べ、土手で本人と竹束が隠れる前に視点を寄せる。
      // 川側の斜面だけに限り、平地や城内の視点には持ち越さない。
      if (Math.abs(from.z - LEVEE_Z) < 18) {
        for (let i = 1; i <= 12; i++) {
          const t = i / 12;
          if (hit !== null && t >= hit) break;
          const x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
          // 運搬中の低い視線は本人の肩から徐々に下げる。
          // 始点から腰より下を調べると、足元の斜面を壁と見なして視点が身体まで寄ってしまう。
          const clearance = F.step === 1 ? 1.3 : F.step <= 1 ? 1.1 : 0.65;
          const y = from.y + (to.y - from.y) * t - clearance * (F.step <= 1 ? t : 1);
          if (y < W.heightAt(x, z) + 0.15) { hit = t; break; }
        }
      }
      return hit;
    };
    // 写真用に視点を直接置いた場合も、追従時と同じ木柵・竹束を避ける。
    // 注視点は保ち、入れ物は設営時に一度だけ作る。
    const cameraEye = new THREE.Vector3(), cameraLook = new THREE.Vector3();
    const clampDrawCamera = W.clampDrawCamera;
    W.clampDrawCamera = (camera) => {
      clampDrawCamera?.(camera);
      if (rt.game?.photo || rt.game?.deployment || rt.player.fpK >= .5) return;
      cameraEye.copy(rt.player.u.pos); cameraEye.y += 1.58;
      const hit = W.cameraBlockFraction(cameraEye, camera.position);
      if (hit === null) return;
      const distance = cameraEye.distanceTo(camera.position);
      camera.getWorldDirection(cameraLook).multiplyScalar(Math.max(4, distance)).add(camera.position);
      camera.position.lerpVectors(cameraEye, camera.position, Math.max(0, hit - .25 / Math.max(.25, distance)));
      camera.lookAt(cameraLook);
    };
    // 中央の持ち場と東からの寄せ道に薪火を置かず、槍を合わせる足場を空ける。
    for (const [x, z] of [[-6, LEVEE_Z + 13], [28, LEVEE_Z + 13], [-22, LEVEE_Z + 3], [34, LEVEE_Z + 3]]) {
      rt.scene.add(campfire(W, x, z)); W.addFire(x, z);
    }
    // ---- 石山本願寺（遠く、南東の台地の上） ----
    // 堂の個別の室内図は未確認。この戦の推定間取りで内陣・須弥壇・畳の外陣を復元する。
    F.honganBuildings = new Garan(rt);
    F.honganBuildings.build({ id: 'noda_mieido', name: '本願寺の御影堂', kind: 'hondo', profile: 'nodafukushima', x: HONGAN.x, z: HONGAN.z, w: 15, d: 9, rot: 0.6 + Math.PI, h: 4.2, enterable: true });
    F.honganBuildings.build({ id: 'noda_sobo', name: '本願寺の僧坊', kind: 'sobo', profile: 'nodafukushima', x: HONGAN.x - 22, z: HONGAN.z + 10, w: 10, d: 7, rot: 0.6, h: 3.6, enterable: true });
    F.honganBuildings.build({ id: 'noda_kuri', name: '本願寺の庫裏', kind: 'kuri', profile: 'nodafukushima', x: HONGAN.x + 14, z: HONGAN.z - 16, w: 10, d: 7, rot: 0.6, h: 3.6, enterable: true });
    F.honganBuildings.finish();
    nodaTempleTown(rt);
    // 御堂の手前の鐘楼。遠景の目印だけで、当たりと戦う兵は増やさない。
    const bellTower = new THREE.Group(), wood = castleMat('wood');
    const postGeo = new THREE.BoxGeometry(0.35, 5, 0.35);
    for (const x of [-1.5, 1.5]) for (const z of [-1.5, 1.5]) {
      const post = new THREE.Mesh(postGeo, wood); post.position.set(x, 2.5, z); bellTower.add(post);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.6, 4), wood); roof.rotation.y = Math.PI / 4; roof.position.y = 5.4; bellTower.add(roof);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.95, 1.7, 8), new THREE.MeshLambertMaterial({ color: 0x777150 })); bell.position.y = 3.7; bellTower.add(bell);
    F.bellGeos = [postGeo, roof.geometry, bell.geometry]; F.bellMat = bell.material;
    if (SETTINGS.quality === 'high') {
      // 鐘楼の架構は推定復元。四柱を貫で結び、左右の梁へ鐘を吊るす中央の梁を掛ける。
      // 梁は鐘の肩より上、貫は柱筋へ納め、下を歩く口を塞がない。
      // 貫・梁と屋根を受ける材は同じ形・材質を使い、設営時だけ行列を書く。
      const timberGeo = new THREE.BoxGeometry(1, 1, 1);
      const timbers = new THREE.InstancedMesh(timberGeo, wood, 28);
      const matrix = new THREE.Matrix4(), slopeMatrix = new THREE.Matrix4();
      const direction = new THREE.Vector3(), midpoint = new THREE.Vector3();
      const upright = new THREE.Vector3(0, 1, 0), rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      let index = 0;
      const timber = (x, y, z, w, h, d) => {
        matrix.makeScale(w, h, d); matrix.setPosition(x, y, z);
        timbers.setMatrixAt(index++, matrix);
      };
      for (const side of [-1, 1]) {
        timber(0, 4.55, side * 1.5, 3.5, .3, .35);
        timber(0, 2.35, side * 1.5, 3.6, .18, .16);
        // 交差する貫は高さをずらし、柱の中で同じ溝を奪い合わない。
        timber(side * 1.5, 2.55, 0, .16, .18, 3.6);
      }
      timber(0, 4.85, 0, .36, .36, 3.4);
      // 四角錐の底面で小屋裏を塞がず、四枚の薄い屋根で覆う推定復元。
      // 軒・棟の位置は従来と同じ。三角の屋根板も一つの形を四面で共用する。
      roof.visible = false;
      const eave = 3.2 / Math.SQRT2;
      const roofGeo = new THREE.BufferGeometry();
      roofGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        -eave, 4.6, eave, eave, 4.6, eave, 0, 6.2, 0,
        -eave, 4.52, eave, eave, 4.52, eave, 0, 6.12, 0,
      ], 3));
      roofGeo.setIndex([0, 1, 2, 5, 4, 3, 0, 3, 4, 0, 4, 1,
        1, 4, 5, 1, 5, 2, 2, 5, 3, 2, 3, 0]);
      roofGeo.computeVertexNormals();
      const roofFaces = new THREE.InstancedMesh(roofGeo, wood, 4);
      const rafter = (ax, ay, az, bx, by, bz, thickness) => {
        direction.set(bx - ax, by - ay, bz - az);
        scale.set(thickness, direction.length(), thickness);
        rotation.setFromUnitVectors(upright, direction.normalize());
        midpoint.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
        matrix.compose(midpoint, rotation, scale);
        timbers.setMatrixAt(index++, matrix);
      };
      for (let face = 0; face < 4; face++) {
        const angle = face * Math.PI / 2, c = Math.cos(angle), s = Math.sin(angle);
        slopeMatrix.makeRotationY(angle); roofFaces.setMatrixAt(face, slopeMatrix);
        // 垂木は隅木の内面で止め、屋根の頂部へ全本を突き通さない。
        for (const t of [-1.15, 0, 1.15]) {
          const end = Math.abs(t) + (t ? .12 : 0);
          rafter(t * c + eave * s, 4.46, -t * s + eave * c,
            t * c + end * s, 6.06 - end * 1.6 / eave, -t * s + end * c, .12);
        }
        rafter(eave * c + eave * s, 4.46, -eave * s + eave * c,
          0, 6.06, 0, .16);
        // 軒桁は垂木の下で受ける。正面と側面の木口を重ねない。
        if (face % 2 === 0) timber(0, 4.34, c * (eave - .08), eave * 2, .12, .16);
        else timber(s * (eave - .08), 4.34, 0, .16, .12, eave * 2 - .32);
      }
      // 鐘を吊るす中央梁の上から小屋束を立て、棟の受けへつなぐ。
      timber(0, (5.03 + 5.98) / 2, 0, .18, 5.98 - 5.03, .18);
      roofFaces.computeBoundingSphere(); bellTower.add(roofFaces);
      timbers.computeBoundingSphere(); bellTower.add(timbers);
      // 吊り環は梵鐘の頂部と中央梁の下端へ掛け、鐘を宙に浮かせない。
      const hangerGeo = new THREE.TorusGeometry(.11, .035, 4, 8);
      const hanger = new THREE.Mesh(hangerGeo, bell.material);
      hanger.position.set(0, 4.59, 0); bellTower.add(hanger);
      F.bellGeos.push(timberGeo, roofGeo, hangerGeo);
    }
    bellTower.position.set(HONGAN.x - 20, W.heightAt(HONGAN.x - 20, HONGAN.z - 24), HONGAN.z - 24); rt.scene.add(bellTower);
    for (const [x, z] of [[HONGAN.x - 20, HONGAN.z - 12], [HONGAN.x - 6, HONGAN.z - 20], [HONGAN.x + 8, HONGAN.z - 26]]) rt.scene.add(nobori(W, x, z, 'sagarifuji', 7));
    // ---- 織田勢：前田利家の手（自分の持ち場）、佐々成政の手、鉄砲衆 ----
    // 浅瀬と竹束の間で槍を揃える先頭の将は徒立ち。本陣・控えの騎馬は残す。
    F.maeda = allyGroup(rt, { fixed: true, name: '前田利家の手', anchor: { x: 0, z: LEVEE_Z + 6 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '前田利家', horse: false, invuln: true, allyOk: true } }, { type: 'ashigaru', n: 14 }], ODA));
    F.maedaU = F.maeda.units[0];
    F.sassa = allyGroup(rt, { fixed: true, name: '佐々成政の手', anchor: { x: -30, z: LEVEE_Z + 6 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '佐々成政', horse: false, invuln: true, allyOk: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 12 }], ODA));
    F.teppo = allyGroup(rt, { fixed: true, formation: 'line', name: '織田の鉄砲衆', anchor: { x: 26, z: LEVEE_Z + 2 }, facing: Math.PI, width: 12, aggro: 40, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 12 }], ODA));
    F.oda = [F.maeda, F.sassa, F.teppo];
    for (const g of F.oda) { g.defMult = 1; g.dmgMult = 1; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: -8, z: LEVEE_Z + 4 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 砦の鉄砲 ----
    F.fortGun = enemyGroup(rt, { faction: 'miyoshi', name: '砦の鉄砲', anchor: { x: 0, z: FORT_Z - 2.5 }, facing: 0, width: 30, aggro: 50, noRout: true, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 8 }, { type: 'bow', n: 3 }], MIYOSHI));
    // ---- 陣と旗・竹束の置き場 ----
    // 南東の退き口は名の不明な陣代と守兵。信長・義昭の海老江詰陣は二城の北で、この局地の外。
    F.campA = camp(rt, { x: ODA_HONJIN.x, z: ODA_HONJIN.z, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田の陣代', hat: 'kabuto_m', haori: 0x8a1a14 }, guard: 15, reserve: 300, runTo: { x: 0, z: LEVEE_Z + 10 } });
    rt.scene.add(tawara(W, ODA_HONJIN.x - 14, ODA_HONJIN.z - 14, 0.4, 6));
    for (const [x, z, k] of [[ODA_HONJIN.x - 6, ODA_HONJIN.z - 10, 'oda'], [ODA_HONJIN.x + 6, ODA_HONJIN.z - 10, 'eiraku'], [-40, 0, 'oda'], [40, 0, 'oda'], [-4, LEVEE_Z + 4, 'oda'], [30, LEVEE_Z + 5, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    F.pileMeshes = SPOTS.map((q) => { const m = takeTaba(W, q.x, q.z + PILE_BACK, Math.PI); registerTabaCamera(rt, m); rt.scene.add(m); return m; });
    // 堤の上に、はじめから据えてある竹束（鉄砲衆の前）。陰の者には砦からの矢玉がほとんど当たらない
    patchGunCover(rt);
    for (const [x, z] of LEVEE_TABA) this.cover(rt, x, z);
    // 岸の竹束の垣：先に据えた束を、運ぶ三束の置き場の間に並べる（一本だけの束にしない。10/29）。
    for (const [x, z] of [[-7, -21.6], [7, -21.6], [21, -20.4], [-22, -20.4]]) this.cover(rt, x, z);
    // 岸の竹束の列：据えた束の間を、見た目だけの束で埋めて一続きの垣にする（形と材質は共用。10/29）。
    for (const [x, z] of [[-29, -20.2], [-25.5, -20.3], [-18, -20.6], [-10.4, -21.3], [10.4, -21.3], [17.6, -20.6], [24.5, -20.3], [28, -20.2]]) {
      const m = takeTaba(W, x, z, Math.PI + (x % 3) * 0.02); registerTabaCamera(rt, m); rt.scene.add(m);
    }
    // ---- 大軍（軽い作り）：詰め陣の後ろの控え ----
    const DA = (x, z, w, d, count, facing, armor, tex, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: tex, seed });
    DA(40, 90, 36, 14, 240, Math.PI, 0x2a2622, flagTexture('oda'), 15703);
    // 堤の手前に構える織田の手（見た目だけ。起こさない）：竹束を据える所の左右に、川を挟んで砦と睨み合う大軍
    for (const [x, z, s, k] of [[-18, -5, 15704, 'oda'], [20, -4, 15705, 'eiraku']]) W.addDistantArmy({ x, z, w: 12, d: 10, count: 100, facing: Math.PI, armor: 0x2a2622, team: 0, flagTex: flagTexture(k), seed: s }).army.noWake = true;
    for (const [x, z] of [[-20, 60], [24, 64]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // ---- 部隊（butai.js）：囲む織田の手・野田と福島の三好勢。本物はほんの少し（遠くで戦う軽い作り。携帯の重さのため名目も小さめ） ----
    const mk = (o, real) => capReal(makeButai(rt, { real, lightWidth: 24, lightDepth: 18, ...o }), real);
    F.bOdaW = mk({ name: '柴田勝家の手', general: '柴田勝家', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 160, armor: 0x2a2622, flag: 'oda', at: { x: -82, z: 10 }, facing: Math.PI }, 0);
    F.bOdaE = mk({ name: '根来・雑賀の鉄砲衆', team: 0, faction: 'oda', kind: 'gun', nominal: 140, armor: 0x2a2622, flag: 'eiraku', at: { x: 84, z: 6 }, facing: Math.PI }, 0);
    F.bOdaS = mk({ name: '佐久間信盛の手', general: '佐久間信盛', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 150, armor: 0x2a2622, flag: 'oda', at: { x: 56, z: 34 }, facing: Math.PI * 0.75 }, 0);
    F.bNoda = mk({ name: '野田砦の三好勢（三好長逸）（仮）', team: 1, faction: 'miyoshi', kind: 'ashigaru', nominal: 100, armor: 0x35382c, flag: 'miyoshi', at: { x: 0, z: -63 }, lightWidth: 26, lightDepth: 10, facing: 0 }, 0);
    F.bFuku = mk({ name: '福島砦の三好勢（三好宗渭）（仮）', general: '三好宗渭', team: 1, faction: 'miyoshi', kind: 'ashigaru', nominal: 100, lightWidth: 20, lightDepth: 16, armor: 0x35382c, flag: 'miyoshi', at: { x: -122, z: -74 }, facing: 0.15 }, 0);
    F.bFukuGun = mk({ name: '福島砦の鉄砲', team: 1, faction: 'miyoshi', kind: 'gun', nominal: 40, lightWidth: 20, lightDepth: 4, armor: 0x35382c, flag: 'miyoshi', at: { x: -122, z: -61 }, facing: 0 }, 0);
    F.bSally = mk({ name: '浅瀬へ打って出た三好勢（岩成友通の手と仮定）', team: 1, faction: 'miyoshi', kind: 'ashigaru', nominal: 150, armor: 0x33302a, flag: 'miyoshi', at: { x: -82, z: -62 }, facing: 0 }, 0);
    for (const b of [F.bOdaW, F.bOdaE, F.bOdaS, F.bNoda, F.bFuku, F.bFukuGun, F.bSally]) b.order({ id: 'hold' });
    F.bAll = [F.bOdaW, F.bOdaE, F.bOdaS, F.bNoda, F.bFuku, F.bFukuGun, F.bSally];
    F.lightOda = [F.bOdaE, F.bOdaS];
    F.namedGuards = [];
    for (const [name, x, z, team, facing] of [['柴田勝家', -82, 16, 0, Math.PI], ['佐久間信盛', 56, 42, 0, Math.PI * 0.75], ['三好宗渭', -122, -84, 1, 0]]) {
      const o = { fixed: true, name: name + 'の旗本', anchor: { x, z }, facing, formation: 'yari', width: 7, aggro: 8, noRout: true, faction: team ? 'miyoshi' : 'oda' };
      const list = dress([{ type: 'busho', n: 1, o: { name, invuln: true, allyOk: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 5 }], team ? MIYOSHI : ODA);
      F.namedGuards.push(team ? enemyGroup(rt, o, list) : allyGroup(rt, { ...o, fullStrength: true }, list));
    }
    // 野田砦の奥（本陣の曲輪）の三好の本陣：三好長逸と旗本（控えは軽い兵）。旗本は整った陣形で待つ
    // 幅十六の陣幕は左右の詰所・長屋の中を横切る。幕と荷を中央の八歩へ収める。
    F.campB = camp(rt, { x: 0, z: -84, w: 8, compact: true, tate: false, facing: 0, team: 1, faction: 'miyoshi', mon: 'miyoshi', armor: 0x35382c, general: { name: '三好長逸', hat: 'kabuto_m', haori: 0, flag: 'miyoshi', flagScale: 2.2 }, guard: 15, reserve: 0, runTo: { x: 10, z: FORT_Z - 6 } });
    // 共通の本陣は旗の倍率を渡さないため、既存の大将の旗だけ一度拡大する。
    if (F.campB.general?.flag) F.campB.general.flag.scale.multiplyScalar(2.2);
    for (const u of F.campA.guard.units) { u.pos.z -= 27; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.mesh.position.copy(u.pos); }
    F.campA.guard.anchor.z = ODA_JOIN.z; // 南向きの幕の北側で退く兵を迎える。共通の camp は南側に置くため補正
    for (const c of [F.campA, F.campB]) if (c && c.guard) { c.guard.stay = true; c.guard.formation = 'yari'; if (c.general) c.general.allyOk = true; }
    F.sally = enemyGroup(rt, { faction: 'miyoshi', name: '砦の前の三好勢', anchor: { x: -4, z: -37 }, facing: 0, width: 12, aggro: 5, seekRange: 12, morale: 90, fleeDir: { x: 0, z: -1 }, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '岩成友通', horse: false, invuln: true, allyOk: true, flagScale: 2.2 } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }], MIYOSHI));
    // 本願寺の先陣は早鐘の後に畦道から出す。昼の浅瀬の斬り合いには加わらない。
    F.waves = []; F.waveJoined = []; F.wavePaid = []; F.heldWaves = 0;
    // ---- 持ち場の区域（siege_zones.js）：堤の上・織田の詰め陣（味方）、野田砦・福島砦（三好） ----
    const LZ = LEVEE_ZONE;
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'levee', name: '堤の持ち場', start: ZONE_STATE.FRIEND, test: (x, z) => x > LZ.x0 && x < LZ.x1 && z > LZ.z0 && z < LZ.z1, pos: { x: 0, z: LEVEE_Z }, need: 8, hold: 14 },
        { id: 'honjin', name: '織田の詰め陣', start: ZONE_STATE.FRIEND, test: (x, z) => Math.hypot(x - ODA_HONJIN.x, z - ODA_HONJIN.z) < ODA_HONJIN.r, pos: ODA_HONJIN, need: 8, hold: 16 },
        // kaito 10/1：野田・福島の hold を 20→14 に詰めた（遊んで10分ほどかかる戦を4〜7分に）
        { id: 'noda', name: '野田砦', test: F.noda.kuruwa.kishi.test, pos: F.noda.kuruwa.kishi.centroid, need: 10, hold: 14 },
        { id: 'fuku', name: '福島砦', test: F.fuku.kuruwa.kishi.test, pos: F.fuku.kuruwa.kishi.centroid, need: 10, hold: 14 },
      ],
      friendTeam: 0, enemyTeam: 1,
      noReinforce: () => true,
      onFall: (id) => this.onZone(rt, id),
    });

    rt.world.setTime('after');
    rt.setPhase('brief');
    rt.obj('main', '利家の下知を聞け', 'main', true);
    rt.say('前田利家', '竹束を印へ押せ。鉄砲衆の盾じゃ', 5);
    rt.banner('砦の鉄砲を、竹束でしのぐ', rt.G.lord ? '足軽に竹束を押させ、堤で備えよ' : '一束はあなた、二束は味方。印へ押せ');
    // 印の前田に寄って話を聞けば、すぐに次へ（寄らなくても下知は来る）
    rt.marker('maeda', unitPos(F.maedaU), '前田利家（話を聞く）', {});
    rt.addInteract('talk', { x: 0, z: LEVEE_Z + 6 }, '前田利家の話を聞く', () => { rt.uninteract('talk'); rt.say('前田利家', rt.G.lord ? '殿、竹束はいずこへ据えまするか' : 'よし、竹束を川べりへ押し出せ', 2); rt.after(2, () => this.carryStart(rt)); }, { r: 5 });
    rt.after(5, () => this.carryStart(rt));
    // 砦との撃ち合いの音（遠くで絶えず）
    F.shotT = 3;
    F.shotPos = { x: 0, z: 0 };
    for (const x of [-49, 49]) for (const z of [LEVEE_Z + 5, -15]) rt.scene.add(nobori(W, x + (x < 0 ? -2 : 2), z, 'oda', 4));
    this.carryStart(rt); // 下知を聞きながら、味方が二束を押す場面で始める。
  },

  // 竹束（弾よけ）の当たり
  cover(rt, x, z) {
    // 見た目と「陰の者に前からの矢玉がほとんど当たらない」は taketaba.js の竹束（据え置き）。当たりはここで足す
    addNodaTaba(rt, x, z, 0, { fixed: true, rot: Math.PI, detailed: true });
    const s = rt.army.addStruct({ seg: [x - 0.9, z, x + 0.9, z], nx: 0, nz: -1, hp: 1e9, maxHp: 1e9, team: 0, name: '竹束' });
    s.noTarget = true;
    return s;
  },

  // ① 竹束を運ぶ。本人の一束と、前田の足軽二組の二束を同時に押す。
  carryStart(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    F.tabaReady = false;
    rt.setPhase('carry');
    rt.unmark('maeda'); rt.uninteract('talk');
    F.spots = SPOTS.map((q) => ({ ...q }));
    F.tabaDone = [false, false, false]; F.tabaHelpers = []; F.pickIndex = 0;
    // 目の前の利家と竹束の案内。遠い本陣の使番待ちで、初めの任務を残さない。
    rt.obj('main', HI(rt) || rt.G.lord ? '竹束の置き場を選べ。中央か西か' : '竹束を長押しで押せ', 'main', true);
    const begin = (i) => {
      if (F.step !== 1 || F.tabaReady) return;
      // 置き場を決めてから運ぶ時間を数え、判断の待ち時間を引かない。
      F.tabaReady = true; F.stepT = rt.t;
      rt.unmark('tabaCenter'); rt.unmark('tabaWest');
      if (i === 1) for (const q of F.spots) q.x -= 16;
      rt.obj('main', rt.G.lord ? '堤で運び手を守れ。太鼓で総攻め' : '竹束を長押しで押せ', 'main', true);
      rt.say('前田利家', rt.G.lord ? '三束とも足軽に押させ申す。殿、堤の守りにも御下知を' : '竹束を印へ押せ。二束は味方じゃ', 3.5);
      this.startTabaHelpers(rt);
      this.nextPick(rt);
    };
    if (HI(rt) || rt.G.lord) rt.after(2, () => {
      if (F.step !== 1) return;
      // 既存の戦場・地図の印を使い、選んだら候補の印を消す。
      rt.marker('tabaCenter', SPOTS[0], '候補・中央（鉄砲衆の前）', { h: 2 });
      rt.marker('tabaWest', { x: -16, z: SPOTS[0].z }, '候補・西（浅瀬寄り）', { h: 2 });
      rt.choose('前田「竹束は中央か、西の浅瀬寄りか？」', [
        { label: '中央に並べる', note: '鉄砲衆の前へ据える' },
        { label: '西に並べる', note: '西の浅瀬近くへ据える' },
      ], begin, 15);
    });
    else begin(0);
  },
  // 川へ下りず、胸壁の端を回る。竹束そのものが全ての角を通る。
  tabaRoute(mesh, spot) {
    const edge = spot.x < 0 ? -49 : 49;
    const path = [];
    if (mesh.position.z > LEVEE_Z - 4) {
      path.push({ x: mesh.position.x, z: LEVEE_Z + 5 });
      path.push({ x: edge, z: LEVEE_Z + 5 });
      path.push({ x: edge, z: -15 });
    }
    path.push({ x: spot.x, z: Math.min(-15, mesh.position.z) }, spot);
    return path;
  },
  startTabaHelpers(rt) {
    const F = rt.flags, source = F.maeda;
    for (let i = rt.G.lord ? 0 : 1; i < SPOTS.length; i++) {
      if (F.tabaDone[i] || F.tabaHelpers.some((h) => h.i === i && !h.done)) continue;
      const workers = source.units.filter((u) => u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget && !u.atk && !u.target?.alive && u.type === 'ashigaru').slice(-2);
      if (workers.length < 2) continue;
      const mesh = F.pileMeshes[i];
      const g = rt.army.addGroup({ team: 0, faction: 'oda', name: '竹束を押す足軽', order: 'hold', formation: 'line', width: 2, spacing: 1.2, aggro: 0, noRout: true, anchor: { x: mesh.position.x, z: mesh.position.z + 1.3 } });
      for (const u of workers) {
        source.units.splice(source.units.indexOf(u), 1);
        u.group = g; u.slot = g.units.length; u.target = null; u.moveTo = null; u.aiT = 0;
        g.units.push(u);
      }
      source.initial = source.units.length;
      source.units.forEach((u, j) => { u.slot = j; });
      g.initial = g.units.length;
      placeGroup(rt, g, g.anchor.x, g.anchor.z); // 堤の前へ運んだ場面から、二人で押し始める。
      F.tabaHelpers.push({ i, g, mesh, path: this.tabaRoute(mesh, F.spots[i]), at: 0, next: { x: 0, z: 0 } });
    }
  },
  returnTabaWorkers(rt, h) {
    const source = rt.flags.maeda;
    for (const u of h.g.units) {
      u.group = source; u.slot = source.units.length; u.moveTo = null; u.aiT = 0;
      u.body.rotation.x = 0;
      source.units.push(u);
    }
    source.initial = source.units.length;
    h.g.units.length = 0; h.g.initial = 0; h.done = true;
  },
  tickTabaHelpers(rt, dt) {
    const F = rt.flags;
    for (const h of F.tabaHelpers || []) {
      if (h.done) continue;
      if (h.g.units.some((u) => !u.alive || u.fleeing || u.woundOut)) { this.returnTabaWorkers(rt, h); this.nextPick(rt); continue; }
      const q = h.path[h.at], m = h.mesh.position;
      const dx = q.x - m.x, dz = q.z - m.z, d = Math.hypot(dx, dz);
      if (d < 0.2) {
        if (++h.at < h.path.length) continue;
        this.cover(rt, m.x, m.z); rt.scene.remove(h.mesh);
        F.tabaDone[h.i] = true; F.placed++;
        this.returnTabaWorkers(rt, h);
        this.tabaProgress(rt);
        continue;
      }
      const nx = dx / d, nz = dz / d;
      h.g.anchor.x = m.x - nx * 1.3; h.g.anchor.z = m.z - nz * 1.3;
      h.g.facing = Math.atan2(nx, nz);
      for (const u of h.g.units) if (!u.atk && !u.target?.alive) {
        u.body.rotation.x = 0.12; u.armL.rotation.x = u.armR.rotation.x = -1.1;
      }
      // 実兵が追いつき、交戦していない時だけ押す。隊の要だけで束を進めない。
      let ready = true; h.blocked = false;
      for (const u of h.g.units) if (!u.alive || u.fleeing || u.woundOut || u.stagger > 0 || u.atk || u.target?.alive || Math.hypot(u.pos.x - h.g.anchor.x, u.pos.z - h.g.anchor.z) > 2) ready = false;
      if (!ready) continue;
      const step = Math.min(d, dt * 0.9);
      h.next.x = m.x + nx * step; h.next.z = m.z + nz * step;
      h.blocked = !rt.world.walkable(h.next.x, h.next.z) || rt.army.wallBetween(m, -1, h.next);
      if (h.blocked) continue;
      m.set(h.next.x, rt.world.heightAt(h.next.x, h.next.z), h.next.z);
      h.mesh.rotation.y = h.g.facing;
    }
  },
  // 置き場や一度置いた実物から押し始める。向きを変えても束を移さない。
  backTaba(rt, on) {
    const F = rt.flags;
    if (on) F.backMesh = F.pileMeshes[F.pickIndex];
    else if (F.backMesh) { rt.scene.remove(F.backMesh); F.backMesh = null; }
  },
  nextPick(rt) {
    const F = rt.flags;
    if (F.carry || F.step !== 1) return;
    const i = F.tabaDone.findIndex((done, j) => !done && !F.tabaHelpers.some((h) => h.i === j && !h.done));
    rt.uninteract('pile'); rt.unmark('pile');
    if (i < 0 || rt.G.lord) return;
    F.pickIndex = i;
    rt.obj('main', '竹束を長押しで押せ', 'main', true);
    const pos = F.pileMeshes[i].position;
    rt.marker('pile', pos, i > 0 ? '残りの竹束' : '竹束', { h: 2.6, guideAlways: true, alwaysDistance: true });
    rt.addInteract('pile', pos, '竹束を押す', () => {
      F.carry = true;
      this.backTaba(rt, true);
      F.carryPrev = { x: rt.player.u.pos.x, z: rt.player.u.pos.z };
      F.carryNext = { x: 0, z: 0 };
      F.carryPath = this.tabaRoute(F.backMesh, F.spots[i]); F.carryAt = 0;
      rt.uninteract('pile'); rt.unmark('pile');
      rt.obj('main', '道の印へ押し、長押しで据えよ', 'main', true);
      rt.marker('tabaWay', () => F.carry ? F.carryPath[F.carryAt] : null, '運び道・この印へ押す', { h: 2, guideAlways: true, alwaysDistance: true });
      const s = F.spots[i];
      rt.marker('spot', s, '竹束を据える', { h: 2 }); rt.zone('spot', s.x, s.z, 2);
      rt.addInteract('spot', s, '竹束を据える', () => this.place(rt), { r: 2.8, hold: 1.2, prio: 4 });
      rt.addInteract('tabaDrop', rt.player.u.pos, '竹束を置いて向きを変える', () => {
        F.carry = false; F.backMesh = null;
        rt.uninteract('spot'); rt.uninteract('tabaDrop'); rt.unmark('spot'); rt.unmark('tabaWay'); rt.unzone('spot');
        this.nextPick(rt);
        rt.bark('竹束を置いた。反対側へ回り、長押しで押せ');
      }, { r: 3, hold: 0.8 });
      rt.bark('道の印へ押せ。つかえたら置き、反対側へ回れ');
    }, { r: 3, hold: 0.8, prio: 1 });
  },
  place(rt) {
    const F = rt.flags, s = F.spots[F.pickIndex];
    if (!F.carry || Math.hypot(F.backMesh.position.x - s.x, F.backMesh.position.z - s.z) > 2.8) { rt.bark('竹束を据える印へ押せ'); return; }
    // 据え位置への瞬間移動を避け、運んだ実物の場所へ据える。
    this.cover(rt, F.backMesh.position.x, F.backMesh.position.z);
    rt.uninteract('spot'); rt.uninteract('tabaDrop'); rt.unmark('spot'); rt.unmark('tabaWay'); rt.unzone('spot');
    F.tabaDone[F.pickIndex] = true; F.placed++; F.carry = false;
    this.backTaba(rt, false);
    rt.award((t) => { t.special = { label: '竹束を据えた', pts: (t.special?.pts || 0) + 4 }; }, '竹束を据えた');
    if (!F.tabaPraise) {
      F.tabaPraise = true;
      rt.say('鉄砲衆', '盾が据わった！　これで狙える。槍の者、援けるぞ！', 3);
    }
    this.tabaProgress(rt); this.nextPick(rt);
  },
  tabaProgress(rt) {
    if (rt.flags.placed >= SPOTS.length) {
      rt.award((t) => t.side.push('組で竹束を並べた'), '組で竹束を並べた');
      this.sallyStart(rt);
    }
    else rt.objProgress('main', `竹束 ${rt.flags.placed}／${SPOTS.length}束。残りの竹束を押せ`);
  },

  // ② 織田の総攻め。浅瀬を渡り、打って出た三好勢を押し戻す
  sallyStart(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('assault');
    // 運び終えた下知を待ち列から外す。総攻め中に「竹束を押せ」を読み上げない。
    const oldCarryOrder = line => line.speaker === '前田利家' && /竹束.*(?:押せ|押させ)|二束は味方/.test(line.text);
    for (let i = rt.hud.subQ.length - 1; i >= 0; i--) if (oldCarryOrder(rt.hud.subQ[i])) rt.hud.subQ.splice(i, 1);
    if (rt.hud.shownLine && oldCarryOrder(rt.hud.shownLine)) rt.hud.nextSub();
    // 据えきれない束はその場に残し、運び手も槍の列へ戻す。
    F.carry = false; F.backMesh = null;
    for (const h of F.tabaHelpers || []) if (!h.done) this.returnTabaWorkers(rt, h);
    for (const id of ['pile', 'spot', 'tabaWay', 'tabaDrop', 'tabaCenter', 'tabaWest']) { rt.uninteract(id); rt.unmark(id); }
    rt.unzone('spot');
    // 総攻めは間を詰める陣太鼓と法螺。退きの二つ打ちとは節を分ける。
    sfx('sig_kakari', 0.8);
    rt.obj('main', '太鼓だ。味方と浅瀬へ', 'main', true);
    rt.marker('assault', { x: 0, z: -21 }, '浅瀬の入口', { h: 2, guideAlways: true, alwaysDistance: true });
    rt.say('前田利家', F.placed >= SPOTS.length ? '陣太鼓だ、掛かれ！　竹束は据わったぞ。鉄砲衆、放て！　槍の者は浅瀬へ続け！' : '陣太鼓だ、掛かれ！　束は置け、鉄砲衆は槍の者を援けよ！', 3.5);
    F.teppo.order = 'move'; F.teppo.dest = { x: 0, z: LEVEE_Z - 1 }; F.teppo.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: 0, z: LEVEE_Z - 1 }; };
    rt.after(7, () => {
      if (F.step !== 2) return;
      // 砦の門の前（土橋の外）から、竹束を押し立てて浅瀬をゆっくり渡り、渡りきったら堤へ掛かる（束5：攻め手は竹束で寄せる）
      F.sally.name = '打って出た三好勢';
      F.sally.order = 'move'; F.sally.dest = { x: -2, z: LEVEE_Z - 13 }; F.sally.speed = 1.3;
      const charge = (g) => { if (g.order === 'attack') return; g.order = 'attack'; g.seekRange = 70; g.aggro = 14; rt.say('岩成友通', '竹束を捨てよ！　堤へ掛かれ！', 2.5); };
      F.sally.onArrive = charge;
      rt.after(8, () => { if (F.step === 2 && !gone(F.sally)) charge(F.sally); });
      for (const off of [-4, 0, 4]) addNodaTaba(rt, -4 + off, -34, 1, { van: F.sally, off, faceSign: 1, vanDist: 3, rot: 0, detailed: true });
      // 西では、福島から渡った三好の本隊と柴田の手が、堤の西の端の向こうで押し合う（軽い作り）
      F.bSally.order({ id: 'move', to: { x: -82, z: -26 } });
      F.bOdaW.order({ id: 'move', to: { x: -122, z: -40 } });
      F.bOdaE.order({ id: 'move', to: { x: 60, z: -16 } });
      F.clashW = true;
      // 門内から土橋へ続く三好の控え。同じ百人を細い列へ組み、前線までの奥行きを見せる。
      // 本物には替えず、中央の攻め手の背へ追従もさせない。
      const rear = rt.world.addBacking({ x: 0, z: -47, facing: 0, flag: 'miyoshi', armor: 0x33302a, kind: 'spear', w: 7, depth: 18, gap: 4, count: 100, seed: 15707 });
      rear.army.noWake = true;
      rear.army.team = F.sally.team;
      (F.backs = F.backs || []).push({ b: rear, g: F.sally });
      // 左右でも、浅瀬を渡る織田の大軍が二つの砦へ押し寄せる（軽い作り）
      F.lines = lines(rt, [
        { x: -82, z: -18, facing: Math.PI, w: 20, measuredMelee: true, seed: 15708, A: ['oda', 0x2a2622, 90, 'oda'], B: ['miyoshi', 0x33302a, 100, 'miyoshi'], gunsA: true, gunsB: true },
        { x: 60, z: -15, facing: Math.PI, w: 20, measuredMelee: true, seed: 15709, A: ['oda', 0x2a2622, 80, 'oda'], B: ['miyoshi', 0x33302a, 100, 'miyoshi'], gunsB: true },
      ]);
      F.lines.forEach((c, i) => rt.after(2 + i * 2, () => c.go()));
      rt.army.play('eshout', { x: 0, z: -40 }, 1.6);
      rt.banner('野田・福島へ総攻め', '鉄砲衆が放つ。浅瀬へ三好の槍が出る');
      rt.obj('main', '味方と浅瀬の敵を防げ', 'main', true);
      // 敵を防ぐ間は南岸の入口へ合流させる。対岸へ進む印は三好勢が退いてから出す。
      rt.marker('assault', { x: 0, z: -21 }, '浅瀬・味方と防ぐ', { h: 2, guideAlways: true, alwaysDistance: true });
      rt.say('前田利家', '三好が出たぞ！　浅瀬で食い止めよ、槍先を下げるな！', 3.5);
      rt.after(5, () => rt.say('前田利家', '泥に足を取られるぞ。浅瀬を選べ、深みへ踏み込むな', 3.5));
      // 一斉射：鉄砲衆は竹束の陰で込めたまま待ち、三好勢が浅瀬を上りきる所で揃えて放つ
      volleyScene(rt, { guns: () => [F.teppo], at: { x: 0, z: LEVEE_Z - 6 }, r: 12, who: '前田利家', shots: 3, wait: 'まだ撃つな……浅瀬を上りきるまで待て',
        banner: ['一斉射', '竹束の陰から、鉄砲衆が揃えて放つ'], clash: () => F.lines });
      // 浅瀬の行き先は既存の印で示す。斜面を横切る半径二十二の輪は重ねない。
      rt.marker('sally', centerOf(F.sally), '三好の槍の列', { red: true, group: F.sally });
      // 西へ偏った二段の横陣では端の持ち場が深みに入る。三段に詰め、浅瀬の左右へ通す。
      for (const [g, x] of [[F.maeda, 6], [F.sassa, -6]]) {
        g.yariRanks = 3;
        g.order = 'move'; g.dest = { x, z: -37 }; g.aggro = 14;
        g.onArrive = (q) => { q.order = 'hold'; q.anchor = q.dest; };
      }
    });
  },

  // ②の後の段（昼）：中洲を押さえて砦へ迫る → ③へ
  midA(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5;
    F.recoveryShown = false; rt.unmark('recover');
    rt.botRest = false; // 次の段の退避判断へ渡し、前の休止で攻撃を止めない。
    rt.unmark('sally'); rt.unmark('assault'); rt.unzone('levee');
    if (!late) rt.award((t) => t.side.push('打って出た三好勢を退けた'), '三好勢を退けた');
    F.sallyDone = !late;
    if (late) rt.say('前田利家', 'ここは押し切れぬ。砦の口を押さえ、備えを崩すな', 3.5);
    F.midT = rt.t;
    rt.obj('main', '砦前の印で並べ。塀の奥へ入るな', 'main', true);
    rt.marker('assault', { x: 0, z: -37 }, '砦の口・槍を揃える', { h: 2, guideAlways: true, alwaysDistance: true });
    rt.say('前田利家', '門は固い。印で槍を揃えよ。塀の奥へ入るな', 3.5);
  },
  // 退き口を保ったら、敵を追わず囲みを解く
  midB(rt) {
    if (rt.flags.step !== 3) return;
    rt.flags.step = 3.5;
    this.win(rt);
  },

  // ③ 夜、本願寺の早鐘
  night(rt, late = false) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('night');
    rt.unmark('sally'); rt.unmark('assault');
    rt.obj('main', '早鐘だ。堤の味方へ戻れ', 'main', true);
    rt.marker('leveeHold', { x: 8, z: LEVEE_Z + 4 }, '堤の持ち場', { h: 2, guideAlways: true, alwaysDistance: true, hideNear: 12, hideOnArrival: true });
    rt.unzone('levee');
    if (!late && !F.sallyDone) rt.award((t) => t.side.push('打って出た三好勢を退けた'), '三好勢を退けた');
    // 三好の守りは崩れていない。織田の攻めを止める。
    for (const c of F.lines || []) c.phase = 'wait'; // 既存の待機状態へ戻し、敗走と消去を起こさない
    // 本願寺の側（南東）から寄せる一揆の大群と、堤の東の端の味方が押し合う（軽い作り）
    rt.after(4, () => {
      if (F.ending) return;
      F.lines2 = lines(rt, [{ x: 28, z: 4, facing: Math.PI * 0.25, w: 22, gap0: 12, measuredMelee: true, seed: 15710, surge: false, A: ['oda', 0x2a2622, 120, 'oda'], B: ['namu', IKKO.armor, 180, 'honganji'], gunsB: true }]);
      F.lines2.forEach((c) => c.go());
      leanAll(F.lines2, 'B', 0.3);
    });
    dayCut(rt, 13, 'night', '九月十三日夜・本願寺の寄せ', '楼の岸と川口へ鉄砲の火。早鐘で堤へ戻れ');
    // 寺の早鐘は低く響く梵鐘の乱れ打ち。陣鉦の高い金物音と区別する。
    rt.after(3, () => { if (F.step === 3 && !F.retreating && !F.ending) sfx('bellRapid', 0.7); });
    // 本願寺の台地から、松明を持った門徒の列が下りてくる（遠景）
    F.monto = rt.world.addDistantArmy({ x: 92, z: 78, w: 12, d: 34, count: 160, facing: -Math.PI * 0.75, armor: IKKO.armor, team: 1, flagTex: namuTex(), seed: 15706 });
    F.monto.army.noWake = true;
    rt.after(6, () => { if (F.monto.advance) F.monto.advance(50, 70); });
    // 炎も門徒の列と同じ移動量で進める。遠い炎に光や煙の枠を費やさない。
    F.remoteTorches = [];
    for (let k = 0; k < 7; k++) {
      const x = 80 + k * 3.5, z = 66 + k * 3.5, f = rt.world.addFire(x, z, { torch: true, h: 2.2 });
      f.lit = false;
      if (f.smoke != null) { rt.world.removeSmokeColumn(f.smoke); f.smoke = null; }
      F.remoteTorches.push({ x, z, f });
    }
    rt.world.addFire(HONGAN.x - 20, HONGAN.z - 24, { torch: true, h: 3.7 }).lit = false;
    rt.after(4, () => {
      rt.say('足軽', '……本願寺の鐘だがや！　後ろから松明が寄ってくるぞ！', 3.5);
      rt.say('前田利家', '本願寺の早鐘だ！　堤へ返せ、背後の寄せを受けよ！', 4.5);
    });
    rt.after(160, () => {
      if (F.step !== 3 || F.ending) return;
      F.kyotoNews = true;
      dayCut(rt, 22, 'day', '対陣を重ねて・九月二十二日', '浅井・朝倉が醍醐・山科を焼いた');
      battleEvent(rt, EVENT_MESSENGER, { x: 6, z: LEVEE_Z + 3 }, null, 0, true, '浅井・朝倉が京へ迫る知らせ');
      rt.say('伝令', '浅井・朝倉が京へ迫る！　醍醐・山科が焼かれた！', 4.5);
      rt.obj('main', '堤を守り、退きの下知を待て', 'main', true);
      rt.after(6, () => rt.say('前田利家', '京を敵に踏ませるわけにはゆかぬ。退き口を固めよ！', 3.5));
    });
    // 本願寺の方に篝火
    for (const [x, z] of [[120, 120], [100, 96], [134, 90]]) {
      rt.scene.add(campfire(rt.world, x, z)); rt.world.addFire(x, z);
    }
    // 槍兵の両手は槍に使う。夜の明かりは持ち場の薪火から受ける。
    // 味方は堤の上で南東を向く
    for (const [g, x] of [[F.maeda, 6], [F.sassa, -16], [F.teppo, 22]]) {
      g.onArrive = null; g.order = 'hold'; g.anchor = { x, z: LEVEE_Z + 3 }; g.facing = Math.PI * 0.2; g.aggro = 14;
      if (g !== F.teppo) { g.formation = 'yari'; g.width = 10; }
      // 将の列は台本どおり保ち、無名の槍兵だけは近い敵と斬り合えるようにする。
      if (g !== F.teppo) { g.noAI = true; g.ai = true; g.frontlineMobilize = true; }
    }
    // 同じ夜の戦いを十二日夜と十三日夜へ重複させない。新手の数・時機は変えない。
    rt.after(45, () => { if (F.step === 3 && !F.ending) rt.say('伝令', '楼の岸と川口へ本願寺の鉄砲！　堤の口を守れ！', 3.5); });
    rt.after(95, () => { if (F.step === 3 && !F.ending) dayCut(rt, 14, 'day', '九月十四日・堤の戦い', '天満が森から本願寺勢。春日井堤で迎え撃つ'); });
    // 本願寺の門徒の大群（butai.js・軽い作り）。寄せる道は攻めの頭（siege_ai.js の makeAttackAI）が、
    // 守りの厚さ・道の長さ・口の狭さに揺らぎを掛けて選ぶ（毎回同じ道で来ない）。本物の斬り合いは下の波（名のある組）
    if (F.bSally && !bDead(F.bSally)) F.bSally.order({ id: 'retreat' });
    F.clashW = false;
    const face = Math.atan2(46 - 130, 4 - 120);
    const mkI = (name, x, z, kind, n, gen) => capReal(makeButai(rt, { name, general: gen, team: 1, faction: 'honganji', kind, nominal: n, real: 0, lightWidth: 24, lightDepth: 16, armor: IKKO.armor, flag: 'namu', at: { x, z }, facing: face }), 0);
    F.bIkko = [mkI('本願寺の門徒', 128, 118, 'ashigaru', 140), mkI('門徒の新手', 118, 132, 'ashigaru', 120), mkI('鉄砲を持った門徒', 140, 110, 'gun', 80)];
    F.AA = makeAttackAI(rt, { attackers: F.bIkko, routes: IKKO_ROUTES, feintChance: 0.6, feintShare: 0.34 });
    // 早鐘と同時に東の畦の先勢が寄せ、後続は南の畦・堤の東端から続く。
    rt.after(3, () => this.wave(rt, 0));
    rt.after(30, () => this.wave(rt, 1));
    rt.after(65, () => this.wave(rt, 2));
    rt.after(105, () => this.wave(rt, 3));
    rt.after(140, () => this.wave(rt, 4));
  },
  wave(rt, i) {
    const F = rt.flags;
    if (F.ending || F.retreating || F.step !== 3 || F.waves[i]) return;
    // 遠景の大軍は続くが、近くの斬り合いは一組ずつ。押し返す間を作る。
    // 京の知らせの直前まで詰まった新手は出さず、撤退中へ持ち越さない。
    if (rt.t - F.stepT >= 155) return;
    let near = 0;
    // 待つ判定は実際の持ち場と本人の近くへそろえる。
    // 三十二歩先で止まった四人が、次の全組を締切まで止めない。
    // 浅瀬に残った三好も数えるが、柵越しの残兵では後続を止めない。
    // 遠くで玉込めする鉄砲衆だけが残っても、堤へ来る槍の列は続ける。
    // 本人の十歩以内は兵種を問わず数え、近い敵へ新手を重ねない。
    const p = rt.player.u;
    for (const u of rt.army.units) {
      if (u.team === p.team || u.isStruct || u.farSim || u.civ || u.type === 'dummy' || !canJoin(u)) continue;
      if (rt.army.wallBetween(u.pos, -1, p.pos) || rt.army.terrainBlocks(u.pos, p.pos)) continue;
      if (u.type !== 'gun' && u.type !== 'bow' && Math.hypot(u.pos.x - 8, u.pos.z - LEVEE_Z - 4) < 18 ||
          Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 10) near++;
    }
    // まだ斬り合う列へ次の十数人を重ねない。
    // 持ち場の敵が減るまで新手を畦で待たせ、同時に待っていた波も間をあける。
    if (near >= 4 || rt.t < (F.waveNextAt || 0)) { rt.after(8, () => this.wave(rt, i)); return; }
    // 第一陣は東の畦へ先に回った門徒の小勢。堤の持ち場（8, -4）から約19mの所で早鐘に応じる。
    // 遠い大群を待たず、砦前から戻る間にも近づく。後続は元の畦道の口から出す。
    // 出る場所は固定し、本人の位置に合わせて背後へ移さない。兵数は既存の上限内。
    const route = i % 3;
    const [x, z] = i === 0 ? [26, 2] : [[46, 12], [50, 24], [54, 0]][route];
    const g = enemyGroup(rt, { faction: 'honganji', name: ['一揆勢', '一揆勢の新手', '鉄砲を持った門徒', '堤へ寄せる門徒', '畦道の門徒'][i], anchor: { x, z }, facing: Math.atan2(6 - x, LEVEE_Z - z), aggro: 16, seekRange: 45, width: 10, yariRanks: 3, morale: 95, fleeDir: { x: 0.6, z: 0.8 }, formation: i === 2 ? 'line' : 'yari', arriveCount: 3, arriveRadius: 6 },
      // 一度に出る近い列を十〜十三人に抑える。大群の遠景と五度の寄せは保つ。
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: [8, 10, 8, 8, 8][i] }, { type: 'gun', n: i === 0 ? 1 : i === 2 ? 4 : 2 }], IKKO));
    // 先陣は川の南の畦をそのまま進む。遠景用の遠い入口へ戻る道順と、途中の後列待ちは作らない。
    // 堤で待つ本人の槍が届く所まで寄せ、先頭三人の到着で斬り合いへ移る。
    const end = [[16, 0], [12, 4], [20, -3]][route];
    g.order = 'move'; g.dest = { x: end[0], z: end[1] }; g.speed = 3.2;
    g.fire = true; g.aggro = 16; g.seekRange = 45;
    g.onArrive = (v) => {
      v.order = 'attack'; v.seekRange = 60; v.aggro = 16;
      this.waveFocus(rt, v, i);
    };
    F.waves[i] = g;
    // 五組が来られる間を取る。四十五秒だと五組目は百五十五秒の締切に間に合わない。
    // 目の前に四人以上いる間は、上の判定で引き続き待たせる。
    F.waveNextAt = rt.t + 30;
    rt.army.play('eshout', { x, z }, 1.8);
    rt.say('一揆の門徒', ['南無阿弥陀仏、南無阿弥陀仏！', '南無阿弥陀仏！　仏敵の信長を討て！', '横から回れ！　退き口を塞げ！', '堤の口へ続け！', '畦から寄せよ！　槍を揃えろ！'][i], 3.5);
    g.ikko = true;
    rt.marker('w' + i, centerOf(g), g.name, { red: true, group: g });
    // 寄せ道の薪火。持ち手のない炎を空中に置かない。
    const fireX = x + 7, fireZ = z + 6;
    rt.scene.add(campfire(rt.world, fireX, fireZ)); rt.world.addFire(fireX, fireZ);
  },

  // 門徒は堤の近い槍の列へ寄せる。本人だけを優先せず、壁・川越しには追わせない。
  waveFocus(rt, g, i) {
    const p = rt.player.u;
    let target = null, best = 45;
    const c = g.center();
    c.y = rt.world.heightAt(c.x, c.z);
    const consider = (u) => {
      if (!u.alive || u.fleeing || u.woundOut || u.downed || u.rearWound || u.invuln || u.noTarget || u.isStruct || u.farSim || u.gone || u.pos.z < -16 || Math.abs(u.pos.y - c.y) > 3) return;
      const d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z);
      if (d < best && !rt.army.wallBetween(c, -1, u.pos) && !rt.army.terrainBlocks(c, u.pos)) { best = d; target = u; }
    };
    for (const u of rt.flags.maeda.units) consider(u);
    for (const u of rt.flags.sassa.units) consider(u);
    for (const u of rt.flags.teppo.units) consider(u);
    for (const u of rt.squad) consider(u);
    consider(p);
    // 先頭が味方と接したら寄せを斬り合いへ替える。三人の整列を待つと、
    // 先頭だけが戦い、後列が歩く下知の六歩の索敵範囲に残ってしまう。
    if (g.order === 'move') {
      if (!target || best > 8) return;
      g.order = 'attack'; g.onArrive = null;
    }
    g.focus = target;
  },

  // 京の危機の知らせを受け、目標は「城を落とせ」から「囲まれる前に退け」に変わり、織田の撤退で終わる
  win(rt) {
    const F = rt.flags;
    if (F.ending || F.retreating) return;
    F.retreating = true; F.retreatT = rt.t; F.retreatPoint = { x: 0, z: 0 };
    rt.unmark('recover'); F.recoveryShown = false;
    rt.setPhase('retreat');
    rt.unmark('leveeHold');
    battleEvent(rt, EVENT_RETREAT, ODA_HONJIN, F.maeda, 0, true, '囲みを解き、詰め陣へ退く');
    for (const g of F.oda) {
      retreatColumn(g, { x: ODA_HONJIN.x + (g === F.sassa ? -14 : 12), z: ODA_HONJIN.z });
    }
    retreatColumn(F.namedGuards[1], { x: 28, z: 96 });
    // 詰め陣の守兵も追撃をやめ、退く兵を迎える場所へ戻す。
    retreatColumn(F.campA.guard, ODA_JOIN);
    F.bOdaW.order({ id: 'hold' }); // 柴田は殿に残る
    for (const b of [F.bOdaE, F.bOdaS]) b.order({ id: 'retreat', to: { x: 28, z: 96 } });
    for (let i = 0; i < F.waves.length; i++) rt.unmark('w' + i);
    dayCut(rt, 23, 'day', '翌日・囲みを解く', 'しんがりを残し、江口へ退く');
    sfx('sig_nobiki', 0.8);
    rt.say('伝令', '退き太鼓だ！　詰め陣の守兵へ戻れ。しんがりが支える！', 4.5);
    rt.obj('main', '退き太鼓。詰め陣の印へ退け', 'main', true);
    rt.marker('retreat', ODA_JOIN, '詰め陣の守兵', { h: 3, guideAlways: true, alwaysDistance: true });
    rt.zone('retreat', ODA_JOIN.x, ODA_JOIN.z, 10);
  },
  winEnd(rt) {
    const F = rt.flags;
    if (F.ending) return;
    rt.unmark('retreat'); rt.unzone('retreat');
    F.ending = true;
    rt.setPhase('end');
    for (let i = 0; i < F.waves.length; i++) rt.unmark('w' + i);
    // 自分の帰着で敵軍を敗走させない。後続を殿が支えている間に隊列へ戻る。
    rt.world.setTime('day');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '囲まれる前に退いた', pts: (t.special?.pts || 0) + 20 }; }, '囲みを解き、退き口へ帰着');
    sfx('horagai', 0.6);
    rt.banner('織田、野田・福島から撤退', '砦を落とす前に攻めを止め、京へ兵を返す');
    rt.say('前田利家', F.holdMerit ? `${nm(rt)}、その方らが堤を保った。味方の帰る道を開いた働き、忘れぬぞ` : `${nm(rt)}、よう戻った。生きて槍を持ち帰るのも手柄じゃ`, 4.5);
    rt.after(5, () => rt.say('', '――九月二十三日、信長は砦を落とせず囲みを解いた。江口の川を渡り、京へ兵を返す。', 3.5));
    rt.after(9, () => rt.say('前田利家', '次は近江じゃ。浅井・朝倉が京へ迫る。味方の列を離れるな', 3.5));
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 14);
  },
  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player;
    // 振りが遅くなる三割より先に知らせる。六割へ戻るまで出し直さない。
    if (p.sta >= p.maxSta * 0.6) F.breathWarned = false;
    if (!F.ending && p.u.alive && !F.breathWarned && p.sta <= p.maxSta * 0.4 && rt.t - (F.breathWarnAt ?? -Infinity) >= 120) {
      F.breathWarned = true; F.breathWarnAt = rt.t;
      // 字の札は出さない（Simple is the best）。息の上がりは本人の動きと息の音で分かる。
    }
    F.waterFeet?.(dt);
    nodaPeople(rt);
    // 背後の槍が届く少し前に知らせる。半秒ごと、同じ札は八秒以上あける。
    if (!F.ending && !rt.over && p.u.alive && rt.t >= (F.rearScanAt || 0)) {
      F.rearScanAt = rt.t + 0.5;
      if (rt.t - (F.rearWarnAt ?? -Infinity) >= 8) for (const u of rt.army.units) {
        if (!u.alive || u.team === p.u.team || u.isStruct || u.farSim || u.fleeing || u.noTarget || u.woundOut || u.gone || u.downed || u.rearWound || (u.wpnKind || u.lookWeapon || u.weapon) !== 'spear') continue;
        const dx = u.pos.x - p.u.pos.x, dz = u.pos.z - p.u.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.1 || d > Math.max(5, u.reach + 2) || Math.abs(u.pos.y - p.u.pos.y) > 1.8 || (dx * Math.sin(p.u.heading) + dz * Math.cos(p.u.heading)) / d >= -0.35 || rt.army.wallBetween(p.u.pos, -1, u.pos)) continue;
        // 近くの味方へ向く槍を、本人の背後への攻撃と取り違えない。
        // 槍先が本人へ向き、本人を狙うか、まだ相手を選んでいない兵だけ知らせる。
        if ((u.target && u.target !== p.u) ||
            (-dx * Math.sin(u.heading) - dz * Math.cos(u.heading)) / d < 0.5 ||
            rt.army.terrainBlocks(u.pos, p.u.pos)) continue;
        F.rearWarnAt = rt.t;
        rt.hud.flash('後ろに槍！　振り向いて、味方の列へ下がれ', 'warn');
        break;
      }
    }
    if (F.remoteTorches) for (const c of F.remoteTorches) {
      const off = F.monto.army.off, f = c.f;
      f.x = c.x + off.x; f.z = c.z + off.z;
      f.base = rt.world.heightAt(f.x, f.z) + 2.2 + f.size * 0.3;
      f.flame.position.set(f.x, f.base, f.z); f.inner.position.set(f.x, f.base - f.size * 0.08, f.z);
      f.glow.position.set(f.x, rt.world.heightAt(f.x, f.z) + 0.06, f.z);
    }
    if (!F.ending && !F.retreating && rt.player.u.alive && rt.t >= F.reloadScanAt) {
      F.reloadScanAt = rt.t + 0.2;
      if (rt.t >= F.reloadSayAt) for (const u of rt.army.units) {
        // 火と煙が出た鉄砲だけ。塀の奥・背後・不発・遠い撃ち合いでは声を出さない。
        if (u.team === rt.player.u.team || u.type !== 'gun' || !u.alive || u.fleeing || u.woundOut || u.noTarget || !(u.fireT > 0) || !u.reload || !sightPoint(rt, u.pos, 50, false, 1.4)) continue;
        F.reloadSayAt = rt.t + 40;
        rt.say('組頭', F.step >= 3 ? '敵が放った！　堤を守れ！' : F.step === 2.5 ? '敵が放った！　砦前で味方と並べ！' : ['敵が放った！　玉込めの間に詰めよ！', '煙が上がった！　味方と寄せよ！'][F.reloadVoice++ % 2], 2.5);
        break;
      }
    }
    if ((F.step === 2 || F.step === 3) && !F.retreating && rt.t >= (F.pressureAt || 0)) {
      // 夜の門徒の狙いは waveFocus で近い味方へ分ける。共通の寄せで全組を本人へ向け直さない。
      pressureTick(rt, F.step, F.step === 2 ? [F.sally] : NO_GROUPS, [F.maeda, F.sassa], '');
      // 持ち場は任務札に残す。三十秒おきの同じ下知は出さない。
      F.pressureSayAt = Infinity;
    }
    KIT.backTick(rt);
    butaiTick(rt, dt);
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.retreating && !F.ending) {
      const pp = rt.player.u.pos, d = Math.hypot(pp.x - ODA_JOIN.x, pp.z - ODA_JOIN.z);
      // 退く列の後方に追手がいても合流できる。槍の届く敵と斬り合う最中は終えない。
      // 塀・川の向こうや深手の兵を、退き口を塞ぐ追手に数えない。
      const safe = !rt.army.nearestEnemy(rt.player.u, 4, u => canJoin(u) && !u.isStruct && !u.farSim && u.type !== 'dummy' &&
        Math.abs(u.pos.y - pp.y) < 3 && !rt.army.wallBetween(pp, -1, u.pos) && !rt.army.terrainBlocks(pp, u.pos));
      let joined = campJoinAvailable(rt);
      const rear = F.namedGuards[1];
      const c = retreatPoint(rt);
      if ((!joined || F.retreatAlt) && c) {
        if (!F.retreatAlt) {
          F.retreatAlt = true; rt.unzone('retreat');
          rt.obj('main', '退き太鼓。佐久間の列へ退け', 'main', true);
          rt.marker('retreat', () => retreatPoint(rt), '佐久間の列', { h: 3, group: rear, guideAlways: true, alwaysDistance: true });
          rt.say('前田利家', '陣の口は崩れた。南東へ退く佐久間の列に合流せよ！', 3);
        }
        joined = true;
        if (joined && safe && Math.hypot(pp.x - c.x, pp.z - c.z) < 6 &&
            !rt.army.wallBetween(pp, -1, c) && !rt.army.terrainBlocks(pp, c) && rt.player.u.alive) { this.winEnd(rt); return; }
      }
      if (F.retreatAlt && !c) joined = false;
      // 携帯で先頭の一行だけでも、到着後に合流できない理由を読めるようにする。
      const retreatText = !joined ? '合流する味方がいない。退き口が危ない' :
        !safe ? '追手が近い。味方の列へ下がれ' :
        F.retreatAlt ? '佐久間の列へ退け' : '詰め陣の守兵へ退け';
      if (F.retreatText !== retreatText) { F.retreatText = retreatText; rt.obj('main', retreatText, 'main', true); }
      rt.objProgress('main', safe ? (F.retreatAlt ? '佐久間の印へ退き、列に合流せよ' : '詰め陣の印へ退き、守兵に合流せよ') : '追手が近い。味方の槍の列へ戻れ');
      if (joined) F.retreatLostT = 0;
      if (!joined) {
        const occupied = F.SZ?.byId.honjin?.owner === ZONE_STATE.ENEMY;
        // 二つの合流先がともに崩れた時は、存在しない守兵へ走らせ続けない。
        F.retreatLostT = (F.retreatLostT || 0) + dt;
        rt.objProgress('main', occupied ? `詰め陣を奪い返せ。あと${Math.max(0, Math.ceil(8 - F.retreatLostT))}秒` : `合流する味方がいない。あと${Math.max(0, Math.ceil(8 - F.retreatLostT))}秒で退き口を失う`);
        if (F.retreatLostT >= 8 && rt.canFailMission()) {
          F.ending = true; rt.setPhase('end'); rt.objFail('main'); rt.tracker.main = false;
          rt.unmark('retreat'); rt.unzone('retreat');
          rt.banner('退き口を失った', occupied ? '詰め陣の守兵が崩れ、追手が退き口を占めた' : '詰め陣と退く列の守りが崩れ、合流できなかった');
          rt.finish({ scriptedEnd: true, failureReason: '退き口で合流する味方の守りが崩れた' }, 8); return;
        }
      }
      if (!F.retreatAlt && d < 10 && safe && joined && rt.player.u.alive &&
          F.campA.guard.units.some(u => canJoin(u) && Math.hypot(pp.x - u.pos.x, pp.z - u.pos.z) < 10 &&
            !rt.army.wallBetween(pp, -1, u.pos) && !rt.army.terrainBlocks(pp, u.pos))) this.winEnd(rt);
      else if (rt.t - F.retreatT > 35 && !F.retreatCall) { F.retreatCall = true; rt.say('前田利家', F.retreatAlt ? '追手に構うな！　佐久間の印へ退き、列に合流せよ！' : '追手に構うな！　詰め陣の守兵に合流せよ！', 3); }
      // 合流できないまま追手との戦いが続いても、終わりのない任務にしない。
      // 時間切れは成功にせず、味方が先に退いた結果として終える。
      const left = RETREAT_WAIT - (rt.t - F.retreatT);
      if (!F.ending && left <= 30) {
        rt.objProgress('main', `味方が先に退くまで${Math.max(0, Math.ceil(left))}秒。退き口の印へ急げ`);
        if (!F.retreatLastCall) { F.retreatLastCall = true; rt.say('前田利家', '列が先に退くぞ！　印へ急げ、取り残されるな！', 3); }
        if (left <= 0 && rt.canFailMission()) {
          F.ending = true; rt.setPhase('end'); rt.objFail('main'); rt.tracker.main = false;
          rt.unmark('retreat'); rt.unzone('retreat');
          rt.banner('退く列に間に合わなかった', '味方は先に退いた。合流できず、戦を終える');
          rt.finish({ scriptedEnd: true, failureReason: '退く列へ合流する前に、味方が先に退いた' }, 8); return;
        }
      }
    }
    if (F.ending || !rt.player.u.alive) return;
    updateGates();
    tickTabas(rt, dt);
    if (F.fordWatch) F.fordWatch.tick();
    if (F.SZ) {
      const p = rt.player.u.pos;
      if (F.step >= 2 && F.step < 3) {
        if (F.noda.kuruwa.kishi.test(p.x, p.z)) F.joined_noda = true;
        if (F.fuku.kuruwa.kishi.test(p.x, p.z)) F.joined_fuku = true;
        for (let i = 0; i < 2; i++) {
          const id = i ? 'fuku' : 'noda';
          if (F['joined_' + id] && F.SZ.byId[id].owner === ZONE_STATE.FRIEND && !F['paid_' + id]) {
            F['paid_' + id] = true;
            const name = F.SZ.byId[id].name;
            rt.award((t) => t.side.push(`${name}の岸に踏み込んだ`), `${name}の岸に踏み込んだ`);
          }
        }
      }
      F.SZ.tick(dt);
    }
    if (F.AA && F.step === 3 && !F.retreating) F.AA.tick(dt);
    this.tickLight(rt, dt);
    if (F.retreating) return;
    // 砦との撃ち合い（遠くの鉄砲の音と煙）
    // 夜も遠くの撃ち合いは弱く続く（昼も夜も絶えなかったと伝わる）
    if ((F.shotT -= dt) <= 0) {
      const night = rt.world.timeKey === 'night';
      F.shotT = night ? 4 + Math.random() * 6 : 1.2 + Math.random() * 2.5;
      let gun = null;
      if (!gone(F.fortGun) && !F.fortGun.holdFire) for (const u of F.fortGun.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget && u.type === 'gun' && u.target?.alive && !u.reload) { gun = u; break; }
      if (gun) {
        F.shotPos.x = gun.pos.x; F.shotPos.z = gun.pos.z;
        rt.army.play('gun', F.shotPos, night ? 0.3 : 0.5);
        rt.army.smoke(gun.pos.x, gun.pos.y + 1.4, gun.pos.z, 0, 1, 0.6);
      }
    }
    if (F.step === 1) {
      this.tickTabaHelpers(rt, dt);
      // 本人と束を同じ歩幅で動かす。回転だけで束が岸や土塁を越えない。
      if (F.carry && F.backMesh && Math.hypot(rt.player.u.pos.x - F.backMesh.position.x, rt.player.u.pos.z - F.backMesh.position.z) > 3.5) {
        F.carry = false; F.backMesh = null;
        rt.uninteract('spot'); rt.uninteract('tabaDrop'); rt.unmark('spot'); rt.unmark('tabaWay'); rt.unzone('spot');
        this.nextPick(rt); rt.bark('竹束から離れた。戻って長押しで押せ');
      }
      if (F.carry && F.carryPrev) {
        const u = rt.player.u, m = F.backMesh.position, prev = F.carryPrev, next = F.carryNext;
        const dx = (u.pos.x - prev.x) * 0.6, dz = (u.pos.z - prev.z) * 0.6;
        next.x = m.x + dx; next.z = m.z + dz;
        if (rt.player.canStep(m.x, m.z, next.x, next.z, m.y) && !rt.army.wallBetween(m, -1, next)) {
          u.pos.x = prev.x + dx; u.pos.z = prev.z + dz;
          m.set(next.x, rt.world.heightAt(next.x, next.z), next.z);
        } else {
          u.pos.x = prev.x; u.pos.z = prev.z;
          if (rt.t - (F.carryWarnAt ?? -99) >= 8) { F.carryWarnAt = rt.t; rt.bark('竹束がつかえた。置いて反対側へ回れ'); }
        }
        u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
        F.backMesh.rotation.y = rt.player.yaw;
        prev.x = u.pos.x; prev.z = u.pos.z;
        const q = F.carryPath[F.carryAt];
        if (F.carryAt < F.carryPath.length - 1 && Math.hypot(m.x - q.x, m.z - q.z) < 1.8) F.carryAt++;
      }
      if (rt.G.lord && rt.t >= (F.helperRetryT || 0)) {
        F.helperRetryT = rt.t + 8; this.startTabaHelpers(rt);
      }
      let help = '';
      for (const h of F.tabaHelpers) {
        if (h.done || Math.hypot(h.mesh.position.x - rt.player.u.pos.x, h.mesh.position.z - rt.player.u.pos.z) > 24 || !sightPoint(rt, h.mesh.position)) continue;
        help = h.blocked ? '竹束がつかえた。道を空けよ' : h.g.units.some((u) => u.atk || u.target?.alive) ? '運び手が襲われた。味方と守れ' : h.g.units.some((u) => u.stagger > 0) ? '運び手が負傷。そばを守れ' : h.g.units.some((u) => Math.hypot(u.pos.x - h.g.anchor.x, u.pos.z - h.g.anchor.z) > 2) ? '運び手の到着を待て' : '運び手のそばを守れ';
        break;
      }
      if (F.step === 1) rt.objProgress('main', !F.tabaReady ? '置き場を選んでから竹束を押す' : `竹束 ${F.placed}／${SPOTS.length}・` + (F.carry ? '据える印へ押し、長押し' : help || (rt.G.lord || F.tabaDone[F.pickIndex] ? '堤で待て。味方が竹束を押す' : '竹束の印へ。長押しで押せ')));
      // 運べなかった束は残す。据えた事にせず、総攻めの合図で準備を切り上げる。
      if (F.tabaReady && rt.t - F.stepT >= CARRY_WAIT) this.sallyStart(rt);
      if (F.step === 1 && F.tabaReady && !rt.G.lord && rt.t - F.stepT > 8 && !F.carry && !F.placed && !F.carryCall) { F.carryCall = true; rt.say('前田利家', `${nm(rt)}、その竹束を押せ。味方の鉄砲衆を矢玉から守るのじゃ`, 4); }
    }
    if (F.step === 2 && F.sally) {
      // 包囲の知らせと「押せ」を並べない。危険が去って四秒してから攻めの下知へ戻す。
      if (p.u.mobbed || rt.army.playerMobbed) F.assaultSafeUntil = rt.t + 4;
      const safe = rt.t < (F.assaultSafeUntil || 0);
      if (p.sta < p.maxSta * 0.4) F.assaultRest = true;
      else if (p.sta >= p.maxSta * 0.6) F.assaultRest = false;
      const bind = p.treatmentLeft > 0 && p.treatmentNext <= rt.t &&
        (p.u.hp < p.u.maxHp * 0.5 || p.u.wounds?.bleed > 0.0001);
      const resting = F.assaultRest || bind;
      F.assaultResting = resting;
      const rear = safe || resting ? recoveryPoint(rt) : null;
      const atRest = rear && Math.hypot(p.u.pos.x - rear.x, p.u.pos.z - rear.z) < 2;
      if (!!rear !== !!F.recoveryShown) {
        F.recoveryShown = !!rear;
        if (rear) rt.marker('recover', () => F.recoveryFound ? F.recoveryPoint : null, '味方の後ろ・休む所', { h: 1.6, guideAlways: true, alwaysDistance: true, hideNear: 2 });
        else rt.unmark('recover');
      }
      const assaultText = safe ? rear ? '休む印へ退け' : '味方の列へ退け' :
        resting ? bind && p.treatmentReady ? '「血を止める」を三秒押せ' : rear ? atRest ? bind ? '止まって手当てを待て' : '止まって休め' : '休む印へ退け' : bind ? '味方の後ろへ退き、血を止めよ' : '味方の後ろで息を整えよ' :
        gone(F.sally) ? '浅瀬を渡り、砦前の印へ' : '味方と浅瀬の敵を防げ';
      let assaultOrder = null;
      for (const order of rt.objectives) if (order.id === 'main') { assaultOrder = order; break; }
      if (assaultOrder?.text !== assaultText) rt.obj('main', assaultText, 'main', true);
      rt.objProgress('main', safe ? '敵へ向いたまま、味方の後ろへ下がれ' : resting ?
        bind && p.treatmentReady ? '味方に守られた所で、血を止める' :
        rear ? atRest ? bind ? '血を止める札が出たら三秒押せ' : '印で止まり、息を整えよ' : '印まで下がれ。着いたら止まって休め' : bind ? '味方の後ろで止まり、血を止める札を待て' : '味方の後ろで止まれ。敵が近ければ下がれ' :
        gone(F.sally) ? '浅瀬を渡り、砦前の印へ' : '味方の槍の列と進め。一人で前へ出るな');
      if (gone(F.sally) && !F.nightAt) {
        F.nightAt = rt.t;
        // 渡った後の札を「浅瀬の先」のままにせず、次に並ぶ所と揃える。
        rt.marker('assault', { x: 0, z: -37 }, '砦前・味方と並ぶ', { h: 2, guideAlways: true, alwaysDistance: true });
        rt.say('前田利家', '敵は退いたぞ！　浅瀬を越え、砦の口へ詰めよ！', 3.5);
      }
      // 攻めが膠着したら対陣へ移る。敵を倒した手柄にはしない。
      if (!F.nightAt && rt.t - F.stepT > 85 && Math.hypot(rt.player.u.pos.x, rt.player.u.pos.z + 37) < 18) {
        F.sally.onArrive = null; F.sally.focus = null; F.sally.order = 'retreat';
        this.midA(rt, true);
      }
      if (F.nightAt && rt.t >= F.nightAt && Math.hypot(rt.player.u.pos.x, rt.player.u.pos.z + 37) < 18) this.midA(rt);

    }
    if (F.step === 2.5) {
      rt.objProgress('main', '砦前の印で並べ。塀の奥へ入るな');
      if (rt.t - F.midT > 3 && !F.bellNews) {
        F.bellNews = true; rt.say('物見', '後ろの畦に人影だがや！　味方か、敵か……', 3.5);
      }
      if (rt.t - F.midT > 6 && Math.hypot(rt.player.u.pos.x, rt.player.u.pos.z + 37) < 18) this.night(rt, true);
    }
    if (F.step === 3 && !F.retreating) {
      // 門徒の波だけでなく、浅瀬から残った三好勢も休息前に見る。
      // 柵や土手の向こうの敵では構えを解く案内を止めない。
      if (rt.t >= (F.holdThreatAt || 0)) {
        F.holdThreatAt = rt.t + 0.5;
        F.holdThreat = !!rt.army.nearestEnemy(p.u, 12, u => canJoin(u) && !u.isStruct && !u.farSim &&
          u.type !== 'dummy' && u.type !== 'porter' && !u.civ && Math.abs(u.pos.y - p.u.pos.y) < 3 &&
          !rt.army.wallBetween(p.u.pos, -1, u.pos) && !rt.army.terrainBlocks(p.u.pos, u.pos));
      }
      if (rt.t >= (F.waveFocusAt || 0)) {
        F.waveFocusAt = rt.t + 5;
        F.waveNear = false; F.waveApproaching = false;
        // 五組とも退いた後は、もう来ない新手を待つ札にしない。
        F.wavesCleared = F.waves.length === 5;
        for (let i = 0; i < F.waves.length; i++) {
          const g = F.waves[i];
          if (!g) { F.wavesCleared = false; continue; }
          if (!gone(g)) {
            F.wavesCleared = false;
            if (g.order === 'move' || g.order === 'attack') this.waveFocus(rt, g, i);
            const c = g.center(), p = rt.player.u.pos;
            if (Math.hypot(p.x - 8, p.z - LEVEE_Z - 4) < 22 && Math.hypot(p.x - c.x, p.z - c.z) < 24) F.waveJoined[i] = true;
            // 移動の下知だけでは、畦でつかえた隊にも「敵が来る」と出続ける。
            // 持ち場へ実際に近づく兵だけで予告し、離れた間は息を整えられるようにする。
            for (const u of g.units) {
              if (!canJoin(u)) continue;
              const dx = 8 - u.pos.x, dz = LEVEE_Z + 4 - u.pos.z, d2 = dx * dx + dz * dz;
              if (d2 < 18 * 18) F.waveNear = true;
              if (g.order === 'move' && d2 < 48 * 48 && u.moving > 0.1 &&
                  u.vel.x * dx + u.vel.z * dz > 0.1) F.waveApproaching = true;
            }
          } else if (F.waveJoined[i] && !F.wavePaid[i]) {
            F.wavePaid[i] = true; F.heldWaves++;
            if (F.heldWaves === 1) rt.say('佐々成政', '一組押し返したぞ！　追うな、堤で息を整えよ！', 3);
          }
        }
      }
      // 堤の持ち場の状態。日付の進みを占領の秒数で止めない。
      const lv = F.SZ && F.SZ.byId.levee;
      const held = !lv || lv.owner === ZONE_STATE.FRIEND;
      // 携帯の一行目にも、到着後に待ってよい事を示す。下知が変わる時だけ札を直す。
      // 境目で「防げ」と「休め」を毎コマ交互に出さない。
      if (p.u.mobbed || rt.army.playerMobbed) F.holdSafeUntil = rt.t + 4;
      const safe = rt.t < (F.holdSafeUntil || 0);
      if (p.sta < p.maxSta * 0.4) F.holdRest = true;
      else if (p.sta >= p.maxSta * 0.6) F.holdRest = false;
      const rest = F.holdRest;
      const bind = p.treatmentLeft > 0 && p.treatmentNext <= rt.t &&
        (p.u.hp < p.u.maxHp * 0.5 || p.u.wounds?.bleed > 0.0001);
      const rear = safe || bind || rest ? recoveryPoint(rt) : null;
      const atRest = rear && Math.hypot(p.u.pos.x - rear.x, p.u.pos.z - rear.z) < 2;
      const recover = !!rear;
      if (recover !== !!F.recoveryShown) {
        F.recoveryShown = recover;
        if (recover) rt.marker('recover', () => F.recoveryFound ? F.recoveryPoint : null, '味方の後ろ・休む所', { h: 1.6, guideAlways: true, alwaysDistance: true, hideNear: 2 });
        else rt.unmark('recover');
      }
      // 知らせの時刻を予知させず、堤で続ける役目を示す。新手と退く時機は変えない。
      const holdText = safe ? rear ? '休む印へ退け' : '味方の列へ退け' :
        bind && p.treatmentReady ? '「血を止める」を三秒押せ' :
        rear ? atRest ? bind ? '止まって手当てを待て' : '止まって休め' : '休む印へ退け' :
        bind ? '味方の後ろへ退き、血を止めよ' :
        rest ? '味方の後ろへ退け' :
        !held ? '味方と堤を奪い返せ' :
        Math.hypot(rt.player.u.pos.x - 8, rt.player.u.pos.z - LEVEE_Z - 4) > 12 ? '堤の印で味方と防げ' :
        F.waveNear || F.holdThreat ? '堤を守れ。敵を追うな' :
        F.kyotoNews ? '退き口を守り、太鼓を待て' :
        F.wavesCleared ? '寄せを退けた。堤で下知を待て' :
        F.waveApproaching ? '敵が来る。堤で味方と待て' : '堤で休め。敵が来たら防げ';
      let currentOrder = null;
      for (const order of rt.objectives) if (order.id === 'main') { currentOrder = order; break; }
      if (F.holdText !== holdText || currentOrder?.text !== holdText) { F.holdText = holdText; rt.obj('main', holdText, 'main', true); }
      if (held && F.heldWaves >= 2 && !F.holdMerit) {
        F.holdMerit = true;
        rt.award((t) => t.side.push('味方と堤の二組を押し返した'), '退き口を保った');
        rt.say('前田利家', `${nm(rt)}、よう支えた！　退く道は保てた。京の知らせが来たら兵を返せるぞ`, 4);
      }
      if (!held && !F.leveeLostSaid) { F.leveeLostSaid = true; F.leveeLostAt = rt.t; rt.say('前田利家', '堤を奪い返せ！　退き口を塞がれては一人も帰れぬぞ！', 3.5); }
      rt.objProgress('main', safe ? '敵へ向いたまま、味方の後ろへ下がれ' : bind || rest ? rear ? !atRest ? '印まで下がれ。着いたら止まって休め' : bind ? '血を止める札が出たら三秒押せ' : '印で止まり、息を整えよ' : '敵が近い。味方と下がれ' : !held ? '味方と堤を奪い返せ' : F.kyotoNews ? (F.holdMerit ? '退き口は保てた。味方と下知を待て' : '堤で退き口を守り、下知を待て') : F.waveNear || F.holdThreat ? '堤の味方と敵を防げ。追わず、列を守れ' : F.wavesCleared ? '寄せを退けた。追わず、堤で下知を待て' : F.waveApproaching ? '敵が近づいている。堤の味方と迎えよ' : '敵が離れた。追わず、堤で構えを解け');
      // 京を守る撤退命令は、局地の奪い返しや本人の帰着を待たない。
      // 堤を失っても退き口へ向かわせ、安全に味方へ合流できた時だけ成功にする。
      if (rt.t >= 240 && rt.t - F.stepT > (F.holdMerit ? 168 : 185) && F.kyotoNews) this.midB(rt);
    }
  },

  // 軽い部隊どうしの押し合い（遠くの戦い）。昼は堤の西の端の向こう、夜は一揆の大群と織田の手
  tickLight(rt, dt) {
    const F = rt.flags;
    if (F.clashW && !bDead(F.bSally) && !bDead(F.bOdaW) && bDist(F.bSally, F.bOdaW) < 30) lightClash(F.bSally, F.bOdaW, dt, 0.35);
    if (F.step !== 3 || !F.bIkko || !F.AA) return;
    if (!F.oaSent && rt.t >= (F.lookT || 0)) {
      F.lookT = rt.t + 2;
      for (const b of F.bIkko) if (!bDead(b) && sightPoint(rt, bPos(b), 90)) {
        F.oaSent = true; rt.say('足軽', '畦の向こうに門徒の旗だがや！　みな、槍を揃えろ！', 3.5); break;
      }
    }
    // 寄せた大群は、いちばん近い織田の手と押し合う（堤の東・南の畦の外で。軽い作り）
    for (const b of F.bIkko) {
      if (bDead(b)) continue;
      let o = null, dist = 42;
      for (const q of F.lightOda) {
        if (bDead(q)) continue;
        const d = bDist(b, q);
        if (d < dist) { o = q; dist = d; }
      }
      if (o) lightClash(b, o, dt, 0.3);
    }
  },
  // 持ち場の区域の持ち主が変わった（siege_zones.js の onFall）
  onZone(rt, id) {
    const F = rt.flags;
    const z = F.SZ && F.SZ.byId[id];
    if (!z) return;
    if ((id === 'noda' || id === 'fuku') && z.owner === ZONE_STATE.FRIEND && !F['took_' + id]) {
      F['took_' + id] = true;
      if (F['joined_' + id] && !F['paid_' + id]) {
        F['paid_' + id] = true;
        rt.award((t) => t.side.push(`${z.name}の岸に踏み込んだ`), `${z.name}の岸に踏み込んだ`);
      }
      rt.say('前田利家', F.step < 3 ? '岸は押さえたぞ！　奥の鉄砲に備え、砦の口を固めよ' : '砦は捨て置け！　堤へ返し、味方の退く道を保て', 3);
    }
    if (id === 'honjin' && z.owner === ZONE_STATE.ENEMY && rt.t >= (F.honjinWarnT || 0)) {
      F.honjinWarnT = rt.t + 8; rt.say('伝令', '詰め陣に敵が入り申した！　退き口が危のうござる！', 3);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    // 一揆勢は三好の数に入れず、別に数える
    if (v.team === 1 && v.group && v.group.ikko) F.ikkoK = (F.ikkoK || 0) + 1;
    else if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    g._routSaid = true; rt.flags.routSayT = rt.t + 8;   // 隊ごとに一度・間を 8 秒（崩れて立て直す隊が同じ一言を繰り返さない。10/2）
    rt.say('足軽', `${g.name}が退くぞ！　追わんでええ！`, 2.5);
  },
};

// 両軍の総勢（織田 三万ほど、野田・福島の三好勢 八千ほど。本願寺の一揆勢は数に入れない。数には諸説ある）
nodafukushima.force = () => ({ a: 30000, a0: 30000, b: 8000, b0: 8000 });
nodafukushima.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '三好勢・本願寺勢', mon: 'miyoshi' } };
nodafukushima.noWake = true;   // 遠景を本物に替えず、組を含めて約二百人に収める
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
nodafukushima.famous = []; // 頼廉の局地配置は確認できず、軽い備と本物への重複配置も避ける。
nodafukushima.date = (rt) => `元亀元年九月${rt.flags.day || 12}日${(rt.flags.day || 12) <= 13 && rt.flags.step >= 3 ? 'の夜' : ''}・秋・${rt.flags.retreating ? '撤退' : rt.flags.step >= 3 ? '本願寺と対陣' : '砦攻め'}`;
nodafukushima.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '竹束の下知まで待つ' : '');
nodafukushima.skip = (rt) => { if (rt.phase === 'brief') nodafukushima.carryStart(rt); };
nodafukushima.history = '『信長公記』巻三による。元亀元年（1570）八月、信長は二城の南東約五千歩の天王寺に本陣を置き、摂津の野田・福島に籠る三好勢を囲んだ。九月十二日には足利義昭と二城の北約十町の海老江に詰陣し、土手や櫓を築いて砦へ攻め寄せた。根来・雑賀・湯川など紀伊の鉄砲衆も加わり、昼夜の銃撃が続いた。十二日の早鐘と蜂起が伝わる一方、公記の本文には十三日夜の楼の岸・川口への射撃が記される。十四日には天満が森から出た本願寺勢と春日井堤で戦い、佐々成政、前田利家らが掛かり合った。一方、浅井・朝倉は坂本口へ進み、二十一日には逢坂を越えて醍醐・山科を焼いた。二十二日に知らせを受けた信長は、京への乱入を防ぐため、二十三日に野田・福島から撤退。柴田勝家と和田惟政を殿とし、江口では一揆勢が渡し舟を隠す中、浅くなっていた川を徒歩で渡った。砦の落城による勝利ではなく、志賀の陣へ兵を返した戦である。遊びでは数日にわたる総攻め・蜂起・知らせ・撤退を続く段にまとめ、砦への仕寄りと十四日の堤の戦いを同じ局地で表す。夜の段の日付は公記の十三日夜に合わせる。二城の西は海、北・東・南は川で囲む。南東の退き口には名の不明な陣代を置く。北の海老江にいた信長・義昭の詰陣と、遠い天王寺の本陣は場外。信長で遊ぶ時だけは、この退き口を仮の持ち場とする。城の向き・寸法、各将の持ち場、水路と天気は推定。見える兵は近辺の一部で、織田三万・三好八千は総勢の目安。江口の渡河は戦後の解説だけに残す。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
nodafukushima.lordAt = { x: ODA_HONJIN.x, z: ODA_HONJIN.z - 4, r: 12, why: '南東の退き口（信長で遊ぶ時の仮の持ち場。史実の海老江詰陣は二城の北、場外）' };
nodafukushima.lordSpawn = { x: ODA_HONJIN.x, z: ODA_HONJIN.z - 8, heading: Math.PI };

// 素直な遊び手：竹束を据え、浅瀬を渡って攻め、早鐘の後は堤へ戻って退く
const nearIt = (b, id) => b.interacts.find((x) => x.id === id);
// 休む所へ移る間も、近い槍へ背を向けない。道案内の回り道を後ずさりでたどる。
function restBackstep(b, inp, goTo, x, z, r) {
  const p = b.player, u = p.u;
  goTo(p, inp, x, z, r);
  const foe = b.army.nearestEnemy(u, 5, o => canJoin(o) && !o.isStruct && !o.farSim &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
  if (!foe) return; // 間合いの外で構えを解き、気力を戻す。
  inp.guardHold = true;
  const moving = inp.k.has('KeyW'), way = p.yaw;
  p.yaw = Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
  if (moving) {
    // 退く道と敵の向きは別。横の敵にも正面を向けたまま、道案内の向きへ足を運ぶ。
    const forward = Math.cos(way - p.yaw), side = -Math.sin(way - p.yaw);
    if (forward > 0.38) inp.k.add('KeyW');
    else if (forward < -0.38) inp.k.add('KeyS');
    if (side > 0.38) inp.k.add('KeyD');
    else if (side < -0.38) inp.k.add('KeyA');
  }
}
nodafukushima.botBrain = (b, inp, { goTo, patientStrike, canStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.retreating) {
    // 注目と溜め突きが残ると、携帯のなぞりが退き口への向き直りに使えない。
    if (p.lock) inp.e.add('KeyQ');
    inp.leftPressed = false; inp.chargeHold = false;
    p.botStrikeUntil = 0; p.botStrikeFoe = null;
    inp.guardHold = false; inp.runHeld = true;
    // 撤退中も、味方に守られて手当てできる時は足を止める。
    // ここで先に戻るため、下の休息処理だけでは出血を止められなかった。
    if (p.treatmentReady) {
      inp.k.delete('KeyA'); inp.k.delete('KeyD');
      inp.runHeld = false; inp.k.add('KeyE'); return;
    }
    const to = F.retreatAlt ? retreatPoint(b) || ODA_JOIN : ODA_JOIN;
    // 近い追手へ背を向けて走り続けない。合流先への道を保ち、構えて下がる。
    // 佐久間の列は六歩以内で合流する。兵の中心まで押し込んで追手側へ出ない。
    restBackstep(b, inp, goTo, to.x, to.z, F.retreatAlt ? 4.5 : 2);
    inp.runHeld = !inp.guardHold;
    return;
  }
  // 話す印は将本人の立ち位置とは別。印の範囲で話を聞き、下知を待つ。
  // 話し終えた二秒の間に将を追い直したり、敵へ寄り道したりしない。
  if (F.step === 0) {
    inp.guardHold = false;
    const it = nearIt(b, 'talk');
    if (it) {
      const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z);
      if (d < it.r) inp.e.add('KeyE');
      else goTo(p, inp, it.pos.x, it.pos.z, it.r * 0.8);
    }
    return;
  }
  // 布は二回使える。巻いた印は残るため、再負傷の手当てをその印で止めない。
  const bleeding = u.wounds?.bleed > 0.0001;
  const needsTreatment = p.treatmentLeft > 0 && p.treatmentNext <= b.t && (bleeding || u.hp < u.maxHp * 0.5);
  const withdrawing = (F.step === 2 || F.step === 3) && (u.mobbed || b.army.playerMobbed ||
    b.t < (F.step === 2 ? F.assaultSafeUntil || 0 : F.holdSafeUntil || 0));
  if (needsTreatment || p.sta < p.maxSta * 0.4 || withdrawing) b.botRest = true;
  // 気力が戻れば、敵の間合いの外から戦いへ戻る。九歩以内の敵で休み続けない。
  if (b.botRest && !b.army.nearestEnemy(u, 4, (o) => !o.fleeing && !o.noTarget && !o.isStruct &&
      Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos)) && p.sta >= p.maxSta * 0.6 &&
      !needsTreatment && !withdrawing) b.botRest = false;
  if (b.botRest) {
    if (p.lock) inp.e.add('KeyQ');
    inp.leftPressed = false; inp.chargeHold = false;
    p.botStrikeUntil = 0; p.botStrikeFoe = null;
    inp.guardHold = false;
    if (needsTreatment && p.treatmentReady) { inp.k.add('KeyE'); return; }
    if (F.step === 2 || F.step === 3) {
      const rear = recoveryPoint(b);
      if (rear) { restBackstep(b, inp, goTo, rear.x, rear.z, 0.4); return; }
    }
    // 手当てには六メートル以内の味方が要る。固定の後方で一人きりにならない。
    // 崩れた将の隊の中心は遠い敗走者へ移る。手当てのために川や砦へ追わない。
    let mate = null, best = Infinity;
    for (const q of b.army.units) {
      if (q === u || q.team !== u.team || !canJoin(q) || q.isStruct || q.farSim || q.civ || q.group?.routed || q.stagger > 0 || q.hp < q.maxHp * 0.35) continue;
      if (F.step === 3 && Math.hypot(q.pos.x - 8, q.pos.z - LEVEE_Z - 4) > 28) continue;
      if (b.army.wallBetween(u.pos, -1, q.pos) || b.army.terrainBlocks(u.pos, q.pos)) continue;
      const d = Math.hypot(q.pos.x - u.pos.x, q.pos.z - u.pos.z);
      if (d < best) { best = d; mate = q; }
    }
    if (mate) {
      // 味方の隣ではなく敵と反対側へ退く。手当ての六メートル以内を保つ。
      const foe = b.army.nearestEnemy(mate, 24, o => canJoin(o) && !o.isStruct && !o.farSim);
      const dx = foe ? mate.pos.x - foe.pos.x : 0, dz = foe ? mate.pos.z - foe.pos.z : 1;
      const d = Math.hypot(dx, dz) || 1;
      restBackstep(b, inp, goTo, mate.pos.x + dx / d * 4, mate.pos.z + dz / d * 4, 1);
    }
    else if (F.step === 3) restBackstep(b, inp, goTo, 8, LEVEE_Z + 4, 2);
    else b.botRest = false;
    if (b.botRest) return;
  }
  // 竹束を運ぶ最中（step1）は、柵際まで釣られて詰まらないよう、すぐ側の敵だけを見る
  // 名のある将も手傷で退かせられる間は相手にする。深手の将は追い続けない。
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  // 竹束の向こうの敵には端を回って寄れる。塀や門の奥へは追わない。
  const canApproach = (o) => {
    if (!b.army.wallBetween(u.pos, -1, o.pos)) return true;
    for (const s of b.army.structs) {
      if (!s.alive || s.opened || !s.seg || s.name === '竹束') continue;
      if (segHit(u.pos.x, u.pos.z, o.pos.x, o.pos.z, s.seg) >= 0) return false;
    }
    return true;
  };
  const canFight = (o) => !o.fleeing && canStrike(p, o) && !o.noTarget && !o.isStruct && o.type !== 'dummy' &&
    o.pos.z > FORT_Z + 2 && (F.step !== 3 || Math.hypot(o.pos.x - 8, o.pos.z - (LEVEE_Z + 4)) < 14) && Math.abs(o.pos.y - u.pos.y) < 3 && canApproach(o);
  if (F.step === 3 && Math.hypot(u.pos.x - 8, u.pos.z - (LEVEE_Z + 4)) > 12) {
    inp.guardHold = false; goTo(p, inp, 8, LEVEE_Z + 4, 2); return;
  }
  // 構えを解く半秒の間は、まだ届く相手を保つ。隣の兵への選び直しで突きを消さない。
  const previous = p.botStrikeFoe;
  const e = p.botStrikeUntil > p.time && previous?.alive && previous.team !== u.team && canFight(previous) &&
    Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < reach ? previous :
    // 総攻めでは浅瀬の向こうも見る。持ち場を守る段では近くの敵だけに戻す。
    b.army.nearestEnemy(u, F.step === 1 ? 3.5 : F.step === 2 ? 30 : F.step >= 2 ? 12 : 5, canFight);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const blocked = b.army.wallBetween(u.pos, -1, e.pos);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    if (d >= reach || blocked) goTo(p, inp, e.pos.x, e.pos.z, blocked ? 0.5 : reach * 0.9);
    // 受ける間と突く間を分け、構えたままの連打で気力を使い切らない。
    if (blocked) { inp.leftPressed = false; inp.guardHold = false; p.botStrikeUntil = 0; }
    else patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) {
    if (F.carry) {
      const q = F.carryPath[F.carryAt], m = F.backMesh.position;
      const dx = q.x - m.x, dz = q.z - m.z, d = Math.hypot(dx, dz);
      const it = nearIt(b, 'spot');
      // 束と本人は拾った時の距離を保つ。本人を印の中心へ押し込むと、
      // 隣の据えた束に当たり、据えられるのに前進を続けてしまう。
      if (F.carryAt === F.carryPath.length - 1 && it && d <= 2.5 && Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z) <= it.r) { inp.k.add('KeyE'); return; }
      goTo(p, inp, u.pos.x + dx, u.pos.z + dz, 0.15); return;
    }
    const it = nearIt(b, 'pile');
    if (it) { const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z); if (d > 1.4) goTo(p, inp, it.pos.x, it.pos.z, 1); else inp.k.add('KeyE'); }
    return;
  }
  if (F.step === 2 || F.step === 2.5) { goTo(p, inp, 0, -37, 2); return; }   // 水路の浅瀬を渡り、野田砦の口へ迫る
  if (F.step === 3) { goTo(p, inp, 8, LEVEE_Z + 4, 2); return; }
};

nodafukushima.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）

// 信長公記巻三を参照。天王寺本陣と北の海老江詰陣は場外、ここは推定の局地配置。
// 兵数は既存の総勢を備へ割った目安。三人衆の城別の担当は確定していない。
installBattleJinkei(nodafukushima, [
  battleJin('水路を挟む攻めの陣', 0, ODA_HONJIN, Math.PI, [
    ['noda_oda_hq', '南東の詰め陣・退き口', '織田の陣代（名は不明）', 10000, ODA_HONJIN, 'eiraku', 'oda', (r) => r.flags.campA?.guard, { named: false }],
    ['noda_shibata', '西の仕寄り（配置は推定）', '柴田勝家', 6000, { x: -82, z: 16 }, 'oda', 'oda', (r) => r.flags.namedGuards?.[0]],
    ['noda_guns', '東の仕寄り・鉄砲衆', '根来・雑賀の衆（将の名は不明）', 4000, { x: 84, z: 6 }, 'eiraku', null, (r) => r.flags.bOdaE, { named: false }],
    ['noda_sakuma', '後ろの備え・退き口', '佐久間信盛', 8000, { x: 56, z: 42 }, 'oda', 'oda', (r) => r.flags.namedGuards?.[1]],
    ['noda_maeda', '竹束の仕寄り', '前田利家', 2000, { x: 0, z: LEVEE_Z + 6 }, 'maeda', 'maeda', (r) => r.flags.maeda],
    ['noda_matsunaga', '浦江城への攻め口', '松永久秀・三好義継', null, { x: -150, z: 8 }, 'miyoshi', 'miyoshi', null, { draw: true, named: false, count: 60 }],
  ], '総勢と備ごとの数・位置は目安。付城は水辺の陣地として復元し、天正四年の六付城を混ぜない。'),
  battleJin('二つの砦と後ろからの寄せ', 1, { x: 0, z: -84 }, 0, [
    ['noda_miyoshi_hq', '本陣・野田砦の奥', '三好長逸', 2000, { x: 0, z: -84 }, 'miyoshi', 'miyoshi', (r) => r.flags.campB?.guard],
    ['noda_noda', '野田砦の岸の曲輪', '三好長逸の手', 2000, { x: 0, z: -63 }, 'miyoshi', 'miyoshi', (r) => r.flags.bNoda],
    ['noda_fuku', '福島砦の曲輪', '三好宗渭の手', 2000, { x: -122, z: -84 }, 'miyoshi', 'miyoshi', (r) => r.flags.namedGuards?.[2]],
    ['noda_fuku_gun', '福島砦の岸の鉄砲', '将の名は不明', 500, { x: -122, z: -61 }, 'miyoshi', 'miyoshi', (r) => r.flags.bFukuGun, { named: false }],
    ['noda_iwanari', '浅瀬に向く外の備え', '岩成友通の手', 1500, { x: -4, z: -37 }, 'miyoshi', 'miyoshi', (r) => r.flags.sally],
    ['noda_kennyo', '石山本願寺・後ろからの寄せ', '顕如の門徒衆', null, HONGAN, 'namu', 'honganji', null, { named: false }],
    ['noda_ikko_front', '早鐘の後・本願寺の先手', '将の名は不明', null, { x: 128, z: 118 }, 'namu', 'honganji', (r) => r.flags.bIkko?.[0], { named: false }],
    ['noda_ikko_next', '早鐘の後・後ろからの新手', '門徒衆（将の名は不明）', null, { x: 118, z: 132 }, 'namu', 'honganji', (r) => r.flags.bIkko?.[1], { named: false }],
    ['noda_ikko_gun', '早鐘の後・横からの鉄砲', '門徒衆（将の名は不明）', null, { x: 140, z: 110 }, 'namu', 'honganji', (r) => r.flags.bIkko?.[2], { named: false, form: 'line' }],
  ], '三人衆は五千〜一万とも伝わる。城別の担当・各曲輪の人数は推定。本願寺は早鐘の後に参戦。'),
]);

export { nodafukushima };
export { namuTex, sagarifujiTex };
