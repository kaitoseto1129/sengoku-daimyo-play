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
import { nobori, hasa } from './props.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { MEM_TIGHT } from './settings.js';
import { withGuard } from './toyo_bot.js';
import { fieldButai, fieldTick, routButai, lightPos } from './b_yasen.js';
import { butaiTick } from './butai.js';
import { addSite } from './map_sites.js';
import { setStages } from './b_k_help.js';
import { KILLS, cut } from './stages.js';
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
const IEYASU = T(205, -150);                    // 赤坂の岡山の家康の本陣（国土地理院の標高で岡山の頂に当たる）
const RIVER = [[46, -260], [41, -90], [44, 60], [48, 260]].map(([x, z]) => { const p = T(x, z); return [p.x, p.z]; });
const SC = MEM_TIGHT ? 20 : 12;                 // 塊の一人が史実の何人か
// 史実の兵数（調べ：西軍 千三百＝島・蒲生 五百＋明石 八百、東軍 六千＝中村 四千＋有馬 二千）
const HIST = { saki: 1500, naka: 2500, arima: 2000, bait: 200, shima: 300, akashi: 800, hata: 600 };   // hata は岡山の家康の旗本（戦わない。数に入れない）
const A0 = HIST.saki + HIST.naka + HIST.arima, B0 = HIST.bait + HIST.shima + HIST.akashi;
const STEP_TEXT = ['陣の前の田で刈田をする島左近の兵に槍を入れ、追い立てる', '退く島左近の兵を追い、杭瀬川を東へ渡る',
  '野一色頼母の旗の横に立ち、葦から出る明石全登の伏兵を食い止める', '手勢と味方を連れて杭瀬川を西へ渡り、赤坂の側へ退く', '赤坂の側の岸の有馬豊氏の陣まで逃げ込む'];
