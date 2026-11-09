// ======================================================================
// 徳川編 3　岐阜城の戦い（慶長五年 1600・八月二十三日）　関ヶ原の前の、東軍の最初の大きな城攻め
// 筋書きの正：docs/chapter3_tokugawa.md の「3. 岐阜城」。手本と出所：docs/battle_refs/k03_gifu.md（11/4 の調べ）
// 米野で敗れた城方は岐阜城へ籠もった。二十三日朝、浅野幸長らが南西の瑞龍寺山砦を落とし、池田輝政は西の麓から、福島正則は南の大手（七曲り）から登った。
// 本丸のほかは一日で落ち、城主の織田秀信（信長の孫）は自害しかけたが説き伏せられて降り、高野山へ送られた。輝政と正則は一番乗りを争った。
// 昔、信長と藤吉郎が落とした稲葉山を、今度は徳川方で攻める（織田編の稲葉山を思い出させる台詞）。
// 主人公は池田輝政の手の部将。目標は五つ（STAGES・始めから全部並べる）。負け：本人が討たれた時だけ（刻限を過ぎると味方の隊が押し包んで物語は進む・物差し二-5・十二-3）。
//   ①城下の総門口の津田藤三郎の鉄砲衆 ②居館の御殿を守る百々綱家の手勢 ③百曲りの中腹の砦の百々綱家の隊
//   ④二の丸の櫓門の前の木造長政の隊 ⑤上台所の先、本丸の門を守る秀信の旗本 → 秀信が降る
// 守将の割り当て（docs/battle_learn/k03_gifu.md）：総門口＝津田藤三郎／御殿・百曲口＝百々綱家／七曲口＝木造長政の父子／瑞龍寺山砦＝河瀬左馬之助／稲葉山・権現山＝松田重大夫／水の手口＝武藤助十郎
// 11/3 kaito AP〜AT：見せかけの軍勢は置かない（見える兵は全部本物）。旗は池田（揚羽蝶）・浅野（違い鷹の羽）・福島（沢瀉）・城方（織田木瓜）だけ。
//   総大将の池田輝政は西の城下の本陣で旗本に囲まれて座り、織田秀信は本丸の奥で旗本に囲まれて座る（どちらも前に出ない・AT3）。
//   名のある守将は馬上で隊を率い、崩れると本丸へ退く（百々綱家・木造長政は降って生き延びた＝史実。討ち死にさせない）。
//   兵の比：東軍およそ三万四千・城方およそ六千五百（右上の数）。本物の兵もどの段も寄せ手が二〜三倍（AT4）。
// 向き：北が -z、東が +x（金華山の頂）。西の城下から東へ、山道を本丸（頂）へ登る。長良川は北の麓を西へ流れる。
// 地形：国土地理院の標高（dem_gifu.js・tools/dem.mjs の gifu）。水平は実の 1/4、高さは 0.15 倍。
// ======================================================================
import { siegeStages } from './siege_stages.js';
import { demSample } from './dem.js';
import DEM from './dem_gifu.js';
import { hut, nobori, jinmaku, kagaribi, tenshu, sumiyagura, yagura, ishigaki, dobei, kabukimon, yaguramon, village, yokoyaZa, makeKitBatch, finalizeKitBatch } from './props.js';
import { goten } from './castle_parts.js';
import { farSight } from './far_sight.js';
import { RANKS } from './state.js';
import { STAGES, KILLS, cut } from './stages.js';
import { TEGARA_ON } from './merit.js';
import { GENERALS } from './units_data.js';
import { sfx } from './audio.js';
import { allyGroup, enemyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, rectPoly, polyCenter } from './castle_plan.js';
import { routeTools } from './b_k_route.js';
import { addTaba, patchGunCover, tickTabas } from './taketaba.js';
import { makeRockTraps } from './siege_rocks.js';
import { timeslipField } from './timeslip_field.js';
import { install as installKaijo } from './k03_gifu/kaijo.js';   // 東軍の厚み・連続の知らせ・木瓜の旗が下りる（toku15 の 3）

const ID = 'k03_gifu';
TEGARA_ON.add(ID);

// ---- 名のある武将の甲冑（無ければ足す）。黒を基本に威しの色だけで分ける（AV1） ----
const face = (o) => ({ w: 1.05, jaw: 1.1, chin: 1, cheek: 1, gaunt: 0.2, brow: 1.2, nose: 1, nw: 1.1, eye: 1.1, t: 5, hair: 0x15110d, age: 40, ...o });
const give = (name, g) => { GENERALS[name] ||= { horo: 0, haoriMonCol: 0xe6dfcf, skin: 0x9c7453, ...g }; };
give('池田輝政', { armor: 0x1e1c1a, lace: 0x2e3a52, hat: 'kabuto_s', haori: 0x2e3a52, mon: 'ageha', tack: 0x2a2a38, lord: true,
  face: face({ age: 36, jaw: 1, beard: { mus: 0.5, musW: 0.9, droop: 0.2, goat: 0.1, side: 0, stub: 0.4 } }) });
give('池田長吉', { armor: 0x201e1c, lace: 0x2e3a52, hat: 'kabuto_m', haori: 0x2a2a3a, mon: 'ageha',
  face: face({ age: 30, beard: { mus: 0.4, musW: 0.9, droop: 0.2, goat: 0, side: 0, stub: 0.3 } }) });
give('浅野幸長', { armor: 0x1c1a1a, lace: 0x3a2e24, hat: 'kabuto_w', haori: 0x2a241e, mon: 'asano',
  face: face({ age: 24, jaw: 1, brow: 1.1, beard: { mus: 0.3, musW: 0.9, droop: 0.1, goat: 0, side: 0, stub: 0.2 } }) });
give('福島正則', { armor: 0x1c1a18, lace: 0x5a2a20, hat: 'kabuto_t', haori: 0x2e2420, mon: 'mizuno',
  face: face({ age: 39, jaw: 1.25, brow: 1.4, beard: { mus: 0.8, musW: 1.1, droop: 0.5, goat: 0.4, side: 0.5, stub: 0.9 } }) });
give('織田秀信', { armor: 0x1e1c1a, lace: 0x6a2a24, hat: 'kabuto_s', haori: 0x2a1e1c, mon: 'oda', tack: 0x2a2018, lord: true,
  face: face({ age: 20, w: 1, jaw: 0.95, brow: 1, gaunt: 0.1, beard: { mus: 0.2, musW: 0.8, droop: 0.1, goat: 0, side: 0, stub: 0.1 } }) });
give('津田藤三郎', { armor: 0x221e1c, lace: 0x5a4a2a, hat: 'kabuto_m', haori: 0x2e2620, mon: 'oda',
  face: face({ age: 45, beard: { mus: 0.7, musW: 1, droop: 0.4, goat: 0.3, side: 0.3, stub: 0.7 } }) });
give('木造長政', { armor: 0x1e1e20, lace: 0x4a4a52, hat: 'kabuto_w', haori: 0x2a2a30, mon: 'oda',
  face: face({ age: 40, beard: { mus: 0.6, musW: 1, droop: 0.4, goat: 0.2, side: 0.2, stub: 0.5 } }) });
give('百々綱家', { armor: 0x1c1614, lace: 0x7a3a2a, hat: 'kabuto_g', haori: 0x2a1c18, mon: 'oda',
  face: face({ age: 52, gaunt: 0.4, brow: 1.4, jaw: 1.2, beard: { mus: 0.8, musW: 1.1, droop: 0.5, goat: 0.5, side: 0.5, stub: 1 } }) });

// ---- 場所（ゲームの座標） ----
const START = { x: -196, z: 8 };        // 池田勢の寄せ口（城下の西の田）
const HONJIN = { x: -214, z: 10 };      // 池田輝政の本陣（西の城下の外れ。旗本に囲まれて動かない）
const SHITA = { x: -166, z: 4 };        // 城下の西の口（町家の並び）
const OTE = { x: -132, z: 0 };          // 山麓の居館（千畳敷。西の麓の槻谷）
const NANA = { x: -92, z: -6 };         // 百曲りの中腹の砦
const NI = { x: -66, z: -2 };           // 二の丸の櫓門の前
const DAI = { x: -20, z: 0 };           // 上台所の先、本丸の門の前
const HON = { x: 2, z: 0 };             // 本丸（山の頂）
const SEAT = { x: -5, z: 0 };           // 秀信の座（本丸の門の内。門の前から姿と名が見える）
const KARAME = { x: 18, z: 66 };       // 南の大手（七曲り）から登って来る福島勢の出所
const ZUIRYU = { x: -140, z: 150 };     // 瑞龍寺山から寄せる浅野勢の出所
const EXIT_E = { x: 40, z: 6 };         // 崩れた城方が退く所（本丸の裏門の外）

