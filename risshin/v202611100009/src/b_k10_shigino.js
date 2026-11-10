// ======================================================================
// 徳川編⑩　鴫野の戦い（慶長十九年十一月二十六日・1614　冬の早朝）　docs/chapter3_tokugawa.md の「10.」が正
// 手本と出所：docs/battle_refs/k10_shigino.md
// 大坂冬の陣。大坂城の東、大和川と平野川に挟まれた鴫野は低い湿地で、大軍は堤の上しか動けない。
// 豊臣方は堤に三重の柵を作り、井上頼次に二千で守らせた。上杉景勝の軍（およそ五千）の先手・須田長義と安田能元が柵を奪い、井上は討ち死に。
// 大坂城から大野治長・渡辺糺・木村宗明・竹田永翁らが一万二千で来援し、上杉の先手は一の柵まで押し戻された。
// 二番手の水原親憲が隊を堤の左右へ開いて鉄砲を一斉に放ち、安田能元が槍で突き入って押し返した。
// 家康は上杉に「退いて休め」と命じたが、景勝は戦の最中に退かぬと拒み、榊原康勝らの助けも着いて、豊臣勢は城へ退いた。
// 主人公は須田長義の先手に加わる上杉の部将。目標は五つ（STAGES）：
//   ①一の柵・二の柵の鉄砲衆を討つ ②三の柵の井上頼次を討つ ③水原の鉄砲の後ろまで退く ④渡辺・木村の隊を押し返す ⑤竹田永翁の隊を討つ
// 目標は実際の戦果で進める。最後は川越しの鉄砲で今福を救って締める。
// 11/3 kaito AP〜AV：見せかけの軍勢（farHost・clash・addDistantArmy）は置かず、見える兵は全部本物。旗は上杉（竹に雀・毘）・榊原（無）・豊臣（桐）だけ。
//   総大将の上杉景勝は東の本陣の陣幕で床几に座り、来援の大野治長は西の奥で馬上のまま旗本に囲まれ、どちらも前に出ない（AT3）。ほかの名のある将は全員馬上。
//   兵の比：柵を攻める間は上杉が多く、来援の後は豊臣が二倍を超える（押し戻される苦しさ）。
// 座標：北が −z、東が +x。堤（鴫野の道）は東西に z=0。大坂城は西（−x）の遠く。
// 地形：大阪平野の低地は平らなので、国土地理院の標高は混ぜず、手で描いた堤と湿地にした。
// ======================================================================
import * as THREE from 'three';
import { distToPolyline } from './world.js';
import { nobori, hut, yagura, jinmaku, kagaribi, umajirushi } from './props.js';
import { enemyGroup, allyGroup, nm, wallLine } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { osakaFar } from './osaka_far.js';
import * as uesugi from './k10/uesugi.js';   // 上杉の旗の列と、家康の「上杉はやはり上杉よ」
import { GENERALS } from './units_data.js';
import { STAGES, KILLS, cut } from './stages.js';
import { TEGARA_ON } from './merit.js';
import { sfx } from './audio.js';
import { timeslipField } from './timeslip_field.js';
import { revealName } from './battle_intel.js';
import { goalsTick } from './hud_goals.js';

const ID = 'k10_shigino';
TEGARA_ON.add(ID);

// ---- 名のある武将の甲冑（ここだけで足す。無ければ足す）。黒を基本に、威しの色だけで分ける（AV1） ----
const face = (o) => ({ w: 1.05, jaw: 1.1, chin: 1, cheek: 1, gaunt: 0.2, brow: 1.2, nose: 1, nw: 1.1, eye: 1.1, t: 5, hair: 0x15110d, age: 40, ...o });
const give = (name, g) => { GENERALS[name] ||= { horo: 0, haoriMonCol: 0xe6dfcf, skin: 0x9c7453, ...g }; };
give('上杉景勝', { armor: 0x1c1a18, lace: 0x3a2e24, hat: 'kabuto_s', haori: 0x2a241e, mon: 'none', tack: 0x2a2018, lord: true,
  face: face({ age: 59, brow: 1.4, jaw: 1.2, gaunt: 0.4, beard: { mus: 0.6, musW: 1, droop: 0.4, goat: 0.3, side: 0.2, stub: 0.6 } }) });
give('直江兼続', { armor: 0x1e1c1a, lace: 0x2a3a58, hat: 'kabuto_s', haori: 0x22283a, mon: 'none',
  face: face({ age: 55, jaw: 1, brow: 1.2, beard: { mus: 0.5, musW: 0.9, droop: 0.3, goat: 0.2, side: 0.1, stub: 0.4 } }) });
give('須田長義', { armor: 0x1e1c1a, lace: 0x4a3a2a, hat: 'kabuto_w', haori: 0x2e2620, mon: 'none',
  face: face({ age: 37, beard: { mus: 0.6, musW: 1, droop: 0.3, goat: 0.2, side: 0.2, stub: 0.6 } }) });
give('安田能元', { armor: 0x201e1c, lace: 0x5a4630, hat: 'kabuto_t', haori: 0x302820, mon: 'none',
  face: face({ age: 57, gaunt: 0.4, beard: { mus: 0.8, musW: 1, droop: 0.5, goat: 0.4, side: 0.4, stub: 0.8 } }) });
give('水原親憲', { armor: 0x1c1c1e, lace: 0x4a4a3a, hat: 'kabuto_m', haori: 0x28282a, mon: 'none',
  face: face({ age: 68, gaunt: 0.6, brow: 1.4, beard: { mus: 0.9, musW: 1.1, droop: 0.6, goat: 0.7, side: 0.5, stub: 1 } }) });
give('榊原康勝', { armor: 0x1e1e22, lace: 0x2a3a58, hat: 'kabuto_s', haori: 0x22283a, mon: 'none',
  face: face({ age: 25, jaw: 1, brow: 1, beard: { mus: 0.3, musW: 0.9, droop: 0.2, goat: 0, side: 0, stub: 0.2 } }) });
give('井上頼次', { armor: 0x221e1c, lace: 0x6a3a2a, hat: 'kabuto_w', haori: 0x2e2620, mon: 'toyotomi',
  face: face({ age: 45, beard: { mus: 0.7, musW: 1, droop: 0.4, goat: 0.3, side: 0.3, stub: 0.7 } }) });
give('渡辺糺', { armor: 0x1c1614, lace: 0x8a1e18, hat: 'kabuto_g', haori: 0x2a1c18, mon: 'toyotomi',
  face: face({ age: 40, brow: 1.4, jaw: 1.2, beard: { mus: 0.8, musW: 1.1, droop: 0.5, goat: 0.5, side: 0.6, stub: 1 } }) });
give('木村宗明', { armor: 0x1e1e20, lace: 0x4a4a52, hat: 'kabuto_w', haori: 0x2a2a30, mon: 'toyotomi',
  face: face({ age: 42, beard: { mus: 0.6, musW: 1, droop: 0.4, goat: 0.1, side: 0.2, stub: 0.5 } }) });
give('穴澤盛秀', { armor: 0x1e1a18, lace: 0x6a2a20, hat: 'kabuto_t', haori: 0x2a2220, mon: 'toyotomi',
  face: face({ age: 50, gaunt: 0.4, beard: { mus: 0.8, musW: 1, droop: 0.5, goat: 0.4, side: 0.3, stub: 0.8 } }) });
give('竹田永翁', { armor: 0x221e1c, lace: 0x5a4a2a, hat: 'kabuto_t', haori: 0x2e2822, mon: 'toyotomi',
  face: face({ age: 55, gaunt: 0.5, beard: { mus: 0.7, musW: 1, droop: 0.5, goat: 0.6, side: 0.4, stub: 0.8 } }) });
give('大野治長', { armor: 0x1c1a1a, lace: 0x2a2a2a, hat: 'kabuto_s', haori: 0x2a2622, mon: 'toyotomi', tack: 0x2a2018, lord: true,
  face: face({ age: 46, jaw: 1, beard: { mus: 0.5, musW: 0.9, droop: 0.2, goat: 0.1, side: 0, stub: 0.3 } }) });

