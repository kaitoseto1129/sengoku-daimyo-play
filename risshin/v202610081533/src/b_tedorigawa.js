import { rosterPlan, rosterBuild } from './jinkei_roster.js';
// ======================================================================
// 織田家編　手取川の戦い（天正五年九月二十三日）
// 能登の七尾城を助けに、柴田勝家を大将とする織田勢が加賀へ入り、手取川を越えた。
// だが七尾城はすでに上杉謙信の手に落ちていた。それを知った織田勢は退き始め、夜、手取川を渡るところを上杉勢に追われた。
// 足軽は柴田勝家の手。①退き始めと川の詰まり ②柴田の殿→逆襲→本隊を渡す→三本の線で退く
// ③最後に自分の組も増えた川を渡る ④南の岸で遅れた殿の列を待ち、退く
// 秀吉の離陣は開戦前の知らせで振り返る。勝利は討取りではなく、味方を生きて渡すこと。
// 大軍は初めから備えごとに置く。上杉の射手は北岸から渡り口を狙う
// 戦の大きさには諸説あり、ここでは退き口として描く
// 向き：南（+z）の岸が味方の退く先。川は南東から北西へ流れる。北（-z）から上杉勢が来る
// ======================================================================
import * as THREE from 'three';
import { distToPolyline } from './world.js';
import { nobori, tawara, campfire } from './props.js';
import { RANKS } from './state.js';
import { S as SETTINGS } from './settings.js';
import { sfx } from './audio.js';
import { allyGroup, enemyGroup, nm, unitPos } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, hold, depthBot } from './b_depth.js';
import { uS, uA, uC, round, gunLine, camp } from './b_mid.js';
import { sightUnit } from './battle_sight.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const ABSENCE_LINES = ['列を離れるな！　かがり火へ戻れ', '追手を追うな！　退く者を守れ', '殿が薄いぞ！　組と持ち場へ戻れ'];
const BREACH_LIMIT = 30; // 殿へ組と戻り、敵を押し返す時を残す

const RIVER = [[-240, -22], [-120, -10], [0, 2], [120, 14], [240, 26]];
const FLOW = RIVER.slice(1).map((b, i) => {
  const a = RIVER[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  return { ax: a[0], az: a[1], dx, dz, len2: len * len, x: -dx / len, z: -dz / len };
});
const FORD = { x: 0, z: -26 };              // 北の岸の渡り口
const SOUTH = { x: 4, z: 34 };              // 南の岸（退く先）
const RIVER_TINT = { r: 0.42, g: 0.42, b: 0.36 };
const ODA = { flag: 'oda' };
const UESUGI = { flag: 'uesugi' };

// この戦の深みだけで働く。岸と渡り口の歩み、他の戦の人の処理は変えない。
function swimming(rt, u) {
  return u.alive && !u.isStruct && rt.world.waterDepthAt(u.pos.x, u.pos.z) > 1.8;
}
function waterPose(rt, u) {
  if (!u.mesh || !u.alive) return;
  const wet = swimming(rt, u);
  if (wet) {
    const depth = rt.world.waterDepthAt(u.pos.x, u.pos.z);
    u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z) + depth - (u.mounted ? 1.1 : 1.35);
    u.mesh.position.copy(u.pos);
    u.mesh.rotation.order = 'YXZ';
    u.mesh.rotation.x = u.mounted ? -0.12 : -0.6;
    u.tedoWaterPose = true;
  } else if (u.tedoWaterPose) {
    u.mesh.rotation.x = 0; u.tedoWaterPose = false;
  }
}
function waterActions(rt) {
  const A = rt.army, P = rt.player, W = rt.world;
  const act = A.act, animate = A.animate, update = P.update;
  // 共通の移動にだけ水深の壁を外す。描画・息・流れには本当の水深を渡す。
  const footDepth = W.waterFootDepthAt, canStep = P.canStep, collide = A.collide, steer = A.steer;
  W.waterFootDepthAt = function (x, z, y) {
    const d = footDepth.call(this, x, z, y);
    return this.tedoMoving ? Math.min(0.85, d) : d;
  };
  P.canStep = function (x0, z0, x, z, y) {
    const before = W.tedoMoving; W.tedoMoving = true;
    try { return canStep.call(this, x0, z0, x, z, y); } finally { W.tedoMoving = before; }
  };
  A.collide = function (u, dt) {
    const before = W.tedoMoving; W.tedoMoving = true;
    try { return collide.call(this, u, dt); } finally { W.tedoMoving = before; }
  };
  A.steer = function (u, dt, want, speed, face) {
    const before = W.tedoMoving; W.tedoMoving = true;
    try { return steer.call(this, u, dt, want, speed, face); } finally { W.tedoMoving = before; }
  };
  A.act = function (u, dt, near) {
    if (!swimming(rt, u)) return act.call(this, u, dt, near);
    u.target = u.atk = u.swing = u.bind = null; u.charging = false;
    u.reload = null; u.guarding = 0;
    // 隊の進む向きは保つ。岸へ出るまで戦わず、足の届かぬ具足は速く泳げない。
    const at = u.tedoSwimTo || (u.tedoSwimTo = { x: u.pos.x, z: u.pos.z });
    if (u.fleeing || u.group?.routed) { at.x = 2; at.z = u.team ? -30 : SOUTH.z; }
    else { const q = u.moveTo || u.group.anchor; at.x = q.x; at.z = q.z; }
    this.steer(u, dt, at, u.mounted ? 0.65 : 0.45, null);
    u.moving = 0;
  };
  A.animate = function (u, dt, near) {
    const moving = u.moving;
    if (swimming(rt, u)) u.moving = 0;
    animate.call(this, u, dt, near); u.moving = moving;
    waterPose(rt, u);
  };
  P.update = function (dt, input) {
    const x = this.u.pos.x, z = this.u.pos.z, wasDeep = swimming(rt, this.u);
    if (swimming(rt, this.u)) {
      this.cancelAttack(); this.shot = null; this.draw = 0;
      this.guardOn = this.guard = this.aiming = this.u.guard = false;
    }
    update.call(this, dt, input);
    if (swimming(rt, this.u)) {
      this.cancelAttack(); this.shot = null; this.draw = 0;
      this.guardOn = this.guard = this.aiming = this.u.guard = false;
    }
    if (this.u.alive && (wasDeep || swimming(rt, this.u))) {
      const dx = this.u.pos.x - x, dz = this.u.pos.z - z, d = Math.hypot(dx, dz);
      const cap = (this.mounted ? 0.65 : 0.45) * dt;
      if (d > cap) { this.u.pos.x = x + dx * cap / d; this.u.pos.z = z + dz * cap / d; }
      this.u.moving = 0;
    }
  };
  // 当たりを付ける直前にも水深を読む。入水した一コマだけ斬撃が通ることを防ぐ。
  for (const key of ['strike', 'fireShot', 'looseArrow']) {
    const action = P[key];
    P[key] = function (a, b, c, d) {
      if (swimming(rt, this.u)) return;
      const result = action.call(this, a, b, c, d);
      const target = this.u.swing?.target;
      if (key === 'strike' && target?.team === 1 && this.u.swing.done) rt.flags.playerHelp = true;
      return result;
    };
  }
}

function messengerNews(rt, target, text) {
  const F = rt.flags, g = F.runner;
  if (!g?.count || !target.alive) return;
  const news = { target, text, at: rt.t };
  if (F.runnerNews || rt.t < (F.runnerVoiceAt || 0) || F.runnerQueue?.length) {
    const queue = F.runnerQueue || (F.runnerQueue = []);
    if (queue.length < 4) queue.push(news);
    return;
  }
  F.runnerNews = news;
  // 行き先は組を作った直後には無い。知らせを届ける間は同じ入れ物を使う。
  g.dest ??= { x: 0, z: 0 };
  g.order = 'move'; g.dest.x = target.pos.x; g.dest.z = target.pos.z;
}
function messengerTick(rt) {
  const F = rt.flags, g = F.runner;
  if (!F.runnerNews && rt.t >= (F.runnerVoiceAt || 0) && F.runnerQueue?.length) {
    F.runnerNews = F.runnerQueue.shift(); F.runnerNews.at = rt.t;
    g.order = 'move';
  }
  const n = F.runnerNews;
  if (!n) return;
  const man = g.units[0];
  if (!g.count || !man.alive || man.fleeing || man.woundOut || !n.target.alive || rt.t - n.at > 30) { F.runnerNews = null; return; }
  const c = man.pos, p = n.target.pos;
  if (Math.hypot(c.x - p.x, c.z - p.z) <= 4) {
    rt.say('使いの者', n.text, 3.5); F.runnerNews = null; F.runnerVoiceAt = rt.t + 8;
    if (!F.nanaoHeard && n.text.includes('七尾城')) { F.nanaoHeard = true; rt.banner('手取川の北の岸', '雨の夜、七尾落城の報せ'); }
    g.anchor ??= { x: 0, z: 0 };
    g.order = 'hold'; g.anchor.x = c.x; g.anchor.z = c.z;
  } else {
    g.dest ??= { x: 0, z: 0 };
    g.dest.x = p.x; g.dest.z = p.z;
  }
}

function shelterGeneral(g, general) {
  if (!general) return;
  const i = g.units.indexOf(general), mid = Math.floor(g.units.length / 2);
  if (i < 0) return;
  [g.units[i], g.units[mid]] = [g.units[mid], g.units[i]];
  g.leader = general;
  for (let k = 0; k < g.units.length; k++) {
    const u = g.units[k], p = g.slotPos(k, g.initial);
    u.slot = k; u.pos.x = p.x; u.pos.z = p.z;
  }
}

function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.03 + 0.2) * Math.cos(z * 0.028) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  // 川原は低く、両岸に土手
  const bank = z - (2 + x * 0.1);
  h += 1.4 * Math.exp(-((bank + 27) ** 2) / 32) + 1.4 * Math.exp(-((bank - 29) ** 2) / 32);
  // 川沿いの平野。白山を数百歩先の丘として置かない。
  return h;
}

