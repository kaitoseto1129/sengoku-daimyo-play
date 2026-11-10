// ======================================================================
// 豊臣編 1. 山崎の戦い（docs/chapter2_toyotomi.md の「1. 山崎の戦い」。調べは docs/battle_refs/t01_yamazaki.md）
// 天正十年（1582）六月十三日の午後四時ごろ。天王山と淀川の間の狭い野、円明寺川。主人公は自分の備を連れた備大将で、羽柴軍の中央〜天王山寄り。
// 11/10 docs/yamazaki_spec_1109.md で作り直し：序に備中の本陣（急報→秀吉「戻るぞ。」→第二章 豊臣編）と操作できる中国大返し（t01_yamazaki/ogaeshi.js）。
//   山崎は ①布陣 ②前線を押し上げる ③斎藤隊を崩す（天王山の圧力は遠くと知らせ）④明智の反撃で崩れた中央を立て直す
//   ⑤明智の両翼が崩れる（右で池田勢が津田を破り、左で秀長の旗が進む）中で阿閉の隊を押し破る ⑥明智軍を追い殿を破る ⑦勝竜寺へ追撃。光秀は討たない。
//   池田恒興は川手（淀川側）の別の手で、主人公とは別に動く。以下の古い目標の書き付けは 11/9 までの形。
// 目標（場所と行い。kaito AQ1・AR1・AW3・AW7）：
//   ①高山右近の陣の右で、川を渡って来た斎藤勢を押し返す（中央が押される）
//   ②東の浅瀬で、池田勢と円明寺川を渡る（南を向く明智の左手＝淀川側が薄い）
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
import { nobori, yagura, kabukimon, castleBoardFence, solidSeg, ishigaki } from './props.js';
import { withGuard } from './toyo_bot.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { revealName } from './battle_intel.js';
import { goalsTick } from './hud_goals.js';
// 15分の段（kaito 11/8 夜 docs/toyo15_plan_1108.md）：段の中身は t01_yamazaki/ に一段一ファイル
import { farArmies, report } from './t01_yamazaki/far.js';
import * as March from './t01_yamazaki/march.js';
import * as Counter from './t01_yamazaki/counter.js';
import * as Pursuit from './t01_yamazaki/pursuit.js';
import * as Ogaeshi from './t01_yamazaki/ogaeshi.js';
import { T01_DEPTH } from './t01_yamazaki/depth.js';

let dem = null;
useTerrain('dem_yamazaki', (data) => { dem = data; });
const DEM_XY = 6, OX = -110, OZ = 300;   // ゲームの (x, z) → 実の (x·6−110, z·6+300) m（中心は円明寺川の下流の南）
const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const demH = (x, z) => Math.max(0, demSample(dem, x * DEM_XY + OX, z * DEM_XY + OZ) - 8) * 0.32;
// 野をならす輪（半径 5 と 10＝実の 30m・60m）。今の標高には名神・鉄道の築堤や堤防が入り、野が砂丘のような瘤だらけになった（11/6 描いて遊んだ写真）
const RING = [0, 1, 2, 3, 4, 5].flatMap((i) => { const a = i * Math.PI / 3; return [[5 * Math.cos(a), 5 * Math.sin(a)], [10 * Math.cos(a + 0.5), 10 * Math.sin(a + 0.5)]]; });
function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.045 + 0.7) * Math.cos(z * 0.037);
  if (dem) {
    // 天王山の裾より東の野は、天正の頃の平らな田と湿地に近づける（山の高さは残す）
    let d = demH(x, z);
    const k = sstep(-100, -76, x);
    if (k > 0) { let s = d; for (const [a, b] of RING) s += demH(x + a, z + b); d = d * (1 - k) + (s / (RING.length + 1)) * k; }
    h += d;
  }
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
const START = { x: -22, z: 150 };       // 秀吉の本陣の前の街道（大返しの到着。①で先陣へ上る）
const HOLD = { x: -20, z: 14 };           // 高山右近の陣の右（中ほどの浅瀬の南）
const SAITO = { x: -4, z: -36 };          // 斎藤利三の隊（中ほど。南を向く）
const ISE = { x: 14, z: -104 };           // 伊勢貞興の隊（明智の二陣。御坊塚の前）
const ATSUJI = { x: -6, z: -66 };        // 阿閉貞征の隊（明智の中央の二陣。⑤）
const GOBO = { x: 18, z: -140 };          // 御坊塚の光秀の本陣の前
const GOBO_PIN = { x: 16, z: -96 };       // ⑤の行き先（御坊塚の前。殿の御牧の隊がここへ突きかかる。動かさない）
const HONJIN_A = { x: 18, z: -158 };      // 光秀の床几（陣幕の中）
const SHORYUJI = { x: 64, z: -186 };      // 勝竜寺城の前（光秀の退く先）
const HIDE = { x: -34, z: 112 };          // 秀吉の本陣（南の後ろ。宝積寺の麓。振り返ると陣幕と名が見える近さに。critic60：秀吉がどこにいるか分からない）
const MOUND = { x: 18, z: -164 };         // 御坊塚の古墳の真ん中
// 携帯の横（844）で一行に収まる長さに（目標の札が右へはみ出さない）。「崩す」は使わない（kaito 三1）。途中で言い替えない（十1）
// 15分の七段（11/8 夜）：①到着 ②前衛の押し合い ③渡河と津田 ④光秀本隊の反撃 ⑤斎藤の横 ⑥御牧の殿 ⑦追撃
// 11/10 指示書（docs/yamazaki_spec_1109.md）の十五分：①布陣 ②前衛 ③天王山の圧力と斎藤隊 ④明智の反撃 ⑤両翼の崩れ ⑥追え ⑦追撃
const TEXT = ['',
  '先陣の高山右近の陣へ駆けつける',
  '高山右近の陣の右で斎藤勢を押し返す',
  '円明寺川を渡り、斎藤利三の隊を崩す',
  '円明寺川の南岸で中央を立て直す',
  '円明寺川の北岸で阿閉貞征の隊を押し破る',
  '明智軍を追い、御坊塚の前の殿を破る',
  '退く明智軍を勝竜寺城の門まで追う'];
const NUM = '①②③④⑤⑥⑦';
const LAST = 7, DONE = 8;
// 段の変わり目に画面の真ん中へ出す一行（AT7：何をするか）
const CUE = ['', '', '', '川を渡り、斎藤の隊へ', '明智の反撃', '明智の両翼が崩れる', '明智軍を追え', '勝竜寺城へ追え'];
const NOUN = ['', '先陣', '斎藤勢', '斎藤利三の隊', '光秀本隊', '阿閉貞征の隊', '御牧兼顕の殿', '勝竜寺城'];
// 目標に名を挙げた敵将と、陣の分かっている将は伏せない（右上が「見えぬ敵の陣を物見する」に化けない）
const KNOWN = ['斎藤利三', '津田信春', '御牧兼顕', '阿閉貞征', '伊勢貞興', '松田政近', '並河易家', '明智光秀', '柴田源左衛門', '溝尾茂朝'];
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

