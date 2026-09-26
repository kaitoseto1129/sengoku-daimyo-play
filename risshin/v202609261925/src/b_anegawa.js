// ======================================================================
// 信長包囲網　姉川の戦い（元亀元年六月二十八日）
// 近江の姉川を挟んで、南に織田・徳川、北に浅井・朝倉。西の瀬では徳川が朝倉に、東では織田が浅井に当たる。
// 足軽は織田の備（森可成の手）の中に立つ。浅井の磯野員昌が川を渡って織田の段を次々に破って来る。
// ①磯野の突撃を受け止める ②遠藤直経を止める（副） ③徳川の横槍・稲葉一鉄の横槍で浅井が崩れる ④姉川を渡って追い落とす
// 向き：北が -z。川は x の向きに流れ、z ≒ 0。西（-x）が徳川と朝倉、東が織田と浅井
// ======================================================================
import { nobori, jinmaku, tawara, hut } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';

const ANE = [[-180, 8], [-120, -2], [-60, 5], [0, -1], [60, 4], [120, -3], [180, 5]];   // 姉川
const MORI = { x: 22, z: 34 };     // 森可成の備（自分の持ち場）
const HQ = { x: 40, z: 140 };      // 信長の本陣（竜ヶ鼻）
const BANK_N = -8;                 // これより北は向こう岸

// 浅井・朝倉の兵の見た目（家ごとに甲冑の色と旗を変える）
const AZAI = { armor: 0x2e2a26, lace: 0x3c5a48, flag: 'azai' };
const ASAKURA = { armor: 0x33291f, lace: 0x7a5a2a, flag: 'asakura' };
const INABA = { flag: 'inaba' };   // 稲葉一鉄ら西美濃の衆は、もと斎藤の家臣
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const TK_ARMOR = 0x24221f;
const gone = (g) => !g || g.count === 0 || g.routed;

