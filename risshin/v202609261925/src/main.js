import * as THREE from 'three';
import { newGame, load, save, settle, BATTLES, RANKS, TITLES, fillRoster, clearSave, setScenario, scenarioKey, SCENARIOS } from './state.js';
import { Battle } from './battle.js';
import { BATTLE_DEFS, dojo } from './battles.js';
import { Hud } from './hud.js';
import { setRenderer } from './world.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { initAudio, silence, sfx, setVolume, duck, townMusic, playMusic, stopMusic } from './audio.js';
import { titleScreen, storyCard, evalScreen, spoilHorseScreen, aijirushiScreen, baseScreen, finalScreen, hideScreen, helpOverlay, settingsScreen, pauseMenu, notice, deathScreen, promoScreen, recordsScreen, dojoResult, epilogueScreen, ladderScreen } from './screens.js';
import { S, QUALITY, saveSettings, canonical } from './settings.js';
import { titleScene } from './preview.js';
import { japanScreen, japanResult, closeJapan } from './japan.js';
import { castleBattle } from './b_castle.js';
import { zukanRecord } from './zukan.js';
import { initTouch, touchFrame, isTouch } from './touch.js';
import { loadHumans, loadHorse, loadDomaru } from './humans.js';
import { lordGame, lordDef, lordOf, applyLord, lordFrame, LORD_BATTLES } from './lord.js';
import { toggleGunbai, gunbaiFrame, isGunbaiOpen, setGunbaiHooks } from './gunbai.js';
import { initCount } from './count.js';   // 数え（github.io の時だけ GoatCounter へ送る）

const $ = (id) => document.getElementById(id);

// ---------------- 描画 ----------------
const canvas = $('view');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('glfail').hidden = false;
  throw e;
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
setRenderer(renderer);
const camera = new THREE.PerspectiveCamera(S.fov, 1, 0.1, 600);
let resScale = 1;  // 動的解像度
function applyRenderSettings() {
  const Q = QUALITY[S.quality] || QUALITY.high;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pixelRatio) * resScale);
  renderer.shadowMap.enabled = Q.shadows;
  camera.fov = S.fov;
  resize();
}
// 画面の仕上げ（画質「中」「高」）：映画の一場面のような色（彩度を少し抑え、暗部は青みの鼠、明部は温かく）、周辺減光、フィルムの粒
// 画質「高」では、明るい所（空・炎・金具・稲光）がわずかににじむ。画質「低」は仕上げなしでそのまま描く
const FinishShader = new THREE.RawShaderMaterial({
  uniforms: { tDiffuse: { value: null }, toneMappingExposure: { value: 1 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uGrade: { value: 1 }, uVig: { value: 1 }, uGrain: { value: 1 } },
  vertexShader: `precision highp float;
    uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
    attribute vec3 position; attribute vec2 uv; varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `precision highp float;
    uniform sampler2D tDiffuse; uniform float uTime, uGrade, uVig, uGrain; uniform vec2 uRes; varying vec2 vUv;
    #include <tonemapping_pars_fragment>
    #include <colorspace_pars_fragment>
    void main() {
      vec3 col = ACESFilmicToneMapping(texture2D(tDiffuse, vUv).rgb);
      col = sRGBTransferOETF(vec4(col, 1.0)).rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      // 彩度を少し抑える
      col = mix(vec3(l), col, 1.0 - 0.13 * uGrade);
      // 暗部は青みの鼠、明部はわずかに温かく
      vec3 tint = mix(vec3(0.93, 0.98, 1.05), vec3(1.035, 1.0, 0.95), smoothstep(0.08, 0.75, l));
      col *= mix(vec3(1.0), tint, uGrade);
      // ゆるい S 字の階調と、締まりすぎない黒
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.12 * uGrade);
      col = col * (1.0 - 0.03 * uGrade) + 0.014 * uGrade;
      // 周辺減光
      vec2 d = vUv - 0.5; d.x *= uRes.x / uRes.y;
      col *= 1.0 - smoothstep(0.4, 1.1, length(d)) * 0.34 * uVig;
      // フィルムの粒（暗い所ほど目立つ）
      float n = fract(sin(dot(floor(vUv * uRes) + fract(uTime * vec2(0.618, 0.382)) * 311.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      col += n * 0.03 * uGrain * (1.0 - l * 0.7);
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
let composer = null, renderPass = null, bloomPass = null, finishPass = null, composerMS = -1;
function useFinish() { return S.quality !== 'low'; }
function draw(scene) {
  if (!useFinish()) { renderer.render(scene, camera); return; }
  const Q = QUALITY[S.quality] || QUALITY.high;
  // 画質「中」は画素を増やさないので、縁のぎざぎざを重ね描きで消す
  const ms = S.quality === 'mid' ? 4 : 0;
  if (!composer || composerMS !== ms) {
    if (composer) composer.dispose();
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: ms });
    composer = new EffectComposer(renderer, rt);
    composerMS = ms;
    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.22, 0.45, 0.9);
    composer.addPass(bloomPass);
    finishPass = new ShaderPass(FinishShader);
    composer.addPass(finishPass);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  bloomPass.enabled = !!Q.bloom && !S.reduceMotion;
  const U = finishPass.uniforms;
  U.toneMappingExposure.value = renderer.toneMappingExposure;
  if (!S.reduceMotion) U.uTime.value = (U.uTime.value + 1 / 60) % 1000;
  renderer.getDrawingBufferSize(U.uRes.value);
  renderPass.scene = scene;
  composer.render();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
applyRenderSettings();

// 設定が変わったときに即時反映
function onSettings(key) {
  if (key === 'fov' || key === 'quality') applyRenderSettings();
  if (key === 'quality' && game.battle) game.battle.applyQuality();
  if (['volume', 'volSfx', 'volAmb', 'volMusic'].includes(key)) setVolume(S.volume);
  if (key === 'townMusic' && !game.battle) townMusic(S.townMusic && !$('screen').hidden && game.inTown);
  game.hud.applySettings();
}

// ---------------- 入力 ----------------
const input = {
  keys: new Set(), edge: new Set(), dx: 0, dy: 0, wheel: 0,
  mouseL: false, mouseR: false, padL: false, padR: false, leftPressed: false, rightPressed: false,
  axis: null, lockPressed: false, quickCmd: null, runHeld: false,
  get left() { return this.mouseL || this.padL; },
  get right() { return this.mouseR || this.padR; },
  key(c) { return this.keys.has(c); },
  pressed(c) { return this.edge.has(c); },
  endFrame() { this.edge.clear(); this.dx = 0; this.dy = 0; this.wheel = 0; this.leftPressed = false; this.rightPressed = false; this.lockPressed = false; this.quickCmd = null; },
  clear() { this.keys.clear(); this.edge.clear(); this.mouseL = this.mouseR = false; },
};
const GAME_KEYS = new Set(['AltLeft', 'AltRight', 'Enter', 'KeyP', 'KeyU', 'KeyB', 'BracketLeft', 'BracketRight', 'Tab', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyM', 'KeyH', 'KeyG', 'KeyQ', 'KeyR', 'KeyT', 'KeyL', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyN', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'ShiftLeft', 'ShiftRight']);
window.addEventListener('keydown', (e) => {
  if (!game.battle) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
  const code = canonical(e.code);
  if (GAME_KEYS.has(e.code) || GAME_KEYS.has(code)) e.preventDefault();
  if (code === null) return;
  // 写真モード中は P で戻る
  if (game.photo) { if (code === 'KeyP' && !e.repeat) togglePhoto(); else if (!e.repeat) photoKey(e.code); input.keys.add(code); return; }
  if (e.code === 'KeyH' && !e.repeat) { toggleHelp(); return; }
  if (e.code === 'F1') { e.preventDefault(); game.hud.toggleCheat(); return; }
  // ポインタロックが使えない環境では Esc で一時停止
  if (e.code === 'Escape' && !locked && !game.helpOpen) { setPause(!game.paused); return; }
  // 一時停止中は R でこの戦をやり直す（確かめの札を出す）
  if (game.paused && code === 'KeyR' && !e.repeat) { document.getElementById('pm-retry')?.click(); return; }
  if (game.paused) return;
  game.hud.padMode = false;
  if (!e.repeat) input.edge.add(code);
  input.keys.add(code);
  if (code === 'KeyM' && !e.repeat) toggleBigMap();
  if (code === 'KeyL' && !e.repeat) game.hud.toggleLog();
  if (code === 'KeyB' && !e.repeat) game.hud.cycleMinimap();
  if (code === 'KeyU' && !e.repeat) { game.hud.root.classList.toggle('photo'); }
  if (code === 'KeyP' && !e.repeat) togglePhoto();
  if (code === 'Enter' && !e.repeat) game.battle.skip();
});
window.addEventListener('keyup', (e) => { const c = canonical(e.code); if (c) input.keys.delete(c); });
window.addEventListener('blur', () => input.clear());
let locked = false;
function requestLock() {
  if (game.noLock || !canvas.requestPointerLock) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { game.noLock = true; setPause(false); }); } catch (err) { game.noLock = true; }
}
// 出陣の釦を押した時（その押した勢いのうちに）マウスを捕まえる。だめでも noLock にはせず、下に小さな案内を出すだけ
// （しくじりは Promise と pointerlockerror の両方で届くことがあるので、2秒の間はどちらも「自動の試み」として扱う）
let autoTry = 0;
const autoTrying = () => performance.now() - autoTry < 2000;
function autoLock() {
  if (game.noLock || locked || !canvas.requestPointerLock) return;
  autoTry = performance.now();
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { if (game.battle) lockHint(true); }); } catch (err) { autoTry = 0; }
}
// 戦を始める：マウスを捕まえていれば（捕まえられない環境でも）そのまま始める。捕まえ損ねたら案内だけ出して始める
function beginPlay() {
  game.starting = false;
  setPause(false);
  if (!game.noLock && !locked) lockHint(true);
}
// 画面の下の小さな案内「画面を押すと視点を動かせます」（大きな一時停止の画面にはしない）
function lockHint(on) {
  let el = document.getElementById('lockhint');
  if (on && !el) {
    el = document.createElement('div');
    el.id = 'lockhint';
    el.setAttribute('role', 'status');
    el.textContent = '画面を押すと視点を動かせます';
    el.style.cssText = 'position:fixed;left:50%;bottom:calc(104px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:30;pointer-events:none;padding:8px 16px;background:rgba(20,18,15,.86);color:var(--washi,#ece4d2);border:1px solid var(--line,rgba(236,228,210,.16));border-radius:4px;font-size:14px;line-height:1.5;letter-spacing:.06em;white-space:nowrap';
    document.body.appendChild(el);
  }
  if (el) el.hidden = !on;
}
canvas.addEventListener('mousedown', (e) => {
  if (!game.battle || game.paused) return;
  initAudio();
  if (!locked && !game.noLock) { requestLock(); return; }
  if (e.button === 0) { input.mouseL = true; input.leftPressed = true; }
  if (e.button === 1) { input.lockPressed = true; e.preventDefault(); }
  if (e.button === 2) { input.mouseR = true; input.rightPressed = true; }
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) input.mouseL = false; if (e.button === 2) input.mouseR = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { if (game.battle && !game.paused) { input.wheel += e.deltaY; e.preventDefault(); } }, { passive: false });
window.addEventListener('mousemove', (e) => {
  if (!game.battle || game.paused) return;
  // ポインタロックが使えない環境ではマウス移動をそのまま視点に使う
  if (locked || game.noLock) { input.dx += e.movementX || 0; input.dy += e.movementY || 0; if (Math.abs(e.movementX) > 2) game.hud.padMode = false; }
});
// 戦の途中でページを閉じようとしたら確かめる
window.addEventListener('beforeunload', (e) => { if (game.battle && !game.battle.over) { e.preventDefault(); e.returnValue = ''; } });
// 思わぬ不具合が起きたら知らせる
window.addEventListener('error', (e) => {
  if (!game.battle) return;
  console.error(e.error || e.message);
  game.lastError = `${e.message}\n${(e.filename || '').split('/').pop()}:${e.lineno}\n戦：${BATTLES[game.battle.index] ? BATTLES[game.battle.index].name : '稽古'}　経過 ${Math.round(game.battle.t)}秒　場面 ${game.battle.phase}`;
  notice('問題が起きました。Esc メニューの「この戦をやり直す」で立て直せます');
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) { autoTry = 0; lockHint(false); }
  if (!locked && game.battle && !game.battle.over && !game.helpOpen && !game.mapOpen) setPause(true);
  if (locked) setPause(false);
});
document.addEventListener('pointerlockerror', () => { if (autoTrying()) { if (game.battle) lockHint(true); return; } game.noLock = true; setPause(false); });
// 別のタブに移ったら止める
document.addEventListener('visibilitychange', () => {
  duck(document.hidden);
  if (document.hidden && game.battle && !game.battle.over) setPause(true);
});

