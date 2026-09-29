// 設楽原の戦の定義（見本の戦。battles.js から分けた。中身は元のまま）
import { gauss, allyGroup, nm, enemyGroup, centerOf } from './bhelp.js';
import { buildBobosaku } from './b_sunomata.js';
import { scenarioKey, RANKS } from './state.js';
import { nagashinojo } from './b_nagashinojo.js';
import { nobori, tawara, stumps } from './props.js';
import { clash } from './b_sekigahara.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gone, seasonOf, sky, uS, uA, uC, uG } from './b_shared.js';
import * as DP from './b_depth.js';
import { depthOn, depthTick, depthStart } from './b_depth.js';

// ======================================================================
// 長篠編　設楽原の決戦（天正三年五月二十一日）
// 連吾川を挟んだ南北に長い原。織田・徳川は川の西に三重の馬防柵を結い、鉄砲をその内に並べた。
// 東の丘から武田の騎馬と足軽が波のように寄せる。足軽の役目は、柵の内から槍で突き落とすこと
// ======================================================================
const SB = { x0: 14, gap: 7, z0: -96, z1: 96, gates: [-42, 18, 66] };   // 馬防柵：一列目の x、列の間、南北の端、虎口
const RENGO = [[42, -176], [38, -90], [44, -20], [40, 50], [46, 120], [42, 176]];   // 連吾川
const SH_FRONT = SB.x0 + 2;   // これより東へ出たら「柵の外」

