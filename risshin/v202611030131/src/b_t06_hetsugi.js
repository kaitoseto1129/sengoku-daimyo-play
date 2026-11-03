// ======================================================================
// 豊臣編 6：戸次川の戦い（天正十四年＝1586 十二月十二日の夕方。豊後国 戸次川＝今の大野川。docs/chapter2_toyotomi.md の 6）
// 島津家久に囲まれた鶴賀城を救うため、軍監の仙石秀久が皆の反対を押して戸次川を渡る。島津は退くふりで誘い、
// 両脇の林の伏兵で包む（釣り野伏せ）。長宗我部信親・十河存保が討たれ、仙石は逃げる。主人公は信親の隊の横に付く部将。
// 信親は史実どおり討たれる（救えない）。勝ちの形は「連れた兵と生きて川を渡り戻り、夜の土手を抜けて味方の陣へ逃げ切る」。
// 段：①川を渡り鶴賀城へ ②退く島津の先手を追う ③伏兵・信親の隊へ（包みが閉じる） ④川まで退き兵を渡す ⑤北の味方の陣へ
// 負け：本人が討たれる・連れた兵が全部討たれる。
// 座標：大野川を東西（x）に流し、南（+z）が渡る前の岸、北（−z）が鶴賀城の岸。実の地形は北が東（鶴賀城の丘）になるよう回して
// 国土地理院の標高（asset_dem_hetsugi.js）の起伏を北の岸の丘に混ぜる。逃げる「北の味方の陣」は実の北＝ゲームの西（−x）。
// ======================================================================
import { useTerrain } from './asset_manifest.js';
import { demSample } from './dem.js';
import { enemyGroup, allyGroup, nm } from './bhelp.js';
import { nobori } from './props.js';
import { KIT } from './b_nagashinojo.js';
import { sfx } from './audio.js';
import { MEM_TIGHT } from './settings.js';
import { withGuard } from './toyo_bot.js';

const START = { x: 30, z: 64 };              // 川の手前（始めの25秒で川と向こう岸の島津が目に入る所）
const FORD = { x: 30, w: 22 };               // 浅瀬（川の中ほどの x と幅の半分）
const FORD2 = { x: -56, w: 12 };
const RIVER_Z = 0;
const RIVER = [[-270, 6], [-150, -3], [-40, 2], [60, -2], [170, 4], [270, -2]];
const CASTLE = { x: 40, z: -232 };           // 鶴賀城の丘（見た目の目印）
const CAMP = { x: -214, z: 76 };             // 北の味方の陣（夜の土手を抜けた先）
const WOODS = [{ x: -44, z: -88 }, { x: 104, z: -84 }];   // 釣り野伏せの林
const REAL_CAP = 170;                        // 戦う本物の兵の上限（iPhone の重さ）
const STEP_TEXT = ['戸次川を渡り、北東の鶴賀城へ向かう', '鶴賀城から退く島津の先手を追って崩す', '川の南の長宗我部信親の隊へ駆けつける', '戸次川の岸まで退き、兵を連れて川を渡る', '川の北の大友の陣まで、兵を連れて逃げ切る'];

// ---- 地形：南の岸は低い河原と田、北の岸は鶴賀城の丘へゆるく上がる。国土地理院の起伏は北の岸に ----
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
  // ゲームの −z（北の岸）を実の東へ、ゲームの x を実の南へ
  const rx = Math.max(-1580, Math.min(1580, -z * DEM_XY)), rz = Math.max(-1580, Math.min(1580, x * DEM_XY));
  return (demSample(dem, rx, rz) - 10) * 0.32;
}
function height(x, z) {
  const rz = z - riverZ(x);
  let h = 1.1 + 0.25 * Math.sin(x * 0.021) * Math.cos(z * 0.017);
  // 河原：川の両脇は低く平ら
  h -= 0.7 * (1 - sm(14, 40, Math.abs(rz)));
  // 瀬の砂利の州：川の中と水際に低い高まりを散らし、浅瀬が真っ直ぐな縁の平らな板に見えないようにする（11/2）。上へだけ足し、水面は下げない
  const bar = Math.sin(x * 0.19 + z * 0.07) * Math.cos(z * 0.31 - x * 0.05) + 0.6 * Math.sin(x * 0.43 - z * 0.29 + 1.3);
  h += Math.max(0, bar - 0.25) * 0.32 * (1 - sm(12, 26, Math.abs(rz)));
  // 北の岸：土手から鶴賀城の丘へ
  if (rz < 0) h += 3.5 * sm(-30, -110, rz) + 16 * sm(-170, -260, rz) * (1 - sm(60, 160, Math.abs(x - CASTLE.x)) * 0.6);
  // 実の起伏（川の近くは平らに残す）
  h += Math.max(-2, relief(x, z)) * sm(40, 120, Math.abs(rz));
  return h;
}