// 道は曲輪の口（石垣の切れ目）を通す。曲輪の縁を斜めに横切らない
const ROUTE = [
  [-220, 8], [START.x, START.z], [-180, 6], [SHITA.x, SHITA.z], [-148, 2], [OTE.x, OTE.z], [-118, -4], [-100, -8], [-90, -8], [-80, -6],
  [-75, -2], [-60, -2], [-53, 0.4], [-47, 0.7], [-42, 0.9], [-37, 0.6], [-30, -1], [-24, -1.4], [-14, 0], [0, 0],
];
// 長良川：金華山の北の麓を洗い、長良橋のあたりから西南へ下る（国土地理院の地図の流れを 1/4 に縮めた形。川幅も縮めた推定）
const NAGARA = [[290, -198], [150, -182], [40, -170], [-80, -160], [-175, -146], [-290, -124]];

// 目標ごとの時間（秒）。過ぎても負けにはしない：味方の隊が押し包み、さらに九十秒で段の守りは退く（物語は進む）
const STEP_T = [0, 200, 210, 220, 230, 240];
const STEP_TEXT = ['',
  '城下の総門口で、津田藤三郎の鉄砲衆を討て',
  '山麓の居館の冠木門を破り、御殿を守る百々綱家の手勢を討て',
  '百曲りを登り、中腹の砦の百々綱家の隊を討て',
  '二の丸の櫓門の前で、七曲りから退いた木造長政の隊を討て',
  '上台所を抜け、本丸の門を守る秀信の旗本を討て'];
const STEP_AT = [null, SHITA, OTE, NANA, NI, DAI];

// 城方：くすんだ黒の具足に織田木瓜。東軍：池田の揚羽蝶・浅野の違い鷹の羽・福島の沢瀉（福島沢瀉。沢瀉の紋の絵を使う）
//   斬り合いの塊で見分けがつかなかった（critic60 九-3）：城方は赤茶の威、東軍は家ごとの紺・焦げ茶・暗緑の威（具足の黒は同じ）
// 11/8 critic60（九3・五3）：両軍同じ黒っぽい具足で斬り合いの塊の中で見分けられなかった。籠城の織田方は朱を帯びた茶の漆に（遊びの見分け）
const WEST = { armor: 0x6a3022, lace: 0x8c3424, flag: 'oda' };
const IKEDA = { flag: 'ageha', lace: 0x34466a };
const ASANO = { flag: 'asano', lace: 0x4a3a2a };
const FUKU = { flag: 'mizuno', lace: 0x3a4a3e };
const dress = (look) => (list) => list.map((s) => ({ ...s, o: { ...look, ...(s.o || {}) } }));
const wD = dress(WEST), ikD = dress(IKEDA), asD = dress(ASANO), fkD = dress(FUKU);
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });
const busho = (name, o = {}) => ({ type: 'busho', n: 1, o: { name, invuln: true, horse: true, ...o } });
const live = (g) => g && g.units.some((u) => u.alive && !u.gone && !u.fleeing);
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0) : 0);
// 段の守りの残り：持ち場から 30m より離れた兵は追い払ったと数える（①の鉄砲衆の残りが居館の方へ下がり、段が三百秒続いた）
const holdN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing && dist(u.pos, g.anchor) < 30 ? 1 : 0), 0) : 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 城方は味方と斬り合う所へは石を落とさない（斬り合いの最中に上から石が続けて当たり、本人が倒れた。11/8 bot）
const noMelee = (rt) => { const u = rt.player?.u; return !(u && rt.army.nearestEnemy(u, 6, (o) => !o.fleeing)); };
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };
const KEEP = 0.4;   // 段の隊は四割まで減れば崩れる（倒す数＝六割）

// ---- 地形：金華山。実測の起伏を縮めて写し、曲輪は平らに均す ----
const XY = 4, SC = 0.15, FOOT = demSample(DEM, -760, 0);
function base(x, z) {
  const n = (demSample(DEM, x * XY, z * XY) - FOOT) * SC;
  return Math.max(-1.2, n) + 0.25 * Math.sin(x * 0.07) * Math.cos(z * 0.06);
}

const lv = (cx, cz, up = 0.4) => (b) => b(cx, cz) + up;
const PLAN = {
  mon: 'oda', name: '岐阜城', type: 'yama', year: 1600, gateSlope: 7, lifeNoFlags: true,
  // 西の麓の居館（巨石の石垣の段）→ 百曲りの中腹の砦（土と柵）→ 山上：一の門の巨石の通路・二の丸（右へ折れて入る石段）→ 上台所 → 本丸（天守・東に裏門）
  kuruwa: [
    { id: 'ote', name: '山麓の居館', level: lv(-132, 0), wall: 'dobei', stone: true, kind: 'san', poly: rectPoly(-142, -122, -12, 12), gapAt: [[-142, 1.2], [-122, -2.9]], gapW: 6, floor: false },
    { id: 'baba', name: '中腹の砦', level: lv(-92, -6, 0.6), wall: 'saku', kind: 'koshi', poly: rectPoly(-100, -84, -12, 6), gapAt: [[-100, -8], [-84, -7]], gapW: 5, floor: false },   // 柵と土の砦（石畳を敷かない）
    { id: 'ni', name: '二の丸', level: lv(-60, -2, 0.6), wall: 'ishigaki', kind: 'ni', poly: rectPoly(-70, -50, -10, 8), gapAt: [[-70, -2], [-50, 0.5]], gapW: 5 },
    { id: 'dai', name: '上台所', level: lv(-33, 0, 0.6), wall: 'ishigaki', kind: 'koshi', poly: rectPoly(-40, -26, -8, 7), gapAt: [[-40, 0.9], [-26, -1.5]], gapW: 5 },
    { id: 'hon', name: '本丸', level: lv(0, 0, 0.8), wall: 'ishigaki', kind: 'hon', poly: rectPoly(-12, 12, -10, 10), gapAt: [[-12, 0], [12, 0]], gapW: 5 },
  ],
  koguchi: [
    { id: 'ote_w', name: '居館の口', from: 'out', to: 'ote', kind: 'hira', at: [-142, 1.2], rot: -Math.PI / 2, w: 5 },
    { id: 'ote_e', name: '居館の奥の口', from: 'ote', to: 'out', kind: 'hira', at: [-122, -2.9], rot: Math.PI / 2, w: 5 },
    { id: 'baba_w', name: '砦の口', from: 'out', to: 'baba', kind: 'hira', at: [-100, -8], rot: -Math.PI / 2, w: 4.4 },
    { id: 'baba_e', name: '砦の奥の口', from: 'baba', to: 'out', kind: 'hira', at: [-84, -7], rot: Math.PI / 2, w: 4.4 },
    { id: 'ni_w', name: '二の丸の口', from: 'out', to: 'ni', kind: 'hira', at: [-70, -2], rot: -Math.PI / 2, w: 4.4 },
    { id: 'ni_e', name: '二の丸の奥の口', from: 'ni', to: 'out', kind: 'hira', at: [-50, 0.5], rot: Math.PI / 2, w: 4.4 },
    { id: 'dai_w', name: '上台所の口', from: 'out', to: 'dai', kind: 'hira', at: [-40, 0.9], rot: -Math.PI / 2, w: 4.4 },
    { id: 'dai_e', name: '上台所の奥の口', from: 'dai', to: 'out', kind: 'hira', at: [-26, -1.5], rot: Math.PI / 2, w: 4.4 },
    { id: 'hon_w', name: '本丸の口', from: 'out', to: 'hon', kind: 'hira', at: [-12, 0], rot: -Math.PI / 2, w: 4.4 },
    { id: 'hon_e', name: '裏門', from: 'hon', to: 'out', kind: 'hira', at: [12, 0], rot: Math.PI / 2, w: 4.4 },
  ],
  // 一の門の北の竪堀（岐阜市の令和七年度の調査で幅約八・五メートル。縮めた推定）。道から外し、北の斜面へ落とす
  hori: [{ kind: 'tatebori', pts: [[-66, -22], [-70, -46]], w: 2.6, deep: 1.8 }],
  paths: [{ id: 'nana', kind: 'ote', pts: ROUTE.slice(3) }],
};
let HEIGHT_FN = null;
// 竪堀は地面も掘る（castle_plan の堀の窪みは城の中の高さにしか混ざらないので、世界の高さにも同じ窪みを入れる）
const TATE = PLAN.hori[0];
function height(x, z) {
  if (!HEIGHT_FN) HEIGHT_FN = heightOf(PLAN, base, 3);
  const h = HEIGHT_FN(x, z), d = distToPolyline(x, z, TATE.pts);
  return d < TATE.w ? h - TATE.deep * (1 - (d / TATE.w) ** 2) : h;
}

