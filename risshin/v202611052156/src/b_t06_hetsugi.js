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
import { enemyGroup, allyGroup, nm } from './bhelp.js';
import { naginata } from './humans.js';
import { nobori, palisade, dorui, yagura, hut, jinmaku, shogi, kabukimon, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { KIT } from './b_nagashinojo.js';
import { sfx } from './audio.js';
import { MEM_TIGHT } from './settings.js';
import { withGuard } from './toyo_bot.js';
import { fieldButai, fieldTick, routButai, lightPos } from './b_yasen.js';
import { butaiTick } from './butai.js';
import { addSite } from './map_sites.js';

const START = { x: 10, z: 64 };              // 川の手前（信親の備のすぐ後ろ。前に四国の衆が並ぶ）
const FORD = { x: 20, w: 22 };               // 浅瀬（川の中ほどの x と幅の半分）
const FORD2 = { x: -70, w: 12 };
const RIVER_Z = 0;
const RIVER = [[-270, 6], [-150, -3], [-40, 2], [60, -2], [170, 4], [270, -2]];
const CASTLE = { x: 70, z: -150 };           // 鶴賀城（尾根の上の主郭）
const FORT_R = 17;                           // 主郭（東西四十 m・南北二十五 m ほどを低い土塁で囲む）
const GATE_A = Math.PI * 1.25;               // 虎口の向き（南西＝浅瀬からの道の側）
const CAMP = { x: -170, z: 84 };             // 鏡城の下の味方の陣（渡る前の岸）
const IJUIN = { x: 40, z: -72 };             // 伊集院久宣の先手（鶴賀城の下の囲みの陣）
const WOODS = [{ x: -40, z: -128 }, { x: 122, z: -84 }];   // 釣り野伏せの林（西：新納大膳＝信親の横から見て左前・東：島津豊久＝右）
const IEHISA = { x: 0, z: -182 };            // 島津家久の本隊（尾根の西の陰）
const RING = { x: 22, z: -100 };             // 包みが閉じる所（中津留の河原の上）
const SEAT = { x: 4, z: -214 };              // 島津家久の本陣（尾根の西の陰のさらに後ろ。床几に座って動かない）
const KAGAMI = { x: -200, z: 132 };          // 鏡城（渡る前の岸の川下の丘。陣はその麓）
const SC = MEM_TIGHT ? 20 : 12;              // 塊の一人が史実の何人か
// 史実の兵数（調べ：豊臣方は六千ほどが渡った、島津は一万〜一万三千・新納大膳 五千・長宗我部 三千）
const HIST = { sen: 2000, nobu: 2000, sogo: 1000, moto: 1000, ijuin: 2000, niiro: 5000, honjo: 2000, ieh: 3000 };
const A0 = HIST.sen + HIST.nobu + HIST.sogo + HIST.moto, B0 = HIST.ijuin + HIST.niiro + HIST.honjo + HIST.ieh;
const STEP_TEXT = ['浅瀬を渡り、鶴賀城の下の島津の陣の前まで進む', '鶴賀城の下の島津の先手（伊集院）に槍を入れ、退くのを中津留の河原まで追う',
  '中津留の河原の長宗我部信親様の馬印の横に立ち、三方から来る島津を食い止める', '中津留の河原を走り、浅瀬を西の岸へ渡って退く', '夜の土手を川下へ走り、鏡城の下の味方の陣まで逃げ切る'];

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
function height(x, z) {
  const rz = z - riverZ(x);
  let h = 1.1 + 0.25 * Math.sin(x * 0.021) * Math.cos(z * 0.017);
  h -= 0.7 * (1 - sm(14, 40, Math.abs(rz)));
  // 瀬の砂利の州：上へだけ足し、水面は下げない
  const bar = Math.sin(x * 0.19 + z * 0.07) * Math.cos(z * 0.31 - x * 0.05) + 0.6 * Math.sin(x * 0.43 - z * 0.29 + 1.3);
  h += Math.max(0, bar - 0.25) * 0.32 * (1 - sm(12, 26, Math.abs(rz)));
  const k = ridge(x, z);
  if (rz < 0) h += 2.6 * sm(-30, -100, rz) + 5 * sm(-190, -250, rz);
  h += 38 * k;                                 // 鶴賀城の山（麓から高く。人の背と比べて山城に見える高さ）
  h += 13 * Math.exp(-(((x - KAGAMI.x) / 30) ** 2) - (((z - KAGAMI.z) / 26) ** 2));   // 鏡城の丘
  // 実の起伏は河原の平ら（中津留の河原・川から九十 m ほど）の外だけ
  h += Math.max(-2, relief(x, z)) * sm(90, 170, Math.abs(rz)) * (1 - k);
  return h;
}

const live = (g) => g && g.count > 0;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const aliveReal = (rt) => { let n = 0; for (const u of rt.army.units) if (u.alive && !u.gone && !u.isStruct) n++; return n; };
// 組の全員に家の旗を（allyGroup の既定は織田の旗）
const fl = (list, flag) => list.map((s) => ({ ...s, o: { flag, ...(s.o || {}) } }));
const ARM = { shimazu: 0x1c1a1a, chosokabe: 0x2a2622, miyoshi: 0x2c2826, toyotomi: 0x2a2420 };

// 段ごとの行き先（固定。着いたら次の段へ）
const GOAL = [null, { x: IJUIN.x - 8, z: -44 }, { x: RING.x, z: RING.z + 6 }, { x: 6, z: -96 }, { x: FORD.x, z: 34 }, { x: CAMP.x, z: CAMP.z }];
const NOUN = [null, '鶴賀城の下', '中津留の河原', '長宗我部信親', '戸次川の浅瀬', '鏡城の下の陣'];

const t06_hetsugi = {
  // 右上に①〜⑤の目標を最初から全部並べ、果たした物に印（kaito 九1・十1）。一行の札（missionSingleLine）は使わない
  hideMissionDots: true,
  goalSignNoLabel: true,
  singleDestinationArrow: true,
  kumiLead: false,           // 意味の分からない青い小旗の印を出さない（五2）
  noLeaderFollow: true,
  nameRange: 90,
  noHatamotoMass: true,      // 将の周りに見せかけの兵を足さない（見える兵は全部台本の本物・九5。本物の兵の数も二百五十ほどに）             // 名のある将（信親・十河・仙石・統常・伊集院・新納・豊久）の名を遠くから出す（五2・九3）
  goals5(rt) {
    const F = rt.flags, won = () => rt.tracker?.main === true, at = (n) => () => ({ x: GOAL[n].x, z: GOAL[n].z }), past = (n) => () => won() || (F.step || 0) > n;
    return STEP_TEXT.map((text, i) => ({ kind: 'stage', k: i, text, noun: NOUN[i + 1], place: at(i + 1), check: i === 4 ? won : past(i + 1) }));
  },
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
  playerAtkMax: 3,
  playerTaken: 0.5,
  playerRegen: 0.025,
  closeCombatAssist: true,
  autoTargetCamera: true,
  steadyMeleeCamera: true,
  noWinCrane: true,
  compactIntro: true,
  keepMix: false,
  missions: STEP_TEXT,
  missionOf(rt) { return STEP_TEXT[Math.max(0, (rt.flags.step || 1) - 1)]; },
  introText: () => '夕刻、島津に囲まれた鶴賀城を救いに戸次川を渡る。島津の退くふりの罠に落ちても、生きて鏡城の下の陣へ戻れ。',
  minutes: 9,
  sides: { a: { name: '豊臣勢 六千', mon: 'chosokabe' }, b: { name: '島津勢 一万余', mon: 'shimazu' } },
  // 両軍の残り（史実の数）：塊の名目から。まだ林に伏せている島津も数に入れる
  force(rt) {
    const F = rt.flags;
    if (!F.blk) return null;
    const n = (b, h) => (b ? b.aliveNominal() * SC : h);
    const B = F.blk;
    return { a: n(B.sen) + n(B.nobu) + n(B.sogo) + n(B.moto), b: n(B.ijuin) + n(B.niiro, HIST.niiro) + n(B.honjo, HIST.honjo) + n(B.ieh, HIST.ieh), a0: A0, b0: B0 };
  },
  date: () => '天正十四年（1586）十二月十二日',   // 一行に収める（「夕刻」が二行に割れた。五4）。夕刻と所は本文へ
  talk: {
    before: [['大友の使者', '島津家久が豊後へ攻め入り、鶴賀の城を囲んでおります。なにとぞお救いを'], ['仙石秀久', '殿下の先手として九州へ渡ったのは、大友を救うためじゃ'],
      ['長宗我部元親', '島津は退くふりをする。殿下の本隊を待つべし'], ['十河存保', '待てば鶴賀が落ちる。わしは仙石殿に従う'], ['仙石秀久', '軍監はわしじゃ。皆、川を渡れ']],
    after: [['主人公', '信親殿を、お救いできませなんだ'], ['長宗我部元親', '……生きて戻った者がおる。それでよい']],
  },
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  world: {
    seed: 15861,
    time: 'dusk',
    groundHalf: 260,
    battleViewDistance: 140,   // 川向こうの島津の陣と鶴賀城の尾根が霞に消えないように
    moveLim: 248,
    noFoeNear: true,         // 敵の後詰めを本人の近くへ寄せない（見せかけの軍勢で囲まない。AQ の 6）
    autumn: true,            // 師走：枯れ草の河原
    patchyGround: true,
    noGroundRipples: true,
    height,
    riverCross: true,
    wadeDepth: 0.85,
    streams: [{ pts: [...RIVER].reverse(), w: 26, depth: 1.7, fords: [FORD, FORD2] }],   // 大野川は大きな川（細い帯にしない）
    paths: [{ pts: [[START.x, 160], [FORD.x, 20], [FORD.x, -20], [IJUIN.x - 6, -60], [CASTLE.x - 30, -112], [CASTLE.x + Math.sin(GATE_A) * (FORT_R + 2), CASTLE.z + Math.cos(GATE_A) * (FORT_R + 2)]], w: 3 },
      { pts: [[FORD.x, 30], [-60, 52], [-120, 70], [CAMP.x, CAMP.z]], w: 2.5 }],
    groves: [
      ...WOODS.map((w) => ({ x: w.x, z: w.z, r: 30, n: 52, kind: 'sugi' })),
      { x: IEHISA.x - 20, z: IEHISA.z - 26, r: 26, n: 30 }, { x: CASTLE.x + 40, z: CASTLE.z + 10, r: 26, n: 34 },
      { x: CASTLE.x - 30, z: CASTLE.z - 30, r: 22, n: 26 },
      { x: -236, z: 44, r: 20, n: 20 }, { x: 150, z: 140, r: 20, n: 18 },
    ],
    trees: 140,
    tufts: 2400,
    treeDensity: (x, z) => (Math.abs(z - riverZ(x)) < 90 || dist({ x, z }, CASTLE) < FORT_R + 6 || dist({ x, z }, KAGAMI) < 16 ? 0 : 0.6),
    clear: (x, z) => Math.abs(z - riverZ(x)) < 30 || dist({ x, z }, CASTLE) < FORT_R + 4 || dist({ x, z }, CAMP) < 16 || dist({ x, z }, KAGAMI) < 14,
    fleeOut: (x, z, team) => (team === 1 ? z < -250 : x < -250 || z > 250),
  },

  setup(rt) {
    const F = rt.flags;
    F.step = 0; F.holdPlayer = true; F.foes = []; F.ending = false; F.blk = {}; F.blocks = [];
    this.castle(rt);
    this.kagami(rt);
    this.sunTurn(rt);
    // 家久の本陣の陣幕と床几（伏せの段まで中は見えない後ろ）
    rt.scene.add(jinmaku(rt.world, SEAT.x, SEAT.z, 12, 8, 4, { mon: 'shimazu' }));
    rt.scene.add(shogi(rt.world, SEAT.x, SEAT.z, 0, { gunbai: true }));
    for (const [dx, dz] of [[-8, 6], [8, 6], [-14, -2], [14, -2]]) rt.scene.add(nobori(rt.world, SEAT.x + dx, SEAT.z + dz, 'shimazu', 6));
    // 豊臣方の塊（渡る前の岸）。仙石が先陣、信親が左、十河が右、元親は後ろで渡らずに残る
    const B = F.blk;
    // 信親と仙石の備は本人の前（始めから画面に四国の衆が映る。九4）
    B.sen = this.block(rt, { key: 'sen', name: '仙石秀久の備', team: 0, flag: 'toyotomi', at: { x: 44, z: 40 }, facing: Math.PI, w: 30, d: 10 });
    B.nobu = this.block(rt, { key: 'nobu', name: '長宗我部信親の備', team: 0, flag: 'chosokabe', at: { x: 10, z: 44 }, facing: Math.PI, w: 30, d: 10 });
    B.sogo = this.block(rt, { key: 'sogo', name: '十河存保の備', team: 0, flag: 'miyoshi', at: { x: 92, z: 62 }, facing: Math.PI, w: 26, d: 8 });
    B.moto = this.block(rt, { key: 'moto', name: '長宗我部元親の備', team: 0, flag: 'chosokabe', at: { x: -4, z: 96 }, facing: Math.PI, w: 26, d: 8 });
    // 島津の先手（伊集院久宣）：鶴賀城の下の囲みの陣
    B.ijuin = this.block(rt, { key: 'ijuin', name: '伊集院久宣の備', team: 1, flag: 'shimazu', at: IJUIN, facing: 0, w: 38, d: 10 });
    // 名のある将の本物の組（塊と一緒に動く）
    const ally = (o, list, flag) => { const g = allyGroup(rt, { fullStrength: true, facing: Math.PI, width: 5, aggro: 9, speed: 3.4, order: 'hold', noRout: true, ...o }, fl(list, flag)); g.mon = flag; return g; };
    F.nobu = ally({ name: '長宗我部信親の旗本', anchor: { x: 8, z: 52 } }, [{ type: 'busho', n: 1, o: { name: '長宗我部信親', invuln: true, horse: true, weapon: 'spear' } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }], 'chosokabe');
    F.nobuU = F.nobu.units.find((u) => u.type === 'busho');
    if (F.nobuU) naginata(F.nobuU);   // 信親は大長刀で八人を斬ったと『元親記』

    F.sogo = ally({ name: '十河存保の旗本', anchor: { x: 92, z: 70 } }, [{ type: 'busho', n: 1, o: { name: '十河存保', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }], 'miyoshi');
    F.sogoU = F.sogo.units.find((u) => u.type === 'busho');
    F.sen = ally({ name: '仙石秀久の旗本', anchor: { x: 56, z: 48 } }, [{ type: 'busho', n: 1, o: { name: '仙石秀久', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }], 'toyotomi');
    F.moto = ally({ name: '長宗我部元親の旗本', anchor: { x: -4, z: 104 }, aggro: 6, seekRange: 10 }, [{ type: 'busho', n: 1, o: { name: '長宗我部元親', invuln: true, horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 2, o: { flagScale: 1 } }], 'chosokabe');
    F.mine = ally({ name: '手勢', anchor: { x: START.x + 3, z: START.z + 5 }, width: 4, speed: 3.8, dmgMult: 0.9 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 13 }], 'chosokabe');
    // 戸次統常（大友方。父の汚名を雪ぐと志願し、一族郎党と討死）。十河の備の脇に付く
    F.tsune = ally({ name: '戸次統常の手', anchor: { x: 110, z: 66 } }, [{ type: 'busho', n: 1, o: { name: '戸次統常', invuln: true, horse: true } }, { type: 'samurai', n: 4 }], 'otomo');
    F.tsuneU = F.tsune.units.find((u) => u.type === 'busho');
    F.follow = [[F.nobu, B.nobu, 6, 4], [F.sogo, B.sogo, 0, 4], [F.sen, B.sen, 0, 4], [F.tsune, B.sogo, 14, 2]];
    // 備の前の本物の兵（共通の作りで、軽い兵は百五十 m の外だけに描き、近くで本物に替えない。戦う兵は台本の隊だけ・九5）
    //   四国の衆は本人と一緒に浅瀬を渡り、伊集院に当たり、包みで討たれる。塊の動きに付いて歩く
    const T = MEM_TIGHT ? 0.75 : 1, k = (n) => Math.max(3, Math.round(n * T));
    F.troops = [];
    const troop = (name, b, dx, dz, list, flag) => { const p = lightPos(b); const g = ally({ name, anchor: { x: p.x + dx, z: p.z + dz }, width: 6, aggro: 12, seekRange: 14 }, list, flag); F.follow.push([g, b, dx, dz]); F.troops.push(g); return g; };
    troop('長宗我部信親の備の槍', B.nobu, -4, -6, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: k(10), o: { weapon: 'spear' } }], 'chosokabe');
    troop('長宗我部信親の備の鉄砲', B.nobu, 12, -6, [{ type: 'gun', n: k(6) }], 'chosokabe');
    troop('仙石秀久の備の槍', B.sen, -6, -6, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: k(9), o: { weapon: 'spear' } }], 'toyotomi');
    troop('十河存保の備の槍', B.sogo, -8, -6, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: k(8), o: { weapon: 'spear' } }], 'miyoshi');
    // 島津の名のある将は馬上で旗本に囲まれ、自分の備と動く（足軽一人を追わない・討てない）
    F.followFoe = [];
    F.foeT = [];   // 島津の備の前の本物の兵 [組, 塊, dx, dz]：塊に付いて歩き、着けば打ち掛かる
    this.foeTroop(rt, '伊集院久宣の備の槍', B.ijuin, -6, 6, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: k(10), o: { weapon: 'spear' } }]);
    this.foeTroop(rt, '伊集院久宣の備の鉄砲', B.ijuin, 10, 6, [{ type: 'gun', n: 3 }, { type: 'ashigaru', n: k(6) }]);
    this.foeLord(rt, '伊集院久宣', B.ijuin, IJUIN, 34);   // 囮の先手の将は囲みの陣の奥（鶴賀城の下）
    rt.obj('main', STEP_TEXT[0], 'main', true);
    // 戦の前の会話（終わるまで動かない）
    this.talk.before.forEach(([who, s], i) => rt.after(0.6 + i * 3, () => rt.say(who, s, 2.8)));
    // 軍議の末（「皆、川を渡れ」）の前から、先の備は浅瀬へ歩み出す（本人の前で四国の衆が川に入るのが見える）
    rt.after(9, () => {
      if (F.step) return;
      const to = { nobu: { x: 14, z: 2 }, sen: { x: 36, z: 0 }, sogo: { x: 92, z: 10 } };
      for (const key in to) this.go(B[key], to[key], 2.2);
      // 備の本物の兵と旗本も一緒に歩み出す（塊だけ先へ行かない）
      for (const [g, b, dx, dz] of F.follow) { const q = to[b.key]; if (q && live(g)) { g.order = 'move'; g.dest = { x: q.x + dx, z: q.z + dz }; g.speed = 2.4; } }
    });
    rt.after(0.6 + this.talk.before.length * 3, () => { F.holdPlayer = false; this.toStep(rt, 1); });
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

  // 島津の名のある将（馬上）と旗本。塊の後ろに付いて動く
  foeLord(rt, name, b, at, back = 20) {
    const g = enemyGroup(rt, { faction: 'shimazu', name: `${name}の旗本`, anchor: { x: at.x, z: at.z - back }, facing: 0, width: 4, formation: 'line', noRout: true,
      morale: 100, dmgMult: 0.35, order: 'hold', aggro: 4, seekRange: 6, speed: 2.6 },
    [{ type: 'busho', n: 1, o: { name, invuln: true, horse: true, keep: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 2, o: { flagScale: 1 } }]);
    g.kind = 'main'; g.mon = 'shimazu';
    rt.flags.followFoe.push([g, b, 0, -back]);   // 備の後ろで下知する。前に出て足軽を追わない
    return g;
  },

  foeTroop(rt, name, b, dx, dz, list) {
    const p = lightPos(b);
    const g = enemyGroup(rt, { faction: 'shimazu', name, anchor: { x: p.x + dx, z: p.z + dz }, facing: 0, width: 6, formation: 'line', noRout: true,
      morale: 90, dmgMult: 0.32, order: 'hold', aggro: 10, seekRange: 12, speed: 3 }, list);
    g.mon = 'shimazu'; g.kind = 'troop';
    rt.flags.foeT.push([g, b, dx, dz]); rt.flags.foes.push(g);
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
    rt.scene.add(yagura(W, q.x + 4, q.z - 5, { team: 0, logFrame: true, kind: 'ro', height: 8, boarded: true }));
    rt.scene.add(yagura(W, q.x + Math.sin(GATE_A) * (FORT_R - 3) + 3, q.z + Math.cos(GATE_A) * (FORT_R - 3), { team: 0, logFrame: true, kind: 'ro', height: 6.5, boarded: true }));
    // 虎口の冠木門と、主郭の隅の櫓・城主の館（小屋二つに見えない山城の本丸。四5）
    rt.scene.add(kabukimon(W, q.x + Math.sin(GATE_A) * FORT_R, q.z + Math.cos(GATE_A) * FORT_R, 4.6, GATE_A));
    rt.scene.add(yagura(W, q.x - 11, q.z + 7, { team: 0, logFrame: true, kind: 'ro', height: 7, boarded: true }));
    rt.scene.add(yagura(W, q.x + 10, q.z + 9, { team: 0, logFrame: true, kind: 'ro', height: 6.5, boarded: true }));
    rt.scene.add(hut(W, q.x - 3, q.z + 2, 11, 7, 0.3, { roof: 0x5a4c38 }));
    rt.scene.add(hut(W, q.x + 7, q.z - 1, 6, 4, 0.3, { roof: 0x6a5c44 }));
    for (const [dx, dz] of [[-6, -9], [8, 6], [0, -13], [-12, 1]]) rt.scene.add(nobori(W, q.x + dx, q.z + dz, 'otomo', 6));
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
    // 鏡城：陣の後ろ（実の西）の丘の上に柵と櫓。陣はその麓（四5・二1）
    const k = KAGAMI, kb = makeSimpleBatch(), kr = 10, kn = 14;
    for (let i = 0; i < kn; i++) {
      if (i === 9) continue;   // 口は陣の側
      const a0 = i / kn * Math.PI * 2, a1 = (i + 1) / kn * Math.PI * 2, am = (a0 + a1) / 2;
      const seg = [k.x + Math.sin(a0) * kr, k.z + Math.cos(a0) * kr, k.x + Math.sin(a1) * kr, k.z + Math.cos(a1) * kr];
      dorui(W, seg, -Math.sin(am), -Math.cos(am), { h: 0.9, w: 2, capEnds: true, closeBack: true, batch: kb });
      palisade(W, seg, { h: 2.4, batch: kb, solid: true });
    }
    finalizeSimpleBatch(rt, kb);
    rt.scene.add(yagura(W, k.x + 2, k.z - 3, { team: 0, logFrame: true, kind: 'ro', height: 7, boarded: true }));
    rt.scene.add(hut(W, k.x - 3, k.z + 3, 7, 5, 0.2, { roof: 0x5a4c38 }));
    for (const [dx, dz] of [[-5, -6], [5, 5], [6, -6]]) rt.scene.add(nobori(W, k.x + dx, k.z + dz, 'otomo', 6));
    addSite(rt, 'castle', k.x, k.z, '鏡城');
    addSite(rt, 'fort', CAMP.x, CAMP.z, '鏡城の下の陣');
    this.campMen(rt);
  },
  campMen(rt) {
    const F = rt.flags;
    F.otomo = allyGroup(rt, { name: '大友義統の陣', fullStrength: true, anchor: { x: CAMP.x, z: CAMP.z - 2 }, facing: Math.PI / 2, width: 4, aggro: 4, seekRange: 8, order: 'hold', fixed: true, noRout: true },
      fl([{ type: 'busho', n: 1, o: { name: '大友義統', invuln: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 3 }], 'otomo'));
    F.otomo.mon = 'otomo';
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
      rt.marker('go', { x: IJUIN.x - 8, z: -44 }, '鶴賀城の下');
      sfx('taiko', 0.8);
      // 四国の衆が皆で浅瀬を渡る（元親は渡らずに残る）
      this.go(B.sen, { x: 40, z: -36 }, 3.4);
      this.go(B.nobu, { x: 10, z: -32 }, 3.4);
      this.go(B.sogo, { x: 92, z: -28 }, 3.2);
    } else if (n === 2) {
      rt.marker('go', { x: RING.x, z: RING.z + 6 }, '中津留の河原');   // 行き先は固定（AW の 3）。先手に当たり、退くのを追った先
      rt.say('仙石秀久', 'かかれ！　鶴賀の囲みを破れ！', 2.6);
      rt.army.play('toki', IJUIN, 1.3);
      this.go(B.sen, { x: 52, z: -58 }, 3, { charge: true });
      this.go(B.nobu, { x: 14, z: -56 }, 3, { charge: true });
      this.go(B.sogo, { x: 84, z: -52 }, 2.8, { charge: true });
      // 伊集院の先手も丘を下りて打ち掛かる（突っ立たない。当たってから退くふり。一3・九2）
      this.go(B.ijuin, { x: 30, z: -62 }, 1.6, { charge: true });
      F.ijN0 = B.ijuin.aliveNominal();
    } else if (n === 3) {
      this.ambush(rt);
      rt.marker('nobu', { x: 6, z: -96 }, '長宗我部信親');   // 信親の備が追い着く中津留の河原（固定）
    } else if (n === 4) {
      rt.marker('ford', { x: FORD.x, z: 34 }, '戸次川の浅瀬');
      sfx('horagai', 0.8);
      // 日が落ちる：退く間に夕から夜へ移ろう（一度だけ。空が昼と夕を行き来しない。二2・四6）
      rt.world.setTime?.('night');
      // 河原の島津が背へ打ち掛かる（本物の追手。浅瀬の手前で追い着く）
      { const P = rt.player.u.pos; this.spawnChase(rt, { x: P.x + 4, z: P.z - 28 }); }   // 背の二十数 m から追い掛ける（行く手でなく後ろ）
      // 包みの島津は河原まで追う
      for (const b of [B.niiro, B.honjo, B.ieh, B.ijuin]) this.go(b, { x: FORD.x + (b === B.honjo ? 30 : b === B.niiro ? -20 : 0), z: -18 }, 2.2, { charge: true });
    } else if (n === 5) {
      rt.marker('camp', { x: CAMP.x, z: CAMP.z }, '鏡城');
      this.campMen(rt);
      rt.say(F.mine.leader?.name || '手勢の侍', '夜の土手を川下へ。灯りの見える陣が味方じゃ', 3);
      this.spawnChase(rt);
      // 川下の瀬を渡った島津が、土手の先で行く手を塞ぐ（逃げ道の上で必ず当たる。九2・十二4）
      F.chase2 = true;
      this.spawnChase(rt, { x: -116, z: 34 }, { x: -116, z: 72 });   // 下の瀬を先に渡った組が、土手の道の先（鏡城の手前）で待ち構える
    }
  },

  // 先手が退くふり：伊集院の備が尾根の西の陰へ退き、四国の衆が追う
  feign(rt) {
    const F = rt.flags, B = F.blk;
    if (F.feigned) return;
    F.feigned = true; F.feignT = rt.t;
    this.go(B.ijuin, { x: 14, z: -150 }, 2.0, { back: true });
    // 塊から替わった本物の先手も背を向けて退く（追う先が見える）
    for (const g of rt.army.groups) if (g.team === 1 && g.count && g.kind !== 'main' && !g.gunLine && g.order !== 'move') { g.order = 'move'; g.dest = { x: 10 + Math.random() * 16, z: -128 }; g.speed = 3; g.feignBack = true; }
    rt.say('長宗我部信親', '島津が退くぞ。追え、追え！', 3);
    rt.after(3.2, () => rt.say('長宗我部元親', '追うな！　それは島津の釣りじゃ', 3));
    this.go(B.sen, { x: 52, z: -104 }, 2.8, { charge: true });
    this.go(B.nobu, { x: 6, z: -100 }, 2.8, { charge: true });
    this.go(B.sogo, { x: 96, z: -94 }, 2.6, { charge: true });
  },

  // 釣り野伏せ：西の林から新納大膳、東の林から本庄、尾根の陰から家久の本隊。伊集院も向き直る
  ambush(rt) {
    const F = rt.flags, B = F.blk;
    rt.unmark('go');
    // 本物の兵を二百五十ほどに保つ：川向こうに残る元親の旗本と鏡城の陣の兵は、今は去らせ（遠くて見えない）、鏡城の陣の兵は夜の段にまた置く
    for (const g of [F.moto, F.otomo]) for (const u of g?.units || []) if (u.alive && !u.gone && !u.isPlayer) rt.army.despawn(u);
    B.niiro = this.block(rt, { key: 'niiro', name: '新納大膳の備', team: 1, flag: 'shimazu', at: WOODS[0], facing: Math.PI / 2, w: 44, d: 14 });
    B.honjo = this.block(rt, { key: 'honjo', name: '島津豊久の備', team: 1, flag: 'shimazu', at: WOODS[1], facing: -Math.PI / 2, w: 34, d: 10 });
    B.ieh = this.block(rt, { key: 'ieh', name: '島津家久の本隊', team: 1, flag: 'shimazu', at: IEHISA, facing: 0, w: 40, d: 14 });
    this.go(B.niiro, { x: RING.x - 30, z: RING.z + 4 }, 2.6, { charge: true });
    this.go(B.honjo, { x: RING.x + 34, z: RING.z + 4 }, 2.6, { charge: true });
    this.go(B.ieh, { x: RING.x + 4, z: RING.z - 34 }, 2.0, { charge: true });
    this.go(B.ijuin, { x: RING.x + 20, z: RING.z - 22 }, 2.4, { charge: true });
    this.foeLord(rt, '新納大膳亮', B.niiro, WOODS[0]);
    this.foeLord(rt, '島津豊久', B.honjo, WOODS[1]);
    // 伏せの本物の兵：林の中から出て、塊と一緒に四国の衆と本人を包む（台詞だけの伏せにしない。二3・十二4）
    const T = MEM_TIGHT ? 0.75 : 1, k = (n) => Math.max(3, Math.round(n * T));
    this.foeTroop(rt, '新納大膳の備の槍', B.niiro, -8, 6, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: k(10), o: { weapon: 'spear' } }]);
    this.foeTroop(rt, '新納大膳の備の太刀', B.niiro, 10, 6, [{ type: 'samurai', n: k(4) }, { type: 'ashigaru', n: k(6) }]);
    this.foeTroop(rt, '島津豊久の備の槍', B.honjo, 0, 6, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: k(9), o: { weapon: 'spear' } }]);
    this.foeTroop(rt, '島津家久の本隊の槍', B.ieh, 0, 8, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: k(9), o: { weapon: 'spear' } }]);
    // 林の縁に膝をつく島津の鉄砲衆（本物）。伏せの始まりは鉄砲と矢（フロイス：土佐の衆は撃ち返す暇も無かった）
    for (const [i, w] of WOODS.entries()) {
      const gx = w.x + (RING.x - w.x) * 0.3, gz = w.z + (RING.z - w.z) * 0.3;
      const guns = enemyGroup(rt, { faction: 'shimazu', name: '島津の鉄砲衆', anchor: { x: gx, z: gz }, facing: Math.atan2(RING.x - gx, RING.z - gz), width: 7, formation: 'line', noRout: true,
        morale: 90, dmgMult: 0.4, order: 'hold', aggro: 8, seekRange: 45, speed: 2.6 },
      [{ type: 'gun', n: 6 + i }, { type: 'samurai', n: 1 }]);
      guns.gunLine = true; F.foes.push(guns);
    }
    // 総大将の島津家久は後ろの本陣の床几に座って動かない（AR3・AV7）。旗本二十五人が前を固める。史実で討たれていないので討てない
    F.ieh = enemyGroup(rt, { faction: 'shimazu', name: '島津家久の旗本', anchor: { x: SEAT.x, z: SEAT.z + 7 }, facing: 0, width: 9, formation: 'line', noRout: true,
      morale: 100, dmgMult: 0.5, order: 'hold', fixed: true, aggro: 6, seekRange: 10, speed: 2.4 },
    [{ type: 'samurai', n: 8, o: { keep: true } }, { type: 'ashigaru', n: 6, o: { flagScale: 1, keep: true } }, { type: 'gun', n: 4 }]);
    F.ieh.kind = 'main'; F.ieh.stay = true; F.foes.push(F.ieh);
    F.iehS = enemyGroup(rt, { faction: 'shimazu', name: '島津家久の本陣', anchor: SEAT, facing: 0, width: 2, aggro: 0, seekRange: 0, order: 'hold', fixed: true, noRout: true },
      [{ type: 'busho', n: 1, o: { name: '島津家久', invuln: true, horse: false, keep: true } }]);
    F.iehS.stay = true; F.iehS.noAI = true;
    for (const u of F.iehS.units) {
      u.invuln = true; u.noTarget = true;
      u.pos.set(SEAT.x, rt.world.heightAt(SEAT.x, SEAT.z), SEAT.z + 0.35); u.mesh.position.copy(u.pos);
      u.jinchu = { standing: false, t: 0, soldiers: [] };
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
      if (live(F.sen)) { F.sen.order = 'move'; F.sen.dest = { x: FORD.x + 16, z: 60 }; F.sen.speed = 4.4; F.sen.onArrive = (q) => { q.order = 'move'; q.dest = { x: CAMP.x + 12, z: CAMP.z + 12 }; }; }
      F.follow = F.follow.filter((f) => f[0] !== F.sen && f[1] !== B.sen);
      for (const g of F.troops) if (live(g) && /仙石/.test(g.name)) { g.order = 'move'; g.dest = { x: FORD.x + 18, z: 50 }; g.speed = 4.2; g.noRout = false; }
    });
  },

  // 包みが閉じる：十河・信親が討たれる（史実どおり。主人公には救えない）
  closeRing(rt) {
    const F = rt.flags, B = F.blk;
    if (F.ringClosed) return;
    F.ringClosed = true;
    const fall = (u, who, line) => {
      if (!u || !u.alive) return;
      u.invuln = false;
      rt.army.kill(u, null);
      rt.banner(`${who}、討死`, '');
    };
    fall(F.sogoU, '十河存保');
    rt.say('物見', '十河様、お討死！　右の備が崩れまする', 2.6);
    routButai(B.sogo, 30);
    rt.after(1.4, () => fall(F.tsuneU, '戸次統常'));
    rt.after(2.6, () => { fall(F.nobuU, '長宗我部信親'); routButai(B.nobu, 30); rt.say('鈴木大膳', '長宗我部信親、討ち取ったり！', 2.4); });
    rt.after(3.8, () => rt.say(F.mine.leader?.name || '手勢の侍', `${nm(rt)}殿、信親様が……！　ここは退くほかござらぬ`, 3.2));
    F.follow = [];
    for (const g of [F.nobu, F.sogo, F.tsune, ...F.troops]) if (live(g)) { g.order = 'move'; g.dest = { x: FORD.x - 10, z: 40 }; g.speed = 3.6; }
    // 元親も渡りの手前から落ちていく（史実：伊予の日振島へ逃れた）
    this.go(B.moto, { x: CAMP.x + 30, z: CAMP.z + 24 }, 1.8, { back: true });
    if (live(F.moto)) { F.moto.order = 'move'; F.moto.dest = { x: CAMP.x + 20, z: CAMP.z + 30 }; F.moto.speed = 3.8; }
    rt.after(6.4, () => rt.say('長宗我部元親', '弥三郎が……。退け、退くのじゃ', 3));
    rt.after(5, () => this.toStep(rt, 4));
  },

  // 夜の追手：浅瀬を渡って追ってくる本物の組
  // block：行き先（その場で待ち構えて道を塞ぐ組。来たら打ち掛かる）
  spawnChase(rt, at = { x: FORD.x, z: -14 }, block = null) {
    const F = rt.flags;
    let n = aliveReal(rt);
    for (let i = 0; i < (block ? 1 : 2) && n < 236; i++) {
      const g = enemyGroup(rt, { faction: 'shimazu', name: '島津の追手', anchor: { x: at.x + (i ? 10 : -10), z: at.z }, facing: Math.PI, width: 4, noRout: true, formation: 'line',
        morale: 90, dmgMult: 0.24, order: block ? 'move' : 'attack', seekRange: 70, aggro: 14, speed: block ? 4 : 3.4 },
      block ? [{ type: 'ashigaru', n: 5 }] : [{ type: 'ashigaru', n: 7 }, { type: 'samurai', n: 1 }]);
      if (block) g.dmgMult = 0.15;   // 道を塞ぐ組は、斬り払って駆け抜けられる手（止まれば囲まれる）
      g.kind = 'chase'; g.focus = rt.player.u; F.foes.push(g); n += 8;
      if (block) { g.dest = { x: block.x + (i ? 5 : -5), z: block.z + (i ? -4 : 4) }; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; }; }
    }
  },

  update(rt, dt) {
    const F = rt.flags, B = F.blk;
    if (F.ending || !F.step) return;
    const P = rt.player.u;
    butaiTick(rt, dt);
    // 塊どうしの押し合い（伊集院に当たる段から）
    if (F.step >= 2) fieldTick(rt, dt, { list: F.blocks, reach: 40, k: F.step === 2 ? 0.25 : F.step === 3 ? 0.55 : 0.4 });
    // 手勢は本人の脇に付く
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      const g = F.mine;
      if (live(g)) {
        const c = g.center();
        if (dist(c, P.pos) > 7 || F.step >= 4) { g.order = 'move'; g.dest = { x: P.pos.x + 2, z: P.pos.z + (F.step >= 4 ? 3 : -2) }; g.speed = F.step >= 4 ? 5.2 : 4.2; }   // 退く段は手勢も駆けて付いて来る
        else { g.order = 'attack'; g.seekRange = 12; }
      }
      // 名のある将の組は、自分の塊と一緒に動く（塊の中ほど）
      for (const [g, b, dx, dz] of F.follow) {
        if (!live(g) || !b || b.routedL) continue;
        const p = lightPos(b), to = { x: p.x + dx, z: p.z + dz };
        const gd = dist(g.center(), to);
        if (gd > 6) { g.order = 'move'; g.dest = to; g.speed = g.team ? 2.6 : gd > 20 ? 4.2 : 3.4; }   // 遅れた組は駆けて備に追い着く
        else { g.order = g.team ? 'hold' : 'attack'; g.anchor = to; g.seekRange = g.team ? 10 : 14; }
      }
      // 島津の備の前の兵：伊集院に当たる段までは塊の前で構え、それからは塊に付いて歩き、着けば打ち掛かる（退くふりの時は塊と退く）
      for (const [g, b, dx, dz] of F.foeT) {
        if (!live(g) || !b || b.routedL) continue;
        const p = lightPos(b), to = { x: p.x + dx, z: p.z + dz }, d = dist(g.center(), to);
        if (F.step < 2) { if (d > 6) { g.order = 'move'; g.dest = to; g.speed = 2.6; } else { g.order = 'hold'; g.anchor = to; } }
        else if (d > (F.step >= 4 ? 30 : 14)) { g.order = 'move'; g.dest = to; g.speed = F.step >= 4 ? 3.6 : 3.2; }
        else if (g.order !== 'attack') { g.order = 'attack'; g.seekRange = 24; g.aggro = 14; }
      }
      for (const [g, b, dx, dz] of F.followFoe) {
        if (!live(g) || !b || b.routedL) continue;
        const p = lightPos(b), to = { x: p.x + dx, z: p.z + dz };
        if (dist(g.center(), to) > 6) { g.order = 'move'; g.dest = to; g.speed = 2.6; }
        else { g.order = 'hold'; g.anchor = to; g.seekRange = 6; g.aggro = 4; }
      }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const squadAlive = (rt.squad || []).filter((s) => s.alive).length;
    if (F.step >= 2 && !live(F.mine) && !squadAlive) { this.lose(rt, '連れた兵が全部討たれた'); return; }
    const el = rt.t - F.stepT;
    // 四国の衆が北の岸へ上がってから当たる（自分だけ先に着いても、皆が渡るのを待つ）
    if (F.step === 1 && ((P.pos.z < -30 && lightPos(B.nobu).z < -24) || el > 80)) this.toStep(rt, 2);
    else if (F.step === 2) {
      // 先手は当たって少し討たれると退く（退くふり）。退いた先まで追うと包みが閉じる
      const ij = B.ijuin, hurt = ij && ij.aliveNominal() < F.ijN0 * 0.85;
      // 囮の先手は本気で戦わない（史実：当たってすぐ退いた）。替わった本物の兵の手は軽く
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.feignSoft) { g.feignSoft = true; g.dmgMult = Math.min(g.dmgMult || 1, 0.45); }
      // 退くふりの前は、先手の兵が四国の衆と本人へ打ち掛かる（突っ立って待たない）
      if (!F.feigned) for (const g of rt.army.groups) if (g.team === 1 && g.count && g.order === 'hold' && g.kind !== 'main' && !g.gunLine) { g.order = 'attack'; g.seekRange = 30; g.aggro = 14; }
      if (!F.feigned && ((hurt && el > 18) || el > 26)) this.feign(rt);   // 先手は当たっては少し粘り、それから退く
      if (F.feigned && ((P.pos.z < RING.z + 12 && rt.t - F.feignT > 14) || rt.t - F.feignT > 34)) this.toStep(rt, 3);
    } else if (F.step === 3) {
      // 包む島津の兵（塊から替わった本物）は、待たずに四国の衆と本人へ打ち掛かる
      for (const g of rt.army.groups) if (g.team === 1 && g.count && (g.order === 'hold' || g.feignBack && g.order === 'move') && g !== F.ieh && g !== F.iehS && !g.interiorHold && g.kind !== 'main' && !g.gunLine) { g.order = 'attack'; g.seekRange = 30; g.aggro = 14; g.noRout = true; }
      // 包みの兵は数で押すが、一人ひとりの手は並み（騎馬の一突きで倒れず、信親の横で一分半は持ちこたえられる）
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.ringSoft && g !== F.ieh && g !== F.iehS) { g.ringSoft = true; g.dmgMult = Math.min(g.dmgMult || 1, 0.5); }
      const near = F.nobuU?.alive && dist(F.nobuU.pos, P.pos) < 12;
      if (near) F.nearT = (F.nearT || 0) + 0.25;
      if ((F.nearT > 50 && el > 75) || el > 95) this.closeRing(rt);   // 包みの中で一分半ほど持ちこたえる
    } else if (F.step === 4 && P.pos.z > 26) this.toStep(rt, 5);
    else if (F.step === 5 && dist(P.pos, CAMP) < 13) this.win(rt);
    // 夜の土手の半ばで、川下の浅瀬から島津の追手がもう一手（史実：追い討ちで多くが討たれた）
    if (F.step === 5 && !F.chase2say && P.pos.x < -30) { F.chase2say = true; rt.say(F.mine.leader?.name || '手勢の侍', '下の瀬からも来たぞ。斬り抜けよ！', 2.6); }
    // 退く段：島津の塊は本人を追い、近い本物の追手は人の走りより少し遅く、斬り合いは軽く（止まれば囲まれるが、走れば抜けられる）
    if (F.step >= 4) {
      if ((F.chaseT = (F.chaseT || 0) - 0.25) <= 0) {
        F.chaseT = 2;
        const to = { x: P.pos.x, z: Math.min(P.pos.z, F.step >= 5 ? 40 : -6) };
        for (const b of [B.niiro, B.honjo, B.ieh, B.ijuin]) if (b && !b.routedL && dist(lightPos(b), P.pos) > 30) this.go(b, to, 2.2, { charge: true });
      }
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.chaseSoft && g !== F.ieh && g !== F.iehS) {
        // 本物の追手（chase）は人の走りに近い足で背に来る。包みの兵は遅く（止まれば囲まれるが、走れば抜けられる）
        g.chaseSoft = true; g.dmgMult = Math.min(g.dmgMult || 1, g.kind === 'chase' ? 0.22 : 0.3); g.speed = Math.min(g.speed || 3, g.kind === 'chase' ? 4 : 2);
        if (g.order === 'hold' && g.kind !== 'main') { g.order = 'attack'; g.seekRange = 40; g.aggro = 12; }
      }
      if (!F.breath) { F.breath = true; P.hp = Math.max(P.hp, P.maxHp * 0.7); }
    }
    // 遠く離れた本物の敵は去らせる（重さ）
    // 退く段は、本人から遠く離れた本物の兵を去らせる（重さ。追手と道を塞ぐ組の枠を空ける）。名のある将と家久の本陣は残す
    if (F.step >= 4 && (F.farT = (F.farT || 0) - 0.25) <= 0) {
      F.farT = 1;
      const far = F.step === 5 ? 70 : 90;
      for (const u of rt.army.units) if (u.alive && !u.gone && !u.isPlayer && !u.invuln && !u.isStruct && u.group && u.group.kind !== 'chase' && u.group !== F.mine && u.group !== F.otomo && u.group !== F.ieh && dist(u.pos, P.pos) > far) rt.army.despawn(u);
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    const n = (F.mine?.count || 0) + (rt.squad || []).filter((s) => s.alive).length;
    // 史実は豊臣方の大敗。「合戦に勝利」の大きな字も「功、抜きん出たり」も出さない（生きて戻っただけ）
    F.victoryShown = true;
    rt.award((t) => { t.main = true; }, '戸次川から生きて戻った');
    rt.banner('戸次川の大敗', `生きて戻った。連れた兵 ${n}人`);
    const A = this.talk.after;
    rt.after(1.2, () => rt.say(nm(rt), A[0][1], 3.2));
    rt.after(4.6, () => rt.say(A[1][0], A[1][1], 3.6));
    rt.after(8.6, () => rt.say('大友義統', '仙石殿は讃岐へ逃げられた由……。鶴賀も府内も、もう持たぬ', 3.4));
    rt.finish({ scriptedEnd: true }, 13);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.finish({ failureReason: why }, 6);
  },

  // 退く段（④⑤）は、共通の退避（居残る味方へ戻る）でなく、この戦の退き口（浅瀬→鏡城）をたどる
  botEvacuating(b) { return (b.flags.step || 0) >= 4; },

  // bot：近い敵を突き、段の行き先へ。退く段は敵を振り切って走る（すぐ横の敵だけ払う）
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step) return;
    let q;
    if (F.step === 1) q = Math.abs(u.pos.x - FORD.x) > 6 && u.pos.z > 8 ? { x: FORD.x, z: 24 } : { x: FORD.x, z: -40 };
    else if (F.step === 2) { const g = F.troops?.find((t) => live(t)), c = g ? g.center() : lightPos(F.blk.nobu); q = { x: c.x + 6, z: c.z - 2 }; }   // 信親の備の槍の脇で当たる（一人で先へ駆けない）
    else if (F.step === 3) q = F.nobuU?.alive ? F.nobuU.pos : { x: FORD.x, z: -20 };
    // 浅瀬の外の深みは斜めに渡らない：まず北の岸で浅瀬の口へ寄ってから、まっすぐ渡る
    else if (F.step === 4) q = Math.abs(u.pos.x - FORD.x) > 8 && u.pos.z < 22 ? { x: FORD.x, z: Math.min(u.pos.z, -14) } : u.pos.z < -12 ? { x: FORD.x, z: -10 } : { x: FORD.x, z: 34 };
    else q = CAMP;
    // 持ち場（q）の近くの敵だけを突く。退く敵を戦場の端まで追わない。退く段は道を塞ぐ・背に追い着いた島津だけ払って抜ける
    const leash = F.step >= 4 ? 1e9 : 20;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 && Math.hypot(o.pos.x - q.x, o.pos.z - q.z) < leash;
    const r = F.step >= 5 ? 0 : F.step === 4 ? 2.5 : F.step === 3 ? 6 : F.step === 2 ? 12 : 0;
    const e = r ? b.army.nearestEnemy(u, r, ok) : null;
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    goTo(p, inp, q.x, q.z, 2);
  },
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t06_hetsugi);

export { t06_hetsugi };
