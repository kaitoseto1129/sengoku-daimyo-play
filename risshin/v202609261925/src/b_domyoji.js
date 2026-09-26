// ======================================================================
// 大坂の陣　夏の陣・道明寺の戦い（慶長二十年五月六日）
// 河内の道明寺。夜のうちに石川を渡った後藤又兵衛（基次）の二千八百が小松山に登り、
// 大和口から来た徳川の先手（水野勝成・本多忠政・松平忠明、のちに伊達政宗）を迎え撃つ。
// 真田・毛利の後詰は、濃い霧で道に迷って遅れた。足軽は徳川方・水野勝成の手。
// ①霧の中を小松山へ寄せる ②又兵衛の駆け下りを受け止め、小松山を奪う ③遅れて石川を渡る薄田兼相の隊を瀬で止める
// ④誉田に着いた真田・毛利を前に、石川を渡らず持ちこたえる（豊臣勢は大坂へ退く）
// 向き：西が -x（大坂）。石川は北から南へ流れ、x ≒ -52。小松山は石川の東
// ======================================================================
import { nobori, jinmaku, tawara, hut } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';

const ISHI = [[-46, -180], [-52, -100], [-50, -30], [-56, 30], [-52, 100], [-58, 180]];   // 石川
const KOMA = { x: 4, z: -18 };           // 小松山の頂
const MIZUNO = { x: 84, z: 14 };         // 水野勝成の手（はじめの持ち場）
const FOOT = { x: 34, z: -8 };           // 小松山の東の麓
const FORD = { x: -44, z: 6 };           // 石川の中の瀬（東の岸）
const HONDA = { x: -110, z: 80 };        // 誉田（真田・毛利が着く所）
const FOG_T0 = 40, FOG_T1 = 110;         // 霧の晴れはじめと晴れきり（秒）

const GOTO = { armor: 0x2a2624, lace: 0x5a2a1c, flag: 'toyotomi' };
const SANADA = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };
const TOYO = { armor: 0x2c2a2a, lace: 0x6a5a3a, flag: 'toyotomi' };
const MIZ = { flag: 'tokugawa' };
const DATE = { armor: 0x1c1a1a, lace: 0x2a2a3a, flag: 'date' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || g.count === 0 || g.routed;
const soften = (g) => { for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.4; return g; };
const lerp = (a, b, t) => a + (b - a) * t;
const MIST = { r: 0.8, g: 0.81, b: 0.8 };

function height(x, z) {
  let h = 0.5 * Math.sin(x * 0.035) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.05 + x * 0.03);
  // 小松山（東の尾根とつながる）・東の国分の山並み・西の誉田の台
  h += 15 * gauss(x, z, KOMA.x, KOMA.z, 1300) + 8 * gauss(x, z, KOMA.x + 26, KOMA.z - 26, 1200);
  h += Math.max(0, x - 120) * 0.3 + 12 * gauss(x, z, 150, -110, 3000);
  h += 3 * gauss(x, z, HONDA.x - 20, HONDA.z, 2600);
  return h;
}

