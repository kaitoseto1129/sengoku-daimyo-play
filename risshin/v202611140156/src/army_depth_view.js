// ======================================================================
// 軍勢の厚み・陣立ての「描く」側（army_depth_view.js。考えは army_depth.js・使い方は docs/army_depth_howto.md）
//   備ごとに軽い大軍（addDistantArmy。霧の手前は描かれず本物の兵だけ＝flat_rule.js）・大旗（幟）一本。
//   本陣は陣幕・馬印・総大将（座る／立つ／騎乗を危機の段で替える）。使番は騎馬一騎が実際に走る。援軍は土煙と旗。
//   隊列維持度：100＝槍の向きが揃う（uFieldRanks）／組み合うと槍を下ろす（uCharge）／退く・敗走は背を向ける（moveTo の back・rout）
//   大旗：整然＝真っ直ぐ／苦戦＝傾いてばらつく／後退＝隊と共に後ろへ／敗走・大将討死＝倒れる
// 本物の兵は作らない（勝ち負け・bot を変えない）。形と材質は支度の時に一度だけ作り、毎コマ new しない。
// 重さ：軽い兵の数は戦ごとに上限（携帯 900・ほか 1600）。考えは 0.5 秒に一度、描く側も考えた時だけ動かす。
// ======================================================================
import * as THREE from 'three';
import { makeDepthArmy, depthTick, lookOf, ST } from './army_depth.js';
import { nobori, jinmaku, umajirushi } from './props.js';
import { MEM_TIGHT } from './settings.js';
import { sfx } from './audio.js';

const BUDGET = MEM_TIGHT ? 900 : 1600;   // 一つの戦の軽い兵の数
const BIG_FLAGS = MEM_TIGHT ? 10 : 18;   // 大旗（幟）の数
let dustMat = null;
function dustMaterial() {
  if (dustMat) return dustMat;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(176,156,120,0.55)'); gr.addColorStop(0.6, 'rgba(160,142,110,0.22)'); gr.addColorStop(1, 'rgba(150,135,105,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  dustMat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: true });
  return dustMat;
}

// 戦の setup の後に呼ぶ。plan = { A: 表, B: 表, honjinView: { A: true, B: false } }。返す V を rt.flags.depth に置く。
export function depthSetup(rt, plan) {
  const W = rt.world;
  const V = { plan, A: makeDepthArmy({ ...plan.A, team: plan.A.team ?? 0 }), B: plan.B ? makeDepthArmy({ ...plan.B, team: plan.B.team ?? 1 }) : null,
    vis: new Map(), flags: [], honjin: [], couriers: [], dust: [], names: [], t: 0, left: BUDGET, bigLeft: BIG_FLAGS };
  const lf = W.lastFocus; W.lastFocus = rt.def.spawn ? { x: rt.def.spawn.x, z: rt.def.spawn.z } : lf;
  // plan.byMen：布陣図どおりの兵数の比で軽い兵を配る（kaito 11/9「布陣図通りの兵数」docs/fujin_all_1109.md）。
  //   両軍の描く備の名目の兵数を足し、予算に収まる一人あたりの数で割る。三万の本陣と二千の備が 15:1 に見える。書かない戦は今のまま。
  if (plan.byMen) {
    let tot = 0;
    for (const D of [V.A, V.B]) if (D) for (const s of D.sonae) if (s.o.show !== false && (!s.o.bind || tailOn(V, s))) tot += Math.max(0, s.men) * (s.o.bind ? TAIL_SHARE : 1);
    V.menK = tot > 0 ? Math.min(1 / 25, BUDGET * 0.92 / tot) : 0;   // 上限 二十五人に一人（11/10 クラウド厚み係：四十人に一人では予算の三割しか使わない戦が多かった）
  }
  try {
    for (const D of [V.A, V.B]) if (D) buildSide(rt, V, D);
  } finally { W.lastFocus = lf; }
  for (const n of V.names) rt.scene.add(n.sp);
  rt.flags.depth = V;
  return V;
}