// 11/8 critic60（九3・五3）：両軍みな同じ黒い具足で、乱戦で敵味方が見分けられなかった。西軍（石田・宇喜多）は朱を帯びた茶の漆に（遊びの見分け。東軍は黒のまま）
const ARM = { tokugawa: 0x24221f, maru: 0x24221f, kuki: 0x22201e, ishida: 0x6b2e22, ukita: 0x5e3222 };
const WEST = new Set(['ishida', 'ukita']);
const NAKA = 'maru', ARIMA_MON = 'kuki';   // 中村（紋が確かでないので丸）・有馬（左三つ巴）

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
  resumeSteps: 5,   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを toStep(①〜5) を順に流して作り直す
  playerGearStep: 3,       // 中村の先手を率いる侍大将の装い。保存した位は変えない
  victoryTitle: '東軍、退却',
  victoryCaption: '西軍の勝利　有馬の陣へ生還',
  missionSingleLine: true,
  goalsAllRows: true,        // 一行表示でも五つの目標を最初から並べる。
  goalsVisibleRows: 5,
  stageGoalsOnly: true,      // 右上は①〜⑤の段だけ（「敵を何人討つ」で埋めない・一段目を落とさない。三1・九1）
  noFrontFill: true,         // 作り物の乱戦を足さない（AP の 9）
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,
  enemyTactics: false,       // 敵の動きはこの定義が決める（退くふり・伏兵）
  hideGuideSteps: true,
  noPlayerFoot: true,
  nearbyAllySignLimit: 0,
  foeMarks: true,
  enemyTriangleSigns: true,
  lightEnemyTriangleSigns: true,   // 軽い兵も近くでは一人ずつ所属を示す
  nobiki: true,              // 負け戦の退き口
  wakeRoom: 200,
  playerAtkMax: 3,
  playerTaken: 1,
  playerRegen: 0,          // 伏兵から退く戦では、追手との間が空いても命を自動回復させない
  closeCombatAssist: true,
  autoTargetCamera: true,
  steadyMeleeCamera: true,
  noWinCrane: true,
  compactIntro: true,
  keepMix: false,
  missions: STEP_TEXT,
  missionOf(rt) { return STEP_TEXT[Math.max(0, (rt.flags.step || 1) - 1)]; },
  introText: () => '関ヶ原の前の日。陣の目の前で刈田をする島左近の兵を追い、杭瀬川を越える。葦の原の伏兵から生きて岸へ戻れ。',
  minutes: 9,
  // 布陣図（docs/fujin/k04_kuisegawa.md）：西軍は大垣の側（西）、東軍は赤坂・岡山の側（東）。陣立ての表（docs/army_depth_howto.md）
  //   前の本物の隊は bind。明石全登の伏兵は「見せない」約束なので表に入れない。奥の備は軽い作り。各家の兵の分け方は推定。
  depth: (rt) => ({
    byMen: true,   // 布陣図どおりの兵数の比で軽い兵を配る（docs/fujin/k04_kuisegawa.md）
    A: { name: '東軍', facing: Y(-Math.PI / 2), honjin: IEYASU, mpu: 6, formation: '鶴翼', terrain: 'river', flag: 'tokugawa', armor: 0x24221f, openAt: 9999, attrition: 0,
      sonae: [
        { id: 'kazu', layer: 'sakite', wing: 'center', men: 1500, taisho: '中村一栄', flag: 'maru', bind: (r) => r.flags.kazu },
        { id: 'noi', layer: 'sakite', wing: 'left', men: 500, taisho: '野一色頼母', flag: 'maru', bind: (r) => r.flags.noi },
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
  sides: { a: { name: '東軍（中村・有馬）', mon: 'tokugawa' }, b: { name: '西軍（島・明石）', mon: 'ishida' } },
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
  world: {
    seed: 1600914,
    time: 'day',
    groundHalf: 260,
    battleViewDistance: 280,
    clearAir: true,          // 兵の描画距離の上限は保ち、岡山の本陣と葵の旗を晴れた遠景に残す
    mountainScale: 0.1, mountainHaze: 0.9,
    moveLim: 248,
    noFoeNear: true,         // 敵の後詰めを本人の近くへ寄せない（見せかけの軍勢で囲まない）
    autumn: true,
    patchyGround: true,
    noGroundRipples: true,
    height,
    waterSlow: true,
    hatDropRate: 0,          // 笠を落とさない：紋の付いた笠が足元に転がって首に見えた（11/8 critic60 四4）
    // 葦の原の手前の深田（頼母が足を取られた所）。畦で区切り、入ると遅くなる（terrain_tags の mud）
    paddy(x, z) {
      const l = L({ x, z });
      const start = l.x >= 52 && l.x <= 80 ? 52 : l.x >= -46 && l.x <= -4 ? -46 : null;
      if (start === null || Math.abs(l.z) > 34) return 0;
      return Math.abs(((l.x - start) % 14) - 7) > 6.2 || Math.abs(((l.z + 34) % 17) - 8.5) > 7.7 ? 0 : 1;
    },
    muddy: 0.25,
    streams: [{ pts: RIVER, w: 12, depth: 1.2 }],
    paths: [{ pts: [[185, -120], [150, -40], [106, 8], [52, 4]].map(([x, z]) => { const p = T(x, z); return [p.x, p.z]; }), w: 3 }],
    tint(x, z, h, c) {
      // 九月の刈田と葦。大垣の側ほど湿って暗い
      c.setRGB(c.r * 0.55 + 0.24, c.g * 0.5 + 0.2, c.b * 0.4 + 0.08);
      const l = L({ x, z });
      if (this.paddy(x, z) > 0) c.setRGB(0.22, 0.18, 0.10);
      if (l.x < -30 && Math.abs(l.z) < 70) c.setRGB(c.r * 0.8, c.g * 0.95, c.b * 0.7);
    },
    clear: (x, z) => { const l = L({ x, z }); return (l.x > -40 && l.x < 150 && Math.abs(l.z) < 60) || dist({ x, z }, IEYASU) < 18 || dist({ x, z }, ARIMA) < 14; },
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
    F.step = 0; F.holdPlayer = true; F.foes = []; F.ending = false; F.blk = {}; F.blocks = []; F.follow = [];
    this.fields(rt);
    this.reeds(rt);
    this.camps(rt);
    installHaisen(rt, F.k04s = {});
    const B = F.blk;
    // 東軍の塊：中村一栄の先手が川を渡り、中村の本手と有馬の隊は赤坂の側の岸に残る
    B.saki = this.block(rt, { key: 'saki', name: '中村一栄の先手', team: 0, flag: NAKA, at: T(80, -2), facing: Y(-Math.PI / 2), w: 30, d: 10 });
    B.naka = this.block(rt, { key: 'naka', name: '中村の本手', team: 0, flag: NAKA, at: T(126, 34), facing: Y(-Math.PI / 2), w: 32, d: 12 });
    B.arima = this.block(rt, { key: 'arima', name: '有馬豊氏の隊', team: 0, flag: ARIMA_MON, at: T(84, -26), facing: Y(-Math.PI / 2), w: 30, d: 10 });
    // 西軍の囮：刈田の島左近の兵（二百）
    B.bait = this.block(rt, { key: 'bait', name: '刈田の島左近の兵', team: 1, flag: 'ishida', at: BAIT, facing: Y(Math.PI / 2), w: 22, d: 6 });
    // 刈った稲を掛ける稲架（はさ）。九月十四日（今の十月二十日）は刈り入れの最中。俵はまだ田に出ない
    for (const [x, z] of [[56, -14], [70, -15], [56, 24], [70, 24]]) { const p = T(x, z); rt.scene.add(hasa(W, p.x, p.z, Y(0), 7)); }
    // 名のある将の本物の組（塊と一緒に動く）
    const ally = (o, list, mon = NAKA) => { const g = allyGroup(rt, { fullStrength: true, facing: Y(-Math.PI / 2), width: 5, aggro: 9, speed: 3.4, order: 'hold', noRout: true, ...o }, fl(list, mon)); g.mon = mon; return g; };
    F.kazu = ally({ name: '中村一栄の旗本', anchor: T(84, 2) }, [{ type: 'busho', n: 1, o: { name: '中村一栄', invuln: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }]);
    F.noi = ally({ name: '野一色頼母の組', anchor: T(76, -8) }, [{ type: 'busho', n: 1, o: { name: '野一色頼母', invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }]);
    F.noiU = F.noi.units.find((u) => u.type === 'busho');
    F.arimaG = ally({ name: '有馬豊氏の旗本', anchor: T(80, -26), aggro: 6, seekRange: 10 }, [{ type: 'busho', n: 1, o: { name: '有馬豊氏', invuln: true, horse: true } }, { type: 'samurai', n: 5 }, { type: 'gun', n: 6 }], ARIMA_MON);
    F.mine = ally({ name: '手勢', anchor: T(99, 13), width: 4, speed: 3.8, dmgMult: 0.9 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 13 }]);
    F.follow = [[F.kazu, B.saki, 4, 4], [F.noi, B.saki, -4, -4]];
    // 刈田の島の兵を率いる蒲生備中（本物）
    F.gamo = enemyGroup(rt, { faction: 'ishida', name: '蒲生備中の組', anchor: T(62, 4), facing: Y(Math.PI / 2), width: 5, formation: 'line', noRout: true,
      morale: 90, dmgMult: 0.8, order: 'hold', aggro: 8, seekRange: 12, speed: 3.2 },
    // 刈田は足軽が稲を刈る（侍が刀を持って突っ立つ形にしない。11/8 critic60 二1・二4）：侍は二人だけ、足軽十二人が田に屈む
    fl([{ type: 'busho', n: 1, o: { name: '蒲生備中', invuln: true, horse: true } }, { type: 'samurai', n: 2, o: { keep: true } }, { type: 'ashigaru', n: 12, o: { keep: true } }], 'ishida'));
    F.foes.push(F.gamo);
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
    for (const [left, cols, crop] of [[52, 2, true], [-46, 3, false]]) {
      for (let ix = 0; ix < cols; ix++) for (let iz = 0; iz < 4; iz++) {
        const x = left + ix * 14, z = -34 + iz * 17;
        if (!crop) mud.push(T(x + 7, z + 8.5));
        for (let dx = 1.4; crop && dx < 13; dx += 0.9) for (let dz = 1.4; dz < 16; dz += 0.9) {
          // 刈り跡と刈り残しを分け、田を黄金の穂で埋める。
          rows.push({ p: T(x + dx, z + dz), cut: ix === 0 && iz === 2 });
        }
      }
      for (let ix = 0; ix <= cols; ix++) for (let z = -34; z < 34; z += 2) banks.push({ p: T(left + ix * 14, z + 1), a: Y(0) });
      for (let iz = 0; iz <= 4; iz++) for (let x = left; x < left + cols * 14; x += 2) banks.push({ p: T(x + 1, -34 + iz * 17), a: Y(Math.PI / 2) });
    }
    const dummy = new THREE.Object3D();
    const rice = new THREE.InstancedMesh(plumeTuftGeo('paddy', true), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), rows.length);
    rows.forEach(({ p, cut }, i) => {
      dummy.position.set(p.x, W.heightAt(p.x, p.z), p.z); dummy.rotation.set(0, Y(0), 0);
      dummy.scale.set(1, cut ? 0.15 : 0.95, 1); dummy.updateMatrix(); rice.setMatrixAt(i, dummy.matrix);
    });
    rt.scene.add(rice);
    const berm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.3, 2.1), new THREE.MeshLambertMaterial({ color: 0x665332 }), banks.length);
    banks.forEach(({ p, a }, i) => {
      dummy.position.set(p.x, W.heightAt(p.x, p.z) + 0.08, p.z); dummy.rotation.set(0, a, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); berm.setMatrixAt(i, dummy.matrix);
    });
    rt.scene.add(berm);
    // 泥の面は細かく地面に沿わせ、斜面で浮いた板にならないようにする。
    const pos = [], indices = [];
    for (const center of mud) {
      const local = L(center), base = pos.length / 3;
      for (let iz = 0; iz <= 8; iz++) for (let ix = 0; ix <= 6; ix++) {
        const p = T(local.x - 6.2 + ix * 12.4 / 6, local.z - 7.7 + iz * 15.4 / 8);
        pos.push(p.x, W.heightAt(p.x, p.z) + 0.035, p.z);
      }
      for (let iz = 0; iz < 8; iz++) for (let ix = 0; ix < 6; ix++) {
        const a = base + iz * 7 + ix; indices.push(a, a + 7, a + 1, a + 1, a + 7, a + 8);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    rt.scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x342e20, roughness: 0.23 })));
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
    spots.forEach(([lx, lz, h], i) => {
      const p = T(lx, lz), wide = 1.5 + R() * 0.8;
      d.position.set(p.x, W.heightAt(p.x, p.z) - 0.05, p.z); d.rotation.set(0, R() * 6.28, 0); d.scale.set(wide, h, wide); d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    });
    mesh.frustumCulled = false; mesh.receiveShadow = true;
    rt.scene.add(mesh);
  },

  // 家康の本陣（赤坂の岡山）と有馬の陣（赤坂の側の岸）。どちらも本物の旗本がいる
  camps(rt) {
    const F = rt.flags, W = rt.world;
    KIT.honjin(rt, IEYASU.x, IEYASU.z, { mon: 'tokugawa', people: false, fire: true });
    addSite(rt, 'fort', IEYASU.x, IEYASU.z, '家康の本陣');
    F.ieyasu = allyGroup(rt, { name: '徳川家康の旗本', fullStrength: true, anchor: T(205, -146), facing: Y(-Math.PI * 0.75), width: 6, aggro: 4, seekRange: 8, order: 'hold', fixed: true, noRout: true },
      fl([{ type: 'busho', n: 1, o: { name: '徳川家康', invuln: true, horse: false } }, { type: 'samurai', n: 18 }, { type: 'gun', n: 4 }], 'tokugawa'));
    F.ieyasu.mon = 'tokugawa';
    F.ieyasuU = F.ieyasu.units.find((u) => u.name === '徳川家康');
    // 本陣の前を固める旗本の備（数百。岡山の一帯に東軍の陣があった。tabi-mag gi0027）。川へは出ない
    F.hata = this.block(rt, { key: 'hata', name: '徳川家康の旗本', team: 0, flag: 'tokugawa', at: T(186, -128), facing: Y(-Math.PI * 0.75), w: 26, d: 8 });
    if (F.ieyasuU) F.ieyasuU._crouch = true;   // 床几に腰を下ろす（総大将は本陣で座る）
    for (const [dx, dz] of [[-10, 8], [10, 8], [0, 14]]) rt.scene.add(nobori(W, IEYASU.x + dx, IEYASU.z + dz, 'tokugawa', 7));
    // 有馬の陣の幕と幟は有馬家の左三つ巴。徳川の金扇の馬印は家康の本陣だけ（外様の陣に立てない・11/6）
    KIT.honjin(rt, T(88, -30).x, T(88, -30).z, { mon: ARIMA_MON, people: false, fire: true, yoroi: false, uma: false, hyoro: false });   // 刈田の野の陣に俵は積まない（11/8 critic60 二1）
    addSite(rt, 'fort', ARIMA.x, ARIMA.z, '有馬豊氏の陣');
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
    F.blocks.push(b);
    return b;
  },
  go(b, to, speed = 1.6, opt = {}) {
    if (!b || !b.light || b.routedL) return;
    const p = lightPos(b), d = Math.hypot(to.x - p.x, to.z - p.z);
    b.light.moveTo(to.x, to.z, Math.max(0.5, d / speed), opt);
    b.cmd = { id: opt.charge ? 'charge' : 'move', to, target: null, form: 'line' };
  },

  toStep(rt, n) {
    const F = rt.flags, B = F.blk;
    if (F.step >= n) return;
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
      if (live(F.arimaG)) { F.arimaG.order = 'move'; F.arimaG.dest = T(70, -16); }
      F.baitN0 = B.bait.aliveNominal();
    } else if (n === 2) {
      rt.marker('go', RING, '退く島左近の兵');
      // 先手の実兵も主人公と渡る。遠い備だけを追わせない
      F.follow = F.follow.filter(([g]) => g !== F.noi && g !== F.kazu);
      for (const g of [F.noi, F.kazu]) { g.order = 'move'; g.dest = RING; g.speed = 4.8; }
    } else if (n === 3) {
      this.ambush(rt);
      rt.marker('noi', () => (F.noiU?.alive ? { x: F.noiU.pos.x, z: F.noiU.pos.z } : null), '野一色頼母');
    } else if (n === 4) {
      // 囮の実兵は隊列合わせを終え、退く先手を追う。追撃の下知を hold で上書きしない。
      F.follow = F.follow.filter(([g]) => g !== F.gamo);
      rt.marker('ford', T(64, 4), '杭瀬川の赤坂の側の岸');
      sfx('horagai', 0.8);
      // 史実：岡山で見ていた家康が兵を引かせた（内府＝内大臣。大御所は後の呼び名）
      rt.after(2.5, () => rt.say('使番', '岡山より下知。深追い無用、杭瀬川を越えて引けとの内府様の仰せ', 3.2));
      for (const b of [B.shima, B.akashi, B.bait]) this.go(b, T(20, b === B.akashi ? 14 : -10), 2.2, { charge: true });
    } else if (n === 5) {
      rt.marker('camp', ARIMA, '有馬豊氏の陣');
      rt.say('有馬豊氏', '中村の者を通せ！　鉄砲、川へ向けて構えよ', 3);
      this.go(B.arima, T(62, -8), 1.8);
      if (live(F.arimaG)) { F.arimaG.order = 'move'; F.arimaG.dest = T(64, -12); }
      rt.after(3, () => rt.army.play('volley', T(40, -6), 1.2));
    }
  },

  // 囮が退くふり：刈田の兵が葦の原の方へ退き、中村の先手が追う
  feign(rt) {
    const F = rt.flags, B = F.blk;
    if (F.feigned) return;
    F.feigned = true; F.feignT = rt.t;
    for (const u of F.gamo?.units || []) u._crouch = false;
    this.go(B.bait, T(-48, -4), 3, { back: true });   // 杭瀬川を東へ越えて葦の原の方へ
    rt.say('野一色頼母', '逃げるぞ。川を越えて追え、首を取れ！', 3);
    rt.after(3.2, () => rt.say('有馬豊氏', '深追いするな！　川の向こうは葦の原じゃ', 3));
    this.go(B.saki, T(-14, 0), 2.8, { charge: true });
    this.toStep(rt, 2);
  },

  // 伏兵：葦から明石全登、林の陰から左近の本隊。刈田の兵も向き直る
  ambush(rt) {
    const F = rt.flags, B = F.blk;
    // 渡河の移動下知を残さず、頼母と中村の組もその場で伏兵を迎え撃つ。
    // 旗の横で防ぐ間に、古い行き先へ隊の要だけが進み続けないようにする。
    for (const g of [F.noi, F.kazu]) if (live(g)) {
      const c = g.center();
      g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.dest = null; g.seekRange = 14;
    }
    // 囮も向き直って戦う。備への隊列合わせで攻撃を待機に戻さない。
    F.follow = F.follow.filter(([g]) => g !== F.gamo);
    F.gamo.order = 'attack'; F.gamo.seekRange = 30;
    rt.unmark('go');
    B.akashi = this.block(rt, { key: 'akashi', name: '明石全登の伏兵', team: 1, flag: 'ukita', at: AKASHI_HIDE, facing: Y(-0.6), w: 36, d: 12 });
    B.shima = this.block(rt, { key: 'shima', name: '島左近の本隊', team: 1, flag: 'ishida', at: SHIMA_HIDE, facing: Y(Math.PI - 0.6), w: 26, d: 10 });
    this.go(B.akashi, T(-24, 22), 2.4, { charge: true });
    this.go(B.shima, T(-22, -16), 2.4, { charge: true });
    this.go(B.bait, T(-36, 2), 2.2, { charge: true });
    // 葦の縁に膝をつく明石の鉄砲衆（本物）。先手の横腹を撃つ
    const guns = enemyGroup(rt, { faction: 'ukita', name: '明石全登の鉄砲衆', anchor: T(-26, 26), facing: Y(-0.4), width: 8, formation: 'line', noRout: true,
      morale: 90, dmgMult: 0.8, order: 'hold', aggro: 10, seekRange: 40, speed: 2.6 },
    fl([{ type: 'gun', n: 14 }, { type: 'samurai', n: 1 }], 'ukita'));   // もっと鉄砲を（BK の 3）
    F.guns = guns;
    F.foes.push(guns);
    // 明石全登と左近（本物の旗本に囲まれる。討てない。翌日の関ヶ原に出る）
    F.akashiG = enemyGroup(rt, { faction: 'ukita', name: '明石全登の旗本', anchor: { ...AKASHI_HIDE }, facing: Y(-0.6), width: 6, formation: 'line', noRout: true,
      morale: 100, dmgMult: 0.5, order: 'hold', aggro: 6, seekRange: 10, speed: 2.6 },
    fl([{ type: 'busho', n: 1, o: { name: '明石全登', invuln: true, horse: true } }, { type: 'samurai', n: 10, o: { keep: true } }, { type: 'ashigaru', n: 4, o: { keep: true } }], 'ukita'));
    F.shimaG = enemyGroup(rt, { faction: 'ishida', name: '島左近の旗本', anchor: { ...SHIMA_HIDE }, facing: Y(Math.PI - 0.6), width: 6, formation: 'line', noRout: true,
      morale: 100, dmgMult: 0.5, order: 'hold', aggro: 6, seekRange: 10, speed: 2.6 },
    fl([{ type: 'busho', n: 1, o: { name: '島左近', invuln: true, horse: true } }, { type: 'samurai', n: 10, o: { keep: true } }, { type: 'ashigaru', n: 4, o: { keep: true } }], 'ishida'));
    for (const g of [F.akashiG, F.shimaG]) { g.kind = 'main'; F.foes.push(g); }
    F.follow.push([F.akashiG, B.akashi, 0, 0], [F.shimaG, B.shima, 0, 0]);
    if (B.saki) B.saki.morale = Math.min(B.saki.morale, 48);
    rt.army.play('toki', AKASHI_HIDE, 1.5); rt.after(0.4, () => rt.army.play('toki', SHIMA_HIDE, 1.5));
    rt.after(0.8, () => rt.army.play('volley', T(-22, 16), 1.3));
    sfx('taiko', 1);
    rt.say('野一色頼母', '葦の中に鉄砲じゃ！　伏せておったか', 3);
    rt.after(4, () => rt.say('島左近', '釣れたわ。返せ、一人も川へ戻すな', 3));
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
    for (const g of [F.noi, F.kazu]) if (live(g)) { g.order = 'move'; g.dest = T(90, -12); g.speed = 4; }
    rt.after(4, () => this.toStep(rt, 4));
  },

  update(rt, dt) {
    const F = rt.flags, B = F.blk;
    if (F.ending || !F.step) return;
    const P = rt.player.u, PL = L(P.pos);
    butaiTick(rt, dt);
    // 刈田の段は先手と刈田の兵の小競り合いだけ（囮が数で押されて先に崩れ、退くふりの前に川を越えて逃げないように）
    if (F.step <= 2) fieldTick(rt, dt, { list: F.blocks.filter((b) => b !== B.arima), reach: 40, k: 0.004, routAt: 0 });
    // 史実の杭瀬川は討死数十人の小競り合い（東軍が千余り減る大敗に見えた。11/8 critic60 十二1・二1）。塊どうしの削り合いは浅く
    else fieldTick(rt, dt, { list: F.blocks, reach: 40, k: F.step === 3 ? 0.006 : 0.004 });
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      const g = F.mine;
      if (live(g)) {
        const c = g.center();
        // 敵に組みつかれている間は歩き続けず斬り返す（主人公を追って歩くまま討たれ、手勢が全滅していた。三巡 11/9 豊臣A）
        const lead = g.units.find((u) => u.alive && !u.gone);
        // 退却の下知の後は追手との斬り合いで足を止めず、主人公と岸へ退く。
        const engaged = F.step < 4 && lead && dist(c, P.pos) < 24 && rt.army.nearestEnemy(lead, 5, (q) => !q.isStruct && !q.civ);
        if (engaged) { g.order = 'attack'; g.seekRange = 8; }
        else if (dist(c, P.pos) > 7 || F.step >= 4) {
          // 岸の向きは回してある。地図の正方向へずらすと手勢だけ川へ戻ってしまう。
          g.order = 'move'; g.dest = T(PL.x + (F.step >= 4 ? 3 : -2), PL.z + 2); g.speed = 4.2;
        }
        else { g.order = 'attack'; g.seekRange = 12; }
      }
      for (const [g, b, dx, dz] of F.follow) {
        if (!live(g) || !b || b.routedL || g.chaseStopped) continue;
        // 備の前後左右は布陣と同じ向きへ回す。地図の軸へ足すと頼母が先手の反対側へ付く。
        const p = lightPos(b), to = { x: p.x + ROT_C * dx - ROT_S * dz, z: p.z + ROT_S * dx + ROT_C * dz };
        if (dist(g.center(), to) > 6) { g.order = 'move'; g.dest = to; g.speed = g.team ? 2.6 : 3.4; }
        else { g.order = g.team ? 'hold' : 'attack'; g.anchor = to; g.seekRange = g.team ? 10 : 14; }
      }
    }
    // 防戦の長さは実際の経過秒で数える。間引いた判定の回数で数えると、
    // 携帯でコマが遅れた時だけ百三十秒の防戦が長引いてしまう。
    if (F.step === 3 && F.defended && F.noiU?.alive && dist(F.noiU.pos, P.pos) < 12) F.nearT = (F.nearT || 0) + dt;
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    const menRemain = F.mine.units.some(canReturn) || (rt.squad || []).some(canReturn);
    if (F.step >= 2 && !menRemain) { this.lose(rt, '連れた兵が全員討死・戦線離脱した'); return; }
    const el = rt.t - F.stepT;
    if (F.step === 1) {
      // 刈田の足軽は、槍が迫ると稲を捨てて立ち上がる
      if (!F.stood && (dist(lightPos(B.bait), P.pos) < 24 || live(F.kazu) && dist(F.kazu.center(), lightPos(B.bait)) < 18 || el > 14)) { F.stood = true; for (const u of F.gamo?.units || []) u._crouch = false; }
      const hurt = B.bait && B.bait.aliveNominal() < F.baitN0 * 0.8;
      if (F.baitPlayerHit && el > 65 && (hurt || dist(lightPos(B.bait), P.pos) < 20)) this.feign(rt);   // 少し戦ってから退くふり（史実）
    } else if (F.step === 2) {
      // 退く島の兵を追い、先手と一緒に川を東へ渡ってから伏兵が出る
      if (el > 35 && PL.x < -6 && L(lightPos(B.saki)).x < 10 && live(F.noi) && dist(F.noi.center(), P.pos) < 18) this.toStep(rt, 3);
    } else if (F.step === 3) {
      for (const g of rt.army.groups) if (g.team === 1 && g.count && g.order === 'hold' && g.kind !== 'main' && g !== F.guns && !g.interiorHold && !g.units.every((u) => u.type === 'gun')) { g.order = 'attack'; g.seekRange = 30; g.aggro = 14; g.noRout = true; }
      // 防戦を始める前の待機時間を、後の一撃で達成扱いにしない。
      // 待つだけでは防戦を果たさない。頼母の横で敵を打つか、打撃を受け止める。
      if (F.noiU?.alive && dist(F.noiU.pos, P.pos) < 12 && rt.player.lastHit?.blocked && rt.player.lastHit.t >= F.stepT && rt.t - rt.player.lastHit.t <= 0.5) F.defended = true;
      if (F.defended && F.nearT > 130 && el > 130) this.closeRing(rt);   // 渡河・防戦・退却を合わせ四分以上遊ぶ
    // 川幅は中心線から両側十二。水中の x=52 で渡り終えた扱いにしない。
    } else if (F.step === 4 && PL.x > 60) this.toStep(rt, 5);
    else if (F.step === 5 && dist(P.pos, ARIMA) < 14 && this.returnedMen(rt) > 0) this.win(rt);
    // 退く段：西軍は川まで追うが渡らない（史実：有馬の隊が岸で受け、西軍は大垣へ引いた）。近い追手は人の走りより少し遅い
    if (F.step >= 4) {
      if ((F.chaseT = (F.chaseT || 0) - 0.25) <= 0) {
        F.chaseT = 2;
        const to = T(Math.min(PL.x, 30), PL.z);
        for (const b of [B.shima, B.akashi, B.bait]) if (b && !b.routedL && dist(lightPos(b), P.pos) > 30) this.go(b, to, 2.2, { charge: true });
      }
      for (const g of rt.army.groups) if (g.team === 1 && g.count && g !== F.guns && !g.interiorHold) {
        // 実兵の攻撃先も川の手前で止める。備だけを止めても、実兵は対岸の味方を追い続けていた。
        const c = g.center(), l = L(c);
        if (g.chaseStopped || l.x >= 28) {
          g.chaseStopped = true; g.seekRange = 0; g.aggro = 0;
          if (l.x > 30) { g.order = 'move'; g.dest = T(28, l.z); }
          else { g.order = 'hold'; g.anchor = c; }
          continue;
        }
        // 左近・明石の旗本は備に従うが、川岸での停止は他の追手と同じ。
        if (g.kind === 'main') continue;
        if (g.chaseSoft) continue;
        // 退却だけを理由に打撃を弱めず、追手は人の走りに近い速さで背へ迫る。
        g.chaseSoft = true; g.speed = 3;
        if (g.order === 'hold') { g.order = 'attack'; g.seekRange = 40; g.aggro = 12; }
      }
      // 退き口へ入っただけでは傷を回復させない。
      // 背の葦と川べりから西軍の鉄砲が撃ちかける（煙と音。川を渡り切るまで）
      if (PL.x <= 60 && (F.backFireT = (F.backFireT ?? 3) - 0.25) <= 0) { F.backFireT = 5 + Math.random() * 3; const q = T(Math.min(PL.x, 30) - 16, PL.z + (Math.random() - 0.5) * 14); rt.army.play('volley', q, 1.1); }
    }
  },

  // 生き残っていても川の向こうに残った兵は、生還した人数に含めない。
  returnedMen(rt) {
    let n = 0;
    const mine = rt.flags.mine?.units || [], squad = rt.squad || [];
    // 陣の二十m内には川の縁も入る。主人公と同じく赤坂の岸へ渡り切った兵だけを数える。
    for (const u of mine) if (canReturn(u) && !u.downed && L(u.pos).x > 60 && dist(u.pos, ARIMA) < 20) n++;
    for (const u of squad) if (!mine.includes(u) && canReturn(u) && !u.downed && L(u.pos).x > 60 && dist(u.pos, ARIMA) < 20) n++;
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
    F.k04s?.ending?.();   // 左近が追うのを止め、西軍の勝鬨 →「杭瀬川　東軍敗北」→ その夜の陣固め（k04_kuisegawa/haisen.js）
    rt.finish({ scriptedEnd: true }, 26);
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
    if (rt.flags.step === 3 && rt.flags.noiU?.alive && dist(rt.flags.noiU.pos, rt.player.u.pos) < 12) rt.flags.defended = true;
  },

  onKill(rt, v) {
    if (v && !v.isStruct) { if (v.team === 0) rt.flags.deadA = (rt.flags.deadA || 0) + 1; else if (v.team === 1) rt.flags.deadB = (rt.flags.deadB || 0) + 1; }
    KIT.carrion?.(rt, v);
  },

  botEvacuating(b) { return (b.flags.step || 0) >= 4; },

  // bot：近い敵を突き、段の行き先へ。退く段は敵を振り切って走る
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const r = F.step >= 4 ? 0 : F.step === 3 ? 4 : F.step === 1 ? 7 : 0;
    const e = r ? b.army.nearestEnemy(u, r, ok) : null;
    if (e) {
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
    else if (F.step === 3) q = F.noiU?.alive ? F.noiU.pos : RING;
    else if (F.step === 4) q = T(64, 4);
    else q = ARIMA;
    goTo(p, inp, q.x, q.z, 2);
  },

  // 頭上の▼と右上の一行を段の場所と行いにそろえる（「印へ進め」では何の印か分からない。AR1・AQ1）
  goalTargetOverride(rt) {
    const F = rt.flags, s = F.step || 1;
    if (F.ending) return null;
    // 始めの会話中も、すでに置いた刈田の行き先を隠さない。
    const q = s === 1 ? (F.blk?.bait ? lightPos(F.blk.bait) : BAIT) : s === 2 ? RING : s === 3 ? (F.noiU?.alive ? F.noiU.pos : RING) : s === 4 ? T(64, 4) : ARIMA;
    const G = F._kTg || (F._kTg = { unit: null, boss: false });
    G.x = q.x; G.z = q.z;
    G.action = ['', '刈田の兵を追え', '川を東へ渡れ', '頼母の横で防げ', '川を西へ渡れ', '有馬の陣へ急げ'][s];
    G.label = ['', '刈田の島左近の兵', '退く島左近の兵', '野一色頼母', '赤坂の側の岸', '有馬豊氏の陣'][s];
    return G;
  },
};

