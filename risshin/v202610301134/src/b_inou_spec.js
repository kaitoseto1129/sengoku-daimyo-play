// ======================================================================
// 稲生の戦い（kaito 10/29 夜の仕様 docs/inou_spec_1029.md）
// 南北300m×東西150m。南端から北の土手の林美作守へ。正面の道と葦原の脇道。
// 行き先は美作守の高い赤い旗印だけ（ピン・矢印・小さな地図は出さない）。
// 雑兵は北へ退く槍兵（8mで振り向く）と立ち止まる弓兵。近づいた区画から出し、同時に十五まで。
// 地面・田・草・甲冑の見た目は前の稲生（b_inou.js）の world を使う。座標：南が +z、北が −z。
// ======================================================================
import * as THREE from 'three';
import { inou as OLD } from './b_inou.js';
import { enemyGroup, allyGroup } from './bhelp.js';
import { nobori } from './props.js';
import { victoryMoment } from './victory_moment.js';

const XW = 74, ZS = 146, ZN = -146;           // 見えない壁（東西 ±74・南北 ±146）
const START = { x: 12, z: 136 };
const BOSS = { x: 8, z: -134 };               // 北の土手の上
const FLAG = { x: 8, z: -139 };
const FRONT_X = 12;                            // 正面の道
const SIDE = [[-40, 150], [-46, 80], [-36, 0], [-44, -80], [-30, -122], [0, -132]];   // 葦原の脇道
const sideX = (z) => { for (let i = 0; i < SIDE.length - 1; i++) { const [ax, az] = SIDE[i], [bx, bz] = SIDE[i + 1]; if (z <= az && z >= bz) return ax + (bx - ax) * (az - z) / (az - bz); } return SIDE[SIDE.length - 1][0]; };
const LIMIT = 15;                              // 画面に出す敵の上限
const TURN = 8;                                // 槍兵が振り向く近さ
const BOW_RANGE = 30;
const BOSS_RANGE = 20;
const BOSS_HP = 150;                           // 美作守の命（仮。遊んで直す）
// 雑兵の装い：黒・茶・柿渋（青にしない）。旗指物は赤でない物
const ZAKO = { armor: 0x2e2822, hatColor: 0x1c1916, lace: 0x6a4a30, cloth: 0x7a5236, flag: 'kari', flagShape: 1 };
const dress = (list) => list.map((s) => ({ ...s, o: { ...ZAKO, ...(s.o || {}) } }));
// 区画：z は区画の中ほど。出すのは主人公がこの z の 75m 内に来た時
const SECTIONS = [
  ...[100, 70, 40, 10, -20, -50].map((z, i) => ({ id: 'f' + i, kind: 'spear', n: 3, x: FRONT_X + (i % 2 ? 3 : -3), z })),
  ...[80, 30, -20, -70].map((z, i) => ({ id: 's' + i, kind: 'spear', n: 2, x: sideX(z) + 2, z })),
  { id: 'b0', kind: 'bow', n: 2, x: FRONT_X + 18, z: -62 }, { id: 'b1', kind: 'bow', n: 2, x: FRONT_X - 14, z: -112 },
  { id: 'b2', kind: 'bow', n: 2, x: sideX(-30) - 12, z: -30 },
];

// 北の土手：z −118 から −132 にかけて二メートル半ほど上がる
const bank = (z) => { const k = Math.max(0, Math.min(1, (-118 - z) / 14)); return k * k * (3 - 2 * k) * 2.6; };
const baseH = OLD.world.height;
const height = (x, z) => baseH(x, z) + bank(z);

