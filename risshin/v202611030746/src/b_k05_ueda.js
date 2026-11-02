// ======================================================================
// 徳川編 5　第二次上田合戦（慶長五年九月・1600）　秀忠軍が上田で足止めされ、関ヶ原に間に合わない
// 筋書きの正：docs/chapter3_tokugawa.md の「5. 第二次上田合戦」
// 中山道を西へ向かう徳川秀忠の三万八千が、上田城の真田昌幸・信繁に行く手を阻まれた。長男の信之は徳川方（父・弟と分かれた）。
// 真田は城下・城門・神川を使い、小勢で挑発して退く。徳川の先手が追って城下で乱れ、城の門と町屋の伏兵、信繁の反撃を受ける。
// 攻めに時を失ううちに、家康から「関ヶ原へ急げ」の使者が着く。秀忠軍は神川の東へ退く。
// 主人公は本多忠政の隊の侍大将（榊原康政・真田信之・仙石秀久が並ぶ）。史実どおり城は落ちない。勝ち方＝生きて神川の東へ退く（殿）。
// 段：①神川を渡って城下へ ②挑発に乗って追い、城下で乱れる ③城門の前で鉄砲と伏兵を受け、信繁の反撃に耐える ④急げの命で神川の東へ退く
// 負け方：討たれる・刻限（七分）。
// 向き：北が -z。上田城は原点の北、東が +x（神川と染屋台の秀忠本陣）、西と南は千曲川へ落ちる崖。
// 地形：国土地理院の標高（dem_ueda.js・tools/dem.mjs の ueda）。ゲームの 1 が実の 4m。
// ======================================================================
import DEM from './dem_ueda.js';
import { demSample } from './dem.js';
import { nobori, yagura, hut, tawara, dobei, sumiyagura } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm, wallLine } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick } from './b_depth.js';
import { gone, uS, uA, uG, uB, dress, gunLine, busho, makeLose, makeBot, setStages } from './b_k_help.js';

const C = { x: -10, z: -30 };                  // 上田城の中心
const GATE = { x: 22, z: -30 };                // 大手の門（東向き）
const TOWN = { x: 62, z: -20 };                // 城下の町屋
const FORD = { x: 112, z: 0 };                 // 神川の浅瀬
const SPAWN = { x: 168, z: 6 };
const RETREAT = { x: 140, z: 4 };              // 神川の東の岸
const LIMIT = 420;
const RIVER = [[108, -260], [112, -80], [106, 60], [110, 260]];

const SANADA = { flag: 'sanada', armor: 0x8e1f16 };
const TK = { flag: 'tokugawa' };
const XY = 4, DEM0 = demSample(DEM, C.x * XY, C.z * XY);
function height(x, z) {
  let h = (demSample(DEM, x * XY, z * XY) - DEM0) * 0.4;
  h += 0.18 * Math.sin(x * 0.05) * Math.cos(z * 0.04);
  return h;
}

