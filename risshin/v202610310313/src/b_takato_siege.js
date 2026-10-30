import { useTerrain } from './asset_manifest.js';
// ======================================================================
// 攻城 C7・C9　高遠城の戦い・縄張り版（docs/siege-plan.md C7・C9／siege-spec.md 57・62・69章）
// 天正十年（1582）三月二日。武田の城々が次々に開く中、信玄の五男・仁科盛信だけは高遠城に籠もり降らなかった。
// 織田信忠の手が城を攻め、その日のうちに落ちた。ここは castle_plan.js の縄張り（castles/takato.js）・
// 門（siege_gate.js）・梯子（siege_ladder.js）・区域制圧（siege_zones.js）・城の頭（siege_ai.js）を
// 使った縄張り版（旧い b_takato.js の読み口もこの一戦を参照する）。
// C9：攻め方で結果が変わる【城62】。①大手だけ ②大手で引きつけて搦手 ③西の切岸を梯子で
//      ④二の丸を取って本丸の口へ射手を寄せる、の四つ（軍議・window.__takatoStrategy で選ぶ）。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RANKS } from './state.js';
import { sfx, signal } from './audio.js';
import { nm, wallLine } from './bhelp.js';
import { distToPolyline } from './world.js';
import { demRelief, demDetail } from './dem.js';
let tkDem = null;
useTerrain('dem_takato', (data) => { tkDem = data; HEIGHT_DEM = null; HEIGHT_FN = null; ROAD_SEGMENTS = null; BRIDGE_SEGMENTS = null; });
import { heightOf, inPoly, buildCastlePlan, makeLordKeep } from './castle_plan.js';
import { horiboriHeight, kabukiGate, goten, castleMat } from './castle_parts.js';
import { palisade, castleBoardFence, nobori, makeKitBatch, finalizeKitBatch, village, solidCircle, solidRect, tawara, lumber, hatazao, jinmaku, kagaribiBatch } from './props.js';
import { S as SETTINGS } from './settings.js';
import { reset as flReset, groundAt } from './floors.js';
import { localClear } from './army_local_way.js';
import { clearFoot } from './cover_guide.js';
import { makeSiegeZones, siegeFighter } from './siege_zones.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { makeNawabari } from './nawabari.js';
import { placeLadder, startClimb, knockDown, updateLadders, resetLadders } from './siege_ladder.js';
import { makeButai, butaiTick } from './butai.js';
import { tickTabas, tabaInteractTick, announceAdvance, makeTabaAdvance, addTaba } from './taketaba.js';
import { logEvent } from './senkyo.js';
import { battleEvent, EVENT_COMMANDER_ADVANCE, EVENT_RETREAT, EVENT_REINFORCEMENT } from './battle_events.js';
import { volleyAll, leanAll } from './b_mid.js';
import { clash } from './b_sekigahara.js';
import {
  TAKATO_PLAN as TAKATO_BASE_PLAN, TAKATO_BUILDINGS, OTE, GATE_NI, GATE_HON, KARAMETE, GATE_HODOIN, CLIFF_Z, NISHI_X,
  ROAD_OTE, ROAD_KARAMETE, ROAD_NISHI, ROAD_YODOU, BRIDGES,
} from './castles/takato.js';

// 三峰川の断崖の上に、空堀で分かれた七曲輪を土と木で建てる。
// 共用の縄張りは写して使い、ほかの戦の城を変えない。
const TAKATO_PLAN = { ...TAKATO_BASE_PLAN,
  // 枝先まで道と高低差を調べ、寄せ道と急な切岸へ逆茂木を掛けない。
  sakamogiMaxRise: 2,
  // 土塁は既存の地形に含まれる。細分の違う薄皮を重ねると、
  // 高画質の切岸だけ明暗の三角形が交互に露出する。
  terrainBanks: true,
  // 土の切岸は内外をつなぐ。縁の直外だけ二・七メートル落とす共通の段差を作らない。
  continuousEdges: true,
  kuruwa: TAKATO_BASE_PLAN.kuruwa.map((k) => ({
  ...k,
  // 台地の高さを全曲輪と建物で共用する。外の地面だけ高くしない。
  level: () => castleBase(0, 0) + k.level,
  // 本丸・二の丸・大手は板塀、低い脇曲輪は透ける木柵。既存の切岸と空堀を見せる。
  wallOpt: { ...k.wallOpt, openFence: k.kind === 'koshi' || k.id === 'san_north',
    // 脇の段は写真の細杭と二段の横木。高さ・控え・壊れる区画は保つ。
    lightFence: k.kind === 'koshi' || k.id === 'san_north',
    // 八巡目：写真の板塀に合わせ、角材の笠を薄い板葺きへ替え、縦板の目地を見せる。
    // この縄張りは各辺の左が曲輪内。狭間の上下の横桟を内側だけへ通す。
    // 共通部品の明示指定を使い、高さ・狭間・虎口・壊れ方と他の戦は変えない。
    boardCap: true, boardSeams: true, boardRailsSide: 1,
    // 切岸と道の坂に合わせ、下段の板だけを地面へ埋める。狭間と虎口は保つ。
    groundBoards: true },
})),
  // 四角い囲いは作らず、冠木門と短い柵の喰違いにする。
  koguchi: TAKATO_BASE_PLAN.koguchi.map((g) => ({ ...g, kind: g.kind === 'masu' ? 'kuichigai' : g.kind })),
  // 城内の井楼は屋根を載せた高い丸太組み。床・梯子・守兵も同じ高さを使う。
  yagura: TAKATO_BASE_PLAN.yagura.map((y) => ({ ...y, logFrame: true, ...(y.id.startsWith('sumi_san') ? { boarded: true, height: 3.3 } : {}) })),   // 大手の脇の二つは低い板囲いの台：足を塀の内に隠し、上の弓・鉄砲が宙に浮いて見えないように（10/29）
  // 主殿も堂と同じ薄い板葺きの入母屋。主殿だけ残っていた厚い檜皮の軒を替える。
  lordSeat: { ...TAKATO_BASE_PLAN.lordSeat, templeBoardRoof: true },
};

const CLEAR_BOUNDS = TAKATO_BASE_PLAN.kuruwa.map((k) => ({ x0: Math.min(...k.poly.map((p) => p[0])), x1: Math.max(...k.poly.map((p) => p[0])), z0: Math.min(...k.poly.map((p) => p[1])), z1: Math.max(...k.poly.map((p) => p[1])) }));

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
import { jinkeiBuild } from './jinkei.js';
import { flagTexture } from './textures.js';
import { rockShape, rockTuftShape, groundRocks } from './rock_shape.js';
import { stoneTex } from './nature.js';
import { NAKA, nakaFind } from './naka.js';
import { timeslipField } from './timeslip_field.js';

// 使番が先手へ伝える合図。既存の合成音を使い、札は一枚だけ短く出す。
function siegeSignal(rt, kind, text) {
  signal(kind, 0, 0.85);
  rt.flags.siegeSignal = kind;
  rt.obj('siegeSignal', text, 'side', true);
  rt.after(10, () => {
    if (rt.flags.siegeSignal === kind) rt.objRemove('siegeSignal');
  });
  if (kind === 'kakari') rt.after(3, () => {
    if (!rt.over && !rt.flags.ending && rt.player.u.alive) sfx('toki', 0.65);
  });
}

// 備えごとの人数・細かな持ち場は復元値。総勢とは別に本物の兵を増やさない。
// 名の伝わらない持ち場に架空の将を置かず、旗と紋は既存の家の物で示す。
function sonaePlan(name, team, honjin, facing, rows) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, sonae: rows.map(([id, role, general, soldiers, x, z, face, flag, mon, count = 0, w = 14, d = 8]) => ({
    id, role, general, soldiers, at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
    facing: face, flag, mon, count, w, d, bindOnly: count === 0,
  })) };
}

// 作るのは準備時の軽い備えだけ。台本の近い兵・前進・退去を優先する。
function buildSonae(rt, plans) {
  const hosts = [];
  for (const plan of plans) jinkeiBuild(rt, plan, (s, at) => {
    const h = rt.world.addDistantArmy({ ...at, w: s.w, d: s.d, count: s.count, facing: s.facing,
      team: plan.team, armor: plan.team ? 0x34302a : 0x2a2622, flagTex: flagTexture(s.flag), mon: s.mon,
      kind: 'mixed', general: s.general === '名は伝わらない' ? undefined : s.general, seed: 15810 + hosts.length });
    h.army.noWake = true;
    h.army.jinkeiGuard = true;
    hosts.push(h);
    return h;
  });
  return hosts;
}

// 信長公記巻十五の大手五将と西の信忠。曲輪別の将の配り・人数は復元。
// 伊那市の「数千の兵で数万の軍勢」に合わせ、三万対三千を表示の目安にする。
// 総勢と備えの帳面だけをそろえ、近い兵・遠景の人数は変えない。
const TAKATO_ATTACK = sonaePlan('両口の寄せ', 0, { x: -124, z: 0 }, Math.PI / 2, [
  ['nobutada', '本陣', '織田信忠', 10000, -124, 0, Math.PI / 2, 'oda', 'oda'],
  ['oteSpear', '大手の仕寄り', '森長可', 5000, 127, 0, -Math.PI / 2, 'tsuru', 'tsuru'],
  ['reserve', '大手の控え', '河尻秀隆', 5000, 149, 6, -Math.PI / 2, 'oda', 'none'],
  ['dan', '大手の第二陣', '団平八', 4000, 153, -16, -Math.PI / 2, 'oda', 'none', 64, 12, 8],
  ['mori', '大手の南脇', '毛利河内守', 3000, 149, 28, -Math.PI / 2, 'oda', 'none', 48, 12, 8],
  ['ogasawara', '大手の北脇', '小笠原信嶺', 3000, 129, -28, -Math.PI / 2, 'oda', 'none', 48, 12, 8],
]);
const TAKATO_DEFEND = sonaePlan('曲輪ごとの守り', 1, { x: -56, z: 0 }, Math.PI / 2, [
  ['honGuard', '本丸', '仁科盛信', 900, -49, 0, Math.PI / 2, 'takeda', 'takeda'],
  ['sanSpear', '三の丸と大手', '諏訪勝右衛門', 960, 73, -16, Math.PI / 2, 'takeda', 'takeda'],
  ['niSpear', '二の丸', '小山田昌行', 540, 10.625, 0, Math.PI / 2, 'takeda', 'takeda'],
  ['hodoinSpear', '西の搦手', '名は伝わらない', 420, -76, 0, -Math.PI / 2, 'takeda', 'takeda'],
  ['reserveDef', '二の丸の控え', '名は伝わらない', 180, -4.25, 12, Math.PI / 2, 'takeda', 'takeda'],
]);
for (const p of [TAKATO_ATTACK, TAKATO_DEFEND]) for (const s of p.sonae) s.bind = (rt) => rt.flags[s.id];

const ODA = { armor: 0x2a2622, flag: 'oda' };
const TAKEDA = { armor: 0x3a2622, flag: 'takeda' };

// ---------------- 地形：南は崖（三峰川）、西は切岸（梯子が要る）、北から緩く台地へ ----------------
function baseTerrain(x, z) {
  // 本丸の床を比高約30mの台地に置く。曲輪間の守りは段差でなく空堀。
  let h = 36;
  let drop = z > CLIFF_Z ? Math.min(30, (z - CLIFF_Z) * 3.2) : 0;
  // 本丸の南西の崖。西口の幅六メートルの尾根は掘り残す。
  if (x < NISHI_X) {
    const side = Math.max(0, Math.abs(z) - 3);
    drop = Math.max(drop, Math.min(30, (NISHI_X - x) * 1.8) * (1 - Math.exp(-side * side / 28)));
  }
  h -= drop;
  if (z < -65) h -= Math.min(40, (-65 - z) * 1.6);
  if (x > 100) h -= Math.min(12, (x - 100) * .15);
  return h;
}
// 空堀と竪堀の窪みを見た目と歩く地形へ共通に反映する。
const HORI_FNS = TAKATO_PLAN.hori
  .map((h) => horiboriHeight(h.pts, { depth: h.deep ?? 2, width: h.w ?? 6 }));
function castleBase(x, z) { return baseTerrain(x, z); }
function baseWithHori(x, z) {
  let h = castleBase(x, z);
  for (let i = 0; i < HORI_FNS.length; i++) {
    const cut = HORI_FNS[i](x, z);
    // 台地の基準は本丸。堀の底は高い側の縁から測る。
    // 二ノ丸・三ノ丸間の底は本丸-2m（両縁から3〜5.5m）、本丸・二ノ丸間は本丸-7m（両縁から7〜8m）。
    h += cut * (i === 0 ? 2 / 5 : i === 1 ? 7 / 8 : 1);
  }
  return h;
}
const DEM_RELIEF = { xy: 2, cx: 0, cz: 0, inner: 170, fade: 40, scale: 0.1 };
let HEIGHT_FN = null, HEIGHT_DEM = null, ROAD_SEGMENTS = null, BRIDGE_SEGMENTS = null;
// 東の月蔵山側へ逃れる里道。民の所在と道筋は推定復元で、当日の避難記録ではない。
// 南の三峰川・北の藤沢川へ渡らず、大手の寄せ道と西の切岸も避ける。
// 地形の根拠：伊那市「高遠城跡の魅力をご紹介」。東の城下は『長野県の地名』「高遠城下」。
const PEOPLE_PATHS = [
  [[-20, 66], [110, 66], [128, 76], [174, 76]],
  [[117, 67], [128, 76], [174, 76]],
  [[142, 76], [174, 76]],
];
const peopleRoute = (pts) => pts.map(([x, z]) => ({ x, z }));
const WALK_ROADS = [[[-146, 0], ...ROAD_KARAMETE], ...TAKATO_PLAN.paths.filter((p) => p.kind !== 'nishi' && p.kind !== 'yodou').map((p) => p.pts), ...PEOPLE_PATHS];
// 台地の外の崖と谷の斜面に、高遠の実測の尾根と沢の凹凸を足す（国土地理院）。曲輪・堀・道から離れた所だけ。
function demAway(x, z) {
  let out = Infinity;
  for (const k of CLEAR_BOUNDS) out = Math.min(out, Math.max(k.x0 - x, x - k.x1, k.z0 - z, z - k.z1, 0));
  let t = Math.max(0, Math.min(1, (out - 20) / 14));
  if (t <= 0) return 0;
  for (const pts of WALK_ROADS) t = Math.min(t, Math.max(0, Math.min(1, (distToPolyline(x, z, pts) - 10) / 10)));
  return t;
}
function rawHeight(x, z) {
  let h = HEIGHT_FN(x, z) + (HEIGHT_DEM ? demRelief(HEIGHT_DEM, x, z, DEM_RELIEF) : 0);
  if (HEIGHT_DEM) { const a = demAway(x, z); if (a > 0) h += a * demDetail(HEIGHT_DEM, x, z, { xy: 2, win: 40, scale: 0.25 }); }
  return h;
}
function roadLevel(x, z) {
  // 勘助曲輪への枝道は谷底へ落とさず、台地西側の段としてつなぐ（高さは推定）。
  const west = TAKATO_PLAN.paths.find((p) => p.id === 'kansuke');
  for (let i = 0; i < west.pts.length; i++) if (west.levels[i] != null && Math.hypot(x - west.pts[i][0], z - west.pts[i][1]) < .001) return castleBase(0, 0) + west.levels[i];
  let level = -Infinity;
  for (const k of TAKATO_PLAN.kuruwa) if (inPoly(k.poly, x, z) || inPoly(k.poly, x - .001, z - .001) || inPoly(k.poly, x + .001, z + .001)) level = Math.max(level, k.level());
  return Number.isFinite(level) ? level : rawHeight(x, z);
}
function height(x, z) {
  if (!HEIGHT_FN) {
    HEIGHT_DEM = tkDem; HEIGHT_FN = heightOf(TAKATO_PLAN, baseWithHori, 3);
    // 段の境界で急変しない坂を準備時に作る。毎コマの配列・形・材質は増やさない。
    ROAD_SEGMENTS = [];
    for (const pts of WALK_ROADS) for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az;
      ROAD_SEGMENTS.push({ ax, az, dx, dz, l2: dx * dx + dz * dz || 1, ya: roadLevel(ax, az), yb: roadLevel(bx, bz) });
    }
    BRIDGE_SEGMENTS = BRIDGES.map((b) => {
      const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1];
      return { ax: b.a[0], az: b.a[1], dx, dz, l2: dx * dx + dz * dz,
        len: Math.hypot(dx, dz), w: b.w,
        ya: roadHeight(b.a[0], b.a[1], rawHeight(b.a[0], b.a[1])),
        yb: roadHeight(b.b[0], b.b[1], rawHeight(b.b[0], b.b[1])) };
    });
  }
  const h0 = rawHeight(x, z);
  // 建物の四隅と縁側は曲輪の床へ水平に据える。
  for (const b of TAKATO_BUILDINGS) {
    const dx = x - b.at[0], dz = z - b.at[1], c = Math.cos(b.rot), s = Math.sin(b.rot);
    if (Math.abs(dx * c - dz * s) <= b.w / 2 + .3 && Math.abs(dx * s + dz * c) <= b.d / 2 + .3) return rawHeight(b.at[0], b.at[1]);
  }
  const pathY = roadHeight(x, z, h0);
  // 土橋は地面を掘り残す。天端の道幅と両脇の土の斜面を、描画と歩く高さで共有する。
  for (const bridge of BRIDGE_SEGMENTS) {
    const projected = ((x - bridge.ax) * bridge.dx + (z - bridge.az) * bridge.dz) / bridge.l2;
    if (projected < -2 / bridge.len || projected > 1 + 2 / bridge.len) continue;
    const along = Math.max(0, Math.min(1, projected));
    const side = Math.abs((x - bridge.ax) * bridge.dz - (z - bridge.az) * bridge.dx) / bridge.len;
    const t = Math.max(0, Math.min(1, (bridge.w / 2 + 3 - side) / 3));
    if (t <= 0) continue;
    // 曲輪へ二メートル入るまで元の道幅へつなぐ。口の縁にも土橋の幅を残す。
    const end = Math.max(0, Math.min(1, (Math.min(projected, 1 - projected) * bridge.len + 2) / 2));
    return pathY + (bridge.ya + (bridge.yb - bridge.ya) * along - pathY)
      * t * t * (3 - 2 * t) * end * end * (3 - 2 * end);
  }
  return pathY;
}
function roadHeight(x, z, h0) {
  // 大手の外は道の肩を広げる。細い切り通しの両側が視界を塞がないようにする。
  const shoulder = x >= OTE.x && x <= 149 && Math.abs(z - OTE.z) < 14 ? 14 : 3.5;
  let best = shoulder, roadY = h0;
  for (const q of ROAD_SEGMENTS) {
    const t = Math.max(0, Math.min(1, ((x - q.ax) * q.dx + (z - q.az) * q.dz) / q.l2));
    const d = Math.hypot(x - q.ax - q.dx * t, z - q.az - q.dz * t);
    if (d < best) { best = d; roadY = q.ya + (q.yb - q.ya) * t; }
  }
  const t = Math.max(0, Math.min(1, (shoulder - best) / (shoulder - 2)));
  const blend = t * t * (3 - 2 * t);
  return h0 + (roadY - h0) * blend;
}

