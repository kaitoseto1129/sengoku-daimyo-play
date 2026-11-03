// ======================================================================
// 徳川編 3　岐阜城の戦い（慶長五年 1600・八月二十二日〜二十三日）　関ヶ原の前の、東軍の最初の大きな城攻め
// 筋書きの正：docs/chapter3_tokugawa.md の「3. 岐阜城」
// 木曽川を渡った東軍は、池田輝政・浅野幸長らが河田から、福島正則・黒田長政・細川忠興らが尾越から岐阜へ迫る。
// 城主は織田秀信（信長の孫）。城下で戦い、金華山（稲葉山）の七曲りを登り、二の丸、本丸へ。秀信は降伏して城は落ちた。
// 昔、信長と藤吉郎が落とした稲葉山を、今度は徳川方で攻める（織田編の稲葉山を思い出させる台詞）。
// 主人公は東軍・池田輝政の手の先手。西の麓から大手（七曲り）を登る。ほかの手は北の百曲りから登って来る。
// 段：①城下を抜ける ②山麓の御殿・大手を破る ③七曲りを登る ④二の丸の百々綱家を崩す ⑤本丸の織田秀信
// 負け方：日が暮れ切る（六分半）。
// 向き：北が -z、東が +x（金華山の頂）。西の城下から東へ、山道を本丸（頂）へ登る。長良川は北。
// 地形：国土地理院の標高（dem_gifu.js・tools/dem.mjs の gifu）。水平は実の 1/4、高さは 0.15 倍。
// ======================================================================
import { demSample } from './dem.js';
import DEM from './dem_gifu.js';
import { nobori, jinmaku, kagaribi, tenshu, sumiyagura, yagura } from './props.js';
import { farSight } from './far_sight.js';
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
const START = { x: -196, z: 8 };        // 池田勢の寄せ口（城下の西の田）
const SHITA = { x: -166, z: 4 };        // 城下の入り口
const OTE = { x: -132, z: 0 };          // 山麓の御殿（大手）
const NANA = { x: -100, z: -8 };        // 七曲りの下
const NI = { x: -60, z: -2 };           // 二の丸
const HON = { x: 0, z: 0 };             // 本丸（山の頂）
const KARAME = { x: -6, z: -150 };      // 北から百曲りを登って来る福島勢の出所
const LIMIT = 390;                      // 日が暮れ切るまで（秒）

const ROUTE = [
  [-220, 8], [START.x, START.z], [-180, 6], [SHITA.x, SHITA.z], [-148, 2], [OTE.x, OTE.z], [-118, -4], [NANA.x, NANA.z], [-88, -14], [-78, -4],
  [-68, -14], [NI.x, NI.z], [-44, 2], [-30, -2], [-14, 0], [HON.x, HON.z],
];