// 手取川の参照表・北国出陣の将名。特定の陣名と上杉の各備の将は伝わらない。
// 南向きに退く織田、北から南へ追う上杉。秀吉は離陣の振り返りだけで本戦の人数に含めない。
const JIN = [
  rosterPlan('川を背にした備え', 0, { x: 0, z: -66 }, 0, [
    ['shibata', '本陣', '柴田勝家', 8000, 0, -66, 'oda', 'oda', 0, { bind: 'shiba' }],
    ['niwa', '西の備え', '丹羽長秀', 5000, -30, -60, 'oda', 'oda', 0, { bind: 'others.0' }],
    ['maeda', '東の備え', '前田利家', 4000, 32, -62, 'maeda', 'maeda', 0, { bind: 'others.1' }],
    ['inaba', '西の渡河列', '稲葉良通・氏家直昌・安藤守就', 7000, -8, -80, 'oda', 'oda', 120, { w: 4, d: 64, facing: 0, host: false }],
    ['sassa', '東の渡河列', '佐々成政・不破光治・金森長近', 3000, 8, -110, 'oda', 'oda', 100, { w: 4, d: 56, facing: 0, host: false }],
    ['takigawa', '南岸の受け取り', '滝川一益', 3000, 34, 104, 'takigawa', 'takigawa', 0, { bind: 'honjin' }],
  ], '野戦の参照表・手取川。総勢三万を仮置き（四万とも）、各備の兵数と並びは補完'),
  rosterPlan('追撃の備え', 1, { x: 64, z: -206 }, 0, [
    ['kenshin', '本陣', '上杉謙信', 2000, 64, -206, 'uesugi', 'uesugi', 0, { bind: 'ehon' }],
    ['front', '先手', '上杉謙信の配下（名は不明）', 6000, -6, -150, 'uesugi', 'uesugi', 180, { w: 40, d: 24, kind: 'spear', host: false, armor: 0x2a2a2a }],
    ['right', '東の脇備え', '上杉謙信の配下（名は不明）', 4000, 96, -160, 'uesugi', 'uesugi', 120, { w: 28, d: 22, kind: 'spear', host: false, armor: 0x2a2a2a }],
    ['second', '後備え', '上杉謙信の配下（名は不明）', 5000, 0, -190, 'uesugi', 'uesugi', 140, { w: 30, d: 28, kind: 'spear', host: false, armor: 0x2a2a2a }],
    ['left', '西の脇備え', '上杉謙信の配下（名は不明）', 3000, -70, -180, 'uesugi', 'uesugi', 100, { w: 26, d: 22, kind: 'spear', host: false, armor: 0x2a2a2a }],
  ], '野戦の参照表・手取川。謙信直率八千・全軍二万とも。合戦の規模には異説'),
];
const tedorigawa = {
  guideMarker: (rt) => rt.flags.dp?.on ? 'dp' : rt.flags.step === 1 ? 'ford' : rt.flags.step === 3 || rt.flags.step === 4 ? 'south' : 'shiba',
  wakeOK: (rt) => rt.flags.step >= 1 && rt.t >= 30, // 落城の知らせと退く下知より先に、近くの備えを戦わせない。
  botOrders: true, // 殿の持ち場・退避・渡河を、遊び手の突進で上書きしない
  jinkei: JIN,
  noTaisho: true, // 本人と護衛はこの戦で置く。謙信の討取りで決着させない。
  noDistantBattle: true, // 備えにない軍勢を自動で追加しない。
  noWake: false, // 近くの軽い兵は同じ場所で本物へ替え、遠くへ戻せる兵の枠を回す。
  wakeRoom: 240, // 本人・供の余地を残し、共通の二百五十人の上限内で替える。
  spawn: { x: 6, z: -60, heading: 0 },
  world: {
    seed: 15777,
    moveLim: 230,   // 置いた兵が 176 の端に貼り付いていた（見回り 10/2）
    time: 'night',
    fieldStage: 'stubble', // 秋の刈田は推定。春の苗を置かない。
    muddy: 1,
    waterSlow: true,
    // 渡り口は復元。深みを見えない壁にせず、この戦の流れと息で扱う。
    riverCross: false,
    // 浅瀬も増水で約一歩の深さになる。歩みは通し、流れと息の危険は flood で扱う。
    streams: [{ pts: RIVER, w: 24, depth: 1.9, fordDepth: 1.1, fords: [{ x: 2, w: 8 }] }],
    paths: [[[0, -200], [2, -60], [FORD.x, FORD.z], [SOUTH.x, SOUTH.z], [6, 160]]],
    height,
    // 川原の色も北西へ続く川筋に沿わせる。東西の帯を残さない。
    tint(x, z, h, c) { if (distToPolyline(x, z, RIVER) < 17) c.lerp(RIVER_TINT, 0.4); },
    clear: (x, z) => (Math.abs(x) < 110 && z > -120 && z < 80) || Math.hypot(x - 34, z - 104) < 20,
    trees: 320,
    get tufts() { return SETTINGS.quality === 'low' ? 1800 : 5200; },
    treeDensity: (x, z) => (Math.abs(x) < 120 && z > -130 && z < 90 ? 0.1 : 0.8),
    groves: [{ x: -60, z: -60, r: 12, n: 16 }, { x: 70, z: -40, r: 12, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && z < -150,
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 平野の深みへ入れる。浅瀬付きの共通の水深制限だけ、この世界で外す。
    const walkable = W.walkable.bind(W);
    W.walkable = (x, z) => W.waterDepthAt(x, z) > 0.85 || walkable(x, z);
    F.rescued = true; // 倒れてから担ぎ起こして戦へ戻さない。
    W.setRainTarget(0.9);   // 夜の明るさと雨を分ける。昼の雷雨の空にはしない。
    // この川だけ、濁りと波筋を流木・兵の流れる北西向きにそろえる。
    const riverMesh = W.def.streams[0].mesh;
    if (riverMesh) {
      riverMesh.material.color.setHex(0x494333);
      const flow = riverMesh.geometry.attributes.waterFlow;
      if (flow) { for (let i = 0; i < flow.array.length; i++) flow.array[i] *= -1; flow.needsUpdate = true; }
    }
    F.step = 0; F.ek = 0; F.ak = 0; F.crossRemaining = 30;
    F.pushTime = 0; F.reliefUntil = 0; F.mainCross = 0;
    // 届いた同じ下知の声を八秒あける。使番が運ぶ処理は止めない。
    const voiced = new Map(), command = rt.warVoices.command;
    rt.warVoices.command = function (who, text) {
      if (rt.t - (voiced.get(text) ?? -Infinity) < 8) return;
      voiced.set(text, rt.t); return command.call(this, who, text);
    };
    F.ford = { width: 8, capacity: 24, inside: 0, queue: 0, pressure: 0, jam: 0, cargoUntil: 0 };
    // 渡る口は毎秒の数えで入れる人数を決める。兵の行き先は使い回す。
    W.def.moveWay = (army, u, want) => {
      if (u.team !== 0 || F.ending || u.pos.z < -42 || u.pos.z >= -24 || want.z <= -24 ||
          u.tedoAdmitUntil > rt.t || Math.abs(u.pos.x - 2) > 12) return want;
      const q = u.tedoWait;
      if (!q) return want;
      q.x = Math.max(2 - F.ford.width / 2, Math.min(2 + F.ford.width / 2, u.pos.x));
      q.z = Math.min(u.pos.z, -25);
      return q;
    };
    // 敗走中に共通の救済兵を足元へ出さない。
    rt._rfN = 3;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { river: 'HIST_A', flood: 'HIST_B', honjinOda: 'HIST_B', mizushima: 'HIST_B', honjinUesugi: 'GAME_C', fordMain: 'GAME_C' };
    // 北岸の退き口。水島の陣所を川岸の数十歩先と確定しない。
    // ---- 北の岸の陣（払いかけ） ----
    // この地点で確かめられない小屋を置かず、払いかけの陣は旗と荷駄で示す。
    rt.scene.add(tawara(W, -14, -64, 0.3, 5), tawara(W, 20, -60, -0.2, 4));
    F.cargo = tawara(W, 8, FORD.z - 2, 0.2, 4); rt.scene.add(F.cargo);
    for (const [x, z] of [[-8, -52], [10, -54], [-40, -58], [44, -60]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    // ---- 総大将の護衛、丹羽・前田の渡河列 ----
    F.shiba = allyGroup(rt, { fixed: true, name: '柴田勝家の手', anchor: { x: 0, z: -66 }, facing: 0, width: 14, aggro: 3, noRout: false, formation: 'column', colW: 2 },
      dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 }, { type: 'ashigaru', n: 4 }], ODA));
    F.shibaU = F.shiba.units[0];
    shelterGeneral(F.shiba, F.shibaU);
    F.others = [
      allyGroup(rt, { fixed: true, name: '丹羽長秀の手', anchor: { x: -30, z: -60 }, facing: 0, width: 12, aggro: 3, noRout: false, formation: 'column', colW: 2 }, dress([{ type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'ashigaru', n: 14 }], ODA)),
      allyGroup(rt, { fixed: true, name: '前田利家の手', anchor: { x: 32, z: -62 }, facing: 0, width: 12, aggro: 3, noRout: false, formation: 'column', colW: 2 }, dress([{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true } }, { type: 'ashigaru', n: 14 }], { flag: 'maeda' })),
    ];
    for (const g of F.others) shelterGeneral(g, g.units[0]);
    for (const g of [F.shiba, ...F.others]) { g.defMult = 1; g.dmgMult = 1; }
    // 殿だけは二十人を保つ。敗走の連鎖を防ぎ、白兵の傷を軽くする。討死は残る。
    F.rear = allyGroup(rt, { fixed: true, fullStrength: true, noRout: true, defMult: 1.8, name: '柴田の殿', anchor: { x: 0, z: -52 }, facing: Math.PI, width: 14, aggro: 6, seekRange: 16, formation: 'yari', yariRanks: 3 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }], ODA));
    F.rgun = allyGroup(rt, { fixed: true, name: '柴田の弓組', anchor: { x: RG.x, z: RG.z + 7 }, facing: Math.PI, width: 6, aggro: 4, formation: 'line' },
      dress([{ type: 'samurai', n: 1 }, { type: 'bow', n: 6 }], ODA));
    F.crossGroups = [F.shiba, ...F.others];
    // 将と左右の旗本は、浅瀬の幅の中を歩く。流れも傷も歩兵と同じまま。
    for (const g of F.crossGroups) {
      const lord = g.units.find((u) => u.name && u.invuln);
      if (!lord) continue;
      lord.fordEscort = { active: false, at: { x: 2, z: SOUTH.z }, lord: null, side: 0 };
      let side = -1;
      const mid = g.units.indexOf(lord);
      for (const i of [mid - 1, mid + 1]) {
        const u = g.units[i];
        if (!u || u.name) continue;
        u.fordEscort = { active: false, at: { x: 2, z: SOUTH.z }, lord, side };
        side += 2;
      }
    }
    F.crossInitial = F.crossGroups.reduce((n, g) => n + g.count, 0) + F.rear.count + F.rgun.count;
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: -58 }, 0, [{ kind: 'spear', n }]);
    F.rearFriends = [F.rear, ...(rt.squadGroups || [])];
    for (const g of rt.squadGroups || []) F.crossInitial += g.count;
    // ---- 大軍（軽い作り）：南の岸へ渡っていく織田の本隊、北から来る上杉の大軍 ----
    const hosts = rosterBuild(rt, JIN);
    F.main = [hosts[0].inaba, hosts[0].sassa];
    F.host = [hosts[1].second, hosts[1].left];
    F.host2 = [hosts[1].front, hosts[1].right];
    for (const m of [...F.main, ...F.host, ...F.host2]) m.army.noWake = false;
    for (const at of RETREAT_LINES) W.addFire(at.x + 8, at.z, { torch: true, h: 1.6 });
    for (const [x, z] of [[-20, -80], [24, -84]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    // 闇の中の目じるし：北の岸の松明の列（B051）と、渡り口の旗と篝火（B053）
    for (const [x, z] of [[-48, -52], [-30, -58], [30, -60], [48, -54], [-12, -40], [14, -42]]) W.addFire(x, z, { torch: true, h: 1.6 });
    for (const sd of [-1, 1]) { rt.scene.add(nobori(W, FORD.x + sd * 15, FORD.z - 4, 'oda', 6), campfire(W, FORD.x + sd * 17, FORD.z - 6)); W.addFire(FORD.x + sd * 17, FORD.z - 6); }
    rt.scene.add(nobori(W, SOUTH.x + 12, SOUTH.z + 6, 'oda', 6));
    W.addFire(SOUTH.x + 12, SOUTH.z + 6, { torch: true, h: 1.6 });
    // 北の上杉謙信の本陣（遠く。見に行けば謙信と旗本がいる）
    // 南の岸の織田の本陣（滝川一益が退く列を受け取る）
    F.honjin = camp(rt, { x: 34, z: 104, facing: Math.PI, team: 0, faction: 'oda', mon: 'takigawa', general: { name: '滝川一益', hat: 'kabuto_m', haori: 0x2a3440 }, guard: 15, reserve: 0, runTo: { x: SOUTH.x, z: SOUTH.z + 10 } });
    F.ehon = camp(rt, { x: 64, z: -206, facing: 0, team: 1, faction: 'saito', mon: 'uesugi', armor: 0x2a2a2a, general: { name: '上杉謙信', hat: 'hachimaki', haori: 0xd8d2c0 }, guard: 25, reserve: 0, runTo: { x: 0, z: -150 } });

    // 幕の口でなく敵の側を守る。雨中の旗本は槍と侍を主にする。
    for (const c of [F.honjin, F.ehon]) {
      const g = c.guard;
      g.formation = 'yari'; g.yariRanks = 3; g.aggro = 6; g.seekRange = 18;
      g.order = 'move'; g.dest = { x: c.pos.x, z: c.pos.z + (g.team ? 12 : -12) };
      g.onArrive = (q) => { q.order = 'hold'; };
    }
    F.reserves = [
      W.addDistantArmy({ x: 34, z: 134, facing: Math.PI, team: 0, flag: 'takigawa', count: 120, w: 34, d: 24, kind: 'spear', host: false }),
      W.addDistantArmy({ x: 100, z: -206, facing: 0, team: 1, flag: 'uesugi', count: 180, w: 36, d: 28, kind: 'spear', host: false }),
    ];
    for (const m of F.reserves) m.army.noWake = false;
    F.northSteps = tedoA(); F.southSteps = tedoB();
    preparePursuit(rt, F.northSteps, 0); preparePursuit(rt, F.southSteps, 1);
    F.runner = allyGroup(rt, { fixed: true, fullStrength: true, name: '退き口の使番',
      anchor: { x: -8, z: -82 }, facing: 0, formation: 'column', aggro: 0, seekRange: 0, noAI: true },
    dress([{ type: 'samurai', n: 1, o: { weapon: 'none' } }], ODA));
    F.runner.isRunner = true; F.runner.speed = 4;
    // 移動の目当てと水の状態は準備時に作って使い回す。
    for (const u of rt.army.units) {
      u.tedoSwimTo = { x: u.pos.x, z: u.pos.z };
      u.tedoWait = { x: u.pos.x, z: u.pos.z };
    }
    waterActions(rt);
    rt.setPhase('brief'); rt.objProgress('main', '');
    rt.obj('main', HI(rt) ? '一手をまとめ、柴田勝家の下知を待て' : '柴田勝家の下知を待て', 'main');
    rt.banner('手取川の北の岸', '雨の夜、退く下知を待つ');
    rt.say('組頭', '筑前様の手はもうおらぬ。勝家様の下知を待て', 4);
    rt.marker('shiba', unitPos(F.shibaU), '柴田勝家', {});
    rt.after(6, () => {
      if (F.ending || rt.over || F.step !== 0) return;
      messengerNews(rt, F.shibaU, '七尾城、上杉の手に落ちた由にござる！');
    });
    rt.after(22, () => this.retreat(rt));
    F.retreatTimer = rt.timers[rt.timers.length - 1];
  },

  // ① 渡り口まで退く
  retreat(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('retreat'); rt.objProgress('main', '');
    rt.unmark('shiba');
    sfx('taiko', 0.6);
    if (!F.nanaoHeard) {
      F.nanaoHeard = true;
      rt.say('柴田勝家', '七尾は落ちた。殿は渡り口を守れ！', 4);
    } else rt.say('組頭', '退けとの下知じゃ！　殿は北岸に踏みとどまれ！', 4);
    rt.obj('main', '組頭に続き、北岸の火へ退け', 'main');
    rt.marker('ford', { x: FORD.x, z: FORD.z - 10 }, '北岸の殿の持ち場', { h: 2 });
    rt.zone('ford', FORD.x, FORD.z - 10, 7);
    F.shiba.formation = 'column'; F.shiba.colW = 2;
    // 初めの陣の場所だけを固定する。退く列は小屋を避けて持ち場を詰める。
    F.shiba.fixed = false; F.shiba.retreatOnly = false;
    F.shiba.order = 'move'; F.shiba.dest = { x: -8, z: -38 }; F.shiba.speed = 2; F.shiba.aggro = 5;
    F.shiba.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; g.formation = 'yari'; g.width = 10; };
    F.rear.order = 'move'; F.rear.dest = RG; F.rear.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; };
    // 雨と川の音で下知が届かず、一手は止まり、一手は横へ走る。
    messengerNews(rt, rt.player.u, '川音に下知が消され、諸手が乱れてござる！');
    F.others[0].order = 'hold'; F.others[0].morale = 55;
    F.others[1].order = 'move'; F.others[1].dest = { x: 60, z: -44 }; F.others[1].speed = 3.2; F.others[1].morale = 45;
    F.others[1].onArrive = (g) => { g.order = 'hold'; };
    F.others.forEach((g, i) => rt.after(20 + i * 18, () => {
      if (F.ending || rt.over) return;
      // 川の中では中央の渡り口を通る。左右へ列を分けるのは南の岸へ上がってから。
      g.fixed = false; g.retreatOnly = true;
      g.order = 'path'; g.path = [[i ? 4 : 0, -44], [i ? 4 : 0, FORD.z], [i ? 4 : 0, SOUTH.z], [SOUTH.x + (i ? 16 : -16), SOUTH.z + 20], [SOUTH.x + (i ? 20 : -20), 90]];
      g.pathIdx = 0; g.speed = 1.8; g.colW = 2; g.formation = 'column'; g.aggro = 0;
      g.onArrive = (q) => { q.order = 'hold'; };
      messengerNews(rt, g.leader || g.units[0], i ? '前田の手は渡り口へ！　南岸へ退けとの下知じゃ！' : '丹羽の手に下知！　渡り口へ退け！');
    }));
    // 大軍も中央の渡り口へ寄せてから縦列で渡す。
    F.main.forEach((m, i) => rt.after(12 + i * 22, () => {
      if (F.ending || rt.over) return;
      m.moveTo(i ? 4 : 0, i ? -76 : -54, 24);
    }));
    for (const h of F.host) h.advance(60, 60);
    for (const h of F.host2 || []) h.advance(45, 50);
    // 持ち場へ着くのを待たず追撃する。下知を聞き逃しても、敵が来ないまま止まらない。
    rt.after(8, () => {
      if (F.ending || rt.over || F.step !== 1) return;
      rt.say('組頭', '北から追手じゃ！　北岸の火まで退け！', 3.5);
      for (const g of F.northSteps[0].tedoWaves[0].groups) advancePursuit(g, RG, true);
    });
    messengerNews(rt, rt.player.u, '水かさが増し、渡り口に諸手が詰まってござる！');
    for (const g of rt.squadGroups || []) { g.order = 'move'; g.dest = RG; g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; }; }
  },

  // ② 殿：追手を食い止める
  rearguard(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('rear'); rt.objProgress('main', '');
    rt.unmark('ford'); rt.unzone('ford');
    sfx('horagai', 0.8);
    rt.banner('北の岸の殿', '雨の闇に向け、槍をそろえる');
    rt.obj('main', HI(rt) ? '一手を率い、北岸で追手を止めよ' : '組頭と北岸で追手を止めよ', 'main');
    rt.say('組頭', '槍先は北じゃ！　退く味方に追手を近づけるな！', 4);
    rt.marker('shiba', () => F.shibaU.pos, '殿をまとめる柴田勝家', {});
    rt.say('柴田勝家', '陣は捨てるぞ。旗本、ここで追手を止めよ！', 4);
    F.waves = [];
    // 近くの兵は準備時の備えから来る。接触の時に別の大軍を湧かせない。
    // 殿の持ち場は狭い。槍と弓で、渡る時を稼ぐ
    rt.after(3, () => { if (!F.ending && !rt.over) rt.say('組頭', '弦をぬらすな！　弓衆は槍の後ろから射よ！', 4.5); });

    depthStart(rt, tedoCtx(rt), F.northSteps, () => this.cross(rt));
  },

  // ③ 川を渡る
  cross(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    // 南岸の追手も北岸の備えから歩いて来る。渡った後で遠い控えを出発させない。
    rt.after(5, () => {
      if (F.ending || rt.over) return;
      for (const w of F.southSteps[0].tedoWaves) for (const g of w.groups) advancePursuit(g, SOUTH, true);
    });
    rt.unmark('shiba');
    for (let i = 0; i < RETREAT_LINES.length; i++) rt.unmark('line' + i);
    releaseShibata(rt);
    for (const g of F.rearFriends) if (!F.crossGroups.includes(g)) F.crossGroups.push(g);
    if (!F.crossGroups.includes(F.rgun)) F.crossGroups.push(F.rgun);
    rt.setPhase('cross'); rt.objProgress('main', '');
    for (let i = 0; i < 3; i++) rt.unmark('w' + i);
    if (!F.failedHold) rt.award((t) => t.side.push('殿を務め、追手を食い止めた'), '殿を務めた');
    rt.banner(F.crossRemaining ? '殿も退け' : '残る味方は渡った', F.crossRemaining ? '南岸へ渡り、遅れた味方を迎えよ' : '殿も渡れ。浅瀬にも濁流が走る');
    rt.obj('main', '浅瀬を渡り、南岸の火へ進め', 'main');
    rt.say('組頭', F.crossRemaining ? '殿も渡れ！　南岸で遅れた者を迎えよ！' : 'よう支えた！　殿も渡れ！　互いに腕を取れ！', 4);
    rt.marker('south', SOUTH, '南の岸', { h: 2 });
    rt.zone('south', SOUTH.x, SOUTH.z, 8);
    F.rear.fixed = false; F.rear.retreatOnly = true;
    if (F.rgun) { F.rgun.fixed = false; F.rgun.retreatOnly = true; }
    F.rear.order = 'path'; F.rear.path = [[FORD.x, FORD.z], [SOUTH.x, SOUTH.z + 6]]; F.rear.pathIdx = 0; F.rear.speed = 2; F.rear.formation = 'column'; F.rear.colW = 2; F.rear.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; };
    for (const g of rt.squadGroups || []) {
      g.fixed = false; g.retreatOnly = true; g.order = 'path';
      g.path = [[2, FORD.z], [2, SOUTH.z], [SOUTH.x, SOUTH.z + 8]]; g.pathIdx = 0;
      g.speed = 2; g.formation = 'column'; g.colW = 2;
      g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; };
    }
    for (const h of F.host) h.advance(40, 30);
    for (const h of F.host2 || []) h.advance(20, 30);
    if (F.rgun && F.rgun.count) { const g = F.rgun; g.order = 'path'; g.path = [[FORD.x + 4, FORD.z], [4, SOUTH.z], [SOUTH.x + 8, SOUTH.z + 4]]; g.pathIdx = 0; g.speed = 2; g.formation = 'column'; g.colW = 2; g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; }; }
  },

  // 南の岸に着いたら：遅れた列と殿が渡るまで岸を支える
  south(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    if (F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('south');
    if (!F.crossGroups.includes(F.rear)) F.crossGroups.push(F.rear);
    if (F.rgun && !F.crossGroups.includes(F.rgun)) F.crossGroups.push(F.rgun);
    for (const g of rt.squadGroups || []) if (!F.crossGroups.includes(g)) F.crossGroups.push(g);
    F.crossCheckT = 0;
    rt.unzone('south');
    rt.obj('main', '南岸で追手を止め、味方を迎えよ', 'main');
    rt.objProgress('main', '');
    depthStart(rt, tedoCtx(rt), F.southSteps, () => this.win(rt));
  },

  lose(rt) {
    const F = rt.flags;
    // 移動の刻限と持ち場の失敗はこの戦の下知。敵を見ずに遠くへ逸れても終わらせる。
    const missedOrder = F.failedHold || (F.step === 1 && rt.t - F.stepT > 60) || (F.step === 3 && rt.t - F.stepT > 70);
    if (!missedOrder && !rt.canFailMission()) return;
    if (F.ending) return;
    F.ending = true; if (F.dp) F.dp.on = false; rt.tracker.main = false;
    rt.setPhase('end'); rt.objProgress('main', ''); rt.objFail('main'); rt.objRemove('dp');
    rt.unmark('south'); rt.unzone('south'); rt.unmark('dp'); rt.unzone('dp'); rt.unmark('ford'); rt.unzone('ford'); rt.unmark('shiba');
    for (let i = 0; i < RETREAT_LINES.length; i++) rt.unmark('line' + i);
    rt.banner('渡り口を支えられなかった', F.failedHold ? F.holdReason || '殿の持ち場を保てなかった。残る列と退け' : F.step === 1 ? '北岸の持ち場へ間に合わなかった' : F.step === 3 ? '南岸へ渡る刻限に間に合わなかった' : F.crossed < Math.ceil(F.crossInitial * 0.6) ? '渡った味方が少なく、列を支えられなかった' : F.crossRemaining > 0 ? '渡れない味方が残った。退き口を守れなかった' : '南岸の持ち場を保てなかった');
    rt.say('組頭', '支えきれぬ！　残る味方と退け！　敵に背を見せるな！', 4);
    rt.finish({}, 8);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    if (F.failedHold || !rt.player.u.alive || rt.player.u.pos.z < SOUTH.z - 4 || rt.world.inWaterAt(rt.player.u.pos.x, rt.player.u.pos.z) || F.crossed < Math.ceil(F.crossInitial * 0.6) || F.crossRemaining > 0) { this.lose(rt); return; }
    F.ending = true;
    rt.setPhase('end'); rt.objProgress('main', '');
    rt.unmark('south'); rt.unzone('south');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '手取川の殿を務め、生きて渡った', pts: 20 }; }, '殿の働き・手取川を渡った');
    sfx('horagai', 0.5);
    rt.banner('手取川を渡った', '殿の列は南へ退く。北の岸には上杉の旗が残る');
    rt.say('組頭', '残る者も渡ったぞ。手負いを連れ、南へ退け！', 4);
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    messengerTick(rt);
    KIT.backTick(rt);
    // 替えた兵も元の備えの役目を保つ。渡る味方を戦いへ引き戻さない。
    for (const g of rt.army.groups) if (g.woke && !g.tedoDressed) {
      g.tedoDressed = true; g.formation = g.team ? 'yari' : 'column';
      g.yariRanks = 3; g.colW = 2;
      if (!g.team && (g.woke === F.main[0].army || g.woke === F.main[1].army)) {
        g.retreatOnly = true; g.aggro = 0; g.seekRange = 0;
      } else { g.aggro = 6; g.seekRange = 18; }
    }
    const hit = rt.player.lastHit;
    if (hit?.blocked && rt.t - hit.t < 1 && !hit.ranged) F.playerHelp = true;
    if (!F.ending && rt.player.u.alive && hit && rt.t - hit.t < 2 &&
        rt.player.u.hp < rt.player.u.maxHp * 0.5 && rt.t >= (F.woundHintAt || 0)) {
      F.woundHintAt = rt.t + 12;
      rt.say('組頭', hit.ranged ? '矢が来る！　味方の列へ下がれ' :
        hit.back || hit.side ? '脇から斬られるぞ！　槍先を敵へ向けよ！' : '手負いじゃ！　槍を向けたまま味方の列へ退け！', 4);
    }
    // 渡り終えた数は、生きた兵の位置から数える。毎秒一度だけ。
    if (F.step >= 1 && rt.t >= (F.crossCheckT || 0)) {
      F.crossCheckT = rt.t + 1; F.crossRemaining = 0; F.crossed = 0; F.crossStranded = 0;
      fordTick(rt);
      for (const g of F.crossGroups) for (const u of g.units) if (u.alive && !u.gone) {
        if (u.pos.z >= SOUTH.z - 4 && !rt.world.inWaterAt(u.pos.x, u.pos.z)) F.crossed++;
        else if (u.woundOut || u.fleeing) F.crossStranded++;
        else F.crossRemaining++;
      }
      if (F.step === 2) rt.objProgress('main', `渡った味方 ${F.crossed}人・${F.mainCross < 35 ? '本隊が渡り始めた' : F.mainCross < 75 ? '本隊の列が川を進む' : F.mainCross < 100 ? '本隊の後ろが渡っておる' : '本隊は南の岸へ出た'}`);
    }
    if (F.step >= 4) {
      const g = F.rear;
      if (g.order === 'hold' && g.anchor.z >= SOUTH.z) { g.anchor.x = SOUTH.x; g.anchor.z = SOUTH.z + 4; g.formation = 'yari'; }
    }
    if (!F.ending) depthTick(rt, dt);
    if (!F.ending && F.failedHold) { this.lose(rt); return; }
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) {
      const m = rt.markers[i];
      if (m.group && gone(m.group)) rt.unmark(m.id);
    }
    if (!F.ending) this.flood(rt, dt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    const p = rt.player.u.pos;
    if (F.step === 1) {
      const d = Math.hypot(p.x - FORD.x, p.z - (FORD.z - 10));
      rt.objProgress('main', d < 7 ? '槍をそろえ、追手に備えよ' : '北岸の火へ退け。追手が迫るぞ');
      if (d < 7 && rt.t >= 30) this.rearguard(rt);
      else if (rt.t - F.stepT > 60) this.lose(rt);
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - SOUTH.x, p.z - SOUTH.z);
      rt.objProgress('main', '浅瀬の列に続け。南岸の火を目指せ');
      // 渡り出さない時は、柴田が呼ぶ（上杉が迫るので長くは待たない）
      if (d >= 8 && rt.t - F.stepT > 20 && !F.crossCall) { F.crossCall = true; rt.say('組頭', `${nm(rt)}、南のかがり火へ！　浅い渡り口を通れ。上杉が迫るぞ`, 3.5); }
      if (d >= 8 && rt.t - F.stepT > 40 && !F.crossCall2) { F.crossCall2 = true; rt.say('足軽', 'おれの腕をつかめ！　離れたら流されるで！', 3); }
      if (d < 8) this.south(rt);
      else if (rt.t - F.stepT > 70) this.lose(rt);
    }
  },

  // 増水の川の怖さ：濁流が川の中の者を北西へ流す（馬は強く流され、重い具足の者ほど足を取られる）。流れてくる材木が川面を下る
  flood(rt, dt) {
    const F = rt.flags;
    // 水位が少しずつ上がる（B055）：40 秒から 180 秒までに 0.65m。岸の渡り口が狭まる
    { const st = rt.world.def.streams && rt.world.def.streams[0]; if (st && st.mesh) st.mesh.position.y = Math.max(0, Math.min(1, (rt.t - 40) / 140)) * 0.65; }
    if (!F.logs) {
      F.logs = [];
      // 薄い濁りの筋を一つの描画で流す。白いしぶきや兵の形は増やさない。
      const flowGeo = new THREE.PlaneGeometry(1, 1);
      flowGeo.rotateX(-Math.PI / 2);
      F.flowMesh = new THREE.InstancedMesh(flowGeo, new THREE.MeshBasicMaterial({ color: 0x8a7d61, transparent: true, opacity: 0.22, depthWrite: false, fog: true }), 24);
      F.flowMesh.frustumCulled = false;
      F.flowShape = new THREE.Object3D();
      rt.scene.add(F.flowMesh);
      const mat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1 });
      const geo = new THREE.CylinderGeometry(0.22, 0.26, 4.2, 6);
      geo.rotateZ(Math.PI / 2);
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(geo, mat);
        const lg = { m, x: -200 + i * 62, dz: (i % 2 ? -1 : 1) * 10, sp: 2.2 + (i % 3) * 0.5, r: i * 0.7, dx: 0, dzStep: 0, alongX: 1, alongZ: 0, wrapped: false };
        rt.scene.add(m);
        F.logs.push(lg);
      }
    }
    for (let i = 0; i < 24; i++) {
      const x = 230 - ((i * 41 + (SETTINGS.reduceMotion ? 0 : rt.t * (2.4 + i % 3 * 0.3))) % 460);
      const z = 2 + x * 0.1 + ((i * 7) % 31 - 15);
      const d = F.flowShape;
      d.position.set(x, rt.world.heightAt(x, z) + rt.world.waterDepthAt(x, z) + 0.04, z);
      d.rotation.y = -Math.atan2(0.1, 1);
      d.scale.set(3 + i % 4, 1, 0.12 + i % 3 * 0.06);
      d.updateMatrix(); F.flowMesh.setMatrixAt(i, d.matrix);
    }
    F.flowMesh.instanceMatrix.needsUpdate = true;
    for (const lg of F.logs) {
      const px = lg.m.position.x, pz = lg.m.position.z;
      lg.x -= lg.sp * dt;
      lg.wrapped = lg.x < -230;
      if (lg.wrapped) lg.x = 230;
      let z = 0, yaw = 0;
      for (const q of FLOW) if (lg.x >= q.ax && lg.x <= q.ax + q.dx) {
        z = q.az + q.dz * (lg.x - q.ax) / q.dx;
        yaw = -Math.atan2(q.dz, q.dx);
        break;
      }
      lg.m.position.set(lg.x, rt.world.heightAt(lg.x, z + lg.dz) + rt.world.waterDepthAt(lg.x, z + lg.dz) - 0.1 + Math.sin(rt.t * 1.3 + lg.r) * 0.06, z + lg.dz);
      lg.m.rotation.y = yaw + Math.sin(rt.t * 0.5 + lg.r) * 0.3;
      lg.dx = lg.wrapped ? 0 : lg.m.position.x - px;
      lg.dzStep = lg.wrapped ? 0 : lg.m.position.z - pz;
      lg.alongX = Math.cos(lg.m.rotation.y); lg.alongZ = -Math.sin(lg.m.rotation.y);
    }
    if (F.step < 1) return;
    F.floodT = (F.floodT || 0) - dt;
    for (const u of rt.army.units) {
      if (!u.alive || !u.pos) continue;
      if (u.fordEscort) {
        const e = u.fordEscort;
        e.active = F.step >= 1 && u.group.order === 'path' && u.pos.z < SOUTH.z - 4 && u.pos.z > FORD.z - 8;
      }
      if (distToPolyline(u.pos.x, u.pos.z, RIVER) > 24 || !rt.world.inWaterAt(u.pos.x, u.pos.z)) {
        u.tedoLog = null;
        u.tedoBreath = Math.max(0, (u.tedoBreath || 0) - dt * 2);
        waterPose(rt, u);
        if (u === rt.player.u) F.playerDeep = false;
        continue;
      }
      const k = (u.mounted ? 1.2 : 1) * (u.type === 'samurai' || u.type === 'busho' ? 1.3 : 1);
      // 渡り口の流れまで深みと同じ力にすると、減速した兵が流れに勝てず退路を外れる。
      const current = Math.min(1, rt.world.waterDepthAt(u.pos.x, u.pos.z) / 1.5);
      let flow = FLOW[0], best = Infinity;
      for (const q of FLOW) {
        const t = Math.max(0, Math.min(1, ((u.pos.x - q.ax) * q.dx + (u.pos.z - q.az) * q.dz) / q.len2));
        const dx = u.pos.x - q.ax - q.dx * t, dz = u.pos.z - q.az - q.dz * t, d = dx * dx + dz * dz;
        if (d < best) { best = d; flow = q; }
      }
      const shallow = Math.abs(u.pos.x - 2) <= F.ford.width / 2;
      const force = shallow ? (u.mounted ? 0.32 : 0.18) : 0.905;
      u.pos.x += flow.x * force * k * current * dt; u.pos.z += flow.z * force * k * current * dt;
      u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
      // 深みに押し出された者は、すぐには死なず息を失う。岸へ戻れば回復する。
      const rise = Math.max(0, Math.min(1, (rt.t - 40) / 140)) * 0.65;
      const deep = !shallow || rt.world.waterDepthAt(u.pos.x, u.pos.z) > 1.1 + rise + 0.15;
      // 四歩の材木を線分として当てる。形を増やさず、同じ七本を調べる。
      let log = u.tedoLog;
      if (log && (log.wrapped || rt.t >= u.tedoGripUntil)) { u.tedoLog = log = null; u.tedoLogAt = rt.t + 8; }
      if (!log && rt.t >= (u.tedoLogAt || 0)) for (const lg of F.logs) {
        const dx = u.pos.x - lg.m.position.x, dz = u.pos.z - lg.m.position.z;
        const along = Math.max(-2.1, Math.min(2.1, dx * lg.alongX + dz * lg.alongZ));
        if (Math.hypot(dx - along * lg.alongX, dz - along * lg.alongZ) > (u.mounted ? 0.85 : 0.55)) continue;
        u.tedoLogAt = rt.t + 8;
        if (deep && !u.mounted && !u.woundOut && u.hp > u.maxHp * 0.3) {
          u.tedoLog = log = lg; u.tedoGripUntil = rt.t + 3;
          if (u.isPlayer) rt.bark('流木につかまった！　流される前に岸へ寄れ');
        } else {
          u.stagger = Math.max(u.stagger || 0, 0.6);
          if (u.push) { u.push.x += flow.x * 1.2; u.push.z += flow.z * 1.2; }
          if (!u.invuln) u.hp = Math.max(0, u.hp - u.maxHp * 0.03);
          if (u.isPlayer) rt.player.knockT = Math.max(rt.player.knockT || 0, 0.6);
        }
        break;
      }
      if (log) { u.pos.x += log.dx; u.pos.z += log.dzStep; }
      if (u.hp <= 0 && !u.invuln) {
        if (u.isPlayer) { rt.playerDown(); return; }
        rt.army.kill(u, null); continue;
      }
      // 馬は岸では速いが、流れで足並みが乱れる。転びは八秒以上あける。
      if (!u.invuln && !u.isPlayer && rt.t >= (u.tedoSlipAt || 0) &&
          (deep || u.mounted) && Math.random() < dt * (u.mounted ? 0.08 : 0.025)) {
        u.tedoSlipAt = rt.t + 8; u.stagger = Math.max(u.stagger || 0, u.mounted ? 1.2 : 0.8);
        u.confused = Math.max(u.confused || 0, 2);
      }
      u.tedoBreath = deep ? (u.tedoBreath || 0) + dt * k * (log ? 0.35 : 1) : Math.max(0, (u.tedoBreath || 0) - dt * 2);
      if (u.tedoBreath > 10 && !u.invuln) {
        u.hp = Math.max(0, u.hp - u.maxHp * 0.08 * dt);
        if (u.hp <= 0) {
          if (u.isPlayer) { rt.playerDown(); return; } else rt.army.kill(u, null);
        }
      }
      if (u === rt.player.u && deep && !F.playerDeep) F.floodT = 0;
      if (u === rt.player.u) F.playerDeep = deep;
      if (u === rt.player.u && F.floodT <= 0) {
        F.floodT = deep ? 8 : 12;
        rt.bark(deep ? '息が続かぬ！　浅瀬か岸へ戻れ' : '流木の筋は深い！　渡る列に寄り、岸へ上がれ');
      }
      waterPose(rt, u);
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1 && k === rt.player.u) F.playerHelp = true;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1 || Math.hypot(g.center().x - rt.player.u.pos.x, g.center().z - rt.player.u.pos.z) > 35 || rt.t < (rt.flags.routSayT || 0)) return;
    rt.flags.routSayT = rt.t + 10;
    rt.say('足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が退いたで！`, 2.5);
  },
};

