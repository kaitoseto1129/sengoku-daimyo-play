// 戦場の頭上の印（全戦。kaito 10/23 稲生 40・41・46）
//   共通の敵は剣、味方は旗。頭の上に固定し、近くの兵を覆わない。
//   武将：今の行動に関係する一人の名と体力の棒
//   形と材質は戦ごとに一度だけ作り、毎コマ new しない。
import * as THREE from 'three';
import { sightScreenUnit, inouSignVisible, cameraWallBlocked } from './battle_sight.js';
import { enemyKnown } from './battle_intel.js';
import { reduceMotion } from './settings.js';

const CAP = 360, BARS = 12, NAMES = 1, GLOW = 8, HOT = 16;
const hotM = Array.from({ length: HOT }, () => new THREE.Matrix4()), hotLife = new Float32Array(HOT), hotTone = new Float32Array(HOT);
const FOE_R = 55, FOE_OUT = 62, GEN_R = 60, NEAR_R = 18, NEAR_OUT = 22;
const BAR_FOE = new THREE.Color(0xe8452c), BAR_ALLY = new THREE.Color(0xe8c25a), BAR_BG = new THREE.Color(0x14120f);
const STATE = new WeakMap();
const dummy = new THREE.Object3D(), v = new THREE.Vector3(), headPos = new THREE.Vector3();

const general = (u) => !!u.name && !u.isSub && (u.type === 'busho' || u.type === 'samurai');
const headY = (u) => (u.pos.y || 0) + (u.mounted ? 3.05 : 2.1);