const { way: kWay, routeAt } = routeTools(ROUTE, 'k03');
// routeTools は曲がり角から 1.5〜2m の所で角を返し続け、bot（着いたとみなす輪 2m）が城下の口で止まった。角の際では次の角を返す
const RW = { d: 0, s: 0, x: 0, z: 0 };
function gifuWay(army, u, want) {
  // 七曲りの兵を西の百曲りへ吸い寄せず、南から門下まで登らせる。
  if (u.group?._gfSouth && u.pos.z > 10) return want;
  const q = kWay(army, u, want);
  if (q === want || Math.hypot(q.x - u.pos.x, q.z - u.pos.z) >= 2.6) return q;
  const i = ROUTE.findIndex((p) => p[0] === q.x && p[1] === q.z);
  if (i < 0) return q;
  routeAt(want.x, want.z, RW);
  const j = RW.s > i ? i + 1 : i - 1;
  if (j < 0 || j >= ROUTE.length || (RW.s > i ? j > RW.s : j < RW.s)) { q.x = RW.x; q.z = RW.z; } else { q.x = ROUTE[j][0]; q.z = ROUTE[j][1]; }
  return q;
}
// 隊の次の行き先：道の上の一つ先の曲がり角（b_k07_sawayama.js の wayNext と同じ作り）
const RA = { d: 0, s: 0, x: 0, z: 0 }, RB = { d: 0, s: 0, x: 0, z: 0 };
function wayNext(p, to, out) {
  routeAt(to.x, to.z, RB); routeAt(p.x, p.z, RA);
  if (RB.d > 30 || Math.abs(RB.s - RA.s) < 0.6) { out.x = to.x; out.z = to.z; return out; }
  if (RA.d > 3) { out.x = RA.x; out.z = RA.z; return out; }
  const fwd = RB.s > RA.s;
  let i = fwd ? Math.floor(RA.s) + 1 : Math.ceil(RA.s) - 1;
  if (i >= 0 && i < ROUTE.length && Math.hypot(ROUTE[i][0] - p.x, ROUTE[i][1] - p.z) < 3) i += fwd ? 1 : -1;
  if (i < 0 || i >= ROUTE.length || (fwd ? i > RB.s : i < RB.s)) { out.x = to.x; out.z = to.z; }
  else { out.x = ROUTE[i][0]; out.z = ROUTE[i][1]; }
  return out;
}

function flags(rt) {
  const W = rt.world, S = rt.scene;
  // 池田輝政の本陣：幕と揚羽蝶の旗・篝火（本当に輝政と旗本がいる所だけ）
  S.add(jinmaku(W, HONJIN.x - 4, HONJIN.z, 14, 10, 4, { mon: 'ageha' }));
  for (const [x, z] of [[HONJIN.x + 6, HONJIN.z - 8], [HONJIN.x + 6, HONJIN.z + 8], [START.x - 2, START.z - 7], [START.x - 2, START.z + 7]]) S.add(nobori(W, x, z, 'ageha', 6));
  for (const [x, z] of [[HONJIN.x + 4, HONJIN.z - 4], [HONJIN.x + 4, HONJIN.z + 5]]) S.add(kagaribi(W, x, z));
  // 城方の織田木瓜の旗（曲輪ごと）
  for (const [x, z] of [[-170, -6], [-139, -10], [-138, 9], [-96, -14], [-64, 5], [-36, -6], [-3, 8], [8, 8]]) {
    const m = nobori(W, x, z, 'oda', 5);
    S.add(m);
    // 開城で下ろす旗には、後から足した旗だけでなく元の本丸の旗も含める。
    if (x >= -12) rt.flags.k03k?.flags.push({ m, y0: m.position.y });
  }
  for (const [x, z] of [[OTE.x + 6, OTE.z - 6], [NI.x + 6, NI.z - 6], [HON.x - 6, HON.z + 4]]) S.add(kagaribi(W, x, z));
}

// 石垣の曲輪の縁を、口（gapAt）を全部空けて積む（castle_plan の石垣は口を一つしか切らないので、口が二つの曲輪はここで）。
// 縁から 2.6m 外へ張り出して積み、天端に狭間の土塀を載せる。角は辺を伸ばしてつなぐ
function stoneRing(rt, k, KB, o = {}) {
  const W = rt.world, poly = k.poly, c = polyCenter(poly), PUSH = 2.6, top = W.heightAt(c.x, c.z) + 0.3;
  const gaps = Array.isArray(k.gapAt[0]) ? k.gapAt : [k.gapAt], gw = o.gapW ?? 6.5;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const out = -uz * ((ax + bx) / 2 - c.x) + ux * ((az + bz) / 2 - c.z) >= 0 ? 1 : -1;
    const nx = -uz * out, nz = ux * out;
    // この辺の上の口を [t0, t1]（m）で切る
    const cuts = gaps.map(([gx, gz]) => ({ t: (gx - ax) * ux + (gz - az) * uz, d: Math.abs((gx - ax) * nx + (gz - az) * nz) }))
      .filter((g) => g.d < 1 && g.t > -1 && g.t < len + 1).map((g) => [g.t - gw / 2, g.t + gw / 2]).sort((p, q) => p[0] - q[0]);
    let s = -PUSH;
    const runs = [];
    for (const [t0, t1] of cuts) { if (t0 > s + 0.5) runs.push([s, t0]); s = Math.max(s, t1); }
    if (len + PUSH > s + 0.5) runs.push([s, len + PUSH]);
    for (const [t0, t1] of runs) {
      const p = (t, d) => [ax + ux * t + nx * d, az + uz * t + nz * d];
      const m = ishigaki(W, [p(t0, PUSH), p(t1, PUSH)], { topY: top, capIn: PUSH + 0.2, lean: 0.22, minH: o.minH ?? 3.4, maxH: o.maxH ?? 7, out, batch: KB, scene: rt.scene, big: o.big ?? 1.2, kind: 'nozura' });
      if (!m.isBatchedPart) rt.scene.add(m);
      const [x0, z0] = p(t0, PUSH - 0.7), [x1, z1] = p(t1, PUSH - 0.7);
      if (o.hei !== false) dobei(W, [x0, z0, x1, z1], { hikae: -out, batch: KB, baseY: top - 0.05, shikkui: true });
    }
  }
}

// 岐阜城の構え（手本：docs/battle_refs/k03_gifu.md）
function buildGifu(rt, F) {
  const W = rt.world, KB = makeKitBatch(), K = Object.fromEntries(PLAN.kuruwa.map((k) => [k.id, k]));
  // 居館・二の丸・上台所・本丸は野面の石垣に白い土塀。居館の土塀は castle_plan が壊せる塀（狭間・弾を止める）で建てるので、ここは巨石の石垣だけ
  stoneRing(rt, K.ote, KB, { hei: false, big: 2.2, minH: 2.6 });
  // 砦の背後の二の丸は低い野面積みとし、居館の巨石の構えと分ける。
  stoneRing(rt, K.ni, KB, { minH: 1.6, maxH: 3, big: 0.8 });
  for (const id of ['dai', 'hon']) stoneRing(rt, K[id], KB);
  // 居館の入口：通路の両側に二メートルほどの巨石を立て並べる（岐阜市の発掘。フロイスが見た館の道）
  for (const sd of [-1, 1]) {
    const m = ishigaki(W, [[-160, 3.3 + sd * 3.6], [-145, 1.6 + sd * 3.6]], { top: 1.6, minH: 2, maxH: 2.6, out: -sd, big: 2.6, lean: 0.12, batch: KB, scene: rt.scene, kind: 'nozura' });
    if (!m.isBatchedPart) rt.scene.add(m);
  }
  // 山上の一の門：通路に沿って巨石を並べる（岐阜市の令和六年度の調査で道三期とみられる巨石の石垣）
  for (const sd of [-1, 1]) {
    const m = ishigaki(W, [[-86, -7.2 + sd * 3.2], [-77.5, -4 + sd * 3.2]], { top: 1.2, minH: 1.6, maxH: 2.4, out: -sd, big: 2.2, lean: 0.12, batch: KB, scene: rt.scene, kind: 'nozura' });
    if (!m.isBatchedPart) rt.scene.add(m);
  }
  // 城下の総門口（津田藤三郎の受け持ち）：冠木門の両脇に短い土塀
  for (const sd of [-1, 1]) dobei(W, [-176, 5.2 + sd * 3, -176, 5.2 + sd * 11], { batch: KB, baseY: W.heightAt(-176, 5.2 + sd * 6) - 0.05 });
  finalizeKitBatch(rt, KB);
  rt.scene.add(kabukimon(W, -176, 5.2, 5.6, Math.PI / 2));
  // 門：居館の冠木門・一の門・二の丸の櫓門（入って右へ折れる石段）・上台所の門・本丸の門・裏門（形だけ。開いた門）
  rt.scene.add(kabukimon(W, -142, 1.2, 5.6, Math.PI / 2), kabukimon(W, -122, -2.9, 5.2, Math.PI / 2), kabukimon(W, -76.5, -3.2, 4.6, 0.9),
    kabukimon(W, -40, 0.9, 4.8, Math.PI / 2), kabukimon(W, -26, -1.5, 4.8, Math.PI / 2), kabukimon(W, 12, 0, 4.6, Math.PI / 2));
  try { rt.scene.add(yaguramon(W, -70, -2, 4.6, Math.PI / 2, { doors: false, inside: false }), yaguramon(W, -12, 0, 4.6, Math.PI / 2, { doors: false, inside: false })); } catch (e) { console.warn(e); }
  // 居館の御殿（フロイスが四重と書いた館。ここでは二層の御殿で見せる。戦の時は百々綱家が守った）
  try { goten(rt, -133, -8, { w: 10, d: 5, team: 1, name: '居館の御殿' }); goten(rt, -129, 8, { w: 8, d: 4.5, team: 1, name: '居館の御殿' }); } catch (e) { console.warn(e); }
  // 城下（岐阜町）：西の麓に町家の並び。城下の斬り合いの場（道の周り）からは離し、兵が家の間に詰まらないように
  rt.scene.add(village(W, -212, -32, { n: 6, r: 14, rot: 0.05, fields: 0, bamboo: 0, smoke: 0, seed: 16001, groundedHomes: true }),
    village(W, -168, 46, { n: 5, r: 12, rot: -0.1, fields: 0, bamboo: 0, smoke: 0, seed: 16002, groundedHomes: true }));
  // 城下の町家：総門の内外の道の両脇に板葺きの町家を並べる（岐阜町は惣構えの内の町。道からは十歩ほど離し、斬り合いの場を空ける）
  for (const x of [-204, -193, -182, -170, -160, -151]) for (const [z, r] of [[-11, 0.04], [19, -0.04]]) rt.scene.add(hut(W, x, z + (x > -176 ? -3 : 0), 8, 5.5, r, { wall: 0x7f6b52, groundedHome: true, minka: false }));
  // 瑞龍寺山の砦（南西の外山。朝のうちに浅野勢が落とした）：浅野の違い鷹の羽の旗が立つ
  rt.scene.add(yagura(W, -140, 192, { mon: 'asano', team: 0 }));
  // 落ちた外の砦の煙：瑞龍寺山（南西）と、井伊の手が寄せた権現山・稲葉山の砦（南の尾根）。山の上から見渡すと見える
  try { for (const [x, z, sz] of [[-136, 188, 1.6], [-150, 198, 1.1], [-48, 168, 1.4], [-20, 182, 1]]) W.addSmokeColumn(x, W.heightAt(x, z) + 1, z, { size: sz, black: true }); } catch (e) { console.warn(e); }
  // 遠景の煙は共有の束のまま、外山まで霧に沈めずに描く。
  farSight(W.smokeCol?.far.mesh, { far: 280, cap: 0.45 });
  for (const [x, z] of [[-146, 186], [-133, 196], [-142, 200]]) rt.scene.add(nobori(W, x, z, 'asano', 6));
  // 横矢の座：二の丸の口と本丸の口の脇の石垣の上。登って来る者を横から撃つ（鉄砲は百曲りを登る段で入る＝manYokoya）
  F.yokoyaZa = [{ x: -66, z: -8.5, rot: -1.03 }, { x: -8, z: -8, rot: -1.04 }].map((yk) => { const z = yokoyaZa(W, yk.x, yk.z, yk.rot, { n: 2 }); rt.scene.add(z.group); return z; });
}
// 横矢の鉄砲を座に入れる（二の丸の口と本丸の口の脇の石垣の上。登って来る者を横から撃つ）
function manYokoya(rt, F, i) {
  const z = F.yokoyaZa[i];
  if (!z || F.yokoya[i]) return;
  const g = enemyGroup(rt, { faction: 'oda', name: '横矢の鉄砲', anchor: z.center, fixed: true, facing: Math.atan2(z.fwd.x, z.fwd.z), width: 2, aggro: 22, morale: 90, fire: true }, wD([uG(3)]));
  g.units.forEach((u, k) => { const s = z.spots[k % z.spots.length]; u.pos.x = s.x; u.pos.z = s.z; });
  g.dmgMult = 0.55;
  F.yokoya[i] = g;
  F.foes.push(g);
}

