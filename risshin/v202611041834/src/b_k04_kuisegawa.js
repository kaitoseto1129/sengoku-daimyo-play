// ======================================================================
// 徳川編 4　杭瀬川の戦い（慶長五年九月十四日・1600）　関ヶ原の前日の前哨戦。徳川方（東軍）が負ける。調べは docs/battle_refs/k04_kuisegawa.md
// 大垣城を出た島左近・蒲生備中の五百が杭瀬川を渡り、赤坂の東軍の前で刈田をして挑発し、追われると退くふりをする。
// 中村一栄の先手が川を渡って追うと、葦の原に伏せた明石全登（宇喜多）の八百と、引き返した左近の本隊が三方から打ち掛かる。
// 中村の先手は崩れ、家老の野一色頼母は深田で討たれる。有馬豊氏の隊が東の岸で受け、東軍は退く。
// 主人公は中村一栄の先手の侍大将。史実どおり追撃は失敗する。勝ちの形は「頼母の横で伏兵を食い止め、川を東へ渡り、有馬の陣まで逃げ込む」。
// 段：①浅瀬を西へ渡る ②刈田の島の兵に槍を入れる（退くふり） ③葦の伏兵を頼母の旗の横で食い止める ④川を東へ渡って退く ⑤有馬豊氏の陣へ
// 軍勢（AP の 9・10・13、AQ の 3・6、AT の 4）：両軍とも史実の兵数（西軍 千三百・東軍 六千）を、一人を十二人（携帯は二十人）に見立てた陣形の塊（備）で置く。
//   塊は本人の近くで本物の兵に替わり（KIT の wake）、塊どうしは数で押し合う（b_yasen.js の fieldTick）。見せかけの大軍・軽い乱戦・遠くの板の軍勢は置かない。
// 総大将：家康は東の奥の岡山（赤坂）の本陣で旗本に囲まれて動かない。三成は大垣城（地図の外）で場に出ない。左近は史実で前に出た将なので前にいるが討てない。
// 旗：東軍は徳川の旗（中村・有馬の紋は確かめられないので作らない）、西軍は石田（島左近・蒲生）と宇喜多（明石全登）だけ。
// 向き：東が +x（赤坂）、西が −x（大垣）。杭瀬川は南北に流れ、どこでも膝から腰の深さで渡れる（遅くなる）。
// 地形：国土地理院の標高（dem_kuisegawa.js・tools/dem.mjs の kuisegawa）。ゲームの 1 が実の 4m。北東の高みが赤坂の岡山。
// ======================================================================
import DEM from './dem_kuisegawa.js';
import { demSample } from './dem.js';
import { nobori, tawara } from './props.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { MEM_TIGHT } from './settings.js';
import { withGuard } from './toyo_bot.js';
import { fieldButai, fieldTick, routButai, lightPos } from './b_yasen.js';
import { butaiTick } from './butai.js';
import { addSite } from './map_sites.js';
import { setStages } from './b_k_help.js';
import { timeslipField } from './timeslip_field.js';

