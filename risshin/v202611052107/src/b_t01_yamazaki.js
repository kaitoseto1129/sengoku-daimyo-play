// ======================================================================
// 豊臣編 1. 山崎の戦い（docs/chapter2_toyotomi.md の「1. 山崎の戦い」。調べは docs/battle_refs/t01_yamazaki.md）
// 天正十年（1582）六月十三日の午後四時ごろ。天王山と淀川の間の狭い野、円明寺川。主人公は池田恒興の手の侍大将。
// 目標（場所と行い。kaito AQ1・AR1・AW3・AW7）：
//   ①高山右近の陣の右で、川を渡って来た斎藤勢を押し返す（中央が押される）
//   ②東の浅瀬で、池田勢と円明寺川を渡る（明智の右手が空いている）
//   ③淀川沿いの津田信春の隊を討ち破る
//   ④西へ回り、斎藤利三の隊を横から突き破る（中川・高山・堀も前から押す）
//   ⑤御坊塚の前で、殿の御牧兼顕の隊を討ち破る（その間に光秀は旗本と勝竜寺城へ退く。最期は戦の後の知らせ）
//   開戦は伊勢貞興が中川の隊へ襲いかかり、堀秀政が後詰に着く（docs/battle_learn/t01_yamazaki.md 四）
// 負け：前の中川・高山の隊が二つとも崩れる。時の制限は目標ごと（goals5.js）。
// 見せかけの大軍・軽い乱戦は置かない（AA・AF・AQ6）。兵は全部本物で、両軍の比はおよそ五対二（四万対一万六千）。
// 総大将（秀吉・光秀）は後ろの本陣で旗本に囲まれ、前に出ない・討てない（AR3・AT3）。
// 地形：国土地理院の標高（asset_dem_yamazaki.js・dem.mjs の yamazaki）。ゲームの 1 を実の 6m に縮め、
//   西の天王山の裾だけ高さを残す。円明寺川と淀川は遊び用の復元（川筋・浅瀬の位置は推定）。
// 座標：南が +z（羽柴勢）、北が −z（明智勢）、西が −x（天王山）、東が +x（淀川）。
// ======================================================================
import { useTerrain } from './asset_manifest.js';
import { demSample } from './dem.js';
import { enemyGroup, allyGroup, nm } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { nobori, palisade, yagura, kabukimon } from './props.js';
import { withGuard } from './toyo_bot.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { revealName } from './battle_intel.js';

let dem = null;
useTerrain('dem_yamazaki', (data) => { dem = data; });
const DEM_XY = 6, OX = -110, OZ = 300;   // ゲームの (x, z) → 実の (x·6−110, z·6+300) m（中心は円明寺川の下流の南）
const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.045 + 0.7) * Math.cos(z * 0.037);
  if (dem) h += Math.max(0, demSample(dem, x * DEM_XY + OX, z * DEM_XY + OZ) - 8) * 0.32;
  // 御坊塚：古墳を曲輪にした光秀の本陣（恵解山古墳の説。長い塚と周りの空堀）
  const e = Math.hypot((x - MOUND.x) / 13, (z - MOUND.z) / 19);
  h += 3.4 * (1 - sstep(0.62, 1, e)) - 1.1 * sstep(1.02, 1.12, e) * (1 - sstep(1.22, 1.34, e));
  // 勝竜寺城の土塁（西と北の高い土手。前の柵の後ろ）
  if (x > 26 && x < 102 && z < -188 && z > -204) h += 2.6 * sstep(26, 32, x) * (1 - sstep(96, 102, x)) * sstep(-188, -191, z) * (1 - sstep(-201, -204, z));
  return h;
}
// 淀川寄りの沼と湿田（大軍がまとまって動けない。池田勢は淀川の岸の際を通った）
function marsh(x, z) {
  if (x < 74 || z < -100 || z > 150) return 0;
  const k = sstep(74, 86, x) * (1 - sstep(102, 106, x)) * sstep(-100, -88, z) * (1 - sstep(138, 150, z));
  return k * (0.75 + 0.25 * Math.sin(x * 0.21 + z * 0.13) * Math.cos(z * 0.17));
}