const anegawa = {
  spawn: { x: MORI.x, z: MORI.z + 5, heading: Math.PI },
  world: {
    seed: 70,
    time: 'day',
    muddy: 0.2,
    paths: [[[HQ.x, HQ.z], [36, 100], [26, 60], [20, 20], [18, 4]], [[-150, 120], [-120, 60], [-110, 10]]],
    height(x, z) {
      let h = 0.5 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 0.3 * Math.sin(z * 0.05 + x * 0.02);
      // 北の山並み（小谷山・大依山）と、南東の横山（横山城）、信長の陣の竜ヶ鼻
      h += Math.max(0, -z - 105) * 0.3 + 26 * gauss(x, z, 70, -175, 1800) + 12 * gauss(x, z, -40, -130, 1600);
      h += 16 * gauss(x, z, 130, 110, 1500) + 5 * gauss(x, z, HQ.x, HQ.z + 8, 900);
      // 川原：川の両岸は低く、石が出ている
      return h;
    },
    tint(x, z, h, c) {
      // 川原の石と砂
      let d = Infinity;
      for (let i = 0; i < ANE.length - 1; i++) {
        const [ax, az] = ANE[i], [bx, bz] = ANE[i + 1];
        if (x >= ax && x <= bx) d = Math.abs(z - (az + (bz - az) * (x - ax) / (bx - ax)));
      }
      if (d < 11) { const k = 1 - d / 11; c.setRGB(c.r * (1 - 0.5 * k) + 0.28 * k, c.g * (1 - 0.5 * k) + 0.26 * k, c.b * (1 - 0.5 * k) + 0.22 * k); }
    },
    clear: (x, z) => Math.abs(x) < 100 && z > -60 && z < 120,
    paddy(x, z) {
      if (z < 50 || z > 128 || x < -30 || x > 100) return 0;
      if (Math.abs(x - 30) < 5) return 0;
      if ((Math.floor(x / 12) + Math.floor(z / 15)) % 3 === 0) return 0;
      const ex = Math.min(((x % 12) + 12) % 12, 12 - ((x % 12) + 12) % 12), ez = Math.min(((z % 15) + 15) % 15, 15 - ((z % 15) + 15) % 15);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6));
    },
    streams: [{ pts: ANE, w: 5.5, depth: 1.1 }],
    trees: 320,
    tufts: 4200,
    treeDensity: (x, z) => (z < -80 || z > 130 || Math.abs(x) > 120 ? 1 : 0.25),
    groves: [{ x: -60, z: 60, r: 12, n: 18 }, { x: 90, z: 40, r: 12, n: 16 }, { x: -30, z: -60, r: 14, n: 22 }, { x: 80, z: -50, r: 12, n: 18 }],
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0;
    // ---- 味方：織田の段。前に坂井政尚の一段、その後ろに森可成の備（自分の持ち場） ----
    F.sakai = allyGroup(rt, { faction: 'oda', name: '坂井政尚の段', anchor: { x: 20, z: 13 }, facing: Math.PI, width: 14, aggro: 7, morale: 70, dmgMult: 0.7, fleeDir: { x: 0.1, z: 1 } },
      [{ type: 'samurai', n: 1, o: { name: '坂井政尚', hat: 'kabuto_m', haori: 0x3a3a44 } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }]);
    const mori = allyGroup(rt, { faction: 'oda', name: '森可成の備', anchor: { ...MORI }, facing: Math.PI, width: 16, aggro: 7, noRout: true, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '森可成', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2e2e38 } }, { type: 'ashigaru', n: 16 }]);
    F.mori = mori; F.moriU = mori.units[0]; F.mori0 = mori.count;
    mori.defMult = 1.5; mori.dmgMult = 0.8;
    F.ikeda = allyGroup(rt, { faction: 'oda', name: '池田恒興の段', anchor: { x: 2, z: 32 }, facing: Math.PI, width: 12, aggro: 7, noRout: true, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '池田恒興', hat: 'kabuto_m', haori: 0x4a2a22 } }, { type: 'ashigaru', n: 12 }]);
    F.ikeda.defMult = 1.3; F.ikeda.dmgMult = 0.75;
    F.kino = allyGroup(rt, { faction: 'oda', name: '木下秀吉の段', anchor: { x: 42, z: 32 }, facing: Math.PI, width: 12, aggro: 7, noRout: true, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '木下藤吉郎', hat: 'kabuto_m', haori: 0x6a4a1c } }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 3 }]);
    F.kino.defMult = 1.3; F.kino.dmgMult = 0.75;
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: MORI.x + 3, z: MORI.z + 5 }, Math.PI, [{ kind: 'spear', n }]);

    // ---- 陣と旗 ----
    // 信長の本陣（竜ヶ鼻）：陣幕の内に床几の大将と諸将、後ろに馬印と旗本
    KIT.honjin(rt, HQ.x, HQ.z, { mon: 'oda', w: 18, d: 12, armor: 0x2b3140 });
    rt.scene.add(nobori(W, HQ.x - 12, HQ.z + 4, 'eiraku', 7));
    for (const [x, z] of [[8, 38], [34, 38], [-14, 36], [56, 36], [16, 18], [28, 18]]) rt.scene.add(nobori(W, x, z, z < 25 ? 'oda' : (x > 40 ? 'eiraku' : 'oda'), 5));
    rt.scene.add(tawara(W, 30, 60, 0.3, 5), hut(W, 60, 96, 7, 5, 0.2));
    // 向こう岸の浅井の旗
    for (const [x, z] of [[4, -30], [26, -34], [44, -28], [60, -40]]) rt.scene.add(nobori(W, x, z, 'azai', 5.5));
    for (const [x, z] of [[-100, -30], [-126, -34], [-146, -26]]) rt.scene.add(nobori(W, x, z, 'asakura', 5.5));
    // 遠景の村（川の南の田の中）
    KIT.farVillage(rt, -80, 112, { rot: Math.PI, n: 6, fields: 10, seed: 41 });

    // ---- 大軍（軽い作り）：織田は十三段、徳川は西の瀬、北に浅井と朝倉 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => {
      const m = KIT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
      return { m, x0: x, z0: z, x, z };
    };
    const OD = 0x2b3140, TK = 0x24221f;
    // 織田の段：森の備の後ろに幾重にも（柴田・佐久間・丹羽…と続く）。本陣へ通じる真ん中の道は空けておく（兵が通る）
    [[-30, 62, 'oda', 'gun'], [74, 62, 'oda', 'spear'], [-26, 96, 'oda', 'spear'], [80, 98, 'oda', 'mixed'], [0, 126, 'eiraku', 'cavalry'], [-44, 128, 'oda', 'spear'], [78, 132, 'oda', 'spear']]
      .forEach(([x, z, f, kind], i) => DA(x, z, 26, kind === 'gun' ? 6 : 12, kind === 'cavalry' ? 110 : 170, Math.PI, OD, f, 11 + i, kind));
    // 横山城を囲む織田の兵
    DA(118, 84, 30, 10, 160, 0.9, OD, 'oda', 21, 'spear');
    // 徳川：西の瀬で朝倉と向き合う。奥に家康の本陣
    F.tk = [DA(-112, 30, 40, 16, 260, Math.PI, TK, 'tokugawa', 31, 'mixed'), DA(-150, 48, 26, 22, 170, Math.PI, TK, 'tokugawa', 32, 'honjin')];
    // 榊原康政の別手（のちに朝倉の横を突く）：北西の瀬へ向いて控える
    F.sakaki = DA(-62, 26, 18, 10, 140, Math.atan2(-40, -50), TK, 'tokugawa', 33, 'cavalry');
    // 朝倉：西の対岸、浅井：北の対岸と大依山（長政の本陣）
    F.akDA = [DA(-116, -34, 44, 18, 300, 0, ASAKURA.armor, 'asakura', 41, 'mixed'), DA(-150, -62, 30, 20, 180, 0, ASAKURA.armor, 'asakura', 42, 'honjin')];
    F.akDA[1].m.army.lord = '朝倉景健';   // 本陣へ寄れば旗本が迎え撃つ（b_nagashinojo.js の wake）
    F.azDA = [DA(30, -58, 50, 16, 260, 0, AZAI.armor, 'azai', 51, 'spear'), DA(-4, -86, 30, 24, 200, 0, AZAI.armor, 'azai', 52, 'honjin'), DA(60, -92, 30, 14, 160, 0, AZAI.armor, 'azai', 53, 'cavalry')]
    F.azDA[1].m.army.lord = '浅井長政';
    // ---- 大軍どうしの合戦（軽い作り・world.addClash）：川の中で組み合う。西の瀬は徳川と朝倉、森の備の左右は織田と浅井 ----
    // 織田と浅井の前線の、森の備に近い端は、本物の兵の押し引きにつながる（link）
    const side = (flag, armor, count, team, faction, x = {}) => ({ flag, armor, count, team, faction, ...x });
    const realFront = () => { const e = [F.iso, F.third, F.second].find((q) => q && !gone(q)); if (!e || F.step !== 1 || !F.mori.count) return null; const c = e.center(); return { x: c.x, z: (c.z + F.mori.center().z) / 2 }; };
    F.clash = [
      clash(rt, { x: -112, z: 2, facing: Math.PI, w: 56, gap0: 30, seed: 181, noRout: true, A: side('tokugawa', TK, 520, 0, 'tokugawa', { guns: true }), B: side('asakura', ASAKURA.armor, 560, 1, 'saito', { bows: true }) }),
      clash(rt, { x: -30, z: 3, facing: Math.PI, w: 40, gap0: 26, seed: 182, noRout: true, A: side('oda', OD, 380, 0, 'oda'), B: side('azai', AZAI.armor, 400, 1, 'saito'), link: realFront }),
      clash(rt, { x: 84, z: 3, facing: Math.PI, w: 40, gap0: 26, seed: 183, noRout: true, A: side('oda', OD, 380, 0, 'oda', { guns: true }), B: side('azai', AZAI.armor, 400, 1, 'saito'), link: realFront }),
    ];

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', rt.G.lord ? '浅井の猛攻を耐えて押し返せ' : '森可成の備に立ち、浅井の寄せを受け止めよ', 'main');
    if (!rt.G.lord) rt.obj('stay', '下知があるまで姉川を渡るな', 'order');
    rt.obj('mori', '森の備を半分より多く保つ', 'side');
    rt.say('', '元亀元年六月二十八日　近江国 姉川', 3.5);
    // 信長で遊ぶ時：本陣の前で、家臣の言上を聞く
    if (rt.G.lord) {
      rt.say('森可成', '殿、川向こうの旗が浅井、西の瀬の向こうが朝倉にございます', 4);
      rt.say('森可成', '徳川殿は西の瀬で朝倉に当たられます。浅井は我ら織田の段が受けまする', 4);
      rt.say('織田信長', '段を幾重破られようと、本陣は退かぬ。崩れた所へ旗本を回せ', 4);
      F.farT = 0;
      rt.after(18, () => this.charge(rt));
      return;
    }
    rt.say('森可成', `${nm(rt)}、夜が明けたぞ。川向こうの旗が浅井、西の瀬の向こうが朝倉じゃ`, 4.5);
    rt.say('森可成', '徳川殿は西の瀬で朝倉に当たる。我ら織田は、この川で浅井を受ける', 4.5);
    rt.say('森可成', '前には坂井殿の段がある。抜けてきた者を、ここで槍を揃えて止めよ', 4.5);
    rt.say('', '川は膝ほどの深さで歩いて渡れます。下知があるまで渡ってはいけません', 5);
    F.farT = 0;
    rt.after(18, () => this.charge(rt));
  },

  // ① 磯野員昌の突撃：川を渡り、坂井の段を破って森の備へ
  charge(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('charge');
    sfx('taiko', 1);
    rt.army.play('eshout', { x: 20, z: -20 }, 2);
    rt.banner('浅井勢、姉川を渡る', '磯野員昌の突撃');
    rt.say('足軽', '浅井が川へ入ったぞ！　先頭は磯野の旗じゃ！', 3);
    const g = enemyGroup(rt, { faction: 'saito', name: '磯野員昌の隊', anchor: { x: 20, z: -30 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 12, width: 16, morale: 100, noRout: true, speed: 3.0, dmgMult: 0.62 },
      dress([{ type: 'busho', n: 1, o: { name: '磯野員昌', horse: true, hat: 'kabuto_r', haori: 0x4a3a22 } }, { type: 'cavalry', n: 5 }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 30 }], AZAI));
    F.iso = g; F.isoU = g.units[0];
    // 磯野の後ろに浅井の騎馬と足軽が続き、対岸の先の備も川べりへ押し出す
    KIT.backOf(rt, g, { flag: 'azai', armor: AZAI.armor, kind: 'cavalry', w: 20, depth: 12, count: 100, gap: 4, seed: 61 });
    F.azDA[0].m.advance(18, 12);
    // 西の瀬でも、森の備の左右でも、大軍どうしが川へ入って組み合う
    F.clash.forEach((c, i) => rt.after(i * 4, () => c.go()));
    // 騎馬の一撃は、槍衾の前の足軽を一度で崩さない強さに（駆け抜けて何度も当たるので）
    for (const u of g.units) if (u.type === 'cavalry') u.dmg *= 0.75;
    F.isoU.invuln = true; F.isoU.announced = false;   // 磯野はこの戦を生き延びて佐和山へ退いた
    g.order = 'move'; g.dest = { x: 20, z: 12 };
    g.onArrive = (gg) => {
      gg.order = 'attack'; gg.seekRange = 34; gg.aggro = 16;
      // 川を渡りきった所で、磯野が名乗る（段を破ってきた勢いを台詞で見せる）
      if (F.isoU.alive && !F.isoU.announced) {
        F.isoU.announced = true; F.isoU.cheer = 1.5;
        rt.army.play('eshout', F.isoU.pos, 1.6);
        rt.banner('磯野員昌', '浅井の先手、名乗りを上げた');
        rt.say('磯野員昌', '浅井が先手、磯野丹波守員昌なり！　織田の段、幾重あろうと破って通る！', 4);
        rt.say('森可成', '坂井・池田の段がもう抜かれたか……！　槍を揃えよ、ここで止める！', 3.5);
      }
    };
    rt.marker('iso', centerOf(g), () => `磯野員昌の隊・${moraleWord(g.morale)}`, { red: true, group: g });
    rt.obj('main', rt.G.lord ? '浅井の猛攻を耐えて押し返せ（磯野員昌の突撃）' : '磯野員昌の突撃を受け止めよ', 'main');
    // 二の手：少し遅れて、東の瀬から
    rt.after(26, () => {
      if (F.step !== 1) return;
      const g2 = enemyGroup(rt, { faction: 'saito', name: '浅井の二の手', anchor: { x: 52, z: -26 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 10, width: 14, morale: 90, speed: 2.8 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 22 }, { type: 'gun', n: 4 }], AZAI));
      g2.dmgMult = 0.8;
      g2.order = 'move'; g2.dest = { x: 40, z: 18 };
      g2.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 30; };
      F.second = g2;
      rt.say('足軽', '東の瀬からも来るぞ！', 2.5);
    });
    // 遠藤直経：討ち取った首を提げ、味方のふりをして信長の本陣へ向かう
    rt.after(46, () => this.endo(rt));
    // 後ろの段（柴田勝家）が前へ詰めてくる
    rt.after(62, () => this.shibata(rt));
    // 徳川の横槍・稲葉の横槍
    rt.after(130, () => this.tokugawa(rt));
  },

  shibata(rt) {
    const F = rt.flags;
    if (F.step !== 1 || F.shibata) return;
    const g = allyGroup(rt, { faction: 'oda', name: '柴田勝家の段', anchor: { x: 24, z: 70 }, facing: Math.PI, width: 14, aggro: 9, noRout: true, speed: 2.8 },
      [{ type: 'samurai', n: 1, o: { name: '柴田勝家', horse: true, hat: 'kabuto_b', haori: 0x3a2a1c } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }]);
    g.defMult = 1.3; g.dmgMult = 0.75;
    g.order = 'move'; g.dest = { x: 26, z: 26 };
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: 26, z: 26 }; gg.aggro = 12; };
    F.shibata = g;
    rt.say('伝令', '柴田勝家殿の段が前へ詰めまする！　持ちこたえよとの仰せ！', 3.5);
  },

  endo(rt) {
    const F = rt.flags;
    if (F.step !== 1 || F.endoG) return;
    const g = enemyGroup(rt, { faction: 'saito', name: '遠藤直経', anchor: { x: -6, z: 16 }, facing: Math.PI, aggro: 2, width: 2, morale: 100, noRout: true, speed: 3.2 },
      [{ type: 'samurai', n: 1, o: { name: '遠藤直経', flag: null, hat: 'kabuto', haori: 0x2a2622 } }]);
    const u = g.units[0];
    u.hp = u.maxHp = 110;
    u.noTarget = true;   // 味方のふりをしているので、まわりの兵は気づかない
    g.order = 'move'; g.dest = { x: HQ.x - 2, z: HQ.z - 10 };
    F.endoG = g; F.endoU = u;
    // 信長で遊ぶ時：遠藤直経は信長その人を狙って寄ってくる
    if (rt.G.lord) {
      const P = rt.player.u.pos;
      g.dest = { x: P.x, z: P.z };
      g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 30; gg.focus = rt.player.u; u.noTarget = false; };
      rt.say('森可成', '殿！　あの武者、首を提げてこちらへ参ります。味方の旗を差しておりませぬ！', 4);
      rt.obj('endo', '首を提げて寄る武者（遠藤直経）を討つ', 'side');
      rt.marker('endo', unitPos(u), '首を提げた武者', { red: true });
      return;
    }
    rt.say('森可成', 'むっ……あの武者、首を提げて本陣の方へ行く。味方の旗を差しておらぬぞ！', 4);
    rt.say('森可成', `${nm(rt)}、あれは浅井の者じゃ！　本陣へ行かせるな！`, 3.5);
    rt.obj('endo', '首を提げて本陣へ向かう武者（遠藤直経）を止める', 'side');
    rt.marker('endo', unitPos(u), '首を提げた武者', { red: true });
  },

  // ② 西の瀬で徳川が朝倉を破り、稲葉一鉄が浅井の横腹を突く
  tokugawa(rt) {
    const F = rt.flags;
    if (F.tkDone) return;
    F.tkDone = true;
    sfx('horagai', 0.7);
    rt.banner('徳川勢、朝倉の横を突く', '榊原康政の横槍');
    rt.say('伝令', '西の瀬、徳川殿が朝倉を押し返しております！　榊原康政殿が朝倉の横腹へ！', 4);
    F.sakakiGo = rt.t;
    // 榊原の別手が朝倉の横へ駆け、朝倉の先手が崩れ、後ろの本陣も退く
    F.sakaki.m.advance(64, 26, { charge: true });
    rt.after(20, () => F.akDA[0].m.rout({ hideAfter: 45 }));
    // 西の瀬の朝倉：榊原の騎馬が東の端から突っ込み、その端から崩れる
    F.clash[0].cavalry('A', { from: -1, flag: 'tokugawa', armor: TK_ARMOR, count: 70, delay: 4 });
    F.clash[0].shake('B', 20);
    rt.after(22, () => F.clash[0].rout('B', { from: -1, hideAfter: 45 }));
    rt.after(26, () => F.akDA[1].m.retreat(60, 40));
    // 浅井は朝倉の崩れを見る前に、残る旗本を押し出す（三の手）
    rt.after(4, () => {
      if (F.step !== 1) return;
      const g3 = enemyGroup(rt, { faction: 'saito', name: '浅井の三の手', anchor: { x: 30, z: -34 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 12, width: 16, morale: 95, noRout: true, speed: 2.9 },
        dress([{ type: 'samurai', n: 4 }, { type: 'cavalry', n: 3 }, { type: 'ashigaru', n: 28 }, { type: 'gun', n: 4 }], AZAI));
      g3.dmgMult = 0.7;
      g3.order = 'move'; g3.dest = { x: 26, z: 14 };
      g3.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 34; };
      F.third = g3;
      KIT.backOf(rt, g3, { flag: 'azai', armor: AZAI.armor, kind: 'spear', w: 18, depth: 10, count: 110, seed: 62 });
      sfx('taiko', 0.9);
      rt.say('足軽', '浅井がまた川へ入った！　長政の旗本じゃ！', 3);
      rt.obj('main', rt.G.lord ? '浅井の猛攻を耐えて押し返せ（長政の旗本）' : '浅井の三の手（長政の旗本）を受け止めよ', 'main');
      rt.marker('third', centerOf(g3), () => `浅井の三の手・${moraleWord(g3.morale)}`, { red: true, group: g3 });
    });
    rt.after(24, () => this.inaba(rt));
  },
  inaba(rt) {
    const F = rt.flags;
    if (F.inaba || F.step !== 1) return;
    const tg = [F.third, F.iso, F.second].find((e) => e && e.count);
    const c = tg ? tg.center() : { x: 20, z: 20 };
    const g = allyGroup(rt, { faction: 'saito', name: '稲葉一鉄の隊', anchor: { x: 96, z: 26 }, facing: -Math.PI / 2, width: 12, aggro: 10, noRout: true, speed: 3.2 },
      dress([{ type: 'samurai', n: 1, o: { name: '稲葉一鉄', horse: true, hat: 'kabuto_w', haori: 0x3a3022 } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }], INABA));
    g.order = 'move'; g.dest = { x: c.x + 10, z: c.z };
    g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 50; };
    F.inaba = g;
    sfx('taiko', 1);
    rt.banner('稲葉一鉄、浅井の横腹へ', '西美濃の衆が東から駆けつける');
    rt.say('森可成', '稲葉殿が横から入った！　今じゃ、押し返せ！', 3.5);
    // 横を突かれて浅井は揺らぐ（稲葉が取り付いたら崩れうる）
    F.inabaT = rt.t;
    // 東の前線の浅井にも、稲葉の手の騎馬が東の端から突っ込む
    F.clash[2].cavalry('A', { from: -1, flag: 'inaba', armor: 0x2b3140, count: 60, delay: 2 });
    for (const c of F.clash.slice(1)) c.shake('B', 15);
    for (const e of [F.iso, F.second, F.third]) if (e && e.count) e.morale -= 12;
    rt.after(12, () => { for (const e of [F.iso, F.second, F.third]) if (e && e.count) { e.noRout = false; e.morale -= 10; } });
  },

  // ③ 浅井が崩れた：川を渡って追い落とす
  counter(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('counter');
    rt.unmark('iso'); rt.unmark('third');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '磯野の突撃を受け止めた');
    if (F.mori.count > F.mori0 / 2) { rt.objDone('mori'); rt.award((t) => t.side.push('森の備を保った'), '副任務：森の備を保った'); } else rt.objFail('mori');
    if (!F.crossed && !rt.G.lord) rt.objDone('stay');
    rt.objRemove('stay');
    if (F.endoU && F.endoU.alive && !F.endoDone) { F.endoDone = true; rt.unmark('endo'); rt.objFail('endo'); F.endoG.noRout = false; F.endoG.morale = 0; }
    sfx('horagai', 1);
    rt.banner('浅井勢、崩れる', '姉川を渡り、追い落とせ');
    rt.say('森可成', '浅井が退くぞ！　川を渡れ！　向こう岸の殿を崩せば、この戦は勝ちじゃ！', 4.5);
    rt.obj('pursue', '姉川を渡り、向こう岸で踏みとどまる浅井の殿（浅井政澄）を崩せ', 'main');
    for (const g of [F.mori, F.ikeda, F.kino, F.inaba, F.shibata]) if (g && g.count) { g.order = 'attack'; g.seekRange = 70; g.formation = 'line'; }
    const R = enemyGroup(rt, { faction: 'saito', name: '浅井の殿', anchor: { x: 24, z: -36 }, facing: 0, fleeDir: { x: 0.1, z: -1 }, aggro: 12, width: 16, morale: 85 },
      dress([{ type: 'busho', n: 1, o: { name: '浅井政澄', horse: true, hat: 'kabuto_m', haori: 0x3a4a3a } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 26 }, { type: 'gun', n: 5 }], AZAI));
    F.rear = R;
    for (const u of R.units) if (u.type === 'gun') u.dmg *= 0.5;
    R.dmgMult = 0.7;   // 殿は退きながら踏みとどまる隊。川を渡る味方の大勢に押し包まれる側   // 川を渡る者を撃つ殿の鉄砲は、一発で倒れない強さに
    R.noRout = true;
    rt.after(35, () => { R.noRout = false; });
    rt.marker('rear', centerOf(R), () => `浅井の殿・${moraleWord(R.morale)}`, { red: true, group: R });
    // 浅井の先の備は崩れ、長政の本陣と後ろの騎馬は北の山へ引いていく
    F.retreat = rt.t;
    F.azDA[0].m.rout({ hideAfter: 45 });
    // 川の中の浅井の前線も崩れて向こう岸へ逃げる
    F.clash.slice(1).forEach((c, i) => rt.after(1 + i * 4, () => c.rout('B', { from: i ? -1 : 1, hideAfter: 45 })));
    rt.after(4, () => F.azDA[1].m.retreat(60, 45));
    rt.after(7, () => F.azDA[2].m.retreat(60, 40));
    KIT.backOf(rt, R, { flag: 'azai', armor: AZAI.armor, kind: 'spear', w: 18, depth: 10, count: 120, seed: 64 });
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    // 西の瀬の撃ち合い（遠くの音と煙）
    if (!F.ending && F.step >= 1) {
      F.farT -= dt;
      if (F.farT <= 0) {
        F.farT = 3 + Math.random() * 4;
        const x = -118 + (Math.random() - 0.5) * 40;
        rt.army.smoke(x, rt.world.heightAt(x, 6) + 1.4, 6, 0, -1);
        rt.army.play('gun', { x, z: 4 }, 0.9);
      }
    }
    KIT.backTick(rt);
    if (F.ending) return;
    // 川を渡ったか（下知の前）
    if (F.step < 2 && p.z < BANK_N && !rt.G.lord) {
      F.outT = (F.outT || 0) + dt;
      if (F.outT > 3 && !F.crossed) {
        F.crossed = true;
        rt.violation('下知なく姉川を渡った', ['森可成', '戻れ！　川を渡るなと申したはずじゃ！']);
        rt.objFail('stay');
      }
    } else F.outT = 0;
    if (F.step === 1) {
      const iso = F.iso;
      rt.objProgress('main', `浅井勢 ${[iso, F.second, F.third].reduce((a, g) => a + (g && !gone(g) ? g.count : 0), 0)}人・森の備 ${F.mori.count}人`);
      // 森の備が危うければ、稲葉の横槍を早める
      if (!F.inaba && F.mori.count < F.mori0 * 0.25 && F.tkDone) this.inaba(rt);
      if (!F.tkDone && F.mori.count < F.mori0 * 0.25) this.tokugawa(rt);
      // 坂井の段が崩れたら知らせる
      if (F.sakai.routed && !F.sakaiSaid) { F.sakaiSaid = true; rt.say('森可成', '坂井殿の段が破られた！　来るぞ、槍を揃えよ！', 3); }
      // 遠藤直経が本陣へ着いた
      const E = F.endoU;
      if (E && E.alive && Math.hypot(E.pos.x - HQ.x, E.pos.z - HQ.z) < 18 && !F.endoDone && !rt.G.lord) {
        F.endoDone = true;
        E.alive = false; E.hp = 0; E.fall = 1; E.deadT = 0;
        rt.unmark('endo');
        rt.objFail('endo');
        rt.say('伝令', '本陣の間際で、竹中久作殿が怪しい武者を討ち取りました！　遠藤直経にございます', 4);
      }
      const waves = [iso, F.second, F.third];
      const spent = waves.every((e) => !e || gone(e) || e.count <= 3);
      // 浅井の寄せを早く退けたら、その間に西の瀬の徳川が朝倉を破る
      if (spent && !F.tkDone && !F.tkSoon) { F.tkSoon = true; rt.say('森可成', '浅井め、川向こうで立て直しておる。息を整えよ、また来るぞ', 3.5); rt.after(14, () => this.tokugawa(rt)); }
      if (F.third && gone(F.third)) rt.unmark('third');
      if (!iso.routed && iso.count <= 3 && !iso.fled) { iso.fled = true; iso.noRout = false; iso.morale = 0; rt.unmark('iso'); rt.banner('磯野員昌、退く', '浅井の先手、川向こうへ'); }
      if (spent && F.inabaT && rt.t - F.inabaT > 10 && F.third) this.counter(rt);
      // 長引いたら、浅井は横を突かれて自ら引く（先へ進めるように）
      else if (F.inabaT && rt.t - F.inabaT > 110) { for (const g of waves) if (g && g.count) { g.noRout = false; g.morale = 0; } }
    }
    if (F.step === 2) {
      const R = F.rear;
      rt.objProgress('pursue', `浅井の殿 ${R.count}人`);
      if (gone(R) || rt.t - F.stepT > 160) {
        F.ending = true;
        rt.unmark('rear');
        if (gone(R)) { rt.objDone('pursue'); rt.award((t) => { t.special = { label: '追い討ち', pts: 25 }; }, '浅井の殿を崩した'); }
        else rt.objFail('pursue');
        rt.banner('浅井・朝倉、退く', '姉川の戦、終わる');
        rt.say('森可成', rt.G.lord ? '殿、勝ちましたぞ！　浅井は小谷へ逃げ込むほかありますまい' : `勝ったぞ！　${nm(rt)}、ようこらえた。浅井は小谷へ逃げ込むほかあるまい`, 4.5);
        rt.say('伝令', '横山城、降ると申し出ておりまする！', 3);
        sfx('horagai', 0.8);
        rt.player.u.invuln = true;   // 戦が終わったあとの流れ弾で重傷にならないように
        rt.finish({}, 10);
      }
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    KIT.carrion(rt, v);
    if (v === F.endoU && !F.endoDone) {
      F.endoDone = true;
      rt.unmark('endo');
      if (k && (k.isPlayer || k.isSub)) { rt.objDone('endo'); rt.award((t) => t.side.push('遠藤直経を止めた'), '副任務：遠藤直経を止めた'); rt.say('森可成', rt.G.lord ? '遠藤直経にございます。殿のお命を狙うておったとは……' : 'ようやった！　あれは浅井の遠藤直経、殿のお命を狙っておったのじゃ', 4); }
      else { rt.objFail('endo'); rt.say('足軽', '味方が怪しい武者を討ち取ったぞ！', 3); }
    }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.iso) rt.say('足軽', '磯野の隊が崩れたぞ！　川へ逃げていく！', 3);
    if (g === F.rear) rt.say('足軽', '殿が崩れた！　浅井は総崩れじゃ！', 3);
  },
  onFinish(rt) {
    const R = rt.G.rel && rt.G.rel.tokichiro;
    if (R && rt.tracker.main) { R.trust += 5; R.like += 5; }
  },
};

