// 開戦前の見渡し。既存の備えへ順に寄り、戦の時刻と兵の数は変えない。
import * as THREE from 'three';
import { reduceMotion } from './settings.js';
import { FORM_JA } from './units_group.js';

// 地面の端にだけ薄い霧の幕を置く。山城の切岸の外へ白い空が抜けるのを防ぐ。
// 一枚の形と材質を見渡しの間だけ使い、兵や光の数は増やさない。
function edgeMist(world, color) {
  const half = world.half - 1, positions = [], heights = [];
  for (let side = 0; side < 4; side++) for (let i = 0; i < 24; i++) {
    const a = -half + half * 2 * i / 24, b = -half + half * 2 * (i + 1) / 24;
    const x0 = side === 0 ? -half : side === 1 ? half : a;
    const z0 = side === 2 ? -half : side === 3 ? half : a;
    const x1 = side === 0 ? -half : side === 1 ? half : b;
    const z1 = side === 2 ? -half : side === 3 ? half : b;
    const h0 = world.heightAt(x0, z0) + 8, h1 = world.heightAt(x1, z1) + 8;
    positions.push(x0, h0 - 600, z0, x1, h1 - 600, z1, x0, h0 + 70, z0,
      x1, h1 - 600, z1, x1, h1 + 70, z1, x0, h0 + 70, z0);
    heights.push(h0, h1, h0, h1, h1, h0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('edgeHeight', new THREE.Float32BufferAttribute(heights, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { mistColor: { value: color.clone() } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `attribute float edgeHeight; varying float aboveEdge;
      void main() { aboveEdge = position.y - edgeHeight;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 mistColor; varying float aboveEdge;
      void main() { gl_FragColor = vec4(mistColor, 1.0 - smoothstep(4.0, 70.0, aboveEdge));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(geometry, material);
}

export function deploymentView(rt, camera, done) {
  return null;   // 見渡しは止める（霧で何も見えず、動かないように見えた。kaito 10/4）。作り直すまで出さない
  if (rt.def.town || rt.def.dojo || rt.def.duel || rt.flags.quiet) return null;
  const W = rt.world, rows = [];
  function add(point, side, name, role, form, visual, facing) {
    const center = new THREE.Vector3(point.x, W.heightAt(point.x, point.z) + 4, point.z);
    const army = visual?.army || visual?.light?.army;
    let radius = Math.max(12, Math.hypot(army?.hw0 || 0, army?.hd0 || 0));
    const group = visual?.real || (visual?.units ? visual : null);
    if (group) for (const u of group.units) if (u.alive) {
      radius = Math.max(radius, Math.hypot(u.pos.x - center.x, u.pos.z - center.z));
    }
    rows.push({ center, label: center.clone().add(new THREE.Vector3(0, 3.5, 0)), radius: Math.min(32, radius),
      text: `${side}　${name}\n${role}\n${form}の陣`, facing: facing || 0, eye: new THREE.Vector3() });
  }
  for (const J of rt.jinkei || []) {
    const side = rt.def.sides?.[J.plan.team === 0 ? 'a' : 'b']?.name || (J.plan.team === rt.player.u.team ? '味方' : '敵');
    for (const S of J.slots) {
      const visual = S.spec.get?.(rt) || rt.flags.jinkeiBound?.[S.spec.id] || S.b;
      if (S.spec.hidden || S.b?.hidden || visual?.hidden || visual?.hideFlags || visual?.real?.hidden) continue;
      const group = visual?.real || visual;
      const form = S.spec.form || group?.formation;
      // 八陣を史実として付けない戦は、表にある持ち場の名と実際の並びを示す。
      add(S.b?.pos || S.home, side, S.spec.general || '大将', S.spec.role || '備え',
        form ? (form === 'gyorin' ? '魚鱗' : FORM_JA[form] || J.plan.name) : J.plan.name, visual, J.plan.facing);
    }
  }
  // 陣形表のない戦も同じ寄り方。伏兵と自分の組は紹介しない。
  if (!rows.length) for (const g of rt.army.groups) {
    if (!g.count || g.hidden || g.hideFlags || g.isPlayerSquad) continue;
    const leader = g.leader?.name || g.units.find((u) => u.alive && u.name)?.name || g.name || '大将';
    add(g.center(), g.team === rt.player.u.team ? '味方' : '敵', leader, '備え',
      g.formation === 'gyorin' ? '魚鱗' : FORM_JA[g.formation] || '横隊', g, g.facing);
  }
  if (!rows.length) return null;
  const p = rt.player;
  p.introT = 0; p.camShot = null; p.cine = null; p.shotZoom = 0;
  p.updateCamera(1, camera);
  const endPos = camera.position.clone(), endRot = camera.quaternion.clone(), endFov = camera.fov, far = camera.far;
  const fog = rt.scene.fog, fogFar = fog?.far;
  const dark = W.timeKey === 'night' || W.lookDark || (rt.scene.background?.isColor &&
    rt.scene.background.r + rt.scene.background.g + rt.scene.background.b < 0.3);
  const saved = { sun: W.sun.intensity, sunColor: W.sun.color.clone(), sunPos: W.sun.position.clone(),
    target: W.sun.target.position.clone(), hemi: W.hemi.intensity, ground: W.hemi.groundColor.clone(),
    lookDark: W.lookDark, fireT: W.fireLightT, sky: W.sky.position.clone(), mountains: W.mountains.position.clone() };
  const firePool = (W.firePool || []).map((q) => ({ q, f: q.f, intensity: q.L.intensity,
    distance: q.L.distance, position: q.L.position.clone() }));
  const mist = fog ? edgeMist(W, fog.color) : null;
  if (mist) rt.scene.add(mist);
  if (dark) {
    W.lookDark = true;
    W.sun.color.set(0xb3c7e8); W.sun.intensity = Math.max(saved.sun, 0.7);
    W.hemi.intensity = Math.max(saved.hemi, 1.1); W.hemi.groundColor.set(0x4a4650);
  }
  const eye = new THREE.Vector3(), look = new THREE.Vector3(), projected = new THREE.Vector3();
  const moonOffset = new THREE.Vector3(-60, 95, 45);
  const departPos = new THREE.Vector3(), departRot = new THREE.Quaternion();
  const shotFov = 42, slope = Math.tan(35 * Math.PI / 180), hold = 3.2, duration = rows.length * hold;
  let aspect = 0;
  function frameShots() {
    aspect = camera.aspect;
    for (const row of rows) {
      // 一つの塊の幅だけで距離を決める。携帯でも兵と旗が点にならない近さ。
      const distance = Math.max(44, Math.min(95, row.radius / (Math.tan(shotFov * Math.PI / 360) * Math.min(1, aspect)) * 1.15));
      let best = Infinity;
      for (let i = 0; i < 12; i++) {
        const yaw = row.facing + i * Math.PI / 6, dx = Math.sin(yaw), dz = Math.cos(yaw);
        eye.set(row.center.x + dx * distance, row.center.y + distance * slope, row.center.z + dz * distance);
        let score = Math.max(0, Math.abs(eye.x) - W.half + 6) * 100 + Math.max(0, Math.abs(eye.z) - W.half + 6) * 100;
        // 山の裏や地面の中から見ない。視線上の尾根を避ける方角を選ぶ。
        for (let k = 1; k <= 10; k++) {
          const f = k / 10, x = row.center.x + dx * distance * f, z = row.center.z + dz * distance * f;
          score += Math.max(0, W.heightAt(x, z) + 2 - (row.center.y + distance * slope * f)) * 30;
        }
        // 上辺と両端の先まで地面が残る向きを優先。残る端は霧の幕で隠す。
        const reach = distance * slope / Math.tan((35 - shotFov / 2) * Math.PI / 180);
        const width = reach * Math.tan(shotFov * Math.PI / 360) * aspect;
        for (const sign of [-1, 1]) {
          const x = eye.x - dx * reach + dz * width * sign, z = eye.z - dz * reach - dx * width * sign;
          score += Math.max(0, Math.abs(x) - W.half + 12) + Math.max(0, Math.abs(z) - W.half + 12);
        }
        if (score < best) { best = score; row.eye.copy(eye); }
      }
    }
  }
  frameShots();
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;z-index:45;pointer-events:none;color:#ece4d2;font-size:15px;line-height:1.6';
  const title = document.createElement('div');
  title.textContent = '布陣の見渡し';
  title.style.cssText = 'position:absolute;top:16px;left:16px;padding:8px 16px;background:#14120f;font-size:20px';
  // 名札は注目する備えの旗の上へ結ぶ。一つずつ示し、三つの上限にも収める。
  const label = document.createElement('div');
  label.setAttribute('role', 'status');
  label.style.cssText = 'position:absolute;width:max-content;max-width:min(320px,60vw);padding:8px 12px;background:#14120f;color:#ece4d2;font-size:15px;line-height:1.4;white-space:pre-line;text-align:center;transform:translate(-50%,-100%)';
  const pin = document.createElement('div');
  pin.style.cssText = 'position:absolute;width:2px;height:20px;background:#c2a25a;box-shadow:0 0 0 1px #14120f;transform:translate(-50%,-100%)';
  const skip = document.createElement('button');
  skip.id = 'deployment-skip'; skip.textContent = '見渡しを飛ばす';
  skip.style.cssText = 'position:absolute;right:16px;top:16px;min-height:44px;padding:8px 16px;border:1px solid #c2a25a;background:#14120f;color:#ece4d2;font:inherit;pointer-events:auto;cursor:pointer';
  root.append(title, label, pin, skip); document.body.appendChild(root);
  let t = 0, page = -1, calm = reduceMotion(), closed = false, departing = false, departT = 0;
  function dispose() {
    if (closed) return;
    closed = true; root.remove();
    camera.position.copy(endPos); camera.quaternion.copy(endRot); camera.fov = endFov; camera.far = far;
    if (fogFar !== undefined) fog.far = fogFar;
    if (mist) { rt.scene.remove(mist); mist.geometry.dispose(); mist.material.dispose(); }
    W.sun.intensity = saved.sun; W.sun.color.copy(saved.sunColor); W.sun.position.copy(saved.sunPos);
    W.sun.target.position.copy(saved.target); W.hemi.intensity = saved.hemi; W.hemi.groundColor.copy(saved.ground);
    W.lookDark = saved.lookDark; W.sky.position.copy(saved.sky); W.mountains.position.copy(saved.mountains);
    for (const { q } of firePool) if (q.f?.light === q.L) q.f.light = null;
    for (const s of firePool) {
      s.q.f = s.f; if (s.f) s.f.light = s.q.L;
      s.q.L.intensity = s.intensity; s.q.L.distance = s.distance; s.q.L.position.copy(s.position);
    }
    W.fireLightT = saved.fireT;
    camera.updateProjectionMatrix();
  }
  function finish() { dispose(); done(); }
  function jump() {
    if (closed || departing) return;
    if (calm || reduceMotion()) { finish(); return; }
    departing = true; departPos.copy(camera.position); departRot.copy(camera.quaternion);
    label.hidden = pin.hidden = true;
  }
  skip.onclick = jump;
  skip.onfocus = () => { skip.style.outline = '3px solid #c2a25a'; skip.style.outlineOffset = '3px'; skip.style.boxShadow = '0 0 0 7px #14120f'; };
  skip.onblur = () => { skip.style.outline = ''; skip.style.boxShadow = ''; };
  skip.focus({ preventScroll: true });
  function update(dt) {
    if (closed) return;
    calm = calm || reduceMotion();
    if (departing) {
      if (calm || (departT += dt) >= 1.2) { finish(); return; }
      const k = departT / 1.2, ease = k * k * (3 - 2 * k);
      camera.position.lerpVectors(departPos, endPos, ease); camera.quaternion.slerpQuaternions(departRot, endRot, ease);
      camera.fov = shotFov + (endFov - shotFov) * ease; camera.updateProjectionMatrix();
      return;
    }
    t += dt;
    if (t >= duration) { jump(); return; }
    if (aspect !== camera.aspect) frameShots();
    const next = Math.min(rows.length - 1, Math.floor(t / hold)), row = rows[next];
    if (next !== page) {
      page = next; label.textContent = row.text;
      // 止まっている見渡しでも、今見る備えの篝火へ既存の光を付け替える。
      W.fireLightT = 0; W.assignFireLights(0, row.center);
      for (const { q } of firePool) if (q.f && dark) { q.L.intensity = q.f.big ? 5 : 4; q.L.distance = q.f.big ? 36 : 28; }
    }
    look.copy(row.center);
    const approach = calm ? 1 : 1.06 - (t % hold) / hold * 0.06;
    eye.copy(row.eye).sub(look).multiplyScalar(approach).add(look);
    camera.position.copy(eye); camera.lookAt(look);
    camera.fov = shotFov; camera.far = far;
    if (fogFar !== undefined) fog.far = Math.min(fogFar, eye.distanceTo(look) * 3);
    W.sky.position.set(eye.x, 0, eye.z); W.mountains.position.set(eye.x, 0, eye.z);
    if (dark) { W.sun.position.copy(look).add(moonOffset); W.sun.target.position.copy(look); }
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    projected.copy(row.label).project(camera);
    const x = (projected.x + 1) * root.clientWidth / 2, y = (1 - projected.y) * root.clientHeight / 2;
    // 視野外へ出た札は端へ貼り付けない。字と旗の対応を保つ。
    label.hidden = pin.hidden = projected.z < -1 || projected.z > 1 || x < 140 || x > root.clientWidth - 140 || y < 130 || y > root.clientHeight - 24;
    label.style.left = pin.style.left = `${x}px`; label.style.top = `${y - 20}px`; pin.style.top = `${y}px`;
  }
  update(0);
  return { update, jump, dispose };
}
