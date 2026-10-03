import { HISTORICAL_GENERALS } from './b_historical_generals.js';
// 設楽原：柵間へ引きつけ、集中射撃の後に一隊を率いて受け止める
import { gauss, allyGroup, nm, enemyGroup, centerOf, guardRecover, hpBarSystem, strengthBanner } from './bhelp.js';
import { buildBobosaku } from './b_sunomata.js';
import { scenarioKey, RANKS } from './state.js';
import { nagashinojo } from './b_nagashinojo.js';
import { nobori, tawara, stumps } from './props.js';
import { clash } from './b_sekigahara.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { seasonOf, sky } from './b_shared.js';
import * as DP from './b_depth.js';
import { depthOn, depthTick, depthStart } from './b_depth.js';
import { camp } from './b_mid.js';
import { demBlend } from './dem.js';
import { doruiLine } from './castle_parts.js';
let DEM = null;
import('./asset_dem_shitaragahara.js').then((m) => { DEM = m.default; }).catch(() => {});
import { tagZones, gapSize, zoneHp, worstZone, assignBands, ceaseBands, losTick, reserveTick } from './yasen_jinchi.js';

// 国土地理院の標高（設楽原古戦場）を手書きの地形に混ぜる。野戦は手書きの尺が実測より広いので xyScale で縮める
const DEM_SCALE = 0.22;
// 防御区画（長篠・設楽原 統合版 5〜10 章）：南北に五つ。既存の鉄砲組・槍組・寄せの z はこの帯に収まる
const ZONES = [
  { name: '左翼', z0: -96, z1: -58 },
  { name: '中央左', z0: -58, z1: -18 },
  { name: '中央', z0: -18, z1: 18 },
  { name: '中央右', z0: 18, z1: 58 },
  { name: '右翼', z0: 58, z1: 96 },
];
const zoneOfZ = (z) => (ZONES.find((zz) => z >= zz.z0 && z < zz.z1) || ZONES[2]).name;
// ======================================================================
// 長篠編　設楽原の決戦（天正三年五月二十一日）
// 連吾川を挟んだ南北に長い原。織田・徳川は川の西に馬防柵を結い（画面では三重に復元）、鉄砲をその内に並べた。
// 東の丘から武田の騎馬と足軽が寄せる。自分は組を率い、鉄砲の後に槍で受ける
// ======================================================================
const SB = { x0: 14, gap: 7, z0: -96, z1: 96, gates: [-42, 18, 66] };   // 馬防柵：一列目の x、列の間、南北の端、虎口
const RENGO = [[22, -176], [18, -90], [24, -20], [20, 50], [24, 120], [22, 176]];   // 連吾川：一列目の柵のすぐ東
const CHAUSU = { x: -220, z: -70 };   // 茶臼山：柵から約一キロを縮めた、北寄りの後方の丘
const SH_FRONT = SB.x0 + 2;   // これより東へ出たら「柵の外」