const AK = { flag: 'akechi', armor: 0x2c2a27 };
const HA = 'toyotomi', IK = 'ageha', HO = 'hori', KU = 'kuroda';
// 円明寺川（西の天王山の裾から東の淀川へ）。浅瀬は中ほど（斎藤勢が渡る）と東の淀川沿い（池田勢が渡る）
const ENMYOJI = [[-125, -34], [-90, -26], [-50, -16], [0, -8], [50, -2], [102, 4]];
const YODO = [[118, -220], [110, -60], [104, 60], [98, 220]];
const START = { x: -6, z: 54 };
const HOLD = { x: -20, z: 14 };           // 高山右近の陣の右（中ほどの浅瀬の南）
const FORD_S = { x: 62, z: 14 };          // 東の浅瀬の南の岸
const FORD_N = { x: 64, z: -16 };         // 渡った北の岸
const TSUDA = { x: 70, z: -50 };          // 津田信春の隊（明智の右手・淀川側）
const SAITO = { x: -4, z: -36 };          // 斎藤利三の隊（中ほど。南を向く）
const ISE = { x: 14, z: -104 };           // 伊勢貞興の隊（明智の二陣。御坊塚の前）
const GOBO = { x: 18, z: -140 };          // 御坊塚の光秀の本陣の前
const GOBO_PIN = { x: 16, z: -96 };       // ⑤の行き先（御坊塚の前。殿の御牧の隊がここへ突きかかる。動かさない）
const HONJIN_A = { x: 18, z: -158 };      // 光秀の床几（陣幕の中）
const SHORYUJI = { x: 64, z: -186 };      // 勝竜寺城の前（光秀の退く先）
const HIDE = { x: -34, z: 138 };          // 秀吉の本陣（南の後ろ）
const MOUND = { x: 18, z: -164 };         // 御坊塚の古墳の真ん中
// 携帯の横（844）で一行に収まる長さに（目標の札が右へはみ出さない）。「崩す」は使わない（kaito 三1）。途中で言い替えない（十1）
const TEXT = ['',
  '高山の陣の右で斎藤勢を押し返す',
  '東の浅瀬で円明寺川を渡る',
  '淀川沿いの津田信春の隊を討ち破る',
  '斎藤利三の隊を横から突き破る',
  '御坊塚の前で御牧兼顕の殿を討ち破る'];
const NUM = '①②③④⑤';
// 段の変わり目に画面の真ん中へ出す一行（AT7：何をするか）
const CUE = ['', '', '池田勢と東の浅瀬へ', '淀川沿いの津田の隊へ', '西の斎藤の隊の横へ', '御坊塚の前の御牧の殿へ'];
const NOUN = ['', '斎藤勢', '東の浅瀬', '津田信春の隊', '斎藤利三の隊', '御牧兼顕の殿'];
// 目標に名を挙げた敵将と、陣の分かっている将は伏せない（右上が「見えぬ敵の陣を物見する」に化けない）
const KNOWN = ['斎藤利三', '津田信春', '御牧兼顕', '伊勢貞興', '松田政近', '並河易家', '明智光秀', '柴田源左衛門', '溝尾茂朝'];
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

const live = (g) => g && g.units.some((u) => u.alive && !u.gone);
const aliveN = (gs) => [].concat(gs || []).reduce((n, g) => n + (g ? g.units.reduce((m, u) => m + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0) : 0), 0);
const allN = (gs) => [].concat(gs || []).reduce((n, g) => n + (g ? g.units.length : 0), 0);
const broken = (g) => !g || g.routed || aliveN(g) < 4;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 旗と胴の紋（mon）はその家の物だけ（AQ4・AV5。家の表に無い旗は、紋が織田の木瓜に戻るので mon も渡す）
const fl = (list, flag) => list.map((s) => ({ ...s, o: { flag, mon: (s.o && s.o.flag) || flag, ...(s.o || {}) } }));
const ak = (list) => list.map((s) => ({ ...s, o: { flag: AK.flag, mon: AK.flag, armor: AK.armor, ...(s.o || {}) } }));
// 一つの備（槍・鉄砲・弓・侍の割合。kaito の兵の割合に寄せる）
const knot = (n, extra = []) => [...extra, { type: 'ashigaru', n: Math.ceil(n * 0.55), o: { flagScale: 1 } }, { type: 'gun', n: Math.max(1, Math.round(n * 0.18)) },
  { type: 'bow', n: Math.max(1, Math.round(n * 0.08)) }, { type: 'samurai', n: Math.max(1, Math.round(n * 0.19)) }];
// 円明寺川の筋の z（x で引く）。川を越えたかを見る
function riverZ(x) {
  const L = ENMYOJI;
  if (x <= L[0][0]) return L[0][1];
  for (let i = 1; i < L.length; i++) if (x <= L[i][0]) { const [x0, z0] = L[i - 1], [x1, z1] = L[i]; return z0 + (z1 - z0) * (x - x0) / (x1 - x0); }
  return L[L.length - 1][1];
}

