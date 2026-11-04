// ======================================================================
// 豊臣編　長久手の戦い（天正十二年四月九日）。調べは docs/battle_refs/t03_komaki.md。
// 小牧の対陣（b_t03_komaki.js）の続き。AR の 2（kaito 11/3）：三河中入りの羽柴秀次隊が襲われ、
// 堀秀政が檜ヶ根で押し返して退き、最後に徳川家康・織田信雄 対 池田恒興・森長可。羽柴方には非常に苦しい戦。
// ①白山林：朝飯中、南東と北から挟まれる。秀次様の馬印の前で寄せる徳川勢を討つ
// ②秀次様を連れて、西の檜ヶ根の堀秀政の陣まで走る（追われる）
// ③檜ヶ根の柵の前に立ち、坂を登る徳川勢を通さない（堀の鉄砲が撃つ）
// ④南の仏ヶ根の森長可様の鶴丸の旗へ走る（家康の本隊が池田・森の後ろへ回った）
// ⑤森長可様の旗の前で、東の井伊の赤備えを食い止める。南から徳川の本隊も寄せ、挟まれる。森・池田が討たれる
// ⑥西の細ヶ根の堀秀政の殿の旗まで退く（赤備えに追われる）
// 負け：秀次様が討たれる・堀の陣を破られる・連れた兵がほとんど討たれる・赤備えに囲まれる（刻限）。
// 家康と信雄は南東の御旗山の本陣（見えない壁の外）。旗本の何百に守られ、前に出ない（AR の 3）。
// 向き：西（−x）が退く道、東（+x）が白山林、中ほどの丘が檜ヶ根、南（+z）が仏ヶ根・長久手。間隔は縮めた復元。
// 地形：国土地理院の標高（asset_dem_nagakute.js）の尾根と谷を、道と戦う床から離れた所へ足す。
// ======================================================================
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demDetail } from './dem.js';
import { enemyGroup, allyGroup, gauss, wallLine } from './bhelp.js';
import { distToPolyline } from './world.js';
import { sfx } from './audio.js';
import { withGuard } from './toyo_bot.js';
import { STAGES } from './stages.js';
import { ARMOR, fl, dressT, foeKnot, live, aliveN, aliveReal, dist, ieyasuHonjin, walls } from './b_t03_komaki.js';

const XW = 158, ZN = -120, ZS = 120;
const ROAD = [[156, -30], [112, -26], [64, -18], [12, -10], [-50, -14], [-110, -18], [-156, -22]];
const SOUTH = [[12, -10], [24, 30], [34, 72]];       // 檜ヶ根から仏ヶ根へ下る道
const CAMP = { x: 112, z: -26 };                     // 白山林の秀次の陣
const HINOKI = { x: 12, z: -10 };                    // 檜ヶ根（堀秀政の陣）
const HIDE_STOP = { x: -2, z: -14 };                 // 秀次が堀隊の後ろで息をつく所
const HOTOKE = { x: 34, z: 76 };                     // 仏ヶ根（池田・森の陣）
const EXIT = { x: -130, z: -20 };                    // 細ヶ根の堀秀政の殿
const HONJIN = { x: 110, z: 150 };                   // 御旗山の家康・信雄の本陣（壁の外）
const REAL_CAP = 236;
const TIME_UP = 720;
const AKA = { armor: ARMOR.akazonae, cloth: 0x8e2a1e, lace: 0xa0402a, flag: 'akazonae' };

let nkDem = null, heightDem = null, heightFixed = false;
BATTLE_ASSETS.t03b_nagakute = Object.freeze([...assetsForBattle(''), 'dem_nagakute']);
useTerrain('dem_nagakute', (data) => { nkDem = data; heightDem = null; heightFixed = false; });
function heightBase(x, z) {
  let h = 1.6 * Math.sin(x * 0.021 + 0.4) * Math.cos(z * 0.018 - 0.3) + 0.9 * Math.sin(x * 0.07 - z * 0.05);
  h += 5 * gauss(x, z, 128, -40, 2600);                       // 白山林の丘
  h += 6.5 * gauss(x, z, HINOKI.x + 6, HINOKI.z - 6, 1500);   // 檜ヶ根
  h += 4 * gauss(x, z, -60, -70, 3800);                       // 色金山の方の高み
  h += 3 * gauss(x, z, HOTOKE.x - 6, HOTOKE.z + 4, 900);      // 仏ヶ根
  h += 18 * gauss(x, z, HONJIN.x, HONJIN.z + 10, 1100);       // 御旗山（家康の本陣）
  h -= 2 * gauss(x, z, 70, 80, 3000);                         // 長久手の低地
  return h;
}
function height(x, z) {
  if (!heightFixed) { heightFixed = true; heightDem = nkDem; }
  let h = heightBase(x, z);
  if (heightDem) {
    const away = Math.max(0, Math.min(1, (Math.min(distToPolyline(x, z, ROAD), distToPolyline(x, z, SOUTH)) - 18) / 16));
    if (away > 0 && z < ZS) h += away * demDetail(heightDem, x, z, { xy: 8, win: 80, scale: 0.35 });
  }
  return h;
}

