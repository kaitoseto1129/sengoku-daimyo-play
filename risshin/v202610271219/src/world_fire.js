import * as THREE from 'three';
import { WIND_STATE } from './world_weather.js';
import { EffectSprites } from './effect_sprites.js';
import { fireFillObject, FIRE_FILL } from './world_common.js';
import { S as SETTINGS } from './settings.js';

// 炎：二枚以上の舌を重ね、上へ流れる揺らぎで輪郭を崩す。縦は立てたままカメラへ向く
//   材質と形は全ての火で一つ（毎コマ new しない）。火ごとの違いは置き場所から作る種で出す
const FLAME_U = { uNight: { value: 0 }, uT: { value: 0 }, uWind: { value: new THREE.Vector2() }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 600 } };
let FLAME_MAT = null, FLAME_CORE_MAT = null, FLAME_GEO = null;
const FLAME_LIKE = new WeakMap();
let ROUND_FLAME_MAT = null, ROUND_FLAME_CORE = null;
// 束ねる判定と板の行き先は使い回す。描くたびに集合・関数・検索用の字を作らない。
function flameLike(mt) {
  if (!mt) return false;
  if (mt === FLAME_MAT || mt === FLAME_CORE_MAT || mt === ROUND_FLAME_MAT || mt === ROUND_FLAME_CORE) return true;
  if (!mt.isShaderMaterial) return false;
  let r = FLAME_LIKE.get(mt);
  if (r === undefined) FLAME_LIKE.set(mt, r = !!mt.uniforms && mt.uniforms.uWind === FLAME_U.uWind && /flameWorld = modelMatrix \* instanceMatrix/.test(mt.vertexShader));
  return r;
}
function visitFlame(world, m) {
  if (!m || !m.isMesh || !m.layers.mask || !flameLike(m.material)) return;
  for (let o = m; o; o = o.parent) if (!o.visible) { m.layers.mask = 1; return; }
  let saved = world.flameSources.get(m);
  if (!saved || saved.material !== m.material || saved.geometry !== m.geometry) {
    const k = m.material.uuid + m.geometry.uuid;
    let batch = world.flameInst.get(k);
    if (!batch) {
      const im = new THREE.InstancedMesh(m.geometry, m.material, 192);
      im.frustumCulled = false; im.renderOrder = 2; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      world.scene.add(im); batch = { im, n: 0 }; world.flameInst.set(k, batch);
    }
    saved = { material: m.material, geometry: m.geometry, batch };
    world.flameSources.set(m, saved);
  }
  const e = saved.batch;
  if (e.n >= 192) { m.layers.mask = 1; return; }
  e.im.setMatrixAt(e.n++, m.matrixWorld); m.layers.mask = 2;
}
function flameMat() {
  if (FLAME_MAT) return FLAME_MAT;
  FLAME_GEO = new THREE.PlaneGeometry(1, 1, 2, 10);
  FLAME_MAT = new THREE.ShaderMaterial({
    uniforms: FLAME_U, transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide, fog: true,
    vertexShader: `uniform vec2 uWind; uniform float uT; varying vec2 vUv; varying float vSeed; varying float vDist;
      void main() {
        vUv = uv;
        mat4 flameWorld = modelMatrix;
        #ifdef USE_INSTANCING
          flameWorld = modelMatrix * instanceMatrix;
        #endif
        vec3 c = flameWorld[3].xyz;
        float sx = length(flameWorld[0].xyz), sy = length(flameWorld[1].xyz);
        vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        r = normalize(vec3(r.x, 0.0, r.z) + vec3(1e-5, 0.0, 0.0));
        vSeed = fract(sin(dot(c.xz, vec2(12.9898, 78.233)) + sx * 3.7) * 43758.5453);
        float h = position.y + 0.5;
        float sway = (sin(uT * 2.3 + vSeed * 31.0 + h * 5.0) * 0.13 + sin(uT * 3.7 + h * 9.0 + vSeed * 17.0) * 0.05) * h * h;
        float width = mix(1.0, 0.025, h * h);
        // 同じ板の中央を手前へ丸め、芯と外炎にも奥行きを付ける。頂点と描画数は増やさない。
        vec3 toward = vec3(-r.z, 0.0, r.x);
        float belly = (1.0 - 4.0 * position.x * position.x) * sin(h * 3.14159) * sx * 0.22;
        vec3 wp = c + r * (position.x * width + sway) * sx + toward * belly + vec3(0.0, position.y * sy, 0.0) + vec3(uWind.x, 0.0, uWind.y) * h * h * sy * 0.22;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float uT; uniform float uNight; uniform float uCore; uniform float fogFar; varying vec2 vUv; varying float vSeed; varying float vDist;
      float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main() {
        vec2 uv = vUv;
        float t = uT * (0.9 + vSeed * 0.35) + vSeed * 31.0;
        vec2 q = vec2(uv.x * 3.2 + vSeed * 7.0, uv.y * 2.3 - t * 1.9);
        float n = vn(q) * 0.55 + vn(q * 2.1 + vec2(0.0, -t * 1.4)) * 0.3 + vn(q * 4.4 - vec2(t * 0.4, t * 2.6)) * 0.15;
        // 上ほど大きく横へ揺れ、細く尖る
        float x = uv.x - 0.5 + (n - 0.5) * 0.34 * uv.y + sin(t * 2.3 + uv.y * 4.0) * 0.03 * uv.y;
        float w = mix(0.43, 0.28, uv.y) * (0.8 + n * 0.4);
        float body = 1.0 - smoothstep(w * 0.45, w, abs(x));
        float top = 1.0 - smoothstep(0.3, 0.95, uv.y + (n - 0.5) * 0.6);
        float f = body * top * smoothstep(0.0, 0.1, uv.y) * (0.65 + n * 0.35);
        // 外は暗い赤、中は橙、根元の芯は黄白
        float core = smoothstep(0.55, 0.85, f) * (1.0 - smoothstep(0.15, 0.55, uv.y));
        vec3 col = mix(vec3(0.5, 0.08, 0.01), vec3(1.0, 0.42, 0.07), smoothstep(0.2, 0.78, f));
        col = mix(col, vec3(1.0, 0.85, 0.24), max(core, uCore * (1.0 - uv.y * 0.65)));
        // 加算で芯を白く飛ばさず、遠い火は霞に沈める
        float reach = mix(max(20.0, floor(fogFar)), max(260.0, floor(fogFar)), uNight);
        // 目の前の松明で視界を白く埋めない。火の当たりと明かりは保つ。
        float a = f * exp(-vDist / reach * 1.1) * smoothstep(0.5, 3.5, vDist);
        if (a < 0.004) discard;
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  FLAME_MAT.uniforms.uCore = { value: 0 };
  FLAME_CORE_MAT = FLAME_MAT.clone();
  FLAME_CORE_MAT.uniforms = { ...FLAME_U, uCore: { value: 1 } };
  return FLAME_MAT;
}
// 遠景の大軍の、待つ間の小さな動き（体の揺れ・見回し・隊の中の入れ替わり）の強さ。見比べる時は 0 に

export class WorldFire {

  // 焼け跡は戦が終わるまで残す。形・材質は一組、最大512か所を一度に描く。
  addScorch(x, z, w = 4, d = w, rot = 0) {
    if (!this.scorches) {
      if (!this.puffTex) this.makePuffTex();
      const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ map: this.puffTex, color: 0x100d0b, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const mesh = new THREE.InstancedMesh(geo, mat, 512);
      mesh.count = 0; mesh.frustumCulled = false; this.scene.add(mesh);
      this.scorches = { mesh, m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), axis: new THREE.Vector3(0, 1, 0) };
    }
    const C = this.scorches;
    if (C.mesh.count >= 512) return;
    C.p.set(x, this.heightAt(x, z) + 0.045, z);
    C.q.setFromAxisAngle(C.axis, rot); C.s.set(Math.max(1, w) * 1.35, 1, Math.max(1, d) * 1.35);
    C.mesh.setMatrixAt(C.mesh.count++, C.m.compose(C.p, C.q, C.s));
    C.mesh.instanceMatrix.needsUpdate = true;
  }


  // 火を消す（addFire の返り値を渡す）
  // 燃える建物（焼き討ち・炎上の共通の作り）：屋根の棟に沿って大きな炎を二〜三つ、上に太い煙の柱。
  // x, z は建物の真ん中、o.w・o.d は幅と奥行き、o.h は屋根の高さ、o.rot は向き。返す物の stop() で火を消す（焼け跡は戦の側で）
  // 炎の数と光の数は addFire の決まり（光は近い数個だけ）に従うので、何棟燃やしても重さは増えにくい
  addBlaze(x, z, o = {}) {
    const w = o.w || 8, d = o.d || 6, h = o.h ?? 4, rot = o.rot || 0;
    const n = Math.max(1, Math.min(3, o.n || Math.round(w / 5)));
    const ca = Math.cos(rot), sa = Math.sin(rot), long = w >= d ? w : d, ax = w >= d ? [ca, -sa] : [sa, ca];
    const size = o.size || Math.min(4, 2.2 + Math.sqrt(w * d) * 0.12);
    const fires = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * long * 0.6;
      const fx = x + ax[0] * t, fz = z + ax[1] * t;
      fires.push(this.addFire(fx, fz, { size: size * (i === 1 ? 1 : 0.85), h: h + size * 0.15, blackSmoke: true }));
    }
    // 戸口・窓側にも小さな火の舌。屋根の火と同じ形・材質を使う。
    fires.push(this.addFire(x + sa * (d / 2 + 0.18), z + ca * (d / 2 + 0.18), { size: size * 0.55, h: Math.min(1.8, h * 0.35), smoke: false }));
    const smoke = this.addSmokeColumn(x, this.heightAt(x, z) + h + size, z, { size: Math.min(4, size * 1.1), black: true });
    return { fires, smoke, stop: () => { for (const f of fires) this.removeFire(f); this.removeSmokeColumn(smoke); fires.length = 0; } };
  }


  removeFire(f) {
    if (!f) return;
    this.scene.remove(f.flame, f.inner);
    if (f.far) this.farFires.remove(this.scene, f.far);
    if (f.glow) { this.scene.remove(f.glow); if (!f.torch) f.glow.geometry.dispose(); f.glow.material.dispose(); }
    if (f.light) { const pl = (this.firePool || []).find((q) => q.L === f.light); if (pl) { pl.f = null; pl.L.intensity = 0; } else this.scene.remove(f.light); f.light = null; }
    this.removeSmokeColumn(f.smoke);
    this.fires = this.fires.filter((q) => q !== f);
    this.fireLightT = 0;
    if (this.fireFill) this.fireFill.time = -1;
    if (this.fireBatches) for (const batch of this.fireBatches.values()) {
      batch.list = batch.list.filter((entry) => entry.root !== f.flame && entry.root !== f.inner);
    }
  }


  // 火の粉：近くの火から、ときどき小さな光の粒が舞い上がって消える
  buildEmbers() {
    const N = 260;
    const pos = new Float32Array(N * 3).fill(-999), life = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('life', new THREE.BufferAttribute(life, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float life; varying float vA; void main(){ vA = clamp(life, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 26.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = (1.0 - smoothstep(0.1, 0.5, d)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.0, 0.62, 0.25) * a, a); }',
    });
    this.embers = { pts: new THREE.Points(geo, mat), pos, life, vel: new Float32Array(N * 3), i: 0, N };
    this.embers.pts.frustumCulled = false;
    this.scene.add(this.embers.pts);
  }

  updateEmbers(dt, focus) {
    // 最後の火を消しても、残った火の粉の寿命は進める。
    if (!this.embers) {
      let lit = false;
      for (const f of this.fires) if (f.lit) { lit = true; break; }
      if (!lit) return;
      this.buildEmbers();
    }
    const E = this.embers;
    for (const f of this.fires) {
      if (!f.lit || !f.flame.visible || Math.hypot(f.x - focus.x, f.z - focus.z) > 60) continue;
      // 大きな火ほど多く、広い所から、高く舞い上がる（燃える堂は時々ぱっと吹き上がる）
      let n = dt * (f.torch ? 1.2 : 3.5 * Math.max(1, f.size * f.size * 0.45));
      if (f.big && Math.random() < dt * 0.25) n += 8;
      for (; n > 0; n--) {
        if (n < 1 && Math.random() > n) break;
        const i = E.i = (E.i + 1) % E.N, sp = f.size * 0.25;
        E.pos[i * 3] = f.x + (Math.random() - 0.5) * sp; E.pos[i * 3 + 1] = f.base + f.size * 0.3; E.pos[i * 3 + 2] = f.z + (Math.random() - 0.5) * sp;
        E.vel[i * 3] = (Math.random() - 0.5) * 0.8; E.vel[i * 3 + 1] = (1.2 + Math.random() * 1.5) * Math.min(2.2, 0.8 + f.size * 0.3); E.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
        E.life[i] = 1 + Math.random() * (f.big ? 2.4 : 1.2);
      }
    }
    const wx = WIND_STATE.dirX * WIND_STATE.gust * 0.8, wz = WIND_STATE.dirZ * WIND_STATE.gust * 0.8;
    for (let i = 0; i < E.N; i++) {
      if (E.life[i] <= 0) continue;
      E.life[i] -= dt;
      if (E.life[i] <= 0) { E.pos[i * 3 + 1] = -999; continue; }
      E.pos[i * 3] += (E.vel[i * 3] + wx + Math.sin(this.time * 7 + i) * 0.3) * dt;
      E.pos[i * 3 + 1] += E.vel[i * 3 + 1] * dt;
      E.pos[i * 3 + 2] += (E.vel[i * 3 + 2] + wz) * dt;
    }
    E.pts.geometry.attributes.position.needsUpdate = true; E.pts.geometry.attributes.life.needsUpdate = true;
  }


  // 火と舞台の幟を離す。組み立てが終わった最初の更新で一度だけ。
  separateFireFlags() {
    this.fireFlagsDirty = false;
    this.scene.traverse((m) => {
      if (!m.userData.flag || m.parent !== this.scene) return;
      for (const f of this.fires) {
        if (f.torch || Math.abs(f.x) >= this.half || Math.abs(f.z) >= this.half) continue;
        const dx = m.position.x - f.x, dz = m.position.z - f.z, dist = Math.hypot(dx, dz), gap = f.size * .8 + 1.4;
        if (dist >= gap) continue;
        m.position.x = f.x + (dist > .01 ? dx / dist : 1) * gap;
        m.position.z = f.z + (dist > .01 ? dz / dist : 0) * gap;
        m.position.y = this.heightAt(m.position.x, m.position.z);
      }
    });
  }


  // 出来事で初めて燃える戦も、炎・芯・煙・火の粉を幕の内でそろえる。
  battleProgramSamples() {
    flameMat();
    if (!this.smokeCol) this.buildSmokeColumns();
    if (!this.embers) this.buildEmbers();
    const samples = [new THREE.Mesh(FLAME_GEO, FLAME_MAT), new THREE.Mesh(FLAME_GEO, FLAME_CORE_MAT), this.smokeCol.pts, this.embers.pts, this.smokeCol.far.mesh];
    if (this.farFires) samples.push(this.farFires.mesh);
    if (this.def.roundedFire) {
      if (!ROUND_FLAME_MAT) {
        ROUND_FLAME_MAT = FLAME_MAT.clone(); ROUND_FLAME_MAT.uniforms = FLAME_MAT.uniforms;
        ROUND_FLAME_MAT.vertexShader = FLAME_MAT.vertexShader.replace('mix(1.0, 0.025, h * h)', 'sqrt(max(0.001, 1.0 - h * h)) * (0.85 + 0.15 * sin(h * 3.14159))');
        ROUND_FLAME_CORE = ROUND_FLAME_MAT.clone(); ROUND_FLAME_CORE.uniforms = FLAME_CORE_MAT.uniforms;
      }
      samples.push(new THREE.Mesh(FLAME_GEO, ROUND_FLAME_MAT), new THREE.Mesh(FLAME_GEO, ROUND_FLAME_CORE));
    }
    return samples;
  }


  // 焚き火・篝火（炎が揺れる。篝火は夕暮れに灯りをともす）
  addFire(x, z, o = {}) {
    const y = this.heightAt(x, z) + (o.h || 0.15);
    // 炎：揺らぎで舌のように動く板（flameMat）。外の大きな炎と、少しずらした小さな炎の二枚。大きな火（燃える建物）は脇にもう二枚
    let fm = flameMat(), coreMat = FLAME_CORE_MAT;
    if (this.def.roundedFire) {
      if (!ROUND_FLAME_MAT) {
        ROUND_FLAME_MAT = fm.clone(); ROUND_FLAME_MAT.uniforms = fm.uniforms;
        // 根元をふくらませ、先へ丸く細る舌にする。元と同じ時刻・風で揺れる。
        ROUND_FLAME_MAT.vertexShader = fm.vertexShader.replace('mix(1.0, 0.025, h * h)', 'sqrt(max(0.001, 1.0 - h * h)) * (0.85 + 0.15 * sin(h * 3.14159))');
        ROUND_FLAME_CORE = ROUND_FLAME_MAT.clone(); ROUND_FLAME_CORE.uniforms = FLAME_CORE_MAT.uniforms;
      }
      fm = ROUND_FLAME_MAT; coreMat = ROUND_FLAME_CORE;
    }
    // 炎の板は向きを変えて揺れるので、形の球を広めに取って画面の外の火だけ省く（城が燃える戦で百回ほど描いていた）
    if (!FLAME_GEO.userData.wideSphere) { FLAME_GEO.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.1, 0), 1.3); FLAME_GEO.userData.wideSphere = true; }
    const mk = (parent) => { const m = new THREE.Mesh(FLAME_GEO, fm); m.renderOrder = 2; (parent || this.scene).add(m); return m; };
    // o.size：燃える建物などの大きな火（炎を大きく、煙の柱を太く高く）
    const size = o.size || (o.torch ? 0.7 : 1.3);
    const outer = mk(), inner = mk();
    inner.material = coreMat; inner.renderOrder = 3;
    const base = y + size * (o.torch ? 0.3 : 0.35);
    outer.position.set(x, base, z); inner.position.set(x + (o.torch ? size * .12 : 0), base - size * 0.08, z - (o.torch ? size * .1 : 0));
    // 後から置く幟も含め、竿ごと火から離す。兵の旗や任務の札は動かさない。
    if (!o.torch && Math.abs(x) < this.half && Math.abs(z) < this.half) this.fireFlagsDirty = true;
    outer.scale.set(size * 0.95, size * 1.3, 1); inner.scale.set(size * 0.6, size * 0.85, 1);
    if (o.torch || (o.size || 0) >= 2 || this.def.roundedFire && !o.torch) for (const s2 of [-1, 1]) { const e = mk(outer); e.position.set(s2 * (o.torch ? .2 : .36), o.torch ? -.06 : -.12, s2 * (o.torch ? .24 : .15)); e.scale.set(o.torch ? .48 : .62, o.torch ? .78 : .7, 1); }
    // 照り返しは地形に沿う広く淡い裾。柱・草・動く松明は数を絞った点光源で照らす。
    if (!this.fireGlowTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.28)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      this.fireGlowTex = new THREE.CanvasTexture(c);
    }
    if (!this.glowGeo) { this.glowGeo = new THREE.PlaneGeometry(1, 1, 8, 8); this.glowGeo.rotateX(-Math.PI / 2); }
    const lightRadius = o.lightRadius ?? (o.torch ? 10 : Math.max(12, Math.min(28, size * 7)));
    const span = lightRadius * 2, groundY = this.heightAt(x, z);
    const gg = o.torch ? this.glowGeo : this.glowGeo.clone();
    if (!o.torch) {
      const p = gg.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, (this.heightAt(x + p.getX(i) * span, z + p.getZ(i) * span) - groundY) / span);
      p.needsUpdate = true; gg.computeBoundingSphere();
    }
    const glow = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ map: this.fireGlowTex, color: 0xff8d45, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    // 高の夜だけ、点光源から外れた火の淡い照り返しを戻す。
    glow.material.visible = false;
    glow.scale.setScalar(span);
    glow.position.set(x, groundY + 0.025, z);
    glow.renderOrder = 1;
    this.scene.add(glow);
    const f = { flame: outer, inner, glow, base, size, lightRadius, x, z, glowFalloff: 1 / (1 + Math.max(0, y - groundY) ** 2 / (lightRadius * lightRadius)), seed: Math.random() * 10, torch: !!o.torch, nightOnly: !!o.nightOnly };
    // 炎の上に細い煙が昇り、風下へ流れる
    // 篝火・炊ぎの煙は高く（16m ほど）上げ、遠くからでも陣の場所が分かるように
    if (false && !o.nightOnly && o.smoke !== false) f.smoke = this.addSmokeColumn(   // 10/24：篝火の煙は作らない（全戦）
      x, base + size * 0.5, z, { size: o.torch ? 0.18 : o.size ? Math.min(4, o.size * 0.9) : 1.0, black: !!o.blackSmoke });
    // 大きな火（燃える建物）も、揺らめく点の光で周りの地面と人を照らす（光の数は全部で 4 つまで。数を絞って重くしない）
    const big = (o.size || 0) >= 2;
    // 光は近い数個だけ（update の assignFireLights が決まった数の光を近い火へ付け替える）
    f.lightRadius = lightRadius; f.lightColor = o.lightColor ?? 0xff9a4a;
    // 広い火は減衰を指定できる。零なら半径の端で滑らかに消え、十五メートル先にも暖色を残す。
    f.lightStrength = o.lightStrength; f.lightDecay = o.lightDecay ?? 2;
    f.waterReflection = !!o.waterReflection;
    f.big = big; f.lit = !o.nightOnly || this.nightAmount() > 0.1 || this.duskAmount() > 0.4;
    if (o.nightOnly) outer.visible = inner.visible = glow.visible = f.lit;
    f.ly = base - this.heightAt(x, z) + (big ? size * 0.3 : 0.25);
    if (!this.farFires) {
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 128;
      const ctx = canvas.getContext('2d');
      for (let i = 0; i < 5; i++) {
        const x = 32 + Math.sin(i * 2.4) * 8, y = 96 - i * 15, r = 23 - i * 3;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,219,87,.95)'); gr.addColorStop(0.35, 'rgba(255,130,24,.85)');
        gr.addColorStop(0.7, 'rgba(191,41,4,.5)'); gr.addColorStop(1, 'rgba(111,18,2,0)');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 128);
      }
      this.farFires = new EffectSprites(this.scene, new THREE.CanvasTexture(canvas), 192);
    }
    f.far = this.farFires.add(this.scene);
    this.fires.push(f);
    this.fireLightT = 0;
    if (this.fireFill) this.fireFill.time = -1;
    if (false && this.def.lowMaterialBatch) this.batchFireFlames(outer, inner);
    return f;
  }



  // 小谷の低画質だけ、炎の舌を材質ごとの束へ。元の物は松明の移動・消灯・消火の窓口として保つ。
  batchFireFlames(outer, inner) {
    if (!this.fireBatches) {
      this.fireBatches = new Map();
      const before = this.scene.onBeforeRender;
      this.scene.onBeforeRender = (renderer, scene, camera, target) => {
        before.call(scene, renderer, scene, camera, target);
        this.updateFireBatches();
      };
    }
    const batches = this.fireBatches;
    const add = (source, root) => {
      source.layers.disable(0); source.userData.noFreeze = true;
      let batch = batches.get(source.material);
      if (!batch) {
        batch = { list: [], mesh: null, capacity: 0 };
        batches.set(source.material, batch);
      }
      batch.list.push({ source, root });
      if (batch.list.length > batch.capacity) {
        if (batch.mesh) { this.scene.remove(batch.mesh); batch.mesh.dispose(); }
        batch.capacity = Math.max(64, batch.capacity * 2);
        const mesh = new THREE.InstancedMesh(FLAME_GEO, source.material, batch.capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false; mesh.renderOrder = source.renderOrder; mesh.userData.noFreeze = true;
        batch.mesh = mesh; this.scene.add(mesh);
      }
      for (const child of source.children) if (child.isMesh) add(child, root);
    };
    add(outer, outer); add(inner, inner);
  }


  // 行列を送る前に詰める。松明を動かしたそのコマから、同じ位置に炎を描く。
  updateFireBatches() {
    for (const batch of this.fireBatches.values()) {
      let n = 0;
      for (const entry of batch.list) {
        if (!entry.root.visible || entry.root.parent !== this.scene || !entry.source.visible) continue;
        entry.source.updateWorldMatrix(true, false);
        batch.mesh.setMatrixAt(n++, entry.source.matrixWorld);
      }
      batch.mesh.count = n; batch.mesh.instanceMatrix.needsUpdate = true;
    }
  }


  // 地面に沿う光だまりは一枚の束で描く。百の火でも描く回数は一回だけ。
  updateFireGlowBatch(x, z) {
    // 地面そのものを画素ごとに照らす戦は、平たい光の板を重ねない。
    // 松明用の板は地形に沿わず、川岸を橙色の面で横切ってしまう。
    if (this.def.smoothGroundFire) {
      if (this.fireGlowBatch) this.fireGlowBatch.visible = false;
      return;
    }
    const cap = Math.max(32, 2 ** Math.ceil(Math.log2(Math.max(1, this.fires.length))));
    let mesh = this.fireGlowBatch;
    if (!mesh || mesh.userData.capacity < cap) {
      if (mesh) { this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 81 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cap * 81 * 2), 2).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * 81 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const index = new Uint32Array(cap * 384);
      const src = this.glowGeo.index.array;
      for (let i = 0; i < cap; i++) for (let j = 0; j < 384; j++) index[i * 384 + j] = i * 81 + src[j];
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.fireGlowTex, color: 0xff8d45, vertexColors: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
      mesh.userData.capacity = cap; mesh.frustumCulled = false; mesh.renderOrder = 1;
      this.scene.add(mesh); this.fireGlowBatch = mesh;
    }
    const dst = mesh.geometry.attributes;
    let n = 0;
    for (const f of this.fires) {
      if (!f.lit || f.light || !f.glow?.visible || Math.hypot(f.x - x, f.z - z) > 70 + f.lightRadius) continue;
      const g = f.glow, p = g.geometry.attributes.position, uv = g.geometry.attributes.uv;
      for (let j = 0; j < 81; j++) {
        const i = n * 81 + j;
        dst.position.setXYZ(i, p.getX(j) * g.scale.x + g.position.x, p.getY(j) * g.scale.y + g.position.y, p.getZ(j) * g.scale.z + g.position.z);
        dst.uv.setXY(i, uv.getX(j), uv.getY(j));
        dst.color.setXYZ(i, f.glowFalloff, f.glowFalloff, f.glowFalloff);
      }
      n++;
    }
    mesh.geometry.setDrawRange(0, n * 384);
    dst.position.needsUpdate = dst.uv.needsUpdate = dst.color.needsUpdate = true;
    mesh.visible = n > 0;
  }


  // 支度の見本にも本番と同じ火の照明を足す。最初の描画で全材質を作り直さない。
  prepareFireMaterial(o) {
    if (this.fireFill && (this.timeKey === 'night' || this.def.dayFireFill) && this.fires.length) fireFillObject(o);
  }


  // 支度の時間切れで残った材質も、初回から一コマ128節・一ミリ秒まで。
  updateFireMaterials(G) {
    if (!G.matScan) {
      G.matScan = { nodes: [this.scene], indices: [-1] };
    }
    const { nodes, indices } = G.matScan;
    if (!nodes.length) {
      if (this.time - G.matTime < 0.5) return;
      nodes.push(this.scene); indices.push(-1);
    }
    const start = performance.now();
    let visited = 0, steps = 0;
    while (nodes.length && visited < 128) {
      const top = nodes.length - 1, o = nodes[top];
      if (indices[top] === -1) { fireFillObject(o); indices[top] = 0; visited++; }
      if (indices[top] < o.children.length) {
        nodes.push(o.children[indices[top]++]); indices.push(-1);
      } else { nodes.pop(); indices.pop(); }
      if (++steps % 32 === 0 && performance.now() - start >= 1) break;
    }
    if (!nodes.length) G.matTime = this.time;
  }


  // 点光源以外の火は、共有する升に最も強く届く火の位置と半径だけを残す。
  // 一画素で全ての火を調べず、骨の兵・まとめた兵・壁へ同じ方向の暖色を足す。
  updateFireFill(x, z) {
    const G = this.fireFill, night = this.timeKey === 'night';
    const strength = night ? 0.65 : (this.def.dayFireFill || 0);
    FIRE_FILL.area.value.z = strength && this.fires.length ? strength *
      (SETTINGS.reduceMotion ? 1 : 1 + Math.sin(this.time * 2.3) * 0.06 + Math.sin(this.time * 3.7) * 0.038) : 0;
    if (!G || !FIRE_FILL.area.value.z) {
      for (const f of this.fires) if (f.glow) f.glow.material.visible = false;
      if (this.fireGlowBatch) this.fireGlowBatch.visible = false;
      return;
    }
    // 光の升の更新を待つコマにも材質の巡回を進める。
    this.updateFireMaterials(G);
    if (this.fireGlowBatch) this.fireGlowBatch.material.opacity = 0.22 * FIRE_FILL.area.value.z / 0.65;
    if (G.time >= 0 && this.time - G.time < 0.2 && Math.abs(x - G.x) + Math.abs(z - G.z) < 2) return;
    G.time = this.time; G.x = x; G.z = z;
    const ox = Math.floor(x / 2) * 2 - 64, oz = Math.floor(z / 2) * 2 - 64;
    FIRE_FILL.area.value.set(ox, oz, FIRE_FILL.area.value.z);
    G.data.fill(0); G.strength.fill(0);
    for (const f of this.fires) {
      if (!f.lit || f.light) continue;
      const radius = f.lightRadius, fy = f.base + (f.big ? f.size * 0.3 : 0.25);
      const left = Math.max(0, Math.floor((f.x - radius - ox) / 2)), right = Math.min(63, Math.ceil((f.x + radius - ox) / 2));
      const top = Math.max(0, Math.floor((f.z - radius - oz) / 2)), bottom = Math.min(63, Math.ceil((f.z + radius - oz) / 2));
      for (let iz = top; iz <= bottom; iz++) for (let ix = left; ix <= right; ix++) {
        const wx = ox + ix * 2 + 1, wz = oz + iz * 2 + 1;
        const reach = 1 - Math.hypot(wx - f.x, this.heightAt(wx, wz) + 1 - fy, wz - f.z) / radius;
        const i = iz * 64 + ix;
        if (reach <= G.strength[i]) continue;
        G.strength[i] = reach;
        const j = i * 4; G.data[j] = f.x; G.data[j + 1] = fy; G.data[j + 2] = f.z; G.data[j + 3] = radius;
      }
    }
    this.updateFireGlowBatch(x, z);
    G.tex.needsUpdate = true;
  }


  // 近い松明・篝火に、決まった数の光を付け替える（0.5 秒ごと）。低は二つのまま。
  assignFireLights(dt, focus) {
    const P = this.firePool;
    if (!P || !focus || (this.fireLightT = (this.fireLightT || 0) - dt) > 0) return;
    this.fireLightT = 0.5;
    // 決まった光の枠へ近い順に入れる。全ての火の並べ替えは要らない。
    for (const q of P) { q.nearF = null; q.nearD = 4900; }
    for (const f of this.fires) {
      if (!f.lit) continue;
      if (!f.big && !f.torch && !f.nightOnly && this.timeKey !== 'night' && this.timeKey !== 'dusk' && this.timeKey !== 'storm') continue;
      const dx = f.x - focus.x, dz = f.z - focus.z;
      const dy = f.base - focus.y, d2 = dx * dx + dy * dy + dz * dz;
      for (let i = 0; i < P.length; i++) {
        if (d2 >= P[i].nearD) continue;
        for (let j = P.length - 1; j > i; j--) { P[j].nearF = P[j - 1].nearF; P[j].nearD = P[j - 1].nearD; }
        P[i].nearF = f; P[i].nearD = d2;
        break;
      }
    }
    for (const q of P) {
      if (!q.f) continue;
      let keep = false;
      for (const candidate of P) if (candidate.nearF === q.f) { keep = true; break; }
      if (!keep) { q.f.light = null; q.f = null; q.L.intensity = 0; }
    }
    for (const candidate of P) {
      const f = candidate.nearF;
      if (!f || f.light) continue;
      for (const q of P) if (!q.f) {
        q.f = f; f.light = q.L;
        // 小さな火の暖色を遠い壁まで広げず、近い具足と足もとへ集中させる。
        q.L.distance = f.lightRadius ?? (f.big ? 28 : f.torch ? 10 : 12);
        q.L.color.setHex(f.lightColor); q.L.decay = f.lightDecay;
        q.L.position.set(f.x, f.base + (f.big ? f.size * 0.3 : 0.25), f.z);
        q.L.intensity = f.lightPower ?? 8;
        break;
      }
    }
    if (this.fireFill) this.fireFill.time = -1;
  }

  // 画質「低」：炎の板（焚き火・篝火・燃える建物）は、材質ごとに一つの束で描く（描く直前に Battle が呼ぶ）。
  //   火ごとの位置・大きさ・揺れは元の板の行列のまま写す。束へ写した板は層 2 にしてカメラから外す
  flameBatch() {
    // 全画質で束ねる（高でも燃える城や寺で炎の板を一枚ずつ描いて百回ほどになっていた）
    const M = this.flameInst || (this.flameInst = new Map());
    this.flameSources ||= new WeakMap();
    for (const e of M.values()) e.n = 0;
    if (this.fires.length) {
      // 戦ごとに作り直した炎の材質（本能寺の火・重ねた舌など）も、共通の炎の値（FLAME_U）と同じ形の頂点の作りなら束ねる
      for (const f of this.fires) { visitFlame(this, f.flame); visitFlame(this, f.inner); if (f.flame) for (const c of f.flame.children) visitFlame(this, c); }
    } else if (this.flameInst.size) for (const f of this.fires) for (const m of [f.flame, f.inner, ...(f.flame ? f.flame.children : [])]) if (m && m.layers.mask === 2) m.layers.mask = 1;
    for (const e of M.values()) { e.im.count = e.n; e.im.visible = e.n > 0; if (e.n) e.im.instanceMatrix.needsUpdate = true; }
  }
}

export { FLAME_MAT, FLAME_U };