// ---- 場所 ----
const START = { x: 112, z: 2 };                  // 須田長義の先手の後ろ（一の柵まで四十歩）
const HONJIN = { x: 192, z: -8 };                // 上杉景勝の本陣（堤の東の端。旗本に囲まれて動かない）
const F1 = 70, F2 = 44, F3 = 18;                 // 豊臣方の三重の柵（一の柵・二の柵・三の柵）の x
const INOUE = { x: 8, z: 0 };
const INO_POST = { x: 12, z: -3 };               // 井上頼次が馬を立てる所（三の柵の内、井楼の下の脇）                    // 井上頼次が鉄砲を指図する所（三の柵の内）
const MIZU = { x: 68, z: 0 };                    // 水原親憲の鉄砲が堤の左右に開く所（一の柵の跡。先手はここまで押し戻された）
const RIVER = { x: 48, z: -68 }; // 大和川の南岸、水原の川越しの射撃位置
const HOLD = { x: F2 + 4, z: 0 };                // 二の柵の跡（最後に踏みとどまる所）
const OONO = { x: -124, z: 4 };                  // 大野治長の旗本（西の奥で動かない）
const FROM_W = { x: -190, z: 0 };                // 来援の豊臣勢が堤を寄せて来る所
const EXIT_W = { x: -236, z: 0 };                // 豊臣の退き口（城の方）
const ROAD = [[230, 0], [150, 1], [100, 0], [40, 0], [-40, 1], [-120, 0], [-250, 0]];   // 鴫野の堤
const OYAMATO = [[-300, -78], [-150, -86], [0, -80], [150, -90], [300, -82]];            // 北の大和川
const HIRANO = [[-300, 74], [-150, 82], [0, 78], [150, 88], [300, 80]];                  // 南の平野川
// 右上の一行（途中で言い替えない。場所と行いだけ・kaito 三1・十1）。「。」で切られないよう一文に
const STEP_TEXT = ['',
  '須田長義と堤を進み、一の柵・二の柵の鉄砲衆を討て',
  '三の柵の井楼の下で、鉄砲を指図する井上頼次を討て',
  '追う大軍に背を見せず堤を東へ退き、水原親憲の鉄砲の後ろに付け',
  '安田能元と槍を揃え、渡辺糺・木村宗明の隊を二の柵の跡まで押し返せ',
  '二の柵の跡で竹田永翁の隊を討ち、大和川南岸の水原親憲と川越しに撃って今福の佐竹勢を救え'];

const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function height(x, z) {
  // 低い湿地。堤の道だけが一段高い
  let h = 0.7 + 0.25 * Math.sin(x * 0.03) * Math.cos(z * 0.04);
  const rd = Math.abs(z - 0.5 * Math.sin(x * 0.02));
  h += 1.6 * sm(1 - rd / 12);
  const rv = Math.min(distToPolyline(x, z, OYAMATO), distToPolyline(x, z, HIRANO));
  if (rv < 7) h -= (1 - rv / 7) * 1.4;
  h += Math.max(0, Math.abs(z) - 150) * 0.12;
  return h;
}
// 堤の両脇は水の溜まった冬の田（足を取られる。大軍は堤の上しか動けない）
function paddy(x, z) {
  const az = Math.abs(z);
  if (az < 17 || az > 70 || x < -170 || x > 170) return 0;
  const ex = Math.min(((x % 16) + 16) % 16, 16 - ((x % 16) + 16) % 16), ez = Math.min(((z % 13) + 13) % 13, 13 - ((z % 13) + 13) % 13);
  return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.5) / 0.5));
}

// 堤の上の道：田の帯（x が −175〜178）では、兵の行き先の z を堤の幅（±7.5）に収める。行き先の入れ物は兵ごとに使い回す
const DIKE_Z = 7.5;
function dikeWay(army, u, want) {
  if (!want || u.isPlayer || u.group?.riverAid) return want;
  // 退き先や来援の出発点が田の外でも、途中で田の帯を通る間は堤を使う。
  if (Math.max(u.pos.x, want.x) < -175 || Math.min(u.pos.x, want.x) > 178) return want;
  // 水原の筒だけは堤の肩まで開く。中央の道へ戻すと左右の射列が組めない。
  const edge = u.group?.dikeShoulder ? 11.5 : DIKE_Z;
  const out = Math.abs(u.pos.z) > edge + 1.5;
  if (Math.abs(want.z) <= edge && !out) return want;
  const q = u._dikeWant || (u._dikeWant = { x: 0, z: 0 });
  q.z = Math.max(-edge, Math.min(edge, want.z));
  // 田へ降りた者は、行き先へ向かう前にまず真横の堤へ上がる
  q.x = out ? u.pos.x + Math.sign(want.x - u.pos.x) * Math.min(3, Math.abs(want.x - u.pos.x)) : want.x;
  if (out) q.z = Math.sign(u.pos.z) * Math.min(edge - 1, Math.abs(q.z) || edge - 1);
  return q;
}

const live = (g) => g && g.units.some((u) => u.alive && !u.gone && !u.fleeing);
const aliveN = (g) => (g ? g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0) : 0);
const sumN = (...gs) => gs.reduce((n, g) => n + aliveN(g), 0);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 上杉勢：黒い具足に竹に雀。豊臣方：くすんだ黒の具足に桐。榊原：無の字
const UE = { flag: 'uesugi' };
const TOY = { flag: 'toyotomi', armor: 0x2a2622 };
const SAK = { flag: 'sakakibara' };
const dress = (look) => (list) => list.map((s) => ({ ...s, o: { ...look, ...(s.o || {}) } }));
const ueD = dress(UE), toyD = dress(TOY), sakD = dress(SAK);
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n });
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

// 柵：堤を横切って張り、真ん中だけが口。柵の外は水の堀と湿地
function fenceLine(rt, x) {
  return wallLine(rt, [[x, -11], [x, 11]], { team: 1, hp: 260, segLen: 4.4, gaps: [2], name: '柵' });
}
function fenceDown(rt, list) {
  for (const s of list || []) if (s.alive) { s.alive = false; s.hp = 0; s.hitFrom = { x: s.seg[0] + 6, z: 0 }; rt.army.structFall(s); }
}