const live = (g) => g && g.count > 0;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const aliveReal = (rt) => { let n = 0; for (const u of rt.army.units) if (u.alive && !u.gone) n++; return n; };
// 島津の雑兵：黒い具足・丸に十字の旗
const SHIMA = { flag: 'shimazu' };
const sDress = (list) => list.map((s) => ({ ...s, o: { ...SHIMA, ...(s.o || {}) } }));
const cDress = (list) => list.map((s) => ({ ...s, o: { flag: 'chosokabe', ...(s.o || {}) } }));

const t06_hetsugi = {
  missionSingleLine: true,
  noFrontFill: true,         // 奥の軽い乱戦は川の向こうにこの戦の物を置く（手前に置くと川が隠れる）
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,
  enemyTactics: false,       // 敵の動きはこの定義が決める（退くふり・伏兵・追手）
  noFieldMap: true,
  hideArmyPeek: true,
  hideGuideSteps: true,
  noPlayerFoot: true,
  nearbyAllySignLimit: 0,
  foeMarks: true,
  enemyTriangleSigns: true,
  nobiki: true,              // 負け戦の退き口：法螺貝と退き太鼓で退けを知らせる
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
  introText: () => '島津に囲まれた鶴賀城を救いに、戸次川を渡る。退くふりの罠に落ちても、連れた兵と生きて味方の陣へ戻れ。',
  minutes: 7,
  sides: { a: { name: '豊臣勢（四国の衆）', mon: 'chosokabe' }, b: { name: '島津勢', mon: 'shimazu' } },
  date: () => '天正十四年（1586）十二月十二日　夕刻　豊後国 戸次川',
  // 戦の前と後の会話（docs/chapter2_toyotomi.md の 6）。戦の中の台詞として出す
  talk: {
    // 先遣軍が九州へ・家久が豊後へ・大友を救う・仙石が攻めを主張（battle_events_1101）
    before: [['大友の使者', '島津家久が豊後へ攻め入り、鶴賀の城を囲んでおります。なにとぞお救いを'], ['仙石秀久', '殿下の先手として九州へ渡ったのは、大友を救うためじゃ'],
      ['仙石秀久', '待っておれば鶴賀が落ちる。渡るぞ'], ['長宗我部元親', '島津は退くふりをする。深入りは……'], ['仙石秀久', '軍監はわしじゃ。皆、川を渡れ']],
    after: [['主人公', '信親殿を、お救いできませなんだ'], ['長宗我部元親', '……生きて戻った者がおる。それでよい']],
  },
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  world: {
    seed: 15861,
    time: 'dusk',
    groundHalf: 260,
    battleViewDistance: 110,  // 八十歩の霞で川向こうの島津の先手と林の伏兵が白く消えた。兵数は増やさない
    moveLim: 248,
    autumn: true,            // 師走：枯れ草の河原
    patchyGround: true,
    noGroundRipples: true,
    height,
    riverCross: true,
    wadeDepth: 0.85,
    streams: [{ pts: RIVER, w: 16, depth: 1.7, fords: [FORD, FORD2] }],
    paths: [{ pts: [[START.x, 160], [FORD.x, 20], [FORD.x, -20], [CASTLE.x - 6, -120], [CASTLE.x, -210]], w: 3 },
      { pts: [[FORD.x, 30], [-60, 52], [-150, 66], [CAMP.x, CAMP.z]], w: 2.5 }],
    groves: [
      ...WOODS.map((w) => ({ x: w.x, z: w.z, r: 26, n: 46, kind: 'sugi' })),
      { x: -150, z: -120, r: 24, n: 30 }, { x: 170, z: -110, r: 22, n: 26 },
      { x: CASTLE.x, z: CASTLE.z - 10, r: 34, n: 40 },
      { x: -230, z: 130, r: 22, n: 22 }, { x: 150, z: 140, r: 20, n: 18 },
    ],
    trees: 140,
    tufts: 2400,
    treeDensity: (x, z) => (Math.abs(z - riverZ(x)) < 90 ? 0 : 0.6),
    clear: (x, z) => Math.abs(z - riverZ(x)) < 30,
    fleeOut: (x, z, team) => (team === 1 ? z < -250 : x < -250 || z > 250),
  },

  setup(rt) {
    const F = rt.flags;
    F.step = 0; F.holdPlayer = true; F.foes = []; F.ending = false;
    const W = rt.world;
    // 鶴賀城の丘の島津の旗（囲む家久の陣）と、北の味方の陣
    for (const [dx, dz] of [[-24, 18], [0, 26], [24, 16], [-40, 0], [40, 2]]) rt.scene.add(nobori(W, CASTLE.x + dx, CASTLE.z + dz, 'shimazu', 6));
    for (const [dx, dz] of [[-6, -6], [6, -6]]) rt.scene.add(nobori(W, CASTLE.x + dx, CASTLE.z - 30 + dz, 'otomo', 6));
    KIT.honjin(rt, CAMP.x, CAMP.z, { mon: 'chosokabe', people: false, fire: true });
    this.stage(rt);
    // 四国の衆：信親の隊（主人公はその横）・十河の隊・仙石の隊・主人公の手勢
    F.nobu = allyGroup(rt, { name: '長宗我部信親の隊', fullStrength: true, anchor: { x: START.x - 26, z: START.z - 4 }, facing: Math.PI, width: 5, aggro: 10, speed: 3.2, order: 'hold', noRout: true },
      cDress([{ type: 'busho', n: 1, o: { name: '長宗我部信親', invuln: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }]));
    F.nobuU = F.nobu.units.find((u) => u.type === 'busho');
    F.sogo = allyGroup(rt, { name: '十河存保の隊', fullStrength: true, anchor: { x: START.x - 62, z: START.z }, facing: Math.PI, width: 5, aggro: 10, speed: 3.2, order: 'hold', noRout: true },
      [{ type: 'busho', n: 1, o: { name: '十河存保', invuln: true, flag: 'miyoshi' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }]);
    F.sogoU = F.sogo.units.find((u) => u.type === 'busho');
    F.sen = allyGroup(rt, { name: '仙石秀久の隊', fullStrength: true, anchor: { x: START.x + 34, z: START.z + 4 }, facing: Math.PI, width: 5, aggro: 8, speed: 3.4, order: 'hold', noRout: true },
      [{ type: 'busho', n: 1, o: { name: '仙石秀久', invuln: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }]);
    F.mine = allyGroup(rt, { name: '手勢', fullStrength: true, anchor: { x: START.x + 4, z: START.z + 5 }, facing: Math.PI, width: 4, aggro: 9, speed: 3.6, order: 'hold', noRout: true, dmgMult: 0.9 },
      cDress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 13 }]));
    for (const g of [F.nobu, F.sogo, F.sen, F.mine]) g.ai = true;
    // 長宗我部元親の隊（渡らずに残る。包みが閉じると落ちていく）と、北の陣の大友義統
    F.moto = allyGroup(rt, { name: '長宗我部元親の隊', fullStrength: true, anchor: { x: START.x - 14, z: START.z + 18 }, facing: Math.PI, width: 4, aggro: 6, seekRange: 10, order: 'hold', noRout: true },
      cDress([{ type: 'busho', n: 1, o: { name: '長宗我部元親', invuln: true, horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 4 }]));
    F.otomo = allyGroup(rt, { name: '大友義統の陣', fullStrength: true, anchor: { x: CAMP.x + 8, z: CAMP.z - 4 }, facing: Math.PI / 2, width: 4, aggro: 4, seekRange: 8, order: 'hold', noRout: true },
      [{ type: 'busho', n: 1, o: { name: '大友義統', invuln: true, flag: 'otomo' } }, { type: 'samurai', n: 2, o: { flag: 'otomo' } }, { type: 'ashigaru', n: 4, o: { flag: 'otomo' } }]);
    // 戦の前の会話（終わるまで動かない）
    this.talk.before.forEach(([who, s], i) => rt.after(0.6 + i * 3, () => rt.say(who, s, 2.8)));
    rt.after(0.6 + this.talk.before.length * 3, () => { F.holdPlayer = false; this.toStep(rt, 1); });
  },

  // 史実の目玉の絵（軽い作りだけ。本物の兵・数・bot には入れない）：
  //   川の向こうで四国の先鋒と島津の先手が斬り合い、その奥に退くふりの島津の本隊、両脇の林の縁に伏兵の旗（釣り野伏せの三つの口）
  stage(rt) {
    const W = rt.world, F = rt.flags, T = MEM_TIGHT, SA = 0x1e1c1c;
    const far = (o) => { const g = W.addDistantArmy({ host: false, near: false, farFill: true, flagRate: 0.8, armor: SA, flag: 'shimazu', ...o }); g.noWake = true; if (g.army) g.army.noWake = true; return g; };
    F.lure = far({ x: CASTLE.x - 4, z: -72, w: 64, d: 22, count: T ? 190 : 340, facing: 0, kind: 'mixed', seed: 15862 });
    F.fuse = WOODS.map((w, i) => far({ x: w.x + (i ? -22 : 24), z: w.z + 26, w: 36, d: 12, count: T ? 70 : 120, flagRate: 1, facing: i ? -Math.PI / 2 : Math.PI / 2, kind: 'gun', seed: 15863 + i }));
    // 先に渡った四国の衆（仙石の命で）：浅瀬の東の北の岸から島津の方へ押す（本人から60m の内は描かれないので離して置く）
    F.wade = [[80, -48, 15867]].map(([x, z, seed]) => far({ x, z, w: 44, d: 20, count: T ? 110 : 190, facing: Math.PI, kind: 'spear', flag: 'chosokabe', armor: 0x2a2622, seed }));
    F.front = W.addClash({ x: 20, z: -22, facing: 0.6, w: T ? 40 : 54, gap: 2.6, bw: 5.5, seed: 15866, noWake: true, noRout: true, killRate: 0.01, maxDrift: 2, corpses: T ? 12 : 30,
      A: { flag: 'shimazu', armor: SA, count: T ? 110 : 170, flagRate: 0.7, guns: true },
      B: { flag: 'chosokabe', count: T ? 100 : 160, flagRate: 0.7 },
      host: T ? false : undefined,
      play: (k, p, v) => rt.army.play(k, p, v * 0.5), smoke: (x, y, z, sx, sz) => rt.army.smoke(x, y, z, sx, sz) });
  },

  // 段を進める（右上の一行と行き先のピン）
  toStep(rt, n) {
    const F = rt.flags;
    if (F.step >= n) return;
    if (F.step) rt.objDone('s' + F.step);
    F.step = n; F.stepT = rt.t;
    for (const k of ['go', 'nobu', 'ford', 'camp']) rt.unmark(k);
    rt.obj('s' + n, STEP_TEXT[n - 1], 'main');
    if (n === 1) {
      rt.marker('go', { x: FORD.x, z: -46 }, '鶴賀城へ');
      sfx('taiko', 0.8);
      this.march(rt, -40);
      for (const g of F.wade || []) g.advance?.(40, 60);
    } else if (n === 2) {
      this.spawnBait(rt);
      F.lure?.retreat?.(46, 36);       // 島津の本隊が退くふり
      rt.marker('go', () => (live(F.bait) ? F.bait.center() : { x: CASTLE.x, z: -140 }), '島津の先手');
      rt.say('長宗我部信親', '島津が退くぞ。追え、追え！', 3);
      this.march(rt, -140);
    } else if (n === 3) {
      this.spawnAmbush(rt);
      rt.marker('nobu', () => (F.nobuU?.alive ? { x: F.nobuU.pos.x, z: F.nobuU.pos.z } : null), '長宗我部信親');
    } else if (n === 4) {
      rt.marker('ford', { x: FORD.x, z: 34 }, '戸次川の浅瀬');
      for (const g of [F.mine, F.nobu, F.sogo]) if (live(g)) { g.order = 'move'; g.dest = { x: FORD.x + (Math.random() - 0.5) * 16, z: 40 }; g.speed = 3.8; g.onArrive = (q) => { q.order = 'hold'; }; }
      sfx('horagai', 0.8);
    } else if (n === 5) {
      rt.world.setTime?.('night');
      rt.marker('camp', { x: CAMP.x, z: CAMP.z }, '味方の陣');
      rt.say(F.mine.leader?.name || '手勢の侍', '夜の土手を北へ。灯りの見える陣が味方じゃ', 3);
      this.spawnChase(rt);
    }
  },

  // 四国の衆が前へ（川を渡り、北の岸へ）
  march(rt, z) {
    const F = rt.flags;
    const o = [[F.nobu, -24], [F.sogo, -54], [F.sen, 30]];
    for (const [g, dx] of o) if (live(g)) { g.order = 'move'; g.dest = { x: FORD.x + dx * (z < 0 && z > -60 ? 0.3 : 1), z: z + 6 }; g.speed = 3.2; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 18; }; }
  },

  // 退くふりの島津の先手：近づくと少し斬り合って、また北へ退く
  spawnBait(rt) {
    const F = rt.flags;
    F.bait = enemyGroup(rt, { faction: 'shimazu', name: '島津の先手', anchor: { x: FORD.x + 6, z: -78 }, facing: 0, width: 5, noRout: true, formation: 'line',
      morale: 90, dmgMult: 0.4, order: 'retreat', dest: { x: CASTLE.x, z: -200 }, speed: 0.9, aggro: 0, fire: false },
    sDress([{ type: 'ashigaru', n: 10 }, { type: 'samurai', n: 2 }]));
    F.bait.kind = 'bait'; F.foes.push(F.bait);
  },

  // 釣り野伏せ：両脇の林と正面（家久の本隊）から
  spawnAmbush(rt) {
    const F = rt.flags;
    for (const g of F.fuse || []) g.advance?.(40, 14, { charge: true });   // 林の縁の伏兵が両脇から出る
    F.lure?.advance?.(40, 16, { charge: true });
    rt.army.play('toki', WOODS[0], 1.5); rt.after(0.4, () => rt.army.play('toki', WOODS[1], 1.5));
    sfx('taiko', 1);
    rt.say('長宗我部元親', '伏せじゃ！　両の林から島津が出たぞ', 3);
    let n = aliveReal(rt);
    for (const [i, w] of WOODS.entries()) {
      if (n > REAL_CAP - 14) break;
      const g = enemyGroup(rt, { faction: 'shimazu', name: '島津の伏兵', anchor: { x: w.x * 0.8, z: w.z }, facing: i ? -Math.PI / 2 : Math.PI / 2, width: 5, noRout: true, formation: 'line',
        morale: 95, dmgMult: 0.42, order: 'attack', seekRange: 60, aggro: 16, speed: 3.4, ambush: true },
      sDress([{ type: 'ashigaru', n: 9 }, { type: 'samurai', n: 2 }, { type: 'gun', n: 2 }]));
      g.kind = 'ambush'; F.foes.push(g); n += 13;
    }
    if (live(F.bait)) { F.bait.order = 'attack'; F.bait.seekRange = 40; F.bait.aggro = 14; F.bait.speed = 3; }
    if (n < REAL_CAP - 12) {
      F.ieh = enemyGroup(rt, { faction: 'shimazu', name: '島津家久の本隊', anchor: { x: F.nobuU?.pos.x ?? 0, z: (F.nobuU?.pos.z ?? -140) - 40 }, facing: 0, width: 5, noRout: true, formation: 'line',
        morale: 100, dmgMult: 0.45, order: 'attack', seekRange: 50, aggro: 16, speed: 3.2 },
      sDress([{ type: 'busho', n: 1, o: { name: '島津家久', invuln: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }]));
      F.ieh.kind = 'main'; F.foes.push(F.ieh);
      F.ieh.focusGroup = F.nobu;
    }
    // 仙石の隊は川へ逃げる（史実：仙石は讃岐まで逃げた）
    if (live(F.sen)) { F.sen.order = 'move'; F.sen.dest = { x: FORD.x + 20, z: 60 }; F.sen.speed = 4.2; F.sen.onArrive = (q) => { q.order = 'move'; q.dest = { x: CAMP.x, z: CAMP.z + 10 }; }; }
    rt.after(2.5, () => rt.say('仙石秀久', 'ええい、退け、退け！', 2.5));
    rt.after(5.5, () => rt.say('島津家久', '釣り出したぞ。退くと見せて包め。一人も川へ戻すな', 3));
    // 信親の隊はその場で踏みとどまる
    if (live(F.nobu)) { F.nobu.order = 'hold'; F.nobu.aggro = 12; }
    if (live(F.sogo)) { F.sogo.order = 'hold'; F.sogo.aggro = 12; }
  },

  // 包みが閉じる：信親・十河が討たれる（史実どおり。主人公には救えない）
  closeRing(rt) {
    const F = rt.flags;
    if (F.ringClosed) return;
    F.ringClosed = true;
    const fall = (u, who, line) => {
      if (!u || !u.alive) return;
      u.invuln = false;
      rt.army.kill(u, null);
      rt.banner(`${who}、討死`, line);
    };
    fall(F.nobuU, '長宗我部信親', '包みが閉じた');
    F.front?.rout?.('B', { from: 0, hideAfter: 30 });   // 川向こうの四国の先鋒も崩れる
    rt.after(2.4, () => fall(F.sogoU, '十河存保', '四国の衆が崩れる'));
    rt.after(1.2, () => rt.say(F.mine.leader?.name || '手勢の侍', `${nm(rt)}殿、信親様が……！　ここは退くほかござらぬ`, 3.2));
    for (const g of [F.nobu, F.sogo]) if (live(g)) { g.order = 'move'; g.dest = { x: FORD.x - 10, z: 40 }; g.speed = 3.6; }
    // 元親も渡りの手前から落ちていく（史実：伊予へ逃れた）
    if (live(F.moto)) { F.moto.order = 'move'; F.moto.dest = { x: CAMP.x + 20, z: CAMP.z + 30 }; F.moto.speed = 3.8; }
    rt.after(5.6, () => rt.say('長宗我部元親', '弥三郎（信親）が……。退け、退くのじゃ', 3));
    rt.after(3.4, () => this.toStep(rt, 4));
  },

  // 夜の追手：浅瀬を渡って追ってくる
  spawnChase(rt) {
    const F = rt.flags;
    let n = aliveReal(rt);
    for (let i = 0; i < 2 && n < REAL_CAP - 10; i++) {
      const g = enemyGroup(rt, { faction: 'shimazu', name: '島津の追手', anchor: { x: FORD.x + (i ? 14 : -14), z: -14 }, facing: Math.PI, width: 4, noRout: true, formation: 'line',
        morale: 90, dmgMult: 0.38, order: 'attack', seekRange: 70, aggro: 14, speed: 3.3 },
      sDress([{ type: 'ashigaru', n: 7 }, { type: 'samurai', n: 1 }]));
      g.kind = 'chase'; g.focus = rt.player.u; F.foes.push(g); n += 8;
    }
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.step) return;
    const P = rt.player.u;
    // 手勢は本人の脇に付く
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      const g = F.mine;
      if (live(g)) {
        const c = g.center();
        if (dist(c, P.pos) > 7 || F.step >= 4) { g.order = 'move'; g.dest = { x: P.pos.x + 2, z: P.pos.z + (F.step >= 4 ? 3 : -2) }; g.speed = 3.8; }
        else { g.order = 'attack'; g.seekRange = 12; }
      }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    // 負け：連れた兵が全部討たれた
    const squadAlive = (rt.squad || []).filter((s) => s.alive).length;
    if (F.step >= 2 && !live(F.mine) && !squadAlive) { this.lose(rt, '連れた兵が全部討たれた'); return; }
    // 退くふりの先手：近づかれたら振り向き、離れたらまた退く
    const B = F.bait;
    if (live(B) && F.step === 2) {
      const d = dist(B.center(), P.pos);
      if (d < 10 && B.order === 'retreat') { B.order = 'attack'; B.aggro = 10; B.seekRange = 14; B.speed = 2.6; B.turnT = rt.t; }
      else if (B.order === 'attack' && rt.t - (B.turnT || 0) > 7) { B.order = 'retreat'; B.dest = { x: CASTLE.x, z: -200 }; B.speed = 1.6; B.aggro = 0; }
    }
    // 段の移り
    if (F.step === 1 && P.pos.z < -30) this.toStep(rt, 2);
    else if (F.step === 2 && (P.pos.z < -118 || rt.t - F.stepT > 45)) this.toStep(rt, 3);
    else if (F.step === 3) {
      // 信親の隊へ駆けるが、包みが閉じる（近づいても、時が来ても）
      const near = F.nobuU?.alive && dist(F.nobuU.pos, P.pos) < 9;
      if ((near && rt.t - F.stepT > 10) || rt.t - F.stepT > 24) this.closeRing(rt);
    } else if (F.step === 4 && P.pos.z > 26) this.toStep(rt, 5);
    else if (F.step === 5 && dist(P.pos, CAMP) < 12) this.win(rt);
    // 追手：川を渡り終えた後は、本人と手勢を追う
    // 退く段の追手は、人の走りより少し遅く、斬り合いは軽く（止まれば囲まれるが、走れば抜けられる）
    if (F.step >= 4) for (const g of F.foes) if (live(g)) {
      if (g.order !== 'attack') { g.order = 'attack'; g.seekRange = 60; g.aggro = 14; }
      if (!g.chaseSoft) { g.chaseSoft = true; g.dmgMult = Math.min(g.dmgMult || 1, 0.1); g.speed = Math.min(g.speed || 3, 1.6); }
    }
    // 包みが閉じた時、手勢が身を挺して本人を囲みの外へ押し出す（息を継がせる）
    if (F.step >= 4 && !F.breath) { F.breath = true; P.hp = Math.max(P.hp, P.maxHp * 0.7); }
    // 遠く離れた敵は去らせる（重さ）
    if (F.step === 5) for (const g of F.foes) for (const u of g.units) if (u.alive && !u.gone && dist(u.pos, P.pos) > 110) rt.army.despawn(u);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('s5');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    const n = (F.mine?.count || 0) + (rt.squad || []).filter((s) => s.alive).length;
    rt.award((t) => { t.main = true; t.special = { label: '戸次川から兵を連れて生きて戻った', pts: 18 }; }, '戸次川から生きて戻った');
    rt.banner('戸次川の大敗', `生きて戻った。連れた兵 ${n}人`);
    const A = this.talk.after;
    rt.after(1.2, () => rt.say(nm(rt), A[0][1], 3.2));
    rt.after(4.6, () => rt.say(A[1][0], A[1][1], 3.6));
    rt.after(8.6, () => rt.say('大友義統', '仙石殿は船で讃岐へ逃げられた由……。府内も、もう持たぬ', 3.4));
    rt.finish({ scriptedEnd: true }, 13);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.finish({ failureReason: why }, 6);
  },

  // 退く段（④⑤）は、共通の退避（居残る味方へ戻る）でなく、この戦の退き口（浅瀬→北の陣）をたどる
  botEvacuating(b) { return (b.flags.step || 0) >= 4; },

  // bot：近い敵を突き、段の行き先へ。退く段は敵を振り切って走る（すぐ横の敵だけ払う）
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    // 退く段は振り返らずに走る（川の中で足を止めると囲まれる）
    const r = F.step >= 4 ? 0 : F.step === 3 ? 4 : 7;
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
    if (F.step === 1) q = { x: FORD.x, z: -46 };
    else if (F.step === 2) q = live(F.bait) ? F.bait.center() : { x: CASTLE.x, z: -140 };
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
