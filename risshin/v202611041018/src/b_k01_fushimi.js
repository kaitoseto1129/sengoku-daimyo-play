// ======================================================================
// 徳川編 1　伏見城の戦い（慶長五年 1600・七月十九日〜八月一日）　関ヶ原の戦いの最初の戦、死守の戦
// 筋書きの正：docs/chapter3_tokugawa.md の「1. 伏見城」、docs/battle_events_1101.md
// 徳川家康は会津征伐へ発つ前、伏見城を鳥居元忠に預け「死守せよ」と別れた。石田三成らが挙兵すると、
// 宇喜多秀家・小早川秀秋・島津義弘・長束正家ら西軍四万ほどが、千八百ほどの城を囲む。城は十日あまり持ちこたえたが、
// 甲賀衆の内応で松の丸から火を放たれ、本丸へ攻め入られる。元忠は最後まで戦って討死し、城は炎上して落ちた。
// 勝利条件＝時間を稼ぎ、最後まで城を守って死ぬ（城は史実どおり落ちる。主人公は元忠の手勢として持ち場を守る）。
// 段：①三の丸の虎口で宇喜多勢 ②大手の曲輪の島津勢（入城を断られた島津）③七月二十九日・二の丸の口へ退く
//     ④八月一日・松の丸の甲賀衆の内応と長束・小早川勢 ⑤本丸の口で元忠と最後まで ⑥雑賀孫一の鉄砲衆
// 11/4 AP〜AT：見せかけの軍勢と目の前の乱戦（addDistantArmy・addClash）を外し、城を囲む宇喜多・小早川・島津の陣も本物の兵に。
//   総大将の宇喜多秀家は南の外の本陣から出ない。旗は徳川・宇喜多・小早川・島津と、紋の確かでない家の丸だけ。兵の比 1800：40000。
//   手本と出所：docs/battle_refs/k01_fushimi.md
// 負け方：主人公が討たれる。段ごとの刻限とは別の、十五分の保険。
// 向き：北が -z（本丸）、南が +z（大手）。西軍は南から攻め上る。
// 地形：国土地理院の標高（dem_fushimi.js・tools/dem.mjs の fushimi）。水平は実の 1/4、高さは 0.2 倍。
// ======================================================================
import { demSample } from './dem.js';
import DEM from './dem_fushimi.js';
import { nobori, kagaribi } from './props.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, enemyGroup, nm } from './bhelp.js';
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
const LIMIT = 900;   // 段ごとの刻限とは別の保険（十五分）
// 城を囲む西軍の陣（宇喜多＝南の外・小早川＝西・島津＝南東）
const CAMPS = [{ x: 0, z: 178 }, { x: -96, z: 30 }, { x: 92, z: 104 }];

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
    { id: 'matsu', name: '松の丸', level: lv(-34, -20, 4.5), wall: 'ishigaki', kind: 'koshi', poly: rectPoly(-48, -26, -32, -10), gapAt: [[-26, -20]], gapW: 5, floor: false },
    { id: 'hon', name: '本丸', level: lv(0, -46, 6.5), wall: 'ishigaki', kind: 'hon', poly: rectPoly(-20, 20, -62, -34), gapAt: [[0, -34]], gapW: 5 },
    // 西の丸（内藤家長の持ち場）：本丸の西の一段低い曲輪
    { id: 'nishi', name: '西の丸', level: lv(-40, -52, 5.2), wall: 'ishigaki', kind: 'koshi', poly: rectPoly(-56, -26, -64, -40), gapAt: [[-26, -52]], gapW: 5 },
  ],
  // 曲輪の間を切る空堀（丘の城の伏見城。通る所だけ土橋を残す）。docs/battle_refs/k01_fushimi.md
  hori: [
    { kind: 'karabori', pts: [[-30, 53], [-7, 53]], w: 6, deep: 2.4 }, { kind: 'karabori', pts: [[7, 53], [30, 53]], w: 6, deep: 2.4 },
    { kind: 'karabori', pts: [[-30, 12], [-7, 12]], w: 6, deep: 2.6 }, { kind: 'karabori', pts: [[7, 12], [30, 12]], w: 6, deep: 2.6 },
    { kind: 'karabori', pts: [[-22, -27], [-7, -27]], w: 5, deep: 2.6 }, { kind: 'karabori', pts: [[7, -27], [24, -27]], w: 5, deep: 2.6 },
  ],
  koguchi: [
    // 大手門：御香宮の表門（伝・伏見城の大手門）の薬医門の形
    { id: 'ote_s', name: '大手門', from: 'out', to: 'ote', kind: 'hira', at: [0, 84], rot: 0, w: 5, gate: 'yakui' },
    { id: 'ote_n', name: '大手の奥の木戸', from: 'ote', to: 'out', kind: 'hira', at: [0, 60], rot: 0, w: 5 },
    { id: 'san_s', name: '三の丸の虎口', from: 'out', to: 'san', kind: 'hira', at: [0, 46], rot: 0, w: 5, gate: 'yagura' },
    { id: 'san_n', name: '三の丸の奥の口', from: 'san', to: 'out', kind: 'hira', at: [0, 20], rot: 0, w: 4.4 },
    { id: 'ni_s', name: '二の丸の口', from: 'out', to: 'ni', kind: 'hira', at: [0, 4], rot: 0, w: 4.4, gate: 'yagura' },
    { id: 'ni_n', name: '二の丸の奥の口', from: 'ni', to: 'out', kind: 'hira', at: [0, -20], rot: 0, w: 4.4 },
    { id: 'hon_s', name: '本丸の口', from: 'out', to: 'hon', kind: 'hira', at: [0, -34], rot: 0, w: 4.4, gate: 'yagura' },
  ],
  // 門へ寄る敵を横から撃つ二重の隅櫓（三の丸の表・本丸の表の角）
  yagura: [
    { id: 'san_w', kind: 'sumi', at: [-24, 42] }, { id: 'san_e', kind: 'sumi', at: [24, 42] },
    { id: 'hon_w', kind: 'sumi', at: [-16, -38] }, { id: 'hon_e', kind: 'sumi', at: [16, -38] },
  ],
  // 本丸の北西に五重の天守（慶長二年の木幡山の天守。落城で焼けた）
  lordSeat: { kind: 'tenshu', at: [-9, -53], b: 9, floors: 5, base: 4, name: '天守', where: '本丸の天守' },
  paths: [{ id: 'ote', kind: 'ote', pts: ROUTE.slice(2) }],
};
let HEIGHT_FN = null;
function height(x, z) { if (!HEIGHT_FN) HEIGHT_FN = heightOf(PLAN, base, 3); return HEIGHT_FN(x, z); }