const k03_gifu = {
  resumeSteps: 5,   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを toStep(①〜5) を順に流して作り直す
  // 身の回りの合戦の跡（timeslip_field.js）。岐阜城：旧暦八月二十三日（新暦九月三十日・初秋）の城下と山道。乾いた土埃、倒れた槍と矢、秋口の草
  timeslip: {
    wet: 0.1, dust: 0.6, trample: 0.3, debris: 1.1, arrows: 0.9, maxSlope: 0.3,
    grass: 0x80984e, grassTints: [0xffffff, 0xe4e6c0, 0xd0c898], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a3a],
  },
  spawn: { x: START.x + 4, z: START.z, heading: Math.PI / 2 },
  noWake: true,
  minutes: 18,
  pacingWait: () => true,   // 時間だけでは退かない。各曲輪の到着と守りの突破、最後の降伏を待つ（G8）。
  lethal: false,   // 命懸けの戦場は入れない（11/8 bot：入れると山道で手勢が減って進まず、十八分で任務失敗）
  fearKind: { kind: '山城攻め', note: '狭い山道で上から撃たれ、石を落とされる', w: { losses: 1.3, flank: 1.3, iso: 1.2 }, line: '上から来るぞ、伏せよ！' },
  noFrontFill: true,       // 見せかけの軍勢（奥の軽い乱戦・自動の大軍）を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ
  compactIntro: true,
  introText: () => '米野で敗れた織田秀信が岐阜城に籠もった。池田勢の先手として城下から金華山を登り、本丸へ迫れ。',
  hideGuideSteps: true,
  stageGoalsOnly: true,   // 目標は五つの段だけ（始めから①〜⑤を並べる・物差し九-1・十-1）
  noCouriers: true,
  // 浅野・池田長吉の手が前の曲輪へ駆け上る時、共通の使番が「後方にて陣を移す」と言った（寄せる向きと逆の言葉）。寄せ手の動きは段の台詞で言う
  noAllyReports: true,
  // 共通の「櫓の中へ入り、守りを追い出せ」の脇の任務と案内が、①〜⑤の外に出た（物差し三-3・五-1）。櫓は段の曲輪の一部として攻める
  noYaguraTask: true,
  noTaisho: true,
  noReserve: true,
  noTaishoRaid: true,
  foeMarks: true,
  playerAtkMax: 3,
  playerTaken: 0.6,    // 城攻めは登る間ずっと怖い（0.5 では命が 90〜100 のまま・critic60 十-3）
  playerRegen: 0.02,
  closeCombatAssist: true,
  noWinCrane: true,
  ownEnding: true,   // 秀信の降伏はこの戦で二十八秒見せる。共通の降伏を重ねて始めない。
  camLookAt: (rt, u) => (u.pos.x < -125 && u.pos.x > -170 ? { x: -132, z: 0, up: 2 } : null),   // 城下の坂では居館の石垣を見る（up 12 だと始まりに空と雲だけになった）
  // 行き先のピン：段ごとに一つ（字は出さない）。場所は段ごとに決まっている（AW3）
  missionPin(rt) {
    const F = rt.flags;
    if (!F.step || F.ending) return null;
    const p = STEP_AT[F.step];   // 行き先は段ごとに固定（物差し三-2）
    PIN.x = p.x; PIN.z = p.z;
    return PIN;
  },
  talk: {
    before: [['池田輝政', '米野で破った岐阜中納言殿の兵は、みな城へ逃げ込んだ。中納言殿は信長公の御孫よ'],
      [null, '稲葉山……昔、信長公と太閤殿下が落とされた山ですな'],
      ['池田長吉', '浅野殿は南西の瑞龍寺山の砦を落とした。福島殿は南の大手、七曲りから登る'],
      ['池田輝政', '我らは西の城下から居館を破り、百曲りを登る。福島に一番乗りを取られるな。かかれ！']],
  },
  world: {
    seed: 1600823,
    landmarkViewFar: 280, // 城下から天守、山上から外山まで。草木と兵の描画距離は増やさない。
    lowUnitNear: 26, highUnitNear: 26, highUnitGrid: 0.025, // 総門前の兵の頭と手足を粗い塊へ潰さない。
    time: 'morning',   // 二十三日の朝に攻めかかった（居館を破ると日が高くなる）
    groundHalf: 290,
    moveLim: 250,
    paths: [ROUTE.slice(0, 6), ROUTE.slice(5)],
    height,
    moveWay: gifuWay,
    // 長良川（北の麓の天然の堀）。戦の道からは遠いので、渡れない深みの判定（riverCross：山の兵の歩みも変える）は付けない
    streams: [{ pts: NAGARA, w: 24, depth: 3, soundHeight: true }],
    tint(x, z, h, c) {
      // 柵の砦は道も含めて踏み固めた褐色の土。砂利の平場と分ける。
      if (x > -100 && x < -84 && z > -12 && z < 6) { c.setRGB(0.25 + c.r * 0.18, 0.17 + c.g * 0.14, 0.10 + c.b * 0.1); return; }
      if (distToPolyline(x, z, ROUTE) < 3.2) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      if (h < 3 && x < -150) { c.setRGB(c.r * 0.6 + 0.26, c.g * 0.6 + 0.22, c.b * 0.5 + 0.06); return; }
      // 金華山は赤と灰のチャートの岩山（岐阜大学「岐阜の地学」）。高い斜面は岩肌の赤灰を混ぜる
      if (h > 14 || (h > 6 && x > -122)) { const rock = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 3); c.setRGB(c.r * 0.6 + 0.13 * rock + 0.06, c.g * 0.66 + 0.06 * rock + 0.04, c.b * 0.56 + 0.06 * rock + 0.03); }
    },
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 7 || dist({ x, z }, HONJIN) < 16 || PLAN.kuruwa.some((k) => x > k.poly[0][0] - 2 && x < k.poly[1][0] + 2 && z > k.poly[0][1] - 2 && z < k.poly[2][1] + 2),
    trees: 460,
    // 金華山は赤と灰のチャートの岩山（岐阜大学「岐阜の地学」）。百曲りの尾根の両脇の斜面に露岩の帯（描くだけ。歩ける地面は変えない）
    rocks: 420,
    stoneTint: [0.78, 0.66, 0.6],   // 石垣も金華山の赤と灰のチャートの色（白い丸い塊に見えた。11/8 critic60 八1）
    rockBands: [{ x: -110, z: -24, w: 14, d: 7 }, { x: -110, z: 16, w: 14, d: 7 }, { x: -80, z: -22, w: 10, d: 7 }, { x: -78, z: 18, w: 10, d: 7 }, { x: -40, z: -20, w: 16, d: 6 }, { x: -40, z: 18, w: 16, d: 6 }],
    tufts: 2200,
    // 戦国の金華山は城の斜面の木の大半が伐られていた（岐阜市の整備基本計画の推定）。城の斜面はまばらな松、離れた山と谷に林
    treeDensity: (x, z) => {
      const d = distToPolyline(x, z, ROUTE);
      if (d < 9 || distToPolyline(x, z, NAGARA) < 30) return 0;
      if (x < -150) return 0.1;
      if (Math.hypot(x + 40, z) < 95) return 0.2;
      return 1.15;
    },
    groves: [{ x: -110, z: 44, r: 16, n: 18, kind: 'sugi' }, { x: 60, z: 40, r: 18, n: 24, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? x > 30 || z > 200 : x < -250),
  },
  sides: { a: { name: '東軍（池田輝政・福島正則・浅野幸長ら）', mon: 'ageha' }, b: { name: '織田秀信の籠城勢', mon: 'oda' } },
  keepOda: ['b'],   // 籠城の織田秀信方は本物の織田家。木瓜を桐・永楽銭に替えない（11/6 共通の係）
  date: () => '慶長五年（1600）八月二十三日　朝',   // 新暦九月三十日の初秋。当日の天気は史料に無いので書かない

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags, S = rt.scene;
    F.step = 0; F.holdPlayer = true; F.foes = []; F.yokoya = []; F.ek = 0; F.ak = 0; F.ending = false;
    installKaijo(rt, F.k03s = {});
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    const castle0 = S.children.length;
    F.C = buildCastlePlan(rt, PLAN, { baseHeight: base, edgeW: 3, team: 1, perch: false, interiorGuards: false, skipWalls: ['ni', 'dai', 'hon'] });
    buildGifu(rt, F);
    flags(rt);
    // 金華山の頂の天守（望楼型）。池田輝政が城主の頃に三重に改め、廃城の後は加納城の御三階櫓へ移った（battle_refs）。西の城下から見える目印
    try { S.add(tenshu(W, 7, 1, { floors: 3, b: 8, base: 3, borou: true, old: true, rot: -Math.PI / 2, team: 1, name: '岐阜城の天守', where: '本丸の天守' })); } catch (e) { console.warn(e); }
    // 中腹の砦の物見櫓・上台所の隅櫓（城下から、山の麓から上へ城の構えが重なって見える）。二の丸の櫓は口の櫓門だけ
    //   （二の丸の中の太鼓櫓は、道の脇でも南の隅でも主人公が櫓の中の階段へ入り込み、⑤の間ずっと出られなかった。critic60 十-6・十一-2）
    try { S.add(yagura(W, -97, 3, { mon: 'oda', team: 1 }), sumiyagura(W, -30, 4, { w: 5.4, d: 4.6, base: 1, rot: -Math.PI / 2 })); } catch (e) { console.warn(e); }
    // 山の上の曲輪と天守は、城下の田からでも霧に沈めない（金華山の頂に城が見える）
    farSight(S.children.slice(castle0), { far: 280, W, ground: { x: -40, z: 0, r: 110 } });

    // ---- 東軍：池田輝政の本陣（旗本の侍に囲まれて床几に座る）・池田長吉の手・自分の手勢 ----
    F.honjin = allyGroup(rt, { faction: 'oda', name: '池田輝政の本陣', anchor: { x: HONJIN.x, z: HONJIN.z }, facing: Math.PI / 2, width: 8, aggro: 4, seekRange: 10, order: 'hold', fixed: true, noRout: true, fullStrength: true, morale: 100 },
      ikD([busho('池田輝政', { horse: false }), uS(18), uG(4)]));
    F.teru = F.honjin.units.find((u) => u.name === '池田輝政');
    if (F.teru) F.teru._crouch = true;   // 床几に腰を下ろす
    F.honjin.dmgMult = 0.6; F.honjin.defMult = 1.5;
    F.naga = allyGroup(rt, { faction: 'oda', name: '池田長吉の手', anchor: { x: START.x + 12, z: START.z - 5 }, facing: Math.PI / 2, width: 9, aggro: 12, seekRange: 18, speed: 3.6, order: 'hold', fixed: true, noRout: true, fullStrength: true, formation: 'yari' },
      ikD([busho('池田長吉'), uS(5), uA(18), uG(5)]));
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: START.x + 6, z: START.z + 4 }, facing: Math.PI / 2, width: 6, aggro: 12, seekRange: 16, speed: 3.6, order: 'hold', fixed: true, noRout: true, fullStrength: true, formation: 'yari' },
      ikD([uS(4), uA(12), uG(3)]));
    for (const g of [F.naga, F.mine]) { g.defMult = 1.3; g.dmgMult = 0.85; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x + 2, z: START.z + 7 }, Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 12) }]);
    W.setTime('morning');
    // 寄せ手の竹束：居館の石垣の手前（城下の坂）。石垣と土塀の狭間の鉄砲を受ける（陰の味方は前からの矢玉を防ぐ）
    patchGunCover(rt);
    for (const [x, z] of [[-152, -5], [-153, 8], [-147, -6], [-148, 9]]) addTaba(rt, x, z, 0, { fixed: true, rot: -Math.PI / 2 });
    // 山道の落石：百曲りの坂へ中腹の砦の守りが（③の間）、一の門の巨石の通路へ二の丸の守りが（④の間）石を落とす。落ちる筋は道の脇の斜面
    F.rocks = makeRockTraps(rt, { posts: [
      //   道の脇の筋を二歩寄せ、列の端へ届かせる。道の真上へは置かず、石の数を増やして登る間の脅威を保つ（G30）。
      { id: 'hyaku', team: 1, stock: 6, interval: [11, 16], lane: [[-96, -13], [-104, -12.5], [-112, -10.5], [-118, -9]], active: () => F.step === 3 && !F.next && !F.ending && noMelee(rt) },
      { id: 'ichi', team: 1, stock: 3, interval: [14, 20], lane: [[-72, -7], [-77, -9], [-84, -11.5]], active: () => F.step === 4 && !F.next && !F.ending && noMelee(rt) }] });

    // ---- 城方：城下の総門口の津田藤三郎と鉄砲衆 ----
    F.g1 = this.foe(rt, '津田藤三郎の鉄砲衆', SHITA, [busho('津田藤三郎'), uS(3), uA(7), uG(10)], { hold: true });
    // 各口の守りは前夜のうちに持ち場に就いている（籠城の割り当て）。始めから曲輪の内に置く
    //   （段ごとに出すと、見える所に湧かせない共通の決まりで奥へずらされ、戻る途中で二の丸の北の竪堀に詰まって中腹の砦にいなかった）
    F.pre = {
      2: this.foe(rt, '百々綱家の手勢', OTE, [uS(7), uA(10), uG(6)], { hold: true, width: 7, dx: 2 }),
      3: this.foe(rt, '百々綱家の隊', NANA, [busho('百々綱家'), uS(6), uA(9), uG(5), uB(3)], { hold: true, width: 6, morale: 98 }),
      // 七曲口を守った木造の父子は、福島勢に押されて二の丸へ退いた（守将の割り当ては battle_refs。二の丸で迎える形は推定）
      4: this.foe(rt, '木造長政の隊', NI, [busho('木造長政'), uS(7), uA(12), uG(7)], { hold: true, width: 7, morale: 98, dx: -2 }),
      5: this.foe(rt, '織田秀信の旗本', DAI, [uS(10), uA(6), uG(6)], { hold: true, width: 6, morale: 100, dmg: 0.55 }),
    };
    // 登る途中の曲がり角の伏兵（戦いながら登る。AT10）
    F.amb = this.foe(rt, '山道の伏兵', { x: -112, z: -14 }, [uS(1), uA(7)], { hold: true, seek: 14 });
    // 秀信は本丸の天守の前で、近習に囲まれて座る（総大将は前に出ない）
    F.hide = this.foe(rt, '織田秀信の近習', SEAT, [busho('織田秀信', { horse: false }), uS(8)], { hold: true, width: 4, morale: 100, seek: 6 });
    F.hideU = F.hide.units.find((u) => u.name === '織田秀信');
    if (F.hideU) F.hideU._crouch = true;
    manYokoya(rt, F, 0); manYokoya(rt, F, 1);
    // 段の決まり（siege_stages.js・docs/siege_honjin_spec_1107.md 5・11・13章）：今の段の守りだけが打って出て、奥の曲輪の守りは持ち場で構えて待つ。
    //   段が八十秒長引けば使番が知らせ、大将が味方の隊を出す
    F.stages = siegeStages(rt, [
      { groups: [F.g1], at: SHITA, done: () => F.step > 1 },
      { groups: [F.pre[2]], at: OTE, done: () => F.step > 2, report: '居館の冠木門、まだ破れず！', orderLine: '鉄砲を前へ。門の上を撃ちすくめよ', order: () => { if (F.naga && F.naga.count) { F.naga.order = 'attack'; F.naga.anchor = { x: OTE.x, z: OTE.z }; } } },
      { groups: [F.pre[3], F.amb], at: NANA, done: () => F.step > 3, report: '百曲りの先手、押し返されております！', orderLine: '二の手を出せ。浅野勢にも知らせよ', order: () => { if (F.asano && F.asano.count) { F.asano.order = 'attack'; F.asano.anchor = { x: NANA.x, z: NANA.z }; } } },
      { groups: [F.pre[4]], at: NI, done: () => F.step > 4, report: '二の丸の櫓門、横矢が厳しく寄れませぬ！', orderLine: '控えを右へ回せ。福島に後れを取るな', order: () => { if (live(F.naga)) { F.naga.order = 'attack'; F.naga.anchor = { x: NI.x - 8, z: NI.z }; F.naga.dmgMult = 1.2; } } },
      { groups: [F.pre[5], F.hide], at: DAI, done: () => false },
    ], { lord: '池田輝政', reportAfter: 80 });
    const T = this.talk.before;
    T.forEach(([who, s], i) => rt.after(0.6 + i * 3.6, () => rt.say(who || nm(rt), s, 3.4)));
    rt.after(0.6 + T.length * 3.6, () => { F.holdPlayer = false; this.toStep(rt, 1); });
  },

  // 城方の隊を出す（見える所に湧かせない。曲輪の内に置くか、退いた所から寄せる）
  foe(rt, name, at, list, o = {}) {
    const F = rt.flags;
    const g = enemyGroup(rt, { faction: 'oda', name, fixed: true, anchor: { x: at.x + (o.dx || 0), z: at.z }, facing: -Math.PI / 2, width: o.width || 6, noRout: true, formation: 'line',
      morale: o.morale || 95, dmgMult: o.dmg || 0.5, order: o.hold ? 'hold' : 'attack', seekRange: o.seek || (o.hold ? 16 : 40), aggro: o.hold ? 12 : 16, speed: 3.6, fire: true }, wD(list));
    // 持ち場の守りは曲輪を離れない（共通の敵の頭が前の段の斬り合いへ駆り出し、二の丸と本丸の守りが中腹で討たれて段が一度に済んでいた）
    if (o.hold) { g.stay = true; g.noAI = true; }
    F.foes.push(g);
    return g;
  },

  // 段の隊が崩れた：名のある将ごと本丸の裏門の外へ退く（討ち死にさせない）
  fall(rt, g) {
    if (!live(g)) return;
    g._fallen = true;   // 「崩れた」は段の知らせで言ったので、onRout で二度言わない
    // 共通の段替えで退却を「次の曲輪で待つ」に戻されないよう、退いた隊を段の守りから外す。
    for (const st of rt.flags.stages?.stages || []) {
      const i = st.groups.indexOf(g);
      if (i >= 0) st.groups.splice(i, 1);
    }
    g.order = 'retreat'; g.dest = { x: EXIT_E.x, z: EXIT_E.z }; g.speed = 4.2; g.aggro = 0; g.noRout = false;
  },

  // 段を進める（右上の目標と行き先のピン）
  toStep(rt, n) {
    const F = rt.flags;
    if (F.step >= n || F.ending) return;
    if (F.step) rt.objDone('s' + F.step);
    F.step = n; F.stepT = rt.t;
    // 曲輪を一つ破るごとに、次の口の下で息を整え傷を縛る（山道の段が続き、深手のまま味方の陰で動けなくなった。11/8 bot）
    if (n >= 2) rt.player.treatWounds?.(0.45, 0.8);
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    // 前の曲輪の知らせを、次の段や秀信の降伏へ持ち越さない。
    const afterStep = (delay, fn) => rt.after(delay, () => { if (!F.ending && F.step === n) fn(); });
    const go = (g, p, seek = 30) => { if (!live(g)) return; if (g._gfGo && g._gfForm) [g.formation, g.width] = g._gfForm; g.order = 'attack'; g.anchor = { x: p.x, z: p.z }; g.seekRange = seek; g._gfTo = { x: p.x, z: p.z, seek }; g._gfGo = false; g.onArrive = null; };   // 前の段の onArrive が後から着いて行き先を戻さないように
    if (n === 1) {
      sfx('horagai', 0.8);
      afterStep(1.2, () => sfx('taiko', 0.8));
      F.stepG = F.g1;
      go(F.naga, { x: SHITA.x - 4, z: SHITA.z - 4 }, 26);
      rt.army.play('toki', { x: START.x + 8, z: START.z }, 1.4);
      afterStep(2, () => rt.say('池田長吉', '総門に津田藤三郎の鉄砲じゃ！　固まって押せ', 3.4));
      afterStep(6, () => rt.say('津田藤三郎', '総門は津田が預かった。一人も通すな、放て！', 3));
    } else if (n === 2) {
      rt.banner('総門を破った', '山麓の居館に百々綱家の手勢');
      // 御殿と百曲口は百々綱家の受け持ち（battle_learn）。麓の御殿は家来が守り、綱家は百曲りの中腹で待つ
      F.stepG = F.pre[2];
      go(F.naga, { x: OTE.x - 4, z: OTE.z - 3 }, 30);
      afterStep(1, () => rt.say('百々の侍', '御殿を捨てるな。巨石の道で足を止めよ！', 3));
      afterStep(5, () => rt.say('池田長吉', '石垣の狭間から撃ってくる。竹束の陰を伝え', 3));
      // 浅野幸長の手：瑞龍寺山の砦を落とし、南西から寄せて来る（言った物は本当に来る）
      F.asano = allyGroup(rt, { faction: 'oda', name: '浅野幸長の手', anchor: { x: ZUIRYU.x, z: ZUIRYU.z }, facing: Math.PI, width: 9, aggro: 12, speed: 3.8, noRout: true, fixed: true, fullStrength: true, formation: 'yari' },
        asD([busho('浅野幸長'), uS(4), uA(14), uG(4)]));
      F.asano.defMult = 1.3; F.asano.dmgMult = 0.8;
      F.asano.order = 'move'; F.asano.dest = { x: OTE.x - 14, z: OTE.z + 10 }; F.asano.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; q.anchor = { x: OTE.x, z: OTE.z }; };
      afterStep(10, () => rt.say('足軽', '南に違い鷹の羽の旗！　瑞龍寺山を落とした浅野勢じゃ！', 3));
      // 井伊直政（家康の目付）は稲葉山・権現山の砦を攻めた（ウィキペディア「岐阜城の戦い」）。南の尾根の話として台詞で
      afterStep(16, () => rt.say('池田長吉', '南の権現山の砦には井伊殿の手が寄せておる。外の砦は、もう持つまい', 3.4));
    } else if (n === 3) {
      rt.banner('居館を破った', '百曲りの中腹の砦に百々綱家');
      rt.world.setTime('day');
      // 百曲口は百々綱家が守った（ウィキペディア「岐阜城」の登山道の節）
      F.stepG = F.pre[3];
      go(F.naga, { x: NANA.x - 6, z: NANA.z }, 30);
      go(F.asano, { x: NANA.x - 10, z: NANA.z + 2 }, 30);
      if (live(F.amb)) { F.amb.order = 'attack'; F.amb.seekRange = 20; }   // 曲がり角の伏兵が打って出る
      afterStep(1, () => rt.say('池田の侍', '稲葉山は急じゃ。曲がり角ごとに伏せておるぞ、足元に気を付けよ', 3.4));
      afterStep(5, () => rt.say('百々綱家', '百曲りは百々が守る。石を落とせ、坂の上から放て！', 3));
      // 福島勢は南の七曲りを登り始める（沢瀉の旗が南の尾根を登るのが百曲りから見える。一番乗りの争い）
      this.fukushima(rt);
    } else if (n === 4) {
      rt.banner('中腹の砦を破った', '二の丸の櫓門に木造長政');
      F.stepG = F.pre[4];
      go(F.naga, { x: NI.x - 8, z: NI.z }, 30);
      go(F.asano, { x: NI.x - 12, z: NI.z + 2 }, 30);
      afterStep(1, () => rt.say('木造長政', '七曲りは福島に破られた。二の丸で食い止めよ！　石垣の上から放て！', 3.2));
      this.fukushima(rt);
      go(F.fuku, { x: -19, z: 13 }, 6);   // 七曲りを登り切った所（本丸の門の南の下）で待つ（門の旗本へは⑤まで掛からない。福島勢が先に旗本を討って、主人公が着いた途端に⑤が済んだ）
      afterStep(8, () => rt.say('池田の侍', '右手に沢瀉の旗！　福島勢が七曲りを登り切って、本丸の門の下へ上がって来た', 3.4));
      // 同じ日の朝、合渡川で黒田長政らが霧の中を渡り、大垣からの後詰（舞兵庫）を破った（昼の二の丸には知らせとして届く）
      afterStep(40, () => rt.say('池田の侍', '今朝、合渡川で黒田殿らが大垣の後詰を追い散らしたそうな。大垣からの助けは来ぬ', 3.6));
    } else if (n === 5) {
      rt.banner('二の丸を落とした', '本丸の門に秀信の旗本');
      F.stepG = F.pre[5];
      go(F.naga, { x: DAI.x - 8, z: DAI.z }, 26);
      go(F.asano, { x: DAI.x - 12, z: DAI.z + 2 }, 26);
      go(F.fuku, { x: DAI.x + 2, z: DAI.z + 3 }, 20);   // 本丸の門の前で池田勢と並ぶ（一番乗りの争いが見える）
      afterStep(1, () => rt.say('池田輝政の使番', '殿の仰せ。福島より先に本丸の門を破れ、と', 3));
      afterStep(5, () => rt.say('織田秀信', '亡き祖父の城、たやすくは渡さぬ！', 3));
    }
  },

  // 福島正則の手：南の大手（七曲り）から登り、二の丸で池田勢と並ぶ（一番乗りの争い）
  fukushima(rt) {
    const F = rt.flags;
    if (F.fuku) return;
    F.fuku = allyGroup(rt, { faction: 'oda', name: '福島正則の手', anchor: { x: KARAME.x, z: KARAME.z }, facing: Math.PI, width: 10, aggro: 12, speed: 3.8, noRout: true, fixed: true, fullStrength: true, formation: 'yari' },
      fkD([busho('福島正則'), uS(5), uA(16), uG(4)]));
    F.fuku._gfSouth = true;
    F.fuku.formation = 'column'; F.fuku.width = 3;
    F.fuku.defMult = 1.3; F.fuku.dmgMult = 0.8;
    // 七曲りの尾根を登り、上台所と本丸の間の南の下に出る（二の丸・上台所の南の石垣の下に詰まった）
    F.fuku._gfTo = { x: -19, z: 14, seek: 6 };
    F.fuku.order = 'move'; F.fuku.dest = { x: -19, z: 14 }; F.fuku.onArrive = (q) => { q.order = 'attack'; q.seekRange = 6; q.anchor = { x: -19, z: 12 }; };
    rt.army.play('toki', KARAME, 1.4);
    rt.after(2, () => rt.say('福島正則', '七曲りは福島が攻め上る！　一番乗りは渡さぬぞ、池田殿！', 3.4));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('s5');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    for (const g of F.foes) if (g !== F.hide) this.fall(rt, g);
    // 降伏を見届ける寄せ手は追撃を止める。進軍先と到着後の攻撃命令も残さない。
    for (const g of [F.naga, F.asano, F.mine, F.fuku]) if (live(g)) {
      g._gfTo = null; g._gfGo = false; g.onArrive = null;
      g.order = 'hold'; g.aggro = 0; g.seekRange = 0; g.fire = false;
      g.noAI = true; g.peaceful = true; g.keepMoveOrder = true;
      for (const u of g.units) { u.target = null; u.atk = null; u.swing = null; u.bind = null; }
    }
    // 無敵だけでは双方が斬り合い続け、門前へ歩み出られない。降る者は狙いから外し、振りかけの刀も止める。
    if (F.hide) for (const u of F.hide.units) { u.invuln = true; u.noTarget = true; u.target = null; u.atk = null; u.swing = null; u.bind = null; }
    if (live(F.hide)) { F.hide.order = 'hold'; F.hide.aggro = 0; F.hide.seekRange = 0; F.hide.fire = false; F.hide.peaceful = true; F.hide.keepMoveOrder = true; F.hide.arriveNoncombat = true; }
    sfx('horagai', 0.9);
    F.k03s?.ending?.();   // 刀を置いた後、本丸の木瓜の旗が下りる（k03_gifu/kaijo.js）
    // 降る場は本丸の門の内。秀信は床几から立ち、近習とともに門の前へ歩み出る。福島正則も門の前へ（見える所で降る・critic60 二-4）
    if (F.hideU) F.hideU._crouch = false;
    if (live(F.hide)) { F.hide.noAI = true; F.hide.order = 'move'; F.hide.dest = { x: -14, z: 0 }; F.hide.speed = 1.4; F.hide.onArrive = (q) => { q.order = 'hold'; }; }
    if (F.hideU) rt.marker('hide', () => F.hideU.pos, '織田秀信', { person: true, guidePerson: () => F.hideU, guideName: '織田秀信' });
    if (live(F.fuku)) { F.fuku._gfTo = null; F.fuku.onArrive = (q) => { q.order = 'hold'; };
    F.fuku.order = 'move'; F.fuku.dest = { x: DAI.x + 1, z: DAI.z + 5 }; F.fuku.speed = 3; F.fuku.aggro = 0; F.fuku.peaceful = true; F.fuku.keepMoveOrder = true; }
    rt.after(2, () => rt.say('織田秀信', '……これまでか。祖父の城を守れなんだ。腹を切る。介錯を', 4));
    rt.after(7.5, () => rt.say('福島正則', '早まられるな。信長公の御孫を死なせては、我らの名折れ。城を明け渡されよ', 4.2));
    // 輝政は城下の本陣に座ったまま（物差し一-2）。降参は輝政を通して受けた（井伊直政の書状）ので、使番が殿の言葉を運ぶ
    rt.after(13, () => rt.say('池田輝政の使番', '殿の仰せ。中納言殿の降参を受けよ。一番乗りは福島殿と同じ時、とせよ', 4));
    // 秀信が刀を置く：近習は膝をつく
    rt.after(18, () => {
      rt.say('織田秀信', '……城を明け渡す。者ども、刀を収めよ', 3.6);
      if (F.hide) for (const u of F.hide.units) if (u.alive) {
        rt.army.dropWeapon(u); u.wpnKind = 'none';
        if (u !== F.hideU) u._crouch = true;
      }
    });
    rt.after(18.5, () => {
      rt.award((t) => { t.main = true; t.special = { label: '本丸の門の旗本を破り、岐阜城を開かせた', pts: 30 }; }, '岐阜城が開いた');
      rt.banner('岐阜城、開城', '織田秀信、降る');
    });
    rt.after(23, () => rt.say(nm(rt), '稲葉山が、またひとつ主を変えました。次は大垣の治部少輔にございますな', 4));
    rt.after(19, () => rt.army.celebrate(0));
    rt.finish({ scriptedEnd: true }, 28);
  },

  lose(rt, title, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.objFail('s' + (F.step || 1));
    rt.banner(title, why);
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 締めの間も、既に落ちた石は転がし終える（空中に止めない）。新しい落石は active で止める。
    if (F.rocks) F.rocks.tick(dt);
    if (F.ending || !F.step) return;
    const P = rt.player.u;
    tickTabas(rt, dt);
    F.k03s?.tick?.(dt);
    // 手勢は本人の脇に付いて一緒に走る（AP5）
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      const g = F.mine, c = live(g) && g.center();
      if (c) {
        if (dist(c, P.pos) > 8) { g.order = 'move'; g.dest = { x: P.pos.x - 2, z: P.pos.z + 2.5 }; g.speed = 3.9; }
        else { g.order = 'attack'; g.seekRange = 14; g.anchor = { x: P.pos.x, z: P.pos.z }; }
      }
    }
    // 味方の隊は自分と同じ速さで次の持ち場へ（物差し一-5・九-4）：遠くて近くに敵がいない間は、隊のまま道の曲がり角を一つずつ駆ける
    //   （まっすぐ斜面を突っ切ると、居館の奥の口や上台所の石垣の下に詰まって二の丸へ来なかった）
    if ((F.hurryT = (F.hurryT || 0) - dt) <= 0) {
      F.hurryT = 1;
      for (const g of [F.naga, F.asano, F.fuku]) {
        const to = g && g._gfTo;
        if (!to || !live(g)) continue;
        const c = g.center(), d = dist(c, to);
        const near = (r) => rt.army.units.some((o) => o.alive && o.team === 1 && !o.fleeing && !o.noTarget && !o.isStruct && !(o.group && (o.group._fallen || o.group.order === 'retreat')) && (o.pos.x - c.x) ** 2 + (o.pos.z - c.z) ** 2 < r * r);
        //   退いていく城方（崩れた段の残り）は数えない（それを「近くの敵」と数え、浅野勢が百曲りの砦の柵の外 x=−107 に⑤の間ずっと止まった）
        // 駆ける間は縦の列（幅 9 の横陣のままでは、居館の奥の口（幅 5m）に詰まった）
        // 斬り合いのまま柵の内に止まった隊（浅野勢が中腹の砦の柵の内 x=−99 で二の丸の段の間ずっと止まった）は、八秒動かなければ列に戻して角を辿らせる
        const L = g._gfLast || (g._gfLast = { x: c.x, z: c.z, t: rt.t });
        if (dist(c, L) > 2) { L.x = c.x; L.z = c.z; L.t = rt.t; }
        const stuck = !g._gfGo && d > 14 && rt.t - L.t > 8 && !near(3);
        if (stuck) L.t = rt.t;
        if (!g._gfGo && d > 14 && (!near(7) || stuck)) { g._gfGo = true; g._gfForm = [g.formation, g.width]; g.formation = 'column'; g.width = 3; g.order = 'move'; g.speed = 4.4; g.dest = { x: c.x, z: c.z }; }
        if (g._gfGo && (d < 9 || near(5))) { g._gfGo = false; [g.formation, g.width] = g._gfForm; g.speed = 3.8; g.order = 'attack'; g.anchor = { x: to.x, z: to.z }; g.seekRange = to.seek; g.onArrive = null; }
        else if (g._gfGo) {
          // 次の角は列の先頭の兵で決める（列の真ん中で決めると、先頭が角に着いても次へ進まなかった。後ろの兵で決めると列が角へ戻った）
          let head = c, hd = Infinity;
          for (const u of g.units) if (u.alive && !u.gone) { const e = dist(u.pos, to); if (e < hd) { hd = e; head = u.pos; } }
          routeAt(head.x, head.z, RA);
          // 福島勢は南の七曲りの尾根から来る（百曲りの道から遠い間は、道の角へ寄らずに二の丸の東の口へまっすぐ）
          if (g === F.fuku && head.z > 10) { g.dest.x = to.x; g.dest.z = to.z; } else wayNext(head, to, g.dest);
        }
      }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const left = STEP_T[F.step] - (rt.t - F.stepT);
    // 退いた城方は遠く離れたら去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - 0.25) <= 0) {
      F.gcT = 1;
      for (const g of F.foes) for (const u of g.units) if (u.alive && !u.gone && (u.fleeing || g.order === 'retreat') && dist(u.pos, P.pos) > 45) rt.army.despawn(u);
    }
    const g = F.stepG;
    if (!F.stepN || F.stepNg !== g) { F.stepNg = g; F.stepN = g.units.length; }
    const gone = F.stepN - holdN(g);
    // 刻限を過ぎた：負けにはせず、味方の隊が段の守りを押し包む（物差し二-5・十二-3）
    if (left <= 0 && F.pushed !== F.step) {
      F.pushed = F.step;
      const c = live(g) ? g.center() : STEP_AT[F.step];
      // 福島勢は⑤まで南の門下で待つ。長引いても百曲り側の守りへ引き戻さない。
      for (const a of [F.naga, F.asano, F.step === 5 ? F.fuku : null]) if (live(a)) { a.order = 'attack'; a.anchor = { x: c.x, z: c.z }; a.seekRange = 34; a.dmgMult = 1.2; }
      rt.say('池田長吉', '者ども、押し包め！　福島勢に後れを取るな', 3);
    }
    // どの段も本人がその場所へ来てから果たす。城下で待つだけで①〜④に印が付くのも防ぐ。
    // 11/9 二巡（徳川D）：本丸の門の前は旗本と味方で塞がり、十四歩の内へ入れず十分止まった（bot）。
    //   刻限を一分半過ぎたら門の三十歩の内で、押し包んだ味方の手で門が開く。
    //   上台所の奥の口を抜け、本丸の門へ続く通路に来た事も確かめる。
    //   距離だけだと、上台所の手前や南の石垣の下でも到着になり、秀信が見えないまま降伏した。
    const gateApproach = F.step !== 5 || (P.pos.x >= -26 && Math.abs(P.pos.z) < 7);
    const atGate = gateApproach && dist(P.pos, STEP_AT[F.step]) < (F.step === 5 ? (left <= -90 ? 30 : 14) : 24);
    if (!F.next && atGate && (gone >= Math.round(F.stepN * (1 - KEEP)) || left <= -90)) {
      F.next = true;
      this.fall(rt, g);
      if (F.step === 3) this.fall(rt, F.amb);
      if (F.step === 4) this.fall(rt, F.yokoya[0]);   // 二の丸の口の脇の横矢（本丸の口の脇は本丸の段まで残る）
      if (F.step === 5) { this.win(rt); return; }
      rt.say('足軽', `${g.name}が崩れた！　本丸へ退いていく！`, 2.6);
      rt.after(3, () => { F.next = false; this.toStep(rt, F.step + 1); });
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name && !rt.flags.ending && g !== rt.flags.stepG && !g._fallen) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step || F.ending) return;
    // 届かない敵（柵・石垣の向こう）を十二秒追っても寄れなければ、しばらく相手にしない（中腹の砦の残りの鉄砲に掛かって本丸へ行かなかった）
    const B = F._botIg || (F._botIg = { e: null, t: 0, skip: new Map() });
    // 今の段の持ち場から 30 歩より遠い敵は追わない（中腹の砦の段で退く敵を追って本丸の下まで登り、段の守りに戻らなかった。11/8 bot）
    const at = STEP_AT[F.step] || u.pos;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 && !((B.skip.get(o) || 0) > b.t) && Math.hypot(o.pos.x - at.x, o.pos.z - at.z) < 30;
    const e = b.army.nearestEnemy(u, 9, ok);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (B.e !== e || d <= 2.4) { B.e = e; B.t = b.t; } else if (b.t - B.t > 12) { B.skip.set(e, b.t + 40); B.e = null; }
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    const t = this.missionPin(b) || STEP_AT[F.step];
    // 山道は道の点を一つずつ辿る（まっすぐ行き先へ向かうと、百曲りの下の斜面で石垣に突っかかって止まった）
    //   味方の隊と同じ wayNext で、道の一つ先の曲がり角へ
    const q = wayNext(u.pos, t, B.w || (B.w = { x: 0, z: 0 }));
    goTo(p, inp, q.x, q.z, 2);
  },
};

