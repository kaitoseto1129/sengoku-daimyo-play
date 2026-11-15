// ======================================================================
// 段4（K310・docs/specs/physical_roadmap_1115.md）：桶狭間の一場面を WebXR で開き、手の操作器で刀を振って敵を斬る試作。
//   入口は prototype/xr.html（Web 版だけ。アプリの index.html と main.js は読まない・触らない）。
//   地面・空・雨・木は本編の桶狭間の定義（b_okehazama.js の okehazama.world）を World にそのまま渡して作る。
//   兵は本編の buildModel（今川の足軽・具足）。場所は本陣前の守り（布陣図 docs/fujin/okehazama.md：本陣の前の坂）。
//   足軽の目の高さに立ち、本陣の方から今川の足軽が坂を下りて来る。速く振った刀の身が胴に当たると倒れる。
//   字は出さない（Simple is the best）。当たると操作器が震える。
// ======================================================================
import * as THREE from 'three';
import './xr_order.js';   // 本編（main.js）と同じ読み順で先に読む（循環の import で IMP_TINT・ALLB を作る前に使わない）
import { buildModel, poseArms } from './units.js';
import { World, setRenderer } from './world.js';
import { okehazama } from './b_okehazama.js';
import { installGrade } from './grade.js';
import { UNIT_LAC_ENV } from './units_model.js';

// b_okehazama.js の場の向き（fieldX・fieldZ と同じ式。本陣前の守り＝場の (0,-96)、本陣＝(18,-116)）
const TURN = Math.atan2(-261, -53) - Math.atan2(-18, 278);
const FC = Math.cos(TURN), FS = Math.sin(TURN);
const FX = 112 - 18 * FC + 116 * FS, FZ = 33 + 18 * FS + 116 * FC;
const fx = (x, z) => FX + x * FC + z * FS;
const fz = (x, z) => FZ - x * FS + z * FC;
const field = (x, z) => new THREE.Vector3(fx(x, z), 0, fz(x, z));

const SPOT = field(4, -86);          // 立つ所：本陣前の守りの手前の坂の下
const HONJIN = field(18, -116);      // 敵が来る方
const BLADE = 0.95, HILT = 0.24;     // 刀の身と柄の長さ（m）
const SWING_V = 2.2;                 // 斬れる刀の先の速さ（m/秒）
const ENEMIES = 7;