const ODA = { armor: 0x2a2622, lace: 0x7a3a2a, flag: 'eiraku' };
const IKEDA = { flag: 'tokugawa' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---- 地形：金華山。実測の起伏を縮めて写し、曲輪は平らに均す ----
const XY = 4, SC = 0.15, FOOT = demSample(DEM, -760, 0);
function base(x, z) {
  const n = (demSample(DEM, x * XY, z * XY) - FOOT) * SC;
  return Math.max(-1.2, n) + 0.25 * Math.sin(x * 0.07) * Math.cos(z * 0.06);
}

const lv = (cx, cz, up = 0.4) => (b) => b(cx, cz) + up;
const PLAN = {
  mon: 'eiraku', name: '岐阜城', type: 'yama', year: 1600, gateSlope: 7, lifeNoFlags: true,
  kuruwa: [
    { id: 'ote', name: '山麓の御殿', level: lv(-132, 0), wall: 'saku', kind: 'san', poly: rectPoly(-142, -122, -12, 12), gapAt: [[-142, 0], [-122, 0]], gapW: 6, floor: false },
    { id: 'baba', name: '中腹の馬場', level: lv(-92, -6, 0.6), wall: 'saku', kind: 'koshi', poly: rectPoly(-100, -84, -12, 6), gapAt: [[-100, -8], [-84, -8]], gapW: 5 },
    { id: 'ni', name: '二の丸', level: lv(-60, -2, 0.6), wall: 'ishigaki', kind: 'ni', poly: rectPoly(-70, -50, -10, 8), gapAt: [[-70, -2], [-50, -2]], gapW: 5 },
    { id: 'hon', name: '本丸', level: lv(0, 0, 0.8), wall: 'ishigaki', kind: 'hon', poly: rectPoly(-12, 12, -10, 10), gapAt: [[-12, 0]], gapW: 5 },
  ],
  koguchi: [
    { id: 'ote_w', name: '御殿の口', from: 'out', to: 'ote', kind: 'hira', at: [-142, 0], rot: -Math.PI / 2, w: 5 },
    { id: 'ote_e', name: '御殿の奥の口', from: 'ote', to: 'out', kind: 'hira', at: [-122, 0], rot: Math.PI / 2, w: 5 },
    { id: 'baba_w', name: '馬場の口', from: 'out', to: 'baba', kind: 'hira', at: [-100, -8], rot: -Math.PI / 2, w: 4.4 },
    { id: 'baba_e', name: '馬場の奥の口', from: 'baba', to: 'out', kind: 'hira', at: [-84, -8], rot: Math.PI / 2, w: 4.4 },
    { id: 'ni_w', name: '二の丸の口', from: 'out', to: 'ni', kind: 'hira', at: [-70, -2], rot: -Math.PI / 2, w: 4.4 },
    { id: 'ni_e', name: '二の丸の奥の口', from: 'ni', to: 'out', kind: 'hira', at: [-50, -2], rot: Math.PI / 2, w: 4.4 },
    { id: 'hon_w', name: '本丸の口', from: 'out', to: 'hon', kind: 'hira', at: [-12, 0], rot: -Math.PI / 2, w: 4.4 },
  ],
  paths: [{ id: 'nana', kind: 'ote', pts: ROUTE.slice(3) }],
};
let HEIGHT_FN = null;
function height(x, z) { if (!HEIGHT_FN) HEIGHT_FN = heightOf(PLAN, base, 3); return HEIGHT_FN(x, z); }

const { way: gifuWay } = routeTools(ROUTE, 'k03');

function flags(rt) {
  const W = rt.world;
  rt.scene.add(jinmaku(W, START.x - 6, START.z, 12, 9, 4, { mon: 'tokugawa' }));
  for (const [x, z] of [[START.x - 2, START.z - 7], [START.x - 2, START.z + 7], [START.x + 4, START.z - 14]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 6));
  for (const [x, z] of [[START.x + 2, START.z - 4], [START.x + 2, START.z + 5]]) rt.scene.add(kagaribi(W, x, z));
  for (const [x, z] of [[-136, -8], [-128, 10], [-92, -10], [-62, 6], [-56, -10], [-8, -8], [8, 8]]) rt.scene.add(nobori(W, x, z, 'eiraku', 5));
  for (const [x, z] of [[OTE.x + 6, OTE.z - 6], [NI.x, NI.z - 6], [HON.x - 6, HON.z]]) rt.scene.add(kagaribi(W, x, z));
}

const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, width: o.width || 8, list, seek: o.seek || 45, morale: o.morale || 92 });

