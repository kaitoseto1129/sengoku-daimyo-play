// ======================================================================
// 豊臣編 6：戸次川の戦い（天正十四年＝1586 十二月十二日の夕方〜夜。豊後国 戸次川＝今の大野川。調べは docs/battle_refs/t06_hetsugi.md）
// 島津家久に囲まれた鶴賀城（利光宗魚の城）を救うため、軍監の仙石秀久が元親の反対を押して戸次川を渡る。
// 伊集院久宣の先手が当たっては退き（釣り）、追った四国の衆を、新納大膳の五千・島津豊久の手・家久の本隊が三方から包む（野伏せ）。
// 仙石の隊が先に崩れ、長宗我部信親と十河存保が討たれる。主人公は信親の隊の横に付く部将。信親は史実どおり救えない。
// 勝ちの形は「崩れる味方の中で生き残り、浅瀬を南へ渡り戻って、夜の土手を鏡城の下の味方の陣まで逃げ切る」。
// 段：①浅瀬を渡り鶴賀城の下へ ②伊集院の先手に槍を入れ、退くのを中津留の河原まで追う（退くふり） ③信親の横で包みを食い止める（信親・十河の討死）
//     ④中津留の河原を走って浅瀬を西の岸へ ⑤夜の土手を川下の鏡城の下の陣へ
// 軍勢（AQ の 3・6・9）：両軍とも史実の兵数を、一人を十二人（携帯は二十人）に見立てた陣形の塊（備）で置く。豊臣方 六千・島津 一万二千。
//   塊は本人の六十 m に入った所から本物の兵に替わり（KIT の wake）、塊どうしは数で押し合う（b_yasen.js の fieldTick）。
//   見せかけの軍勢・寄せる後詰め・作り物の乱戦は置かない（noFoeNear・noFrontFill）。伏兵の塊は包みの段に林の中から出す。
// 旗は豊臣方（仙石＝豊臣の旗・長宗我部・十河＝三好の旗・鶴賀城の大友）と島津だけ。織田の旗は出さない（AQ の 4）。
// 座標：大野川を東西（x）に流し、南（+z）が渡る前の岸（実の西岸）、北（−z）が鶴賀城の岸（実の東岸）。
//   国土地理院の標高（asset_dem_hetsugi.js）の起伏を北の岸に混ぜる。鏡城は渡る前の岸（ゲームの南西）。
//   実の向きに揃える（11/6）：ゲームの奥（−z）が実の東、−x が実の北。小地図の北（mapNorth）・夕日（実の西＝+z）・川の流れ（実の北＝−x へ）をそれに合わせる。
// ======================================================================
import { isTouch as K285_TOUCH } from './touch.js';
import { loneGeneralTick } from './lone_general.js';   // K468：単騎の敵将を隊の中へ（cloud-26 の共通の手）
import { enemyJin } from './enemy_jin.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useTerrain } from './asset_manifest.js';
import { demSample } from './dem.js';
import { enemyGroup, allyGroup, nm, guardRecover } from './bhelp.js';
import { naginata } from './humans.js';
import { nobori, palisade, dorui, yagura, hut, jinmaku, shogi, kabukimon, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { KIT } from './b_nagashinojo.js';
import { sfx, hush } from './audio.js';
import { encircleWarn } from './encircle_signal.js';   // P3 包囲の合図（K406）
import { rainVolley } from './arrow_rain.js';
import { MEM_TIGHT } from './settings.js';
import { MEM_BUDGET } from './device_tier.js';   // K564 記憶の予算
import { withGuard } from './toyo_bot.js';
import { fieldButai, fieldTick, routButai, lightPos } from './b_yasen.js';
import { butaiTick } from './butai.js';
import { addSite } from './map_sites.js';
import { rockShape } from './rock_shape.js';
import { timeslipField } from './timeslip_field.js';
// 15分の構成（kaito 11/8 夜・docs/toyo15_plan_1108.md の 9）：段の中身は t06_hetsugi/ に一段一ファイル
import * as shinkou from './t06_hetsugi/shinkou.js';     // ①鏡城の陣の軍議・土手の進軍・渡河（鶴賀城の坂の囲みの遠景）
import * as tsuigeki from './t06_hetsugi/tsuigeki.js';   // ②先手に当たる・退くふり・囲みの陣と中津留の河原へ追う
import * as kyuen from './t06_hetsugi/kyuen.js';         // ③伏せ・自分の周りを防ぐ・信親の救援（十河・信親の討死）
import * as shingari from './t06_hetsugi/shingari.js';   // ④浅瀬の口の殿・皆を渡らせて最後に渡る
import * as yoin from './t06_hetsugi/yoin.js';
const SEN_FLAG = 'sashi:字無:#ece6d6:#16140f';   // 仙石の旗印（白地に黒の「無」）
import { chargeFujinBlocks } from './mass_charge.js';   // K467：布陣の太い塊を一度に寄せる（cloud-47 の形）
import { cpStart, cpTick, cpPin, cpReach, cpDone } from './checkpoint_chain.js';   // P4（K410）退く段をピンの連なりに           // 戦の後の余韻と岩石城への伏線

const START = { x: -132, z: 76 };            // 鏡城の下の陣の前（土手の道の口。15分の構成で軍議から始める）
// 信親の槍組四つが①で本人を囲む所（[後ろへ m, 横へ m]。横は向きの右が＋）。始めは本人が +x を向く（後ろ＝−x・右＝−z）
const BAND_RING = [[10, -4], [10, 4], [2, -10], [2, 10], [-9, -7], [-9, 7]];   // 11/19 リ三：十河の槍組二つも始めから本人の前の左右（九 m 先）へ付ける（始まりの前後左右を天王寺並みに厚く）
// 11/21 cloud-41（戸次川の主・司令塔「本人が一度も川に入らない」cloud-34 の測り）：浅瀬の水が足首（0.15〜0.23 m）だった。keep 0.8（川床を残す）・wade 0.55（水の上限）＝膝まで水に入って渡る
const FORD = { x: 20, w: 22, keep: 0.8, wade: 0.55 };   // 浅瀬（川の中ほどの x と幅の半分）
const FORD2 = { x: -70, w: 12 };

// 11/21 K516：英語の時だけ字の表を読む（i18n_hetsugi.js・日本語は読まない）
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_hetsugi.js').then((m) => addEn(m.default)).catch(() => {});
const RIVER_Z = 0;
const RIVER = [[-520, 8], [-360, 8], [-270, 6], [-150, -3], [-40, 2], [60, -2], [170, 4], [270, -2], [360, 1], [520, 1]];   // 11/19 係：地形を広げた（groundHalf 340）ので川も端まで
const CASTLE = { x: 70, z: -150 };           // 鶴賀城（尾根の上の主郭）
const FORT_R = 17;                           // 主郭（東西四十 m・南北二十五 m ほどを低い土塁で囲む）
const GATE_A = Math.PI * 1.25;               // 虎口の向き（南西＝浅瀬からの道の側）
const CAMP = { x: -170, z: 84 };             // 鏡城の下の味方の陣（渡る前の岸）
const IJUIN = { x: 40, z: -72 };             // 伊集院久宣の先手（鶴賀城の下の囲みの陣）
// 釣り野伏せの林（西：新納大膳・東：島津豊久）。11/7 二3：東の林が尾根の向こう（百三十 m）で、伏せが林から出る所が見えなかった。河原の両の縁へ寄せた
const WOODS = [{ x: -60, z: -88 }, { x: 108, z: -100 }];   // 信親の備（6,−100）から五十〜百 m。林が河原へかぶさって乱戦が木の中にならない所
const IEHISA = { x: 0, z: -182 };            // 島津家久の本隊（尾根の西の陰）
const RING = { x: 22, z: -100 };             // 包みが閉じる所（中津留の河原の上）
// 11/8 一2・五2：本陣が河原から百十 m 余りの尾根の陰で一度も見えなかった。中津留の河原の奥、包みの輪から六十 m の段丘の上に置く
const SEAT = { x: 10, z: -158 };             // 島津家久の本陣（床几に座って動かない）
const SC = MEM_TIGHT ? 20 : 12;              // 塊の一人が史実の何人か
// 史実の兵数（調べ：豊臣方は六千ほどが渡った、島津は一万〜一万三千・新納大膳 五千・長宗我部 三千）
const HIST = { sen: 2000, nobu: 2000, sogo: 1000, moto: 1000, ijuin: 2000, niiro: 5000, honjo: 2000, ieh: 2200, ura: 800 };
const A0 = HIST.sen + HIST.nobu + HIST.sogo + HIST.moto, B0 = HIST.ijuin + HIST.niiro + HIST.honjo + HIST.ieh + HIST.ura;
// 11/18 21:30 持ち主 クラウド：874×402 で右上の一行が二行に折れた（中津留の河原の包囲を突破せよ）→十二字までに縮めた（場所の名はピンの札にある）
// 11/7 九1・十1：右上に①〜⑤を始めから全部並べる。一行は短く、地図で分かる場所の名と行いだけ。戦の間に言い替えない
// 五つの目標を並べ、今の下知は段の中でも使番の知らせに合わせて替える（F.mText）。
const STEP_TEXT = ['戸次川の浅瀬を渡れ', '島津の先手を攻めろ', '河原の包囲を突破せよ', '戸次川の浅瀬まで退け', '戸次川を渡り西の岸へ退け'];
const STEP_NOUN = ['戸次川の浅瀬', '中津留の河原', '長宗我部信親', '戸次川の浅瀬', '西の岸'];
let progObs = null, progRt = null;   // 右上の任務の札の背の見張り（update）
const progCb = () => { if (progRt?.flags && progRt.hud) { progRt.flags.progTxT = progRt.t; progRt.hud.rectsT = 0; } };   // 11/22 b_osaka 持ち主（K564）：見張りの返しを update の中で作ると、その閉包が update の rt・F・P を掴み、戦を閉じても前の戦が丸ごと残った（_retain_mc で Hud→ResizeObserver→rt）。外で一つ作る
const NAMED = new Set(['長宗我部信親', '長宗我部元親', '仙石秀久', '十河存保', '戸次統常', '伊集院久宣', '新納大膳亮', '島津豊久', '島津家久', '鈴木大膳']);
const KAGAMI = { x: CAMP.x - 16, z: CAMP.z + 50 };
// 11/9 夜 kaito：最後は川を渡り切った西の岸の土手。振り返ると、島津は水辺で整然と止まって追って来ない
const SAFE = { x: -10, z: 46 };   // 鏡城の丘（陣の後ろ＝実の西。鏡城は川の西の丘城）
// 元親の備も旗本と同じ浅瀬を戻る。鏡城へ直進すると深みを斜めに横切る。
const MOTO_RETURN = [{ x: FORD.x - 4, z: -40 }, { x: FORD.x - 4, z: 40 }, { x: CAMP.x + 30, z: CAMP.z + 24 }];

// ---- 地形：南の岸は低い河原と田、北の岸は段丘から鶴賀城の尾根へ。国土地理院の起伏は北の岸に ----
let dem = null;
useTerrain('dem_hetsugi', (data) => { dem = data; });
const DEM_XY = 5;                            // ゲームの 1 を実の 5m に縮める
const sm = (a, b, v) => { const k = Math.max(0, Math.min(1, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
function riverZ(x) {
  for (let i = 0; i < RIVER.length - 1; i++) { const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1]; if (x >= ax && x <= bx) return az + (bz - az) * (x - ax) / (bx - ax); }
  return RIVER_Z;
}
// 11/20 クラウド k365-cloud-09（司令塔③「戸次川の川と地形を史実の通りに」）：国土地理院の格子では、大野川は鶴賀城の西の平野を南西から北東へ流れる
//   （格子の最も低い筋。東の岸に鶴賀城の山並み・西の岸に広い河原の平野）。前は格子を九十度回しただけで、実の川の谷がゲームの川（z≒0・東西）と
//   斜めに交わり、山並みが川の筋と合っていなかった。格子を −60 度回し、実の川の最も低い筋がゲームの川に乗り、中津留の河原（包みの輪・伊集院の陣・東の林）と
//   鏡城の下の陣が実の河原の平ら（川より八〜十 m 高いだけ）に、家久の本陣と鶴賀城の後ろが実の段丘と山並みに来る所へ置く（置き場の高さを数えて選んだ）
//   （ゲームの +z＝実の北西の岸＝鏡城の側の平野、−z＝実の南東の岸＝鶴賀城の側の山並み）。川の筋・浅瀬・陣の置き場は変えない
const DEM_ROT = -60 * Math.PI / 180, DEM_O = { x: 125, z: -575 };
const DEM_UX = Math.sin(DEM_ROT), DEM_UZ = Math.cos(DEM_ROT);
function relief0(x, z) {
  const rx = Math.max(-1580, Math.min(1580, DEM_O.x + DEM_XY * (x * DEM_UX - z * DEM_UZ)));
  const rz = Math.max(-1580, Math.min(1580, DEM_O.z + DEM_XY * (x * DEM_UZ + z * DEM_UX)));
  return (demSample(dem, rx, rz) - 10) * 0.32;
}
// 兵が立つ所の平場（実の段丘の斜面が四十度ほどあった：西の林・家久の本陣と本隊）。中心の高さへ均し、縁でなだらかに実の起伏へ戻す
const DEM_PADS = [{ x: -60, z: -88, r: 24 }, { x: 4, z: -170, r: 30 }];
function relief(x, z) {
  if (!dem) return 0;
  let h = relief0(x, z);
  for (const P of DEM_PADS) {
    const d = Math.hypot(x - P.x, z - P.z);
    if (d >= P.r) continue;
    if (P.h == null) P.h = relief0(P.x, P.z);
    h += (P.h - h) * (1 - sm(P.r * 0.55, P.r, d));
  }
  return h;
}
// 鶴賀城の尾根（南北に長い。頂は主郭の平場）。0〜1
function ridge(x, z) {
  const a = Math.exp(-(((x - CASTLE.x) / 40) ** 2) - (((z - CASTLE.z) / 50) ** 2));
  const b = 0.75 * Math.exp(-(((x - CASTLE.x - 14) / 34) ** 2) - (((z - CASTLE.z + 70) / 60) ** 2));   // 北へ続く尾根
  return Math.min(1, Math.max(a * 1.4, b));
}
// 土手の筋（浅瀬の南の口→鏡城の陣）までの距離
const LEVEE = [[FORD.x, 30], [-60, 52], [-120, 70], [CAMP.x + 12, CAMP.z - 2]];
function leveeD(x, z) {
  let best = 1e9;
  for (let i = 0; i < LEVEE.length - 1; i++) {
    const [ax, az] = LEVEE[i], [bx, bz] = LEVEE[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
function height(x, z) {
  const rz = z - riverZ(x);
  let h = 1.1 + 0.25 * Math.sin(x * 0.021) * Math.cos(z * 0.017);
  h -= 0.7 * (1 - sm(14, 40, Math.abs(rz)));
  // 瀬の砂利の州：上へだけ足し、水面は下げない
  const bar = Math.sin(x * 0.19 + z * 0.07) * Math.cos(z * 0.31 - x * 0.05) + 0.6 * Math.sin(x * 0.43 - z * 0.29 + 1.3);
  h += Math.max(0, bar - 0.25) * 0.32 * (1 - sm(12, 26, Math.abs(rz)));
  const k = ridge(x, z);
  if (rz < 0) h += 2.6 * sm(-30, -100, rz) + 5 * sm(-190, -250, rz);
  h += 30 * k;
  // 尾根の肩を崩し、主郭の平場と河原には細かな起伏を足さない。
  h += (Math.sin(x * 0.13 + z * 0.08) * 1.4 + Math.cos(z * 0.17 - x * 0.06)) * k * (1 - sm(0.65, 0.95, k));
  // 渡る前の岸の土手（11/7 二1：「夜の土手」が平らな野だった）。浅瀬から鏡城の陣へ続く道の下に、低い土の盛り
  if (rz > 20 && x < FORD.x + 6 && x > CAMP.x + 12) h += 1.3 * Math.exp(-((leveeD(x, z) / 4.5) ** 2));
  // 鏡城の丘（11/7 四5：平らな野の柵だけだった）
  h += 17 * Math.exp(-(((x - KAGAMI.x) / 30) ** 2) - (((z - KAGAMI.z) / 24) ** 2));
  // 実の起伏は河原の平ら（中津留の河原・川から九十 m ほど）の外だけ
  // 11/20 クラウド k365-cloud-09（司令塔「川の際の段丘と中津留の河原の形を実に」）：実の起伏を川の水際の二十二歩の外から入れる（前は九十歩より奥だけ）。
  //   川から百四十歩より奥は六割増し（遠くの山並みを実の谷の形に）。兵の置き場は実の河原の平らに来るよう格子の向きで合わせた
  h += Math.max(-2, relief(x, z)) * (sm(22, 60, Math.abs(rz)) + 0.9 * sm(140, 230, Math.abs(rz))) * (1 - k);
  // 鶴賀城の南の尾根（実の南＝ゲームの +x）の三条の堀切（大分市の城跡の記録）：尾根を横に断つ深さ三 m の溝（11/6 fixc1429）
  if (Math.abs(z - CASTLE.z) < 30 && x > CASTLE.x + 18 && x < CASTLE.x + 46) {
    for (const cx of [22, 30, 38]) h -= 3 * Math.exp(-(((x - CASTLE.x - cx) / 1.6) ** 2)) * Math.exp(-(((z - CASTLE.z) / 12) ** 2));
  }
  return h;
}

const live = (g) => g && g.count > 0;
const HISTORICAL_RETURN = { historicalReturn: true };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const aliveReal = (rt) => { let n = 0; for (const u of rt.army.units) if (u.alive && !u.gone && !u.isStruct) n++; return n; };
// 組の全員に家の旗を（allyGroup の既定は織田の旗）
const fl = (list, flag) => list.map((s) => ({ ...s, o: { flag, ...(s.o || {}) } }));
const ARM = { shimazu: 0x1c1a1a, chosokabe: 0x2a2622, miyoshi: 0x2c2826, toyotomi: 0x2a2420 };

const t06_hetsugi = {
  resumeSteps: 5,   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを toStep(①〜5) を順に流して作り直す
  // 11/7 九1：一行の札（missionSingleLine）をやめ、①〜⑤を右上に始めから並べる（goals5）。行き先は頭上の▼一つ（missionPin）
  lethal: { max: 4, firstAt: 140, gap: 60 },   // 命懸けの戦場（docs/lethal_howto.md）。名のある四国の衆は invuln・史実の死は筋書きのまま
  hideMissionDots: true,
  goalsAllRows: true,       // ①〜⑤を初めから並べ、果たした目標にも印を残す。
  kumiLead: false,           // 意味の分からない青い小旗の印を出さない（五2）
  noHatamotoMass: true,      // 将の周りに見せかけの兵を足さない（九5）
  goalSignOnly: true,
  // 画面外でも▼の形を保ち、到着して防戦する間も距離を消さない。
  goalSignTriangle: true,
  goalSignDistanceAlways: true,
  pinOnlyDestination: true,
  singleDestinationArrow: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  quietMiss: true,
  noDodgeCard: true,
  // 五2：名のある将の名は四十 m の内で出す。名札は史料に名のある将だけ（組頭・侍に名札を出さない）
  nameRange: 60,   // 11/8 五2：十河・統常・家久の名が四十 m の外で一度も出なかった
  hideNameTag: (u) => !NAMED.has(u.name),
  keepBattleSigns: true,   // 行き先の▼を出す間も、敵全員の赤い▼と名のある将の名札を残す。
  forceBarAlways: true,   // 両軍の数を渡すだけでは共通の棒が隠れるため、戦の間は表示する。
  introSides: { a: '豊臣勢（四国の衆）　六千', b: '島津勢　一万二千' },   // 五4・十二1：始まりの札に史実の数
  // 支度の布陣図に地名（11/8 BR：支度の裏の絵が戸次川でも鶴賀城でもなかった）
  introMapPlaces: [{ x: FORD.x, z: 8, name: '戸次川' }, { x: CASTLE.x, z: CASTLE.z + 26, name: '鶴賀城' }, { x: CAMP.x, z: CAMP.z - 16, name: '鏡城' }],
  mapNorth: Math.PI * 1.5,   // 実の北はゲームの −x（小地図の左）
  noFrontFill: true,         // 作り物の乱戦を足さない（AP の 9・AQ の 6）
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  // 待つ備（depth_reserve.js の城攻めの表に入っている）は③の伏せの段だけ。渡った直後から川の北に「新手」が立つと、
  //   kaito 11/7「浅瀬の先に待ち伏せは理不尽」・指示書「敵は最初は弱く見える」に反し、act bot も追撃の段で新手に掛かって 1080 秒で失敗した（11/13 クラウドか）
  // 救援の下知の後は新手を足し続けない。既にいる伏兵と戦いながら信親へ向かう。
  reserveYield: (rt) => rt.flags.step !== 3 || rt.flags.s3?.st > 0,
  reserveNoAlly: (rt) => rt.flags.step !== 3 || rt.flags.s3?.st > 0,
  // ④の殿と退きでは並んだ待つ備を畳む（11/14 クラウドゆ act bot：退きの段で新手に二度とも倒れ、受けた傷の大半340が新手）
  reserveFold: (rt) => rt.flags.step >= 4,
  // ③の新手も一組十八人・一太刀0.4（同 act bot：③で新手に囲まれ受けた傷325が全部新手・530秒で倒れた。島津の怖さは段の伏兵と追手で出す）
  // K354：伊集院の先陣・包囲の組を本物で厚くした分、共通の新手は本物の兵が二百三十を越えたら足さない（iPhone の重さ）
  // 11/20 cloud-41（戸次川の主・cloud-50 の「445秒の味方 592→43」）：描かずの通しで、表の島津の本隊の奥の塊（薩摩勢・大隅勢・日向勢・家久の旗本の後ろ・尾根の備）が
  //   共通の起こし（fujin_wake.js K457・開戦十秒から）で起き、包みの前（120〜250秒）に四国の衆へ寄せて 547→171 に減らしていた（史実は本隊が伏せて待ち、先手が退くふり）。
  //   島津の塊は包みの段（③）まで起こさない（③からは表の moves（hAmbush）で寄せ、そこで起きる）
  fujinWakeHold: (rt, g) => g.team === 1 && (rt.flags.step ?? 0) < 3,
  // 11/21 cloud-41（戸次川の主・司令塔 K285：携帯の本物が上限250を大きく越える）：携帯では広い戦場の「行けばいる」の行（10〜21人）を立てない（布陣の表の塊が遠景を受け持つ）
  wideRowOk: () => !K285_TOUCH,
  reserveCap: 230,
  reserveSize: 18, frontFillSize: 18, reserveDmgMult: 0.55,   // 11/17 K352 kaito「島津が弱すぎる」：0.4→0.55
  // 前を埋める新手（depth_reserve.js frontFill・noFrontFill では止まらない）も③の伏せの段だけ・六組まで。退く本人の前に新手が湧き続け、受けた傷の大半（325〜361）になった
  // 味方の新手も同じ出番と置き場に限る。川中の新手が浅瀬へ押し合い、救援と撤退を塞いでいた。
  reserveOk: (rt, p) => rt.flags.step === 3 && !rt.flags.s3?.st && p.z < -40 && dist(p, RING) < 65, frontFillLimit: 6,
  frontlineDensity: false,
  enemyTactics: false,       // 敵の動きはこの定義が決める（退くふり・伏兵・追手）
  hideGuideSteps: true,
  noPlayerFoot: true,
  nearbyAllySignLimit: 0,
  foeMarks: true,
  enemyTriangleSigns: true,
  // 床几の家久と本陣の兵も敵。討てない者からも所属の赤い▼を消さない。
  foeMarkVisible: (rt, u) => u.team === 1,
  nobiki: true,              // 負け戦の退き口：法螺貝と退き太鼓で退けを知らせる
  wakeRoom: 200,             // 塊から本物へ替える兵の上限（iPhone の重さ）
  // 11/7 九2・十二1：両軍で一万八千の「大軍の戦」と見なされ、本物の兵の付いていない塊（伊集院・伏せの三隊）は隠され、
  //   隠れた塊は本物に替わらなかった（av_host の paint）。島津の先手も包みも数人の旗本しか出なかったのはこのため。塊は隠さない
  keepPaint: true,
  // 11/16 n-kwatch の気づき：155秒（先手を攻めろ・味方が減る負け戦）に真ん中の札「味方が追撃に移った」が出て、伊集院の名札に重なった。
  //   釣り野伏せを字で先に教えない（指示書「やらないこと」）。追撃・総崩れの真ん中の札は出さない（比叡山と同じ）
  quietArmyCalls: true,
  // 塊は 150m の内では描かれず、本物にも替わらない（11/5 BQ の全戦の決まり）。戦う兵は台本の本物の組（foeBand）で置き、
  //   将の隊に見えない所で兵を足す共通の厚み（av_host）は止めて、二百五十人の内に収める
  noAvHost: true,
  playerAtkMax: 4,   // K352 kaito「敵がもっと本人を攻めてほしい」：同時に打つ数 3→4
  playerTaken: 0.5,
  gunGroupMult: true,   // 11/28 クラウド持ち主（身分3の act 76秒に囮の先手の弾一発35・288秒に包みの弾25）：群の本人への倍を弾にも（半分まで。player_hurt.js takeBullet）
  // 11/19 05:05 持ち主（中学生 bot 四戦に三度、包囲と救援の段で侍の一太刀24・足軽20が床のまま続き 345・395・477秒に倒れた）：
  //   ③④で命が六割を切った間だけ、一太刀の床を共通の限りの八割へ（侍24→19・足軽20→16）。満ちた命の時の怖さと同時に打つ数（4）は変えない
  floorMult: (rt) => { const P = rt.player?.u; return (rt.flags.step === 3 || rt.flags.step === 4) && P && P.hp < P.maxHp * 0.6 ? 0.8 : 1; },
  // 11/8 十二3：夜の土手で下の瀬の島津に一瞬に三太刀（共通の一太刀五割）を浴び、満ちた命から二秒で討たれた。
  //   刃を受けた後の四秒は次の刃を通さない（一太刀五割のまま。止まれば討たれ、走れば抜けられる。稲生・有岡と同じ）
  // 11/18 クラウド持ち主：共通の限り（K360⑦）で四秒が一秒八に縮み、救援の段で侍の一太刀が四方から続いて act bot が倒れた（526秒）。kaito 11/18「少し軽く」の決まり（重くした戦は三秒半まで・岩石城・山中城と同じ）
  meleeGrace: { rate: 1, burst: 1, interval: 3.5, k1118: true },
  playerRegen: 0.025,
  closeCombatAssist: true,
  autoTargetCamera: true,
  steadyMeleeCamera: true,
  // 自動の敵注視を切った退き口でも、共通の近敵カメラへ戻さない。
  noAutoFoeCam: (rt) => rt.flags.step >= 4,
  noWinCrane: true,
  victoryTitle: '戸次川の戦い　四国勢 大敗',   // 11/18 持ち主 ⑥：874×402 で二行に折れた
  victoryCaption: '長宗我部信親 討死　十河存保 討死　長宗我部元親 生還　仙石秀久 生還',
  compactIntro: true,
  introDateNoWrap: true,
  keepMix: false,
  missions: STEP_TEXT,
  missionOf(rt) { return Math.max(0, Math.min(4, (rt.flags.step || 1) - 1)); },
  missionHeading(rt) { const k = this.missionOf(rt); return rt.flags.mText || STEP_TEXT[k]; },
  // 戦の後の札も右上と同じ五つ（「敵を何人討つ」で埋めない。三1）。果たすのは段を進めた時
  goals5(rt) {
    const F = rt.flags, won = () => rt.tracker?.main === true;
    // 救援や殿を続けている間、知らせのない時間切れで目標を失敗にしない。
    return STEP_TEXT.map((text, k) => ({ kind: 'stage', k, text, noun: STEP_NOUN[k], action: text,
      check: k < 4 ? () => won() || (F.step || 0) > k + 1 : won }));
  },
  // 行き先の▼は今の段の場所に一つ（話の間と札の裏には出さない。五4）
  missionPin(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (rt.over || rt.hud?.introWaiting || F.ending || !F.step || F.holdPlayer || !rt.player.u.alive) return null;
    const q = F.pin || (F.pin = { x: 0, z: 0, r: 6, hide: -2 });
    q.unit = null; q.enemy = false; q.waiting = false; q.arrived = false; q.progress = 0; q.route = false;
    let at, r = 8;
    if (F.step === 1) at = shinkou.pin(rt);   // 渡るまでは南の岸の浅瀬の口、渡れの後は北の岸
    else if (F.step === 2) at = tsuigeki.pin(rt, K);
    else if (F.step === 3) { at = kyuen.pin(rt); r = 6; }   // 伏せの始めは防戦する河原、救援の知らせの後は信親
    else if (F.step === 4) at = shingari.pin(rt, K);   // 殿の間は北の口、皆が渡ったら南の岸
    else { at = SAFE; r = 9; }   // ⑤：渡り切った西の岸の土手
    // P4（K410）：退く段は浅瀬の北口 → 浅瀬の南の岸 → 西の岸 のピンの連なり。着いた所は「済」の印と音、次のピンが立つ
    const cp = F.step >= 4 ? cpPin(rt) : null;
    if (cp) { at = cp; r = cp.r; }
    q.x = at.x; q.z = at.z; q.r = r;
    // 下知が「追え」「退け」だけでも、印には実際の行き先の名を添える。
    q.label = cp?.label || STEP_NOUN[F.step - 1];
    if (F.step === 2 && !F.feigned) q.label = '伊集院の先手';
    else if (F.step === 2 && F.s2?.leg === 1) q.label = '島津の囲みの陣';
    else if (F.step === 3) q.label = !F.s3?.st ? '中津留の河原' : F.s3.st >= 3 || (F.s3.st === 2 && F.s3.motoOrdered) ? '長宗我部元親' : '長宗我部信親';
    // 防戦・救援は着いてから続く。共通が読む hide を指定し、
    // 到着半径と再表示の一歩半のゆとりの内でも行き先を消さない。
    q.hide = -2;
    // 画面上の行き先印は hideDistance を読む。防戦地点に着いても消さない。
    q.hideDistance = -2;
    q.arrived = Math.hypot(p.x - at.x, p.z - at.z) < r;
    return q;
  },
  introText: () => '島津に囲まれた鶴賀城を救いに、戸次川を渡る。長宗我部元親を守り、西の岸へ生還せよ。',
  minutes: 15,
  pacingCap: 1260,   // 11/14 クラウド：段が八つ続き act bot は退きの最後（川を渡れ・西の岸へ）で十八分の刻限に掛かった（1075 秒に最後の段）。二十一分へ
  expectMin: 15,
  sides: { a: { name: '豊臣勢（四国の衆）', mon: 'chosokabe' }, b: { name: '島津勢', mon: 'shimazu' } },
  // 両軍の残り（史実の数）：塊の名目から。まだ林に伏せている島津も数に入れる
  force(rt) {
    const F = rt.flags;
    if (!F.blk) return null;
    // 塊の人数を丸めた差で、開戦時の六千・一万二千を超えないようにする。
    const n = (b, h) => (b ? Math.round(h * b.aliveNominal() / Math.round(h / SC)) : h);
    const B = F.blk;
    // 11/18 持ち主（n-tennoji の照らし「両軍の人数が包囲から退きまで 2,266／9,461 のまま動かない」）：塊は本物に替わらないので減らない。
    //   戦場で倒れた本物の兵を一人ずつ数え（一度だけ）、一人を史実の六人として両軍から引く。生きて見える本物の数より下にはしない
    const D = F.fallen || (F.fallen = { seen: new WeakSet(), a: 0, b: 0 });
    let la = 0, lb = 0;
    for (const u of rt.army.units) {
      if (u.isStruct || u.type === 'dummy' || u.type === 'porter') continue;
      if (u.alive) { if (u.team === 0) la++; else lb++; continue; }
      if (D.seen.has(u)) continue;
      D.seen.add(u); if (u.team === 0) D.a++; else D.b++;
    }
    const a = n(B.sen, HIST.sen) + n(B.nobu, HIST.nobu) + n(B.sogo, HIST.sogo) + n(B.moto, HIST.moto) - D.a * 6;
    const b = n(B.ijuin, HIST.ijuin) + n(B.niiro, HIST.niiro) + n(B.honjo, HIST.honjo) + n(B.ieh, HIST.ieh) + n(B.ura, HIST.ura) - D.b * 6;
    return { a: Math.max(la, a), b: Math.max(lb, b), a0: A0, b0: B0, casualtiesCounted: true };
  },
  date: () => '天正十四年十二月十二日　夕刻',   // 五4：一行に収める（「夕／刻」で割れた）
  talk: {
    before: [['大友の使者', '島津家久が豊後へ攻め入り、鶴賀の城を囲んでおります。なにとぞお救いを'], ['仙石秀久', '殿下の先手として九州へ渡ったのは、大友を救うためじゃ'],
      ['長宗我部元親', '川を背に戦うは危うい。殿下の本隊を待つべし'], ['十河存保', '待てば鶴賀が落ちる。わしは仙石殿に従う'], ['仙石秀久', '軍監はわしじゃ。皆、川を渡れ']],
    after: [['主人公', '信親様を、お救いできませなんだ'], ['長宗我部元親', '……生きて戻った者がおる。それでよい']],
  },
  spawn: { x: START.x, z: START.z, heading: Math.PI / 2 },
  world: {
    winter: true,   // 11/19 史実照らし（docs/reki_sky_1119.md）：太陽暦の十二月〜一月。冬枯れの草と木
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵を作らない。映る兵は全員 戦の中の本物
    seed: 15861,
    time: 'dusk',
    // 11/21 K365 クラウド34（司令塔「対岸がはっきり霞む所まで」）：浅瀬を渡る始めの百秒は川霧の中（霧の端50m）。対岸の島津勢は霧の奥の影から現れ、渡り終えるころ晴れる（world_update.js marchMist）。groundMistScale（cloud-41）とは別の値
    marchMist: 100, marchMistFar: 50,
    groundHalf: 340,   // 11/19 係（kaito 11/19「地形をもっと大きく、軍勢が入るように。あそこは狭い」）：260→340（布陣図の島津の奥 z−218・豊臣の陣 x−214 の外に余白）
    battleViewDistance: 140,   // 川向こうの島津の陣と鶴賀城の尾根が霞に消えないように
    moveLim: 320,   // 11/19 係：248→320（両軍の備が並べる広さ。表の備が端で押し戻されない）
    noFoeNear: true,         // 敵の後詰めを本人の近くへ寄せない（見せかけの軍勢で囲まない。AQ の 6）
    autumn: true,            // 師走：枯れ草の河原
    // 11/8 八1：つぎはぎの四角と丸い石の模様が一面に貼り付いた。まだらの土は使わない
    patchyGround: false,
    // 通し確認の黒い板の対策：落ちた指物は拡大した平板にせず、共有の皺のある布へ畳む。
    crumpledFlags: true,
    // 11/8 二2：朱の夕焼けが向きで出たり消えたりした。夕の空は一面の薄雲で、朱は地平の低い所だけ
    duskLight: { cover: 0.72, glowK: 0.3, cloud: 0.1 },
    // 11/8 四6・十5：夜の地面が昼のように明るく影がくっきり、具足が銀に光った。月明かりは弱く、影は淡く
    nightLift: 1.5,
    unitNightScale: 0.45,   // 11/17 K365（iMac n-kwatch 検品：456秒の夜の乱戦で兵が白く透ける）：兵だけの縁の照り（rimK は 0.4 から）が出ない強さに。面の補光は残す（岩村 0.4・伊賀 0.6 と同じ決め）
    // 共通の夜の下限（月 0.7・補助光 0.5525）で、下の弱い月明かりを上書きさせない。
    nightMoonFloor: 0.18,
    nightMoonMin: 0.18,
    nightFill: 0.3,
    nightFillMin: 0.2,
    // 11/8 八1：遠くの山に縦の筋（光の筋）が雨の帯のように走り、霧が板を重ねたように見えた。光の筋は出さず、地の霧は薄く
    noShafts: true,
    mistFogSync: true,   // 11/26 クラウドせ：川霧の板が霧の野の上に黒い斑で浮いた（world_haze.js updateGroundMist）
    groundMistScale: 2.5,   // 11/21 cloud-34 の頼み（司令塔）：戸次川の川霧（重さは同じ・前後は docs/evidence_now/hetsugi_now/）
    nightLight: { sunI: 0.18, hemiI: 0.2, sky: 0x1a2236, fog: 0x1e2636, top: 0x070b16 },
    noGroundRipples: true,
    height,
    riverCross: true,
    wadeDepth: 0.85,
    waterSlow: true,
    // 通し確認で見えた水の板の直線を消す。岸の端を土へ沈め、浅い所は泥へなじませる。
    streams: [{ pts: [...RIVER].reverse(), w: 32, depth: 2.1, fords: [FORD, FORD2], buryBanks: true, softBanks: true }],   // 大野川は大きな川（細い帯にしない）
    paths: [{ pts: [[START.x, 160], [FORD.x, 20], [FORD.x, -20], [IJUIN.x - 6, -60], [CASTLE.x - 30, -112], [CASTLE.x + Math.sin(GATE_A) * (FORT_R + 2), CASTLE.z + Math.cos(GATE_A) * (FORT_R + 2)]], w: 3 },
      { pts: [[FORD.x, 30], [-60, 52], [-120, 70], [CAMP.x, CAMP.z]], w: 2.5 }],
    groves: [
      ...WOODS.map((w) => ({ x: w.x, z: w.z, r: 30, n: 52, kind: 'sugi' })),
      { x: IEHISA.x - 20, z: IEHISA.z - 26, r: 26, n: 30 }, { x: CASTLE.x + 40, z: CASTLE.z + 10, r: 26, n: 34 },
      { x: CASTLE.x - 30, z: CASTLE.z - 30, r: 22, n: 26 },
      { x: -230, z: 130, r: 22, n: 22 }, { x: 150, z: 140, r: 20, n: 18 },
    ],
    trees: 140,
    tufts: 2400,
    treeDensity: (x, z) => (Math.abs(z - riverZ(x)) < 90 || dist({ x, z }, CASTLE) < FORT_R + 6 ? 0 : 0.6),
    clear: (x, z) => Math.abs(z - riverZ(x)) < 30 || dist({ x, z }, CASTLE) < FORT_R + 4 || dist({ x, z }, CAMP) < 16 || dist({ x, z }, KAGAMI) < 14,
    fleeOut: (x, z, team) => (team === 1 ? z < -250 : x < -250 || z > 250),
  },
  // 11/21 cloud-19（kaito_now③ 天王寺の出来に）：身の回りの当時の場（timeslip_field.js）。天正十四年十二月は冬枯れ。倒れた物・踏み荒らしは天王寺へ寄せる。川面には置かない（streams）
  timeslip: { debris: 1.2, trample: 0.4, wet: 0.5, dust: 0.15, arrows: 0.7, grass: 0x8a8058, grassTints: [0xffffff, 0xd6c9a0, 0xa49a78], grassH: 0.7, skip: (x, z) => dist({ x, z }, CASTLE) < FORT_R + 4 || dist({ x, z }, CAMP) < 16 },

  *setup(rt) {   // K626：段に分けた（間の yield で一コマ返す）
    const F = rt.flags;
    // 11/17 リ三 cautious bot：行き先の札（.gs-tag）と中央の呼びかけが重なった。呼びかけが出ている間は札を隠す（沢山・関ヶ原と同じ決まり）
    if (typeof document !== 'undefined' && !document.getElementById('t06-cc-style')) {
      const st = document.createElement('style'); st.id = 't06-cc-style';
      st.textContent = 'html:root body #hud:has(#h-prog[data-battle="t06_hetsugi"]):has(#center-call .cc:not(.blue)) #goal-sign .gs-tag, html:root body #hud:has(#h-prog[data-battle="t06_hetsugi"]):has(.enc-name:not([hidden])) #goal-sign .gs-tag { opacity:0 !important; }';
      document.head.appendChild(st);
    }
    F.step = 0; F.holdPlayer = false; F.foes = []; F.ending = false; F.blk = {}; F.blocks = [];
    rt.def.autoTargetCamera = true;
    this.castle(rt);
    this.riverStones(rt);
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    this.fordRiffles(rt);
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗（def.timeslip）
    this.flushBirdsBuild(rt);
    this.kagami(rt);
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    this.sunTurn(rt);
    // 家久の本陣の陣幕と床几（伏せの段まで中は見えない後ろ）
    rt.scene.add(jinmaku(rt.world, SEAT.x, SEAT.z, 12, 8, 4, { mon: 'shimazu' }));
    rt.scene.add(shogi(rt.world, SEAT.x, SEAT.z, 0, { gunbai: true }));
    // 11/20 クラウド35（K474「進んだ先で敵が陣を敷いているのが見える」）：家久の本陣は幕一つだけだった。後ろに陣小屋三つ・前に篝火二つ（見た目だけ）。
    //   伏せの兵（釣り野伏せ）の所には幕を張らない（伏せが見えてしまうので）
    try { enemyJin(rt, { mon: 'shimazu', facing: 0, honjin: { x: SEAT.x, z: SEAT.z }, hutName: '島津の陣小屋' }); } catch (e) { console.warn(e); }
    for (const [dx, dz] of [[-8, 6], [8, 6], [-14, -2], [14, -2]]) rt.scene.add(nobori(rt.world, SEAT.x + dx, SEAT.z + dz, 'shimazu', 6));
    // 豊臣方の塊（渡る前の岸）。仙石が先陣、信親が左、十河が右、元親は後ろで渡らずに残る
    const B = F.blk;
    // 11/7 一5・九4：主人公は信親の備のすぐ後ろ。目の前で四国の衆が渡り始める（渡る順は仙石→十河→長宗我部）
    // 11/20 K365 クラウド38（kaito_now ③ 天王寺の出来に・家ごとの旗の林）：仙石の備・旗本・落ち武者は豊臣の桐でなく、仙石の旗印「白地に黒の『無』」
    //   （陣立ての表 fujin_table_build.mjs の仙石の行）。陣笠と胴は家紋の永楽銭（units.js FLAG_HOUSE_MON → sengoku）
    B.sen = this.block(rt, { key: 'sen', name: '仙石秀久の備', team: 0, flag: SEN_FLAG, fac: 'toyotomi', at: { x: -64, z: 46 }, facing: Math.PI / 2, w: 34, d: 10 });
    B.nobu = this.block(rt, { key: 'nobu', name: '長宗我部信親の備', team: 0, flag: 'chosokabe', at: { x: -100, z: 58 }, facing: Math.PI / 2, w: 30, d: 10 });
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    B.sogo = this.block(rt, { key: 'sogo', name: '十河存保の備', team: 0, flag: 'miyoshi', at: { x: -84, z: 76 }, facing: Math.PI / 2, w: 26, d: 8 });
    B.moto = this.block(rt, { key: 'moto', name: '長宗我部元親の備', team: 0, flag: 'chosokabe', at: { x: -142, z: 98 }, facing: Math.PI / 2, w: 26, d: 8 });
    // 島津の先手（伊集院久宣）：鶴賀城の下の囲みの陣
    B.ijuin = this.block(rt, { key: 'ijuin', name: '伊集院久宣の備', team: 1, flag: 'shimazu', at: IJUIN, facing: 0, w: 38, d: 10 });
    // 名のある将の本物の組（塊と一緒に動く）
    // 渡河・追従・殿の下知を、共通の「近くに敵が来たら攻める」判断で上書きさせない。
    const ally = (o, list, flag) => { const g = allyGroup(rt, { fullStrength: true, facing: Math.PI, width: 5, aggro: 9, speed: 3.4, order: 'hold', noRout: true, ...o }, fl(list, flag)); g.mon = flag; g.historicalOrders = true; return g; };
    F.nobu = ally({ name: '長宗我部信親の旗本', anchor: { x: -104, z: 66 } }, [{ type: 'busho', n: 1, o: { name: '長宗我部信親', invuln: true, horse: true, weapon: 'spear' } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }], 'chosokabe');
    F.nobuU = F.nobu.units.find((u) => u.type === 'busho');
    if (F.nobuU) { naginata(F.nobuU); F.nobuU.showHp = true; }   // 11/18 夜50-40 K352⑤：信親の名の下に命の棒（救援の段で削れていくのが見える）   // 信親は大長刀で八人を斬ったと『元親記』
    // 11/18 クラウド持ち主（act bot 291〜426秒）：信親の旗本が包囲の始めに討ち尽くされ、救援の前から信親が一人で二分立った。
    //   信親の旗本は一領具足の精兵で、最期まで信親の周りで斬り合う（『元親記』）。旗本の守りを厚くし、最期の場面まで供を残す
    F.nobu.defMult = 1.8;

    F.sogo = ally({ name: '十河存保の旗本', anchor: { x: -84, z: 80 } }, [{ type: 'busho', n: 1, o: { name: '十河存保', invuln: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 5, o: { flagScale: 1 } }], 'miyoshi');
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    F.sogoU = F.sogo.units.find((u) => u.type === 'busho');
    F.sogo.defMult = 1.6;   // 11/18 クラウド持ち主（act bot）：十河の旗本が③で討ち尽くされ、④の殿に十河が一人で立った。殿に残る供を保つ
    F.sen = ally({ name: '仙石秀久の旗本', anchor: { x: -64, z: 50 } }, [{ type: 'busho', n: 1, o: { name: '仙石秀久', invuln: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 5, o: { flagScale: 1 } }], SEN_FLAG);
    F.moto = ally({ name: '長宗我部元親の旗本', anchor: { x: -142, z: 104 }, aggro: 6, seekRange: 10 }, [{ type: 'busho', n: 1, o: { name: '長宗我部元親', invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }], 'chosokabe');
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    F.moto.defMult = 1.8;   // K409（kaito 11/20「長宗我部も最後まで馬廻が守る」）：元親の馬廻も硬く、殿まで供が残る
    F.motoU = F.moto.units.find((u) => u.type === 'busho');
    F.mine = ally({ name: '手勢', anchor: { x: START.x + 3, z: START.z + 5 }, width: 4, speed: 3.8, dmgMult: 0.9 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 13 }], 'chosokabe');
    // 11/18 クラウド持ち主（⑥写真の悪い所(2)：開戦の写真で本人の周りに味方0人）：手勢の持ち場は0.6秒ごとに本人へ寄せるため、隊の自動の縦隊が付いたり外れたりし、
    //   外れるたびの「開く途中」の待ち（後ろの者ほど二秒余り）が続いて十六人の大半が陣に立ったまま（描かずの数え：二十秒で本人から七十 m・五十五秒で百六十 m）。手勢は縦隊にしない
    F.mine.march = false;
    // 戸次統常（大友方。父の汚名を雪ぐと志願し、一族郎党と討死）。十河の備の脇に付く
    F.tsune = ally({ name: '戸次統常の手', anchor: { x: -78, z: 84 } }, [{ type: 'busho', n: 1, o: { name: '戸次統常', invuln: true, horse: true } }, { type: 'samurai', n: 4 }], 'otomo');
    F.tsuneU = F.tsune.units.find((u) => u.type === 'busho');
    // 11/8 一5：塊は百五十 m の内では描かれないので、本人の周りの四国の衆が旗本だけ（十数人）に見えた。信親の備の前の列（土佐の一領具足の槍組）を本物で二つ
    // 11/19 クラウドし（kaito_now 3「戸次川：始まり十数人しか見えない」）：四国の衆の本物は旗本と槍組二つだけで、渡りの間に本人の目に入る味方が十数人の塊に見えた。
    //   信親の備の後ろの列に槍組を二つ、十河の備に三好の槍組を二つ足す（本物 +38。携帯で始めの本物 約170→210・上限 290 の内）。退き・殿の扱いは今の槍組と同じ（F.allyBands）
    F.allyBands = [[-6, -8, 'nobu'], [10, -8, 'nobu'], [-6, -20, 'nobu'], [10, -20, 'nobu'], [-8, -4, 'sogo'], [8, -4, 'sogo']].map(([dx, dz, k], i) => {
      const mon = k === 'sogo' ? 'miyoshi' : 'chosokabe', at = lightPos(B[k]) || { x: -100, z: 58 };
      const g = allyGroup(rt, { name: k === 'sogo' ? '十河の槍組' : '長宗我部の槍組', anchor: { x: at.x - dz, z: at.z + dx }, facing: Math.PI / 2, width: 5, formation: 'yari', yariRanks: 3, spacing: 1.2, aggro: 10, seekRange: 14, speed: 3.4, order: 'hold', noRout: true, dmgMult: 0.8 },   // 11/18 k365-cloud-37：一列から三段の塊へ（③△・人数同じ）
        fl([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 - (i % 2), o: { flagScale: 1 } }], mon));
      g.mon = mon; g.historicalOrders = true;
      // 11/19 クラウドせ（kaito_now 3・ヨ三の写真：始前は厚いが始右・始左・始後は本人の周りが十数人）：信親の槍組四つは始めから本人を囲んで歩く
      //   （0,1＝後ろの左右・2,3＝左右の脇）。本人は信親の備の三十 m 後ろに立ち、備の塊は百五十 m 内で描かれないので、脇と後ろが空の土手だった
      if (i < 6) { const o = BAND_RING[i]; g.anchor = { x: START.x - o[0], z: START.z - o[1] }; for (const u of g.units) { u.pos.x += g.anchor.x - (at.x - dz); u.pos.z += g.anchor.z - (at.z + dx); } g._withMe = true; }
      return [g, dx, dz, B[k]];
    });
    // 元親の旗本も自分の備に付く。渡河せず南岸に留まり、退却時は closeRing で追従を解く。
    F.follow = [[F.nobu, B.nobu, 6, 4], [F.sogo, B.sogo, 0, 4], [F.sen, B.sen, 0, 4], [F.moto, B.moto, 0, 4], [F.tsune, B.nobu, -12, 2], ...F.allyBands.map(([g, dx, dz, b]) => [g, b, dx, dz])];
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    F.allyBands = F.allyBands.map(([g]) => g);
    // 島津の名のある将は馬上で旗本に囲まれ、自分の備と動く（足軽一人を追わない・討てない）
    F.followFoe = [];
    this.foeLord(rt, '伊集院久宣', B.ijuin, IJUIN, 34);   // 囮の先手の将は囲みの陣の奥（鶴賀城の下）
    // 伊集院の先手の本物の兵：鶴賀城の下で川へ向いて槍を構える（11/7 九2：書いた先手が来ず、槍を入れる相手がいなかった）
    // 11/17 K354 kaito「伊集院隊は第一陣で五千。先陣だけでうちの兵の半分ぐらいと思わせたい」（センゴク権兵衛9巻：一番備が上方勢を押し、崩れたふりで退く）。
    //   K285 で絵だけの兵は出さないので、本物の組を二つから四つへ（前の列二つ・後ろの列二つ）。四国の衆（本物百ほど）の半分余りに見える
    F.ijBands = [[22, -66], [46, -68], [12, -80], [36, -82]].map(([x, z], i) => this.foeBand(rt, '伊集院の先手', { x, z }, 0, i < 2 ? 12 : 14, { aggro: 5, seekRange: 8 }));
    // 11/28 クラウド持ち主（身分3の act 描かず：北岸に陣を敷けで待つ 45〜48秒に、四十 m 先の先手の鉄砲二発29で命100→38。K136「浅瀬の先に待ち伏せは理不尽」）：
    //   渡る段（①）の間だけ、先手の本人への倍を半分に（弾は gunGroupMult で効く）。②の始めに外し、攻めた後の囮の手加減（0.45）はそのまま
    for (const g of F.ijBands) { g.dmgMultPlayer = 0.4; g.ijOpenSoft = true; }
    // K407（kaito 11/20「山の上の味方の城に島津の兵が詰まっている。城の中は味方、島津はそれを囲む形に」）：城兵は主郭の中、島津の組は主郭の外の四方に城へ向いて立つ
    F.siegeRing = [0.6, 1.6, 2.6, 3.9, 5.1].map((a, i) => this.foeBand(rt, '鶴賀城を囲む島津', { x: CASTLE.x + Math.sin(a) * (FORT_R + 11), z: CASTLE.z + Math.cos(a) * (FORT_R + 11) }, a + Math.PI, 9, { noEngage: true, aggro: 0, seekRange: 0 }));
    // 11/28 クラウド持ち主（身分3の act 4回に3回、包みの段 294〜372秒に「鶴賀城を囲む島津」が城を離れて河原の本人を囲み倒した・201秒に七十八 m 先へ寄る途中で重なって止まる）：
    //   城の囲みは②③の「hold の島津を打ち掛からせる」から外し、城を囲み続ける（史実：家久は鶴賀城を囲んだまま先手と伏せで討った）
    for (const g of F.siegeRing) g.siegeHold = true;
    shinkou.install(rt, K);
    tsuigeki.install(rt, K);
    rt.obj('main', STEP_TEXT[0], 'main', true);
    // 軍議の声とともに渡河を始める。主人公も始めから動ける。
    this.talk.before.forEach(([who, s], i) => rt.after(0.6 + i * 3, () => rt.say(who, s, 2.8)));
    // 四国の衆は開戦と同時に浅瀬へ駆ける。
    this.toStep(rt, 1);
  },

  // 日の向き：空の決まり（東＝+x）を実の向き（東＝−z）へ九十度回す。夕日は渡る前の岸（実の西）の後ろに沈み、夜の月も同じ回しで
  sunTurn(rt) {
    const W = rt.world, turn = (v) => v.set(v.z, v.y, -v.x);
    if (!W.sunOffset || !W.lookOf) return;
    turn(W.sunOffset);
    W.skyMat?.uniforms.sunDir.value.copy(W.sunOffset).normalize();
    const lookOf = W.lookOf;
    W.lookOf = function (key) { const L = lookOf.call(this, key); turn(L.sunDir); return L; };
  },

  // 島津の足軽の組（本物）。槍の列に鉄砲を二つ、組頭の侍を一人
  foeBand(rt, name, at, facing, n = 10, o = {}) {
    // 11/18 クラウド k365-cloud-37（一枚表③△「中津留の河原で味方も島津もまばら」）：一列（line）から三段の槍の塊（yari）へ。人数は同じ（重さは変わらない）
    const g = enemyGroup(rt, { faction: 'shimazu', name, anchor: { x: at.x, z: at.z }, facing, width: 5, formation: 'yari', yariRanks: 3, spacing: 1.2, noRout: true,
      morale: 90, dmgMult: 0.8, order: 'hold', aggro: 8, seekRange: 14, speed: 3.4, ...o },
    [{ type: 'ashigaru', n: n - 3, o: { flagScale: 1 } }, { type: 'gun', n: 2 }, { type: 'samurai', n: 1 }]);
    g.mon = 'shimazu'; rt.flags.foes.push(g);
    return g;
  },

  // 島津の名のある将（馬上）と旗本。塊の後ろに付いて動く
  foeLord(rt, name, b, at, back = 20) {
    const g = enemyGroup(rt, { faction: 'shimazu', name: `${name}の旗本`, anchor: { x: at.x, z: at.z - back }, facing: 0, width: 4, formation: 'line', noRout: true,
      morale: 100, dmgMult: 0.6, order: 'hold', aggro: 4, seekRange: 6,   // K352：将の旗本の一太刀 0.35→0.6
      speed: 2.6 },
    [{ type: 'busho', n: 1, o: { name, invuln: name !== '伊集院久宣', mustLive: true, horse: true, keep: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 2, o: { flagScale: 1 } }]);
    g.kind = 'main'; g.mon = 'shimazu';
    rt.flags.followFoe.push([g, b, 0, -back]);   // 備の後ろで下知する。前に出て足軽を追わない
    return g;
  },

  // 陣形の塊（備）を一つ。名目は史実の兵数 ÷ SC。近くは本物の兵に替わる
  block(rt, o) {
    const W = rt.world, F = rt.flags;
    const add = W.addDistantArmy;
    W.addDistantArmy = function (p) { return add.call(this, { ...p, w: o.w, d: o.d, kind: 'mixed', flagRate: 0.5, mon: o.flag, team: o.team, farFill: true, host: false }); };
    let b;
    try { b = fieldButai(rt, { name: o.name, team: o.team, faction: o.team ? 'shimazu' : o.fac || o.flag, kind: 'ashigaru', nominal: Math.round(HIST[o.key] / SC), armor: ARM[o.fac || o.flag], flag: o.flag, at: o.at, facing: o.facing, realMax: 0 }); }
    finally { W.addDistantArmy = add; }
    b.noSwitch = true;   // 11/18 持ち主：味方の備の家を 'oda' にしていたため、近くで本物に替わった仙石・長宗我部・十河の兵の隊旗が永楽銭（K352⑦）→備の紋の家に
    b._autoSwitch = () => {};
    if (b.light) { b.light.army.noWake = false; b.light.army.team = o.team; }
    b.key = o.key;
    F.blocks.push(b);
    return b;
  },
  // 塊を to へ（speed m/秒）。charge は槍を下ろして駆ける、back は背を向けて退く
  go(b, to, speed = 1.6, opt = {}) {
    if (!b || !b.light || b.routedL) return;
    const p = lightPos(b), d = Math.hypot(to.x - p.x, to.z - p.z);
    // 11/16 K340 クラウドせ：noFake（K285）で塊は空の入れ物になり、moveTo が何もしなかった。全ての備が出発の所に止まり、
    //   信親の旗本（塊に付いて歩く）は戦の終わりまで南の岸に残った（act bot：救援の▼まで百八十秒近づけず）。空の塊は自分で歩かせる（tickEmpty）
    if (b.light.army?.empty) { b._tw = { fx: p.x, fz: p.z, tx: to.x, tz: to.z, t: 0, secs: Math.max(0.5, d / speed) }; }
    else b.light.moveTo(to.x, to.z, Math.max(0.5, d / speed), opt);
    b.cmd = { id: opt.charge ? 'charge' : 'move', to, target: null, form: 'line' };
  },

  // 鶴賀城：尾根の頂の主郭を土塁と柵で囲み、南西に虎口。櫓と大友の旗。柵には当たりを付ける（AQ の追い・ap_collide）
  castle(rt, o = {}) {   // o.garrison＝false：城兵を置かない（K651 他家の戦は見た目だけ使う）
    const W = rt.world, q = CASTLE, batch = makeSimpleBatch(), n = 18;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
      if (Math.abs(((am - GATE_A + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < Math.PI / n) continue;   // 虎口
      const seg = [q.x + Math.sin(a0) * FORT_R, q.z + Math.cos(a0) * FORT_R, q.x + Math.sin(a1) * FORT_R, q.z + Math.cos(a1) * FORT_R];
      dorui(W, seg, -Math.sin(am), -Math.cos(am), { h: 1, w: 2.2, capEnds: true, closeBack: true, batch });
      palisade(W, seg, { h: 2.6, batch, solid: true });
    }
    finalizeSimpleBatch(rt, batch);
    // 城と丘の櫓も大友方。所属を省くと共通の櫓が無地の幟を立てる。
    rt.scene.add(yagura(W, q.x + 4, q.z - 5, { mon: 'otomo', team: 0, logFrame: true, kind: 'ro', height: 8, boarded: true }));
    rt.scene.add(yagura(W, q.x + Math.sin(GATE_A) * (FORT_R - 3) + 3, q.z + Math.cos(GATE_A) * (FORT_R - 3), { mon: 'otomo', team: 0, logFrame: true, kind: 'ro', height: 6.5, boarded: true }));
    rt.scene.add(hut(W, q.x - 3, q.z + 8, 11, 7, 0.3, { roof: 0x5a4c38 }));   // 城主の館
    rt.scene.add(hut(W, q.x + 7, q.z - 1, 6, 4, 0.3, { roof: 0x6a5c44 }));
    rt.scene.add(yagura(W, q.x + 10, q.z + 9, { mon: 'otomo', team: 0, logFrame: true, kind: 'ro', height: 6.5, boarded: true }));
    for (const [dx, dz] of [[-6, -6], [6, 4], [0, -10], [9, -4], [-9, 3], [3, 9]]) rt.scene.add(nobori(W, q.x + dx, q.z + dz, 'otomo', 6));
    // 11/7 四5：小屋と櫓だけで城に見えなかった。虎口に冠木門、奥にもう一つの櫓（主郭は東西四十 m・南北二十五 m の山城。battle_learn）
    rt.scene.add(kabukimon(W, q.x + Math.sin(GATE_A) * FORT_R, q.z + Math.cos(GATE_A) * FORT_R, 4.6, GATE_A));
    rt.scene.add(yagura(W, q.x - 11, q.z + 7, { mon: 'otomo', team: 0, logFrame: true, kind: 'ro', height: 7, boarded: true }));
    addSite(rt, 'castle', q.x, q.z, '鶴賀城');
    if (o.garrison === false) return;
    // 城兵（大友方・利光の者）。主郭から出ない
    const g = allyGroup(rt, { name: '鶴賀城の城兵', fullStrength: true, anchor: { x: q.x, z: q.z }, facing: GATE_A, width: 4, aggro: 4, seekRange: 8, order: 'hold', fixed: true, noRout: true },
      fl([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 }, { type: 'gun', n: 2 }], 'otomo'));
    g.mon = 'otomo';
  },
  // 鏡城の下の味方の陣（逃げる先。渡る前の岸）
  // 11/18 クラウド持ち主（⑥写真の悪い所(3)：中津留の河原が草地のままで河原の石が見えない）。
  //   大野川の河原は丸い礫の州。水際ほど濃く、河原の奥（川から六十 m）で草へ消える。共用の形一つ・一束（描く回数は一つ）・影は落とさない。歩みと当たりは変えない
  // 11/21 クラウド k365-cloud-19（③戸次川の川：浅瀬が灰の平らな水面のまま、渡る所が絵で分からなかった）：
  //   浅瀬（FORD）の川幅いっぱいに、石を越えて砕ける白波の筋を流れの向きに散らす。泡の絵は一枚を作って使い回し、
  //   形は一つにまとめて一度に描く（当たり・歩み・渡河の段は変えない）。水面の高さは川の面へ光線で合わせる。
  fordRiffles(rt) {
    const W = rt.world, st = W.def.streams?.[0], river = st?.mesh;
    if (!river) return;
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), from = new THREE.Vector3();
    const surface = (x, z) => { from.set(x, 60, z); ray.set(from, down); const h = ray.intersectObject(river, false)[0]; return h ? h.point.y : null; };
    let seed = 9137;
    const R = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const parts = [];
    for (const f of [FORD, FORD2]) {
      const n = Math.round(f.w * 1.1);
      for (let i = 0; i < n * 4 && parts.length < 60; i++) {
        const x = f.x + (R() * 2 - 1) * f.w, zc = riverZ(x), z = zc + (R() * 2 - 1) * 27;
        const y = surface(x, z);
        if (y === null) continue;
        const long = 3 + R() * 5, wide = 2.5 + R() * 4.5;
        const g = new THREE.PlaneGeometry(long, wide, 4, 4).rotateX(-Math.PI / 2);
        const p = g.attributes.position;
        for (let k = 0; k < p.count; k++) p.setY(k, 0.05 + Math.sin(p.getX(k) * 2.9 + x) * 0.012);
        g.rotateY((R() - 0.5) * 0.35); g.translate(x, y, z); parts.push(g);
      }
    }
    if (!parts.length) return;
    const geo = mergeGeometries(parts); for (const g of parts) g.dispose();
    // 泡の絵：流れに沿う短い白い筋と、縁の薄れ（一枚・読み込み時に一度だけ）
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const x2 = c.getContext('2d'); x2.fillStyle = '#000'; x2.fillRect(0, 0, 128, 64); x2.filter = 'blur(1.6px)';
    for (let i = 0; i < 150; i++) {
      const px = R() * 128, py = 8 + R() * 48, len = 10 + R() * 26, a = 0.45 + R() * 0.55;
      const gr = x2.createLinearGradient(px, py, px + len, py);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.4, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x2.strokeStyle = gr; x2.lineWidth = 2 + R() * 4; x2.beginPath(); x2.moveTo(px, py); x2.lineTo(px + len, py + (R() - 0.5) * 3); x2.stroke();
    }
    x2.filter = 'none';
    // 縁は楕円に薄れさせる（四角い板の縁を見せない）
    x2.globalCompositeOperation = 'destination-in'; x2.save(); x2.scale(1, 0.5);
    const edge = x2.createRadialGradient(64, 64, 4, 64, 64, 54);
    edge.addColorStop(0, 'rgba(0,0,0,1)'); edge.addColorStop(0.45, 'rgba(0,0,0,0.75)'); edge.addColorStop(1, 'rgba(0,0,0,0)');
    x2.fillStyle = edge; x2.fillRect(0, 0, 128, 128); x2.restore();
    // 白い筋（rgb）を濃さ（alphaMap の緑）へ写す：透けた所は黒
    { const im = x2.getImageData(0, 0, 128, 64), d = im.data; for (let i = 0; i < d.length; i += 4) { const v = d[i + 1] * d[i + 3] / 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } x2.putImageData(im, 0, 0); }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.RepeatWrapping;
    const mat = new THREE.MeshLambertMaterial({ color: 0xe8ece6, alphaMap: tex, transparent: true, opacity: 0.95, depthWrite: false, emissive: 0x5a5e5a });   // 11/21：遊ぶ視点（本人の後ろ上）でも泡と分かる濃さ
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 3; mesh.receiveShadow = true;
    mesh.userData.noFreeze = true;   // 二つの浅瀬を一つに束ねた形なので、中心の遠さで霧の先として隠さない（一回で描く・軽い）
    mesh.onBeforeRender = () => { tex.offset.x = (performance.now() * 0.00018) % 1; };
    rt.scene.add(mesh);
    const dispose = rt.dispose;
    rt.dispose = function () { geo.dispose(); mat.dispose(); tex.dispose(); return dispose.call(this); };
  },

  // 11/21 持ち主 クラウド（K354・docs/books/sengoku_gonbee_9.md 45行「すすきの原は伏兵を隠す。草が揺れる・鳥が飛び立つで伏兵を絵で知らせる（字は出さない）」）：
  //   島津が止まって振り返る間（伏せの法螺の三秒前）に、伏せの組が出る左前・右前の原から烏の群れが一度に飛び立つ。字も札も出さない。
  //   形は読み込み時に一度だけ作る（羽を上げた形と下げた形の二つの束・二十八羽）。飛ぶ間（十秒）だけ動かし、ほかの時は描かない。
  flushBirdsBuild(rt) {
    const wing = (up) => {
      const y = up ? 0.32 : -0.22, V = [];
      for (const sd of [-1, 1]) V.push(0, 0, 0.18, 0.5 * sd, y * 0.6, 0.06, 0, 0, -0.14, 0.5 * sd, y * 0.6, 0.06, 1.0 * sd, y, -0.1, 0, 0, -0.14);
      V.push(0, 0.02, 0.3, 0.06, 0, -0.1, -0.06, 0, -0.1, 0, 0, -0.1, 0.13, 0, -0.42, -0.13, 0, -0.42);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(V, 3)); g.computeVertexNormals(); return g;
    };
    const N = 28, mat = new THREE.MeshLambertMaterial({ color: 0x171512, side: THREE.DoubleSide });
    const geos = [wing(true), wing(false)];
    const meshes = geos.map((g) => { const m = new THREE.InstancedMesh(g, mat, N); m.count = 0; m.visible = false; m.frustumCulled = false; rt.scene.add(m); return m; });
    rt.flags.fb = { meshes, N, birds: [], t: 0 };
    const dispose = rt.dispose;
    rt.dispose = function () { geos.forEach((g) => g.dispose()); mat.dispose(); return dispose.call(this); };
  },
  // p から n 羽を飛び立たせる。away は群れが逃げる向き（本人から離れる向き）
  flushBirds(rt, p, n, away) {
    const fb = rt.flags.fb; if (!fb || !p || (typeof window !== 'undefined' && window.__hgBirdsOff)) return;   // __hgBirdsOff：前後の写真の『前』
    const W = rt.world;
    for (let i = 0; i < n && fb.birds.length < fb.N; i++) {
      const a = Math.random() * 6.28, r = Math.random() * 7, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const hx = away.x + (Math.random() - 0.5) * 0.9, hz = away.z + (Math.random() - 0.5) * 0.9, hl = Math.hypot(hx, hz) || 1;
      const sp = 3 + Math.random() * 3;
      fb.birds.push({ x, y: W.heightAt(x, z) + 0.4, z, vx: hx / hl * sp, vy: 4.5 + Math.random() * 2.5, vz: hz / hl * sp, ph: Math.random() * 6.28, fs: 13 + Math.random() * 4, t: -Math.random() * 0.7, sc: 0.75 + Math.random() * 0.3 });
    }
    fb.t = 11;
  },
  flushBirdsTick(rt, dt) {
    const fb = rt.flags.fb; if (!fb || fb.t <= 0) return;
    fb.t -= dt;
    const [mU, mD] = fb.meshes, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    let iu = 0, id = 0;
    if (fb.t > 0) for (const b of fb.birds) {
      b.t += dt; if (b.t < 0) continue;
      b.vy = Math.max(1.2, b.vy - dt * 0.6); b.vx *= 1 + dt * 0.25; b.vz *= 1 + dt * 0.25;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      const up = Math.sin(b.t * b.fs + b.ph) > 0;
      e.set(-Math.atan2(b.vy, Math.hypot(b.vx, b.vz)) * 0.6, Math.atan2(b.vx, b.vz), 0, 'YXZ');
      m4.compose(v.set(b.x, b.y, b.z), q.setFromEuler(e), sc.setScalar(b.sc));
      if (up) mU.setMatrixAt(iu++, m4); else mD.setMatrixAt(id++, m4);
    }
    mU.count = iu; mD.count = id;
    mU.visible = iu > 0; mD.visible = id > 0;
    mU.instanceMatrix.needsUpdate = true; mD.instanceMatrix.needsUpdate = true;
    if (fb.t <= 0) { fb.birds.length = 0; mU.visible = mD.visible = false; }
  },

  riverStones(rt) {
    const W = rt.world;
    let seed = 7741;
    const R = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const N = 2400;
    const mesh = new THREE.InstancedMesh(rockShape(1, true, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, metalness: 0 }), N);
    const d = new THREE.Object3D(), c = new THREE.Color();
    let m = 0;
    for (let t = 0; t < N * 6 && m < N; t++) {
      const x = -120 + R() * 250;
      const south = R() < 0.78;   // 中津留の河原（南の岸）に多く、渡る前の岸は細い州だけ
      const off = south ? 13 + R() * 50 : 13 + R() * 24;
      const z = riverZ(x) + (south ? -off : off);
      const k = Math.exp(-(off - 13) / (south ? 17 : 8));
      if (R() > k) continue;
      if (dist({ x, z }, CASTLE) < FORT_R + 30) continue;
      const big = R() < 0.06;
      const s = big ? 0.35 + R() * 0.3 : 0.07 + Math.pow(R(), 2) * 0.22;
      d.position.set(x, W.heightAt(x, z) - s * 0.18, z);
      d.rotation.set((R() - 0.5) * 0.4, R() * 6.28, (R() - 0.5) * 0.4);
      d.scale.set(s * (1 + R() * 0.6), s * (0.45 + R() * 0.25), s * (0.9 + R() * 0.5));
      d.updateMatrix();
      mesh.setMatrixAt(m, d.matrix);
      // 日に晒れた白っぽい礫と、濡れた水際の暗い礫
      const wet = Math.max(0, 1 - (off - 13) / 6);
      //   写真（62秒）で礫が地に空いた黒い穴に見えた（共用の形の地の色が暗い灰で、ここの色と掛け合わさる）。晒れた礫ほどに一・八倍明るく
      c.setHSL(0.09 + R() * 0.04, 0.06 + R() * 0.06, 0.7 + R() * 0.25).multiplyScalar(1.8 * (1 - wet * 0.4));
      mesh.setColorAt(m, c);
      m++;
    }
    mesh.count = m; mesh.castShadow = false; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    rt.scene.add(mesh);
  },

  kagami(rt) {
    const W = rt.world, batch = makeSimpleBatch(), r = 11, n = 14;
    for (let i = 0; i < n; i++) {
      if (i === 3) continue;   // 口は東（浅瀬からの道の側）
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      palisade(W, [CAMP.x + Math.sin(a0) * r, CAMP.z + Math.cos(a0) * r, CAMP.x + Math.sin(a1) * r, CAMP.z + Math.cos(a1) * r], { h: 2.2, batch, solid: true });
    }
    finalizeSimpleBatch(rt, batch);
    // 通し確認で白い無地の幟に見えた巻き旗の架台を省く。大友の開いた幟は丘に残す。
    KIT.honjin(rt, CAMP.x - 2, CAMP.z, { mon: 'otomo', people: false, fire: true, hatazao: false });
    // 鏡城（丘城）：丘の頂に柵と櫓と大友の旗、陣から登る道（11/7 四5）
    const kb = makeSimpleBatch(), kr = 10;
    for (let i = 0; i < 12; i++) {
      if (i === 6) continue;   // 口は陣の側
      const a0 = i / 12 * Math.PI * 2, a1 = (i + 1) / 12 * Math.PI * 2;
      const seg = [KAGAMI.x + Math.sin(a0) * kr, KAGAMI.z + Math.cos(a0) * kr, KAGAMI.x + Math.sin(a1) * kr, KAGAMI.z + Math.cos(a1) * kr], am = (a0 + a1) / 2;
      dorui(W, seg, -Math.sin(am), -Math.cos(am), { h: 0.9, w: 2, capEnds: true, closeBack: true, batch: kb });
      palisade(W, seg, { h: 2.4, batch: kb, solid: true });
    }
    finalizeSimpleBatch(rt, kb);
    rt.scene.add(yagura(W, KAGAMI.x + 3, KAGAMI.z + 2, { mon: 'otomo', team: 0, logFrame: true, kind: 'ro', height: 7, boarded: true }));
    rt.scene.add(hut(W, KAGAMI.x - 3, KAGAMI.z - 4, 7, 5, 0.2, { roof: 0x5a4c38 }));
    for (const [dx, dz] of [[-6, -6], [6, -5], [-2, 7]]) rt.scene.add(nobori(W, KAGAMI.x + dx, KAGAMI.z + dz, 'otomo', 6));
    addSite(rt, 'castle', KAGAMI.x, KAGAMI.z, '鏡城');
    addSite(rt, 'fort', CAMP.x, CAMP.z, '鏡城の下の陣');
  },
  // 鏡城の下の陣の大友の兵（退く段から置く。始めから置くと、包みの段の本物の兵の枠を塞ぐ）
  otomoCamp(rt) {
    const F = rt.flags;
    if (F.otomo) return;
    // 11/8 七：大友義統がこの夜に鏡城にいたかは史料で揺れる（府内から高崎城へ退いたとも）。陣の将は名を出さない大友の侍大将に
    F.otomo = allyGroup(rt, { name: '大友勢の陣', fullStrength: true, anchor: { x: CAMP.x, z: CAMP.z - 2 }, facing: Math.PI / 2, width: 4, aggro: 4, seekRange: 8, order: 'hold', fixed: true, noRout: true },
      fl([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 3 }], 'otomo'));
    F.otomo.mon = 'otomo'; F.otomo.historicalOrders = true; F.otomo.stay = true;
    const seat = { x: CAMP.x, z: CAMP.z - 2 };
    rt.scene.add(shogi(rt.world, seat.x, seat.z, Math.PI / 2));
    // 護衛は大友勢の陣に置いてある。床几の将へ共通の供回りを追加しない。
    F.otomoSeat = allyGroup(rt, { name: '大友勢の本陣', fullStrength: true, anchor: seat, facing: Math.PI / 2, width: 1, noRetinue: true, aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true },
      fl([{ type: 'busho', n: 1, o: { name: '大友の侍大将', invuln: true, horse: false } }], 'otomo'));   // 在陣の確かでない義統本人にはせず、退き口の陣を守る侍大将にする。
    F.otomoSeat.noAI = true; F.otomoSeat.mon = 'otomo';
    for (const u of F.otomoSeat.units) {
      u.pos.set(seat.x, rt.world.heightAt(seat.x, seat.z), seat.z); u.mesh.position.copy(u.pos);
      u.noTarget = true; u.jinchu = { standing: false, t: 99, len: 1, soldiers: [] };
    }
  },

  // 段を進める（右上の一行と行き先のピン）
  toStep(rt, n) {
    const F = rt.flags, B = F.blk;
    if (F.step >= n) return;
    F.step = n; F.stepT = rt.t;
    for (const k of ['go', 'nobu', 'ford', 'camp', 'moto']) rt.unmark(k);
    F.mText = null;
    // 右上の一行は使番を待たずにすぐ替える（始めから、どこへ・何をするかを出す。AQ の 1）
    rt.obj('main', STEP_TEXT[n - 1], 'main', true);
    if (n === 1) {
      rt.marker('go', () => shinkou.pin(rt), '戸次川の浅瀬');
      // 軍議の最後の下知で進軍する。始まりの待ちは十五秒以内。
      rt.after(13, () => shinkou.march(rt, K));
    } else if (n === 2) {
      rt.marker('go', { x: RING.x, z: RING.z + 6 }, '中津留の河原');   // 行き先は固定（AW の 3）。先手に当たり、退くのを追った先
      rt.say('仙石秀久', 'かかれ！　鶴賀の囲みを破れ！', 2.6);
      rt.army.play('toki', IJUIN, 1.3);
      for (const g of [F.nobu, F.sen, F.sogo, F.tsune]) if (live(g)) g.speed = 3.4;
      if (live(F.mine)) F.mine.speed = 3.8;
      // 11/7 九2：伊集院の先手は丘で立っているだけで、当たる前に退いていた。先手は河原へ下りて四国の衆と本当に槍を合わせる
      // 11/19 係（kaito 11/19「渡った後は一旦陣を敷く。そこへ島津の先手が来て、それをやっつける」）：四国の衆は渡った岸の陣の列（z−42 前後）で構え、先手がその列まで寄せて来る
      this.go(B.ijuin, { x: 24, z: -44 }, 2.6, { charge: true });
      this.go(B.sen, { x: 46, z: -44 }, 3.4);
      this.go(B.nobu, { x: 16, z: -42 }, 3.4);
      this.go(B.sogo, { x: 54, z: -38 }, 3.2);   // 11/8 二2：十河の備は本人から見える所（右の三十 m 余り）
      // 11/19 クラウド持ち主（act bot POSLOG）：本人が先に北岸で先手と向き合うと渡りの順（crossLeg）が三で切れ、元親の備が南の岸 (-4,112) に残った。
      //   「元親を退かせろ」の▼が二百 m 南の川向こうを指し、本人は六十秒立ち尽くしていた。かかれの下知で元親も北岸の浅瀬の口の後ろへ渡らせる
      if (F.s1 && (F.s1.crossLeg || 0) < 4) { F.s1.crossLeg = 4; this.go(B.moto, { x: 4, z: -30 }, 2.6); }
      F.ijKills0 = rt.stats.kills; F.ijTaken0 = rt.stats.taken; F.ijContact = false;
      // 囮の一組は主人公にも槍を向ける。味方だけと戦って退かない。
      const first = F.ijBands.find(live);
      if (first) { first.order = 'attack'; first.focus = rt.player.u; first.seekRange = 80; first.aggro = 18; }
    } else if (n === 3) {
      this.ambush(rt);   // まず河原の防戦地点を示し、救援の知らせで信親へ（kyuen.js）
    } else if (n === 4) {
      // 11/8 五3・九1：退く段でカメラが後ろの追手に付き、行き先の▼が画面の下の端に張り付いて後ろを指した。退く段は走る向きを見る
      rt.def.autoTargetCamera = false;
      rt.marker('ford', () => shingari.pin(rt, K), '戸次川の浅瀬');
      shingari.start(rt, K);   // 浅瀬の口の殿（t06_hetsugi/shingari.js）
      // P4（K410 kaito 11/20「浅瀬や陣まで退いたのにクリアにならない。終わりが無いように感じる」）：退きはピンの連なり。
      //   北口に着いたら「済」→四秒で渡る下知、南の岸に着いたら「済」→西の岸、西の岸に着いたら「済」→締め（checkpoint_chain.js）
      cpStart(rt, [
        { x: shingari.MOUTH_N.x, z: shingari.MOUTH_N.z, r: 16, label: '浅瀬の口', onReach: () => rt.after(4, () => { if (F.step === 4) shingari.releaseNow(rt); }) },
        { x: FORD.x, z: 34, r: 14, label: '浅瀬の南の岸' },
        { x: SAFE.x, z: SAFE.z, r: 9, label: '西の岸' },
      ]);
      sfx('horagai', 0.8);
      this.otomoCamp(rt);
      // 11/8 一5・九2：夜の土手で本人だけが下の瀬の島津に囲まれた。先に崩れて落ちた仙石・長宗我部の者が土手で息をつき、本人が渡り終えると鏡城へ落ちていく
      //   （本人が北の岸の百 m 余り先にいる間に置く。目の前に急に出さない）。鶴賀城の城兵は二百 m の奥で見えないので去らせて枠を空ける
      for (const g of rt.army.groups) if (g.name === '鶴賀城の城兵') for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
      //   落ち武者は下の瀬の口から七十 m 余り川下の土手に置く（近いと、本人が来る前に川原へ下りて下の瀬の島津と斬り合いを始めた）
      F.strays = [[{ x: -92, z: 62 }, 'chosokabe'], [{ x: -112, z: 68 }, SEN_FLAG]].map(([p, flag]) => {
        const g = allyGroup(rt, { name: flag === SEN_FLAG ? '仙石の落ち武者' : '長宗我部の落ち武者', anchor: p, facing: -Math.PI / 2, width: 4, aggro: 8, seekRange: 9, speed: 3.0, order: 'hold', noRout: true, dmgMult: 0.7 },
          fl([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }], flag));
        g.mon = flag; g.historicalOrders = true; g.walkSpeed = 2.2; return g;   // 傷を負って足が遅い（追手に追い付かれる）
      });
      // 11/9 七：フロイス「他国の者は浅瀬を知らず、多くが溺れた」。浅瀬を外れて深みへ入る土佐の者（本人の渡る浅瀬の川下、四十 m 余り）
      F.deep = allyGroup(rt, { name: '浅瀬を外れた者', anchor: { x: -30, z: -16 }, facing: 0, width: 4, aggro: 0, seekRange: 0, speed: 2.4, order: 'move', noRout: true },
        fl([{ type: 'ashigaru', n: 5, o: { flagScale: 1 } }], 'chosokabe'));
      F.deep.mon = 'chosokabe'; F.deep.historicalOrders = true; F.deep.dest = { x: -30, z: 40 }; F.drown = 0;
      // 包みの島津は河原まで追う
      for (const b of [B.niiro, B.honjo, B.ieh, B.ijuin]) this.go(b, { x: FORD.x + (b === B.honjo ? 30 : b === B.niiro ? -20 : 0), z: -18 }, 2.2, { charge: true });
    } else if (n === 5) {
      // ⑤からの途中再開では④の見回りを通らず、十河の討死が予約されない。
      // 通常の渡河で予約済みなら重ねず、再開時にも最期の知らせを経て締める。
      if (!F.sogoDead && !F.s4?.fallQueued) {
        if (F.s4) F.s4.fallQueued = true;
        rt.after(9, () => this.sogoFall(rt));
      }
      rt.marker('camp', SAFE, '西の岸');
      rt.say(F.mine.leader?.name || '手勢の侍', '渡れ！　振り返るな、岸へ上がれ！', 3);
      // K355（11/18 クラウド k365-26・センゴク権兵衛 9〜10巻の読み）：夜の川越えの冷たさと雪（台詞だけ）
      rt.after(4.5, () => { if (!F.ending) rt.say('土佐の足軽', '胸まで水じゃ……槍を立てよ、前の背だけ見て渡れ', 2.8); });
      rt.after(12, () => { if (!F.ending) rt.say('手勢の侍', '雪じゃ……日が落ちる。濡れたまま止まれば凍えるぞ', 2.8); });
      // 11/18 クラウド持ち主：台詞だけだった雪を絵でも。退きの川越えから小雪を降らせ、少しずつ増やす（三方ヶ原と同じ world_rain.js の粒・地面は積もらせない）
      if (rt.world?.def) {
        rt.world.def.snow = 0.12;
        rt.after(10, () => { if (rt.world?.def) rt.world.def.snow = 0.3; });
        rt.after(30, () => { if (rt.world?.def) rt.world.def.snow = 0.45; });
      }
      // 島津は川を全軍で渡っては来ない。水辺に並んで止まる（もう勝っていて、無理をしない）
      this.bankHold(rt);
      // 落ちる四国の衆の残りも土手の道を鏡城へ。陣外で止めず、東の口をまっすぐ通って陣内へ入る。
      const road = [{ x: -60, z: 52 }, { x: -120, z: 70 }, { x: CAMP.x + 17, z: CAMP.z }, { x: CAMP.x + 5, z: CAMP.z }];
      const walk = (g, k) => {
        if (!live(g)) return;
        if (k >= road.length) { g.order = 'hold'; g.anchor = { ...road[road.length - 1] }; g.dest = null; g.onArrive = null; return; }
        const p = road[k];
        g.order = 'move'; g.dest = { x: p.x + (k < 2 ? (Math.random() - 0.5) * 6 : 0), z: p.z + (k < 2 ? (Math.random() - 0.5) * 4 : 0) };
        g.speed = g.walkSpeed || 3.8; g.aggro = 8; g.seekRange = 8; g.onArrive = () => walk(g, k + 1);
      };
      for (const g of [F.nobu, F.tsune, ...(F.allyBands || [])]) if (live(g)) {
        // 殿の下知が限界で解かれた時は、まだ北岸や川の中に味方が残る。
        // 本人の渡河だけで土手へ直進させず、残兵も浅瀬を渡り終えてから陣へ退く。
        const c = g.center();
        if (c.z > 26) { walk(g, 0); continue; }
        const south = (q) => {
          q.order = 'move'; q.dest = { x: FORD.x, z: 40 };
          q.onArrive = (r) => walk(r, 0);
        };
        g.focus = null; g.speed = 3.6;
        if (c.z > -24 && Math.abs(c.x - FORD.x) < FORD.w - 6) south(g);
        else {
          g.order = 'move'; g.dest = { x: FORD.x, z: -24 };
          g.onArrive = south;
        }
      }
      for (const g of F.strays || []) walk(g, 1);
    }
  },

  // 十河存保は殿に残り、本人が川を渡る間に討死の知らせ（信親と別の死。姿は見せない。shingari.js の release から）
  sogoFall(rt) {
    const F = rt.flags, B = F.blk;
    if (F.sogoDead || F.ending) return;
    F.sogoDead = true;
    if (F.sogoU?.alive) { F.sogoU.invuln = false; rt.army.kill(F.sogoU, null); }
    // 生き残った旗本まで消さず、殿の持ち場から浅瀬を通って退かせる。
    const g = F.sogo;
    if (live(g)) {
      const c = g.center();
      const crossing = c.z > 26 || (c.z > -24 && Math.abs(c.x - FORD.x) < FORD.w - 6);
      g.order = 'move'; g.focus = null;
      g.dest = { x: FORD.x, z: crossing ? 40 : -24 }; g.speed = 3.6; g.aggro = 6; g.seekRange = 6;
      // 討死の知らせが⑤より後でも、残った旗本を南岸に置き去りにしない。
      const home = (q) => {
        q.order = 'move'; q.dest = { x: CAMP.x + 17, z: CAMP.z };
        q.onArrive = (r) => {
          r.order = 'move'; r.dest = { x: CAMP.x + 5, z: CAMP.z }; r.onArrive = null;
        };
      };
      g.onArrive = crossing ? home : (q) => { q.order = 'move'; q.dest = { x: FORD.x, z: 40 }; q.onArrive = home; };
    }
    if (B.sogo && !B.sogo.routedL) routButai(B.sogo, 30);
    rt.say('使番', '十河存保殿、討死！', 2.8);
  },

  // 島津の兵は北の岸の水辺へ戻って並び、南を向いて止まる（追って来ない）
  bankHold(rt) {
    const F = rt.flags, B = F.blk;
    // 水辺への下知は一度だけ。見回りのたびに移動を作り直さない。
    if (!F.bankBlocksHeld) {
      F.bankBlocksHeld = true;
      for (const b of [B.niiro, B.honjo, B.ieh, B.ijuin, B.ura]) if (b && !b.routedL) { const p = lightPos(b); this.go(b, { x: Math.max(FORD.x - 70, Math.min(FORD.x + 70, p.x)), z: -40 }, 2.0); }
    }
    let i = 0;
    for (const g of rt.army.groups) {
      if (g.team !== 1 || !g.count || g.bankHold || g === F.ieh || g === F.iehS) continue;
      g.bankHold = true;
      // 整列後に共通の頭が近い味方を見て攻撃を再開しない。移動は続け、着いた水辺を守る。
      g.fixed = true; g.stay = true;
      const c = g.center(), x = Math.max(FORD.x - 36, Math.min(FORD.x + 36, c.x + (i++ % 2 ? 6 : -6)));
      const z = -22 - (i % 3) * 5;
      g.focus = null; g.aggro = 0; g.seekRange = 0; g.order = 'move'; g.dest = { x, z }; g.speed = 3.2; g.feint = false;
      g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x, z }; q.dest = null; q.facing = 0; q.onArrive = null; };
    }
    // 11/19 02:30 持ち主（歴史好き bot 600秒：島津豊久の旗本・遠くの備が水辺への move のまま進めず立った）：八秒で一 m も寄れない組は、今の所で水辺の構えに替える
    for (const g of rt.army.groups) {
      if (!g.bankHold || g.order !== 'move' || !g.dest || !g.onArrive || !g.count) continue;
      const c = g.center(), d = Math.hypot(c.x - g.dest.x, c.z - g.dest.z);
      // 11/19 07:15 持ち主（歴史好き bot 585秒：鈴木大膳の手4・島津豊久の旗本2 が水辺の六 m 手前で move のまま立った）→六 m 内は着いたと見る・寄れない待ちは八→四秒
      if (d > 6 && (g._bhD == null || d < g._bhD - 1)) { g._bhD = d; g._bhT = rt.t; continue; }
      if (d <= 6 || rt.t - g._bhT > 4) { const f = g.onArrive; g.dest = { x: c.x, z: c.z }; f(g); g.anchor = { x: c.x, z: c.z }; }
    }
  },

  // 先手が退くふり：伊集院の備が尾根の西の陰へ退き、四国の衆が追う
  feign(rt) {
    const F = rt.flags, B = F.blk;
    if (F.feigned) return;
    F.feigned = true; F.feignT = rt.t;
    tsuigeki.feign(rt, K);   // 伊集院の備が退き、四国の衆はまず囲みの陣まで追う
    // 本物の先手も背を見せて中津留の河原の奥（尾根の西の陰）へ退く。追う四国の衆と本人を包みの中へ釣る
    for (const [i, g] of (F.ijBands || []).entries()) if (live(g)) { g.order = 'move'; g.dest = { x: 8 + i * 22, z: -128 }; g.speed = 3.0; g.feint = true; g.focus = null; }
  },

  // 8:00 島津が止まる（11/9 夜 kaito の一番の場面）：退いていた先手が止まり、曲が消えて風と鎧の音だけになる。
  //   一人、二人、そして先手の全部がこちらへ向き直る。字幕で「釣り野伏せ」とは教えない。六秒半の後に法螺と太鼓（ambush）
  halt(rt) {
    const F = rt.flags, B = F.blk;
    if (F.haltT) return;
    F.haltT = rt.t;
    // 到着と同時に追撃の下知を止める。反転の間も追えの札で待たせない。
    F.mText = '島津の動きを見極めろ'; rt.obj('main', F.mText, 'main', true);
    try { hush(9); } catch (e) { /* 音は飾り */ }
    // 塊はその場で止まる（四国の衆も一瞬止まる）
    for (const b of [B.ijuin, B.sen, B.nobu, B.sogo]) if (b && !b.routedL) this.go(b, lightPos(b), 1);
    const bands = [...F.followFoe.map(([g]) => g), ...(F.ijBands || [])].filter(live);
    for (const g of bands) {
      const c = g.center();
      g.order = 'hold'; g.dest = null; g.focus = null; g.aggro = 0; g.seekRange = 0; g.anchor = { x: c.x, z: c.z }; g.facing = Math.PI;
    }
    // 11/19 係（kaito 11/19「勝ったと思ったら追い打ちをするが、『罠かもしれない、追撃やめろ』の声。そうしたら一気に全部囲まれる」）
    rt.say('長宗我部元親', '待て、罠かもしれぬ。追うな！', 2.6);
    rt.after(2.8, () => rt.say('手勢の侍', '……止まった？', 2.4));
    // 一人ずつ振り返る（組の頭から、間を置いて）
    let k = 0;
    for (const g of bands) for (const u of g.units) {
      if (!u.alive || u.gone) continue;
      const t = 2 + Math.min(3.2, k++ * 0.14 + (k < 3 ? k * 0.6 : 1.2));
      rt.after(t, () => { if (u.alive && !u.gone) { u.heading = 0; g.facing = 0; } });
    }
    rt.after(5.2, () => rt.say('土佐の足軽', 'こっちを、向いた……', 2.2));
    // 11/20 K406（kaito「包囲は急に知るのではなく気づけるように。太鼓がどんどん鳴り出し、一気に迫って囲まれたと分かる」）・P3：
    //   静まった一秒後から、両の林・家久の本隊の尾根・南の退き口・鶴賀の尾根の陰の遠い太鼓が鳴り出して間を詰め、伏せの法螺（6.5秒）へつなぐ。
    //   同じ間に、伏せの組が出る所の稜線へ島津の幟がせり上がって並ぶ（字は出さない）
    //   （前の版の sfx('taiko') 五つ打ちは太鼓の間引き（八秒に一つ）で初めの一つしか鳴らなかったので、包囲の合図の部品に替えた）
    //   林の奥では木に隠れて見えなかったので、幟は林の縁（伏せの組が出る所）に立てる（ridge: false）
    // 11/21 k365-cloud-48（司令塔の決め・案A：伏兵が左右から出るのが絵で分かるように）：本人が先手を追って南を向くと、両の林は真横〜後ろで
    //   出る瞬間が画面の外だった（カメラは入力無しに動かさない決まり）。止まった時の本人の前（退くふりの先手の方）から左右45度・40m 先を
    //   伏せの組と幟の出る所にする（兵の数・組の数は変えない）。前が取れない時は今までの林の縁
    { const me = rt.player?.u, fb = bands.length ? bands.reduce((a, g) => { const c = g.center(); a.x += c.x / bands.length; a.z += c.z / bands.length; return a; }, { x: 0, z: 0 }) : null;
      if (me?.pos && fb) {
        let fx = fb.x - me.pos.x, fz = fb.z - me.pos.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
        const side = (a) => { const c = Math.cos(a), s = Math.sin(a), dx = fx * c - fz * s, dz = fx * s + fz * c; return { x: Math.max(-300, Math.min(300, me.pos.x + dx * 40)), z: Math.min(-24, me.pos.z + dz * 40) }; };
        F.ambL = side(Math.PI / 4); F.ambR = side(-Math.PI / 4);
      } }
    const ambFrom = F.ambL && F.ambR ? [F.ambL, F.ambR] : [{ x: WOODS[0].x + 16, z: WOODS[0].z + 2 }, { x: WOODS[1].x - 16, z: WOODS[1].z + 4 }];
    // K354（すすきの原の伏兵を鳥で知らせる）：法螺の三秒前、左前・右前の原から烏が飛び立つ（本人から離れる向きへ）
    { const P = rt.player?.u?.pos;
      for (const [i, p] of ambFrom.entries()) rt.after(3.2 + i * 0.5, () => { if (F.step !== 2 || !p) return; const ax = P ? p.x - P.x : 0, az = P ? p.z - P.z : -1; this.flushBirds(rt, p, 14, { x: ax, z: az }); }); }
    rt.after(1, () => encircleWarn(rt, { center: RING, flag: 'shimazu', lead: 5.3, ridge: false, per: 7, from: [...ambFrom, { x: RING.x + 6, z: RING.z - 44 }, { x: RING.x, z: RING.z + 44 }, { x: CASTLE.x + 30, z: -40 }] }));
  },

  ambush(rt) {
    const F = rt.flags, B = F.blk;
    rt.unmark('go');
    if (K285_TOUCH && MEM_BUDGET.real) this.memTrim(rt, 70);   // K564：伏せで一度に七十〜九十人立つ（mem=4 の描かずの数え 210秒 297）→先に遠くで待つ兵を空けておく
    kyuen.install(rt, K);
    B.niiro = this.block(rt, { key: 'niiro', name: '新納大膳の備', team: 1, flag: 'shimazu', at: WOODS[0], facing: Math.PI / 2, w: 44, d: 14 });
    B.honjo = this.block(rt, { key: 'honjo', name: '島津豊久の備', team: 1, flag: 'shimazu', at: WOODS[1], facing: -Math.PI / 2, w: 34, d: 10 });
    B.ieh = this.block(rt, { key: 'ieh', name: '島津家久の本隊', team: 1, flag: 'shimazu', at: IEHISA, facing: 0, w: 40, d: 14 });
    this.go(B.niiro, { x: RING.x - 30, z: RING.z + 4 }, 2.6, { charge: true });
    this.go(B.honjo, { x: RING.x + 62, z: RING.z + 6 }, 2.6, { charge: true });
    this.go(B.ieh, { x: RING.x + 4, z: RING.z - 34 }, 2.0, { charge: true });
    this.go(B.ijuin, { x: RING.x + 20, z: RING.z - 22 }, 2.4, { charge: true });
    this.foeLord(rt, '新納大膳亮', B.niiro, WOODS[0]);
    this.foeLord(rt, '島津豊久', B.honjo, WOODS[1]);
    // 包む本物の兵（11/7 二3・九2：林から出る所と三方から寄せる所が見えなかった）。両の林の縁と尾根の陰から、河原の信親の備へ
    const att = { order: 'attack', seekRange: 40, aggro: 14 };
    const toRing = (p) => Math.atan2(RING.x - p.x, RING.z - p.z);
    // 案A（k365-cloud-48）：伏せの組は止まった時の本人の左前・右前から出る（無ければ今までの林の縁）
    const aL = F.ambL || { x: WOODS[0].x + 14, z: WOODS[0].z - 6 }, aR = F.ambR || { x: WOODS[1].x - 14, z: WOODS[1].z + 6 };
    const bandN = K285_TOUCH && MEM_BUDGET.real ? 7 : 10;   // K564 記憶の予算の携帯は七人（伏せで一度に立つ数を詰める）
    for (const p of [aL, { x: aL.x - 4, z: aL.z + 10 }]) this.foeBand(rt, '新納大膳の手', p, toRing(p), bandN, att);
    for (const p of [aR]) this.foeBand(rt, '島津豊久の手', p, toRing(p), bandN, att);
    for (const p of [{ x: RING.x + 6, z: RING.z - 42 }]) this.foeBand(rt, '島津家久の手', p, 0, bandN, att);
    // 11/17 K352 kaito「包囲されたと感じない・信親が死ぬほどの全方位の包囲に」：南（渡ってきた浅瀬への道）にも島津が回り込み、退き口を塞ぐ。
    //   三組が河原の南の縁に並び、輪の内へ寄せる（字で教えず、振り返ると後ろにも島津の旗が見える）
    for (const p of [{ x: RING.x - 30, z: RING.z + 36 }, { x: RING.x + 2, z: RING.z + 44 }, { x: RING.x + 32, z: RING.z + 36 }]) {
      const g = this.foeBand(rt, '回り込む島津', p, toRing(p), K285_TOUCH && MEM_BUDGET.real ? 8 : 12, { ...att, seekRange: 26 });   // K564 記憶の予算の携帯は九人
      F.backRing = F.backRing || []; F.backRing.push(g);
    }
    rt.after(6, () => rt.say('長宗我部元親', '後ろを断たれたか！　四方が島津じゃ', 3));
    // 11/8 二3：包みの兵は近い四国の衆に取り付いて、信親の備（本人の周り）まで寄らずに一分近く遠くで戦っていた。まず信親の馬印へ駆け、着いてから斬り合う
    const N = F.nobuU?.alive ? F.nobuU.pos : RING;
    for (const g of F.foes) if (/新納大膳の手|島津豊久の手|島津家久の手/.test(g.name) && !g.toNobu) {
      g.toNobu = true; if (g.name === '島津豊久の手') g.dmgMultPlayer = Math.min(g.dmgMultPlayer ?? g.dmgMult ?? 1, 0.5);   // 11/18 K358 中学生 bot：包囲で豊久の手が本人へ一太刀 0.8 で二戦とも倒れた→本人への一太刀を 0.5 に
      const c = g.anchor, dx = c.x - N.x, dz = c.z - N.z, d = Math.hypot(dx, dz) || 1;
      g.order = 'move'; g.dest = { x: N.x + dx / d * 9, z: N.z + dz / d * 9 }; g.speed = 3.8;
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 60; q.aggro = 14; if (q.name === '島津家久の手') q.focus = rt.player.u; };
    }
    // 退くふりの先手も向き直って打ち掛かる
    for (const g of F.ijBands || []) if (live(g)) { g.order = 'attack'; g.seekRange = 40; g.aggro = 14; g.dest = null; g.feint = false; }
    // 林の縁に膝をつく島津の鉄砲衆（本物）。伏せの始まりは鉄砲と矢（フロイス：土佐の衆は撃ち返す暇も無かった）
    for (const [i, w] of WOODS.entries()) {
      const am = i === 0 ? F.ambL : F.ambR;   // 案A：鉄砲衆も伏せの組の出る所の脇に膝をつく
      const gx = am ? am.x + (i === 0 ? 6 : -6) : w.x + (RING.x - w.x) * 0.3, gz = am ? am.z : w.z + (RING.z - w.z) * 0.3;
      const guns = enemyGroup(rt, { faction: 'shimazu', name: '島津の鉄砲衆', anchor: { x: gx, z: gz }, facing: Math.atan2(RING.x - gx, RING.z - gz), width: 7, formation: 'line', noRout: true,
        morale: 90, dmgMult: 0.9, order: 'hold', aggro: 8, seekRange: 45, speed: 2.6 },
      [{ type: 'gun', n: (K285_TOUCH && MEM_BUDGET.real ? 4 : 6) + i }, { type: 'samurai', n: 1 }]);
      guns.gunLine = true; F.foes.push(guns);
    }
    // 総大将の島津家久は後ろの本陣の床几に座って動かない（AR3・AV7）。旗本二十五人が前を固める。史実で討たれていないので討てない
    // 幕の前に二列で置く。幅十五の一列は両端が幕の脇に掛かり、戻る兵が床几の後ろで重なっていた。
    F.ieh = enemyGroup(rt, { faction: 'shimazu', name: '島津家久の旗本', anchor: { x: SEAT.x, z: SEAT.z + 18 }, facing: 0, width: 8, formation: 'line', noRout: true,
      morale: 100, dmgMult: 0.5, order: 'hold', fixed: true, aggro: 6, seekRange: 10, speed: 2.4 },
    [{ type: 'samurai', n: 8, o: { keep: true } }, { type: 'ashigaru', n: 6, o: { flagScale: 1, keep: true } }, { type: 'gun', n: 2 }]);
    F.ieh.kind = 'main'; F.ieh.stay = true; F.foes.push(F.ieh);
    // 旗本は上の別隊。自動の供回りまで床几の一点へ座らせない。
    F.iehS = enemyGroup(rt, { faction: 'shimazu', name: '島津家久の本陣', anchor: SEAT, facing: 0, width: 1, noRetinue: true, aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true },
      [{ type: 'busho', n: 1, o: { name: '島津家久', invuln: true, horse: false, keep: true } }]);
    F.iehS.stay = true; F.iehS.noAI = true;
    for (const u of F.iehS.units) {
      u.invuln = true; u.noTarget = true;
      u.pos.set(SEAT.x, rt.world.heightAt(SEAT.x, SEAT.z), SEAT.z + 0.35); u.mesh.position.copy(u.pos);
      u.jinchu = { standing: false, t: 99, len: 1, soldiers: [] };
    }
    // 四国の衆は不意を突かれて士気が落ちる
    for (const b of [B.sen, B.nobu, B.sogo]) if (b) b.morale = Math.min(b.morale, 48);
    // 後ろにも別の島津（鶴賀城の尾根の陰から、渡ってきた浅瀬への道の脇へ）。字の知らせより先に旗で分からせる
    B.ura = this.block(rt, { key: 'ura', name: '島津の後詰め', team: 1, flag: 'shimazu', at: { x: CASTLE.x + 30, z: -40 }, facing: -Math.PI / 2, w: 26, d: 8 });
    this.go(B.ura, { x: 72, z: -44 }, 2.2, { charge: true });
    sfx('horagai', 1);
    // 11/20 K467 クラウド kaito2（cloud-47 の三方ヶ原の形）：包囲の始まりに、布陣の表の島津の太い塊のうち本人に近い六つも
    //   輪の縁（本人と河原の真ん中の間）へ一度に走り込み、筋書きの組と合わせて大勢で四方から寄せる（兵は足さない）
    { const P = rt.player?.u?.pos || RING; chargeFujinBlocks(rt, { x: (P.x + RING.x) / 2, z: (P.z + RING.z) / 2 - 14 }, { n: 6, min: 4, maxD: 160 }); }   // 戸次川の布陣の塊は一つ六人（三方ヶ原の四十四人と違う）ので、近い順に六つ
    F.mText = '包囲を突破せよ'; rt.obj('main', F.mText, 'main', true);
    rt.army.play('toki', F.ambL || WOODS[0], 1.5); rt.after(0.4, () => rt.army.play('toki', F.ambR || WOODS[1], 1.5));   // 案A：声も出る所から
    for (const [i, w] of WOODS.entries()) rt.after(0.8 + i * 0.5, () => { const a = i === 0 ? F.ambL : F.ambR; rt.army.play('volley', a || { x: (w.x + RING.x) / 2, z: (w.z + RING.z) / 2 }, 1.2); });
    sfx('taiko', 1);
    rt.say('長宗我部の侍', '伏兵！　両の林から島津じゃ！', 3);
    rt.after(4, () => rt.say('物見', '後ろにも島津の旗！', 2.6));
    rt.after(9, () => rt.say('土佐の足軽', '……こいつら、何なんだ。', 2.4));
    rt.after(12, () => rt.say('長宗我部の侍', '島津だ。', 2));
    // 11/18 K306（権兵衛9巻：薩摩の兵は鉄砲にも振り向かず、太刀で斬りかかる）
    // 11/18 k41：17.5秒は伏せの声が十を超えて重なり字幕が20秒遅れた（描かずの通しの待ち列を数えた）→声の途切れる80秒へ
    rt.after(80, () => { if (F.step === 3) rt.say('土佐の足軽', '撃たれても止まらぬ！　島津の者は太刀を抜いて真っ直ぐ斬り込んで来る！', 3); });
    rt.after(14, () => { if (F.tsuneU?.alive) rt.say('戸次統常', '父の汚名、ここで雪ぐ。戸次の者、退くな！', 3); });
    // 仙石の隊が先に崩れる（史実：仙石は讃岐まで逃げた）
    rt.after(32, () => {
      if (F.step !== 3) return;
      rt.say('仙石秀久', 'ええい、退け、退け！', 2.5);
      routButai(B.sen, 26);
      if (live(F.sen)) {
        // 囲みの陣の小屋（39,-66）の北を回ってから浅瀬へ。
        // 直接南へ下がると、小屋の角（42,-70）で仙石が止まっていた。
        F.sen.order = 'move'; F.sen.focus = null; F.sen.dest = { x: F.sen.center().x, z: -82 }; F.sen.speed = 4.4;
        F.sen.arriveRadius = 6;
        F.sen.onArrive = (q) => {
          q.order = 'move'; q.dest = { x: FORD.x, z: -82 };
          q.onArrive = (r) => {
            r.order = 'move'; r.dest = { x: FORD.x, z: -24 };
            r.onArrive = (s) => {
              s.order = 'move'; s.dest = { x: FORD.x, z: 40 };
              s.onArrive = (t) => { t.order = 'move'; t.dest = { x: CAMP.x + 12, z: CAMP.z + 12 }; t.onArrive = null; };
            };
          };
        };
      }
      F.follow = F.follow.filter((f) => f[0] !== F.sen);
    });
  },

  // 包みが閉じる：十河・信親が討たれる（史実どおり。主人公には救えない）
  closeRing(rt) {
    const F = rt.flags, B = F.blk;
    if (F.ringClosed) return;
    F.ringClosed = true;
    const fall = (u, who, by) => {
      if (!u || !u.alive) return;
      u.invuln = false;
      // 史実の討死は、旗本が残る武将を踏みとどまらせる共通処理より優先する。
      // 鈴木の刃を渡す時も、信親を生かしたまま討死の知らせだけ出さない。
      u.officerSaved = true;
      rt.army.kill(u, by || null);
      rt.banner(`${who}、討死`, '');
    };
    rt.after(1.4, () => fall(F.tsuneU, '戸次統常'));
    // 11/17 K352 kaito「将が次々討死→信親だけが最後に残り、自分も信親を置いて退く気持ちを味わう」：信親はここでは倒さない。
    //   本人が信親から四十 m 離れるか二十五秒たつと、後ろで信親が討たれる（nobuFall。update から）。殿として最後まで斬り結ぶ
    F.nobuLeaveT = rt.t; F.nobuFallFn = fall;
    // 夜へ移ろう（包みの段の六十秒から。まだなら今から。四6）
    if (!F.nightGo) { F.nightGo = true; rt.world.setTime?.('night'); }
    rt.after(3.8, () => { if (F.nobuU?.alive) rt.say('長宗我部信親', '父上を頼む。ここは信親が引き受けた！', 3); });
    F.follow = [];
    // 西の林から南岸へ直進すると浅瀬を外れる。北の口へ集まり、浅瀬をまっすぐ戻る。
    for (const g of [F.nobu, F.tsune, ...(F.allyBands || [])]) if (live(g)) {   // 十河は④で殿に残る（別の死。shingari.js）
      // 川に近いだけでは渡河中としない。浅瀬の外から斜めに深みへ入るのを防ぐ。
      // 隊列の横幅を残し、浅瀬に入った隊と渡り終えた隊は口へ呼び戻さない。
      const c = g.center();
      const crossing = c.z > 26 || (c.z > -24 && Math.abs(c.x - FORD.x) < FORD.w - 6);
      g.order = 'move'; g.focus = null; g.dest = { x: FORD.x, z: crossing ? 40 : -24 }; g.speed = 3.6; g.aggro = 6; g.seekRange = 6;
      g.onArrive = crossing ? null : (q) => { q.order = 'move'; q.dest = { x: FORD.x, z: 40 }; q.onArrive = null; };
      // 11/16 クラウドし act bot：信親の旗本が敵4mで退きの行き先へ20秒動けず止まる（568秒×3）。
      //   『元親記』では信親の旗本は主の骸の周りで斬り死にした。岸の南で敵と組み合っている時は退かず、その場で斬り結ぶ
      if (g === F.nobu && !crossing && rt.army.groups.some((e) => e.team === 1 && e.count && e.units.some((u) => u.alive && Math.hypot(u.pos.x - c.x, u.pos.z - c.z) < 14))) {
        g.order = 'attack'; g.dest = null; g.onArrive = null; g.aggro = 16; g.seekRange = 16; F.nobuStand = true;
      }
    }
    // 元親も渡りの手前から落ちていく（史実：伊予の日振島へ逃れた）
    F.motoReturn = lightPos(B.moto).z > 26 ? 2 : 0;
    this.go(B.moto, MOTO_RETURN[F.motoReturn], 2.6, { back: true });
    // 元親の旗本は kyuen.js の retreatMoto で浅瀬を通って退いている（ここで斜めに川へ入れない）
    rt.after(6.4, () => rt.say('長宗我部元親', '弥三郎が……。退け、退くのじゃ', 3));
    rt.after(5, () => this.toStep(rt, 4));
  },

  // 信親の最期：本人が離れてから後ろで（K352）
  nobuFall(rt) {
    const F = rt.flags, B = F.blk;
    if (F.nobuFallen) return;
    F.nobuFallen = true;
    const duel = F.s3?.bladesMet && F.suzukiU?.alive;
    F.nobuFallFn?.(F.nobuU, '長宗我部信親', duel ? F.suzukiU : null);
    routButai(B.nobu, 30);
    rt.say('使番', '信親様、討死！', 2.4);
    if (duel) rt.after(1.2, () => rt.say('鈴木大膳', '長宗我部信親、討ち取ったり！', 2.2));
    rt.after(2.2, () => rt.say(F.mine.leader?.name || '手勢の侍', `${nm(rt)}殿、信親様が……！　振り返らずに退かれよ`, 3.2));
  },
  // 信親の最期（11/7 十二4：声だけだった）。鈴木大膳の手が尾根の側から信親の旗本へ斬り込み、信親は大長刀で斬り結ぶ
  lastStand(rt) {
    const F = rt.flags, u = F.nobuU;
    if (F.suzuki || !u?.alive) return;
    const at = { x: u.pos.x + 6, z: u.pos.z - 18 };
    F.suzuki = enemyGroup(rt, { faction: 'shimazu', name: '鈴木大膳の手', anchor: at, facing: 0, width: 4, formation: 'line', noRout: true,
      morale: 100, dmgMult: 0.5, order: 'attack', seekRange: 30, aggro: 14, speed: 3.4 },
    [{ type: 'busho', n: 1, o: { name: '鈴木大膳', keep: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 5 }]);
    F.suzuki.kind = 'main'; F.suzuki.focus = u; F.foes.push(F.suzuki);
    F.suzuki.ringSoft = true; F.suzuki.dmgMultPlayer = 0.3;   // 11/19 持ち主（中学生 bot 479秒：包みの手加減（本人へ0.3）の後に出るので鈴木の手だけ本人へ0.5＝一太刀24、他の島津の三倍近く・受けた傷の六割）：包囲の島津と揃える。信親の旗本への刃は0.5のまま
    // K352：将が次々討たれる。信親の最期の斬り込みの十八秒後、信親の脇の戸次統常が先に討死（信親は最後に残る）
    rt.after(18, () => { const T = F.tsuneU; if (T?.alive && !F.ending) { T.invuln = false; T.officerSaved = true; rt.army.kill(T, null); rt.banner('戸次統常、討死', ''); rt.say('使番', '戸次統常様、討死！', 2.4); } });
    F.suzukiU = F.suzuki.units.find((s) => s.type === 'busho');
    if (F.suzukiU) { F.suzukiU.mustLive = true; F.suzukiU.noTarget = false; }
    // 信親も斬り込んだ相手へ向く。備の持ち場への追従で鈴木から離れ続けない。
    if (F.suzukiU && live(F.nobu)) {
      F.follow = F.follow.filter(([g]) => g !== F.nobu);
      F.nobu.order = 'attack'; F.nobu.dest = null; F.nobu.focus = F.suzukiU;
    }
    rt.army.play('toki', at, 1.2);
    rt.say('長宗我部信親', '退かぬ。信親はここで斬り死にいたす！', 3);
    rt.after(6, () => rt.say(F.mine.leader?.name || '手勢の侍', '尾根の陰から新手じゃ！　信親様の馬印へ寄れ！', 3));
  },

  // 空の塊（noFake）の歩み：go で決めた行き先へ、なめらかに置き場（lightPos）を動かす
  tickEmpty(rt, dt) {
    for (const b of rt.flags.blocks || []) {
      const T = b._tw, A = b.light?.army;
      if (!T || !A) continue;
      if (b.routedL) { b._tw = null; continue; }
      T.t += dt;
      const k = Math.min(1, T.t / T.secs), e = k * k * (3 - 2 * k);
      A.off.x = T.fx + (T.tx - T.fx) * e - A.cx;
      A.off.z = T.fz + (T.tz - T.fz) * e - A.cz;
      if (k >= 1) b._tw = null;
    }
  },

  // K564：本物の兵を記憶の予算（MEM_BUDGET.real）から room を引いた数まで、遠くで待つ組の名の無い兵を外す（update と伏せの始まり）
  memTrim(rt, room) {
    const F = rt.flags;
    let over = room - MEM_BUDGET.real; for (const u of rt.army.units) if (u.alive && !u.gone && u.type !== 'porter') over++;
    if (over <= 0 || !rt.player?.u) return;
    const me = rt.player.u.pos, cam = rt.camera?.position, pt = rt.player.u.team;
    //   伏せの後（三の段）で越える時は、味方は持ち場で待つ組でなくとも、本人とカメラから四十m 外で斬り合っていない組を三人まで（四方を囲まれた四国の衆が散った形）
    for (const [ally, R, keep, any] of [[true, 60, 3, false], [false, 80, 5, false], [true, 40, 3, F.step >= 3]]) {
      if (over <= 0) break;
      if (any === false && R === 40) break;
      const far = (p) => Math.hypot(p.x - me.x, p.z - me.z) > R && (!cam || Math.hypot(p.x - cam.x, p.z - cam.z) > R);
      const gs = [];
      for (const g of rt.army.groups) {
        if (g.isPlayerSquad || g === F.mine || g.routed || (!any && g.order !== 'hold') || !g.units || (g.team === pt) !== ally) continue;
        const us = g.units.filter((u) => u.alive && !u.gone);
        //   名のある将の旗本・馬廻（元親・信親・家久…）の組は空けない（K409「最後まで馬廻が守る」・空けた後に供が補われて初めの数を越えていた）
        if (us.length <= keep || us.some((u) => u.type === 'busho' || u.name || u.atk || u.fleeing || u.isPlayer || (u.target && u.target.alive && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 30) || !far(u.pos))) continue;
        let cx = 0, cz = 0; for (const u of us) { cx += u.pos.x; cz += u.pos.z; }
        gs.push({ us, d: Math.hypot(cx / us.length - me.x, cz / us.length - me.z) });
      }
      gs.sort((a, b) => b.d - a.d);
      for (const { us } of gs) {
        if (over <= 0) break;
        const cut = us.filter((u) => !u.name && !u.isPlayer && !u.isSub && !u.invuln && !u.mustLive && !u.mounted && !u.stdHeld && !u.isStandard && !u.keep && u.type !== 'busho').reverse();
        for (let k = 0; k < cut.length && over > 0 && us.length - k > keep; k++) { try { rt.army.despawn(cut[k]); over--; } catch (e) { /* そのまま */ } }
      }
    }
  },

  update(rt, dt) {
    const F = rt.flags, B = F.blk;
    this.flushBirdsTick(rt, dt);
    if (F.ending || !F.step) return;
    // 11/22 クラウド 戸次川の持ち主（K564 落ちない）：記憶4GB 以下の携帯（MEM_BUDGET.real 205）で本物の兵が予算を越えた（mem=4 の描かずの数えで
    //   30秒 248・伏せの270秒 272）。三秒ごとに、本人とカメラから離れて持ち場で待つ（hold）・斬り合っていない組の名の無い徒の兵を、
    //   味方（六十m 外・三人まで残す）から、まだ越える時は敵（八十m 外・五人まで残す）から、遠い組から外す（伊賀・天王寺・岡山と同じ手）。
    //   名のある将・旗持ち・馬・本人の組・崩れた組は残す。記憶の多い端末とパソコンは今まで通り
    if (K285_TOUCH && MEM_BUDGET.real && rt.player?.u && (F._memCapT = (F._memCapT || 0) - dt) <= 0) { F._memCapT = 3; this.memTrim(rt, 0); }
    // 11/22 戸次川の持ち主 K408（kaito 11/20「家久の本陣にすぐ着き、簡単に攻撃できてしまう。家久は奥で固く」）：
    //   描かずの数え（伏せの段・本人を家久の四十 m 前から真っすぐ走らせる）で、旗本十六人が皆生きたまま十一秒で家久の床几の上（0.1m）まで抜けた。
    //   旗本が三人以上残る間は、本人を床几から九 m の内へ入れない（旗本の槍衾の外で押し返す）。一度だけ旗本の声
    if (F.iehS && F.ieh && rt.player?.u?.alive) {
      const P = rt.player.u.pos, dx = P.x - SEAT.x, dz = P.z - SEAT.z, d = Math.hypot(dx, dz), R = 9;
      if (d < R && F.ieh.units.filter((u) => u.alive && !u.gone).length >= 3) {
        const k = d > 0.01 ? R / d : 1;
        P.x = SEAT.x + (d > 0.01 ? dx : 0) * k; P.z = SEAT.z + (d > 0.01 ? dz : R);
        P.y = rt.world.heightAt(P.x, P.z);
        if (!F._iehWall) { F._iehWall = true; rt.say('島津家久の旗本', '殿に寄せるな！　槍を揃えよ！', 2.4); }
      }
    }
    // 11/22 戸次川の持ち主 K409・K398（kaito 11/20「長宗我部も最後まで馬廻が守る」）：描かずの数え（元親の八 m 内の味方）で、包囲の段の終わり（443秒）に
    //   元親の旗本が討ち尽くされ、退きの段から生還まで（443〜570秒）元親が馬上で一人きりだった。本物の兵は上限で、本人がそばにいるため供回りの仕組みも足せない。
    //   ③から、元親の供が六人を切ったら、六十 m 内の槍組（長宗我部を先に）と主を討たれた旗本の兵を一秒に二人まで元親の旗本へ移す（新しい兵は増やさない・三十人まで）。
    //   将を討たれた旗本の生き残りも移す。元親を退かせる下知（s3.st 2）からは馬廻を二・六倍の守りにし、二十 m 先の敵を追って散らない（直した後の数えで、移した供も463秒に討ち尽くされた）
    if (F.step >= 3 && F.motoU?.alive && !F.motoU.gone && F.moto && (F._motoRefT = (F._motoRefT || 0) - dt) <= 0) {
      F._motoRefT = 1;
      const L = F.motoU, g = F.moto, have = g.count - 1;
      if (F.s3?.st >= 2 && !F._motoHard) { F._motoHard = true; g.defMult = Math.max(g.defMult || 1, 2.6); g.seekRange = Math.min(g.seekRange || 4, 4); }
      if (have < 6 && (F._motoRef || 0) < 30) {
        const cand = [];
        // 将を討たれた旗本（信親・十河・統常）の生き残りも元親のもとへ落ちる（『元親記』：残兵は元親に従い退いた）
        const dead = (U) => !U || !U.alive || U.gone;
        const src = [...(F.allyBands || []), ...[[F.nobu, F.nobuU], [F.sogo, F.sogoU], [F.tsune, F.tsuneU]].filter(([q, U]) => q && dead(U)).map(([q]) => q)];
        for (const a of src) {
          if (!live(a) || a === g) continue;
          for (const u of a.units) {
            if (!u.alive || u.gone || u.dying || u.name || u.isStandard || u.stdHeld || u.fleeing || u.type === 'busho') continue;
            const d = Math.hypot(u.pos.x - L.pos.x, u.pos.z - L.pos.z);
            if (d < 60) cand.push([d + (a.mon === 'chosokabe' ? 0 : 20), u, a]);
          }
        }
        cand.sort((p, q) => p[0] - q[0]);
        for (const [, u, a] of cand.slice(0, Math.min(2, 6 - have))) {
          a.units = a.units.filter((q) => q !== u);
          u.group = g; u.slot = g.units.length; g.units.push(u);
          u.officerGuard = null; u.target = null; u.moveTo = null; u.aiT = 0;
          F._motoRef = (F._motoRef || 0) + 1;
        }
        if (cand.length && !F._motoRefSaid) { F._motoRefSaid = true; rt.say('長宗我部の侍', '殿の脇を固めよ！　元親様をお守りせい！', 2.6); }
      }
      // 同（直した後の数え：旗本は十五人いても元親の八 m 内は〇〜三人。供は二十 m 先の敵を追い、馬で動く元親に置いて行かれた）：
      //   元親から十 m より離れ、元親の八 m 内の敵とも斬り合っていない供は、狙いを解いて元親の周りの輪（三 m）へ戻す
      let k = 0;
      for (const u of g.units) {
        if (u === L || !u.alive || u.gone || u.dying) continue;
        k++;
        if (Math.hypot(u.pos.x - L.pos.x, u.pos.z - L.pos.z) <= 10) continue;
        const tg = u.target;
        if (tg && tg.alive && Math.hypot(tg.pos.x - L.pos.x, tg.pos.z - L.pos.z) < 8) continue;
        const a = k * 0.9;
        u.target = null; u.moveTo = { x: L.pos.x + Math.cos(a) * 3, z: L.pos.z + Math.sin(a) * 3 }; u.aiT = 1.2;
      }
    }
    // 11/21 戸次川の持ち主（kaito_now ③「始まり十数人しか見えない」）：K474 の自動の進軍（march_open.js marchAuto）が本人を土手の道を七十 m 戻した所 (-155,144) へ移すが、
    //   槍組六つと手勢は START (-132,76) の周りに置いたまま。描かずの数え：始め四秒の本人の三十 m 内の味方 25 人（列の飾り込み）で、槍組が追い付く十秒までが薄かった。
    //   始めの一度だけ、槍組（BAND_RING の持ち場）と手勢を本人の今の持ち場の周りへ移す
    if (!F._ringSnap && F.step === 1 && rt.player?.u) {
      F._ringSnap = true;
      const P = rt.player.u.pos;
      if (Math.hypot(P.x - START.x, P.z - START.z) > 20) {
        const yw = rt.player.yaw ?? rt.player.u.heading ?? 0;
        const move = (g, tx, tz) => {
          const c = g?.center?.(); if (!c || !live(g)) return;
          const dx = tx - c.x, dz = tz - c.z;
          if (g.anchor) { g.anchor.x += dx; g.anchor.z += dz; }
          for (const u of g.units) if (u.alive && !u.gone) { u.pos.x += dx; u.pos.z += dz; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); u.mesh?.position.copy(u.pos); u.moveTo = null; u.target = null; }
        };
        for (const [k, a] of (F.allyBands || []).entries()) { if (k > 5) continue; const [back, side] = BAND_RING[k]; move(a, P.x - Math.sin(yw) * back + Math.cos(yw) * side, P.z - Math.cos(yw) * back - Math.sin(yw) * side); }
        move(F.mine, P.x - Math.sin(yw) * 4 + 3, P.z - Math.cos(yw) * 4);
      }
    }
    // 11/21 cloud-41（K285）：携帯で包みが閉じる時（伏兵の本物が一度に百四十ほど立つ）、本人から百二十 m より遠い名無しの味方は先に去らせる（見えない所・最多 336 を収める）
    if (K285_TOUCH && F.step === 3 && !F._k285Trim) {
      F._k285Trim = true;
      const P0 = rt.player.u.pos;
      //   布陣の表の味方の塊（後備え）は六十 m より遠ければ去らせる（近い塊は残って一緒に戦う・救援からは hBack で退く）
      for (const u of [...rt.army.units]) if (u.alive && !u.gone && u.team === rt.player.u.team && !u.isPlayer && !u.name && !u.invuln && Math.hypot(u.pos.x - P0.x, u.pos.z - P0.z) > (u.group?._fjR ? 60 : 120)) rt.army.despawn(u);
    }
    loneGeneralTick(rt);   // K468（11/21 cloud-47）：単騎の島津の将を隊の中へ（描かずの act 一回 単騎の延べ 47→25）
    // 11/21 cloud-26（司令塔・cloud-50 の数え：段3（包囲）で味方 472→99→15）：包囲の段では、名のある将の旗本（信親1.8・十河1.6・元親1.8）と同じく、
    //   ほかの味方の組（槍組・戸次統常の手・仙石の旗本・手勢・布陣の塊）も一・五倍の守りで円陣に斬り合う（大敗の形は残し、段の途中で味方が消え切らない）。敵は変えない
    if (F.step === 3 && !(F._hgDef) && !(typeof window !== 'undefined' && window.__hgOff)) {
      F._hgDef = true;
      for (const g of rt.army.groups) if (g.team === rt.player.u.team && g.count && !g.routed && !g.civ) g.defMult = Math.max(g.defMult || 1, 1.5);
    }
    this.tickEmpty(rt, dt);
    const P = rt.player.u;
    // 11/19 持ち主 中学生 bot 615秒：右上の任務の札が替わって背が伸びた直後、札の四角の測り（〇・五秒ごと）が古く、行き先の▼の札が下端に重なった。
    //   任務の一行が替わってから一秒（札の替わりの動き〇・八秒）は毎コマ測り直す
    if (typeof document !== 'undefined' && rt.hud) {
      const tx = (document.querySelector('#h-prog .pg-st span')?.textContent || '') + (document.querySelector('#h-prog .pg-next')?.textContent || '');   // 時の字（pg-time）は毎秒替わるので見ない
      if (tx !== F.progTx) { F.progTx = tx; F.progTxT = rt.t; }
      // 同 戦略家 bot 545秒：一行は同じでも、札の下の段（時・印）の出入りで札の背が 98→122 画素に伸び、古い四角のまま▼が下端に乗った。背の変わりも見張る
      const pg = document.getElementById('h-prog');
      if (progRt !== rt) { progRt = rt; rt.cleanupTasks?.add?.(() => { if (progRt === rt) progRt = null; }); }   // K481 cloud-28：戦を閉じたら手放す。見張りは一つだけ（戦をやり直しても増やさない）。今の戦の rt を見る
      if (pg && progObs?.el !== pg && typeof ResizeObserver !== 'undefined') { progObs?.disconnect(); progObs = new ResizeObserver(progCb); progObs.el = pg; progObs.observe(pg); }
      if (rt.t - (F.progTxT ?? -9) < 1) rt.hud.rectsT = 0;
    }
    // 11/16 K340 iMac：鶴賀城の物見櫓の上の守り（味方・三組）は、ai.js の「70m 内に敵が来たら持ち場から出る」で十二秒に attack になり、
    //   櫓の上から降りられず戦の終わりまで立った（act bot：敵を前に20秒止まった九十回余りの大半）。櫓の上の者は持ち場に残す
    if (F.nobuLeaveT && !F.nobuFallen && (!F.nobuU?.alive || dist(F.nobuU.pos, P.pos) > 40 || rt.t - F.nobuLeaveT > 25)) this.nobuFall(rt);
    if (!F.perchStay) { F.perchStay = true; for (const g of rt.army.groups) if (g.team === P.team && /櫓の守り/.test(g.name || '')) { g.stay = true; if (g.order === 'attack') g.order = 'hold'; } }
    // 元親との合流と渡河も必須。深手で持ち場に戻れなくなると、
    // 信親の救援後も対岸で待ち続けるため、史実の生還者だけ撤退へ戻す。
    if (F.step >= 3) guardRecover(rt, F.motoU, dt, HISTORICAL_RETURN);
    if (F.motoReturn >= 0 && F.motoReturn < MOTO_RETURN.length - 1 &&
      dist(lightPos(B.moto), MOTO_RETURN[F.motoReturn]) < 4) {
      F.motoReturn++;
      this.go(B.moto, MOTO_RETURN[F.motoReturn], 2.6, { back: true });
    }
    if (F.step === 2 && !F.feigned) tsuigeki.engaged(rt);
    if (F.step === 3) kyuen.contact(rt);
    // 史実の斬り合いを進行条件にした二人だけは、深手で退いた後に戻す。
    // 共通の深手は戦の間戻らず、信親を見失った鈴木の組は狙いも解くため、救援が終わらなくなっていた。
    if (!F.ringClosed) {
      guardRecover(rt, F.nobuU, dt, HISTORICAL_RETURN);
      guardRecover(rt, F.suzukiU, dt, HISTORICAL_RETURN);
      if (live(F.suzuki) && F.nobuU?.alive && !F.nobuU.noTarget) F.suzuki.focus = F.nobuU;
      if (F.s3?.ls && live(F.nobu) && F.suzukiU?.alive && !F.suzukiU.noTarget) F.nobu.focus = F.suzukiU;
    }
    butaiTick(rt, dt);
    // 11/10 関所4：包まれてから退く間に、共通の軍の頭（armyhead・gunsei）が退く味方の組へ「〇〇、追撃」を出していた。③から味方の追撃の判断を止める
    const gun0 = rt._head?.gun?.[0];
    if (F.step >= 3 && gun0 && !gun0.noPursuitT06) { gun0.noPursuitT06 = true; gun0._pursuit = () => {}; gun0._pursuing?.clear?.(); }
    // 塊どうしの押し合い（伊集院に当たる段から）
    if (F.step >= 2) fieldTick(rt, dt, { list: F.blocks, reach: 40, k: F.step === 2 ? 0.25 : F.step === 3 ? 0.55 : 0.4 });
    // 手勢は本人の脇に付く
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      // 11/7 一5・九4：行き先を毎回替えると、隊は下知の合図を待ち直して這うように遅れた（army_signals の合図待ち）。
      //   行き先は十 m 以上ずれた時だけ替え、近づいたら戦う（間に幅を持たせて、動くと戦うを行き来させない）
      //   隊は「構え」のまま持ち場（anchor）だけを動かし、兵は自分の持ち場へ駆けて付いて来る（合図を待ち直さない）
      const keep = (g, to, aggro, seek) => {
        if (g.order !== 'hold') { g.order = 'hold'; g.dest = null; }
        // 追従に替えた隊へ、以前の移動の到着処理を残さない。
        g.onArrive = null;
        const a = g.anchor || (g.anchor = { x: to.x, z: to.z });
        const dx = to.x - a.x, dz = to.z - a.z;
        if (dx * dx + dz * dz > 4) g.facing = Math.atan2(dx, dz);
        a.x = to.x; a.z = to.z; g.aggro = aggro; g.seekRange = seek;
      };
      // 11/19 クラウドさ（kaito_now 3・前後の写真：三十秒に本人が浅瀬の中で一人。描かずの跡＝槍組六つと手勢の塊は十四〜二十五秒ずっと本人の四十 m 後ろ。
      //   本人は五・七 m/秒で駆けるのに、兵は甲冑の足の上限五・二 m/秒（army_move.js）で、始めに開いた差が縮まらない）：
      //   ①で本人から十四 m より遅れた者だけ、追いつくまで上限を六・二（二十八 m より遠ければ七・〇）m/秒へ上げて駆ける。②で戻す
      const catchUp = (us, P) => { for (const u of us) { if (!u.alive || u.mounted) continue; const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z); u._catchRun = d > 28 ? 7.0 : d > 14 ? 6.2 : 0; if (u._run0 != null) u.run = Math.max(u._run0 || 0, 5.4, u._catchRun); } };
      const g = F.mine;
      // 退く段は、手勢は退き口（浅瀬の南の岸→鏡城）へ駆ける。行き先は段ごとに一度だけ決める
      //   11/8 一5：退く段で手勢が先に陣へ駆け去り、本人は浅瀬と土手を一人で逃げて囲まれた。手勢は本人の後ろに付いて殿をする
      // 11/19 06:10 持ち主（中学生 bot 631秒：殿の段で③からの手傷46のまま浅瀬の口に立ち、遠くの備の侍の一太刀19が三度続いて倒れた。手勢は後ろ三 m で八 m 内しか打たない）：
      //   ④で本人の命が六割を切ったら、手勢は本人の北の二 m（島津の来る側）へ詰め、十八 m 内の敵へ打ち掛かる。一度だけ侍が「早う渡られよ」と声を掛ける
      if (live(g) && F.step >= 4) {
        g.speed = 4.8;
        const hurt4 = F.step === 4 && P.hp < P.maxHp * 0.6;
        if (hurt4 && !F.mineGuard4Said) { F.mineGuard4Said = true; rt.say(g.leader?.name || '手勢の侍', `${nm(rt)}殿、殿は我らが引き受けた！　早う渡られよ！`, 2.6); }
        keep(g, F.step === 4 ? { x: P.pos.x + 1.5, z: P.pos.z - (hurt4 ? 2 : 3) } : { x: P.pos.x + 3, z: P.pos.z + 1 }, hurt4 ? 18 : 8, hurt4 ? 20 : 10);
      }
      else if (live(g) && (F.step === 2 || F.step === 3)) {
        if (!g._run0Back) { g._run0Back = true; g.speed = 3.8; for (const u of g.units) { u._catchRun = 0; if (u._run0 != null) { u.run = u._run0; u._run0 = null; } } }
        // 11/18 クラウド k365-cloud-41（一枚表③・874×402 の204秒）：手勢が本人の後ろに付き、カメラの前は空の斜面だった。
        //   河原へ攻める段と包囲の段は、手勢を本人の向く先の四 m に付け、塊と幟が本人の前に見えるようにする
        const yw = rt.player.yaw || 0;
        // 11/19 04:05 持ち主（中学生 bot 六戦に二度、包囲の段で手傷のまま独り囲まれ 345・418秒に倒れた・手勢は四 m 先で別の敵と斬り合い）：
        //   ③で本人の命が六割を切ったら、手勢は本人の前の二 m へ詰めて盾になり、十八 m 内の敵へ打ち掛かる（本人の命が八割へ戻るまで。四割では 45→0 を十八秒で削られ間に合わなかった）。一度だけ侍が声を掛ける
        const hurt = F.step === 3 && (P.hp < P.maxHp * 0.7 || (F.mineGuard && P.hp < P.maxHp * 0.85));
        F.mineGuard = hurt;
        if (hurt && !F.mineGuardSaid) { F.mineGuardSaid = true; rt.say(g.leader?.name || '手勢の侍', `${nm(rt)}殿、お下がりあれ！　我らが前へ出る！`, 2.6); }
        if (hurt) keep(g, { x: P.pos.x + Math.sin(yw) * 2, z: P.pos.z + Math.cos(yw) * 2 }, 18, 20);
        else keep(g, { x: P.pos.x + Math.sin(yw) * 4 + Math.cos(yw) * 1.5, z: P.pos.z + Math.cos(yw) * 4 - Math.sin(yw) * 1.5 }, 12, 14);
        // 長宗我部の槍組（幟持ち）も、自分の備から二十五 m より離れた本人の両脇の前へ寄る
        for (const [k, a] of (F.allyBands || []).entries()) {
          if (!live(a) || k > 5) continue;   // 11/19 リ三：本人に付くのは槍組六つ（信親の四つ＋十河の前の二つ）
          if (!a._run0Back) { a._run0Back = true; for (const u of a.units) { u._catchRun = 0; if (u._run0 != null) { u.run = u._run0; u._run0 = null; } } }   // 縦隊の外し（march=false）は③まで本人に付く間そのまま
          const c = a.center?.(); if (!a._withMe && (!c || Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 25)) continue;
          const side = k & 1 ? (k > 1 ? 12 : 6) : (k > 1 ? -12 : -6), fwd = k > 1 ? 0 : 7;   // 0,1＝前の両脇・2,3＝左右の脇
          keep(a, { x: P.pos.x + Math.sin(yw) * fwd + Math.cos(yw) * side, z: P.pos.z + Math.cos(yw) * fwd - Math.sin(yw) * side }, 12, 16);
          a._withMe = true;   // 一度寄ったら③の終わりまで本人に付く（備へ戻して行き来させない）
        }
      }
      // 11/18 クラウド持ち主：①の土手の行軍も、手勢を本人の向く先の三 m・右へ二 m に付け、カメラの前に味方の塊と幟が入るように（後ろに付くと開戦の写真で味方0人）
      // 11/19 05:35 持ち主（act bot の開戦の写真でも前に味方0人。描かずの数え：持ち場は本人の横なのに兵は十一 m 後ろを本人と同じ速さで付く）：
      //   ①の間だけ手勢の足（隊の速さと兵の駆け）を本人より速くし、駆ける間は持ち場を本人の足の二倍先へ置く。②で元の足へ戻す
      else if (live(g) && F.step === 1) { g.speed = 5.2; for (const u of g.units) if (u.alive && u._run0 == null) { u._run0 = u.run; u.run = Math.max(u.run || 0, 5.4); } catchUp(g.units, P); const yw = rt.player.yaw || 0, f = 3 + 2 * Math.min(4.5, Math.hypot(P.vel?.x || 0, P.vel?.z || 0)); keep(g, { x: P.pos.x + Math.sin(yw) * f - Math.cos(yw) * 2, z: P.pos.z + Math.cos(yw) * f + Math.sin(yw) * 2 }, 12, 14);
        // 11/19 クラウドし（kaito_now 3：描かずの数え 携帯 30秒で本人の八十 m 内の味方は手勢の十六だけ。本人が浅瀬へ駆け、備は二 m/秒で後ろに残った）：
        //   ①で本人が槍組から三十五 m より離れたら、前の槍組二つは本人の両脇の後ろへ駆けて付く（③の _withMe と同じ印。一度付いたら③の終わりまで本人に付く）
        for (const [k, a] of (F.allyBands || []).entries()) {
          if (!live(a) || k > 5) continue;
          const c = a.center?.(); if (!a._withMe && (!c || Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 35)) continue;
          a._withMe = true; a.speed = 5.2;
          // 11/19 クラウドせ（描かずの数え：槍組は本人より秒に二 m 遅れ、三十秒で八十 m 後ろ）：手勢と同じく駆けを本人より速くし、持ち場を本人の足の二倍先へ置く
          for (const u of a.units) if (u.alive && u._run0 == null) { u._run0 = u.run; u.run = Math.max(u.run || 0, 5.4); }
          catchUp(a.units, P);
          //   持ち場を0.6秒ごとに動かすと、隊の自動の縦隊が付いたり外れたりし、外れるたびの「開く途中」の待ち（army_think の _deployT）で足軽の大半が立ったままになる（手勢と同じ。描かずの数え：七人のうち四人が三十秒動かず）
          if (a._march0 === undefined) { a._march0 = a.march; a.march = false; }
          const [back0, side] = BAND_RING[k], back = back0 - 2 * Math.min(4.5, Math.hypot(P.vel?.x || 0, P.vel?.z || 0));
          keep(a, { x: P.pos.x - Math.sin(yw) * back + Math.cos(yw) * side, z: P.pos.z - Math.cos(yw) * back - Math.sin(yw) * side }, 12, 16);
        } }
      else if (live(g)) keep(g, { x: P.pos.x + 1.5, z: P.pos.z - 2 }, 12, 14);
      // 名のある将の組は、自分の塊の中ほどに付いて動き、そこで戦う
      for (const [g, b, dx, dz] of F.follow) {
        if (!live(g) || (g._withMe && F.step <= 3)) continue;
        // 11/18 クラウド持ち主（act bot 366〜486秒 十河 n=1 が (39,-86) で二分・信親 n=1 が八十秒）：備が崩れると追従から外れ、下の「一人の将」の手当ても届かなかった。
        //   ③からは備が崩れても、一人の将は元親の脇へ、信親は今の持ち場で近くの敵へ打ち掛かる
        const broke = !b || b.routedL;
        if (broke && !(F.step >= 3 && (g.count <= 1 || g === F.nobu) && live(F.moto) && F.moto.anchor)) continue;
        let p = broke ? (g === F.nobu ? { x: (g.anchor || g.center()).x - dx, z: (g.anchor || g.center()).z - dz } : { x: F.moto.anchor.x - dx + 5, z: F.moto.anchor.z - dz + 3 }) : lightPos(b);
        // 11/18 クラウド持ち主（K352⑥ 十河が③の半ばで供を討たれ一人で控えた件）：③で旗本が二人を切ったら、自分の備から侍三人が馳せ寄って将を囲む（一つの組に二度まで）。
        //   名目の備の兵が旗本へ寄るだけで、新しい兵は増やさない（備の名目を三つ減らす）
        if (F.step === 3 && !broke && g.count <= 2 && g !== F.nobu && g !== F.moto && (g._reinf || 0) < 2 && b.aliveNominal?.() > 6 && aliveReal(rt) < 240) {
          const L = g.units.find((u) => u.alive && u.type === 'busho');
          if (L) {
            g._reinf = (g._reinf || 0) + 1;
            rt.army.spawn(g, fl([{ type: 'samurai', n: 3, o: { x: L.pos.x - Math.sin(g.facing || 0) * 4, z: L.pos.z - Math.cos(g.facing || 0) * 4 } }], g.mon));
            b.lost = (b.lost || 0) + 3;
          }
        }
        // 同（直した後の act bot 356〜536秒）：供を討たれて手傷で控えた将（十河）が一人で河原に三分立った。一人になった将は元親の旗本の脇へ退いて控える（信親は筋書きの最期があるので除く）
        if (F.step >= 3 && g.count <= 1 && g !== F.nobu && g !== F.moto && live(F.moto) && F.moto.anchor) p = { x: F.moto.anchor.x - dx + 5, z: F.moto.anchor.z - dz + 3 };
        // 11/18 クラウド持ち主（K352⑥「突っ立つ将」）：③の包囲では十河・統常の旗本が二十 m 先の島津を前に五十秒立った（act bot 456〜506秒）。包まれてからは二十六 m まで打ち掛かる
        // 11/20 クラウドさ（kaito_now 3「主人公が一人にならない」・描かずの数え（携帯）：③の救援で本人が信親へ向かう間、十河・統常・元親の旗本は
        //   自分の塊の持ち場に五十 m 残り、三百八十秒で本人の三十 m 内の味方が六人）：四十 m より離れた将の組は、持ち場を本人の方へ六割寄せる（関ヶ原と同じ型）。
        //   元親（退かせる的）・信親（筋書きの持ち場）・仙石（逃げる）と、二人を切った組は除く
        if (F.step === 3 && F.s3?.st >= 1 && g !== F.moto && g !== F.nobu && g !== F.sen && g.count >= 3 && P.alive) {
          const qx = p.x + dx - P.pos.x, qz = p.z + dz - P.pos.z;
          if (Math.hypot(qx, qz) > 40) p = { x: p.x - qx * 0.6, z: p.z - qz * 0.6 };
        }
        keep(g, { x: p.x + dx, z: p.z + dz }, F.step >= 3 ? 20 : 14, F.step >= 3 ? 26 : 16);
      }
      for (const [g, b, dx, dz] of F.followFoe) {
        // 反転前の静止中は、halt が止めた索敵と持ち場を追従で戻さない。
        if (!live(g) || !b || b.routedL || g.bankHold || (F.step === 2 && F.haltT)) continue;
        const p = lightPos(b);
        g._followTo = { x: p.x + dx, z: p.z + dz };
        // 11/18 夜50-40（歴史好き bot 655秒：退きの段で島津豊久の旗本6人が十二 m の綱の端で攻めのまま立った）：退きの追い討ちでは将の旗本も二十二 m まで追い掛ける
        keep(g, { x: p.x + dx, z: p.z + dz }, F.step >= 4 ? 22 : F.step >= 3 ? 12 : 6, F.step >= 4 ? 28 : F.step >= 3 ? 16 : 8);   // K352「突っ立つ将」：包囲からは将の旗本も十二 m で打ち掛かる   // 11/16 K340 iMac：寄った敵が五 m でも斬り合わず持ち場の手前で二十秒立った（豊久の旗本）。手の届く八 m までは打ち合う
      }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    // 11/18 夜50-40（歴史好き bot 505・515・640秒：信親の旗本・戸次統常の手・十河の旗本・鈴木大膳の手が、横陣の後ろの段の決まり（三〜六 m の敵にしか出ない）で
    //   二十 m 先の敵を前に攻めのまま立った）：包囲と退きの乱戦では、名のある将の組は後ろの段も駆け込む（ally_charge の突っ込みと同じ印）
    if (F.step >= 3) for (const g of [F.nobu, F.sogo, F.tsune, F.suzuki, ...(F.followFoe || []).map(([q]) => q)]) if (live(g) && g.order === 'attack') g._apCharge = true;
    // 11/18 クラウド k365-cloud-48（cloud-41・act bot：491秒 鈴木大膳の手13人が (-25,-99)、521秒 島津家久の備8人が (51,-137) の一点に重なり attack のまま止まる）：
    //   三秒ごとに、五人以上の徒歩の隊で半数を超える組が 0.5m 内に重なり、八秒ほとんど動かなければ、その場を持ち場にして横一列に開かせる（長篠城の門の口と同じ直し）。
    //   遠くの軽い兵（qualityAbstract・farSim）は見えないので、並びの位置の方へ 1.5m まで置き直す
    // 11/18 クラウド持ち主（止まりの探り 368〜423秒：味方の新手24人が本人の後ろの斜面 (41,-119) で、二十二 m 下の島津の新手を前に一分立った。
    //   共通の engageNear は十八 m まで）：③の包囲では、二十六 m 内に島津が来た味方の待つ備を解いて打ち掛からせる（待つ備の並びから外す）
    if (F.step === 3 && F._dr?.A?.length && (F.allyRsvT = (F.allyRsvT || 0) - 0.25) <= 0) {
      F.allyRsvT = 2;
      for (let i = F._dr.A.length - 1; i >= 0; i--) {
        const g = F._dr.A[i]; if (!live(g) || !g.stay) continue;
        const c = g.center(); if (!c) continue;
        if (!rt.army.nearestEnemy({ pos: c, team: g.team }, 26, (o) => !o.fleeing && !o.noTarget && !o.isStruct)) continue;
        F._dr.A.splice(i, 1); g.stay = false; g.fire = true; g.order = 'attack'; g.aggro = 18; g.seekRange = 30; g.dest = null; g.path = null;
      }
    }
    if ((F.stackT = (F.stackT || 0) - 0.25) <= 0) {
      F.stackT = 3;
      for (const g of rt.army.groups) {
        if (!live(g) || g.isPlayerSquad || g.civ || g.hidden || g.ambush || g.routed) continue;
        const al = g.units.filter((u) => u.alive && !u.gone && !u.isPlayer && !u.mounted && !u.fleeing && !u.downed && !u.perch);
        if (al.length < 5) { g._stk = null; continue; }
        let cx = 0, cz = 0, close = 0;
        for (const u of al) { cx += u.pos.x; cz += u.pos.z; }
        cx /= al.length; cz /= al.length;
        for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) if (Math.hypot(al[i].pos.x - al[j].pos.x, al[i].pos.z - al[j].pos.z) < 0.5) close++;
        if (close <= al.length / 2) { g._stk = null; continue; }
        const k = g._stk;
        if (!k || Math.hypot(cx - k.x, cz - k.z) > 1.5) { g._stk = { x: cx, z: cz, t: rt.t }; continue; }
        if (rt.t - k.t < 5) continue;
        g._stk = null;
        // 11/19 06:15 持ち主（act bot 251秒：伊集院久宣の旗本12人が鶴賀城の北 (23,-158) で、五十四 m 先の付き先（退いて向き直る先手の後ろ）へ届かず一点に重なった。
        //   ここで持ち場を今の所へ移しても、将の付き（followFoe）が〇・六秒ごとに付き先へ戻して重なり直した）：本人から四十 m より遠い将の付きの組が付き先から二十 m 超なら、
        //   見えない遠さなので一度に五 m 内（前へ二 m 半・横へ〇・七五 m 間）で付き先の方へ、横一列にほどいて進める（重なりの元の届かない一点から抜く）
        const T = g._followTo;
        if (T && F.followFoe?.some(([q]) => q === g) && Math.hypot(T.x - cx, T.z - cz) > 20 && al.every((u) => Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 40)) {
          const tx = T.x - cx, tz = T.z - cz, tl = Math.hypot(tx, tz), ux = tx / tl, uz = tz / tl;
          al.forEach((u, i) => {
            const col = i - (al.length - 1) / 2, x = cx + ux * 2.5 + uz * col * 0.75, z = cz + uz * 2.5 - ux * col * 0.75;
            if (rt.world?.walkable?.(x, z) === false || Math.abs((rt.world?.heightAt?.(x, z) ?? u.pos.y) - u.pos.y) > 3) return;
            u.pos.x = x; u.pos.z = z; u._farWant = null; u.moveTo = null;
          });
          continue;
        }
        const fx = P.pos.x - cx, fz = P.pos.z - cz, fl = Math.hypot(fx, fz) || 1;
        g.anchor = { x: cx, z: cz }; g.facing = Math.atan2(fx, fz); g.formation = 'line';
        g.width = Math.max(4, Math.min(10, Math.ceil(al.length / 2))); g.spacing = 1.6;
        if (g.focus && !g.focus.alive) g.focus = null;
        // 11/19 07:35 持ち主（act bot 326秒：島津家久の備9人のうち8人が遠い軽い作り（qualityAbstract）で (54,-145) の一点に重なり attack のまま二十秒）：
        //   遠い作りは攻めの的の一点へ戻って重なり直す。本人から四十 m より遠く八 m 内に敵の無い攻めの組は、ほどいた並びを持ち場に構えさせる（寄る敵には打ち掛かる）
        if (g.order === 'attack' && al.every((u) => Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 40) && !rt.army.nearestEnemy({ pos: { x: cx, y: al[0].pos.y, z: cz }, team: g.team }, 8, (o) => !o.noTarget && !o.isStruct)) {
          g.order = 'hold'; g.dest = null; g.path = null; g.aggro = Math.max(g.aggro || 0, 14); g.seekRange = Math.max(g.seekRange || 0, 20);
        }
        // 横（本人への向きに直角）へ 1.6m 間隔、二列に置く
        al.forEach((u, i) => {
          const col = i % g.width - (g.width - 1) / 2, row = Math.floor(i / g.width);
          const x = cx + (fz / fl) * col * 1.6 - (fx / fl) * row * 1.6, z = cz - (fx / fl) * col * 1.6 - (fz / fl) * row * 1.6;
          // 置き直しは 1.5m まで（act bot：一息に 6m 以上飛んだと見えた。400秒 島津家久の備）。重なりがほどければ足りる
          if (u.qualityAbstract || u.farSim) { const dx = x - u.pos.x, dz = z - u.pos.z, d = Math.hypot(dx, dz), s = d > 1.5 ? 1.5 / d : 1; u.pos.x += dx * s; u.pos.z += dz * s; u._farWant = null; }
          else { u.moveTo = { x, z }; u.aiT = 1.5; }
        });
      }
    }
    // 11/16 K340 iMac act bot：信親が倒れた後も鈴木大膳の手は倒れた信親を的にしたまま、その場で二十秒立った（651秒・七回）。的が倒れたら本人と四国の衆へ向かう
    // 11/19 持ち主（歴史好き bot 545秒：退きの段で鈴木大膳の手が attack のまま三人立つ）：的が去った（gone）・的にできない者・二十五 m より遠い者になった時も的を外し、近い四国の衆か本人を選び直す
    if (live(F.suzuki) && F.suzuki.focus && (!F.suzuki.focus.alive || F.suzuki.focus.gone || F.suzuki.focus.noTarget || F.step >= 4 && F.suzuki.focus !== P && F.suzukiU?.alive && dist(F.suzuki.focus.pos, F.suzukiU.pos) > 25)) { F.suzuki.focus = null; F.suzuki.seekRange = 40; F.suzuki.aggro = 14; }
    // 11/18 クラウド持ち主（act bot 281〜341秒 信親 n=1 が (−13,−95) で六十秒、周りに斬り合う敵が無かった）：「新納勢に囲まれた」信親の十二 m 内に敵がいない時は、
    //   五十 m 内の島津の組を一つ信親へ寄せる（信親は最期の場面まで討たれない。供が尽きても囲まれて斬り結ぶ姿を見せる）
    // 11/18 22:25 持ち主（せっかち bot 311・346・406秒：鈴木大膳が出た後も、鈴木が八 m より遠い間は信親 n=1 が狙いを持ったまま (−19,−101) で立った）：鈴木が遠い間も寄せる
    if (F.step === 3 && (!F.suzuki || !F.suzukiU?.alive || dist(F.suzukiU.pos, F.nobuU.pos) > 8) && F.nobuU?.alive && live(F.nobu) && F.nobu.count <= 2 && (F.nobuPressT = (F.nobuPressT || 0) - 0.25) <= 0) {
      F.nobuPressT = 4;
      // 11/18 08:30 持ち主（act bot 0822：信親 n=1 が (−14,−96) で301〜441秒に四度、十二 m の内に敵がいて斬り結ばずに二十秒立った）：六 m の内に敵がいなければ寄せる
      if (!rt.army.nearestEnemy(F.nobuU, 6, (o) => !o.noTarget && !o.isStruct)) {
        const e = rt.army.nearestEnemy(F.nobuU, 50, (o) => !o.noTarget && !o.isStruct && o.group && !o.group.bankHold && !o.group.stay && o.group !== F.ieh && o.group !== F.iehS);
        if (e) { const q = e.group; q.order = 'attack'; q.focus = F.nobuU; q.aggro = Math.max(q.aggro || 0, 12); q.seekRange = Math.max(q.seekRange || 0, 14); }
      }
    }
    // 11/18 クラウド持ち主（act bot 526秒）：的を失った鈴木大膳の手は、倒れた信親の所で十二人が一 m に重なって止まった。四十 m 内に敵が見えない時は、一番近い四国の衆（無ければ本人）を的に追う
    // 11/19 07:25 持ち主（歴史好き bot 615秒：水辺の構え（bankHold・aggro 0）の後もここで攻めに戻され、鈴木の手四人が的無しで立った）→水辺の構えの後は追わせない
    if (live(F.suzuki) && !F.suzuki.bankHold && !F.suzuki.focus && F.suzukiU?.alive && (F.suzT = (F.suzT || 0) - 0.25) <= 0) {
      F.suzT = 3;
      const e = F.step >= 4 ? rt.army.nearestEnemy(F.suzukiU, 25, (o) => !o.noTarget && !o.isStruct) || (P.alive ? P : null) : rt.army.nearestEnemy(F.suzukiU, 40, (o) => !o.noTarget && !o.isStruct) || rt.army.nearestEnemy(F.suzukiU, 90, (o) => !o.noTarget && !o.isStruct) || (P.alive ? P : null);
      if (e && dist(e.pos, F.suzukiU.pos) > 6) { F.suzuki.order = 'attack'; F.suzuki.focus = e; F.suzuki.anchor = { x: e.pos.x, z: e.pos.z }; }
    }
    // 同 bot：信親の最期の後、退く下知（move）の信親の旗本・戸次の手の侍が、倒れた信親の所（-22,-103）で敵を五 m 前にして二十秒立った。
    //   八秒その場を動かず八 m 内に敵がいれば、その敵と斬り合わせる（逃げ道を塞がれて棒立ちにしない）
    //   同じ立ち止まりは③④の新手（両軍）にも出た（277秒 新手の足軽 (22,-119)）。③からは両軍の動く隊（攻め・移り）に同じ決まりを当てる
    if (F.step >= 2) for (const g of rt.army.groups) if (live(g) && (g.order === 'move' || g.order === 'attack') && !g.isPlayerSquad && !g.civ && !g.stay && !g.hidden && !g.ambush && !g.bankHold && !/櫓の守り/.test(g.name || '')) for (const u of g.units) {
      // 11/16 iMac act bot：本人から遠い（軽い作りの）味方の新手が、西の林の縁 (-22,-109) で二十秒立った（283秒 11回）。遠くで八秒動かない新手は、見えない所なので去らせる
      if (u.alive && (u.qualityAbstract || u.farSim) && (g.isReserve || g._rsv) && dist(u.pos, P.pos) > 60) {
        const k = u._hfar || (u._hfar = { x: u.pos.x, z: u.pos.z, t: rt.t });
        if (Math.hypot(u.pos.x - k.x, u.pos.z - k.z) > 0.8) { k.x = u.pos.x; k.z = u.pos.z; k.t = rt.t; }
        else if (rt.t - k.t > 8) { rt.army.despawn(u); continue; }
      }
      // 11/19 クラウド持ち主（act bot 0313 の416秒：鈴木大膳の手の足軽が、十四 m 先の信親の旗本を的に持ったまま (-21,-115) で味方と 0.6m に重なり二十秒立った）：
      //   六 m より遠い的・倒れた的を持ったまま動かない兵も、立つ兵に数える
      const hsFar = u.target && (!u.target.alive || u.target.gone || Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) > 6);
      if (!u.alive || u.target && !hsFar || u.atk || u.fleeing || u.isPlayer || u.perch || u.noTarget || u.qualityAbstract || u.farSim || u.type === 'gun' && !u.sidearm || u.type === 'bow') { u._hsT = rt.t; continue; }
      if (u._hsT == null || Math.hypot(u.pos.x - u._hsX, u.pos.z - u._hsZ) > 0.8) { u._hsX = u.pos.x; u._hsZ = u.pos.z; u._hsT = rt.t; continue; }
      if (rt.t - u._hsT < 8) continue;
      const e = rt.army.nearestEnemy(u, 8, (o) => !o.fleeing && !o.noTarget && !o.isStruct);
      u._hsT = rt.t;
      if (hsFar) u.target = null;
      if (e) {
        u.target = e; u.moveTo = null; u.aiT = 2;
        g.aggro = Math.max(g.aggro || 0, 10); g.seekRange = Math.max(g.seekRange || 0, 12);
        // 隊の遠い的より、目の前の敵との斬り合いを優先する。
        if (g.isReserve || g._rsv) g.noAI = true;
        g.focus = null;
        u._hsN = 0;
      } else if ((u._hsN = (u._hsN || 0) + 1) >= 2 && !u.name && !u.invuln) {
        // 11/18 クラウド持ち主（act bot 0201・0233：島津家久の備・新手の侍が (61,-144)・(15,-155) の斜面で行き先を前に二十秒立った）。
        //   道を選び直しても二度続けて動けない兵は、本人から四十 m より遠ければ去らせ、近ければ横へ三 m ずらした所を行き先にする
        u._hsN = 0;
        if (dist(u.pos, P.pos) > 40) { (F.hsGone || (F.hsGone = [])).push(u); }
        else { const a = Math.random() * Math.PI * 2; u.moveTo = { x: u.pos.x + Math.sin(a) * 3, z: u.pos.z + Math.cos(a) * 3 }; u.aiT = 2.5; }
      } else {
        // 敵のいない所で止まった兵は、古い移動先を解いて道を選び直す。
        u.moveTo = null; u.aiT = 0;
      }
    }
    if (F.hsGone?.length) { for (const u of F.hsGone) if (u.alive && !u.gone) rt.army.despawn(u); F.hsGone.length = 0; }
    // 11/18 18時 クラウド持ち主（act bot 1736 の396・416秒：先に崩れた仙石秀久の旗本が一人 (19,-60) で「着いて待つ」まま二十秒立った）。
    //   仙石は史実どおり讃岐まで逃げた。浅瀬へ退く途中で十秒動かず、本人から四十 m より遠ければ去らせる（近ければ次の行き先を渡し直す）
    if (F.step >= 3 && live(F.sen) && !F.follow.some((f) => f[0] === F.sen)) {
      const c = F.sen.center(), k = F.senStill || (F.senStill = { x: c.x, z: c.z, t: rt.t });
      if (Math.hypot(c.x - k.x, c.z - k.z) > 1) { k.x = c.x; k.z = c.z; k.t = rt.t; }
      else if (rt.t - k.t > 10) {
        k.t = rt.t;
        if (dist(c, P.pos) > 40) { for (const u of [...F.sen.units]) if (u.alive && !u.gone) rt.army.despawn(u); }
        else { F.sen.order = 'move'; F.sen.dest = { x: FORD.x, z: c.z < -24 ? -24 : 40 }; F.sen.arriveCount = 1; F.sen.arriveNoncombat = true; for (const u of F.sen.units) if (u.alive) { u.moveTo = null; u.aiT = 0; } }
      }
    }
    // 同 bot：③の新手が本人の三 m 内で狙いを持たず六秒立った（377秒）。二秒そうしていれば本人へ打ち掛かる（順番待ちは player_pressure が決める）
    // 11/18 16時 クラウド持ち主（act bot 1555 の423秒：伊集院久宣の旗本の侍が本人の三 m 内で六秒立った）：本人を的にしても順番待ちで外れ、
    //   また立つ兵がいた。二度目からは三 m 内の本人の組・味方の兵へ斬り掛かる（無ければ本人をもう一度）。号令は hold 以外を全部見る
    if (F.step >= 3 && P.alive) for (const g of rt.army.groups) if (g.team !== P.team && g.count && !g.routed && g.order !== 'hold') for (const u of g.units) {
      // 11/18 18時 クラウド持ち主（act bot 1802 の523秒：鈴木大膳の手の足軽が本人のそばで六秒なにもしない）：倒れた的・六 m より遠い的を持ったままの兵も立つ兵に数える
      const tFar = u.target && (!u.target.alive || u.target.gone || u.target.fleeing || Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) > 6);
      if (!u.alive || u.target && !tFar || u.atk || u.fleeing || u.noTarget || u.perch || (u.type === 'gun' || u.type === 'bow') && !u.sidearm || Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 3.6 || Math.abs(u.pos.y - P.pos.y) > 3) { u._pzT = 0; continue; }
      if ((u._pzT = (u._pzT || 0) + 0.25) < 2) continue;
      u._pzT = 0; u.moveTo = null; u.aiT = 1.5;
      // 歴史好き bot 568秒：行き先が動き続ける組は合図の聞き分け（army_signals の signalWait）が切れず、三 m より遠い的を毎コマ外していた
      if (g.signalUntil > rt.army.time) g.signalUntil = 0;
      const again = u._pzAt != null && rt.t - u._pzAt < 12;
      u._pzAt = rt.t;
      const o = again && rt.army.nearestEnemy(u, 4, (e) => !e.isPlayer && !e.fleeing && !e.noTarget && !e.isStruct);
      u.target = o || P;
    }
    // 11/28 05:10 クラウド持ち主（act bot 3回のうち2回：伊集院久宣（mustLive）が手傷の後の退き woundOut で狙いを持たず、本人の三 m 内で六秒立った 200・292秒）：
    //   退き先を本人から離しても、本人が追い続けると二 m 内のまま六十秒（236〜297秒・命の下限で討てない将を追うだけ）。
    //   手傷の島津の将が本人の四 m 内に三秒いたら、郎党に担がれて島津の後ろ（本人から離れる向きへ三十五 m）へ下がる。もう本人の的にならない（史実で生き延びる将・討たれない）
    if (P.alive) for (const u of rt.army.units) if (u.team === 1 && u.woundOut && u.alive && !u.fleeing && !u.gone && !u._hwAway) {
      const dx = u.pos.x - P.pos.x, dz = u.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > 4 || Math.abs(u.pos.y - P.pos.y) > 3) { u._hwT = 0; continue; }
      if ((u._hwT = (u._hwT || 0) + 0.25) < 3) continue;
      const k = d > 0.3 ? 1 / d : 0, ax = k ? dx * k : Math.sin(u.heading || 0), az = k ? dz * k : Math.cos(u.heading || 0);
      u._hwAway = true; u.noTarget = true; u.target = null; u.atk = null; u._loneTo = null;
      u.woundOut.to = { x: u.pos.x + ax * 35, z: u.pos.z + az * 35 }; u.woundOut.stay = true;
    }
    // 11/16 iMac act bot：戸次統常の討死の後、戸次の手の侍が本人から九十 m 先の見えない所（倒れた信親の脇）で恐怖のまま退けず二十秒立った（484秒 30回）。
    //   史実は統常と一族郎党がここで討死。統常が倒れたら、本人から六十 m より遠い戸次の手は去らせる（近い者は退く下知のまま）
    if (live(F.tsune) && F.tsuneU && !F.tsuneU.alive) for (const u of [...F.tsune.units]) if (u.alive && !u.gone && dist(u.pos, P.pos) > 60) rt.army.despawn(u);
    // 11/17 K352 kaito「矢がもっと四方から降ってきてよい」：包囲と退きの段（③④）は、十秒前後ごとに本人のまわりへ島津の矢の雨を一つ（向きは毎回替える）
    if (F.step >= 3 && F.step <= 4 && P.alive && !(F.rainT > rt.t)) {
      F.rainT = rt.t + 9 + Math.random() * 5;
      const src = rt.army.units.filter((o) => o.team === 1 && o.alive && !o.gone && !o.fleeing && !o.name && o.group && dist(o.pos, P.pos) > 18 && dist(o.pos, P.pos) < 70);
      if (src.length) {
        const u = src.find((o) => o.type === 'bow') || src[(Math.random() * src.length) | 0];
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 4, to = { x: P.pos.x + Math.sin(a) * r, z: P.pos.z + Math.cos(a) * r };
        to.y = rt.world.heightAt(to.x, to.z);
        try { rainVolley(rt.army, u.group, u, to, dist(u.pos, to)); } catch (e) { /* 矢の雨が出せなければそのまま */ }
      }
    }
    // 11/17 K352 kaito「島津が弱すぎる：伊集院・豊久がすぐ討ち取れる・鉄砲一発で死ぬ」：島津の兵は命を一・七倍、名のある将は三倍に（一度だけ）
    for (const u of rt.army.units) if (u.team === 1 && !u._shzBuff && u.alive && !u.isStruct) { u._shzBuff = true; const m = u.name ? 3 : 1.7; u.maxHp *= m; u.hp *= m; }   // 将の一太刀は上げない（act bot：救援の段で将の一太刀に崩され453秒で倒れた）
    // 同 bot：本人の三 m 内まで寄られた島津の鉄砲足軽が、撃てず斬らずに六秒立った（484秒）。寄られた者は鉄砲を置いて脇差を抜く
    for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.routed) for (const u of g.units) {
      if (u.alive && u.type === 'gun' && !u.sidearm && !u.perch && !u.target && !u.atk && !u.fleeing && Math.abs(u.pos.x - P.pos.x) < 3.5 && Math.abs(u.pos.z - P.pos.z) < 3.5) rt.army.drawSidearm?.(u);
    }
    // 手勢の全滅は敗北条件にしない。五つの目標に兵の護衛はなく、
    // 主人公が生きていれば、先手との交戦・信親の救援・退却を続けられる。
    const el = rt.t - F.stepT;
    // 四国の衆が北の岸へ上がってから当たる（自分だけ先に着いても、皆が渡るのを待つ）
    //   信親の旗本（本物）が北の岸に上がりきるまで、伊集院の先手は構えて待つ（自分一人が先に着いて囲まれない）
    if (F.step === 1) shinkou.update(rt, K);
    if (F.step === 1 && shinkou.ready(rt, K)) this.toStep(rt, 2);
    else if (F.step === 2) {
      // 先手は当たって少し討たれると退く（退くふり）。退いた先まで追うと包みが閉じる
      // 囮の先手は本気で戦わない（史実：当たってすぐ退いた）。替わった本物の兵の手は軽く
      for (const g of F.ijBands || []) if (g.ijOpenSoft) { g.ijOpenSoft = false; delete g.dmgMultPlayer; }
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.feignSoft) { g.feignSoft = true; g.feignDmg = g.dmgMult ?? 1; g.dmgMult = Math.min(g.feignDmg, 0.45); }
      // 替わった先手の兵は待たずに四国の衆と本人へ槍を入れる（退くふりの前は本当に当たる。九2）
      if (!F.feigned) for (const g of rt.army.groups) if (g.team === 1 && g.count && g.order === 'hold' && g.kind !== 'main' && !g.gunLine && !g.siegeHold) { g.order = 'attack'; g.seekRange = 26; g.aggro = 12; }
      // 本人が先手と当たるか、味方が崩した先手の持ち場を押さえてから退く。
      // 敵が残らない時も pressed の滞在判定で進め、遠くで待つだけの自動達成はしない。
      // 11/18 15:00 持ち主（長さ：act bot 648秒・司令塔の決め 600秒以内）：先手と当たる間を六十秒→四十五秒
      if (!F.feigned && el > 45 && tsuigeki.pressed(rt, K)) this.feign(rt);
      if (F.feigned) tsuigeki.update(rt, K);
      if (F.feigned && !F.haltT && tsuigeki.ready(rt, K)) this.halt(rt);
      if (F.haltT && rt.t - F.haltT > 6.5) this.toStep(rt, 3);
    } else if (F.step === 3) {
      // 包む島津の兵（塊から替わった本物）は、待たずに四国の衆と本人へ打ち掛かる
      for (const g of rt.army.groups) if (g.team === 1 && g.count && g.order === 'hold' && g !== F.ieh && g !== F.iehS && !g.interiorHold && g.kind !== 'main' && !g.gunLine && !g.siegeHold) { g.order = 'attack'; g.seekRange = 30; g.aggro = 14; g.noRout = true; }
      // 新手の端の兵が本人に近づいても、隊の中心が遠いと共通の待機解除が働かない。
      // さらに横隊の後列は索敵が三歩に絞られる。包囲中、十二歩の内へ来た新手は列ごと寄せる。
      // 遠い二線や本陣には適用せず、傷と人数も変えない。
      for (const g of rt.army.groups) {
        if (g.team !== 1 || !g.count || g.routed || !(g._rsv || g.isReserve) || (g.order !== 'hold' && g.order !== 'attack')) continue;
        for (const u of g.units) {
          if (!u.alive || u.gone || u.dying || u.noTarget || u.woundOut || u.rearWound || u.fleeing) continue;
          if (dist(u.pos, P.pos) >= 12 || Math.abs(u.pos.y - P.pos.y) >= 1.8 || rt.army.wallBetween(u.pos, u.team, P.pos) || rt.army.terrainBlocks(u.pos, P.pos)) continue;
          g.stay = false; g.fire = true; g._apCharge = true;
          g.order = 'attack'; g.dest = null; g.path = null; g.aggro = 14; g.seekRange = 30;
          break;
        }
      }
      // 囮の手加減を解いてから包む。元から弱い旗本の攻撃力は保つ。
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.ringSoft && g !== F.ieh && g !== F.iehS) { g.ringSoft = true; g.dmgMult = Math.min(g.feignDmg ?? g.dmgMult ?? 1, 0.95); g.dmgMultPlayer = Math.min(g.dmgMult, 0.3); }   // 11/18 05:10 持ち主：0.6 でも中学生 bot が包囲で侍の一太刀38（命の四割）を続けて受け 373秒で倒れた→0.42 でも act bot が新納の侍の槍（槍衾1.35・島津の家1.45）で38を三度受け319秒で倒れた→0.3（侍の一太刀は二十前後。味方を崩す強さは変えない）   // 11/18 クラウド持ち主：本人に当たる時だけ0.6（侍・騎馬の一太刀48＝命の半分が四方から続き倒れた。味方を崩す強さは0.95のまま）   // K352：包む島津の手加減を緩める（0.8→0.95）
      kyuen.update(rt, K, el);   // 伏せ→その場で防ぐ→信親の救援→鈴木大膳→信親の討死（夜へ移ろう。t06_hetsugi/kyuen.js）
    } else if (F.step === 4) {
      // 北口へ寄らずに渡る下知が出た時は、北口のピンを印なしで畳む（南の岸のピンへ）
      if (F.cp && F.cp.i === 0 && shingari.crossNow(rt)) F.cp.i = 1;
      cpTick(rt); shingari.update(rt, K);
      if (shingari.crossed(rt, K)) { cpReach(rt, 1); this.toStep(rt, 5); }
    }
    // 柵（半径十一 m）の外で生還にせず、東の口を抜けて陣内へ戻るまで遊ばせる。
    else if (F.step === 5) {
      if (F.cp && F.cp.i < 2) cpReach(rt, 1);   // ⑤からの途中再開・浅瀬の縁から上がった時も、南の岸は済
      cpTick(rt);
      this.bankHold(rt); if (cpDone(rt) || dist(P.pos, SAFE) < 9 || (P.pos.x < SAFE.x - 30 && P.pos.z > 30)) { if (F.cp && !cpDone(rt)) cpReach(rt, 2); this.win(rt); }
    }
    // 退く段（④）は島津が勢いを保って水辺まで追う。止まれば囲まれる。⑤は水辺で止まる（bankHold）
    if (F.step >= 4) {
      // 11/18 15:30 持ち主（act bot 4回のうち3回：殿の十河存保の旗本四〜十人が浅瀬の北 (28,−29)・(4,−22) で攻めのまま的が無く二十秒立った）：
      //   殿は持ち場で待つだけでなく、七十 m 内に寄る島津へ自分から打ち掛かって討死する（十河の別の死。浅瀬へは来させない）
      // 11/18 23:30 持ち主（act bot 587秒：十河の討死の後も残った旗本がここで攻めに戻され、的の無いまま二十秒立った）→討死の後は退きの下知（sogoFall）のまま
      if (!F.sogoDead && live(F.sogo) && (F.sogoPushT = (F.sogoPushT || 0) - 0.25) <= 0) {
        F.sogoPushT = 4;
        const g = F.sogo, u0 = g.units.find((u) => u.alive && !u.gone && !u.target && !u.atk);
        // 11/19 02:05 持ち主（歴史好き bot 515秒：十河の旗本四人が攻めのまま立った）：一人でも的を持つと押さなかった→半分より多くが的無しなら押す
        const idleN = g.units.filter((u) => u.alive && !u.gone && !(u.target && u.target.alive !== false && !u.target.gone) && !u.atk).length;
        if (u0 && idleN * 2 > g.units.filter((u) => u.alive && !u.gone).length) {
          const e = rt.army.nearestEnemy(u0, 70, (o) => !o.noTarget && !o.isStruct && !o.fleeing && o.group && !o.group.bankHold && o.group !== F.ieh && o.group !== F.iehS && o.pos.z < 20);
          if (e) { g.order = 'attack'; g.focus = e; g.dest = null; g.anchor = { x: e.pos.x, z: e.pos.z }; g.aggro = 70; g.seekRange = 70; }
        }
      }
      // 11/19 02:05 持ち主（同 bot 515秒：共通の『遠くの備』四人も攻めのまま的が無く立った）：退きの段（④）は、半分より多くが的無しの遠くの備を七十 m 内の敵へ向ける
      if (F.step === 4 && (F.farPushT = (F.farPushT || 0) - 0.25) <= 0) {
        F.farPushT = 3;
        for (const g of rt.army.groups) {
          if (!g.count || g.routed || g.bankHold || g.order !== 'attack' || g === F.ieh || g === F.iehS || g === F.mine || g === F.sogo) continue;   // 11/19 07:05 持ち主（歴史好き bot 430秒：退きの頭で信親の旗本4・鈴木大膳の手3・戸次統常の手2 が攻めのまま的無しで立った）→名の形で選ばず、攻めの隊は皆   // 02:35 歴史好き bot 480秒：伊集院久宣の旗本六人も同じに立った→島津の将の旗本も
          const al = g.units.filter((u) => u.alive && !u.gone && !u.fleeing), idle = al.filter((u) => !(u.target && u.target.alive !== false && !u.target.gone) && !u.atk);
          if (!idle.length || idle.length * 2 <= al.length) continue;
          // 島津の旗本は、二十五 m 内に本人がいれば本人へ（歴史好き bot 507秒：旗本の侍が本人のそばで六秒なにもしなかった）
          const Pu = rt.player.u, e = g.team === 1 && Pu.alive && dist(idle[0].pos, Pu.pos) < 25 ? Pu : rt.army.nearestEnemy(idle[0], 70, (o) => !o.noTarget && !o.isStruct && !o.fleeing && !o.gone && !o.civ);
          if (e) { g.focus = e; g.dest = null; g.anchor = { x: e.pos.x, z: e.pos.z }; g.aggro = 70; g.seekRange = 70; }
        }
      }
      if ((F.chaseT = (F.chaseT || 0) - 0.25) <= 0) {
        F.chaseT = 2;
        const to = { x: P.pos.x, z: Math.min(P.pos.z, -16) };
        if (F.step === 4) for (const b of [B.niiro, B.honjo, B.ieh, B.ijuin]) if (b && !b.routedL && dist(lightPos(b), P.pos) > 30) this.go(b, to, 2.2, { charge: true });
        // 11/18 夜50-40（歴史好き bot 700秒：退きで島津の鉄砲衆5人が林の縁に的なく立つ）：退きの段は鉄砲衆も本人の方へ詰めて撃つ
        if (F.step === 4) for (const g of F.foes) if (g.gunLine && g.count && !g.routed) { g.stay = false; g.order = 'attack'; g.seekRange = 60; g.aggro = 20; g.noRout = true; }
      }
      for (const g of rt.army.groups) if (F.step === 4 && g.team === 1 && g.count && !g.chaseSoft && g !== F.ieh && g !== F.iehS) {
        g.chaseSoft = true; g.dmgMult = Math.min(g.dmgMult || 1, 0.85); g.dmgMultPlayer = Math.min(g.dmgMultPlayer ?? g.dmgMult, 0.3);   // K352：追手 0.7→0.85（本人へは 11/18 0.6→0.3 包囲と同じ）
        g.speed = 4.4;
        if (g.order === 'hold' && g.kind !== 'main') { g.order = 'attack'; g.seekRange = 40; g.aggro = 12; }
      }
      if (!F.breath) { F.breath = true; P.hp = Math.max(P.hp, P.maxHp * 0.7); }
      // 浅瀬を外れた者は、川の真ん中（腰より深い所）で冬の速い流れに足を取られて沈む（四人まで。浅瀬の内では沈まない）
      if (live(F.deep) && F.drown < 4 && !(F.drownT > rt.t)) {
        const W = rt.world, offFord = (x) => Math.abs(x - FORD.x) > FORD.w && Math.abs(x - FORD2.x) > FORD2.w;
        // 追手に討たれて倒れかけた者を、溺れた人数や最初の叫びに数えない。
        const u = F.deep.units.find((v) => v.alive && !v.gone && !v.dying && v.hp > 0 && offFord(v.pos.x) && (W.waterDepthAt?.(v.pos.x, v.pos.z) || 0) > 0.7);
        if (u) {
          F.drownT = rt.t + 2.2; F.drown++; rt.army.kill(u, null);
          if (F.drown === 1) rt.say('土佐の足軽', '深みじゃ！　足が届かぬ……！', 2.4);
        }
      }
    }
    // 遠く離れた追撃兵は去らせる。本陣の旗本と史実で生き残る将は保つ。
    if (F.step === 5) for (const g of F.foes) if (!g.stay) for (const u of g.units) if (u.alive && !u.gone && !u.invuln && dist(u.pos, P.pos) > 130) rt.army.despawn(u);
  },

  win(rt) {
    const F = rt.flags;
    if (!F.bankArrived && !F.ending) {
      F.bankArrived = true;
      rt.say('手勢の侍', '西の岸じゃ！　元親様と殿の者を確かめよ！', 2.8);
    }
    // 岸へ早く着いても、殿に残った十河の最期の知らせを飛ばさない。
    // P4（K410）：最後のピン（西の岸）に着いたら、十河の知らせを今出して締める（待たせない）
    if (!F.ending && !F.sogoDead && cpDone(rt)) this.sogoFall(rt);
    if (F.ending || !F.sogoDead) return;
    // 元親の退路を守る任務は、本人だけが西の岸へ着いても果たした事にしない。
    // 退き口の味方と同じ岸の判定で、元親の生存と渡河を確かめる。
    const moto = F.motoU;
    // 11/14 クラウドゆ act bot：本人は西の岸（2m）に着いたのに元親の旗本が川の南で止まり、百五十秒勝ちが来ず時切れ。⑤に入って六十秒たてば本人の生還で締める
    if ((!moto?.alive || moto.gone || moto.dying || !(moto.pos.z > 26)) && !(F.step === 5 && rt.t - F.stepT > 20) && !cpDone(rt)) return;   // K410：着いたら早く締める（60→20）
    F.ending = true;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    const n = (F.mine?.count || 0) + (rt.squad || []).filter((s) => s.alive).length;
    // 大敗の退き口なので「功、抜きん出たり」の手柄は付けない（11/7 critic）
    rt.award((t) => { t.main = true; }, '戸次川から生きて戻った');
    void n;
    // 余韻（川向こうの勝鬨と松明・燃える鶴賀城・岩石城への伏線。t06_hetsugi/yoin.js）
    rt.finish({ scriptedEnd: true }, yoin.play(rt, K));
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.finish({ failureReason: why }, 6);
  },

  // 退く段（④⑤）は、共通の退避（居残る味方へ戻る）でなく、この戦の退き口（浅瀬→鏡城）をたどる
  botEvacuating(b) { const s = b.flags.step || 0; return s >= 5 || (s === 4 && shingari.crossNow(b)); },
  // 11/8：退く段で打ち込まれるたびに馬を止めて斬り合い、土手で二十秒囲まれて討たれた。受けは届く直前だけ（toyo_bot の botGuardFlee）
  botGuardFlee(b) { const s = b.flags.step || 0; return s >= 5 || (s === 4 && shingari.crossNow(b)); },

  // bot：近い敵を突き、段の行き先へ。退く段は敵を振り切って走る（すぐ横の敵だけ払う）
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    // 退く段は斬り返して止まらず、穂先が届く直前だけ構えて走り続ける（botGuardFlee）
    const r = F.step === 4 && !shingari.crossNow(b) ? 6 : F.step >= 4 ? 0 : F.step === 3 ? (F.s3?.st ? 4 : 9) : F.step === 2 ? 7 : 0;
    const e = r ? b.army.nearestEnemy(u, r, ok) : null;
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    let q;
    if (F.step === 1 && !shinkou.crossing(b)) q = shinkou.pin(b);
    else if (F.step === 1) q = Math.abs(u.pos.x - FORD.x) > 6 && u.pos.z > 8 ? { x: FORD.x, z: 24 } : { x: FORD.x, z: -22 };
    else if (F.step === 2) q = tsuigeki.pin(b, K);
    else if (F.step === 3) q = kyuen.pin(b) || { x: RING.x, z: RING.z + 6 };
    // 浅瀬の外の深みは斜めに渡らない：まず北の岸で浅瀬の口へ寄ってから、まっすぐ渡る
    else if (F.step === 4 && !shingari.crossNow(b)) q = shingari.MOUTH_N;   // 殿：浅瀬の北の口で防ぐ
    else if (F.step === 4 && u.pos.z < -30) q = { x: FORD.x, z: -14 };   // 河原の奥からは浅瀬の口へまっすぐ
    else if (F.step === 4) q = Math.abs(u.pos.x - FORD.x) > 8 && u.pos.z < 22 ? { x: FORD.x, z: Math.min(u.pos.z, -14) } : u.pos.z < -12 ? { x: FORD.x, z: -10 } : { x: FORD.x, z: 34 };
    // 陣の柵（半径十一 m）は東に口がある。外からは東の口の前へ回ってから中へ（柵の西の外で止まった。11/9 bot）
    else q = u.pos.z < 30 && Math.abs(u.pos.x - FORD.x) > 8 ? { x: FORD.x, z: Math.max(u.pos.z, -10) } : u.pos.z < 30 ? { x: FORD.x, z: 34 } : SAFE;
    goTo(p, inp, q.x, q.z, 2);
  },
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t06_hetsugi);
// 11/18 23:10 持ち主（せっかち bot：勝った後の余韻の声が二十五秒続き「飛ばす」が出なかった）→勝った後は飛ばして結果へ進める（長久手と同じ。待てば全部流れる）
const endSkip = (rt) => rt.over && rt.tracker.main === true && rt.flags.ending && rt.player.u.alive && (rt.endT ?? 0) > 2;
t06_hetsugi.canSkip = (rt) => (endSkip(rt) ? '結果へ進む' : shinkou.canSkip(rt));
t06_hetsugi.skip = (rt) => { if (endSkip(rt)) rt.endT = Math.min(rt.endT ?? 1.2, 1.2); else if (shinkou.canSkip(rt)) shinkou.skipWait(rt, K); };
// 11/18 持ち主（中学生 bot 105秒 874×402）：右上の地図を札の丈で測って下げる形は、段が替わって札が伸びた一瞬に地図と▼の札へ重なった。
//   天王寺と同じく地図を右上の角に据え、札を左に並べる（測って下げない）
t06_hetsugi.mapBack = true;

