// ======================================================================
// 徳川編 4　杭瀬川の戦い（慶長五年九月十四日・1600）　関ヶ原の前日の前哨戦。徳川方（東軍）が負ける。調べは docs/battle_refs/k04_kuisegawa.md
// 大垣城を出た島左近・蒲生備中の五百が杭瀬川を西へ渡り、赤坂の側の田（中村の陣の目の前）で刈田をして挑発し、追われると川を越えて退くふりをする。
// 中村一栄の先手が川を東へ渡って追うと、葦の原に伏せた明石全登（宇喜多）の八百と、引き返した左近の本隊が三方から打ち掛かる。
// 中村の先手は崩れ、家老の野一色頼母は深田で討たれる。有馬豊氏の隊が赤坂の側の岸で受け、東軍は退く。
// 主人公は中村一栄の先手の侍大将。史実どおり追撃は失敗する。勝ちの形は「頼母の横で伏兵を食い止め、川を西へ渡り、有馬の陣まで逃げ込む」。
// 段：①赤坂の側の田で刈田の島の兵に槍を入れる（退くふり） ②退く島の兵を追って浅瀬を東へ渡る ③葦の伏兵を頼母の旗の横で食い止める ④川を西へ渡って退く ⑤有馬豊氏の陣へ
// 軍勢（AP の 9・10・13、AQ の 3・6、AT の 4）：両軍とも史実の兵数（西軍 千三百・東軍 六千）を、一人を十二人（携帯は二十人）に見立てた陣形の塊（備）で置く。
//   塊は本人の近くで本物の兵に替わり（KIT の wake）、塊どうしは数で押し合う（b_yasen.js の fieldTick）。見せかけの大軍・軽い乱戦・遠くの板の軍勢は置かない。
// 総大将：家康は北西の奥の岡山（赤坂）の本陣で旗本に囲まれて動かない。三成は大垣城（地図の外）で場に出ない。左近は史実で前に出た将なので前にいるが討てない。
// 旗：家康の旗本だけが徳川の葵。中村の隊は紋が確かめられないので丸、有馬豊氏の隊は有馬家の左三つ巴（外様の隊に葵は立てない・11/6）。西軍は石田（島左近・蒲生）と宇喜多（明石全登）だけ。
// 向き（11/4 夜に布陣図どおりへ直した）：赤坂の岡山（東軍）が北西、大垣城（西軍）が南東。杭瀬川はその間を流れ、東軍は川を東へ渡って追い、西へ渡って退く。
//   並びの座標（+x が赤坂の側）で書き、T() で地図の向きへ回す。川はどこでも膝から腰の深さで渡れる（遅くなる）。
// 地形：国土地理院の標高（dem_kuisegawa.js・tools/dem.mjs の kuisegawa）。岡山〜南一色の実の 2.5km を 270 に縮め、標高も同じ縮めで引く。岡山の頂に家康の本陣、北西の隅に金生山。
// ======================================================================
import * as THREE from 'three';
import { plumeTuftGeo, plumeTuftMat } from './world_grass.js';
import DEM from './dem_kuisegawa.js';
import { demSample } from './dem.js';
import { mudTex } from './nature.js';
import { nobori, hasa } from './props.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { MEM_TIGHT } from './settings.js';
import { withGuard } from './toyo_bot.js';
import { fieldButai, fieldTick, routButai, lightPos } from './b_yasen.js';
import { butaiTick } from './butai.js';
import { addSite } from './map_sites.js';
import { farSight } from './far_sight.js';
import { STAGES, KILLS } from './stages.js';
import { timeslipField } from './timeslip_field.js';
import { install as installHaisen } from './k04_kuisegawa/haisen.js';   // 両軍の備の層・左近が追うのを止める・東軍敗北の札とその夜（toku15 の 4）

// 布陣は「並びの座標」（+x が赤坂の東軍の側・−x が大垣の西軍の側）で書き、T() で地図の向きへ回す（11/4 夜・布陣図どおり）。
// 実地では赤坂の岡山が北西、古戦場の推定地の南一色が南東、大垣城はさらに南東（地図の外）。並びの +x を岡山の向きに合わせる。
const ROT_C = -0.81395, ROT_S = -0.58093, O_L = { x: 70, z: -20 };
const T = (x, z) => { const a = x - O_L.x, b = z - O_L.z; return { x: ROT_C * a - ROT_S * b, z: ROT_S * a + ROT_C * b }; };
const L = (p) => ({ x: ROT_C * p.x + ROT_S * p.z + O_L.x, z: -ROT_S * p.x + ROT_C * p.z + O_L.z });
const Y = (a) => { const v = T(O_L.x + Math.sin(a), O_L.z + Math.cos(a)); return Math.atan2(v.x, v.z); };
const SPAWN = T(96, 8);
const FORD = T(44, 4);                          // 渡る所（川の中ほど）
const BAIT = T(62, 4);                          // 島左近の兵が刈田をしている田（川を西へ渡った赤坂の側・中村の陣の目の前。11/6 史実どおりに）
const REED = T(-52, 0);                         // 葦の原（伏兵）
const RING = T(-18, 2);                         // 包みが閉じる所（葦の原の手前の深田）
const SHIMA_HIDE = T(-60, -52);                 // 左近の本隊が控える所（林の陰）
const AKASHI_HIDE = T(-46, 44);                 // 明石全登の伏兵（葦の中。11/8 葦の原の真ん中へ寄せ、遠くから歩いて来ないように）
// 葦の原（並びの座標の四角）：大垣の側の岸から深田の北へ、人の背より高い葦が茂る。伏兵はこの中に伏せる（11/8 critic60 二1・二4）
const REED_BED = { x0: -74, x1: -18, z0: 22, z1: 72 };
const ARIMA = T(78, -26);                       // 有馬豊氏の陣（赤坂の側の岸）
// 11/18 クラウド持ち主（描かずの数え）：追手が東の岸の九m手前（局所 x28）で止まり、本人が川へ着く前から十五m内の敵が0＝④は追手の無い散歩（journey 3「追手は川の中まで追って来る」）。
//   追手の止まる線を川の東の半ば（水は x37〜49）へ。渡り切りはしない（史実：有馬の隊が岸で受け、西軍は渡らず引いた）
const CHASE_X = 41;
const RETURN_BANK = T(68, 4);                   // 手勢の渡河先。主人公が殿に戻っても川へ引き返さない。
const IEYASU = T(205, -150);                    // 赤坂の岡山の家康の本陣（国土地理院の標高で岡山の頂に当たる）
const RIVER = [[46, -260], [41, -90], [44, 60], [48, 260]].map(([x, z]) => { const p = T(x, z); return [p.x, p.z]; });
const SC = MEM_TIGHT ? 20 : 12;                 // 塊の一人が史実の何人か
// 史実の兵数（調べ：西軍 千三百＝島・蒲生 五百＋明石 八百、東軍 六千＝中村 四千＋有馬 二千）
const HIST = { saki: 1500, naka: 2500, arima: 2000, bait: 200, shima: 300, akashi: 800, hata: 600 };   // hata は岡山の家康の旗本（戦わない。数に入れない）
const A0 = HIST.saki + HIST.naka + HIST.arima, B0 = HIST.bait + HIST.shima + HIST.akashi;
// 11/17 クラウド K358（初めての目の写真 874×402）：右上の任務が「…明石全…」で切れた。携帯の二行に収まる長さに詰める
const STEP_TEXT = ['刈田の島左近の兵に槍を入れ、追い立てる', '退く島左近の兵を追い、杭瀬川を東へ渡る',
  '頼母の旗の横で、葦の伏兵を食い止める', '手勢を連れて杭瀬川を西へ渡り、赤坂へ退く', '赤坂の岸の有馬豊氏の陣まで逃げ込む'];
// 11/8 critic60（九3・五3）：両軍みな同じ黒い具足で、乱戦で敵味方が見分けられなかった。西軍（石田・宇喜多）は朱を帯びた茶の漆に（遊びの見分け。東軍は黒のまま）
const ARM = { tokugawa: 0x24221f, maru: 0x24221f, kuki: 0x22201e, ishida: 0x6b2e22, ukita: 0x5e3222 };
const WEST = new Set(['ishida', 'ukita']);
const NAKA = 'toyotomi', ARIMA_MON = 'kuki';   // 中村：家の紋の確かな史料が見つからず、豊臣恩顧の大名として主家の桐を手本に推した（K365 11/18 クラウド k365-cloud-38。前は丸）・有馬（左三つ巴）

// 標高は布陣の縮め（実の 2.5km を 270）に合わせて 1 を実の 9.4m で引き、高さは 0.22 倍（岡山はおよそ 9、北西の隅に金生山）
const XY = 9.39, DEM0 = demSample(DEM, RING.x * XY, RING.z * XY);
function height(x, z) {
  let h = (demSample(DEM, x * XY, z * XY) - DEM0) * 0.22;
  const l = L({ x, z });
  h += 0.2 * Math.sin(l.x * 0.05) * Math.cos(l.z * 0.04);
  h += 1.2 * gauss(l.x, l.z, 74, 0, 90);             // 赤坂の側の岸の堤
  return h;
}

const live = (g) => g && g.count > 0;
// 一時的に倒れた兵は待つが、戦線離脱した兵を撤退待ちに数えない。
const canReturn = (u) => u.alive && !u.gone && !u.dying && !u.woundOut && !u.evacuatedWound;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fl = (list, flag) => list.map((s) => ({ ...s, o: { flag, ...(WEST.has(flag) && s.type !== 'busho' ? { armor: ARM[flag] } : {}), ...(s.o || {}) } }));