// 戦術マップ：開いている間はマウスを放し、クリックで組を向かわせる
function toggleBigMap() {
  // 信長で遊ぶ時は、味方の全部の隊を動かす「軍配の図」（gunbai.js）を開く
  if (game.battle && game.battle.lord) {
    const open = toggleGunbai(game.battle);
    game.mapOpen = game.cmdMap = open;
    if (open && locked && document.exitPointerLock) document.exitPointerLock();
    return;
  }
  game.hud.toggleMap();
  game.mapOpen = game.hud.bigmap;
  if (game.mapOpen && locked && document.exitPointerLock) document.exitPointerLock();
  if (!game.mapOpen && !game.noLock) requestLock();
}
setGunbaiHooks({ onClose: () => { game.mapOpen = game.cmdMap = false; if (game.battle && !game.noLock) requestLock(); } });
$('bigmap').addEventListener('click', (e) => {
  if (!game.battle) return;
  const pt = game.hud.mapToWorld($('bigmap'), e.clientX, e.clientY);
  game.battle.commandMoveTo(pt);
});
$('bigmap').addEventListener('wheel', (e) => { e.preventDefault(); game.hud.zoomBigmap(e.deltaY); }, { passive: false });
// 写真モードではホイールで画角
canvas.addEventListener('wheel', (e) => { if (!game.photo) return; camera.fov = Math.max(20, Math.min(90, camera.fov + e.deltaY * 0.02)); camera.updateProjectionMatrix(); }, { passive: true });

