// ======================================================================
// 信長包囲網　金ヶ崎の退き口（元亀元年四月二十八日〜晦日）
// 越前の金ヶ崎。朝倉を攻めていた織田勢は、北近江の浅井長政の裏切りで前後を挟まれた。
// 信長はわずかな供で朽木越えに京へ逃れ、殿（しんがり）に木下藤吉郎・明智光秀・池田勝正が残る。
// 足軽は木下の手。①一の備（金ヶ崎の麓）で朝倉の先手を食い止める ②笙の川まで繰り引き、騎馬の追手を川で受ける
// ③狭路まで退き、朝倉景鏡の本隊を、主力が退ききるまで食い止める（退き口成る）
// 向き：北が -z（木ノ芽峠から朝倉が来る）。東（+x）が敦賀の海。退き口は南西（朽木へ）
// ======================================================================
import { nobori, jinmaku, tawara, hut, carryTorches } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { applyLook, NIGHT } from './b_inabayama.js';
// 日が落ちきる前の、薄暮の色（夕暮れと夜の間）
const DUSK2 = { sky: 0x4a4658, fog: 0x3e3c4c, sun: 0xc88a6a, sunI: 0.8, hs: 0x8a86a0, hg: 0x2a2624, hI: 1.1, top: 0x262c44, glow: 0.12, dir: [-0.9, 0.08, 0.3], mount: 0x1a1c22 };

const SHO = [[-180, 34], [-100, 22], [-30, 14], [30, 10], [90, 6], [130, 2]];   // 笙の川（西から海へ）
const ROAD = [[-6, -176], [2, -110], [8, -50], [8, 12], [-10, 60], [-26, 104], [-54, 150], [-70, 176]];
const CASTLE = { x: 96, z: -128 };       // 金ヶ崎城（海に突き出た岬の山）
const TEZUTSU = { x: 48, z: -98 };       // 天筒山
// 殿の三つの備（持ち場）と、そこで向く向き（北 = Math.PI）
const LINES = [
  { x: 8, z: -46, r: 12, name: '一の備（金ヶ崎の麓）' },
  { x: 6, z: 24, r: 12, name: '二の備（笙の川の南）' },
  { x: -22, z: 102, r: 11, name: '三の備（狭路）' },
];
const RETREAT_T = 230;
const KUTSUKI = { x: -56, z: 150, r: 14 };    // 朽木越えの道の口（信長で遊ぶ時の退き先）                   // 主力が退ききるまでの秒（はじめから）

