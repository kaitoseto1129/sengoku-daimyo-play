// Army の手法：血の染み・柵や塀の傷みと倒れ・火・火花と土ぼこり・倒れた馬と放れ馬
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { bloodLv, STAIN_PLANE, STAIN_TEX, angleDiff, roundDot, PCOL } from './units.js';
import * as THREE from 'three';
import { horseExhausted, horseLooseMove, horseLooseDanger } from './horse_reality.js';
import { animateHorse } from './units_model.js';
import { S } from './settings.js';

// 指定のない戦は従来の地面。峠の破片と染みだけ描く土の面を読む。
function detailGround(W, x, z) {
  return W.def.groundDetailAt ? W.def.groundDetailAt(W, x, z) : W.heightAt(x, z);
}

// Army の手法（units.js の class Army に足す）
export const ArmyFx = {

  // 跡の上限ぶんを開戦前に用意する。乱戦の一撃ごとに材質を作り捨てない。
  prepareStains() {
    if (!S.groundMarks || this.stainPool) return;
    this.stains = [];
    this.stainPool = [];
    this.stainSlots = [];
    for (let i = 0; i < 32; i++) {
      // 急な山道を指定した戦だけ細かい面を持ち、染みを置く時に足場へ沿わせる。
      const ground = !!this.world.def.groundStains;
      const geo = ground ? new THREE.PlaneGeometry(2.4, 2.4, 8, 8).rotateX(-Math.PI / 2) : STAIN_PLANE;
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x40140e, map: STAIN_TEX[i % STAIN_TEX.length], transparent: true, opacity: 0.5, alphaTest: ground ? 0.01 : 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.visible = false;
      this.scene.add(m);
      const o = { m, t: 0, life: 0, sx: 0, sz: 0, grow: 0, op: 0 };
      this.stainSlots.push(o);
      this.stainPool.push(o);
    }
  },
  disposeStains() {
    if (!this.stainSlots) return;
    // 専用の形は戦の資源回収が場面から拾う。ここで二度返さない。
    for (const o of this.stainSlots) { this.scene.remove(o.m); o.m.material.dispose(); }
    this.stains.length = this.stainPool.length = this.stainSlots.length = 0;
  },

  // 地面の染み：新しいうちは暗い赤、乾くと茶に褪せ、やがて消える
  stain(x, z, r, life = 80, grow = 0) {
    return null;   // 10/24：倒れた所の血だまりは作らない（全戦）
    if (!S.groundMarks || this.hideBlood) return null;
    const lv = bloodLv();
    if (lv === 0) return null;
    const limit = 32;
    while (this.stains.length >= limit) {
      const old = this.stains.shift();
      old.m.visible = false;
      this.stainPool.push(old);
    }
    const o = this.stainPool.pop(), m = o.m;
    // 縁の三通り・色・薄れ方・残す数は同じ。前の跡の色と薄さを戻す。
    m.material.map = STAIN_TEX[Math.floor(Math.random() * STAIN_TEX.length)];
    m.material.color.set(0x40140e);
    m.material.opacity = lv === 2 ? 0.5 : 0.35;
    const s = lv === 2 ? 0.65 : 0.5;
    m.position.set(x, detailGround(this.world, x, z) + 0.03, z);
    m.rotation.y = Math.random() * 6.28;
    const sx = r * s * (0.8 + Math.random() * 0.4), sz = r * s * (0.8 + Math.random() * 0.4);
    m.scale.set(grow ? sx * 0.25 : sx, 1, grow ? sz * 0.25 : sz);
    if (this.world.def.groundStains) {
      // 広がりを含む最終の幅で一度だけ整える。伸ばす途中で地面を突き抜けない。
      m.scale.set(sx, 1, sz);
      const p = m.geometry.attributes.position, c = Math.cos(m.rotation.y), s = Math.sin(m.rotation.y);
      for (let i = 0; i < p.count; i++) {
        const px = p.getX(i) * sx, pz = p.getZ(i) * sz;
        p.setY(i, detailGround(this.world, x + px * c + pz * s, z - px * s + pz * c) - m.position.y + 0.03);
      }
      p.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere();
    }
    m.visible = true;
    o.t = 0; o.life = Math.min(life, 120); o.sx = sx; o.sz = sz; o.grow = grow; o.op = m.material.opacity;
    this.stains.push(o);
    return o;
  },
  // 柵・塀の区画の傾き（形は世界の座標で作ってあるので、区画の根元の線を軸に回す）
  //   体力が六割を切ると少し、三割を切るともう少し、打たれた側へ傾く。壊れると 0.8 秒かけて倒れ、倒れたまま残る
  structTilt(s, a) {
    const m = s.mesh;
    if (!m || !s.seg || !Number.isFinite(a) || m.position.lengthSq() > 1e-6 || m.rotation.x || m.rotation.y || m.rotation.z) return false;
    const [ax, az, bx, bz] = s.seg, L = Math.hypot(bx - ax, bz - az);
    // 長さのない柵や高さの欠けた場所から、不正な変形行列を作らない。
    if (!Number.isFinite(L) || L < 1e-6) return false;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = this.world.heightAt(mx, mz);
    if (!Number.isFinite(mx) || !Number.isFinite(mz) || !Number.isFinite(my)) return false;
    // 倒れる向き：打った者のいる側へ（引き倒す）
    const nx = -(bz - az) / L, nz = (bx - ax) / L;
    const f = s.hitFrom ? Math.sign((s.hitFrom.x - mx) * nx + (s.hitFrom.z - mz) * nz) || 1 : 1;
    const T = this._tiltMath || (this._tiltMath = { q: new THREE.Quaternion(), axis: new THREE.Vector3(), a: new THREE.Matrix4(), b: new THREE.Matrix4(), r: new THREE.Matrix4() });
    T.q.setFromAxisAngle(T.axis.set((bx - ax) / L, 0, (bz - az) / L), -a * f);
    T.a.makeTranslation(mx, my, mz); T.b.makeTranslation(-mx, -my, -mz); T.r.makeRotationFromQuaternion(T.q);
    m.matrixAutoUpdate = false;
    m.matrix.copy(T.a).multiply(T.r).multiply(T.b);
    m.matrixWorldNeedsUpdate = true;
    return true;
  },
  structWear(s) {
    if (!s.seg || !s.mesh || !s.maxHp || s.maxHp > 1e8) return;
    // 門の扉（userData.leaves）：打たれるたびに扉が震え、傷むほど内へたわみ、閂が曲がり、板が割れて木屑が飛ぶ
    const lvs = s.mesh.userData && s.mesh.userData.leaves;
    if (lvs && s.hp > 0) {
      const k = s.hp / s.maxHp, lv = k < 0.25 ? 3 : k < 0.5 ? 2 : k < 0.75 ? 1 : 0;
      const c = { x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 };
      if (lv > (s.wearLv || 0)) {
        s.wearLv = lv;
        this.burst(c.x, this.world.heightAt(c.x, c.z) + 1.4, c.z, 6 + lv * 4, 'wood', s.nx || 0, s.nz || 0);
        this.play('crack', c, 0.9 + lv * 0.15);
        // 閂（tobira の三つ目の子）は段ごとに曲がって下がる。三段目で外れかける
        const b = s.mesh.children[2];
        if (b && b.isMesh) { b.rotation.z = [0, 0.06, 0.16, 0.34][lv]; b.position.y -= 0.05; }
      }
      // 震え：段の分だけ内へたわみ、打たれるたびに少しずつ違う向きに揺れる（次に打たれるまでその形）
      lvs.forEach((pv, i) => {
        const sd = i ? -1 : 1;
        pv.rotation.y = sd * (0.03 * (s.wearLv || 0) + (Math.random() - 0.3) * 0.02);
        pv.rotation.x = -0.012 * (s.wearLv || 0);
      });
      return;
    }
    const k = s.hp / s.maxHp, lv = k < 0.3 ? 2 : k < 0.6 ? 1 : 0;
    if (lv > (s.wearLv || 0)) { s.wearLv = lv; this.structTilt(s, lv === 2 ? 0.16 : 0.07); s.tiltA = lv === 2 ? 0.16 : 0.07; }
    // 騎馬に何度も当てられた柵は、体力が残っていても当たるたびに少しずつ傾く（一騎で 1°、最大 9°）
    if (s.knock && /柵/.test(s.name || '')) {
      const a = Math.max(s.tiltA || 0, Math.min(0.16, s.knock * 0.018));
      if (a > (s.tiltA || 0) + 0.005) { s.tiltA = a; this.structTilt(s, a); }
    }
  },
  structFall(s) {
    if (!s.mesh) return;
    // 閂を外して開けた門（siege_gate 相当：壊れたのではない）は、倒れずにただ開いて消える
    if (s.openGentle) { s.mesh.visible = false; this.play('wood', s.seg ? { x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 } : { x: s.x, z: s.z }, 0.9); return; }
    // 割れる演出（一度だけ）：木の破片が飛び散り、土埃が立ち、重い音
    const c = s.seg ? { x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 } : { x: s.x, z: s.z };
    const gate = /門|木戸/.test(s.name || '') || !!(s.mesh.userData && s.mesh.userData.leaves);
    this.shatter(s, c, gate);
    // 形を傾けられない物（置き場を持つ形）：扉なら次のコマで倒れる途中から見せ（breakDoor）、そうでなければ消す
    if (!s.seg || !this.structTilt(s, 0.16)) {
      if (s.fireF && !gate) {
        (this.falling || (this.falling = [])).push({ s, t: 0, burnt: true, sy: s.mesh.scale.y });
        return;
      }
      s.mesh.visible = false;
      if (gate) (this.falling || (this.falling = [])).push({ s, t: 0, door: true, c });
      return;
    }
    (this.falling || (this.falling = [])).push({ s, t: 0 });
  },
  // 壊れた時の破片・土埃・音（構造物ごとに一度だけ。破片は使い回しの入れ物から出し、毎コマ new しない）
  shatter(s, c, gate) {
    if (s._shattered) return;
    s._shattered = true;
    const W = this.world, gy = detailGround(W, c.x, c.z);
    // 打った者の向きから飛ぶ（無ければ散らばる）
    let nx = 0, nz = 0;
    if (s.hitFrom) { const L = Math.hypot(c.x - s.hitFrom.x, c.z - s.hitFrom.z) || 1; nx = (c.x - s.hitFrom.x) / L; nz = (c.z - s.hitFrom.z) / L; }
    const len = s.seg ? Math.hypot(s.seg[2] - s.seg[0], s.seg[3] - s.seg[1]) : (s.w || 3);
    const D = this.debris;
    const visible = this.fxVisible(c.x, gy + 1, c.z);
    const count = gate ? 18 : Math.min(12, 4 + Math.round(len * 1.2));
    const n = visible ? (S.reduceMotion ? Math.ceil(count / 2) : count) : 0;
    for (let k = 0; k < n; k++) {
      const i = D.i = (D.i + 1) % D.N, o = i * 3;
      const t = (Math.random() - 0.5) * (s.seg ? 1 : 0.8);
      const px = s.seg ? c.x + (s.seg[2] - s.seg[0]) * t : c.x + (Math.random() - 0.5) * len * 0.8;
      const pz = s.seg ? c.z + (s.seg[3] - s.seg[1]) * t : c.z + (Math.random() - 0.5) * 0.6;
      D.pos[o] = px; D.pos[o + 1] = gy + 0.4 + Math.random() * (gate ? 2.6 : 1.4); D.pos[o + 2] = pz;
      const sp = 1 + Math.random() * (gate ? 3.5 : 2.5);
      D.vel[o] = nx * sp + (Math.random() - 0.5) * 3; D.vel[o + 1] = 1.5 + Math.random() * (gate ? 4.5 : 3); D.vel[o + 2] = nz * sp + (Math.random() - 0.5) * 3;
      D.rot[o] = Math.random() * 6.3; D.rot[o + 1] = Math.random() * 6.3; D.rot[o + 2] = Math.random() * 6.3;
      D.spin[o] = (Math.random() - 0.5) * 14; D.spin[o + 1] = (Math.random() - 0.5) * 10; D.spin[o + 2] = (Math.random() - 0.5) * 14;
      const big = Math.random();
      D.size[o] = 0.4 + big * (gate ? 1.1 : 0.6); D.size[o + 1] = 0.6 + Math.random() * 0.6; D.size[o + 2] = 0.6 + Math.random() * 0.8;
      D.life[i] = 14 + Math.random() * 6; D.gy[i] = -999;
    }
    if (n) D.live = true;
    // 土埃：低く広がる煙と、細かい土の粒
    if (visible && W.dustCloud) { W.dustCloud(c.x, c.z, true); W.dustCloud(c.x + nx * 1.5, c.z + nz * 1.5, gate); if (gate) W.dustCloud(c.x - nx, c.z - nz, true); }
    this.burst(c.x, gy + 1, c.z, gate ? 22 : 12, 'dust', nx, nz);
    // 重い音：木の裂ける音と、倒れて地を打つ低い響き（扉は少し遅れて地に落ちる）
    this.play('crash', c, gate ? 1.3 : 0.9);
    this.play(gate ? 'gateBash' : 'wood', c, 1);
  },
  buildDebris() {
    if (this.debris) return this.debris;
    const N = 64;
    const geo = new THREE.BoxGeometry(0.12, 0.06, 0.9);
    // 木の色は下の一片ごとの色にある。指定した戦では茶を二重に掛けず、黒く潰さない。
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({
      color: this.world.def.naturalWoodDebris ? 0xffffff : 0x6a5038,
    }), N);
    mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // 割れた木口は明るく、古い面は暗く（一枚ずつ色を変える）
    const col = new THREE.Color();
    const z0 = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < N; i++) { mesh.setColorAt(i, col.setHex(0x6a5038).multiplyScalar(0.7 + ((i * 37) % 11) / 11 * 0.6)); mesh.setMatrixAt(i, z0); }
    this.scene.add(mesh);
    this.debris = { mesh, N, i: 0, pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), rot: new Float32Array(N * 3), spin: new Float32Array(N * 3), size: new Float32Array(N * 3), life: new Float32Array(N), gy: new Float32Array(N), live: false,
      m4: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), sc: new THREE.Vector3() };
    return this.debris;
  },
  updateDebris(dt) {
    const D = this.debris;
    if (!D || !D.live) return;
    let any = false;
    for (let i = 0; i < D.N; i++) {
      if (D.life[i] <= 0) { if (D.size[i * 3]) { D.size[i * 3] = 0; D.mesh.setMatrixAt(i, D.m4.makeScale(0, 0, 0)); } continue; }
      any = true;
      const o = i * 3;
      D.life[i] -= dt;
      if (D.gy[i] === -999 || D.pos[o + 1] > D.gy[i] + 0.04) {
        D.vel[o + 1] -= 9.8 * dt;
        for (let a = 0; a < 3; a++) { D.pos[o + a] += D.vel[o + a] * dt; D.rot[o + a] += D.spin[o + a] * dt; }
        const g = detailGround(this.world, D.pos[o], D.pos[o + 2]) + 0.03;
        if (D.pos[o + 1] <= g) {
          // 地に当たって少し跳ね、やがて寝る
          D.pos[o + 1] = g;
          if (D.vel[o + 1] < -2.5) { D.vel[o + 1] *= -0.3; D.vel[o] *= 0.5; D.vel[o + 2] *= 0.5; for (let a = 0; a < 3; a++) D.spin[o + a] *= 0.4; }
          else {
            D.gy[i] = g;
            if (this.world.def.groundedWoodDebris) {
              // 越前の坂だけ。停止時に一度読み、止まった破片で高さを調べ続けない。
              const x = D.pos[o], z = D.pos[o + 2], yaw = D.rot[o + 1];
              const sn = Math.sin(yaw), cs = Math.cos(yaw);
              const gx = detailGround(this.world, x + .3, z) - detailGround(this.world, x - .3, z);
              const gz = detailGround(this.world, x, z + .3) - detailGround(this.world, x, z - .3);
              const pitch = -Math.atan((gx * sn + gz * cs) / .6);
              D.rot[o] = pitch;
              D.rot[o + 2] = Math.atan((gx * cs - gz * sn) / .6 * Math.cos(pitch));
              // 厚みの半分を法線方向へ残し、上り側の木口を土へ埋めない。
              D.pos[o + 1] = D.gy[i] = g - .03 + .03 * D.size[o + 1] * Math.hypot(1, gx / .6, gz / .6);
            } else {
              D.rot[o] = Math.round(D.rot[o] / Math.PI) * Math.PI;
              D.rot[o + 2] = Math.round(D.rot[o + 2] / Math.PI) * Math.PI;
            }
          }
        }
      }
      // 終わりの 2 秒で地に沈む
      const k = Math.min(1, D.life[i] / 2);
      D.p.set(D.pos[o], D.pos[o + 1] - (1 - k) * 0.12, D.pos[o + 2]);
      D.q.setFromEuler(D.e.set(D.rot[o], D.rot[o + 1], D.rot[o + 2], this.world.def.groundedWoodDebris ? 'YXZ' : 'XYZ'));
      D.sc.set(D.size[o], D.size[o + 1], D.size[o + 2]);
      D.mesh.setMatrixAt(i, D.m4.compose(D.p, D.q, D.sc));
    }
    D.mesh.count = any ? D.N : 0;
    D.mesh.instanceMatrix.needsUpdate = true;
    D.live = any;
  },
  // 火矢が刺さった：三本目で火がつき、柵・門・小屋は一分ほどかけて燃えて倒れる（戦の定義の onStructHit／onStructDestroyed も呼ぶ）
  igniteStruct(s, p) {
    if (!s.alive || s.maxHp > 1e8 || s.fireProof) return;
    s.burn = (s.burn || 0) + 1;
    if (s.burn < 3 || s.fireF) return;
    const q = s.seg ? { x: p.x, z: p.z } : { x: s.x, z: s.z };
    s.fireF = this.world.addFire(q.x, q.z, { size: s.seg ? 1 : Math.min(3.6, 1.6 + (s.r || 1) * 0.25) });
    const width = s.seg ? Math.hypot(s.seg[2] - s.seg[0], s.seg[3] - s.seg[1]) : s.w || (s.r || 2) * 2;
    this.world.addScorch(q.x, q.z, width, s.seg ? 2 : s.d || width, s.seg ? -Math.atan2(s.seg[3] - s.seg[1], s.seg[2] - s.seg[0]) : 0);
    // 着火時に大きな建物を一括走査しない。材質の複製は次の更新から少しずつ進める。
    s.burnMats = [];
    s.charWork = s.mesh ? { nodes: [s.mesh], indices: [-1], copies: new Map() } : null;
    s.charK = 1;
    s.charT = 0;
    s.burnT = 0;
    (this.burning || (this.burning = [])).push(s);
    this.play('knock', q, 0.4);
  },
  charMaterial(s, mat) {
    if (!mat || !mat.color) return mat;
    const copies = s.charWork.copies;
    if (copies.has(mat)) return copies.get(mat);
    const m = mat.clone(), color = mat.color.clone();
    copies.set(mat, m);
    s.burnMats.push({ m, color });
    m.color.copy(color).multiplyScalar(s.charK);
    return m;
  },
  prepareBurningMaterials() {
    // 同時に何棟燃えても、全棟合わせて一コマ六十四手・約半ミリ秒まで。
    // 深さ分の入れ物を使い、子の一覧や走査用の関数を毎コマ作らない。
    const start = performance.now();
    let steps = 0;
    for (const s of this.burning) {
      const work = s.charWork;
      if (!work) continue;
      const nodes = work.nodes, indices = work.indices;
      while (nodes.length) {
        const top = nodes.length - 1, o = nodes[top];
        if (indices[top] === -1) {
          if (o.isMesh) {
            if (Array.isArray(o.material)) {
              const mats = o.material.slice();
              for (let i = 0; i < mats.length; i++) mats[i] = this.charMaterial(s, mats[i]);
              o.material = mats;
            } else o.material = this.charMaterial(s, o.material);
          }
          indices[top] = 0;
        }
        // 一括描画の柵の実体には子がない。共有の材質は替えず、走査を終える。
        if (indices[top] < (o.children?.length || 0)) {
          nodes.push(o.children[indices[top]++]); indices.push(-1);
        } else { nodes.pop(); indices.pop(); }
        if (!nodes.length) s.charWork = null;
        if (++steps >= 64 || (steps % 8 === 0 && performance.now() - start >= 0.5)) return;
      }
    }
  },
  updateBurning(dt) {
    const B = this.burning;
    if (!B || !B.length) return;
    this.prepareBurningMaterials();
    for (let i = B.length - 1; i >= 0; i--) {
      const s = B[i];
      s.burnT += dt;
      s.charT += dt;
      if (s.charT >= 0.5) {
        s.charT = 0;
        const k = s.alive ? Math.max(0.12, s.hp / (s.maxHp || 100)) : 0.12;
        s.charK = k;
        for (const c of s.burnMats) c.m.color.copy(c.color).multiplyScalar(k);
      }
      if (s.alive) {
        // 雨の中では燃え方が弱い。門の fireResistance（束29）があれば、さらに損を抑える
        s.hp -= dt * (s.maxHp || 100) / 60 * (1 - 0.7 * Math.min(1, this.rain || 0)) * (1 - (s.fireResistance || 0));
        s.hitT = this.time;
        if (s.hp <= 0) { s.alive = false; s.hp = 0; this.structFall(s); if (this.hooks.onStructDestroyed) this.hooks.onStructDestroyed(s); s.burnT = 0; }
        else this.structWear(s);
      } else if (s.burnT > 25) {
        // 倒れてから 25 秒で火は消える
        if (s.fireF && this.world.removeFire) this.world.removeFire(s.fireF);
        s.fireF = null; s.charWork = null; B.splice(i, 1);
      }
    }
  },
  updateFalling(dt) {
    this.updateBurning(dt);
    this.updateDebris(dt);
    if (!this.falling || !this.falling.length) return;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const F = this.falling[i];
      F.t += dt;
      if (F.door) { this.breakDoor(F, i); continue; }
      if (F.burnt) {
        const k = Math.min(1, F.t / 2.4);
        F.s.mesh.scale.y = F.sy * (1 - 0.82 * k * k);
        if (k >= 1) this.falling.splice(i, 1);
        continue;
      }
      const k = Math.min(1, F.t / 0.8);
      this.structTilt(F.s, 0.16 + (1.35 - 0.16) * k * k);
      if (k >= 1) {
        this.falling.splice(i, 1);
        const [ax, az, bx, bz] = F.s.seg;
        this.burst((ax + bx) / 2, this.world.heightAt((ax + bx) / 2, (az + bz) / 2) + 0.2, (az + bz) / 2, 10, 'dust');
      }
    }
  },
  // 破られた扉：戦の定義が fall() で倒れた形にした後、閉じた形から 0.75 秒かけて倒れ込ませる（重いので初めはゆっくり、最後に地を打つ）
  breakDoor(F, i) {
    const m = F.s.mesh, L = m && m.userData && m.userData.leaves;
    if (!F.to) {
      // 倒れた形にするのは戦の側（siege_gate の updateGates など）で、一二コマ遅れることがある。0.4 秒待って来なければ破片と土埃だけ
      if (!L || !m.visible) { if (!L || F.t > 0.4) this.falling.splice(i, 1); return; }
      F.to = L.map((pv) => ({ r: pv.rotation.clone(), y: pv.position.y, z: pv.position.z, y0: 0, z0: 0 }));
      F.t = 0;
    }
    const k = Math.min(1, F.t / 0.75), e = k * k * k;
    L.forEach((pv, j) => { const T = F.to[j]; pv.rotation.set(T.r.x * e, T.r.y * e, T.r.z * e); pv.position.y = T.y * e; pv.position.z = T.z * e; });
    if (k >= 1) {
      this.falling.splice(i, 1);
      const gy = this.world.heightAt(F.c.x, F.c.z);
      this.burst(F.c.x, gy + 0.2, F.c.z, 16, 'dust');
      if (this.world.dustCloud) this.world.dustCloud(F.c.x, F.c.z, true);
      this.play('doorSlam', F.c, 1.2);
    }
  },
  updateStains(dt) {
    if (!S.groundMarks || !this.stains) return;
    this.stainT = (this.stainT || 0) + dt;
    if (this.stainT < 0.2) return;
    const st = this.stainT; this.stainT = 0;
    for (let i = this.stains.length - 1; i >= 0; i--) {
      const o = this.stains[i];
      o.t += st;
      const k = o.t / o.life;
      if (k >= 1) { o.m.visible = false; this.stainPool.push(o); this.stains.splice(i, 1); continue; }
      // 倒れた者の下の血だまりは、しばらくかけて広がる
      if (o.grow && !this.world.def.groundStains) { const g = Math.min(1, 0.25 + o.t / 12); o.m.scale.set(o.sx * g, 1, o.sz * g); }
      // 乾く：暗い赤 → 土の茶。終わりの三割で薄れて消える
      const dry = Math.min(1, k * 2.5);
      // 乾く：暗い赤茶 → 黒ずんだ茶
      o.m.material.color.setRGB(0.25 - 0.14 * dry, 0.078 - 0.01 * dry, 0.055 - 0.005 * dry);
      o.m.material.opacity = o.op * (1 - 0.35 * dry) * Math.min(1, (1 - k) / 0.3);
    }
  },
  updateFallenHorses(dt) {
    const F = this.fallenHorses;
    if (!F) return;
    let excess = F.length - 16; for (const o of F) if (o.fadeAt != null) excess--;
    const view = this._groundView || this.playerUnit?.pos;
    while (excess > 0) {
      let retire = null, far = 45;
      for (const o of F) {
        if (o.fadeAt != null || o.t < 4) continue;
        const d = view ? Math.hypot(o.h.position.x - view.x, o.h.position.z - view.z) : 100;
        if (this._viewFrustum) { this.tmpSphere.center.copy(o.h.position); if (this._viewFrustum.intersectsSphere(this.tmpSphere)) continue; }
        if (d > far) { far = d; retire = o; }
      }
      if (!retire) break; retire.fadeAt = this.time; excess--;
    }
    for (let i = F.length - 1; i >= 0; i--) {
      const o = F[i];
      o.t += dt;
      if (o.t < 4) animateHorse(o.h, dt, 0);
      // 倒れた馬は戦の跡として残し、見えない遠い馬から薄れさせる
      if (o.fadeAt != null) {
        const elapsed = this.time - o.fadeAt; this.fadeGround(o.h, Math.min(4, Math.max(1, Math.ceil(elapsed * 2))));
        if (elapsed >= 2) { this.scene.remove(o.h); F.splice(i, 1); }
      }
    }
  },
  updateLooseHorses(dt) {
    this.updateFallenHorses(dt);
    const L = this.looseHorses;
    if (!L) return;
    const P = this.playerUnit;
    for (let i = L.length - 1; i >= 0; i--) {
      const o = L[i];
      o.t += dt;
      const p = o.h.position, H = o.h.userData.horse;
      let want;
      o.shyT = (o.shyT || 0) - dt; o.neighT = (o.neighT || 0) - dt;
      if (horseLooseDanger(this, o.h, this.time) && !(o.held > 0)) {
        o.kept = false; o.calm = false; o.shyT = Math.max(o.shyT, 3);
        o.shyDir = o.heading + 0.5;
      }
      if (o.held > 0) {
        // 手綱を取られている間：人の方へ向き直り、首を振って足踏みし、だんだん落ち着く
        o.held -= dt;
        if (P) o.heading += angleDiff(o.heading, Math.atan2(P.pos.x - p.x, P.pos.z - p.z)) * Math.min(1, dt * 2.2);
        want = 0;
        if (H && (H.snortT || 0) > 0.6) H.snortT = 0;
      } else if (o.kept) {
        // プレイヤーが降りて置いた馬：その場で待つ
        want = 0;
      } else {
        // 近づく人に驚いて少し逃げ、嘶く。止まって落ち着いた馬や、後ろから静かに寄れば逃げない
        if (o.tame && o.t > 1.5 && o.shyT <= 0) o.calm = true;
        if (P && P.alive && !P.mounted && o.shyT <= -1.5 && !o.tame) {
          const dx = P.pos.x - p.x, dz = P.pos.z - p.z, d = Math.hypot(dx, dz);
          if (d < 6.5 && d > 0.1) {
            const behind = (Math.sin(o.heading) * dx + Math.cos(o.heading) * dz) / d < -0.45;
            const quiet = Math.hypot(P.vel.x, P.vel.z) < 4.2;
            if (!(quiet && (o.calm || behind))) {
              o.calm = false;
              o.shyT = 1.1 + Math.random() * 0.6;
              o.shyDir = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.8;
              o.t = Math.min(o.t, 12);
              if (H) H.spook = 1;
              if (o.neighT <= 0) { this.play('neigh', p, 0.6); o.neighT = 3; }
            }
          }
        }
        // 主を失った馬は戦場で草を食まず逃げ続ける。疲れたら歩いて離れる。
        want = o.shyT > 0 ? 6 : o.calm ? 0 : 7.5;
      }
      const stats = o.stats || o.from;
      if (stats) {
        stats.hfat = Math.max(0, Math.min(1, (stats.hfat || 0) + dt * (o.spd > 6 ? 1 / 360 : o.spd > 2.5 ? -1 / 300 : o.spd > 0.5 ? -1 / 150 : -1 / 90)));
        if (horseExhausted(H, stats.hfat)) want = Math.min(want, 2.2);
        const health = (stats.hp ?? 100) / (stats.maxHp || stats.max || 100);
        want *= Math.max(0.3, Math.min(1, health / 0.6));
      }
      o.spd += (want - o.spd) * Math.min(1, dt * (o.held > 0 || o.shyT > 0 ? 3 : 1.2));
      o.calm = !!o.kept || (o.calm && o.shyT <= 0);
      if (o.shyT > 0 && !(o.held > 0)) o.heading += angleDiff(o.heading, o.shyDir) * Math.min(1, dt * 4);
      else if (!o.kept && !(o.held > 0)) o.heading += Math.sin(o.t * 0.4 + i) * 0.15 * dt;
      horseLooseMove(this, o, dt);
      o.h.rotation.y = o.heading;
      // 遠い（70m より先）空馬は三コマに一度だけ動かす（数を増やしても重くしない）
      const far = P && Math.abs(P.pos.x - p.x) + Math.abs(P.pos.z - p.z) > 90;
      o.acc = (o.acc || 0) + dt;
      if (!far || (o.sk = ((o.sk || 0) + 1) % 3) === 0) { animateHorse(o.h, o.acc, o.spd); o.acc = 0; }
      // 長く放っておいた空馬は消す（置いた馬と、プレイヤーの近くの馬は残す）
      if (!o.kept && !(o.held > 0) && (Math.abs(p.x) > (this.world.def.moveLim || 176) + 8 || Math.abs(p.z) > (this.world.def.moveLim || 176) + 8 || o.t > 120) && !(P && Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < 40)) { this.scene.remove(o.h); L.splice(i, 1); }
    }
  },

  // ---------------- 粒子（血しぶき・土・布の埃）と火花 ----------------
  buildParticles() {
    if (this.points) return;
    this.prepareStains();
    this.buildDebris();
    this.fxStats = { burstCalls: 0, burstEmitted: 0, burstParticles: 0, sparkCalls: 0, sparkEmitted: 0 };
    this.fxSphere = new THREE.Sphere(new THREE.Vector3(), 0);
    // 血・土四百枠と火花百二十枠を一つの形・材質で描く。互いの枠を奪わない。
    const N = 400, sparks = 120, total = N + sparks;
    this.pN = N; this.sN = sparks;
    this.pPos = new Float32Array(total * 3);
    this.pVel = new Float32Array(total * 3);
    this.pCol = new Float32Array(total * 3);
    this.pLife = new Float32Array(total);
    this.pGround = new Float32Array(N);
    this.sPos = this.pPos.subarray(N * 3);
    this.sVel = this.pVel.subarray(N * 3);
    this.sLife = this.pLife.subarray(N);
    this.pIdx = this.sIdx = 0;
    const kind = new Float32Array(total), col = new THREE.Color(0xffd98a);
    for (let i = 0; i < total; i++) {
      this.pPos[i * 3 + 1] = -999;
      if (i >= N) {
        kind[i] = 1;
        this.pCol[i * 3] = col.r; this.pCol[i * 3 + 1] = col.g; this.pCol[i * 3 + 2] = col.b;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('fxSpark', new THREE.BufferAttribute(kind, 1));
    const mat = new THREE.PointsMaterial({ vertexColors: true, size: 0.06, transparent: true, opacity: 0.9, depthWrite: false, map: roundDot(), alphaTest: 0.02,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    // 通常の粒は透過、火花は加算のまま、一回で描く。大きさと明るさも従来どおり。
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute float fxSpark; varying float vFxSpark;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('gl_PointSize = size;', 'vFxSpark = fxSpark; gl_PointSize = size * mix(1.0, 0.8333333, fxSpark);');
      shader.fragmentShader = 'varying float vFxSpark;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <premultiplied_alpha_fragment>',
        '#include <premultiplied_alpha_fragment>\ngl_FragColor.rgb *= gl_FragColor.a * mix(1.0, 0.95 / 0.9, vFxSpark); gl_FragColor.a *= 1.0 - vFxSpark;');
    };
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  },

  // 斬り合いは続け、視野外・八十メートルより先の粒だけを省く。跡には使わない。
  fxVisible(x, y, z) {
    const view = this._groundView, frustum = this._viewFrustum;
    if (!view || !frustum) return false;
    const dx = x - view.x, dy = y - (view.y || 0), dz = z - view.z;
    if (dx * dx + dy * dy + dz * dz > 80 * 80) return false;
    this.fxSphere.center.set(x, y, z);
    return frustum.intersectsSphere(this.fxSphere);
  },

  // 火花：fx, fz を渡すとその向きへ飛ぶ（筒先の燃えかす）
  spark(x, y, z, n, fx = 0, fz = 0) {
    this.fxStats.sparkCalls++;
    if (!this.fxVisible(x, y, z)) return;
    n = Math.min(this.sN, S.reduceMotion ? Math.ceil(n / 2) : Math.ceil(n));
    if (n > 0) this.fxStats.sparkEmitted++;
    for (let k = 0; k < n; k++) {
      const i = this.sIdx = (this.sIdx + 1) % this.sN;
      this.sPos[i * 3] = x; this.sPos[i * 3 + 1] = y; this.sPos[i * 3 + 2] = z;
      this.sVel[i * 3] = (Math.random() - 0.5) * 4 + fx * 6; this.sVel[i * 3 + 1] = Math.random() * 2.5; this.sVel[i * 3 + 2] = (Math.random() - 0.5) * 4 + fz * 6;
      this.sLife[i] = 0.15 + Math.random() * 0.2;
    }
  },

  // 粒：blood 血（暗い赤）・dust 土・cloth 布の埃。nx, nz の向きへ飛ぶ。gy は地面の高さ（そこで止める）
  burst(x, y, z, n, type = 'dust', nx = 0, nz = 0, gy = null) {
    this.fxStats.burstCalls++;
    if (type === 'dust' || type === 'blood') return;   // 10/24：土埃・血の粒は作らない（全戦）
    if (!this.fxVisible(x, y, z)) return;
    n = Math.min(this.pN, S.reduceMotion ? Math.ceil(n / 2) : Math.ceil(n));
    if (n <= 0) return;
    this.fxStats.burstEmitted++;
    this.fxStats.burstParticles += n;
    const C = PCOL[type] || PCOL.dust;
    const blood = type === 'blood';
    const mud = type === 'dust' && this.world.def.wetEarthBursts && (this.world.def.muddy > 0 || this.rain > 0.3);
    if (gy == null) gy = this.world.heightAt(x, z);
    for (let k = 0; k < n; k++) {
      const i = this.pIdx = (this.pIdx + 1) % this.pN;
      this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
      const sp = (blood ? 0.8 + Math.random() * 1.6 : 0.6 + Math.random() * 1.2) * (mud ? 0.55 : 1);
      this.pVel[i * 3] = nx * sp + (Math.random() - 0.5) * 1.2;
      this.pVel[i * 3 + 1] = mud ? 0.35 + Math.random() * 0.65 : (blood ? 0.3 : 0.8) + Math.random() * (blood ? 1.4 : 2);
      this.pVel[i * 3 + 2] = nz * sp + (Math.random() - 0.5) * 1.2;
      const j = (0.85 + Math.random() * 0.3) * (mud ? 0.48 : 1);
      this.pCol[i * 3] = C[0] * j; this.pCol[i * 3 + 1] = C[1] * j; this.pCol[i * 3 + 2] = C[2] * j;
      this.pLife[i] = mud ? 0.22 + Math.random() * 0.15 : 0.5 + Math.random() * 0.4;
      this.pGround[i] = gy;
    }
    this.points.geometry.attributes.color.needsUpdate = true;
  },

  updateParticles(dt) {
    let changed = false;
    for (let i = 0; i < this.sN; i++) {
      if (this.sLife[i] <= 0) continue;
      changed = true;
      this.sLife[i] -= dt;
      if (this.sLife[i] <= 0) { this.sPos[i * 3 + 1] = -999; continue; }
      this.sVel[i * 3 + 1] -= 9 * dt;
      for (let a = 0; a < 3; a++) this.sPos[i * 3 + a] += this.sVel[i * 3 + a] * dt;
    }
    for (let i = 0; i < this.pN; i++) {
      if (this.pLife[i] <= 0) continue;
      changed = true;
      this.pLife[i] -= dt;
      // 地面に落ちたら消える
      if (this.pLife[i] <= 0 || this.pPos[i * 3 + 1] < this.pGround[i]) { this.pLife[i] = 0; this.pPos[i * 3 + 1] = -999; continue; }
      this.pVel[i * 3 + 1] -= 9.8 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
    }
    // 最後の粒を消す転送まで行い、全て止まった後の同じ位置は送り直さない。
    if (changed) this.points.geometry.attributes.position.needsUpdate = true;
  }
};