const SPAWN = { x: 96, z: 8 };
const FORD = { x: 44, z: 4 };                   // 渡る所（川の中ほど）
const BAIT = { x: 8, z: 2 };                    // 島左近の兵が刈田をしている田
const REED = { x: -52, z: 0 };                  // 葦の原（伏兵）
const RING = { x: -18, z: 2 };                  // 包みが閉じる所（葦の原の手前の深田）
const SHIMA_HIDE = { x: -60, z: -52 };          // 左近の本隊が控える所（北の林の陰）
const AKASHI_HIDE = { x: -62, z: 44 };          // 明石全登の伏兵（南の葦の中）
const ARIMA = { x: 78, z: -26 };                // 有馬豊氏の陣（東の岸）
const IEYASU = { x: 205, z: -150 };             // 赤坂の岡山の家康の本陣
const RIVER = [[46, -260], [41, -90], [44, 60], [48, 260]];
const SC = MEM_TIGHT ? 20 : 12;                 // 塊の一人が史実の何人か
// 史実の兵数（調べ：西軍 千三百＝島・蒲生 五百＋明石 八百、東軍 六千＝中村 四千＋有馬 二千）
const HIST = { saki: 1500, naka: 2500, arima: 2000, bait: 200, shima: 300, akashi: 800 };
const A0 = HIST.saki + HIST.naka + HIST.arima, B0 = HIST.bait + HIST.shima + HIST.akashi;
const STEP_TEXT = ['杭瀬川を西へ渡り、刈田をする島左近の兵の前まで進む', '刈田の島左近の兵に槍を入れ、追い立てる',
  '野一色頼母の旗の横に立ち、葦から出る明石全登の伏兵を食い止める', '杭瀬川を東へ渡って退く', '東の岸の有馬豊氏の陣まで逃げ込む'];
const ARM = { tokugawa: 0x24221f, ishida: 0x3a3430, ukita: 0x2e2a26 };

const XY = 4, DEM0 = demSample(DEM, 0, 0);
function height(x, z) {
  let h = (demSample(DEM, x * XY, z * XY) - DEM0) * 0.5;
  h += 0.2 * Math.sin(x * 0.05) * Math.cos(z * 0.04);
  h += 1.2 * gauss(x, z, 74, 0, 90);                 // 東の岸の堤
  return h;
}

const live = (g) => g && g.count > 0;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fl = (list, flag) => list.map((s) => ({ ...s, o: { flag, ...(s.o || {}) } }));

