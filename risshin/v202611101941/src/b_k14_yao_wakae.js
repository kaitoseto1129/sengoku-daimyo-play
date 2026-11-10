// ======================================================================
// 徳川編 14　八尾・若江の戦い（慶長二十年 1615・五月六日の朝）　大坂夏の陣、河内の田の中の二つの戦
// 筋書きの正：docs/chapter3_tokugawa.md の「14. 八尾・若江」。一つの大きな地図で二正面を同時に戦う。
// 右（北）＝若江：木村重成のおよそ四千七百と、井伊直孝の赤備えおよそ三千二百の正面の戦い。木村重成は討死（必ず）。
// 左（南）＝八尾：長宗我部盛親のおよそ五千三百が長瀬川の堤に伏せ、藤堂高虎の五千を迎え撃つ。
//   藤堂の先手は崩れ、藤堂高刑・桑名吉成らが次々に討たれる。若江で木村が崩れると、横を突かれるのを恐れて長宗我部は大坂へ退いた。
// 主人公は徳川方、井伊直孝の手に付く。手本の調べ：docs/battle_refs/k14_yao_wakae.md
// 見せかけの軍勢は置かない（AA・AF・AP9・AQ6・AT4）。見える兵は全部本物で、初めから持ち場に並ぶ（湧かせない。AT17）。
//   兵の比は史実どおり：徳川方 8200（井伊3200・藤堂5000）対 大坂方 10000（木村4700・長宗我部5300）。本物もおよそ百対百二十。
//   井伊直孝・藤堂高虎は後ろの本陣、長宗我部盛親は長瀬川の向こうの本陣で旗本に囲まれ動かない（AR3・AT3）。木村重成は史実で自ら戦ったので若江の堤に。
// 段（11/8 kaito docs/toku15_plan_1108.md の 14：主人公は真ん中から、まず八尾、伝令を受けて若江へ移る）：
//   ①八尾の北の長宗我部の横の備 ②若江の南の田の内藤長秋の隊 ③北の田の山口弘定の隊 ④若江の堤の木村重成
// 勝ち＝木村重成が討たれて若江が崩れ、横を突かれるのを恐れた長宗我部が八尾から大坂へ退く（二つの戦場がつながる）。刻限だけでは達成にも負けにもしない。
// 向き：北が -z、東が +x。徳川方は東（生駒の麓の方）から西（大坂）へ向かう。西を向くと右が若江、左が八尾。
// 地形：国土地理院の標高（asset_dem_yaowakae.js。node prototype/tools/dem.mjs yaowakae で作る）。河内の低い田で起伏はほぼ無い。
//   今の道や堤の高まりは丸めて薄め、旧大和川の分かれ（玉串川・長瀬川）と堤は手で描き戻す。間隔は縮めた復元（実の若江と八尾は 2km あまり）。
// ======================================================================
import { BATTLE_ASSETS, assetsForBattle } from './asset_manifest.js';
import { demDetail } from './dem.js';
import { nobori } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { enemyGroup, allyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { KIT } from './b_nagashinojo.js';
import { timeslipField } from './timeslip_field.js';
import { KILLS, cut, standing as fieldStanding } from './stages.js';
import { setStages } from './b_k_help.js';
import * as jin14 from './k14/jindate.js';
import { DEPTH14 } from './k14/depth.js';   // 陣立ての表（army_depth.js）   // 二正面の軽い大軍と遠くの乱戦・家臣の守り・棒立ちなし（11/8）

BATTLE_ASSETS.k14_yao_wakae = Object.freeze([...assetsForBattle('k14_yao_wakae')]);
const dem = null; // 標高の素材は素材の枝で入れる（今は平らな地形）

// ---- 場所（ゲームの座標。1 は実の 12m ほど） ----
const DEM_XY = 12;
const START = { x: 96, z: 6 };            // 主人公の寄せ口（二つの戦場の真ん中の東。左＝南に八尾、右＝北に若江）
const II_FRONT = { x: 86, z: -92 };       // 井伊勢の寄せ口（若江の東の田）
const WAKAE = { x: -6, z: -96 };           // 若江の堤（木村重成の陣）
const YAMA = { x: 16, z: -128 };           // 木村の右翼・山口弘定（北）
const NAITO = { x: 14, z: -66 };           // 木村の左翼・内藤長秋（南）
const YAO = { x: -84, z: 108 };            // 長宗我部盛親の本陣（長瀬川の堤の向こう）
const YAO_FRONT = { x: 2, z: 100 };        // 八尾の前線（藤堂勢と長宗我部勢がぶつかる所）
const CHO_A = { x: -22, z: 100 };          // 長宗我部の先手（長瀬川の堤の前）
const FUSE = { x: -48, z: 98 };            // 長瀬川の東岸の堤上に伏せた槍（①で主人公の目の前で一斉に立つ）
const FLANK = { x: -22, z: 70 };           // 長宗我部の横の備（先手の北の端。北から突く所）
const FLANK_GO = { x: FLANK.x + 10, z: FLANK.z - 16 };   // ④で井伊の隊が駆ける先（一度だけ出す。行き先を替え続けると隊は合図を待って動かない）
const TODO_HQ = { x: 118, z: 118 };        // 藤堂高虎の本陣
const II_HQ = { x: 122, z: -104 };         // 井伊直孝の本陣
const TAMA = [[46, -260], [40, -150], [48, -60], [40, 30], [46, 140], [40, 260]];        // 玉串川（北へ流れる）
const NAGASE = [[-62, -260], [-56, -150], [-64, -40], [-52, 60], [-58, 160], [-52, 260]]; // 長瀬川（八尾の堤）
const WAKAE_DIKE = [[-8, -150], [-6, -120], [-8, -96], [-5, -70], [-8, -44]];   // 若江の堤（村の東を南北に通る。木村の本隊が立つ）
const ROAD = [[250, -40], [160, -60], [90, -20], [44, 0], [-10, 10], [-60, 6], [-250, 0]];  // 東西の道（八尾と若江の間）
const STEP_TEXT = ['', '南の八尾へ駆け、藤堂勢を押す長宗我部の横の備を突き破り、長瀬川の堤の伏せ槍を退ける', '北の若江へ戻り、南の田の内藤長秋の隊を追い払う',
  '若江の北の田で、山口弘定の隊を追い払う', '若江の堤に立つ木村重成を討つ'];   // 「崩す」は使わない（kaito_standard 三1）
const STEP_T = [0, 110, 100, 90, 100];   // この秒を過ぎると味方の押しが強まり、主人公が遅れても物語は進む（負けにも、果たせなかった印にもしない。二5・三3・十二3）
const STEP_AT = [null, FLANK, NAITO, YAMA, WAKAE];
const PIN_NAME = ['', '八尾の横の備', '若江の内藤隊', '若江の山口隊', '若江の木村重成'];
const NAITO_GO = { x: NAITO.x + 22, z: NAITO.z + 10 };   // ②で八尾から若江の南の田へ駆ける先
const KEEP = 0.4;                          // 段の隊は四割まで減れば崩れて退く（倒す数＝六割）
const ARMOR = KIT.ARMOR;
// 井伊の赤備え・藤堂勢・木村勢・長宗我部勢の装い
const II = { armor: ARMOR.akazonae, cloth: 0x8e2a1e, lace: 0xa0402a, flag: 'ii' };
const TODO = { armor: 0x24221f, cloth: 0x4a4632, lace: 0x5a5a3a, flag: 'todo' };
const KIMURA = { armor: 0x2c2a2a, cloth: 0x4a3a2a, lace: 0x6a5a2a, flag: 'toyotomi' };
const CHOSO = { armor: 0x2a2622, cloth: 0x3a4a2a, lace: 0x4a6a2a, flag: 'chosokabe' };
const dress = (list, kit) => list.map((s) => ({ ...s, o: { ...kit, ...(s.o || {}) } }));
// 名のある武将の姿（その人だけの具足・兜・陣羽織）
const LOOK = {
  井伊直孝: { armor: 0xa52b1c, lace: 0x6b5a40, hat: 'kabuto_tentsuki', mon: 'ii', horse: true },   // 手本：docs/generals_look_1108/井伊直孝.md（燻韋威・陣羽織は伝わらない）
  // 重成は白い母衣を負って馬上で戦い、庵原朝昌の十文字槍に母衣を掛けられて落ちたと伝わる（battle_learn）
  木村重成: { horo: 0xe8e2d4, horse: true }, // 具足・兜・紋は共通の復元案に揃える。母衣は従来の伝承表現。
  長宗我部盛親: { horse: true }, // 甲冑・兜・旗は共通表の復元案に揃える。
  藤堂高虎: { armor: 0x151312, lace: 0x3a3a2a, hat: 'kabuto_t', haori: 0x3a2a1a, mon: 'todo', horse: true },
  山口弘定: { armor: 0x2a2420, lace: 0x7a5a2a, hat: 'kabuto_f', haori: 0x4a3a22 },
  内藤長秋: { armor: 0x22241e, lace: 0x6a4a3a, hat: 'kabuto_w', haori: 0x3a2e24 },
  藤堂高刑: { armor: 0x24221f, lace: 0x5a4630, hat: 'kabuto_m', haori: 0x3a3424 },
  桑名吉成: { armor: 0x22241e, lace: 0x4a5a3a, hat: 'kabuto_f', haori: 0x2e3a2a },
  庵原朝昌: { armor: 0x9a2a1c, lace: 0xa0402a, hat: 'kabuto_f', haori: 0x7a1a12 },
  川手良列: { armor: 0x9a2a1c, lace: 0xa0402a, hat: 'kabuto_m', haori: 0x7a1a12 },
  安藤重勝: { armor: 0x9a2a1c, lace: 0xa0402a, hat: 'kabuto_f', haori: 0x6a1a12 },
};
const named = (name, type = 'samurai', o = {}) => ({ type, n: 1, o: { name, ...LOOK[name], ...o } });

const sm = (a, b, v) => { const k = Math.max(0, Math.min(1, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
// 深手で伏せた者を案内し続けない。残兵・同行・行き先を同じ戦力判定に揃える。
const standing = (u) => fieldStanding(u) && !u.downed && !u.rearWound && u.hp > 0;
const stepAlive = (F) => aliveN(F.stepG) + (F.step === 1 ? aliveN(F.fuseG) : 0);   // 八尾では横の備と伏せ槍を合わせて数える
const live = (g) => g && g.units.some(standing);
// 段が変わっても、退く下知と敗走を前進・攻撃で取り消さない。
const canMarch = (g) => live(g) && !g.routed && g.order !== 'retreat' && g.order !== 'flee';
// 深手で戦えない者・後送済みの者は、目標の残兵に数えない（共通の戦力判定と揃える）。
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (standing(u) ? 1 : 0), 0) : 0);
// 横の備の討取りで伏せ槍の分を埋めない。両隊それぞれ六割を退ける。
const yaoLeft = (g) => Math.max(0, aliveN(g) - Math.floor(g.units.length * KEEP));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 到着と任務達成は、本人が戦える間だけ。次の段・終戦を待つ予約にも同じ条件を使う。
const canProgress = (rt) => !rt.over && !rt.ended && standing(rt.player.u) &&
  !rt.player.u.downed && !rt.player.u.rearWound && rt.player.u.hp > 0;
// 共通の被弾処理は invuln の武将も本人の攻撃で討つか、手傷で退かせる。
// 本陣の総大将と、まだ出番でない木村は持ち場を守り、出番で保護を外す。
const holdStoryPost = () => {};
function storyGuard(u, guarded) {
  if (!u) return;
  u.invuln = guarded;
  u.onWound = guarded ? holdStoryPost : null;
}

// ---- 地形：平らな河内の田。二本の川の堤だけが高い。国土地理院の起伏は丸めて薄く ----
// 旧大和川の分かれは天井川：細い流れの両岸に、田より背丈ほど高い堤（八3）
// 11/9 重さ：地面の高さを読むたびに三本の線への距離を五回測っていた（一コマの約 4%）。どの項も 24m より遠ければ同じ値なので、
//   線の四角から 24m 外なら測らずに遠い（Infinity）とする（sm は端で 0／1 に張り付くので答えは同じ）
const NEAR_BOX = new WeakMap();
function nearDist(x, z, line) {
  const pts = line.pts || line;
  let b = NEAR_BOX.get(pts);
  if (!b) {
    b = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [px, pz] of pts) { b[0] = Math.min(b[0], px); b[1] = Math.max(b[1], px); b[2] = Math.min(b[2], pz); b[3] = Math.max(b[3], pz); }
    b[0] -= 24; b[1] += 24; b[2] -= 24; b[3] += 24; NEAR_BOX.set(pts, b);
  }
  if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) return Infinity;
  return distToPolyline(x, z, line);
}
function levee(x, z, line, a = 3, b = 5, c = 7.5, e = 12) {
  const d = nearDist(x, z, line);
  return 2.4 * sm(a, b, d) * (1 - sm(c, e, d));
}
function height(x, z) {
  let h = 0.5 + 0.18 * Math.sin(x * 0.031 + 0.7) * Math.cos(z * 0.027) + 0.12 * Math.sin(z * 0.06 - x * 0.02);
  h += levee(x, z, TAMA) + levee(x, z, NAGASE, 3.5, 5.5, 8, 13) * 1.1;
  { const d = nearDist(x, z, WAKAE_DIKE); h += 1.6 * (1 - sm(2.5, 7, d)); }
  // 東の端は生駒の麓へゆるく上がる
  h += 0.06 * Math.max(0, x - 200);
  if (dem) {
    const away = sm(12, 24, Math.min(nearDist(x, z, TAMA), nearDist(x, z, NAGASE)));
    const r = demDetail(dem, x, z, { xy: DEM_XY, win: 14, scale: 0.22 });
    h += away * Math.max(-0.6, Math.min(0.6, r));
  }
  return h;
}