// 写真モード：時を止め、HUDを消して自由に視点を動かす
const FILTERS = ['', 'sepia(.55) contrast(1.05)', 'grayscale(1) contrast(1.25) brightness(1.05)', 'saturate(1.3) sepia(.2) hue-rotate(-10deg) brightness(1.05)'];
const FILTER_NAMES = ['そのまま', '古い絵巻', '墨絵', '夕映え'];
function photoUi() {
  const ph = game.photo;
  const el = $('photoui');
  el.hidden = !ph;
  if (ph) el.innerHTML = `<b>写真モード</b>　WASD 移動・Space/C 上下・マウス 見回す・ホイール 画角<br>1〜4 色合い（いま：${FILTER_NAMES[ph.filter]}）・H 自分を隠す・G 構図の線・K 撮る・P 戻る`;
}
function togglePhoto() {
  if (!game.battle) return;
  if (game.photo) {
    game.photo = null; game.hud.root.classList.remove('photo'); canvas.style.filter = ''; document.querySelector('.photogrid')?.remove();
    if (game.battle) game.battle.player.u.mesh.visible = true;
    camera.fov = S.fov; camera.updateProjectionMatrix();
    photoUi(); notice('写真モードを終えました'); return;
  }
  const c = camera.position;
  game.photo = { x: c.x, y: c.y, z: c.z, yaw: game.battle.player.yaw, pitch: game.battle.player.pitch, filter: 0 };
  game.hud.root.classList.add('photo');
  photoUi();
}
// 写真モードの操作（色合い・自分を隠す・構図の線・撮る）
function photoKey(code) {
  const ph = game.photo;
  const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
  if (i >= 0) { ph.filter = i; canvas.style.filter = FILTERS[i]; photoUi(); }
  if (code === 'KeyH') { const m = game.battle.player.u.mesh; m.visible = !m.visible; }
  if (code === 'KeyG') { const g = document.querySelector('.photogrid'); if (g) g.remove(); else { const d = document.createElement('div'); d.className = 'photogrid'; document.body.appendChild(d); } }
  if (code === 'KeyK') {
    renderer.render(game.battle.scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    const d = document.createElement('div');
    d.className = 'shot';
    d.innerHTML = `<img src="${url}" alt="撮った一枚" style="filter:${FILTERS[ph.filter]}"><p class="note">画像を右クリック（長押し）して保存できます。クリックで閉じる</p>`;
    d.onclick = () => d.remove();
    document.body.appendChild(d);
    sfx('ui');
  }
}
function updatePhoto(dt) {
  const ph = game.photo;
  ph.yaw -= input.dx * 0.0024 * S.sens;
  ph.pitch = Math.max(-1.3, Math.min(1.2, ph.pitch - input.dy * 0.0022 * S.sens));
  const fx = Math.sin(ph.yaw), fz = Math.cos(ph.yaw);
  const sp = (input.key('ShiftLeft') ? 12 : 5) * dt;
  if (input.key('KeyW')) { ph.x += fx * sp; ph.z += fz * sp; }
  if (input.key('KeyS')) { ph.x -= fx * sp; ph.z -= fz * sp; }
  if (input.key('KeyA')) { ph.x += Math.cos(ph.yaw) * sp; ph.z -= Math.sin(ph.yaw) * sp; }
  if (input.key('KeyD')) { ph.x -= Math.cos(ph.yaw) * sp; ph.z += Math.sin(ph.yaw) * sp; }
  if (input.key('Space')) ph.y += sp;
  if (input.key('KeyC')) ph.y -= sp;
  ph.y = Math.max(game.battle.world.heightAt(ph.x, ph.z) + 0.4, ph.y);
  camera.position.set(ph.x, ph.y, ph.z);
  const cp = Math.cos(ph.pitch);
  camera.lookAt(ph.x + Math.sin(ph.yaw) * cp, ph.y + Math.sin(ph.pitch), ph.z + Math.cos(ph.yaw) * cp);
}

// ---------------- ゲームパッド ----------------
const padPrev = [];
let padRun = false;
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (!gp) { input.axis = null; input.padL = input.padR = false; return; }
  const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
  const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const edge = (i) => b(i) && !padPrev[i];
  // 戦の外（タイトル・城下・評価）と一時停止中は、十字キーで釦を選び A で押す
  const menuOpen = !game.battle || game.paused;
  if (menuOpen) {
    const root = !$('pause').hidden ? $('pause') : $('screen');
    const items = [...root.querySelectorAll('button:not([disabled]), input, select, textarea')].filter((e) => e.offsetParent !== null);
    if (items.length) {
      let idx = items.indexOf(document.activeElement);
      const move = (d) => { idx = idx < 0 ? 0 : (idx + d + items.length) % items.length; items[idx].focus(); items[idx].scrollIntoView({ block: 'nearest' }); sfx('hover'); };
      if (edge(13) || edge(15)) move(1);
      if (edge(12) || edge(14)) move(-1);
      if (edge(0) && document.activeElement && items.includes(document.activeElement)) document.activeElement.click();
      if (edge(1)) { const back = root.querySelector('#st-close, #help-close, #pm-resume, #go-no, #nc-no'); if (back) back.click(); }
    }
  }
  if (edge(9)) { if (game.battle && !game.battle.over) setPause(!game.paused); }
  if (!game.paused && game.battle) {
    input.axis = { x: dz(gp.axes[0] || 0), y: dz(gp.axes[1] || 0) };
    input.dx += dz(gp.axes[2] || 0) * 16 * S.padSens;
    input.dy += dz(gp.axes[3] || 0) * 11 * S.padSens;
    input.padL = b(7) || b(5);
    if (edge(7) || edge(5)) input.leftPressed = true;
    input.padR = b(6);
    if (edge(6)) input.rightPressed = true;
    if (gp.buttons.some((x) => x.pressed) || Math.hypot(input.axis.x, input.axis.y) > 0.3) { game.hud.padMode = true; game.pad = gp; }
    const map = { 0: 'Space', 2: 'KeyE', 3: 'Tab', 4: 'KeyF' };
    // Y は押している間も「Tab を押している」ことにする（長押しで号令の輪）
    if (b(3)) input.keys.add('Tab'); else if (padPrev[3]) input.keys.delete('Tab');
    for (const [i, code] of Object.entries(map)) if (edge(+i)) input.edge.add(code);
    const dpad = { 12: 'follow', 14: 'hold', 15: 'attack', 13: 'retreat' };
    for (const [i, id] of Object.entries(dpad)) if (edge(+i)) input.quickCmd = id;
    if (edge(11)) input.lockPressed = true;
    if (edge(10)) padRun = !padRun;
    input.runHeld = padRun && Math.hypot(input.axis.x, input.axis.y) > 0.2;
    if (!input.runHeld && Math.hypot(input.axis.x, input.axis.y) < 0.2) padRun = false;
    if (edge(8)) game.hud.toggleMap();
  }
  gp.buttons.forEach((bt, i) => { padPrev[i] = bt.pressed; });
}
window.addEventListener('gamepadconnected', () => notice('ゲームパッドをつなぎました'));

// ---------------- 一時停止 ----------------
function setPause(on) {
  game.paused = on;
  if (on && window.speechSynthesis) speechSynthesis.cancel();
  if (!on && game.pendingIntro && game.battle) { const f = game.pendingIntro; game.pendingIntro = null; f(); }
  const el = $('pause');
  el.hidden = !on;
  input.clear();
  if (on && game.battle) {
    const b = game.battle;
    pauseMenu(el, {
      error: game.lastError,
      hud: game.hud,
      battle: b,
      title: game.starting ? `${b.def.title || BATTLES[b.index].name}　クリックで開始` : '一時停止',
      objectives: b.objectives, merit: b.tracker.total(), time: b.t, lines: b.tracker.lines(), difficulty: b.D.name,
      resume: () => { game.starting = false; setPause(false); requestLock(); },
      help: () => { toggleHelp(); },
      onSettings,
      retry: () => { game.G = JSON.parse(game.snapshot); if (b.def.mapCastle) game.startMapBattle(b.def.mapInfo, true); else game.startBattle(b.index); },
      title2: () => { game.G = JSON.parse(b.def.mapCastle ? game.mapSnap : game.snapshot); save(game.G); game.title(); },
    });
    silence();
    // メニューの外側をクリックしても再開できる
    el.onclick = (e) => { if (e.target === el) { game.starting = false; setPause(false); requestLock(); } };
  }
}
function toggleHelp() {
  game.helpOpen = !game.helpOpen;
  helpOverlay(game.helpOpen);
  input.clear();
  if (game.helpOpen) {
    game.paused = true;
    $('pause').hidden = true;
    if (document.exitPointerLock && locked) document.exitPointerLock();
    const c = document.getElementById('help-close');
    if (c) c.onclick = () => toggleHelp();
  } else if (game.noLock) setPause(false);
  else setPause(true);
}

