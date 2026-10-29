import * as THREE from 'three';
import { S as SETTINGS } from './settings.js';
import { rng } from './world_common.js';
import { EffectLayers } from './effect_layers.js';
import { WIND_STATE } from './world_weather.js';
import { smokeDepth } from './wind_smoke.js';
import { POST } from './post.js';


export class WorldHaze {

  // 柔らかい丸い粒の絵
  makePuffTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.puffTex = new THREE.CanvasTexture(c);
  }

  // 土ぼこり・泥はね：柔らかい粒が広がりながら薄れる（一粒ごとに大きさと濃さを変える）
  makePuffs(N, color, grow, alpha, drops = false) {
    const P = { pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N).fill(1), i: 0 };
    for (let i = 0; i < N; i++) P.pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P.pos, 3));
    geo.setAttribute('life', new THREE.BufferAttribute(P.life, 1));
    geo.setAttribute('lmax', new THREE.BufferAttribute(P.max, 1));
    if (!this.puffTex) this.makePuffTex();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: this.puffTex }, color: { value: new THREE.Color(color) }, scale: { value: 420 }, sunDir: this.skyMat.uniforms.sunDir, sunCol: this.skyMat.uniforms.sunCol },
      // 日の方を向いて見る粒は光を通して明るく縁が光り、日を背にすると陰の色に沈む
      vertexShader: `attribute float life; attribute float lmax; varying float vA; varying float vLit; uniform float scale; uniform vec3 sunDir; void main(){ float t = 1.0 - clamp(life / lmax, 0.0, 1.0); vA = life > 0.0 ? (1.0 - t) * smoothstep(0.0, 0.15, t) : 0.0; vec4 wp = modelMatrix * vec4(position, 1.0); vLit = pow(max(dot(normalize(wp.xyz - cameraPosition), normalize(sunDir)), 0.0), 3.0); vec4 mv = viewMatrix * wp; gl_PointSize = (${drops ? '0.055' : '0.25'} + t * ${grow.toFixed(2)}) * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color, sunCol; varying float vA; varying float vLit; void main(){ vec4 t = ${drops ? 'vec4(1.0, 1.0, 1.0, 1.0 - smoothstep(0.25, 0.5, length(gl_PointCoord - 0.5)))' : 'texture2D(map, gl_PointCoord)'}; vec3 c = color * (0.85 + vLit * 0.5) + sunCol * vLit * 0.08; gl_FragColor = vec4(c, t.a * vA * ${alpha.toFixed(2)}); if (gl_FragColor.a < 0.004) discard; }`,
    });
    P.points = new THREE.Points(geo, mat);
    P.points.frustumCulled = false;
    this.scene.add(P.points);
    return P;
  }

  buildDust() {
    // 粒は小さな点に見えないよう大きく広げて薄く（色も日なたで黄ばみすぎない土色）
    // 常時漂う土埃・泥の粒は作らず、近い乱戦の小さな板だけ別に使う
    this.dustP = null; this.mudP = null;
    // 水しぶき：川・浅瀬・水田を渡る足もとから、白く跳ねてすぐ落ちる
    this.sprayP = this.makePuffs(160, 0xd6dee0, 0.03, 0.8, true);
    this.buildFootWaves();
    this.dustMat = null;
    this.buildHaze();
  }


  // 波紋は一つの形・材質・固定の配列を使い回す。低画質でも一回の描画。
  buildFootWaves() {
    const N = this.def.streams?.some(st => st.sedimentWater) ? 20 : (64);
    const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
    const age = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
    geo.setAttribute('waveAge', age);
    const mat = new THREE.MeshBasicMaterial({ color: 0xb4c4bf, transparent: true, opacity: 0.32, depthWrite: false, fog: true });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float waveAge; varying float vWaveAge; varying vec2 vWaveUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWaveAge = waveAge; vWaveUv = uv;');
      sh.fragmentShader = 'varying float vWaveAge; varying vec2 vWaveUv;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        vec2 q = vWaveUv * 2.0 - 1.0;
        float r = length(q), a = atan(q.y, q.x);
        float edge = 0.78 + sin(a * 5.0 + vWaveAge * 2.0) * 0.025;
        float ring = 1.0 - smoothstep(0.018, 0.065, abs(r - edge));
        diffuseColor.a *= ring * (1.0 - vWaveAge) * smoothstep(0.0, 0.08, vWaveAge);
        if (diffuseColor.a < 0.004) discard;`);
    };
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 1;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(mesh);
    this.footWaves = { mesh, age, data: new Float32Array(N * 4), dummy: new THREE.Object3D(), i: 0 };
  }

  updateFootWaves(dt) {
    const W = this.footWaves;
    if (!W) return;
    let count = 0;
    for (let i = 0; i < W.age.count; i++) {
      const j = i * 4;
      W.data[j + 3] = SETTINGS.reduceMotion ? 0 : Math.max(0, W.data[j + 3] - dt);
      const life = W.data[j + 3], t = 1 - life / 0.85;
      W.age.array[i] = t;
      W.dummy.position.set(W.data[j], W.data[j + 1], W.data[j + 2]);
      W.dummy.scale.setScalar(life > 0 ? 0.18 + t * 0.85 : 0);
      W.dummy.updateMatrix(); W.mesh.setMatrixAt(i, W.dummy.matrix);
      if (life > 0) count = i + 1;
    }
    W.mesh.count = count; W.mesh.visible = count > 0;
    if (count) {
      W.mesh.material.color.set(0xb4c4bf).multiply(this.hemi.color);
      W.mesh.instanceMatrix.needsUpdate = true; W.age.needsUpdate = true;
    }
  }


  // ---------------- 硝煙の名残 ----------------
  // 鉄砲の煙（兵の側で出す一瞬の煙）の跡に、低くたなびく大きな薄い煙を残す。何挺も撃つと、しばらく前が霞む
  buildHaze() {
    // 硝煙は重く、地面近くに低く溜まって横へ流れる（平たく、低い所に置く）
    // 10/28 飛躍（煙と埃）：10/24 に止めた三つを、上限を半分以下にして戻す。どれも一つの束で描く（一つ一回）
    if (this.def.dojo) { this.haze = this.dustVeil = this.mistVeil = null; this.bloodVeil = null; return; }
    this.haze = this.makeVeil(0xc2c2be, 72, 404, 0.5);
    this.haze.low = true;
    // 土煙：騎馬や隊が駆けた後に、低く大きく残る土色の雲（乾いた日だけ）
    this.dustVeil = this.makeVeil(0x908572, 64, 505, 0.55);
    // 地を這う靄：朝靄の戦・朝・雨上がりに、野の低い所を白い靄の層がゆっくり流れる（どの戦も薄く一層は敷く）
    this.mistVeil = this.makeVeil(0xe2e4e2, 36, 606, 0.3, [0.8, 8]);   // 10/28：近くの靄も見えるよう、薄れ始めをカメラの近くへ（足場の抜きもしない）
    this.mistVeil.low = true;   // 地を這う高さに（顔の高さの白い板にしない）
    // 血の霧：打たれた所に一瞬ふっと立ち、すぐ薄れる細かな赤い霧（カメラのすぐ前でも見える）
    this.bloodVeil = null;   // 10/24：血の霧は作らない（全戦）
  }

  // 血の霧を一つ置く（y：打たれた高さ。amt：0〜1、設定の blood で強さを変えて渡す）
  bloodMist(x, y, z, amt = 1) {
    const B = this.bloodVeil;
    if (!B || amt <= 0) return;
    if (B.list.length >= B.CAP) B.list.shift();
    const gy = this.heightAt(x, z);
    this.stampBlood(x + (Math.random() - 0.5) * 0.8, z + (Math.random() - 0.5) * 0.8, 0.5 + amt * 0.4, 30 + amt * 30);
    B.list.push({ x, z, t: 0, life: 0.9 + Math.random() * 0.5, s0: 0.35, s1: 1.1 + amt * 0.6, a: 0.6 * amt, fin: 14, rise: (y - gy - 0.55) / 0.02, yOff: true });
  }

  // 霧の中の光の筋：日の方から地面へ斜めに差す、淡い光の帯。板を数枚だけ、筋の向きを軸にカメラへ向けて立てる
  // 木立と城に位置を固定し、近い三か所の板を使い回す
  buildShafts() {
    const N = 3, RANGE = 75, R = rng((this.def.seed || 3) * 7 + 11);
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.setAttribute('position', quad.attributes.position);
    const ofs = new Float32Array(N * 3), dat = new Float32Array(N * 3);
    // 木と城の実際の場所を拾う。設営時だけ配列を作り、進行中は三枚を使い回す。
    this.shaftAnchors = [];
    for (const mesh of this.treeMeshes || []) {
      if (!mesh.isInstancedMesh || !mesh.instanceMatrix) continue;
      const m = mesh.instanceMatrix.array;
      for (let i = 0; i < mesh.count; i += Math.max(1, Math.ceil(mesh.count / 16))) {
        const x = m[i * 16 + 12] + mesh.position.x, z = m[i * 16 + 14] + mesh.position.z;
        this.shaftAnchors.push({ x, z, y: this.heightAt(x, z) + 1, used: false });
      }
      if (this.shaftAnchors.length >= 64) break;
    }
    if (this.def.castle) {
      const c = this.def.castle, x = c.x || 0, z = c.z || 0;
      this.shaftAnchors.push({ x, z, y: this.heightAt(x, z) + 3, used: false });
    }
    for (let i = 0; i < N; i++) { dat[i * 3] = 1.5 + R() * 2; dat[i * 3 + 1] = 18 + R() * 14; dat[i * 3 + 2] = R() * 6.28; }
    geo.setAttribute('ofs', new THREE.InstancedBufferAttribute(ofs, 3));
    geo.setAttribute('dat', new THREE.InstancedBufferAttribute(dat, 3));
    geo.instanceCount = N;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { sunDir: this.skyMat.uniforms.sunDir, sunCol: this.skyMat.uniforms.sunCol, fogC: { value: new THREE.Color() }, focus: { value: new THREE.Vector3() }, amt: { value: 0 }, time: this.skyMat.uniforms.time, range: { value: RANGE } },
      vertexShader: `attribute vec3 ofs; attribute vec3 dat; uniform vec3 sunDir, focus; uniform float range; varying vec2 vUv; varying vec3 vW; varying float vPh; varying float vEdge;
        void main(){
          vec2 rel = ofs.xz - focus.xz;
          vec3 base = ofs;
          vec3 ax = normalize(sunDir);
          vec3 side = cross(ax, base - cameraPosition);
          side /= max(length(side), 0.001);
          vW = base + ax * dat.y * (position.y + 0.5) + side * dat.x * position.x;
          vUv = position.xy + 0.5; vPh = dat.z;
          vEdge = 1.0 - smoothstep(range * 0.65, range, length(rel));
          gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
        }`,
      fragmentShader: `uniform vec3 sunDir, sunCol, fogC; uniform float amt, time; varying vec2 vUv; varying vec3 vW; varying float vPh; varying float vEdge;
        void main(){
          float ac = 1.0 - abs(vUv.x * 2.0 - 1.0); ac = ac * ac * (3.0 - 2.0 * ac);
          float al = smoothstep(0.0, 0.2, vUv.y) * (1.0 - smoothstep(0.4, 1.0, vUv.y));
          // 筋の中のむら（雲の切れ間が動いて、光がゆっくり強まり弱まる）
          float st = (0.65 + 0.35 * sin(vUv.x * 9.0 + vPh + time * 0.25)) * (0.55 + 0.45 * sin(time * 0.11 + vPh * 3.0));
          vec3 v = vW - cameraPosition; float dist = max(length(v), 0.001);
          float fwd = pow(max(dot(v / dist, normalize(sunDir)), 0.0), 3.0);
          float a = amt * ac * al * st * vEdge * (0.12 + 1.3 * fwd) * smoothstep(5.0, 22.0, dist) * 0.09;
          gl_FragColor = vec4(mix(sunCol, fogC, 0.35) * a, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.shafts = new THREE.Mesh(geo, mat);
    this.shafts.frustumCulled = false;
    this.shafts.renderOrder = 3;
    this.shafts.visible = false;
    this.scene.add(this.shafts);
  }

  updateShafts(want, focus) {
    if (this.def.noShafts || SETTINGS.reduceMotion || this.timeKey === 'night' || this.timeKey === 'storm') {
      if (this.shafts) { this.shafts.visible = false; this.shafts.material.uniforms.amt.value = 0; }
      return;
    }
    if (!focus) return;
    if (!this.shafts) { if (want <= 0.01) return; this.buildShafts(); }
    const U = this.shafts.material.uniforms;
    U.amt.value = want;
    this.shafts.visible = want > 0.01 && this.shaftAnchors.length > 0;
    if (!this.shafts.visible) return;
    // 一秒に一度だけ近い木立を選ぶ。板は世界に留め、カメラへの向きだけ頂点で合わせる。
    if ((this.shaftPickAt ?? -1) <= this.time) {
      this.shaftPickAt = this.time + 1;
      const attr = this.shafts.geometry.attributes.ofs, anchors = this.shaftAnchors;
      for (const a of anchors) a.used = false;
      let count = 0;
      for (let i = 0; i < 3; i++) {
        let best = null, distance = 70 * 70;
        for (const a of anchors) {
          const d = (a.x - focus.x) ** 2 + (a.z - focus.z) ** 2;
          if (a.used || d < 12 * 12 || d >= distance) continue;
          best = a; distance = d;
        }
        if (!best) break;
        best.used = true;
        // 直射側の枝・屋根の向こうから、風景に隠れている光が差す。
        const sun = U.sunDir.value;
        attr.setXYZ(i, best.x + sun.x * 3, best.y, best.z + sun.z * 3); count++;
        for (const a of anchors) if ((a.x - best.x) ** 2 + (a.z - best.z) ** 2 < 100) a.used = true;
      }
      attr.needsUpdate = true; this.shafts.geometry.instanceCount = count;
    }
    U.focus.value.copy(focus);
    U.fogC.value.copy(this.scene.fog.color);
  }

  // 近い乱戦の膝下に舞う二十四枚。寿命・風下への流れ・正対は頂点で計算する。
  buildBattleDust() {
    const quad = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.setAttribute('position', quad.attributes.position);
    const data = new Float32Array(24 * 4);
    for (let i = 0; i < 24; i++) data[i * 4 + 3] = -100;
    geo.setAttribute('source', new THREE.InstancedBufferAttribute(data, 4).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = 24;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { clock: { value: 0 }, wind: { value: new THREE.Vector2() }, color: { value: new THREE.Color() } },
      vertexShader: `attribute vec4 source; uniform float clock; uniform vec2 wind;
        varying vec2 vUv; varying float vAlpha;
        void main() {
          float age = clock - source.w, t = clamp(age / 2.4, 0.0, 1.0);
          float seed = fract(sin(source.w * 93.7) * 4375.3);
          vec3 p = source.xyz;
          p.xz += wind * t * 1.8 + vec2(sin(t * 5.0 + seed * 6.28), cos(t * 4.0 + seed * 6.28)) * t * 0.3;
          p.y += sin(t * 3.14159) * (0.3 + seed * 0.45);
          vec4 eye = viewMatrix * vec4(p, 1.0);
          float d = length(eye.xyz);
          eye.xy += position.xy * (0.10 + seed * 0.12 + t * 0.15);
          vUv = position.xy + 0.5;
          vAlpha = step(0.0, age) * sin(t * 3.14159) * (1.0 - smoothstep(18.0, 30.0, d)) * smoothstep(1.0, 4.0, d) * 0.24;
          gl_Position = projectionMatrix * eye;
        }`,
      fragmentShader: `uniform vec3 color; varying vec2 vUv; varying float vAlpha;
        void main() {
          vec2 q = vUv * 2.0 - 1.0;
          float a = max(0.0, 1.0 - dot(q, q));
          gl_FragColor = vec4(color, a * a * vAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.battleDust = new THREE.Mesh(geo, mat);
    this.battleDust.frustumCulled = false; this.battleDust.visible = false;
    this.battleDustSlot = 0; this.scene.add(this.battleDust);
  }

  updateBattleDust(dt, focus) {
    const off = SETTINGS.reduceMotion || !focus || this.rainLevel > 0.15 || this.def.muddy > 0 || this.def.dojo;
    if (off) {
      if (this.battleDust && this.battleDustUntil) {
        this.battleDust.visible = false; this.battleDustUntil = 0;
        const attr = this.battleDust.geometry.attributes.source;
        attr.array.fill(-100); attr.needsUpdate = true;
      }
      return;
    }
    this.battleDustTick = (this.battleDustTick || 0) - dt;
    if (this.battleDustTick <= 0) {
      this.battleDustTick = 0.3;
      let near = null, distance = 24 * 24;
      for (const c of this.clashes || []) {
        const d = (c.x - focus.x) ** 2 + (c.z - focus.z) ** 2;
        if (c.phase === 'fight' && d < distance) { near = c; distance = d; }
      }
      if (near) {
        if (!this.battleDust) this.buildBattleDust();
        const attr = this.battleDust.geometry.attributes.source;
        for (let i = 0; i < 3; i++) {
          const n = this.battleDustSlot++ % 24, angle = n * 2.39996;
          const x = near.x + Math.sin(angle) * 2.5, z = near.z + Math.cos(angle) * 2.5;
          if (this.inWaterAt(x, z)) continue;
          attr.setXYZW(n, x, this.heightAt(x, z) + 0.15, z, this.time + i * 0.04);
          this.battleDustUntil = this.time + 2.5;
        }
        attr.needsUpdate = true;
      }
    }
    if (!this.battleDust) return;
    this.battleDust.visible = this.time < this.battleDustUntil;
    const U = this.battleDust.material.uniforms;
    U.clock.value = this.time;
    U.wind.value.set(WIND_STATE.dirX * WIND_STATE.gust, WIND_STATE.dirZ * WIND_STATE.gust);
    U.color.value.set(0xa99b81).multiply(this.hemi.color).multiplyScalar(this.timeKey === 'night' ? 0.2 : 0.85);
  }

  updateGroundMist(dt, focus) {
    const M = this.mistVeil;
    if (!M) return;
    const morningMist = this.dayClock ? this.dayClock.mist : Math.max(0, 1 - this.time / 150);
    const early = this.def.mist ? (this.dayClock ? morningMist : Math.max(0, 1 - this.time / 90)) : 0;
    if (this.timeKey === 'after') this.afterT = (this.afterT || 0) + dt; else this.afterT = 0;
    // 雨上がり：地面から白い靄が立ち、一分半ほどで薄れる
    const after = this.timeKey === 'after' ? Math.max(0, 1 - this.afterT / 90) * 0.9 : 0;
    // 雨：野の奥にも靄の帯を重ね、遠い木立が一枚の灰色の板でなく、奥へ幾重にも重なって霞の中から立つように見せる
    const rainMist = Math.min(1, Math.max(0, (this.rainLevel || 0) - 0.15) * 1.2) * 0.8;
    // 戦場の空気：どの戦も最初の二分は野の低い所に薄い靄（昼は戦塵の霞）を一層だけ敷き、のちに薄くする（夜は暗く沈む）
    // 10/28：始めの25秒は近くの靄をはっきり（のちに一分かけて元の薄さへ）
    const open = this.time < 25 ? 1 : Math.max(0, 1 - (this.time - 25) / 60);
    const base = (this.timeKey === 'night' ? 0.12 + 0.08 * open : 0.24 + 0.16 * open) * (this.time < 120 ? 1 : Math.max(0.5, 1 - (this.time - 120) / 240));
    const amt = Math.max(base, early, after, this.mood === 'morning' && this.timeKey === 'day' ? (this.dayClock ? 0.3 * morningMist : 0.12 + 0.18 * morningMist) : 0, this.def.mist && !this.dayClock ? 0.2 : 0, rainMist) * (1) * (this.def.groundMistScale ?? 1);
    const want = Math.round(amt * 60);
    // 遠く離れた靄は捨て、足りなければ周りに足す
    for (let i = M.list.length - 1; i >= 0; i--) { const p = M.list[i]; if (Math.hypot(p.x - focus.x, p.z - focus.z) > (rainMist > 0 ? 170 : 110)) M.list.splice(i, 1); }
    // 始めの一コマは足りない分を一度に敷き、生まれ途中の濃さから始める（最初の画面から靄が見える）
    const first = M.list.length === 0 && this.time < 2;
    let add = first ? want : Math.min(3, want - M.list.length);
    while (add-- > 0) {
      // 三つに一つはカメラの近く（4〜20m）に置き、足もとの靄として見せる
      const nearOne = Math.random() < 0.34 * open + 0.12;
      const a = Math.random() * Math.PI * 2, r = nearOne ? 4 + Math.random() * 16 : 12 + Math.random() * (rainMist > 0 ? 150 : 85), bg = rainMist > 0 && r > 70 ? 1.8 : 1;
      const life = 40 + Math.random() * 30;
      M.list.push({ x: focus.x + Math.cos(a) * r, z: focus.z + Math.sin(a) * r, t: first ? life * (0.1 + Math.random() * 0.3) : 0, life, s0: (12 + Math.random() * 6) * bg * (nearOne ? 0.7 : 1), s1: (20 + Math.random() * 12) * bg * (nearOne ? 0.7 : 1), a: (0.06 + amt * 0.13) * (1 + 4 * open), rise: -0.004 });
    }
    this.flowVeil(M, dt);
  }

  // 低くたなびく大きな薄い雲（硝煙・土煙）。日の方を向くと透けて明るく、日を背にすると灰に沈む
  // 生まれたては濃く色が強く、流れるうちに周りの霞の色へ褪せる
  makeVeil(color, CAP, seed, flat, near = [7, 24]) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
    const ctr = new Float32Array(CAP * 3), dat = new Float32Array(CAP * 3);
    geo.setAttribute('ctr', new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3));
    geo.setAttribute('dat', new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3));
    geo.instanceCount = 0;
    if (!this.puffTex) this.makePuffTex();
    // もこもこした煙の絵
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const R = rng(seed);
    for (let i = 0; i < 30; i++) {
      const a = R() * 6.28, r = R() * 34, px = 64 + Math.cos(a) * r, py = 70 + Math.sin(a) * r * 0.6, rr = 16 + R() * 26;
      const gr = g.createRadialGradient(px, py, 0, px, py, rr); gr.addColorStop(0, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: tex }, color: { value: new THREE.Color(color) }, fogC: { value: new THREE.Color(0xaaaaaa) }, sunDir: this.skyMat.uniforms.sunDir, sunCol: this.skyMat.uniforms.sunCol },
      // dat.x ＝ 大きさ、dat.y ＝ 濃さ、dat.z ＝ 年（0 生まれたて〜1 消える）
      vertexShader: `attribute vec3 ctr; attribute vec3 dat; uniform vec3 sunDir, sunCol, color, fogC; varying vec2 vUv; varying float vA; varying vec3 vC, vView;
        void main(){
          // 粒の年齢と発生位置で渦をずらす。同じ煙の絵が一斉に膨らむ印象を消す。
          float turn = dat.z * 0.65 + ctr.x * 0.017 + ctr.z * 0.013;
          float cs = cos(turn), sn = sin(turn);
          vUv = mat2(cs, -sn, sn, cs) * (uv - 0.5) * 0.78 + 0.5;
          vec4 mv = modelViewMatrix * vec4(ctr, 1.0);
          mv.xy += position.xy * vec2(dat.x * 1.6, dat.x * ${flat.toFixed(2)});
          vView = mv.xyz;
          // カメラのすぐ前では薄く（板が顔を横切らないように）
          vA = dat.y * smoothstep(${near[0].toFixed(1)}, ${near[1].toFixed(1)}, -mv.z);
          // 日の光：日の方を見ると光を通して明るく、日を背にすると陰の灰
          vec3 vd = normalize(ctr - cameraPosition);
          float fw = pow(max(dot(vd, normalize(sunDir)), 0.0), 3.0);
          vec3 c = mix(color, fogC * 1.02, smoothstep(0.1, 0.9, dat.z) * 0.6);
          // 煙は自ら光らない：霞の明るさ（＝その時の空の明るさ）に合わせて沈める。夕暮れ・夜に白く光る綿にならない
          float amb = clamp(dot(fogC, vec3(0.3, 0.59, 0.11)) * 1.3, 0.2, 0.9);
          vC = (c * (0.78 + fw * 0.25) + sunCol * fw * 0.035) * amb;
          gl_Position = projectionMatrix * mv;
        }`,
      // 手前の中央下側だけ薄くし、自分から戸口へ続く足場を残す。
      // 煙の数・広がり・風・敵の視認判定は変えない。血の霧には適用しない。
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying float vA; varying vec3 vC, vView;
        void main(){
          vec2 dd = (vUv - 0.5) * 2.0;
          float a = texture2D(map, vUv).a * (0.45 + 0.55 * texture2D(map, vUv.yx * 0.7 + 0.15).a) * vA * (1.0 - smoothstep(0.15, 1.0, length(dd)));
          ${near[0] > 1 ? `float depth = max(1.0, -vView.z);
          float lane = (1.0 - smoothstep(0.12, 0.32, abs(vView.x) / depth)) * (1.0 - smoothstep(0.12, 0.38, vView.y / depth));
          a *= 1.0 - 0.75 * lane * (1.0 - smoothstep(10.0, 28.0, depth));` : ''}
          a = min(a, 0.42); if (a < 0.003) discard;
          gl_FragColor = vec4(vC, a);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    return { mesh, ctr, dat, CAP, flat, layers: new EffectLayers(), acc: 0, list: [], spare: Array.from({ length: CAP }, () => ({})), seen: new WeakSet(), scanT: 0, load: 0, k: 0 };
  }

  // 煙の入れ物は、消えたものか上限で退けたものを使い回す。
  veilParticle(H) {
    const p = H.list.length >= H.CAP ? H.list.shift() : H.spare.pop();
    p.fin = 0; p.yOff = false; p.rise = 0; p.environment = false; p.cy = undefined;
    H.list.push(p);
    return p;
  }

  // 硝煙の名残を一つ置く（兵の側からも呼べる：world.gunSmoke(x, z)）
  gunSmoke(x, z, tint, environment = false) {
    const H = this.haze;
    if (!H) return;
    // 狭い攻城路の指定だけ、煙の名残を小さく短くする。ほかの戦は従来どおり。
    const scale = Math.max(.25, Math.min(1, this.def.gunHazeScale ?? 1));
    if (environment && (SETTINGS.reduceMotion || H.list.length >= (32))) return;
    if (tint) H.mesh.material.uniforms.color.value.set(tint);
    // 同じ列の一斉射は若い雲へ溜める。枚数を増やして前の射撃の煙を追い出さない。
    for (let i = H.list.length - 1; i >= 0; i--) {
      const p = H.list[i], dx = p.x - x, dz = p.z - z;
      if (p.t > 6 || dx * dx + dz * dz > 9) continue;
      p.a = Math.min(0.34 * scale, p.a + 0.06 * scale);
      if (!SETTINGS.reduceMotion) p.s1 = Math.min(24 * scale, p.s1 + scale);
      return;
    }
    const p = this.veilParticle(H);
    p.environment = environment;
    p.x = x + (Math.random() - 0.5) * 2; p.z = z + (Math.random() - 0.5) * 2;
    const calm = Math.max(0, Math.min(1, 1.15 - WIND_STATE.gust));
    p.t = 0; p.life = (32 + Math.random() * 22) * (1 + calm * 0.5) * scale; p.s0 = (4 + Math.random() * 2) * scale;
    p.s1 = (13 + Math.random() * 8) * scale; p.a = (0.16 + Math.random() * 0.08) * scale;
    H.fresh = (H.fresh || 0) + 1;
  }

  // 土煙を一つ置く（騎馬ほど大きい）
  dustCloud(x, z, big, environment = false, contact = false) {
    const D = this.dustVeil;
    if (!D) return;
    if (environment && (SETTINGS.reduceMotion || D.list.length >= (24))) return;
    // 騎馬の土煙は大きく高く舞い上がり、後ろの景色をかすませる
    const p = this.veilParticle(D);
    p.environment = environment; p.cosmetic = contact; p.yOff = contact;
    p.x = x + (Math.random() - 0.5) * 1.5; p.z = z + (Math.random() - 0.5) * 1.5;
    p.t = 0; p.life = (big ? 11 : 6) + Math.random() * 6; p.s0 = big ? 3 : 1.6;
    p.s1 = (big ? 12 : 5) + Math.random() * (big ? 6 : 4); p.a = (big ? 0.12 : 0.07) + Math.random() * 0.04;
    p.rise = (big ? 0.3 : 0.15) + Math.random() * 0.2;
    if (contact) {
      // 足首から膝の高さに留め、顔と退き道を覆わない。視界判定には加えない。
      p.life = 3 + Math.random(); p.s0 = 0.7; p.s1 = 2.4;
      p.a = 0.13; p.rise = 0.02;
    }
    D.fresh = (D.fresh || 0) + (contact ? 0 : big ? 0.4 : 0.15);
    return p;
  }

  // 地面の高さ・膨らみ・濃さは粒の刻みでだけ求める。
  veilPose(H, p, still) {
    const k = p.t / p.life, s = still ? p.s1 * 0.65 : p.s0 + (p.s1 - p.s0) * Math.sqrt(k);
    p.size = s;
    p.cy = this.heightAt(p.x, p.z) + (p.yOff ? p.rise * 0.02 + 0.4 - s * 0.1 : H.low ? s * 0.13 + 0.35 + (still ? 0 : Math.min(1.2, p.t * 0.02)) : s * 0.22 + 0.4 + (p.rise || 0) * p.t);
    p.alpha = p.a * Math.min(1, p.t * (p.fin || 0.6)) * (1 - k) * (1 - k * 0.5);
  }

  // 毎秒十五回だけ流し、描くコマでは前後の位置・大きさ・濃さを補間する。
  flowVeil(H, dt) {
    const still = H.low && SETTINGS.reduceMotion, tick = 1 / 15;
    const wx = WIND_STATE.dirX * 0.6 * WIND_STATE.gust, wz = WIND_STATE.dirZ * 0.6 * WIND_STATE.gust;
    H.acc += dt;
    for (const p of H.list) if (p.cy === undefined) {
      this.veilPose(H, p, still);
      p.px = p.x; p.py = p.cy; p.pz = p.z; p.ps = p.size; p.pa = p.alpha;
    }
    while (H.acc >= tick) {
      H.acc -= tick;
      let n = 0;
      for (const p of H.list) {
        p.px = p.x; p.py = p.cy; p.pz = p.z; p.ps = p.size; p.pa = p.alpha;
        const step = p.environment && SETTINGS.reduceMotion ? 0 : tick;
        p.t += step;
        if (p.t >= p.life) { if (H.spare.length < H.CAP) H.spare.push(p); continue; }
        if (!still) { p.x += wx * step; p.z += wz * step; }
        this.veilPose(H, p, still);
        H.list[n++] = p;
      }
      H.list.length = n;
    }
    const g = H.mesh.geometry, ctr = g.attributes.ctr.array, dat = g.attributes.dat.array, V = this.vegView;
    const blend = H.acc / tick, layers = H.layers, camera = this.camRef;
    layers.reset();
    for (let i = 0; i < H.list.length; i++) {
      const p = H.list[i], k = p.t / p.life;
      // 視界・命中判定用は省略前の全粒を残す。
      H.ctr[i * 3] = p.x; H.ctr[i * 3 + 1] = p.cy; H.ctr[i * 3 + 2] = p.z;
      H.dat[i * 3] = p.size; H.dat[i * 3 + 1] = p.alpha; H.dat[i * 3 + 2] = k;
      const x = p.px + (p.x - p.px) * blend, y = p.py + (p.cy - p.py) * blend, z = p.pz + (p.z - p.pz) * blend;
      const size = p.ps + (p.size - p.ps) * blend, alpha = p.pa + (p.alpha - p.pa) * blend;
      if (V) { V.sphere.center.set(x, y, z); V.sphere.radius = size * 1.3 + 2; }
      if (V && !V.fr.intersectsSphere(V.sphere)) continue;
      const distanceSq = camera ? (x - camera.position.x) ** 2 + (y - camera.position.y) ** 2 + (z - camera.position.z) ** 2 : 0;
      const before = layers.count;
      let at = layers.slot(x, z, distanceSq), j = at * 3;
      if (at < before) {
        if (layers.merge(ctr, dat, j, x, y, z, size, 1.6, H.flat)) {
          dat[j + 1] = Math.min(0.7, 1 - (1 - dat[j + 1]) * (1 - alpha));
          continue;
        }
        at = layers.count++; j = at * 3;
      }
      ctr[j] = x; ctr[j + 1] = y; ctr[j + 2] = z;
      dat[j] = size; dat[j + 1] = alpha; dat[j + 2] = k;
    }
    // 遠景もカメラに正対する一枚の絵札。既存の束の中で描き、呼び出し数を増やさない。
    H.mesh.userData.effectLayers = layers;
    g.instanceCount = layers.count; H.mesh.visible = layers.count > 0;
    if (layers.count) { g.attributes.ctr.needsUpdate = true; g.attributes.dat.needsUpdate = true; }
    H.mesh.material.uniforms.fogC.value.copy(this.scene.fog.color);
  }

  updateHaze(dt, focus) {
    const H = this.haze;
    if (!H) { POST.smoke = 0; this.updateGroundMist(dt, focus); return; }
    this.flowVeil(H, dt);
    // 流れた先の白煙だけで視界を薄くする。遠い一斉射で足もとまで白くしない
    const load = smokeDepth(this, focus);
    H.load = load;
    const target = Math.min(0.6, load * 2.8);   // 10/28：硝煙の中でも画面が白一色にならない上限
    H.k += (target - H.k) * Math.min(1, dt * (target > H.k ? 1.2 : 0.5));
    POST.smoke = Math.min(1, H.k * 1.3);
    this.updateGroundMist(dt, focus);
    if (this.bloodVeil && (this.bloodVeil.list.length || this.bloodVeil.mesh.visible)) this.flowVeil(this.bloodVeil, dt);
    // 戦塵：土煙が多く立つほど、戦場の空気が黄ばんで霞む
    const D = this.dustVeil;
    if (D) {
      this.flowVeil(D, dt);
      let dustLoad = 0;
      for (let i = 0; i < D.list.length; i++) {
        const p = D.list[i];
        if (p.cosmetic) continue;
        const r = p.size * 0.8 + 3;
        const d = Math.hypot(p.x - focus.x, p.z - focus.z);
        if (d < r) dustLoad += D.dat[i * 3 + 1] * (1 - d / r);
      }
      // 土煙は景色の霞を少しだけ寄せる（10/28：足もとの土煙で画面全体が灰一色になった）
      const dT = Math.min(0.18, dustLoad * 1.5);
      D.k += (dT - D.k) * Math.min(1, dt * (dT > D.k ? 1.2 : 0.5));
    }
  }
}
