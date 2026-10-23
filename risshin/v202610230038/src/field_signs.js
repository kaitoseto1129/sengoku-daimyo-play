// 戦場の頭上の印（全戦。kaito 10/23 稲生 40・41・46）
//   敵：すべての敵の頭上に赤い▼（一つの InstancedMesh。揺らさず、頭の上に固定）
//   武将：今の行動に関係する一人の名と体力の棒
//   形と材質は戦ごとに一度だけ作り、毎コマ new しない。
import * as THREE from 'three';
import { sightScreenUnit } from './battle_sight.js';
import { enemyKnown } from './battle_intel.js';

const CAP = 360, BARS = 12, NAMES = 1;
const FOE_R = 55, GEN_R = 60;
const RED = new THREE.Color(0xff3b22), BAR_FOE = new THREE.Color(0xe8452c), BAR_ALLY = new THREE.Color(0xe8c25a), BAR_BG = new THREE.Color(0x14120f);
const STATE = new WeakMap();
const dummy = new THREE.Object3D(), v = new THREE.Vector3();

const general = (u) => !!u.name && !u.isSub && (u.type === 'busho' || u.type === 'samurai');
const headY = (u) => (u.pos.y || 0) + (u.mounted ? 3.05 : 2.1);

function build(rt, root) {
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.17, 0.26, 0, 0.17, 0.26, 0, 0, 0, 0], 3));
  const triMat = new THREE.MeshBasicMaterial({ color: RED, side: THREE.DoubleSide, fog: false, depthWrite: false });
  const marks = new THREE.InstancedMesh(tri, triMat, CAP);
  marks.count = 0; marks.frustumCulled = false; marks.renderOrder = 5;
  const bar = new THREE.PlaneGeometry(1, 0.09); bar.translate(0.5, 0, 0);
  const barMat = new THREE.MeshBasicMaterial({ vertexColors: false, side: THREE.DoubleSide, fog: false, depthWrite: false });
  const bars = new THREE.InstancedMesh(bar, barMat, BARS * 2);
  bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BARS * 2 * 3), 3);
  bars.count = 0; bars.frustumCulled = false; bars.renderOrder = 6;
  rt.scene.add(marks, bars);
  const box = document.createElement('div');
  box.className = 'field-names'; box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  const labels = [];
  for (let i = 0; i < NAMES; i++) {
    const e = document.createElement('div');
    e.style.cssText = 'position:absolute;left:0;top:0;padding:1px 6px;border-radius:3px;background:rgba(14,12,10,.72);font-size:14px;line-height:1.35;font-weight:600;white-space:nowrap;text-shadow:0 1px 2px #000;will-change:transform';
    e.hidden = true; box.appendChild(e); labels.push(e);
  }
  (root || document.body).appendChild(box);
  // 戦う一人だけに足元の輪と頭上の刀。字や操作の札は増やさない。
  const ring = document.createElement('div'), sword = document.createElement('div');
  ring.innerHTML = '<svg width="80" height="28" viewBox="0 0 80 28"><ellipse cx="40" cy="14" rx="34" ry="9" fill="none" stroke="#14120f" stroke-width="7"/><ellipse cx="40" cy="14" rx="34" ry="9" fill="none" stroke="#fff3ba" stroke-width="3"/></svg>';
  sword.innerHTML = '<svg width="32" height="36" viewBox="0 0 32 36"><path d="M8 29L13 22M9 19L19 27M15 23L25 7L25 3L21 5L11 20" fill="#fff3ba" stroke="#14120f" stroke-width="5" stroke-linejoin="round"/><path d="M8 29L13 22M9 19L19 27M15 23L25 7L25 3L21 5L11 20" fill="#fff3ba" stroke="#fff3ba" stroke-width="2" stroke-linejoin="round"/></svg>';
  for (const el of [ring, sword]) {
    el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;transform-origin:0 0';
    el.hidden = true; box.appendChild(el);
  }
  const s = { marks, bars, box, labels, ring, sword, foeAt: -1, gens: [], at: -1 };
  const clean = () => {
    rt.scene.remove(marks, bars);
    tri.dispose(); triMat.dispose(); bar.dispose(); barMat.dispose();
    marks.dispose?.(); bars.dispose?.(); box.remove();
  };
  if (rt.cleanupTasks) rt.cleanupTasks.add(clean);
  STATE.set(rt, s);
  return s;
}

