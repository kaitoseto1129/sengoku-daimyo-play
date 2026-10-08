import { rosterPlan, rosterBuild } from './jinkei_roster.js';
// 雑賀攻め・小雑賀川。史料の芯は信長公記巻十「雑賀御陣之事」。
// 渡河 → 高岸と鉄砲に阻まれる → 東岸へ引く → 川を限って対陣。
// 桶・杭、局地の回り込み、秒数と人数は遊びの補完。川岸の寸法は旧配置を回転。
import * as THREE from 'three';
import { nobori, hut, yagura, stumps, village, solidRect } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { sightUnit } from './battle_sight.js';
import { addTaba, tickTabas } from './taketaba.js';
import { gauss, enemyGroup, allyGroup, wallLine } from './bhelp.js';
import { dress, customFlag } from './b_inabayama.js';
import { camp } from './b_mid.js';
import { sendOrder } from './denrei.js';
import { battleEvent, EVENT_RETREAT, EVENT_MESSENGER } from './battle_events.js';
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
const WEST = -Math.PI / 2, EAST = Math.PI / 2;
const RIVER = [[-22, 240], [-18, 100], [-20, 0], [-24, -100], [-18, -240]];
const BANK = -44;
const STAKES = [{ x: -19, z: 18 }, { x: -20, z: 0 }, { x: -21, z: -18 }];
const ODA = { flag: 'oda' };
const SAIKA = { armor: 0x2a2622, lace: 0x4a3a2a, hat: 'jingasa', flag: 'yatagarasu' };
const SHORE = { x: -34, z: 0 }, BACK = { x: 12, z: 0 };
const COVER = { x: 9, z: 3 };
const REPORT_FROM = { x: 120, z: 32 };
const NO_HOSTS = [];
// 画面外の知らせは後陣で受け、そこから実際に走る使番が本人へ届ける。
// 使番が討たれても任務の段は待たせない。
function report(rt, text) {
  sendOrder(rt, REPORT_FROM, rt.player.u, { id: 'saikaReport', apply() {
    if (rt.flags.ending || rt.over || !rt.player.u.alive) return;
    rt.say('伝令', text, 5);
    battleEvent(rt, EVENT_MESSENGER, rt.player.u.pos, rt.flags.hori, 0, false, text);
  } }, { team: 0, faction: 'oda', name: '山手の使番' });
}
// 引き上げた桶は同じ作業兵が持つ。傷や打ち合いで手を離せば、その場へ落とす。
function tickBuckets(rt, dt) {
  for (const a of rt.flags.stakes) {
    const u = a.carrier;
    if (!u) continue;
    const p = a.bucket.position;
    if (!u.alive || u.gone || u.fleeing || u.woundOut || u.rearWound || u.downed || u.target || u.atk || u.pos.x > -8) {
      p.y = rt.world.heightAt(p.x, p.z) + 0.4;
      a.bucket.rotation.z = !u.alive || u.downed ? 0.5 : 0;
      u.saikaBucket = null; a.carrier = null;
      continue;
    }
    const k = Math.min(1, dt * 8);
    p.x += (u.pos.x + Math.cos(u.heading) * 0.7 - p.x) * k;
    p.z += (u.pos.z - Math.sin(u.heading) * 0.7 - p.z) * k;
    p.y += (u.pos.y + 0.8 - p.y) * k;
  }
}
// 竹束の見える幅と高さだけで矢玉を遮る。束の隙間や上を通る弾は止めない。
function syncTabaCover(rt) {
  for (const tb of rt.flags.bankTabas) {
    const s = tb.saikaSolid, rot = tb.rot + Math.PI;
    s.x = tb.x; s.z = tb.z; s.c = Math.cos(rot); s.s = Math.sin(rot);
    const dx = Math.abs(s.c) * s.hw + Math.abs(s.s) * s.hd;
    const dz = Math.abs(s.s) * s.hw + Math.abs(s.c) * s.hd;
    s.x0 = s.x - dx; s.x1 = s.x + dx; s.z0 = s.z - dz; s.z1 = s.z + dz;
    s.yTop = rt.world.heightAt(s.x, s.z) + s.missileH;
  }
}
function crowTex() {
  return customFlag('yatagarasu', (g) => {
    g.translate(64, 84); g.scale(40, 40);
    g.beginPath(); g.ellipse(0, 0.05, 0.5, 0.36, -0.2, 0, Math.PI * 2); g.fill();          // 胴
    g.beginPath(); g.arc(0.42, -0.36, 0.2, 0, Math.PI * 2); g.fill();                       // 頭
    g.beginPath(); g.moveTo(0.58, -0.42); g.lineTo(0.9, -0.34); g.lineTo(0.58, -0.28); g.closePath(); g.fill();   // 嘴
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(-0.1, -0.1); g.quadraticCurveTo(-0.5, -0.9 * (sd > 0 ? 1 : 0.8), -0.95, -0.55 + sd * 0.1); g.quadraticCurveTo(-0.55, -0.2, -0.2, 0.2); g.closePath(); g.fill(); }   // 翼
    g.beginPath(); g.moveTo(-0.45, 0.2); g.lineTo(-0.95, 0.5); g.lineTo(-0.5, 0.36); g.closePath(); g.fill();   // 尾
    g.lineWidth = 0.07;
    for (const dx of [-0.12, 0.04, 0.2]) { g.beginPath(); g.moveTo(dx, 0.35); g.lineTo(dx - 0.05, 0.85); g.stroke(); }   // 三本の足
    g.fillStyle = '#e9e3d4'; g.beginPath(); g.arc(0.48, -0.4, 0.05, 0, Math.PI * 2); g.fill();   // 目
  });
}

