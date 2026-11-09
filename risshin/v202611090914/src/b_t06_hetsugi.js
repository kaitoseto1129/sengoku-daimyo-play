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
import { useTerrain } from './asset_manifest.js';
import { demSample } from './dem.js';
import { enemyGroup, allyGroup, nm, guardRecover } from './bhelp.js';
import { naginata } from './humans.js';
import { nobori, palisade, dorui, yagura, hut, jinmaku, shogi, kabukimon, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { KIT } from './b_nagashinojo.js';
import { sfx } from './audio.js';
import { MEM_TIGHT } from './settings.js';
import { withGuard } from './toyo_bot.js';
import { fieldButai, fieldTick, routButai, lightPos } from './b_yasen.js';
import { butaiTick } from './butai.js';
import { addSite } from './map_sites.js';
// 15分の構成（kaito 11/8 夜・docs/toyo15_plan_1108.md の 9）：段の中身は t06_hetsugi/ に一段一ファイル
import * as shinkou from './t06_hetsugi/shinkou.js';     // ①鏡城の陣の軍議・土手の進軍・渡河（鶴賀城の坂の囲みの遠景）
import * as tsuigeki from './t06_hetsugi/tsuigeki.js';   // ②先手に当たる・退くふり・囲みの陣と中津留の河原へ追う
import * as kyuen from './t06_hetsugi/kyuen.js';         // ③伏せ・自分の周りを防ぐ・信親の救援（十河・信親の討死）
import * as shingari from './t06_hetsugi/shingari.js';   // ④浅瀬の口の殿・皆を渡らせて最後に渡る
import * as yoin from './t06_hetsugi/yoin.js';           // 戦の後の余韻と岩石城への伏線

const START = { x: -132, z: 76 };            // 鏡城の下の陣の前（土手の道の口。15分の構成で軍議から始める）
const FORD = { x: 20, w: 22 };               // 浅瀬（川の中ほどの x と幅の半分）
const FORD2 = { x: -70, w: 12 };
const RIVER_Z = 0;
const RIVER = [[-270, 6], [-150, -3], [-40, 2], [60, -2], [170, 4], [270, -2]];
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
const HIST = { sen: 2000, nobu: 2000, sogo: 1000, moto: 1000, ijuin: 2000, niiro: 5000, honjo: 2000, ieh: 3000 };
const A0 = HIST.sen + HIST.nobu + HIST.sogo + HIST.moto, B0 = HIST.ijuin + HIST.niiro + HIST.honjo + HIST.ieh;
// 11/7 九1・十1：右上に①〜⑤を始めから全部並べる。一行は短く、地図で分かる場所の名と行いだけ。戦の間に言い替えない
const STEP_TEXT = ['戸次川の浅瀬を皆と渡れ', '伊集院の先手を突き、中津留の河原へ追え',
  '中津留の河原で信親様の横に立ち、島津を防げ', '浅瀬の口で殿をし、皆を渡らせて西の岸へ退け', '川沿いの道を鏡城の陣まで退け'];
const STEP_NOUN = ['戸次川の浅瀬', '中津留の河原', '長宗我部信親', '戸次川の浅瀬', '鏡城'];
const NAMED = new Set(['長宗我部信親', '長宗我部元親', '仙石秀久', '十河存保', '戸次統常', '伊集院久宣', '新納大膳亮', '島津豊久', '島津家久', '鈴木大膳']);
const KAGAMI = { x: CAMP.x - 16, z: CAMP.z + 50 };   // 鏡城の丘（陣の後ろ＝実の西。鏡城は川の西の丘城）

// ---- 地形：南の岸は低い河原と田、北の岸は段丘から鶴賀城の尾根へ。国土地理院の起伏は北の岸に ----
let dem = null;
useTerrain('dem_hetsugi', (data) => { dem = data; });
const DEM_XY = 5;                            // ゲームの 1 を実の 5m に縮める
const sm = (a, b, v) => { const k = Math.max(0, Math.min(1, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
function riverZ(x) {
  for (let i = 0; i < RIVER.length - 1; i++) { const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1]; if (x >= ax && x <= bx) return az + (bz - az) * (x - ax) / (bx - ax); }
  return RIVER_Z;
}
function relief(x, z) {
  if (!dem) return 0;
  const rx = Math.max(-1580, Math.min(1580, -z * DEM_XY)), rz = Math.max(-1580, Math.min(1580, x * DEM_XY));
  return (demSample(dem, rx, rz) - 10) * 0.32;
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
  h += Math.max(-2, relief(x, z)) * sm(90, 170, Math.abs(rz)) * (1 - k);
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
  hideMissionDots: true,
  goalsAllRows: true,       // 五つを最初から並べる。共通の目標欄はこの指定が無いと今の一件だけになる。
  kumiLead: false,           // 意味の分からない青い小旗の印を出さない（五2）
  noHatamotoMass: true,      // 将の周りに見せかけの兵を足さない（九5）
  goalSignOnly: true,
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
  forceBarAlways: true,   // 両軍の数を渡すだけでは共通の棒が隠れるため、戦の間は表示する。
  introSides: { a: '豊臣勢（四国の衆）　六千', b: '島津勢　一万二千' },   // 五4・十二1：始まりの札に史実の数
  // 支度の布陣図に地名（11/8 BR：支度の裏の絵が戸次川でも鶴賀城でもなかった）
  introMapPlaces: [{ x: FORD.x, z: 8, name: '戸次川' }, { x: CASTLE.x, z: CASTLE.z + 26, name: '鶴賀城' }, { x: CAMP.x, z: CAMP.z - 16, name: '鏡城' }],
  mapNorth: Math.PI * 1.5,   // 実の北はゲームの −x（小地図の左）
  noFrontFill: true,         // 作り物の乱戦を足さない（AP の 9・AQ の 6）
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,
  enemyTactics: false,       // 敵の動きはこの定義が決める（退くふり・伏兵・追手）
  hideGuideSteps: true,
  noPlayerFoot: true,
  nearbyAllySignLimit: 0,
  foeMarks: true,
  enemyTriangleSigns: true,
  nobiki: true,              // 負け戦の退き口：法螺貝と退き太鼓で退けを知らせる
  wakeRoom: 200,             // 塊から本物へ替える兵の上限（iPhone の重さ）
  // 11/7 九2・十二1：両軍で一万八千の「大軍の戦」と見なされ、本物の兵の付いていない塊（伊集院・伏せの三隊）は隠され、
  //   隠れた塊は本物に替わらなかった（av_host の paint）。島津の先手も包みも数人の旗本しか出なかったのはこのため。塊は隠さない
  keepPaint: true,
  // 塊は 150m の内では描かれず、本物にも替わらない（11/5 BQ の全戦の決まり）。戦う兵は台本の本物の組（foeBand）で置き、
  //   将の隊に見えない所で兵を足す共通の厚み（av_host）は止めて、二百五十人の内に収める
  noAvHost: true,
  playerAtkMax: 3,
  playerTaken: 0.5,
  // 11/8 十二3：夜の土手で下の瀬の島津に一瞬に三太刀（共通の一太刀五割）を浴び、満ちた命から二秒で討たれた。
  //   刃を受けた後の四秒は次の刃を通さない（一太刀五割のまま。止まれば討たれ、走れば抜けられる。稲生・有岡と同じ）
  meleeGrace: { rate: 1, burst: 1, interval: 4 },
  playerRegen: 0.025,
  closeCombatAssist: true,
  autoTargetCamera: true,
  steadyMeleeCamera: true,
  // 自動の敵注視を切った退き口でも、共通の近敵カメラへ戻さない。
  noAutoFoeCam: (rt) => rt.flags.step >= 4,
  noWinCrane: true,
  victoryTitle: '戸次川　豊臣方敗北',
  victoryCaption: '鏡城へ生還',
  compactIntro: true,
  introDateNoWrap: true,
  keepMix: false,
  missions: STEP_TEXT,
  missionOf(rt) { return Math.max(0, Math.min(4, (rt.flags.step || 1) - 1)); },
  missionHeading(rt) { const k = this.missionOf(rt); return '①②③④⑤'[k] + STEP_TEXT[k]; },
  // 戦の後の札も右上と同じ五つ（「敵を何人討つ」で埋めない。三1）。果たすのは段を進めた時
  goals5(rt) {
    const F = rt.flags, won = () => rt.tracker?.main === true;
    return STEP_TEXT.map((text, k) => ({ kind: 'stage', k, text, noun: STEP_NOUN[k], action: text, sec: 600,
      check: k < 4 ? () => won() || (F.step || 0) > k + 1 : won }));
  },
  // 行き先の▼は今の段の場所に一つ（話の間と札の裏には出さない。五4）
  missionPin(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (rt.over || rt.hud?.introWaiting || F.ending || !F.step || F.holdPlayer || !rt.player.u.alive) return null;
    const q = F.pin || (F.pin = { x: 0, z: 0, r: 6, hide: 6 });
    q.unit = null; q.enemy = false; q.waiting = false; q.arrived = false; q.progress = 0; q.route = false;
    let at, r = 8;
    if (F.step === 1) at = shinkou.pin(rt);   // 渡るまでは南の岸の浅瀬の口、渡れの後は北の岸
    else if (F.step === 2) at = tsuigeki.pin(rt, K);
    else if (F.step === 3) { at = kyuen.pin(rt); r = 6; if (!at) return null; }   // 伏せの始めは▼を出さない（その場で防ぐ）
    else if (F.step === 4) at = shingari.pin(rt, K);   // 殿の間は北の口、皆が渡ったら南の岸
    else { at = CAMP; r = 8; }
    q.x = at.x; q.z = at.z; q.r = q.hide = r;
    q.arrived = Math.hypot(p.x - at.x, p.z - at.z) < r;
    return q;
  },
  introText: () => '島津に囲まれた鶴賀城を救いに、戸次川を渡る。退くふりの罠に落ちても、生きて鏡城の陣へ戻れ。',
  minutes: 15,
  expectMin: 15,
  sides: { a: { name: '豊臣勢（四国の衆）', mon: 'chosokabe' }, b: { name: '島津勢', mon: 'shimazu' } },
  // 両軍の残り（史実の数）：塊の名目から。まだ林に伏せている島津も数に入れる
  force(rt) {
    const F = rt.flags;
    if (!F.blk) return null;
    // 塊の人数を丸めた差で、開戦時の六千・一万二千を超えないようにする。
    const n = (b, h) => (b ? Math.round(h * b.aliveNominal() / Math.round(h / SC)) : h);
    const B = F.blk;
    return { a: n(B.sen, HIST.sen) + n(B.nobu, HIST.nobu) + n(B.sogo, HIST.sogo) + n(B.moto, HIST.moto), b: n(B.ijuin, HIST.ijuin) + n(B.niiro, HIST.niiro) + n(B.honjo, HIST.honjo) + n(B.ieh, HIST.ieh), a0: A0, b0: B0 };
  },
  date: () => '天正十四年十二月十二日　夕刻',   // 五4：一行に収める（「夕／刻」で割れた）
  talk: {
    before: [['大友の使者', '島津家久が豊後へ攻め入り、鶴賀の城を囲んでおります。なにとぞお救いを'], ['仙石秀久', '殿下の先手として九州へ渡ったのは、大友を救うためじゃ'],
      ['長宗我部元親', '島津は退くふりをする。殿下の本隊を待つべし'], ['十河存保', '待てば鶴賀が落ちる。わしは仙石殿に従う'], ['仙石秀久', '軍監はわしじゃ。皆、川を渡れ']],
    after: [['主人公', '信親様を、お救いできませなんだ'], ['長宗我部元親', '……生きて戻った者がおる。それでよい']],
  },
  spawn: { x: START.x, z: START.z, heading: Math.PI / 2 },
  world: {
    seed: 15861,
    time: 'dusk',
    groundHalf: 260,
    battleViewDistance: 140,   // 川向こうの島津の陣と鶴賀城の尾根が霞に消えないように
    moveLim: 248,
    noFoeNear: true,         // 敵の後詰めを本人の近くへ寄せない（見せかけの軍勢で囲まない。AQ の 6）
    autumn: true,            // 師走：枯れ草の河原
    // 11/8 八1：つぎはぎの四角と丸い石の模様が一面に貼り付いた。まだらの土は使わない
    patchyGround: false,
    // 11/8 二2：朱の夕焼けが向きで出たり消えたりした。夕の空は一面の薄雲で、朱は地平の低い所だけ
    duskLight: { cover: 0.72, glowK: 0.3, cloud: 0.1 },
    // 11/8 四6・十5：夜の地面が昼のように明るく影がくっきり、具足が銀に光った。月明かりは弱く、影は淡く
    nightLift: 1.5,
    // 11/8 八1：遠くの山に縦の筋（光の筋）が雨の帯のように走り、霧が板を重ねたように見えた。光の筋は出さず、地の霧は薄く
    noShafts: true,
    groundMistScale: 0.35,
    nightLight: { sunI: 0.18, hemiI: 0.2, sky: 0x1a2236, fog: 0x1e2636, top: 0x070b16 },
    noGroundRipples: true,
    height,
    riverCross: true,
    wadeDepth: 0.85,
    waterSlow: true,
    streams: [{ pts: [...RIVER].reverse(), w: 32, depth: 2.1, fords: [FORD, FORD2] }],   // 大野川は大きな川（細い帯にしない）
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

  setup(rt) {
    const F = rt.flags;
    F.step = 0; F.holdPlayer = false; F.foes = []; F.ending = false; F.blk = {}; F.blocks = [];
    rt.def.autoTargetCamera = true;
    this.castle(rt);
    this.kagami(rt);
    this.sunTurn(rt);
    // 家久の本陣の陣幕と床几（伏せの段まで中は見えない後ろ）
    rt.scene.add(jinmaku(rt.world, SEAT.x, SEAT.z, 12, 8, 4, { mon: 'shimazu' }));
    rt.scene.add(shogi(rt.world, SEAT.x, SEAT.z, 0, { gunbai: true }));
    for (const [dx, dz] of [[-8, 6], [8, 6], [-14, -2], [14, -2]]) rt.scene.add(nobori(rt.world, SEAT.x + dx, SEAT.z + dz, 'shimazu', 6));
    // 豊臣方の塊（渡る前の岸）。仙石が先陣、信親が左、十河が右、元親は後ろで渡らずに残る
    const B = F.blk;
    // 11/7 一5・九4：主人公は信親の備のすぐ後ろ。目の前で四国の衆が渡り始める（渡る順は仙石→十河→長宗我部）
    B.sen = this.block(rt, { key: 'sen', name: '仙石秀久の備', team: 0, flag: 'toyotomi', at: { x: -64, z: 46 }, facing: Math.PI / 2, w: 34, d: 10 });
    B.nobu = this.block(rt, { key: 'nobu', name: '長宗我部信親の備', team: 0, flag: 'chosokabe', at: { x: -100, z: 58 }, facing: Math.PI / 2, w: 30, d: 10 });
    B.sogo = this.block(rt, { key: 'sogo', name: '十河存保の備', team: 0, flag: 'miyoshi', at: { x: -84, z: 76 }, facing: Math.PI / 2, w: 26, d: 8 });
    B.moto = this.block(rt, { key: 'moto', name: '長宗我部元親の備', team: 0, flag: 'chosokabe', at: { x: -142, z: 98 }, facing: Math.PI / 2, w: 26, d: 8 });
    // 島津の先手（伊集院久宣）：鶴賀城の下の囲みの陣
    B.ijuin = this.block(rt, { key: 'ijuin', name: '伊集院久宣の備', team: 1, flag: 'shimazu', at: IJUIN, facing: 0, w: 38, d: 10 });
    // 名のある将の本物の組（塊と一緒に動く）
    const ally = (o, list, flag) => { const g = allyGroup(rt, { fullStrength: true, facing: Math.PI, width: 5, aggro: 9, speed: 3.4, order: 'hold', noRout: true, ...o }, fl(list, flag)); g.mon = flag; return g; };
    F.nobu = ally({ name: '長宗我部信親の旗本', anchor: { x: -104, z: 66 } }, [{ type: 'busho', n: 1, o: { name: '長宗我部信親', invuln: true, horse: true, weapon: 'spear' } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }], 'chosokabe');
    F.nobuU = F.nobu.units.find((u) => u.type === 'busho');
    if (F.nobuU) naginata(F.nobuU);   // 信親は大長刀で八人を斬ったと『元親記』

    F.sogo = ally({ name: '十河存保の旗本', anchor: { x: -84, z: 80 } }, [{ type: 'busho', n: 1, o: { name: '十河存保', invuln: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 5, o: { flagScale: 1 } }], 'miyoshi');
    F.sogoU = F.sogo.units.find((u) => u.type === 'busho');
    F.sen = ally({ name: '仙石秀久の旗本', anchor: { x: -64, z: 50 } }, [{ type: 'busho', n: 1, o: { name: '仙石秀久', invuln: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 5, o: { flagScale: 1 } }], 'toyotomi');
    F.moto = ally({ name: '長宗我部元親の旗本', anchor: { x: -142, z: 104 }, aggro: 6, seekRange: 10 }, [{ type: 'busho', n: 1, o: { name: '長宗我部元親', invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }], 'chosokabe');
    F.mine = ally({ name: '手勢', anchor: { x: START.x + 3, z: START.z + 5 }, width: 4, speed: 3.8, dmgMult: 0.9 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 13 }], 'chosokabe');
    // 戸次統常（大友方。父の汚名を雪ぐと志願し、一族郎党と討死）。十河の備の脇に付く
    F.tsune = ally({ name: '戸次統常の手', anchor: { x: -78, z: 84 } }, [{ type: 'busho', n: 1, o: { name: '戸次統常', invuln: true, horse: true } }, { type: 'samurai', n: 4 }], 'otomo');
    F.tsuneU = F.tsune.units.find((u) => u.type === 'busho');
    // 11/8 一5：塊は百五十 m の内では描かれないので、本人の周りの四国の衆が旗本だけ（十数人）に見えた。信親の備の前の列（土佐の一領具足の槍組）を本物で二つ
    F.allyBands = [[-6, -8], [10, -8]].map(([dx, dz], i) => {
      const g = allyGroup(rt, { name: '長宗我部の槍組', anchor: { x: -100 - dz, z: 58 + dx }, facing: Math.PI / 2, width: 5, formation: 'line', aggro: 10, seekRange: 14, speed: 3.4, order: 'hold', noRout: true, dmgMult: 0.8 },
        fl([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 - i, o: { flagScale: 1 } }], 'chosokabe'));
      g.mon = 'chosokabe'; return [g, dx, dz];
    });
    F.follow = [[F.nobu, B.nobu, 6, 4], [F.sogo, B.sogo, 0, 4], [F.sen, B.sen, 0, 4], [F.tsune, B.nobu, -12, 2], ...F.allyBands.map(([g, dx, dz]) => [g, B.nobu, dx, dz])];
    F.allyBands = F.allyBands.map(([g]) => g);
    // 島津の名のある将は馬上で旗本に囲まれ、自分の備と動く（足軽一人を追わない・討てない）
    F.followFoe = [];
    this.foeLord(rt, '伊集院久宣', B.ijuin, IJUIN, 34);   // 囮の先手の将は囲みの陣の奥（鶴賀城の下）
    // 伊集院の先手の本物の兵：鶴賀城の下で川へ向いて槍を構える（11/7 九2：書いた先手が来ず、槍を入れる相手がいなかった）
    F.ijBands = [[22, -66], [46, -68]].map(([x, z]) => this.foeBand(rt, '伊集院の先手', { x, z }, 0, 11, { aggro: 5, seekRange: 8 }));
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
    const g = enemyGroup(rt, { faction: 'shimazu', name, anchor: { x: at.x, z: at.z }, facing, width: 5, formation: 'line', noRout: true,
      morale: 90, dmgMult: 0.8, order: 'hold', aggro: 8, seekRange: 14, speed: 3.4, ...o },
    [{ type: 'ashigaru', n: n - 3, o: { flagScale: 1 } }, { type: 'gun', n: 2 }, { type: 'samurai', n: 1 }]);
    g.mon = 'shimazu'; rt.flags.foes.push(g);
    return g;
  },

  // 島津の名のある将（馬上）と旗本。塊の後ろに付いて動く
  foeLord(rt, name, b, at, back = 20) {
    const g = enemyGroup(rt, { faction: 'shimazu', name: `${name}の旗本`, anchor: { x: at.x, z: at.z - back }, facing: 0, width: 4, formation: 'line', noRout: true,
      morale: 100, dmgMult: 0.35, order: 'hold', aggro: 4, seekRange: 6, speed: 2.6 },
    [{ type: 'busho', n: 1, o: { name, invuln: true, horse: true, keep: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 2, o: { flagScale: 1 } }]);
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
    try { b = fieldButai(rt, { name: o.name, team: o.team, faction: o.team ? 'shimazu' : 'oda', kind: 'ashigaru', nominal: Math.round(HIST[o.key] / SC), armor: ARM[o.flag], flag: o.flag, at: o.at, facing: o.facing, realMax: 0 }); }
    finally { W.addDistantArmy = add; }
    b.noSwitch = true;
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
    b.light.moveTo(to.x, to.z, Math.max(0.5, d / speed), opt);
    b.cmd = { id: opt.charge ? 'charge' : 'move', to, target: null, form: 'line' };
  },

  // 鶴賀城：尾根の頂の主郭を土塁と柵で囲み、南西に虎口。櫓と大友の旗。柵には当たりを付ける（AQ の追い・ap_collide）
  castle(rt) {
    const W = rt.world, q = CASTLE, batch = makeSimpleBatch(), n = 18;
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
      if (Math.abs(((am - GATE_A + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < Math.PI / n) continue;   // 虎口
      const seg = [q.x + Math.sin(a0) * FORT_R, q.z + Math.cos(a0) * FORT_R, q.x + Math.sin(a1) * FORT_R, q.z + Math.cos(a1) * FORT_R];
      dorui(W, seg, -Math.sin(am), -Math.cos(am), { h: 1, w: 2.2, capEnds: true, closeBack: true, batch });
      palisade(W, seg, { h: 2.6, batch, solid: true });
    }
    finalizeSimpleBatch(rt, batch);
    rt.scene.add(yagura(W, q.x + 4, q.z - 5, { logFrame: true, kind: 'ro', height: 8, boarded: true }));
    rt.scene.add(yagura(W, q.x + Math.sin(GATE_A) * (FORT_R - 3) + 3, q.z + Math.cos(GATE_A) * (FORT_R - 3), { logFrame: true, kind: 'ro', height: 6.5, boarded: true }));
    rt.scene.add(hut(W, q.x - 3, q.z + 2, 11, 7, 0.3, { roof: 0x5a4c38 }));   // 城主の館
    rt.scene.add(hut(W, q.x + 7, q.z - 1, 6, 4, 0.3, { roof: 0x6a5c44 }));
    rt.scene.add(yagura(W, q.x + 10, q.z + 9, { logFrame: true, kind: 'ro', height: 6.5, boarded: true }));
    for (const [dx, dz] of [[-6, -6], [6, 4], [0, -10], [9, -4], [-9, 3], [3, 9]]) rt.scene.add(nobori(W, q.x + dx, q.z + dz, 'otomo', 6));
    // 11/7 四5：小屋と櫓だけで城に見えなかった。虎口に冠木門、奥にもう一つの櫓（主郭は東西四十 m・南北二十五 m の山城。battle_learn）
    rt.scene.add(kabukimon(W, q.x + Math.sin(GATE_A) * FORT_R, q.z + Math.cos(GATE_A) * FORT_R, 4.6, GATE_A));
    rt.scene.add(yagura(W, q.x - 11, q.z + 7, { logFrame: true, kind: 'ro', height: 7, boarded: true }));
    // 城兵（大友方・利光の者）。主郭から出ない
    const g = allyGroup(rt, { name: '鶴賀城の城兵', fullStrength: true, anchor: { x: q.x, z: q.z }, facing: GATE_A, width: 4, aggro: 4, seekRange: 8, order: 'hold', fixed: true, noRout: true },
      fl([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 }, { type: 'gun', n: 2 }], 'otomo'));
    g.mon = 'otomo';
    addSite(rt, 'castle', q.x, q.z, '鶴賀城');
  },
  // 鏡城の下の味方の陣（逃げる先。渡る前の岸）
  kagami(rt) {
    const W = rt.world, batch = makeSimpleBatch(), r = 11, n = 14;
    for (let i = 0; i < n; i++) {
      if (i === 3) continue;   // 口は東（浅瀬からの道の側）
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      palisade(W, [CAMP.x + Math.sin(a0) * r, CAMP.z + Math.cos(a0) * r, CAMP.x + Math.sin(a1) * r, CAMP.z + Math.cos(a1) * r], { h: 2.2, batch, solid: true });
    }
    finalizeSimpleBatch(rt, batch);
    KIT.honjin(rt, CAMP.x - 2, CAMP.z, { mon: 'otomo', people: false, fire: true });
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
    rt.scene.add(yagura(W, KAGAMI.x + 3, KAGAMI.z + 2, { logFrame: true, kind: 'ro', height: 7, boarded: true }));
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
    F.otomo.mon = 'otomo';
    const seat = { x: CAMP.x, z: CAMP.z - 2 };
    rt.scene.add(shogi(rt.world, seat.x, seat.z, Math.PI / 2));
    F.otomoSeat = allyGroup(rt, { name: '大友勢の本陣', fullStrength: true, anchor: seat, facing: Math.PI / 2, width: 1, aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true },
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
    for (const k of ['go', 'nobu', 'ford', 'camp']) rt.unmark(k);
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
      this.go(B.ijuin, { x: 26, z: -50 }, 2.6, { charge: true });
      this.go(B.sen, { x: 46, z: -52 }, 3.4, { charge: true });
      this.go(B.nobu, { x: 16, z: -50 }, 3.4, { charge: true });
      this.go(B.sogo, { x: 54, z: -46 }, 3.2, { charge: true });   // 11/8 二2：十河の備は本人から見える所（右の三十 m 余り）
      F.ijKills0 = rt.stats.kills; F.ijTaken0 = rt.stats.taken;
      // 囮の一組は主人公にも槍を向ける。味方だけと戦って退かない。
      const first = F.ijBands.find(live);
      if (first) { first.order = 'attack'; first.focus = rt.player.u; first.seekRange = 80; first.aggro = 18; }
    } else if (n === 3) {
      this.ambush(rt);   // 信親の▼は救援の知らせの時に（kyuen.js）
    } else if (n === 4) {
      // 11/8 五3・九1：退く段でカメラが後ろの追手に付き、行き先の▼が画面の下の端に張り付いて後ろを指した。退く段は走る向きを見る
      rt.def.autoTargetCamera = false;
      rt.marker('ford', () => shingari.pin(rt, K), '戸次川の浅瀬');
      shingari.start(rt, K);   // 浅瀬の口の殿（t06_hetsugi/shingari.js）
      sfx('horagai', 0.8);
      this.otomoCamp(rt);
      // 11/8 一5・九2：夜の土手で本人だけが下の瀬の島津に囲まれた。先に崩れて落ちた仙石・長宗我部の者が土手で息をつき、本人が渡り終えると鏡城へ落ちていく
      //   （本人が北の岸の百 m 余り先にいる間に置く。目の前に急に出さない）。鶴賀城の城兵は二百 m の奥で見えないので去らせて枠を空ける
      for (const g of rt.army.groups) if (g.name === '鶴賀城の城兵') for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
      if (!F.chase2) { F.chase2 = true; this.spawnChase(rt, { x: FORD2.x, z: -26 }, true); }   // 下の瀬の北の岸から渡り始める（本人は百 m 余り先）
      //   落ち武者は下の瀬の口から七十 m 余り川下の土手に置く（近いと、本人が来る前に川原へ下りて下の瀬の島津と斬り合いを始めた）
      F.strays = [[{ x: -92, z: 62 }, 'chosokabe'], [{ x: -112, z: 68 }, 'toyotomi']].map(([p, flag]) => {
        const g = allyGroup(rt, { name: flag === 'toyotomi' ? '仙石の落ち武者' : '長宗我部の落ち武者', anchor: p, facing: -Math.PI / 2, width: 4, aggro: 8, seekRange: 9, speed: 3.0, order: 'hold', noRout: true, dmgMult: 0.7 },
          fl([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }], flag));
        g.mon = flag; g.walkSpeed = 2.2; return g;   // 傷を負って足が遅い（追手に追い付かれる）
      });
      // 11/9 七：フロイス「他国の者は浅瀬を知らず、多くが溺れた」。浅瀬を外れて深みへ入る土佐の者（本人の渡る浅瀬の川下、四十 m 余り）
      F.deep = allyGroup(rt, { name: '浅瀬を外れた者', anchor: { x: -30, z: -16 }, facing: 0, width: 4, aggro: 0, seekRange: 0, speed: 2.4, order: 'move', noRout: true },
        fl([{ type: 'ashigaru', n: 5, o: { flagScale: 1 } }], 'chosokabe'));
      F.deep.mon = 'chosokabe'; F.deep.dest = { x: -30, z: 40 }; F.drown = 0;
      // 包みの島津は河原まで追う
      for (const b of [B.niiro, B.honjo, B.ieh, B.ijuin]) this.go(b, { x: FORD.x + (b === B.honjo ? 30 : b === B.niiro ? -20 : 0), z: -18 }, 2.2, { charge: true });
    } else if (n === 5) {
      rt.marker('camp', { x: CAMP.x, z: CAMP.z }, '鏡城');
      rt.say(F.mine.leader?.name || '手勢の侍', '川沿いの道を鏡城へ退け。灯りの見える陣が味方じゃ', 3);
      // 河原の奥に残った島津（本人から九十 m の外）は去らせ、追手の兵の枠を空ける（二百五十人の内）
      const P = rt.player.u.pos;
      for (const g of F.foes) if (!g.cut && !g.stay) for (const u of g.units) if (u.alive && !u.gone && !u.invuln && dist(u.pos, P) > 90) rt.army.despawn(u);
      this.spawnChase(rt);
      // 11/7 九2：「下の瀬から」の追手は、渡りを終えた時に下の瀬を渡り始め、土手の先で行く手を塞ぐ（来ない敵を言わない）
      this.cutCharge(rt);   // 渡り途中の組は浅瀬の道順を保ち、渡り終えた組は追い続ける
      // 11/8 一4・一5：落ちる四国の衆の残りも土手の道を鏡城へ。追手は本人だけでなくこの者たちにも打ち掛かる
      const road = [{ x: -60, z: 52 }, { x: -120, z: 70 }, { x: CAMP.x + 14, z: CAMP.z - 2 }];
      const walk = (g, k) => { if (!live(g) || k >= road.length) return; g.order = 'move'; g.dest = { x: road[k].x + (Math.random() - 0.5) * 6, z: road[k].z + (Math.random() - 0.5) * 4 }; g.speed = g.walkSpeed || 3.8; g.aggro = 8; g.seekRange = 8; g.onArrive = () => walk(g, k + 1); };
      for (const g of [F.nobu, F.sogo, F.tsune, ...(F.allyBands || [])]) walk(g, 0);
      for (const g of F.strays || []) walk(g, 1);    }
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

  // 釣り野伏せ：西の林から新納大膳、東の林から本庄、尾根の陰から家久の本隊。伊集院も向き直る
  ambush(rt) {
    const F = rt.flags, B = F.blk;
    rt.unmark('go');
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
    for (const p of [{ x: WOODS[0].x + 14, z: WOODS[0].z - 6 }, { x: WOODS[0].x + 10, z: WOODS[0].z + 12 }]) this.foeBand(rt, '新納大膳の手', p, toRing(p), 10, att);
    for (const p of [{ x: WOODS[1].x - 14, z: WOODS[1].z + 6 }]) this.foeBand(rt, '島津豊久の手', p, toRing(p), 10, att);
    for (const p of [{ x: RING.x + 6, z: RING.z - 42 }]) this.foeBand(rt, '島津家久の手', p, 0, 10, att);
    // 11/8 二3：包みの兵は近い四国の衆に取り付いて、信親の備（本人の周り）まで寄らずに一分近く遠くで戦っていた。まず信親の馬印へ駆け、着いてから斬り合う
    const N = F.nobuU?.alive ? F.nobuU.pos : RING;
    for (const g of F.foes) if (/新納大膳の手|島津豊久の手|島津家久の手/.test(g.name) && !g.toNobu) {
      g.toNobu = true; const c = g.anchor, dx = c.x - N.x, dz = c.z - N.z, d = Math.hypot(dx, dz) || 1;
      g.order = 'move'; g.dest = { x: N.x + dx / d * 9, z: N.z + dz / d * 9 }; g.speed = 3.8;
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 60; q.aggro = 14; if (q.name === '島津家久の手') q.focus = rt.player.u; };
    }
    // 退くふりの先手も向き直って打ち掛かる
    for (const g of F.ijBands || []) if (live(g)) { g.order = 'attack'; g.seekRange = 40; g.aggro = 14; g.dest = null; g.feint = false; }
    // 林の縁に膝をつく島津の鉄砲衆（本物）。伏せの始まりは鉄砲と矢（フロイス：土佐の衆は撃ち返す暇も無かった）
    for (const [i, w] of WOODS.entries()) {
      const gx = w.x + (RING.x - w.x) * 0.3, gz = w.z + (RING.z - w.z) * 0.3;
      const guns = enemyGroup(rt, { faction: 'shimazu', name: '島津の鉄砲衆', anchor: { x: gx, z: gz }, facing: Math.atan2(RING.x - gx, RING.z - gz), width: 7, formation: 'line', noRout: true,
        morale: 90, dmgMult: 0.9, order: 'hold', aggro: 8, seekRange: 45, speed: 2.6 },
      [{ type: 'gun', n: 6 + i }, { type: 'samurai', n: 1 }]);
      guns.gunLine = true; F.foes.push(guns);
    }
    // 総大将の島津家久は後ろの本陣の床几に座って動かない（AR3・AV7）。旗本二十五人が前を固める。史実で討たれていないので討てない
    F.ieh = enemyGroup(rt, { faction: 'shimazu', name: '島津家久の旗本', anchor: { x: SEAT.x, z: SEAT.z + 7 }, facing: 0, width: 9, formation: 'line', noRout: true,
      morale: 100, dmgMult: 0.5, order: 'hold', fixed: true, aggro: 6, seekRange: 10, speed: 2.4 },
    [{ type: 'samurai', n: 8, o: { keep: true } }, { type: 'ashigaru', n: 6, o: { flagScale: 1, keep: true } }, { type: 'gun', n: 2 }]);
    F.ieh.kind = 'main'; F.ieh.stay = true; F.foes.push(F.ieh);
    F.iehS = enemyGroup(rt, { faction: 'shimazu', name: '島津家久の本陣', anchor: SEAT, facing: 0, width: 2, aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true },
      [{ type: 'busho', n: 1, o: { name: '島津家久', invuln: true, horse: false, keep: true } }]);
    F.iehS.stay = true; F.iehS.noAI = true;
    for (const u of F.iehS.units) {
      u.invuln = true; u.noTarget = true;
      u.pos.set(SEAT.x, rt.world.heightAt(SEAT.x, SEAT.z), SEAT.z + 0.35); u.mesh.position.copy(u.pos);
      u.jinchu = { standing: false, t: 99, len: 1, soldiers: [] };
    }
    // 四国の衆は不意を突かれて士気が落ちる
    for (const b of [B.sen, B.nobu, B.sogo]) if (b) b.morale = Math.min(b.morale, 48);
    rt.army.play('toki', WOODS[0], 1.5); rt.after(0.4, () => rt.army.play('toki', WOODS[1], 1.5));
    for (const [i, w] of WOODS.entries()) rt.after(0.8 + i * 0.5, () => rt.army.play('volley', { x: (w.x + RING.x) / 2, z: (w.z + RING.z) / 2 }, 1.2));
    sfx('taiko', 1);
    rt.say('長宗我部元親', '伏せじゃ！　両の林から島津が出たぞ', 3);
    rt.after(5, () => rt.say('島津家久', '釣り出したぞ。三方から包め。一人も川へ戻すな', 3));
    rt.after(14, () => { if (F.tsuneU?.alive) rt.say('戸次統常', '父の汚名、ここで雪ぐ。戸次の者、退くな！', 3); });
    // 仙石の隊が先に崩れる（史実：仙石は讃岐まで逃げた）
    rt.after(32, () => {
      if (F.step !== 3) return;
      rt.say('仙石秀久', 'ええい、退け、退け！', 2.5);
      routButai(B.sen, 26);
      if (live(F.sen)) {
        F.sen.order = 'move'; F.sen.dest = { x: FORD.x, z: -24 }; F.sen.speed = 4.4;
        // 北の口へ寄せてから渡る。河原から南岸へ斜めに走ると浅瀬を外れる。
        F.sen.onArrive = (q) => {
          q.order = 'move'; q.dest = { x: FORD.x, z: 40 };
          q.onArrive = (s) => { s.order = 'move'; s.dest = { x: CAMP.x + 12, z: CAMP.z + 12 }; s.onArrive = null; };
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
      rt.army.kill(u, by || null);
      rt.banner(`${who}、討死`, '');
    };
    kyuen.sogoFall(rt, K);   // 十河は救援の知らせの時に先に討たれている
    rt.after(1.4, () => fall(F.tsuneU, '戸次統常'));
    rt.after(2.6, () => { fall(F.nobuU, '長宗我部信親', F.suzukiU?.alive ? F.suzukiU : null); routButai(B.nobu, 30); rt.say('鈴木大膳', '長宗我部信親、討ち取ったり！', 2.4); });
    // 夜へ移ろう（包みの段の六十秒から。まだなら今から。四6）
    if (!F.nightGo) { F.nightGo = true; rt.world.setTime?.('night'); }
    rt.after(3.8, () => rt.say(F.mine.leader?.name || '手勢の侍', `${nm(rt)}殿、信親様が……！　ここは退くほかござらぬ`, 3.2));
    F.follow = [];
    // 西の林から南岸へ直進すると浅瀬を外れる。北の口へ集まり、浅瀬をまっすぐ戻る。
    for (const g of [F.nobu, F.sogo, F.tsune, ...(F.allyBands || [])]) if (live(g)) {
      g.order = 'move'; g.dest = { x: FORD.x, z: -24 }; g.speed = 3.6; g.aggro = 6; g.seekRange = 6;
      g.onArrive = (q) => { q.order = 'move'; q.dest = { x: FORD.x, z: 40 }; q.onArrive = null; };
    }
    // 元親も渡りの手前から落ちていく（史実：伊予の日振島へ逃れた）
    this.go(B.moto, { x: CAMP.x + 30, z: CAMP.z + 24 }, 1.8, { back: true });
    if (live(F.moto)) { F.moto.order = 'move'; F.moto.dest = { x: CAMP.x + 20, z: CAMP.z + 30 }; F.moto.speed = 3.8; }
    rt.after(6.4, () => rt.say('長宗我部元親', '弥三郎が……。退け、退くのじゃ', 3));
    rt.after(5, () => this.toStep(rt, 4));
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
    F.suzukiU = F.suzuki.units.find((s) => s.type === 'busho');
    if (F.suzukiU) { F.suzukiU.invuln = true; F.suzukiU.mustLive = true; F.suzukiU.noTarget = false; }
    rt.army.play('toki', at, 1.2);
    rt.say('長宗我部信親', '退かぬ。信親はここで斬り死にいたす！', 3);
    rt.after(6, () => rt.say(F.mine.leader?.name || '手勢の侍', '尾根の陰から新手じゃ！　信親様の馬印へ寄れ！', 3));
  },

  // 夜の追手：浅瀬を渡って追ってくる本物の組。cut は下の瀬から行く手を塞ぐ組（足を緩めない）
  spawnChase(rt, at = { x: FORD.x, z: -14 }, cut = false) {
    const F = rt.flags;
    let n = aliveReal(rt);
    const size = cut ? 6 : 8;
    for (let i = 0; i < 2 && n + size <= 250; i++) {
      const g = enemyGroup(rt, { faction: 'shimazu', name: cut ? '下の瀬の島津' : '島津の追手', anchor: { x: at.x + (i ? 1 : -1) * (cut ? 4 : 14), z: at.z }, facing: Math.PI, width: 4, noRout: true, formation: 'line',
        morale: 90, dmgMult: 0.7, order: 'attack', seekRange: cut ? 120 : 70, aggro: 14, speed: 4.4 },
      [{ type: 'ashigaru', n: cut ? 5 : 7 }, { type: 'samurai', n: 1 }]);
      g.kind = 'chase'; g.cut = cut; F.foes.push(g); n += size;
      if (!cut) g.focus = rt.player.u;
      // 11/8：下の瀬の組が土手の道の上に並んで道を塞ぎ、馬が押し通れずに囲まれて討たれた（十二3）。また後から出すと、着く前に本人が抜けて一度も当たらなかった（九2）。
      //   本人が北の岸にいる退く段の始めに下の瀬を渡り、渡り終えたら止まらず追う。
      if (cut) { g.order = 'move'; g.dest = { x: -74 + i * 8, z: 24 }; g.speed = 4.4; g.cutI = i; g.onArrive = (q) => { q.order = 'attack'; q.dest = null; this.cutCharge(rt); }; }
    }
  },
  // ⑤：渡り終えた追手は主人公と落ち武者を追う。
  cutCharge(rt) {
    const F = rt.flags;
    let stray = null;
    for (const s of F.strays || []) {
      stray = s.units.find((u) => u.alive && !u.gone);
      if (stray) break;
    }
    for (const g of F.foes) if (g.cut && live(g)) {
      // 下の瀬を渡る途中なら渡り切るまで道順を保つ。対岸で待ち伏せしない。
      if (g.order === 'move') continue;
      g.order = 'attack'; g.dest = null; g.onArrive = null; g.speed = 4.4; g.aggro = 14;
      // 二つ目は川下の土手を落ちていく落ち武者を追う（北の岸へ戻って別の的を探さない）
      if (g.cutI === 0 || !stray) { g.focus = rt.player.u; g.seekRange = 120; } else { g.focus = stray; g.seekRange = 60; }
    }
  },

  update(rt, dt) {
    const F = rt.flags, B = F.blk;
    if (F.ending || !F.step) return;
    const P = rt.player.u;
    // 史実の斬り合いを進行条件にした二人だけは、深手で退いた後に戻す。
    // 共通の深手は戦の間戻らず、信親を見失った鈴木の組は狙いも解くため、救援が終わらなくなっていた。
    if (!F.ringClosed) {
      guardRecover(rt, F.nobuU, dt, HISTORICAL_RETURN);
      guardRecover(rt, F.suzukiU, dt, HISTORICAL_RETURN);
      if (live(F.suzuki) && F.nobuU?.alive && !F.nobuU.noTarget) F.suzuki.focus = F.nobuU;
    }
    butaiTick(rt, dt);
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
        const a = g.anchor || (g.anchor = { x: to.x, z: to.z });
        const dx = to.x - a.x, dz = to.z - a.z;
        if (dx * dx + dz * dz > 4) g.facing = Math.atan2(dx, dz);
        a.x = to.x; a.z = to.z; g.aggro = aggro; g.seekRange = seek;
      };
      const g = F.mine;
      // 退く段は、手勢は退き口（浅瀬の南の岸→鏡城）へ駆ける。行き先は段ごとに一度だけ決める
      //   11/8 一5：退く段で手勢が先に陣へ駆け去り、本人は浅瀬と土手を一人で逃げて囲まれた。手勢は本人の後ろに付いて殿をする
      if (live(g) && F.step >= 4) { g.speed = 4.8; keep(g, F.step === 4 ? { x: P.pos.x + 1.5, z: P.pos.z - 3 } : { x: P.pos.x + 3, z: P.pos.z + 1 }, 8, 10); }
      else if (live(g)) keep(g, { x: P.pos.x + 1.5, z: P.pos.z - 2 }, 12, 14);
      // 名のある将の組は、自分の塊の中ほどに付いて動き、そこで戦う
      for (const [g, b, dx, dz] of F.follow) {
        if (!live(g) || !b || b.routedL) continue;
        const p = lightPos(b);
        keep(g, { x: p.x + dx, z: p.z + dz }, 14, 16);
      }
      for (const [g, b, dx, dz] of F.followFoe) {
        if (!live(g) || !b || b.routedL) continue;
        const p = lightPos(b);
        keep(g, { x: p.x + dx, z: p.z + dz }, 4, 6);
      }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const squadAlive = (rt.squad || []).filter((s) => s.alive).length;
    // 11/8 bot：退く段（④⑤）で殿の手勢が追手に討ち尽くされ、本人が生きて土手を走っているのに負けになった。退き口の務めは生きて戻る事なので、負けは③までだけ
    if (F.step >= 2 && F.step < 4 && !live(F.mine) && !squadAlive) { this.lose(rt, '連れた兵が全部討たれた'); return; }
    const el = rt.t - F.stepT;
    // 四国の衆が北の岸へ上がってから当たる（自分だけ先に着いても、皆が渡るのを待つ）
    //   信親の旗本（本物）が北の岸に上がりきるまで、伊集院の先手は構えて待つ（自分一人が先に着いて囲まれない）
    if (F.step === 1) shinkou.update(rt, K);
    if (F.step === 1 && shinkou.crossing(rt) && P.pos.z < -14 && lightPos(B.nobu).z < -20 && (!live(F.nobu) || F.nobu.center().z < -16)) this.toStep(rt, 2);
    else if (F.step === 2) {
      // 先手は当たって少し討たれると退く（退くふり）。退いた先まで追うと包みが閉じる
      // 囮の先手は本気で戦わない（史実：当たってすぐ退いた）。替わった本物の兵の手は軽く
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.feignSoft) { g.feignSoft = true; g.feignDmg = g.dmgMult ?? 1; g.dmgMult = Math.min(g.feignDmg, 0.45); }
      // 替わった先手の兵は待たずに四国の衆と本人へ槍を入れる（退くふりの前は本当に当たる。九2）
      if (!F.feigned) for (const g of rt.army.groups) if (g.team === 1 && g.count && g.order === 'hold' && g.kind !== 'main' && !g.gunLine) { g.order = 'attack'; g.seekRange = 26; g.aggro = 12; }
      if (!F.feigned && (rt.stats.kills > F.ijKills0 || rt.stats.taken > F.ijTaken0) && el > 60) this.feign(rt);   // 本人が先手と当たってから退く。時間だけで交戦を果たさない。
      if (F.feigned) tsuigeki.update(rt, K);
      if (F.feigned && tsuigeki.ready(rt, K)) this.toStep(rt, 3);
    } else if (F.step === 3) {
      // 包む島津の兵（塊から替わった本物）は、待たずに四国の衆と本人へ打ち掛かる
      for (const g of rt.army.groups) if (g.team === 1 && g.count && g.order === 'hold' && g !== F.ieh && g !== F.iehS && !g.interiorHold && g.kind !== 'main' && !g.gunLine) { g.order = 'attack'; g.seekRange = 30; g.aggro = 14; g.noRout = true; }
      // 囮の手加減を解いてから包む。元から弱い旗本の攻撃力は保つ。
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.ringSoft && g !== F.ieh && g !== F.iehS) { g.ringSoft = true; g.dmgMult = Math.min(g.feignDmg ?? g.dmgMult ?? 1, 0.8); }
      kyuen.update(rt, K, el);   // 伏せ→その場で防ぐ→信親の救援→鈴木大膳→信親の討死（夜へ移ろう。t06_hetsugi/kyuen.js）
    } else if (F.step === 4) { shingari.update(rt); if (shingari.crossNow(rt) && P.pos.z > 26) this.toStep(rt, 5); }
    // 柵（半径十一 m）の外で生還にせず、東の口を抜けて陣内へ戻るまで遊ばせる。
    else if (F.step === 5 && dist(P.pos, CAMP) < 8) this.win(rt);
    // 下の瀬の島津が土手へ上がって見えた所で知らせる（史実：追い討ちで多くが討たれた）
    if (F.step === 5 && !F.chase2Said && P.pos.x < -30) { F.chase2Said = true; rt.say(F.mine.leader?.name || '手勢の侍', '島津が川を渡って追って来たぞ。鏡城へ走れ！', 2.6); }
    // 退く段も島津は勢いを保ち、川を渡って追う。止まれば囲まれる。
    if (F.step >= 4) {
      if ((F.chaseT = (F.chaseT || 0) - 0.25) <= 0) {
        F.chaseT = 2;
        // 渡り終えた時と、落ち武者が討たれた後も追う相手を更新する。
        this.cutCharge(rt);
        const to = { x: P.pos.x, z: Math.min(P.pos.z, F.step >= 5 ? 40 : -6) };
        for (const b of [B.niiro, B.honjo, B.ieh, B.ijuin]) if (b && !b.routedL && dist(lightPos(b), P.pos) > 30) this.go(b, to, 2.2, { charge: true });
      }
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.chaseSoft && g !== F.ieh && g !== F.iehS) {
        g.chaseSoft = true; g.dmgMult = Math.min(g.dmgMult || 1, 0.7);
        if (!g.cut) g.speed = 4.4;
        if (g.order === 'hold' && g.kind !== 'main' && !g.cut) { g.order = 'attack'; g.seekRange = 40; g.aggro = 12; }
      }
      if (!F.breath) { F.breath = true; P.hp = Math.max(P.hp, P.maxHp * 0.7); }
      // 浅瀬を外れた者は、川の真ん中（腰より深い所）で冬の速い流れに足を取られて沈む（四人まで。浅瀬の内では沈まない）
      if (live(F.deep) && F.drown < 4 && !(F.drownT > rt.t)) {
        const W = rt.world, offFord = (x) => Math.abs(x - FORD.x) > FORD.w && Math.abs(x - FORD2.x) > FORD2.w;
        const u = F.deep.units.find((v) => v.alive && !v.gone && offFord(v.pos.x) && (W.waterDepthAt?.(v.pos.x, v.pos.z) || 0) > 0.7);
        if (u) {
          F.drownT = rt.t + 2.2; F.drown++; rt.army.kill(u, null);
          if (F.drown === 1) rt.say('土佐の足軽', '深みじゃ！　足が届かぬ……！', 2.4);
        }
      }
    }
    // 遠く離れた追撃兵は去らせる。本陣の旗本と史実で生き残る将は保つ。
    if (F.step === 5) for (const g of F.foes) if (!g.cut && !g.stay) for (const u of g.units) if (u.alive && !u.gone && !u.invuln && dist(u.pos, P.pos) > 110) rt.army.despawn(u);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
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
    else if (F.step === 2) q = F.feigned ? tsuigeki.pin(b, K) : lightPos(F.blk.ijuin);
    else if (F.step === 3) q = kyuen.pin(b) || { x: RING.x, z: RING.z + 6 };
    // 浅瀬の外の深みは斜めに渡らない：まず北の岸で浅瀬の口へ寄ってから、まっすぐ渡る
    else if (F.step === 4 && !shingari.crossNow(b)) q = shingari.MOUTH_N;   // 殿：浅瀬の北の口で防ぐ
    else if (F.step === 4 && u.pos.z < -30) q = { x: FORD.x, z: -14 };   // 河原の奥からは浅瀬の口へまっすぐ
    else if (F.step === 4) q = Math.abs(u.pos.x - FORD.x) > 8 && u.pos.z < 22 ? { x: FORD.x, z: Math.min(u.pos.z, -14) } : u.pos.z < -12 ? { x: FORD.x, z: -10 } : { x: FORD.x, z: 34 };
    // 陣の柵（半径十一 m）は東に口がある。外からは東の口の前へ回ってから中へ（柵の西の外で止まった。11/9 bot）
    else q = dist(u.pos, CAMP) > 9 && (Math.abs(u.pos.z - CAMP.z) > 3 || u.pos.x < CAMP.x) ? { x: CAMP.x + 17, z: CAMP.z } : CAMP;
    goTo(p, inp, q.x, q.z, 2);
  },
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t06_hetsugi);

// 段のファイルへ渡す物（t06_hetsugi/*.js）
const K = {
  FORD, CASTLE, GATE_A, FORT_R, ARM, RING, CAMP,
  get talk() { return t06_hetsugi.talk; },
  go: (b, to, s, o) => t06_hetsugi.go(b, to, s, o),
  lightPos, routButai,
  lastStand: (rt) => t06_hetsugi.lastStand(rt),
  closeRing: (rt) => t06_hetsugi.closeRing(rt),
};

export { t06_hetsugi };