// ---------------- 殿の段（北の岸）と、南の岸の段 ----------------
const RG = { x: 0, z: -30 };                 // 殿の持ち場（渡り口の前）
const RR = round(RG, Math.PI, 56);           // 北から来る上杉の寄せ口（左右とも北の岸）
const PUSH = { x: 0, z: -56 };
const RETREAT_LINES = [{ x: 0, z: -46 }, { x: 0, z: -36 }, { x: 0, z: -27 }];
const RETREAT_NAMES = ['陣寄りの火', '川原の火', '渡り口の火'];

function releaseShibata(rt) {
  const F = rt.flags, g = F.shiba;
  if (F.shibaReleased) return;
  F.shibaReleased = true;
  // 南岸へ追う備えもこの下知で出発し、殿の渡河中に川を進む。
  for (const w of F.southSteps[0].tedoWaves) for (const q of w.groups) advancePursuit(q, SOUTH, true);
  g.fixed = false; g.retreatOnly = true; g.formation = 'column'; g.colW = 2;
  g.order = 'path'; g.path = [[0, FORD.z], [2, SOUTH.z], [20, 94]]; g.pathIdx = 0; g.speed = 2;
  g.aggro = 0; g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; };
  rt.say('柴田勝家', '本隊は渡ったぞ。殿は次の火まで退け！', 4);
}