const shitaragahara = {
  spawn: { x: 10, z: 4, heading: Math.PI / 2 },
  world: {
    seed: 57,
    mood: 'morning',
    muddy: 0.25,
    mist: true,
    wetStart: 0.55,      // 前の雨で湿った地面。朝の戦の間は雨を降らせない
    time: 'day',
    waterSlow: true,   // 連吾川・水田で騎馬の加速が落ちる（terrain_tags.js の 'water' タグ。長篠・設楽原 統合版 3〜4 章）
    paths: [[[-176, 10], [-80, 8], [-20, 18], [SB.x0 - 2 * SB.gap - 4, SB.gates[1]]]],
    height(x, z) {
      let h = 0.8 * Math.sin(x * 0.035) * Math.cos(z * 0.028) + 0.5 * Math.sin(z * 0.06 + x * 0.02);
      // 西：弾正山（家康の陣）と茶臼山（信長の陣）。東：川に近い武田の陣の丘
      h += 7 * gauss(x, z, -85, 12, 2400) + 9 * gauss(x, z, CHAUSU.x, CHAUSU.z, 3600);
      h += Math.max(0, x - 40) * 0.09 + 5 * gauss(x, z, 80, -40, 3600) + 4 * gauss(x, z, 70, 80, 3000);
      // 柵の前の浅い空堀と、柵の後ろの土盛り
      const fx = SB.x0 + 2.6;
      h -= 0.9 * Math.exp(-((x - fx) ** 2) / 1.6) * (Math.abs(z) < SB.z1 ? 1 : 0);
      const bx = SB.x0 - 2 * SB.gap - 3;
      h += 0.75 * Math.exp(-((x - bx) ** 2) / 3) * (Math.abs(z) < SB.z1 ? 1 : 0);
      // 柵・鉄砲の並びは平らな土地が前提なので、DEM は清めた戦場（clear の内）の外の遠景の丘にだけ混ぜる
      if (DEM && (x < -45 || x > 95)) return demBlend(DEM, x, z, h, { scale: DEM_SCALE, floor: h - 3, xyScale: 4 });
      return h;
    },
    tint(x, z, h, c) {
      // 柵の並ぶ所は踏み固められて土が出ている
      if (x > SB.x0 - 2 * SB.gap - 5 && x < SB.x0 + 4 && Math.abs(z) < SB.z1) c.setRGB(c.r * 0.8 + 0.08, c.g * 0.78 + 0.06, c.b * 0.7 + 0.03);
      // 川沿いの湿った田
      if (Math.abs(x - 21) < 14) c.setRGB(c.r * 0.85, c.g * 0.9, c.b * 0.8);
    },
    clear: (x, z) => x > -45 && x < 95,
    paddy(x, z) {
      if (x < 28 || x > 58) return 0;
      if ((Math.floor(x / 11) + Math.floor(z / 16)) % 2) return 0;
      const ex = Math.min(((x % 11) + 11) % 11, 11 - ((x % 11) + 11) % 11), ez = Math.min(((z % 16) + 16) % 16, 16 - ((z % 16) + 16) % 16);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6));
    },
    streams: [{ pts: RENGO, w: 2.4, depth: 1.2 }],
    trees: 300,
    tufts: 4200,
    // 武田の陣の丘は木を疎らに（丘に並ぶ武田の備が柵から見えるように）
    treeDensity: (x, z) => (x < -60 || x > 168 ? 1 : x > 60 ? 0.12 : 0.3),
    groves: [{ x: -70, z: -40, r: 14, n: 22 }, { x: 168, z: 20, r: 16, n: 26 }, { x: 150, z: -120, r: 14, n: 20 }],
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.fence = buildBobosaku(rt, { x0: SB.x0, z0: SB.z0, z1: SB.z1, gap: SB.gap, gates: SB.gates, facing: 1 });
    tagZones(F.fence, ZONES);
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { fence: 'HIST_A', tripleFence: 'HIST_B', rengoRiver: 'HIST_A', honjinOda: 'HIST_B', honjinTokugawa: 'HIST_B', takedaWaves: 'GAME_C', fenceTrap: 'GAME_C', dorui: 'HIST_B', orderDelay: 'GAME_C', footFirst: 'GAME_C' };
    // 土塁：三重目の柵のすぐ後ろ（鉄砲兵の後ろ）に、虎口を空けて盛る。柵の前の浅い空堀は地形（height）で掘ってある
    {
      const bx = SB.x0 - 2 * SB.gap - 3, gz = SB.gates;
      const cut = [[SB.z0 + 2, gz[0] - 5], [gz[0] + 5, gz[1] - 5], [gz[1] + 5, gz[2] - 5], [gz[2] + 5, SB.z1 - 2]];
      for (const [za, zb] of cut) doruiLine(rt, [[bx, za], [bx, zb]], { w: 2.4, h: 0.6, name: '土塁' });
    }
    F.broken = 0;
    F.hpBars = hpBarSystem(rt);
    strengthBanner(rt, 38000, 15000);
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
        [...(sassa ? [{ type: 'samurai', n: 1, o: { name: '佐々成政', invuln: true } }] : []), { type: 'gun', n: 8 }]));
    }
    // 班分けは様子の表示に使う。撃ち方は柵間への集中射撃（三段撃ちの断定はしない）
    F.bands = assignBands(F.guns);
    // 槍の組：自分の組（大久保忠世の手）と、南北の組
    const ok = allyGroup(rt, { faction: oda ? 'oda' : 'tokugawa', name: oda ? '前田組' : '大久保組', anchor: { x: SB.x0 - 2 * SB.gap - 1, z: 2 }, facing: Math.PI / 2, width: 16, aggro: 6, noRout: true, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: F.boss, invuln: true, horse: true } }, { type: 'ashigaru', n: 13 }]);
    F.okubo = ok.units[0];
    F.spears = [ok];
    for (const [z, fac] of [[-70, 'oda'], [-38, 'oda'], [36, oda ? 'oda' : 'tokugawa'], [68, 'tokugawa']]) {
      F.spears.push(allyGroup(rt, { faction: fac, name: '槍組', anchor: { x: SB.x0 - 2 * SB.gap - 1, z }, facing: Math.PI / 2, width: 16, aggro: 6, noRout: true, formation: 'yari', order: 'hold' },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 7 }]));
    }
    // 予備隊（長篠・設楽原 統合版 37・45 章）：柵の後ろに控え、いちばん危ない区画へ自動で動く・向き直る（reserveTick が毎コマ判断）
    F.reserve = allyGroup(rt, { faction: oda ? 'oda' : 'tokugawa', name: '予備の槍組', anchor: { x: SB.x0 - 2 * SB.gap - 5, z: 0 }, facing: Math.PI / 2, width: 14, aggro: 8, noRout: true, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }]);
    F.spears.push(F.reserve);
    const n = Math.min(30, Math.max(5, RANKS[rt.G.rank].squad));
    // 設楽原は鉄砲の見せ場：組の中身を城下・出陣前で決めていなければ（makeSquad の側で kumi が優先される）、
    //   既定で三分の一ほどを鉄砲にして持たせる（柵の内で鉄砲隊を率いる役目）
    F.bigGun = n ? Math.max(1, Math.round(n / 3)) : 0;
    if (n) rt.makeSquad({ x: SB.x0 - 4, z: 8 }, Math.PI / 2, F.bigGun ? [{ kind: 'spear', n: n - F.bigGun }, { kind: 'gun', n: F.bigGun, ranks: 2 }] : [{ kind: 'spear', n }]);
    // 柵の内の鉄砲組と南北の槍組は任務に数えない：遊び手が柵を出て武田の大軍へ乗り込んだ時は、
    //   遠くの者（遊び手から 55m・カメラから 50m より先）から外し、大軍の中の軽い兵を本物の兵に替える枠へ回す
    nagashinojo.kit.markRecyclable(...F.guns, ...F.spears.slice(1));

    // 決戦日の本陣：家康は弾正山、信長は極楽寺山から茶臼山へ移った後（陣幕・馬印・旗本も同じ丘へ）
    const KT = nagashinojo.kit, A = KT.ARMOR;
    F.reserveHome = { x: SB.x0 - 2 * SB.gap - 5, z: 0 };
    F.reserveOptions = { x: F.reserveHome.x, home: F.reserveHome, facing: Math.PI / 2 };
    F.camps = [
      camp(rt, { x: -84, z: 12, facing: Math.PI / 2, team: 0, faction: 'tokugawa', mon: 'tokugawa', general: { name: '徳川家康' }, guard: 15, reserve: 240, runTo: { x: SB.x0 - 12, z: 20 } }),
      camp(rt, { x: CHAUSU.x, z: CHAUSU.z, facing: Math.PI / 2, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 15, reserve: 260, runTo: { x: SB.x0 - 12, z: -50 } }),
    ];
    nagashinojo.kit.markRecyclable(...F.camps.map((c) => c.guard));
    for (const [x, z, k, h] of [[-94, 22, 'onri', 6.5], [CHAUSU.x + 10, CHAUSU.z + 10, 'eiraku', 6.5]]) rt.scene.add(nobori(W, x, z, k, h));
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
    // 山県の赤備えは南の徳川勢の正面。細かな間隔と隊数は遊びのための復元。
    F.hill = [[64, -80, 'takeda', 'spear'], [70, -40, 'takeda', 'mixed'], [62, 0, 'takeda', 'cavalry'], [70, 40, 'akazonae', 'cavalry'], [64, 80, 'takeda', 'spear'], [86, 50, 'takeda', 'cavalry']]
      .map(([x, z, f, kind], i) => DA(x, z, kind === 'cavalry' ? 22 : 14, kind === 'cavalry' ? 20 : 28, kind === 'cavalry' ? 200 : 200, -Math.PI / 2, A[f], f, 51 + i, kind));
    F.katsuyori = DA(96, 0, 30, 26, 220, -Math.PI / 2, A.takeda, 'takeda', 57, 'honjin');
    F.katsuyori.army.lord = '武田勝頼';   // 近づけば旗本が本物の兵になって迎え撃ち、勝頼は奥へ下がる（b_nagashinojo.js の wake）
    // 寄せの波ごとに、遠くでも別の隊が柵へ駆けていく（見た目だけ）。四十間ほどで鉄砲に撃ち崩されて散る
    F.far = [];
    for (const [z, f, kind] of [[72, 'akazonae', 'cavalry'], [52, 'akazonae', 'cavalry'], [-80, 'takeda', 'cavalry'], [-58, 'takeda', 'spear'], [-66, 'takeda', 'cavalry'], [60, 'takeda', 'cavalry']]) {
      const m = DA(125, z, kind === 'cavalry' ? 20 : 14, 12, kind === 'cavalry' ? 80 : 90, -Math.PI / 2, A[f], f, 61 + F.far.length, kind);
      m.visible = false;
      F.far.push({ m, z, v: 0 });
    }
    rt.world.setTime('day');
    rt.setPhase('brief');
    F.wave = 0;
    F.prepAt = rt.t;
    F.prepPt = { x: SB.x0 - 2 * SB.gap - 4, z: SB.gates[0] + 2 };
    rt.banner('設楽原、馬防柵の内', '朝霧の向こうに武田の旗。柵を結い、鉄砲と槍を揃える');
    rt.obj('hold', '組を連れて北の虎口の内へ。柵を結い直し、陣地を固めよ', 'main');
    rt.obj('stay', '組へ下知して一隊を率いよ。下知があるまで柵の外へ出るな', 'order');
    rt.obj('fence', '一列目の柵を、三か所より多く破らせるな', 'side');
    rt.marker('prepare', F.prepPt, '柵を結い直す持ち場');
    rt.say(F.boss, `${nm(rt)}、その方に一組を預ける。虎口の内へ連れ、柵を固めよ`, 4.5);
    rt.after(5, () => rt.say('織田信長', '茶臼山から見ておる。柵を出るな。敵を引きつけ、鉄砲を寄せて撃て', 4));
    rt.after(10, () => rt.say(F.boss, '槍は奥の柵を守れ。先頭が入っても撃つな。後続まで入り込んだ所を狙う', 4.5));
    rt.after(95, () => this.tobigasu(rt));
  },

  // 将の寄せを三つの局面にまとめる。順番・柵間の誘い込みは遊びのための復元。
  WAVES: [
    { name: '山県昌景', fac: 'akazonae', z: 68, cav: 12, ash: 18, line: '赤備えじゃ！　山県昌景の騎馬と足軽、南の虎口へ突っ込んでくる！' },
    { name: '内藤昌豊', fac: 'takeda', z: 20, cav: 8, ash: 20, line: '内藤昌豊の隊が続く！　南寄りの虎口へ槍を揃えよ！' },
    { name: '真田信綱・昌輝', fac: 'takeda', z: -40, cav: 10, ash: 18, line: '真田信綱と昌輝の隊じゃ！　北の柵の間へ押し込んでくるぞ！', brother: true },
  ],

  wave(rt) {
    const F = rt.flags;
    const W0 = this.WAVES;
    const w = W0[F.wave];
    if (!w || F.pursuit || (F.cur && !F.cur.doneWave)) return;
    // 前の寄せが残る時は、生きた兵の枠が空くまで次を待つ。
    const need = 1 + (w.brother ? 1 : 0) + w.cav + w.ash + 9;
    const aliveNow = rt.army.units.reduce((n, u) => n + (u.alive ? 1 : 0), 0);
    const freed = nagashinojo.kit.freeRoom(rt, Math.max(0, aliveNow + need - 245));
    if (aliveNow - freed + need > 245) {
      rt.after(4, () => this.wave(rt)); return;
    }
    F.wave++;
    rt.setPhase('defend');
    F.waveAt = rt.t;
    F.waitSaid = false; F.trap = false; F.close = false; F.volleys = 0; F.volT = 99; F.enteredShown = -1;
    F.lane = { x: SB.x0 - SB.gap + 1, z: w.z };
    ceaseBands(F.bands);
    for (const q of F.guns) {
      q.focus = null; q.fire = true; q.order = 'move';
      q.dest = { x: SB.x0 - 2 * SB.gap - 2, z: q.anchor.z };
      q.onArrive = (gg) => { gg.order = 'hold'; gg.facing = Math.PI / 2; };
    }
    for (const q of F.spears) { q.order = 'hold'; q.aggro = 2; }
    const screen = F.spears[0];
    screen.order = 'move'; screen.dest = { x: SB.x0 - 2 * SB.gap - 1, z: w.z };
    screen.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI / 2; };
    const g = enemyGroup(rt, { faction: w.fac, name: w.name + '隊', anchor: { x: 88, z: w.z }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 2, width: 4, spacing: 0.9, formation: 'column', noRout: true, morale: 100, speed: 3 },
      [{ type: 'busho', n: 1, o: { name: w.brother ? '真田信綱' : w.name, horse: true } },
        ...(w.brother ? [{ type: 'busho', n: 1, o: { name: '真田昌輝', horse: true } }] : []),
        { type: 'cavalry', n: w.cav }, { type: 'ashigaru', n: w.ash }]);
    g.colW = 4; g.march = false;
    g.def = w;
    F.cur = g;
    // 織田家編：柵の内へ抜けてきた騎馬に、足軽大将がひと当たりで討たれないよう、寄せの騎馬の打ちを軽くする（柵の外の迫力は変えない）
    if (F.oda) for (const u of g.units) if (u.type === 'cavalry') u.dmg *= 0.6;
    // 寄せの後ろから、武田の鉄砲と弓の組が川の手前まで出て、柵の内へ撃ちかける（騎馬の突っ込みを援ける）。
    //   柵に取り付かず、寄せの隊が崩れれば一緒に退く
    const mis = enemyGroup(rt, { faction: w.fac, name: w.name + '隊の鉄砲・弓', anchor: { x: 112, z: w.z + 14 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 6, width: 14, morale: 85, speed: 2.6 },
      [{ type: 'samurai', n: 1 }, { type: 'gun', n: 4 }, { type: 'bow', n: 4 }]);
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
      // 武田の騎馬の塊が、柵の前の大軍の横から駆け込む（軽い作り。kaito 0929）
      rt.after(10 + i * 5, () => c.cavalry('B', { flag: fac === 'takeda' && i ? 'furin' : fac, armor: nagashinojo.kit.ARMOR[fac], count: 90, delay: 2 }));
      return c;
    });
    // 名のある寄せ手の後ろに、同じ旗の騎馬と足軽が続く（寄せの厚み）
    nagashinojo.kit.backOf(rt, g, { flag: w.fac, armor: nagashinojo.kit.ARMOR[w.fac], kind: 'cavalry', w: 26, depth: 18, count: 170, gap: 4, seed: 71 + F.wave, stop: () => g.center().x < SB.x0 + 75 });
    sfx('taiko', 1);
    rt.banner(`武田の寄せ　${['一', '二', '三'][F.wave - 1]}の波`, `${w.name}の隊`);
    rt.say('足軽', w.line, 3);
    // 朝から昼過ぎまで続いた戦：三の波のころには日が高く傾き始める
    if (F.wave === 3) rt.world.setTime('after');
    rt.marker('wave', centerOf(g), () => `${w.name}・${moraleWord(g.morale)}`, { red: true, group: g });
    // 一列目の虎口を通り、二列目との間へ入る。瞬間移動や柵の強制破壊はしない。
    g.order = 'move'; g.dest = { x: SB.x0 + 8, z: w.z };
    g.onArrive = (q) => {
      q.dest = F.lane;
      q.onArrive = (qq) => { qq.order = 'hold'; qq.anchor = F.lane; qq.aggro = 3; };
    };
    // 近い鉄砲三組を柵の奥へ寄せ、同じ虎口へ射線を集める。
    F.focusGuns = F.guns.slice().sort((a, b) => Math.abs(a.anchor.z - w.z) - Math.abs(b.anchor.z - w.z)).slice(0, 3);
    F.focusGuns.forEach((q, i) => {
      q.order = 'move'; q.dest = { x: SB.x0 - 2 * SB.gap - 2, z: w.z + (i - 1) * 12 };
      q.onArrive = (qq) => { qq.order = 'hold'; qq.facing = Math.PI / 2; };
    });
    rt.obj('hold', `敵の後続まで柵の間へ引きつけよ（寄せ ${F.wave}/3）`, 'main');
    rt.say(F.boss, '鉄砲三組、この虎口へ寄れ！　槍は奥で待て。まだ撃つな', 3.5);
    rt.choose('率いる組へ、どう下知する？', [
      { label: '奥の柵に槍を揃え、突破を止める', note: '鉄砲の射線を空け、撃ち漏らしを正面で受ける' },
      { label: '虎口の脇へ組を回し、射撃の後に横から当たる', note: '撃つまでは待ち、柵間の武田勢へ横槍を入れる' },
    ], (i) => {
      if (F.cur !== g || g.doneWave) return;
      F.flank = i === 1;
      const pt = { x: SB.x0 - 2 * SB.gap - 1, z: w.z + (F.flank ? 12 : 0) };
      F.commandPt = pt;
      for (const q of rt.squadGroups || []) {
        q.order = 'move'; q.dest = pt; q.holdFire = true; q.fire = false; q.aggro = 2;
        q.onArrive = (qq) => { qq.order = 'hold'; qq.formation = qq.kind === 'spear' ? 'yari' : 'line'; };
      }
      rt.marker('command', pt, F.flank ? '組の横槍の持ち場' : '組の槍衾の持ち場');
      rt.obj('stay', '組の持ち場へ進め。射撃が済むまで待ち、柵の外へ出るな', 'order');
      rt.say(nm(rt), F.flank ? '組は虎口の脇へ！　鉄砲が撃つまで待て！' : '組は奥の柵へ！　槍を揃え、鉄砲の前を空けよ！', 3);
    }, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    guardRecover(rt, F.okubo, dt, { line: [F.boss, '……手傷じゃ。柵を頼む、しばし退く'], backLine: [F.boss, '待たせたな。持ち場へ戻るぞ'] });
    if (F.hpBars) F.hpBars.update(rt.army.groups);
    const p = rt.player.u.pos;
    if (F.wave === 0 && !F.prepDone) {
      const here = Math.hypot(p.x - F.prepPt.x, p.z - F.prepPt.z) < 7;
      let together = false;
      for (const q of rt.squadGroups || []) for (const u of q.units) {
        if (u.alive && Math.hypot(u.pos.x - F.prepPt.x, u.pos.z - F.prepPt.z) < 10) together = true;
      }
      F.prepT = here && together ? (F.prepT || 0) + dt : 0;
      if ((F.prepT >= 4 && rt.t - F.prepAt >= 18) || rt.t - F.prepAt > 35) {
        F.prepDone = true;
        for (const q of F.fence) if (Math.abs((q.seg[1] + q.seg[3]) / 2 - F.prepPt.z) < 12) { q.maxHp *= 1.15; q.hp = q.maxHp; }
        rt.unmark('prepare');
        rt.say(F.boss, F.prepT >= 4 ? 'よし、組が揃った。柵も固い。武田の寄せをここで受けるぞ' : '人足が柵を結い終えた。組を連れて持ち場へ戻れ', 3.5);
        this.wave(rt);
      }
    }
    // 織田家編：大軍から本物に替わった武田の騎馬（wake）も、寄せの騎馬と同じく打ちを軽くする（柵ぎわの足軽大将が数秒で討たれないように）
    if ((F.wkT = (F.wkT || 0) - dt) <= 0) {
      F.wkT = 0.5;
      // 柵の内にいる間は、武田の大軍を本物に替えない（柵ぎわに立つだけで、替わった騎馬が二十騎も内へ押し寄せていた）。柵の外へ出れば替わる
      const inside = p.x < SH_FRONT + 4;
      for (const A of rt.world.armies || []) if (A.team === 1 || ['takeda', 'akazonae', 'furin'].includes(A.mon)) A.noWake = inside;
      if (F.oda) for (const g of rt.army.groups) if (g.team !== 0 && (g.woke || g.clashSide) && !g._shDmg) { g._shDmg = true; for (const u of g.units) if (u.type === 'cavalry') u.dmg *= 0.6; }
    }
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
    // 射線の遮り（11〜23 章）：鉄砲組の前で味方の槍組が揉み合っていれば、その鉄砲組は撃てない
    if (F.bands) losTick(F.guns, F.spears);
    // 予備を入れる判断（56〜59 章）：いちばん危ない区画（柵の陥落が広い所）を、鉄砲の一手を預かる者・侍大将に知らせる
    if ((F.bigGun || rt.G.lord) && (F.wzT = (F.wzT || 0) - dt) <= 0) {
      F.wzT = 2;
      const wz = worstZone(F.fence, ZONES);
      if (wz && wz !== F.wzSaid) { F.wzSaid = wz; rt.bark(`${wz}の柵、危うし。予備を回せ`, true); }
      else if (!wz) F.wzSaid = null;
    }
    // 予備隊、区画ごとに自動で動く（37・45 章）：柵が破られた区画へ入り・向き直る。別の区画が薄くなれば、そちらが次に危なくなる
    if (F.reserve) reserveTick(rt, F.reserve, F.fence, ZONES, dt, F.reserveOptions);
    // 柵の様子だけを渡す。英字の班名や状態は画面に出さない
    if ((F.hudT = (F.hudT || 0) - dt) <= 0) {
      F.hudT = 0.5;
      F.hudBands = null;
      if (F.bigGun || rt.G.lord) {
        const zn = zoneOfZ(p.z);
        F.hudZone = { name: zn, pct: Math.round(zoneHp(F.fence, zn) * 100), breach: gapSize(F.fence, zn).level === 'large' };
      } else F.hudZone = null;
    }
    // 寄せの隊が崩れたか尽きたら、後ろの鉄砲・弓の組も退く
    if (F.curMis && F.cur && (F.cur.routed || F.cur.count === 0) && !F.curMis.routed && F.curMis.count) { F.curMis.noRout = false; F.curMis.morale = 0; }
    // 最前列の距離ではなく、実際に柵間へ入った人数で射撃を解禁する。
    const g = F.cur;
    if (g && !g.doneWave && !g.routed && g.count > 0 && !F.pursuit) {
      let entered = 0, alive = 0, target = null;
      for (const u of g.units) if (u.alive && !u.fleeing) {
        alive++;
        if (u.pos.x < SB.x0 - 0.8 && u.pos.x > SB.x0 - SB.gap - 1 && Math.abs(u.pos.z - g.def.z) < 14) { entered++; target = target || u; }
      }
      if (entered && !F.waitSaid) { F.waitSaid = true; rt.say(F.boss, '先頭が入った！　まだ撃つな、後ろまで引きつけよ！', 3); }
      if (!F.trap && entered !== F.enteredShown) { F.enteredShown = entered; rt.objProgress('hold', `柵の間の敵 ${entered}人／後続を待つ`); }
      const full = entered >= Math.min(6, alive) && entered >= Math.ceil(alive * 0.6);
      // 詰まった時は、誘い込み成功とせず柵前を撃って守る。次の段へ進める保険。
      const stalled = rt.t - F.waveAt > 65;
      if (!F.trap && (full || stalled)) {
        F.trap = true; F.fireAt = rt.t; g.noRout = false;
        rt.objProgress('hold', '');
        rt.obj('hold', full ? '柵の間へ入り込んだ武田勢を、鉄砲で撃ち崩せ' : '柵前で詰まった武田勢を撃ち、突破を止めよ', 'main');
        rt.banner(full ? '柵の間へ入り込んだ' : '武田勢、柵前に詰まる', 'この虎口へ鉄砲を集め、放て！');
        if (full) rt.award((t) => t.side.push('柵の間へ引きつけた'), '後続まで柵の間へ引きつけた');
      }
      F.volT += dt;
      if (F.trap && !F.close && F.volT >= 8.5) {
        F.volT = 0; F.volleys++;
        if (!target) for (const u of g.units) if (u.alive && !u.fleeing) { target = u; break; }
        for (const q of F.focusGuns) if (!q._losBlocked) { q.fire = true; q.holdFire = false; q._wantFire = true; q.focus = target; }
        for (const q of rt.squadGroups || []) if (q.kind === 'gun' || q.kind === 'bow') { q.fire = true; q.holdFire = false; q.focus = target; }
        for (const c of F.clashW || []) c.volley('A');
        rt.say(F.boss, 'この虎口へ、放てぇっ！', 2);
        rt.after(1.2, () => { if (F.cur === g) for (const q of F.focusGuns) { q.holdFire = true; q._wantFire = false; } });
      }
      if (F.trap && !F.close && rt.t - F.fireAt > 10) {
        F.close = true;
        ceaseBands(F.bands);
        g.order = 'attack'; g.seekRange = 18; g.aggro = 14;
        for (const q of rt.squadGroups || []) {
          q.focus = null; q.holdFire = false; q.fire = true; q.onArrive = null;
          q.order = q.kind === 'gun' || q.kind === 'bow' ? 'hold' : 'attack'; q.seekRange = F.flank ? 26 : 16; q.aggro = 10;
        }
        const spear = F.spears[0];
        spear.onArrive = null; spear.order = 'attack'; spear.seekRange = 24; spear.aggro = 12;
        rt.obj('hold', `${g.def.name}の隊と柵の内で激突。組を率い、撃ち漏らしを止めよ`, 'main');
        rt.obj('stay', F.flank ? '組へ「かかれ」。虎口の脇から横槍を入れよ' : '組の槍を揃え、奥の柵を守れ', 'order');
        rt.say(F.boss, F.flank ? '鉄砲、控えよ！　その方の組、横から当たれ！' : '鉄砲、控えよ！　その方の組、槍を揃えて受け止めよ！', 3);
      }
    }
    // 保険：一つの波が長引いたら（柵の前で止まったまま等）、寄せ手は崩れて退く
    if (g && !F.pursuit && !g.doneWave && !g.routed && g.count > 0 && rt.t - (F.waveAt || 0) > 90) { g.noRout = false; g.morale = 0; }
    // 波が崩れたら、次の波
    if (g && !F.pursuit && (g.routed || g.count === 0) && !g.doneWave) {
      g.doneWave = true;
      ceaseBands(F.bands);
      rt.unmark('command');
      for (const q of rt.squadGroups || []) { q.order = 'follow'; q.focus = null; q.onArrive = null; q.holdFire = false; q.fire = true; }
      for (const q of F.guns) { q.focus = null; q.order = 'hold'; q.onArrive = null; }
      nagashinojo.kit.markRecyclable(g, F.curMis);
      rt.unmark('wave');
      for (const c of F.clashW || []) rt.after(1 + Math.random() * 3, () => c.rout('B', { hideAfter: 40, minFight: 40 }));
      rt.obj('hold', `${rt.G.lord ? '馬防柵で武田を迎え撃ち、勝頼を退かせよ' : F.bigGun ? '鉄砲の一手を預かり、馬防柵を守り抜け' : '馬防柵を守り抜け'}（武田の寄せ ${F.wave}/3）`, 'main');
      // 生きて退く将を強制的に殺さない。戦全体での討死は史実札に記す。
      rt.say('伝令', `${g.def.name}の隊、退くぞ！`, 3);
      rt.award((t) => t.side.push(`${g.def.name}隊を退けた`), `${g.def.name}隊を退けた`);
      if (F.wave < this.WAVES.length) {
        rt.say((rt.flags.boss || '大久保忠世'), 'よう持ちこたえた！　次が来るぞ、槍を立てよ', 3);
        rt.after(12, () => this.wave(rt));
      } else this.decide(rt);
    }
    // 柵の外へ出たか（打って出る下知の間は咎めない）
    if (!F.pursuit && p.x > SH_FRONT && !rt.G.lord && !depthOn(rt)) {
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
      if ((R && (R.routed || R.count === 0)) || rt.t - F.pursuit > 120) {
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
        end();
      }
    }
  },

  // 鳶ヶ巣山（46 章）：主戦場とは別方向、酒井忠次の別働が夜明けに武田の拠点を落とす。主戦場には狼煙・遠い音・伝令の知らせだけ届く
  tobigasu(rt) {
    const F = rt.flags;
    if (F.tobiDone || F.pursuit) return;
    F.tobiDone = true;
    for (let i = 0; i < 3; i++) rt.army.smoke(188, rt.world.heightAt(188, -168) + 7, -168 + i * 5, 1.6, 0);
    sfx('taiko', 0.35);
    rt.say('伝令', '鳶ヶ巣山に狼煙！　酒井忠次様、武田の砦を落とされ申した！', 4.5);
    rt.bark('鳶ヶ巣山、落つ。武田勢、後ろを気にしておる', true);
    const groups = [F.cur, ...(F.hill || []), F.katsuyori].filter((g) => g && g.count > 0);
    for (const g of groups) g.morale = Math.max(15, (g.morale ?? 80) - 10);
  },
  decide(rt) {
    const F = rt.flags;
    rt.objDone('hold');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '馬防柵を守り抜いた');
    if (!F.outWarned && !rt.G.lord) rt.objDone('stay');
    rt.objRemove('stay');
    rt.objRemove('hold');
    if (F.broken <= 3) { rt.objDone('fence'); rt.award((t) => t.side.push('柵を守った'), '一列目の柵を守った'); }
    rt.objRemove('fence');
    rt.banner('勝頼の決断', '武田勢、退き始める');
    // 丘の上の武田の隊と勝頼の本陣が、背を向けて東へ退いていく
    F.katsuyori.retreat(60, 40);
    F.hill.forEach((h, i) => { if (!h.army.rout) rt.after(i * 1.5, () => h.retreat(50, 36)); });
    rt.say('伝令', '武田勝頼、退き陣！　馬場美濃守が殿に残っておりまする！', 4);
    // 組を揃え直し、追い討ちへ出る口を選ぶ
    const go = (fn) => (rt.G.lord ? rt.after(5, fn) : rt.after(3, () => depthStart(rt, shiCtx(rt), shiA(rt), fn)));
    go(function begin() {
      const alive = rt.army.units.reduce((n, u) => n + (u.alive ? 1 : 0), 0);
      const freed = nagashinojo.kit.freeRoom(rt, Math.max(0, alive + 23 - 245));
      if (alive - freed + 23 > 245) { rt.after(4, begin); return; }
      F.pursuit = rt.t;
      sfx('horagai', 1);
      rt.say((rt.flags.boss || '大久保忠世'), '柵を出よ！　追い討ちじゃ！　虎口から打って出よ！', 4);
      rt.obj('pursue', '柵を出て、殿の馬場信春の隊を崩せ', 'main');
      ceaseBands(F.bands);   // 集中射撃を終え、追い討ちでは全員に撃たせる
      for (const gg of F.guns) { gg.fire = true; gg.holdFire = false; }
      for (const sp of F.spears) { sp.order = 'attack'; sp.seekRange = 70; sp.formation = 'line'; }
      // 柵の内に残る鉄砲組と、南北の槍組は任務に数えない：遊び手が武田の本隊へ踏み込んだ時、遠くの者から外して、
      // 本隊の中の軽い兵を本物の兵に替える枠に回す（本隊の真ん中が空き地にならないように）
      nagashinojo.kit.markRecyclable(...F.guns, ...F.spears.slice(1));
      const R = enemyGroup(rt, { faction: 'takeda', name: '馬場隊', anchor: { x: 78, z: 10 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0.2 }, aggro: 12, width: 18, morale: 90 },
        [{ type: 'busho', n: 1, o: { name: '馬場信春', horse: true } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 3 }]);
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
    if (v.type === 'busho' && v.group && v.group.def && !v.shFallSaid) {
      v.shFallSaid = true;
      if (!(k && k.isPlayer)) rt.banner(`${v.name || v.group.def.name}、討死`, '宿将の討死');
      rt.say('足軽', `敵将${v.name || v.group.def.name}、討ち取ったり！`, 3);
      v.group.morale -= 30;
      this.chainCollapse(rt, v.group);
    }
  },
  // 連鎖崩壊（43〜44 章）：侍大将の討死→同じ備の士気は onKill で大きく下がる→隣の備（近くの武田のまとまり）も中くらい下がる。
  //   複数の侍大将が討死すれば、丘の本隊（勝頼の本陣含む）にも薄く効き、全線が崩れやすくなる
  chainCollapse(rt, deadGroup) {
    const F = rt.flags;
    const c = deadGroup.center ? deadGroup.center() : null;
    const near = [F.cur, F.curMis, ...(F.hill || [])].filter((g) => g && g.count > 0 && g !== deadGroup);
    if (c) for (const g of near) {
      const gc = g.center ? g.center() : null; if (!gc) continue;
      if (Math.hypot(gc.x - c.x, gc.z - c.z) < 45) g.morale = Math.max(15, (g.morale ?? 80) - 15);
    }
    F.genDeaths = (F.genDeaths || 0) + 1;
    if (F.genDeaths === 2 && F.katsuyori && F.katsuyori.count) {
      F.katsuyori.morale = Math.max(20, (F.katsuyori.morale ?? 80) - 12);
      rt.bark('宿将が重なって討死……武田勢、動揺が広がる', true);
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
    if ((F.brokeSaid || -99) + 10 < rt.t) { F.brokeSaid = rt.t; rt.say((rt.flags.boss || '大久保忠世'), ['柵が破られた！　破れ目を槍で塞げ！', 'また一枚折られた！　穴を撃ち抜かせるな、鉄砲を寄せよ！', '柵が持たぬ！　控えの槍衆、前へ！'][Math.min(2, (F.brokeN = (F.brokeN || 0) + 1) - 1)], 3); }
    // 足軽大将以上（鉄砲の一手を預かる・侍大将）には、区画の柵の残り（細いゲージ）と突破口の広さを知らせる（60〜62 章）
    if (s.row === 0 && s.zone && (F.bigGun || rt.G.lord)) {
      const pct = Math.round(zoneHp(F.fence, s.zone) * 100);
      const gp = gapSize(F.fence, s.zone);
      rt.bark(`${s.zone}防御線　馬防柵 ${pct}%${gp.level !== 'none' && gp.level !== 'small' ? '　突破口が広がる' : ''}`);
    }
    sfx('wood', 1);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if ((F.hitWarn || -99) + 12 > rt.t) return;
    F.hitWarn = rt.t;
    const z = (s.seg[1] + s.seg[3]) / 2;
    const who = F.cur && F.cur.def ? `${F.cur.def.name}の隊` : '武田の隊';
    rt.bark(`${z < -30 ? '北' : z > 30 ? '南' : '正面'}の柵に${who}が取り付いた！`, true);
  },
};
// 両軍の総勢（織田・徳川 三万八千、武田 一万五千）。討たれた兵一人を、遠くの大勢の損害に見立てる
shitaragahara.force = (rt) => {
  const F = rt.flags;
  const b = 15000 - (F.ek || 0) * 95 - (F.ending ? 1500 : 0);
  return { a: 38000 - (F.ak || 0) * 40, a0: 38000, b, b0: 15000 };
};
shitaragahara.canSkip = (rt) => (rt.phase === 'brief' && rt.flags.wave === 0 && rt.t > 3 ? '武田の寄せまで待つ' : '');
shitaragahara.skip = (rt) => { rt.flags.prepAt = rt.t - 36; };
// 織田家編では、味方の紋を織田の木瓜に
shitaragahara.sides = { a: { name: '織田・徳川軍', get mon() { return scenarioKey() === 'oda' ? 'oda' : 'tokugawa'; } }, b: { name: '武田軍', mon: 'takeda' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
shitaragahara.famous = [
  ...HISTORICAL_GENERALS.shitaragahara,
  { name: '前田利家', team: 0, g: /前田組/, line: '前田利家じゃ。柵から出るな。寄せる者を撃て！' },
  { name: '大久保忠世', team: 0, g: /大久保組/, line: '大久保忠世じゃ。徳川の者、柵の前で踏みとどまれ！' },
];
shitaragahara.history = '天正三年五月二十一日、織田・徳川軍は設楽原で馬防柵と鉄砲を用い、武田勝頼の軍を破った。『信長公記』は鉄砲千挺ほどを奉行に預け、柵の外へ出ず、寄せる武田勢を撃ち退けたと記す。山県昌景の赤備え、真田信綱・昌輝らの奮戦と討死は『甲陽軍鑑』にも伝わる。山県・内藤・真田兄弟ら多くの宿将が討死し、馬場信春は退却の殿を務めた。鉄砲は三千挺だったとも伝わるが、数や撃ち方には諸説があり、三段撃ちを確定した史実とはしない。この戦の三つの寄せ、三重の柵の間への誘い込みと集中射撃は、柵・鉄砲・槍の働きを体験するための復元である。';
shitaragahara.date = (rt) => `天正三年五月二十一日　${seasonOf('五月')}・${sky(rt)}`;
shitaragahara.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）

// ---- 設楽原 ----
function shiCtx(rt) {
  const F = rt.flags;
  // 自分の槍組（組頭が不死）を味方の組にして、段の場所へ一緒に押し出す（深手の時に下がる先にもなる）
  return { faction: 'takeda', dmg: 0.54, friends: () => [F.spears && F.spears[0]].filter((g) => g && g.count && !g.routed) };
}
// 三の寄せの後：組を揃え直し、中央の虎口か南の端から追い討ちへ
function shiA(rt) {
  const B = rt.flags.boss || '大久保忠世';
  return [
    DP.rest({ dur: 8, say: [[B, '弾を込め直せ。柵の破れ目を結え。手負いは後ろへ'], ['足軽', '見よ、武田の本陣が動いておる……！'], [B, '組を集めよ。打って出る口を選び、馬場の殿へ当たる']] }),
    DP.pick({ time: 12, title: '勝頼が退き始めた。追い討ちに、どこから打って出る？',
      options: [{ label: '中央の虎口から、殿の馬場隊へまっすぐ', note: '一番に馬場隊へ当たれる。正面は固い' }, { label: '南の端から回り、馬場隊の横腹を突く', note: '馬場隊が大きく揺らぐ。着くのは遅れる' }],
      on: (rt, m, i) => { m.shiSide = i === 1; } }),
  ];
}

export { shitaragahara };