// 門の数・場所・耐久の識別は保ち、土の喰違いを冠木門と柵で囲う。
// 二つの冠木門の持ち場と道順は保つ。四角く囲む枡形の三辺は作らない。
function takatoGates(rt) {
  const gates = {}, batch = makeKitBatch();
  // 冠木門は柱と冠木で組む。門前から横へ突き出す大きな反り屋根を載せない。
  // 扉・柱・通り幅・壊れる区画は同じ部品のまま、屋根の描画だけ省く。
  const gateOpt = { team: 1, roof: false };
  // 開いた戸が通り道へ斜めに残り、通れる口と見た目が食い違わないようにする。
  const gateAt = (x, z, w, rot) => {
    const gate = kabukiGate(rt, x, z, w, rot, gateOpt);
    const open = gate.open;
    gate.open = () => {
      open();
      gate.door.userData.leaves.forEach((leaf, i) => { leaf.rotation.y = (i ? -1 : 1) * Math.PI / 2; });
    };
    return gate;
  };
  for (const g of TAKATO_PLAN.koguchi) {
    const [x, z] = g.at, rot = g.rot || 0;
    if (!Array.isArray(g.gate)) { gates[g.id] = gateAt(x, z, g.w, rot); continue; }
    const hs = g.size, turn = g.turn, ux = Math.sin(rot), uz = Math.cos(rot), px = turn * uz, pz = -turn * ux;
    const cx = x - ux * hs, cz = z - uz * hs;
    const P = (a, b) => [cx + px * a - ux * b, cz + pz * a - uz * b];
    const walls = [];
    // 内門の脇だけに短い柵を置く。口の前を箱形の広場で囲まない。
    for (const edge of [[hs, hs, hs, 1.6]]) {
      // 丸太の乱杭でなく、曲輪の塀と同じ縦板と柱の組み。当たり・耐久・区画は同じ。
      walls.push(...wallLine(rt, [P(edge[0], edge[1]), P(edge[2], edge[3])], { team: 1, hp: 420, name: '虎口の柵', segLen: 8, mesh: castleBoardFence,
        meshOpt: { batch, h: 2.4, boardCap: true, boardSeams: true, groundBoards: true } }));
    }
    const [ix, iz] = P(hs, -hs * .35);
    gates[g.id] = { outer: gateAt(x, z, g.w1, rot),
      inner: gateAt(ix, iz, g.w2, rot + turn * Math.PI / 2), walls, plaza: { x: cx, z: cz } };
  }
  finalizeKitBatch(rt, batch);
  return gates;
}
// 共通の主殿・堂は白い塗壁なので、この戦だけ土色へ替える。
// 共用材質に色を塗らず、一つの材質を主殿と堂で使い回す。
function takatoEarthWalls(building, material) {
  for (const mesh of building.mesh.children)
    if (mesh.material === castleMat('plaster')) mesh.material = material;
}
// 写真の土壁のように、軒下の乾いた土と裾の雨染みを分ける。高遠だけの一枚を共有する。
function takatoWallMaterial() {
  const mat = castleMat('plaster').clone(); mat.color.setHex(0x967959);
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const ctx = cv.getContext('2d'), shade = ctx.createLinearGradient(0, 0, 0, 256);
  shade.addColorStop(0, '#d5c7ae'); shade.addColorStop(.2, '#f1e7d3');
  shade.addColorStop(.65, '#e1d3ba'); shade.addColorStop(1, '#998d70');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = (i * 73 + i * i * 3) % 256, y = (i * 47 + i * i * 7) % 256;
    ctx.fillStyle = i % 3 ? 'rgba(68,55,35,.07)' : 'rgba(255,245,216,.16)';
    ctx.fillRect(x, y, 1 + i % 3, 1 + i % 2);
  }
  // 雨垂れの起点と長さをずらし、帯状の汚れにしない。
  for (let i = 0; i < 17; i++) {
    const x = (i * 53 + 11) % 256, y = 170 + i * 13 % 47;
    ctx.fillStyle = 'rgba(69,64,41,.10)'; ctx.fillRect(x, y, 2 + i % 4, 256 - y);
  }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  mat.map = map; mat.bumpMap = map; mat.bumpScale = .035;
  return mat;
}
function takatoLife(rt) {
  for (const b of TAKATO_BUILDINGS) {
    const [x, z] = b.at;
    // 個別の室内図は不明。堂・番所・蔵・長屋の用途に合わせた推定の間取り。
    const kind = b.kind === 'temple' ? 'hondo' : b.kind === 'toiya' ? 'kura'
      : b.name.includes('番所') || b.name.includes('詰所') ? 'bansho' : 'nagaya';
    const building = goten(rt, x, z, { ...b, kind, profile: 'takato', tile: false,
      // 前巡の腰板と配置は保ち、厚い反り屋根を用途で分ける。堂は入母屋の板葺き。
      boardRoof: b.kind !== 'temple',
      // 横木は前巡のまま。長い一枚板を継ぎ目のずれた重ね葺きへ替え、軒の雨染みも出す。
      layeredBoardRoof: b.kind !== 'temple',
      templeBoardRoof: b.kind === 'temple',
      // 用屋を居館の白い障子面から、古板と裏の連子窓へ分ける。堂と主殿は残す。
      utilityBoardWalls: b.kind !== 'temple',
      naka: true, doorX: 0, team: 1, noTarget: true, where: b.name });
    takatoEarthWalls(building, rt.flags.earthMat);
  }
  takatoYard(rt);
  // 井筒・柱・板葺きの井戸。瓦の井戸の共通部品は戦国期の高遠へ写さない。
  const batch = makeKitBatch();
  const wood = [], stone = [], rope = [], dark = [];
  for (const [x, z] of [[-54, -9], [-56, 29]]) {
    const y = rt.world.heightAt(x, z);
    const ring = new THREE.CylinderGeometry(.85, .95, .8, 10, 1, true); ring.translate(x, y + .4, z); stone.push(ring); solidCircle(x, z, .95);
    for (const dx of [-1, 1]) { const post = new THREE.BoxGeometry(.14, 2.5, .14); post.translate(x + dx, y + 1.25, z); wood.push(post); solidCircle(x + dx, z, .12); }
    const beam = new THREE.BoxGeometry(2.5, .14, .14); beam.translate(x, y + 2.35, z); wood.push(beam);
    for (const sign of [-1, 1]) { const roof = new THREE.BoxGeometry(2.7, .1, 1); roof.rotateX(sign * .35); roof.translate(x, y + 2.65, z + sign * .43); wood.push(roof); }
    if (true) {
      // 空の筒だった井戸へ縁石・釣瓶・巻上げ軸。既存の井戸の内側に収め、通り道を狭めない。
      const lip = new THREE.RingGeometry(.66, .94, 10); lip.rotateX(-Math.PI / 2); lip.translate(x, y + .81, z); stone.push(lip);
      const hole = new THREE.CircleGeometry(.67, 10); hole.rotateX(-Math.PI / 2); hole.translate(x, y + .12, z); dark.push(hole);
      const axle = new THREE.CylinderGeometry(.075, .075, 2.3, 6); axle.rotateZ(Math.PI / 2); axle.translate(x, y + 1.7, z); wood.push(axle);
      for (let i = 0; i < 6; i++) {
        const coil = new THREE.TorusGeometry(.1, .018, 3, 8); coil.rotateY(Math.PI / 2); coil.translate(x + (i - 2.5) * .04, y + 1.7, z); rope.push(coil);
      }
      const line = new THREE.CylinderGeometry(.016, .016, 1.1, 4); line.translate(x, y + 1.05, z + .1); rope.push(line);
      const pail = new THREE.CylinderGeometry(.21, .17, .3, 8, 1, true); pail.translate(x, y + .4, z + .1); wood.push(pail);
      const crank = new THREE.BoxGeometry(.1, .35, .1); crank.translate(x + 1.13, y + 1.55, z); wood.push(crank);
      const grip = new THREE.BoxGeometry(.28, .075, .075); grip.translate(x + 1.24, y + 1.39, z); wood.push(grip);
    }
  }
  for (const [parts, color] of [[wood, 0x615040], [stone, 0x81796b], [rope, 0xa08c64], [dark, 0x25251e]]) {
    if (!parts.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color }));
    mesh.userData.camBlock = true;
    mesh.castShadow = mesh.receiveShadow = true; rt.scene.add(mesh);
    for (const geo of parts) geo.dispose();
  }
  finalizeKitBatch(rt, batch);
  // 曲輪間は土の道を使う。寺の踏み石を並べて、土橋を石造の高架にしない。
  // 扉も守備もない飾りの冠木は、遠くで電柱に見える。道の脇の武田の幟に替える。
  for (const [x, z] of [[-58, 54.5], [-36, 32], [-92, -24], [-41, 66]]) rt.scene.add(nobori(rt.world, x + 3, z, 'takeda', 4));
  // 月蔵山側の里。家を南の崖から離し、南端の里道を避難用に空ける。
  rt.scene.add(village(rt.world, 161, 62, { n: 5, fields: 8, r: 16, smoke: 0, seed: 15823, bareTrees: true, groundedHomes: true, cameraWalls: true }));
  // 東の城下の小さな家並み。近世の整った城下や後世の寺を持ち込まない。
  rt.scene.add(village(rt.world, 119, 54, { n: 2, fields: 0, r: 8, smoke: 0, seed: 15824, bareTrees: true, groundedHomes: true, cameraWalls: true }));
}

// 屋敷の腰板と備蓄は当日の配置を断定しない復元。戸口・土橋・兵の持ち場を避ける。
function takatoYard(rt) {
  const boards = [], unitBox = new THREE.BoxGeometry(1, 1, 1);
  const matrix = new THREE.Matrix4(), turn = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3(), size = new THREE.Vector3();
  for (const b of TAKATO_BUILDINGS) {
    if (b.kind === 'temple') continue;
    const [x, z] = b.at, y = rt.world.heightAt(x, z), c = Math.cos(b.rot), s = Math.sin(b.rot);
    const box = (lx, lz, w, h, d) => {
      at.set(x + lx * c + lz * s, y + 1.02, z - lx * s + lz * c);
      size.set(w, h, d); turn.setFromAxisAngle(axis, b.rot); matrix.compose(at, turn, size);
      boards.push(unitBox.clone().applyMatrix4(matrix));
    };
    // 戸口のある正面は触らず、両妻と裏の腰に板張り。上の土壁と格子窓を残す。
    for (const side of [-1, 1]) {
      box(side * (b.w / 2 + .1), 0, .07, .94, b.d);
      for (let lz = -b.d / 2 + .2; lz < b.d / 2; lz += .48)
        box(side * (b.w / 2 + .15), lz, .05, .94, .035);
    }
    box(0, -b.d / 2 - .1, b.w, .94, .07);
    for (let lx = -b.w / 2 + .2; lx < b.w / 2; lx += .48)
      box(lx, -b.d / 2 - .15, .035, .94, .05);
  }
  const wall = new THREE.Mesh(mergeGeometries(boards), new THREE.MeshLambertMaterial({ color: 0x655342 }));
  wall.castShadow = wall.receiveShadow = true; wall.userData.camBlock = true; rt.scene.add(wall);
  boards.forEach(g => g.dispose()); unitBox.dispose();

  takatoLeanTo(rt);

  // 写真の屋敷は一つの大きな広場に裸で並ばず、背後に短い境の柵を持つ。
  // 三棟の裏だけを低く仕切る。正面の縁側・戸口と既存の道・櫓の梯子口は空ける。
  const fenceBatch = makeKitBatch();
  for (const index of [1, 4, 7]) {
    const b = TAKATO_BUILDINGS[index], [x, z] = b.at, c = Math.cos(b.rot), s = Math.sin(b.rot);
    const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const back = -b.d / 2 - 1.1, edge = b.w / 2 + .65;
    const points = [P(-edge, back + .65), P(-edge, back), P(edge, back)];
    for (let i = 1; i < points.length; i++)
      palisade(rt.world, [...points[i - 1], ...points[i]], {
        h: 1.35, lightFence: true, mound: false, solid: true, batch: fenceBatch,
      });
  }
  finalizeKitBatch(rt, fenceBatch);

  // 同じ荷は一つの形・材質でまとめる。兵数を変えず、準備時にだけ作る。
  const stores = (make, places, w, d) => {
    const [x, z, rot] = places[0], source = make(x, z, rot);
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, places.length);
    for (let i = 0; i < places.length; i++) {
      const [px, pz, r] = places[i];
      matrix.makeRotationY(r); matrix.setPosition(px, rt.world.heightAt(px, pz), pz);
      mesh.setMatrixAt(i, matrix);
      if (i) solidRect(px, pz, w, d, r);
    }
    mesh.castShadow = mesh.receiveShadow = true; mesh.userData.camBlock = true;
    mesh.computeBoundingSphere(); rt.scene.add(mesh);
  };
  stores((x, z, r) => tawara(rt.world, x, z, r, 6), [[-50, 13, 0], [-65, 44, 0], [48, -29, 0], [143, 21, 0]], 1.1, 1.8);
  stores((x, z, r) => lumber(rt.world, x, z, r), [[62, -32, 0], [-48, 43, Math.PI / 2], [142, 25, 0]], 4.1, 1.4);
  stores((x, z, r) => hatazao(rt.world, x, z, r, 4, 'takeda'), [[-48, 16, 0], [48, -33, 0]], 2.6, 1.2);
  // 高遠の守りは武田、東の寄せの控えは織田。借用した本の他家の紋は写さない。
  rt.scene.add(hatazao(rt.world, 144, 18, 0, 4, 'oda'));
  for (const [x, z] of [[62, -28], [9, -27], [-48, 18], [-48, 46], [-48, 72], [-25, 41], [-99, -42]])
    rt.scene.add(nobori(rt.world, x, z, 'takeda', 4.5));
  rt.scene.add(nobori(rt.world, 145, 22, 'oda', 4.5));
}

