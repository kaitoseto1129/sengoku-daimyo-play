// ======================================================================
// 徳川編 14　八尾・若江の戦い（慶長二十年 1615・五月六日の朝）　大坂夏の陣、河内の田の中の二つの戦
// 筋書きの正：docs/chapter3_tokugawa.md の「14. 八尾・若江」。一つの大きな地図で二正面を同時に戦う。
// 右（北）＝若江：木村重成のおよそ四千七百と、井伊直孝の赤備えおよそ三千二百の正面の戦い。木村重成は討死（必ず）。
// 左（南）＝八尾：長宗我部盛親のおよそ五千三百が長瀬川の堤に伏せ、藤堂高虎の五千を迎え撃つ。
//   藤堂の先手は崩れ、藤堂高刑・桑名吉成らが次々に討たれる。若江で木村が崩れると、横を突かれるのを恐れて長宗我部は大坂へ退いた。
// 主人公は徳川方、井伊直孝の手に付く。①若江で木村勢の両翼（山口弘定・内藤長秋）を崩す ②木村重成を討つ
// ③八尾へ南へ駆け、長宗我部の横を突いて退かせる。勝ち＝長宗我部が退く。全滅させなくてよい。
// 負け：昼までに長宗我部を退かせられず、八尾の藤堂勢が崩れ切る（およそ七分）。
// 向き：北が -z、東が +x。徳川方は東（生駒の麓の方）から西（大坂）へ向かう。西を向くと右が若江、左が八尾。
// 地形：国土地理院の標高（asset_dem_yaowakae.js。node prototype/tools/dem.mjs yaowakae で作る）。河内の低い田で起伏はほぼ無い。
//   今の道や堤の高まりは丸めて薄め、旧大和川の分かれ（玉串川・長瀬川）と堤は手で描き戻す。間隔は縮めた復元（実の若江と八尾は 2km あまり）。
// ======================================================================
import { BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demDetail } from './dem.js';
import { nobori, kagaribi } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { enemyGroup, allyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { KIT } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { setStages } from './b_k_help.js';

BATTLE_ASSETS.k14_yao_wakae = Object.freeze([...assetsForBattle('k14_yao_wakae')]);
const dem = null; // 標高の素材は素材の枝で入れる（今は平らな地形）

// ---- 場所（ゲームの座標。1 は実の 12m ほど） ----
const DEM_XY = 12;
const START = { x: 86, z: -92 };          // 井伊勢の寄せ口（若江の東の田）
const WAKAE = { x: -6, z: -96 };           // 若江の堤（木村重成の陣）
const YAMA = { x: 24, z: -128 };           // 木村の右翼・山口弘定（北）
const NAITO = { x: 22, z: -66 };           // 木村の左翼・内藤長秋（南）
const YAO = { x: -40, z: 104 };            // 八尾の長瀬川の堤（長宗我部盛親）
const YAO_FRONT = { x: 2, z: 100 };        // 八尾の前線（藤堂勢と長宗我部勢がぶつかる所）
const FLANK = { x: -20, z: 58 };           // 長宗我部の横（北から突く所）
const TODO_HQ = { x: 118, z: 118 };        // 藤堂高虎の本陣
const II_HQ = { x: 122, z: -104 };         // 井伊直孝の本陣
const TAMA = [[46, -260], [40, -150], [48, -60], [40, 30], [46, 140], [40, 260]];        // 玉串川（北へ流れる）
const NAGASE = [[-62, -260], [-56, -150], [-64, -40], [-52, 60], [-58, 160], [-52, 260]]; // 長瀬川（八尾の堤）
const ROAD = [[250, -40], [160, -60], [90, -20], [44, 0], [-10, 10], [-60, 6], [-250, 0]];  // 東西の道（八尾と若江の間）
const REAL_CAP = 215;                      // 戦う本物の兵の上限（iPhone の重さ）
const LIMIT = 540;                         // 昼まで（秒）
const STEP_TEXT = ['木村勢の両翼を崩せ', '木村重成を討て', '八尾で長宗我部の横を突け'];
const ARMOR = KIT.ARMOR;
// 井伊の赤備え・藤堂勢・木村勢・長宗我部勢の装い
const II = { armor: ARMOR.akazonae, cloth: 0x8e2a1e, lace: 0xa0402a, flag: 'ii' };
const TODO = { armor: 0x24221f, cloth: 0x4a4632, lace: 0x5a5a3a, flag: 'todo' };
const KIMURA = { armor: 0x2c2a2a, cloth: 0x4a3a2a, lace: 0x6a5a2a, flag: 'toyotomi' };
const CHOSO = { armor: 0x2a2622, cloth: 0x3a4a2a, lace: 0x4a6a2a, flag: 'chosokabe' };
const dress = (list, kit) => list.map((s) => ({ ...s, o: { ...kit, ...(s.o || {}) } }));
// 名のある武将の姿（その人だけの具足・兜・陣羽織）
const LOOK = {
  井伊直孝: { armor: 0xa52b1c, lace: 0xb8342a, hat: 'kabuto_tentsuki', haori: 0x7a1a12, mon: 'ii', horse: true },
  木村重成: { armor: 0x1c1a1a, lace: 0x3a6a3a, hat: 'kabuto_m', haori: 0xd8d2c0, mon: 'toyotomi', horse: true },
  長宗我部盛親: { armor: 0x1c1a1a, lace: 0x5a6a2a, hat: 'kabuto_w', haori: 0x2e3a24, mon: 'chosokabe', horse: true },
  藤堂高虎: { armor: 0x151312, lace: 0x3a3a2a, hat: 'kabuto_t', haori: 0x3a2a1a, mon: 'todo', horse: true },
  山口弘定: { armor: 0x2a2420, lace: 0x7a5a2a, hat: 'kabuto_f', haori: 0x4a3a22 },
  内藤長秋: { armor: 0x22241e, lace: 0x6a4a3a, hat: 'kabuto_w', haori: 0x3a2e24 },
  藤堂高刑: { armor: 0x24221f, lace: 0x5a4630, hat: 'kabuto_m', haori: 0x3a3424 },
  桑名吉成: { armor: 0x22241e, lace: 0x4a5a3a, hat: 'kabuto_f', haori: 0x2e3a2a },
  川手良列: { armor: 0x9a2a1c, lace: 0xa0402a, hat: 'kabuto_m', haori: 0x7a1a12 },
  安藤重勝: { armor: 0x9a2a1c, lace: 0xa0402a, hat: 'kabuto_f', haori: 0x6a1a12 },
};
const named = (name, type = 'samurai', o = {}) => ({ type, n: 1, o: { name, ...LOOK[name], ...o } });

const sm = (a, b, v) => { const k = Math.max(0, Math.min(1, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
const live = (g) => g && g.units.some((u) => u.alive && !u.gone);
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone ? 1 : 0), 0) : 0);
const aliveReal = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && !u.isStruct ? 1 : 0), 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---- 地形：平らな河内の田。二本の川の堤だけが高い。国土地理院の起伏は丸めて薄く ----
function levee(x, z, line) {
  const d = distToPolyline(x, z, line);
  return 1.5 * sm(4.5, 7, d) * (1 - sm(9, 15, d));
}
function height(x, z) {
  let h = 0.5 + 0.18 * Math.sin(x * 0.031 + 0.7) * Math.cos(z * 0.027) + 0.12 * Math.sin(z * 0.06 - x * 0.02);
  h += levee(x, z, TAMA) + levee(x, z, NAGASE) * 1.2;
  // 東の端は生駒の麓へゆるく上がる
  h += 0.06 * Math.max(0, x - 200);
  if (dem) {
    const away = sm(12, 24, Math.min(distToPolyline(x, z, TAMA), distToPolyline(x, z, NAGASE)));
    const r = demDetail(dem, x, z, { xy: DEM_XY, win: 14, scale: 0.22 });
    h += away * Math.max(-0.6, Math.min(0.6, r));
  }
  return h;
}

