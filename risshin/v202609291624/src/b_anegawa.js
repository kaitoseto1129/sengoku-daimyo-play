// ======================================================================
// 信長包囲網　姉川の戦い（元亀元年六月二十八日）
// 近江の姉川を挟んで、南に織田・徳川、北に浅井・朝倉。西の瀬では徳川が朝倉に、東では織田が浅井に当たる。
// 足軽は織田の備（森可成の手）の中に立つ。浅井の磯野員昌が川を渡って織田の段を次々に破って来る。
// ①磯野の突撃を受け止める ②遠藤直経を止める（副） ③徳川の横槍・稲葉一鉄の横槍で浅井が崩れる ④姉川を渡って追い落とす
// 向き：北が -z。川は x の向きに流れ、z ≒ 0。西（-x）が徳川と朝倉、東が織田と浅井
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, jinmaku, tawara, hut } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { KIT, volley } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { depthStart, depthTick, rest, pick, fight, hold } from './b_depth.js';
import { camp } from './b_mid.js';

const ANE = [[-180, 8], [-120, -2], [-60, 5], [0, -1], [60, 4], [120, -3], [180, 5]];   // 姉川
const MORI = { x: 22, z: 34 };     // 森可成の備（自分の持ち場）
const HQ = { x: 40, z: 140 };      // 信長の本陣（竜ヶ鼻）
const BANK_N = -8;                 // これより北は向こう岸

// 浅井・朝倉の兵の見た目（家ごとに甲冑の色と旗を変える）
const AZAI = { armor: 0x2e2a26, lace: 0x3c5a48, flag: 'azai' };
const ASAKURA = { armor: 0x33291f, lace: 0x7a5a2a, flag: 'asakura' };
const INABA = { flag: 'inaba', armor: 0x33302a, lace: 0x5a4a2a };   // 稲葉一鉄ら西美濃の衆は、もと斎藤の家臣
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const TK_ARMOR = 0x24221f;
const gone = (g) => !g || g.count === 0 || g.routed;

// 川原の石（見た目だけ）：川の両岸の帯に、大小の丸い石を散らす
function kawara(W) {
  const parts = [];
  let s = 70;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 420; i++) {
    const x = -170 + R() * 340;
    let zc = 0;
    for (let k = 0; k < ANE.length - 1; k++) { const [ax, az] = ANE[k], [bx, bz] = ANE[k + 1]; if (x >= ax && x <= bx) zc = az + (bz - az) * (x - ax) / (bx - ax); }
    const z = zc + (R() < 0.5 ? -1 : 1) * (3.2 + R() * 7);
    const r = 0.12 + R() * R() * 0.45;
    const g = new THREE.DodecahedronGeometry(r, 0);
    g.scale(1.2, 0.55, 1);
    g.rotateY(R() * 6);
    g.translate(x, W.heightAt(x, z) + r * 0.2, z);
    const c = new THREE.Color().setHSL(0.09, 0.08, 0.42 + R() * 0.22);
    const gg = g.toNonIndexed();
    const col = new Float32Array(gg.attributes.position.count * 3);
    for (let q = 0; q < col.length; q += 3) { col[q] = c.r; col[q + 1] = c.g; col[q + 2] = c.b; }
    gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(gg);
  }
  const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.receiveShadow = true;
  return m;
}