// ---------------- 進行 ----------------
const STORY_BY = {
  nagashino: [
    (G) => ({ year: '天正三年（1575）五月　三河', title: '長篠城', text: [
      '甲斐の武田勝頼が一万五千の兵で三河へ攻め入り、寒狭川と宇連川の合わさる崖の上の城――長篠城を囲んだ。',
      '城を守るのは、武田から徳川へ寝返った若い城主・奥平信昌と、わずか五百の兵。',
      `その中に、名もなき足軽がひとり――${G.name}。`,
    ], button: '城の守りにつく' }),
    (G) => ({ year: '天正三年五月十四日　夜', title: '強右衛門', text: [
      '兵糧蔵を焼かれ、城は幾日も持たない。奥平信昌は、岡崎の家康へ後詰を願う使いを出すと決めた。',
      '名乗り出たのは、足軽の鳥居強右衛門。夜の闇にまぎれ、川に潜って武田の囲みをくぐるという。',
      `崖の下の川べりまで強右衛門を送った${G.name}に、信昌が命じる。「囲みの外まで供をせよ。見つかるな」`,
    ], button: '川へ入る' }),
    (G) => ({ year: '天正三年五月二十日　夜', title: '鳶ヶ巣山', text: [
      '織田信長と徳川家康の後詰が設楽原に着いた。軍議の席で、酒井忠次が進み出る。「長篠城を囲む鳶ヶ巣山の砦を、夜のうちに背から突きましょう」',
      '信長はその場では退けたが、夜になって忠次を呼び、自らの鉄砲衆を付けて送り出した。',
      `長篠城を抜けてきた${G.name}は、${RANKS[G.rank].name}として五人を預かり、その別働隊の中にいた。`,
    ], button: '夜の山へ' }),
    (G) => ({ year: '天正三年五月二十一日　朝', title: '設楽原', text: [
      '鳶ヶ巣山の砦が落ち、武田は背を断たれた。勝頼は退かず、前へ出ることを選んだ。',
      '連吾川の西、設楽原。川に沿って南北に長く、三重の馬防柵が結われている。鉄砲はその内に並ぶ。',
      G.rank === 0 ? `その柵の内に、槍を立てる徳川の足軽がひとり――${G.name}。` : `鳶ヶ巣山から駆け戻った${G.name}は、${RANKS[G.rank].name}として組を率い、大久保忠世の手で柵の内に立つ。`,
    ], button: '柵の内へ' }),
    (G) => ({ year: '天正三年（1575）八月　遠江', title: '諏訪原城', text: [
      '長篠で宿将の多くを失い、武田家中は揺れていた。家康はこの機を逃さず、遠江へ攻め入る。',
      '狙うは大井川を見下ろす台地の山城、諏訪原城。丸い馬出と三日月の堀に守られた、武田の遠江の要である。',
      `${G.name}は${RANKS[G.rank].name}として、城攻めの先手に加わった。`,
    ], button: '城を囲む' }),
  ],
};
const TIPS_BATTLE_BY = {
  nagashino: [
    `塀の内から槍で突け。兵糧蔵の火は${isTouch ? '「取る」を長押しして' : ' E を長押しして'}消せ。夜は強右衛門を川まで送り出せ`,
    '松明の扇に入らず、流れに身を沈めて下れ。走れば足音で気づかれる。鳴子の縄は番の目がそれた隙に切れ',
    '声を立てずに山を進み、法螺の合図で一斉にかかれ。木戸が破れるまでは矢の届かぬ控え場で待ち、砦は一つずつ落とせ',
    '柵の外へは出ず、柵に取り付いた敵を隙間から槍で突け。山県・内藤・真田の三つの寄せを凌げば勝頼は退く。追い討ちの下知があれば虎口から打って出よ',
    '丸馬出から打って出る敵を受け止め、門が破れたら組をまとめて本曲輪へ押し込め',
  ],
};
// 長篠のほかの三つの筋書き（今は幕開けの一戦ずつ）
STORY_BY.nobunaga_hoi = [
  (G) => ({ year: '元亀元年（1570）四月　越前', title: '金ヶ崎', text: [
    '織田信長は三万の兵で越前へ攻め入り、朝倉方の手筒山城と金ヶ崎城を落とした。一乗谷まで、あと一息。',
    'そこへ思いもよらぬ知らせが届く。妹・お市の夫、北近江の浅井長政が朝倉方についた――前に朝倉、後ろに浅井。',
    `信長はわずかな供で京へ逃れ、金ヶ崎には殿（しんがり）が残る。木下藤吉郎（のちの羽柴秀吉）の手に、名もなき足軽がひとり――${G.name}。`,
  ], button: '殿につく' }),
  (G) => ({ year: '元亀元年（1570）六月　近江', title: '姉川', text: [
    '越前の朝倉を攻めた信長は、義弟・浅井長政の裏切りにあい、金ヶ崎から命からがら京へ逃れた。',
    'ふた月の後、信長は徳川家康と共に近江へ攻め入る。浅井・朝倉は姉川の北に陣を布いた。川を挟んで、西の瀬に徳川と朝倉、東に織田と浅井。',
    `織田の幾重もの段の中、森可成の手に、名もなき足軽がひとり――${G.name}。`,
  ], button: '川原へ' }),
  (G) => ({ year: '元亀二年（1571）九月　近江', title: '比叡山', text: [
    '姉川の後も、浅井・朝倉は屈しなかった。前の年の秋、比叡山延暦寺は両家の兵を山にかくまい、織田勢は志賀で足止めされた。',
    '信長は延暦寺に、味方せぬならせめて中立を、と求めたが、山は応じなかった。そして九月、織田勢三万が坂本に集まる。',
    `明智光秀の手に、${G.rank ? `${RANKS[G.rank].name}となった` : '足軽の'}${G.name}がいた。`,
  ], button: '山道へ' }),
];
STORY_BY.sekigahara = [
  (G) => ({ year: '慶長五年（1600）九月十五日　美濃', title: '関ヶ原', text: [
    '太閤の死から二年。石田三成は毛利輝元を大将に立てて兵を挙げ、徳川家康は会津から軍を返した。東軍七万余、西軍八万余が、美濃の関ヶ原に集まる。',
    '夜来の雨が上がり、谷は深い朝霧に沈んでいる。南の松尾山には小早川秀秋の一万五千。東西どちらにつくのか、誰にも分からない。',
    `東軍の藤堂高虎の手に、名もなき足軽がひとり――${G.name}。`,
  ], button: '霧の中へ' }),
];
STORY_BY.osaka = [
  (G) => ({ year: '慶長十九年（1614）十二月　摂津', title: '真田丸', text: [
    '方広寺の鐘の銘をきっかけに、徳川と豊臣は手切れとなった。大坂城には浪人が集まり、徳川の大軍がそのまわりを埋めている。',
    '城の南、守りの薄い所に、真田信繁（幸村）が出丸を築いた。空堀と柵と櫓に鉄砲を並べた砦――人はそれを真田丸と呼ぶ。',
    `その正面に陣を構える前田利常の手に、名もなき足軽がひとり――${G.name}。`,
  ], button: '篠山へ' }),
  (G) => ({ year: '慶長二十年（1615）五月六日　河内', title: '道明寺', text: [
    '冬の陣の和睦で、大坂城の堀は埋められた。裸の城では守れない。豊臣方は城を出て、大和から来る徳川勢を迎え撃つと決めた。',
    '先手の後藤又兵衛は、夜のうちに石川を渡って小松山に登った。続くはずの真田・毛利の兵は、濃い霧の中でまだ見えない。',
    `大和口の先手、水野勝成の手に、${G.rank ? `${RANKS[G.rank].name}として組を率いる` : '名もなき足軽の'}${G.name}がいた。`,
  ], button: '霧の中へ' }),
];
TIPS_BATTLE_BY.nobunaga_hoi = ['殿は勝つ戦ではなく退く戦。備を離れて追わず、「退け」の下知が出たら次の備へ走れ', '下知があるまで川を渡らず、森の備で槍を揃えて浅井を受け止めよ。首を提げた怪しい武者に気をつけよ', '門を破る組を守れ。刃向かう僧兵とだけ戦い、逃げる僧や里の者は追うな'];
TIPS_BATTLE_BY.sekigahara = ['霧の中では藤堂の旗から離れるな。小早川が動いたら大谷勢を押し、島津の殿を崩せ'];
TIPS_BATTLE_BY.osaka = ['篠山を取ったら上で止まれ（その先は塀の鉄砲が届く）。柵を破る組を守り、退けの下知が出たら、殿として真田の打って出を食い止めよ', '霧の中は水野の旗から離れるな。又兵衛の駆け下りは槍を揃えて受けよ。薄田の新手は瀬で止め、石川は渡るな'];
// 戦の並びは筋書きの「作り終えた戦」で変わるので、物語の札と心得は戦の id で引く
const IDS_BY = {
  nagashino: ['nagashinojo', 'sune', 'tobinosu', 'shitaragahara', 'suwahara'],
  nobunaga_hoi: ['kanegasaki', 'anegawa', 'hieizan'],
  sekigahara: ['sekigahara'],
  osaka: ['sanadamaru', 'domyoji'],
};
const idxIn = (i) => { const ids = IDS_BY[scenarioKey()]; return ids ? ids.indexOf(BATTLES[i].id) : i; };
const storyOf = (i) => STORY_BY[scenarioKey()][idxIn(i)];
const tipOf = (i) => TIPS_BATTLE_BY[scenarioKey()][idxIn(i)];
STORY_BY.okehazama = [
  (G) => ({ year: '永禄三年（1560）五月　尾張', title: '桶狭間', text: [
    '駿河・遠江・三河を治める今川義元が、二万を超える大軍で尾張へ攻め入った。',
    '迎え撃つ織田の兵は、わずか数千。',
    `その中に、名もなき足軽がひとり――${G.name}。`,
  ], button: '中島砦へ' }),
  (G) => ({ year: '翌年　永禄四年（1561）五月　美濃', title: '森部', text: [
    '美濃の斎藤義龍が急死した。信長はその機を逃さず、美濃へ兵を出す。',
    `桶狭間の働きを認められた${G.name}は、${RANKS[G.rank].name}として、初めて五人の足軽を預かることになった。`,
  ], button: '出陣' }),
  (G) => ({ year: '五年後　永禄九年（1566）九月　美濃', title: '墨俣', text: [
    '美濃攻めは難航していた。長良川の西岸、墨俣に砦を築く――その普請を任されたのは、木下藤吉郎という男であった。',
    `小競り合いを重ねた${G.name}は、${RANKS[G.rank].name}として${RANKS[G.rank].squad}人の組を率い、砦の守りにつく。`,
  ], button: '墨俣へ' }),
];