export function startXR({ canvas, onReady } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  installGrade(renderer);   // 本編の色の仕上げ（grade.js は読んだ時に全部の材質の最後の色を置き換える。入れないと真っ黒）
  setRenderer(renderer);

  const scene = new THREE.Scene();
  const wdef = { ...okehazama.world, battleKey: 'okehazama', trees: 260, tufts: 2400 };
  const world = new World(scene, wdef);
  // 本陣へ攻め上る所の空：雨が上がった直後（本編 b_okehazama.js の setTime('after')）
  try { world.setTime('after', true); world.setRainTarget?.(0); world.updateEnv?.(); } catch (e) { /* 空の作りが無くても斬れる */ }
  UNIT_LAC_ENV.value = 2.2;   // 黒漆の映り込みを上げる（preview.js の具足の写真と同じ手。曇りの谷で胴が黒い塊にならない）
  const H = (x, z) => world.heightAt(x, z);
  SPOT.y = H(SPOT.x, SPOT.z);

  // 足軽の目の高さに立つ台（rig）。顔は本陣の方へ
  const rig = new THREE.Group();
  rig.position.copy(SPOT);
  const toHonjin = Math.atan2(HONJIN.x - SPOT.x, HONJIN.z - SPOT.z);
  rig.rotation.y = toHonjin + Math.PI;   // 三の -z が前
  scene.add(rig);
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 400);
  camera.position.set(0, 1.6, 0);
  rig.add(camera);

  // 刀：柄（黒の柄巻）・鍔・身（鋼）。操作器の握りから前（-z）へ伸ばす
  const steel = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.75, roughness: 0.25 });
  const black = new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.8 });
  const gold = new THREE.MeshStandardMaterial({ color: 0x6b5526, metalness: 0.8, roughness: 0.45 });
  function katana() {
    const g = new THREE.Group();
    const tsuka = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.026, HILT), black); tsuka.position.z = 0.06; g.add(tsuka);
    const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.008, 16), gold); tsuba.rotation.x = Math.PI / 2; tsuba.position.z = -0.06; g.add(tsuba);
    const shape = new THREE.Shape();   // 反りのある身：棟を緩い弧に、切先を尖らせる
    const N = 12;
    for (let i = 0; i <= N; i++) { const t = i / N; shape.lineTo(t * BLADE, 0.018 * Math.sin(t * Math.PI) * 1.2 + (t > 0.92 ? -(t - 0.92) * 0.2 : 0)); }
    for (let i = N; i >= 0; i--) { const t = i / N; shape.lineTo(t * BLADE * (t > 0.95 ? 0.985 : 1), 0.018 * Math.sin(t * Math.PI) * 1.2 - 0.03 * (1 - t * 0.4)); }
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false }), steel);
    blade.rotation.y = Math.PI / 2; blade.position.set(-0.003, 0.012, -0.064);   // 身の長さ（x）を操作器の前（-z）へ
    g.add(blade);
    return g;
  }
  const hands = [0, 1].map((i) => {
    const grip = renderer.xr.getControllerGrip(i);
    const sword = katana(); grip.add(sword);
    rig.add(grip);
    const ctl = renderer.xr.getController(i); rig.add(ctl);
    const H = { grip, sword, src: null, prevTip: new THREE.Vector3(), prevBase: new THREE.Vector3(), has: false, buzz: 0 };
    ctl.addEventListener('connected', (e) => { H.src = e.data; sword.visible = e.data.handedness !== 'left' || !!window.__xrBoth; });
    ctl.addEventListener('disconnected', () => { H.src = null; });
    return H;
  });

  // 今川の足軽（本編の具足と顔）。本陣の坂から一人ずつ下りて来る
  const lookFor = (i) => ({ armor: 0x24221f, lace: [0x2e3a52, 0x5a4630, 0x3a2a2a][i % 3], hat: 'jingasa', sode: false, pole: i % 3 === 0, flag: 'imagawa', mon: 'imagawa', weapon: 'spear', skin: [0xb58c68, 0xa87f5c, 0xc09a74][i % 3], beard: i % 4 === 1 });
  const foes = [];
  const fwd = new THREE.Vector3(Math.sin(toHonjin), 0, Math.cos(toHonjin));
  const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
  function place(f, far) {
    const d = far + Math.random() * 6, s = (Math.random() - 0.5) * 7;
    f.pos.copy(SPOT).addScaledVector(fwd, d).addScaledVector(side, s);
    f.state = 'walk'; f.t = 0; f.wait = Math.random() * 1.5;
  }
  for (let i = 0; i < ENEMIES; i++) {
    const u = {};
    const m = buildModel(u, lookFor(i));
    u.hand && (u.hand.rotation.x = -0.6); poseArms(u);
    m.rotation.order = 'YXZ';   // 向きを先に、倒れは体の前後で
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(m);
    const f = { m, u, pos: new THREE.Vector3(), state: 'walk', t: 0, wait: 0, slot: (i - (ENEMIES - 1) / 2) * 0.9 };
    place(f, 4 + i * 2.2);
    foes.push(f);
  }
  let kills = 0;
  window.__xr = { get kills() { return kills; }, foes, rig, hands, renderer, world, scene, camera };

  // 血の飛沫（使い回しの小さな玉）
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 5, 4), new THREE.MeshBasicMaterial({ color: 0x5a0a08 }), 120);
  drops.count = 0; drops.frustumCulled = false; scene.add(drops);
  const dropP = [], dropV = [], dropT = [];
  const M = new THREE.Matrix4();
  function spray(at, dir) {
    for (let k = 0; k < 24; k++) {
      if (dropP.length >= 120) { dropP.shift(); dropV.shift(); dropT.shift(); }
      dropP.push(at.clone()); dropT.push(0.9);
      dropV.push(dir.clone().multiplyScalar(1.2 + Math.random() * 1.5).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.8, (Math.random() - 0.5) * 1.5)));
    }
  }

  // 段5：本物の打ち込み台（docs/physical/makiwara/）に打つと、ble_sword.js が強さを渡す。目の前の足軽が打たれた向き（前）へ倒れる
  window.__targetHit = (p = 1) => {
    const f = foes.find((e) => e.front === 1 && e.state === 'stand') || foes.find((e) => e.state === 'stand');
    if (!f) return false;
    if (f.front === 1) window.__boardSend?.('f');
    f.state = 'fall'; f.t = 0; f.front = null; f.fallDir = fwd.clone();
    spray(f.pos.clone().setY(f.pos.y + 1.2), fwd.clone().multiplyScalar(Math.min(1.3, Math.max(0.7, p))));
    kills++;
    return true;
  };
  const head = new THREE.Vector3(), tip = new THREE.Vector3(), base = new THREE.Vector3(), q = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  function bladeHits(H, f) {
    // 刀の身（鍔から切先）の上の 6 点と、前のコマの同じ点の間を見て、足軽の胴（腰〜首・半径 0.32m）を通ったか
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      for (const s of [0, 0.5, 1]) {
        q.lerpVectors(base, tip, t);
        tmp.lerpVectors(H.prevBase, H.prevTip, t);
        q.lerp(tmp, s);
        const dy = q.y - f.pos.y;
        if (dy > 0.55 && dy < 1.75 && Math.hypot(q.x - f.pos.x, q.z - f.pos.z) < 0.4) return q.clone();
      }
    }
    return null;
  }

  const clock = new THREE.Clock();
  let boardT = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    camera.getWorldPosition(head);
    // 刀の先の速さ
    for (const hd of hands) {
      if (!hd.src || !hd.sword.visible) { hd.has = false; continue; }
      hd.grip.updateMatrixWorld(true);
      base.set(0, 0, -0.064).applyMatrix4(hd.grip.matrixWorld);
      tip.set(0, 0, -0.064 - BLADE).applyMatrix4(hd.grip.matrixWorld);
      if (hd.has) {
        const v = tip.distanceTo(hd.prevTip) / Math.max(dt, 1e-3);
        if (v > SWING_V) {
          for (const f of foes) {
            if (f.state !== 'walk' && f.state !== 'stand') continue;
            const at = bladeHits(hd, f);
            if (!at) continue;
            if (f.front === 1) window.__boardSend?.('f');
            f.state = 'fall'; f.t = 0; f.front = null;
            f.fallDir = tmp.subVectors(tip, hd.prevTip).setY(0).normalize().clone();
            spray(at, f.fallDir);
            kills++;
            hd.buzz = 0.12;
            try { hd.src.gamepad?.hapticActuators?.[0]?.pulse?.(0.9, 90); } catch (e) { /* 震えない操作器 */ }
          }
        }
      }
      hd.prevTip.copy(tip); hd.prevBase.copy(base); hd.has = true;
    }
    // 空いた前の持ち場へ、いちばん近い待ちの者を入れる
    for (let k = 0; k < 3; k++) {
      if (foes.some((f) => f.front === k && f.state !== 'fall')) continue;
      let best = null, bd = 1e9;
      for (const f of foes) { if (f.front != null || f.state === 'fall') continue; const dd = f.pos.distanceTo(SPOT); if (dd < bd) { bd = dd; best = f; } }
      for (const f of foes) if (f.front === k) f.front = null;
      if (best) { best.front = k; best.state = 'walk'; }
    }
    // 足軽：坂を下りて前に並び、槍を構える。斬られると斬られた向きへ倒れ、しばらくして坂の上から次が来る
    for (const f of foes) {
      f.t += dt;
      // 前の三つの持ち場（1.3m・左右 35°）に入った者が槍を構え、ほかは 3.5m の後ろの列で待つ
      const r = f.front != null ? 1.3 : 3.5, a = f.front != null ? (f.front - 1) * 0.6 : f.slot * 0.28;
      const to = tmp.copy(SPOT).addScaledVector(fwd, Math.cos(a) * r).addScaledVector(side, Math.sin(a) * r).sub(f.pos).setY(0);
      const d = to.length();
      if (f.state === 'walk') {
        if (f.t > f.wait) {
          const sp = f.front != null ? 1.4 : 1.8;
          if (d > 0.05) f.pos.addScaledVector(to.normalize(), Math.min(d, sp * dt)); else if (f.front != null) f.state = 'stand';
        }
        f.m.rotation.set(0, Math.atan2(head.x - f.pos.x, head.z - f.pos.z), Math.sin(f.t * 7) * 0.03);
      } else if (f.state === 'stand') {
        f.m.rotation.set(Math.sin(f.t * 3) * 0.04, Math.atan2(head.x - f.pos.x, head.z - f.pos.z), 0);
      } else if (f.state === 'fall') {
        const k = Math.min(1, f.t / 0.7), e = k * k;
        const yaw = Math.atan2(head.x - f.pos.x, head.z - f.pos.z);
        f.m.rotation.set(-e * 1.45, yaw, (f.fallDir.x * Math.cos(yaw) - f.fallDir.z * Math.sin(yaw)) * e * 0.6);
        if (f.t > 4) { place(f, 9); f.state = 'walk'; }
      }
      f.pos.y = H(f.pos.x, f.pos.z);
      f.m.position.copy(f.pos);
      f.m.updateMatrix(); f.m.updateMatrixWorld(true);
    }
    // 段5：真ん中の前の足軽の揺れを、巻藁の人形（サーボ）へ十分の一秒ごとに送る（docs/physical/makiwara/）。倒れた時は "f"
    if (window.__boardSend && (boardT -= dt) <= 0) {
      boardT = 0.1;
      const c = foes.find((e) => e.front === 1);
      if (c && c.state === 'stand') window.__boardSend('m,' + Math.sin(c.t * 1.7).toFixed(2));
    }
    // 飛沫
    let n = 0;
    for (let i = 0; i < dropP.length; i++) {
      if ((dropT[i] -= dt) <= 0) continue;
      dropV[i].y -= 9.8 * dt; dropP[i].addScaledVector(dropV[i], dt);
      const g = H(dropP[i].x, dropP[i].z) + 0.01; if (dropP[i].y < g) { dropP[i].y = g; dropV[i].set(0, 0, 0); }
      M.makeTranslation(dropP[i].x, dropP[i].y, dropP[i].z); drops.setMatrixAt(n++, M);
    }
    drops.count = n; drops.instanceMatrix.needsUpdate = true;
    world.update(dt, head);
    window.__xrTick?.(dt);
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  onReady?.({ renderer, scene, camera, rig });
  return { renderer, scene, camera, rig, world };
}
