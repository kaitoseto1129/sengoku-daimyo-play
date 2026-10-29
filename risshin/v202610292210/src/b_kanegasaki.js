import { useTerrain } from './asset_manifest.js';
import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
// ======================================================================
// 信長包囲網　金ヶ崎の退き口（元亀元年四月二十八日〜晦日）
// 越前の金ヶ崎。朝倉を攻めていた織田勢は、北近江の浅井長政の裏切りで前後を挟まれた。
// 信長はわずかな供で朽木越えに京へ逃れ、殿（しんがり）に木下藤吉郎・明智光秀・池田勝正が残る。
// 足軽は木下の手。①一の備（金ヶ崎の麓）で朝倉の先手を食い止める ②笙の川まで繰り引き、騎馬の追手を川で受ける
// ③狭路まで退き、朝倉の後続を、主力が退ききるまで食い止める（退き口成る）
// 向き：北が -z（木ノ芽峠）、東の疋田方面からも朝倉が寄せる。退き口は南西（朽木へ）
// ======================================================================
import { yamaLift } from './yamalift.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, tawara, hut, ishigaki, palisade, kabukimon, lumber, shogi, bridgeBoard, bridgeWoodMaterial, makeKitBatch, finalizeKitBatch, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { flagTexture } from './textures.js';
import { WIND_STATE, distToPolyline } from './world.js';
import { S } from './settings.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { guardDrawCamera } from './render_camera.js';
import { gauss, enemyGroup as spawnEnemy, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { battleEvent, EVENT_RETREAT } from './battle_events.js';
import { goten, horiboriHeight, monomi } from './castle_parts.js';
import { buildCastlePlan, heightOf } from './castle_plan.js';
import { KANEGASAKI_PLAN, KANEGASAKI_HIGH_PLAN, KG_SHU as CASTLE, KG_NI as KAZ2, KG_TEZ as TEZUTSU, KG_PATHS, KG_NI_GATE } from './castles/kanegasaki.js';
import { demRelief, demDetail } from './dem.js';
import { buildHorse } from './units_model.js';
import { addDeck, addRamp } from './floors.js';
import { rockTuftShape, rockShape, groundRocks } from './rock_shape.js';
import { leafTex, stoneTex } from './nature.js';
import { timeslipField } from './timeslip_field.js';
let kgDem = null;
useTerrain('dem_kanegasaki', (data) => { kgDem = data; });
// 足軽大将より上の身分で出た時は、一手を預かる
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const SHO = [[130, 2], [90, 6], [30, 10], [-30, 14], [-100, 22], [-180, 34]];   // 笙の川（内陸から西の敦賀湾へ。流路は縮約）
const ROAD = [[-6, -176], [2, -110], [8, -50], [8, 12], [-10, 60], [-26, 104], [-54, 150], [-70, 176]];
// 橋の南の取付坂を渡り終えてから曲がる。地形と主力の進行に使う元の折れ点は保つ。
const RETREAT_ROAD = [...ROAD.slice(0, 4), [8, 22], ...ROAD.slice(4)];
// docs/layout-ref/fields.md 第三節の東の寄せ口。細かな道筋は復元。
// 疋田方面から湿地の南を通り、川の北で一の備へ合流する。退き道・城山の大きさは変えない。
const HIKIDA_ROAD = [[90, -14], [74, -18], [46, -26], [28, -38], [8, -50]];
const HIKIDA_FROM = { x: 74, z: -18 };
const HIKIDA_FACING = Math.atan2(8 - HIKIDA_FROM.x, -34 - HIKIDA_FROM.z);
// 敦賀市の城跡案内では湿地は天筒山の東南。城間を直した後も西麓へ残っていた位置を直す。
// 実際の湿地はこの局地戦の外。兵が戦う西麓へ代わりの沼を置かない。
// 出所：https://www.city.tsuruga.lg.jp/uploaded/attachment/8703.pdf
const NAKAIKEMI = { x: TEZUTSU.x + 46, z: TEZUTSU.z + 64, r: 26 };
// 港町・川南の在所・金前寺周辺の暮らしを縮めて復元する。
// 金前寺の現在地の堂は江戸期の再建。元亀の堂の位置・姿・民の人数は推定。
// 参照：https://tsuruga-kanko.jp/spot/shrines_temples/konzenji/
// 川南の民は同じ岸を逃げ、城山の民だけ西の既存の浅瀬へ下る。
// 西の湾岸・中池見湿地・殿の板橋を避け、兵の退き道を塞がない。
const KG_PEOPLE_PATHS = [
  [[66, 40], [72, 56], [82, 76], [84, 110], [84, 146], [84, 174]],
  [[-58, 52], [-82, 46], [-116, 46], [-166, 46]],
  [[24, -92], [0, -96], [38, -86], [-28, -78], [30, -68], [-36, -58],
    [-50, -10], [-50, 0], [-50, 36], [-82, 46], [-116, 46], [-166, 46]],
];
const kgPeopleRoute = (i) => KG_PEOPLE_PATHS[i].slice(1).map(([x, z]) => ({ x, z }));
const KG_CIVILIAN_BANDS = [
  { x: 66, z: 40, kinds: ['townsman', 'merchant', 'woman', 'child', 'elder'], route: kgPeopleRoute(0) },
  { x: -58, z: 52, kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'], route: kgPeopleRoute(1) },
  { x: 24, z: -92, kinds: ['monk', 'monk', 'woman', 'farmer'], route: kgPeopleRoute(2) },
  // 一の備の西で荷駄を捨てた小者。荷車の脇から西の浅瀬へ逃げる（持ち場から見える）。
  { x: -11, z: -45, kinds: ['farmer', 'farmer', 'elder'], route: [[-20, -40], [-30, -24], [-38, -10], [-50, 0], [-50, 36], [-82, 46], [-116, 46], [-166, 46]].map(([x, z]) => ({ x, z })) },
];
// 殿の三つの備（持ち場）と、そこで向く向き（北 = Math.PI）
// 一の備は登城道の肩より十二歩南の緩い麓。札を追って急斜面へ登らせない。
// 一の備の左手前の若葉の雑木（ナラ・クヌギ）。退き道・登城道と槍の組の場は外す。
// 25秒の時の肩越しは東（天筒山の斜面）を向く。その右手前の若葉の木も足す（10/28 点付け）。
const KG_FRONT_TREES0 = [[-15, -33], [-17, -42], [-12, -50], [-24, -38], [33, -25], [29, -15], [18, -53], [26, -48.5], [33, -44], [41, -39]];
// 25秒の時の持ち場（8,-30 あたり）から東北東を向く肩越しの正面：疋田の道の上下の斜面に若葉の雑木を（10/28 点付け）。
// 道（疋田の道・退き道）の踏み跡は空ける。
const KG_VIEW_TREES = [[14, -12], [18, -16], [22, -11], [26, -17], [30, -9], [34, -14], [21, 9], [27, 11], [36, 7], [41, -4], [24, -22], [16, -20], [31, -22], [38, -18], [14, 8], [18, 14], [32, 15]]
  .map(([f, s]) => [Math.round((8 + 0.88 * f + 0.47 * s) * 10) / 10, Math.round((-30 - 0.47 * f + 0.88 * s) * 10) / 10])
  .filter(([x, z]) => distToPolyline(x, z, HIKIDA_ROAD) > 4.5 && distToPolyline(x, z, ROAD) > 5);
const KG_FRONT_TREES = [...KG_FRONT_TREES0, ...KG_VIEW_TREES];   // 疋田の道（6歩）を空け、道の上の柵のすぐ上へ
// 登城道の麓の木戸：金ヶ崎城の大手の外構え（位置・形は推定）。一の備から正面に、城の入口の冠木門と柵を見せる。
// 柵は斜面に沿って短く切り、一束にまとめる。設営時に一度だけ。
function kgFootGate(rt) {
  const W = rt.world, gx = 8, gz = -47;
  rt.scene.add(kabukimon(W, gx, gz, 4.4, 0, {}));
  const batch = makeSimpleBatch();
  for (const [ax, az, bx, bz] of [[-6, gz + 1, gx - 2.4, gz], [gx + 2.4, gz, 22, gz - 2]]) {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2.6));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      palisade(W, [ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1], { h: 2.1, solid: true, batch });
    }
  }
  // 疋田の道の山側に沿う城の柵（25秒の肩越しの正面の斜面。位置は推定）。所々を空けて兵の抜け道を残す。
  const slope = [[16, -49.4], [30, -41], [42, -33]];
  for (let k = 0; k < slope.length - 1; k++) {
    const [ax, az] = slope[k], [bx, bz] = slope[k + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2.6));
    for (let i = 0; i < n; i++) {
      if (i % 3 === 2) continue;
      const t0 = i / n, t1 = (i + 1) / n;
      palisade(W, [ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1], { h: 2.1, solid: true, batch });
    }
  }
  finalizeSimpleBatch(rt, batch);
}

const LINES = [
  { x: 8, z: -34, r: 12, name: '一の備（金ヶ崎の麓）', mark: '一の備' },
  // 橋の南の取付坂は z=22 まで。輪の北端も渡り終えた岸へ置く。
  { x: 2, z: 32, r: 9, name: '二の備（笙の川の南）', mark: '二の備' },
  { x: -22, z: 102, r: 11, name: '三の備（狭路）', mark: '三の備' },
];
const RETREAT_T = 300;    // 守備五分と最後の合流で、四〜七分を目安にする。
const KUTSUKI = { x: -56, z: 150, r: 14 };    // 若狭へ向かう道（信長で遊ぶ時の退き先）                   // 主力が退ききるまでの秒（はじめから）

// 道を外れた時はまず近い道へ戻し、道に乗ってから南の折れ点へ進む。
// 札と遊び手で同じ筋を使う。返す座標は開幕に用意した物を使い回す。
function retreatWay(rt, goal, p = rt.player.u.pos, out = rt.flags.retreatWay) {
  out.x = goal.x; out.z = goal.z;
  // 二の備の輪は橋の上まで届く。輪へ入っても、南の取付坂までは道順を省かない。
  const onBridge = p.z >= 2 && p.z < 22 && Math.abs(p.x - 8) < 3 && goal.z >= 22;
  // 旗の緯度を越えていても、山腹なら先に道へ戻す。輪の端の急坂も到着扱いにしない。
  const onRoad = distToPolyline(p.x, p.z, RETREAT_ROAD) <= 4 && rt.world.slopeTan(p.x, p.z) <= 0.55;
  if (!onBridge && onRoad && (Math.hypot(p.x - goal.x, p.z - goal.z) < (goal.r || 6) || p.z >= goal.z)) return out;
  let best = Infinity, segment = 0, fraction = 0;
  for (let i = 0; i < RETREAT_ROAD.length - 1 && RETREAT_ROAD[i][1] < goal.z; i++) {
    const a = RETREAT_ROAD[i], b = RETREAT_ROAD[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const limit = Math.min(1, (goal.z - a[1]) / dz);
    const t = Math.max(0, Math.min(limit, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz)));
    const x = a[0] + dx * t, z = a[1] + dz * t;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < best) { best = d; segment = i; fraction = t; out.x = x; out.z = z; }
  }
  // 道の中心のすぐそばでは先へ案内する。肩の勾配だけで足元の投影点を
  // 返すと、一歩以内で到着扱いになり、坂から下りる操作も止まってしまう。
  if (best > 4 || !onRoad && best > 1) return out;
  let left = 12;
  for (let i = segment; i < RETREAT_ROAD.length - 1; i++) {
    const a = RETREAT_ROAD[i], b = RETREAT_ROAD[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const length = Math.hypot(dx, dz), start = i === segment ? fraction : 0;
    const limit = Math.min(1, (goal.z - a[1]) / dz);
    const t = Math.min(limit, start + left / length);
    out.x = a[0] + dx * t; out.z = a[1] + dz * t;
    left -= (t - start) * length;
    if (left <= 0.000001 || limit < 1 || out.z >= goal.z) break;
  }
  return out;
}

// 案内点は十二歩先へ動くが、札には次の旗までの残り道のりを出す。
// 道から離れた分と曲がり角も数え、道を進めば距離が減るようにする。
function retreatDistance(rt, goal) {
  const p = rt.player.u.pos;
  const direct = Math.hypot(p.x - goal.x, p.z - goal.z);
  if (direct < goal.r) return 0;
  if (p.z >= goal.z) return Math.max(0, direct - goal.r);
  let best = Infinity, remaining = direct, along = 0, goalX = goal.x, goalZ = goal.z;
  for (let i = RETREAT_ROAD.length - 2; i >= 0; i--) {
    const a = RETREAT_ROAD[i], b = RETREAT_ROAD[i + 1];
    if (a[1] >= goal.z) continue;
    const end = Math.min(1, (goal.z - a[1]) / (b[1] - a[1]));
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    const ex = a[0] + dx * end, ez = a[1] + dz * end;
    along += Math.hypot(goalX - ex, goalZ - ez);
    const t = Math.max(0, Math.min(end, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (length * length)));
    const gap = Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t);
    if (gap < best) { best = gap; remaining = gap + (end - t) * length + along; }
    along += end * length; goalX = a[0]; goalZ = a[1];
  }
  return Math.max(0, remaining - goal.r);
}

// 三つ盛木瓜と織田の木瓜をそろえ違えない。鎧下も茶と藍で見分けやすくする。
const ASAKURA = { armor: 0x33291f, lace: 0x7a5a2a, cloth: 0x66513b, flag: 'asakura' };
const ODA = { cloth: 0x2a384a, flag: 'oda' };
// 杉板の赤みを落とし、雨で灰茶に褪せた板と差し替えた明るい板を混ぜる。
const KG_ROOF_COLORS = [0x756d5c, 0x696252, 0x8a7c65, 0x726655];
// 本の着装写真：足軽の鎧下は藍、陣笠は赤茶の漆。形と材質は既存の貸し具足を使う。
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk,
  ...(['ashigaru', 'bow', 'gun'].includes(s.type) ? { cloth: 0x263b46, hatColor: 0x713c2c } : {}), ...(s.o || {}) } }));
// 戦える残兵を、退き道・崩れの判定と同じ条件で数える。
const kgActive = (u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget;
// 持ち場へ来た残敵だけを選ぶ。守備のピンで城山や遠い控えへ追い出さない。
function kgNearestFoe(rt) {
  const F = rt.flags, L = LINES[F.line || 0], p = rt.player.u.pos;
  if (rt.t < F.signNext && F.signLine === F.line && F.signStep === F.step &&
      (!F.signTarget || kgActive(F.signTarget) && !F.signTarget.dying && !F.signTarget.downed &&
      Math.hypot(F.signTarget.pos.x - L.x, F.signTarget.pos.z - L.z) < L.r + 8 && kgGuidePointAllowed(rt, F.signTarget.pos))) return F.signTarget;
  F.signNext = rt.t + .25; F.signLine = F.line; F.signStep = F.step;
  let chosen = null, best = Infinity;
  for (const u of rt.army.units) {
    if (u.team !== 1 || !kgActive(u) || u.dying || u.downed || u.isStruct || u.civ ||
        Math.hypot(u.pos.x - L.x, u.pos.z - L.z) >= L.r + 8 || !kgGuidePointAllowed(rt, u.pos)) continue;
    const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
    if (d < best) { best = d; chosen = u; }
  }
  F.signTarget = chosen;
  return chosen;
}
// 休む場所も回避先も、道沿いの歩ける足場から選ぶ。斜面の味方を追って山腹へ登らせない。
function kgSafeFoot(rt, x, z) {
  const p = rt.player.u.pos, L = LINES[rt.flags.line || 0], W = rt.world;
  return W.walkable(x, z) && !W.inWaterAt(x, z) && W.slopeTan(x, z) <= 0.55 &&
    distToPolyline(x, z, ROAD) <= Math.max(8, distToPolyline(p.x, p.z, ROAD)) &&
    Math.hypot(x - L.x, z - L.z) <= Math.max(L.r + 8, Math.hypot(p.x - L.x, p.z - L.z));
}
const kgGuidePointAllowed = (rt, point) => kgSafeFoot(rt, point.x, point.z);
// 一時退避の点は備の旗ではない。味方がいない空き地を「味方の列」と呼ばない。
function kgRetreatLabel(rt, reached) {
  const F = rt.flags;
  if (rt.G.lord || F.fleeing || F.step === 2 || F.step === 4) {
    const goal = rt.G.lord || F.fleeing ? KUTSUKI : LINES[F.line];
    return rt.distTo(goal) < goal.r ? '旗を守れ。味方を待て' : `${goal.mark || '退き口'}へ退け`;
  }
  if (reached) return 'ここで構え、退く合図を待て';
  const cue = rt.hud.retreatGuide, ally = cue?.ally;
  return ally && kgActive(ally) && Math.hypot(ally.pos.x - cue.x, ally.pos.z - cue.z) < 8
    ? '近くの味方の後ろへ下がれ' : '敵から少し離れて構えよ';
}
// 手当てや構えの操作は残し、正式な退却の同じ命令だけを一つにする。
function kgRepeatedRouteOrder(rt, action, task) {
  const F = rt.flags;
  if (rt.over || F.ending || rt.hud.retreatGuide?.treatment ||
      !(rt.G.lord || F.fleeing || F.step === 2 || F.step === 4)) return false;
  return /へ退け$/.test(action) && task.startsWith(action + '・あと') &&
    /^\d+歩/.test(task.slice(action.length + 3));
}
// 密集した時だけ視点を少し引く。近い得物は既存の描画時の透かしに任せる。
// 共通の視点補正より前に高さを渡し、地形と壁の判定もそのまま使う。
function retreatView(rt) {
  const P = rt.player, F = rt.flags, updateCamera = P.updateCamera;
  const allyFade = P.allyFade;
  const pull = rt.def.camPull || 0;
  F.nearLift = 0;
  const cameraMeasure = {};
  P.updateCamera = (dt, camera) => {
    const goal = !rt.over && P.u.alive && S.view !== 'first' && (P.crowd || 0) > 5 ? 1 : 0;
    F.nearLift += (goal - F.nearLift) * Math.min(1, dt * (S.reduceMotion ? 8 : 2));
    P.crowdLift = Math.max(P.crowdLift || 0, F.nearLift);
    rt.def.camPull = pull + F.nearLift;
    updateCamera.call(P, dt, camera);
    // 低画質の描く斜面も調べ、手前の四隅を土の上へ保つ。
    if (guardDrawCamera(rt.world, camera, cameraMeasure) > 0) P.camPos.copy(camera.position);
    F.fallenHorseTick?.(camera);
    rt.def.camPull = pull;
  };
  // 道を走る使番は戦う兵の一覧に入らないので、同じ透かしへ二騎だけ渡す。
  // 描いた後は allyFade(null) が元へ戻す。
  P.allyFade = (camera) => {
    allyFade.call(P, camera);
    if (!camera) return;
    for (const c of rt.couriers || []) {
      const dx = c.m.position.x - camera.position.x, dz = c.m.position.z - camera.position.z;
      if (!c.m.visible || Math.abs(c.m.position.y + 1.5 - camera.position.y) > 3) continue;
      // 人馬の中へ視点が入った時は全体を避け、透けた具足の内側を見せない。
      // 復元は共通の allyFade(null) が描き終わりに行う。
      const distance2 = dx * dx + dz * dz;
      if (distance2 < 2.4 * 2.4) P.hideNearFlag(c.m);
      // 少し離れた使番は実体を保つ。顔や具足の内側を透かさない。
    }
  };
  return () => { P.allyFade(null); P.allyFade = allyFade; P.updateCamera = updateCamera; rt.def.camPull = pull; };
}
// 母衣は共通の細長い仕立てを使う。金ヶ崎だけの古い袋を重ねない。
// 既存の和鞍と鐙は残し、鞍の縁に明るい緒を添える。
function retreatCouriers(rt) {
  const tackGeo = new THREE.TorusGeometry(0.27, 0.018, 4, 12, Math.PI);
  const tackMat = new THREE.MeshStandardMaterial({ color:0xa28b62, roughness:1 });
  rt.flags.sceneryResources.push(tackGeo, tackMat);
  for (const c of rt.couriers || []) for (const z of [-0.22, 0.25]) {
    const rim = new THREE.Mesh(tackGeo, tackMat); rim.position.set(0, 1.37, z); c.h.add(rim);
  }
}

// 川岸の石・草の群落。足場を彫らず、開幕に二束だけ作る。
// 橋と浅瀬は空け、通行・兵数・当たりの条件には触れない。
// 頂点色を読む共用材質へ、無色の形を渡さない。設営時だけ色を補う。
function retreatSurface(geometry, hex = 0xffffff) {
  const count = geometry.attributes.position.count, color = new THREE.Color(hex);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
function retreatGroundDetail(rt) {
  // 草土の混合をこの戦の短い式へ収める。携帯で地表が白い無地になり、
  // 草・俵だけ浮いて見える状態を避ける。足場・索引・共用の絵はそのまま使う。
  const ground = rt.world.terrain.material;
  ground.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, rt.world.groundU);
    shader.vertexShader = 'attribute vec3 splat; varying vec3 vKgGround, vKgMix;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vKgGround = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vKgMix = splat;`);
    shader.fragmentShader = `uniform sampler2D tGrass, tDirt, tBank, tMud, tMacro, tWear;
      uniform float uWet;
      varying vec3 vKgGround, vKgMix;
      ` + shader.fragmentShader.replace('#include <map_fragment>', `
        vec3 p = vKgGround;
        vec3 n = abs(normalize(cross(dFdx(p), dFdy(p))));
        vec3 axis = pow(n, vec3(4.0)); axis /= max(0.001, axis.x + axis.y + axis.z);
        // 切岸にも同じ粒の大きさを保ち、縦に伸びた板模様にしない。
        vec3 soil = texture2D(tBank, p.zy * 0.23).rgb * axis.x
          + texture2D(tDirt, p.xz * 0.23).rgb * axis.y
          + texture2D(tBank, p.xy * 0.23).rgb * axis.z;
        vec3 w = max(vKgMix, vec3(0.0));
        float wear = texture2D(tWear, (p.xz + 240.0) / 480.0).r;
        w.x *= (1.0 - smoothstep(0.05, 0.75, wear)) * smoothstep(0.4, 0.8, n.y);
        w.z = clamp(w.z + uWet * 0.25, 0.0, 0.8);
        w.y = max(0.0, 1.0 - w.x - w.z);
        w /= max(0.001, w.x + w.y + w.z);
        vec3 grass = texture2D(tGrass, p.xz * 0.23).rgb;
        vec3 mud = texture2D(tMud, p.xz * 0.23).rgb;
        // 一枚の茶にしない：大きな斑で草の生えた所と踏んだ土を混ぜる。
        float kgGreen = smoothstep(0.38, 0.62, texture2D(tMacro, p.xz * 0.0125 + 0.11).r) * smoothstep(0.55, 0.85, n.y);
        float kgBare = smoothstep(0.55, 0.75, texture2D(tMacro, p.xz * 0.019 + 0.63).r);
        w = mix(w, vec3(0.85, 0.15, w.z), kgGreen * (1.0 - w.z));
        w = mix(w, vec3(0.1, 0.9, w.z), kgBare * (1.0 - kgGreen) * (1.0 - w.z) * 0.8);
        w /= max(0.001, w.x + w.y + w.z);
        float kgPatch = mix(0.7, 1.18, texture2D(tMacro, p.xz * 0.023 + 0.37).r)
          * mix(0.86, 1.08, texture2D(tMacro, p.xz * 0.071 + 0.19).r);
        diffuseColor.rgb *= (grass * w.x + soil * w.y + mud * w.z)
          * kgPatch * (1.0 - uWet * 0.18);
      `);
  };
  ground.customProgramCacheKey = () => '金ヶ崎の草土と川岸';
  ground.needsUpdate = true;
  const W = rt.world, resources = rt.flags.sceneryResources;
  const mat = new THREE.MeshStandardMaterial({ color:0xffffff, vertexColors:true, roughness:1 });
  // 地面へ重ねた二本の長い帯は坂で浮き、道を裂く板に見えるので置かない。
  // 道の土色と兵が踏んだ跡は、既存の地面の描画に任せる。
  const stoneGeo = retreatSurface(new THREE.DodecahedronGeometry(1,0));
  const reedGeo = retreatSurface(rockTuftShape(true));
  const stones = new THREE.InstancedMesh(stoneGeo,mat,180);
  const reeds = new THREE.InstancedMesh(reedGeo,mat,240);
  const at = new THREE.Object3D(), color = new THREE.Color();
  let sn=0, rn=0;
  for (let k=1;k<SHO.length;k++) {
    const a=SHO[k-1], b=SHO[k], dx=b[0]-a[0], dz=b[1]-a[1], len=Math.hypot(dx,dz);
    for (let j=0;j<18;j++) for (const side of [-1,1]) {
      const t=(j+.35)/18, bank=side*(5.1+.8*Math.sin(j*2.4+k));
      const x=a[0]+dx*t+dz/len*bank, z=a[1]+dz*t-dx/len*bank;
      if (Math.abs(x-8)<6 || Math.abs(x+50)<8 || x < -112) continue;
      at.position.set(x,W.heightAt(x,z)+.045,z); at.rotation.set(.15*Math.sin(j),j*2.4,.1);
      at.scale.set(.22+.15*Math.sin(j*3.7)**2,.13,.19+.15*Math.cos(j*2.1)**2); at.updateMatrix();
      stones.setMatrixAt(sn,at.matrix); stones.setColorAt(sn++,color.setHex(j%3 ? 0x827b65 : 0x686753));
      if (j%3===0) for(let q=0;q<4;q++) {
        const px=x+side*.7+Math.sin(q*2.4)*.26, pz=z+Math.cos(q*2.4)*.3;
        at.position.set(px,W.heightAt(px,pz)-.025,pz); at.rotation.set(0,q*.8,.12*Math.sin(q+j));
        at.scale.set(.85,1.2+((j+q)%4)*.25,.85); at.updateMatrix();
        reeds.setMatrixAt(rn,at.matrix); reeds.setColorAt(rn++,color.setHex(q%2 ? 0x646b35 : 0x7d7846));
      }
    }
  }
  stones.count=sn; reeds.count=rn;
  stones.receiveShadow=reeds.receiveShadow=true;
  stones.computeBoundingSphere(); reeds.computeBoundingSphere(); rt.scene.add(stones,reeds);
  resources.push(mat,stoneGeo,reedGeo,stones,reeds);
}

// 本の野戦兵器の丸太・縄組みと清洲の板囲いを、小さな撤収跡へ縮める。
// 昼の退き口なので大将の座や燃える篝火は据えず、幕を外しかけた荷置場にする。
// 配置は復元。道・三つの備・避難道の外だけ。兵と当たり判定は増やさない。
function retreatWayside(rt) {
  const W = rt.world, resources = rt.flags.sceneryResources;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const pole = new THREE.CylinderGeometry(1, 1, 1, 6);
  const bowl = new THREE.CylinderGeometry(1, .65, 1, 8, 1, true);
  const ring = new THREE.TorusGeometry(1, .075, 3, 10);
  const place = new THREE.Object3D();
  resources.push(material);
  const cluster = (cx, cz, camp) => {
    const baseY = W.heightAt(cx, cz), coarse = [], fine = [];
    const ground = (x, z) => W.heightAt(cx + x, cz + z) - baseY;
    const part = (shape, x, y, z, w, h, d, hex, near = false, rx = 0, ry = 0, rz = 0) => {
      place.position.set(x, ground(x, z) + y, z);
      place.rotation.set(rx, ry, rz); place.scale.set(w, h, d); place.updateMatrix();
      const geo = shape.index ? shape.toNonIndexed() : shape.clone();
      retreatSurface(geo, hex); geo.applyMatrix4(place.matrix);
      (near ? fine : coarse).push(geo);
    };
    const wood = 0x65513a, cut = 0x978063, rope = 0x8d7a50;
    if (camp) {
      // 片側の幕は外して巻き、開いた荷置場の背だけを残す。
      for (const x of [-3, 0, 3]) {
        part(pole,x,1.15,-2,.075,2.45,.075,wood);
        for (const y of [1.7,2.05]) part(ring,x,y,-2,.105,.105,.105,rope,true,Math.PI/2);
      }
      for (const x of [-1.5,1.5]) {
        const cloth = new THREE.PlaneGeometry(2.9,1.45,10,4);
        const p = cloth.attributes.position;
        for (let i=0;i<p.count;i++) {
          const u=(p.getX(i)+1.45)/2.9, v=(p.getY(i)+.725)/1.45;
          p.setZ(i,Math.sin(u*Math.PI)*(.12+Math.sin(u*25)*.045)*(1-v));
          // 裾は中央が少したるむ。字・新たな紋は描かない。
          p.setY(i,p.getY(i)-Math.sin(u*Math.PI)*.12);
        }
        cloth.computeVertexNormals();
        part(cloth,x,1.22,-2,1,1,1,0xb5ab8e);
        cloth.dispose();
      }
      part(pole,-1.7,.2,.9,.19,2.5,.19,0xa39778,false,0,0,Math.PI/2);
      // 板盾を寝かせ、丸太二本へ預ける。写真の井楼のように貫が柱から出る。
      for (const x of [1.2,2.9]) part(pole,x,.18,1,.14,2.1,.14,wood,false,Math.PI/2);
      for(let j=0;j<5;j++) part(box,1.1+j*.4,.48,1,.38,.09,1.65,j%2?wood:cut,false,0,.04,.03);
      part(box,1.9,.56,.45,2.5,.08,.13,wood,true);
      part(box,1.9,.56,1.55,2.5,.08,.13,wood,true);
      // 竹束は置き去りの資材。道を塞ぐ防壁にはせず、七本を縄二か所で束ねる。
      for (let j=0;j<7;j++) {
        const x=-2.4+(j%3)*.19, z=2+Math.floor(j/3)*.17;
        part(pole,x,.22,z,.085,2.5,.085,j%2?0x7a7848:0x94905a,false,0,0,Math.PI/2);
        for(const dx of [-.8,0,.8]) part(ring,x+dx,.22,z,.09,.09,.09,cut,true,0,Math.PI/2);
      }
      for (const x of [-3.1,-1.5]) part(ring,x,.3,2.16,.4,.4,.4,rope,true,0,Math.PI/2);
      // 火を落とした炊事場。煤けた鍋、灰、割薪。昼の撤退に灯りや煙幕を足さない。
      part(pole,4.9,.025,1, .75,.04,.65,0x494638);
      for(let j=0;j<7;j++) {
        const a=j*Math.PI*2/7;
        part(box,4.9+Math.cos(a)*.72,.11,1+Math.sin(a)*.6,.28,.22,.23,0x706b59,false,.08,a,.1);
      }
      part(bowl,4.9,.37,1,.43,.48,.43,0x302f2a);
      part(ring,4.9,.62,1,.43,.43,.43,0x454238,true,Math.PI/2);
      for(let j=0;j<4;j++) part(box,6+j*.15,.1,1.5,.12,.13,.9,cut,true,0,-.3+j*.12);
      part(bowl,4,.12,2,.2,.18,.2,0x826344,true);
    } else {
      // 春の畑：収穫前の稲田にはせず、褐色の畝と疎らな若葉。
      // 一枚ずつ地形へ沿わせるので、斜面に水平な板を浮かせない。
      for(let row=0;row<5;row++) {
        const x=(row-2)*1.2;
        if (W.slopeTan(cx+x,cz)>.45 || W.inWaterAt(cx+x,cz)) continue;
        const bed = new THREE.PlaneGeometry(.8,9,2,18);
        bed.rotateX(-Math.PI/2);
        const p=bed.attributes.position;
        for(let i=0;i<p.count;i++) {
          const px=p.getX(i)+x, pz=p.getZ(i);
          p.setXYZ(i,px,ground(px,pz)+.035+.065*Math.cos(p.getX(i)/.8*Math.PI),pz);
        }
        bed.computeVertexNormals();
        const bedShape = bed.toNonIndexed(); bed.dispose();
        retreatSurface(bedShape,row%2?0x62533c:0x766045); coarse.push(bedShape);
        for(let j=0;j<9;j++) for(const side of [-1,1]) {
          part(box,x,.12,-4+j,.035,.25,.16,j%3?0x606443:0x777346,true,0,j*.7,side*.45);
        }
      }
      // 庭柵の続きに低い粗朶囲い。南側は畑へ入る口を空ける。
      for(let j=0;j<6;j++) part(pole,-3.5,.55,-4.5+j*1.8,.055,1.2,.055,wood);
      for(const y of [.4,.8]) for(let j=0;j<9;j++) {
        part(pole,-3.5,y,-4+j,.025,1.2,.025,cut,true,Math.PI/2,0,.04*Math.sin(j));
      }
    }
    const meshOf = parts => {
      const geo = mergeGeometries(parts);
      for(const p of parts) p.dispose();
      geo.computeBoundingSphere(); resources.push(geo);
      const mesh = new THREE.Mesh(geo,material); mesh.receiveShadow=true;
      return mesh;
    };
    const lod = new THREE.LOD(), near = new THREE.Group();
    const base = meshOf(coarse), detail = meshOf(fine);
    // 同じ粗形状を使い回す。近くの縄・竹の節・葉だけを四十五歩で省く。
    const far = new THREE.Mesh(base.geometry,material); far.receiveShadow=true;
    near.add(base,detail); lod.addLevel(near,0); lod.addLevel(far,34,.15);
    lod.addLevel(new THREE.Group(),110,.1); lod.position.set(cx,baseY,cz); rt.scene.add(lod);
  };
  cluster(34,-7,true);
  cluster(47,61,false);
  cluster(-57,57,false);
  for(const geo of [box,pole,bowl,ring]) geo.dispose();
}