function buildSide(rt, V, D) {
  const W = rt.world, P = D.P;
  // 前の層から先に数を配る（予算が尽きたら後ろは旗だけ）
  const order = D.sonae.slice().sort((a, b) => layerRank(a) - layerRank(b));
  for (const s of order) {
    if (s.o.show === false) continue;
    if (s.o.bind) { if (tailOn(V, s)) buildTail(rt, V, D, s); continue; }
    const want = V.menK ? Math.max(12, Math.min(480, Math.round(s.men * V.menK))) : Math.min(160, s.show.mid + s.show.far >> (s.layer === 'konida' ? 2 : 0));
    const n = Math.min(want, V.left);
    const kind = s.layer === 'honjin' ? 'honjin' : s.layer === 'hatamoto' || s.roles.騎馬 > s.men * 0.3 ? 'cavalry' : 'mixed';
    const wide = V.menK ? Math.max(10, Math.min(110, Math.sqrt(n) * 3.4)) : Math.max(10, Math.min(46, Math.sqrt(s.men) * 1.4 * 4 / D.mpu + 8)), deep = Math.max(6, wide * 0.35);
    let g = null;
    const wet = W.waterDepthAt?.(s.x, s.z) > 0.25;   // 川・池に備を立てない（考えだけ持つ）
    if (n >= 12 && !wet) {
      V.left -= n;
      g = W.addDistantArmy({ x: s.x, z: s.z, w: wide, d: deep, count: n, facing: D.facing, armor: s.armor ?? P.armor, flag: s.flag || P.flag, team: D.team,
        kind, seed: 7100 + D.team * 97 + s.i * 7, host: false, farFill: true, flagRate: P.flagRate ?? 0.18 });
      if (g?.army) g.army.noWake = true;
      if (g && s.state === ST.AWAY) g.visible = false;
    }
    let flag = null;
    if (V.bigLeft > 0 && s.layer !== 'konida' && (s.taisho || s.layer === 'honjin')) {
      V.bigLeft--;
      flag = nobori(W, s.x, s.z, s.flag || P.flag || 'tokugawa', V.plan.flagHeight ?? (s.layer === 'honjin' ? 7 : 6));
      flag.userData.base = { rx: flag.rotation.x, rz: flag.rotation.z };
      flag.visible = s.state !== ST.AWAY;
      rt.scene.add(flag);
    }
    V.vis.set(s, { g, flag, wide, last: '', lx: s.x, lz: s.z, dust: null });
    if (V.plan.sonaeNames && s.taisho && s.layer !== 'konida') V.names.push({ s, sp: nameSprite(s.taisho, D.team), w: 0 });
    if (s.from && s.arrive > 0) V.vis.get(s).dust = makeDust(rt, V, s);
  }
  // 本陣（5）：陣幕・馬印・総大将。戦がもう本陣を作っている時は honjinView を false に
  if (V.plan.honjinView?.[D === V.A ? 'A' : 'B'] !== false) {
    const hx = D.honjin.x, hz = D.honjin.z;
    rt.scene.add(jinmaku(W, hx, hz, 14, 10, 5, { mon: P.flag }));
    const uma = umajirushi(W, hx - 4, hz - 3, 0, P.uma || 'ogi');
    uma.position.y = W.heightAt(hx - 4, hz - 3); rt.scene.add(uma);
    const pose = {};
    for (const [k, list] of [['seated', [{ k: 'seated', general: 1 }]], ['standing', [{ k: 'samurai', general: 1 }]], ['mounted', [{ k: 'rider', general: 1 }]]]) {
      const people = list.map((p) => ({ ...p, x: hx, z: hz + 1, facing: D.facing }))
        .concat([[-1.6, 0.6], [1.6, 0.6], [-1, -1.4], [1, -1.4]].map(([dx, dz]) => ({ k: 'samurai', x: hx + dx, z: hz + 1 + dz, facing: D.facing })));
      const g = W.addDistantArmy({ x: hx, z: hz + 1, w: 6, d: 4, people, facing: D.facing, armor: P.armor, flag: P.flag, team: D.team, kind: 'honjin', seed: 7700 + D.team, host: false, farFill: true });
      if (g?.army) g.army.noWake = true;
      g.visible = k === 'seated';
      pose[k] = g;
    }
    V.honjin.push({ D, uma, pose, shown: 'seated' });
  }
  // 使番（29）：騎馬一騎ずつ。使い回す
  for (let i = 0; i < 3; i++) {
    const g = W.addDistantArmy({ x: D.honjin.x, z: D.honjin.z, w: 2, d: 2, people: [{ k: 'rider', x: D.honjin.x, z: D.honjin.z, facing: D.facing, flag: 1 }],
      facing: D.facing, armor: P.armor, flag: P.flag, team: D.team, kind: 'cavalry', seed: 7800 + D.team * 5 + i, host: false, farFill: true });
    if (g?.army) g.army.noWake = true;
    g.visible = false;
    V.couriers.push({ D, g, c: null });
  }
}
// 本物の隊に結んだ備の後ろの列（kaito 11/9「布陣図どおりの兵数」）：本物の兵は数十人でも、八千の備なら後ろに軽い兵の列を付ける。
//   plan.bindTail（か備の tail: true）の戦だけ。列は本物の隊の真ん中から軍の後ろへ下がった所に付いて歩き、
//   本人から 60m 内・隊が崩れた・居ない間は描かない（板の兵を近くに見せない決まり）。考え・勝ち負けには入らない。
const TAIL_SHARE = 0.7;   // 名目の兵のうち、後ろの列に回す割合（残りは本物の兵が受け持つ）
const tailOn = (V, s) => s.o.tail ?? !!V.plan.bindTail;
function buildTail(rt, V, D, s) {
  const W = rt.world;
  const want = V.menK ? Math.max(12, Math.min(420, Math.round(s.men * TAIL_SHARE * V.menK))) : Math.min(120, s.show.mid + s.show.far >> 1);
  const n = Math.min(want, V.left);
  if (n < 12) return;
  V.left -= n;
  const wide = Math.max(10, Math.min(90, Math.sqrt(n) * 3.2)), deep = Math.max(6, wide * 0.35);
  const g = W.addDistantArmy({ x: s.x, z: s.z, w: wide, d: deep, count: n, facing: D.facing, armor: s.armor ?? D.P.armor, flag: s.flag || D.P.flag, team: D.team,
    kind: 'mixed', seed: 7300 + D.team * 97 + s.i * 7, host: false, farFill: true, flagRate: D.P.flagRate ?? 0.18 });
  if (!g) return;
  if (g.army) g.army.noWake = true;
  g.visible = false;
  V.tails ||= [];
  V.tails.push({ s, g, face: D.facing, back: 10 + deep * 0.5 + (s.o.tailBack || 0), wide, lx: null, lz: null });
}
function tailTick(rt, V) {
  const p = rt.player?.u?.pos, W = rt.world;
  for (const v of V.tails) {
    const s = v.s, g = v.g;
    const bx = s.x - Math.sin(v.face) * v.back, bz = s.z - Math.cos(v.face) * v.back;
    const off = s.state === ST.AWAY || s.state === ST.ROUTING || s.gone || W.waterDepthAt?.(bx, bz) > 0.25;
    const near = p && Math.hypot(p.x - bx, p.z - bz) < 60 + v.wide * 0.5;
    const show = !off && !near;
    if (show !== g.visible) {
      g.visible = show;
      if (show) { g.reform?.(); g.moveTo?.(bx, bz, 0.1); v.lx = bx; v.lz = bz; }
      continue;
    }
    if (show && Math.hypot(bx - v.lx, bz - v.lz) > 3) {
      g.moveTo?.(bx, bz, Math.max(0.5, Math.hypot(bx - v.lx, bz - v.lz) / 1.6));
      v.lx = bx; v.lz = bz;
    }
  }
}
const layerRank = (s) => ({ sakite: 0, ichi: 1, ni: 2, yobi: 3, hatamoto: 4, honjin: 5, gozume: 6, konida: 7 })[s.layer] ?? 8;