// 勝竜寺城の前（光秀の退く先）：柵・冠木門・櫓・幟。当たりは柵
function shoryujiFront(rt) {
  const W = rt.world, x = SHORYUJI.x, z = SHORYUJI.z;
  rt.scene.add(kabukimon(W, x, z, 6, 0));
  rt.scene.add(palisade(W, [x - 30, z, x - 4, z], { solid: true }));
  rt.scene.add(palisade(W, [x + 4, z, x + 30, z], { solid: true }));
  rt.scene.add(yagura(W, x - 18, z - 7, { mon: 'akechi', team: 1 }));
  rt.scene.add(yagura(W, x + 18, z - 7, { mon: 'akechi', team: 1 }));
}
// 本陣の旗本（陣幕の中と前）。動かず、前に出ない。大将は討てない
function honjinGuard(rt, team, at, facing, name, lead, flag, n) {
  const mk = team ? enemyGroup : allyGroup;
  const g = mk(rt, { name, anchor: { ...at }, facing, width: 10, formation: 'line', aggro: 4, seekRange: 8, order: 'hold', fixed: true, noRout: true, morale: 99, ...(team ? { faction: 'akechi' } : { fullStrength: true }) },
    (team ? ak : (l) => fl(l, flag))([{ type: 'busho', n: 1, o: { name: lead, invuln: true, horse: false } }, { type: 'samurai', n: Math.round(n * 0.45), o: { keep: true } },
      { type: 'ashigaru', n: Math.round(n * 0.35), o: { flagScale: 1, keep: true } }, { type: 'gun', n: Math.round(n * 0.2), o: { keep: true } }]));
  g.honjin = true;
  g.stay = true;   // 敵の采配（ai.js）や目標の敵寄せ（goal_foe.js）に前へ呼ばれない（光秀が最前へ歩いて来ていた）
  for (const u of g.units) { u.invuln = true; u.noTarget = true; }
  return g;
}

