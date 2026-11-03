// ======================================================================
// 徳川編 13　道明寺の戦い（慶長二十年＝元和元年 1615・五月六日・夏）　大坂夏の陣の野戦
// 筋書きの正：docs/chapter3_tokugawa.md の「13. 道明寺」
// 大和から来る徳川方（水野勝成・松平忠輝・伊達政宗・片倉重長ら）が、国分の隘路を抜けて河内へ出る。
// 豊臣方の後藤又兵衛は、後続を待たず小松山へ先に出た。薄田兼相・真田信繁・毛利勝永は霧で遅れ、又兵衛は孤立して討死（必ず）。
// 遅れて着いた信繁・勝永は、伊達勢の片倉重長と鉄砲を撃ち合い、日暮れに大坂へ退いた。
// 主人公は東軍（徳川方）の水野勢の先手に付く。
// 段：①国分から小松山の麓へ ②斜面の鉄砲組を破る ③小松山の頂で後藤又兵衛を討つ ④薄田兼相の寄せを持ちこたえる
//     ⑤伊達勢と並び、信繁・勝永を迎え撃つ（鉄砲戦） ⑥しんがりの逆襲を退け、豊臣勢が大坂へ退く
// 負け方：日が暮れ切る（七分）。
// 向き：東（奈良の側）が +x、西（大坂の側）が -x。小松山は中ほど、道明寺の野はその西。
// 地形：手書きの小山と野。国土地理院の標高は tools/dem.mjs に鍵を足して取り込む前なので、まだ混ぜない（HAS_DEM）。
// ======================================================================
import { nobori, jinmaku, kagaribi } from './props.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { KIT } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { timeslipField } from './timeslip_field.js';

// ---- 場所（ゲームの座標） ----
const START = { x: 126, z: 5 };          // 国分を抜けた水野勢の寄せ口（麓に近く、味方と一緒に丘へ着く）
const FOOT = { x: 62, z: 4 };            // 小松山の東の麓
const SLOPE = { x: 34, z: 2 };           // 斜面（後藤勢の鉄砲組）
const TOP = { x: 2, z: 0 };              // 小松山の頂（後藤又兵衛）
const PLAIN = { x: -78, z: 0 };          // 山の西の野（伊達勢と信繁・勝永の鉄砲戦）
const LIMIT = 420;                       // 日が暮れ切るまで（秒）

const ROUTE = [[236, 8], [START.x, START.z], [100, 4], [FOOT.x, FOOT.z], [SLOPE.x, SLOPE.z], [TOP.x, TOP.z], [-40, 2], [-78, 0], [-150, 0], [-230, 0]];

const TOYO = { armor: 0x2e2a26, flag: 'toyotomi' };
const SANADA = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };
const MORI = { armor: 0x2a2a2e, flag: 'mori' };
const TOKU = { flag: 'tokugawa' };
const DATE = { armor: 0x24221f, lace: 0x3a3a3a, flag: 'date' };
const MIZU = { flag: 'mizuno' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });
const sstep = (t) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };

// ---- 地形：国分の隘路（南北の山）・小松山・西の野と石川の河原 ----
function height(x, z) {
  let h = 2 + 0.012 * Math.max(0, x - 100);
  // 国分の隘路：東の入口の南北が山で、まん中が谷
  const pass = sstep((x - 90) / 30) * (1 - sstep((x - 250) / 40));
  h += 30 * pass * sstep((Math.abs(z) - 26) / 34);
  // 小松山：小さな丘（麓から頂の旗と後藤勢が見える低さ）
  h += 15 * Math.exp(-((x - 4) * (x - 4) / 2600 + z * z / 1500));
  // 石川の河原（野の西）はわずかに低く
  h -= 0.8 * Math.exp(-((x + 150) * (x + 150)) / 500);
  h += 0.35 * Math.sin(x * 0.05 + 0.4) * Math.cos(z * 0.05) + 0.2 * Math.sin(z * 0.08 - x * 0.03);
  return h;
}