// 両軍の総勢（戦国大名に合わせ、織田・徳川 二万八千、浅井・朝倉 一万八千）
anegawa.force = (rt) => {
  const F = rt.flags;
  const b = 18000 - (F.ek || 0) * 70 - (F.step >= 2 ? 1500 : 0) - (F.ending ? 1000 : 0);
  return { a: 28000 - (F.ak || 0) * 40, a0: 28000, b, b0: 18000 };
};
anegawa.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '浅井の寄せまで待つ' : '');
anegawa.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
anegawa.sides = { a: { name: '織田・徳川軍', mon: 'oda' }, b: { name: '浅井・朝倉軍', mon: 'azai' } };
anegawa.date = (rt) => {
  const w = rt.world;
  const time = { day: '朝', storm: '朝', after: '昼', dusk: '夕暮れ' }[w.timeKey] || '朝';
  return `元亀元年六月二十八日　夏・${w.rainLevel > 0.5 ? '雨' : '晴'}・${time}`;
};
anegawa.history = '元亀元年六月二十八日、織田・徳川の連合軍は近江の姉川で浅井・朝倉の軍と戦った。西では徳川勢が朝倉勢に、東では織田勢が浅井勢に当たった。浅井の磯野員昌が織田の陣を深く突き崩したと伝わる（「十三段のうち十一段を破った」という話は後の軍記に出る）。徳川の榊原康政らが朝倉の横を突き、稲葉一鉄らが浅井の横を突いて、浅井・朝倉は小谷へ退いた。浅井の遠藤直経は信長を狙って本陣に近づき、竹中重矩（久作）に討たれたと伝わる。兵の数には諸説がある。';