const k04_kuisegawa = {
  // 段番号だけでなく、退くふり・頼母の討死・先手の撤退も順に作り直す。
  resumeSteps: [
    [1, function (rt) { rt.flags.holdPlayer = false; this.toStep(rt, 1); }],
    [2, function (rt) { this.feign(rt); }],
    [3, function (rt) { this.toStep(rt, 3); }],
    [4, function (rt) { this.closeRing(rt); this.toStep(rt, 4); }],
    [5, function (rt) { this.toStep(rt, 5); }],
  ],
  resumeAt(rt, step) {
    // この戦の印は goalTargetOverride。共通の再開位置の取得には任せず、前の務めの場所へ戻す。
    return step <= 1 ? SPAWN : step === 2 ? BAIT : step === 3 ? RING : step === 4 ? this.defensePoint(rt) : RETURN_BANK;
  },
  playerGearStep: 3,       // 中村の先手を率いる侍大将の装い。保存した位は変えない
  victoryTitle: '東軍、退却',
  victoryCaption: '西軍の勝利　有馬の陣へ生還',
  missionSingleLine: true,
  goalsAllRows: true,        // 一行表示でも五つの目標を最初から並べる。
  goalsVisibleRows: 5,
  stageGoalsOnly: true,      // 右上は①〜⑤の段だけ（「敵を何人討つ」で埋めない・一段目を落とさない。三1・九1）
  goalSignGroundPin: true,   // 頼母の横に着いても、防戦する場所の印を消さない（通し確認・関所3）。
  goalSignTriangle: true,
  noFrontFill: true,         // 作り物の乱戦を足さない（AP の 9）
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,
  enemyTactics: false,       // 敵の動きはこの定義が決める（退くふり・伏兵）
  hideGuideSteps: true,
  noPlayerFoot: true,
  nearbyAllySignLimit: 0,
  nameTagsAtHead: true,      // 将の頭上に固定し、名札を空や隣の兵の上へずらさない
  foeMarks: true,
  enemyTriangleSigns: true,
  lightEnemyTriangleSigns: true,   // 軽い兵も近くでは一人ずつ所属を示す
  enemySignMaxPixels: 20,   // 通し確認：目前の敵や命中時の赤い印も、周囲を覆わない大きさに収める。
  foeSignMaxPixels: 20,     // 実兵の頭上印にも上限を付ける。軽い兵の設定だけでは目前で大きくなる。
  camLift: 0.6,             // 密集した先手の肩越しに、田と退く岸を見通せる高さを残す。
  nobiki: true,              // 負け戦の退き口
  noReachedRing: true,       // 11/18 クラウド持ち主（190秒の写真 k04_kuisegawa_190s_1118mitsu）：③の頼母の旗に着いて立つと、本人の足元の輪と行き先の輪が倒れた兵の上で二重に重なった（hud_ground.js・今福と同じ手）
  wakeRoom: 200,
  fadeCloseStandards: true,   // 11/18 23:40 UTC クラウド持ち主（190秒の写真）：カメラの十二m内の味方の隊旗が、横から見た白い竿になって画面の真ん中を縦に切った→近い味方の隊旗は布と竿を隠す（田野・刀根坂と同じ手）
  flankWaiters: true,   // 11/18 21:55 UTC クラウド持ち主：順を待つ敵の三人に一人は本人の脇へ回る（act bot は正面の太刀を全部受けて傷0。journey「伏兵に横を突かれた恐怖」）
  playerAtkMax: 4,   // 11/18 クラウド持ち主（描かずの数え：伏兵の段で本人を狙う敵が十九人いても百十秒 命75のまま）：三人から共通の既定の四人へ
  playerTaken: 0.7,   // 11/14 クラウド：1 では侍の一太刀の床が六割で、新手・蒲生の組の侍に三太刀で倒された（act 二回・343・569 秒）。床を四割余りに
  // 退きの段（④⑤）では待つ備を畳み、新手の一太刀は0.4（11/14 クラウドゆ act bot：④の岸で新手の侍に一太刀六割ずつ斬られ537秒で倒れ、受けた傷180のうち120が新手）
  reserveFold: (rt) => rt.flags.step >= 4, reserveDmgMult: 0.4,
  reserveNoWave: true,   // 伏兵と別の新手まで自動で押し寄せ、旗の横と退き口を囲み続けない。待つ備は近づいた時だけ応戦する。
  frontFillWhen: (rt) => rt.flags.step === 3 && !rt.flags.ringClosed,
  playerRegen: 0,          // 伏兵から退く戦では、追手との間が空いても命を自動回復させない
  closeCombatAssist: true,
  autoTargetCamera: true,
  steadyMeleeCamera: true,
  noWinCrane: true,
  compactIntro: true,
  keepMix: false,
  missions: STEP_TEXT,
  // 共通の任務表示は文章でなく、零から始まる段番号を受け取る。
  missionOf(rt) { return Math.max(0, Math.min(STEP_TEXT.length - 1, (rt.flags.step || 1) - 1)); },
  introText: () => '関ヶ原の前の日。陣の目の前で刈田をする島左近の兵を追い、杭瀬川を越える。葦の原の伏兵から生きて岸へ戻れ。',
  minutes: 9,
  // 布陣図（docs/fujin/k04_kuisegawa.md）：西軍は大垣の側（西）、東軍は赤坂・岡山の側（東）。陣立ての表（docs/army_depth_howto.md）
  //   前の本物の隊は bind。明石全登の伏兵は「見せない」約束なので表に入れない。奥の備は軽い作り。各家の兵の分け方は推定。
  depth: (rt) => ({
    byMen: true,   // 布陣図どおりの兵数の比で軽い兵を配る（docs/fujin/k04_kuisegawa.md）
    bindTail: true,   // 本物の隊に結んだ備の後ろに、兵数の比の軽い列（army_depth_view.js の buildTail。クラウド厚み係 11/10）
    A: { name: '東軍', facing: Y(-Math.PI / 2), honjin: IEYASU, mpu: 6, formation: '鶴翼', terrain: 'river', flag: 'tokugawa', armor: 0x24221f, openAt: 9999, attrition: 0,
      sonae: [
        { id: 'kazu', layer: 'sakite', wing: 'center', men: 1500, taisho: '中村一栄', flag: 'toyotomi', bind: (r) => r.flags.kazu },
        { id: 'noi', layer: 'sakite', wing: 'left', men: 500, taisho: '野一色頼母', flag: 'toyotomi', bind: (r) => r.flags.noi },
        { id: 'arima', layer: 'ichi', wing: 'right', men: 2000, taisho: '有馬豊氏', flag: ARIMA_MON, bind: (r) => r.flags.arimaG },
        { id: 'nakamura2', layer: 'ni', wing: 'center', men: 2000, taisho: '', flag: 'maru', at: T(132, 10), hold: true },
        { id: 'fukushima', layer: 'yobi', wing: 'left', men: 6000, taisho: '福島正則', flag: 'mizuno', at: T(170, -50), hold: true },
        { id: 'ikeda', layer: 'yobi', wing: 'right', men: 4500, taisho: '池田輝政', flag: 'ageha', at: T(165, 100), hold: true },
        { id: 'ieyasu', layer: 'hatamoto', wing: 'center', men: 600, taisho: '徳川家康', flag: 'tokugawa', bind: (r) => r.flags.ieyasu, hold: true },
      ] },
    B: { name: '西軍', facing: Y(Math.PI / 2), honjin: T(-228, -40), mpu: 6, formation: '鶴翼', terrain: 'river', flag: 'ishida', armor: 0x6b2e22, openAt: 9999, attrition: 0,
      sonae: [
        { id: 'gamo', layer: 'sakite', wing: 'center', men: 200, taisho: '蒲生郷舎', flag: 'ishida', bind: (r) => r.flags.gamo },
        { id: 'shima', layer: 'ichi', wing: 'left', men: 300, taisho: '島左近', flag: 'ishida', bind: (r) => r.flags.shimaG },
        // 三成・秀家と西軍の主力は戦場外の大垣城。川岸の予備や本陣として足さない。
        // 明石の八百は葦に伏せ、三段目の ambush で初めて出す。
      ] },
    honjinView: { A: false, B: false },
  }),
  lethal: { max: 2, firstAt: 200, gap: 120 },   // 11/9 二巡（徳川D）：弱めて入れる。もとは入れない（11/8 bot：入れると伏兵の段が十分あまり続き任務失敗）
  fearKind: { kind: '伏兵', note: '追っていた敵が葦の中から返し、横と後ろを突かれる', w: { flank: 1.8, iso: 1.5, routed: 1.3 }, line: '囲まれるぞ、川まで退け！' },
  // 身の回りの合戦の跡（timeslip_field.js）。九月半ば（今の十月半ば）の刈田と川岸の葦
  timeslip: {
    wet: 0.35, dust: 0.3, trample: 0.3, debris: 0.8, arrows: 0.6, reeds: 0.45,
    grass: 0xa49c66, grassTints: [0xffffff, 0xeadcb0, 0xc8c898], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  // 主人公の隊旗も中村の丸印。陣営の所属と家の旗を分け、葵を外様の隊へ戻さない。
  sides: { a: { name: '東軍（中村・有馬）', mon: NAKA, faction: 'tokugawa' }, b: { name: '西軍（島・明石）', mon: 'ishida' } },
  // 両軍の残り（史実の数）：塊の名目から。まだ葦に伏せている西軍も数に入れる
  force(rt) {
    const F = rt.flags;
    if (!F.blk) return null;
    const n = (b, h) => (b ? Math.round(h * b.aliveNominal() / b.nominal) : h);
    const B = F.blk;
    // 本物の兵の討死も数へ（塊が退いた後、斬り合いが続いても数が止まって見えた。11/8 critic60 十二1）
    return { a: Math.max(0, n(B.saki, HIST.saki) + n(B.naka, HIST.naka) + n(B.arima, HIST.arima) - (F.deadA || 0)),
      b: Math.max(0, n(B.bait, HIST.bait) + n(B.shima, HIST.shima) + n(B.akashi, HIST.akashi) - (F.deadB || 0)), a0: A0, b0: B0 };
  },
  date: () => '慶長五年（1600）九月十四日　午後・晴　美濃国 杭瀬川',
  talk: {
    before: [['物見', '大垣の兵が川を渡り、陣の前の田で稲を刈っておりまする。数は二百ほど'], ['中村一栄', '赤坂の目の前で刈田とは、なめおって'],
      ['有馬豊氏', 'あれは島左近の手。わざと少なく見せておるやもしれぬ'], ['野一色頼母', '殿、それがしが先に立ちまする。追い払うのは今'], ['中村一栄', '槍を揃えよ。刈田の者どもを川へ追い落とせ']],
    after: [['中村一栄', '頼母を……あの深田に置いてきてしもうた'], ['有馬豊氏', '島左近の釣りであった。この借りは必ず返す']],
  },
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Y(-Math.PI / 2) },
  noWake: true,
  // 11/19 K338（天王寺・岡山の物差し）：右上の地図を戻す。西の大垣城の西軍の備と、東の赤坂・岡山の東軍の本陣まで入る半径
  mapBack: true, mapRange: 170,
  world: {
    keepSelfFlag: true,   // 11/19 クラウド持ち主（255秒の写真）：斬り合いの塊で本人がどれか分からない→背の金の小旗を近いカメラでも消さない（桶狭間・稲生と同じ見分け）
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物
    seed: 1600914,
    time: 'day',
    groundHalf: 260,
    battleViewDistance: 280,
    landmarkViewFar: 320,    // 岡山は刈田から約二百m、深田から約二百七十m。カメラの奥で本陣を切らない。
    clearAir: true,          // 兵の描画距離の上限は保ち、岡山の本陣と葵の旗を晴れた遠景に残す
    mountainScale: 0.1, mountainHaze: 0.9,
    moveLim: 248,
    noFoeNear: true,         // 敵の後詰めを本人の近くへ寄せない（見せかけの軍勢で囲まない）
    autumn: true,
    patchyGround: true,
    noGroundRipples: true,
    terrainTriangles: true,  // 畦・泥・足を、実際に描く地面の三角面へそろえる。
    mudStains: true,         // 深田の泥では血を小さく暗く薄く（赤い敷物に見せない）
    groundStains: true,      // 血の跡も斜面へ沿わせ、田の上に赤い板を浮かせない。
    height,
    waterSlow: true,
    strictFireOrders: true,  // 左近の追撃停止後は、近くに主人公がいても鉄砲を再開しない。
    hatDropRate: 0,          // 笠を落とさない：紋の付いた笠が足元に転がって首に見えた（11/8 critic60 四4）
    // 葦の原の手前の深田（頼母が足を取られた所）。畦で区切り、入ると遅くなる（terrain_tags の mud）
    paddy(x, z) {
      const l = L({ x, z });
      const start = l.x >= 52 && l.x <= 80 ? 52 : l.x >= -46 && l.x <= -4 ? -46 : null;
      if (start === null || Math.abs(l.z) > 34) return 0;
      return Math.abs(((l.x - start) % 14) - 7) > 6.2 || Math.abs(((l.z + 34) % 17) - 8.5) > 7.7 ? 0 : 1;
    },
    muddy: 0.25,
    // 水面を二列の帯のまま岸へ重ねず、川床の深さで水際を切り、浅い所を泥へなじませる。
    streams: [{ pts: RIVER, w: 12, depth: 1.2, softBanks: true }],
    paths: [{ pts: [[185, -120], [150, -40], [106, 8], [52, 4]].map(([x, z]) => { const p = T(x, z); return [p.x, p.z]; }), w: 3 }],
    tint(x, z, h, c) {
      // 九月の刈田と葦。大垣の側ほど湿って暗い
      c.setRGB(c.r * 0.55 + 0.24, c.g * 0.5 + 0.2, c.b * 0.4 + 0.08);
      const l = L({ x, z });
      if (this.paddy(x, z) > 0) c.setRGB(0.34, 0.26, 0.15);
      // 11/18 クラウド持ち主（150秒 874×402）：田と田の間の地面だけ乾いた明るい色のまま残り、畦の両脇が白い帯に浮いた。田の中は畦の下も湿った土の色に
      else if (((l.x >= 51 && l.x <= 81) || (l.x >= -47 && l.x <= -3)) && Math.abs(l.z) <= 35) c.setRGB(0.29, 0.23, 0.14);
      else if (l.x >= 3 && l.x <= 33 && Math.abs(l.z) <= 35) c.setRGB(0.37, 0.31, 0.18);   // 刈り終えた乾いた田（藁色の土）
      if (l.x < -30 && Math.abs(l.z) < 70) c.setRGB(c.r * 0.8, c.g * 0.95, c.b * 0.7);
    },
    clear: (x, z) => { const l = L({ x, z }); return (l.x > -40 && l.x < 150 && Math.abs(l.z) < 60) || dist({ x, z }, IEYASU) < 18 || dist({ x, z }, ARIMA) < 14; },
    // 11/19 クラウド19（川の間近の見回り：昼の岸と向こうの田に、黒い角ばった岩が点々と浮いて見えた）：大垣の泥の田の小川。野の礫は小さく丸め泥へ埋める（森部・今福と同じ）
    alluvialRocks: true,
    trees: 140,
    tufts: 2800,
    treeDensity: (x, z) => (Math.abs(L({ x, z }).z) > 80 ? 1 : 0.12),
    // 林（左近の本隊の陰）と葦の茂み（明石の伏兵）
    groves: [{ ...T(-66, -62), r: 22, n: 36 }, { ...T(-88, 66), r: 16, n: 20 }, { ...T(-70, -6), r: 14, n: 14 }],   // 北の林は葦の原の奥へ
    fleeOut: (x, z, team) => { const l = L({ x, z }), edge = Math.abs(x) > 236 || Math.abs(z) > 236; return edge || (team === 1 ? l.x < -160 : l.x > 220); },
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world;
    // 11/18 クラウド持ち主（初めての目）：共通の川石（灰の丸石）が流れの中に饅頭のように並んで見えた。杭瀬川は大垣の平らな田の中の泥の小川で、大石は無い（今福と同じ手）
    for (const st of W.def.streams || []) if (st.rockMesh) st.rockMesh.visible = false;
    F.step = 0; F.holdPlayer = true; F.foes = []; F.ending = false; F.blk = {}; F.blocks = []; F.follow = [];
    this.fields(rt);
    this.reeds(rt);
    this.camps(rt);
    installHaisen(rt, F.k04s = {}, { T, L });
    const B = F.blk;
    // 東軍の塊：中村一栄の先手が川を渡り、中村の本手と有馬の隊は赤坂の側の岸に残る
    B.saki = this.block(rt, { key: 'saki', name: '中村一栄の先手', team: 0, flag: NAKA, at: T(80, -2), facing: Y(-Math.PI / 2), w: 30, d: 10 });
    B.naka = this.block(rt, { key: 'naka', name: '中村の本手', team: 0, flag: NAKA, at: T(126, 34), facing: Y(-Math.PI / 2), w: 32, d: 12 });
    // 11/18 クラウドさ：有馬の陣の幕（T(88,-30)・16×12）の内に塊と旗本が立ち、田へ出る下知で東の幕に押し付けられ一点に重なって止まった（act bot 45秒 (-13,-3)）。幕の東の外に置く（旗本は後ろの列が十m奥まで並ぶので、さらに川の側へ）
    B.arima = this.block(rt, { key: 'arima', name: '有馬豊氏の隊', team: 0, flag: ARIMA_MON, at: T(76, -24), facing: Y(-Math.PI / 2), w: 30, d: 10 });
    // 西軍の囮：刈田の島左近の兵（二百）
    B.bait = this.block(rt, { key: 'bait', name: '刈田の島左近の兵', team: 1, flag: 'ishida', at: BAIT, facing: Y(Math.PI / 2), w: 22, d: 6 });
    // 刈った稲を掛ける稲架（はさ）。九月十四日（今の十月二十日）は刈り入れの最中。俵はまだ田に出ない
    for (const [x, z] of [[56, -14], [70, -15], [56, 24], [70, 24]]) { const p = T(x, z); rt.scene.add(hasa(W, p.x, p.z, Y(0), 7)); }
    // 名のある将の本物の組（塊と一緒に動く）
    const ally = (o, list, mon = NAKA) => { const g = allyGroup(rt, { fullStrength: true, facing: Y(-Math.PI / 2), width: 5, aggro: 9, speed: 3.4, order: 'hold', noRout: true, ...o }, fl(list, mon)); g.mon = mon; return g; };
    F.kazu = ally({ name: '中村一栄の旗本', anchor: T(84, 2) }, [{ type: 'busho', n: 1, o: { name: '中村一栄', invuln: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }]);
    F.noi = ally({ name: '野一色頼母の組', anchor: T(76, -8) }, [{ type: 'busho', n: 1, o: { name: '野一色頼母', invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }]);
    F.noiU = F.noi.units.find((u) => u.type === 'busho');
    // 岸の守りは広い横隊。行軍の狭い並びや将の後退に護衛を集め続けない。
    // 11/18 K168 クラウド kaito2：T(70,-22) では横隊の西の端が家康の本陣の陣幕の囲み（x -28.5〜-12.5）に掛かり、囲みの内に置かれた旗持ち・騎馬が外の行き先へ出られず二十秒以上幕に向かって歩いた。東へ3m 寄せる
    F.arimaG = ally({ name: '有馬豊氏の旗本', anchor: T(67.5, -20.3), width: 8, spacing: 2.2, guardOn: true, aggro: 6, seekRange: 10 }, [{ type: 'busho', n: 1, o: { name: '有馬豊氏', invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'gun', n: 6 }], ARIMA_MON);
    F.mine = ally({ name: '手勢', anchor: T(99, 13), width: 4, speed: 3.8, dmgMult: 0.9 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 13 }]);
    // 帰還の務めは手勢だけでなく、一緒に渡った中村・頼母の先手も含む。
    // 岸で受ける有馬隊や岡山の旗本は、連れ帰った兵には数えない。
    F.returnGroups = [F.mine, F.kazu, F.noi];
    F.follow = [[F.kazu, B.saki, 4, 4], [F.noi, B.saki, -4, -4]];
    // 刈田の島の兵を率いる蒲生備中（本物）
    F.gamo = enemyGroup(rt, { faction: 'ishida', name: '蒲生備中の組', anchor: T(62, 4), facing: Y(Math.PI / 2), width: 5, formation: 'line', noRout: true,
      morale: 90, dmgMult: 0.8, order: 'hold', aggro: 8, seekRange: 12, speed: 3.2 },
    // 刈田は足軽が稲を刈る（侍が刀を持って突っ立つ形にしない。11/8 critic60 二1・二4）：侍は二人だけ、足軽十二人が田に屈む
    fl([{ type: 'busho', n: 1, o: { name: '蒲生備中', invuln: true, mustLive: true, horse: true } }, { type: 'samurai', n: 2, o: { keep: true } }, { type: 'ashigaru', n: 12, o: { keep: true } }], 'ishida'));
    F.foes.push(F.gamo);
    // 最初の小競り合いに使う備は変わらない。毎コマ配列を作り直さない。
    F.baitBlocks = [B.saki, B.bait];
    // 足軽は屈んで稲を刈っている（突っ立たない。槍を入れられると立ち上がる）
    for (const u of F.gamo.units) if (u.type === 'ashigaru') u._crouch = true;
    F.follow.push([F.gamo, B.bait, 0, 0]);
    rt.obj('main', STEP_TEXT[0], 'main', true);
    rt.marker('go', BAIT, '刈田の島左近の兵');
    rt.banner('杭瀬川', '慶長五年九月十四日　赤坂');
    this.talk.before.forEach(([who, s], i) => rt.after(0.5 + i * 2.8, () => rt.say(who, s, 2.6)));
    rt.after(0.5 + this.talk.before.length * 2.8, () => { F.holdPlayer = false; this.toStep(rt, 1); });
  },

  // 田の畦は地形の格子より細かいため、共有する形を並べて輪郭を保つ。
  fields(rt) {
    const W = rt.world, rows = [], banks = [], mud = [];
    // 11/18 クラウド持ち主（270秒の写真）：川の東の岸から深田までの四十mが乾いた草原のままで、大垣と赤坂の間の田の野に見えなかった。
    //   刈り終えた乾いた田（刈り株と畦だけ・泥にしない＝足は遅くしない）を二列置く
    for (const [left, cols, crop] of [[52, 2, true], [-46, 3, false], [4, 2, 'dry']]) {
      for (let ix = 0; ix < cols; ix++) for (let iz = 0; iz < 4; iz++) {
        const x = left + ix * 14, z = -34 + iz * 17, dry = crop === 'dry', st = dry ? 1.5 : 0.9;
        if (!crop) mud.push(T(x + 7, z + 8.5));
        for (let dx = 1.4; crop && dx < 13; dx += st) for (let dz = 1.4; dz < 16; dz += st) {
          // 刈り跡と刈り残しを分け、田を黄金の穂で埋める。
          rows.push({ p: T(x + dx, z + dz), cut: dry || (ix === 0 && iz === 2) });
        }
      }
      const dry = crop === 'dry';
      for (let ix = 0; ix <= cols; ix++) for (let z = -34; z < 34; z += 2) banks.push({ p: T(left + ix * 14, z + 1), a: Y(0), dry });
      for (let iz = 0; iz <= 4; iz++) for (let x = left; x < left + cols * 14; x += 2) banks.push({ p: T(x + 1, -34 + iz * 17), a: Y(Math.PI / 2), dry });
    }
    const dummy = new THREE.Object3D();
    // 11/18 クラウド持ち主（40秒 874×402）：田の稲の株が裏の面で空の青を受け、青緑の針の列に見えた。
    //   共通の稲の材質（裏の面の向きを直し・風でそよぎ・目の前四〜八歩の株は縮めて視界を塞がない）に替える
    const rice = new THREE.InstancedMesh(plumeTuftGeo('paddy', true), plumeTuftMat(), rows.length);
    rows.forEach(({ p, cut }, i) => {
      dummy.position.set(p.x, W.heightAt(p.x, p.z), p.z); dummy.rotation.set(0, Y(0), 0);
      dummy.scale.set(1, cut ? 0.15 : 0.95, 1); dummy.updateMatrix(); rice.setMatrixAt(i, dummy.matrix);
    });
    rt.scene.add(rice);
    // 直方体の縁をやめ、土を盛った丸い畦を同じ形の使い回しで置く。
    // 11/18 クラウド持ち主（40秒 874×402）：手前の畦が黒い丸太の管に見えた。幅を広げて低く（幅1.1m・高さ17cm の盛り土）
    const bermGeo = new THREE.CylinderGeometry(0.55, 0.55, 2.1, 10);
    bermGeo.rotateX(Math.PI / 2); bermGeo.scale(1, 0.3, 1);
    // 11/17 クラウド K358（初めての目の写真 874×402）：明るい黄土の畦が日に照って角材のように浮いた。湿った土の色に落とし、少し低く
    // 11/18 クラウド持ち主（245秒の写真）：乾いた刈田の畦（色に1.32を掛けた藁色）が画面を横切る明るい黄緑の平たい棒に見え、前の斬り合いを切った。
    //   乾いた畦は別の束にして泥の絵（田の泥と同じ写真）を貼り、緑を寄せない乾いた土の色に落とす。一色の板をやめる
    const wetBanks = banks.filter(b => !b.dry), dryBanks = banks.filter(b => b.dry);
    const berm = new THREE.InstancedMesh(bermGeo, new THREE.MeshLambertMaterial({ map: mudTex(), color: new THREE.Color(1.3, 1.14, 0.92) }), wetBanks.length), bermTint = new THREE.Color();
    const dryBerm = new THREE.InstancedMesh(bermGeo, new THREE.MeshLambertMaterial({ map: mudTex(), color: new THREE.Color(1.55, 1.36, 1.08) }), dryBanks.length);
    dryBanks.forEach(({ p, a }, i) => {
      const sx = Math.sin(a), sz = Math.cos(a);
      const slope = (W.heightAt(p.x + sx, p.z + sz) - W.heightAt(p.x - sx, p.z - sz)) / 2;
      dummy.position.set(p.x, W.heightAt(p.x, p.z), p.z); dummy.rotation.set(0, a, 0); dummy.rotateX(-Math.atan(slope)); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); dryBerm.setMatrixAt(i, dummy.matrix);
      const g = ((i * 2654435761) >>> 0) / 4294967296;
      dryBerm.setColorAt(i, bermTint.setRGB(1.1 + g * 0.14, 1.0 + g * 0.1, 0.86 + g * 0.08));
    });
    rt.scene.add(dryBerm);
    wetBanks.forEach(({ p, a }, i) => {
      const sx = Math.sin(a), sz = Math.cos(a);
      const slope = (W.heightAt(p.x + sx, p.z + sz) - W.heightAt(p.x - sx, p.z - sz)) / 2;
      dummy.position.set(p.x, W.heightAt(p.x, p.z), p.z); dummy.rotation.set(0, a, 0); dummy.rotateX(-Math.atan(slope)); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); berm.setMatrixAt(i, dummy.matrix);
      // 11/18 クラウド持ち主（150秒 874×402・初めての目）：畦が一色の平たい板の筋に見えた。区切りごとに草の緑と土の茶を混ぜる
      const g = ((i * 2654435761) >>> 0) / 4294967296;
      // 11/18 22:10 UTC クラウド持ち主（130秒 874×402・初めての目）：深田の畦（一色 0x5a4e32 に緑を寄せた色）が、画面の右を斜めに横切る
      //   明るい黄緑の平たい帯に見えた→乾いた畦と同じ泥の絵を貼り、深田の泥より少し暗い湿った土の色に。区切りごとの濃淡は残し、緑は寄せない
      berm.setColorAt(i, bermTint.setRGB(0.88 + g * 0.18, 0.88 + g * 0.16, 0.84 + g * 0.12));
    });
    rt.scene.add(berm);
    // 同じ写真：畦の背に九月の草の株（短い芒の形を縮めて）を一つおきに立て、田の縁の盛り土と分かるように。株の形は共通の物を使い回す
    const tuftAt = banks.filter((_, i) => i % (MEM_TIGHT ? 4 : 2) === 0);
    const tufts = new THREE.InstancedMesh(plumeTuftGeo('susuki', true), plumeTuftMat(), tuftAt.length);
    tuftAt.forEach(({ p, a }, i) => {
      const g = ((i * 2246822519) >>> 0) / 4294967296, off = (g - 0.5) * 1.6;
      const x = p.x + Math.sin(a) * off, z = p.z + Math.cos(a) * off;
      dummy.position.set(x, W.heightAt(x, z) + 0.12, z); dummy.rotation.set(0, g * 6.28, 0);
      const s = 0.32 + g * 0.22; dummy.scale.set(s * 1.3, s, s * 1.3); dummy.updateMatrix(); tufts.setMatrixAt(i, dummy.matrix);
    });
    rt.scene.add(tufts);
    // 泥の面は細かく地面に沿わせ、斜面で浮いた板にならないようにする。
    const pos = [], uv = [], indices = [];
    for (const center of mud) {
      const local = L(center), base = pos.length / 3;
      for (let iz = 0; iz <= 16; iz++) for (let ix = 0; ix <= 12; ix++) {
        // 11/18 クラウド kaito2 見回り（200秒 874×402）：泥の面（12.4×15.4m）と区画（14×17m）の間に1.6m の隙間が残り、
        //   暗い泥の田の間に明るい地面が白い格子の筋に見えた。区画いっぱいに広げ、継ぎ目は畦の下に隠す。広げた縁で地面が泥を突き抜けて斑に光ったので、目を細かく（1.1m）し少し浮かす
        const p = T(local.x - 6.8 + ix * 13.6 / 12, local.z - 8.3 + iz * 16.6 / 16);
        pos.push(p.x, W.heightAt(p.x, p.z) + 0.08, p.z);
        // 共通の泥の絵を同じ縮尺で使い、無地の灰白色の板を置かない。
        uv.push(p.x * 0.25, p.z * 0.25);
      }
      for (let iz = 0; iz < 16; iz++) for (let ix = 0; ix < 12; ix++) {
        const a = base + iz * 13 + ix; indices.push(a, a + 13, a + 1, a + 1, a + 13, a + 14);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    // 同じ写真：泥の田が灰の舗装に見えた。茶の泥に染める
    // 11/18 クラウド見回り（150秒 874×402）：日陰で泥の田が真っ黒な灰色の平たい板に見えた。地面と同じ照りの材質で、濡れた茶の土に
    // 11/18 クラウド持ち主（150秒 874×402）：暗い泥の写真に 0xb08a5c を掛けて黒い穴の面に見え、明るい畦だけが格子に浮いた。
    //   染めを一より上げ（泥の写真の暗さを打ち消す）、濡れた灰茶の土に。畦（0x5a4e32 の盛り土）との差を縮める
    rt.scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: mudTex(), color: new THREE.Color(1.55, 1.36, 1.08) })));
  },

  // 葦の原：人の背（二m余り）の葦の株を密に並べる。大垣の側の川べりにも細い帯で（11/8 critic60：葦の原が無く伏せる所が見えなかった）
  reeds(rt) {
    const W = rt.world, spots = [];
    let seed = 1600914;
    const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const nBed = MEM_TIGHT ? 700 : 1500, nBank = MEM_TIGHT ? 160 : 360;
    for (let i = 0; i < nBed; i++) {
      const x = REED_BED.x0 + R() * (REED_BED.x1 - REED_BED.x0), z = REED_BED.z0 + R() * (REED_BED.z1 - REED_BED.z0);
      // 縁は疎らに（四角い壁に見せない）
      const e = Math.min(x - REED_BED.x0, REED_BED.x1 - x, z - REED_BED.z0, REED_BED.z1 - z);
      if (e < 6 && R() > e / 6) continue;
      spots.push([x, z, 2.1 + R() * 0.7]);
    }
    for (let i = 0; i < nBank; i++) { const z = -90 + R() * 180, x = 22 + R() * 12; if (Math.abs(z - 4) > 9) spots.push([x, z, 1.5 + R() * 0.6]); }   // 浅瀬の渡り口は空ける
    const mesh = new THREE.InstancedMesh(plumeTuftGeo('ashi', MEM_TIGHT), plumeTuftMat(), spots.length);
    const d = new THREE.Object3D();
    // 11/18 クラウド持ち主（journey ③「葦の原が揺れて伏兵」）：葦が少しも動かず、伏兵が葦の前に急に湧いて見えた。
    //   ②の渡る間は鉄砲衆の伏せる縁の株だけがときどき揺れ（何かが居る）、③で明石の兵が出た道筋と鉄砲衆の前の株は押し倒される
    const near = [];   // 揺らす・倒す見込みのある株だけ持つ（毎コマ全部を回さない）
    spots.forEach(([lx, lz, h], i) => {
      const p = T(lx, lz), wide = 1.5 + R() * 0.8, ry = R() * 6.28;
      d.position.set(p.x, W.heightAt(p.x, p.z) - 0.05, p.z); d.rotation.set(0, ry, 0); d.scale.set(wide, h, wide); d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
      if (lx > -52 && lx < -16 && lz > 16 && lz < 52) near.push({ i, lx, lz, x: p.x, y: d.position.y, z: p.z, h, wide, ry, tilt: 0 });
    });
    mesh.frustumCulled = false; mesh.receiveShadow = true;
    rt.scene.add(mesh);
    rt.flags.reedMesh = mesh; rt.flags.reedNear = near;
  },

  // 葦の株を傾けて置き直す（倒す向きは伏兵の駆ける向き）
  reedTick(rt, dt) {
    const F = rt.flags, near = F.reedNear;
    if (!near || F.reedDone) return;
    const pre = F.step === 2, burst = F.step >= 3 && F.reedBurstT != null;
    if (!pre && !burst) return;
    const d = F._reedObj || (F._reedObj = new THREE.Object3D()), q = F._reedQ || (F._reedQ = new THREE.Quaternion());
    const ax = F._reedAx || (F._reedAx = new THREE.Vector3()), qy = F._reedQy || (F._reedQy = new THREE.Quaternion()), up = new THREE.Vector3(0, 1, 0);
    // 駆ける向き（局所の (-46,44)→(-24,22)）を地図の向きへ。倒す軸はその横
    const a = T(-46, 44), b = T(-24, 22), dx = b.x - a.x, dz = b.z - a.z, dl = Math.hypot(dx, dz);
    ax.set(dz / dl, 0, -dx / dl);
    const k = burst ? Math.min(1, (rt.t - F.reedBurstT) / 1.4) : 0;
    let moved = false;
    for (const r of near) {
      let t = 0;
      if (pre) {
        // 鉄砲衆の伏せる縁（局所 (-26,26) の六m）の株だけ、三秒おきに一秒ほど揺れる
        const e = Math.hypot(r.lx + 26, r.lz - 26);
        if (e < 6) { const ph = (rt.t + r.i * 0.013) % 3; t = ph < 1 ? Math.sin(ph * Math.PI) * Math.sin(rt.t * 11 + r.i) * 0.22 * (1 - e / 6) : 0; }
      } else {
        // 駆けた道筋（幅五m）と鉄砲衆の前（七m）は押し倒されたまま
        const px = r.lx + 46, pz = r.lz - 44, s = Math.max(0, Math.min(1, (px * 22 - pz * 22) / (22 * 22 * 2)));
        const off = Math.hypot(px - 22 * s, pz + 22 * s), e = Math.hypot(r.lx + 26, r.lz - 26);
        const w = Math.max(off < 5 ? 1 - off / 5 : 0, e < 7 ? 1 - e / 7 : 0);
        t = w * 1.1 * k;
      }
      if (Math.abs(t - r.tilt) < 0.004) continue;
      r.tilt = t; moved = true;
      qy.setFromAxisAngle(up, r.ry); q.setFromAxisAngle(ax, t).multiply(qy);
      d.position.set(r.x, r.y, r.z); d.quaternion.copy(q); d.scale.set(r.wide, r.h * (1 - 0.25 * Math.min(1, t)), r.wide); d.updateMatrix();
      F.reedMesh.setMatrixAt(r.i, d.matrix);
    }
    if (moved) F.reedMesh.instanceMatrix.needsUpdate = true;
    if (burst && k >= 1) F.reedDone = true;   // 倒し終えたら回さない
  },

  // 家康の本陣（赤坂の岡山）と有馬の陣（赤坂の側の岸）。どちらも本物の旗本がいる
  camps(rt) {
    const F = rt.flags, W = rt.world;
    const campStart = rt.scene.children.length;
    // 通し確認の白い無地の柱に見える巻いた旗架を省き、開いた家紋の幟を残す。
    KIT.honjin(rt, IEYASU.x, IEYASU.z, { mon: 'tokugawa', people: false, fire: true, hatazao: false });
    farSight(rt.scene.children.slice(campStart), { W, ground: { ...IEYASU, r: 24 }, far: 320 });
    addSite(rt, 'fort', IEYASU.x, IEYASU.z, '家康の本陣');
    F.ieyasu = allyGroup(rt, { name: '徳川家康の旗本', fullStrength: true, anchor: T(205, -146), facing: Y(-Math.PI * 0.75), width: 6, aggro: 4, seekRange: 8, order: 'hold', fixed: true, noRout: true },
      fl([{ type: 'busho', n: 1, o: { name: '徳川家康', invuln: true, horse: false } }, { type: 'samurai', n: 18 }, { type: 'gun', n: 4 }], 'tokugawa'));
    F.ieyasu.mon = 'tokugawa';
    F.ieyasuU = F.ieyasu.units.find((u) => u.name === '徳川家康');
    // 本陣の前を固める旗本の備（数百。岡山の一帯に東軍の陣があった。tabi-mag gi0027）。川へは出ない
    F.hata = this.block(rt, { key: 'hata', name: '徳川家康の旗本', team: 0, flag: 'tokugawa', at: T(186, -128), facing: Y(-Math.PI * 0.75), w: 26, d: 8 });
    if (F.ieyasuU) F.ieyasuU._crouch = true;   // 床几に腰を下ろす（総大将は本陣で座る）
    for (const [dx, dz] of [[-10, 8], [10, 8], [0, 14]]) {
      const flag = nobori(W, IEYASU.x + dx, IEYASU.z + dz, 'tokugawa', 7);
      farSight(flag, { far: 320 });
      rt.scene.add(flag);
    }
    // 有馬の陣の幕と幟は有馬家の左三つ巴。徳川の金扇の馬印は家康の本陣だけ（外様の陣に立てない・11/6）
    KIT.honjin(rt, T(88, -30).x, T(88, -30).z, { mon: ARIMA_MON, people: false, fire: true, yoroi: false, uma: false, hyoro: false, hatazao: false });   // 刈田の野の陣に俵は積まない（11/8 critic60 二1）
    addSite(rt, 'fort', ARIMA.x, ARIMA.z, '有馬豊氏の陣');
    // 11/18 クラウド持ち主（330秒 874×402・初めての目）：逃げ込む先の有馬の陣が幕と幟だけの空き地に見えた（旗本は岸へ出ている）。
    //   幕の口に陣の番を本物で五人（侍一・鉄砲二・足軽二）。持ち場を動かず、手勢の帰還の数には入れない
    F.arimaCamp = allyGroup(rt, { name: '有馬の陣の番', fullStrength: true, anchor: T(82, -33), facing: Y(-Math.PI / 2), width: 5, spacing: 2, aggro: 5, seekRange: 6, order: 'hold', fixed: true, noRout: true },
      fl([{ type: 'samurai', n: 1 }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 2, o: { flagScale: 1 } }], ARIMA_MON));
    F.arimaCamp.mon = ARIMA_MON;
    // 11/18 05:15 クラウド持ち主（act bot 96秒）：陣の番が「後ろでじっとする味方を押し出す」仕組み（army_relief）に攻めへ替えられ、陣を離れて五人が一点に重なった。本陣の番として押し出さない
    F.arimaCamp.campGuard = true; F.arimaCamp.noFrontline = true;
    // 11/18 07:55 クラウド持ち主（act bot 81秒：陣の番五人が attack で30m 先の一点に重なる★★）：共通の ally_goal（hold の味方の備を本人の行き先へ連れて行く）が
    //   陣の番も連れ出していた。持ち場を守る印（stay）を立て、下知が替えられても毎コマ幕の口へ戻す
    F.arimaCamp.stay = true; F.arimaCampAt = { x: F.arimaCamp.anchor.x, z: F.arimaCamp.anchor.z };
  },

  // 陣形の塊（備）を一つ。名目は史実の兵数 ÷ SC。近くは本物の兵に替わる
  block(rt, o) {
    const W = rt.world, F = rt.flags;
    const add = W.addDistantArmy;
    W.addDistantArmy = function (p) { return add.call(this, { ...p, w: o.w, d: o.d, kind: o.kind || 'mixed', flagRate: 0.5, mon: o.flag, team: o.team, farFill: true, host: false }); };
    let b;
    try { b = fieldButai(rt, { name: o.name, team: o.team, faction: o.team ? o.flag : 'tokugawa', kind: 'ashigaru', nominal: Math.round(HIST[o.key] / SC), armor: ARM[o.flag], flag: o.flag, at: o.at, facing: o.facing, realMax: 0 }); }
    finally { W.addDistantArmy = add; }
    b.noSwitch = true;
    b._autoSwitch = () => {};
    if (b.light) { b.light.army.noWake = false; b.light.army.team = o.team; }
    b.key = o.key;
    // 絵の兵を置かない時も、下知の行き先は進める。本物の旗本が
    // 動かない空の備へ戻り続け、渡河も伏兵の寄せも止まっていた。
    if (b.light?.army.empty) {
      const update = b.update;
      b.update = (dt) => {
        const march = b.k04March, A = b.light.army;
        if (march && !b.routedL) {
          const dx = march.to.x - A.cx - A.off.x, dz = march.to.z - A.cz - A.off.z;
          const d = Math.hypot(dx, dz), step = Math.min(d, march.speed * dt);
          if (d > 0) { A.off.x += dx / d * step; A.off.z += dz / d * step; }
          if (step >= d) b.k04March = null;
        }
        update(dt);
      };
    }
    F.blocks.push(b);
    return b;
  },
  go(b, to, speed = 1.6, opt = {}) {
    if (!b || !b.light || b.routedL) return;
    const p = lightPos(b), d = Math.hypot(to.x - p.x, to.z - p.z);
    b.light.moveTo(to.x, to.z, Math.max(0.5, d / speed), opt);
    if (b.light.army.empty) b.k04March = { to, speed };
    b.cmd = { id: opt.charge ? 'charge' : 'move', to, target: null, form: 'line' };
  },

  toStep(rt, n) {
    const F = rt.flags, B = F.blk;
    if (F.ending || F.step >= n) return;
    F.step = n; F.stepT = rt.t;
    for (const k of ['go', 'noi', 'ford', 'camp']) rt.unmark(k);
    rt.obj('main', STEP_TEXT[n - 1], 'main', true);
    if (n === 1) {
      rt.setPhase?.('siege');
      rt.marker('go', () => (B.bait && !B.bait.routedL ? lightPos(B.bait) : BAIT), '刈田の島左近の兵');
      sfx('horagai', 0.8);
      rt.say('中村一栄', 'かかれ！　刈田の者どもを追い散らせ', 2.6);
      rt.army.play('toki', T(80, 0), 1.3);
      this.go(B.saki, T(68, 0), 2.6, { charge: true });
      this.go(B.arima, T(70, -16), 1.6);   // 有馬の隊も田へ出て加わる（乱戦。川は越えない）
      if (live(F.arimaG)) {
        F.arimaG.order = 'move'; F.arimaG.dest = T(70, -16);
        F.arimaG.onArrive = (g) => this.holdArima(g);
      }
      F.baitN0 = B.bait.aliveNominal();
    } else if (n === 2) {
      rt.marker('go', RING, '退く島左近の兵');
      // 先手の実兵も主人公と渡る。遠い備だけを追わせない
      F.follow = F.follow.filter(([g]) => g !== F.noi && g !== F.kazu);
      for (const g of [F.noi, F.kazu]) { g.order = 'move'; g.dest = RING; g.speed = 4.8; g.noEngage = true; }   // 11/18 クラウドさ：追う間は横を退く蒲生の組へ一人ずつ寄り道しない（隊の後ろが川の東の岸で斬り合い続け、両岸に割れて止まった）。6m 内は応戦する
    } else if (n === 3) {
      this.ambush(rt);
      F.defenseHp = rt.player.u.hp;
      rt.marker('noi', () => this.defensePoint(rt), '野一色頼母の旗');
    } else if (n === 4) {
      // 囮の実兵は隊列合わせを終え、退く先手を追う。追撃の下知を hold で上書きしない。
      F.follow = F.follow.filter(([g]) => g !== F.gamo);
      rt.marker('ford', T(64, 4), '杭瀬川の赤坂の側の岸');
      sfx('horagai', 0.8);
      // 史実：岡山で見ていた家康が兵を引かせた（内府＝内大臣。大御所は後の呼び名）
      rt.after(2.5, () => rt.say('使番', '岡山より下知。深追い無用、杭瀬川を越えて引けとの内府様の仰せ', 3.2));
      // 11/17 K355 iMac n-kwatch（漫画から：井伊が後詰に出ようとするのを、家康が「挑発に乗るな」と止めた＝負けを認めて引く総大将）。自分の言葉で一つ
      rt.after(6.4, () => { if (!F.ending && !rt.over) rt.say('中村の侍', '井伊殿が後詰に出ると申されたが、内府様が止められたそうな。誘いに乗るな、と', 3.6); });
      for (const b of [B.shima, B.akashi, B.bait]) this.go(b, T(20, b === B.akashi ? 14 : -10), 2.2, { charge: true });
      // 音だけの斉射ではなく、葦の鉄砲衆自身が岸へ出て退く先手を撃つ。
      // 渡河はせず、大垣の側の岸に射撃の持ち場を固定する。
      if (live(F.guns)) {
        const bank = T(26, 14);
        F.guns.fixed = true; F.guns.order = 'move'; F.guns.dest = bank; F.guns.speed = 3;
        F.guns.onArrive = (g) => { g.order = 'hold'; g.anchor = bank; g.dest = null; };
      }
    } else if (n === 5) {
      rt.marker('camp', ARIMA, '有馬豊氏の陣');
      rt.say('有馬豊氏', '中村の者を通せ！　鉄砲、川へ向けて構えよ', 3);
      // 岸へ着いた先手も陣の内へ収める。川岸の古い行き先で帰還待ちにしない。
      for (const g of F.returnGroups) if (live(g)) {
        g.order = 'retreat'; g.dest = ARIMA; g.speed = 4.2; g.focus = null; g.onArrive = null;
      }
      this.go(B.arima, T(62, -8), 1.8);
      if (live(F.arimaG)) {
        F.arimaG.order = 'move'; F.arimaG.dest = T(64, -12);
        F.arimaG.onArrive = (g) => this.holdArima(g);
      }
      // 鉄砲の音は有馬の鉄砲衆が実際に撃った時に鳴らす。
    }
  },

  // 囮が退くふり：刈田の兵が葦の原の方へ退き、中村の先手が追う
  feign(rt) {
    const F = rt.flags, B = F.blk;
    if (F.feigned) return;
    F.feigned = true; F.feignT = rt.t;
    for (const u of F.gamo?.units || []) u._crouch = false;
    // 刈田で迎撃へ移した実兵にも、囮の退く下知を戻す。
    if (!F.follow.some(([g]) => g === F.gamo)) F.follow.push([F.gamo, B.bait, 0, 0]);
    this.go(B.bait, T(-48, -4), 3, { back: true });   // 杭瀬川を東へ越えて葦の原の方へ
    rt.say('野一色頼母', '逃げるぞ。川を越えて追え、首を取れ！', 3);
    rt.after(3.2, () => rt.say('有馬豊氏', '深追いするな！　川の向こうは葦の原じゃ', 3));
    this.go(B.saki, T(-14, 0), 2.8, { charge: true });
    // 11/18 クラウド持ち主（描かずの数え：刈田の段で蒲生の組は蒲生一人を残して討たれ、②の追う段の27秒は本人の討ち取り0＝
    //   「追えば討てる」の油断が出ず③の落差が無い・journey 2）：退く塊の最後尾に殿の六人（本物）を残す。少し打ち合って崩れ、川へ逃げる
    //   置き場は本人から退く先（川）へ十二歩。塊の中心（lightPos）は七十歩も後ろで、殿が本人の背に湧いて追いつけなかった
    const P0 = rt.player.u.pos, dx = RING.x - P0.x, dz = RING.z - P0.z, dl = Math.hypot(dx, dz) || 1, rp = { x: P0.x + dx / dl * 12, z: P0.z + dz / dl * 12 };
    F.rearG = enemyGroup(rt, { faction: 'ishida', name: '刈田の殿', anchor: { x: rp.x, z: rp.z }, facing: Y(Math.PI / 2), width: 4, formation: 'line',
      morale: 70, dmgMult: 0.7, order: 'attack', aggro: 10, seekRange: 16, speed: 3 },
    fl([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5, o: { keep: true } }], 'ishida'));
    F.rearT = rt.t;
    F.foes.push(F.rearG);
    this.toStep(rt, 2);
  },

  // 伏兵：葦から明石全登、林の陰から左近の本隊。刈田の兵も向き直る
  ambush(rt) {
    const F = rt.flags, B = F.blk;
    // 渡河を終えた頼母と中村の組は、その場で伏兵を迎え撃つ。
    // 旗の横で防ぐ間に、古い行き先へ隊の要だけが進み続けないようにする。
    for (const g of [F.noi, F.kazu]) if (g) g.noEngage = false;
    this.holdVanguard(rt);
    // 頼母がまだ岸にいる場合も、防戦の場所を川の手前へ戻さない。
    const flag = F.noiU?.pos && L(F.noiU.pos).x < -6 ? F.noiU.pos : RING;
    F.defenseX = flag.x; F.defenseZ = flag.z;
    // 囮も向き直って戦う。備への隊列合わせで攻撃を待機に戻さない。
    F.follow = F.follow.filter(([g]) => g !== F.gamo);
    F.gamo.order = 'attack'; F.gamo.seekRange = 30;
    rt.unmark('go');
    F.reedBurstT = rt.t;
    B.akashi = this.block(rt, { key: 'akashi', name: '明石全登の伏兵', team: 1, flag: 'ukita', at: AKASHI_HIDE, facing: Y(-0.6), w: 36, d: 12 });
    B.shima = this.block(rt, { key: 'shima', name: '島左近の本隊', team: 1, flag: 'ishida', at: SHIMA_HIDE, facing: Y(Math.PI - 0.6), w: 26, d: 10 });
    this.go(B.akashi, T(-24, 22), 2.4, { charge: true });
    this.go(B.shima, T(-22, -16), 2.4, { charge: true });
    this.go(B.bait, T(-36, 2), 2.2, { charge: true });
    // 葦の縁に膝をつく明石の鉄砲衆（本物）。先手の横腹を撃つ
    const guns = enemyGroup(rt, { faction: 'ukita', name: '明石全登の鉄砲衆', anchor: T(-26, 26), facing: Y(-0.4), width: 8, formation: 'line', noRout: true,
      morale: 90, dmgMult: 0.8, order: 'hold', aggro: 10, seekRange: 40, speed: 2.6 },
    fl([{ type: 'gun', n: 14 }, { type: 'samurai', n: 1 }], 'ukita'));   // もっと鉄砲を（BK の 3）
    // 11/18 クラウド持ち主（act bot 375秒：受けた傷 鉄砲3・侍0＝伏兵の横撃ちが怖くない）：鉄砲衆の弾は本人へは素の重さで（味方へは0.8のまま）
    guns.dmgMultPlayer = 1;
    // 11/19 クラウド持ち主（描かずの数え）：伏兵が出て一秒で共通の「敵が間近、持ち場から打って出る」が鉄砲衆を attack にし、
    //   葦の縁を離れて味方を追い八十m先まで歩き去り、③の二十〜五十秒は一発も撃たなかった→持ち場を固めて葦の縁から撃ち続ける（④で岸へ出るのは今のまま）
    guns.fixed = true;
    F.guns = guns;
    F.foes.push(guns);
    // 明石全登と左近（本物の旗本に囲まれる。討てない。翌日の関ヶ原に出る）
    // 11/18 15:55 クラウド持ち主（act bot「もっと強い奴と斬り合いたい」・手柄の名0が毎回）：旗本の侍の一人ずつを兜の物頭（名のある侍・討てる）に。
    //   名は役目だけ（人の名は史料で確かめられないので付けない）。数は同じ十人
    // 共通の戦闘では invuln だけの敵将は本人が討てるため、史実の生存も指定する。
    F.akashiG = enemyGroup(rt, { faction: 'ukita', name: '明石全登の旗本', anchor: { ...AKASHI_HIDE }, facing: Y(-0.6), width: 6, formation: 'line', noRout: true,
      morale: 100, dmgMult: 0.5, order: 'hold', aggro: 6, seekRange: 10, speed: 2.6 },
    fl([{ type: 'busho', n: 1, o: { name: '明石全登', invuln: true, mustLive: true, horse: true } }, { type: 'samurai', n: 1, o: { name: '明石の物頭', keep: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 9, o: { keep: true } }, { type: 'ashigaru', n: 4, o: { keep: true } }], 'ukita'));
    F.shimaG = enemyGroup(rt, { faction: 'ishida', name: '島左近の旗本', anchor: { ...SHIMA_HIDE }, facing: Y(Math.PI - 0.6), width: 6, formation: 'line', noRout: true,
      morale: 100, dmgMult: 0.5, order: 'hold', aggro: 6, seekRange: 10, speed: 2.6 },
    fl([{ type: 'busho', n: 1, o: { name: '島左近', invuln: true, mustLive: true, horse: true } }, { type: 'samurai', n: 1, o: { name: '島の物頭', keep: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 9, o: { keep: true } }, { type: 'ashigaru', n: 4, o: { keep: true } }], 'ishida'));
    // 11/18 クラウド持ち主（act bot 受けた傷0）：旗本の刃は味方の兵へは半ば（0.5）のまま、本人へは素の一太刀に
    for (const g of [F.akashiG, F.shimaG]) { g.kind = 'main'; g.dmgMultPlayer = 1; F.foes.push(g); }
    // 物頭は味方の槍衾に先に討たれていた（描かずの数え：二人とも本人の二m まで来て味方に討たれ、手柄の名0）→本人でない者からの傷を二割に（army_combat.js の takeNonPlayer）
    for (const g of [F.akashiG, F.shimaG]) for (const u of g.units) if (u.name && u.name.endsWith('物頭')) u.takeNonPlayer = 0.2;
    F.follow.push([F.akashiG, B.akashi, 0, 0], [F.shimaG, B.shima, 0, 0]);
    if (B.saki) B.saki.morale = Math.min(B.saki.morale, 48);
    rt.army.play('toki', AKASHI_HIDE, 1.5); rt.after(0.4, () => rt.army.play('toki', SHIMA_HIDE, 1.5));
    // 伏兵の銃声は上で置いた鉄砲衆の発砲に任せる。
    sfx('taiko', 1);
    rt.say('野一色頼母', '葦の中に鉄砲じゃ！　伏せておったか', 3);
    rt.after(4, () => rt.say('島左近', '釣れたわ。返せ、一人も川へ戻すな', 3));
  },

  // 伏兵が出た時に渡河中だった組も、渡り切った時点で防戦へ移る。
  holdVanguard(rt) {
    const F = rt.flags;
    for (const g of [F.noi, F.kazu]) if (live(g)) {
      const c = g.center();
      // 渡河が遅れた組は川を渡り切るまで進ませる。
      // 片方の組だけの遅れで先手全体の追撃を止めない。
      if (g.guardOn || L(c).x >= -6) continue;
      g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.dest = null; g.seekRange = 14;
      // 将が斬り合う兵の後ろへ下がり続け、目標の旗まで動き続けないようにする。
      g.guardOn = true;
    }
  },

  // 包みが閉じる：頼母は深田で討たれ、先手が崩れる（史実どおり。主人公には救えない）
  closeRing(rt) {
    const F = rt.flags, B = F.blk;
    if (F.ringClosed) return;
    F.ringClosed = true;
    if (F.noiU?.alive) { F.noiU.invuln = false; rt.army.kill(F.noiU, null); }
    routButai(B.saki, 30);
    rt.say(F.mine.leader?.name || '手勢の侍', `${nm(rt)}殿、頼母様が……！　川まで退くほかござらぬ`, 3.2);
    rt.after(3.4, () => rt.say('中村一栄', '退け！　杭瀬川を越えよ！', 3));
    F.follow = F.follow.filter((f) => f[0] !== F.noi && f[0] !== F.kazu);
    for (const g of [F.noi, F.kazu]) if (live(g)) { g.order = 'retreat'; g.dest = T(90, -12); g.speed = 4; g.focus = null; }
    // 11/18 17:50 クラウド持ち主（act bot 3回：④の退きが22〜34秒・討ち取り0＝本人が追手より先に川まで七十mを走り切る）：
    //   左近の「一人も川へ戻すな」のとおり、明石の旗本を浅瀬の手前（局所 x22・本人と浅瀬の間）へ先回りさせて退き口を塞ぎ、
    //   左近の旗本は本人の背の十mへ寄せる。塞ぐ組を斬り抜けて渡る（journey 3「背に追手・川の中まで」）
    const PL = L(rt.player.u.pos);
    F.follow = F.follow.filter((f) => f[0] !== F.akashiG && f[0] !== F.shimaG);
    const cut = T(34, Math.max(-14, Math.min(18, PL.z + (4 - PL.z) * 0.6))), back = T(PL.x - 10, PL.z);
    // 旗本が防戦で討たれ減っていたら（act bot 1751：④24秒・討ち取り1）、本人に近い伏兵の組の生きた物を塞ぎに回す
    const alive = (g) => live(g) ? g.units.filter((u) => canReturn(u) && !u.downed).length : 0;
    const near = rt.army.groups.filter((g) => g.team === 1 && g !== F.guns && alive(g) >= 4 && dist(g.center(), rt.player.u.pos) < 60)
      .sort((a, b) => (alive(b) >= 8) - (alive(a) >= 8) || dist(a.center(), rt.player.u.pos) - dist(b.center(), rt.player.u.pos));
    // act bot 1753・1755（④27・34秒・討ち取り0）：防戦の場から走らせた組は本人より先に浅瀬の手前へ着けない。
    //   明石の八百のうち浅瀬の北の岸の葦に残した一手（十二人）を、包みが閉じた時に岸から出して浅瀬の手前を塞がせる
    //   出る所は本人から六十m余りの北（三十五mでは野の真ん中に急に湧いて見えた）。足を五・五にして本人より先に浅瀬の手前へ
    const cutG = enemyGroup(rt, { faction: 'ukita', name: '明石の後の手', anchor: T(30, 64), facing: Y(Math.PI), width: 6, formation: 'line', noRout: true,
      morale: 90, dmgMult: 0.8, order: 'hold', aggro: 12, seekRange: 24, speed: 5 },
    fl([{ type: 'samurai', n: 3, o: { keep: true } }, { type: 'ashigaru', n: 9, o: { keep: true } }], 'ukita'));
    cutG.chaseSoft = true; F.foes.push(cutG);
    rt.army.play('toki', T(30, 64), 1.2);
    // act bot 1759 の足跡：③の終わりに本人の二十五m内に「新手」の待つ備が二十〜五十人いたのに、④に入ると畳まれて（def.reserveFold）逃げ散り、
    //   川までの十五m内の敵が0。本人に近い新手を二組まで畳む列から外し、追手として背を追わせる（刃は reserveDmgMult の0.4のまま）
    const S = F._dr;
    if (S && S.E) {
      const keep = S.E.filter((g) => alive(g) >= 4 && dist(g.center(), rt.player.u.pos) < 40)
        .sort((a, b) => dist(a.center(), rt.player.u.pos) - dist(b.center(), rt.player.u.pos)).slice(0, 2);
      for (const g of keep) {
        S.E.splice(S.E.indexOf(g), 1);
        g.stay = false; g.order = 'attack'; g.dest = null; g.seekRange = 40; g.aggro = 14; g._apCharge = true;
      }
    }
    const backG = [F.shimaG, ...near].find((g) => g && g !== cutG && alive(g) >= 4);
    for (const [g, to, sp] of [[cutG, cut, 5.5], [backG, back, 4.4]]) if (g) {
      g.order = 'move'; g.dest = to; g.speed = sp; g.focus = null; g.onArrive = null; g.cutTo = to; g.stay = false;
    }
    rt.after(4, () => this.toStep(rt, 4));
  },

  update(rt, dt) {
    const F = rt.flags, B = F.blk;
    if (F.ending || !F.step) return;
    const P = rt.player.u, PL = L(P.pos);
    butaiTick(rt, dt);
    this.reedTick(rt, dt);
    // 行き先の印に着いたら必ず一言（K175：着いても6秒何も起きない）
    if (!F.arrSaid) F.arrSaid = {};
    if (F.step === 5 && !F.arrSaid[5] && dist(P.pos, ARIMA) < 12) { F.arrSaid[5] = 1; rt.say('有馬豊氏', 'よう戻った。先手の者も陣の内へ通せ！', 2.8); }
    // 11/18 19:55 クラウド持ち主（act bot 1939：116秒 印「野一色頼母の旗」に着いて六秒、台詞も敵の寄りも無かった）：
    //   着いたら頼母の一声と、本人に一番近い伏兵の組（鉄砲衆の外・四十m内）が旗へ打ち掛かる
    // 11/18 21:20 クラウド持ち主（act bot 2116：261秒 旗が頼母に付いて動いた後、もう一度着いて六秒なにも起きない）：
    //   一度離れて（十四m より外）また着いた時も、十二秒おきに近い伏兵の組を打ち掛からせる（台詞は初めの一度と、二度目以降は短い一声）
    const dDef = F.step === 3 ? dist(P.pos, this.defensePoint(rt)) : 99;
    if (dDef > 14) F.arrOut3 = true;
    const again = F.arrSaid[3] && F.arrOut3 && rt.t - (F.arrT3 ?? -99) > 12;
    if (F.step === 3 && (!F.arrSaid[3] || again) && dDef < 10) {
      if (F.arrSaid[3]) { if (F.noiU?.alive) rt.say('野一色頼母', '戻ったか。また来るぞ、構えよ', 2.2); }
      else rt.say('野一色頼母', 'よう来た。旗の横で槍を揃えよ、ここを破らせるな', 2.8);
      F.arrSaid[3] = 1; F.arrOut3 = false; F.arrT3 = rt.t;
      let best = null, bd = 40;
      for (const g of rt.army.groups) if (g.team === 1 && g !== F.guns && g.kind !== 'main' && !g.routed && g.units.filter((u) => canReturn(u) && !u.downed).length >= 3) { const d = dist(g.center(), P.pos); if (d < bd) { bd = d; best = g; } }
      if (best) { best.stay = false; best.order = 'attack'; best.dest = null; best.path = null; best.onArrive = null; best.seekRange = Math.max(best.seekRange || 0, 30); best.aggro = Math.max(best.aggro || 0, 14); best._apCharge = true; }
    }
    // 刈田の段は先手と刈田の兵の小競り合いだけ（囮が数で押されて先に崩れ、退くふりの前に川を越えて逃げないように）
    if (F.step <= 2) fieldTick(rt, dt, { list: F.baitBlocks, reach: 40, k: 0.004, routAt: 0 });
    // 史実の杭瀬川は討死数十人の小競り合い（東軍が千余り減る大敗に見えた。11/8 critic60 十二1・二1）。塊どうしの削り合いは浅く
    else fieldTick(rt, dt, { list: F.blocks, reach: 40, k: F.step === 3 ? 0.006 : 0.004 });
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      // 11/18 16:20 クラウド持ち主（描かずの数え）：頼母は斬り合う兵の後ろへ下がり、討たれる時に旗（防戦の場所）から十四〜十六m・本人から十六〜二十五m＝最期が見えない。
      //   防戦の場所を頼母の今の居所へ〇・六秒に一m半ずつ寄せ、本人が頼母の横で防ぐように（journey「頼母の最期は主人公から見える所で」）
      if (F.step === 3 && !F.ringClosed && F.noiU?.alive && F.defenseX != null) {
        const dx = F.noiU.pos.x - F.defenseX, dz = F.noiU.pos.z - F.defenseZ, d = Math.hypot(dx, dz);
        if (d > 4) { const k = Math.min(1, 1.5 / d); F.defenseX += dx * k; F.defenseZ += dz * k; }
      }
      // 有馬の持ち場は川岸。鉄砲の後列や応戦中の兵で中心がずれても、
      // 要が着けば移動を解き、その持ち場から岸を守る。
      const arima = F.arimaG;
      if (live(arima) && arima.order === 'move' && arima.dest &&
          dist(arima.anchor, arima.dest) < 0.5) {
        this.holdArima(arima);
      }
      const g = F.mine;
      if (live(g)) {
        // 11/10 クラウド：退く段で追手に背を討たれ、十六人の手勢が西の岸へ着く前に全滅して負けた（act 326秒）。退きの間は手勢の傷を半ばに
        g.defMult = F.step >= 4 ? 2 : 1;
        const c = g.center();
        // 敵に組みつかれている間は歩き続けず斬り返す（主人公を追って歩くまま討たれ、手勢が全滅していた。三巡 11/9 豊臣A）
        // 退却の下知の後は追手との斬り合いで足を止めず、岸から有馬の陣へ退く。
        // 先頭の一人だけの五ｍ判定では、後列に敵が迫っても移動へ戻り、
        // 移動と攻撃の合図を待ち直す。組全体で接敵を見て、間合いが開くまで応戦する。
        const engaged = F.step < 4 && dist(c, P.pos) < (F.mineEngaged ? 30 : 24) &&
          g.units.some((u) => canReturn(u) && !u.downed &&
            rt.army.nearestEnemy(u, F.mineEngaged ? 18 : 14, (q) => !q.isStruct && !q.civ && !q.noTarget));
        F.mineEngaged = engaged;
        if (F.step >= 4) {
          // 主人公を追わせると、殿が追手を払う間に手勢まで川へ戻ってしまう。
          // 下知の行き先を段ごとに固定し、合図の待ちも繰り返さない。
          g.order = 'retreat'; g.dest = F.step === 4 ? RETURN_BANK : ARIMA;
          // 11/18 クラウド k365-cloud-09（260秒 874×402：「手勢を連れて西へ渡り退く」なのに手勢が岸へ先に走り、田の中に本人ひとり）：
          //   ④の間は本人の八m先（岸の側）を行き先にし、本人と一緒に退かせる。岸に着いた後は岸で受ける
          if (F.step === 4) {
            const dx = RETURN_BANK.x - P.pos.x, dz = RETURN_BANK.z - P.pos.z, d = Math.hypot(dx, dz) || 1, k = Math.min(1, 8 / d);
            g.dest = { x: P.pos.x + dx * k, z: P.pos.z + dz * k };
          }
          g.speed = 4.2; g.focus = null; g.onArrive = null;
        }
        else if (engaged && !(F.mineMoveUntil > rt.t)) {
          // 行軍の行き先を残すと、戦いが切れた兵が古い持ち場へ戻る。
          g.order = 'attack'; g.dest = null; g.anchor.x = c.x; g.anchor.z = c.z; g.seekRange = 24;
        }
        // 11/18 クラウド持ち主（act bot 129秒：手勢が move のまま隊速0で20秒立つ）：本人との間合いの七mの縁と
        //   組み合いの有無で attack と move が入れ替わるたびに合図の待ちと要の置き直しが起き、要が進まなかった。
        //   一度歩き出したら二秒半は歩き通し、着いたとみなすのは五m の内（縁で行き来しない）
        else if (dist(c, P.pos) > (g.order === 'move' ? 5 : 7)) {
          if (g.order !== 'move') F.mineMoveUntil = rt.t + 2.5;
          // 岸の向きは回してある。地図の正方向へずらすと手勢だけ川へ戻ってしまう。
          // 六割秒ごとの再下知は、走る主人公が三m進むたびに合図の待ちを
          // 延ばしてしまう。十二mずれるまでは同じ行き先へ走らせる。
          const x = PL.x - 2, z = PL.z + 2;
          const a = x - O_L.x, b = z - O_L.z;
          const tx = ROT_C * a - ROT_S * b, tz = ROT_S * a + ROT_C * b;
          if (g.order !== 'move' || !g.dest || Math.hypot(g.dest.x - tx, g.dest.z - tz) > 12) g.dest = { x: tx, z: tz };
          g.order = 'move'; g.speed = 4.2;
        }
        else {
          g.order = 'attack'; g.dest = null; g.anchor.x = c.x; g.anchor.z = c.z; g.seekRange = 24;
        }
      }
      for (const [g, b, dx, dz] of F.follow) {
        if (!live(g) || !b || b.routedL || g.chaseStopped) continue;
        // 伏兵が先手へ届いた後は、備への追従で攻撃を移動に戻さない。
        // 押し合いで中心が六ｍずれるたびに下知し直すと、後列が動けず防戦も長引く。
        // 11/18 クラウド持ち主（act bot 156秒）：明石の旗本が本人のそばで備を追う move のまま6秒立っていた。本人の十二m内に来た組も打ち合いへ
        if (g.team === 1 && F.step === 3 && (dist(g.center(), this.defensePoint(rt)) < 24 || g.units.some((u) => canReturn(u) && !u.downed && dist(u.pos, P.pos) < 12))) {
          if (g.order !== 'attack') {
            const c = g.center();
            g.anchor.x = c.x; g.anchor.z = c.z;
          }
          g.order = 'attack'; g.dest = null; g.seekRange = 30; g._apCharge = true;
          continue;
        }
        // 備の前後左右は布陣と同じ向きへ回す。地図の軸へ足すと頼母が先手の反対側へ付く。
        const p = lightPos(b), to = { x: p.x + ROT_C * dx - ROT_S * dz, z: p.z + ROT_S * dx + ROT_C * dz };
        if (dist(g.center(), to) > 6) { g.order = 'move'; g.dest = to; g.speed = g.team ? 2.6 : 3.4; }
        else {
          // 刈田で立ち上がった兵と反転した伏兵は、備に着いた後も応戦する。
          const fight = !g.team || F.step === 1 && F.stood || F.step >= 3;
          g.order = fight ? 'attack' : 'hold'; g.dest = null; g.anchor = to;
          g.seekRange = g.team ? (fight ? 30 : 10) : 14;
        }
      }
    }
    // 11/18 クラウド持ち主（act bot：受けた傷 侍0・足軽0・討ち取り54「簡単すぎる」）：伏兵を食い止める段で、
    //   本人から二十歩内に来た西軍の組を一つだけ本人へ向ける（伏見・木津川口の huntPlayer と同じ形）。数と強さは変えない
    // 11/18 クラウド持ち主 07:55（act bot 6回のうち4回 受けた傷0「簡単すぎる」）：刈田で立ち上がった島左近の兵（退くふりの前）も、
    //   本人の二十歩内の組を一つ本人へ向ける（史実：左近の兵は中村の先手へ打ってかかってから退いた）。数と強さは変えない
    { const g = F.arimaCamp; if (g && g.count && g.order !== 'hold' && F.arimaCampAt) { g.order = 'hold'; g.dest = null; g.onArrive = null; g.focus = null; g.anchor.x = F.arimaCampAt.x; g.anchor.z = F.arimaCampAt.z; } }
    if (F.step === 3 || F.step === 1 && F.stood && !F.feigned) huntPlayer(rt, F, dt); else if (F._hunter) huntPlayer(rt, F, dt, true);
    // 11/18 クラウド持ち主（act bot 127秒：共通の ally_goal が本人に付けて動かした「遠くの備」が move のまま隊速0で20秒立つ・二回に一回）：
    //   要が行き先に着いても一人が持ち場へ届かず「着いた」にならないと、隊は move のまま止まる。共通の手で動かした味方の備が
    //   八秒進まなければ、その場で構えて近くの敵へかかる（兵の数・強さは変えない）
    for (const g of rt.army.groups) {
      if (g.team !== 0 || g._agGo == null || g.order !== 'move' || g.routed || !g.count) { if (g._kgStill) g._kgStill = 0; continue; }
      g._kgStill = (g.anchorSpeed || 0) < 0.1 ? (g._kgStill || 0) + dt : 0;
      if (g._kgStill < 8) continue;
      g._kgStill = 0;
      const c = g.center();
      g.onArrive = null; g.dest = null; g.anchor.x = c.x; g.anchor.z = c.z;
      g.order = 'attack'; g.seekRange = Math.max(g.seekRange || 0, 30);
    }
    // 防戦の長さは実際の経過秒で数える。間引いた判定の回数で数えると、
    // 携帯でコマが遅れた時だけ百三十秒の防戦が長引いてしまう。
    // 旗の周りで槍を交わす範囲も防戦に含める。将一人の押し戻しや戦線離脱で止めない。
    // 11/19 04:10 クラウド持ち主（act bot 0404：旗から十八m外で斬り合い defended が立たず③264秒）：旗の周りは二十四m（閉じる時の上限と同じ）
    if (F.step === 3 && F.defended && dist(this.defensePoint(rt), P.pos) < 24) {
      // 一度だけ槍を入れて離れた敵を放置しても、防戦の刻は増えない。
      // 攻め・受けの直後の間合い直しは含め、古い一撃で長い待機を達成にしない。
      const start = F.defenseFightT ?? -Infinity;
      const fighting = Math.max(0, Math.min(rt.t, start + 12) - Math.max(rt.t - dt, start));
      F.nearT = (F.nearT || 0) + fighting;
    }
    // 追撃も経過秒で数える。判定の間引きで携帯だけ間隔を延ばさない。
    if (F.step >= 4) F.chaseT = (F.chaseT ?? 0) - dt;
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const menRemain = F.returnGroups.some((g) => g.units.some(canReturn)) || (rt.squad || []).some(canReturn);
    if (F.step >= 2 && !menRemain) { this.lose(rt, '先手の兵が全員討死・戦線離脱した'); return; }
    const el = rt.t - F.stepT;
    if (F.step === 1) {
      // 刈田の足軽は、槍が迫ると稲を捨てて立ち上がる
      if (!F.stood && (F.baitPlayerHit || dist(lightPos(B.bait), P.pos) < 24 || live(F.kazu) && dist(F.kazu.center(), lightPos(B.bait)) < 18)) { F.stood = true; for (const u of F.gamo?.units || []) u._crouch = false; }
      // 味方が先に刈田へ迫った時も、本人の到着には実際の迎撃で応じる。
      // 小競り合いの長さと、本人が槍を入れる条件は残す。
      // 印の到着範囲とそろえる。手前で声を使い切り、印では無反応にしない。
      if (!F.baitArrived && dist(lightPos(B.bait), P.pos) < 6) {
        F.baitArrived = true;
        F.follow = F.follow.filter(([g]) => g !== F.gamo);
        F.gamo.order = 'attack'; F.gamo.dest = null; F.gamo.seekRange = 20;
        rt.say('蒲生備中', '中村の先手か。槍を揃え、迎え撃て！', 2.6);
      }
      const hurt = B.bait && B.bait.aliveNominal() < F.baitN0 * 0.8;
      // 11/18 クラウド持ち主（act bot 826秒）：本人が刈田の外の敵を追って二十mより離れると、囮の塊は削れないので（fieldTick が浅い）
      //   退くふりが来ず、刈田の段のまま556秒待った。槍を入れた後は百秒、入れなくても百六十秒で囮は退く（島左近の兵は決めた時に退いた・史実）
      if (F.baitPlayerHit && el > 65 && (hurt || dist(lightPos(B.bait), P.pos) < 20) || F.baitPlayerHit && el > 100 || el > 160) this.feign(rt);   // 少し戦ってから退くふり（史実）
    } else if (F.step === 2) {
      // 退く島の兵を追い、先手と一緒に川を東へ渡ってから伏兵が出る
      const across = (u) => canReturn(u) && !u.downed && L(u.pos).x < -6 && dist(u.pos, P.pos) < 18;
      // 頼母一人の遅れや最低待ち時間で、渡り終えた先手を足止めしない。
      // 主人公と生きた先手が実際に渡って合流した時に伏兵が出る。
      const joined = F.returnGroups.some((g) => g.units.some(across)) || (rt.squad || []).some(across);
      if (PL.x < -6 && joined) this.toStep(rt, 3);
    } else if (F.step === 3) {
      if (!F.ringClosed) this.holdVanguard(rt);
      // 11/19 クラウド持ち主（描かずの数え：③の百二十秒で西軍の鉄砲の発砲は八発だけ・葦の縁に据えても構えたまま撃たない）：
      //   journey ③「葦の原から鉄砲を一斉に放ち」のとおり、葦の縁の鉄砲衆が十二秒おきに込め終えた者から六挺まで、六十歩内の中村勢へ本物の弾を放つ
      //   （共通の筋書きの一斉射。本人は狙わない＝本人への弾は今の通常の射撃のまま）
      if (live(F.guns) && rt.t >= (F.gunSalvoT ?? rt.t)) {
        F.gunSalvoT = rt.t + 12;
        rt.army.scriptSalvo(F.guns, rt.army.groups.filter((g) => g.team === 0 && !g.civ), 6, 60);
      }
      // 新手の前列へ近づいた時だけ待機を解く。命令だけ攻撃に替えると
      // stay が残り、本人への応戦を止めたままになる。奥の二線は持ち場を守る。
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.routed && (g.stay || g.order === 'attack') && (g.isReserve || g._rsv || g._far)) {
        if (!g.units.some((u) => canReturn(u) && !u.downed && dist(u.pos, P.pos) < 15)) continue;
        g.stay = false; g.order = 'attack'; g.dest = null; g.path = null;
        // 応戦を始めた前列の組は後列も進める。奥の待機中の備は動かさない。
        g.seekRange = 30; g.aggro = 14; g._apCharge = true;
      }
      // 防戦を始める前の待機時間を、後の一撃で達成扱いにしない。
      // 待つだけでは防戦を果たさない。頼母の横で敵を打つか、打撃を受け止める。
      const hit = rt.player.lastHit;
      // 構えで防いだ時だけでなく、敵の打撃を身に受けた時も防戦に数える。
      // 転落や古い被弾を、旗の横で戦った証しにはしない。
      if (dist(this.defensePoint(rt), P.pos) < 24 && hit?.source?.team === 1 && (hit.blocked || P.hp < F.defenseHp) && hit.t >= F.stepT && rt.t - hit.t <= 0.5) {
        F.defended = true; F.defenseFightT = hit.t;
      }
      F.defenseHp = P.hp;
      // 伏兵を討ち果たして近くに打ち合う敵が残らない時、打ち合いの秒だけを待つと終わらない（11/11 act：七十五秒で止まり千秒立って時切れ）。
      //   六十秒は打ち合い、防戦に入って三分半たてば包みが閉じる。
      //   味方が伏兵を討って本人に敵が来ない時も、旗の横に五分立てば（本人が一度も打たず打たれなくても）閉じる。
      // 11/18 クラウド持ち主（act bot 3回：③が177〜209秒で戦の六割・表は1:40〜3:00）：打ち合い百三十秒→百五秒
      // 11/19 03:50 クラウド持ち主（act bot 0337：③が160秒・④25秒・⑤9秒。表は③1:40〜3:00＋頼母の最期で百秒）：打ち合い百五→八十・上限百九十→百六十・旗の横に立つだけの上限三百→二百六十
      if (F.defended && (F.nearT > 80 && el > 85 || F.nearT > 60 && el > 160) || el > 260 && dist(this.defensePoint(rt), P.pos) < 24) this.closeRing(rt);   // 渡河・防戦・退却を合わせ四分以上遊ぶ
    // 川幅は中心線から両側十二。水中の x=52 で渡り終えた扱いにしない。
    } else if (F.step === 4 && PL.x > 60 && (this.returnedMen(rt, false) > 0 || rt.t - F.stepT > 120)) this.toStep(rt, 5);   // 渡った味方が数えられず岸で止まった時も百二十秒で（同 act bot：④が 269秒から倒れる537秒まで続いた）
    else if (F.step === 5 && dist(P.pos, ARIMA) < 14 && (this.returnedMen(rt) > 0 || rt.t - F.stepT > 60)) {
      this.win(rt);
      // 生還で止めた備へ、同じ更新の末尾から追撃を命じ直さない。
      return;
    }
    // 退く段：西軍は川まで追うが渡らない（史実：有馬の隊が岸で受け、西軍は大垣へ引いた）。近い追手は人の走りより少し遅い
    if (F.step >= 4) {
      if ((F.chaseT ?? 0) <= 0) {
        F.chaseT = 2;
        const to = T(Math.min(PL.x, CHASE_X), PL.z);
        for (const b of [B.shima, B.akashi, B.bait]) if (b && !b.routedL && dist(lightPos(b), P.pos) > 30) this.go(b, to, 2.2, { charge: true });
      }
      for (const g of rt.army.groups) if (g.team === 1 && g.count && g !== F.guns && !g.interiorHold) {
        // 実兵の攻撃先も川の手前で止める。備だけを止めても、実兵は対岸の味方を追い続けていた。
        const c = g.center(), l = L(c);
        if (g.chaseStopped || l.x >= CHASE_X) {
          g.chaseStopped = true;
          // act bot 1817：浅瀬を塞いだ明石の後の手が止まり線の上で本人の三m横に retreat のまま六秒立った。水の中で本人が六m内なら目の前だけ斬り返す
          if (g.cutTo && PL.x < CHASE_X + 10 && g.units.some((u) => canReturn(u) && !u.downed && dist(u.pos, P.pos) < 6)) {
            g.order = 'attack'; g.dest = null; g.anchor.x = c.x; g.anchor.z = c.z; g.seekRange = 6; g.aggro = 6; g.onArrive = null;
            continue;
          }
          g.seekRange = 0; g.aggro = 0;
          // 待機・移動では共通の近接判断が十m先まで再び追わせる。
          // 退く下知なら目の前の敵だけ払い、川の手前の隊列へ戻る。
          g.order = 'retreat'; g.dest = T(CHASE_X, l.z); g.onArrive = null; g.focus = null;
          continue;
        }
        // 左近・明石の旗本は備に従うが、川岸での停止は他の追手と同じ。
        // 退き口を塞ぎに走った旗本は、着いたら（または本人が十五m内に来たら）その場で斬り合う
        // 18:15 足跡：十五mで斬りかかると浅瀬の手前へ着く前に本人の背へ回るだけ。七mまでは先回りを続ける
        if (g.cutTo && g.order === 'move') {
          if (dist(c, g.cutTo) < 4 || dist(c, P.pos) < 7) { g.order = 'attack'; g.dest = null; g.anchor.x = c.x; g.anchor.z = c.z; g.seekRange = 24; g.aggro = 14; g._apCharge = true; g.speed = 4.4; }
          continue;
        }
        if (g.kind === 'main') continue;
        if (g.chaseSoft) continue;
        // 退却だけを理由に打撃を弱めず、追手は人の走りに近い速さで背へ迫る。
        g.chaseSoft = true; g.speed = 3;
        if (g.order === 'hold') { g.order = 'attack'; g.seekRange = 40; g.aggro = 12; }
      }
      // 鉄砲は岸へ進んだ F.guns の通常射撃に任せる。撃っていない場所で銃声を鳴らさない。
      // 11/19 クラウド持ち主（描かずの数え：④で岸へ出た鉄砲衆の発砲0＝水しぶきも出ず、journey ④「鉄砲が撃ちかかる」が無い）：
      //   岸へ出る足を止めず、八秒おきに込め終えた者から五挺まで、八十歩内の退く中村勢へ本物の弾を放つ（本人は狙わない。本人への弾は通常の射撃のまま）
      if (F.step === 4 && live(F.guns) && rt.t >= (F.gunSalvo4T ?? rt.t)) {
        F.gunSalvo4T = rt.t + 8;
        rt.army.scriptSalvo(F.guns, rt.army.groups.filter((g) => g.team === 0 && !g.civ), 5, 80);
      }
      // 11/18 19:50 クラウド持ち主（journey ④「弾が水しぶきを上げる」が無かった）：本人が川の中にいる間、
      //   岸の鉄砲衆が実際に放った一発の六割を、弾の着く刻に本人の一間半〜五間の水面へ落とす（撃っていない弾のしぶきは出さない）
      const ws = F.step === 4 && live(F.guns) && rt.world.waterDepthAt(P.pos.x, P.pos.z) > 0.05;
      const at = rt.army.time;
      if (ws) for (const u of F.guns.units) if (u.alive && u.gunShotAt > (F.splashScan ?? at) && Math.random() < 0.6) {
        const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
        if (d > 100) continue;
        const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 3.5, x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
        rt.after(d / 160, () => { rt.world.spray(x, z, 10); });
      }
      F.splashScan = at;
    }
  },

  holdArima(g) {
    // 移動中の斜めの向きを残すと後列が陣の幕へ寄る。川へ正対して岸を受ける。
    g.order = 'hold'; g.dest = null; g.onArrive = null; g.guardOn = true;
    g.facing = Y(-Math.PI / 2);
  },

  defensePoint(rt) {
    const F = rt.flags;
    const p = F._defensePoint || (F._defensePoint = { x: 0, z: 0 });
    p.x = F.defenseX ?? RING.x; p.z = F.defenseZ ?? RING.z;
    return p;
  },

  // 生き残っていても川の向こうに残った兵は、生還した人数に含めない。
  returnedMen(rt, atCamp = true) {
    let n = 0;
    const groups = rt.flags.returnGroups, squad = rt.squad || [];
    // 陣の二十m内には川の縁も入る。主人公と同じく赤坂の岸へ渡り切った兵だけを数える。
    // 渡河の達成では岸への到着、最後の達成では有馬の陣への合流を確かめる。
    for (const g of groups) for (const u of g.units) if (canReturn(u) && !u.downed && L(u.pos).x > 60 && (!atCamp || dist(u.pos, ARIMA) < 20)) n++;
    for (const u of squad) if (!groups.some((g) => g.units.includes(u)) && canReturn(u) && !u.downed && L(u.pos).x > 60 && (!atCamp || dist(u.pos, ARIMA) < 20)) n++;
    return n;
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; F.victoryShown = true;
    rt.setPhase?.('end');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    const n = this.returnedMen(rt);
    rt.award((t) => { t.main = true; t.special = { label: '杭瀬川から兵を連れて退いた', pts: 30 }; }, '杭瀬川から生きて退いた');
    rt.banner('東軍、退く', `西軍は勝鬨を上げた　連れた兵 ${n}人`);
    const A = this.talk.after;
    rt.after(1.2, () => rt.say(A[0][0], A[0][1], 3.2));
    rt.after(4.6, () => rt.say(A[1][0], A[1][1], 3.6));
    rt.after(8.6, () => rt.say('使番', '内府様の仰せ。小競り合いに兵を損ずるな、陣を固めよ', 3.4));
    // 締め：岡山から家康が見ていた（昼の飯粒が膝に落ちても気づかぬほど・docs/battle_learn/k04_kuisegawa.md:21・journey 4:40）
    rt.after(22.2, () => rt.say('本多忠勝', '内府様は岡山で、膝に飯粒が落ちても気づかず見ておられた', 3.4));
    // K306 の続き（11/18 クラウド k365-cloud-42）：その夜七つ過ぎ、西軍は雨の中を大垣から関ヶ原へ動いた。東軍は物見でそれを知り、明くる朝の決戦へ（『慶長年中卜斎記』ほか）
    rt.after(26, () => rt.say('物見', '大垣の城から松明の列が西へ。この雨の中を、関ヶ原の方へ動いております', 3.6));
    F.k04s?.ending?.();   // 左近が追うのを止め、西軍の勝鬨 →「杭瀬川　東軍敗北」→ その夜の陣固め（k04_kuisegawa/haisen.js）
    rt.finish({ scriptedEnd: true }, 30);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.finish({ failureReason: why }, 6);
  },

  onPlayerHit(rt, target) {
    if (target.team !== 1 || target.isStruct || target.civ) return;
    if (rt.flags.step === 1 && rt.flags.gamo?.units.includes(target)) rt.flags.baitPlayerHit = true;
    if (rt.flags.step === 3 && dist(this.defensePoint(rt), rt.player.u.pos) < 24) {
      rt.flags.defended = true; rt.flags.defenseFightT = rt.t;
    }
  },

  onKill(rt, v) {
    // 六千対千三百は中村・有馬と島・明石の兵数。数に含めない岡山の旗本や民の死を引かない。
    // 近づいて実兵になった岡山の備も、元の軽い備から所属を確かめる。
    const hata = rt.flags.hata?.light, source = v?.wkFrom?.A;
    const okayama = rt.flags.ieyasu?.units.includes(v) || hata && source && (source === hata || source === hata.army);
    if (v && !v.isStruct && !v.civ && !okayama) {
      if (v.team === 0) rt.flags.deadA = (rt.flags.deadA || 0) + 1;
      else if (v.team === 1) rt.flags.deadB = (rt.flags.deadB || 0) + 1;
    }
    KIT.carrion?.(rt, v);
  },

  botEvacuating(b) { return (b.flags.step || 0) >= 4; },
  botGuardFlee(b) { return this.botEvacuating(b); },

  // bot：近い敵を突き、段の行き先へ。退く段は敵を振り切って走る
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step) return;
    const defense = F.step === 3 ? this.defensePoint(b) : null;
    // 防戦の旗から離れた敵を追い、近くにいた時間が増えなくなるのを防ぐ。
    // 刈田の兵を味方が先に討っても、蒲生の組へ一撃を入れて追撃を始められる。
    // 討たれない将を避ける共通の判断で、最初の目標だけが止まらないようにする。
    const ok = (o) => !o.fleeing && (!o.invuln || F.step === 1 && !F.baitPlayerHit && F.gamo?.units.includes(o)) && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3 &&
      (!defense || dist(o.pos, defense) < 14);
    // 11/10 クラウド：退く段で道を塞ぐ追手を払わず二十秒あまり立ち止まり、その間に手勢が討たれ尽くした。手の届く敵だけは払って進む
    const r = F.step >= 4 ? 2.5 : F.step === 3 ? 4 : F.step === 1 ? 7 : F.step === 2 && live(F.rearG) && b.t - F.rearT < 25 ? 8 : 0;   // ②は殿が残る二十五秒だけ斬る
    const e = r ? b.army.nearestEnemy(u, r, ok) : null;
    // 退き口では近い敵が入れ替わるたびに斬り合いを始めると、一歩も退けない。
    // 道を払うのは一秒半まで。その後は四秒、退路へ進む（直前の打撃への受けは共通の頭が行う）。
    let clear = true;
    if (F.step >= 4 && e) {
      if ((F.retreatRunUntil || 0) > b.t) clear = false;
      else if (F.retreatClearUntil === undefined) F.retreatClearUntil = b.t + 1.5;
      else if (b.t >= F.retreatClearUntil) {
        F.retreatClearUntil = undefined; F.retreatRunUntil = b.t + 4; clear = false;
      }
    }
    if (e && clear) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    let q;
    if (F.step === 1) q = lightPos(F.blk.bait);
    else if (F.step === 2) q = RING;
    else if (F.step === 3) q = defense;
    else if (F.step === 4) q = T(64, 4);
    else q = ARIMA;
    goTo(p, inp, q.x, q.z, 2);
  },

  // 頭上の▼と右上の一行を段の場所と行いにそろえる（「印へ進め」では何の印か分からない。AR1・AQ1）
  goalTargetOverride(rt) {
    const F = rt.flags, s = F.step || 1;
    if (F.ending) return null;
    // 始めの会話中も、すでに置いた刈田の行き先を隠さない。
    const q = s === 1 ? (F.blk?.bait ? lightPos(F.blk.bait) : BAIT) : s === 2 ? RING : s === 3 ? this.defensePoint(rt) : s === 4 ? T(64, 4) : ARIMA;
    const G = F._kTg || (F._kTg = { unit: null, boss: false });
    G.x = q.x; G.z = q.z;
    G.arrived = dist(rt.player.u.pos, q) < 6;   // 到着後も同じ場所を輪で示し、頭上へ▼を重ねない。
    G.action = ['', '刈田の兵を追え', '川を東へ渡れ', '頼母の横で防げ', '川を西へ渡れ', '有馬の陣へ急げ'][s];
    G.label = ['', '刈田の島左近の兵', '退く島左近の兵', '野一色頼母', '赤坂の側の岸', '有馬豊氏の陣'][s];
    return G;
  },
};

