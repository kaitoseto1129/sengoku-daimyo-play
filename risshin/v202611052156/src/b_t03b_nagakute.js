// ======================================================================
// 豊臣編　小牧・長久手 二（長久手の戦い・天正十二年四月九日）。布陣図は docs/battle_refs/t03b_nagakute.md、学びは docs/battle_learn/t03b_nagakute.md。
// 小牧の対陣（b_t03_komaki.js）の続き。AR の 2（kaito 11/3）：三河中入りの三好信吉（のちの羽柴秀次。この年はまだ三好の名乗り）の隊が白山林で襲われ、
// 堀秀政が檜ヶ根で押し返して退き、仏ヶ根で池田恒興・元助・森長可が家康の勢に押し包まれて討たれる。羽柴方には非常に苦しい戦。
// ①白山林：朝飯の最中（焚き火の煙・屈んで飯を食う兵）、南と北から挟まれる。信吉様の馬印の前で寄せる徳川勢を押し返す
// ②信吉様と西の檜ヶ根の堀秀政様の陣まで走る（水野・丹羽の手が信吉様を追う。自分が先に着けば榊原の寄せが始まる）
// ③檜ヶ根の丘の上に立ち、坂を登る榊原の手を通さない（堀の鉄砲が撃つ。柵・堀を築いた記述は無いので柵は置かない）
// ④南の仏ヶ根の森長可様の鶴丸の旗まで走る（家康の本隊が池田・森の後ろへ回った）
// ⑤仏ヶ根の森長可様の旗の前で、東の井伊の赤備えを食い止める。南から家康の旗本の先手も寄せ、挟まれる。森・池田父子が討たれる
// ⑥西の細ヶ根の堀秀政様の旗まで退く（赤備えに追われる）
// 負け：信吉様が討たれる・堀の陣を破られる・刻限（連れた兵の数では負けにしない。十一の1）。どの段も、自分が着かなくても時が経てば史実どおりに進む（AY の 5）。
// 家康と信雄は南東の御旗山の本陣（見えない壁のすぐ外。金扇の馬印が仏ヶ根から見える）。陣幕の床几に座り、旗本に守られ前に出ない（AR の 3・AV の 7）。
// 名のある敵の将（大須賀康高・榊原康政・水野忠重・丹羽氏次・井伊直政）は馬上で旗本の組に囲まれ、先手の後ろに控える（討てない・AR の 4）。
// 向き：西（−x）が退く道、東（+x）が白山林、中ほどの丘が檜ヶ根、南（+z）が仏ヶ根・長久手。間隔は縮めた復元。行き先は段ごとに固定（AW の 3）。
// 地形：国土地理院の標高（asset_dem_nagakute.js）の尾根と谷を、道と戦う床から離れた所へ足す。
// ======================================================================
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demDetail } from './dem.js';
import { enemyGroup, allyGroup, gauss } from './bhelp.js';
import { distToPolyline } from './world.js';
import { campfire, nobori, umajirushi } from './props.js';
import { DUTY } from './victory_card.js';
import { sfx } from './audio.js';
import { withGuard } from './toyo_bot.js';
import { STAGES } from './stages.js';
import { KIT } from './b_nagashinojo.js';
import { ARMOR, fl, dressT, foeKnot, live, aliveN, aliveReal, dist, walls } from './b_t03_komaki.js';

const XW = 158, ZN = -120, ZS = 120;
const ROAD = [[156, -30], [112, -26], [64, -18], [12, -10], [-50, -14], [-110, -18], [-156, -22]];
const SOUTH = [[12, -10], [24, 30], [34, 72]];       // 檜ヶ根から仏ヶ根へ下る道
const CAMP = { x: 112, z: -26 };                     // 白山林の秀次の陣
const HINOKI = { x: 12, z: -10 };                    // 檜ヶ根（堀秀政の陣）
const HIDE_STOP = { x: -2, z: -14 };                 // 秀次が堀隊の後ろで息をつく所
const HOTOKE = { x: 34, z: 76 };                     // 仏ヶ根（池田・森の陣）
const EXIT = { x: -130, z: -20 };                    // 細ヶ根の堀秀政の殿
const HONJIN = { x: 100, z: 134 };                   // 御旗山の家康・信雄の本陣（壁のすぐ外。仏ヶ根から九十 m ほど）
const KANARE = [[158, 44], [104, 48], [64, 40], [27, 46], [-24, 40], [-84, 52], [-158, 46]];   // 香流川（檜ヶ根と仏ヶ根の間の浅い流れ）
const REAL_CAP = 236;
const TIME_UP = 780;
const AKA = { armor: 0x6e1a12, cloth: 0x5e1a14, lace: 0x7a2a1c, flag: 'akazonae' };   // 朱漆の赤備え（橙のおもちゃに見えないよう深く沈めた朱）
DUTY.add('t03b_nagakute');   // 羽柴の大負けの日。生きて退いても「合戦に勝利」と言わない（二の2）
const W = -Math.PI / 2, E = Math.PI / 2;   // 西向き・東向き

// 本陣の陣幕の前を囲む旗本。動かず、討てない（壁の外なので数えない）
function campGuard(rt, at, facing, name, flag, n, faction) {
  const list = [{ type: 'samurai', n: Math.round(n * 0.45), o: { keep: true } }, { type: 'ashigaru', n: Math.round(n * 0.35), o: { flagScale: 1, keep: true } }, { type: 'gun', n: Math.round(n * 0.2), o: { keep: true } }];
  const g = enemyGroup(rt, { name, anchor: { ...at }, facing, width: 10, formation: 'line', aggro: 3, seekRange: 6, order: 'hold', fixed: true, noRout: true, morale: 99, faction },
    dressT(fl(list, flag)));
  g.honjin = true;
  for (const u of g.units) { u.invuln = true; u.noTarget = true; }
  return g;
}