const ASAKURA = { armor: 0x33291f, lace: 0x7a5a2a, flag: 'asakura' };
const ODA = { flag: 'oda' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || g.count === 0 || g.routed;
const soften = (g) => { for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.45; return g; };

// 遠くの軍勢を動かす（world の揺らしと取り合わないよう、揺れの基点 x0 を動かす）
function moveDA(rt, fa, x, z) {
  fa.x = x; fa.z = z;
  const e = (rt.world.armies || []).find((a) => a.mesh === fa.m);
  if (e) e.x0 = x - fa.x0;
  fa.m.position.z = z - fa.z0;
  fa.m.position.y = rt.world.heightAt(x, z) - rt.world.heightAt(fa.x0, fa.z0);
}

function height(x, z) {
  let h = 0.6 * Math.sin(x * 0.03 + 0.5) * Math.cos(z * 0.027) + 0.35 * Math.sin(z * 0.06 + x * 0.025);
  // 金ヶ崎の岬・天筒山・西の山並み・狭路の両側の山
  h += 22 * gauss(x, z, CASTLE.x, CASTLE.z, 900) + 26 * gauss(x, z, TEZUTSU.x, TEZUTSU.z, 1500);
  h += Math.max(0, -x - 90) * 0.28 + 18 * gauss(x, z, -96, -70, 2600);
  h += 30 * gauss(x, z, -82, 104, 1500) + 26 * gauss(x, z, 36, 122, 1400) + 14 * gauss(x, z, 90, 150, 2000);
  // 狭路：道の両脇に崖のような尾根が迫る細い谷
  h += 16 * gauss(x, z, -52, 96, 500) + 15 * gauss(x, z, 10, 112, 520) + 12 * gauss(x, z, -64, 132, 450) + 10 * gauss(x, z, -14, 146, 420);
  // 東は敦賀の浜から海へ
  if (x > 92) h -= Math.min(9, (x - 92) * 0.34);
  return h;
}

const kanegasaki = {
  spawn: { x: LINES[0].x + 3, z: LINES[0].z + 6, heading: Math.PI },
  world: {
    seed: 1570,
    wind: [0.3, 0.95],   // 北の峠から吹き下ろす風（朝倉の側から）
    time: 'after',
    young: true,     // 四月の越前：若葉の草
    muddy: 0.25,
    water: { x: 118, level: -2.2 },
    paths: [ROAD],
    height,
    tint(x, z, h, c) {
      // 浜の砂
      if (x > 96) { const k = Math.min(1, (x - 96) / 14); c.lerp({ r: 0.62, g: 0.58, b: 0.48 }, k * 0.8); }
      // 山の緑は濃く
      if (h > 7) c.setRGB(c.r * 0.82, c.g * 0.92, c.b * 0.8);
    },
    clear: (x, z) => Math.abs(x) < 70 && z > -90 && z < 80,
    paddy(x, z) {
      if (x < -60 || x > 80 || z < -30 || z > 70 || Math.abs(z - 20) < 12) return 0;
      if (Math.abs(x - 6) < 7) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.7;
    },
    streams: [{ pts: SHO, w: 4.5, depth: 1.2 }],
    trees: 460,
    tufts: 4200,
    treeDensity: (x, z) => (Math.abs(x) < 60 && z > -90 && z < 90 ? 0.2 : 1),
    groves: [{ x: -40, z: -20, r: 12, n: 18 }, { x: 50, z: 50, r: 12, n: 16 }, { x: -50, z: 70, r: 10, n: 14 }, { x: -52, z: 98, r: 10, n: 22 }, { x: 10, z: 112, r: 10, n: 20 }],
    // 退く朝倉の兵は、北の峠道で消す
    fleeOut: (x, z, team) => team === 1 && z < -130,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.line = 0;
    const L = LINES[0];
    // ---- 殿：木下藤吉郎の手（自分の持ち場）、池田勝正の手、明智光秀の鉄砲 ----
    F.kino = allyGroup(rt, { faction: 'oda', name: '木下藤吉郎の手', anchor: { x: L.x, z: L.z }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '木下藤吉郎', invuln: true, hat: 'kabuto_m', haori: 0x6a4a1c } }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 3 }], ODA));
    F.kinoU = F.kino.units[0];
    F.ikeda = allyGroup(rt, { faction: 'oda', name: '池田勝正の手', anchor: { x: L.x - 22, z: L.z + 2 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '池田勝正', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x2a3a4a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }], ODA));
    F.akechi = allyGroup(rt, { faction: 'oda', name: '明智光秀の鉄砲', anchor: { x: L.x + 20, z: L.z + 6 }, facing: Math.PI, width: 12, aggro: 30, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '明智光秀', invuln: true, hat: 'kabuto_w', haori: 0x3a3a52 } }, { type: 'gun', n: 10 }], ODA));
    F.akeU = F.akechi.units[0];
    F.tono = [F.kino, F.ikeda, F.akechi];
    for (const g of F.tono) { g.defMult = 1.3; g.dmgMult = 1; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: L.x + 4, z: L.z + 8 }, Math.PI, [{ kind: 'spear', n }]);

    // ---- 陣と旗：金ヶ崎城と天筒山に織田の旗、麓に陣幕 ----
    for (const [x, z, k] of [[CASTLE.x - 4, CASTLE.z + 6, 'oda'], [CASTLE.x + 4, CASTLE.z + 4, 'eiraku'], [TEZUTSU.x, TEZUTSU.z + 8, 'oda'], [L.x - 6, L.z + 10, 'oda'], [L.x + 8, L.z + 10, 'oda'], [L.x + 22, L.z + 12, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    rt.scene.add(jinmaku(W, 26, -8, 16, 10, 5), tawara(W, 20, -2, 0.4, 5), hut(W, 34, 2, 6, 4, 0.3, { roof: 0x6a5c44 }));
    // 退く道の乱れ：崩れた俵、倒れた旗、捨てた荷
    for (const [x, z, r, n2] of [[2, 40, 0.8, 2], [-14, 78, -0.6, 3], [-30, 116, 1.2, 2], [-44, 138, 0.3, 1]]) rt.scene.add(tawara(W, x + 3, z, r, n2));
    for (const [x, z, r] of [[-4, 52, 0.4], [-20, 92, -1.1], [-36, 124, 2.2]]) { const fl = nobori(W, x, z, 'oda', 5); fl.rotation.set(0, r, 1.45); fl.position.y += 0.15; rt.scene.add(fl); }

    // ---- 大軍（軽い作り） ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => {
      const m = W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
      return { m, x0: x, z0: z, x, z };
    };
    const OD = 0x2b3140;
    // 織田の主力：南の道を朽木の方へ退いていく（時とともに消える）
    F.main = [[-6, 46, 'oda'], [-20, 84, 'eiraku'], [-40, 128, 'oda'], [20, 64, 'oda'], [-4, 110, 'oda'], [-58, 158, 'eiraku']]
      .map(([x, z, f], i) => ({ ...DA(x, z, 14, 26, 200, Math.PI * 0.85, OD, f, 1571 + i), t: 0 }));
    // 金ヶ崎城と天筒山に残る兵
    DA(CASTLE.x, CASTLE.z + 8, 20, 8, 90, Math.PI, OD, 'oda', 1580);
    // 朝倉の大軍：北の峠道から押し寄せ、少しずつ南へ
    F.host = [[-4, -168, 60, 'asakura'], [-60, -150, 40, 'asakura'], [50, -160, 40, 'asakura']]
      .map(([x, z, w, f], i) => DA(x, z, w, 14, 300, 0, ASAKURA.armor, f, 1590 + i));
    // 浅井：南東の山の向こう（近江の方）に旗。背後を断たれる怖さ
    F.azai = [DA(92, 168, 40, 12, 220, Math.PI * 1.15, 0x2e2a26, 'azai', 1600), DA(130, 150, 30, 12, 180, Math.PI * 1.2, 0x2e2a26, 'azai', 1601)];
    for (const [x, z] of [[84, 160], [104, 158]]) rt.scene.add(nobori(W, x, z, 'azai', 7));

    rt.world.setTime('after');
    rt.setPhase('brief');
    // 信長で遊ぶ時：殿を藤吉郎に任せ、旗本と朽木越えの道の口まで退く
    if (rt.G.lord) {
      rt.obj('main', '京へ退け（殿は藤吉郎）：旗本と朽木越えの道の口まで', 'main');
      rt.marker('kutsuki', { x: KUTSUKI.x, z: KUTSUKI.z }, '朽木越えの道', { h: 2 });
      rt.zone('kutsuki', KUTSUKI.x, KUTSUKI.z, KUTSUKI.r);
      rt.say('木下藤吉郎', '殿！　浅井長政殿、朝倉方につきましたぞ。前に朝倉、後ろに浅井――袋の鼠にござる', 5);
      rt.say('木下藤吉郎', '殿（しんがり）はこの藤吉郎が務めまする。殿は一刻も早う、朽木越えに京へ！', 4.5);
      rt.say('織田信長', '猿、殿は任せた。……生きて戻れ', 3.5);
      rt.after(22, () => this.wave1(rt));
      F.t0 = 0;
      return;
    }
    rt.obj('main', '殿として朝倉勢を食い止め、主力の退き口を開けよ', 'main');
    rt.obj('stay', '下知があるまで持ち場を離れない（深追いしない）', 'order');
    rt.marker('kino', unitPos(F.kinoU), '木下藤吉郎', { h: 3.2 });
    rt.after(14, () => rt.unmark('kino'));
    rt.say('木下藤吉郎', `${nm(rt)}、聞いたか。北近江の浅井長政殿が、朝倉方についた。前に朝倉、後ろに浅井――袋の鼠じゃ`, 5.5);
    rt.say('木下藤吉郎', '殿はもう、わずかな供を連れて朽木越えに京へ発たれた。わしらは殿（しんがり）じゃ', 4.5);
    rt.say('木下藤吉郎', '主力が退ききるまで、ここで朝倉を食い止める。退けと言うまで、一歩も退くな。追うな', 4.5);
    rt.after(22, () => this.wave1(rt));
    F.t0 = 0;
  },

  // 主力の退き（はじめからの割合）
  // 自分たちの働きで速まる：寄せを早く崩せば主力は楽に退け、殿の備が崩されれば遅れる
  retreatPct(rt) { return Math.min(100, Math.round((rt.flags.prog ?? rt.t) / RETREAT_T * 100)); },
  tickProg(rt, dt) {
    const F = rt.flags;
    F.prog = F.prog ?? 0;
    const cur = F.step === 1 ? F.w1 : F.step === 3 ? F.w2 : F.step === 5 ? F.w3 : null;
    const live = cur ? cur.reduce((a, g) => a + (gone(g) ? 0 : g.count), 0) : 0;
    let k = 1;
    if (cur && !live) k += 0.4;                       // 寄せが途切れた間は、主力がはかどる
    if (F.kino.count < F.kino.initial * 0.45) k -= 0.35;   // 殿の備が崩されかけると、主力の退きが遅れる
    F.prog += dt * k;
  },

  // ① 一の備：朝倉の先手
  wave1(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('l1');
    sfx('taiko', 1);
    rt.after(0.6, () => sfx('horagai', 0.8));
    rt.banner('朝倉勢、寄せ来る', '木ノ芽峠の道から、朝倉の先手');
    rt.say('足軽', '来たぞ！　三つ盛木瓜の旗じゃ！', 2.5);
    rt.say('明智光秀', '鉄砲、引きつけよ。……放て！', 3);
    F.w1 = [
      soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の先手', anchor: { x: 6, z: -120 }, facing: 0, order: 'attack', seekRange: 90, aggro: 10, width: 14, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.65, speed: 2.6 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 20 }, { type: 'bow', n: 3 }], ASAKURA))),
    ];
    rt.marker('w0', centerOf(F.w1[0]), () => `朝倉の先手・${moraleWord(F.w1[0].morale)}`, { red: true, group: F.w1[0] });
    rt.after(34, () => {
      if (F.step !== 1) return;
      const g = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉景健の隊', anchor: { x: -20, z: -126 }, facing: 0, order: 'attack', seekRange: 90, aggro: 10, width: 14, morale: 95, fleeDir: { x: 0, z: -1 }, dmgMult: 0.65, speed: 2.6 },
        dress([{ type: 'busho', n: 1, o: { name: '朝倉景健', horse: true, invuln: true, hat: 'kabuto_m', haori: 0x5a4020 } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 2 }], ASAKURA)));
      for (const u of g.units) if (u.type === 'busho') { u.dmg *= 0.5; u.announced = true; }
      F.w1.push(g);
      rt.say('足軽', '西からも来る！　朝倉景健の旗じゃ！', 3);
      rt.marker('w1', centerOf(g), () => `朝倉景健の隊・${moraleWord(g.morale)}`, { red: true, group: g });
    });
  },

  // 繰り引き：次の備まで退く（残った者が追ってくる）
  fallBack(rt, k) {
    const F = rt.flags;
    if (F.line >= k) return;
    F.line = k;
    F.step = k * 2;            // 2：二の備へ ／ 4：三の備へ
    F.stepT = rt.t;
    rt.setPhase('back' + k);
    rt.unmark('w0'); rt.unmark('w1'); rt.unmark('w2'); rt.unmark('w3');
    const L = LINES[k];
    sfx('kane', 0.9);
    rt.banner('退け！', `${L.name}まで繰り引き`);
    rt.say('木下藤吉郎', k === 1 ? `退けぇっ！　笙の川の南まで下がる！　${rt.G.lord ? '者ども' : nm(rt)}、遅れるな！` : '次の備じゃ！　狭路まで退け！　あそこなら大勢でも横に広がれぬ', 4);
    if (!rt.G.lord) {
      // 下知と同時に、自分の組にも「ついて来い」
      for (const g of rt.squadGroups || []) if (g.count) g.order = 'follow';
      rt.obj('back', rt.squad.length ? `組を連れて${L.name}まで退け` : `${L.name}まで退け`, 'order');
      rt.zone('line', L.x, L.z, L.r);
      rt.marker('line', { x: L.x, z: L.z }, L.name, { h: 2 });
    }
    // 明智の鉄砲が先に下がって、次の備で待ち受ける
    const put = (g, dx, dz, f = Math.PI) => { g.order = 'move'; g.dest = { x: L.x + dx, z: L.z + dz }; g.speed = 3.4; g.formation = 'column'; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: L.x + dx, z: L.z + dz }; gg.facing = f; gg.formation = gg === F.akechi ? 'line' : 'yari'; }; };
    put(F.akechi, 18, 8);
    rt.after(3, () => { put(F.ikeda, -18, 2); put(F.kino, 0, 0); });
    // 残っている寄せ手は崩れて峠へ戻る
    for (const g of [...(F.w1 || []), ...(F.w2 || [])]) if (!gone(g)) { g.noRout = false; g.morale = Math.min(g.morale, 15); }
    rt.after(k === 1 ? 14 : 12, () => (k === 1 ? this.wave2(rt) : this.wave3(rt)));
  },

  // ② 二の備：騎馬の追手が笙の川を渡ってくる
  wave2(rt) {
    const F = rt.flags;
    if (F.step !== 2 || F.ending) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('l2');
    sfx('taiko', 1);
    rt.banner('追い討ち', '朝倉の騎馬が追ってくる');
    rt.say('足軽', '騎馬じゃ！　川を渡ってくるぞ！', 2.5);
    rt.say('木下藤吉郎', '槍を揃えよ！　川を渡りきる所を突け！', 3);
    const g = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の騎馬の追手', anchor: { x: 4, z: -70 }, facing: 0, order: 'attack', seekRange: 120, aggro: 12, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5, speed: 3.6 },
      dress([{ type: 'samurai', n: 1, o: { horse: true, hat: 'kabuto_m' } }, { type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 10 }], ASAKURA)));
    for (const u of g.units) if (u.type === 'cavalry') u.dmg *= 0.6;
    const g2 = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の追手', anchor: { x: -30, z: -84 }, facing: 0, order: 'attack', seekRange: 120, aggro: 12, width: 12, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.5, speed: 2.8 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], ASAKURA)));
    F.w2 = [g, g2];
    rt.marker('w2', centerOf(g), () => `騎馬の追手・${moraleWord(g.morale)}`, { red: true, group: g });
    rt.marker('w3', centerOf(g2), () => `朝倉の追手・${moraleWord(g2.morale)}`, { red: true, group: g2 });
  },

  // ③ 三の備：朝倉景鏡の本隊
  wave3(rt) {
    const F = rt.flags;
    if (F.step !== 4 || F.ending) return;
    F.step = 5; F.stepT = rt.t;
    rt.setPhase('l3');
    rt.world.setTime('dusk');
    sfx('taiko', 1); rt.after(0.5, () => sfx('horagai', 1));
    rt.banner('朝倉の本隊', '日が傾く。主力が退ききるまで、狭路を守れ');
    rt.say('足軽', 'また来た……！　今度は大勢じゃ！', 2.5);
    rt.say('木下藤吉郎', 'ここが最後の踏ん張りどころじゃ。主力が朽木へ抜けきるまで、この狭路は通さぬ！', 4.5);
    rt.say('池田勝正', '池田の者ども、木下殿に遅れを取るな！', 3);
    const g = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の本隊', anchor: { x: -6, z: -10 }, facing: 0, order: 'attack', seekRange: 140, aggro: 12, width: 16, morale: 100, noRout: true, fleeDir: { x: 0.1, z: -1 }, dmgMult: 0.4, speed: 2.6 },
      dress([{ type: 'busho', n: 1, o: { name: '朝倉の侍大将', horse: true, invuln: true, hat: 'kabuto_w', haori: 0x4a3a1a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], ASAKURA)));
    for (const u of g.units) if (u.type === 'busho') { u.dmg *= 0.5; u.announced = true; }
    F.w3 = [g];
    rt.after(26, () => {
      if (F.step !== 5 || F.ending) return;
      const g2 = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の新手', anchor: { x: 30, z: 0 }, facing: -0.3, order: 'attack', seekRange: 140, aggro: 12, width: 12, morale: 75, fleeDir: { x: 0.2, z: -1 }, dmgMult: 0.42, speed: 2.8 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }], ASAKURA)));
      F.w3.push(g2);
      rt.say('足軽', '東の畦からも回り込んでくる！', 2.5);
      rt.marker('w5', centerOf(g2), () => `朝倉の新手・${moraleWord(g2.morale)}`, { red: true, group: g2 });
    });
    rt.after(50, () => { if (!F.ending) g.noRout = false; });
    rt.marker('w4', centerOf(g), () => `朝倉の本隊・${moraleWord(g.morale)}`, { red: true, group: g });
    // 日が落ちていく：薄暮から夜へ。道の脇に松明が灯り、闇にまぎれて退く
    rt.after(30, () => { if (!F.ending) applyLook(rt, DUSK2); });
    rt.after(58, () => {
      if (F.ending) return;
      F.night = true;
      applyLook(rt, NIGHT);
      for (const [x, z] of [[-26, 112], [-18, 96], [-36, 128], [-6, 86]]) rt.world.addFire(x, z, { torch: true, h: 1.5 });
      rt.say('木下藤吉郎', '日が暮れた。松明は道の脇と、先を行く者だけにせよ。闇にまぎれて退くぞ', 3.5);
      // 殿の兵の何人かだけが松明を持つ
      F.torches = carryTorches(rt.world, [...F.kino.units.filter((u) => u.type === 'ashigaru').slice(0, 3), ...F.ikeda.units.filter((u) => u.type === 'ashigaru').slice(0, 2)]);
    });
  },

  // 退き口成る
  win(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const k of ['w4', 'w5', 'line']) rt.unmark(k);
    rt.unzone('line');
    rt.objDone('main');
    if (!F.strayed) rt.objDone('stay');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '金ヶ崎の殿を務めた', pts: 25 }; }, '任務達成・退き口成る');
    for (const g of [...(F.w3 || []), ...(F.w2 || [])]) if (!gone(g)) { g.noRout = false; g.morale = 0; }
    sfx('horagai', 0.8);
    rt.banner('退き口成る', how);
    rt.say('伝令', '申し上げます！　殿は朽木谷へ抜けられた由！', 4);
    rt.say('木下藤吉郎', `${nm(rt)}、生き延びたな。……しんがりの役目、しかと果たしたぞ。さあ、わしらも退くぞ！`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    if (!F.ending) this.tickProg(rt, dt);
    if (F.torches) F.torches.update();
    const pct = this.retreatPct(rt);
    // 織田の主力：道を南西へ退き、朽木の方で見えなくなる
    const k = pct / 100;
    F.main.forEach((a, i) => {
      const t = Math.min(1, Math.max(0, k * 1.4 - i * 0.07));
      moveDA(rt, a, a.x0 + (-70 - a.x0) * t, a.z0 + (176 - a.z0) * t);
      a.m.visible = t < 0.97;
    });
    // 朝倉の大軍：少しずつ南へ
    F.host.forEach((a, i) => { const t = Math.min(1, rt.t / 260); moveDA(rt, a, a.x0, a.z0 + 40 * t + i * 4 * t); });
    if (F.ending) return;
    if (rt.G.lord) { this.lordTick(rt, dt); return; }
    rt.objProgress('main', `主力の退き ${pct}%`);
    // 持ち場を離れて北へ深追いしたか
    const L = LINES[F.line];
    const ahead = L.z - p.z;
    if ((F.step === 1 || F.step === 3 || F.step === 5) && ahead > 38 && !F.strayed) {
      F.strayT = (F.strayT || 0) + dt;
      if (F.strayT > 4) { F.strayed = true; rt.violation('殿の持ち場を離れて深追いした', ['木下藤吉郎', '戻れ！　殿は勝つための戦ではない、退くための戦じゃ！']); rt.objFail('stay'); }
    } else F.strayT = 0;
    // 退く途中：自分が次の備に着いたか
    if (F.step === 2 || F.step === 4) {
      const d = Math.hypot(p.x - L.x, p.z - L.z);
      rt.objProgress('back', d < L.r ? '着いた' : `あと ${Math.round(d - L.r)}m`);
      if (d < L.r && !F['in' + F.line]) {
        F['in' + F.line] = true;
        rt.objDone('back'); rt.objRemove('back'); rt.unzone('line'); rt.unmark('line');
        rt.award((t) => t.side.push(`${L.name}へ退いた`), `${L.name}へ退いた`);
        rt.say('木下藤吉郎', 'よし、揃ったな。槍を立てよ！', 2.5);
      }
      if (rt.t - F.stepT > 30 && d > L.r + 20 && !(F.lateT > rt.t)) {
        F.lateT = rt.t + 12;
        rt.bark(`${L.name}へ急げ！　取り残されるぞ`, true);
        // 取り残されると組の士気が落ち、藤吉郎が使番をよこして呼び戻す
        for (const g of rt.squadGroups || []) g.morale = Math.max(10, (g.morale || 0) - 8);
        if (!F['late' + F.line]) { F['late' + F.line] = true; rt.say('使番', `木下様より！　${nm(rt)}殿、早う退けとの仰せにござる！`, 3); }
      }
    }
    if (F.step === 1) {
      const all = F.w1.filter((g) => !gone(g));
      if (F.w1.length >= 2 && !all.length) this.fallBack(rt, 1);
      else if (rt.t - F.stepT > 100) this.fallBack(rt, 1);
      // 朝倉景健は討たれない（この後も生きる）。隊が弱れば崩れて退く
      if (F.w1[1] && F.w1[1].count < 7) { F.w1[1].noRout = false; F.w1[1].morale = Math.min(F.w1[1].morale, 20); }
    }
    if (F.step === 3) {
      if (F.w2.every(gone) || rt.t - F.stepT > 80) this.fallBack(rt, 2);
    }
    if (F.step === 5) {
      const live = F.w3.reduce((a, g) => a + (gone(g) ? 0 : g.count), 0);
      rt.objProgress('main', `主力の退き ${pct}%・朝倉 ${live}人`);
      // 朝倉景鏡も討たれない（のちに義景を裏切る）。隊が弱れば崩れて退く
      if (F.w3[0].count < 8) { F.w3[0].noRout = false; F.w3[0].morale = Math.min(F.w3[0].morale, 20); }
      // 主力が退ききり、寄せが一息ついたら（あるいは長く持ちこたえたら）退き口成る
      if (pct >= 100 && (F.w3.length >= 2 && F.w3.every(gone))) this.win(rt, '朝倉の寄せを退け、殿も闇にまぎれて退く');
      else if (pct >= 100 && rt.t - F.stepT > 75) this.win(rt, '主力は朽木へ抜けた。殿も闇にまぎれて退く');
      else if (F.w3.length >= 2 && F.w3.every(gone) && !F.w3more && pct < 90) {
        // 早く崩しすぎたら、もう一押しが来る
        F.w3more = true;
        rt.after(6, () => {
          if (F.ending) return;
          const g = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の後続', anchor: { x: 0, z: -20 }, facing: 0, order: 'attack', seekRange: 140, aggro: 12, width: 12, morale: 75, fleeDir: { x: 0, z: -1 }, dmgMult: 0.45, speed: 2.8 },
            dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 2 }], ASAKURA)));
          F.w3.push(g);
          rt.say('木下藤吉郎', 'まだ来るか。主力が抜けるまで、あと少しじゃ！', 3);
        });
      }
    }
  },

  // 信長で遊ぶ時：殿の戦いは後ろで続き、信長は旗本と朽木越えの道の口へ退く。追手の騎馬が道を追ってくる
  lordTick(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    // 殿の備は、もとの流れのまま繰り引く（寄せが尽きるか、時が経てば次の備へ）
    if (F.step === 1 && ((F.w1.length >= 2 && F.w1.every(gone)) || rt.t - F.stepT > 100)) this.fallBack(rt, 1);
    if (F.step === 3 && (F.w2.every(gone) || rt.t - F.stepT > 80)) this.fallBack(rt, 2);
    const d = Math.hypot(p.x - KUTSUKI.x, p.z - KUTSUKI.z);
    const sq = rt.squad.filter((u) => u.alive), near = sq.filter((u) => Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 40).length;
    const PASS = 70;   // 松永久秀が朽木元綱を説くあいだ、谷の口で持ちこたえる秒
    if (F.pass) rt.objProgress('main', `朽木の返事まで あと${Math.max(0, Math.ceil(F.pass + PASS - rt.t))}秒・旗本 ${near}/${sq.length}人`);
    else rt.objProgress('main', `朽木口まで ${Math.max(0, Math.round(d - KUTSUKI.r))}m・付いて来る旗本 ${near}/${sq.length}人`);
    // 谷の口に着いたら、朽木元綱が通すかどうか。松永久秀が説く間、追手を防ぐ
    if (!F.pass && d < KUTSUKI.r) {
      F.pass = rt.t;
      sfx('kane', 0.8);
      rt.banner('朽木谷の口', '朽木元綱は通すか、討つか');
      rt.say('松永久秀', '殿、朽木元綱はわしが説いてまいりまする。しばし、ここでお待ちを', 4);
      rt.say('織田信長', '急げ。……旗本は谷の口を固めよ。追手を通すな', 3.5);
      rt.after(14, () => {
        if (F.ending) return;
        const g = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の追手', anchor: { x: -6, z: 80 }, facing: 0, aggro: 12, width: 12, morale: 80, fleeDir: { x: 0.2, z: -1 }, dmgMult: 0.5, speed: 3 },
          dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 3 }], ASAKURA)));
        g.order = 'move'; g.dest = { x: KUTSUKI.x + 8, z: KUTSUKI.z - 14 };
        g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 50; };
        rt.say('足軽', '朝倉の追手、谷の口へ寄せてまいる！', 3);
        rt.marker('chase2', centerOf(g), () => `朝倉の追手・${moraleWord(g.morale)}`, { red: true, group: g });
        F.chaser2 = g;
      });
    }
    if (F.chaser2 && gone(F.chaser2)) rt.unmark('chase2');
    // 陣を離れたら、朝倉の騎馬が追ってくる
    if (!F.chase && p.z > 20) {
      F.chase = true;
      rt.after(6, () => {
        if (F.ending) return;
        const g = soften(enemyGroup(rt, { faction: 'saito', name: '朝倉の騎馬の追手', anchor: { x: 10, z: -30 }, facing: 0, aggro: 14, width: 10, morale: 85, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55, speed: 3.8 },
          dress([{ type: 'samurai', n: 1, o: { horse: true, hat: 'kabuto_m' } }, { type: 'cavalry', n: 8 }], ASAKURA)));
        g.order = 'move'; g.dest = { x: KUTSUKI.x + 10, z: KUTSUKI.z - 20 };
        g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 60; };
        F.chaser = g;
        rt.say('足軽', '朝倉の騎馬が追うて来る！　殿をお守りせよ！', 3);
        rt.marker('chase', centerOf(g), () => `騎馬の追手・${moraleWord(g.morale)}`, { red: true, group: g });
      });
    }
    if (F.chaser && gone(F.chaser)) { rt.unmark('chase'); }
    if (F.pass && rt.t - F.pass >= PASS && d < KUTSUKI.r + 20 && near >= Math.ceil(sq.length * 0.5)) {
      F.ending = true;
      rt.setPhase('end');
      rt.unmark('kutsuki'); rt.unzone('kutsuki'); rt.unmark('chase'); rt.unmark('chase2');
      rt.say('松永久秀', '殿、朽木は通すと申しておりまする！', 3);
      rt.objDone('main');
      rt.tracker.main = true;
      rt.award((t) => { t.main = true; t.special = { label: '朽木越えに京へ退いた', pts: 25 }; }, '任務達成・京へ退く');
      sfx('horagai', 0.8);
      rt.banner('朽木越え', '信長、わずかな供と京へ退く');
      rt.say('伝令', '申し上げます！　殿（しんがり）の木下殿、朝倉を食い止めておりまする！', 4);
      rt.say('織田信長', '生きて帰れば、また戦える。……京へ急ぐぞ', 4);
      rt.player.u.invuln = true;
      rt.finish({}, 10);
    } else if (F.pass && rt.t - F.pass >= PASS && !(F.waitSq > rt.t)) { F.waitSq = rt.t + 10; rt.bark(d > KUTSUKI.r + 20 ? '朽木谷の口へ戻れ' : '旗本が遅れている。揃うのを待て', true); }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v.type === 'busho' && v.team === 1) {
      if (!(k && k.isPlayer)) rt.banner(`${v.name}、退く`, '深手を負い、峠へ担ぎ込まれた');
      if (v.group) { v.group.noRout = false; v.group.morale -= 35; }
    }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 両軍の総勢（戦国大名に合わせ、織田 一万二千、朝倉・浅井 二万五千）。殿は三千ほど