k04_kuisegawa.history = '慶長五年（1600）九月十四日、美濃の赤坂に着いた徳川家康の東軍の前に、大垣城の石田三成の西軍が出た。島左近と蒲生備中のおよそ五百が杭瀬川を渡り、東軍の目の前で刈田をして挑発し、追われると退くふりをした。中村一栄の隊が川を渡って追うと、葦の中に伏せていた宇喜多秀家の家臣・明石全登の隊と、引き返した左近の兵が打ち掛かり、中村の家老・野一色頼母は深田にはまって討たれた。有馬豊氏の隊が受けて東軍は退いた。兵は西軍 千三百・東軍 六千ともいう（数には諸説がある）。この小さな勝ちで西軍の士気は上がったが、翌十五日、決戦は関ヶ原で行われる。\n戦場の細かな位置は、川筋が変わったため定かでない。';
k04_kuisegawa.bushou = [{ name: '島左近', g: /島左近/ }, { name: '明石全登', g: /明石全登/ }];

setStages('k04_kuisegawa', [['刈田の島の兵を追い立てる', 0], ['退く島の兵を追って川を東へ渡る', 2], ['葦の伏兵を食い止める', 3], ['川を西へ渡って退く', 4], ['有馬豊氏の陣へ逃げ込む', 5]]);
// 倒す数（kaito 11/2 O・AV16）：一段目は刈田の兵（史実の二百）のうち、退くふりを始めさせるまでの数（二割）
KILLS.k04_kuisegawa = (rt) => {
  const F = rt.flags, b = F.blk?.bait;
  if (F.ending || F.step !== 1 || F.feigned || !b || !F.baitN0) return null;
  return cut(Math.round(F.baitN0 * SC), Math.round(b.aliveNominal() * SC), Math.round(F.baitN0 * SC * 0.8));
};

// bot は打ち込みを見て構えてから、この戦の頭へ（toyo_bot.js）
withGuard(k04_kuisegawa);

export { k04_kuisegawa };
export default k04_kuisegawa;