// 本の長屋のような、細柱で支えた片流れの下屋。配置・寸法は高遠用の推定。
// 三の丸の番所の裏へ収め、大手道・戸口・既存の柵・井楼の梯子を空ける。
function takatoLeanTo(rt) {
  const b = TAKATO_BUILDINGS[0], [x, z] = b.at, y = rt.world.heightAt(x, z);
  const c = Math.cos(b.rot), s = Math.sin(b.rot), parts = [];
  const unit = new THREE.BoxGeometry(1, 1, 1), color = new THREE.Color();
  const box = (w, h, d, lx, ly, lz, hex, pitch = 0) => {
    const g = unit.clone(); g.scale(w, h, d); g.rotateX(pitch); g.translate(lx, ly, lz);
    // 板ごとの褪せと下端の雨染みは頂点色へ焼き込み、素材を増やさない。
    const pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
    color.setHex(hex);
    for (let i = 0; i < pos.count; i++) {
      const shade = pos.getY(i) < .35 ? .65 : pos.getZ(i) < -b.d / 2 - 1.8 ? .78 : 1;
      colors[i * 3] = color.r * shade; colors[i * 3 + 1] = color.g * shade; colors[i * 3 + 2] = color.b * shade;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.rotateY(b.rot); g.translate(x, y, z); parts.push(g);
  };
  const front = -b.d / 2 - 1.85, back = -b.d / 2 + .05;
  for (const lx of [-3.6, 0, 3.6]) {
    box(.13, 2.24, .13, lx, 1.12, front, 0x665440);
    solidCircle(x + lx * c + front * s, z - lx * s + front * c, .1);
    box(.1, .14, 2.12, lx, 2.5, (front + back) / 2, 0x594b38, -.28);
  }
  box(7.7, .15, .14, 0, 2.24, front, 0x584735);
  box(7.7, .14, .14, 0, 2.78, back, 0x62513d);
  // 二段の板を六センチ重ね、継ぎ目を交互にずらす。遠くでも薄い軒の輪郭を保つ。
  const pitch = -.28, depth = 2.15, count = 20, step = 7.9 / count;
  for (let i = 0; i < count; i++) {
    const split = .48 + (i % 2) * .08;
    for (const [a, end] of [[0, split + .03], [split, 1]]) {
      const t = (a + end) / 2, lz = back - .05 - depth * (1 - t);
      box(step - .009, .065, depth * (end - a) / Math.cos(pitch),
        -3.95 + (i + .5) * step, 2.81 - Math.tan(-pitch) * depth * (1 - t) + a * .025,
        lz, [0x83745d, 0x736752, 0x918066, 0x7b6a54][(i * 7 + (a ? 1 : 0)) % 4], pitch);
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = mesh.receiveShadow = true; mesh.userData.camBlock = true; rt.scene.add(mesh);
  parts.forEach(g => g.dispose()); unit.dispose();
}

// 東の寄せの後方だけに、仮の幕と仕寄り道具を寄せる。当日の配置を断定しない推定復元。
// 本の野戦兵器の丸太・縄・板楯を参考にする。大手道・乱戦・里の避難路には掛けない。
function takatoSiegeStores(rt) {
  rt.scene.add(jinmaku(rt.world, 138, -44, 12, 8, 6, { mon: 'oda' }));
  for (const [x, z] of [[133, -38], [143, -38]])
    rt.scene.add(nobori(rt.world, x, z, 'oda', 4.8));

  // 板、丸太、竹、縄を同じ頂点色の材質へまとめる。細部は近い時だけ描く。
  const coarse = [], fine = [], unit = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 6);
  const ring = new THREE.TorusGeometry(1, .045, 3, 10);
  const tone = new THREE.Color(), direction = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const across = new THREE.Vector3(1, 0, 0);
  const turn = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  const at = new THREE.Vector3(), size = new THREE.Vector3();
  const put = (source, parts, color) => {
    const g = source.clone().applyMatrix4(matrix), p = g.attributes.position;
    const colors = new Float32Array(p.count * 3); tone.setHex(color);
    for (let i = 0; i < p.count; i++) tone.toArray(colors, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(g);
  };
  const box = (x, y, z, w, h, d, color, pitch = 0, parts = coarse) => {
    at.set(x, y, z); size.set(w, h, d); turn.setFromAxisAngle(across, pitch);
    matrix.compose(at, turn, size);
    // 屋根は左右に傾ける。下へ沈む妻板や厚い瓦屋根は付けない。
    put(unit, parts, color);
  };
  const log = (ax, ay, az, bx, by, bz, r, color, parts = coarse) => {
    direction.set(bx - ax, by - ay, bz - az);
    size.set(r, direction.length(), r); turn.setFromUnitVectors(up, direction.normalize());
    at.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    matrix.compose(at, turn, size); put(cylinder, parts, color);
  };
  // 柱はそれぞれ接地し、屋根だけ水平な棟へ揃える。開いた南側から資材が見える。
  const sx = 153, sz = -44, sy = rt.world.heightAt(sx, sz);
  for (const dx of [-3.4, 3.4]) for (const dz of [-2, 2]) {
    const x = sx + dx, z = sz + dz, y = rt.world.heightAt(x, z);
    log(x, y - .1, z, x, sy + 2.5, z, .095, 0x62503c);
    solidCircle(x, z, .12);
  }
  for (const dz of [-2, 2]) log(sx - 3.7, sy + 2.45, sz + dz, sx + 3.7, sy + 2.45, sz + dz, .09, 0x594833);
  log(sx - 3.8, sy + 3.12, sz, sx + 3.8, sy + 3.12, sz, .1, 0x6e5940);
  for (const sign of [-1, 1]) {
    log(sx - 3.4, sy + 2.45, sz + sign * 2, sx - 3.4, sy + 3.12, sz, .065, 0x6e5940);
    log(sx + 3.4, sy + 2.45, sz + sign * 2, sx + 3.4, sy + 3.12, sz, .065, 0x6e5940);
    for (let i = 0; i < 18; i++) {
      // 板目と色むらを輪郭に残す。雨で黒くなった軒先は短い二枚の重ね葺き。
      const x = sx - 3.8 + (i + .5) * 7.6 / 18;
      for (let row = 0; row < 2; row++) {
        const z = sz + sign * (.58 + row * 1.05);
        box(x, sy + 3.12 - row * .34 - .18, z, .415, .06, 1.23,
          [0x857257, 0x756248, 0x938067][(i + row) % 3], sign * .31);
      }
    }
  }
  // 写真の横木組みを小屋の裏へ。斜めの控えを残し、壁で囲わない。
  for (const y of [sy + .65, sy + 1.65])
    log(sx - 3.5, y, sz - 2, sx + 3.5, y, sz - 2, .07, 0x65513b);
  log(sx - 3.4, sy + .3, sz - 2, sx + 3.4, sy + 2.4, sz - 2, .06, 0x736047);

  // 出番待ちの竹束三基。筒の端・節・三段の縄を近景にだけ残す。
  for (let b = 0; b < 3; b++) {
    const x = 150 + b * 1.45, z = -43, y = rt.world.heightAt(x, z);
    for (let k = 0; k < 11; k++) {
      const a = k * Math.PI * 2 / 11, px = x + Math.cos(a) * .38, pz = z + Math.sin(a) * .38;
      const top = y + 2.1 + (k % 3) * .055;
      log(px, y + .12, pz, px, top, pz, .064, k % 3 ? 0x858052 : 0xa39b66);
      for (const h of [.45, 1.2, 1.87]) log(px, y + h, pz, px, y + h + .035, pz, .071, 0xaaa16b, fine);
    }
    for (const h of [.35, 1.05, 1.8]) {
      at.set(x, y + h, z); size.setScalar(.46); turn.setFromAxisAngle(across, Math.PI / 2);
      matrix.compose(at, turn, size); put(ring, fine, 0xb39b70);
    }
    solidRect(x, z, .95, .95, 0);
  }
  // 立て掛けた板楯と地面に伏せた梯子。攻城用の行天橋や移動櫓を架空に増設しない。
  for (let i = 0; i < 3; i++) {
    const x = 150 + i * 1.4, z = -46, y = rt.world.heightAt(x, z);
    for (let p = 0; p < 3; p++) box(x + (p - 1) * .32, y + 1, z, .305, 1.85, .065, 0xa38a62, -.12);
    for (const h of [.45, 1.4]) box(x, y + h, z + .14, 1, .08, .1, 0x5b4832);
  }
  const ladderY = (x, z) => rt.world.heightAt(x, z) + .1;
  for (const dz of [-.38, .38])
    log(143, ladderY(143, -34 + dz), -34 + dz, 149, ladderY(149, -34 + dz), -34 + dz, .055, 0x88704d);
  for (let i = 0; i < 13; i++) {
    const x = 143.2 + i * .45;
    log(x, ladderY(x, -34.4), -34.4, x, ladderY(x, -33.6), -33.6, .04, 0x9d8058);
  }

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const [parts, near] of [[coarse, false], [fine, true]]) {
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    mesh.receiveShadow = true; mesh.userData.camBlock = !near;
    if (near) {
      const lod = new THREE.LOD(); lod.position.set(sx, sy, sz);
      mesh.geometry.translate(-sx, -sy, -sz);
      lod.addLevel(mesh, 0); lod.addLevel(new THREE.Object3D(), 45); rt.scene.add(lod);
    } else rt.scene.add(mesh);
    for (const g of parts) g.dispose();
  }
  unit.dispose(); cylinder.dispose(); ring.dispose();
  // 明け方の控えの篝を一基。煙は小屋の脇から一筋だけ、既存の遠近切替で描く。
  rt.scene.add(kagaribiBatch(rt.world, [[145, -39]]));
  rt.world.addFire(145, -39, { h: 1.3, size: .35, smoke: false, lightRadius: 2 });
  rt.world.addSmokeColumn(145, rt.world.heightAt(145, -39) + 1.6, -39, { size: .35 });
}

// 早春の北側の窪みに残る雪。天気は復元で、当日の降雪とはしない。
// 残雪は共通の地面の色分けへ任せ、近い草を枯れ色にそろえる。
function takatoSpring(rt) {
  // 足元の近い草も、この戦では枯れ色にする。共通の草の作りは変えない。
  const grass = rt.world.nearGrass;
  if (grass?.instanceColor) {
    const color = new THREE.Color();
    for (let i = 0; i < grass.count; i++) {
      grass.getColorAt(i, color);
      const shade = Math.max(.7, Math.min(1.1, (color.r + color.g + color.b) / .8));
      color.setRGB(i % 7 ? .58 * shade : .52 * shade, i % 7 ? .48 * shade : .59 * shade, .34 * shade);
      grass.setColorAt(i, color);
    }
    grass.instanceColor.needsUpdate = true;
  }
  // 残雪は地面の共通の色分けで示す。別の白い面は携帯の粗い地形を跨いで浮く。
}

// 岩・枯れ草は準備時にまとめる。兵の当たりや通り道は増やさない。
function takatoGround(rt) {
  const pose = new THREE.Object3D(), color = new THREE.Color();
  // 共通の tint は草土の配分にだけ使われるため、高遠では色も既存の地面へ渡す。
  // 別の雪板を重ねず、土の細かな凹凸と血・濡れの処理は残す。
  const terrain = rt.world.terrain, groundPos = terrain.geometry.attributes.position;
  const groundColors = new Float32Array(groundPos.count * 3);
  for (let i = 0; i < groundPos.count; i++) {
    rt.world.def.tint(groundPos.getX(i), groundPos.getZ(i), groundPos.getY(i), color);
    color.toArray(groundColors, i * 3);
  }
  terrain.geometry.setAttribute('takatoGroundColor', new THREE.BufferAttribute(groundColors, 3));
  const groundMat = terrain.material, compileGround = groundMat.onBeforeCompile;
  const groundKey = groundMat.customProgramCacheKey();
  groundMat.onBeforeCompile = function (shader, renderer) {
    compileGround.call(this, shader, renderer);
    shader.vertexShader = 'attribute vec3 takatoGroundColor; varying vec3 vTakatoGroundColor;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vTakatoGroundColor = takatoGroundColor;');
    shader.fragmentShader = 'varying vec3 vTakatoGroundColor;\n' + shader.fragmentShader
      .replace('col *= mix(0.94, 1.3, macro);',
        'col = vTakatoGroundColor * clamp(dot(col, vec3(0.333)) * 4.0, 0.65, 1.2) * mix(0.94, 1.3, macro);');
  };
  groundMat.customProgramCacheKey = () => groundKey + '高遠の赤土と残雪';
  groundMat.needsUpdate = true;
  // 共通の丸めた法線を保ち、明るい石肌と上側の苔を混ぜる。形と材質は全体で共用する。
  const rockGeo = rockShape(1, true), sand = new THREE.Color(0x79604b), moss = new THREE.Color(0x655e44);
  const vertices = rockGeo.attributes.position, colors = rockGeo.attributes.color;
  for (let i = 0; i < colors.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
    const patch = (.5 + .5 * Math.sin(x * 7 + z * 5)) * Math.max(0, y);
    color.fromBufferAttribute(colors, i).lerp(sand, .7).lerp(moss, patch * .65);
    colors.setXYZ(i, color.r, color.g, color.b);
  }
  // 暗い石の絵を頂点色へ掛け重ねない。携帯でも一つの軽い材質で石肌を残す。
  const rockMat = new THREE.MeshLambertMaterial({ bumpMap: stoneTex(),
    bumpScale: .06, vertexColors: true, side: THREE.DoubleSide,
    emissive: 0x594733, emissiveIntensity: .12 });
  // 冬も葉の残る杉・松・竹だけを補正する。幹や落葉した枝はそのまま。
  for (const mesh of rt.world.treeMeshes || []) {
    if (!mesh.material.alphaTest || !mesh.material.vertexColors) continue;
    for (let i = 0; i < mesh.count; i++) {
      color.setRGB(.82, 1, .76); mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // 暗い葉の絵と陰が重なっても、黒い塊にならない最低限の緑を残す。
    mesh.material.emissive.setHex(0x26391f);
    mesh.material.emissiveIntensity = .35;
  }
  const rock = new THREE.InstancedMesh(rockGeo, rockMat, 120);
  // 細い葉を四段で曲げる。房の根元は狭く、先は横へしなる。
  const grassGeo = rockTuftShape(true);
  // ほぼ垂直の葉も空の光を受け、日陰で黒い針にならないよう上向きに寄せる。
  const normals = grassGeo.attributes.normal, normal = new THREE.Vector3();
  for (let i = 0; i < normals.count; i++) {
    normal.set(normals.getX(i) * .35, .9, normals.getZ(i) * .35).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  const grass = new THREE.InstancedMesh(grassGeo,
    new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide,
      emissive: 0x6d6143, emissiveIntensity: .18 }), 320);
  for (let i = 0; i < 120; i++) {
    // 河岸段丘の南・北・西の切岸だけに露岩を置く。大手前の平場は空ける。
    const side = Math.floor(i / 40), along = i % 40;
    const x = side < 2 ? -68 + along * 4 : NISHI_X - 2 - (along % 4) * 1.2;
    const z = side === 0 ? CLIFF_Z + 1 + (along % 4) * 1.5
      : side === 1 ? -67 - (along % 4) * 1.5 : (along < 20 ? -54 : 14) + (along % 20) * 2;
    const size = .4 + (i % 5) * .2;
    pose.position.set(x, rt.world.heightAt(x, z) - size * .12, z);
    pose.rotation.set(.1 * Math.sin(i * .7), i * 1.3, .1 * Math.cos(i * .4));
    pose.scale.set(size * (i % 3 === 0 ? 1.65 : 1.25), size * (i % 3 === 1 ? 1.2 : 1), size);
    pose.updateMatrix(); rock.setMatrixAt(i, pose.matrix);
    color.setScalar(.94 + (i % 4) * .02);
    rock.setColorAt(i, color);
  }
  for (let i = 0; i < 320; i++) {
    const x = i < 256 ? 79 + (i % 64) * 1.05 : 40 + (i % 16) * 2;
    const z = i < 256 ? 0 + (i % 2 ? 1 : -1) * (3.5 + (i % 9) * .6 + Math.floor(i / 64) * .8) : -58 + Math.floor((i - 256) / 16) * 5;
    pose.position.set(x, rt.world.heightAt(x, z) + .02, z);
    pose.rotation.set(.2, i * 2.4, .15 * Math.sin(i)); pose.scale.set(1, .7 + (i % 4) * .2, 1);
    pose.updateMatrix(); grass.setMatrixAt(i, pose.matrix);
    color.setHex(i % 7 ? 0xb5a18a : 0x96836c); grass.setColorAt(i, color);
  }
  // 四角い踏み跡は置かず、共通の土の道をそのまま見せる。
  rock.castShadow = rock.receiveShadow = true; grass.receiveShadow = true;
  // 岩の下縁を切岸へ埋める。段差をまたぐ三角の接地板は作らない。
  groundRocks(rt.world, rock);
  rt.scene.add(rock);   // 10/24：草は作らない
  // 岩の根元の共通の草も、この戦だけ枯れ色と空の光を足す。
  rt.scene.traverse((mesh) => {
    if (!mesh.isMesh || mesh.material?.color?.getHex() !== 0x77764f) return;
    mesh.material.color.setHex(0xaa986f);
    mesh.material.emissive.setHex(0x6d6143); mesh.material.emissiveIntensity = .18;
    const normals = mesh.geometry.attributes.normal;
    if (!normals) return;
    for (let i = 0; i < normals.count; i++) {
      normal.set(normals.getX(i) * .35, .9, normals.getZ(i) * .35).normalize();
      normals.setXYZ(i, normal.x, normal.y, normal.z);
    }
    normals.needsUpdate = true;
  });
  // 既存の本丸・櫓の後ろに低い尾根を重ね、切岸の先を一枚の空にしない。
  const peaks = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7),
    new THREE.MeshLambertMaterial({ color: 0x797f79 }), 4);
  for (let i = 0; i < 4; i++) {
    pose.position.set(-150 - i * 24, 12, -105 + i * 62);
    pose.rotation.set(0, i * .7, 0); pose.scale.set(35 + i * 5, 52 + (i % 2) * 18, 44);
    pose.updateMatrix(); peaks.setMatrixAt(i, pose.matrix);
  }
  rt.scene.add(peaks);
}

// 背後の初撃を、足音と足元へ伸びる影で知らせる。八枠を支度時に作る。
function takatoRearShadows(rt) {
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10),
    new THREE.MeshBasicMaterial({ color: 0x29251f, transparent: true, opacity: .32,
      depthWrite: false, side: THREE.DoubleSide }), 8);
  const pose = new THREE.Object3D(), slots = Array.from({ length: 8 }, () => ({ u: null, t: 0, stepped: false }));
  let next = 0;
  mesh.frustumCulled = false;
  for (let i = 0; i < 8; i++) { pose.scale.setScalar(0); pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix); }
  rt.scene.add(mesh);
  return {
    warn(u) {
      const slot = slots[next]; next = (next + 1) % slots.length;
      slot.u = u; slot.t = .6; slot.stepped = false;
      rt.army.play('step', u.pos, 1.8);
    },
    tick(dt) {
      const p = rt.player.u.pos;
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]; slot.t = Math.max(0, slot.t - dt);
        if (slot.t > 0 && slot.u.alive && !rt.over) {
          const u = slot.u, dx = u.pos.x - p.x, dz = u.pos.z - p.z, d = Math.hypot(dx, dz) || 1;
          const x = p.x + dx / d * .65, z = p.z + dz / d * .65;
          pose.position.set(x, rt.world.heightAt(x, z) + .035, z);
          pose.rotation.set(-Math.PI / 2, 0, -Math.atan2(dx, dz));
          pose.scale.set(.35, 1.15, 1);
          if (!slot.stepped && slot.t < .35) { slot.stepped = true; rt.army.play('step', u.pos, 1.8); }
        } else pose.scale.setScalar(0);
        pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// 冷えた朝の息。近い八人までを一つの描画にまとめ、形と置き場所を使い回す。
function takatoBreath(rt) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const mist = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  mist.addColorStop(0, 'rgba(235,239,237,0.32)');
  mist.addColorStop(.4, 'rgba(235,239,237,0.16)');
  mist.addColorStop(1, 'rgba(235,239,237,0)');
  ctx.fillStyle = mist; ctx.fillRect(0, 0, 32, 32);
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }), 8);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.count = 0; rt.scene.add(mesh);
  const people = new Array(8), pose = new THREE.Object3D();
  let scan = 0, tick = 0, count = 0;
  return (dt) => {
    // 昼へ移った後と終戦後は消す。部屋の中や倒れた兵には付けない。
    if (rt.flags.niFell || rt.flags.ending || rt.over) { mesh.visible = false; return; }
    scan -= dt; tick -= dt;
    if (scan <= 0) {
      scan = 1; count = 0;
      const p = rt.player.u;
      if (siegeFighter(p) && !p.naka) people[count++] = p;
      for (const u of rt.army.units) {
        if (count === people.length) break;
        if (u !== p && siegeFighter(u) && !u.naka && u.mesh?.visible &&
            Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 18) people[count++] = u;
      }
    }
    if (tick > 0) return;
    tick = .1;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const u = people[i], age = (rt.t + i * .47) % 3.6;
      if (age > .9 || !siegeFighter(u) || u.naka || !u.mesh?.visible) continue;
      const fade = Math.sin(age / .9 * Math.PI), heading = u.heading || 0;
      const drift = .18 + age * .25;
      pose.position.set(u.pos.x + Math.sin(heading) * drift + age * .08,
        u.pos.y + (u.bodyHeight || 1.72) * .9 + age * .12, u.pos.z + Math.cos(heading) * drift);
      pose.quaternion.copy(rt.camera.quaternion);
      pose.scale.set((.2 + age * .4) * fade, (.12 + age * .22) * fade, 1);
      pose.updateMatrix(); mesh.setMatrixAt(n++, pose.matrix);
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
  };
}

