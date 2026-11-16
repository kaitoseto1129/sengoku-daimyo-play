// 根来寺：隠れて撃つ鉄砲衆（K123 kaito 11/3・11/6「鉄砲衆がとてつもなく多い・家の中・塀の陰・高い所・屋根の上・かくれんぼ」）
// 本物の撃ち手（持ち場の兵）は数を増やさず、坊舎の屋根の棟・塀の陰・倉の屋根・子院の屋根・山の斜面の草に
// 軽い人影（二つの束の描き分け）を多く伏せる。寄ると、影が身を起こして構え、筒先の火と白い硝煙を上げ、またすぐ伏せる。
// 撃つのは近くに本物の根来の鉄砲衆が生きている所だけ（持ち場を潰せば、その辺りの影も黙る）。当たりは無い（見せる火と煙と音だけ）。
import * as THREE from 'three';
import { S as SETTINGS } from '../settings.js';

let GEO = null;
function geos() {
  if (GEO) return GEO;
  // 膝をついて構えた姿：胴（具足・小袖）と筒、頭は別の束（裹頭の白・素顔の色を混ぜる）
  const body = new THREE.BoxGeometry(0.44, 0.86, 0.34); body.translate(0, 0.45, 0);
  const gun = new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5); gun.rotateX(Math.PI / 2); gun.translate(0.08, 0.95, 0.42);
  const arm = new THREE.BoxGeometry(0.5, 0.12, 0.14); arm.translate(0.06, 0.92, 0.2);
  const g = new THREE.BufferGeometry();
  const parts = [body, gun, arm].map((p) => p.toNonIndexed());
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); o += p.attributes.position.count; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const head = new THREE.SphereGeometry(0.15, 7, 5); head.translate(0, 1.07, 0.02);
  GEO = { body: g, head };
  return GEO;
}

// spots：[{ x, z（世界の座標）, up（身を起こした時の足の高さ）, down（伏せた時の足の高さ）, head（0 素顔・1 白い裹頭） }]
export function hiddenGuns(rt, spots) {
  const G = geos(), n = spots.length;
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2c2722 });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bodies = new THREE.InstancedMesh(G.body, bodyMat, n), heads = new THREE.InstancedMesh(G.head, headMat, n);
  for (const m of [bodies, heads]) { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.name = '根来の隠れ鉄砲'; rt.scene.add(m); }
  const skin = new THREE.Color(0x7a5a42), hood = new THREE.Color(0xcfc8b8);
  const S = spots.map((s, i) => {
    heads.setColorAt(i, s.head ? hood : skin);
    return { ...s, y: s.down, st: 'down', t: 2 + Math.random() * 8, h: 0, live: false, dirty: true };
  });
  heads.instanceColor.needsUpdate = true;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
  let liveT = 0, nextShot = 0, shots = 0;
  const place = (i, s) => {
    Q.setFromAxisAngle(Y, s.h); V.set(s.x, s.y, s.z); M.compose(V, Q, ONE);
    bodies.setMatrixAt(i, M); heads.setMatrixAt(i, M); s.dirty = false;
  };
  S.forEach((s, i) => place(i, s));
  bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  const api = {
    spots: S, get shots() { return shots; },
    get upNow() { return S.filter((s) => s.st !== 'down').length; },
    get liveNow() { return S.filter((s) => s.live).length; },
    tick(dt, on) {
      const me = rt.player && rt.player.u, army = rt.army;
      if (!me || !army) return;
      const now = army.time ?? rt.t;
      // 一秒に一度：近くに本物の根来の鉄砲衆が生きている影だけを「撃つ影」にする
      liveT -= dt;
      if (liveT <= 0) {
        liveT = 1;
        for (const s of S) s.live = false;
        if (on) for (const u of army.units) {
          if (!u.alive || u.team !== 1 || u.type !== 'gun' || u.fleeing || u.downed || u.dying || u.isStruct) continue;
          for (const s of S) if (!s.live && Math.abs(u.pos.x - s.x) < 45 && Math.abs(u.pos.z - s.z) < 45) s.live = true;
        }
      }
      const gap = SETTINGS.quality === 'high' ? 0.26 : 0.38;   // 煙の粒は全軍で百四十まで。本物の撃ち手の煙を追い出さない間
      let moved = false;
      for (let i = 0; i < n; i++) {
        const s = S[i];
        const dx = me.pos.x - s.x, dz = me.pos.z - s.z, d = Math.hypot(dx, dz);
        const near = s.live && d > 9 && d < 95 && me.alive;
        s.t -= dt;
        if (s.st === 'down') {
          if (s.y !== s.down) { s.y = Math.max(s.down, s.y - dt * 4); s.dirty = true; }
          if (near && s.t <= 0) { s.st = 'rise'; s.h = Math.atan2(dx, dz); s.dirty = true; }
        } else if (s.st === 'rise') {
          s.y = Math.min(s.up, s.y + dt * 3.2); s.dirty = true;
          if (s.y >= s.up) { s.st = 'aim'; s.t = 0.45 + Math.random() * 0.6; }
        } else if (s.st === 'aim') {
          if (!near) { s.st = 'duck'; continue; }
          s.h = Math.atan2(dx, dz); s.dirty = true;
          if (s.t <= 0 && now >= nextShot) {
            nextShot = now + gap; shots++;
            const fx = Math.sin(s.h), fz = Math.cos(s.h);
            const mx = s.x + fx * 1.05 + Math.cos(s.h) * 0.08, my = s.y + 0.95, mz = s.z + fz * 1.05 - Math.sin(s.h) * 0.08;
            if (d < 140) army.flash?.(mx, my, mz, d > 60 ? 1.5 : 1.1);
            army.smoke?.(mx, my, mz, fx, fz, 1.35);   // 屋根や塀の上の白煙は大きく（どこから撃ったかが煙で分かるように）
            army.play?.('gun', { x: mx, y: my, z: mz }, 0.75);
            // 足元や脇の土に弾が当たって跳ねる（近い時だけ。当たりは無い）
            if (d < 45 && Math.random() < 0.45 && army.spark) {
              const a = Math.random() * 6.28, r = 1.2 + Math.random() * 2.5, gx = me.pos.x + Math.cos(a) * r, gz = me.pos.z + Math.sin(a) * r;
              army.spark(gx, (rt.world.heightAt?.(gx, gz) ?? me.pos.y) + 0.1, gz, 4, -fx, -fz);
            }
            s.st = 'hold'; s.t = 0.35 + Math.random() * 0.4;
          }
        } else if (s.st === 'hold') {
          if (s.t <= 0) s.st = 'duck';
        } else if (s.st === 'duck') {
          s.y = Math.max(s.down, s.y - dt * 4.5); s.dirty = true;
          // 伏せてから次に起きるまで。持ち場を替えるように、間はばらつかせる
          if (s.y <= s.down) { s.st = 'down'; s.t = 3 + Math.random() * 6; }
        }
        if (s.dirty) { place(i, s); moved = true; }
      }
      if (moved) bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
    },
  };
  return api;
}
