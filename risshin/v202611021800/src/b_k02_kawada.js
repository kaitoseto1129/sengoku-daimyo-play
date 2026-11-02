// ======================================================================
// 徳川編 2　河田木曽川渡河・米野の戦い（慶長五年 1600・八月二十二日）　美濃への入り口、川を渡る戦
// 筋書きの正：docs/chapter3_tokugawa.md の「2. 河田木曽川渡河・米野」
// 清洲に集まった東軍の先鋒は、尾張から木曽川を渡って美濃へ入る。川は西軍（岐阜城の織田秀信方）の守りの線で、
// 渡河点の北岸には木造長政・百々綱家らの鉄砲と弓が並ぶ。池田輝政・浅野幸長らは河田の渡しを強行して渡り、
// 北岸の守りを崩し、米野で百々綱家の勢と衝突する。西軍は敗れて岐阜城へ退いた（平原の野戦にしない。川が主役）。
// 主人公は池田輝政の先手。浅瀬は細い（二か所）。深みは歩いて渡れず、浅瀬へ詰まる所に鉄砲が集まる。
// 段：①南岸の堤へ詰める ②河田の渡しを渡り、北岸の守りを崩す ③米野で百々綱家を崩す ④岐阜へ退く敵を追う
// 負け方：討たれる・刻限（七分）。
// 向き：北が -z（美濃・岐阜）、南が +z（尾張・清洲）。木曽川は東西に流れ、浅瀬は x = -60（河田の渡し）と x = 80。
// 地形：国土地理院の標高（dem_kawada.js・tools/dem.mjs の kawada）は低い平野の起伏だけ写し、川は手で掘る。水平は実の 1/6。
// ======================================================================
import { demSample } from './dem.js';
import DEM from './dem_kawada.js';
import { nobori, jinmaku, kagaribi, palisade } from './props.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { routeTools } from './b_k_route.js';
import { clash } from './b_sekigahara.js';

// ---- 場所（ゲームの座標） ----
const START = { x: -60, z: 100 };      // 渡しの手前の野（味方と一緒に堤へ着く近さ）
const BANK = { x: -60, z: 34 };         // 南岸の堤（渡しの手前）
const FORD = { x: -60, z: 2 };          // 河田の渡し
const NORTH = { x: -60, z: -22 };       // 北岸の守り
const YONENO = { x: -38, z: -96 };      // 米野
const RETREAT = { x: -8, z: -190 };     // 岐阜へ退く道
const LIMIT = 420;

const KISO = [[-300, 6], [-130, 3], [-60, 2], [20, -2], [100, -4], [300, 0]];
const FORDS = [{ x: -60, w: 9 }, { x: 80, w: 8 }];
const ROUTE = [[-60, 160], [-60, 132], [-60, 100], [-60, 56], [BANK.x, BANK.z], [-60, 14], [FORD.x, FORD.z], [-60, -10], [NORTH.x, NORTH.z], [-52, -50], [-44, -76], [YONENO.x, YONENO.z], [-26, -130], [-14, -165], [RETREAT.x, RETREAT.z]];

const EAST = { flag: 'tokugawa' };
const WEST = { armor: 0x2a2622, lace: 0x7a3a2a, flag: 'eiraku' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));

// ---- 地形：低い平野。堤が川に沿って走り、田が広がる ----
const XY = 6, D0 = demSample(DEM, 0, 0);
function height(x, z) {
  const n = Math.max(-1, Math.min(1.5, (demSample(DEM, x * XY, z * XY) - D0) * 0.25));
  let h = n + 0.25 * Math.sin(x * 0.05 + 0.6) * Math.cos(z * 0.04);
  const d = distToPolyline(x, z, KISO);
  h += 1.3 * Math.exp(-(((d - 30) / 5) ** 2));    // 川の両岸の堤
  return h;
}

const { way: kawadaWay } = routeTools(ROUTE, 'k02');
const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, width: o.width || 10, list, seek: o.seek || 50, morale: o.morale || 90 });

