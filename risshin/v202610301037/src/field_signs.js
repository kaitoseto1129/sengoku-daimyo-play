// 戦場の頭上の印（全戦。kaito 10/23 稲生 40・41・46）
//   共通の敵は刀、味方は旗。頭の上に固定し、近くの兵を覆わない。
//   武将：今の行動に関係する一人の名と体力の棒
//   形と材質は戦ごとに一度だけ作り、毎コマ new しない。
import * as THREE from 'three';
import { sightScreenUnit, inouSignVisible, inouSignHeight, cameraWallBlocked } from './battle_sight.js';
import { markedEnemy } from './mission_pin.js';
import { enemyKnown } from './battle_intel.js';
import { reduceMotion } from './settings.js';
import { VIEW, safeInsets } from './viewport.js';

const CAP = 360, BARS = 12, NAMES = 1, GLOW = 8, HOT = 16;
const hotM = Array.from({ length: HOT }, () => new THREE.Matrix4()), hotLife = new Float32Array(HOT), hotTone = new Float32Array(HOT);
const FOE_R = 55, FOE_OUT = 62, GEN_R = 60, NEAR_R = 18, NEAR_OUT = 22;
const BAR_FOE = new THREE.Color(0xe8452c), BAR_ALLY = new THREE.Color(0xe8c25a), BAR_BG = new THREE.Color(0x14120f);
const STATE = new WeakMap();
const dummy = new THREE.Object3D(), v = new THREE.Vector3(), headPos = new THREE.Vector3();

const general = (u) => !!u.name && !u.isSub && (u.type === 'busho' || u.type === 'samurai');
const headY = (u) => (u.pos.y || 0) + (u.mounted ? 3.05 : 2.1);

// 一枚の形に暗い外縁と明るい内側を重ね、描画の束を増やさない。
function outlinedSign(points, tone, thin = false) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  const face = new THREE.ShapeGeometry(shape).toNonIndexed();
  const source = face.getAttribute('position'), positions = [], colors = [];
  for (let layer = 0; layer < 2; layer++) {
    const color = new THREE.Color(layer ? tone : thin ? 0x2a231b : 0x14120f);
    for (let i = 0; i < source.count; i++) {
      const x = source.getX(i), y = source.getY(i);
      positions.push(layer ? x * (thin ? .74 : .68) : x, layer ? .24 + (y - .24) * (thin ? .88 : .82) : y, layer * .001);
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
  // 共通の敵は刀、味方は旗。序盤三戦の命中表示は専用の形を保つ。
  const swordSigns = !rt.def.dojo && !['lesson', 'raid', 'ford', 'practice'].includes(rt.def.missionStyle);
  const tri = outlinedSign(swordSigns
    // 刀の印は細身にし、色は褪せた弁柄（太い原色の十字に見せない。B5）
    ? [[-.026,0],[.026,0],[.026,.085],[.11,.085],[.11,.115],[.034,.115],[.034,.29],[0,.34],[-.034,.29],[-.034,.115],[-.11,.115],[-.11,.085],[-.026,.085]]
    : [[0,0],[.17,.34],[-.17,.34]], swordSigns ? 0x8a4a38 : 0xa8452c, swordSigns);
  const triMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false,
    transparent: swordSigns, opacity: swordSigns ? .82 : 1 });   // 刀の印は少し透かして景色になじませる（B5）
  // 稲生・桶狭間・森部は旗や兵との奥行きも保つ。奥の▼を手前の味方へ透かさない。
  // 頭上の固定位置と遠方の大きさの上限を保ち、手前の別人へ印を移さない。
  triMat.depthTest = rt.def.dojo || ['lesson', 'raid', 'ford', 'practice'].includes(rt.def.missionStyle);
  if (rt.def.missionStyle) {
    tri.setAttribute('signLife', new THREE.InstancedBufferAttribute(new Float32Array(CAP).fill(1), 1));
    // signTone：0＝遠い敵（薄い）、1＝ふつう、2＝槍の届く敵（同じ赤い▼のまま、縁を白・中を濃い赤に。別の印に見せない）
    tri.setAttribute('signTone', new THREE.InstancedBufferAttribute(new Float32Array(CAP).fill(1), 1));
    tri.setAttribute('signFade', new THREE.InstancedBufferAttribute(new Float32Array(CAP).fill(1), 1));
    if (['ford', 'lesson', 'raid', 'practice'].includes(rt.def.missionStyle)) tri.setAttribute('signLoss', new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1));
    triMat.transparent = true;
    triMat.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute float signLife;\nattribute float signTone;\nattribute float signFade;\nvarying float vSignA;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nif (position.z > 0.0) { transformed.xy = vec2(0.0, 0.065) + (position.xy - vec2(0.0, 0.065)) * signLife; }')
        .replace('#include <color_vertex>', '#include <color_vertex>\nvSignA = (signTone < 0.5 ? 0.55 : 1.0) * signFade;\nif (signTone > 1.5) vColor = position.z > 0.0 ? vec3(0.42, 0.06, 0.03) : vec3(1.0);');
      shader.fragmentShader = 'varying float vSignA;\n' + shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vSignA );');
      if (rt.def.missionStyle) {
        // 赤の高さが命の残り。小さな赤い点へ縮めず、黒い空きが増える▼にする。
        shader.vertexShader = 'varying vec3 vSignLevel;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          'if (position.z > 0.0) { transformed.xy = vec2(0.0, 0.065) + (position.xy - vec2(0.0, 0.065)) * signLife; }',
          'vSignLevel = vec3(position.z > 0.0 ? 1.0 : 0.0, position.y, signLife);');
        // 森部は間合いでも縁の色を替えず、どの敵も同じ赤い▼を保つ。
        shader.vertexShader = shader.vertexShader.replace('if (signTone > 1.5) vColor = position.z > 0.0 ? vec3(0.42, 0.06, 0.03) : vec3(1.0);',
          rt.def.missionStyle === 'ford' ? '' :
          rt.def.missionStyle === 'lesson' ? 'if (mod(signTone, 8.0) == 2.0) vColor = position.z > 0.0 ? vec3(0.42, 0.06, 0.03) : vec3(1.0);' :
          // 桶狭間は届く本人だけ白縁へ替える。赤い▼の横幅と明るい中身も保つ。
          'if (mod(signTone, 8.0) == 2.0 || mod(signTone, 8.0) == 6.0) vColor = position.z > 0.0 ? vec3(0.50, 0.16, 0.07) : vec3(1.0);');
        if (rt.def.missionStyle !== 'raid' && rt.def.missionStyle !== 'ford') {
          // 色の値に足した８で近さを分ける。命中の色だけでは遮蔽を避けない。
          // 森部は本人の奥行きを保つ。手前の味方や旗へ敵の印を透かさない。
          // 遠い▼は奥行きを保ち、印の先端は本人の頭上から動かさない。
          shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
            '#include <project_vertex>\nif (signTone > 8.5) gl_Position.z = -0.99 * gl_Position.w;');
        }
        shader.fragmentShader = 'varying vec3 vSignLevel;\n' + shader.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\nif (vSignLevel.x > 0.5 && vSignLevel.y > mix(0.065, 0.245, vSignLevel.z)) diffuseColor.rgb = vec3(0.007, 0.006, 0.005);');
        if (rt.def.missionStyle) shader.fragmentShader = shader.fragmentShader.replace('mix(0.065, 0.245, vSignLevel.z)', 'mix(0.03, 0.26, vSignLevel.z)');
        if (rt.def.missionStyle) {
          // 森部は傷で空いた部分を暗くし、残る赤との面積差をはっきり示す。
          // 稲生の減った部分も暗く空け、一撃ごとの赤の減りを見せる。
          shader.fragmentShader = shader.fragmentShader.replace(
            'diffuseColor.rgb = vec3(0.007, 0.006, 0.005);',
            rt.def.missionStyle === 'lesson'
              ? 'diffuseColor.rgb = vec3(0.007, 0.006, 0.005);'
              : rt.def.missionStyle === 'ford'
              ? 'diffuseColor.rgb = vec3(0.007, 0.006, 0.005);'
              : 'diffuseColor.rgb = vec3(0.007, 0.006, 0.005);');
          // 遠い敵も同じ赤で示す。距離の違いは印の大きさだけで伝える。
          shader.vertexShader = shader.vertexShader.replace(
            'vSignA = (signTone < 0.5 ? 0.55 : 1.0) * signFade;',
            'vSignA = signFade;');
        }
      }
      if (['ford', 'lesson', 'raid', 'practice'].includes(rt.def.missionStyle)) {
        // 残る赤の面積を体力に合わせ、今回失った面だけを短く明るく残す。
        // 同じ▼の中だけで描き、印や描画の束を増やさない。
        shader.vertexShader = 'attribute float signLoss;\nvarying float vSignLoss;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('vSignLevel = vec3(position.z > 0.0 ? 1.0 : 0.0, position.y, signLife);',
          'vSignLevel = vec3(position.z > 0.0 ? 1.0 : 0.0, position.y, sqrt(signLife)); vSignLoss = signLoss;');
        shader.fragmentShader = 'varying float vSignLoss;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          'diffuseColor.rgb = vec3(0.007, 0.006, 0.005);',
          // 稲生は今削った赤の部分を白く残して閉じる。空振り・防御では出さない。
          rt.def.missionStyle === 'ford'
            ? 'diffuseColor.rgb = vSignLevel.y <= mix(0.03, 0.26, vSignLoss) ? vec3(1.0, 0.9, 0.8) : vec3(0.32, 0.025, 0.012);'
            : rt.def.missionStyle === 'lesson'
            ? 'diffuseColor.rgb = vSignLevel.y <= mix(0.03, 0.26, vSignLoss) ? vec3(1.0, 0.9, 0.8) : vec3(0.035, 0.008, 0.005);'
            : 'diffuseColor.rgb = vSignLevel.y <= mix(0.03, 0.26, vSignLoss) ? vec3(1.0, 0.9, 0.8) : (vSignLevel.z > 0.0 ? vec3(0.22, 0.008, 0.004) : vec3(0.007, 0.006, 0.005));');
      }
      if (swordSigns) shader.fragmentShader = shader.fragmentShader.replace('mix(0.03, 0.26, vSignLevel.z)', 'mix(0.03, 0.34, vSignLevel.z)');
    };
  }
  const marks = new THREE.InstancedMesh(tri, triMat, CAP);
  marks.count = 0; marks.frustumCulled = false; marks.renderOrder = 5;
  const circle = outlinedSign([[-.10,0],[-.05,0],[-.05,.17],[.14,.17],[.09,.24],
    [.14,.31],[-.10,.31]], 0xffedb0);
  const allyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false, depthTest: false });
  const allies = new THREE.InstancedMesh(circle, allyMat, CAP);
  allies.count = 0; allies.frustumCulled = false; allies.renderOrder = 5;
  const bar = new THREE.PlaneGeometry(1, 0.045); bar.translate(0.5, 0, 0);
  const barMat = new THREE.MeshBasicMaterial({ vertexColors: false, side: THREE.DoubleSide, fog: false, depthWrite: false, depthTest: rt.def.missionStyle !== 'lesson' });
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
  box.hidden = true;
  // 透明な親枠を画面いっぱいに広げない。札を隠した時に命や任務との重なりとして残さない。
  // 名は頭上の投影位置に置き、実際の札との重なりは下の判定で避ける。
  box.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;overflow:visible';
  const labels = [];
  for (let i = 0; i < NAMES; i++) {
    const e = document.createElement('div');
    e.className = 'field-name';
    e.style.cssText = 'position:absolute;left:0;top:0;padding:1px 6px;border-radius:3px;background:rgba(14,12,10,.72);font-size:14px;line-height:1.35;font-weight:600;white-space:nowrap;text-shadow:0 1px 2px #000;will-change:transform';
    e.hidden = true; box.appendChild(e); labels.push(e);
  }
  (root || document.body).appendChild(box);
  const s = { marks, allies, bars, glow, box, labels, gens: [], at: -1, nearby: [], nearbyAt: -1,
    signPool: Array.from({ length: !!rt.def.missionStyle ? CAP : 0 }, () => ({ matrix: new THREE.Matrix4() })),
    signCandidates: [], signCells: new Uint8Array(0) };
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