// 段のファイルへ渡す物（t06_hetsugi/*.js）
const K = {
  START, FORD, FORD2, CASTLE, GATE_A, FORT_R, ARM, RING, CAMP,
  get talk() { return t06_hetsugi.talk; },
  go: (b, to, s, o) => t06_hetsugi.go(b, to, s, o),
  lightPos, routButai,
  lastStand: (rt) => t06_hetsugi.lastStand(rt),
  closeRing: (rt) => t06_hetsugi.closeRing(rt),
  sogoFall: (rt) => t06_hetsugi.sogoFall(rt),
};

// ======================================================================
// K651（kaito 11/25「長宗我部の戸次川…既存のやつの立場を入れ替えるだけでできるやつはそうしよう」）：戸次川の戦場を建てる所だけを出す。
//   長宗我部編 c07・島津編 s05 は hetsugiField(rt) 一つを呼び、遊ぶ側・備・行き先・勝ち負けだけ入れ替える（docs/k651_howto.md）。
//   中身は豊臣の setup と同じ手（城・河原の礫・浅瀬の白波・身の回りの場・鏡城・日の向き・家久の本陣）。豊臣の戦の setup と順は変えない（ここは呼ぶだけ）
export const HETSUGI_WORLD = t06_hetsugi.world;
export const HETSUGI_TIMESLIP = t06_hetsugi.timeslip;
export function* hetsugiField(rt) {
  const T = t06_hetsugi;
  T.castle(rt, { garrison: false });   // 鶴賀城（城兵は置かない：島津の側では敵、長宗我部の側では遠い）
  T.riverStones(rt);
  yield;
  T.fordRiffles(rt);
  timeslipField(rt);
  T.kagami(rt);
  yield;
  T.sunTurn(rt);
  rt.scene.add(jinmaku(rt.world, SEAT.x, SEAT.z, 12, 8, 4, { mon: 'shimazu' }));
  rt.scene.add(shogi(rt.world, SEAT.x, SEAT.z, 0, { gunbai: true }));
  try { enemyJin(rt, { mon: 'shimazu', facing: 0, honjin: { x: SEAT.x, z: SEAT.z }, hutName: '島津の陣小屋' }); } catch (e) { console.warn(e); }
  for (const [dx, dz] of [[-8, 6], [8, 6], [-14, -2], [14, -2]]) rt.scene.add(nobori(rt.world, SEAT.x + dx, SEAT.z + dz, 'shimazu', 6));
}
// 行き先を置く物差し（手で数を写さない）。+z が渡る前の岸（豊臣方）、−z が鶴賀城の岸（島津）
export const HETSUGI_AT = { start: START, ford: FORD, ford2: FORD2, riverZ, castle: CASTLE, camp: CAMP, ijuin: IJUIN, woods: WOODS, ring: RING, iehisa: IEHISA, seat: SEAT };

export { t06_hetsugi };

import { toyotomiMore } from './toyotomi_more.js';
toyotomiMore(t06_hetsugi, 't06_hetsugi');   // K674：勝った後の続きの段（一戦10任務）