// 川の口と追手の役目を一秒ごとに数える。川の中の兵は止めない。
function fordTick(rt) {
  const F = rt.flags, f = F.ford, relief = rt.t < F.reliefUntil;
  const rise = Math.max(0, Math.min(1, (rt.t - 40) / 140));
  f.width = 8 - rise * 2; f.capacity = Math.floor(f.width * 4);
  rt.world.def.streams[0].fords[0].w = f.width / 2;
  f.inside = 0; f.queue = 0; f.pressure = 0;
  let weak = null, weakScore = Infinity, fordTarget = null, targetScore = Infinity;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.woundOut || u.isStruct) continue;
    if (u.team === 1) {
      if (!u.fleeing && u.pos.z > -58 && u.pos.z < -24 && Math.abs(u.pos.x) < 24) f.pressure++;
      continue;
    }
    if (!u.tedoWait) u.tedoWait = { x: 0, z: 0 };
    if (u.pos.z > -24 && u.pos.z < 28 && Math.abs(u.pos.x - 2) < 12) f.inside++;
    if (u.group?.order === 'path' && u.pos.z >= -42 && u.pos.z <= -24 && Math.abs(u.pos.x - 2) < 12) f.queue++;
    if (u.isPlayer || u.fleeing || u.invuln || u.pos.z >= 28 || u.pos.z < -75) continue;
    const score = u.hp / u.maxHp + (u.group?.morale || 0) / 100;
    if (score < weakScore) { weakScore = score; weak = u; }
    const d = Math.abs(u.pos.z + 10) + Math.abs(u.pos.x - 2);
    if (d < targetScore) { targetScore = d; fordTarget = u; }
  }
  // 荷駄が押されると口が八秒塞がる。押し返せば詰まりがほどける。
  if (!F.cargoCleared && f.queue >= 6 && f.cargoUntil === 0) f.cargoUntil = rt.t + 8;
  if (!F.cargoCleared && (relief || (f.cargoUntil > 0 && rt.t >= f.cargoUntil))) {
    F.cargoCleared = true;
    messengerNews(rt, rt.player.u, '荷をどけ、渡る列が動き出した由にござる！');
  }
  const cargo = !F.cargoCleared && f.cargoUntil > rt.t;
  f.jam = Math.max(0, f.queue - 8) + (cargo ? 8 : 0) + (relief ? 0 : f.pressure);
  let room = Math.max(0, Math.min(relief ? 5 : cargo ? 1 : 3, f.capacity - f.inside));
  for (const g of F.crossGroups) for (const u of g.units) {
    if (!u.alive || u.gone || u.woundOut || g.order !== 'path' || u.pos.z < -42 || u.pos.z >= -24) continue;
    if (u.tedoAdmitUntil > rt.t) { room--; continue; }
    if (room > 0) { u.tedoAdmitUntil = rt.t + 6; room--; }
  }
  // 大軍は軽い列のまま。押した時が、渡る列の歩みに変わる。
  if (F.step === 2 && F.mainCross < 100) {
    F.mainCross = Math.min(100, F.mainCross + (relief ? 1.5 : f.jam > 10 ? 0.5 : 0.7));
    for (let i = 0; i < F.main.length; i++) F.main[i].moveTo(i ? 4 : 0, -54 + F.mainCross * 1.46, 1.2);
  }
  if (F.step === 2 && !F.shibaReleased) {
    const g = F.shiba, lord = F.shibaU;
    const danger = rt.army.nearestEnemy(lord, 6, (o) => !o.fleeing && !o.woundOut);
    if (danger || lord.hp < lord.maxHp * 0.5) {
      g.order = 'move'; g.dest.x = -8; g.dest.z = -28; g.speed = 2.5;
    }
  }
  if (F.step === 2 && !relief && f.queue > 10 && f.pressure > 3 && weak &&
      rt.t >= (F.panicAt || 0) && (F.panicN || 0) < 4) {
    F.panicAt = rt.t + 12; F.panicN = (F.panicN || 0) + 1;
    weak.fleeing = true;
    weak.moraleFleeDir = { x: weak.pos.x < 2 ? -0.15 : 0.15, z: 1 };
    rt.say('足軽', '後ろから来よる！　押すな、川へ落ちるで！', 3);
  }
  for (const g of F.pursuit || []) {
    if (!g.tedoActive || g.routed) continue;
    if (g.tedoRole === 'ranged') { g.focus = fordTarget; continue; }
    if (g.tedoRole === 'second') { g.focus = weak; continue; }
    if (g.tedoRole === 'horse') g.focus = weakScore < 1.5 ? weak : null;
    if (g.tedoRole === 'front' || g.tedoRole === 'horse') {
      if (relief && F.step === 2 && !g.tedoRelieved) {
        g.tedoRelieved = true; g.order = 'hold'; g.aggro = 3;
        g.anchor.x = g.units[0].pos.x; g.anchor.z = Math.min(-64, g.units[0].pos.z); g.focus = null;
      } else if (!relief && g.tedoRelieved) {
        g.tedoRelieved = false; g.order = 'attack'; g.aggro = 8;
        const at = F.dp?.cur?.at || RG; g.anchor.x = at.x; g.anchor.z = at.z;
      }
    }
  }
}
// この戦だけ、刻限で殿を下げる。共通の段が敵を自動で敗走させる処理は使わない。
function preparePursuit(rt, steps, bank) {
  const all = rt.flags.pursuit || (rt.flags.pursuit = []);
  for (const s of steps) for (const w of s.tedoWaves || []) {
    w.groups = [];
    const front = w.foes(rt, { tdPush: true }), back = w.foes(rt, { tdPush: false });
    for (let i = 0; i < front.length; i++) {
      const sp = front[i], other = back[i] || sp;
      const g = enemyGroup(rt, { fixed: true, faction: 'saito', name: sp.name,
        anchor: { x: bank ? 2 : /回り込む/.test(sp.name) ? 22 : sp.from.x * 0.3, z: bank ? -170 : -110 - all.length * 3 }, facing: 0,
        order: 'hold', noAI: true, aggro: 0, seekRange: 0, width: sp.width || 12, formation: sp.formation || 'yari', morale: 90 }, dress(sp.list, UESUGI));
      g.dmgMult = 1; g.tedoBank = bank; g.tedoFlank = /回り込む/.test(sp.name); all.push(g); g.tedoBow = sp.kind === 'bow';
      g.tedoRole = g.tedoBow ? 'ranged' : sp.list.some((q) => q.type === 'cavalry') ? 'horse' : /二の手|回り込む/.test(sp.name) ? 'second' : 'front';
      g.tedoFrom = [sp.from, other.from];
      w.groups.push(g);
    }
  }
}
// 初めから置いた隊を動かす。段が替わっても出発済みの隊を引き戻さない。
function advancePursuit(g, at, push) {
  if (g.tedoActive || g.routed || !g.count) return;
  g.tedoActive = true; g.fixed = false; g.aggro = 8; g.seekRange = 28;
  if (g.tedoFlank) {
    g.order = 'path'; g.formation = 'column'; g.colW = 2;
    g.path = [[push ? -26 : 26, -58], [push ? -18 : 18, -40]]; g.pathIdx = 0;
    g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.anchor.x = at.x; q.anchor.z = at.z; };
  } else if (g.tedoBow) {
    g.order = 'move'; g.dest = { x: 16, z: -46 };
    g.onArrive = (q) => { q.order = 'hold'; q.anchor.x = 16; q.anchor.z = -46; };
  } else if (at.z > 0) {
    g.order = 'path'; g.formation = 'column'; g.colW = 2; g.aggro = 2; g.speed = 3;
    g.path = [[2, FORD.z], [4, SOUTH.z]]; g.pathIdx = 0;
    g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.anchor.x = SOUTH.x; q.anchor.z = SOUTH.z; };
  } else { g.order = 'attack'; g.anchor.x = at.x; g.anchor.z = at.z; }
}
function tedoHold(o) {
  const s = hold({ ...o, waves: [] }), start = s.start;
  s.tedoLine = o.line !== undefined; s.tedoPush = !!o.push;
  s.tedoWaves = o.waves || []; s.max = o.dur + 60;
  s.start = (rt, C, m, ctx) => {
    start(rt, C, m, ctx);
    rt.obj('dp', typeof o.obj === 'function' ? o.obj(rt, m) : o.obj, 'main');
    C.waves = s.tedoWaves; C.waveIdx = 0; C.foughtT = 0; C.emptyT = 0;
    if (o.push) rt.say('柴田勝家', 'おぬしの組、押し返せ！　本隊を渡すのじゃ！', 4);
    if (o.line !== undefined) {
      if (o.line === 0) releaseShibata(rt);
      for (let i = o.line + 1; i < RETREAT_LINES.length; i++) rt.marker('line' + i, RETREAT_LINES[i], RETREAT_NAMES[i], { h: 2 });
      rt.unmark('line' + o.line);
    }
    for (const g of rt.flags.pursuit || []) if (g.order === 'attack' && !g.routed && !g.tedoBow) {
      if (C.at.z <= 0) { g.anchor.x = C.at.x; g.anchor.z = C.at.z; }
      else if (g.tedoBank === 0) { const c = g.center(); g.order = 'hold'; g.anchor.x = c.x; g.anchor.z = Math.min(-30, c.z); }
    }
  };
  s.tick = (rt, C, m, ctx, el, dt) => {
    while (C.waveIdx < C.waves.length && (el >= C.waves[C.waveIdx].t || C.emptyT >= 8)) {
      const w = C.waves[C.waveIdx++];
      w.sent = true; w.seen = false; C.emptyT = 0;
      for (const g of w.groups) {
        advancePursuit(g, C.at, m.tdPush !== false);
        C.groups.push(g);
      }
    }
    for (const w of C.waves) if (w.sent && !w.seen && w.say && rt.t >= (C.waveSayAt || 0) && w.groups.some((g) => g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && sightUnit(rt, u)))) {
      w.seen = true; C.waveSayAt = rt.t + 8; rt.say(w.say[0], w.say[1], 3.5);
    }
    // 持ち場に立つだけでは成功にしない。追手が列を割って居座れば失敗。
    if (rt.t >= (C.scanAt || 0)) {
      C.scanAt = rt.t + 0.5; C.inside = 0; C.allies = 0; C.contact = 0; C.melee = false; C.nearPlayer = false;
      for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone &&
        (u.pos.z > 24) === (C.at.z > 0)) {
        const d = Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z);
        if (u.team === 1) {
          if (d < 7) C.inside++; if (d < 22) C.contact++;
          if (Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < 25) C.nearPlayer = true;
        }
        else if (d < 12) C.allies++;
        const a = u.atk && !u.atk.ranged && !u.atk.bow ? u.atk : u.swing && !u.swing.done ? u.swing : null;
        const target = a?.target || u.bind?.o;
        if (d < 22 && target?.alive && target.team !== u.team &&
            Math.hypot(u.pos.x - target.pos.x, u.pos.z - target.pos.z) <= u.reach + 0.8) C.melee = true;
      }
    }
    C.emptyT = C.nearPlayer ? 0 : C.emptyT + dt;
    // 次の段の控えも既に北岸にいる。敵が途切れたら近い備えを先に寄せる。
    if (C.emptyT >= 8 && rt.t >= (C.pursuitAt || 0)) {
      C.pursuitAt = rt.t + 8;
      let next = null, nearest = Infinity;
      for (const g of rt.flags.pursuit || []) {
        if (g.routed || !g.count || g.tedoBow || g.tedoBank !== (C.at.z > 0 ? 1 : 0)) continue;
        const c = g.center(), d = Math.hypot(c.x - C.at.x, c.z - C.at.z);
        if (d < nearest && g.units.some((u) => u.alive && !u.fleeing && !u.woundOut)) { next = g; nearest = d; }
      }
      if (next && C.at.z <= 0) {
        advancePursuit(next, C.at, m.tdPush !== false);
        next.tedoRelieved = false; next.focus = null; next.order = 'move'; next.speed = 3;
        next.dest ??= { x: 0, z: 0 }; next.dest.x = C.at.x; next.dest.z = C.at.z;
        next.onArrive = (g) => { g.order = 'attack'; g.aggro = 8; };
      }
    }
    if (C.melee && Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z) < (o.r || 14) + 8) C.foughtT += dt;
    C.breachT = C.inside >= 4 && C.allies < 3 ? (C.breachT || 0) + dt : 0;
    if (C.breachT >= 2 && rt.t >= (C.breachWarnAt || 0)) {
      C.breachWarnAt = rt.t + 8;
      rt.bark('列が切られる！　組と戻り、追手を押し返せ', true);
    }
    if (C.breachT >= BREACH_LIMIT) { rt.flags.holdReason = '追手に殿を破られ、列が切れた'; rt.flags.failedHold = true; return true; }
    // 共通の失敗待ちに頼らず、この退き口の刻限で下知を終える。
    if (el > s.max) { C.timeout = true; return true; }
    const p = rt.player.u.pos;
    if (o.push && el >= 8 && Math.hypot(p.x - C.at.x, p.z - C.at.z) < 9 && C.allies >= 3 &&
        (C.contact > 0 || rt.t < rt.flags.reliefUntil) && rt.flags.pushTime < 30) {
      rt.flags.pushTime = Math.min(30, rt.flags.pushTime + dt);
      if (rt.flags.pushTime >= 8) rt.flags.reliefUntil = rt.t + 8;
    }
    const atPost = Math.hypot(p.x - C.at.x, p.z - C.at.z) < (o.r || 14) + 8;
    C.awayT = atPost ? 0 : (C.awayT || 0) + dt;
    if (atPost) { C.inT += dt; C.absenceSaid = false; }
    const F = rt.flags;
    if (el > 20 && C.awayT > 8 && !C.absenceSaid && rt.t >= (F.absenceAt || 0) && (F.absenceN || 0) < 3) {
      C.absenceSaid = true; F.absenceAt = rt.t + 30;
      rt.say('組頭', ABSENCE_LINES[F.absenceN || 0], 4); F.absenceN = (F.absenceN || 0) + 1;
    }
    const progress = C.breachT > 0 ? '追手が列を割る！　組と押し返せ' : !atPost ? 'かがり火の持ち場へ戻れ' :
      o.push ? (F.playerHelp ? '組と押し返し、渡り口を守れ' : '槍を出し、追手を押し返せ') : o.waitCross ?
      (F.crossRemaining ? `川に残る味方 ${F.crossRemaining}人。岸で迎えよ` : '味方は渡った。追手を岸で止めよ') :
      F.mainCross < 35 ? '本隊が渡り始めた。追手を止めよ' : F.mainCross < 75 ? '本隊は川の中じゃ。列を守れ' :
      F.mainCross < 100 ? '本隊の後続を渡せ。持ちこたえよ' : '本隊は渡った。殿の列を保て';
    rt.objProgress('dp', progress);
    return el >= o.dur && tedoHeld(C, rt.flags) && C.inT >= o.dur * 0.5 && (!o.push || rt.flags.playerHelp && rt.flags.pushTime >= 8) && (!o.waitCross || rt.flags.crossRemaining === 0) && (!o.readyMain || rt.flags.mainCross >= 100);
  };
  s.end = (rt, C) => {
    rt.unmark('dp'); rt.unzone('dp');
    const won = !C.timeout && !rt.flags.failedHold && tedoHeld(C, rt.flags) && C.inT >= o.dur * 0.5 && (!o.waitCross || rt.flags.crossRemaining === 0) &&
      (!o.push || rt.flags.playerHelp && rt.flags.pushTime >= 8) && (!o.readyMain || rt.flags.mainCross >= 100);
    if (won) { rt.objDone('dp'); rt.award((t) => t.side.push(o.reward), o.reward); }
    else { rt.flags.holdReason ||= o.push && !rt.flags.playerHelp ? '槍を出さず、殿が崩れた' : !tedoHeld(C, rt.flags) ? '追手を抑えきれず、列が乱れた' : o.push && rt.flags.pushTime < 8 ? '押せず、渡り口が詰まった' : o.readyMain && rt.flags.mainCross < 100 ? '本隊が川に取り残された' : C.timeout && o.waitCross && rt.flags.crossRemaining > 0 ? '遅れた味方が川に取り残された' : '持ち場が空き、殿の列が乱れた'; rt.flags.failedHold = true; rt.objFail('dp'); rt.say('組頭', rt.flags.holdReason + '。残る列と退け！', 4); }
    if (!won) { const D = rt.flags.dp; D.steps.length = D.i + 1; D.done = null; }
    // 段が替わっても追手を消さず、損害による敗走も回復させない。
  };
  return s;
}
// 寄せを早く退けても、斬り合う秒数の不足で失敗にはしない。
function tedoHeld(C, F) {
  return C.foughtT >= 8 || !!(F.playerHelp && C.waveIdx === C.waves.length && C.groups.length &&
    C.groups.every((g) => g.routed || !g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut)));
}
function tedoCtx(rt) {
  const F = rt.flags;
  return { calmRest: false, friends: () => F.rear.order === 'path' ? NO_FRIENDS : F.rearFriends };
}
function tedoA() {
  return [
    tedoHold({ at: RG, dur: 40, r: 12, title: '渡り口が詰まる', sub: '前は上杉、背は濁流', label: '殿の持ち場', obj: '殿へ集まり、追手を迎えよ',
      say: [['組頭', '火のそばへ寄れ！　隣の者と槍を並べよ！']],
      waves: [
        { t: 2, say: ['組頭', '上杉の先手じゃ！　川へ通すな！'], foes: () => [{ name: '上杉の先手', from: RR.front, list: [uS(1), uA(6)] }] },
        { t: 18, say: ['足軽', '馬がこっちへ来よる！　槍を出せ！'], foes: () => [{ name: '上杉の騎馬', from: RR.fl, list: [uS(1, { horse: true }), uC(6)] }] },
      ], reward: '柴田の殿に列を集めた' }),
    tedoHold({ at: PUSH, dur: 50, r: 6, push: true, title: '前へ出て押し止める', sub: '追手を押し返し、渡り口を空ける', label: '逆襲の線', obj: '組と前へ出て、追手を押し返せ',
      waves: [
        { t: 4, say: ['足軽', 'また来たで！　後ろにも槍が見える！'], foes: () => [{ name: '上杉の先手の後続', from: RR.front, list: [uS(1), uA(6)] }] },
        { t: 24, say: ['組頭', '射手じゃ！　渡り口へ矢を射ておる！'], foes: () => [gunLine('上杉の弓衆', RR.fr, FORD, 6, { list: [uS(1), { type: 'bow', n: 6 }], kind: 'bow' })] },
      ], reward: '追手を押し返し、味方を渡した' }),
    tedoHold({ at: (rt, m) => m.tdPush === false ? RETREAT_LINES[0] : PUSH, dur: 65, readyMain: true, r: 10, title: '本隊が渡るまで', sub: '上杉の後ろの備えは、まだ崩れない', label: '本隊を渡す持ち場', obj: '追手を食い止め、本隊を渡せ',
      waves: [
        { t: 5, say: ['足軽', '向こうにも槍が見えるで！'], foes: () => [{ name: '上杉の本隊の先', from: RR.front, list: [uS(1), uA(6)] }] },
        { t: 25, say: ['足軽', '逃げる味方へ寄せてきよる！'], foes: () => [{ name: '上杉の二の手', from: RR.fr, list: [uS(1), uA(6)] }] },
        { t: 42, say: ['組頭', '横から来る！　列を切らせるな！'], foes: (rt, m) => [{ name: '回り込む上杉勢', from: m.tdPush === false ? RR.right : RR.left, list: [uS(1), uA(7)] }] },
      ], reward: '崩れぬ上杉を背に本隊を渡した' }),
    ...RETREAT_LINES.map((at, i) => tedoHold({ at, line: i, dur: i === 2 ? 24 : 28, r: 6,
      title: `${RETREAT_NAMES[i]}へ退く`, sub: '槍先を敵へ向け、次の火へ退く', label: RETREAT_NAMES[i],
      obj: `${RETREAT_NAMES[i]}へ下がり、列を保て`,
      say: [['組頭', ['陣寄りの火へ退け。北へ槍を向けよ！', '川原の火へ！　列を乱すな！', '渡り口じゃ！　下知までここを守れ！'][i]]],
      // 退く線で敵に会わない間が三十秒を超えた（10/6 測り）。下がる列へ追いすがる小勢を一つずつ寄せる。
      waves: [{ t: 6, say: ['足軽', ['追手がすぐそこだで！　槍を向けろ！', 'まだ追ってきよる！', '川へ落ちるで！　踏ん張れ！'][i]], foes: () => [{ name: '追いすがる上杉勢', from: RR.front, list: [uA(4)] }] }],
      reward: `${RETREAT_NAMES[i]}で殿をまとめて退いた` })),
  ];
}
function tedoB() {
  const S = { x: SOUTH.x, z: SOUTH.z - 2 };
  return [
    tedoHold({ at: S, dur: 65, waitCross: true, r: 14, title: '南の岸の殿', sub: '遅れた味方を迎え、退き道を守る', label: '南の岸', obj: '南岸で追手を止め、味方を迎えよ',
      say: [['組頭', '岸へ上がった者は南へ！　殿は追手を抑えよ！']],
      waves: [
        { t: 5, say: ['足軽', '追手も渡ってきよる！'], foes: () => [{ name: '渡ってくる上杉勢', from: { x: -10, z: -24 }, list: [uS(1), uA(8)], mass: 220 }] },
        { t: 38, say: ['足軽', '向こう岸から矢が来るで！　伏せろ！'], foes: () => [gunLine('北の岸の弓衆', { x: 10, z: -34 }, S, 5, { list: [uS(1), { type: 'bow', n: 5 }], kind: 'bow' })] },
      ], reward: '南の岸で退く列を支えた' }),
  ];
}