// 部隊の多点の道：着いたら次の点へ、最後は attack（b_hiei_mtn.js の setRoute・advance・tickRoutes と同じ形）。
// b.assault（下で門ごとに持たせる）があれば、最後は assault にする：塀・門ごしで敵に届かない間、
// 立ち尽くさず（確かめで見つけた「道があるのに20秒動かない兵」）門を打ちに掛かる
function setRoute(b, pts) { b._route = pts; b._routeGate = null; b._i = 0; advance(b); }
function advance(b) {
  if (!b._route || b._i >= b._route.length) {
    b.order({ id: b.tkRetreat ? 'hold' : b.assault ? 'assault' : 'attack', form: b.kind === 'ashigaru' ? 'yari' : 'line' });
    if (b.tkRetreat && b.real) b.real.facing = Math.PI / 2;
    b._route = null; return;
  }
  const [x, z] = b._route[b._i++];
  b.order({ id: 'move', to: { x, z }, form: 'column' });
}
// 破れていない門をまとめて渡すと、生きている最初の一つを的にする（外の門が破れれば内の門、という順）
function gateAssault(...gates) {
  const target = () => { for (const g of gates) if (g && g.struct && g.struct.alive && !g.opened) return g.struct; return null; };
  target.gateOnly = true;
  return target;
}
// 陽動の手：決まった的（門）が無いので、近い城方の塀・柵を的にする（確かめで見つけた「陽動の手が20秒止まる」の直し）
function nearWallAssault(rt) {
  return (u) => {
    let best = null, bd = 45;
    for (const s of rt.army.structs) {
      if (!s.alive || !s.seg || s.team !== 1) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const d = Math.hypot(u.pos.x - mx, u.pos.z - mz);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
}
function tickRoutes(list) {
  for (const b of list) {
    // 大手の衆は森長可・河尻秀隆がその場で下知する。西の信忠の使番は城を越えて来られず、下知が届かなかった。
    if (b.real && b.directOrders) b.real.directOrders = true;
    if (!b._route || deadB(b)) continue;
    // 竹束を据えている間は道順を進めない。留める処理の保存した下知と食い違わせない。
    if (b.real?._pinH) continue;
    const gate = b.assault?.gateOnly ? b.assault() : null;
    if (b._routeGate) {
      if (b._routeGate.alive && !b._routeGate.opened) continue;
      const opened = b._routeGate;
      b._routeGate = null;
      const point = b._route[b._i - 1];
      // 門の真ん中で縦隊を止めない。後列の持ち場が塀・切岸に掛かり、
      // 到着待ちから抜けられなくなる。破った門は通過して次の道の点へ寄せる。
      if (opened.seg && Math.hypot(point[0] - (opened.seg[0] + opened.seg[2]) / 2,
          point[1] - (opened.seg[1] + opened.seg[3]) / 2) < 3) {
        advance(b); continue;
      }
      b.order({ id: 'move', to: { x: point[0], z: point[1] }, form: 'column' });
    }
    const [x, z] = b._route[b._i - 1];
    if (gate?.seg && gate.alive && !gate.opened && b.real &&
        Math.hypot(x - (gate.seg[0] + gate.seg[2]) / 2, z - (gate.seg[1] + gate.seg[3]) / 2) < 3 &&
        b.real.units.some((u) => u.alive && !u.fleeing && !u.downed && !u.woundOut &&
          Math.hypot(u.pos.x - (gate.seg[0] + gate.seg[2]) / 2, u.pos.z - (gate.seg[1] + gate.seg[3]) / 2) < 6)) {
      // 閉じた門を越す行軍の下知を止め、実兵で今の門を破る。
      // 枡形の折れを歩き終えてから打つ。距離だけで内門へ向かうと角の塀に阻まれる。
      // 長い縦隊の平均ではなく、門へ着いた先頭で打ち始める。
      b._routeGate = gate; b.order({ id: 'assault', form: 'column' }); continue;
    }
    // 縦隊の後列は門の外に残る。平均位置を待つと、到着して待機に戻った隊も次へ進めない。
    const g = b.real;
    const arrived = g && g.order === 'hold' && !g.onArrive &&
      Math.hypot(g.anchor.x - x, g.anchor.z - z) < 0.5;
    // 門前では後列の平均を待たず、先頭が道の点へ着いたら次へ送る。
    const headArrived = g?.order === 'move' && g.units.some((u) => u.alive && !u.fleeing && !u.downed && !u.woundOut && Math.hypot(u.pos.x - x, u.pos.z - z) < 1.2);
    if (arrived || headArrived || Math.hypot(b.pos.x - x, b.pos.z - z) < 2.5) advance(b);
  }
}
// 今いる曲輪から本丸へ。西口が先に抜けても、大手の隊は曲がる門を省かない。
function toHonmaru(rt, b, enterKeep = false) {
  if (deadB(b)) return;
  const F = rt.flags, p = b.pos;
  const road = [[GATE_HON.x, GATE_HON.z], [-45, -8], [-43.6, -4], [-45, 0], [-52, 0]];
  if (enterKeep) road.push([-58, 0], [-62, 0]);
  if (F.C.kuruwa.hon.test(p.x, p.z)) {
    b.assault = gateAssault(F.gates.honInner);
    setRoute(b, road.slice(3));
  } else if (F.C.kuruwa.ni.test(p.x, p.z)) {
    b.assault = gateAssault(F.gates.honOuter, F.gates.honInner);
    setRoute(b, [[-2.125, -8], ...road]);
  } else if (p.x < NISHI_X) {
    b.assault = gateAssault(F.gates.karamete, F.gates.honOuter, F.gates.honInner);
    setRoute(b, [...ROAD_KARAMETE.slice(1), ...road.slice(3)]);
  } else {
    b.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner, F.gates.gateNi, F.gates.honOuter, F.gates.honInner);
    setRoute(b, [...ROAD_OTE.slice(F.C.kuruwa.san.test(p.x, p.z) ? 7 : 1, 10), ...road]);
  }
}
// 十四部隊を十四人ずつ。物見の射手と室内の守り・居所・自分の組も合わせて約二百五十人。
function mkB(rt, o) {
  // 総勢は備の表へ。近い一組は全員が本物。塀を抜けて消える軽い後列を置かない。
  // 交戦中の消失・同じ場所への補充・将の再出現をこの戦では行わない。
  const b = makeButai(rt, { ...o, nominal: 14, real: o.real ?? 14, maxReal: 14,
    nearReal: 14, farReal: 14, noSwitch: true, lightWidth: o.at.x < NISHI_X ? 2 : 7, lightDepth: 12,
    mix: o.kind === 'ashigaru' ? { ashigaru: 0.8, samurai: 0.2 } : undefined });
  b.paperNominal = o.paperNominal; // 備の推定人数。近い実兵十四人とは別。
  if (b.light) b.light.visible = false; // 通れず本物に替えられない場所へ軽い兵を残さない。
  if (b.real) b.real.noAI = true;
  return b;
}
// 搦手の尾根道は幅六メートル。横陣の端や遠景の散らばった位置を持ち場にしない。
function mkKarameteTroops(rt, o) {
  const b = mkB(rt, { ...o, real: 0 });
  // 初めに本物へ替える位置も尾根の幅に収める。
  const canSpawn = b._canSpawn, grow = b.growReal;
  b._canSpawn = (x, z) => canSpawn(x, z) && (x >= NISHI_X - 2 || Math.abs(z) < 1.3);
  b.order({ id: 'hold', form: 'column' });
  b.growReal = (n) => {
    const made = grow.call(b, n);
    // 城攻めの道に従う。野戦の頭が隊を切岸の横へ広げないようにする。
    if (b.real) b.real.noAI = true;
    return made;
  };
  b.growReal(14);
  return b;
}
function deadB(b) { return !b || !b.real || b.real.count <= 0 || b.real.routed || b.real.units.every((u) => !u.alive || u.fleeing || u.woundOut || u.noTarget); }

// 高遠の守りは土橋と曲がる口を通って退く。本丸では奥の守りを続ける。
// 道と門の記録は準備時だけ作り、見回りは一秒ごと。共通の守備判断を変えない。
function takatoDefense(rt) {
  const F = rt.flags;
  const hon = [[-2.125, -8], [GATE_HON.x, GATE_HON.z], [-45, -8], [-43.6, -4], [-45, 0], [-52, 0]];
  const san = [[57, 10], [43, GATE_NI.z], [GATE_NI.x, GATE_NI.z], [-2.125, -8]];
  const posts = [
    { b: F.sanSpear, zone: 'san', road: san, next: 'ni' },
    { b: F.sanGun, zone: 'san', road: san, next: 'ni' },
    { b: F.hodoinSpear, zone: 'hon', road: hon, next: 'hon' },
    { b: F.niSpear, zone: 'ni', road: hon, next: 'hon' },
  ];
  const doors = [F.gates.gateNi, F.gates.honOuter, F.gates.honInner].map((gate) => {
    const s = gate.struct, x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2;
    const end = gate === F.gates.gateNi ? san[san.length - 1] : hon[hon.length - 1];
    return { gate, x, z, side: Math.sign((end[0] - x) * s.nx + (end[1] - z) * s.nz) || 1, active: false };
  });
  return { usingGate: (gate) => doors.some((q) => q.gate === gate && q.active), tick() {
    if (!F.refresh || F.step < 1) return;
    for (const p of posts) {
      const b = p.b;
      if (deadB(b) || b._route) continue;
      if (p.zone === 'hon') continue;
      const lost = p.zone === 'san' ? F.sanFell : F.niFell;
      const generalDown = b.general && !b.real.units.some((u) => u.alive && u.name === b.general);
      if (!lost && !generalDown && b.real.count > 4 && b.morale >= 22) continue;
      b.tkRetreat = true; b.assault = null;
      for (const q of doors) {
        if ((p.zone === 'san') !== (q.gate === F.gates.gateNi)) continue;
        q.active = true;
        if (!q.gate.breached && !q.gate.opened) q.gate._openNow(false);
      }
      setRoute(b, p.road);
      p.zone = p.next; p.road = hon; p.next = 'hon';
      battleEvent(rt, EVENT_RETREAT, b.pos, b.real, 1, false, '城兵が土橋を渡り、奥の備えへ退く');
    }
    for (const q of doors) {
      if (!q.active || q.gate.breached) continue;
      let passed = true;
      const s = q.gate.struct;
      // 残る後列と、同じ門を使う出撃の組も待つ。秒数だけで閉めない。
      for (const p of posts) {
        if (!p.b.tkRetreat || deadB(p.b)) continue;
        for (const u of p.b.real.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
          if (((u.pos.x - q.x) * s.nx + (u.pos.z - q.z) * s.nz) * q.side < 2) { passed = false; break; }
        }
        if (!passed) break;
      }
      if (q.gate === F.gates.gateNi && (F.sallyOut || F.sallyUntil || F.sallyReturning || F.reserveDef._route)) passed = false;
      if (passed) { if (!q.gate.occupied) q.gate.close(); q.active = false; }
    }
  } };
}

// 退避の印も自動操作の一歩も、土橋と曲がる口の足場を共用する。
// 共通の探索が半秒ごとに呼ぶ。調べる点は使い回し、兵・形・材質を増やさない。
function takatoRetreatPath(rt, to) {
  const from = rt.player.u.pos;
  if (!localClear(rt.army, from, to, true)) return false;
  const step = rt.flags.retreatStep;
  const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .75));
  let y = from.y;
  for (let i = 1; i <= count; i++) {
    step.x = from.x + (to.x - from.x) * i / count;
    step.z = from.z + (to.z - from.z) * i / count;
    step.y = groundAt(rt.world, step.x, step.z, y);
    // 下りも登りと同じ歩幅で調べる。堀底の平らな所へ飛び下りる退路を選ばない。
    if (Math.abs(step.y - y) > .65 || !clearFoot(rt, step)) return false;
    y = step.y;
  }
  return true;
}