import DEPTH_K10 from './k10/depth.js';   // 軍勢の厚み・陣立ての表（army_depth）
const k10_shigino = {
  depth: DEPTH_K10,   // 軍勢の厚み・陣立ての表（二巡で一度外したが、止まりの正体は段の終わりの作りだった。11/9 戻した）
  lethal: true,   // 命懸けの戦場（lethal.js）：流れ弾・突然の負傷と討死・制圧・恐怖・孤立
  resumeSteps: 5,   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを toStep(①〜5) を順に流して作り直す
  // 身の回りの合戦の跡（timeslip_field.js）。鴫野：冬の朝の堤と湿地。枯れ葦・ぬかるみ、鉄砲で撃ち合った跡
  timeslip: {
    wet: 0.7, dust: 0.05, trample: 0.3, debris: 1.2, arrows: 0.8, reeds: 1, maxSlope: 0.22,
    grass: 0xa49c66, grassTints: [0xffffff, 0xeadcb0, 0xc8c898], grassH: 1.2, grassLift: 0.2, grassShape: 'blade', tallGrass: 1,
    flagColors: [0xe6dfcc, 0x24211e, 0x5a4a36],
  },
  spawn: { x: START.x, z: START.z, heading: -Math.PI / 2 },
  minutes: 16,
  nameRange: 700,
  hideCombatDistance: true,
  noWake: true,
  noFrontFill: true,       // 見せかけの軍勢（奥の軽い乱戦・自動の大軍）を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ
  compactIntro: true,
  introText: () => '鴫野の堤に豊臣方の三重の柵。上杉の先手と柵を破り、城から来る大軍を堤で食い止めよ。',
  hideGuideSteps: true,
  noCouriers: true,
  noAllyReports: true,     // 一本の堤で味方の隊は全部目に見える。使番の「陣を移す」の知らせを重ねない（五1）
  noTaisho: true,
  noReserve: true,
  noTaishoRaid: true,
  foeMarks: true,
  playerAtkMax: 3,
  playerTaken: 0.45,
  playerRegen: 0.025,
  closeCombatAssist: true,
  noWinCrane: true,
  noYaguraTask: true,      // 三の柵の井楼は目標にしない（右上は史実の流れの五つだけ・十1）
  stageGoalsOnly: true,    // 目標は五つの段だけ（「敵を何人討つ」で埋めない）
  goalsAllRows: true,      // 共通の目標札でも最初から五つ全部を並べる
  // 行き先のピン：段ごとに一つ（字は出さない）。場所は段ごとに決まっている（AW3）
  missionPin(rt) {
    const F = rt.flags;
    if (!F.step || F.ending) return null;
    // 場所は柵・堤の決まった所だけ（隊の真ん中を追わない。行くたびに動かない・AW3）
    // 毎コマ呼ばれるので座標は印の入れ物に直接書く。
    PIN.x = F1; PIN.z = 0;
    if (F.step === 1) PIN.x = live(F.g1) ? F1 - 6 : F2 - 6;
    else if (F.step === 3) {
      // 達成判定と同じ鉄砲の列へ。須田の先手が塞ぐ列の奥へ誘導しない。
      PIN.x = MIZU.x + 2;
    } else {
      const p = F.step === 2 ? (F.inoU && F.inoU.alive ? F.inoU.pos : INOUE)
        : F.step === 5 && F.riverAid ? RIVER : HOLD;
      PIN.x = p.x; PIN.z = p.z;
    }
    PIN.unit = F.step === 2 ? F.inoU : null;
    PIN.enemy = F.step === 2;
    PIN.r = F.step === 3 ? 6 : 8;
    return PIN;
  },
  // 右上の目標：①〜⑤を最初から全部並べ、済んだ物に印（九1・十1）。11/6 遊んで：今の一行だけしか出ていなかった
  goals5() {
    return STEP_TEXT.slice(1).map((text, k) => ({ kind: 'stage', k, text,
      check: (rt) => (k < 4 ? (rt.flags.step || 0) >= k + 2 : !!rt.flags.ending && rt.tracker?.main === true) }));
  },
  // 共通の任務札は今の一行だけなので、目標の札（hud_goals）で置き換え、両軍の兵の数の棒（armybar）も上に出す（九1・九3・十二1）。
  //   樫井（b_k12_kashii.js）・真田丸と同じ作り。戦が終われば元へ戻す
  goalsHud(rt) {
    const hud = rt.hud;
    if (!hud || !hud.root || typeof document === 'undefined') return;
    hud.root.classList.add('shigino-goals');
    const st = document.createElement('style');
    st.textContent = `
html:root body #hud#hud#hud.shigino-goals:not(.photo) #armybar:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; }
html:root body #hud#hud#hud.shigino-goals #armybar .clock { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.shigino-goals :is(#armybar, #h-prog) { visibility:hidden !important; }
html:root body #hud#hud#hud.shigino-goals #h-prog#h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud#hud.shigino-goals #h-prog#h-prog.goal-mode > .pg-goals { display:block !important; }
html:root body #hud#hud#hud.shigino-goals #h-prog#h-prog.goal-mode {
 left:auto !important; right:calc(12px + env(safe-area-inset-right, 0px)) !important; transform:none !important;
 width:auto !important; min-width:0 !important; max-width:min(390px, 44vw) !important; box-sizing:border-box;
 padding:8px 12px 9px 10px !important; background:rgba(14,12,10,.7) !important; border:none !important; border-radius:6px !important; }
html:root body #hud#hud#hud.shigino-goals #h-prog#h-prog.goal-mode .pg-goals li { white-space:normal !important; align-items:flex-start; color:#e6dfd2 !important; }
html:root body #hud#hud#hud.shigino-goals #h-prog#h-prog.goal-mode .pg-goals li i { margin-top:3px; }
html:root body #hud#hud#hud.shigino-goals #h-prog#h-prog.goal-mode .pg-goals li span { color:inherit !important; background:none !important; }
html:root body #hud#hud#hud.shigino-goals #h-prog#h-prog.goal-mode .pg-goals li.now { color:#fff !important; }
html:root body #hud#hud#hud.shigino-goals #h-prog#h-prog.goal-mode .pg-goals li.done { color:#cfc9bc !important; }
html:root body #hud#hud#hud.shigino-goals #h-prog#h-prog.goal-mode .pg-goals h3 b { display:none !important; }`;
    document.head.appendChild(st);
    const hudProgress = hud.progress;
    hud.progress = function (battle) {
      const out = hudProgress.call(this, battle);
      if (battle === rt && this.prog && !rt.over) goalsTick(this.prog, rt);
      return out;
    };
    const dispose = rt.dispose;
    rt.dispose = function () {
      hud.progress = hudProgress;
      if (hud.prog) hud.prog.classList.remove('goal-mode');
      hud.root.classList.remove('shigino-goals'); st.remove();
      return dispose.call(this);
    };
  },
  talk: {
    before: [['須田長義', '堤に柵が三重。柵の内に井上頼次の鉄砲が並んでおる'], ['直江兼続', '御屋形様のお下知じゃ。先手は須田殿、二番手は水原殿。堤を西へ攻め上れ'],
      ['須田長義', '堤の外は泥田じゃ。足を取られれば撃たれる。柵の口へ一気に詰めよ']],
    after: [['上杉景勝', '……鴫野の堤、確かに取った'], ['水原親憲', '謙信公の頃の戦に比べれば、これしきは子供の石合戦よ']],
  },
  world: {
    // 十一月二十六日の早朝に柵へ取り付いた（冬の朝の低い光・薄い朝霧）。大坂の平らな低地：遠くの生駒・六甲は低く霞む
    seed: 1614, time: 'morning', muddy: 0.4, mist: 0.3, mountainScale: 0.16, mountainHaze: 0.85,
    groundHalf: 250, moveLim: 240,
    paths: [ROAD],
    height,
    paddy,
    fieldStage: 'bare',     // 冬の田は水が溜まり泥（足を取られる・地形の 'water'）
    // 北の大和川・南の平野川と、堤の両脇の水の溜まった堀（湿地の中の一本道だと分かる）
    streams: [{ pts: OYAMATO, w: 10, depth: 0.8 }, { pts: HIRANO, w: 10, depth: 0.8 },
      { pts: [[-250, -13], [-40, -12.5], [30, -13], [100, -12.5], [175, -13]], w: 5, depth: 0.35 }, { pts: [[-250, 13.5], [-40, 13], [30, 13.5], [100, 13], [175, 13.5]], w: 5, depth: 0.35 }],
    // 堤は乾いた土の色、水辺は湿った枯れ草、遠くは冬の田
    tint(x, z, h, c) {
      const rd = distToPolyline(x, z, ROAD);
      if (rd < 6) { const k = 0.6 * (1 - rd / 6); c.setRGB(c.r * (1 - k) + 0.46 * k, c.g * (1 - k) + 0.4 * k, c.b * (1 - k) + 0.3 * k); }
      // 十一月二十六日は今の暦の一月の初め。湿地の草は枯れ色（11/6 遊んで：田の脇が春の緑に見えた・専門家の目）
      else { const k = 0.62; c.setRGB(c.r * (1 - k) + 0.44 * k, c.g * (1 - k) + 0.38 * k, c.b * (1 - k) + 0.27 * k); }
    },
    clear: (x, z) => distToPolyline(x, z, ROAD) < 9 || dist({ x, z }, HONJIN) < 18 || dist({ x, z }, OONO) < 16,
    // 木と大きな石は置かない（11/6 遊んで：遠くの木も板の絵、灰色の丸い岩は作り物に見えた・九5・八1。鴫野の低湿地に岩は無い）
    trees: 0, tufts: 3200, rocks: 0,
    treeDensity: () => 0,
    fleeOut: (x, z, team) => (team === 1 ? x < -230 : x > 236),
    // 大軍は堤の上しか動けない（battle_learn 五・二1）：兵の行き先を堤の幅へ収め、田へ降りた者は堤へ戻す（主人公は泥で遅くなるだけ）
    moveWay: dikeWay,
    fleeWay: dikeWay,
  },
  sides: { a: { name: '上杉景勝の軍 五千', mon: 'uesugi' }, b: { name: '豊臣方 二千（後に来援一万二千）', mon: 'toyotomi' } },
  date: () => '慶長十九年（1614）十一月二十六日　冬の早朝',

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world, S = rt.scene;
    F.step = 0; F.holdPlayer = false; F.foes = []; F.ending = false; F.ek = 0; F.ak = 0; F.shot = 0;
    // 豊臣方の三重の柵（壊せる。口は真ん中だけ）と、三の柵の井楼・小屋・桐の旗
    F.fence1 = fenceLine(rt, F1); F.fence2 = fenceLine(rt, F2); F.fence3 = fenceLine(rt, F3);
    S.add(yagura(W, F3 - 5, -12, { team: 1, mon: 'toyotomi' }));   // 井楼は堤の道の脇（道を塞がない）
    // 番小屋は堤の道から外し、三の柵の奥の脇へ（井上頼次の居る所を塞がない・軒下にはまらない）
    S.add(hut(W, F3 - 30, 12, 6, 4.5, 0.1, { h: 2.4 }), hut(W, F3 - 34, -12, 5.5, 4.5, 0, { h: 2.4 }));
    // 柵ごとの桐の旗（奪った柵では倒し、上杉の竹に雀を立てる・十4）
    F.flagsAt = [];
    for (const [x, z, k] of [[F1 - 4, 8, 1], [F1 - 4, -8, 1], [F2 - 4, 8, 2], [F2 - 4, -8, 2], [F3 - 4, 9, 3], [F3 - 8, -3, 3], [OONO.x - 6, OONO.z - 8, 0], [OONO.x - 6, OONO.z + 8, 0]]) {
      const f = nobori(W, x, z, 'toyotomi', 5); S.add(f);
      if (k) { const u = nobori(W, x + 1, -z, 'uesugi', 5); u.visible = false; S.add(u); F.flagsAt.push({ k, toy: f, ue: u }); }
    }
    // 景勝本陣：『大坂御陣覚書』の紺地白丸・毘の二本と浅黄の扇。
    S.add(jinmaku(W, HONJIN.x + 4, HONJIN.z, 16, 12, 6));
    S.add(nobori(W, HONJIN.x - 6, HONJIN.z + 9, '景勝の白丸', 6));
    S.add(umajirushi(W, HONJIN.x + 2, HONJIN.z - 9, 0, 'kagekatsu_ogi'));
    S.add(nobori(W, HONJIN.x - 8, HONJIN.z, 'uesugi_bi', 7));
    S.add(kagaribi(W, HONJIN.x - 2, HONJIN.z + 12));
    // 水辺の蘆は timeslip の枯れ葦（細い葉の束）に任せる（円錐の作り物を置かない・八1）
    // 大坂城（西の遠く）：本丸・二の丸・玉造口の馬出。osaka_far.js（兵は置かない）
    // 11/6 遊んで：城が三の柵のすぐ後ろに大きく見え、手前の惣構え（x=−178）の緑の段が地平に並んで作り物に見えた。
    //   鴫野から城まではおよそ二・五キロ（battle_refs）。天守の見かけの大きさを二・五キロ先の実の大きさに合わせ（s・big を小さく）、惣構えの段は置かない
    try { osakaFar(rt, { x: -380, z: 60, s: 0.95, big: 0.9, land: [[-700, -400, -251, 400]] }); } catch (e) { console.warn(e); }
    // 川と堀の岸の丸い川石は置かない（11/6 遊んで：堤の脇に灰色の丸い岩が並んで作り物に見えた。泥の低湿地に石は無い・八1）
    for (const st of W.def.streams || []) if (st.rockMesh) st.rockMesh.visible = false;

    // ---- 上杉勢 ----
    F.mine = allyGroup(rt, { faction: 'uesugi', name: '手勢', fullStrength: true, fixed: true, anchor: { x: START.x + 2, z: START.z + 3 }, facing: -Math.PI / 2, width: 5, aggro: 10, speed: 3.6, order: 'hold', noRout: true, dmgMult: 0.9 },
      ueD([uS(4), uA(9), uG(3)]));
    F.suda = allyGroup(rt, { faction: 'uesugi', name: '須田長義の先手', fullStrength: true, fixed: true, anchor: { x: 100, z: 0 }, facing: -Math.PI / 2, width: 7, aggro: 12, speed: 3.6, order: 'hold', noRout: true, formation: 'yari' },
      ueD([{ type: 'busho', n: 1, o: { name: '須田長義', invuln: true, horse: true } }, uS(5), uA(18), uG(6)]));
    F.yasu = allyGroup(rt, { faction: 'uesugi', name: '安田能元の手', fullStrength: true, fixed: true, anchor: { x: 124, z: -2 }, facing: -Math.PI / 2, width: 7, aggro: 12, speed: 3.6, order: 'hold', noRout: true, formation: 'yari' },
      ueD([{ type: 'busho', n: 1, o: { name: '安田能元', invuln: true, horse: true } }, uS(5), uA(16), uG(3)]));
    // 二番手：水原親憲の鉄砲（来援の段で堤の左右へ開く）
    F.mzN = allyGroup(rt, { faction: 'uesugi', name: '水原親憲の鉄砲', fullStrength: true, fixed: true, anchor: { x: 136, z: -4 }, facing: -Math.PI / 2, width: 5, aggro: 6, speed: 3.6, order: 'hold', noRout: true, fire: true },
      ueD([{ type: 'busho', n: 1, o: { name: '水原親憲', invuln: true, horse: true } }, uS(2), uG(13)]));
    F.mzS = allyGroup(rt, { faction: 'uesugi', name: '水原の鉄砲（南）', fullStrength: true, fixed: true, anchor: { x: 136, z: 5 }, facing: -Math.PI / 2, width: 5, aggro: 6, speed: 3.6, order: 'hold', noRout: true, fire: true },
      ueD([uS(2), uG(13)]));
    F.mzN.dikeShoulder = F.mzS.dikeShoulder = true;
    // 一斉射二回と今福救援三回の弾を残す。普段の射撃で空になると、
    // 筒を捨てて脇差へ替わり、川岸で合図しても永遠に撃てなくなる。
    const fireGun = rt.army.fireGun;
    rt.army.fireGun = function (u, target, launch = null, aim = null) {
      if (!F.commandedShot && (u.group === F.mzN || u.group === F.mzS) && (u.gunAmmo ?? 20) <= 6) return false;
      return fireGun.call(this, u, target, launch, aim);
    };
    const dispose = rt.dispose;
    rt.dispose = function () {
      this.army.fireGun = fireGun;
      return dispose.call(this);
    };
    // 上杉景勝の本陣：東の端で旗本に囲まれ、前に出ない（AR3・AT3）
    F.honjin = allyGroup(rt, { faction: 'uesugi', name: '上杉景勝の本陣', fullStrength: true, fixed: true, anchor: { x: HONJIN.x, z: HONJIN.z }, facing: -Math.PI / 2, width: 8, aggro: 4, seekRange: 10, order: 'hold', noRout: true },
      ueD([{ type: 'busho', n: 1, o: { name: '上杉景勝', invuln: true, horse: false, kosode: true, kosodeCol: 0x35342e, hat: 'none', menpo: 0, flag: null } }, { type: 'busho', n: 1, o: { name: '直江兼続', invuln: true, horse: true } }, uS(30), uG(6)]));
    F.kage = F.honjin.units.find((u) => u.name === '上杉景勝');
    if (F.kage) F.kage._crouch = true;   // 総大将は陣幕の内で床几に腰を下ろす
    for (const g of [F.suda, F.yasu]) g.ai = true;

    // ---- 豊臣方の柵の守り（井上頼次の手。柵の内で鉄砲を構える） ----
    F.g1 = this.foe(rt, '一の柵の鉄砲衆', { x: F1 - 6, z: 0 }, [uS(2), uA(7), uG(8)], { hold: true });
    F.g2 = this.foe(rt, '二の柵の鉄砲衆', { x: F2 - 6, z: 0 }, [uS(2), uA(7), uG(8)], { hold: true });
    F.w1S = sumN(F.g1, F.g2);
    // 目標に名を書いた敵将は、右上の一行で伏せない（「見えぬ敵の陣を物見する」に化けさせない・十1）
    for (const n of ['井上頼次', '渡辺糺', '木村宗明', '竹田永翁', '大野治長']) revealName(rt, n);
    this.goalsHud(rt);
    // ①は話の間から右上に出す（目標の表に無い「味方の旗へ」を出さない・九1）
    rt.obj('s1', STEP_TEXT[1], 'main');
    const T = this.talk.before;
    T.forEach(([who, s], i) => rt.after(0.6 + i * 3.4, () => rt.say(who, s, 3.2)));
    uesugi.install(rt, { at: 0.6 + T.length * 3.4 + 0.4 });   // k10/uesugi.js
    this.toStep(rt, 1);
  },

  // 豊臣方の隊を出す（見える所に湧かせない。柵の内か、西の遠くから寄せる）
  foe(rt, name, at, list, o = {}) {
    const F = rt.flags;
    const g = enemyGroup(rt, { faction: 'toyotomi', name, fixed: true, anchor: { x: at.x, z: at.z }, facing: Math.PI / 2, width: o.width || 6, noRout: true, formation: o.chase || o.column ? 'column' : 'line',
      morale: o.morale || 95, dmgMult: 0.5, order: o.hold ? 'hold' : 'attack', seekRange: o.hold ? 14 : 90, aggro: o.hold ? 10 : 16, speed: 3.7, fire: true, fleeDir: { x: -1, z: 0 } }, toyD(list));
    // 追う隊：堤の上を駆け足で行き先（chase）まで詰め、着いたら当たる
    if (o.chase) this.chase(rt, g, o.chase);
    if (o.aim) { g.anchor = { x: o.aim.x, z: o.aim.z }; g.order = 'move'; g.dest = { x: o.aim.x, z: o.aim.z }; g.onArrive = (q) => { if (q.order === 'move') q.order = o.stay ? 'hold' : 'attack'; }; }
    // 寄せて来て待つ隊：堤を歩いて wait まで来て、そこで止まる（手の届く所の敵だけと当たる）
    if (o.wait) { g._wait = o.wait; g.order = 'move'; g.dest = { x: o.wait.x, z: o.wait.z }; g.seekRange = 8; g.aggro = 4; g.onArrive = (q) => { if (q.order === 'move') q.order = 'hold'; }; }
    F.foes.push(g);
    return g;
  },
  // 追う隊：堤の上を駆け足で行き先まで詰め、着いたら当たる
  chase(rt, g, to) {
    g.order = 'move'; g.dest = { x: to.x, z: to.z }; g.speed = 4.4; g.aggro = 5; g.seekRange = 12;
    g.onArrive = (q) => { if (q.order === 'move') { q.order = 'attack'; q.seekRange = 40; q.aggro = 16; } };
    // 今福の寄せ手は経過時間だけで崩さず、川越しの救援を受けてから退く。
    rt.after(30, () => { if (!g.riverAid) g.noRout = false; });
  },

  // 段を進める（右上の目標と行き先のピン）
  toStep(rt, n) {
    const F = rt.flags;
    if (F.step >= n || F.ending) return;
    if (F.step) rt.objDone('s' + F.step);
    F.step = n; F.stepT = rt.t;
    rt.obj('s' + n, STEP_TEXT[n], 'main');
    if (n === 1) {
      sfx('horagai', 0.8);
      rt.after(1, () => sfx('taiko', 0.8));
      F.suda.order = 'attack'; F.suda.seekRange = 40; F.suda.anchor = { x: F2 - 4, z: 0 };
      rt.army.play('toki', { x: 104, z: 0 }, 1.5);
      rt.after(2, () => rt.say('須田長義', '掛かれ！　柵の口へ詰めよ。撃たれる前に槍を付けい！', 3));
      rt.after(16, () => rt.say('足軽', '柵の内から撃ってくる！　泥田へ降りるな、堤を行け！', 3));
    } else if (n === 2) {
      fenceDown(rt, F.fence1); fenceDown(rt, F.fence2); this.takeFlags(rt, 2);
      rt.banner('一の柵・二の柵を破った', '三の柵に井上頼次の鉄砲衆');
      F.ino = this.foe(rt, '井上頼次の鉄砲衆', { x: INOUE.x, z: 0 }, [uS(3), uA(6), uG(12)], { hold: true, width: 7, morale: 100 });
      // 井上頼次は鉄砲衆の列の後ろ（隊の段の奥）でなく、三の柵の内の井楼の下に馬を立てて指図する（11/6 遊んで：隊の段の奥へ下がり続け、三の柵から西へ六十も離れた）。
      //   近習二人だけの小さな組にして持ち場（INO_POST）を離れさせない
      F.inoG = this.foe(rt, '井上頼次', INO_POST, [{ type: 'busho', n: 1, o: { name: '井上頼次', invuln: true, horse: false } }, uS(2)], { hold: true, width: 3, morale: 100 });
      F.inoG.seekRange = 7;
      F.inoU = F.inoG.units.find((u) => u.name === '井上頼次');
      // 「井上を討て」は本人の止めで果たす。共通の四十五秒待ちの後に味方が討つ処理へ任せない。
      F.inoU.onWound = (src) => {
        if (!src?.isPlayer || F.step !== 2 || F.ending || !F.inoU.alive) return;
        F.inoU.invuln = false; F.inoByMe = true;
        rt.army.kill(F.inoU, src);
      };
      F.suda.anchor = { x: F3 - 6, z: 0 }; F.suda.seekRange = 26;
      F.yasu.order = 'attack'; F.yasu.anchor = { x: F2, z: 0 }; F.yasu.seekRange = 30;
      // 柵が破れたと聞いて、城から来援の先手（渡辺糺・木村宗明）が西の堤を寄せて来て、三の柵の西（須田の手の届かない所）に詰めて待つ。
      //   11/6 遊んで：井上を討った後に遠くで湧き、退く主人公に追い付かず、③で敵を一度も見なかった（九2）。来るのが見え、退く背に食い付く
      F.wata = this.foe(rt, '渡辺糺の隊', { x: -200, z: -1 }, [{ type: 'busho', n: 1, o: { name: '渡辺糺', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '穴澤盛秀', horse: true } }, uS(7), uA(26), uG(10)], { wait: { x: -52, z: -1 }, column: true, width: 5 });
      F.kimu = this.foe(rt, '木村宗明の隊', { x: -216, z: 1 }, [{ type: 'busho', n: 1, o: { name: '木村宗明', invuln: true, horse: true } }, uS(6), uA(22), uG(8)], { wait: { x: -66, z: 1 }, column: true, width: 5 });
      rt.say('須田長義', '残るは三の柵じゃ。指図する井上を討てば、鉄砲は止む！', 3.2);
      rt.after(4, () => rt.say('井上頼次', '引き付けて放て。堤の上の者を一人も通すな！', 3));
      rt.after(24, () => { if (F.step === 2) rt.say('足軽', '西の堤に桐の旗の列！　城から助けが来るぞ。急げ！', 3); });
    } else if (n === 3) {
      fenceDown(rt, F.fence3); this.takeFlags(rt, 3);
      sfx('taiko', 1);
      rt.banner('城から大軍', '大野治長・渡辺糺・木村宗明が一万二千で来援');
      // 柵の残りの守り手は来援に加わって、柵を奪い返しに東へ寄せる
      //   （11/6 遊んで：西へ退かせると一本の堤で東へ追う来援と正面からぶつかって詰まり、追手が三の柵の西で止まった）
      for (const g of [F.g1, F.g2, F.ino, F.inoG]) if (live(g)) { this.chase(rt, g, { x: MIZU.x - 20, z: 0 }); g.noRout = false; }
      // 大野治長は西の奥で旗本に囲まれて動かない（総大将は前に出ない）
      F.oono = this.foe(rt, '大野治長の旗本', { x: OONO.x - 50, z: OONO.z }, [{ type: 'busho', n: 1, o: { name: '大野治長', invuln: true, horse: true } }, uS(20), uG(4)], { aim: OONO, stay: true, morale: 100 });
      // 来援の先手は三の柵の奥から堤を走って追い、退く上杉の背に食い付く（目標に書いた敵は必ず来る・九2）。堤の幅に収まる細い列
      this.chase(rt, F.wata, { x: MIZU.x - 12, z: 0 });
      this.chase(rt, F.kimu, { x: MIZU.x - 16, z: 1 });
      F.w4N = sumN(F.wata, F.kimu);
      // 上杉の先手は押されて一の柵の東へ退く。水原の鉄砲は堤の左右へ開いて待つ
      for (const [g, p] of [[F.suda, { x: MIZU.x + 6, z: 1 }], [F.yasu, { x: MIZU.x + 14, z: -1 }]]) {
        g.ai = false; g.order = 'move'; g.dest = p; g.speed = 3.9; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: p.x, z: p.z }; };
      }
      for (const [g, z] of [[F.mzN, -9], [F.mzS, 9]]) { g.order = 'move'; g.dest = { x: MIZU.x + 2, z }; g.fire = false; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: MIZU.x + 2, z }; q.facing = -Math.PI / 2; }; }
      rt.say('須田長義', '数が違いすぎる……！　退け、一の柵の東まで退け！', 3.2);
      rt.after(4, () => rt.say('水原親憲', '鉄砲は堤の左右へ開け。味方が抜けるまで撃つな', 3.2));
      rt.after(9, () => rt.say('足軽', '後ろから追って来る！　止まれば囲まれるぞ！', 2.8));
    } else if (n === 4) {
      // 水原の鉄砲は、追う敵が堤の左右の筒先へ入った所で一斉に放つ（update の F.volT）→ 安田能元が槍で突き入る
      F.volT = rt.t;
      rt.say('水原親憲', '先手は左右へどけ！　引き付けて、堤に敵が詰まった所を撃つ', 3);
      // 直江兼続が戦線を整える（docs/generals_toyo_toku_1108.md の 10：景勝と兼続が戦線を保つ。二巡）
      rt.after(4.2, () => { if (F.step === 4) rt.say('直江兼続', '須田殿の組は水原の鉄砲の後ろで組み直せ。崩れるな、上杉の戦は退いてからじゃ', 3.8); });
    } else if (n === 5) {
      rt.banner('退けの命', '家康の使番が来た');
      rt.say('家康の使番', '大御所様の仰せ。上杉勢は退いて休め。堀尾忠晴に先手を代われ、と', 3.6);
      rt.after(4, () => rt.say('上杉景勝', '……退かぬ。戦の最中に先手を人に譲るは、上杉の家にあらず', 3.8));
      rt.after(8.5, () => rt.say('須田長義', '聞いたか。二の柵の跡まで押し出し、一歩も退くな！', 3));
      F.take = this.foe(rt, '竹田永翁の隊', { x: -40, z: 0 }, [{ type: 'busho', n: 1, o: { name: '竹田永翁', invuln: true, horse: true } }, uS(5), uA(17), uG(7)], { chase: { x: HOLD.x - 4, z: 0 }, width: 5, morale: 98 });
      F.w5N = aliveN(F.take);
      // 須田・安田の手は二の柵の跡へ戻って踏みとどまり、寄せ返す竹田の隊をそこで受ける（追って西へ出過ぎない）
      for (const [g, z] of [[F.yasu, -2], [F.suda, 2]]) if (live(g)) { g.order = 'move'; g.dest = { x: HOLD.x + 3, z }; g.onArrive = (q) => { q.order = 'attack'; q.anchor = { x: HOLD.x + 3, z }; q.seekRange = 16; }; }
      for (const g of [F.mzN, F.mzS]) { const z = g === F.mzN ? -9 : 9; g.order = 'move'; g.dest = { x: HOLD.x + 18, z }; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: HOLD.x + 18, z }; }; }
      // 榊原康勝の手が東から堤を来る（言った物は本当に来る）
      F.saka = allyGroup(rt, { faction: 'tokugawa', name: '榊原康勝の手', fullStrength: true, fixed: true, anchor: { x: 214, z: 2 }, facing: -Math.PI / 2, width: 7, aggro: 12, speed: 3.7, noRout: true, formation: 'yari' },
        sakD([{ type: 'busho', n: 1, o: { name: '榊原康勝', invuln: true, horse: true } }, uS(4), uA(12), uG(4)]));
      F.saka.order = 'move'; F.saka.dest = { x: HOLD.x + 26, z: 2 }; F.saka.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; q.anchor = { x: HOLD.x, z: 0 }; };
      rt.after(14, () => rt.say('足軽', '東の堤に榊原の「無」の旗！　助けが来るぞ！', 3));
    }
  },

  // 水原の鉄砲の一斉射撃：堤の上の寄せ手が倒れる（煙は堤の左右から）
  volley(rt) {
    const F = rt.flags;
    if (F.ending) return;
    let shots = 0;
    // 堤の左右に開いた水原の鉄砲が、一人ずつ本物の筒で放つ（火と煙は筒先から）
    const foes = [];
    for (const g of [F.wata, F.kimu]) for (const u of g?.units || []) if (u.alive && !u.gone && u.pos.x > MIZU.x - 64 && u.pos.x < MIZU.x + 6) foes.push(u);
    let k = 0;
    for (const g of [F.mzN, F.mzS]) for (const u of g.units) {
      if (!u.alive || u.gone || u.fleeing || u.woundOut || u.rearWound || u.sidearm || u.type !== 'gun' || !foes.length) continue;
      // 移動中の筒を一斉射に数えず、堤の左右へ開いた射列から放つ。
      const shoulder = g === F.mzN ? -9 : 9;
      if (Math.abs(u.pos.x - (MIZU.x + 2)) > 12 || Math.abs(u.pos.z - shoulder) > 5) continue;
      const t = foes[k++ % foes.length];
      u.heading = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); u.reload = 0;
      if (this.commandShot(rt, u, t)) shots++;
    }
    // 不発・弾切れ・射程外では、一斉射の達成や見せかけの損害を与えない。
    if (!shots) return;
    F.shot++; F.lastVolley = rt.t;
    rt.say('水原親憲', '放て！', 2);
    sfx('volley', 0.9);
    rt.army.play('volley', MIZU, 1.6);
    // 火・煙・損害は fireGun の筒先と実弾に任せる。命中前に別口で兵を倒さない。
    for (const g of [F.wata, F.kimu]) if (live(g)) g.morale -= 15;
    if (F.shot === 2) rt.say('足軽', '堤の上で、大坂の兵が折り重なって倒れていく！', 3);
  },

  // 下知による実射だけは取り置きの弾を使う。
  commandShot(rt, u, target) {
    rt.flags.commandedShot = true;
    try { return rt.army.fireGun(u, target); }
    finally { rt.flags.commandedShot = false; }
  },
  // 手本：battle_refs/k09_imafuku.md の大阪市・今福の戦い。北岸の佐竹を南岸から救う。
  riverAid(rt) {
    const F = rt.flags;
    F.riverAid = true; F.riverShots = 0; F.riverSecured = false;
    for (const g of F.foes) if (live(g)) { g.order = 'retreat'; g.dest = EXIT_W; g.noRout = false; }
    // 個々の逃走は隊の dest を使わない。北へ逃げ続けて救援完了を妨げないよう、北岸を西へ退く道を渡す。
    F.riverFoe = enemyGroup(rt, { faction: 'toyotomi', name: '今福の寄せ手', fixed: true, anchor: { x: 48, z: -100 }, width: 10, facing: Math.PI / 2, order: 'hold', noRout: true, fire: true,
      fleeDir: { x: -1, z: 0 }, fleePath: [[-236, -100]] }, toyD([uA(8), uG(4)]));
    F.foes.push(F.riverFoe); F.riverFoe.riverAid = true;
    this.chase(rt, F.riverFoe, { x: 76, z: -100 });
    F.satake = allyGroup(rt, { faction: 'satake', name: '今福の佐竹勢', fixed: true, anchor: { x: 76, z: -100 }, width: 6, order: 'hold', noRout: true }, [{ type: 'samurai', n: 6, o: { flag: 'satake' } }]);
    F.satake.riverAid = true;
    // 救援前に佐竹だけで押し返さず、北岸で押されて下がる姿を見せる。
    F.satake.order = 'retreat'; F.satake.dest = { x: 88, z: -100 }; F.satake.fire = false;
    for (const [g, dx] of [[F.mzN, -6], [F.mzS, 6]]) {
      g.riverAid = true; g.fire = false; g.order = 'move'; g.dest = { x: RIVER.x + dx, z: RIVER.z };
      g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: RIVER.x + dx, z: RIVER.z }; q.facing = Math.PI; };
      g.gunReportSound = 'playerGun';
    }
    rt.banner('今福から救援の求め', '大和川の北岸で佐竹勢が押されている');
    rt.say('水原親憲', '南岸へ来い！　攻めの合図で川越しに放ち、佐竹殿を救うぞ', 5);
  },
  attackAction(rt) {
    const F = rt.flags;
    if (!F.riverAid || F.ending || dist(rt.player.u.pos, RIVER) > 14) return false;
    // 先に味方が寄せ手を退けた場合も、本人が南岸へ来て合図し、安全を確かめて締める。
    // 空の対岸に架空の発砲数は足さず、何もしないままの達成にも変えない。
    if (!live(F.riverFoe)) { F.riverSecured = true; return true; }
    if (rt.t < (F.riverNext || 0)) return true;
    const targets = F.riverFoe.units.filter((u) => u.alive && !u.gone);
    let shots = 0;
    for (const g of [F.mzN, F.mzS]) for (const u of g.units) {
      if (!u.alive || u.gone || u.fleeing || u.woundOut || u.rearWound || u.sidearm || u.type !== 'gun' || dist(u.pos, RIVER) > 18 || !targets.length) continue;
      const target = targets[shots % targets.length];
      u.heading = Math.atan2(target.pos.x - u.pos.x, target.pos.z - u.pos.z); u.reload = 0;
      if (this.commandShot(rt, u, target)) shots++;
    }
    if (shots) {
      F.riverShots++; F.riverNext = rt.t + 7;
      sfx('playerGun', 1);
      // 三度の実射の後、寄せ手が崩れて佐竹が押し返す。
      if (F.riverShots === 3) {
        F.riverFoe.noRout = false; F.riverFoe.order = 'retreat'; F.riverFoe.dest = { x: -236, z: -100 };
        for (const u of F.riverFoe.units) if (u.alive) u.fleeing = true;
        F.satake.order = 'attack'; F.satake.anchor = { x: 48, z: -100 }; F.satake.seekRange = 60; F.satake.fire = true;
        rt.say('佐竹の使番', '川越しの鉄砲が効いた！　佐竹の先手が押し返したぞ', 4);
      }
    }
    return true;
  },

  // 奪った柵の桐の旗を倒し、上杉の竹に雀を立てる（k は柵の番号まで）
  takeFlags(rt, k) {
    for (const f of rt.flags.flagsAt || []) if (f.k <= k) { f.toy.visible = false; f.ue.visible = true; }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('s5');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    for (const g of F.foes) if (live(g)) { g.order = 'retreat'; g.dest = { x: EXIT_W.x, z: g.riverAid ? -100 : EXIT_W.z }; g.speed = 4.2; g.aggro = 0; g.noRout = false; }
    sfx('horagai', 0.8);
    rt.award((t) => { t.main = true; t.special = { label: '鴫野の堤を守り抜き、豊臣勢を城へ退けた', pts: 20 }; }, '鴫野の堤を守り抜いた');
    rt.banner('鴫野、上杉の勝ち', '大野治長の隊は城へ退いた');
    rt.after(1.2, () => rt.say('大野治長', '堤は取れなんだ……城へ引け。退き鐘を打て', 3.4));
    const A = this.talk.after;
    rt.after(5, () => rt.say(A[0][0], A[0][1], 3.4));
    rt.after(9, () => rt.say('家康の使番', '大御所様は上杉殿の返答をお聞きになり、重ねてのお下知は無かった由', 3.8));
    rt.after(13.5, () => rt.say(A[1][0], A[1][1], 4));
    rt.after(3, () => rt.army.celebrate(0));
    rt.finish({ scriptedEnd: true }, uesugi.ending(rt));   // 家康「上杉はやはり上杉よ」（k10/uesugi.js）
  },

  lose(rt, title, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.objFail('s' + (F.step || 1));
    rt.banner(title, why);
    rt.finish({ scriptedEnd: true, failureReason: why }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.step) return;
    const P = rt.player.u;
    if ((P.swing || P.atk || rt.army.time - (P.gunShotAt ?? -100) < 1) && F.foes.some((g) => g.units.some((u) => u.alive && !u.gone && dist(u.pos, P.pos) < 12))) F['playerFight' + F.step] = true;
    // 手勢は本人の脇に付いて一緒に走る（AP5）
    if ((F.mineT = (F.mineT || 0) - dt) <= 0) {
      F.mineT = 0.6;
      const g = F.mine, c = live(g) && g.center();
      if (c) {
        // ③の退きの間は、手勢も敵と組み合わずに本人の後ろへ退く
        if (F.step === 3) { g.order = 'retreat'; g.dest = { x: Math.max(P.pos.x, MIZU.x) + 6, z: 3 }; g.speed = 4.2; }
        else if (dist(c, P.pos) > 8) { g.order = 'move'; g.dest = { x: P.pos.x + 2, z: P.pos.z + 2.5 }; g.speed = 3.9; }
        else { g.order = 'attack'; g.seekRange = 14; }
      }
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    // 味方が先に討ち尽くした時は、本人が持ち場へ来て攻めの操作で確保を確認する。
    // 立って待つだけでは参戦に数えず、全滅後も進行不能にしない。
    const cleared = F.step === 1 ? !live(F.g1) && !live(F.g2) : F.step === 4 ? !live(F.wata) && !live(F.kimu) : F.step === 5 && !F.riverAid && !live(F.take);
    if (cleared && (P.swing || P.atk || rt.army.time - (P.gunShotAt ?? -100) < 1)) {
      const pin = this.missionPin(rt);
      if (pin && dist(P.pos, pin) < 22) F['playerFight' + F.step] = true;
    }
    // 退いた敵は遠く離れたら去らせる（本物の兵の枠を空ける）
    if ((F.gcT = (F.gcT || 0) - 0.25) <= 0) {
      F.gcT = 1;
      for (const g of F.foes) for (const u of g.units) if (u.alive && !u.gone && (u.fleeing || g.order === 'retreat') && u.pos.x < -150 && dist(u.pos, P.pos) > 70) rt.army.despawn(u);
      // 崩れて名の無い組に分かれた敵の残りは、目の届かない所で去らせる（味方の隊が泥田へ追い回さない・九4）
      for (const g of rt.army.groups) if (g.team === 1 && !F.foes.includes(g) && !g.isStruct && g.units.every((u) => !u.alive || u.gone || u.isStruct || (u.fleeing || g.order === 'retreat' || g.order === 'flee') && dist(u.pos, P.pos) > 45)) for (const u of g.units) if (u.alive && !u.gone && !u.isStruct) rt.army.despawn(u);
      // 大野治長は西の奥で旗本に囲まれて動かない（総大将は前に出ない・一2）
      const O = F.oono;
      if (live(O) && (O.order !== 'hold' || dist(O.center(), OONO) > 8) && O.order !== 'move' && O.order !== 'retreat') { O.order = 'hold'; O.anchor = { x: OONO.x, z: OONO.z }; O.seekRange = 8; O.aggro = 4; }
    }
    if (F.step === 1) {
      const k = F.w1S - sumN(F.g1, F.g2);
      // 本人も柵前の戦いに加わり、鉄砲衆を押し返すまで次へ進めない。
      if (k >= Math.round(F.w1S * 0.6) && F.playerFight1) this.toStep(rt, 2);
    } else if (F.step === 2) {
      // 来援の先手は三の柵の西で待つ（井上の討死までは寄せない）
      for (const g of [F.wata, F.kimu]) if (live(g) && g._wait && g.order === 'attack') { g.order = 'hold'; g.anchor = { x: g._wait.x, z: g._wait.z }; g.seekRange = 8; g.aggro = 4; }
      if (live(F.ino) && F.ino.order !== 'hold') { F.ino.order = 'hold'; F.ino.anchor = { x: INOUE.x, z: 0 }; }
      if (live(F.inoG) && (F.inoG.order !== 'hold' || F.inoG.anchor.x !== INO_POST.x)) { F.inoG.order = 'hold'; F.inoG.anchor = { x: INO_POST.x, z: INO_POST.z }; }
      // 井楼の下の井上には本人の一撃が通る。近くで待った時間だけで代わりに討たない。
      if (F.inoU && !F.inoU.alive && F.inoByMe && !F.inoDown) {
        F.inoDown = true;
        rt.banner('井上頼次、討ち取ったり', '三の柵の鉄砲が止んだ');
        if (F.inoByMe) rt.award((t) => { t.special = { label: '井上頼次を討ち取った', pts: 24 }; }, '井上頼次を討ち取った');
        rt.after(3, () => this.toStep(rt, 3));
      }
    } else if (F.step === 3) {
      // 鉄砲の列（x 70・z ±9）に並べば後ろに付いたとみなす。堤の真ん中は須田の先手（x 74）がふさぎ、列の奥（x 72 超）へは抜けにくい（11/9 関所：列の脇で七十秒止まって負けた）
      if (P.pos.x > MIZU.x + 1 && P.pos.x <= MIZU.x + 22 && Math.abs(P.pos.z) < 16) this.toStep(rt, 4);
      // 時間だけで敗北にせず、追手との実際の戦闘を続ける。
    } else if (F.step === 4 && !F.back4) {
      // 追う敵が一の柵の跡へ詰めたら、堤の左右の鉄砲が一斉に火を吹く（遅くとも十五秒で。11/6 遊んで：追う隊が先に先手と組み合って崩れ、一斉射が一度も出なかった）
      if (F.shot < 2 && rt.t - (F.volleyTry ?? -100) >= 4) {
        const near = [F.wata, F.kimu].some((g) => g && g.units.some((u) => u.alive && !u.gone && u.pos.x > MIZU.x - 40));
        if (near || rt.t - F.volT > 15) {
          F.volleyTry = rt.t;
          this.volley(rt);
          for (const g of [F.mzN, F.mzS]) g.fire = true;
          if (F.shot === 1 && !F.counterOrdered) {
            F.counterOrdered = true;
            rt.after(5, () => {
              // 次の段や今福救援へ進んだ後は、古い突撃の下知で隊を戻さない。
              if (F.ending || F.step !== 4 || F.back4) return;
              for (const g of [F.yasu, F.suda]) { g.order = 'attack'; g.seekRange = 30; g.aggro = 16; g.anchor = { x: F1 - 8, z: 0 }; }
              rt.army.play('toki', { x: MIZU.x, z: 0 }, 1.5);
              rt.say('安田能元', '今じゃ！ 煙の晴れぬうちに、槍を揃えて突き入れ！', 3.2);
            });
          }
        }
      }
      const k = F.w4N - sumN(F.wata, F.kimu);
      // 本人も参戦して全て退けた時は、撃つ相手のいない一斉射を待たせない。
      const repelled = F.shot >= 2 || !live(F.wata) && !live(F.kimu);
      if (k >= Math.round(F.w4N * 0.6) && repelled && F.playerFight4) {
        for (const g of [F.wata, F.kimu]) if (live(g)) { g.order = 'retreat'; g.dest = { x: -150, z: 0 }; g.speed = 4; g.aggro = 0; }
        rt.say('渡辺糺', '上杉の鉄砲、侮れぬ……一度引け！', 2.8);
        rt.after(3, () => this.toStep(rt, 5));
        F.back4 = true;
      }
    } else if (F.step === 5) {
      const k = F.w5N - aliveN(F.take);
      if (k >= Math.round(F.w5N * 0.6) && F.playerFight5 && !F.riverAid) this.riverAid(rt);
      // 崩れた瞬間は、まだ佐竹の目の前に寄せ手がいる。北岸を実際に退くまで救援を終えない。
      const riverClear = F.riverAid && !live(F.riverFoe) && !F.riverFoe.units.some((u) =>
        u.alive && !u.gone && u.pos.x > RIVER.x - 40);
      if (riverClear && (F.riverShots >= 1 || F.riverSecured) && rt.t >= 240) this.win(rt);
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) { F.ek++; if (k?.isPlayer) F['playerFight' + F.step] = true; } else F.ak++;
    if (v.name === '井上頼次') F.inoByMe = !!k?.isPlayer;
    if (v.name === '穴澤盛秀' && !F.ending) rt.say('足軽', '大坂方の穴澤盛秀、堤の上で討たれたぞ！', 3);
    KIT.carrion(rt, v);
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name && !rt.flags.ending) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },

  // bot：近い敵を突き、いなければ段の行き先へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer || !F.step || F.ending) return;
    if (F.riverAid) {
      if (dist(u.pos, RIVER) > 12) goTo(p, inp, RIVER.x, RIVER.z, 8);
      else if (b.t >= (F.riverNext || 0)) inp.leftPressed = true;
      return;
    }
    // 井上は味方に討たれないための保護付きだが、本人の一撃は通る。
    // 保護だけで除くと、周りの兵を討った後に足元で待ち続けてしまう。
    const ok = (o) => o.alive && !o.gone && !o.fleeing && (!o.invuln || F.step === 2 && o === F.inoU) && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const inoue = F.step === 2 && F.inoU && ok(F.inoU) ? F.inoU : null;
    const e = F.step === 3 ? null : inoue || b.army.nearestEnemy(u, 9, ok);
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    const t = this.missionPin(b) || MIZU;
    goTo(p, inp, t.x, t.z, 2);
    // 味方が先に全滅させた持ち場でも、本人の攻めの操作で確保を確認する。
    if ((F.step === 1 || F.step === 4 || F.step === 5) && dist(u.pos, t) < 8) inp.leftPressed = true;
  },
};