// 素直な遊び手：持ち場で槍を振るい、怪しい武者を追い、下知が出たら川を渡る
anegawa.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  // 下知の前は川のこちら側だけ
  const ok = (o) => !o.fleeing && !o.invuln && (F.step >= 2 || o.pos.z > BANK_N + 2);
  const E = F.endoU;
  if (E && E.alive && !F.endoDone && Math.hypot(E.pos.x - u.pos.x, E.pos.z - u.pos.z) < 60) {
    const d = Math.hypot(E.pos.x - u.pos.x, E.pos.z - u.pos.z);
    p.yaw = Math.atan2(E.pos.x - u.pos.x, E.pos.z - u.pos.z);
    if (d > 2.4) { inp.k.add('KeyW'); inp.runHeld = true; }
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    return;
  }
  inp.runHeld = false;
  // 深手なら備の後ろへ下がって息を整える（しばらく打たれなければ傷は癒える）
  if (u.hp < u.maxHp * 0.6) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) {
    const back = F.step >= 2 ? { x: 22, z: 12 } : { x: MORI.x, z: MORI.z + 16 };
    inp.guardHold = false;
    goTo(p, inp, back.x, back.z, 2);
    return;
  }
  // 下知の前は、備の前に出すぎず、槍の届く所の敵だけを突く
  const home = F.step >= 2 ? u.pos : { x: MORI.x, z: MORI.z - 3 };
  const e = b.army.nearestEnemy(u, F.step >= 2 ? 16 : 9, (o) => ok(o) && Math.hypot(o.pos.x - home.x, o.pos.z - home.z) < (F.step >= 2 ? 99 : 12));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step >= 2 && F.rear && F.rear.count) { const c = F.rear.center(); goTo(p, inp, c.x, c.z, 2); }
  else goTo(p, inp, MORI.x, MORI.z - 3, 2.5);
};

export { anegawa };