const TIPS = [
  '桶狭間では、信長が「首は取るな、討ち捨てにせよ」と命じたと『信長公記』は伝えています。',
  '敵の頭上に「！」が出たら攻撃の合図。その直前に右クリックで構えると受け流しになります。',
  '敵足軽を倒すだけでは戦功に上限があります。任務・救援・側面攻撃のほうが大きな手柄です。',
  'Z・X・C・N で、Tab を開かずに組へ号令できます。',
  'V で、自分の目で見る一人称と、背中から見る三人称を切り替えられます。',
  '士気が尽きた部隊は崩れて逃げ出します。横や後ろから突くと士気が大きく下がります。',
  'Q で敵を狙い定めると、乱戦でも相手を見失いません。',
  '深追いは「勝手な追撃」として減点されます。上官の言う線を越えないように。',
  '合印は組の旗印です。戦場で自分の後ろに並ぶ旗が、出世の証になります。',
  '森部の戦い（1561年）では、斎藤方の日比野下野守・長井甲斐守らが討ち取られました。',
  '墨俣の「一夜城」は伝承の色が濃い話です。この試作では「墨俣の砦普請」として扱っています。',
  '左を押し続けて離すと溜め突き。敵の構えを破り、大きな傷を与えます。',
  '打刀は構えながら左で突き。受け流しの猶予も槍より長めです。',
  '生き残った部下は古参になり、次の戦で強くなります。城下の「組」で名簿を見られます。',
  '敵の武将が近くにいると、画面下に名前と体力が出ます。',
  '敵も正面からの突きを構えて防ぎます。横や後ろ、薙ぎ払いを使い分けましょう。',
  '難易度「難」では、重傷を負うとそのまま討死します。',
  '「組の稽古」で部下全員の練度を上げられます（城下ごとに一度）。',
  '部隊長（侍）を討つと、その部隊は混乱し、士気も大きく下がります。',
  '散開した組は矢に当たりにくく、縦陣は移動が速くなります。',
  '設定でキー割り当て・UIの大きさ・色覚に配慮した配色を変えられます。',
];

// この戦の心得（物語の幕間に添える）
TIPS_BATTLE_BY.okehazama = ['列を離れず、合図を待ち、首は取らずに突き崩せ。本陣の旗本は固い。ひとりで斬り込まず、味方と囲め', '五人の部下を指示地点に揃え、法螺貝を待ってから横腹を突け', '柵の内から槍で突き、機を見て門から打って出よ。二の手の時は南の門から出て荷駄を迎えよ'];

// どの遊び方でも、戦の始まりに視点の切り替えを知らせる
const VIEW_TIP = () => (matchMedia('(pointer: coarse)').matches ? '左上の「視点」で一人称・三人称' : 'V で一人称・三人称');
const LORD_TIP = () => (matchMedia('(pointer: coarse)').matches ? '左上の「地図」で軍配の図（味方の全部の隊を動かす）、「使番」で近くの備へ下知' : 'M で軍配の図（味方の全部の隊を動かす）・J で使番・Tab で旗本へ号令');