const takato_siege = {
  // 見物の民は共用の描画と避難処理だけを使い、兵の名簿・当たり・戦功へ入れない。
  civilianCrowd: {
    bounds: { minX: -160, maxX: 180, minZ: -100, maxZ: 100 },
    bands: [
      { x: 117, z: 67, kinds: ['townsman', 'merchant', 'woman', 'child'], mode: 'watch', route: peopleRoute(PEOPLE_PATHS[1]) },
      { x: 142, z: 76, kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'], mode: 'watch', route: peopleRoute(PEOPLE_PATHS[2]) },
      // 法幢院の堂の東側で見守り、東の曲輪の口から里道へ。南の断崖へ下ろさない。
      { x: -53, z: 63, kinds: ['monk', 'monk', 'farmer'], mode: 'watch',
        route: peopleRoute([[-50, 66], [-41, 66], ...PEOPLE_PATHS[0]]) },
    ],
  },
  // 揺れと壁の補正が済んだ後、堀の砂へ視点が戻らないようにする。
  clampCamera(rt, pos) {
    const p = rt.player, u = p.u;
    if (NAKA.cur || rt.game?.photo || p.fpK >= .5 || p.mounted) return;
    const head = u.pos.y + 2.05 * (u.mesh?.scale.y || 1);
    // 味方の肩と逆茂木の上に、敵を見る隙間を残す。繰り返しても高さを足し続けない。
    pos.y = Math.max(pos.y, head + .55);
    const dx = pos.x - u.pos.x, dz = pos.z - u.pos.z, dy = pos.y - head;
    // 自分から視点までの線が斜面を横切る時は、その手前へ寄せる。
    const steps = Math.min(24, Math.max(1, Math.ceil(Math.hypot(dx, dz) / .4)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, x = u.pos.x + dx * t, z = u.pos.z + dz * t;
      if (rt.world.heightAt(x, z) + .45 > head + dy * t) {
        const safe = (i - 1) / steps;
        pos.set(u.pos.x + dx * safe, head + dy * safe, u.pos.z + dz * safe);
        break;
      }
    }
    // 視点の中心だけでなく、近写しの画面の端も砂から離す。
    let floor = rt.world.heightAt(pos.x, pos.z);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      floor = Math.max(floor, rt.world.heightAt(pos.x + Math.cos(a) * .65, pos.z + Math.sin(a) * .65));
    }
    pos.y = Math.max(pos.y, floor + .45);
  },
  jinkei: [TAKATO_ATTACK, TAKATO_DEFEND],
  taisho: { b: null }, // 城将の討死だけで共通処理に勝利させず、本丸の確保まで戦う。
  noTaishoRaid: true, // 城兵の出撃はこの戦が管理する。別の本陣襲撃と逆向きの帰陣命令を重ねない。
  nearHatFadeRadius: 6,
  nearAllyFadeLevel: 1,
  onRearApproach(rt, u) { rt.flags.rearShadows?.warn(u); },
  nearAllyFadeRadius: 4.8, // 近い味方の背を既存の共用材質で透かす。兵の動きと当たりは残す。
  rangedWarning: true, // 狭間の射手が見えなくても、発射前の向きを知らせる。
  rangedThreatNeedsShot: true, // 玉込め中の射手の狙いだけで、門の道案内を退避へ替えない。
  meleeThreatHeight: 3, // 堀や塀の別の段にいる兵を、目前の打ち手として案内しない。
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  // 足や腕に残る軽傷だけで門の道順を隠さない。出血と深手は手当てへ導く。
  woundRetreatNeeded: (rt) => rt.player.u.wounds?.bleed > .0001 || rt.player.u.hp < rt.player.u.maxHp * .6,
  keepWoundRetreatReason: true,
  retreatGuideLabel(rt, reached) {
    const p = rt.player;
    if (this.woundRetreatNeeded(rt)) {
      if (p.treatmentLeft <= 0) return '布がない。味方の後ろへ退け';
      if (p.treatmentReady) return p.treating ? '手当てを押し続ける' : '「手当て」を三秒長押し';
      return '味方の後ろへ下がって手当て';
    }
    return reached ? '味方の後ろで構えよ' : '味方の後ろへ下がれ';
  },
  retreatPathAllowed: takatoRetreatPath,
  botRetreatStepAllowed: takatoRetreatPath,
  dodgePointAllowed: takatoRetreatPath,
  treatmentTaskGuidance: true,
  treatmentApproachLabel: '印まで下がって手当て',
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.mounted) return '馬を降りて手当て';
    if (p.treatmentReady) return p.treating ? '手当てを押し続ける' : '「手当て」を三秒長押し';
    if (!cue?.valid) return '敵から離れ、味方の後ろへ';
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius) return '印まで下がって手当て';
    if (p.treatmentNext > rt.t) return `次の手当てまで${Math.ceil(p.treatmentNext - rt.t)}秒`;
    return '足を止め、構えを解いて手当ての支度';
  },
  introTaskFirst: true,
  compactIntro: true,
  introText: '竹束の切れ目を通り、味方と進もう。城兵が来たら、味方の槍の列で受けよう。退く敵は追わず、道の印に沿って門へ。出血や深い傷は、味方の後ろで手当てしよう。',
  gateRamHold: 1.2, // 掛矢の重い一打ごとに間を置き、同じ音を鳴らし続けない。
  noWake: true, // 部隊が本物と遠景を管理する。共通の追加兵を重ねない。
  spawn: { x: 115, z: 0, heading: -Math.PI / 2 },
  noFieldMap: true,   // 稲生の標準：小さな地図は出さず、行き先のピンと敵の印に絞る
  playerRegen: 0.02,   // 稲生の標準：戦っていない間は命が戻り、血も止まる（player_hurt.js）
  playerTaken: 0.6,   // 受ける傷を六割に（塀の上と曲輪の城兵に囲まれやすい。稲生の初陣と同じ）
  // 身の回りの当時の場（timeslip_field.js）。天正十年三月二日は今の三月末・信濃の山の雪解け。
  // 解けた雪でぬかるむ大手道と門の前、水たまり。枯れ草の丈は低い。門の前ほど倒れた槍・矢・脱げた陣笠が多い。
  timeslip: {
    wet: 0.6, dust: 0.1, trample: 0.3, debris: 1, arrows: 0.8,
    grass: 0x8c8462, grassTints: [0xffffff, 0xd8ccaa, 0xb0a888], grassH: 0.75, tallGrass: 0.45,
    flagColors: [0xe8e4d8, 0x1e1c1a, 0x8a2a22],
    fights: (rt) => Object.values(rt.flags.gates || {}).map(g => [g.inner.x, g.inner.z, 24]),
  },
  world: {
    seed: 15930,
    allyTaken: 0.5,   // 寄せ手（数で勝る織田勢）は城兵より傷みにくい。門を一つずつ取り続けられるように

    time: 'day',
    springSnowPatch: false, // この戦の tint で北斜面と林床だけに薄い残雪を混ぜる。
    slopeRockFaces: true, // 急坂では厚みを斜面の外へ向ける。
    winter: true, // 落葉樹と花は冬の姿。春の山国に夏の茂みを置かない。
    nearStakeFade: true,
    noLowBlobShadows: true, // 携帯では兵の足元の黒い円板を省く。背後の知らせはこの戦の足音と短い影で残す。
    rockCenterGround: false, // 接地板を省き、切岸へ岩の下縁まで埋める。
    rockDrawGround: true,
    rocks: 0, // 共通の無作為な岩は置かず、専用の120個を切岸だけへまとめる。
    curvedRockTufts: true,
    groundedSlopeRocks: true, // 岩を斜面へ埋め、地面をまたぐ板状の人工の陰を置かない。
    nearAllyFadeRadius: 4.8, // 近い味方は消さず、描く時の半透明に任せる。
    thickTrees: true, // 杉の枝と葉の立体の芯を共用し、抜き板の林を避ける。
    treeScale: { crown: 0.55, trunk: 0.6, height: 1.1 }, // 早春の段丘林。葉の枝張りと幹を細くし、背を伸ばす。
    treePadMul: 1.3, // 寄せ道の脇に幹を密集させず、兵の見通しを空ける。
    lookoutKind: 'ro', // 常設の物見は板囲いと板屋根。盾を並べる仮設櫓にしない。
    lookoutLogFrame: true, // 高画質の井楼にも丸太組みの指定を通し、垂直な柱と交互の横木にする。
    clothFolds: true, // この戦の置き幟に皺と乳の輪を付ける。
    fallenHelmets: true, // 落ちた笠の最下点を、斜面や櫓の板床へ合わせる。
    autumn: true, // 共通の枯れ草の色を使う。木は winter の姿を優先する。
    fieldStage: 'stubble',
    mist: false,
    wind: [0.8, 0.3],
    fogFar: 360,   // 開戦の所から、尾根の上の三の丸・本丸の屋根が霞まずに見える遠さ（携帯の見える遠さを掛けても 250m ほど）
    muddy: 0.1,
    climbTan: 0.70,
    terrainTags: true,     // M1：坂・道の速さ・向き変えを効かせる（西の切岸が本当に登りにくくなる）
    // 信忠の旗本の後列まで尾根道をつなぐ。門へ進む道順は変えない。
    paths: [{ pts: [[-146, 0], ...ROAD_KARAMETE], w: 3 }, ...TAKATO_PLAN.paths.map((p) => ({ pts: p.pts, w: 3 })), ...PEOPLE_PATHS.map((pts) => ({ pts, w: 3 }))],
    // 文化庁「高遠城跡」：三峰川・藤沢川の合流する段丘先端。
    // https://online.bunka.go.jp/heritages/detail/201686
    // 川筋は縮尺に合わせた推定。西の寄せ道を横切らず、崖下で合流して西へ流す。
    // 点は上流から下流へ並べ、水面の流れも城の東へ逆流させない。
    streams: [
      { pts: [[170, -104], [0, -108], [-90, -100], [-155, -70], [-190, -90]], w: 9, depth: 1.6 },
      { pts: [[170, 115], [-30, 110], [-116, 90], [-155, 26], [-180, -35], [-190, -90], [-230, -90]], w: 12, depth: 1.8 },
    ],
    height,
    tint(x, z, h, c) {
      const dx = (height(x + 1, z) - height(x - 1, z)) * .5;
      const dz = (height(x, z + 1) - height(x, z - 1)) * .5;
      const slope = Math.hypot(dx, dz), flat = 1 - Math.min(1, slope / .8);
      const patch = .5 + .5 * Math.sin(x * .17 + Math.cos(z * .11)) * Math.cos(z * .19);
      const trodden = distToPolyline(x, z, ROAD_OTE) < 5;
      const dryGrass = flat * (trodden ? .08 : .45) * patch;
      c.setRGB(.42 + dryGrass * .14, .33 + dryGrass * .15, .24 + dryGrass * .12);
      // 北は -z。北へ下がる面と、道から離れた高い林床に残す。低い河原は赤土。
      const north = Math.max(0, dz) / Math.sqrt(1 + slope * slope);
      const shade = trodden ? 0 : Math.max(north, flat * (x < NISHI_X - 6 ? .65 : .25));
      const snow = Math.min(.55, shade * Math.max(0, (patch - .45) / .55))
        * Math.max(0, Math.min(1, (h - 16) / 12)) * (1 - Math.min(1, Math.max(0, slope - 1)));
      c.setRGB(c.r + (.8 - c.r) * snow, c.g + (.82 - c.g) * snow, c.b + (.85 - c.b) * snow);
      // 切岸は赤土を暗くし、岩の色を薄く混ぜる。
      if (slope > .8) c.multiplyScalar(.88 + .04 * patch);
    },
    clear: (x, z) => distToPolyline(x, z, ROAD_OTE) < 12 || TAKATO_PLAN.paths.some((p) => distToPolyline(x, z, p.pts) < 5) || PEOPLE_PATHS.some((pts) => distToPolyline(x, z, pts) < 4) || CLEAR_BOUNDS.some((k) => x >= k.x0 && x <= k.x1 && z >= k.z0 && z <= k.z1),
    trees: 500,
    tufts: 1800,
    tuftTint: 0xb5a18a,
    treeDensity: (x, z) => (x < NISHI_X - 6 ? 1.2 : 0.4),
    groves: [{ x: -57, z: -40, r: 16, n: 18 }],
    fleeOut: (x, z, team) => team === 1 && z < -140,
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { castleSite: 'HIST_B', nishinaMorinobu: 'HIST_A', twoFronts: 'HIST_A', nobutadaAdvance: 'HIST_A', oneDay: 'HIST_A', cliffs: 'HIST_B', routes: 'GAME_C', ladders: 'GAME_C', lordJudgement: 'GAME_C' };
    F.step = 0; F.ek = 0; F.ak = 0; F.fow = true;
    F.pushKills = { san: 0, ni: 0, hon: 0 };
    F.handKills = { san: 0, ni: 0, hon: 0 }; // 自分と組の実際の討ち取りだけを下知に反映する。
    F.retreatStep = { x: 0, y: 0, z: 0 };
    // 傷は共通の当たり処理に任せる。時刻による体力の下限を設けない。
    resetGates(); resetLadders(); flReset();
    // 総勢の数字より先に、見える城と自分の進む口を結ぶ。
    rt.banner('夜明けの高遠城', '信忠の大軍が、数千の守る城へ。東の大手道を進め');

    // ---- 縄張り：塀・門・櫓を castle_plan.js に建てさせる（C1・C2） ----
    const C = F.C = buildCastlePlan(rt, TAKATO_PLAN, { baseHeight: castleBase, edgeW: 3, buildGates: false, buildTowers: true, life: true, team: 1 });
    C.gateObjs = takatoGates(rt);
    F.earthMat = takatoWallMaterial();
    if (C.seat?.building) takatoEarthWalls(C.seat.building, F.earthMat);
    takatoLife(rt);
    takatoSiegeStores(rt);
    takatoSpring(rt);
    takatoGround(rt);
    F.coldBreath = takatoBreath(rt);
    F.rearShadows = takatoRearShadows(rt);
    // 束ねた杭も近い面だけなめらかに透かす。専用材質は支度時に共有する。
    const nearMats = new Map();
    rt.scene.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.userData.camNear) return;
      const fade = (source) => {
        if (!nearMats.has(source)) {
          const mat = source.clone(); mat.transparent = true; mat.depthWrite = false;
          mat.userData.camNearSmooth = true; nearMats.set(source, mat);
        }
        return nearMats.get(source);
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(fade) : fade(mesh.material);
    });
    F.botKuruwa = Object.values(C.kuruwa);
    const sanC = C.kuruwa.san.centroid, niC = C.kuruwa.ni.centroid, honC = C.kuruwa.hon.centroid;

    // ---- 喰違いの冠木門：外と内の二つを、それぞれ壊せる門にする ----
    const G = C.gateObjs;
    G.ote.outer.struct.name = '大手門（一の門）'; G.ote.inner.struct.name = OTE.name;
    G.gate_hon.outer.struct.name = '本丸門（一の門）'; G.gate_hon.inner.struct.name = GATE_HON.name;
    G.gate_ni.struct.name = GATE_NI.name;
    G.karamete.struct.name = KARAMETE.name;
    G.gate_hodoin.struct.name = GATE_HODOIN.name;
    F.gates = {
      oteOuter: makeGate(rt, G.ote.outer, { name: '大手門（一の門）', guardTeam: 1 }),
      oteInner: makeGate(rt, G.ote.inner, { name: OTE.name, guardTeam: 1 }),
      gateNi: makeGate(rt, G.gate_ni, { name: GATE_NI.name, guardTeam: 1 }),
      honOuter: makeGate(rt, G.gate_hon.outer, { name: '本丸門（一の門）', guardTeam: 1 }),
      honInner: makeGate(rt, G.gate_hon.inner, { name: GATE_HON.name, guardTeam: 1 }),
      karamete: makeGate(rt, G.karamete, { name: KARAMETE.name, guardTeam: 1 }),
      hodoin: makeGate(rt, G.gate_hodoin, { name: GATE_HODOIN.name, guardTeam: 1 }),
    };

    F.gatePairs = { ote: [F.gates.oteOuter, F.gates.oteInner], hon: [F.gates.honOuter, F.gates.honInner] };
    // 門は掛矢の打ち手が数人でも破れる固さに（寄せが門前で止まり続けて、四〜七分を越えないように）
    for (const g of Object.values(F.gates)) { const st = g.struct; st.hp *= 0.55; if (st.maxHp) st.maxHp *= 0.55; }
    F.honPost = { x: -52, y: rt.world.heightAt(-52, 0), z: 0 };
    timeslipField(rt);   // 身の回りの雪解けのぬかるみ・倒れた槍と矢・枯れ草（def.timeslip）
    F.sallyGates = [F.gates.gateNi, F.gates.oteInner, F.gates.oteOuter].map((gate, i) => {
      const s = gate.struct, x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2;
      return { gate, x, z, side: Math.sign((91 - x) * s.nx + (0 - z) * s.nz) || 1, passed: false,
        outAfter: [2, 6, 8][i], backAfter: [8, 4, 2][i] };
    });
    // ---- 本丸の主殿（見た目だけ。飾り） ----
    // 城主の居所（kaito 10/1）：天守の無い戦国期の城なので、仁科盛信は主殿（茅葺・質素な館）の中。
    // 江戸期の御殿にしない（final7-1579-1582-spec 73〜74章）。旗本が東の上がり口を守り、
    // 攻め手が主殿へ上がるまでは討てない。主殿は人が上がれるよう、丸い当たり（solidR）を外す
    // 主殿は縄張り（castles/takato.js の lordSeat）から castle_plan.js が建てる：中に入れて、奥の間に城主（kaito 10/2）

    // ---- 西の切岸の梯子（C3）：足場（ROAD_NISHI の終わり）から、本丸の西の縁のすぐ内へ ----
    const foot = { x: NISHI_X - 2, z: 8 };
    F.nishiLadder2 = placeLadder(rt.world, { foot, topY: rt.world.heightAt(-74, 6) + 0.2, topX: -74, topZ: 6, hp: 50, team: 0, name: '西の切岸の梯子' });

    // ---- 総勢のうち各口の前列約五百を扱い、その一部だけを本物の兵にする ----
    // 門の内の口（inner）のすぐそばに立たせる：siege_gate.js は「門兵（guardTeam）が居なくなったら開く」ので、
    // 曲輪の真ん中に置くと（遠すぎて）始めから門兵が居ない事になり、すぐ開いてしまう（確かめで見つけた）
    const midOf = (s) => ({ x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 });
    const oteGP = midOf(F.gates.oteInner.struct), niGP = midOf(F.gates.gateNi.struct);
    const karaGP = midOf(F.gates.karamete.struct), honGP = midOf(F.gates.honInner.struct);
    F.sanSpear = mkB(rt, { name: '三の丸の備え（諏訪勝右衛門）', general: '諏訪勝右衛門', team: 1, faction: 'takeda', kind: 'ashigaru', paperNominal: 140, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: oteGP.x - 5, z: oteGP.z }, facing: Math.PI / 2 });
    F.sanGun = mkB(rt, { name: '三の丸の鉄砲（塀の上）', team: 1, faction: 'takeda', kind: 'gun', paperNominal: 20, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: 69, z: 20 }, facing: Math.PI / 2 });
    F.niSpear = mkB(rt, { name: '二の丸の備え（小山田昌行）', general: '小山田昌行', team: 1, faction: 'takeda', kind: 'ashigaru', paperNominal: 90, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: niGP.x - 5, z: niGP.z }, facing: Math.PI / 2 });
    F.hodoinSpear = mkB(rt, { name: '西の搦手の備え', team: 1, faction: 'takeda', kind: 'bow', paperNominal: 70, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: karaGP.x + 5, z: karaGP.z }, facing: -Math.PI / 2 });
    F.honGuard = mkB(rt, { name: '本丸の仁科盛信の衆', team: 1, faction: 'takeda', kind: 'ashigaru', paperNominal: 150, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: honGP.x - 5, z: honGP.z }, facing: Math.PI / 2 });
    // 既存の控えを門外の寄せ場へ出す。門の内の守りと兵数は保つ。
    F.reserveDef = mkB(rt, { name: '城方の控え', team: 1, faction: 'takeda', kind: 'ashigaru', paperNominal: 30, armor: TAKEDA.armor, flag: TAKEDA.flag, at: { x: 80.5, z: -6 }, facing: Math.PI / 2 });   // 開戦の時は大手の南脇の塀際で先手と斬り合っている（25秒の画面の乱戦）
    F.defenders = [F.sanSpear, F.sanGun, F.niSpear, F.hodoinSpear, F.honGuard, F.reserveDef];
    F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
    F.keep = makeLordKeep(rt, {
      name: '仁科盛信', spot: C.seat ? C.seat.spot : { x: honC.x, z: honC.z }, naka: C.seat && C.seat.naka, mouth: { x: honC.x + 2, z: honC.z }, facing: Math.PI / 2, guardN: 4,
      faction: 'takeda', armor: TAKEDA.armor, flag: TAKEDA.flag,
      onReach: () => rt.say('仁科盛信', 'この城は渡さぬ。最後まで城を守る！', 4),
    });
    F.commander = { get alive() { return !F.keep.down; }, get real() { return F.keep.lord; } };
    // 盛信の最期は専用の場面で描く。共通の城主との斬り合い・討ち取りにはしない。
    const lord = F.keep.lord;
    lord.noTarget = true; lord.invuln = true; lord.group.noAI = true;
    lord.aiT = Infinity; lord.receivedSignal = lord.group.signalSerial; lord.perch = { x: lord.pos.x, z: lord.pos.z };
    const keepTick = F.keep.tick;
    F.keep.tick = () => { keepTick(); lord.noTarget = true; };
    if (F.keep.naka) { F.keep.naka.onEnter = null; F.keep.naka.onLevel = null; }
    F.lordState = 'defend';
    F.lastGuards = [...F.keep.guard.units, ...F.keep.kin.flatMap((g) => g.units)];

    // はなが刀で戦った伝え。居場所と衣は推定。準備時の一人だけで、兵を追加し続けない。
    F.hanaGroup = rt.army.addGroup({ team: 1, faction: 'takeda', name: 'はな（諏訪勝右衛門の妻）',
      anchor: { x: -51, z: -4 }, facing: Math.PI / 2, order: 'hold', aggro: 0, width: 2, morale: 100, noRout: true, noAI: true });
    rt.army.spawn(F.hanaGroup, [{ type: 'samurai', n: 1, o: { name: 'はな', x: -51, z: -4,
      weapon: 'sword', reach: 1.75, horse: false, kosode: 1, kosodeCol: 0x67515e,
      hat: 'none', flag: null, haori: 0, sode: false, kote: 0, menpo: 0 } }]);
    F.hana = F.hanaGroup.units[0];
    F.hana.noTarget = true; F.hana.aiT = Infinity;
    F.hana.receivedSignal = F.hanaGroup.signalSerial;
    F.hana.perch = { x: F.hana.pos.x, z: F.hana.pos.z };

    // ---- 攻めは信忠の約三万。城の近くでは小さな部隊だけを動かす ----
    F.oteSpear = mkB(rt, { name: '東の大手先手（森長可）', general: '森長可', team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 900, armor: ODA.armor, flag: TAKATO_ATTACK.sonae[1].flag, mon: TAKATO_ATTACK.sonae[1].mon, at: { x: 127, z: 0 }, facing: -Math.PI / 2 });
    F.oteGun = mkB(rt, { name: '大手の先手（鉄砲）', team: 0, faction: 'oda', kind: 'gun', paperNominal: 400, armor: ODA.armor, flag: ODA.flag, at: { x: 135, z: -8 }, facing: -Math.PI / 2 });
    F.karameteSpear = mkKarameteTroops(rt, { name: '西の搦手の手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 500, armor: ODA.armor, flag: ODA.flag, at: { x: -108, z: 0 }, facing: Math.PI / 2 });
    F.karameteBow = mkKarameteTroops(rt, { name: '西の搦手の手（弓）', team: 0, faction: 'oda', kind: 'bow', paperNominal: 300, armor: ODA.armor, flag: ODA.flag, at: { x: -116, z: 0 }, facing: Math.PI / 2 });
    F.nishiLadder = mkB(rt, { name: '西の切岸の手（梯子）', team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 300, armor: ODA.armor, flag: ODA.flag, at: { x: -102, z: 12 }, facing: Math.PI / 2 });
    F.yodou = mkB(rt, { name: '陽動の手', team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 200, armor: ODA.armor, flag: ODA.flag, at: { x: -52, z: -78 }, facing: 0 });
    F.reserve = mkB(rt, { name: '大手の後詰（河尻秀隆）', general: '河尻秀隆', team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 900, armor: ODA.armor, flag: ODA.flag, at: { x: 109, z: 4 }, facing: -Math.PI / 2 });
    F.nobutada = mkKarameteTroops(rt, { name: '西の織田信忠の旗本', general: '織田信忠', team: 0, faction: 'oda', kind: 'ashigaru', paperNominal: 1500, armor: ODA.armor, flag: ODA.flag, at: { x: -124, z: 0 }, facing: Math.PI / 2 });
    // 信忠は西の搦手から塀際へ進む。taisho.js の adopt() は invuln 持ちの味方の総大将に
    // 深手（討たれない）の退きを与えるので、ここで立てておく（kaito 10/1。滝川一益の手と同じ作り）
    if (F.nobutada.taishoU) F.nobutada.taishoU.invuln = true;
    // 寄せ手は数で勝る。三分で総崩れして戦が終わらないよう、大手の先手と後詰は崩れずに戦い続ける（高遠は城方の全滅で終わった）
    for (const b of [F.oteSpear, F.reserve]) if (b?.real) b.real.noRout = true;
    if (F.nobutada.real) {
      F.nobutada.real.noAI = true; // 総大将は旗本と下知の道を歩く。
      F.nobutada.real.leaderAssault = true; // 信忠自身も門・柵を破り、城内へ乗り入れる。
    }
    for (const b of [F.oteSpear, F.oteGun, F.reserve]) { b.directOrders = true; if (b.real) b.real.directOrders = true; }
    F.attackers = [F.oteSpear, F.oteGun, F.karameteSpear, F.karameteBow, F.nishiLadder, F.yodou, F.reserve, F.nobutada];
    F.movers = [...F.attackers, ...F.defenders];
    F.localTroops = [...F.attackers, ...F.defenders];
    F.jinHosts = buildSonae(rt, this.jinkei);
    F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
    // 徒歩の槍：道の先が塀・門ごしで敵に届かなければ、立ち尽くさず門を打ちに掛かる（確かめで見つけた「20秒動かない兵」の直し）
    F.oteSpear.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner);
    F.karameteSpear.assault = gateAssault(F.gates.karamete);
    F.reserve.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner, F.gates.gateNi, F.gates.honOuter, F.gates.honInner);
    F.nobutada.assault = gateAssault(F.gates.karamete, F.gates.honOuter, F.gates.honInner);
    for (const b of [...F.attackers, ...F.defenders]) {
      const onRidge = b === F.karameteSpear || b === F.karameteBow || b === F.nobutada;
      b.order({ id: 'hold', form: onRidge ? 'column' : b.kind === 'ashigaru' ? 'yari' : 'line' });
    }

    // ---- 区域の網：東の三の丸→二の丸→本丸、西の搦手は本丸へ。任務は二の丸の制圧を待つ ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'san', name: '三の丸', test: C.kuruwa.san.test, pos: sanC, need: 4, hold: 7, gate: '大手門（一の門）', next: 'ni' },
        { id: 'hodoin', name: '搦手の口', test: (x, z) => C.kuruwa.hon.test(x, z) && x < -68 && Math.abs(z) < 8, pos: { x: -72, z: 0 }, need: 6, hold: 14, gate: KARAMETE.name, next: 'hon' },
        { id: 'ni', name: '二の丸', test: C.kuruwa.ni.test, pos: niC, need: 4, hold: 7, gate: GATE_NI.name, next: 'hon' },
        { id: 'hon', name: '本丸', test: C.kuruwa.hon.test, pos: honC, need: 4, hold: 18, honmaru: true, gate: GATE_HON.name },
      ],
      links: [['san', 'ni'], ['hodoin', 'hon'], ['ni', 'hon']],
      friendTeam: 0, enemyTeam: 1,
      // siege_zones.js の兵力比は「今、本物（real）の兵」で数える（butai.js は名目の多くを軽い大軍で持つ）。
      // 総勢の数をそのまま渡すと、本物の枠は遥かに下回り、本丸に一人でも寄っただけで
      // 「降伏」が暴発してしまう（確かめで見つけた）。実際に本物として出せる見込みの数で渡す
      totalDefenders: 1, // 盛信は降伏しない。共通の二割降伏判定を使わない。
      commander: () => F.commander,
      noReinforce: () => true,
      quietRange: [0, 0], reserves: [],
      onFall: (id) => this.onZoneFall(rt, id),
      onHonmaru: () => this.honTaken(rt),
      onSurrender: () => {},
    });
    // ---- 縄張りの今の様子（nawabari.js・束19）：曲輪・門・ルートの数の表。読むだけで、戦の動きは変えない ----
    F.K = makeNawabari(rt, C, {
      SZ: F.SZ, team: 1, friendTeam: 0,
      gates: {
        ote: [F.gates.oteOuter, F.gates.oteInner], gate_ni: F.gates.gateNi,
        gate_hon: [F.gates.honOuter, F.gates.honInner], karamete: F.gates.karamete, gate_hodoin: F.gates.hodoin,
      },
    });
    // 束12・束31・束32：K を rt にも持たせ、軍議の俯瞰の説明・小地図の曲輪塗り分け・制圧の札に使えるようにする
    rt.nawabari = F.K;

    // ---- 城の頭（siege_ai.js・F4・C8）：守りは持ち場・門・退き・出撃、攻めは道を選ぶ。
    // 出撃の一組は、この戦の門を通る道順で動かす。共通の自動出撃へ重ねて渡さない。
    F.DA = takatoDefense(rt);
    for (const b of F.defenders) b.order({ id: 'hold', form: b.kind === 'ashigaru' ? 'yari' : 'line' });
    // 攻めの頭（軍議で作戦を選ばなければ、道の厚さ・長さ・口の狭さに揺らぎを掛けて自分で選ぶ
    // ＝味方 AI の手も同じ頭で動く【城39】。道の指図そのものは runStrategy の walkRoute に渡す）
    F.AI_ROUTES = [
      { id: 'ote', defThickness: 3.2, pathLen: 60, chokeWidth: 4.2 },
      { id: 'karamete', defThickness: 1.6, pathLen: 46, chokeWidth: 4.4 },
    ];

    // ---- 竹束の寄せ（taketaba.js）：大手・搦手の先手は竹束を押し立て、ゆっくり寄せ場まで進んで撃ち合う ----
    const oteOpen = () => F.gates.oteInner.opened, karaOpen = () => F.gates.karamete.opened;
    F.TA = makeTabaAdvance(rt, {
      speed: 1.8, holdMelee: 4, // 大手の寄せと据え置きを短くし、最初の斬り合いへつなぐ。
      items: [
        { g: F.oteSpear, yose: { x: 97, z: 0 }, until: oteOpen }, { g: F.oteGun, yose: { x: 99, z: -8 }, until: oteOpen },
        { g: F.karameteSpear, yose: { x: -92, z: 0 }, until: karaOpen }, { g: F.karameteBow, yose: { x: -96, z: 0 }, until: karaOpen },
      ],
      avoid: [this.spawn, { x: 113, z: 4 }],
    });
    // 大手の寄せ手の前、斬り合いの両脇に据え置いた竹束の列（鉄砲・弓の楯）。道と斬り合いの中は空ける。配置は推定。
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++)
      addTaba(rt, 99 + (i % 2) * .6, side * (13.5 + i * 1.9), 0, { rot: -Math.PI / 2, fixed: true });
    // 門が開いたら、味方は自分の組と同じ下知で続く。

    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 113, z: 4 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);

    // 空堀・塀から離れた門前の平地に、実兵の両脇の斬り合いを置く。
    // 本物への追加はせず、九十秒の門攻めでも軽い前列を保つ。
    F.lines = [-8, 8].map((z, i) => clash(rt, {
      x: 101, z, facing: -Math.PI / 2, w: 8, gap: 2.4, gap0: 0,
      seed: 15820 + i, noWake: true, noRout: true, killRate: 0, maxDrift: 1, calm: true,
      A: { flag: ODA.flag, armor: ODA.armor, count: 24, team: 0, faction: 'oda' },
      B: { flag: TAKEDA.flag, armor: TAKEDA.armor, count: 24, team: 1, faction: 'takeda' },
    }));
    F.stageCheck = 0; F.honHold = 0;
    F.roadGuide = { x: 97, z: 0, gate: null, returning: false };
    F.botRoadTarget = { x: 97, z: 0, gate: null };
    rt.marker('ni', () => F.sanFell && !F.niFell && !F.ending ? F.niSpear.pos : null,
      '二の丸の備え', { red: true });
    rt.marker('oteRoad', () => F.ending || (F.honFell && F.C.kuruwa.hon.test(rt.player.u.pos.x, rt.player.u.pos.z)) ||
      F.sallyOut || F.sallyUntil ? null : F.roadGuide,
      () => F.roadGuide.returning ? '寄せ道へ戻る' : F.roadGuide.gate?.name ||
        (F.roadGuide.x >= 90 ? '竹束の先の寄せ道' : '寄せ道の曲がり角'), { h: 1.8 });
    rt.world.setTime('morning');
    // 低い朝日でも切岸の陰の土と石が読めるよう、この戦の環境光だけ補う。
    rt.world.hemi.groundColor.setHex(0x80735a);
    rt.world.hemi.intensity = Math.max(.9, rt.world.hemi.intensity);
    rt.setPhase('brief');
    sfx('siegeDistant', 0.4);
    rt.obj('main', hi(rt) ? '組を率い、東の大手へ寄せよ' : '先手に続き、東の大手へ寄せよ', 'main', true);
    // 降らない城へ両口から寄せる。最初の下知と使番の声を重ねない。
    rt.say('森長可', `${nm(rt)}、竹束の陰へ。城兵が寄れば、味方の列で受けよ！`, 4.5);
    rt.after(13, () => {
      if (F.ending || rt.over || F.niFell || !rt.player.u.alive) return;
      rt.say('使番', '盛信は城を守っている。信忠様は西の尾根へ。東西から攻めるぞ', 5);
    });
    rt.after(6, () => this.assault(rt));
  },

  // ① 軍議で選んだ作戦（無ければ攻めの頭が自分で選ぶ）に沿って、部隊を動かす（C9）
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 1 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('assault');
    siegeSignal(rt, 'susume', '進み太鼓と法螺貝：竹束の後ろから大手へ寄せよ');
    announceAdvance(rt, '織田信忠');
    F.strategy = window.__takatoStrategy || F.strategy || 'ote';
    this.runStrategy(rt, F.strategy);
    for (const c of F.lines) c.go();
    rt.after(12, () => { if (!F.ending) volleyAll(F.lines, 'B'); });
    // 門前の撃ち合いを一度で終えず、寄せの間に硝煙が立ち続けるよう打ち返しを重ねる（10/29 採点：鉄砲の煙が見えない）。
    for (const [t, side] of [[17, 'A'], [22, 'A'], [30, 'A']]) rt.after(t, () => { if (!F.ending) volleyAll(F.lines, side); });
    // 旧い読み口の六十秒待ちに乗せず、寄せの後すぐに第一の山場へ進む。
    rt.after(26, () => {   // 二十六秒：塀際の斬り合いから門の前の道へ押し出す
      if (F.ending || rt.over || F.sanFell || F.niFell || deadB(F.reserveDef)) return;
      F.sallyOut = true; F.sallyUntil = 0;
      // 門前へ出した既存の控えが寄せ手を受ける。門は退く時に開ける。
      for (const q of F.sallyGates) q.passed = false;
      setRoute(F.reserveDef, [[97, 0]]);
      rt.obj('main', '打って出た城兵を押し返せ', 'main', true);
      rt.say('森長可', '城兵が出たぞ！　味方の槍の列で受けよ。崖へ散るな！', 4);
      const receiving = [F.oteSpear, F.reserve];
      rt.marker('sally', () => {
        const p = rt.player.u.pos;
        let nearest = null, best = Infinity;
        for (const b of receiving) {
          if (!b.real || b.real.routed) continue;
          for (const u of b.real.units) {
            if (!u.alive || u.fleeing || u.woundOut || u.noTarget) continue;
            const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
            if (d < best) { best = d; nearest = u; }
          }
        }
        return nearest ? nearest.pos : null;
      }, '味方の槍の列');
    });
    rt.after(45, () => {
      if (F.ending || rt.over || F.niFell || deadB(F.nobutada)) return;
      setRoute(F.nobutada, ROAD_KARAMETE.slice(1));
      F.signalReady = true;
    });
    // 陽動の手：どの作戦でも、西の切岸の下へ出て塀際を脅す（決まった的が無いまま hold で待ち続けて、
    // 他家の見張りに「道があるのに20秒動かない」と見つかった兵。kaito 10/1）
    F.yodou.assault = nearWallAssault(rt);
    setRoute(F.yodou, [...ROAD_YODOU]);
    rt.marker('san', F.sanSpear.pos, '三の丸の備え', { red: true });
    // 本丸の衆と本丸の門の印は、二の丸の守りが崩れてから出す（開戦で札が四つ固まって浮かないように。見回り 10/3）
  },

  // C9 の四つの作戦：①大手だけ ②大手で引きつけて搦手 ③西の切岸を梯子で ④二の丸を取って本丸を撃つ
  runStrategy(rt, strat) {
    const F = rt.flags;
    strat = ['ote', 'karamete', 'nishi', 'ni_bombard'].includes(strat) ? strat : 'ote';
    F.pushVia = strat;
    // 自分は大手の先手。選ぶのは支え方で、両口の総攻めは必ず行う。
    F.oteSpear.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner);
    setRoute(F.oteSpear, ROAD_OTE.slice(1, 8));
    // 後詰も初めから門へ寄せ、門が開くまで遠方で待たせない。
    F.reserveSent = true;
    setRoute(F.reserve, [[101, 4], ...ROAD_OTE.slice(1, 8)]);
    setRoute(F.oteGun, ROAD_OTE.slice(1, 2));
    F.oteGun._pin = true;
    setRoute(F.karameteSpear, ROAD_KARAMETE.slice(1));
    setRoute(F.karameteBow, ROAD_KARAMETE.slice(1, 2));
    if (strat === 'karamete') setRoute(F.karameteBow, ROAD_KARAMETE.slice(1));
    if (strat === 'nishi') setRoute(F.nishiLadder, ROAD_NISHI.slice(1));
    rt.obj('main', '大手門を破り、三の丸へ入れ', 'main', true);
    rt.obj('support', strat === 'karamete' ? '大手で城兵を引きつけよ' : strat === 'nishi' ? '西の梯子衆を助け、大手を攻めよ' : strat === 'ni_bombard' ? '大手を攻め、二の丸で射手を守れ' : '大手の先手と門へ取り付け', 'side');
    rt.say('森長可', '進み太鼓と法螺じゃ！　竹束を先に立て、槍の衆は後へ続け。門へ取り付くぞ', 5);
    rt.objProgress('support', '竹束の後ろへ続け');
  },

  // 区域が落ちた（siege_zones.js の onFall）
  // 本丸の備えを崩したら、旗の周りを守って攻め手を通す
  honTaken(rt) {
    const F = rt.flags;
    if (F.honFell || F.ending) return;
    if (!F.niFell) { F.pendingHon = true; return; }
    F.honFell = true; F.honT = rt.t;
    const zone = F.SZ.byId.hon; zone.owner = zone.state = 'friend'; zone.fallen = true;
    rt.banner('本丸へ攻め入る', '主殿の守りを崩し、広場を取る');
    rt.obj('main', F.keep.down ? '本丸の旗へ集まり、守れ' : '本丸の城兵を退け、主殿の守りを崩せ', 'main', true);
    rt.objRemove('support');
    rt.say('森長可', F.keep.down ? '城主は倒れた。旗へ集まれ！　後の兵を通すぞ'
      : F.handKills.hon ? 'そなたの働き、見たぞ。本丸へ続け！　城主は主殿じゃ'
      : '本丸へ入ったぞ！　城主は主殿じゃ。味方と共に押し寄せよ', 4);
    rt.unmark('hon'); rt.unmark('gateHon'); rt.unmark('next');
    rt.marker('rally', F.keep.down ? F.honPost : F.keep.guide,
      F.keep.down ? '味方と本丸を固める' : '主殿の守りを崩す');
    for (const b of [F.oteSpear, F.reserve, F.nobutada, F.karameteSpear])
      toHonmaru(rt, b, true);
  },

  onZoneFall(rt, id) {
    const F = rt.flags;
    if (F.ending) return;
    // 人数で押し崩した場合も、縄張りの記録と下知を同じ状態にする。
    const zone = F.SZ.byId[id];
    if (zone && (id === 'san' || (id === 'ni' && (F.sanFell || F.gates.karamete.opened)))) {
      zone.owner = zone.state = 'friend'; zone.fallen = true;
    }
    if (id === 'san' && !F.sanFell) {
      F.sanFell = true; F.sanT = rt.t; F.sallyUntil = 0; F.sallyOut = false; F.sallyReturning = false;
      rt.unmark('san'); rt.unmark('sally');
      if (F.niFell) return;
      if (F.pushVia !== 'ni_bombard') rt.objRemove('support');
      rt.obj('main', '二の丸の土橋を渡り、門を破れ', 'main', true);
      rt.say('森長可', F.handKills.san ? 'そなたの働きで先手が続いた。次は二の丸の土橋じゃ！'
        : '三の丸を取った！　後の兵も続け。次は二の丸の土橋じゃ', 4);
      F.oteSpear.assault = gateAssault(F.gates.gateNi);
      setRoute(F.oteSpear, [[57, 10], [GATE_NI.x, GATE_NI.z], [-2.125, -8]]);
      F.reserve.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner, F.gates.gateNi);
      // 既に三の丸へ入った後詰を、外の寄せ場へ引き返させない。
      if (!deadB(F.reserve)) setRoute(F.reserve, ROAD_OTE.slice(F.C.kuruwa.san.test(F.reserve.pos.x, F.reserve.pos.z) ? 7 : 1, 10));
      rt.marker('next', GATE_NI, '二の丸の土橋');
      setRoute(F.reserveDef, [[57, 10], [43, GATE_NI.z]]);
      battleEvent(rt, EVENT_REINFORCEMENT, F.reserveDef.pos, F.reserveDef.real, 1, true, '二の丸の門から城兵が押し返す');
    } else if (id === 'hodoin') {
      F.hodoinFell = true;
    } else if (id === 'ni' && !F.niFell) {
      if (!F.sanFell && !F.gates.karamete.opened) { F.pendingNi = true; return; }
      F.niFell = true; F.niT = rt.t;
      rt.world.setTime('day');
      rt.unmark('next'); rt.unmark('gateOte'); rt.unmark('sally');
      F.sallyOut = false; F.sallyUntil = 0; F.sallyReturning = false;
      rt.banner('二の丸の守りを破る', '最後は本丸。印の土橋を渡れ');
      rt.obj('main', '本丸門を破り、守りを崩せ', 'main', true);
      rt.say('森長可', F.handKills.ni ? 'よく守りを崩した。後の兵も続け！　本丸の門へ寄せよ'
        : '二の丸を取ったぞ。土橋へ槍をそろえ、本丸の門へ！', 4);
      rt.marker('next', GATE_HON, '本丸への土橋');
      const road = [[GATE_HON.x, GATE_HON.z], [-45, -8], [-43.6, -4], [-45, 0], [-52, 0]];
      for (const b of [F.oteSpear, F.reserve, F.nobutada, F.karameteSpear]) toHonmaru(rt, b);
      // 西の射手も、通れる搦手の道から本丸へ続く。
      if (!deadB(F.karameteBow)) setRoute(F.karameteBow, ROAD_KARAMETE.slice(1));
      F.oteGun._pin = false;
      setRoute(F.oteGun, [[77, 0], [72.5, 0], [74.075, -4.5], [74.075, -8], [65, -8], [57, 10], [GATE_NI.x, GATE_NI.z], [-2.125, -8]]);
      if (F.pushVia === 'ni_bombard') {
        rt.obj('support', '二の丸へ続く鉄砲衆を守れ', 'side');
        rt.objProgress('support', '射手は塀際の城兵を狙う');
      }
      setRoute(F.reserveDef, [...ROAD_OTE.slice(7, 10), ...road]);
    } else if (id === 'hon') this.honTaken(rt);
  },

  // 第二の山場は本丸の刀と主殿の近習。台詞だけで守りを消さない。
  lastStand(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (!F.niFell || F.keep.down || F.lordDying) return;
    if (!F.hanaReleased && F.gates.honInner.opened &&
        F.C.kuruwa.hon.test(p.x, p.z) && Math.hypot(p.x - F.hana.pos.x, p.z - F.hana.pos.z) < 12 &&
        Math.abs(p.y - F.hana.pos.y) < 3) {
      F.hanaReleased = true;
      F.hana.noTarget = false; F.hana.aiT = 0; F.hana.perch = null;
      F.hanaGroup.aggro = 7;
      rt.banner('本丸の決死の守り', 'はなも刀で守る。味方と共に槍を受けよ');
      rt.say('はな（諏訪勝右衛門の妻）', 'ここを通すものか。私も刀を取る！', 4);
      rt.obj('main', '本丸の城兵を退け、主殿の守りを崩せ', 'main', true);
    }
    if (!F.honFell || !F.hanaReleased || siegeFighter(F.hana) || !F.keep.reached) return;
    for (const u of F.lastGuards) if (siegeFighter(u)) return;
    // 奥の間まで攻め入った時だけ最期へ進む。盛信の最期は討ち取りの数・戦功へ渡さない。
    F.lordDying = true; F.lordState = 'last';
    rt.say('仁科盛信', '城はここまでか。降りはせぬ。さらばじゃ', 4);
    rt.obj('main', '味方と本丸の旗を守れ', 'main', true);
    rt.marker('rally', F.honPost, '味方と本丸を固める');
    rt.after(4.5, () => {
      if (F.ending || rt.over || !rt.player.u.alive) return;
      const lord = F.keep.lord;
      lord.alive = false; lord.hp = 0; lord.deadT = 0;
      lord.atk = null; lord.swing = null; lord.target = null;
      if (lord.mesh) lord.mesh.visible = false;
      F.lordState = 'dead';
      rt.say('使番', '仁科盛信、討たれたとも、腹を召されたとも。残る城兵に備え、旗を守れ', 4);
    });
  },

  // 門を越した味方と局地の討ち取りで進む。残る城兵は奥の備えへ退く。
  checkAttrition(rt) {
    const F = rt.flags;
    const held = F.attritionHeld || (F.attritionHeld = {});
    const occupied = (id, foothold = false) => {
      let n = 0, enemy = 0;
      for (const u of rt.army.units) {
        if (!siegeFighter(u) || !F.C.kuruwa[id].test(u.pos.x, u.pos.z)) continue;
        if (u.team === 0) n++; else enemy++;
      }
      const zone = F.SZ.byId[id];
      if (foothold) return n >= zone.need;
      if (n < zone.need || enemy > 0 || rt.t < zone.quietUntil) { delete held[id]; return false; }
      if (held[id] == null) held[id] = rt.t;
      return rt.t - held[id] >= zone.hold;
    };
    if (!F.sanFell && F.gates.oteInner.opened && ((F.pushKills.san >= 6 && occupied('san', true)) || (occupied('san') && deadB(F.sanSpear) && deadB(F.sanGun)))) this.onZoneFall(rt, 'san');
    if (!F.niFell && (F.gates.gateNi.opened || F.gates.karamete.opened) && ((F.pushKills.ni >= 5 && occupied('ni', true)) || (occupied('ni') && deadB(F.niSpear)))) this.onZoneFall(rt, 'ni');
    if (!F.honFell && F.gates.honInner.opened && occupied('hon', true) && (F.pushKills.hon >= 5 || deadB(F.honGuard))) this.honTaken(rt);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive || !F.keep.down && !F.keepFell) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('san'); rt.unmark('hon'); rt.unmark('next'); rt.unmark('rally'); rt.unmark('gateOte'); rt.unmark('gateHon'); rt.unmark('sally');
    rt.objDone('main'); rt.objRemove('support');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '高遠城を攻め落とした', pts: 24 }; }, '高遠城を攻め落とした');
    sfx('kane', 0.5);
    rt.banner('高遠城、落ちる', '天正十年三月二日。一日の攻めで落城。仁科盛信は最期まで戦ったと伝わる');
    // 盛信の最期の知らせで、残る備えの士気が崩れる。
    for (const b of F.defenders || []) {
      b.morale = Math.min(b.morale, 5);
      if (b.real) { b.real.noRout = false; b.real.morale = 5; }
    }
    battleEvent(rt, EVENT_RETREAT, F.C.kuruwa.hon.centroid, F.honGuard.real, 1, true, '本丸の備えが崩れた。高遠城、落ちる');
    for (const c of F.lines) c.rout('B');
    rt.say('森長可', '旗を守り通したな。組の者を確かめよ。傷ある者を置いて行くな', 4.5);
    rt.after(5.5, () => rt.say('使番', '明日は上諏訪へ。その先は甲斐じゃ。武田勝頼のもとへ進む', 4));
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  // 東の大手は二つの冠木門を通る。四角い囲いと櫓門は置かない。
  // 今打つ門だけに印を出す。壊れた・開いた門は外し、
  // 奥の門へ切り替える（二つとも済んだら印を消す。確かめで見つけた：両方出ると、どちらを打つか迷う）
  gateMarker(rt, id, pair) {
    // 出撃を受ける間は門へ誘導せず、味方の槍の列を行き先にする。
    const holding = id === 'gateOte' && (rt.flags.sallyOut || rt.flags.sallyUntil);
    const g = holding ? null : pair.find((q) => q.struct.alive && !q.opened);
    const key = id + 'Target';
    if (rt.flags[key] === (g || null)) return;
    rt.flags[key] = g || null;
    if (!g) { rt.unmark(id); return; }
    const mid = { x: (g.struct.seg[0] + g.struct.seg[2]) / 2, z: (g.struct.seg[1] + g.struct.seg[3]) / 2 };
    rt.marker(id, mid, g.name, { h: 4.8 });
  },

  // 目の前の門と曲輪の変化は、その場の下知にする。遠い使番の到着を待たない。
  guideAssault(rt) {
    const F = rt.flags;
    if (F.step < 1 || F.honFell) return;
    let text;
    if (F.niFell) text = F.gates.honInner.opened
      ? '本丸へ入り、城兵を退けよ'
      : '本丸門を破り、守りを崩せ';
    else if (F.sanFell) text = F.gates.gateNi.opened
      ? '二の丸へ入り、城兵を退けよ'
      : '二の丸の土橋を渡り、門を破れ';
    else if (F.sallyOut || F.sallyUntil) text = '味方の槍の列で城兵を押し返せ';
    else if (F.gates.oteInner.opened) text = '三の丸へ入り、城兵を退けよ';
    else if (F.gates.oteOuter.opened) text = '大手の奥の門を破れ';
    else text = '大手門を破り、三の丸へ入れ';
    if (F.guideText !== text) { F.guideText = text; rt.obj('main', text, 'main', true); }
  },

  update(rt, dt) {
    const F = rt.flags;
    F.coldBreath?.(dt);
    F.rearShadows?.tick(dt);
    butaiTick(rt, dt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    const hit = rt.player.lastHit;
    // 同じ守り方の知らせを、被弾のたびに出し直さない。
    if (hit?.ranged && rt.t - hit.t < 2 && !F.gunHelpSaid) {
      F.gunHelpSaid = true; rt.bark('矢玉じゃ！　竹束か門脇の陰へ', true);
    }
    F.stageCheck -= dt;
    F.refresh = F.stageCheck <= 0;
    if (F.refresh) F.stageCheck = 1;
    if (F.gates && F.refresh) {
      if (!F.sanFell && !F.niFell) this.gateMarker(rt, 'gateOte', F.gatePairs.ote);
      if (F.niFell && !F.honFell) this.gateMarker(rt, 'gateHon', F.gatePairs.hon);
      if (F.niFell && !F.honMk && !F.honFell) { F.honMk = true; rt.marker('hon', F.honGuard.pos, '本丸の備え', { red: true }); }
    }
    if (F.TA) F.TA.tick(dt);
    tickTabas(rt, dt);
    tabaInteractTick(rt, { allowPush: F.step >= 1, team: 0 });
    updateGates();
    updateLadders(rt.army, dt);
    // 死傷で味方の全体が四人未満になっても、消えた人数を待たせない。
    // 地域の敵を退ける条件と、確保に要る時間は保つ。
    if (F.refresh) {
      let alive = 0;
      for (const u of rt.army.units)
        if (u.team === 0 && siegeFighter(u)) alive++;
      F.captureNeed = Math.max(1, Math.min(4, alive));
      for (const z of F.SZ.zones) z.need = Math.max(1, Math.min(z.id === 'hodoin' ? 6 : 4, alive));
    }
    if (F.SZ) F.SZ.tick(dt);
    if (F.K) F.K.tick(dt);
    if (F.DA) F.DA.tick(dt);
    if (F.step >= 1) { tickRoutes(F.movers); if (F.refresh) this.checkAttrition(rt); }

    // 西の切岸の梯子：着いた兵を一人ずつ登らせ、守りが時おり押し倒す
    if (F.nishiLadder2 && F.nishiLadder2.hp > 0) {
      for (const u of (F.nishiLadder.real ? F.nishiLadder.real.units : [])) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.group?.routed || u.climb) continue;
        if (Math.hypot(u.pos.x - F.nishiLadder2.x, u.pos.z - F.nishiLadder2.z) < 2.2) startClimb(u, F.nishiLadder2);
      }
      F._kdT = (F._kdT || 0) - dt;
      if (F._kdT <= 0) {
        F._kdT = 6;
        let defender = false;
        for (const u of rt.army.units) if (u.team === 1 && u.alive && !u.fleeing && !u.woundOut && !u.noTarget && !u.isStruct && Math.hypot(u.pos.x - F.nishiLadder2.topX, u.pos.z - F.nishiLadder2.topZ) < 4 && Math.abs(u.pos.y - F.nishiLadder2.y1) < 3) { defender = true; break; }
        if (defender && Math.random() < 0.4) {
          const fallen = knockDown(F.nishiLadder2, rt.army);
          if (fallen && F.pushVia === 'nishi' && !F.ladderFallSaid) {
            F.ladderFallSaid = true; rt.obj('support', '大手へ寄り、先手を支えよ', 'side');
            rt.say('使番', '西の梯子衆が落とされた！　大手の攻めを緩めるな', 4);
          }
        }
      }
    }
    if (F.pushVia === 'nishi' && F.nishiLadder2?.hp <= 0 && !F.ladderLost) {
      F.ladderLost = true;
      // 倒れた梯子を待たず、既にいる兵を尾根の門へ回す。
      F.nishiLadder.assault = gateAssault(F.gates.karamete);
      if (F.niFell) toHonmaru(rt, F.nishiLadder, F.honFell);
      else if (!deadB(F.nishiLadder)) setRoute(F.nishiLadder, ROAD_KARAMETE.slice(1));
      rt.obj('support', '梯子を待たず、大手を攻めよ', 'side');
      rt.say('使番', '西の梯子は倒れた。そなたは大手で先手を助けよ', 4);
    }
    // 鉄砲の損害は実際の射撃だけで決める。時刻だけで本丸の兵を減らさない。
    // 段の札は一秒に一度だけ。毎コマ、道や印を作り直さない。
    if (F.step >= 1 && F.refresh) {
      // 三の丸を取ってからでは、先手が減った時に口を越す人数をそろえられない。
      // 外の門が開くか先手が崩れたら、既にいる後詰を同じ道から寄せる。
      if (!F.sanFell && !F.niFell && !F.reserveSent && !deadB(F.reserve) &&
          (F.gates.oteOuter.opened || deadB(F.oteSpear))) {
        F.reserveSent = true;
        F.reserve.assault = gateAssault(F.gates.oteOuter, F.gates.oteInner);
        setRoute(F.reserve, ROAD_OTE.slice(1, 8));
      }
      if (F.signalReady && !F.signalGiven && !deadB(F.nobutada) && Math.hypot(F.nobutada.pos.x - KARAMETE.x, F.nobutada.pos.z - KARAMETE.z) < 18) {
        F.signalGiven = true;
        battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.nobutada.pos, F.nobutada.real, 0, true, '信忠が西の塀際へ出た。両口から押し入れ');
        siegeSignal(rt, 'kakari', '総懸かりの陣太鼓と法螺貝：味方と両口から押し入れ');
        rt.say('使番', '総懸かりの陣太鼓と法螺じゃ！　信忠様の下知、「一息に城へ入れ！」大手も押せ！', 5);
        leanAll(F.lines, 'A', 0.55); volleyAll(F.lines, 'A');
      }
      if ((F.sallyOut || F.sallyUntil || F.sallyReturning) && deadB(F.reserveDef)) {
        F.sallyOut = false; F.sallyUntil = 0; F.sallyReturning = false;
        for (const q of F.sallyGates) if (!q.gate.breached && !F.DA.usingGate(q.gate)) q.gate.close();
        rt.unmark('sally');
      }
      // 門へ着く前から半平面の向こうにいる兵もいる。曲がった道の該当の門を抜けてから閉める。
      if (F.sallyOut && !F.reserveDef._route && !deadB(F.reserveDef)) {
        F.sallyOut = false; F.sallyUntil = rt.t + 90;
      }
      if (F.sallyOut || F.sallyUntil || F.sallyReturning) for (const q of F.sallyGates) {
        if (q.passed || q.gate.breached || F.DA.usingGate(q.gate)) continue;
        if (F.reserveDef._route && F.reserveDef._i < (F.sallyReturning ? q.backAfter : q.outAfter)) continue;
        const s = q.gate.struct; let passed = true;
        for (const u of F.reserveDef.real?.units || []) {
          if (!u.alive || u.fleeing || u.woundOut) continue;
          if (((u.pos.x - q.x) * s.nx + (u.pos.z - q.z) * s.nz) * q.side < 2) { passed = false; break; }
        }
        if (passed) { q.passed = true; q.gate.close(); }
      }
      if (F.sallyUntil && rt.t >= F.sallyUntil) {
        for (const q of F.sallyGates) if (!q.gate.breached) q.gate._openNow(false);
        F.sallyUntil = 0; F.sallyReturning = true;
        for (const q of F.sallyGates) { q.side = -q.side; q.passed = false; }
        rt.unmark('sally');
        setRoute(F.reserveDef, [[77, 0], [72.5, 0], [74.075, -4.5], [74.075, -8], [65, -8], [57, 10], [GATE_NI.x, GATE_NI.z], [-2.125, -8]]);
        battleEvent(rt, EVENT_RETREAT, F.reserveDef.pos, F.reserveDef.real, 1, false, '打って出た城兵が門の内へ退く');
      }
      if (F.pendingNi && (F.sanFell || F.gates.karamete.opened)) this.onZoneFall(rt, 'ni');
      if (F.pendingHon && F.niFell) this.honTaken(rt);
      this.guideAssault(rt);
      if (!F.honFell) {
        if (F.niFell) rt.objProgress('main', F.gates.honInner.opened ? (F.pushKills.hon >= 5 ? '味方と本丸へ入れ' : `城兵を退けよ　あと${5 - F.pushKills.hon}人`) : '本丸の土橋を渡り、門を破れ');
        else if (F.sanFell) rt.objProgress('main', F.gates.gateNi.opened ? (F.pushKills.ni >= 5 ? '味方と二の丸へ入れ' : `城兵を退けよ　あと${5 - F.pushKills.ni}人`) : '二の丸の土橋へ寄せ、門を押せ');
        else rt.objProgress('main', F.sallyOut || F.sallyUntil ? '味方の槍の列へ戻れ。城兵を追って離れるな' : F.gates.oteInner.opened ? (F.pushKills.san >= 6 ? '味方と三の丸へ入れ' : `城兵を退けよ　あと${6 - F.pushKills.san}人`) : '大手道を進み、門へ取り付け');
      }
      if (rt.t - F.stepT >= 360 && !F.reliefSaid) {
        F.reliefSaid = true;
        rt.say('使番', '間もなく先手を交代する。残る城兵を押し崩せ', 4);
      }
      if (rt.t - F.stepT > 300 && !F.lastPush) {
        F.lastPush = true;
        rt.say('森長可', '控えも続け！　ここで退くな。残る備えを押し崩すのじゃ', 4);
        if (!deadB(F.reserve)) {
          if (F.honFell || F.niFell) {
            toHonmaru(rt, F.reserve, F.honFell);
          } else {
            F.reserve.assault = F.sanFell ? gateAssault(F.gates.gateNi) : gateAssault(F.gates.oteOuter, F.gates.oteInner);
            setRoute(F.reserve, ROAD_OTE.slice(1, F.sanFell ? 10 : 8));
          }
        }
        leanAll(F.lines, 'A', 0.8);
      }
    }
    if (F.refresh) {
      // 自分の命と寄せ手の戦力は別。壊滅してから初めて知らせず、後詰が残る間に伝える。
      if (!F.oteBrokenSaid && deadB(F.oteSpear) && !deadB(F.reserve)) {
        F.oteBrokenSaid = true;
        rt.say('使番', '大手の先手が崩れた。後詰の槍の列で城兵を受けよ。一人で追うな', 5);
      }
      for (const b of F.localTroops) if (deadB(b) && !b.tkRouted) {
        b.tkRouted = true;
        if (b.light) b.light.rout();
      }
      if (F.keep.down && !F.lordDown) {
        F.lordDown = true;
        for (const b of F.defenders) if (b.real) {
          b.real.noRout = false; b.real.morale = Math.min(b.real.morale, 15);
        }
        rt.marker('rally', { x: -52, z: 0 }, '味方と本丸を固める');
        if (F.honFell) rt.obj('main', '本丸の旗へ集まり、守れ', 'main', true);
      }
      // 三百秒で本丸へ届かなければ、信忠の本隊が塀を越えて攻め入る（信長公記：信忠自ら塀際へ）。門は破れ、曲輪は次々に落ちる。
      if (F.step >= 1 && !F.honFell && rt.t - F.stepT >= 300 && !F.allIn) {
        F.allIn = true;
        for (const g of Object.values(F.gates)) if (g.struct.alive && !g.opened) { g.struct.hp = 0; g.breached = true; g._openNow(true); g.struct.alive = false; }
        rt.say('使番', '信忠様の本隊が塀を越えたぞ！　本丸へ攻め入れ！', 4);
        if (!F.sanFell) this.onZoneFall(rt, 'san');
        if (!F.niFell) this.onZoneFall(rt, 'ni');
        this.honTaken(rt);
      }
      // 本丸の門を破って本丸へ入った後なら、三百八十秒で城は落ちた扱い（城兵は主殿に籠って果てた）。止めずに結果へ進める。
      if (F.step >= 1 && F.honFell && rt.t - F.stepT >= 380 && F.honHold < 12 && rt.player.u.alive) {
        const lord = F.keep.lord;
        if (lord?.alive) { lord.invuln = false; lord.hp = 0; rt.army.kill(lord, null); }   // 盛信は主殿で果てた
        F.keepFell = true;
        this.win(rt); return;
      }
      // 四百秒で先手を後の備えと交代する。時間だけで落城・討死にはしない。
      if (F.step >= 1 && ((rt.t - F.stepT >= 400 && F.honHold < 12) ||
          (rt.canFailMission() && deadB(F.oteSpear) && deadB(F.reserve) && deadB(F.karameteSpear) && deadB(F.nobutada)))) {
        F.ending = true;
        rt.setPhase('end'); rt.objRemove('support'); rt.objProgress('main', ''); rt.objFail('main'); rt.tracker.main = false;
        for (const id of ['san', 'hon', 'next', 'rally', 'gateOte', 'gateHon', 'sally']) rt.unmark(id);
        rt.banner(rt.t - F.stepT >= 400 ? '先手を交代する。退け' : '先手が崩れた。退け', '後の備えへ退き、味方の旗に集まれ');
        siegeSignal(rt, 'nobiki', '退き太鼓と低い法螺貝：後の備えへ退き、味方の旗へ集まれ');
        rt.say('森長可', '退き太鼓じゃ！　追うな。後の備えへ退き、味方の旗へ集まれ。傷ある者も連れて行け！', 5);
        rt.player.u.invuln = true;
        rt.finish({ failureReason: rt.t - F.stepT >= 400
          ? '本丸を取りきれず、後の備えと交代した'
          : '門へ進む味方が崩れ、攻めを続けられなくなった' }, 8); return;
      }
    }
    if (F.keep) F.keep.tick();
    if (F.refresh) this.lastStand(rt);
    // 時間だけで勝ちにはしない。本丸内で旗を守り、最後の備えを崩して決着。
    if (F.honFell) {
      const p = rt.player.u.pos;
      const near = siegeFighter(rt.player.u) && Math.hypot(p.x - F.honPost.x, p.z - F.honPost.z) < 14 &&
        F.C.kuruwa.hon.test(p.x, p.z) && Math.abs(p.y - F.honPost.y) < 3 &&
        !rt.army.wallBetween(p, -1, F.honPost);
      const need = F.captureNeed || 4;
      let enemy = 0, friend = 0;
      for (const u of rt.army.units)
        if (siegeFighter(u) && u.team === 1 && F.C.kuruwa.hon.test(u.pos.x, u.pos.z)) enemy++;
      for (const u of rt.army.units)
        if (siegeFighter(u) && u.team === 0 && Math.hypot(u.pos.x - F.honPost.x, u.pos.z - F.honPost.z) < 14 && F.C.kuruwa.hon.test(u.pos.x, u.pos.z) &&
            Math.abs(u.pos.y - rt.world.heightAt(-52, 0)) < 3 &&
            !rt.army.wallBetween(u.pos, -1, F.honPost)) friend++;
      if (near && F.keep.down && (enemy === 0 || F.pushKills.hon >= 5) && friend >= need) F.honHold += dt;
      else F.honHold = Math.max(0, F.honHold - dt);
      if (F.refresh) rt.objProgress('main', !F.keep.down ? (F.lordDying ? '味方と本丸の旗を守れ' : !F.hanaReleased || siegeFighter(F.hana) ? '本丸の城兵を退けよ' : '主殿の守りを崩し、奥の間へ進め') : !near ? '本丸の旗の印へ戻れ。味方と守れ' : enemy && F.pushKills.hon < 5 ? `城兵を退けよ　あと${5 - F.pushKills.hon}人` : friend < need ? `味方と旗を守れ　${friend}／${need}人` : `本丸を守れ　残り${Math.max(0, Math.ceil(12 - F.honHold))}秒`);
      if (F.honHold >= 12) this.win(rt);
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    // 死傷は部隊の通常の集計に任せる。局地の一人を全軍の数十人へ換算しない。
    if (v.isStruct || v.group?.civ || v.type === 'porter') return;
    if (v.team === 1) {
      F.ek = (F.ek || 0) + 1;
      // 自分と味方の討ち取りを共に数える。別の口・奥の守りの討ち取りは流用しない。
      const id = F.niFell ? 'hon' : F.sanFell ? 'ni' : 'san';
      const local = F.C.kuruwa[id].test(v.pos.x, v.pos.z);
      const guard = id === 'san' ? v.group === F.sanSpear.real || v.group === F.sanGun.real || v.group === F.reserveDef.real
        : id === 'ni' ? v.group === F.niSpear.real || v.group === F.hodoinSpear.real : v.group === F.honGuard.real;
      if (local || guard) {
        F.pushKills[id]++;
        if (k && k.team === 0 && (k.isPlayer || k.isSub || k.isTomo)) F.handKills[id]++;
      }
    } else F.ak = (F.ak || 0) + 1;
  },
  // 崩れた知らせは共通の戦況へ任せ、同じ隊の台詞を重ねない。
};