// 目当ての一人・届く本人・近い敵を優先し、重ならない八人まで描く。
// 候補の入れ物と行列は使い回し、密集した隊同士の総当たりをしない。
const signFocusFirst = (a, b) => Number(b.focus) - Number(a.focus) || Number(b.hot) - Number(a.hot) || a.distance - b.distance;
const signBackFirst = (a, b) => Number(a.hot) - Number(b.hot) || b.distance - a.distance;
function drawOrderedSigns(s, keepAll = false) {
  const list = s.signCandidates;
  // 目当てを先に確保し、重なる所属印だけを間引く。兵の数や戦い方は変えない。
  const cols = Math.ceil(VIEW.w / 24), rows = Math.ceil(VIEW.h / 24);
  if (s.signCells.length !== cols * rows) s.signCells = new Uint8Array(cols * rows);
  const cells = s.signCells; cells.fill(0);
  if (!keepAll) list.sort(signFocusFirst);
  let shown = 0;
  for (const c of list) {
    // 桶狭間は全ての敵の所属を残す。同じ描画の束で、本人の頭上から動かさない。
    if (keepAll) { c.shown = true; continue; }
    c.shown = false;
    if (shown >= 8) continue;
    const left = Math.max(0, Math.floor(c.left / 24)), right = Math.min(cols - 1, Math.floor(c.right / 24));
    const top = Math.max(0, Math.floor(c.top / 24)), bottom = Math.min(rows - 1, Math.floor(c.bottom / 24));
    c.shown = true;
    for (let y = top; y <= bottom && c.shown; y++) for (let x = left; x <= right; x++) {
      if (cells[y * cols + x]) { c.shown = false; break; }
    }
    if (c.shown) {
      shown++;
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) cells[y * cols + x] = 1;
    }
  }
  list.sort(signBackFirst);
  let n = 0;
  for (const c of list) {
    if (!c.shown) continue;
    s.marks.setMatrixAt(n, c.matrix);
    s.marks.geometry.attributes.signLife.setX(n, c.life);
    s.marks.geometry.attributes.signTone.setX(n, c.tone);
    if (s.marks.geometry.attributes.signLoss) s.marks.geometry.attributes.signLoss.setX(n, c.loss);
    s.marks.geometry.attributes.signFade.setX(n++, c.fade);
  }
  s.marks.geometry.attributes.signFade.needsUpdate = true;
  if (s.marks.geometry.attributes.signLoss) s.marks.geometry.attributes.signLoss.needsUpdate = true;
  return n;
}

