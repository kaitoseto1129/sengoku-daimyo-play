import { rosterPlan, rosterBuild } from './jinkei_roster.js';
import { HISTORICAL_GENERALS } from './b_historical_generals.js';
// ======================================================================
// 織田家編　手取川の戦い（天正五年九月二十三日）
// 能登の七尾城を助けに、柴田勝家を大将とする織田勢が加賀へ入り、手取川を越えた。
// だが七尾城はすでに上杉謙信の手に落ちていた。それを知った織田勢は退き始め、夜、手取川を渡るところを上杉勢に追われた。
// 足軽は柴田勝家の手。①七尾城の落ちた知らせ。川の浅瀬まで退く ②追ってくる上杉の騎馬と先手を、岸で食い止める（殿）
// ③味方が渡り終えたら、増えた川を渡って南の岸へ ④南の岸で殿の列を待ち、退く
// 出陣時の秀吉の離陣を先に描く。②は槍衾→退き方の判断→総掛かりをしのぐ
// 浅瀬の口の左右では、味方と上杉の大軍が押し合う（軽い作り）。上杉の鉄砲組は並んで一斉に撃つ
// 戦の大きさには諸説あり、ここでは退き口として描く
// 向き：南（+z）の岸が味方の退く先。川は東西に流れる。北（-z）から上杉勢が来る
// ======================================================================
import * as THREE from 'three';
import { distToPolyline } from './world.js';
import { nobori, hut, tawara, campfire } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { jinchiTick } from "./yasen_jinchi.js";
import { gauss, allyGroup, nm, unitPos } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { volleyAt } from './b_tano.js';
import { depthStart, depthTick, rest, pick, hold, depthBot } from './b_depth.js';
import { uS, uA, uC, round, gunLine, lines, leanAll, camp } from './b_mid.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const RIVER = [[-240, 4], [-120, -2], [0, 2], [120, -4], [240, 2]];
const FORD = { x: 0, z: -14 };              // 北の岸の浅瀬の口
const SOUTH = { x: 4, z: 34 };              // 南の岸（退く先）
const ODA = { flag: 'oda' };
const UESUGI = { flag: 'uesugi' };

function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.03 + 0.2) * Math.cos(z * 0.028) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  // 川原は低く、両岸に土手
  h += 1.4 * Math.exp(-((z + 16) ** 2) / 20) + 1.4 * Math.exp(-((z - 22) ** 2) / 20);
  // 北の加賀の山並みと、南の白山のすそ
  h += Math.max(0, -z - 140) * 0.25 + 40 * gauss(x, z, 160, 220, 12000);
  return h;
}

