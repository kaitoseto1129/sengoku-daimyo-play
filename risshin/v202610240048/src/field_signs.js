// 戦場の頭上の印（全戦。kaito 10/23 稲生 40・41・46）
//   共通の敵は剣、味方は旗。頭の上に固定し、近くの兵を覆わない。
//   武将：今の行動に関係する一人の名と体力の棒
//   形と材質は戦ごとに一度だけ作り、毎コマ new しない。
import * as THREE from 'three';
import { sightScreenUnit, inouSignVisible, cameraWallBlocked } from './battle_sight.js';
import { markedEnemy } from './mission_pin.js';
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
  for (const color of [0xffffff, ['inou', 'okehazama', 'moribe'].includes(rt.def.key) ? 0xff342e : 0xff634d]) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 3; i++) colors.push(c.r, c.g, c.b);
  }
  if (!compact) tri.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // 赤い▼の中身だけを残りの命に合わせて減らす。外枠は保ち、棒や数字を足さない。
  const triMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false });
  // 稲生・桶狭間・森部では手前の兵や旗を透かさない。奥の敵の▼を味方の頭に重ねない。
  // 印の位置・候補は保ち、遮る物がなくなれば同じ本人の頭上に現れる。
  triMat.depthTest = rt.def.key === 'inou' || rt.def.key === 'okehazama' || rt.def.key === 'moribe';
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
        // 森部は赤い▼を保ち、幅と高さで間合い・命中を分ける。
        shader.vertexShader = shader.vertexShader.replace('if (signTone > 1.5) vColor = position.z > 0.0 ? vec3(1.0, 0.06, 0.02) : vec3(1.0);',
          rt.def.key === 'moribe' ? 'if (signTone > 1.5) vColor = position.z > 0.0 ? vec3(1.0, 0.06, 0.02) : (signTone > 2.5 ? vec3(1.0, 0.78, 0.36) : vec3(1.0));' :
          rt.def.key === 'inou' ? 'if (signTone > 1.5) vColor = position.z > 0.0 ? vec3(1.0, 0.06, 0.02) : (signTone > 2.5 ? vec3(1.0, 0.78, 0.36) : vec3(1.0));' :
          'if (signTone > 1.5) vColor = position.z > 0.0 ? vec3(1.0, 0.06, 0.02) : vec3(1.0);');
        shader.fragmentShader = 'varying vec3 vSignLevel;\n' + shader.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\nif (vSignLevel.x > 0.5 && vSignLevel.y > mix(0.065, 0.245, vSignLevel.z)) diffuseColor.rgb = vec3(0.007, 0.006, 0.005);');
        if (rt.def.key === 'moribe' || rt.def.key === 'inou' || rt.def.key === 'okehazama') {
          // 傷で赤が減っても敵の印は赤のまま。黒い▼を味方と取り違えさせない。
          shader.fragmentShader = shader.fragmentShader.replace(
            'diffuseColor.rgb = vec3(0.007, 0.006, 0.005);',
            'diffuseColor.rgb = vec3(0.32, 0.012, 0.006);');
          // 遠い敵も同じ赤で示す。距離の違いは印の大きさだけで伝える。
          shader.vertexShader = shader.vertexShader.replace(
            'vSignA = (signTone < 0.5 ? 0.55 : 1.0) * signFade;',
            'vSignA = signFade;');
        }
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
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff, transparent: true, opacity: .14, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
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
  // 稲生も共通の頭上印を保ち、大きな札への置き換えや周囲の縮小をしない。
  const marked = rt.def.key === 'inou' || rt.def.key === 'moribe' || rt.def.key === 'okehazama' ? null : markedEnemy(rt);
  const missionEnemy = marked || (rt.def.key === 'inou' || rt.def.key === 'okehazama' || rt.def.key === 'moribe' ? rt.def.missionSignTarget?.(rt) : null) || reachableTarget ||
    rt.hud.approachGuideEnemy || rt.hud.attackGuideEnemy || rt.hud.aimGuideEnemy ||
    (rt.player.lock?.alive ? rt.player.lock : null) || rt.missionGuide?.closeEnemy ||
    (rt.guideEnemyShown ? rt.guideEnemy : null);
  // 敵の剣は一人一つ。同じ相手へ別の印を重ねない。
  const focusEnemy = rt.army.missionMarkedEnemy || missionEnemy;
  rt.hud.outlinedEnemy = null;
  const moribe = rt.def.key === 'moribe';
  const commander = rt.def.commanderTarget?.(rt) || null;
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
    // 森部と稲生は最後に立っていた頭上で印を閉じ、倒した本人を示す。
    // 桶狭間は倒れ始めた瞬間に消し、重なった別人へ印を残さない。
    const defeatUntil = inou ? u.inouHitUntil : moribe ? u.moribeDefeatUntil : 0;
    const defeated = (moribe || inou) && (!u.alive || u.dying || u.downed || u.woundOut || u.rearWound) &&
      (defeatUntil || 0) - rt.t > (inou ? 1.85 : 0) && (!(inou || moribe) || u._inouSignY != null);
    if ((!u.alive || u.dying || u.woundOut || u.rearWound || u.downed) && !defeated || u.gone || u.isPlayer || u.isStruct || u.civ || u.type === 'dummy' || u.type === 'porter' || u.team > 1) continue;
    const dx = u.pos.x - P.x, dz = u.pos.z - P.z, d2 = dx * dx + dz * dz;
    const foe = u.team !== me.team;
    const meD2 = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2;
    // 届く予告は実際に攻撃できる一人だけ。横や背後の敵まで同時に強調しない。
    const hot = foe && reachHot > 0 && u.alive && ((moribe || inou || oke) ? u === reachableTarget : meD2 <= reachHot * reachHot);
    // 自分へ実際に振りかぶる敵は重ね順を上げる。届く予告・命中と同じ拡大を使わない。
    const incoming = moribe && foe && u.atk?.target === me && !u.atk.ranged && !u.atk.bow;
    const striking = moribe && foe && u.swing?.target === me && !u.swing.done;
    const danger = moribe && foe ? Math.max(
      incoming ? still ? 1 : Math.max(.2, Math.min(1, 1 - u.atk.t / Math.max(.05, u.atk.dur || u.windup || .6))) : 0,
      striking || u.moribeThreatUntil > rt.t && still ? 1 : 0,
      still ? 0 : Math.min(1, Math.max(0, ((u.moribeThreatUntil || 0) - rt.t) / .9))) : 0;
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
    if (!moribe && u === commander && u === rt.army.missionMarkedEnemy && rt.hud.missionEnemyShown) continue;
    if (general(u) && (u === commander && d2 < 180 * 180 || d2 < GEN_R * GEN_R || d2 < GEN_R * GEN_R * 1.3 && s.bound?.includes(u)) && !u.woundOut) { u._fsD = d2; gens.push(u); }
    if (quietSigns && (!s.nearby.includes(u) || !u._nearSignOn || meD2 > (foe ? 100 : 36) || u.fleeing || u.group?.routed || u.mesh?.visible === false || u.camHidden)) continue;
    if (quietSigns && !near && u === focusEnemy) {
      if (u._focusSignAt == null || rt.t >= u._focusSignAt || rt.t < u._focusSignAt - .2) {
        u._focusSignSeen = sightScreenUnit(rt, u); u._focusSignAt = rt.t + .2;
      }
      if (!u._focusSignSeen) continue;
    }
    // 狙う本人のひし形が出ている間は、同じ頭上に通常の印を重ねない。
    if (!moribe && u === focusEnemy && rt.hud.missionEnemyShown || u === marked && !oke && !inou) continue;
    if (inou && (u.mesh?.visible === false || u.camHidden)) continue;
    // 稲生・森部は敵の赤い▼だけ。味方の丸と重ねて所属を迷わせない。
    if ((moribe || inou || rt.def.key === 'okehazama') && !foe) continue;
    // 森部は見える敵全員へ同じ▼を付ける。控えや対岸の兵も所属を変えない。
    // 見通しの上限と揃え、武将だけ印が残る距離の違いをなくす。
    // 桶狭間も見える敵全員に付ける。目当て以外の兵だけ印が消える境を作らない。
    const signRadius = moribe || oke ? 170 : u === commander ? (u._fsOn ? 180 : 170) : (u._fsOn ? FOE_OUT : FOE_R);
    u._fsOn = near || inou || d2 < signRadius * signRadius;
    if ((foe && u.noTarget && !moribe && !oke && !rt.def.foeMarkVisible?.(rt, u)) || !u._fsOn || (special ? s.signCandidates.length : foe ? n : a) >= CAP) continue;
    if ((moribe || oke) && !near) {
      if (u.mesh?.visible === false || u.camHidden) continue;
      // 見通しは半秒ごと。判定も入れ物も兵ごとに使い回す。
      if (u._moribeSignAt == null || rt.t < u._moribeSignAt - .5 || rt.t >= u._moribeSignAt) {
        // 桶狭間は見える兵に必ず▼を残す。霧・槍・旗で所属の印だけ消さない。
        u._moribeSignSeen = !cameraWallBlocked(rt, P, u.pos, P.y, headY(u));
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
    // 三つの戦とも小柄な足軽の背丈に合わせ、笠と▼の空白を狭める。
    if ((oke || moribe || inou) && !u.mounted) headPos.y = u.pos.y + (u.bodyHeight || 1.72) + .15;
    if (inou || oke || moribe) {
      if (defeated) headPos.set(u._inouSignX, u._inouSignY, u._inouSignZ);
      else { u._inouSignX = headPos.x; u._inouSignY = headPos.y; u._inouSignZ = headPos.z; }
    }
    // 討った本人が倒れても、閉じる▼を隣の立っている兵へ動かさない。
    // 森部の討ち取りは、倒れ始めた本人の頭上で同じ▼を縮めて消す。
    if (moribe) {
      if (defeated && u._moribeSignY != null) headPos.set(u._moribeSignX, u._moribeSignY, u._moribeSignZ);
      else { u._moribeSignX = headPos.x; u._moribeSignY = headPos.y; u._moribeSignZ = headPos.z; }
    }
    // 稲生・森部・桶狭間とも立ち位置の上へ固定し、構えや突きの頭の揺れを追わない。
    v.copy(headPos).applyMatrix4(cam.matrixWorldInverse);
    if (v.z >= 0) continue;
    // 森部の討つ武将は近くの兵へ乗り換えず、大きな▼を保つ。
    // 任務の相手とは別でも、実際に今の攻撃が届く一人の▼を横に広げる。
    const readyEnemy = reachableTarget;
    // 追う一人の▼は近づくほど大きくする。足場のピンと同じ本人を示す。
    const approach = special && u === missionEnemy ? Math.max(0, 1 - Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) / 30) : 0;
    // 届く一人を大きくし、命中時は縦横に広げて少し保つ。
    // 討つ武将は別の大きさを保ち、任務の相手を見失わせない。
    // 稲生は追う一人を少し大きくし、届く時には幅も広げる。
    // 森部は振りかぶりを小さく、命中を大きく広げる。
    // 森部で探しているだけの敵を、刃が届く敵と同じ大きさにしない。
    // 命中後も大きさを別の時間で保たず、下の一度だけの拡大にそろえる。
    // 森部の間合いで高さを変えない。幅は届く一人、高さの変化は命中だけ。
    const pixels = !inou && marked && u !== marked && foe ? 9 : moribe ? (u === commander ? 32 : near ? 26 : 14) :
      // 稲生は隊長と追う本人の強調を保ち、近づくほど滑らかに大きくする。
      // 届く時は幅だけを広げ、高さの強調は命中に残す。
      inou ? (u === commander ? 34 : Math.max(18, 18 + 8 * Math.max(0, 1 - Math.sqrt(meD2) / 40), u === missionEnemy ? 28 + 6 * approach : 0)) :
      // 目当てと近い敵の読みやすさを保ち、近づくほど同じ▼を滑らかに大きくする。
      // 実際に届いた一人だけ、さらに白縁・幅広へ替える。
      oke ? (hot ? 34 : Math.max(u === missionEnemy || meD2 < 25 * 25 ? 22 : 15,
        15 + 13 * Math.max(0, 1 - Math.sqrt(meD2) / 40))) :
      foe ? (u === readyEnemy ? 24 : u === focusEnemy ? 22 : 18) : 14;
    // 稲生・森部・桶狭間では命を減らした相手の▼だけを一度大きくし、滑らかに戻す。
    // 頭上の先端は固定し、既存の形・材質・描画の束をそのまま使う。
    // 稲生は命中の形を少し保ってから戻す。連打の合間にも当たった本人が分かる。
    const hitLeft = ((oke ? u.okeHitUntil : inou ? u.inouHitUntil : u.moribeHitUntil) || 0) - rt.t;
    // 桶狭間は命中の拡大を少し長く保つ。減った赤はその後も本人に残る。
    const hit = foe && special
      ? Math.min(1, Math.max(0, (hitLeft - 1.2) / .5))
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
    // 稲生・森部は命中後によろめいて間合いを出ても、当たった本人の幅を保つ。
    // 森部の間合いは下で横幅だけに反映し、敵の振りかぶりでは広げない。
    const width = inou ? Math.max(pixels, hot ? 32 : 0, 32 * pulse) : oke ? pixels + 14 * pulse : moribe ? Math.max(pixels, 34 * pulse) : pixels;
    // 稲生は遠方でも頭ほどの幅まで。奥の▼だけが大きく並び、別人に付いて見えるのを防ぐ。
    // 間合い・命中の拡大は近くで残し、遠い兵の印は兵と一緒に小さくなる。
    // 基準の高さは間合いで変えず、横幅と命中の縦の伸びは下で別々に反映する。
    // 稲生の▼は実物の大きさをそろえる。近づけば兵と一緒に大きくなり、距離の縮まりが見える。
    // 森部も頭ほどの幅に収め、間合いと命中の拡大は下で一度だけ掛ける。
    const k = Math.min(inou || moribe ? (u === commander ? 1.5 : 1.2) : u === commander ? 32 : oke && u === missionEnemy ? 8 : 3, (inou ? 28 : moribe ? pixels : width) * -v.z * 2 / (innerHeight * cam.projectionMatrix.elements[5] * .34)) *
      (moribe || inou ? 1 : 1 + (pulse > 0 ? 1.2 * pulse : reachable && !oke ? .55 : 0));
    dummy.position.copy(headPos);
    dummy.quaternion.copy(q);
    // 桶狭間も、届く相手は横幅、命中は縦の伸びで区別する。先端は頭上に固定。
    // 桶狭間は届く時は幅だけ、命中時は高さだけを変え、空振りと区別する。
    // 命中の直後に敵がよろけて間合いを出ても、届いた時より小さくしない。
    // 同じ本人の幅を保ち、縦の伸びと赤の減りを読める時間を残す。
    const okePixels = Math.max(pixels, 34 * pulse);
    const okeScale = oke ? Math.min(u === missionEnemy ? 8 : 3, okePixels * -v.z * 2 / (innerHeight * cam.projectionMatrix.elements[5] * .34)) : k;
    // 防がれた接触は縦に潰す。傷を与えた時の縦の伸び・赤の減りとは分ける。
    const blocked = (oke || moribe) && !(hit > 0) && (oke ? u.okeBlockUntil : u.moribeBlockUntil) > rt.t;
    // 稲生は届く一人の幅をはっきり広げる。命中後も幅を保ち、縦の伸びを見せる。
    // 森部の横幅は届く本人だけ強調する。敵の振りかぶりと混同させない。
    dummy.scale.set(oke ? okeScale * Math.max(reachable ? 1.6 : 1, 1 + .6 * pulse) : moribe ? k * Math.max(width / pixels, reachable ? 2.2 : 1, 1 + .6 * pulse) : inou ? k * Math.max(width / pixels, reachable ? 2.2 : 1, 1 + 1.2 * pulse) : k * (1 + .5 * pulse),
      oke || moribe || inou ? (oke ? okeScale : k) * (blocked ? .55 : 1 + (moribe ? 1.2 : 1) * pulse) : k, oke ? okeScale : k);
    // 森部の討ち取りと稲生の討ち取りは、それぞれの時間で同じ本人の印を閉じる。
    if (defeated) dummy.scale.multiplyScalar(Math.max(0, Math.min(1,
      moribe ? (still ? 1 : (defeatUntil - rt.t) / .8) : (defeatUntil - rt.t - 1.85) / .55)));
    if (!inou && marked && foe && u !== marked) dummy.scale.multiplyScalar(.55);
    dummy.updateMatrix();
    if (foe) {
      // 森部も赤の高さを命の残りにそろえ、一撃ごとの減りを隠さない。
      const life = special ? Math.max(0, Math.min(1, u.hp / (u.maxHp || 1))) : Math.sqrt(Math.max(.16, Math.min(1, u.hp / (u.maxHp || 1))));
      // 届く敵の▼は最後に描き、重なった所でも上に出す。
      // 森部は白い別の印にせず、間合いも命中も赤い▼のまま保つ。
      const justHit = special && hitLeft > (oke ? 1.7 : inou ? 1.95 : 1.7);
      // 稲生は白縁やオレンジへ変えない。間合いは横幅、命中は縦の伸びと赤の減り。
      const tone = inou || moribe ? 1 : justHit ? 3 : hot ? 2 : 1;
      if (special) {
        const c = s.signPool[s.signCandidates.length];
        c.u = u; c.matrix.copy(dummy.matrix); c.life = life;
        // 届く本人・命中直後・桶狭間で追う本人を、遠い兵の印で覆わせない。
        // 桶狭間は命中した本人を最優先にし、遠い任務の敵より今いる場所の敵を上に描く。
        c.hot = moribe ? hit > 0 || defeated ? 4 : hot || blocked ? 3 : danger > 0 ? 2 : u === missionEnemy ? 1 : 0 : inou ? hot ? 4 : hit > 0 || defeated ? 3 : 0 : oke ? hit > 0 || defeated ? 5 : hot ? 4 : justHit ? 3 : meD2 < 25 * 25 ? u === missionEnemy ? 2 : 1 : 0 : hot;
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
  // 当たった敵の体の光（実時間で0.08秒・一度だけ。点滅はしない）
  let g = 0;
  const hurt = rt.hurtGlow;
  if (hurt?.length) {
    for (let i = hurt.length - 1; i >= 0; i--) {
      const u = hurt[i];
      if (u.gone || !((u.hurtGlowUntil || 0) > performance.now() / 1000)) { hurt.splice(i, 1); continue; }
      if (hide || g >= GLOW) continue;
      const sc = (u.bodyHeight || 1.72) / 1.72;
      dummy.position.set(u.pos.x, u.pos.y + (u.mounted ? 2.3 : .9 * sc), u.pos.z);
      dummy.quaternion.copy((u.body || u.mesh).quaternion); dummy.scale.setScalar(sc);
      dummy.updateMatrix(); s.glow.setMatrixAt(g++, dummy.matrix);
    }
  }
  s.glow.count = g; if (g) s.glow.instanceMatrix.needsUpdate = true;
  s.allies.count = a; s.allies.instanceMatrix.needsUpdate = true;
  if (gens.length > 1) gens.sort((a, c) => a._fsD - c._fsD);
  // 武将の体力の棒（黒い下地と色の棒）
  for (let i = 0; i < gens.length && b < BARS * 2; i++) {
    const u = gens[i];
    // 稲生・森部は武将も▼の赤で命を示し、別の棒を重ねない。
    if (moribe || inou) continue;
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
  // 稲生・森部の討つ名は右上の一行だけ。頭上には赤い▼を残す。
  if (moribe || inou) {
    for (const e of s.labels) if (!e.hidden) e.hidden = true;
    return;
  }
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
  // 札の数え：offsetParent は毎コマ画面の割り付けをやり直させる（iPhone で重い）。0.25 秒ごとに数え直す（10/24）
  const now = performance.now();
  if (!(now - (s.cardsAt || 0) < 250)) {
    s.cardsAt = now; s.cardsN = 0;
    for (const id of ['boss', 'target', 'prompt', 'wait-guard']) {
      const el = document.getElementById(id);
      if (el && !el.hidden && el.offsetParent && !el.classList.contains('notice-muted') && !el.classList.contains('symbol-only')) s.cardsN++;
    }
  }
  cards += s.cardsN;
  if (hud?.missionPinLabelShown) cards++;
  if (marked || hud?.missionEnemyShown) cards++;
  if (hud?.openingControlsActive) cards++;
  const rects = hud?.hudRects() || [];
  // 名札は一人に一枚を貼り続ける（毎コマ近い順に付け替えると字が入れ替わってちらつく。kaito 10/23「名前もチカチカ」）。
  const bound = s.bound || (s.bound = new Array(NAMES).fill(null));
  bound[0] = chosen || null;
  for (let i = 0; i < NAMES; i++) {
    const e = s.labels[i], u = bound[i];
    // 案内中の人物名は足元につながる共通ピンに任せ、二枚にしない。
    if (!u || u !== chosen || u === person || cards >= 3) { if (!e.hidden) e.hidden = true; continue; }
    const k = Math.min(2.2, Math.max(1, Math.sqrt(u._fsD) / 22));
    v.set(u.pos.x, headY(u) + (u === commander ? .12 : 0.5 * k), u.pos.z).project(cam);
    // 遠くても名が大きな▼と重ならないよう、画面上で間を空ける。
    if (u === commander) v.y += 76 / H;
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) { if (!e.hidden) e.hidden = true; continue; }
    const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
    const half = u.name.length * 7 + 8;
    if (rects.some((r) => x + half > r.left && x - half < r.right && y > r.top && y - 24 < r.bottom)) {
      if (!e.hidden) e.hidden = true; continue;
    }
    if (e._n !== u.name) { e._n = u.name; e.textContent = u.name; }
    const col = u.team === me.team ? '#f3dc9a' : '#ffc4b4';
    if (e._c !== col) { e._c = col; e.style.color = col; }
    if (e.hidden) e.hidden = false;
    // 動かすのは transform だけ。同じ所なら書かない（10/24）
    const tf = `translate(${Math.round((v.x + 1) / 2 * W)}px,${Math.round((1 - v.y) / 2 * H)}px) translate(-50%,-100%)`;
    if (e._t !== tf) { e._t = tf; e.style.transform = tf; }
  }
}