// 勝竜寺城の前（光秀の退く先）：狭間の板塀・冠木門・櫓・幟。細川藤孝が直した平城で、陣の丸太柵ではない（学び 三）。当たりは塀
function shoryujiFront(rt) {
  const W = rt.world, x = SHORYUJI.x, z = SHORYUJI.z;
  rt.scene.add(kabukimon(W, x, z, 6, 0));
  //   1571 年の改修で石垣と瓦を使った早い城（国交省の多言語解説・長岡京市）。塀の足もとに腰の石垣
  for (const seg of [[x - 30, z, x - 4, z], [x + 4, z, x + 30, z]]) {
    rt.scene.add(ishigaki(W, [[seg[0], seg[1] + 0.5], [seg[2], seg[3] + 0.5]], { out: -1, top: 1.2, minH: 1.2, maxH: 2, sink: 0.4 }));
    rt.scene.add(castleBoardFence(W, seg, { h: 2.6, samaStep: 1.5 }));
    Object.assign(solidSeg(...seg, 0.2), { missileH: 2.6, missileType: 'wood' });
  }
  rt.scene.add(yagura(W, x - 18, z - 7, { mon: 'akechi', team: 1 }));
  rt.scene.add(yagura(W, x + 18, z - 7, { mon: 'akechi', team: 1 }));
}
// 11/6 fixc0328（kaito 九1・九3・十1・十二1）：右上は①〜⑤を最初から全部並べ、済んだ物に印（hud_goals の札）。両軍の今の兵の数の棒も上に常に出す。
//   見える敵は一人残らず頭上に大きな赤い▼（共通の印は近い四人まで）。有岡・越前と同じ作り。時の字は出さない。
const YAM_BOARD_CSS = `
html:root body #hud#hud#hud.yam-goals #armybar:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; }
html:root body #hud#hud#hud.yam-goals #armybar .clock { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.yam-goals #armybar { visibility:hidden !important; }
html:root body #hud#hud#hud.yam-goals #h-prog#h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud#hud.yam-goals #h-prog#h-prog.goal-mode > .pg-goals { display:block !important; }
html:root body #hud#hud#hud.yam-goals #h-prog#h-prog.goal-mode {
 left:auto !important; right:calc(12px + env(safe-area-inset-right, 0px)) !important; transform:none !important;
 width:auto !important; min-width:0 !important; max-width:min(390px, 44vw) !important; box-sizing:border-box;
 padding:8px 12px 9px 10px !important; background:rgba(14,12,10,.7) !important; border:none !important; border-radius:6px !important;
}
html:root body #hud#hud#hud.yam-goals #h-prog#h-prog.goal-mode .pg-goals li { white-space:normal !important; align-items:flex-start; color:#e6dfd2 !important; }
html:root body #hud#hud#hud.yam-goals #h-prog#h-prog.goal-mode .pg-goals li i { margin-top:3px; }
html:root body #hud#hud#hud.yam-goals #h-prog#h-prog.goal-mode .pg-goals li span { color:inherit !important; background:none !important; }
html:root body #hud#hud#hud.yam-goals #h-prog#h-prog.goal-mode .pg-goals li.now { color:#fff !important; }
html:root body #hud#hud#hud.yam-goals #h-prog#h-prog.goal-mode .pg-goals li.done { color:#cfc9bc !important; }
html:root body #hud#hud#hud.yam-goals #h-prog#h-prog.goal-mode .pg-goals :is(h3 b, li em.tm) { display:none !important; }`;
function yamGoalBoard(rt) {
  const hud = rt.hud;
  if (!hud?.root || typeof document === 'undefined') return;
  hud.root.classList.add('yam-goals');
  const style = document.createElement('style');
  style.textContent = YAM_BOARD_CSS;
  document.head.appendChild(style);
  const progress = hud.progress;
  hud.progress = function (battle) {
    // 序（備中の本陣と大返し）の間は山崎の目標の並びと両軍の数を出さない（その幕の一行だけ）
    const pre = battle === rt && !rt.flags.stage;
    hud.root.classList.toggle('yam-goals', !pre);
    if (pre && this.prog) this.prog.classList.remove('goal-mode');
    if (battle === rt) rt.def.goalsAllRows = !pre;
    const out = progress.call(this, battle);
    if (battle === rt && this.prog && !rt.over && !pre) {
      const def = rt.def, one = def.missionSingleLine;
      def.missionSingleLine = false;
      try { goalsTick(this.prog, rt); } finally { def.missionSingleLine = one; }
    }
    return out;
  };
  // 敵全員の▼は共通の field_signs が付ける。山崎だけ重ねて描かない。
  const dispose = rt.dispose;
  rt.dispose = function () {
    hud.progress = progress;
    rt.def.goalsAllRows = true;
    if (hud.prog) hud.prog.classList.remove('goal-mode');
    hud.root.classList.remove('yam-goals'); style.remove();
    return dispose.call(this);
  };
}

// 旗を一本ずつ倒す（倒れた旗は野に残る。追撃の時に見える）
function dropFlags(rt, list, gap) {
  (list || []).forEach((f, i) => rt.after(i * gap, () => {
    if (!f || f.userData.down) return;
    f.userData.down = true;
    f.rotation.z = (i % 2 ? 1 : -1) * 1.45; f.position.y -= 0.2;
  }));
}