// 葦原：脇道の両側に背の高い葦（一つの InstancedMesh）
function reeds(rt) {
  const W = rt.world, blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.05, 0, 0, 0.05, 0, 0, 0.02, 2.5, 0.06, -0.05, 0, 0, 0.02, 2.5, 0.06, -0.03, 1.2, 0.02], 3));
  blade.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8150, roughness: 0.95, side: THREE.DoubleSide });
  const pts = [];
  let s = 1556;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let z = 128; z > -116; z -= 0.55) {
    const cx = sideX(z);
    for (let k = 0; k < 6; k++) {
      const off = (2.2 + rnd() * 10) * (rnd() < 0.5 ? -1 : 1);
      pts.push([cx + off, z + (rnd() - 0.5) * 0.5, rnd()]);
    }
  }
  const m = new THREE.InstancedMesh(blade, mat, pts.length);
  const o = new THREE.Object3D(), c = new THREE.Color();
  pts.forEach(([x, z, r], i) => {
    o.position.set(x, W.heightAt(x, z) - 0.05, z);
    o.rotation.set((r - 0.5) * 0.25, r * Math.PI * 2, (rnd() - 0.5) * 0.25);
    const sc = 0.75 + r * 0.55; o.scale.set(1, sc, 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    c.setRGB(0.5 + r * 0.12, 0.47 + r * 0.1, 0.27 + r * 0.05); m.setColorAt(i, c);
  });
  m.frustumCulled = false; m.receiveShadow = true;
  rt.scene.add(m);
}

// どこからでも見える美作守の旗印（赤い大幟。霧に消されない・光に沈まない）。
// 写す距離は 150m までなので、遠い間は同じ見かけの大きさのまま 135m の所へ寄せて立てる
function bossFlag(rt) {
  const f = nobori(rt.world, 0, 0, 'aka_kari', 9);
  f.traverse((o) => {
    if (o.material) { const m = o.material; o.material = new THREE.MeshBasicMaterial({ map: m.map || null, color: m.map ? 0xffffff : 0x3a2a1a, fog: false, side: THREE.DoubleSide, transparent: !!m.transparent, alphaTest: m.alphaTest || 0 }); }
    o.frustumCulled = false;
  });
  f.userData.base = { x: f.scale.x * 4.5, y: f.scale.y * 2.2 };
  rt.scene.add(f);
  rt.flags.flag = f;
}
function flagTick(rt) {
  const f = rt.flags.flag, c = rt.camera;
  if (!f || !c) return;
  const dx = FLAG.x - c.position.x, dz = FLAG.z - c.position.z, d = Math.hypot(dx, dz) || 1, R = 135;
  const k = d > R ? R / d : 1, x = c.position.x + dx * k, z = c.position.z + dz * k;
  const W = rt.world, y0 = W.heightAt(FLAG.x, FLAG.z);
  f.position.set(x, c.position.y + (y0 - c.position.y) * k, z);
  f.scale.set(f.userData.base.x * k, f.userData.base.y * k, f.userData.base.x * k);
}

const aliveFoes = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && u.team === 1 && !u.civ ? 1 : 0), 0);

