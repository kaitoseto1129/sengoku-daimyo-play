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
import { sightPoint, sightScreenUnit } from './battle_sight.js';
import { KIT } from './b_nagashinojo.js';
import { timeslipField } from './timeslip_field.js';
import { KILLS, cut, standing as fieldStanding } from './stages.js';
import { setStages } from './b_k_help.js';
import * as jin14 from './k14/jindate.js';
import { DEPTH14 } from './k14/depth.js';
import { k281Tick, k281Stat } from './k281_count.js';
import { keepReserve } from './k281_reserve.js';
import { fujinRealN as fujinRealNYW } from './fujin_layout.js';
import { isTouch as isTouchYW } from './touch.js';   // 陣立ての表（army_depth.js）   // 二正面の軽い大軍と遠くの乱戦・家臣の守り・棒立ちなし（11/8）

import { isEn, addEn } from './i18n.js';
if (isEn()) { try { addEn((await import('./i18n_k14_yao_wakae.js')).default); } catch (e) {} }
BATTLE_ASSETS.k14_yao_wakae = Object.freeze([...assetsForBattle('k14_yao_wakae')]);
const dem = null; // 標高の素材は素材の枝で入れる（今は平らな地形）

// ---- 場所（ゲームの座標。1 は実の 12m ほど） ----
const DEM_XY = 12;
const START = { x: 96, z: 6 };            // 主人公の寄せ口（二つの戦場の真ん中の東。左＝南に八尾、右＝北に若江）
const II_FRONT = { x: 86, z: -92 };       // 井伊勢の寄せ口（若江の東の田）
const WAKAE = { x: -6, z: -96 };           // 若江の堤（木村重成の陣）
const YAMA = { x: 16, z: -128 };           // 木村の右翼・山口弘定（北）
const NAITO = { x: 14, z: -66 };           // 木村の左翼・内藤長秋（南）
const YAO = { x: -150, z: 108 };           // 長宗我部盛親の本陣（長瀬川の堤の向こう）。11/20 K458：−84→−150（x −40 を軸に西へ2.5倍・大坂の奥の備も同じ。fujin_layout.js mkOsakaWide）
const YAO_FRONT = { x: 2, z: 100 };        // 八尾の前線（藤堂勢と長宗我部勢がぶつかる所）
const CHO_A = { x: -22, z: 100 };          // 長宗我部の先手（長瀬川の堤の前）
const FUSE = { x: -48, z: 98 };            // 長瀬川の東岸の堤上に伏せた槍（①で主人公の目の前で一斉に立つ）
const FLANK = { x: -22, z: 70 };           // 長宗我部の横の備（先手の北の端。北から突く所）
const FLANK_GO = { x: FLANK.x + 10, z: FLANK.z - 16 };   // ④で井伊の隊が駆ける先（一度だけ出す。行き先を替え続けると隊は合図を待って動かない）
const TODO_HQ = { x: 118, z: 118 };        // 藤堂高虎の本陣
const II_HQ = { x: 122, z: -104 };         // 井伊直孝の本陣
const TAMA = [[46, -260], [40, -150], [48, -60], [40, 30], [46, 140], [40, 260]];        // 玉串川（北へ流れる）
// 11/19 クラウド持ち主 ⑥（180秒 長瀬川に立つ写真：川面が灰色の石の板）：旧大和川の分かれは土砂の多い天井川で、五月の細流は濁る。浅い所は泥の茶緑、深い所は暗い茶。
const MUDDY = [0x4a4a32, 0x2a2a1c];
const NAGASE = [[-62, -260], [-56, -150], [-64, -40], [-52, 60], [-58, 160], [-52, 260]]; // 長瀬川（八尾の堤）
const WAKAE_DIKE = [[-8, -150], [-6, -120], [-8, -96], [-5, -70], [-8, -44]];   // 若江の堤（村の東を南北に通る。木村の本隊が立つ）
const ROAD = [[250, -40], [160, -60], [90, -20], [44, 0], [-10, 10], [-60, 6], [-250, 0]];  // 東西の道（八尾と若江の間）
// ①は前の字（南の八尾へ駆け、藤堂勢を押す…伏せ槍を退ける・40字）が 874×402 の右上の札で五行に折れ、画面の半分を覆った（11/11 見回り さ）。札は一行か二行に。
// 11/17 クラウド kaito2（K365 874×402）：④は「立／つ木村重成」と名の途中で折り返していた。名を頭に置く／11/18 ②③も二行に収まる長さに（iMac の検品：②が切れる）
const STEP_TEXT = ['', '八尾で長宗我部の横の備と伏せ槍を退ける', '内藤長秋を追い払う',
  '山口弘定を追い払う', '木村重成を若江の堤で討つ'];   // 「崩す」は使わない（kaito_standard 三1）