// 本陣の旗本（陣幕の中と前）。動かず、前に出ない。大将は討てない
function honjinGuard(rt, team, at, facing, name, lead, flag, n, horse = false) {
  const mk = team ? enemyGroup : allyGroup;
  const g = mk(rt, { name, anchor: { ...at }, facing, width: 10, formation: 'line', aggro: 4, seekRange: 8, order: 'hold', fixed: true, noRout: true, morale: 99, ...(team ? { faction: 'akechi' } : { fullStrength: true }) },
    (team ? ak : (l) => fl(l, flag))([{ type: 'busho', n: 1, o: { name: lead, invuln: true, horse } }, { type: 'samurai', n: Math.round(n * 0.45), o: { keep: true } },
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
  introText: () => '六月三日の夜。備中高松の羽柴の陣へ、京から馬が駆け込む。十日の後、山崎で明智と決戦。',
  // 始まりの札は戦の名・年・味方対敵（数）・二三行だけ（kaito 五4・十二1）
  introSides: { a: '羽柴 四万', b: '明智 一万六千' },
  introPeople: [],
  // 右上は今の目標を番号付きで（「味方の旗へ」「見えぬ敵の陣を物見する」に替えない。kaito 三1・十1）
  missionHeading: (rt) => { const F = rt.flags; if (!F.stage && F.pro) return NUM[F.pro - 1] + Ogaeshi.TEXT[F.pro]; const n = Math.min(LAST, Math.max(1, F.stage || 1)); return NUM[n - 1] + TEXT[n]; },
  // 倒れた札に案内の字（「味方のそばで戦おう」）を添えない（kaito 五1）
  retryAdvice: () => ' ',
  // 途中の共通の見出し（「一騎打ち」「敵将が倒れた」「敵の隊が崩れた」）は説明の字なので出さない（五1。11/6 の流しで一つの戦に四つ出た）
  bannerAllowed: (rt, t) => t !== '一騎打ち' && t !== '敵将が倒れた' && t !== '敵の隊が崩れた',
  missionSingleLine: true,
  expectMin: 15,              // 進み具合の棒は十五分で（15分の七段・11/8 夜）
  depth: T01_DEPTH,           // 軍勢の厚み・陣立て（t01_yamazaki/depth.js・docs/army_depth_howto.md）
  lethal: { max: 4, firstAt: 90, gap: 60 },   // 命懸けの戦場（docs/lethal_howto.md）。実在の将は討たない
  fearKind: { kind: 'river_crossing', note: '雨の湿地で川を渡り、敵の横を突く', w: { losses: 1.2, flank: 1.4 }, line: '川を背にしては退けぬぞ！' },
  goalsAllRows: true,         // 最初から目標の並びと達成印を出す（critic60 九1・十1）
  goalsVisibleRows: 5,        // 七段の順は保ち、携帯には今の五つを出す（三 目標）。
  hideGuideSteps: true,
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  noFrontFill: true,
  goalSignOnly: true,         // 行き先は頭上の金の▼一つだけ（持ち場の旗・輪・地面の矢印を重ねない）
  goalSignNoEdge: true,       // 見えない行き先の印を画面の縁へ貼り付けない
  noLeaderFollow: true,
  noHatamotoMass: true,       // 将の後ろの軽い作りの備も置かない（近づける所に見せかけの兵を置かない。AA・AF）       // 印は行き先の一つだけ（青い『ついていく相手』の印を出さない。AL・AV15）          // 作り物の乱戦を足さない（AA・AR7）
  frontlineDensity: false,    // 小勢を足さない（本物の兵の枠を段の備に残す）
  alwaysMelee: false,
  foeMarks: true,
  nearbyAllySignLimit: 0,     // 共通の近距離の丸印も出さない（critic60 五2）。
  nameRange: 90,              // 名のある将の名は遠くからも出す（既定の十八では斎藤・津田・御牧の名が一度も見えなかった。kaito 五2・九3）
  nameTagLimit: 12,           // 既存の十二枚を使い、並河・松田などの名を近い一、二人だけの枠で消さない。
  nameTagsAtHead: true,       // 本人が隠れた時は名も隠し、頭から離れた宙へずらさない。
  closeCombatAssist: true,
  noWinCrane: true,
  playerTaken: 0.3,           // 羽柴が二倍以上の戦。主人公だけが十秒で倒れない（kaito 十二3）
  //   11/6 fixc0328：それでも①の斎藤勢・浅瀬の手前で十秒に百から一へ落ちた（共通の一太刀の下限）。一度に受ける槍は命の四割まで・一・二秒は次を通さない（越前と同じ口）
  meleeGrace: { rate: 0.05, burst: 0.4, interval: 1.2 },
  sides: { a: { name: '羽柴勢', mon: HA }, b: { name: '明智勢', mon: 'akechi', faction: 'akechi' } },
  date: () => '天正十年（1582）六月十三日　申の刻',
  history: '本能寺の変の十一日後、備中高松から大返しの羽柴勢およそ四万が、明智勢およそ一万六千と天王山と淀川の間の狭い野でぶつかった。雨の夕方、伊勢貞興が中川清秀の隊に襲いかかって戦が始まり、斎藤利三も円明寺川を渡って高山右近の隊を押した。堀秀政が後詰に着いて支え、天王山の手では羽柴秀長・黒田官兵衛が松田政近・並河易家と戦った。やがて池田恒興らが淀川沿いの浅瀬を渡り、津田信春の隊を破って明智の横を突いた。明智勢は総崩れとなり、御牧兼顕が殿となって討死する間に、光秀は御坊塚の本陣から勝竜寺城へ退いた。光秀は夜に城を出て坂本へ向かう途中、小栗栖で討たれた。',
  force(rt) {
    const F = rt.flags;
    // 勝ちの締め（段6）でも⑤の後の数のまま（段の表の外で一万六千に戻らない）
    const k = [0, 0, 0.05, 0.2, 0.3, 0.55, 0.8, 0.86, 0.88][Math.min(DONE, F.stage || 0)];
    return { a: 40000 - (F.ak || 0) * 30, a0: 40000, b: Math.max(1500, Math.round(16000 * (1 - k)) - (F.ek || 0) * 30), b0: 16000 };
  },
  missionPin(rt) {
    const F = rt.flags;
    if (F.ending) return null;
    // 行き先は段ごとに一つで動かさない（AW3・BK4）。浅瀬は渡った北の岸に一つ
    if (F.stage >= DONE) return null;
    // 序（備中の本陣と大返し）は幕ごとの行き先。本陣の場面（急報）の間も街道の口を示す
    if (!F.stage) return Ogaeshi.pin(F) || (F.pro ? null : March.JOIN);
    const p = [March.JOIN, March.JOIN, HOLD, SAITO, Counter.STAND, ATSUJI, GOBO_PIN, Pursuit.GATE][F.stage || 0];
    PIN.x = p.x; PIN.z = p.z; PIN.r = 8;
    return PIN;
  },
  world: {
    seed: 1582,
    // 申の刻（午後四時ごろ。旧暦六月十三日＝七月二日で日の入りは七時過ぎ）の雨。夕焼けの赤い空は時刻にも雨にも合わない（critic60：④だけ空が赤い）。
    //   雨雲の下の昼過ぎの暗さ（雨は小雨 0.3 のまま）
    time: 'storm',
    // 追撃でも雨雲を保ったまま暮れる。共通の夕暮れの朱い日差し・晴れ間へ替えない（critic60 四6）。
    duskLight: { sky: 0x737d80, fog: 0x818b8e, top: 0x515d64, sun: 0xb9c4c8,
      sunI: 0.65, hemiSky: 0x9eafb5, hemiGround: 0x55534b, hemiI: 1.2,
      sunPos: [-120, 17, -24], vis: 200, cloud: 0, cover: 0.85, glowK: 0 },
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
      // 淀川寄りの沼と湿田は、水の浮いた暗い泥と葦の色（広い草の野と見分けが付く。critic60：沼地が無い）
      const m = marsh(x, z);
      if (m > 0) { const k = Math.min(1, m * 1.1); c.setRGB(c.r * (1 - 0.45 * k) + 0.05 * k, c.g * (1 - 0.42 * k) + 0.045 * k, c.b * (1 - 0.3 * k) + 0.035 * k); }
      const p = 0.5 + 0.5 * Math.sin(x * 0.06 + 1.1) * Math.cos(z * 0.05);
      c.multiplyScalar(0.74 + p * 0.2);   // 11/5 史料の雨気・夕方の暗さ
    },
    clear: (x, z) => x > -110 && x < 96 && z > -200 && z < 172,
    trees: 260,
    tufts: 2600,
    treeDensity: (x, z) => (x < -100 ? 1 : x > 120 || z < -205 || z > 174 ? 0.6 : 0),
    fleeOut: (x, z, team) => (team === 1 ? z < -200 : z > 170),
    moveLim: 210,   // 二巡 11/9：勝竜寺城（z −186）と御坊塚の裏まで戦場の内に（退く明智勢が 176 の端を越えていた）
  },

  setup(rt) {
    const F = rt.flags;
    F.stage = 0; F.ek = 0; F.ak = 0; F.ending = false; F.holdPlayer = true;
    // 序の予約を待つ間も本戦の①を出さない（通し確認：向きを変える間に目標の文が替わった）。
    F.pro = 1; F.oStep = 0;
    // 両軍の本陣（陣幕・馬印）と、中の旗本（本物の兵。前に出ない）
    KIT.honjin(rt, HIDE.x, HIDE.z, { mon: HA, people: false, fire: false });
    KIT.honjin(rt, HONJIN_A.x, HONJIN_A.z, { mon: 'akechi', people: false, fire: false });
    shoryujiFront(rt);
    for (const [x, z] of [[-80, 34], [-46, 30], [-14, 66]]) rt.scene.add(nobori(rt.world, x, z, HA));
    // 天王山の裾の秀長・官兵衛の手の幟（川手の野から山の手の取り合いの場所が見える。critic60：天王山が霧の山の絵のまま）
    F.tennoFlags = [[-112, 32, KU], [-116, 20, HA], [-108, 12, KU], [-120, 40, HA]].map(([x, z, m]) => { const f = nobori(rt.world, x, z, m); rt.scene.add(f); return f; });
    // 後ろの秀吉の本陣の幟（振り返ると陣幕と旗が見える）
    for (const [x, z] of [[HIDE.x - 12, HIDE.z - 10], [HIDE.x + 12, HIDE.z - 10], [HIDE.x, HIDE.z - 14]]) rt.scene.add(nobori(rt.world, x, z, HA));
    // 明智の旗（⑤⑥で右・左・中の順に倒れる。本能寺で味方の旗が消えたのと逆。11/10 指示書）
    const akf = (L) => L.map(([x, z]) => { const f = nobori(rt.world, x, z, AK.flag); rt.scene.add(f); return f; });
    F.akFlagsR = akf([[70, -64], [82, -44]]);
    F.akFlagsL = akf([[-92, -42], [-80, -58]]);
    F.akFlagsC = akf([[-10, -50], [4, -82], [10, -130], [30, -130]]);
    // 自分の備（主人公が連れる隊。大返しから山崎まで脇に付いて動く。11/10 指示書：主人公は備大将で自分の部隊を連れている）
    F.ikeda = allyGroup(rt, { name: '我が備', anchor: { x: START.x + 4, z: START.z + 6 }, facing: Math.PI, width: 10, formation: 'line', aggro: 12, morale: 95, noRout: true, fullStrength: true, speed: 5, dmgMult: 0.45 },
      fl(knot(22), HA));
    Ogaeshi.props(rt);
    for (const n of KNOWN) revealName(rt, n);
    yamGoalBoard(rt);
    // 勝ち（段 6）の後は、この戦の締め（勝ち鬨と言葉の十六秒半の後）だけで結果へ。殿の将を討った等の共通の勝ちで先に締めない
    const fin0 = rt.finish;
    rt.finish = function (info = {}, ...rest) {
      if (!info.scriptedEnd && !info.down) return;
      return fin0.call(this, info, ...rest);
    };
    // 共通の「横槍が入ったぞ」は、池田勢が明智の横を突く③④の間に一度だけ（critic60：一つの戦で五回以上同じ台詞）
    const say0 = rt.say;
    rt.say = function (who, text, ...rest) {
      if (typeof text === 'string' && /横槍/.test(text)) { if (F.yokoSaid || (F.stage || 0) < 4) return false; F.yokoSaid = true; }
      return say0.call(this, who, text, ...rest);
    };
    farArmies(rt);   // 遠くの戦（街道の後ろ備え・天王山の取り合い・明智の控え。t01_yamazaki/far.js）
    // 序：備中の本陣の急報から中国大返し（t01_yamazaki/ogaeshi.js）。済めば toYamazaki で山崎へ
    rt.after(1.5, () => Ogaeshi.start(rt, this.ctx(rt)));
  },
  // 大返しの終わり（暗転の間）：山崎の手前へ。兵を並べ、雨の申の刻にして①へ
  toYamazaki(rt, quiet = false) {
    const F = rt.flags;
    Ogaeshi.clear(rt);
    this.deploy(rt);
    try { rt.world.dayClock = null; rt.world.setTime('storm', true); } catch (e) { /* 空はそのまま */ }
    // 雨の夕方（公家の日記に雨。鉄砲は撃てる小雨）
    if (rt.world.setRainTarget) { rt.world.setRainTarget(0.3); rt.world.rainLevel = 0.3; }
    const P = rt.player.u, W = rt.world;
    P.pos.set(START.x, W.heightAt(START.x, START.z), START.z); P.mesh?.position.copy(P.pos); P.heading = Math.PI; rt.player.yaw = Math.PI;
    for (const g of [...(rt.squadGroups || []), F.ikeda]) if (g) { let i = 0; for (const u of g.units) if (u.alive && !u.gone && u !== P) { const x = START.x - 4 + (i % 4) * 1.6, z = START.z + 5 + Math.floor(i / 4) * 1.6; u.pos.set(x, W.heightAt(x, z), z); u.mesh?.position.copy(u.pos); u.moveTo = null; u.target = null; i++; } }
    try { rt.army.rebuildGrid?.(); } catch (e) { /* 次のコマ */ }
    F.holdPlayer = false;
    if (!quiet) rt.banner('山崎の手前', '六月十三日。天王山の麓に、京へ向かう味方の旗が集まる');
    this.stage(rt, 1);
  },

  // 山崎の本物の兵を並べる（序の大返しが済んで暗転している間に。11/10）
  deploy(rt) {
    const F = rt.flags;
    if (F.deployed) return;
    F.deployed = true;
    F.hideG = honjinGuard(rt, 0, { x: HIDE.x, z: HIDE.z - 6 }, Math.PI, '羽柴秀吉の旗本', '羽柴秀吉', HA, 16);
    F.mitsuG = honjinGuard(rt, 1, { x: HONJIN_A.x, z: HONJIN_A.z + 4 }, 0, '明智光秀の旗本', '明智光秀', AK.flag, 14, true);   // 光秀は⑤で馬に乗って勝竜寺城へ退く
    F.mitsuU = F.mitsuG.units.find((u) => u.name === '明智光秀');
    // 天王山の裾を押さえる秀長・官兵衛の手（鉄砲で撃ち下ろす）
    F.tenno = allyGroup(rt, { name: '羽柴秀長の隊', anchor: { x: -104, z: 26 }, facing: Math.PI, width: 10, aggro: 10, seekRange: 34, morale: 95, noRout: true, fullStrength: true, order: 'hold' },
      fl([{ type: 'busho', n: 1, o: { name: '羽柴秀長', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '黒田官兵衛', invuln: true, horse: true, flag: KU } },
        { type: 'gun', n: 9 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }], HA));   // 鉄砲を厚く（山から撃ち下ろす煙が野から見える。critic60：天王山が台詞だけ）
    // 前で支える中川・高山の隊（二人は史実で生き残るので討たれない）
    F.naka = allyGroup(rt, { name: '中川清秀の隊', anchor: { x: -74, z: 20 }, facing: Math.PI, width: 10, formation: 'line', aggro: 14, morale: 90, noRout: true, fullStrength: true, dmgMult: 0.4 },
      fl(knot(22, [{ type: 'busho', n: 1, o: { name: '中川清秀', invuln: true, horse: true } }]), HA));
    F.taka = allyGroup(rt, { name: '高山右近の隊', anchor: { x: -42, z: 18 }, facing: Math.PI, width: 10, formation: 'line', aggro: 14, morale: 90, noRout: true, fullStrength: true, dmgMult: 0.38 },
      fl(knot(22, [{ type: 'busho', n: 1, o: { name: '高山右近', invuln: true, horse: true } }]), HA));
    // 池田恒興の手（川手・淀川側の別の手。主人公とは別に動き、⑤で東の浅瀬を渡って津田の隊を破る）
    F.ikedaR = allyGroup(rt, { name: '池田恒興の隊', anchor: { x: 66, z: 30 }, facing: Math.PI, width: 10, formation: 'line', aggro: 10, seekRange: 16, morale: 95, noRout: true, fullStrength: true, order: 'hold', dmgMult: 0.45 },
      fl(knot(14, [{ type: 'busho', n: 1, o: { name: '池田恒興', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '池田元助', invuln: true, horse: true } }]), IK));
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
    // 到着の段では采配に前へ呼ばせず、開戦の順を守る。
    for (const g of [...F.w1, F.iseW]) g.stay = true;
  },

  // 羽柴勢の棒も討たれた分だけ減らす（四万のまま動かない。両軍の今の数を出す 九3）
  onKill(rt, v) {
    if (v.team === 0) rt.flags.ak = (rt.flags.ak || 0) + 1;
    else if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1;
  },

  stage(rt, n) {
    const F = rt.flags;
    (F.log = F.log || []).push([n, Math.round(rt.t), Math.round(rt.player.u.pos.x), Math.round(rt.player.u.pos.z)]);
    F.stage = n; F.st0 = rt.t;
    rt.obj('main', TEXT[n], 'main');
    if (CUE[n]) rt.banner(CUE[n], '');
    if (n === 1) { March.start(rt, this.ctx(rt)); return; }
    if (n === 4) {
      rt.award((t) => t.side.push('斎藤利三の隊を崩した'), '斎藤利三の隊を崩した');
      for (const g of F.saiGs || []) if (live(g)) { g.routed = true; g.order = 'flee'; }
      Counter.start(rt, this.ctx(rt));
      return;
    }
    if (n === 7) { Pursuit.start(rt, this.ctx(rt)); return; }
    if (n === 2) {
      // 斎藤勢の先手が中ほどの浅瀬を渡り、高山の隊を押す（明智が押す場面）
      sfx('horagai', 0.9);
      // 先に伊勢貞興が中川の隊へ、続いて斎藤の先手が川を渡って高山の隊へ寄せる（明智が押す場面）
      if (live(F.iseW)) {
        F.iseW.stay = false;
        F.iseW.order = 'move'; F.iseW.dest = { x: -74, z: 14 }; F.iseW.aggro = 16; F.iseW.seekRange = 30;
        F.iseW.onArrive = (g) => { g.order = 'attack'; };
        rt.say('中川清秀', '伊勢の手が来たぞ！　槍を揃えよ！', 3);
        try { F.yfar?.tenno?.go?.(); } catch (e) { /* 遠景 */ }
      }
      // 寄せる先は高山の隊の列（主人公の持ち場はその右。横から当たれる）
      F.w1[0].dest = { x: -44, z: 16 }; F.w1[1].dest = { x: -30, z: 18 };
      rt.after(6, () => {
        if (F.stage !== 2) return;
        for (const g of F.w1) { g.stay = false; g.order = 'attack'; g.aggro = 14; g.seekRange = 30; }
        rt.say('高山右近', '斎藤の手が川を越えた！　押されるぞ、支えよ！', 3.4);
      });
      // 松田・並河は天王山の裾へ登って秀長・官兵衛の手と取り合う（中川の隊へ流れない）
      F.matsuda.order = 'move'; F.matsuda.dest = { x: -100, z: 4 }; F.matsuda.aggro = 8; F.matsuda.seekRange = 12;
      F.matsuda.onArrive = (g) => { g.order = 'attack'; g.aggro = 24; g.seekRange = 40; };
      if (live(F.ikeda)) { F.ikeda.order = 'move'; F.ikeda.dest = { x: HOLD.x - 4, z: HOLD.z }; F.ikeda.speed = 5; }
      if (F.ikeda) F.ikeda.onArrive = (g) => { g.order = 'attack'; g.aggro = 24; g.seekRange = 30; };
      if (F.tired && live(F.tired)) { F.tired.order = 'move'; F.tired.dest = { x: -20, z: 40 }; }
      // 堀秀政の後詰が南から着いて、押される高山の隊の後ろを支える（学び 四・六）
      rt.after(12, () => {
        F.hori = allyGroup(rt, { name: '堀秀政の隊', anchor: { x: 10, z: 70 }, facing: Math.PI, width: 10, formation: 'line', aggro: 30, seekRange: 50, morale: 95, noRout: true, fullStrength: true, speed: 4, dmgMult: 0.4 },
          fl(knot(20, [{ type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, horse: true } }]), HO));
        F.hori.order = 'move'; F.hori.dest = { x: -34, z: 26 }; F.hori.onArrive = (g) => { g.order = 'attack'; };
        rt.say('堀秀政', '後詰に着いたぞ。高山殿、持ちこたえよ！', 3);
      });
      rt.army.play('toki', { x: -20, z: -24 }, 1.4);
      rt.after(12, () => { try { F.yfar?.tenno?.go?.(); } catch (e) { /* 遠景 */ } });
      rt.after(40, () => report(rt, '天王山、秀長様の手が頂を押さえました！'));
      rt.after(100, () => report(rt, '淀川沿い、明智の左手は薄うござる。池田様の手が回りまする！'));
      rt.after(145, () => report(rt, '本能寺から逃れた者も、皆こちらで槍を取っておりまする！'));
      //   三度目の寄せ：天王山の裾から並河易家の手が下りて、中川の隊の横へ（天王山の取り合いが野へこぼれる）
      rt.after(118, () => {
        if (F.stage !== 2) return;
        F.namikawa = enemyGroup(rt, { name: '並河易家の手', faction: 'akechi', anchor: { x: -92, z: -24 }, facing: 0.4, width: 10, formation: 'line', order: 'move', aggro: 20, seekRange: 30, morale: 85, dmgMult: 0.5 },
          ak(knot(12)));
        F.namikawa.dest = { x: -50, z: 16 }; F.namikawa.onArrive = (g) => { g.order = 'attack'; };
        rt.army.play('toki', { x: -92, z: -24 }, 1.0);
        rt.say('中川清秀', '天王山の裾から新手じゃ！　高山殿の右を固めよ！', 3);
      });
      rt.after(22, () => rt.say('黒田官兵衛', '天王山の手はこちらが押さえた。山から撃ち下ろせ', 3.2));
      rt.after(30, () => rt.say('松田政近', '山を取られてなるものか。登れ、登れ！', 3));
    } else if (n === 3) {
      rt.award((t) => t.side.push('前線を押し上げ、斎藤勢を押し返した'), '前線を押し上げ、斎藤勢を押し返した');
      // 前衛に加わった並河の手も退かせる。
      for (const g of [...F.w1, F.iseW, F.namikawa]) if (live(g)) { g.routed = true; g.order = 'flee'; }
      rt.say('堀秀政', '押し返したぞ。川を渡れ、斎藤内蔵助の本隊を崩す！', 3.4);
      if (live(F.ikeda)) { F.ikeda.order = 'move'; F.ikeda.dest = { x: SAITO.x - 4, z: SAITO.z + 16 }; F.ikeda.onArrive = (g) => { g.order = 'attack'; g.aggro = 24; g.seekRange = 30; }; }
      // 斎藤利三の本隊は主人公から遠い北で出て、中ほどの持ち場へ歩いて南を向いて構える（斎藤本人は討てない。隊を崩す）
      F.saito = enemyGroup(rt, { name: '斎藤利三の隊', faction: 'akechi', anchor: { x: SAITO.x - 6, z: SAITO.z - 40 }, facing: 0, width: 14, formation: 'line', order: 'move', aggro: 12, seekRange: 18, morale: 85, dmgMult: 0.55 },
        ak(knot(26, [{ type: 'busho', n: 1, o: { name: '斎藤利三', invuln: true, horse: true } }])));
      F.saito.dest = { ...SAITO }; F.saito.onArrive = (g) => { g.order = 'hold'; g.aggro = 18; g.seekRange = 26; };
      F.saiReserve = enemyGroup(rt, { name: '斎藤利三の旗本', faction: 'akechi', anchor: { x: SAITO.x + 10, z: SAITO.z - 44 }, facing: 0, width: 8, formation: 'line', order: 'hold', aggro: 6, seekRange: 10, morale: 90, dmgMult: 0.5 },
        ak([{ type: 'samurai', n: 5 }, { type: 'ashigaru', n: 5, o: { flagScale: 1 } }]));
      F.saiReserve.stay = true;
      F.saiGs = [F.saito, F.saiReserve];
      F.saiN = allN(F.saiGs);
      // 前の高山・中川・堀も少し遅れて川を越えて押す（主人公が先に当たる）
      rt.after(12, () => {
        if (F.stage !== 3) return;
        for (const [g, d] of [[F.hori, { x: SAITO.x + 8, z: SAITO.z + 12 }], [F.taka, { x: SAITO.x - 10, z: SAITO.z + 12 }], [F.naka, { x: SAITO.x - 36, z: SAITO.z + 12 }]]) {
          if (!live(g)) continue;
          g.order = 'move'; g.dest = d; g.onArrive = (q) => { q.order = 'attack'; q.aggro = 30; q.seekRange = 40; };
        }
      });
      // 天王山の圧力：主人公は山へ登らない。遠くで味方の旗が山を上がり、使番が知らせる
      try { F.yfar?.tenno?.push('A', 0.3); } catch (e) { /* 遠景 */ }
      for (const f of F.tennoFlags || []) { f.position.z -= 18; f.position.y = rt.world.heightAt(f.position.x, f.position.z); }
      rt.after(6, () => rt.say('斎藤利三', '筑前の寄せ集めに、退く者があるか！　槍を揃えよ', 3));
      rt.after(22, () => report(rt, '山手、押しております！　秀長様の旗、天王山を上りまする！'));
      rt.after(60, () => report(rt, '斎藤の手、中ほどで粘っておりまする！'));
    } else if (n === 5) {
      rt.award((t) => t.side.push('押し返された中央を立て直した'), '押し返された中央を立て直した');
      // 明智の中央の二陣（阿閉貞征）が前へ出る。遠い北で出て持ち場へ歩く
      F.atsuji = enemyGroup(rt, { name: '阿閉貞征の隊', faction: 'akechi', anchor: { x: ATSUJI.x + 4, z: ATSUJI.z - 36 }, facing: 0, width: 14, formation: 'line', order: 'move', aggro: 14, seekRange: 22, morale: 85, dmgMult: 0.55 },
        ak(knot(24, [{ type: 'busho', n: 1, o: { name: '阿閉貞征', horse: true } }])));
      F.atsuji.dest = { ...ATSUJI }; F.atsuji.onArrive = (g) => { g.order = 'attack'; g.aggro = 24; g.seekRange = 32; };
      F.atsGs = [F.atsuji];
      F.atsN = allN(F.atsGs);
      // 殿の御牧兼顕の隊は、主人公から遠い御坊塚の前に先に出て構える（⑥で突きかかる）
      F.mimaki = enemyGroup(rt, { name: '御牧兼顕の殿', faction: 'akechi', anchor: { ...ISE }, facing: 0, width: 14, formation: 'line', order: 'hold', noRout: true, aggro: 8, seekRange: 12, morale: 99, dmgMult: 0.55 },
        ak(knot(22, [{ type: 'busho', n: 1, o: { name: '御牧兼顕', horse: true } }])));
      F.mimaki.stay = true;
      F.gobo = [F.mimaki];
      F.guardN = allN(F.gobo);
      if (live(F.ikeda)) { F.ikeda.order = 'move'; F.ikeda.dest = { x: ATSUJI.x - 2, z: ATSUJI.z + 18 }; F.ikeda.onArrive = (g) => { g.order = 'attack'; g.aggro = 24; g.seekRange = 30; }; }
      rt.after(10, () => {
        if (F.stage !== 5) return;
        for (const [g, d] of [[F.hori, { x: ATSUJI.x + 10, z: ATSUJI.z + 14 }], [F.taka, { x: ATSUJI.x - 12, z: ATSUJI.z + 14 }], [F.naka, { x: ATSUJI.x - 40, z: ATSUJI.z + 16 }]]) {
          if (!live(g)) continue;
          g.order = 'move'; g.dest = d; g.onArrive = (q) => { q.order = 'attack'; q.aggro = 30; q.seekRange = 40; };
        }
      });
      // 右（淀川側）：池田勢が東の浅瀬を渡り、津田信春の隊を破る（主人公からは右に見える明智の旗が下がる）
      F.tsuda = enemyGroup(rt, { name: '津田信春の隊', faction: 'akechi', anchor: { x: 74, z: -56 }, facing: 0.3, width: 10, formation: 'line', order: 'hold', aggro: 10, seekRange: 16, morale: 70, dmgMult: 0.5 },
        ak(knot(10, [{ type: 'busho', n: 1, o: { name: '津田信春', horse: true } }])));
      F.tsuda.stay = true;
      if (live(F.ikedaR)) {
        F.ikedaR.order = 'move'; F.ikedaR.dest = { x: 64, z: -18 }; F.ikedaR.speed = 4.2;
        F.ikedaR.onArrive = (g) => { g.order = 'move'; g.dest = { x: 72, z: -50 }; g.onArrive = (q) => { q.order = 'attack'; q.aggro = 24; q.seekRange = 30; }; };
      }
      rt.after(3, () => rt.say('堀秀政', '右も左も押しておる。中を割れ！', 3));
      F.tsudaN = allN(F.tsuda); F.tsudaBroken = false;
      // 左（天王山）：秀長の旗が山を下りて進む
      rt.after(46, () => {
        report(rt, '左手、秀長様の旗が天王山を下り、松田勢を押しまする！');
        try { F.yfar?.tenno?.push('A', 0.7); F.yfar?.tenno?.rout?.('B', { minFight: 4, hideAfter: 40 }); } catch (e) { /* 遠景 */ }
        if (live(F.matsuda)) { F.matsuda.routed = true; F.matsuda.order = 'flee'; }
        for (const f of F.tennoFlags || []) { f.position.z -= 30; f.position.x += 12; f.position.y = rt.world.heightAt(f.position.x, f.position.z); }
        dropFlags(rt, F.akFlagsL, 2.5);
      });
    } else if (n === 6) {
      rt.award((t) => t.side.push('川の北で阿閉貞征の隊を押し破った'), '川の北で阿閉貞征の隊を押し破った');
      report(rt, '明智勢、崩れます！');
      for (const g of rt.army.groups) if (g.team === 1 && live(g) && !g.honjin && g !== F.mimaki) { g.routed = true; g.order = 'flee'; }
      // 本能寺では味方の旗が次々消えた。山崎では明智の旗が次々消える（意図した対比）
      dropFlags(rt, F.akFlagsC, 3);
      // 総崩れ。御牧兼顕が殿となって御坊塚の前から突きかかる間に、光秀は旗本と勝竜寺城へ退く（光秀は討たない）
      F.mimaki.stay = false;
      F.mimaki.order = 'move'; F.mimaki.aggro = 12; F.mimaki.seekRange = 16;
      F.mimaki.dest = { x: GOBO_PIN.x, z: GOBO_PIN.z + 4 };
      F.mimaki.onArrive = (g) => { g.order = 'attack'; g.aggro = 30; g.seekRange = 44; };
      rt.after(6, () => {
        if (!F.mitsuG || F.ending) return;
        Pursuit.retreatToCastle(rt);
        rt.say('明智光秀', '……退け。勝竜寺へ退け', 3);
      });
      rt.after(9, () => rt.say('堀秀政', '日向の本陣が退くぞ。殿を破って追え！', 3));
      for (const [g, dx, w] of [[F.kato, 18, 6], [F.hori, -14, 12], [F.taka, -28, 18], [F.naka, -40, 24], [F.ikedaR, 30, 10]]) {
        rt.after(w, () => {
          if (F.stage !== 6 || !live(g)) return;
          g.order = 'move'; g.dest = { x: GOBO.x + dx, z: GOBO.z + 16 }; g.speed = 3.4; g.onArrive = (q) => { q.order = 'attack'; q.aggro = 30; q.seekRange = 40; };
        });
      }
      rt.army.play('toki', { x: GOBO.x, z: GOBO.z + 30 }, 1.4);
      rt.after(1.5, () => rt.say('御牧兼顕', '我らが討ち死にする間に、殿は引かれよ！　者ども、続け！', 3.6));
    }
  },
  // 段の中身（t01_yamazaki/*.js）へ渡す道具
  ctx(rt) {
    return { START, IK, HA, KU, fl, ak, knot, live, aliveN, allN, next: () => this.stage(rt, rt.flags.stage + 1), done: () => this.win(rt), toYamazaki: () => this.toYamazaki(rt) };
  },
  // ⑥の御牧の殿が破れた：勝ち鬨は上げず、⑦の追撃へ（光秀は勝竜寺城へ）
  mimakiBroken(rt) {
    const F = rt.flags;
    rt.award((t) => { t.special = { label: '大返しから山崎へ駆け、明智の中を割った', pts: 20 }; }, '御坊塚の前で御牧兼顕の殿を討ち破った');
    if (live(F.mimaki)) { F.mimaki.routed = true; F.mimaki.order = 'flee'; }
    rt.say('堀秀政', '御牧の殿は破れた！', 2.4);
    this.stage(rt, LAST);
  },
  // ⑦の後の余韻が済んだ：勝ちの締め（Pursuit の finale から）
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    (F.log = F.log || []).push(['win', Math.round(rt.t), Math.round(rt.player.u.pos.x), Math.round(rt.player.u.pos.z)]);
    //   主の任務の「済み」と勝ちの締めは、見出しの後に（共通の finish が先に結果へ送らない。critic60）
    F.stage = DONE; rt.heldWin = null;
    rt.player.u.invuln = true;
    rt.award((t) => { t.main = true; }, '退く光秀を勝竜寺城まで追った');
    rt.banner('山崎の戦い　羽柴勢の勝ち', '');
    rt.after(5, () => { if (rt.over) return; rt.objDone('main'); rt.tracker.main = true; rt.finish({ scriptedEnd: true }, 4.5); });
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
    // やり直した時、討たれた時に倒れた馬（死の姿）に乗ったまま戻る。馬を起こし、倒れた馬の列から外す（critic60：馬ごと横倒しのまま滑る。九6）
    //   戻しは player.mounted だけを戻し、兵の側（army.setMounted）は降りたまま。馬は場面の外（0,0,0）に残り、体だけが地面を滑った（11/6 の試し）
    const pl = rt.player, H = pl.mounted && pl.horse?.userData.horse;
    if (H && pl.u.alive && (H.dead || !pl.u.mounted || pl.horse.parent !== pl.u.mesh)) {
      H.dead = false; H.deadT = 0; if (H.real) H.real.oneK = null;
      const L = rt.army.fallenHorses, i = L ? L.findIndex((o) => o.h === pl.horse) : -1;
      if (i >= 0) L.splice(i, 1);
      pl.horseHp = Math.max(pl.horseHp || 0, 40);
      if (pl.u.mounted && pl.horse.parent !== pl.u.mesh) rt.army.setMounted(pl.u, false);
      if (!pl.u.mounted) { if (pl.horse.parent) pl.horse.parent.remove(pl.horse); pl.loose = null; rt.army.setMounted(pl.u, true, pl.horse); }
    }
    // 両軍の討死は onKill で数える。退いて消えた兵も alive=false になるため、全員を走査すると討死に混ざる。
    // 勝ち鬨と秀吉・官兵衛の言葉の間は、共通の「止めておいた勝ち」（殿の将を自分で討つと立つ）で先に締めない（11/6 の三度目：勝ちの二秒後に「合戦に勝利」で言葉が切れた）
    if (F.stage >= 6 && rt.heldWin) rt.heldWin = null;
    if (F.ending) return;
    // 序（備中の本陣と大返し）
    if (!F.stage) { if (F.pro) Ogaeshi.tick(rt, dt, this.ctx(rt)); return; }
    const P = rt.player.u.pos;
    // 主人公が倒れている間（やり直しの札の間）は段を進めない。倒れたまま味方だけで勝ちにしない（critic60・三3）
    if (!rt.player.u.alive || rt.retryOpen) return;
    if (F.stage >= 2 && F.stage <= 4 && broken(F.naka) && broken(F.taka)) { this.lose(rt, '前で支える中川・高山の隊が崩れた'); return; }
    // 一度着いても、持ち場を離れた後に味方だけで敵を破って果たした事にしない。
    const field = [null, null, HOLD, SAITO, Counter.STAND, ATSUJI, GOBO_PIN, null][F.stage];
    F.fieldAt = field && dist(P, field) < 30 ? F.stage : 0;
    // 池田勢は主人公の脇に付く（離れたら寄る・近ければ戦う）
    if (live(F.ikeda) && (F.escT = (F.escT || 0) - dt) <= 0) {
      F.escT = 0.5;
      const c = F.ikeda.center();
      const far = c ? Math.hypot(c.x - P.x, c.z - P.z) : 0;
      // 遠く遅れた時は道々の小競り合いに足を止めず、主人公の所まで駆け寄る（kaito 一5：味方の隊も同じ速さで目標へ）
      //   主人公の駆け足（約5m/秒・player.js）に足軽の駆け足（4.3）は追いつけないので、離れた間だけ主人公と同じ速さにする
      for (const u of F.ikeda.units) { if (u._run0 == null) u._run0 = u.run; u.run = far > 12 ? Math.max(u._run0, 5) : u._run0; }
      //   行き先は主人公が六歩より動いた時だけ置き直す（半秒ごとに置き直すと隊が組み直しを繰り返し、浅瀬の段で七十も遅れた）
      //   浅瀬の段は、行き先を渡った北の岸に一度だけ決めて主人公と並んで駆ける（主人公を追って行き先を置き直すたびに、
      //   隊は下知の合図を待って一秒止まり、七十 m 遅れた。critic60・一5）
      if (F.stage === 1) { for (const u of F.ikeda.units) u.run = u._run0; }   // 到着の段は疲れた足で街道を歩く（March が行き先を決める）
      else if ((F.stage >= 3 && F.stage <= 5 || F.stage === 7) && F.ikeda.order === 'move' && F.ikeda.onArrive) {
        // 主人公の渡河が済んでも池田勢は北岸まで渡る。反撃の北岸への移動・追撃の陣幕の迂回も、着く前に追従で下知を消さない。
      } else if (c && far > 9) { if (F.ikeda.order !== 'move' || !F.ikeda.dest || dist(F.ikeda.dest, P) > 6) { F.ikeda.order = 'move'; F.ikeda.dest = { x: P.x, z: P.z + 3 }; } F.ikeda.onArrive = null; }
      else if (F.ikeda.order === 'move' && !F.ikeda.onArrive) { F.ikeda.order = 'attack'; F.ikeda.aggro = 24; F.ikeda.seekRange = 30; }
    }
    // 逃げて遠くへ去った明智勢は消す（本物の兵の数を次の備に残す）
    if ((F.gcT = (F.gcT || 0) - dt) <= 0) {
      F.gcT = 1;
      for (const u of rt.army.units) if (u.alive && !u.gone && u.team === 1 && (u.fleeing || u.group?.routed) && !u.group?.honjin && dist(u.pos, P) > 60) rt.army.despawn(u);
    }
    if (F.stage === 1) March.tick(rt, dt, this.ctx(rt));
    else if (F.stage === 2) {
      const n = aliveN(F.w1) + aliveN(F.iseW) + aliveN(F.namikawa);
      // 時刻だけで健在の伊勢勢を押し返したと知らせない。実際の損耗・敗走を待つ。
      if (F.iseW && (F.iseW.routed || aliveN(F.iseW) <= allN(F.iseW) * 0.3)) {
        report(rt, '中川様の手、伊勢貞興の手を押し返しました！');
      }
      // 前衛の押し合いは三分ほど（伊勢・斎藤の先手と、天王山からの新手。学び 十2）。押し返せば主力が展開して浅瀬へ
      // 時間だけでは押し返した事にしない。持ち場へ着き、寄せた敵が減ってから進む。
      if (F.fieldAt === 2 && n <= (F.w1N + allN(F.iseW) + allN(F.namikawa)) * 0.3 && rt.t - F.st0 > 170) this.stage(rt, 3);
    } else if (F.stage === 3) {
      //   利三は五十秒で旗本を前へ出す（押し合いの山）。斎藤本人は討てない。隊を崩す
      if (!F.saiBack && rt.t - F.st0 > 50) {
        F.saiBack = true;
        const g = F.saiReserve;
        if (live(g)) {
          g.stay = false; g.order = 'move'; g.dest = { x: SAITO.x + 6, z: SAITO.z + 2 };
          g.aggro = 24; g.seekRange = 34;
          g.onArrive = (q) => { q.order = 'attack'; };
        }
        rt.say('斎藤利三', '旗本、前へ出よ！　筑前の寄せを川へ押し戻せ！', 3);
      }
      if (F.fieldAt === 3 && aliveN(F.saiGs) <= F.saiN * 0.25 && rt.t - F.st0 > 95) this.stage(rt, 4);
    } else if (F.stage === 4) Counter.tick(rt, dt, this.ctx(rt));
    else if (F.stage === 5) {
      // 池田勢が浅瀬へ向かうだけで津田勢を破った事にしない。実際の損耗を待って旗と知らせをそろえる。
      if (!F.tsudaBroken && F.tsudaN > 0 && aliveN(F.tsuda) <= F.tsudaN * 0.3) {
        F.tsudaBroken = true;
        if (live(F.tsuda)) { F.tsuda.routed = true; F.tsuda.order = 'flee'; }
        dropFlags(rt, F.akFlagsR, 2.5);
        report(rt, '右手、津田の隊が崩れまする！');
      }
      if (F.fieldAt === 5 && aliveN(F.atsGs) <= F.atsN * 0.25 && rt.t - F.st0 > 80) this.stage(rt, 6);
    } else if (F.stage === 6) {
      // 殿が散って残りが行き先から離れた時も、主人公の方へ突きかからせる（勝ちまで行き詰まらない）
      const late = rt.t - F.st0 > 100;
      if (late && live(F.mimaki) && (F.mkT = (F.mkT || 0) - dt) <= 0) {
        F.mkT = 3;
        const g = F.mimaki, c = g.center();
        // 障害物を避ける途中の下知は残す。同じ所へ呼ぶたびに経路を作り直さない。
        if (!(g.order === 'move' && g._tateRe)) {
          g.order = c && dist(c, P) > 30 ? 'move' : 'attack';
          if (g.order === 'move' && (!g.dest || dist(g.dest, P) > 6)) g.dest = { x: P.x, z: P.z };
        }
        g.aggro = 40; g.seekRange = 60;
      }
      // 遠くに散っただけの健在な殿も数える。移動の下知で呼び戻し、討たずに達成させない。
      const left = aliveN(F.gobo);
      // 刻限だけで殿を討ち破った事にしない。主人公が御坊塚の前へ着き、殿が実際に減ってから追撃へ進む。
      if (F.fieldAt === 6 && left <= F.guardN * (late ? 0.4 : 0.25) && rt.t - F.st0 > 80) this.mimakiBroken(rt);
    } else if (F.stage === 7) Pursuit.tick(rt, dt, this.ctx(rt));
  },
};