let nkDem = null, heightDem = null, heightFixed = false;
BATTLE_ASSETS.t03b_nagakute = Object.freeze([...assetsForBattle(''), 'dem_nagakute']);
useTerrain('dem_nagakute', (data) => { nkDem = data; heightDem = null; heightFixed = false; });
function heightBase(x, z) {
  let h = 1.6 * Math.sin(x * 0.021 + 0.4) * Math.cos(z * 0.018 - 0.3) + 0.9 * Math.sin(x * 0.07 - z * 0.05);
  h += 5 * gauss(x, z, 128, -40, 2600);                       // 白山林の丘
  h += 6.5 * gauss(x, z, HINOKI.x + 6, HINOKI.z - 6, 1500);   // 檜ヶ根
  h += 4 * gauss(x, z, -60, -70, 3800);                       // 色金山の方の高み
  h += 3 * gauss(x, z, HOTOKE.x - 6, HOTOKE.z + 4, 900);      // 仏ヶ根
  h += 10 * gauss(x, z, HONJIN.x, HONJIN.z + 10, 1100);       // 御旗山（家康の本陣）
  h -= 2 * gauss(x, z, 70, 80, 3000);                         // 長久手の低地
  h -= 1.2 * Math.max(0, 1 - distToPolyline(x, z, KANARE) / 26);   // 香流川の谷（岸がゆるく下がる）
  return h;
}
function height(x, z) {
  if (!heightFixed) { heightFixed = true; heightDem = nkDem; }
  let h = heightBase(x, z);
  if (heightDem) {
    const away = Math.max(0, Math.min(1, (Math.min(distToPolyline(x, z, ROAD), distToPolyline(x, z, SOUTH), dist({ x, z }, HOTOKE) - 16) - 18) / 16));
    if (away > 0 && z < ZS) h += away * demDetail(heightDem, x, z, { xy: 8, win: 80, scale: 0.35 });
  }
  return h;
}

const STAGE_TEXT = ['',
  '白山林で信吉様の馬印を守る',
  '信吉様と西の檜ヶ根の堀様の陣へ走る',
  '檜ヶ根の丘で榊原の手を通さない',
  '南の仏ヶ根で井伊の赤備えを食い止める',
  '南の仏ヶ根で井伊の赤備えを食い止める',
  '西の細ヶ根の堀様の旗まで退く'];
// 段ごとの行き先（固定。人の動きに付いて動かさない・AW の 3）
const GOAL = [null, { x: CAMP.x - 6, z: CAMP.z + 2 }, HIDE_STOP, { x: HINOKI.x + 6, z: HINOKI.z + 5 }, { x: HOTOKE.x + 10, z: HOTOKE.z - 4 }, { x: HOTOKE.x + 10, z: HOTOKE.z - 4 }, EXIT];
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