// 両軍の総勢（柴田勝家の軍 三万ほど、上杉勢 二万ほど。数と戦の大きさには諸説ある）
tedorigawa.force = (rt) => {
  let a = 0, b = 0;
  for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.gone) { if (u.team === 0) a++; else if (u.team === 1) b++; }
  const F = rt.flags; F.forceA0 ??= a; F.forceB0 ??= b;
  return { a, a0: F.forceA0, b, b0: F.forceB0 };
};
tedorigawa.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '上杉軍', mon: 'uesugi' } };
// 出陣名簿から不明な追撃隊へ武将を追加しない。名のある味方は備え表の旗で示す。
tedorigawa.famous = [];
tedorigawa.date = () => '天正五年九月二十三日とも　秋・夜';
tedorigawa.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 24 ? '退きの下知まで待つ' : '');
tedorigawa.skip = (rt) => { if (rt.phase === 'brief') {
  // 七尾落城の知らせは既に届いた。後続の下知や列の動きは早めない。
  const tm = rt.flags.retreatTimer; if (tm) tm.t = Math.min(tm.t, 0.2);
} };
// 出典：信長公記 巻十『柴田北国相働之事』。https://ja.wikisource.org/wiki/信長公記
tedorigawa.history = '天正五年（1577）、信長は柴田勝家を大将として、丹羽長秀・前田利家・羽柴秀吉らを加賀へ出した。信長公記には、織田勢が手取川を越えて各地を焼き払い、秀吉が信長に届けず帰陣して怒りを買ったとある。秀吉は勝家と言い争って陣を離れたともいうが、言い争いの細かな経緯や台詞は同書にない。秀吉は本戦に置かず、離陣は組頭の知らせで振り返る。七尾城が落ちた後、織田勢が雨で増えた手取川で上杉勢に追われたとも伝わるが、信長公記には、この合戦や敗北の記述はない。下知が届かぬ混乱と殿の持ち場は、退き口を遊ぶための補い。斎藤朝信は謙信の書状写では末森の守りに置かれており、追撃の先手としては出さない。水島・松任の陣所と川岸の正確な距離は復元していない。謙信・滝川の局地の陣、各将の渡る順、殿の組頭、雨中の弓、渡り口や進行の間隔は創作。川の幅と傾きは局地の仮置きで、当時の実測ではない。目の前の兵だけを描き、画面外の大軍は置かない。兵数は織田三万・上杉二万を仮置きし、織田四万などの異説もある。戦の大きさ、日付、兵の数には諸説ある。';

