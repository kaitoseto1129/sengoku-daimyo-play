// 槍の穂先が向かう先（kaito 11/3 AP7）：突けば当たる相手の足元に、細い光の輪を一つ置く。字は足さない。
// 当たる判定は strike() と同じ enemiesInArc。輪は一つを使い回し、毎コマ new しない。
import * as THREE from 'three';
import { groundAt } from './floors.js';
import { S } from './settings.js';

let ring = null, ringScene = null;
function ensure(rt) {
  if (ring && ringScene === rt.scene) return ring;
  const g = new THREE.RingGeometry(0.62, 0.74, 40);
  g.rotateX(-Math.PI / 2);
  ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xfff3ba, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, fog: false }));
  ring.renderOrder = 998; ring.frustumCulled = false; ring.visible = false;
  rt.scene.add(ring); ringScene = rt.scene;
  return ring;
}

export function spearRingTick(p) {
  const rt = p.rt;
  if (!ring && p.weapon !== 'spear') return;
  const u = p.u;
  const on = p.weapon === 'spear' && !p.mounted && u.alive && !rt.over && !rt.choice && !(p.knockT > 0);
  let foe = null;
  if (on) {
    const reach = p.meleeReach('thrust'), half = p.meleeHalf('thrust');
    const list = rt.army.enemiesInArc(u.pos, u.heading, reach, half, u.team, true, true, p.meleeFenceClear(reach), p.lock);
    foe = list && list[0] || null;
    if (foe && (foe.civ || foe.noTarget || !foe.alive)) foe = null;
  }
  const r = ensure(rt);
  r.visible = !!foe;
  if (!foe) return;
  r.position.set(foe.pos.x, groundAt(rt.world, foe.pos.x, foe.pos.z, foe.pos.y) + 0.06, foe.pos.z);
  const k = 1 + (S.reduceMotion ? 0 : 0.06 * Math.sin(rt.t * 8));
  r.scale.set(k, 1, k);
}
