// ======================================================================
// 徳川編 1　伏見城の戦い（慶長五年 1600・七月十九日〜八月一日）　関ヶ原の戦いの最初の戦、死守の戦
// 筋書きの正：docs/chapter3_tokugawa.md の「1. 伏見城」、docs/battle_events_1101.md
// 徳川家康は会津征伐へ発つ前、伏見城を鳥居元忠に預け「死守せよ」と別れた。石田三成らが挙兵すると、
// 宇喜多秀家・小早川秀秋・島津義弘・長束正家ら西軍四万ほどが、千八百ほどの城を囲む。城は十日あまり持ちこたえたが、
// 甲賀衆の内応で松の丸から火を放たれ、本丸へ攻め入られる。元忠は最後まで戦って討死し、城は炎上して落ちた。
// 勝利条件＝時間を稼ぎ、最後まで城を守って死ぬ（城は史実どおり落ちる。主人公は元忠の手勢として持ち場を守る）。
// 段：⓪七月十九日・打って出て長束と玄以の屋敷を焼く ①七月二十二日・三の丸の虎口で宇喜多勢 ②七月二十三日・大手の曲輪の島津勢 ③七月二十九日・二の丸の口へ回る
//     ④八月一日・松の丸の甲賀衆の内応と長束・小早川勢 ⑤本丸の口で元忠と最後まで ⑥雑賀孫一の鉄砲衆
// 11/4 AP〜AT：見せかけの軍勢と目の前の乱戦（addDistantArmy・addClash）を外し、城を囲む宇喜多・小早川・島津の陣も本物の兵に。
//   総大将の宇喜多秀家は南の外の本陣から出ない。旗は徳川・宇喜多・小早川・島津と、紋の確かでない家の丸だけ。兵の比 1800：40000。
//   手本と出所：docs/battle_refs/k01_fushimi.md
// 負け方：主人公が討たれる。段ごとの刻限とは別の、二十分の保険。
// 向き：北が -z（本丸）、南が +z（大手）。西軍は南から攻め上る。
// 地形：国土地理院の標高（dem_fushimi.js・tools/dem.mjs の fushimi）。水平は実の 1/4、高さは 0.2 倍。
// ======================================================================
import { demSample } from './dem.js';
import DEM from './dem_fushimi.js';
import { nobori, kagaribi, hut, dorui, tawara, takataba, jinmaku } from './props.js';
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
import { customFlag } from './b_inabayama.js';
import { revealName } from './battle_intel.js';

// ---- 場所（ゲームの座標） ----
const SAN = { x: 0, z: 32 };          // 三の丸（名護屋丸）。主人公の持ち場の始まり
const OTE = { x: 0, z: 70 };          // 大手の曲輪
const NI = { x: 0, z: -8 };           // 二の丸
const MATSU = { x: -34, z: -20 };     // 松の丸（内応の火の手が上がる）
const HON = { x: 0, z: -46 };         // 本丸
const SOUTH = { x: 0, z: 150 };       // 西軍の寄せ口
const LIMIT = 1200;   // 段ごとの刻限とは別の保険（二十分。出撃の段を足して段が十になった）
// 城を囲む西軍の陣（宇喜多＝南の外・小早川＝西・島津＝南東・石田＝南西。石田は七月二十九日に着く）
const CAMPS = [{ x: 0, z: 178 }, { x: -96, z: 30 }, { x: 92, z: 104 }, { x: -70, z: 150 }];
// 七月十九日に城方が打って出て焼いた、長束正家・前田玄以の屋敷（大手の外の南西の町）
const YASHIKI = { x: -30, z: 104 };
const HOUSES = [[-36, 108, 0.2], [-24, 112, -0.1], [-34, 96, 0.1]];
// 寄せ手が築いた築山（大筒を据えて城を撃つ）。大手の外の南
const TSUKIYAMA = { x: 22, z: 126 };
// 太鼓の丸（上林竹庵の持ち場）：二の丸の東
const TAIKO = { x: 32, z: -6 };

const ROUTE = [[0, 160], [0, 130], [0, 100], [0, 84], [OTE.x, OTE.z], [0, 60], [0, 46], [SAN.x, SAN.z], [0, 20], [0, 4], [NI.x, NI.z], [0, -20], [0, -34], [HON.x, HON.z]];