const anegawa = {
  spawn: { x: MORI.x, z: MORI.z + 5, heading: Math.PI },
  world: {
    seed: 70,
    wind: [0.6, -0.8],   // 南東からの夏の風
    time: 'day',
    mood: 'morning',     // 卯の刻（早朝）に始まった戦：川面に朝の靄
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
    // 段は縦に重ねる：坂井 → 池田 → 森（磯野が一段ずつ破って来る）
    F.ikeda = allyGroup(rt, { faction: 'oda', name: '池田恒興の段', anchor: { x: 20, z: 23 }, facing: Math.PI, width: 12, aggro: 7, morale: 80, formation: 'yari', order: 'hold', fleeDir: { x: -0.3, z: 1 } },
      [{ type: 'samurai', n: 1, o: { name: '池田恒興', hat: 'kabuto_m', haori: 0x4a2a22 } }, { type: 'ashigaru', n: 12 }]);
    F.ikeda.defMult = 1.3; F.ikeda.dmgMult = 0.75;
    // 木下藤吉郎は横山城の押さえに回っている（城下の話と同じ）。森の備の東隣は佐久間信盛の段
    F.kino = allyGroup(rt, { faction: 'oda', name: '佐久間信盛の段', anchor: { x: 42, z: 32 }, facing: Math.PI, width: 12, aggro: 7, noRout: true, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '佐久間信盛', hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 3 }]);
    F.kino.defMult = 1.3; F.kino.dmgMult = 0.75;
    // 森の備の鉄砲（元亀のころは数が少ない）：磯野が川の中ほどまで来たら一斉に放つ（kaito 0929）
    F.guns = [allyGroup(rt, { faction: 'oda', name: '森の備の鉄砲', anchor: { x: 30, z: 26 }, facing: Math.PI, width: 10, spacing: 1.6, aggro: 30, noRout: true, holdFire: true, dmgMult: 0.8 },
      [{ type: 'gun', n: 6 }])];
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: MORI.x + 3, z: MORI.z + 5 }, Math.PI, [{ kind: 'spear', n }]);

    // ---- 陣と旗 ----
    // 信長の本陣（竜ヶ鼻）：陣幕の内に床几の大将と諸将、後ろに馬印と旗本
    F.hqCamp = camp(rt, { x: HQ.x, z: HQ.z, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 15, reserve: 220, runTo: { x: MORI.x, z: MORI.z + 20 } });
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
    // 織田の段ごとに具足の色を少しずつ変える（十三段の厚み。家ごとに揃えた色）
    const ODS = [0x2b3140, 0x2e2a26, 0x303436, 0x3a2e28, 0x282c34, 0x34302a, 0x2a2e2a];
    // 織田の段：森の備の後ろに幾重にも（柴田・佐久間・丹羽…と続く）。本陣へ通じる真ん中の道は空けておく（兵が通る）
    [[-30, 62, 'oda', 'gun'], [74, 62, 'oda', 'spear'], [-26, 96, 'oda', 'spear'], [80, 98, 'oda', 'mixed'], [0, 126, 'eiraku', 'cavalry'], [-44, 128, 'oda', 'spear'], [78, 132, 'oda', 'spear']]
      .forEach(([x, z, f, kind], i) => DA(x, z, 26, kind === 'gun' ? 6 : 12, kind === 'cavalry' ? 110 : 170, Math.PI, ODS[i % ODS.length], f, 11 + i, kind));
    // 森可成の備の本隊（見た目だけ）：自分の組はその一番前
    DA(MORI.x, MORI.z + 16, 22, 8, 120, Math.PI, 0x2e2a26, 'oda', 19, 'spear');
    // 川原の石：川の両岸に丸い石が出ている
    rt.scene.add(kawara(W));
    // 横山城を囲む織田の兵
    DA(118, 84, 30, 10, 160, 0.9, OD, 'oda', 21, 'spear');
    // 徳川：西の瀬で朝倉と向き合う。奥に家康の本陣
    F.tk = [DA(-112, 30, 40, 16, 260, Math.PI, TK, 'tokugawa', 31, 'mixed'), camp(rt, { x: -150, z: 48, facing: Math.PI, team: 0, faction: 'tokugawa', mon: 'tokugawa', general: { name: '徳川家康' }, guard: 15, reserve: 200, runTo: { x: -112, z: 34 } })];
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
      // 正面いっぱい（西の瀬の -158 から東の 120 まで。森の備の前の -12〜60 だけは本物の兵が受け持つ）
      clash(rt, { x: -120, z: 2, facing: Math.PI, w: 76, gap0: 30, seed: 181, noRout: true, surge: { k: 'B', every: 50, count: 160, flank: 0.30 }, A: side('tokugawa', TK, 700, 0, 'tokugawa', { guns: true }), B: side('asakura', ASAKURA.armor, 920, 1, 'saito', { bows: true }) }),
      clash(rt, { x: -44, z: 3, facing: Math.PI, w: 64, gap0: 26, seed: 182, noRout: true, surge: { k: 'B', every: 45, count: 150, flank: 0.35 }, A: side('oda', OD, 600, 0, 'oda'), B: side('azai', AZAI.armor, 800, 1, 'saito'), link: realFront }),
      clash(rt, { x: 90, z: 3, facing: Math.PI, w: 60, gap0: 26, seed: 183, noRout: true, surge: { k: 'B', every: 55, count: 140, flank: 0.30 }, A: side('oda', OD, 560, 0, 'oda', { guns: true }), B: side('azai', AZAI.armor, 760, 1, 'saito'), link: realFront }),
    ];

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', rt.G.lord ? '浅井の猛攻を耐えて押し返せ' : ((rt.G.rank || 0) >= 3 ? '森の備の先手の一手を預かり、浅井の寄せを受け止めよ' : '森可成の備に立ち、浅井の寄せを受け止めよ'), 'main');
    if (!rt.G.lord) rt.obj('stay', '下知があるまで姉川を渡るな', 'order');
    rt.obj('mori', '森の備を半ばより多く保て', 'side');
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
    rt.say('森可成', '前には坂井殿の段がある。抜けてきた者を、ここで槍を揃えて止めよ。わしの備は後ろに控えておる。その方の組は、その一番前じゃ', 5);
    rt.after(15, () => rt.bark('川は膝ほどの深さで歩いて渡れる。下知があるまで渡るな'));
    rt.after(12, () => rt.say('森可成', '磯野の勢いは長くは続かぬ。こらえておれば、西の徳川殿と東の稲葉殿が浅井の横腹を突く', 4.5));
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
    // こちらの岸の低い所から、川を渡って迫る磯野の騎馬と足軽を 3 秒見せる（戦っている時は撮らない）
    rt.after(1.2, () => rt.player.showShot({ x: 14, z: 7 }, () => g.center(), 3, { h: 0.7, lookH: 2.4, ang: 0, drift: 1.0 }));
    // 磯野の後ろに浅井の騎馬と足軽が続き、対岸の先の備も川べりへ押し出す
    KIT.backOf(rt, g, { flag: 'azai', armor: AZAI.armor, kind: 'cavalry', w: 20, depth: 12, count: 100, gap: 4, seed: 61, stop: () => g.center().z > -14 });   // 控えは川を渡りきらず、向こう岸で待つ（森の備の前で戦う兵を埋めない）
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
        rt.say('森可成', F.sakai.routed || F.sakai.count < 6 ? '坂井殿の段がもう抜かれたか……！　池田殿の段の後ろで槍を揃えよ！' : '坂井殿の段が押されておる……！　槍を揃えよ、抜けてきた者はここで止める！', 3.5);
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
      // 旗を差さず、白い陣羽織を血で汚した異様な姿（首を提げて味方のふりをする）
      [{ type: 'samurai', n: 1, o: { name: '遠藤直経', flag: null, hat: 'kabuto', haori: 0xcfc6b4, haoriMonCol: 0x6a1a14 } }]);
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
      rt.obj('endo', '首を提げて寄る武者（遠藤直経）を討て', 'side');
      rt.marker('endo', unitPos(u), '首を提げた武者', { red: true });
      return;
    }
    rt.say('森可成', 'むっ……あの武者、首を提げて本陣の方へ行く。味方の旗を差しておらぬぞ！', 4);
    rt.say('森可成', `${nm(rt)}、あれは浅井の者じゃ！　本陣へ行かせるな！`, 3.5);
    rt.obj('endo', '首を提げて本陣へ向かう武者（遠藤直経）を止めよ', 'side');
    rt.marker('endo', unitPos(u), () => `首を提げた武者・本陣まで ${Math.max(0, Math.round(Math.hypot(u.pos.x - HQ.x, u.pos.z - HQ.z) - 18))}m`, { red: true });
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
      KIT.backOf(rt, g3, { flag: 'azai', armor: AZAI.armor, kind: 'spear', w: 18, depth: 10, count: 110, seed: 62, stop: () => g3.center().z > -14 });
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
    F.clash[2].cavalry('A', { from: -1, flag: 'inaba', armor: INABA.armor, count: 60, delay: 2 });
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
    // 追い討ちでは、段の後ろの味方（坂井・池田・佐久間）は任務に数えない：遠くの者から外して、浅井の本隊へ渡った時の枠に回す
    KIT.markRecyclable(F.sakai, F.ikeda, F.kino);
    rt.unmark('iso'); rt.unmark('third');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '磯野の突撃を受け止めた');
    if (F.mori.count > F.mori0 / 2) { rt.objDone('mori'); rt.award((t) => t.side.push('森の備を保った'), '副任務：森の備を保った'); } else rt.objFail('mori');
    if (!F.crossed && !rt.G.lord) rt.objDone('stay');
    rt.objRemove('stay');
    if (F.endoU && F.endoU.alive && !F.endoDone) { F.endoDone = true; rt.unmark('endo'); rt.objFail('endo'); F.endoG.noRout = false; F.endoG.morale = 0; }
    sfx('horagai', 1);
    // 朝から戦い続け、日は高く昇った
    rt.world.setTime('after');
    rt.banner('浅井勢、崩れる', '姉川を渡り、追い落とせ');
    rt.say('森可成', '浅井が退くぞ！　川を渡れ！　向こう岸のしんがりを崩せば、この戦は勝ちじゃ！', 4.5);
    rt.obj('pursue', '姉川を渡り、向こう岸で踏みとどまる浅井の殿（しんがり）を崩せ', 'main');
    // 判断：浅井の殿を追うか、西の瀬で押し合う徳川を助けに回るか
    if (!rt.G.lord) rt.after(4, () => rt.choose('西の瀬で徳川が朝倉の残りと押し合っている。どうする？', [
      { label: '川を渡り、浅井のしんがりを追う', note: '森の備と一緒に向こう岸へ。追い討ちの手柄' },
      { label: '西の瀬へ回り、徳川を助ける', note: '朝倉の残りの横を突く。徳川との仲の手柄。浅井のしんがりは森の備に任せる' },
    ], (i) => {
      if (i === 1) {
        F.helpTk = true;
        F.akRest = enemyGroup(rt, { faction: 'saito', name: '朝倉の残り', anchor: { x: -64, z: -2 }, facing: -Math.PI / 2, order: 'attack', seekRange: 60, aggro: 14, width: 14, morale: 90, fleeDir: { x: -0.5, z: -1 } },
          dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 2 }], ASAKURA));
        KIT.backOf(rt, F.akRest, { flag: 'asakura', armor: ASAKURA.armor, kind: 'spear', w: 20, depth: 12, count: 160, seed: 65 });
        rt.obj('tk', '西の瀬へ回り、朝倉の残りの横を突け', 'main');
        rt.marker('akr', centerOf(F.akRest), () => `朝倉の残り・${moraleWord(F.akRest.morale)}`, { red: true, group: F.akRest });
        rt.objRemove('pursue');   // 浅井のしんがりは森の備に任せる（選ばなかった任務で「しくじり」にしない）
        rt.say('森可成', 'よし、西へ行け！　徳川殿に借りを返せ。浅井のしんがりはわしが受け持つ', 3.5);
      } else rt.say('森可成', 'よし、続け！　向こう岸じゃ！', 2.5);
    }, 18));
    for (const g of [F.mori, F.ikeda, F.kino, F.inaba, F.shibata]) if (g && g.count) { g.order = 'attack'; g.seekRange = 70; g.formation = 'line'; }
    const R = enemyGroup(rt, { faction: 'saito', name: '浅井のしんがり', anchor: { x: 24, z: -36 }, facing: 0, fleeDir: { x: 0.1, z: -1 }, aggro: 12, width: 16, morale: 85 },
      dress([{ type: 'busho', n: 1, o: { name: '浅井の殿の侍大将', horse: true, hat: 'kabuto_m', haori: 0x3a4a3a } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 26 }, { type: 'gun', n: 5 }], AZAI));
    F.rear = R;
    for (const u of R.units) if (u.type === 'gun') u.dmg *= 0.5;
    R.dmgMult = 0.7;   // 殿は退きながら踏みとどまる隊。川を渡る味方の大勢に押し包まれる側   // 川を渡る者を撃つ殿の鉄砲は、一発で倒れない強さに
    R.noRout = true;
    rt.after(35, () => { R.noRout = false; });
    if ((F.dpMem || {}).aneInaba) { R.morale -= 20; rt.after(6, () => rt.say('森可成', '稲葉殿の横槍が効いておる。しんがりは浮き足立っておるぞ！', 3)); }
    rt.marker('rear', centerOf(R), () => `浅井のしんがり・${moraleWord(R.morale)}`, { red: true, group: R });
    // 浅井の先の備は崩れ、長政の本陣と後ろの騎馬は北の山へ引いていく
    F.retreat = rt.t;
    // （殿はこの大軍のいた所で踏みとどまるので、崩れた大軍は早めに散らして消す：戦う兵が影の兵に埋もれないように）
    F.azDA[0].m.rout({ hideAfter: 12 });
    rt.after(12.5, () => { F.azDA[0].m.visible = false; });
    // 磯野と三の手の後ろの控えも、浅井の崩れと一緒に散る（殿の戦う所に影の兵を残さない）
    for (const q of F.backs || []) if (!q.gone) { q.gone = true; q.b.rout({ hideAfter: 12 }); rt.after(12.5, () => { q.b.visible = false; }); }
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
    // 一斉射：磯野の隊が川の中ほどまで寄せたら、森の備の鉄砲が「放て」（一度だけ）
    if (!F.vol1 && F.iso && !gone(F.iso) && F.iso.center().z > -12) {
      F.vol1 = true;
      volley(rt, F.guns, { who: '森可成', wait: 2.2, line: '鉄砲、放てぇっ！　川の中の足を止めよ！', banner: ['一斉射', '森の備の鉄砲が、川を渡る磯野勢へ放つ'], C: F.clash && F.clash[1], hit: 22 });
    }
    depthTick(rt, dt);
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
      // 坂井の段が押し負けていく様子を印で見せる（崩れたら消す）
      if (!F.sakaiMk && F.iso && F.iso.order === 'attack') { F.sakaiMk = true; rt.marker('sakai', centerOf(F.sakai), () => `坂井の段・${moraleWord(F.sakai.morale)}`, { group: F.sakai }); }
      if (F.sakaiMk && (F.sakai.routed || !F.sakai.count)) rt.unmark('sakai');
      // 坂井の段が崩れたら知らせる
      if (F.sakai.routed && !F.sakaiSaid) { F.sakaiSaid = true; rt.say('森可成', '坂井殿の段が破られた！　次は池田殿の段じゃ……', 3); }
      if ((F.ikeda.routed || F.ikeda.count < 4) && !F.ikedaSaid) { F.ikedaSaid = true; rt.banner('池田の段も破られる', '磯野の勢い、止まらず'); rt.say('森可成', '池田殿の段も抜かれた！　来るぞ、槍を揃えよ！', 3); }
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
      if (spent && !F.tkDone && !F.tkSoon) { F.tkSoon = true; rt.say('森可成', '浅井め、川向こうで立て直しておる。息を整えよ、また来るぞ', 3.5); rt.after(6, () => this.tokugawa(rt)); }
      if (F.third && gone(F.third)) rt.unmark('third');
      if (!iso.routed && iso.count <= 3 && !iso.fled) { iso.fled = true; iso.noRout = false; iso.morale = 0; rt.unmark('iso'); rt.banner('磯野員昌、退く', '浅井の先手、川向こうへ'); }
      // 浅井の寄せが尽きたら、追い落とす前に段を重ねる（立て直し→稲葉の後ろか川べりか→川べりの鉄砲組）
      if (spent && F.inabaT && rt.t - F.inabaT > 10 && F.third) { if (rt.G.lord) this.counter(rt); else { F.step = 1.5; depthStart(rt, aneCtx(rt, BANK_N + 2), aneA(), () => this.counter(rt)); } }
      // 長引いたら、浅井は横を突かれて自ら引く（先へ進めるように）
      else if (F.inabaT && rt.t - F.inabaT > 110) { for (const g of waves) if (g && g.count) { g.noRout = false; g.morale = 0; } }
    }
    if (F.step === 2) {
      const R = F.rear;
      if (!F.helpTk) rt.objProgress('pursue', `浅井のしんがり ${R.count}人`);
      // 徳川を助けに回った時は、朝倉の残りを崩せば勝ち（浅井の殿は森の備が崩す）
      if (F.helpTk && F.akRest && !F.tkHelped) {
        rt.objProgress('tk', `朝倉の残り ${gone(F.akRest) ? 0 : F.akRest.count}人`);
        if (F.akRest.count < 6 && !gone(F.akRest)) F.akRest.morale = Math.min(F.akRest.morale, 20);
        if (gone(F.akRest)) {
          F.tkHelped = true; rt.unmark('akr'); rt.objDone('tk');
          rt.award((t) => { t.special = { label: '西の瀬で徳川を助けた', pts: 25 }; }, '西の瀬で徳川を助けた');
          rt.say('徳川の侍', 'かたじけない！　織田の方の助太刀、主の三河守に申し伝えまする', 3.5);
          R.noRout = false; R.morale = Math.min(R.morale, 15);
        }
      }
      if (!F.dpB && (gone(R) || rt.t - F.stepT > (F.helpTk ? 200 : 160))) {
        F.dpB = true;
        if (F.helpTk && !F.tkHelped) { rt.objFail('tk'); rt.unmark('akr'); }
        rt.unmark('rear');
        if (F.helpTk) { if (!gone(R)) { R.noRout = false; R.morale = 0; } }
        else if (gone(R)) { rt.objDone('pursue'); rt.award((t) => { t.special = { label: '追い討ち', pts: 25 }; }, '浅井のしんがりを崩した'); }
        else { rt.objFail('pursue'); R.noRout = false; R.morale = 0; }
        if (F.akRest && !gone(F.akRest)) { F.akRest.noRout = false; F.akRest.morale = 0; }
        // 向こう岸を取った後も段を重ねる（長政の後備えか横山城か→退き口）
        if (!rt.G.lord) { depthStart(rt, aneCtx(rt, undefined, 0.52), aneB(), () => this.ending(rt)); return; }
        this.ending(rt);
      }
    }
  },
  ending(rt) {
    const F = rt.flags;
    F.ending = true;
    rt.banner('浅井・朝倉、退く', '姉川の戦、終わる');
    rt.say('森可成', rt.G.lord ? '殿、勝ちましたぞ！　浅井は小谷へ逃げ込むほかありますまい' : `勝ったぞ！　${nm(rt)}、ようこらえた。浅井は小谷へ逃げ込むほかあるまい`, 4.5);
    rt.say('伝令', '横山城、降ると申し出ておりまする！', 3);
    sfx('horagai', 0.8);
    rt.player.u.invuln = true;   // 戦が終わったあとの流れ弾で重傷にならないように
    rt.finish({}, 10);
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
    if (g === F.rear) rt.say('足軽', 'しんがりが崩れた！　浅井は総崩れじゃ！', 3);
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

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n }), uB = (n) => ({ type: 'bow', n });
function aneCtx(rt, keepZ, dmg) {
  const F = rt.flags;
  return { faction: 'saito', flag: 'azai', armor: AZAI.armor, dmg: dmg || 0.62, keepZ, look: (l) => dress(l, AZAI), friends: () => [F.shibata].filter((g) => g && g.count && !g.routed), aid: { name: '森の備の一手', list: [uS(1), uA(8)] }, aidSaid: '森の備から一手が加わった' };
}
// 浅井の寄せが尽きた後、追い落とす前：立て直し → 判断（稲葉の後ろか、川べりか）→ 川べりの鉄砲組
function aneA() {
  return [
    rest({ dur: 12, say: [['森可成', '槍を揃え直せ。手負いは後ろへ下げよ'], ['足軽', '坂井殿の段は……ほとんど残っておらぬ'], ['森可成', '嘆くのは後じゃ。浅井の旗は、まだ川向こうに立っておる']] }),
    pick({ title: '浅井の一隊が東の瀬を渡り、稲葉殿の後ろへ回った。どうする？',
      pre: (rt) => rt.say('伝令', '東の瀬を浅井の別手が渡りました！　稲葉殿の後ろを突く気でございます！', 3.5),
      options: [{ label: '東へ回り、稲葉殿の後ろを守る', note: '稲葉の横槍が続き、後で浅井の殿（しんがり）が崩れやすい' }, { label: '森の備の前に残り、川べりを固める', note: '森の備の前が固くなる。稲葉の手は押される' }],
      on: (rt, m, i) => { m.aneInaba = i === 0; rt.say('森可成', i === 0 ? 'よし、東へ走れ！　川は渡るなよ' : 'よし、ここで槍を揃えよ', 3); } }),
    fight({ skip: (rt, m) => !m.aneInaba, at: { x: 84, z: 22 }, title: '東の瀬の別手', sub: '稲葉一鉄の手の後ろを、浅井の別手が突く', obj: '稲葉殿の後ろを突く浅井の別手を崩せ（川は渡らない）',
      foes: () => [{ name: '浅井の別手', from: { x: 108, z: -12 }, list: [uS(2), uA(16), uG(3)] }],
      later: [{ t: 24, title: '新手', sub: '浅井の騎馬が瀬を渡る', say: ['足軽', '騎馬が瀬を渡ってくる！'], foes: () => [{ name: '浅井の騎馬', from: { x: 124, z: -16 }, list: [uC(4), uA(8)] }] }],
      reward: '稲葉殿の後ろを守った' }),
    hold({ skip: (rt, m) => m.aneInaba, at: { x: 22, z: 22 }, dur: 70, r: 12, title: '川べりを固める', sub: '浅井の足軽が、また川へ入る', label: '森の備の前', obj: '森の備の前で、川を渡ってくる浅井勢を受けよ（川は渡らない）',
      waves: [
        { t: 5, say: ['足軽', '浅井の足軽がまた川へ入ったぞ！'], foes: () => [{ name: '川を渡る浅井勢', from: { x: 22, z: -30 }, list: [uS(2), uA(14)] }] },
        { t: 28, say: ['森可成', '鉄砲を連れておる！　撃たれる前に寄れ！'], foes: () => [{ name: '浅井の鉄砲と足軽', from: { x: -6, z: -30 }, list: [uG(4), uA(10)] }] },
      ],
      reward: '川べりを固めた' }),
    hold({ at: { x: 24, z: 20 }, dur: 80, r: 14, title: '浅井の総掛かり', sub: '長政の旗本が、最後の力で川へ押し出す', label: '森の備の前', obj: '森の備の前で、浅井の総掛かりを受け止めよ（川は渡らない）',
      say: [['森可成', '総掛かりじゃ！　槍を揃えよ。これを凌げば浅井は崩れる！']],
      waves: [
        { t: 5, say: ['足軽', '川面が浅井の旗で埋まったぞ！'], foes: () => [{ name: '浅井の総掛かり', from: { x: 20, z: -34 }, list: [uS(3), uA(12), uG(2)], mass: 240 }] },
        { t: 13, foes: (rt) => { volley(rt, rt.flags.guns, { who: '森可成', waitLine: '', line: '鉄砲、放て！　川から上がる所を撃て！', C: rt.flags.clash && rt.flags.clash[1], hit: 20 }); return []; } },
        { t: 40, say: ['森可成', '騎馬が混じっておる！　槍を立てよ！'], foes: () => [{ name: '浅井の騎馬と旗本', from: { x: 52, z: -30 }, list: [uS(2), uC(4), uA(12)], mass: 200 }] },
      ],
      reward: '浅井の総掛かりを受け止めた' }),
    rest({ dur: 8, bark: '組を寄せ、渡る支度をせよ', say: [['森可成', '浅井の旗が揺れておる……もう一押しじゃ']] }),
  ];
}
// 向こう岸の殿を崩した後：立て直し → 判断（長政の後備えか、横山城の城兵か）→ 判断（退き口を守るか、朝倉の残りを突くか）
function aneB() {
  return [
    rest({ dur: 12, heal: 0.6, say: [['森可成', (rt) => (rt.flags.helpTk ? '西の瀬は片づいた。森の備も向こう岸を取ったぞ。……息を整えよ' : '向こう岸を取ったぞ。……息を整えよ')], ['伝令', '長政の本陣、小谷へ退いていきまする！　横山城からは城兵が打って出たと！']] }),
    pick({ title: '長政の本陣が北へ退き、横山城から城兵が出た。どうする？',
      options: [{ label: '北へ、長政の本陣の後備えを追う', note: '長政の後備えを崩せば大手柄。北の山際は狭い' }, { label: '西の横山城の城兵に当たる', note: '城兵を押し戻せば、横山城が早く降る' }],
      on: (rt, m, i) => { m.aneChase = i === 0; rt.say('森可成', i === 0 ? 'よし、北じゃ！　深入りして山へ入るな' : 'よし、城兵を城へ押し戻せ！', 3); } }),
    fight({ skip: (rt, m) => !m.aneChase, at: { x: 30, z: -78 }, title: '長政の後備え', sub: '小谷へ退く長政を逃がすため、後備えが向き直る', obj: '長政の本陣の後備えを崩せ',
      foes: () => [{ name: '長政の後備え', from: { x: 30, z: -116 }, list: [uS(2), uA(10), uG(2)], noRout: 20 }],
      later: [{ t: 34, title: '横槍', sub: '浅井の騎馬が山際から', say: ['足軽', '山際から騎馬じゃ！'], foes: () => [{ name: '浅井の騎馬', from: { x: 66, z: -110 }, list: [uC(3), uA(6)] }] },
        { t: 70, title: '新手', sub: '小谷の方から浅井の新手が駆け戻る', say: ['森可成', '新手じゃ！　山へは入るな、ここで受けよ！'], foes: () => [{ name: '駆け戻る浅井の新手', from: { x: 10, z: -124 }, list: [uS(1), uA(8)], mass: 200 }] }],
      reward: (t) => { t.special = { label: '長政の後備えを崩した', pts: 25 }; }, rewardLabel: '長政の後備えを崩した' }),
    fight({ skip: (rt, m) => m.aneChase, at: { x: -52, z: -58 }, title: '横山城の城兵', sub: '横山城から打って出た城兵が、川を渡る味方を狙う', obj: '横山城から出た城兵を押し戻せ',
      foes: () => [{ name: '横山城の城兵', from: { x: -84, z: -104 }, list: [uS(2), uA(15), uB(4)] }],
      later: [{ t: 28, say: ['足軽', '城からまだ出てくるぞ！'], foes: () => [{ name: '横山城の後の城兵', from: { x: -96, z: -90 }, list: [uS(2), uA(10)] }] }],
      reward: '横山城の城兵を押し戻した' }),
    rest({ dur: 12, heal: 0.6, bark: '川岸へ戻り、組を集め直せ', say: [['森可成', '日が傾いてきた。味方は川を渡って戻り始めておる'], ['伝令', (rt) => (rt.flags.tkHelped ? '西の瀬で崩れた朝倉勢が、また寄り集まって戻ってきまする！　渡る味方の背を狙うておると！' : '西の瀬から、朝倉の残りが戻ってきまする！　渡る味方の背を狙うておると！')]],
      fn: (rt) => rt.world.setTime('dusk') }),
    pick({ title: '朝倉の残りが、川を渡って戻る味方の背を狙う。どうする？',
      options: [{ label: '川岸で踏みとどまり、渡る味方を守る', note: '味方が無事に戻れる。朝倉の寄せを受け続ける' }, { label: '西へ打って出て、朝倉の残りを突く', note: '朝倉の残りを崩せば手柄。追い返せば戦は早く終わる' }],
      on: (rt, m, i) => { m.aneGuard = i === 0; } }),
    hold({ skip: (rt, m) => !m.aneGuard, at: { x: 6, z: -16 }, dur: 90, r: 13, title: '退き口', sub: '川を渡って戻る味方の背を守る', label: '川岸の退き口', obj: '川岸で踏みとどまり、渡って戻る味方を守れ',
      waves: [
        { t: 5, say: ['足軽', '西から朝倉勢じゃ！'], foes: () => [{ name: '朝倉の残り', from: { x: -60, z: -30 }, flag: 'asakura', armor: ASAKURA.armor, list: dress([uS(1), uA(10)], ASAKURA) }] },
        { t: 38, say: ['足軽', '鉄砲を撃ちかけてくる！'], foes: () => [{ name: '朝倉の鉄砲', from: { x: -50, z: -60 }, flag: 'asakura', armor: ASAKURA.armor, list: dress([uG(3), uA(6)], ASAKURA) }] },
        { t: 64, say: ['森可成', 'これで最後じゃ！　踏みとどまれ！'], foes: () => [{ name: '朝倉の騎馬', from: { x: -70, z: -44 }, flag: 'asakura', armor: ASAKURA.armor, list: dress([uC(2), uA(6)], ASAKURA), morale: 70 }] },
      ],
      reward: '退き口を守った' }),
    fight({ skip: (rt, m) => m.aneGuard, at: { x: -46, z: -22 }, title: '朝倉の残りを突く', sub: '西の瀬から戻る朝倉勢の横を突く', obj: '戻ってくる朝倉の残りを崩せ',
      foes: () => [{ name: '朝倉の残り', from: { x: -80, z: -36 }, flag: 'asakura', armor: ASAKURA.armor, list: dress([uS(2), uA(12), uG(2)], ASAKURA) }],
      later: [{ t: 30, say: ['足軽', '朝倉の騎馬が戻ってくる！'], foes: () => [{ name: '朝倉の騎馬', from: { x: -96, z: -20 }, flag: 'asakura', armor: ASAKURA.armor, list: dress([uC(3), uA(6)], ASAKURA), morale: 70 }] }],
      reward: (t) => { t.special = { label: '朝倉の残りを崩した', pts: 20 }; }, rewardLabel: '朝倉の残りを崩した' }),
  ];
}

export { anegawa };