// 開戦時の総勢の目安。近い一組の死傷から全軍の残数を逆算しない。
takato_siege.force = () => ({ a: 30000, a0: 30000, b: 3000, b0: 3000 });
takato_siege.sides = { a: { name: '織田軍（およそ三万人）', mon: 'oda' }, b: { name: '武田軍（およそ三千人）', mon: 'takeda' } };
takato_siege.famous = []; // 両将は持ち場に最初からいる。別の隊へ追加しない。
takato_siege.date = (rt) => `天正十年三月二日　早春・${rt.flags.niFell ? '昼' : '明け方'}`;
// 自害の伝えと土の城の参考：伊那市『高遠城跡の魅力をご紹介』
// https://www.inacity.jp/kurashi/shogaigakushu_bunka/bunkazai/takatojyoseki.html
takato_siege.history = '信長公記巻十五によれば、天正十年三月二日の明け方、森長可・団平八・河尻秀隆・毛利河内守・小笠原信嶺らが大手へ、信忠は尾根続きの搦手へ寄せた。大手では城兵が打って出て数刻戦い、信忠自身も柵を破り塀へ上がって突入を命じた。両口の兵が城内で激しく戦い、城兵は最後まで戦い、その日のうちに落城した。信長公記は、討ち取った首に仁科五郎（盛信）の名を挙げる。討ち死にとも読める。自害したとも伝わる。これは後の甲陽軍鑑の系統や地元の伝えで、伊那市の解説も紹介する。降伏の使いを断った話も後の軍記に伝わる。信長公記には記されない。信濃史料は兼見卿記ほかも挙げて三月二日の落城を記す。兵数には諸説ある。伊那市の解説は数千の城兵が数万の軍勢と戦ったとする。表示は信忠約三万・城兵約三千を目安とし、信長公記の確定数ではない。諏訪勝右衛門の妻はなが刀を取って戦ったという話は伝えで、居場所や衣、台詞は推定である。落城の時刻や当日の天気も同書には記されない。戦国期の大手は東、搦手は西。七曲輪の名称は伊那市の保存活用計画を参考にした。現存する縄張りは江戸時代の改修を含む。曲輪の並び・比高・空堀は『史跡高遠城跡二の丸Ⅱ』第3図の測量図を基準にし、曲輪の平面寸法は実長の半分に縮めた。搦手は図に無く、西の本丸側に遊び用の口を残した。南の三峰川と北の藤沢川は城の西側で合流する。川筋は戦場に収めた推定である。曲輪・川・門・館の位置や寸法、段差、天気、竹束・梯子・鉄砲の下知、武将の台詞は遊びのための推定復元。近い兵は各備えの前の一組だけで、総勢の全員を城内へ置くものではない。二の丸は本丸より一歩高く、鉄砲は見通せる城兵を撃つ。 各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。';