// 目標の並び（goals5.js の def.goals5）：5つの場所と行い。「敵を何人討つ」は入れない。崩す備は倒した数を出す
const at = (n) => (rt) => (rt.flags.stage ?? 0) > n;
t01_yamazaki.goals5 = () => TEXT.slice(1).map((text, i) => {
  const k = i + 1, gs = [null, null, 'w1', 'saiGs', 'cntGs', 'atsGs', 'gobo', null][k];
  return { kind: 'stage', k: i, text, noun: NOUN[k], check: at(k), ...(gs ? { groups: (rt) => [].concat(rt.flags[gs] || [], k === 2 ? [rt.flags.iseW, rt.flags.namikawa].filter(Boolean) : []) } : {}) };
});
STAGES.t01_yamazaki = TEXT.slice(1).map((t, i) => (i ? [t, (rt) => (rt.flags.stage ?? 0) >= i + 1] : [t]));

// bot：近い敵（逃げる者・討てない者は追わない）を突き、いなければ段の行き先へ。浅瀬の段は川を渡りきるまで寄り道しない
t01_yamazaki.botBrain = (b, inp, { goTo, patientStrike }) => {
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive || F.ending || F.holdPlayer) return;
  if (!F.stage && !F.pro) return;
  const ok = (o) => !o.fleeing && !o.noTarget && !o.invuln && !o.group?.routed && Math.abs(o.pos.y - u.pos.y) < 3;
  // ①は高山の陣の右の持ち場で受ける（逃げる斎藤勢を追って川の北へ一人で深入りしない。遊ぶ人も行き先の▼の所で戦う）
  //   ④の立て直しも中央の岸で受ける（寄せる旗本を追って岸を離れると、食い止めた時が数えられない）
  const inHold = (o) => F.stage === 2 ? dist(o.pos, HOLD) < 30 : F.stage === 4 ? dist(o.pos, Counter.STAND) < 26 : true;
  const e = b.army.nearestEnemy(u, !F.stage ? 8 : F.stage === 1 && F.mStep !== 1 ? 5 : 12, (o) => ok(o) && inHold(o));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
    patientStrike(p, inp, e, d, true);
    return;
  }
  inp.guardHold = false;
  // 隊の真ん中は、逃げる者を除いた構える者だけで取る（崩れて北へ逃げる隊を追って勝竜寺城まで行かない）
  const c = (gs) => { const L = [].concat(gs || []).flatMap((g) => (g ? g.units : [])).filter((o) => o.alive && !o.gone && ok(o)); if (!L.length) return null;
    return { x: L.reduce((s, o) => s + o.pos.x, 0) / L.length, z: L.reduce((s, o) => s + o.pos.z, 0) / L.length }; };
  let t = HOLD;
  if (!F.stage) { t = Ogaeshi.botTarget(F); if (!t) return; }
  else if (F.stage === 1) t = (F.mStep < 3 && c(March.foes(F))) || March.JOIN;
  else if (F.stage === 2) { const w = c([F.w1, F.iseW].flat()); t = w && dist(w, HOLD) < 30 ? w : HOLD; }
  else if (F.stage === 3) t = c(F.saiGs) || SAITO;
  else if (F.stage === 4) { const w = c(F.cntGs); t = w && dist(w, Counter.STAND) < 24 ? w : Counter.STAND; }
  else if (F.stage === 5) t = c(F.atsGs) || ATSUJI;
  // 殿が先に倒れた時も、⑥の達成を確かめる御坊塚の前へ進む。本陣の前は印から四十四歩離れている。
  else if (F.stage === 6) t = (aliveN(F.gobo) > (F.guardN || 0) * 0.4 && c(F.gobo)) || GOBO_PIN;
  else t = (!F.pStep && c(F.rearGs)) || Pursuit.GATE;
  goTo(p, inp, t.x, t.z, 2.5);
};
// 途中から続ける（battle_checkpoint.js）：CP1 備中の急報の後・CP2 姫路を出た後・CP3 山崎の布陣・CP4 中央の膠着の後・CP5 明智崩れの前（指示書）。
//   序の三幕と山崎の七段の始まりを順に流し直す
const resumeFn = (k) => function (rt) { if (k === 'p1' || k === 'p2' || k === 'p3') Ogaeshi.resumeScene(rt, this.ctx(rt), Number(k[1])); else if (k === 1) this.toYamazaki(rt, true); else this.stage(rt, k); };
t01_yamazaki.resumeSteps = ['p1', 'p2', 'p3', 1, 2, 3, 4, 5, 6, 7].map((k) => [k, resumeFn(k)]);
t01_yamazaki.checkpointStep = (rt) => { const F = rt.flags; return F.stage >= 1 && F.stage <= LAST ? F.stage : !F.stage && F.pro ? 'p' + F.pro : null; };
t01_yamazaki.resumeAt = (rt, step) => {
  if (typeof step === 'string') return Ogaeshi.SCENE[Number(step[1])]?.at || null;
  return [null, START, March.JOIN, HOLD, SAITO, Counter.STAND, ATSUJI, GOBO_PIN][step] || null;
};
withGuard(t01_yamazaki);

export { t01_yamazaki };
