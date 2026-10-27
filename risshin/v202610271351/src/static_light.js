import * as THREE from 'three';

// 固定物は支度中に深度を描き、地形へ投影した柔らかな影を一枚に保存する。
// 遊んでいる間は地面でこの絵を一度読むだけ。兵・馬・幟は焼き込まない。
export class StaticLight {
  constructor(world) {
    this.world = world;
    this.uniforms = { tStaticLight: { value: null }, uStaticReady: { value: 0 }, uStaticHalf: { value: world.half } };
    this.ready = false;
    this.count = 0;
    this.structStates = new WeakMap();
    this.structureVersion = 0;
    this.structureAt = Infinity;
    this.pending = null;
  }
  update(renderer, structs = null) {
    const w = this.world;
    // 門や柵が変わった時は、倒れる動きが落ち着いてから一度だけ焼き直す。
    if (structs) for (const s of structs) {
      const state = (s.alive ? 1 : 0) | (s.opened ? 2 : 0) | (s.mesh?.visible ? 4 : 0);
      if (this.structStates.get(s) !== state) {
        this.structStates.set(s, state);
        if (this.ready) this.structureAt = (w.time || 0) + 2;
      }
    }
    if ((w.time || 0) >= this.structureAt) { this.structureVersion++; this.structureAt = Infinity; }
    // 移ろいの途中を毎コマ焼かず、時刻の段と移ろいの完了で焼き直す。
    const stage = w.dayClock?.label, fading = !!w.fade, version = w.scene.userData.staticShadowVersion || 0;
    const key = this.pending;
    if (key && (key.timeKey !== w.timeKey || key.stage !== stage || key.fading !== fading || key.version !== version || key.structures !== this.structureVersion)) {
      key.work.return(); this.pending = null;
    }
    if (this.ready && this.timeKey === w.timeKey && this.stage === stage && this.fading === fading && this.version === version && this.bakedStructureVersion === this.structureVersion) return;
    if (this.ready) {
      const job = this.pending || (this.pending = { work: this.prepare(), timeKey: w.timeKey, stage, fading, version, structures: this.structureVersion });
      // 直前の影を使いながら、景物の複製と囲みの集計を一コマ32節・約1msまでに分ける。
      const start = performance.now();
      try {
        for (let n = 0; n < 32; n++) {
          const step = job.work.next();
          if (step.done) {
            this.pending = null;
            this.bake(renderer, step.value);
            break;
          }
          if (performance.now() - start >= 1) return;
          if (n === 31) return;
        }
      } catch (e) {
        job.work.return(); this.pending = null; throw e;
      }
    } else this.bake(renderer);
    this.timeKey = w.timeKey; this.stage = stage; this.fading = fading; this.version = version; this.ready = true; this.bakedStructureVersion = this.structureVersion;
  }
  *prepare() {
    const w = this.world, scene = new THREE.Scene();
    const bounds = new THREE.Box3(), part = new THREE.Box3(), instanceBox = new THREE.Box3();
    const instanceMatrix = new THREE.Matrix4();
    const meshes = [], instances = [], originals = new Map();
    let complete = false;
    try {
      // 視点による株の詰め替え・遠景の葉への交換を焼いた影へ持ち込まない。
      for (const group of w.cullList || []) for (const source of group.orig) {
        yield;
        originals.set(source.m, source.mat);
      }
      // 開戦前は兵の自前の行列更新も済ませ、姿の支度へ未更新を持ち越さない。
      // 遊んでいる間の焼き直しだけ、固定物を親から順に更新する。
      if (!this.ready) w.scene.updateMatrixWorld(true);
      else w.scene.updateWorldMatrix(true, false);
      const visit = o => {
        const d = o.userData;
        if (!o.visible && !originals.has(o)) return true;
        if (o._armyUnit || o.isSkinnedMesh || o.isBone || d?.flag || d?.armyBatch || d?.unitShadowBatch ||
            o.name === 'unitBatch' || o.material?.userData?.armyU || o.isPoints || o.isSprite) return true;
        if (this.ready || originals.has(o)) o.updateWorldMatrix(false, false);
        if (o.isMesh && (o.castShadow || o._sceneryCastShadow) && o !== w.terrain) {
          const original = originals.get(o);
          const count = original ? original.length / 16 : o.count;
          const m = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, o.material, count) : new THREE.Mesh(o.geometry, o.material);
          if (o.isInstancedMesh) {
            instances.push(m);
            m.instanceMatrix.array.set(original || o.instanceMatrix.array.subarray(0, count * 16));
            m.instanceMatrix.needsUpdate = true;
          }
          m.matrixAutoUpdate = false; m.matrix.copy(o.matrixWorld);
          m.castShadow = true; m.frustumCulled = false;
          scene.add(m); meshes.push(o);
          return m;
        }
        return false;
      };
      // 節ごとに再帰の生成器を作らず、三つの巡回用配列を使い回す。
      const nodes = [], indices = [], moving = [];
      for (const root of w.scene.children) {
        nodes.push(root); indices.push(-1); moving.push(false);
        while (nodes.length) {
          const at = nodes.length - 1, o = nodes[at];
          if (indices[at] < 0) {
            yield;
            const mesh = visit(o);
            moving[at] = mesh === true; indices[at] = 0;
            if (mesh && mesh !== true) {
              if (o.isInstancedMesh) {
                const data = mesh.instanceMatrix.array;
                if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
                // 株の多い一束も、囲みの計算を三十二株ずつに分ける。
                // 囲みと行列の入れ物は株ごとに作らない。
                const box = mesh.boundingBox = new THREE.Box3();
                for (let i = 0; i < mesh.count; i++) {
                  if (i % 32 === 0) yield;
                  const offset = i * 16;
                  instanceMatrix.fromArray(data, offset);
                  instanceBox.copy(o.geometry.boundingBox).applyMatrix4(instanceMatrix);
                  box.union(instanceBox);
                }
                part.copy(box).applyMatrix4(mesh.matrix);
              } else part.setFromObject(mesh);
              bounds.union(part);
            }
          }
          if (moving[at] !== true && indices[at] < o.children.length) {
            nodes.push(o.children[indices[at]++]); indices.push(-1); moving.push(false);
          } else {
            const skipped = moving.pop();
            nodes.pop(); indices.pop();
            // 子に動く物があっても、残りの兄弟は引き続き調べる。
            if (nodes.length && skipped) moving[nodes.length - 1] = 2;
            else if (!nodes.length) root.userData.bakedShadowRoot = !skipped && !root.isLight && !root.isCamera;
          }
        }
      }
      complete = true;
      return { scene, bounds, meshes, instances };
    } finally {
      // 時刻の変更・戦の終了で途中の仕事を捨てても、共有する形と材質は返さない。
      if (!complete) { for (const m of instances) m.dispose(); scene.clear(); }
    }
  }
  bake(renderer, prepared = null) {
    // 開戦前は全景物をそろえる。遊んでいる間の焼き直しだけ分割する。
    if (!prepared) {
      const work = this.prepare();
      let step;
      do { step = work.next(); } while (!step.done);
      prepared = step.value;
    }
    const w = this.world, { scene, bounds, meshes, instances } = prepared;
    const sun = new THREE.DirectionalLight();
    const source = w.terrain.geometry;
    // 地面は画面外の面を省く前の格子で焼く。元の描画用の索引は触らない。
    // 山城で作り直した地形にも、格子の寸法ではなく実際の頂点と面を使う。
    const ground = new THREE.BufferGeometry();
    ground.setAttribute('position', source.attributes.position.clone());
    const index = source.userData.terrainViewIndex || source.index?.array;
    if (index) ground.setIndex(new THREE.BufferAttribute(index.slice(), 1));
    ground.computeBoundingBox();
    // 遠景の山や空の飾りで的を広げず、戦場の地面を細かく焼く。
    bounds.min.x = Math.max(bounds.min.x, -w.half); bounds.min.z = Math.max(bounds.min.z, -w.half);
    bounds.max.x = Math.min(bounds.max.x, w.half); bounds.max.z = Math.min(bounds.max.z, w.half);
    bounds.union(ground.boundingBox);
    const depthMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const terrainShadow = new THREE.Mesh(ground, depthMaterial);
    terrainShadow.castShadow = true; terrainShadow.frustumCulled = false; scene.add(terrainShadow);
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(1, bounds.getSize(new THREE.Vector3()).length() * 0.5 + 4);
    sun.target.position.copy(center);
    sun.position.copy(w.sunOffset).normalize().multiplyScalar(radius * 2).add(center);
    sun.updateMatrixWorld(true); sun.target.updateMatrixWorld(true);
    const shadow = sun.shadow, camera = shadow.camera;
    camera.left = camera.bottom = -radius; camera.right = camera.top = radius;
    camera.near = 1; camera.far = radius * 4; camera.updateProjectionMatrix();
    shadow.mapSize.set(2048, 2048); shadow.autoUpdate = false; shadow.needsUpdate = true;
    sun.castShadow = true; scene.add(sun, sun.target);
    scene.updateMatrixWorld(true);
    const saved = { enabled: renderer.shadowMap.enabled, auto: renderer.shadowMap.autoUpdate,
      needs: renderer.shadowMap.needsUpdate, target: renderer.getRenderTarget(),
      face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
      viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
      scissorTest: renderer.getScissorTest(), clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
    let material, depthOnly;
    try {
      renderer.shadowMap.enabled = true; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
      if (!this.target) this.target = new THREE.WebGLRenderTarget(1024, 1024, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      renderer.setRenderTarget(this.target); renderer.setScissorTest(false);
      // 通常の描画口で内部の状態を用意してから影を描く。影だけの直接呼び出しは支度中に落ちる。
      // 景物の画面用の材質は焼かず、共通の軽い材質に置き換える。
      depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
      scene.overrideMaterial = depthOnly;
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      // 影の図が作られない時（iPhone の真似の描く bot で設楽原の支度が止まった 10/28）は焼かずに戻る。地面はそのままの明るさ。
      if (!shadow.map) return;
      material = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { depthMap: { value: shadow.map.texture }, shadowMatrix: { value: shadow.matrix }, halfSize: { value: w.half },
          texel: { value: new THREE.Vector2(1 / shadow.mapSize.x, 1 / shadow.mapSize.y) },
          depthBias: { value: 0.08 / (camera.far - camera.near) } },
        vertexShader: `uniform mat4 shadowMatrix; uniform float halfSize; varying vec4 vShadow;
          void main() { vShadow = shadowMatrix * vec4(position, 1.0);
            gl_Position = vec4(position.x / halfSize, position.z / halfSize, 0.0, 1.0); }`,
        fragmentShader: `#include <packing>
          uniform sampler2D depthMap; uniform vec2 texel; uniform float depthBias; varying vec4 vShadow;
          void main() {
            vec3 p = vShadow.xyz / vShadow.w; float shade = 0.0; float ambient = 0.0;
            if (all(greaterThanEqual(p, vec3(0.0))) && all(lessThanEqual(p, vec3(1.0)))) {
              for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
                vec2 offset = vec2(float(x), float(y)) * texel;
                shade += step(unpackRGBAToDepth(texture2D(depthMap, p.xy + offset * 1.4)), p.z - depthBias) / 9.0;
                ambient += step(unpackRGBAToDepth(texture2D(depthMap, p.xy + offset * 4.0)), p.z - depthBias * 1.5) / 9.0;
              }
            }
            gl_FragColor = vec4(1.0 - shade * 0.62, 1.0 - ambient * 0.14, 1.0, 1.0);
          }` });
      scene.clear(); scene.add(new THREE.Mesh(ground, material));
      renderer.shadowMap.enabled = false;
      renderer.setRenderTarget(this.target); renderer.setScissorTest(false);
      renderer.setClearColor(0xffffff, 1); renderer.clear();
      renderer.render(scene, camera);
      this.uniforms.tStaticLight.value = this.target.texture;
      this.uniforms.uStaticReady.value = 1;
      for (const o of meshes) { o._sceneryCastShadow = true; o.castShadow = false; }
      this.count++;
    } finally {
      renderer.shadowMap.enabled = saved.enabled; renderer.shadowMap.autoUpdate = saved.auto;
      renderer.shadowMap.needsUpdate = saved.needs;
      renderer.setRenderTarget(saved.target, saved.face, saved.mip);
      renderer.setViewport(saved.viewport); renderer.setScissor(saved.scissor); renderer.setScissorTest(saved.scissorTest);
      renderer.setClearColor(saved.clear, saved.alpha);
      shadow.dispose(); depthMaterial.dispose(); depthOnly?.dispose(); material?.dispose(); ground.dispose();
      // 形と材質は本体と共用。網自身の描画用の持ち物だけ返す。
      for (const m of instances) m.dispose();
      scene.clear();
    }
  }
  compile(shader) {
    Object.assign(shader.uniforms, this.uniforms);
    shader.fragmentShader = 'uniform sampler2D tStaticLight; uniform float uStaticReady, uStaticHalf;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec2 staticUV = vWP.xz / (uStaticHalf * 2.0) + 0.5;
      vec2 staticShade = mix(vec2(1.0), texture2D(tStaticLight, clamp(staticUV, 0.0, 1.0)).rg, uStaticReady);
      outgoingLight *= staticShade.x * staticShade.y;
      #include <opaque_fragment>`);
  }
  dispose() { this.pending?.work.return(); this.pending = null; this.target?.dispose(); this.target = null; this.uniforms.tStaticLight.value = null; this.uniforms.uStaticReady.value = 0; this.ready = false; }
}