export function fieldSignsTick(rt, root) {
  if (!rt?.army || !rt.scene || !rt.camera || rt.def.noFieldSigns) return;
  const s = STATE.get(rt) || build(rt, root);
  const me = rt.player.u, cam = rt.camera, P = cam.position, q = cam.quaternion;
  const photo = root?.classList?.contains('photo') || rt.player.camShot;
  const hide = photo || rt.hud?.introWaiting;
  combatSigns(rt, s, hide || !me.alive || rt.over || rt.choice || rt.hud?.bigmap || rt.def.town || rt.def.dojo);
  // 桶狭間の任務の相手だけ、既存の▼を大きくする。形・材質・描画回数は増やさない。
  const missionEnemy = rt.def.key === 'okehazama' && rt.def.missionSignTarget?.(rt);
  let n = 0, b = 0;
  const gens = s.gens; gens.length = 0;
  if (!hide) for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.dying || u.woundOut || u.isPlayer || u.isStruct || u.civ || u.type === 'dummy' || u.type === 'porter' || u.team > 1) continue;
    const dx = u.pos.x - P.x, dz = u.pos.z - P.z, d2 = dx * dx + dz * dz;
    const foe = u.team !== me.team;
    if (general(u) && (d2 < GEN_R * GEN_R || d2 < GEN_R * GEN_R * 1.3 && s.bound?.includes(u)) && !u.woundOut) { u._fsD = d2; gens.push(u); }
    if (!foe || (u.noTarget && !rt.def.foeMarkVisible?.(rt, u)) || d2 > FOE_R * FOE_R || n >= CAP) continue;
    const k = Math.min(1.6, Math.max(1, Math.sqrt(d2) / 26)) * (u === missionEnemy ? 1.6 : 1);
    dummy.position.set(u.pos.x, headY(u) + (general(u) ? 0.05 : 0), u.pos.z);
    dummy.quaternion.copy(q); dummy.scale.set(k, k, k); dummy.updateMatrix();
    s.marks.setMatrixAt(n++, dummy.matrix);
  }
  s.marks.count = n; s.marks.instanceMatrix.needsUpdate = true;
  if (gens.length > 1) gens.sort((a, c) => a._fsD - c._fsD);
  // 武将の体力の棒（黒い下地と色の棒）
  for (let i = 0; i < gens.length && b < BARS * 2; i++) {
    const u = gens[i], k = Math.min(2.2, Math.max(1, Math.sqrt(u._fsD) / 22)), w = 0.9 * k;
    const ratio = Math.max(0.02, Math.min(1, u.hp / (u.maxHp || 1)));
    const y = headY(u) + 0.36 * k;
    for (const [len, col, z] of [[1, BAR_BG, 0], [ratio, u.team === me.team ? BAR_ALLY : BAR_FOE, 0.002]]) {
      dummy.quaternion.copy(q);
      v.set(-w / 2, 0, z).applyQuaternion(q);
      dummy.position.set(u.pos.x + v.x, y + v.y, u.pos.z + v.z);
      dummy.scale.set(w * len, k, 1); dummy.updateMatrix();
      s.bars.setMatrixAt(b, dummy.matrix); s.bars.instanceColor.setXYZ(b, col.r, col.g, col.b); b++;
    }
  }
  s.bars.count = b; s.bars.instanceMatrix.needsUpdate = true; if (s.bars.instanceColor) s.bars.instanceColor.needsUpdate = true;
  // 武将の名は今の相手・合流する隊だけ。命と任務を先に数え、残る一枠を使う。
  const W = innerWidth, H = innerHeight;
  const hud = rt.hud, marker = rt.missionGuide?.marker;
  const person = typeof marker?.guidePerson === 'function' ? marker.guidePerson() : marker?.guidePerson;
  const ally = rt.def.missionAlly?.(rt) || rt.def.guardGuideTarget?.(rt) || rt.def.guardTarget?.(rt);
  const enemies = rt.def.objectiveEnemies?.(rt);
  const related = (u) => u === person || u === ally || u === rt.player.lock || u === rt.player.aimed ||
    enemies?.includes(u) || !!marker?.group && u.group === marker.group;
  const available = (u) => related(u) && (u.team === me.team || enemyKnown(rt, u)) && sightScreenUnit(rt, u);
  const previous = s.nameUnit;
  const chosen = previous && gens.includes(previous) && available(previous) ? previous : gens.find(available);
  s.nameUnit = chosen;
  let cards = 1 + (hud?.notices?.picks.length || 0);
  for (const id of ['boss', 'target', 'prompt', 'wait-guard']) {
    const el = document.getElementById(id);
    if (el && !el.hidden && el.offsetParent && !el.classList.contains('notice-muted') && !el.classList.contains('symbol-only')) cards++;
  }
  if (hud?.missionPinLabelShown) cards++;
  const rects = hud?.hudRects() || [];
  // 名札は一人に一枚を貼り続ける（毎コマ近い順に付け替えると字が入れ替わってちらつく。kaito 10/23「名前もチカチカ」）。
  const bound = s.bound || (s.bound = new Array(NAMES).fill(null));
  bound[0] = chosen || null;
  for (let i = 0; i < NAMES; i++) {
    const e = s.labels[i], u = bound[i];
    if (!u || u !== chosen || cards >= 3) { if (!e.hidden) e.hidden = true; continue; }
    const k = Math.min(2.2, Math.max(1, Math.sqrt(u._fsD) / 22));
    v.set(u.pos.x, headY(u) + 0.5 * k, u.pos.z).project(cam);
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) { if (!e.hidden) e.hidden = true; continue; }
    const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
    const half = u.name.length * 7 + 8;
    if (rects.some((r) => x + half > r.left && x - half < r.right && y > r.top && y - 24 < r.bottom)) {
      e.hidden = true; continue;
    }
    if (e._n !== u.name) { e._n = u.name; e.textContent = u.name; }
    const col = u.team === me.team ? '#f3dc9a' : '#ffc4b4';
    if (e._c !== col) { e._c = col; e.style.color = col; }
    e.hidden = false;
    e.style.transform = `translate(${Math.round((v.x + 1) / 2 * W)}px,${Math.round((1 - v.y) / 2 * H)}px) translate(-50%,-100%)`;
  }
}

