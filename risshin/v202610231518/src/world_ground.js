import * as THREE from 'three';
import { WEAR, WEAR_HALF } from './world_weather.js';
import { S as SETTINGS } from './settings.js';
import { rng } from './world_common.js';
import { drawGroundAt } from './render_camera.js';


export class WorldGround {

  // 軒下・床下の静かな接地影。地形へ沿わせ、影地図を増やさず曇天でも土との接点を残す。
  addGroundShade(x, z, w, d, rot = 0, opacity = 0.36) {
    if (!this.groundShadeMat) {
      this.groundShadeMat = new THREE.MeshBasicMaterial({ color: 0x20190f, transparent: true,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      this.groundShadeMat.onBeforeCompile = sh => {
        sh.vertexShader = 'varying vec2 vShadeUv;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvShadeUv = uv;');
        sh.fragmentShader = 'varying vec2 vShadeUv;\n' + sh.fragmentShader.replace('#include <color_fragment>',
          `#include <color_fragment>
          vec2 edge = abs(vShadeUv * 2.0 - 1.0);
          diffuseColor.a *= 1.0 - smoothstep(0.55, 1.0, max(edge.x, edge.y));`);
      };
      this.groundShadeMat.customProgramCacheKey = () => 'building-ground-shade';
      this.groundShades = [];
    }
    const geo = new THREE.PlaneGeometry(w, d, 4, 4), p = geo.attributes.position;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i), lz = p.getY(i);
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      p.setXYZ(i, px, drawGroundAt(this, px, pz) + 0.018, pz);
    }
    // 家が重なる町でも道を黒く塗りつぶさない。頂点色で濃さを抑え、一枚の材質を共用する。
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 4).fill(1), 4));
    for (let i = 0; i < p.count; i++) geo.attributes.color.setW(i, Math.min(opacity, 0.24));
    this.groundShadeMat.vertexColors = true;
    const mesh = new THREE.Mesh(geo, this.groundShadeMat);
    // 地形へ写した面は上向きにそろえる。
    const indices = geo.index.array;
    for (let i = 0; i < indices.length; i += 3) {
      const b = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = b;
    }
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    mesh.userData.noMerge = true;
    this.scene.add(mesh); this.groundShades.push(mesh);
    return mesh;
  }


  // ---------------- 踏み荒らし ----------------
  // 兵が歩いた所ほど草が倒れ、土と泥が出る（戦が進むほど足もとが荒れる）。1枚の小さな絵に踏まれた量を貯める
  buildWear() {
    const S = 256;
    this.wearS = S;
    // r：踏み荒らし（草が倒れて土・泥が出る）、g：血の跡（打たれた所の地面に黒ずんだ赤が染みる）
    this.wearData = new Uint8Array(S * S * 2);
    this.wearTex = new THREE.DataTexture(this.wearData, S, S, THREE.RGFormat, THREE.UnsignedByteType);
    this.wearTex.magFilter = THREE.LinearFilter; this.wearTex.minFilter = THREE.LinearFilter;
    this.wearTex.needsUpdate = true;
    WEAR.value = this.wearTex;
    WEAR_HALF.value = this.half;
    this.wearDirty = 0;
  }

  // (x, z) の周り半径 r m を踏む（amt は一度に増える量 0〜255）
  stampWear(x, z, r = 1.2, amt = 10, ch = 0) {
    if (!SETTINGS.groundMarks) return;
    const S = this.wearS, k = S / (this.half * 2);
    const cx = (x + this.half) * k, cz = (z + this.half) * k, rr = Math.max(0.6, r * k);
    const x0 = Math.max(0, Math.floor(cx - rr)), x1 = Math.min(S - 1, Math.ceil(cx + rr));
    const z0 = Math.max(0, Math.floor(cz - rr)), z1 = Math.min(S - 1, Math.ceil(cz + rr));
    for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
      const dx = i - cx, dz = j - cz, d2 = (dx * dx + dz * dz) / (rr * rr);
      if (d2 >= 1) continue;
      const o = (j * S + i) * 2 + ch;
      this.wearData[o] = Math.min(255, this.wearData[o] + amt * (1 - d2));
    }
    this.wearDirty++;
  }

  // 血の跡：打たれた所の足もとに染みる（重なるほど濃く、大きく）
  stampBlood(x, z, r = 0.7, amt = 40) { this.stampWear(x, z, r, amt, 1); }

  // 道や荷車の通った筋を、草の倒れ方と地面で共有する。面や材質は増やさない。
  stampTrail(points, radius = 2, amount = 100) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / Math.max(0.8, radius * 0.6)));
      for (let j = i === 1 ? 0 : 1; j <= steps; j++) this.stampWear(a[0] + dx * j / steps, a[1] + dz * j / steps, radius, amount);
    }
  }

  // その地点の踏み荒らし（0〜1）
  wearAt(x, z) {
    const S = this.wearS, i = Math.max(0, Math.min(S - 1, Math.round((x + this.half) / (this.half * 2) * S))), j = Math.max(0, Math.min(S - 1, Math.round((z + this.half) / (this.half * 2) * S)));
    return this.wearData[(j * S + i) * 2] / 255;
  }


  // 乾いた地面なら土ぼこり、濡れていれば泥はね（歩いた所は踏み荒らされていく）
  // 土・草・泥に足跡・蹄の跡を残す（四十八枠を使い回す。乾いた所は薄く）
  footprint(x, z, hoof, rot = Math.random() * 6.28) {
    if (!SETTINGS.groundMarks) return;
    if (!this.splat) return;
    const k = this.splatIdx ? this.splatIdx(x, z) : -1;
    const mud = k >= 0 ? this.splat[k * 3 + 2] : 0;
    const wet = this.rainLevel > 0.4 || (this.wetness || 0) > 0.5 || (this.def.muddy || 0) > 0.5;
    if (k < 0 || this.inWaterAt(x, z) || this.slopeTan(x, z) > 0.45) return;
    if (!this.feet) {
      const g = new THREE.CircleGeometry(0.5, 10); g.rotateX(-Math.PI / 2);
      // 全戦で光を受ける泥色にする。夜に道案内の橙の板として浮かせない。
      const mat = new THREE.MeshLambertMaterial({ color: 0x393329, transparent: true, opacity: 0.25, depthWrite: false, fog: true });
      // 丸い面の輪郭をそのまま泥へ押さない。縁を崩して薄め、既存の地肌の凹凸を透かす。
      mat.onBeforeCompile = sh => {
        sh.vertexShader = 'varying vec2 vFootUv;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvFootUv = uv * 2.0 - 1.0;');
        sh.fragmentShader = 'varying vec2 vFootUv;\n' + sh.fragmentShader.replace('#include <color_fragment>',
          `#include <color_fragment>
          float footEdge = length(vFootUv) + sin(vFootUv.y * 19.0 + vFootUv.x * 11.0) * 0.06;
          diffuseColor.a *= 1.0 - smoothstep(0.3, 0.95, footEdge);`);
      };
      mat.customProgramCacheKey = () => 'soft-ground-footprint';
      this.feet = new THREE.InstancedMesh(g, mat, 48);
      this.feet.count = 0; this.feet.renderOrder = 1; this.feetI = 0; this.feetD = new THREE.Object3D();
      this.feetColor = new THREE.Color();
      this.feetPositions = new Float32Array(96);
      this.scene.add(this.feet);
    }
    // 残っている跡から一歩あける。足踏みや兵の密集で泥の板を重ねない。
    for (let j = 0; j < this.feet.count; j++) {
      const dx = x - this.feetPositions[j * 2], dz = z - this.feetPositions[j * 2 + 1];
      if (dx * dx + dz * dz < 1) return;
    }
    const d = this.feetD, i = this.feetI;
    this.feetI = (i + 1) % 48;
    this.feetPositions[i * 2] = x; this.feetPositions[i * 2 + 1] = z;
    d.position.set(x, drawGroundAt(this, x, z) + 0.012, z);
    // 足跡も土の斜面へ沿わせる。一度置く時だけ測り、共用の面を使う。
    const sn = Math.sin(rot), cs = Math.cos(rot), step = 0.2;
    const sx = (drawGroundAt(this, x + cs * step, z - sn * step)
      - drawGroundAt(this, x - cs * step, z + sn * step)) / (step * 2);
    const sz = (drawGroundAt(this, x + sn * step, z + cs * step)
      - drawGroundAt(this, x - sn * step, z - cs * step)) / (step * 2);
    d.rotation.order = 'YXZ';
    d.rotation.set(-Math.atan(sz), rot, Math.atan(sx / Math.sqrt(1 + sz * sz)));
    if (hoof) d.scale.set(0.32, 1, 0.3); else d.scale.set(0.2, 1, 0.5);
    if (this.def.darkFootprints) d.scale.multiplyScalar(.8);
    d.updateMatrix();
    this.feet.setMatrixAt(i, d.matrix);
    // 白を掛ける乾いた跡は淡く、泥の跡は暗くする。同じ材質で描く。
    this.feet.setColorAt(i, this.feetColor.setScalar(this.def.darkFootprints ? 0.35 : wet || mud >= 0.35 ? 0.65 : 1));
    this.feet.instanceColor.needsUpdate = true;
    this.feet.count = Math.max(this.feet.count, i + 1);
    this.feet.instanceMatrix.needsUpdate = true;
  }

  // 足もとの水しぶき（n：粒の数。馬は多い）
  spray(x, z, n = 4) {
    const P = this.sprayP;
    if (!P || SETTINGS.reduceMotion || n <= 0) return;
    const depth = this.waterDepthAt(x, z);
    if (depth <= 0.02) return;
    const y = this.heightAt(x, z) + depth + 0.025;
    const W = this.footWaves;
    if (W) {
      const j = W.i * 4;
      W.data[j] = x; W.data[j + 1] = y; W.data[j + 2] = z; W.data[j + 3] = 0.85;
      W.i = (W.i + 1) % W.age.count;
    }
    for (let k = 0; k < n; k++) {
      const i = P.i = (P.i + 1) % P.life.length;
      P.pos[i * 3] = x + (Math.random() - 0.5) * 0.6; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      P.vel[i * 3] = (Math.random() - 0.5) * 2.2; P.vel[i * 3 + 1] = 1.8 + Math.random() * 1.8; P.vel[i * 3 + 2] = (Math.random() - 0.5) * 2.2;
      P.life[i] = P.max[i] = 0.3 + Math.random() * 0.25;
    }
  }

  // 駆ける蹄が後ろへ蹴り上げる土くれと草（使い回しの泥の粒。重さで弧を描いて落ちる）。dx,dz は馬の向き
  kick(x, z, dx, dz, n = 3, sp = 10) {
    if (this.inWaterAt(x, z)) { this.spray(x, z, n); return; }
    const P = this.mudP, y = this.heightAt(x, z), k = Math.min(1.4, sp / 9);
    for (let j = 0; j < n; j++) {
      const i = P.i = (P.i + 1) % P.life.length, b = 1.2 + Math.random() * 2.2;
      P.pos[i * 3] = x + (Math.random() - 0.5) * 0.6; P.pos[i * 3 + 1] = y + 0.15; P.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      P.vel[i * 3] = (-dx * b + (Math.random() - 0.5) * 1.2) * k; P.vel[i * 3 + 1] = (1.8 + Math.random() * 2.2) * k; P.vel[i * 3 + 2] = (-dz * b + (Math.random() - 0.5) * 1.2) * k;
      P.life[i] = P.max[i] = 0.45 + Math.random() * 0.3;
    }
  }

  puff(x, z, n = 2) {
    // 水の中を行く兵は、土煙の代わりに水しぶき（踏み荒らしも付けない）
    if (this.inWaterAt(x, z)) { this.spray(x, z, n >= 2 ? 5 : 2); return; }
    const wet = this.rainLevel > 0.4 || (this.wetness || 0) > 0.5;
    // 馬は蹄で深く掘り返す（通るたびに轍のような筋が濃くなる）
    this.stampWear(x, z, n >= 2 ? 1.5 : 1.1, (wet ? 16 : 10) * (n >= 2 ? 1.6 : 1));
    if (Math.random() < 0.5) this.footprint(x, z, n >= 2);
    const P = wet ? this.mudP : this.dustP;
    const y = this.heightAt(x, z);
    // 乾いた地面では、駆けた後に大きな土煙がしばらく残る（騎馬ほど多く）
    if (!wet && Math.random() < (n >= 2 ? 0.35 : 0.07)) this.dustCloud(x, z, n >= 2);
    for (let k = 0; k < n; k++) {
      const i = P.i = (P.i + 1) % P.life.length;
      P.pos[i * 3] = x + (Math.random() - 0.5) * 0.5; P.pos[i * 3 + 1] = y + 0.1; P.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.5;
      if (wet) { P.vel[i * 3] = (Math.random() - 0.5) * 1.6; P.vel[i * 3 + 1] = 1.2 + Math.random() * 1.2; P.vel[i * 3 + 2] = (Math.random() - 0.5) * 1.6; P.life[i] = P.max[i] = 0.35 + Math.random() * 0.2; }
      else { P.vel[i * 3] = (Math.random() - 0.5) * 0.5 + 0.25; P.vel[i * 3 + 1] = 0.25 + Math.random() * 0.3; P.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.5; P.life[i] = P.max[i] = 1.4 + Math.random() * 1.2; }
    }
  }

  updatePuffs(P, dt, grav) {
    let changed = false, count = 0;
    const drag = 1 - dt * 0.8;
    for (let i = 0; i < P.life.length; i++) {
      if (P.life[i] <= 0) continue;
      changed = true;
      P.life[i] -= dt;
      if (P.life[i] <= 0) { P.pos[i * 3 + 1] = -999; continue; }
      count = i + 1;
      P.vel[i * 3 + 1] -= grav * dt;
      for (let a = 0; a < 3; a++) { P.pos[i * 3 + a] += P.vel[i * 3 + a] * dt; if (!grav) P.vel[i * 3 + a] *= drag; }
    }
    // 粒の上限は保ち、末尾の消えた粒と空の群れを描かない。
    P.points.geometry.setDrawRange(0, count);
    P.points.visible = count > 0;
    if (changed) {
      const g = P.points.geometry.attributes;
      g.position.needsUpdate = true; g.life.needsUpdate = true; g.lmax.needsUpdate = true;
    }
  }


  // 雨上がりの水たまり（道の上）
  addPuddles(n = 26) {
    const mat = new THREE.MeshPhongMaterial({ color: 0x39413b, shininess: 45, specular: 0x5d665d, transparent: true, opacity: 0.75, depthWrite: false });
    // 同じ面の中で泥色へ移り、外縁を透かす。縁の板や描画は足さない。
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uPuddleMud = { value: new THREE.Color(0x60513c) };
      sh.vertexShader = 'attribute float puddleEdge; varying float vPuddleEdge;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vPuddleEdge = puddleEdge;');
      sh.fragmentShader = 'uniform vec3 uPuddleMud; varying float vPuddleEdge;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float mudEdge = smoothstep(0.5, 0.9, vPuddleEdge);
          diffuseColor.rgb = mix(diffuseColor.rgb, uPuddleMud, mudEdge);
          diffuseColor.a *= 1.0 - smoothstep(0.72, 1.0, vPuddleEdge);`)
        .replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\n specularStrength *= 1.0 - mudEdge;');
    };
    const paths = this.def.paths || [];
    const R = rng(77);
    // 縁のいびつな水たまりを何通りか作る（丸い円板が並ばないように）
    const shapes = [0, 1, 2, 3].map(() => {
      const g = new THREE.CircleGeometry(1, 18); const P = g.attributes.position;
      const edge = new Float32Array(P.count); edge.fill(1, 1);
      g.setAttribute('puddleEdge', new THREE.BufferAttribute(edge, 1));
      const f1 = 1 + Math.floor(R() * 3), f2 = 3 + Math.floor(R() * 3), p1 = R() * 6, p2 = R() * 6;
      for (let k = 1; k < P.count; k++) { const x = P.getX(k), y = P.getY(k), a = Math.atan2(y, x); const m = 1 + Math.sin(a * f1 + p1) * 0.22 + Math.sin(a * f2 + p2) * 0.1; P.setXY(k, x * m, y * m); }
      g.rotateX(-Math.PI / 2); return g;
    });
    // 水たまりは一つずつ描く（一つ一回）ので、画質「低」（携帯）は 8 つまで
    for (let i = 0; i < n && paths.length; i++) {
      const p = paths[Math.floor(R() * paths.length)];
      const k = Math.floor(R() * (p.length - 1)), t = R();
      const x = p[k][0] + (p[k + 1][0] - p[k][0]) * t + (R() - 0.5) * 3, z = p[k][1] + (p[k + 1][1] - p[k][1]) * t + (R() - 0.5) * 3;
      const m = new THREE.Mesh(shapes[i % 4], mat);
      m.position.set(x, drawGroundAt(this, x, z) + 0.018, z);
      m.scale.set(0.6 + R() * 1.4, 1, 0.4 + R() * 0.9);
      const yaw = R() * 3, sn = Math.sin(yaw), cs = Math.cos(yaw), step = .3;
      // 水の薄膜も道の勾配へ据える。水平の暗い円板を坂から張り出させない。
      const sx = (drawGroundAt(this, x + cs * step, z - sn * step)
        - drawGroundAt(this, x - cs * step, z + sn * step)) / (2 * step);
      const sz = (drawGroundAt(this, x + sn * step, z + cs * step)
        - drawGroundAt(this, x - sn * step, z - cs * step)) / (2 * step);
      m.rotation.order = 'YXZ';
      m.rotation.set(-Math.atan(sz), yaw, Math.atan(sx / Math.sqrt(1 + sz * sz)));
      this.scene.add(m);
    }
  }
}