const t03b_nagakute = {
  spawn: { x: CAMP.x - 4, z: CAMP.z + 6, heading: E },
  minutes: 10,
  compactIntro: true,
  introSides: { a: '羽柴勢 約二万', b: '徳川・信雄勢 約一万四千' },   // 始まりの札に両軍の数（五の4。中入り四隊と、先手四千五百・本隊九千三百）
  introText: () => '三河へ回り込む途中、白山林で朝飯の最中。',
  // 右上に番号つきの五つの目標（goals5）を戦の間ずっと出す（kaito 三の3）。一行の札（missionSingleLine）は隠れて出なかったので使わない
  hideGuideSteps: true,
  hideMissionDots: true,
  enemyTriangleSigns: true,
  goalSignNoLabel: true,   // ▼の上に「印へ進め」などの字を出さない（三の1・五の1）
  singleDestinationArrow: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  noFrontFill: true,   // 作り物の乱戦を足さない（AR の 7）
  goalSignOnly: true,  // 行き先は頭上の金の▼一つだけ（BH の 6）
  kumiLead: false,     // 印は一つ（AV の 15）
  noLeaderFollow: true,
  noHatamotoMass: true,   // 見える兵は全部本物（AF）
  frontlineDensity: false,   // 小勢を足さない（本物の兵の枠を段の寄せに残す）
  alwaysMelee: false,
  foeMarks: true,
  playerAtkMax: 3,
  playerTaken: 0.25,
  foeHit: 0.6,
  meleeGrace: { rate: 0.04, burst: 0.2, interval: 1.2 },   // 囲まれても刃の傷は一息ごとに（十秒で命が尽きない）   // 命が十秒で尽きない（十二の3・BH。囲まれても退く間がある）
  playerRegen: 0.025,
  botDefendsFort: true,
  closeCombatAssist: true,
  noWinCrane: true,
  // 目標の五つ（史実の順）。④は仏ヶ根へ走って赤備えを食い止める一つの目標（中で二段）
  goals5(rt) {
    const F = rt.flags, won = () => rt.tracker?.main === true, at = (n) => () => ({ x: GOAL[n].x, z: GOAL[n].z }), past = (n) => () => won() || (F.stage || 0) >= n;
    return [
      { kind: 'stage', k: 0, text: STAGE_TEXT[1], noun: '信吉様の馬印', place: at(1), check: past(2) },
      { kind: 'stage', k: 1, text: STAGE_TEXT[2], noun: '堀秀政様の陣', place: at(2), check: past(3) },
      { kind: 'stage', k: 2, text: STAGE_TEXT[3], noun: '檜ヶ根の丘', place: at(3), check: past(4) },
      { kind: 'stage', k: 3, text: STAGE_TEXT[4], noun: '森長可様の旗', place: at(4), check: past(6) },
      { kind: 'stage', k: 4, text: STAGE_TEXT[6], noun: '堀秀政様の旗', place: at(6), check: won },
    ];
  },
  missionPin(rt) {
    const F = rt.flags;
    if (!F.stage || F.ending || F.there) return null;   // 着いたら▼を消す（九の1。空に▼だけ浮かせない）
    const p = GOAL[F.stage];
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.stage === 6 ? 10 : 8;
    return PIN;
  },
  world: {
    seed: 15840,
    time: 'morning',
    mist: 0.1,   // 薄い朝靄（濃い霧で寄せる敵が見えないのをやめる。天気は史料に無い）
    groundHalf: 220,
    height,
    mountainScale: 0.35, mountainHaze: 0.82, farReliefScale: 0.45,   // 尾張東部の低い丘陵。人に合わない大きな山を遠くに立てない
    waterSlow: true,
    streams: [{ pts: KANARE, w: 3, depth: 0.55, fords: [{ x: 27, w: 10 }, { x: -8, w: 16 }] }],   // 香流川：膝までの浅い流れ（渡れるが遅くなる。道の所は浅瀬）
    paddy(x, z) {
      // 香流川の北の低い所の田（細ヶ根へ退く道の南）。道と戦う床にはかけない
      if (x < -120 || x > -28 || z < 6 || z > 34) return 0;
      if ((Math.floor(x / 13) + Math.floor(z / 11)) % 4 === 0) return 0;
      return Math.min(1, Math.min(x + 120, -28 - x, z - 6, 34 - z) / 3);
    },
    paths: [{ pts: ROAD, w: 3.5 }, { pts: SOUTH, w: 2.5 }],
    patchyGround: true,
    tint(x, z, h, c) {
      const a = Math.sin(x * 0.04 + 1.1) * Math.cos(z * 0.035 - 0.4);
      const k = 0.5 + 0.5 * a;
      c.setRGB(c.r * (0.84 + k * 0.3), c.g * (0.9 + k * 0.24), c.b * (0.8 + k * 0.26));
    },
    groves: [
      { x: 132, z: -44, r: 30, n: 120, sx: 1.2, sz: 1 },   // 白山林
      { x: 104, z: -66, r: 18, n: 40, kind: 'matsu' },
      { x: 150, z: 4, r: 16, n: 34, kind: 'matsu' },
      { x: 30, z: -46, r: 18, n: 36 },
      { x: -64, z: -78, r: 26, n: 60, kind: 'sugi' },
      { x: -100, z: 40, r: 22, n: 40 },
      { x: HONJIN.x - 26, z: HONJIN.z + 20, r: 18, n: 36 },
    ],
    clearGroves: true,
    clear: (x, z) => distToPolyline(x, z, KANARE) < 7 || dist({ x, z }, CAMP) < 16 || dist({ x, z }, HINOKI) < 22 || dist({ x, z }, HOTOKE) < 24 || dist({ x, z }, HONJIN) < 20 || distToPolyline(x, z, ROAD) < 6 || distToPolyline(x, z, SOUTH) < 5,
    trees: 220,
    tufts: 2200,
    treeDensity: (x, z) => (Math.abs(z) < 90 && Math.abs(x) < 150 ? 0.25 : 1),
    fleeOut: (x, z, team) => (team === 1 ? x > 170 || z > 170 : x < -170),
  },

  setup(rt) {
    const F = rt.flags;
    F.stage = 0; F.holdPlayer = true; F.waves = []; F.pursuit = [];
    // 乱戦の中の鉄砲の一発は命の一割までにする（どこから撃たれたか分からぬまま十秒で尽きない。十二の3・BH）
    const takeBullet = rt.player.takeBullet.bind(rt.player);
    rt.player.takeBullet = (amount, src) => Math.min(takeBullet(amount, src), rt.player.u.maxHp * 0.1);
    const me = rt.G?.name || '自分';
    const o = { fullStrength: true, noRout: true, dmgMult: 0.5 };
    // 三好信吉（のちの秀次。中入りの総大将・馬上）と馬廻。天正十二年はまだ三好の名乗り（十の4）
    F.hideG = allyGroup(rt, { ...o, name: '三好信吉の馬廻', anchor: { ...CAMP }, facing: E, width: 5, aggro: 2, seekRange: 4, speed: 4.2, order: 'hold', fixed: true },   // 総大将は馬印の前から動かない
      fl([{ type: 'busho', n: 1, o: { name: '三好信吉', horse: true } }, { type: 'samurai', n: 9 }, { type: 'ashigaru', n: 5, o: { flagScale: 1 } }], 'toyotomi'));
    F.hideU = F.hideG.units.find((u) => u.name === '三好信吉');
    F.hideU.maxHp = F.hideU.hp = 900;
    F.hideU.invuln = true;
    // 連れた兵（主人公の組）
    F.men = allyGroup(rt, { ...o, name: '信吉隊の足軽', anchor: { x: CAMP.x - 6, z: CAMP.z + 10 }, facing: E, width: 5, aggro: 10, speed: 3.9, order: 'hold' },
      fl([{ type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'ashigaru', n: 3 }, { type: 'samurai', n: 2 }, { type: 'gun', n: 2 }], 'toyotomi'));
    // 主人公の組は大将の頭（g.ai）に任せない。ai は order を attack に戻すので、②から付いて来ず白山林に残った（一の5）
    F.menN0 = aliveN(F.men);
    // 秀次隊のほかの手（朝飯の最中。林の中で崩れていく）
    F.camp = allyGroup(rt, { ...o, noRout: false, name: '信吉隊', anchor: { x: CAMP.x + 14, z: CAMP.z - 8 }, facing: E, width: 7, aggro: 9, speed: 3.2, order: 'hold', dmgMult: 0.4 },
      fl([{ type: 'ashigaru', n: 16, o: { flagScale: 1 } }, { type: 'samurai', n: 4 }, { type: 'bow', n: 3 }, { type: 'gun', n: 3 }], 'toyotomi'));
    F.camp.ai = true;
    // 朝飯の最中：林の中の焚き火と煙、屈んで飯を食う兵（二の3。寝込みを突かれる白山林）
    const W = rt.world;
    for (const [dx, dz] of [[10, -12], [20, -4], [4, -2], [16, 6]]) {
      const x = CAMP.x + dx, z = CAMP.z + dz;
      rt.scene.add(campfire(W, x, z)); W.addFire(x, z, { size: 0.5 });
      W.addSmokeColumn(x, W.heightAt(x, z) + 0.6, z, { size: 0.35 });
    }
    for (const u of F.camp.units) u._crouch = true;
    // 檜ヶ根の堀秀政の隊（丘の上で鉄砲を並べる。柵・堀は築いていない：学びの七）
    F.hori = allyGroup(rt, { ...o, name: '堀秀政の手', anchor: { x: HINOKI.x + 4, z: HINOKI.z }, facing: E, width: 12, aggro: 10, speed: 3.4, order: 'hold' },
      fl([{ type: 'busho', n: 1, o: { name: '堀秀政', horse: true } }, { type: 'gun', n: 12 }, { type: 'ashigaru', n: 12, o: { flagScale: 1 } }, { type: 'samurai', n: 5 }], 'hori'));
    F.horiU = F.hori.units.find((u) => u.name === '堀秀政');
    if (F.horiU) F.horiU.invuln = true;
    for (const [dx, dz] of [[-6, -12], [-6, 12]]) rt.scene.add(nobori(W, HINOKI.x + dx, HINOKI.z + dz, 'hori', 5));
    // 御旗山の家康・信雄の本陣（壁の外。陣幕の床几に座り、旗本が前を固める。前に出ない）。金扇の大馬印を高く立てる（学びの十の3）
    KIT.honjin(rt, HONJIN.x, HONJIN.z + 6, { mon: 'tokugawa', fire: false, yoroi: false });
    rt.scene.add(umajirushi(W, HONJIN.x - 4, HONJIN.z - 4, Math.PI, 'ogi'));
    for (const [dx, dz] of [[-12, -6], [8, -8], [20, -4]]) rt.scene.add(nobori(W, HONJIN.x + dx, HONJIN.z + dz, 'tokugawa', 5));
    F.honjin = [campGuard(rt, { x: HONJIN.x - 2, z: HONJIN.z - 8 }, Math.PI, '徳川家康の旗本', 'tokugawa', 34, 'tokugawa'),
      campGuard(rt, { x: HONJIN.x + 24, z: HONJIN.z - 2 }, Math.PI, '織田信雄の旗本', 'oda', 12, 'nobukatsu')];
    rt.obj('main', STAGE_TEXT[1], 'main');
    const L = [['三好信吉', '池田・森の手は岩崎の城を落として先へ進んだ。ここで飯にいたせ', 0.5], [me, '後ろの小牧の家康が、気づかねばよいが……', 3.8],
      ['物見', '徳川勢じゃ！　南の林から来るぞ！', 6.8]];
    for (const [who, s, t] of L) rt.after(t, () => rt.say(who, s, 2.8));
    rt.after(8.6, () => { F.holdPlayer = false; this.stage(rt, 1); });
  },

  stage(rt, n) {
    const F = rt.flags;
    // 果たした段は済んだ目標として残す（「少し前からやり直す」がその段の頭から始まる。五の5）
    if (n > 1) { const id = 'nk' + F.stage; rt.obj(id, STAGE_TEXT[F.stage], 'main', true); rt.objDone(id); }
    F.stage = n; F.st0 = rt.t; F.there = false;
    rt.obj('main', STAGE_TEXT[n], 'main');
    if (n === 1) {
      for (const u of F.camp.units) u._crouch = false;   // 飯を捨てて立ち上がる
      // 大須賀・水野の手が南から、十八秒後に榊原・丹羽の手が北から（挟まれる）
      sfx('horagai', 0.9);
      F.w1 = [0, 1, 2].map((i) => this.wave(rt, { x: CAMP.x - 14 + i * 14, z: CAMP.z + 50 }, 12, CAMP, '大須賀康高の手'));
      this.general(rt, '大須賀康高', { x: CAMP.x, z: CAMP.z + 68 }, null, Math.PI);
      rt.army.play('toki', { x: CAMP.x, z: CAMP.z + 44 }, 1.4);
      F.camp.order = 'attack'; F.camp.seekRange = 16;
      rt.after(18, () => {
        if (F.stage !== 1) return;
        F.w1.push(...[0, 1].map((i) => this.wave(rt, { x: CAMP.x - 10 + i * 18, z: ZN + 8 }, 12, CAMP, '榊原康政の手')));
        this.general(rt, '榊原康政', { x: CAMP.x + 6, z: ZN + 2 }, null, 0);
        rt.army.play('toki', { x: CAMP.x, z: ZN + 14 }, 1.4);
        rt.say('物見', '北からも！　榊原の旗じゃ、挟まれた！', 2.8);
      });
      F.w1N = () => F.w1.reduce((s, g) => s + (g ? g.units.length : 0), 0);
    } else if (n === 2) {
      rt.say('三好信吉', '馬を引け！　ここは捨てる！　檜ヶ根の久太郎の陣へ', 2.8);
      F.hideU.invuln = false;
      // 信吉は堀の陣へ走る（AY の 5）。斬り合いに足を止めない。徳川勢は信吉の首を狙って追う
      F.hideG.fixed = false; F.hideG.order = 'move'; F.hideG.dest = { ...HIDE_STOP }; F.hideG.speed = 5.2; F.hideG.aggro = 0; F.hideG.seekRange = 0;
      F.camp.routed = true; F.camp.order = 'retreat'; F.camp.dest = { x: CAMP.x + 40, z: ZN + 4 };   // 林の奥へ散る
      F.camp.onArrive = () => { for (const u of F.camp.units) if (u.alive) rt.army.despawn(u); };
      for (const g of F.waves) if (live(g) && !g.general) { g.order = 'attack'; g.seekRange = 50; g.focus = F.hideU; }
      rt.after(3.2, () => rt.say('使番', '木下祐久様、お討死！　信吉様の馬も撃たれましてござる', 3));
      rt.after(10, () => { if (F.stage === 2) { this.wave(rt, { x: 80, z: 34 }, 10, null, '水野忠重の手', F.hideU); this.general(rt, '水野忠重', { x: 92, z: 46 }); } });
      rt.after(26, () => { if (F.stage === 2) { this.wave(rt, { x: 50, z: -64 }, 10, null, '丹羽氏次の手', F.hideU); this.general(rt, '丹羽氏次', { x: 60, z: -78 }, null, 0); } });
    } else if (n === 3) {
      rt.say('堀秀政', '鉄砲、構えよ。坂の半ばまで引き付けて撃て！', 2.8);
      F.hideU.invuln = true;
      // 信吉は堀の陣の後ろで息をつく（守る相手が見えない所へ走り去らない）
      F.hideG.order = 'move'; F.hideG.dest = { ...HIDE_STOP }; F.hideG.speed = 5.2;
      F.hideG.onArrive = () => { F.hideG.order = 'hold'; F.hideG.anchor = { ...HIDE_STOP }; };
      for (const g of F.waves) for (const u of g.units) if (u.alive && u.pos.x > 60) rt.army.despawn(u);
      // 榊原の手は南東の香流川を渡り、檜ヶ根の坂を登って来る（白山林からの道は信吉様と連れた兵が走って来るので、その背を突かせない）
      F.w3 = [0, 1, 2].map((i) => this.wave(rt, { x: HINOKI.x + 34 + i * 12, z: HINOKI.z + 62 - i * 6 }, 10, HINOKI, '榊原康政の手'));
      // 坂を登り切るまでは脇の味方に気を取られず、檜ヶ根の丘へ向かう（寄せた所で斬り合う）
      for (const g of F.w3) if (g) { g.order = 'move'; g.dest = { x: HINOKI.x + 10, z: HINOKI.z + 8 }; g.seekRange = 10; g.speed = 3.9; g.dmgMult = 0.3; }
      this.general(rt, '榊原康政', { x: HINOKI.x + 58, z: HINOKI.z + 74 });
      F.w3N = F.w3.reduce((s, g) => s + aliveN(g), 0);
      rt.army.play('toki', { x: HINOKI.x + 40, z: HINOKI.z + 56 }, 1.4);
      F.hori.order = 'attack'; F.hori.seekRange = 26; F.hori.facing = Math.PI / 4;   // 南東の坂へ向く
    } else if (n === 4) {
      rt.say('使番', '南東の御旗山に金扇の馬印！　家康の本隊が池田・森の後ろへ回りましてござる！', 3.4);
      rt.after(3.6, () => rt.say('堀秀政', 'あの金扇は家康じゃ。わしは信吉様を連れて退く。おぬしは南の仏ヶ根の武蔵守の旗へ走れ', 3.4));
      F.hori.order = 'move'; F.hori.dest = { x: EXIT.x + 6, z: EXIT.z + 12 }; F.hori.speed = 3.6;
      F.hideG.order = 'move'; F.hideG.dest = { x: EXIT.x - 4, z: EXIT.z - 6 }; F.hideG.onArrive = () => { F.hideG.order = 'hold'; };
      for (const g of F.waves) for (const u of g.units) if (u.alive) rt.army.despawn(u);
      if (live(F.camp)) for (const u of F.camp.units) if (u.alive) rt.army.despawn(u);
      // 仏ヶ根の池田恒興・元助・森長可（引き返して陣を構えた。本物の兵の枠のため、この段で置く）
      const o = { facing: E, width: 7, aggro: 8, speed: 3.6, order: 'hold', noRout: true, dmgMult: 0.5, fullStrength: true };
      F.ikeG = allyGroup(rt, { ...o, name: '池田恒興の旗本', anchor: { x: HOTOKE.x - 8, z: HOTOKE.z + 18 } },
        fl([{ type: 'busho', n: 1, o: { name: '池田恒興', horse: true } }, { type: 'busho', n: 1, o: { name: '池田元助', horse: true } }, { type: 'samurai', n: 7 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], 'ageha'));
      F.ikeSaki = allyGroup(rt, { ...o, name: '池田の先手', anchor: { x: HOTOKE.x + 6, z: HOTOKE.z + 20 } },
        fl([{ type: 'ashigaru', n: 12, o: { flagScale: 1 } }, { type: 'gun', n: 5 }, { type: 'samurai', n: 2 }], 'ageha'));
      F.moriG = allyGroup(rt, { ...o, name: '森長可の旗本', anchor: { x: HOTOKE.x + 4, z: HOTOKE.z - 6 } },
        fl([{ type: 'busho', n: 1, o: { name: '森長可', horse: true } }, { type: 'samurai', n: 7 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], 'tsuru'));
      F.moriU = F.moriG.units.find((u) => u.name === '森長可');
      for (const u of [...F.ikeG.units, ...F.moriG.units]) if (u.type === 'busho') u.invuln = true;
      // 森の鶴丸と池田の揚羽蝶の幟（どれが「森長可様の旗」か分かるように。十の4）
      for (const [dx, dz, k] of [[2, -12, 'tsuru'], [10, -10, 'tsuru'], [-4, -2, 'tsuru'], [-14, 22, 'ageha'], [-2, 26, 'ageha']]) rt.scene.add(nobori(rt.world, HOTOKE.x + dx, HOTOKE.z + dz, k, 5));
    } else if (n === 5) {
      // 東から井伊の赤備え（正面）、南から家康の旗本の先手（横）。挟まれる
      rt.say('森長可', '家康め、来おったか。鬼武蔵の槍を見せてくれる！', 2.8);
      sfx('horagai', 1);
      for (const g of F.waves) for (const u of g.units) if (u.alive && dist(u.pos, HOTOKE) > 60) rt.army.despawn(u);
      F.aka = [0, 1].map((i) => this.akazonae(rt, { x: HOTOKE.x + 56, z: HOTOKE.z - 14 + i * 22 }, HOTOKE));
      this.general(rt, '井伊直政', { x: HOTOKE.x + 78, z: HOTOKE.z }, AKA);
      for (const g of [F.moriG, F.ikeSaki]) { g.order = 'attack'; g.seekRange = 18; }
      rt.after(14, () => {
        if (F.stage !== 5) return;
        F.side = [0, 1].map((i) => this.wave(rt, { x: HOTOKE.x + 14 + i * 18, z: ZS - 6 }, 12, HOTOKE, '徳川家康の旗本の先手'));
        rt.army.play('toki', { x: HOTOKE.x + 24, z: ZS - 14 }, 1.6);
        rt.say('物見', '南からも金扇の旗本が！　挟まれまする！', 2.8);
      });
      // 仏ヶ根の戦は二分近く（この戦の芯。BA の 1・二の4）。赤備えの新手が二度寄せる
      rt.after(30, () => { if (F.stage === 5) { F.aka.push(this.akazonae(rt, { x: HOTOKE.x + 60, z: HOTOKE.z - 4 }, HOTOKE)); rt.army.play('toki', { x: HOTOKE.x + 50, z: HOTOKE.z }, 1.4); } });
      rt.after(64, () => { if (F.stage === 5) { F.aka.push(this.akazonae(rt, { x: HOTOKE.x + 58, z: HOTOKE.z + 16 }, HOTOKE)); rt.say('物見', '赤備えの新手が東から！', 2.6); } });
      // 森長可の最期：水野の鉄砲足軽（杉山孫六）の一発が眉間に。音と倒れる所を見せ、大きく短く知らせる
      rt.after(50, () => { if (F.stage === 5) { F.moriG.order = 'hold'; rt.say('森長可', '者ども、押せ！　押し返せ！', 2.2); } });
      rt.after(53, () => { if (F.stage === 5) { sfx('volley', 1); this.fall(rt, F.moriG, '森長可', '森武蔵守様、眉間を撃たれお討死！'); rt.banner('森長可　討死', ''); } });
      rt.after(84, () => { if (F.stage === 5) { this.fall(rt, F.ikeG, '池田元助', '之助様、安藤直次に討たれましてござる！'); rt.banner('池田元助　討死', ''); } });
      rt.after(98, () => { if (F.stage === 5) { this.fall(rt, F.ikeG, '池田恒興', '勝入様、永井直勝に討たれましてござる！'); rt.banner('池田恒興　討死', ''); } });
      rt.after(106, () => { if (F.stage === 5) this.stage(rt, 6); });
    } else if (n === 6) {
      rt.say('池田の侍', '殿も之助様も武蔵守様も討たれた！　細ヶ根の堀様の旗まで退け！', 3);
      F.hori.order = 'hold';
      for (const g of [F.moriG, F.ikeG, F.ikeSaki]) if (live(g)) { g.routed = true; g.order = 'retreat'; g.dest = { ...EXIT }; g.onArrive = () => { for (const u of g.units) if (u.alive) rt.army.despawn(u); }; }
      for (const g of F.waves) if (live(g) && !g.general) { g.order = 'attack'; g.seekRange = 40; }
      // 赤備えはすぐ後ろから追い、家康の旗本の先手が香流川の岸で退く道の横を突く（九の2：書いた敵は必ず来る）
      this.pursue(rt, 26);
      // 先手は退く道の上（香流川の渡りの手前と、田の畦の先）に二手。どちらも主人公を狙って寄る
      const P = rt.player.u.pos;
      for (const [k, w, side] of [[0.22, 8, 22], [0.72, 6, 16]]) {
        const cut = this.wave(rt, { x: P.x + (EXIT.x - P.x) * k, z: P.z + (EXIT.z - P.z) * k + side }, w, null, '徳川家康の旗本の先手');
        if (cut) { cut.dmgMult = 0.2; cut.keepFar = true; cut.dest = null; cut.focus = rt.player.u; cut.seekRange = 70; cut.width = 8; cut.facing = E; rt.army.play('toki', cut.anchor, 1.2); }
      }
      F.nextPursuit = rt.t + 14;
    }
  },

  wave(rt, at, n, to, name = '徳川勢', focus, kit) {
    const F = rt.flags;
    if (aliveReal(rt) + n > REAL_CAP) return null;
    const g = enemyGroup(rt, { faction: 'tokugawa', name, anchor: at, facing: W, fleeDir: { x: 1, z: 0 }, width: 4, formation: 'line', morale: 85, dmgMult: 0.42,
      order: 'attack', seekRange: 50, aggro: 14, speed: 3.6, noRout: true, ...(focus ? { focus } : {}) }, foeKnot(n, kit));
    if (to) g.dest = { x: to.x, z: to.z };
    F.waves.push(g);
    return g;
  },
  // 井伊の赤備え：騎馬と侍の多い組
  akazonae(rt, at, to) {
    const F = rt.flags;
    if (aliveReal(rt) + 12 > REAL_CAP) return null;
    const g = enemyGroup(rt, { faction: 'tokugawa', name: '井伊の赤備え', anchor: at, facing: W, fleeDir: { x: 1, z: 0 }, width: 4, formation: 'line', morale: 90, dmgMult: 0.28,
      order: 'attack', seekRange: 60, aggro: 16, speed: 4.2, noRout: true },
    dressT([{ type: 'cavalry', n: 3 }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }, { type: 'gun', n: 2 }], AKA));
    if (to) g.dest = { x: to.x, z: to.z };
    F.waves.push(g);
    return g;
  },
  // 名のある敵の将：馬上で、旗本（侍・足軽・鉄砲）の組に囲まれて、先手の後ろに控える。討てない（AR の 3・4）
  general(rt, name, at, kit, facing = W) {
    if (aliveReal(rt) + 13 > REAL_CAP) return null;
    const g = enemyGroup(rt, { faction: 'tokugawa', name: name + 'の旗本', anchor: { ...at }, facing, width: 5, formation: 'line', morale: 95, dmgMult: 0.4,
      order: 'hold', seekRange: 10, aggro: 6, speed: 3.4, noRout: true },
    dressT([{ type: 'busho', n: 1, o: { name, invuln: true, horse: true } }, { type: 'samurai', n: 5, o: { keep: true } },
      { type: 'ashigaru', n: 5, o: { flagScale: 1 } }, { type: 'gun', n: 2 }], kit || undefined));
    g.general = true;
    rt.flags.waves.push(g);
    return g;
  },
  // 名のある将の討死（史実どおり。将のいなくなった隊は崩れて退く）
  fall(rt, g, name, line) {
    if (!g) return;
    const u = g.units.find((q) => q.name === name && q.alive);
    if (u) { u.invuln = false; rt.army.kill(u); }
    if (line) rt.say('使番', line, 3);
    if (!g.units.some((q) => q.alive && q.type === 'busho')) { g.routed = true; g.order = 'retreat'; g.dest = { ...EXIT }; }
  },
  // 退く段の追手（赤備え）：主人公の後ろ（東）から
  pursue(rt, back = 34) {
    const F = rt.flags, P = rt.player.u.pos;
    const g = this.akazonae(rt, { x: Math.min(XW - 4, P.x + back), z: Math.max(ZN + 6, Math.min(ZS - 6, P.z + (F.pursuit.length % 2 ? 10 : -10))) }, null);
    if (!g) return;
    g.speed = 5.6; g.focus = rt.player.u; g.seekRange = 80; g.dmgMult = 0.2;   // 騎馬の多い赤備えは走る兵より速い（一の8）
    F.pursuit.push(g);
    rt.army.play('toki', g.anchor, 1.2);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.stage) return;
    const P = rt.player.u;
    walls(rt, XW, ZN, ZS);
    const run = F.stage === 2 || F.stage === 4 || F.stage === 6;
    if ((F.menT = (F.menT || 0) - dt) <= 0) {
      F.menT = 0.5;
      // 連れた兵は段の行き先（固定の点）へ隊で走り、着いたらそこで戦う（一の5・九の4）。
      //   自分の位置を毎回の行き先にすると、行き先が変わるたびに合図の待ち（army_signals）が掛かり、白山林に残った
      const c = live(F.men) && F.men.center();
      if (c) {
        const G = GOAL[F.stage], to = { x: G.x - 3, z: G.z + 3 };
        const far = Math.hypot(c.x - to.x, c.z - to.z) > 10;
        // 走る間は斬り合いに足を止めない（aggro 0）。着いたら構えて戦う
        if (far && (F.men.order !== 'move' || F.men.dest?.x !== to.x)) { F.men.order = 'move'; F.men.dest = to; F.men.speed = 5.4; F.men.onArrive = null; F.men.aggro = 0; F.men.seekRange = 0; }
        else if (!far && F.men.order !== 'attack') { F.men.order = 'attack'; F.men.anchor = { ...to }; F.men.aggro = 10; F.men.seekRange = F.stage === 6 ? 6 : 16; }
      }
    }
    if (F.hideU && !F.hideU.alive && F.stage <= 2) return this.lose(rt, '信吉様が討たれた');
    if (rt.t > TIME_UP) return this.lose(rt, '赤備えに囲まれた');
    // 遠く離れた敵は去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - dt) <= 0) {
      F.gcT = 1;
      for (const g of F.waves) if (!g.keepFar) for (const u of g.units) if (u.alive && !u.gone && dist(u.pos, P.pos) > 120) rt.army.despawn(u);
    }
    const el = rt.t - F.st0;
    if (!F.there && dist(P.pos, GOAL[F.stage]) < 14) { F.there = true; F.at0 = rt.t; }
    if (F.stage === 1) {
      // 総大将の秀次は馬印の前から出ない（離れたら馬廻ごと戻る）
      const off = dist(F.hideU.pos, CAMP) > 6;
      if (off !== F.hideOff) { F.hideOff = off; F.hideG.order = off ? 'move' : 'hold'; if (off) F.hideG.dest = { ...CAMP }; }
      const left = F.w1.reduce((s, g) => s + aliveN(g), 0);
      if ((el > 30 && left <= F.w1N() * 0.45) || el > 70) {
        if (F.there) rt.award((t) => t.side.push('白山林で信吉様の馬印を守った'), '白山林で信吉様の馬印を守った');
        this.stage(rt, 2);
      }
    } else if (F.stage === 2) {
      const H = F.hideU, hd = dist(H.pos, HIDE_STOP);
      // 信吉様が着くか、自分が先に着けば（追手の榊原がすぐ坂の下に来る）次へ。遅れても飛ばさない（二の6）
      if (hd < 10 || (F.there && el > 6) || el > 60) {
        if (hd < 10) rt.say('三好信吉', '……助かった。堀の陣じゃ', 2.4);
        else if (F.there) rt.say('堀秀政', '信吉様はすぐ後ろじゃ。坂の下に榊原の旗が見えるぞ！', 2.6);
        if (dist(P.pos, HIDE_STOP) < 30) rt.award((t) => t.side.push('信吉様と檜ヶ根まで走った'), '信吉様と檜ヶ根まで走った', H.pos);
        this.stage(rt, 3);
      }
    } else if (F.stage === 3) {
      // 堀の陣を破られる：徳川の兵が柵の内（西）に八人
      for (const g of F.w3) if (g && g.order === 'move' && live(g) && dist(g.center(), g.dest) < 16) { g.order = 'attack'; g.seekRange = 24; }
      let inside = 0;
      for (const g of F.w3) if (g) for (const u of g.units) if (u.alive && !u.gone && dist(u.pos, HINOKI) < 7) inside++;   // 堀の旗本の真ん中へ十人
      if (inside >= 10) return this.lose(rt, '堀様の陣を破られた');
      const left = F.w3.reduce((s, g) => s + aliveN(g), 0);
      if ((el > 25 && left <= F.w3N * 0.4) || el > 85) {
        rt.say('堀秀政', '押し返したぞ！', 2.2);
        if (F.there) rt.award((t) => t.side.push('檜ヶ根で追手を押し返した'), '檜ヶ根で追手を押し返した');
        this.stage(rt, 4);
      }
    } else if (F.stage === 4) {
      if (F.there || el > 60) {
        if (F.there) rt.say(rt.G?.name || '自分', '武蔵守様！　家康の本隊が後ろに！', 2.6);
        this.stage(rt, 5);
      }
    } else if (F.stage === 5) {
      F.menN0r = Math.max(F.menN0r || 0, aliveN(F.men));
    } else if (F.stage === 6) {
      if (rt.t > F.nextPursuit && F.pursuit.length < 5) { F.nextPursuit = rt.t + 14; this.pursue(rt); }
      if (dist(P.pos, EXIT) < 16) this.win(rt);
    }
  },

  // 討たれた数（両軍の残りの数を減らす）
  onKill(rt, v) {
    const F = rt.flags;
    if (!v || v.isStruct || v.group?.honjin) return;
    if (v.team === 0) F.lostA = (F.lostA || 0) + 1; else F.lostB = (F.lostB || 0) + 1;
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
    F.victoryShown = true;   // 大負けの日に「合戦に勝利」の大きな字を出さない（二の2）
    rt.award((t) => t.side.push(`兵${aliveN(F.men)}人を連れて退いた`), '兵を連れて退いた');
    rt.banner('長久手の負け', '兵を連れて退いた');
    rt.say('堀秀政', '勝入殿も之助も武蔵守も討たれた。よう生きて戻った', 3);
    rt.after(3.2, () => rt.say('使番', '本多忠勝、わずかな兵で殿の本隊の前に立ちはだかり、家康は小幡城へ入りましてござる', 3.6));
    rt.after(7.2, () => rt.say('羽柴秀吉', '家康は、戦では勝てぬ男よ', 3));
    rt.after(10.4, () => rt.say('羽柴秀吉', 'ならば信雄殿と和を結び、家康が出て来ずにおれぬようにしてやる', 3.6));
    rt.finish({ scriptedEnd: true }, 15);
  },

  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.stage) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const t = GOAL[F.stage];
    const run = F.stage === 2 || F.stage === 4 || F.stage === 6 || Math.hypot(t.x - u.pos.x, t.z - u.pos.z) > 14;
    const ahead = (o) => ok(o) && (F.stage !== 6 || o.pos.x < u.pos.x + 0.5);
    const e = b.army.nearestEnemy(u, run ? 2.6 : 10, ahead);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    goTo(p, inp, t.x, t.z, 2);
    if (run) inp.runHeld = true;
  },
};
t03b_nagakute.sides = { a: { name: '羽柴勢（中入り）', mon: 'toyotomi' }, b: { name: '徳川・織田信雄勢', mon: 'tokugawa' } };
// 兵の数（言い伝え）：中入りは池田・森・堀・信吉のおよそ二万。白山林・檜ヶ根は信吉 九千・堀 三千 対 先に出た水野・丹羽・大須賀・榊原らおよそ四千五百。
// 仏ヶ根は池田・森 およそ八千 対 家康・信雄・井伊 およそ九千三百（docs/battle_learn/t03b_nagakute.md の二）。
// 両軍の残りは、目の前で討たれた一人を本当の数の六十人ほどに数えて減らす（十二の1）
t03b_nagakute.force = (rt) => {
  const F = rt?.flags || {}, s = F.stage ?? 0, la = (F.lostA || 0) * 60, lb = (F.lostB || 0) * 60;
  if (s >= 6) return { a: Math.max(2500, 8000 - la * 0.5), a0: 20000, b: Math.max(6000, 13800 - lb), b0: 13800 };
  if (s >= 4) return { a: Math.max(4000, 20000 - 2500 - la), a0: 20000, b: Math.max(6000, 13800 - lb), b0: 13800 };
  return { a: Math.max(9000, 20000 - la), a0: 20000, b: Math.max(3000, 13800 - lb), b0: 13800 };
};
t03b_nagakute.date = () => '天正十二年四月九日　朝・初夏';
t03b_nagakute.history = '小牧で家康とにらみ合う中、池田恒興の策で、池田恒興・元助、森長可、堀秀政、三好信吉（秀吉の甥。のちの羽柴秀次）のおよそ二万が、家康の留守の三河を突こうと東へ回り込んだ（中入り）。家康はこれを知って小牧山を出て追い、四月九日の朝、白山林で休んでいた信吉の隊を後ろと横から襲って崩した。信吉は馬を失いながら逃れた。堀秀政は檜ヶ根で鉄砲を揃えて追手を押し返したが、御旗山に家康の金扇の馬印を見て、家康の本隊が池田・森の後ろへ回ったと知って退いた。家康と信雄は御旗山に本陣を置き、井伊直政の赤備えらを前に出した。長久手で池田・森の勢は前と横から押し包まれ、森長可は眉間を撃たれ、池田元助は安藤直次に、恒興は永井直勝に討たれた。秀吉は戦では家康に勝てず、この年の十一月に信雄と和睦し、家康とも手を結んだ。白山林・檜ヶ根・仏ヶ根の間隔と向きは縮めた復元で、主人公の組の動きは遊びのための筋書き。';
t03b_nagakute.famous = [];
t03b_nagakute.botGuardFlee = (b) => b.flags.stage === 2 || b.flags.stage === 4 || b.flags.stage === 6;
t03b_nagakute.botEvacuating = (b) => b.flags.stage === 6;
// 目標の並び（goals5.js）。段の一行は行いと場所で書く（AR の 1・AW の 3）
const st = (n) => (rt) => (rt.flags.stage ?? 0) >= n;
STAGES.t03b_nagakute = [[STAGE_TEXT[1]], [STAGE_TEXT[2], st(2)], [STAGE_TEXT[3], st(3)], [STAGE_TEXT[4], st(4)], [STAGE_TEXT[6], st(6)]];
withGuard(t03b_nagakute);

export { t03b_nagakute };
export default t03b_nagakute;
