// ======================================================================
// 豊臣編 6：戸次川の戦い（天正十四年＝1586 十二月十二日の夕方〜夜。豊後国 戸次川＝今の大野川。調べは docs/battle_refs/t06_hetsugi.md）
// 島津家久に囲まれた鶴賀城（利光宗魚の城）を救うため、軍監の仙石秀久が元親の反対を押して戸次川を渡る。
// 伊集院久宣の先手が当たっては退き（釣り）、追った四国の衆を、新納大膳の五千・本庄の手・家久の本隊が三方から包む（野伏せ）。
// 仙石の隊が先に崩れ、長宗我部信親と十河存保が討たれる。主人公は信親の隊の横に付く部将。信親は史実どおり救えない。
// 勝ちの形は「崩れる味方の中で生き残り、浅瀬を南へ渡り戻って、夜の土手を鏡城の下の味方の陣まで逃げ切る」。
// 段：①浅瀬を渡り鶴賀城の下へ ②伊集院の先手に槍を入れる（退くふり） ③信親の横で包みを食い止める（信親・十河の討死）
//     ④中津留の河原を走って浅瀬を南へ ⑤夜の土手を鏡城の下の陣へ
// 軍勢（AQ の 3・6・9）：両軍とも史実の兵数を、一人を十二人（携帯は二十人）に見立てた陣形の塊（備）で置く。豊臣方 六千・島津 一万二千。
//   塊は本人の六十 m に入った所から本物の兵に替わり（KIT の wake）、塊どうしは数で押し合う（b_yasen.js の fieldTick）。
//   見せかけの軍勢・寄せる後詰め・作り物の乱戦は置かない（noFoeNear・noFrontFill）。伏兵の塊は包みの段に林の中から出す。
// 旗は豊臣方（仙石＝豊臣の旗・長宗我部・十河＝三好の旗・鶴賀城の大友）と島津だけ。織田の旗は出さない（AQ の 4）。
// 座標：大野川を東西（x）に流し、南（+z）が渡る前の岸（実の西岸）、北（−z）が鶴賀城の岸（実の東岸）。
//   国土地理院の標高（asset_dem_hetsugi.js）の起伏を北の岸に混ぜる。鏡城は渡る前の岸（ゲームの南西）。
// ======================================================================
import { useTerrain } from './asset_manifest.js';
import { demSample } from './dem.js';
import { enemyGroup, allyGroup, nm } from './bhelp.js';
import { nobori, palisade, dorui, yagura, hut, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { KIT } from './b_nagashinojo.js';
import { sfx } from './audio.js';
import { MEM_TIGHT } from './settings.js';
import { withGuard } from './toyo_bot.js';
import { fieldButai, fieldTick, routButai, lightPos } from './b_yasen.js';
import { butaiTick } from './butai.js';
import { addSite } from './map_sites.js';

const START = { x: 20, z: 62 };              // 川の手前（信親の隊と仙石の隊の間）
const FORD = { x: 20, w: 22 };               // 浅瀬（川の中ほどの x と幅の半分）
const FORD2 = { x: -70, w: 12 };
const RIVER_Z = 0;
const RIVER = [[-270, 6], [-150, -3], [-40, 2], [60, -2], [170, 4], [270, -2]];
const CASTLE = { x: 70, z: -150 };           // 鶴賀城（尾根の上の主郭）
const FORT_R = 13;
const GATE_A = Math.PI * 1.25;               // 虎口の向き（南西＝浅瀬からの道の側）
const CAMP = { x: -170, z: 84 };             // 鏡城の下の味方の陣（渡る前の岸）
const IJUIN = { x: 40, z: -72 };             // 伊集院久宣の先手（鶴賀城の下の囲みの陣）
const WOODS = [{ x: -62, z: -70 }, { x: 152, z: -62 }];   // 釣り野伏せの林（西：新納大膳・東：本庄）
const IEHISA = { x: 0, z: -182 };            // 島津家久の本隊（尾根の西の陰）
const RING = { x: 22, z: -100 };             // 包みが閉じる所（中津留の河原の上）
const SC = MEM_TIGHT ? 20 : 12;              // 塊の一人が史実の何人か
// 史実の兵数（調べ：豊臣方は六千ほどが渡った、島津は一万〜一万三千・新納大膳 五千・長宗我部 三千）
const HIST = { sen: 2000, nobu: 2000, sogo: 1000, moto: 1000, ijuin: 2000, niiro: 5000, honjo: 2000, ieh: 3000 };
const A0 = HIST.sen + HIST.nobu + HIST.sogo + HIST.moto, B0 = HIST.ijuin + HIST.niiro + HIST.honjo + HIST.ieh;
const STEP_TEXT = ['浅瀬を渡り、鶴賀城の下の島津の陣の前まで進む', '鶴賀城の下の島津の先手（伊集院）に槍を入れ、押し返す',
  '長宗我部信親様の馬印の横に立ち、囲む島津を食い止める', '中津留の河原を走り、浅瀬を南へ渡って退く', '夜の土手を西へ走り、鏡城の下の味方の陣まで逃げ切る'];

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
  h += 22 * k;
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

const t06_hetsugi = {
  missionSingleLine: true,
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
  introText: () => '島津に囲まれた鶴賀城を救いに、戸次川を渡る。退くふりの罠に落ちても、生きて味方の陣へ戻れ。',
  minutes: 9,
  sides: { a: { name: '豊臣勢（四国の衆）', mon: 'chosokabe' }, b: { name: '島津勢', mon: 'shimazu' } },
  // 両軍の残り（史実の数）：塊の名目から。まだ林に伏せている島津も数に入れる
  force(rt) {
    const F = rt.flags;
    if (!F.blk) return null;
    const n = (b, h) => (b ? b.aliveNominal() * SC : h);
    const B = F.blk;
    return { a: n(B.sen) + n(B.nobu) + n(B.sogo) + n(B.moto), b: n(B.ijuin) + n(B.niiro, HIST.niiro) + n(B.honjo, HIST.honjo) + n(B.ieh, HIST.ieh), a0: A0, b0: B0 };
  },
  date: () => '天正十四年（1586）十二月十二日　夕刻　豊後国 戸次川',
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
    streams: [{ pts: RIVER, w: 16, depth: 1.7, fords: [FORD, FORD2] }],
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
    clear: (x, z) => Math.abs(z - riverZ(x)) < 30 || dist({ x, z }, CASTLE) < FORT_R + 4 || dist({ x, z }, CAMP) < 16,
    fleeOut: (x, z, team) => (team === 1 ? z < -250 : x < -250 || z > 250),
  },

  setup(rt) {
    const F = rt.flags;
    F.step = 0; F.holdPlayer = true; F.foes = []; F.ending = false; F.blk = {}; F.blocks = [];
    this.castle(rt);
    this.kagami(rt);
    // 豊臣方の塊（渡る前の岸）。仙石が先陣、信親が左、十河が右、元親は後ろで渡らずに残る
    const B = F.blk;
    B.sen = this.block(rt, { key: 'sen', name: '仙石秀久の備', team: 0, flag: 'toyotomi', at: { x: 54, z: 40 }, facing: Math.PI, w: 34, d: 10 });
    B.nobu = this.block(rt, { key: 'nobu', name: '長宗我部信親の備', team: 0, flag: 'chosokabe', at: { x: -8, z: 50 }, facing: Math.PI, w: 34, d: 10 });
    B.sogo = this.block(rt, { key: 'sogo', name: '十河存保の備', team: 0, flag: 'miyoshi', at: { x: 92, z: 62 }, facing: Math.PI, w: 26, d: 8 });
    B.moto = this.block(rt, { key: 'moto', name: '長宗我部元親の備', team: 0, flag: 'chosokabe', at: { x: -4, z: 96 }, facing: Math.PI, w: 26, d: 8 });
    // 島津の先手（伊集院久宣）：鶴賀城の下の囲みの陣
    B.ijuin = this.block(rt, { key: 'ijuin', name: '伊集院久宣の備', team: 1, flag: 'shimazu', at: IJUIN, facing: 0, w: 38, d: 10 });
    // 名のある将の本物の組（塊と一緒に動く）
    const ally = (o, list, flag) => { const g = allyGroup(rt, { fullStrength: true, facing: Math.PI, width: 5, aggro: 9, speed: 3.4, order: 'hold', noRout: true, ...o }, fl(list, flag)); g.mon = flag; return g; };
    F.nobu = ally({ name: '長宗我部信親の旗本', anchor: { x: -2, z: 58 } }, [{ type: 'busho', n: 1, o: { name: '長宗我部信親', invuln: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }], 'chosokabe');
    F.nobuU = F.nobu.units.find((u) => u.type === 'busho');
    F.sogo = ally({ name: '十河存保の旗本', anchor: { x: 92, z: 70 } }, [{ type: 'busho', n: 1, o: { name: '十河存保', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }], 'miyoshi');
    F.sogoU = F.sogo.units.find((u) => u.type === 'busho');
    F.sen = ally({ name: '仙石秀久の旗本', anchor: { x: 56, z: 48 } }, [{ type: 'busho', n: 1, o: { name: '仙石秀久', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }], 'toyotomi');
    F.moto = ally({ name: '長宗我部元親の旗本', anchor: { x: -4, z: 104 }, aggro: 6, seekRange: 10 }, [{ type: 'busho', n: 1, o: { name: '長宗我部元親', invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }], 'chosokabe');
    F.mine = ally({ name: '手勢', anchor: { x: START.x + 3, z: START.z + 5 }, width: 4, speed: 3.8, dmgMult: 0.9 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 13 }], 'chosokabe');
    F.follow = [[F.nobu, B.nobu, 6, 4], [F.sogo, B.sogo, 0, 4], [F.sen, B.sen, 0, 4]];
    rt.obj('main', STEP_TEXT[0], 'main', true);
    // 戦の前の会話（終わるまで動かない）
    this.talk.before.forEach(([who, s], i) => rt.after(0.6 + i * 3, () => rt.say(who, s, 2.8)));
    rt.after(0.6 + this.talk.before.length * 3, () => { F.holdPlayer = false; this.toStep(rt, 1); });
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
    rt.scene.add(hut(W, q.x - 3, q.z + 4, 7, 5, 0.3, { roof: 0x6a5c44 }));
    for (const [dx, dz] of [[-6, -6], [6, 4], [0, -10]]) rt.scene.add(nobori(W, q.x + dx, q.z + dz, 'otomo', 6));
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
    addSite(rt, 'fort', CAMP.x, CAMP.z, '鏡城');
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
      this.go(B.sen, { x: 56, z: -36 }, 2.8);
      this.go(B.nobu, { x: -2, z: -32 }, 2.8);
      this.go(B.sogo, { x: 92, z: -28 }, 2.6);
    } else if (n === 2) {
      rt.marker('go', () => (B.ijuin && !B.ijuin.routedL ? lightPos(B.ijuin) : CASTLE), '島津の先手');
      rt.say('仙石秀久', 'かかれ！　鶴賀の囲みを破れ！', 2.6);
      rt.army.play('toki', IJUIN, 1.3);
      this.go(B.sen, { x: 52, z: -58 }, 3, { charge: true });
      this.go(B.nobu, { x: 14, z: -56 }, 3, { charge: true });
      this.go(B.sogo, { x: 84, z: -52 }, 2.8, { charge: true });
      F.ijN0 = B.ijuin.aliveNominal();
    } else if (n === 3) {
      this.ambush(rt);
      rt.marker('nobu', () => (F.nobuU?.alive ? { x: F.nobuU.pos.x, z: F.nobuU.pos.z } : null), '長宗我部信親');
    } else if (n === 4) {
      rt.marker('ford', { x: FORD.x, z: 34 }, '戸次川の浅瀬');
      sfx('horagai', 0.8);
      // 包みの島津は河原まで追う
      for (const b of [B.niiro, B.honjo, B.ieh, B.ijuin]) this.go(b, { x: FORD.x + (b === B.honjo ? 30 : b === B.niiro ? -20 : 0), z: -18 }, 2.2, { charge: true });
    } else if (n === 5) {
      rt.world.setTime?.('night');
      rt.marker('camp', { x: CAMP.x, z: CAMP.z }, '鏡城');
      rt.say(F.mine.leader?.name || '手勢の侍', '夜の土手を西へ。灯りの見える陣が味方じゃ', 3);
      this.spawnChase(rt);
    }
  },

  // 先手が退くふり：伊集院の備が尾根の西の陰へ退き、四国の衆が追う
  feign(rt) {
    const F = rt.flags, B = F.blk;
    if (F.feigned) return;
    F.feigned = true; F.feignT = rt.t;
    this.go(B.ijuin, { x: 14, z: -150 }, 2.0, { back: true });
    rt.say('長宗我部信親', '島津が退くぞ。追え、追え！', 3);
    rt.after(3.2, () => rt.say('長宗我部元親', '追うな！　それは島津の釣りじゃ', 3));
    this.go(B.sen, { x: 52, z: -104 }, 2.8, { charge: true });
    this.go(B.nobu, { x: 6, z: -100 }, 2.8, { charge: true });
    this.go(B.sogo, { x: 96, z: -94 }, 2.6, { charge: true });
    rt.marker('go', { x: RING.x, z: RING.z - 6 }, '退く島津');
  },

  // 釣り野伏せ：西の林から新納大膳、東の林から本庄、尾根の陰から家久の本隊。伊集院も向き直る
  ambush(rt) {
    const F = rt.flags, B = F.blk;
    rt.unmark('go');
    B.niiro = this.block(rt, { key: 'niiro', name: '新納大膳の備', team: 1, flag: 'shimazu', at: WOODS[0], facing: Math.PI / 2, w: 44, d: 14 });
    B.honjo = this.block(rt, { key: 'honjo', name: '本庄主税助の備', team: 1, flag: 'shimazu', at: WOODS[1], facing: -Math.PI / 2, w: 34, d: 10 });
    B.ieh = this.block(rt, { key: 'ieh', name: '島津家久の本隊', team: 1, flag: 'shimazu', at: IEHISA, facing: 0, w: 40, d: 14 });
    this.go(B.niiro, { x: RING.x - 30, z: RING.z + 4 }, 2.6, { charge: true });
    this.go(B.honjo, { x: RING.x + 62, z: RING.z + 6 }, 2.6, { charge: true });
    this.go(B.ieh, { x: RING.x + 4, z: RING.z - 34 }, 2.0, { charge: true });
    this.go(B.ijuin, { x: RING.x + 20, z: RING.z - 22 }, 2.4, { charge: true });
    // 島津家久と旗本（本隊の塊の真ん中。塊を割らないと届かない。史実で討たれていないので討てない）
    F.ieh = enemyGroup(rt, { faction: 'shimazu', name: '島津家久の旗本', anchor: { x: IEHISA.x, z: IEHISA.z + 2 }, facing: 0, width: 7, formation: 'line', noRout: true,
      morale: 100, dmgMult: 0.5, order: 'hold', aggro: 6, seekRange: 10, speed: 2.4 },
    [{ type: 'busho', n: 1, o: { name: '島津家久', invuln: true, horse: true } }, { type: 'samurai', n: 12, o: { keep: true } }, { type: 'ashigaru', n: 8, o: { flagScale: 1, keep: true } }, { type: 'gun', n: 4 }]);
    F.ieh.kind = 'main'; F.foes.push(F.ieh);
    F.follow.push([F.ieh, B.ieh, 0, 0]);
    // 四国の衆は不意を突かれて士気が落ちる
    for (const b of [B.sen, B.nobu, B.sogo]) if (b) b.morale = Math.min(b.morale, 48);
    rt.army.play('toki', WOODS[0], 1.5); rt.after(0.4, () => rt.army.play('toki', WOODS[1], 1.5));
    for (const [i, w] of WOODS.entries()) rt.after(0.8 + i * 0.5, () => rt.army.play('volley', { x: (w.x + RING.x) / 2, z: (w.z + RING.z) / 2 }, 1.2));
    sfx('taiko', 1);
    rt.say('長宗我部元親', '伏せじゃ！　両の林から島津が出たぞ', 3);
    rt.after(5, () => rt.say('島津家久', '釣り出したぞ。三方から包め。一人も川へ戻すな', 3));
    // 仙石の隊が先に崩れる（史実：仙石は讃岐まで逃げた）
    rt.after(11, () => {
      if (F.step !== 3) return;
      rt.say('仙石秀久', 'ええい、退け、退け！', 2.5);
      routButai(B.sen, 26);
      if (live(F.sen)) { F.sen.order = 'move'; F.sen.dest = { x: FORD.x + 16, z: 60 }; F.sen.speed = 4.4; F.sen.onArrive = (q) => { q.order = 'move'; q.dest = { x: CAMP.x + 12, z: CAMP.z + 12 }; }; }
      F.follow = F.follow.filter((f) => f[0] !== F.sen);
      rt.banner('仙石の隊が崩れた', '');
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
      rt.banner(`${who}、討死`, line);
    };
    fall(F.sogoU, '十河存保', '四国の衆が崩れる');
    rt.say('物見', '十河様、お討死！　右の備が崩れまする', 2.6);
    routButai(B.sogo, 30);
    rt.after(2.6, () => { fall(F.nobuU, '長宗我部信親', '中津留の河原で包まれた'); routButai(B.nobu, 30); });
    rt.after(3.8, () => rt.say(F.mine.leader?.name || '手勢の侍', `${nm(rt)}殿、信親様が……！　ここは退くほかござらぬ`, 3.2));
    F.follow = F.follow.filter((f) => f[0] === F.ieh);
    for (const g of [F.nobu, F.sogo]) if (live(g)) { g.order = 'move'; g.dest = { x: FORD.x - 10, z: 40 }; g.speed = 3.6; }
    // 元親も渡りの手前から落ちていく（史実：伊予の日振島へ逃れた）
    this.go(B.moto, { x: CAMP.x + 30, z: CAMP.z + 24 }, 1.8, { back: true });
    if (live(F.moto)) { F.moto.order = 'move'; F.moto.dest = { x: CAMP.x + 20, z: CAMP.z + 30 }; F.moto.speed = 3.8; }
    rt.after(6.4, () => rt.say('長宗我部元親', '弥三郎（信親）が……。退け、退くのじゃ', 3));
    rt.after(5, () => this.toStep(rt, 4));
  },

  // 夜の追手：浅瀬を渡って追ってくる本物の組
  spawnChase(rt) {
    const F = rt.flags;
    let n = aliveReal(rt);
    for (let i = 0; i < 2 && n < 190; i++) {
      const g = enemyGroup(rt, { faction: 'shimazu', name: '島津の追手', anchor: { x: FORD.x + (i ? 14 : -14), z: -14 }, facing: Math.PI, width: 4, noRout: true, formation: 'line',
        morale: 90, dmgMult: 0.38, order: 'attack', seekRange: 70, aggro: 14, speed: 3.3 },
      [{ type: 'ashigaru', n: 7 }, { type: 'samurai', n: 1 }]);
      g.kind = 'chase'; g.focus = rt.player.u; F.foes.push(g); n += 8;
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
        if (dist(c, P.pos) > 7 || F.step >= 4) { g.order = 'move'; g.dest = { x: P.pos.x + 2, z: P.pos.z + (F.step >= 4 ? 3 : -2) }; g.speed = 4.2; }
        else { g.order = 'attack'; g.seekRange = 12; }
      }
      // 名のある将の組は、自分の塊と一緒に動く（塊の中ほど）
      for (const [g, b, dx, dz] of F.follow) {
        if (!live(g) || !b || b.routedL) continue;
        const p = lightPos(b), to = { x: p.x + dx, z: p.z + dz };
        if (dist(g.center(), to) > 6) { g.order = 'move'; g.dest = to; g.speed = g.team ? 2.6 : 3.4; }
        else { g.order = g.team ? 'hold' : 'attack'; g.anchor = to; g.seekRange = g.team ? 10 : 14; }
      }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const squadAlive = (rt.squad || []).filter((s) => s.alive).length;
    if (F.step >= 2 && !live(F.mine) && !squadAlive) { this.lose(rt, '連れた兵が全部討たれた'); return; }
    const el = rt.t - F.stepT;
    // 四国の衆が北の岸へ上がってから当たる（自分だけ先に着いても、皆が渡るのを待つ）
    if (F.step === 1 && ((P.pos.z < -30 && lightPos(B.nobu).z < -6) || el > 80)) this.toStep(rt, 2);
    else if (F.step === 2) {
      // 先手は当たって少し討たれると退く（退くふり）。退いた先まで追うと包みが閉じる
      const ij = B.ijuin, hurt = ij && ij.aliveNominal() < F.ijN0 * 0.85;
      if (!F.feigned && ((hurt && el > 12) || el > 40 || (dist(lightPos(ij), P.pos) < 24 && el > 18))) this.feign(rt);
      if (F.feigned && (P.pos.z < RING.z + 12 || rt.t - F.feignT > 24)) this.toStep(rt, 3);
    } else if (F.step === 3) {
      // 包む島津の兵（塊から替わった本物）は、待たずに四国の衆と本人へ打ち掛かる
      for (const g of rt.army.groups) if (g.team === 1 && g.count && g.order === 'hold' && g !== F.ieh && !g.interiorHold) { g.order = 'attack'; g.seekRange = 30; g.aggro = 14; g.noRout = true; }
      const near = F.nobuU?.alive && dist(F.nobuU.pos, P.pos) < 12;
      if (near) F.nearT = (F.nearT || 0) + 0.25;
      if ((F.nearT > 16 && el > 22) || el > 48) this.closeRing(rt);
    } else if (F.step === 4 && P.pos.z > 26) this.toStep(rt, 5);
    else if (F.step === 5 && dist(P.pos, CAMP) < 13) this.win(rt);
    // 退く段：島津の塊は本人を追い、近い本物の追手は人の走りより少し遅く、斬り合いは軽く（止まれば囲まれるが、走れば抜けられる）
    if (F.step >= 4) {
      if ((F.chaseT = (F.chaseT || 0) - 0.25) <= 0) {
        F.chaseT = 2;
        const to = { x: P.pos.x, z: Math.min(P.pos.z, F.step >= 5 ? 40 : -6) };
        for (const b of [B.niiro, B.honjo, B.ieh, B.ijuin]) if (b && !b.routedL && dist(lightPos(b), P.pos) > 30) this.go(b, to, 2.2, { charge: true });
      }
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.chaseSoft && g !== F.ieh) {
        g.chaseSoft = true; g.dmgMult = Math.min(g.dmgMult || 1, 0.16); g.speed = Math.min(g.speed || 3, 2);
        if (g.order === 'hold') { g.order = 'attack'; g.seekRange = 40; g.aggro = 12; }
      }
      if (!F.breath) { F.breath = true; P.hp = Math.max(P.hp, P.maxHp * 0.7); }
    }
    // 遠く離れた本物の敵は去らせる（重さ）
    if (F.step === 5) for (const g of F.foes) for (const u of g.units) if (u.alive && !u.gone && dist(u.pos, P.pos) > 110) rt.army.despawn(u);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    const n = (F.mine?.count || 0) + (rt.squad || []).filter((s) => s.alive).length;
    rt.award((t) => { t.main = true; t.special = { label: '戸次川から兵を連れて生きて戻った', pts: 18 }; }, '戸次川から生きて戻った');
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
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const r = F.step >= 4 ? 0 : F.step === 3 ? 4 : F.step === 2 ? 7 : 0;
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
    if (F.step === 1) q = Math.abs(u.pos.x - FORD.x) > 6 && u.pos.z > 8 ? { x: FORD.x, z: 24 } : { x: FORD.x, z: -40 };
    else if (F.step === 2) q = F.feigned ? { x: RING.x, z: RING.z + 6 } : lightPos(F.blk.ijuin);
    else if (F.step === 3) q = F.nobuU?.alive ? F.nobuU.pos : { x: FORD.x, z: -20 };
    // 浅瀬の外の深みは斜めに渡らない：まず北の岸で浅瀬の口へ寄ってから、まっすぐ渡る
    else if (F.step === 4) q = Math.abs(u.pos.x - FORD.x) > 8 && u.pos.z < 22 ? { x: FORD.x, z: Math.min(u.pos.z, -14) } : u.pos.z < -12 ? { x: FORD.x, z: -10 } : { x: FORD.x, z: 34 };
    else q = CAMP;
    goTo(p, inp, q.x, q.z, 2);
  },
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(t06_hetsugi);

export { t06_hetsugi };
