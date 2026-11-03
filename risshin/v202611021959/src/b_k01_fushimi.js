// ======================================================================
// 徳川編 1　伏見城の戦い（慶長五年 1600・七月十九日〜八月一日）　関ヶ原の戦いの最初の戦、死守の戦
// 筋書きの正：docs/chapter3_tokugawa.md の「1. 伏見城」、docs/battle_events_1101.md
// 徳川家康は会津征伐へ発つ前、伏見城を鳥居元忠に預け「死守せよ」と別れた。石田三成らが挙兵すると、
// 宇喜多秀家・小早川秀秋・島津義弘・長束正家ら西軍四万ほどが、千八百ほどの城を囲む。城は十日あまり持ちこたえたが、
// 甲賀衆の内応で松の丸から火を放たれ、本丸へ攻め入られる。元忠は最後まで戦って討死し、城は炎上して落ちた。
// 勝利条件＝時間を稼ぎ、最後まで城を守って死ぬ（城は史実どおり落ちる。主人公は元忠の手勢として持ち場を守る）。
// 段：①大手を守る ②三の丸が破られ二の丸へ退く ③内応の火の手と火攻めを耐える ④本丸の元忠の最後の抵抗
// 負け方：主人公が討たれる。刻限（七分）までに持ちこたえられない時（段が進まない）。
// 向き：北が -z（本丸）、南が +z（大手）。西軍は南から攻め上る。
// 地形：国土地理院の標高（dem_fushimi.js・tools/dem.mjs の fushimi）。水平は実の 1/4、高さは 0.2 倍。
// ======================================================================
import { demSample } from './dem.js';
import DEM from './dem_fushimi.js';
import { nobori, kagaribi } from './props.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, rectPoly } from './castle_plan.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { routeTools } from './b_k_route.js';
import { timeslipField } from './timeslip_field.js';

// ---- 場所（ゲームの座標） ----
const SAN = { x: 0, z: 32 };          // 三の丸（名護屋丸）。主人公の持ち場の始まり
const OTE = { x: 0, z: 70 };          // 大手の曲輪
const NI = { x: 0, z: -8 };           // 二の丸
const MATSU = { x: -34, z: -20 };     // 松の丸（内応の火の手が上がる）
const HON = { x: 0, z: -46 };         // 本丸
const SOUTH = { x: 0, z: 150 };       // 西軍の寄せ口
const LIMIT = 420;

const ROUTE = [[0, 160], [0, 130], [0, 100], [0, 84], [OTE.x, OTE.z], [0, 60], [0, 46], [SAN.x, SAN.z], [0, 20], [0, 4], [NI.x, NI.z], [0, -20], [0, -34], [HON.x, HON.z]];

const TORII = { flag: 'tokugawa' };
const WEST = { armor: 0x2c2a26, lace: 0x6a5a3a, flag: 'ukita' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));