// 手取川の参照表・北国出陣の将名。特定の陣名と上杉の各備の将は伝わらない。
// 南向きに退く織田、北から南へ追う上杉。秀吉は離陣の振り返りだけで本戦の人数に含めない。
const JIN = [
  rosterPlan('川を背にした備え', 0, { x: 0, z: -66 }, 0, [
    ['shibata', '本陣', '柴田勝家', 8000, 0, -66, 'oda', 'oda', 0, { bind: 'shiba' }],
    ['niwa', '西の備え', '丹羽長秀', 5000, -30, -60, 'oda', 'oda', 0, { bind: 'others.0' }],
    ['maeda', '東の備え', '前田利家', 4000, 32, -62, 'maeda', 'maeda', 0, { bind: 'others.1' }],
    ['inaba', '西の渡河列', '稲葉良通・氏家直昌・安藤守就', 13000, -50, -40, 'oda', 'oda', 260, { w: 22, d: 14, facing: 0 }],
    ['sassa', '東の渡河列', '佐々成政・不破光治・金森長近', 7000, 50, -44, 'oda', 'oda', 240, { w: 22, d: 14, facing: 0 }],
    ['takigawa', '南岸の受け取り', '滝川一益', 3000, 34, 104, 'takigawa', 'takigawa', 0, { bind: 'honjin' }],
  ], '野戦の参照表・手取川。総勢四万とも、各備の兵数と並びは補完'),
  rosterPlan('追撃の備え', 1, { x: 64, z: -206 }, 0, [
    ['kenshin', '本陣', '上杉謙信', 2000, 64, -206, 'uesugi', 'uesugi', 0, { bind: 'ehon' }],
    ['front', '先手', '上杉謙信の配下（名は不明）', 6000, -6, -150, 'uesugi', 'uesugi', 560, { w: 40, d: 16, armor: 0x2a2a2a }],
    ['right', '東の脇備え', '上杉謙信の配下（名は不明）', 4000, 96, -160, 'uesugi', 'uesugi', 260, { w: 22, d: 14, armor: 0x2a2a2a }],
    ['second', '後備え', '上杉謙信の配下（名は不明）', 5000, 0, -190, 'uesugi', 'uesugi', 340, { w: 24, d: 14, armor: 0x2a2a2a }],
    ['left', '西の脇備え', '上杉謙信の配下（名は不明）', 3000, -70, -180, 'uesugi', 'uesugi', 220, { w: 20, d: 14, armor: 0x2a2a2a }],
  ], '野戦の参照表・手取川。謙信直率八千・全軍二万とも。合戦の規模には異説'),
];
const tedorigawa = {
  botOrders: true, // 殿の持ち場・退避・渡河を、遊び手の突進で上書きしない
  jinkei: JIN,
  noWake: true, // 殿の寄せだけを本物の兵にし、大軍は軽いまま見せる
  spawn: { x: 6, z: -60, heading: 0 },
  world: {
    seed: 15777,
    moveLim: 230,   // 置いた兵が 176 の端に貼り付いていた（見回り 10/2）
    time: 'night',
    lightning: true,   // 稲光で、闇の中の味方・川・敵の位置が一瞬見える（B051）
    muddy: 1,
    waterSlow: true,
    // 浅瀬の位置と深さは遊び用の復元。増水しても中央の退路を残す。
    riverCross: true,
    streams: [{ pts: RIVER, w: 24, depth: 1.9, fords: [{ x: 2, w: 28 }, { x: -100, w: 18 }, { x: 110, w: 18 }] }],   // 増水：深く、広い濁流
    paths: [[[0, -200], [2, -60], [FORD.x, FORD.z], [SOUTH.x, SOUTH.z], [6, 160]]],
    height,
    tint(x, z, h, c) { if (z > -14 && z < 20) c.lerp({ r: 0.42, g: 0.42, b: 0.36 }, 0.4); },
    clear: (x, z) => (Math.abs(x) < 110 && z > -120 && z < 80) || Math.hypot(x - 34, z - 104) < 20,
    trees: 320,
    tufts: 5200,
    treeDensity: (x, z) => (Math.abs(x) < 120 && z > -130 && z < 90 ? 0.1 : 0.8),
    groves: [{ x: -60, z: -60, r: 12, n: 16 }, { x: 70, z: -40, r: 12, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && z < -150,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    W.setRainTarget(0.9);   // 夜の明るさと雨を分ける。昼の雷雨の空にはしない。
    F.step = 0; F.ek = 0; F.ak = 0; F.crossRemaining = 30;
    F.guns = [];
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { river: 'HIST_A', flood: 'HIST_A', honjinOda: 'HIST_B', mizushima: 'HIST_B', honjinUesugi: 'GAME_C', fordMain: 'GAME_C', fordWest: 'GAME_C', fordUpper: 'GAME_C' };
    // 北の岸の陣は、史料にいう「水島」付近に当たる（HIST_B。地名の厳密な位置は推定）
    // ---- 北の岸の陣（払いかけ） ----
    for (const [x, z, r] of [[-30, -70, 0.2], [34, -74, -0.1]]) rt.scene.add(hut(W, x, z, 6, 4, r, { wall: 0x5a4a38 }));
    rt.scene.add(tawara(W, -14, -64, 0.3, 5), tawara(W, 20, -60, -0.2, 4));
    for (const [x, z] of [[-8, -52], [10, -54], [-40, -58], [44, -60]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    // ---- 柴田勝家の手（自分の持ち場）、佐久間盛政の手、丹羽の手 ----
    F.shiba = allyGroup(rt, { name: '柴田勝家の手', anchor: { x: 0, z: -66 }, facing: 0, width: 14, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 4 }], ODA));
    F.shibaU = F.shiba.units[0];
    F.others = [
      allyGroup(rt, { name: '丹羽長秀の手', anchor: { x: -30, z: -60 }, facing: 0, width: 12, aggro: 10, noRout: true }, dress([{ type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 14 }], ODA)),
      allyGroup(rt, { name: '前田利家の手', anchor: { x: 32, z: -62 }, facing: 0, width: 12, aggro: 10, noRout: true }, dress([{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true } }, { type: 'ashigaru', n: 14 }], { flag: 'maeda' })),
    ];
    for (const g of [F.shiba, ...F.others]) { g.defMult = 1.2; g.dmgMult = 0.8; }
    F.crossGroups = F.others.slice();
    // 離陣の場面は出陣のころの振り返り。言い争いの台詞は遊びのための補い。
    F.hide = allyGroup(rt, { name: '羽柴秀吉の手', anchor: { x: 14, z: -72 }, facing: Math.PI, width: 6, aggro: 0, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true } }, { type: 'ashigaru', n: 6 }], ODA));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: -58 }, 0, [{ kind: 'spear', n }]);
    // ---- 大軍（軽い作り）：南の岸へ渡っていく織田の本隊、北から来る上杉の大軍 ----
    const hosts = rosterBuild(rt, JIN);
    F.main = [hosts[0].inaba, hosts[0].sassa];
    F.host = [hosts[1].second, hosts[1].left];
    F.host2 = [hosts[1].front, hosts[1].right];
    for (const [x, z] of [[-20, -80], [24, -84]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // 闇の中の目じるし：北の岸の松明の列（B051）と、浅瀬の口の旗と篝火（B053）
    for (const [x, z] of [[-48, -52], [-30, -58], [30, -60], [48, -54], [-12, -40], [14, -42]]) W.addFire(x, z, { torch: true, h: 1.6 });
    for (const sd of [-1, 1]) { rt.scene.add(nobori(W, FORD.x + sd * 15, FORD.z - 4, 'oda', 6), campfire(W, FORD.x + sd * 17, FORD.z - 6)); W.addFire(FORD.x + sd * 17, FORD.z - 6); }
    // 北の上杉謙信の本陣（遠く。見に行けば謙信と旗本がいる）
    // 南の岸の織田の本陣（滝川一益が退く列を受け取る）
    F.honjin = camp(rt, { x: 34, z: 104, facing: Math.PI, team: 0, faction: 'oda', mon: 'takigawa', general: { name: '滝川一益', hat: 'kabuto_m', haori: 0x2a3440 }, guard: 15, reserve: 200, runTo: { x: SOUTH.x, z: SOUTH.z + 10 } });
    F.ehon = camp(rt, { x: 64, z: -206, facing: 0, team: 1, faction: 'saito', mon: 'uesugi', armor: 0x2a2a2a, general: { name: '上杉謙信', hat: 'hachimaki', haori: 0xd8d2c0 }, depth: true, guard: 15, reserve: 300, runTo: { x: 0, z: -150 } });

    rt.setPhase('brief'); rt.objProgress('main', '');
    rt.obj('main', HI(rt) ? '柴田勝家の手で足軽の一手を預かり、下知を待て' : '柴田勝家のもとで、下知を待て', 'main');
    rt.banner('北国へ出たころ', '秀吉と勝家の言い争い');
    rt.say('羽柴秀吉', '勝家殿、その進め方には従えぬ。わしの手は陣を払う', 4);
    rt.say('柴田勝家', '勝手に離れるな！　信長様への届けもまだであろう！', 4);
    rt.marker('shiba', unitPos(F.shibaU), '柴田勝家', {});
    rt.after(9, () => {
      // 離陣の列も浅瀬を渡る。東の深みへ直進すると、岸へ戻され続ける。
      F.hide.order = 'path'; F.hide.path = [[8, FORD.z], [8, SOUTH.z], [70, 54], [80, 170]]; F.hide.pathIdx = 0; F.hide.speed = 4; F.hide.formation = 'column';
      F.hide.onArrive = (g) => { g.order = 'hold'; };
      KIT.markRecyclable(F.hide);
      rt.say('足軽', '秀吉様の手が引き払った……。陣に穴があいたぞ', 4);
    });
    rt.after(16, () => {
      rt.banner('手取川の北の岸', '雨の夜、七尾城が落ちた知らせ');
      rt.say('使いの者', '七尾城は、もう上杉の手に落ちております！', 3.5);
      rt.say('柴田勝家', '南へ退く！　殿（しんがり）は、皆が渡るまで北の岸を支えよ', 4.5);
    });
    rt.after(27, () => this.retreat(rt));
  },

  // ① 浅瀬まで退く
  retreat(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('retreat'); rt.objProgress('main', '');
    rt.unmark('shiba');
    sfx('taiko', 0.6);
    rt.obj('main', '北の岸の浅瀬の口まで退け（負け戦。味方を一人でも多く生かして渡す）', 'main');
    rt.marker('ford', FORD, '浅瀬の口', { h: 2 });
    rt.zone('ford', FORD.x, FORD.z - 10, 7);
    F.shiba.order = 'move'; F.shiba.dest = { x: FORD.x, z: FORD.z - 12 }; F.shiba.speed = 2.6; F.shiba.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; g.aggro = 14; };
    // 雨と川の音で下知が届かず、一手は止まり、一手は横へ走る。
    rt.say('使いの者', '川の音で下知が聞こえませぬ！　待つ手と走る手が入り乱れております！', 4);
    F.others[0].order = 'hold'; F.others[0].morale = 55;
    F.others[1].order = 'move'; F.others[1].dest = { x: 60, z: -44 }; F.others[1].speed = 3.2; F.others[1].morale = 45;
    F.others[1].onArrive = (g) => { g.order = 'hold'; };
    F.others.forEach((g, i) => rt.after(20 + i * 18, () => {
      // 川の中では中央の浅瀬を通る。左右へ列を分けるのは南の岸へ上がってから。
      g.order = 'path'; g.path = [[2 + (i ? 4 : -4), FORD.z], [2 + (i ? 4 : -4), SOUTH.z], [SOUTH.x + (i ? 16 : -16), SOUTH.z + 20], [SOUTH.x + (i ? 20 : -20), 90]];
      g.pathIdx = 0; g.speed = 1.8; g.formation = 'column'; g.aggro = 3;
      g.onArrive = (q) => { q.order = 'hold'; };
      rt.say('使いの者', i ? '前田の手にも届いた！　浅瀬へ、南の岸へ退け！' : '丹羽の手、下知じゃ！　川へ退け！', 3.5);
    }));
    F.main.forEach((m, i) => rt.after(12 + i * 22, () => m.advance(110, 120)));
    for (const h of F.host) h.advance(60, 60);
    for (const h of F.host2 || []) h.advance(45, 50);
  },

  // ② 殿：追手を食い止める
  rearguard(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('rear'); rt.objProgress('main', '');
    rt.unmark('ford'); rt.unzone('ford');
    sfx('horagai', 0.8);
    rt.banner('上杉の追手', '雨の闇の中から、竹に雀の旗が迫る');
    rt.obj('main', HI(rt) ? '殿の一手を預かり、上杉の追手を食い止めよ（味方が渡りきるまで。一人でも多く生かして渡せ）' : '北の岸で、上杉の追手を食い止めよ（味方が渡りきるまで。一人でも多く生かして渡せ）', 'main');
    rt.say('柴田勝家', '来たぞ！　槍衾を作れ！　ここで崩れれば、川で皆死ぬぞ', 4);
    F.waves = [];
    // 浅瀬の口の左右では、渡りかけの味方の大軍と上杉の大軍が押し合う（軽い作り）
    F.lines = lines(rt, [
      { x: -76, z: -46, facing: Math.PI, w: 50, seed: 1571, A: ['oda', 0x2b3140, 420, 'oda'], B: ['uesugi', 0x2a2a2a, 620, 'saito'], gunsB: true, surge: { every: 45, flank: 0.4 } },
      { x: 76, z: -48, facing: Math.PI, w: 50, seed: 1572, A: ['oda', 0x2b3140, 400, 'oda'], B: ['uesugi', 0x2a2a2a, 600, 'saito'], surge: { every: 55, flank: 0.4 } },
    ]);
    F.lines.forEach((c, i) => rt.after(2 + i * 2, () => c.go()));
    leanAll(F.lines, 'B', 0.45);
    F.lines.forEach((c, i) => rt.after(32 + i * 24, () => {
      c.rout('A', { from: 0, hideAfter: 35, minFight: 0 });
      rt.say('足軽', i === 0 ? '西の味方が崩れた！　川へ押し寄せておる！' : '東の列も退いてくる！　浅瀬の口を空けよ！', 3.5);
    }));
    // 殿の持ち場は狭い。槍と鉄砲で、渡る時を稼ぐ
    rt.after(3, () => rt.say('柴田勝家', '浅瀬の口で槍をそろえよ。鉄砲は引きつけるまで撃つな', 4.5));
    F.rgun = allyGroup(rt, { name: '柴田の鉄砲組', anchor: { x: RG.x, z: RG.z + 7 }, facing: Math.PI, width: 16, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 10 }], ODA));
    F.guns.push(F.rgun);
    volleyAt(rt, { guns: () => [F.rgun], foes: () => rt.army.groups.filter((g) => g.team === 1 && g.count > 0), who: '柴田勝家', near: 30, drop: 6, max: 50, say: '引きつけたぞ……鉄砲組、放てぇっ！', line: '柴田の鉄砲組がそろって火を吹いた。上杉の先が足を止める。後ろの列はまだ迫る' });
    depthStart(rt, tedoCtx(rt), tedoA(), () => this.cross(rt));
  },

  // ③ 川を渡る
  cross(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('cross'); rt.objProgress('main', '');
    for (let i = 0; i < 3; i++) rt.unmark('w' + i);
    rt.award((t) => t.side.push('殿を務め、追手を食い止めた'), '殿を務めた');
    rt.banner(F.crossRemaining ? '殿も退け' : '残る味方は渡った', F.crossRemaining ? '列はまだ乱れている。南の岸で渡る者を待て' : '殿も川へ。水はもう腰の上まで来ている');
    rt.obj('main', '増えた手取川を渡り、南の岸へ', 'main');
    rt.say('柴田勝家', 'よう支えた！　殿、退けっ！　流されるな、隣の者の腕をつかめ！', 4);
    rt.marker('south', SOUTH, '南の岸', { h: 2 });
    rt.zone('south', SOUTH.x, SOUTH.z, 8);
    F.shiba.order = 'path'; F.shiba.path = [[FORD.x, FORD.z], [SOUTH.x, SOUTH.z + 6]]; F.shiba.pathIdx = 0; F.shiba.speed = 2; F.shiba.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; };
    for (const h of F.host) h.advance(40, 30);
    for (const h of F.host2 || []) h.advance(20, 30);
    if (F.rgun && F.rgun.count) { const g = F.rgun; g.order = 'path'; g.path = [[FORD.x + 4, FORD.z], [SOUTH.x + 8, SOUTH.z + 4]]; g.pathIdx = 0; g.speed = 2; g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; }; }
    // 左右の味方の大軍は、川へ崩れて渡っていく
    for (const c of F.lines || []) c.rout('A', { from: 0, hideAfter: 20, minFight: 0 });
  },

  // 南の岸に着いたら：遅れた列と殿が渡るまで岸を支える
  south(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4;
    F.crossGroups.push(F.shiba);
    if (F.rgun) F.crossGroups.push(F.rgun);
    F.crossCheckT = 0;
    rt.unzone('south');
    rt.obj('main', '南の岸で列をまとめ、遅れた味方を待て', 'main');
    rt.objProgress('main', '');
    F.shiba.order = 'hold'; F.shiba.anchor = { x: SOUTH.x, z: SOUTH.z + 4 }; F.shiba.facing = Math.PI;
    depthStart(rt, tedoCtx(rt), tedoB(), () => this.win(rt));
  },

  lose(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.tracker.main = false;
    rt.setPhase('end'); rt.objProgress('main', ''); rt.objFail('main'); rt.objRemove('dp');
    rt.unmark('south'); rt.unzone('south'); rt.unmark('dp'); rt.unzone('dp');
    rt.banner('渡り口を失った', '味方に助けられ、後ろの陣へ退く');
    rt.say('柴田勝家', 'もう支えきれぬ！　手負いを連れて退け！', 4);
    rt.player.u.invuln = true; rt.finish({}, 8);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end'); rt.objProgress('main', '');
    rt.unmark('south'); rt.unzone('south');
    for (const g of rt.army.groups) if (g.team === 1 && g.count) g.order = 'hold';
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '手取川の殿を務め、生きて渡った', pts: 20 }; }, '任務達成・手取川を渡った');
    sfx('horagai', 0.5);
    rt.banner('手取川を渡った', `味方は退いた。上杉の陣は崩れぬまま（味方の討死 ${F.ak || 0}人）`);
    rt.say('柴田勝家', `……${nm(rt)}、渡ったか。今は生きて帰れ。次は勝つぞ`, 5.5);
    rt.after(6, () => rt.say('', '――謙信は翌年三月、春日山城で急死した。上杉の南への動きは、それで止まった', 5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    jinchiTick(rt, F.guns);   // 野戦の陣地：槍が前で揉み合う間は撃たない（yasen_jinchi.js）
    KIT.backTick(rt);
    // 渡り終えた数は、生きた兵の位置から数える。毎秒一度だけ。
    if (F.step >= 1 && rt.t >= (F.crossCheckT || 0)) {
      F.crossCheckT = rt.t + 1; F.crossRemaining = 0; F.crossed = 0;
      for (const g of F.crossGroups) for (const u of g.units) if (u.alive) {
        if (u.pos.z >= 24) F.crossed++; else F.crossRemaining++;
      }
      if (F.step === 2) rt.objProgress('main', `渡った味方 ${F.crossed}人・北の岸に ${F.crossRemaining}人`);
    }
    depthTick(rt, dt);
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) {
      const m = rt.markers[i];
      if (m.group && gone(m.group)) rt.unmark(m.id);
    }
    this.flood(rt, dt);
    if (F.ending) return;
    const p = rt.player.u.pos;
    if (F.step === 1) {
      const d = Math.hypot(p.x - FORD.x, p.z - (FORD.z - 10));
      rt.objProgress('main', `浅瀬の口まで あと${Math.max(0, Math.round(d))}歩`);
      if (d < 7 || rt.t - F.stepT > 60) this.rearguard(rt);
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - SOUTH.x, p.z - SOUTH.z);
      rt.objProgress('main', `南の岸まで あと${Math.max(0, Math.round(d))}歩`);
      // 渡り出さない時は、柴田が呼ぶ（上杉が迫るので長くは待たない）
      if (d >= 8 && rt.t - F.stepT > 20 && !F.crossCall) { F.crossCall = true; rt.say('柴田勝家', `${nm(rt)}、何を立ち止まる！　印の南の岸へ渡れ。上杉が来るぞ`, 3.5); }
      if (d >= 8 && rt.t - F.stepT > 40 && !F.crossCall2) { F.crossCall2 = true; rt.say('足軽', 'お頭、わしの腕につかまりなされ！　流れは今のうちじゃ', 3); }
      if (d < 8) this.south(rt);
      else if (rt.t - F.stepT > 70) this.lose(rt);
    }
  },

  // 増水の川の怖さ：濁流が川の中の者を東へ流す（馬は強く流され、重い具足の者ほど足を取られる）。流れてくる材木が川面を下る
  flood(rt, dt) {
    const F = rt.flags;
    // 水位が少しずつ上がる（B055）：40 秒から 180 秒までに 0.45m。岸の浅瀬が狭まる
    { const st = rt.world.def.streams && rt.world.def.streams[0]; if (st && st.mesh) st.mesh.position.y = Math.max(0, Math.min(1, (rt.t - 40) / 140)) * 0.45; }
    if (!F.logs) {
      F.logs = [];
      const mat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1 });
      const geo = new THREE.CylinderGeometry(0.22, 0.26, 4.2, 6);
      geo.rotateZ(Math.PI / 2);
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(geo, mat);
        const lg = { m, x: -200 + i * 62, dz: (i % 3 - 1) * 5, sp: 2.2 + (i % 3) * 0.5, r: i * 0.7 };
        rt.scene.add(m);
        F.logs.push(lg);
      }
    }
    for (const lg of F.logs) {
      lg.x += lg.sp * dt;
      if (lg.x > 230) lg.x = -230;
      let z = 0;
      for (let k = 0; k < RIVER.length - 1; k++) if (lg.x >= RIVER[k][0] && lg.x <= RIVER[k + 1][0]) z = RIVER[k][1] + (RIVER[k + 1][1] - RIVER[k][1]) * (lg.x - RIVER[k][0]) / (RIVER[k + 1][0] - RIVER[k][0]);
      lg.m.position.set(lg.x, rt.world.heightAt(lg.x, z + lg.dz) - 0.2 + Math.sin(rt.t * 1.3 + lg.r) * 0.06, z + lg.dz);
      lg.m.rotation.y = Math.sin(rt.t * 0.5 + lg.r) * 0.3;
    }
    if (F.step < 1) return;
    F.floodT = (F.floodT || 0) - dt;
    for (const u of rt.army.units) {
      if (!u.alive || u.team !== 0 || !u.pos) continue;
      if (distToPolyline(u.pos.x, u.pos.z, RIVER) > 11) continue;
      const k = (u.horse ? 1.5 : 1) * (u.type === 'samurai' || u.type === 'busho' ? 1.3 : 1);
      // 浅瀬の流れまで深みと同じ力にすると、減速した兵が流れに勝てず退路を外れる。
      const current = Math.min(1, rt.world.waterDepthAt(u.pos.x, u.pos.z) / 1.5);
      u.pos.x += 0.9 * k * current * dt;
      if (u === rt.player.u && F.floodT <= 0) { F.floodT = 12; rt.bark('濁流に足を取られる！　流れに逆らわず、斜めに岸へ上がれ'); }
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || rt.t < (rt.flags.routSayT || 0)) return;
    rt.flags.routSayT = rt.t + 10;
    rt.say('足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が退いた！`, 2.5);
  },
};

