// ======================================================================
// 徳川編 4　杭瀬川の戦い（慶長五年九月十四日・1600）　関ヶ原の前日の前哨戦。徳川方（東軍）が負ける
// 筋書きの正：docs/chapter3_tokugawa.md の「4. 杭瀬川」
// 赤坂に着いた東軍の前に、大垣の西軍が出てきた。島左近の少数が杭瀬川の向こうで刈田をして東軍を挑発し、
// 退くように見せる。中村一栄の隊・有馬豊氏の隊が川を渡って追う。葦の中に伏せた宇喜多の明石全登の鉄砲と、島左近の本隊が反撃。
// 中村隊は崩れ、有馬隊が川端で受け止めて、東軍は損害を受けて退く。西軍の士気が上がる（翌日が関ヶ原）。
// 主人公は中村一栄の隊の侍大将。史実どおり追撃は失敗する。勝ち方＝川を越えて生きて退き、川端の有馬隊のもとへ戻る（殿）。
// 段：①川を渡り島左近の囮を追う ②葦の伏兵に囲まれ、耐える ③川端へ退く（有馬豊氏の隊が受ける）
// 負け方：討たれる・刻限（六分）。
// 向き：東が +x（東軍の陣・赤坂）、西が −x（大垣の西軍）。杭瀬川は南北に流れる。
// 地形：国土地理院の標高（dem_kuisegawa.js・tools/dem.mjs の kuisegawa）。ゲームの 1 が実の 4m。北の高みは赤坂の岡山。
// ======================================================================
import DEM from './dem_kuisegawa.js';
import { demSample } from './dem.js';
import { nobori, palisade, hut, tawara } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick } from './b_depth.js';
import { clamp01, gone, uS, uA, uG, dress, gunLine, busho, makeLose, makeBot, setStages } from './b_k_help.js';
import { timeslipField } from './timeslip_field.js';

const SPAWN = { x: 98, z: 6 };
const FORD = { x: 42, z: 0 };                   // 杭瀬川の浅瀬
const BAIT = { x: 14, z: 0 };                   // 島左近が刈田をしている所
const REED = { x: -52, z: 0 };                  // 葦の原（伏兵）
const BANK = { x: 66, z: 4 };                   // 川の東の岸（有馬隊が受ける）
const LIMIT = 360;
const RIVER = [[46, -260], [41, -90], [44, 60], [48, 260]];

const SHIMA = { flag: 'ishida', armor: 0x3a3430 };
const NAKA = { flag: 'tokugawa' };
const XY = 4, DEM0 = demSample(DEM, 0, 0);
function height(x, z) {
  let h = (demSample(DEM, x * XY, z * XY) - DEM0) * 0.5;
  h += 0.2 * Math.sin(x * 0.05) * Math.cos(z * 0.04);
  h += 1.2 * gauss(x, z, 74, 0, 90);                 // 東の岸の堤
  return h;
}

