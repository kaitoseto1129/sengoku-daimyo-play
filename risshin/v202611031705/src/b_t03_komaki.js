// ======================================================================
// 豊臣編　小牧・長久手の戦い（天正十二年四月九日の朝）。docs/chapter2_toyotomi.md の 3 を正とする。
// 小牧で家康とにらみ合う中、池田恒興・森長可・堀秀政・羽柴秀次がおよそ二万で三河へ回り込んだ（中入り）。
// 家康はこれを追い、白山林で朝飯中の秀次隊を襲って崩した。堀秀政は桧ヶ根で追手を押し返したが、
// 長久手で池田・森勢は家康の本隊に敗れ、池田恒興・元助と森長可が討たれた。秀吉方の負け戦。
// 主人公は秀次隊に付く部将。①白山林で組を立て直す ②秀次を林から逃がす ③桧ヶ根で堀隊と追手を押し返す
// ④長久手の崩れを横目に、兵を連れて西へ退き切る。勝ち負けでなく「生き残って退く」が勝ちの形。
// 負け：秀次が討たれる・退く時に連れた兵が三分の一を切る・追手に囲まれる（およそ六分半）。
// 向き：西（−x）が楽田・小牧へ退く道。東（+x）の林が白山林、中ほどの丘が桧ヶ根、南（+z）の奥が長久手。
// 地点の間隔と向きは縮めた復元（実の白山林・桧ヶ根・長久手は数 km 離れる）。
// 地形：国土地理院の標高（asset_dem_nagakute.js。node prototype/tools/dem.mjs nagakute で作る）の尾根と谷を、
// 道と戦う床から離れた所へ足す。読めない時は手書きの丘だけで遊べる。
// ======================================================================
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demDetail } from './dem.js';
import { enemyGroup, allyGroup, gauss } from './bhelp.js';
import { distToPolyline } from './world.js';
import { KIT } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { sfx } from './audio.js';
import { withGuard } from './toyo_bot.js';
import { KILLS, cut } from './stages.js';

const XW = 158, ZN = -120, ZS = 120;                   // 見えない壁
const ROAD = [[156, -30], [112, -26], [64, -18], [12, -10], [-50, -14], [-110, -18], [-156, -22]];
const CAMP = { x: 112, z: -26 };                       // 白山林の秀次の陣（朝飯の場）
const HINOKI = { x: 12, z: -10 };                      // 桧ヶ根（堀秀政の陣）
const HIDE_STOP = { x: -2, z: -14 };                   // 秀次が堀隊の後ろで息をつく所
const EXIT = { x: -140, z: -20 };                      // 西の退き口（楽田へ）
const NAGAKUTE = { x: 46, z: 96 };                     // 長久手の合戦（南の奥。軽い大軍で見せる）
const REAL_CAP = 190;                                  // 戦う本物の兵の上限
const TIME_UP = 440;                                   // 追手に囲まれるまで（秒）
const ARMOR = KIT.ARMOR;
// 徳川勢：黒い具足に柿渋。井伊の赤備えは朱
const TOKU = { armor: ARMOR.tokugawa, cloth: 0x5a4632, lace: 0x7a5a3a, flag: 'tokugawa' };
const AKA = { armor: ARMOR.akazonae, cloth: 0x8e2a1e, lace: 0xa0402a, flag: 'akazonae' };
const dressT = (list, kit = TOKU) => list.map((s) => ({ ...s, o: { ...kit, ...(s.o || {}) } }));
const foeKnot = (n = 9, kit = TOKU) => dressT([{ type: 'ashigaru', n: Math.ceil(n * 0.55), o: { flagScale: 1 } }, { type: 'ashigaru', n: Math.floor(n * 0.2) },
  { type: 'gun', n: 1 }, { type: 'samurai', n: Math.max(1, n - Math.ceil(n * 0.55) - Math.floor(n * 0.2) - 1) }], kit);