const shitaragahara = {
  spawn: { x: 10, z: 4, heading: Math.PI / 2 },
  world: {
    seed: 57,
    mood: 'morning',
    muddy: 0.25,
    time: 'day',
    paths: [[[-176, 10], [-80, 8], [-20, 18], [SB.x0 - 2 * SB.gap - 4, SB.gates[1]]]],
    height(x, z) {
      let h = 0.8 * Math.sin(x * 0.035) * Math.cos(z * 0.028) + 0.5 * Math.sin(z * 0.06 + x * 0.02);
      // 西：弾正山（家康の陣）と、信長の茶臼山。東：武田の陣の丘
      h += 7 * gauss(x, z, -85, 12, 2400) + 6 * gauss(x, z, -110, -90, 2600);
      h += Math.max(0, x - 70) * 0.09 + 5 * gauss(x, z, 150, -40, 3600) + 4 * gauss(x, z, 140, 80, 3000);
      // 柵の前の浅い空堀と、柵の後ろの土盛り
      const fx = SB.x0 + 2.6;
      h -= 0.9 * Math.exp(-((x - fx) ** 2) / 1.6) * (Math.abs(z) < SB.z1 ? 1 : 0);
      const bx = SB.x0 - 2 * SB.gap - 3;
      h += 0.75 * Math.exp(-((x - bx) ** 2) / 3) * (Math.abs(z) < SB.z1 ? 1 : 0);
      return h;
    },
    tint(x, z, h, c) {
      // 柵の並ぶ所は踏み固められて土が出ている
      if (x > SB.x0 - 2 * SB.gap - 5 && x < SB.x0 + 4 && Math.abs(z) < SB.z1) c.setRGB(c.r * 0.8 + 0.08, c.g * 0.78 + 0.06, c.b * 0.7 + 0.03);
      // 川沿いの湿った田
      if (Math.abs(x - 40) < 14) c.setRGB(c.r * 0.85, c.g * 0.9, c.b * 0.8);
    },
    clear: (x, z) => x > -45 && x < 95,
    paddy(x, z) {
      if (x < 24 || x > 58 || Math.abs(x - 41) < 4) return 0;
      if ((Math.floor(x / 11) + Math.floor(z / 16)) % 2) return 0;
      const ex = Math.min(((x % 11) + 11) % 11, 11 - ((x % 11) + 11) % 11), ez = Math.min(((z % 16) + 16) % 16, 16 - ((z % 16) + 16) % 16);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6));
    },
    streams: [{ pts: RENGO, w: 2.4, depth: 1.2 }],
    trees: 300,
    tufts: 4200,
    // 武田の陣の丘は木を疎らに（丘に並ぶ武田の備が柵から見えるように）
    treeDensity: (x, z) => (x < -60 || x > 168 ? 1 : x > 100 ? 0.12 : 0.3),
    groves: [{ x: -70, z: -40, r: 14, n: 22 }, { x: 168, z: 20, r: 16, n: 26 }, { x: 150, z: -120, r: 14, n: 20 }],
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.fence = buildBobosaku(rt, { x0: SB.x0, z0: SB.z0, z1: SB.z1, gap: SB.gap, gates: SB.gates, facing: 1 });
    F.broken = 0;
    // 織田家編では、織田の鉄砲奉行（前田利家）の下の足軽として柵の内に立つ。戦の流れは同じで、上役・家・持ち場の旗だけ替わる
    const oda = scenarioKey() === 'oda' && !rt.G.lord;
    F.oda = oda;
    F.boss = oda ? '前田利家' : '大久保忠世';
    const odaZ = oda ? 20 : -20;   // これより北（-z）は織田の持ち場（通説どおり織田が北寄り、徳川が南）
    // 鉄砲組：一列目の柵のすぐ内。号令があるまで撃たない
    F.guns = [];
    for (const z of [-84, -56, -28, 0, 28, 56, 84]) {
      // 織田家編では、自分の前の鉄砲組の頭が鉄砲奉行の佐々成政
      const sassa = oda && z === 0;
      F.guns.push(allyGroup(rt, { faction: z < odaZ ? 'oda' : 'tokugawa', name: sassa ? '佐々成政の鉄砲組' : '鉄砲組', anchor: { x: SB.x0 - 2.4, z }, facing: Math.PI / 2, width: 16, spacing: 1.6, aggro: 44, noRout: true, holdFire: true, dmgMult: 0.8 },
        [...(sassa ? [{ type: 'samurai', n: 1, o: { name: '佐々成政', invuln: true } }] : []), { type: 'gun', n: 16 }]));
    }
    // 槍の組：自分の組（大久保忠世の手）と、南北の組
    const ok = allyGroup(rt, { faction: oda ? 'oda' : 'tokugawa', name: oda ? '前田組' : '大久保組', anchor: { x: SB.x0 - 4.5, z: 2 }, facing: Math.PI / 2, width: 16, aggro: 6, noRout: true, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: F.boss, invuln: true, horse: true } }, { type: 'ashigaru', n: 16 }]);
    F.okubo = ok.units[0];
    F.spears = [ok];
    for (const [z, fac] of [[-70, 'oda'], [-38, 'oda'], [36, oda ? 'oda' : 'tokugawa'], [68, 'tokugawa']]) {
      F.spears.push(allyGroup(rt, { faction: fac, name: '槍組', anchor: { x: SB.x0 - 4.5, z }, facing: Math.PI / 2, width: 16, aggro: 6, noRout: true, formation: 'yari', order: 'hold' },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }]));
    }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: SB.x0 - 4, z: 8 }, Math.PI / 2, [{ kind: 'spear', n }]);
    // 柵の内の鉄砲組と南北の槍組は任務に数えない：遊び手が柵を出て武田の大軍へ乗り込んだ時は、
    //   遠くの者（遊び手から 55m・カメラから 50m より先）から外し、大軍の中の軽い兵を本物の兵に替える枠へ回す
    nagashinojo.kit.markRecyclable(...F.guns, ...F.spears.slice(1));

    // 本陣：家康は弾正山、信長は茶臼山（陣幕の内に床几の大将と諸将、後ろに馬印と旗本）
    const KT = nagashinojo.kit, A = KT.ARMOR;
    KT.honjin(rt, -84, 12, { mon: 'tokugawa', w: 16, d: 12, armor: A.tokugawa });
    KT.honjin(rt, -110, -90, { mon: 'oda', w: 16, d: 12, armor: A.oda });
    for (const [x, z, k, h] of [[-94, 22, 'onri', 6.5], [-100, -80, 'eiraku', 6.5]]) rt.scene.add(nobori(W, x, z, k, h));
    // 柵の内の旗（織田が北寄り、徳川が南）
    for (let z = -88; z <= 88; z += 22) rt.scene.add(nobori(W, SB.x0 - SB.gap - 3, z + 5, z < odaZ ? (oda && z % 44 === 0 ? 'maeda' : 'oda') : (z % 44 === 0 ? 'okubo' : 'tokugawa'), 5));
    rt.scene.add(tawara(W, -30, 30, 0.3, 6), tawara(W, -34, -20, -0.4, 5));
    // 遠景の村（西の山すそと、南の谷）
    KT.farVillage(rt, -18, 160, { rot: Math.PI, n: 6, fields: 8, seed: 21 });
    KT.farVillage(rt, 64, -158, { rot: 0, n: 5, fields: 6, seed: 22 });
    // 大軍：戦う兵の周りを、軽い作りの兵で埋める（織田・徳川は三万、武田は一万五千）
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    // 柵の二列目の後ろ：南北いっぱいに控えの列（どこを見ても柵が人で埋まって見える）
    for (const [z0, z1, flag] of [[-96, -8, 'oda'], [-8, 96, 'tokugawa']]) DA(SB.x0 - 2 * SB.gap - 7, (z0 + z1) / 2, z1 - z0, 4, 300, Math.PI / 2, A[flag], flag, z0 < 0 ? 31 : 32);
    // 後ろの控え（備）：鉄砲の替えの組・槍の備・旗本の騎馬
    [[-40, -70, 'oda', 'spear'], [-40, -20, 'eiraku', 'gun'], [-40, 30, 'tokugawa', 'spear'], [-40, 75, 'okubo', 'gun'], [-66, 0, 'onri', 'cavalry'], [-75, -62, 'oda', 'spear']]
      .forEach(([x, z, f, kind], i) => DA(x, z, kind === 'gun' ? 26 : 16, kind === 'gun' ? 6 : 24, kind === 'cavalry' ? 120 : 180, Math.PI / 2, f === 'oda' || f === 'eiraku' ? A.oda : A.tokugawa, f, 41 + i, kind));
    // 武田の本隊：川向こうの丘に、隊ごとに旗を立てて並ぶ。赤備えは赤。奥に勝頼の本陣
    F.hill = [[118, -80, 'takeda', 'spear'], [124, -40, 'akazonae', 'cavalry'], [116, 0, 'takeda', 'cavalry'], [124, 40, 'takeda', 'mixed'], [118, 80, 'takeda', 'spear'], [150, 50, 'takeda', 'cavalry']]
      .map(([x, z, f, kind], i) => DA(x, z, kind === 'cavalry' ? 22 : 14, kind === 'cavalry' ? 16 : 28, kind === 'cavalry' ? 130 : 200, -Math.PI / 2, A[f], f, 51 + i, kind));
    F.katsuyori = DA(156, -12, 30, 26, 220, -Math.PI / 2, A.takeda, 'takeda', 57, 'honjin');
    F.katsuyori.army.lord = '武田勝頼';   // 近づけば旗本が本物の兵になって迎え撃ち、勝頼は奥へ下がる（b_nagashinojo.js の wake）
    // 寄せの波ごとに、遠くでも別の隊が柵へ駆けていく（見た目だけ）。四十間ほどで鉄砲に撃ち崩されて散る
    F.far = [];
    for (const [z, f, kind] of [[-80, 'akazonae', 'cavalry'], [-58, 'akazonae', 'cavalry'], [72, 'takeda', 'cavalry'], [52, 'takeda', 'spear'], [-66, 'takeda', 'cavalry'], [60, 'takeda', 'cavalry']]) {
      const m = DA(125, z, kind === 'cavalry' ? 20 : 14, 12, kind === 'cavalry' ? 80 : 90, -Math.PI / 2, A[f], f, 61 + F.far.length, kind);
      m.visible = false;
      F.far.push({ m, z, v: 0 });
    }
    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('hold', `${rt.G.lord ? '馬防柵で武田を迎え撃ち、勝頼を退かせよ' : '馬防柵を守り抜け'}（武田の寄せ 0/3）`, 'main');
    if (!rt.G.lord) rt.obj('stay', '下知があるまで柵の外へ出るな', 'order');
    rt.obj('fence', '一列目の柵を、三か所より多く破らせるな', 'side');
    // 信長で遊ぶ時：柵の南（織田の持ち場）で、家臣の言上を聞く
    if (rt.G.lord) {
      rt.say('滝川一益', '殿、柵は三重に結い終えました。鉄砲は柵の内に並べてございます', 4.5);
      rt.say('佐久間信盛', '武田の騎馬、丘の上に揃うております。勝頼は退かぬ構えと見えまする', 4.5);
      rt.say('織田信長', '騎馬は柵で止めよ。止まった所を撃て。柵の外へは出るな――勝頼が背を向けるまでじゃ', 5);
      F.wave = 0;
      rt.after(16, () => this.wave(rt));
      return;
    }
    if (oda) {
      rt.say('前田利家', `${nm(rt)}、桶狭間の雨から十五年か。あの日のわしは出仕を止められた身で、勝手に駆けつけておった。……よう生き残ったのう`, 5.5);
      rt.say('佐々成政', '鉄砲は柵の内に並べ終えた。千挺と言うが、ここに見えるはその一部よ。騎馬が柵で止まった所を、われら奉行の下知で撃つ', 5.5);
      rt.say('前田利家', '柵の外へは出るな。誘いに乗って出た者から死ぬ。その方の組は前田組の一手じゃ。撃ち漏らしを槍で突き落とせ', 5);
      rt.after(22, () => rt.bark('柵の隙間から槍で突ける。鉄砲は前田利家の「放て」で一斉に撃つ'));
    } else {
      rt.say('大久保忠世', `${nm(rt)}、よう見ておけ。あの丘の向こうに武田の本隊がおる`, 4.5);
      rt.say('大久保忠世', '騎馬は柵で止める。止まった所を鉄砲で撃ち、柵に取り付いた者を槍で突き落とせ', 5);
      rt.say('大久保忠世', '柵の外へは出るな。誘いに乗って出た者から死ぬ', 4);
      rt.after(20, () => rt.bark('柵の隙間から槍で突ける。鉄砲は大久保の「放て」で一斉に撃つ'));
    }
    F.wave = 0;
    rt.after(16, () => this.wave(rt));
  },

  // 武田の寄せ：一の波から三の波。名のある将が率い、騎馬が先に駆け、足軽が続く
  WAVES: [
    { name: '山県昌景', fac: 'akazonae', z: -36, cav: 12, ash: 22, line: '赤備えじゃ！　山県の騎馬が来るぞ！', hist: '山県昌景、討死',
      fall: '山県昌景、柵の前で鉄砲に撃たれ、馬から落ちたぞ！' },
    { name: '内藤昌豊', fac: 'takeda', z: 34, cav: 10, ash: 24, line: '二の波！　内藤の旗じゃ！', hist: '内藤昌豊、討死',
      fall: '内藤昌豊、退く兵を背に踏みとどまって討たれたぞ！' },
    { name: '真田信綱', fac: 'takeda', z: -6, cav: 12, ash: 24, line: '三の波！　真田の騎馬、正面から！', hist: '真田信綱、討死',
      fall: '真田信綱、柵を越えられぬまま討死！　弟の昌輝も続いたと！' },
  ],
  // 織田家編：織田の持ち場の前に来たのは真田・土屋・馬場。山県・内藤は北の徳川の柵へ（知らせで聞く）
  WAVES_ODA: [
    { name: '真田信綱', fac: 'takeda', z: -36, cav: 12, ash: 22, line: '六文銭の旗じゃ！　真田の騎馬が来るぞ！', hist: '真田信綱、討死',
      fall: '真田信綱、柵を越えられぬまま討死！　弟の昌輝も続いたと！', news: '南の徳川殿の柵に、山県昌景の赤備えが取り付いたとのこと！' },
    { name: '土屋昌続', fac: 'takeda', z: 34, cav: 10, ash: 24, line: '二の波！　土屋の旗じゃ！', hist: '土屋昌続、討死',
      fall: '土屋昌続、柵に取り付いたところを撃たれて討死！', news: '山県昌景、徳川殿の柵の前で討死！　内藤昌豊の隊が代わって寄せておるそうな' },
    { name: '馬場信春', fac: 'takeda', z: -6, cav: 12, ash: 24, line: '三の波！　馬場の騎馬、正面から！', hist: '馬場信春、殿に残る', sub: '武田の退き口',
      fall: '馬場信春、殿（しんがり）となって退いていく！', news: '内藤昌豊も討たれたと！　武田の寄せはこれが最後じゃ' },
  ],
  wave(rt) {
    const F = rt.flags;
    const W0 = F.oda ? this.WAVES_ODA : this.WAVES;
    const w = W0[F.wave];
    if (!w) return;
    F.wave++;
    F.waveAt = rt.t;
    const g = enemyGroup(rt, { faction: w.fac, name: w.name + '隊', anchor: { x: 98, z: w.z }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 10, width: 20, morale: 100, speed: 3 },
      [{ type: 'busho', n: 1, o: { name: w.name, horse: true } }, { type: 'cavalry', n: w.cav }, { type: 'ashigaru', n: w.ash }]);
    g.def = w;
    F.cur = g;
    // 寄せの後ろから、武田の鉄砲と弓の組が川の手前まで出て、柵の内へ撃ちかける（騎馬の突っ込みを援ける）。
    //   柵に取り付かず、寄せの隊が崩れれば一緒に退く
    const mis = enemyGroup(rt, { faction: w.fac, name: w.name + '隊の鉄砲・弓', anchor: { x: 112, z: w.z + 14 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 6, width: 14, morale: 85, speed: 2.6 },
      [{ type: 'samurai', n: 1 }, { type: 'gun', n: 5 }, { type: 'bow', n: 7 }]);
    for (const u of mis.units) if (u.type === 'gun' || u.type === 'bow') u.dmg *= 0.5;
    mis.order = 'move'; mis.dest = { x: SB.x0 + 40, z: w.z + 14 };
    mis.onArrive = (q) => { q.order = 'hold'; q.anchor = { ...q.dest }; q.facing = -Math.PI / 2; };
    F.curMis = mis;
    // 丘の隊も一つ寄せに押し出し、遠くの隊も二つ、同時に柵へ駆け出す
    const hq = F.hill[(F.wave * 2) % F.hill.length];
    if (hq && !hq.army.rout) hq.advance(14, 9);
    for (const fc of F.far.filter((q) => !q.v).slice(0, 2)) {
      fc.v = 1; fc.m.visible = true;
      const dist = 125 - (SB.x0 + 62);
      fc.m.advance(dist, dist / 7, { charge: true });
      fc.hitAt = rt.t + dist / 7;
    }
    // 柵の他の所へも、武田の大軍（軽い作り）が押し寄せて柵に取り付き、槍を叩き合う（world.addClash）。受ける柵の内は本物の兵なので描かない
    // 柵の前で撃たれて倒れた者は、その場に残る。この波の名のある隊が崩れたら、一緒に崩れて退く
    // どの波でも柵の北と南の両方へ、正面いっぱいに押し寄せる（本物の兵の受ける真ん中の外すべて）
    F.clashW = [[F.wave === 2 ? 68 : 64, 56], [F.wave === 2 ? -70 : -66, 56]].map(([z, cw], i) => {
      const fac = i || F.wave !== 1 ? 'takeda' : 'akazonae';
      const c = clash(rt, { x: SB.x0 + 1.5, z, facing: Math.PI / 2, w: cw, gap: 3, gap0: 64, closeSpeed: 4, seed: 190 + F.wave * 3 + i, noRout: true, noWake: true, surge: { k: 'B', every: 75, first: 50, count: 120, flank: 0 }, killRate: 0.2, maxDrift: 1.5,
        A: { hidden: true, flag: 'tokugawa', count: cw * 4 }, B: { flag: fac === 'takeda' && i ? 'furin' : fac, armor: nagashinojo.kit.ARMOR[fac], count: Math.round(cw * 11) } });
      c.push('A', 0.3);
      rt.after(2 + i * 3, () => c.go());
      return c;
    });
    // 名のある寄せ手の後ろに、同じ旗の騎馬と足軽が続く（寄せの厚み）
    nagashinojo.kit.backOf(rt, g, { flag: w.fac, armor: nagashinojo.kit.ARMOR[w.fac], kind: 'cavalry', w: 22, depth: 14, count: 110, gap: 4, seed: 71 + F.wave, stop: () => g.center().x < SB.x0 + 75 });
    sfx('taiko', 1);
    rt.banner(`武田の寄せ　${['一', '二', '三'][F.wave - 1]}の波`, `${w.name}の隊`);
    rt.say('足軽', w.line, 3);
    if (w.news) rt.after(14, () => rt.say('伝令', w.news, 4));
    // 朝から昼過ぎまで続いた戦：三の波のころには日が高く傾き始める
    if (F.wave === 3) rt.world.setTime('after');
    rt.marker('wave', centerOf(g), () => `${w.name}・${moraleWord(g.morale)}`, { red: true, group: g });
    // 丘を下り、川を越えて一気に柵へ（戦国大名の「七秒・十四秒」）
    g.order = 'move'; g.dest = { x: SB.x0 + 8, z: w.z };
    g.onArrive = (gg) => { gg.order = 'assault'; gg.seekRange = 14; gg.aggro = 14; };
    g.assault = (u) => {
      // 柵のどこかに取り付く。口が空いていれば入り込もうとする
      if (!u.segTarget || !u.segTarget.alive) {
        let best = null, bd = Infinity;
        for (const s of F.fence) {
          if (!s.alive || s.row !== 0) continue;
          const d = Math.abs((s.seg[1] + s.seg[3]) / 2 - u.pos.z) + Math.random() * 10;
          if (d < bd) { bd = d; best = s; }
        }
        u.segTarget = best;
      }
      return u.segTarget || { x: SB.x0 - SB.gap * 2 - 6, z: u.pos.z };
    };
    rt.objProgress('hold', '');
    rt.obj('hold', `${rt.G.lord ? '馬防柵で武田を迎え撃ち、勝頼を退かせよ' : '馬防柵を守り抜け'}（武田の寄せ ${F.wave - 1}/3）`, 'main');
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    // 遠くの寄せ：丘を下って柵へ駆け、四十間（七十m）ほどで撃ち崩されて散る
    for (const fc of F.far || []) {
      if (fc.v !== 1 || rt.t < fc.hitAt) continue;
      fc.v = 2;
      for (let i = 0; i < 6; i++) rt.army.smoke(SB.x0 - 1, rt.world.heightAt(SB.x0, fc.z) + 1.4, fc.z + (i - 2.5) * 5, 1, 0);
      rt.army.play('gun', { x: SB.x0, z: fc.z }, 1.2);
      fc.m.rout({ hideAfter: 45 });
      for (let i = 0; i < 4; i++) rt.world.addCarrion(SB.x0 + 60 + Math.random() * 10, fc.z + (Math.random() - 0.5) * 16);
    }
    nagashinojo.kit.backTick(rt);
    // 寄せの隊が崩れたか尽きたら、後ろの鉄砲・弓の組も退く
    if (F.curMis && F.cur && (F.cur.routed || F.cur.count === 0) && !F.curMis.routed && F.curMis.count) { F.curMis.noRout = false; F.curMis.morale = 0; }
    // 一斉射撃：寄せ手が柵から四十間ほどに入ったら「放て」。込め直しの間は待ち、揃ったらまた放つ
    const g = F.cur;
    if (g && !g.routed && g.count > 0 && !F.pursuit) {
      let nearX = Infinity;
      for (const u of g.units) if (u.alive) nearX = Math.min(nearX, u.pos.x);
      const dist = nearX - SB.x0;
      if (dist < 70 && !F.waitSaid) { F.waitSaid = true; rt.say((rt.flags.boss || '大久保忠世'), 'まだじゃ……まだ撃つな。引きつけよ', 2.5); }
      F.volT = (F.volT ?? 99) + dt;
      if (dist < 40 && F.volT > 7.5) {
        F.volT = 0; F.volleys = (F.volleys || 0) + 1;
        for (const gg of F.guns) gg.holdFire = false;
        if (F.volleys <= 2 || F.volleys % 4 === 0) rt.say((rt.flags.boss || '大久保忠世'), F.volleys === 1 ? '放てぇっ！' : '次の組、放て！', 1.5);
        rt.after(1.6, () => { for (const gg of F.guns) gg.holdFire = true; });
      }
    }
    // 波が崩れたら、次の波
    if (g && !F.pursuit && (g.routed || g.count === 0) && !g.doneWave) {
      g.doneWave = true;
      rt.unmark('wave');
      for (const c of F.clashW || []) rt.after(1 + Math.random() * 3, () => c.rout('B', { hideAfter: 40, minFight: 40 }));
      rt.obj('hold', `${rt.G.lord ? '馬防柵で武田を迎え撃ち、勝頼を退かせよ' : '馬防柵を守り抜け'}（武田の寄せ ${F.wave}/3）`, 'main');
      // 率いた宿将が崩れの中でまだ生きていれば、史実のとおりこの寄せで討死する（知らせで伝える）
      const gen = g.units.find((u) => u.type === 'busho');
      if (gen && gen.alive) rt.after(2.5, () => {
        if (!gen.alive) return;
        if (!g.fallSaid) { g.fallSaid = true; rt.banner(g.def.hist, g.def.sub || '宿将の討死'); rt.say('伝令', g.def.fall, 4); }
        gen.invuln = false;
        rt.army.kill(gen, null);
      });
      rt.award((t) => t.side.push(`${g.def.name}隊を退けた`), `${g.def.name}隊を退けた`);
      if (F.wave < (F.oda ? this.WAVES_ODA : this.WAVES).length) {
        rt.say((rt.flags.boss || '大久保忠世'), 'よう持ちこたえた！　次が来るぞ、槍を立てよ', 3);
        // 一の波の後：判断（破れかけた隣の柵を助けに行くか、持ち場を固めるか）。二の波の後：柵の外の討ち漏らしを片付けるか
        if (F.wave === 1 && !rt.G.lord) this.choiceGap(rt);
        else if (F.wave === 2 && !rt.G.lord) this.choiceSortie(rt);
        else rt.after(14, () => this.wave(rt));
      } else this.decide(rt);
    }
    // 判断の後の成り行き
    if (F.gapPt && !F.gapDone) {
      if (Math.hypot(p.x - F.gapPt.x, p.z - F.gapPt.z) < 6) {
        F.gapDone = true; rt.unmark('gap'); rt.unzone('gap'); rt.objDone('gap');
        for (const sg of F.fence) if (!sg.alive && Math.abs((sg.seg[1] + sg.seg[3]) / 2 - F.gapPt.z) < 30) { sg.alive = true; sg.hp = sg.maxHp; if (sg.mesh) sg.mesh.visible = true; }
        for (const sg of F.fence) if (Math.abs((sg.seg[1] + sg.seg[3]) / 2 - F.gapPt.z) < 30) { sg.maxHp *= 1.3; sg.hp = sg.maxHp; }
        rt.award((t) => t.side.push('北の柵を結い直した'), '北の柵を結い直した');
      } else if (rt.t - F.gapT > 30) { F.gapDone = true; rt.unmark('gap'); rt.unzone('gap'); rt.objFail('gap'); }
    }
    if (F.lurk && !F.lurkDone && (gone(F.lurk) || (F.wave >= 3 && F.cur && (F.cur.routed || !F.cur.count)))) {
      F.lurkDone = true; rt.unmark('lurk');
      if (gone(F.lurk)) { if (F.lurkOut) { rt.objDone('lurk'); rt.award((t) => t.side.push('柵の前の討ち漏らしを片付けた'), '柵の前を片付けた'); } }
      else { F.lurk.noRout = false; F.lurk.morale = 0; if (F.lurkOut) rt.objFail('lurk'); }
    }
    // 柵の外へ出たか（打って出る下知の間は咎めない）
    if (!F.pursuit && p.x > SH_FRONT && !rt.G.lord && !(F.lurkOut && !F.lurkDone) && !depthOn(rt)) {
      F.outT = (F.outT || 0) + dt;
      if (F.outT > 3 && !F.outWarned) {
        F.outWarned = true;
        rt.violation('下知なく柵の外へ出た', [(rt.flags.boss || '大久保忠世'), '戻れ！　柵の外へ出るなと申したはずじゃ！']);
        rt.objFail('stay');
      }
    } else if (!F.pursuit) F.outT = 0;
    // 追い討ち：殿の馬場信春の隊を崩せば勝ち
    depthTick(rt, dt);
    if (F.pursuit && !F.ending && !F.dpB) {
      const R = F.rear;
      if ((R && (R.routed || R.count === 0)) || rt.t - F.pursuit > 170) {
        F.dpB = true;
        if (R && (R.routed || R.count === 0)) {
          rt.objDone('pursue');
          rt.award((t) => { t.special = { label: '追い討ち', pts: 25 }; }, '殿を崩した');
        } else { rt.objFail('pursue'); if (R) { R.noRout = false; R.morale = 0; } }
        const end = () => {
          F.ending = true;
          rt.banner('武田勢、総崩れ', '設楽原の戦、終わる');
          for (const h of [...F.hill, F.katsuyori]) h.rout({ hideAfter: 60 });
          rt.say((rt.flags.boss || '大久保忠世'), '勝ったぞ！　武田の騎馬を、柵と鉄砲で破ったのじゃ', 4);
          sfx('horagai', 0.8);
          rt.finish({}, 10);
        };
        // 馬場隊を崩した後も段を重ねる（川べりの旗本→旗か味方か→退き口の橋）
        if (rt.G.lord) end(); else depthStart(rt, shiCtx(rt), shiB(rt), end);
      }
    }
  },

  // 判断①：北隣の柵が破れかけている。組を回して塞ぐか、持ち場を固めるか
  choiceGap(rt) {
    const F = rt.flags;
    // 保険：選びが何かで失われても、60 秒で次の波
    rt.after(60, () => { if (F.wave === 1 && !F.pursuit) this.wave(rt); });
    rt.say('伝令', '北の柵、二か所が破れかけておる！　手が足りぬ！', 3);
    rt.choose('北の柵が破れかけている。どうする？', [
      { label: '組を連れて北の柵へ回り、破れ目を塞ぐ', note: '柵を結い直す（二の波の柵が固くなる）。持ち場の前は手薄になる' },
      { label: '持ち場に残り、槍を揃えて次を待つ', note: '持ち場の前は固い。北の柵は破られたまま次の波を迎える' },
    ], (i) => {
      if (i === 0) {
        const pt = { x: SB.x0 - 3, z: -40 };
        F.gapPt = pt; F.gapT = rt.t;
        rt.obj('gap', '北の柵の破れ目へ回り、結い直せ', 'side');
        rt.marker('gap', pt, '北の柵の破れ目', { h: 2.5 }); rt.zone('gap', pt.x, pt.z, 6);
        const sg = (rt.squadGroups || []).find((g) => g.count); if (sg) { sg.order = 'follow'; }
      } else rt.say((rt.flags.boss || '前田利家'), '持ち場を離れぬか。……よし、ここで受ける', 3);
      rt.after(i === 0 ? 30 : 14, () => this.wave(rt));
    }, 16);
  },
  // 判断②：柵の前に討ち漏らした武田の者が倒れた馬の陰に潜み、柵を撃つ。虎口から出て片付けるか、柵の内から撃ち合うか
  choiceSortie(rt) {
    const F = rt.flags;
    rt.after(70, () => { if (F.wave === 2 && !F.pursuit) this.wave(rt); });
    F.lurk = enemyGroup(rt, { faction: 'takeda', name: '馬の陰の鉄砲', anchor: { x: SB.x0 + 16, z: 8 }, facing: -Math.PI / 2, order: 'hold', aggro: 40, width: 8, morale: 80, fleeDir: { x: 1, z: 0 } }, [{ type: 'samurai', n: 1 }, { type: 'gun', n: 5 }, { type: 'ashigaru', n: 4 }]);
    rt.say('足軽', '柵の前、倒れた馬の陰から撃ってくる！', 3);
    rt.choose('柵の前の討ち漏らしが柵を撃ってくる。どうする？', [
      { label: '虎口から打って出て片付ける（下知を仰いで）', note: '三の波の前に片付ければ、柵の前がすっきりする。出た所を狙われる' },
      { label: '柵の内から弓・鉄砲で撃ち合う', note: '柵の外へは出ない。三の波と一緒に撃たれ続ける' },
    ], (i) => {
      if (i === 0) {
        F.lurkOut = true;
        rt.say((rt.flags.boss || '前田利家'), 'よし、虎口から出よ。片付けたらすぐ戻れ！', 3);
        rt.obj('lurk', '虎口から出て、馬の陰の武田勢を片付けよ（すぐ戻れ）', 'side');
      } else { F.lurk.order = 'hold'; rt.say((rt.flags.boss || '前田利家'), '撃ち返せ！　頭を上げるな', 3); }
      rt.marker('lurk', centerOf(F.lurk), () => `馬の陰の鉄砲・${moraleWord(F.lurk.morale)}`, { red: true, group: F.lurk });
      rt.after(i === 0 ? 40 : 14, () => this.wave(rt));
    }, 16);
  },

  decide(rt) {
    const F = rt.flags;
    rt.objDone('hold');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '馬防柵を守り抜いた');
    if (!F.outWarned && !rt.G.lord) rt.objDone('stay');
    rt.objRemove('stay');
    if (F.broken <= 3) { rt.objDone('fence'); rt.award((t) => t.side.push('柵を守った'), '一列目の柵を守った'); }
    rt.banner('勝頼の決断', '武田勢、退き始める');
    // 丘の上の武田の隊と勝頼の本陣が、背を向けて東へ退いていく
    F.katsuyori.retreat(60, 40);
    F.hill.forEach((h, i) => { if (!h.army.rout) rt.after(i * 1.5, () => h.retreat(50, 36)); });
    rt.say('伝令', '武田勝頼、退き陣！　馬場美濃守が殿に残っておりまする！', 4);
    // 追い討ちの前に段を重ねる（立て直し→柵の南の端を回る武田勢→どこから打って出るか）
    const go = (fn) => (rt.G.lord ? rt.after(5, fn) : rt.after(3, () => depthStart(rt, shiCtx(rt), shiA(rt), fn)));
    go(() => {
      F.pursuit = rt.t;
      sfx('horagai', 1);
      rt.say((rt.flags.boss || '大久保忠世'), '柵を出よ！　追い討ちじゃ！　虎口から打って出よ！', 4);
      rt.obj('pursue', '柵を出て、殿の馬場信春の隊を崩せ', 'main');
      for (const gg of F.guns) gg.holdFire = false;
      for (const sp of F.spears) { sp.order = 'attack'; sp.seekRange = 70; sp.formation = 'line'; }
      // 柵の内に残る鉄砲組と、南北の槍組は任務に数えない：遊び手が武田の本隊へ踏み込んだ時、遠くの者から外して、
      // 本隊の中の軽い兵を本物の兵に替える枠に回す（本隊の真ん中が空き地にならないように）
      nagashinojo.kit.markRecyclable(...F.guns, ...F.spears.slice(1));
      const R = enemyGroup(rt, { faction: 'takeda', name: '馬場隊', anchor: { x: 78, z: 10 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0.2 }, aggro: 12, width: 18, morale: 90 },
        [{ type: 'busho', n: 1, o: { name: '馬場信春', horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }]);
      F.rear = R;
      // 南の端から回った時は、馬場隊の横腹を突く（大きく揺らぐ）
      if ((F.dpMem || {}).shiSide) rt.after(18, () => { if (!R.count || R.routed) return; R.morale -= 35; rt.banner('横腹を突いた', '馬場隊が大きく揺らぐ'); rt.award((t) => t.c.flank++, '馬場隊の横腹を突いた'); });
      nagashinojo.kit.backOf(rt, R, { flag: 'takeda', armor: nagashinojo.kit.ARMOR.takeda, kind: 'spear', w: 18, depth: 10, count: 120, seed: 79 });
      rt.marker('rear', centerOf(R), () => `殿・馬場信春・${moraleWord(R.morale)}`, { red: true, group: R });
    });
  },

  onRout(rt, g) {
    if (g === rt.flags.rear) { rt.unmark('rear'); rt.say('足軽', '殿が崩れたぞ！', 2.5); }
  },
  onKill(rt, v, k) {
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1; else rt.flags.ak = (rt.flags.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (v.type === 'busho' && v.group && v.group.def && !v.group.def.fallSaid) {
      v.group.def.fallSaid = true;
      if (!(k && k.isPlayer)) rt.banner(v.group.def.hist, '宿将の討死');
      rt.say('足軽', `敵将 ${v.group.def.name}、討ち取ったりぃ！`, 3);
      v.group.morale -= 30;
    }
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s.row === 0) {
      F.broken++;
      if (F.broken === 4) rt.objFail('fence');
    }
    s.stumps = stumps(rt.world, s.seg);
    rt.scene.add(s.stumps);
    rt.say((rt.flags.boss || '大久保忠世'), '柵が破られた！　破れ目を槍で塞げ！', 3);
    sfx('wood', 1);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if ((F.hitWarn || -99) + 12 > rt.t) return;
    F.hitWarn = rt.t;
    const z = (s.seg[1] + s.seg[3]) / 2;
    rt.bark(`${z < -30 ? '北' : z > 30 ? '南' : '正面'}の柵に取り付かれている！`, true);
  },
};
// 両軍の総勢（織田・徳川 三万八千、武田 一万五千）。討たれた兵一人を、遠くの大勢の損害に見立てる
shitaragahara.force = (rt) => {
  const F = rt.flags;
  const b = 15000 - (F.ek || 0) * 95 - (F.ending ? 1500 : 0);
  return { a: 38000 - (F.ak || 0) * 40, a0: 38000, b, b0: 15000 };
};
shitaragahara.canSkip = (rt) => (rt.phase === 'brief' && rt.flags.wave === 0 && rt.t > 3 ? '武田の寄せまで待つ' : '');
shitaragahara.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
// 織田家編では、味方の紋を織田の木瓜に
shitaragahara.sides = { a: { name: '織田・徳川軍', get mon() { return scenarioKey() === 'oda' ? 'oda' : 'tokugawa'; } }, b: { name: '武田軍', mon: 'takeda' } };
shitaragahara.history = '天正三年五月二十一日、織田・徳川の連合軍（織田三万・徳川八千ほど）は設楽原に馬防柵を結い、多くの鉄砲を並べて武田勝頼の軍を迎え撃った。『信長公記』は鉄砲を「千挺ばかり」と記し、画面の鉄砲組はその一部にあたる。山県昌景・内藤昌豊・真田信綱・馬場信春ら武田の宿将の多くが討ち死にした。「三千挺の三段撃ち」の話は後の軍記に出るもので、数や撃ち方には諸説がある。';
shitaragahara.date = (rt) => `天正三年五月二十一日　${seasonOf('五月')}・${sky(rt)}`;

