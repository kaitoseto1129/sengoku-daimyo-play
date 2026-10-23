// 戦場の頭上の印（全戦。kaito 10/23 稲生 40・41・46）
//   敵は大きめの下向き三角、味方は丸。頭の上に固定し、近くの兵を覆わない。
//   武将：今の行動に関係する一人の名と体力の棒
//   形と材質は戦ごとに一度だけ作り、毎コマ new しない。
import * as THREE from 'three';
import { sightScreenUnit, inouSignVisible, cameraWallBlocked } from './battle_sight.js';
import { enemyKnown } from './battle_intel.js';
import { reduceMotion } from './settings.js';

const CAP = 360, BARS = 12, NAMES = 1;
const FOE_R = 55, FOE_OUT = 62, GEN_R = 60, NEAR_R = 18, NEAR_OUT = 22;
const BAR_FOE = new THREE.Color(0xe8452c), BAR_ALLY = new THREE.Color(0xe8c25a), BAR_BG = new THREE.Color(0x14120f);
const STATE = new WeakMap();
const dummy = new THREE.Object3D(), v = new THREE.Vector3(), headPos = new THREE.Vector3();

const general = (u) => !!u.name && !u.isSub && (u.type === 'busho' || u.type === 'samurai');
const headY = (u) => (u.pos.y || 0) + (u.mounted ? 3.05 : 2.1);