const k03_gifu = {
  // 身の回りの合戦の跡（timeslip_field.js）。岐阜城：八月末の城下と山道。乾いた土埃、倒れた槍と矢、晩夏の草
  timeslip: {
    wet: 0.1, dust: 0.6, trample: 0.3, debris: 1.1, arrows: 0.9, maxSlope: 0.3,
    grass: 0x80984e, grassTints: [0xffffff, 0xe4e6c0, 0xd0c898], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a3a],
  },
  spawn: { x: START.x + 4, z: START.z, heading: Math.PI / 2 },
  noWake: true,
  minutes: 6,
  camLookAt: (rt, u) => (u.pos.x < -125 ? { x: -118, z: 0, up: 12 } : null),   // 城下の坂では目線を上げ、御殿の門の櫓と中腹の曲輪を見上げる
  world: {
    seed: 1600822,
    time: 'day',
    groundHalf: 290,
    moveLim: 250,
    paths: [ROUTE.slice(0, 6), ROUTE.slice(5)],
    height,
    moveWay: gifuWay,
    tint(x, z, h, c) {
      if (distToPolyline(x, z, ROUTE) < 3.2) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      if (h < 3 && x < -150) { c.setRGB(c.r * 0.6 + 0.26, c.g * 0.6 + 0.22, c.b * 0.5 + 0.06); return; }
      if (h > 14) c.setRGB(c.r * 0.72, c.g * 0.84, c.b * 0.68);
    },
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 7 || PLAN.kuruwa.some((k) => x > k.poly[0][0] - 2 && x < k.poly[1][0] + 2 && z > k.poly[0][1] - 2 && z < k.poly[2][1] + 2),
    trees: 520,
    tufts: 2200,
    treeDensity: (x, z) => {
      const d = distToPolyline(x, z, ROUTE);
      if (d < 9) return 0;
      if (x < -150) return 0.1;
      if (Math.abs(z) < 16) return 0.25;   // 城下から頂の天守と二の丸の石垣が見通せるよう、尾根筋の木はまばらに
      return 1.15;
    },
    groves: [{ x: -110, z: 30, r: 18, n: 22, kind: 'sugi' }, { x: -40, z: -34, r: 18, n: 24, kind: 'sugi' }, { x: 30, z: 20, r: 18, n: 24, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? x > 120 || z < -170 : x < -250),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    const castle0 = rt.scene.children.length;
    F.C = buildCastlePlan(rt, PLAN, { baseHeight: base, edgeW: 3, team: 1, perch: false, interiorGuards: false });
    flags(rt);
    // 金華山の頂の天守（信長が建て、秀信の代まで残った四重の望楼型）。西の城下から山の上に見える目印
    // 山の曲輪に籠もる織田の兵（軽い作り）。その曲輪へ登ると退く
    F.hold = [W.addDistantArmy({ x: -92, z: -16, w: 14, d: 8, count: 90, facing: -Math.PI / 2, armor: ODA.armor, team: 1, mon: 'eiraku', host: false, seed: 16031 }),
      W.addDistantArmy({ x: -60, z: -16, w: 16, d: 8, count: 110, facing: -Math.PI / 2, armor: ODA.armor, team: 1, mon: 'eiraku', host: false, seed: 16032 })];
    try { rt.scene.add(tenshu(W, 7, 1, { floors: 4, b: 8, base: 3, borou: true, old: true, rot: -Math.PI / 2, team: 1, name: '岐阜城の天守', where: '本丸の天守' })); } catch (e) { console.warn(e); }
    // 山麓の御殿の門の脇の白壁の隅櫓（石垣の台。発掘で巨石の石垣が出た居館）・中腹の馬場の物見櫓・二の丸の石垣の隅櫓（城下の田から、山の麓から上へ城の構えが重なって見える）
    try { rt.scene.add(sumiyagura(W, -137, 9.5, { w: 5, d: 4.4, base: 1.8, rot: -Math.PI / 2 }), sumiyagura(W, -137, -9.5, { w: 5, d: 4.4, base: 1.8, rot: -Math.PI / 2 }), yagura(W, -97, 3, { mon: 'eiraku', team: 1 }), sumiyagura(W, -67, 5, { w: 6, d: 5, base: 1.2, rot: -Math.PI / 2 })); } catch (e) { console.warn(e); }
    // 山の上の曲輪と天守は、城下の田からでも霧に沈めない（金華山の頂に城が見える）
    farSight(rt.scene.children.slice(castle0), { W, ground: { x: -40, z: 0, r: 110 } });
    // 西の城下に控える東軍の大軍（軽い作り）と、山肌に並ぶ織田の旗
    W.addDistantArmy({ x: START.x - 36, z: START.z - 4, w: 50, d: 36, count: 380, facing: Math.PI / 2, armor: 0x24221f, team: 0, mon: 'tokugawa', seed: 16021 });
    W.addDistantArmy({ x: START.x - 8, z: START.z + 44, w: 36, d: 22, count: 220, facing: Math.PI / 2, armor: 0x24221f, team: 0, mon: 'tokugawa', seed: 16022 });
    // ---- 東軍：池田輝政の本陣と先手 ----
    F.honjin = allyGroup(rt, { faction: 'oda', name: '池田輝政の本陣', anchor: { x: START.x - 8, z: START.z }, facing: Math.PI / 2, width: 4, aggro: 3, order: 'hold', fixed: true, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '池田輝政', invuln: true, horse: false } }, { type: 'samurai', n: 3 }], IKEDA));
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: START.x + 8, z: START.z + 3 }, facing: Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 5 }], IKEDA));
    F.saki = allyGroup(rt, { faction: 'oda', name: '浅野幸長の先手', anchor: { x: START.x + 10, z: START.z - 6 }, facing: Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '浅野幸長', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 3 }], IKEDA));
    for (const g of [F.mine, F.saki]) { g.defMult = 1.6; g.dmgMult = 1.1; g.aggro = 24; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x + 2, z: START.z + 6 }, Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);
    W.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '日が暮れ切る前に、岐阜城を落とせ', 'main');
    rt.say('池田輝政', '木曽川は渡った。次は岐阜じゃ。城主は信長公の孫、秀信殿よ', 4.5);
    rt.after(5, () => rt.say(nm(rt), '稲葉山……昔、信長公と藤吉郎殿が落とした山ですな', 3.6));
    rt.after(9, () => rt.say('浅野幸長', 'その山を、今度は我らが攻める。福島殿・黒田殿は北の百曲りから登る', 4));
    rt.after(13.5, () => rt.say('池田輝政', '我らは大手、七曲りじゃ。城下を抜けよ。かかれ！', 3.6));
    rt.after(17.5, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    depthStart(rt, { faction: 'eiraku', flag: 'eiraku', armor: ODA.armor, friends: () => [F.mine, F.saki], look: (list) => dress(list, ODA), scale: 1, backing: false, fixedSpawn: true, dmg: 0.3, botSeek: 40 }, [
      // ① 城下
      DP.fight({ at: SHITA, title: '城下', sub: '町家の陰に織田の鉄砲が潜む', obj: '城下の織田勢を払え', max: 55,
        say: [['浅野の侍', '家の陰に鉄砲じゃ！　固まって押せ']],
        foes: () => [keep('城下の守り', SHITA, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 4 }])],
        reward: '城下を抜けた' }),
      DP.rest({ dur: 5, heal: 0.9 }),
      // ② 山麓の御殿・大手
      DP.fight({ at: OTE, title: '山麓の御殿', sub: '大手の木戸は七曲りの入り口', obj: '山麓の大手を破れ', max: 60,
        say: [['木造長政', '麓の御殿は捨てるな。ここで足を止めよ']],
        foes: () => [keep('大手の守り', OTE, [{ type: 'busho', n: 1, o: { name: '木造長政', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }])],
        reward: '大手を破った' }),
      DP.rest({ dur: 5, heal: 0.9 }),
      // ③ 七曲り
      DP.move({ to: NANA, obj: '七曲りを登れ', label: '七曲り', r: 8, max: 50,
        say: [['池田の侍', '稲葉山は急じゃ。足元に気を付けよ']],
        ambush: { d: 30, say: ['浅野の侍', '曲がり角に伏兵じゃ！'], foes: () => [keep('山道の伏兵', { x: -84, z: -20 }, [{ type: 'ashigaru', n: 7 }, { type: 'samurai', n: 1 }])] } }),
      DP.rest({ dur: 5, heal: 0.9 }),
      // ④ 二の丸
      DP.fight({ at: NI, title: '二の丸', sub: '石垣の上に百々綱家', obj: '二の丸の百々綱家を崩せ', max: 65,
        say: [['百々綱家', '木曽川で破れても、岐阜は渡さぬ！']],
        foes: () => [keep('二の丸の守り', NI, [{ type: 'busho', n: 1, o: { name: '百々綱家', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }], { morale: 98 })],
        reward: '二の丸を落とした' }),
      DP.rest({ dur: 5, heal: 0.9 }),
      // ⑤ 本丸
      DP.fight({ at: HON, title: '本丸', sub: '金華山の頂、織田秀信の天守', obj: '本丸の織田秀信を追い詰めよ', max: 80,
        say: [['織田秀信', '祖父信長が築いた城、簡単には渡さぬ！']],
        foes: () => [keep('本丸の守り', HON, [{ type: 'busho', n: 1, o: { name: '織田秀信', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }], { morale: 100, dx: -5 })],   // 本丸の東は天守。守りは天守の前（西）に
        reward: '本丸に攻め入った' }),
    ], (rt2) => this.win(rt2));
  },

  // 福島正則・黒田長政の手：二の丸の段で、北の百曲りから登って来る
  kita(rt) {
    const F = rt.flags;
    if (F.kita) return;
    F.kita = allyGroup(rt, { faction: 'oda', name: '福島正則の手', anchor: { x: KARAME.x, z: KARAME.z }, facing: 0, width: 10, aggro: 12, noRout: true, order: 'attack', seekRange: 60 },
      dress([{ type: 'busho', n: 1, o: { name: '福島正則', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], IKEDA));
    F.kita.anchor = { x: HON.x - 4, z: HON.z - 24 };
    F.kita.dmgMult = 0.7;
    rt.after(1.5, () => rt.say('福島正則', '百曲りは福島が登る。池田殿に遅れるな', 3.4));
    rt.scene.add(nobori(rt.world, KARAME.x + 4, KARAME.z + 4, 'tokugawa', 6));
    rt.army.play('toki', KARAME, 1.4);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '岐阜城を落とした', pts: 40 }; }, '岐阜城が落ちた');
    sfx('horagai', 0.9);
    rt.banner('岐阜城、落城', '慶長五年八月　織田秀信、降る');
    rt.player.u.invuln = true;
    rt.after(2, () => rt.say('織田秀信', '……これまで。命ばかりは頂きたい。城を明け渡す', 4));
    rt.after(6.5, () => rt.say('池田輝政', '信長公の孫を斬るには忍びぬ。助命を申し出よう', 4.2));
    rt.after(11, () => rt.say(nm(rt), '稲葉山が、またひとつ代わりました。次は関ヶ原にございますな', 4.2));
    rt.finish({}, 16);
  },

  lose(rt) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('日が暮れ切った', '城はまだ落ちぬ');
    rt.say('池田輝政', '日が暮れたか。今日のうちに落とせなんだ', 4);
    rt.finish({ failureReason: '日が暮れるまでに本丸を落とせなかった' }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    depthTick(rt, dt);
    const D = F.dp;
    if (D && D.on && D.i >= 3) this.kita(rt);
    if (F.hold && D && D.on) F.hold.forEach((h, i) => { if (h && D.i >= 2 + i && h.rout) { h.rout({ hideAfter: 20 }); F.hold[i] = null; } });
    if (D && D.on && D.i >= 4 && !F.dusk) { F.dusk = true; rt.world.setTime('dusk'); }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
    else if (F.begun && !F.warned && rt.t - F.t0 > LIMIT - 60) { F.warned = true; rt.say('池田の侍', '西の空が赤い！　日が暮れる、急げ', 3.5); }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '織田秀信') rt.award((t) => { t.special = { label: '織田秀信を追い詰めた', pts: 30 }; }, '織田秀信を追い詰めた');
    if (v.name === '百々綱家') rt.award((t) => { t.special = { label: '百々綱家を討ち取った', pts: 20 }; }, '百々綱家を討ち取った');
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