// ---- 設楽原 ----
function shiCtx(rt) {
  const F = rt.flags;
  return { faction: 'takeda', dmg: 0.6, friends: () => [], aid: { name: F.oda ? '佐々の槍組' : '大久保の槍組', faction: F.oda ? 'oda' : 'tokugawa', flag: F.oda ? 'oda' : 'tokugawa', list: [uS(1), uA(9)] }, aidSaid: '槍組が一手、加わった' };
}
// 三の波の後、追い討ちの前：立て直し → 柵の南の端を回る武田勢 → 判断（どこから打って出るか）
function shiA(rt) {
  const B = rt.flags.boss || '大久保忠世';
  return [
    DP.rest({ dur: 12, say: [[B, '弾を込め直せ。柵の破れ目を結え。手負いは後ろへ'], ['足軽', '見よ、武田の本陣が動いておる……！'], [B, 'まだじゃ。退くと見せて、南の端を回る者がおるやもしれぬ']] }),
    DP.hold({ at: { x: 2, z: 104 }, dur: 115, r: 12, title: '南の端を回る武田勢', sub: '柵の切れた南の端から、武田の一隊が回り込む', label: '柵の南の端', obj: '柵の南の端へ回り、回り込む武田勢を止めよ',
      say: [[B, '南の端じゃ！　柵の切れ目を回らせるな！']],
      waves: [
        { t: 6, say: ['足軽', '南から騎馬じゃ！'], foes: () => [{ name: '南を回る武田の騎馬', from: { x: 64, z: 140 }, list: [uC(3), uA(7)] }] },
        { t: 40, say: ['足軽', '後ろに足軽が続いておる！'], foes: () => [{ name: '南を回る武田の足軽', from: { x: 74, z: 124 }, list: [uS(1), uA(9)] }] },
        { t: 80, say: ['足軽', 'まだ来る！　旗が一面じゃ！'], foes: () => [{ name: '武田の騎馬の残り', from: { x: 60, z: 150 }, list: [uC(3), uA(8)], mass: 220 }] },
      ],
      reward: '柵の南の端を守った' }),
    DP.rest({ dur: 10, bark: '立て直し：組を集め直し、柵の内を北へ走る', say: [['伝令', '北の端にも武田勢！　柵の切れ目を回り込むつもりじゃ！'], [B, '走れ！　南の次は北じゃ。北の端を抜かれたら、柵の内が裏から崩れる']] }),
    DP.hold({ at: { x: 2, z: -104 }, dur: 110, r: 12, title: '北の端を回る武田勢', sub: '柵の切れた北の端から、武田の大軍が回り込む', label: '柵の北の端', obj: '柵の北の端へ走り、回り込む武田の大軍を止めよ',
      waves: [
        { t: 5, say: ['足軽', '北から一面じゃ！　騎馬が先じゃ！'], foes: () => [{ name: '北を回る武田の騎馬', faction: 'akazonae', from: { x: 64, z: -140 }, list: [uC(4), uA(8)], mass: 240 }] },
        { t: 55, say: [B, '足軽が続くぞ！　槍衾を崩すな！'], foes: () => [{ name: '北を回る武田の足軽', from: { x: 72, z: -124 }, list: [uS(2), uA(10), uG(2)], mass: 220 }] },
      ],
      reward: '柵の北の端を守った' }),
    DP.pick({ title: '勝頼が退き始めた。追い討ちに、どこから打って出る？',
      options: [{ label: '中央の虎口から、殿の馬場隊へまっすぐ', note: '一番に馬場隊へ当たれる。正面は固い' }, { label: '南の端から回り、馬場隊の横腹を突く', note: '馬場隊が大きく揺らぐ。着くのは遅れる' }],
      on: (rt, m, i) => { m.shiSide = i === 1; } }),
  ];
}
// 馬場隊を崩した後：立て直し → 川べりの旗本 → 判断（旗か、囲まれた味方か）→ 判断（退き口の旗本を追うか、引き上げるか）
function shiB(rt) {
  const F = rt.flags, B = F.boss || '大久保忠世';
  const pal = F.oda ? '徳川' : '織田';
  return [
    DP.rest({ dur: 12, say: [[B, '馬場美濃は崩れた。……まだ川向こうに武田の旗が残っておる'], ['足軽', '鉄砲組も柵を出たぞ！　丘の麓まで押し出すと！']] }),
    DP.fight({ at: { x: 70, z: -30 }, title: '川べりの旗本', sub: '連吾川の向こうで、武田の旗本が踏みとどまる', obj: '連吾川の向こうで踏みとどまる武田の旗本を崩せ',
      foes: () => [{ name: '武田の旗本の残り', from: { x: 102, z: -40 }, list: [uS(3), uA(10), uG(2)], noRout: 20 }],
      later: [{ t: 34, title: '横槍', sub: '赤備えの残りが北から', say: ['足軽', '赤い具足じゃ！　赤備えの残りが来る！'], foes: () => [{ name: '赤備えの残り', faction: 'akazonae', from: { x: 100, z: -86 }, list: [uC(3), uA(5)] }] }],
      reward: '川べりの旗本を崩した' }),
    DP.rest({ dur: 10, bark: '立て直し：組を集め直す', say: [[B, '手負いは柵へ戻せ。……丘の麓に、武田の鉄砲が陣を敷き直しておる'], ['足軽', '麓一面、武田の旗じゃ……まだあれほど残っておったか']] }),
    DP.fight({ at: { x: 96, z: 16 }, title: '丘の麓の激突', sub: '退く勝頼を守るため、武田の大軍が丘の麓で向き直る', obj: '丘の麓で向き直った武田の大軍を押し崩せ',
      say: [[B, '味方の槍組と並べ！　押せ、押せ！　麓から追い落とせ！']],
      foes: () => [{ name: '丘の麓の武田勢', from: { x: 126, z: 20 }, list: [uS(3), uA(12), uG(4)], mass: 260, noRout: 25 }],
      later: [{ t: 40, title: '横槍', sub: '北の丘から武田の騎馬', say: ['足軽', '北から騎馬じゃ！　槍を立てよ！'], foes: () => [{ name: '北の丘の騎馬', from: { x: 118, z: -40 }, list: [uC(4), uA(6)], mass: 180 }] },
        { t: 80, title: '新手', sub: '南の丘からも武田勢', say: [B, '南からも来るぞ！　踏みとどまれ！'], foes: () => [{ name: '南の丘の武田勢', from: { x: 120, z: 60 }, list: [uS(2), uA(10)], mass: 200 }] }],
      reward: '丘の麓の武田勢を押し崩した' }),
    DP.rest({ dur: 10, bark: '立て直し：弾を込め、槍を揃え直す', say: [['伝令', `丘の上、勝頼の本陣の跡に武田の旗が残っておりまする！　南では${pal}の組が囲まれておると！`]] }),
    DP.pick({ title: `丘の上に武田の旗が残り、南では${pal}の組が囲まれている。どうする？`,
      options: [{ label: '丘へ駆け上がり、武田の旗を奪う', note: '旗を奪えば大手柄。丘の上は鉄砲に狙われる' }, { label: `南へ回り、囲まれた${pal}の組を助ける`, note: `${pal}との仲の手柄。味方が一組救われる` }],
      on: (rt, m, i) => { m.shiFlag = i === 0; } }),
    DP.fight({ skip: (rt, m) => !m.shiFlag, at: { x: 128, z: -14 }, title: '本陣の跡', sub: '勝頼の本陣の跡で、旗を守る武田勢', obj: '勝頼の本陣の跡で、旗を守る武田勢を崩せ',
      foes: () => [{ name: '旗を守る武田勢', from: { x: 150, z: -16 }, list: [uS(2), uA(8), uG(3)], noRout: 25 }],
      later: [{ t: 30, say: ['足軽', '旗奉行じゃ！　あの旗を奪え！'], foes: () => [{ name: '武田の旗奉行', from: { x: 156, z: 10 }, list: [uS(2, { name: '武田の旗奉行', flag: 'takeda', flagScale: 1.8 }), uA(4)] }] }],
      reward: (t) => { t.c.flag++; t.special = { label: '武田の旗を奪った', pts: 25 }; }, rewardLabel: '武田の旗を奪った' }),
    DP.fight({ skip: (rt, m) => m.shiFlag, at: { x: 80, z: 72 }, title: `囲まれた${pal}の組`, sub: '南の田で、味方の一組が武田勢に囲まれている', obj: `囲まれた${pal}の組を救え`,
      foes: () => [{ name: '囲む武田勢', from: { x: 112, z: 92 }, list: [uS(2), uA(11)] }],
      reward: `囲まれた${pal}の組を救った` }),
    DP.rest({ dur: 10, say: [['伝令', '勝頼は甲斐へ落ちていく！　退き口の橋で、勝頼の旗本が踏みとどまっておりまする'], [B, '下知は「深追いするな」じゃ。……だが橋の旗本だけは、崩せば大きいぞ']] }),
    DP.pick({ title: '退き口の橋で、勝頼の旗本が踏みとどまっている。どうする？',
      options: [{ label: '許しを得て、橋の旗本を崩しに行く', note: '崩せば大手柄。武田の最後の手強い者たち' }, { label: '下知に従い、組を引き上げる', note: '戦はここで終える。組を減らさない' }],
      on: (rt, m, i) => { m.shiBridge = i === 0; if (i === 1) rt.award((t) => t.side.push('深追いせず下知を守った'), '深追いせず下知を守った'); } }),
    DP.fight({ skip: (rt, m) => !m.shiBridge, at: { x: 124, z: 34 }, title: '退き口の橋', sub: '勝頼を逃がすため、旗本が橋の前で踏みとどまる', obj: '退き口の橋で踏みとどまる勝頼の旗本を崩せ',
      foes: () => [{ name: '勝頼の旗本', from: { x: 150, z: 44 }, list: [uS(3), uC(3), uA(8)], morale: 100, noRout: 30 }],
      later: [{ t: 40, say: ['足軽', '橋の向こうから、まだ来るぞ！'], foes: () => [{ name: '引き返す武田勢', from: { x: 156, z: 70 }, list: [uS(1), uA(7)] }] }],
      reward: (t) => { t.special = { label: '退き口の旗本を崩した', pts: 25 }; }, rewardLabel: '退き口の旗本を崩した' }),
  ];
}

export { shitaragahara };