function makeDust(rt, V, s) {
  const mat = dustMaterial(), list = [];
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Sprite(mat);
    sp.scale.set(10, 6, 1); sp.visible = false; sp.userData.ph = i / 5;
    rt.scene.add(sp); list.push(sp);
  }
  return list;
}

// 毎コマ（戦の update の後）
export function depthViewTick(rt, dt) {
  const V = rt.flags.depth;
  if (!V) return;
  V.t += dt;
  V.real ||= { A: realSense(rt, V.A), B: V.B && realSense(rt, V.B) };
  const ta = depthTick(V.A, V.t, dt, V.B, V.sense?.A || V.real.A);
  const tb = V.B ? depthTick(V.B, V.t, dt, V.A, V.sense?.B || V.real.B) : false;
  if (ta) honjinSense(rt, V.A);
  if (tb) honjinSense(rt, V.B);
  dustTick(rt, V, dt);
  if (V.names.length) namesTick(rt, V);
  if (!ta && !tb) return;
  if (V.tails) tailTick(rt, V);
  const W = rt.world, L = {};
  for (const [s, v] of V.vis) {
    const g = v.g, st = s.state;
    if (st === ST.AWAY) continue;
    if (g && !g.visible && st !== ST.AWAY) g.visible = true;
    if (v.flag && !v.flag.visible) v.flag.visible = true;
    lookOf(s, L);
    if (g) {
      const U = g.army?.U;
      if (U) { if (U.uFieldRanks) U.uFieldRanks.value = L.align >= 1 ? 1 : 0; if (U.uCharge && !g.army.tw) U.uCharge.value = L.lowered ? 1 : 0; }
      if (st === ST.ROUTING && v.last !== ST.ROUTING) g.rout?.({ hideAfter: 30 });
      else if (v.last === ST.ROUTING && st !== ST.ROUTING) { g.reform?.(); v.lx = s.hx; v.lz = s.hz; }
      if (st !== ST.ROUTING && Math.hypot(s.tx - v.lx, s.tz - v.lz) > 3) {
        const d = Math.hypot(s.tx - s.x, s.tz - s.z), v0 = Math.max(0.3, s.speed || 0.4);
        g.moveTo?.(s.tx, s.tz, Math.max(0.5, d / v0), { charge: L.lowered, back: L.back });
        v.lx = s.tx; v.lz = s.tz;
      }
    }
    if (st !== v.last && (st === ST.APPROACH || st === ST.ADVANCING && s.layer === 'gozume')) sfx('horagai', 0.35);
    v.last = st;
    // 大旗（23）
    const f = v.flag;
    if (f) {
      f.position.set(s.x, W.heightAt(s.x, s.z), s.z);
      const b = f.userData.base;
      if (s.flagPose === 'down' || s.bigFlagDown) { f.rotation.z = 1.35; f.rotation.x = b.rx; }
      else if (s.flagPose === 'scatter') { f.rotation.z = b.rz + Math.sin(V.t * 1.7 + s.i) * 0.22; f.rotation.x = b.rx + Math.cos(V.t * 1.3 + s.i) * 0.12; }
      else if (s.flagPose === 'back') { f.rotation.z = b.rz + 0.15; f.rotation.x = b.rx - 0.1; }
      else { f.rotation.z = b.rz; f.rotation.x = b.rx; }
    }
  }
  // 本陣の総大将（座る→立つ→騎乗）・馬印は段 5 で傾く
  for (const h of V.honjin) {
    const want = h.D.pose;
    if (want !== h.shown) { for (const k in h.pose) h.pose[k].visible = k === want; h.shown = want; }
    h.uma.rotation.z = h.D.crisis >= 5 ? 0.35 : 0;
  }
  // 使番：考えの側の位置へ走らせる
  for (const q of V.couriers) {
    const c = q.c && q.c.on ? q.c : (q.c = q.D.couriers.find((o) => o.on && !V.couriers.some((p) => p !== q && p.c === o)) || null);
    if (!c || !c.on) { if (q.g.visible) q.g.visible = false; q.c = null; continue; }
    if (!q.g.visible) { q.g.visible = true; q.g.reform?.(); }
    const to = c.to, d = Math.hypot(to.x - c.x, to.z - c.z);
    q.g.moveTo?.(to.x, to.z, Math.max(0.5, d / (9 / q.D.mpu)), { charge: true });
  }
}