const k02_kawada = {
  spawn: { x: START.x + 2, z: START.z, heading: Math.PI },
  noWake: true,
  minutes: 6,
  world: {
    seed: 1600822,
    time: 'day',
    groundHalf: 290,
    moveLim: 250,
    paths: [ROUTE],
    height,
    moveWay: kawadaWay,
    streams: [{ pts: KISO, w: 12, depth: 2.4, fords: FORDS }],
    waterSlow: true,
    tint(x, z, h, c) {
      if (distToPolyline(x, z, ROUTE) < 3) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      if (distToPolyline(x, z, KISO) < 34) { c.setRGB(c.r * 0.7 + 0.12, c.g * 0.7 + 0.1, c.b * 0.6 + 0.06); return; }
      c.setRGB(c.r * 0.7 + 0.2, c.g * 0.7 + 0.18, c.b * 0.5 + 0.05);   // 刈り入れ前の田
    },
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 8,
    trees: 120,
    tufts: 2600,
    treeDensity: (x, z) => (distToPolyline(x, z, KISO) < 40 ? 0.9 : Math.abs(x + 60) > 70 ? 0.7 : 0.15),
    groves: [{ x: 40, z: 70, r: 14, n: 14, kind: 'sugi' }, { x: -130, z: -60, r: 14, n: 14, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? z < -240 : z > 220),
  },

  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    // 北岸の柵と篝火、南岸の東軍の陣
    try { rt.scene.add(palisade(W, [-100, NORTH.z - 10, -26, NORTH.z - 10], { h: 2.2 })); } catch (e) { console.warn(e); }
    for (const [x, z] of [[-80, NORTH.z - 12], [-40, NORTH.z - 12], [-60, NORTH.z - 18], [-96, -60]]) rt.scene.add(nobori(W, x, z, 'eiraku', 6));
    for (const [x, z] of [[-68, NORTH.z - 8], [-52, NORTH.z - 8]]) rt.scene.add(kagaribi(W, x, z));
    rt.scene.add(jinmaku(W, START.x + 14, START.z + 6, 12, 9, 4, { mon: 'tokugawa' }));
    for (const [x, z] of [[START.x - 8, START.z + 8], [START.x + 8, START.z + 16], [START.x + 22, START.z]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 6));
    // 南に控える東軍の大軍と、北岸・米野の西軍（軽い作り）
    W.addDistantArmy({ x: START.x - 40, z: START.z + 36, w: 56, d: 36, count: 400, facing: Math.PI, armor: 0x24221f, team: 0, mon: 'tokugawa', seed: 16021 });
    W.addDistantArmy({ x: START.x + 50, z: START.z + 30, w: 50, d: 30, count: 300, facing: Math.PI, armor: 0x24221f, team: 0, mon: 'tokugawa', seed: 16022 });
    W.addDistantArmy({ x: -110, z: -50, w: 48, d: 24, count: 280, facing: 0, armor: 0x2a2622, team: 1, mon: 'eiraku', seed: 16023 });
    W.addDistantArmy({ x: 90, z: -60, w: 56, d: 26, count: 300, facing: 0, armor: 0x2a2622, team: 1, mon: 'eiraku', seed: 16024 });
    // 渡しの左右の浅瀬から先に渡った東軍と北岸の西軍が組み合う（軽い大軍。堤の手前から川越しに乱戦が見える）
    F.cl = [clash(rt, { x: -18, z: -17, facing: Math.PI, w: 52, gap0: 10, seed: 16025, noRout: true, noWake: true,
      A: { flag: 'tokugawa', armor: 0x24221f, count: 260, team: 0, faction: 'tokugawa' }, B: { flag: 'eiraku', armor: WEST.armor, count: 220, team: 1, faction: 'oda' } }),
    clash(rt, { x: -106, z: -14, facing: Math.PI, w: 46, gap0: 10, seed: 16026, noRout: true, noWake: true,
      A: { flag: 'tokugawa', armor: 0x24221f, count: 220, team: 0, faction: 'tokugawa' }, B: { flag: 'eiraku', armor: WEST.armor, count: 200, team: 1, faction: 'oda' } })];
    // 北岸の柵の奥に構える木造・百々の兵（軽い作り。渡しを渡りきると退く）
    F.northHost = W.addDistantArmy({ x: -60, z: -38, w: 36, d: 8, count: 160, facing: 0, armor: WEST.armor, team: 1, mon: 'eiraku', host: false, seed: 16029 });
    // ---- 東軍：池田輝政の本陣と先手、浅野・福島の手（先手は始めから南岸の堤に並ぶ。本人だけが川の手前に着いて一人に見えない） ----
    F.honjin = allyGroup(rt, { faction: 'oda', name: '池田輝政の本陣', anchor: { x: START.x + 12, z: START.z + 2 }, facing: Math.PI, width: 4, aggro: 3, order: 'hold', fixed: true, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '池田輝政', invuln: true, horse: false } }, { type: 'samurai', n: 3 }], EAST));
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: START.x, z: BANK.z - 2 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 6 }], EAST));
    F.asano = allyGroup(rt, { faction: 'oda', name: '浅野幸長の先手', anchor: { x: START.x - 14, z: BANK.z }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '浅野幸長', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 3 }], EAST));
    F.fuku = allyGroup(rt, { faction: 'oda', name: '福島正則の手', anchor: { x: START.x + 14, z: BANK.z - 2 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '福島正則', invuln: true, horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 4 }], EAST));
    for (const g of [F.mine, F.asano, F.fuku]) { g.defMult = 1.5; g.dmgMult = 1.1; g.aggro = 24; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x + 4, z: START.z - 2 }, Math.PI, [{ kind: 'spear', n: Math.min(n, 16) }]);
    W.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '木曽川を渡り、米野の敵を崩せ', 'main');
    rt.say('池田輝政', '尾張は固めた。これより木曽川を渡って美濃へ入る', 4.2);
    rt.after(4.8, () => rt.say(nm(rt), '北の岸に敵の旗が並んでおりまする。鉄砲もありそうで', 3.6));
    // 始めから味方の先手が堤へ歩き出す（本人だけが川の手前に着いて一人に見えない）
    rt.after(2, () => [F.asano, F.mine, F.fuku].forEach((g, i) => { if (g && g.count) { g.calm = false; g.order = 'attack'; g.seekRange = 40; g.anchor = { x: BANK.x + (i - 1) * 14, z: FORD.z + 16 + (i % 2) * 5 }; } }));
    rt.after(8.8, () => rt.say('浅野幸長', '浅瀬は河田の渡しだけじゃ。細い。詰まれば撃たれるぞ', 4));
    rt.after(13.2, () => rt.say('福島正則', '詰まろうが渡る。川を越えねば岐阜も関ヶ原もない。かかれ！', 3.8));
    rt.after(17.2, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    depthStart(rt, { faction: 'eiraku', flag: 'eiraku', armor: WEST.armor, friends: () => [F.mine, F.asano, F.fuku], look: (list) => dress(list, WEST), scale: 1, backing: false, fixedSpawn: true, dmg: 0.3, botSeek: 40 }, [
      // ① 南岸の堤へ詰める
      DP.move({ to: BANK, obj: '南岸の堤まで進め', label: '渡しの手前', r: 9, max: 60,
        say: [['池田の侍', '岸が見えた。北の柵に鉄砲が並んでおる']],
        ambush: { d: 36, say: ['浅野の侍', '向こう岸から撃ってきたぞ！　伏せよ'], foes: () => [keep('北岸の物見の鉄砲', { x: -60, z: NORTH.z }, [{ type: 'gun', n: 5 }, { type: 'ashigaru', n: 5 }])] } }),
      // ② 河田の渡しを渡る
      DP.rest({ dur: 5, heal: 0.9 }),
      DP.fight({ at: NORTH, title: '河田の渡し', sub: '浅瀬は細い。北の岸に鉄砲と弓が並ぶ', obj: '河田の渡しを渡り、北岸の守りを崩せ', max: 85,
        say: [['木造長政', '渡らせるな。浅瀬に入った所を撃て！']],
        foes: () => [keep('北岸の鉄砲組', NORTH, [{ type: 'busho', n: 1, o: { name: '木造長政', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 2 }, { type: 'gun', n: 7 }, { type: 'bow', n: 4 }, { type: 'ashigaru', n: 6 }], { dz: -6, morale: 96 })],
        reward: '河田の渡しを渡った' }),
      // ③ 米野
      DP.rest({ dur: 5, heal: 0.9 }),
      DP.fight({ at: YONENO, title: '米野', sub: '岐阜から出た百々綱家の勢', obj: '米野の百々綱家を崩せ', max: 80,
        say: [['百々綱家', '木造め、持ちこたえられなんだか。米野で食い止める！'], ['浅野幸長', '川は越えた。もう一押しで岐阜じゃ']],
        foes: () => [keep('米野の百々勢', YONENO, [{ type: 'busho', n: 1, o: { name: '百々綱家', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 4 }], { morale: 96 })],
        reward: '米野で百々綱家を崩した' }),
      // ④ 岐阜へ退く敵を追う
      DP.rest({ dur: 5, heal: 0.9 }),
      DP.move({ to: RETREAT, obj: '岐阜へ退く敵を追え', label: '岐阜への道', r: 9, max: 60,
        say: [['池田輝政', '敵は岐阜城へ退いた。追え！']],
        ambush: { d: 30, say: ['福島の侍', '殿の敵じゃ。後ろを守る足軽が踏み止まっておるぞ'], foes: () => [keep('殿の足軽', { x: -22, z: -170 }, [{ type: 'ashigaru', n: 7 }, { type: 'samurai', n: 1 }])] } }),
    ], (rt2) => this.win(rt2));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '木曽川を渡り、米野で勝った', pts: 40 }; }, '木曽川を渡り、米野で勝った');
    sfx('horagai', 0.9);
    rt.banner('米野の戦い　勝ち', '西軍は岐阜城へ退いた');
    rt.player.u.invuln = true;
    rt.after(2, () => rt.say('池田輝政', '木曽川は越えた。敵は城に籠もる。次は岐阜じゃ', 4));
    rt.after(6.4, () => rt.say('福島正則', '信長公の孫の城か。相手に不足はない', 4));
    rt.after(10.8, () => rt.say(nm(rt), '稲葉山を、また攻めることになりましたな', 4));
    rt.finish({}, 15);
  },

  lose(rt) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('渡れなかった', '川の守りは崩せなかった');
    rt.say('池田輝政', '日が傾く。今日は退く', 4);
    rt.finish({ failureReason: '刻限までに木曽川を渡りきれなかった' }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    depthTick(rt, dt);
    if (F.northHost && F.dp && F.dp.i >= 2) { if (F.northHost.rout) F.northHost.rout({ hideAfter: 20 }); F.northHost = null; }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '木造長政') rt.award((t) => { t.special = { label: '木造長政を討ち取った', pts: 20 }; }, '木造長政を討ち取った');
    if (v.name === '百々綱家') rt.award((t) => { t.special = { label: '百々綱家を討ち取った', pts: 20 }; }, '百々綱家を討ち取った');
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

