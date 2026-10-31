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
import { MOCAP, decodeMocap } from './mocap_data.js';

export { MOCAP };
let loading = null;
function decode(buf) {
  // 土台の動きの骨の名の頭（GLTFLoader が「mixamorig:」の「:」を外した名）
  const hipsT = SRC.anims.idle.tracks.find((t) => /Hips\.quaternion$/.test(t.name));
  decodeMocap(buf, hipsT ? hipsT.name.slice(0, -'Hips.quaternion'.length) : 'mixamorig');
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
// 一回きりの動き（斬る・突く・受ける・よろける・弓・鉄砲）の、録った動きの上の時刻（0〜1）と強さ。今どれを使うかも決める
//   よろける＞受ける＞斬る・突く＞弓・鉄砲 の順
function oneShot(h, u, w, M, dt) {
  // よろける：当たって崩れる間（受けた時・膝をつく時は除く）
  const ht = u.hit;
  if (ht && ht.res !== 'block' && ht.kind !== 'kneel' && ht.kind !== 'flinch' && ht.t < ht.dur) {
    const p = clamp01(ht.t / Math.max(0.1, ht.dur));
    return { n: 'stagger', t: p * 0.75, k: 0.6 * (1 - p * p) };
  }
  // 受ける：受けの火花（guardFlash）が新しく立った時から 0.5 秒
  const gf = u.guardFlash || 0;
  if (gf > (M.gf || 0) + 0.05) M.blkT = 0;
  M.gf = gf;
  if (M.blkT != null) {
    M.blkT += dt;
    const bt = M.blkT, nm = (u.id || 0) % 2 ? 'block' : 'block2', [, hit] = MOCAP.mk[nm];
    if (bt < 0.55) return { n: nm, t: bt < 0.15 ? lerp(0, hit, bt / 0.15) : lerp(hit, 1, (bt - 0.15) / 0.4), k: 0.55 * (bt < 0.4 ? 1 : 1 - (bt - 0.4) / 0.15) };
    M.blkT = null;
  }
  // 斬る・突く
  if (w === 'sword' || w === 'spear') {
    let sn = w === 'spear' ? 'thrust' : (u.swing?.side || 1) > 0 ? 'cut' : 'cut2';
    if (w === 'spear' && u.swing && !(u.swing.kind === 'thrust' || u.swing.kind === 'charge')) sn = null;
    const sp = sn && strikePhase(u, w, sn);
    if (sp) return { n: sn, t: sp.t, k: sp.k * 0.6 };
  }
  // 弓を引く・鉄砲を構えて撃つ（u.atk の溜めの時計に、録った「引き切り・構え切り」から「放つ」までを合わせる）
  const a = u.atk;
  if (a && (a.bow || a.ranged) && (w === 'bow' || w === 'gun') && a.dur > 0) {
    const nm = w === 'bow' ? 'bow' : 'gun', [top, hit] = MOCAP.mk[nm];
    const p = clamp01(1 - Math.max(0, a.t) / a.dur);
    return { n: nm, t: lerp(w === 'bow' ? 0 : top * 0.3, hit, p), k: 0.5 * clamp01(p * 4) };
  }
  return null;
}
// 土台の動き（待ち・歩み・駆け足）へ混ぜる量を決め、録った動きの口の強さと時刻を置く。
//   戻り値：土台の動きに掛ける割合（待ちの分 ki・歩み駆けの分 kw・全体の分 ka）
const OUT = { ki: 0, ka: 0, kw: 0 };
export function mocapStep(h, u, w, dt, wIdle, wWalk, wRun, sp, engaged, fallen) {
  OUT.ki = 0; OUT.ka = 0; OUT.kw = 0;
  // h.noMocap：比べ用に一人だけ外す。?mocap=0・__apx.nomocap（同じ遊びの中で入り切りして重さを比べる）でも外す
  if (!MOCAP.ready || (h.noMocap || window.__apx?.nomocap) && !h.mc) return OUT;
  const off = h.noMocap || window.__apx?.nomocap || fallen || h.far || u.mounted || u.climb || u.downed || u.perch || u.naka || reduceMotion() || (u.isPlayer && (u.fpk || 0) > 0.5);
  const M = h.mc || (h.mc = { act: {}, ki: 0, ka: 0, kw: 0, one: null, idle: h.seed < 0.5 ? 'wait' : 'shift' });
  if (off && !M.ki && !M.ka && !M.kw) return OUT;
  const s = Math.min(1, dt * 6);
  // 一回きりの動き
  const o = off || u.dragging ? null : oneShot(h, u, w, M, dt);
  if (o) {
    if (M.one && M.one !== o.n && M.act[M.one]) { M.act[M.one].setEffectiveWeight(0); M.ka *= 0.5; }
    M.one = o.n;
    const a = act(h, o.n);
    a.time = Math.min(0.999, o.t) * a.getClip().duration;
  }
  const want = o ? o.k : 0;
  M.ka += (want - M.ka) * Math.min(1, dt * 14);
  if (M.ka < 0.002 && !want) M.ka = 0;
  if (M.one && M.act[M.one]) M.act[M.one].setEffectiveWeight(M.ka);
  // 物を抱えて歩く・走る：大きな旗（馬印）を持つ者・負った仲間を担いで退く者
  const hold = !off && (!!u.uma || !!u.dragging) ? 0.85 : 0;
  M.kw += (hold - M.kw) * s;
  if (M.kw < 0.002 && !hold) M.kw = 0;
  if (M.kw > 0 || M.act.walkHold) {
    const aw = act(h, 'walkHold'), ar = act(h, 'runHold');
    const vw = MOCAP.mk.walkHold[0] * 10 || 1.4, vr = MOCAP.mk.runHold[0] * 10 || 4;
    aw.timeScale = Math.max(0.5, Math.min(1.6, sp / vw)); ar.timeScale = Math.max(0.7, Math.min(1.4, sp / vr));
    aw.setEffectiveWeight(wWalk * M.kw * (1 - M.ka)); ar.setEffectiveWeight(wRun * M.kw * (1 - M.ka));
  }
  // 待つ間（中景の焼きの人 h.vatRig には混ぜない：焼いた待ちの一周と長さが合わない）
  // 武将の見本（u.portrait）は始めから待つ間の混ぜ方にする（録った待ちだけで立たせたり一コマで止めたりすると前へ倒れて見えた）
  const iw = off || h.vatRig || u.uma ? 0 : engaged ? 0.4 : 0.85;
  M.ki += (iw - M.ki) * (u.portrait ? 1 : s);
  if (M.ki < 0.002 && !iw) M.ki = 0;
  const ia = M.ki > 0 || M.act[M.idle] ? act(h, M.idle) : null;
  if (ia) {
    ia.setEffectiveWeight(wIdle * M.ki * (1 - M.ka));
  }
  OUT.ki = M.ki; OUT.ka = M.ka; OUT.kw = M.kw;
  h.mcAtk = M.one === 'cut' || M.one === 'cut2' || M.one === 'thrust' ? M.ka : 0;
  h.mcHit = M.one === 'stagger' ? M.ka : 0;
  return OUT;
}
// 斬られて倒れる：army_anim.js が選んだ倒れ方（u.death.mc）を、骨の動き全部で使う（根元の傾きは army_anim.js が同じ録った動きから回す）。
//   戻り値：録った倒れを使っているか（true の間は、作った倒れの骨の形を重ねない）
export function mocapDeath(h, u) {
  const D = u.death, nm = D?.mc;
  if (!nm || !MOCAP.ready || !MOCAP.clips[nm] || h.noMocap) return false;
  const M = h.mc || (h.mc = { act: {}, ki: 0, ka: 0, kw: 0, one: null, idle: h.seed < 0.5 ? 'wait' : 'shift' });
  for (const k in M.act) if (k !== nm) M.act[k].setEffectiveWeight(0);
  M.ki = M.ka = M.kw = 0; h.mcAtk = 0; h.mcHit = 0;
  for (const k of ['idle', 'walk', 'run']) h.act[k].setEffectiveWeight(0);
  const a = act(h, nm);
  a.setEffectiveWeight(1);
  const dur = a.getClip().duration;
  a.time = Math.min(dur * 0.999, D.mcT || 0);
  return true;
}
