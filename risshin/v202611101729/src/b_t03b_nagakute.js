// ======================================================================
// 豊臣編　小牧・長久手 二（長久手の戦い・天正十二年四月九日）。調べは docs/battle_refs/t03_komaki.md。
// 小牧の対陣（b_t03_komaki.js）の続き。AR の 2（kaito 11/3）：三河中入りの羽柴秀次隊が白山林で襲われ、
// 堀秀政が檜ヶ根で押し返して退き、仏ヶ根で池田恒興・元助・森長可が家康の勢に押し包まれて討たれる。羽柴方には非常に苦しい戦。
// 天正十二年の秀次はまだ三好信吉（孫七郎）と名乗る（十4）。画面の名と台詞は「三好信吉」「信吉様」。
// ①白山林：朝飯の最中（鍋の火・腰を下ろした兵）、東の後ろと北の横から挟まれる。信吉様の馬印の前で寄せる徳川勢を押し返す
// ②信吉様と西の檜ヶ根の堀秀政様の陣まで走る（連れた兵も駆け足で付いて来る。着けばすぐ③）
// ③檜ヶ根の丘で、坂を登る榊原の手を通さない（堀の鉄砲が撃つ。柵は史料に無いので置かない・battle_learn 七）
// ④御旗山に家康の金扇の馬印が立ち、堀様は退く。南の仏ヶ根の森長可様の鶴丸の旗まで走る
// ⑤仏ヶ根の森長可様の旗の前で、東の井伊の赤備えを食い止める。北東の御旗山から家康の旗本の先手、東から水野の鉄砲も寄せ、挟まれる。森・池田父子が討たれる
// ⑥西の細ヶ根の堀秀政様の旗まで退く（赤備えが後ろと横から追う）
// 負け：堀の陣を破られる・刻限・自分の深手。連れた兵が討たれても負けにしない（十一1）。目標の場所へ着く前は時間だけで達成にしない。
// 家康と信雄は④から御旗山（香流川の南の低い丘）の本陣。金扇の馬印の下、陣幕の床几に座り、旗本に守られ前に出ない（AR の 3・AV の 7）。
// 名のある敵の将（大須賀康高・榊原康政・水野忠重・丹羽氏次・井伊直政）は馬上で旗本の組に囲まれ、先手の後ろに控える（討てない・AR の 4）。
// 向き：西（−x）が退く道、東（+x）が白山林、中ほどの丘が檜ヶ根、南（+z）が仏ヶ根・長久手。間隔は縮めた復元。行き先は段ごとに固定（AW の 3）。
// 地形：国土地理院の標高（asset_dem_nagakute.js）の尾根と谷を、道と戦う床から離れた所へ足す。
// ======================================================================
import { useTerrain, BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demDetail } from './dem.js';
import { enemyGroup, allyGroup, gauss } from './bhelp.js';
import { distToPolyline } from './world.js';
import { nabe, umajirushi, nobori } from './props.js';
import { sfx } from './audio.js';
import { withGuard } from './toyo_bot.js';
import { STAGES } from './stages.js';
import { KIT } from './b_nagashinojo.js';
import { TOKU, fl, dressT, foeKnot, live, aliveN, aliveReal, dist, walls } from './b_t03_komaki.js';
// 15分の段（kaito 11/8 夜 docs/toyo15_plan_1108.md）：段の中身は t03b_nagakute/ に
import * as March from './t03b_nagakute/march.js';
import * as Ikeda from './t03b_nagakute/ikeda.js';
import * as Retreat from './t03b_nagakute/retreat.js';
import { T03B_DEPTH } from './t03b_nagakute/depth.js';

// 通常の深手による終戦も、戦の側の敗北と同じく予約を止める。
const stopped = (rt) => !!(rt.flags.ending || rt.over || rt.player?.u?.alive === false);

const XW = 158, ZN = -120, ZS = 120;
const ROAD = [[156, -30], [112, -26], [64, -18], [12, -10], [-50, -14], [-110, -18], [-156, -22]];
const SOUTH = [[12, -10], [24, 30], [34, 72]];       // 檜ヶ根から仏ヶ根へ下る道
const CAMP = { x: 112, z: -26 };                     // 白山林の秀次の陣
const HINOKI = { x: 12, z: -10 };                    // 檜ヶ根（堀秀政の陣）
const HIDE_STOP = { x: -2, z: -14 };                 // 秀次が堀隊の後ろで息をつく所
const HOTOKE = { x: 34, z: 76 };                     // 仏ヶ根（池田・森の陣）
const EXIT = { x: -130, z: -20 };                    // 細ヶ根の堀秀政の殿
const HONJIN = { x: 82, z: 50 };                     // 御旗山（富士ヶ根）の家康・信雄の本陣。檜ヶ根と仏ヶ根の間へ割り込んだ低い丘（battle_learn 四）
// 香流川：檜ヶ根・色金山の側（北）と、御旗山・仏ヶ根の側（南）を分ける小さな川。谷の底を流れ、岸は坂（八3）
const KANAREGAWA = [[160, 30], [96, 26], [50, 21], [20, 20], [-40, 25], [-100, 21], [-160, 27]];
// 仏ヶ根の西の低い田（長久手の谷あいの田。畦で区切る）
function paddy(x, z) {
  if (x < -96 || x > -18 || z < 50 || z > 108) return 0;
  const ex = Math.abs(x - Math.round(x / 22) * 22), ez = Math.abs(z - Math.round(z / 18) * 18);
  return Math.max(0, Math.min(1, (Math.min(ex, ez) - 1.1) / 0.8)) * 0.7;
}
const REAL_CAP = 236;
const TIME_UP = 1500;   // 15分の構成（11/8 夜）で刻限を延ばした
// 井伊の赤備え：朱の具足と、赤地に井桁の旗（ii）
// 11/8 critic60（八1・九6「つるつるの橙色のおもちゃの人形。陣笠も胴も同じ一色」）：胴は深い朱漆、小袖は煤けた茶、威は明るい緋で段を分ける
const AKA = { armor: 0x641610, cloth: 0x3a2a22, lace: 0x9a2e20, flag: 'ii' };
// 榊原・水野の旗（その家の紋）
const SAKA = { ...TOKU, flag: 'sakakibara' }, MIZU = { ...TOKU, flag: 'mizuno' };
const W = -Math.PI / 2, E = Math.PI / 2;   // 西向き・東向き

// 本陣の陣幕の前を囲む旗本。動かず、討てない（壁の外なので数えない）
function campGuard(rt, at, facing, name, flag, n, faction, lord) {
  const list = [...(lord ? [{ type: 'busho', n: 1, o: { name: lord, keep: true } }] : []), { type: 'samurai', n: Math.round(n * 0.45), o: { keep: true } }, { type: 'ashigaru', n: Math.round(n * 0.35), o: { flagScale: 1, keep: true } }, { type: 'gun', n: Math.round(n * 0.2), o: { keep: true } }];
  const g = enemyGroup(rt, { name, anchor: { ...at }, facing, width: 10, formation: 'line', aggro: 3, seekRange: 6, order: 'hold', fixed: true, noRout: true, morale: 99, faction },
    dressT(fl(list, flag)));
  g.honjin = true;
  for (const u of g.units) { u.invuln = true; u.noTarget = true; if (lord && u.name === lord) { u.mustLive = true; u._crouch = true; u._nest = true; u.backSayT = Infinity; } }   // 名将の一騎打ちの判断にも割り込ませず、床几に留める
  return g;
}