const k05_ueda = {
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  noWake: true,
  minutes: 7,
  foeHit: 1.05,
  world: {
    seed: 1600908,
    time: 'day',
    groundHalf: 260,
    height,
    waterSlow: true,
    streams: [{ pts: RIVER, w: 12, depth: 1.8 }],
    paths: [[[SPAWN.x + 40, 8], [SPAWN.x, 6], [FORD.x + 6, 2], [TOWN.x, TOWN.z + 10], [GATE.x + 8, GATE.z]]],
    tint(x, z, h, c) {
      c.setRGB(c.r * 0.52 + 0.24, c.g * 0.5 + 0.2, c.b * 0.4 + 0.08);   // 秋の刈田
      if (Math.hypot(x - C.x, z - C.z) < 40) c.setRGB(c.r * 0.7 + 0.1, c.g * 0.65 + 0.08, c.b * 0.55 + 0.05);
    },
    clear: (x, z) => x > -30 && x < 200 && Math.abs(z) < 70,
    trees: 220,
    tufts: 2600,
    treeDensity: (x, z) => (x < -30 || Math.abs(z) > 80 ? 1 : 0.12),
    groves: [{ x: 84, z: 46, r: 10, n: 12 }, { x: 70, z: -66, r: 10, n: 12 }],
    fleeOut: (x, z, team) => (team === 1 ? x < -40 : x > 230),
  },

  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    // ---- 上田城：土塀・大手門・櫓。門は壊せない（城は落とせない） ----
    wallLine(rt, [[GATE.x, GATE.z - 30], [GATE.x, GATE.z - 4]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, segLen: 5, h: 2.4 });
    wallLine(rt, [[GATE.x, GATE.z + 4], [GATE.x, GATE.z + 30]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, segLen: 5, h: 2.4 });
    wallLine(rt, [[GATE.x, GATE.z - 30], [C.x - 30, GATE.z - 30], [C.x - 30, GATE.z + 30], [GATE.x, GATE.z + 30]], { team: 1, hp: 1e9, name: '城の土塀', mesh: dobei, segLen: 5, h: 2.4 });
    for (const [x, z] of [[GATE.x - 3, GATE.z - 28], [GATE.x - 3, GATE.z + 28], [C.x - 28, GATE.z - 28]]) rt.scene.add(yagura(W, x, z, { mon: 'sanada', team: 1 }));
    rt.scene.add(sumiyagura(W, GATE.x - 2, GATE.z - 8, { w: 6, d: 5, base: 1.4 }), sumiyagura(W, GATE.x - 2, GATE.z + 8, { w: 6, d: 5, base: 1.4 }));
    for (const [x, z] of [[GATE.x - 10, GATE.z - 12], [GATE.x - 10, GATE.z + 12], [C.x, C.z]]) rt.scene.add(nobori(W, x, z, 'sanada', 7));
    // ---- 城下の町屋と田：真田の伏兵が潜む ----
    for (const [x, z, w, d, r] of [[TOWN.x - 8, TOWN.z - 10, 9, 6, 0.1], [TOWN.x + 6, TOWN.z - 8, 8, 6, -0.1], [TOWN.x - 4, TOWN.z + 14, 9, 6, 0.2], [TOWN.x + 10, TOWN.z + 12, 8, 5, 0]]) rt.scene.add(hut(W, x, z, w, d, r));
    rt.scene.add(tawara(W, TOWN.x + 20, TOWN.z, 0.3, 4));
    // ---- 徳川の陣：染屋台の秀忠の本陣、大軍、川の東 ----
    camp(rt, { x: 210, z: -20, facing: -Math.PI / 2, team: 0, faction: 'tokugawa', mon: 'tokugawa', armor: 0x24221f,
      general: { name: '徳川秀忠', hat: 'kabuto_m', haori: 0x2a2a3a }, guard: 12, reserve: 120, runTo: { x: 170, z: 0 } });
    for (const [x, z] of [[190, -30], [190, 18], [176, -4]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 7));
    KIT.farVillage(rt, 190, 100, { rot: -Math.PI / 2, n: 5, fields: 6, seed: 45 });
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KIT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    F.eastDA = [DA(200, 60, 36, 30, 320, -Math.PI / 2, 0x24221f, 'tokugawa', 51, 'spear'), DA(210, -70, 36, 30, 320, -Math.PI / 2, 0x24221f, 'sakakibara', 52, 'mixed'), DA(240, 0, 40, 30, 340, -Math.PI / 2, 0x24221f, 'tokugawa', 53, 'gun')];
    F.moatDA = DA(C.x + 10, C.z - 14, 24, 14, 160, Math.PI / 2, SANADA.armor, 'sanada', 54, 'gun');   // 城内の兵（軽い作り）

    // ---- 味方：本多忠政の隊（主人公）・榊原康政の隊・真田信之の隊・仙石秀久の隊 ----
    F.honda = allyGroup(rt, { faction: 'tokugawa', name: '本多忠政の隊', anchor: { x: SPAWN.x - 4, z: SPAWN.z }, facing: -Math.PI / 2, width: 12, aggro: 8, noRout: true, formation: 'yari' },
      dress([busho('本多忠政', { invuln: true }), uS(3), uA(18), uG(6)], TK));
    F.saka = allyGroup(rt, { faction: 'tokugawa', name: '榊原康政の隊', anchor: { x: SPAWN.x - 2, z: SPAWN.z - 22 }, facing: -Math.PI / 2, width: 12, aggro: 8, noRout: true, formation: 'yari' },
      dress([busho('榊原康政', { invuln: true }), uS(2), uA(16), uB(5)], { flag: 'sakakibara' }));
    F.nobu = allyGroup(rt, { faction: 'tokugawa', name: '真田信之の隊', anchor: { x: SPAWN.x - 2, z: SPAWN.z + 22 }, facing: -Math.PI / 2, width: 10, aggro: 8, noRout: true, formation: 'yari' },
      dress([busho('真田信之', { invuln: true, hat: 'kabuto_f' }), uS(2), uA(12)], SANADA));
    F.sengoku = allyGroup(rt, { faction: 'tokugawa', name: '仙石秀久の隊', anchor: { x: SPAWN.x - 12, z: SPAWN.z + 10 }, facing: -Math.PI / 2, width: 10, aggro: 8, noRout: true, formation: 'yari' },
      dress([busho('仙石秀久', { invuln: true }), uS(2), uA(12), uG(4)], TK));
    for (const g of [F.honda, F.saka, F.nobu, F.sengoku]) { g.defMult = 1.5; g.dmgMult = 1.1; g.aggro = 24; }
    KIT.backOf(rt, F.honda, { flag: 'tokugawa', armor: 0x24221f, kind: 'spear', w: 22, depth: 10, count: 150, gap: 4, seed: 85 });
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: SPAWN.x - 6, z: SPAWN.z + 4 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '本多隊を率いて上田城下へ進み、真田を破れ', 'main');
    rt.banner('上田', '慶長五年九月　信濃・上田城');
    rt.say('榊原康政', '見よ、上田の城。昌幸・信繁の父子が籠っておる。城は小さいぞ、一日で落とせよう', 4);
    rt.after(4.4, () => rt.say('真田信之', '父は戦上手じゃ。軽く見てはなりませぬ。私が弟の相手を……', 3.8));
    rt.after(8.6, () => rt.say('本多忠政', '殿の下知じゃ。神川を渡り、城下へ進め！', 3.4));
    rt.after(11.5, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t; F.step = 1;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    const ctx = { faction: 'toyotomi', flag: 'sanada', armor: SANADA.armor, dmg: 0.4, mass: 170, scale: 1.4, look: (l) => dress(l, SANADA),
      friends: () => [F.honda, F.saka, F.nobu, F.sengoku].filter((g) => g && g.count && !g.routed), botSeek: 40 };
    depthStart(rt, ctx, [
      // ① 神川を渡って城下へ。町屋の端に真田の小勢が出て、挑発して退く
      DP.move({ to: { x: TOWN.x + 26, z: 0 }, label: '城下', r: 10, max: 70, obj: '神川を渡り、城下の町屋まで進め',
        say: [['本多忠政', '川を渡れ！　城下の町屋を押さえよ！']],
        ambush: { d: 36, say: ['足軽', '町屋の影に真田の兵が！　笑うて退いていくぞ！'], foes: () => [{ name: '真田の挑発隊', from: { x: TOWN.x, z: TOWN.z + 4 }, list: [uS(2), uA(10), uG(3)], mass: 70, morale: 55, noRout: 10 }] },
        onEnd: (rt2) => this.taunt(rt2) }),
      // ② 挑発に乗って追い、城下で乱れる：真田は小路から横を突く
      DP.rest({ dur: 5, heal: 0.9 }),
      DP.fight({ at: { x: TOWN.x - 6, z: TOWN.z }, title: '城下', sub: '追えば追うほど、小路に入っていく', obj: '城下の真田の兵を追い払え', max: 80,
        say: [['榊原康政', '逃がすな！　城門まで追え！']],
        foes: () => [{ name: '町屋の真田の兵', from: { x: TOWN.x - 18, z: TOWN.z - 6 }, list: [uS(2), uA(8), uG(3)], mass: 90 }],
        later: [{ t: 16, say: ['足軽', '横の小路から槍が！　味方が乱れておる！'], foes: () => [{ name: '小路の真田の槍', from: { x: TOWN.x - 4, z: TOWN.z - 30 }, list: [uS(2), uA(10)], mass: 120 }] }],
        reward: '城下の真田の兵を追った', onEnd: (rt2) => this.disorder(rt2) }),
      // ③ 城門の前：鉄砲に撃たれ、信繁の反撃に耐える
      DP.rest({ dur: 5, heal: 0.9 }),
      DP.hold({ at: { x: GATE.x + 26, z: GATE.z + 4 }, dur: 70, r: 16, label: '城門の前', title: '城門', sub: '門の上から鉄砲が並ぶ',
        obj: '門の前で踏みとどまり、信繁の反撃に耐えよ',
        waves: [
          { t: 4, say: ['足軽', '門の上と櫓から撃ってくる！　竹束を前へ！'], foes: () => [gunLine('城門の鉄砲', { x: GATE.x + 8, z: GATE.z - 6 }, 9)] },
          { t: 26, say: ['足軽', '六文銭の旗！　信繁が城から打って出た！'], foes: () => [{ name: '真田信繁の隊', from: { x: GATE.x + 6, z: GATE.z + 10 }, list: [busho('真田信繁', { hat: 'kabuto_f', haori: 0x7a1a12 }), uS(4), uA(14), uG(4)], mass: 220, noRout: 30, dmg: 0.4 }] },
          { t: 48, say: ['足軽', '北の田から伏兵じゃ！　囲まれる！'], foes: () => [{ name: '田の伏兵', from: { x: GATE.x + 40, z: GATE.z - 40 }, list: [uS(2), uA(10), uG(3)], mass: 140 }] },
        ],
        reward: '門の前で踏みとどまった', onEnd: (rt2) => this.order(rt2) }),
      // ④ 関ヶ原へ急げ：神川の東へ退く。信繁・昌幸の追い討ち
      DP.rest({ dur: 5, heal: 0.9 }),
      DP.hold({ at: RETREAT, dur: 60, r: 16, label: '神川の東岸', title: '退け', sub: '秀忠は関ヶ原へ急ぐ',
        obj: '殿として神川の東へ退き、追う真田を止めよ',
        waves: [
          { t: 6, say: ['足軽', '真田が神川まで追ってくる！　堰を切ったぞ、水が来る！'], foes: () => [{ name: '追う真田の兵', from: { x: FORD.x - 24, z: -6 }, list: [uS(2), uA(12)], mass: 150, dmg: 0.4 }] },
          { t: 30, say: ['足軽', '昌幸の鉄砲衆じゃ！　河原から撃ってくる！'], foes: () => [gunLine('河原の真田の鉄砲衆', { x: FORD.x - 12, z: 18 }, 9)] },
        ],
        reward: '殿を務め、秀忠軍を退かせた' }),
    ], (rt2) => this.win(rt2));
  },

  taunt(rt) {
    const F = rt.flags;
    F.step = 2;
    rt.banner('城下', '真田の兵は笑うて小路へ消えた');
    rt.say('真田の兵', '徳川の衆は足が遅いのう！　城まで来てみよ！', 3.6);
    rt.after(3.8, () => rt.say('仙石秀久', '小童どもが……！　追え、追え！', 3));
    for (const m of F.eastDA) m.advance(18, 10, {});
  },

  disorder(rt) {
    const F = rt.flags;
    F.step = 3;
    sfx('taiko', 0.9);
    rt.banner('先手、乱れる', '狭い城下で隊列が崩れた');
    rt.say('榊原康政', '隊が詰まったぞ！　門の前で立て直せ！', 3.4);
    for (const g of [F.saka, F.sengoku]) if (!gone(g)) g.morale -= 20;
  },

  // 関ヶ原へ急げの使者（必ず）
  order(rt) {
    const F = rt.flags;
    F.step = 4;
    sfx('horagai', 0.9);
    rt.banner('急使', '家康の使者が着いた　関ヶ原へ急げ');
    rt.say('使者', '大御所のお下知！　美濃へ急がれよ！　上田にかかずらうな！', 4);
    rt.after(4.4, () => rt.say('徳川秀忠', 'ならぬ……退け！　神川を越えて、中山道を西へ急ぐ！', 3.6));
    rt.after(8.4, () => rt.say(nm(rt), 'しんがりじゃ！　真田を神川で止めよ！', 3.4));
    for (const g of [F.saka, F.nobu, F.sengoku]) if (!gone(g)) { g.order = 'move'; g.dest = { x: RETREAT.x + 20, z: g.center().z }; }
    for (const m of F.eastDA) m.retreat(16, 14);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '上田で殿を務めた', pts: 40 }; }, '殿を務め、秀忠軍を退かせた');
    rt.player.u.invuln = true;
    rt.banner('秀忠軍、退く', '上田城は落ちなかった');
    rt.say('真田昌幸', '徳川の三万八千を、わずかな兵で九日もとどめたぞ。ははは', 4);
    rt.after(5, () => rt.say('徳川秀忠', '間に合うまい……関ヶ原には、間に合うまい', 4));
    rt.after(10, () => rt.say('真田信之', '父上、弟よ……敵となって、なおも見事な戦でござった', 4));
    rt.finish({}, 16);
  },

  lose: makeLose('秀忠軍の先手は潰えた', '上田城下で崩れた', '城下に取り残された……！　皆、散れ！', '足軽'),

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    if (F.ending) return;
    depthTick(rt, dt);
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt, '刻限までに神川の東へ退けなかった');
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
    if (v.type === 'busho' && v.team === 1) {
      rt.say('足軽', `${v.name}が深手じゃ！　真田の者が担いで引いていく！`, 3);
      if (v.group) { v.group.noRout = false; v.group.morale -= 40; }
      rt.award((t) => { t.special = { label: `${v.name}に深手を負わせた`, pts: 30 }; }, `${v.name}に深手を負わせた`);
    }
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が城へ引いていく！`, 2.5);
  },
};

// 両軍の総勢：秀忠軍およそ三万八千、上田城の真田勢は二千五百ほど
k05_ueda.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, Math.round(38000 - (F.ak || 0) * 40)), a0: 38000, b: Math.max(0, 2500 - (F.ek || 0) * 10), b0: 2500 };
};
k05_ueda.sides = { a: { name: '徳川秀忠軍', mon: 'tokugawa' }, b: { name: '真田勢 上田城', mon: 'sanada' } };
k05_ueda.date = () => '慶長五年（1600）九月　信濃国 上田・晴';
k05_ueda.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '寄せの下知まで待つ' : '');
k05_ueda.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k05_ueda.history = '慶長五年（1600）、会津征伐から引き返した徳川秀忠は、三万八千の軍を率いて中山道を西へ進んだ。信濃の上田城には、豊臣方（西軍）に付いた真田昌幸と次男・信繁が籠っていた。長男の信之は徳川方で、真田家は父・弟と長男に分かれていた。秀忠は降伏を勧めたが昌幸は時を稼ぎ、九月上旬に戦いが始まった。真田は城下で挑発して退き、追った徳川の先手が乱れた所を城門の鉄砲と伏兵、信繁の反撃が襲ったと伝わる。九月八日ごろまで攻めあぐねる間に、家康から「急ぎ美濃へ」の使者が着き、秀忠軍は上田をあきらめて西へ急いだ。秀忠は関ヶ原の決戦（九月十五日）に間に合わなかった。\n戦いの経過の細部（神川の堰の話、城下の挑発の言葉など）は伝えによる。';
k05_ueda.bushou = [{ name: '真田信繁', g: /信繁/ }, { name: '真田信之', g: /信之/ }];
k05_ueda.botBrain = makeBot({ x: SPAWN.x - 10, z: SPAWN.z });

setStages('k05_ueda', [['神川を渡り、城下へ進む', 0], ['挑発に乗って城下で追う', 2], ['城門の前で鉄砲と信繁の反撃に耐える', 3], ['急げの命で神川の東へ退く', 4]]);

export { k05_ueda };
export default k05_ueda;