const inou_spec = {
  missionStyle: 'lesson',
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,   // 共通の物見の足軽を足さない（敵は十五まで）
  enemyTactics: false,       // 敵の動きはこの定義が決める（退く槍・立つ弓）
  noFieldMap: true,
  noMiniMap: true,           // 小さな地図も出さない（行き先は赤い旗印だけ）
  hideArmyPeek: true,
  hideGuideSteps: true,
  missionSingleLine: true,
  noPlayerFoot: true,
  nearbyAllySignLimit: 0,
  foeMarks: true,
  enemyTriangleSigns: true,
  foeMarkRange: 30,
  missionPin: () => null,       // 行き先は旗印だけ
  missionPinCaption: '',
  learningFight: true,
  playerTaken: 0.6,
  playerRegen: 0.02,
  pacingWait: () => true,
  botDefendsFort: true,      // bot：矢を避けて物陰へ下がらず、赤い旗へ進む
  autoTargetCamera: true,
  steadyMeleeCamera: true,
  closeCombatAssist: true,
  noWinCrane: true,
  compactIntro: true,
  introText: () => '柴田勝家の軍勢が崩れて退いた。退く信勝方の殿（しんがり）を務める林美作守（はやしみまさかのかみ）を討て。',
  minutes: 8,
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  world: {
    ...OLD.world,
    height,
    paths: [{ pts: [[FRONT_X, 160], [FRONT_X, -118], [BOSS.x, -134]], w: 4 }, { pts: SIDE, w: 2 }],
    groves: (OLD.world.groves || []).filter((g) => Math.abs(g.x) > 56 && Math.abs(g.z) < 140),
    clear: (x, z) => Math.abs(x) < 80 && Math.abs(z) < 150,
    fleeOut: (x, z, team) => team === 1 && z < -150,
    armyFlagKinds: undefined,
  },

  setup(rt) {
    const F = rt.flags;
    F.sec = {}; F.groups = []; F.holdPlayer = true;
    reeds(rt);
    bossFlag(rt);
    // 組頭（倒されない）と味方の足軽四人
    F.kumi = allyGroup(rt, { name: '組頭', anchor: { x: START.x + 2, z: START.z }, facing: Math.PI, aggro: 6, speed: 4.2, order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '組頭', invuln: true } }]);
    F.kumiU = F.kumi.units[0];
    F.allies = allyGroup(rt, { name: '味方の足軽', anchor: { x: START.x, z: START.z + 4 }, facing: Math.PI, aggro: 9, speed: 3.6, order: 'move', dest: { x: FRONT_X, z: -100 } },
      [{ type: 'ashigaru', n: 4 }]);
    F.allies.ai = true;
    rt.obj('main', '林美作守を討て', 'main');
    // 組頭の三つの台詞（字幕）。終わるまで動けない
    const L = [['柴田の軍勢は崩れたぞ！', 0.6], ['林美作の殿がまだ踏みとどまっておる。あの赤い旗じゃ！', 3.4], ['討ち取って手柄にせい、行けっ！', 7.2]];
    for (const [s, t] of L) rt.after(t, () => rt.say('組頭', s, 2.8));
    rt.after(9.6, () => { F.holdPlayer = false; });
  },

  spawnSection(rt, S) {
    const F = rt.flags;
    const g = enemyGroup(rt, { faction: 'nobukatsu', name: S.kind === 'bow' ? '林勢の弓' : '林勢の槍', anchor: { x: S.x, z: S.z }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 3,
      noRout: true, formation: 'line', morale: 70, dmgMult: 0.55,
      ...(S.kind === 'bow' ? { order: 'hold', aggro: 0, fire: false, fixed: true } : { order: 'retreat', dest: { x: S.x, z: -150 }, speed: 0.6, aggro: 0, fire: false }) },
    dress([{ type: S.kind === 'bow' ? 'bow' : 'ashigaru', n: S.n }]));
    g.secKind = S.kind;
    F.groups.push(g);
  },

  spawnBoss(rt) {
    const F = rt.flags;
    // 大将は一人の備（列の後ろへ下がらない）。取り巻きの槍五人は前に別の備で
    F.bossG = enemyGroup(rt, { faction: 'nobukatsu', name: '林美作守', anchor: { x: BOSS.x, z: BOSS.z }, facing: 0, width: 1, noRout: true, noAI: true,
      order: 'hold', aggro: 0, morale: 100, dmgMult: 0.6, fixed: true },
    dress([{ type: 'busho', n: 1, o: { name: '林美作守', hat: 'kabuto_m', flag: 'aka_kari' } }]));
    F.guardG = enemyGroup(rt, { faction: 'nobukatsu', name: '林美作守の旗本', anchor: { x: BOSS.x, z: BOSS.z + 4 }, facing: 0, width: 5, noRout: true, noAI: true,
      formation: 'line', order: 'hold', aggro: 0, morale: 90, dmgMult: 0.55, fixed: true },
    dress([{ type: 'ashigaru', n: 5 }]));
    const b = F.bossU = F.bossG.units[0];
    const put = (u, x, z) => { u.pos.x = x; u.pos.z = z; u.pos.y = rt.world.heightAt(x, z); };
    put(b, BOSS.x, BOSS.z);
    F.guardG.units.forEach((u, i) => put(u, BOSS.x + (i - 2) * 2.4, BOSS.z + 3.5));
    // 四十秒〜一分で倒せる強さ（仮）
    b.maxHp = b.hp = BOSS_HP;
  },

  update(rt, dt) {
    const F = rt.flags;
    flagTick(rt);
    if (F.ending) return;
    const P = rt.player.u;
    // 見えない壁（時間切れで逃げる者は外へ出す）
    if (!rt.timeLimit?.up) for (const u of rt.army.units) {
      if (!u.alive || u.gone) continue;
      if (u.pos.x > XW) u.pos.x = XW; else if (u.pos.x < -XW) u.pos.x = -XW;
      if (u.pos.z > ZS) u.pos.z = ZS; else if (u.pos.z < ZN) u.pos.z = ZN;
    }
    // 組頭は主人公の脇に付いて北へ
    if ((F.kumiT = (F.kumiT || 0) - dt) <= 0) {
      F.kumiT = 0.5;
      const g = F.kumi;
      if (Math.hypot(F.kumiU.pos.x - P.pos.x, F.kumiU.pos.z - P.pos.z) > 4) { g.order = 'move'; g.dest = { x: P.pos.x + 2.5, z: P.pos.z + 1.5 }; }
      else g.order = 'hold';
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    // 区画を近い順に出す（同時に十五まで。美作守の備は先に枠を取る）
    let n = aliveFoes(rt);
    if (!F.bossG && P.pos.z < -40) { this.spawnBoss(rt); n += 6; F.groups.push(F.guardG); F.guardG.secKind = 'guard'; }
    for (const S of SECTIONS) {
      if (F.sec[S.id] || Math.abs(P.pos.z - S.z) > 75 || S.z > P.pos.z + 30) continue;
      if (n + S.n > LIMIT - (F.bossG ? 0 : 6)) break;
      F.sec[S.id] = true; this.spawnSection(rt, S); n += S.n;
    }
    // 槍兵：8m で振り向いて戦う。退き切った者は消す。弓兵：30m で射る
    for (const g of F.groups) {
      let near = Infinity;
      for (const u of g.units) {
        if (!u.alive || u.gone) continue;
        if (g.order === 'retreat' && u.pos.z < -120) { rt.army.despawn(u); continue; }
        near = Math.min(near, Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z));
      }
      if (g.secKind === 'bow') { const on = near < BOW_RANGE; g.fire = on; g.aggro = on ? BOW_RANGE : 0; }
      else if (g.order === 'retreat' && near < TURN) { g.order = 'attack'; g.focus = P; g.aggro = 10; g.speed = 3; }
    }
    // 美作守と取り巻き：20m で戦い始める
    const B = F.bossU;
    if (B && !F.bossOn && Math.hypot(B.pos.x - P.pos.x, B.pos.z - P.pos.z) < BOSS_RANGE) {
      F.bossOn = true;
      for (const g of [F.bossG, F.guardG]) { g.noAI = false; g.order = 'hold'; g.aggro = 14; }   // 土手を離れず、近づいた者と戦う
    }
    // 殿は土手から離れない（追っても 14m で戻る）
    if (B?.alive && F.bossOn && !rt.timeLimit?.up) {
      const g = F.bossG, d = Math.hypot(B.pos.x - BOSS.x, B.pos.z - BOSS.z);
      if (d > 14 && g.order !== 'move') { g.order = 'move'; g.dest = { x: BOSS.x, z: BOSS.z }; g.speed = 3; B.target = null; B.atk = null; }
      else if (d < 3 && g.order === 'move') g.order = 'hold';
    }
    if (B && !B.alive) this.win(rt);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    rt.say('組頭', '林美作守、討ち取ったり！', 3);
    victoryMoment(rt, '勝');
    rt.finish({ scriptedEnd: true }, 3.5);
  },

  // bot：近い敵を突き、いなければ赤い旗へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const prev = p.botStrikeFoe;
    const e = prev?.alive && ok(prev) && p.botStrikeUntil > p.time && Math.hypot(prev.pos.x - u.pos.x, prev.pos.z - u.pos.z) < 2.8 ? prev : (F.bossU?.alive && ok(F.bossU) && Math.hypot(F.bossU.pos.x - u.pos.x, F.bossU.pos.z - u.pos.z) < 6 ? F.bossU : b.army.nearestEnemy(u, F.bossU?.alive || b.t > 200 ? 4 : 14, ok));
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d);
      return;
    }
    inp.guardHold = false;
    const B = F.bossU?.alive ? F.bossU.pos : BOSS;
    goTo(p, inp, B.x, B.z + 2, 2);
  },
};
inou_spec.history = OLD.history;
inou_spec.timeslip = OLD.timeslip;

export { inou_spec };