// ---- 地形：木幡山の丘。南は低く、北の本丸ほど高い ----
const XY = 4, SC = 0.2, C0 = demSample(DEM, 0, 0);
function base(x, z) {
  const n = (demSample(DEM, x * XY, z * XY) - C0) * SC;
  return 3 + Math.max(-3, n) + 0.2 * Math.sin(x * 0.07) * Math.cos(z * 0.06);
}
const lv = (cx, cz, up) => (b) => b(cx, cz) + up;
// 三の丸・二の丸・松の丸は踏み固めた土の平場にする（白い砂利の平場が真夏の日に照って、雪の曲輪に見えていた）
const PLAN = {
  mon: 'tokugawa', name: '伏見城', type: 'hirayama', year: 1600, gateSlope: 7, lifeNoFlags: true,
  kuruwa: [
    { id: 'ote', name: '大手の曲輪', level: lv(0, 70, 0.4), wall: 'saku', kind: 'san', poly: rectPoly(-22, 22, 60, 84), gapAt: [[0, 84], [0, 60]], gapW: 6, floor: false },
    { id: 'san', name: '三の丸', level: lv(0, 32, 2.5), wall: 'ishigaki', kind: 'ni', poly: rectPoly(-28, 28, 20, 46), gapAt: [[0, 46], [0, 20]], gapW: 5, floor: false },
    { id: 'ni', name: '二の丸', level: lv(0, -8, 4.5), wall: 'ishigaki', kind: 'ni', poly: rectPoly(-24, 24, -20, 4), gapAt: [[0, 4], [0, -20]], gapW: 5, floor: false },
    { id: 'matsu', name: '松の丸', level: lv(-34, -20, 4.5), wall: 'dobei', kind: 'koshi', poly: rectPoly(-48, -26, -32, -10), gapAt: [[-26, -20]], gapW: 5, floor: false },
    { id: 'hon', name: '本丸', level: lv(0, -46, 6.5), wall: 'ishigaki', kind: 'hon', poly: rectPoly(-20, 20, -62, -34), gapAt: [[0, -34]], gapW: 5 },
  ],
  koguchi: [
    { id: 'ote_s', name: '大手門', from: 'out', to: 'ote', kind: 'hira', at: [0, 84], rot: 0, w: 5 },
    { id: 'ote_n', name: '大手の奥の木戸', from: 'ote', to: 'out', kind: 'hira', at: [0, 60], rot: 0, w: 5 },
    { id: 'san_s', name: '三の丸の虎口', from: 'out', to: 'san', kind: 'hira', at: [0, 46], rot: 0, w: 5 },
    { id: 'san_n', name: '三の丸の奥の口', from: 'san', to: 'out', kind: 'hira', at: [0, 20], rot: 0, w: 4.4 },
    { id: 'ni_s', name: '二の丸の口', from: 'out', to: 'ni', kind: 'hira', at: [0, 4], rot: 0, w: 4.4 },
    { id: 'ni_n', name: '二の丸の奥の口', from: 'ni', to: 'out', kind: 'hira', at: [0, -20], rot: 0, w: 4.4 },
    { id: 'hon_s', name: '本丸の口', from: 'out', to: 'hon', kind: 'hira', at: [0, -34], rot: 0, w: 4.4 },
  ],
  paths: [{ id: 'ote', kind: 'ote', pts: ROUTE.slice(2) }],
};
let HEIGHT_FN = null;
function height(x, z) { if (!HEIGHT_FN) HEIGHT_FN = heightOf(PLAN, base, 3); return HEIGHT_FN(x, z); }

const { way: fushimiWay } = routeTools(ROUTE, 'k01');

const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, width: o.width || 8, list, seek: o.seek || 45, morale: o.morale || 92 });