// 一枚の形に暗い外縁と明るい内側を重ね、描画の束を増やさない。
function outlinedSign(points, tone) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  const face = new THREE.ShapeGeometry(shape).toNonIndexed();
  const source = face.getAttribute('position'), positions = [], colors = [];
  for (let layer = 0; layer < 2; layer++) {
    const color = new THREE.Color(layer ? tone : 0x14120f);
    for (let i = 0; i < source.count; i++) {
      const x = source.getX(i), y = source.getY(i);
      positions.push(layer ? x * .68 : x, layer ? .24 + (y - .24) * .82 : y, layer * .001);
      colors.push(color.r, color.g, color.b);
    }
  }
  face.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function build(rt, root) {
  const compact = !['inou', 'okehazama', 'moribe'].includes(rt.def.key);
  const tri = compact ? outlinedSign([[0,.48],[-.07,.37],[-.07,.17],[-.17,.17],[-.17,.10],[-.045,.10],[-.045,0],[.045,0],[.045,.10],[.17,.10],[.17,.17],[.07,.17],[.07,.37]], 0xffb4a2) : new THREE.BufferGeometry();
  if (!compact) tri.setAttribute('position', new THREE.Float32BufferAttribute([-.17,.28,0, .17,.28,0, 0,0,0, -.115,.245,.001, .115,.245,.001, 0,.065,.001], 3));
  const colors = [];
  for (const color of [0x14120f, rt.def.key === 'okehazama' || rt.def.key === 'moribe' ? 0xff342e : 0xff634d]) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 3; i++) colors.push(c.r, c.g, c.b);
  }
  if (!compact) tri.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // 赤い▼の中身だけを残りの命に合わせて減らす。外枠は保ち、棒や数字を足さない。
  const triMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false });
  // 乱戦でも旗や笠、槍や味方の背に敵印を隠さない。壁は見通しで除く。
  triMat.depthTest = false;
  if (rt.def.key === 'inou' || rt.def.key === 'okehazama' || rt.def.key === 'moribe') {
    tri.setAttribute('signLife', new THREE.InstancedBufferAttribute(new Float32Array(CAP).fill(1), 1));
    // signTone：0＝遠い敵（薄い）、1＝ふつう、2＝槍の届く敵（同じ赤い▼のまま、縁を白・中を濃い赤に。別の印に見せない）
    tri.setAttribute('signTone', new THREE.InstancedBufferAttribute(new Float32Array(CAP).fill(1), 1));
    tri.setAttribute('signFade', new THREE.InstancedBufferAttribute(new Float32Array(CAP).fill(1), 1));
    triMat.transparent = true;
    triMat.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float signLife;\nattribute float signTone;\nattribute float signFade;\nvarying float vSignA;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nif (position.z > 0.0) { transformed.xy = vec2(0.0, 0.065) + (position.xy - vec2(0.0, 0.065)) * signLife; }')
        .replace('#include <color_vertex>', '#include <color_vertex>\nvSignA = (signTone < 0.5 ? 0.55 : 1.0) * signFade;\nif (signTone > 1.5) vColor = position.z > 0.0 ? vec3(1.0, 0.06, 0.02) : vec3(1.0);');
      shader.fragmentShader = 'varying float vSignA;\n' + shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vSignA );');
      if (rt.def.key === 'moribe' || rt.def.key === 'inou' || rt.def.key === 'okehazama') {
        // 赤の高さが命の残り。小さな赤い点へ縮めず、黒い空きが増える▼にする。
        shader.vertexShader = 'varying vec3 vSignLevel;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          'if (position.z > 0.0) { transformed.xy = vec2(0.0, 0.065) + (position.xy - vec2(0.0, 0.065)) * signLife; }',
          'vSignLevel = vec3(position.z > 0.0 ? 1.0 : 0.0, position.y, signLife);');
        // 届く時の白い縁と分け、実際の命中だけ中を白く、縁を赤く保つ。
        shader.vertexShader = shader.vertexShader.replace('if (signTone > 1.5) vColor = position.z > 0.0 ? vec3(1.0, 0.06, 0.02) : vec3(1.0);',
          'if (signTone > 2.5) vColor = position.z > 0.0 ? vec3(1.0) : vec3(1.0, 0.06, 0.02); else if (signTone > 1.5) vColor = position.z > 0.0 ? vec3(1.0, 0.06, 0.02) : vec3(1.0);');
        shader.fragmentShader = 'varying vec3 vSignLevel;\n' + shader.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\nif (vSignLevel.x > 0.5 && vSignLevel.y > mix(0.065, 0.245, vSignLevel.z)) diffuseColor.rgb = vec3(0.007, 0.006, 0.005);');
      }
    };
  }
  const marks = new THREE.InstancedMesh(tri, triMat, CAP);
  marks.count = 0; marks.frustumCulled = false; marks.renderOrder = 5;
  const circle = compact ? outlinedSign([[-.14,0],[-.14,.44],[.17,.44],[.10,.32],[.17,.20],[-.07,.20],[-.07,0]], 0xffedb0) : new THREE.RingGeometry(.065, .17, 16, 3);
  const ringColors = [];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Color(i === 0 || i === 3 ? 0x14120f : 0xffedb0);
    for (let j = 0; j <= 16; j++) ringColors.push(c.r, c.g, c.b);
  }
  if (!compact) {
    circle.setAttribute('color', new THREE.Float32BufferAttribute(ringColors, 3));
    circle.translate(0, .13, 0);
  }
  const allyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false, depthTest: !compact });
  const allies = new THREE.InstancedMesh(circle, allyMat, CAP);
  allies.count = 0; allies.frustumCulled = false; allies.renderOrder = 5;
  const bar = new THREE.PlaneGeometry(1, 0.045); bar.translate(0.5, 0, 0);
  const barMat = new THREE.MeshBasicMaterial({ vertexColors: false, side: THREE.DoubleSide, fog: false, depthWrite: false });
  const bars = new THREE.InstancedMesh(bar, barMat, BARS * 2);
  bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BARS * 2 * 3), 3);
  bars.count = 0; bars.frustumCulled = false; bars.renderOrder = 6;
  // 当たった敵の体を一瞬だけ白く光らせる薄い殻（加算・最大八人。形と材質は一度だけ作る）
  const glowGeo = new THREE.CapsuleGeometry(.28, 1.1, 3, 8);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffc8b0, transparent: true, opacity: .38, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const glow = new THREE.InstancedMesh(glowGeo, glowMat, GLOW);
  glow.count = 0; glow.frustumCulled = false; glow.renderOrder = 4;
  rt.scene.add(marks, allies, bars, glow);
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
  const s = { marks, allies, bars, glow, box, labels, gens: [], at: -1, nearby: [], nearbyAt: -1,
    signPool: Array.from({ length: ['inou', 'moribe', 'okehazama'].includes(rt.def.key) ? CAP : 0 }, () => ({ matrix: new THREE.Matrix4() })),
    signCandidates: [] };
  const clean = () => {
    rt.scene.remove(marks, allies, bars, glow);
    glowGeo.dispose(); glowMat.dispose(); glow.dispose?.();
    tri.dispose(); triMat.dispose(); bar.dispose(); barMat.dispose();
    circle.dispose(); allyMat.dispose(); allies.dispose?.();
    marks.dispose?.(); bars.dispose?.(); box.remove();
  };
  if (rt.cleanupTasks) rt.cleanupTasks.add(clean);
  STATE.set(rt, s);
  return s;
}