k03_gifu.force = (rt) => ({ a: Math.round(18000 - (rt.flags.ak || 0) * 20), a0: 18000, b: Math.max(0, 6500 - (rt.flags.ek || 0) * 25), b0: 6500 });
k03_gifu.sides = { a: { name: '東軍', mon: 'tokugawa' }, b: { name: '織田勢', mon: 'eiraku' } };
k03_gifu.date = (rt) => (rt.flags.dusk ? '慶長五年（1600）八月　夏・夕暮れ' : '慶長五年（1600）八月　夏・昼');
k03_gifu.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k03_gifu.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k03_gifu.history = '慶長五年（1600）八月、尾張の清洲に集まった東軍は、先に木曽川を渡って美濃へ入った。八月二十二日、池田輝政・浅野幸長らが河田から、福島正則・黒田長政・細川忠興らが尾越から岐阜城へ迫った。城主の織田秀信は織田信長の孫で、西軍に付いて籠城した。金華山（稲葉山）の城は急な山道（七曲り・百曲り）が幾筋もあり、東軍はいくつもの方向から攻め登って、二十三日に秀信は降伏した。秀信は助命されて高野山へ送られた。\nこの城はかつて信長と羽柴秀吉が斎藤氏から奪った稲葉山城である。曲輪の並びと寸法は遊びのために縮めて復元したもので、攻め口の細かい道筋は推定である。';
k03_gifu.bushou = [{ name: '織田秀信', g: /秀信/ }, { name: '百々綱家', g: /綱家/ }];

k03_gifu.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, START.x + 6, START.z, 3);
};

const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
STAGES.k03_gifu = [['城下を抜ける'], ['山麓の大手を破る', dpAt(1)], ['七曲りを登る', dpAt(2)], ['二の丸の百々綱家を崩す', dpAt(3)], ['本丸の織田秀信を追い詰める', dpAt(4)]];

export { k03_gifu };
export default k03_gifu;