const k01_fushimi = {
  // 身の回りの合戦の跡（timeslip_field.js）。伏見城：慶長五年七月の真夏。白い砂利の曲輪も寄せ手の泥と倒れた槍・矢・旗で踏み荒らす
  timeslip: {
    wet: 0.1, dust: 0.75, trample: 0.45, debris: 1.4, arrows: 1.2, workGround: true,
    grass: 0x7e9a4c, grassTints: [0xffffff, 0xe4ecc4, 0xc8d49c], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.7,
    flagColors: [0xe6dfcc, 0x24211e, 0x9a2a20],
  },
  spawn: { x: SAN.x, z: SAN.z - 6, heading: Math.PI },
  noWake: true,
  minutes: 6,
  world: {
    seed: 1600719,
    time: 'day',
    groundHalf: 290,
    moveLim: 250,
    paths: [ROUTE.slice(0, 8), ROUTE.slice(7)],
    height,
    moveWay: fushimiWay,
    tint(x, z, h, c) {
      if (distToPolyline(x, z, ROUTE) < 3.2) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      if (z > 100) { c.setRGB(c.r * 0.6 + 0.22, c.g * 0.6 + 0.2, c.b * 0.5 + 0.06); return; }
      if (h > 10) c.setRGB(c.r * 0.76, c.g * 0.86, c.b * 0.72);
    },
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 7 || PLAN.kuruwa.some((k) => x > k.poly[0][0] - 2 && x < k.poly[1][0] + 2 && z > k.poly[0][1] - 2 && z < k.poly[2][1] + 2),
    trees: 380,
    tufts: 2200,
    treeDensity: (x, z) => (distToPolyline(x, z, ROUTE) < 9 ? 0 : z > 100 ? 0.1 : 1.0),
    groves: [{ x: -70, z: 40, r: 16, n: 18, kind: 'sugi' }, { x: 70, z: -10, r: 16, n: 18, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? z > 210 : z < -150),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    F.C = buildCastlePlan(rt, PLAN, { baseHeight: base, edgeW: 3, team: 0, perch: false, interiorGuards: false });
    for (const [x, z] of [[-14, 66], [14, 66], [-16, 26], [16, 26], [-14, -14], [14, -14], [-10, -50], [10, -50]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 6));
    for (const [x, z] of [[-8, 70], [8, 34], [-8, -6], [8, -44]]) rt.scene.add(kagaribi(W, x, z));
    // 南に寄せる西軍の大軍（軽い作り）。宇喜多・小早川・島津の旗
    W.addDistantArmy({ x: 0, z: SOUTH.z + 20, w: 70, d: 40, count: 420, facing: Math.PI, armor: 0x2c2a26, team: 1, mon: 'ukita', seed: 16011 });
    W.addDistantArmy({ x: -60, z: SOUTH.z - 10, w: 40, d: 26, count: 240, facing: Math.PI, armor: 0x2c2a26, team: 1, mon: 'kobayakawa', seed: 16012 });
    W.addDistantArmy({ x: 60, z: SOUTH.z - 10, w: 40, d: 26, count: 240, facing: Math.PI, armor: 0x2c2a26, team: 1, mon: 'shimazu', seed: 16013 });
    // 持ち場から大手の道の正面（二十八〜三十八歩先・屋敷の間）で、先に斬り込んだ西軍と城の兵が押し合う乱戦（軽い作り・本物の兵の数は変えない）
    { const C = W.addClash({ x: 0, z: 62, facing: Math.PI, w: 14, bw: 4.6, gap: 2.2, seed: 16014, rt,
        play: (k, p, v) => rt.army.play(k, p, v), smoke: (x, y, z, ax, az) => rt.army.smoke(x, y, z, ax, az),
        noRout: true, killRate: 0.004, maxDrift: 1.2, host: false, corpses: 6, realNear: 12, nearHide: 0,
        A: { flag: 'tokugawa', armor: 0x2a2622, count: 70, flagRate: 0.22 },
        B: { flag: 'ukita', armor: 0x2c2a26, count: 70, flagRate: 0.22 } });
      if (C?.go) C.go(); }
    // ---- 味方：鳥居元忠の本陣と、主人公の付く松平家忠・内藤家長の手 ----
    F.motochika = allyGroup(rt, { faction: 'oda', name: '鳥居元忠の本陣', anchor: { x: NI.x, z: NI.z - 4 }, facing: Math.PI, width: 4, aggro: 3, order: 'hold', fixed: true, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '鳥居元忠', invuln: true, horse: false } }, { type: 'samurai', n: 3 }], TORII));
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: SAN.x - 2, z: SAN.z + 4 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 6 }], TORII));
    F.ie = allyGroup(rt, { faction: 'oda', name: '松平家忠の手', anchor: { x: SAN.x + 10, z: SAN.z + 6 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '松平家忠', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 4 }], TORII));
    F.nai = allyGroup(rt, { faction: 'oda', name: '内藤家長の手', anchor: { x: SAN.x - 12, z: SAN.z + 6 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '内藤家長', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 3 }], TORII));
    for (const g of [F.mine, F.ie, F.nai]) { g.defMult = 1.3; g.dmgMult = 0.85; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: SAN.x + 2, z: SAN.z - 2 }, Math.PI, [{ kind: 'spear', n: Math.min(n, 16) }]);
    W.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '城を守り、時を稼げ', 'main');
    // 戦の前：家康と元忠の別れ（伏見城を死守する）
    rt.say('徳川家康', '元忠、会津へ発つ。城を預ける。三成が挙兵すれば、伏見は真っ先に襲われよう', 4.6);
    rt.after(5.2, () => rt.say('鳥居元忠', '兵が少なく、守り切れませぬ。されど、お供の兵は一人でも多く連れて行かれませ', 4.2));
    rt.after(9.8, () => rt.say('徳川家康', '……すまぬ。伏見を死守してくれ。そなたと共に過ごした日々は、忘れぬ', 4.4));
    rt.after(14.6, () => rt.say('鳥居元忠', '殿は天下を取られよ。我らがここで時を稼ぎまする。お任せあれ', 4));
    rt.after(18.8, () => rt.say('松平家忠', '西の軍勢が来たぞ！　大手に宇喜多の旗じゃ', 3.6));
    rt.after(22, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    depthStart(rt, { faction: 'ukita', flag: 'ukita', armor: WEST.armor, friends: () => [F.mine, F.ie, F.nai], look: (list) => dress(list, WEST), scale: 1, backing: false, fixedSpawn: true, dmg: 0.3, botSeek: 40 }, [
      // ① 大手：三の丸の前で寄せ手を受ける
      DP.hold({ at: { x: SAN.x, z: SAN.z + 8 }, r: 14, dur: 55, title: '大手', sub: '宇喜多の四万が城を囲む', label: '三の丸の持ち場', obj: '三の丸を守れ',
        say: [['鳥居元忠', '一歩も通すな。時こそ殿への土産ぞ']],
        waves: () => [
          { t: 2, say: ['宇喜多の侍', '城は小勢ぞ。一気に揉み潰せ！'], foes: () => [keep('宇喜多勢の先手', OTE, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }], { dz: 56 })] },
          { t: 24, say: ['小早川の侍', '長束殿の鉄砲組、続け！'], foes: () => [keep('小早川勢の組', OTE, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'bow', n: 3 }], { dz: 56, dx: 12 })] },
        ],
        reward: '三の丸を守り抜いた' }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ② 三の丸が破られ、二の丸へ退く
      DP.move({ to: { x: NI.x, z: NI.z + 6 }, obj: '二の丸まで退いて、持ち場を立て直せ', label: '二の丸', r: 9, max: 50,
        say: [['内藤家長', '三の丸は支えきれぬ！　二の丸へ退け']],
        ambush: { d: 30, say: ['島津の侍', '逃がすな！　薩摩の鉄砲を浴びせよ'], foes: () => [keep('島津勢の追い手', { x: SAN.x, z: SAN.z - 12 }, [{ type: 'ashigaru', n: 7 }, { type: 'gun', n: 3 }, { type: 'samurai', n: 1 }], { dz: 26 })] } }),
      // ③ 内応の火の手と火攻めを耐える
      DP.hold({ at: { x: NI.x, z: NI.z + 6 }, r: 14, dur: 60, title: '火の手', sub: '松の丸で内応の火が上がる', label: '二の丸の持ち場', obj: '二の丸を守れ',
        say: [['松平家忠', '松の丸が燃えておる！　内に裏切り者がおる'], ['鳥居元忠', '火に怯むな。まだ本丸がある']],
        waves: () => [
          { t: 3, say: ['長束正家の侍', '火の手が上がったぞ！　門を開けさせよ'], foes: () => [keep('長束勢の組', { x: SAN.x, z: SAN.z - 6 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }], { dz: 8 })] },
          { t: 26, foes: () => [keep('宇喜多勢の二の手', MATSU, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'bow', n: 3 }], { dx: -4, dz: 6 })] },
        ],
        onEnd: (rt2) => this.burn(rt2),
        reward: '二の丸を守り抜いた' }),
      DP.rest({ dur: 5, heal: 0.7 }),
      // ④ 本丸：元忠の最後の抵抗
      DP.fight({ at: HON, title: '本丸', sub: '鳥居元忠、最後の抵抗', obj: '本丸の西軍を食い止めよ', max: 80,
        say: [['鳥居元忠', '徳川の鳥居ここにあり！　最後の最後まで戦え'], ['雑賀孫一', '鳥居殿、いざ尋常に勝負！']],
        foes: () => [keep('本丸へ攻め入る西軍', HON, [{ type: 'busho', n: 1, o: { name: '雑賀孫一', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 4 }], { dz: 24, morale: 100 })],
        reward: '本丸で最後まで戦った' }),
    ], (rt2) => this.win(rt2));
  },

  burn(rt) {
    const F = rt.flags;
    if (F.burned) return;
    F.burned = true;
    rt.world.setTime('dusk');
    for (const [x, z, s] of [[MATSU.x, MATSU.z, 2.4], [MATSU.x + 8, MATSU.z + 4, 2], [NI.x - 12, NI.z - 6, 1.8], [HON.x, HON.z + 10, 2.2]]) {
      if (rt.world.addFire) rt.world.addFire(x, z, { size: s, h: 2 });
    }
  },

  // 本丸に火が回り、元忠が討死する。城は落ちるが、東軍が美濃へ動くための時は稼げた
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    this.burn(rt);
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '伏見城を最後まで守った', pts: 40 }; }, '伏見城を最後まで守った');
    sfx('horagai', 0.9);
    rt.banner('伏見城、炎上', '慶長五年八月一日　鳥居元忠、討死');
    rt.player.u.invuln = true;
    rt.after(2, () => rt.say('鳥居元忠', '殿……ご武運を。この元忠、約束どおり守り通しました', 4.2));
    rt.after(6.8, () => rt.say(nm(rt), '十日あまり、西の四万を縫い止めましたな。これで殿は東へ戻れまする', 4.2));
    rt.after(11.4, () => rt.say('雑賀孫一', '鳥居元忠、討ち取ったり！　天晴れな最期であった', 4.2));
    rt.finish({}, 16);
  },

  lose(rt) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('時を稼げなかった', '城は早々に落ちた');
    rt.say('鳥居元忠', '持ちこたえられなんだ……殿、申し訳ございませぬ', 4);
    rt.finish({ failureReason: '刻限までに持ち場を守り切れなかった' }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    depthTick(rt, dt);
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '雑賀孫一') rt.award((t) => { t.special = { label: '雑賀孫一を退けた', pts: 20 }; }, '雑賀孫一を退けた');
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