// 軍議（gungi.js・C6）：城を回して見て、作戦を一つ選ぶ【城19〜22・68】
takato_siege.gungi = (rt) => {
  const F = rt.flags;
  if (!rt.G.lord) return null; // 足軽は全軍の攻め方を選ばず、森の下知に従う。
  const G = {
    center: { x: -2.125, z: 0 }, dist: 130,
    // 束31：info を足し、押すと短い札が出るように（俯瞰の説明）
    landmarks: [
      { name: '大手門', x: OTE.x, z: OTE.z, info: '東の正門。森長可の先手が西へ攻める' },
      { name: '搦手門', x: KARAMETE.x, z: KARAMETE.z, info: '西の尾根道。信忠の旗本が東へ攻め入る' },
      { name: '三の丸', x: 57, z: 0, info: '大手門のすぐ内。守備兵が多い' },
      { name: '二の丸', x: 0, z: 0, info: '空堀と土橋の内。土塁と木の柵で守る' },
      { name: '勘助曲輪', x: -92, z: -36, info: '本丸の北西。床は本丸より十一歩低い' },
      { name: '南曲輪', x: -58, z: 38, info: '本丸の南。空堀の先に法幢院曲輪' },
      { name: '法幢院曲輪', x: -58, z: 62, info: '南曲輪の南に続く曲輪' },
      { name: '本丸', x: -56, z: 0, info: '最後の備え。堀と土橋を越えて旗の周りを取る' },
      { name: '西の切岸', x: NISHI_X, z: 8, info: '道が狭い　梯子でしか登れない' },
    ],
    nawabari: F.K,
    lines: [
      { name: '三の丸', owner: '敵' }, { name: '法幢院曲輪', owner: '敵' }, { name: '二の丸', owner: '敵' }, { name: '本丸', owner: '敵' },
    ],
    units: [{ id: 'main', name: '織田信忠の旗本', group: () => F.nobutada && F.nobutada.real, nominal: () => (F.nobutada ? F.nobutada.aliveNominal() : 0) }],
    routes: [
      { id: 'ote', name: '両口から寄せ、大手を厚くする' },
      { id: 'karamete', name: '両口から寄せ、搦手を支える' },
      { id: 'nishi', name: '別働は西の梯子へ、大手を攻める' },
      { id: 'ni_bombard', name: '二の丸へ鉄砲を進め、城兵を抑える' },
    ],
    default: { main: 'ote' },
    enemy: [
      { name: '三の丸の備え', known: false },
      { name: '法幢院曲輪の備え', known: false },
      { name: '二の丸・本丸の備え', known: false },
    ],
    cinema: { attackers: { x: 145, z: 0 }, gate: { x: OTE.x, z: OTE.z }, defenders: { x: F.honGuard ? F.honGuard.pos.x : -56, z: F.honGuard ? F.honGuard.pos.z : 0 } },
    onStart: (assign) => takato_siege.onGungiStart(rt, assign),
  };
  // F9：bot・sim で確かめる時、作戦を渡していれば window.__takatoStrategy で決め打ち。
  // 渡していなければ（AI どうしの確かめ）軍議の札を出さず、攻めの頭（siege_ai.js）に選ばせる
  if (window.__takatoStrategy) { takato_siege.onGungiStart(rt, { main: window.__takatoStrategy }); return null; }
  if (/[?&]bot/.test(location.search)) return null;
  return G;
};
takato_siege.onGungiStart = (rt, assign) => { rt.flags.strategy = ['ote', 'karamete', 'nishi', 'ni_bombard'].includes(assign?.main) ? assign.main : 'ote'; };