// 赤い▼を人数で間引かない。遠い敵から描き、届く本人を最後に重ねる。
// 候補の入れ物と行列は使い回し、密集した隊同士の総当たりをしない。
const signBackFirst = (a, b) => Number(a.hot) - Number(b.hot) || b.distance - a.distance;
function drawOrderedSigns(s) {
  const list = s.signCandidates;
  list.sort(signBackFirst);
  let n = 0;
  for (const c of list) {
    s.marks.setMatrixAt(n, c.matrix);
    s.marks.geometry.attributes.signLife.setX(n, c.life);
    s.marks.geometry.attributes.signTone.setX(n, c.tone);
    s.marks.geometry.attributes.signFade.setX(n++, 1);
  }
  s.marks.geometry.attributes.signFade.needsUpdate = true;
  return n;
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
    rt.hud.approachGuideEnemy || rt.hud.attackGuideEnemy || rt.hud.aimGuideEnemy ||
    (rt.player.lock?.alive ? rt.player.lock : null) || rt.missionGuide?.closeEnemy ||
    (rt.guideEnemyShown ? rt.guideEnemy : null);
  // 敵の剣は一人一つ。同じ相手へ別の印を重ねない。
  const focusEnemy = missionEnemy;
  rt.hud.outlinedEnemy = null;
  const moribe = rt.def.key === 'moribe';
  const commander = moribe ? rt.def.commanderTarget?.(rt) : null;
  const inou = rt.def.key === 'inou';
  const oke = rt.def.key === 'okehazama';
  s.signCandidates.length = 0;
  // 共通の印は近い敵八人・味方四人まで。遠い剣を並べず、行き先の印を優先する。
  // 候補と見通しは五分の一秒ごとに更新し、兵・戦闘の判断には触れない。
  if (quietSigns && (s.nearbyAt <= rt.t || s.nearbyAt > rt.t + .2)) {
    s.nearbyAt = rt.t + .2;
    const list = s.nearby; list.length = 0;
    for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.dying || u.woundOut || u.isPlayer || u.isStruct || u.civ || u.noTarget ||
          u.fleeing || u.group?.routed || u.mesh?.visible === false || u.camHidden || u.team > 1 || u.type === 'dummy' || u.type === 'porter') continue;
      const d = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2;
      const foe = u.team !== me.team;
      if (d > (foe ? 10 * 10 : 6 * 6) || !sightScreenUnit(rt, u)) continue;
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
  const special = moribe || inou || oke, pl = rt.player;
  // 槍（今の武器）の届く距離。攻撃を押せば向き直って届く所まで（player.js の strike と揃える）
  const reachHot = special && pl.weapon !== 'gun' && pl.weapon !== 'bow' && pl.meleeReach ? pl.meleeReach(pl.weapon === 'sword' ? 'slash' : 'thrust') + .35 : 0;
  let n = 0, a = 0, b = 0, hotN = 0;
  const gens = s.gens; gens.length = 0;
  if (!hide) for (const u of rt.army.units) {
    // 自分が討った時だけ、同じ▼を短く縮めて消す。空振りや味方の討ち取りでは出さない。
    const defeatUntil = oke ? u.okeHitUntil : inou ? u.inouHitUntil : u.moribeHitUntil;
    const defeated = (moribe && !u.alive || (inou || oke) && (!u.alive || u.dying || u.downed || u.woundOut || u.rearWound)) && (defeatUntil || 0) - rt.t > 1.2;
    if ((!u.alive || u.dying || u.woundOut || u.rearWound || u.downed) && !defeated || u.gone || u.isPlayer || u.isStruct || u.civ || u.type === 'dummy' || u.type === 'porter' || u.team > 1) continue;
    const dx = u.pos.x - P.x, dz = u.pos.z - P.z, d2 = dx * dx + dz * dz;
    const foe = u.team !== me.team;
    const meD2 = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2;
    // 稲生・森部の白縁は実際に攻撃が届く一人だけ。横や背後の敵まで同時に強調しない。
    const hot = foe && reachHot > 0 && u.alive && ((moribe || inou || oke) ? u === reachableTarget : meD2 <= reachHot * reachHot);
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
    if (quietSigns && (!s.nearby.includes(u) || !u._nearSignOn || meD2 > (foe ? 100 : 36) || u.fleeing || u.group?.routed || u.mesh?.visible === false || u.camHidden)) continue;
    if (quietSigns && !near && u === focusEnemy) {
      if (u._focusSignAt == null || rt.t >= u._focusSignAt || rt.t < u._focusSignAt - .2) {
        u._focusSignSeen = sightScreenUnit(rt, u); u._focusSignAt = rt.t + .2;
      }
      if (!u._focusSignSeen) continue;
    }
    // 稲生・森部は敵の赤い▼だけ。味方の丸と重ねて所属を迷わせない。
    if ((moribe || inou || rt.def.key === 'okehazama') && !foe) continue;
    // 森部は見える敵全員へ同じ▼を付ける。控えや対岸の兵も所属を変えない。
    // 見通しの上限と揃え、武将だけ印が残る距離の違いをなくす。
    const signRadius = moribe ? 170 : u === commander ? (u._fsOn ? 180 : 170) : oke && u === missionEnemy ? (u._fsOn ? 100 : 90) : (u._fsOn ? FOE_OUT : FOE_R);
    u._fsOn = near || inou || d2 < signRadius * signRadius;
    if ((foe && u.noTarget && !moribe && !oke && !rt.def.foeMarkVisible?.(rt, u)) || !u._fsOn || (special ? s.signCandidates.length : foe ? n : a) >= CAP) continue;
    if ((moribe || oke) && !near) {
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
    // 稲生・森部・桶狭間は笠のすぐ上へ寄せる。遠い印と手前の別人が重なって見える隙間を減らす。
    if ((moribe || inou || oke) && !u.mounted) headPos.y = u.pos.y + Math.max(2, (u.bodyHeight || 1.72) + .2);
    // 稲生・森部・桶狭間とも立ち位置の上へ固定し、構えや突きの頭の揺れを追わない。
    v.copy(headPos).applyMatrix4(cam.matrixWorldInverse);
    if (v.z >= 0) continue;
    // 森部の討つ武将は近くの兵へ乗り換えず、大きな▼を保つ。
    // 任務の相手とは別でも、実際に今の攻撃が届く一人の▼を横に広げる。
    const readyEnemy = reachableTarget;
    // 追う一人の▼は近づくほど大きくする。足場のピンと同じ本人を示す。
    const approach = (oke || inou) && u === missionEnemy ? Math.max(0, 1 - Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) / 30) : 0;
    // 届く一人を大きくし、命中時は縦横に広げて少し保つ。
    // 討つ武将は別の大きさを保ち、任務の相手を見失わせない。
    // 稲生は追う一人を少し大きくし、届く時には幅も広げる。
    // 自分へ振りかぶる本人だけ縦長にする。届く時の横幅、命中時の拡大とは形を分ける。
    const threatening = moribe && foe && u.alive && !u.fleeing && !(u.stagger > 0) &&
      (u.atk?.target === me && !u.atk.bow && !u.atk.gun || u.swing?.target === me && !u.swing.done);
    const pixels = moribe ? ((u.moribeHitUntil || 0) > rt.t ? 26 : u === readyEnemy ? 26 : u === missionEnemy ? 26 : u === commander ? 26 : threatening ? 22 : near ? 16 : 11) :
      // 稲生は近づく変化を大きくし、届く本人はさらに幅広い▼へ切り替える。
      inou ? (hot ? 32 : u === missionEnemy ? 14 + 12 * approach : meD2 < 25 * 25 ? 18 : 9) :
      oke ? (u === readyEnemy ? 34 : u === missionEnemy ? 26 + 6 * approach :
        (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 < 12 * 12 ? 18 : 10) :
      foe ? (u === readyEnemy ? 24 : u === focusEnemy ? 22 : 18) : 14;
    // 稲生・森部・桶狭間では命を減らした相手の▼だけを一度大きくし、滑らかに戻す。
    // 頭上の先端は固定し、既存の形・材質・描画の束をそのまま使う。
    // 稲生は命中の形を少し保ってから戻す。連打の合間にも当たった本人が分かる。
    const hitLeft = ((oke ? u.okeHitUntil : inou ? u.inouHitUntil : u.moribeHitUntil) || 0) - rt.t;
    // 稲生・森部・桶狭間は一撃ごとに短く広がり、その後は小さく残す。稲生の命中時間は保つ。
    const hit = foe && special
      ? Math.max(Math.min(1, Math.max(0, (hitLeft - (inou ? 1.55 : 2.05)) / (inou ? .4 : .35))), .3 * Math.min(1, Math.max(0, hitLeft / .6)))
      : 0;
    const reachable = foe && u === readyEnemy;
    // 森部の命中は同じ赤い▼を大きくして示す。空振りでは変わらない。
    // 稲生は「届く＝幅広い▼」「命中＝一度だけ広がる▼」。残りの命は中の赤の面積で示す。
    const pulse = still ? special && hit > 0 ? 1 : 0 : hit;
    // 桶狭間は画面外の▼を端へ寄せない。実際の兵の頭上だけに置く。
    if (foe && !moribe && !oke && !inou) {
      // 画面外の兵を端へ寄せると、見えている味方に剣が付いて見える。
      headPos.copy(v).applyMatrix4(cam.projectionMatrix);
      if (Math.abs(headPos.x) > 1 || Math.abs(headPos.y) > 1) continue;
      headPos.copy(v).applyMatrix4(cam.matrixWorld);
    }
    // 森部・桶狭間の▼は本人の頭上から動かさない。画面外の敵を端へ集めると、
    // 手前の味方の印に見えてしまう。投影後の画面端で自然に切れるようにする。
    // 森部は届く一人だけ横に広げ、命中した時だけ縦にも広げる。
    // 間合いに入っただけの変化と、実際に命を減らした変化を分ける。
    const width = oke ? pixels + 14 * pulse : (moribe || inou) ? pixels * (1 + .45 * pulse) : pixels;
    const k = Math.min(u === commander ? 32 : moribe ? 5 : (inou || oke) && u === missionEnemy ? 8 : 3, width * -v.z * 2 / (innerHeight * cam.projectionMatrix.elements[5] * .34)) *
      (moribe || inou ? 1 : 1 + (pulse > 0 ? 1.2 * pulse : reachable && !oke ? .55 : 0));
    dummy.position.copy(headPos);
    dummy.quaternion.copy(q);
    // 桶狭間も、届く相手は横幅、命中は縦の伸びで区別する。先端は頭上に固定。
    // 桶狭間は届く時は幅だけ、命中時は高さだけを変え、空振りと区別する。
    const okeScale = oke ? Math.min(u === missionEnemy ? 8 : 3, pixels * -v.z * 2 / (innerHeight * cam.projectionMatrix.elements[5] * .34)) : k;
    dummy.scale.set(oke ? okeScale * (reachable ? 1.6 : 1) : moribe || inou ? k * (reachable ? 1.6 : 1) : k * (1 + .5 * pulse),
      oke || moribe || inou ? (oke ? okeScale : k) * (1 + pulse) : k, oke ? okeScale : k);
    if (threatening && !hit) { dummy.scale.x *= .8; dummy.scale.y *= 1.8; }
    if (defeated) dummy.scale.multiplyScalar(Math.max(0, Math.min(1, (defeatUntil - rt.t - 1.2) / 1.2)));
    dummy.updateMatrix();
    if (foe) {
      // 森部も赤の高さを命の残りにそろえ、一撃ごとの減りを隠さない。
      const life = special ? Math.max(0, Math.min(1, u.hp / (u.maxHp || 1))) : Math.sqrt(Math.max(.16, Math.min(1, u.hp / (u.maxHp || 1))));
      // 届く敵の▼は最後に描き、重なった所でも上に出す。
      const justHit = special && hitLeft > (inou ? 1.95 : 2.05);
      const tone = justHit ? 3 : hot ? 2 : (inou || moribe) && u !== missionEnemy && meD2 > 25 * 25 ? 0 : 1;
      if (special) {
        const c = s.signPool[s.signCandidates.length];
        c.u = u; c.matrix.copy(dummy.matrix); c.life = life;
        // 届く本人・命中直後・桶狭間で追う本人を、遠い兵の印で覆わせない。
        c.hot = moribe || inou ? hot ? 2 : justHit ? 1 : 0 : oke ? hot ? 3 : justHit ? 2 : u === missionEnemy ? 1 : 0 : hot;
        c.distance = Math.sqrt(meD2); c.tone = tone;
        v.copy(headPos).project(cam);
        // 画面外の兵は端へ寄せず、選択枠も使わない。
        if (Math.abs(v.x) <= 1.1 && Math.abs(v.y) <= 1.2 && v.z <= 1) s.signCandidates.push(c);
      }
      else if (special && hot && hotN < HOT) { hotM[hotN].copy(dummy.matrix); hotLife[hotN] = life; hotTone[hotN++] = tone; }
      else {
        if (special) {
          s.marks.geometry.attributes.signLife.setX(n, life);
          s.marks.geometry.attributes.signTone.setX(n, tone);
        }
        s.marks.setMatrixAt(n++, dummy.matrix);
      }
    }
    else s.allies.setMatrixAt(a++, dummy.matrix);
  }
  // 桶狭間も遠い▼から描き、追う本人の▼を最後に重ねる。
  if (special) n = drawOrderedSigns(s);
  for (let i = 0; i < hotN && n < CAP; i++, n++) {
    s.marks.setMatrixAt(n, hotM[i]);
    s.marks.geometry.attributes.signLife.setX(n, hotLife[i]);
    s.marks.geometry.attributes.signTone.setX(n, hotTone[i]);
  }
  s.marks.count = n; s.marks.instanceMatrix.needsUpdate = true;
  if (special) { s.marks.geometry.attributes.signLife.needsUpdate = true; s.marks.geometry.attributes.signTone.needsUpdate = true; }
  // 当たった敵の体の光（約0.12秒・一度だけ。点滅はしない）
  let g = 0;
  const hurt = rt.hurtGlow;
  if (hurt?.length) {
    for (let i = hurt.length - 1; i >= 0; i--) {
      const u = hurt[i];
      if (u.gone || !((u.hurtGlowUntil || 0) > rt.t)) { hurt.splice(i, 1); continue; }
      if (hide || g >= GLOW) continue;
      const sc = (u.bodyHeight || 1.72) / 1.72;
      dummy.position.set(u.pos.x, u.pos.y + (u.mounted ? 2.3 : .9 * sc), u.pos.z);
      dummy.quaternion.identity(); dummy.scale.setScalar(sc);
      dummy.updateMatrix(); s.glow.setMatrixAt(g++, dummy.matrix);
    }
  }
  s.glow.count = g; if (g) s.glow.instanceMatrix.needsUpdate = true;
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
