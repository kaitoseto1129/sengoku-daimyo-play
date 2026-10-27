// 人の処理：録った人の動き（CMU のモーションキャプチャを tools/mocap.mjs でゲームの骨へ付け替えた物）を、骨の入った近くの人の土台の動きへ混ぜる。
//   待つ間：立ったまま重さを移し、周りを見る（wait・shift。人ごとにどちらか・始めの時刻を散らす）
//   刀で斬る：振りかぶり→斬り下ろし→残心（cut・cut2）。槍で突く：踏み込みの腰と脚（thrust）
//   斬る・突くは、ゲームの溜め（u.atk）と振り（u.swing）の時計に、録った動きの「振りかぶり切り」「当たり」のコマを合わせる。
//   腕と得物の握りは今のまま（humans_arms.js が後から決める）。録った動きが受け持つのは腰・背・脚・首。
//   遠い人（h.far）・馬上・倒れた者・中景の待ちの焼き（VAT）には混ぜない（中景の斬り・突きの焼きには入る）。
import * as THREE from 'three';
import { SRC } from './humans_shared.js';
import { assetBytes } from './bin_assets.js';
import { reduceMotion } from './settings.js';

export const MOCAP = { ready: false, clips: {}, mk: {}, on: !(typeof location !== 'undefined' && /[?&]mocap=0/.test(location.search)) };
let loading = null;
function decode(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'MCP1') return;
  const nb = dv.getUint16(4, true), nc = dv.getUint16(6, true);
  let o = 8;
  const nl = dv.getUint16(o, true); o += 2;
  const names = new TextDecoder().decode(buf.subarray(o, o + nl)).split(','); o += nl;
  // 土台の動きの骨の名の頭（GLTFLoader が「mixamorig:」の「:」を外した名）
  const hipsT = SRC.anims.idle.tracks.find((t) => /Hips\.quaternion$/.test(t.name));
  const pre = hipsT ? hipsT.name.slice(0, -'Hips.quaternion'.length) : 'mixamorig';
  for (let c = 0; c < nc; c++) {
    const ln = buf[o]; const name = new TextDecoder().decode(buf.subarray(o + 1, o + 1 + ln)); o += 1 + ln;
    const nf = dv.getUint16(o, true), fps = buf[o + 2], loop = buf[o + 3], mk0 = buf[o + 4] / 255, mk1 = buf[o + 5] / 255; o += 6;
    const times = new Float32Array(nf); for (let f = 0; f < nf; f++) times[f] = f / fps;
    const q = names.map(() => new Float32Array(nf * 4));
    for (let f = 0; f < nf; f++) for (let b = 0; b < nb; b++) for (let j = 0; j < 4; j++) { q[b][f * 4 + j] = dv.getInt16(o, true) / 32767; o += 2; }
    const p = new Float32Array(nf * 3);
    for (let f = 0; f < nf; f++) for (let j = 0; j < 3; j++) { p[f * 3 + j] = dv.getInt16(o, true) / 10; o += 2; }
    const tracks = names.map((nm, b) => new THREE.QuaternionKeyframeTrack(pre + nm + '.quaternion', times, q[b]));
    tracks.push(new THREE.VectorKeyframeTrack(pre + 'Hips.position', times, p));
    const clip = new THREE.AnimationClip('mc_' + name, (nf - 1) / fps, tracks);
    MOCAP.clips[name] = clip; MOCAP.mk[name] = [mk0, mk1]; MOCAP.loop = MOCAP.loop || {}; MOCAP.loop[name] = !!loop;
  }
  MOCAP.ready = true;
}
export function loadMocap() {
  if (loading || !MOCAP.on) return loading;
  loading = assetBytes('mocap').then(decode).catch((e) => { console.warn('録った動きを読めませんでした', e); });
  return loading;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
// 人ごとの動きの口（初めて要る時に作る。mixer の中で使い回す）
function act(h, name) {
  const M = h.mc;
  let a = M.act[name];
  if (!a) {
    a = M.act[name] = h.mixer.clipAction(MOCAP.clips[name]);
    if (MOCAP.loop[name]) { a.setLoop(THREE.LoopRepeat, Infinity); a.time = h.seed * a.getClip().duration; a.timeScale = 0.9 + h.seed * 0.2; }
    else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = 0; }
    a.setEffectiveWeight(0); a.play();
  }
  return a;
}
// 振る・突く一回の、録った動きの上の時刻（0〜1）と強さ。無ければ null
function strikePhase(u, w, name) {
  const [top, hit] = MOCAP.mk[name];
  const sw = u.swing;
  if (sw && sw.t < sw.dur + 0.5) {
    if (sw.t <= sw.dur) return { t: lerp(top, hit, clamp01(sw.t / Math.max(0.05, sw.dur))), k: 1 };
    // 斬り下ろしの後の深い前屈みまでは使わず、当たりの少し先で残心にとどめて戻る
    const r = clamp01((sw.t - sw.dur) / 0.5);
    return { t: lerp(hit, Math.min(1, hit + 0.14), Math.min(1, r * 1.6)), k: 1 - r * r };
  }
  const a = u.atk && !u.atk.ranged && !u.atk.bow ? u.atk : null;
  if (a && (a.dur || u.windup)) {
    const p = clamp01(1 - Math.max(0, a.t) / (a.dur || u.windup));
    return { t: lerp(top * 0.35, top, p), k: clamp01(p * 2.5) };
  }
  return null;
}
// 土台の動き（待ち・歩み・駆け足）へ混ぜる量を決め、録った動きの口の強さと時刻を置く。
//   戻り値：土台の三つの動きに掛ける割合（待ちの分 ki・全体の分 ka）
const OUT = { ki: 0, ka: 0 };
export function mocapStep(h, u, w, dt, wIdle, engaged, fallen) {
  OUT.ki = 0; OUT.ka = 0;
  // h.noMocap：比べ用に一人だけ外す。?mocap=0・__apx.nomocap（同じ遊びの中で入り切りして重さを比べる）でも外す
  if (!MOCAP.ready || (h.noMocap || window.__apx?.nomocap) && !h.mc) return OUT;
  const off = h.noMocap || window.__apx?.nomocap || fallen || h.far || u.mounted || u.climb || u.downed || u.perch || u.naka || u.dragging || reduceMotion() || (u.isPlayer && (u.fpk || 0) > 0.5);
  const M = h.mc || (h.mc = { act: {}, ki: 0, ka: 0, strike: null, idle: h.seed < 0.5 ? 'wait' : 'shift' });
  if (off && !M.ki && !M.ka) return OUT;
  const s = Math.min(1, dt * 6);
  // 斬る・突く
  let want = 0, sp = null, sn = null;
  if (!off && (w === 'sword' || w === 'spear')) {
    sn = w === 'spear' ? 'thrust' : (u.swing?.side || 1) > 0 ? 'cut' : 'cut2';
    if (w === 'spear' && u.swing && !(u.swing.kind === 'thrust' || u.swing.kind === 'charge')) sn = null;
    if (sn) { sp = strikePhase(u, w, sn); if (sp) want = sp.k * (w === 'spear' ? 0.6 : 0.6); }
  }
  if (sn && sp) {
    if (M.strike && M.strike !== sn && M.act[M.strike]) M.act[M.strike].setEffectiveWeight(0);
    M.strike = sn;
    const a = act(h, sn);
    a.time = Math.min(0.999, sp.t) * a.getClip().duration;
  }
  M.ka += (want - M.ka) * Math.min(1, dt * 14);
  if (M.ka < 0.002 && !want) M.ka = 0;
  if (M.strike && M.act[M.strike]) M.act[M.strike].setEffectiveWeight(M.ka);
  // 待つ間（中景の焼きの人 h.vatRig には混ぜない：焼いた待ちの一周と長さが合わない）
  const iw = off || h.vatRig ? 0 : engaged ? 0.4 : 0.85;
  M.ki += (iw - M.ki) * s;
  if (M.ki < 0.002 && !iw) M.ki = 0;
  const ia = M.ki > 0 || M.act[M.idle] ? act(h, M.idle) : null;
  if (ia) ia.setEffectiveWeight(wIdle * M.ki * (1 - M.ka));
  OUT.ki = M.ki; OUT.ka = M.ka;
  h.mcAtk = M.ka;
  return OUT;
}