kanegasaki.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(2000, 12000 - (F.ak || 0) * 30), a0: 12000, b: Math.max(5000, 25000 - (F.ek || 0) * 40), b0: 25000 };
};
kanegasaki.sides = { a: { name: '織田軍（しんがり）', mon: 'oda' }, b: { name: '朝倉軍（背に浅井）', mon: 'asakura' } };
kanegasaki.date = (rt) => `元亀元年四月二十八日　夏・晴・${rt.flags.night ? '夜' : rt.world.timeKey === 'dusk' ? '夕暮れ' : '昼下がり'}`;
kanegasaki.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '朝倉の寄せまで待つ' : '');
kanegasaki.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
kanegasaki.history = '元亀元年四月、織田信長は越前の朝倉義景を攻め、手筒山城と金ヶ崎城を落とした。ところが妹・お市の夫である北近江の浅井長政が朝倉方につき、織田勢は前後を挟まれる形になった。信長はわずかな供で朽木越えに京へ逃れ、金ヶ崎には木下藤吉郎（のちの羽柴秀吉）・明智光秀・池田勝正らが殿として残り、朝倉の追撃を防ぎながら退いたと伝わる（金ヶ崎の退き口）。お市が両端を縛った小豆の袋を送って危うさを知らせたという話は、後の書物に出るもので確かではない。この戦の後、信長は兵を立て直し、六月に姉川で浅井・朝倉と戦った。追いすがった朝倉の将の名は伝えによって違い、この戦では「朝倉の本隊」としている。信長は朽木谷を越えて、二日後の晦日に京へ入った。';

// 素直な遊び手：持ち場の備のそばで寄せ手を突き、「退け」の下知が出たら次の備へ走る
kanegasaki.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  const L = LINES[F.line];
  // 退く途中は、まず次の備へ
  if ((F.step === 2 || F.step === 4) && !F['in' + F.line]) {
    const e = b.army.nearestEnemy(u, 2.6, (o) => !o.fleeing);
    if (e) { p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z); inp.leftPressed = Math.random() < 0.5; return; }
    goTo(p, inp, L.x, L.z, 3);
    return;
  }
  if (u.hp < u.maxHp * 0.6) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, L.x, L.z + 14, 2); return; }
  const e = b.army.nearestEnemy(u, 14, (o) => !o.fleeing && !o.invuln && L.z - o.pos.z < 30);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  goTo(p, inp, L.x + 3, L.z + 3, 3);
};

export { kanegasaki };