// 共通の行き先表示は hide でなく hideDistance を読む。未達成の間は六歩以内でも消さない。
const PIN = { x: 0, z: 0, r: 8, hide: 6, hideDistance: 0, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

const k14_yao_wakae = {
  resumeSteps: 4,   // 現在の四段の始まりを順に流して作り直す
  pacingWait: () => true,   // 共通の十八分打ち切りでも任務失敗にしない。各戦場への到着と突破を待つ（十二3）。
  // 身の回りの合戦の跡（timeslip_field.js）。八尾・若江：五月初めの田と堤。水を張った田の畦、ぬかるみ・水たまり、堤の葦
  timeslip: {
    wet: 0.6, dust: 0.1, trample: 0.3, debris: 1.2, arrows: 0.9, reeds: 0.45, maxSlope: 0.22,
    grass: 0x7e9a4c, grassTints: [0xffffff, 0xe4ecc4, 0xc8d49c], grassH: 1.15, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.9,
    flagColors: [0xe6dfcc, 0x24211e, 0x8e1f16],
  },
  noFrontFill: true,         // 見せかけの軍勢（奥の軽い乱戦・自動の大軍）を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noWake: true,
  noLeaderFollow: true,      // 行き先の印は段ごとの一つだけ
  stageGoalsOnly: true,      // 目標の札は五つの段だけ（段が五つあるので、埋めの「敵を八人討つ」で一段目が札から落ちていた。n6 X6）
  goalsAllRows: true,        // 五つを開戦前から並べ、果たした目標にも印を残す
  keepBattleSigns: true,    // 行き先を案内している間も、将の名前と目標一覧を残す。
  goalVisibleRows: 4,        // 現在の四段を最初から全部並べる（共通の札の既定は一行）
  goalRowsAhead: true,
  goalSignOnly: true,       // 共通の目標推測より、この戦が選んだ横の備・伏せ槍・木村への案内を優先する。
  goalSignNoLabel: true,     // ▼の上に「印へ進め」を出さない（何の印か分からない。三の1・AR1。n6 X7）
  goalSignDistanceAlways: true, // 十歩以内でも行き先の距離を消さない（critic60 五3）。
  distanceUnit: 'metres',    // 今の共通案内にも、場所名と距離を渡す。
  goalSignTriangle: true,    // 共通の行き先案内も、画面の端で回転する矢印に替えず▼で示す。
  noTaishoRaid: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,
  enemyTactics: false,       // 敵の動きはこの定義が決める（伏兵・崩れ・退き）
  noFieldMap: true,
  // 両軍の今の兵の数の棒は出す（hideArmyPeek を外した。九3・十二1）
  forceBarAlways: true,     // 共通の updateTug はこの指定が無い戦の棒を隠す。行き先の案内中も両軍の数を残す。
  hideGuideSteps: true,
  noPlayerFoot: true,
  nearbyAllySignLimit: 0,
  foeMarks: true,
  enemyTriangleSigns: true,
  enemyTriangleAll: true,   // 遠い木村勢・長宗我部勢も、密集を理由に敵の印を省かない（critic60 九3）。
  horseHurtMul: 0.45,   // 11/8 critic60（BH7）：馬がすぐ死んで八尾まで歩いた。馬の傷を軽く
  playerAtkMax: 3,
  playerTaken: 0.5,
  playerRegen: 0.025,
  closeCombatAssist: true,
  steadyMeleeCamera: true,
  noWinCrane: true,
  compactIntro: true,
  keepMix: false,
  minutes: 16,
  introText: () => '井伊直孝の赤備えに付く。南の八尾で長宗我部の横の備を突き破り、長瀬川の堤の伏せ槍を退ける。使番の知らせで北の若江へ戻り、内藤・山口の隊を追い払い、堤の木村重成を討つ。',
  // 行き先のピン：段ごとに一つ。場所の名と距離だけを添える。
  missionPin(rt) {
    const F = rt.flags;
    if (F.ending) return null;
    // 下知を待つ間も、最初の目標と同じ八尾の場所を示す。
    if (!F.step) {
      PIN.x = FLANK.x; PIN.z = FLANK.z; PIN.r = 8;
      PIN.label = PIN.destinationName = PIN_NAME[1]; PIN.destinationDistance = Math.ceil(dist(rt.player.u.pos, PIN));
      return PIN;
    }
    const g = F.step === 1 && aliveN(F.stepG) <= Math.floor(F.stepG.units.length * KEEP) && (F.fuseG?.ambush || live(F.fuseG)) ? F.fuseG : F.stepG;
    const at = g === F.fuseG ? FUSE : STEP_AT[F.step];
    let p = at;
    // 交戦で持ち場から離れても、残る敵を案内する。隊の重心は敗走兵や
    // 後送される兵に引かれ、元の場所へ戻すと無人の田で足止めになる。
    // 既に必要な人数を退けた隊は追わせず、持ち場への到着を待つ。
    const remaining = aliveN(g);
    const keep = F.step === 1 ? Math.floor(g.units.length * KEEP)
      : g.units.length - Math.round(g.units.length * (1 - KEEP));
    if (!g.ambush && remaining > keep) {
      let nearest = Infinity;
      const pos = rt.player.u.pos;
      for (const u of g.units) if (standing(u)) {
        const dx = u.pos.x - pos.x, dz = u.pos.z - pos.z, d = dx * dx + dz * dz;
        if (d < nearest) { nearest = d; p = u.pos; }
      }
    }
    // 横の備が崩れた後は、立ち上がった伏せ槍も退けるまで案内する。
    // 伏兵が立った瞬間に、空になった横の備へ印を戻さない。
    // 横の備が退いても、堤の伏せ槍を見届けるまでは八尾を離れない。
    // 横の備だけが六割減ったら伏せ槍へ案内する。両隊の合計を条件にすると、
    // 横の備の全十八人が倒れても合計三十二人の六割に届かず、印が切り替わらない。
    if (F.step === 1 && F.fuseG?.ambush && aliveN(F.stepG) <= Math.floor(F.stepG.units.length * KEEP)) p = FUSE;
    if (F.step === 4 && F.kimuraU?.alive) p = F.kimuraU.pos;
    PIN.x = p.x; PIN.z = p.z; PIN.r = 8;
    PIN.label = PIN.destinationName = g === F.fuseG ? '長瀬川の伏せ槍' : PIN_NAME[F.step];
    PIN.destinationDistance = Math.ceil(dist(rt.player.u.pos, PIN));
    return PIN;
  },
  // 右上の小さな地図の赤いひし形：今の目標の隊の居場所
  mapMarks(rt) {
    const pin = this.missionPin(rt);
    return pin ? [pin] : null;
  },
  sides: { a: { name: '徳川方', mon: 'ii' }, b: { name: '大坂方', mon: 'toyotomi' } },
  // 戦の前と後の会話（docs/chapter3_tokugawa.md の 14）。戦の中の台詞として出す
  talk: {
    before: [['井伊直孝', '若江に木村長門守（重成）の旗。若いが、死ぬ気の者は手強いぞ'], ['使番', '八尾には長宗我部盛親。藤堂殿が向かわれました'],
      ['井伊直孝', 'まず南の八尾へ駆け、藤堂勢を助けよ。使番が呼んだら若江へ戻り、木村を討て']],
    after: [['井伊直孝', '木村長門守の首は、大御所様の御前へお届けいたす'], ['藤堂高虎', '八尾では身内を多く失うた……長宗我部は退いた']],
  },
  spawn: { x: START.x - 6, z: START.z + 4, heading: -Math.PI / 2 },
  world: {
    seed: 1615506,
    noGroundArrows: true,   // 11/8 critic60（八1・BL5「槍や矢が宙で横になったまま・宙から刺さったように残る」）：遠くの乱戦の矢を着地で消す
    time: 'morning',
    mood: 'morning',          // 夜明けから朝の戦（井伊と木村は午前七時ごろ。低い朝日。二2）
    mist: 0.15,               // 河内の朝靄
    mistFar: 180,             // 朝靄で二つの戦場の間を白い壁にしない。
    smokeFogFloor: 80,        // 乱戦の硝煙でも、十歩先の兵を霧だけで消さない。
    clearAir: true,           // 遠い生駒と地平線を残す。兵の描画距離は増やさない。
    muddy: 0.5,               // 深田（足を取られる田）
    bloodInRiver: true,       // 水田も水中の判定になる。斬った跡を省かず、水面に赤い濁りを残す（critic60 四6）。
    groundHalf: 260,
    moveLim: 248,
    mountainScale: 0.38, mountainHaze: 0.62,   // 11/10 関所の写真：四方が白い野だけで地平が見えなかった。東の生駒・西の上町台地の影を薄く出す
      // 河内の平らな田：四方を高い山で囲まない。生駒は遠く霞む（八1・四5）
    mountainProfile(a, layer) {
      // 高さを縮めるだけでは四方の山の輪が残る。東の生駒だけを立て、ほかは裾（-12）へ沈める。
      const east = sm(0.5, 0.9, Math.sin(a));
      return -60 + (60 + [28, 62, 118][layer] * (0.8 + 0.2 * Math.cos(a * 5))) * east;
    },
    patchyGround: true,
    height,
    fieldStage: 'seedling',   // 旧暦五月六日（今の六月の初め）：植えたばかりの稲と水の張った田
    paddy(x, z) {
      // 11/9 重さ：兵の足元の水の深さのたびに呼ばれる。安い外し（端・畦の升）を先にし、線は四角の外なら測らない（答えは同じ）
      if (Math.abs(x) > 230 || Math.abs(z) > 230) return 0;
      const cell = Math.floor(x / 14) + Math.floor(z / 12);
      if (((cell % 4) + 4) % 4 === 1) return 0;
      if (Math.min(nearDist(x, z, TAMA), nearDist(x, z, NAGASE)) < 12 || nearDist(x, z, WAKAE_DIKE) < 6 || nearDist(x, z, ROAD) < 5) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.95;
    },
    riverCross: true,
    wadeDepth: 0.7,
    streams: [{ pts: TAMA, w: 2.6, depth: 0.55 }, { pts: NAGASE, w: 3.2, depth: 0.65 }],   // 細い流れ（幅広の川の中で斬り合わない）
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
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false; F.holdPlayer = true;
    // ---- 旗・本陣・村（旗は井伊・藤堂・豊臣・長宗我部だけ。AQ4） ----
    // 陣幕の奥の大将の床几（幕の真ん中から 4 北）が、総大将の居場所（旗本の隊の真ん中）に来るように置く（一2・十三4）
    KIT.honjin(rt, II_HQ.x, II_HQ.z + 4, { mon: 'ii', people: false, fire: false });   // 朝の七時：篝火は消してある
    KIT.honjin(rt, TODO_HQ.x, TODO_HQ.z + 4, { mon: 'todo', people: false, fire: false });
    KIT.honjin(rt, YAO.x, YAO.z + 4, { mon: 'chosokabe', people: false, fire: false });
    for (const [x, z] of [[II_FRONT.x + 8, II_FRONT.z - 10], [II_FRONT.x + 8, II_FRONT.z + 10]]) rt.scene.add(nobori(W, x, z, 'ii', 6));
    for (const [x, z] of [[WAKAE.x - 10, WAKAE.z - 8], [WAKAE.x - 10, WAKAE.z + 8], [YAMA.x - 8, YAMA.z], [NAITO.x - 8, NAITO.z]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
    for (const [x, z] of [[CHO_A.x - 10, CHO_A.z - 12], [CHO_A.x - 10, CHO_A.z + 12], [YAO.x - 4, YAO.z - 8], [YAO.x - 4, YAO.z + 8]]) rt.scene.add(nobori(W, x, z, 'chosokabe', 6));
    for (const [x, z] of [[TODO_HQ.x - 8, TODO_HQ.z - 8], [TODO_HQ.x - 8, TODO_HQ.z + 8], [74, 92], [74, 112]]) rt.scene.add(nobori(W, x, z, 'todo', 6));
    KIT.farVillage(rt, -48, -150, { rot: Math.PI / 2, n: 6, fields: 6, seed: 1406 });   // 若江の村
    KIT.farVillage(rt, -110, 160, { rot: Math.PI / 2, n: 6, fields: 6, seed: 1407 });   // 八尾の村

    // ---- 徳川方（若江）：井伊直孝は東の本陣で旗本の侍に囲まれ動かない。先手（川手良列）・安藤重勝・自分の手勢が前へ ----
    F.iiG = allyGroup(rt, { faction: 'tokugawa', name: '井伊直孝の旗本', fixed: true, fullStrength: true, anchor: { ...II_HQ }, facing: -Math.PI / 2, width: 6, aggro: 5, seekRange: 8, order: 'hold', noRout: true, formation: 'yari' },
      dress([named('井伊直孝', 'busho', { invuln: true, horse: false }), { type: 'samurai', n: 12 }], II));
    F.iiU = F.iiG.units.find((u) => u.name === '井伊直孝');
    F.sakiG = allyGroup(rt, { faction: 'tokugawa', name: '井伊の先手', fullStrength: true, anchor: { x: II_FRONT.x - 14, z: II_FRONT.z - 18 }, facing: -Math.PI / 2, width: 10, aggro: 10, order: 'hold', noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([named('川手良列', 'samurai', { invuln: true }), { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9, o: { flagScale: 1 } }, { type: 'gun', n: 6 }], II));
    // 井伊の右の先鋒・庵原朝昌（北の田の山口へ向かう。若江は徳川方が数で勝る：幕府九千五百 対 木村六千。battle_refs）
    F.iharaG = allyGroup(rt, { faction: 'tokugawa', name: '庵原朝昌の隊', fullStrength: true, anchor: { x: II_FRONT.x - 18, z: II_FRONT.z - 34 }, facing: -Math.PI / 2, width: 10, aggro: 10, order: 'hold', noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([named('庵原朝昌', 'samurai', { invuln: true }), { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], II));
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', fullStrength: true, anchor: { x: START.x - 10, z: START.z + 12 }, facing: -Math.PI / 2, width: 8, aggro: 10, order: 'hold', noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 5, o: { flagScale: 1 } }, { type: 'gun', n: 2 }, { type: 'bow', n: 1 }], II));
    F.andoG = allyGroup(rt, { faction: 'tokugawa', name: '安藤重勝の手', fullStrength: true, anchor: { x: II_FRONT.x + 2, z: II_FRONT.z - 4 }, facing: -Math.PI / 2, width: 4, aggro: 8, seekRange: 10, order: 'hold', noRout: true, dmgMult: 0.6 },
      dress([named('安藤重勝', 'samurai', { invuln: true }), { type: 'ashigaru', n: 3 }], II));
    // 井伊の騎馬武者（赤備えの騎馬）。④では主人公の脇を同じ馬の速さで八尾へ駆ける（徒の隊は馬に追いつけず、主人公一人が着いていた。一5・九4）
    F.kibaG = allyGroup(rt, { faction: 'tokugawa', name: '井伊の騎馬', fullStrength: true, anchor: { x: START.x - 4, z: START.z - 8 }, facing: -Math.PI / 2, width: 6, aggro: 10, order: 'hold', noRout: true, dmgMult: 0.8 },
      dress([{ type: 'cavalry', n: 6 }], II));
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: START.x - 2, z: START.z + 8 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 10) }]);

    // ---- 大坂方（若江）：木村重成の本隊（堤）と両翼（北の田の山口弘定・南の田の内藤長秋） ----
    const kimO = { faction: 'toyotomi', facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, noRout: true, formation: 'yari', morale: 95, dmgMult: 0.4, defMult: 1.1 };
    // 堤の守備は共通の出撃・武将の退避で野へ移さない。間近の敵には持ち場で応戦する。
    F.kimuraG = enemyGroup(rt, { ...kimO, name: '木村重成の本隊', fixed: true, stay: true, anchor: { ...WAKAE }, width: 8, aggro: 4, seekRange: 6, order: 'hold' },
      dress([named('木村重成', 'busho', { invuln: true, keep: true }), { type: 'samurai', n: 7 }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], KIMURA));
    F.kimuraU = F.kimuraG.units.find((u) => u.name === '木村重成');
    storyGuard(F.kimuraU, true);
    F.yamaG = enemyGroup(rt, { ...kimO, name: '山口弘定の隊', anchor: { ...YAMA }, width: 10, aggro: 12, seekRange: 24, order: 'hold' },
      dress([named('山口弘定'), { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'gun', n: 5 }], KIMURA));
    F.naitoG = enemyGroup(rt, { ...kimO, name: '内藤長秋の隊', anchor: { ...NAITO }, width: 10, aggro: 12, seekRange: 24, order: 'hold' },
      dress([named('内藤長秋'), { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10, o: { flagScale: 1 } }, { type: 'bow', n: 4 }], KIMURA));

    // ---- 八尾：藤堂の先手（高刑・桑名）・鉄砲衆・高虎の本陣、長宗我部の先手（堤の前に伏せる）・横の備・盛親の本陣 ----
    // 八尾は長宗我部が藤堂の先手を崩した戦（史実）。藤堂勢の槍は浅く、⑤の前に長宗我部の先手を削り切らない（二1）
    const todoO = { faction: 'tokugawa', facing: -Math.PI / 2, order: 'hold', noRout: true, formation: 'yari', dmgMult: 0.22 };
    F.takanoriG = allyGroup(rt, { ...todoO, name: '藤堂高刑の隊', fullStrength: true, anchor: { x: YAO_FRONT.x + 40, z: YAO_FRONT.z - 12 }, width: 10, aggro: 10 },
      dress([named('藤堂高刑', 'samurai', { invuln: true }), { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9, o: { flagScale: 1 } }], TODO));
    F.kuwanaG = allyGroup(rt, { ...todoO, name: '桑名吉成の隊', fullStrength: true, anchor: { x: YAO_FRONT.x + 44, z: YAO_FRONT.z + 12 }, width: 10, aggro: 10 },
      dress([named('桑名吉成', 'samurai', { invuln: true }), { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8, o: { flagScale: 1 } }], TODO));
    F.todoGun = allyGroup(rt, { ...todoO, name: '藤堂の鉄砲衆', fullStrength: true, anchor: { x: 76, z: 102 }, width: 8, aggro: 8, seekRange: 20 },
      dress([{ type: 'samurai', n: 2 }, { type: 'gun', n: 8 }], TODO));
    F.todoG = allyGroup(rt, { ...todoO, name: '藤堂高虎の旗本', fixed: true, fullStrength: true, anchor: { ...TODO_HQ }, width: 6, aggro: 5, seekRange: 8 },
      dress([named('藤堂高虎', 'busho', { invuln: true, horse: false }), { type: 'samurai', n: 10 }], TODO));
    const choO = { faction: 'toyotomi', facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, noRout: true, formation: 'yari', morale: 96, dmgMult: 0.4, defMult: 1.15 };
    // 先手は藤堂の先手を崩す側。主人公が堤の伏せ槍へ寄るまでは固い。
    F.choA = enemyGroup(rt, { ...choO, name: '長宗我部の先手', defMult: 1.8, anchor: { ...CHO_A }, width: 14, aggro: 12, seekRange: 22, order: 'hold', ambush: true },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 14, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], CHOSO));
    // 長瀬川の堤に伏せた槍（盛親は騎馬を下ろして槍を持たせ、堤に伏せた。battle_refs）。⑤で主人公が寄ると一斉に立つ（二3・十二4）
    F.fuseG = enemyGroup(rt, { ...choO, name: '長宗我部の伏せ槍', facing: Math.PI / 2, anchor: { ...FUSE }, width: 12, aggro: 4, seekRange: 6, order: 'hold', ambush: true, fixed: true },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12, o: { flagScale: 1 } }], CHOSO));
    F.choSide = enemyGroup(rt, { ...choO, name: '長宗我部の横の備', facing: Math.PI, anchor: { ...FLANK }, width: 10, aggro: 10, seekRange: 18, order: 'hold', morale: 90, dmgMult: 0.55 },
      // 布陣表だけの名にせず、横の備を率いる増田盛次を実際の侍一人に割り当てる（兵数は十八人のまま）。
      dress([named('増田盛次'), { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 13, o: { flagScale: 1 } }, { type: 'gun', n: 2 }], CHOSO));
    F.choG = enemyGroup(rt, { ...choO, name: '長宗我部盛親の旗本', fixed: true, anchor: { ...YAO }, width: 7, aggro: 5, seekRange: 8, order: 'hold' },
      dress([named('長宗我部盛親', 'busho', { invuln: true, horse: false }), { type: 'samurai', n: 11 }, { type: 'gun', n: 2 }], CHOSO));
    F.choU = F.choG.units.find((u) => u.name === '長宗我部盛親');
    // 総大将は陣幕の内の床几に腰を下ろし、動かない（一2・十三4）
    for (const [u, at] of [[F.iiU, II_HQ], [F.choU, YAO], [F.todoG.units.find((q) => q.name === '藤堂高虎'), TODO_HQ]]) if (u) { storyGuard(u, true); u.pos.x = at.x; u.pos.z = at.z; u._crouch = true; u._nest = true; }
    for (const g of [F.iiG, F.todoG, F.choG]) g.noFrontline = true;

    W.setTime('morning');
    rt.setPhase('brief');
    rt.obj('s1', STEP_TEXT[1], 'main');   // 下知までの間も右上は①（共通の「味方の旗へ」を出さない。十1）
    // 戦の前：夜明けの若江。道明寺の又兵衛の討死は昼前なので、ここでは言わない（二2）
    const me = nm(rt);
    // 下知までの待ちは15秒の内（五4）
    const L = [['使番', '朝靄の向こう、若江にも八尾にも大坂方の旗！', 0.5], ['井伊直孝', '若江の堤に木村長門守（重成）。八尾には長宗我部盛親', 2.9],
      ['使番', '八尾の藤堂殿、長宗我部の伏兵に押されておりまする', 5.5], ['井伊直孝', 'そなたは手勢と騎馬を連れて南へ駆け、長宗我部の横を突け', 8.1],
      [me, '承知。若江は', 10.4], ['井伊直孝', '若江はわしが受ける。呼んだら、すぐ戻れ', 12.3]];
    // 次の声と開戦の下知で、まだ読んでいる声を切らない。
    for (let i = 0; i < L.length; i++) {
      const [who, s, t] = L[i];
      const duration = Math.min(2.5, (L[i + 1]?.[2] ?? 14.6) - t);
      rt.after(t, () => rt.say(who, s, duration));
    }
    rt.after(14.6, () => this.begin(rt));
    jin14.install(rt, this);
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t; F.holdPlayer = false;
    rt.setPhase('battle');
    sfx('horagai', 0.9);
    rt.after(1.2, () => sfx('taiko', 0.8));
    this.toStep(rt, 1);
    // 若江：井伊の先手は玉串川の東で木村勢と向き合って構える（②の伝令で交戦）。八尾：藤堂の先手が堤へ寄る
    for (const g of [F.sakiG, F.iharaG, F.andoG]) { g.order = 'move'; g.dest = { x: g.anchor.x - 18, z: g.anchor.z }; g.speed = 2.6; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { ...q.dest }; }; }
    for (const g of [F.takanoriG, F.kuwanaG]) { g.order = 'move'; g.dest = { x: YAO_FRONT.x + 6, z: g.anchor.z }; g.speed = 3.2; }
    F.todoGun.order = 'move'; F.todoGun.dest = { x: YAO_FRONT.x + 30, z: YAO_FRONT.z }; F.todoGun.speed = 3;
    rt.army.play('toki', { x: YAO_FRONT.x + 20, z: YAO_FRONT.z }, 1.4);
    // 八尾の出来事（二正面を同時に）：長宗我部の伏兵が立つ → 藤堂高刑・桑名吉成が次々に討たれる
    rt.after(14, () => this.yaoAmbush(rt));
    // 討死は update で主人公が八尾へ着いてから起こす。時刻だけで遠方の声にしない。
  },

  // 段を進める（済んだ目標に印・新しい目標を足す）
  toStep(rt, n) {
    if (rt.over || rt.ended || rt.flags.ending) return;
    // 達成後の待ち時間に倒れても、回復した後の伝令を失わない。
    if (!canProgress(rt)) { rt.flags.pendingStep = n; return; }
    const F = rt.flags;
    F.pendingStep = 0;
    // 予約した討死が共通処理で見送られても、二将を生かしたまま若江へ移らない。
    // 一人ずつ実際の討死を確かめ、知らせを読み終えてから伝令を出す。
    if (n === 2 && F.step === 1) {
      for (const [g, name, line] of [[F.takanoriG, '藤堂高刑', '八尾で藤堂高刑様、お討死！'],
        [F.kuwanaG, '桑名吉成', '桑名吉成様もお討死！　藤堂勢、崩れかかっております']]) {
        if (!g.units.some((u) => u.name === name && u.alive && !u.gone)) continue;
        this.fall(rt, g, name, line);
        rt.after(3.6, () => this.toStep(rt, 2));
        return;
      }
    }
    if (F.step) rt.objDone('s' + F.step);
    F.next = false; F.pushed = false; F.stepNear = false;
    F.step = n; F.st0 = rt.t; F.stepT = rt.t;
    F.stepG = [null, F.choSide, F.naitoG, F.yamaG, F.kimuraG][n];
    // 伝令を待つ間に味方が討った兵も数える。残兵だけを始めの数にすると、全滅済みの隊で段が止まる。
    F.stepN = Math.max(1, F.stepG.units.length + (n === 1 ? F.fuseG.units.length : 0));
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    if (n === 1) {
      // 八尾へ：手勢と井伊の騎馬は主人公の脇を南へ駆ける（update が主人公の脇へ寄せ続ける。一5・九4）
      F.choSide.order = 'hold'; F.choSide.seekRange = 12; F.choSide.dmgMult = 0.4; F.choSide.defMult = 0.9;   // 赤備えが着くまでは槍を構えて待つ
      if (canMarch(F.todoGun)) { F.todoGun.order = 'attack'; F.todoGun.seekRange = 60; }
      for (const g of [F.mine, F.kibaG]) if (canMarch(g)) { g.order = 'move'; g.dest = FLANK_GO; g.speed = 6.2; g.noRun = false; g.focus = null; }
      rt.after(3, () => rt.say(nm(rt), '皆、南へ！　藤堂殿を助ける', 2.4));
    } else if (n === 2) {
      // 伝令：若江で井伊の隊と木村重成がぶつかった。八尾の戦いは後ろで続く
      rt.say('使番', '井伊隊、木村重成と交戦！　若江へお戻りを！', 3);
      rt.after(3.4, () => rt.say(nm(rt), '承知。皆、北へ！', 2));
      for (const g of [F.mine, F.kibaG]) if (canMarch(g)) { g.order = 'move'; g.dest = NAITO_GO; g.speed = 6.2; g.noRun = false; g.focus = null; }
      for (const g of [F.sakiG, F.iharaG]) if (canMarch(g)) { g.onArrive = null; g.order = 'attack'; g.seekRange = 70; g.aggro = 14; }
      F.naitoG.order = 'attack'; F.naitoG.seekRange = 60;
      if (canMarch(F.choSide)) { F.choSide.order = 'move'; F.choSide.dest = { ...CHO_A }; }
    } else if (n === 3) {
      rt.say('井伊直孝', '内藤は崩れた。北の田の山口を討て！', 2.8);
      F.yamaG.order = 'attack'; F.yamaG.seekRange = 60;
      // 南の田から北の田へも同行する。内藤の近くで攻め続けると、北の山口は索敵の外に残る。
      if (canMarch(F.kibaG)) { F.kibaG.order = 'move'; F.kibaG.dest = YAMA; F.kibaG.speed = 6.2; F.kibaG.focus = null; }
    } else if (n === 4) {
      rt.say('井伊直孝', '両翼が崩れた。堤の木村の本隊へかかれ！', 2.8);
      rt.after(3, () => rt.say('木村重成', '長門守重成これにあり。両将軍の首を取らずに、どこへ退けようか！', 3));
      storyGuard(F.kimuraU, dist(rt.player.u.pos, F.kimuraU.pos) > 25);
      // すでに受けた傷を段の切替で回復させない。
      F.kimuraU.maxHp = Math.min(F.kimuraU.maxHp, 110);
      F.kimuraU.hp = Math.min(F.kimuraU.hp, F.kimuraU.maxHp);
      // 木村の本隊は若江の堤の上で迎え撃つ（野の中へ出て行かない。十1「堤に立つ」）
      F.kimuraG.order = 'hold'; F.kimuraG.seekRange = 6; F.kimuraG.aggro = 4;
      // 直孝は本陣から重ねて下知する。隊の後退を確かめていないので、庵原が押し返されたと断定しない。
      rt.after(6.4, () => rt.say('井伊直孝', '堤の木村の本隊へ、もう一押しじゃ！', 3));
      // 井伊の手の安藤重勝が木村の首を狙って寄る（史実で首を取った者）
      if (canMarch(F.andoG)) { F.andoG.onArrive = null; F.andoG.order = 'attack'; F.andoG.seekRange = 50; F.andoG.focus = F.kimuraU; }
      // 先手と庵原の隊も堤の木村の本隊へ寄せる（主人公一人で堤へ行かせない）
      for (const g of [F.sakiG, F.iharaG, F.kibaG]) if (canMarch(g)) { g.order = 'attack'; g.noRun = false; g.seekRange = 70; g.aggro = 16; }
    }
  },

  // 長宗我部の伏兵：堤に伏せた兵が、藤堂の先手が寄るのを待って一斉に立つ
  yaoAmbush(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || rt.ended) return;
    // 予約より先に退く下知が届いていたら、伏兵も藤堂勢も再突撃させない。
    if (canMarch(F.choA) && F.choA.ambush) {
      rt.army.play('toki', YAO_FRONT, 1.5);
      F.choA.order = 'attack'; F.choA.seekRange = 40;
      F.choA.ambush = false;
      for (const u of F.choA.units) u._crouch = false;
      rt.after(1.5, () => {
        if (!F.ending && !rt.over && !rt.ended) rt.say('使番', '八尾の長宗我部、堤に槍を伏せて待っておった！', 2.8);
      });
    }
    for (const g of [F.takanoriG, F.kuwanaG]) if (canMarch(g)) { g.order = 'attack'; g.seekRange = 40; }
  },

  // 名のある将の討死（筋書きどおり）
  fall(rt, g, name, line) {
    const F = rt.flags;
    if (F.ending || !g) return;
    const u = g.units.find((q) => q.name === name && q.alive && !q.gone);
    if (!u) return;
    u.invuln = false; rt.army.kill(u);
    // 共通の踏みとどまりで討死が見送られた時は、知らせも退く下知も出さない。
    if (u.alive) return;
    if (name === '藤堂高刑') { F.takanoriFell = true; F.takanoriFellAt = rt.t; }
    if (name === '桑名吉成') F.kuwanaFell = true;
    F.yaoFallAt = rt.t;
    if (line) rt.say('使番', line, 3.2);
    if (!g.routed) { g.order = 'retreat'; g.dest = { x: YAO_FRONT.x + 50, z: g.anchor.z }; }
    // 長宗我部の先手は堤の前へ戻って構え直す（横の備と先手を、主人公が来てから崩す）
    if (live(F.choA) && !F.choA.routed) { F.choA.order = 'move'; F.choA.dest = { ...CHO_A }; F.choA.speed = 3; }
  },

  // 若江：木村重成の最期（討てなければ安藤重勝が首を取る）
  kimuraEnd(rt, byMe) {
    const F = rt.flags;
    if (F.kimuraDone || !canProgress(rt)) return;
    const U = F.kimuraU;
    // 主人公の復帰を待つ間に遺体が片付けられても、成立した討死は失わない。
    // 生きたまま退場した場合は討取りにしない。
    if (!U || (U.alive && U.gone)) return;
    if (U?.alive) { U.invuln = false; rt.army.kill(U); }
    // 討死が成立してから若江の崩れと勝ちを予約する。
    if (U.alive) return;
    F.kimuraDone = true;
    rt.banner('木村重成、討死', '若江の堤に散る　二十三歳');
    // 勝ちの印（t.main）はここで立てない。立てると目標の札が勝ったと見て、④⑤の残りの時が止まり、果たさずに印が付く（三3）
    if (byMe) rt.award((t) => { t.special = { label: '木村重成を討ち取った', pts: 40 }; }, '木村重成を討ち取った', U?.pos);
    else { rt.award((t) => t.side.push('木村勢を崩した'), '木村勢を崩した'); }
    // 実際の討ち手に合わせる。別の兵や流れ弾で倒れた時に安藤の手柄にしない。
    const ando = F.kimuraKiller === '安藤重勝';
    rt.say(byMe ? nm(rt) : ando ? '安藤重勝' : '使番', byMe ? '木村長門守、討ち取ったり！' : ando ? '木村長門守重成、安藤長三郎が討ち取ったり！' : '若江の堤で木村長門守重成、討死！', 3);
    rt.after(3.4, () => rt.say('井伊直孝', '木村長門守、見事な最期よ。若江は取った', 3.4));
    for (const g of [F.kimuraG, F.yamaG, F.naitoG]) if (live(g)) { g.order = 'flee'; g.routed = true; }
    F.winReadyAt = rt.t + 7.4;
    rt.after(7.4, () => this.win(rt));
  },

  // 長宗我部が退く（勝ち）
  win(rt) {
    const F = rt.flags;
    if (F.ending || F.step !== 4 || !F.kimuraDone || !canProgress(rt)) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('s4');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    for (const g of [F.choA, F.choG, F.choSide, F.fuseG]) if (live(g)) {
      g.fixed = false; g.ambush = false; g.order = 'flee'; g.routed = true;
      for (const u of g.units) { u._nest = false; u._crouch = false; }
    }
    sfx('horagai', 0.9);
    rt.award((t) => { t.main = true; t.special = t.special || { label: '長宗我部を八尾から退かせた', pts: 30 }; }, '長宗我部を八尾から退かせた');
    rt.banner('長宗我部、退く', '慶長二十年五月六日　八尾・若江の戦い');
    rt.say('使番', '八尾の長宗我部、若江の崩れを聞いて大坂へ退きまする！', 3.2);
    rt.after(3.6, () => rt.say('藤堂高虎', '……長宗我部が退くぞ。だが、追う力は残っておらぬ', 3.4));
    rt.after(7.4, () => rt.say('藤堂高虎', '八尾では身内を多く失うた。高刑も、桑名も……', 3.4));
    rt.after(11, () => rt.say('使番', '大御所様より。明日、天王寺と岡山で総懸かりとの仰せ', 3.4));
    rt.finish({ scriptedEnd: true }, 15);
  },

  update(rt, dt) {
    const F = rt.flags;
    try { jin14.tick(rt, dt); } catch (e) { if (!rt.flags._jinErr) { rt.flags._jinErr = 1; console.warn("八尾若江の陣立て", e); } }
    if (F.ending || !F.begun) return;
    KIT.backTick(rt);
    const P = rt.player.u;
    // 見えない壁
    if ((F.wallT = (F.wallT || 0) - dt) <= 0) {
      F.wallT = 0.25;
      for (const u of rt.army.units) {
        if (!u.alive || u.gone) continue;
        if (u.pos.x > 248) u.pos.x = 248; else if (u.pos.x < -248) u.pos.x = -248;
        if (u.pos.z > 248) u.pos.z = 248; else if (u.pos.z < -248) u.pos.z = -248;
      }
    }
    // 手勢は主人公の近くで戦う（離れたら寄る）。④で南へ駆ける間は、先手と安藤の手も主人公の脇を同じ向きへ駆ける（一5・九4）
    if ((F.menT = (F.menT || 0) - dt) <= 0) {
      F.menT = 0.5;
      // 護衛の追従でも、退く下知と敗走を攻撃へ戻さない。
      const c = live(F.mine) && !F.mine.routed && F.mine.order !== 'retreat' && F.mine.order !== 'flee' && F.mine.center();
      if (c) {
        // 行き先は主人公から 10m 外れた時だけ出し直す（出し直すたびに隊は合図を待つので、毎回替えると動かない）
        if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > 12) { if (F.mine.order !== 'move' || !F.mine.dest || dist(F.mine.dest, P.pos) > 10) { F.mine.order = 'move'; F.mine.dest = { x: P.pos.x + 2, z: P.pos.z + 3 }; } F.mine.speed = 4.6; }
        else { F.mine.order = 'attack'; F.mine.seekRange = 18; }
      }
      // 八尾・内藤・山口へ騎馬も同行する。行き先は替えず、先なら控え、遅れれば馬を急がせる。
      const kb = F.kibaG;
      const GO = F.step === 1 ? FLANK_GO : F.step === 2 ? NAITO_GO : YAMA;
      if (F.step <= 3 && canMarch(kb) && kb.order === 'move') {
        const dx = GO.x - P.pos.x, dz = GO.z - P.pos.z, d = Math.hypot(dx, dz) || 1;
        const ahead = ((kb.anchor.x - P.pos.x) * dx + (kb.anchor.z - P.pos.z) * dz) / d;
        // 共通の駆け足補正（騎馬は最低6.5）で、待つ速さや徒歩の主への足並みを上書きさせない。
        kb.noRun = true;
        kb.speed = ahead > 6 ? 1.5 : ahead < -6 ? 8 : P.mounted ? 5.6 : 4;
      }
      // 着いた隊から横の備へかかる（徒の隊は着くまで駆け続ける）
      if (F.step <= 3) {
        const AT = STEP_AT[F.step];
        if (canMarch(kb) && kb.order === 'move' && dist(kb.center(), AT) < 40) { kb.order = 'attack'; kb.noRun = false; kb.seekRange = 40; }
      }
      if (F.step === 1 && F.choSide.order === 'hold' && [F.mine, F.kibaG].some((g) => live(g) && dist(g.center(), FLANK) < 36)) {
        F.choSide.order = 'attack'; F.choSide.seekRange = 30;
      }
    }
    // 崩れて退いた兵は遠く離れたら去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - dt) <= 0) {
      F.gcT = 1;
      for (const g of [F.kimuraG, F.yamaG, F.naitoG, F.choSide]) if (g) for (const u of g.units) if (u.alive && !u.gone && u.fleeing && dist(u.pos, P.pos) > 45) rt.army.despawn(u);
    }
    if (!canProgress(rt)) return;
    if (F.pendingStep) { this.toStep(rt, F.pendingStep); return; }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    // その戦場へ寄ってから達成を判定する。後方で待つだけでは目標に印を付けない。
    // 押し合いで隊が動いた時も、実際に案内した印へ着けば到着とする。
    // 元の布陣位置だけを見ると、印の所で敵を退けても段が止まる。
    const pin = this.missionPin(rt);
    if (dist(P.pos, STEP_AT[F.step]) < 34 || (pin && dist(P.pos, pin) < pin.r)) F.stepNear = true;
    const left = STEP_T[F.step] - (rt.t - F.stepT);
    if (F.step === 1 && !F.next && dist(P.pos, YAO_FRONT) < 60) {
      if (!F.takanoriFell && rt.t - F.t0 >= 50) {
        this.fall(rt, F.takanoriG, '藤堂高刑', '八尾で藤堂高刑様、お討死！');
      }
      if (!F.kuwanaFell && rt.t - F.t0 >= 110 && rt.t - F.takanoriFellAt >= 3.6) {
        this.fall(rt, F.kuwanaG, '桑名吉成', '桑名吉成様もお討死！　藤堂勢、崩れかかっております');
      }
    }
    if (F.step >= 2 && !F.kawate && dist(P.pos, F.sakiG.center()) < 55 && (rt.t - F.stepT > 40 || F.step >= 3)) {
      // 井伊の先手の川手良列が深入りして討たれる（史実）。堤の鉄砲に撃たれ、右の先鋒の庵原朝昌が代わる
      const u = F.sakiG.units.find((q) => q.name === '川手良列' && q.alive);
      if (u) {
        u.invuln = false; rt.army.kill(u);
        // 共通の討死処理が見送った時は、交代の知らせも済みの印も出さず次に確かめる。
        if (!u.alive) {
          F.kawate = true;
          rt.say('井伊の侍', '川手良列殿、深入りして伏兵に討たれ、お討死！', 2.8);
          rt.after(3.2, () => rt.say('井伊の侍', '庵原朝昌殿が先手を継がれる。押せ！', 2.6));
        }
      }
    }
    // ①：長瀬川の堤に伏せた槍が、主人公が寄るのを待って一斉に立つ（八尾の芯。二3）
    if (F.step === 1 && F.fuseG?.ambush && dist(P.pos, FUSE) < 34) {
      F.stepNear = true;   // 印に従って堤へ着いた場合も、八尾の戦場へ到着したと数える。
      F.fuseG.ambush = false; F.fuseG.fixed = false; F.fuseG.order = 'attack'; F.fuseG.seekRange = 40; F.fuseG.aggro = 14;
      for (const u of F.fuseG.units) u._crouch = false;
      F.choA.defMult = 0.9;   // 伏兵を見届けた後は赤備えの横槍が通る。段の組み替えで切替が抜けていた（B3）。
      rt.army.play('toki', FUSE, 1.6);
      rt.say('足軽', '堤から槍が立った！ 伏せておったぞ！', 2.8);
    }
    // 刻限を過ぎたら味方の押しが強まる（主人公が遅れても、軍勢の力で物語が進む。負けにはしない。二5・十二3）
    if (left <= 0 && !F.pushed && !F.next) {
      F.pushed = true;
      const g = F.stepG;
      for (const q of [g, F.step === 1 && F.fuseG]) if (q) { q.morale = Math.min(q.morale || 100, 40); q.dmgMult = (q.dmgMult || 1) * 0.6; }
      // 若江の刻限で藤堂勢を強めたり、八尾へ移動中の隊を呼び戻したりしない。討死後の退く下知も守る。
      const pushing = F.step === 1 ? [F.mine, F.kibaG, F.todoGun, F.takanoriG, F.kuwanaG] : [F.mine, F.sakiG, F.iharaG, F.andoG, F.kibaG];
      for (const a of pushing) if (live(a) && !a.routed && a.order !== 'retreat' && a.order !== 'flee' && !(F.step <= 2 && a.order === 'move')) { a.order = 'attack'; a.seekRange = 80; a.dmgMult = Math.max(a.dmgMult || 1, 1.2); }
      if (F.step >= 2 && F.step <= 3) rt.say('井伊直孝', '先手が押しておる。遅れるな！', 2.6);
    }
    if (F.step === 4) {
      // 木村の討死後の待ち時間に倒れた場合も、復帰後に締めへ進む。
      if (F.kimuraDone && rt.t >= F.winReadyAt) { this.win(rt); return; }
      // 木村は主人公が堤へ来てから戦う。刻限だけで安藤の討取りを起こさない。
      if (F.kimuraU?.alive) storyGuard(F.kimuraU, !F.stepNear && dist(P.pos, F.kimuraU.pos) > 25);
      if (!F.kimuraDone && F.kimuraU && !F.kimuraU.alive) this.kimuraEnd(rt, F.kimuraByMe);
      return;
    }
    if (F.next) return;
    const g = F.stepG;
    if (!F.stepN) F.stepN = Math.max(1, g.units.length + (F.step === 1 ? F.fuseG.units.length : 0));
    const gone = F.stepN - stepAlive(F);
    const cleared = F.step === 1 ? !F.fuseG.ambush && yaoLeft(g) === 0 && yaoLeft(F.fuseG) === 0 : gone >= Math.round(F.stepN * (1 - KEEP));
    if (F.stepNear && cleared) {
      F.next = true;
      for (const q of g.units) if (q.alive && q.name && !q.invuln) { rt.army.kill(q); break; }   // 隊の将も崩れの中で討たれる
      for (const q of F.step === 1 ? [g, F.fuseG] : [g]) { q.order = 'flee'; q.routed = true; }
      if (F.step === 1) {
        rt.award((t) => t.side.push('八尾で長宗我部の横を突いた'), '長宗我部の横を突いた');
        // 早く横の備を退けても、八尾の討死を飛ばして若江へ戻らない。
        // 時刻だけに任せると二将が生きたまま終戦し、弔う台詞だけが出る。
        // 直前の討死の知らせを読み終えてから次を伝える。
        // 達成待ちの間は上の時刻判定を止め、予約した順を守る。
        let delay = Math.max(0, 3.6 - (rt.t - (F.yaoFallAt ?? -Infinity)));
        for (const [q, name, line] of [[F.takanoriG, '藤堂高刑', '八尾で藤堂高刑様、お討死！'],
          [F.kuwanaG, '桑名吉成', '桑名吉成様もお討死！　藤堂勢、崩れかかっております']]) {
          if (!q.units.some((u) => u.name === name && u.alive)) continue;
          rt.after(delay, () => this.fall(rt, q, name, line));
          delay += 3.6;
        }
        rt.after(Math.max(2.5, delay), () => this.toStep(rt, 2));
      }
      else if (F.step === 2) { rt.award((t) => t.side.push('若江で内藤長秋の隊を崩した'), '内藤長秋の隊を崩した'); rt.after(2.5, () => this.toStep(rt, 3)); }
      else if (F.step === 3) { rt.award((t) => t.side.push('若江で山口弘定の隊を崩した'), '山口弘定の隊を崩した'); rt.after(2.5, () => this.toStep(rt, 4)); }
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '木村重成') {
      F.kimuraByMe = !!k?.isPlayer;
      F.kimuraKiller = k?.name || null;
    }
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
    const at = k14_yao_wakae.missionPin(b) || WAKAE;
    let e = F.step === 4 && F.kimuraU?.alive && dist(F.kimuraU.pos, u.pos) < 14 ? F.kimuraU : b.army.nearestEnemy(u, 9, ok);
    if (e && !ok(e)) e = null;
    // 目標の隊から離れた敵は追わない（追って遠くへ行くと終わらない）
    if (e && dist(e.pos, at) > 30) e = null;
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
    goTo(p, inp, at.x, at.z, 2.5);
  },
};