const t01_yamazaki = {
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  prelude: 4,
  compactIntro: true,
  introText: () => '雨の夕方。天王山の麓、円明寺川の向こうに明智の桔梗の旗が並ぶ。',
  // 始まりの札は戦の名・年・味方対敵（数）・二三行だけ（kaito 五4・十二1）
  introSides: { a: '羽柴 四万', b: '明智 一万六千' },
  introPeople: [],
  // 右上は今の目標を番号付きで（「味方の旗へ」「見えぬ敵の陣を物見する」に替えない。kaito 三1・十1）
  missionHeading: (rt) => { const n = Math.min(5, Math.max(1, rt.flags.stage || 1)); return NUM[n - 1] + TEXT[n]; },
  // 倒れた札に案内の字（「味方のそばで戦おう」）を添えない（kaito 五1）
  retryAdvice: () => ' ',
  missionSingleLine: true,
  hideGuideSteps: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  noFrontFill: true,
  goalSignOnly: true,         // 行き先は頭上の金の▼一つだけ（持ち場の旗・輪・地面の矢印を重ねない）
  noLeaderFollow: true,
  noHatamotoMass: true,       // 将の後ろの軽い作りの備も置かない（近づける所に見せかけの兵を置かない。AA・AF）       // 印は行き先の一つだけ（青い『ついていく相手』の印を出さない。AL・AV15）          // 作り物の乱戦を足さない（AA・AR7）
  frontlineDensity: false,    // 小勢を足さない（本物の兵の枠を段の備に残す）
  alwaysMelee: false,
  foeMarks: true,
  closeCombatAssist: true,
  noWinCrane: true,
  playerTaken: 0.3,           // 羽柴が二倍以上の戦。主人公だけが十秒で倒れない（kaito 十二3）
  sides: { a: { name: '羽柴勢', mon: HA }, b: { name: '明智勢', mon: 'akechi', faction: 'akechi' } },
  date: () => '天正十年（1582）六月十三日　申の刻',
  history: '本能寺の変の十一日後、備中高松から大返しの羽柴勢およそ四万が、明智勢およそ一万六千と天王山と淀川の間の狭い野でぶつかった。雨の夕方、伊勢貞興が中川清秀の隊に襲いかかって戦が始まり、斎藤利三も円明寺川を渡って高山右近の隊を押した。堀秀政が後詰に着いて支え、天王山の手では羽柴秀長・黒田官兵衛が松田政近・並河易家と戦った。やがて池田恒興らが淀川沿いの浅瀬を渡り、津田信春の隊を破って明智の横を突いた。明智勢は総崩れとなり、御牧兼顕が殿となって討死する間に、光秀は御坊塚の本陣から勝竜寺城へ退いた。光秀は夜に城を出て坂本へ向かう途中、小栗栖で討たれた。',
  force(rt) {
    const F = rt.flags;
    const k = [0, 0.05, 0.15, 0.3, 0.55, 0.8][F.stage || 0] || 0;
    return { a: 40000 - (F.ak || 0) * 30, a0: 40000, b: Math.max(1500, Math.round(16000 * (1 - k)) - (F.ek || 0) * 30), b0: 16000 };
  },
  missionPin(rt) {
    const F = rt.flags;
    if (!F.stage || F.ending) return null;
    // 行き先は段ごとに一つで動かさない（AW3・BK4）。浅瀬は渡った北の岸に一つ
    const p = [null, HOLD, FORD_N, TSUDA, SAITO, GOBO_PIN][F.stage];
    PIN.x = p.x; PIN.z = p.z; PIN.r = F.stage === 2 ? 10 : 8;
    return PIN;
  },
  world: {
    seed: 1582,
    time: 'dusk',
    height,
    waterSlow: true,
    riverCross: true,
    wetStart: 0.55,             // 雨の土（足が重く、土煙が立たない）
    paddy: marsh,               // 淀川寄りの沼と湿田（泥で遅くなる）
    streams: [
      { pts: ENMYOJI, w: 5, depth: 1.1, fords: [{ x: -26, w: 18 }, { x: 62, w: 20 }] },
      { pts: YODO, w: 22, depth: 2.6 },
      // 勝竜寺城の前の水堀（門の前だけ土橋）
      { pts: [[28, -180], [100, -180]], w: 3, depth: 1.3, fords: [{ x: 64, w: 7 }] },
    ],
    paths: [[[-30, 130], [-10, 70], [-20, 14]], [[-20, 30], [30, 26], [62, 14]], [[64, -16], [40, -80], [18, -140], [64, -186]]],
    tint(x, z, h, c) {
      // 川の両岸は田と葦の湿地（暗い緑と泥）。天王山の裾は濃い草
      const d = Math.abs(z - riverZ(x));
      if (d < 20) { const k = 1 - d / 20; c.setRGB(c.r * (1 - 0.3 * k) + 0.06 * k, c.g * (1 - 0.2 * k) + 0.05 * k, c.b * (1 - 0.3 * k) + 0.02 * k); }
      const p = 0.5 + 0.5 * Math.sin(x * 0.06 + 1.1) * Math.cos(z * 0.05);
      c.multiplyScalar(0.74 + p * 0.2);   // 11/5 史料の雨気・夕方の暗さ
    },
    clear: (x, z) => x > -110 && x < 96 && z > -200 && z < 150,
    trees: 260,
    tufts: 2600,
    treeDensity: (x, z) => (x < -100 ? 1 : x > 120 || z < -205 || z > 160 ? 0.6 : 0),
    fleeOut: (x, z, team) => (team === 1 ? z < -200 : z > 170),
  },

  setup(rt) {
    const F = rt.flags;
    F.stage = 0; F.ek = 0; F.ak = 0; F.ending = false; F.holdPlayer = true;
    // 両軍の本陣（陣幕・馬印）と、中の旗本（本物の兵。前に出ない）
    KIT.honjin(rt, HIDE.x, HIDE.z, { mon: HA, people: false, fire: false });
    KIT.honjin(rt, HONJIN_A.x, HONJIN_A.z, { mon: 'akechi', people: false, fire: false });
    F.hideG = honjinGuard(rt, 0, { x: HIDE.x, z: HIDE.z - 6 }, Math.PI, '羽柴秀吉の旗本', '羽柴秀吉', HA, 16);
    F.mitsuG = honjinGuard(rt, 1, { x: HONJIN_A.x, z: HONJIN_A.z + 4 }, 0, '明智光秀の旗本', '明智光秀', AK.flag, 14);
    F.mitsuU = F.mitsuG.units.find((u) => u.name === '明智光秀');
    shoryujiFront(rt);
    for (const [x, z] of [[-80, 34], [-46, 30], [-14, 66]]) rt.scene.add(nobori(rt.world, x, z, HA));
    for (const [x, z] of [[-10, -50], [70, -64], [10, -130], [30, -130]]) rt.scene.add(nobori(rt.world, x, z, AK.flag));
    // 天王山の裾を押さえる秀長・官兵衛の手（鉄砲で撃ち下ろす）
    F.tenno = allyGroup(rt, { name: '羽柴秀長の隊', anchor: { x: -104, z: 26 }, facing: Math.PI, width: 10, aggro: 10, seekRange: 34, morale: 95, noRout: true, fullStrength: true, order: 'hold' },
      fl([{ type: 'busho', n: 1, o: { name: '羽柴秀長', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '黒田官兵衛', invuln: true, horse: true, flag: KU } },
        { type: 'gun', n: 5 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }], HA));
    // 前で支える中川・高山の隊（二人は史実で生き残るので討たれない）
    F.naka = allyGroup(rt, { name: '中川清秀の隊', anchor: { x: -74, z: 20 }, facing: Math.PI, width: 10, formation: 'line', aggro: 14, morale: 90, noRout: true, fullStrength: true, dmgMult: 0.4 },
      fl(knot(22, [{ type: 'busho', n: 1, o: { name: '中川清秀', invuln: true, horse: true } }]), HA));
    F.taka = allyGroup(rt, { name: '高山右近の隊', anchor: { x: -42, z: 18 }, facing: Math.PI, width: 10, formation: 'line', aggro: 14, morale: 90, noRout: true, fullStrength: true, dmgMult: 0.38 },
      fl(knot(22, [{ type: 'busho', n: 1, o: { name: '高山右近', invuln: true, horse: true } }]), HA));
    // 主人公の付く池田勢（主人公の脇に付いて動く）
    F.ikeda = allyGroup(rt, { name: '池田恒興の隊', anchor: { x: START.x + 4, z: START.z + 6 }, facing: Math.PI, width: 10, formation: 'line', aggro: 12, morale: 95, noRout: true, fullStrength: true, speed: 5, dmgMult: 0.45 },
      fl(knot(26, [{ type: 'busho', n: 1, o: { name: '池田恒興', invuln: true, horse: true } }]), IK));
    // 明智の西の手（松田・並河。天王山の裾）と、川向こうの津田・斎藤の本隊。前に出ない時は川の北で構える
    F.matsuda = enemyGroup(rt, { name: '松田政近の隊', faction: 'akechi', anchor: { x: -84, z: -46 }, facing: 0, width: 10, formation: 'line', order: 'hold', aggro: 10, seekRange: 20 },
      ak(knot(12, [{ type: 'busho', n: 1, o: { name: '松田政近', horse: true } }, { type: 'busho', n: 1, o: { name: '並河易家', horse: true } }])));
    // 川向こうに構える明智の先手（始まりから見える。①で川を渡って寄せる）
    //   伊勢貞興は中川の隊へ襲いかかって戦を始めた（学び 四）。斎藤の先手は高山の隊を押す
    F.w1 = [
      enemyGroup(rt, { name: '斎藤勢の先手', faction: 'akechi', anchor: { x: -30, z: -30 }, facing: 0, width: 10, formation: 'line', order: 'hold', aggro: 6, seekRange: 10, morale: 85, dmgMult: 0.6 },
        ak(knot(18, [{ type: 'samurai', n: 1, o: { name: '柴田源左衛門', horse: true } }]))),
      enemyGroup(rt, { name: '斎藤利三の先手', faction: 'akechi', anchor: { x: -4, z: -28 }, facing: 0, width: 10, formation: 'line', order: 'hold', aggro: 6, seekRange: 10, morale: 85, dmgMult: 0.6 },
        ak(knot(16))),
    ];
    F.w1N = allN(F.w1);
    F.iseW = enemyGroup(rt, { name: '伊勢貞興の隊', faction: 'akechi', anchor: { x: -62, z: -38 }, facing: 0, width: 10, formation: 'line', order: 'hold', aggro: 6, seekRange: 10, morale: 88, dmgMult: 0.5 },
      ak(knot(14, [{ type: 'busho', n: 1, o: { name: '伊勢貞興', horse: true } }])));
    for (const n of KNOWN) revealName(rt, n);
    // 雨の夕方（公家の日記に雨。鉄砲は撃てる小雨）
    if (rt.world.setRainTarget) { rt.world.setRainTarget(0.3); rt.world.rainLevel = 0.3; }
    rt.say('羽柴秀吉', '備中から駆け通して来たぞ。上様の仇、日向を討つは今ぞ', 3.6);
    rt.after(3.2, () => rt.say('池田恒興', '川の向こう、日向の右手、淀川の方は手薄じゃ', 3.2));
    rt.after(6.5, () => { F.holdPlayer = false; this.stage(rt, 1); });
  },

  stage(rt, n) {
    const F = rt.flags;
    F.stage = n; F.st0 = rt.t;
    (F.log = F.log || []).push([n, Math.round(rt.t), Math.round(rt.player.u.pos.x), Math.round(rt.player.u.pos.z)]);
    rt.obj('main', TEXT[n], 'main');
    if (n > 1) rt.banner(CUE[n], '');
    if (n === 1) {
      // 斎藤勢の先手が中ほどの浅瀬を渡り、高山の隊を押す（明智が押す場面）
      sfx('horagai', 0.9);
      // 先に伊勢貞興が中川の隊へ、続いて斎藤の先手が川を渡って高山の隊へ寄せる（明智が押す場面）
      F.iseW.order = 'move'; F.iseW.dest = { x: -74, z: 14 }; F.iseW.aggro = 16; F.iseW.seekRange = 30;
      F.iseW.onArrive = (g) => { g.order = 'attack'; };
      for (const g of F.w1) { g.order = 'attack'; g.aggro = 14; g.seekRange = 30; }
      // 寄せる先は高山の隊の列（主人公の持ち場はその右。横から当たれる）
      F.w1[0].dest = { x: -44, z: 16 }; F.w1[1].dest = { x: -30, z: 18 };
      F.matsuda.order = 'attack'; F.matsuda.aggro = 24; F.matsuda.seekRange = 40; F.matsuda.dest = { x: -100, z: 16 };
      F.ikeda.order = 'move'; F.ikeda.dest = { x: HOLD.x - 4, z: HOLD.z };
      F.ikeda.onArrive = (g) => { g.order = 'attack'; g.aggro = 24; g.seekRange = 30; };
      // 堀秀政の後詰が南から着いて、押される高山の隊の後ろを支える（学び 四・六）
      rt.after(12, () => {
        F.hori = allyGroup(rt, { name: '堀秀政の隊', anchor: { x: 10, z: 70 }, facing: Math.PI, width: 10, formation: 'line', aggro: 30, seekRange: 50, morale: 95, noRout: true, fullStrength: true, speed: 4, dmgMult: 0.4 },
          fl(knot(20, [{ type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, horse: true } }]), HO));
        F.hori.order = 'move'; F.hori.dest = { x: -34, z: 26 }; F.hori.onArrive = (g) => { g.order = 'attack'; };
        rt.say('堀秀政', '後詰に着いたぞ。高山殿、持ちこたえよ！', 3);
      });
      rt.army.play('toki', { x: -20, z: -24 }, 1.4);
      rt.after(2, () => rt.say('中川清秀', '伊勢の手が来たぞ！　槍を揃えよ！', 3));
      rt.after(6, () => rt.say('高山右近', '斎藤の手が川を越えた！　押されるぞ、支えよ！', 3.4));
      rt.after(22, () => rt.say('黒田官兵衛', '天王山の手はこちらが押さえた。山から撃ち下ろせ', 3.2));
      rt.after(30, () => rt.say('松田政近', '山を取られてなるものか。登れ、登れ！', 3));
    } else if (n === 2) {
      rt.award((t) => t.side.push('高山の陣の前で斎藤勢を押し返した'), '高山の陣の前で斎藤勢を押し返した');
      for (const g of F.w1) if (live(g)) { g.routed = true; g.order = 'flee'; }
      rt.say('池田恒興', '今じゃ。東の浅瀬を渡り、日向の右手を突く。ついて参れ！', 3.6);
      F.ikeda.order = 'move'; F.ikeda.dest = { ...FORD_S }; F.ikeda.onArrive = null;
      // 川向こうの見張りの鉄砲（渡る時に撃たれる）
      F.bank = enemyGroup(rt, { name: '津田勢の鉄砲', faction: 'akechi', anchor: { x: 70, z: -28 }, facing: 0, width: 10, formation: 'line', order: 'hold', aggro: 14, seekRange: 30, dmgMult: 0.5 },
        ak([{ type: 'gun', n: 4 }, { type: 'ashigaru', n: 5, o: { flagScale: 1 } }, { type: 'samurai', n: 1 }]));
    } else if (n === 3) {
      rt.award((t) => t.side.push('東の浅瀬で円明寺川を渡った'), '東の浅瀬で円明寺川を渡った');
      F.tsuda = enemyGroup(rt, { name: '津田信春の隊', faction: 'akechi', anchor: { ...TSUDA }, facing: 0.3, width: 12, formation: 'line', order: 'attack', aggro: 22, seekRange: 34, morale: 85, dmgMult: 0.55 },
        ak(knot(24, [{ type: 'busho', n: 1, o: { name: '津田信春', horse: true } }])));
      F.tsudaGs = [F.tsuda, F.bank];
      F.tsudaN = allN(F.tsudaGs);
      // 加藤光泰の隊も続いて渡る（味方も目標へ）
      F.kato = allyGroup(rt, { name: '加藤光泰の隊', anchor: { x: FORD_S.x - 6, z: FORD_S.z + 14 }, facing: Math.PI, width: 10, formation: 'line', aggro: 30, seekRange: 50, morale: 95, noRout: true, fullStrength: true, speed: 4.2, dmgMult: 0.4 },
        fl(knot(16, [{ type: 'busho', n: 1, o: { name: '加藤光泰', invuln: true, horse: true } }]), HA));
      F.kato.order = 'move'; F.kato.dest = { x: TSUDA.x + 8, z: TSUDA.z + 10 }; F.kato.onArrive = (g) => { g.order = 'attack'; };
      rt.army.play('toki', { x: TSUDA.x, z: TSUDA.z + 10 }, 1.2);
      rt.after(2, () => rt.say('津田信春', '川を渡って来たじゃと！　槍を揃えよ！', 3));
    } else if (n === 4) {
      rt.award((t) => t.side.push('津田信春の隊を崩した'), '津田信春の隊を崩した');
      for (const g of F.tsudaGs) if (live(g)) { g.routed = true; g.order = 'flee'; }
      if (F.kato) { F.kato.order = 'move'; F.kato.dest = { x: SAITO.x + 22, z: SAITO.z - 6 }; F.kato.onArrive = (g) => { g.order = 'attack'; }; }
      // 斎藤利三の本隊は南（高山の方）を向いたまま。東の横から突く
      F.saito = enemyGroup(rt, { name: '斎藤利三の隊', faction: 'akechi', anchor: { ...SAITO }, facing: 0, width: 14, formation: 'line', order: 'hold', aggro: 18, seekRange: 26, morale: 85, dmgMult: 0.55 },
        ak(knot(28, [{ type: 'busho', n: 1, o: { name: '斎藤利三', invuln: true, horse: true } }])));
      F.saiGs = [F.saito];
      F.saiN = allN(F.saiGs);
      // 前から中川・高山、中ほどから堀秀政の後詰も川を越えて押す（堀は①で着いている）
      if (!F.hori) F.hori = allyGroup(rt, { name: '堀秀政の隊', anchor: { x: 10, z: 40 }, facing: Math.PI, width: 10, formation: 'line', aggro: 30, seekRange: 50, morale: 95, noRout: true, fullStrength: true, speed: 4, dmgMult: 0.4 },
        fl(knot(20, [{ type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, horse: true } }]), HO));
      //   池田勢が横を突くのが先。前の隊は少し遅れて川を越える（主人公が先に当たる）
      rt.after(14, () => {
        if (F.stage !== 4) return;
        for (const [g, d] of [[F.hori, { x: SAITO.x + 6, z: SAITO.z + 12 }], [F.taka, { x: SAITO.x - 8, z: SAITO.z + 12 }], [F.naka, { x: SAITO.x - 34, z: SAITO.z + 12 }]]) {
          if (!live(g)) continue;
          g.order = 'move'; g.dest = d; g.onArrive = (q) => { q.order = 'attack'; q.aggro = 30; q.seekRange = 40; };
        }
      });
      rt.after(3, () => rt.say('堀秀政', '池田殿が横へ回った。わしらも川を越えて押し包め！', 3.2));
      rt.after(7, () => rt.say('斎藤利三', '横じゃと……！　槍を返せ、返せ！', 3));
    } else if (n === 5) {
      rt.award((t) => t.side.push('斎藤利三の隊の横を突いて崩した'), '斎藤利三の隊の横を突いて崩した');
      for (const g of rt.army.groups) if (g.team === 1 && live(g) && !g.honjin) { g.routed = true; g.order = 'flee'; }
      // 総崩れ。御牧兼顕が殿となって御坊塚の前から突きかかる間に、光秀は旗本と勝竜寺城へ退く（学び 四・六）
      F.mimaki = enemyGroup(rt, { name: '御牧兼顕の殿', faction: 'akechi', anchor: { ...ISE }, facing: 0, width: 14, formation: 'line', order: 'attack', noRout: true, aggro: 30, seekRange: 44, morale: 99, dmgMult: 0.55 },
        ak(knot(26, [{ type: 'busho', n: 1, o: { name: '御牧兼顕', horse: true } }])));
      F.mimaki.dest = { x: GOBO_PIN.x, z: GOBO_PIN.z + 4 };
      F.gobo = [F.mimaki];
      F.guardN = allN(F.gobo);
      // 光秀は御坊塚の古墳から降りて、旗本に囲まれて北東の勝竜寺城へ退く（目に見える所で。討てない）
      rt.after(6, () => {
        if (!F.mitsuG || F.ending) return;
        F.mitsuG.fixed = false; F.mitsuG.order = 'retreat'; F.mitsuG.dest = { x: SHORYUJI.x, z: SHORYUJI.z - 12 }; F.mitsuG.speed = 2.6;
        rt.say('明智光秀', '……退け。勝竜寺へ退け', 3);
      });
      rt.after(9, () => rt.say('羽柴秀吉', '日向が退くぞ。追え、追え！', 3));
      //   味方の隊も御坊塚へ寄せる（逃げる明智勢を追いながら。少し遅れて着く）
      for (const [g, dx, w] of [[F.kato, 18, 6], [F.hori, -14, 12], [F.taka, -28, 18], [F.naka, -40, 24]]) {
        rt.after(w, () => {
          if (F.stage !== 5 || !live(g)) return;
          g.order = 'move'; g.dest = { x: GOBO.x + dx, z: GOBO.z + 16 }; g.speed = 3.4; g.onArrive = (q) => { q.order = 'attack'; q.aggro = 30; q.seekRange = 40; };
        });
      }
      rt.army.play('toki', { x: GOBO.x, z: GOBO.z + 30 }, 1.4);
      rt.after(1.5, () => rt.say('御牧兼顕', '我らが討ち死にする間に、殿は引かれよ！　者ども、続け！', 3.6));
    }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    (F.log = F.log || []).push(['win', Math.round(rt.t), Math.round(rt.player.u.pos.x), Math.round(rt.player.u.pos.z)]);
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    rt.award((t) => { t.main = true; t.special = { label: '円明寺川を渡り、明智の横を突き破った', pts: 20 }; }, '御坊塚の前で御牧兼顕の殿を討ち破った');
    rt.banner('山崎の戦い　勝ち', '光秀は勝竜寺城へ退いた');
    if (live(F.mimaki)) { F.mimaki.routed = true; F.mimaki.order = 'flee'; }
    // 光秀と旗本は勝竜寺城へ退く（⑤の初めに退き始めている）
    if (F.mitsuG && F.mitsuG.fixed) { F.mitsuG.fixed = false; F.mitsuG.order = 'retreat'; F.mitsuG.dest = { x: SHORYUJI.x, z: SHORYUJI.z - 12 }; F.mitsuG.speed = 2.6; }
    rt.say('池田恒興', '御牧の殿は破れた。勝ち鬨じゃ！', 3);
    rt.after(3.5, () => rt.say('羽柴秀吉', '日向は勝竜寺へ逃げたが、もう終いよ。ようやった', 4));
    rt.after(8, () => rt.say('使番', '明智日向守、夜に勝竜寺を抜け、小栗栖にて落武者狩りに討たれた由！', 4.5));
    rt.after(13, () => rt.say('黒田官兵衛', '次は、織田家の中の戦にございます', 4));
    rt.finish({ scriptedEnd: true }, 18);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objFail('main'); rt.tracker.main = false;
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: why }, 7);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.stage) return;
    const P = rt.player.u.pos;
    if (F.stage <= 3 && broken(F.naka) && broken(F.taka)) { this.lose(rt, '前で支える中川・高山の隊が崩れた'); return; }
    // 池田勢は主人公の脇に付く（離れたら寄る・近ければ戦う）
    if (live(F.ikeda) && (F.escT = (F.escT || 0) - dt) <= 0) {
      F.escT = 0.5;
      const c = F.ikeda.center();
      if (c && Math.hypot(c.x - P.x, c.z - P.z) > 9) { F.ikeda.order = 'move'; F.ikeda.dest = { x: P.x, z: P.z + 3 }; F.ikeda.onArrive = null; }
      else if (F.ikeda.order === 'move' && !F.ikeda.onArrive) { F.ikeda.order = 'attack'; F.ikeda.aggro = 24; F.ikeda.seekRange = 30; }
    }
    // 逃げて遠くへ去った明智勢は消す（本物の兵の数を次の備に残す）
    if ((F.gcT = (F.gcT || 0) - dt) <= 0) {
      F.gcT = 1;
      for (const u of rt.army.units) if (u.alive && !u.gone && u.team === 1 && (u.fleeing || u.group?.routed) && !u.group?.honjin && dist(u.pos, P) > 60) rt.army.despawn(u);
    }
    if (F.stage === 1) {
      const n = aliveN(F.w1);
      F.ek = F.w1N - n;
      // 明智が押す苦しさを短くしない（五十秒は押し合う。学び 十2）
      if (n <= F.w1N * 0.3 && rt.t - F.st0 > 50) this.stage(rt, 2);
    } else if (F.stage === 2) {
      if (!F.fordIn && dist(P, FORD_S) < 14) F.fordIn = true;
      if (P.x > 30 && P.z < riverZ(P.x) - 5) this.stage(rt, 3);
    } else if (F.stage === 3) {
      if (aliveN(F.tsudaGs) <= F.tsudaN * 0.3) this.stage(rt, 4);
    } else if (F.stage === 4) {
      if (aliveN(F.saiGs) <= F.saiN * 0.3) this.stage(rt, 5);
    } else if (F.stage === 5) {
      if (aliveN(F.gobo) <= F.guardN * 0.3) this.win(rt);
    }
  },
};

