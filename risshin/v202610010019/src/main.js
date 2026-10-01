import * as THREE from 'three';
import { newGame, load, save, settle, BATTLES, RANKS, RANK_CEIL, TITLES, fillRoster, clearSave, setScenario, scenarioKey, SCENARIOS, ladderStep } from './state.js';
import { Battle } from './battle.js';
import { kumiHtml, kumiBind } from './kumi.js';
import { Hud } from './hud.js';
import { setRenderer } from './world.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AdaptPass, FinishPass } from './post.js';
import { initAudio, silence, sfx, setVolume, duck, townMusic, playMusic, stopMusic } from './audio.js';
import { titleScreen, storyCard, inkBand, evalScreen, spoilHorseInfo, aijirushiScreen, baseScreen, finalScreen, hideScreen, helpOverlay, settingsScreen, pauseMenu, notice, deathScreen, promoScreen, recordsScreen, dojoResult, epilogueScreen, ladderScreen } from './screens.js';
import { S, QUALITY, saveSettings, canonical, K } from './settings.js';
import { titleScene } from './preview.js';
import { realmAfter } from './realm.js';
// 日本地図・城攻め・図鑑（名簿と顔）は重いので、最初には読まない。要る時に import() する（874・875）
let JPm = null, CBm = null, ZKm = null;
const jp = () => import('./japan.js').then((m) => (JPm = m));
const closeJapan = () => { if (JPm) JPm.closeJapan(); };
const zkLoad = () => import('./zukan.js').then((m) => (ZKm = m)).catch(() => null);
// 戦の定義（b_*.js 全部・約2.6万行）も重いので、最初には読まない。題の画面が出てから裏で読み始め、戦を始める時は済んでいるのを待つだけにする
let BTm = null, btPromise = null;
const btLoad = () => { if (!btPromise) btPromise = import('./battles.js').then((m) => (BTm = m)); return btPromise; };
import { odaTown } from './oda_town.js';
import { townDef } from './town3d.js';   // 城下を歩く（3D の町）
import { initTouch, touchFrame, isTouch } from './touch.js';
import { loadHumans, loadHorse, loadDomaru, primeHumans, HUM as HUMd } from './humans.js';
import { lordGame, lordDef, lordOf, applyLord, lordFrame, LORD_BATTLES, lordList } from './lord.js';
import { toggleGunbai, gunbaiFrame, isGunbaiOpen, setGunbaiHooks } from './gunbai.js';
import { toggleRts, isRtsOn, rtsAvailable, initRtsInput } from './rts.js';
import { gungiAvailable, openGungi } from './gungi.js';   // 軍議の画面（砦の版）。def.gungi のある戦の始めにだけ挟む（F6）
import { initCount } from './count.js';   // 数え（github.io の時だけ GoatCounter へ送る）

const $ = (id) => document.getElementById(id);
// 動きを減らす：ゲームの設定か OS の設定（どちらかが入っていれば減らす。918）
const rmQ = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const RMm = () => !!S.reduceMotion || !!(rmQ && rmQ.matches);
// ?norender・window.__norender：裏の Chrome で bot・sim を流す時、3D の描画（renderer.render／composer.render と、その仕上げ）だけを飛ばす。
// 兵の動き・AI・任務・台詞・当たりは、いつもどおり進める（bhelp・battle.js の毎コマの update は呼んだまま）。写真を撮る道具（snap.mjs・shots.mjs）はこの札を付けない
const isNorender = () => window.__norender === true || /[?&]norender/.test(location.search);
// ?speed=N・window.__speed：norender で早送りする時、1コマ（real の1フレーム）に b.update を N 回回す（既定 1・最大 8）。
// dt そのものを大きくすると当たりがすり抜けかねないので、刻みは normal の細かさのまま、回す回数だけ増やす
const getSpeed = () => {
  const w = window.__speed;
  const m = /[?&]speed=([0-9.]+)/.exec(location.search);
  let n = w != null ? +w : (m ? +m[1] : 1);
  if (!Number.isFinite(n) || n < 1) n = 1;
  return Math.min(8, Math.round(n));
};
// 944：読み込み中の札と心得を読み上げる
try { $('loading').setAttribute('role', 'status'); $('loading').setAttribute('aria-live', 'polite'); } catch (e) { /* 無ければよい */ }

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
// 不透明な物は、同じ描き方（シェーダー）ごとに並べて描く（切り替えるたびに光・カメラの値を送り直す手間を減らす）。
//   three は材質の番号順に並べるので、同じシェーダーの材質（人ごとの顔・兵の材質など）が間に挟まって何度も切り替わっていた
if (!/[?&]nosort\b/.test(location.search)) {
  const PROPS = renderer.properties;
  const pid = (m) => { const p = PROPS.get(m).currentProgram; return p ? p.id : 0; };
  renderer.setOpaqueSort((a, b) => a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || pid(a.material) - pid(b.material) || a.material.id - b.material.id || a.z - b.z || a.id - b.id);
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
setRenderer(renderer);
const camera = new THREE.PerspectiveCamera(S.fov, 1, 0.1, 600);
// 上空視点（rts.js）：touch.js より先に付けて、開いている間は指・マウスの入力をそちらへ渡す（touch.js は直さない）
initRtsInput(canvas, () => game.battle, () => camera);
let resScale = 1;  // 動的解像度（戦の中だけ。main の dynRes が動かす）
// 滑らかさ優先：直近のコマの時間（ならし）が 33ms を超え続けたら細かさの的を 0.1 ずつ下げ（下限 0.6）、
// 20ms を切り続けたら 0.1 ずつ戻す。実の細かさは的へ一秒に 0.05 ずつ寄せ、0.02 刻みでだけ描き直しの大きさを変える（ちらつかない）
let resTarget = 1, resNow = 1, ftAvg = 16, ftHeavy = 0, ftLight = 0;
function dynResReset() { resTarget = 1; resNow = 1; ftAvg = 16; ftHeavy = 0; ftLight = 0; if (resScale !== 1) { resScale = 1; applyRenderSettings(); } }
function dynRes(real) {
  if (!S.autoRes) { if (resScale !== 1) dynResReset(); return; }
  ftAvg += (real * 1000 - ftAvg) * 0.05;
  // 描く上限を決めている時は、その一コマの長さに合わせて「重い」「軽い」を決める
  const per = S.fpsCap ? 1000 / S.fpsCap : 0;
  const hi = Math.max(33, per * 1.15), lo = Math.max(20, per * 1.05);
  ftHeavy = ftAvg > hi ? ftHeavy + real : 0;
  ftLight = ftAvg < lo ? ftLight + real : 0;
  // iPhone は重さの山（描くコマの穴）が急に来やすいので、下げ始めを早く・下限も深くする（PC は今までどおり）
  const heavyT = isTouch ? 0.8 : 1.5, floor = isTouch ? 0.45 : 0.6;
  if (ftHeavy > heavyT) { resTarget = Math.max(floor, resTarget - 0.1); ftHeavy = 0; }
  if (ftLight > 3 && resTarget < 1) { resTarget = Math.min(1, resTarget + 0.1); ftLight = 0; }
  const step = 0.05 * real;
  resNow = resNow < resTarget ? Math.min(resTarget, resNow + step) : Math.max(resTarget, resNow - step);
  const q = Math.round(resNow * 50) / 50;
  if (Math.abs(q - resScale) >= 0.019) { resScale = q; applyRenderSettings(); }
}
function applyRenderSettings() {
  const Q = QUALITY[S.quality] || QUALITY.high;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pixelRatio) * resScale);
  renderer.shadowMap.enabled = Q.shadows;
  camera.fov = S.fov;
  resize();
}
// 画面の仕上げ（画質「中」「高」）：実写の合戦映画のような画（中身は post.js）
// 中：明暗順応・色の作り・周辺減光・粒。高：それに加えて、明るい所のにじみ・接地の影・遠くのぼけ・速く振った時のぶれ
// 画質「低」は仕上げなしでそのまま描く
let composer = null, renderPass = null, bloomPass = null, adaptPass = null, finishPass = null, composerMS = -1, lastDraw = 0;
function useFinish() { return S.quality !== 'low'; }
// 光の筋の計算に毎コマ使う入れ物（毎コマ new しない）
const _dSd = new THREE.Vector3(), _dFw = new THREE.Vector3(), _dP = new THREE.Vector3();
function draw(scene) {
  // 画質「低」は明暗順応が無いので、夜の戦はほぼ真っ黒に沈んでいた（携帯の小さな画面で何も見えない）。夜だけ露出を上げて、月明かりの青い夜に
  if (!useFinish()) {
    const w = game.battle && game.battle.world, e0 = renderer.toneMappingExposure;
    if (w && w.timeKey === 'night') renderer.toneMappingExposure = e0 * 2.6;
    renderer.render(scene, camera);
    renderer.toneMappingExposure = e0;
    return;
  }
  const Q = QUALITY[S.quality] || QUALITY.high;
  // 画質「中」は画素を増やさないので、縁のぎざぎざを重ね描きで消す
  const ms = S.quality === 'mid' || S.quality === 'high' ? 4 : 0;   // 「高」も縁を滑らかに（895）
  if (!composer || composerMS !== ms) {
    if (composer) { composer.dispose(); adaptPass.dispose(); finishPass.dispose(); }
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: ms });
    // 画質「高」は深さも絵として残す（接地の影・遠くのぼけ・動きのぶれ・光の筋・焦点に使う）。「中」は使わないので作らない（軽く）
    if (!ms) {
      rt.depthTexture = new THREE.DepthTexture(1, 1);
      rt.depthTexture.type = THREE.UnsignedIntType;
    }
    composer = new EffectComposer(renderer, rt);
    composerMS = ms;
    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.22, 0.45, 0.9);
    composer.addPass(bloomPass);
    adaptPass = new AdaptPass();
    composer.addPass(adaptPass);
    finishPass = new FinishPass(!ms);
    composer.addPass(finishPass);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  const now = performance.now(), dt = lastDraw ? Math.min(0.25, (now - lastDraw) / 1000) : 1 / 60;
  lastDraw = now;
  bloomPass.enabled = !!Q.bloom && !RMm();
  const hi = S.quality === 'high';
  const U = finishPass.uniforms;
  U.toneMappingExposure.value = renderer.toneMappingExposure;
  if (!RMm()) U.uTime.value = (U.uTime.value + 1 / 60) % 1000;
  renderer.getDrawingBufferSize(U.uRes.value);
  // game.postOff：開発用。{ ao, dof, grade } を true にすると、その仕上げだけ切る（見比べ用）
  const off = game.postOff || {};
  U.uAO.value = hi && !off.ao ? 1 : 0;
  U.uDof.value = hi && !game.photo && !off.dof ? 1 : 0;
  U.uGrade.value = off.grade ? 0 : 1;
  U.uBlur.value = hi && !RMm() && !game.photo ? 1 : 0;
  U.tAdapt.value = adaptPass.texture;
  adaptPass.dt = dt;
  U.uAuto.value = 1;
  const A = adaptPass.mat.uniforms; A.uNear.value = camera.near; A.uFar.value = camera.far;
  camera.updateMatrixWorld();
  finishPass.setCamera(camera);
  // 光の筋：日が画面の前の方にある時だけ（画質「高」、動きを減らす設定では切る）
  const W = game.battle && game.battle.world;
  U.uSunK.value = 0;
  if (hi && W && W.sunOffset && !off.rays) {
    const sd = _dSd.copy(W.sunOffset).normalize();
    const fwd = camera.getWorldDirection(_dFw);
    const facing = fwd.dot(sd);
    if (facing > 0.05 && sd.y > -0.02) {
      const p = _dP.copy(camera.position).addScaledVector(sd, 400).project(camera);
      U.uSunUV.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
      U.uSunCol.value.copy(W.sun.color);
      U.uSunK.value = THREE.MathUtils.smoothstep(facing, 0.05, 0.6) * Math.min(1, W.sun.intensity / 2.2) * (1 - (W.rainLevel || 0));
    }
  }
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
  if (!game.battle || game.townShop) return;   // 城下の店の札を開いている間は、札の画面が鍵を使う
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
  const code = canonical(e.code);
  if (GAME_KEYS.has(e.code) || GAME_KEYS.has(code)) e.preventDefault();
  if (code === null) return;
  // 攻城などの上空視点（rts.js）：Tab で三人称と切り替え。開いている間は号令・武器・移動の鍵を通さない
  if (rtsAvailable(game.battle)) {
    if (code === 'Tab') { if (!e.repeat) toggleRts(game.battle); return; }
    if (isRtsOn(game.battle) && code !== 'Escape') return;
  }
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
  autoTry = false;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { game.noLock = true; setPause(false); }); } catch (err) { game.noLock = true; }
}
// 出陣の釦を押した時（その押した勢いのうちに）マウスを捕まえる。だめでも noLock にはせず、下に小さな案内を出すだけ
// （しくじりは Promise と pointerlockerror の両方で届くことがあるので、次に自分で捕まえに行くまで「自動の試み」の印を残す）
let autoTry = false;
function autoLock() {
  if (game.noLock || locked || !canvas.requestPointerLock) return;
  autoTry = true;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { if (game.battle) lockHint(true); }); } catch (err) { /* 案内を出すだけ */ }
}
// 戦を始める：マウスを捕まえていれば（捕まえられない環境でも）そのまま始める。捕まえ損ねたら案内だけ出して始める
function beginPlay() {
  game.starting = false;
  setPause(false);
  // 黒いチカチカ対策：場面が変わるたび、前の場面の明るさを引きずらず目の慣れをやり直す
  if (adaptPass) adaptPass.fresh = true;
  // 開戦の見出し（3.5秒）と重ならないよう、その後に出す
  if (!game.noLock && !locked) setTimeout(() => { if (game.battle && !game.noLock && !locked) lockHint(true); }, 4200);
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
  if (isRtsOn(game.battle)) return;
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
  if (isRtsOn(game.battle)) return;
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
  if (locked) { autoTry = false; lockHint(false); }
  if (!locked && game.battle && !game.battle.over && !game.helpOpen && !game.mapOpen && !game.townShop) setPause(true);
  if (locked) setPause(false);
});
document.addEventListener('pointerlockerror', () => { if (autoTry) { autoTry = false; if (game.battle) lockHint(true); return; } game.noLock = true; setPause(false); });
// 別のタブに移ったら止める
document.addEventListener('visibilitychange', () => {
  duck(document.hidden);
  if (document.hidden && game.battle && !game.battle.over) setPause(true);
});