function combatFoeValid(rt, u) {
  const me = rt.player.u;
  return u?.alive && !u.gone && !u.dying && !u.fleeing && !u.woundOut &&
    !u.noTarget && !u.isStruct && !u.civ && u.team <= 1 && u.team !== me.team &&
    Math.abs(u.pos.y - me.pos.y) < 2 &&
    (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 <= 196 && sightScreenUnit(rt, u);
}

function combatSigns(rt, s, hide) {
  const me = rt.player.u, cam = rt.camera;
  if (!hide && (rt.t >= s.foeAt || rt.t < s.foeAt - .25)) {
    s.foeAt = rt.t + .25;
    const aimed = rt.player.lock || rt.player.aimed;
    // 狙っている敵を優先し、同じ距離の敵同士で印を取り替え続けない。
    if (combatFoeValid(rt, aimed)) s.foe = aimed;
    else if (!combatFoeValid(rt, s.foe)) {
      s.foe = null;
      let best = 196;
      for (const u of rt.army.units) {
        const d = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2;
        if (d < best && combatFoeValid(rt, u)) { best = d; s.foe = u; }
      }
    }
  }
  const u = s.foe;
  s.ring.hidden = s.sword.hidden = !!hide || !combatFoeValid(rt, u);
  if (s.ring.hidden) return;
  const distance = Math.hypot(u.pos.x - cam.position.x, u.pos.z - cam.position.z);
  const scale = Math.max(.5, Math.min(1, 8 / Math.max(1, distance)));
  v.set(u.pos.x, u.pos.y + .06, u.pos.z).project(cam);
  // 足が画面の外なら輪だけを隠す。頭上の刀は相手に付けたまま。
  s.ring.hidden = v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1;
  s.ring.style.transform = `translate(${((v.x + 1) * innerWidth / 2).toFixed(1)}px,${((1 - v.y) * innerHeight / 2).toFixed(1)}px) scale(${scale}) translate(-40px,-14px)`;
  v.set(u.pos.x, headY(u) + .3, u.pos.z).project(cam);
  s.sword.hidden = v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1;
  s.sword.style.transform = `translate(${((v.x + 1) * innerWidth / 2).toFixed(1)}px,${((1 - v.y) * innerHeight / 2).toFixed(1)}px) translate(-16px,-36px)`;
}