let curG = null;
const game = {
  // 遊ぶ保存が替わるたびに、その保存の筋書き（戦の並び）へ切り替える
  get G() { return curG; },
  set G(v) { curG = v; if (v) setScenario(v.scenario || 'okehazama'); },
  hud: new Hud(), camera, battle: null, paused: false, helpOpen: false, lastResult: null, snapshot: null, noLock: false, hitstop: 0, starting: false, bg: null,

  // ゲームパッドの振動
  vibrate(strength, ms) {
    if (!S.vibrate || !this.pad || !this.pad.vibrationActuator) return;
    try { this.pad.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }); } catch (e) { /* 非対応 */ }
  },

  title() {
    // 本物の人・馬・胴丸は、題の画面のうちに読み始める（戦の始めに軽い形のまま出ないように）
    if (!/[?&]norender/.test(location.search)) setTimeout(() => { try { loadHumans(); loadHorse(); loadDomaru(); } catch (e) { /* 読めなければ軽い形のまま */ } }, 1500);
    closeJapan();
    this.stopBattle();
    this.inTown = false;
    townMusic(false);
    playMusic('title');
    this.bg = titleScene();
    const saved = load();
    if (saved) setScenario(saved.scenario || 'okehazama');
    titleScreen(saved,
      (name, diff, scn) => { initAudio(); this.G = newGame(name, diff, scn); save(this.G); this.bg = null; this.story(0); },
      () => { initAudio(); this.G = saved; this.bg = null; this.resume(); },
      () => settingsScreen(onSettings, () => this.title()),
      (G) => { initAudio(); G.slot = S.slot; this.G = G; save(G); this.bg = null; notice('保存コードから読み込みました'); this.resume(); },
      (i, del) => { if (del) { clearSave(i); notice('この枠の記録を消しました'); } S.slot = i; saveSettings(); this.title(); },
      (i) => {
        // 章を選んで遊ぶ（記録は残さない）
        initAudio();
        const G = JSON.parse(JSON.stringify(saved));
        G.practice = true; G.injured = false;
        this.G = G; this.bg = null; this.story(i);
      },
      () => { initAudio(); this.startDojo(); },
      () => recordsScreen(() => this.title()),
      () => this.ladder('title'),
      () => { initAudio(); this.japanMap('title'); },
      (k, id) => { initAudio(); this.startAsSamurai(k, id); },
      {
        // 織田信長で出陣（戦を選ぶ・視点を選ぶ）と、天下の地図で織田家を率いる
        list: LORD_BATTLES,
        onBattle: (id, view) => { initAudio(); this.startAsNobunaga(id, view); },
        onMap: (k) => { initAudio(); this.japanAsLord(k); },
      });
  },

  resume() {
    const G = this.G;
    if (G.battle >= BATTLES.length) finalScreen(G, () => this.title(), () => this.japanMap('final'));
    else if (G.battle === 0) this.story(0);
    else this.base();
  },

  story(i) {
    // 信長で遊ぶ時は、信長の立場の札
    const L = this.G.lord && lordOf(BATTLES[i].id);
    if (L) { storyCard({ year: L.year, title: L.name, text: L.goal ? [...L.text, `任務：${L.goal}`] : L.text, button: L.button, tips: L.tip }, () => this.startBattle(i)); return; }
    storyCard({ ...storyOf(i)(this.G), tips: tipOf(i) }, () => this.startBattle(i));
  },

  startBattle(i) {
    this.bg = null;
    this.inTown = false;
    townMusic(false);
    playMusic('prebattle');
    // 組の名簿を身分の人数に合わせる
    const n = RANKS[this.G.rank].squad;
    if (n > 0) { const bows = this.bowsFor(n, i); fillRoster(this.G, n - bows, bows); }
    this.snapshot = JSON.stringify(this.G);
    const LB = this.G.lord && lordOf(BATTLES[i].id);
    $('tip').innerHTML = `この戦の心得：${LB ? LB.tip : tipOf(i)}<br><span style="opacity:.7">${VIEW_TIP()}</span><br><span style="opacity:.7">${LB ? LORD_TIP() : TIPS[Math.floor(Math.random() * TIPS.length)]}</span>`;
    $('loading').hidden = false;
    hideScreen();
    this.stopBattle();
    autoLock();
    setTimeout(() => {
      this.battle = new Battle(this, i, this.G.lord ? lordDef(BATTLE_DEFS[i], BATTLES[i].id) : BATTLE_DEFS[i]);
      applyLord(this.battle);
      this.hud.show(true);
      // 最初の一枚を描いてから表示（カメラが原点を向いた画面を見せない）
      this.battle.player.updateCamera(1, camera);
      renderer.render(this.battle.scene, camera);
      $('loading').hidden = true;
      const def = BATTLE_DEFS[i];
      // 開戦の大見出しは、始めの一時停止を解いた瞬間に出す
      this.pendingIntro = () => { if (def.sides) this.hud.intro(def.sides, BATTLES[i].name, def.date(this.battle).split('　')[0]); else this.hud.banner(BATTLES[i].name, BATTLES[i].year); sfx('horagai', 0.6); };
      sfx('taiko', 0.8);
      beginPlay();
      fpsLog.length = 0;
    }, 60);
  },

  stopBattle() {
    if (this.battle) { this.battle.dispose(); this.battle = null; }
    lockHint(false);
    if (window.speechSynthesis) speechSynthesis.cancel();
    canvas.style.filter = ''; document.querySelector('.photogrid')?.remove(); $('photoui').hidden = true;
    this.photo = null; this.mapOpen = false; this.slowmo = 0;
    this.hud.root.classList.remove('photo');
    this.hud.show(false);
    silence();
    if (document.exitPointerLock && locked) document.exitPointerLock();
    $('pause').hidden = true;
    this.paused = false;
  },

  endBattle(b) {
    zukanRecord(b, this.G);   // 図鑑：会った武将と実績を記す
    if (b.def.mapCastle) { this.endMapBattle(b); return; }
    const G = this.G;
    const i = b.index;
    if (b.def.dojo) {
      const k = b.flags.kills || 0, w = b.flags.wave || 0, t = b.t;
      this.stopBattle();
      const st = this.dojoStep;
      dojoResult(k, w, t, () => this.startDojo(st), () => this.title(), st, st != null ? () => this.ladder() : null);
      return;
    }
    // 難易度「難」の討死
    if (b.result && b.result.dead) {
      this.stopBattle();
      if (!G.practice) clearSave();
      playMusic('defeat');
      deathScreen(G, BATTLES[i].name, () => this.title());
      return;
    }
    const gBefore = JSON.parse(JSON.stringify(G));
    const prevTotal = i > 0 && G.history[i - 1] ? G.history[i - 1].total : undefined;
    const r = settle(G, b.tracker, i);
    r.prevTotal = prevTotal;
    r.stats = { ...b.stats, time: b.t, squad: b.squad.length, squadAlive: b.squad.filter((s) => s.alive).length };
    r.history = b.def.history;
    // 名簿を更新（生き残りは戦歴+1、討たれた者は名簿から外す）
    const fallen = [];
    let top = null;
    for (const u of b.squad) {
      if (!u.roster) continue;
      u.roster.kills += u.kills || 0;
      if (u.alive) u.roster.battles++;
      else { u.roster.alive = false; fallen.push(u.roster.name); if (u.roster.special === 'yashichi') { G.rel.yashichi.like = Math.max(0, G.rel.yashichi.like - 20); } }
      if (!top || (u.kills || 0) > (top.kills || 0)) top = u;
    }
    G.fallen = (G.fallen || []).concat(fallen);
    if (b.squad.length) r.squadReport = `${fallen.length ? `討たれた者：${fallen.join('、')}。` : '一人も欠けることなく戦い抜いた。'}${top && top.kills ? `一番の働きは${top.name}（${top.kills}人を討つ）。` : ''}`;
    // 称号（戦の終わりに判定するもの）
    const before = new Set(G.titles);
    G.life.parries += b.stats.parries; G.life.thirds += b.stats.thirds; G.life.kills += b.stats.kills; G.life.violations += b.tracker.violations.length;
    const grant = (id) => { if (!G.titles.includes(id)) G.titles.push(id); };
    if (b.squad.length && !fallen.length && r.mainDone) grant('allAlive');
    if (G.life.thirds >= 20) grant('combo');
    if ((G.roster || []).some((x) => x.alive && x.battles >= 3)) grant('veteran');
    if (i === BATTLES.length - 1 && G.life.violations === 0) grant('noViolation');
    if (G.rank >= 4) grant('taisho');
    void before;
    r.newTitles = G.titles.filter((id) => !b.titlesAtStart.includes(id));
    // 次の戦への心得（数から一つだけ選ぶ）
    const lines = r.lines;
    const has = (lb) => lines.some((l) => l.label === lb);
    if (b.squad.length && b.squad.filter((x) => x.alive).length / b.squad.length < 0.5) r.advice = '組が崩れる前に「退け」で立て直し、「待て」で守りを固めると、生存の戦功が大きい。';
    else if (has('命令違反')) r.advice = '上官の下知に背くと、戦功も評価も下がる。合図を待つのも手柄のうち。';
    else if (b.squad.length && !has('側面攻撃成功')) r.advice = '敵の向きを見て、横や後ろから組ごと突くと「側面攻撃」の大きな戦功になる。';
    else if (b.stats.kills >= 20) r.advice = '敵足軽を討つ戦功には上限がある。任務や救援、指揮で手柄を稼ごう。';
    else if (!b.stats.parries) r.advice = '敵の頭上に「！」が出た直前に構えると受け流しになり、次の一撃が大きくなる。';
    else r.advice = '見事な働き。この調子で組を育てよう。';
    // 上官のひとこと
    // 上官のひとこと：筋書きごとの顔ぶれ
    const BOSS_BY = { nagashino: ['奥平信昌', '奥平信昌', '酒井忠次', '大久保忠世', '大久保忠世'], nobunaga_hoi: ['木下藤吉郎', '森可成', '明智光秀'], sekigahara: ['藤堂高虎'], osaka: ['山崎長徳', '水野勝成'], okehazama: ['組頭 源八', '足軽大将 大沢勘兵衛', '木下藤吉郎'] };
    const boss = (BOSS_BY[scenarioKey()] || [])[idxIn(i)] || '上官';
    r.bossLine = G.lord ? ['家臣一同', !r.mainDone ? '……殿、ここは一度退いて立て直しましょうぞ' : r.total >= 130 ? '殿、お見事にございます。天下に名が響きましょう' : '殿、勝ち戦にございます'] : [boss, !r.mainDone ? '……次は、しかと務めを果たせ' : r.total >= 150 ? 'ようやった。これほどの働き、殿にも申し上げておく' : r.total >= 110 ? '見事じゃ。この調子で励め' : 'まずまずじゃな。まだ伸びる'];
    // 負けが続いたら「易しくして再挑戦」を示す
    this.fails = this.fails || {};
    if (!r.mainDone) this.fails[i] = (this.fails[i] || 0) + 1;
    // 日誌
    G.journal = G.journal || [];
    G.journal.push({ m: b.def.sides ? b.def.sides.b.mon : undefined, t: `${BATTLES[i].year}　${BATTLES[i].name}`, s: `戦功${r.total}。${r.promoted ? `${RANKS[r.rankAfter].name}に取り立てられた。` : ''}${r.squadReport || ''}` });
    G.best = G.best || [];
    r.best = G.best[i] || 0;
    G.best[i] = Math.max(G.best[i] || 0, r.total);
    this.lastResult = r;
    this.stopBattle();
    G.battle = i + 1;
    G.actions = 2;
    G.talked = {};
    const retry = { label: 'この戦をやり直す', fn: () => { this.G = JSON.parse(this.snapshot); this.story(i); } };
    const actions = [];
    const show = () => spoilHorseScreen(G, b.player, () => evalScreen(G, r, actions));   // 分捕った馬があれば、持ち帰るかを先に聞く
    if (!r.mainDone && this.fails[i] >= 1 && G.difficulty !== 'easy') {
      actions.push({ label: '易しくして再挑戦', fn: () => { this.G = JSON.parse(this.snapshot); this.G.difficulty = 'easy'; notice('難易度を「易」にしました'); this.story(i); } });
    }
    if (G.practice) {
      actions.push({ label: 'タイトルへ', primary: true, fn: () => this.title() });
      actions.push(retry);
    } else if (i === 0 && G.rank === 0) {
      actions.push({ label: `${BATTLES[0].name.replace(/の戦い$/, '')}に再挑戦する`, primary: true, fn: retry.fn });
      actions.push({ label: 'タイトルへ', fn: () => this.title() });
    } else if (i === BATTLES.length - 1) {
      save(G);
      actions.push({ label: '後日譚へ', primary: true, fn: () => epilogueScreen(G, () => finalScreen(G, () => this.title(), () => this.japanMap('final'))) });
      actions.push(retry);
    } else {
      save(G);
      actions.push({ label: '城下へ戻る', primary: true, fn: () => (G.rank >= 1 && !G.aijirushi ? aijirushiScreen(G, () => { save(G); this.base(); }) : this.base()) });
      actions.push(retry);
    }
    // 戦の後の曲：昇進なら華やかに、勝てば凱歌、しくじれば尺八の一節
    playMusic(r.promoted ? 'promote' : r.mainDone ? 'victory' : 'defeat', { delay: 1 });
    // 昇進したら、まず昇進の場面を見せる
    if (r.promoted && !G.lord) promoScreen(gBefore, G, r, show);
    else show();
  },

  base() {
    closeJapan();
    this.inTown = true;
    townMusic(S.townMusic);
    // 欠けた分の足軽を補充し、知らせる
    const n = RANKS[this.G.rank].squad;
    if (n > 0) {
      const bows = this.bowsFor(n, this.G.battle);
      const added = fillRoster(this.G, n - bows, bows);
      this.G.recruitsNote = added.length ? `新たに加わった者：${added.map((a) => a.name).join('、')}` : '';
    }
    save(this.G);
    baseScreen(this.G, this.G.battle, this.lastResult, this);
  },

  nextBattle() { this.story(this.G.battle); },

  // 出世の道：いまの枠の身分で見る。段を選んで稽古場で試せる
  ladder(from = 'title') {
    const G = from === 'town' && this.G ? this.G : (load() || newGame('名無し'));
    ladderScreen(G, () => (from === 'town' ? this.base() : this.title()), (step) => { initAudio(); this.startDojo(step); });
  },

  // 侍大将で出陣（試し）：身分・装備・組を侍大将のものにして、選んだ戦へ（記録は残さない）
  startAsSamurai(k, id) {
    const G = newGame((load() || {}).name || '弥五郎', 'normal', k);
    G.practice = true; G.injured = false;
    G.rank = 4; G.trialStep = 3; G.merit = 400;
    G.stats = { spear: 3, vit: 3, lead: 3 };
    G.owned = [...new Set([...G.owned, 'spear2', 'hat3', 'body2', 'kote', 'haidate', 'suneate', 'haori', 'katana'])];
    Object.assign(G.equip, { weapon: 'spear2', hat: 'hat3', body: 'body2', arm: 'kote', thigh: 'haidate', shin: 'suneate', coat: 'haori' });
    G.aijirushi = G.aijirushi || 'maru';
    this.G = G;
    fillRoster(G, 20, 10);
    const i = Math.max(0, BATTLES.findIndex((b) => b.id === id));
    G.battle = i;
    this.story(i);
  },

  // 織田信長で出陣（記録は残さない）：選んだ戦へ、選んだ視点で
  startAsNobunaga(id, view) {
    const L = lordOf(id);
    if (!L) return;
    if (view === 'first' || view === 'third') { S.view = view; saveSettings(); }
    const G = lordGame(L.scn);
    this.G = G;
    const i = Math.max(0, BATTLES.findIndex((b) => b.id === id));
    G.battle = i;
    this.story(i);
  },

  // 天下の地図で織田家を率いる（国持・当主。記録は残さない）。k は地図の筋書き（nagashino＝天正三年・hoi＝元亀元年）
  japanAsLord(k) {
    const G = lordGame(k === 'hoi' ? 'nobunaga_hoi' : 'nagashino');
    G.japan = null;
    this.G = G;
    this.japanMap('title', true);
  },

  // 稽古場：いまの枠の身分・装備で（記録は残さない）
  // step を渡すと、出世の道のその段の姿（馬・甲冑）で試す
  startDojo(step = null) {
    const saved = load();
    const G = saved ? JSON.parse(JSON.stringify(saved)) : newGame('稽古人');
    G.practice = true; G.injured = false;
    if (step != null) { G.trialStep = step; G.rank = Math.max(G.rank, step >= 2 ? 4 : step === 1 ? 2 : 0); }
    this.dojoStep = step;
    this.G = G;
    this.bg = null;
    this.inTown = false; townMusic(false);
    hideScreen();
    this.stopBattle();
    autoLock();
    $('loading').hidden = false;
    $('tip').textContent = '押し寄せる寄せ手を、倒れるまで何人討てるか。陣と陣の合間に少し回復します。';
    setTimeout(() => {
      this.battle = new Battle(this, 3, dojo);
      this.hud.show(true);
      this.battle.player.updateCamera(1, camera);
      $('loading').hidden = true;
      this.pendingIntro = () => this.hud.banner('稽古場', '腕試し');
      beginPlay();
    }, 60);
  },

  // ---------------- 日本地図 ----------------
  // 城下（足軽大将から、または筋書きを終えた後）とタイトルの「日本地図（試し）」から開く
  // タイトルから開くときは、保存が足軽大将以上か筋書きを終えていればその保存で（地図の進みも残る）、そうでなければ試し（残らない）
  japanMap(from = 'town', keep = false) {
    this.stopBattle();
    this.bg = null;
    this.inTown = from === 'town';
    if (from === 'title' && !keep) {
      const saved = load();
      const done = saved && saved.battle >= (SCENARIOS[saved.scenario || 'okehazama'] || SCENARIOS.okehazama).battles.length;
      if (saved && (saved.rank >= 4 || done)) this.G = saved;
      else { const G = saved ? JSON.parse(JSON.stringify(saved)) : newGame('名無し'); G.practice = true; G.injured = false; this.G = G; }
    }
    this.mapFrom = from;
    const G = this.G;
    playMusic('map');
    japanScreen(G, {
      from, practice: !!G.practice, result: this.mapResult || null,
      onBack: () => { this.mapResult = null; if (from === 'town') this.base(); else if (from === 'final') finalScreen(G, () => this.title(), () => this.japanMap('final')); else this.title(); },
      onAttack: (info) => { this.mapResult = null; this.startMapBattle(info); },
      onSave: () => save(G),
    });
    this.mapResult = null;
  },

  // 地図から出陣する城攻め（BATTLES の並びには入れない。戦功・昇進・戦の進みは変えない）
  startMapBattle(info, again = false) {
    this.bg = null;
    this.inTown = false;
    townMusic(false);
    playMusic('prebattle');
    closeJapan();
    // 戦の前の姿を取っておき、戦のあとはこれに地図の進みだけを足す（重傷・称号・名簿は地図の戦で変えない）
    if (!again) this.mapSnap = JSON.stringify(this.G);
    const G = this.G;
    const n = Math.max(15, RANKS[G.rank].squad);
    const bows = Math.round(n * (G.bowRatio ?? 0.33));
    fillRoster(G, n - bows, bows);
    this.snapshot = JSON.stringify(G);
    const def = castleBattle(info);
    $('tip').innerHTML = `${VIEW_TIP()}<br>${info.defend ? 'この戦の心得：塀に掛かった梯子は E 長押しで突き落とす。門の内で E 長押しで石を落とせ。本丸の門を破られたら落城' : 'この戦の心得：竹束を押して寄り、門に寄って E を長く押し、掛矢で門を打ち破れ。塀の内の射手と、搦手からの出撃に気をつけよ'}<br><span style="opacity:.7">${TIPS[Math.floor(Math.random() * TIPS.length)]}</span>`;
    $('loading').hidden = false;
    hideScreen();
    this.stopBattle();
    autoLock();
    setTimeout(() => {
      this.battle = new Battle(this, 0, def);
      applyLord(this.battle);
      this.hud.show(true);
      this.battle.player.updateCamera(1, camera);
      renderer.render(this.battle.scene, camera);
      $('loading').hidden = true;
      this.pendingIntro = () => { this.hud.intro(def.sides, def.title, info.date); sfx('horagai', 0.6); };
      sfx('taiko', 0.8);
      beginPlay();
      fpsLog.length = 0;
    }, 60);
  },

  endMapBattle(b) {
    const info = b.def.mapInfo;
    const won = b.tracker.main === true && !(b.result && b.result.down);
    const stats = { kills: b.stats.kills, t: b.t };
    this.stopBattle();
    // 戦の前の姿に戻し、地図の進みだけを書く
    const G = JSON.parse(this.mapSnap);
    this.G = G;
    japanResult(G, info, won);
    save(G);
    this.mapResult = { won, castle: info.castle, castleId: info.castleId, atk: info.atk.name, def: info.def.name, date: `${info.date} ${info.season}`, ...stats };
    this.japanMap(this.mapFrom || 'town', true);
  },

  // 組の弓の割合（城下の「組の編成」で決める）
  bowsFor(n, i) { return i >= 2 ? Math.round(n * (this.G.bowRatio ?? 0.33)) : 0; },
};
window.__game = game;
try { initCount(game); } catch (e) { /* 数えが動かなくても遊べる */ }
game.renderer = renderer;   // 開発用（描画の重さを計る）