// 戦術マップ：開いている間はマウスを放し、クリックで組を向かわせる
function toggleBigMap() {
  // 信長で遊ぶ時は、味方の全部の隊を動かす「軍配の図」（gunbai.js）を開く
  // 足軽大将から（ladderStep 2 以上）は、自分の組と預かった隊を動かす小さな軍配（gunbai.js の M.own）
  if (game.battle && (game.battle.lord || (game.G && ladderStep(game.G) >= 2))) {
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
      const move = (d) => { idx = idx < 0 ? 0 : (idx + d + items.length) % items.length; items[idx].focus({ preventScroll: true }); items[idx].scrollIntoView({ inline: 'nearest', block: 'nearest' }); sfx('hover'); };
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
    if (edge(8)) toggleBigMap();   // 922：キーの M と同じ道（信長の軍配・mapOpen もそろう）
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
      // 城攻めの型を使う筋書きの戦（稲葉山など）は地図の城攻めではないので、地図の写し（mapSnap）が無い時は戦の前の写しに戻す
      // 城下を歩いている時：やり直しは町に入り直し、タイトルへは保存してから
      retry: b.def.town ? () => game.startTown() : () => { const fromMap = b.def.mapCastle && b.def.mapInfo && game.mapSnap; game.G = JSON.parse(game.snapshot) || game.G; if (fromMap) game.startMapBattle(b.def.mapInfo, true); else game.startBattle(b.index); },
      title2: b.def.town ? () => { save(game.G); game.title(); } : () => { const snap = (b.def.mapCastle && game.mapSnap) || game.snapshot; const G0 = snap ? JSON.parse(snap) : null; if (G0) { game.G = G0; save(game.G); } game.title(); },
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
// 織田家編のように戦の id で引く表（配列でない物）はそのまま id で。どちらにも無い戦（これから足す戦）は決まりの札
const byId = (tbl, i) => (tbl && !Array.isArray(tbl) && BATTLES[i] ? tbl[BATTLES[i].id] : undefined);
const storyOf = (i) => byId(STORY_BY[scenarioKey()], i) || (Array.isArray(STORY_BY[scenarioKey()]) && STORY_BY[scenarioKey()][idxIn(i)]) || ((G) => ({ year: BATTLES[i].year, title: BATTLES[i].name.replace(/の戦い$/, ''), text: [`${G.name}は${RANKS[G.rank].name}として、${BATTLES[i].place}へ向かう。`], button: '出陣' }));
const tipOf = (i) => byId(TIPS_BATTLE_BY[scenarioKey()], i) || (Array.isArray(TIPS_BATTLE_BY[scenarioKey()]) && TIPS_BATTLE_BY[scenarioKey()][idxIn(i)]) || '上役の下知を待ち、列を離れるな';
STORY_BY.okehazama = [
  (G) => ({ year: '永禄三年（1560）五月　尾張', title: '桶狭間', text: [
    '駿河・遠江・三河を治める今川義元が、二万を超える大軍で尾張へ攻め入った。',
    '迎え撃つ織田の兵は、二千に足らぬ。',
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
  '「組の稽古」で部下全員の練度を上げられます（城下ごとに一度）。',
  '部隊長（侍）を討つと、その部隊は混乱し、士気も大きく下がります。',
  '散開した組は矢に当たりにくく、縦陣は移動が速くなります。',
  '設定でキー割り当て・字と札の大きさ・色覚に配慮した配色を変えられます。',
];

// この戦の心得（物語の幕間に添える）
// 心得は一行で。キーの字は書かず、割り当てが変わっても困らない言い方に（長押しの物は EK() で出す）
TIPS_BATTLE_BY.okehazama = ['列を離れず合図を待て。首は取らず、本陣の旗本は味方と囲んで崩せ', '五人を指示地点に揃え、法螺貝を待ってから横腹を突け', '柵の内から槍で突け。二の手では南の門から出て荷駄を迎えよ'];
const EK = () => (isTouch ? '「取る」を長押し' : `${K('use')} 長押し`);

// ---------------- 織田家編：物語の札と心得（戦の id で引く。戦を足したら、ここにも一つ足す） ----------------
// 前の戦の話の続きになるように。身分は G.rank で変わる（戦の並びと身分の上限は state.js の ODA_LINE）
const rk = (G) => RANKS[G.rank].name;
STORY_BY.oda = {
  okehazama: (G) => ({ year: '永禄三年（1560）五月　尾張', title: '桶狭間', text: [
    '駿河・遠江・三河を治める今川義元が、二万を超える大軍で尾張へ攻め入った。丸根・鷲津の砦はすでに落ちたという。',
    '清洲の城から駆け出した織田の兵は、二千に足らぬ。組頭の源八は、黙って皆に槍を配っていく。',
    `その中に、名もなき足軽がひとり――${G.name}。`,
  ], button: '中島砦へ' }),
  moribe: (G) => ({ year: '翌年　永禄四年（1561）五月　美濃', title: '森部', text: [
    '美濃の斎藤義龍が急死した。跡を継いだ龍興はまだ若い。信長はその機を逃さず、木曽川を越えて美濃へ兵を出す。',
    `桶狭間で首を捨てて槍を振るった${G.name}に、源八が五人の足軽を付けた。「試しじゃ。組頭の真似事をしてみよ。死なせるなよ」`,
    G.rank ? `${rk(G)}として、初めて自分の組を率いる。` : 'まだ身分は足軽のまま。これが組頭への試しになる。',
  ], button: '出陣' }),
  sunomata: (G) => ({ year: '五年後　永禄九年（1566）九月　美濃', title: '墨俣', text: [
    '信長は清洲から小牧山へ城を移し、美濃攻めを続けていた。だが稲葉山城の斎藤勢は固く、長良川を越えられない。',
    '川の西、墨俣に砦を築いて足場にする――その普請を任されたのは、草履取りから身を起こした木下藤吉郎という男であった。',
    G.rank ? `森部で組を率いた${G.name}は、${rk(G)}として${RANKS[G.rank].squad}人を連れ、藤吉郎の砦の守りにつく。` : `森部で組頭の試しを受けた${G.name}は、まだ足軽のまま、五人を預かって藤吉郎の砦の守りにつく。`,
  ], button: '墨俣へ' }),
  kanegasaki: (G) => ({ year: '元亀元年（1570）四月　越前', title: '金ヶ崎', text: [
    '稲葉山城を落として「岐阜」と名を改めた信長は、足利義昭を奉じて京へ上り、天下に号令をかけ始めた。',
    '越前の朝倉を攻めて金ヶ崎の城を落とした時、思いもよらぬ知らせが届く。妹・お市の夫、北近江の浅井長政が背いた――前に朝倉、後ろに浅井。',
    `信長はわずかな供で京へ逃れ、金ヶ崎には殿（しんがり）が残る。名乗り出たのは木下藤吉郎。その手に、${rk(G)}の${G.name}がいた。`,
  ], button: '殿につく' }),
  anegawa: (G) => ({ year: '元亀元年（1570）六月　近江', title: '姉川', text: [
    `金ヶ崎の殿（しんがり）から生きて戻った${G.name}を、藤吉郎は「あの退き口を生き延びた者じゃ」と皆に触れ回った。身分は変わらぬが、陣中で名を知られるようになった。`,
    'ふた月の後、信長は徳川家康と共に近江へ攻め入る。浅井・朝倉は姉川の北に陣を布いた。川を挟んで、西の瀬に徳川と朝倉、東に織田と浅井。',
    `織田の幾重もの段の中、森可成の手に、${rk(G)}として組を率いる${G.name}がいた。`,
  ], button: '川原へ' }),
  hieizan: (G) => ({ year: '元亀二年（1571）九月　近江', title: '比叡山', text: [
    '姉川で共に戦った森可成は、その秋、宇佐山の城で浅井・朝倉の大軍を支えて討ち死にした。敵は比叡山に逃れ、延暦寺はそれをかくまった。',
    '信長は山に、味方せぬならせめて中立を、と求めたが、山は応じなかった。そして九月、織田勢三万が坂本に集まる。',
    `明智光秀の手に、${rk(G)}となった${G.name}がいた。`,
  ], button: '山道へ' }),
  inabayama: (G) => ({ year: '永禄十年（1567）八月　美濃', title: '稲葉山城', text: [
    '墨俣の砦を足場に、織田は美濃の奥へ手を伸ばした。西美濃の三人衆――稲葉・氏家・安藤が織田についたという知らせが届くと、信長はすぐに兵を出した。',
    '目指すは金華山の上の稲葉山城。夜明けに城下の井口の町に火を放ち、城を裸にする。',
    `墨俣を守り抜いた${G.name}は、${rk(G)}として、また木下藤吉郎の手にいた。`,
  ], button: '井口の町へ' }),
  mitsukuri: (G) => ({ year: '永禄十一年（1568）九月　近江', title: '箕作城', text: [
    '稲葉山を「岐阜」と改めた信長は、足利義昭を奉じて京へ上る兵を起こした。道をふさぐのは南近江の六角義賢・義治。',
    '六角の本城・観音寺城を支える箕作城を、夕暮れから攻めかかる。夜のうちに落とせ、と下知が出た。',
    `${G.name}は${rk(G)}として、藤吉郎の手に加わる。`,
  ], button: '箕作山へ' }),
  okawachi: (G) => ({ year: '永禄十二年（1569）九月　伊勢', title: '大河内城', text: [
    '京を押さえた信長は、南伊勢の北畠具教・具房の父子を攻め、大河内城を七万の大軍で囲んだ。',
    '九月八日の夜、丹羽長秀・池田恒興・稲葉良通の手が、西の搦手から攻めかかる。……だが、朝から雨がやまない。',
    `${G.name}は${rk(G)}として、丹羽長秀の手に加わる。`,
  ], button: '大河内へ' }),
  nodafukushima: (G) => ({ year: '元亀元年（1570）九月　摂津', title: '野田・福島', text: [
    '姉川で浅井・朝倉を退けたのも束の間、阿波から三好三人衆が摂津へ渡り、野田・福島に砦を構えた。砦には紀州の鉄砲衆も入っているという。',
    '信長は大軍で砦を囲み、昼も夜も鉄砲の撃ち合いが続く。すぐそばには、一向宗の総本山・石山本願寺がある。',
    `${G.name}は${rk(G)}として、前田利家の手にいた。`,
  ], button: '砦を囲む' }),
  odani: (G) => ({ year: '天正元年（1573）八月　近江', title: '小谷城', text: [
    '比叡山の後も、浅井・朝倉は屈しなかった。天正元年八月、信長は刀根坂で朝倉を破り、一乗谷を焼いて朝倉家を滅ぼした。',
    '残るは北近江の小谷城。羽柴秀吉と名を改めた藤吉郎は、夜のうちに谷から尾根の真ん中の京極丸へ攻め上ると決めた。',
    `${G.name}は${rk(G)}として、墨俣からの縁で秀吉の手にいた。`,
  ], button: '尾根へ' }),
  nagashima: (G) => ({ year: '天正二年（1574）九月　伊勢', title: '長島', text: [
    '浅井・朝倉は滅んだ。だが伊勢の長島では、一向宗の門徒が川の中の島々に砦を構えて立てこもり、二度も織田を退けていた。',
    '三度目の長島攻め。信長は陸と、九鬼嘉隆の船で海から島々を囲み、兵糧を断った。',
    `${G.name}は${rk(G)}として、柴田勝家の手にいた。`,
  ], button: '輪中へ' }),
  shitaragahara: (G) => ({ year: '天正三年（1575）五月　三河', title: '設楽原', text: [
    '浅井・朝倉は滅び、伊勢の一揆も静まった。だが東では甲斐の武田勝頼が三河へ攻め入り、長篠城を囲んだ。',
    '信長は三万の兵と多くの鉄砲を率いて岐阜を発ち、設楽原の連吾川の西に三重の馬防柵を結わせた。柵の内の鉄砲を預かるのは、佐々成政・前田利家・野々村正成・福富秀勝・塙直政の五人の鉄砲奉行。',
    `${G.name}は${rk(G)}として、前田利家の下で柵の内に立つ。桶狭間の雨の中で槍を握った足軽が、いまは組を率いている。`,
  ], button: '柵の内へ' }),
  takato: (G) => ({ year: '天正十年（1582）三月　信濃', title: '高遠城', text: [
    '設楽原から七年。信長は近江の安土に天守を上げ、天下の主と呼ばれるようになった。',
    '甲州征伐。武田の城々が次々に開かれる中、信濃の高遠城だけは降らなかった。城に籠もるのは信玄の五男・仁科盛信。攻めるのは嫡男・織田信忠。',
    `${G.name}は${rk(G)}として、森長可の手にいた。`,
  ], button: '城へ' }),
  honnoji: (G) => ({ year: '天正十年（1582）六月　京', title: '本能寺', text: [
    '高遠城が落ち、武田は滅んだ。天下はほぼ定まったかに見えた。',
    '六月、信長は中国の毛利攻めへ向かう途中、京の本能寺に泊まった。嫡男の信忠は近くの妙覚寺にいる。',
    `${G.name}は${rk(G)}として、信忠の供の中にいた。夜明け前、桔梗の旗の軍勢が京へ入ってくる――`,
  ], button: '夜明け前' }),
  shiga: (G) => ({ year: '元亀元年（1570）九月　近江', title: '志賀の陣', text: [
    '信長が摂津で三好と対陣している間に、浅井・朝倉の三万が琵琶湖の西を下って坂本へ出てきた。',
    '宇佐山城を預かる森可成は、信長の弟・信治とともに坂本の町口で迎え撃つと決めた。京へ抜かれれば、信長は挟まれる。',
    `姉川で可成の手にいた${G.name}は、${rk(G)}として、またその手にいた。`,
  ], button: '町口へ' }),
  tonezaka: (G) => ({ year: '天正元年（1573）八月　近江', title: '刀根坂', text: [
    '小谷城を囲む信長に、朝倉義景が後詰に出てきた。だが大嵐の夜、砦を落とされた朝倉は、越前へ退き始める。',
    '「今夜、朝倉は退く」――信長はそれを読んでいた。だが先手の諸将は遅れ、信長は自ら馬を出した。',
    `その馬廻の供の中に、${rk(G)}の${G.name}がいた。`,
  ], button: '追う' }),
  echizen: (G) => ({ year: '天正三年（1575）八月　越前', title: '越前', text: [
    '朝倉が滅んだ越前は、一向一揆が国を治める「一揆持ち」の国になっていた。',
    '設楽原から三か月。信長は大軍で越前へ攻め入る。木ノ芽峠には一揆の砦が並ぶ。明智光秀と羽柴秀吉の手の半分は、夜のうちに船で海から回った。',
    `${G.name}は${rk(G)}として、峠の下の明智の手にいた。`,
  ], button: '峠へ' }),
  tennoji: (G) => ({ year: '天正四年（1576）五月　摂津', title: '天王寺', text: [
    '信長は近江の安土に城を築き始めた。だが石山本願寺はなお屈しない。',
    '五月、本願寺を攻めた原田直政が討たれ、勢いに乗った本願寺勢一万五千が、明智光秀の籠もる天王寺砦を囲んだ。',
    `京にいた信長は、集まった三千ほどで駆けつける。「待てば光秀が死ぬ」――その中に${G.name}がいた。`,
  ], button: '駆けつける' }),
  tedorigawa: (G) => ({ year: '天正五年（1577）九月　加賀', title: '手取川', text: [
    '越後の上杉謙信が能登の七尾城を囲んだ。城を助けるため、柴田勝家を大将とする織田勢が北へ向かう。',
    '手取川を越えて加賀の奥へ入ったその夜、思いもよらぬ知らせが届く。七尾城は、もう落ちていた。',
    `雨が降り始めた。${G.name}は${rk(G)}として、柴田の手にいた。`,
  ], button: '退く' }),
  shigisan: (G) => ({ year: '天正五年（1577）十月　大和', title: '信貴山城', text: [
    '石山本願寺を囲む陣を勝手に払い、松永久秀が大和の信貴山城に籠もって、再び信長に背いた。',
    '大将は信忠。明智光秀・羽柴秀吉、そして長く松永と争ってきた筒井順慶が城を囲む。',
    `${G.name}は${rk(G)}として、尾根道を知る筒井の手に付けられた。`,
  ], button: '尾根へ' }),
  miki: (G) => ({ year: '天正七年（1579）九月　播磨', title: '三木城', text: [
    '播磨の別所長治が織田に背き、三木城に籠もって一年余り。羽柴秀吉は城のまわりに付城を並べ、兵糧の道を断った。',
    '城の中は飢え始めている。毛利は、どうにかして兵糧を運び入れようとしていた。',
    `${G.name}は${rk(G)}として、秀吉の本陣・平井山にいた。夜明け前、東の道に荷駄が動く――`,
  ], button: '付城へ' }),
  arioka: (G) => ({ year: '天正七年（1579）十月　摂津', title: '有岡城', text: [
    '摂津の荒木村重が信長に背いて一年。説きに城へ入った黒田官兵衛は捕らえられ、牢に入れられたままだという。',
    '村重は城を抜け出して尼崎へ移った。そして城の中に、織田へつくと申し出る者が出た。',
    `${G.name}は${rk(G)}として、滝川一益の手にいた。官兵衛の家臣・栗山善助が、陣の隅で頭を下げている。`,
  ], button: '夜を待つ' }),
  iga: (G) => ({ year: '天正九年（1581）九月　伊賀', title: '伊賀', text: [
    '二年前、信長の子・信雄の伊賀攻めは、伊賀の地侍たちに退けられた。',
    '天正九年九月、信長は四万余りを六つの口から伊賀へ入れた。伊賀衆は山の城に籠もり、夜討ちで陣を悩ませる。',
    `${G.name}は${rk(G)}として、丹羽長秀の手で比自山の南に陣を張っていた。`,
  ], button: '見張りにつく' }),
  kizugawa: (G) => ({ year: '天正六年（1578）十一月　摂津', title: '木津川口', text: [
    '石山本願寺は、海から毛利の兵糧を受けて籠城を続けていた。二年前、織田の水軍は毛利の焙烙火矢に焼かれて大敗している。',
    '信長は伊勢の九鬼嘉隆に、焼けぬ大船を造らせた。黒い板で覆った六艘の安宅船が、いま木津川口の沖に浮かぶ。',
    `${G.name}は${rk(G)}として、九鬼の大船に乗り込んだ。`,
  ], button: '船へ' }),
  saika: (G) => ({ year: '天正五年（1577）二月　紀伊', title: '雑賀', text: [
    '石山本願寺を鉄砲で支えているのは、紀伊の雑賀衆だった。信長は大軍で紀伊へ攻め入る。',
    '小雑賀川の向こうに雑賀の柵が続く。先に渡った者たちは、川の中で足を取られ、柵の内から鉄砲を浴びたという。',
    `${G.name}は${rk(G)}として、堀秀政の手で川べりに立った。`,
  ], button: '川へ' }),
  tano: (G) => ({ year: '天正十年（1582）三月　甲斐', title: '田野', text: [
    '高遠城が落ちると、武田の家臣は次々に勝頼のもとを離れた。勝頼は新府城を焼き、小山田信茂を頼ったが、そこでも背かれた。',
    '供はもう数十人。天目山のふもとへ逃れる勝頼を、滝川一益の手が追う。',
    `${G.name}は${rk(G)}として、滝川の手で日川の谷を上った。`,
  ], button: '谷へ' }),
  mikatagahara: (G) => ({ year: '元亀三年（1572）十二月　遠江', title: '三方ヶ原', text: [
    '甲斐の武田信玄が、二万五千の兵で西へ攻め上ってきた。狙いは京とも、信長とも言われる。',
    '信長は同盟する徳川家康のもとへ、佐久間信盛・平手汎秀・滝川一益らの三千ほどを送った。',
    `${G.name}は${rk(G)}として、平手汎秀の手で浜松城の北、三方ヶ原の台地に立った。冬の日は、もう傾いている。`,
  ], button: '台地へ' }),
  tottori: (G) => ({ year: '天正九年（1581）十月　因幡', title: '鳥取城', text: [
    '中国攻めを進める羽柴秀吉は、因幡の鳥取城を囲んだ。まわりの米は、先に高値で買い集めてある。',
    '付城と柵で囲まれて四か月。城の中は飢えに苦しんでいると聞く。それでも城を守る吉川経家は降らない。',
    `${G.name}は${rk(G)}として、秀吉の手で千代川の岸の見張りについた。`,
  ], button: '川べりへ' }),
  iwamura: (G) => ({ year: '天正三年（1575）十一月　美濃', title: '岩村城', text: [
    '長篠で武田は多くの宿将を失った。信長は嫡男の信忠を大将に、武田に奪われていた東美濃の岩村城を囲ませた。',
    '城を守るのは武田の秋山虎繁。城の奥には、信長の叔母・おつやの方がいる。',
    `${G.name}は${rk(G)}として、河尻秀隆の手で水晶山の陣にいた。日が暮れていく。`,
  ], button: '柵へ' }),
};
TIPS_BATTLE_BY.oda = {
  okehazama: TIPS_BATTLE_BY.okehazama[0], moribe: TIPS_BATTLE_BY.okehazama[1], sunomata: TIPS_BATTLE_BY.okehazama[2],
  kanegasaki: TIPS_BATTLE_BY.nobunaga_hoi[0], anegawa: TIPS_BATTLE_BY.nobunaga_hoi[1], hieizan: TIPS_BATTLE_BY.nobunaga_hoi[2],
  inabayama: '印の家にだけ火を放て。手向かわぬ町の者は討つな。打って出た斎藤勢を退けたら、藤吉郎について搦手を登れ',
  mitsukuri: '松明の束に火を移し、松明の列について山を登れ。木戸を破る組を守れ',
  okawachi: '木戸を破る組を守り、搦手の木戸を破れ。退きの下知が出たら、追っ手を防ぎながら陣まで退け',
  nodafukushima: '竹束を堤の上に据えて砦の鉄砲を防げ。夜の早鐘が鳴ったら、堤を夜明けまで守り抜け',
  odani: '秀吉について夜の谷を京極丸まで登れ。取ったら本丸と小丸の両方からの寄せを凌げ',
  nagashima: '岸に柵を結い、舟で着く門徒を退けよ。柵の前で打って出た門徒を受け止めよ',
  takato: '大手門を破る組を守り、三の丸・二の丸・本丸と一つずつ取れ。仁科の兵は降らない',
  honnoji: '明智の兵は多い。本能寺へ駆けつけ、二条御所の信忠様のもとへ走れ。門を支え、最後は北の口から落ちのびよ',
  shitaragahara: '柵の外へは出ず、柵に取り付いた敵を隙間から槍で突け。鉄砲は前田利家の「放て」で一斉に撃つ。山県・内藤・真田の三つの寄せを凌げば勝頼は退く',
  shiga: '町口で朝倉の先手を受け止めよ。退けの下知が出たら宇佐山城へ。木戸の前で、取り付く寄せ手を討て',
  tonezaka: '信長公の馬廻について峠道を追え。坂の上の殿（しんがり）を崩せば、朝倉は総崩れになる',
  echizen: `逆茂木を ${EK()}で引き倒して道を開け。海から回った味方の煙を合図に、峠の上の砦へ攻め上れ`,
  tennoji: '雑賀の鉄砲の下を、止まらずに囲みを突き破れ。砦に入ったら、すぐにまた打って出る',
  tedorigawa: '浅瀬の口で殿を務め、騎馬には槍を揃えよ。味方が渡りきったら、止まらずに南の岸へ',
  shigisan: `伏兵を退け、門の脇の物見櫓に ${EK()}で火をかけよ。門を破る組を守り、天守の前で最後の衆を退けよ`,
  miki: `荷駄の護衛を退け、捨てられた俵を ${EK()}で奪え。平田の付城へ駆けつけ、大村坂で別所・毛利勢を崩せ`,
  arioka: `内応で開いた木戸から入り、牢の錠を ${EK()}で壊せ。官兵衛の一行のそばを離れずに陣まで`,
  iga: `燃える小屋の火を ${EK()}で消し、忍び込んだ伊賀衆を討て。夜が明けたら木戸を破る組を守れ`,
  kizugawa: `西の舷の大筒を ${EK()}で撃って小早を沈めよ（弾込めに少し間がある）。甲板の火を消し、乗り移ってきた毛利勢を追い落とせ`,
  saika: `川の中の乱杭を ${EK()}で抜いて道を開け。渡ったら止まらずに柵の前の雑賀衆へ。鉄砲衆の打って出は組で受けよ`,
  tano: '谷の殿を退け、崖道では組で押せ。土屋昌恒の衆は固い。田野の陣へ踏み込め',
  mikatagahara: '武田の先手を槍を揃えて受けよ。赤備えが来たら崩れる前に組をまとめ、退けの下知で浜松城へ走れ（生きて戻ることが任務）',
  tottori: `舟の番を退け、岸の兵糧舟に ${EK()}で火をかけよ。打って出た城兵は柵の前で止め、逃げ帰る者は追うな`,
  iwamura: `柵の持ち場に ${EK()}で篝火を焚け。夜討ちは柵を背に槍を揃えて受け、崩れたら城の麓まで追え`,
};

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
    // 馬（約 6MB）は最初の桶狭間では使わないので、城下へ入る時か、戦が始まった後に読む（882）
    if (!isNorender()) setTimeout(() => { try { loadHumans(); loadDomaru(); } catch (e) { /* 読めなければ軽い形のまま */ } }, 1500);
    // 戦の定義（battles.js。約2.6万行）も、題が出てから裏で読み始める（押した時にはだいたい済んでいる）
    if (!BTm) setTimeout(btLoad, 400);
    // 図鑑（実績の記録に使う）は、題の画面が出てから後で読む
    if (!ZKm) setTimeout(zkLoad, 4000);
    closeJapan();
    this.stopBattle();
    this.inTown = false;
    townMusic(false);
    playMusic('title');
    // 題の 3D は一度だけ作って使い回す（戻るたびに木・草・兵を作り直さない。890）
    this.bg = this.titleBg || (this.titleBg = titleScene());
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
        list: lordList(),   // 侍大将で出陣と同じ戦の一覧
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
    // この戦の働きで上がり得る身分（826）。城下から来た時は、城下へ戻れる（996）
    const G = this.G, nr = RANKS[G.rank + 1];
    const aim = G.practice || G.lord ? '' : i === 0 ? '生きて帰れ。働けば組頭の目に留まる' : nr && G.rank < (RANK_CEIL[i] ?? 9) ? `この戦の働き次第で「${nr.name}」に取り立てられる（累計戦功 ${nr.min} から）` : nr ? 'この戦では身分は上がらない。戦功と銭を積んでおけ' : '';
    const onBack = i > 0 && !G.practice && !G.lord && G.battle === i ? () => this.base() : null;
    storyCard({ ...storyOf(i)(this.G), tips: tipOf(i), aim, onBack }, () => this.startBattle(i));
    // 出陣の前に、連れて行く組の中身（槍・鉄砲・弓・騎馬）を決められる（kumi.js）
    const nb = document.getElementById('b-next'), row = nb && nb.closest('.row');
    if (row && RANKS[G.rank].squad) { row.insertAdjacentHTML('beforebegin', kumiHtml(G)); kumiBind(G, row.parentElement, () => { if (!G.practice) save(G); }); }
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
    // 読み込みの間：まず「いつ・どこ」を一行（永禄三年五月十九日 朝　尾張国 桶狭間）、その下に心得
    $('tip').innerHTML = `${BATTLES[i] && BATTLES[i].year ? `<b style="font-size:1.15em;letter-spacing:.08em">${BATTLES[i].year.replace(/（\d+）/, '')}　${BATTLES[i].place || ''}</b><br>` : ''}この戦の心得：${LB ? LB.tip : tipOf(i)}<br><span style="opacity:.7">${VIEW_TIP()}</span><br><span style="opacity:.7">${LB ? LORD_TIP() : TIPS[Math.floor(Math.random() * TIPS.length)]}</span>`;
    $('loading').hidden = false;
    hideScreen();
    this.stopBattle();
    autoLock();
    // 読み込みの段（888）：何をしているかを札の下に一行出し、段ごとの時間を覚える（window.__loadTimes。確かめ係が端末で読む）
    const stage = (t) => { let el = $('ld-stage'); if (!el) { el = document.createElement('div'); el.id = 'ld-stage'; el.setAttribute('role', 'status'); el.style.cssText = 'margin-top:10px;font-size:13px;opacity:.8'; $('tip').after(el); } el.textContent = t; };
    if (!ZKm) zkLoad();
    const LT = window.__loadTimes = { battle: BATTLES[i] && BATTLES[i].id, quality: S.quality };
    const t0 = performance.now();
    const my = this.startSeq = (this.startSeq || 0) + 1;
    stage('陣を組んでいる……');
    setTimeout(async () => {
      if (my !== this.startSeq) return;
      // 戦の定義（battles.js）は題の画面から裏で読み始めてある。まだなら（bot・道具など）ここで待つ
      if (!BTm) { stage('戦を支度している……'); const tb = performance.now(); await btLoad(); LT.defs = Math.round(performance.now() - tb); if (my !== this.startSeq) return; stage('陣を組んでいる……'); }
      // 886：本物の人と胴丸の読み終わりを、札を見せている間に待つ（長くても 5 秒。間に合わなければ軽い形から入れ替わる）
      if (!this.noLock && !isNorender()) {
        stage('人と具足を支度している……');
        const tw = performance.now();
        await Promise.race([Promise.all([loadHumans(), loadDomaru()]).catch(() => null), new Promise((r) => setTimeout(r, 5000))]);
        LT.assets = Math.round(performance.now() - tw);
        if (my !== this.startSeq) return;
        stage('陣を組んでいる……');
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));   // 字を描いてから組み立てる
      }
      // 組み立てた戦は、絵の下ごしらえ（シェーダ）が済むまで描く輪に渡さない（描く輪が一度に全部を作って固まらないように）
      const b = new Battle(this, i, this.G.lord ? lordDef(BTm.BATTLE_DEFS[i], BATTLES[i].id) : BTm.BATTLE_DEFS[i]);
      LT.build = Math.round(performance.now() - t0);
      applyLord(b);
      b.player.updateCamera(1, camera);
      // 887：絵の下ごしらえを、読み込みの札を見せている間に進める（compileAsync は並べて作れる端末では並べて作る）
      stage('絵を整えている……');
      const t1 = performance.now();
      // 道具（noLock の自動の遊び・撮影）は、すぐ戦が要るので待たない・下ごしらえの遅れも気にしない
      if (this.noLock || isNorender()) HUMd.primed = true;
      try {
        if (!this.noLock) {
          // 人と胴丸がもう読み終わっていれば、この戦で出る見た目（兵・武将・馬の胴丸や兜）も先に作ってから絵の下ごしらえへ（隊が実体化する時のシェーダ作りの重いコマを避ける）
          if (HUMd.ready && !isNorender()) await Promise.race([primeHumans(b, renderer, camera), new Promise((r) => setTimeout(r, 20000))]);
          else if (renderer.compileAsync) await Promise.race([renderer.compileAsync(b.scene, camera), new Promise((r) => setTimeout(r, 20000))]);
        }
      } catch (e) { /* 描く時に作る */ }
      LT.compile = Math.round(performance.now() - t1);
      if (my !== this.startSeq) { b.dispose(); return; }
      this.battle = b;
      this.hud.show(true);
      // 最初の一枚を描いてから表示（カメラが原点を向いた画面を見せない）。norender では描かない
      // 仕上げ（composer・影・にじみ等）を通して描く：その場のシェーダ作りを、札を見せている間に済ませてしまう
      // （前は renderer.render だけだったので、初めの実物のコマで仕上げの下ごしらえが起き、数百msのコマ落ちになっていた）
      const t2 = performance.now();
      if (!isNorender()) draw(this.battle.scene);
      LT.first = Math.round(performance.now() - t2);
      LT.total = Math.round(performance.now() - t0);
      console.info('読み込みの時間（ミリ秒）', JSON.stringify(LT));
      $('ld-stage')?.remove();
      // 馬はここで読み始める（まだなら）
      if (!isNorender()) setTimeout(() => { try { loadHorse(); } catch (e) { /* 軽い馬のまま */ } }, 6000);
      $('loading').hidden = true;
      const def = BTm.BATTLE_DEFS[i];
      // 開戦の大見出しは、始めの一時停止を解いた瞬間に出す
      this.pendingIntro = () => { if (def.sides) this.hud.intro(def.sides, BATTLES[i].name, def.date(this.battle).split('　')[0]); else this.hud.banner(BATTLES[i].name, BATTLES[i].year); sfx('horagai', 0.6); };
      sfx('taiko', 0.8);
      // 砦の戦（def.gungi のある戦）だけ、開戦の前に軍議の画面を一度だけ挟む（ほかの戦・画面の流れは変えない）
      if (gungiAvailable(def) && !this.battle._gungiDone) { this.battle._gungiDone = true; openGungi(this, this.battle, beginPlay); } else beginPlay();
      fpsLog.length = 0; dynResReset(); window.__startFrames = [];
    }, 60);
  },

  stopBattle() {
    this.townShop = false;
    this.hud.root.classList.remove('town');
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
    const zk = ZKm ? ZKm.zukanRecord(b, this.G) : null;   // 図鑑：会った武将と実績を記す（戦の始めに読み込んである）
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
    // 供（ともの者）：討たれた者は名簿から外し、生き残りは戦歴+1（給金は settle が褒美から払う）
    const tomoFallen = [];
    for (const u of b.tomoUnits || []) {
      if (!u.tomo) continue;
      u.tomo.kills = (u.tomo.kills || 0) + (u.kills || 0);
      if (u.alive) u.tomo.battles = (u.tomo.battles || 0) + 1;
      else { u.tomo.alive = false; tomoFallen.push(u.tomo.name); }
    }
    // 討たれた供の名は、あとで雇う者に使わない
    if (tomoFallen.length) G.tomoDead = [...new Set([...(G.tomoDead || []), ...tomoFallen])];
    if (G.tomo) G.tomo = G.tomo.filter((t) => t.alive);
    const r = settle(G, b.tracker, i);
    if (b.result && b.result.taisho === 'a') r.taishoLost = true;
    realmAfter(G, r, b, i);
    r.tomoFallen = tomoFallen;
    // 給金が払えなければ、最後に雇った供から暇を出す
    if (r.unpaid && G.tomo && G.tomo.length) { const t = G.tomo.pop(); r.tomoLeft = t.name; }
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
    // 組の者一人ひとりの働き（評価に一行ずつ出す。812・813）
    r.squadLines = b.squad.filter((u) => u.roster).map((u) => ({ name: u.roster.name, kills: u.kills || 0, alive: !!u.alive }));
    if (b.squad.length) r.squadReport = `${fallen.length ? `討たれた者：${fallen.join('、')}。` : '一人も欠けることなく戦い抜いた。'}${top && top.kills ? `一番の働きは${top.name}（${top.kills}人を討つ）。` : ''}`;
    if ((b.tomoUnits || []).length) r.tomoReport = `${r.tomoFallen.length ? `討たれた供：${r.tomoFallen.join('、')}。` : '供は皆、無事に付き従った。'}${r.tomoLeft ? `給金が払えず、${r.tomoLeft}に暇を出した。` : ''}`;
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
    r.newMet = (zk && zk.met) || [];
    // 792：城下で稽古して伸ばした力が、この戦で効いた事を一行で
    if (G.trainedFor && G.trainedFor.battle === i) {
      const T = G.trainedFor, parts = [];
      if (T.spear) parts.push(`槍術 +${T.spear}（突きが重く、自ら${b.stats.kills || 0}人を討った）`);
      if (T.vit) parts.push(`体力 +${T.vit}（走っても息が上がりにくかった）`);
      if (T.lead) parts.push(`統率 +${T.lead}（組の槍が強く、士気が保った）`);
      if (T.drill) parts.push('組の稽古（組の者が押し負けにくかった）');
      if (parts.length) r.drillNote = `城下の稽古が効いた：${parts.join('・')}`;
    }
    delete G.trainedFor;   // 新たに会った武将（評価に顔の名を並べる。838）
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
    const boss = (BATTLES[i] && BATTLES[i].boss) || (BOSS_BY[scenarioKey()] || [])[idxIn(i)] || '上官';
    r.bossLine = G.lord ? ['家臣一同', !r.mainDone ? '……殿、ここは一度退いて立て直しましょうぞ' : r.total >= 130 ? '殿、お見事にございます。天下に名が響きましょう' : '殿、勝ち戦にございます'] : [boss, !r.mainDone ? '……次は、しかと務めを果たせ' : r.total >= 150 ? 'ようやった。これほどの働き、殿にも申し上げておく' : r.total >= 110 ? '見事じゃ。この調子で励め' : 'まずまずじゃな。まだ伸びる'];
    // 負けが続いたら「易しくして再挑戦」を示す
    this.fails = this.fails || {};
    if (!r.mainDone) this.fails[i] = (this.fails[i] || 0) + 1;
    // 日誌
    G.journal = G.journal || [];
    // 行の頭に評定、後ろに討った数・討たれた者・銭の出入り（褒美と給金、城下での買い物）
    const spent = (G.spend || []).reduce((a, x) => a + x.kan, 0);
    const payIn = (r.pay || []).filter((l) => l.kan > 0).reduce((a, l) => a + l.kan, 0), payOut = (r.pay || []).filter((l) => l.kan < 0).reduce((a, l) => a + l.kan, 0);
    const dead = [...fallen, ...tomoFallen.map((n) => `供の${n}`)];
    G.journal.push({ m: b.def.sides ? b.def.sides.b.mon : undefined, t: `${BATTLES[i].year}　${BATTLES[i].name}`,
      s: `評定「${r.grade}」。戦功${r.total}・討ち取り${b.stats.kills || 0}人。${r.promoted ? `${RANKS[r.rankAfter].name}に取り立てられた。` : ''}${dead.length ? `討死：${dead.join('、')}。` : ''}`,
      dead, ledger: { pay: payIn, wage: payOut, spent: -spent, items: (G.spend || []).map((x) => x.n) } });
    G.spend = [];
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
    // 分捕った馬は、評価の中の一行で持ち帰り（置いていくも選べる。801）
    r.spoilHorse = spoilHorseInfo(G, b.player);
    const show = () => evalScreen(G, r, actions);
    if (G.practice) {
      actions.push({ label: 'タイトルへ', primary: true, fn: () => this.title() });
      actions.push(retry);
    } else if (i === 0 && (scenarioKey() === 'oda' ? !r.mainDone : G.rank === 0)) {
      // 最初の戦をしくじった時は、もう一度（織田家編は桶狭間では昇進しないので、任務を果たせば城下へ進む）
      actions.push({ label: `${BATTLES[0].name.replace(/の戦い$/, '')}に再挑戦する`, primary: true, fn: retry.fn });
      // 織田家編は、しくじっても戦功なしで城下へ進める（最初の戦で先へ進めなくならないように）
      if (scenarioKey() === 'oda') actions.push({ label: '城下へ進む（戦功なし）', fn: () => { save(G); this.base(); } });
      actions.push({ label: 'タイトルへ', fn: () => this.title() });
    } else if (i === BATTLES.length - 1) {
      save(G);
      actions.push({ label: '後日譚へ', primary: true, fn: () => epilogueScreen(G, () => finalScreen(G, () => this.title(), () => this.japanMap('final'))) });
      actions.push(retry);
    } else {
      save(G);
      // 墨の帯で「清洲へ戻る」と一枚挟んでから城下へ（827）
      const toTown = () => inkBand(`${(BATTLES[G.battle] && BATTLES[G.battle].town) || '城下'}へ戻る`, BATTLES[i].name, () => this.base());
      actions.push({ label: '城下へ戻る', primary: true, fn: () => (G.rank >= 1 && !G.aijirushi ? aijirushiScreen(G, () => { save(G); toTown(); }) : toTown()) });
      actions.push(retry);
    }
    // 戦の後の曲：昇進なら華やかに、勝てば凱歌、しくじれば尺八の一節
    playMusic(r.promoted ? 'promote' : r.mainDone ? 'victory' : 'defeat', { delay: 1 });
    // 昇進したら、まず昇進の場面を見せる
    if (r.promoted && !G.lord) promoScreen(gBefore, G, r, show);
    else show();
  },

  base() {
    // 試しの間は銭を無限に（kaito 2026-09-27「最初は銭を無限に持たせて問屋で買い物し放題」。設定の freeMoney で切れる）
    if (S.freeMoney !== false && this.G) this.G.kan = Math.max(this.G.kan || 0, 99999);
    closeJapan();
    this.inTown = true;
    if (!isNorender()) setTimeout(() => { try { loadHorse(); } catch (e) { /* 軽い馬のまま */ } }, 800);
    // 城下の曲に、見出しの季節（春・夏・秋・冬）を渡す（640）
    const tw = scenarioKey() === 'oda' ? odaTown().TOWNS[this.G.battle] : null;
    townMusic(S.townMusic, tw && tw.season);
    // 欠けた分の足軽を補充し、知らせる
    const n = RANKS[this.G.rank].squad;
    if (n > 0) {
      const bows = this.bowsFor(n, this.G.battle);
      const added = fillRoster(this.G, n - bows, bows);
      // 新しく組に入った者を、名と出身で紹介する（814。出身は名札の印から決まる）
      const HOME = ['尾張 津島', '尾張 熱田', '尾張 春日井', '美濃 大垣', '美濃 関', '三河 岡崎', '伊勢 桑名', '近江 長浜', '尾張 知多', '美濃 郡上'];
      const home = (x) => HOME[[...String(x.id)].reduce((a, c) => a + c.charCodeAt(0), 0) % HOME.length];
      this.G.recruitsNote = added.length ? `新たに組に加わった者：${added.map((a) => `${a.name}（${home(a)}の出・${a.kind === 'bow' ? '弓' : '槍'}）`).join('、')}` : '';
    }
    save(this.G);
    // 城下を歩く（設定の既定）。すでに町にいれば、そのまま町へ戻る
    if (this.townWalkOn()) { if (this.battle && this.battle.def.town) this.townResume(); else this.startTown(); return; }
    if (this.battle && this.battle.def.town) this.stopBattle();
    baseScreen(this.G, this.G.battle, this.lastResult, this);
  },

  // ---- 城下を歩く（town3d.js）。設定の「城下を歩く／札で選ぶ」。bot・norender・sim の道具は札のまま ----
  // 題の「城下を歩く」：保存を読み、戦をせずに城下へ
  townFromTitle(saved) { initAudio(); this.G = saved; this.bg = null; this.base(); },
  townWalkOn() { return S.townWalk !== 'cards' && !isNorender() && !/[?&]bot/.test(location.search) && !window.__cardTown; },
  startTown() {
    this.bg = null;
    this.inTown = true;
    this.townShop = false;
    hideScreen();
    this.stopBattle();
    autoLock();
    $('loading').hidden = false;
    $('tip').textContent = '城下を歩く。戸口に寄ると「入る」が出る。出陣は町の門か上官屋敷から。';
    const my = this.startSeq = (this.startSeq || 0) + 1;
    setTimeout(async () => {
      if (my !== this.startSeq) return;
      if (!this.noLock) await Promise.race([loadHumans().catch(() => null), new Promise((r) => setTimeout(r, 4000))]);
      if (my !== this.startSeq) return;
      const def = townDef(this);
      const b = new Battle(this, this.G.battle, def);
      b.player.updateCamera(1, camera);
      this.battle = b;
      this.hud.root.classList.add('town');   // 町では戦の札（戦功・体力・技の列・照準）を出さない
      this.hud.show(true);
      $('loading').hidden = true;
      this.pendingIntro = () => this.hud.banner(def.place, def.when);
      beginPlay();
      fpsLog.length = 0; window.__startFrames = [];
      townMusic(S.townMusic, def.season);
    }, 60);
  },
  // 戸口で「入る」：町を止めて、その施設の札の画面を開く。閉じると町へ戻る
  townOpen(tab, o = {}) {
    if (!this.battle || this.townShop) return;
    this.townShop = true;
    this.paused = true;
    input.clear();
    if (document.exitPointerLock && locked) document.exitPointerLock();
    this.hud.show(false);
    sfx('ui');
    baseScreen(this.G, this.G.battle, this.lastResult, this, { tab, go: !!o.go, onLeave: () => this.townResume() });
    // 町の門から：出陣の確かめ（やり残し）の所を見せ、「出陣する」に焦点を置く
    if (o.go) setTimeout(() => { const g2 = $('go2'); if (g2) { g2.scrollIntoView({ block: 'center' }); g2.focus({ preventScroll: true }); } }, 60);
  },
  townResume() {
    this.townShop = false;
    hideScreen();
    document.querySelectorAll('.tour').forEach((e) => e.remove());
    if (!this.battle) return;
    this.hud.show(true);
    this.paused = false;
    input.clear();
    autoLock();
    if (this.battle.def.onResume) this.battle.def.onResume(this.battle);
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
    // 侍大将で出陣は城下を通らないので、武具はひと通り持たせる（十文字槍・鉄砲・弓も）
    G.owned = [...new Set([...G.owned, 'spear2', 'spear4', 'teppo', 'yumi', 'hat3', 'body2', 'kote', 'haidate', 'suneate', 'haori', 'katana'])];
    Object.assign(G.equip, { weapon: 'spear4', hat: 'hat3', body: 'body2', arm: 'kote', thigh: 'haidate', shin: 'suneate', coat: 'haori' });
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
    setTimeout(async () => {
      if (!BTm) await btLoad();
      this.battle = new Battle(this, 3, BTm.dojo);
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
    jp().then((m) => m.japanScreen(G, {
      from, practice: !!G.practice, result: this.mapResult || null,
      // 本編が主：地図の上から次の戦（城下の「出陣する」）へ戻れるように
      next: !G.practice && G.battle < BATTLES.length ? BATTLES[G.battle].name : null,
      onNext: () => { this.mapResult = null; closeJapan(); this.base(); },
      onBack: () => { this.mapResult = null; if (from === 'town') this.base(); else if (from === 'final') finalScreen(G, () => this.title(), () => this.japanMap('final')); else this.title(); },
      onAttack: (info) => { this.mapResult = null; this.startMapBattle(info); },
      onSave: () => save(G),
    })).then(() => { this.mapResult = null; });
  },

  // 地図から出陣する城攻め（BATTLES の並びには入れない。戦功・昇進・戦の進みは変えない）
  startMapBattle(info, again = false) {
    if (!CBm) { import('./b_castle.js').then((m) => { CBm = m; this.startMapBattle(info, again); }); return; }
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
    const def = CBm.castleBattle(info);
    const tomoN = (G.tomo || []).filter((t) => t.alive).length;
    $('tip').innerHTML = `${tomoN ? 'この城攻めには供を連れて行けない（城下で待たせる）。<br>' : ''}${VIEW_TIP()}<br>${info.defend ? `この戦の心得：塀に掛かった梯子は ${EK()}で突き落とす。門の内で${EK()}すれば石を落とせる。本丸の門を破られたら落城` : `この戦の心得：竹束を押して寄り、門に寄って ${EK()}で掛矢を振るえ。塀の内の射手と、搦手からの出撃に気をつけよ`}<br><span style="opacity:.7">${TIPS[Math.floor(Math.random() * TIPS.length)]}</span>`;
    $('loading').hidden = false;
    hideScreen();
    this.stopBattle();
    autoLock();
    setTimeout(() => {
      this.battle = new Battle(this, 0, def);
      applyLord(this.battle);
      this.hud.show(true);
      this.battle.player.updateCamera(1, camera);
      if (!isNorender()) draw(this.battle.scene);
      $('loading').hidden = true;
      this.pendingIntro = () => { this.hud.intro(def.sides, def.title, info.date); sfx('horagai', 0.6); };
      sfx('taiko', 0.8);
      beginPlay();
      fpsLog.length = 0; dynResReset(); window.__startFrames = [];
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
    jp().then((m) => {
      m.japanResult(G, info, won);
      save(G);
      this.mapResult = { won, castle: info.castle, castleId: info.castleId, atk: info.atk.name, def: info.def.name, date: `${info.date} ${info.season}`, ...stats };
      this.japanMap(this.mapFrom || 'town', true);
    });
  },

  // 組の弓の割合（城下の「組の編成」で決める）
  bowsFor(n, i) { return i >= 2 ? Math.round(n * (this.G.bowRatio ?? 0.33)) : 0; },
};
window.__game = game;
// 開発用：今の視点で一コマ描く（撮影の道具が使う。fresh なら目の慣れをやり直す）
game.drawNow = (fresh, scene) => { if (fresh && adaptPass) adaptPass.fresh = true; const sc = scene || (game.battle && game.battle.scene); if (sc) draw(sc); };
try { initCount(game); } catch (e) { /* 数えが動かなくても遊べる */ }
game.renderer = renderer;   // 開発用（描画の重さを計る）
// 城下から設定を開く（995）。閉じたら back へ
game.perf = () => ({ res: resScale, target: resTarget, ft: +ftAvg.toFixed(1) });
game.openSettings = (back) => settingsScreen(onSettings, back);

// ---------------- ループ ----------------
const clock = new THREE.Clock();
let fpsT = 0, frames = 0;
const fpsLog = [];
let autoLowered = false;
let capAcc = 0, bgAcc = 0;
function loop() {
  requestAnimationFrame(loop);
  // 確かめ用：開戦から10秒、1コマの重さを window.__startFrames に記す（重いコマを探す道具。遊びには使わない）
  const _pf0 = window.__startFrames ? performance.now() : 0;
  // 描画の上限（省電力）
  if (S.fpsCap) { capAcc += clock.getDelta(); if (capAcc < 1 / S.fpsCap - 0.002) return; }
  const real = Math.min(0.05, S.fpsCap ? capAcc : clock.getDelta());
  capAcc = 0;
  let dt = real;
  const b = game.battle;
  // 読み込みの札の5秒より遅れて、人と胴丸が戦の途中で読み終わった時：一度だけ、この戦の見た目を裏で先に作ってから（primeHumans）本物の人に替え始める
  //   （待たずに ready のまま進むと、近くの兵がその場で一気に本物の人へ替わり、新しい材質のシェーダ作りが1コマに乗って固まる）
  if (b && !game.noLock && HUMd.ready && !HUMd.primed && !HUMd.priming) { HUMd.priming = true; primeHumans(b, renderer, camera).catch(() => {}).finally(() => { HUMd.priming = false; }); }
  pollPad();
  touchFrame(real);
  if ((!b || b.def.town) && resScale !== 1) dynResReset();  // 城下（町を歩く時も）・題の画面では下げない
  // 城下の店の札を開いている間は、町を描かない（札が画面を覆う。電池を減らさない）
  if (b && game.townShop) { input.endFrame(); return; }
  if (b) {
    // 攻撃が当たった瞬間のわずかな溜め（ヒットストップ）。「動きを減らす」では使わない
    if (game.hitstop > 0) { game.hitstop -= dt; if (!RMm()) dt *= 0.12; }
    // 受け流し・武将討ちの瞬間はゆっくり
    if (game.slowmo > 0) { game.slowmo -= real; if (!RMm()) dt *= 0.35; }
    // 軍配の図を開いている間は、時がゆっくり流れる
    if (game.cmdMap && isGunbaiOpen()) dt *= 0.15;
    b.world.distMul = S.drawDist;
    // 始まりの重さを測る（開戦後 10 秒だけ）：コマの update と draw を分けて計り、長いコマ（2 コマ分＝約 33ms 超）を覚える
    const measuring = b.t < 10 && window.__startFrames;
    const t_u0 = measuring ? performance.now() : 0;
    if (game.photo && !game.paused) updatePhoto(real);
    else if (!game.paused) { const spd = getSpeed(); for (let si = 0; si < spd; si++) b.update(dt, input); }
    if (b.lord) { lordFrame(b); gunbaiFrame(b, real); } else if (isGunbaiOpen()) gunbaiFrame(b, real);
    if (b.noboriFlags) for (let i = 0; i < b.noboriFlags.length; i++) b.noboriFlags[i].rotation.y = Math.sin(b.t * 1.6 + i * 1.3) * 0.18;
    const t_u1 = measuring ? performance.now() : 0;
    // norender：ここから下は「描く」ためだけの仕事（renderer.render・仕上げ・FPS計測・動的解像度）なので、まるごと飛ばす
    if (isNorender()) {
      if (measuring && t_u1 - t_u0 > 24) window.__startFrames.push({ t: +b.t.toFixed(2), upd: +(t_u1 - t_u0).toFixed(1), draw: 0, total: +(t_u1 - t_u0).toFixed(1) });
      input.endFrame(); return;
    }
    draw(b.scene);
    if (measuring) {
      const t_d1 = performance.now(), total = t_d1 - t_u0;
      if (total > 24) window.__startFrames.push({ t: +b.t.toFixed(2), upd: +(t_u1 - t_u0).toFixed(1), draw: +(t_d1 - t_u1).toFixed(1), total: +total.toFixed(1) });
    } else if (b.t >= 10 && window.__startFrames) {
      const F = window.__startFrames;
      console.info(`開戦10秒の長いコマ（33ms超）：${F.length}個`, JSON.stringify(F));
      window.__startFrames = null;
    }
    if (!game.paused && !b.def.town) dynRes(real);
    frames++; fpsT += real;
    if (fpsT > 1) {
      // 出している時だけ書き換え、兵を数える（908）
      if (S.showFps) $('fps').textContent = `毎秒 ${frames} 枚 ・ 兵 ${b.army.units.filter((u) => u.alive).length} ・ 解像度 ${Math.round(resScale * 100)}%`;
      if (!game.paused) fpsLog.push(frames);
      frames = 0; fpsT = 0;
      // 重いときは一度だけ画質を自動で下げる。自動では「中」まで（「低」は近くの兵まで作り物の姿になるので、選ぶのは遊ぶ人）
      if (!autoLowered && fpsLog.length >= 6 && S.quality === 'high') {
        const avg = fpsLog.slice(-6).reduce((a, v) => a + v, 0) / 6;
        if (avg < (S.fpsCap ? Math.min(32, S.fpsCap * 0.65) : 32)) {
          autoLowered = true;
          S.quality = 'mid';
          saveSettings();
          onSettings('quality');
          notice('動きが重いため、描き込みを少し軽くしました（人の姿はそのまま）');
        }
      }
    }
  }
  else if (game.bg && !$('screen').hidden && !isNorender()) {
    // タイトルの背景。図鑑・記録帳・設定などで覆われている間は一秒に 10 コマに落とす（891）
    bgAcc += real;
    const covered = !!document.getElementById('zk') || !$('tt-home');
    if (!covered || bgAcc >= 0.1) { game.bg.update(bgAcc, camera); draw(game.bg.scene); bgAcc = 0; }
  }
  input.endFrame();
  if (_pf0 && b && b.t <= 10) { window.__startFrames.push({ t: Math.round(b.t * 100) / 100, ms: Math.round((performance.now() - _pf0) * 10) / 10, programs: renderer.info.programs ? renderer.info.programs.length : 0 }); }
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