const domyoji = {
  spawn: { x: MIZUNO.x + 3, z: MIZUNO.z + 4, heading: -Math.PI / 2 },
  world: {
    seed: 1615,
    time: 'day',
    mist: true,
    muddy: 0.3,
    paths: [[[178, 30], [110, 20], [60, 10], [30, 26], [-20, 20], [-60, 14], [-110, 30], [-178, 40]]],
    height,
    tint(x, z, h, c) {
      // 小松山の雑木と岩
      if (h > 6) c.setRGB(c.r * 0.84, c.g * 0.93, c.b * 0.82);
      // 石川の川原
      let d = Infinity;
      for (let i = 0; i < ISHI.length - 1; i++) { const [ax, az] = ISHI[i], [bx, bz] = ISHI[i + 1]; if (z >= az && z <= bz) d = Math.abs(x - (ax + (bx - ax) * (z - az) / (bz - az))); }
      if (d < 12) { const k = 1 - d / 12; c.setRGB(c.r * (1 - 0.5 * k) + 0.27 * k, c.g * (1 - 0.5 * k) + 0.26 * k, c.b * (1 - 0.5 * k) + 0.22 * k); }
    },
    clear: (x, z) => x > -40 && x < 110 && Math.abs(z) < 90 && Math.hypot(x - KOMA.x, z - KOMA.z) > 26,
    paddy(x, z) {
      if (x < 40 || x > 130 || z < -80 || z > 90 || Math.abs(z - 16) < 6) return 0;
      if ((Math.floor(x / 13) + Math.floor(z / 11)) % 3 === 1) return 0;
      const ex = Math.min(((x % 13) + 13) % 13, 13 - ((x % 13) + 13) % 13), ez = Math.min(((z % 11) + 11) % 11, 11 - ((z % 11) + 11) % 11);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.8;
    },
    streams: [{ pts: ISHI, w: 6, depth: 1.3 }],
    trees: 420,
    tufts: 4200,
    treeDensity: (x, z) => (Math.hypot(x - KOMA.x, z - KOMA.z) < 30 ? 0.55 : x > 130 || Math.abs(z) > 110 ? 1 : 0.2),
    groves: [{ x: KOMA.x - 6, z: KOMA.z + 14, r: 10, n: 16 }, { x: HONDA.x + 10, z: HONDA.z + 20, r: 16, n: 26 }, { x: -96, z: -50, r: 12, n: 16 }],
    // 退く豊臣の兵は、石川の向こう（西）で消す
    fleeOut: (x, z, team) => team === 1 && x < -80,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.fog = 1; F.ek = 0; F.ak = 0;
    // ---- 徳川方：水野勝成の手（自分の持ち場）・本多忠政・松平忠明 ----
    F.miz = allyGroup(rt, { faction: 'tokugawa', name: '水野勝成の手', anchor: { ...MIZUNO }, facing: -Math.PI / 2, width: 14, aggro: 7, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '水野勝成', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], MIZ));
    F.mizU = F.miz.units[0];
    F.honda = allyGroup(rt, { faction: 'tokugawa', name: '本多忠政の手', anchor: { x: MIZUNO.x + 4, z: MIZUNO.z - 26 }, facing: -Math.PI / 2, width: 14, aggro: 7, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '本多忠政', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a2a2a } }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 3 }], MIZ));
    F.matsu = allyGroup(rt, { faction: 'tokugawa', name: '松平忠明の手', anchor: { x: MIZUNO.x + 6, z: MIZUNO.z + 26 }, facing: -Math.PI / 2, width: 14, aggro: 7, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '松平忠明', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 3 }], MIZ));
    F.east = [F.miz, F.honda, F.matsu];
    for (const g of F.east) { g.defMult = 1.25; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: MIZUNO.x + 4, z: MIZUNO.z + 7 }, -Math.PI / 2, [{ kind: 'spear', n }]);

    // ---- 豊臣方：小松山の後藤又兵衛 ----
    F.g1 = soften(enemyGroup(rt, { faction: 'saito', name: '後藤の先手', anchor: { x: KOMA.x + 12, z: KOMA.z + 4 }, facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, aggro: 10, width: 14, noRout: true, formation: 'yari', dmgMult: 0.62, defMult: 1.2 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 5 }], GOTO)));
    F.gotoG = soften(enemyGroup(rt, { faction: 'saito', name: '後藤又兵衛の旗本', anchor: { x: KOMA.x - 2, z: KOMA.z - 2 }, facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, aggro: 6, width: 10, noRout: true, dmgMult: 0.62, defMult: 1.4 },
      dress([{ type: 'busho', n: 1, o: { name: '後藤又兵衛', invuln: true, horse: true, hat: 'kabuto_t', haori: 0x2a2a2a, flagScale: 1.3 } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 18 }], GOTO)));
    F.gotoU = F.gotoG.units[0];
    F.gotoU.dmg *= 0.5;   // 馬上の将は、足軽ひとりを斬り伏せるより兵を率いて押す役

    // ---- 陣と旗 ----
    for (const [x, z, k] of [[KOMA.x - 4, KOMA.z - 6, 'toyotomi'], [KOMA.x + 6, KOMA.z + 2, 'toyotomi'], [KOMA.x + 2, KOMA.z - 10, 'toyotomi']]) rt.scene.add(nobori(W, x, z, k, 6));
    rt.scene.add(jinmaku(W, 150, 20, 18, 12, 6));   // 国分の徳川の陣
    for (const [x, z, k] of [[144, 14, 'tokugawa'], [156, 14, 'tokugawa'], [MIZUNO.x - 6, MIZUNO.z - 8, 'tokugawa'], [MIZUNO.x - 6, MIZUNO.z + 8, 'tokugawa']]) rt.scene.add(nobori(W, x, z, k, x > 100 ? 7 : 5));
    // 道明寺の村（石川の西）
    for (const [x, z, r] of [[-86, 18, 0.2], [-96, 34, -0.3], [-80, 44, 0.5], [-104, 8, 0.1]]) rt.scene.add(hut(W, x, z, 7, 5, r, { roof: 0x6a5c44 }));
    rt.scene.add(tawara(W, 100, 24, 0.3, 5));

    // ---- 大軍（軽い作り）：大和口の徳川勢二万三千 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    const TK = 0x24221f;
    [[120, -40, 'tokugawa'], [126, 60, 'tokugawa'], [150, -10, 'tokugawa'], [160, 70, 'tokugawa'], [110, 110, 'date'], [140, 120, 'date'], [100, -100, 'tokugawa']]
      .forEach(([x, z, f], i) => DA(x, z, 28, 14, 220, -Math.PI / 2, f === 'date' ? DATE.armor : TK, f, 1650 + i));
    // 小松山の上の後藤の兵
    DA(KOMA.x - 8, KOMA.z, 10, 18, 90, Math.PI / 2, GOTO.armor, 'toyotomi', 1660);
    // 誉田に遅れて着く真田・毛利（はじめは見えない）
    F.late = [DA(HONDA.x, HONDA.z, 30, 14, 260, Math.PI / 2, SANADA.armor, 'sanada', 1661), DA(HONDA.x + 6, HONDA.z - 40, 30, 14, 240, Math.PI / 2, TOYO.armor, 'toyotomi', 1662), DA(HONDA.x - 20, HONDA.z + 34, 26, 12, 200, Math.PI / 2, SANADA.armor, 'sanada2', 1663)];
    for (const m of F.late) m.visible = false;

    rt.world.setTime('day');
    rt.setPhase('fog');
    rt.obj('main', '霧の中、水野の手に加わって小松山へ寄せよ', 'main');
    rt.obj('stay', '霧が晴れるまで水野の旗から離れない', 'order');
    rt.say('', '慶長二十年五月六日　河内国 道明寺', 3.5);
    rt.say('水野勝成', `${nm(rt)}、夜のうちに後藤又兵衛が石川を渡り、あの小松山に登ったと物見が知らせてきた`, 5);
    rt.say('水野勝成', '又兵衛は古今の剛の者。じゃが、あとに続く豊臣の兵はまだ見えぬ。今のうちに山を取る', 4.5);
    rt.say('', '朝霧で一町先も見えません。水野の旗について進みます', 4);
    rt.after(16, () => this.advance(rt));
  },

  // ① 霧の中、小松山の麓へ
  advance(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('advance');
    sfx('taiko', 1);
    rt.say('水野勝成', '進め！　山の麓まで槍を揃えて押し出せ！', 3);
    rt.obj('main', '小松山の後藤勢を攻めよ', 'main');
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.2; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 10; }; };
    go(F.miz, FOOT.x, FOOT.z); go(F.honda, FOOT.x + 4, FOOT.z - 26); go(F.matsu, FOOT.x + 6, FOOT.z + 24);
    rt.after(18, () => { if (F.step === 1) { sfx('volley', 0.6); rt.army.play('gun', { x: KOMA.x + 10, z: KOMA.z }, 1.4); rt.say('足軽', '山の上から鉄砲じゃ！　霧の中から撃ってくる！', 3); } });
    rt.after(30, () => this.attack(rt));
  },

  // 小松山へかかる（又兵衛の先手が山の上で槍を揃える）
  attack(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('komatsu');
    sfx('horagai', 0.9);
    rt.banner('小松山へかかれ', '後藤又兵衛の先手が山の上に');
    rt.say('水野勝成', 'かかれぇっ！　山の上の者を追い落とせ！', 3);
    for (const g of F.east) { g.order = 'attack'; g.seekRange = 60; g.formation = 'line'; }
    rt.marker('g1', centerOf(F.g1), () => `後藤の先手・${moraleWord(F.g1.morale)}`, { red: true, group: F.g1 });
    rt.after(10, () => { rt.army.play('eshout', F.gotoU.pos, 1.6); F.gotoU.cheer = 1.5; rt.say('後藤又兵衛', 'ここを破られては後がない！　踏みとどまれ！　一歩も退くな！', 4); });
    rt.after(40, () => this.charge(rt));
  },

  // ② 又兵衛の駆け下り
  charge(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('charge');
    sfx('taiko', 1); rt.after(0.4, () => sfx('horagai', 1));
    rt.banner('又兵衛、山を駆け下る', '後藤の旗本が、寄せ手の中へ');
    rt.say('足軽', '山の上から又兵衛が駆け下りてくるぞ！', 3);
    rt.say('水野勝成', '崩れるな！　槍を立てて受け止めよ！', 3);
    const g = F.gotoG;
    g.order = 'attack'; g.seekRange = 70; g.aggro = 14; g.speed = 3.2;
    rt.marker('goto', unitPos(F.gotoU), '後藤又兵衛', { red: true, h: 3.4 });
    rt.after(20, () => { if (!F.gotoDown) rt.banner('奥田忠次、討死', '徳川の先手の将が、又兵衛の兵に討たれる'); });
    // 伊達勢が南から着き、鉄砲を浴びせる
    rt.after(34, () => this.dateArrive(rt));
  },
  dateArrive(rt) {
    const F = rt.flags;
    if (F.dateG) return;
    const g = soften(allyGroup(rt, { faction: 'tokugawa', name: '片倉重長の鉄砲', anchor: { x: 60, z: 90 }, facing: -Math.PI * 0.75, width: 14, aggro: 34, noRout: true, speed: 3.4 },
      dress([{ type: 'samurai', n: 1, o: { name: '片倉重長', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x1a1a2a } }, { type: 'gun', n: 10 }, { type: 'cavalry', n: 4 }], DATE)));
    g.order = 'move'; g.dest = { x: KOMA.x + 26, z: KOMA.z + 30 };
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: KOMA.x + 26, z: KOMA.z + 30 }; gg.facing = -Math.PI * 0.8; gg.aggro = 34; };
    g.focus = F.gotoU;
    F.dateG = g;
    sfx('taiko', 0.8);
    rt.banner('伊達勢、着陣', '片倉重長の鉄砲が、南から又兵衛を撃つ');
    rt.say('伝令', '伊達政宗殿の先手、片倉小十郎殿、着陣！', 3);
    // ここから又兵衛は討たれうる
    rt.after(24, () => { F.gotoU.invuln = false; F.gotoU.announced = true; rt.after(6, () => { if (F.gotoU.alive) F.gotoU.announced = false; }); });
  },

  // 又兵衛が倒れ、小松山の後藤勢が崩れる
  gotoFell(rt, how) {
    const F = rt.flags;
    if (F.gotoDown) return;
    F.gotoDown = true;
    rt.unmark('goto'); rt.unmark('g1');
    rt.banner('後藤又兵衛、討死', how);
    rt.say('足軽', '又兵衛が倒れたぞ！　後藤勢が崩れる！', 3);
    for (const g of [F.g1, F.gotoG]) if (!gone(g)) { g.noRout = false; g.morale = Math.min(g.morale, 12); }
    rt.award((t) => { t.side.push('小松山を取った'); }, '小松山を取った');
    rt.after(9, () => this.susukida(rt));
  },

  // ③ 遅れて着いた薄田兼相・明石全登が石川を渡る
  susukida(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('river');
    sfx('taiko', 1);
    rt.banner('薄田兼相・明石全登、着陣', '霧で道を誤り、又兵衛に遅れて着いた');
    rt.say('水野勝成', '石川の向こうに新手じゃ！　瀬を渡らせるな。川べりで止めよ！', 4);
    rt.obj('main', '石川の瀬を渡ってくる薄田兼相の隊を止めよ', 'main');
    rt.obj('stay', '石川を渡って追わない（川の東に留まる）', 'order');
    F.strayed = false;
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.6; g.formation = 'yari'; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 11; gg.facing = -Math.PI / 2; }; };
    go(F.miz, FORD.x + 16, FORD.z); go(F.honda, FORD.x + 18, FORD.z - 26); go(F.matsu, FORD.x + 20, FORD.z + 26);
    const s = soften(enemyGroup(rt, { faction: 'saito', name: '薄田兼相の隊', anchor: { x: -96, z: 10 }, facing: Math.PI / 2, order: 'attack', seekRange: 90, aggro: 12, width: 14, morale: 90, noRout: true, fleeDir: { x: -1, z: 0 }, dmgMult: 0.36, speed: 2.6 },
      dress([{ type: 'busho', n: 1, o: { name: '薄田兼相', horse: true, invuln: true, hat: 'kabuto_m', haori: 0x4a2a1a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 11 }], TOYO)));
    s.units[0].dmg *= 0.5;
    const a = soften(enemyGroup(rt, { faction: 'saito', name: '明石全登の隊', anchor: { x: -100, z: -34 }, facing: Math.PI / 2, order: 'attack', seekRange: 90, aggro: 12, width: 14, morale: 80, fleeDir: { x: -1, z: 0 }, dmgMult: 0.36, speed: 2.4 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], TOYO)));
    F.w4 = [s, a];
    rt.marker('susu', centerOf(s), () => `薄田兼相の隊・${moraleWord(s.morale)}`, { red: true, group: s });
    rt.marker('akashi', centerOf(a), () => `明石全登の隊・${moraleWord(a.morale)}`, { red: true, group: a });
    rt.after(25, () => { for (const u of s.units) if (u.type === 'busho') u.invuln = false; });
    rt.after(40, () => { s.noRout = false; });
  },

  // ④ 誉田に真田・毛利。石川を挟んでにらみ合い、豊臣勢は大坂へ退く
  lateArrive(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5; F.stepT = rt.t;
    rt.setPhase('late');
    rt.unmark('susu'); rt.unmark('akashi');
    for (const g of F.w4) if (!gone(g)) { g.noRout = false; g.morale = 0; }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '道明寺の瀬を守った', pts: 20 }; }, '石川の瀬を守った');
    for (const m of F.late) m.visible = true;
    sfx('taiko', 0.9); rt.after(0.5, () => sfx('horagai', 0.8));
    rt.player.cine = { x: HONDA.x, z: HONDA.z, t: 3.5 };
    rt.banner('真田・毛利勢、誉田に着く', '赤備えの旗が、石川の向こうに並ぶ');
    rt.say('足軽', '川の向こうに赤い旗が……！　真田じゃ！', 3);
    rt.say('水野勝成', '渡るな！　伊達勢が誉田で当たっておる。我らはこの岸を固めよ', 4);
    rt.obj('hold', '石川の東岸を固め、豊臣勢が退くまで持ちこたえよ', 'main');
    F.holdEnd = rt.t + 60;
    // 真田の鉄砲が川向こうから撃ちかけてくる（渡っては来ない）
    const g = soften(enemyGroup(rt, { faction: 'saito', name: '真田の鉄砲', anchor: { x: -78, z: 20 }, facing: Math.PI / 2, order: 'hold', aggro: 26, width: 12, morale: 90, noRout: true, fleeDir: { x: -1, z: 0.3 }, dmgMult: 0.4 },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 5 }, { type: 'ashigaru', n: 5 }], SANADA)));
    for (const u of g.units) if (u.type === 'gun') u.range = 30;
    F.sanaG = g;
    rt.after(22, () => {
      rt.army.play('eshout', { x: HONDA.x, z: HONDA.z }, 1.2);
      rt.banner('誉田の戦い', '伊達勢と真田勢がぶつかり、押し戻される');
      rt.say('伝令', '伊達勢、真田に押し戻されました！　真田は深追いせず、陣を固めておりまする', 4);
    });
    rt.after(44, () => {
      rt.say('', '――日が傾くころ、大坂城から退けの下知が届いた。真田信繁は殿（しんがり）となって、兵をまとめて退いたという', 5.5);
      rt.after(5.5, () => rt.say('真田信繁', '関東勢百万と候え、男は一人もなく候', 4));
    });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('hold');
    if (!F.strayed) rt.objDone('stay');
    if (F.sanaG && !gone(F.sanaG)) { F.sanaG.noRout = false; F.sanaG.morale = 0; }
    for (const m of F.late) m.visible = false;
    sfx('horagai', 0.8);
    rt.banner('豊臣勢、大坂へ退く', '道明寺の戦、終わる');
    rt.say('水野勝成', `${nm(rt)}、よう働いた。明日はいよいよ大坂じゃ。天王寺口で決着がつく`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    // 朝霧（関ヶ原と同じ作り）：はじめは一町先も見えず、しだいに晴れる
    F.fog = rt.t < FOG_T0 ? 1 : Math.max(0, 1 - (rt.t - FOG_T0) / (FOG_T1 - FOG_T0));
    if (F.fog > 0) {
      const f = rt.scene.fog, k = F.fog;
      f.near = Math.min(f.near, lerp(40, 3, k));
      f.far = Math.min(f.far, lerp(230, 36, k));
      if (!F.fogCol) F.fogCol = f.color.clone();
      f.color.copy(F.fogCol).lerp(MIST, k);
      const W = rt.world, U = W.skyMat && W.skyMat.uniforms;
      if (U && U.top && U.bottom) {
        if (!F.skyCol) F.skyCol = { top: U.top.value.clone(), bottom: U.bottom.value.clone() };
        U.top.value.copy(F.skyCol.top).lerp(MIST, k * 0.9);
        U.bottom.value.copy(F.skyCol.bottom).lerp(MIST, k);
      }
      if (W.mountU) { W.mountU.mist.value = Math.max(W.mountU.mist.value, k); W.mountU.hazeCol.value.copy(f.color); }
      for (const m of (W.mountains && W.mountains.children) || []) if (m.material.uniforms && m.material.uniforms.haze) m.material.uniforms.haze.value = Math.max(m.material.uniforms.haze.value, k);
    } else if (F.fogCol && !F.fogClear) {
      F.fogClear = true;
      rt.scene.fog.color.copy(F.fogCol);
      const U = rt.world.skyMat && rt.world.skyMat.uniforms;
      if (U && F.skyCol) { U.top.value.copy(F.skyCol.top); U.bottom.value.copy(F.skyCol.bottom); }
      rt.banner('霧が晴れた', '小松山と石川の河原が見える。豊臣の後詰の旗は、まだ見えない');
      if (!F.strayed && F.step < 4) { rt.objDone('stay'); rt.objRemove('stay'); }
    }
    if (F.ending) return;
    // 霧の間、水野の旗から離れたか
    if (F.step >= 1 && F.step < 4 && F.fog > 0.25 && !F.strayed) {
      const d = Math.hypot(p.x - F.mizU.pos.x, p.z - F.mizU.pos.z);
      F.strayT = d > 26 ? (F.strayT || 0) + dt : 0;
      if (F.strayT > 4) { F.strayed = true; rt.violation('霧の中で持ち場を離れた', ['水野勝成', '戻れ！　霧の中ではぐれるなと申したはずじゃ！']); rt.objFail('stay'); }
    }
    // 瀬を守る間は、石川を渡って追わない
    if (F.step >= 4 && !F.strayed && p.x < -60) {
      F.strayT = (F.strayT || 0) + dt;
      if (F.strayT > 4) { F.strayed = true; rt.violation('下知なく石川を渡った', ['水野勝成', '渡るなと申したはずじゃ！　川向こうには真田がおるぞ！']); rt.objFail('stay'); }
    } else if (F.step >= 4) F.strayT = 0;
    if (F.step === 2 || F.step === 3) {
      const live = [F.g1, F.gotoG].reduce((a, g) => a + (gone(g) ? 0 : g.count), 0);
      rt.objProgress('main', `後藤勢 ${live}人`);
      // 先手が弱れば又兵衛の旗本も前へ（待ちを作らない）
      if (F.step === 2 && F.g1.count < 10) this.charge(rt);
      if (F.g1.count < 8) F.g1.noRout = false;
      if (!F.gotoU.alive) this.gotoFell(rt, '伊達勢の鉄砲に撃たれ、小松山に倒れた');
      else if (F.step === 3 && rt.t - F.stepT > 130) { F.gotoU.invuln = false; F.gotoU.hp = 0; rt.army.kill(F.gotoU, null); this.gotoFell(rt, '伊達勢の鉄砲に撃たれ、小松山に倒れた'); }
      else if (F.step === 3 && gone(F.gotoG) && gone(F.g1)) this.gotoFell(rt, '兵を失い、小松山で力尽きた');
    }
    if (F.step === 4) {
      const live = F.w4.reduce((a, g) => a + (gone(g) ? 0 : g.count), 0);
      rt.objProgress('main', `薄田・明石 ${live}人`);
      if (F.w4.every(gone) || rt.t - F.stepT > 110) this.lateArrive(rt);
    }
    if (F.step === 5) {
      const left = Math.max(0, Math.ceil(F.holdEnd - rt.t));
      rt.objProgress('hold', `豊臣勢が退くまで ${left}秒`);
      if (left <= 0) this.win(rt);
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v.type === 'busho' && v.team === 1) {
      if (v === F.gotoU) return;
      if (!(k && k.isPlayer)) rt.banner(`${v.name}、討死`, '道明寺の河原に倒れる');
      if (v.group) { v.group.noRout = false; v.group.morale -= 35; }
    }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1) return;
    if (g === F.g1) rt.say('足軽', '後藤の先手が崩れたぞ！', 2.5);
    else if (g === F.sanaG) return;
    else rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 両軍の総勢（戦国大名に合わせ、徳川 二万三千、豊臣 一万二千。はじめは後藤の二千八百だけ。後詰は遅れて着く）