// ---- 地形 ----
let nkDem = null, heightDem = null, heightFixed = false;
// 標高の束（tools/dem.mjs の nagakute）を支度で読む（11/1 まで束が無く、手書きの地形だけだった）
BATTLE_ASSETS.t03_komaki = Object.freeze([...assetsForBattle(''), 'dem_nagakute']);
useTerrain('dem_nagakute', (data) => { nkDem = data; heightDem = null; heightFixed = false; });
function heightBase(x, z) {
  // 尾張東部のなだらかな丘。白山林は東の小高い林、桧ヶ根は中ほどの丘、長久手（南）は低い谷
  let h = 1.6 * Math.sin(x * 0.021 + 0.4) * Math.cos(z * 0.018 - 0.3) + 0.9 * Math.sin(x * 0.07 - z * 0.05);
  h += 5 * gauss(x, z, 128, -40, 2600);                // 白山林の丘
  h += 6.5 * gauss(x, z, HINOKI.x + 6, HINOKI.z - 6, 1500);   // 桧ヶ根
  h += 4 * gauss(x, z, -60, -70, 3800);                // 色金山の方の高み
  h -= 2.5 * gauss(x, z, NAGAKUTE.x, NAGAKUTE.z, 5000);   // 長久手の谷（香流川の低地）
  return h;
}
function height(x, z) {
  if (!heightFixed) { heightFixed = true; heightDem = nkDem; }
  let h = heightBase(x, z);
  if (heightDem) {
    // 実測の尾根と谷は道から十八歩より外だけ（戦う床と退き道の高さは変えない）
    const away = Math.max(0, Math.min(1, (distToPolyline(x, z, ROAD) - 18) / 16));
    if (away > 0) h += away * demDetail(heightDem, x, z, { xy: 8, win: 80, scale: 0.35 });
  }
  return h;
}

const live = (g) => g && g.units.some((u) => u.alive && !u.gone);
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone ? 1 : 0), 0) : 0);
const aliveReal = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && !u.isStruct && u.type !== 'porter' ? 1 : 0), 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const STAGE_TEXT = ['', '白山林の羽柴秀次の旗のそばで、襲ってくる徳川の先手を討つ', '羽柴秀次の旗を守り、西の堀秀政の陣の旗まで連れていく', '桧ヶ根の堀秀政の陣で、追ってくる徳川の先手を討つ', '西の楽田の陣の旗まで走る'];
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