// 25秒の肩越し（持ち場 8,-30 から東南東、天筒山の麓の斜面）を一枚の草の坂に見せない（10/28 点付け）。
// 斜面に半ば土に埋めた岩、退く道の脇に捨てた俵の山（踏み跡の土は共通の stage_dress.js が main に入ってから）。小屋や塀は足さない。
// 岩は一つの形と材質の InstancedMesh 一つ。道の上と真ん中の 3m は空ける。毎コマの仕事は無い。
function kgSlopeLitter(rt) {
  const W = rt.world, fx = 0.88, fz = -0.47, rx = fz, rz = -fx, ox = 3.4, oz = -27.4;
  const at = (d, s) => [ox + fx * d + rx * s, oz + fz * d + rz * s];
  const free = (x, z, r) => distToPolyline(x, z, HIKIDA_ROAD) > 2.4 + r && distToPolyline(x, z, ROAD) > 3 + r;
  const rocks = [];
  for (let i = 0; i < 26 && rocks.length < 18; i++) {
    const a = (i * 0.618034) % 1, b = (i * 0.754877) % 1;
    const d = 10 + a * 24, s = (2.5 + b * 10) * (i % 2 ? 1 : -1), r = 0.55 + ((i * 7) % 5) / 4 * 0.9;
    const [x, z] = at(d, s);
    if (free(x, z, r)) rocks.push([x, z, r, (i * 0.37) % 1]);
  }
  const geo = rockShape(1, true, S.quality === 'low' ? 1 : 2);
  // 暗い石の絵を頂点色へ重ねず、苔と乾いた土の色を混ぜる（黒い穴の塊に見えた）。
  const vc = geo.attributes.color, vp = geo.attributes.position, sand = new THREE.Color(0x857560), moss = new THREE.Color(0x5d6440), tone = new THREE.Color();
  for (let i = 0; i < vc.count; i++) {
    const y = vp.getY(i), patch = (.5 + .5 * Math.sin(vp.getX(i) * 7 + vp.getZ(i) * 5)) * Math.max(0, y);
    tone.fromBufferAttribute(vc, i).lerp(sand, .6).lerp(moss, patch * .6); vc.setXYZ(i, tone.r, tone.g, tone.b);
  }
  const mat = new THREE.MeshLambertMaterial({ bumpMap: stoneTex(), bumpScale: .06, vertexColors: true, side: THREE.DoubleSide, emissive: 0x594733, emissiveIntensity: .15 });
  const mesh = new THREE.InstancedMesh(geo, mat, rocks.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
  rocks.forEach(([x, z, r, a], i) => {
    p.set(x, W.heightAt(x, z) - r * 0.45, z);
    q.setFromEuler(e.set((a - 0.5) * 0.5, a * 6.28, (a * 7 % 1 - 0.5) * 0.4));
    mesh.setMatrixAt(i, m.compose(p, q, sc.set(r * (1.1 + a * 0.4), r * (0.7 + a * 0.3), r)));
  });
  mesh.receiveShadow = true;
  rt.scene.add(mesh); groundRocks(W, mesh, 1);
  rt.flags.sceneryResources?.push(geo, mat);
  // 捨てた俵の山（退く道の脇・崩れて転がる）
  for (const [d, s, n] of [[13, -5.5, 4], [17, 6.5, 3], [24, -8, 5]]) {
    const [x, z] = at(d, s);
    if (free(x, z, 1.2)) rt.scene.add(tawara(W, x, z, d * 0.7, n, { solid: false }));
  }
}

// 一の備の西に捨てた荷車と、雑木の下草。設営時に一束ずつ作り、毎コマは触らない。
// 槍の組の場（x -6〜26）と道は空ける。当たりは足さない。
function retreatBaggage(rt, addSacks) {
  const W = rt.world, resources = rt.flags.sceneryResources;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const box = new THREE.BoxGeometry(1, 1, 1), rim = new THREE.TorusGeometry(1, 0.09, 4, 14).rotateY(Math.PI / 2);
  const place = new THREE.Object3D(), parts = [];
  // 荷車：片輪が外れて傾いた大八車。cx,cz は荷台の中ほど。持ち場の正面の退く道にもう一台（10/28）。
  for (const [cx, cz, ry] of [[-7, -40, 0.7], [-2, -35, -0.45], [21, -22, 0.35], [13.5, -43.5, 1.03], [20.5, -34.5, 1.03]]) {   // 四台目：25秒の肩越しの正面、疋田の道の肩（10/28）
  let y0 = -1e9; for (const [dx, dz] of [[-1, -1.5], [1, -1.5], [-1, 1.5], [1, 1.5], [0, 0]]) y0 = Math.max(y0, W.heightAt(cx + dx, cz + dz));
  const cart = new THREE.Group(); cart.position.set(cx, y0 - 0.12, cz); cart.rotation.set(0.12, ry, 0); cart.updateMatrixWorld();
  const part = (shape, x, y, z, w, h, d, hex, rx = 0, rz = 0) => {
    place.position.set(x, y, z); place.rotation.set(rx, 0, rz); place.scale.set(w, h, d); place.updateMatrix();
    const geo = shape.index ? shape.toNonIndexed() : shape.clone();
    retreatSurface(geo, hex); geo.applyMatrix4(place.matrix); geo.applyMatrix4(cart.matrixWorld); parts.push(geo);
  };
  const wood = 0x6a5539, pale = 0x8c7656;
  for (let j = 0; j < 6; j++) part(box, 0, 0.62, -1 + j * 0.4, 1.3, 0.06, 0.36, j % 2 ? wood : pale);
  for (const x of [-0.62, 0.62]) part(box, x, 0.6, 0.5, 0.08, 0.1, 3.4, wood);
  // 車輪は輪と輻。片輪は外れて脇に倒れている。
  for (const [x, y, rz] of [[0.75, 0.52, 0], [-1.45, 0.05, 1.45]]) {
    part(rim, x, y, 0.1, 0.5, 0.5, 0.5, 0x4f4030, 0, rz);
    for (const a of [0, Math.PI / 2]) part(box, x, y, 0.1, 0.05, 0.92, 0.06, 0x5a4a36, a, rz);
  }
  part(box, 0, 0.52, 0.1, 1.6, 0.07, 0.07, 0x3f3428);
  // 荷台の葛籠と、こぼれた筵
  part(box, 0.15, 0.9, -0.5, 0.7, 0.5, 0.55, 0x6e5a3e);
  part(box, -0.2, 0.86, 0.3, 0.6, 0.42, 0.5, 0x7b6646);
  part(box, -1.2, 0.03, -0.2, 1.1, 0.04, 0.8, 0x9a8a62);
  addSacks(cx - 2.4, cz + 1.4, 1.1 + ry, 2); addSacks(cx + 2, cz - 1.8, -0.4 + ry, 1);
  }
  // 捨てた陣笠：赤茶の漆の笠を、荷車の脇と退く道へ伏せたり仰向けたりして散らす。
  const hat = new THREE.ConeGeometry(0.34, 0.13, 12, 1, true);
  const hatSpots = [[-3.6, -33.2, 0], [0.4, -36.8, 1], [-5.2, -37.5, 0], [-1.2, -40.6, 1], [1.8, -32.4, 0], [-8.6, -36.2, 1], [-3.4, -43.5, 0], [2.6, -41.2, 0], [18.6, -24.2, 1], [23.4, -19.8, 0], [16.2, -20.6, 0], [25.2, -25.4, 1],
    [9.5, -42.4, 1], [11.8, -40.6, 0], [17.4, -40.2, 1], [6.4, -45.2, 0], [20.6, -38.8, 0], [14.2, -47.6, 1], [15.2, -32.6, 1], [18.4, -31.8, 0], [24.6, -36.4, 1]];   // 正面の退く道（10/28）
  for (let j = 0; j < hatSpots.length; j++) {
    const [x, z, up] = hatSpots[j];
    place.position.set(x, W.heightAt(x, z) + (up ? 0.08 : 0.05), z);
    place.rotation.set(up ? Math.PI + 0.25 * Math.sin(j) : 0.18 * Math.cos(j * 3), j * 1.7, 0.2 * Math.sin(j * 2)); place.scale.set(1, 1, 1); place.updateMatrix();
    const geo = hat.toNonIndexed(); retreatSurface(geo, j % 3 ? 0x5a2a1c : 0x3c2418); geo.applyMatrix4(place.matrix); parts.push(geo);
  }
  hat.dispose();
  const geo = mergeGeometries(parts); for (const g of parts) g.dispose();
  geo.translate(0, -0.05, 0); geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material); mesh.castShadow = mesh.receiveShadow = true;
  rt.scene.add(mesh); resources.push(geo, material);
  // 下草：若葉の低い藪。雑木の根もとと持ち場の左の手前に。
  const bushGeo = retreatSurface(rockTuftShape(true));
  const bushes = new THREE.InstancedMesh(bushGeo, material, 160);
  const color = new THREE.Color(); let n = 0;
  const tones = [0x5d6a33, 0x4e5a2b, 0x6b7440, 0x56602f];
  for (const [bx, bz, r, k] of [[-20, -46, 7, 30], [-16, -27, 4, 14], [24, -60, 5, 18], [-12, -48, 3, 10], [-26, -34, 4, 12], [-12, -34, 3, 12], [-11, -57, 6, 18]]) {
    for (let j = 0; j < k && n < 120; j++) {
      const a = j * 2.39996 + bx, d = r * Math.sqrt((j + 0.5) / k);
      const x = bx + Math.cos(a) * d, z = bz + Math.sin(a) * d;
      if (x > -7 && x < 27 && z > -46 && z < -18) continue;
      const sz = 1.1 + 0.6 * ((j * 7) % 5) / 4;
      place.position.set(x, W.heightAt(x, z) - 0.03, z); place.rotation.set(0, a, 0.1 * Math.sin(j));
      place.scale.set(sz * 1.2, sz * 1.1, sz * 1.2); place.updateMatrix();
      bushes.setMatrixAt(n, place.matrix); bushes.setColorAt(n++, color.setHex(tones[j % 4]));
    }
  }
  // 25秒の持ち場の肩越しの手前と道の脇：膝より低い若葉の下草（平らな緑の一枚に見せない。10/28 点付け）。
  for (const [bx, bz, r, k] of [[9, -33, 5, 12], [15, -29, 5, 12], [9, -38, 4, 9], [22, -27, 5, 10], [26, -33, 4, 9], [5, -27, 3, 6]]) {
    for (let j = 0; j < k && n < 160; j++) {
      const a = j * 2.39996 + bz, d = r * Math.sqrt((j + 0.5) / k);
      const x = bx + Math.cos(a) * d, z = bz + Math.sin(a) * d;
      if (distToPolyline(x, z, HIKIDA_ROAD) < 2 || distToPolyline(x, z, ROAD) < 2.5) continue;
      const sz = 2.4 + 1.4 * ((j * 7) % 5) / 4;
      place.position.set(x, W.heightAt(x, z) - 0.03, z); place.rotation.set(0, a, 0.1 * Math.sin(j));
      place.scale.set(sz * 1.3, sz, sz * 1.3); place.updateMatrix();
      bushes.setMatrixAt(n, place.matrix); bushes.setColorAt(n++, color.setHex(tones[(j + 1) % 4]));
    }
  }
  bushes.count = n; bushes.receiveShadow = true; bushes.computeBoundingSphere();
  rt.scene.add(bushes); resources.push(bushGeo, bushes);
  // 25秒の肩越しの正面（疋田の道の上下の斜面）の若葉の灌木。腰から胸の高さの葉の塊を一束で（10/28 点付け）。
  // 葉の塊は透ける葉の板を交差させて組む（つるりとした多面体の玉に見せない。10/28）。形と絵は一つを使い回す。
  const leafCards = [];
  for (let i = 0; i < 11; i++) {
    const a = i * 2.39996, top = i >= 8, r = top ? 0.15 : 0.42 + (i % 3) * 0.12;
    for (let j = 0; j < 2; j++) {
      const card = new THREE.PlaneGeometry(1.0 + (i % 3) * 0.14, 0.95 + (i % 2) * 0.2);
      card.rotateX(-0.25 + (i % 3) * 0.22); card.rotateY(a + j * Math.PI / 2);
      card.translate(Math.cos(a) * r, top ? 0.95 + (i - 8) * 0.12 : 0.35 + (i % 4) * 0.17, Math.sin(a) * r);
      leafCards.push(card);
    }
  }
  const shrubGeo0 = mergeGeometries(leafCards); for (const g of leafCards) g.dispose();
  // 両面描きでは裏の葉の板の法線が下と奥を向き、塊が黒い玉に沈んだ（10/28 夜の25秒の画面）。
  // 板を表裏の二枚で持って片面で描き、法線は塊の芯から外と上へ向ける（どちらから見ても日を受けた若葉の明るさ）。
  const shrubGeo = shrubGeo0.toNonIndexed(); shrubGeo0.dispose();
  {
    const sp = shrubGeo.attributes.position.array, su = shrubGeo.attributes.uv.array, n = sp.length / 3;
    const P = new Float32Array(n * 6), U = new Float32Array(n * 4), N = new Float32Array(n * 6), v = new THREE.Vector3();
    for (let t = 0; t < n; t += 3) for (let side = 0; side < 2; side++) for (let k = 0; k < 3; k++) {
      const src = t + (side ? [0, 2, 1][k] : k), dst = side * n + t + k;
      P.set(sp.subarray(src * 3, src * 3 + 3), dst * 3); U.set(su.subarray(src * 2, src * 2 + 2), dst * 2);
      v.set(sp[src * 3], sp[src * 3 + 1] - 0.5, sp[src * 3 + 2]).normalize(); v.y += 0.9; v.normalize(); N.set([v.x, v.y, v.z], dst * 3);
    }
    shrubGeo.setAttribute('position', new THREE.BufferAttribute(P, 3)); shrubGeo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    shrubGeo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  }
  const shrubMat = new THREE.MeshLambertMaterial({ map: leafTex('broad'), alphaTest: 0.42 });
  const shrubs = new THREE.InstancedMesh(shrubGeo, shrubMat, 64);
  const leafTones = [0xb4cc78, 0x9cb862, 0xc4d488, 0x8aa656];   // 四月の若葉（絵の緑に掛ける明るい色）
  let ns = 0;
  for (const [bx, bz, r, k] of [[16.5, -34.5, 2.5, 6], [22.5, -38.5, 3, 8], [27.5, -41, 3.5, 8], [30.5, -34.5, 2.5, 5], [7, -46.5, 3.5, 7], [18, -47.5, 3, 6], [12, -39.5, 2, 4]]) {
    for (let j = 0; j < k && ns < 64; j++) {
      const a = j * 2.39996 + bz, d = r * Math.sqrt((j + 0.5) / k);
      const x = bx + Math.cos(a) * d, z = bz + Math.sin(a) * d;
      if (distToPolyline(x, z, HIKIDA_ROAD) < 1.8) continue;   // 疋田の道の踏み跡は空ける
      const sz = 0.55 + 0.35 * ((j * 5) % 4) / 3;
      place.position.set(x, W.heightAt(x, z) - 0.08, z); place.rotation.set(0, a, 0);
      place.scale.set(sz * 1.5, sz * 1.25, sz * 1.4); place.updateMatrix();
      shrubs.setMatrixAt(ns, place.matrix); shrubs.setColorAt(ns++, color.setHex(leafTones[j % 4]));
    }
  }
  shrubs.count = ns; shrubs.receiveShadow = true; shrubs.computeBoundingSphere();   // 葉の板の四角い影を落とさない
  rt.scene.add(shrubs); resources.push(shrubGeo, shrubMat, shrubs);
  box.dispose(); rim.dispose();
}

// 主郭の長屋の庇。写真の板屋根と独立柱を、金ヶ崎の小さな詰所に合わせて縮める。
// 形・材質は一組、全て静止した一束。室内と登城道には張り出さない。
function retreatLonghouseEave(rt, x, z) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color:0xffffff, roughness:1 });
  const mesh = new THREE.InstancedMesh(geo, mat, 80);
  const at = new THREE.Object3D(), color = new THREE.Color();
  const y = rt.world.heightAt(x,z), pitch = .24;
  let count = 0;
  const box = (px,py,pz,w,h,d,hex,tilt=0) => {
    at.position.set(x+px,py,z+pz); at.rotation.set(tilt,0,0); at.scale.set(w,h,d); at.updateMatrix();
    mesh.setMatrixAt(count,at.matrix); mesh.setColorAt(count++,color.setHex(hex));
  };
  // 短い板を三段に重ね、隣の列で継ぎ目をずらす。元の軒先と勾配は保つ。
  for (let i=0;i<18;i++) {
    const cuts = [0,.31+(i%2)*.06,.65+(i%2)*.06,1];
    for (let row=0;row<3;row++) {
      const a=cuts[row], b=Math.min(1,cuts[row+1]+.025), along=((a+b)/2-.5)*2.4;
      box(-3.6+(i+.5)*.4,y+2.19-along*Math.sin(pitch)+(2-row)*.018,
        2.55+along*Math.cos(pitch),.39,.065,(b-a)*2.4,
        KG_ROOF_COLORS[(i*7+row*3)%KG_ROOF_COLORS.length],pitch);
    }
  }
  for (const dz of [1.75,3.3]) box(0,y+2.19-(dz-2.55)*Math.tan(pitch)+.075,dz,7.35,.08,.09,0x4c4031);
  for (const dx of [-3.3,-1.1,1.1,3.3]) {
    const ground = rt.world.heightAt(x+dx,z+3.45), top = y+1.9;
    box(dx,(ground+top)/2,3.45,.13,Math.max(.1,top-ground),.13,0x554736);
    box(dx,ground+.06,3.45,.27,.12,.26,0x777166);
    box(dx,y+2.10,2.55,.1,.12,2.35,0x4e4030,pitch);
  }
  box(0,y+1.84,3.45,7,.15,.15,0x4d3f2e);
  box(0,y+2.36,1.45,7,.14,.14,0x4d3f2e);
  mesh.count = count; mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.camBlock = true;
  rt.flags.sceneryResources.push(geo,mat,mesh); rt.scene.add(mesh);
}

// 動かない荷駄馬は部品を結合し、四頭を一度に描く。近い時だけ滑らかな形に戻す。
// Group.clone は距離による形の切替を複製しないため、元の部品から両方の形を取り出す。
function retreatFallenHorses(rt, spots) {
  const source = buildHorse(), parts = [[], []];
  // 立った馬をそのまま横へ回すと、四肢が一直線に突き出す。
  // 結合する前に膝・首・耳を休ませ、同じ伏せた形を四頭で使う。
  const horse = source.userData.horse;
  for (let i = 0; i < horse.legs.length; i++) {
    horse.legs[i].rotation.x = i < 2 ? 0.35 : -0.3;
    horse.lowers[i].rotation.x = i < 2 ? -0.85 : 0.75;
  }
  horse.neck.rotation.set(0.25, 0, -0.1);
  for (const ear of horse.ears) ear.rotation.x = -0.35;
  let material;
  source.updateMatrixWorld(true);
  // 接地は胴で測る。坂上の蹄や鐙を支点にすると、重い胴が宙へ持ち上がる。
  const support = horse.body.geometry.clone().applyMatrix4(horse.body.matrixWorld);
  source.traverse(m => {
    if (!m.isMesh) return;
    material = m.material;
    const lod = m.userData.lod;
    for (let level = 0; level < 2; level++) {
      const geo = lod ? lod[level] : m.geometry;
      parts[level].push(geo.clone().applyMatrix4(m.matrixWorld));
    }
  });
  const meshes = parts.map(list => {
    const geo = mergeGeometries(list);
    for (const part of list) part.dispose();
    const mesh = new THREE.InstancedMesh(geo, material, spots.length);
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.count = 0;
    rt.flags.sceneryResources.push(geo, mesh); rt.scene.add(mesh);
    return mesh;
  });
  const matrices = new Float32Array(spots.length * 16), ys = new Float32Array(spots.length);
  const place = new THREE.Object3D(), point = new THREE.Vector3();
  const normal = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tilt = new THREE.Quaternion();
  spots.forEach(([x, z, r], i) => {
    const W = rt.world;
    normal.set(W.heightAt(x - 1, z) - W.heightAt(x + 1, z), 2,
      W.heightAt(x, z - 1) - W.heightAt(x, z + 1)).normalize();
    place.position.set(x, W.heightAt(x, z), z);
    place.rotation.set(0, r, Math.PI / 2);
    place.quaternion.premultiply(tilt.setFromUnitVectors(up, normal));
    place.updateMatrix();
    // 胴を土へ据える。斜面に触れる脚先は少し埋まり、胴を押し上げない。
    // 調べるのは配置時だけ。描く時の距離切替では行列を使い回す。
    let gap = Infinity;
    const positions = support.attributes.position;
    for (let k = 0; k < positions.count; k++) {
      point.fromBufferAttribute(positions, k).applyMatrix4(place.matrix);
      gap = Math.min(gap, point.y - W.heightAt(point.x, point.z));
    }
    place.position.y += 0.015 - gap; place.updateMatrix();
    ys[i] = place.position.y;
    place.matrix.toArray(matrices, i * 16);
  });
  support.dispose();
  let previous = -1;
  rt.flags.fallenHorseTick = camera => {
    let mask = 0;
    for (let i = 0; i < spots.length; i++) {
      const dx = camera.position.x - spots[i][0], dy = camera.position.y - ys[i], dz = camera.position.z - spots[i][1];
      if (dx * dx + dy * dy + dz * dz < 30 * 30) mask |= 1 << i;
    }
    if (mask === previous) return;
    previous = mask;
    for (const mesh of meshes) mesh.count = 0;
    for (let i = 0; i < spots.length; i++) {
      const mesh = meshes[mask & (1 << i) ? 0 : 1], at = mesh.count++ * 16;
      for (let k = 0; k < 16; k++) mesh.instanceMatrix.array[at + k] = matrices[i * 16 + k];
    }
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  };
}