function height(x, z) {
  let h = 0.35 * Math.sin(-z * 0.03 + 0.2) * Math.cos(x * 0.028) + 0.25 * Math.sin(x * 0.07 - z * 0.02);
  h += 3.2 / (1 + Math.exp((x - (BANK + 8)) / 0.7)) * Math.max(0, Math.min(1, (140 - Math.abs(z)) / 30));
  return h + 30 * gauss(x, z, 90, 250, 6000);
}
function moveGroup(g, to, facing) {
  if (g.routed || !g.count) return;
  // fixed は初めの配置を守る指定。歩き始めた列は道幅に合わせて持ち場を詰める。
  g.fixed = false;
  g.order = 'move'; g.dest = to; g.aggro = 6; g.formation = 'column'; g.colW = 2;
  g.onArrive = (q) => { q.order = 'hold'; q.facing = facing; q.aggro = 10; q.formation = q.units.every((u) => u.type === 'gun' || u.type === 'bow') ? 'line' : 'yari'; };
}
// 東岸を見回り、杭抜きと川上・川下の寄せを援護する。道と到着処理は一度だけ作る。
function patrolBank(g, x, z) {
  g.saikaPatrol = [{ x, z }, { x, z: -z }];
  g.saikaPatrolIndex = 0;
  g.fixed = false; g.order = 'move'; g.dest = g.saikaPatrol[0];
  g.formation = 'column'; g.colW = 3; g.aggro = 18; g.guardSight = 30; g.guardLeash = 10;
  const turn = (q) => {
    q.saikaPatrolIndex = 1 - q.saikaPatrolIndex;
    q.dest = q.saikaPatrol[q.saikaPatrolIndex]; q.onArrive = turn;
  };
  g.onArrive = turn;
}
// 既存の三十六人を小組に分け、敵が途切れたら次の組が歩いて寄る。
// 行き先は準備時に作って使い回す。杭列の東側を通り、西岸の柵へは出さない。
function sendRaider(g, z, x = -11, focus = null) {
  if (g.routed || !g.count) return;
  g.bankCommitted = true;
  g.bankDest.x = x; g.bankDest.z = z;
  g.fixed = false; g.order = 'move'; g.dest = g.bankDest;
  g.focus = focus; g.aggro = 12; g.seekRange = 24;
  g.formation = 'column'; g.colW = 2; g.speed = 3;
  g.onArrive = g.bankArrive;
}
function tickRaiders(rt, dt) {
  const F = rt.flags;
  if (F.step < 1 || F.step > 5) return;
  F.raidCheckT = (F.raidCheckT || 0) - dt;
  if (F.raidCheckT > 0) return;
  F.raidCheckT = 0.5;
  let near = false, available = false, next = null, nextDist = Infinity;
  const p = rt.player.u.pos;
  // 杭抜きと渡河の間は東岸から迎える。西岸の柵へ敵味方を追い込まない。
  // 三つ目の杭の作業場所も杭列の東側にある。そこまで寄せを届かせる。
  const x = Math.max(-19, Math.min(BACK.x + 28, p.x));
  const z = Math.max(-72, Math.min(72, p.z));
  for (const g of F.raiders) {
    let ready = false, distance = Infinity;
    for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed &&
        !g.routed) {
      if (u.type !== 'gun' && u.type !== 'bow') ready = true;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      distance = Math.min(distance, d);
      // 射手や柵越しの敵は、斬り合いの切れ目を埋めたことにしない。
      if (u.type !== 'gun' && u.type !== 'bow' && d < 4.5 && Math.abs(u.pos.y - p.y) < 3 &&
          !rt.army.wallBetween(u.pos, -1, p)) near = true;
    }
    if (!ready) continue;
    available = true;
    if (!g.bankCommitted) {
      if (distance < nextDist) { next = g; nextDist = distance; }
      continue;
    }
    // 最初の小組は作業場へ先回りする。本人がまだ後方でも行き先を変えない。
    if (F.step === 1 && rt.t < g.bankWorkUntil) continue;
    const focus = p.x >= -19 && p.x <= BACK.x + 28 && Math.abs(p.z) <= 72 ? rt.player.u : null;
    if (g.bankStep !== F.step || Math.hypot(g.bankDest.x - x, g.bankDest.z - z) > 3 || g.focus !== focus) {
      g.bankStep = F.step;
      sendRaider(g, z, x, focus);
    }
  }
  F.raidsSpent = !available;
  F.raidGapT = near ? 0 : (F.raidGapT || 0) + 0.5;
  // 六秒の切れ目で、残る組のうち実際に近い組へ下知する。
  // 寄せた組は本人を狙い続け、到着しただけで寄せを済ませない。
  // 寄せの組を使い切ると、杭の段で敵に会わない間が四十秒を超えた（10/7 測り）。川べりから新しい小組を出す（四組まで）
  if (F.raidGapT >= 12 && !next && (F.step === 1 || F.step === 4 || F.step === 5) && (F.extraRaids || 0) < 4) {
    F.extraRaids = (F.extraRaids || 0) + 1;
    const az = p.z >= 0 ? 36 : -36;
    const g = enemyGroup(rt, { faction: 'saito', fixed: true, name: p.z >= 0 ? '川下の雑賀衆' : '川上の雑賀衆', anchor: { x: -9, z: az }, facing: az > 0 ? Math.PI : 0,
      formation: 'yari', order: 'hold', aggro: 10, fleeDir: { x: 0, z: az > 0 ? 1 : -1 } }, dress([{ type: 'ashigaru', n: 5 }], SAIKA));
    g.bankDest = { x: -11, z: 18 }; g.noGuard = true; g.noAI = true;
    g.bankArrive = (q) => { q.order = q.focus ? 'attack' : 'hold'; q.formation = 'yari'; q.aggro = 12; };
    g.fleePath = [[4, az * 4], [-20, az * 4], [-64, az * 4], [-120, az * 4]];
    F.raiders.push(g);
    g.bankStep = F.step;
    sendRaider(g, z, x, p.x >= -19 && p.x <= BACK.x + 28 && Math.abs(p.z) <= 72 ? rt.player.u : null);
    F.raidGapT = 0;
  }
  if (F.raidGapT >= 6 && next) {
    next.bankStep = F.step;
    sendRaider(next, z, x, p.x >= -19 && p.x <= BACK.x + 28 && Math.abs(p.z) <= 72 ? rt.player.u : null);
    F.raidGapT = 0;
  }
}
function warnBank(rt, key, title, text, at = BACK) {
  const F = rt.flags;
  if (F[key]) return;
  F[key] = true;
  rt.banner(title, text); rt.say('堀秀政', text, 5);
  rt.marker('bankDanger', at, title, { h: 3 });
}
function phase(rt, step, name, text, at, label) {
  const F = rt.flags;
  F.step = step; F.stepT = rt.t; F.inT = 0;
  rt.setPhase(name); rt.obj('main', text, 'main'); rt.objProgress('main', '');
  rt.unmark('goal'); rt.unmark('bankDanger');
  if (at) rt.marker('goal', at, label, { h: 3 });
}
// 東側の兵を杭の向こうへ戻さない。西側では抜けた口を使い、未開通なら杭列の端を回る。
// 下知が出た時だけ道を作る。毎コマの道探しには使わない。
function withdrawRoad(rt, c, to = { x: 58, z: 0 }) {
  if (c.x >= -8) return [[to.x, to.z]];
  const east = { x: -8, z: c.z }, west = { x: -28, z: c.z };
  // 杭ぎわでは出発点が当たりの幅に入る。両側とも塞がった判定なら、
  // 東へ抜ける。東側の兵を西へ戻す道にすると、残った杭に突っ込む。
  if (!rt.army.wallBetween(c, -1, east) || rt.army.wallBetween(c, -1, west)) return [[-8, c.z], [to.x, to.z]];
  let opening = null, distance = Infinity;
  for (const a of rt.flags.stakes) if (a.pulled && Math.abs(a.z - c.z) < distance) {
    opening = a; distance = Math.abs(a.z - c.z);
  }
  const z = opening ? opening.z : c.z > 0 ? 76 : -66;
  return [[-28, z], [-8, z], [to.x, to.z]];
}
function withdrawGroup(rt, g, to) {
  if (g.routed || !g.count) return;
  const c = g.center();
  g.fixed = false; g.retreatOnly = true; g.anchor.x = c.x; g.anchor.z = c.z;
  g.order = 'path'; g.path = withdrawRoad(rt, c, to); g.pathIdx = 0;
  g.aggro = 6; g.formation = 'column'; g.colW = 2;
  g.onArrive = (q) => { q.order = 'hold'; q.retreatOnly = false; q.facing = WEST; q.formation = q.units.every((u) => u.type === 'gun' || u.type === 'bow') ? 'line' : 'yari'; q.aggro = 10; };
}
// 表すのは目の前の持ち場だけ。人数と各将の座標は復元で、紀州全軍の総数ではない。
// 稲葉父子・氏家・飯沼の紀ノ川の守り、浜手の信長・信忠・孫一は画面外。
const JIN = [
  rosterPlan('川岸の対陣', 0, { x: 72, z: 0 }, WEST, [
    ['sakuma', '山手の後ろの陣', '佐久間信盛', 16, 72, 0, 'oda', 'oda', 0, { bind: 'honjin' }],
    ['hori', '渡河の援護', '堀秀政', 19, 26, 0, 'oda', 'oda', 0, { bind: 'hori' }],
    ['workers', '杭を外す組', '堀秀政の配下（名は不明）', 6, 20, 0, 'oda', 'oda', 0, { bind: 'workers' }],
    ['guns', '東岸の鉄砲', '堀秀政の配下（名は不明）', 12, 4, -20, 'oda', 'oda', 0, { bind: 'teppo' }],
    ['north', '川上の控え', '山手の将（名は不明）', 120, 50, -70, 'oda', 'oda', 120, { w: 36, d: 24 }],
    ['south', '川下の控え', '山手の将（名は不明）', 120, 50, 70, 'oda', 'oda', 120, { w: 36, d: 24 }],
    ['rear', '陣の後ろの控え', '佐久間の配下（名は不明）', 60, 110, 0, 'oda', 'oda', 60, { w: 24, d: 18 }],
  ], '信長公記巻十。佐久間の参加は史料、局地の本陣・持ち場と人数は復元'),
  rosterPlan('高岸の守り', 1, { x: -110, z: 0 }, EAST, [
    ...[-24, -12, 0, 12, 24].map((z, i) => ['gun' + i, '柵の鉄砲の小組', '雑賀の将（名は不明）', 5, -47, z, 'yatagarasu', 'yatagarasu', 0, { bind: 'gunPosts.' + i }]),
    ['spear', '柵の控え', '雑賀の将（名は不明）', 20, -57, 0, 'yatagarasu', 'yatagarasu', 0, { bind: 'reserve' }],
    ['upstream', '川上の柵と林', '雑賀の将（名は不明）', 72, -57, -64, 'yatagarasu', 'yatagarasu', 72, { kind: 'gun', w: 26, d: 18 }],
    ['downstream', '川下の柵と家', '雑賀の将（名は不明）', 72, -57, 64, 'yatagarasu', 'yatagarasu', 72, { kind: 'gun', w: 26, d: 18 }],
    ['rear', '西岸の後備え', '雑賀の将（名は不明）', 100, -110, 0, 'yatagarasu', 'yatagarasu', 100, { w: 30, d: 24 }],
    ['scout', '川下を回った小組', '雑賀の将（名は不明）', 8, -9, 32, 'yatagarasu', 'yatagarasu', 0, { bind: 'skirmish' }],
    ['northRaid', '川上を回った小組', '雑賀の将（名は不明）', 7, -9, -48, 'yatagarasu', 'yatagarasu', 0, { bind: 'flanks.1' }],
    ['southRaid', '川下を回った小組', '雑賀の将（名は不明）', 7, -9, 48, 'yatagarasu', 'yatagarasu', 0, { bind: 'flanks.0' }],
    ['northFollow', '川上の後ろの小組', '雑賀の将（名は不明）', 7, -9, -64, 'yatagarasu', 'yatagarasu', 0, { bind: 'flanks.3' }],
    ['southFollow', '川下の後ろの小組', '雑賀の将（名は不明）', 7, -9, 64, 'yatagarasu', 'yatagarasu', 0, { bind: 'flanks.2' }],
  ], '信長公記巻十。川岸の将名は不明。川上・川下の渡りと小組の動きは復元'),
];
const saika = {
  jinkei: JIN,
  noTaisho: true, // 信長・孫一をこの局地へ自動配置し、討取り・本陣襲撃で決着させない。
  noDistantBattle: true, // 備え表にない軍勢と川を越える自動の押し合いを足さない。
  botOrders: true, // 杭抜き・渡河・引き退きの道順を、遊び手の突進で上書きしない。
  noReserve: true, // 近い控えの置換とは別に、後詰の新兵を足さない。
  // 杭抜きも護衛の戦う段。任務の文が変わっても小勢の寄せを止めない。
  frontlineDensity: { phases: ['stakes', 'cross', 'regroup', 'hold'] },
  wakeRoom: 235, // 使番の余地を残し、近い控えを同じ場所の本物へ替える。
  spawn: { x: 18, z: -6, heading: WEST },
  world: {
    blockedHint: () => '陣幕は東にある。西へ進み、杭の印へ寄れ。渡る時は中央の口を通れ',
    seed: 15772, time: 'day', fieldStage: 'fallow', muddy: 0.6, waterSlow: true,
    streams: [{ pts: RIVER, w: 12, depth: 0.65 }],
    paths: [[[150, 0], [30, 0], [-34, 0]], [[4, 140], [-20, 140], [-120, 140]], [[4, -140], [-20, -140], [-120, -140]]], height,
    tint(x, z, h, c) { if (x < 0 && x > -34) c.lerp({ r: 0.42, g: 0.42, b: 0.34 }, 0.4); },
    clear: (x, z) => Math.abs(z) < 90 && x > -90 && x < 80,
    trees: 320, tufts: 4000,
    treeDensity: (x, z) => Math.abs(z) < 100 && x > -100 && x < 90 ? 0.1 : 0.8,
    groves: [{ x: 30, z: 70, r: 12, n: 16 }, { x: -70, z: -70, r: 12, n: 16 }],
    climbTan: 0.70,
    fleeOut: (x, z, team) => team === 1 ? x < -110 : x > 120,
  },
  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const F = rt.flags, W = rt.world;
    F.step = 0; F.pulled = 0; F.ak = 0; F.ek = 0; F.pressure = 0;
    // 狙われている印は毎回保つ。遠い射手の同じ警告文だけは三十秒あける。
    const gunNotice = rt.army.hooks.onGunAtPlayer, arrowNotice = rt.army.hooks.onArrowAtPlayer;
    rt.army.hooks.onGunAtPlayer = () => {
      rt.aimedT = Math.max(rt.aimedT || 0, 2.5);
      if (rt.t < (F.gunNoticeAt || 0)) return;
      F.gunNoticeAt = rt.t + 30; gunNotice();
    };
    rt.army.hooks.onArrowAtPlayer = () => {
      if (rt.t < 10 || rt.t < (F.arrowNoticeAt || 0)) return;
      F.arrowNoticeAt = rt.t + 30; arrowNotice();
    };
    F.rescued = true; // 倒れた直後の担ぎ起こし・全快で戦列へ戻さない。
    F.hist = { bank: '史料', withdrawal: '史料', stakes: '補完', flank: '補完', numbers: '仮置き' };
    crowTex();
    const wall = (pts, name, h = 2.5) => {
      const segs = wallLine(rt, pts, { team: 1, hp: 1e9, name, segLen: 6, meshOpt: { h } });
      for (const s of segs) { s.noTarget = true; s.wall = true; }
      return segs;
    };
    F.stakes = STAKES.map((a, i) => ({ ...a, i, pulled: false, segs: wall([[a.x, a.z - 4], [a.x, a.z + 4]], '川底の杭', 1.2) }));
    wall([[-19, 70], [-18, 22]], '川底の杭', 1.2);
    wall([[-19, 14], [-21, 4]], '川底の杭', 1.2);
    wall([[-21, -4], [-22, -14]], '川底の杭', 1.2);
    wall([[-22, -22], [-23, -60]], '川底の杭', 1.2);
    // 高い西岸は柵で連続して塞ぐ。口を抜いて城攻めへ転じる戦にはしない。
    wall([[BANK, -110], [BANK, 110]], '西岸の柵');
    const geo = new THREE.CylinderGeometry(0.6, 0.5, 0.8, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0x675039 });
    // 川底の壺と槍先は伝承に沿う見た目の補完。形と材質を三つの持ち場で使い回す。
    const jarGeo = new THREE.LatheGeometry([
      [0, 0], [0.22, 0], [0.38, 0.12], [0.44, 0.3], [0.34, 0.46],
      [0.18, 0.52], [0.18, 0.62], [0.13, 0.62], [0.13, 0.5],
      [0.28, 0.42], [0.34, 0.3], [0.28, 0.15], [0, 0.08],
    ].map(([r, y]) => new THREE.Vector2(r, y)), 8);
    const jarMat = new THREE.MeshLambertMaterial({ color: 0x574235 });
    const shaftGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.28, 5);
    const tipGeo = new THREE.OctahedronGeometry(1);
    const ironMat = new THREE.MeshLambertMaterial({ color: 0x53514b });
    for (const a of F.stakes) {
      a.bucket = new THREE.Mesh(geo, mat);
      a.bucket.position.set(a.x + 0.8, W.heightAt(a.x, a.z) - 0.15, a.z + 1);
      a.bucket.rotation.z = 0.5; rt.scene.add(a.bucket);
      a.riverTraps = new THREE.Group();
      const jar = new THREE.Mesh(jarGeo, jarMat);
      jar.position.set(a.x - 0.8, W.heightAt(a.x - 0.8, a.z - 1) - 0.04, a.z - 1);
      a.riverTraps.add(jar);
      for (const dz of [-2.5, 2.5]) {
        const x = a.x - 0.3, z = a.z + dz, y = W.heightAt(x, z);
        const shaft = new THREE.Mesh(shaftGeo, mat), tip = new THREE.Mesh(tipGeo, ironMat);
        shaft.position.set(x, y + 0.12, z);
        tip.scale.set(0.08, 0.22, 0.035); tip.position.set(x, y + 0.35, z);
        a.riverTraps.add(shaft, tip);
      }
      rt.scene.add(a.riverTraps);
    }
    rt.scene.add(hut(W, -60, 20, 7, 5, WEST), hut(W, -64, -14, 7, 5, WEST));
    rt.scene.add(yagura(W, -48, 30), yagura(W, -48, -30));
    for (const z of [-44, -26, 2, 40]) rt.scene.add(nobori(W, -47, z, 'yatagarasu', 6));
    rt.scene.add(village(W, -56, 150, { n: 6, r: 18, rot: WEST, seed: 15741, smoke: 0 }));
    rt.scene.add(village(W, -70, -150, { n: 5, r: 16, rot: WEST, seed: 15742, smoke: 0 }));
    F.hori = allyGroup(rt, { name: '堀秀政の先手', fixed: true, fullStrength: true, fleeDir: { x: 1, z: 0 }, guard: true, guardSight: 20, guardLeash: 6, anchor: { x: 26, z: 0 }, facing: WEST, width: 14, aggro: 10, formation: 'yari' },
      dress([{ type: 'ashigaru', n: 16 }, { type: 'samurai', n: 2 }, { type: 'busho', n: 1, o: { name: '堀秀政', invuln: true, hat: 'kabuto_m', haori: 0x2e3a4a } }], ODA));
    F.workers = allyGroup(rt, { name: '杭を外す先手の組', fixed: true, fullStrength: true, anchor: { x: 20, z: 0 }, facing: WEST, width: 4, formation: 'column', colW: 2, aggro: 2, fleeDir: { x: 1, z: 0 } }, dress([{ type: 'ashigaru', n: 6 }], ODA));
    for (const a of F.stakes) a.workAt = { x: a.x + 2.2, z: a.z };
    F.teppo = allyGroup(rt, { name: '東岸の織田鉄砲衆', fixed: true, fullStrength: true, fleeDir: { x: 1, z: 0 }, guard: true, guardSight: 65, guardLeash: 3, anchor: { x: 4, z: -20 }, facing: WEST, width: 6, ranks: 1, aggro: 65 }, dress([{ type: 'gun', n: 12 }], ODA));
    // 五つの小組が各々撃って込める。六人以上の共通一斉射と二段交代を使わない。
    F.gunPosts = [-24, -12, 0, 12, 24].map((z, i) => {
      const g = enemyGroup(rt, { faction: 'saito', fixed: true, name: '西岸の鉄砲の小組', anchor: { x: -47, z }, facing: EAST, width: 5, ranks: 1,
        order: 'hold', guard: true, guardSight: 68, guardLeash: 3, aggro: 68, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'gun', n: 4 }, { type: 'bow', n: 1 }], SAIKA));
      for (const u of g.units) u.cd = 2 + i * 4 + u.slot;
      return g;
    });
    F.reserve = enemyGroup(rt, { faction: 'saito', fixed: true, name: '柵を守る雑賀衆', anchor: { x: -57, z: 0 }, facing: EAST, formation: 'yari', width: 10,
      order: 'hold', guard: true, guardSight: 20, guardLeash: 5, aggro: 10, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }], SAIKA));
    // 地元の小組は、川上・川下を渡った東岸の道に初めからいる。開始後に兵を足さない。
    F.skirmish = enemyGroup(rt, { faction: 'saito', fixed: true, name: '川べりの雑賀衆', anchor: { x: -9, z: 32 }, facing: Math.PI,
      formation: 'yari', order: 'hold', aggro: 10, fleeDir: { x: 0, z: 1 } }, dress([{ type: 'ashigaru', n: 8 }], SAIKA));
    F.flanks = [48, -48, 64, -64].map((z) => enemyGroup(rt, { faction: 'saito', fixed: true, name: z > 0 ? '川下の雑賀衆' : '川上の雑賀衆',
      anchor: { x: -9, z }, facing: z > 0 ? Math.PI : 0, formation: 'yari', order: 'hold', aggro: 10,
      fleeDir: { x: 0, z: z > 0 ? 1 : -1 } }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }, { type: 'gun', n: 1 }], SAIKA)));
    F.raiders = [F.skirmish, ...F.flanks];
    for (const g of F.flanks) g.bankSide = g.anchor.z > 0 ? '川下' : '川上';
    for (const g of F.raiders) {
      g.bankDest = { x: -11, z: 18 }; g.noGuard = true; g.noAI = true;
      g.bankArrive = (q) => { q.order = q.focus ? 'attack' : 'hold'; q.formation = 'yari'; q.aggro = 12; };
      const z = g.anchor.z > 0 ? 140 : -140;
      g.fleePath = [[4, z], [-20, z], [-64, z], [-120, z]];
    }
    F.defenders = [F.hori, F.workers, F.teppo];
    // 援護の鉄砲の前に用意済みの竹束。後で四束を無から作らない。
    F.bankDir = { x: -1, z: 0 };
    F.bankTabas = [-9, -3, 3, 9].map((z) => addTaba(rt, 7, z, 0, { rot: WEST, fixed: true }));
    for (const tb of F.bankTabas) {
      tb.saikaSolid = solidRect(tb.x, tb.z, 1.82, 0.6, tb.rot + Math.PI);
      tb.saikaSolid.missileH = 2.1; tb.saikaSolid.missileType = 'wood';
    }
    syncTabaCover(rt);
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 24, z: -10 }, WEST, [{ kind: 'spear', n }]);
    F.honjin = camp(rt, { x: 72, z: 0, facing: WEST, team: 0, faction: 'oda', mon: 'oda', general: { name: '佐久間信盛' }, guard: 15, reserve: 0, runTo: BACK });
    moveGroup(F.honjin.guard, { x: 58, z: 0 }, WEST);
    F.honjin.guard.guard = true; F.honjin.guard.guardSight = 24; F.honjin.guard.guardLeash = 6;
    for (const z of [-30, 30]) rt.scene.add(nobori(W, 30, z, 'oda', 6));
    rosterBuild(rt, JIN);
    F.lightHosts = [];
    for (const plan of JIN) for (const s of plan.sonae) {
      const m = F.jinRoster[plan.team][s.id];
      if (!m) continue;
      m.army.noWake = false;
      F.lightHosts.push(m.army);
    }
    // 中野城と紀ノ川はこの狭い川岸の外。陸上の舟や小屋を城と呼ぶ復元はしない。
    phase(rt, 0, 'brief', HI(rt) ? '堀秀政の先手で、一手を率いて川へ進め' : '堀秀政の先手で、川へ進め');
    rt.say('堀秀政', '西の岸が雑賀の柵じゃ。まず川底の杭を外し、渡る道を通せ', 5);
    rt.after(7, () => report(rt, '我らは根来より来た山手の軍にござる。浜手は明智様らが中野城へ'));
    rt.after(5, () => { if (F.step === 0 && !F.ending) this.stakes(rt); });
  },
  stakes(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 0) return;
    phase(rt, 1, 'stakes', '杭を外す組を守れ。手伝う時は組のそばの印で十二秒押せ');
    F.workIndex = -1;
    patrolBank(F.hori, -5, 22);
    rt.say('組頭', '六人は杭を外せ。残る先手と鉄砲は援護せよ', 4);
    for (const a of F.stakes) {
      rt.marker('s' + a.i, { x: a.x + 2.2, z: a.z }, '杭を外す所', { h: 2.4 });
      rt.addInteract('s' + a.i, { x: a.x + 2.2, z: a.z }, '杭抜きを手伝う', () => this.pull(rt, a), { r: 2.6, hold: 12 });
    }
    rt.say('堀秀政', '鉄砲は「構え」では防げぬ。「！」が出たら横へ「回避」せよ', 5);
    sendRaider(F.skirmish, F.stakes[0].z);
    // 十四歩先の作業場へ直ちに寄せ、最初の十四秒は後方の本人を追わせない。
    F.skirmish.bankStep = F.step;
    F.skirmish.bankWorkUntil = rt.t + 14;
  },
  pull(rt, a) {
    if (rt.flags.ending || rt.over || !rt.player.u.alive || rt.flags.step !== 1 || a.pulled) return;
    let helper = null, nearest = 3;
    for (const u of rt.flags.workers.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed && !u.saikaBucket && !u.target && !u.atk) {
      const d = Math.hypot(u.pos.x - a.workAt.x, u.pos.z - a.workAt.z);
      if (d < nearest) { helper = u; nearest = d; }
    }
    if (!helper) { if (!a.helpNoted) { a.helpNoted = true; rt.bark('杭を抜く手が足りぬ。作業の組を守り、ここへ通せ'); } return; }
    a.pulled = true; rt.flags.pulled++;
    rt.uninteract('s' + a.i); rt.unmark('s' + a.i);
    a.bucket.position.y = rt.world.heightAt(a.bucket.position.x, a.bucket.position.z) + 0.4;
    a.bucket.rotation.z = 0;
    a.carrier = helper; helper.saikaBucket = a;
    rt.scene.remove(a.riverTraps); // 杭と一緒に取り除き、通した渡り口に障害の形を残さない。
    for (const s of a.segs) { s.alive = false; if (s.mesh) rt.scene.remove(s.mesh); rt.scene.add(stumps(rt.world, s.seg)); }
    sfx('wood', 0.8);
    rt.award((t) => { if (!t.side.includes('川底の杭を外した')) t.side.push('川底の杭を外した'); }, `川底の杭を外した（${rt.flags.pulled}／3）`);
  },
  cross(rt) {
    const F = rt.flags;
    phase(rt, 2, 'cross', '杭を外した道を渡り、西岸の柵の手前へ進め', SHORE, '西岸の足場');
    rt.banner('小雑賀川を渡れ', '撃ちやむ所を見て、杭を外した道へ');
    rt.say('堀秀政', '撃ちやむ所を見て渡れ！　岸の手前に寄れ。鉄砲は小組ごとに撃つぞ', 5);
    rt.marker('riverTurn', { x: -8, z: 0 }, '中央の渡り口へ');
    moveGroup(F.hori, SHORE, WEST);
    moveGroup(F.workers, SHORE, WEST);
    rt.after(12, () => { if (F.step === 2) rt.say('堀秀政', '岸が高い！　上がれぬまま撃たれる。引く下知を待て', 5); });
  },
  retreat(rt) {
    const F = rt.flags;
    phase(rt, 3, 'retreat', '中央の杭を外した道へ戻り、東岸の旗まで引け', BACK, '東岸の集合');
    rt.banner('渡河を断念', F.reached ? '高い岸と鉄砲に阻まれた。東岸へ引き返せ' : '西岸に届かなかった。東岸へ戻り、列を守れ');
    if (!F.reached) rt.say('伝令', '西岸へ届かず、渡河の役目は果たせませぬ。東岸へ戻れ！', 5);
    rt.say('堀秀政', '引け！　川の中央の通り道へ戻れ。東岸の鉄砲が引き際を支える', 5);
    rt.unmark('riverTurn'); rt.marker('riverTurn', { x: -28, z: 0 }, '中央の渡り口へ戻る');
    withdrawGroup(rt, F.hori, BACK);
    withdrawGroup(rt, F.workers, BACK);
    battleEvent(rt, EVENT_RETREAT, SHORE, F.hori, 0, true, '先手が引く。川の道を戻れ');
    F.teppo.holdFire = false;
    withdrawGroup(rt, F.workers, BACK);
    // 東岸の寄せは敵の切れ目に合わせて動く。遠い待機点へ戻す下知を重ねない。
  },
  regroup(rt) {
    const F = rt.flags;
    rt.unmark('riverTurn');
    phase(rt, 4, 'regroup', '竹束の陰の印で「竹束を確かめる」を六秒押せ', COVER, '竹束の陰');
    moveGroup(F.teppo, { x: 14, z: -12 }, WEST);
    rt.say('堀秀政', '柵は落ちぬ。川を挟んで押さえる。旗の前の竹束を確かめ、鉄砲を守れ', 5);
    rt.say('組頭', '印は竹束の陰じゃ。束の隙間は矢玉が通るぞ', 4);
    rt.addInteract('cover', COVER, '竹束を確かめる', () => {
      if (F.ending || rt.over || !rt.player.u.alive || F.step !== 4 || F.cover) return;
      let carriers = 0;
      for (const u of F.hori.units) if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - BACK.x, u.pos.z - BACK.z) < 20 && carriers < F.bankTabas.length) carriers++;
      if (carriers < 2) { rt.bark('竹束を据える先手が足りぬ。旗へ組を集めよ'); return; }
      for (let i = 0; i < carriers; i++) {
        const tb = F.bankTabas[i]; tb.fixed = false; tb.van = F.hori; tb.dir = F.bankDir; tb.off = (i - (carriers - 1) / 2) * 1.9;
      }
      moveGroup(F.teppo, { x: 11.5, z: 0 }, WEST); F.teppo.holdFire = false; F.teppo.facing = WEST;
      F.cover = true; rt.uninteract('cover');
      rt.award((t) => t.side.push('東岸の守りを固めた'), '東岸の守りを固めた');
      rt.say('堀秀政', 'よし。竹束の後ろへ寄れ。川上と川下の道にも槍を向けよ', 5);
    }, { r: 2.6, hold: 6 });
  },
  hold(rt) {
    const F = rt.flags;
    rt.uninteract('cover');
    phase(rt, 5, 'hold', '東岸の守りを保て。川上・川下の雑賀衆を払え', BACK, '東岸の守り');
    rt.banner('川を限って対陣', '東岸の旗で味方六人を保て。西岸へ追うな');

    rt.after(76, () => {
      if (F.step !== 5) return;
      report(rt, '稲葉様らが紀ノ川の渡り口を固め申した。退き道は通っておりまする');
    });
  },
  update(rt, dt) {
    const F = rt.flags;
    tickBuckets(rt, dt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    tickTabas(rt, dt);
    syncTabaCover(rt);
    tickRaiders(rt, dt);
    // 小組が順に撃つ。二分後に全組の銃声を重ね、近接の寄せを埋めない。
    const volley = Math.floor(rt.t / 12) % F.gunPosts.length;
    for (let i = 0; i < F.gunPosts.length; i++) F.gunPosts[i].fire = i === volley;
    // 替わった味方の控えは東岸を見回る。敵は西岸の持ち場を守る。
    for (const g of rt.army.groups) if (g.woke && g.woke.jinkeiGuard && !g.saikaGuard) {
      g.saikaGuard = true; g.noGuard = false; g.guard = true; g.guardLeash = 6;
      const guns = g.woke.kind === 'gun';
      g.guardSight = guns ? 68 : 14; g.aggro = guns ? 68 : 8; g.seekRange = g.guardSight;
      g.formation = guns ? 'line' : 'yari';
      for (const u of g.units) if (u.mesh) u.mesh.scale.set(1, 1, 1);
      if (g.team === 0) {
        patrolBank(g, 12 + (g.id % 3) * 4, g.anchor.z < 0 ? -26 : 26);
        F.defenders.push(g);
      }
    }
    for (const g of rt.army.groups) if (g.team === 1 && g.saikaGuard && g.woke.kind === 'gun') g.fire = g.id % F.gunPosts.length === volley;
    const el = rt.t - F.stepT, p = rt.player.u.pos;
    // 五人を討つ前は、寄せる敵が残る限り時間だけで閉じない。
    // 全小組が討たれるか退いた場合や、味方の陣が崩れた場合は待たせない。
    const fought = rt.stats.kills >= 5 || F.raidsSpent;
    const notice = rt.t >= (F.progressAt || 0);
    if (notice) F.progressAt = rt.t + 0.5;
    if (F.step === 1) {
      const a = F.stakes.find((s) => !s.pulled);
      if (a && F.workIndex !== a.i) { F.workIndex = a.i; moveGroup(F.workers, a.workAt, WEST); }
      if (a) {
        let hands = 0, attacked = false;
        for (const u of F.workers.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed && !u.saikaBucket && Math.hypot(u.pos.x - a.workAt.x, u.pos.z - a.workAt.z) < 3) { hands++; if (u.target || u.atk) attacked = true; }
        a.workT = hands >= 2 && !attacked ? (a.workT || 0) + dt : 0;
        if (a.workT >= 12) this.pull(rt, a);
      } else if (F.workIndex !== 3) { F.workIndex = 3; moveGroup(F.workers, { x: 20, z: 0 }, WEST); }
      let ready = 0, available = 0;
      for (const u of F.hori.units) if (u.alive && !u.fleeing && !u.woundOut) { available++; if (u.pos.x > -8 && Math.abs(u.pos.z) < 24) ready++; }
      const need = Math.min(6, available);
      if (notice) rt.objProgress('main', F.pulled === 3 ? `東岸で渡る列をそろえよ ${ready}／6人` : `杭 ${F.pulled}／3。作業する組を守れ`);
      if (el > 55 && !F.help && F.pulled !== 3) { F.help = true; rt.say('堀秀政', '作業の組を守れ。手伝うなら組のそばの印で十二秒押せ。矢玉が来たら離れよ', 5); }
      if (el >= 160 && F.pulled < 3) warnBank(rt, 'stakesWarn', '西の川岸・杭抜きを急げ', '西の川岸で杭を外しきれねば引く。杭の印で作業を手伝え', a?.workAt);
      const thin = available < 6 || F.hori.routed;
      F.vanDangerT = thin ? (F.vanDangerT || 0) + dt : 0;
      if (thin || available < 10 || F.hori.morale < 40) warnBank(rt, 'vanWarn', '西の川岸・先手の陣が崩れそうだ', '西の川岸の先手が薄い。杭の東側へ戻り、敵を払え', F.hori.anchor);
      else { if (!F.stakesWarn) rt.unmark('bankDanger'); }
      if (F.pulled === 3 && need === 6 && ready >= need && !F.hori.routed) this.cross(rt);
      else if (el >= 180 && fought || F.vanDangerT >= 20) {
        if (available < 6 || F.hori.routed || F.pulled === 3) F.holdFailure = '西の川岸の先手が減り、渡る兵を六人そろえられなかった';
        return this.win(rt, false);
      }
    } else if (F.step === 2) {
      if (p.x < -10 && Math.abs(p.z) < 6) rt.unmark('riverTurn');
      if (p.x < -28 && p.x > BANK && Math.hypot(p.x - SHORE.x, p.z - SHORE.z) < 7) F.reached = true;
      if (notice) rt.objProgress('main', F.reached ? '西岸に着いた。岸へは上がれぬ。引く下知に備えよ' : '中央の道を渡り、西岸の印へ');
      if (F.reached && el >= 16 || el >= 60) this.retreat(rt);
    } else if (F.step === 3) {
      if (p.x > -12 && Math.abs(p.z) < 6) rt.unmark('riverTurn');
      if (Math.hypot(p.x - BACK.x, p.z - BACK.z) < 16) F.inT += dt;
      else F.inT = 0;
      const distance = Math.hypot(p.x - BACK.x, p.z - BACK.z);
      let back = 0;
      for (const u of F.hori.units) if (u.alive && !u.fleeing && !u.woundOut && u.pos.x > -8 && Math.abs(u.pos.z) < 24) back++;
      if (notice) rt.objProgress('main', distance >= 16 ? '東岸の旗へ戻れ' : back < 6 ? `先手の集合を支えよ ${back}／6人` : '旗のそばで列を保て');
      if (F.inT >= 5 && back >= 6) this.regroup(rt);
      else {
        if (el >= 50) warnBank(rt, 'returnWarn', '東岸の旗へ集まれ', '東の岸の旗へ戻れ。先手を六人集めねば引く');
        if (el >= 70 && fought) this.win(rt, false);
      }
    } else if (F.step === 4) {
      if (notice) rt.objProgress('main', '竹束の陰の印で六秒押せ。鉄砲の守りを確かめよ');
      if (F.cover) this.hold(rt);
      else {
        if (el >= 70) warnBank(rt, 'coverWarn', '東岸の守りを固めよ', '東の岸の竹束へ寄れ。印で守りを確かめねば引く', COVER);
        if (el >= 90 && fought) this.win(rt, false);
      }
    } else if (F.step === 5) {
      let threat = 0, allies = 0, deep = 0, rearGuard = 0;
      for (const g of F.raiders) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - BACK.x, u.pos.z - BACK.z) < 24) { threat++; if (u.pos.x > BACK.x + 6 && Math.abs(u.pos.z) < 10) deep++; }
      }
      for (const g of F.defenders) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - BACK.x, u.pos.z - BACK.z) < 28) { allies++; if (u.pos.x > BACK.x + 3 && Math.abs(u.pos.z) < 12) rearGuard++; }
      }
      F.pressure = threat > 0 && (threat >= allies || deep > rearGuard) ? F.pressure + dt : 0;
      const holding = Math.hypot(p.x - BACK.x, p.z - BACK.z) < 35 && allies >= 6 && !F.hori.routed;
      if (F.inT > 0 && threat > 0 && rt.t >= (F.resetNoticeAt || 0) && F.raiders.some((g) => g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - BACK.x, u.pos.z - BACK.z) < 24 && sightUnit(rt, u)))) {
        F.resetNoticeAt = rt.t + 30; rt.bark('敵が東岸へ入った。払って味方六人で二十秒守り直せ');
      }
      for (const g of F.flanks) if (!g.bankSeen && g.units.some((u) => u.alive && !u.fleeing && sightUnit(rt, u)) && rt.t >= (F.watchAt || 0)) {
        g.bankSeen = true; F.watchAt = rt.t + 8; rt.say('見張り', `${g.bankSide}から敵の旗じゃ！　岸の槍を向けよ`, 4);
      }
      // 寄せが終われば二十秒の守りで閉じる。敵を払った後に百秒まで待たせない。
      const raidsDone = F.raidsSpent;
      F.inT = raidsDone && holding && threat === 0 ? F.inT + dt : 0;
      if (notice) rt.objProgress('main', F.pressure > 0 ? '！東岸へ敵が入った。旗の後ろへ通すな' : !holding ? '東岸の旗へ戻り、味方と列を保て' : threat > 0 ? '東岸の近くに敵が残る。追わずに払え' : '西岸の鉄砲に備え、旗のそばで列を保て');
      if (el >= 110 && !F.holdWarn) { F.holdWarn = true; rt.say('堀秀政', '寄せを払え！　押し切れねば後陣へ引く。東岸で列を保て', 5); }
      if (allies >= 10) F.lineWarn = false;
      if (allies >= 6 && allies < 10 && !F.lineWarn && rt.t >= (F.lineWarnAt || 0)) { F.lineWarn = true; F.lineWarnAt = rt.t + 30; rt.bark('守りの列が薄い。東岸へ戻り、六人の列を守れ'); }
      const thin = allies < 6 || F.hori.routed;
      F.lineDangerT = thin ? (F.lineDangerT || 0) + dt : 0;
      if (F.pressure >= 8 || thin || allies < 10 || F.hori.morale < 40) warnBank(rt, 'bankWarn', '東岸の陣が崩れそうだ', '東の岸の旗へ戻れ！　敵を払い、味方六人の列を守れ');
      else { if (!F.holdTimeWarn) rt.unmark('bankDanger'); }
      if (el >= 120) warnBank(rt, 'holdTimeWarn', '東岸の寄せを払え', '東の岸の敵を払い、旗のそばで二十秒の守りを保て');
      if (F.pressure >= 28 || F.lineDangerT >= 20) {
        F.holdFailure = F.pressure >= 28 ? '東岸の陣が、旗の後ろへ入った敵に押し崩された' : '東岸の陣が、守る味方を六人そろえられず崩れた';
        this.win(rt, false);
      }
      else if (F.inT >= 20 && fought) this.win(rt, true);
      else if (el >= 140 && fought) { F.holdFailure = Math.hypot(p.x - BACK.x, p.z - BACK.z) >= 35 ? '本人が東岸の持ち場を離れた' : allies < 6 || F.hori.routed ? '東岸に六人の守りが残らなかった' : threat > 0 ? '東岸の敵を払えなかった' : '敵を払った後、二十秒の守りを保てなかった'; this.win(rt, false); }
    }
  },
  win(rt, held) {
    const F = rt.flags;
    if (F.ending) return;
    held = held && !!F.reached && !!F.cover && rt.player.u.alive;
    rt.tracker.main = !!held;
    F.ending = true; rt.setPhase('end'); rt.objProgress('main', ''); rt.unmark('goal'); rt.uninteract('cover');
    for (const a of F.stakes) {
      rt.uninteract('s' + a.i); rt.unmark('s' + a.i);
      if (a.carrier) {
        a.carrier.saikaBucket = null; a.carrier = null;
        a.bucket.position.y = rt.world.heightAt(a.bucket.position.x, a.bucket.position.z) + 0.4;
      }
    }
    rt.unmark('riverTurn'); rt.unmark('bankDanger');
    if (!held) for (const g of F.defenders) withdrawGroup(rt, g, { x: 58, z: 0 });
    // 寄せた小組だけ西岸へ戻す。川岸の鉄砲衆が総崩れになったり、味方が柵へ追撃したりしない。
    for (const g of F.raiders) if (!g.routed && g.count) {
      const c = g.center();
      g.fixed = false; g.retreatOnly = true; g.anchor.x = c.x; g.anchor.z = c.z;
      g.order = 'path'; g.path = g.fleePath; g.pathIdx = 0; g.formation = 'column'; g.colW = 2;
      g.onArrive = (q) => { q.order = 'hold'; q.facing = EAST; };
    }
    // 引き上げ中も両岸の射手は持ち場を守る。射撃の可否は射線と弾込めで決める。
    // 西岸の鉄砲衆は崩さない。局地の守りの成否と、後日の和議を分ける。
    if (held) {
      rt.objDone('main');
      rt.award((t) => { t.main = true; t.special = { label: '小雑賀川の東岸を保った', pts: 20 }; }, '任務達成・東岸を保った');
    } else rt.objFail('main');
    const reason = F.holdFailure || (F.step === 1 ? '西の川岸で杭を外しきれず、渡る道を通せなかった' : !F.reached ? '西岸の足場へ届かなかった' : F.step === 3 ? '東岸に先手の六人の列を集められなかった' : !F.cover ? '東岸の竹束を確かめられなかった' : '東岸で六人の列を保ち、寄せを払えなかった');
    rt.banner(held ? '東岸の列を保った' : '先手は後ろの陣へ引く', held ? '西岸の柵は落ちず、川を挟む対陣が続く' : reason);
    rt.say('堀秀政', held ? '岸は越えられぬ。ここで川を押さえる。柵の内へ追うな' : 'これ以上は押せぬ。後ろの陣へ引き、立て直すぞ', 5);
    // 任務の成否で雑賀全軍を敗走させない。対陣のまま閉じ、飛んでいる矢玉と傷は残す。
    rt.finish({ scriptedEnd: true, failureReason: held ? '' : reason }, 12);
  },
  onKill(rt, v) { if (v.team === 1) rt.flags.ek++; else rt.flags.ak++; },
};
// 局地の描く人数に合わせた目安。一人の討死を架空の六人の損害へ増やさない。
saika.withdrawRoute = (rt, g) => {
  if (g.team !== 0) return null;
  const c = g.center();
  g.fixed = false; g.retreatOnly = true;
  // 動いていた要ではなく、実際の列から退く。先頭だけ遠くへ進めて後列を待たせない。
  g.anchor.x = c.x; g.anchor.z = c.z;
  return withdrawRoad(rt, c);
};
saika.botWithdraw = (b, inp, { goTo }) => {
  const F = b.flags, p = b.player;
  if (!F.botWithdrawPath) { F.botWithdrawPath = withdrawRoad(b, p.u.pos); F.botWithdrawIdx = 0; }
  const road = F.botWithdrawPath;
  while (F.botWithdrawIdx < road.length - 1 && Math.hypot(p.u.pos.x - road[F.botWithdrawIdx][0], p.u.pos.z - road[F.botWithdrawIdx][1]) < 2) F.botWithdrawIdx++;
  const at = road[F.botWithdrawIdx];
  goTo(p, inp, at[0], at[1], 2);
};
saika.force = (rt) => {
  const F = rt.flags;
  let a = 0, b = 0;
  for (const A of F.lightHosts || NO_HOSTS) {
    const n = Math.max(0, A.n - (A.took || 0));
    if (A.team === 0) a += n; else if (A.team === 1) b += n;
  }
  for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.gone) {
    if (u.team === 0) a++; else if (u.team === 1) b++;
  }
  F.a0 ??= a; F.b0 ??= b;
  return { a, a0: F.a0, b, b0: F.b0 };
};
saika.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '雑賀衆', mon: 'yatagarasu' } };
saika.date = () => '天正五年二月　春';
saika.canSkip = (rt) => rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '';
saika.skip = (rt) => { if (rt.flags.step === 0 && !rt.flags.ending) saika.stakes(rt); };
saika.history = '信長公記巻十「雑賀御陣之事」では、山手の堀秀政が小雑賀川を渡り、対岸の高い岸に上がれないところを鉄砲で防がれ、武者数人を失って引いた。その後は川を境に対陣し、稲葉父子・氏家左京亮・飯沼勘平が紀ノ川の渡り口を守った。浜手の中野城は二月二十八日に開城し、信忠が入った。孫一の居城へ竹束で攻め寄せたのは浜手の別の場面である。長い在陣の末、鈴木孫一・土橋平次ら七人が誓紙を出して赦され、三月二十一日に信長は帰途についた。川底に桶・壺・逆茂木を沈め、約七百人を失ったとも伝わるが、ここでは公記の高岸・鉄砲・引き退きを芯にした。東西の向きは地理からの復元。川の全幅二十四歩、渡り場の水深六十五センチ、岸の高さ三歩ほどは復元の寸法。人数、杭抜き、東岸の竹束、川上と川下の小隊は局地戦の補完である。織田の全軍は十万ともいうが数には諸説あり、上の人数は描く局地の兵の目安で、史料の兵数ではない。紀ノ川の守将と両軍の総大将は画面外。佐久間の陣所、小組が東岸を回る道も復元。昼の明るさと烏の旗も見た目の復元である。後日の中野城の開城や和議を、この川岸の数分の中で起きた出来事にしない。';
saika.lordAt = { x: 102, z: 0, r: 12, why: '総大将で遊ぶ場合の後方の陣。川岸に信長がいたという史料上の保証ではない' };
saika.lordSpawn = { x: 102, z: 0, heading: WEST };
saika.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const F = b.flags, p = b.player, u = p.u;
  inp.quickCmd = null; inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 杭抜き中も目の前の打ち手を受け、隙には反撃する。
  // 味方への振りを受け続けたり、移動先へ向き直って構えを背けたりしない。
  inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
  let attacker = null, attackDist = 4.5;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.team === u.team || o.fleeing || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 ||
        b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const attacking = o.atk?.target === u ||
      (o.swing && !o.swing.done && o.swing.target === u) || (o.charging && o.target === u);
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (attacking && d < attackDist) { attacker = o; attackDist = d; }
  }
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  // 杭抜きの護衛は、作業する組のそばへ来た敵を迎える。
  // 自分の槍の間合いだけを探すと、数歩先で味方を襲う敵を見過ごす。
  const work = F.step === 1 ? F.stakes.find((a) => !a.pulled) : null;
  const guardEnemy = work ? b.army.nearestEnemy(u, 12, (o) =>
    !o.fleeing && !o.noTarget && !o.isStruct && o.type !== 'gun' && o.type !== 'bow' &&
    o.pos.x > -14 && Math.hypot(o.pos.x - work.workAt.x, o.pos.z - work.workAt.z) < 12 &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos)) : null;
  // 杭や竹束の作業中も、寄せた小組が味方と斬り合っていれば近くへ踏み込む。
  const bankEnemy = F.step === 1 || F.step === 4 || F.step === 5 ? b.army.nearestEnemy(u, 12, (o) =>
    o.group?.bankCommitted && !o.fleeing && !o.woundOut && !o.rearWound && !o.downed &&
    !o.noTarget && o.type !== 'gun' && o.type !== 'bow' && o.pos.x > -18 &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos)) : null;
  const e = attacker || guardEnemy || bankEnemy || strikeTarget(b, F.step === 5 ? 20 : reach);
  const d = e ? Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) : Infinity;
  // 渡河・引き退き・杭抜きでは近い敵だけ払う。西岸の射手を追わない。
  const pursue = e && (e === guardEnemy || e === bankEnemy || F.step === 5 && e.pos.x > -14);
  if (e && (attacker || d < reach || pursue)) {
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 敵の槍だけが届く所で受け続けず、反撃の間合いへ詰める。
    if (d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
    patientStrike(p, inp, e, d);
    return;
  }
  // 鉄砲・弓の避け足は共通の頭に任せ、打ち手を払ったら作業と下知へ戻る。
  if (F.step === 1 || F.step === 4 && !F.cover) {
    let nearest = null, distance = Infinity;
    // 作業兵がいる杭だけを手伝う。近い別の印で『手が足りぬ』を繰り返さない。
    for (const it of b.interacts) if (F.step === 4 ? it.id === 'cover' : work && it.id === 's' + work.i) {
      const d = Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z);
      if (d < distance) { nearest = it; distance = d; }
    }
    // 杭の印へ近づきすぎず、長押しが届いたら作業する。回避で少し離れても戻りすぎない。
    if (nearest) { if (distance >= nearest.r) goTo(p, inp, nearest.pos.x, nearest.pos.z, nearest.r - 0.3); else inp.k.add('KeyE'); }
    return;
  }
  // 脇の杭から西岸を直線で狙うと、残る杭列に当たる。東側で中央の口へ合わせてから渡る。
  if (F.step === 2) {
    goTo(p, inp, u.pos.x > -19 && Math.abs(u.pos.z) > 2 ? -16 : SHORE.x, 0, 1.5);
    return;
  }
  // 引き際も西側で中央の口へ合わせる。柵の射手を追わず、東岸まで戻る。
  if (F.step === 3) {
    goTo(p, inp, u.pos.x < -21 && Math.abs(u.pos.z) > 2 ? -24 : BACK.x, 0, 2);
    return;
  }
  goTo(p, inp, BACK.x, BACK.z, 3);
};
export { saika };