// 陣立ての厚み（army_depth.js）・命懸けの戦場（lethal.js）・この戦の怖さ（深田と堤の伏兵・横槍）
k14_yao_wakae.depth = DEPTH14;
k14_yao_wakae.lethal = true;
k14_yao_wakae.fearKind = { kind: '二正面', note: '深田と堤の伏兵', w: { flank: 1.5, losses: 1.2 }, line: '横を突かれるぞ！' };
k14_yao_wakae.force = (rt) => ({ a: Math.max(0, 8200 - (rt.flags.ak || 0) * 18), a0: 8200, b: Math.max(0, 10000 - (rt.flags.ek || 0) * 22), b0: 10000 });
k14_yao_wakae.date = () => '慶長二十年（1615）五月六日　朝・初夏　河内国 若江・八尾';
// 下知は十四・六秒で終わる。予約を一斉に縮めると、六つの声が重なり、
// 最後の下知を聞く前に戦が始まるため、話は順に読み終えてから進む。
k14_yao_wakae.history = '慶長二十年（1615）五月六日、大坂夏の陣で大坂方は城を出て河内の田の中で徳川方を迎え撃った。同じ日の道明寺では、のちに後藤又兵衛も討たれた。若江では木村重成のおよそ四千七百が、井伊直孝の赤備えおよそ三千二百と正面からぶつかった。木村勢は藤堂勢の右翼を退けたが、井伊勢との戦いで山口弘定・内藤長秋らが討たれ、重成も井伊家の安藤重勝（長三郎）に討たれた。二十三歳であった。八尾では長宗我部盛親のおよそ五千三百が長瀬川の堤に兵を伏せ、寄せてきた藤堂高虎の先手を一斉に迎え撃って崩し、藤堂高刑・桑名吉成ら藤堂家の将が次々に討たれた。しかし若江の木村勢が崩れると、横を突かれるのを恐れた長宗我部は大坂へ退いた。藤堂・井伊とも損害が大きく、翌日の天王寺・岡山の戦いでは先手を外された。\n重成の首実検で、兜に香が焚き込められていたのを家康が褒めたという話は、後の書物に伝わる逸話である。主人公の組の動き、二つの戦場の間の道のり（実は2kmあまり）は遊びのための筋書きで、兵の数は史料により異なる。';

// 倒す数（kaito 11/2 O）：右上の目標に「（倒した数／倒す数）」。段が進む判定と同じ数え方（stages.js）
KILLS.k14_yao_wakae = (rt) => {
  const F = rt.flags;
  if (F.ending || !F.step || F.step === 4 || !F.stepN) return null;
  if (F.step === 1) {
    const need = [F.stepG, F.fuseG].reduce((n, g) => n + g.units.length - Math.floor(g.units.length * KEEP), 0);
    return cut(need, yaoLeft(F.stepG) + yaoLeft(F.fuseG));
  }
  return cut(F.stepN, stepAlive(F), Math.round(F.stepN * KEEP));
};
// 戦の進行の札（段）：F.step の 1〜5
setStages('k14_yao_wakae', [[STEP_TEXT[1]], [STEP_TEXT[2], 2], [STEP_TEXT[3], 3], [STEP_TEXT[4], 4]]);

export { k14_yao_wakae };
export default k14_yao_wakae;