// 備の大将の名札（plan.sonaeNames の戦だけ。kaito 11/13 K286「名札の名が布陣図と合う」）：備の旗の上に大将の名だけを出す（字は武将の名前だけ＝決まり）。
//   名は画面で約 22 点の高さに保つ（遠くても読める）。本人のまわり 40m の内は出さない（近くは本物の将の名札が受け持つ）。
//   ふだんの目の高さでは前に見える近い四つまで、上から見下ろす時（目が地面から 35m より上）は全部。丘の陰は隠れる（depthTest）。
function nameSprite(label, team) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), fs = 44;
  g.font = `bold ${fs}px sans-serif`;
  const w = Math.ceil(g.measureText(label).width) + 28;
  c.width = w; c.height = fs + 22;
  g.font = `bold ${fs}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(20,16,12,0.72)'; g.fillRect(0, 0, c.width, c.height);
  g.lineWidth = team === 0 ? 4 : 7; g.strokeStyle = team === 0 ? '#d6b05a' : '#d8402a'; g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, c.width - g.lineWidth, c.height - g.lineWidth);
  g.fillStyle = team === 0 ? '#f6e6b4' : '#ffd2c4'; g.fillText(label, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  sp.userData.aspect = c.width / c.height; sp.visible = false; sp.renderOrder = 5;
  return sp;
}
const _nv = new THREE.Vector3();
function namesTick(rt, V) {
  const cam = rt.camera, W = rt.world, me = rt.player?.u;
  if (!cam || !me) return;
  if (V.namesAt > V.t - 0.25 && V.namesAt <= V.t) return;
  V.namesAt = V.t;
  const P = cam.position, top = P.y - (W.heightAt(P.x, P.z) || 0) > 35;
  const k = 2 * Math.tan(THREE.MathUtils.degToRad((cam.fov || 55) / 2)) * 22 / Math.max(300, innerHeight || 390);
  const pe = document.getElementById('mission-goal'), pin = pe && !pe.hidden && Number.isFinite(pe._sx) && Number.isFinite(pe._sy) ? pe : null;
  cam.getWorldDirection(_nv);
  const list = [];
  for (const n of V.names) {
    const s = n.s, off = s.state === ST.AWAY || s.state === ST.ROUTING || s.gone || !s.taishoAlive;
    const gy = W.heightAt(s.x, s.z) + (V.plan.flagHeight ?? 6) + 3;
    const dx = s.x - P.x, dy = gy - P.y, dz = s.z - P.z, d = Math.hypot(dx, dy, dz);
    const front = (dx * _nv.x + dy * _nv.y + dz * _nv.z) / (d || 1) > 0.5;
    const near = Math.hypot(s.x - me.pos.x, s.z - me.pos.z) < 40;
    n.d = d; n.gy = gy;
    if (off || near || !front || (!top && d > 320)) { n.sp.visible = false; continue; }
    list.push(n);
  }
  list.sort((a, b) => a.d - b.d);
  list.forEach((n, i) => {
    const on = top || i < 4;
    n.sp.visible = on;
    if (!on) return;
    // 目の届く所（cam.far。携帯は 150m）より先の名は、同じ見え方のまま視線の上を手前へ寄せて描く（丘の陰の見え隠れはしない）
    const lim = (cam.far || 1e4) * 0.85, f = n.d > lim ? lim / n.d : 1;
    if (n.sp.material.depthTest !== (f === 1)) n.sp.material.depthTest = f === 1;
    const h = n.d * f * k;
    n.sp.position.set(P.x + (n.s.x - P.x) * f, P.y + (n.gy - P.y) * f + h * 0.5, P.z + (n.s.z - P.z) * f);
    n.sp.scale.set(h * n.sp.userData.aspect, h, 1);
    // 行き先のピンと札に重なる名は出さない（真田丸の写真で木村重成の名が「篠山の頂」の矢印に重なった）
    if (pin) {
      _nv.copy(n.sp.position).project(cam);
      const sx = (_nv.x + 1) * 0.5 * innerWidth, sy = (1 - _nv.y) * 0.5 * innerHeight, hw = h * n.sp.userData.aspect / (n.d * f * k) * 11 + 70;
      if (Math.abs(sx - pin._sx) < hw && Math.abs(sy - pin._sy) < 70) n.sp.visible = false;
    }
  });
}

// 本物の兵の様子（既定）：備のまわり 14m の敵の本物の兵。三人より多ければ組み合っている。戦の側は V.sense = { A: fn, B: fn } で替えられる
function realSense(rt, D) {
  const army = rt.army;
  if (!army?.forNear) return null;
  const C = { n: 0, best: Infinity, x: 0, z: 0, team: D.team };
  const visit = (u) => {
    if (!u.alive || u.team === C.team || u.isStruct || u.fleeing || u.civ || !u.pos) return;
    C.n++; const d = Math.hypot(u.pos.x - C.x, u.pos.z - C.z); if (d < C.best) C.best = d;
  };
  const R = { foeD: Infinity, contact: false, men: null, routed: false, x: null, z: null };
  return (s) => {
    R.men = null; R.routed = false; R.x = null; R.z = null;
    // 本物の隊に結んだ備（bind）：場所・人数・崩れは本物の隊から
    if (s.o.bind) {
      const g = s.o.bind(rt);
      if (!g || !g.units) return null;
      const n0 = (s._n0 ||= Math.max(1, g.count || g.units.length));
      let x = 0, z = 0, n = 0;
      for (const u of g.units) if (u.alive && !u.fleeing && u.pos) { x += u.pos.x; z += u.pos.z; n++; }
      if (n) { R.x = x / n; R.z = z / n; }
      R.men = s.nominal * Math.min(1, (g.count ?? n) / n0);
      R.routed = !!g.routed || n === 0;
    }
    const px = R.x ?? s.x, pz = R.z ?? s.z;
    C.n = 0; C.best = Infinity; C.x = px; C.z = pz;
    army.forNear(px, pz, 14, visit);
    R.foeD = C.best; R.contact = C.n > 3;
    return R;
  };
}
// 本陣に寄る敵の本物の兵（危機の段）。遠くまでは数えない（重さ）
function honjinSense(rt, D) {
  const army = rt.army;
  if (!army?.forNear) return;
  let best = Infinity;
  const r = Math.min(70, 300 / D.mpu), hx = D.honjin.x, hz = D.honjin.z;
  army.forNear(hx, hz, r, (u) => { if (u.alive && u.team !== D.team && !u.isStruct && !u.fleeing && !u.civ && u.pos) { const d = Math.hypot(u.pos.x - hx, u.pos.z - hz); if (d < best) best = d; } });
  D.senseHonjin = best < Infinity ? best : undefined;
}

// 援軍の土煙（8）：着く 30 秒前から、来る方の先頭に土煙が立つ
function dustTick(rt, V, dt) {
  for (const [s, v] of V.vis) {
    if (!v.dust) continue;
    const on = s.state === ST.APPROACH;
    for (const sp of v.dust) {
      if (!on) { if (sp.visible) sp.visible = false; continue; }
      sp.visible = true;
      const ph = (V.t * 0.25 + sp.userData.ph) % 1;
      const a = Math.atan2(s.hx - s.from.x, s.hz - s.from.z), fx = Math.sin(a), fz = Math.cos(a);
      const x = s.x - fx * ph * 12 + Math.sin(sp.userData.ph * 9) * 4, z = s.z - fz * ph * 12 + Math.cos(sp.userData.ph * 7) * 4;
      sp.position.set(x, rt.world.heightAt(x, z) + 1.5 + ph * 4, z);
      sp.scale.set(8 + ph * 10, 5 + ph * 6, 1);
      sp.material.opacity = 1;   // 共用の材質。薄さは絵の側で決めてある
    }
  }
}

// battles.js から（army_jindate.js の installJindate が呼ぶ）：def.depth か DEPTH_PLANS の戦に入れる。戦のファイルの setup・update の後ろに足す。
//   ?depth=0 で入れない（見比べ用）
export function installDepth(defs, plans = {}) {
  if (globalThis.location?.search?.includes('depth=0')) return;
  for (const [id, d] of Object.entries(defs)) {
    if (!d || d.__depth) continue;
    const plan = d.depth || plans[id];
    if (!plan) continue;
    d.__depth = true;
    const setup = d.setup, update = d.update;
    d.setup = function (rt, ...a) {
      const r = setup?.call(this, rt, ...a);
      try { depthSetup(rt, typeof plan === 'function' ? plan(rt) : plan); } catch (e) { console.warn('軍勢の厚み', e); }
      return r;
    };
    d.update = function (rt, dt, ...a) {
      const r = update?.call(this, rt, dt, ...a);
      try { depthViewTick(rt, dt); } catch (e) { if (!rt.flags.depthErr) { rt.flags.depthErr = 1; console.warn('軍勢の厚み', e); } }
      return r;
    };
  }
}
