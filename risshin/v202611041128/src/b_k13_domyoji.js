// ======================================================================
// 徳川編 13　道明寺の戦い（慶長二十年＝元和元年 1615・五月六日・夏）　大坂夏の陣の野戦
// 筋書きの正：docs/chapter3_tokugawa.md の「13. 道明寺」。史実の手本：docs/battle_refs/k13_domyoji.md
// 大和口の徳川方（三万四千ほど。先鋒の大将 水野勝成・本多忠政・伊達政宗と先手の片倉重長）が国分の隘路を抜けて河内へ出る。
// 豊臣方の後藤又兵衛（約二千八百）は、後続を待たず石川を渡って小松山へ先に出た。薄田兼相・真田信繁・毛利勝永は霧で遅れ、
// 又兵衛は十倍を越える敵に孤立して討死（必ず）。誉田から出た薄田兼相も道明寺で討死。
// 昼に着いた信繁・勝永（一万二千ほど）は誉田で伊達勢と鉄砲を撃ち合って押し戻し、夕方、信繁が殿をして大坂へ退いた。徳川方は疲れて追わなかった。
// 主人公は東軍の水野勝成の先手に付く。大和口の総大将 松平忠輝は後ろの陣、伊達政宗は伊達勢の後ろ（前で討てる所に総大将を置かない。kaito 11/3 AR3・AT3）。
// 見せかけの軍勢（軽い作りの大軍・奥の乱戦・段の敵の後ろの控え）は置かない。見える兵は全部本物（kaito 11/3 AA・AF・AQ6）。
// 段：①小松山の斜面の鉄砲組を破る ②頂の後藤又兵衛を討つ ③道明寺の野で薄田兼相の手を討つ ④誉田で真田・毛利の寄せを伊達勢と受け止める ⑤真田のしんがりの逆襲を退ける
// 負け：目標ごとの刻限（①②③。kaito 11/3 AP8）までに果たせない。
// 向き：東（奈良の側）が +x、西（大坂の側）が -x。小松山は中ほど、石川は山の西、誉田・道明寺の野はその西。
// 地形：手書きの小山と野（国土地理院の標高はまだ混ぜない）。大きさは常識の低い丘（AT8）。
// ======================================================================
import { nobori, jinmaku, kagaribi } from './props.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { timeslipField } from './timeslip_field.js';
import { buildHorse, horseStyleFor } from './units.js';

// ---- 場所（ゲームの座標） ----
const START = { x: 96, z: 4 };           // 国分を抜けた水野勢の寄せ口（小松山の麓の近く。長く歩かせない。AT10）
const SLOPE = { x: 40, z: 2 };           // 小松山の東の斜面（後藤勢の鉄砲組）
const TOP = { x: 4, z: 0 };              // 小松山の頂（後藤又兵衛）
const ISHI_X = -52;                      // 石川（小松山の西の裾を北へ流れる浅い川）
const NOGAWA = { x: -78, z: 4 };         // 道明寺の野（薄田兼相）
const HONDA = { x: -110, z: -4 };        // 誉田（真田・毛利が着く所）
const HILL = 18;                         // 小松山（玉手山の丘陵の北の高み）の麓からの高さ（m）
const REAR = { x: 178, z: -6 };          // 松平忠輝の陣（後ろ）
const LIMIT = [240, 330, 0, 270];        // 段ごとの刻限（秒。0 は刻限なし。休みと持ちこたえは数で決まる）

const ROUTE = [[236, 6], [START.x, START.z], [SLOPE.x, SLOPE.z], [TOP.x, TOP.z], [-30, 2], [ISHI_X, 3], [NOGAWA.x, NOGAWA.z], [HONDA.x, HONDA.z], [-230, 0]];

const TOYO = { armor: 0x2e2a26, flag: 'toyotomi' };
const SANADA = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };
const TOKU = { flag: 'tokugawa' };
const DATE = { armor: 0x24221f, lace: 0x3a3a3a, flag: 'date' };
const MIZU = { flag: 'mizuno' };
const HONDA_K = { flag: 'honda' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });
const sstep = (t) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };

