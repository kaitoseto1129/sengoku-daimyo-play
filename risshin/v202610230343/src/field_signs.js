// 戦場の頭上の印（全戦。kaito 10/23 稲生 40・41・46）
//   敵は大きめの下向き三角、味方は丸。頭の上に固定し、近くの兵を覆わない。
//   武将：今の行動に関係する一人の名と体力の棒
//   形と材質は戦ごとに一度だけ作り、毎コマ new しない。
import * as THREE from 'three';
import { sightScreenUnit } from './battle_sight.js';
import { enemyKnown } from './battle_intel.js';

const CAP = 360, BARS = 12, NAMES = 1;
const FOE_R = 55, FOE_OUT = 62, GEN_R = 60;
const BAR_FOE = new THREE.Color(0xe8452c), BAR_ALLY = new THREE.Color(0xe8c25a), BAR_BG = new THREE.Color(0x14120f);
const STATE = new WeakMap();
const dummy = new THREE.Object3D(), v = new THREE.Vector3(), headPos = new THREE.Vector3();

const general = (u) => !!u.name && !u.isSub && (u.type === 'busho' || u.type === 'samurai');
const headY = (u) => (u.pos.y || 0) + (u.mounted ? 3.05 : 2.1);

function build(rt, root) {
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-.17,.28,0, .17,.28,0, 0,0,0, -.115,.245,.001, .115,.245,.001, 0,.065,.001], 3));
  const colors = [];
  for (const color of [0x14120f, 0xff634d]) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 3; i++) colors.push(c.r, c.g, c.b);
  }
  tri.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const triMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false });
  const marks = new THREE.InstancedMesh(tri, triMat, CAP);
  marks.count = 0; marks.frustumCulled = false; marks.renderOrder = 5;
  const circle = new THREE.RingGeometry(.065, .17, 16, 3);
  const ringColors = [];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Color(i === 0 || i === 3 ? 0x14120f : 0xffedb0);
    for (let j = 0; j <= 16; j++) ringColors.push(c.r, c.g, c.b);
  }
  circle.setAttribute('color', new THREE.Float32BufferAttribute(ringColors, 3));
  circle.translate(0, .13, 0);
  const allyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false });
  const allies = new THREE.InstancedMesh(circle, allyMat, CAP);
  allies.count = 0; allies.frustumCulled = false; allies.renderOrder = 5;
  const bar = new THREE.PlaneGeometry(1, 0.09); bar.translate(0.5, 0, 0);
  const barMat = new THREE.MeshBasicMaterial({ vertexColors: false, side: THREE.DoubleSide, fog: false, depthWrite: false });
  const bars = new THREE.InstancedMesh(bar, barMat, BARS * 2);
  bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BARS * 2 * 3), 3);
  bars.count = 0; bars.frustumCulled = false; bars.renderOrder = 6;
  rt.scene.add(marks, allies, bars);
  const box = document.createElement('div');
  box.className = 'field-names'; box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  const labels = [];
  for (let i = 0; i < NAMES; i++) {
    const e = document.createElement('div');
    e.className = 'field-name';
    e.style.cssText = 'position:absolute;left:0;top:0;padding:1px 6px;border-radius:3px;background:rgba(14,12,10,.72);font-size:14px;line-height:1.35;font-weight:600;white-space:nowrap;text-shadow:0 1px 2px #000;will-change:transform';
    e.hidden = true; box.appendChild(e); labels.push(e);
  }
  (root || document.body).appendChild(box);
  // 任務でねらう一人だけを的で示す。兵の体を隠さず、文字の札も増やさない。
  const focus = document.createElement('div');
  focus.style.cssText = 'position:absolute;width:48px;height:48px;pointer-events:none';
  focus.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="none" stroke="#14120f" stroke-width="7"><circle cx="16" cy="16" r="10"/><path d="M16 1V8M16 24V31M1 16H8M24 16H31"/></g><g fill="none" stroke="#fff3ba" stroke-width="3"><circle cx="16" cy="16" r="10"/><path d="M16 1V8M16 24V31M1 16H8M24 16H31"/></g><circle cx="16" cy="16" r="3" fill="#ff634d"/></svg>';
  focus.hidden = true; box.appendChild(focus);
  // 戦う相手の足元の輪と頭上の刀は出さない。敵は頭上の赤い▼だけ（kaito 10/23「足元の輪」は要らない・見え隠れでちらつく）。
  const s = { marks, allies, bars, box, labels, focus, gens: [], at: -1 };
  const clean = () => {
    rt.scene.remove(marks, allies, bars);
    tri.dispose(); triMat.dispose(); bar.dispose(); barMat.dispose();
    circle.dispose(); allyMat.dispose(); allies.dispose?.();
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
  // 任務の一人に大きな的を付ける。名のない兵も、見えていれば示す。
  const missionEnemy = rt.def.missionSignTarget?.(rt) ||
    (rt.guideEnemyShown ? rt.guideEnemy : null);
  const focus = s.focus;
  let focused = false;
  if (rt.def.key !== 'okehazama' && rt.def.key !== 'moribe' && !hide && !rt.over && !rt.choice && missionEnemy?.alive && !missionEnemy.gone &&
      !missionEnemy.dying && !missionEnemy.woundOut && missionEnemy.team !== me.team &&
      (!missionEnemy.name || enemyKnown(rt, missionEnemy)) && sightScreenUnit(rt, missionEnemy)) {
    v.set(missionEnemy.pos.x, headY(missionEnemy) + .6, missionEnemy.pos.z).project(cam);
    const x = (v.x + 1) * innerWidth / 2, y = (1 - v.y) * innerHeight / 2;
    const focusRects = rt.hud?.hudRects();
    if (v.z >= -1 && v.z <= 1 && x >= 28 && x <= innerWidth - 28 && y >= 28 && y <= innerHeight - 28 &&
        !focusRects?.some(r => x + 26 > r.left && x - 26 < r.right && y + 26 > r.top && y - 26 < r.bottom)) {
      focused = true;
      focus.style.transform = `translate(${(x - 24).toFixed(1)}px,${(y - 24).toFixed(1)}px)`;
    }
  }
  if (focus.hidden === focused) focus.hidden = !focused;
  const moribe = rt.def.key === 'moribe';
  const inou = rt.def.key === 'inou';
  const oke = rt.def.key === 'okehazama';
  let n = 0, a = 0, b = 0;
  const gens = s.gens; gens.length = 0;
  if (!hide) for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.dying || u.woundOut || u.isPlayer || u.isStruct || u.civ || u.type === 'dummy' || u.type === 'porter' || u.team > 1) continue;
    const dx = u.pos.x - P.x, dz = u.pos.z - P.z, d2 = dx * dx + dz * dz;
    const foe = u.team !== me.team;
    if (general(u) && (d2 < GEN_R * GEN_R || d2 < GEN_R * GEN_R * 1.3 && s.bound?.includes(u)) && !u.woundOut) { u._fsD = d2; gens.push(u); }
    // 稲生・森部は敵の赤い▼だけ。味方の丸と重ねて所属を迷わせない。
    if ((moribe || inou || rt.def.key === 'okehazama') && !foe) continue;
    if (inou && (u.mesh?.visible === false || u.rearWound)) continue;
    // 森部の一般兵は元の距離に戻し、対岸一面を赤い印で埋めない。
    // 任務の相手と稲生の案内は残す。境には幅を持たせ、ちらつきを防ぐ。
    const signRadius = inou || moribe && u === missionEnemy ? (u._fsOn ? 100 : 90) : (u._fsOn ? FOE_OUT : FOE_R);
    u._fsOn = d2 < signRadius * signRadius;
    if ((foe && u.noTarget && !rt.def.foeMarkVisible?.(rt, u)) || !u._fsOn || (foe ? n : a) >= CAP) continue;
    // 敵の三角は味方の丸より大きくし、乱戦でも形を読み取れる幅に保つ。
    // 笠や肩が重なる近接戦でも、▼の先端を笠より上に保つ。
    headPos.set(u.pos.x, headY(u) + .12, u.pos.z);
    // 近接中は実際の頭へ付ける。遠景の骨は更新せず、携帯の負荷を抑える。
    const head = (moribe || inou || oke) && d2 < 20 * 20 && u.human?.root.visible && u.human.bones?.Head;
    if (head) {
      head.updateWorldMatrix(true, false);
      head.getWorldPosition(headPos); headPos.y += .38;
      if (u.mesh) {
        headPos.x += u.pos.x - u.mesh.position.x;
        headPos.y += u.pos.y - u.mesh.position.y;
        headPos.z += u.pos.z - u.mesh.position.z;
      }
    }
    v.copy(headPos).applyMatrix4(cam.matrixWorldInverse);
    if (v.z >= 0) continue;
    // 届く相手を最優先にし、遠い任務の相手を同時に大きくしない。
    const readyEnemy = (inou || oke) && rt.player.inRange ? rt.player.rangeCueTarget : null;
    const pixels = moribe ? (u === missionEnemy ? 17 : d2 < 20 * 20 ? 12 : 9) :
      inou || oke ? (u === readyEnemy ? 22 : u === missionEnemy && !readyEnemy ? 17 : 10) :
      u === missionEnemy ? 17 : foe ? 16 : 10;
    // 稲生・森部・桶狭間では命を減らした相手の▼だけを一度大きくし、滑らかに戻す。
    // 頭上の先端は固定し、既存の形・材質・描画の束をそのまま使う。
    const hit = foe && (moribe || inou || oke) ? Math.min(1, Math.max(0, ((oke ? u.okeHitUntil : inou ? u.inouHitUntil : u.moribeHitUntil) || 0) - rt.t) / .7) : 0;
    const reachable = (moribe || inou || oke) && foe && rt.player.inRange && rt.player.rangeCueTarget === u;
    // 森部の命中は同じ赤い▼を大きくして示す。空振りでは変わらない。
    const width = moribe ? pixels + (reachable ? 8 : 0) + 10 * hit : pixels;
    const k = Math.min(moribe ? 1.6 : 3, width * -v.z * 2 / (innerHeight * cam.projectionMatrix.elements[5] * .34)) *
      (moribe ? 1 : 1 + (hit > 0 ? 1.2 * hit : reachable && !inou && !oke ? .55 : 0));
    dummy.position.copy(headPos);
    dummy.quaternion.copy(q); dummy.scale.set(moribe ? k : k * (1 + .5 * hit + ((inou || oke) && reachable ? .35 : 0)), k, k); dummy.updateMatrix();
    if (foe) s.marks.setMatrixAt(n++, dummy.matrix);
    else s.allies.setMatrixAt(a++, dummy.matrix);
  }
  s.marks.count = n; s.marks.instanceMatrix.needsUpdate = true;
  s.allies.count = a; s.allies.instanceMatrix.needsUpdate = true;
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
  let cards = Math.max(2, 1 + (hud?.notices?.picks.length || 0));
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