domyoji.force = (rt) => {
  const F = rt.flags;
  const arrived = 2800 + (F.step >= 4 ? 3600 : 0) + (F.step >= 5 ? 5600 : 0);
  return { a: Math.round(23000 - (F.ak || 0) * 40), a0: 23000, b: Math.max(0, arrived - (F.ek || 0) * 25), b0: 12000 };
};
domyoji.canSkip = (rt) => (rt.phase === 'fog' && rt.t > 3 ? '寄せの下知まで待つ' : '');
domyoji.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
domyoji.sides = { a: { name: '徳川方（大和口）', mon: 'tokugawa' }, b: { name: '豊臣方', mon: 'toyotomi' } };
domyoji.date = (rt) => {
  const F = rt.flags;
  const w = F.fog > 0.6 ? '朝霧' : F.fog > 0 ? '霧が晴れていく' : '晴';
  const t = rt.t < 120 ? '朝' : rt.t < 260 ? '昼' : '昼下がり';
  return `慶長二十年五月六日　夏・${w}・${t}`;
};
domyoji.history = '慶長二十年（元和元年）五月六日、大坂夏の陣の道明寺の戦い。冬の陣の和睦で堀を埋められた豊臣方は、城を出て戦うほかなかった。後藤又兵衛（基次）は二千八百ほどで夜のうちに石川を渡り、小松山に登って、大和口から来た水野勝成・本多忠政・松平忠明・伊達政宗らの徳川勢を迎え撃った。濃い霧のため、あとに続くはずの真田信繁・毛利勝永らは遅れ、又兵衛は数時間の奮戦の末に討ち死にした。遅れて着いた薄田兼相も討ち死にし、明石全登は傷を負った。昼すぎ、真田勢は誉田の辺りで伊達勢を押し返したのち、大坂城からの下知で兵をまとめて退いた。「関東勢百万と候え、男は一人もなく候」は、この退き際に信繁が言ったと伝わる言葉である。';

// 素直な遊び手：霧の間は水野の旗のそばで戦い、小松山では後藤勢へ、薄田が来れば瀬へ、最後は東岸で待つ
domyoji.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.6) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const lead = F.mizU.pos;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, lead.x + 12, lead.z, 2); return; }
  const e = b.army.nearestEnemy(u, F.step >= 2 ? 12 : 7, (o) => !o.fleeing && !o.invuln && o.pos.x > -58 && (F.fog < 0.25 || Math.hypot(o.pos.x - lead.x, o.pos.z - lead.z) < 22));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if ((F.step === 2 || F.step === 3) && F.fog < 0.3) { const t = [F.g1, F.gotoG].find((g) => !gone(g)); if (t) { const c = t.center(); goTo(p, inp, c.x, c.z, 2); return; } }
  if (F.step === 4) { const t = F.w4.find((g) => !gone(g)); if (t) { const c = t.center(); if (c.x > -56) { goTo(p, inp, c.x, c.z, 2); return; } } goTo(p, inp, FORD.x + 12, FORD.z, 3); return; }
  if (F.step >= 5) { goTo(p, inp, FORD.x + 20, FORD.z, 3); return; }
  goTo(p, inp, lead.x + 5, lead.z + 2, 3);
};

export { domyoji };