function kgFlagCounts(rt) {
  return rt.flags.tono.map(g => `${g.name}の旗 ${g.units.reduce((n, u) => n + (kgActive(u) ? 1 : 0), 0)}／${g.initial}人`).join('、');
}
const gone = (g) => !g || (!g.kgPending && g.count === 0) || g.routed;
// 備を立て直す兵で合流を測る。深手で退く者を隊の中心へ混ぜて待ち続けない。
// 最後の退き口と同じく六割の合流を要し、残りの兵は道を歩いて続く。
function lineGather(rt, L) {
  const F = rt.flags;
  if (F.lineGatherAt > rt.t) return;
  F.lineGatherAt = rt.t + 0.5;
  F.lineReady = true; F.lineWaiting = '';
  let gap = 0;
  const late = rt.t - (F.stepT || 0) > 25;
  const fighting = (u) => u.target?.alive && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 4;
  for (const g of F.tono) {
    if (gone(g)) continue;
    let ready = 0, near = 0, remaining = 0;
    // 手当てへ退く兵は今の備を立て直せない。戻れば次の確認から数える。
    for (const u of g.units) if (kgActive(u) && !u.rearWound) {
      const d = Math.hypot(u.pos.x - L.x, u.pos.z - L.z);
      // 下知から二十五秒過ぎても追手と打ち合って離れられない兵は、合流を待たずに数から外す（着けばまた数える）。
      // 備に着いた本人を一分半も立たせず、先に着いた者で備を立て直す。
      if (late && d >= 40 && fighting(u)) continue;
      ready++;
      const southBank = F.line !== 1 || u.pos.z >= 22;
      // 渡し場の北の岸で追手を受けている者も、備の四十歩の内なら備に着いたと数える（川岸で打ち合って輪の外に留まり続けた）。
      if (d < 30 && southBank || d < 40) near++;
      const left = Math.max(0, d - 30, southBank ? 0 : 22 - u.pos.z);
      gap += left; remaining += left;
    }
    const leader = g.leader;
    const leaderNear = !leader || !kgActive(leader) || leader.rearWound || late && fighting(leader) ||
      Math.hypot(leader.pos.x - L.x, leader.pos.z - L.z) < (F.line !== 1 || leader.pos.z >= 22 ? 30 : 40);
    if (!ready) continue;
    if (near >= Math.ceil(ready * 0.6) && leaderNear) continue;
    F.lineReady = false;
    if (!F.lineWaiting) {
      const name = g === F.kino ? '木下の組' : g === F.ikeda ? '池田の組' : '明智の組';
      // 未着の兵が合流範囲へ届くまでの直線の概算。橋の北側は南岸まで数える。
      // 旗の中心へ集まる必要はない。半秒ごとの既存の集計を使い回す。
      const steps = Math.ceil(remaining / Math.max(1, ready - near) / .75);
      F.lineWaiting = near >= Math.ceil(ready * 0.6) && !leaderNear
        ? `${name}の大将が退いてくる。来た道を守れ`
        : `${name}の合流 ${near}／${ready}人。未着の兵は平均約${steps}歩先`;
    }
  }
  if (F.lineGap === undefined || gap < F.lineGap - 1) { F.lineGap = gap; F.lineProgressAt = rt.t; }
}
// 横備えの足場を麓で選ぶ。退却後は持ち場だけを替え、兵は歩いて並び直す。
function settleRearguard(rt, g, opening = true) {
  const W = rt.world, x0 = g.anchor.x, z0 = g.anchor.z;
  const ranks0 = g.ranks, yari0 = g.yariRanks;
  const face0 = g._face, march0 = g.marching;
  // 最後の合流でも、今いる退き口を基準にする。三の備へ戻して探さない。
  const L = rt.flags.fleeing ? KUTSUKI : LINES[rt.flags.line || 0], lim = W.def.moveLim || 176;
  g._face = g.facing; g.marching = false;
  let best = Infinity, bx = x0, bz = z0, chosen = 0;
  let fallback = Infinity, fx = x0, fz = z0, compact = 0;
  // 三段が収まらない時だけ四段・五段を試す。探すのは麓の持ち場の周囲だけ。
  for (let pass = 0; pass < 3 && best === Infinity; pass++) {
    g.yariRanks = yari0 + pass;
    if (g.isGun) g.ranks = Math.max(2, ranks0 || 2) + pass;
    for (let dz = 0; dz <= (opening ? 24 : 12); dz += 2) for (let dx = -12; dx <= 12; dx += 2) {
      // 次の備を離れた所で止まると合流を待ち続ける。旗の周囲だけで探す。
      if (!opening && Math.hypot(x0 + dx - L.x, z0 + dz - L.z) > 20) continue;
      g.anchor.x = x0 + dx; g.anchor.z = z0 + dz;
      let slope = 0, clear = true;
      for (const u of g.units) {
        if (!opening && !kgActive(u)) continue;
        const p = g.slotPos(u.slot, g.initial);
        if (opening && u.allyOk) p.z += 7; // 開幕の三将は槍列の後ろに残す。
        // 最終的に並ぶ足場を調べる。生成時の横長の列を条件に残さない。
        if (Math.abs(p.x) >= lim || Math.abs(p.z) >= lim || !W.walkable(p.x, p.z) || W.inWaterAt(p.x, p.z)) { clear = false; break; }
        const s = Math.hypot(W.heightAt(p.x + 0.5, p.z) - W.heightAt(p.x - 0.5, p.z),
          W.heightAt(p.x, p.z + 0.5) - W.heightAt(p.x, p.z - 0.5));
        slope = Math.max(slope, s);
      }
      const score = Math.hypot(dx, dz) + slope * 12;
      if (clear && slope <= 0.45 && score < best) { best = score; bx = x0 + dx; bz = z0 + dz; chosen = pass; }
      // 緩い足場が足りなくても、元の横長の生成位置へ兵を戻さない。
      const safeScore = slope * 100 + Math.hypot(dx, dz) + pass * 4;
      if (clear && safeScore < fallback) { fallback = safeScore; fx = x0 + dx; fz = z0 + dz; compact = pass; }
    }
  }
  if (best === Infinity && fallback < Infinity) { bx = fx; bz = fz; chosen = compact; }
  g.yariRanks = yari0 + chosen;
  g.ranks = g.isGun ? Math.max(2, ranks0 || 2) + chosen : ranks0;
  g.anchor.x = bx; g.anchor.z = bz;
  if (!opening) { g._face = face0; g.marching = march0; return; }
  for (const u of g.units) {
    if (best < Infinity || fallback < Infinity) {
      const p = g.slotPos(u.slot, g.initial);
      if (u.allyOk) p.z += 7;
      u.pos.x = p.x; u.pos.z = p.z;
    }
    u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.mesh.position.copy(u.pos);
    // 寄せを待つ間も、既存の見回し・息継ぎ・槍の持ち直しを一人ずつ始める。
    rt.army.idleFx(u, 0);
    u.idl.a = u.slot % 3 === 0 ? 'look' : u.slot % 3 === 1 ? 'breathe' : 'regrip';
    u.idl.k = (u.slot % 4) * 0.35; u.idl.d = 3 + (u.slot % 3);
  }
  g._face = face0; g.marching = march0;
}
// この退却戦だけ、味方の進軍の声と隊の様子を退く下知に合わせる。
// 合図は段が替わった時だけ。札の再表示で鳴らし直さない。
function retreatSignal(rt) {
  const F = rt.flags;
  if (rt.over || F.quiet || F.retreatSoundPhase === rt.phase) return;
  F.retreatSoundPhase = rt.phase;
  rt.army.playFar('sig_nobiki', F.kinoU.pos, 1);
}
function pursuitSignal(rt, pos) {
  rt.army.playFar('sig_kakari', pos, 1);
  const o = rt.objectives.find(o => o.id === 'main');
  if (o && !rt.G.lord) {
    o.cue = '合図：敵の陣太鼓の早打ち＝追手が寄せる。備を守れ'; o.cueT = rt.t;
  }
}
// 呼び口と札の見た目は開幕に一度だけ包み、戦が終われば戻す。
function retreatNotices(rt) {
  const call = rt.soldierCall.bind(rt), bark = rt.bark.bind(rt);
  const F = rt.flags, say = rt.hud.say.bind(rt.hud), hudBark = rt.hud.bark.bind(rt.hud);
  const signalCue = rt.signalCue;
  // 殿を守る札や「退けの下知を待て」では退き太鼓を鳴らさない。
  // 実際に退く札にだけ合図を添え、一つの退く段につき一度知らせる。
  rt.signalCue = (o) => {
    if (o.kind !== 'main' || rt.over || F.quiet) return;
    const withdrawing = rt.G.lord || F.fleeing || F.step === 2 || F.step === 4;
    if (!withdrawing || !/退け|へ退く/.test(o.text) || /待て|止めよ|守れ/.test(o.text)) {
      o.cue = ''; return;
    }
    o.cue = '合図：法螺貝と退き太鼓＝組と退け'; o.cueT = rt.t;
    retreatSignal(rt);
  };
  const banner = rt.hud.banner.bind(rt.hud), kill = rt.onKill.bind(rt);
  const pushNotice = rt.hud.notices.push.bind(rt.hud.notices);
  const hooks = rt.army.hooks, gunAtPlayer = hooks.onGunAtPlayer, volleyCall = hooks.onFoeVolleyCall;
  // 共通の発射前の待ち時間に合わせて知らせる。鉄砲の向きは射手の位置から取る。
  // 台詞は八秒あけ、矢印は共通の危険札が実際の射線に合わせて出す。
  const gunCue = (u) => {
    const p = rt.player.u;
    if (!p.alive || rt.over || !u || rt.t < (F.gunCueAt ?? -99) + 8) return;
    const a = Math.atan2(u.pos.x - p.pos.x, u.pos.z - p.pos.z) - rt.player.yaw;
    const direction = Math.cos(a) > 0.5 ? '前' : Math.cos(a) < -0.5 ? '後ろ' : Math.sin(a) > 0 ? '左' : '右';
    F.gunCueAt = rt.t;
    rt.hud.say('組頭', `${direction}から鉄砲！　物陰へ退け`, 2.8, true);
    // 火蓋の音は共通の射手の処理が位置に合わせて鳴らす。耳元へ重ねない。
  };
  hooks.onGunAtPlayer = (u) => { gunAtPlayer?.(u); gunCue(u); };
  hooks.onFoeVolleyCall = (g, u, wait) => {
    volleyCall?.(g, u, wait);
    // 共通の射線判定が予告した列だけを知らせる。遠い、こちらを狙わない列は除く。
    for (const shooter of g.units) if (kgActive(shooter) && shooter.type === 'gun' && shooter.shotWarnUntil > rt.army.time) {
      gunCue(shooter); break;
    }
  };
  const update = rt.hud.update.bind(rt.hud), root = rt.hud.root;
  const layout = document.createElement('style');
  layout.textContent = `
    /* 地図の左に二十四画素空ける。携帯の既存の配置はそのまま使う。 */
    @media (min-width:1100px) and (min-height:501px) {
      html:root:not(.touch) body #hud.kg-retreat #battle-notices:not(.choosing),
      html:root:not(.touch) body #hud.kg-retreat #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
        left:auto !important; right:calc(212px + env(safe-area-inset-right, 0px)) !important;
        top:calc(104px + env(safe-area-inset-top, 0px)) !important;
        width:300px !important; max-height:calc(100% - 224px) !important;
      }
      /* 槍の構えを教える間も、任務を地図脇へ固定せず同じ欄へ収める。 */
      html:root:not(.touch) body #hud.kg-retreat #battle-notices:not(.choosing) #objectives:not(.expand) {
        position:relative !important; inset:auto !important; transform:none !important;
        width:100% !important; max-width:100% !important;
      }
      /* 三桁の歩数も三百画素の札へ収め、数だけ次の行へ押し出さない。 */
      html:root:not(.touch) body #hud.kg-retreat #battle-notices #objectives:not(.expand) #obj-list li.cur .obj-now,
      html:root:not(.touch) body #hud.kg-retreat #battle-notices #objectives:not(.expand) .battle-action {
        font-size:max(18px, calc(18px * var(--text-scale, 1))) !important;
      }
    }
    #hud.kg-retreat #battle-notices #subtitle,
    #hud.kg-retreat #battle-notices #banner,
    #hud.kg-retreat #battle-notices .battle-notice {
      white-space:normal !important; overflow:visible !important; overflow-wrap:anywhere; text-overflow:clip;
      box-sizing:border-box; min-width:0; max-width:100% !important;
      font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.4;
    }
    #hud.kg-retreat #battle-notices #subtitle .sp { display:inline; margin:0 8px 0 0; }
    /* 傷の長い一文で列の最小幅を広げず、残量と白い帯も墨の札へ収める。 */
    html body #hud.kg-retreat .bl #h-hp.hp {
      grid-template-columns:max-content minmax(0,1fr) !important;
      max-width:100%; min-width:0;
    }
    html body #hud.kg-retreat .bl #h-hp.hp em {
      min-width:0; max-width:100%; justify-self:stretch;
      white-space:normal !important; word-break:normal; overflow-wrap:anywhere;
      font-size:max(14px, calc(14px * var(--text-scale, 1))) !important;
    }
    /* 台詞のない時は空の墨帯を出さない。次の台詞は共通の更新で再び出す。 */
    html:root body #hud.kg-retreat #battle-notices #battle-message > #subtitle:empty { display:none !important; }
    /* 遮蔽の案内が出ても任務を消さない。空の墨帯だけが残るのを防ぐ。 */
    html body #hud.kg-retreat.cover-guidance #battle-notices #objectives:not(.expand) { display:block !important; }
    /* 対処の一言や旗の案内の間も、守る備と退く合図を同じ札に残す。 */
    html:root body #hud.kg-retreat #battle-notices #objectives:not(.expand) #obj-list {
      display:block !important;
    }
    /* 操作札がある時の共通の省略より優先し、乱戦でも下知を空札にしない。 */
    html:root body #hud.kg-retreat #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list,
    html:root body #hud.kg-retreat #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) #obj-list li.cur .obj-text {
      display:block !important;
    }
    /* 回避の印が出ても、どの備を守るかを上端の任務に残す。 */
    html:root body #hud.kg-retreat:is(.dodge-active,.rain-danger) #battle-notices #objectives:not(.expand) {
      position:relative !important; inset:auto !important; transform:none !important;
      background:rgba(20,18,15,.9) !important;
    }
    html:root body #hud.kg-retreat:is(.dodge-active,.rain-danger) #battle-notices #objectives:not(.expand) li.cur small {
      display:none !important;
    }
    html body #hud.kg-retreat:is(.guard-guide,.flag-guide,.person-guide) #battle-notices #objectives:not(.expand) {
      background:rgba(20,18,15,.9) !important; padding:6px 8px !important;
    }
    /* 見回す案内の間も、守る備と退く合図を読み続けられるようにする。 */
    html:root body #hud.kg-retreat.dodge-turn-coach #battle-notices:not(.choosing) {
      visibility:visible !important;
    }
    /* 兵を覆う大札は避け、足元の輪と短い一行で隠れ場所を示す。 */
    html body #hud.kg-retreat .cover-guide {
      width:max-content; max-width:200px; padding:4px 8px;
      border:0; box-shadow:none; font-size:max(15px, calc(15px * var(--text-scale, 1)));
    }
    html body #hud.kg-retreat .cover-guide::before,
    html body #hud.kg-retreat .cover-guide:not(.edge)::after { display:none; }
    html body #hud.kg-retreat .cover-guide.edge::after {
      display:inline-block; font-size:20px; line-height:24px; margin:0 0 0 8px;
    }
    /* 長い軍名の末尾だけを折り返さず、下知まで読める高さを残す。 */
    #hud.kg-retreat #intro .sides {
      font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.6; letter-spacing:0;
      overflow-wrap:normal; word-break:normal;
    }
    /* 下知と人物の紹介は本文だけを送り、出陣の釦は常に残す。 */
    html body #hud.kg-retreat #intro:has(#intro-go) > .card.card {
      display:flex; flex-direction:column; gap:8px;
    }
    html body #hud.kg-retreat #intro:has(#intro-go) .intro-reading {
      flex:1 1 auto; min-height:0; overflow-y:auto; pointer-events:auto;
      touch-action:pan-y; overscroll-behavior:contain;
      padding-bottom:16px; scroll-padding-bottom:16px;
    }
    @media (min-height:501px) {
      html body #hud.kg-retreat #intro:has(#intro-go) > .card.card {
        height:auto; max-height:min(640px, 72dvh);
      }
    }
    /* 数字だけの四十四画素幅を解除し、「報せ○件」を切らずに読ませる。 */
    html.touch body #hud.kg-retreat > #battle-log-entry {
      width:auto !important; min-width:88px; min-height:44px; padding:4px 8px;
    }
    /* 横の携帯は上の三分の一で積み、任務の下端を途中で切らない。 */
    @media (max-height:500px) {
      /* 人物の紹介より先に、最初の持ち場と退く合図を読めるようにする。 */
      #hud.kg-retreat #intro .intro-reading { display:flex; flex-direction:column; }
      #hud.kg-retreat #intro .intro-reading > * { flex-shrink:0; }
      #hud.kg-retreat #intro :is(.intro-person,.intro-castle) { order:1; }
      html:root body #hud.kg-retreat #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
        top:calc(12px + env(safe-area-inset-top, 0px)) !important;
        max-height:calc(100% / 3 - 12px - env(safe-area-inset-top, 0px)) !important;
        overflow-y:auto; pointer-events:auto;
      }
    }
    #hud.kg-retreat #battle-notices #banner .brush { display:inline; }
    #hud.kg-retreat #battle-notices #subtitle .more,
    #hud.kg-retreat #battle-notices #banner small,
    #hud.kg-retreat #objectives:not(.expand) li :is(small,.opb),
    #hud.kg-retreat #objectives:not(.expand) li.more { display:none !important; }
    /* 退く下知の間は、畳んだ任務にも行き先と残りの距離を残す。 */
    html:root body #hud.kg-retreat.kg-withdrawing :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur small.goal-place {
      display:block !important; color:#ece4d2; background:#14120f;
      font-size:max(13px, calc(13px * var(--text-scale, 1))); line-height:1.4;
      white-space:normal !important; overflow-wrap:anywhere;
    }
    /* 道中の距離は行き先の一行にまとめる。到着後は味方を待つ理由を戻す。 */
    html:root body #hud.kg-retreat.kg-withdrawing:not(.kg-at-line):not(.kg-at-exit) :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur small:not(.goal-place) {
      display:none !important;
    }
    /* 正式な退却の歩数は本文にある。十二歩先の案内点までの距離を添えない。 */
    html:root body #hud.kg-retreat.kg-withdrawing #battle-notices:not(.choosing):has(#objectives.keep-combat-task) #objectives.keep-combat-task:not(.expand) li.cur small.goal-place {
      display:none !important;
    }
    /* 旗に着いたら距離よりも、まだ退いている味方を待つ下知を出す。 */
    html:root body #hud.kg-retreat.kg-at-line #objectives:not(.expand) li.cur small:not(.goal-place) {
      display:block !important; font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.4;
    }
    html:root body #hud.kg-retreat.kg-at-line #objectives:not(.expand) li.cur small.goal-place { display:none !important; }
    /* 退き口では距離に代えて、待つ味方と呼び集める下知を見せる。 */
    html:root body #hud.kg-retreat.kg-at-exit #objectives:not(.expand) li.cur small:not(.goal-place) {
      display:block !important; font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.4;
    }
    html:root body #hud.kg-retreat.kg-withdrawing.kg-at-exit :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur small.goal-place { display:none !important; }
    /* 携帯でも、旗の下で待つ理由を任務一枚の中へ残す。 */
    html:root body #hud.kg-retreat:is(.kg-at-line,.kg-at-exit,.kg-holding) :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur small:not(.goal-place) {
      display:block !important; font-size:max(13px, calc(13px * var(--text-scale, 1))); line-height:1.4;
      white-space:normal !important; overflow-wrap:anywhere; overflow:visible !important;
      height:auto !important; max-height:none !important; text-overflow:clip;
    }
    html:root body #hud.kg-retreat:is(.kg-at-line,.kg-at-exit,.kg-holding) :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur small.goal-place { display:none !important; }
    html:root body #hud.kg-retreat :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur {
      white-space:normal !important; overflow:visible !important;
      font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.4;
    }
    /* 本文の箱を札の内幅にそろえる。行内の百分率幅と余白で右端を切らない。 */
    html:root body #hud.kg-retreat :is(#battle-notices,#choice-tasks) #objectives:not(.expand) #obj-list li.cur .obj-text {
      display:block !important; min-width:0;
      white-space:normal !important; overflow:visible !important; overflow-wrap:anywhere;
    }
    html:root body #hud.kg-retreat :is(#battle-notices,#choice-tasks) #objectives:not(.expand) #obj-list li.cur .obj-now {
      display:block !important; width:100% !important; box-sizing:border-box;
      padding:0 !important; margin:0 !important;
      white-space:normal !important; overflow-wrap:anywhere !important;
      height:auto !important; max-height:none !important; overflow:visible !important;
      -webkit-line-clamp:unset; line-clamp:unset;
    }
    html:root body #hud.kg-retreat :is(#battle-notices,#choice-tasks) #objectives:not(.expand) li.cur {
      display:block !important;
      width:100% !important; min-width:0 !important; max-width:100% !important;
      box-sizing:border-box; margin:0 !important; padding:0 !important;
    }
    /* 待つ理由の末尾も折り返す。表示する補足の選択は上の段ごとの指定に任せる。 */
    html:root body #hud.kg-retreat :is(#battle-notices,#choice-tasks) #objectives:not(.expand) #obj-list li.cur small {
      width:auto !important; min-width:0; max-width:100%; box-sizing:border-box;
      white-space:normal !important;
      overflow-wrap:anywhere; overflow:visible !important; text-overflow:clip;
      height:auto !important; max-height:none !important;
      -webkit-line-clamp:unset; line-clamp:unset;
    }
    /* 一の備の補足も、長い日本語を一続きの語として札の右で切らない。 */
    html:root body #hud.kg-retreat :is(#battle-notices,#choice-tasks) #objectives:not(.expand) #obj-list li.cur :is(.obj-now,small) {
      white-space:normal !important; word-break:normal !important;
      overflow-wrap:anywhere !important; overflow:visible !important;
    }
    /* 携帯の共通札より強く幅を定め、補足も本文と同じ箱の中で折り返す。 */
    html:root body #hud.kg-retreat :is(#battle-notices,#choice-tasks) #objectives:not(.expand),
    html:root body #hud.kg-retreat :is(#battle-notices,#choice-tasks) #objectives:not(.expand) #obj-list {
      width:100% !important; min-width:0 !important; max-width:100% !important;
      box-sizing:border-box;
    }
    html:root body #hud.kg-retreat :is(#battle-notices,#choice-tasks) #objectives:not(.expand) #obj-list li.cur > :is(.obj-text,small) {
      position:static !important; transform:none !important;
      width:100% !important; min-width:0 !important; max-width:100% !important;
      box-sizing:border-box; margin-inline:0 !important; letter-spacing:normal !important;
    }
    /* 補足を行内のまま本文へ続けず、朱の縁の手前で独立して折り返す。 */
    html:root body #hud.kg-retreat:is(.kg-at-line,.kg-at-exit,.kg-holding) :is(#battle-notices,#choice-tasks) #objectives:not(.expand) #obj-list li.cur small:not(.goal-place) {
      display:block !important; padding-inline:0 !important; text-indent:0 !important;
    }
    /* 携帯横では欄の百分率幅と札の最小幅を競合させず、補足まで同じ幅で折る。 */
    @media (max-height:500px) {
      html:root body #hud.kg-retreat #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
        width:300px !important; max-width:calc(100vw - 232px) !important;
        min-width:0 !important; box-sizing:border-box;
      }
    }
    /* 地面の案内が札を移しても、本文の箱と赤い縁を別々の幅にしない。
       共通の移動札・一行札の指定より強く、金ヶ崎の任務欄へ収める。 */
    html:root body #hud.kg-retreat #battle-notices:not(.choosing) #objectives:not(.expand),
    html:root body #hud.kg-retreat #battle-notices:not(.choosing) #objectives.ground-order:not(.expand),
    html:root body #hud.kg-retreat #battle-notices:not(.choosing) #objectives#objectives.route-summary:not(.expand) {
      position:relative !important; inset:auto !important; transform:none !important;
      width:100% !important; max-width:100% !important;
      height:auto !important; max-height:none !important; flex:0 0 auto;
      box-sizing:border-box; overflow:visible !important;
    }
    html:root body #hud.kg-retreat #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list,
    html:root body #hud.kg-retreat #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now,small),
    html:root body #hud.kg-retreat #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-text > .obj-now,
    html:root body #hud.kg-retreat #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action {
      width:100% !important; min-width:0 !important; max-width:100% !important;
      height:auto !important; max-height:none !important; box-sizing:border-box;
      white-space:normal !important; word-break:normal !important; overflow-wrap:anywhere !important;
      overflow:visible !important; text-overflow:clip; -webkit-line-clamp:unset; line-clamp:unset;
      font-size:max(16px, calc(16px * var(--text-scale, 1))) !important; line-height:1.4 !important;
    }
    /* 空白で区切られた下知も、句ごとの折返し禁止を引き継がない。
       親だけを折り返しても、中の句が札より長いと右端で切れてしまう。 */
    html:root body #hud.kg-retreat :is(#battle-notices,#choice-tasks) #objectives:not(.expand) .obj-now .task-phrase {
      display:inline !important; white-space:normal !important; overflow-wrap:anywhere;
    }
    /* 今の下知は一度だけ出す。共通の退避用の添え書きで同じ文を二重にしない。 */
    html:root body #hud.kg-retreat :is(#battle-notices,#choice-tasks) #objectives:not(.expand) #obj-list li.cur :is(.obj-full,.retreat-caption) {
      display:none !important;
    }
    /* 共通の移動札の指定にも勝たせ、守備中に退避の操作を二重に出さない。
       正式に退く間と手当てへの移動では、短い操作の説明を残す。 */
    html:root body #hud.kg-retreat #battle-notices #objectives.travel-retreat:not(.expand) #obj-list li.cur .retreat-caption {
      display:none !important;
    }
    html:root body #hud.kg-retreat:is(.kg-withdrawing,.kg-treating) #battle-notices #objectives.travel-retreat:not(.expand) #obj-list li.cur .retreat-caption {
      display:block !important; white-space:normal !important; overflow-wrap:anywhere;
      font-size:max(13px, calc(13px * var(--text-scale, 1))) !important; line-height:1.4;
    }
    html:root body #hud.kg-retreat:is(.kg-withdrawing,.kg-treating) #battle-notices #objectives .retreat-gesture {
      width:24px !important; height:24px !important;
    }
    /* 対処の札と今の下知が同じ時は一度だけ示し、守る備の補足は残す。 */
    html:root body #hud.kg-retreat.kg-repeat-order #battle-notices #objectives:not(.expand) #obj-list li.cur .obj-now {
      display:none !important;
    }
    /* 短い退却命令と歩数付きの任務が重なった時は、歩数のある方を残す。 */
    html:root body #hud.kg-retreat.kg-repeat-route-order #battle-notices #objectives:not(.expand) .battle-action {
      display:none !important;
    }
    html:root body #hud.kg-retreat.kg-repeat-route-order #battle-notices #objectives:not(.expand) #obj-list li.cur .obj-now {
      display:block !important;
    }
    /* 守る釦の補足を一字だけ次の行へ送らず、戦場の右側を空ける。 */
    html.touch body #hud.kg-retreat #wait-guard {
      width:248px; grid-template-columns:32px minmax(0,1fr) 24px;
      column-gap:6px; padding:6px; min-height:72px;
    }
    html.touch body #hud.kg-retreat #wait-guard :is(span,small) {
      font-size:max(16px, calc(16px * var(--text-scale, 1))); line-height:1.4;
    }
    html:root body #hud.kg-retreat #battle-notices #subtitle {
      position:relative !important; inset:auto !important; transform:none !important;
      width:100% !important; margin:0 !important; max-height:none !important;
    }
    .battle-retry.kg-retry {
      display:flex; flex-direction:column; gap:8px;
      width:min(360px, calc(100vw - 16px)) !important;
    }
    .battle-retry.kg-retry .retry-reading { display:contents; }
    .battle-retry.kg-retry h2 { order:0; font-size:20px !important; margin:0 !important; }
    .battle-retry.kg-retry > p { order:1; margin:0 !important; }
    .battle-retry.kg-retry .retry-actions { order:2; }
    .battle-retry.kg-retry [data-cause] { display:none; }
    .battle-retry.kg-retry .retry-reading > p:last-child {
      order:3; margin:0 !important; font-size:15px !important; line-height:1.4;
    }
    /* 以前の退却札の指定より優先し、任務は右上の一行へまとめる。 */
    html:root body #hud.kg-retreat.prog-on #battle-notices#battle-notices:not(.choosing) #objectives#objectives:not(.expand),
    html:root body #hud.kg-retreat.prog-on #battle-notices#battle-notices #battle-message#battle-message :is(#subtitle,.battle-notice),
    html:root body #hud.kg-retreat.prog-on :is(#tutorial,#situation,#skiphint,.battle-action) {
      display:none !important;
    }
    html:root body #hud.kg-retreat #h-prog .pg-st span {
      white-space:nowrap !important; overflow-wrap:normal; word-break:keep-all;
    }
  `;
  document.head.appendChild(layout); root.classList.add('kg-retreat');
  // 十二秒の救命判定は保ち、危険の札だけ短く出す。
  rt.hud.notices.push = (text, priority, seconds, kind, valid) => {
    if (kind === 'warn' && /^危ない/.test(text)) {
      seconds = 2.8;
      if (/味方の列か物陰/.test(text)) text = '危ない！味方の列か物陰へ退け';
    }
    return pushNotice(text, priority, seconds, kind, valid);
  };
  let retryDialog = null;
  rt.hud.update = (dt, battle) => {
    root.classList.toggle('kg-withdrawing', !rt.over && rt.player.u.alive &&
      !!(rt.G.lord || F.fleeing || F.step === 2 || F.step === 4));
    root.classList.toggle('kg-at-exit', !rt.over && !!F.fleeing && rt.distTo(KUTSUKI) < KUTSUKI.r);
    root.classList.toggle('kg-at-line', !rt.over && !F.fleeing && (F.step === 2 || F.step === 4) && rt.distTo(LINES[F.line]) < LINES[F.line].r);
    root.classList.toggle('kg-holding', !rt.over && !F.fleeing &&
      (F.dpOn || F.step <= 1 && F.firstLineReached) && rt.distTo(LINES[F.line]) < LINES[F.line].r + 8);
    if (!rt.player.u.alive || rt.retryOpen) {
      rt.hud.subQ.length = 0; rt.hud.subT = 0; rt.hud.subDrop = false;
    }
    update(dt, battle);
    root.classList.toggle('kg-treating', !!rt.hud.retreatGuide?.active && !!rt.hud.retreatGuide.treatment);
    if (rt.t >= (F.orderCheckAt || 0)) {
      F.orderCheckAt = rt.t + 0.2;
      const action = rt.hud.actionLabel, now = root.querySelector('#obj-list li.cur .obj-now');
      root.classList.toggle('kg-repeat-order', !!(action && !action.hidden && now &&
        action.textContent.trim() === now.textContent.trim()));
      root.classList.toggle('kg-repeat-route-order', !!(action && !action.hidden && now &&
        kgRepeatedRouteOrder(rt, action.textContent.trim(), now.textContent.trim())));
    }
    // やり直しの札を開いた時だけ整える。釦と元のやり直し処理は使い続ける。
    if (!rt.retryOpen) { retryDialog = null; return; }
    if (retryDialog?.isConnected) return;
    const d = document.querySelector('.battle-retry');
    if (!d) return;
    retryDialog = d; d.classList.add('kg-retry');
    d.querySelector('.retry-reading').setAttribute('aria-label', '結果とやり直しの説明');
    d.querySelector('.retry-reading > p:last-child').textContent = '戦功と傷も戻る（城下は残る）。十五秒で結果へ。';
  };
  F.restoreNotices = () => {
    rt.signalCue = signalCue;
    rt.hud.say = say; rt.hud.bark = hudBark; rt.hud.banner = banner; rt.hud.update = update;
    rt.hud.notices.push = pushNotice;
    hooks.onGunAtPlayer = gunAtPlayer; hooks.onFoeVolleyCall = volleyCall;
    root.classList.remove('kg-retreat', 'kg-withdrawing', 'kg-at-exit', 'kg-at-line', 'kg-holding', 'kg-repeat-order', 'kg-repeat-route-order', 'kg-treating'); layout.remove();
  };
  // 共通の台詞も、この戦では実際の討死に結び付ける。遅れて届く声にも猶予を残す。
  rt.onKill = (u, by) => {
    if (u.team === rt.player.u.team && !u.alive && !u.civ && !u.isStruct && rt.distTo(u.pos) < 24) F.allyDownAt = rt.t;
    return kill(u, by);
  };
  const allowed = (text) => {
    if (!rt.player.u.alive || rt.retryOpen) return false;
    // 刃の警告は一度だけ。危険の知らせも連続して台詞に積まない。
    if (/刃が光った/.test(text)) {
      if (F.bladeNotice) return false;
      F.bladeNotice = true;
    }
    if (/危ない|矢玉は構え|後ろから来た/.test(text)) {
      if (rt.t < (F.hurtNoticeAt ?? -99) + 12) return false;
      F.hurtNoticeAt = rt.t;
    }
    if (/無念じゃ|仲間が討たれたか/.test(text) && !(rt.t - (F.allyDownAt ?? -99) <= 8)) return false;
    if (/囲まれ|四方から敵|後ろにも敵|取り籠め/.test(text)) {
      if (rt.t < (F.encircleAt ?? -99) + 30) return false;
      F.encircleAt = rt.t;
    }
    return true;
  };
  // 台詞から直接届く組頭の催促にも、今の下知を使う。
  const currentOrder = (text) => {
    const withdrawing = rt.G.lord || F.fleeing || F.step === 2 || F.step === 4;
    // 攻め戦の助言で備を離れさせない。敵の列の危険と、今の下知を一緒に伝える。
    if (/^槍衾だ/.test(text)) return withdrawing
      ? '敵の槍列を避け、組と退き道へ急げ'
      : '敵の槍列へ踏み込むな。味方の列で迎え撃て';
    if (/^鉄砲の列だ/.test(text)) return withdrawing
      ? '敵の鉄砲だ。物陰を通って組と退け'
      : '敵の鉄砲だ。物陰で撃ち終わりを待て';
    if (/敵が背を見せた！.*追え|敵が下がった！.*押せ|敵が崩れた！.*押せ|敵の列が乱れて.*突け|撃ち終えたぞ！.*寄せよ|敵の鉄砲は弾込め.*詰めよ|敵が息を継いで.*寄せよ|敵が退いて列を組み直す.*休ませるな/.test(text)) {
      return withdrawing ? '追手が緩んだ。組と退き道へ急げ' : '深追いするな。旗の下で備えよ';
    }
    if (!/北の味方の旗へ寄れ|今の任務を急げ/.test(text)) return text;
    if (F.fleeing || rt.G.lord) return '残った組と若狭への道へ退け。着いたら旗の下で待て';
    if (F.step === 2 || F.step === 4) return `${LINES[F.line].mark}の旗へ退け。着いたら味方を待て`;
    return 'この備の旗を守れ。退けの下知を待て';
  };
  rt.hud.say = (who, text, dur, urgent, detail) => {
    text = currentOrder(text);
    if ((rt.G.lord || F.fleeing || F.step === 2 || F.step === 4) && /ここを動くな|一歩も通すな/.test(text)) return false;
    if (!allowed(text)) return false;
    if (/危ない|矢玉は構え|後ろから来た/.test(text)) text = '味方の列か物陰へ退け';
    if (/刃が光った/.test(text)) text = '刃が光った。敵を向いて構えよ';
    const order = detail?.task || urgent || /木下|明智|池田|伝令|使番/.test(who || '') || /任務|守れ|待て|退け|戻れ|構え|向かえ|進め|放て/.test(text);
    if (!order && (rt.hud.subT > 0 && rt.hud.shownLine?.important || rt.hud.subQ.some(q => q.important))) return false;
    // 新しい下知を今出す。古い札を読み続けず、記録は元の仕組みに残す。
    const ok = say(who, text, dur, urgent, detail);
    if (ok && rt.hud.subQ.length) {
      const line = urgent || /伝令|使番/.test(who || '') ? rt.hud.subQ[0] : rt.hud.subQ[rt.hud.subQ.length - 1];
      rt.hud.subQ.length = 1; rt.hud.subQ[0] = line; line.dur = 2.8;
      rt.hud.subT = 0; rt.hud.subDrop = false; window.speechSynthesis?.cancel();
    }
    return ok;
  };
  rt.hud.bark = (text, warn) => {
    const withdrawing = rt.G.lord || F.fleeing || F.step === 2 || F.step === 4;
    text = currentOrder(text);
    if (withdrawing && /ここを動くな|一歩も通すな/.test(text)) return false;
    if (F.melee) return rt.hud.say('兵', text, 2.8);
    if (!allowed(text)) return false;
    return hudBark(text, warn);
  };
  rt.hud.banner = (title, sub) => {
    if (title === '重傷' || title === '討死') return banner(title, sub);
    if (title === '任務失敗') return rt.hud.say('', '任務失敗。味方と退き道へ急げ', 2.8);
    return F.melee && !F.fleeing && !F.ending
      ? rt.hud.say('組頭', sub || title, 2.8) : banner(title, sub);
  };
  rt.soldierCall = (key, pos, who = '兵') => {
    if (who.startsWith('味方')) {
      const withdrawing = rt.G.lord || F.fleeing || F.step === 2 || F.step === 4;
      // 退く下知の間は救援へ引き返させず、声も組と下がる合図へそろえる。
      // 敵の「押せ」と、守備中の助けを求める声は残す。
      if (key === 'advance' || key === 'push' || withdrawing && key === 'help') key = withdrawing ? 'retreat' : 'spear';
    }
    return call(key, pos, who);
  };
  rt.bark = (text, warn) => {
    // 使番の報せは隊名付きで届く。道を退いている隊を守備中と呼ばない。
    if (text.endsWith('に命が届いた。その隊は持ち場を守っている') && F.tono) {
      for (const g of F.tono) if (g.retreatOnly && g.order === 'path' && text.startsWith(`${g.name}に`)) {
        text = text.replace('その隊は持ち場を守っている', 'その隊は退き道を進んでいる');
        break;
      }
    }
    if (text === '味方の隊は持ち場を守っている' || text === '味方の隊は前へ進んでいる') {
      text = rt.G.lord || rt.flags.fleeing || rt.flags.step === 2 || rt.flags.step === 4
        ? '味方は次の旗へ退いている。組と続け'
        : '味方は主力が退くまで追手を止めている';
    }
    return bark(text, warn);
  };
}
function retreatFailure(rt, reason) {
  if (rt.flags.failureShown) return;
  rt.flags.failureShown = true;
  rt.tracker.main = false;
  // 自分の任務の判定は、遠い出来事の伝令を待たずに知らせる。
  rt._bannerT = rt.t;
  rt.hud.banner('任務失敗', `${reason}。残る味方を連れ、退き道へ急げ`);
}