// ---- 旗と篝火 ----
function flags(rt) {
  const W = rt.world;
  rt.scene.add(jinmaku(W, START.x + 10, START.z - 6, 12, 9, 4, { mon: 'mizuno' }));
  for (const [x, z] of [[START.x - 2, START.z - 12], [START.x - 2, START.z + 10], [START.x + 6, START.z - 20]]) rt.scene.add(nobori(W, x, z, 'mizuno', 6));
  for (const [x, z] of [[8, -10], [-4, 8], [14, 6], [-12, -4]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
  rt.scene.add(kagaribi(W, START.x + 4, START.z + 2));
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

function datearrive(rt) {
  const F = rt.flags;
  if (F.date) return;
  F.date = allyGroup(rt, { faction: 'tokugawa', name: '伊達政宗の手', anchor: { x: 120, z: -8 }, facing: -Math.PI / 2, width: 14, aggro: 14, order: 'attack', seekRange: 90, noRout: true, dmgMult: 0.8 },
    dress([{ type: 'busho', n: 1, o: { name: '伊達政宗', invuln: true, horse: false, hat: 'kabuto_w' } }, uS(4), uA(14), uG(10)], DATE));
  F.date.anchor = { x: PLAIN.x + 30, z: -6 };
  KIT.backOf(rt, F.date, { flag: 'date', armor: DATE.armor, kind: 'mixed', w: 20, depth: 8, count: 150, seed: 1615 });
  F.katakura = allyGroup(rt, { faction: 'tokugawa', name: '片倉重長の鉄砲隊', anchor: { x: 124, z: 12 }, facing: -Math.PI / 2, width: 12, aggro: 14, order: 'attack', seekRange: 90, noRout: true, dmgMult: 0.8, formation: 'line' },
    dress([{ type: 'busho', n: 1, o: { name: '片倉重長', invuln: true, horse: false, hat: 'kabuto_m' } }, uS(2), uG(12)], DATE));
  F.katakura.anchor = { x: PLAIN.x + 24, z: 12 };
  rt.scene.add(nobori(rt.world, PLAIN.x + 40, -14, 'date', 6));
  rt.army.play('toki', { x: 130, z: 0 }, 1.2);
  rt.say('伊達政宗', '越後の兵と戦う気で来たが。又兵衛を討ったなら、あとは野の戦じゃ', 3.8);
}

const k13_domyoji = {
  // 身の回りの合戦の跡（timeslip_field.js）。道明寺：五月初め（今の六月）の霧の朝。濡れた初夏の草、小松山の斜面の倒れた槍と旗
  timeslip: {
    wet: 0.4, dust: 0.2, trample: 0.3, debris: 1.2, arrows: 1, maxSlope: 0.3,
    grass: 0x7e9a4c, grassTints: [0xffffff, 0xe4ecc4, 0xc8d49c], grassH: 1.15, grassLift: 0.2, grassShape: 'blade', tallGrass: 1,
    flagColors: [0xe6dfcc, 0x24211e, 0x8e1f16],
  },
  spawn: { x: START.x - 4, z: START.z, heading: -Math.PI / 2 },
  noWake: true,
  minutes: 7,
  world: {
    seed: 1615506,
    time: 'morning',
    mist: true,
    groundHalf: 300,
    paths: [ROUTE.slice(0, 6), ROUTE.slice(5)],
    height,
    tint(x, z, h, c) {
      if (distToPolyline(x, z, ROUTE) < 3.4) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      // 石川の河原
      if (Math.abs(x + 150) < 14) { c.setRGB(c.r * 0.5 + 0.24, c.g * 0.5 + 0.22, c.b * 0.5 + 0.16); return; }
      // 河内の野は田と畑（初夏の青田）
      if (h < 4 && x < 30) { c.setRGB(c.r * 0.6 + 0.04, c.g * 0.7 + 0.14, c.b * 0.6 + 0.03); return; }
      if (h > 12) c.setRGB(c.r * 0.74, c.g * 0.84, c.b * 0.7);
    },
    // 小松山の左右の裾（道から離れた所）には木を残す（頂まで草だけの丸い丘に見えていた）
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 9 || (Math.abs(z) < 40 && x > -200 && x < 150 && !(x > -40 && x < 70 && Math.abs(z) > 24)),
    trees: 420,
    tufts: 2400,
    treeDensity: (x, z) => (distToPolyline(x, z, ROUTE) < 10 ? 0 : (Math.abs(z) > 50 ? 1.1 : 0.2)),
    groves: [{ x: 90, z: -50, r: 18, n: 22, kind: 'sugi' }, { x: 80, z: 54, r: 18, n: 22, kind: 'sugi' }, { x: -60, z: 60, r: 14, n: 16 },
      { x: 16, z: -34, r: 12, n: 14 }, { x: 8, z: 34, r: 12, n: 14 }, { x: 44, z: -30, r: 8, n: 8 }, { x: -24, z: 30, r: 8, n: 8 }],
    fleeOut: (x, z, team) => (team === 1 ? x < -250 : x > 270),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    flags(rt);
    // 遠くの大軍：山の東の徳川・伊達・本多の後続、山の西の豊臣方（薄田・毛利・真田は霧の奥）
    KIT.farHost(rt, START.x + 38, START.z - 6, 50, 34, 380, -Math.PI / 2, 0x24221f, 'tokugawa', 16151, 'mixed');
    KIT.farHost(rt, START.x + 14, START.z + 48, 36, 22, 220, -Math.PI / 2, 0x24221f, 'mizuno', 16152, 'spear');
    KIT.farHost(rt, 120, -62, 40, 20, 240, -Math.PI / 2, DATE.armor, 'date', 16153, 'mixed');
    KIT.farHost(rt, -240, -6, 60, 30, 420, Math.PI / 2, SANADA.armor, 'sanada', 16154, 'mixed');
    KIT.farHost(rt, -230, 50, 44, 24, 300, Math.PI / 2, MORI.armor, 'mori', 16155, 'mixed');
    // ---- 東軍：水野勝成の先手と自分の手勢。松平忠輝の隊は後ろに続く ----
    F.mizuno = allyGroup(rt, { faction: 'tokugawa', name: '水野勝成の先手', anchor: { x: START.x - 24, z: START.z - 3 }, facing: -Math.PI / 2, width: 12, aggro: 12, noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([{ type: 'busho', n: 1, o: { name: '水野勝成', invuln: true, horse: false } }, uS(4), uA(16), uG(5)], MIZU));
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', anchor: { x: START.x - 16, z: START.z + 8 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([uS(3), uA(14), uG(4), uB(3)], TOKU));
    F.tadateru = allyGroup(rt, { faction: 'tokugawa', name: '松平忠輝の隊', anchor: { x: START.x - 12, z: START.z - 14 }, facing: -Math.PI / 2, width: 10, aggro: 10, noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([{ type: 'busho', n: 1, o: { name: '松平忠輝', invuln: true, horse: false, hat: 'kabuto_w' } }, uS(3), uA(12)], TOKU));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x - 4, z: START.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 16) }]);
    // 山の西の野で組み合う伊達勢と豊臣勢の大軍（軽い作り。段⑤から動く）
    F.cl = clash(rt, { x: PLAIN.x - 40, z: 0, facing: Math.PI / 2, w: 70, gap0: 30, seed: 1615, noRout: true,
      A: { flag: 'date', armor: DATE.armor, count: 300, team: 0, faction: 'tokugawa' },
      B: { flag: 'sanada', armor: SANADA.armor, count: 360, team: 1, faction: 'toyotomi' } });
    // 小松山の頂に陣取る後藤勢（軽い作り。頂の段を破ると退く）と、本人と並んで斜面を登る水野・松平の後の手
    F.goto = [W.addDistantArmy({ x: -2, z: -18, w: 14, d: 8, count: 110, facing: Math.PI / 2, armor: TOYO.armor, team: 1, mon: 'toyotomi', host: false, seed: 16156 }),
      W.addDistantArmy({ x: -2, z: 18, w: 14, d: 8, count: 110, facing: Math.PI / 2, armor: TOYO.armor, team: 1, mon: 'toyotomi', host: false, seed: 16157 })];
    F.climb = [W.addDistantArmy({ x: 96, z: -14, w: 16, d: 8, count: 120, facing: -Math.PI / 2, armor: 0x24221f, team: 0, mon: 'mizuno', host: false, seed: 16158 }),
      W.addDistantArmy({ x: 96, z: 17, w: 16, d: 8, count: 120, facing: -Math.PI / 2, armor: 0x24221f, team: 0, mon: 'tokugawa', host: false, seed: 16159 })];
    W.setTime('morning');
    rt.setPhase('brief');
    rt.obj('main', '後藤又兵衛を討ち、真田・毛利の寄せを退けよ', 'main');
    rt.say('水野勝成', '国分を抜けたぞ。霧の向こうの小松山に、豊臣の旗が立っておる', 4.5);
    rt.after(5, () => rt.say(nm(rt), '先陣はたしか後藤又兵衛。他の隊はまだ見えませぬ', 3.6));
    // 始めから味方の組と後の手が麓から斜面へ歩き出す（本人だけが丘に着いて一人に見えない）
    rt.after(2, () => {
      [F.mizuno, F.mine, F.tadateru].forEach((g, i) => { if (g && g.count) { g.calm = false; g.order = 'attack'; g.seekRange = 45; g.anchor = { x: SLOPE.x + 6 + i * 4, z: SLOPE.z + (i - 1) * 10 }; } });
      for (const h of F.climb) if (h && h.advance) h.advance(58, 26);
    });
    rt.after(9, () => rt.say('水野勝成', 'そうじゃ、又兵衛は一人先に出た。後続が着く前に叩く。かかれ！', 4));
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
    depthStart(rt, { faction: 'toyotomi', flag: 'toyotomi', armor: TOYO.armor, friends: () => [F.mizuno, F.mine, F.tadateru, F.date, F.katakura].filter((g) => g && g.count && !g.routed), look, scale: 1.6, dmg: 0.6, botSeek: 45, mass: 200 }, [
      // ① 国分の隘路を抜け、麓へ
      DP.move({ to: FOOT, r: 10, label: '小松山の麓', obj: '国分を抜け、小松山の麓へ進め', max: 60,
        say: [['水野勝成', '山の上に鉄砲が並んでおる。盾を前へ出せ']] }),
      // ② 斜面の鉄砲組
      DP.fight({ at: SLOPE, title: '小松山', sub: '斜面に後藤勢の鉄砲組が並ぶ', obj: '斜面の鉄砲組を破れ', max: 70,
        say: [['足軽', '山の上から撃ち下ろしてくる！　身を低うせよ']],
        foes: () => [keep('後藤勢の鉄砲組', SLOPE, [uS(2), uA(8), uG(8)], { dx: -12 })],
        reward: '小松山の斜面を破った' }),
      // ③ 頂の後藤又兵衛（孤立。必ず討たれる）
      DP.fight({ at: TOP, title: '後藤又兵衛', sub: '後続は霧で遅れ、小松山の頂は孤立している', obj: '頂の後藤又兵衛を討て', max: 100,
        say: [['後藤又兵衛', '薄田も真田も遅れたか。ならば我が手で、この山を墓所とする！'], ['足軽', '黒の甲冑、又兵衛じゃ！　手勢は五百も無い！']],
        foes: () => [keep('後藤又兵衛の手', TOP, [{ type: 'busho', n: 1, o: { name: '後藤又兵衛', horse: false, hat: 'kabuto_t' } }, uS(4), uA(10), uG(4)], { dx: -6, morale: 100, noRout: 120 })],
        later: [{ t: 35, say: ['後藤の侍', '殿をお守りせよ！　一歩も退くな！'], foes: () => [keep('後藤勢の新手', TOP, [uS(2), uA(9), uG(3)], { dx: -22, dz: 10 })] }],
        onEnd: (rt2) => matabeiDown(rt2) }),
      // ④ 薄田兼相の手が遅れて着く。伊達・水野と頂を固める
      DP.hold({ at: TOP, dur: 55, r: 16, title: '薄田兼相の寄せ', sub: '又兵衛を失った山へ、後続が駆け付ける', label: '小松山の頂', obj: '薄田兼相の手を退け、頂を守れ',
        say: [['水野勝成', '又兵衛は果てた。じゃが豊臣の後続が来る。頂を渡すな']],
        waves: [
          { t: 5, say: ['足軽', '薄田隼人の旗じゃ！　山の西から駆け上がってくる！'], foes: () => [keep('薄田兼相の手', TOP, [{ type: 'busho', n: 1, o: { name: '薄田兼相', horse: false, hat: 'kabuto_g' } }, uS(3), uA(12), uG(3)], { dx: -48, dz: -6, noRout: 20 })] },
          { t: 28, say: ['足軽', '新手が霧の中から！　伊達殿はまだか！'], foes: () => { datearrive(rt); return [keep('豊臣の新手', TOP, [uS(2), uA(11), uG(3)], { dx: -52, dz: 14 })]; } },
        ],
        reward: '小松山の頂を守り抜いた' }),
      DP.rest({ dur: 6, heal: 0.3, fn: (rt2) => { F.cl?.go?.(); },
        banner: ['真田信繁・毛利勝永が着く', '霧が晴れ、西の野に赤い旗が並ぶ'],
        say: [['伊達政宗', '真田が来た。野で鉄砲を並べて迎える。片倉、前へ！'], ['水野勝成', '遅れて着いたが、数は我らより多い。気を抜くな']] }),
      // ⑤ 野の鉄砲戦（伊達の片倉隊と並ぶ）
      DP.fight({ at: PLAIN, title: '道明寺の野', sub: '伊達勢と真田・毛利が鉄砲を撃ち合う', obj: '毛利勝永・真田信繁の手を迎え撃て', max: 110,
        say: [['片倉重長', '放て！　撃ち続けよ。弾が尽きるまで野を渡らせるな！']],
        foes: () => [
          keep('毛利勝永の手', PLAIN, [{ type: 'busho', n: 1, o: { name: '毛利勝永', invuln: true, horse: false, hat: 'kabuto_m', ...MORI } }, uS(3), uA(10), uG(8)], { dx: -50, dz: 12, noRout: 30 }),
          keep('真田信繁の手', PLAIN, [{ type: 'busho', n: 1, o: { name: '真田信繁', invuln: true, horse: false, ...SANADA } }, uS(3), uA(10), uG(8)], { dx: -56, dz: -12, noRout: 30 }),
        ],
        later: [{ t: 30, say: ['真田信繁', '関東勢百万と候え、男は一人もなし。引け、秀頼様の城を守る'], foes: () => [keep('豊臣の殿', PLAIN, [uS(2), uA(10), uG(5)], { dx: -64, dz: 0 })] }],
        reward: '真田・毛利の寄せを鉄砲戦で退けた' }),
      // ⑥ しんがり
      DP.hold({ at: PLAIN, dur: 30, r: 16, title: '大坂へ退く', sub: '信繁のしんがりが、追う者を斬り払う', label: '道明寺の野', obj: 'しんがりの逆襲を退けよ',
        waves: [{ t: 4, say: ['足軽', '殿の真田勢が返してくる！'], foes: () => [keep('真田のしんがり', PLAIN, [uS(2), uA(10), uG(5)], { dx: -50, dz: 0 })] }],
        reward: '豊臣勢を大坂へ退かせた' }),
    ], (rt2) => this.win(rt2));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    F.cl?.rout?.('B');
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '道明寺を制した', pts: 40 }; }, '道明寺の野を制した');
    sfx('horagai', 0.9);
    rt.banner('豊臣勢、大坂へ退く', '慶長二十年五月六日　道明寺・誉田の戦い');
    rt.player.u.invuln = true;
    rt.after(2, () => rt.say('水野勝成', '真田は退いた。深追いはならぬ。大坂城までは、あと数里よ', 4));
    rt.after(6.5, () => rt.say('伊達政宗', '真田信繁、噂に違わぬ男よ。明日の戦は、ただでは済まぬ', 4.4));
    rt.after(11, () => rt.say(nm(rt), '又兵衛殿は小松山に果てた。豊臣の命運も、もう長くはあるまい', 4.4));
    rt.finish({}, 16);
  },

  lose(rt) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('日が暮れ切った', '豊臣勢を退けられなかった');
    rt.say('水野勝成', '日が暮れた。今日のうちに決められなんだ', 4);
    rt.finish({ failureReason: '日が暮れるまでに豊臣勢を退けられなかった' }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    if (F.ending) return;
    depthTick(rt, dt);
    if (F.goto && F.dp && F.dp.i >= 3) { for (const h of F.goto) if (h && h.rout) h.rout({ hideAfter: 20 }); F.goto = null; }
    if (F.begun && !F.dusk && F.dp && F.dp.i >= 6) { F.dusk = true; rt.world.setTime('dusk'); }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt);
    else if (F.begun && !F.warned && rt.t - F.t0 > LIMIT - 60) { F.warned = true; rt.say('足軽', '西の空が赤い！　日が暮れる、急げ', 3.5); }
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