// ---- 地形：国分の隘路（南北の山）・小松山・石川・西の野 ----
function height(x, z) {
  let h = 2 + 0.012 * Math.max(0, x - 100);
  // 国分の隘路：東の入口の南北が山で、まん中が谷
  const pass = sstep((x - 90) / 30) * (1 - sstep((x - 250) / 40));
  h += 22 * pass * sstep((Math.abs(z) - 26) / 34);
  // 小松山：南北に長い丘（玉手山の丘陵の北の高み。BH4）。頂は狭い平ら、東は国分からの長い登り、西は石川へ急な下り。
  //   斜めは歩いて登れる強さまで（東 0.45・西 0.55 ほど）
  const dx = x - TOP.x;
  const ew = dx > 0 ? 1 - sstep((dx - 10) / 60) : 1 - sstep((-dx - 8) / 48);
  const ns = 1 - sstep((Math.abs(z) - 46) / 54);
  h += HILL * ew * ns + 2.2 * ew * ns * Math.sin(z * 0.06 + 1.1) * Math.max(0, 1 - Math.abs(dx) / 40);
  // 石川の河原はわずかに低く
  h -= 0.9 * Math.exp(-((x - ISHI_X) * (x - ISHI_X)) / 160);
  h += 0.35 * Math.sin(x * 0.05 + 0.4) * Math.cos(z * 0.05) + 0.2 * Math.sin(z * 0.08 - x * 0.03);
  return h;
}

