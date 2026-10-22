import * as THREE from 'three';
import { WIND_STATE } from './world_weather.js';
import { setScene } from './audio.js';


export class WorldRain {

  buildRain() {
    // 雪も雨の線と配列を使う。携帯では雪を三百二十粒までに抑える
    const N = this.def.snow ? (640) : (1600);
    const pos = new Float32Array(N * 6);
    this.rainData = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.rainData[i * 3] = (Math.random() - 0.5) * 70;
      this.rainData[i * 3 + 1] = Math.random() * 30;
      this.rainData[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xc9d2d6, transparent: true, opacity: 0.45 });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
    // 手前の太い雨筋：目の前 1〜9m の粒は、幅のある板にして太く速く見せる（遠くの細い線と重ねて奥行きを出す）
    const NN = 96;
    this.nearRain = new Float32Array(NN * 4);   // x, y, z（自分からのずれ）, 速さ
    for (let i = 0; i < NN; i++) this.respawnNearDrop(i, true);
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NN * 18), 3));
    ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(NN * 12).map((v, k) => [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1][k % 12]), 2));
    const nmat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { color: { value: new THREE.Color(0xd4dce0) }, op: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      // 筋の真ん中ほど濃く、上の端（尾）ほど薄い
      fragmentShader: 'uniform vec3 color; uniform float op; varying vec2 vUv; void main(){ float a = (1.0 - abs(vUv.x * 2.0 - 1.0)) * (1.0 - vUv.y * 0.8) * op; gl_FragColor = vec4(color, a); }',
    });
    this.rainNear = new THREE.Mesh(ng, nmat);
    this.rainNear.frustumCulled = false;
    this.rainNear.visible = false;
    this.rainNear.renderOrder = 3;
    this.scene.add(this.rainNear);
    // 地面で跳ねる雨粒
    // 跳ね：小さな冠（三本の短い飛沫が外へ開く）
    const SN = 400;
    this.splash = new Float32Array(SN * 3);
    this.splashT = new Float32Array(SN);
    this.splashLine = new Float32Array(SN * 18);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.splashLine, 3));
    this.splashPts = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xd8e0e4, transparent: true, opacity: 0.5, depthWrite: false }));
    this.splashPts.frustumCulled = false;
    this.splashPts.visible = false;
    this.scene.add(this.splashPts);
  }


  setRainTarget(v) { this.targetRain = v; }

  // 雪：雨と同じ線を短い白い粒にして、ゆっくり風に流す。水しぶきと雨音は出さない
  updateSnow(dt, focus) {
    const level = Math.max(0, Math.min(1, this.def.snow || 0));
    const d = this.rainData, arr = this.rain.geometry.attributes.position.array;
    const count = Math.floor(d.length / 3 * level);
    this.rain.visible = count > 0;
    this.rainNear.visible = this.splashPts.visible = false;
    this.rain.material.color.setHex(0xe4e9ed);
    this.rain.material.opacity = 0.7;
    this.rain.geometry.setDrawRange(0, count * 2);
    for (let i = 0; i < count; i++) {
      const k = i * 3, o = i * 6;
      d[k + 1] -= dt * (1.1 + (i % 7) * 0.12);
      d[k] += dt * (WIND_STATE.dirX * 1.4 + Math.sin(this.time * 0.6 + i) * 0.3);
      d[k + 2] += dt * WIND_STATE.dirZ * 1.4;
      if (d[k + 1] < 0) {
        d[k + 1] += 30;
        d[k] = (Math.random() - 0.5) * 70;
        d[k + 2] = (Math.random() - 0.5) * 70;
      }
      const x = focus.x + d[k], y = focus.y - 6 + d[k + 1], z = focus.z + d[k + 2];
      arr[o] = x; arr[o + 1] = y; arr[o + 2] = z;
      arr[o + 3] = x + 0.025; arr[o + 4] = y + 0.045; arr[o + 5] = z;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  // 雹：白い小さな粒が速く落ち、地面で一、二度跳ねて止まる
  updateHail(dt, focus, r) {
    this.hailT = Math.max(0, (this.hailT || 0) - dt);
    const k = Math.min(1, this.hailT / 3) * Math.min(1, r * 1.4);
    setScene({ hail: k });
    if (!this.hail) {
      if (k <= 0) return;
      const N = 500;
      this.hailD = new Float32Array(N * 4);   // x, y, z, 縦の速さ
      for (let i = 0; i < N; i++) { this.hailD[i * 4] = (Math.random() - 0.5) * 50; this.hailD[i * 4 + 1] = Math.random() * 25; this.hailD[i * 4 + 2] = (Math.random() - 0.5) * 50; this.hailD[i * 4 + 3] = -18; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      this.hail = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe8ecef, size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }));
      this.hail.frustumCulled = false;
      this.scene.add(this.hail);
    }
    this.hail.visible = k > 0.01;
    if (!this.hail.visible) return;
    const d = this.hailD, N = d.length / 4, arr = this.hail.geometry.attributes.position.array, count = Math.floor(N * k);
    for (let i = 0; i < N; i++) {
      if (i >= count) { arr[i * 3 + 1] = -999; continue; }
      const x = focus.x + d[i * 4], z = focus.z + d[i * 4 + 2], gy = this.heightAt(x, z) + 0.03;
      d[i * 4 + 3] = Math.max(-24, d[i * 4 + 3] - dt * 30);
      let y = focus.y - 4 + d[i * 4 + 1] + d[i * 4 + 3] * dt;
      if (y < gy) {
        // 跳ねる。二度目からは弱く、止まったら上へ戻す
        if (d[i * 4 + 3] < -4) { d[i * 4 + 3] = -d[i * 4 + 3] * 0.22; y = gy; }
        else { d[i * 4] = (Math.random() - 0.5) * 50; d[i * 4 + 2] = (Math.random() - 0.5) * 50; d[i * 4 + 3] = -18; y = focus.y + 16 + Math.random() * 8; }
      }
      d[i * 4 + 1] = y - (focus.y - 4);
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    this.hail.geometry.attributes.position.needsUpdate = true;
  }

  // 手前の太い雨粒を一つ、上の方へ置き直す
  respawnNearDrop(i, any) {
    const d = this.nearRain, a = Math.random() * Math.PI * 2, r = 1 + Math.sqrt(Math.random()) * 8;
    d[i * 4] = Math.cos(a) * r; d[i * 4 + 2] = Math.sin(a) * r;
    d[i * 4 + 1] = any ? Math.random() * 9 - 3 : 6 + Math.random() * 3;
    d[i * 4 + 3] = 26 + Math.random() * 8;
  }

  // 手前の太い雨筋を動かす（cam：いまの視点。無ければ描かない）
  updateNearRain(dt, r, wdx, wdz) {
    const M = this.rainNear, cam = this.camRef;
    M.visible = r > 0.15 && !!cam && this.nearRain.length > 0;
    if (!M.visible) return;
    M.material.uniforms.op.value = Math.min(0.22, (r - 0.15) * 0.32);
    const d = this.nearRain, N = d.length / 4, arr = M.geometry.attributes.position.array;
    const count = Math.floor(N * Math.min(1, r * 1.1));
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    const vl = Math.hypot(wdx, 30, wdz), sx = wdx / vl, sy = -30 / vl, sz = wdz / vl;   // 落ちる向き
    M.geometry.setDrawRange(0, count * 6);
    for (let i = 0; i < count; i++) {
      const o = i * 18;
      const sp = d[i * 4 + 3];
      d[i * 4 + 1] -= dt * sp; d[i * 4] += dt * wdx; d[i * 4 + 2] += dt * wdz;
      if (d[i * 4 + 1] < -3.5 || Math.hypot(d[i * 4], d[i * 4 + 2]) > 10) this.respawnNearDrop(i, false);
      const x = cx + d[i * 4], y = cy + d[i * 4 + 1], z = cz + d[i * 4 + 2];
      // 筋の長さは速さに比例（手前ほど長く見える）。幅は視線と落ちる向きの両方に直角
      const len = sp * 0.028, tx = cx - x, ty = cy - y, tz = cz - z;
      let wx = sy * tz - sz * ty, wy = sz * tx - sx * tz, wz = sx * ty - sy * tx;
      const wl = Math.hypot(wx, wy, wz) || 1, w = 0.002;
      wx *= w / wl; wy *= w / wl; wz *= w / wl;
      const hx = x - sx * len, hy = y - sy * len, hz = z - sz * len;   // 尾（上）
      arr[o] = arr[o + 9] = x - wx; arr[o + 1] = arr[o + 10] = y - wy; arr[o + 2] = arr[o + 11] = z - wz;
      arr[o + 3] = x + wx; arr[o + 4] = y + wy; arr[o + 5] = z + wz;
      arr[o + 6] = arr[o + 12] = hx + wx; arr[o + 7] = arr[o + 13] = hy + wy; arr[o + 8] = arr[o + 14] = hz + wz;
      arr[o + 15] = hx - wx; arr[o + 16] = hy - wy; arr[o + 17] = hz - wz;
    }
    M.geometry.attributes.position.needsUpdate = true;
  }
}
