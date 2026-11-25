// L1【難】頼む文2（11/24 クラウド Sanae）：山崎の戦後の静けさ。勝ち鬨の後の余韻（battle_aftermath.js の三十秒・歩ける）に、山崎だけ
//   ①雨が上がる（小雨 0.3→0）②雨雲が割れて西の空が夕焼けに移ろう（十二秒）③明智の陣の跡（倒れた陣幕・燃え尽きかけの篝火と細い煙・踏まれた桔梗の幕の切れ）を足す。
//   字は出さない。兵は足さない（K285）。形と材質は一度だけ作り、戦後の片付け（rt._afterDebris）で外す。
//   出所：『兼見卿記』天正十年六月十三日条「雨」（戦は申の刻・雨中）。旧暦六月十三日＝七月二日、日の入りは七時過ぎ（夕焼けは追い討ちの後の暮れ方）。
import * as THREE from 'three';
import { kagaribi } from '../props.js';
import { jinmakuTexture } from '../textures.js';

// 雨上がりの夕：共通の夕（world_weather.js の dusk）より雲を残し（割れた雨雲）、地平の朱を強める。見通しは雨の霞が晴れて伸びる
const AFTER_RAIN_DUSK = { cover: 0.58, cloud: 0.42, vis: 420, glowK: 0.78, glow: 0xff8f5c, sunI: 1.35, hemiI: 0.95 };

let _P = null;
function parts() {
  if (_P) return _P;
  const tex = jinmakuTexture('akechi');
  _P = {
    pole: new THREE.CylinderGeometry(0.045, 0.055, 2.4, 6),
    cloth: new THREE.PlaneGeometry(3.6, 1.5, 8, 3),
    rag: new THREE.PlaneGeometry(1.1, 0.8),
    wood: new THREE.MeshStandardMaterial({ color: 0x3a2c1f, roughness: 0.92 }),
    maku: new THREE.MeshStandardMaterial({ map: tex, color: 0xb9b2a2, roughness: 1, side: THREE.DoubleSide }),
    ash: new THREE.MeshStandardMaterial({ color: 0x2a2623, roughness: 1 }),
    ashGeo: new THREE.CircleGeometry(0.9, 10),
  };
  // 倒れた幕：泥に落ちた側が波打つ（頂点は一度だけ）
  const p = _P.cloth.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x * 2.1) * 0.12 + (y < 0 ? Math.sin(x * 4.3 + 1) * 0.06 : 0)); }
  _P.cloth.computeVertexNormals();
  return _P;
}

// 余韻に入った時に一度（battle_aftermath.js の aftermathStart から def.onAftermath で呼ぶ）
export function yamazakiQuiet(rt) {
  const W = rt.world, F = rt.flags || {};
  if (F._quiet) return;
  F._quiet = true;
  // ①雨が上がる（world_update の移ろいで五秒ほどで細り、止む）
  try { W.setRainTarget?.(0); } catch (e) { /* 雨はそのまま */ }
  // ②雨雲が割れて夕焼けへ。def の duskLight（戦の中の雨雲の暮れ）は、この一回の setTime の間だけ雨上がりの夕に替える
  try {
    const dl = W.def.duskLight;
    W.def.duskLight = AFTER_RAIN_DUSK;
    W.dayClock = null;
    W.setTime('dusk');
    W.def.duskLight = dl;
    if (W.fade) W.fade.dur = 12;   // 三十秒の余韻の内に移ろい切る（共通の夕への移ろいは九十秒）
  } catch (e) { /* 空はそのまま */ }
  if (rt.aftermathSound) { rt.aftermathSound.rain = false; rt.aftermathSound.night = true; }
  // ③陣の跡：本人の前、九〜十六m の所（足もとを塞がない）
  const P = rt.player.u, h = (rt.player.yaw ?? P.heading ?? 0);
  const at = (d, side) => { const x = P.pos.x + Math.sin(h) * d + Math.cos(h) * side, z = P.pos.z + Math.cos(h) * d - Math.sin(h) * side; return [x, W.heightAt(x, z), z]; };
  const D = parts(), out = (rt._afterDebris = rt._afterDebris || []);
  const add = (o) => { rt.scene.add(o); out.push(o); return o; };
  // 倒れた陣幕：一本の柱は傾いて立ち、一本は倒れ、幕は片端だけ吊られて泥に落ちる
  {
    const [x, y, z] = at(11, -3.5), g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = h + 0.35;
    const a = new THREE.Mesh(D.pole, D.wood); a.position.set(-1.8, 1.05, 0); a.rotation.z = 0.32; g.add(a);
    const b = new THREE.Mesh(D.pole, D.wood); b.position.set(2.0, 0.06, 0.2); b.rotation.z = Math.PI / 2 - 0.05; g.add(b);
    const c = new THREE.Mesh(D.cloth, D.maku); c.position.set(0.1, 0.28, 0.5); c.rotation.set(-1.38, 0, -0.12); g.add(c);
    add(g);
  }
  // 踏まれた幕の切れ（桔梗の白）
  {
    const [x, y, z] = at(8.5, 2.8), r = new THREE.Mesh(D.rag, D.maku);
    r.position.set(x, y + 0.03, z); r.rotation.set(-Math.PI / 2 + 0.04, 0, h + 1.2); add(r);
  }
  // 燃え尽きかけの篝火：灰の輪と、細い煙の柱一本（既存の煙を使い回す）
  {
    const [x, y, z] = at(14, 1.2);
    try { add(kagaribi(W, x, z)); } catch (e) { /* 篝火なしでも進む */ }
    const ash = new THREE.Mesh(D.ashGeo, D.ash); ash.position.set(x + 0.4, y + 0.02, z + 0.3); ash.rotation.x = -Math.PI / 2; add(ash);
    try { W.addSmokeColumn?.(x, y + 1.6, z, { size: 0.35 }); } catch (e) { /* 煙なし */ }
  }
}
