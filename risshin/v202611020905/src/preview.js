import * as THREE from 'three';
import { buildModel, buildHorse, animateHorse, poseArms, seatLegs, FLAG_T, GENERALS } from './units.js';
import { World } from './world.js';
import { playerLook, horseStyle } from './player.js';
import { myHorse } from './state.js';
import { S } from './settings.js';
import { battleResources } from './battle_resources.js';
import { sharedUnitResources, UNIT_LAC_ENV, UNIT_MAT, unitMatPBR } from './units_model.js';
import { sharedHumanResources, HUM, DOMARU, KABUTO, loadHumans, loadDomaru, loadKabuto, showHuman, stepHuman } from './humans.js';
import { sharedNatureResources } from './nature.js';
import { sharedFlagResources } from './textures.js';
import { sharedArmorResources } from './armor_wear.js';
import { installGrade } from './grade.js';

// 本の写真（明るい部屋で撮った具足）の色：彩度はやや控えめ、暗部はわずかに冷たく、明部は暖かく
const PHOTO_GRADE = { exposure: 1.0, saturation: 0.9, shadow: new THREE.Vector3(0.97, 0.985, 1.01), light: new THREE.Vector3(1.04, 1.01, 0.96) };

// 撮影の部屋（写真の光）を焼いた映り込み。部屋は一度だけ組み、焼いた後に手放す
function studioEnv(renderer) {
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vD; void main() {
        float y = vD.y;
        vec3 top = vec3(0.2, 0.2, 0.21), hor = vec3(0.14, 0.13, 0.12), gnd = vec3(0.06, 0.045, 0.035);
        vec3 c = y > 0.0 ? mix(hor, top, smoothstep(0.0, 0.8, y)) : mix(hor, gnd, smoothstep(0.0, 0.25, -y));
        gl_FragColor = vec4(c, 1.0); }`,
    }));
    es.add(dome);
    const box = (w, h, k, x, y, z, col = 0xfff2e2) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 1.2, 0); es.add(m);
    };
    box(4.5, 3.2, 14, -4.2, 5.2, 5.0);           // 主の窓：左上の前
    box(1.2, 5.5, 10, 5.5, 3.0, -2.5, 0xe8eef8);  // 右後ろの細い窓：縁の照り
    box(6.0, 1.6, 1.4, 1.5, 1.2, 7.5);           // 前の弱い起こし
    const rt = pm.fromScene(es, 0.03);
    pm.dispose();
    es.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    return rt;
  } catch (e) { return null; }
}
let contactT = null;
function contactTex() {
  if (contactT) return contactT;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.35, 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  contactT = new THREE.CanvasTexture(c);
  return contactT;
}

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
    // 写真の色：本編と同じ ACES の階調。平らな直の色だと、塗った絵に見える
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.7;
    // 本編と同じ色の仕上げ（grade.js の tonemapping は、これを入れないと黒くなる）。写真の色：彩度を少し落とし、明部を暖かく
    installGrade(this.renderer);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.userData.colorGrade = PHOTO_GRADE;
    // 部屋の窓は暗い壁の中の明るい面なので、漆に映しても灰色の板にならない。描く間だけ漆の映り込みを戻す
    this.scene.onBeforeRender = () => { UNIT_LAC_ENV.value = 2.5; };
    this.scene.onAfterRender = () => { UNIT_LAC_ENV.value = 1; };
    // 撮影の部屋の光：柔らかい大きな窓（左上の前）と、右後ろの細い窓。漆と金具に長い照りが映る
    this.envRT = studioEnv(this.renderer);
    this.scene.environment = this.envRT ? this.envRT.texture : null;
    // 床からの照り返し（茶）と空の弱い光。環境の光が主なので弱く
    this.scene.add(new THREE.HemisphereLight(0xdcd6cc, 0x4a3a2a, this.envRT ? 0.35 : 1.3));
    const sun = new THREE.DirectionalLight(0xfff1dc, this.envRT ? 2.8 : 1.6);
    sun.position.set(-2.2, 4.2, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -1.6; sc.right = 1.6; sc.top = 2.6; sc.bottom = -0.4; sc.near = 0.5; sc.far = 12;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.025; sun.shadow.radius = 4;
    this.scene.add(sun);
    // 床：影だけ受ける。足もとの接する暗がり（AO）は柔らかい丸い陰で
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 40), new THREE.ShadowMaterial({ opacity: 0.42 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; floor.receiveShadow = true;
    this.scene.add(floor);
    const ao = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: contactTex(), transparent: true, depthWrite: false, toneMapped: false }));
    ao.rotation.x = -Math.PI / 2; ao.position.y = 0.004;
    this.scene.add(ao);
    this.floor = [floor, ao];
    this.camera = new THREE.PerspectiveCamera(32, (canvas.clientWidth || 220) / (canvas.clientHeight || 260), 0.1, 50);
    this.camera.position.set(0, 1.7, 5.4);
    this.camera.lookAt(0, 1.35, 0);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    // 形を入れたら影を落とし、受ける（腕が胴に、兜が顔に落とす影）。兵の材質は写真の作り（PBR：部屋の窓が漆と金具に映る）へ
    this.holder.add = (...o) => { THREE.Group.prototype.add.apply(this.holder, o); for (const x of o) x.traverse((q) => { if (q.isMesh) { q.castShadow = true; q.receiveShadow = true; if (q.material === UNIT_MAT) q.material = unitMatPBR(); } }); return this.holder; };
    this.alive = true;
    const loop = () => {
      if (!this.alive || !this.canvas.isConnected) { this.dispose(); return; }
      if (!S.reduceMotion) {
        this.holder.rotation.y += this.spin ?? 0.012;
        if (this.horse) animateHorse(this.horse, 1 / 60, 0);
      }
      if (this.hu && this.hu.human && !this.hu.portrait) { this.hu.pos = this.hu.mesh.position; stepHuman(this.hu, 1 / 60); }
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // 骨の入った人（本物の胴丸・兜のスキャン、実写の顔）で見せる。素材が読み終わっている時だけ（城下・戦で読んだ物を使い回し、ここでは読まない）
  humanize(u, m) {
    this.hu = null;
    if (!(HUM.ready && HUM.on && DOMARU.ready && KABUTO.ready)) return false;
    try {
      u.pos = m.position; u.alive = true; u.heading = 0; u.moving = 0; u.forceSpd = 0; u.wpnKind = u.look && u.look.weapon; u.portrait = true;
      if (!showHuman(u)) return false;
      for (let i = 0; i < 20; i++) { u.pos = u.mesh.position; stepHuman(u, 1 / 30); }
      u.human?.root?.traverse((q) => { if (q.isMesh) { q.castShadow = true; q.receiveShadow = true; } });
      this.hu = u;
      return true;
    } catch (e) { return false; }
  }

  setLook(G) {
    if (!this.renderer) return;
    this.holder.clear();
    const u = {};
    const m = buildModel(u, playerLook(G));
    u.hand.rotation.x = -0.5; poseArms(u);
    this.holder.add(m);
    this.humanize(u, m);
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

  // 武将の見本：名のある武将（units.js の GENERALS）を、その人の兜・甲冑・母衣で。図鑑などから（陣羽織は着せない：本の写真の具足に寄せる）
  // 人の素材がまだなら読んでから（図鑑など、城下を通らずに開く所のため）。読む重さは loadGeneral の戻り値（ms）
  async loadGeneral() {
    const t0 = performance.now();
    await loadHumans(); await loadDomaru(); await loadKabuto();
    return Math.round(performance.now() - t0);
  }
  setGeneral(nm, heading = 0.55) {
    const gd = GENERALS[nm];
    if (!this.renderer || !gd) return;
    this.holder.clear();
    this.horse = null;
    const u = {};
    const m = buildModel(u, { armor: gd.armor, lace: gd.lace, hat: gd.hat, sode: true, pole: false, flag: null, weapon: null, skin: gd.skin, saya: true, menpo: gd.menpo || 0, menpoStyle: gd.menpoStyle, horo: gd.horo ?? 0, haori: 0, noHaori: true, tier: 3, face: 'g:' + nm, mon: gd.mon, haoriMonCol: gd.haoriMonCol });
    u.hand.rotation.x = -0.5; poseArms(u);
    this.holder.add(m);
    // 前立が切れないよう、少し引いて上を入れる
    this.holder.rotation.y = -0.45;
    this.camera.position.set(0, 1.75, 5.8);
    this.camera.lookAt(0, 1.45, 0);
    // 骨の入った人は、顔と胸がこちらを向く向きに立たせる（待つ構えは体を少しひねるので、向きで正面へ戻す）
    if (this.humanize(u, m)) { this.holder.rotation.y = 0; u.heading = heading; m.rotation.y = u.heading; this.camera.position.set(0, 1.5, 4.4); this.camera.lookAt(0, 1.22, 0); }
  }

  dispose() {
    this.alive = false;
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
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
  let time = 0, disposed = false;
  const focus = new THREE.Vector3(0, 0, -4);
  return {
    scene,
    update(dt, camera) {
      if (!S.reduceMotion) time += dt;
      const a = 0.5 + Math.sin(time * 0.05) * 0.35;
      camera.position.set(Math.sin(a) * 9, world.heightAt(Math.sin(a) * 9, Math.cos(a) * 9 - 3) + 2.0 + Math.sin(time * 0.1) * 0.2, Math.cos(a) * 9 - 3);
      camera.lookAt(0, 1.6, -4);
      flags.forEach((f, i) => { f.rotation.y = -Math.PI / 2 + 0.6 + (S.flagMotion ? Math.sin(time * 2 + i) * 0.25 : 0); });
      if (S.flagMotion) FLAG_T.value += dt;
      world.update(dt, focus);
    },
    // 題の 3D を手放す（戦・城下へ入る時。iPhone は WebContent が 2GB で落ちるので、題の木・草・兵を戦の間まで持ち越さない）
    dispose() {
      if (disposed) return;
      disposed = true;
      // 地面の絵・兵・旗は次の戦も使う。画像本体を手放した共用画像を返すと、
      // 入り直しで再転送できず地面が黒くなる。戦と同じ所有権で共用品を守る。
      const resources = battleResources([sharedUnitResources(), sharedHumanResources(), sharedNatureResources(), sharedFlagResources(), sharedArmorResources()]);
      resources.add(scene); resources.add({ ...world });
      try { world.dispose(); } catch (e) { /* 残りは下で返す */ }
      resources.dispose();
      scene.clear();
      scene.background = scene.environment = null;
      scene.onBeforeRender = scene.onAfterRender = () => {};
    },
  };
}