const STAGE_TEXT = ['',
  '羽柴秀次様の馬印の前に立ち、寄せる徳川勢を押し返す',
  '秀次様を連れて、西の檜ヶ根の堀秀政様の陣まで走る',
  '檜ヶ根の柵の前に立ち、坂を登る徳川勢を通さない',
  '南の仏ヶ根の森長可様の鶴丸の旗へ走る',
  '森長可様の旗の前で、東の井伊の赤備えを食い止める',
  '西の細ヶ根の堀秀政様の旗まで退く'];
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

const t03b_nagakute = {
  spawn: { x: CAMP.x - 4, z: CAMP.z + 6, heading: Math.PI / 2 },
  minutes: 10,
  compactIntro: true,
  introText: () => '三河へ回り込む途中、白山林で朝飯の最中。',
  missionSingleLine: true,
  hideGuideSteps: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  noFrontFill: true,   // 作り物の乱戦を足さない（AR の 7）
  frontlineDensity: false,   // 小勢を足さない（織田の旗の小勢が出た・本物の兵の枠を段の寄せに残す）
  alwaysMelee: false,
  foeMarks: true,
  playerAtkMax: 3,
  playerTaken: 0.5,
  playerRegen: 0.025,
  botDefendsFort: true,
  closeCombatAssist: true,
  noWinCrane: true,
  missionPin(rt) {
    const F = rt.flags;
    if (!F.stage || F.ending) return null;
    let p;
    if (F.stage === 1) p = F.hideU?.alive ? F.hideU.pos : CAMP;
    else if (F.stage === 2) p = HIDE_STOP;
    else if (F.stage === 3) p = { x: HINOKI.x + 16, z: HINOKI.z };
    else if (F.stage === 4 || F.stage === 5) p = F.moriU?.alive ? { x: F.moriU.pos.x + 4, z: F.moriU.pos.z } : HOTOKE;
    else p = EXIT;
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.stage === 6 ? 10 : 8;
    return PIN;
  },
  world: {
    seed: 15840,
    time: 'morning',
    mist: 0.25,
    groundHalf: 220,
    height,
    paths: [{ pts: ROAD, w: 3.5 }, { pts: SOUTH, w: 2.5 }],
    patchyGround: true,
    tint(x, z, h, c) {
      const a = Math.sin(x * 0.04 + 1.1) * Math.cos(z * 0.035 - 0.4);
      const k = 0.5 + 0.5 * a;
      c.setRGB(c.r * (0.84 + k * 0.3), c.g * (0.9 + k * 0.24), c.b * (0.8 + k * 0.26));
    },
    groves: [
      { x: 132, z: -44, r: 30, n: 120, sx: 1.2, sz: 1 },
      { x: 104, z: -66, r: 18, n: 40, kind: 'matsu' },
      { x: 150, z: 4, r: 16, n: 34, kind: 'matsu' },
      { x: 30, z: -46, r: 18, n: 36 },
      { x: -64, z: -78, r: 26, n: 60, kind: 'sugi' },
      { x: -100, z: 40, r: 22, n: 40 },
      { x: HONJIN.x - 20, z: HONJIN.z + 24, r: 20, n: 40 },
    ],
    clearGroves: true,
    clear: (x, z) => dist({ x, z }, CAMP) < 16 || dist({ x, z }, HINOKI) < 22 || dist({ x, z }, HOTOKE) < 22 || distToPolyline(x, z, ROAD) < 6 || distToPolyline(x, z, SOUTH) < 5,
    trees: 220,
    tufts: 2200,
    treeDensity: (x, z) => (Math.abs(z) < 90 && Math.abs(x) < 150 ? 0.25 : 1),
    fleeOut: (x, z, team) => (team === 1 ? x > 170 || z > 170 : x < -170),
  },

  setup(rt) {
    const F = rt.flags;
    F.stage = 0; F.holdPlayer = true; F.waves = []; F.pursuit = [];
    const me = rt.G?.name || '自分';
    // 羽柴秀次（総大将・馬上）と馬廻
    F.hideG = allyGroup(rt, { name: '羽柴秀次の馬廻', fullStrength: true, anchor: { ...CAMP }, facing: -Math.PI / 2, width: 4, aggro: 4, speed: 4.6, order: 'hold', noRout: true, dmgMult: 0.5 },
      fl([{ type: 'busho', n: 1, o: { name: '羽柴秀次', horse: true } }, { type: 'samurai', n: 8 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }], 'toyotomi'));
    F.hideU = F.hideG.units.find((u) => u.name === '羽柴秀次');
    F.hideU.maxHp = F.hideU.hp = 700;
    F.hideU.invuln = true;
    // 連れた兵（主人公の組）
    F.men = allyGroup(rt, { name: '秀次隊の足軽', fullStrength: true, anchor: { x: CAMP.x - 6, z: CAMP.z + 10 }, facing: Math.PI / 2, width: 5, aggro: 10, speed: 3.9,
      order: 'hold', noRout: true, dmgMult: 0.5 },
    fl([{ type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'ashigaru', n: 3 }, { type: 'samurai', n: 2 }, { type: 'gun', n: 2 }], 'toyotomi'));
    F.men.ai = true;
    F.menN0 = aliveN(F.men);
    // 秀次隊のほかの手（林の中で崩れていく）
    F.camp = allyGroup(rt, { name: '秀次隊', fullStrength: true, anchor: { x: CAMP.x + 14, z: CAMP.z - 8 }, facing: Math.PI / 2, width: 7, aggro: 9, speed: 3.2, order: 'hold', dmgMult: 0.4 },
      fl([{ type: 'ashigaru', n: 16, o: { flagScale: 1 } }, { type: 'samurai', n: 3 }, { type: 'bow', n: 3 }], 'toyotomi'));
    F.camp.ai = true;
    // 檜ヶ根の堀秀政の隊（丘の上で鉄砲を並べる）と、東向きの柵
    F.hori = allyGroup(rt, { name: '堀秀政の手', fullStrength: true, anchor: { x: HINOKI.x + 4, z: HINOKI.z }, facing: Math.PI / 2, width: 12, aggro: 10, speed: 3.4, order: 'hold', noRout: true, dmgMult: 0.5 },
      fl([{ type: 'busho', n: 1, o: { name: '堀秀政', horse: true } }, { type: 'gun', n: 12 }, { type: 'ashigaru', n: 12, o: { flagScale: 1 } }, { type: 'samurai', n: 4 }], 'hori'));
    F.horiU = F.hori.units.find((u) => u.name === '堀秀政');
    if (F.horiU) F.horiU.invuln = true;
    const SX = HINOKI.x + 12;
    F.saku = [...wallLine(rt, [[SX, HINOKI.z - 22], [SX, HINOKI.z - 3]], { team: 0, hp: 1e9, name: '檜ヶ根の柵' }),
      ...wallLine(rt, [[SX, HINOKI.z + 3], [SX, HINOKI.z + 22]], { team: 0, hp: 1e9, name: '檜ヶ根の柵' })];
    // 御旗山の家康・信雄の本陣（壁の外。前に出ない）
    F.honjin = ieyasuHonjin(rt, HONJIN, -Math.PI * 0.8);
    rt.obj('main', STAGE_TEXT[1], 'main');
    const L = [['羽柴秀次', '池田・森の手は岩崎の城を落として先へ進んだ。ここで飯にいたせ', 0.5], [me, '後ろの小牧の家康が、気づかねばよいが……', 3.8],
      ['物見', '徳川勢じゃ！　南の林から来るぞ！', 6.8]];
    for (const [who, s, t] of L) rt.after(t, () => rt.say(who, s, 2.8));
    rt.after(8.6, () => { F.holdPlayer = false; this.stage(rt, 1); });
  },

  stage(rt, n) {
    const F = rt.flags;
    F.stage = n; F.st0 = rt.t;
    rt.obj('main', STAGE_TEXT[n], 'main');
    if (n === 1) {
      // 水野・大須賀の手が南東から、二十秒後に榊原・丹羽の手が北から（挟まれる）
      sfx('horagai', 0.9);
      F.w1 = [0, 1, 2].map((i) => this.wave(rt, { x: CAMP.x + 20 + i * 8, z: CAMP.z + 40 - i * 8 }, 12, CAMP, '大須賀康高の手'));
      this.nameFoe(F.w1[0], '大須賀康高');
      rt.army.play('toki', { x: CAMP.x + 26, z: CAMP.z + 30 }, 1.4);
      rt.after(18, () => {
        if (F.stage !== 1) return;
        F.w1.push(...[0, 1].map((i) => this.wave(rt, { x: CAMP.x - 10 + i * 18, z: ZN + 8 }, 12, CAMP, '榊原康政の手')));
        this.nameFoe(F.w1[3], '榊原康政');
        rt.army.play('toki', { x: CAMP.x, z: ZN + 14 }, 1.4);
        rt.say('物見', '北からも！　榊原の旗じゃ、挟まれた！', 2.8);
      });
      F.w1N = () => F.w1.reduce((s, g) => s + (g ? g.units.length : 0), 0);
    } else if (n === 2) {
      rt.say('羽柴秀次', '馬を引け！　ここは捨てる！', 2.6);
      F.hideU.invuln = false;
      F.camp.order = 'retreat'; F.camp.dest = { x: CAMP.x + 40, z: ZN + 4 };   // 林の奥へ散る
      F.camp.onArrive = () => { for (const u of F.camp.units) if (u.alive) rt.army.despawn(u); };
      for (const g of F.waves) if (live(g)) { g.order = 'attack'; g.seekRange = 50; g.focus = F.hideU; }
      rt.after(3.2, () => rt.say('使番', '木下祐久様、お討死！　秀次様の馬も撃たれましてござる', 3));
      rt.after(10, () => { if (F.stage === 2) this.wave(rt, { x: 80, z: 30 }, 10, null, '水野忠重の手', F.hideU); });
      rt.after(26, () => { if (F.stage === 2) this.wave(rt, { x: 50, z: -60 }, 10, null, '丹羽氏次の手', F.hideU); });
    } else if (n === 3) {
      rt.say('堀秀政', '鉄砲、構えよ。柵まで引き付けて撃て！', 2.8);
      F.hideU.invuln = true;
      F.hideG.order = 'move'; F.hideG.dest = { ...EXIT }; F.hideG.speed = 4;
      F.hideG.onArrive = () => { for (const u of F.hideG.units) if (u.alive) rt.army.despawn(u); };
      for (const g of F.waves) for (const u of g.units) if (u.alive && u.pos.x > 60) rt.army.despawn(u);
      F.w3 = [0, 1, 2].map((i) => this.wave(rt, { x: HINOKI.x + 70 + i * 8, z: HINOKI.z - 18 + i * 18 }, 12, HINOKI, '榊原康政の手'));
      F.w3N = F.w3.reduce((s, g) => s + aliveN(g), 0);
      rt.army.play('toki', { x: HINOKI.x + 64, z: HINOKI.z }, 1.4);
      F.hori.order = 'attack'; F.hori.seekRange = 26;
    } else if (n === 4) {
      rt.say('使番', '家康の本隊が御旗山に！　池田・森の後ろへ回っておりまする！', 3.2);
      rt.after(3.4, () => rt.say('堀秀政', 'わしはここで退く。おぬしは仏ヶ根の武蔵守へ急を知らせよ', 3.2));
      F.hori.order = 'move'; F.hori.dest = { x: EXIT.x + 6, z: EXIT.z + 12 }; F.hori.speed = 3.6;
      for (const g of F.waves) for (const u of g.units) if (u.alive) rt.army.despawn(u);
      if (live(F.camp)) for (const u of F.camp.units) if (u.alive) rt.army.despawn(u);
      // 仏ヶ根の池田恒興・森長可（先に進み、白山林と切り離されている。本物の兵の枠のため、この段で置く）
      const o = { facing: Math.PI / 2, width: 7, aggro: 8, speed: 3.6, order: 'hold', noRout: true, dmgMult: 0.5, fullStrength: true };
      F.ikeG = allyGroup(rt, { ...o, name: '池田恒興の旗本', anchor: { x: HOTOKE.x - 6, z: HOTOKE.z + 16 } },
        fl([{ type: 'busho', n: 1, o: { name: '池田恒興', horse: true } }, { type: 'busho', n: 1, o: { name: '池田元助', horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], 'ageha'));
      F.moriG = allyGroup(rt, { ...o, name: '森長可の旗本', anchor: { x: HOTOKE.x + 4, z: HOTOKE.z - 6 } },
        fl([{ type: 'busho', n: 1, o: { name: '森長可', horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], 'tsuru'));
      F.moriU = F.moriG.units.find((u) => u.name === '森長可');
      for (const u of [...F.ikeG.units, ...F.moriG.units]) if (u.type === 'busho') u.invuln = true;
    } else if (n === 5) {
      // 東から井伊の赤備え（正面）、南東から家康の旗本の先手（横）。挟まれる
      rt.say('森長可', '家康め、来おったか。鬼武蔵の槍を見せてくれる！', 2.8);
      sfx('horagai', 1);
      for (const g of F.waves) for (const u of g.units) if (u.alive && dist(u.pos, HOTOKE) > 60) rt.army.despawn(u);
      F.aka = [0, 1].map((i) => this.akazonae(rt, { x: HOTOKE.x + 56, z: HOTOKE.z - 14 + i * 22 }, HOTOKE));
      this.nameFoe(F.aka[0], '井伊直政', 'cavalry');
      rt.after(14, () => {
        if (F.stage !== 5) return;
        F.side = [0, 1].map((i) => this.wave(rt, { x: HOTOKE.x + 20 + i * 18, z: ZS - 6 }, 12, HOTOKE, '徳川家康の旗本の先手'));
        rt.army.play('toki', { x: HOTOKE.x + 24, z: ZS - 14 }, 1.6);
        rt.say('物見', '南からも金扇の旗本が！　挟まれまする！', 2.8);
      });
      rt.after(34, () => { if (F.stage === 5) this.fall(rt, F.moriG, '森長可', '森武蔵守様、眉間を撃たれお討死！'); });
      rt.after(46, () => { if (F.stage === 5) { this.fall(rt, F.ikeG, '池田恒興', '勝入様、永井直勝に討たれましてござる！'); this.fall(rt, F.ikeG, '池田元助'); } });
      rt.after(52, () => { if (F.stage === 5) this.stage(rt, 6); });
    } else if (n === 6) {
      rt.banner('池田恒興・森長可、討死', '西の堀秀政様の旗まで退け');
      F.menN0 = Math.max(F.menN0r || 0, aliveN(F.men));
      F.hori.order = 'hold';
      for (const g of F.waves) if (live(g)) { g.order = 'attack'; g.seekRange = 40; }
      F.nextPursuit = rt.t + 6;
    }
  },

  wave(rt, at, n, to, name = '徳川勢', focus, kit) {
    const F = rt.flags;
    if (aliveReal(rt) + n > REAL_CAP) return null;
    const g = enemyGroup(rt, { faction: 'tokugawa', name, anchor: at, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, width: 4, formation: 'line', morale: 85, dmgMult: 0.42,
      order: 'attack', seekRange: 50, aggro: 14, speed: 3.6, noRout: true, ...(focus ? { focus } : {}) }, foeKnot(n, kit));
    if (to) g.dest = { x: to.x, z: to.z };
    F.waves.push(g);
    return g;
  },
  // 井伊の赤備え：騎馬と侍の多い組
  akazonae(rt, at, to) {
    const F = rt.flags;
    if (aliveReal(rt) + 12 > REAL_CAP) return null;
    const g = enemyGroup(rt, { faction: 'tokugawa', name: '井伊の赤備え', anchor: at, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, width: 4, formation: 'line', morale: 90, dmgMult: 0.36,
      order: 'attack', seekRange: 60, aggro: 16, speed: 4.2, noRout: true },
    dressT([{ type: 'cavalry', n: 3 }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }, { type: 'gun', n: 2 }], AKA));
    if (to) g.dest = { x: to.x, z: to.z };
    F.waves.push(g);
    return g;
  },
  nameFoe(g, name, type = 'samurai') {
    const u = g && (g.units.find((q) => q.alive && q.type === type) || g.units.find((q) => q.alive && q.type === 'samurai'));
    if (u) { u.name = name; u.invuln = true; }
  },
  // 名のある将の討死（史実どおり。隊も崩れる）
  fall(rt, g, name, line) {
    if (!g) return;
    const u = g.units.find((q) => q.name === name && q.alive);
    if (u) { u.invuln = false; rt.army.kill(u); }
    if (line) rt.say('使番', line, 3);
    if (!g.units.some((q) => q.alive && q.type === 'busho')) { g.routed = true; g.order = 'flee'; }
  },
  // 退く段の追手（赤備え）：主人公の後ろ（東）から
  pursue(rt) {
    const F = rt.flags, P = rt.player.u.pos;
    const g = this.akazonae(rt, { x: Math.min(XW - 4, P.x + 50), z: Math.max(ZN + 6, Math.min(ZS - 6, P.z + (F.pursuit.length % 2 ? 14 : -14))) }, null);
    if (!g) return;
    F.pursuit.push(g);
    rt.army.play('toki', g.anchor, 1.2);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.stage) return;
    const P = rt.player.u;
    walls(rt, XW, ZN, ZS);
    if ((F.menT = (F.menT || 0) - dt) <= 0) {
      F.menT = 0.5;
      const c = live(F.men) && F.men.center();
      if (c) {
        const far = Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > (F.stage === 6 || F.stage === 4 ? 5 : 8);
        if (far) { F.men.order = 'move'; F.men.dest = { x: P.pos.x + 2, z: P.pos.z + 2 }; F.men.speed = 4.4; }
        else { F.men.order = 'attack'; F.men.seekRange = F.stage === 6 ? 6 : 14; }
      }
    }
    if (F.hideU && !F.hideU.alive && F.stage <= 2) return this.lose(rt, '秀次様が討たれた');
    if (rt.t > TIME_UP) return this.lose(rt, '赤備えに囲まれた');
    if (F.menN0 >= 3 && aliveN(F.men) < Math.ceil(F.menN0 / 4)) return this.lose(rt, '連れた兵がほとんど討たれた');
    // 遠く離れた敵は去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - dt) <= 0) {
      F.gcT = 1;
      for (const g of F.waves) for (const u of g.units) if (u.alive && !u.gone && dist(u.pos, P.pos) > 110) rt.army.despawn(u);
    }
    const el = rt.t - F.st0;
    if (F.stage === 1) {
      const left = F.w1.reduce((s, g) => s + aliveN(g), 0);
      if ((el > 30 && left <= F.w1N() * 0.45) || el > 70) {
        rt.award((t) => t.side.push('白山林で秀次様の馬印を守った'), '白山林で秀次様の馬印を守った');
        this.stage(rt, 2);
      }
    } else if (F.stage === 2) {
      const H = F.hideU, near = dist(H.pos, P.pos) < 40;
      if ((F.hideT = (F.hideT || 0) - dt) <= 0) {
        F.hideT = 0.4;
        if (near) { F.hideG.order = 'move'; F.hideG.dest = { ...HIDE_STOP }; } else F.hideG.order = 'hold';
      }
      if (dist(H.pos, HIDE_STOP) < 9) {
        rt.say('羽柴秀次', '……助かった。堀の陣じゃ', 2.4);
        rt.award((t) => t.side.push('秀次様を檜ヶ根まで連れて走った'), '秀次様を檜ヶ根まで連れて走った', H.pos);
        this.stage(rt, 3);
      } else if (el > 100) { H.pos.x = HIDE_STOP.x + 3; H.pos.z = HIDE_STOP.z; }
    } else if (F.stage === 3) {
      // 堀の陣を破られる：徳川の兵が柵の内（西）に八人
      let inside = 0;
      for (const g of F.w3) if (g) for (const u of g.units) if (u.alive && !u.gone && u.pos.x < HINOKI.x + 8 && Math.abs(u.pos.z - HINOKI.z) < 26) inside++;
      if (inside >= 8) return this.lose(rt, '堀様の陣を破られた');
      const left = F.w3.reduce((s, g) => s + aliveN(g), 0);
      if ((el > 25 && left <= F.w3N * 0.4) || el > 85) {
        rt.say('堀秀政', '押し返したぞ！', 2.2);
        rt.award((t) => t.side.push('檜ヶ根で追手を押し返した'), '檜ヶ根で追手を押し返した');
        this.stage(rt, 4);
      }
    } else if (F.stage === 4) {
      if (F.moriU && dist(P.pos, F.moriU.pos) < 16) {
        rt.say(rt.G?.name || '自分', '武蔵守様！　家康の本隊が後ろに！', 2.6);
        this.stage(rt, 5);
      }
    } else if (F.stage === 5) {
      F.menN0r = Math.max(F.menN0r || 0, aliveN(F.men));
    } else if (F.stage === 6) {
      if (rt.t > F.nextPursuit && F.pursuit.length < 5) { F.nextPursuit = rt.t + 22; this.pursue(rt); }
      if (P.pos.x < EXIT.x + 20) this.win(rt);
    }
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.objFail('main');
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    rt.award((t) => t.side.push(`兵${aliveN(F.men)}人を連れて退いた`), '兵を連れて退いた');
    rt.banner('長久手の負け', '兵を連れて退いた');
    rt.say('堀秀政', '勝入殿も武蔵守も討たれた。よう生きて戻った', 3);
    rt.after(3.2, () => rt.say('使番', '本多忠勝、わずかな兵で殿の本隊の前に立ちはだかり、家康は小幡城へ入りましてござる', 3.6));
    rt.after(7.2, () => rt.say('羽柴秀吉', '家康は、戦では勝てぬ男よ', 3));
    rt.after(10.4, () => rt.say('羽柴秀吉', 'ならば信雄殿と和を結び、家康が出て来ずにおれぬようにしてやる', 3.6));
    rt.finish({ scriptedEnd: true }, 15);
  },

  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.stage) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const run = F.stage === 2 || F.stage === 4 || F.stage === 6;
    const ahead = (o) => ok(o) && (F.stage !== 6 || o.pos.x < u.pos.x + 0.5);
    const e = b.army.nearestEnemy(u, run ? 2.6 : 10, ahead);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    let t = EXIT;
    if (F.stage === 1) t = F.hideU?.alive ? F.hideU.pos : CAMP;
    else if (F.stage === 2) t = F.hideU?.alive ? { x: F.hideU.pos.x - 4, z: F.hideU.pos.z } : HIDE_STOP;
    else if (F.stage === 3) t = { x: HINOKI.x + 14, z: HINOKI.z };
    else if (F.stage === 4 || F.stage === 5) t = F.moriU?.alive ? { x: F.moriU.pos.x + 5, z: F.moriU.pos.z } : HOTOKE;
    goTo(p, inp, t.x, t.z, 2);
    if (run) inp.runHeld = true;
  },
};
t03b_nagakute.sides = { a: { name: '羽柴勢（中入り）', mon: 'toyotomi' }, b: { name: '徳川・織田信雄勢', mon: 'tokugawa' } };
t03b_nagakute.force = () => ({ a: 20000, a0: 20000, b: 9300, b0: 9300 });
t03b_nagakute.date = () => '天正十二年四月九日　朝・初夏';
t03b_nagakute.history = '小牧で家康とにらみ合う中、池田恒興の策で、池田恒興・元助、森長可、堀秀政、羽柴秀次のおよそ二万が、家康の留守の三河を突こうと東へ回り込んだ（中入り）。家康はこれを知って小牧山を出て追い、四月九日の朝、白山林で休んでいた秀次の隊を後ろと横から襲って崩した。秀次は馬を失いながら逃れた。堀秀政は檜ヶ根で鉄砲を揃えて追手を押し返したが、家康の本隊が池田・森の後ろへ回ったと知って退いた。家康と信雄は御旗山に本陣を置き、井伊直政の赤備えらを前に出した。長久手で池田・森の勢は前と横から押し包まれ、森長可は眉間を撃たれ、池田恒興・元助も討たれた。秀吉は戦では家康に勝てず、この年の十一月に信雄と和睦し、家康とも手を結んだ。白山林・檜ヶ根・仏ヶ根の間隔と向きは縮めた復元で、主人公の組の動きは遊びのための筋書き。';
t03b_nagakute.famous = [];
t03b_nagakute.botGuardFlee = (b) => b.flags.stage === 2 || b.flags.stage === 4 || b.flags.stage === 6;
t03b_nagakute.botEvacuating = (b) => b.flags.stage === 6;
// 目標の並び（goals5.js）。段の一行は行いと場所で書く。「敵を何人討つ」は共通の一つだけ（AR の 1）
const st = (n) => (rt) => (rt.flags.stage ?? 0) >= n;
STAGES.t03b_nagakute = STAGE_TEXT.slice(1).map((t, i) => (i ? [t, st(i + 1)] : [t]));
withGuard(t03b_nagakute);

export { t03b_nagakute };
export default t03b_nagakute;
