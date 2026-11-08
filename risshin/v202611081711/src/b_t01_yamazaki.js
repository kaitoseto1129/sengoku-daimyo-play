// ======================================================================
// 豊臣編 1. 山崎の戦い（docs/chapter2_toyotomi.md の「1. 山崎の戦い」。調べは docs/battle_refs/t01_yamazaki.md）
// 天正十年（1582）六月十三日の午後四時ごろ。天王山と淀川の間の狭い野、円明寺川。主人公は池田恒興の手の侍大将。
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
import * as THREE from 'three';
import { goalsTick } from './hud_goals.js';
import { sightUnit } from './battle_sight.js';

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
const START = { x: -6, z: 54 };
const HOLD = { x: -20, z: 14 };           // 高山右近の陣の右（中ほどの浅瀬の南）
const FORD_S = { x: 62, z: 14 };          // 東の浅瀬の南の岸
const FORD_N = { x: 64, z: -16 };         // 渡った北の岸
const TSUDA = { x: 70, z: -50 };          // 津田信春の隊（明智の左手・淀川側）
const SAITO = { x: -4, z: -36 };          // 斎藤利三の隊（中ほど。南を向く）
const ISE = { x: 14, z: -104 };           // 伊勢貞興の隊（明智の二陣。御坊塚の前）
const GOBO = { x: 18, z: -140 };          // 御坊塚の光秀の本陣の前
const GOBO_PIN = { x: 16, z: -96 };       // ⑤の行き先（御坊塚の前。殿の御牧の隊がここへ突きかかる。動かさない）
const HONJIN_A = { x: 18, z: -158 };      // 光秀の床几（陣幕の中）
const SHORYUJI = { x: 64, z: -186 };      // 勝竜寺城の前（光秀の退く先）
const HIDE = { x: -34, z: 112 };          // 秀吉の本陣（南の後ろ。宝積寺の麓。振り返ると陣幕と名が見える近さに。critic60：秀吉がどこにいるか分からない）
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
    const out = progress.call(this, battle);
    if (battle === rt && this.prog && !rt.over) {
      const def = rt.def, one = def.missionSingleLine;
      def.missionSingleLine = false;
      try { goalsTick(this.prog, rt); } finally { def.missionSingleLine = one; }
    }
    return out;
  };
  const foeMarks = hud.foeMarks, tris = [], box = document.createElement('div'), v = new THREE.Vector3();
  box.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none';
  box.setAttribute('aria-hidden', 'true');
  hud.root.appendChild(box);
  hud.foeMarks = function (battle) {
    const out = foeMarks.call(this, battle);
    if (battle !== rt) return out;
    const me = rt.player.u;
    const on = me.alive && !rt.over && !rt.choice && !this.introWaiting && !rt.player.camShot && !this.bigmap && !this.root.classList.contains('photo');
    let n = 0;
    if (on) for (const u of rt.army.units) {
      if (n >= 90) break;
      if (!u.alive || u.gone || u.dying || u.woundOut || u.noTarget || u.isStruct || u.civ || u.team === me.team || u.team > 1 || u._nearSignOn ||
          u.mesh?.visible === false || u.camHidden || (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 > 3600) continue;
      if (!(u._yamSeenAt > rt.t - .34 && u._yamSeenAt <= rt.t)) { u._yamSeen = sightUnit(rt, u); u._yamSeenAt = rt.t; }
      if (!u._yamSeen) continue;
      v.set(u.pos.x, u.pos.y + (u.mounted ? 3.2 : 2.25), u.pos.z).project(rt.camera);
      if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      let el = tris[n];
      if (!el) {
        el = tris[n] = document.createElement('span');
        el.textContent = '▼';
        el.style.cssText = 'position:absolute;left:0;top:0;color:#ff4a2e;font-size:22px;line-height:1;-webkit-text-stroke:1px #2a0d06;text-shadow:0 1px 2px #000;pointer-events:none';
        box.appendChild(el);
      }
      n++;
      el.hidden = false;
      el.style.transform = `translate(${((v.x + 1) * innerWidth / 2).toFixed(1)}px,${((1 - v.y) * innerHeight / 2).toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (let i = n; i < tris.length; i++) tris[i].hidden = true;
    return out;
  };
  const dispose = rt.dispose;
  rt.dispose = function () {
    hud.foeMarks = foeMarks; box.remove();
    hud.progress = progress;
    if (hud.prog) hud.prog.classList.remove('goal-mode');
    hud.root.classList.remove('yam-goals'); style.remove();
    return dispose.call(this);
  };
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
  introText: () => '雨の夕方。天王山の麓、円明寺川の向こうに明智の桔梗の旗が並ぶ。',
  // 始まりの札は戦の名・年・味方対敵（数）・二三行だけ（kaito 五4・十二1）
  introSides: { a: '羽柴 四万', b: '明智 一万六千' },
  introPeople: [],
  // 右上は今の目標を番号付きで（「味方の旗へ」「見えぬ敵の陣を物見する」に替えない。kaito 三1・十1）
  missionHeading: (rt) => { const n = Math.min(5, Math.max(1, rt.flags.stage || 1)); return NUM[n - 1] + TEXT[n]; },
  // 倒れた札に案内の字（「味方のそばで戦おう」）を添えない（kaito 五1）
  retryAdvice: () => ' ',
  // 途中の共通の見出し（「一騎打ち」「敵将が倒れた」「敵の隊が崩れた」）は説明の字なので出さない（五1。11/6 の流しで一つの戦に四つ出た）
  bannerAllowed: (rt, t) => t !== '一騎打ち' && t !== '敵将が倒れた' && t !== '敵の隊が崩れた',
  missionSingleLine: true,
  goalsAllRows: true,         // 共通の目標札も五つの行を作る。単一行の解除だけでは今の一行しか残らない。
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
  nameRange: 90,              // 名のある将の名は遠くからも出す（既定の十八では斎藤・津田・御牧の名が一度も見えなかった。kaito 五2・九3）
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
    const k = [0, 0.05, 0.15, 0.3, 0.55, 0.8, 0.86][Math.min(6, F.stage || 0)];
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
    // 申の刻（午後四時ごろ。旧暦六月十三日＝七月二日で日の入りは七時過ぎ）の雨。夕焼けの赤い空は時刻にも雨にも合わない（critic60：④だけ空が赤い）。
    //   雨雲の下の昼過ぎの暗さ（雨は小雨 0.3 のまま）
    time: 'storm',
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
    F.mitsuG = honjinGuard(rt, 1, { x: HONJIN_A.x, z: HONJIN_A.z + 4 }, 0, '明智光秀の旗本', '明智光秀', AK.flag, 14, true);   // 光秀は⑤で馬に乗って勝竜寺城へ退く
    F.mitsuU = F.mitsuG.units.find((u) => u.name === '明智光秀');
    shoryujiFront(rt);
    for (const [x, z] of [[-80, 34], [-46, 30], [-14, 66]]) rt.scene.add(nobori(rt.world, x, z, HA));
    // 天王山の裾の秀長・官兵衛の手の幟（川手の野から山の手の取り合いの場所が見える。critic60：天王山が霧の山の絵のまま）
    for (const [x, z, m] of [[-112, 32, KU], [-116, 20, HA], [-108, 12, KU], [-120, 40, HA]]) rt.scene.add(nobori(rt.world, x, z, m));
    // 後ろの秀吉の本陣の幟（振り返ると陣幕と旗が見える）
    for (const [x, z] of [[HIDE.x - 12, HIDE.z - 10], [HIDE.x + 12, HIDE.z - 10], [HIDE.x, HIDE.z - 14]]) rt.scene.add(nobori(rt.world, x, z, HA));
    for (const [x, z] of [[-10, -50], [70, -64], [10, -130], [30, -130]]) rt.scene.add(nobori(rt.world, x, z, AK.flag));
    // 天王山の裾を押さえる秀長・官兵衛の手（鉄砲で撃ち下ろす）
    F.tenno = allyGroup(rt, { name: '羽柴秀長の隊', anchor: { x: -104, z: 26 }, facing: Math.PI, width: 10, aggro: 10, seekRange: 34, morale: 95, noRout: true, fullStrength: true, order: 'hold' },
      fl([{ type: 'busho', n: 1, o: { name: '羽柴秀長', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '黒田官兵衛', invuln: true, horse: true, flag: KU } },
        { type: 'gun', n: 9 }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }], HA));   // 鉄砲を厚く（山から撃ち下ろす煙が野から見える。critic60：天王山が台詞だけ）
    // 前で支える中川・高山の隊（二人は史実で生き残るので討たれない）
    F.naka = allyGroup(rt, { name: '中川清秀の隊', anchor: { x: -74, z: 20 }, facing: Math.PI, width: 10, formation: 'line', aggro: 14, morale: 90, noRout: true, fullStrength: true, dmgMult: 0.4 },
      fl(knot(22, [{ type: 'busho', n: 1, o: { name: '中川清秀', invuln: true, horse: true } }]), HA));
    F.taka = allyGroup(rt, { name: '高山右近の隊', anchor: { x: -42, z: 18 }, facing: Math.PI, width: 10, formation: 'line', aggro: 14, morale: 90, noRout: true, fullStrength: true, dmgMult: 0.38 },
      fl(knot(22, [{ type: 'busho', n: 1, o: { name: '高山右近', invuln: true, horse: true } }]), HA));
    // 主人公の付く池田勢（主人公の脇に付いて動く）
    F.ikeda = allyGroup(rt, { name: '池田恒興の隊', anchor: { x: START.x + 4, z: START.z + 6 }, facing: Math.PI, width: 10, formation: 'line', aggro: 12, morale: 95, noRout: true, fullStrength: true, speed: 5, dmgMult: 0.45 },
      fl(knot(26, [{ type: 'busho', n: 1, o: { name: '池田恒興', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '池田元助', invuln: true, horse: true } }]), IK));   // 嫡男の元助も共に渡った（学び 二・四）
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
    yamGoalBoard(rt);
    // 勝ち（段 6）の後は、この戦の締め（勝ち鬨と言葉の十六秒半の後）だけで結果へ。殿の将を討った等の共通の勝ちで先に締めない
    const fin0 = rt.finish;
    rt.finish = function (info = {}, ...rest) {
      if (F.stage === 6 && !info.scriptedEnd && !info.down) return;
      return fin0.call(this, info, ...rest);
    };
    // 共通の「横槍が入ったぞ」は、池田勢が明智の横を突く③④の間に一度だけ（critic60：一つの戦で五回以上同じ台詞）
    const say0 = rt.say;
    rt.say = function (who, text, ...rest) {
      if (typeof text === 'string' && /横槍/.test(text)) { if (F.yokoSaid || (F.stage || 0) < 3) return false; F.yokoSaid = true; }
      return say0.call(this, who, text, ...rest);
    };
    // 雨の夕方（公家の日記に雨。鉄砲は撃てる小雨）
    if (rt.world.setRainTarget) { rt.world.setRainTarget(0.3); rt.world.rainLevel = 0.3; }
    rt.say('羽柴秀吉', '備中から駆け通して来たぞ。上様の仇、日向を討つは今ぞ', 3.6);
    rt.after(3.2, () => rt.say('池田恒興', '川の向こう、日向の左手、淀川の方は手薄じゃ', 3.2));
    rt.after(6.5, () => { F.holdPlayer = false; this.stage(rt, 1); });
  },

  // 羽柴勢の棒も討たれた分だけ減らす（四万のまま動かない。両軍の今の数を出す 九3）
  onKill(rt, v) {
    if (v.team === 0) rt.flags.ak = (rt.flags.ak || 0) + 1;
    else if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1;
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
      // 松田・並河は天王山の裾へ登って秀長・官兵衛の手と取り合う（中川の隊へ流れない）
      F.matsuda.order = 'move'; F.matsuda.dest = { x: -100, z: 4 }; F.matsuda.aggro = 8; F.matsuda.seekRange = 12;
      F.matsuda.onArrive = (g) => { g.order = 'attack'; g.aggro = 24; g.seekRange = 40; };
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
      rt.say('池田恒興', '今じゃ。東の浅瀬を渡り、日向の左手を突く。ついて参れ！', 3.6);
      F.ikeda.order = 'move'; F.ikeda.dest = { ...FORD_S }; F.ikeda.onArrive = null;
      //   逃げる斎藤勢を追って持ち場に残らず、主人公と一緒に東へ駆ける（critic60：浅瀬へ主人公が一人で七十 m 先を走った）
      F.ikeda.aggro = 5; F.ikeda.seekRange = 6;
      for (const u of F.ikeda.units) if (u.alive && u.target && u.target.fleeing) u.target = null;
      // 川向こうの見張りの鉄砲（渡る時に撃たれる）
      F.bank = enemyGroup(rt, { name: '津田勢の鉄砲', faction: 'akechi', anchor: { x: 70, z: -28 }, facing: 0, width: 10, formation: 'line', order: 'hold', aggro: 14, seekRange: 30, dmgMult: 0.3 },
        ak([{ type: 'gun', n: 4 }, { type: 'ashigaru', n: 5, o: { flagScale: 1 } }, { type: 'samurai', n: 1 }]));
      // 津田信春の隊は主人公から遠い北で出て、淀川沿いの持ち場へ歩いて構える（目の前に湧かせない。kaito 四1）
      F.tsuda = enemyGroup(rt, { name: '津田信春の隊', faction: 'akechi', anchor: { x: TSUDA.x + 6, z: TSUDA.z - 44 }, facing: 0.3, width: 12, formation: 'line', order: 'move', aggro: 8, seekRange: 12, morale: 85, dmgMult: 0.55 },
        ak(knot(24, [{ type: 'busho', n: 1, o: { name: '津田信春', horse: true } }])));
      F.tsuda.dest = { ...TSUDA }; F.tsuda.onArrive = (g) => { g.order = 'hold'; };
      //   池田勢が渡りきるまでは、敵の采配に呼ばれて浅瀬の南の岸まで寄せて来ない（川の上の鉄砲で撃つだけ。主人公一人が囲まれない）
      F.tsuda.stay = F.bank.stay = true;
      F.tsudaGs = [F.tsuda, F.bank];
      F.tsudaN = allN(F.tsudaGs);
    } else if (n === 3) {
      rt.award((t) => t.side.push('東の浅瀬で円明寺川を渡った'), '東の浅瀬で円明寺川を渡った');
      F.tsuda.order = 'attack'; F.tsuda.aggro = 22; F.tsuda.seekRange = 34; F.tsuda.onArrive = null;
      F.tsuda.stay = F.bank.stay = false;
      // 斎藤利三の本隊も主人公から遠い所で出て、中ほどの持ち場へ歩いて南を向いて構える（④で横から突く）
      F.saito = enemyGroup(rt, { name: '斎藤利三の隊', faction: 'akechi', anchor: { x: SAITO.x - 6, z: SAITO.z - 40 }, facing: 0, width: 14, formation: 'line', order: 'move', aggro: 10, seekRange: 14, morale: 85, dmgMult: 0.55 },
        ak(knot(28, [{ type: 'busho', n: 1, o: { name: '斎藤利三', invuln: true, horse: true } }])));
      F.saito.dest = { ...SAITO }; F.saito.onArrive = (g) => { g.order = 'hold'; };
      F.saiGs = [F.saito];
      F.saiN = allN(F.saiGs);
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
      F.saito.order = 'hold'; F.saito.aggro = 18; F.saito.seekRange = 26; F.saito.onArrive = null;
      // 殿の御牧兼顕の隊は、主人公から遠い御坊塚の前に先に出て構える（⑤で突きかかる）
      F.mimaki = enemyGroup(rt, { name: '御牧兼顕の殿', faction: 'akechi', anchor: { ...ISE }, facing: 0, width: 14, formation: 'line', order: 'hold', noRout: true, aggro: 8, seekRange: 12, morale: 99, dmgMult: 0.55 },
        ak(knot(26, [{ type: 'busho', n: 1, o: { name: '御牧兼顕', horse: true } }])));
      F.mimaki.stay = true;   // ④の間は敵の采配に呼ばれて野へ出ない（⑤で御坊塚の前の行き先へ突きかかる）
      F.gobo = [F.mimaki];
      F.guardN = allN(F.gobo);
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
      for (const g of rt.army.groups) if (g.team === 1 && live(g) && !g.honjin && g !== F.mimaki) { g.routed = true; g.order = 'flee'; }
      // 総崩れ。御牧兼顕が殿となって御坊塚の前から突きかかる間に、光秀は旗本と勝竜寺城へ退く（学び 四・六）
      //   殿は御坊塚の前の行き先（⑤の▼）へ駆け出て、そこで槍を合わせる（野の奥で別の隊とだけ戦わない）
      F.mimaki.stay = false;
      F.mimaki.order = 'move'; F.mimaki.aggro = 12; F.mimaki.seekRange = 16;
      F.mimaki.dest = { x: GOBO_PIN.x, z: GOBO_PIN.z + 4 };
      F.mimaki.onArrive = (g) => { g.order = 'attack'; g.aggro = 30; g.seekRange = 44; };
      // 光秀は御坊塚の古墳から降りて、旗本に囲まれて北東の勝竜寺城へ退く（目に見える所で。討てない）
      rt.after(6, () => {
        if (!F.mitsuG || F.ending) return;
        F.mitsuG.fixed = false; F.mitsuG.order = 'retreat'; F.mitsuG.dest = { x: SHORYUJI.x, z: SHORYUJI.z - 12 }; F.mitsuG.speed = 2.6;
        rt.say('明智光秀', '……退け。勝竜寺へ退け', 3);
      });
      rt.after(9, () => rt.say('池田恒興', '日向が退くぞ。殿を破って追え！', 3));   // 秀吉は後ろの本陣（遅参説も）。前で叫ぶのは池田
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
    // ⑤にも印を付ける（右の並びは段で見る）。主の任務の「済み」と勝ちの締めは、勝ち鬨と官兵衛の言葉の後に
    //   （共通の finish は勝ちを四秒半で結果へ送り、共通の締め goalsDoneTick も二秒半で走るので、先に済みにすると勝ちの札と言葉が切れて昇進の画面へ飛んだ。critic60）
    F.stage = 6; rt.heldWin = null;
    rt.player.u.invuln = true;
    rt.award((t) => { t.main = true; t.special = { label: '円明寺川を渡り、明智の横を突き破った', pts: 20 }; }, '御坊塚の前で御牧兼顕の殿を討ち破った');
    rt.banner('山崎の戦い　勝ち', '光秀は勝竜寺城へ退いた');
    if (live(F.mimaki)) { F.mimaki.routed = true; F.mimaki.order = 'flee'; }
    // 光秀と旗本は勝竜寺城へ退く（⑤の初めに退き始めている）
    if (F.mitsuG && F.mitsuG.fixed) { F.mitsuG.fixed = false; F.mitsuG.order = 'retreat'; F.mitsuG.dest = { x: SHORYUJI.x, z: SHORYUJI.z - 12 }; F.mitsuG.speed = 2.6; }
    rt.say('池田恒興', '御牧の殿は破れた。勝ち鬨じゃ！', 3);
    rt.after(3.5, () => rt.say('羽柴秀吉', '日向は勝竜寺へ逃げたが、もう終いよ。ようやった', 4));
    // 光秀の最期（小栗栖）はこの夜より後の事。夕方のうちに「討たれた」と知らせない
    rt.after(8, () => rt.say('黒田官兵衛', '勝竜寺は小城。日向は夜のうちに城を抜け、坂本へ落ちましょう。道々の郷人が黙ってはおりますまい', 4.5));
    rt.after(13, () => rt.say('黒田官兵衛', 'さて、上様の跡目を巡って、柴田殿とはいずれ……', 4));
    rt.after(17.5, () => { if (rt.over) return; rt.objDone('main'); rt.tracker.main = true; rt.finish({ scriptedEnd: true }, 4.5); });
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
    if (F.ending && F.stage === 6 && rt.heldWin) rt.heldWin = null;
    if (F.ending || !F.stage) return;
    const P = rt.player.u.pos;
    // 主人公が倒れている間（やり直しの札の間）は段を進めない。倒れたまま味方だけで勝ちにしない（critic60・三3）
    if (!rt.player.u.alive || rt.retryOpen) return;
    if (F.stage <= 3 && broken(F.naka) && broken(F.taka)) { this.lose(rt, '前で支える中川・高山の隊が崩れた'); return; }
    // 味方だけで敵を破っても、主人公が持ち場へ着くまでは果たした事にしない。
    const field = [null, HOLD, null, TSUDA, SAITO, GOBO_PIN][F.stage];
    if (field && dist(P, field) < 30) F.fieldAt = F.stage;
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
      if (F.stage === 2) {
        if (!F.ikFord) { F.ikFord = true; F.ikeda.order = 'move'; F.ikeda.dest = { x: FORD_S.x - 2, z: FORD_S.z + 2 }; F.ikeda.speed = 5;
          F.ikeda.onArrive = (g) => { g.order = 'move'; g.dest = { x: FORD_N.x - 4, z: FORD_N.z + 2 }; g.onArrive = (q) => { q.order = 'attack'; q.aggro = 10; q.seekRange = 12; }; }; }
        for (const u of F.ikeda.units) u.run = Math.max(u._run0, 5);
      } else if (c && far > 9) { if (F.ikeda.order !== 'move' || !F.ikeda.dest || dist(F.ikeda.dest, P) > 6) { F.ikeda.order = 'move'; F.ikeda.dest = { x: P.x, z: P.z + 3 }; } F.ikeda.onArrive = null; }
      else if (F.ikeda.order === 'move' && !F.ikeda.onArrive) { F.ikeda.order = 'attack'; F.ikeda.aggro = F.stage === 2 ? 10 : 24; F.ikeda.seekRange = F.stage === 2 ? 12 : 30; }
    }
    // 逃げて遠くへ去った明智勢は消す（本物の兵の数を次の備に残す）
    if ((F.gcT = (F.gcT || 0) - dt) <= 0) {
      F.gcT = 1;
      for (const u of rt.army.units) if (u.alive && !u.gone && u.team === 1 && (u.fleeing || u.group?.routed) && !u.group?.honjin && dist(u.pos, P) > 60) rt.army.despawn(u);
    }
    if (F.stage === 1) {
      const n = aliveN(F.w1);
      // 明智が押す苦しさを短くしない（六十秒は押し合う。学び 十2。段を合わせて四分を下回らない）
      if (F.fieldAt === 1 && n <= F.w1N * 0.3 && rt.t - F.st0 > 60) this.stage(rt, 2);
    } else if (F.stage === 2) {
      if (!F.fordIn && dist(P, FORD_S) < 14) F.fordIn = true;
      //   池田勢と一緒に渡る（馬の主人公だけが先に着いて段が進まない。隊の真ん中が北の岸の近くへ来るまで、長くても四十秒待つ）
      const ic = live(F.ikeda) ? F.ikeda.center() : null;
      const with_ = !ic || dist(ic, FORD_N) < 26 || rt.t - (F.fordAt ?? rt.t) > 40;
      if (dist(P, FORD_N) < 14 || (F.fordIn && P.x > 30 && P.z < riverZ(P.x) - 5)) { F.fordAt ??= rt.t; if (with_) this.stage(rt, 3); }
    } else if (F.stage === 3) {
      if (F.fieldAt === 3 && aliveN(F.tsudaGs) <= F.tsudaN * 0.25 && rt.t - F.st0 > 45) this.stage(rt, 4);
    } else if (F.stage === 4) {
      if (F.fieldAt === 4 && aliveN(F.saiGs) <= F.saiN * 0.25 && rt.t - F.st0 > 50) this.stage(rt, 5);
    } else if (F.stage === 5) {
      // 殿が散って残りが行き先から離れた時も、主人公の方へ突きかからせる（勝ちまで行き詰まらない）
      const late = rt.t - F.st0 > 100;
      if (late && live(F.mimaki) && (F.mkT = (F.mkT || 0) - dt) <= 0) { F.mkT = 3; F.mimaki.order = 'attack'; F.mimaki.dest = { x: P.x, z: P.z }; F.mimaki.aggro = 40; F.mimaki.seekRange = 60; }
      // 殿を早く討ち尽くしても六十五秒は退く光秀を見届け、戦を短く切り上げない。
      const left = aliveN(F.gobo);
      if (F.fieldAt === 5 && left <= F.guardN * (late ? 0.4 : 0.25) && rt.t - F.st0 > 65) this.win(rt);
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
  // ①は高山の陣の右の持ち場で受ける（逃げる斎藤勢を追って川の北へ一人で深入りしない。遊ぶ人も行き先の▼の所で戦う）
  const inHold = (o) => F.stage !== 1 || dist(o.pos, HOLD) < 30;
  const e = b.army.nearestEnemy(u, F.stage === 2 ? 4 : 12, (o) => ok(o) && inHold(o));
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
  if (F.stage === 1) { const w = c(F.w1); t = w && dist(w, HOLD) < 30 ? w : HOLD; }
  else if (F.stage === 2) {
    // 浅瀬の南の岸で池田勢が寄るのを待ってから、一緒に渡る（馬で一人だけ先に渡らない）
    const ic = live(F.ikeda) ? F.ikeda.center() : null, ready = !ic || dist(ic, u.pos) < 16 || b.t - F.st0 > 45;
    t = F.fordIn && ready || u.pos.z < riverZ(u.pos.x) + 3 ? FORD_N : FORD_S;
  }
  else if (F.stage === 3) t = c(F.tsudaGs) || TSUDA;
  else if (F.stage === 4) t = c(F.saiGs) || SAITO;
  else t = c(F.gobo) || GOBO;
  goTo(p, inp, t.x, t.z, 2.5);
};
withGuard(t01_yamazaki);

export { t01_yamazaki };