k04_kuisegawa.history = '慶長五年（1600）九月十四日、美濃の赤坂に着いた徳川家康の東軍の前に、大垣城の石田三成の西軍が出た。島左近と蒲生備中のおよそ五百が杭瀬川を渡り、東軍の目の前で刈田をして挑発し、追われると退くふりをした。中村一栄の隊が川を渡って追うと、葦の中に伏せていた宇喜多秀家の家臣・明石全登の隊と、引き返した左近の兵が打ち掛かり、中村の家老・野一色頼母は深田にはまって討たれた。有馬豊氏の隊が受けて東軍は退いた。兵は西軍 千三百・東軍 六千ともいう（数には諸説がある）。この小さな勝ちで西軍の士気は上がったが、翌十五日、決戦は関ヶ原で行われる。\n戦場の細かな位置は、川筋が変わったため定かでない。';
k04_kuisegawa.bushou = [{ name: '島左近', g: /島左近/ }, { name: '明石全登', g: /明石全登/ }];

// 右上の五段も同じ言葉にし、頼母の旗・杭瀬川・手勢の同行を省かない。
// 討ち取り数は達成条件ではない。数だけで先に✔を付けず、槍を入れる・
// 味方との渡河・防戦・兵を連れた帰還という実際の段の進行にそろえる。
STAGES.k04_kuisegawa = STEP_TEXT.map((text, i) => [text, i ? (rt) => (rt.flags.step || 0) >= i + 1 : null, undefined, false]);
KILLS.k04_kuisegawa = false;

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(k04_kuisegawa);