function build(rt, root) {
  const compact = !['inou', 'okehazama', 'moribe'].includes(rt.def.key);
  const tri = new THREE.BufferGeometry();
  // 共通の敵印は小さな赤いひし形。行き先の金のピンと形・色を分ける。
  const diamond = [0,.28,0, -.17,.14,0, 0,0,0, 0,.28,0, 0,0,0, .17,.14,0,
    0,.23,.001, -.11,.14,.001, 0,.05,.001, 0,.23,.001, 0,.05,.001, .11,.14,.001];
  tri.setAttribute('position', new THREE.Float32BufferAttribute(compact ? diamond : [-.17,.28,0, .17,.28,0, 0,0,0, -.115,.245,.001, .115,.245,.001, 0,.065,.001], 3));
  const colors = [];
  for (const color of [0x14120f, rt.def.key === 'okehazama' ? 0xff342e : 0xff634d]) {
    const c = new THREE.Color(color);
    for (let i = 0; i < (compact ? 6 : 3); i++) colors.push(c.r, c.g, c.b);
  }
  tri.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // 赤い▼の中身だけを残りの命に合わせて減らす。外枠は保ち、棒や数字を足さない。
  const triMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false });
  // 乱戦でも旗や笠、槍や味方の背に敵印を隠さない。壁は見通しで除く。
  triMat.depthTest = false;
  if (rt.def.key === 'inou' || rt.def.key === 'okehazama' || rt.def.key === 'moribe') {
    tri.setAttribute('signLife', new THREE.InstancedBufferAttribute(new Float32Array(CAP).fill(1), 1));
    triMat.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float signLife;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nif (position.z > 0.0) { transformed.xy = vec2(0.0, 0.065) + (position.xy - vec2(0.0, 0.065)) * signLife; }');
    };
  }
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
  const bar = new THREE.PlaneGeometry(1, 0.045); bar.translate(0.5, 0, 0);
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
  const s = { marks, allies, bars, box, labels, gens: [], at: -1, nearby: [], nearbyAt: -1 };
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
  const quietSigns = rt.def.key !== 'inou' && rt.def.key !== 'okehazama' && rt.def.key !== 'moribe';
  const photo = root?.classList?.contains('photo') || rt.player.camShot;
  const hide = photo || rt.hud?.introWaiting;
  // 間合い内の相手・狙う相手・すぐ近くの敵を先に示す。攻撃の判定は変えない。
  const reachableTarget = rt.player.inRange && rt.player.rangeCueTarget?.alive ? rt.player.rangeCueTarget : null;
  const missionEnemy = rt.def.missionSignTarget?.(rt) || reachableTarget ||
    (rt.player.lock?.alive ? rt.player.lock : null) || rt.missionGuide?.closeEnemy ||
    (rt.guideEnemyShown ? rt.guideEnemy : null);
  // 敵は小さな所属印へ統一し、剣や全身の枠を重ねない。
  const focusEnemy = missionEnemy;
  rt.hud.outlinedEnemy = null;
  const moribe = rt.def.key === 'moribe';
  const commander = moribe ? rt.def.commanderTarget?.(rt) : null;
  const inou = rt.def.key === 'inou';
  const oke = rt.def.key === 'okehazama';
  // 共通の印は近い敵八人・味方四人まで。自分を狙う敵を先にし、三人まで大きくする。
  // 候補と見通しは五分の一秒ごとに更新し、兵・戦闘の判断には触れない。
  if (quietSigns && (s.nearbyAt <= rt.t || s.nearbyAt > rt.t + .2)) {
    s.nearbyAt = rt.t + .2;
    const list = s.nearby; list.length = 0;
    for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.dying || u.woundOut || u.isPlayer || u.isStruct || u.civ || u.noTarget ||
          u.fleeing || u.group?.routed || u.mesh?.visible === false || u.camHidden || u.team > 1 || u.type === 'dummy' || u.type === 'porter') continue;
      const d = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2;
      const foe = u.team !== me.team;
      if (d > (foe ? 18 * 18 : 12 * 12) || !sightScreenUnit(rt, u)) continue;
      u._nearSignDanger = foe && d <= 10 * 10 && (u.target === me || u.atk?.target === me || u.swing?.target === me);
      u._nearSignScore = d - (u._nearSignDanger ? 1000 : 0);
      v.set(u.pos.x, headY(u) + .12, u.pos.z).project(cam);
      u._nearSignX = (v.x + 1) * innerWidth / 2; u._nearSignY = (1 - v.y) * innerHeight / 2;
      list.push(u);
    }
    list.sort((a, b) => a._nearSignScore - b._nearSignScore);
    let foes = 0, allies = 0, danger = 0;
    for (let i = 0; i < list.length; i++) {
      const u = list[i], foe = u.team !== me.team;
      let overlap = false;
      for (let j = 0; j < i; j++) {
        const other = list[j];
        if (other._nearSignOn && Math.abs(u._nearSignX - other._nearSignX) < 24 && Math.abs(u._nearSignY - other._nearSignY) < 24) { overlap = true; break; }
      }
      u._nearSignOn = !overlap && (foe ? foes < 8 : allies < 4);
      if (u._nearSignOn) { if (foe) foes++; else allies++; }
      u._nearSignLarge = u._nearSignOn && u._nearSignDanger && danger++ < 3;
    }
  }
  const still = reduceMotion();
  let n = 0, a = 0, b = 0;
  const gens = s.gens; gens.length = 0;
  if (!hide) for (const u of rt.army.units) {
    // 自分が討った時だけ、同じ▼を短く縮めて消す。空振りや味方の討ち取りでは出さない。
    const defeated = moribe && !u.alive && (u.moribeHitUntil || 0) - rt.t > 1.15;
    if ((!u.alive || u.dying || u.woundOut || u.rearWound || u.downed) && !defeated || u.gone || u.isPlayer || u.isStruct || u.civ || u.type === 'dummy' || u.type === 'porter' || u.team > 1) continue;
    const dx = u.pos.x - P.x, dz = u.pos.z - P.z, d2 = dx * dx + dz * dz;
    const foe = u.team !== me.team;
    // 近い敵は人数・重なり・体の描画省略で消さない。距離は本人から測り、境に幅を持たせる。
    const nearRadius = u._fsNearOn ? NEAR_OUT : NEAR_R;
    const near = foe && (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 < nearRadius * nearRadius;
    u._fsNearOn = near;
    if (near) {
      // 壁だけを五分の一秒ごとに調べる。画面端や霧による出入りを混ぜない。
      if (u._fsNearAt == null || rt.t < u._fsNearAt - .2 || rt.t >= u._fsNearAt) {
        u._fsNearSeen = !cameraWallBlocked(rt, P, u.pos, P.y, headY(u));
        u._fsNearAt = rt.t + .2;
      }
      if (!u._fsNearSeen) continue;
    }
    // 体力の横棒だけを遠くに残さず、同じ本人の▼と揃える。
    if (inou && !near && (foe || general(u)) && !inouSignVisible(rt, u)) continue;
    if (general(u) && (u === commander && d2 < 180 * 180 || d2 < GEN_R * GEN_R || d2 < GEN_R * GEN_R * 1.3 && s.bound?.includes(u)) && !u.woundOut) { u._fsD = d2; gens.push(u); }
    if (quietSigns && !near && (!s.nearby.includes(u) || !u._nearSignOn || u.fleeing || u.group?.routed || u.mesh?.visible === false || u.camHidden)) continue;
    // 稲生・森部は敵の赤い▼だけ。味方の丸と重ねて所属を迷わせない。
    if ((moribe || inou || rt.def.key === 'okehazama') && !foe) continue;
    // 森部は見える敵全員へ同じ▼を付ける。控えや対岸の兵も所属を変えない。
    // 見通しの上限と揃え、武将だけ印が残る距離の違いをなくす。
    const signRadius = moribe ? 170 : u === commander ? (u._fsOn ? 180 : 170) : oke && u === missionEnemy ? (u._fsOn ? 100 : 90) : (u._fsOn ? FOE_OUT : FOE_R);
    u._fsOn = near || inou || d2 < signRadius * signRadius;
    if ((foe && u.noTarget && !moribe && !rt.def.foeMarkVisible?.(rt, u)) || !u._fsOn || (foe ? n : a) >= CAP) continue;
    if (moribe && !near) {
      if (u.mesh?.visible === false || u.camHidden) continue;
      // 見通しは半秒ごと。判定も入れ物も兵ごとに使い回す。
      if (u._moribeSignAt == null || rt.t < u._moribeSignAt - .5 || rt.t >= u._moribeSignAt) {
        u._moribeSignSeen = u.mesh?.visible !== false && sightScreenUnit(rt, u);
        u._moribeSignAt = rt.t + .5;
      }
      if (!u._moribeSignSeen) continue;
    }
    // 敵の三角は味方の丸より大きくし、乱戦でも形を読み取れる幅に保つ。
    // 笠や肩が重なる近接戦でも、▼の先端を笠より上に保つ。
    headPos.set(u.pos.x, headY(u) + .12, u.pos.z);
    // 稲生は笠を含めた高さより上へ固定する。頭の動きは追わない。
    if ((moribe || inou || oke) && !u.mounted) headPos.y = u.pos.y + Math.max(2.1, (u.bodyHeight || 1.72) + .35) + .12;
    // 森部は笠のすぐ上へ寄せる。遠い印と手前の別人が重なって見える隙間を減らす。
    if (moribe && !u.mounted) headPos.y = u.pos.y + Math.max(2, (u.bodyHeight || 1.72) + .2);
    // 稲生・森部・桶狭間とも立ち位置の上へ固定し、構えや突きの頭の揺れを追わない。
    v.copy(headPos).applyMatrix4(cam.matrixWorldInverse);
    if (v.z >= 0) continue;
    // 森部の討つ武将は近くの兵へ乗り換えず、大きな▼を保つ。
    const readyEnemy = (moribe || inou || oke) && rt.player.inRange ? rt.player.rangeCueTarget : null;
    // 追う一人の▼は近づくほど大きくする。足場のピンと同じ本人を示す。
    const approach = (oke || inou) && u === missionEnemy ? Math.max(0, 1 - Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) / 30) : 0;
    // 森部は届く一人を大きくし、命中時は縦横に広げて少し保つ。
    // 討つ武将は別の大きさを保ち、任務の相手を見失わせない。
    // 稲生は追う一人を少し大きくし、届く時には幅も広げる。
    const pixels = moribe ? (u === commander ? 26 : u === readyEnemy ? 24 : 16) :
      inou ? (u === readyEnemy ? 32 : u === missionEnemy ? 24 + 2 * approach : d2 < 20 * 20 ? 16 : 12) :
      oke ? (u === readyEnemy ? 34 : u === missionEnemy ? 26 + 6 * approach :
        (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 < 12 * 12 ? 18 : 10) :
      foe ? 12 : 8;
    // 稲生・森部・桶狭間では命を減らした相手の▼だけを一度大きくし、滑らかに戻す。
    // 頭上の先端は固定し、既存の形・材質・描画の束をそのまま使う。
    // 稲生は命中の形を少し保ってから戻す。連打の合間にも当たった本人が分かる。
    const hit = foe && (moribe || inou || oke) ? Math.min(1, Math.max(0, ((oke ? u.okeHitUntil : inou ? u.inouHitUntil : u.moribeHitUntil) || 0) - rt.t) / 1.2) : 0;
    const reachable = (moribe || inou || oke) && foe && rt.player.inRange && rt.player.rangeCueTarget === u;
    // 森部の命中は同じ赤い▼を大きくして示す。空振りでは変わらない。
    // 稲生は「届く＝幅広い▼」「命中＝一度だけ広がる▼」。残りの命は中の赤の面積で示す。
    const pulse = still ? (moribe || inou) && hit > 0 ? 1 : 0 : hit;
    if (foe && !moribe && !oke) {
      // 前にいる敵の印は、近すぎても端でも画面内へ収める。印同士は重なっても残す。
      const depth = Math.max(-v.z, cam.near * 2);
      v.multiplyScalar(depth / -v.z);
      const halfWidth = pixels * (reachable ? 1.6 : 1) * (1 + pulse) / 2 + 4;
      const height = pixels * .28 / .34 * (1 + pulse) + 4;
      const ex = Math.max(0, 1 - halfWidth * 2 / innerWidth);
      const ey = Math.max(0, 1 - height * 2 / innerHeight);
      const pe = cam.projectionMatrix.elements;
      v.x = Math.max(-ex * depth / pe[0], Math.min(ex * depth / pe[0], v.x));
      v.y = Math.max((-1 + 16 / innerHeight) * depth / pe[5], Math.min(ey * depth / pe[5], v.y));
      headPos.copy(v).applyMatrix4(cam.matrixWorld);
    }
    // 森部・桶狭間の▼は本人の頭上から動かさない。画面外の敵を端へ集めると、
    // 手前の味方の印に見えてしまう。投影後の画面端で自然に切れるようにする。
    // 森部は届く一人だけ横に広げ、命中した時だけ縦にも広げる。
    // 間合いに入っただけの変化と、実際に命を減らした変化を分ける。
    const width = oke ? pixels + 14 * pulse : moribe ? pixels * (1 + .45 * pulse) : pixels;
    const k = Math.min(u === commander ? 32 : moribe ? 5 : (inou || oke) && u === missionEnemy ? 8 : 3, width * -v.z * 2 / (innerHeight * cam.projectionMatrix.elements[5] * .34)) *
      (moribe || inou ? 1 : 1 + (pulse > 0 ? 1.2 * pulse : reachable && !oke ? .55 : 0));
    dummy.position.copy(headPos);
    dummy.quaternion.copy(q);
    // 桶狭間も、届く相手は横幅、命中は縦の伸びで区別する。先端は頭上に固定。
    // 桶狭間は届く時は幅だけ、命中時は高さだけを変え、空振りと区別する。
    const okeScale = oke ? Math.min(u === missionEnemy ? 8 : 3, pixels * -v.z * 2 / (innerHeight * cam.projectionMatrix.elements[5] * .34)) : k;
    dummy.scale.set(oke ? okeScale * (reachable ? 1.6 : 1) : moribe || inou ? k * (reachable ? 1.6 : 1) : k * (1 + .5 * pulse),
      oke || moribe || inou ? (oke ? okeScale : k) * (1 + pulse) : k, oke ? okeScale : k);
    if (defeated) dummy.scale.multiplyScalar(Math.max(0, Math.min(1, (u.moribeHitUntil - rt.t - 1.15) / .65)));
    dummy.updateMatrix();
    if (foe) {
      // 瀕死でも所属の赤は残す。黒い外枠だけになって敵の印を見失わない。
      if (moribe || inou || oke) s.marks.geometry.attributes.signLife.setX(n, Math.sqrt(Math.max(moribe ? .09 : oke ? .36 : .16, Math.min(1, u.hp / (u.maxHp || 1)))));
      s.marks.setMatrixAt(n++, dummy.matrix);
    }
    else s.allies.setMatrixAt(a++, dummy.matrix);
  }
  s.marks.count = n; s.marks.instanceMatrix.needsUpdate = true;
  if (moribe || inou || oke) s.marks.geometry.attributes.signLife.needsUpdate = true;
  s.allies.count = a; s.allies.instanceMatrix.needsUpdate = true;
  if (gens.length > 1) gens.sort((a, c) => a._fsD - c._fsD);
  // 武将の体力の棒（黒い下地と色の棒）
  for (let i = 0; i < gens.length && b < BARS * 2; i++) {
    const u = gens[i];
    if (quietSigns && (u !== s.nameUnit && u !== focusEnemy || (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 > 18 * 18)) continue;
    // 敵味方とも頭ほどの幅。遠方でも棒を拡大しすぎない。
    const k = Math.min(1.2, Math.max(1, Math.sqrt(u._fsD) / 22)), w = 0.45 * k;
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
  const named = rt.def.namedGuideTarget?.(rt);
  const enemies = rt.def.objectiveEnemies?.(rt);
  const related = (u) => u === named || u === person || u === ally || u === rt.player.lock || u === rt.player.aimed ||
    enemies?.includes(u) || !!marker?.group && u.group === marker.group;
  const available = (u) => u === commander || related(u) && (u.team === me.team || enemyKnown(rt, u)) && sightScreenUnit(rt, u);
  const previous = s.nameUnit;
  const chosen = named && gens.includes(named) && available(named) ? named :
    previous && gens.includes(previous) && available(previous) ? previous : gens.find(available);
  s.nameUnit = chosen;
  let cards = Math.max(2, 1 + (hud?.notices?.picks.length || 0));
  for (const id of ['boss', 'target', 'prompt', 'wait-guard']) {
    const el = document.getElementById(id);
    if (el && !el.hidden && el.offsetParent && !el.classList.contains('notice-muted') && !el.classList.contains('symbol-only')) cards++;
  }
  if (hud?.missionPinLabelShown) cards++;
  if (hud?.openingControlsActive) cards++;
  const rects = hud?.hudRects() || [];
  // 名札は一人に一枚を貼り続ける（毎コマ近い順に付け替えると字が入れ替わってちらつく。kaito 10/23「名前もチカチカ」）。
  const bound = s.bound || (s.bound = new Array(NAMES).fill(null));
  bound[0] = chosen || null;
  for (let i = 0; i < NAMES; i++) {
    const e = s.labels[i], u = bound[i];
    // 案内中の人物名は足元につながる共通ピンに任せ、二枚にしない。
    if (!u || u !== chosen || u === person || cards >= 3 && (u !== commander || hud?.openingControlsActive)) { if (!e.hidden) e.hidden = true; continue; }
    const k = Math.min(2.2, Math.max(1, Math.sqrt(u._fsD) / 22));
    v.set(u.pos.x, headY(u) + (u === commander ? .12 : 0.5 * k), u.pos.z).project(cam);
    // 遠くても名が大きな▼と重ならないよう、画面上で間を空ける。
    if (u === commander) v.y += 76 / H;
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

