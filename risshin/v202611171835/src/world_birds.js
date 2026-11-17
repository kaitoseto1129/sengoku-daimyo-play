import * as THREE from 'three';
import { S } from './settings.js';
import { WIND } from './world_weather.js';
import { rng } from './world_common.js';


export class WorldBirds {

  // 空の鳥：烏の群れ・高く輪を描く鳶・朝夕に遠くを渡る雁の列（どれも同じ形を大きさと色を変えて一度に描く）
  // 形：くちばしの頭・胴・扇の尾と、二節に折れる翼。羽ばたきは翼の先ほど大きく上下する
  // 烏は羽ばたきと滑空を繰り返し、群れの形は遅れてついて行くので流れて伸び縮みする。ときどき野に降りて歩き、ついばむ
  // （人が近づくと飛び立つ）。world.addCarrion(x, z) で倒れた者の場所を教えると、戦の後にその近くへ降りる
  buildBirds() {
    if (!S.skyBirds) return;
    const V = [];
    const tri = (a, b, c) => V.push(...a, ...b, ...c);
    const head = [0, 0.02, 0.42], neck = [0, 0.03, 0.22], tailL = [-0.16, 0, -0.5], tailR = [0.16, 0, -0.5], rump = [0, 0.02, -0.22];
    for (const sd of [-1, 1]) {
      const inF = [0.07 * sd, 0.02, 0.16], inB = [0.07 * sd, 0.02, -0.12];
      const midF = [0.5 * sd, 0.04, 0.1], midB = [0.45 * sd, 0.03, -0.16];
      const tip = [1.0 * sd, 0.0, -0.14], tip2 = [0.85 * sd, 0.0, -0.24];
      tri(inF, midF, inB); tri(inB, midF, midB);
      tri(midF, tip, midB); tri(midB, tip, tip2);
      // 胴の脇と、胴の下のふくらみ（降りた時に塊に見える）
      tri(head, neck, inF); tri(neck, inB, inF); tri(inB, rump, [0, 0.02, -0.12]);
      tri([0.07 * sd, 0.02, 0.16], [0, -0.1, 0.02], [0.07 * sd, 0.02, -0.12]);
    }
    tri(rump, tailL, tailR);
    tri(head, [0.05, -0.02, 0.2], [-0.05, -0.02, 0.2]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(V, 3));
    g.computeVertexNormals();
    const NC = 20, NK = 2, NG = 11, N = NC + NK + NG;
    const fl = new Float32Array(N * 4);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = WIND;
      // aBird：x 羽ばたきの強さ（0 は滑空）・y 位相・z 翼をたたむ（降りた時 1）・w 羽ばたきの速さ
      sh.vertexShader = 'uniform float uT;\nattribute vec4 aBird;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ax = abs(position.x), fold = aBird.z;
        float fl = sin(uT * aBird.w + aBird.y);
        vec3 fly = transformed;
        fly.y += fl * aBird.x * (ax * 0.55 + max(0.0, ax - 0.45) * 0.5) + (1.0 - aBird.x) * ax * 0.1;
        fly.z -= abs(fl) * aBird.x * ax * 0.08;
        // たたんだ翼：胴に沿わせて後ろへ
        vec3 rest = vec3(sign(position.x) * min(ax, 0.1) + position.x * 0.06, position.y + min(ax, 0.6) * 0.1, position.z - max(0.0, ax - 0.1) * 0.35);
        transformed = mix(fly, rest, fold);`);
    };
    this.birds = new THREE.InstancedMesh(g, mat, N);
    this.birds.geometry.setAttribute('aBird', new THREE.InstancedBufferAttribute(fl, 4));
    this.birdFl = fl;
    const R = rng(8);
    const col = new THREE.Color();
    // 群れの中心はゆっくり流れる
    this.birdFlocks = [0, 1].map(() => ({ cx: (R() - 0.5) * 80, cz: (R() - 0.5) * 80, ph: R() * 6.28, landT: 20 + R() * 30 }));
    this.birdData = [];
    for (let i = 0; i < N; i++) {
      const type = i < NC ? 'crow' : i < NC + NK ? 'kite' : 'goose';
      const b = { type, f: i % 2, r: 16 + R() * 26, a: R() * 6.28, h: 30 + R() * 25, sp: (0.07 + R() * 0.05) * (i % 3 ? 1 : -1) * (i % 2 ? 1 : -1), ph: R() * 6.28,
        ox: (R() - 0.5) * 18, oz: (R() - 0.5) * 18, p: new THREE.Vector3(0, -999, 0), v: new THREE.Vector3(), state: 'air', flap: 1, flapK: 1, flapT: R() * 3, fold: 0, yaw: 0, bank: 0, pitch: 0, sc: 0.8, hop: 0, hopT: 1, peck: 0, fs: 7 + R() * 2 };
      if (type === 'crow') col.setRGB(0.15, 0.145, 0.14);
      else if (type === 'kite') { col.setRGB(0.36, 0.28, 0.2); b.h = 85 + R() * 20; b.r = 40 + R() * 15; b.sp = 0.07 * (i % 2 ? 1 : -1); b.fs = 5; }
      else { col.setRGB(0.42, 0.4, 0.36); b.fs = 6.5 + R() * 0.6; b.k = i - NC - NK; }
      this.birds.setColorAt(i, col);
      this.birdData.push(b);
    }
    this.geese = { t: 20 + R() * 40, on: false, dir: new THREE.Vector2(), o: new THREE.Vector2() };
    this.carrion = [];
    this.birds.frustumCulled = false;
    this.scene.add(this.birds);
    this.birdDummy = new THREE.Object3D();
  }


  // 倒れた者の場所（烏が戦の後に降りてくる）
  addCarrion(x, z) {
    if (!S.skyBirds) return;
    this.carrion.push({ x, z });
    if (this.carrion.length > 40) this.carrion.shift();
  }


  // 烏の降りる場所：倒れた者の近く、なければ人から離れた草の野
  birdSpot(F, focus) {
    if (this.carrion.length && Math.random() < 0.85) {
      const c = this.carrion[Math.floor(Math.random() * this.carrion.length)];
      if (Math.hypot(c.x - focus.x, c.z - focus.z) > 14) return { x: c.x, z: c.z, carrion: true };
    }
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * 6.28, r = 30 + Math.random() * 60;
      const x = focus.x + Math.cos(a) * r, z = focus.z + Math.sin(a) * r;
      if (Math.abs(x) > this.half * 0.9 || Math.abs(z) > this.half * 0.9) continue;
      if (this.grassAt(x, z) < 0.35) continue;
      return { x, z };
    }
    return null;
  }


  updateBirds(dt, focus) {
    if (!S.skyBirds || !this.birds) return;
    const d = this.birdDummy, T = this.time, fl = this.birdFl;
    const dusk = this.timeKey === 'dusk' || (this.mood === 'morning' && T < 240);
    // 雁：朝と夕に、遠くを V の字の列で渡る
    const G = this.geese;
    G.t -= dt;
    if (!G.on && G.t <= 0 && dusk && this.timeKey !== 'storm') {
      const a = Math.random() * 6.28;
      G.on = true; G.s = 0; G.dir.set(Math.cos(a), Math.sin(a));
      const side = 150 + Math.random() * 70;
      G.o.set(focus.x - G.dir.y * side - G.dir.x * 280, focus.z + G.dir.x * side - G.dir.y * 280); G.h = 60 + Math.random() * 25;
    }
    if (G.on) { G.s += dt * 11; if (G.s > 560) { G.on = false; G.t = 70 + Math.random() * 80; } }
    for (let i = 0; i < this.birdData.length; i++) {
      const b = this.birdData[i];
      if (b.type === 'goose') {
        if (!G.on) { d.position.set(0, -999, 0); d.scale.setScalar(0.001); } else {
          const rank = Math.ceil(b.k / 2), sd = b.k % 2 ? 1 : -1;
          const bx = G.o.x + G.dir.x * (G.s - rank * 2.4) + (-G.dir.y) * sd * rank * 2.0, bz = G.o.y + G.dir.y * (G.s - rank * 2.4) + G.dir.x * sd * rank * 2.0;
          d.position.set(bx, G.h + Math.sin(T * 0.7 + b.ph) * 0.4, bz);
          d.rotation.set(0, Math.atan2(G.dir.x, G.dir.y), 0, 'YXZ');
          d.scale.setScalar(0.85);
        }
        fl.set([1, b.ph, 0, b.fs], i * 4);
      } else if (b.type === 'kite') {
        // 鳶：高く大きな輪を、翼を張ったまま描く。ときどき二三度羽ばたく
        const F = this.birdFlocks[b.f];
        b.a += b.sp * dt;
        const cx = F.cx + Math.sin(T * 0.01 + F.ph) * 30, cz = F.cz + Math.cos(T * 0.008 + F.ph) * 30;
        d.position.set(cx + Math.cos(b.a) * b.r, b.h + Math.sin(T * 0.1 + b.ph) * 4, cz + Math.sin(b.a) * b.r);
        const dir = b.sp > 0 ? 1 : -1;
        d.rotation.set(0, Math.atan2(-Math.sin(b.a) * dir, Math.cos(b.a) * dir), -0.3 * dir, 'YXZ');
        d.scale.setScalar(1.05);
        const flap = Math.sin(T * 0.21 + b.ph) > 0.93 ? 1 : 0;
        b.flapK += (flap - b.flapK) * Math.min(1, dt * 4);
        fl.set([b.flapK * 0.8, b.ph, 0, b.fs], i * 4);
      } else this.updateCrow(b, i, dt, focus, d, fl);
      d.updateMatrix();
      this.birds.setMatrixAt(i, d.matrix);
    }
    for (const F of this.birdFlocks) {
      F.landT -= dt;
      if (F.landT > 0) continue;
      F.landT = (this.carrion.length ? 14 : 30) + Math.random() * 30;
      const s = this.birdSpot(F, focus);
      if (!s) continue;
      // 群れの半分ほどが降りる
      for (const b of this.birdData) {
        if (b.type !== 'crow' || b.f !== this.birdFlocks.indexOf(F) || b.state !== 'air' || Math.random() > 0.6) continue;
        const a = Math.random() * 6.28, r = Math.random() * 4 + (s.carrion ? 1.5 : 0);
        b.state = 'down'; b.tx = s.x + Math.cos(a) * r; b.tz = s.z + Math.sin(a) * r; b.stay = (s.carrion ? 25 : 9) + Math.random() * 16;
      }
    }
    this.birds.instanceMatrix.needsUpdate = true;
    this.birds.geometry.attributes.aBird.needsUpdate = true;
  }


  updateCrow(b, i, dt, focus, d, fl) {
    const F = this.birdFlocks[b.f], T = this.time;
    if (b.p.y < -100) {
      // 始め：群れの輪の上に置く
      b.p.set(F.cx + b.ox + Math.cos(b.a) * b.r, b.h, F.cz + b.oz + Math.sin(b.a) * b.r);
    }
    let tx, ty, tz, maxV = 9;
    if (b.state === 'air' || b.state === 'up') {
      b.a += b.sp * dt;
      const fx = F.cx + Math.sin(T * 0.013 + F.ph) * 45, fz = F.cz + Math.cos(T * 0.011 + F.ph * 1.3) * 45;
      tx = fx + b.ox + Math.cos(b.a) * b.r; tz = fz + b.oz + Math.sin(b.a) * b.r;
      ty = b.h + Math.sin(T * 0.3 + b.ph) * 3;
      if (b.state === 'up' && b.p.y - this.heightAt(b.p.x, b.p.z) > 14) b.state = 'air';
    } else if (b.state === 'down') {
      tx = b.tx; tz = b.tz; ty = this.heightAt(tx, tz) + 0.12; maxV = 7;
      const dl = Math.hypot(tx - b.p.x, tz - b.p.z);
      // 降りる時は、遠くでは高さを保ち、近づくほど下りる
      ty = Math.max(ty, ty + Math.min(40, dl * 0.5));
      if (dl < 1.2 && b.p.y - ty < 1.2) { b.state = 'ground'; b.p.set(tx, ty, tz); b.v.set(0, 0, 0); b.t = 0; }
      if (Math.hypot(focus.x - tx, focus.z - tz) < 12) b.state = 'up';
    }
    if (b.state === 'ground') {
      // 地面：跳ねて歩き、ついばむ。人が近づくか、しばらくすると飛び立つ
      b.t += dt; b.hopT -= dt;
      if (b.hopT <= 0) {
        b.hopT = 0.5 + Math.random() * 1.4;
        if (Math.random() < 0.55) { b.yaw += (Math.random() - 0.5) * 2; b.hop = 0.28; }
        else b.peck = 0.6;
      }
      if (b.hop > 0) {
        b.hop -= dt;
        b.p.x += Math.sin(b.yaw) * dt * 1.4; b.p.z += Math.cos(b.yaw) * dt * 1.4;
      }
      b.peck = Math.max(0, b.peck - dt);
      const gy = this.heightAt(b.p.x, b.p.z) + 0.12;
      b.p.y = gy + (b.hop > 0 ? Math.sin((b.hop / 0.28) * Math.PI) * 0.12 : 0);
      b.fold += (1 - b.fold) * Math.min(1, dt * 5);
      b.sc += (0.42 - b.sc) * Math.min(1, dt * 3);
      b.pitch = -0.35 + (b.peck > 0 ? Math.sin((b.peck / 0.6) * Math.PI * 2) * 0.5 + 0.5 : 0);
      if (b.t > b.stay || Math.hypot(focus.x - b.p.x, focus.z - b.p.z) < 11) { b.state = 'up'; b.v.set(Math.sin(b.yaw) * 2, 4, Math.cos(b.yaw) * 2); b.flap = 1; b.flapT = 3; }
      d.position.copy(b.p);
      d.rotation.set(b.pitch, b.yaw, 0, 'YXZ');
      d.scale.setScalar(b.sc);
      fl.set([0, b.ph, b.fold, b.fs], i * 4);
      return;
    }
    // 飛ぶ：目当てへ向かう速さに、遅れて追いつく（群れの形が流れて伸び縮みする）
    const dx = tx - b.p.x, dy = ty - b.p.y, dz = tz - b.p.z;
    const dl = Math.hypot(dx, dy, dz) || 1, want = Math.min(maxV, dl * 0.7);
    const k = Math.min(1, dt * (b.state === 'up' ? 2.2 : 1.1));
    const ovx = b.v.x, ovz = b.v.z;
    b.v.x += (dx / dl * want - b.v.x) * k; b.v.y += (dy / dl * want - b.v.y) * k; b.v.z += (dz / dl * want - b.v.z) * k;
    if (b.state === 'up') b.v.y = Math.max(b.v.y, 3);
    b.p.addScaledVector(b.v, dt);
    const hs = Math.hypot(b.v.x, b.v.z);
    if (hs > 0.3) {
      const ny = Math.atan2(b.v.x, b.v.z);
      // 曲がる側へ傾く
      const turn = (ovx * b.v.z - ovz * b.v.x) / Math.max(1, hs * hs) / Math.max(dt, 1e-3);
      b.bank += (Math.max(-0.7, Math.min(0.7, -turn * 0.6)) - b.bank) * Math.min(1, dt * 3);
      b.yaw = ny;
    }
    // 羽ばたきと滑空の繰り返し（昇る時と飛び立つ時は羽ばたく）
    b.flapT -= dt;
    if (b.flapT <= 0) { b.flap = b.flap ? 0 : 1; b.flapT = b.flap ? 1.2 + Math.random() * 2.5 : 1 + Math.random() * 2.5; }
    const flap = b.state === 'up' || b.v.y > 0.8 ? 1 : b.flap;
    b.flapK += (flap - b.flapK) * Math.min(1, dt * 4);
    b.fold += (0 - b.fold) * Math.min(1, dt * 6);
    b.sc += (0.8 - b.sc) * Math.min(1, dt * 1.5);
    d.position.copy(b.p);
    d.rotation.set(-Math.max(-0.5, Math.min(0.5, b.v.y / 9)) * 0.6, b.yaw, b.bank, 'YXZ');
    d.scale.setScalar(b.sc);
    fl.set([b.flapK, b.ph, b.fold, b.state === 'up' ? 13 : b.fs], i * 4);
  }
}