export { k04_kuisegawa };
export default k04_kuisegawa;

// 本人の命が六割半を切ったら・組が崩れたら・段が替わったら（off）放す
function huntPlayer(rt, F, dt, off = false) {
  if (!off && (F._huntT = (F._huntT || 0) - dt) > 0) return;
  F._huntT = 0.5;
  const P = rt.player.u;
  const on = !off && P?.alive && P.hp >= P.maxHp * 0.65;
  const c = F._huntC || (F._huntC = { x: 0, y: 0, z: 0 });
  const ok = (g) => {
    if (!on || g.routed || !g.count || g.order !== 'attack') return false;
    g.center(c);
    return Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 20;
  };
  // 11/18 21:50 UTC クラウド持ち主（描かずの数え：act bot 257秒で本人へ振りかぶった敵は38・届いた太刀は7つで全部受け止め、受けた傷0
  //   「ちょっと簡単すぎる」）：葦の伏兵の段（③）は本人を狙う組を二つまで（journey 1:40 三方から囲まれる恐怖）。①は一つのまま
  const max = F.step === 3 ? 2 : 1;
  const H = F._hunters || (F._hunters = []);
  for (let i = H.length - 1; i >= 0; i--) {
    const g = H[i];
    if (g.focus === P && ok(g) && i < max) continue;
    if (g.focus === P) { g.focus = null; g.focusMeFirst = false; for (const u of g.units) if (u.target === P) { u.target = null; u.aiT = 0; } }
    H.splice(i, 1);
  }
  F._hunter = H[0] || null;
  if (!on || H.length >= max) return;
  // 11/18 23:08 UTC クラウド持ち主（act bot 2257・2300「60人を無傷で討った」：狙う組が本人の横の味方へ先に打ち込み、一戦で本人へ届く太刀は0〜10）：
  //   ③の狙う組は本人が八歩内なら近い味方より本人へ打ち込む（田野と同じ g.focusMeFirst）
  for (const g of rt.army.groups) if (g.team === 1 && !g.focus && !g.isPlayerSquad && ok(g)) { g.focus = P; g.focusMeFirst = F.step === 3; H.push(g); F._hunter = H[0]; if (H.length >= max) return; }
}