// 今の段（0〜2）
const stepOf = (rt) => Math.max(0, Math.min(2, (rt.flags.step || 1) - 1));
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

const k14_yao_wakae = {
  missionSingleLine: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,
  enemyTactics: false,       // 敵の動きはこの定義が決める（伏兵・崩れ・退き）
  noFieldMap: true,
  hideArmyPeek: true,
  hideGuideSteps: true,
  noPlayerFoot: true,
  nearbyAllySignLimit: 0,
  foeMarks: true,
  enemyTriangleSigns: true,
  playerAtkMax: 3,
  playerTaken: 0.5,
  playerRegen: 0.025,
  closeCombatAssist: true,
  autoTargetCamera: true,
  steadyMeleeCamera: true,
  noWinCrane: true,
  compactIntro: true,
  keepMix: false,
  minutes: 7,
  missions: STEP_TEXT,
  missionOf(rt) { return stepOf(rt); },
  introText: () => '井伊直孝の赤備えに付き、若江で木村重成と戦う。南の八尾では藤堂勢が長宗我部に押されている。',
  // 行き先のピン：段ごとに一つ（字は出さない）
  missionPin(rt) {
    const F = rt.flags;
    if (!F.step || F.ending) return null;
    let p;
    if (F.step === 1) p = F.yamaG && live(F.yamaG) ? F.yamaG.center() : F.naitoG && live(F.naitoG) ? F.naitoG.center() : WAKAE;
    else if (F.step === 2) p = F.kimuraU?.alive ? F.kimuraU.pos : WAKAE;
    else p = F.flankOn && live(F.choSide) ? F.choSide.center() : FLANK;
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.step === 3 && !F.flankOn ? 12 : 8;
    return PIN;
  },
  // 右上の小さな地図の赤いひし形：討つ相手の居場所
  mapMarks(rt) {
    const F = rt.flags;
    if (F.step === 2 && F.kimuraU?.alive) return [F.kimuraU.pos];
    if (F.step === 3 && F.choU?.alive) return [F.choU.pos];
    return null;
  },
  sides: { a: { name: '徳川方', mon: 'ii' }, b: { name: '大坂方', mon: 'toyotomi' } },
  // 戦の前と後の会話（docs/chapter3_tokugawa.md の 14）。戦の中の台詞として出す
  talk: {
    before: [['井伊直孝', '若江に木村長門守（重成）の旗。若いが、死ぬ気の者は手強いぞ'], ['使番', '八尾には長宗我部盛親。藤堂殿が向かわれました'],
      ['井伊直孝', '赤備えの名にかけて、木村を討て']],
    after: [['井伊直孝', '木村殿の兜には香が焚き込めてあったそうな。見事な覚悟よ'], ['藤堂高虎', '八尾では身内を多く失うた……長宗我部は退いた']],
  },
  spawn: { x: START.x - 6, z: START.z + 4, heading: -Math.PI / 2 },
  world: {
    seed: 1615506,
    time: 'day',
    mood: 'morning',          // 夜明けから昼までの戦（朝の光）
    mist: 0.15,               // 河内の朝靄
    muddy: 0.5,               // 深田（足を取られる田）
    groundHalf: 260,
    moveLim: 248,
    patchyGround: true,
    height,
    fieldStage: 'seedling',   // 旧暦五月六日（今の六月の初め）：植えたばかりの稲と水の張った田
    paddy(x, z) {
      if (Math.min(distToPolyline(x, z, TAMA), distToPolyline(x, z, NAGASE)) < 16 || distToPolyline(x, z, ROAD) < 5) return 0;
      if (Math.abs(x) > 230 || Math.abs(z) > 230) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 4 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.75;
    },
    riverCross: true,
    wadeDepth: 0.7,
    streams: [{ pts: TAMA, w: 5, depth: 0.9 }, { pts: NAGASE, w: 6, depth: 1.0 }],
    paths: [{ pts: ROAD, w: 3 }, { pts: [[START.x, START.z], [90, -94], [WAKAE.x, WAKAE.z], [-120, -100]], w: 2.4 }, { pts: [[TODO_HQ.x, TODO_HQ.z], [60, 106], [YAO.x, YAO.z], [-140, 110]], w: 2.4 }],
    tint(x, z, h, c) {
      // 堤の草（濃い緑）と道の土
      if (h > 1.4) { c.setRGB(c.r * 0.8, c.g * 0.9, c.b * 0.74); return; }
      const k = 0.5 + 0.5 * Math.sin(x * 0.05 + 0.3) * Math.cos(z * 0.045 - 1.1);
      c.setRGB(c.r * (0.86 + k * 0.2), c.g * (0.92 + k * 0.16), c.b * (0.8 + k * 0.2));
    },
    // 村（若江・八尾）の屋敷林と、堤の竹と松
    groves: [
      { x: -40, z: -122, r: 18, n: 30, kind: 'sugi' }, { x: -70, z: 130, r: 18, n: 28, kind: 'sugi' },
      { x: 52, z: -180, r: 14, n: 16, kind: 'matsu' }, { x: -60, z: -10, r: 12, n: 14, kind: 'matsu' },
      { x: 200, z: 30, r: 22, n: 26 }, { x: -170, z: 60, r: 20, n: 22 }, { x: 120, z: 200, r: 18, n: 18 },
    ],
    clearGroves: true,
    clear: (x, z) => dist({ x, z }, WAKAE) < 40 || dist({ x, z }, YAO_FRONT) < 50 || dist({ x, z }, FLANK) < 22 || dist({ x, z }, START) < 22 || distToPolyline(x, z, ROAD) < 5,
    trees: 160,
    tufts: 3000,
    treeDensity: (x, z) => (Math.min(distToPolyline(x, z, TAMA), distToPolyline(x, z, NAGASE)) < 18 ? 0.8 : 0.12),
    fleeOut: (x, z, team) => (team === 1 ? x < -235 : x > 240),
  },

  setup(rt) {
    const F = rt.flags, W = rt.world;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false; F.holdPlayer = true; F.waves = [];
    // ---- 旗・本陣・村 ----
    KIT.honjin(rt, II_HQ.x, II_HQ.z, { mon: 'ii', people: false, fire: true });
    KIT.honjin(rt, TODO_HQ.x + 10, TODO_HQ.z + 4, { mon: 'todo', people: false, fire: false });
    for (const [x, z] of [[START.x + 8, START.z - 10], [START.x + 8, START.z + 10], [START.x + 16, START.z]]) rt.scene.add(nobori(W, x, z, 'ii', 6));
    for (const [x, z] of [[WAKAE.x - 10, WAKAE.z - 14], [WAKAE.x - 12, WAKAE.z + 12], [YAMA.x - 10, YAMA.z], [NAITO.x - 10, NAITO.z]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
    for (const [x, z] of [[YAO.x - 6, YAO.z - 12], [YAO.x - 8, YAO.z + 10], [YAO.x - 18, YAO.z]]) rt.scene.add(nobori(W, x, z, 'chosokabe', 6));
    for (const [x, z] of [[TODO_HQ.x - 8, TODO_HQ.z - 8], [TODO_HQ.x - 8, TODO_HQ.z + 8], [60, 92], [60, 116]]) rt.scene.add(nobori(W, x, z, 'todo', 6));
    for (const [x, z] of [[II_HQ.x - 6, II_HQ.z - 6], [II_HQ.x - 6, II_HQ.z + 6]]) rt.scene.add(kagaribi(W, x, z));
    KIT.farVillage(rt, -48, -150, { rot: Math.PI / 2, n: 6, fields: 6, seed: 1406 });   // 若江の村
    KIT.farVillage(rt, -96, 150, { rot: Math.PI / 2, n: 6, fields: 6, seed: 1407 });    // 八尾の村
    // ---- 遠くの控え（軽い大軍）：井伊・藤堂の後ろ、大坂方の後ろ ----
    KIT.farHost(rt, START.x + 64, START.z + 6, 34, 18, 260, -Math.PI / 2, ARMOR.akazonae, 'ii', 14061, 'spear');
    KIT.farHost(rt, TODO_HQ.x + 40, TODO_HQ.z - 8, 36, 18, 280, -Math.PI / 2, ARMOR.tokugawa, 'todo', 14062, 'spear');
    KIT.farHost(rt, -150, -96, 30, 16, 220, Math.PI / 2, KIMURA.armor, 'toyotomi', 14063, 'spear');
    KIT.farHost(rt, -150, 108, 34, 16, 260, Math.PI / 2, CHOSO.armor, 'chosokabe', 14064, 'spear');
    // ---- 二つの前線の大軍（軽い作り）：陣形と陣形が一本の線で組み合う ----
    F.cW = clash(rt, { x: 14, z: -164, facing: -Math.PI / 2, w: 70, gap0: 14, seed: 14065, noRout: true,
      A: { flag: 'ii', armor: ARMOR.akazonae, count: 420, team: 0, faction: 'tokugawa', guns: true },
      B: { flag: 'toyotomi', armor: KIMURA.armor, count: 400, team: 1, faction: 'toyotomi', guns: true } });
    // 若江の堤の前（持ち場から六十メートルほど先）で、井伊の先手と木村の先手がもう組み合っている（軽い作り。本物の兵の数は変えない）
    F.cWnear = clash(rt, { x: 2, z: -100, facing: -Math.PI / 2, w: 44, gap0: 0, seed: 14067, noRout: true, noWake: true, host: false,
      A: { flag: 'ii', armor: ARMOR.akazonae, count: 120, team: 0, faction: 'tokugawa' },
      B: { flag: 'toyotomi', armor: KIMURA.armor, count: 110, team: 1, faction: 'toyotomi' } });
    F.cWnear?.go?.();
    F.cY = clash(rt, { x: YAO_FRONT.x + 6, z: YAO_FRONT.z + 34, facing: -Math.PI / 2, w: 90, gap0: 18, seed: 14066, noRout: true,
      A: { flag: 'todo', armor: ARMOR.tokugawa, count: 520, team: 0, faction: 'tokugawa', guns: true },
      B: { flag: 'chosokabe', armor: CHOSO.armor, count: 540, team: 1, faction: 'toyotomi' } });

    // ---- 徳川方（若江）：井伊直孝の旗本・先手（川手良列）・自分の手勢 ----
    F.iiG = allyGroup(rt, { faction: 'tokugawa', name: '井伊直孝の旗本', fullStrength: true, anchor: { x: START.x + 14, z: START.z }, facing: -Math.PI / 2, width: 8, aggro: 6, seekRange: 12, order: 'hold', noRout: true, formation: 'yari' },
      dress([named('井伊直孝', 'busho', { invuln: true }), { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8, o: { flagScale: 1 } }], II));
    F.iiU = F.iiG.units.find((u) => u.name === '井伊直孝');
    F.sakiG = allyGroup(rt, { faction: 'tokugawa', name: '井伊の先手', fullStrength: true, anchor: { x: START.x - 14, z: START.z - 18 }, facing: -Math.PI / 2, width: 12, aggro: 10, order: 'hold', noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([named('川手良列', 'samurai', { invuln: true }), { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 14, o: { flagScale: 1 } }, { type: 'gun', n: 5 }], II));
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', fullStrength: true, anchor: { x: START.x - 10, z: START.z + 12 }, facing: -Math.PI / 2, width: 10, aggro: 10, order: 'hold', noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12, o: { flagScale: 1 } }, { type: 'gun', n: 4 }, { type: 'bow', n: 2 }], II));
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: START.x - 2, z: START.z + 8 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 12) }]);

    // ---- 大坂方（若江）：木村重成の本隊と両翼 ----
    const kimO = { faction: 'toyotomi', facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, noRout: true, formation: 'yari', morale: 95, dmgMult: 0.4, defMult: 1.1 };
    F.kimuraG = enemyGroup(rt, { ...kimO, name: '木村重成の本隊', anchor: { ...WAKAE }, width: 10, aggro: 8, seekRange: 16, order: 'hold' },
      dress([named('木村重成', 'busho', { invuln: true }), { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 12, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], KIMURA));
    F.kimuraU = F.kimuraG.units.find((u) => u.name === '木村重成');
    F.yamaG = enemyGroup(rt, { ...kimO, name: '山口弘定の手', anchor: { ...YAMA }, width: 10, aggro: 12, seekRange: 30, order: 'hold' },
      dress([named('山口弘定'), { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 13, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], KIMURA));
    F.naitoG = enemyGroup(rt, { ...kimO, name: '内藤長秋の手', anchor: { ...NAITO }, width: 10, aggro: 12, seekRange: 30, order: 'hold' },
      dress([named('内藤長秋'), { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12, o: { flagScale: 1 } }, { type: 'bow', n: 3 }], KIMURA));
    F.wingN0 = aliveN(F.yamaG) + aliveN(F.naitoG);

    // ---- 八尾：藤堂の先手（高刑・桑名）と長宗我部の伏兵 ----
    const todoO = { faction: 'tokugawa', facing: -Math.PI / 2, order: 'hold', noRout: true, formation: 'yari', dmgMult: 0.5 };
    F.takanoriG = allyGroup(rt, { ...todoO, name: '藤堂高刑の手', fullStrength: true, anchor: { x: YAO_FRONT.x + 40, z: YAO_FRONT.z - 12 }, width: 10, aggro: 10 },
      dress([named('藤堂高刑', 'samurai', { invuln: true }), { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }], TODO));
    F.kuwanaG = allyGroup(rt, { ...todoO, name: '桑名吉成の手', fullStrength: true, anchor: { x: YAO_FRONT.x + 44, z: YAO_FRONT.z + 12 }, width: 10, aggro: 10 },
      dress([named('桑名吉成', 'samurai', { invuln: true }), { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9, o: { flagScale: 1 } }], TODO));
    F.todoG = allyGroup(rt, { ...todoO, name: '藤堂高虎の旗本', fullStrength: true, anchor: { ...TODO_HQ }, width: 6, aggro: 5, seekRange: 10 },
      dress([named('藤堂高虎', 'busho', { invuln: true }), { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }], TODO));
    const choO = { faction: 'toyotomi', facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, noRout: true, formation: 'yari', morale: 96, dmgMult: 0.4, defMult: 1.15 };
    F.choA = enemyGroup(rt, { ...choO, name: '長宗我部の先手', anchor: { x: YAO_FRONT.x - 22, z: YAO_FRONT.z }, width: 14, aggro: 12, seekRange: 26, order: 'hold', ambush: true },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16, o: { flagScale: 1 } }, { type: 'gun', n: 3 }], CHOSO));
    F.choG = enemyGroup(rt, { ...choO, name: '長宗我部盛親の旗本', anchor: { ...YAO }, width: 8, aggro: 6, seekRange: 12, order: 'hold' },
      dress([named('長宗我部盛親', 'busho', { invuln: true }), { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8, o: { flagScale: 1 } }], CHOSO));
    F.choU = F.choG.units.find((u) => u.name === '長宗我部盛親');

    W.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', STEP_TEXT[0], 'main');
    // 戦の前：道明寺の報せ・若江と八尾へ分かれる
    const me = nm(rt);
    const L = [['使番', '道明寺口で後藤又兵衛が討たれたとの報せ！', 0.5], ['井伊直孝', '大坂方は河内の田へも出てきた。若江に木村長門守（重成）の旗', 3.6],
      ['使番', '八尾には長宗我部盛親。藤堂殿の手が向かわれました', 7.0], [me, '木村殿は、まだ二十三と聞きまする', 10.2],
      ['井伊直孝', '若いが、死ぬ気の者は手強い。赤備えの名にかけて、木村を討て', 13.0]];
    for (const [who, s, t] of L) rt.after(t, () => rt.say(who, s, 2.9));
    rt.after(16.4, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t; F.holdPlayer = false;
    rt.setPhase('battle');
    sfx('horagai', 0.9);
    rt.after(1.2, () => sfx('taiko', 0.8));
    this.stage(rt, 1);
    // 若江：両軍が寄せ合う。八尾：藤堂の先手が堤へ寄る
    F.cW?.go?.();
    for (const g of [F.sakiG, F.mine]) { g.order = 'attack'; g.seekRange = 70; g.aggro = 14; }
    for (const g of [F.yamaG, F.naitoG]) { g.order = 'attack'; g.seekRange = 70; }
    for (const g of [F.takanoriG, F.kuwanaG]) { g.order = 'move'; g.dest = { x: YAO_FRONT.x + 6, z: g.anchor.z }; g.speed = 3.2; }
    rt.army.play('toki', { x: WAKAE.x + 20, z: WAKAE.z }, 1.4);
    // 八尾の出来事（二正面を同時に）：長宗我部の伏兵が立つ → 藤堂高刑・桑名吉成が次々に討たれる
    rt.after(14, () => this.yaoAmbush(rt));
    rt.after(38, () => this.fall(rt, F.takanoriG, '藤堂高刑', '八尾で藤堂高刑様、お討死！'));
    rt.after(64, () => this.fall(rt, F.kuwanaG, '桑名吉成', '桑名吉成様もお討死！　藤堂勢、崩れかかっております'));
    rt.after(72, () => { if (!F.ending) rt.banner('八尾の藤堂勢が押されている', '長宗我部盛親、優勢'); });
  },

  stage(rt, n) {
    const F = rt.flags;
    F.step = n; F.st0 = rt.t;
    rt.obj('main', STEP_TEXT[n - 1], 'main');
    if (n === 2) {
      rt.say('井伊直孝', '両翼が崩れた。木村の本隊へかかれ！', 2.8);
      rt.after(3, () => rt.say('木村重成', '長門守重成これにあり。退く者は討て、一歩も引くな！', 3));
      F.kimuraU.invuln = false;
      F.kimuraU.maxHp = F.kimuraU.hp = Math.max(160, F.kimuraU.maxHp || 0);
      F.kimuraG.order = 'attack'; F.kimuraG.seekRange = 60; F.kimuraG.aggro = 16;
      F.cW?.push?.('A', 0.6);
      // 井伊の手の安藤重勝が木村の首を狙って寄る（史実で首を取った者）
      if (aliveReal(rt) + 4 <= REAL_CAP) {
        F.andoG = allyGroup(rt, { faction: 'tokugawa', name: '安藤重勝の手', fullStrength: true, anchor: { x: WAKAE.x + 34, z: WAKAE.z - 14 }, facing: -Math.PI / 2, width: 4, aggro: 14, seekRange: 50, order: 'attack', noRout: true, dmgMult: 0.6 },
          dress([named('安藤重勝', 'samurai', { invuln: true }), { type: 'ashigaru', n: 3 }], II));
        F.andoG.focus = F.kimuraU;
      }
      F.iiG.order = 'move'; F.iiG.dest = { x: WAKAE.x + 40, z: WAKAE.z }; F.iiG.speed = 3;
    } else if (n === 3) {
      rt.say('井伊直孝', '八尾の藤堂殿が危うい。南へ駆け、長宗我部の横を突け！', 3.2);
      rt.after(3.4, () => rt.say(nm(rt), '承知。皆、南へ！', 2));
      F.cW?.rout?.('B', { hideAfter: 24 });
      for (const g of [F.kimuraG, F.yamaG, F.naitoG]) if (live(g)) { g.order = 'flee'; g.routed = true; }
      for (const g of [F.mine, F.sakiG]) { g.order = 'move'; g.dest = { x: FLANK.x + 14, z: FLANK.z - 8 }; g.speed = 4; }
    }
  },

  // 長宗我部の伏兵：堤に伏せた兵が、藤堂の先手が寄るのを待って一斉に立つ
  yaoAmbush(rt) {
    const F = rt.flags;
    if (F.ending) return;
    rt.banner('八尾', '長宗我部の兵が堤から一斉に立った');
    rt.army.play('toki', YAO_FRONT, 1.5);
    F.cY?.go?.();
    F.cY?.push?.('B', 0.6);
    F.choA.order = 'attack'; F.choA.seekRange = 60;
    for (const g of [F.takanoriG, F.kuwanaG]) { g.order = 'attack'; g.seekRange = 40; }
    rt.after(1.5, () => rt.say('使番', '八尾の長宗我部、槍を伏せて待っておった！', 2.8));
  },

  // 名のある将の討死（筋書きどおり）
  fall(rt, g, name, line) {
    const F = rt.flags;
    if (F.ending || !g) return;
    const u = g.units.find((q) => q.name === name && q.alive);
    if (u) { u.invuln = false; rt.army.kill(u); }
    if (line) rt.say('使番', line, 3.2);
    g.order = 'retreat'; g.dest = { x: TODO_HQ.x - 10, z: g.anchor.z };
    F.cY?.push?.('B', 0.8);
    F.cY?.shake?.('A', 10);
  },

  // 若江：木村重成の最期（討てなければ安藤重勝が首を取る）
  kimuraEnd(rt, byMe) {
    const F = rt.flags;
    if (F.kimuraDone) return;
    F.kimuraDone = true;
    const U = F.kimuraU;
    if (U?.alive) { U.invuln = false; rt.army.kill(U); }
    rt.banner('木村重成、討死', '若江の堤に散る　二十三歳');
    if (byMe) rt.award((t) => { t.main = true; t.special = { label: '木村重成を討ち取った', pts: 40 }; }, '木村重成を討ち取った', U?.pos);
    else rt.award((t) => t.side.push('木村勢を崩した'), '木村勢を崩した');
    rt.say(byMe ? nm(rt) : '安藤重勝', byMe ? '木村長門守、討ち取ったり！' : '木村長門守重成、安藤長三郎が討ち取ったり！', 3);
    rt.after(3.4, () => rt.say('井伊直孝', '……兜に香が焚き込めてある。討たれる覚悟で出てきたか', 3.4));
    rt.after(7.4, () => this.stage(rt, 3));
  },

  // 八尾の横を突く：長宗我部の横の備が北を向いて受ける
  flank(rt) {
    const F = rt.flags;
    if (F.flankOn) return;
    F.flankOn = true; F.flankT = rt.t;
    const n = Math.max(6, Math.min(16, REAL_CAP - aliveReal(rt)));
    F.choSide = enemyGroup(rt, { faction: 'toyotomi', name: '長宗我部の横の備', anchor: { x: FLANK.x - 4, z: FLANK.z + 16 }, facing: Math.PI, fleeDir: { x: -1, z: 0 }, width: 10, noRout: true, formation: 'yari',
      morale: 90, dmgMult: 0.55, order: 'attack', seekRange: 50, aggro: 14 },
    dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: n - 2, o: { flagScale: 1 } }], CHOSO));
    F.sideN0 = aliveN(F.choSide);
    F.cY?.push?.('A', 0.5);
    F.cY?.shake?.('B', 20);
    rt.army.play('toki', FLANK, 1.4);
    rt.say('長宗我部盛親', '北から赤備えじゃと……！　木村は崩れたか', 3);
  },

  // 長宗我部が退く（勝ち）
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    F.cY?.rout?.('B', { hideAfter: 24 });
    for (const g of [F.choA, F.choG, F.choSide]) if (live(g)) { g.order = 'flee'; g.routed = true; }
    sfx('horagai', 0.9);
    rt.award((t) => { t.main = true; t.special = t.special || { label: '長宗我部を八尾から退かせた', pts: 30 }; }, '長宗我部を八尾から退かせた');
    rt.banner('長宗我部、退く', '慶長二十年五月六日　八尾・若江の戦い');
    rt.say('藤堂高虎', '……長宗我部が退くぞ。だが、追う力は残っておらぬ', 3.4);
    rt.after(3.8, () => rt.say('井伊直孝', '木村も長宗我部も、明日は大坂の城の前じゃ', 3.2));
    rt.after(7.4, () => rt.say('藤堂高虎', '八尾では身内を多く失うた。高刑も、桑名も……', 3.4));
    rt.after(11, () => rt.say('使番', '大御所様より。明日、天王寺と岡山で総懸かりとの仰せ', 3.4));
    rt.finish({ scriptedEnd: true }, 15);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.tracker.main = false;
    rt.objFail('main');
    F.cY?.rout?.('A', { hideAfter: 20 });
    rt.banner('八尾の藤堂勢が崩れた', '昼までに長宗我部を止められなかった');
    rt.say('井伊直孝', '遅かったか……藤堂殿の手が崩れた', 3);
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.begun) return;
    KIT.backTick(rt);
    const P = rt.player.u, el = rt.t - F.st0;
    // 見えない壁
    if ((F.wallT = (F.wallT || 0) - dt) <= 0) {
      F.wallT = 0.25;
      for (const u of rt.army.units) {
        if (!u.alive || u.gone) continue;
        if (u.pos.x > 248) u.pos.x = 248; else if (u.pos.x < -248) u.pos.x = -248;
        if (u.pos.z > 248) u.pos.z = 248; else if (u.pos.z < -248) u.pos.z = -248;
      }
    }
    // 手勢は主人公の近くで戦う（離れたら寄る）
    if ((F.menT = (F.menT || 0) - dt) <= 0) {
      F.menT = 0.5;
      const c = live(F.mine) && F.mine.center();
      if (c) {
        if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > 12) { F.mine.order = 'move'; F.mine.dest = { x: P.pos.x + 2, z: P.pos.z + 3 }; F.mine.speed = 4.2; }
        else { F.mine.order = 'attack'; F.mine.seekRange = 18; }
      }
    }
    if (rt.t - F.t0 > LIMIT) return this.lose(rt, '昼までに八尾の長宗我部を退かせられなかった');
    if (!F.warned && rt.t - F.t0 > LIMIT - 60) { F.warned = true; rt.say('使番', '八尾の藤堂勢、もう持ちませぬ！　お急ぎを', 3); }
    if (F.step === 1) {
      // 両翼（山口・内藤）を三分の一まで減らすか、九十秒しのげば両翼が崩れる
      const left = aliveN(F.yamaG) + aliveN(F.naitoG);
      if (el > 20 && !F.kawate && left < F.wingN0 * 0.7) {
        // 井伊の先手の川手良列が深入りして討たれる（史実）
        F.kawate = true;
        const u = F.sakiG.units.find((q) => q.name === '川手良列' && q.alive);
        if (u) { u.invuln = false; rt.army.kill(u); rt.say('井伊の侍', '川手良列殿、深入りしてお討死！', 2.8); }
      }
      // 時間の保険は、主人公が若江の前線で戦っている時だけ（何もしないで段が進まない）
      const atFront = dist(P.pos, WAKAE) < 60;
      if (atFront && ((el > 25 && left <= F.wingN0 * 0.35) || el > 90)) {
        for (const g of [F.yamaG, F.naitoG]) if (live(g)) { g.order = 'flee'; g.routed = true; }
        if (F.yamaG.units.some((u) => u.name === '山口弘定' && u.alive)) this.fall2(rt, F.yamaG, '山口弘定');
        if (F.naitoG.units.some((u) => u.name === '内藤長秋' && u.alive)) this.fall2(rt, F.naitoG, '内藤長秋');
        rt.award((t) => t.side.push('若江で木村勢の両翼を崩した'), '若江で木村勢の両翼を崩した');
        rt.banner('若江', '山口弘定・内藤長秋、討死');
        this.stage(rt, 2);
      }
    } else if (F.step === 2) {
      // 木村は主人公が近くに来るまで討たれない（味方だけで段が進まない）
      if (F.kimuraU?.alive) F.kimuraU.invuln = dist(P.pos, F.kimuraU.pos) > 25;
      if (!F.kimuraDone && F.kimuraU && !F.kimuraU.alive) this.kimuraEnd(rt, F.kimuraByMe);
      else if (!F.kimuraDone && el > 85 && F.kimuraU && dist(P.pos, F.kimuraU.pos) < 25) this.kimuraEnd(rt, false);
    } else if (F.step === 3) {
      if (!F.flankOn && dist(P.pos, FLANK) < 22) this.flank(rt);
      if (F.flankOn) {
        const fe = rt.t - F.flankT;
        if ((fe > 15 && aliveN(F.choSide) <= F.sideN0 * 0.5) || (fe > 75 && dist(P.pos, FLANK) < 40)) this.win(rt);
      }
      // 若江に残った敵は去らせる（本物の兵の枠を空ける）
      if ((F.gcT = (F.gcT || 0) - dt) <= 0) {
        F.gcT = 1;
        for (const g of [F.kimuraG, F.yamaG, F.naitoG]) if (g) for (const u of g.units) if (u.alive && !u.gone && dist(u.pos, P.pos) > 70) rt.army.despawn(u);
      }
    }
  },

  // 若江の両翼の将の討死（崩れた隊の中で）
  fall2(rt, g, name) {
    const u = g.units.find((q) => q.name === name && q.alive);
    if (u) { u.invuln = false; rt.army.kill(u); }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '木村重成' && k && k.isPlayer) F.kimuraByMe = true;
    if (v.team === 1 && k && k.isPlayer && (v.name === '山口弘定' || v.name === '内藤長秋')) rt.award((t) => { t.special = { label: `${v.name}を討ち取った`, pts: 15 }; }, `${v.name}を討ち取った`, v.pos);
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name && !rt.flags.ending) rt.bark(`${g.name}が崩れた`);
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step || F.ending) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    let e = F.step === 2 && F.kimuraU?.alive && dist(F.kimuraU.pos, u.pos) < 14 ? F.kimuraU : b.army.nearestEnemy(u, F.step === 3 && !F.flankOn ? 4 : 9, ok);
    if (e && !ok(e)) e = null;
    // 横を突いてからは、長宗我部の横の備から離れた敵を追わない（追って遠くへ行くと終わらない）
    if (e && F.step === 3 && F.flankOn && dist(e.pos, FLANK) > 30) e = null;
    // 同じ敵を8秒突いても倒れない時は、あきらめて行き先へ進む（突き続けて動けなくなるのを防ぐ）
    if (e) {
      if (F.botFoe !== e) { F.botFoe = e; F.botFoeT = b.t; }
      if (b.t - F.botFoeT > 8) { if (b.t - F.botFoeT > 14) F.botFoeT = b.t; e = null; }
    } else F.botFoe = null;
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    // 6秒たっても1.5mも動けない時は、味方の人垣に挟まれている：3秒だけ横へ抜ける
    if (!F.botPos || Math.hypot(F.botPos.x - u.pos.x, F.botPos.z - u.pos.z) > 1.5) { F.botPos = { x: u.pos.x, z: u.pos.z }; F.botPosT = b.t; }
    else if (b.t - F.botPosT > 6) { F.botWig = b.t + 3; F.botWigA = Math.random() * Math.PI * 2; F.botPosT = b.t; }
    if (F.botWig > b.t) { goTo(p, inp, u.pos.x + Math.cos(F.botWigA) * 12, u.pos.z + Math.sin(F.botWigA) * 12, 1); return; }
    const t = k14_yao_wakae.missionPin(b) || WAKAE;
    goTo(p, inp, t.x, t.z, 2.5);
  },
};