const k04_kuisegawa = {
  // 身の回りの合戦の跡（timeslip_field.js）。杭瀬川：九月半ば（今の十月半ば）の刈田と川岸。岸の葦と泥、追い討ちの跡
  timeslip: {
    wet: 0.35, dust: 0.3, trample: 0.3, debris: 1.1, arrows: 0.9, reeds: 0.45,
    grass: 0xa49c66, grassTints: [0xffffff, 0xeadcb0, 0xc8c898], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  noWake: true,
  minutes: 6,
  foeHit: 1.05,
  world: {
    seed: 1600914,
    time: 'day',
    groundHalf: 260,
    height,
    waterSlow: true,
    muddy: 0.2,
    streams: [{ pts: RIVER, w: 12, depth: 1.6 }],
    paths: [[[SPAWN.x + 40, 8], [SPAWN.x, 6], [FORD.x + 8, 2]]],
    tint(x, z, h, c) {
      // 九月の刈田と葦。西ほど湿って暗い
      c.setRGB(c.r * 0.55 + 0.24, c.g * 0.5 + 0.2, c.b * 0.4 + 0.08);
      if (x < -30 && Math.abs(z) < 60) c.setRGB(c.r * 0.8, c.g * 0.95, c.b * 0.7);
    },
    clear: (x, z) => x > -90 && x < 150 && Math.abs(z) < 60,
    trees: 150,
    tufts: 2800,
    treeDensity: (x, z) => (Math.abs(z) > 70 ? 1 : 0.15),
    groves: [{ x: REED.x - 4, z: -34, r: 10, n: 14 }, { x: REED.x - 6, z: 38, r: 10, n: 14 }],
    fleeOut: (x, z, team) => (team === 1 ? x < -190 : x > 210),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    // ---- 東軍の陣（赤坂）：家康の本陣の旗、竹束、遠くに大軍 ----
    camp(rt, { x: 170, z: -30, facing: -Math.PI / 2, team: 0, faction: 'tokugawa', mon: 'tokugawa', armor: 0x24221f,
      general: { name: '徳川家康', hat: 'kabuto_m', haori: 0x2a2a3a }, guard: 10, reserve: 0, runTo: { x: 130, z: 0 } });
    for (const [x, z] of [[118, -14], [118, 14], [132, 0]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 6));
    rt.scene.add(hut(W, 150, 26, 8, 5, 0.2), tawara(W, 112, 4, 0.3, 4));
    KIT.farVillage(rt, 150, 90, { rot: -Math.PI / 2, n: 5, fields: 6, seed: 41 });
    // 大軍（軽い作り）：赤坂の東軍と、大垣の西軍
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KIT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    F.eastDA = [DA(190, 40, 40, 26, 300, -Math.PI / 2, 0x24221f, 'todo', 31, 'spear'), DA(200, -80, 40, 30, 300, -Math.PI / 2, 0x24221f, 'tokugawa', 32, 'mixed')];
    F.westDA = [DA(-170, 30, 50, 26, 320, Math.PI / 2, SHIMA.armor, 'ishida', 33, 'gun'), DA(-190, -60, 40, 26, 280, Math.PI / 2, 0x6a3a22, 'ukita', 34, 'spear')];
    // 大垣の西軍の陣の旗（遠くに）
    for (const [x, z, k] of [[-120, -10, 'ishida'], [-126, 24, 'ukita'], [-112, 44, 'ishida']]) rt.scene.add(nobori(W, x, z, k, 7));
    rt.scene.add(palisade(W, [-100, -36, -100, 60], { h: 2.6 }));
    // 刈田をする島左近の兵のしるし（藁の山）
    for (const [x, z] of [[8, -10], [20, 8], [12, 16]]) rt.scene.add(tawara(W, x, z, 0.4, 3));

    // ---- 味方：中村一栄の隊（主人公の付く手）・有馬豊氏の隊（川の東の岸） ----
    F.naka = allyGroup(rt, { faction: 'tokugawa', name: '中村一栄の隊', anchor: { x: SPAWN.x - 4, z: SPAWN.z }, facing: -Math.PI / 2, width: 12, aggro: 8, noRout: true, formation: 'yari' },
      dress([busho('中村一栄', { invuln: true }), uS(3), uA(18), uG(6)], NAKA));
    F.arima = allyGroup(rt, { faction: 'tokugawa', name: '有馬豊氏の隊', anchor: { x: BANK.x + 12, z: BANK.z - 14 }, facing: -Math.PI / 2, width: 12, aggro: 8, noRout: true, formation: 'yari' },
      dress([busho('有馬豊氏', { invuln: true }), uS(2), uA(16), uG(5)], NAKA));
    for (const g of [F.naka, F.arima]) { g.defMult = 1.5; g.dmgMult = 1.1; g.aggro = 24; }
    KIT.backOf(rt, F.naka, { flag: 'tokugawa', armor: 0x24221f, kind: 'spear', w: 22, depth: 10, count: 150, gap: 4, seed: 81 });
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: SPAWN.x - 6, z: SPAWN.z + 4 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '中村隊を率いて杭瀬川を渡り、島左近を追え', 'main');
    rt.banner('杭瀬川', '慶長五年九月十四日　赤坂');
    rt.say('中村一栄', '見よ、川の向こうで西軍が刈田をしておる。少数ぞ', 3.8);
    rt.after(4, () => rt.say('有馬豊氏', '島左近の手じゃ。あの男が、そんな無用心をするものか……', 3.8));
    rt.after(8, () => rt.say('中村一栄', '怖気づくな。今なら討てる。川を渡れ！', 3.6));
    rt.after(10.5, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t; F.step = 1;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    const ctx = { faction: 'toyotomi', flag: 'ishida', armor: SHIMA.armor, dmg: 0.42, mass: 160, scale: 1.4, look: (l) => dress(l, SHIMA),
      friends: () => [F.naka, F.arima].filter((g) => g && g.count && !g.routed), botSeek: 40 };
    depthStart(rt, ctx, [
      // ① 川を渡り、刈田の島左近の兵を追う：島の兵は退くように見せる
      DP.fight({ at: BAIT, title: '川を渡る', sub: '島左近の小勢が退いていく', obj: '刈田の西軍を追い払え', max: 60,
        say: [['中村一栄', '突っ込め！　逃がすな！']],
        foes: () => [{ name: '島左近の囮', from: { x: BAIT.x - 22, z: 0 }, list: [busho('島左近', { flag: 'ishida' }), uS(1), uA(5)], mass: 40, morale: 55, noRout: 8 }],
        reward: '島左近の囮を追った', onEnd: (rt2) => this.lured(rt2) }),
      // ② 葦の原へ誘い込まれ、伏兵に囲まれる。耐える
      DP.rest({ dur: 5, heal: 0.9 }),
      DP.hold({ at: { x: BAIT.x - 28, z: 0 }, dur: 70, r: 16, label: '葦の原', title: '伏兵', sub: '葦の中から鉄砲が立ち上がる',
        obj: '囲まれた中村隊を支え、持ちこたえよ',
        waves: [
          { t: 4, say: ['足軽', '葦の中に鉄砲じゃ！　三方から撃たれるぞ！'], foes: () => [gunLine('葦の伏兵の鉄砲（北）', { x: REED.x + 6, z: -34 }, 9), gunLine('葦の伏兵の鉄砲（南）', { x: REED.x + 8, z: 36 }, 8)] },
          { t: 26, say: ['足軽', '宇喜多の旗！　明石全登の隊が横から来た！'], foes: () => [{ name: '明石全登の隊', flag: 'ukita', from: { x: REED.x, z: 38 }, list: [busho('明石全登', { flag: 'ukita' }), uS(3), uA(14)], mass: 180, dmg: 0.4, noRout: 30 }] },
          { t: 46, say: ['足軽', '島左近が引き返してきた！　囮ではなかった、本隊じゃ！'], foes: () => [{ name: '島左近の本隊', from: { x: REED.x - 6, z: -8 }, list: [busho('島左近', { flag: 'ishida' }), uS(3), uA(14), uG(4)], mass: 200, dmg: 0.4, noRout: 24 }] },
        ],
        reward: '囲まれても踏みとどまった', onEnd: (rt2) => this.broken(rt2) }),
      // ③ 退く：川の東の岸、有馬隊のもとへ。島左近の追い討ちを受ける
      DP.rest({ dur: 5, heal: 0.9 }),
      DP.hold({ at: BANK, dur: 55, r: 16, label: '川の岸', title: '退け', sub: '有馬豊氏の隊が岸で受ける',
        obj: '川を越えて有馬隊のもとへ退き、追撃を受け止めよ',
        waves: [
          { t: 6, say: ['有馬豊氏', '中村隊を通せ！　岸に鉄砲を並べよ！'], foes: () => [{ name: '追ってきた島左近の兵', from: { x: FORD.x - 22, z: -4 }, list: [uS(2), uA(10)], mass: 120, dmg: 0.4 }] },
          { t: 28, say: ['足軽', '西軍の鉄砲衆が川の向こうに並んだ！　撃ってくる！'], foes: () => [gunLine('川の向こうの西軍の鉄砲', { x: FORD.x - 18, z: 14 }, 8)] },
        ],
        reward: '岸で追撃を受け止めた' }),
    ], (rt2) => this.win(rt2));
  },

  // 島左近の兵が引く → 追いすぎて葦の原へ（必ず）
  lured(rt) {
    const F = rt.flags;
    F.step = 2;
    rt.banner('深追い', '西軍は退く……葦の原の方へ');
    rt.say('中村一栄', '逃げるわ！　追えっ、首を取れ！', 3);
    rt.after(3.2, () => rt.say('有馬豊氏', '待て、深追いするな！　この先は葦の原じゃ！', 3.2));
    for (const m of F.westDA) m.advance(14, 10, {});
  },

  // 中村隊は崩れ、東軍は退くしかない（必ず）
  broken(rt) {
    const F = rt.flags;
    F.step = 3;
    sfx('taiko', 1);
    rt.banner('中村隊、崩れる', '東軍は退く　西軍の士気が上がる');
    rt.say('中村一栄', '退け！　川まで退け！', 3);
    rt.after(3.4, () => rt.say(nm(rt), 'しんがりじゃ！　皆が川を越えるまで、島左近を止めよ！', 3.6));
    for (const m of F.westDA) m.advance(26, 12, { charge: true });
    if (!gone(F.naka)) { F.naka.order = 'move'; F.naka.dest = { x: BANK.x - 6, z: 0 }; }
    for (const m of F.eastDA) m.advance(12, 8, {});
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '杭瀬川で殿を務めた', pts: 40 }; }, '殿を務め、中村隊を退かせた');
    rt.player.u.invuln = true;
    rt.banner('東軍、退く', '西軍は勝鬨を上げた　あすは関ヶ原');
    rt.say('島左近', 'ははは、東軍恐るるに足らず！　あすは存分に戦おうぞ！', 4);
    rt.after(5, () => rt.say('徳川家康', 'あの者らは強い。決戦は避けられぬ……あすは気を引き締めよ', 4.2));
    rt.after(10, () => rt.say('石田三成', '左近、よくやった。これで士気が上がる', 3.6));
    rt.finish({}, 16);
  },

  lose: makeLose('中村隊は川で潰えた', '追撃は裏目に出た', '川を越えられぬ……！　皆、散れ！', '足軽'),

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    if (F.ending) return;
    depthTick(rt, dt);
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt, '刻限までに川へ退けなかった');
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
    if (v.type === 'busho' && v.team === 1) {
      rt.say('足軽', `${v.name}が深手じゃ！　西軍の者が担いで引いていく！`, 3);
      if (v.group) { v.group.noRout = false; v.group.morale -= 40; }
      rt.award((t) => { t.special = { label: `${v.name}に深手を負わせた`, pts: 30 }; }, `${v.name}に深手を負わせた`);
    }
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が引いていく！`, 2.5);
  },
};

// 両軍の総勢：赤坂に着いた東軍は七万ほど、前へ出た手は数千。西軍は大垣の兵。
k04_kuisegawa.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, Math.round(3000 - (F.ak || 0) * 15)), a0: 3000, b: Math.max(0, 2000 - (F.ek || 0) * 8), b0: 2000 };
};
k04_kuisegawa.sides = { a: { name: '東軍', mon: 'tokugawa' }, b: { name: '西軍', mon: 'ishida' } };
k04_kuisegawa.date = () => '慶長五年（1600）九月十四日　午後・晴';
k04_kuisegawa.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '追撃の下知まで待つ' : '');
k04_kuisegawa.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k04_kuisegawa.history = '慶長五年（1600）九月十四日、美濃の赤坂に着いた徳川家康の東軍の前に、大垣城の石田三成の西軍が現れた。西軍の島左近は、杭瀬川の向こうで少数の兵に刈田をさせて東軍を挑発し、追われれば退くように命じた。東軍の中村一栄・有馬豊氏の隊が川を渡って追うと、葦の中に伏せていた宇喜多秀家の家臣・明石全登の鉄砲衆と島左近の本隊が反撃した。東軍は数十人から数百人の損害を受けて退いた（数には諸説がある）。この小さな勝利で西軍の士気は上がったが、翌十五日、決戦は関ヶ原で行われる。\n戦場の細かな位置と、島左近が囮をした話の詳細は伝えによる。';
k04_kuisegawa.bushou = [{ name: '島左近', g: /島左近/ }, { name: '明石全登', g: /明石全登/ }];
k04_kuisegawa.botBrain = makeBot({ x: SPAWN.x - 10, z: SPAWN.z });

setStages('k04_kuisegawa', [['川を渡り島左近を追う', 0], ['葦の伏兵に耐える', 2], ['川へ退き、有馬隊のもとで追撃を受け止める', 3]]);

export { k04_kuisegawa };
export default k04_kuisegawa;