const k04_kuisegawa = {
  missionSingleLine: true,
  noFrontFill: true,         // 作り物の乱戦を足さない（AP の 9）
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,
  enemyTactics: false,       // 敵の動きはこの定義が決める（退くふり・伏兵）
  hideGuideSteps: true,
  noPlayerFoot: true,
  nearbyAllySignLimit: 0,
  foeMarks: true,
  enemyTriangleSigns: true,
  nobiki: true,              // 負け戦の退き口
  wakeRoom: 200,
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
  introText: () => '関ヶ原の前の日。川の向こうで刈田をする島左近の兵を追う。葦の原の伏兵から生きて岸へ戻れ。',
  minutes: 9,
  // 身の回りの合戦の跡（timeslip_field.js）。九月半ば（今の十月半ば）の刈田と川岸の葦
  timeslip: {
    wet: 0.35, dust: 0.3, trample: 0.3, debris: 0.8, arrows: 0.6, reeds: 0.45,
    grass: 0xa49c66, grassTints: [0xffffff, 0xeadcb0, 0xc8c898], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  sides: { a: { name: '東軍（中村・有馬）', mon: 'tokugawa' }, b: { name: '西軍（島・明石）', mon: 'ishida' } },
  // 両軍の残り（史実の数）：塊の名目から。まだ葦に伏せている西軍も数に入れる
  force(rt) {
    const F = rt.flags;
    if (!F.blk) return null;
    const n = (b, h) => (b ? Math.round(b.aliveNominal() * SC) : h);
    const B = F.blk;
    return { a: n(B.saki) + n(B.naka) + n(B.arima), b: n(B.bait) + n(B.shima, HIST.shima) + n(B.akashi, HIST.akashi), a0: A0, b0: B0 };
  },
  date: () => '慶長五年（1600）九月十四日　午後・晴　美濃国 杭瀬川',
  talk: {
    before: [['物見', '川の向こうで、大垣の兵が稲を刈っておりまする。数は二百ほど'], ['中村一栄', '赤坂の目の前で刈田とは、なめおって'],
      ['有馬豊氏', 'あれは島左近の手。わざと少なく見せておるやもしれぬ'], ['野一色頼母', '殿、それがしが先に立ちまする。追い払うのは今'], ['中村一栄', '川を渡れ。刈田の者どもを追い散らせ']],
    after: [['中村一栄', '頼母を……あの深田に置いてきてしもうた'], ['有馬豊氏', '島左近の釣りであった。あすの決戦で返すほかない']],
  },
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  noWake: true,
  world: {
    seed: 1600914,
    time: 'day',
    groundHalf: 260,
    battleViewDistance: 140,
    moveLim: 248,
    noFoeNear: true,         // 敵の後詰めを本人の近くへ寄せない（見せかけの軍勢で囲まない）
    autumn: true,
    patchyGround: true,
    noGroundRipples: true,
    height,
    waterSlow: true,
    muddy: 0.25,
    streams: [{ pts: RIVER, w: 12, depth: 1.2 }],
    paths: [{ pts: [[IEYASU.x - 20, IEYASU.z + 30], [150, -40], [SPAWN.x + 10, 8], [FORD.x + 8, 4]], w: 3 }],
    tint(x, z, h, c) {
      // 九月の刈田と葦。西ほど湿って暗い
      c.setRGB(c.r * 0.55 + 0.24, c.g * 0.5 + 0.2, c.b * 0.4 + 0.08);
      if (x < -30 && Math.abs(z) < 70) c.setRGB(c.r * 0.8, c.g * 0.95, c.b * 0.7);
    },
    clear: (x, z) => (x > -40 && x < 150 && Math.abs(z) < 60) || dist({ x, z }, IEYASU) < 18 || dist({ x, z }, ARIMA) < 14,
    trees: 140,
    tufts: 2800,
    treeDensity: (x, z) => (Math.abs(z) > 80 ? 1 : 0.12),
    // 北の林（左近の本隊の陰）と南の葦の茂み（明石の伏兵）
    groves: [{ x: SHIMA_HIDE.x - 6, z: SHIMA_HIDE.z - 10, r: 22, n: 36 }, { x: AKASHI_HIDE.x - 4, z: AKASHI_HIDE.z + 8, r: 20, n: 26 },
      { x: REED.x - 18, z: -6, r: 14, n: 14 }],
    fleeOut: (x, z, team) => (team === 1 ? x < -230 : x > 240),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world;
    F.step = 0; F.holdPlayer = true; F.foes = []; F.ending = false; F.blk = {}; F.blocks = []; F.follow = [];
    this.camps(rt);
    const B = F.blk;
    // 東軍の塊：中村一栄の先手が川を渡り、中村の本手と有馬の隊は東の岸に残る
    B.saki = this.block(rt, { key: 'saki', name: '中村一栄の先手', team: 0, flag: 'tokugawa', at: { x: 80, z: -2 }, facing: -Math.PI / 2, w: 30, d: 10 });
    B.naka = this.block(rt, { key: 'naka', name: '中村の本手', team: 0, flag: 'tokugawa', at: { x: 126, z: 34 }, facing: -Math.PI / 2, w: 32, d: 12 });
    B.arima = this.block(rt, { key: 'arima', name: '有馬豊氏の隊', team: 0, flag: 'tokugawa', at: { x: ARIMA.x + 6, z: ARIMA.z }, facing: -Math.PI / 2, w: 30, d: 10 });
    // 西軍の囮：刈田の島左近の兵（二百）
    B.bait = this.block(rt, { key: 'bait', name: '刈田の島左近の兵', team: 1, flag: 'ishida', at: BAIT, facing: Math.PI / 2, w: 22, d: 6 });
    for (const [x, z] of [[2, -12], [16, 10], [10, 18], [-2, 6]]) rt.scene.add(tawara(W, x, z, 0.4, 3));
    // 名のある将の本物の組（塊と一緒に動く）
    const ally = (o, list) => { const g = allyGroup(rt, { fullStrength: true, facing: -Math.PI / 2, width: 5, aggro: 9, speed: 3.4, order: 'hold', noRout: true, ...o }, fl(list, 'tokugawa')); g.mon = 'tokugawa'; return g; };
    F.kazu = ally({ name: '中村一栄の旗本', anchor: { x: 84, z: 2 } }, [{ type: 'busho', n: 1, o: { name: '中村一栄', invuln: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }]);
    F.noi = ally({ name: '野一色頼母の組', anchor: { x: 76, z: -8 } }, [{ type: 'busho', n: 1, o: { name: '野一色頼母', invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }]);
    F.noiU = F.noi.units.find((u) => u.type === 'busho');
    F.arimaG = ally({ name: '有馬豊氏の旗本', anchor: { x: ARIMA.x + 2, z: ARIMA.z }, aggro: 6, seekRange: 10 }, [{ type: 'busho', n: 1, o: { name: '有馬豊氏', invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'gun', n: 6 }]);
    F.mine = ally({ name: '手勢', anchor: { x: SPAWN.x + 3, z: SPAWN.z + 5 }, width: 4, speed: 3.8, dmgMult: 0.9 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 13 }]);
    F.follow = [[F.kazu, B.saki, 4, 4], [F.noi, B.saki, -4, -4]];
    // 刈田の島の兵を率いる蒲生備中（本物）
    F.gamo = enemyGroup(rt, { faction: 'ishida', name: '蒲生備中の組', anchor: { x: BAIT.x - 4, z: BAIT.z }, facing: Math.PI / 2, width: 5, formation: 'line', noRout: true,
      morale: 90, dmgMult: 0.5, order: 'hold', aggro: 8, seekRange: 12, speed: 3.2 },
    fl([{ type: 'busho', n: 1, o: { name: '蒲生備中', invuln: true, horse: true } }, { type: 'samurai', n: 4, o: { keep: true } }, { type: 'ashigaru', n: 6, o: { keep: true } }], 'ishida'));
    F.foes.push(F.gamo);
    F.follow.push([F.gamo, B.bait, 0, 0]);
    rt.obj('main', STEP_TEXT[0], 'main', true);
    rt.banner('杭瀬川', '慶長五年九月十四日　赤坂');
    this.talk.before.forEach(([who, s], i) => rt.after(0.6 + i * 3, () => rt.say(who, s, 2.8)));
    rt.after(0.6 + this.talk.before.length * 3, () => { F.holdPlayer = false; this.toStep(rt, 1); });
  },

  // 家康の本陣（赤坂の岡山）と有馬の陣（東の岸）。どちらも本物の旗本がいる
  camps(rt) {
    const F = rt.flags, W = rt.world;
    KIT.honjin(rt, IEYASU.x, IEYASU.z, { mon: 'tokugawa', people: false, fire: true });
    addSite(rt, 'fort', IEYASU.x, IEYASU.z, '家康の本陣');
    F.ieyasu = allyGroup(rt, { name: '徳川家康の旗本', fullStrength: true, anchor: { x: IEYASU.x, z: IEYASU.z + 4 }, facing: -Math.PI * 0.75, width: 6, aggro: 4, seekRange: 8, order: 'hold', fixed: true, noRout: true },
      fl([{ type: 'busho', n: 1, o: { name: '徳川家康', invuln: true, horse: true } }, { type: 'samurai', n: 16 }, { type: 'gun', n: 4 }], 'tokugawa'));
    F.ieyasu.mon = 'tokugawa';
    for (const [dx, dz] of [[-10, 8], [10, 8], [0, 14]]) rt.scene.add(nobori(W, IEYASU.x + dx, IEYASU.z + dz, 'tokugawa', 7));
    KIT.honjin(rt, ARIMA.x + 10, ARIMA.z - 4, { mon: 'tokugawa', people: false, fire: true, yoroi: false });
    addSite(rt, 'fort', ARIMA.x, ARIMA.z, '有馬豊氏の陣');
  },

  // 陣形の塊（備）を一つ。名目は史実の兵数 ÷ SC。近くは本物の兵に替わる
  block(rt, o) {
    const W = rt.world, F = rt.flags;
    const add = W.addDistantArmy;
    W.addDistantArmy = function (p) { return add.call(this, { ...p, w: o.w, d: o.d, kind: o.kind || 'mixed', flagRate: 0.5, mon: o.flag, team: o.team, farFill: true, host: false }); };
    let b;
    try { b = fieldButai(rt, { name: o.name, team: o.team, faction: o.team ? o.flag : 'tokugawa', kind: 'ashigaru', nominal: Math.round(HIST[o.key] / SC), armor: ARM[o.flag], flag: o.flag, at: o.at, facing: o.facing, realMax: 0 }); }
    finally { W.addDistantArmy = add; }
    b.noSwitch = true;
    b._autoSwitch = () => {};
    if (b.light) { b.light.army.noWake = false; b.light.army.team = o.team; }
    b.key = o.key;
    F.blocks.push(b);
    return b;
  },
  go(b, to, speed = 1.6, opt = {}) {
    if (!b || !b.light || b.routedL) return;
    const p = lightPos(b), d = Math.hypot(to.x - p.x, to.z - p.z);
    b.light.moveTo(to.x, to.z, Math.max(0.5, d / speed), opt);
    b.cmd = { id: opt.charge ? 'charge' : 'move', to, target: null, form: 'line' };
  },

  toStep(rt, n) {
    const F = rt.flags, B = F.blk;
    if (F.step >= n) return;
    F.step = n; F.stepT = rt.t;
    for (const k of ['go', 'noi', 'ford', 'camp']) rt.unmark(k);
    rt.obj('main', STEP_TEXT[n - 1], 'main', true);
    if (n === 1) {
      rt.setPhase?.('siege');
      rt.marker('go', { x: BAIT.x + 14, z: BAIT.z }, '刈田の島左近の兵');
      sfx('horagai', 0.8);
      this.go(B.saki, { x: 24, z: 0 }, 2.6);
    } else if (n === 2) {
      rt.marker('go', () => (B.bait && !B.bait.routedL ? lightPos(B.bait) : BAIT), '刈田の島左近の兵');
      rt.say('中村一栄', 'かかれ！　刈田の者どもを追い散らせ', 2.6);
      rt.army.play('toki', BAIT, 1.3);
      this.go(B.saki, { x: BAIT.x + 6, z: 0 }, 3, { charge: true });
      F.baitN0 = B.bait.aliveNominal();
    } else if (n === 3) {
      this.ambush(rt);
      rt.marker('noi', () => (F.noiU?.alive ? { x: F.noiU.pos.x, z: F.noiU.pos.z } : null), '野一色頼母');
    } else if (n === 4) {
      rt.marker('ford', { x: FORD.x + 12, z: FORD.z }, '杭瀬川の東の岸');
      sfx('horagai', 0.8);
      for (const b of [B.shima, B.akashi, B.bait]) this.go(b, { x: 20, z: b === B.akashi ? 14 : -10 }, 2.2, { charge: true });
    } else if (n === 5) {
      rt.marker('camp', ARIMA, '有馬豊氏の陣');
      rt.say('有馬豊氏', '中村の者を通せ！　鉄砲、川へ向けて構えよ', 3);
      this.go(B.arima, { x: 62, z: -8 }, 1.8);
      if (live(F.arimaG)) { F.arimaG.order = 'move'; F.arimaG.dest = { x: 64, z: -12 }; }
      rt.after(3, () => rt.army.play('volley', { x: 40, z: -6 }, 1.2));
    }
  },

  // 囮が退くふり：刈田の兵が葦の原の方へ退き、中村の先手が追う
  feign(rt) {
    const F = rt.flags, B = F.blk;
    if (F.feigned) return;
    F.feigned = true; F.feignT = rt.t;
    this.go(B.bait, { x: REED.x + 4, z: -4 }, 2.2, { back: true });
    rt.say('野一色頼母', '逃げるぞ。追え、首を取れ！', 3);
    rt.after(3.2, () => rt.say('有馬豊氏', '深追いするな！　その先は葦の原じゃ', 3));
    this.go(B.saki, { x: RING.x + 4, z: 0 }, 2.8, { charge: true });
    rt.marker('go', { x: RING.x, z: RING.z }, '退く島左近の兵');
  },

  // 伏兵：南の葦から明石全登、北の林の陰から左近の本隊。刈田の兵も向き直る
  ambush(rt) {
    const F = rt.flags, B = F.blk;
    rt.unmark('go');
    B.akashi = this.block(rt, { key: 'akashi', name: '明石全登の伏兵', team: 1, flag: 'ukita', at: AKASHI_HIDE, facing: -0.6, w: 36, d: 12 });
    B.shima = this.block(rt, { key: 'shima', name: '島左近の本隊', team: 1, flag: 'ishida', at: SHIMA_HIDE, facing: Math.PI - 0.6, w: 26, d: 10 });
    this.go(B.akashi, { x: RING.x - 6, z: RING.z + 20 }, 2.4, { charge: true });
    this.go(B.shima, { x: RING.x - 4, z: RING.z - 18 }, 2.4, { charge: true });
    this.go(B.bait, { x: RING.x - 18, z: RING.z }, 2.2, { charge: true });
    // 葦の縁に膝をつく明石の鉄砲衆（本物）。先手の横腹を撃つ
    const guns = enemyGroup(rt, { faction: 'ukita', name: '明石全登の鉄砲衆', anchor: { x: RING.x - 10, z: RING.z + 28 }, facing: -0.4, width: 8, formation: 'line', noRout: true,
      morale: 90, dmgMult: 0.4, order: 'hold', aggro: 10, seekRange: 40, speed: 2.6 },
    fl([{ type: 'gun', n: 10 }, { type: 'samurai', n: 1 }], 'ukita'));
    F.foes.push(guns);
    // 明石全登と左近（本物の旗本に囲まれる。討てない。翌日の関ヶ原に出る）
    F.akashiG = enemyGroup(rt, { faction: 'ukita', name: '明石全登の旗本', anchor: { x: AKASHI_HIDE.x, z: AKASHI_HIDE.z }, facing: -0.6, width: 6, formation: 'line', noRout: true,
      morale: 100, dmgMult: 0.5, order: 'hold', aggro: 6, seekRange: 10, speed: 2.6 },
    fl([{ type: 'busho', n: 1, o: { name: '明石全登', invuln: true, horse: true } }, { type: 'samurai', n: 10, o: { keep: true } }, { type: 'ashigaru', n: 4, o: { keep: true } }], 'ukita'));
    F.shimaG = enemyGroup(rt, { faction: 'ishida', name: '島左近の旗本', anchor: { x: SHIMA_HIDE.x, z: SHIMA_HIDE.z }, facing: Math.PI - 0.6, width: 6, formation: 'line', noRout: true,
      morale: 100, dmgMult: 0.5, order: 'hold', aggro: 6, seekRange: 10, speed: 2.6 },
    fl([{ type: 'busho', n: 1, o: { name: '島左近', invuln: true, horse: true } }, { type: 'samurai', n: 10, o: { keep: true } }, { type: 'ashigaru', n: 4, o: { keep: true } }], 'ishida'));
    for (const g of [F.akashiG, F.shimaG]) { g.kind = 'main'; F.foes.push(g); }
    F.follow.push([F.akashiG, B.akashi, 0, 0], [F.shimaG, B.shima, 0, 0]);
    if (B.saki) B.saki.morale = Math.min(B.saki.morale, 48);
    rt.army.play('toki', AKASHI_HIDE, 1.5); rt.after(0.4, () => rt.army.play('toki', SHIMA_HIDE, 1.5));
    rt.after(0.8, () => rt.army.play('volley', { x: RING.x - 4, z: RING.z + 14 }, 1.3));
    sfx('taiko', 1);
    rt.banner('伏兵', '葦の原から明石全登の鉄砲');
    rt.say('野一色頼母', '葦の中に鉄砲じゃ！　伏せておったか', 3);
    rt.after(4, () => rt.say('島左近', '釣れたわ。返せ、一人も川へ戻すな', 3));
  },

  // 包みが閉じる：頼母は深田で討たれ、先手が崩れる（史実どおり。主人公には救えない）
  closeRing(rt) {
    const F = rt.flags, B = F.blk;
    if (F.ringClosed) return;
    F.ringClosed = true;
    if (F.noiU?.alive) { F.noiU.invuln = false; rt.army.kill(F.noiU, null); }
    rt.banner('野一色頼母、討死', '深田に足を取られた');
    routButai(B.saki, 30);
    rt.say(F.mine.leader?.name || '手勢の侍', `${nm(rt)}殿、頼母様が……！　川まで退くほかござらぬ`, 3.2);
    rt.after(3.4, () => rt.say('中村一栄', '退け！　杭瀬川を越えよ！', 3));
    F.follow = F.follow.filter((f) => f[0] !== F.noi && f[0] !== F.kazu);
    for (const g of [F.noi, F.kazu]) if (live(g)) { g.order = 'move'; g.dest = { x: ARIMA.x + 12, z: ARIMA.z + 14 }; g.speed = 4; }
    rt.after(4, () => this.toStep(rt, 4));
  },

  update(rt, dt) {
    const F = rt.flags, B = F.blk;
    if (F.ending || !F.step) return;
    const P = rt.player.u;
    butaiTick(rt, dt);
    if (F.step >= 2) fieldTick(rt, dt, { list: F.blocks, reach: 40, k: F.step === 2 ? 0.25 : F.step === 3 ? 0.55 : 0.4 });
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      const g = F.mine;
      if (live(g)) {
        const c = g.center();
        if (dist(c, P.pos) > 7 || F.step >= 4) { g.order = 'move'; g.dest = { x: P.pos.x + (F.step >= 4 ? 3 : -2), z: P.pos.z + 2 }; g.speed = 4.2; }
        else { g.order = 'attack'; g.seekRange = 12; }
      }
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
    // 先手が西の岸へ上がってから当たる（自分だけ先に着いても、皆が渡るのを待つ）
    if (F.step === 1 && ((P.pos.x < 30 && lightPos(B.saki).x < 36) || el > 80)) this.toStep(rt, 2);
    else if (F.step === 2) {
      const hurt = B.bait && B.bait.aliveNominal() < F.baitN0 * 0.8;
      if (!F.feigned && ((hurt && el > 12) || el > 40 || (dist(lightPos(B.bait), P.pos) < 20 && el > 18))) this.feign(rt);
      if (F.feigned && (P.pos.x < RING.x + 12 || rt.t - F.feignT > 24)) this.toStep(rt, 3);
    } else if (F.step === 3) {
      for (const g of rt.army.groups) if (g.team === 1 && g.count && g.order === 'hold' && g.kind !== 'main' && !g.interiorHold && !g.units.every((u) => u.type === 'gun')) { g.order = 'attack'; g.seekRange = 30; g.aggro = 14; g.noRout = true; }
      if (F.noiU?.alive && dist(F.noiU.pos, P.pos) < 12) F.nearT = (F.nearT || 0) + 0.25;
      if ((F.nearT > 18 && el > 24) || el > 55) this.closeRing(rt);
    } else if (F.step === 4 && P.pos.x > FORD.x + 8) this.toStep(rt, 5);
    else if (F.step === 5 && dist(P.pos, ARIMA) < 14) this.win(rt);
    // 退く段：西軍は川まで追うが渡らない（史実：有馬の隊が岸で受け、西軍は大垣へ引いた）。近い追手は人の走りより少し遅い
    if (F.step >= 4) {
      if ((F.chaseT = (F.chaseT || 0) - 0.25) <= 0) {
        F.chaseT = 2;
        const to = { x: Math.min(P.pos.x, 30), z: P.pos.z };
        for (const b of [B.shima, B.akashi, B.bait]) if (b && !b.routedL && dist(lightPos(b), P.pos) > 30) this.go(b, to, 2.2, { charge: true });
      }
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.chaseSoft && g.kind !== 'main') {
        g.chaseSoft = true; g.dmgMult = Math.min(g.dmgMult || 1, 0.18); g.speed = Math.min(g.speed || 3, 2);
        if (g.order === 'hold') { g.order = 'attack'; g.seekRange = 40; g.aggro = 12; }
      }
      if (!F.breath) { F.breath = true; P.hp = Math.max(P.hp, P.maxHp * 0.7); }
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase?.('end');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    const n = (F.mine?.count || 0) + (rt.squad || []).filter((s) => s.alive).length;
    rt.award((t) => { t.main = true; t.special = { label: '杭瀬川から兵を連れて退いた', pts: 30 }; }, '杭瀬川から生きて退いた');
    rt.banner('東軍、退く', `西軍は勝鬨を上げた　連れた兵 ${n}人`);
    const A = this.talk.after;
    rt.after(1.2, () => rt.say(A[0][0], A[0][1], 3.2));
    rt.after(4.6, () => rt.say(A[1][0], A[1][1], 3.6));
    rt.after(8.6, () => rt.say('徳川家康', '小競り合いに構うな。あすは関ヶ原ぞ', 3.4));
    rt.finish({ scriptedEnd: true }, 13);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.finish({ failureReason: why }, 6);
  },

  onKill(rt, v) {
    KIT.carrion?.(rt, v);
  },

  botEvacuating(b) { return (b.flags.step || 0) >= 4; },

  // bot：近い敵を突き、段の行き先へ。退く段は敵を振り切って走る
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
    if (F.step === 1) q = { x: BAIT.x + 12, z: BAIT.z };
    else if (F.step === 2) q = F.feigned ? RING : lightPos(F.blk.bait);
    else if (F.step === 3) q = F.noiU?.alive ? F.noiU.pos : RING;
    else if (F.step === 4) q = { x: FORD.x + 14, z: FORD.z };
    else q = ARIMA;
    goTo(p, inp, q.x, q.z, 2);
  },
};

k04_kuisegawa.history = '慶長五年（1600）九月十四日、美濃の赤坂に着いた徳川家康の東軍の前に、大垣城の石田三成の西軍が出た。島左近と蒲生備中のおよそ五百が杭瀬川を渡り、東軍の目の前で刈田をして挑発し、追われると退くふりをした。中村一栄の隊が川を渡って追うと、葦の中に伏せていた宇喜多秀家の家臣・明石全登の隊と、引き返した左近の兵が打ち掛かり、中村の家老・野一色頼母は深田にはまって討たれた。有馬豊氏の隊が受けて東軍は退いた。兵は西軍 千三百・東軍 六千ともいう（数には諸説がある）。この小さな勝ちで西軍の士気は上がったが、翌十五日、決戦は関ヶ原で行われる。\n戦場の細かな位置は、川筋が変わったため定かでない。';
k04_kuisegawa.bushou = [{ name: '島左近', g: /島左近/ }, { name: '明石全登', g: /明石全登/ }];

setStages('k04_kuisegawa', [['杭瀬川を西へ渡る', 0], ['刈田の島の兵を追い立てる', 2], ['葦の伏兵を食い止める', 3], ['川を東へ渡って退く', 4], ['有馬豊氏の陣へ逃げ込む', 5]]);

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(k04_kuisegawa);

export { k04_kuisegawa };
export default k04_kuisegawa;
