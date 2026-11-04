// ======================================================================
// 徳川編 2　河田木曽川渡河・米野の戦い（慶長五年 1600・八月二十二日）　美濃への入り口、川を渡る戦
// 筋書きの正：docs/chapter3_tokugawa.md の「2. 河田木曽川渡河・米野」
// 清洲に集まった東軍の先鋒は、尾張から木曽川を渡って美濃へ入る。川は西軍（岐阜城の織田秀信方）の守りの線で、
// 渡河点の北岸には木造長政・百々綱家らの鉄砲と弓が並ぶ。池田輝政・浅野幸長らは河田の渡しを強行して渡り、
// 北岸の守りを崩し、米野で百々綱家の勢と衝突する。西軍は敗れて岐阜城へ退いた（平原の野戦にしない。川が主役）。
// 主人公は池田輝政の先手。浅瀬は細い（二か所）。深みは歩いて渡れず、浅瀬へ詰まる所に鉄砲が集まる。
// 段：①南岸の堤へ行く ②河田の渡しを渡り、北岸の木造具政の鉄砲組を討つ ③米野の百々綱家の隊を討つ ④岐阜への道で殿を討つ
// 11/3 kaito AP〜AT：見せかけの軍勢（addDistantArmy・clash）を全部やめ、見える兵は全部本物。兵の比は東軍一万八千・織田勢三千（六対一）。
//   総大将の織田秀信は川手の閻魔堂の本陣に残り戦場に出ない（討てる所に置かない）。池田輝政も堤の後ろの本陣で旗本に囲まれる。
//   旗はこの戦の家だけ：池田の揚羽蝶・浅野と山内は丸（紋の絵が無いので）・織田秀信方は木瓜。福島正則は上流の尾越から渡ったので河田に出さない。
//   難しさ：浅瀬は細く、北岸の鉄砲が浅瀬に詰まる所を撃つ（実の戦は東軍の大勝。手柄は渡りきる事）。
// 負け方：討たれる・刻限（段ごとの時間とは別の二十分の保険）。
// 向き：北が -z（美濃・岐阜）、南が +z（尾張・清洲）。木曽川は東西に流れ、浅瀬は x = -60（河田の渡し）と x = 80。
// 手本と出所：docs/battle_refs/k02_kawada.md。
// 地形：国土地理院の標高（dem_kawada.js・tools/dem.mjs の kawada）は低い平野の起伏だけ写し、川は手で掘る。水平は実の 1/6。
// ======================================================================
import { demSample } from './dem.js';
import DEM from './dem_kawada.js';
import { nobori, jinmaku, kagaribi, palisade } from './props.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, enemyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { routeTools } from './b_k_route.js';
import { timeslipField } from './timeslip_field.js';

// ---- 場所（ゲームの座標） ----
const START = { x: -60, z: 100 };      // 渡しの手前の野（味方と一緒に堤へ着く近さ）
const BANK = { x: -60, z: 34 };         // 南岸の堤（渡しの手前）
const FORD = { x: -60, z: 2 };          // 河田の渡し
const NORTH = { x: -60, z: -22 };       // 北岸の守り
const YONENO = { x: -38, z: -96 };      // 米野
const RETREAT = { x: -8, z: -190 };     // 岐阜へ退く道
const LIMIT = 1200;                     // 日が傾くまで（秒）。段ごとに b_depth の時間がある（AP の8）

const KISO = [[-300, 6], [-130, 3], [-60, 2], [20, -2], [100, -4], [300, 0]];
const FORDS = [{ x: -60, w: 9 }, { x: 80, w: 8 }];
const ROUTE = [[-60, 160], [-60, 132], [-60, 100], [-60, 56], [BANK.x, BANK.z], [-60, 14], [FORD.x, FORD.z], [-60, -10], [NORTH.x, NORTH.z], [-52, -50], [-44, -76], [YONENO.x, YONENO.z], [-26, -130], [-14, -165], [RETREAT.x, RETREAT.z]];