k02_kawada.force = (rt) => ({ a: Math.round(18000 - (rt.flags.ak || 0) * 20), a0: 18000, b: Math.max(0, 3000 - (rt.flags.ek || 0) * 25), b0: 3000 });
k02_kawada.sides = { a: { name: '東軍', mon: 'tokugawa' }, b: { name: '織田勢', mon: 'eiraku' } };
k02_kawada.date = () => '慶長五年（1600）八月二十二日　夏・昼';
k02_kawada.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k02_kawada.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k02_kawada.history = '慶長五年（1600）八月、清洲に集まった東軍は、岐阜城の織田秀信を攻めるため木曽川を越えて美濃へ入ることにした。二十二日、池田輝政・浅野幸長らが河田の渡しから、福島正則・黒田長政・細川忠興らが上流の尾越から渡った。北岸には織田方の木造長政・百々綱家らが鉄砲を並べて守っていたが、東軍は強行して渡り、米野で戦って西軍を破った。西軍は岐阜城へ退き、翌日の岐阜城攻めへ続いた。\n渡河点の位置や川の幅、浅瀬の数は遊びのために縮めて復元したもので、細部は推定である。木曽川の流れは当時と今とで大きく違う。';
k02_kawada.bushou = [{ name: '木造長政', g: /長政/ }, { name: '百々綱家', g: /綱家/ }];

k02_kawada.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, START.x, START.z - 4, 3);
};

const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
STAGES.k02_kawada = [['南岸の堤へ詰める'], ['河田の渡しを渡る', dpAt(1)], ['米野で百々綱家を崩す', dpAt(2)], ['岐阜へ退く敵を追う', dpAt(3)]];

export { k02_kawada };
export default k02_kawada;
