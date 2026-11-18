// 槍の穂先が向かう先（kaito 11/3 AP7）：突けば当たる相手の足元に、細い光の輪を一つ置く。字は足さない。
// 当たる判定は strike() と同じ enemiesInArc。輪は一つを使い回し、毎コマ new しない。
import * as THREE from 'three';
import { groundAt } from './floors.js';
import { S } from './settings.js';

// 場面ごとに一つ。弱く持つ（場面を強く持つと、閉じた戦の場面が丸ごと記憶に残った。11/17 記憶の測り）
const RINGS = new WeakMap();
function ensure(rt) {
  let ring = RINGS.get(rt.scene);
  if (ring) return ring;
  const g = new THREE.RingGeometry(0.62, 0.74, 40);
  g.rotateX(-Math.PI / 2);
  // 11/8 critic60 賤ヶ岳（五2）：白い輪が自分の足元の意味の分からない印に見えた。敵の▼と同じ赤にして、突ける相手の印と分かるように
  ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe0261a, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, fog: false }));
  ring.renderOrder = 998; ring.frustumCulled = false; ring.visible = false;
  // def.spearRingDepth（根白坂 11/18 持ち主 ⑥ 120秒・270秒 874×402）：相手が本人の真ん前にいると、透けて描く輪が本人の腰に巻いた輪に見えた。
  //   この指定の戦は体と塀の後ろの輪を隠す（見える所だけ描く）
  if (rt.def?.spearRingDepth) ring.material.depthTest = true;
  rt.scene.add(ring); RINGS.set(rt.scene, ring);
  return ring;
}

export function spearRingTick(p) {
  const rt = p.rt;
  if (p.weapon !== 'spear' && !RINGS.has(rt.scene)) return;
  const u = p.u;
  const on = p.weapon === 'spear' && !p.mounted && u.alive && !rt.over && !rt.choice && !(p.knockT > 0);
  let foe = null;
  if (on) {
    const reach = p.meleeReach('thrust'), half = p.meleeHalf('thrust');
    const list = rt.army.enemiesInArc(u.pos, u.heading, reach, half, u.team, true, true, p.meleeFenceClear(reach), p.lock);
    // enemiesInArc は { u, d, cos } の並び。兵そのものは .u（11/13 クラウドし：取り違えで輪が全戦で一度も出ていなかった）
    foe = list && list[0] ? list[0].u : null;
    if (foe && (foe.civ || foe.noTarget || !foe.alive)) foe = null;
  }
  const r = ensure(rt);
  r.visible = !!foe;
  if (!foe) return;
  r.position.set(foe.pos.x, groundAt(rt.world, foe.pos.x, foe.pos.z, foe.pos.y) + (rt.def?.spearRingDepth ? 0.15 : 0.06), foe.pos.z);   // 隠す指定の戦は土に埋もれないよう少し浮かす
  const k = 1 + (S.reduceMotion ? 0 : 0.06 * Math.sin(rt.t * 8));
  r.scale.set(k, 1, k);
}