// ---------------- ループ ----------------
const clock = new THREE.Clock();
let fpsT = 0, frames = 0;
const fpsLog = [];
let autoLowered = false;
let capAcc = 0;
function loop() {
  requestAnimationFrame(loop);
  // 描画の上限（省電力）
  if (S.fpsCap) { capAcc += clock.getDelta(); if (capAcc < 1 / S.fpsCap - 0.002) return; }
  const real = Math.min(0.05, S.fpsCap ? capAcc : clock.getDelta());
  capAcc = 0;
  let dt = real;
  const b = game.battle;
  pollPad();
  touchFrame(real);
  if (b) {
    // 攻撃が当たった瞬間のわずかな溜め（ヒットストップ）。「動きを減らす」では使わない
    if (game.hitstop > 0) { game.hitstop -= dt; if (!S.reduceMotion) dt *= 0.12; }
    // 受け流し・武将討ちの瞬間はゆっくり
    if (game.slowmo > 0) { game.slowmo -= real; if (!S.reduceMotion) dt *= 0.35; }
    // 軍配の図を開いている間は、時がゆっくり流れる
    if (game.cmdMap && isGunbaiOpen()) dt *= 0.15;
    b.world.distMul = S.drawDist;
    if (game.photo && !game.paused) updatePhoto(real);
    else if (!game.paused) b.update(dt, input);
    if (b.lord) { lordFrame(b); gunbaiFrame(b, real); }
    if (b.noboriFlags) for (let i = 0; i < b.noboriFlags.length; i++) b.noboriFlags[i].rotation.y = Math.sin(b.t * 1.6 + i * 1.3) * 0.18;
    draw(b.scene);
    frames++; fpsT += real;
    if (fpsT > 1) {
      $('fps').textContent = `${frames} fps ・ 兵 ${b.army.units.filter((u) => u.alive).length} ・ 解像度 ${Math.round(resScale * 100)}%`;
      if (!game.paused) fpsLog.push(frames);
      // 動的解像度：重いときは描画解像度を少し下げ、軽くなれば戻す
      if (!game.paused && fpsLog.length >= 3) {
        const recent = fpsLog.slice(-3).reduce((a, v) => a + v, 0) / 3;
        if (recent < 40 && resScale > 0.7) { resScale = Math.max(0.7, resScale - 0.1); applyRenderSettings(); }
        else if (recent > 57 && resScale < 1) { resScale = Math.min(1, resScale + 0.05); applyRenderSettings(); }
      }
      frames = 0; fpsT = 0;
      // 重いときは一度だけ画質を自動で下げる
      if (!autoLowered && fpsLog.length >= 6 && S.quality !== 'low') {
        const avg = fpsLog.slice(-6).reduce((a, v) => a + v, 0) / 6;
        if (avg < 32) {
          autoLowered = true;
          S.quality = S.quality === 'high' ? 'mid' : 'low';
          saveSettings();
          onSettings('quality');
          notice(`動きが重いため画質を「${S.quality === 'mid' ? '中' : '低'}」に下げました（設定で戻せます）`);
        }
      }
    }
  }
  else if (game.bg && !$('screen').hidden) {
    // タイトルの背景
    game.bg.update(real, camera);
    draw(game.bg.scene);
  }
  input.endFrame();
}
// 触る端末（携帯・iPad）の操作：棒・丸の釦から input へ入れる
initTouch({ input, game, setPause, toggleBigMap });
loop();
game.title();
// 開発者向け：?debug で常にFPSを出し、戦へ直接飛べる。?bot で自動テストプレイ
if (/[?&]debug/.test(location.search)) {
  S.showFps = true; game.hud.applySettings();
  const d = document.createElement('div');
  d.className = 'debugbar';
  d.innerHTML = '<b>debug</b>' + Object.entries(SCENARIOS).map(([k, sc]) => sc.battles.map((bb, i) => `<button data-dbg="${i}" data-scn="${k}">${bb.name}</button>`).join('')).join('');
  document.body.appendChild(d);
  d.querySelectorAll('[data-dbg]').forEach((btn) => btn.onclick = () => {
    const i = +btn.dataset.dbg;
    const G = newGame('弥五郎', 'normal', btn.dataset.scn); G.practice = true; G.rank = [0, 1, 2][i]; G.merit = [0, 95, 200][i]; G.aijirushi = 'maru';
    if (i === 2) G.owned.push('katana');
    game.G = G; initAudio(); game.startBattle(i);
  });
}
if (/[?&]bot/.test(location.search)) import('./playbot.js').then((m) => m.run(game));