k01_fushimi.force = (rt) => ({ a: Math.max(0, 1800 - (rt.flags.ak || 0) * 25), a0: 1800, b: Math.max(0, 40000 - (rt.flags.ek || 0) * 40), b0: 40000 });
k01_fushimi.sides = { a: { name: '徳川勢', mon: 'tokugawa' }, b: { name: '西軍', mon: 'ukita' } };
k01_fushimi.date = (rt) => (rt.flags.burned ? '慶長五年（1600）八月　夕・火の手' : '慶長五年（1600）七月　夏・昼');
k01_fushimi.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k01_fushimi.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k01_fushimi.history = '慶長五年（1600）、徳川家康は会津の上杉景勝を討つため東へ発つ前に、京の入り口の伏見城を家臣の鳥居元忠に預けた。伝えでは、家康は「城を死守してくれ」と告げ、二人は別れの盃を交わしたという。七月、石田三成らが挙兵して西軍が成り、宇喜多秀家・小早川秀秋・島津義弘・長束正家ら四万ほどが伏見城を囲んだ。城には鳥居元忠・松平家忠・内藤家長ら千八百ほどしかいなかったが、十日あまり持ちこたえ、八月一日、甲賀衆の内応で松の丸から火の手が上がって本丸へ攻め込まれ、元忠は討死、城は炎上して落ちた。この足止めが、家康が東から戻って美濃へ進む時を稼いだ。\n曲輪の並びと寸法は遊びのために縮めて復元したもので、内応や元忠の最期の細部は伝えにより異なる。';
k01_fushimi.bushou = [{ name: '鳥居元忠', g: /元忠/ }, { name: '雑賀孫一', g: /孫一/ }];

k01_fushimi.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, SAN.x, SAN.z - 4, 3);
};

const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
STAGES.k01_fushimi = [['大手の寄せ手を受ける'], ['二の丸へ退く', dpAt(1)], ['内応の火の手を耐える', dpAt(2)], ['本丸で最後まで戦う', dpAt(3)]];

export { k01_fushimi };
export default k01_fushimi;
