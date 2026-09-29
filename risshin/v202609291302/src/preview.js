import * as THREE from 'three';
import { buildModel, buildHorse, animateHorse, poseArms, seatLegs, FLAG_T, GENERALS } from './units.js';
import { World } from './world.js';
import { playerLook, horseStyle } from './player.js';
import { myHorse } from './state.js';

// 武具屋で自分の姿を回して見るための小さな描画
export class Preview {
  constructor(canvas) {
    this.canvas = canvas;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (e) { this.renderer = null; return; }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth || 220, canvas.clientHeight || 260, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xe8e0d0, 0x3a3024, 1.3));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(32, (canvas.clientWidth || 220) / (canvas.clientHeight || 260), 0.1, 50);
    this.camera.position.set(0, 1.7, 5.4);
    this.camera.lookAt(0, 1.35, 0);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.alive = true;
    const loop = () => {
      if (!this.alive || !this.canvas.isConnected) { this.dispose(); return; }
      this.holder.rotation.y += this.spin ?? 0.012;
      if (this.horse) animateHorse(this.horse, 1 / 60, 0);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  setLook(G) {
    if (!this.renderer) return;
    this.holder.clear();
    const u = {};
    const m = buildModel(u, playerLook(G));
    u.hand.rotation.x = -0.5; poseArms(u);
    this.holder.add(m);
  }

  // 出世の道：段ごとの姿（足軽大将からは馬上）
  setStep(G, step, horseId) {
    if (!this.renderer) return;
    this.holder.clear();
    const u = {};
    const m = buildModel(u, playerLook(G, step));
    u.hand.rotation.x = -0.5; poseArms(u);
    this.horse = null;
    if (step >= 2) {
      this.horse = buildHorse(horseStyle(step, myHorse(horseId ? { ...G, horse: { ...(G.horse || {}), id: horseId } } : G).coat));
      m.add(this.horse);
      for (const part of [u.body, u.hand, u.flag, u.uma]) if (part) part.position.y += 0.95;
      seatLegs(u);
    }
    this.holder.add(m);
    // 馬や馬印が入るように引く
    const far = step >= 6 ? 10 : step >= 2 ? 7.2 : 5.4;
    // 斜め前から見せる（馬が細く見えないように）
    this.holder.rotation.y = -0.6;
    const lookY = step >= 6 ? 2.5 : step >= 2 ? 1.75 : 1.35;
    this.camera.position.set(0, lookY + 0.35, far);
    this.camera.lookAt(0, lookY, 0);
  }

  // 武将の見本：名のある武将（units.js の GENERALS）を、その人の兜・甲冑・陣羽織・母衣で。図鑑などから
  setGeneral(nm) {
    const gd = GENERALS[nm];
    if (!this.renderer || !gd) return;
    this.holder.clear();
    this.horse = null;
    const u = {};
    const m = buildModel(u, { armor: gd.armor, lace: gd.lace, hat: gd.hat, sode: true, pole: false, flag: null, weapon: 'sword', skin: gd.skin, saya: true, menpo: gd.menpo || 0, menpoStyle: gd.menpoStyle, horo: gd.horo ?? 0, haori: gd.haori, tier: 3, face: 'g:' + nm, mon: gd.mon, haoriMonCol: gd.haoriMonCol });
    u.hand.rotation.x = -0.5; poseArms(u);
    this.holder.add(m);
    // 前立が切れないよう、少し引いて上を入れる
    this.holder.rotation.y = -0.45;
    this.camera.position.set(0, 1.75, 5.8);
    this.camera.lookAt(0, 1.45, 0);
  }

  dispose() {
    this.alive = false;
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss?.(); this.renderer = null; }
  }
}

// タイトル画面の背景：朝靄の中に並ぶ足軽と幟
export function titleScene() {
  // タイトルの背景：朝靄の山あいに、足軽の列と幟。本編と同じ地面・木・空を使う
  const scene = new THREE.Scene();
  const world = new World(scene, {
    seed: 17, time: 'after', trees: 260, tufts: 3200, muddy: 0.5, mist: true, fogFar: 150,
    height: (x, z) => 2.2 * Math.sin(x * 0.04) * Math.cos(z * 0.035) + 6 * Math.exp(-((x + 30) ** 2 + (z + 40) ** 2) / 900) + 5 * Math.exp(-((x - 35) ** 2 + (z + 30) ** 2) / 700),
    paths: [[[-2, 40], [0, 0], [3, -40], [10, -120]]],
    clear: (x, z) => Math.abs(x) < 12 && z > -30 && z < 16,
  });
  const flags = [];
  const lookFor = (i) => ({ armor: 0x24221f, lace: [0x5a4630, 0x2e3a52, 0x4a3a2a][i % 3], hat: 'jingasa', sode: false, pole: true, flag: 'tokugawa', weapon: 'spear', skin: [0xb58c68, 0xa87f5c, 0xc09a74][i % 3], beard: i % 4 === 1 });
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 7; i++) {
      const u = {};
      const m = buildModel(u, lookFor(i + row));
      const x = (i - 3) * 1.4 + (row % 2) * 0.6, z = -row * 2.3 - 2;
      m.position.set(x, world.heightAt(x, z), z);
      m.rotation.y = Math.PI + (Math.random() - 0.5) * 0.15;
      const h = 0.93 + Math.random() * 0.12; m.scale.set(h * (0.95 + Math.random() * 0.1), h, h);
      u.hand.rotation.x = -0.5; poseArms(u);
      m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(m);
      if (u.flag) flags.push(u.flag);
    }
  }
  let time = 0;
  const focus = new THREE.Vector3(0, 0, -4);
  return {
    scene,
    update(dt, camera) {
      time += dt;
      const a = 0.5 + Math.sin(time * 0.05) * 0.35;
      camera.position.set(Math.sin(a) * 9, world.heightAt(Math.sin(a) * 9, Math.cos(a) * 9 - 3) + 2.0 + Math.sin(time * 0.1) * 0.2, Math.cos(a) * 9 - 3);
      camera.lookAt(0, 1.6, -4);
      flags.forEach((f, i) => { f.rotation.y = -Math.PI / 2 + 0.6 + Math.sin(time * 2 + i) * 0.25; });
      FLAG_T.value += dt;
      world.update(dt, focus);
    },
  };
}