// ---- 旗と陣 ----
function flags(rt) {
  const W = rt.world;
  // 水野勝成の旗は隊が背負って進む（空の陣所に旗だけを残さない。BH1）。家康・秀忠はこの場にいない（河内路）
  // 松平忠輝の陣（後ろ）。陣幕の内に忠輝と旗本が本当にいる（BH1）
  rt.scene.add(jinmaku(W, REAR.x, REAR.z, 12, 9, 4, { mon: 'tokugawa' }));
  for (const [x, z] of [[REAR.x - 6, REAR.z - 10], [REAR.x - 6, REAR.z + 10]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 6));
  rt.scene.add(kagaribi(W, REAR.x - 4, REAR.z + 2));
  // 小松山の頂の後藤勢の旗（浪人衆は豊臣の旗の下）
  for (const [x, z] of [[8, -10], [-2, 8], [14, 6]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
  // 誉田八幡の辺りの豊臣方の旗（薄田の陣所・後から真田の赤い旗）
  for (const [x, z] of [[HONDA.x - 18, -16], [HONDA.x - 18, 10]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
}

const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, width: o.width || 10, list, seek: o.seek || 55, ...o });

// 後藤又兵衛の討死（必ず）。鉄砲に撃たれ、麾下の兵に見取られる
function matabeiDown(rt) {
  const F = rt.flags;
  if (F.matabei) return;
  F.matabei = true;
  for (const u of rt.army.units) if (u.alive && u.name === '後藤又兵衛') rt.army.kill(u);
  rt.award((t) => { t.special = { label: '後藤又兵衛が小松山に果てた', pts: 40 }; }, '後藤又兵衛が討死した');
  rt.banner('後藤又兵衛、討死', '小松山の頂で、後続を待たずに果てた');
  sfx('horagai', 0.7);
  rt.after(1.5, () => rt.say('後藤の侍', '殿は……殿は鉄砲に……！　薄田殿はまだか、真田殿は！', 3.6));
}

// 伊達勢が国分を抜けて着く（片倉重長の鉄砲隊が先手。政宗はその後ろの旗本の中）
function datearrive(rt) {
  const F = rt.flags;
  if (F.date) return;
  F.date = allyGroup(rt, { faction: 'tokugawa', name: '伊達勢', fixed: true, speed: 4.2, anchor: { x: 60, z: -14 }, facing: -Math.PI / 2, width: 14, aggro: 14, order: 'attack', seekRange: 90, noRout: true, dmgMult: 0.8 },
    dress([uS(5), uA(16), uG(8)], DATE));
  F.katakura = allyGroup(rt, { faction: 'tokugawa', name: '片倉重長の鉄砲隊', fixed: true, speed: 4.2, anchor: { x: 64, z: 14 }, facing: -Math.PI / 2, width: 12, aggro: 14, order: 'attack', seekRange: 90, noRout: true, dmgMult: 0.8, formation: 'line' },
    dress([{ type: 'busho', n: 1, o: { name: '片倉重長', invuln: true, horse: true, hat: 'kabuto_m' } }, uS(3), uG(14)], DATE));
  // 政宗は伊達勢の後ろ（前へは出ない）
  F.masamune = allyGroup(rt, { faction: 'tokugawa', name: '伊達政宗の旗本', anchor: { x: TOP.x + 30, z: -18 }, facing: -Math.PI / 2, width: 8, aggro: 6, order: 'hold', noRout: true, fullStrength: true },
    dress([{ type: 'busho', n: 1, o: { name: '伊達政宗', invuln: true, horse: true, hat: 'kabuto_w' } }, uS(7)], DATE));
  F.masamune.noFrontline = true;
  for (const g of [F.katakura, F.masamune]) for (const u of g.units) if (u.alive && u.name && u.mounted) F.riders.push({ u, speed: u.speed, run: u.run, g });
  rt.scene.add(nobori(rt.world, TOP.x + 34, -26, 'date', 6));
  rt.army.play('toki', { x: 70, z: 0 }, 1.2);
  rt.say('伊達政宗', '片倉、前へ出よ。又兵衛を討ったなら、あとは野の戦じゃ', 3.8);
}

const k13_domyoji = {
  // 身の回りの合戦の跡（timeslip_field.js）。道明寺：五月初め（今の六月）の霧の朝。濡れた初夏の草、小松山の斜面の倒れた槍と旗
  timeslip: {
    wet: 0.4, dust: 0.2, trample: 0.3, debris: 1.2, arrows: 1, maxSlope: 0.3,
    grass: 0x7e9a4c, grassTints: [0xffffff, 0xe4ecc4, 0xc8d49c], grassH: 1.15, grassLift: 0.2, grassShape: 'blade', tallGrass: 1,
    flagColors: [0xe6dfcc, 0x24211e, 0x8e1f16],
  },
  spawn: { x: START.x - 4, z: START.z, heading: -Math.PI / 2 },
  noWake: true, noReserve: true, noTaishoRaid: true,
  // 歩こうとした強さを覚える（動けなくなった時に抜け出す。BH8）。速さはそのまま返す
  playerVelocity(rt, vx, vz) { const F = rt.flags, q = F.pv || (F.pv = { x: 0, z: 0 }); F.want = Math.hypot(vx, vz); q.x = vx; q.z = vz; return q; },
  // 作り物の遠景の軍勢・奥の乱戦を出さない（kaito 11/3 AA・AF・AQ6）
  noDistantBattle: true, noFrontFill: true,
  // 豊臣の総大将 秀頼は大坂城、徳川の家康・秀忠は河内路。この場の総大将の討ち取りで勝ち負けを決めない
  taisho: { a: null, b: null },
  minutes: 7,
  world: {
    seed: 1615506,
    time: 'morning',
    mist: true,
    groundHalf: 300,
    mountainScale: 0.6,
    paths: [ROUTE.slice(0, 5), ROUTE.slice(4)],
    streams: [{ pts: [[ISHI_X + 4, -260], [ISHI_X - 2, -90], [ISHI_X, 0], [ISHI_X - 4, 110], [ISHI_X + 2, 260]], w: 12, depth: 0.5 }],
    height,
    tint(x, z, h, c) {
      if (distToPolyline(x, z, ROUTE) < 3.4) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      // 石川の河原
      if (Math.abs(x - ISHI_X) < 12) { c.setRGB(c.r * 0.5 + 0.24, c.g * 0.5 + 0.22, c.b * 0.5 + 0.16); return; }
      // 河内の野は田と畑（初夏の青田）
      if (h < 4 && x < -20) { c.setRGB(c.r * 0.6 + 0.04, c.g * 0.7 + 0.14, c.b * 0.6 + 0.03); return; }
      // 小松山の斜面は土と下草（急な所ほど土の色）
      if (h > 6 && x > -50 && x < 80) { const k = Math.min(1, (h - 6) / 14); c.setRGB(c.r * (1 - 0.3 * k) + 0.12 * k, c.g * (1 - 0.32 * k) + 0.1 * k, c.b * (1 - 0.3 * k) + 0.06 * k); }
    },
    // 小松山の左右の裾（道から離れた所）には木を残す
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 9 || (Math.abs(z) < 40 && x > -160 && x < 130 && !(x > -40 && x < 70 && Math.abs(z) > 22)),
    trees: 420,
    tufts: 2400,
    treeDensity: (x, z) => (distToPolyline(x, z, ROUTE) < 10 ? 0 : (Math.abs(z) > 50 ? 1.1 : 0.2)),
    groves: [{ x: 90, z: -50, r: 18, n: 22, kind: 'sugi' }, { x: 80, z: 54, r: 18, n: 22, kind: 'sugi' }, { x: -110, z: 50, r: 14, n: 16 },
      { x: 16, z: -34, r: 14, n: 18 }, { x: 8, z: 34, r: 14, n: 18 }, { x: 44, z: -32, r: 10, n: 10 }, { x: -24, z: 32, r: 10, n: 10 }, { x: -6, z: -60, r: 16, n: 18 }, { x: 0, z: 62, r: 16, n: 18 }],
    fleeOut: (x, z, team) => (team === 1 ? x < -220 : x > 240),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    flags(rt);
    // ---- 東軍：水野勝成の先手（勝成は自ら前で戦った）・自分の手勢・本多忠政の隊 ----
    F.mizuno = allyGroup(rt, { faction: 'tokugawa', name: '水野勝成の先手', fixed: true, anchor: { x: START.x - 14, z: START.z - 4 }, facing: -Math.PI / 2, width: 12, aggro: 12, speed: 4.2, noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([{ type: 'busho', n: 1, o: { name: '水野勝成', invuln: true, horse: true } }, uS(8), uA(22), uG(8), uB(2)], MIZU));
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', fixed: true, anchor: { x: START.x - 8, z: START.z + 8 }, facing: -Math.PI / 2, width: 10, aggro: 10, speed: 4.2, noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([uS(3), uA(12), uG(4), uB(2)], MIZU));
    F.honda = allyGroup(rt, { faction: 'tokugawa', name: '本多忠政の隊', fixed: true, anchor: { x: START.x - 6, z: START.z - 16 }, facing: -Math.PI / 2, width: 10, aggro: 10, speed: 4.2, noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([{ type: 'busho', n: 1, o: { name: '本多忠政', invuln: true, horse: true } }, uS(5), uA(16), uG(6)], HONDA_K));
    // 大和口の総大将 松平忠輝は後ろの陣幕の内に留まる（史実で戦に間に合っていない）。陣幕の内と口を旗本が固める（BH1・AV18）
    F.tadateru = allyGroup(rt, { faction: 'tokugawa', name: '松平忠輝の旗本', fixed: true, anchor: { x: REAR.x, z: REAR.z }, facing: -Math.PI / 2, width: 10, aggro: 6, seekRange: 12, order: 'hold', noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '松平忠輝', invuln: true, horse: true, hat: 'kabuto_w' } }, uS(14), uA(16), uG(6)], TOKU));
    F.tadateru.noFrontline = true;
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x - 4, z: START.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 12) }]);
    // 名のある将は馬上（BH2）。乗り手の足の速さを覚え、馬を失っても乗り直させる
    F.riders = [];
    for (const g of [F.mizuno, F.honda, F.tadateru]) for (const u of g.units) if (u.alive && u.name && u.mounted) F.riders.push({ u, speed: u.speed, run: u.run, g });
    // 動けなくなった時に抜け出す（BH8）：歩こうとした向きを覚える
    F.want = 0; F.stillT = 0; F.goodPos = [];
    rt.setPhase('brief');
    rt.obj('main', '小松山の後藤又兵衛を討ち、誉田で真田・毛利の寄せを止める', 'main');
    rt.say('水野勝成', '国分を抜けたぞ。霧の向こうの小松山に、豊臣の旗が立っておる', 4.5);
    rt.after(5, () => rt.say(nm(rt), '山の上は後藤又兵衛。ほかの隊は霧でまだ見えませぬ', 3.6));
    // 始めから味方の組が麓へ歩き出す（本人だけが丘に着いて一人に見えない）
    rt.after(2, () => {
      [F.mizuno, F.mine, F.honda].forEach((g, i) => { if (g && g.count) { g.calm = false; g.order = 'attack'; g.seekRange = 45; g.anchor = { x: SLOPE.x + 14 + i * 4, z: SLOPE.z + (i - 1) * 10 }; } });
    });
    rt.after(9, () => rt.say('水野勝成', '又兵衛は後続を待たずに一人先に出た。霧が晴れる前に叩く。かかれ！', 4));
    rt.after(13.5, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('battle');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    const look = (list) => dress(list, TOYO);
    depthStart(rt, { faction: 'toyotomi', flag: 'toyotomi', armor: TOYO.armor, friends: () => [F.mizuno, F.mine, F.honda, F.date, F.katakura].filter((g) => g && g.count && !g.routed), look, scale: 1.6, dmg: 0.62, botSeek: 45, mass: 0, backing: false }, [
      // ① 小松山の東の斜面（撃ち下ろす鉄砲組と、駆け下りる槍）
      DP.fight({ at: SLOPE, title: '小松山', sub: '斜面に後藤勢の鉄砲組が並ぶ', obj: '小松山の東の斜面で、後藤勢の鉄砲組を破れ', max: LIMIT[0],
        say: [['足軽', '山の上から撃ち下ろしてくる！　身を低うせよ']],
        foes: () => [keep('後藤勢の鉄砲組', SLOPE, [uS(3), uA(8), uG(9)], { dx: -14 })],
        later: [{ t: 30, say: ['後藤の侍', '押し返せ！　山を下りて槍を入れよ'], foes: () => [keep('後藤勢の槍組', SLOPE, [uS(3), uA(10)], { dx: -20, dz: 10, dmg: 0.75 })] }],
        reward: '小松山の斜面を破った' }),
      // ② 頂の後藤又兵衛（孤立しても侍衆が固く守る。必ず討たれる）
      DP.fight({ at: TOP, title: '後藤又兵衛', sub: '後続は霧で遅れ、小松山の頂は孤立している', obj: '小松山の頂で、後藤又兵衛と侍衆を討て', max: LIMIT[1],
        say: [['後藤又兵衛', '薄田も真田も遅れたか。ならば我が手で、この山を墓所とする！'], ['足軽', '黒の甲冑、又兵衛じゃ！　侍衆が固めておる！']],
        foes: () => [keep('後藤又兵衛の旗本', TOP, [{ type: 'busho', n: 1, o: { name: '後藤又兵衛', horse: true, hat: 'kabuto_t' } }, uS(10), uA(8), uG(5)], { dx: -6, morale: 100, noRout: 120, dmg: 0.8 })],
        later: [
          { t: 30, say: ['後藤の侍', '殿をお守りせよ！　一歩も退くな！'], foes: () => [keep('後藤勢の新手', TOP, [uS(3), uA(9), uG(3)], { dx: -24, dz: 10, dmg: 0.75 })] },
          { t: 60, say: ['水野勝成', '伊達の鉄砲が着いた。撃ち込め！'], foes: () => { datearrive(rt); return []; } },
        ],
        onEnd: (rt2) => matabeiDown(rt2) }),
      DP.rest({ dur: 6, heal: 0.6, say: [['水野勝成', '又兵衛は討った。息を整えよ。石川の向こうに薄田の旗じゃ']] }),
      // ③ 石川を渡り、道明寺の野で薄田兼相を討つ（史実で討死）
      DP.fight({ at: NOGAWA, title: '薄田兼相', sub: '誉田八幡から出た薄田の手が、石川を渡って来る', obj: '石川を渡り、道明寺の野で薄田兼相の手を討て', max: LIMIT[3],
        say: [['足軽', '薄田隼人の旗じゃ！　川の向こうから来るぞ！']],
        foes: () => [keep('薄田兼相の手', NOGAWA, [{ type: 'busho', n: 1, o: { name: '薄田兼相', horse: true, hat: 'kabuto_g' } }, uS(6), uA(12), uG(4)], { dx: -26, dz: -6, noRout: 40 })],
        later: [{ t: 35, say: ['足軽', '新手が霧の中から！'], foes: () => [keep('豊臣の新手', NOGAWA, [uS(2), uA(10), uG(3)], { dx: -34, dz: 14 })] }],
        reward: '道明寺の野で薄田兼相の手を破った' }),
      DP.rest({ dur: 6, heal: 0.3, fn: () => { rt.world.setTime?.('day'); },
        banner: ['真田信繁・毛利勝永が着く', '霧が晴れ、誉田の野に赤い旗が並ぶ'],
        say: [['伊達政宗', '真田が来た。誉田で鉄砲を並べて迎える。片倉、前へ！'], ['水野勝成', '遅れて着いたが、数は一万を越える。気を抜くな']] }),
      // ④ 誉田の鉄砲戦（伊達の片倉隊と並ぶ。真田の待ち伏せで伊達勢は一度押し戻される）
      DP.hold({ at: HONDA, dur: 80, r: 16, title: '誉田の戦い', sub: '伊達勢と真田・毛利が鉄砲を撃ち合う', label: '誉田の野', obj: '誉田の野で伊達勢と並び、真田・毛利の寄せを止めよ',
        say: [['片倉重長', '放て！　撃ち続けよ。弾が尽きるまで野を渡らせるな！']],
        waves: [
          { t: 4, say: ['足軽', '毛利の手じゃ！　鉄砲を揃えて来る！'], foes: () => [keep('毛利勝永の手', HONDA, [{ type: 'busho', n: 1, o: { name: '毛利勝永', invuln: true, horse: true, hat: 'kabuto_m' } }, uS(4), uA(10), uG(8)], { dx: -40, dz: 14, noRout: 30 })] },
          { t: 26, say: ['足軽', '赤備えじゃ！　真田の待ち伏せ、伊達殿が押し戻される！'], foes: () => [keep('真田信繁の手', HONDA, [{ type: 'busho', n: 1, o: { name: '真田信繁', invuln: true, horse: true, ...SANADA } }, ...dress([uS(5), uA(10), uG(8)], SANADA)], { dx: -40, dz: -12, noRout: 30, dmg: 0.75 })] },
        ],
        reward: '誉田で真田・毛利の寄せを止めた' }),
      // ⑤ しんがり（信繁・勝永は討てず、大坂へ退く）
      DP.hold({ at: HONDA, dur: 40, r: 16, title: '大坂へ退く', sub: '信繁のしんがりが、追う者を斬り払う', label: '誉田の野', obj: '真田のしんがりの逆襲を、誉田の野で押し返せ',
        waves: [{ t: 4, say: ['真田信繁', '関東勢百万と候え、男は一人もなし。引け、秀頼様の城を守る'], foes: () => [keep('真田のしんがり', HONDA, dress([uS(4), uA(10), uG(5)], SANADA), { dx: -40, dz: 0, dmg: 0.75 })] }],
        reward: '豊臣勢を大坂へ退かせた' }),
    ], (rt2) => this.win(rt2));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '道明寺を制した', pts: 40 }; }, '道明寺の野を制した');
    sfx('horagai', 0.9);
    rt.banner('豊臣勢、大坂へ退く', '慶長二十年五月六日　道明寺・誉田の戦い');
    rt.player.u.invuln = true;
    rt.after(2, () => rt.say('水野勝成', '追え！　今なら真田を討てる！', 3.4));
    rt.after(6, () => rt.say('伊達政宗', '兵は朝から戦い通しじゃ。深追いはならぬ', 4));
    rt.after(10.5, () => rt.say(nm(rt), '又兵衛殿は小松山に果てた。明日は大坂の城の前じゃ', 4.4));
    rt.finish({}, 16);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('退き太鼓', why);
    rt.say('水野勝成', '押し切れなんだ。一度国分まで退く', 4);
    rt.finish({ failureReason: why }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    depthTick(rt, dt);
    this.keepUp(rt, dt);
    const D = F.dp;
    if (!F.dusk && D && D.i >= 6) { F.dusk = true; rt.world.setTime('dusk'); }
    // 目標ごとの刻限（kaito 11/3 AP8）
    const lim = D && D.on && D.cur ? LIMIT[D.i] : 0;
    if (lim) {
      const left = lim - (rt.t - D.cur.t0);
      if (left <= 0) { this.lose(rt, D.i === 0 ? '小松山の斜面を破れなかった' : D.i === 1 ? '後藤又兵衛を討てなかった' : '薄田兼相の手を破れなかった'); return; }
      if (left < 45 && F.warned !== D.i) { F.warned = D.i; rt.say('水野勝成', '霧が晴れる。豊臣の後続が着く前に、急げ', 3.5); }
    }
  },

  // 半秒ごと：味方が自分と同じ速さで付いて来る（BH3）・攻められたら家臣が囲む（BH5）・名のある将は馬上（BH2）・
  //   死んだ馬に乗れない（BH7）・動けなくなったら抜け出す（BH8）
  keepUp(rt, dt) {
    const F = rt.flags, P = rt.player, u = P.u;
    if ((F.kuT = (F.kuT || 0) - dt) > 0) return;
    F.kuT = 0.5;
    if (!u.alive) return;
    const sp = Math.max(4.2, Math.min(9, Math.hypot(u.vel.x, u.vel.z) * 1.05));
    const threat = rt.army.nearestEnemy(u, 9);
    // 手勢と家臣の組：攻められたら自分を囲んで寄せる敵に掛かる。離れたら自分の足で追いつく
    const guards = [F.mine, ...(rt.squadGroups || [])].filter((g) => g && g.count && !g.routed);
    guards.forEach((g, i) => {
      const c = g.center(), d = Math.hypot(c.x - u.pos.x, c.z - u.pos.z);
      if (threat) { g.calm = false; g.order = 'attack'; g.focus = threat; g.anchor = { x: u.pos.x, z: u.pos.z }; g.seekRange = 12; g.speed = Math.max(sp, 5); }
      else if (d > 10) { g.calm = false; g.order = 'move'; g.dest = { x: u.pos.x + (i % 2 ? 2.5 : -2.5), z: u.pos.z + 3 }; g.speed = sp; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 16; q.anchor = { x: u.pos.x, z: u.pos.z }; }; }
      else { g.focus = null; g.speed = sp; }
    });
    // 水野・本多・伊達の隊：自分より遅れたら、自分の速さで前へ出る（自分だけが先に敵を引き受けない）
    for (const g of [F.mizuno, F.honda, F.date, F.katakura]) {
      if (!g || !g.count || g.routed || g.order === 'retreat') continue;
      const c = g.center(), lag = c.x - u.pos.x;
      g.speed = lag > 8 ? sp : 4.2;
      if (lag > 18 && F.begun) { g.calm = false; g.order = 'attack'; g.seekRange = 40; g.anchor = { x: u.pos.x + 5, z: Math.max(-30, Math.min(30, (g.anchor ? g.anchor.z : u.pos.z))) }; }
    }
    // 名のある将は馬上：馬を落とされても、少しして控えの馬に乗り直す
    for (const R of F.riders || []) {
      const v = R.u;
      if (!v.alive || v.mounted) { R.t = 0; continue; }
      if (v.pinT > rt.army.time || v.hit || v.stagger > 0) continue;
      if ((R.t = (R.t || 0) + 0.5) < 4) continue;
      R.t = 0;
      rt.army.setMounted(v, true, buildHorse(horseStyleFor(v.id, 1, R.g.faction)));
      if (v.mounted) { v.speed = R.speed; v.run = R.run; v.dismounted = false; v.horseBattle = 'mounted'; }
    }
    // 死んだ馬・命の尽きた馬は空馬の列から外す（乗れない）
    const LH = rt.army.looseHorses;
    if (LH) for (let i = LH.length - 1; i >= 0; i--) { const o = LH[i], H = o.h && o.h.userData.horse; if ((H && H.dead) || (o.stats ? o.stats.hp <= 0 : o.from && o.from.hp <= 0)) LH.splice(i, 1); }
    if (P.loose && P.horse && P.horse.userData.horse && P.horse.userData.horse.dead) P.loose.mode = 'fled';
    // 動けなくなった時：歩こうとしているのに 3 秒動かなければ固まった状態を解き、5 秒なら少し前に居た所へ戻す
    const L = F.lastP, moved = L ? Math.hypot(u.pos.x - L.x, u.pos.z - L.z) : 9;
    if (moved > 0.6) {
      F.stillT = 0; F.lastP = { x: u.pos.x, z: u.pos.z };
      F.goodPos.push(F.lastP); if (F.goodPos.length > 8) F.goodPos.shift();
    } else if (F.want > 1 && !rt.army.nearestEnemy(u, 4) && !u.climb) {
      F.stillT += 0.5;
      if (F.stillT >= 3) {
        P.catching = null; P.knockT = 0; P.staggerT = 0; P.mountT = 0; u.stagger = 0; u.hit = null; u.pinT = 0;
        if (P.cancelAttack) P.cancelAttack();
      }
      if (F.stillT >= 5 && F.goodPos.length > 1) {
        const q = F.goodPos[Math.max(0, F.goodPos.length - 3)];
        u.pos.x = q.x; u.pos.z = q.z; u.pos.y = rt.world.heightAt(q.x, q.z);
        u.vel.x = u.vel.z = 0; F.stillT = 0; F.lastP = { x: q.x, z: q.z };
      }
    } else F.stillT = 0;
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '後藤又兵衛') matabeiDown(rt);
    if (v.name === '薄田兼相') rt.award((t) => { t.special = { label: '薄田兼相を討ち取った', pts: 20 }; }, '薄田兼相を討ち取った');
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 兵の数は史実（徳川方 大和口 三万四千・豊臣方 後藤二千八百と後続を合わせて一万八千六百）。本物の兵一人がおよそ百人
k13_domyoji.force = (rt) => ({ a: Math.max(0, 34000 - (rt.flags.ak || 0) * 60), a0: 34000, b: Math.max(0, 18600 - (rt.flags.ek || 0) * 60), b0: 18600 });
k13_domyoji.sides = { a: { name: '徳川方', mon: 'tokugawa', faction: 'tokugawa' }, b: { name: '豊臣方', mon: 'toyotomi', faction: 'toyotomi' } };
k13_domyoji.date = (rt) => (rt.flags.dusk ? '慶長二十年（1615）五月六日　夏・夕暮れ' : '慶長二十年（1615）五月六日　夏・朝霧');
k13_domyoji.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k13_domyoji.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k13_domyoji.history = '慶長二十年（1615）五月六日、大坂夏の陣。大和路から大坂へ向かう徳川方（先鋒の大将 水野勝成・本多忠政・伊達政宗と片倉重長ら三万四千ほど。総大将は松平忠輝）を、豊臣方は国分の隘路の出口で迎え撃つ策を立てた。後藤又兵衛（約二千八百）は薄田兼相・真田信繁・毛利勝永らの到着を待たず、霧の中を石川を渡って小松山へ先に出た。後続が霧で遅れたため又兵衛は孤立し、十倍を越える徳川方と昼まで戦って討死した。誉田八幡から出た薄田兼相も道明寺の辺りで討たれた。昼に着いた信繁・勝永は誉田で伊達勢と鉄砲を撃ち合い、待ち伏せで伊達勢を押し戻したのち、夕方、信繁が殿を務めて大坂へ退いた。徳川方は兵が疲れ、追わなかった。\n両軍の数や細かい陣の動きは史料により異なり、地形は遊びのために縮めて復元した推定である。';
k13_domyoji.bushou = [{ name: '後藤又兵衛', g: /後藤/ }, { name: '薄田兼相', g: /薄田/ }];

k13_domyoji.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, START.x - 6, START.z, 3);
};

// 戦の進行の札：五つの目標（段の 0・1・3・5・6）
const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
STAGES.k13_domyoji = [['小松山の斜面の鉄砲組を破る'], ['頂の後藤又兵衛を討つ', dpAt(1)], ['道明寺の野で薄田兼相を討つ', dpAt(3)], ['誉田で真田・毛利を止める', dpAt(5)], ['真田のしんがりを押し返す', dpAt(6)]];

export { k13_domyoji };
export default k13_domyoji;