// 素直な遊び手：渡り口まで退き、岸で追手と戦い、川を渡る
// 退く下知の間は共通の退避や性格の突進で、居残る味方・敵の方へ引き戻さない。
const NO_FRIENDS = [];
tedorigawa.botEvacuating = (b) => {
  const C = b.flags.dp?.cur;
  return b.flags.step === 1 || b.flags.step === 3 || (b.flags.step === 2 && C?.at &&
    (C.s.tedoLine || C.s.tedoPush) && Math.hypot(b.player.u.pos.x - C.at.x, b.player.u.pos.z - C.at.z) > 6);
};
tedorigawa.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (tedorigawa.botEvacuating(b)) {
    b.botRest = false; F.dpBack = false;
    const q = F.step === 1 ? FORD : F.step === 3 ? SOUTH : F.dp.cur.at;
    const z = F.step === 1 ? FORD.z - 10 : q.z;
    goTo(p, inp, q.x, z, 2);
    inp.leftPressed = false; inp.chargeHold = false;
    const e = b.army.nearestEnemy(u, 4, (o) => !o.fleeing && !o.noTarget);
    inp.guardHold = !!e; inp.runHeld = !e;
    if (e) {
      // 構えは正面だけ。近い敵より、今こちらへ打ち込む相手を受ける。
      let face = e, nearest = Infinity;
      for (const o of b.army.threats || []) {
        if (!o.alive || o.fleeing || o.noTarget || o.team === u.team ||
            o.type === 'gun' || o.type === 'bow' || Math.abs(o.pos.y - u.pos.y) >= 3) continue;
        const attacking = o.atk?.target === u || (o.swing && !o.swing.done && o.swing.target === u) ||
          (o.charging && o.target === u);
        if (!attacking || b.army.wallBetween(u.pos, -1, o.pos)) continue;
        const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (d < 4 && d < nearest) { face = o; nearest = d; }
      }
      if (p.lock) inp.e.add('KeyQ');
      p.yaw = Math.atan2(face.pos.x - u.pos.x, face.pos.z - u.pos.z);
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      if (Math.hypot(q.x - u.pos.x, z - u.pos.z) > 2) {
        const dx = q.x - u.pos.x, dz = z - u.pos.z;
        const fw = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw);
        const side = -dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw);
        if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
        if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
      }
    }
    return;
  }
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  const c = F.shiba.center();
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing);
  if (e && F.step >= 2) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 2) { const q = (F.waves || []).find((x) => !gone(x)); if (q) { const t = q.center(); if (t.z > -60) { goTo(p, inp, t.x, t.z, 2); return; } } goTo(p, inp, FORD.x + 2, FORD.z - 16, 2); return; }
  goTo(p, inp, c.x + 2, c.z - 4, 3);
};

tedorigawa.withdrawRoute = (rt, g) => {
  if (g.team !== 0) return null;
  const c = g.center();
  return c.z < SOUTH.z - 4 ? [[2, Math.max(c.z, FORD.z)], [2, SOUTH.z], [20, 104]] : [[20, 104]];
};
tedorigawa.withdrawTick = (rt, dt) => tedorigawa.flood(rt, dt);
export { tedorigawa };