// 11/19 07時 クラウド持ち主 ⑥写真230秒（874×402）：「内藤長秋の／隊を追い払う 0/11」と名の後の「の」で折れた→「の隊」を外し、折れ目を「を」の後だけにした
// 段が変わる時の中央の青い札は右上の任務と同じ字で、874×402 では右上の札の下端に重なっていた（11/11 見回り さ・賤ヶ岳と同じ直し）。この戦では出さない。
function yaoNoBlueCall(rt) {
  const root = rt.hud?.root;
  if (!root || typeof document === 'undefined') return;
  root.classList.add('yao-goals');
  const style = document.createElement('style');
  style.textContent = 'html:root body #hud#hud#hud.yao-goals #center-call .cc.blue { display:none !important; }';
  document.head.appendChild(style);
  const dispose = rt.dispose;
  rt.dispose = function () { root.classList.remove('yao-goals'); style.remove(); return dispose?.call(this); };
}
const STEP_T = [0, 60, 60, 45, 50];   // 11/20 K458（クラウド kaito2）：若江の三段の刻限を詰めた（act bot 493秒・段3 179秒・段4 137秒→全体を7分の内へ。広げた戦場の分の余り）。
// 以前 [0, 60, 80, 70, 70]。11/18 08時：伏せ槍が横の備の半ばで立つようになり、八尾の刻限を八十→六十（段1が198秒に延びる回があった）
// 元の書き：現地へ着いてからの秒。長引けば味方の押しが強まる（負けにも、果たせなかった印にもしない。二5・三3・十二3）
const STEP_AT = [null, FLANK, NAITO, YAMA, WAKAE];
const PIN_NAME = ['', '八尾の横の備', '若江の内藤隊', '若江の山口隊', '若江の木村重成'];
const NAITO_GO = { x: NAITO.x + 22, z: NAITO.z + 10 };   // ②で八尾から若江の南の田へ駆ける先
// 11/18 23時 クラウド持ち主：八尾から若江へ戻る四十秒余り、田に敵が一人もいなかった（K306 の物見・小競り合いの段）。
//   内藤の隊が南の田の畦に出した物見（弓二・足軽三）が、駆け戻る井伊勢を矢で迎え、三人を切ると内藤の陣へ退く。
const MONOMI = { x: 26, z: -26 };   // 八尾へ向かう道（START→FLANK_GO）から六十歩外・内藤の持ち場の四十歩手前
// 11/19 04時 クラウド持ち主（act bot 345秒「庵原朝昌の隊の足軽 行き先(38,-148)・隊速0 で二十秒」）：前の x+22 は玉串川の堤の内の法（川筋から四歩）で、
//   庵原の行き先 (38,-148) は流れの中だった。横十歩の備が川と堤に掛かり着けず止まった。川筋から十四歩の田（x+10）へ寄せる。
const YAMA_GO = { x: YAMA.x + 10, z: YAMA.z };   // ③で赤備えが北の田へ寄せる先
const KEEP = 0.4;                          // 段の隊は四割まで減れば崩れて退く（倒す数＝六割）
const ARMOR = KIT.ARMOR;
// 井伊の赤備え・藤堂勢・木村勢・長宗我部勢の装い
const II = { armor: ARMOR.akazonae, cloth: 0x8e2a1e, lace: 0xa0402a, flag: 'ii' };
const TODO = { armor: 0x24221f, cloth: 0x4a4632, lace: 0x5a5a3a, flag: 'todo' };
const KIMURA = { armor: 0x2c2a2a, cloth: 0x4a3a2a, lace: 0x6a5a2a, flag: 'toyotomi' };
const CHOSO = { armor: 0x2a2622, cloth: 0x3a4a2a, lace: 0x4a6a2a, flag: 'chosokabe' };
// 野の途中の斬り合いの組（update で立てる）：todoO・choO と同じ構え（setup の内の定数は update から見えない）
const YW_TODO_O = { faction: 'tokugawa', facing: -Math.PI / 2, order: 'hold', noRout: true, formation: 'yari' };
const YW_CHO_O = { faction: 'toyotomi', facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, noRout: true, formation: 'yari', morale: 96 };
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
  botStat(b) { return k281Stat(b); },   // 11/19 クラウド kaito2：K281 の段ごとの数え（bot の記録だけ）
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
  goalsAllRows: true,        // 八尾から若江への四目標を最初から並べ、済んだ行も残す（critic60 九1・十1）。
  keepBattleSigns: true,    // 行き先を案内している間も、将の名前と目標一覧を残す。
  goalSignOnly: true,       // 共通の目標推測より、この戦が選んだ横の備・伏せ槍・木村への案内を優先する。
  goalSignNoLabel: true,     // ▼の上に「印へ進め」を出さない（何の印か分からない。三の1・AR1。n6 X7）
  goalSignDistanceAlways: true, // 十歩以内でも行き先の距離を消さない（critic60 五3）。
  distanceUnit: 'metres',    // 今の共通案内にも、場所名と距離を渡す。
  goalSignTriangle: true,    // 共通の行き先案内も、画面の端で回転する矢印に替えず▼で示す。
  noTaishoRaid: true,
  quietArmyCalls: true,      // 11/17 iMac 検品（kenpin/k14_yao_wakae_3koma.jpg）：245秒に中央へ「味方が追撃に移った」の字が浮いた。字は出さず、退く敵の背と幟で見せる
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  ownReserve: true,         // 二正面の備は開戦時に配置済み。自動の新手が持ち場の兵を消し、印から遠方へ誘うのを防ぐ。
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
  // 軽い二陣・予備も、隊の中心に印だけを置かず、実際に描かれる兵の胴を確かめる。
  lightEnemyTriangleSigns: true,
  lightEnemySignVisible: (rt, p) => sightPoint(rt, p, 170, true, 1.2),
  // 堤の向こうに体が隠れる者や、深手で伏せた者へ印だけを浮かせない。
  // 主人公からの見通しだけでなく、実際のカメラから胴が見えるかを調べる。
  // 11/18 21時 クラウド持ち主 ⑥（70秒 段1 横の備の写真：赤い▼が五つ横に並び、兵より先に目に入る）：岩石城・根白坂と同じく、
  //   本人の二十五m 内では本人を狙う敵と近い六人だけに▼。二十五m より遠い木村勢・長宗我部勢の印はそのまま（critic60 九3）。
  enemySignVisible: (rt, u) => {
    if (!(u.hp > 0 && !u.dying && !u.downed && !u.woundOut && !u.rearWound && !u.evacuatedWound)) return false;
    const me = rt.player.u, p = me.pos, du = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
    if (du < 625 && u.target !== me && u.atk?.target !== me) {
      if (rt._triT !== rt.t) {
        rt._triT = rt.t; const near = rt._triNear || (rt._triNear = new Set()); near.clear();
        const c = rt._triCand || (rt._triCand = []); c.length = 0;
        for (const v of rt.army.units) { if (!v.alive || v.team === me.team || v.isStruct || v.downed) continue; const d = (v.pos.x - p.x) ** 2 + (v.pos.z - p.z) ** 2; if (d < 625) c.push(d, v); }
        for (let k = 0; k < 6 && c.length; k++) { let bi = 0; for (let j = 2; j < c.length; j += 2) if (c[j] < c[bi]) bi = j; near.add(c[bi + 1]); c.splice(bi, 2); }
      }
      if (!rt._triNear.has(u)) return false;
    }
    return sightScreenUnit(rt, u);
  },
  horseHurtMul: 0.45,   // 11/8 critic60（BH7）：馬がすぐ死んで八尾まで歩いた。馬の傷を軽く
  playerAtkMax: 3,
  playerTaken: 0.5,
  // 11/18 クラウドせ（K281 厚み）：前を埋める備を敵の本物だけで数える。味方の井伊・藤堂の列で前の六十歩が埋まり、30〜60m の敵が 90秒4・200秒9 人しかいなかった
  frontFillFoe: true,
  playerRegen: 0.025,
  // 動いて斬り続ける者にも後列の弓・鉄砲が応戦する。射線・射程と同時に狙う人数は共通の制限を守る。
  playerRangedFocus: true,
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
      // 11/18 21時 クラウド持ち主 ⑥（410秒 段3 8/11 の写真：印が逃げ遅れの一人の上で、画の中に他の敵も味方もいない）：
      //   逃げていない者で、十歩内に仲間が立つ者（塊）を先に指す。塊が無ければ今まで通り一番近い者。
      // 11/19 01時 クラウド持ち主 ⑥（215秒 段2 1/11 の写真：印が五歩先の▼の無い者の上＝逃げる者には▼が出ず、黒い具足の手勢と見分けられない）：
      //   塊が無い時も、逃げていない一番近い者を先に指す。皆が逃げている時だけ今まで通り一番近い者。
      let best = Infinity, bp = null, nearStand = Infinity, np = null;
      for (const u of g.units) if (standing(u)) {
        const dx = u.pos.x - pos.x, dz = u.pos.z - pos.z, d = dx * dx + dz * dz;
        if (d < nearest) { nearest = d; p = u.pos; }
        if (d < nearStand && !u.fleeing) { nearStand = d; np = u.pos; }
        if (d < best && !u.fleeing && g.units.some((v) => v !== u && standing(v) && (v.pos.x - u.pos.x) ** 2 + (v.pos.z - u.pos.z) ** 2 < 100)) { best = d; bp = u.pos; }
      }
      if (bp) p = bp; else if (np) p = np;
    }
    // 横の備が崩れた後は、立ち上がった伏せ槍も退けるまで案内する。
    // 伏兵が立った瞬間に、空になった横の備へ印を戻さない。
    // 横の備が退いても、堤の伏せ槍を見届けるまでは八尾を離れない。
    // 横の備だけが六割減ったら伏せ槍へ案内する。両隊の合計を条件にすると、
    // 横の備の全十八人が倒れても合計三十二人の六割に届かず、印が切り替わらない。
    if (F.step === 1 && F.fuseG?.ambush && aliveN(F.stepG) <= Math.floor(F.stepG.units.length * KEEP)) p = FUSE;
    if (F.step === 4 && F.kimuraU && standing(F.kimuraU)) p = F.kimuraU.pos;
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
  noEnemyFootRing: true,   // 11/19 05時 クラウド持ち主 ⑥写真280秒：狙う敵の足元の太い輪が本人の前の兵の腰に重なり、二つ目の輪に見えた→敵は頭上の▼だけ（木津川口・道明寺・有岡と同じ）
  spearRingDepth: true,   // 11/19 07時 クラウド持ち主 ⑥写真90秒（874×402）：槍の穂先の赤い輪が本人の真ん前の相手の足元で透けて描かれ、本人の腰に巻いた輪に見えた→体の後ろの輪は隠す（根白坂と同じ）
  realCap: isTouchYW ? 270 : 290 + fujinRealNYW('k14_yao_wakae'),   // 11/19 クラウド kaito2（質を一段・Total War の物差し）：八尾へ向かう野の途中に斬り合う本物の組を二つ足す分（四戦で一番軽い 1コマ9.5ms）
  world: {
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物
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
    groundHalf: 340,   // 11/20 K458：260→340（大坂の奥を西へ広げた分）
    moveLim: 330,
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
      if (x > 230 || x < -320 || Math.abs(z) > 230) return 0;   // K458：西へ広げた大坂の奥も田
      const cell = Math.floor(x / 14) + Math.floor(z / 12);
      if (((cell % 4) + 4) % 4 === 1) return 0;
      if (Math.min(nearDist(x, z, TAMA), nearDist(x, z, NAGASE)) < 12 || nearDist(x, z, WAKAE_DIKE) < 6 || nearDist(x, z, ROAD) < 5) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.95;
    },
    riverCross: true,
    wadeDepth: 0.7,
    streams: [{ pts: TAMA, w: 2.6, depth: 0.55, waterColor: MUDDY, waterSheen: 0.3, plainWater: true }, { pts: NAGASE, w: 3.2, depth: 0.65, waterColor: MUDDY, waterSheen: 0.3, plainWater: true }],   // 細い流れ（幅広の川の中で斬り合わない）
    paths: [{ pts: ROAD, w: 3 }, { pts: [[START.x, START.z], [90, -94], [WAKAE.x, WAKAE.z], [-120, -100]], w: 2.4 }, { pts: [[TODO_HQ.x, TODO_HQ.z], [60, 106], [YAO.x, YAO.z], [-230, 110]], w: 2.4 }],
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
    clear: (x, z) => dist({ x, z }, WAKAE) < 40 || dist({ x, z }, YAO_FRONT) < 50 || dist({ x, z }, FLANK) < 22 || dist({ x, z }, START) < 22 || distToPolyline(x, z, ROAD) < 5
      // 11/19 02時 クラウド持ち主 ⑥（300秒 段2 の写真：若江の東の玉串川の堤の松が本人のすぐ前で画の真ん中を塞ぐ）：段2・段3で本人が歩く堤（若江の東）の松を払う。
      || (z > -135 && z < -40 && distToPolyline(x, z, TAMA) < 12),
    trees: 160,
    tufts: 3000,
    treeDensity: (x, z) => (Math.min(distToPolyline(x, z, TAMA), distToPolyline(x, z, NAGASE)) < 18 ? 0.8 : 0.12),
    fleeOut: (x, z, team) => (team === 1 ? x < -315 : x > 240),   // K458：西へ広げた分
  },

  *setup(rt) {   // K626：段に分けた（間の yield で一コマ返す）
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    yaoNoBlueCall(rt);
    const F = rt.flags, W = rt.world;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false; F.holdPlayer = true;
    // ---- 旗・本陣・村（旗は井伊・藤堂・豊臣・長宗我部だけ。AQ4） ----
    // 陣幕の奥の大将の床几（幕の真ん中から 4 北）が、総大将の居場所（旗本の隊の真ん中）に来るように置く（一2・十三4）
    // 11/19 K365 馬印の照らし（cloud-05・docs/uma_check_1119.md）：井伊直孝の本陣に井伊家伝来の金の蝿取（彦根城博物館の写し。前は馬印が無かった）
    KIT.honjin(rt, II_HQ.x, II_HQ.z + 4, { mon: 'ii', uma: 'ii_haetori', people: false, fire: false });   // 朝の七時：篝火は消してある
    KIT.honjin(rt, TODO_HQ.x, TODO_HQ.z + 4, { mon: 'todo', people: false, fire: false });
    KIT.honjin(rt, YAO.x, YAO.z + 4, { mon: 'chosokabe', people: false, fire: false });
    for (const [x, z] of [[II_FRONT.x + 8, II_FRONT.z - 10], [II_FRONT.x + 8, II_FRONT.z + 10]]) rt.scene.add(nobori(W, x, z, 'ii', 6));
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    for (const [x, z] of [[WAKAE.x - 10, WAKAE.z - 8], [WAKAE.x - 10, WAKAE.z + 8], [YAMA.x - 8, YAMA.z], [NAITO.x - 8, NAITO.z]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
    for (const [x, z] of [[CHO_A.x - 10, CHO_A.z - 12], [CHO_A.x - 10, CHO_A.z + 12], [YAO.x - 4, YAO.z - 8], [YAO.x - 4, YAO.z + 8]]) rt.scene.add(nobori(W, x, z, 'chosokabe', 6));
    for (const [x, z] of [[TODO_HQ.x - 8, TODO_HQ.z - 8], [TODO_HQ.x - 8, TODO_HQ.z + 8], [74, 92], [74, 112]]) rt.scene.add(nobori(W, x, z, 'todo', 6));
    KIT.farVillage(rt, -48, -150, { rot: Math.PI / 2, n: 6, fields: 6, seed: 1406 });   // 若江の村
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
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
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', directOrders: true, fullStrength: true, anchor: { x: START.x - 10, z: START.z + 12 }, facing: -Math.PI / 2, width: 8, aggro: 10, order: 'hold', noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 5, o: { flagScale: 1 } }, { type: 'gun', n: 2 }, { type: 'bow', n: 1 }], II));
    F.andoG = allyGroup(rt, { faction: 'tokugawa', name: '安藤重勝の手', fullStrength: true, anchor: { x: II_FRONT.x + 2, z: II_FRONT.z - 4 }, facing: -Math.PI / 2, width: 4, aggro: 8, seekRange: 10, order: 'hold', noRout: true, dmgMult: 0.6 },
      dress([named('安藤重勝', 'samurai', { invuln: true }), { type: 'ashigaru', n: 3 }], II));
    // 井伊の騎馬武者（赤備えの騎馬）。④では主人公の脇を同じ馬の速さで八尾へ駆ける（徒の隊は馬に追いつけず、主人公一人が着いていた。一5・九4）
    F.kibaG = allyGroup(rt, { faction: 'tokugawa', name: '井伊の騎馬', directOrders: true, fullStrength: true, anchor: { x: START.x - 4, z: START.z - 8 }, facing: -Math.PI / 2, width: 6, aggro: 10, order: 'hold', noRout: true, dmgMult: 0.8 },
      dress([{ type: 'cavalry', n: 6 }], II));
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: START.x - 2, z: START.z + 8 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 10) }]);

    // ---- 大坂方（若江）：木村重成の本隊（堤）と両翼（北の田の山口弘定・南の田の内藤長秋） ----
    // 11/17 クラウド kaito2（K365）：act bot が「21人を無傷で討った」（歯ごたえが無い）。木村勢の打ち返しを 0.4→0.52 に
    const kimO = { faction: 'toyotomi', facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, fixed: true, stay: true, noAI: true, noRout: true, formation: 'yari', morale: 95, dmgMult: 0.52, dmgMultPlayer: 0.85, defMult: 1.1 };
    // 11/18 クラウド持ち主：act bot 四回とも受けた傷が二十余り「重く斬り合いたい」。前線どうしの削り合いは変えず、本人に当たる一太刀だけ重く（army_combat.js の dmgMultPlayer）
    // 堤の守備は共通の出撃・武将の退避で野へ移さない。間近の敵には持ち場で応戦する。
    F.kimuraG = enemyGroup(rt, { ...kimO, name: '木村重成の本隊', fixed: true, stay: true, anchor: { ...WAKAE }, width: 8, aggro: 4, seekRange: 6, order: 'hold' },
      dress([named('木村重成', 'busho', { invuln: true, keep: true }), { type: 'samurai', n: 7 }, { type: 'ashigaru', n: 6, o: { flagScale: 1 } }, { type: 'gun', n: 4 }], KIMURA));
    F.kimuraU = F.kimuraG.units.find((u) => u.name === '木村重成');
    storyGuard(F.kimuraU, true);
    // 11/18 04:35 クラウド持ち主：段2・段3で本人が隊と斬り合うようになっても受けた傷0（act bot 三回）。内藤・山口の本人への一太刀だけ 0.85→1.2。
    // 11/18 05時 クラウド持ち主：描かずの数え（0.5秒ごと）で、本人を狙う足軽が二歩内に来ても、本人の近い突きは足軽には受けられず（army_combat の closeHit）一突き半で倒れ、
    //   振り出す前に討たれていた（突き45・当たり45で28人・受けた傷0）。木村勢の内藤・山口の隊は若江で踏み止まった侍の隊（battle_refs）。人数は変えず、侍を三→五・足軽を十→八に（侍は受けて打ち返す。六・七では段3が二分半〜四分に延び、全体が九分を超えた回があった）。
    F.yamaG = enemyGroup(rt, { ...kimO, name: '山口弘定の隊', anchor: { ...YAMA }, width: 10, aggro: 12, seekRange: 24, order: 'hold', dmgMultPlayer: 1.2 },
      dress([named('山口弘定'), { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 8, o: { flagScale: 1 } }, { type: 'gun', n: 5 }], KIMURA));
    F.naitoG = enemyGroup(rt, { ...kimO, name: '内藤長秋の隊', anchor: { ...NAITO }, width: 10, aggro: 12, seekRange: 24, order: 'hold', dmgMultPlayer: 1.2 },
      dress([named('内藤長秋'), { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 8, o: { flagScale: 1 } }, { type: 'bow', n: 4 }], KIMURA));
    F.monoG = enemyGroup(rt, { ...kimO, name: '内藤の物見', anchor: { ...MONOMI }, facing: -Math.PI / 2, width: 5, aggro: 18, seekRange: 26, order: 'hold', noAI: false, stay: false, noRout: false, morale: 70, ambush: true, fixed: true, dmgMultPlayer: 1 },
      dress([{ type: 'bow', n: 2 }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }], KIMURA));
    for (const u of F.monoG.units) { u.invuln = true; }   // 段2までは畦に伏せて見つからない（八尾の段の間に味方の玉で崩れない）

    // ---- 八尾：藤堂の先手（高刑・桑名）・鉄砲衆・高虎の本陣、長宗我部の先手（堤の前に伏せる）・横の備・盛親の本陣 ----
    // 八尾は長宗我部が藤堂の先手を崩した戦（史実）。藤堂勢の槍は浅く、⑤の前に長宗我部の先手を削り切らない（二1）
    const todoO = { faction: 'tokugawa', facing: -Math.PI / 2, order: 'hold', noRout: true, formation: 'yari', dmgMult: 0.22 };
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    F.takanoriG = allyGroup(rt, { ...todoO, name: '藤堂高刑の隊', fullStrength: true, anchor: { x: YAO_FRONT.x + 40, z: YAO_FRONT.z - 12 }, width: 10, aggro: 10 },
      dress([named('藤堂高刑', 'samurai', { invuln: true }), { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9, o: { flagScale: 1 } }], TODO));
    F.kuwanaG = allyGroup(rt, { ...todoO, name: '桑名吉成の隊', fullStrength: true, anchor: { x: YAO_FRONT.x + 44, z: YAO_FRONT.z + 12 }, width: 10, aggro: 10 },
      dress([named('桑名吉成', 'samurai', { invuln: true }), { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8, o: { flagScale: 1 } }], TODO));
    F.todoGun = allyGroup(rt, { ...todoO, name: '藤堂の鉄砲衆', fullStrength: true, anchor: { x: 76, z: 102 }, width: 8, aggro: 8, seekRange: 20 },
      dress([{ type: 'samurai', n: 2 }, { type: 'gun', n: 8 }], TODO));
    F.todoG = allyGroup(rt, { ...todoO, name: '藤堂高虎の旗本', fixed: true, fullStrength: true, anchor: { ...TODO_HQ }, width: 6, aggro: 5, seekRange: 8 },
      dress([named('藤堂高虎', 'busho', { invuln: true, horse: false }), { type: 'samurai', n: 10 }], TODO));
    const choO = { faction: 'toyotomi', facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, noRout: true, formation: 'yari', morale: 96, dmgMult: 0.4, dmgMultPlayer: 0.85, defMult: 1.15 };
    // 先手は藤堂の先手を崩す側。主人公が堤の伏せ槍へ寄るまでは固い。
    F.choA = enemyGroup(rt, { ...choO, name: '長宗我部の先手', defMult: 1.8, anchor: { ...CHO_A }, width: 14, aggro: 12, seekRange: 22, order: 'hold', ambush: true },
      dress([{ type: 'samurai', n: 4, o: { keep: true, horse: false } }, { type: 'ashigaru', n: 14, o: { keep: true, horse: false, flagScale: 1 } }, { type: 'gun', n: 4 }], CHOSO));
    // 長瀬川の堤に伏せた槍（盛親は騎馬を下ろして槍を持たせ、堤に伏せた。battle_refs）。⑤で主人公が寄ると一斉に立つ（二3・十二4）
    F.fuseG = enemyGroup(rt, { ...choO, name: '長宗我部の伏せ槍', facing: Math.PI / 2, anchor: { ...FUSE }, width: 12, aggro: 4, seekRange: 6, order: 'hold', ambush: true, fixed: true,
      dmgMultPlayer: 1.2 },   // 11/18 07時：立って本人へ掛かる槍。0.85 のままでは act bot 三回に二回「無傷で大勢討った」
      // 共通の兵種調整で騎馬・弓・鉄砲へ替えない。堤で伏せる十四人は全員徒歩の槍。
      // 11/18 07時：侍二・足軽十二では、本人の突きに足軽が受けられず振り出す前に倒れ、三回に二回「無傷」。人数は十四のまま侍を五に（侍は受けて打ち返す）
      dress([{ type: 'samurai', n: 5, o: { keep: true, horse: false, weapon: 'spear' } }, { type: 'ashigaru', n: 9, o: { keep: true, horse: false, flagScale: 1 } }], CHOSO));
    F.choSide = enemyGroup(rt, { ...choO, name: '長宗我部の横の備', facing: Math.PI, anchor: { ...FLANK }, width: 10, aggro: 10, seekRange: 18, order: 'hold', morale: 90, dmgMult: 0.55, dmgMultPlayer: 1 },
      // 布陣表だけの名にせず、横の備を率いる増田盛次を実際の侍一人に割り当てる（兵数は十八人のまま）。
      dress([named('増田盛次'), { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 13, o: { flagScale: 1 } }, { type: 'gun', n: 2 }], CHOSO));
    // 11/19 クラウド k365-26（受け持ちの濃さ）：八尾の段（百五十秒）は本人の討ち取り2（act bot 395秒）。井伊・藤堂の味方が先に斬り尽くす。
    //   味方の刃（army_combat の strike）だけ半分に効く固さに。本人の太刀（army.damage）はそのまま
    for (const g of [F.choSide, F.fuseG, F.naitoG]) if (g) g.defMult = 2.2;   // 内藤の段（九十秒）も討ち取り1
    F.choG = enemyGroup(rt, { ...choO, name: '長宗我部盛親の旗本', fixed: true, stay: true, noAI: true, anchor: { ...YAO }, width: 7, aggro: 5, seekRange: 8, order: 'hold' },
      dress([named('長宗我部盛親', 'busho', { invuln: true, horse: false, keep: true }), { type: 'samurai', n: 11, o: { keep: true, horse: false } }, { type: 'gun', n: 2, o: { keep: true } }], CHOSO));
    F.choU = F.choG.units.find((u) => u.name === '長宗我部盛親');
    // 床几は幕の奥。東向きの槍衾と主の周囲への追従では、幕の裏へ回り込んで詰まる。
    // 控える旗本は徒歩で幕の内の三列へ。退く下知の後は通常の隊列に戻す。
    const choSlots = F.choG.slotPos;
    F.choG.slotPos = function (i, n, out) {
      if (this.order !== 'hold') return choSlots.call(this, i, n, out);
      out = out || {};
      const k = i > F.choU.slot ? i - 1 : i;
      out.x = YAO.x + (i === F.choU.slot ? 0 : (k % 5 - 2) * 2);
      out.z = YAO.z + (i === F.choU.slot ? 0 : 3 + Math.floor(k / 5) * 1.8);
      return out;
    };
    for (const u of F.choG.units) {
      const p = F.choG.slotPos(u.slot, F.choG.initial);
      u.pos.x = p.x; u.pos.z = p.z; u.pos.y = W.heightAt(p.x, p.z);
      u.mesh.position.copy(u.pos);
    }
    // 総大将は陣幕の内の床几に腰を下ろし、動かない（一2・十三4）
    for (const [u, at] of [[F.iiU, II_HQ], [F.choU, YAO], [F.todoG.units.find((q) => q.name === '藤堂高虎'), TODO_HQ]]) if (u) { storyGuard(u, true); u.pos.x = at.x; u.pos.z = at.z; u._crouch = true; u._nest = true; }
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    for (const g of [F.iiG, F.todoG, F.choG]) g.noFrontline = true;
    // 11/18 19時 クラウド持ち主（act bot 461秒「隊が一点に重なって止まる・遠くの備・8人」・描かずの足跡）：遠くの備（depth_reserve の realFromLight）は
    //   最後に作った敵の組の下知を手本に写す。手本が長宗我部の旗本（noAI・床几の陣）になり、長宗我部の本陣の裏の遠くの備も noAI のまま、
    //   藤堂の兵が十八 m に寄って待ちが解けると、動けず一点に重なって立っていた。手本から noAI を外す（待つ間は今までどおり stay・fixed で立つ）。
    for (const k of ['E', 'A']) if (rt._tpl?.[k]?.o?.noAI) { const { noAI, ...o } = rt._tpl[k].o; rt._tpl[k] = { ...rt._tpl[k], o }; }

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
    // 敵前では押し合いで持ち場からずれる。六割の兵が八歩以内まで来れば射撃へ移る。
    // 共通の三歩半で整列を待つと、移動中のまま刻限の加勢からも外れ続ける。
    F.todoGun.arriveRadius = 8;
    // 開戦時の移動が①の攻撃命令を上書きする。到着後は射程外の敵にも寄せて援護する。
    // 移動のままでは八尾の東で止まり、刻限の加勢からも移動中として外れ続ける。
    F.todoGun.onArrive = (g) => {
      if (F.ending || rt.over || rt.ended || !canMarch(g)) return;
      g.order = 'attack'; g.seekRange = 60;
    };
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
    F.next = false; F.pushed = false; F.stepNear = false; F.pressureAt = null;
    F.step = n; F.st0 = rt.t; F.stepT = rt.t;
    F.stepG = [null, F.choSide, F.naitoG, F.yamaG, F.kimuraG][n];
    // 伝令を待つ間に味方が討った兵も数える。残兵だけを始めの数にすると、全滅済みの隊で段が止まる。
    F.stepN = Math.max(1, F.stepG.units.length + (n === 1 ? F.fuseG.units.length : 0));
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    if (n === 1) {
      // 八尾へ：手勢と井伊の騎馬は主人公の脇を南へ駆ける（update が主人公の脇へ寄せ続ける。一5・九4）
      // 横の備の打ち返しは配置時の強さを保つ。到着待ちで攻撃力まで下げると、突っ込んでも押し返されない。
      F.choSide.order = 'hold'; F.choSide.seekRange = 12; F.choSide.defMult = 0.9;   // 赤備えが着くまでは槍を構えて待つ
      if (canMarch(F.todoGun)) { F.todoGun.order = 'attack'; F.todoGun.seekRange = 60; }
      for (const g of [F.mine, F.kibaG]) if (canMarch(g)) { g.order = 'move'; g.dest = FLANK_GO; g.speed = 6.2; g.noRun = false; g.focus = null; }
      rt.after(3, () => rt.say(nm(rt), '皆、南へ！　藤堂殿を助ける', 2.4));
    } else if (n === 2) {
      // 伝令：若江で井伊の隊と木村重成がぶつかった。八尾の戦いは後ろで続く
      rt.say('使番', '井伊隊、木村重成と交戦！　若江へお戻りを！', 3);
      rt.after(3.4, () => rt.say(nm(rt), '承知。皆、北へ！', 2));
      for (const g of [F.mine, F.kibaG]) if (canMarch(g)) { g.order = 'move'; g.dest = NAITO_GO; g.speed = 6.2; g.noRun = false; g.focus = null; }
      for (const g of [F.sakiG, F.iharaG]) if (canMarch(g)) {
        // 近い山口や木村へ散らず、まず南の田の任務へ寄せる。
        g.order = 'move'; g.dest = g === F.sakiG ? NAITO_GO : { x: NAITO_GO.x, z: NAITO.z - 12 }; g.focus = null; g.speed = 4.6;
        // 援護の到着は敵前の整列ではなく、兵の六割が持ち場の八歩以内へ寄った時。
        g.arriveRadius = 8;
        g.onArrive = (q) => {
          if (F.step !== 2 || F.ending || !canMarch(q)) return;
          q.order = 'attack'; q.seekRange = 40; q.aggro = 14;
        };
      }
      // 南北の田を守る隊を六十歩先まで追わせない。寄せる赤備えと持ち場で戦う。
      F.naitoG.order = 'hold'; F.naitoG.aggro = 18; F.naitoG.seekRange = 24;
      if (canMarch(F.monoG)) { F.monoG.ambush = false; F.monoG.fixed = false; for (const u of F.monoG.units) u.invuln = false; F.monoG.order = 'attack'; F.monoG.seekRange = 30; F.monoG.aggro = 22; }
      if (canMarch(F.choSide)) { F.choSide.order = 'move'; F.choSide.dest = { ...CHO_A }; }
    } else if (n === 3) {
      rt.say('井伊直孝', '内藤は崩れた。北の田の山口を討て！', 2.8);
      F.yamaG.order = 'hold'; F.yamaG.aggro = 18; F.yamaG.seekRange = 24;
      // 南で攻撃を続けると北の山口が索敵の外に残る。徒歩の先手も段の行き先へ。
      for (const g of [F.sakiG, F.iharaG]) if (canMarch(g)) {
        g.order = 'move'; g.dest = g === F.sakiG ? YAMA_GO : { x: YAMA_GO.x, z: YAMA_GO.z - 20 }; g.focus = null; g.speed = 4.6;
        g.arriveRadius = 8;
        g.onArrive = (q) => {
          if (F.step !== 3 || F.ending || !canMarch(q)) return;
          q.order = 'attack'; q.seekRange = 40; q.aggro = 14;
        };
      }
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
      // 11/17 K355 クラウド k365-cloud-42（『常山紀談』ほかの伝え：重成は前の日から食を細くし、兜に香を焚きしめて出た）。討たれる覚悟の怖さを寄せ手の口から一つ
      rt.after(11, () => { if (F.step === 4 && !F.kimuraDone && !F.ending) rt.say('井伊の足軽', '捕らえた木村の兵が申すには、長門守は昨夜から湯漬けも喉を通さなんだと……', 3.4); });
      rt.after(15, () => { if (F.step === 4 && !F.kimuraDone && !F.ending) rt.say('井伊の侍', '死ぬ気の者ほど退かぬ。囲んで、一人で掛かるな！', 2.8); });
      // 井伊の手の安藤重勝が木村の首を狙って寄る（史実で首を取った者）
      if (canMarch(F.andoG)) { F.andoG.onArrive = null; F.andoG.order = 'attack'; F.andoG.seekRange = 50; F.andoG.focus = F.kimuraU; }
      // 先手と庵原の隊も堤の木村の本隊へ寄せる（主人公一人で堤へ行かせない）
      for (const g of [F.sakiG, F.iharaG, F.kibaG]) if (canMarch(g)) { g.onArrive = null; g.focus = null; g.order = 'attack'; g.noRun = false; g.seekRange = 70; g.aggro = 16; }
      // 11/18 03時 クラウド持ち主（act bot の止まり 256〜366秒「井伊の先手・庵原朝昌の隊 ord=attack mv=false」が北の田 (34,-124) に残った）：
      //   堤の木村は持ち場に縛られ、七十歩の索敵でも寄せ先にならず、徒の二隊は北の田で棒立ちだった。堤の東の田（二十二歩手前）まで歩かせ、本人の後ろの二の備として構える。
      //   堤の前まで掛からせると、本人の前の木村の兵を味方が先に取り、act bot 三回とも無傷の訴えに戻った（二の備は寄られた時だけ打ち合う）。
      for (const [g, dz] of [[F.sakiG, -14], [F.iharaG, 14]]) if (canMarch(g)) {
        g.order = 'move'; g.dest = { x: WAKAE.x + 22, z: WAKAE.z + dz }; g.speed = 4.6; g.arriveRadius = 8;
        g.onArrive = (q) => { if (F.step !== 4 || F.ending || !canMarch(q)) return; q.order = 'hold'; q.anchor = { ...q.dest }; q.facing = -Math.PI / 2; q.seekRange = 8; q.aggro = 6; };
      }
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
    for (const g of [F.takanoriG, F.kuwanaG]) if (canMarch(g) && !g._regrouped) { g.order = 'attack'; g.seekRange = 40; }
  },

  // 名のある将の討死（筋書きどおり）
  fall(rt, g, name, line) {
    const F = rt.flags;
    if (F.ending || rt.over || rt.ended || !g) return;
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
    // 二将の討死が続いても、既に届いた退く下知を前進で取り消さない。
    if (canMarch(F.choA)) { F.choA.order = 'move'; F.choA.dest = { ...CHO_A }; F.choA.speed = 3; }
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
    rt.player.u.invuln = true;
    for (const g of [F.choA, F.choG, F.choSide, F.fuseG]) if (live(g)) {
      g.fixed = false; g.ambush = false; g.order = 'flee'; g.routed = true;
      for (const u of g.units) { u._nest = false; u._crouch = false; }
    }
    sfx('horagai', 0.9);
    rt.banner('長宗我部、退く', '慶長二十年五月六日　八尾・若江の戦い');
    rt.say('使番', '八尾の長宗我部、若江の崩れを聞いて大坂へ退きまする！', 3.2);
    rt.after(3.6, () => rt.say('藤堂高虎', '……長宗我部が退くぞ。だが、追う力は残っておらぬ', 3.4));
    rt.after(7.4, () => rt.say('藤堂高虎', '八尾では身内を多く失うた。高刑も、桑名も……', 3.4));
    rt.after(11, () => rt.say('使番', '大御所様より。明日、天王寺と岡山で総懸かりとの仰せ', 3.4));
    // 11/17 K355 クラウド k365-cloud-42：戦の後の場面を足す（余韻の三十秒の空きに）。
    //   重成の首に香が焚きしめてあった（『常山紀談』の伝え）・藤堂の渡辺了が下知を待たず長宗我部を追い、高虎が止めた（『渡辺水庵覚書』の伝え）
    const late = (t, who, line, d) => rt.after(t, () => { if (!rt.over && !rt.ended) rt.say(who, line, d); });
    late(15, '井伊の侍', '殿、木村殿の兜から香の匂いが……。髪にまで焚きしめてござる', 3.4);
    late(18.8, '井伊直孝', '討たれる時を見定めて出たか。その首、粗末に扱うな', 3.4);
    late(22.6, '藤堂の侍', '渡辺勘兵衛殿、下知を待たず長宗我部の後ろへ追いすがっておりまする！', 3.4);
    late(26.4, '藤堂高虎', '勘兵衛を呼び戻せ。今日は、もう十分に死んだ', 3.2);
    // finish は直ちに勝利を出し、戦固有の update を止める。
    // 後備えまで退く下知を渡し、主人公が動ける間に退却と最後の声を見届けてから締める。
    // 戦後の余韻は三十秒以上（kaito_yoken_1111 の46）。退く旗本を見届ける時間を残す。
    rt.after(30, () => {
      if (rt.over || rt.ended) return;
      rt.objDone('s4');
      rt.award((t) => { t.main = true; t.special = t.special || { label: '長宗我部を八尾から退かせた', pts: 30 }; }, '長宗我部を八尾から退かせた');
      rt.finish({ scriptedEnd: true }, 1.5);
    });
  },

  update(rt, dt) {
    const F = rt.flags;
    k281Tick(rt, dt, F.step || 0);
    // K281：本人の30〜60m に長宗我部・木村の後詰（二十・遠くから歩いて出てくる本物の組）を置き続ける（段の長さは変えない・上限の内）
    keepReserve(rt, dt, '_k281R', (at, face) => {
      let live = 0; for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.gone) live++;
      if (live + 22 > (rt.def.realCap ?? 250) + 10) return null;
      return enemyGroup(rt, { faction: 'toyotomi', name: F.step >= 2 ? '木村の後詰' : '長宗我部の後詰', anchor: at, facing: face, width: 11, order: 'hold', aggro: 10, seekRange: 14, noRout: true, formation: 'yari', morale: 90, dmgMult: 0.3, fleeDir: { x: -1, z: 0 } },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18, o: { flagScale: 1 } }, { type: 'gun', n: 2 }], F.step >= 2 ? KIMURA : CHOSO));
    }, () => F.step === 1 && !F.ending);   // 全段に置くと段2〜4で味方が後詰に引かれ870秒に延びた。段1（長宗我部の先手・野の段）だけ
    // 11/19 クラウド kaito2（司令塔「近くに兵の組を直に置く」・Total War の物差し）：開戦の野で本人の六十歩内が味方60・敵36と薄かった。
    //   本人が八尾の横の備へ向かう野の途中（本人が七十歩内に寄った時に立てる。開戦に立てると本人が着く前に討ち合い尽きた）（x 36〜52・z 58）に、藤堂の新手と長宗我部の一手を向かい合わせて斬り合わせる（本物の兵・上限の内）
    if (!F.ywClash && F.step === 1 && rt.player?.u && Math.hypot(rt.player.u.pos.x - 44, rt.player.u.pos.z - 58) < 70) {
      F.ywClash = [];
      let live = 0; for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.gone) live++;
      if (live + 20 <= (rt.def.realCap ?? 250)) {
        const a = allyGroup(rt, { ...YW_TODO_O, name: '藤堂の新手', anchor: { x: 52, z: 58 }, width: 8, aggro: 14, seekRange: 24, order: 'attack', dmgMult: 0.15, defMult: 1.5 },
          dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9, o: { flagScale: 1 } }], TODO));
        const e = enemyGroup(rt, { ...YW_CHO_O, name: '長宗我部の一手', anchor: { x: 36, z: 58 }, width: 8, aggro: 14, seekRange: 24, order: 'attack', dmgMult: 0.15, dmgMultPlayer: 0.85, defMult: 1.5 },   // 互いの傷は浅く、本人が通るまで押し合いを続ける
          dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9, o: { flagScale: 1 } }], CHOSO));
        a.fire = true; e.fire = true; F.ywClash = [a, e];
      }
    }
    // 11/19 03時 クラウド持ち主（act bot・描かずの足跡）：長宗我部の一手（崩れず・受け1.5）が本人の通り道に立ち、本人は三十秒余り打ち合って一人しか討てず、
    //   伏せ槍が立つのが百七十秒・段1が二百十秒余りに延びた（前は百四十〜百六十秒）。本人が十二歩内に五秒いるか一人を討てば、一手は崩れて西へ退く（03:30 六歩・十二秒・二人では段1 百八十〜二百十秒のまま）
    //   （野の斬り合いの絵は本人が寄るまでの間に見せる。本人の足は止めない）。
    const ce = F.ywClash?.[1];
    if (ce && !ce._ywBroke && rt.player?.u) {
      const P = rt.player.u, alive = ce.units.filter((u) => u.alive);
      if (alive.length && alive.some((u) => Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 12)) ce._ywT = (ce._ywT || 0) + dt;
      if (!alive.length || (ce._ywT || 0) > 5 || alive.length <= ce.units.length - 1 || F.step > 1) {
        ce._ywBroke = true; ce.noRout = false; ce.defMult = 1; ce.order = 'flee'; ce.routed = true;
        for (const u of alive) { u.target = null; u.aiT = 0; }
      }
    }
    // 11/19 06時 クラウド持ち主（act bot・描かずの足跡）：横の備の一人が味方を追って東西の道の南（若江の方）へ流れ、印がその一人を指して
    //   本人は若江の物見・内藤の隊の前へ連れ出され、段1が三百三十秒に延びた（本人の討ち取り0〜1の回の訳）。道の南へ出た横の備は本隊の方へ逃げ戻る。
    if (F.step === 1 && F.stepG && rt.army) for (const u of F.stepG.units) {
      if (!u.alive || u.fleeing || u.pos.z >= 22) continue;
      const dx = CHO_A.x - u.pos.x, dz = CHO_A.z - u.pos.z, l = Math.hypot(dx, dz) || 1;
      u.moraleFleeDir = { x: dx / l, z: dz / l }; u.fleeing = true; u.fleeT = rt.army.time; u.target = null; u.atk = null; u.swing = null; u.aiT = 0;
    }
    // 11/19 クラウド kaito2（K281：90秒・200秒に本人の30〜60m の敵の本物が7・14＝敵の組が本人の近く（十〜三十m）か遠く（百m 余り）に分かれ、中ほどが空）：
    //   段1は長宗我部の後詰、段4は木村の後備（各二十）を、本人から目当ての大将の方へ四十五m の所に控えさせる（持ち場に立つ塊。上限の内だけ）
    //   段1は本人が長宗我部の先手の四十m 内に寄った時、先手の後ろ二十五m（本人から見て先手の向こう）に。段4は木村の本隊の向こうへ
    const ctr = (g) => { const v = g?.units?.filter((u) => u.alive && !u.gone); if (!v?.length) return null; return { x: v.reduce((k, u) => k + u.pos.x, 0) / v.length, z: v.reduce((k, u) => k + u.pos.z, 0) / v.length }; };
    for (const [key, st, grp, nm, look] of [['ywRes1', 1, F.choA, '長宗我部の後詰', CHOSO], ['ywRes3', 3, F.yamaG, '山口の後備', KIMURA]]) {   // 段4の木村の後備は段4を185〜371秒に延ばした回があり外した（11/19 kaito2）
      if (F[key] || F.step !== st || !rt.player?.u) continue;
      const c = ctr(grp); if (!c) continue;
      const P = rt.player.u.pos, dx = c.x - P.x, dz = c.z - P.z, L = Math.hypot(dx, dz) || 1;
      if (L > 40) continue;
      F[key] = true;
      let live = 0; for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.gone) live++;
      if (live + 20 > (rt.def.realCap ?? 250) + 20) continue;
      const at = { x: c.x + dx / L * 25, z: c.z + dz / L * 25 };
      if (rt.world?.walkable?.(at.x, at.z) === false) continue;
      enemyGroup(rt, { faction: 'toyotomi', name: nm, anchor: at, facing: Math.atan2(-dx, -dz), width: 10, order: 'hold', aggro: 10, seekRange: 14, noRout: true, formation: 'yari', morale: 90, dmgMult: 0.4, fleeDir: { x: -1, z: 0 } },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16, o: { flagScale: 1 } }, { type: 'gun', n: 2 }], look));
    }
    try { jin14.tick(rt, dt); } catch (e) { if (!rt.flags._jinErr) { rt.flags._jinErr = 1; console.warn("八尾若江の陣立て", e); } }
    if (F.ending || !F.begun) return;
    KIT.backTick(rt);
    const P = rt.player.u;
    // 見えない壁
    if ((F.wallT = (F.wallT || 0) - dt) <= 0) {
      F.wallT = 0.25;
      for (const u of rt.army.units) {
        if (!u.alive || u.gone) continue;
        if (u.pos.x > 248) u.pos.x = 248; else if (u.pos.x < -325) u.pos.x = -325;   // K458：西は広げた大坂の奥まで
        if (u.pos.z > 248) u.pos.z = 248; else if (u.pos.z < -248) u.pos.z = -248;
      }
    }
    // 11/19 03:30 クラウド持ち主（描かずの足跡 10秒ごと）：畦に伏せて隠れた物見（ambush・fixed）が段1の間に持ち場 (24,-26) から八尾の斬り合いへ
    //   五十歩余り南へ流れ（46秒 z-5→168秒 z27）、段2で戻り道でなく八尾の脇で立っていた。伏せている間は伏せた場所に留める。
    if (F.monoG?.ambush) for (const u of F.monoG.units) {
      if (!u.alive) continue;
      // 11/19 夜50-15（act bot 27秒 battle：物見の弓が (33,0)→(26,-25) へ一息で飛ぶ★・2回とも）：出した直後の位置は隊形が組まれる前の (33,0) で、
      //   そこを伏せ場所に覚えていたため、伏せを解く時に持ち場 (26,-26) へ飛んだ。隊形が組まれた後（二秒後）の位置を伏せ場所に覚える
      if (!u._ywHome) { if ((rt.t || 0) < 2) continue; u._ywHome = { x: u.pos.x, z: u.pos.z }; }
      u.pos.x = u._ywHome.x; u.pos.z = u._ywHome.z; if (u.vel) { u.vel.x = 0; u.vel.z = 0; }
    }
    // 物見は三人を切るか段3に入れば内藤の陣の方（西）へ退く
    if (F.monoG && canMarch(F.monoG) && F.step >= 2 && (aliveN(F.monoG) <= 2 || F.step >= 3)) { F.monoG.order = 'flee'; F.monoG.routed = true; }
    // 手勢は主人公の近くで戦う（離れたら寄る）。④で南へ駆ける間は、先手と安藤の手も主人公の脇を同じ向きへ駆ける（一5・九4）
    if ((F.menT = (F.menT || 0) - dt) <= 0) {
      F.menT = 0.5;
      // 護衛の追従でも、退く下知と敗走を攻撃へ戻さない。
      const c = live(F.mine) && !F.mine.routed && F.mine.order !== 'retreat' && F.mine.order !== 'flee' && F.mine.center();
      if (c) {
        // 行き先は主人公から 10m 外れた時だけ出し直す（出し直すたびに隊は合図を待つので、毎回替えると動かない）
        // 11/18 クラウド（見回り cloud-11 の150秒の写真）：②へ向かう間、手勢が本人の後ろに付き、画面には本人一人だけが野を歩いていた。
        // 持ち場から四十歩より遠い行き来の間は、行き先の向きの七歩前・五歩右へ寄せ、背中から撮る画面に味方の槍が入るようにする。
        const AT0 = F.step >= 1 && F.step <= 3 ? (F.step === 1 && yaoLeft(F.stepG) === 0 ? FUSE : STEP_AT[F.step]) : null;
        const far = AT0 && dist(P.pos, AT0) > 40;
        let want = { x: P.pos.x + 2, z: P.pos.z + 3 };
        if (far) {
          const ux0 = AT0.x - P.pos.x, uz0 = AT0.z - P.pos.z, d0 = Math.hypot(ux0, uz0) || 1, ux = ux0 / d0, uz = uz0 / d0;
          want = { x: P.pos.x + ux * 14 - uz * 5, z: P.pos.z + uz * 14 + ux * 5 };   // 縦隊は要の後ろへ伸びるので、要は十四歩前に置く
        }
        const gap = dist(c, want);
        // 十二歩の境目で移動と攻撃を往復すると、そのたびに合図待ちになる。
        // 追従を始めた隊は八歩まで寄せ、以前の敵を追う下知も外す。
        if (gap > 12 || F.mine.order === 'move' && gap > 8) {
          if (F.mine.order !== 'move' || !F.mine.dest || dist(F.mine.dest, want) > 10) {
            F.mine.order = 'move'; F.mine.dest = want;
          }
          F.mine.focus = null; F.mine.speed = far ? (P.mounted ? 7 : 5.4) : 4.6;
          // 11/18 クラウド（八尾若江の持ち主・150〜175秒の位置の測り）：槍の横隊は兵の足を隊の歩み＋0.7に縛るので、
          //   要は本人に付いても兵は四十歩後ろを歩いたまま追いつかず、画面は本人一人だった。遠い行き来の間は縦隊に組み、兵が自分の足で駆ける。
          F.mine.march = far ? true : undefined;
        } else { F.mine.order = 'attack'; F.mine.seekRange = 18; F.mine.march = undefined; }
        // 11/18 18時 クラウド持ち主（290秒の写真で②へ向かう本人の周りに手勢が一人もいない・描かずの足跡）：
        //   段2・段3の持ち場へ向かう間、手勢の弓・鉄砲が八尾の逃げる敵を狙ったまま追い、本人と逆へ五十〜七十歩離れていた。
        //   鉄砲は三十〜五十歩先の残りの敵へ足を止めて撃っていた。行き来の間は逃げる敵と二十歩より遠い敵を狙わない（寄ってくる敵とは斬り合う）。
        if (far && F.step >= 2 && !F.stepNear) for (const u of F.mine.units) if (u.alive && u.target && (u.target.fleeing || dist(u.pos, u.target.pos) > 20) && !u.bind && !u.atk) { u.target = null; u.aiT = 0; }
        // 11/18 19時 クラウド持ち主（描かずの足跡 5秒ごと・187〜205秒）：②へ向かう間、無傷でも疲れ（1.0）の足軽は二・一 m/s で本人の十九歩後ろ、
        //   脚の手傷の侍・足軽は一・五〜二 m/s で三十五歩後ろに残った。遠い行き来の間、本人の十四歩より後ろの者は組の追いつきと同じく疲れで鈍らせない
        //   （army_think の catchUp。脚の手傷の鈍りはそのまま＝手負いは本当に遅れる）。
        F.mine.catchUp = !!(far && F.step >= 2 && !F.stepNear);
        for (const u of F.mine.units) if (u.alive) u._sqCatch = F.mine.catchUp && dist(u.pos, P.pos) > 14;
      }
      // 八尾・内藤・山口へ騎馬も同行する。行き先は替えず、先なら控え、遅れれば馬を急がせる。
      const kb = F.kibaG;
      const GO = F.step === 1 ? (yaoLeft(F.stepG) === 0 ? FUSE : FLANK_GO) : F.step === 2 ? NAITO_GO : YAMA;
      // 一度斬り合った騎馬も、主から離れたら同行へ戻す。
      // 横の備の跡で戦い続け、伏せ槍や若江へ主だけを走らせない。
      // 21時：本人を待たずに掛かった騎馬（kbAtT）は、その段の要の四十歩内で斬り合う間は呼び戻さない（呼び戻すと八秒ごとに掛かっては立つ）。
      const AT0 = F.step === 1 && yaoLeft(F.stepG) === 0 ? FUSE : STEP_AT[F.step];
      if (F.step <= 3 && canMarch(kb) && dist(kb.center(), P.pos) > 24 &&
          !(F.kbOwn === F.step && kb.order === 'attack' && AT0 && dist(kb.center(), AT0) < 40) &&
          (kb.order !== 'move' || kb.dest !== GO)) {
        kb.order = 'move'; kb.dest = GO; kb.focus = null;
      }
      if (F.step <= 3 && canMarch(kb) && kb.order === 'move') {
        const dx = GO.x - P.pos.x, dz = GO.z - P.pos.z, d = Math.hypot(dx, dz) || 1;
        const ahead0 = ((kb.anchor.x - P.pos.x) * dx + (kb.anchor.z - P.pos.z) * dz) / d;
        // 11/18 18時 クラウド持ち主（②へ向かう間の足跡）：要が本人の四歩より前にあると馬を歩ませ、騎馬の兵は要の二十〜四十歩後ろに
        //   残ったまま本人に離された（段2の初めに四十〜五十歩後ろ・追いつくまで二十五秒）。要と騎馬の真ん中の後ろの方で速さを決める。
        const kc = kb.center(), ahead = Math.min(ahead0, ((kc.x - P.pos.x) * dx + (kc.z - P.pos.z) * dz) / d);
        // 共通の駆け足補正（騎馬は最低6.5）で、待つ速さや徒歩の主への足並みを上書きさせない。
        kb.noRun = true;
        // 11/17 クラウド kaito2（K365 874×402）：30秒の写真で主人公が一騎で野を駆け、騎馬が後ろに置いて行かれていた。馬上の主には同じ速さで並ぶ
        // 11/18：後ろに付くと背中から撮る画面に映らない。主の四〜十四歩前を駆けさせる。
        kb.speed = ahead > 14 ? 1.5 : ahead < 4 ? 9 : P.mounted ? 7.2 : 4.4;
      }
      // 着いた隊から横の備へかかる（徒の隊は着くまで駆け続ける）
      if (F.step <= 3) {
        const AT = F.step === 1 && yaoLeft(F.stepG) === 0 ? FUSE : STEP_AT[F.step];
        // 持ち場の反対側どうしでは八十歩近く離れる。主人公の脇へ揃うまで同行を切らない。
        // 11/18 21時 クラウド持ち主（act bot 76秒「井伊の騎馬 ord=move mv=false @-13,54 敵が遠く歩けず」）：騎馬が持ち場に着いても本人が十八歩より離れていると
        //   同行の待ちのまま横の備の前で二十秒立っていた。持ち場の四十歩内に八秒いたら、本人が離れていても掛かる。
        const kNear = canMarch(kb) && kb.order === 'move' && dist(kb.center(), AT) < 40;
        F.kbAtT = kNear ? (F.kbAtT ?? rt.t) : null;
        if (kNear && ((dist(P.pos, AT) < 40 && dist(kb.center(), P.pos) < 18) || rt.t - F.kbAtT > 8)) { kb.order = 'attack'; kb.noRun = false; kb.seekRange = 40; F.kbAtT = null; F.kbOwn = F.step; }
      }
      // 11/18 20時 クラウド持ち主（act bot 3回とも 256〜316秒「安藤重勝の手 ord=attack mv=false 行き先無し」@69,-96）：段2・段3の刻限の押しで攻めの下知を受けても、
      //   寄せ先（focus）が無い攻めの隊は十四 m 内しか敵を探さず、内藤・山口の隊（六十歩先）へ寄らず若江の東の田で棒立ちだった。その段の敵の一番近い者を寄せ先にする。
      //   20:30 同じ形の止まり（井伊の先手 301〜401秒 @37,-112・庵原朝昌の隊 186〜246秒 @37,-79）も同じく寄せ先を与える。
      // 21時：段3の安藤（寄せ先が逃げる者のまま着いて待つ @69,-96）・段4の井伊の先手（寄せ先無し @9,-106）も同じ止まり→段4まで、逃げる寄せ先も三秒ごとに選び直す。
      const reFoc = !(F.reFocT > rt.t - 3); if (reFoc) F.reFocT = rt.t;
      // 21:50：段4は木村の旗本が本人の十四歩外で味方の刃を弾く（守り）。弾く者を寄せ先にすると、着いても斬れず「着いて待つ」と数えられた
      //   →弾かれない者（本人の近く）を先に選び、弾く者は本人に近い順（本人の脇へ寄って二の備になる）。弾く者を追う隊も三秒ごとに選び直す。
      // 11/19 05時 クラウド持ち主（act bot 416・436秒 段4「井伊の騎馬 n=2 行き先無し @-9,-102」「藤堂の新手 n=1 行き先無し @8,-85」）：騎馬と野の新手の残りも同じく寄せ先を与える。
      for (const an of [F.andoG, F.sakiG, F.iharaG, F.kibaG, F.ywClash?.[0]]) if (an && F.step >= 2 && F.step <= 4 && canMarch(an) && an.order === 'attack' && (!(an.focus?.alive) || (reFoc && (an.focus.fleeing || an.focus.gone || an.focus.invuln))) && live(F.stepG)) {
        const ac = an.center(); let best = null, bd = 1e9;
        for (const u of F.stepG.units) if (u.alive && !u.gone && !u.fleeing) { const d = u.invuln ? 1e4 + dist(u.pos, P.pos) : dist(u.pos, ac); if (d < bd) { bd = d; best = u; } }
        if (best) an.focus = best;
      }
      if (F.step === 1 && F.choSide.order === 'hold' && [F.mine, F.kibaG].some((g) => live(g) && dist(g.center(), FLANK) < 36)) {
        F.choSide.order = 'attack'; F.choSide.seekRange = 30;
      }
    }
    // 崩れて退いた兵は遠く離れたら去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - dt) <= 0) {
      F.gcT = 1;
      // 11/18 03時 クラウド持ち主（act bot の止まり 126〜151秒「藤堂高刑の隊 ord=retreat mv=false」）：将を討たれて退いた隊は、
      //   退き先に着いたら退く下知のまま棒立ちにせず、その場で西へ向き直って備え直す（寄られれば持ち場で打ち合う）。
      for (const g of [F.takanoriG, F.kuwanaG]) {
        // 11/19 06時：退き先の十九歩手前（33,111）で退く下知のまま八秒以上動かない残りも「行き先無し」で棒立ちだった（act bot 191〜251秒）→その場で備え直す。
        let stuck = false;
        if (live(g) && !g.routed && g.order === 'retreat' && g.dest) {
          const c = g.center();
          if (!g._rtAt || dist(c, g._rtAt) > 1.5) { g._rtAt = { x: c.x, z: c.z }; g._rtT = rt.t; } else stuck = rt.t - g._rtT > 8;
        }
        if (live(g) && !g.routed && g.order === 'retreat' && g.dest && (stuck || dist(g.center(), g.dest) < 6)) {
          const at = stuck ? g.center() : g.dest;
          g.anchor.x = at.x; g.anchor.z = at.z; g.order = 'hold'; g.facing = -Math.PI / 2; g.aggro = 6; g.seekRange = 10; g._regrouped = true;
        }
      }
      // 11/18 20時 クラウド持ち主（act bot 406・461秒「遠くの備 九人が一点に重なる」@-78,107・描かずの足跡）：長宗我部の本陣の裏の遠くの備は、
      //   重なりの直し（depth_reserve）が持ち場を今の真ん中へ置き直すたびに東へ寄り（-92→-71）、陣幕の内の旗本の床几の列へ入り込んで重なった。
      //   持ち場は本陣（床几）から十六歩の外に留める。
      for (const g of rt.army.groups) if (g._far && g.team === 1 && g.anchor && !g.routed) {
        const dx = g.anchor.x - YAO.x, dz = g.anchor.z - YAO.z, d = Math.hypot(dx, dz);
        if (d < 16) { const k = 16 / (d || 1); g.anchor.x = YAO.x + (d ? dx * k : -16); g.anchor.z = YAO.z + (d ? dz * k : 0); }
      }
      for (const g of [F.kimuraG, F.yamaG, F.naitoG, F.choSide]) if (g) for (const u of g.units) if (u.alive && !u.gone && u.fleeing && dist(u.pos, P.pos) > 45) rt.army.despawn(u);
    }
    huntPlayer(rt, F, dt);
    huntTurn(rt, F, dt);
    if (!canProgress(rt)) return;
    if (F.pendingStep) { this.toStep(rt, F.pendingStep); return; }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    // その戦場へ寄ってから達成を判定する。後方で待つだけでは目標に印を付けない。
    // 押し合いで隊が動いた時も、実際に案内した印へ着けば到着とする。
    // 元の布陣位置だけを見ると、印の所で敵を退けても段が止まる。
    const pin = this.missionPin(rt);
    if (dist(P.pos, STEP_AT[F.step]) < 34 || (pin && dist(P.pos, pin) < pin.r)) F.stepNear = true;
    // 11/20 K458（act bot 457秒・段3 が三回とも 144〜213秒：本人が山口の三十四歩内へ入るまで刻限が始まらず、手前の田で内藤の残りや木村の兵と打ち合う間は数えなかった）：
    //   若江の二段（内藤・山口）は、段の始めから二十五秒たって本人が持ち場の八十歩内にいれば着いたとみなして刻限を数える
    if ((F.step >= 2) && rt.t - F.stepT > 25 && dist(P.pos, STEP_AT[F.step]) < 80) F.stepNear = true;
    // 11/20 K458：戦が五分を過ぎたら急ぎの段（若江の段は着いて三十秒で味方が押し崩す・木村は四十秒で討たれる）。全体を七分の内へ（act bot 463〜539秒）
    const hurry = rt.t - (F.t0 ?? 0) > 300;
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
    // 11/18 07時 クラウド持ち主（描かずの足跡）：横の備を六割討っても、本人が堤の三十四歩内へ歩くまで伏せ槍は立たず、
    //   立った後も一人ずつ寄せて四十秒討ち取り0（段1＝135〜172秒・全体が七分を超える訳の一つ）。横の備が半ば崩れたら、
    //   本人が横の備で戦っている間に堤から槍が立って横から掛かる（藤堂の先手が寄った所を伏兵が一斉に突いた史実の形）。
    // 11/18 22時 クラウド持ち主（描かずの足跡 0.6秒ごと）：横の備は十三秒で六割討たれたのに、本人が横の備の東（堤の八十〜九十歩手前）で残りの四、五人と打ち合う間、
    //   伏せ槍は「堤の六十歩内」を待って四十六秒伏せたまま（本人の討ち取り0〜1・段1＝156〜198秒）→横の備が半ば崩れたら百十歩内で立つ（槍は本人へ駆けて来る）。
    if (F.step === 1 && F.fuseG?.ambush && (dist(P.pos, FUSE) < 34 ||
        F.stepNear && dist(P.pos, FUSE) < 110 && aliveN(F.stepG) <= Math.ceil(F.stepG.units.length * 0.5))) {
      F.stepNear = true;   // 印に従って堤へ着いた場合も、八尾の戦場へ到着したと数える。
      F.fuseG.ambush = false; F.fuseG.fixed = false; F.fuseG.order = 'attack'; F.fuseG.seekRange = 40; F.fuseG.aggro = 14;
      for (const u of F.fuseG.units) u._crouch = false;
      // 立った槍は藤堂の先手でなく、横を突いた本人の組へ掛かる（離れた藤堂の前へ流れると本人は五十秒討てなかった）
      F.fuseG.focus = P;
      F.choA.defMult = 0.9;   // 伏兵を見届けた後は赤備えの横槍が通る。段の組み替えで切替が抜けていた（B3）。
      rt.army.play('toki', FUSE, 1.6);
      rt.say('足軽', '堤から槍が立った！ 伏せておったぞ！', 2.8);
    }
    // 移動に掛かった時を救済の刻限に含めない。八尾から若江へ戻る間に
    // 内藤隊が弱まり、到着直後に残兵まで退くと、打ち合う前に段が終わる。
    // 八尾は伏せ槍が立ってから数え、現地で長引いた時の救済は残す。
    if (F.pressureAt == null && F.stepNear && (F.step !== 1 || !F.fuseG.ambush)) F.pressureAt = rt.t;
    const fightingTime = F.pressureAt == null ? 0 : rt.t - F.pressureAt;
    const left = STEP_T[F.step] - fightingTime;
    // 現地で刻限を過ぎたら味方の押しが強まる（負けにはしない。二5・十二3）
    if (left <= 0 && !F.pushed && !F.next) {
      F.pushed = true;
      const g = F.stepG;
      // 士気や攻撃力が零の隊を、刻限の加勢で持ち直させない。
      for (const q of [g, F.step === 1 && F.fuseG]) if (q) { q.morale = Math.min(q.morale ?? 100, 40); q.dmgMult = (q.dmgMult ?? 1) * 0.6; }
      // 若江の刻限で藤堂勢を強めない。北の山口へ同行中の騎馬も、到着判定まで進軍を続ける。討死後の退く下知も守る。
      const pushing = F.step === 1 ? [F.mine, F.kibaG, F.todoGun, F.takanoriG, F.kuwanaG] : [F.mine, F.sakiG, F.iharaG, F.andoG, F.kibaG];
      for (const a of pushing) if (live(a) && !a.routed && a.order !== 'retreat' && a.order !== 'flee' && !a._regrouped && !(F.step <= 3 && a.order === 'move')) { a.order = 'attack'; a.seekRange = 80; a.dmgMult = Math.max(a.dmgMult || 1, 1.2); }
      if (F.step >= 2 && F.step <= 3) rt.say('井伊直孝', '先手が押しておる。遅れるな！', 2.6);
    }
    if (F.step === 4) {
      // 木村の討死後の待ち時間に倒れた場合も、復帰後に締めへ進む。
      if (F.kimuraDone && rt.t >= F.winReadyAt) { this.win(rt); return; }
      // 木村は主人公が堤へ来てから戦う。刻限だけで安藤の討取りを起こさない。
      // 11/18 17:10 UTC クラウド持ち主：act bot 7回のうち4回で段4が12〜33秒＝本人が木村へ真っすぐ寄って数突きで討ち、11秒・15秒の台詞（湯漬け・一人で掛かるな）が出ずに一番の山が終わった。
      //   段4の初め二十秒は木村は討たれない（手傷も退かず堤で打ち合う）。二十秒を過ぎれば今まで通り本人の一撃で倒れる。
      // 11/19 08時 クラウド持ち主（act bot 614秒の回：本人が若江の野に入った後、木村を味方が本人の八十八歩先で討ち、本人は段4で討ち取り0のまま二十六秒待った）：
      //   若江の野へ着いた（stepNear）後も、本人が木村の四十五歩より外なら味方の刃を弾く（二十五歩では旗本と打ち合う本人が三十五歩で八十秒止まり、段4が百三十秒に延びた）。長引きの救い（下の一行）は今まで通り。
      if (F.kimuraU?.alive) storyGuard(F.kimuraU, dist(P.pos, F.kimuraU.pos) > 45 || rt.t - F.stepT < 20);
      // 11/19 08:30 クラウド持ち主（act bot 465秒の回：本人が木村の二十歩前で旗本と打ち合い続け、木村は長引きの救いで倒れ名のある討ち取り0）：
      //   段4で四十秒打ち合っても本人が木村の六歩内に来なければ、重成が自ら本人へ打って出る（四十歩内の時だけ・堤の前で一騎打ちの形。三十歩では三十三歩で打ち合う本人に届かず三回に一回は救いで倒れた）。
      // 11/21 クラウド持ち主（act bot 391秒の回：五分を過ぎた段4で本人が木村の五十歩先の旗本と打ち合い、四十秒の長引きの救いで木村が倒れ名のある討ち取り0）：
      //   五分を過ぎたら十五秒で打って出る・七十五歩内まで届く（救いの四十秒より前に本人の前へ来る）。
      if (F.kimuraU?.alive && !F.kimuraDone && F.stepNear && fightingTime > (hurry ? 15 : 30)) {   // K458：四十→三十秒
        const dK = dist(P.pos, F.kimuraU.pos);
        if (dK > 6 && dK < 75 && F.kimuraU.target !== P) { F.kimuraU.target = P; F.kimuraU.aiT = 0; F.kimuraU.moveTo = null; }
        // 本隊が持ち場に縛られている（stay）間は木村も堤へ引き戻され、四十〜五十歩で救いの討死になった。打って出る時は縛りを解く。
        if (dK > 6 && dK < 75) F.kimuraG.stay = false;
      }
      // 現地で戦った後の長引きだけを救う。遠くで待っても木村の討取りにはしない。
      if (F.stepNear && !F.kimuraDone && F.kimuraU?.alive && fightingTime > (hurry ? (dist(P.pos, F.kimuraU.pos) < 30 ? 60 : 40) : (STEP_T[4] || 70) + 30)) { F.kimuraU.invuln = false; rt.army.kill(F.kimuraU); }   // 11/21：打って出た木村が本人の三十歩内なら救いを二十秒待つ（十八〜二十三歩で救いが先に来た）
      if (!F.kimuraDone && F.kimuraU && !F.kimuraU.alive) this.kimuraEnd(rt, F.kimuraByMe);
      return;
    }
    if (F.next) return;
    const g = F.stepG;
    if (!F.stepN) F.stepN = Math.max(1, g.units.length + (F.step === 1 ? F.fuseG.units.length : 0));
    const gone = F.stepN - stepAlive(F);
    const cleared = F.step === 1 ? !F.fuseG.ambush && yaoLeft(g) === 0 && yaoLeft(F.fuseG) === 0 : gone >= Math.round(F.stepN * (1 - KEEP));
    // 現地に着いた後は残兵の深追いで止めない。八尾は伏せ槍が立つ見せ場も必要。
    // 時刻だけで到着扱いにすると、野の端にいるまま四目標が済んでしまう。
    const late = F.step <= 3 && (F.step !== 1 || !F.fuseG.ambush) && fightingTime > (hurry && F.step >= 2 ? 30 : (STEP_T[F.step] || 80) + 25);   // 11/20 K458：刻限の後の待ち四十→二十五秒（act bot 450秒・段1 155秒・段3 146秒）
    // 11/18 クラウド：若江の段は、味方と押して目標の隊を退け終えた時に本人が同じ若江の野（持ち場から八十歩内）にいれば進める。
    // 持ち場の三十四歩内だけを見ると、退いた後の無人の田へ歩くまで九十秒止まった（act bot 段3 155秒・札は 9/9）。
    if (cleared && F.step >= 2 && dist(P.pos, STEP_AT[F.step]) < 80) F.stepNear = true;
    if (F.stepNear && (cleared || late)) {
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

  // bot：目標の隊の近い敵を先に突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step || F.ending) return;
    const ok = (o) => standing(o) && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const at = k14_yao_wakae.missionPin(b) || WAKAE;
    // 八尾の先手を斬り続けても、横の備と伏せ槍の目標は進まない。
    // 印と同じ隊を優先し、横の備を六割退けた後は伏せ槍へ切り替える。
    const goal = F.step === 1 && yaoLeft(F.stepG) === 0 ? F.fuseG : F.stepG;
    let e = F.step === 4 && F.kimuraU && ok(F.kimuraU) && dist(F.kimuraU.pos, u.pos) < 14 ? F.kimuraU
      : (!goal?.ambush && b.army.nearestEnemy(u, 9, (o) => o.group === goal && ok(o) && dist(o.pos, at) <= 30)) || b.army.nearestEnemy(u, 9, ok);
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
k14_yao_wakae.history = '慶長二十年（1615）五月六日、大坂夏の陣で大坂方は城を出て河内の田の中で徳川方を迎え撃った。同じ日の道明寺では、のちに後藤又兵衛も討たれた。若江では木村重成のおよそ四千七百が、井伊直孝の赤備えおよそ三千二百と正面からぶつかった。木村勢は藤堂勢の右翼を退けたが、井伊勢との戦いで山口弘定・内藤長秋らが討たれ、重成も井伊家の安藤重勝（長三郎）に討たれた。二十三歳であった。八尾では長宗我部盛親のおよそ五千三百が長瀬川の堤に兵を伏せ、寄せてきた藤堂高虎の先手を一斉に迎え撃って崩し、藤堂高刑・桑名吉成ら藤堂家の将が次々に討たれた。しかし若江の木村勢が崩れると、横を突かれるのを恐れた長宗我部は大坂へ退いた。藤堂・井伊とも損害が大きく、翌日の天王寺・岡山の戦いでは先手を外された。\n重成の首実検で、兜に香が焚き込められていたのを家康が褒めたという話は、後の書物に伝わる逸話である。主人公の組の動き、二つの戦場の間の道のり（実は二キロあまり）は遊びのための筋書きで、兵の数は史料により異なる。';

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
// 11/18 クラウド持ち主（act bot 316秒 達成・討ち取り20・受けた傷 侍24だけ「もっと重く斬り合いたい」）：
//   八尾（段1）・内藤（段2）・山口（段3）で、本人から二十歩内に来た敵の組を一つだけ本人へ向ける（根白坂・木津川口の huntPlayer と同じ形）。
//   敵の数・強さは変えない。本人の命が六割半を切ったら、組が崩れたら、持ち場に縛られた組（伏せ槍・堤の木村・盛親の旗本）は向けない。
function huntPlayer(rt, F, dt) {
  if ((F._huntT = (F._huntT || 0) - dt) > 0) return;
  F._huntT = 0.5;
  const P = rt.player.u;
  const on = P?.alive && F.step >= 1 && F.step <= 3 && !F.next && P.hp >= P.maxHp * 0.65;
  const c = F._huntC || (F._huntC = { x: 0, y: 0, z: 0 });
  // 11/18 03時 クラウド持ち主：内藤（段2）・山口（段3）の隊は持ち場に縛る stay のため、兵が本人を狙う決まり（army_think の pull）から外れ、
  //   本人の4歩内に入る敵が0〜3人・命は段4まで100のままだった。その段の隊だけ、隊の真ん中が持ち場から二十歩内の間は縛りを解き、本人へ打ち掛からせる。
  //   二十歩より出たら縛り直す（六十歩先まで追わせない決まりは守る）。本人の命が六割半を切ったら縛り直す。
  for (const [g, at, s] of [[F.naitoG, NAITO, 2], [F.yamaG, YAMA, 3]]) {
    if (!g) continue;
    if (g.routed || g.order === 'flee') { if (g._shield) { g._shield = false; for (const u of g.units) u.invuln = false; } continue; }
    g.center(c);
    const free = on && F.step === s && Math.hypot(c.x - at.x, c.z - at.z) < 20;
    g.stay = !free;
    // 11/18 04時 クラウド持ち主：act bot の足跡（3秒ごと）で、段2・段3の間 本人の二十五歩内の敵は0人＝内藤・山口の隊は本人が八尾から駆け戻る前に
    //   井伊の先手だけで討たれ尽くし（段2は37秒・段3は35秒で済）、本人は空の田を走って通り過ぎていた（「27人を無傷で討った」「歯ごたえがない」）。
    //   本人の三十歩内にその隊の兵が一人もいない間は、味方の刃と玉を通さない（槍を合わせて押し合う絵は残す）。本人が寄ったら元の固さに戻す。
    // 04:30 寄った時に印を一度に外すと、味方の玉と槍が本人の前の兵を先に取った（act bot 討ち取り3の回）。兵ごとに、本人の十四歩より外の者だけ守る。
    //   本人が寄らずに刻限が来れば、段の救い（late）で隊は退く。
    // 11/18 22時 クラウド持ち主（足跡 3/9→7/9 のまま段3が五十秒止まった・本人は木村の本隊と打ち合い、残りの山口の兵は十四歩外で守られ味方も討てない）：
    //   段を締めるまで残り二人を切ったら守りを外し、味方の押しで締めさせる。
    const fin = F.step === s && F.stepN && (F.stepN - stepAlive(F)) >= Math.round(F.stepN * (1 - KEEP)) - 2;
    const far = F.step <= s && !fin;
    // 刃を減らすだけでは井伊の先手の鉄砲（十挺）の玉が通り、二十秒で六人が倒れた。味方の刃と玉は甲冑で弾く印（invuln：本人の一撃は通る）を付け外しする。
    if (far || g._shield) { for (const u of g.units) if (u.alive) u.invuln = far && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 14; g._shield = far; }
  }
  // 11/18 16:50 UTC クラウド持ち主：act bot 段1（八尾・159秒）で本人の討ち取り1（前の回も1・6・3）＝横の備と立った伏せ槍を、
  //   本人が着く前と脇にいる間に藤堂勢・井伊の騎馬が先に斬り尽くしていた。段2・段3と同じく、本人の十四歩より外の兵だけ味方の刃と玉を弾く。
  //   刻限（STEP_T[1]＝六十秒・F.pushed）を過ぎたら外し、味方の押しで段を締める（段1を延ばさない）。
  for (const g of [F.choSide, F.fuseG]) {
    if (!g) continue;
    const sh = F.step === 1 && !F.next && !F.pushed && !g.ambush && !g.routed && g.order !== 'flee';
    if (sh || g._shield) { for (const u of g.units) if (u.alive) u.invuln = sh && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 14; g._shield = sh; }
  }
  // 11/18 17:00 UTC クラウド持ち主：段4（堤の木村）で本人の討ち取り 0〜3（百秒余り討ち取り0の回あり）＝木村の旗本を井伊の先手が先に取る。
  //   木村が討たれるまで、本人の十四歩より外の旗本だけ味方の刃と玉を弾く（木村重成本人の守り storyGuard には触らない）。段の長さは木村の討死で決まるので延びない。
  if (F.kimuraG) {
    // 11/19 08時 クラウド持ち主（描かずの足跡）：段3（北の田の山口）の間に井伊の先手が堤の木村の本隊へ寄り、十八人が五〜十人に減って段4の山が痩せていた
    //   （段4で本人の討ち取り1、木村は長引きの救いで倒れる回）。木村の本隊は段4まで堤で持ちこたえる（史実も重成の討死まで崩れず）→段1〜段4の間、同じく本人の十四歩外は弾く。
    const sh = F.step >= 1 && F.step <= 4 && !F.kimuraDone && !F.kimuraG.routed;
    // 同じ足跡で、木村の本隊の兵が寄せる赤備えを追って堤から二十歩東の田（14,-77 など）へ出て、北の田の山口へ向かう本人の道で打ち合い、
    //   本人は命を六割削られ避けに入って段3・段4が延びた（638秒の回）。段3までは堤から十歩より東へ出た兵を堤へ戻す（段4は本人を迎えて打ち合う）。
    const leash = F.step >= 1 && F.step <= 3 && !F.kimuraG.routed;
    for (const u of F.kimuraG.units) {
      if (u === F.kimuraU || !u.alive) continue;
      if (leash && !u.fleeing && u.pos.x > WAKAE.x + 10 && !(u.target === P && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 6)) {
        u.target = null; u.moveTo = { x: WAKAE.x + 2, z: Math.max(-120, Math.min(-72, u.pos.z)) }; u.aiT = 1.5;
      }
      if (sh) { u.invuln = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 14; u._ykSh = true; }
      else if (u._ykSh) { u.invuln = false; u._ykSh = false; }
    }
  }
  const ok = (g) => {
    if (!on || g.routed || !g.count || g.fixed || g.noAI || g.ambush || g.order === 'flee' || g.order === 'retreat') return false;
    g.center(c);
    return Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 30;   // 11/18 08時：二十歩では寄る組が少なく、act bot 三回に二回 無傷。三十歩の組まで本人へ向ける
  };
  let cur = F._hunter;
  if (cur && (cur.focus !== P || !ok(cur))) {
    if (cur.focus === P) { cur.focus = null; for (const u of cur.units) if (u.target === P) { u.target = null; u.aiT = 0; } }
    cur = F._hunter = null;
  }
  if (cur || !on) return;
  for (const g of rt.army.groups) if (g.team === 1 && !g.focus && !g.isPlayerSquad && ok(g)) { g.focus = P; if (g.order === 'hold') g.order = 'attack'; F._hunter = g; return; }
}

// 11/18 09:50 UTC クラウド持ち主（act bot「21人を無傷で討った」が三回に一回のまま・突き35/当たり35）：
//   本人の前からの打ち込みは構えで受け流され、傷は横と後ろからの刃と矢玉でしか入らない。本人の三歩内で味方と斬り合う敵は、
//   近い二人まで本人へ振り向く（脇を突かれた者が向き直る・川田と同じ形）。あわせて、その段の隊（内藤の弓・山口の鉄砲）の飛び道具は
//   本人が四十歩内なら本人を狙う（若江で木村勢が田の畦から撃ちかけた）。敵の数・強さは変えない。本人の命が六割半を切ったら止める。
function huntTurn(rt, F, dt) {
  if ((F._turnT = (F._turnT || 0) - dt) > 0) return;
  F._turnT = 0.4;
  const P = rt.player.u;
  // 22:30 段4（堤の木村）も本人の三歩内で味方と斬り合う敵は近い二人まで振り向く（無傷の回が三回に一回のまま）
  const on = P?.alive && F.step >= 1 && F.step <= 4 && !F.next && P.hp >= P.maxHp * 0.65;
  const g = F.step === 2 ? F.naitoG : F.step === 3 ? F.yamaG : F.step === 1 ? F.choSide : null;
  if (g) {
    const want = on && !g.routed && g.order !== 'flee';
    for (const u of g.units) {
      if (!u.alive || (u.type !== 'gun' && u.type !== 'bow') || u.fleeing) continue;
      const dP = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z), near = want && dP < 40;
      // 11/18 23時 クラウド持ち主（描かずの足跡・段1の百二十秒で本人への発砲0）：射線に味方（手勢・組・騎馬）が立つと射手は射線の空いた別の敵へ筒を向け直すが、
      //   ここが〇・四秒ごとに本人へ戻すので、構えたまま一発も撃たなかった。射線が空いている時だけ本人へ向け直す（塞がれていれば目の前の敵を撃つ）。
      if (near && u.target !== P && !rt.army.allyInLine(u, P, dP)) { u.target = P; u.aiT = 0; }
    }
  }
  if (!on) return;
  // 11/18 22時 クラウド持ち主（描かずの足跡）：立った伏せ槍は本人へ駆けるが、間の藤堂・赤備えと打ち合ったまま本人の二十〜三十歩先に三十秒留まり、
  //   本人の命は減らず討ち取り1だった。本人の二十五歩内で味方と打ち合う伏せ槍は、本人を狙う者が四人になるまで本人へ向き直る。
  // 11/19 06時 クラウド持ち主（描かずの足跡）：四人が一度に掛かると本人は囲まれて退き続け、伏せ槍と三十秒余り打ち合わず討ち取り0〜1（段1）→三人まで。
  if (F.step === 1 && F.fuseG && !F.fuseG.ambush && !F.fuseG.routed && F.fuseG.order !== 'flee') {
    let n = 0;
    for (const u of F.fuseG.units) if (u.alive && u.target === P) n++;
    for (const u of F.fuseG.units) {
      if (n >= 3) break;
      if (!u.alive || u.fleeing || u.downed || u.dying || u.target === P || !u.target?.alive || u.target.team !== P.team) continue;
      if (Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 25) { u.target = P; u.aiT = 0; n++; }
    }
  }
  // 23時：本人を狙って寄る槍・刀が、間に立つ味方（手勢・組・騎馬）に阻まれ、本人の五〜十歩先で十数人が構えたまま何もしていなかった（段1の百二十秒で本人へ打ち込み一）。
  //   本人を狙う者で、目の前（二歩半内）の味方が本人への道をふさぐ者は、その味方と斬り合う（ふさぐ者が倒れるか退けば、また本人へ寄る）。
  if ((F._blkT = (F._blkT || 0) - 0.4) <= 0) {
    F._blkT = 1.2;
    for (const u of rt.army.units) {
      if (!u.alive || u.team === P.team || u.target !== P || u.fleeing || u.downed || u.atk || u.type === 'gun' || u.type === 'bow' || u.isStruct || u.group?.ambush) continue;
      const ax = P.pos.x - u.pos.x, az = P.pos.z - u.pos.z, L = Math.hypot(ax, az);
      if (L < 3.5 || L > 12) continue;
      let bl = null, bt = 3;
      for (const o of rt.army.units) {
        if (!o.alive || o.team !== P.team || o.isPlayer || o.fleeing || o.isStruct || o.civ || Math.abs(o.pos.x - u.pos.x) > 2.6 || Math.abs(o.pos.z - u.pos.z) > 2.6) continue;
        const t = ((o.pos.x - u.pos.x) * ax + (o.pos.z - u.pos.z) * az) / L;
        if (t < 0.2 || t > 2.6) continue;
        if (Math.hypot(o.pos.x - u.pos.x - ax / L * t, o.pos.z - u.pos.z - az / L * t) < 1 && t < bt) { bt = t; bl = o; }
      }
      if (bl) { u.target = bl; u.aiT = 0; }
    }
  }
  // 23時：三歩では本人の突きで先に崩れて振り向けない回が三回に二回（受けた傷0）→四歩内の者まで
  let a = null, ad = 16, b = null, bd = 16;
  for (const u of rt.army.units) {
    if (!u.alive || u.team === P.team || u.isStruct || u.fleeing || u.downed || u.dying || u.atk || u.type === 'gun' || u.type === 'bow' || u.mounted || u.invuln) continue;
    if (u.target === P || !u.target || !u.target.alive || u.target.team !== P.team || u.group?.routed || u.group?.ambush) continue;
    const d = (u.pos.x - P.pos.x) ** 2 + (u.pos.z - P.pos.z) ** 2;
    if (d >= 16) continue;
    if (d < ad) { b = a; bd = ad; a = u; ad = d; } else if (d < bd) { b = u; bd = d; }
  }
  for (const u of [a, b]) if (u) { u.target = P; u.aiT = 0; }
}

// 戦の進行の札（段）：F.step の 1〜5
setStages('k14_yao_wakae', [[STEP_TEXT[1]], [STEP_TEXT[2], 2], [STEP_TEXT[3], 3], [STEP_TEXT[4], 4]]);

export { k14_yao_wakae };
export default k14_yao_wakae;