const IKEDA = { flag: 'ageha' };                                   // 池田の揚羽蝶
const ASANO = { flag: 'maru' };                                    // 浅野・山内（紋の絵が無いので丸）
const WEST = { armor: 0x2a2622, lace: 0x7a3a2a, flag: 'oda' };    // 織田秀信方の木瓜
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
  // 身の回りの合戦の跡（timeslip_field.js）。河田・木曽川：八月末（今の九月末）の渡し。岸の葦と濡れた泥、渡った跡の矢と槍
  timeslip: {
    wet: 0.45, dust: 0.25, trample: 0.3, debris: 1.1, arrows: 1, reeds: 0.5,
    grass: 0x8a9a56, grassTints: [0xffffff, 0xe6e0b8, 0xc8cc98], grassH: 1.15, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.9,
    flagColors: [0xe6dfcc, 0xcdac50, 0x5a4a3a],
  },
  spawn: { x: START.x + 2, z: START.z, heading: Math.PI },
  noWake: true,
  minutes: 20,
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
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    // 北岸の柵（渡しの口は開いて通れる）と篝火、南岸の池田の陣
    try {
      rt.scene.add(palisade(W, [-100, NORTH.z - 10, -67, NORTH.z - 10], { h: 2.2, solid: true }));
      rt.scene.add(palisade(W, [-53, NORTH.z - 10, -26, NORTH.z - 10], { h: 2.2, solid: true }));
    } catch (e) { console.warn(e); }
    for (const [x, z] of [[-80, NORTH.z - 12], [-40, NORTH.z - 12], [-96, -60]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    for (const [x, z] of [[-70, NORTH.z - 8], [-50, NORTH.z - 8]]) rt.scene.add(kagaribi(W, x, z));
    rt.scene.add(jinmaku(W, START.x + 20, START.z + 14, 12, 9, 4, { mon: 'ageha' }));
    for (const [x, z] of [[START.x + 12, START.z + 20], [START.x + 28, START.z + 20], [START.x + 34, START.z + 8]]) rt.scene.add(nobori(W, x, z, 'ageha', 6));
    // 見せかけの軍勢は置かない（AA・AF・AP9・AQ6）。見える兵は全部本物
    // ---- 東軍（河田の手）：池田輝政は堤の後ろの本陣で旗本に囲まれて動かない（O・AR3）。先手は始めから堤へ進む ----
    F.honjin = allyGroup(rt, { faction: 'oda', name: '池田輝政の本陣', anchor: { x: START.x + 20, z: START.z + 8 }, facing: Math.PI, width: 8, aggro: 3, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '池田輝政', invuln: true, horse: true } }, { type: 'samurai', n: 12 }, { type: 'gun', n: 4 }], IKEDA));
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: START.x, z: BANK.z - 2 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 5 }, { type: 'ashigaru', n: 22 }, { type: 'gun', n: 7 }], IKEDA));
    F.nagayoshi = allyGroup(rt, { faction: 'oda', name: '池田長吉の手', anchor: { x: START.x + 14, z: BANK.z - 2 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '池田長吉', invuln: true, horse: false } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 5 }], IKEDA));
    F.asano = allyGroup(rt, { faction: 'oda', name: '浅野幸長の先手', anchor: { x: START.x - 14, z: BANK.z }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '浅野幸長', invuln: true, horse: false } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 4 }, { type: 'bow', n: 3 }], ASANO));
    for (const g of [F.mine, F.nagayoshi, F.asano]) { g.defMult = 1.5; g.dmgMult = 1.1; g.aggro = 24; }
    // 東の浅瀬（x=80・小屋場島の側）を渡る山内一豊の手と、それを撃つ北岸の織田の鉄砲組。川越しに本物の兵どうしが撃ち合い斬り合う
    F.east = allyGroup(rt, { faction: 'oda', name: '山内一豊の手', anchor: { x: 80, z: 40 }, facing: Math.PI, width: 10, aggro: 12, noRout: true, order: 'attack', seekRange: 70, fixed: true },
      dress([{ type: 'busho', n: 1, o: { name: '山内一豊', invuln: true, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 5 }], ASANO));
    F.east.anchor = { x: 80, z: -14 };
    F.eastFoe = enemyGroup(rt, { fixed: true, faction: 'eiraku', name: '東の浅瀬の織田勢', anchor: { x: 80, z: -26 }, facing: 0, order: 'hold', aggro: 12, width: 10, morale: 92 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 5 }], WEST));
    F.east.dmgMult = 0.35; F.eastFoe.dmgMult = 0.3;
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x + 4, z: START.z - 2 }, Math.PI, [{ kind: 'spear', n: Math.min(n, 16) }]);
    W.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '河田の渡しで木曽川を渡り、米野の百々綱家の隊を討て', 'main');
    rt.say('池田輝政', '福島殿は上の尾越から渡る。我らは河田じゃ。先に渡って手柄を取れ', 4.4);
    rt.after(5, () => rt.say(nm(rt), '北の岸に木瓜の旗。柵の内に鉄砲が並んでおりまする', 3.6));
    // 始めから味方の先手が堤へ進む（本人だけが川の手前に着いて一人に見えない）
    rt.after(2, () => [F.asano, F.mine, F.nagayoshi].forEach((g, i) => { if (g && g.count) { g.calm = false; g.order = 'attack'; g.seekRange = 40; g.anchor = { x: BANK.x + (i - 1) * 14, z: FORD.z + 16 + (i % 2) * 5 }; } }));
    rt.after(9, () => rt.say('浅野幸長', '浅瀬は細い。詰まれば撃たれる。止まらず駆け抜けよ', 4));
    rt.after(13.4, () => rt.say('池田長吉', '岐阜の中納言（秀信）は川手の本陣じゃ。川の守りを破れば米野は近い', 4));
    rt.after(17.2, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    depthStart(rt, { faction: 'eiraku', flag: 'oda', armor: WEST.armor, friends: () => [F.mine, F.nagayoshi, F.asano], look: (list) => dress(list, WEST), scale: 1, backing: false, fixedSpawn: true, dmg: 0.3, botSeek: 40 }, [
      // ① 南岸の堤へ行く
      DP.move({ to: BANK, obj: '河田の渡しの手前の堤へ行け', label: '河田の渡し', r: 9, max: 90,
        say: [['池田の侍', '堤が見えた。北の柵に鉄砲が並んでおる']],
        ambush: { d: 36, say: ['浅野の侍', '向こう岸から撃ってきたぞ！　堤の陰に伏せよ'], foes: () => [keep('北岸の物見の鉄砲', { x: -60, z: NORTH.z }, [{ type: 'gun', n: 5 }, { type: 'ashigaru', n: 5 }])] } }),
      DP.rest({ dur: 5, heal: 0.9 }),
      // ② 河田の渡しを渡る
      DP.fight({ at: NORTH, title: '河田の渡し', sub: '浅瀬は細い。北の岸に木造具政の鉄砲', obj: '浅瀬を渡り、北岸の木造具政の鉄砲組を討て', max: 180,
        say: [['木造具政', '渡らせるな。浅瀬に入った所を撃て！']],
        foes: () => [keep('北岸の鉄砲組', NORTH, [{ type: 'busho', n: 1, o: { name: '木造具政', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 8 }, { type: 'bow', n: 4 }, { type: 'ashigaru', n: 8 }], { dz: -6, morale: 96 })],
        later: [{ t: 40, say: ['木造具政', '柵の内の者、出て槍を合わせよ！'], foes: () => [keep('柵の内の槍組', { x: -74, z: NORTH.z - 14 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }])] }],
        reward: '河田の渡しを渡った' }),
      DP.rest({ dur: 5, heal: 0.9 }),
      // ③ 米野
      DP.fight({ at: YONENO, title: '米野', sub: '百々綱家の隊が村の前に構える', obj: '米野の村の前の百々綱家の隊を討て', max: 200,
        say: [['百々綱家', '木造殿が崩れたか。米野で食い止める！'], ['浅野幸長', '川は越えた。ここを抜けば岐阜じゃ']],
        foes: () => [keep('米野の百々勢', YONENO, [{ type: 'busho', n: 1, o: { name: '百々綱家', hat: 'kabuto_m', horse: false } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 5 }], { morale: 96 })],
        later: [{ t: 45, say: ['飯沼長資', '飯沼勘平長資、二十一。手柄を取るは今ぞ！'], foes: () => [keep('飯沼長資の手', { x: YONENO.x + 16, z: YONENO.z - 10 }, [{ type: 'samurai', n: 1, o: { name: '飯沼長資', hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 7 }], { morale: 100 })] }],
        reward: '米野で百々綱家の隊を討った' }),
      DP.rest({ dur: 5, heal: 0.9 }),
      // ④ 岐阜へ退く敵の殿
      DP.fight({ at: RETREAT, title: '岐阜への道', sub: '退く織田勢の後ろを殿が守る', obj: '岐阜への道を北へ追い、殿の織田勢を討て', max: 150,
        say: [['池田輝政', '敵は岐阜城へ退くぞ。追え！']],
        foes: () => [keep('殿の織田勢', RETREAT, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 3 }], { morale: 94 })],
        reward: '殿を討ち、岐阜へ追い込んだ' }),
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
    rt.after(6.4, () => rt.say('浅野幸長', '尾越の福島殿より先に渡った。信長公の孫の城か、相手に不足はない', 4.4));
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
    // 河田の手が北岸へ渡ったら、東の浅瀬の山内の手も米野へ寄せる（自分だけが目標へ向かわない。AQ7）
    if (F.east && F.dp && F.dp.i >= 4 && !F.eastGo) { F.eastGo = true; F.east.anchor = { x: YONENO.x + 30, z: YONENO.z + 6 }; }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
    else if (F.begun && !F.warned && rt.t - F.t0 > LIMIT - 60) { F.warned = true; rt.say('池田の侍', '日が傾いてきた。急げ！', 3.5); }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '木造具政') rt.award((t) => { t.special = { label: '木造具政を討ち取った', pts: 20 }; }, '木造具政を討ち取った');
    if (v.name === '飯沼長資') rt.award((t) => { t.special = { label: '飯沼長資を討ち取った', pts: 20 }; }, '飯沼長資を討ち取った');
    if (v.name === '百々綱家') rt.award((t) => { t.special = { label: '百々綱家を討ち取った', pts: 20 }; }, '百々綱家を討ち取った');
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

k02_kawada.force = (rt) => ({ a: Math.round(18000 - (rt.flags.ak || 0) * 20), a0: 18000, b: Math.max(0, 3000 - (rt.flags.ek || 0) * 25), b0: 3000 });
k02_kawada.sides = { a: { name: '東軍', mon: 'ageha' }, b: { name: '織田勢', mon: 'oda' } };
k02_kawada.date = () => '慶長五年（1600）八月二十二日　夏・昼';
k02_kawada.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k02_kawada.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k02_kawada.history = '慶長五年（1600）八月、清洲に集まった東軍は、岐阜城の織田秀信を攻めるため木曽川を越えて美濃へ入ることにした。二十二日、池田輝政・浅野幸長らが河田の渡しから、福島正則・黒田長政・細川忠興らが上流の尾越から渡った。北岸には織田方の木造具政・百々綱家らが鉄砲を並べて守っていた（秀信は川手の閻魔堂の本陣）。東軍はおよそ一万八千、織田勢はおよそ三千。東軍は強行して渡り、米野で戦って西軍を破った。若武者の飯沼長資はここで討ち死にした。西軍は岐阜城へ退き、翌日の岐阜城攻めへ続いた。\n渡河点の位置や川の幅、浅瀬の数は遊びのために縮めて復元したもので、細部は推定である。木曽川の流れは当時と今とで大きく違う。';
k02_kawada.bushou = [{ name: '木造具政', g: /具政/ }, { name: '百々綱家', g: /綱家/ }, { name: '飯沼長資', g: /長資/ }];

k02_kawada.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, START.x, START.z - 4, 3);
};

const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
STAGES.k02_kawada = [['河田の渡しの堤へ行く'], ['北岸の木造具政を討つ', dpAt(2)], ['米野の百々綱家を討つ', dpAt(4)], ['岐阜への道で殿を討つ', dpAt(6)]];

export { k02_kawada };
export default k02_kawada;
