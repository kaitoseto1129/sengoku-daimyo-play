import * as THREE from 'three';

// 遠景の絵札を一回で描く。元の Sprite は移動・消灯・片付けの窓口として残す。
export class EffectSprites {
  constructor(scene, map, capacity) {
    this.capacity = capacity; this.list = []; this.material = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: true });
    const base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    this.center = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.size = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.color = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('center', this.center); g.setAttribute('size', this.size); g.setAttribute('tint', this.color); g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: map } }]),
      vertexShader: `attribute vec3 center; attribute vec2 size; attribute vec4 tint; varying vec2 vUv; varying vec4 vTint;
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vTint = tint; vec4 mvPosition = modelViewMatrix * vec4(center, 1.0);
          mvPosition.xy += position.xy * size; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec4 vTint;
        #include <fog_pars_fragment>
        void main(){ gl_FragColor = texture2D(map, vUv) * vTint; if(gl_FragColor.a < 0.004) discard;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }` });
    base.dispose();
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    this.mesh.userData.noFreeze = true;
    const order = [], farther = (a, b) => b.userData.effectDepth - a.userData.effectDepth;
    this.mesh.onBeforeRender = (renderer, world, camera) => {
      order.length = 0;
      const ce = camera.matrixWorld.elements;
      for (const sp of this.list) if (sp.visible && sp.parent) {
        sp.userData.effectDepth = (sp.position.x - ce[12]) ** 2 + (sp.position.y - ce[13]) ** 2 + (sp.position.z - ce[14]) ** 2;
        order.push(sp);
      }
      order.sort(farther);
      let n = 0;
      for (const sp of order) {
        if (!sp.visible || !sp.parent) continue;
        if (n >= this.capacity) break;
        this.center.setXYZ(n, sp.position.x, sp.position.y, sp.position.z);
        this.size.setXY(n, sp.scale.x, sp.scale.y);
        const c = sp.userData.color || sp.material.color;
        this.color.setXYZW(n, c.r, c.g, c.b, sp.material.opacity); n++;
      }
      g.instanceCount = n; this.center.needsUpdate = this.size.needsUpdate = this.color.needsUpdate = true;
      this.mesh.userData.drawnLayers = n;
    };
    scene.add(this.mesh);
  }
  add(scene) {
    if (this.list.length >= this.capacity) {
      this.capacity *= 2;
      const g = this.mesh.geometry;
      // 古い属性の描画用の記憶も返してから、容量を増やす。
      g.dispose();
      delete g._maxInstanceCount;
      this.center = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
      this.size = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
      this.color = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('center', this.center); g.setAttribute('size', this.size); g.setAttribute('tint', this.color);
    }
    const sp = new THREE.Sprite(this.material); sp.visible = false; sp.layers.disableAll();
    this.list.push(sp); scene.add(sp); return sp;
  }
  dispose(scene) {
    for (const sp of this.list) scene.remove(sp);
    this.list.length = 0; scene.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    this.material.map.dispose(); this.material.dispose();
  }
  remove(scene, sp) {
    scene.remove(sp); const i = this.list.indexOf(sp); if (i >= 0) this.list.splice(i, 1);
  }
}