// ---------------- 殿の段（北の岸）と、南の岸の段 ----------------
const RG = { x: 0, z: -30 };                 // 殿の持ち場（浅瀬の口の前）
const RR = round(RG, Math.PI, 56);           // 北から来る上杉の寄せ口（左右と、上流の浅瀬を渡った後ろ）
// この戦だけ、刻限で殿を下げる。共通の段が敵を自動で敗走させる処理は使わない。
function tedoHold(o) {
  const s = hold(o), tick = s.tick;
  s.max = o.dur + 60;
  s.tick = (rt, C, m, ctx, el, dt) => {
    tick(rt, C, m, ctx, Math.min(el, o.dur - 0.01), dt);
    for (const g of C.groups) if (!g.routed && g.count >= 4) {
      g.noRout = true; g.morale = Math.max(60, g.morale);
    }
    rt.objProgress('dp', el < o.dur ? `岸を支える あと${Math.ceil(o.dur - el)}秒` : `渡る味方はあと ${rt.flags.crossRemaining}人・岸を支えよ`);
    // 渡る者が残る間はもう少し待つ。時間切れでも敵は崩さず、次の岸で受ける。
    return el >= o.dur && (!o.waitCross || rt.flags.crossRemaining === 0);
  };
  s.end = (rt, C) => {
    rt.unmark('dp'); rt.unzone('dp');
    const won = C.inT >= o.dur * 0.45;
    if (won) { rt.objDone('dp'); rt.award((t) => t.side.push(o.reward), o.reward); }
    else { rt.objFail('dp'); rt.say('柴田勝家', '列が乱れた！　次の持ち場で渡る者を待て！', 3); }
    for (const g of C.groups) KIT.markRecyclable(g);
  };
  return s;
}
function tedoCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'uesugi', armor: 0x2a2a2a, scale: 1, dmg: 0.6, look: (l) => dress(l, UESUGI), friends: () => [F.shiba].filter((g) => g && g.count) };
}
function tedoA() {
  return [
    tedoHold({ at: RG, dur: 100, r: 14, title: '殿の槍衾', sub: '崩れる味方を背に、浅瀬の口を支える', label: '殿の持ち場', obj: '浅瀬の口で時を稼ぎ、味方を渡せ',
      say: [['柴田勝家', '敵を追うな！　渡る列を守れ。上杉の備えは崩れておらぬ！']],
      waves: [
        { t: 4, say: ['足軽', '騎馬じゃ！　槍を下ろせ、馬を止めよ！'], foes: () => [{ name: '上杉の騎馬', from: RR.front, list: [uS(1, { horse: true }), uC(6)], mass: 180 }] },
        // 同じ人数を二手に分け、騎馬の後も斬り合いが続く。まとめて囲ませない。
        { t: 20, say: ['柴田勝家', '上杉の先手じゃ！　槍を揃えて迎えよ！'], foes: () => [{ name: '上杉の先手', from: RR.front, list: [uS(1), uA(6)], mass: 160 }] },
        { t: 44, say: ['足軽', '先手の後ろから、次の列が来るぞ！'], foes: () => [{ name: '上杉の先手の後続', from: RR.fl, list: [uS(1), uA(6)], mass: 160 }] },
        { t: 72, say: ['足軽', '土手の上に鉄砲が並んだ……！'], foes: () => [gunLine('上杉の鉄砲組', RR.fr, RG, 6)] },
      ], reward: '殿の槍衾で味方の渡る時を稼いだ' }),
    pick({ title: '上杉の本隊は崩れぬまま迫る。殿をどう下げる？',
      options: [{ label: '槍を揃え、浅瀬の口を支える', note: '味方の列が渡り終わるまで、正面で時を稼ぐ' }, { label: 'かがり火を残し、川の口へ下がる', note: '闇を使って下がる。回り込む追手に備える' }],
      on: (rt, m, i) => { m.tdPush = i === 0; rt.say('柴田勝家', i === 0 ? '追い返せずともよい。皆が渡るまで支えよ！' : '火を残せ。列を離さず、川の口へ下がれ', 3.5); } }),
    tedoHold({ at: (rt, m) => m.tdPush ? RG : { x: 0, z: -20 }, dur: 90, waitCross: true, r: 14, title: '崩れぬ上杉の備え', sub: '倒しても、後ろの列が前へ出る', label: '浅瀬の口', obj: '敵を追わず、味方が渡るまで川の口を支えよ',
      waves: [
        { t: 5, say: ['足軽', 'また新手じゃ！　味方はまだ川の中じゃ！'], foes: () => [{ name: '上杉の本隊の先', from: RR.front, list: [uS(1), uA(6)], mass: 200 }] },
        { t: 25, say: ['足軽', '後ろの列も来た！　持ち場を離れるな！'], foes: () => [{ name: '上杉の本隊の後続', from: RR.front, list: [uS(1), uA(6)], mass: 200 }] },
        { t: 42, say: ['柴田勝家', '横から来る！　槍を向けよ、列を切らせるな！'], foes: (rt, m) => [{ name: '回り込む上杉勢', from: m.tdPush ? RR.left : RR.right, list: [uS(1), uA(7)], mass: 240 }] },
      ], reward: '上杉が崩れぬ中で味方を渡した' }),
  ];
}
function tedoB() {
  const S = { x: SOUTH.x, z: SOUTH.z - 2 };
  return [
    tedoHold({ at: S, dur: 65, waitCross: true, r: 14, title: '南の岸の殿', sub: '乱れる列を受け取り、退く道を開ける', label: '南の岸', obj: '南の岸を支え、遅れた味方と殿の列を渡せ',
      say: [['柴田勝家', '渡った者は南へ退け！　殿は岸で列を待て！']],
      waves: [
        { t: 5, say: ['足軽', '追手が水から上がってくる！'], foes: () => [{ name: '渡ってくる上杉勢', from: { x: -10, z: -24 }, list: [uS(1), uA(8)], mass: 220 }] },
        { t: 38, say: ['足軽', '北の岸に、まだ上杉の旗が並んでおる！'], foes: () => [gunLine('北の岸の鉄砲衆', { x: 10, z: -34 }, S, 5, { off: { x: 6, z: -48 }, mass: 180 })] },
      ], reward: '南の岸で退く列を支えた' }),
    rest({ dur: 6, say: [['柴田勝家', '列をまとめて南へ退く。勝ったのではない。帰って立て直すぞ']] }),
  ];
}

