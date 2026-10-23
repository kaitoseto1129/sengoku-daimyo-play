// 行き先のピン（kaito 10/23 稲生 3）。地面に刺さる一本だけ。字は出さない。
//   戦の定義の missionPin(rt) が { x, z, r } を返す間だけ立てる（r＝着いたとみなす半径。定義の判定と同じ値を返す）。
//   近くに来たら消す（ずっと出ていると邪魔）。形と材質は一つを使い回す。
import * as THREE from 'three';

let pin = null;
function make() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xf0c75a, fog: false, transparent: true, opacity: 0.92, depthWrite: false });
  const dark = new THREE.MeshBasicMaterial({ color: 0x2a1c10, fog: false, transparent: true, opacity: 0.9, depthWrite: false });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.4, 6), dark);
  pole.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), mat);
  head.position.y = 2.55;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.38, 10), mat);
  tip.rotation.x = Math.PI; tip.position.y = 2.28;
  g.add(pole, head, tip);
  g.renderOrder = 5;
  for (const m of g.children) { m.renderOrder = 5; m.frustumCulled = false; }
  g.userData.noShadow = true;
  return g;
}

// 町・道場・古い案内を残す戦を除き、全戦で字の行き先・地面の矢印を出さずピン一本にする。
export const pinGuideOn = (rt) => !!rt && !rt.def.town && !rt.def.dojo && !rt.def.oldGuide;

const tmp = { x: 0, z: 0, r: 6 };
function target(rt) {
  if (rt.def.missionPin) return rt.def.missionPin(rt);
  // 定義の無い戦は、任務の手引きが選んだ行き先（今の任務と同じ印・同じ半径）へ立てる。
  const g = rt.missionGuide, m = g?.marker;
  if (!m || !g.objective || g.objective.id === '_wait') return null;
  tmp.x = g.pos.x; tmp.z = g.pos.z; tmp.r = m.guideRadius || 6;
  return tmp;
}

export function updateMissionPin(rt) {
  const want = pinGuideOn(rt) && !rt.over && rt.player?.u?.alive ? target(rt) : null;
  if (!want) { if (pin && pin.parent) pin.visible = false; return; }
  if (!pin) pin = make();
  if (pin.parent !== rt.scene) rt.scene.add(pin);
  const me = rt.player.u.pos;
  const d = Math.hypot(want.x - me.x, want.z - me.z);
  const near = want.hide ?? Math.max(6, (want.r || 6) + 2);
  pin.visible = d > near;
  if (!pin.visible) return;
  // 遠くても見えるように、離れるほど少し大きく（三倍まで）。
  const k = Math.min(3, Math.max(1, d / 30));
  pin.scale.setScalar(k);
  pin.position.set(want.x, rt.world.heightAt(want.x, want.z), want.z);
}

// 槍の狙う先の小さな点（kaito 10/23 稲生 23）。狙っている敵がいれば胴に、いなければ穂先の先の地面に。
//   点は一つを使い回し、位置だけ毎コマ動かす。
let dot = null;
const v = new THREE.Vector3();
export function updateAimDot(rt, root) {
  const p = rt.player, u = p?.u;
  const on = pinGuideOn(rt) && u?.alive && !rt.over && !rt.choice && !p.camShot && !p.mounted && (p.weapon === 'spear' || p.weapon === 'sword');
  if (!dot) {
    dot = document.createElement('i');
    dot.id = 'aim-dot'; dot.setAttribute('aria-hidden', 'true');
    dot.style.cssText = 'position:absolute;left:0;top:0;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:#f3e2b8;box-shadow:0 0 0 1.5px #14120f;pointer-events:none;z-index:2;display:none';
  }
  if (dot.parentNode !== root) root.appendChild(dot);
  if (!on) { dot.style.display = 'none'; return; }
  const t = p.aimed?.alive && !p.aimed.fleeing ? p.aimed : p.lock?.alive ? p.lock : null;
  if (t && Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) < 6) v.set(t.pos.x, t.pos.y + (t.mounted ? 2.2 : 1.15), t.pos.z);
  else {
    const reach = p.weapon === 'spear' ? 2.9 : 2;
    const x = u.pos.x + Math.sin(p.yaw) * reach, z = u.pos.z + Math.cos(p.yaw) * reach;
    v.set(x, rt.world.heightAt(x, z) + 0.05, z);
  }
  v.project(rt.camera);
  if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) { dot.style.display = 'none'; return; }
  dot.style.display = 'block';
  dot.style.background = t ? '#e8573e' : '#f3e2b8';
  dot.style.transform = `translate(${Math.round((v.x + 1) / 2 * innerWidth)}px,${Math.round((1 - v.y) / 2 * innerHeight)}px)`;
}