const { way: fushimiWay } = routeTools(ROUTE, 'k01');

// 寄せ手の組：from から寄せる。旗はその家の紋（紋の確かでない長束・甲賀・雑賀は丸）
const keep = (name, from, flag, list, o = {}) => ({ name, from: { x: from.x, z: from.z }, faction: flag, width: o.width || 10, list: dress(list, { ...WEST, flag }), seek: o.seek || 60, morale: o.morale || 94 });
// 城の外の陣（本物の兵。動かずに城を囲む。総大将とその下の大将は前に出ない）
const camp = (rt, name, at, flag, lead, list, facing) => {
  const g = enemyGroup(rt, { fixed: true, faction: flag, name, anchor: at, facing, order: 'hold', aggro: 3, width: 10, morale: 100, noRout: true },
    dress([{ type: 'busho', n: 1, o: { name: lead, invuln: true, horse: true } }, ...list], { ...WEST, flag }));
  rt.scene.add(nobori(rt.world, at.x - 6, at.z + 3, flag, 6)); rt.scene.add(nobori(rt.world, at.x + 6, at.z + 3, flag, 6));
  return g;
};

const k01_fushimi = {
  // 身の回りの合戦の跡（timeslip_field.js）。伏見城：慶長五年七月の真夏。白い砂利の曲輪も寄せ手の泥と倒れた槍・矢・旗で踏み荒らす
  timeslip: {
    wet: 0.1, dust: 0.75, trample: 0.45, debris: 1.4, arrows: 1.2, workGround: true,
    grass: 0x7e9a4c, grassTints: [0xffffff, 0xe4ecc4, 0xc8d49c], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.7,
    flagColors: [0xe6dfcc, 0x24211e, 0x9a2a20],
  },
  spawn: { x: SAN.x, z: SAN.z + 4, heading: Math.PI },
  noWake: true,
  minutes: 8,
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
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 7 || PLAN.kuruwa.some((k) => x > k.poly[0][0] - 2 && x < k.poly[1][0] + 2 && z > k.poly[0][1] - 2 && z < k.poly[2][1] + 2) || CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < 16),
    trees: 380,
    tufts: 2200,
    treeDensity: (x, z) => (distToPolyline(x, z, ROUTE) < 9 || CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < 18) ? 0 : z > 100 ? 0.1 : 1.0),
    groves: [{ x: -70, z: 40, r: 16, n: 18, kind: 'sugi' }, { x: 70, z: -10, r: 16, n: 18, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? z > 210 : z < -150),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    F.C = buildCastlePlan(rt, PLAN, { baseHeight: base, edgeW: 3, team: 0, perch: false, interiorGuards: false, buildGates: true, buildTowers: true });
    // 門は開けた形（味方が退き、寄せ手が攻め入る道を塞がない）
    for (const g of Object.values(F.C.gateObjs || {})) { g.open(); Object.assign(g.struct, { solidR: 0, passable: true, opened: true, noTarget: true, fireProof: true }); }
    for (const [x, z] of [[-14, 66], [14, 66], [-16, 26], [16, 26], [-14, -14], [14, -14], [-10, -50], [10, -50]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 6));
    for (const [x, z] of [[-8, 70], [8, 34], [-8, -6], [8, -44]]) rt.scene.add(kagaribi(W, x, z));
    // 見せかけの軍勢は置かない（AA・AF・AQ6・AP9）。城を囲む西軍の陣も本物の兵。総大将の宇喜多秀家は南の外の本陣から出ない（AR3・AT3）
    F.ukitaCamp = camp(rt, '宇喜多秀家の本陣', CAMPS[0], 'ukita', '宇喜多秀家', [{ type: 'samurai', n: 12 }, { type: 'gun', n: 4 }], Math.PI);
    F.kobaCamp = camp(rt, '小早川秀秋の陣', CAMPS[1], 'kobayakawa', '小早川秀秋', [{ type: 'samurai', n: 8 }, { type: 'ashigaru', n: 6 }], Math.PI * 0.6);
    F.shimaCamp = camp(rt, '島津義弘の陣', CAMPS[2], 'shimazu', '島津義弘', [{ type: 'samurai', n: 6 }, { type: 'gun', n: 6 }], -Math.PI * 0.8);
    // ---- 城方：千八百。鳥居元忠は本丸の天守の前の本陣で旗本に囲まれる。主人公は元忠の手勢として三の丸の虎口を受け持つ ----
    F.motochika = allyGroup(rt, { faction: 'oda', name: '鳥居元忠の本陣', anchor: { x: -2, z: -48 }, facing: Math.PI, width: 6, aggro: 3, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '鳥居元忠', invuln: true, horse: false } }, { type: 'samurai', n: 10 }], TORII));
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: SAN.x - 2, z: SAN.z + 8 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 4 }], TORII));
    F.ie = allyGroup(rt, { faction: 'oda', name: '松平家忠の手', anchor: { x: SAN.x + 12, z: SAN.z + 8 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '松平家忠', invuln: true, horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }], TORII));
    F.nai = allyGroup(rt, { faction: 'oda', name: '内藤家長の手', anchor: { x: SAN.x - 14, z: SAN.z + 8 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '内藤家長', invuln: true, horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }, { type: 'bow', n: 4 }], TORII));
    for (const g of [F.mine, F.ie, F.nai]) { g.defMult = 1.25; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: SAN.x + 2, z: SAN.z + 2 }, Math.PI, [{ kind: 'spear', n: Math.min(n, 12) }]);
    W.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '伏見城の三の丸・二の丸・本丸の口を順に守り、四万の西軍を一日でも長く食い止めよ', 'main');
    // 戦の前：家康と元忠の別れ → 島津の入城を断る → 西軍が城を囲む
    rt.say('徳川家康', '元忠、会津へ発つ。城を預ける。三成が挙兵すれば、伏見は真っ先に襲われよう', 4.6);
    rt.after(5.2, () => rt.say('鳥居元忠', '城は千八百で足りまする。兵は一人でも多く、会津へ連れて行かれませ', 4.2));
    rt.after(9.8, () => rt.say('徳川家康', '……すまぬ。伏見を頼む。そなたと共に過ごした日々は、忘れぬ', 4.2));
    rt.after(14.4, () => rt.say('鳥居元忠', '島津殿が城に入りたいと申すが、殿の下知に無い。断れ', 4));
    rt.after(18.8, () => rt.say('松平家忠', '南の丘に宇喜多の旗、西に小早川、南東に島津！　城は囲まれたぞ', 4));
    rt.after(23.2, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    const SE = { x: 46, z: 98 }, SW = { x: -46, z: 98 }, S = { x: 0, z: 120 };
    depthStart(rt, { faction: 'ukita', flag: 'ukita', armor: WEST.armor, friends: () => [F.mine, F.ie, F.nai], scale: 2.2, backing: false, fixedSpawn: true, dmg: 0.38, botSeek: 40 }, [
      // ① 七月十九日：大手から寄せる宇喜多勢を、三の丸の虎口で押し返す
      DP.hold({ at: { x: SAN.x, z: SAN.z + 10 }, r: 14, dur: 70, title: '七月十九日　大手', sub: '宇喜多秀家の四万が城を囲む', label: '三の丸の虎口', obj: '三の丸の虎口で、大手から寄せる宇喜多勢を押し返せ',
        say: [['鳥居元忠', '一歩も通すな。一日でも長く持ちこたえる事が、殿への土産ぞ']],
        waves: () => [
          { t: 2, say: ['宇喜多の侍', '城は小勢ぞ。一気に揉み潰せ！'], foes: () => [keep('宇喜多勢の先手', S, 'ukita', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 5 }])] },
          { t: 26, say: ['宇喜多の侍', '二の手、続け！　竹束を押し立てよ'], foes: () => [keep('宇喜多勢の二の手', SW, 'ukita', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 4 }])] },
          { t: 48, foes: () => [keep('宇喜多勢の三の手', S, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }])] },
        ],
        reward: '三の丸の虎口を守り抜いた' }),
      // ② 初めは城に入ろうとして断られた島津が、寄せ手に回って南東から大手の曲輪へ入る
      DP.fight({ at: { x: 4, z: 54 }, title: '島津勢', sub: '入城を断られた島津が、寄せ手に回った', obj: '大手の曲輪へ入った島津勢を討て', max: 150,
        say: [['島津の侍', '城に入れぬなら、攻め落とすまで！　薩摩の鉄砲、撃ちかけよ'], ['内藤家長', '島津が大手の曲輪に入ったぞ。三の丸の前で討て！']],
        foes: () => [keep('島津勢の先手', SE, 'shimazu', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 5 }], { morale: 97 })],
        later: [{ t: 45, say: ['島津の侍', '新手じゃ！　退くな、押せ！'], foes: () => [keep('島津勢の二の手', SE, 'shimazu', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }])] }],
        reward: '島津勢を大手から追い落とした' }),
      // 時が飛ぶ：画面の真ん中に日付と次の目標を出す（AT7）
      DP.rest({ dur: 6, heal: 0.6, banner: ['七月二十九日', '石田三成が着き、総攻め。二の丸の口へ退け'],
        say: [['松平家忠', '石田治部が伏見に着いた。明日から総攻めじゃ'], ['鳥居元忠', '三の丸は捨てる。二の丸の口で受けよ']] }),
      // ③ 三の丸を捨て、二の丸の口へ退く（後ろから宇喜多勢が追う）
      DP.move({ to: { x: NI.x, z: NI.z + 2 }, obj: '三の丸を捨て、二の丸の口まで退け', label: '二の丸の口', r: 9, max: 60,
        ambush: { d: 26, say: ['宇喜多の侍', '城兵が退くぞ！　追え、付け入れ！'], foes: () => [keep('宇喜多勢の追い手', { x: 0, z: 66 }, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }])] } }),
      // ④ 八月一日：松の丸の甲賀衆が寝返って火を放ち、長束勢と小早川勢が二の丸へ入る
      DP.hold({ at: { x: -10, z: -12 }, r: 14, dur: 75, title: '八月一日　火の手', sub: '松の丸の甲賀衆が寝返り、火を放つ', label: '二の丸の西', obj: '松の丸から二の丸へ入る、寝返った甲賀衆と長束勢を食い止めよ',
        say: [['松平家忠', '松の丸が燃えておる！　甲賀衆が寝返ったぞ'], ['鳥居元忠', '火に怯むな。まだ本丸がある']],
        waves: () => [
          { t: 2, say: ['長束の侍', '甲賀衆が門を開けたぞ！　二の丸へ雪崩れ込め'], foes: () => [keep('寝返った甲賀衆', MATSU, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 4 }]), keep('長束勢', { x: MATSU.x - 6, z: MATSU.z + 4 }, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 3 }])] },
          { t: 30, say: ['小早川の侍', '小早川勢、二の丸の口を破れ！'], foes: () => [keep('小早川勢', { x: 0, z: 40 }, 'kobayakawa', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }])] },
          { t: 54, foes: () => [keep('長束勢の二の手', MATSU, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }])] },
        ],
        reward: '二の丸の西を守り抜いた' }),
      DP.rest({ dur: 6, heal: 0.6, banner: ['八月一日　夕', '本丸だけが残った。本丸の口へ'],
        say: [['内藤家長', '家忠殿、討死！　わしは西の丸で死ぬ'], ['鳥居元忠', '皆、本丸へ。徳川の鳥居、ここで最後を見せようぞ']] }),
      // ⑤ 本丸の口：元忠と旗本も前に出て、最後まで戦う（史実で元忠本人が戦った）
      DP.hold({ at: { x: HON.x, z: HON.z + 6 }, r: 12, dur: 70, title: '本丸', sub: '鳥居元忠、最後の抵抗', label: '本丸の口', obj: '本丸の口で元忠殿の旗本と並び、攻め入る西軍を食い止めよ',
        say: [['鳥居元忠', '徳川の鳥居ここにあり！　最後の最後まで戦え']],
        waves: () => [
          { t: 2, say: ['宇喜多の侍', '本丸ぞ！　火の回らぬうちに乗っ取れ'], foes: () => [keep('本丸へ寄せる宇喜多勢', { x: 0, z: -6 }, 'ukita', [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }])] },
          { t: 32, foes: () => [keep('本丸へ寄せる小早川勢', { x: 12, z: -10 }, 'kobayakawa', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 4 }])] },
        ],
        reward: '本丸の口を守った' }),
      // ⑥ 雑賀孫一の鉄砲衆が本丸に斬り込む
      DP.fight({ at: HON, title: '雑賀孫一', sub: '鉄砲衆を連れて本丸へ斬り込む', obj: '本丸に斬り込んだ雑賀孫一の鉄砲衆を討て', max: 150,
        say: [['雑賀孫一', '鳥居殿はいずこ！　雑賀の孫一、見参！'], ['鳥居元忠', '旗本ども、わしに続け！']],
        foes: () => [keep('雑賀孫一の鉄砲衆', { x: 0, z: -14 }, 'maru', [{ type: 'busho', n: 1, o: { name: '雑賀孫一', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 8 }], { morale: 100, seek: 40 })],
        reward: '雑賀孫一の鉄砲衆と戦い抜いた' }),
    ], (rt2) => this.win(rt2));
  },

  burn(rt) {
    const F = rt.flags;
    if (F.burned) return;
    F.burned = true;
    rt.world.setTime('dusk');
    for (const [x, z, s] of [[MATSU.x, MATSU.z, 2.4], [MATSU.x + 8, MATSU.z + 4, 2], [NI.x - 12, NI.z - 6, 1.8], [HON.x, HON.z + 10, 2.2], [-9, -53, 3]]) {
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
    const D = F.dp;
    // 八月一日：松の丸の内応の火（④の段）
    if (D && D.on && D.i >= 4) this.burn(rt);
    // 本丸の段：元忠と旗本が本丸の口へ出て、自ら戦う
    if (D && D.on && D.i >= 6 && !F.toriiOut && F.motochika) { F.toriiOut = true; F.motochika.anchor = { x: HON.x, z: HON.z + 8 }; F.motochika.aggro = 14; F.motochika.order = 'attack'; }
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
STAGES.k01_fushimi = [['三の丸の虎口で宇喜多勢を押し返す'], ['大手の曲輪の島津勢を討つ', dpAt(1)], ['二の丸の口へ退く', dpAt(3)], ['寝返った甲賀衆と長束勢を食い止める', dpAt(4)], ['本丸の口で最後まで戦う', dpAt(6)], ['雑賀孫一の鉄砲衆を討つ', dpAt(7)]];

export { k01_fushimi };
export default k01_fushimi;