// 兵数は諸説。東軍およそ三万四千（英語版ウィキペディアは三万五千）、城方およそ六千五百（米野で減った後）
k03_gifu.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(20000, Math.round(34000 - (F.ak || 0) * 20)), a0: 34000, b: F.ending && rt.tracker.main ? 2500 : Math.max(2500, Math.round(6500 - (F.ek || 0) * 25)), b0: 6500 };
};
k03_gifu.canSkip = (rt) => (!rt.flags.step && rt.t > 3 ? '下知まで待つ' : '');
k03_gifu.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k03_gifu.history = '慶長五年（1600）八月、尾張の清洲に集まった東軍は木曽川を渡って美濃へ入った。二十二日、池田輝政らは河田から渡って米野で織田秀信の兵を破り、福島正則らは起の渡しを諦めて下流の加賀野井から渡り、竹ヶ鼻城を落とした。城主の織田秀信は織田信長の孫（三法師）で、西軍に付いて岐阜城に籠もり、大垣と犬山へ後詰を頼んだ。\n二十三日朝、浅野幸長・一柳直盛らが南西の瑞龍寺山の砦を落とし、池田勢と福島勢が城の登り口へ殺到した。大手は南の七曲り、西の麓の居館の側から百曲り、北西から水の手道が登る。城方は総門口に津田藤三郎、七曲口に木造長政の父子、百曲口に百々綱家を置いた。七曲口は福島正則が攻め、輝政は水の手から登ったとも伝わるが、当時の書状には見えない。輝政と正則は一番乗りを争い、輝政が功を譲って「同時」としたと伝わる。同じ日の朝、黒田長政らは合渡川で大垣からの後詰を破った。\n本丸のほかは一日で落ち、秀信は自害しかけたが輝政・正則らに説き伏せられ、輝政を通して降り、加納の円徳寺で髪を下ろし、助命されて高野山へ送られた。東軍は翌日、大垣城の石田三成に向かって赤坂へ進んだ。守将の百々綱家・木造長政らも降った。城の床板はのちに崇福寺の血天井になったと伝わる。曲輪の並びと寸法は遊びのために縮めた推定で、池田勢の攻め口と各口の守将の割り当ては推定である。';
k03_gifu.bushou = [{ name: '津田藤三郎', g: /藤三郎/ }, { name: '百々綱家', g: /綱家/ }, { name: '木造長政', g: /木造/ }, { name: '織田秀信', g: /秀信/ }];

const st = (n) => (rt) => (rt.flags.step ?? 0) >= n;
STAGES[ID] = [['城下の総門口の津田藤三郎の鉄砲衆を討つ'], ['居館の御殿の百々綱家の手勢を討つ', st(2)], ['百曲りの中腹の砦の百々綱家の隊を討つ', st(3)], ['二の丸の櫓門の木造長政の隊を討つ', st(4)], ['本丸の門の秀信の旗本を討つ', st(5)]];
// 倒す数（kaito 11/2 O）：段が進む判定と同じ数え方（stages.js）
KILLS[ID] = (rt) => {
  const F = rt.flags;
  if (F.ending || !F.stepG || !F.stepN) return null;
  return cut(F.stepN, holdN(F.stepG), Math.round(F.stepN * KEEP));
};

export { k03_gifu };
export default k03_gifu;
