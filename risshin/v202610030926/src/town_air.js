// ======================================================================
// 城下の空気（kaito 10/2「GTA・RDR2 の町の水準」二回目 ①）
// 刻が移る：朝霧 → 昼 → 夕焼け → 夜（提灯と月）。ときどき雨が降って上がる。
//   刻と天気で人の動きが変わる：夕刻から人が家へ帰り、夜は夜回りと犬だけ。雨は傘をさすか軒下へ。
//   提灯は町じゅうで一つの材質（灯りの強さだけ変える）。足もとの灯りの輪は一つの InstancedMesh。
// 人の「いる・いない」は P.away（家に入って見えない）と P.busy（'leave' 家へ向かう・'shelter' 軒下）で表す。
//   town3d.js・town_life.js・town_crowd.js の毎コマの歩かせは、この二つが立っている人を動かさない。
// ======================================================================
import * as THREE from 'three';
import { S as SETTINGS } from './settings.js';
import { setScene } from './audio.js';
import { paint, merge, MAT, MK } from './units_model.js';

export const PH_NAME = ['朝', '昼', '夕刻', '夜'];
const PH_LEN = [95, 150, 120];          // 朝・昼・夕刻の長さ（秒）。夜は町を出るまで
const PH_BARK = ['', '霧が晴れ、日が高くなった', '日が傾いてきた。西の空が赤い', '日が暮れた。辻に提灯が灯る'];

// ---- 傘（番傘）：兵の材質で作る（army.batchDraw が一つの束にまとめる） ----
let UMB_GEO = null;
export function umbrellaGeo() {
  if (UMB_GEO) return UMB_GEO;
  const top = new THREE.ConeGeometry(0.62, 0.3, 12, 1, true); top.translate(0, 2.12, 0);
  const rim = new THREE.CylinderGeometry(0.63, 0.63, 0.03, 12, 1, true); rim.translate(0, 1.98, 0);
  const cap = new THREE.CylinderGeometry(0.05, 0.07, 0.08, 6); cap.translate(0, 2.3, 0);
  const stick = new THREE.CylinderGeometry(0.014, 0.014, 1.1, 5); stick.translate(0, 1.55, 0);
  const g = [paint(top, 0xb8894a, false, MK.cloth), paint(rim, 0x3a2a1c, false, MK.wood), paint(cap, 0x2a1c12, false, MK.wood), paint(stick, 0x5a4030, false, MK.wood)];
  UMB_GEO = merge(g);
  return UMB_GEO;
}
// 人に傘を持たせる（雨の間だけ見せる）
export function giveUmbrella(P) {
  if (P.umb || !P.u || !P.u.mesh) return;
  const m = new THREE.Mesh(umbrellaGeo(), MAT);
  m.position.set(0.18, 0, 0.12); m.rotation.z = -0.08;
  m.visible = false;
  P.u.mesh.add(m);
  P.umb = m;
}

// ---- 隠す・出す（家に入る・家から出る） ----
let PK = 0;
export function park(P) {
  const u = P.u;
  if (!u) return;
  P.away = true; P.busy = null;
  if (u.mesh) u.mesh.visible = false;
  const k = P.pk ?? (P.pk = PK++);
  u.pos.x = 165 - (k % 12) * 1.6; u.pos.z = -165 + Math.floor(k / 12) * 1.6;
  if (u.mesh) { u.mesh.position.x = u.pos.x; u.mesh.position.z = u.pos.z; }
  P.g.order = 'hold'; P.g.dest = null; P.g.anchor = { x: u.pos.x, z: u.pos.z };
}
export function unpark(P, at, h) {
  const u = P.u;
  if (!u) return;
  P.away = false; P.busy = null;
  u.pos.x = at.x; u.pos.z = at.z;
  if (h != null) { u.heading = h; P.g.facing = h; }
  if (u.mesh) { u.mesh.position.x = at.x; u.mesh.position.z = at.z; u.mesh.visible = true; }
  P.g.order = 'hold'; P.g.dest = null; P.g.anchor = { x: at.x, z: at.z };
  P.waitT = 0.5 + Math.random() * 2;
}
// 近い戸口（町家の表）
function nearDoor(F, x, z) {
  let best = null, bd = 1e9;
  for (const d of F.doorPts || []) { const dd = Math.hypot(d.x - x, d.z - z); if (dd < bd) { bd = dd; best = d; } }
  return best && bd < 45 ? best : null;
}