// 目標の並び（goals5.js の def.goals5）：5つの場所と行い。「敵を何人討つ」は入れない。崩す備は倒した数を出す
const at = (n) => (rt) => (rt.flags.stage ?? 0) > n || rt.tracker?.main === true;
t01_yamazaki.goals5 = () => TEXT.slice(1).map((text, i) => {
  const k = i + 1, gs = [null, 'w1', null, 'tsudaGs', 'saiGs', 'gobo'][k];
  return { kind: 'stage', k: i, text, noun: NOUN[k], check: at(k), ...(gs ? { groups: (rt) => [].concat(rt.flags[gs] || []) } : {}) };
});
STAGES.t01_yamazaki = TEXT.slice(1).map((t, i) => (i ? [t, (rt) => (rt.flags.stage ?? 0) >= i + 1] : [t]));

// bot：近い敵（逃げる者・討てない者は追わない）を突き、いなければ段の行き先へ。浅瀬の段は川を渡りきるまで寄り道しない
t01_yamazaki.botBrain = (b, inp, { goTo, patientStrike }) => {
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive || F.ending || !F.stage || F.holdPlayer) return;
  const ok = (o) => !o.fleeing && !o.noTarget && !o.invuln && !o.group?.routed && Math.abs(o.pos.y - u.pos.y) < 3;
  const e = b.army.nearestEnemy(u, F.stage === 2 ? 4 : 12, ok);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
    patientStrike(p, inp, e, d, true);
    return;
  }
  inp.guardHold = false;
  const c = (gs) => { const g = [].concat(gs || []).find(live); return g ? g.center() : null; };
  let t = HOLD;
  if (F.stage === 1) t = c(F.w1) || HOLD;
  else if (F.stage === 2) t = F.fordIn || u.pos.z < riverZ(u.pos.x) + 3 ? FORD_N : FORD_S;
  else if (F.stage === 3) t = c(F.tsudaGs) || TSUDA;
  else if (F.stage === 4) t = c(F.saiGs) || SAITO;
  else t = c(F.gobo) || GOBO;
  goTo(p, inp, t.x, t.z, 2.5);
};
withGuard(t01_yamazaki);

export { t01_yamazaki };