// 水野の鉄砲組の一人の居場所（森長可を撃つ音の出所）
function F_GUN_U(rt) {
  const g = rt.flags.mizunoGun;
  return (g && g.units.find((q) => q.alive && !q.gone && q.type === 'gun')) || null;
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
  h += 7 * gauss(x, z, HONJIN.x, HONJIN.z + 8, 700);          // 御旗山（家康の本陣）
  h -= 2 * gauss(x, z, 70, 80, 3000);                         // 長久手の低地
  const kd = distToPolyline(x, z, KANAREGAWA);
  h -= 1.6 * Math.exp(-kd * kd / 160);                        // 香流川の谷（岸は坂）
  return h;
}
function height(x, z) {
  if (!heightFixed) { heightFixed = true; heightDem = nkDem; }
  let h = heightBase(x, z);
  if (heightDem) {
    const away = Math.max(0, Math.min(1, (Math.min(distToPolyline(x, z, ROAD), distToPolyline(x, z, SOUTH), dist({ x, z }, HOTOKE) - 16, distToPolyline(x, z, KANAREGAWA) - 6) - 18) / 16));
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
  '羽柴勢を退かせ、西の細ヶ根の堀様の旗まで退く'];
// 15分の段で足した段（①の前の行軍・⑤の後の池田勝入の救い）
const BAN_TEXT = '三河への道で徳川方の番所を焼く', IKE_TEXT = '仏ヶ根の池田勝入様の旗本へ駆けつける';
const textOf = (n) => (n === 0.5 ? BAN_TEXT : n === 5.5 ? IKE_TEXT : STAGE_TEXT[n]);
// 段ごとの行き先（固定。人の動きに付いて動かさない・AW の 3）
// 仏ヶ根は森と元助の間。将が持ち場から八歩動いても、到着範囲の全体が両者の三十五歩以内に収まる。
// 森の北で到着扱いにすると、印が消えたまま元助の最期を待ち続ける位置ができる。
const GOAL = [null, { x: CAMP.x - 6, z: CAMP.z + 2 }, HIDE_STOP, { x: HINOKI.x + 12, z: HINOKI.z }, { x: HOTOKE.x + 6, z: HOTOKE.z + 8 }, { x: HOTOKE.x + 6, z: HOTOKE.z + 8 }, EXIT];
// 到着と印を消す距離をそろえる。細ヶ根は退き切ったと認める距離に合わせる。
const GOAL_R = [0, 14, 14, 14, 12, 12, 16];
const goalOf = (n) => (n === 0.5 ? March.BANSHO : n === 5.5 ? Ikeda.at(null, HOTOKE) : GOAL[n]);
const goalR = (n) => (n === 0.5 || n === 5.5 ? 14 : GOAL_R[n]);
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

const t03b_nagakute = {
  flagEra: { sakakibara: '榊原の日輪無' }, // 東博の康政像の日輪と無（当日の使用は復元）
  spawn: { x: 0, z: -12, heading: E },   // 中入りの列の中（西の道）。白山林の陣へ追い付き、番所へ
  minutes: 15,
  expectMin: 15,
  depth: T03B_DEPTH,   // 軍勢の厚み・陣立て（t03b_nagakute/depth.js）
  lethal: { max: 2, firstAt: 200, gap: 120 },   // 命懸けの戦場（docs/lethal_howto.md）。森・池田父子の死は筋書きの fall のまま
  fearKind: { kind: 'ambushed_column', note: '追う側から追われる側へ。前と横から押し包まれる', w: { flank: 1.6, losses: 1.3, routed: 1.4, iso: 1.3 }, line: '押し包まれるぞ！' },
  compactIntro: true,
  introText: () => '三河へ回り込む中入りの列。白山林の東の徳川の番所を焼き、道を開く。',
  introSides: { a: '羽柴勢　二万', b: '徳川・信雄勢　一万四千' },   // 五4：始まりの札に味方対敵の数（battle_learn 二）
  // 七件を順番に保ち、今する目標から五件を表示。終盤は済んだ印も残す。
  goalVisibleRows: 5,
  goalRowsAhead: true,
  hideGuideSteps: true,
  hideMissionDots: true,
  enemyTriangleSigns: true,
  // 討てない本陣の兵にも敵の所属印を付ける。前へ出さず、攻撃の対象にも戻さない。
  foeMarkVisible: (rt, u) => !!(u.group?.honjin || u.group?.general),
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
  playerTaken: 0.35,   // 仏ヶ根の挟み撃ちで十秒で倒れない（十二3）
  meleeGrace: { rate: 0.04, burst: 0.2, interval: 1.8 },   // 囲まれても刃の傷は一息ごと（同じ刻みに二太刀を受けて倒れない・十二3）
  playerRegen: 0.025,
  botDefendsFort: true,
  closeCombatAssist: true,
  noWinCrane: true,
  // 主目標の字は一つを更新するため、やり直しの写しは果たした段の数で残す。
  retryGoalCount: (rt) => { const n = rt.flags.stage || 0; return n >= 6 ? 6 : n >= 5.5 ? 5 : n >= 4 ? 4 : n >= 1 ? Math.floor(n) : 0; },
  onPlayerHit(rt, target) {
    if (target.team !== rt.player.u.team && (rt.flags.stage === 1 || rt.flags.stage === 3)) rt.flags.defended = true;
  },
  // 目標の五つ（史実の順）。④は仏ヶ根へ走って赤備えを食い止める一つの目標（中で二段）
  goals5(rt) {
    const F = rt.flags, won = () => rt.tracker?.main === true, at = (n) => () => (dist(rt.player.u.pos, goalOf(n)) < goalR(n) ? null : { x: goalOf(n).x, z: goalOf(n).z }), past = (n) => () => won() || (F.stage || 0) >= n;
    return [
      { kind: 'stage', k: 0, text: BAN_TEXT, noun: '徳川の番所', place: at(0.5), check: past(1) },
      { kind: 'stage', k: 1, text: STAGE_TEXT[1], noun: '信吉様の馬印', place: at(1), check: past(2) },
      { kind: 'stage', k: 2, text: STAGE_TEXT[2], noun: '堀秀政様の陣', place: at(2), check: past(3) },
      { kind: 'stage', k: 3, text: STAGE_TEXT[3], noun: '檜ヶ根の丘', place: at(3), check: past(4) },
      { kind: 'stage', k: 4, text: STAGE_TEXT[4], noun: '森長可様の旗', place: at(4), check: past(5.5) },
      { kind: 'stage', k: 5, text: IKE_TEXT, noun: '池田勝入様の旗本', place: at(5.5), check: past(6) },
      { kind: 'stage', k: 6, text: STAGE_TEXT[6], noun: '堀秀政様の旗', place: at(6), check: won },
    ];
  },
  missionPin(rt) {
    const F = rt.flags;
    if (!F.stage || F.ending) return null;
    const p = goalOf(F.stage);
    // 着いた行き先の▼は消す（空に浮いたまま残さない・九1）。離れればまた出す
    if (dist(rt.player.u.pos, p) < goalR(F.stage)) return null;
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.stage === 6 ? 10 : 8;
    return PIN;
  },
  world: {
    seed: 15840,
    noGroundArrows: true,   // 11/8 critic60（八1・BL5「槍や矢が宙で横になったまま・宙から刺さったように残る」）：遠くの乱戦の矢を着地で消す
    time: 'morning',
    // 11/8 陣立ての見せ場（霧を薄く）：mist は値によらず有れば朝靄を一揃え掛け、林の向こうの大須賀・榊原の備も檜ヶ根の堀の陣も白く消えていた。
    //   朝靄は地を這う薄い霧だけ残し、見通しを百二十歩へ（天正十二年四月九日の白山林は夜明け後の奇襲）
    mist: 0, groundMistScale: 0.35, battleViewDistance: 120,
    mountainScale: 0.3, mountainHaze: 0.75,   // 尾張東部の低い丘陵。遠くの山は低く霞ませる（四5）
    groundHalf: 220,
    height,
    paddy,
    streams: [{ pts: KANAREGAWA, w: 2.4, depth: 0.4 }],
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
      { x: HONJIN.x + 30, z: HONJIN.z + 26, r: 16, n: 30 },
    ],
    clearGroves: true,
    clear: (x, z) => dist({ x, z }, CAMP) < 16 || dist({ x, z }, HINOKI) < 22 || dist({ x, z }, HOTOKE) < 24 || dist({ x, z }, HONJIN) < 20 || distToPolyline(x, z, ROAD) < 6 || distToPolyline(x, z, SOUTH) < 5,
    trees: 220,
    tufts: 2200,
    treeDensity: (x, z) => (Math.abs(z) < 90 && Math.abs(x) < 150 ? 0.25 : 1),
    fleeOut: (x, z, team) => (team === 1 ? x > 170 || z > 170 : x < -170),
  },

  setup(rt) {
    // 任務は右上の五件で伝える。中央へ同じ文を重ねず、横向きの携帯でも戦場を空ける。
    if (typeof document !== 'undefined' && !document.getElementById('nagakute-hud')) {
      const st = document.createElement('style'); st.id = 'nagakute-hud';
      st.textContent = `
html:root body #hud:has(#h-prog[data-battle="t03b_nagakute"]) #center-call .cc.blue { display:none !important; }
html:root body #hud:has(#h-prog[data-battle="t03b_nagakute"]) #center-call { left:34vw; right:auto; top:calc(48px + env(safe-area-inset-top,0px)); width:28vw; }
html:root body #hud:has(#h-prog[data-battle="t03b_nagakute"]) #center-call .cc { max-width:100%; box-sizing:border-box; padding:4px 6px; font-size:16px; line-height:1.35; letter-spacing:0; }
@media(max-height:500px) {
 html:root body #hud#hud#hud.battle-order #h-prog#h-prog[data-battle="t03b_nagakute"].goal-mode { padding:4px 6px !important; }
 html:root body #hud#hud#hud.battle-order #h-prog#h-prog[data-battle="t03b_nagakute"].goal-mode .pg-goals li { font-size:max(12px,calc(12px * var(--text-scale,1))) !important; }
 html:root body #hud#hud#hud.battle-order #h-prog#h-prog[data-battle="t03b_nagakute"].goal-mode .pg-goals li.now { font-size:max(16px,calc(16px * var(--text-scale,1))) !important; }
}`;
      document.head.appendChild(st);
    }
    const F = rt.flags;
    F.stage = 0; F.holdPlayer = true; F.waves = []; F.pursuit = [];
    const me = rt.G?.name || '自分';
    const o = { fullStrength: true, noRout: true, dmgMult: 0.5 };
    // 三好信吉（後の羽柴秀次。中入りの総大将・馬上）と馬廻
    F.hideG = allyGroup(rt, { ...o, name: '三好信吉の馬廻', anchor: { ...CAMP }, facing: E, width: 5, aggro: 2, seekRange: 4, speed: 4.2, order: 'hold', fixed: true },   // 総大将は馬印の前から動かない
      fl([{ type: 'busho', n: 1, o: { name: '三好信吉', horse: true } }, { type: 'samurai', n: 9 }, { type: 'ashigaru', n: 5, o: { flagScale: 1 } }], 'toyotomi'));
    F.hideU = F.hideG.units.find((u) => u.name === '三好信吉');
    F.hideU.maxHp = F.hideU.hp = 900;
    F.hideU.invuln = true;
    // 連れた兵（主人公の組）は中入りの列の主人公のそばから出る。白山林に置くと百歩以上離れて始まる。
    F.men = allyGroup(rt, { ...o, name: '信吉隊の足軽', anchor: { x: rt.player.u.pos.x - 4, z: rt.player.u.pos.z + 4 }, facing: E, width: 5, aggro: 10, speed: 3.9, order: 'hold' },
      fl([{ type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'ashigaru', n: 3 }, { type: 'samurai', n: 2 }, { type: 'gun', n: 2 }], 'toyotomi'));
    // 主人公の組は追従と近場の防衛に専念し、共通の判断で別の前線へ向かわせない。
    F.men.noAI = true;
    F.menN0 = aliveN(F.men);
    // 秀次隊のほかの手（朝飯の最中。林の中で崩れていく）
    F.camp = allyGroup(rt, { ...o, noRout: false, name: '信吉隊', anchor: { x: CAMP.x + 14, z: CAMP.z - 8 }, facing: E, width: 7, aggro: 9, speed: 3.2, order: 'hold', dmgMult: 0.4 },
      fl([{ type: 'ashigaru', n: 16, o: { flagScale: 1 } }, { type: 'samurai', n: 4 }, { type: 'bow', n: 3 }, { type: 'gun', n: 3 }], 'toyotomi'));
    F.camp.ai = true;
    // 朝飯の最中：林の中に炊事の鍋の火と煙。兵は腰を下ろして休む（寄せが来て立つ・二3）
    if (rt.scene && rt.world) for (const [dx, dz] of [[16, -12], [26, -4], [12, -22], [24, -20]]) rt.scene.add(nabe(rt.world, CAMP.x + dx, CAMP.z + dz));
    for (const g of [F.camp, F.men, F.hideG]) for (const u of g.units) if (u.type !== 'busho' && !u.mounted && !u.stdHeld) u._crouch = true;
    // 檜ヶ根の堀秀政の隊（丘の上で鉄砲を並べる。柵・堀を築いた記述は無いので置かない・battle_learn 七）
    F.hori = allyGroup(rt, { ...o, name: '堀秀政の手', anchor: { x: HINOKI.x + 4, z: HINOKI.z }, facing: E, width: 12, aggro: 10, speed: 3.4, order: 'hold' },
      fl([{ type: 'busho', n: 1, o: { name: '堀秀政', horse: true } }, { type: 'gun', n: 12 }, { type: 'ashigaru', n: 12, o: { flagScale: 1 } }, { type: 'samurai', n: 5 }], 'hori'));
    F.horiU = F.hori.units.find((u) => u.name === '堀秀政');
    if (F.horiU) F.horiU.invuln = true;
    rt.obj('main', BAN_TEXT, 'main');
    const L = [[me, '後ろの小牧の家康が、気づかねばよいが……', 8.4],
    ];
    for (const [who, s, t] of L) rt.after(t, () => { if (!stopped(rt)) rt.say(who, s, 2.8); });
    rt.after(1.2, () => { if (!stopped(rt)) { F.holdPlayer = false; this.stage(rt, 0.5); } });
  },

  stage(rt, n) {
    const F = rt.flags;
    if (stopped(rt)) return;   // 敗北後の予約から次の段を始めない
    F.stage = n; F.st0 = rt.t; F.there = false; F.defended = false;
    F.guardTime = 0; F.guardShown = -1;
    rt.obj('main', textOf(n), 'main');
    rt.objProgress('main', '');
    if (n === 0.5) { March.start(rt, this.ctx(rt)); return; }
    if (n === 5.5) { Ikeda.start(rt, this.ctx(rt)); return; }
    if (n === 1) {
      F.hideHome = { x: F.hideU.pos.x, z: F.hideU.pos.z };
      // 奇襲の声で朝飯をやめて立つ。描画を省く流しでも、休む姿勢を戦いへ持ち越さない。
      for (const g of [F.camp, F.men, F.hideG]) for (const u of g.units) if (u.alive) u._crouch = false;
      // 布陣図どおり：大須賀の手が後ろ（東・行軍の来た道の林）から、十八秒後に榊原の手が横（北）から（挟まれる）。水野・丹羽は②で後ろから続く
      sfx('horagai', 0.9);
      F.w1 = [0, 1, 2].map((i) => this.wave(rt, { x: CAMP.x + 38, z: CAMP.z - 12 + i * 14 }, 12, CAMP, '大須賀康高の手')).filter(Boolean);
      this.general(rt, '大須賀康高', { x: CAMP.x + 42, z: CAMP.z + 22 }, null, W);
      rt.army.play('toki', { x: CAMP.x + 34, z: CAMP.z }, 1.4);
      F.camp.order = 'attack'; F.camp.seekRange = 16;
      rt.after(18, () => {
        if (stopped(rt) || F.stage !== 1) return;
        F.w1.push(...[0, 1].map((i) => this.wave(rt, { x: CAMP.x - 10 + i * 18, z: ZN + 8 }, 12, CAMP, '榊原康政の手', null, SAKA)).filter(Boolean));
        this.general(rt, '榊原康政', { x: CAMP.x + 6, z: ZN + 2 }, SAKA, 0);
        // 五十五秒で丹羽氏次の手も後ろ（東）から続く。横（北）から襲う榊原の手と挟む（布陣図）。
        rt.after(37, () => { if (!stopped(rt) && F.stage === 1) { const g = this.wave(rt, { x: CAMP.x + 38, z: CAMP.z + 20 }, 10, CAMP, '丹羽氏次の手'); if (g) { F.w1.push(g); rt.say('物見', '東の後ろから丹羽の手も！　後ろの組が崩れるぞ！', 2.6); } } });
        rt.army.play('toki', { x: CAMP.x, z: ZN + 14 }, 1.4);
        rt.say('物見', '北の横からも！　榊原の旗じゃ、挟まれた！', 2.8);
      });
      F.w1N = () => F.w1.reduce((s, g) => s + (g ? g.units.length : 0), 0);
    } else if (n === 2) {
      rt.say('三好信吉', '馬を引け！　ここは捨てる！　檜ヶ根の久太郎の陣へ', 2.8);
      // 史実の信吉は馬を失いながら逃れた。遅れて討たれ、主人公のせいでなく負けにしない（十一1）
      F.hideU.invuln = true;
      // 信吉は堀の陣へ駆ける（AY の 5）。馬廻は斬り合いに留まらず縦に駆ける。徳川勢は信吉の首を狙って追う
      F.hideG.fixed = false; F.hideG.order = 'move'; F.hideG.dest = { ...HIDE_STOP }; F.hideG.speed = 4.4; F.hideG.march = true; F.hideG.aggro = 1;
      F.camp.routed = true; F.camp.order = 'retreat'; F.camp.dest = { x: CAMP.x + 40, z: ZN + 4 };   // 林の奥へ散る
      F.camp.onArrive = () => { for (const u of F.camp.units) if (u.alive) rt.army.despawn(u); };
      // 後ろ（東）から寄せた徳川勢は信吉の首を狙って追うが、足軽の足で馬上の信吉と馬廻には追いつかない（白山林で揉み合いに留めない）
      //   寄せた手はまず崩れた陣の兵と荷に掛かり（八秒）、それから信吉を追う。その間に信吉・馬廻・主人公が揉み合いを抜ける
      for (const g of F.waves) if (live(g) && !g.general) { const al = g.units.filter((q) => q.alive); if (al.length) g.anchor = { x: al.reduce((s, q) => s + q.pos.x, 0) / al.length, z: al.reduce((s, q) => s + q.pos.z, 0) / al.length }; g.order = 'hold'; g.seekRange = 3; g.speed = Math.min(g.speed || 3.6, 3.1); }
      for (const u of F.hideG.units) if (u.alive) { u.target = null; u.watch = null; }
      rt.after(8, () => { if (stopped(rt) || F.stage !== 2) return; for (const g of F.waves) if (live(g) && !g.general && g.order === 'hold') { g.order = 'attack'; g.seekRange = 50; g.focus = F.hideU; } });
      for (const g of F.waves) if (live(g) && g.general) { g.order = 'hold'; g.seekRange = 4; }
      rt.after(3.2, () => { if (!stopped(rt) && F.stage === 2) rt.say('使番', '木下祐久様、お討死！　信吉様の馬も撃たれましてござる', 3); });
      rt.after(10, () => { if (!stopped(rt) && F.stage === 2) { this.wave(rt, { x: CAMP.x + 30, z: CAMP.z + 20 }, 10, null, '水野忠重の手', F.hideU, MIZU); this.general(rt, '水野忠重', { x: CAMP.x + 40, z: CAMP.z + 30 }, MIZU); } });
      rt.after(26, () => { if (!stopped(rt) && F.stage === 2) { this.wave(rt, { x: CAMP.x + 24, z: CAMP.z - 18 }, 10, null, '丹羽氏次の手', F.hideU); this.general(rt, '丹羽氏次', { x: CAMP.x + 34, z: CAMP.z - 28 }, null, 0); } });
    } else if (n === 3) {
      rt.say('堀秀政', '鉄砲、構えよ。坂の半ばまで引き付けて撃て！', 2.8);
      // 信吉は堀の陣の後ろで息をつく（守る相手が先へ去らない）。④で堀と共に西へ退く
      F.hideU.invuln = true;
      F.hideG.order = 'move'; F.hideG.dest = { ...HIDE_STOP };
      F.hideG.onArrive = (g) => { g.march = false; g.order = 'hold'; g.fixed = true; };
      for (const g of F.waves) for (const u of g.units) if (u.alive && u.pos.x > 60) rt.army.despawn(u);
      // 白山林で崩れた信吉隊は林の奥へ散った（見えない所の兵を残すと、崩れては戻るを繰り返して札が続く）
      if (live(F.camp)) for (const u of F.camp.units) if (u.alive) rt.army.despawn(u);
      // 榊原の手は南東の香流川を渡り、檜ヶ根の坂を登って来る（白山林からの道は信吉様と連れた兵が走って来るので、その背を突かせない。
      //   同じ日に別の係が見つけた形・11/6 fixc1753 の版から取り込み）。着いてすぐ見える四十〜六十 m に
      F.w3 = [0, 1, 2].map((i) => this.wave(rt, { x: HINOKI.x + 34 + i * 12, z: HINOKI.z + 52 - i * 6 }, 9, HINOKI, '榊原康政の手', null, SAKA)).filter(Boolean);
      this.general(rt, '榊原康政', { x: HINOKI.x + 56, z: HINOKI.z + 62 }, SAKA, -Math.PI * 0.75);
      F.hori.facing = Math.PI / 4;   // 南東の坂へ向く
      F.w3N = F.w3.reduce((s, g) => s + aliveN(g), 0);
      //   四十五秒で榊原の二の手が坂の下から登り直す（押し返す山を二つに）
      rt.after(45, () => {
        if (stopped(rt) || F.stage !== 3) return;
        const g = this.wave(rt, { x: HINOKI.x + 46, z: HINOKI.z + 40 }, 10, HINOKI, '榊原康政の手', null, SAKA);
        if (g) { F.w3.push(g); F.w3N += aliveN(g); rt.army.play('toki', { x: HINOKI.x + 46, z: HINOKI.z + 40 }, 1.2); rt.say('物見', '榊原の二の手が登って来る！', 2.6); }
      });
      rt.army.play('toki', { x: HINOKI.x + 64, z: HINOKI.z }, 1.4);
      // 堀の手は丘の上に留まり、鉄砲は届く敵を撃ち、槍は登って来た敵とだけ打ち合う（坂を下りて散らばらない・二の1）
      F.hori.order = 'hold'; F.hori.aggro = 7; F.hori.seekRange = 8;
    } else if (n === 4) {
      // 家康の本隊が御旗山（檜ヶ根と仏ヶ根の間）に金扇の馬印を立てる。堀はそれを見て退く（battle_learn 四・十の3）
      this.honjinUp(rt);
      rt.say('使番', '御旗山に金扇の馬印！　家康の本隊が池田・森の後ろへ回っておりまする！', 3.2);
      rt.after(3.4, () => { if (!stopped(rt) && F.stage === 4) rt.say('堀秀政', 'あの金扇は家康自らぞ。わしは深追いせず退く。おぬしは南の仏ヶ根の武蔵守の旗へ走れ', 3.4); });
      F.hori.order = 'move'; F.hori.dest = { x: EXIT.x + 6, z: EXIT.z + 12 }; F.hori.speed = 3.6; F.hori.march = true;
      F.hori.onArrive = (g) => { g.march = false; g.order = 'hold'; };
      F.hideG.fixed = false; F.hideG.order = 'move'; F.hideG.dest = { x: EXIT.x - 4, z: EXIT.z + 4 }; F.hideG.speed = 3.8; F.hideG.march = true;
      // 信吉は細ヶ根の堀の旗の後ろで止まる（消すと「味方の大将が討たれた」と出る）
      F.hideG.onArrive = (g) => { g.march = false; g.order = 'hold'; g.fixed = true; };
      for (const g of F.waves) for (const u of g.units) if (u.alive) rt.army.despawn(u);
      if (live(F.camp)) for (const u of F.camp.units) if (u.alive) rt.army.despawn(u);
      // 仏ヶ根の池田恒興・元助・森長可（引き返して陣を構えた。本物の兵の枠のため、この段で置く）
      const o = { facing: E, width: 7, aggro: 8, speed: 3.6, order: 'hold', noRout: true, dmgMult: 0.5, fullStrength: true };
      F.ikeG = allyGroup(rt, { ...o, name: '池田恒興の旗本', anchor: { x: HOTOKE.x - 8, z: HOTOKE.z + 18 } },
        fl([{ type: 'busho', n: 1, o: { name: '池田恒興', horse: true } }, { type: 'samurai', n: 7 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], 'ageha'));
      // 布陣図：右（南）に池田元助・照政の先手、左（北）に森長可、後ろ（西）に恒興の旗本
      F.ikeSaki = allyGroup(rt, { ...o, name: '池田元助の先手', anchor: { x: HOTOKE.x + 6, z: HOTOKE.z + 20 } },
        fl([{ type: 'busho', n: 1, o: { name: '池田元助', horse: true } }, { type: 'ashigaru', n: 12, o: { flagScale: 1 } }, { type: 'gun', n: 5 }, { type: 'samurai', n: 2 }], 'ageha'));
      F.moriG = allyGroup(rt, { ...o, name: '森長可の旗本', anchor: { x: HOTOKE.x + 4, z: HOTOKE.z - 6 } },
        fl([{ type: 'busho', n: 1, o: { name: '森長可', horse: true } }, { type: 'samurai', n: 7 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], 'tsuru'));
      F.moriU = F.moriG.units.find((u) => u.name === '森長可');
      // 兵の反撃と将の持ち場を分ける。将まで敵を追い続けると、固定の行き先から
      // 三十五歩以内で最期を見届けられず、森・元助・恒興の段が進まなくなる。
      F.hotokeLords = [F.moriG, F.ikeSaki, F.ikeG].map((g) => ({
        u: g.units.find((q) => q.type === 'busho'), x: g.anchor.x, z: g.anchor.z,
      }));
      // 森の旗本の後ろに鶴丸の大きな幟（④の目標の「森長可様の旗」がどれか、遠くから分かるように）
      if (rt.scene && rt.world && !F.moriNobori) {
        F.moriNobori = true;
        for (const [dx, dz] of [[-5, -3], [-5, 3]]) {
          const x = HOTOKE.x + 4 + dx, z = HOTOKE.z - 6 + dz;
          const flag = nobori(rt.world, x, z, 'tsuru', 7);
          // 檜ヶ根から来る主人公に布の正面を向け、鶴丸が細い線にならないようにする。
          flag.rotation.y = Math.atan2(HINOKI.x - x, HINOKI.z - z);
          rt.scene.add(flag);
        }
      }
      for (const u of [...F.ikeG.units, ...F.ikeSaki.units, ...F.moriG.units]) if (u.type === 'busho') u.invuln = true;
    } else if (n === 5) {
      // 東から井伊の赤備え（正面）、北東の御旗山から家康の旗本の先手（右翼）。挟まれる
      rt.say('森長可', '家康め、来おったか。鬼武蔵の槍を見せてくれる！', 2.8);
      sfx('horagai', 1);
      for (const g of F.waves) for (const u of g.units) if (u.alive && dist(u.pos, HOTOKE) > 60) rt.army.despawn(u);
      // 布陣図：徳川は右（北・御旗山の側）に家康の旗本、左（南東）に井伊の赤備え。赤備えは東の正面から森・池田の先手へ
      F.aka = [0, 1].map((i) => this.akazonae(rt, { x: HOTOKE.x + 54, z: HOTOKE.z - 6 + i * 22 }, HOTOKE));
      this.general(rt, '井伊直政', { x: HOTOKE.x + 76, z: HOTOKE.z + 14 }, AKA);
      // 森長可は先手の前の持ち場に留まって槍を振るう（名が見える所で最期を迎える）
      F.moriG.order = 'hold'; F.moriG.seekRange = 8; F.ikeSaki.order = 'attack'; F.ikeSaki.seekRange = 18;
      rt.after(14, () => {
        if (stopped(rt) || F.stage !== 5) return;
        // 家康の旗本の先手は右翼（北東の御旗山の側）から森の旗へ下りて来る
        F.side = [0, 1].map((i) => this.wave(rt, { x: HOTOKE.x + 18 + i * 16, z: HOTOKE.z - 38 }, 12, HOTOKE, '徳川家康の旗本の先手'));
        rt.army.play('toki', { x: HOTOKE.x + 26, z: HOTOKE.z - 32 }, 1.6);
        rt.say('物見', '北東の御旗山から金扇の旗本が！　挟まれまする！', 2.8);
      });
      // 水野の鉄砲組が東の畑の際から撃ちかける（森長可を撃った杉山孫六は水野家の鉄砲足軽・battle_learn 六）
      const mizunoUp = () => {
        if (stopped(rt) || F.stage !== 5 || F.mizunoGun) return;
        // 出現の瞬間だけ枠が埋まっていても、鉄砲組そのものを省かない。
        if (aliveReal(rt) + 8 > REAL_CAP) { rt.after(2, mizunoUp); return; }
        F.mizunoGun = enemyGroup(rt, { faction: 'tokugawa', name: '水野忠重の鉄砲組', anchor: { x: HOTOKE.x + 34, z: HOTOKE.z - 22 }, facing: W, width: 6, formation: 'line', morale: 90, dmgMult: 0.4,
          order: 'hold', seekRange: 10, aggro: 4, speed: 3.4, noRout: true }, dressT([{ type: 'gun', n: 6 }, { type: 'ashigaru', n: 2, o: { flagScale: 1 } }], { ...TOKU, flag: 'mizuno' }));
        F.waves.push(F.mizunoGun);
        rt.say('物見', '東の畑の際に水野の鉄砲！　武蔵守様を狙うておりまする！', 2.8);
      };
      rt.after(30, mizunoUp);
      // 百四十秒から、主人公が武蔵守の 35m 内に戻るまで待つ。離れたまま時だけで討死させない。
      const moriEnd = () => {
        if (stopped(rt) || F.stage !== 5) return;
        const m = F.moriU, P = rt.player.u.pos;
        if (m && m.alive && dist(m.pos, P) > 35) { rt.after(1, moriEnd); return; }
        this.fall(rt, F.moriG, '森長可', '森武蔵守様、眉間を撃たれお討死！', true);
        // 元助も主人公の見える所で最期を迎える。森の討死からの時刻だけで消さず、見届けてから救援へ進む。
        const motosukeEnd = () => {
          if (stopped(rt) || F.stage !== 5) return;
          const u = F.ikeSaki?.units.find((q) => q.name === '池田元助' && q.alive);
          if (u && dist(u.pos, rt.player.u.pos) > 35) { rt.after(1, motosukeEnd); return; }
          this.fall(rt, F.ikeSaki, '池田元助', '之助様、安藤直次に討たれましてござる！');
          rt.after(5, () => { if (!stopped(rt) && F.stage === 5) this.stage(rt, 5.5); });
        };
        rt.after(14, motosukeEnd);
      };
      //   森長可の強引な反撃：四十秒で鶴丸の旗本が赤備えへ突きかかる（激戦）。榊原の旗も見える。撃たれるのは百四十秒から
      rt.after(40, () => {
        if (stopped(rt) || F.stage !== 5 || !live(F.moriG)) return;
        F.moriG.order = 'attack'; F.moriG.seekRange = 26; F.moriG.aggro = 18;
        rt.say('森長可', '押し返せ！　赤備えなど蹴散らせぇ！', 2.8);
        rt.army.play('toki', { x: HOTOKE.x + 20, z: HOTOKE.z - 4 }, 1.3);
      });
      rt.after(58, () => {
        if (stopped(rt) || F.stage !== 5) return;
        // 檜ヶ根の榊原隊は④で去っている。知らせだけにせず、御旗山の麓へ旗本を置く。
        const g = this.general(rt, '榊原康政', { x: HOTOKE.x + 26, z: HOTOKE.z - 30 }, SAKA);
        if (!g) return;
        g.order = 'move'; g.dest = { x: HOTOKE.x - 8, z: HOTOKE.z + 18 }; g.seekRange = 30;
        g.onArrive = (q) => { q.order = 'attack'; };
        rt.say('物見', '御旗山の麓にも榊原の「無」の旗！　池田様の横へ回っておりまする！', 3.2);
      });
      rt.after(76, () => { if (!stopped(rt) && F.stage === 5) rt.say('森長可', 'まだじゃ……まだ鬼武蔵は倒れぬぞ！', 2.8); });
      rt.after(100, () => { if (!stopped(rt) && F.stage === 5) rt.say('池田元助', '武蔵守殿の旗が揺らいだ！　支えよ、支えよ！', 2.8); });
      rt.after(140, moriEnd);
    } else if (n === 6) {
      // 大きな札は共通の「〇〇が討たれた」に任せる（重ねると共通の札が出られず毎コマ出し直す）。退く下知は台詞で
      rt.say('使番', '勝入様・之助様・武蔵守様、お討死！　西の細ヶ根の堀様の旗まで退かれよ！', 3.4);
      F.menN0 = Math.max(F.menN0r || 0, aliveN(F.men));
      F.hori.order = 'hold';
      for (const g of [F.moriG, F.ikeG, F.ikeSaki]) if (live(g)) { g.routed = true; g.order = 'retreat'; g.dest = { ...EXIT }; g.onArrive = () => { for (const u of g.units) if (u.alive) rt.army.despawn(u); }; }
      // 仏ヶ根で戦った徳川の組は、主人公から離れた者を去らせ、追手（赤備え）の枠を空ける
      const P = rt.player.u.pos;
      for (const g of F.waves) if (live(g)) for (const u of g.units) if (u.alive && !u.gone && (g.general || dist(u.pos, P) > 30)) rt.army.despawn(u);
      for (const g of F.waves) if (live(g) && !g.general) { g.order = 'attack'; g.seekRange = 40; }
      F.nextPursuit = rt.t + 2;
      Retreat.start(rt, this.ctx(rt));
    }
  },

  // 段の中身（t03b_nagakute/*.js）へ渡す道具
  ctx(rt) {
    const F = rt.flags;
    return { CAMP, HOTOKE, EXIT, fl, dressT, live, aliveN, pushWave: (g) => F.waves.push(g), fall: (g, name, line) => this.fall(rt, g, name, line),
      next: () => this.stage(rt, F.stage === 0.5 ? 1 : 6) };
  },
  wave(rt, at, n, to, name = '徳川勢', focus, kit) {
    const F = rt.flags;
    if (aliveReal(rt) + n > REAL_CAP) return null;
    const g = enemyGroup(rt, { faction: 'tokugawa', name, anchor: at, facing: W, fleeDir: { x: 1, z: 0 }, width: 4, formation: 'line', morale: 85, dmgMult: 0.42,
      order: to ? 'move' : 'attack', seekRange: 50, aggro: 14, speed: 3.6, noRout: true, noAI: true, ...(focus ? { focus } : {}) }, foeKnot(n, kit));
    // 寄せる場所は段の下知どおり。自由な立て直しで坂の下に止まらず、届く敵とは進みながら戦う。
    if (to) { g.dest = { x: to.x, z: to.z }; g.onArrive = (q) => { if (q.order === 'move') q.order = 'attack'; }; }
    F.waves.push(g);
    return g;
  },
  // 井伊の赤備え：騎馬と侍の多い組
  akazonae(rt, at, to) {
    const F = rt.flags;
    if (aliveReal(rt) + 12 > REAL_CAP) return null;
    const g = enemyGroup(rt, { faction: 'tokugawa', name: '井伊の赤備え', anchor: at, facing: W, fleeDir: { x: 1, z: 0 }, width: 4, formation: 'line', morale: 90, dmgMult: F.stage === 5 ? 0.26 : 0.36,   // 仏ヶ根の長い押し合い（15分の段）で騎馬の打ち込みが重なり過ぎない
      order: to ? 'move' : 'attack', seekRange: 60, aggro: 16, speed: 4.2, noRout: true, noAI: true },
    dressT([{ type: 'cavalry', n: 3 }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }, { type: 'gun', n: 2 }], AKA));
    if (to) { g.dest = { x: to.x, z: to.z }; g.onArrive = (q) => { if (q.order === 'move') q.order = 'attack'; }; }
    F.waves.push(g);
    return g;
  },
  // 御旗山の家康・信雄の本陣：陣幕と金扇の馬印、床几の家康と信雄、前を固める旗本（動かず、討てない。数えない）
  honjinUp(rt) {
    const F = rt.flags;
    if (F.honjin) return;
    KIT.honjin(rt, HONJIN.x, HONJIN.z + 6, { mon: 'tokugawa', fire: false, yoroi: false });
    if (rt.scene && rt.world) {
      const x = HONJIN.x - 3, z = HONJIN.z - 1;
      // 檜ヶ根と仏ヶ根の中間へ正面を向け、どちらからも金扇の面が見えるようにする。
      const rot = Math.atan2((HINOKI.x + HOTOKE.x) / 2 - x, (HINOKI.z + HOTOKE.z) / 2 - z);
      const um = umajirushi(rt.world, x, z, rot, 'ogi');
      um.scale.setScalar(1.6); rt.scene.add(um);
    }
    const face = Math.atan2(HOTOKE.x - HONJIN.x, HOTOKE.z - HONJIN.z);   // 仏ヶ根の方を見下ろす
    F.honjin = [campGuard(rt, { x: HONJIN.x - 2, z: HONJIN.z - 2 }, face, '徳川家康の旗本', 'tokugawa', 22, 'tokugawa', '徳川家康'),
      campGuard(rt, { x: HONJIN.x + 16, z: HONJIN.z - 8 }, face, '織田信雄の旗本', 'nobukatsu', 8, 'nobukatsu', '織田信雄')];
  },
  // 名のある敵の将：馬上で、旗本（侍・足軽・鉄砲）の組に囲まれて、先手の後ろに控える。討てない（AR の 3・4）
  general(rt, name, at, kit, facing = W) {
    if (aliveReal(rt) + 13 > REAL_CAP) return null;
    const g = enemyGroup(rt, { faction: 'tokugawa', name: name + 'の旗本', anchor: { ...at }, facing, width: 5, formation: 'line', morale: 95, dmgMult: 0.4,
      order: 'hold', seekRange: 10, aggro: 6, speed: 3.4, noRout: true, noAI: true },   // 持ち場と回り込みは段の下知に従い、自由な後退判断を残さない
    dressT([{ type: 'busho', n: 1, o: { name, invuln: true, horse: true } }, { type: 'samurai', n: 5, o: { keep: true } },
      { type: 'ashigaru', n: 5, o: { flagScale: 1 } }, { type: 'gun', n: 2 }], kit || undefined));
    // 討てない将へ攻撃し続けて兵が留まらないよう、本陣の将と同じく狙いから外す。護衛とは打ち合える。
    for (const u of g.units) if (u.type === 'busho' && u.name === name) u.noTarget = true;
    g.general = true;
    rt.flags.waves.push(g);
    return g;
  },
  // 名のある将の討死（史実どおり。将のいなくなった隊は崩れて退く）
  fall(rt, g, name, line, shot) {
    if (!g) return;
    const u = g.units.find((q) => q.name === name && q.alive);
    if (u) {
      // 撃たれた時は、東の鉄砲組の方から一発の音
      // 撃ち手が見える所にいれば、その筒先から火と白煙を吹かせる（どこから撃たれたかが絵で分かる）
      if (shot) {
        const gu = F_GUN_U(rt);
        let fired = false;
        if (gu) { gu.heading = Math.atan2(u.pos.x - gu.pos.x, u.pos.z - gu.pos.z); const wasNT = u.noTarget; u.noTarget = false; u.invuln = true; fired = rt.army.fireGun(gu, u); u.noTarget = wasNT; }
        if (!fired) { const m = gu ? gu.pos : { x: u.pos.x + 24, z: u.pos.z - 10 }; rt.army.play('gun', m, 1.4); if (rt.army.smoke) rt.army.smoke(m.x, (rt.world.heightAt ? rt.world.heightAt(m.x, m.z) : 0) + 1.5, m.z, -1, 0, 1.35); }
      }
      u.invuln = false; rt.army.kill(u);
      // 大きな札は共通の「〇〇が討たれた」一つに任せる（二つ重ねると共通の札が出られず、毎コマ出し直していた）
    }
    if (line) rt.say('使番', line, 3);
    if (!g.units.some((q) => q.alive && q.type === 'busho')) { g.routed = true; g.order = 'retreat'; g.dest = { ...EXIT }; }
  },
  // 退く段の追手（赤備え）：主人公の後ろ（東）と横（南）から。騎馬の多い組が駆け足で追いつく（九2「目標に書いた敵は必ず来る」）
  pursue(rt) {
    const F = rt.flags, P = rt.player.u.pos, k = F.pursuit.length;
    // 一手目は南の横から退く道の先へ回り込む騎馬（横槍。馬で駆け抜けても行く手で出会う）、ほかは後ろ（東）と南から
    const at = !k ? { x: P.x - 26, z: P.z + 26 } : k % 2 ? { x: P.x - 6, z: P.z + 30 } : { x: P.x + 30, z: P.z + (k % 4 ? 10 : -10) };
    const g = this.akazonae(rt, { x: Math.max(-XW + 4, Math.min(XW - 4, at.x)), z: Math.max(ZN + 6, Math.min(ZS - 6, at.z)) }, null);
    if (!g) return;
    g.speed = 4.9; g.seekRange = 70; g.dmgMult = 0.24;   // 追いすがる手は数で押す（騎馬の一撃で十秒に倒さない・十二3）
    if (!k) g.focus = rt.player.u;   // 主人公を名指しで追うのは最初の一手だけ（ほかは退く兵の誰にでも掛かる。主人公一人を囲まない）
    // 後続は細ヶ根への退路を進む。自由な回り込み・後退で出現地点に留まらせない。
    g.noAI = true;
    if (k) { g.order = 'move'; g.dest = { x: EXIT.x + 12, z: EXIT.z }; }
    F.pursuit.push(g);
    rt.army.play('toki', g.anchor, 1.2);
    if (k === 0) rt.say('物見', '赤備えが追うて来る！　後ろと南から！', 2.6);
  },

  update(rt, dt) {
    const F = rt.flags;
    countFallen(rt);
    if (stopped(rt) || !F.stage) return;
    const P = rt.player.u;
    walls(rt, XW, ZN, ZS);
    const run = F.stage === 0.5 || F.stage === 2 || F.stage === 4 || F.stage === 6 || F.stage === 5.5;
    // 連れた兵：走る段は斬り合いに留まらず縦に駆けて付いて来る（前は②で白山林に残って討たれた・一5・九4）。着けば構えて打ち合う
    if ((F.menT = (F.menT || 0) - dt) <= 0) {
      F.menT = 0.5;
      const c = live(F.men) && F.men.center();
      if (c) {
        const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
        let farthest = d;
        F.men.ai = false;
        // 走る段で離れた兵は、目の前の斬り合いを捨てて駆け出す（掴み合ったまま白山林に残らない）
        //   駆けて追いつく間（主人公から 14m より外）は、追いすがる敵に討たれ尽くさない（追いつけば元どおり打ち合う）
        for (const u of F.men.units) if (u.alive && !u.gone) {
          const distance = dist(u.pos, P.pos), away = run && distance > 14;
          farthest = Math.max(farthest, distance);
          if (distance > 14) { u.target = null; u.watch = null; }
          if (away !== !!u._runSafe) { u._runSafe = away; u.invuln = away; }
        }
        // 後れた組も先行した組も主人公のそばへ。任務地点へ直行させると、途中で止まった主人公を置き去りにする。
        // 行き先を半秒ごとに替えると、
        //   替わるたびに隊の合図の待ち（army_signals.js）が入り足が止まるので、6m より大きく離れた時だけ替える
        // 主人公を追い越した組はそばへ戻す。行き先だけを追うと、立ち止まった主人公を置いて先へ走り続ける。
        // 前後に分かれた兵の平均だけが近くても、離れた兵が戻るまでは集合を続ける。
        const far = d > (run ? 5 : 8) || farthest > 14;
        const want = { x: P.pos.x + 2, z: P.pos.z + 2 };
        if (far && (F.men.order !== 'move' || !F.men.dest || dist(F.men.dest, want) > 6)) F.men.dest = { x: want.x, z: want.z };
        if (far) { F.men.order = 'move'; F.men.speed = run || farthest > 16 ? 5.4 : 4.4; F.men.march = run || farthest > 16; F.men.aggro = run || farthest > 16 ? 2 : 10; }
        else {
          // 戻った直後に自由な攻撃へ替えると、また敵を追って主人公の周りが空になる。
          F.men.order = 'hold'; F.men.anchor.x = want.x; F.men.anchor.z = want.z;
          F.men.march = false; F.men.aggro = 6; F.men.seekRange = 8;
        }
      }
    }
    // 信吉の馬廻は走る間、追いすがる敵との斬り合いに留まらず駆け抜ける（白山林に残ると堀の陣へ着かない）
    if ((F.stage === 1 || F.stage === 2 || F.stage === 3 || F.stage === 4) && F.hideG.order === 'move' && (F.hideT = (F.hideT || 0) - dt) <= 0) {
      F.hideT = 0.5;
      for (const u of F.hideG.units) if (u.alive && !u.gone && u.target) { u.target = null; u.watch = null; }
    }
    // 信吉が揉み合いや骸に引っかかって馬が進まない時は、行き先の方へ少し押し出す（白山林に取り残さない）
    if (F.stage >= 2 && F.stage <= 4 && F.hideU && F.hideU.alive && (F.hsT = (F.hsT || 0) - dt) <= 0) {
      F.hsT = 2;
      const H = F.hideU, D = F.stage === 4 ? F.hideG.dest : HIDE_STOP, last = F.hsP;
      F.hsP = { x: H.pos.x, z: H.pos.z };
      if (D && last && Math.hypot(H.pos.x - last.x, H.pos.z - last.z) < 0.6 && dist(H.pos, D) > 10) {
        const dx = D.x - H.pos.x, dz = D.z - H.pos.z, l = Math.hypot(dx, dz) || 1;
        H.pos.x += dx / l * 2.2; H.pos.z += dz / l * 2.2; H.target = null;
      }
    }
    // 仏ヶ根の将は反撃中も旗のそばで戦い、主人公の行き先から姿を消さない。
    if (F.stage >= 4 && F.stage <= 5.5 && F.hotokeLords) for (const h of F.hotokeLords) {
      const u = h.u;
      if (!u || !u.alive || u.gone) continue;
      const dx = u.pos.x - h.x, dz = u.pos.z - h.z, d = Math.hypot(dx, dz);
      if (d > 8) {
        u.pos.x = h.x + dx * 8 / d; u.pos.z = h.z + dz * 8 / d;
        u.target = null; u.watch = null;
      }
    }
    // 御旗山の本陣の旗本と床几の大将は持ち場（陣幕の前）から離れない
    if (F.honjin) for (const g of F.honjin) if (g) for (const u of g.units) {
      if (!u._home) u._home = { x: u.pos.x, z: u.pos.z };
      else if (u.alive && Math.hypot(u.pos.x - u._home.x, u.pos.z - u._home.z) > 3) { u.pos.x = u._home.x; u.pos.z = u._home.z; u.target = null; }
    }
    // 御旗山の本陣の旗本（討てない）は陣幕の前から出ない。斬り合いに引き込まれて丘を下り、主人公を斬らない（総大将は前に出ない）
    if (F.honjin && (F.hjT = (F.hjT || 0) - dt) <= 0) {
      F.hjT = 0.4;
      for (const g of F.honjin) if (g) { g.order = 'hold'; g.fixed = true; g.aggro = 0; g.seekRange = 0; for (const u of g.units) if (u.alive) { u.target = null; u.watch = null; } }
    }
    if (rt.t > TIME_UP) return this.lose(rt, '赤備えに囲まれた');
    // 連れた兵が討たれても負けにしない（主人公のせいでない負けを作らない・十一1・十二3）
    // 行軍中の番所はまだ攻める相手。出発地点から遠くても、焼くまでは守りと加勢を残す。
    // それ以外の遠く離れた敵は去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - dt) <= 0) {
      F.gcT = 1;
      for (const g of F.waves) {
        if (F.stage === 0.5 && !F.banFire && (g === F.banG || g === F.banG2)) continue;
        for (const u of g.units) if (u.alive && !u.gone && dist(u.pos, P.pos) > 120) rt.army.despawn(u);
      }
    }
    const el = rt.t - F.st0;
    const atGoal = dist(P.pos, goalOf(F.stage)) < goalR(F.stage);
    if (!F.there && atGoal) { F.there = true; F.at0 = rt.t; }
    // 味方が先に敵を倒しても、持ち場で守り抜けば進める。陣を離れた時間は数えない。
    // 攻撃を当てるまで終われない条件だけでは、敵のいない丘で刻限まで待たされる。
    if (F.stage === 1 || F.stage === 3) {
      const limit = F.stage === 1 ? 125 : 130;
      if (atGoal) F.guardTime = Math.min(limit, F.guardTime + dt);
      const seconds = Math.floor(F.guardTime);
      if (seconds !== F.guardShown) {
        F.guardShown = seconds;
        rt.objProgress('main', `持ち場の守り ${seconds}／${limit}秒`);
      }
    }
    if (F.stage === 0.5) { March.tick(rt, this.ctx(rt), dt); return; }
    if (F.stage === 5.5) { Ikeda.tick(rt, this.ctx(rt)); return; }
    if (F.stage === 1) {
      // 隊への移動命令だけでは、敵を狙う本人が馬印を離れてしまう。本人の持ち場も毎コマ守る。
      const H = F.hideU, home = F.hideHome || CAMP;
      F.hideOff = dist(H.pos, home) > 6;
      if (F.hideOff) { H.pos.x = home.x; H.pos.z = home.z; }
      H.target = null; H.watch = null;
      F.hideG.order = 'hold'; F.hideG.fixed = true;
      const left = F.w1.reduce((s, g) => s + aliveN(g), 0);
      if (atGoal && ((F.defended && ((el > 95 && left <= F.w1N() * 0.45) || el > 125)) || F.guardTime >= 125)) {
        if (F.there) rt.award((t) => t.side.push('白山林で信吉様の馬印を守った'), '白山林で信吉様の馬印を守った');
        this.stage(rt, 2);
      }
    } else if (F.stage === 2) {
      // 主人公が堀の陣に着けば、すぐに榊原の手が坂の下に現れる（着いて待たせない・三2）。遅れても飛ばさない（二の6）
      const H = F.hideU, hArr = dist(H.pos, HIDE_STOP) < 12;
      if (atGoal && (hArr || (el > 6 && dist(H.pos, HIDE_STOP) < 45) || rt.t - F.at0 > 15)) {   // 主人公が着いて十五秒で必ず次へ（信吉様は③の間も堀の陣へ駆け続ける）
        if (hArr) rt.say('三好信吉', '……助かった。堀の陣じゃ', 2.4);
        if (dist(P.pos, HIDE_STOP) < 30) rt.award((t) => t.side.push('信吉様と檜ヶ根まで走った'), '信吉様と檜ヶ根まで走った', H.pos);
        this.stage(rt, 3);
      }
    } else if (F.stage === 3) {
      // 堀の陣を破られる：徳川の兵が丘の上の鉄砲の列の後ろ（西）に十二人
      let inside = 0;
      for (const g of F.w3) if (g) for (const u of g.units) if (u.alive && !u.gone && u.pos.x < HINOKI.x - 2 && Math.abs(u.pos.z - HINOKI.z) < 26) inside++;
      if (inside >= 12) return this.lose(rt, '堀様の陣を破られた');
      const left = F.w3.reduce((s, g) => s + aliveN(g), 0);
      if (atGoal && ((F.defended && ((el > 90 && left <= F.w3N * 0.4) || el > 130)) || F.guardTime >= 130)) {
        rt.say('堀秀政', '押し返したぞ！', 2.2);
        if (F.there) rt.award((t) => t.side.push('檜ヶ根で追手を押し返した'), '檜ヶ根で追手を押し返した');
        this.stage(rt, 4);
      }
    } else if (F.stage === 4) {
      if (F.there) {
        if (F.there) rt.say(rt.G?.name || '自分', '武蔵守様！　家康の本隊が後ろに！', 2.6);
        this.stage(rt, 5);
      }
    } else if (F.stage === 5) {
      F.menN0r = Math.max(F.menN0r || 0, aliveN(F.men));
    } else if (F.stage === 6) {
      // 細ヶ根へ先回りして最初の追手が遠くに残っても、接近するまでは後続が回り込む。
      // 枠待ちで一手も出せないまま百五十秒を越えても、追手の出現を省かない。
      if (!F.pursuitClosed && (el < 150 || !F.pursuitMet) && (!atGoal || !F.pursuitMet) && rt.t > F.nextPursuit && F.pursuit.length < 5) { F.nextPursuit = rt.t + 14; this.pursue(rt); }
      if (Retreat.done(rt, this.ctx(rt), atGoal, el)) this.win(rt);
    }
  },

  lose(rt, why) {
    const F = rt.flags;
    if (stopped(rt)) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.objFail('main');
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  win(rt) {
    const F = rt.flags;
    if (stopped(rt)) return;
    F.ending = true;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    const n = Retreat.saved(rt, this.ctx(rt)), txt = n > 0 ? `兵${n}人を連れて細ヶ根まで退いた` : '細ヶ根まで生きて退いた';
    rt.award((t) => t.side.push(txt), txt);
    rt.banner('長久手　羽柴軍敗北', n > 0 ? '兵を連れて退いた' : '生きて退いた');
    rt.say('堀秀政', '勝入殿も之助も武蔵守も討たれた。よう生きて戻った', 3);
    rt.after(3.2, () => rt.say('使番', '家康の本隊は小幡城へ退きましてござる。本多忠勝は小牧の守りに残ったとの知らせにござる', 3.6));
    rt.after(7.2, () => rt.say('羽柴秀吉', '家康は、戦では勝てぬ男よ', 3));
    rt.after(10.4, () => rt.say('使番', '筑前様の本隊は無事。竜泉寺の川を越えて参られました', 3.4));
    rt.after(14.4, () => rt.say('羽柴秀吉', '十万の兵がおっても、家康を屈ませることはできなんだか', 3.4));
    rt.after(18.6, () => rt.say('羽柴秀吉', 'ならば信雄殿と和を結び、家康が出て来ずにおれぬようにしてやる', 3.6));
    rt.finish({ scriptedEnd: true }, 23);
  },

  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.stage) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const t = goalOf(F.stage);
    const run = F.stage === 5.5 || F.stage === 2 || F.stage === 4 || F.stage === 6 || Math.hypot(t.x - u.pos.x, t.z - u.pos.z) > 14;
    // 走る間は、行き先までの道を塞ぐ敵だけを払う。横や後ろの追手へ向き直って足を止めない。
    const dx = t.x - u.pos.x, dz = t.z - u.pos.z, len = Math.hypot(dx, dz);
    const ahead = (o) => {
      if (!ok(o)) return false;
      if (!run) return true;
      if (len < 2) return false;
      const ex = o.pos.x - u.pos.x, ez = o.pos.z - u.pos.z;
      const forward = (ex * dx + ez * dz) / len;
      return forward > 0 && forward < len && Math.abs(ex * dz - ez * dx) / len < 1.4;
    };
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
// 画面の兵数は始まりの札と同じ中入り二万対一万四千。局地戦へ移っても初期人数を替えない。
// 退去・逃走・後続の到着を討死と取り違えず、倒れた兵だけ一度数える。
function countFallen(rt) {
  const F = rt.flags;
  // やり直しの写しで集合も戻す。写されない弱い集合では、復活後の討死を数え損ねる。
  if (!F.countedFallen) { F.countedFallen = new Set(); F.fallen = [0, 0]; }
  for (const u of rt.army.units) {
    if (u.alive || !(u.hp <= 0) || u.isStruct || u.isPlayer || u.civ || (u.team !== 0 && u.team !== 1) || F.countedFallen.has(u)) continue;
    F.countedFallen.add(u); F.fallen[u.team]++;
  }
}
t03b_nagakute.force = (rt) => {
  if (rt?.flags && rt.army) countFallen(rt);
  const fallen = rt?.flags?.fallen;
  // 小牧の対陣と同じく、本物の兵一人を二十人に見立てる。
  return { a: Math.max(0, 20000 - (fallen?.[0] || 0) * 20), a0: 20000,
    b: Math.max(0, 14000 - (fallen?.[1] || 0) * 20), b0: 14000, casualtiesCounted: true };
};
t03b_nagakute.date = () => '天正十二年四月九日　朝・初夏';
t03b_nagakute.history = '小牧で家康とにらみ合う中、池田恒興の策で、池田恒興・元助、森長可、堀秀政、三好信吉（秀吉の甥。翌年に羽柴秀次と名を改める）のおよそ二万が、家康の留守の三河を突こうと東へ回り込んだ（中入り）。家康はこれを知って小牧山を出て追い、四月九日の朝、白山林で休んでいた信吉の隊を後ろと横から襲って崩した。信吉は馬を失いながら逃れた。堀秀政は檜ヶ根で鉄砲を揃えて追手を押し返したが、家康の本隊が池田・森の後ろへ回ったと知って退いた。家康と信雄は堀と池田・森の間の御旗山（富士ヶ根）に金扇の馬印を立てて本陣を置き、井伊直政の赤備えらを前に出した。長久手で池田・森の勢は前と横から押し包まれ、森長可は眉間を撃たれ、池田元助は安藤直次に、恒興は永井直勝に討たれた。秀吉は戦では家康に勝てず、この年の十一月に信雄と和睦し、家康とも手を結んだ。白山林・檜ヶ根・仏ヶ根の間隔と向きは縮めた復元で、主人公の組の動きは遊びのための筋書き。檜ヶ根に柵・堀を築いた記述は無いので置かない。香流川の流れと仏ヶ根の西の田は地形の写しの推定。';
t03b_nagakute.famous = [];
t03b_nagakute.botGuardFlee = (b) => b.flags.stage === 2 || b.flags.stage === 4 || b.flags.stage === 6 || b.flags.stage === 5.5;
t03b_nagakute.botEvacuating = (b) => b.flags.stage === 6;
// 目標の並び（goals5.js）。段の一行は行いと場所で書く（AR の 1・AW の 3）
const st = (n) => (rt) => (rt.flags.stage ?? 0) >= n;
STAGES.t03b_nagakute = [[BAN_TEXT], [STAGE_TEXT[1], st(1)], [STAGE_TEXT[2], st(2)], [STAGE_TEXT[3], st(3)], [STAGE_TEXT[4], st(4)], [IKE_TEXT, st(5.5)], [STAGE_TEXT[6], st(6)]];
withGuard(t03b_nagakute);

export { t03b_nagakute };
export default t03b_nagakute;