k14_yao_wakae.force = (rt) => ({ a: Math.max(0, 8200 - (rt.flags.ak || 0) * 18), a0: 8200, b: Math.max(0, 10000 - (rt.flags.ek || 0) * 22), b0: 10000 });
k14_yao_wakae.date = () => '慶長二十年（1615）五月六日　朝・初夏　河内国 若江・八尾';
k14_yao_wakae.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k14_yao_wakae.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k14_yao_wakae.history = '慶長二十年（1615）五月六日、大坂夏の陣で大坂方は城を出て河内の田の中で徳川方を迎え撃った。同じ朝、南の道明寺では後藤又兵衛が討たれている。若江では木村重成のおよそ四千七百が、井伊直孝の赤備えおよそ三千二百と正面からぶつかった。木村勢は藤堂勢の右翼を退けたが、井伊勢との戦いで山口弘定・内藤長秋らが討たれ、重成も井伊家の安藤重勝（長三郎）に討たれた。二十三歳であった。八尾では長宗我部盛親のおよそ五千三百が長瀬川の堤に兵を伏せ、寄せてきた藤堂高虎の先手を一斉に迎え撃って崩し、藤堂高刑・桑名吉成ら藤堂家の将が次々に討たれた。しかし若江の木村勢が崩れると、横を突かれるのを恐れた長宗我部は大坂へ退いた。藤堂・井伊とも損害が大きく、翌日の天王寺・岡山の戦いでは先手を外された。\n重成の首実検で、兜に香が焚き込められていたのを家康が褒めたという話は、後の書物に伝わる逸話である。主人公の組の動き、二つの戦場の間の道のり（実は2kmあまり）は遊びのための筋書きで、兵の数は史料により異なる。';

// 戦の進行の札（段）：F.step の 1〜3
setStages('k14_yao_wakae', [['若江で木村勢の両翼を崩す'], ['木村重成を討つ', 2], ['八尾で長宗我部の横を突く', 3]]);

export { k14_yao_wakae };
export default k14_yao_wakae;
