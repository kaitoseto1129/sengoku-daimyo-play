// 録った人の動き（tools/mocap.mjs が src/bin/mocap.bin に詰めた物）の置き場と読み解き。
//   人の骨の動き（AnimationClip）と、倒れの根元の回り（tilt）を持つ。兵の処理（army_anim.js）と人の処理（humans_mocap.js）の両方が読むので、
//   ほかの組み立ての部品を import しない（輪の import を作らない）。
import * as THREE from 'three';

export const MOCAP = { ready: false, clips: {}, mk: {}, loop: {}, tilt: {}, fps: {}, on: !(typeof location !== 'undefined' && /[?&]mocap=0/.test(location.search)) };
// buf：mocap.bin の bytes。pre：骨の動きの線の名の頭（GLTFLoader が「mixamorig:」の「:」を外した名）
export function decodeMocap(buf, pre) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'MCP1') return;
  const nb = dv.getUint16(4, true), nc = dv.getUint16(6, true);
  let o = 8;
  const nl = dv.getUint16(o, true); o += 2;
  const td = new TextDecoder();
  const names = td.decode(buf.subarray(o, o + nl)).split(','); o += nl;
  for (let c = 0; c < nc; c++) {
    const ln = buf[o]; const name = td.decode(buf.subarray(o + 1, o + 1 + ln)); o += 1 + ln;
    const nf = dv.getUint16(o, true), fps = buf[o + 2], fl = buf[o + 3], mk0 = buf[o + 4] / 255, mk1 = buf[o + 5] / 255; o += 6;
    const times = new Float32Array(nf); for (let f = 0; f < nf; f++) times[f] = f / fps;
    const q = names.map(() => new Float32Array(nf * 4));
    for (let f = 0; f < nf; f++) for (let b = 0; b < nb; b++) for (let j = 0; j < 4; j++) { q[b][f * 4 + j] = dv.getInt16(o, true) / 32767; o += 2; }
    const p = new Float32Array(nf * 3);
    for (let f = 0; f < nf; f++) for (let j = 0; j < 3; j++) { p[f * 3 + j] = dv.getInt16(o, true) / 10; o += 2; }
    if (fl & 2) {
      const T = new Float32Array(nf * 4);
      for (let k = 0; k < nf * 4; k++) { T[k] = dv.getInt16(o, true) / 32767; o += 2; }
      MOCAP.tilt[name] = T;
    }
    const tracks = names.map((nm, b) => new THREE.QuaternionKeyframeTrack(pre + nm + '.quaternion', times, q[b]));
    tracks.push(new THREE.VectorKeyframeTrack(pre + 'Hips.position', times, p));
    MOCAP.clips[name] = new THREE.AnimationClip('mc_' + name, (nf - 1) / fps, tracks);
    MOCAP.mk[name] = [mk0, mk1]; MOCAP.loop[name] = !!(fl & 1); MOCAP.fps[name] = fps;
  }
  MOCAP.ready = true;
}
const _a = new THREE.Quaternion(), _b = new THREE.Quaternion();
// 倒れの根元の回り（t 秒目）を out へ。ゲームの骨の場面の座標（兵の根元は z が裏返るので、呼ぶ側で直す）。戻り値は傾きの角
export function tiltAt(name, t, out) {
  const T = MOCAP.tilt[name];
  if (!T) { out.identity(); return 0; }
  const n = T.length / 4, x = Math.max(0, Math.min(n - 1, t * MOCAP.fps[name])), i = Math.min(n - 2, Math.floor(x)), f = x - i;
  _a.set(T[i * 4], T[i * 4 + 1], T[i * 4 + 2], T[i * 4 + 3]);
  _b.set(T[i * 4 + 4], T[i * 4 + 5], T[i * 4 + 6], T[i * 4 + 7]);
  out.slerpQuaternions(_a, _b, f).normalize();
  return 2 * Math.acos(Math.min(1, Math.abs(out.w)));
}
// 倒れ方の名を選ぶ（倒れの種類と兵の番号で散らす）。録った倒れの無い時は null
const BACK = ['dieB', 'dieB2', 'dieBm'], FWD = ['dieF', 'dieF2', 'dieFm'];
export function pickDeath(kind, id) {
  if (!MOCAP.ready) return null;
  const L = kind === 'back' ? BACK : FWD;
  const nm = L[(id >>> 0) % L.length];
  return MOCAP.tilt[nm] ? nm : null;
}