// 素直な遊び手：敵へ向かって戦い、無ければ大手へ
// 喰違いの口と土橋を省かず通る。道と門の対応は準備時に一度だけ作る。
const BOT_ROAD = [...ROAD_OTE.slice(0, 11), [-45, -8], [-43.6, -4], [-45, 0], [-52, 0]];
const BOT_GATES = { 2: 'oteOuter', 4: 'oteInner', 8: 'gateNi', 10: 'honOuter', 12: 'honInner' };
// 決着後も喰違いと土橋を逆にたどる。殿から四十歩の直線では、柵や空堀へ突き当たる。
takato_siege.botWithdraw = (rt, inp, { goTo }) => {
  const F = rt.flags, p = rt.player, pos = p.u.pos;
  if (F.botWithdrawI == null) {
    let best = Infinity, index = -1;
    const probe = F.botWithdrawProbe || (F.botWithdrawProbe = { x: 0, y: 0, z: 0 });
    probe.y = pos.y;
    for (let i = 0; i < BOT_ROAD.length; i++) {
      const w = BOT_ROAD[i], d = Math.hypot(w[0] - pos.x, w[1] - pos.z);
      if (d >= best) continue;
      probe.x = w[0]; probe.z = w[1];
      if (rt.army.wallBetween(pos, -1, probe) || !rt.world.walkable(probe.x, probe.z, pos.y)) continue;
      best = d; index = i;
    }
    // 口がまだ見えない時は次の判断で探す。城外の遠い一点へ向けて走らせない。
    if (index < 0) return;
    F.botWithdrawI = index;
  }
  let w = BOT_ROAD[F.botWithdrawI];
  if (F.botWithdrawI > 0 && Math.hypot(w[0] - pos.x, w[1] - pos.z) < .5)
    w = BOT_ROAD[--F.botWithdrawI];
  goTo(p, inp, w[0], w[1], .3);
};
// 斬り合いや別の口から入った時も、実際に着いた曲輪まで道順を引き継ぐ。
// 開いていない門は飛ばさない。表は準備前に一度だけ作り、人と自動の案内で共用する。
const ROAD_ZONES = [
  { id: 'san', end: 7 }, { id: 'ni', end: 9 }, { id: 'hon', end: BOT_ROAD.length - 1 },
];
// 人も遊び手も喰違いの道順を使う。追撃で道を外れたら、今の道へ戻してから進む。
// 戻り先は支度時の二つの入れ物へ書き、毎コマ位置や配列を作らない。
function roadTarget(rt, key, target) {
  const F = rt.flags, p = rt.player.u.pos;
  const end = F.niFell ? BOT_ROAD.length - 1 : F.sanFell ? 9 : 7;
  // 押し合いで任務が往復しないよう、外れる幅と戻れた幅を分ける。
  const returnWidth = target.returning ? 2 : 4;
  target.returning = false;
  let i = F[key] ?? 1;
  let open = true, checked = 2;
  for (const reached of ROAD_ZONES) {
    if (reached.end > end) break;
    for (; checked <= reached.end; checked++) {
      const gate = F.gates[BOT_GATES[checked]];
      if (gate && gate.struct.alive && !gate.opened) { open = false; break; }
    }
    if (!open) break;
    if (F.C.kuruwa[reached.id].test(p.x, p.z)) {
      i = Math.max(i, reached.end);
      F[key] = i;
    }
  }
  // 最後の折れを抜けて曲輪へ入ったら、広場で城兵を退ける。
  // 最後の印の一点へ近づくために、敵と柵の間を往復させない。
  const zone = F.C.kuruwa[F.niFell ? 'hon' : F.sanFell ? 'ni' : 'san'];
  if (i >= end && zone.test(p.x, p.z)) {
    F[key] = end + 1; target.gate = null; return null;
  }
  while (i <= end) {
    const gate = F.gates[BOT_GATES[i]], closed = gate && gate.struct.alive && !gate.opened;
    const prev = BOT_ROAD[i - 1], next = BOT_ROAD[i];
    let x = next[0], z = next[1];
    if (closed) {
      const s = gate.struct, mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const side = Math.sign((prev[0] - mx) * s.nx + (prev[1] - mz) * s.nz) || 1;
      x = mx + s.nx * side * 1.5; z = mz + s.nz * side * 1.5;
    } else if (Math.hypot(p.x - x, p.z - z) < 1.5) { F[key] = ++i; continue; }
    const dx = x - prev[0], dz = z - prev[1];
    const l2 = dx * dx + dz * dz || 1;
    const along = ((p.x - prev[0]) * dx + (p.z - prev[1]) * dz) / l2;
    // 竹束に続いて既に通った直線の目印へ、後戻りさせない。折れを横切って省く事はしない。
    if (!closed && along >= 1 && Math.abs((p.x - prev[0]) * dz - (p.z - prev[1]) * dx) / Math.sqrt(l2) < 1.5) {
      F[key] = ++i; continue;
    }
    const t = Math.max(0, Math.min(1, along));
    const rx = prev[0] + dx * t, rz = prev[1] + dz * t;
    let safeWidth = returnWidth;
    // 土橋の縁は広場と同じ四メートルまで許すと、堀へ下りた後も門へ進めと案内してしまう。
    for (const bridge of BRIDGES) {
      const bx = bridge.b[0] - bridge.a[0], bz = bridge.b[1] - bridge.a[1], bl2 = bx * bx + bz * bz;
      const along = ((rx - bridge.a[0]) * bx + (rz - bridge.a[1]) * bz) / bl2;
      if (along >= 0 && along <= 1 && Math.abs((rx - bridge.a[0]) * bz - (rz - bridge.a[1]) * bx) / Math.sqrt(bl2) < .1)
        safeWidth = Math.min(safeWidth, bridge.w / 2 - .5);
    }
    target.gate = closed ? gate.struct : null;
    if (Math.hypot(p.x - rx, p.z - rz) > safeWidth) {
      target.x = rx; target.z = rz; target.gate = null; target.returning = true;
    } else { target.x = x; target.z = z; }
    return target;
  }
  // 道を歩き終えた曲輪の中では城兵を退ける。広場の戦いを、古い角へ戻す案内で中断しない。
  // 切岸の外へ出た時だけ道へ戻す。曲輪へ入る前の喰違いは省かない。
  if (zone.test(p.x, p.z)) { target.gate = null; return null; }
  const last = BOT_ROAD[end];
  if (key === 'guideRoadI' && Math.hypot(p.x - last[0], p.z - last[1]) > returnWidth) {
    target.x = last[0]; target.z = last[1]; target.gate = null; target.returning = true;
    return target;
  }
  return null;
}

takato_siege.guideMarker = (rt) => {
  const F = rt.flags;
  if (F.ending || rt.over) return null;
  // 味方が先に本丸を取っても、外にいる自分は土橋と門を通る。
  // 主殿を直接指すと、二の丸の塀へ突き当たってしまう。
  if (F.honFell && F.C.kuruwa.hon.test(rt.player.u.pos.x, rt.player.u.pos.z)) return 'rally';
  if (F.sallyOut || F.sallyUntil) return 'sally';
  if (rt.G.lord && !F.honFell) return F.niFell ? 'gateHon' : F.sanFell ? 'next' : 'gateOte';
  const target = roadTarget(rt, 'guideRoadI', F.roadGuide);
  if (!target) return F.niFell ? 'hon' : F.sanFell ? 'ni' : 'san';
  // 遠い門の打ち場より、手前の折れを先に示す。門前に着いた時だけ掛矢へ切り替える。
  return target.gate && rt._gg?.cur === target.gate &&
    Math.hypot(rt.player.u.pos.x - target.x, rt.player.u.pos.z - target.z) < 4 ? '_gate' : 'oteRoad';
};
takato_siege.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  b.botFollowingTaba = false;
  if (!u.alive || F.ending) return;
  // 下知の前に単独で門へ走り込まず、味方と同じ寄せの合図を待つ。
  if (F.step < 1) {
    b.botFollowingTaba = true;
    inp.runHeld = false; inp.guardHold = false; inp.leftPressed = false;
    // 下知を待つ間も、門前の城兵が斬りかかって来たら向き直って受ける（棒立ちで斬られない）。
    const near = b.army.nearestEnemy(u, 4, (o) => !o.isStruct && !o.fleeing && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3);
    if (near) {
      if (p.lock && p.lock !== near) inp.e.add('KeyQ');
      p.yaw = Math.atan2(near.pos.x - u.pos.x, near.pos.z - u.pos.z);
      patientStrike(p, inp, near, Math.hypot(near.pos.x - u.pos.x, near.pos.z - u.pos.z), true);
    }
    return;
  }
  // 大手の先手が竹束を運び、据えて撃ち合う間は、その陰から寄せる。
  // 構えだけでは鉄砲を防げない。目の前の城兵には従来どおり応戦する。
  // 先手が敵に向き直ると竹束も後ろへ回る。据え直しを待ち続けず、寄せの後は門の道順へ戻る。
  if (b.t - F.stepT < 30 && !F.gates.oteOuter.opened && F.gates.oteOuter.struct.alive &&
      !b.army.nearestEnemy(u, 4, (o) => !o.fleeing && !o.noTarget &&
        Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false))) {
    const it = F.TA && F.TA.items.find((it) => it.g === F.oteSpear);
    if (it && it.st !== 'free') {
      let tb = null, bd = Infinity;
      for (const t of it.tabas) {
        // 中央の切れ目の両脇の束から寄せの位置を読む。歩くのは道の芯のまま。
        if (Math.abs(t.z - OTE.z) > 4) continue;
        const d = Math.hypot(t.x - u.pos.x, t.z - u.pos.z);
        if (d < bd) { tb = t; bd = d; }
      }
      if (tb) {
        b.botFollowingTaba = true;
        inp.runHeld = false; inp.guardHold = false; inp.leftPressed = false;
        goTo(p, inp, tb.x - Math.sin(tb.rot) * 1.4, OTE.z, 0.5);
        return;
      }
    }
  }
  // 門の途中から曲輪の敵へ直進すると、喰違いの口を飛ばして壁際で撃たれ続ける。
  // 近い打ち手には応戦し、遠い敵を追うのは同じ曲輪へ入ってから。
  let here = null;
  if ((F.botRoadI ?? 1) > 7) {
    for (const k of F.botKuruwa) if (k.test(u.pos.x, u.pos.z)) { here = k; break; }
  }
  // 三の丸では先手の列から離れて城兵を追わない。敵の人数と寄せは変えない。
  let mate = null, mateDistance = 24;
  if (here) for (const o of b.army.units) {
    if (o === u || o.team !== u.team || !o.alive || o.fleeing || o.woundOut || o.rearWound ||
        o.noTarget || o.isStruct || o.downed || o.civ || o.farSim || o.group?.isRunner ||
        o.group?.hidden || o.group?.routed ||
        o.type === 'gun' || o.type === 'bow' || o.type === 'porter' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || !here.test(o.pos.x, o.pos.z)) continue;
    // 番所へ入った味方を、曲輪を確保する前の合流先にしない。
    if (!F.honFell && nakaFind(o.pos.x, o.pos.z)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d < mateDistance && !b.army.wallBetween(u.pos, -1, o.pos)) { mate = o; mateDistance = d; }
  }
  // 近い敵の隙を突く間も、横から自分へ打ち込む兵を先に受ける。
  // この戦は性格の頭が構えを上書きしないため、ここで実際の打ち手へ向く。
  // 二の丸の乱戦では、近い侍の溜めより先に横の槍が届く。
  // 距離だけで構える相手を決めず、実際に刃が届くまでの時を比べる。
  let attacker = null, impact = Infinity, attackDistance = Infinity;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.team === u.team || o.isStruct || o.fleeing || o.woundOut || o.noTarget ||
        Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    const swing = o.swing && !o.swing.done && o.swing.target === u;
    const charge = o.charging && o.target === u;
    if (!(o.atk && !o.atk.ranged && !o.atk.bow && o.atk.target === u) && !swing && !charge) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 柵を越して届く槍も受ける。通れない事と、武器が届く事は分ける。
    if (d > 8 || b.army.wallBetween(o.pos, -1, u.pos,
        (o.wpnKind || o.lookWeapon) === 'spear' && d <= o.reach + .3)) continue;
    const soon = charge ? 0 : swing ? Math.max(0, o.swing.dur * o.swing.at - o.swing.t) : o.atk.t;
    if (soon < impact || soon === impact && d < attackDistance) {
      attacker = o; impact = soon; attackDistance = d;
    }
  }
  const e = attacker || b.army.nearestEnemy(u, 12, (o) => !o.isStruct && !o.fleeing && !o.woundOut && !o.noTarget && !o.invuln &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos, false) &&
    // 戸口の敵への応戦は残し、届かない室内の敵に誘われて列を離れない。
    (F.honFell || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= (p.weapon === 'sword' ? 1.6 : 2.5) ||
      !nakaFind(o.pos.x, o.pos.z)) &&
    // 城外では逃げる兵を坂へ追わない。道の外から実際に打つ兵には上の判定で応戦する。
    (here || (o.pos.x >= OTE.x && o.pos.x <= 119 && Math.abs(o.pos.z - OTE.z) < 4)) &&
    (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 4 ||
      ((F.sallyOut || F.sallyUntil) && o.group === F.reserveDef.real && o.pos.x >= OTE.x && Math.abs(o.pos.z - OTE.z) < 4) ||
      (here && mateDistance < 6 && here.test(o.pos.x, o.pos.z) &&
        Math.hypot(o.pos.x - mate.pos.x, o.pos.z - mate.pos.z) < 6)));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 四歩以内の敵にも列の支えを確かめる。近いだけで追うと塀際へ誘い出される。
    // 退き先が見つからない深手・息切れでも、ここから追撃を再開しない。
    const reach = p.weapon === 'sword' ? 1.6 : 2.5;
    if (!attacker && d > reach && here && mateDistance < 6 &&
        (F.honFell || !nakaFind(e.pos.x, e.pos.z)) &&
        here.test(e.pos.x, e.pos.z) && Math.hypot(e.pos.x - mate.pos.x, e.pos.z - mate.pos.z) < 6 &&
        u.hp >= u.maxHp * .6 && p.sta >= p.maxSta * .35 && !(p.guardBroken > 0) &&
        clearFoot(b, e.pos) && localClear(b.army, u.pos, e.pos, true))
      goTo(p, inp, e.pos.x, e.pos.z, reach);
    // 長い振りかぶりを受け続けるだけでは、気力を失い反撃も出ない。
    // 別の打ち手がいない時だけ、普通の突きが先に届く隙を使う。
    let opening = true;
    for (const other of b.army.threats || []) {
      if (other === e || !other.alive || other.fleeing || other.woundOut || other.noTarget ||
          other.type === 'gun' || other.type === 'bow' || Math.abs(other.pos.y - u.pos.y) >= 3) continue;
      const gap = Math.hypot(other.pos.x - u.pos.x, other.pos.z - u.pos.z);
      if (gap < 8 && !b.army.wallBetween(other.pos, -1, u.pos,
          (other.wpnKind || other.lookWeapon) === 'spear' && gap <= other.reach + 0.3)) {
        opening = false; break;
      }
    }
    patientStrike(p, inp, e, d, opening);
    return;
  }
  inp.guardHold = false;
  // 出撃を受ける下知の間は、門や遠い城兵へ進まず味方の槍の列へ戻る。
  // 目の前の打ち手への応戦は上で済ませる。退く城兵を追って列から離れない。
  if (F.sallyOut || F.sallyUntil) {
    let receiver = null, distance = Infinity;
    for (let i = 0; i < 2; i++) {
      const group = (i === 0 ? F.oteSpear : F.reserve).real;
      if (!group || group.routed) continue;
      for (const ally of group.units) {
        if (!ally.alive || ally.fleeing || ally.woundOut || ally.noTarget ||
            Math.abs(ally.pos.y - u.pos.y) >= 3) continue;
        if (!F.honFell && nakaFind(ally.pos.x, ally.pos.z)) continue;
        const gap = Math.hypot(ally.pos.x - u.pos.x, ally.pos.z - u.pos.z);
        if (gap < distance && !b.army.wallBetween(u.pos, -1, ally.pos)) { distance = gap; receiver = ally; }
      }
    }
    b.botFollowingTaba = true;
    inp.runHeld = false; inp.leftPressed = false; inp.chargeHold = false;
    if (receiver && distance > 3) goTo(p, inp, receiver.pos.x, receiver.pos.z, 2);
    return;
  }
  // 近い打ち手がいない時に先手へ戻る。三の丸の奥へ一人で進み直さない。
  if (here && mate && mateDistance > 5 && !F.honFell) {
    goTo(p, inp, mate.pos.x, mate.pos.z, 3);
    inp.runHeld = false; inp.leftPressed = false; inp.chargeHold = false;
    return;
  }
  if (F.honFell && F.C.kuruwa.hon.test(u.pos.x, u.pos.z)) {
    const target = F.keep.down ? F.honPost : F.keep.guide();
    goTo(p, inp, target.x, target.z, 1.5);
    return;
  }
  const target = roadTarget(b, 'botRoadI', F.botRoadTarget);
  // 閉じた門へ一人で先に着くと、櫓と塀の上から撃たれ続ける。味方の衆が門へ寄るまで、その列の中で待つ。
  // 開いた口の先に城兵が固まっている時（二の丸の備えなど）も同じ。味方の槍が先に入るまで、列の中で待つ。
  let foes = 0;
  if (target && !target.gate) for (const o of b.army.units) {
    if (!o.alive || o.team === u.team || o.fleeing || o.woundOut || o.noTarget || o.isStruct || Math.abs(o.pos.y - u.pos.y) > 3) continue;
    if (Math.hypot(o.pos.x - target.x, o.pos.z - target.z) < 12 && ++foes >= 3) break;
  }
  // 深手（三割五分を切る）の時は、城兵の固まる曲輪へ入らない。その場で味方の列に任せ、寄る者だけを受ける。
  if (foes >= 3 && u.hp < u.maxHp * 0.35) return;
  if (target?.gate || foes >= 3) {
    let near = 0, mate = null, md = Infinity;
    for (const o of b.army.units) {
      if (!o.alive || o.team !== u.team || o === u || o.fleeing || o.woundOut || o.noTarget || o.isStruct || o.group?.isRunner || o.type === 'porter') continue;
      if (Math.abs(o.pos.y - u.pos.y) > 3) continue;
      if (!F.honFell && nakaFind(o.pos.x, o.pos.z)) continue;
      if (Math.hypot(o.pos.x - target.x, o.pos.z - target.z) < 10) near++;
      const g = o.group;
      if (g === F.oteSpear.real || g === F.reserve.real || !target.gate && o.type !== 'gun' && o.type !== 'bow') {
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d < md) { md = d; mate = o; }
      }
    }
    // 味方を待つのは一つの的につき二十秒まで（味方が減ると、門の前で待ち続けて戦が止まる）。
    const waitKey = target.gate || Math.round(target.x / 8) + ',' + Math.round(target.z / 8);
    if (F.botWaitFor !== waitKey) { F.botWaitFor = waitKey; F.botWaitT = b.t; }
    if (b.t - F.botWaitT < 20 && near < (target.gate ? 3 : u.hp < u.maxHp * 0.6 ? 5 : 3) && mate && Math.hypot(mate.pos.x - target.x, mate.pos.z - target.z) > 6) {
      if (md > 3) goTo(p, inp, mate.pos.x, mate.pos.z, 2);
      return;
    }
  }
  if (target) {
    const { x, z, gate: t } = target;
    goTo(p, inp, x, z, 0.6);
    if (t && Math.hypot(u.pos.x - x, u.pos.z - z) < 1) {
      const mx = (t.seg[0] + t.seg[2]) / 2, mz = (t.seg[1] + t.seg[3]) / 2;
      p.yaw = Math.atan2(mx - u.pos.x, mz - u.pos.z);
      // 槍の空振りを重ねず、画面で案内している掛矢を使う。
      // 門前へ歩き続けないので、柱への挟まりと突きの連続音も防ぐ。
      inp.k.delete('KeyW'); inp.leftPressed = false; inp.chargeHold = false;
      const it = b.nearestInteract();
      if (it?.id === '_gram' && b._gg?.cur === t) inp.k.add('KeyE');
    }
  }
};

export { takato_siege };