// 両軍の総勢（柴田勝家の軍 三万ほど、上杉勢 二万ほど。数と戦の大きさには諸説ある）
tedorigawa.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(30000 - (F.ak || 0) * 30), a0: 30000, b: Math.max(0, 20000 - (F.ek || 0) * 30), b0: 20000 };
};
tedorigawa.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '上杉軍', mon: 'uesugi' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
tedorigawa.famous = [
  ...HISTORICAL_GENERALS.tedorigawa,
  { name: '斎藤朝信', g: /斎藤|先手/, loose: 1, line: '上杉の先手、斎藤下野守朝信なり！　川に沈めてくれる！' },
  { name: '河田長親', g: /上杉/, loose: 1, line: '上杉の河田長親なり！　退く者を一人も逃がすな！' },
];
tedorigawa.date = () => '天正五年九月二十三日とも　秋・退き口';
tedorigawa.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 24 ? '退きの下知まで待つ' : '');
tedorigawa.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
// 出典：信長公記 巻十『柴田北国相働之事』。https://ja.wikisource.org/wiki/信長公記
tedorigawa.history = '天正五年（1577）、信長は柴田勝家を大将として、丹羽長秀・前田利家・羽柴秀吉らを加賀へ出した。信長公記には、織田勢が手取川を越えて各地を焼き払い、秀吉が信長に届けず帰陣して怒りを買ったとある。秀吉は勝家と言い争って陣を離れたともいうが、言い争いの細かな経緯や台詞は同書にない。この遊びの会話は補ったもの。七尾城が落ちた後、織田勢が雨で増えた手取川で上杉勢に追われたとも伝わるが、信長公記はこの敗戦を詳しく記していない。下知が届かぬ混乱と殿の持ち場は、退き口を遊ぶための補い。戦の大きさ、日付、兵の数には諸説ある。';

// 素直な遊び手：浅瀬の口まで退き、岸で追手と戦い、川を渡る
tedorigawa.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (F.step === 3) { goTo(p, inp, SOUTH.x, SOUTH.z, 2); return; }
  const c = F.shiba.center();
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, c.x, c.z + 6, 2); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing);
  if (e && F.step >= 2) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) { goTo(p, inp, FORD.x, FORD.z - 10, 2); return; }
  if (F.step === 2) { const q = (F.waves || []).find((x) => !gone(x)); if (q) { const t = q.center(); if (t.z > -60) { goTo(p, inp, t.x, t.z, 2); return; } } goTo(p, inp, FORD.x + 2, FORD.z - 16, 2); return; }
  goTo(p, inp, c.x + 2, c.z - 4, 3);
};

export { tedorigawa };