export function fieldSignsTick(rt, root) {
  if (!rt?.army || !rt.scene || !rt.camera || rt.def.noFieldSigns) return;
  const s = STATE.get(rt) || build(rt, root);
  const me = rt.player.u, cam = rt.camera, P = cam.position, q = cam.quaternion;
  const quietSigns = !rt.def.missionStyle && !rt.def.dojo;
  const photo = root?.classList?.contains('photo') || rt.player.camShot;
  const hide = photo || rt.hud?.introWaiting;
  // 稲生・森部は名を任務の一行に集める。空の親枠も隠し、命や任務の札に重ねない。
  // 桶狭間も名前は任務の一行へ集め、頭上には赤い▼だけを残す。
  const hideNames = !!hide || rt.def.missionStyle === 'ford' || rt.def.missionStyle === 'raid';
  if (s.box.hidden !== hideNames) s.box.hidden = hideNames;
  // 間合い内の相手・狙う相手・すぐ近くの敵を先に示す。攻撃の判定は変えない。
  const reachableTarget = rt.player.inRange && rt.player.rangeCueTarget?.alive ? rt.player.rangeCueTarget : null;
  // 任務の一行と同じ本人を、大きな頭上印の目当てにする。
  const marked = markedEnemy(rt);
  const crossing = rt.def.missionStyle === 'ford' && !rt.flags.signal && !rt.flags.fordThreat;
  // 攻撃で狙った相手は、倒すまで同じ▼を一段大きく保つ（新しい印は足さない）。
  const lockEnemy = rt.def.autoTargetCamera && rt.player.cameraTargetValid?.(rt.player.cameraTarget) ? rt.player.cameraTarget : null;
  // 森部は命中した本人と討つ武将を先に保つ。次に届く別人へ目当てを移さない。
  const missionEnemy = crossing ? null : marked || (rt.def.missionStyle === 'ford' ? rt.def.missionSignTarget?.(rt) : null) || (rt.def.missionStyle === 'raid' ? reachableTarget : null) || lockEnemy || (rt.def.missionStyle && rt.def.missionStyle !== 'ford' ? rt.def.missionSignTarget?.(rt) : null) || reachableTarget ||
    rt.hud.approachGuideEnemy || rt.hud.attackGuideEnemy || rt.hud.aimGuideEnemy ||
    (rt.player.lock?.alive ? rt.player.lock : null) || rt.missionGuide?.closeEnemy ||
    (rt.guideEnemyShown ? rt.guideEnemy : null);
  // 敵の赤い▼は一人一つ。同じ相手へ別の印を重ねない。
  const focusEnemy = rt.hud.missionDefenseShown ? null : missionEnemy;
  rt.hud.outlinedEnemy = null;
  const ford = rt.def.missionStyle === 'ford';
  const commander = rt.def.commanderSignTarget?.(rt) || rt.def.commanderTarget?.(rt) || null;
  const lesson = rt.def.missionStyle === 'lesson';
  // 白縁は実際に届く本人だけに使う。追う相手の選択だけでは変えない。
  const practiceGroup = lesson ? rt.def.enemyTriangleGroup?.(rt) : null;
  // 稽古場も同じ▼で所属・間合い・命中を示す。形と描画の束は増やさない。
  const raid = rt.def.missionStyle === 'raid' || rt.def.missionStyle === 'practice';
  s.signCandidates.length = 0;
  // 共通の印は近い敵四人・味方二人まで。行き先の印を優先する。
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
      u._nearSignOn = !overlap && (foe ? foes < 4 : allies < 2);
      if (u._nearSignOn) { if (foe) foes++; else allies++; }
      u._nearSignLarge = u._nearSignOn && u._nearSignDanger && danger++ < 3;
    }
  }
  const still = reduceMotion();
  const special = ford || lesson || raid, pl = rt.player;
  // 槍（今の武器）の届く距離。攻撃を押せば向き直って届く所まで（player.js の strike と揃える）
  const reachHot = special && pl.weapon !== 'gun' && pl.weapon !== 'bow' && pl.meleeReach ? pl.meleeReach(pl.weapon === 'sword' ? 'slash' : 'thrust') + .35 : 0;
  let n = 0, a = 0, b = 0, hotN = 0;
  const gens = s.gens; gens.length = 0;
  if (!hide) for (const u of rt.army.units) {
    // 討ち取りは本人の最後の頭上で空の▼を閉じる。次の敵へ反応を移さない。
    const defeatUntil = lesson ? u.inouDefeatUntil : ford ? u.moribeDefeatUntil : raid ? u.okeDefeatUntil : 0;
    const defeated = special && (!u.alive || u.dying || u.hp <= 0 || u.downed || u.woundOut || u.rearWound) &&
      (defeatUntil || 0) > rt.t && u._inouSignY != null;
    // 森部は倒れた本人の印を即座に消し、次の生きた敵だけを示す。
    if (ford && (defeated || u.hp <= 0)) continue;
    // 退く敵も所属は変わらない。生きた本人の▼を追撃中に消さない。
    // 近くの兵の形が省略されても所属の▼を先に消さない。遠方の見通しは下で調べる。
    if (lesson && !defeated && u.hp <= 0) continue;
    if ((!u.alive || u.dying || u.woundOut || u.rearWound || u.downed) && !defeated || u.gone && !(special && defeated) || u.isPlayer || u.isStruct || u.civ || u.type === 'dummy' || u.type === 'porter' || u.team > 1) continue;
    const dx = u.pos.x - P.x, dz = u.pos.z - P.z, d2 = dx * dx + dz * dz;
    const foe = u.team !== me.team;
    // 大きな案内が出ている時だけ重複を避ける。稲生も本人の▼で間合いと命中を返す。
    if (foe && rt.hud.missionEnemyShown) continue;
    // 一人を追う戦では周囲へ刀を並べず、今の相手の頭上印に絞る。
    if (foe && rt.def.focusEnemySignOnly && (u !== focusEnemy || !rt.hud.missionEnemyShown)) continue;
    const playerDistance = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2;
    if (playerDistance > (foe ? ford || raid ? 170 * 170 : lesson ? (u._fsOn ? FOE_OUT * FOE_OUT : FOE_R * FOE_R) : rt.def.dojo ? FOE_R * FOE_R : 14 * 14 : 6 * 6) && u !== focusEnemy && !defeated) continue;
    if (!foe && rt.missionGuide?.marker?.guideTalk && rt.missionGuide.marker.guidePerson?.() === u) continue;
    // 稲生も見える敵全員に▼を残す。目当て以外を味方に見せない。
    // 追う本人は大きさ、攻撃が届く本人は白縁で区別する。
    // 追う相手が替わっても、命中した本人の▼を残す。
    const meD2 = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2;
    // 近くの味方は丸。既存の描画の束と行列を使い、人数や戦い方は変えない。
    if (!foe) {
      // 味方は近い二人の旗だけ。集合先の大きな案内と区別する。
      if (ford || a >= Math.min(2, rt.def.nearbyAllySignLimit ?? 2) || meD2 > 36 || u.fleeing || u.mesh?.visible === false || u.camHidden) continue;
      v.set(u.pos.x, headY(u) + .12, u.pos.z).applyMatrix4(cam.matrixWorldInverse);
      if (v.z >= 0) continue;
      if (u._allySignAt == null || rt.t >= u._allySignAt || rt.t < u._allySignAt - .2) {
        u._allySignSeen = sightScreenUnit(rt, u); u._allySignAt = rt.t + .2;
      }
      if (!u._allySignSeen) continue;
      const size = 20 * -v.z * 2 / (innerHeight * cam.projectionMatrix.elements[5] * .34);
      dummy.position.set(u.pos.x, headY(u) + .12, u.pos.z);
      dummy.quaternion.copy(q); dummy.scale.setScalar(Math.min(2, size)); dummy.updateMatrix();
      s.allies.setMatrixAt(a++, dummy.matrix);
      continue;
    }
    // 小戦の対象を覚える。所属の赤い▼は周囲の敵にも残す。
    const practiceEnemy = practiceGroup && u.group === practiceGroup && u.hp > 0 &&
      !u.fleeing && !u.downed && !u.woundOut && !u.rearWound && !u.dying;
    // 届く予告は実際に攻撃できる一人だけ。横や背後の敵まで同時に強調しない。
    const hot = foe && reachHot > 0 && u.alive && ((ford || lesson || raid) ? u === reachableTarget : meD2 <= reachHot * reachHot);
    // 森部の印は自分が届く相手と命中だけを示す。敵の予備動作は本人の動きで見せる。
    // 近い敵は人数・重なり・体の描画省略で消さない。距離は本人から測り、境に幅を持たせる。
    const nearRadius = u._fsNearOn ? NEAR_OUT : NEAR_R;
    const near = foe && (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 < nearRadius * nearRadius;
    u._fsNearOn = near;
    // 桶狭間は実際に描く▼の先端まで壁を調べる。低い別の点で所属の印だけ消さない。
    const signY = raid || ford ? u.pos.y + inouSignHeight(u) : headY(u);
    if (near) {
      // 壁だけを五分の一秒ごとに調べる。画面端や霧による出入りを混ぜない。
      if (u._fsNearAt == null || rt.t < u._fsNearAt - .2 || rt.t >= u._fsNearAt) {
        u._fsNearSeen = !cameraWallBlocked(rt, P, u.pos, P.y, lesson ? u.pos.y + inouSignHeight(u) : signY);
        u._fsNearAt = rt.t + .2;
      }
      if (!u._fsNearSeen) continue;
    }
    // 体力の横棒だけを遠くに残さず、同じ本人の▼と揃える。
    // 森部は近くても姿を描いていない本人へ▼を浮かべない。見失った相手へはピンが導く。
    if (ford && !defeated && !inouSignVisible(rt, u)) continue;
    // 桶狭間は描いていない体へ印だけを残さない。近い兵も同じ扱いにする。
    if (raid && !defeated && (u.mesh?.visible === false || u.camHidden)) continue;
    if (lesson && !defeated && !near && !general(u) && foe && !inouSignVisible(rt, u)) continue;
    if (!ford && !lesson && !raid && u === commander && u === rt.army.missionMarkedEnemy && rt.hud.missionEnemyShown) continue;
    if (general(u) && (u === commander && d2 < 180 * 180 || d2 < GEN_R * GEN_R || d2 < GEN_R * GEN_R * 1.3 && s.bound?.includes(u)) && !u.woundOut) { u._fsD = d2; gens.push(u); }
    if (quietSigns && !(u === commander && rt.def.foeMarkVisible?.(rt, u)) && (!s.nearby.includes(u) || !u._nearSignOn || meD2 > (foe ? 100 : 36) || u.fleeing || u.group?.routed || u.mesh?.visible === false || u.camHidden)) continue;
    if (quietSigns && !near && u === focusEnemy) {
      if (u._focusSignAt == null || rt.t >= u._focusSignAt || rt.t < u._focusSignAt - .2) {
        u._focusSignSeen = sightScreenUnit(rt, u); u._focusSignAt = rt.t + .2;
      }
      if (!u._focusSignSeen) continue;
    }
    // 大きな目標の▼が出ている間は、同じ頭上に通常の印を重ねない。
    if (u === rt.army.missionMarkedEnemy && rt.hud.missionEnemyShown || u === marked && !raid && !lesson && !ford && !rt.def.dojo) continue;
    if (lesson && !defeated && !near && !general(u) && (u.mesh?.visible === false || u.camHidden)) continue;
    // 近い味方の丸は上で描いたので、遠い味方へ印を増やさない。
    if ((ford || lesson || rt.def.missionStyle === 'raid') && !foe) continue;
    // 森部は見える敵全員へ同じ▼を付ける。控えや対岸の兵も所属を変えない。
    // 見通しの上限と揃え、武将だけ印が残る距離の違いをなくす。
    // 桶狭間も見える敵全員に付ける。目当て以外の兵だけ印が消える境を作らない。
    const signRadius = ford || raid ? 170 : u === commander ? (u._fsOn ? 180 : 170) : (u._fsOn ? FOE_OUT : FOE_R);
    u._fsOn = near || lesson || d2 < signRadius * signRadius;
    if ((foe && u.noTarget && !ford && !raid && !rt.def.foeMarkVisible?.(rt, u)) || !u._fsOn || (special ? s.signCandidates.length : foe ? n : a) >= CAP) continue;
    if ((ford || raid) && !near) {
      if (u.mesh?.visible === false || u.camHidden) continue;
      // 見通しは半秒ごと。判定も入れ物も兵ごとに使い回す。
      if (u._moribeSignAt == null || rt.t < u._moribeSignAt - .5 || rt.t >= u._moribeSignAt) {
        // 桶狭間は体の見通しも調べる。坂や霧に隠れた体から▼だけ浮かせない。
        u._moribeSignSeen = raid ? sightScreenUnit(rt, u) && !cameraWallBlocked(rt, P, u.pos, P.y, signY)
          : !cameraWallBlocked(rt, P, u.pos, P.y, signY);
        u._moribeSignAt = rt.t + .5;
      }
      if (!u._moribeSignSeen) continue;
    }
    // 敵の三角は味方の丸より大きくし、乱戦でも形を読み取れる幅に保つ。
    // 笠や肩が重なる近接戦でも、▼の先端を笠より上に保つ。
    headPos.set(u.pos.x, headY(u) + .12, u.pos.z);
    // 桶狭間も見通しと同じ頭上へ固定し、笠に埋もれさせない。頭の揺れは追わない。
    if (raid) headPos.y = signY;
    // 森部は密集しても笠に埋まらない高さを保つ。
    if (ford) headPos.y = signY;
    // 稲生は共通の見通しとピンの投影に高さをそろえる。
    if (lesson) headPos.y = u.pos.y + inouSignHeight(u);
    if (lesson || raid || ford) {
      if (defeated) headPos.set(u._inouSignX, u._inouSignY, u._inouSignZ);
      else { u._inouSignX = headPos.x; u._inouSignY = headPos.y; u._inouSignZ = headPos.z; }
    }
    // 討った本人が倒れても、閉じる▼を隣の立っている兵へ動かさない。
    // 森部の討ち取りは、倒れ始めた本人の頭上で同じ▼を縮めて消す。
    if (ford) {
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
    // 届く一人を大きくし、命中時は縦横に広げて少し保つ。
    // 討つ武将は別の大きさを保ち、任務の相手を見失わせない。
    // 稲生は追う一人を少し大きくし、届く時には幅も広げる。
    // 森部は振りかぶりを小さく、命中を大きく広げる。
    // 森部で探しているだけの敵を、刃が届く敵と同じ大きさにしない。
    // 命中後も大きさを別の時間で保たず、下の一度だけの拡大にそろえる。
    // 森部の間合いで高さを変えない。幅は届く一人、高さの変化は命中だけ。
    // 森部は接近だけで急に大きくしない。横幅が急に変わるのは実際に届く一人だけ。
    // 桶狭間は目当てを選んでも、周りの敵の所属を示す▼を小さくしない。
    // 森部の一般兵は距離に合わせて滑らかに拡大し、接近だけでは命中の伸びを起こさない。
    // 任務の一人は読みやすい大きさを保ち、討つ武将は新しい上限で示す。
    // 一般兵は同じ大きさ。届く本人と命中した本人だけを強調し、遠い一人を必須の敵に見せない。
    // 森部の一般兵は同じ基準幅。選び直しや命中の時間切れで大きさを跳ねさせない。
    // 森部は武将も同じ基準。大きさの違いを「届く」と取り違えさせない。
    const pixels = !special && foe ? (u === readyEnemy ? 24 : u === focusEnemy ? 21 : 17) * Math.max(.55, Math.min(1, 1.12 - Math.sqrt(meD2) / 55)) : ford ? 12 + 4 * Math.max(0, Math.min(1, (36 - Math.sqrt(meD2)) / 18)) :
      // 稲生は遠い兵を小さくし、手前の別人の頭へかぶせない。
      lesson ? (general(u) ? 36 : u === commander ? 30 : u === missionEnemy ? 28 : 14 + 8 * Math.max(0, Math.min(1, (30 - Math.sqrt(meD2)) / 20))) :
      // 目当てと近い敵の読みやすさを保ち、近づくほど同じ▼を滑らかに大きくする。
      // 実際に届いた一人だけ、さらに白縁・幅広へ替える。
      // 選び直しで大きさを跳ねさせず、本人までの接近だけを返す。
      raid ? 14 + 10 * Math.max(0, 1 - Math.sqrt(meD2) / 40) :
      foe ? (u === readyEnemy ? 24 : u === focusEnemy ? 22 : 18) : 14;
    // 稲生・森部・桶狭間では命を減らした相手の▼だけを一度大きくし、滑らかに戻す。
    // 頭上の先端は固定し、既存の形・材質・描画の束をそのまま使う。
    // 稲生は命中の形を少し保ってから戻す。連打の合間にも当たった本人が分かる。
    const hitLeft = ((raid ? u.okeHitUntil : lesson ? u.inouHitUntil : u.moribeHitUntil) || 0) - rt.t;
    // 森部は攻撃後も命中の形を保つ。赤の削れ跡は別に残す。
    // 稲生・桶狭間は命中直後の形を保ち、間合いの横広がりと区別できる。
    const hit = foe && special
      // 森部は次の操作を選ぶ間も一伸びを保ち、最後の〇・四秒で戻す。
      ? ford ? Math.min(1, Math.max(0, hitLeft / .4))
        : lesson ? Math.min(1, Math.max(0, hitLeft / .7))
        // 桶狭間も一振りごとに伸びて戻す。削れた面は別に残す。
        : Math.min(1, Math.max(0, hitLeft / .5))
      : 0;
    const reachable = foe && u === readyEnemy;
    // 森部の命中は同じ赤い▼を大きくして示す。空振りでは変わらない。
    // 稲生は「届く＝幅広い▼」「命中＝一度だけ広がる▼」。残りの命は中の赤の面積で示す。
    const pulse = still ? special && hit > 0 ? 1 : 0 : hit;
    // 桶狭間は画面外の▼を端へ寄せない。実際の兵の頭上だけに置く。
    if (foe && !ford && !raid && !lesson) {
      // 画面外の兵を端へ寄せると、見えている味方に敵の▼が付いて見える。
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
    const width = lesson ? Math.max(pixels, hot ? 32 : 0, 32 * pulse) : raid ? pixels + 14 * pulse : pixels;
    // 稲生は遠方でも頭ほどの幅まで。奥の▼だけが大きく並び、別人に付いて見えるのを防ぐ。
    // 間合い・命中の拡大は近くで残し、遠い兵の印は兵と一緒に小さくなる。
    // 基準の高さは間合いで変えず、横幅と命中の縦の伸びは下で別々に反映する。
    // 稲生の▼は実物の大きさをそろえる。近づけば兵と一緒に大きくなり、距離の縮まりが見える。
    // 森部も頭ほどの幅に収め、間合いと命中の拡大は下で一度だけ掛ける。
    // 稲生の追う一人も頭ほどの実寸に収め、奥の印が手前の兵に重なるのを防ぐ。
    // 近くの兵も読みやすい大きさを残し、目前の相手を見失わせない。
    const inouFocus = lesson && (u === missionEnemy || hot || hit > 0 || u.inouBlockUntil > rt.t || defeated);
    // 稲生の目当ては距離に応じて滑らかに大きくし、近さの境目で急に変えない。
    // 目当ての読みやすい幅は残し、実寸の上限で遠い印の膨らみを抑える。
    const inouNear = lesson ? Math.max(0, Math.min(1, (30 - Math.sqrt(meD2)) / 20)) : 0;
    const inouLimit = (inouFocus || u === commander || lesson && general(u) ? .9 : .6) + .7 * inouNear;
    // 桶狭間の遠い印は頭ほどに収め、森部・稲生の間合いと命中の調整も保つ。
    // 森部は遠い印を頭ほどに収め、近づくほど滑らかに広げる。討つ武将は一段大きく残す。
    const moribeNear = ford ? Math.max(0, Math.min(1, (40 - Math.sqrt(meD2)) / 22)) : 0;
    // 最寄りの目当ては同じ▼を一回り大きくする。届く時の白縁・横広がりとは分ける。
    const moribeFocus = ford && u === missionEnemy;
    const moribeLimit = (u === commander ? .9 : moribeFocus ? .8 : .6) + .45 * moribeNear;
    // 近い所属印は二十画素、目当てと届く本人は二十四画素、命中した本人は二十八画素を保つ。
    const moribePixelScale = -v.z * 2 / (VIEW.h * cam.projectionMatrix.elements[5] * .34);
    // 接近中も所属が読める幅を残す。遠方では本人と一緒に小さくする。
    const moribeReadable = (12 + 8 * moribeNear) * Math.max(0, Math.min(1, (70 - Math.sqrt(meD2)) / 30));
    const moribeMinPixels = ford ? Math.max(moribeReadable, (moribeFocus ? 24 : 20) * moribeNear, reachable ? 24 : 0, 28 * pulse) : 0;
    // 稲生の近い敵も携帯で読める幅を保ち、印のない味方と見分けられるようにする。
    // 遠い本人も三角と読める幅を残す。接近の途中で印だけ数画素に潰さない。
    // 七十歩以遠へは滑らかに戻し、近い相手の白縁・命中の伸びと分ける。
    const inouMinPixels = lesson ? Math.max(16 * inouNear,
      (inouFocus ? 18 : 12) * Math.max(0, Math.min(1, (70 - Math.sqrt(meD2)) / 30))) : 0;
    const k = Math.max(Math.max(moribeMinPixels, inouMinPixels) * moribePixelScale,
      Math.min(ford ? moribeLimit : lesson ? inouLimit : raid ? (u === missionEnemy || u === commander ? 1.6 : 1.1) : u === commander ? 32 : 3, (lesson || ford ? pixels : width) * moribePixelScale)) *
      (ford || lesson ? 1 : 1 + (pulse > 0 ? 1.2 * pulse : reachable && !raid ? .55 : 0));
    dummy.position.copy(headPos);
    dummy.quaternion.copy(q);
    // 振りかぶりでも▼の向きは変えず、誰の頭上かを保つ。
    // 桶狭間も、届く相手は横幅、命中は縦の伸びで区別する。先端は頭上に固定。
    // 桶狭間は届く時は幅だけ、命中時は高さだけを変え、空振りと区別する。
    // 命中の直後に敵がよろけて間合いを出ても、届いた時より小さくしない。
    // 同じ本人の幅を保ち、縦の伸びと赤の減りを読める時間を残す。
    const okePixels = Math.max(pixels, 34 * pulse);
    // 遠い▼は頭ほどの実寸に収め、近くでは読み取りやすい大きさを保つ。
    // 二十五歩以内は大きな上限、四十歩以遠は小さな上限にし、間は滑らかにつなぐ。
    const okeNear = Math.max(0, Math.min(1, (40 - Math.sqrt(meD2)) / 15));
    // 奥の一団は頭ほどの赤い▼で所属を示す。
    // 刃の間合いまで滑らかに広げ、目前でも隣の頭を覆わない大きさに収める。
    const okeClosing = raid ? Math.max(0, Math.min(1, (30 - Math.sqrt(meD2)) / Math.max(1, 30 - reachHot))) : 0;
    // 奥の▼を手前の笠より大きくしない。本人と一緒に育つ大きさで接近を示す。
    // 近づいた一人の強調と、実際に届く時の白縁・横幅は保つ。
    // 追う相手の選び直しで膨らませず、本人との距離で大きさを保つ。
    const okeLimit = u === commander ? 1.1 + .7 * okeNear : .9 + 1 * okeClosing;
    // 携帯では実寸の上限だけだと目前の敵でも数画素に潰れる。
    // 奥は小さく、目前は読みやすい幅を保ち、遠方へは滑らかに実寸へ戻す。
    const okePixelScale = -v.z * 2 / (innerHeight * cam.projectionMatrix.elements[5] * .34);
    // どの敵も本人との接近に応じて育つ。目当ての切り替えで縮めず、届く一人だけ横へ開く。
    const okeMinPixels = (14 + 10 * okeClosing) * Math.max(0, Math.min(1, (55 - Math.sqrt(meD2)) / 15));
    // 頭上の先端は動かさず、携帯でも三角と読める幅を保つ。
    // 実寸の上限だけでは三十歩先の印が数画素になるため、画面上の下限を最後に掛ける。
    // 四十歩以内でも下限を少しずつ育て、実寸の上限で同じ大きさに止まらないようにする。
    // 遠景では下限を戻し、先端は本人の頭上に保つ。
    const okeReadable = (12 + 8 * okeClosing) * Math.max(0, Math.min(1, (70 - Math.sqrt(meD2)) / 30));
    const okeScale = raid ? Math.max(okeReadable * okePixelScale,
      Math.min(okeLimit, Math.max(okeMinPixels * okePixelScale, okePixels * okePixelScale))) : k;
    // 防がれた接触は縦に潰す。傷を与えた時の縦の伸び・赤の減りとは分ける。
    // 森部も、受け止められた本人の▼だけを短く潰す。空振りとは区別する。
    const blocked = special && !(hit > 0) && (ford ? u.moribeBlockUntil : lesson ? u.inouBlockUntil : u.okeBlockUntil) > rt.t;
    // 届くまでの接近で▼が徐々に開く。届いた時の幅広い形とは区別する。
    // 白縁と大きな横幅は実際に届く一人だけ。命中は縦の伸びで返す。
    const inouWidth = lesson && reachable ? 2.6 : lesson && general(u) ? 1 : lesson && u === missionEnemy
      ? .65 + Math.max(0, Math.min(1, 1 - (Math.sqrt(meD2) - reachHot) / 12)) : 1;
    // 桶狭間は遠くで細く、接近するほど開く。刃の間合いへの接近も同じ幅へ反映する。
    // 実際に攻撃が届く本人だけ最大の幅にし、位置・高さは動かさない。
    // 奥の印を横へ広げて手前の別人の笠にかぶせない。
    // 接近の十二歩を同じ▼の幅で返し、届いた瞬間はさらに大きく開く。
    const okeWidth = raid ? reachable ? 1.9 : .7 + .45 * Math.max(0, Math.min(1,
      1 - (Math.sqrt(meD2) - reachHot) / 12)) : 1;
    // 稲生は届く一人の幅をはっきり広げる。命中後も幅を保ち、縦の伸びを見せる。
    // 森部の横幅は届く本人だけ強調する。敵の振りかぶりと混同させない。
    // 命中で押し戻された直後も、届いた時の横幅を保つ。縦の伸びと赤の減りを見せる。
    // 森部は届く本人の幅をはっきり広げ、命中した時だけ縦にも伸ばす。
    // 敵の振りかぶりでは印を伸ばさず、頭上の先端を動かさない。
    // 森部の縦の伸びは命中だけ。敵の振りかぶりを命中の反応と取り違えさせない。
    // 追う相手の選択だけで幅を替えず、届いた瞬間にはっきり広げる。
    const okeApproach = okeWidth;
    // 選択では広げず、最後の十二歩で少し開く。届く本人の横広がりとは分ける。
    const moribeApproach = ford ? .7 + .5 * Math.max(0, Math.min(1,
      1 - (Math.sqrt(meD2) - reachHot) / 12)) : 1;
    // 横幅を抑え、命中の縦長い形を届く時の横長い形と区別する。
    // 命中・防がれた直後も横幅を保ち、縦に潰れる形を命中の伸びと区別する。
    // 森部は接近に応じて徐々に開き、命中の拡大は隣の頭を覆わない幅に収める。
    // 森部は届く瞬間に横幅を開き、隣の頭を覆わない幅に収める。
    // 命中では縦にも伸びる。空振りでは伸びず、防がれた時は縦に潰れる。
    dummy.scale.set(raid ? okeScale * Math.max(okeApproach, pulse > 0 ? 1 + 1.8 * pulse : 0) : ford ? k * Math.max(reachable ? 2 : blocked || pulse > 0 ? 1.5 : moribeApproach, 1 + .5 * pulse) : lesson ? k * Math.max(inouWidth, blocked || pulse > 0 ? 2.6 : 0) : k * (1 + .5 * pulse),
      raid || ford || lesson ? (raid ? okeScale : k) * (blocked ? .55 : 1 + (ford || lesson ? 1.6 : 1) * pulse) : k, raid ? okeScale : k);
    // 自分を狙う振りかぶりと、実際に受けた一撃は本人の赤い▼を下へ動かす。
    // 白縁・横広がりは自分の刃が届く時だけに保つ。
    if (ford && !defeated && (u.atk?.target === me || u.swing?.target === me || u.moribeAttackUntil > rt.t)) {
      dummy.position.y -= still ? .12 : .12 + .12 * Math.sin(rt.t * 18);
    }
    // 森部・桶狭間はそれぞれの時間で同じ本人の印を閉じる。
    if (defeated) {
      const closing = Math.max(0, Math.min(1, (defeatUntil - rt.t) / .8));
      if (ford || raid || lesson) {
        // 撃破は横幅を残して縦に閉じる。命中後に小さく戻る動きと区別する。
        dummy.scale.x = (raid ? okeScale : k) * 2.2;
        // 森部は縦に潰した形と一秒の閉じ方を保ち、桶狭間は専用の大きさで閉じる。
        dummy.scale.y = ford || lesson ? k * (still ? .25 : Math.min(1, (defeatUntil - rt.t) / 1)) : okeScale * (still ? 1 : closing);
      } else dummy.scale.multiplyScalar(still ? 1 : closing);
    }
    // 目当て以外も刀の形を読める大きさに保つ。
    // 森部は上で決めた間合い・命中の形を保つ。選び直しで同じ大きさへ潰さない。
    // ほかの戦は目当ての一人だけ大きくし、周囲は小さい所属印にそろえる。
    if (special && foe && !ford) {
      const screenScale = -v.z * 2 / (VIEW.h * cam.projectionMatrix.elements[5]);
      // 当たった本人と倒した本人も読み取れる大きさを保つ。
      // 次の敵へ狙いが移った時、命中と討ち取りを十二画素へ潰さない。
      if (raid) {
        // 最後の大きさ制限でも「届く」の横広がりを保つ。遠い▼で手前の兵を覆わない。
        // 選択された遠い敵も同じ基準。接近で育ち、届いた時だけ白縁で横に開く。
        const closing = Math.max(0, Math.min(1, (40 - Math.sqrt(meD2)) / Math.max(1, 40 - reachHot)));
        // 遠くでも読める下限を保ち、接近時の大きさを抑えて届く本人だけ幅広にする。
        const width = reachable ? 42 : 12 + 14 * closing;
        const height = 12 + 6 * closing;
        // 命中で相手が押し戻されても、届いた時より印を細くしない。
        // 受け止めでも届いた本人の幅を保ち、縦に潰れる反応を読めるようにする。
        dummy.scale.x = (hit > 0 || defeated || blocked ? Math.max(width, 42) : width) * screenScale / .34;
        dummy.scale.y = height * (defeated ? still ? .25 : Math.max(0, Math.min(1, (defeatUntil - rt.t) / .8)) : blocked ? .55 : 1 + 1.6 * pulse) * screenScale / .28;
      } else if (lesson) {
        // 傷と討ち取りは、次の敵を選んでも当たった本人の印に残す。
        // 選ばれただけでは大きくしない。接近・届く横幅・命中の縦伸びを最後まで保つ。
        const closing = Math.max(0, Math.min(1, (30 - Math.sqrt(meD2)) / Math.max(1, 30 - reachHot)));
        const width = reachable ? 42 : 12 + 14 * closing;
        const height = 12 + 8 * closing;
        dummy.scale.x = Math.max(width, hit > 0 || defeated || blocked ? 32 : 0) * screenScale / .34;
        dummy.scale.y = height * (defeated ? still ? .25 : Math.max(0, Math.min(1, (defeatUntil - rt.t) / 1)) : blocked ? .55 : 1 + 1.6 * pulse) * screenScale / .28;
      } else if (u === focusEnemy && !defeated || ford && (hit > 0 || defeated)) {
        dummy.scale.x = Math.max(34, Math.min(42, dummy.scale.x * .34 / screenScale)) * screenScale / .34;
        // 討ち取りは横幅だけを保ち、既存の縦に閉じる動きは止めない。
        dummy.scale.y = Math.max(defeated ? 0 : blocked ? 16 : 28, Math.min(40, dummy.scale.y * .28 / screenScale)) * screenScale / .28;
      } else {
        const shrink = Math.min(1, 12 * screenScale / (.34 * dummy.scale.x), 12 * screenScale / (.28 * dummy.scale.y));
        dummy.scale.multiplyScalar(shrink);
      }
    }
    // 森部の印は笠の上に収め、命中後も隣の兵や槍を覆う大きさにしない。
    // 幅広は届く本人、縦の一伸びは命中。残る赤の減りは既存の中身で示す。
    if (ford) {
      const screenScale = -v.z * 2 / (VIEW.h * cam.projectionMatrix.elements[5]);
      // 手前は描画方式によらず読める幅を保ち、隣の兵を覆わない上限も守る。
      // 接近で同じ印を育て、届く時・命中・防がれた時の横幅を保つ。
      const close = Math.max(0, Math.min(1, (40 - Math.sqrt(meD2)) / Math.max(1, 40 - reachHot)));
      const width = reachable ? 32 : hit > 0 || defeated || blocked ? 28 : 12 + 8 * close;
      dummy.scale.x = Math.max(dummy.scale.x, width * close * screenScale / .34);
      // 届く横幅と命中の縦伸びを最後の上限で潰さない。先端は頭上に固定する。
      dummy.scale.x = Math.min(dummy.scale.x, (reachable ? 38 : hit > 0 || defeated || blocked ? 30 : 22) * screenScale / .34);
      // 命中の縦伸びを残し、目前でも笠の上に収める。
      const height = 12 + 6 * close;
      dummy.scale.y = Math.min(dummy.scale.y, Math.min(hit > 0 ? 32 : 24, height * (blocked ? .55 : 1 + 1.6 * pulse)) * screenScale / .28);
    }
    // 拡大を重ねず、印の先端を本人の頭上に保つ。
    dummy.updateMatrix();
    if (foe) {
      // 森部は傷が増えても赤を残す。討った本人の印は黒くせず閉じる。
      const life = ford ? defeated ? 1 : Math.max(.16, Math.min(1, u.hp / (u.maxHp || 1))) : (lesson || raid) && defeated ? 0 : special ? Math.max(0, Math.min(1, u.hp / (u.maxHp || 1))) : Math.sqrt(Math.max(.16, Math.min(1, u.hp / (u.maxHp || 1))));
      // 届く敵の▼は最後に描き、重なった所でも上に出す。
      // 森部は赤い▼の幅で間合い、縦の伸びと中身の減りで命中を示す。
      // 森部の届く本人は横幅、命中した本人は赤い中身の減りと縦の伸びで分ける。
      const justHit = special && hitLeft > (raid ? 1.7 : lesson ? 1.95 : 1.7);
      // 稲生は実際に届く一人だけ白縁にし、命中は縦の伸びと赤の減りで示す。
      // 森部は同じ赤い▼を保ち、届く本人の横幅と命中による中身の減りを残す。
      // 敵の予備動作は本人の動きで見せ、印には命中の反応を残す。
      // 桶狭間は実際に届く本人だけ白縁にし、接近は横幅、命中は縦の伸びと赤の減りで示す。
      // 選択・命中・受け止めでは白縁を付けず、届くという意味を保つ。
      // 敵が振りかぶっても、届く予告と自分の命中の反応を金縁で隠さない。
      // 桶狭間は近距離の境を越えても▼を隠さない。壁の見通しは上で確認済み。
      // 森部は白縁を使わず、間合いは横幅、命中は削れた面と縦の伸びで示す。
      const tone = lesson ? (general(u) ? 24 : near ? 8 : 0) + (defeated ? 4 : reachable ? 2 : 1) : ford ? (near ? 8 : 0) + (reachable && !defeated ? 2 : 1) : raid ? 8 + (defeated ? 1 : hit > 0 ? reachable ? 6 : 4 : reachable ? 2 : 1) : justHit ? 3 : hot ? 2 : 1;
      if (special) {
        const c = s.signPool[s.signCandidates.length];
        c.u = u; c.matrix.copy(dummy.matrix); c.life = life;
        if (ford || lesson || raid) {
          const lossLeft = ((lesson ? u.inouDamageUntil : raid ? u.okeDamageUntil : u.moribeDamageUntil) || 0) - rt.t;
          // 稲生は削れた部分をしばらく保ち、次の判断の時にも命中を見届けられるようにする。
          // 森部も連打の合間に同じ本人の傷を読めるようにする。
          // 森部は一瞬の白い削れ跡を閉じ、次の一振りまでに残る赤を見せる。
          const loss = Math.min(1, Math.max(0, lossLeft / .8));
          const before = defeated ? 0 : Math.max(life, Math.min(1, ((lesson ? u.inouHitHp : raid ? u.okeHitHp : u.moribeHitHp) || 0) / (u.maxHp || 1)));
          c.loss = Math.sqrt(life + (before - life) * loss);
        }
        // 届く本人・命中直後・桶狭間で追う本人を、遠い兵の印で覆わせない。
        // 桶狭間は届く本人、命中した本人の順で、遠い任務の敵より上に描く。
        c.hot = ford ? reachable && !defeated ? 6 : hit > .3 || defeated ? 5 : hot || blocked ? 3 : hit > 0 ? 2 : u === commander || u === missionEnemy ? 1 : 0 : lesson ? reachable && !defeated ? 6 : hit > 0 || defeated ? 5 : blocked ? 4 : u === missionEnemy ? 3 : practiceEnemy ? 2 : 0 : raid ? reachable && !defeated ? 6 : hit > 0 || defeated ? 5 : hot ? 4 : justHit ? 3 : meD2 < 25 * 25 ? u === missionEnemy ? 2 : 1 : 0 : hot;
        if (lesson && general(u)) c.hot = 7;
        c.distance = Math.sqrt(meD2); c.tone = tone;
        // 倒れた敵の印を隣の生きた兵の所属と取り違えさせない。
        c.fade = ford && defeated ? Math.max(0, Math.min(1, (defeatUntil - rt.t) / .8)) : 1;
        c.focus = u === focusEnemy && !defeated || (ford || lesson) && (hit > 0 || defeated);
        const toPixels = VIEW.h * cam.projectionMatrix.elements[5] / (-v.z * 2);
        const halfWidth = dummy.scale.x * .17 * toPixels, height = dummy.scale.y * .28 * toPixels;
        v.copy(headPos).project(cam);
        const sx = (v.x + 1) * VIEW.w / 2, sy = (1 - v.y) * VIEW.h / 2;
        c.left = sx - halfWidth - 4; c.right = sx + halfWidth + 4;
        c.top = sy - height - 4; c.bottom = sy + 4;
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
  // 序盤三戦は全員の所属印を残し、届く本人・命中した本人を最後に描く。
  if (special) n = drawOrderedSigns(s, ford || raid || lesson);
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
    // 稲生は武将も▼の中の赤で残りの命を示し、別の棒を重ねない。
    if (ford || lesson || raid) continue;
    if (quietSigns && (u !== s.nameUnit && u !== focusEnemy || (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 > 18 * 18)) continue;
    // 敵味方とも頭ほどの幅。遠方でも棒を拡大しすぎない。
    v.set(u.pos.x, headY(u), u.pos.z).applyMatrix4(cam.matrixWorldInverse);
    if (lesson && v.z >= -.1) continue;
    const pixel = -v.z * 2 / (innerHeight * cam.projectionMatrix.elements[5]);
    const k = lesson ? 12 * pixel / .045 : Math.min(1.2, Math.max(1, Math.sqrt(u._fsD) / 22));
    const w = lesson ? 88 * pixel : .45 * k;
    const ratio = Math.max(lesson ? 0 : 0.02, Math.min(1, u.hp / (u.maxHp || 1)));
    const y = lesson ? u.pos.y + inouSignHeight(u) + 42 * pixel : headY(u) + .36 * k;
    headPos.set(u.pos.x, y, u.pos.z);
    if (lesson) {
      // 頭上の棒は８８×１２点。切り欠きの内側の画面端でも枠を欠かさない。
      const sa = safeInsets(), W = VIEW.w, H = VIEW.h;
      headPos.project(cam);
      if (headPos.z < -1 || headPos.z > 1 || Math.abs(headPos.x) > 1.2 || Math.abs(headPos.y) > 1.4) continue;
      const x = Math.max(sa.left + 48, Math.min(W - sa.right - 48, (headPos.x + 1) * W / 2));
      const sy = Math.max(sa.top + 10, Math.min(H - sa.bottom - 10, (1 - headPos.y) * H / 2));
      headPos.x = x * 2 / W - 1; headPos.y = 1 - sy * 2 / H;
      headPos.unproject(cam);
    }
    for (let layer = 0; layer < 2; layer++) {
      const len = layer ? ratio : 1, col = layer ? u.team === me.team ? BAR_ALLY : BAR_FOE : BAR_BG, z = layer * .002;
      dummy.quaternion.copy(q);
      const border = lesson && layer ? 2 * pixel : 0;
      v.set(-w / 2 + border, 0, z).applyQuaternion(q);
      dummy.position.copy(headPos).add(v);
      dummy.scale.set((w - border * 2) * len, lesson && layer ? k * 2 / 3 : k, 1); dummy.updateMatrix();
      s.bars.setMatrixAt(b, dummy.matrix); s.bars.instanceColor.setXYZ(b, col.r, col.g, col.b); b++;
    }
  }
  s.bars.count = b; s.bars.instanceMatrix.needsUpdate = true; if (s.bars.instanceColor) s.bars.instanceColor.needsUpdate = true;
  // 稲生・森部の討つ名は右上の一行だけ。頭上には赤い▼を残す。
  if (ford || lesson || raid) {
    for (let i = 1; i < s.labels.length; i++) if (!s.labels[i].hidden) s.labels[i].hidden = true;
    const e = s.labels[0], u = commander;
    let on = false;
    if (u && u.name && u.alive && !u.dying && !u.gone && !u.fleeing) {
      // 壁の向こうは五分の一秒ごとに確かめる（兵や旗では消さない。名札は字なので奥行きに負けない）
      if (u._fsNameAt == null || rt.t >= u._fsNameAt || rt.t < u._fsNameAt - .25) { u._fsNameSeen = !cameraWallBlocked(rt, P, u.pos, P.y, u.pos.y + inouSignHeight(u)); u._fsNameAt = rt.t + .25; }
      v.set(u.pos.x, u.pos.y + inouSignHeight(u) + .5, u.pos.z).project(cam);
      if (u._fsNameSeen && v.z < 1 && Math.abs(v.x) < .96 && Math.abs(v.y) < .94) on = true;
    }
    if (!on) { if (!e.hidden) e.hidden = true; return; }
    const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z);
    placeName(e, u, v, d, me, 30);
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
    if (!u || u !== chosen || u === person || cards >= 3 && u !== commander) { if (!e.hidden) e.hidden = true; continue; }
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
    placeName(e, u, v, Math.sqrt(u._fsD || 0), me, 0);
  }
}

// 名札を投影した所へ置く。遠いと小さく、近いと大きく（字の大きさは 12〜17 点の間）。動かすのは transform だけ。
function placeName(e, u, v, d, me, lift) {
  const W = innerWidth, H = innerHeight;
  if (e._n !== u.name) { e._n = u.name; e.textContent = u.name; }
  const col = u.team === me.team ? '#f3dc9a' : '#ffc4b4';
  if (e._c !== col) { e._c = col; e.style.color = col; }
  if (e.hidden) e.hidden = false;
  const k = Math.max(.86, Math.min(1.2, 1.25 - d / 110));
  // 同じ所なら書かない（10/24）
  const tf = `translate(${Math.round((v.x + 1) / 2 * W)}px,${Math.round((1 - v.y) / 2 * H - lift)}px) translate(-50%,-100%) scale(${k.toFixed(2)})`;
  if (e._t !== tf) { e._t = tf; e.style.transform = tf; e.style.transformOrigin = '50% 100%'; }
}