// 手傷を負った兵も隊と同じ道を退く。傷を治したり、退き口へ飛ばしたりしない。
function woundedRetreatTick(rt) {
  const F = rt.flags;
  if (F.ending || F.woundedRetreatAt > rt.t) return;
  F.woundedRetreatAt = rt.t + 0.5;
  for (const g of F.tono) {
    if (g.order !== 'path' && !F.fleeing) continue;
    if (g.order === 'path') {
      // 出発後に死傷が増えても、生きた列を前へ詰める。兵自身は歩いて移る。
      // 後送中の兵を持ち場への到着人数に含めると、横備えへ戻れず道で止まる。
      let slot = 0, changed = false;
      for (const u of g.units) if (kgActive(u)) {
        if (u.slot !== slot) changed = true;
        u.slot = slot++;
      }
      g.arriveCount = Math.ceil(slot * 0.6);
      for (const u of g.units) if (!kgActive(u)) u.slot = slot++;
      if (changed) {
        g._tailCheckAt = 0; g._arriveCheckAt = 0; g._fitAt = 0;
        g._slotFit = null;
      }
    }
    for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && (u.woundOut || u.rearWound)) {
      // 隊の現在地へ直進させると、橋や谷の曲がりを外れて取り残される。
      // 無名兵の後送先も古い備に残さない。手傷の休み時間は延ばさない。
      // 負傷した兵自身の位置から道をたどり、隊の退く先へ歩かせる。
      const wound = u.woundOut || u.rearWound;
      retreatWay(rt, g.dest || g.anchor, u.pos, wound.to);
      if (u.woundOut) wound.t = rt.army.time + 2;
    }
  }
}
// 新手を出す時だけ数える。味方の追いつく分を空け、遠景は軽い兵のまま。
function cappedList(rt, list) {
  let room = 225;
  for (const u of rt.army.units) if (u.alive && !u.isStruct && u.type !== 'dummy') room--;
  return list.map((q) => { const n = Math.max(0, Math.min(q.n, room)); room -= n; return { ...q, n }; });
}
// 遠景の同じ位置で実兵へ引き継ぐ。見えている列も待たせず、小隊ごとに出す。
function enemyGroup(rt, o, list) {
  const g = spawnEnemy(rt, { fixed: true, noGuard: true, formation: 'yari', ...o }, []);
  g.kgPending = true;
  rt.flags.pursuers.push({ g, list, at: o.anchor, source: o.anchor.x > 40 ? 2 : o.anchor.x < -20 ? 1 : 0 });
  return g;
}
function pursuersTick(rt) {
  const F = rt.flags;
  if (F.ending) {
    for (const q of F.pursuers) q.g.kgPending = false;
    F.pursuers.length = 0;
    return;
  }
  if (rt.t < F.pursuersAt || rt.t < (F.nextPursuerAt || 0)) return;
  F.pursuersAt = rt.t + 0.5;
  let active = 0;
  for (const u of rt.army.units) if (u.team === 1 && kgActive(u) && !u.isStruct) active++;
  if (active >= 36) return;
  for (let i = 0; i < F.pursuers.length; i++) {
    const q = F.pursuers[i], host = F.host[q.source];
    // 広く散った十八人を一度に縦隊へすると、後列待ちで寄せが止まる。
    // 近い八人ずつ同じ遠景から引き継ぎ、残りは既存の待ち列へ残す。
    const list = cappedList(rt, q.list), n = Math.min(8, list.reduce((a, e) => a + e.n, 0));
    if (!n || active + n > 48) continue;
    // 同じ列の先頭から替える。見通しを待って後続が一斉に出るのを防ぐ。
    // 平らな山腹や登城道も歩けるが、麓の追手とは別の高さになる。
    // 北・西は退き道、東は疋田の道に沿う列だけを実兵へ替える。
    const pts = host.m.take(host.x, Math.max(host.z, q.at.z), n, 24, null, (x, z) =>
      Math.hypot(x - rt.player.u.pos.x, z - rt.player.u.pos.z) > 22 && rt.world.walkable(x, z) &&
      (distToPolyline(x, z, RETREAT_ROAD) <= 8 || q.source === 2 && distToPolyline(x, z, HIKIDA_ROAD) <= 8) &&
      rt.world.slopeTan(x, z) <= 0.55 && !rt.world.inWaterAt(x, z));
    if (!pts.length) {
      if (!host.m.left(host.x, host.z, 100)) { q.g.kgPending = false; F.pursuers.splice(i, 1); }
      continue;
    }
    let used = 0, x = 0, z = 0;
    const specs = [];
    for (const e of list) for (let j = 0; j < e.n && used < pts.length; j++) {
      const at = pts[used++]; x += at.x; z += at.z;
      specs.push({ type: e.type, n: 1, o: { ...e.o, x: at.x, z: at.z, heading: at.yaw } });
    }
    const g = q.g;
    g.anchor.x = x / used; g.anchor.z = z / used;
    rt.army.spawn(g, specs);
    g.leader = g.units.find(u => u.type === 'busho') || g.units.find(u => u.type === 'samurai') || null;
    // 寄せ口から元の持ち場へ、道の折れ点を通って歩く。位置を飛ばさない。
    g.path = [];
    const fromEast = q.source === 2 && g.anchor.x > 28 && g.anchor.z < -14;
    if (fromEast) {
      for (const at of HIKIDA_ROAD) if (at[0] < g.anchor.x) g.path.push(at);
    } else {
      // 次の折れ点まで行き過ぎてから戻らず、今の高さで道へ寄る。
      for (let j = 0; j < ROAD.length - 1; j++) {
        const a = ROAD[j], b = ROAD[j + 1];
        if (g.anchor.z >= a[1] && g.anchor.z <= b[1]) {
          const t = (g.anchor.z - a[1]) / (b[1] - a[1]);
          g.path.push([a[0] + (b[0] - a[0]) * t, g.anchor.z]); break;
        }
      }
    }
    const startZ = fromEast ? -50 : g.anchor.z;
    // 殿が次へ退いた後も、昔の出現点へ引き返さず現在の備を追う。
    const goalZ = F.fleeing ? KUTSUKI.z : Math.max(q.at.z, LINES[F.line].z - 24);
    let goalX = q.at.x;
    for (let j = 0; j < ROAD.length - 1; j++) {
      const a = ROAD[j], b = ROAD[j + 1];
      if (goalZ >= a[1] && goalZ <= b[1]) goalX = a[0] + (b[0] - a[0]) * (goalZ - a[1]) / (b[1] - a[1]);
    }
    for (const at of ROAD) if (at[1] > startZ && at[1] < goalZ) g.path.push(at);
    g.dest = { x: goalX, z: goalZ };
    g.path.push([goalX, goalZ]); g.pathIdx = 0; g.order = 'path';
    // 行軍中は後列も折れた道に沿う。着いた時だけ槍列・鉄砲列へ開く。
    const formation = g.formation;
    g.fixed = false; g.formation = 'column'; g.roadColumn = true; g._fitAt = 0;
    g.onArrive = gg => {
      gg.order = 'attack'; gg.path = null; gg.onArrive = null;
      gg.formation = formation; gg.roadColumn = false; gg._routeCols = 0; gg._slotFit = null;
    };
    if (F.fleeing) { g.speed = 3.3; }
    g.kgPending = false;
    // 上限で一部しか替えられなかった時は残りも同じ列で待つ。
    let left = used;
    for (const e of q.list) { const took = Math.min(e.n, left); e.n -= took; left -= took; }
    if (q.list.some(e => e.n > 0)) {
      const rest = spawnEnemy(rt, { fixed: true, noGuard: true, noRout: g.noRout, faction: g.faction, name: g.name, anchor: { ...q.at },
        formation, facing: g.facing, speed: g.speed, width: g.width, aggro: g.aggro,
        seekRange: g.seekRange, morale: g.morale, dmgMult: g.dmgMult, fleeDir: g.fleeDir, order: 'attack' }, []);
      rest.kgPending = true; q.g = rest;
      for (const key of ['w1', 'w2', 'w3']) if (F[key]?.includes(g)) F[key].push(rest);
      if (F.dp?.cur?.groups?.includes(g)) F.dp.cur.groups.push(rest);
    } else F.pursuers.splice(i, 1);
    F.nextPursuerAt = rt.t + 12;
    break;
  }
}
// 金ヶ崎の置き幟と隊旗。横木と竿側を固定し、布の寸法を保つ。
// 同じ紋・寸法の材質を使い回し、ひだと風は描画時に計算する。
function retreatCloth(rt, mesh) {
  if (!mesh?.material?.map || mesh.userData.kgCloth) return;
  const F = rt.flags, base = mesh.material;
  const w = mesh.geometry.parameters?.width, h = mesh.geometry.parameters?.height;
  if (!w || !h) return;
  let cache = F.clothMats.get(base);
  if (!cache) { cache = new Map(); F.clothMats.set(base, cache); }
  const key = `${w}|${h}`;
  let mat = cache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ map: base.map, color: base.color,
      side: THREE.DoubleSide, roughness: 1, metalness: 0, alphaTest: 0.5,
      transparent: false, opacity: 1, depthWrite: true, envMapIntensity: 0.2 });
    mat.onBeforeCompile = sh => {
      sh.uniforms.kgTime = F.clothTime; sh.uniforms.kgWind = F.clothWind;
      sh.uniforms.kgMotion = F.clothMotion;
      sh.uniforms.kgSize = { value: new THREE.Vector2(w, h) };
      const fold = `
        uniform float kgTime, kgWind, kgMotion;
        uniform vec2 kgSize;
        float kgFold(vec2 q, vec2 root) {
          float fixedEdge = q.x * smoothstep(0.0, 0.16, 1.0 - q.y);
          float phase = root.x * 0.53 + root.y * 0.37;
          float pleat = sin(q.x * 13.0 + q.y * 2.0) * 0.075;
          float wave = sin(q.x * 10.0 + q.y * 5.0 + phase - kgTime * 2.6) * 0.12;
          return (pleat + wave * kgWind * kgMotion) * fixedEdge;
        }
      `;
      sh.vertexShader = fold + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          vec2 kgRootN = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
          float kgZ = kgFold(uv, kgRootN);
          float kgDx = (kgFold(uv + vec2(0.01, 0.0), kgRootN) - kgZ) / (0.01 * kgSize.x);
          float kgDy = (kgFold(uv + vec2(0.0, 0.01), kgRootN) - kgZ) / (0.01 * kgSize.y);
          objectNormal = normalize(vec3(-kgDx, -kgDy, 1.0));`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec2 kgRootV = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
          transformed.z += kgFold(uv, kgRootV);`);
    };
    mat.customProgramCacheKey = () => 'kg_cloth';
    cache.set(key, mat); F.flagMatList.push(mat);
  }
  mesh.material = mat; mesh.receiveShadow = true; mesh.userData.kgCloth = true;
}
function retreatNobori(rt, world, x, z, kind, h) {
  // 道案内は名札に任せ、橋の十メートルの幟を通常の大幟へ戻す。
  const root = nobori(world, x, z, kind, Math.min(h, 5.6));
  retreatCloth(rt, root.userData.flag);
  return root;
}
// 捨てた旗は竿も布も地面へ寝かせる。立ち旗の形・材質は使い回す。
function retreatDroppedFlag(rt, x, z, r) {
  const W = rt.world, root = retreatNobori(rt, W, x, z, 'oda', 5);
  root.rotation.set(Math.PI / 2, r, Math.PI / 2, 'YXZ');
  const cx = x - Math.cos(r) * 2.5, cz = z + Math.sin(r) * 2.5;
  const normal = new THREE.Vector3(
    W.heightAt(cx - 2, cz) - W.heightAt(cx + 2, cz), 4,
    W.heightAt(cx, cz - 2) - W.heightAt(cx, cz + 2)).normalize();
  root.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal));
  root.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  let gap = Infinity;
  // 竿と布の全頂点を調べ、坂でも地面へ食い込まない最低の高さに置く。
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      gap = Math.min(gap, point.y - W.heightAt(point.x, point.z));
    }
  });
  root.position.y += 0.025 - gap;
  // 立ち旗用の風で、倒れた布を地面から持ち上げない。
  // 三枚の布だけ開幕に地面へ沿わせ、立つ幟の形と材質は変えない。
  const cloth = root.userData.flag, F = rt.flags;
  if (!F.droppedFlagMat) {
    const base = cloth.material;
    F.droppedFlagMat = new THREE.MeshStandardMaterial({ map:base.map, color:base.color,
      side:THREE.DoubleSide, roughness:1, alphaTest:0.5 });
    F.sceneryResources.push(F.droppedFlagMat);
  }
  cloth.material = F.droppedFlagMat; cloth.userData.kgTint = true;
  cloth.geometry = cloth.geometry.clone(); F.sceneryResources.push(cloth.geometry);
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(cloth.matrixWorld).invert();
  const vertices = cloth.geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    point.fromBufferAttribute(vertices, i).applyMatrix4(cloth.matrixWorld);
    point.y = W.heightAt(point.x, point.z) + 0.025;
    point.applyMatrix4(inverse); vertices.setXYZ(i, point.x, point.y, point.z);
  }
  vertices.needsUpdate = true; cloth.geometry.computeVertexNormals();
  cloth.geometry.computeBoundingSphere();
  rt.scene.add(root);
}
// 指物の元の材質は他の戦とも共有する。この戦用の二色だけを作り、使い回す。
function retreatFlag(rt, mesh, enemy) {
  if (!mesh?.material || mesh.userData.kgTint) return;
  // 絵の無い指物（描かない回しの軽い材質・束の写し）は染め分けない。
  if (!mesh.material.map?.image) return;
  const cache = rt.flags.flagMats, base = mesh.material;
  let pair = cache.get(base);
  if (!pair) { pair = []; cache.set(base, pair); }
  const i = enemy ? 1 : 0;
  if (!pair[i]) {
    const m = base.clone();
    // 色だけを替える。距離で兵を描き分ける情報は本体と同じ生きた参照を保つ。
    // clone の控えを使うと、近づいて本体が消えても旗の写しだけが残る。
    if (base.userData.armyU) m.userData.armyU = base.userData.armyU;
    m.onBeforeRender = base.onBeforeRender;
    m.onBeforeCompile = (sh, renderer) => {
      base.onBeforeCompile.call(base, sh, renderer);
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 kgFlagRoot = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #else
          vec4 kgFlagRoot = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        transformed.x *= mix(0.55, 1.0, smoothstep(2.0, 8.0, length(kgFlagRoot.xz - cameraPosition.xz)));`);
    };
    m.customProgramCacheKey = () => base.customProgramCacheKey() + '_kg_narrow';
    // 白や金の元の地をそのまま暗くせず、紋の黒と汚れを保って藍と茶に染め分ける。
    // 絵の無い旗（携帯の軽い旗など）は色だけで染め分ける。ここで止まると殿の見回り全体が毎回途切れる（10/27 実機）
    const img = base.map && base.map.image;
    if (!img || !(img.width > 0) || !(img instanceof HTMLCanvasElement || img instanceof HTMLImageElement)) {
      if (m.color) m.color.multiply(new THREE.Color(enemy ? 0xe4aa70 : 0x8fbce8)); pair[i] = m; rt.flags.flagMatList.push(m);
      mesh.material = m; mesh.userData.kgTint = true;
      return;
    }
    let tex = rt.flags.flagTex.get(base.map);
    if (!tex) {
      const source = base.map.image, canvas = document.createElement('canvas');
      canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), a = pixels.data;
      const color = enemy ? [228, 170, 112] : [143, 188, 232];
      for (let n = 0; n < a.length; n += 4) {
        const light = Math.max(a[n], a[n + 1], a[n + 2]) / 255;
        a[n] = color[0] * light; a[n + 1] = color[1] * light; a[n + 2] = color[2] * light;
      }
      ctx.putImageData(pixels, 0, 0);
      tex = base.map.clone(); tex.image = canvas; tex.userData = { clone: true }; tex.needsUpdate = true;
      rt.flags.flagTex.set(base.map, tex);
    }
    m.map = tex; m.color.setHex(0xffffff); pair[i] = m;
    rt.flags.flagMatList.push(m);
  }
  mesh.material = pair[i]; mesh.userData.kgTint = true;
}
// 退く列の後尾待ちを、遠くへ離れて取り残された一人で止めない（追い討ちで散った兵・遠くで固まった兵）。
function kgStragglers(rt) {
  const F = rt.flags;
  if (F.stragglerAt > rt.t) return;
  F.stragglerAt = rt.t + 0.25;
  for (const g of F.tono || []) {
    if (!g.retreatOnly || g.order !== 'path') continue;
    // 退く列は後尾を待って先頭を止めない。遅れた兵は自分の持ち場（列の後ろ）を追って歩く。
    g._tailCheckAt = Infinity; g._tailLag = 0;
  }
}
function retreatFieldTick(rt) {
  const F = rt.flags;
  if (rt.t < (F.fieldAt || 0) || F.ending) return;
  F.fieldAt = rt.t + 0.5;
  for (const g of rt.army.groups) for (const s of g.stds || []) {
    const d = s.userData.std;
    if (d && !d.down && d.kind !== 'cavalry') retreatCloth(rt, d.cloth);
  }
  const P = rt.player.u;
  F.melee = false;
  let near = null, best = 45;
  for (const u of rt.army.units) {
    // 視点へ入る味方は共通の全身の遮蔽へ任せる。部品ごとの網目抜きを重ねない。
    retreatFlag(rt, u.flag, u.team === 1);
    if (u.team !== 1 || !kgActive(u) || u.isStruct || u.type === 'dummy') continue;
    const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
    if (d < 12) F.melee = true;
    if (d < best) { best = d; near = u; }
  }
  if (!F.fleeing) return;
  // 生き残った追手を元の備へ戻さず、道の折れ点を通って追わせる。
  for (const g of rt.army.groups) {
    if (g.team !== 1 || g.routed || !g.count || g.kgChasing) continue;
    g.kgChasing = true;
    const c = g.center(); g.path = [];
    for (const q of RETREAT_ROAD) if (q[1] > c.z && q[1] < KUTSUKI.z) g.path.push(q);
    g.path.push([KUTSUKI.x, KUTSUKI.z]); g.pathIdx = 0;
    g.dest = { x: KUTSUKI.x, z: KUTSUKI.z }; g.order = 'path';
    // 追手は殿の組全体を追う。全隊で本人だけを狙い、味方の槍列を素通りしない。
    g.fixed = false; g.formation = 'column'; g.speed = 3.3; g.focus = null;
    g.onArrive = gg => { gg.order = 'attack'; gg.path = null; gg.onArrive = null; };
  }
  if (near && rt.t >= (F.stepsAt || 0)) {
    F.stepsAt = rt.t + 0.7;
    rt.army.play('stepPath', near.pos, 0.8);
  }
}
// 各寄せで決めた傷の倍率を保つ。後から共通値で上書きしない。
// 生き延びた働きを副手柄として記録する。点数は共通の評価に任せる。
function survival(rt, label) {
  if (rt.flags.survivalAwarded) return;
  rt.flags.survivalAwarded = true;
  const sq = rt.squad || [];
  rt.award((t) => t.side.push(`${label}（組 ${sq.filter((x) => x.alive).length}/${sq.length}）`), `${label}・生還の働き`);
}

// 退く下知ごとに道筋と到着処理を入れ替える。前の備の処理で引き戻さない。
// 退き太鼓の間、目の前の追手は鉄砲を恐れて十四秒ほど足を止める（明智の鉄砲が退きを援ける）。
// 打ち合ったまま殿の組が離れられず、元の備で討ち減らされて次の備がそろわない事を防ぐ。
function kgPausePursuit(rt, old) {
  const F = rt.flags;
  for (const g of rt.army.groups) {
    if (g.team !== 1 || !g.count || g.kgPause || g.order === 'flee') continue;
    const c = g.center();
    if (Math.hypot(c.x - old.x, c.z - old.z) > 70 && !F.tono.some((t) => t.count && Math.hypot(t.center().x - c.x, t.center().z - c.z) < 35)) continue;
    g.kgPause = { order: g.order, aggro: g.aggro, seekRange: g.seekRange };
    g.order = 'hold'; g.anchor = { x: c.x, z: c.z - 4 }; g.aggro = 0; g.seekRange = 0;
    for (const u of g.units) if (u.alive && u.target && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) > 1.6) { u.target = null; u.atk = null; }
    rt.after(14, () => {
      const p = g.kgPause; g.kgPause = null;
      if (!p || !g.count || g.order !== 'hold') return;
      g.order = p.order; g.aggro = p.aggro; g.seekRange = p.seekRange;
    });
  }
}
function retreatGroup(rt, g, x, z, facing, formation) {
  const c = g.center(), path = [];
  // 死傷で空いた持ち場を詰める。人数の記録は変えず、生きた列を短くする。
  // 傷で離れた兵を出発点に混ぜ、歩ける隊を後戻りさせない。
  let count = 0, cx = 0, cz = 0, slot = 0;
  for (const u of g.units) if (kgActive(u)) {
    u.slot = slot++; cx += u.pos.x; cz += u.pos.z; count++;
  }
  for (const u of g.units) if (!kgActive(u)) u.slot = slot++;
  if (count) { c.x = cx / count; c.z = cz / count; }
  // 二の備の先頭だけを止めると、二列の後ろはまだ橋の上に残る。
  // 横備えへ戻す前に列の長さだけ南へ進む。守る位置は元の dest に保つ。
  const tailLength = Math.max(0, Math.ceil(count / (g.colW || 2)) - 1) * g.spacing * 1.3 * (g.rankSpacing || 1);
  const marchZ = c.z < 22 && z >= 22 ? Math.max(z, 26 + tailLength) : z;
  const join = (atZ) => {
    for (let i = 0; i < RETREAT_ROAD.length - 1; i++) {
      const a = RETREAT_ROAD[i], b = RETREAT_ROAD[i + 1];
      if (atZ < a[1] || atZ > b[1]) continue;
      const f = (atZ - a[1]) / (b[1] - a[1]);
      return [a[0] + (b[0] - a[0]) * f, atZ];
    }
    return atZ < RETREAT_ROAD[0][1] ? RETREAT_ROAD[0] : RETREAT_ROAD[RETREAT_ROAD.length - 1];
  };
  // 最初から道の後ろ側も渡す。横から入る短い折れを後列まで延ばすと、
  // 二十人の縦隊の持ち場が山腹へ出て、先頭も後列を待ったまま止まる。
  const tailZ = c.z - Math.ceil(count / 2) * g.spacing * 1.3 - 4;
  const enterZ = Math.min(marchZ, c.z + 8);
  path.push(join(tailZ));
  for (const q of RETREAT_ROAD) if (q[1] > tailZ && q[1] < enterZ) path.push(q);
  path.push(join(enterZ));
  const first = path.length - 1;
  for (const q of RETREAT_ROAD) if (q[1] > enterZ && q[1] < marchZ) path.push(q);
  // 縦隊は道の上で到着を待つ。脇の射撃位置まで折れ曲がると、
  // 後列の持ち場が川岸や切岸へ出て、横備えに戻す処理へ届かない。
  // 射撃位置への移動は到着後、足場を選んだ横備えで行う。
  if (marchZ > enterZ) path.push(join(marchZ));
  g.anchor.x = c.x; g.anchor.z = c.z;
  g.order = 'path'; g.path = path; g.pathIdx = first;
  g.dest = { x, z }; g.speed = 3.4; g.formation = 'column';
  // 谷の折れでも後列を道に沿わせる。一直線の持ち場で斜面へ取り残さない。
  g.roadColumn = true;
  // 固定は出現場所の指定。退く間は道幅を合わせ、遠い追手へ戻らない。
  g.fixed = false; g.retreatOnly = true; g._fitAt = 0;
  g.focus = null; g.commanderPush = null; g.commanderPushUntil = 0;
  g.onArrive = (gg) => {
    gg.order = 'hold'; gg.anchor = gg.dest;
    gg.facing = facing; gg.formation = formation; gg.path = null;
    gg.retreatOnly = false; gg._routeCols = 0; gg._slotFit = null; gg._tailCheckAt = 0;
    gg.roadColumn = false;
    // 途中の備でも旗のそばを守る。先着した組が共通の判断で攻撃へ戻ると、
    // 後続が着く前に橋を逆戻りし、合流できないまま敗北してしまう。
    // 鉄砲の射程と目前の敵への応戦は、兵の共通の判断に任せる。
    // 使番の自動前進も止め、合流後の鉄砲組を退き口から戻さない。
    if (rt.flags.tono.includes(gg)) {
      gg.aggro = Math.min(gg.aggro, 6);
      gg.seekRange = Math.min(gg.seekRange, 6);
      gg.noAI = true;
    }
    // 退き口でも横へ広がる前に足場を選び直す。兵自身は歩いて持ち場へ着く。
    if (formation !== 'column') settleRearguard(rt, gg, false);
  };
}

// 届くまで知らせを出さない。使番が倒れても角笛による撤退は止めない。
function messengerOrder(rt, target, who, text) {
  const F = rt.flags, g = F.runner;
  if (!g?.count || !target?.alive) return;
  F.runnerNews = { target, who, text, at: rt.t, playerOrder: target === rt.player.u, step: F.step, fleeing: F.fleeing };
  const c = g.center(), goal = target.pos, forward = goal.z >= c.z;
  g.path = [];
  for (let i = 0; i < RETREAT_ROAD.length; i++) {
    const q = RETREAT_ROAD[forward ? i : RETREAT_ROAD.length - 1 - i];
    if (forward ? q[1] > c.z && q[1] < goal.z : q[1] < c.z && q[1] > goal.z) g.path.push(q);
  }
  g.path.push([goal.x, goal.z]); g.pathIdx = 0; g.order = 'path'; g.dest = { x: goal.x, z: goal.z };
  g.onArrive = gg => { gg.order = 'hold'; gg.anchor = gg.dest; gg.path = null; gg.onArrive = null; };
}
function messengerTick(rt) {
  const F = rt.flags, news = F.runnerNews, g = F.runner;
  if (!news) return;
  // 次の下知へ進んだら、届くのが遅れた使番に古い行き先を告げさせない。
  if (news.playerOrder && (news.step !== F.step || news.fleeing !== F.fleeing)) { F.runnerNews = null; return; }
  if (!g.count || !news.target.alive || rt.t - news.at > 35) { F.runnerNews = null; return; }
  const c = g.center(), p = news.target.pos;
  if (Math.hypot(c.x - p.x, c.z - p.z) < 4) {
    rt.say(news.who, news.text, 3); F.runnerNews = null; g.order = 'hold';
    g.anchor.x = c.x; g.anchor.z = c.z; g.path = null;
  } else if (!g.path || g.pathIdx >= g.path.length - 1) {
    g.order = 'move'; g.dest.x = p.x; g.dest.z = p.z;
  }
}

// 遠くの軍勢を動かす（world の揺らしと取り合わないよう、揺れの基点 x0 を動かす）
function moveDA(rt, fa, x, z) {
  const moving = Math.hypot(x - fa.x, z - fa.z) > 0.0001;
  fa.x = x; fa.z = z;
  const e = fa.m.army;
  if (e) {
    e.x0 = x - fa.x0;
    // 道を進める台本でも足を動かす。立ち姿のまま滑る大軍にしない。
    e.U.uMarch.value = moving ? 1 : 0;
  }
  fa.m.position.z = z - fa.z0;
  // 一人ずつ描画時に足場を読むため、隊の中心の高低差は重ねない。
  fa.m.position.y = 0;
}

function baseRelief(x, z) {
  let h = 0.6 * Math.sin(x * 0.03 + 0.5) * Math.cos(z * 0.027) + 0.35 * Math.sin(z * 0.06 + x * 0.025);
  // 金ヶ崎の岬・別山の天筒山・西の山並み・狭路の両側の山。
  // 段と堀は城の周りだけに重ね、麓の退き道と兵の持ち場を保つ。
  const kx = Math.max(0, Math.min(1, (x - 30) / 16));
  const kz = Math.max(0, Math.min(1, (-z - 80) / 16));
  const k = kx * kx * (3 - 2 * kx) * kz * kz * (3 - 2 * kz);
  // 乱戦の三つの備・北と東の寄せ道では従来の裾を保つ。
  const oldHill = 18 * gauss(x,z,48,-98,260) + 22 * gauss(x,z,96,-128,900) + 26 * gauss(x,z,48,-98,1500) + yamaLift(x,z,OLD_LIFT);
  const newHill = 18 * gauss(x,z,TEZUTSU.x,TEZUTSU.z,260) + 22 * gauss(x,z,CASTLE.x,CASTLE.z,900) + 26 * gauss(x,z,TEZUTSU.x,TEZUTSU.z,1500) + yamaLift(x,z,LIFT);
  h += oldHill + (newHill - oldHill) * k;
  h += Math.max(0, -x - 90) * 0.28 + 18 * gauss(x, z, -96, -70, 2600);
  h += 30 * gauss(x, z, -82, 104, 1500) + 26 * gauss(x, z, 36, 122, 1400) + 14 * gauss(x, z, 90, 150, 2000);
  // 狭路：道の両脇に崖のような尾根が迫る細い谷
  h += 16 * gauss(x, z, -52, 96, 500) + 15 * gauss(x, z, 10, 112, 520) + 12 * gauss(x, z, -64, 132, 450) + 10 * gauss(x, z, -14, 146, 420);
  // 国土地理院の標高：戦場の外の遠い山並みにだけ実際の起伏を足す（ゲームの 1 を実の 5m に縮める）
  if (kgDem) h += demRelief(kgDem, x, z, { xy: 5, cx: 0, cz: 10, inner: 190, fade: 60, scale: 0.12 });
  // 実測の細かい尾根と谷の凹凸を山腹にだけ足す（麓の道・持ち場の平らは保つ）
  if (kgDem) { const up = Math.max(0, Math.min(1, (h - 4) / 10)); if (up > 0) h += up * demDetail(kgDem, x, z, { xy: 5, win: 60, scale: 0.35, cz: 50 }); }
  // 敦賀湾は城山の西側。東の天筒山・中池見を海で切らない。
  // 河口まで西の岸を延ばし、川南の避難道と三つの備は陸に残す。
  // 海岸線の細部は復元。湾の方位：https://www.rinya.maff.go.jp/kinki/policy/business/sitasimou/mori_zukuri/recreation/fukui/tedutuyama.html
  const shore = -132 - 36 * Math.max(0, Math.min(1, (z + 20) / 64));
  const coast = Math.max(0, Math.min(1, (shore - x) / 18));
  h += (-7 - h) * coast * coast * (3 - 2 * coast);
  return h;
}

// 天筒山の南西の斜面（一の備から見える側）に並ぶ畝状竪堀。数・幅・位置は推定。
// 頂から裾へ縦の溝を十数本、地面に沿う帯で描く。帯の中は日の当たる縁・暗い底・陰の縁の順で、
// 遠くからも影のある縦の筋に見せる。歩く高さは変えない。形は読み込み時に一つへまとめる。
function tezutsuTatebori(rt, W, F) {
  const pos = [], col = [], idx = [];
  const face = Math.atan2(LINES[0].z - TEZUTSU.z, LINES[0].x - TEZUTSU.x);
  const tez = KG_PATHS[2];
  // 横切りの五点：外の縁（透明）・日の縁・底・陰の縁・外の縁（透明）
  const prof = [[-1, 0.66, 0.6, 0.46, 0], [-0.5, 0.72, 0.64, 0.48, 0.85], [0, 0.07, 0.06, 0.04, 1], [0.5, 0.16, 0.14, 0.1, 0.9], [1, 0.3, 0.27, 0.2, 0]];
  const linear = (v) => Math.pow(v, 2.2);
  for (let k = -7; k <= 7; k++) {
    const ang = face + k * 0.14 + Math.sin(k * 3.7) * 0.025;
    const ux = Math.cos(ang), uz = Math.sin(ang), sx = -uz, sz = ux;
    const d0 = 22 + Math.abs(Math.sin(k * 2.3)) * 4, d1 = 60 + Math.sin(k * 1.9) * 6;
    // 登り道を溝で切らない。道の幅だけ溝を途切れさせ、上と下の残りは描く。
    const steps = Math.ceil((d1 - d0) / 2);
    let base = -1, prev = -1;
    for (let j = 0; j <= steps; j++) {
      const t = j / steps, d = d0 + (d1 - d0) * t;
      if (distToPolyline(TEZUTSU.x + ux * d, TEZUTSU.z + uz * d, tez) < 5) { base = -1; continue; }
      if (base < 0) { base = pos.length / 3; prev = j; }
      // 上と下の端は細く浅く消える。
      const w = 2 * Math.min(1, t * 5, (1 - t) * 4 + 0.2);
      for (const [o, r, g, bb, al] of prof) {
        const x = TEZUTSU.x + ux * d + sx * o * w, z = TEZUTSU.z + uz * d + sz * o * w;
        pos.push(x, W.heightAt(x, z) + 0.12, z);
        col.push(linear(r), linear(g), linear(bb), al * Math.min(1, t * 6, (1 - t) * 6));
      }
      if (j > prev) for (let q = 0; q < 4; q++) {
        const a0 = base + (j - 1 - prev) * 5 + q, b0 = base + (j - prev) * 5 + q;
        idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
      }
    }
  }
  if (!idx.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 1, metalness: 0,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 1; mesh.receiveShadow = true;
  rt.scene.add(mesh);
  F.sceneryResources.push(geo, mat);
}

function relief(x, z) {
  let h = baseRelief(x, z);
  // 敦賀市の城跡案内と縄張りの参照：金ヶ崎は86m、天筒山は約171m。
  // 山頂から裾へ広く下ろす。特に天筒山の高さを十二歩で下ろすと針の山になる。
  // 補正の西端は北の退き道・東の寄せ口へ届かず、三つの備の高さを保つ。
  for (const s of KG_SUMMIT_RISE) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d >= s.skirt) continue;
    const t = Math.max(0, (d - 14) / (s.skirt - 14));
    h += s.rise * (1 - t * t * (3 - 2 * t));
  }
  return h;
}

// 見た目と歩く高さを同じ関数で作る。堀・切岸・土塁は実際に地面を上下させる。
const KG_DIPS = KANEGASAKI_PLAN.hori.map(h => horiboriHeight(h.pts, { width:h.w, depth:h.deep }));
// 山頂の高さを長い曲輪へ広げた外縁は、三歩で落とすと柱状の土壁になる。
// 平場・木戸・堀の位置を保ち、外の土の斜面だけ十八歩で山腹へ戻す。
const KG_CASTLE_EDGE = 18;
const kgCastlePlan = () => KANEGASAKI_HIGH_PLAN;
let kgGround = null, kgRoads = null, kgRetreatRoads = null, kgGroundPlan = null;
function height(x, z) {
  const plan = kgCastlePlan();
  if (!kgGround || kgGroundPlan !== plan) {
    kgGroundPlan = plan;
    kgGround = heightOf(plan, (x,z) => {
      let h = relief(x,z);
      for (const dip of KG_DIPS) h += dip(x,z);
      return h;
    }, KG_CASTLE_EDGE);
    // 道の高さは両端を結ぶ緩い登り。九十九折りの途中の山頂・堀へ引きずられない。
    kgRoads = [];
    for (const pts of KG_PATHS) {
      let len=0;
      for(let i=1;i<pts.length-1;i++) len+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
      // 枝道の出だしは先に作った道の高さに合わせる。
      const start = kgRoads.length ? height(pts[0][0],pts[0][1]) : kgGround(...pts[0]);
      const end = kgGround(...pts[pts.length-1]);
      let walked=0;
      for(let i=1;i<pts.length;i++) {
        const a=pts[i-1], b=pts[i], l=Math.hypot(b[0]-a[0],b[1]-a[1]);
        kgRoads.push({ax:a[0],az:a[1],dx:b[0]-a[0],dz:b[1]-a[1],l2:l*l,y:start+(end-start)*walked/len,dy:i===pts.length-1 ? 0 : (end-start)*l/len});
        walked+=l;
      }
    }
    // 三の備から南の出口まで、既存の道の幅だけ起伏をならす。
    // 描く高さと歩く高さをそろえ、尾根や城山は変えない。
    kgRetreatRoads = [];
    for (let i = 4; i < ROAD.length - 1; i++) {
      const a = ROAD[i], b = ROAD[i + 1], y = kgGround(...a);
      const dx = b[0] - a[0], dz = b[1] - a[1];
      kgRetreatRoads.push({ ax:a[0], az:a[1], dx, dz, l2:dx * dx + dz * dz, y, dy:kgGround(...b) - y });
    }
  }
  const h=kgGround(x,z);
  if (z >= ROAD[4][1]) {
    let gap = Infinity, pathY = h;
    for (const r of kgRetreatRoads) {
      const f = Math.max(0, Math.min(1, ((x - r.ax) * r.dx + (z - r.az) * r.dz) / r.l2));
      const d = Math.hypot(x - r.ax - r.dx * f, z - r.az - r.dz * f);
      if (d < gap) { gap = d; pathY = r.y + r.dy * f; }
    }
    if (gap < 7) {
      const f = Math.max(0, Math.min(1, (7 - gap) / 3.5));
      const entry = Math.min(1, (z - ROAD[4][1]) / 6);
      return h + (pathY - h) * f * f * (3 - 2 * f) * entry * entry * (3 - 2 * entry);
    }
  }
  let bd=1e9, roadY=h;
  for(const r of kgRoads) {
    const t=Math.max(0,Math.min(1,((x-r.ax)*r.dx+(z-r.az)*r.dz)/r.l2));
    const d=Math.hypot(x-r.ax-r.dx*t,z-r.az-r.dz*t);
    if(d<bd){bd=d;roadY=r.y+r.dy*t;}
  }
  // 麓の山道だけ、土の肩を広く丸める。山頂の曲輪・堀の切岸は元の幅を保つ。
  // 西へ張り出す折り返しは z=-126 まで続く。緯度だけで麓の処理を切ると、
  // そこだけ幅一・四歩で元の山腹へ戻り、二十歩を超す土の柱が立つ。
  // 西側の登り道まで肩をつなぎ、東の曲輪と木戸は従来の切岸を保つ。
  const westT = Math.max(0, Math.min(1, (40 - x) / 16));
  const northT = Math.max(0, Math.min(1, (z + 150) / 24));
  const westFoot = westT * westT * (3 - 2 * westT) * northT * northT * (3 - 2 * northT);
  const foot = Math.max(westFoot, Math.max(0, Math.min(1, (z + 110) / 24)));
  // 麓の九十九折りだけ、高い土の肩を広くなじませる。
  // 一の備より北で元の幅へ戻し、三つの持ち場・退き道の足場は保つ。
  const skirtT = Math.max(0, Math.min(1, (-z - 38) / 24));
  const skirt = skirtT * skirtT * (3 - 2 * skirtT);
  // 高い山腹へ戻す幅を広げ、麓の道の横に垂直な土壁を作らない。
  const shoulderMax = 10.6 + 32 * skirt;
  if (bd >= 2.4 + 1.4 + shoulderMax * foot) return h;
  // 九十九折りの間で近い道が替わる所は、隣の折り返しまで広くなじませる。
  // 城寄りでも最寄りの道一本へ切り替えない。折れ目で高さが跳ね、土の柱になる。
  // 道の肩幅と曲輪は保ち、高さの混ぜ方だけを全区間で連続させる。
  {
    let sum = 0, weight = 0;
    const blendWidth = 1.5 + 20.5 * skirt;
    for (const r of kgRoads) {
      const f = Math.max(0, Math.min(1, ((x - r.ax) * r.dx + (z - r.az) * r.dz) / r.l2));
      const d = Math.hypot(x - r.ax - r.dx * f, z - r.az - r.dz * f);
      const t = Math.max(0, 1 - (d - bd) / blendWidth), w = t * t * (3 - 2 * t);
      sum += (r.y + r.dy * f) * w; weight += w;
    }
    roadY = sum / weight;
  }
  const shoulder = 1.4 + Math.max(2.8, Math.min(shoulderMax, Math.abs(h - roadY) * (0.8 + 1.6 * skirt))) * foot;
  const t=Math.max(0,Math.min(1,(2.4+shoulder-bd)/shoulder)), k=t*t*(3-2*t);
  return h+(roadY-h)*k;
}

// 占領後の退き口。金ヶ崎城を朝倉の籠城として作り直さない。殿の配分は復元。
const KANEGASAKI_JIN = [
  battleJin('殿の横備え', 0, LINES[0], Math.PI, [
    ['kgKino', '道の正面', '木下藤吉郎', 1000, LINES[0].x, LINES[0].z, 'kino', 'oda'],
    ['kgIkeda', '西の槍組', '池田勝正', 1500, LINES[0].x - 22, LINES[0].z + 2, 'ikeda', 'oda'],
    ['kgAkechi', '東の鉄砲組', '明智光秀', 500, LINES[0].x + 20, LINES[0].z + 6, 'akechi', 'oda', 'akechi'],
  ], '殿三千を仮の数とする。三つの持ち場へ順に退く。'),
  battleJin('追う縦備え', 1, { x: 24, z: -150 }, 0, [
    ['kgVan', '北の先手', '名は伝わらない', 6000, -4, -168, 'host.0', 'asakura'],
    ['kgKagetake', '西の追手', '名は伝わらない', 6000, -14, -150, 'host.1', 'asakura'],
    ['kgEast', '疋田方面の追手', '名は伝わらない', 4000, 78, -24, 'host.2', 'asakura', 'asakura', HIKIDA_FACING],
  ], '朝倉の追手一万六千は仮の数。総大将を前線へ置かない。将名と配分は不明。'),

];

const kanegasaki = {
  // 稲生の型。下知・歩数を重ねず、任務一行とピンで持ち場を示す。
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
  bannerAllowed: (rt, title) => rt.over || !!rt.flags.ending || /重傷|討死|任務失敗/.test(title),
  missions: ['旗へ進め', '仲間を待て', 'ここを守れ', '▼の敵を倒せ', '退き口へ退け'],
  missionOf(rt) {
    const F = rt.flags, L = rt.G.lord || F.fleeing ? KUTSUKI : LINES[F.line || 0];
    const arrived = rt.distTo(L) < L.r;
    if (rt.G.lord || F.fleeing) return arrived ? 1 : 4;
    if (!arrived) return 0;
    if (F.step === 0 || F.step === 2 || F.step === 4) return 1;
    return kgNearestFoe(rt) ? 3 : 2;
  },
  missionHeading(rt) { return kanegasaki.missions[kanegasaki.missionOf(rt)]; },
  // 総大将を補わず、この戦に既にいる朝倉の侍大将を地図と戦場で強調する。
  commanderSignTarget(rt) {
    const F = rt.flags;
    if (rt.over || F.ending) return null;
    if (F.commanderAt === rt.t && (!F.commander || kgActive(F.commander) && !F.commander.dying && !F.commander.downed)) return F.commander;
    F.commanderAt = rt.t;
    let chosen = null, best = Infinity;
    const p = rt.player.u.pos;
    for (const g of rt.army.groups) if (g.team === 1) for (const u of g.units) {
      if (u.type !== 'busho' || !kgActive(u) || u.dying || u.downed) continue;
      const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
      if (d < best) { best = d; chosen = u; }
    }
    F.commander = chosen;
    return chosen;
  },
  commanderTarget(rt) {
    const u = kanegasaki.commanderSignTarget(rt);
    return u && kanegasaki.missionOf(rt) === 3 && kgNearestFoe(rt) === u ? u : null;
  },
  namedGuideTarget(rt) { return kanegasaki.commanderSignTarget(rt); },
  missionSignTarget(rt) { return kanegasaki.missionOf(rt) === 3 ? kgNearestFoe(rt) : null; },
  missionPin(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || !rt.player.u.alive) return null;
    const q = F.missionPin || (F.missionPin = { x: 0, z: 0, r: 0, hide: 0 });
    const stage = kanegasaki.missionOf(rt), enemy = stage === 3 ? kgNearestFoe(rt) : null;
    q.unit = null; q.enemy = false; q.waiting = false; q.arrived = false; q.route = false;
    if (enemy) {
      if (rt.player.inRange && rt.player.rangeCueTarget === enemy) return null;
      q.x = enemy.pos.x; q.z = enemy.pos.z; q.r = q.hide = .5;
      q.unit = enemy; q.enemy = true;
      return q;
    }
    const L = rt.G.lord || F.fleeing ? KUTSUKI : LINES[F.line || 0];
    const arrived = rt.distTo(L) < L.r;
    const at = arrived ? L : retreatWay(rt, L);
    q.x = at.x; q.z = at.z; q.r = q.hide = arrived ? L.r : .5;
    q.waiting = arrived; q.arrived = arrived; q.route = !arrived;
    return q;
  },
  // 高画質の井楼は既存の垂直柱・交互の横木を使う。遠景も同じ輪郭にする。
  lookoutLogFrame: true,
  // 共通の見物・兵や火からの避難を使い、兵の名簿・兵数・戦功には入れない。
  civilianCrowd: { bands: KG_CIVILIAN_BANDS },
  nobiki: true, // 退く戦：退けの下知は法螺貝と退き太鼓で知らせる（battle.js の signalCue）
  jinkei: KANEGASAKI_JIN,
  taisho: { a: null, b: null }, // 三将の退却はこの定義が扱う。共通の本陣増設・襲撃・即勝ちを使わない。
  wakeRoom: 200,
  noWake: true, // 寄せは下の台本で同じ遠景から出す。共通の替えで別の敵を重ねない。
  // 反撃の隙と撤退は戦の頭に任せ、性格の構え直しで突きを消さない。
  botOrders: true,
  botBrainDepth: true, // 守る段でも、この戦の道へ戻る判断を先に通す。
  latestPhaseBanner: true, // 古い寄せの知らせより、今の退く下知を先に出す。
  rangedWarning: true, // 発射前に矢印と「後ろ・鉄砲」などの方角を出す。
  spacedCombatCues: true, // 気力・間合い・連撃を離し、肩越しの敵を隠さない。
  reserveCombatCues: true, // 行き先の札も気力と間合いの字を避ける。
  readableLogEntry: true, // 携帯でも数字だけにせず「報せ○件」と示す。
  // 橋と槍列の肩越しでも、手前の布・笠・長柄だけを描く間避ける。
  nearSpearFade: true,
  hideBlockingCloseSpears: true, // 透かした味方の槍も、視線を横切る間だけ避ける。
  nearGroundSpearRadius: 4.5, // 捨てられた長柄も、視線を塞ぐ間は共通の処理で避ける。
  nearLongWeaponRadius: 4.5, // 肩越しの長柄と馬印は、既存の処理で描く間だけ避ける。
  nearHatFadeRadius: 0, // 笠だけを透かして、首布や顔の内側を浮かせない。
  nearAllyHorseFade: true, // すぐ横の味方の馬も、肩越しの追手を塞がないようにする。
  nearAllyFadeRadius: 3.2,
  nearAllySolidBody: true, // 視点が近い味方に入る間だけ全体を避け、具足を半透明にしない。
  nearAllyWholeOcclusion: true, // 自分を遮る味方にも同じ扱いを使い、笠と首布だけが透ける姿を防ぐ。
  nearFlagFadeRadius: 4.5,
  nearHoroRadius: 6,
  nearSceneryScreenCut: false, // 木を画面の四角で切り抜かず、既存の距離による抜きで葉や柱を避ける。
  fadeCloseStandards: true,
  noticeLimit: 2, // 任務一枠と台詞一枠。乱戦で知らせを三枚重ねない。
  failureRetreatGuidance: true, // 任務失敗後も、残兵と退く間は札と退き口の印を残す。
  retryReason: (_rt, info) => info.failureReason || '', // 生きていても敗れる理由を、退き遅れ・合流・突破に分けて伝える。
  retryAdvice: (rt, info) => info.down ? '' : /合流|届か|集ま/.test(info.failureReason || '')
    ? rt.flags.fleeing ? '退き口の旗で、残る味方を待とう' : '次の備の旗で、退いてくる味方を待とう'
    : '備の旗で追手を止め、「退け」で次の旗へ',
  immediatePhaseTasks: true, // 守る段から退く段へ替わったら、古い下知を十秒残さない。
  immediateTaskChanges: true, // 同じ段でも旗へ着いたら「退け」を「待て」へすぐ替える。
  keepTaskLabel: true, // 目の前の敵に印が付いても、持ち場を守る下知を討取りへ替えない。
  keepGuardTaskLabel: true, // 敵の印に「近づけ」と促されて、守る旗から坂へ追い出されない。
  keepRescueTaskLabel: true, // 救う味方が近くても「守る人」に替えず、備と退く合図を残す。
  keepCombatTask: true, // 物陰の案内へ操作を移しても、持ち場の任務を空札にしない。
  keepCombatTaskHeading: true, // 討取りの操作で、しんがりの下知を上書きしない。
  keepCombatTaskDetail: true, // 斬り合う間も、備の人数と合流待ちの理由を保つ。
  keepTaskWithGuard: true, // 構える釦を押している間も、守る備と退く合図を残す。
  keepTaskWithDodge: true, // 回避先だけにならず、守る備の下知を残す。
  keepOpeningTaskLabel: true, // 指の動かし方で、一の備へ向かう下知を上書きしない。
  compactFieldGuides: true, // 追手を太い人型と大矢印で覆わず、旗への道案内と区別する。
  teamSignsOnly: true, // 通常は白い人型を重ねず、敵味方の頭上の印で示す。見やすさを強める設定は残す。
  playerFootSignOnly: true, // 自分の具足を白い人型で覆わず、小さな足元印で位置を示す。
  openingFootSignOnly: true, // 開幕の別経路でも全身の白枠を足さない。
  compactPlayerSign: true, // 自分の輪は小さくし、坂や画面下の操作を横切る時は省く。
  playerSignScale: .4,
  playerSignMinScale: .4, // 共通の下限も明示し、携帯で太い輪が足と橋板を隠さないようにする。
  compactDodgeGuide: true, // 一時の回避は小さなひし形。大きな旗竿で任務の文字を隠さない。
  dodgeGestureBelowNotices: true, // 振り向く指の説明は任務の下へ収め、空きがなければ畳む。
  compactCombatGuides: true, subtleTargetFrames: true,
  compactEnemyFrame: true, // 攻める時の囲みも四隅にする。細い印の指定だけでは六角形が残る。
  introTaskFirst: true, compactIntro: true,
  introSides: { a: '織田のしんがり', b: '朝倉の追手' },
  introText: rt => rt.G.lord ? '藤吉郎らに追手を任せ、旗本と若狭への道へ退こう。明智光秀も残ったと伝わる。' : 'まず目の前の旗へ。道から来る敵を、味方と待とう。「退け」の合図で次の旗へ下がろう。',
  // 各備の守備・合流には固有の期限がある。共通の八分で下知を消さない。
  pacingWait: rt => !!rt.flags.fleeing || !rt.G.lord && rt.flags.step >= 0,
  groundGuideRings: true, // 備の輪は地面に貼り、遠くでは消す。
  clearTravelGuide: true, // 道の矢印と輪の上へ案内札を重ねない。
  compactDestinationSign: true, // 退く道の旗と矢印で、兵の姿や橋板を覆わない。
  footFlagGuides: true, groundFlagGuides: true, // 待つ備も実旗を大枠で囲まず、根元の小旗で示す。
  compactTravelArrow: true,
  swipeArrowLength: 64, directionArrowLength: 64, guideArrowLength: 64, // 退却の別経路も足元の短い矢印に収める。
  smallTaskAreas: true, // 守る味方の足元だけを示し、大きな半円で橋や槍列を隠さない。
  smallRetreatAreas: true, taskAreaFootRing: true, // 強調する退避の輪にも既存の小さな足元印を使う。
  compactGuardGuide: true,
  guardLabel(rt) {
    const L = LINES[rt.flags.line || 0];
    return rt.distTo(L) < L.r ? `${L.mark}で追手を止めよ` : `${L.mark}の旗へ戻れ`;
  },
  shortRetreatGesture: true, // 指元の矢印と退避先を、画面を横切る帯で結ばない。
  retreatArrowLength: 72, // 一時退避も正式な退却も、兵を横断する長い白線にしない。
  compactRetreatSign: true, compactRetreatArea: true,
  keepRetreatReason: true, // 「ここへ」だけにせず、味方へ下がる下知を残す。
  keepRetreatGestureReason: true, // なぞる向きは補足と矢印へ任せ、退く先と待つ下知を残す。
  keepWoundRetreatReason: true, // 負傷しても、一時退避を備の旗への退却と呼び違えない。
  treatmentCrossSign: true,
  treatmentApproachLabel: '十字の印へ下がって手当て',
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.mounted) return '馬を降りて手当て';
    if (p.treatmentNext > rt.t) return 'ここで待て。手当ての支度中';
    if (p.treatmentReady) return p.treating ? '「手当て」を押し続けよ' : '「手当て」を三秒長押し';
    if (!cue?.valid) return '構えて、味方の後ろへ下がれ';
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius)
      return '十字の印へ下がって手当て';
    return 'ここで止まれ。敵が離れたら手当て';
  },
  hideEdgeGoalDistance: true, // 札の歩数は道のりで示し、画面外の案内点への直線距離を添えない。
  retreatTaskLabel(rt, guide) {
    const F = rt.flags;
    // 手当て中は手当ての案内を保つ。正式な退却中は移動する仲間までの歩数を出さない。
    if (rt.over || F.ending || guide?.active && guide.treatment) return '';
    if (!(rt.G.lord || F.fleeing || F.step === 2 || F.step === 4)) {
      if (!guide?.active || !guide.valid) return '';
      const L = LINES[F.line || 0];
      // 退避先へ動く間に「待て」と告げない。着いたら同じ備を守って待つ。
      // 携帯横の札幅に収める。「下が／れ」と命令の末尾だけを折り返さない。
      if (rt.distTo(L) >= L.r + 8) return `${L.mark}の旗へ戻れ`;
      return Math.hypot(guide.x - rt.player.u.pos.x, guide.z - rt.player.u.pos.z) >= guide.radius
        ? `${L.mark}で矢印へ下がれ` : `${L.mark}で合図を待て`;
    }
    const goal = rt.G.lord || F.fleeing ? KUTSUKI : LINES[F.line];
    const place = rt.G.lord || F.fleeing ? '退き口' : goal.mark;
    // 下知と歩数は見出しへ一度だけ。任務の失敗は下の補足へ残す。
    if (F.fleeing && !F.exitReady) return rt.distTo(goal) < goal.r
      ? '退き口で残る味方を待て'
      : `退き口へ退け・あと${Math.ceil(retreatDistance(rt, goal) / .75)}歩`;
    if (rt.distTo(goal) < goal.r) return `${place}で来た道を守れ`;
    return `${place}へ退け・あと${Math.ceil(retreatDistance(rt, goal) / .75)}歩`;
  },
  coverGuidePlace: true, // 遮蔽の輪を備の旗と呼ばず、実際の物陰として案内する。
  // 遠い城壁や射手側の斜面で止まる射線を、足元の物陰とは呼ばない。
  // 胸・頭の両方で、三歩ほど以内に実物の遮蔽物がある候補だけ使う。
  coverHitAllowed(rt, hit, point, shooter) {
    return kgGuidePointAllowed(rt, point) && !!hit.object && (1 - hit.q) *
      Math.hypot(point.x - shooter.pos.x, point.z - shooter.pos.z) <= 2.25;
  },
  namedGuideMarkers: true,
  // 退く下知の間は近場の退避先へ逸らさず、橋を通る既存の道案内を使う。
  // 矢が落ちる範囲の警告は共通の処理が優先して残す。
  routeGuidePriority: rt => !!(rt.G.lord || rt.flags.fleeing || rt.flags.step === 2 || rt.flags.step === 4),
  // 備を守る段の一時退避を、次の旗への退却と取り違えさせない。
  retreatGuideLabel: kgRetreatLabel,
  distanceUnit: 'steps',
  missionDangerText(rt) {
    const F = rt.flags;
    const withdrawing = rt.G.lord || F.fleeing || F.step === 2 || F.step === 4;
    const goal = rt.G.lord || F.fleeing ? KUTSUKI : LINES[F.line || 0];
    const place = rt.G.lord || F.fleeing ? '退き口' : goal.mark;
    // 危険の札は任務より優先される。その一枚にも、今の行き先と待つ理由を残す。
    if (withdrawing) {
      if (rt.distTo(goal) >= goal.r)
        return `！ 味方が崩れそう。${place}へ退け・あと${Math.ceil(retreatDistance(rt, goal) / .75)}歩`;
      return `！ 味方が崩れそう。${place}で残る組を待ち、来た道へ槍を向けよ`;
    }
    if (rt.distTo(goal) >= goal.r)
      return `！ 味方が崩れそう。${place}の旗へ戻り、槍列で構えよ`;
    return `！ 味方が崩れそう。${place}の味方と槍をそろえ、退く合図を待て`;
  },
  taskDetail(rt, _title, progress) {
    const F = rt.flags;
    // 手当ての行き先と操作は見出しにある。前の合流待ちを持ち越さない。
    if (rt.hud.retreatGuide?.active && rt.hud.retreatGuide.treatment) return '';
    if (F.fleeing && !F.exitReady && !rt.hud.retreatGuide?.treatment)
      return rt.distTo(KUTSUKI) < KUTSUKI.r
        ? F.exitWaiting || '追手を止めきれなかった。残る組を待て'
        : '追手を止めきれなかった。残る組と南へ';
    // 到着後に待つ組を知らせる。損害人数で合流の理由を隠さない。
    if (!rt.hud.retreatGuide?.treatment && !rt.G.lord && !F.fleeing &&
        (F.step === 2 || F.step === 4) && rt.distTo(LINES[F.line]) < LINES[F.line].r)
      return F.lineWaiting || '組と旗の下で追手を止めよ';
    // 自分の命だけでは殿の損害が分からない。実際に戦える同じ兵数を札へ残す。
    if (!rt.G.lord && !F.fleeing && !rt.hud.retreatGuide?.treatment && !F.breachT &&
        F.rearguardReady !== undefined && (F.collapseWarnAt !== undefined || F.dpOn && F.step % 2 === 1))
      return `${F.collapseWarnAt !== undefined ? '備が崩れそう。' : ''}槍列で構えよ。味方 ${F.rearguardReady}／${F.rearguardInitial}人`;
    if (!rt.hud.retreatGuide?.treatment && (rt.G.lord || F.fleeing || F.step === 2 || F.step === 4)) {
      const goal = rt.G.lord || F.fleeing ? KUTSUKI : LINES[F.line];
      if (rt.distTo(goal) >= goal.r) return '';
    }
    if (!F.breachT && F.collapseWarnAt === undefined && rt.hud.retreatGuide?.active && rt.hud.retreatGuide.valid && !rt.hud.retreatGuide.treatment &&
        !(rt.G.lord || F.fleeing || F.step === 2 || F.step === 4))
      return kgRetreatLabel(rt, Math.hypot(rt.hud.retreatGuide.x - rt.player.u.pos.x,
        rt.hud.retreatGuide.z - rt.player.u.pos.z) < rt.hud.retreatGuide.radius);
    return progress;
  },
  travelGuideLabel: rt => rt.G.lord || rt.flags.fleeing ? '退き道へ' : `${LINES[rt.flags.line || 0].mark}へ`,
  dodgeLabel: (_rt, direction, rain) => direction || (rain ? '矢をよける' : '敵から離れる'),
  dodgeGuideLabel: (_rt, arrived, rain) => rain
    ? arrived ? 'ここで矢をよけよ' : '矢をよけて下がれ'
    : arrived ? 'ここで槍を構えよ' : '敵から少し離れよ',
  // 一時の回避先を城山へ向けない。今いる場所より道や備から離れさせない。
  dodgePointAllowed: kgGuidePointAllowed,
  retreatPointAllowed: kgGuidePointAllowed,
  // 移動の下知と取り違えず、何を動かすかを示す。説明札は短く出す。
  dodgeTurnLabel: (_rt, right, touch) => touch
    ? `画面を${right ? '右' : '左'}へなぞる`
    : `手元の操作器を${right ? '右' : '左'}へ動かして振り向く`,
  // 見回しの案内だけで兵と任務を止めない。なぞらなくても寄せと退却が続く。
  pauseTurnPractice: false,
  dodgeTurnDuration: 3.5,
  largeWaymarks: false, // 任務札と足元の向きで案内し、兵の頭上へ大札を重ねない。
  edgeBehindWaymarks: true, // 振り向く札を端へ寄せ、自分と矢の警告を覆わない。
  arrivalLabel: '旗のそば',
  guideMarker(rt) {
    const F = rt.flags, withdrawing = rt.G.lord || F.fleeing || F.step === 2 || F.step === 4;
    const goal = rt.G.lord || F.fleeing ? KUTSUKI : LINES[F.line || 0];
    // 旗に着いた後は、待つ下知を任務札に残す。自分の頭上へ移動の輪を出さない。
    // 離れれば同じ備への案内に戻る。兵の合流・寄せ・終戦の判定は変えない。
    if (rt.distTo(goal) < goal.r) return null;
    return withdrawing ? 'retreatWay' : F.dpOn ? 'dp' : 'holdLine';
  },
  botEvacuating: (rt) => !!rt.flags.fleeing || rt.G.lord || rt.flags.step === 2 || rt.flags.step === 4,
  botBrainDepth: true, // 守る段でも、この戦の道・持ち場の確認を通してから段の頭へ渡す。
  waitGuardAllowed(rt) { return !this.botEvacuating(rt); }, // 退く下知の間は長押しで待たせない。
  meleeGuide(rt) { return !this.botEvacuating(rt); },
  softOpen: 0,   // 撤退戦の開幕を無傷の猶予にしない。
  // 敵の打ち込みの重さ（bot が楽に勝ちすぎたので締める。player.js の takeDamage）
  foeHit: 1,
  // 普通・練習では、満タンから斬り合いを二十秒続けても立てる。
  // 最初の傷は体力の８％、以後は毎秒４％まで。受けと回避の間も残す。
  meleeGrace: { rate: 0.04, burst: 0.08, interval: 0.85 },
  // 一の備の麓では視線を少し上げ、正面の天筒山の斜面と雑木を画面に残す（見下ろしの絵にしない）。
  frameCamera(rt, pos, look) {
    const p = rt.player.u.pos;
    if (p.z > -60 && p.z < -12 && p.x > -30 && p.x < 40) {
      // 地面から2mほどの低い肩越しへ下げる（足もとの補正は後の共通処理）。
      pos.y = Math.max(rt.world.heightAt(pos.x, pos.z) + 1.4, Math.min(pos.y, p.y + 2.0));
      const span = Math.hypot(look.x - pos.x, look.z - pos.z);
      look.y = Math.max(look.y, pos.y - span * 0.08);
    }
  },
  // 列や建物の当たりを残し、組の脇の空いた所から始める。
  spawn: { x: LINES[0].x - 11, z: LINES[0].z + 8, heading: Math.PI },
  // 身の回りの当時の場（timeslip_field.js）。元亀元年四月二十八日は今の六月はじめ。
  // 若葉の草、湿った川岸の土。退く兵が捨てた槍・笠・旗と、追う朝倉の矢。殿の備の後ろに木下の幟、道脇に捨てた兵糧の俵。
  timeslip: {
    wet: 0.25, dust: 0.3, trample: 0.2, debris: 1.4, arrows: 0.9, reeds: 0.6,
    grass: 0x7e9e52, grassTints: [0xffffff, 0xe6eecc, 0xd0dca8], grassH: 1.05, tallGrass: 0.8,
    flagColors: [0xe6e0cc, 0x24211e, 0xb08a32],
    fights: LINES.map((l) => [l.x, l.z, l.r + 22]),
    maxSlope: 0.16,   // 城山・天筒山の斜面には泥や倒れた物を置かない（斜面に貼った踏み跡が四角い影に見えた）
    sets: [
      { k: 'nobori', x: LINES[1].x - 9, z: LINES[1].z + 9, dx: 3.5, dz: 0, n: 3, kind: 'oda', h: 5 },
      { k: 'nobori', x: LINES[2].x - 10, z: LINES[2].z + 10, dx: 3.5, dz: 0.5, n: 3, kind: 'oda', h: 5 },
      { k: 'tawara', x: 14, z: 50, rot: 0.4, n: 5 },
      { k: 'tawara', x: -32, z: 86, rot: -0.6, n: 4 },
    ],
  },
  world: {
    noHaori: true, // 本の足軽姿に合わせ、武将にも陣羽織を重ねない。
    blockedHint: () => '槍列の横へ回れ。退く時は南へ続く道を通れ',
    seed: 1570,
    // 天筒山の東端と主郭の北の切岸まで、城と同じ地面で支える。
    // 既定の半幅180では山頂（東約185）と主郭北端（北約198）が範囲外になる。
    // 格子の数は増やさず、城の外縁十八歩も含めて細かな地面へ収める。
    groundHalf: 224,
    wind: [0.3, 0.95],   // 北の峠から吹き下ろす風（朝倉の側から）
    time: 'day', // 当日の天気と時刻は未詳。雨上がりを史実として補わず、昼の景色を復元。
    keepTerrainGrid: true, // 携帯でも足場と同じ格子で描く。山道の肩で兵や落ちた荷を浮かせない。
    terrainTriangles: true, // 同じ格子の中も、描く三角形と同じ高さで兵と視点を支える。
    terrainContactView: true, // 視点を直接替えた時も、手前の面全体を斜面の上へ戻してから地面の面を選ぶ。
    climbTan: 0.55, // 麓の足場選びと同じ勾配。道を外れた追い合いで山腹へ登らせない。
    looseHorseClimbTan: 0.55, // 空馬も同じ麓を通り、急な城山へ逃げ上がらない。
    followColumnRoad: true, // 退く後列も道の折れをたどり、橋岸や谷の内側へ直進しない。
    bareFallenHats: true, slopeLitter: true, // 落ちた笠の首布を除き、武具を坂の傾きへ合わせる。
    groundedFalls: true, settleSideFalls: true, // 横倒しの肩と胴を接地させ、槍を体に沿わせる。
    groundMistScale: 0.35, // 川岸の足場が見える薄さにする。
    battleViewDistance: 120, // 共通の描画距離に合わせ、対岸の備と退き道を白い壁で隠さない。
    smokeFogFloor: 180, // 硝煙の粒を残し、橋と川南の味方を白い幕で隠さない。
    young: true,     // 四月の越前：若葉の草
    variedInfantry: true, // 名のない貸し具足だけ、既存の使い込みと仕立ての差を使う。
    variedMarch: true, strideLimit: 1.1, livingSpearHedge: true,
    infantryWeight: true, contactDust: true,
    patchyGround: true, erodedSlopes: true,
    stableSlopeGrain: true, // 道脇の法線が回っても、雨溝の模様を細い縞へ引き延ばさない。
    softEarthCrust: true, // 土塊の陰を塊の縁に限り、裸地を升目の板に見せない。
    sparseEarthCrust: true, // 乾いた道の土塊を間引き、同じ穴が一面に並ぶ見え方を抑える。
    subtleMudRelief: true, // 川南の乾いた道へ同じ穴を並べず、踏まれた泥だけに薄く残す。
    groundCover(x, z) {
      // 備の足元は踏み荒らした地肌、脇は草むら。同じ分布を地面と草株へ渡す。
      let cover = 1;
      for (const line of LINES) {
        const d = Math.hypot(x - line.x, z - line.z);
        cover = Math.min(cover, 0.2 + Math.min(0.8, d / line.r * 0.8));
      }
      return cover;
    },
    allyCloth: [0x3a3024, 0x33302a, 0x38372f, 0x3a2e24, 0x383d3c, 0x2e2a26],
    grassSlopeMax: 0.55, // 切岸へ草の房を横向きに浮かせない。
    muddy: 0.25,
    water: { x: -820, x2: -120, level: -2.2 },
    noArrowRain: true, // 少人数の弓組は通常の矢で射る。大量の追加矢と自動の見上げで足場を隠さない。
    friendlyProjectiles: true, // 射線へ入った味方にも、同じ弾・矢が当たる。
    waterSlow: true,   // 笙の川を渡る間は遅い（terrain_tags.js の water。10/2）
    paths: [RETREAT_ROAD, HIKIDA_ROAD, ...KG_PATHS, ...KG_PEOPLE_PATHS],
    height,
    tint(x, z, h, c) {
      // 浜の砂
      if (x < -120 && h < 7) { const k = Math.min(1, (-120 - x) / 14); c.lerp({ r: 0.62, g: 0.58, b: 0.48 }, k * 0.8); }
      // 山の緑は濃く
      const mix = Math.sin(x * 0.34 + z * 0.21) * Math.cos(z * 0.29 - x * 0.12);
      c.lerp(mix > 0 ? { r:0.30, g:0.38, b:0.20 } : { r:0.40, g:0.33, b:0.23 }, Math.abs(mix) * 0.5);
      if (h > 7) c.setRGB(c.r * 0.94, c.g * 0.98, c.b * 0.92);
      // 川岸は草地と同じ明るさにせず、濡れた泥と乾いた砂礫を不揃いに分ける。
      const bankD = Math.abs(distToPolyline(x, z, SHO) - 4.5);
      const bank = Math.max(0, 1 - bankD / 3.6);
      if (bank > 0) {
        const wet = 0.5 + 0.5 * Math.sin(x * 0.7 + z * 0.4);
        c.r += (0.33 - wet * 0.1 - c.r) * bank;
        c.g += (0.30 - wet * 0.09 - c.g) * bank;
        c.b += (0.23 - wet * 0.05 - c.b) * bank;
      }
      // 麓の切り通しを一面の草で覆わず、急な肩へ土の露出を混ぜる。
      // 地面を作る時の頂点色だけ。道の高さ・兵の足場・城の形は変えない。
      if (h > 4 && x > -115 && x < 140 && z > -115 && z < 170) {
        const slope = Math.hypot(height(x + 1, z) - height(x - 1, z),
          height(x, z + 1) - height(x, z - 1)) / 2;
        const steep = Math.max(0, Math.min(1, (slope - 0.45) / 0.65));
        const patch = 0.55 + 0.25 * Math.sin(x * 0.13 + z * 0.08) * Math.cos(z * 0.17);
        const soil = steep * patch;
        c.r += (0.39 - c.r) * soil;
        c.g += (0.33 - c.g) * soil;
        c.b += (0.24 - c.b) * soil;
      }
    },
    // 狭路と最後の退き道も、肩越しの視点が枝葉へ入り込まない幅を空ける。
    // 山腹の林は残し、設営時に木を置く範囲だけを絞る。
    // 麓の低い所だけ空け、城山の斜面（高さ6より上）には若葉の林を残す（山肌が坊主に見えた。10/28）
    // 持ち場の左手前の若葉のナラ・クヌギ（最初の画面の手前に木の幹と葉を入れる。10/28 点付け）だけは空けない。
    clear: (x, z) => !KG_FRONT_TREES.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 2.6) && (Math.abs(x) < 70 && z > -90 && z < 80 && (z > -40 || height(x, z) < 6)) ||
      (z >= 80 && distToPolyline(x, z, RETREAT_ROAD) < 20) || Math.hypot(x - 24, z + 150) < 22,
    clearGroves: true, // 指定した林の木も、退き道と川岸を空ける。
    nearTreeFadeRadius: 5.5, // 振り返る視点の直前へ入る幹を早めに透かす。
    slopeForest: 0.55, cliffRock: 0.3,
    groundedSlopeRocks: true,
    slopeRockFaces: true, rockDrawGround: true, // 岩の厚みを坂の外へ向け、描く地面へ下縁を埋める。
    rockBuriedRim: true, // 下端だけでなく腹の縁を据え、斜面から離れた黒い塊に見せない。
    rockSlopeContact: true, // 回転後に斜面へ向く腹と縁を土へ埋める。設営時だけ調べる。
    curvedRockTufts: true, litRockTufts: true, // 根草を黒い針の群れにせず、曲がった短い葉で示す。
    rockBands: [{ x: -69, z: 92, w: 12, d: 17 }, { x: 26, z: 110, w: 9, d: 19 },
      { x: 30, z: -63, w: 9, d: 16 }],
    fieldStage: 'seedling',   // 元亀元年四月末は今の六月はじめ。越前の田は植えたばかりの苗と水（田植えの時期は推定。10/28）
    paddy(x, z) {
      // 中池見湿地：田の升目でなく、不揃いに水をたたえた湿地（天筒山の東南、天然の防御線）
      const dw = Math.hypot(x - NAKAIKEMI.x, z - NAKAIKEMI.z);
      if (dw < NAKAIKEMI.r) {
        const n = Math.sin(x * 0.17 + z * 0.13) * 0.5 + Math.sin(x * 0.31 - z * 0.22 + 1.7) * 0.3;
        return Math.max(0, Math.min(1, (NAKAIKEMI.r - dw) / NAKAIKEMI.r * 1.4 + n * 0.3 - 0.2));
      }
      if (height(x, z) > 3 || x < -60 || x > 80 || z < -30 || z > 70 || Math.abs(z - 20) < 12) return 0;
      if (Math.abs(x - 6) < 7) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.7;
    },
    // 橋の下と、西から寄せる隊の浅瀬。兵の歩みも、この通れる筋へ回す。
    streams: [{ pts: SHO, w: 4.5, depth: 1.2, fords: [{ x: 8, w: 5.7 }, { x: -50, w: 10 }] }],
    trees: 460,
    branchFoliage: true, foldedNeedleCards: true, unevenCrowns: true, nearCedarBranches: true,
    tufts: 4200,
    treeDensity: (x, z) => (Math.hypot(x - NAKAIKEMI.x, z - NAKAIKEMI.z) < NAKAIKEMI.r + 6 ? 0.08 : Math.abs(x) < 60 && z > -90 && z < 90 && (z > -40 || height(x, z) < 6) ? 0.2 :
      0.55 + 0.45 * Math.sin(x * 0.055 + z * 0.028) * Math.sin(z * 0.073 - x * 0.021)),
    // 城山の南の斜面の若葉の雑木（麓から山と城を見上げた時に坊主山にしない。10/28）
    groves: [{ x: -34, z: -76, r: 12, n: 16 }, { x: 28, z: -78, r: 12, n: 16 }, { x: -4, z: -96, r: 14, n: 18 }, { x: -48, z: -108, r: 12, n: 14 }, { x: 40, z: -112, r: 12, n: 14 }, { x: -40, z: -20, r: 12, n: 18 }, { x: 50, z: 50, r: 12, n: 16 }, { x: -50, z: 70, r: 10, n: 14 }, { x: -52, z: 98, r: 10, n: 22 }, { x: 10, z: 112, r: 10, n: 20 },
      // 一の備の左右の若葉の雑木（持ち場の手前と脇に見える。槍の組の場は空ける）
      { x: -20, z: -46, r: 6, n: 7, kind: 'broad' }, { x: -16, z: -27, r: 3, n: 3, kind: 'broad' }, { x: 24, z: -60, r: 5, n: 6, kind: 'broad' },
      // 持ち場の正面：手前の若葉のナラ・クヌギと、天筒山の麓の斜面の雑木（最初の画面に山を坊主にしない。10/28）
      // 登城道のつづら折り（6歩の空き）を避け、斜面の左右の端へ寄せる。
      { x: -9, z: -31, r: 1.5, n: 2, kind: 'broad' }, { x: -9, z: -42, r: 1.5, n: 2, kind: 'broad' },
      ...KG_FRONT_TREES.map(([x, z]) => ({ x, z, r: 1.6, n: 2, kind: 'broad' })),
      { x: -50, z: -64, r: 8, n: 11, kind: 'broad' }, { x: -48, z: -84, r: 8, n: 10 }, { x: 50, z: -70, r: 8, n: 10, kind: 'broad' },
      // 25秒の肩越しの正面（東の斜面）の柵の上の雑木と杉（10/28 点付け）
      { x: 44, z: -54, r: 7, n: 9, kind: 'broad' }, { x: 58, z: -48, r: 7, n: 8 }],
    // 崩れた追手は北の峠道か東の寄せ口へ。東の兵を海まで走らせない。
    fleeOut: (x, z, team) => team === 1 && (z < -130 || (x > 90 && z > -40 && z < 4)),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    timeslipField(rt);   // 身の回りの若葉・捨てた槍と笠・矢（def.timeslip）
    kgFootGate(rt);
    // しんがりは組で追手を止める。退く途中に周囲の兵を一騎打ちの見届けへ止めない。
    rt.army.hooks.canDuel = () => false;
    // この戦専用の地面材質だけを保つ。近い崖を網目で抜かず、視点を上へ逃がす。
    W.terrain.material.userData.camNearSolid = true;
    F.flagMats = new WeakMap(); F.flagTex = new Map(); F.flagMatList = [];
    F.clothMats = new WeakMap(); F.clothTime = { value: 0 };
    F.clothWind = { value: WIND_STATE.gust }; F.clothMotion = { value: S.reduceMotion ? 0 : 1 };
    F.sceneryResources = [];
    const restoreView = retreatView(rt);
    const dispose = rt.dispose.bind(rt);
    rt.dispose = () => {
      if (rt.disposed) return;
      // 共通の片付けは画面・兵・視点への参照を消す。専用の包みを先に戻す。
      restoreView(); F.restoreNotices(); dispose();
      for (const resource of F.sceneryResources) resource.dispose(); F.sceneryResources.length = 0;
      for (const m of F.flagMatList) m.dispose();
      F.flagTex.clear(); F.flagMatList.length = 0;
    };
    retreatNotices(rt);
    retreatCouriers(rt);
    retreatGroundDetail(rt);
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { retreat: 'HIST_A', asaiBetrayal: 'HIST_B', kutsukiRoute: 'HIST_A', rearguard: 'HIST_A', castleSite: 'HIST_B', bridge: 'GAME_C', baggage: 'GAME_C', confusion: 'GAME_C' };
    rt._rfN = 3; // この撤退戦では共通の自動援兵を使わない。
    F.pursuers = []; F.pursuersAt = 0; F.nextPursuerAt = 0;
    F.step = 0; F.ek = 0; F.ak = 0; F.line = 0;
    F.retreatWay = { x: 0, z: 0 };
    rt.marker('retreatWay', () => {
      if (F.ending || !rt.player.u.alive || !(rt.G.lord || F.fleeing || F.step === 2 || F.step === 4)) return null;
      return retreatWay(rt, rt.G.lord || F.fleeing ? KUTSUKI : LINES[F.line]);
    }, () => {
      const goal = rt.G.lord || F.fleeing ? KUTSUKI : LINES[F.line];
      return rt.distTo(goal) < goal.r ? rt.G.lord || F.fleeing ? '退き口・味方を待て' : `${goal.mark}・味方を待て`
        : rt.G.lord || F.fleeing ? '退き口へ続く道' : `${goal.mark}へ退く道`;
    }, { guideAlways: true, groundGuide: true,
      routeDistance: () => retreatDistance(rt, rt.G.lord || F.fleeing ? KUTSUKI : LINES[F.line]) });
    F.lineMerit = [0, 0, 0]; F.meritDone = [false, false, false];
    F.enemyVoice = [false, false, false];
    const L = LINES[0];
    // 退き陣に取り残された空馬一頭は遊びの補完。持ち場を離れず手綱を取れる。
    const h = buildHorse();
    h.position.set(L.x + 6, W.heightAt(L.x + 6, L.z + 6), L.z + 6);
    h.rotation.y = Math.PI;
    rt.scene.add(h);
    const horses = rt.army.looseHorses || (rt.army.looseHorses = []);
    horses.push({ h, heading: Math.PI, spd: 0, t: 0, calm: true,
      from: { team: 0, house: '織田', name: '', speed: 1, hp: 200, maxHp: 200 } });
    // ---- 殿：木下藤吉郎の手（自分の持ち場）、池田勝正の手、明智光秀の鉄砲 ----
    F.kino = allyGroup(rt, { fixed: true, fullStrength: true, faction: 'oda', name: '木下藤吉郎の手', anchor: { x: L.x - 3, z: L.z - 4 }, facing: Math.PI, width: 22, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { horse: false, name: '木下藤吉郎', invuln: true, hat: 'kabuto_m', haori: 0x6a4a1c } }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 3 }], ODA));
    F.kinoU = F.kino.units[0];
    F.ikeda = allyGroup(rt, { fixed: true, fullStrength: true, faction: 'oda', name: '池田勝正の手', anchor: { x: L.x - 22, z: L.z + 2 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '池田勝正', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x2a3a4a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }], ODA));
    F.akechi = allyGroup(rt, { fixed: true, fullStrength: true, faction: 'oda', name: '明智光秀の鉄砲', anchor: { x: L.x + 12, z: L.z + 6 }, facing: Math.PI, width: 6, aggro: 30, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '明智光秀', invuln: true, hat: 'kabuto_w', haori: 0x3a3a52 } }, { type: 'ashigaru', n: 4 }, { type: 'samurai', n: 2 }, { type: 'gun', n: 6 }], ODA));
    F.akeU = F.akechi.units[0];
    F.ikedaU = F.ikeda.units[0];
    F.gunsEast = allyGroup(rt, { fixed: true, fullStrength: true, faction: 'oda', name: '明智の右の鉄砲組', anchor: { x: L.x + 22, z: L.z + 6 }, facing: Math.PI, width: 4, formation: 'line', aggro: 22, noRout: true }, dress([{ type: 'gun', n: 6 }, { type: 'ashigaru', n: 2 }], ODA));
    F.tono = [F.kino, F.ikeda, F.akechi, F.gunsEast];
    // 使番は開幕から同じ一人。手傷も討死も通常の判定で扱う。
    F.runner = allyGroup(rt, { fixed: true, fullStrength: true, faction: 'oda', name: '殿の使番',
      anchor: { x: L.x + 3, z: L.z + 18 }, facing: Math.PI, formation: 'column',
      aggro: 0, seekRange: 0, noAI: true, noRout: true }, dress([{ type: 'samurai', n: 1 }], ODA));
    F.runner.isRunner = true; F.runner.speed = 4.5;
    F.runnerNews = null;
    for (const u of [F.kinoU, F.ikedaU, F.akeU]) { u.allyOk = true; u.pos.z += 7; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.mesh.position.copy(u.pos); }
    // 殿は選り抜きの組。退く間に討ち減らされて次の備がそろわない事が続いたので、受ける傷を少し軽くする（斬り合いの数は変えない）。
    for (const g of F.tono) { g.defMult = 1.6; g.dmgMult = 1; }
    const n = RANKS[rt.G.rank].squad;
    if (n && !rt.G.lord) rt.makeSquad({ x: L.x + 4, z: L.z + 8 }, Math.PI, [{ kind: 'spear', n }]);

    // ---- 陣と旗：金ヶ崎城と天筒山に織田の旗、麓に陣幕 ----
    for (const [x, z, k] of [[CASTLE.x - 4, CASTLE.z + 6, 'oda'], [CASTLE.x + 4, CASTLE.z + 4, 'eiraku'], [TEZUTSU.x, TEZUTSU.z + 8, 'oda'], [L.x - 6, L.z + 10, 'oda'], [L.x + 8, L.z + 10, 'oda'], [L.x + 22, L.z + 12, 'oda']]) rt.scene.add(retreatNobori(rt, W, x, z, k, 6));
    // 占領済みの土の城。曲輪の全周と木戸・登れる物見を共通部品でまとめる。
    const C = F.castleC = buildCastlePlan(rt, kgCastlePlan(), { baseHeight:relief, edgeW:KG_CASTLE_EDGE, life:false, perch:false, buildSeat:false, buildGates:true, buildTowers:true, team:0 });
    for (const wall of C.walls) { wall.noTarget=true; wall.fireProof=true; }
    for (const gate of Object.values(C.gateObjs)) { gate.open(); gate.struct.solidR=0; gate.struct.passable=true; gate.struct.opened=true; gate.struct.noTarget=true; gate.struct.fireProof=true; }
    // 総石垣でなく、入口脇の低い留め石。購入した城の部品を使い、材質ごとにまとめる。
    const rim=makeKitBatch();
    for (const z of [KG_NI_GATE[1]-3.3,KG_NI_GATE[1]+3.3]) ishigaki(W, [[KG_NI_GATE[0]-2,z],[KG_NI_GATE[0]+2,z]], { topY:W.heightAt(KG_NI_GATE[0],z)+.25,minH:.45,maxH:.8,batch:rim });
    finalizeKitBatch(rt,rim);
    // 配置・用途は推定。板葺き。入れる建物は共通の戸口・床・和の部屋を使う。
    // 高画質の番所は既存の切妻板葺き・連子窓を使う。大きな入母屋と明かり障子は補わない。
    const house=(x,z,w,d,name,kind) => goten(rt,x,z,{w,d,name,kind,profile:'kanegasaki',tile:false,naka:true,door:1,doorX:0,team:0,noTarget:true,earth:0x998365,fieldFort:true,weatheredBoards:true,boardRoofColors:KG_ROOF_COLORS});
    house(CASTLE.x+3,CASTLE.z-4,6,4,'主郭の詰所','goten');
    house(KAZ2.x+7,-150,4,3,'焼米出土地の番所','bansho');
    house(TEZUTSU.x,TEZUTSU.z-4,5,3,'天筒山の長屋','nagaya');
    tezutsuTatebori(rt, W, F);
    const homes = makeSimpleBatch();
    const sacks = [];
    let sackMaterial;
    const sackNormal = new THREE.Vector3(), sackUp = new THREE.Vector3(0, 1, 0);
    const sackTilt = new THREE.Quaternion(), sackPoint = new THREE.Vector3();
    const addSacks = (x, z, r, n) => {
      const mesh = tawara(W, x, z, r, n);
      // 原点だけを地面へ置くと、脇へずれた俵が坂の上に浮く。
      // 設営時に傾きと輪郭を調べ、縄も含めて土へ据えてから一束へまとめる。
      sackNormal.set(W.heightAt(x - 0.5, z) - W.heightAt(x + 0.5, z), 1,
        W.heightAt(x, z - 0.5) - W.heightAt(x, z + 0.5)).normalize();
      mesh.quaternion.premultiply(sackTilt.setFromUnitVectors(sackUp, sackNormal));
      mesh.updateMatrix();
      const positions = mesh.geometry.attributes.position;
      let gap = Infinity;
      for (let i = 0; i < positions.count; i++) {
        sackPoint.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrix);
        gap = Math.min(gap, sackPoint.y - W.heightAt(sackPoint.x, sackPoint.z));
      }
      mesh.position.y -= gap + 0.015; mesh.updateMatrix();
      sacks.push(mesh.geometry.applyMatrix4(mesh.matrix)); sackMaterial = mesh.material;
    };
    // 木造・切妻板葺きの兵糧小屋も床と戸口をつなぐ。荷は壁際へ寄せる。
    house(KAZ2.x-5,-150,4,3,'焼米出土地の兵糧小屋','kura');
    if (true) {
      // 小さな板葺き屋敷を段ごとにまとめ、土橋と木戸の正面を空ける。
      // 朝倉の城を占領した後の備えなので、旗は織田木瓜。近代の天守を置かない。
      // 主郭の長屋だけ長手に板戸を並べる。戸の面を南の既存の庇へ向け、妻の物置口も残す。
      for (const [x,z,w,d,r,nagayaDoors=false] of [[76,-179,5,3,.08],[90,-185,4,3,0],
        [75,-96,5,3,.12],[92,-94,6,3,0],[CASTLE.x+6,CASTLE.z+19,3,7,-Math.PI/2,true]]) {
        // 屋根全体の色替えに加え、既存の頂点色で雨染みと差し替え板の明暗を出す。
        hut(W,x,z,w,d,r,{ita:true,boardRoof:true,boardGables:true,boardRoofColors:KG_ROOF_COLORS,weatheredBoards:true,groundedHome:true,nagayaDoors,minka:false,h:2.3,wall:0x74624c,batch:homes});
      }
      // 背面だけの柵を屋敷の庭へ回す。南面の二歩の口と、中央の尾根道は空ける。
      // 北の屋敷は門柱の代わりとなる幟の西側に庭口を寄せる。
      for (const seg of [[72,-183,80,-183],[72,-183,72,-175],[80,-183,80,-175],
        [72,-175,73,-175],[75,-175,80,-175],
        [72,-99,79,-99],[72,-99,72,-92],[79,-99,79,-92],[72,-92,73,-92],[75,-92,79,-92],
        [88,-98,96,-98],[88,-98,88,-90],[96,-98,96,-90],[88,-90,91,-90],[93,-90,96,-90]]) {
        // 屋敷の庭は細杭二段の横桟。外周の防柵より低く透けさせる。
        palisade(W,seg,{h:1.5,lightFence:true,mound:false,noBrace:true,solid:true,batch:homes});
      }
      retreatLonghouseEave(rt,CASTLE.x+6,CASTLE.z+19);
      monomi(rt,92,-173,{team:0,mon:'oda',logFrame:true,boarded:false,name:'尾根の井楼'});
      // 各段の屋敷脇と曲輪の肩に間をあけて立てる。木戸・梯子・庭の道筋は空ける。
      // 元亀元年の占領後なので織田木瓜を使い、後世の家紋を補わない。
      for (const [x,z,h] of [[74,-172,4.8],[94,-187,4.2],[91,-144,4.8],
        [75,-147,4.1],[94,-103,4.8],[74,-91,4.2],
        [CASTLE.x-11,CASTLE.z+12,4.6],[TEZUTSU.x+6,TEZUTSU.z+4,4.2]]) {
        rt.scene.add(retreatNobori(rt,W,x,z,'oda',h));
      }
    }
    // 殿の陣は置かない（信長はもう朽木越えに発った。殿の大将・藤吉郎は一の備にいる）。捨てた俵と小屋だけ残る
    addSacks(20, -2, 0.4, 5);
    // 川岸の低い側まで土台を下ろす。携帯でも根石と束を省かない。
    hut(W, 34, 2, 6, 4, 0.3, { roof: 0x6a5c44, groundedHome:true, batch:homes });
    if (true) {
      // 退却で残した修理用の丸太と床几。軍配や大将の座を新しく据えない。
      // 小屋の脇だけに置き、退き道と川の浅瀬・乱戦の備を塞がない。
      const pieces = [lumber(W,39,5,.2),lumber(W,40,8,.2),shogi(W,30,4,-.6)];
      const parts = [];
      let material;
      for (const root of pieces) {
        root.updateMatrixWorld(true);
        root.traverse(m => {
          if (!m.isMesh) return;
          material = m.material;
          const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          parts.push(geo.applyMatrix4(m.matrixWorld)); m.geometry.dispose();
        });
      }
      const geo = mergeGeometries(parts), mesh = new THREE.Mesh(geo,material);
      for (const part of parts) part.dispose();
      mesh.castShadow = mesh.receiveShadow = true; mesh.userData.camBlock = true;
      F.sceneryResources.push(geo); rt.scene.add(mesh);
      addSacks(38,0,.1,3);
    }
    // 退く道：笙の川に架かる細い板橋と、道ばたの集落（小屋）。橋の幅は狭く、一度には渡れない
    {
      const bx = 8, bz = 12, yb = Math.max(W.heightAt(bx, bz - 9), W.heightAt(bx, bz + 9)) + 0.18;
      // 幅を渡す長い厚板にする。中央の継ぎ目を石畳の目地のように並べない。
      // 遠くは同じ幅の簡単な板に戻し、一括描画は保つ。
      const wood = bridgeWoodMaterial(), close = true;
      const plank = bridgeBoard(3.4, .22, .48);
      const farPlank = close ? bridgeBoard(3.4, .22, .48, true) : null;
      const deck = new THREE.InstancedMesh(plank, wood, 34), place = new THREE.Object3D();
      const farDeck = close ? new THREE.InstancedMesh(farPlank, wood, 34) : null;
      const tone = new THREE.Color();
      for (let k = 0; k < 34; k++) {
        const z = bz - 8.25 + k * .5;
        place.position.set(bx, yb, z);
        place.updateMatrix(); deck.setMatrixAt(k, place.matrix);
        // 携帯の簡単な板にも灰茶の木肌を残し、白い石の列に見せない。
        tone.setHex((k * 7) % 13 === 0 ? 0xd0b38a : 0xc6b18b);
        tone.multiplyScalar(.94 + ((k * 11) % 17) / 180); deck.setColorAt(k, tone);
        if (farDeck) {
          place.position.set(bx, yb, z); place.updateMatrix(); farDeck.setMatrixAt(k, place.matrix);
          farDeck.setColorAt(k, tone);
        }
      }
      deck.castShadow = deck.receiveShadow = true; deck.userData.camNear = true;
      if (farDeck) {
        farDeck.castShadow = farDeck.receiveShadow = true; farDeck.userData.camNear = true;
        const lod = new THREE.LOD(); lod.position.set(bx, yb, bz);
        deck.position.set(-bx, -yb, -bz); farDeck.position.copy(deck.position);
        lod.addLevel(deck, 0); lod.addLevel(farDeck, 42, .12); rt.scene.add(lod);
        F.sceneryResources.push(farPlank, farDeck);
      } else rt.scene.add(deck);
      const railGeo = new THREE.BoxGeometry(0.14, 0.12, 17);
      const postGeo = new THREE.BoxGeometry(0.16, 0.95, 0.16);
      const legGeo = new THREE.BoxGeometry(0.22, 1, 0.22);
      const ropeGeo = new THREE.TorusGeometry(0.12, 0.025, 4, 8);
      const ropeMat = new THREE.MeshStandardMaterial({ color:0xa18b61, roughness:1 });
      F.sceneryResources.push(plank, railGeo, postGeo, legGeo, ropeGeo, ropeMat);
      // 板の上面と同じ高さを歩く。両岸から短い坂でつなぐ。
      const top = yb + 0.11;
      addDeck({ x0: bx - 1.3, x1: bx + 1.3, z0: bz - 8.5, z1: bz + 8.5, y: top, name: '笙の川の橋' });
      addRamp({ ax: bx, az: bz - 10, bx, bz: bz - 8.5, w: 3.4, ya: W.heightAt(bx, bz - 10), yb: top });
      addRamp({ ax: bx, az: bz + 8.5, bx, bz: bz + 10, w: 3.4, ya: top, yb: W.heightAt(bx, bz + 10) });
      // 歩く坂と同じ上面の板を両岸へ渡す。見えない坂で馬を宙へ持ち上げない。
      const rampParts = [];
      for (const side of [-1, 1]) {
        const outerZ = bz + side * 10, innerZ = bz + side * 8.5;
        const outerY = W.heightAt(bx, outerZ);
        const shape = new THREE.BoxGeometry(3.4, 0.22, 1.5);
        const positions = shape.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const z = (outerZ + innerZ) / 2 + positions.getZ(i);
          const t = (z - outerZ) / (innerZ - outerZ);
          positions.setXYZ(i, bx + positions.getX(i), outerY + (top - outerY) * t + positions.getY(i) - 0.11, z);
        }
        shape.computeVertexNormals(); retreatSurface(shape, 0xad9674); rampParts.push(shape);
      }
      const rampShape = mergeGeometries(rampParts), rampMesh = new THREE.Mesh(rampShape, wood);
      for (const shape of rampParts) shape.dispose();
      rampMesh.castShadow = rampMesh.receiveShadow = true; rampMesh.userData.camNear = true;
      F.sceneryResources.push(rampShape); rt.scene.add(rampMesh);
      const waterDepth = W.waterDepthAt.bind(W);
      W.waterDepthAt = (x, z) => Math.abs(x - bx) <= 1.7 && Math.abs(z - bz) <= 10 ? 0 : waterDepth(x, z);
      const rails = [], ropes = new THREE.InstancedMesh(ropeGeo, ropeMat, 10);
      ropes.userData.camNear = true;
      // 継ぎ目の下に縦桁、橋脚の上に横桁を通す。欄干と同じ束で描く。
      for (const dx of [-1.4, 0, 1.4]) {
        const beam = new THREE.BoxGeometry(.23, .32, 17);
        beam.translate(bx + dx, yb - .27, bz); rails.push(beam);
      }
      for (const dz of [-8, -4, 0, 4, 8]) {
        const beam = new THREE.BoxGeometry(3.5, .24, .25);
        beam.translate(bx, yb - .55, bz + dz); rails.push(beam);
      }
      let ropeIndex = 0;
      for (const dx of [-1.55, 1.55]) {
        for (const h of [0.4, 0.85]) rails.push(railGeo.clone().translate(bx + dx, yb + h, bz));
        for (const dz of [-8, -4, 0, 4, 8]) {
          rails.push(postGeo.clone().translate(bx + dx, yb + 0.4, bz + dz));
          const bottom = W.heightAt(bx + dx, bz + dz) - 0.8, length = Math.max(0.4, yb - bottom);
          rails.push(legGeo.clone().scale(1, length, 1).translate(bx + dx, bottom + length / 2, bz + dz));
          place.position.set(bx + dx, yb + 0.82, bz + dz); place.rotation.set(Math.PI / 2, 0, 0); place.updateMatrix();
          ropes.setMatrixAt(ropeIndex++, place.matrix);
        }
      }
      const railShape = retreatSurface(mergeGeometries(rails), 0x88755b), railing = new THREE.Mesh(railShape, wood);
      for (const geo of rails) geo.dispose();
      F.sceneryResources.push(railShape, deck, ropes);
      rt.scene.add(railing, ropes);
      rt.marker('hashi', { x: bx, z: bz }, '笙の川の橋', { h: 3 });
      rt.scene.add(retreatNobori(rt, W, bx + 3, bz - 9, 'oda', 10), retreatNobori(rt, W, bx - 3, bz + 9, 'oda', 10));   // 橋を戦の初めの視界に（遠くから旗で分かる。A075）
      // 同じ四軒を橋から見える川南の在所へ寄せる。退き道と浅瀬は空ける。
      for (const [x, z, r, wall, roof] of [[30, 40, -.18, 0x79664e, 0x6b624b], [42, 48, .12, 0x685a46, 0x554e3d],
        [-32, 44, .2, 0x867359, 0x70614b], [-44, 56, -.12, 0x706049, 0x605947]]) {
        hut(W, x, z, 6, 4.5, r, { wall, roof, groundedHome:true, batch:homes });
        // 同じ家の庭先に残った荷。道・戸口と家の当たりはそのまま。
        addSacks(x + 4, z - 1, r, 2);
      }
      // 在所の低い庭柵。新しい陣は設けず、既存の家の庭先を示す。
      for (const seg of [[25,35,36,35],[25,35,25,43],[37,43,48,43],[48,43,48,51],
        [-39,39,-27,39],[-39,39,-39,47],[-50,51,-39,51],[-50,51,-50,59]]) {
        palisade(W,seg,{h:.95,lightFence:true,mound:false,noBrace:true,solid:false,batch:homes});
      }
    }
    // 金前寺周辺の小堂は板葺きの推定復元。現代の金崎宮や江戸期の堂を持ち込まない。
    hut(W, 24, -100, 4, 3, 0, { ita:true, minka:false, wall:0x66513b, roof:0x5a4c38,
      groundedHome:true, ...({boardRoof:true,boardRoofColors:KG_ROOF_COLORS,weatheredBoards:true}), batch:homes });
    finalizeSimpleBatch(rt, homes);
    retreatWayside(rt);
    retreatBaggage(rt, addSacks);
    kgSlopeLitter(rt);
    // 退く道の乱れ：崩れた俵、倒れた旗、捨てた荷
    for (const [x, z, r, n2] of [[2, 40, 0.8, 2], [-14, 78, -0.6, 3], [-30, 116, 1.2, 2], [-44, 138, 0.3, 1]]) addSacks(x + 3, z, r, n2);
    for (const [x, z, r] of [[-4, 52, 0.4], [-20, 92, -1.1], [-36, 124, 2.2]]) retreatDroppedFlag(rt, x, z, r);
    // 通れる道の両脇に、置き去りの荷駄を残す。
    const fallenSpots = [[-18, 62, 0.4], [-18, 96, -0.5], [-48, 126, 0.8], [-45, 150, -0.3]];
    retreatFallenHorses(rt, fallenSpots);
    for (const [x, z, r] of fallenSpots) addSacks(x + 2, z + 3, r, 2);
    const sackShape = mergeGeometries(sacks), sackMesh = new THREE.Mesh(sackShape, sackMaterial);
    for (const geo of sacks) geo.dispose();
    sackMesh.castShadow = sackMesh.receiveShadow = true; sackMesh.userData.camBlock = true;
    F.sceneryResources.push(sackShape); rt.scene.add(sackMesh);

    // ---- 大軍（軽い作り） ----
    // 平らな段でも、麓の道から外れた兵は見せない。追手を実兵へ替える
    // 八歩の幅とそろえる。主力は南の出口から先も歩いて退けるようにする。
    const armyRoads = [RETREAT_ROAD.concat([[-150, 256]]), HIKIDA_ROAD];
    const roadShader = armyRoads.map(road => road.slice(1).map((b, i) => {
      const a = road[i];
      return `kgRoad = min(kgRoad, kgRoadGap(aWF.xz, vec2(${a[0].toFixed(1)}, ${a[1].toFixed(1)}), vec2(${b[0].toFixed(1)}, ${b[1].toFixed(1)})));`;
    }).join('\n')).join('\n');
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => {
      // 同じ人数の三列を奥でつなぎ、前の列だけが孤立して見える隙間を埋める。
      // 描く兵だけの並びを替え、実兵へ替える数と寄せ口は保つ。
      const sonae = [0, 1, 2].map(i => ({
        count: Math.floor(count / 3) + (i < count % 3 ? 1 : 0),
        right: (i - 1) * 1.6, front: (i - 1) * d * 0.72,
        w: Math.min(w, 8) * (i === 1 ? 0.95 : 0.75), d: d * 0.95, kind: 'spear',
      }));
      const m = W.addDistantArmy({ x, z, w, d, count, facing, armor, kind: 'spear', mon: flag,
        team: flag === 'asakura' ? 1 : 0, host: false, sonae,
        flagRate: 0.25, flagTex: flagTexture(flag), seed });
      // 移動した先でも急斜面へ兵の壁を出さない。実兵へ替える時と同じ勾配。
      // 体・槍・旗は同じ足場で隠す。地形と材質は既存の物を使う。
      const mats = new Set();
      m.traverse(mesh => {
        const mat = mesh.material;
        if (!mat || mats.has(mat)) return;
        mats.add(mat);
        const compile = mat.onBeforeCompile, cacheKey = mat.customProgramCacheKey.bind(mat);
        mat.onBeforeCompile = (sh, renderer) => {
          compile.call(mat, sh, renderer);
          sh.vertexShader = `
            float kgRoadGap(vec2 p, vec2 a, vec2 b) {
              vec2 edge = b - a;
              float t = clamp(dot(p - a, edge) / dot(edge, edge), 0.0, 1.0);
              vec2 offset = p - a - edge * t;
              return dot(offset, offset);
            }
          ` + sh.vertexShader;
          // 歩く地面と同じ三角形を読む。四隅の補間で、切岸の途中に兵を浮かせない。
          sh.vertexShader = sh.vertexShader.replace(
            'return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);',
            `return t.x + t.y <= 1.0
              ? a + (b - a) * t.x + (c - a) * t.y
              : d + (c - d) * (1.0 - t.x) + (b - d) * (1.0 - t.y);`);
          sh.vertexShader = sh.vertexShader.replace('float aG = aTerrain(aWF.xz);', `float aG = aTerrain(aWF.xz);
            float kgRoad = 10000.0;
            ${roadShader}
            vArmyCover *= step(kgRoad, 64.0);
            vec2 kgSlope = vec2(aTerrain(aWF.xz + vec2(0.8, 0.0)) - aG,
              aTerrain(aWF.xz + vec2(0.0, 0.8)) - aG) / 0.8;
            vec2 kgBackSlope = vec2(aG - aTerrain(aWF.xz - vec2(0.8, 0.0)),
              aG - aTerrain(aWF.xz - vec2(0.0, 0.8))) / 0.8;
            vArmyCover *= step(max(length(kgSlope), length(kgBackSlope)), 0.55);`);
        };
        mat.customProgramCacheKey = () => cacheKey() + '_kg_road_triangle_footing';
      });
      return { m, x0: x, z0: z, x, z };
    };
    const OD = 0x2a2622;
    // 織田の主力：南の道を朽木の方へ退いていく（時とともに消える）
    F.main = [[-6, 46, 'oda'], [-20, 84, 'eiraku'], [-40, 128, 'oda'], [20, 64, 'oda'], [-4, 110, 'oda'], [-58, 158, 'eiraku']]
      .map(([x, z, f], i) => ({ ...DA(x, z, 14, 26, 200, Math.PI * 0.85, OD, f, 1571 + i), t: 0 }));
    // 主力の後ろに、荷駄（茶の小さな列）と手負いの兵（包帯の白っぽい列）が混じって遅れる
    F.main.push({ ...DA(-14, 60, 7, 22, 70, Math.PI * 0.85, 0x6a5a3c, 'oda', 1578), t: 0 }, { ...DA(-34, 104, 8, 18, 60, Math.PI * 0.85, 0x9a948a, 'oda', 1579), t: 0 });
    // 主力は殿が次に守る川岸より先へ。戦う兵の持ち場に軽い列を重ねない。
    F.main.forEach((a, i) => {
      a.m.army.kgRetreat = true;
      const q0 = 5 + i * 0.2, q = Math.floor(q0), f = q0 - q;
      moveDA(rt, a, ROAD[q][0] + (ROAD[q + 1][0] - ROAD[q][0]) * f, ROAD[q][1] + (ROAD[q + 1][1] - ROAD[q][1]) * f);
    });
    // 朝倉の大軍：北の峠道と東の疋田方面。湿地・城山の中に東の列を置かない。
    // 西の追手も麓の道へ寄せ、横幅を城山の急斜面へ広げない。
    // 北の先頭だけ麓へ寄せ、最初の打ち合いまで長く待たせない。
    F.host = [[6, -90, 18, 'asakura'], [-14, -150, 14, 'asakura'], [78, -24, 18, 'asakura']]
      .map(([x, z, w, f], i) => DA(x, z, w, 28, 300, i === 2 ? HIKIDA_FACING : 0, ASAKURA.armor, f, 1590 + i));
    rt.scene.traverse(mesh => {
      const map = mesh.material?.map;
      if (map === flagTexture('oda') || map === flagTexture('eiraku')) retreatFlag(rt, mesh, false);
      else if (map === flagTexture('asakura')) retreatFlag(rt, mesh, true);
    });
    // 東も近づけば同じ遠景から実兵へ替える。別口の兵を重ねない。
    // 浅井の離反は伝令の報。未確認の浅井本隊・義景を敦賀の目前へ置かない。

    buildBattleJin(rt);
    // 備え表との接続後に整える。鉄砲の混じる木下の槍組を横隊へ戻さない。
    for (const g of F.tono) {
      g.formation = g === F.kino || g === F.ikeda ? 'yari' : 'line';
      g.yariRanks = 3; settleRearguard(rt, g);
    }
    rt.world.setTime('day');
    rt.setPhase('brief');
    // 攻城から撤退へ：浅井の寝返りの知らせで、織田の陣は攻めの形から総崩れ気味の退き陣へ変わる
    rt.banner('浅井が離反、全軍退け', '朝倉の追手を止め、味方を逃がせ');
    messengerOrder(rt, F.kinoU, '伝令', '浅井備前守、朝倉方へ寝返りにござる！　退き道が危うい！');
    // 信長で遊ぶ時：殿を藤吉郎に任せ、旗本と若狭へ向かう道まで退く
    if (rt.G.lord) {
      rt.obj('main', '旗本を連れ、若狭への道へ退け', 'main');
      rt.marker('kutsuki', { x: KUTSUKI.x, z: KUTSUKI.z }, '若狭へ向かう道', { h: 2, guideAlways: true });
      rt.zone('kutsuki', KUTSUKI.x, KUTSUKI.z, KUTSUKI.r);
      rt.say('木下藤吉郎', '法螺貝と退き太鼓にござる！　追手はわしらが止めます、殿は若狭へ！', 4);
      rt.after(4, () => rt.say('織田信長', '藤吉郎、金ヶ崎に残れ。池田勝正と追手を止めよ', 3));
      rt.after(9, () => this.wave1(rt));
      F.t0 = 0;
      return;
    }
    rt.obj('main', HI(rt) ? '主力が退くまで、一手で追手を止めよ' : '主力が退くまで、一の備で追手を止めよ', 'main');
    rt.obj('stay', '一の備の旗へ進め', 'order');
    rt.marker('kino', unitPos(F.kinoU), '木下藤吉郎', { h: 3.2 });
    rt.marker('holdLine', L, L.mark, { h: 2, guideAlways: true, hideNear: L.r, hideOnArrival: true });
    rt.after(14, () => rt.unmark('kino'));
    rt.say('木下藤吉郎', 'わしらが殿じゃ。旗のそばで追手を止め、味方を逃がせ！', 4);
    rt.after(4, () => {
      if (F.ending || F.fleeing || F.step > 1) return;
      rt.say('木下藤吉郎', '追手へ槍を向けよ。退けの下知で、組と次の旗へ下がれ', 3);
    });
    rt.after(9, () => this.wave1(rt));
    F.t0 = 0;
  },

  // 主力の退去は内部の目安。足軽へ正確な残り秒を知らせない。
  retreatPct(rt) { return Math.min(100, Math.round((rt.flags.prog ?? rt.t) / RETREAT_T * 100)); },
  tickProg(rt, dt) {
    const F = rt.flags;
    F.prog = F.prog ?? 0;
    const cur = F.dpOn ? F.dp?.cur?.groups : F.step === 1 ? F.w1 : F.step === 3 ? F.w2 : F.step === 5 ? F.w3 : null;
    let cleared = !!cur && cur.length > 0;
    if (cur) for (const g of cur) if (!gone(g)) { cleared = false; break; }
    let k = F.breachT > 0 ? 0 : 1;
    // 段の後続・まだ出せない兵も含める。主力に敵が取り付いた間は進めない。
    if (!F.breachT && cleared && !F.pursuers.length && !F.dp?.cur?.waves?.length) k += 0.4;
    if (F.kino.count < F.kino.initial * 0.45) k -= 0.15;   // 損害での遅れは抑え、最後の合流の時間を残す。
    F.prog = Math.min(RETREAT_T, F.prog + dt * Math.max(0, k));
  },

  // ① 一の備：朝倉の先手
  wave1(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('l1');
    pursuitSignal(rt, { x: 6, z: -78 });
    rt.banner('朝倉勢、寄せ来る', '木の芽峠の道から、朝倉の先手');
    rt.say('明智光秀', '敵の早太鼓じゃ！　鉄砲組は槍の脇へ。味方越しに放つでないぞ', 3);
    rt.after(2.2, () => {
      if (!rt.over && !F.ending && F.step === 1) rt.army.playFar('eshout', F.w1[0].center(), 1);
    });
    rt.after(6, () => {
      if (rt.over || rt.G.lord || F.ending || F.fleeing || F.step !== 1 || F.dpOn) return;
      rt.say('木下藤吉郎', '旗のそばで槍をそろえ、追手を止めよ', 3);
    });
    F.w1 = [
      enemyGroup(rt, { faction: 'asakura', name: '朝倉の先手', anchor: { x: 6, z: -78 }, facing: 0, order: 'attack', seekRange: 90, aggro: 10, width: 14, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.65, speed: 2.6 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }, { type: 'bow', n: 1 }], ASAKURA)),
    ];
    rt.marker('w0', centerOf(F.w1[0]), () => `朝倉の先手・旗が見える`, { red: true, group: F.w1[0] });
    rt.after(14, () => {
      if (rt.over || F.ending || F.step !== 1) return;
      const g = enemyGroup(rt, { faction: 'asakura', name: '朝倉の東の追手', anchor: HIKIDA_FROM, facing: HIKIDA_FACING, order: 'attack', seekRange: 90, aggro: 10, width: 14, morale: 95, fleeDir: { x: 1, z: 0.3 }, dmgMult: 0.65, speed: 2.6 },
        dress([{ type: 'busho', n: 1, o: { name: '朝倉の侍大将', horse: true, hat: 'kabuto_m', haori: 0x5a4020 } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], ASAKURA));
      for (const u of g.units) if (u.type === 'busho') { u.announced = true; }
      F.w1.push(g);
      rt.say('足軽', '東にも朝倉の旗だわ！　横から来よるぞ！', 3);
      rt.marker('w1', centerOf(g), () => `朝倉の東の追手・旗が見える`, { red: true, group: g });
    });
  },

  // 段を重ねる（b_depth.js）：A 一の備の総掛かり → B 笙の川の渡り → C 狭路の追い討ち
  deep(rt, which) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true; F.dpOn = true;
    rt.objRemove('back'); rt.unzone('line'); rt.unmark('line'); rt.unmark('holdLine');
    for (const k of ['w0', 'w1', 'w2', 'w3', 'w4', 'w5']) rt.unmark(k);
        const after = () => {
      F.dpOn = false;
      if (F.ending || F.fleeing) return;
      if (F.dpMem?.kgFailed) { this.collapse(rt); return; }
      if (which === 'A') {
        if (F.cl) F.cl.rout('A', { hideAfter: 30, from: -1 });
        this.fallBack(rt, 1);
      } else if (which === 'B') this.fallBack(rt, 2);
      else this.collapse(rt);
    };
    if (which === 'A') this.lineClash(rt);
    depthStart(rt, kgCtx(rt), which === 'A' ? kgA() : which === 'B' ? kgB() : kgC(), after);
  },
  // 一の備の西の田で、殿の他の手と朝倉の大軍が組み合う（軽い作り）。寄せの厚みを見せる
  lineClash(rt) {
    const F = rt.flags;
    if (F.cl) return;
    F.cl = clash(rt, { x: -14, z: -74, facing: Math.PI, w: 16, gap0: 30, closeSpeed: 3.4, seed: 1577, noRout: true, killRate: 0.14, measuredMelee: true,
      surge: { k: 'B', every: 40, count: 140, flank: 0.35 },
      A: { flag: 'oda', armor: KIT.ARMOR.oda, count: 320, team: 0, faction: 'oda' },
      B: { flag: 'asakura', armor: ASAKURA.armor, count: 620, team: 1, faction: 'asakura', guns: true, flagRate: 0.5 } });
    F.cl.push('B', 0.3);
    rt.after(1, () => F.cl.go());
  },

  // 繰り引き：次の備まで退く（残った者が追ってくる）
  fallBack(rt, k) {
    const F = rt.flags;
    if (F.line >= k) return;
    F.line = k;
    F.step = k * 2;            // 2：二の備へ ／ 4：三の備へ
    F.stepT = rt.t;
    F.lineGatherAt = 0; F.lineGap = undefined; F.lineProgressAt = rt.t;
    F.lineWaitStart = undefined; F.lineWaitShown = false;
    rt.setPhase('back' + k);
    rt.unmark('w0'); rt.unmark('w1'); rt.unmark('w2'); rt.unmark('w3');
    rt.unmark('holdLine');
    const L = LINES[k];
    retreatSignal(rt);
    rt.banner('退け！', `${L.name}まで繰り引き`);
    battleEvent(rt, EVENT_RETREAT, L, F.kino, 0, true, `${L.name}へ退く`);
    messengerOrder(rt, rt.player.u, HI(rt) ? '使番' : '組頭', HI(rt) ? '木下殿の下知にござる！　一手を率い、次の備へ退かれよ！' : '退けとの下知じゃ！　組の者は次の備の旗へ続け！');
    rt.say('木下藤吉郎', k === 1 ? `法螺貝と退き太鼓じゃ！　笙の川の南へ退け！　${rt.G.lord ? '者ども' : nm(rt)}、遅れるな！` : '法螺貝と退き太鼓じゃ！　狭路へ退け、追手を受けるぞ！', 4);
    if (!rt.G.lord) {
      rt.objRemove('stay'); rt.objRemove('dp');
      rt.obj('main', '味方と次の備へ退け。斬り合いに残るな', 'main');
      // 下知と同時に、自分の組にも「ついて来い」
      for (const g of rt.squadGroups || []) if (g.count) g.order = 'follow';
      rt.obj('back', rt.squad.length ? `組を連れて${L.mark}へ退け` : `${L.mark}へ退け`, 'order');
      rt.zone('line', L.x, L.z, L.r);
      rt.marker('line', { x: L.x, z: L.z }, L.mark, { h: 2, guideAlways: true });
    }
    if (!rt.G.lord) kgPausePursuit(rt, LINES[k - 1] || LINES[0]);
    // 明智の鉄砲が先に下がって、次の備で待ち受ける
    const put = (g, dx, dz, f = Math.PI) => retreatGroup(rt, g, L.x + dx, L.z + dz, f, (g === F.akechi || g === F.gunsEast) ? 'line' : 'yari');
    put(F.akechi, 8, 9); put(F.gunsEast, 16, 9);
    rt.after(3, () => { put(F.ikeda, -8, 2); put(F.kino, 0, 0); });
    // 寄せ手の士気は下げない。殿が退いても敵は追う。
    // 自分が着くまで、退く札と印を保つ。信長の退きでは殿だけ先に進める。
    if (rt.G.lord) rt.after(k === 1 ? 4 : 3, () => (k === 1 ? this.wave2(rt) : this.wave3(rt)));
  },

  // ② 二の備：騎馬の追手が笙の川を渡ってくる
  wave2(rt) {
    const F = rt.flags;
    if (F.step !== 2 || F.ending) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('l2');
    if (!rt.G.lord) rt.obj('stay', '二の備で橋へ槍を向けよ', 'order');
    if (!rt.G.lord) rt.obj('main', '笙の川の南で騎馬の追手を止めよ', 'main');
    pursuitSignal(rt, { x: 4, z: -70 });
    rt.banner('追い討ち', '朝倉の騎馬が追ってくる');
    rt.say('池田勝正', '敵の早太鼓、馬が来る！　川を渡りきる所へ槍をそろえよ！', 3);
    const g = enemyGroup(rt, { faction: 'asakura', name: '朝倉の騎馬の追手', anchor: { x: 4, z: -70 }, facing: 0, order: 'attack', seekRange: 120, aggro: 12, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5, speed: 3.6 },
      dress([{ type: 'samurai', n: 1, o: { horse: true, hat: 'kabuto_m' } }, { type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 10 }], ASAKURA));
    const g2 = enemyGroup(rt, { faction: 'asakura', name: '朝倉の追手', anchor: { x: -30, z: -84 }, facing: 0, order: 'attack', seekRange: 120, aggro: 12, width: 12, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5, speed: 2.8 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], ASAKURA));
    F.w2 = [g, g2];
    rt.marker('w2', centerOf(g), () => `騎馬の追手・旗が見える`, { red: true, group: g });
    rt.marker('w3', centerOf(g2), () => `朝倉の追手・旗が見える`, { red: true, group: g2 });
  },

  // ③ 三の備：朝倉の後続
  wave3(rt) {
    const F = rt.flags;
    if (F.step !== 4 || F.ending) return;
    F.step = 5; F.stepT = rt.t;
    rt.setPhase('l3');
    if (!rt.G.lord) rt.obj('stay', '狭路を守れ。深追いするな', 'order');
    if (!rt.G.lord) rt.obj('main', '狭路で朝倉の後続を止めよ', 'main');
    pursuitSignal(rt, { x: -6, z: -10 });
    rt.banner('朝倉の後続', '主力が退ききるまで、狭路を守れ');
    rt.say('木下藤吉郎', '敵の早太鼓じゃ！　ここが最後の備、手負いが抜けるまで守れ！', 3);
    rt.after(5, () => {
      if (!F.ending && !F.fleeing && F.step === 5) rt.say('池田勝正', '池田の槍組、道を塞げ！　木下殿とともに退くぞ！', 3);
    });
    const g = enemyGroup(rt, { faction: 'asakura', name: '朝倉の後続', anchor: { x: -6, z: -10 }, facing: 0, order: 'attack', seekRange: 140, aggro: 12, width: 16, morale: 100, noRout: true, fleeDir: { x: 0.1, z: -1 }, dmgMult: 0.4, speed: 2.6 },
      dress([{ type: 'busho', n: 1, o: { name: '朝倉の侍大将', horse: true, hat: 'kabuto_w', haori: 0x4a3a1a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }], ASAKURA));
    for (const u of g.units) if (u.type === 'busho') { u.announced = true; }
    F.w3 = [g];
    // 苦しい戦：本隊の後ろから、もう一つの備が続いて狭路へ押し込む（大軍の厚み）
    rt.after(22, () => { if (F.ending || F.step !== 5) return;
    const g1b = enemyGroup(rt, { faction: 'asakura', name: '朝倉の二の備', anchor: { x: 14, z: -30 }, facing: 0, order: 'attack', seekRange: 140, aggro: 12, width: 14, morale: 95, noRout: true, fleeDir: { x: 0.1, z: -1 }, dmgMult: 0.6, speed: 2.6 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'bow', n: 2 }], ASAKURA));
    F.w3.push(g1b);
    rt.say('足軽', '敵の後ろに、まだ槍が並んどる……！', 2.5);
    rt.after(16, () => { if (!F.ending) g1b.noRout = false; });
    });
    rt.after(38, () => {
      if (F.step !== 5 || F.ending) return;
      const g2 = enemyGroup(rt, { faction: 'asakura', name: '朝倉の新手', anchor: { x: 30, z: 0 }, facing: -0.3, order: 'attack', seekRange: 140, aggro: 12, width: 12, morale: 75, fleeDir: { x: 0.2, z: -1 }, dmgMult: 0.42, speed: 2.8 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }], ASAKURA));
      F.w3.push(g2);
      rt.say('足軽', '東の畦にも敵がおる！　横へ回られるぞ！', 2.5);
      rt.marker('w5', centerOf(g2), () => `朝倉の新手・旗が見える`, { red: true, group: g2 });
    });
    rt.after(20, () => { if (!F.ending) g.noRout = false; });
    rt.marker('w4', centerOf(g), () => `朝倉の後続・旗が見える`, { red: true, group: g });
    // 数分の守備で昼夜を飛ばさない。谷の鉄砲は昼のまま受ける。
  },

  // 殿も残兵と退く。早く崩れた場合は、退けても任務失敗。
  collapse(rt) {
    const F = rt.flags;
    if (F.ending || F.fleeing) return;
    F.fleeing = rt.t;
    F.runnerNews = null;
    F.collapseCounts = kgFlagCounts(rt);
    F.exitReady = (F.prog || 0) >= RETREAT_T && !F.dpMem?.kgFailed;
    if (!F.exitReady && F.collapseWarnAt === undefined) rt.bark('備が持たぬ。残った組を集め、退き道へ急げ', true);
    if (F.dp) F.dp.on = false; F.dpOn = false;
    F.akechi.holdFire = false; F.gunsEast.holdFire = false;
    rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp');
    rt.setPhase('flee');
    if (!rt.G.lord) kgPausePursuit(rt, rt.player.u.pos);
    for (const k of ['w4', 'w5', 'line']) rt.unmark(k);
    rt.unzone('line');
    retreatSignal(rt);
    if (F.exitReady) rt.banner('殿も退け', '残った者を集め、若狭へ向かう道へ退け');
    else retreatFailure(rt, '主力が退ききるまで追手を止められなかった');
    rt.say('木下藤吉郎', F.exitReady ? '法螺貝と退き太鼓じゃ！　味方は抜けた、組をまとめて退け！' : '退き太鼓じゃ！　備が持たぬ……残った者を連れて退け！', 4.5);
    rt.objRemove('stay'); rt.objRemove('back'); rt.unmark('holdLine');
    // 元の任務の成否は記録に残し、画面は現在の生還の任務へ切り替える。
    rt.objRemove('main'); rt.objRemove('escape');
    rt.obj('main', F.exitReady ? 'しんがりを果たした。残る味方と若狭へ退け' : '追手を止めきれぬ。残る味方と道を南へ退け', 'main', true);
    rt.marker('kutsuki', { x: KUTSUKI.x, z: KUTSUKI.z }, '退き口・若狭への道', { h: 2, guideAlways: true });
    // 弓の追手も同じ朝倉の遠い列から歩いて来る。人数の上限は既存の処理を使う。
    enemyGroup(rt, { faction: 'asakura', name: '朝倉の弓の追手', anchor: { x: 8, z: LINES[F.line].z - 30 },
      facing: 0, order: 'attack', seekRange: 90, aggro: 12, width: 5, morale: 90, speed: 3.3, dmgMult: 0.4 },
    dress([{ type: 'bow', n: 4 }], ASAKURA));
    rt.zone('kutsuki', KUTSUKI.x, KUTSUKI.z, KUTSUKI.r);
    for (const g of rt.squadGroups || []) if (g.count) g.order = 'follow';
    // 四隊を同じ点へ押し込まない。道沿いに間を空け、着いたら短い備に戻す。
    // 北向きの長い縦隊で後列が場外へ伸び、合流できなくなるのを避ける。
    for (let i = 0; i < F.tono.length; i++) {
      const g = F.tono[i], z = KUTSUKI.z - 6 + (i === 3 ? -8 : i * 8);
      const a = z <= 150 ? ROAD[5] : ROAD[6], b = z <= 150 ? ROAD[6] : ROAD[7];
      const x = a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
      if (g && g.count && !g.routed) retreatGroup(rt, g, x, z, Math.PI, 'yari');
    }
  },
  fleeTick(rt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    const d = Math.hypot(p.x - KUTSUKI.x, p.z - KUTSUKI.z);
    const atExit = d < KUTSUKI.r;
    if (!!F.exitWaitShown !== atExit) {
      F.exitWaitShown = atExit;
      rt.obj('main', atExit ? '退き口で追手を止め、味方を待て'
        : F.exitReady ? '残る味方と若狭へ退け'
          : '追手を止めきれぬ。残る味方と道を南へ退け', 'main', true);
    }
    if (d >= KUTSUKI.r) F.exitWaitStart = undefined;
    else if (F.exitWaitStart === undefined) F.exitWaitStart = rt.t;
    if (rt.t >= (F.exitNoticeAt || 0)) {
      F.exitNoticeAt = rt.t + 1;
      let waiting = '';
      let gap = 0;
      for (let i = 0; i < 3; i++) {
        const u = i === 0 ? F.kinoU : i === 1 ? F.akeU : F.ikedaU;
        const name = i === 0 ? '藤吉郎' : i === 1 ? '光秀' : '池田勝正';
        const distance = Math.hypot(u.pos.x - KUTSUKI.x, u.pos.z - KUTSUKI.z);
        if (u.alive && !u.gone) gap += Math.max(0, distance - 30);
        if (waiting) continue;
        if (!u.alive) { waiting = `${name}は討たれた。残った組を集めよ`; continue; }
        // 合流判定の範囲までの距離を示す。旗の中心まで歩く必要はない。
        if (distance >= 30) waiting = `${name}${u.woundOut ? 'は深手' : 'が退いてくる'}。合流まで約${Math.ceil((distance - 30) / .75)}歩。来た道を守れ`;
      }
      let near = 0, alive = 0, initial = 0;
      for (const g of F.tono) initial += g.initial || 0;
      for (const g of rt.squadGroups) initial += g.initial || 0;
      for (const g of F.tono) for (const u of g.units) if (kgActive(u)) {
        alive++; if (Math.hypot(u.pos.x - KUTSUKI.x, u.pos.z - KUTSUKI.z) < 30) near++;
        gap += Math.max(0, Math.hypot(u.pos.x - KUTSUKI.x, u.pos.z - KUTSUKI.z) - 30);
      }
      for (const g of rt.squadGroups) for (const u of g.units) if (kgActive(u)) {
        alive++; if (Math.hypot(u.pos.x - KUTSUKI.x, u.pos.z - KUTSUKI.z) < 30) near++;
        gap += Math.max(0, Math.hypot(u.pos.x - KUTSUKI.x, u.pos.z - KUTSUKI.z) - 30);
      }
      // 成功に要る兵を失った後も、届かない成功判定を待ち続けさせない。
      // 生還は残兵との合流で決め、任務失敗を勝利へ変えない。
      if (F.exitReady && (alive < Math.ceil(initial * 0.25) || !F.kinoU.alive || !F.akeU.alive || !F.ikedaU.alive)) {
        F.exitReady = false;
        F.escapeFailure = '退く途中で殿が崩れ、味方を守りきれなかった';
        retreatFailure(rt, F.escapeFailure);
        rt.objRemove('main'); rt.obj('main', '追手を止めきれぬ。残る味方と道を南へ退け', 'main', true);
      }
      F.exitWaiting = waiting || (near < (F.exitReady ? Math.ceil(alive * 0.6) : alive) ? `退き口の味方 ${near}／${alive}人・組を呼べ` : F.exitReady ? '組はそろった。三将の旗を待て' : '残った組はそろった。退け');
      // 近づいている間は待つ。道で止まった味方を無期限に待たせない。
      if (F.exitGap === undefined || gap < F.exitGap - 1) { F.exitGap = gap; F.exitProgressAt = rt.t; }
    }
    rt.objProgress('main', d < KUTSUKI.r ? F.exitWaiting : `若狭への道まで あと${Math.ceil(retreatDistance(rt, KUTSUKI) / .75)}歩`);
    if (d < KUTSUKI.r && this.escortReady(rt) && (F.exitReady || rt.t - F.fleeing >= 15)) {
      rt.unmark('kutsuki'); rt.unzone('kutsuki');
      if (F.exitReady) this.win(rt, '残った味方と、若狭へ向かう道へ退いた');
      else {
        F.escaped = true; rt.objDone('main');
        this.lose(rt, F.escapeFailure || '味方が退ききる前に備が崩れた。残る者と退いたが、追手は止めきれなかった');
      }
      return;
    }
    // 合流を時間だけで成功にしない。旗の下で一分待ち、四十五秒進まなければ敗北の決着へ。
    if (F.exitWaitStart !== undefined && rt.t - F.exitWaitStart >= 60 && rt.t - F.exitProgressAt >= 45) {
      this.lose(rt, '残る味方が退き口へ届かず、殿をまとめて退けなかった');
      return;
    }
    // 少しずつ進む味方や、旗へ出入りする本人で待ち時間を延ばし続けない。
    // 合流できなかった時は敗北で終え、時間だけで成功にはしない。
    if (rt.t - F.fleeing >= 150) {
      this.lose(rt, d < KUTSUKI.r ? '味方との合流が間に合わず、殿をまとめて退けなかった'
        : '追手に退き道を押さえられ、残る味方と退き口へ届かなかった');
      return;
    }
    // 合流が長引く時は、退き口でも追手へ備える下知を先に知らせる。
    if (rt.t - F.fleeing >= 85 && !F.exitLateWarn) {
      F.exitLateWarn = true;
      rt.bark(atExit ? '追手が迫る。来た道へ槍を向け、残った組を呼べ' : '退き道へ急げ。残った組を呼び、旗の下へ集まれ', true);
    }
  },
  // 退き口に着けぬまま、朝倉に呑まれた
  lose(rt, sub = '朝倉勢が狭路を抜け、退く主力の背に追いすがった') {
    // 主力への突破、持ち場への退き遅れ、残兵の合流で結末を出す。
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    if (!F.escaped) rt.objFail('main');
    for (const id of ['dp', 'back', 'stay', 'escape']) {
      const task = rt.orderObjectives?.get(id) || rt.objectives.find((o) => o.id === id);
      if (task && !task.state) rt.objFail(id);
    }
    if (F.dp) F.dp.on = false; F.dpOn = false;
    for (const id of ['dp', 'line', 'holdLine', 'w4', 'w5', 'kutsuki']) { rt.unmark(id); rt.unzone(id); }
    F.akechi.holdFire = false; F.gunsEast.holdFire = false;
    rt.tracker.main = false;
    if (F.failureShown) rt.banner('しんがりの戦、終わる', sub);
    else retreatFailure(rt, sub);
    rt.say('木下藤吉郎', F.escaped ? '残る者は退いたか。手負いを支え、先へ進め！' : '……ここまでか。散れ、散って生き延びよ！', 4);
    rt.finish({ scriptedEnd: true, failureReason: sub, retreatCounts: F.collapseCounts || kgFlagCounts(rt) }, 9);
  },

  // 退き口成る
  win(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const k of ['w4', 'w5', 'line']) rt.unmark(k);
    rt.unzone('line');
    rt.objDone('main');
    if (!F.strayed) rt.objDone('stay');
    rt.tracker.main = true;
    F.prog = RETREAT_T;
    rt.award((t) => { t.main = true; t.special = { label: '金ヶ崎の殿を務めた', pts: 25 }; }, '退き口成る');
    survival(rt, '金ヶ崎のしんがりを生き延びた');
    sfx('horagai', 0.8);
    rt.banner('退き口成る', how);
    rt.say('木下藤吉郎', `${nm(rt)}、よう守った。手負いを支え、皆で帰るぞ`, 3);
    this.epilogue(rt);
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 11);
  },

  // 史実の帰京と、次の姉川を間をあけた一言で残す。
  epilogue(rt) {
    rt.after(4, () => rt.say('', '四月晦日、信長は朽木を越えて京へ帰った', 3));
    rt.after(7.5, () => rt.say('', '兵を立て直し、六月。次の戦場は姉川へ', 3));
  },

  update(rt, dt) {
    const F = rt.flags;
    F.clothTime.value = rt.world.time;
    F.clothWind.value = Math.min(1.8, WIND_STATE.gust);
    F.clothMotion.value = S.reduceMotion ? 0 : 1;
    const p = rt.player.u.pos;
    KIT.backTick(rt);
    if (!F.ending) this.tickProg(rt, dt);
    pursuersTick(rt);
    retreatFieldTick(rt);
    kgStragglers(rt);
    // 近づいて実兵になった主力も、殿へ反転せず道を退く。
    for (const g of rt.army.groups) {
      if (g.kgMarch) continue;
      for (const u of g.units) if (u.wkFrom?.A.kgRetreat) {
        g.kgMarch = true; retreatGroup(rt, g, -70, 174, Math.PI, 'column'); break;
      }
    }
    woundedRetreatTick(rt);
    messengerTick(rt);
    const pct = this.retreatPct(rt);
    // 織田の主力：道を南西へ退き、朽木の方で見えなくなる
    const k = pct / 100;
    for (let i = 0; i < F.main.length; i++) {
      const a = F.main[i];
      const t = Math.min(1, Math.max(0, k * 1.4 - i * 0.05));
      const pathT = (5 + i * 0.2) + (ROAD.length - 1 - (5 + i * 0.2)) * t;
      const q = Math.min(ROAD.length - 2, Math.floor(pathT)), f = pathT - q;
      moveDA(rt, a, ROAD[q][0] + (ROAD[q + 1][0] - ROAD[q][0]) * f, ROAD[q][1] + (ROAD[q + 1][1] - ROAD[q][1]) * f);
      if (t >= 1) {
        const exitT = a.exitT = (a.exitT || 0) + dt;
        moveDA(rt, a, ROAD[ROAD.length - 1][0] - exitT * 2, ROAD[ROAD.length - 1][1] + exitT * 2);
        // 目の前で列を消さない。道を歩いた位置のまま見通しへ任せる。
        a.m.visible = true;
      }
    }
    // 北の列は南へ、東の列は湿地の南から西へ。殿の実兵の列へ遠景を重ねない。
    for (let i = 0; i < F.host.length; i++) {
      const a = F.host[i];
      if (i === 2 && !F.fleeing) {
        const t = Math.min(1, rt.t / 32);
        moveDA(rt, a, a.x0 + (28 - a.x0) * t, a.z0 + (-38 - a.z0) * t);
        continue;
      }
      // 見続けても寄せは止まらない。列ごと道へ寄り、殿の北から追う。
      const speed = F.fleeing ? 3.3 : 1.8;
      const z = Math.min(F.fleeing ? Math.max(LINES[F.line].z - 42, p.z - 22) : LINES[F.line].z - 42, a.z + dt * speed);
      let x = a.x;
      for (let j = 0; j < ROAD.length - 1; j++) {
        const b = ROAD[j], c = ROAD[j + 1];
        if (z < b[1] || z > c[1]) continue;
        const lane = b[0] + (c[0] - b[0]) * (z - b[1]) / (c[1] - b[1]) - (i === 1 && !F.fleeing ? 8 : 0);
        x += Math.max(-dt * speed, Math.min(dt * speed, lane - x));
        break;
      }
      moveDA(rt, a, x, z);
    }
    if (F.ending || !rt.player.u.alive) return;
    if (!F.woundAdvice && rt.player.u.hp < rt.player.u.maxHp * 0.55) {
      F.woundAdvice = true; rt.bark('傷が深いぞ。追手に槍を向け、味方の備へ下がれ', true);
    }
    // 主力の列へ追手が取り付いたままなら、時間だけで退去を成功にしない。
    let caught = false;
    for (const u of rt.army.units) {
      if (!u.alive || u.team !== 1 || u.fleeing || u.woundOut || u.noTarget) continue;
      for (const a of F.main) if (a.m.visible && Math.hypot(u.pos.x - a.x, u.pos.z - a.z) < 9) { caught = true; break; }
      if (caught) break;
    }
    F.breachT = caught ? (F.breachT || 0) + dt : 0;
    if (!rt.G.lord && caught && !(F.breachWarnAt > rt.t)) { F.breachWarnAt = rt.t + 8; rt.bark('追手が主力の列へ！　味方と退き道を守れ！', true); }
    if (!rt.G.lord && !F.fleeing && F.breachT > 23) { this.lose(rt, '追手が主力の列へ取り付き、退き道を守れなかった'); return; }
    if (rt.G.lord) { this.lordTick(rt, dt); return; }
    if (F.fleeing) { this.fleeTick(rt); return; }
    let ready = 0;
    for (const g of F.tono) for (const u of g.units) if (kgActive(u)) ready++;
    const initial = F.kino.initial + F.ikeda.initial + F.akechi.initial + F.gunsEast.initial;
    F.rearguardReady = ready; F.rearguardInitial = initial;
    // 急な大損害でも、知らせてから十五秒は立て直す猶予を残す。
    if (ready < Math.ceil(initial * 0.4) && F.collapseWarnAt === undefined) {
      F.collapseWarnAt = rt.t;
      const withdrawing = F.step === 2 || F.step === 4;
      rt.bark(withdrawing
        ? `備が崩れかけている。${LINES[F.line].mark}の旗へ退け。味方と合流せよ`
        : '備が崩れかけている。味方の槍列の後ろで追手を止めよ', true);
    }
    if (ready < Math.ceil(initial * 0.25)) {
      if (rt.t - F.collapseWarnAt >= 15) { this.collapse(rt); return; }
    } else if (ready >= Math.ceil(initial * 0.4)) F.collapseWarnAt = undefined;
    // 開幕は向かう旗を示し、着いたら守る下知へ替える。段や使番を増やさない。
    if (!F.dpOn && !F.strayed && F.step <= 1) {
      const reached = rt.distTo(LINES[0]) < LINES[0].r + (F.firstLineReached ? 2 : 0);
      if (F.firstLineReached !== reached) {
        F.firstLineReached = reached;
        rt.obj('stay', reached ? '一の備で合図を待て' : '一の備の旗へ進め', 'order', true);
        if (reached) rt.objProgress('stay', '味方の槍列で追手を待て');
      }
    }
    // 敵の歩み（約毎秒二〜三歩）を見て、斬り合いより十秒ほど前に構えを促す。
    if (!(F.guardScanAt > rt.t) && F.step % 2 === 1) {
      F.guardScanAt = rt.t + 0.5;
      if (F.guardWarnLine !== F.line && rt.army.nearestEnemy(rt.player.u, 34, u => kgActive(u) && !u.isStruct && u.type !== 'dummy')) {
        F.guardWarnLine = F.line;
        rt.bark('敵が寄せる。槍を構えよ。味方の槍の列の後ろで迎え撃て', true);
      } else if (!F.enemyVoice[F.line]) {
        // 実際に近くへ来た無名の将だけが叫ぶ。史料で不明な将名を補わない。
        const foe = rt.army.nearestEnemy(rt.player.u, 24, u => kgActive(u) && u.type === 'busho');
        if (foe && sightPoint(rt, foe.pos)) {
          F.enemyVoice[F.line] = true;
          rt.say(foe.name, F.line === 0 ? '横の道へ回れ！　織田の退き道を断て！' : '殿を押し崩せ！　退く織田を逃がすな！', 2.8);
        }
      }
    }
    depthTick(rt, dt);
    if (F.fleeing || F.ending) return;
    if (F.dpOn) {
      // 大損害の判定は段の間も共通して行う。
      const tono = F.kino.count + F.ikeda.count, tono0 = F.kino.initial + F.ikeda.initial;
      if (tono <= Math.round(tono0 * 0.4) && !F.tonoWarn) { F.tonoWarn = true; rt.bark('しんがりが崩れかけている！　踏みとどまれ！', true); }
      rt.objProgress('main', F.breachT > 0 ? '追手が味方に迫る。退き道を守れ' : F.kino.count < F.kino.initial * 0.45 ? '殿が崩れかけている。旗のそばを守れ' : '主力が退くまで追手を止めよ。退けの下知を待て');
      return;
    }
    if (F.step !== 2 && F.step !== 4) rt.objProgress('main', '主力が退くまで備を守れ。退く合図を待て');
    // 持ち場を離れて北へ深追いしたか
    const L = LINES[F.line];
    const ahead = L.z - p.z;
    if ((F.step === 1 || F.step === 3 || F.step === 5) && ahead > 38 && !F.strayed) {
      F.strayT = (F.strayT || 0) + dt;
      if (F.strayT > 4) { F.strayed = true; rt.violation('殿の持ち場を離れて深追いした', ['木下藤吉郎', '旗へ戻れ！　追手を引き受けるのが殿じゃ。首を追うでない！']); rt.objFail('stay'); }
    } else F.strayT = 0;
    // 退く途中：自分が次の備に着いたか
    if (F.step === 2 || F.step === 4) {
      const d = Math.hypot(p.x - L.x, p.z - L.z);
      lineGather(rt, L);
      if (d < L.r) {
        if (F.lineWaitStart === undefined) F.lineWaitStart = rt.t;
        if (!F.lineWaitShown) {
          // 本人が旗へ着いた事は、その場で分かる。使番の到着を待たない。
          rt.obj('main', `${L.mark}で来た道を守れ`, 'main', true);
          rt.obj('back', `${L.mark}で来た道の追手を止めよ`, 'order', true);
          F.lineWaitShown = true;
        }
        rt.objProgress('main', F.lineWaiting || '組と旗の下で追手を止めよ');
      } else {
        F.lineWaitStart = undefined;
        if (F.lineWaitShown) {
          rt.obj('main', '味方と次の備へ退け。斬り合いに残るな', 'main', true);
          rt.obj('back', rt.squad.length ? `組を連れて${L.mark}へ退け` : `${L.mark}へ退け`, 'order', true);
          F.lineWaitShown = false;
        }
      }
      rt.objProgress('back', d < L.r ? F.lineWaiting || '組と旗の下で追手を止めよ' : `次の備まで あと${Math.ceil(retreatDistance(rt, L) / .75)}歩。組と退け`);
      if (d < L.r && !F['in' + F.line] && F.lineReady) {
        F['in' + F.line] = true;
        rt.objDone('back'); rt.objRemove('back'); rt.unzone('line'); rt.unmark('line');
        rt.award((t) => t.side.push(`${L.name}へ退いた`), `${L.name}へ退いた`);
        rt.say('木下藤吉郎', '備を立て直せ。槍先を追手へ向けよ！', 2.5);
        if (F.line === 1) this.wave2(rt); else this.wave3(rt);
        return;
      }
      if (rt.t - F.stepT > 90 && d >= L.r) { this.lose(rt, '次の備へ退けず、朝倉の追手に退き道を断たれた'); return; }
      // 旗に着いた本人を退き遅れにしない。合流が止まった場合は実際の理由で決着する。
      if (F.lineWaitStart !== undefined &&
        (rt.t - F.lineWaitStart > 60 && rt.t - F.lineProgressAt > 45 || rt.t - F.lineWaitStart > 150)) {
        this.lose(rt, '次の備に味方が集まらず、殿を立て直せなかった'); return;
      }
      if (rt.t - F.stepT > 30 && d > L.r + 20 && !(F.lateT > rt.t)) {
        F.lateT = rt.t + 12;
        rt.bark(`${L.name}へ急げ！　取り残されるぞ`, true);
        // 取り残されると組の士気が落ち、藤吉郎が使番をよこして呼び戻す
        for (const g of rt.squadGroups || []) g.morale = Math.max(10, (g.morale || 0) - 8);
        if (!F['late' + F.line]) { F['late' + F.line] = true; messengerOrder(rt, rt.player.u, '使番', HI(rt) ? `木下様より！　${nm(rt)}殿、預かった手を連れて早う退け！` : '木下様より退けとの下知！　組頭の旗について下がれ！'); }
      }
    }
    if (F.step === 1) {
      const all = F.w1.filter((g) => !gone(g));
      if ((F.w1.length >= 2 && !all.length) || rt.t - F.stepT > 28) this.deep(rt, 'A');
      // 東の追手。隊が弱れば崩れて退く
      if (F.w1[1] && !F.w1[1].kgPending && F.w1[1].count < 7) { F.w1[1].noRout = false; F.w1[1].morale = Math.min(F.w1[1].morale, 20); }
    }
    if (F.step === 3) {
      if (F.w2.every(gone) || rt.t - F.stepT > 22) this.deep(rt, 'B');
    }
    if (F.step === 5) {
      rt.objProgress('main', '追手を通すな。退けの下知を待て');
      // 追手の本隊。隊が弱れば崩れて退く
      if (!F.w3[0].kgPending && F.w3[0].count < 8) { F.w3[0].noRout = false; F.w3[0].morale = Math.min(F.w3[0].morale, 20); }
      // 本隊の寄せを凌いだら（あるいは長く持ちこたえたら）、狭路の追い討ちの段へ。済めば退き口成る
      if ((F.w3more && !F.w3pending && F.w3.every(gone)) || rt.t - F.stepT > 40) this.deep(rt, 'C');
      else if (F.w3.length >= 2 && F.w3.every(gone) && !F.w3more) {
        // 早く崩しすぎたら、もう一押しが来る
        F.w3more = true; F.w3pending = true;
        rt.after(6, () => {
          F.w3pending = false;
          if (F.ending || F.step !== 5 || F.dpOn) return;
          const g = enemyGroup(rt, { faction: 'asakura', name: '朝倉の後続', anchor: { x: 0, z: -20 }, facing: 0, order: 'attack', seekRange: 140, aggro: 12, width: 12, morale: 75, fleeDir: { x: 0, z: -1 }, dmgMult: 0.45, speed: 2.8 },
            dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 2 }], ASAKURA));
          F.w3.push(g);
          rt.say('木下藤吉郎', '怯むな！　後ろの味方を追手に渡すでないぞ！', 3);
        });
      }
    }
  },

  // 信長で遊ぶ時：殿の戦いは後ろで続き、信長は旗本と若狭へ向かう道へ退く。追手の騎馬が道を追ってくる
  lordTick(rt, dt) {
    const F = rt.flags, p = rt.player.u.pos;
    const d = Math.hypot(p.x - KUTSUKI.x, p.z - KUTSUKI.z);
    rt.objProgress('main', d < KUTSUKI.r ? '残った旗本を待て' : `退き道まで あと${Math.ceil(retreatDistance(rt, KUTSUKI) / .75)}歩`);
    if (d >= KUTSUKI.r || !this.escortReady(rt, true)) return;
    F.ending = true;
    rt.setPhase('end'); rt.unmark('kutsuki'); rt.unzone('kutsuki');
    rt.objDone('main'); rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '旗本と若狭へ退いた');
    rt.banner('若狭へ退く', '若狭の山道から朽木を経て、京へ向かう');
    this.epilogue(rt);
    rt.player.u.invuln = true; rt.finish({ scriptedEnd: true }, 11);
  },

  escortReady(rt, lord = false) {
    const F = rt.flags;
    let initial = 0, alive = 0, near = 0;
    for (let side = 0; side < 2; side++) {
      const groups = side === 0 ? (lord ? rt.squadGroups : F.tono) : (lord ? null : rt.squadGroups);
      if (!groups) continue;
      for (const g of groups) {
        initial += g.initial || 0;
        for (const u of g.units) if (kgActive(u)) {
          alive++;
          if (Math.hypot(u.pos.x - KUTSUKI.x, u.pos.z - KUTSUKI.z) < 30) near++;
        }
      }
    }
    // 任務失敗後は残兵全員の合流を待つ。七人残れば七人を集める。
    if (!lord && !F.exitReady) return near === alive;
    if (!lord && (alive < Math.ceil(initial * 0.25) || !F.kinoU.alive || !F.akeU.alive || !F.ikedaU.alive)) return false;
    // 殿の大将の藤吉郎は退き口まで。光秀・池田は後ろの道の上（六十歩内）まで来ていれば合流とみなす
    //   （鉄砲組が道の折れで引っかかり、三将そろうのを待って毎回負けた。10/28 bot）
    return alive > 0 && near >= Math.ceil(alive * 0.6) && (lord || (Math.hypot(F.kinoU.pos.x - KUTSUKI.x, F.kinoU.pos.z - KUTSUKI.z) < 30 && Math.hypot(F.akeU.pos.x - KUTSUKI.x, F.akeU.pos.z - KUTSUKI.z) < 60 && Math.hypot(F.ikedaU.pos.x - KUTSUKI.x, F.ikedaU.pos.z - KUTSUKI.z) < 60));
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    const L = LINES[F.line];
    // 深追いの首取りではなく、旗を守った自分と組の働き。各備で一度だけ。
    if (!rt.G.lord && !F.ending && !F.fleeing && F.step % 2 === 1 && !F.breachT &&
      v.team === 1 && !v.isStruct && !v.civ && k && (k.isPlayer || k.isSub) &&
      Math.hypot(rt.player.u.pos.x - L.x, rt.player.u.pos.z - L.z) < L.r + 8 &&
      Math.hypot(v.pos.x - L.x, v.pos.z - L.z) < L.r + 12 && !F.meritDone[F.line]) {
      F.lineMerit[F.line]++;
      if (F.lineMerit[F.line] >= 3) {
        const line = F.line;
        F.meritDone[line] = true;
        // 追手を押し返した間に列が進む。三つの備でも合計二十四秒まで。
        F.prog = Math.min(RETREAT_T, (F.prog || 0) + 8);
        rt.award(t => t.side.push(`${L.mark}で退く味方を守った`), '退く味方を守った');
        rt.after(1.5, () => {
          if (F.ending || F.fleeing || F.line !== line || F.step % 2 !== 1) return;
          rt.say(line === 1 ? '池田勝正' : '木下藤吉郎', line === 0 ? 'よう止めた！　その間に荷駄の列が進んだぞ' : line === 1 ? '川岸を守ったな！　手負いの列が先へ進んだぞ' : '追手を押し返したぞ！　最後の列が山道へ進む！', 3);
        });
      }
    }
    if (v.type === 'busho' && v.team === 1) {
      if (!(k && k.isPlayer)) rt.banner(`${v.name}、討死`, '追手の旗が倒れた');
      if (v.group) { v.group.noRout = false; v.group.morale -= 35; }
    }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (rt.over || F.ending || !sightPoint(rt, g.center()) || g.team !== 1 || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    g._routSaid = true; rt.flags.routSayT = rt.t + 8;   // 隊ごとに一度・間を 8 秒（崩れて立て直す隊が同じ一言を繰り返さない。10/2）
    rt.say('足軽', `${g.name}が逃げよるぞ！`, 2.5);
  },
};

// 殿と追手の配分は仮の目安。見える兵の死傷を全軍へ固定倍率で掛けない。
kanegasaki.force = () => ({ a: 3000, a0: 3000, b: 16000, b0: 16000 });
kanegasaki.sides = { a: { name: '織田軍のしんがり', mon: 'oda' }, b: { name: '朝倉の追手', mon: 'asakura' } };
kanegasaki.famous = [];
// 殿は追手を止めて退く。首取りの札と案内を出さず、証人のある働きは残す。
kanegasaki.uchisute = true;
kanegasaki.date = () => '元亀元年四月の退き口';
kanegasaki.canSkip = (rt) => rt.phase === 'brief' && rt.t > 3 ? '朝倉の寄せまで待つ' : '';
kanegasaki.skip = (rt) => { if (rt.phase === 'brief' && !rt.over && !rt.flags.ending) kanegasaki.wave1(rt); };
kanegasaki.history = '元亀元年四月、織田信長は越前の朝倉義景を攻め、手筒山城を攻め落とし、金ヶ崎城を降参させた。ところが妹・お市の夫である北近江の浅井長政が朝倉方につき、織田勢は前後を挟まれる形になった。信長はわずかな供で朽木越えに京へ逃れた。信長公記は金ヶ崎に木下藤吉郎を残したと記し、同時期の一色藤長書状は、伝聞として明智光秀・池田勝正らが後衛を務めたと伝える（金ヶ崎の退き口）。殿が細い道で鉄砲を使って追手を止めたとも言われるが、細かな布陣は確かではない。お市が両端を縛った小豆の袋を送って危うさを知らせたという話は、後の書物に出るもので確かではない。この戦の後、信長は兵を立て直し、六月に姉川で浅井・朝倉と戦った。追いすがった朝倉の将の名は伝えによって違い、この戦では無名の侍大将とする。局地の三つの備、笙の川の橋と渡り、谷の射撃、昼の景色と風は復元であり、当日の記録ではない。浅井の離反は知らせで扱い、敦賀で浅井本隊と直接戦ったとは断定しない。地点の間隔を縮めており、最後の退き道は若狭方面への出口で、朽木谷そのものではない。信長は朽木の案内で谷を越え、四月晦日に京へ入った。';

// 素直な遊び手：持ち場の備のそばで寄せ手を突き、「退け」の下知が出たら次の備へ走る
// 下知が出たら追手との斬り合いに居残らず、味方と同じ道を退く。
// 道の少し先を選び、川や谷の曲がりを直線で横切らない。
function botRetreat(b, inp, goTo, goal, radius) {
  const p = b.player, u = p.u;
  const way = retreatWay(b, goal);
  const x = way.x, z = way.z, r = x === goal.x && z === goal.z ? radius : 1;
  inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false;
  // 遠い敵への狙いで歩く向きを戻されず、次の旗への道順を保つ。
  if (p.lock) inp.e.add('KeyQ');
  goTo(p, inp, x, z, r);
  const walking = inp.k.has('KeyW');
  const walkYaw = p.yaw;
  // 近くにいるだけの追手には背を向けて退く。実際に届く刃だけを受け、
  // 味方と戦っている敵のそばで構え続けて退き遅れない。
  const foe = b.army.nearestEnemy(u, 6, (o) => kgActive(o) &&
    o.type !== 'gun' && o.type !== 'bow' && Math.abs(o.pos.y - u.pos.y) < 3 &&
    (o.atk?.target === u || o.swing?.target === u || o.target === u &&
      Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= (o.reach || 2.8) + 1) &&
    !b.army.wallBetween(u.pos, -1, o.pos, false));
  inp.runHeld = !foe && walking;
  if (!foe) return;
  p.yaw = Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
  inp.guardHold = true;
  inp.k.delete('KeyW');
  if (!walking) return;
  // 八方向へ丸めると、長い退き道で斜面へ逸れる。構えた向きから見た
  // 棒の向きを正確に渡し、障害を避ける goTo の向きもそのまま保つ。
  const axis = b.flags.retreatAxis || (b.flags.retreatAxis = { x: 0, y: 0 });
  axis.x = -Math.sin(walkYaw - p.yaw); axis.y = -Math.cos(walkYaw - p.yaw);
  inp.axis = axis;
}

kanegasaki.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
  if (!u.alive || F.ending) return;
  if (F.fleeing || b.G.lord) { botRetreat(b, inp, goTo, KUTSUKI, 6); return; }
  const L = LINES[F.line];
  // 近い打ち手へ向き直る共通の頭は、持ち場の外へも踏み込む。
  // 金ヶ崎では旗から離れたら構えて戻る。手当てと気力の退避は保つ。
  const resting = F.dp?.on && (F.dpBack || p.sta < p.maxSta * 0.22 ||
    u.hp < u.maxHp * 0.5 && p.treatmentLeft > 0 && !p.bandaged);
  const offRoad = b.world.slopeTan(u.pos.x, u.pos.z) > 0.55 || distToPolyline(u.pos.x, u.pos.z, ROAD) > 8;
  // 気力を休める間も、山腹や道の外には留まらない。平地へ戻ってから休む。
  if (F.step % 2 === 1 && (offRoad || !resting && Math.hypot(u.pos.x - L.x, u.pos.z - L.z) > L.r + 2)) {
    botRetreat(b, inp, goTo, L, offRoad ? 3 : L.r - 3);
    return;
  }
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  // 退く途中は、まず次の備へ
  // 一度到着しても合流待ちの段では旗を離れない。追手を探して山腹へ戻らない。
  if (F.step === 2 || F.step === 4) {
    botRetreat(b, inp, goTo, L, 3);
    return;
  }
  // 傷は自然には戻らない。手当てを使い終えたら、持ち場へ戻る。
  const canTreat = p.treatmentLeft > 0 && !p.bandaged && !p.mounted;
  if (u.hp < u.maxHp * 0.6 && canTreat) b.botRest = true;
  if (!canTreat || u.hp >= u.maxHp * 0.6) b.botRest = false;
  if (b.botRest) {
    inp.guardHold = false; inp.leftPressed = false; inp.runHeld = false;
    if (p.treatmentReady) inp.k.add('KeyE');
    else goTo(p, inp, L.x, L.z + 4, 2);
    return;
  }
  const e = b.army.nearestEnemy(u, 14, (o) => kgActive(o) && !o.invuln && kgGuidePointAllowed(b, o.pos) &&
    Math.hypot(o.pos.x - L.x, o.pos.z - L.z) <= L.r && Math.abs(o.pos.y - u.pos.y) < 3 &&
    !b.army.wallBetween(u.pos, -1, o.pos, false));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.7 : 2.8;
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    // 共通の頭と同じく、自分への打ち込みを受け、構えを解く半秒を待って突く。
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  goTo(p, inp, L.x + 3, L.z + 3, 3);
};

// 金ヶ崎だけの段。下知で次へ移る。追手の士気・生存・傷は段が終わっても変えない。
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n });
function kgCtx(rt) {
  return { friends: () => rt.flags.tono, routeFight: true, botSeek: 40, botSeekHold: true,
    botBackAllowed: kgSafeFoot, botFoeAllowed: o => kgGuidePointAllowed(rt, o.pos) };
}
function kgHold(line, dur, waves, ambush = false) {
  const L = LINES[line];
  return {
    kind: 'hold', max: line === 2 ? dur + RETREAT_T : dur + 1,
    start(rt, C) {
      // 札が戻れと告げる外縁まで敵を追わせず、旗の守備範囲で迎え撃つ。
      // 谷の肩へ少しずつ登り、備から離れるのを防ぐ。
      C.at = L; C.goal = L; C.botRadius = L.r; C.inT = 0; C.waves = waves.slice();
      C.nextReserve = 32;
      C.reserve = { t: 0, name: '朝倉の後続の槍組', from: line === 0 ? { x: 6, z: -100 } : line === 1 ? { x: 8, z: -32 } : { x: -6, z: 46 }, list: [uS(2), uA(line === 0 ? 6 : 12)] };
      // 旗の周囲にいる先手も段の追手として探す。自分から十四歩を越えても、
      // 持ち場の範囲に入った敵は迎え撃つ（旗の外へは追わない）。
      for (const g of rt.flags['w' + (line + 1)] || []) C.groups.push(g);
      // 守る段では、この持ち場の下知だけを残す。古い主任務へ戻さない。
      rt.objRemove('main'); rt.objRemove('stay');
      C.orderText = ambush ? '狭路を守れ。合図で退け' : `${L.mark}を守れ。合図で退け`;
      C.returnText = `${L.mark}の旗へ戻れ。備を離れるな`; C.away = false;
      rt.obj('dp', C.orderText, 'main');
      rt.marker('dp', L, L.mark, { h: 2, guideAlways: true, hideNear: L.r, hideOnArrival: true }); rt.zone('dp', L.x, L.z, L.r);
      if (ambush) {
        for (let side = 0; side < 2; side++) {
          const g = side === 0 ? rt.flags.akechi : rt.flags.gunsEast;
          g.holdFire = true;
          retreatGroup(rt, g, L.x + (side === 0 ? -10 : 10), L.z + 8,
            side === 0 ? Math.PI * 0.85 : -Math.PI * 0.85, 'line');
        }
        rt.say('明智光秀', '鉄砲は左右で待て。追手が谷へ入ったら、両側から撃つぞ', 3.5);
      }
    },
    tick(rt, C, m, ctx, el, dt) {
      // 寄せを早く崩しても待つだけにしない。八秒ごとに数え、新手は二十八秒あける。
      if (el >= C.nextReserve && !C.waves.length && !rt.flags.pursuers.length && el < dur + RETREAT_T &&
        (el < dur || line === 2 && (rt.flags.prog || 0) < RETREAT_T)) {
        C.nextReserve = el + 8;
        let live = 0;
        for (const g of C.groups) if (!gone(g)) for (const u of g.units) {
          if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) live++;
        }
        if (live < 6) { C.waves.push({ ...C.reserve, list: C.reserve.list.map(e => ({ ...e })) }); C.nextReserve = el + 28; }
      }
      for (let i = C.waves.length - 1; i >= 0; i--) {
        const w = C.waves[i];
        if (el < w.t) continue;
        C.waves.splice(i, 1);
        const g = enemyGroup(rt, { faction: 'asakura', name: w.name, anchor: w.from, facing: 0, order: 'attack', seekRange: 140,
          width: 10, aggro: 12, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: line === 0 ? 0.55 : 0.55, formation: w.gun ? 'line' : 'yari' }, dress(w.list, ASAKURA));
        C.groups.push(g);
      }
      if (ambush && !C.fired) {
        let entered = false;
        for (const g of C.groups) if (!gone(g)) for (const u of g.units) {
          if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget && u.pos.z < L.z && Math.hypot(u.pos.x - L.x, u.pos.z - L.z) < 26) { entered = true; break; }
        }
        // 移動に手間取っても撃つ下知を閉じ込めない。
        if (entered && rt.flags.akechi.order === 'hold' && rt.flags.gunsEast.order === 'hold' || el >= 40) {
          C.fired = true;
          rt.flags.akechi.holdFire = false; rt.flags.gunsEast.holdFire = false;
          rt.say('明智光秀', entered ? '谷へ入ったぞ。左右の鉄砲、放て！' : '鉄砲、撃て！　槍の備を支えよ！', 2.5);
          rt.banner('左右の鉄砲、放て', '槍の備のそばで追手を止めよ');
          C.orderText = '三の備を守れ。味方が退くまで追手を止めよ';
          if (!C.away) rt.obj('dp', C.orderText, 'main');
        }
      }
      const p = rt.player.u.pos;
      const away = Math.hypot(p.x - L.x, p.z - L.z) >= L.r + 8;
      if (!away) C.inT += dt;
      // 携帯で畳んだ札にも戻る下知を残す。札は増やさず、出入りの時だけ書き替える。
      if (away !== C.away) {
        C.away = away;
        rt.obj('dp', away ? C.returnText : C.orderText, 'main', true);
        if (away) rt.say('組頭', C.returnText, 3);
      }
      rt.objProgress('dp', Math.hypot(p.x - L.x, p.z - L.z) >= L.r + 8 ? `${L.mark}の旗へ戻れ。備を離れるな` : line === 2 && (rt.flags.prog || 0) < RETREAT_T ? rt.flags.breachT > 0 ? '追手が味方に迫る。退き道を守れ' : rt.flags.kino.count < rt.flags.kino.initial * 0.45 ? '殿が崩れかけている。旗のそばで槍をそろえよ' : '味方が山道を退いている。最後の列まで守れ' : '主力は退いている。槍列で追手を止めよ');
      // 退去が遅れ続けても、この段自身の期限で撤退へ進む。
      if (line === 2 && el >= dur + RETREAT_T && (rt.flags.prog || 0) < RETREAT_T) { m.kgFailed = true; return true; }
      return el >= dur && (line !== 2 || (rt.flags.prog || 0) >= RETREAT_T);
    },
    end(rt, C, m) {
      rt.unmark('dp'); rt.unzone('dp');
      if (ambush) { rt.flags.akechi.holdFire = false; rt.flags.gunsEast.holdFire = false; }
      if (m.kgFailed) rt.objFail('dp');
      else if (C.inT < dur * 0.6) { rt.objFail('dp'); m.kgFailed = true; }
      else rt.objDone('dp');
    },
  };
}
function kgA() {
  // 一の備に寄せを重ねすぎず、殿が健在のうちに川岸へ退く。
  return [kgHold(0, 45, [
    { t: 3, name: '朝倉の後続の槍組', from: { x: 6, z: -104 }, list: [uS(2), uA(10)] },
    { t: 24, name: '朝倉の西の備', from: { x: -42, z: -90 }, list: [uS(2), uA(8)] },
  ])];
}
function kgB() {
  return [kgHold(1, 65, [
    { t: 3, name: '橋へ向かう朝倉勢', from: { x: 8, z: -38 }, list: [uS(2), uA(16)] },
    { t: 24, name: '浅瀬へ向かう朝倉勢', from: { x: -50, z: -12 }, list: [uS(2), uA(12)] },
  ])];
}
function kgC() {
  return [kgHold(2, 85, [
    { t: 3, name: '谷道へ続く朝倉勢', from: { x: -8, z: 48 }, list: [uS(2), uA(16)] },
    { t: 30, name: '朝倉の後詰の鉄砲', from: { x: 8, z: 42 }, list: [uS(1), uG(7)], gun: true },
  ], true)];
}

export { kanegasaki };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
const OLD_LIFT = { x: 96, z: -128, tx: 48, tz: -98, w: 22, R: 65, rise: 50 };
const LIFT = { x: CASTLE.x, z: CASTLE.z, tx: TEZUTSU.x, tz: TEZUTSU.z, w: 22, R: 65, rise: 50 };
// 海面は世界の高さ -2.2。補正量は読み込み時に一度だけ求める。
// 曲輪の寸法・方位は赤色測量図に寄せる。高さと切岸の補正量は従来のまま。
const KG_SUMMIT_RISE = [
  { ...CASTLE, skirt: 48, rise: 86 - 2.2 - baseRelief(CASTLE.x, CASTLE.z) },
  { ...TEZUTSU, skirt: 96, rise: 171 - 2.2 - baseRelief(TEZUTSU.x, TEZUTSU.z) },
];