k13_domyoji.force = (rt) => ({ a: Math.round(25000 - (rt.flags.ak || 0) * 20), a0: 25000, b: Math.max(0, 12000 - (rt.flags.ek || 0) * 30), b0: 12000 });
k13_domyoji.sides = { a: { name: '徳川方', mon: 'tokugawa' }, b: { name: '豊臣方', mon: 'toyotomi' } };
k13_domyoji.date = (rt) => (rt.flags.dusk ? '慶長二十年（1615）五月六日　夏・夕暮れ' : '慶長二十年（1615）五月六日　夏・朝霧');
k13_domyoji.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k13_domyoji.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k13_domyoji.history = '慶長二十年（1615）五月六日、大坂夏の陣。大和路から大坂へ向かう徳川方（水野勝成・松平忠輝・伊達政宗・片倉重長ら）を、豊臣方は国分の隘路で迎え撃つ策を立てた。後藤又兵衛は薄田兼相・真田信繁・毛利勝永らの到着を待たず、霧の中を小松山へ先に出た。後続が遅れたため又兵衛は孤立し、伊達・水野の大軍と戦って討死した。遅れて着いた薄田兼相も討たれ、信繁・勝永は伊達勢の片倉重長の鉄砲隊と戦ったのち、日暮れに大坂へ退いた。信繁が殿を務めたと伝えられる。\n両軍の数や細かい陣の動きは史料により異なり、地形は遊びのために縮めて復元した推定である。';
k13_domyoji.bushou = [{ name: '後藤又兵衛', g: /後藤/ }, { name: '薄田兼相', g: /薄田/ }];

k13_domyoji.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, START.x - 6, START.z, 3);
};

const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
STAGES.k13_domyoji = [['小松山の麓へ進む'], ['小松山の斜面を破る', dpAt(1)], ['頂の後藤又兵衛を討つ', dpAt(2)], ['薄田兼相の寄せを退ける', dpAt(3)], ['伊達勢と並び真田・毛利を迎え撃つ', dpAt(5)], ['しんがりを退け、豊臣勢を大坂へ退かせる', dpAt(6)]];

export { k13_domyoji };
export default k13_domyoji;