const TORII = { flag: 'tokugawa' };
const WEST = { armor: 0x2c2a26, lace: 0x6a5a3a, flag: 'ukita' };
// 雑賀の鈴木家の八咫烏の旗（b_saika.js の雑賀衆と同じ絵。どちらが先に描いても同じ布になる）
function crowTex() {
  return customFlag('yatagarasu', (g) => {
    g.translate(64, 84); g.scale(40, 40);
    g.beginPath(); g.ellipse(0, 0.05, 0.5, 0.36, -0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(0.42, -0.36, 0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(0.58, -0.42); g.lineTo(0.9, -0.34); g.lineTo(0.58, -0.28); g.closePath(); g.fill();
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(-0.1, -0.1); g.quadraticCurveTo(-0.5, -0.9 * (sd > 0 ? 1 : 0.8), -0.95, -0.55 + sd * 0.1); g.quadraticCurveTo(-0.55, -0.2, -0.2, 0.2); g.closePath(); g.fill(); }
    g.beginPath(); g.moveTo(-0.45, 0.2); g.lineTo(-0.95, 0.5); g.lineTo(-0.5, 0.36); g.closePath(); g.fill();
    g.lineWidth = 0.07;
    for (const dx of [-0.12, 0.04, 0.2]) { g.beginPath(); g.moveTo(dx, 0.35); g.lineTo(dx - 0.05, 0.85); g.stroke(); }
    g.fillStyle = '#e9e3d4'; g.beginPath(); g.arc(0.48, -0.4, 0.05, 0, Math.PI * 2); g.fill();
  });
}
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

// 寄せ手の組：from から寄せる。旗はその家の紋（紋の確かでない長束・甲賀は丸。雑賀の鈴木孫一は八咫烏）
const keep = (name, from, flag, list, o = {}) => ({ name, from: { x: from.x, z: from.z }, faction: flag, width: o.width || 10, list: dress(list, { ...WEST, flag }), seek: o.seek || 60, morale: o.morale || 94 });
// 城の外の陣（本物の兵。動かずに城を囲む。総大将とその下の大将は前に出ない）
// 総大将（宇喜多秀家）は床几に座り、下の大将（小早川・島津）は馬上で旗本に囲まれる（AR3・AV7・Q）
const camp = (rt, name, at, flag, lead, list, facing, seat = false) => {
  const g = enemyGroup(rt, { fixed: true, faction: flag, name, anchor: at, facing, order: 'hold', aggro: 3, width: 10, morale: 100, noRout: true },
    dress([{ type: 'busho', n: 1, o: { name: lead, invuln: true, horse: !seat } }, ...list], { ...WEST, flag }));
  if (seat) { const u = g.units.find((x) => x.name === lead); if (u) u._crouch = true; }
  // 床几に座る本陣は、家紋を染めた陣幕で囲む（総大将の座る所が野に晒されていた）
  if (seat) rt.scene.add(jinmaku(rt.world, at.x, at.z + 1, 22, 13, 5, { mon: flag }));
  rt.scene.add(nobori(rt.world, at.x - 6, at.z + 3, flag, 6)); rt.scene.add(nobori(rt.world, at.x + 6, at.z + 3, flag, 6));
  return g;
};

const k01_fushimi = {
  // 身の回りの合戦の跡（timeslip_field.js）。伏見城：慶長五年七月（旧暦の初秋・新暦の八月末の残暑）。白い砂利の曲輪も寄せ手の泥と倒れた槍・矢・旗で踏み荒らす
  timeslip: {
    wet: 0.1, dust: 0.75, trample: 0.45, debris: 1.4, arrows: 1.2, workGround: true,
    grass: 0x7e9a4c, grassTints: [0xffffff, 0xe4ecc4, 0xc8d49c], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.7,
    flagColors: [0xe6dfcc, 0x24211e, 0x9a2a20],
  },
  // 三の丸の奥から大手（南）を向いて始める（虎口の櫓門の真下に立つと、後ろの目が櫓門の屋根に埋まっていた）
  spawn: { x: SAN.x, z: SAN.z - 2, heading: 0 },
  noWake: true,
  noFrontFill: true,       // 見せかけの軍勢を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ
  goalSignOnly: true,      // 地面の矢印・持ち場の輪を出さない（BH6）
  kumiLead: false,         // 組頭の印も出さない（AV15）
  noHatamotoMass: true,    // 将の後ろの軽い作りの備を置かない（AF）
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
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 7 || PLAN.kuruwa.some((k) => x > k.poly[0][0] - 2 && x < k.poly[1][0] + 2 && z > k.poly[0][1] - 2 && z < k.poly[2][1] + 2) || CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < 16) || Math.hypot(x - YASHIKI.x, z - YASHIKI.z) < 18 || Math.hypot(x - TSUKIYAMA.x, z - TSUKIYAMA.z) < 12 || Math.hypot(x - TAIKO.x, z - TAIKO.z) < 9,
    trees: 380,
    tufts: 2200,
    treeDensity: (x, z) => (distToPolyline(x, z, ROUTE) < 9 || CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < 18) || Math.hypot(x - YASHIKI.x, z - YASHIKI.z) < 20 ? 0 : z > 100 ? 0.1 : 1.0),
    groves: [{ x: -70, z: 40, r: 16, n: 18, kind: 'sugi' }, { x: 70, z: -10, r: 16, n: 18, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? z > 210 : z < -150),
  },

  setup(rt) {
    crowTex();
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    F.C = buildCastlePlan(rt, PLAN, { baseHeight: base, edgeW: 3, team: 0, perchLook: TORII, interiorGuards: false, buildGates: true, buildTowers: true });
    // 門は開けた形（味方が退き、寄せ手が攻め入る道を塞がない）
    for (const g of Object.values(F.C.gateObjs || {})) { g.open(); Object.assign(g.struct, { solidR: 0, passable: true, opened: true, noTarget: true, fireProof: true }); }
    for (const [x, z] of [[-14, 66], [14, 66], [-16, 26], [16, 26], [-14, -14], [14, -14], [-10, -50], [10, -50]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 6));
    for (const [x, z] of [[-8, 70], [8, 34], [-8, -6], [8, -44]]) rt.scene.add(kagaribi(W, x, z));
    // 大手の外の長束・前田玄以の屋敷（七月十九日に城方が打って出て焼く）
    for (const [x, z, r] of HOUSES) rt.scene.add(hut(W, x, z, 7, 5, r, { wall: 0x7f6b52, groundedHome: true, minka: false }));
    // 寄せ手の築山（大筒を据える盛り土）と、三の丸の前の空堀を埋める土俵（史実の昼夜の大筒・堀の埋め立て）
    rt.scene.add(dorui(W, [TSUKIYAMA.x - 7, TSUKIYAMA.z, TSUKIYAMA.x + 7, TSUKIYAMA.z], 0, -1, { w: 6, h: 2.4, bareSoil: true }));
    for (const [x, z, r] of [[12, 53, 0.1], [17, 53.6, -0.2], [-13, 52.6, 0.2]]) rt.scene.add(tawara(W, x, z, r, 6));
    // 寄せ手が押し立てた竹束（城の鉄砲を防ぐ。前＝+z を城の北へ向ける）。大手の外と大手の曲輪の脇
    for (const [x, z] of [[-14, 92], [-11.6, 92.4], [-9.2, 92.6], [9.2, 92.6], [11.6, 92.4], [14, 92], [-18, 58], [-15.6, 58.2], [15.6, 58.2], [18, 58]]) rt.scene.add(takataba(W, x, z, Math.PI));
    // 見せかけの軍勢は置かない（AA・AF・AQ6・AP9）。城を囲む西軍の陣も本物の兵。総大将の宇喜多秀家は南の外の本陣から出ない（AR3・AT3）
    // 寄せ手は段々に増える（七月二十二日 宇喜多・二十三日 小早川と島津）。陣は update で日付の段に着く
    // ---- 城方：千八百。鳥居元忠は本丸の天守の前の本陣で旗本に囲まれる。主人公は元忠の手勢として三の丸の虎口を受け持つ ----
    F.motochika = allyGroup(rt, { faction: 'oda', name: '鳥居元忠の本陣', anchor: { x: -2, z: -48 }, facing: 0, width: 6, aggro: 3, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '鳥居元忠', invuln: true, horse: false } }, { type: 'samurai', n: 14 }], TORII));
    F.toriiU = F.motochika.units.find((u) => u.name === '鳥居元忠');
    if (F.toriiU) F.toriiU._crouch = true;   // 本丸の床几に腰を下ろす（最後の段で立って前に出る）
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: SAN.x - 2, z: SAN.z + 8 }, facing: 0, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 4 }], TORII));
    F.ie = allyGroup(rt, { faction: 'oda', name: '松平家忠の手', anchor: { x: SAN.x + 12, z: SAN.z + 8 }, facing: 0, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '松平家忠', invuln: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }], TORII));
    F.nai = allyGroup(rt, { faction: 'oda', name: '内藤家長の手', anchor: { x: SAN.x - 14, z: SAN.z + 8 }, facing: 0, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '内藤家長', invuln: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 7 }, { type: 'bow', n: 4 }], TORII));
    // 三の丸は家忠と松平近正の二人の持ち場。太鼓の丸には甲賀の上林竹庵（徳川方）
    F.chika = allyGroup(rt, { faction: 'oda', name: '松平近正の手', anchor: { x: SAN.x + 22, z: SAN.z + 4 }, facing: 0, width: 8, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '松平近正', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 5 }, { type: 'gun', n: 2 }], TORII));
    F.chikuan = allyGroup(rt, { faction: 'oda', name: '上林竹庵の手', anchor: TAIKO, facing: Math.PI * 0.5, width: 6, aggro: 6, order: 'hold', fixed: true, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '上林竹庵', invuln: true, horse: true } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 3 }], TORII));
    // 松の丸の甲賀衆（城方として持ち場に就く。八月一日、人質を取られて寝返る）
    F.koka = allyGroup(rt, { faction: 'oda', name: '甲賀衆', anchor: { x: MATSU.x, z: MATSU.z + 2 }, facing: -Math.PI / 2, width: 6, aggro: 3, order: 'hold', fixed: true, noRout: true },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 4 }], TORII));
    for (const g of [F.mine, F.ie, F.nai, F.chika]) { g.defMult = 1.25; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: SAN.x + 2, z: SAN.z + 2 }, 0, [{ kind: 'spear', n: Math.min(n, 12) }]);
    W.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '伏見城の三の丸・二の丸・本丸の口を順に守り、四万の西軍を一日でも長く食い止めよ', 'main');
    // 戦の前：家康と元忠の別れ → 西軍が集まる前に、城の外の屋敷を焼きに打って出る
    // 主君は家臣を通称で呼び、三成も官名の「治部」で言う（諱の呼び捨てと今の言い回しを外した）
    rt.say('徳川家康', '彦右衛門、会津へ発つ。城を預ける。治部が兵を挙げれば、伏見は真っ先に襲われよう', 4.6);
    rt.after(5.2, () => rt.say('鳥居元忠', '城は千八百で足りまする。兵は一人でも多く、会津へ連れて行かれませ', 4.2));
    rt.after(9.8, () => rt.say('徳川家康', '……すまぬ、彦右衛門。伏見を頼むぞ', 4.2));
    // 家康との別れ（六月十八日）から開戦まで一月飛ぶ。日付を真ん中に出す（AT7）
    rt.after(14, () => rt.banner('七月十九日', '石田三成らが挙兵し、西の軍勢が伏見へ向かう'));
    rt.after(14.4, () => rt.say('鳥居元忠', '城を明け渡せとの使いは追い返した。寄せ手が揃う前に打って出て、長束と玄以の屋敷を焼け', 4.2));
    rt.after(18.8, () => rt.say('松平家忠', '大手の門を出て、南西の屋敷へ！　火を掛けたら城へ戻るぞ', 4));
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
    depthStart(rt, { faction: 'ukita', flag: 'ukita', armor: WEST.armor, friends: () => [F.mine, F.ie, F.chika, ...(F.naiWest ? [] : [F.nai])], scale: 2.2, backing: false, fixedSpawn: true, dmg: 0.38, botSeek: 40 }, [
      // ⓪ 七月十九日：城方が打って出て、大手の外の長束・前田玄以の屋敷を焼く
      DP.move({ to: { x: YASHIKI.x + 2, z: YASHIKI.z - 2 }, obj: '大手の門を出て、長束と玄以の屋敷に火を掛けよ', label: '長束の屋敷', r: 8, max: 90,
        say: [['松平家忠', '打って出るぞ！　屋敷を敵の陣にさせるな']],
        ambush: { d: 24, say: ['長束の侍', '城兵が出てきたぞ！　屋敷を守れ'], foes: () => [keep('長束の屋敷の番兵', { x: YASHIKI.x - 8, z: YASHIKI.z + 14 }, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 2 }])] },
        onEnd: (rt2) => { this.burnYashiki(rt2); rt2.say('松平家忠', '火を掛けたぞ！　皆、城へ戻れ', 3.5); } }),
      // 時が飛ぶ：宇喜多が着き、寄せ手が段々に増える
      DP.rest({ dur: 6, heal: 0.5, banner: ['七月二十二日', '宇喜多秀家が着き、城を囲み始めた。三の丸の虎口へ'],
        say: [['松平家忠', '南の丘に宇喜多の旗！　寄せ手が日ごとに増えてゆく'], ['鳥居元忠', '三の丸の虎口で受けよ']],
        fn: (rt2) => this.camps(rt2, 1) }),
      // ① 七月二十二日：大手から寄せる宇喜多勢を、三の丸の虎口で押し返す
      DP.hold({ at: { x: SAN.x, z: SAN.z + 10 }, r: 14, dur: 70, title: '七月二十二日　大手', sub: '宇喜多勢が大手から寄せる', label: '三の丸の虎口', obj: '三の丸の虎口で、大手から寄せる宇喜多勢を押し返せ',
        say: [['鳥居元忠', '一歩も通すな。一日でも長く持ちこたえる事が、殿への土産ぞ']],
        waves: () => [
          { t: 2, say: ['宇喜多の侍', '城は小勢ぞ。一気に揉み潰せ！'], foes: () => [keep('宇喜多勢の先手', S, 'ukita', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 5 }])] },
          { t: 26, say: ['宇喜多の侍', '二の手、続け！　竹束を押し立てよ'], foes: () => [keep('宇喜多勢の二の手', SW, 'ukita', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 4 }])] },
          { t: 48, foes: () => [keep('宇喜多勢の三の手', S, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }])] },
        ],
        reward: '三の丸の虎口を守り抜いた' }),
      // ② 七月二十三日：小早川と島津が着く。島津が南東から大手の曲輪へ入る
      //   島津が入城を断られたという話は江戸時代の書物の伝えで確証が無い。台詞では事実と言い切らない
      DP.fight({ at: { x: 4, z: 54 }, title: '七月二十三日　島津勢', sub: '小早川と島津も着き、寄せ手は四万になった', obj: '大手の曲輪へ入った島津勢を討て', max: 150,
        say: [['島津の侍', '薩摩の鉄砲、撃ちかけよ！　築山の大筒に続け'], ['内藤家長', '島津が大手の曲輪に入ったぞ。三の丸の前で討て！']],
        foes: () => [keep('島津勢の先手', SE, 'shimazu', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 5 }], { morale: 97 })],
        later: [{ t: 45, say: ['島津の侍', '新手じゃ！　退くな、押せ！'], foes: () => [keep('島津勢の二の手', SE, 'shimazu', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }])] }],
        reward: '島津勢を大手から追い落とした' }),
      // 時が飛ぶ：画面の真ん中に日付と次の目標を出す（AT7）
      DP.rest({ dur: 6, heal: 0.6, banner: ['七月二十九日', '石田三成が着き、総攻め。二の丸の口へ回れ'],
        say: [['松平家忠', '石田治部が伏見に着いた。明日から総攻めじゃ'], ['鳥居元忠', '三の丸は家忠と近正に任せる。そなたらは二の丸の口を固めよ']],
        fn: (rt2) => this.camps(rt2, 3) }),
      // ③ 三の丸は家忠・近正が八月一日まで守る（史実）。主人公の手勢は二の丸の口へ回る（後ろから宇喜多勢が付け入る）
      DP.move({ to: { x: NI.x, z: NI.z + 2 }, obj: '三の丸を家忠に任せ、二の丸の口へ回れ', label: '二の丸の口', r: 9, max: 60,
        ambush: { d: 26, say: ['宇喜多の侍', '城兵が奥へ下がるぞ！　追え、付け入れ！'], foes: () => [keep('宇喜多勢の追い手', { x: 0, z: 66 }, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }])] } }),
      // ④ 八月一日 昼：松の丸の甲賀衆が寝返って火を放ち、四方から一斉に乗り込む（西＝甲賀・長束、南＝小早川、東＝島津が太鼓の丸へ）
      DP.hold({ at: { x: -10, z: -12 }, r: 14, dur: 75, title: '八月一日　昼', sub: '松の丸に内応の火。寄せ手が四方から乗り込む', label: '二の丸の西', obj: '松の丸から二の丸へ入る、寝返った甲賀衆と長束勢を食い止めよ',
        say: [['松平家忠', '松の丸が燃えておる！　甲賀衆が寝返ったぞ'], ['鳥居元忠', '四方から来るぞ。火に怯むな、まだ本丸がある']],
        waves: () => [
          { t: 2, say: ['長束の侍', '甲賀衆が門を開けたぞ！　二の丸へ雪崩れ込め'], foes: () => [keep('寝返った甲賀衆', MATSU, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 4 }]), keep('長束勢', { x: MATSU.x - 6, z: MATSU.z + 4 }, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 3 }])] },
          { t: 14, say: ['上林竹庵', '東の太鼓の丸にも島津が取り付いたぞ！'], foes: () => [keep('太鼓の丸へ寄せる島津勢', { x: TAIKO.x + 22, z: TAIKO.z + 6 }, 'shimazu', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }])] },
          { t: 30, say: ['小早川の侍', '小早川勢、二の丸の口を破れ！'], foes: () => [keep('小早川勢', { x: 0, z: 40 }, 'kobayakawa', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }])] },
          { t: 54, foes: () => [keep('長束勢の二の手', MATSU, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }])] },
        ],
        reward: '二の丸の西を守り抜いた' }),
      // 台詞が次の段へこぼれないよう、間を十秒とる
      DP.rest({ dur: 10, heal: 0.6, banner: ['八月一日　夕', '本丸だけが残った。本丸の口へ'],
        say: [['内藤家長', '家忠殿と近正殿、三の丸で討死！　竹庵殿も太鼓の丸で果てた。わしは西の丸で死ぬ'], ['鳥居元忠', '皆、本丸へ。徳川の鳥居、ここで最後を見せようぞ']],
        // 討死は家長の台詞で知らせた。使番の「討たれた」を遅れて重ねない（civ で大将討死の知らせを飛ばす）
        fn: (rt2) => { for (const n of ['松平家忠', '松平近正', '上林竹庵']) this.fall(rt2, n); this.naitoWest(rt2); } }),
      // ⑤ 本丸の口：寄せ手が四方から本丸へ。元忠は足が利かず、刀を杖に旗本の後ろで立つ（伝え）
      DP.hold({ at: { x: HON.x, z: HON.z + 6 }, r: 12, dur: 70, title: '本丸', sub: '鳥居元忠、最後の抵抗', label: '本丸の口', obj: '本丸の口で元忠殿の旗本と並び、攻め入る西軍を食い止めよ',
        say: [['鳥居元忠', '足は利かぬが、刀を杖にまだ立てる。徳川の鳥居ここにあり！']],
        waves: () => [
          { t: 2, say: ['宇喜多の侍', '本丸ぞ！　火の回らぬうちに乗っ取れ'], foes: () => [keep('本丸へ寄せる宇喜多勢', { x: 0, z: -6 }, 'ukita', [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 4 }])] },
          { t: 16, say: ['鳥居の侍', '西の丸が破られ、内藤殿が討死！　東の塀からも来るぞ'], foes: () => { this.naitoFall(rt); return [keep('西の丸から寄せる長束勢', { x: -40, z: -52 }, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }]), keep('東から寄せる島津勢', { x: 34, z: -46 }, 'shimazu', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }])]; } },
          { t: 32, foes: () => [keep('本丸へ寄せる小早川勢', { x: 12, z: -10 }, 'kobayakawa', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 4 }])] },
        ],
        reward: '本丸の口を守った' }),
      // ⑥ 雑賀孫一の鉄砲衆が本丸に斬り込む
      DP.fight({ at: HON, title: '雑賀孫一', sub: '鉄砲衆を連れて本丸へ斬り込む', obj: '本丸に斬り込んだ雑賀孫一の鉄砲衆を討て', max: 150,
        say: [['雑賀孫一', '鳥居殿はいずこ！　雑賀の鈴木孫三郎、見参！'], ['鳥居元忠', '旗本ども、雑賀の鉄砲を防げ！　わしはここで受ける']],
        // 孫一（鈴木重朝）は落城の後も生きた（1623 年没）。討てない将なので、倒す数を数える鉄砲衆とは別の組で本丸の口に立つ
        foes: () => { this.magoichi(rt); return [keep('雑賀孫一の鉄砲衆', { x: 0, z: -14 }, 'yatagarasu', [{ type: 'samurai', n: 6 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 8 }], { morale: 100, seek: 40 })]; },
        reward: '雑賀孫一の鉄砲衆と戦い抜いた' }),
    ], (rt2) => this.win(rt2));
  },

  // 段の間で果てる城方の将（使番の「討たれた」は重ねない）
  fall(rt, n) {
    const u = rt.army.units.find((x) => x.name === n && x.alive);
    if (u) { u.invuln = false; u.civ = true; rt.army.kill(u, null); }
  },
  // 内藤家長は「西の丸で死ぬ」と言って西の丸の持ち場へ戻る（主人公と本丸へは来ない。⑤で西の丸が破られて討死）
  naitoWest(rt) {
    const F = rt.flags, g = F.nai;
    if (F.naiWest || !g) return;
    F.naiWest = true;
    Object.assign(g, { anchor: { x: -40, z: -50 }, order: 'hold', fixed: true, aggro: 6, facing: Math.PI / 2 });
  },
  // ⑤：西の丸が破られ、家長と手の者は西の丸で果てる（寄せ手が西の丸に留まって組み合わず、本丸へ向かう）
  naitoFall(rt) {
    const F = rt.flags;
    this.naitoWest(rt);
    for (const u of (F.nai?.units || []).slice()) if (u.alive) { u.invuln = false; u.civ = true; rt.army.kill(u, null); }
  },

  // 雑賀孫一と旗本：二の丸の北の脇から本丸を向いて鉄砲衆を下知する（馬上・討てない）。土橋の道は塞がない
  magoichi(rt) {
    const F = rt.flags;
    if (F.magoG) return;
    F.magoG = enemyGroup(rt, { fixed: true, faction: 'yatagarasu', name: '雑賀孫一の旗本', anchor: { x: 13, z: -16 }, facing: Math.PI, order: 'hold', aggro: 2, width: 6, morale: 100, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '雑賀孫一', hat: 'kabuto_m', horse: true, invuln: true } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 2 }], { ...WEST, flag: 'yatagarasu' }));
  },

  // 長束・前田玄以の屋敷に火（七月十九日の出撃）
  burnYashiki(rt) {
    const F = rt.flags;
    if (F.yashikiBurned) return;
    F.yashikiBurned = true;
    if (rt.world.addFire) for (const [x, z] of HOUSES) rt.world.addFire(x, z, { size: 2.2, h: 2 });
  },

  // 寄せ手の陣は日付の段で着く（k=1：宇喜多。k=2：小早川・島津）
  camps(rt, k) {
    const F = rt.flags;
    if (k >= 1 && !F.ukitaCamp) F.ukitaCamp = camp(rt, '宇喜多秀家の本陣', CAMPS[0], 'ukita', '宇喜多秀家', [{ type: 'samurai', n: 16 }, { type: 'gun', n: 4 }], Math.PI, true);
    if (k >= 2 && !F.kobaCamp) {
      F.kobaCamp = camp(rt, '小早川秀秋の陣', CAMPS[1], 'kobayakawa', '小早川秀秋', [{ type: 'samurai', n: 10 }, { type: 'ashigaru', n: 6 }], Math.PI * 0.6);
      F.shimaCamp = camp(rt, '島津義弘の陣', CAMPS[2], 'shimazu', '島津義弘', [{ type: 'samurai', n: 8 }, { type: 'gun', n: 6 }], -Math.PI * 0.8);
    }
    // 七月二十九日：石田三成が伏見に着き、総攻めを下知する（床几に座る。旗は大一大万大吉）
    if (k >= 3 && !F.ishidaCamp) F.ishidaCamp = camp(rt, '石田三成の陣', CAMPS[3], 'ishida', '石田三成', [{ type: 'samurai', n: 10 }, { type: 'gun', n: 4 }], Math.atan2(-CAMPS[3].x, -CAMPS[3].z), true);
  },

  // 松の丸の甲賀衆が寝返る：城方の持ち場から消え、同じ所から「寝返った甲賀衆」として寄せる（④の波）
  turnKoka(rt) {
    const F = rt.flags;
    if (F.kokaTurned) return;
    F.kokaTurned = true;
    for (const u of (F.koka?.units || []).slice()) if (u.alive) rt.army.despawn(u);
  },

  // 八月一日の昼（午の刻）：火はまず松の丸から。まだ昼の光で、本丸と天守は燃えていない
  burnMatsu(rt) {
    const F = rt.flags;
    if (F.matsuBurned) return;
    F.matsuBurned = true;
    if (rt.world.addFire) for (const [x, z, s] of [[MATSU.x, MATSU.z, 2.4], [MATSU.x + 8, MATSU.z + 4, 2]]) rt.world.addFire(x, z, { size: s, h: 2 });
  },
  burn(rt) {
    const F = rt.flags;
    this.burnMatsu(rt);
    if (F.burned) return;
    F.burned = true;
    rt.world.setTime('dusk', true);   // 八月一日の夕へ時が飛ぶ段。移ろわせずに夕の光へ
    for (const [x, z, s] of [[NI.x - 12, NI.z - 6, 1.8], [HON.x, HON.z + 10, 2.2], [-9, -53, 3]]) {
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
    rt.banner('伏見城、炎上', '慶長五年八月一日　本丸に火が回る');
    rt.player.u.invuln = true;
    // 元忠は足が利かず、刀を杖に腰を下ろす。孫一は敬って腹を召すのを待ったと伝わる（言行録）
    if (F.toriiU) F.toriiU._crouch = true;
    rt.after(2, () => rt.say('鳥居元忠', '殿……ご武運を。この元忠、約束どおり伏見で果てまする', 4.2));
    rt.after(6.8, () => rt.say(nm(rt), '十日あまり、四万を縫い止めましたな。殿が西へ上られる時は稼げました', 4.2));
    rt.after(11.4, () => rt.say('雑賀孫一','鳥居殿、腹を召されるまで、ここでお待ち申す', 4.2));
    rt.after(16, () => rt.banner('鳥居元忠、討死', '城方の多くが本丸で果てた'));
    rt.after(21, () => rt.banner('血天井', '城方の血に染まった床板は、のちに京の寺の天井に上げられた'));
    rt.finish({}, 26);
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
    // 寄せ手が日付の段で着く（巻き戻しで段が飛んでも陣は揃える）
    if (D && D.i >= 1) this.camps(rt, D.i >= 5 ? 3 : D.i >= 3 ? 2 : 1);
    // 築山の大筒：宇喜多の着陣から落城まで、昼夜に城を撃つ
    if (D && D.on && D.i >= 2 && D.i <= 8 && rt.t > (F.cannonT || 0)) {
      F.cannonT = rt.t + 7 + Math.random() * 5;
      const y = rt.world.heightAt(TSUKIYAMA.x, TSUKIYAMA.z) + 3;
      sfx('thunder', 0.55);
      rt.army.smoke(TSUKIYAMA.x + (Math.random() - 0.5) * 8, y, TSUKIYAMA.z - 2, 0, -1, 1);
    }
    // 孫一は「雑賀の孫一、見参」と名乗って斬り込む。右上の目標で名を伏せない（伏せると「敵のいる方へ進め」に替わっていた）
    if (D && D.i >= 9 && !F.magoNamed) { F.magoNamed = true; revealName(rt, '雑賀孫一'); }
    // 八月一日 昼：松の丸の内応の火（④の段）。夕の段で本丸・天守へ火が回り、家長は西の丸へ戻る
    if (D && D.on && D.i >= 6) { this.turnKoka(rt); this.burnMatsu(rt); }
    if (D && D.on && D.i >= 7) { this.burn(rt); this.naitoWest(rt); }
    // 本丸の段：旗本が本丸の口へ出て戦う。元忠は足が利かず、刀を杖に旗本の後ろで立つ
    if (D && D.on && D.i >= 8 && !F.toriiOut && F.motochika) { F.toriiOut = true; if (F.toriiU) F.toriiU._crouch = false; F.motochika.anchor = { x: HON.x, z: HON.z }; F.motochika.aggro = 8; }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

k01_fushimi.force = (rt) => ({ a: Math.max(0, 1800 - (rt.flags.ak || 0) * 25), a0: 1800, b: Math.max(0, 40000 - (rt.flags.ek || 0) * 40), b0: 40000 });
k01_fushimi.sides = { a: { name: '徳川勢', mon: 'tokugawa' }, b: { name: '西軍', mon: 'ukita' } };
k01_fushimi.date = (rt) => (rt.flags.burned ? '慶長五年（1600）八月一日　夕・本丸に火' : rt.flags.matsuBurned ? '慶長五年（1600）八月一日　昼・松の丸に火' : '慶長五年（1600）七月　初秋・昼');
k01_fushimi.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k01_fushimi.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k01_fushimi.history = '慶長五年（1600）、徳川家康は会津の上杉景勝を討つため東へ発つ前に、京の入り口の伏見城を家臣の鳥居元忠に預けた。伝えでは、家康は「城を死守してくれ」と告げ、二人は別れの盃を交わしたという。七月、石田三成らが挙兵して西軍が成った。城方は七月十九日に打って出て、城の外の長束正家・前田玄以の屋敷を焼いた。寄せ手は日ごとに増え、二十二日に宇喜多秀家、二十三日に小早川秀秋らが着いて四万ほどになり、築山に据えた大筒や鉄砲で昼夜城を撃ち、堀を埋めて迫った。城には鳥居元忠・松平家忠・松平近正・内藤家長・上林竹庵ら千八百ほどしかいなかったが、十日あまり持ちこたえた。八月一日の昼、甲賀衆の内応で松の丸から火の手が上がり、寄せ手は四方から一斉に乗り込んだ。元忠は足が不自由で刀を杖に戦ったと伝わり、雑賀孫一（鈴木重朝）が敬って腹を切るのを待ち、首を取ったともいう。城は炎上して落ちた。城方の死者は三百数十とも八百とも全員とも伝わる。討死した者の血に染まった床板は、のちに京の寺々の天井に上げられ、血天井として今に残る。この足止めが、家康が東から戻って美濃へ進む時を稼いだ。\n島津義弘が初め城に入ろうとして断られたという話は江戸時代の書物の伝えで、確かではない。曲輪の並びと寸法は遊びのために縮めて復元したもので、内応や元忠の最期の細部は伝えにより異なる。';
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
STAGES.k01_fushimi = [['打って出て長束と玄以の屋敷を焼く'], ['三の丸の虎口で宇喜多勢を押し返す', dpAt(2)], ['大手の曲輪の島津勢を討つ', dpAt(3)], ['二の丸の口へ回る', dpAt(5)], ['寝返った甲賀衆と長束勢を食い止める', dpAt(6)], ['本丸の口で最後まで戦う', dpAt(8)], ['雑賀孫一の鉄砲衆を討つ', dpAt(9)]];

export { k01_fushimi };
export default k01_fushimi;