// ======================================================================
// ctx：{ info（町の名と日）, lanterns（提灯の場所 [{x,y,z}]）, torches（夕刻に火を入れる篝火 [{x,z}]）, lampMat（提灯の材質） }
export function airSetup(rt, ctx) {
  const F = rt.flags, W = rt.world;
  const ph0 = 2 - Math.max(0, Math.min(2, rt.G.actions ?? 2));   // 朝（行いが三つ残る）・昼・夕刻
  const A = F.air = { ph: ph0, t: 0, lampK: ph0 >= 2 ? 1 : 0, lampMat: ctx.lampMat, madoMat: ctx.madoMat, torches: ctx.torches || [], torchOn: ph0 >= 2, info: ctx.info, rainK: 0, rain: null, rainDone: false, barkT: 0, dogT: 9, fluteT: 20 };
  // 雨：町に来るたびに四割ほど。来て一〜三分のうちに降り出し、一分半ほどで上がる
  A.rainAt = Math.random() < 0.4 ? 50 + Math.random() * 110 : null;
  // 足もとの灯りの輪（提灯・篝火の下の地面がほの赤い）。夕と夜だけ
  if (!W.puffTex) W.makePuffTex();
  const pts = ctx.lanterns || [];
  if (pts.length) {
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: W.puffTex, color: 0xff7a30, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
    const im = new THREE.InstancedMesh(g, mat, pts.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    pts.forEach((l, i) => { p.set(l.x, W.heightAt(l.x, l.z) + 0.05, l.z); const r = l.r || 5.4; s.set(r, 1, r); im.setMatrixAt(i, m4.compose(p, q, s)); });
    im.frustumCulled = false; im.renderOrder = 1; im.visible = false;
    rt.scene.add(im);
    A.pool = im;
  }
  // 朝は霧（来て一分ほどで晴れていく）
  if (ph0 === 0) { W.def.mist = true; W.mood = 'morning'; }
  lamps(A);
  setScene({ night: ph0 >= 2 });
  // 人の顔ぶれを今の刻に合わせる（家に入っている人は、はじめから隠す）
  presence(rt, true);
  // 傘を持つ人
  for (const P of townPeople(rt)) if (P.umbOk) giveUmbrella(P);
}

// 町にいる人を一つの並びで（町の人・暮らす人・通りの人込み）
// 町の人の一覧。毎コマ呼ばれるので、人数が変わった時だけ作り直す
export function townPeople(rt) {
  const F = rt.flags, nf = (F.folk || []).length, nn = F.life && F.life.npc ? F.life.npc.length : 0;
  const c = F._peopleCache;
  if (c && c.nf === nf && c.nn === nn && c.f === F.folk && c.l === (F.life && F.life.npc)) return c.out;
  const out = [];
  for (const P of F.folk || []) out.push(P);
  if (F.life && F.life.npc) for (const P of F.life.npc) out.push(P);
  F._peopleCache = { nf, nn, f: F.folk, l: F.life && F.life.npc, out };
  return out;
}

// その人が今の刻にいるか（P.when：いる刻の並び。無ければ一日じゅう。夜は P.night で残す人だけ）
function wants(P, ph) {
  if (P.when) return P.when.includes(ph);
  if (P.fixed) return ph < 3;                  // 市の売り手は夜は店じまい
  if (ph === 3) return !!P.night;
  if (ph === 2) return (P.i ?? 0) % 4 !== 3;
  return true;
}
function presence(rt, now) {
  const F = rt.flags, A = F.air, pu = rt.player.u;
  for (const P of townPeople(rt)) {
    if (!P.u || !P.u.alive || P.u.downed) continue;
    const w = wants(P, A.ph);
    if (!w && !P.away) {
      if (now) { park(P); continue; }
      // 家へ帰る：近い戸口へ歩き、着いたら中へ（見えなくなる）
      const d = nearDoor(F, P.u.pos.x, P.u.pos.z);
      if (!d || Math.hypot(P.u.pos.x - pu.pos.x, P.u.pos.z - pu.pos.z) > 70) { park(P); continue; }
      P.busy = 'leave'; P.leaveT = 30; P.g.order = 'move'; P.g.dest = { x: d.x, z: d.z }; P.talkT = 0; P.act = null;
      if (P.umb) P.umb.visible = A.rainK > 0.3;
    } else if (w && P.away) {
      // 家から出てくる：持ち場の始め（道順の初め）に近い戸口から
      const home = P.route ? P.route[0] : P.home || null;
      const d = home ? (nearDoor(F, home.x, home.z) || home) : nearDoor(F, P.u.pos.x, P.u.pos.z) || { x: 0, z: -60 };
      unpark(P, d);
      if (P.route) P.k = 0;
    }
  }
}

function lamps(A) {
  const k = A.lampK;
  if (A.lampMat) A.lampMat.emissiveIntensity = (A.ph >= 3 ? 1.15 : 0.85) * k;
  if (A.pool) { A.pool.visible = k > 0.02; A.pool.material.opacity = (A.ph >= 3 ? 0.45 : 0.25) * k; }
  // 障子の内の灯り（虫籠窓・格子）：夜は家々の窓明かりで通りが読める明るさに
  if (A.madoMat) A.madoMat.emissiveIntensity = (A.ph >= 3 ? 0.85 : A.ph === 2 ? 0.4 : 0) * k;
}

function lookTo(W, key, dur) {
  W.timeKey = key;
  const to = W.lookOf(key);
  // 町の夜は月と提灯で、人と家の形が読める明るさに（戦の夜より少し明るい）
  if (key === 'night') { to.hemiI *= 1.45; to.sunI *= 1.3; to.vis *= 1.3; }
  if (dur > 0 && W.currentLook) W.fade = { from: W.currentLook(), to, t: 0, dur, env: 0 };
  else { W.fade = null; W.applyLook(to); if (W.updateEnv) W.updateEnv(); }
  W.fireLightT = 0;
}
function keyOf(A) { return A.rainK > 0.3 && A.ph < 2 ? 'storm' : A.ph >= 3 ? 'night' : A.ph === 2 ? 'dusk' : 'day'; }

export function setPhase(rt, ph, quiet) {
  const F = rt.flags, A = F.air, W = rt.world;
  if (!A || ph === A.ph) return;
  A.ph = ph; A.t = 0;
  if (ph > 0) W.def.mist = false;
  W.mood = ph === 0 ? 'morning' : 'plain';
  lookTo(W, keyOf(A), 30);
  setScene({ night: ph >= 2 });
  // 夕刻から篝火に火を入れる
  if (ph >= 2 && !A.torchOn) { A.torchOn = true; for (const t of A.torches) W.addFire(t.x, t.z, { torch: true }); }
  const dl = document.getElementById('dateline');
  if (dl) dl.textContent = `${(A.info && A.info.when) || ''}　${PH_NAME[ph]}`;
  rt.flags.tod = ph >= 2 ? 0 : ph === 1 ? 1 : 2;
  if (!quiet && PH_BARK[ph]) rt.bark(PH_BARK[ph]);
  presence(rt, false);
}
// 札の画面から戻った時：行いを使って刻が進んでいれば、空を移ろわせる
export function airResume(rt) {
  const A = rt.flags.air;
  if (!A) return;
  const base = 2 - Math.max(0, Math.min(2, rt.G.actions ?? 2));
  if (base > A.ph) setPhase(rt, base);
}

function startRain(rt) {
  const F = rt.flags, A = F.air, W = rt.world;
  A.rain = { t: 0, dur: 70 + Math.random() * 40 };
  W.setRainTarget(SETTINGS.quality === 'low' ? 0.6 : 0.75);
  A.rainK = 1;
  if (A.ph < 2) lookTo(W, 'storm', 14);
  rt.bark('雨が降ってきた');
  // 傘を持つ人はさす。持たない人は軒下へ走る
  const pu = rt.player.u;
  let said = false;
  for (const P of townPeople(rt)) {
    if (P.away || !P.u || !P.u.alive || P.busy === 'leave' || P.fixed) continue;
    if (P.umb) { P.umb.visible = true; continue; }
    if (P.act === 'hammer') continue;
    const d = nearDoor(F, P.u.pos.x, P.u.pos.z);
    if (!d) continue;
    P.busy = 'shelter'; P.g.order = 'move'; P.g.dest = { x: d.x, z: d.z }; P.talkT = 0; P.act = null; P.shelterH = d.h;
    if (!said && Math.hypot(P.u.pos.x - pu.pos.x, P.u.pos.z - pu.pos.z) < 18) { said = true; rt.say(P.u.name || '町の人', '降ってきおった！　軒下へ、軒下へ', 2.6); }
  }
}
function stopRain(rt) {
  const F = rt.flags, A = F.air, W = rt.world;
  A.rain = null; A.rainK = 0; A.rainDone = true;
  W.setRainTarget(0);
  lookTo(W, A.ph < 2 ? 'after' : keyOf(A), 25);
  A.afterT = A.ph < 2 ? 40 : 0;
  rt.bark('雨が上がった');
  for (const P of townPeople(rt)) {
    if (P.umb) P.umb.visible = false;
    if (P.busy === 'shelter') { P.busy = null; P.g.order = 'hold'; P.g.dest = null; P.g.anchor = { x: P.u.pos.x, z: P.u.pos.z }; P.waitT = 1 + Math.random() * 3; }
  }
}
// 町に来てすぐ見たい時（確かめ）：rt.flags.air.force(rt, '雨' | 刻の番号)
function force(rt, what) {
  const A = rt.flags.air;
  if (what === '雨') { if (!A.rain) startRain(rt); return; }
  if (typeof what === 'number') setPhase(rt, Math.max(0, Math.min(3, what)));
}

export function airTick(rt, dt) {
  const F = rt.flags, A = F.air, W = rt.world;
  if (!A) return;
  A.force = force;
  A.t += dt;
  if (A.ph < 3 && A.t > PH_LEN[A.ph]) setPhase(rt, A.ph + 1);
  // 雨上がりの薄曇りから、元の空へ
  if (A.afterT > 0 && (A.afterT -= dt) <= 0 && !A.rain) lookTo(W, keyOf(A), 30);
  // 雨
  if (!A.rain && !A.rainDone && A.rainAt != null && rt.t > A.rainAt) startRain(rt);
  if (A.rain && (A.rain.t += dt) > A.rain.dur) stopRain(rt);
  // 提灯：夕刻からゆっくり灯る
  const want = A.ph >= 2 ? 1 : 0;
  if (Math.abs(A.lampK - want) > 0.001) { A.lampK += Math.sign(want - A.lampK) * Math.min(Math.abs(want - A.lampK), dt / 12); lamps(A); }
  // 家へ帰る人・軒下の人
  for (const P of townPeople(rt)) {
    if (!P.busy || !P.u || !P.u.alive) continue;
    const u = P.u, g = P.g;
    if (P.busy === 'leave') {
      P.leaveT -= dt;
      if (!g.dest || Math.hypot(u.pos.x - g.dest.x, u.pos.z - g.dest.z) < 1.1 || P.leaveT <= 0) park(P);
    } else if (P.busy === 'shelter' && g.order === 'move' && g.dest && Math.hypot(u.pos.x - g.dest.x, u.pos.z - g.dest.z) < 1.0) {
      g.order = 'hold'; g.anchor = { x: g.dest.x, z: g.dest.z }; g.dest = null;
      if (P.shelterH != null) { u.heading = P.shelterH; g.facing = P.shelterH; }
    }
  }
  // 夜：遠くで犬が吠える
  if (A.ph >= 3) {
    A.dogT -= dt;
    if (A.dogT <= 0) { A.dogT = 14 + Math.random() * 16; const p = rt.player.u.pos, a = Math.random() * 6.28; rt.army.play('dog', { x: p.x + Math.sin(a) * 45, z: p.z + Math.cos(a) * 45 }, 0.35); }
    // 夜：遠い笛の音（誰が吹くでもなく、風に乗って届く）
    A.fluteT -= dt;
    if (A.fluteT <= 0 && !A.rain) { A.fluteT = 35 + Math.random() * 35; const p = rt.player.u.pos, a = Math.random() * 6.28; rt.army.play('flute', { x: p.x + Math.sin(a) * 70, z: p.z + Math.cos(a) * 70 }, 0.18); }
  }
}