// 兵数は諸説。上杉勢およそ五千、柵を守る井上頼次の手およそ二千、来援の大野治長らおよそ一万二千
k10_shigino.force = (rt) => {
  const F = rt.flags, big = (F.step || 0) >= 3;
  const b0 = big ? 14000 : 2000;
  return { a: Math.max(2000, Math.round(5000 - (F.ak || 0) * 20)), a0: 5000, b: F.ending && rt.tracker.main ? 3000 : Math.max(0, Math.round(b0 - (F.ek || 0) * 25)), b0 };
};
k10_shigino.canSkip = (rt) => (!rt.flags.step && rt.t > 3 ? '下知まで待つ' : '');
k10_shigino.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k10_shigino.history = '慶長十九年（1614）十一月二十六日、大坂冬の陣。大坂城の東の鴫野は低い湿地で、大軍は大和川沿いの堤の上しか動けなかった。豊臣方は堤に三重の柵を作り、井上頼次に守らせた。\n上杉景勝の軍の先手、須田長義・安田能元らが柵を次々に奪い、井上頼次は討ち死にした。城から大野治長・渡辺糺・竹田永翁・木村宗明・穴澤盛秀らが一万二千で来援し、上杉の先手は一の柵まで押し戻された。二番手の水原親憲が堤の左右から鉄砲を一斉に放ち、安田能元が槍で突き入って押し返した。\n家康は上杉に「退いて休み、堀尾忠晴と代われ」と命じたが、景勝は戦の最中に退かぬと拒んだ。堀尾・丹羽長重・榊原康勝らの助けも加わり、豊臣方は城へ退いた。同じ日、大和川の北の今福で佐竹義宣らが木村重成・後藤基次に押されると、上杉の鉄砲隊が大和川の中州から川越しに撃ちかけ、佐竹勢を助けた。';
k10_shigino.bushou = [{ name: '井上頼次', g: /頼次/ }, { name: '渡辺糺', g: /渡辺糺/ }, { name: '竹田永翁', g: /永翁/ }];

const st = (n) => (rt) => (rt.flags.step ?? 0) >= n;
STAGES[ID] = [['一の柵・二の柵の鉄砲衆を討つ'], ['三の柵の井楼の下で井上頼次を討つ', st(2)], ['堤を東へ退き、水原親憲の鉄砲の後ろに付く', st(3)], ['渡辺糺・木村宗明の隊を二の柵の跡まで押し返す', st(4)], ['二の柵の跡で竹田永翁の隊を討ち、大和川南岸から今福を救う', st(5)]];
// 倒す数（kaito 11/2 O）：段が進む判定と同じ数え方（stages.js）
KILLS[ID] = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 1) return cut(F.w1S, sumN(F.g1, F.g2), F.w1S - Math.round(F.w1S * 0.6));
  if (F.step === 4 && !F.back4) return cut(F.w4N, sumN(F.wata, F.kimu), F.w4N - Math.round(F.w4N * 0.6));
  if (F.step === 5) return cut(F.w5N, aliveN(F.take), F.w5N - Math.round(F.w5N * 0.6));
  return null;
};

export { k10_shigino };
export default k10_shigino;