const t03_komaki = {
  spawn: { x: CAMP.x - 4, z: CAMP.z + 6, heading: Math.PI / 2 },
  minutes: 7,
  compactIntro: true,
  introText: () => '白山林で朝飯の最中、徳川勢が後ろから襲ってくる。秀次様と兵を生かして退け。',
  missionSingleLine: true,
  hideGuideSteps: true,
  noMiniMap: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  foeMarks: true,
  playerAtkMax: 3,
  playerTaken: 0.45,
  playerRegen: 0.025,
  botDefendsFort: true,
  closeCombatAssist: true,
  noWinCrane: true,
  // 行き先のピン：段ごとに一つ（字は出さない）
  missionPin(rt) {
    const F = rt.flags;
    if (!F.stage || F.ending) return null;
    let p = null;
    if (F.stage === 1) p = F.hideU?.alive ? F.hideU.pos : CAMP;
    else if (F.stage === 2) p = F.hideU?.alive ? F.hideU.pos : HIDE_STOP;
    else if (F.stage === 3) p = HINOKI;
    else p = EXIT;
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.stage === 4 ? 10 : 8;
    return PIN;
  },
  world: {
    seed: 15840,
    time: 'day',
    mist: 0.25,
    groundHalf: 200,
    height,
    paths: [{ pts: ROAD, w: 3.5 }],
    patchyGround: true,
    // 旧暦四月九日（今の五月半ば）：若い草と畑の土
    tint(x, z, h, c) {
      const a = Math.sin(x * 0.04 + 1.1) * Math.cos(z * 0.035 - 0.4);
      const k = 0.5 + 0.5 * a;
      c.setRGB(c.r * (0.84 + k * 0.3), c.g * (0.9 + k * 0.24), c.b * (0.8 + k * 0.26));
    },
    // 白山林の松と雑木、桧ヶ根の木立、色金山の方の林
    groves: [
      { x: 132, z: -44, r: 30, n: 120, sx: 1.2, sz: 1 },
      { x: 104, z: -66, r: 18, n: 40, kind: 'matsu' },
      { x: 150, z: 4, r: 16, n: 34, kind: 'matsu' },
      { x: 30, z: -46, r: 18, n: 36 },
      { x: -64, z: -78, r: 26, n: 60, kind: 'sugi' },
      { x: -100, z: 40, r: 22, n: 40 },
    ],
    clearGroves: true,
    clear: (x, z) => dist({ x, z }, CAMP) < 16 || dist({ x, z }, HINOKI) < 18 || distToPolyline(x, z, ROAD) < 6,
    trees: 220,
    tufts: 2200,
    treeDensity: (x, z) => (Math.abs(z) < 60 && Math.abs(x) < 150 ? 0.25 : 1),
    fleeOut: (x, z, team) => (team === 1 ? x > 170 : x < -170),
  },

  setup(rt) {
    const F = rt.flags;
    F.stage = 0; F.holdPlayer = true; F.waves = []; F.pursuit = [];
    const me = rt.G?.name || '自分';
    // 羽柴秀次（馬上・討たれたら負け）と馬廻り
    F.hideG = allyGroup(rt, { name: '羽柴秀次', anchor: { x: CAMP.x, z: CAMP.z }, facing: -Math.PI / 2, width: 1, aggro: 4, speed: 4.6, order: 'hold', noRout: true },
      [{ type: 'busho', n: 1, o: { name: '羽柴秀次', horse: true } }]);
    F.hideU = F.hideG.units[0];
    F.hideU.maxHp = F.hideU.hp = 260;
    F.hideU.invuln = true;   // 飯の場では討たれない（逃げる段2 だけ、討たれたら負け）
    // 連れた兵（主人公の組）：朝飯の焚き火のまわりから
    F.men = allyGroup(rt, { name: '秀次隊の足軽', fullStrength: true, anchor: { x: CAMP.x - 6, z: CAMP.z + 10 }, facing: Math.PI / 2, width: 5, aggro: 10, speed: 3.8,
      order: 'hold', noRout: true, dmgMult: 0.5 },
    [{ type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'ashigaru', n: 3 }, { type: 'samurai', n: 2 }, { type: 'gun', n: 2 }]);
    F.men.ai = true;
    F.menN0 = aliveN(F.men);
    // 秀次隊のほかの手（林の中で崩れていく）
    F.camp = allyGroup(rt, { name: '秀次隊', anchor: { x: CAMP.x + 14, z: CAMP.z - 8 }, facing: Math.PI / 2, width: 6, aggro: 9, speed: 3.2, order: 'hold', dmgMult: 0.45 },
      [{ type: 'ashigaru', n: 12 }, { type: 'samurai', n: 2 }, { type: 'bow', n: 2 }]);
    F.camp.ai = true;
    // 桧ヶ根の堀秀政の隊（段3 まで丘で待つ）
    F.hori = allyGroup(rt, { name: '堀秀政の手', anchor: { x: HINOKI.x + 4, z: HINOKI.z }, facing: Math.PI / 2, width: 8, aggro: 12, speed: 3.4, order: 'hold', noRout: true, dmgMult: 0.5 },
      [{ type: 'ashigaru', n: 14, o: { flagScale: 1 } }, { type: 'gun', n: 6 }, { type: 'samurai', n: 3 }, { type: 'busho', n: 1, o: { name: '堀秀政' } }]);
    F.hori.ai = true;
    // 南の奥の長久手：池田・森勢と家康の本隊（軽い大軍。段4 で池田・森が崩れる）
    F.nk = clash(rt, { x: NAGAKUTE.x, z: NAGAKUTE.z, facing: 0, w: 70, gap0: 22, seed: 1584, noRout: true,
      A: { flag: 'oda', armor: ARMOR.oda, count: 320, team: 0, faction: 'oda' },
      B: { flag: 'tokugawa', armor: ARMOR.tokugawa, count: 420, team: 1, faction: 'tokugawa' } });
    F.nk?.go?.();
    // 池田恒興・森長可の手：秀次隊より先に長久手の方へ進み、白山林と切り離される（段4 で二人とも討たれる）
    const ikeO = { facing: Math.PI / 2, width: 4, aggro: 8, speed: 3.6, order: 'move', noRout: true, dmgMult: 0.5 };
    F.ikeG = allyGroup(rt, { ...ikeO, name: '池田恒興の隊', anchor: { x: CAMP.x - 30, z: CAMP.z + 22 }, dest: { x: NAGAKUTE.x - 14, z: NAGAKUTE.z - 24 } },
      [{ type: 'busho', n: 1, o: { name: '池田恒興', invuln: true, horse: true, flag: 'ageha' } }, { type: 'samurai', n: 1, o: { flag: 'ageha' } }, { type: 'ashigaru', n: 4, o: { flag: 'ageha', flagScale: 1 } }]);
    F.moriG = allyGroup(rt, { ...ikeO, name: '森長可の隊', anchor: { x: CAMP.x - 22, z: CAMP.z + 32 }, dest: { x: NAGAKUTE.x + 8, z: NAGAKUTE.z - 24 } },
      [{ type: 'busho', n: 1, o: { name: '森長可', invuln: true, horse: true } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }]);
    for (const g of [F.ikeG, F.moriG]) g.onArrive = (q) => { q.order = 'hold'; };
    // 家康の金扇の本陣と、井伊の赤備えの控え（遠く）
    KIT.farHost(rt, NAGAKUTE.x + 30, NAGAKUTE.z + 26, 22, 10, 60, Math.PI, ARMOR.tokugawa, 'tokugawa', 15841, 'honjin');
    // 戦の前の言葉（史実：池田恒興の中入りの策）
    rt.obj('main', STAGE_TEXT[1], 'main');
    // 対陣と膠着・中入り・家康が気づく（battle_events_1101）
    const L = [['羽柴秀次', '家康と信雄殿は小牧山から動かぬ。睨み合うたままでは埒があかぬ', 0.5], ['池田恒興', '三河を突けば、家康は小牧を捨てて戻る', 3.6], [me, '家康がそれほど甘いとは……', 6.6],
      ['森長可', '先へ行くぞ。岩崎の城はわれらで踏み潰す', 9.2], ['羽柴秀次', 'ここで飯にいたせ。三河はまだ遠い', 12.0], ['物見', '徳川勢じゃ！　後ろから来るぞ！', 14.6]];
    for (const [who, s, t] of L) rt.after(t, () => rt.say(who, s, 2.7));
    rt.after(15.4, () => { F.holdPlayer = false; this.stage(rt, 1); });
  },

  stage(rt, n) {
    const F = rt.flags;
    F.stage = n; F.st0 = rt.t;
    rt.obj('main', STAGE_TEXT[n], 'main');
    if (n === 1) {
      // 水野・大須賀・榊原らの先手が林の南東から一度に寄せる
      sfx('horagai', 0.9);
      for (let i = 0; i < 3; i++) this.wave(rt, { x: CAMP.x + 26 + i * 6, z: CAMP.z + 34 - i * 14 }, 10, CAMP);
      this.nameFoe(F.waves[0], '榊原康政', 'samurai');
      rt.army.play('toki', { x: CAMP.x + 30, z: CAMP.z + 20 }, 1.4);
      rt.after(1, () => rt.say('徳川家康', '中入りか。小牧は残し、わしが追う。まず白山林の秀次を叩け', 3.4));
    } else if (n === 2) {
      rt.say('羽柴秀次', '馬を引け！　ここは捨てる！', 2.6);
      F.hideG.order = 'hold'; F.hideU.invuln = false;
      F.hideU.hp = F.hideU.maxHp = 640;   // 馬廻りに守られて退く（追手の数打ちで一息に討たれない。二組に狙われても堀の陣まで持つ）
      F.camp.order = 'retreat'; F.camp.dest = { x: CAMP.x + 40, z: CAMP.z - 60 };   // 林の奥へ散る
      rt.after(3.2, () => rt.say('使番', '池田・森の手ははるか先へ進み、こちらと切り離されてござる！', 3));
      rt.after(6, () => { if (F.stage === 2) this.wave(rt, { x: CAMP.x + 20, z: CAMP.z + 30 }, 9, null, F.hideU); });
      rt.after(22, () => { if (F.stage === 2) this.wave(rt, { x: 70, z: 24 }, 9, null, F.hideU); });
    } else if (n === 3) {
      rt.say('堀秀政', '鉄砲、構えよ。引き付けて撃て！', 2.8);
      F.hideU.invuln = true;
      F.hideG.order = 'move'; F.hideG.dest = { x: EXIT.x, z: EXIT.z }; F.hideG.speed = 4;
      F.hideG.onArrive = () => { for (const u of F.hideG.units) if (u.alive) rt.army.despawn(u); };
      F.wave3 = [0, 1, 2].map((i) => this.wave(rt, { x: HINOKI.x + 64 + i * 8, z: HINOKI.z - 16 + i * 16 }, 10, HINOKI));
      F.wave3N = F.wave3.reduce((s, g) => s + aliveN(g), 0);
      rt.army.play('toki', { x: HINOKI.x + 60, z: HINOKI.z }, 1.4);
      // 家康の本隊（金扇の馬印）が長久手へ回る
      if (!F.ieyG) F.ieyG = enemyGroup(rt, { faction: 'tokugawa', name: '徳川家康の旗本', anchor: { x: NAGAKUTE.x + 26, z: NAGAKUTE.z - 34 }, facing: 0, width: 4, aggro: 6, seekRange: 10, order: 'hold', noRout: true, morale: 99 },
        dressT([{ type: 'busho', n: 1, o: { name: '徳川家康', invuln: true, horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }]));
      rt.after(4, () => rt.say('徳川家康', '池田・森は長久手じゃ。総懸かりで押し包め', 3));
    } else if (n === 4) {
      // 長久手の崩れ：池田恒興・元助、森長可が討たれる（徳川の反撃・別働隊の敗北）
      F.nk?.push?.('B', 1);
      F.nk?.rout?.('A', { hideAfter: 20 });
      this.fall(rt, F.moriG, '森長可');
      rt.after(3, () => this.fall(rt, F.ikeG, '池田恒興'));
      rt.after(2, () => rt.banner('長久手で池田・森勢が崩れた', '森長可・池田恒興、討死'));
      rt.after(0.5, () => rt.say('使番', '森武蔵守様、眉間を撃たれお討死！　勝入様・元助様も討たれましてござる', 3.4));
      rt.after(4.4, () => rt.say('堀秀政', '勝入殿の手が崩れた。ここは退く！', 2.8));
      F.hori.order = 'move'; F.hori.dest = { x: EXIT.x + 6, z: EXIT.z + 14 }; F.hori.speed = 3.6;
      F.menN0 = aliveN(F.men);
      for (const g of F.waves) if (live(g)) { g.order = 'attack'; g.seekRange = 40; }
      F.nextPursuit = rt.t + 8;
    }
  },

  // 徳川勢の一組。to に向けて寄せ、focus があればその者を狙う
  wave(rt, at, n, to, focus) {
    const F = rt.flags;
    if (aliveReal(rt) + n > REAL_CAP) return null;
    const g = enemyGroup(rt, { faction: 'tokugawa', name: '徳川勢', anchor: at, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, width: 4,
      formation: 'line', morale: 85, dmgMult: 0.42, order: 'attack', seekRange: 60, aggro: 14, speed: 3.4, noRout: true, ...(focus ? { focus } : {}) }, foeKnot(n));
    if (to) { g.dest = { x: to.x, z: to.z }; }
    F.waves.push(g);
    return g;
  },

  // 隊の中の一人に名を付ける（名のある武将として頭上に名が出る）
  nameFoe(g, name, type) {
    const u = g && g.units.find((q) => q.alive && q.type === type);
    if (u) { u.name = name; u.invuln = true; }
  },
  // 名のある将の討死（筋書きどおり。隊も崩れて去る）
  fall(rt, g, name) {
    if (!g) return;
    const u = g.units.find((q) => q.name === name && q.alive);
    if (u) { u.invuln = false; rt.army.kill(u); }
    g.routed = true; g.order = 'flee';
  },

  // 井伊の赤備えの追手（段4）：主人公の後ろ（東）から
  pursue(rt) {
    const F = rt.flags, P = rt.player.u.pos;
    if (aliveReal(rt) + 8 > REAL_CAP) return;
    const g = enemyGroup(rt, { faction: 'tokugawa', name: '井伊の赤備え', anchor: { x: Math.min(XW - 4, P.x + 48), z: Math.max(ZN + 6, Math.min(ZS - 6, P.z + (F.pursuit.length % 2 ? 14 : -14))) },
      facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, width: 3, formation: 'line', morale: 90, dmgMult: 0.3, order: 'attack', seekRange: 70, aggro: 16, speed: 4.2, noRout: true },
    dressT([{ type: 'cavalry', n: 2 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }, { type: 'samurai', n: 2 }], AKA));
    F.pursuit.push(g); F.waves.push(g);
    if (F.pursuit.length === 1) {
      const u = g.units.find((q) => q.type === 'cavalry');
      if (u) { u.name = '井伊直政'; u.invuln = true; }
      rt.after(0.6, () => rt.say('物見', '赤備えじゃ！　井伊直政が追うてくる！', 2.6));
    }
    rt.army.play('toki', g.anchor, 1.2);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.stage) return;
    const P = rt.player.u;
    // 見えない壁
    for (const u of rt.army.units) {
      if (!u.alive || u.gone) continue;
      if (u.pos.x > XW) u.pos.x = XW; else if (u.pos.x < -XW) u.pos.x = -XW;
      if (u.pos.z > ZS) u.pos.z = ZS; else if (u.pos.z < ZN) u.pos.z = ZN;
    }
    // 連れた兵は主人公の脇に付く（離れたら寄る、近ければ周りの敵と戦う）
    if ((F.menT = (F.menT || 0) - dt) <= 0) {
      F.menT = 0.5;
      const c = live(F.men) && F.men.center();
      if (c) {
        const far = Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > (F.stage === 4 ? 5 : 8);
        if (far) { F.men.order = 'move'; F.men.dest = { x: P.pos.x + 2, z: P.pos.z + 2 }; F.men.speed = F.stage === 4 ? 4.4 : 3.8; }
        else { F.men.order = 'attack'; F.men.seekRange = F.stage === 4 ? 6 : 14; }
      }
    }
    // 負け：秀次が討たれる
    if (F.hideU && !F.hideU.alive && F.stage <= 2) return this.lose(rt, '秀次様が討たれた');
    // 負け：追手に囲まれる
    if (rt.t > TIME_UP) return this.lose(rt, '追手に囲まれた');
    const el = rt.t - F.st0;
    if (F.stage === 1) {
      // 先手を三分の二まで討つか、五十五秒しのげば立て直したことに
      const left = F.waves.reduce((s, g) => s + aliveN(g), 0);
      if ((el > 25 && left <= 10) || el > 55) {
        rt.award((t) => t.side.push('白山林で組を立て直した'), '白山林で組を立て直した');
        this.stage(rt, 2);
      }
    } else if (F.stage === 2) {
      // 秀次は主人公が近い間だけ道を西へ進む（離れると待つ）
      const H = F.hideU, near = dist(H.pos, P.pos) < 40;   // 追手と斬り結ぶ間も、目の届く所なら秀次は道を進む
      if ((F.hideT = (F.hideT || 0) - dt) <= 0) {
        F.hideT = 0.4;
        if (near) { F.hideG.order = 'move'; F.hideG.dest = { x: HIDE_STOP.x, z: HIDE_STOP.z }; }
        else { F.hideG.order = 'hold'; }
      }
      if (dist(H.pos, HIDE_STOP) < 9) {
        rt.say('羽柴秀次', '……助かった。堀の陣じゃ', 2.4);
        rt.award((t) => t.side.push('秀次を林から逃がした'), '秀次を林から逃がした', H.pos);
        this.stage(rt, 3);
      } else if (el > 95) { H.pos.x = HIDE_STOP.x + 3; H.pos.z = HIDE_STOP.z; }   // 道で詰まった時の保険
    } else if (F.stage === 3) {
      const left = F.wave3.reduce((s, g) => s + aliveN(g), 0);
      if ((el > 20 && left <= F.wave3N * 0.4) || el > 85) {
        for (const g of F.wave3) if (live(g)) { g.order = 'retreat'; g.dest = { x: XW, z: g.center().z }; }
        rt.say('堀秀政', '押し返したぞ！', 2.2);
        rt.award((t) => t.side.push('桧ヶ根で追手を押し返した'), '桧ヶ根で追手を押し返した');
        this.stage(rt, 4);
      }
    } else if (F.stage === 4) {
      if (rt.t > F.nextPursuit && F.pursuit.length < 5) { F.nextPursuit = rt.t + 24; this.pursue(rt); }
      // 退く時、連れた兵が三分の一を切ったら負け
      //   退き始めに連れた兵が三人に満たない時は数えない（それまでの段で討たれた分で、始まってすぐ負けにしない）
      if (F.menN0 >= 3 && aliveN(F.men) < Math.ceil(F.menN0 / 3)) return this.lose(rt, '連れた兵がほとんど討たれた');
      // 主人公から遠く後ろに残った敵は去らせる（本物の兵の枠を空ける）
      if ((F.gcT = (F.gcT || 0) - dt) <= 0) {
        F.gcT = 1;
        for (const g of F.waves) for (const u of g.units) if (u.alive && !u.gone && u.pos.x - P.pos.x > 70) rt.army.despawn(u);
      }
      if (P.pos.x < EXIT.x + 24) this.win(rt);   // 楽田への道の口（追手を振り切れば届く所）
    }
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.objFail('main');
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    rt.award((t) => t.side.push(`兵${aliveN(F.men)}人を連れて退いた`), '兵を連れて退いた');
    // 戦の後の言葉（史実：恒興・長可の討死。秀吉は和睦へ）
    rt.banner('長久手の負け', '兵を連れて楽田へ退いた');
    rt.say('堀秀政', '勝入殿も武蔵守も討たれた', 3);
    rt.after(3.2, () => rt.say('使番', '本多忠勝、わずかな兵で殿の本隊の前に立ちはだかり、家康は小幡城へ入りましてござる', 3.6));
    rt.after(7.2, () => rt.say('羽柴秀吉', '生きて戻ったのは手柄じゃ。家康は、戦では勝てぬ男よ', 3.6));
    rt.after(11, () => rt.say('羽柴秀吉', 'ならば信雄殿と和を結び、家康が出て来ずにおれぬようにしてやる', 3.6));
    rt.finish({ scriptedEnd: true }, 15);
  },

  // bot：近い敵を突き、いなければ段の行き先へ。退く段は前を塞ぐ敵だけ突く
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.stage) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    // 林を出る段（秀次を逃がす・桧ヶ根へ下がる）は、道を塞ぐ敵だけ突く（白山林で追手と斬り合い続けて段の刻が尽きない）
    const atHinoki = Math.hypot(u.pos.x - HINOKI.x, u.pos.z - HINOKI.z) < 30;
    const r = F.stage === 4 || F.stage === 2 || (F.stage === 3 && !atHinoki) ? 2.6 : 9;
    // 西へ退く段：退き口の側に立ち塞がる敵だけ突く。後ろ（東）から追う赤備えとは足を止めて斬り合わない
    const ahead = (o) => ok(o) && (F.stage !== 4 || o.pos.x < u.pos.x + 0.5);
    const e = b.army.nearestEnemy(u, r, ahead);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    let t = EXIT;
    if (F.stage === 1) t = F.hideU?.alive ? F.hideU.pos : CAMP;
    else if (F.stage === 2) t = F.hideU?.alive ? F.hideU.pos : HIDE_STOP;
    else if (F.stage === 3) t = { x: HINOKI.x + 10, z: HINOKI.z };
    goTo(p, inp, t.x - (F.stage === 2 ? 4 : 0), t.z, 2);
    if (F.stage === 4) inp.runHeld = true;   // 追手より先に楽田へ駆ける
  },
};
t03_komaki.sides = { a: { name: '羽柴勢', mon: 'oda' }, b: { name: '徳川勢', mon: 'tokugawa' } };
t03_komaki.force = () => ({ a: 20000, a0: 20000, b: 9300, b0: 9300 });
t03_komaki.date = () => '天正十二年四月九日　朝・初夏';
t03_komaki.history = '天正十二年（1584）、羽柴秀吉と徳川家康・織田信雄は尾張の小牧でにらみ合った。池田恒興の策で、池田恒興・元助、森長可、堀秀政、羽柴秀次のおよそ二万が、家康の留守の三河を突こうと東へ回り込んだ（中入り）。家康はこれを知って小牧を出て追い、四月九日の朝、白山林で休んでいた秀次の隊を後ろから襲って崩した。秀次は馬を失いながら逃れた。堀秀政は桧ヶ根で追手を待ち受けて押し返したが、長久手で池田・森の勢は家康の本隊に敗れ、池田恒興・元助と森長可が討たれた。井伊直政の赤備えはこの戦で名を上げた。秀吉は戦では家康に勝てず、この年の十一月に信雄と和睦し、家康とも手を結んだ。白山林・桧ヶ根・長久手の間隔と向きは縮めた復元で、主人公の組の動きは遊びのための筋書き。';
// 紙（battle_events_1101）の徳川方：本多忠勝と織田信雄も頭上の名で家康の旗本に（ag_bushou_armor_v2 の残り。具足は kacchu_required.js）
t03_komaki.famous = [...(t03_komaki.famous || []),
  { name: '本多忠勝', team: 1, g: /徳川家康の旗本|徳川勢/, shared: true, loose: true, invuln: true, horse: true, line: '本多平八郎忠勝なり。殿の前には一歩も通さぬ！' },
  { name: '織田信雄', team: 1, g: /徳川家康の旗本|徳川勢/, shared: true, loose: true, invuln: true, line: '織田信雄なり。家康殿と共に押し返せ！' },
];

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
// 秀次を逃がす段と退く段は、打ち込みを受けたら歩みを止めずに逃げる
t03_komaki.botGuardFlee = (b) => b.flags.stage === 2 || b.flags.stage === 4 ||
  (b.flags.stage === 3 && Math.hypot(b.player.u.pos.x - HINOKI.x, b.player.u.pos.z - HINOKI.z) >= 30);
// 西へ退く段は、深手でも東の林へ散った味方の方へ戻らず、退き口へ向かう（共通の退きは味方の列へ戻ろうとする）
t03_komaki.botEvacuating = (b) => b.flags.stage === 4;
// 倒す数（kaito 11/2 O）：右上の任務の一行に「（倒した数／倒す数）」。段が進む判定と同じ数え方（stages.js）
KILLS.t03_komaki = (rt) => {
  const F = rt.flags, n = (gs) => gs.reduce((s, g) => s + aliveN(g), 0);
  if (F.ending) return null;
  if (F.stage === 1) return cut(F.waves.reduce((s, g) => s + g.units.length, 0), n(F.waves), 10);
  return F.stage === 3 ? cut(F.wave3N, n(F.wave3), F.wave3N * 0.4) : null;
};
withGuard(t03_komaki);

export { t03_komaki };
export default t03_komaki;
