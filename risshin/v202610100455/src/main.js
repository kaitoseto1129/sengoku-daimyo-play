import { rememberWounds } from './wounds.js';
import { readProgress, progressStored, deleteProgress } from './save_guard.js';
import * as THREE from 'three';
import { newGame, save, settle, BATTLES, RANKS, RANK_CEIL, TITLES, fillRoster, clearSave, setScenario, scenarioKey, SCENARIOS, ladderStep, markReady } from './state.js';
import { kumiHtml, kumiBind } from './kumi.js';
import { recordBattle } from './kiroku.js';
import { ronkoDeeds } from './ronko.js';
import { afterHistory } from './after_history.js';
import { sharedBattle, makeSharecard, mountSharecard } from './sharecard.js';
import { Hud } from './hud.js';
import { decisiveCameraSpeed } from './decisive_camera.js';
import { deploymentView } from './deployment_view.js';
import { setRenderer, FLAG_MOON } from './world.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AdaptPass, FinishPass, clearEdgeDark } from './post.js';
import { initAudio, silence, sfx, setVolume, duck, townMusic, playMusic, stopMusic } from './audio.js';
import { titleScreen, storyCard, loadingStory, inkBand, evalScreen, spoilHorseInfo, aijirushiScreen, baseScreen, finalScreen, hideScreen, helpOverlay, settingsScreen, townEntryScreen, pauseMenu, notice, deathScreen, promoScreen, ronkoScreen, recordsScreen, dojoResult, epilogueScreen, ladderScreen } from './screens.js';
import { S, QUALITY, saveSettings, canonical, K, reduceMotion } from './settings.js';
import { glossaryDialog, setGlossaryBeforeOpen } from './glossary.js';
import { titleScene } from './preview.js';
import { realmAfter } from './realm.js';
import { hyojoScreen, shitakuScreen, hyojoOn, phase2HintScreen } from './hyojo.js';
import { keraiPrepareHtml } from './retainers.js';
import { BATTLE_IDS } from './battle_ids.js';
import { isLocked, showPaywall } from './paywall.js';
import { ADDITIONAL_TIPS, pickTip } from './tips.js';
import { loadWeapons, UNIT_NIGHT, UNIT_NIGHT_FOCUS } from './units_model.js';
// 題では戦の名前だけ登録する。中身と素材は出陣する時に読む。
markReady(BATTLE_IDS);
// 日本地図・城攻め・図鑑（名簿と顔）は重いので、最初には読まない。要る時に import() する（874・875）
let JPm = null, CBm = null, ZKm = null;
const jp = () => import('./japan.js').then((m) => (JPm = m));
const closeJapan = () => { if (JPm) JPm.closeJapan(); };
const zkLoad = () => import('./zukan.js').then((m) => (ZKm = m)).catch(() => null);
// 戦の定義（b_*.js 全部・約2.6万行）も重いので、最初には読まない。出陣する時に読む
let BTm = null, btPromise = null;
const btLoad = () => { if (!btPromise) btPromise = import('./battles.js').then((m) => (BTm = m)).catch((e) => { btPromise = null; throw e; }); return btPromise; };
// 戦の仕組み（battle.js。units・army・ai・siege など、題には要らない重い物を連れてくる）も、出陣する時に読む
let BM = null, bmPromise = null;
const bmLoad = () => { if (!bmPromise) bmPromise = import('./battle.js').then((m) => (BM = m)).catch((e) => { bmPromise = null; throw e; }); return bmPromise; };
// 戦を始める前の「支度中……」の一行（#tip の下）。失敗したら字とやり直しボタンに変える
// 読み込みの進み（10/2）：段ごとの見込みの時間（前に測った時間を覚える）から、進みの棒と「あと約○秒」を出す。
//   棒は transform の移り変わりで動かす（組み立ての重い間も、画面の合成の側で動き続ける）。動きを減らす設定では段ごとに跳ぶだけ
const LD_KEY = 'risshin-ld-ms';
const LD_DEF = { defs: 600, assets: 800, build: 1500, warm: 500, compile: 900, first: 400 };
let ldPlan = null, ldIv = 0, ldName = '戦の支度';
function ldStoreKey(battle = '') { return LD_KEY + (isTouchLd() ? '-t' : '') + (battle ? '-' + battle : ''); }
function ldLearned(battle = '') {
  try {
    const raw = JSON.parse(localStorage.getItem(ldStoreKey(battle)) || '{}');
    const clean = {};
    for (const key of Object.keys(LD_DEF)) if (typeof raw?.[key] === 'number' && Number.isFinite(raw[key]) && raw[key] >= 50 && raw[key] <= 60000) clean[key] = raw[key];
    return clean;
  } catch (e) { return {}; }
}
function isTouchLd() { return document.documentElement.classList.contains('touch'); }
// 段の並びを決めて、棒を 0 から始める。keys：この読み込みで通る段
function ldBegin(keys, battle = '') {
  const L = { ...ldLearned(), ...ldLearned(battle) }, mul = isTouchLd() ? 1.6 : 1;
  ldPlan = { keys, battle, est: keys.map((k) => L[k] ?? LD_DEF[k] * mul), cur: -1, t: performance.now(), t0: performance.now(), hidden: document.hidden };
  const bar = document.querySelector('#loading .ldbar i');
  if (bar) { bar.style.transition = 'none'; bar.style.transform = 'scaleX(0)'; }
  clearInterval(ldIv); ldIv = setInterval(ldTick, 250);
  const actions = document.querySelector('#loading .ld-cancel');
  if (actions) actions.remove();
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'btn small ld-cancel'; cancel.textContent = '支度をやめて題へ戻る';
  cancel.style.cssText = 'min-height:44px;margin-top:16px';
  cancel.onclick = () => { game.startSeq = (game.startSeq || 0) + 1; hideLoading(); game.title(); };
  document.querySelector('#loading .ldbar').parentElement.appendChild(cancel);
  ldTick();
}
function ldTick() {
  const el = $('ld-left');
  if ($('loading').hidden || !ldPlan) { clearInterval(ldIv); ldPlan = null; return; }
  if (!el || document.hidden) return;
  const P = ldPlan, i = Math.max(0, P.cur);
  const into = performance.now() - P.t;
  let left = Math.max(0, P.est[i] - into);
  for (let k = i + 1; k < P.keys.length; k++) left += P.est[k];
  const overdue = into >= P.est[i];
  let reading = 0, building = 0;
  for (let k = i; k < P.keys.length; k++) {
    const remain = k === i ? Math.max(0, P.est[k] - into) : P.est[k];
    if (P.keys[k] === 'defs' || P.keys[k] === 'assets') reading += remain;
    else building += remain;
  }
  const seconds = Math.floor((performance.now() - P.t0) / 1000);
  const pulse = RMm() ? '' : '・'.repeat(seconds % 3 + 1);
  const text = seconds >= 10 ? `${ldName}の支度中${pulse}　${seconds}秒経過。混んでいる時は時間がかかります。待てば進みます`
    : overdue ? `${ldName}の支度を続けています${pulse}　${seconds}秒経過`
    : left > 900 ? `目安：素材の読込 あと約${Math.ceil(reading / 1000)}秒・組立てと絵 あと約${Math.ceil(building / 1000)}秒。下の札で戦の背景を読めます`
      : '支度を仕上げています。読む札は、自分で閉じられます';
  if (el.textContent !== text) el.textContent = text;
}
// 段に入る：棒をこの段の終わりの手前まで、見込みの時間で伸ばす
function ldStep(key) {
  const P = ldPlan; if (!P) return;
  const i = P.keys.indexOf(key); if (i < 0 || i === P.cur) return;
  P.cur = i; P.t = performance.now();
  const sum = P.est.reduce((a, v) => a + v, 0) || 1;
  let a = 0; for (let k = 0; k < i; k++) a += P.est[k];
  const end = (a + P.est[i] * 0.92) / sum;
  const bar = document.querySelector('#loading .ldbar i');
  if (bar) {
    if (RMm()) { bar.style.transition = 'none'; bar.style.transform = `scaleX(${(a / sum).toFixed(3)})`; }
    else { bar.style.transition = `transform ${Math.round(P.est[i])}ms linear`; bar.style.transform = `scaleX(${end.toFixed(3)})`; }
  }
  ldTick();
}
// 読み終わり：段ごとにかかった時間を覚える（次の見込みに使う。前の値と半々にならす）
function ldLearn(LT) {
  if (ldPlan?.hidden) return;
  try {
    const battle = ldPlan?.battle || '';
    const L = ldLearned(battle);
    for (const k of Object.keys(LD_DEF)) if (Number.isFinite(LT[k]) && LT[k] >= 50 && LT[k] <= 60000) L[k] = Math.round(L[k] != null ? (L[k] + LT[k]) / 2 : LT[k]);
    localStorage.setItem(ldStoreKey(battle), JSON.stringify(L));
  } catch (e) { /* 覚えられなくてもよい */ }
}
const stage = (t, key) => {
  if (t) ldName = ({ defs: '戦の仕組み', assets: '人と具足', build: '地形と兵', warm: '人の姿', compile: '絵', first: '最初の画面' })[key] || t;
  let el = $('ld-stage');
  if (!el) { el = document.createElement('div'); el.id = 'ld-stage'; el.style.cssText = 'margin-top:10px;font-size:15px;color:var(--washi);text-align:center'; el.innerHTML = '<span role="status" aria-live="polite" aria-atomic="true"></span><span aria-live="off" id="ld-left" style="display:block;margin-top:4px;font-size:13px;opacity:.85"></span>'; document.querySelector('#loading .ldbar').after(el); }
  el.setAttribute('role', 'region');
  if (!$('ld-left')) el.innerHTML = '<span role="status" aria-live="polite" aria-atomic="true"></span><span aria-live="off" id="ld-left" style="display:block;margin-top:4px;font-size:13px;opacity:.85"></span>';
  const i = ldPlan && key ? ldPlan.keys.indexOf(key) : -1;
  el.firstChild.textContent = i >= 0 ? `${t}（${i + 1}／${ldPlan.keys.length}）` : t;
  if (key) ldStep(key);
};
const stageError = (retry) => { game.loadingReader?.dispose(); game.loadingReader = null; const failedStage = ldName; document.querySelector('#loading .ld-cancel')?.remove(); $('loading').hidden = false; clearInterval(ldIv); ldIv = 0; ldPlan = null; stage(''); const el = $('ld-stage'); el.textContent = `！ ${failedStage}の途中で止まりました。題へ戻っても城下の記録は残ります。もう一度お試しください。`; el.insertAdjacentHTML('beforeend', '<div class="ld-actions"><button class="btn small" id="ld-title">タイトルへ戻る</button><button class="btn small" id="ld-retry">もう一度支度する</button></div>'); el.setAttribute('role', 'alert'); $('ld-retry').onclick = () => { $('ld-retry').disabled = true; $('ld-title').disabled = true; el.setAttribute('role', 'status'); sfx('ui'); Promise.resolve().then(retry).catch(() => stageError(retry)); }; $('ld-title').onclick = () => { hideLoading(); game.title(); }; $('ld-title').focus({ preventScroll: true }); };
// 裏の読み込みや組み立てで例外が出ても、「読み込み中」の札で固まらないように：失敗の札を出してやり直せるようにする
const guarded = (fn, retry) => { const seq = game.startSeq; return async () => {
  if (seq !== game.startSeq) return;
  try { return await fn(); }
  catch (e) { if (seq !== game.startSeq) return; console.error(e); game.lastError = `${e.message}\n${(e.stack || '').split('\n')[1] || ''}\n読み込みの失敗`; stageError(retry); }
}; };
// 画面に出ない失敗（開けない図鑑や地図など）は、知らせを出して題へ戻れるようにする
const loadFail = (what) => (e) => { console.error(e); game.lastError = `${e && e.message}\n${what}を開けなかった`; hideLoading(); notice(`${what}を開けませんでした。通信を確かめて、もう一度開いてください`); };
const hideLoading = () => { game.loadingReader?.dispose(); game.loadingReader = null; clearInterval(ldIv); ldIv = 0; ldPlan = null; const l = $('loading'); if (l) l.hidden = true; };
async function waitLimited(work, ms) {
  let timer;
  try { return await Promise.race([work, new Promise((resolve) => { timer = setTimeout(() => resolve(false), ms); })]); }
  finally { clearTimeout(timer); }
}
// 不具合の知らせ（window の error・unhandledrejection・戦の輪の失敗で同じ文と lastError を作る）
function reportBug(message, where) {
  const b = game.battle;
  game.lastError = `${message}\n${where}\n戦：${b ? (BATTLES[b.index] ? BATTLES[b.index].name : '稽古') : '-'}　経過 ${b ? Math.round(b.t) : 0}秒　場面 ${b ? b.phase : '-'}`;
  crashNotice();
}
// 戦の定義・仕組みは、出陣する時に読み始める。
// 失敗したら（通信が不安定な端末など）次に押した時にまた読めるよう promise を捨て、字とやり直しボタンを出す
async function readyBattleCode(retry) {
  const seq = game.startSeq;
  if (BTm && BM) return true;
  stage('戦の支度を読み込んでいます', 'defs');
  try { await Promise.all([btLoad(), bmLoad(), isNorender() ? Promise.resolve() : loadWeapons()]); try { sessionStorage.removeItem('risshin-reloaded'); } catch (e2) { /* なし */ } return seq === game.startSeq; }
  catch (e) {
    if (seq !== game.startSeq) return false;
    console.error(e);
    game.lastError = `${e.message}\n${(e.stack || '').split('\n')[1] || ''}\n戦の定義と仕組みの読み込みの失敗`;
    btPromise = null; bmPromise = null;
    // 読み込みに一度失敗した部品は、同じ頁のままでは何度押しても読めない（ブラウザが失敗を覚える）。
    // 公開の版が替わった直後や通信が途切れた時なので、一度だけ頁を読み直して新しい版で始め直す（同じ戦の札へ戻る）
    try {
      if (!sessionStorage.getItem('risshin-reloaded')) {
        sessionStorage.setItem('risshin-reloaded', String(Date.now()));
        stage('もう一度読み込んでいます', 'defs');
        location.reload();
        return false;
      }
    } catch (e2) { /* 保存できない時は札でやり直す */ }
    stageError(retry);
    return false;
  }
}
import { odaTown } from './oda_town.js';
let townModule = null;
const townLoad = () => import('./town3d.js').then((m) => (townModule = m));
import { initTouch, touchFrame, isTouch } from './touch.js';
import { loadHumans, loadHorse, loadDomaru, loadKabuto, primeHumans, updateHumans, DOMARU as DOMd, HUM as HUMd } from './humans.js';
import { loadCgt, cgtOn } from './cgt.js';   // 買った素材（城の部品）。低・描かない時は読まない
import { lordGame, lordDef, lordOf, applyLord, lordFrame, LORD_BATTLES, lordList } from './lord.js';
import { toggleGunbai, gunbaiFrame, isGunbaiOpen, setGunbaiHooks } from './gunbai.js';
import { toggleRts, isRtsOn, rtsAvailable, initRtsInput } from './rts.js';
import { gungiAvailable, openGungi, closeGungi } from './gungi.js';   // 軍議の画面（砦の版）。def.gungi のある戦の始めにだけ挟む（F6）
import { initMetrics } from './metrics.js';   // 遊びの数字（GA4。GA_ID が空なら送らない）
import { initCount } from './count.js';   // 数え（github.io の時だけ GoatCounter へ送る）

const $ = (id) => document.getElementById(id);
// 動きを減らす：ゲームの設定か OS の設定（どちらかが入っていれば減らす。918）
const rmQ = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const RMm = reduceMotion;
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
  try { window.__bootDone && window.__bootDone(); } catch (e2) { /* noop */ }
  throw e;
}
// 一つも描く物が無い InstancedMesh（count 0）は、描く呼びかけごと省く（材質の準備だけで一回分の重さ。影の描きでも同じ）
{
  const rbd = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (object.isInstancedMesh && object.count === 0) return;
    return rbd.call(this, camera, scene, geometry, material, object, group);
  };
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
let resTarget = 1, resNow = 1, ftAvg = 16, ftHeavy = 0, ftLight = 0, resCooldown = 0;
function dynResReset() { resTarget = 1; resNow = 1; ftAvg = 16; ftHeavy = 0; ftLight = 0; resCooldown = 0; if (resScale !== 1) { resScale = 1; applyRenderSettings(); } }
function dynRes(real) {
  if (!S.autoRes || !S.qualityAuto) { if (resScale !== 1) dynResReset(); return; }
  ftAvg += (real * 1000 - ftAvg) * 0.05;
  if (resTarget > powerRes) resTarget = powerRes;   // 端末が熱い間の上限（__iosPower）
  // 描く上限を決めている時は、その一コマの長さに合わせて「重い」「軽い」を決める
  const cap = fpsCapNow(), per = cap ? 1000 / cap : 0;
  const hi = Math.max(33, per * 1.15), lo = Math.max(20, per * 1.05);
  ftHeavy = ftAvg > hi ? ftHeavy + real : 0;
  ftLight = ftAvg < lo ? ftLight + real : 0;
  // iPhone は重さの山（描くコマの穴）が急に来やすいので、下げ始めを早く・下限も深くする（PC は今までどおり）
  const heavyT = isTouch ? 0.8 : 1.5, floor = isTouch ? 0.45 : 0.6;
  if (ftHeavy > heavyT) { resTarget = Math.max(floor, resTarget - 0.1); ftHeavy = 0; }
  if (ftLight > 3 && resTarget < powerRes) { resTarget = Math.min(powerRes, resTarget + 0.1); ftLight = 0; }
  const step = 0.05 * real;
  resNow = resNow < resTarget ? Math.min(resTarget, resNow + step) : Math.max(resTarget, resNow - step);
  // renderer.setSize は framebuffer を作り直す重い呼び出し。的へ寄せる途中で 0.02 刻みを跨ぐたびに呼んでいたので
  // 間（最短0.5秒）を空けてからだけ実の細かさへ反映する（見た目の的は変えない。呼ぶ回数だけ絞る）
  resCooldown -= real;
  if (resCooldown > 0) return;
  const q = Math.round(resNow * 50) / 50;
  if (Math.abs(q - resScale) >= 0.019) { resScale = q; resCooldown = 0.5; applyRenderSettings(); }
}
// 描く回数の上限：設定の値と、端末が熱い時の 30（__iosPower）の小さい方
function fpsCapNow() { return powerCap && (!S.fpsCap || S.fpsCap > powerCap) ? powerCap : S.fpsCap; }
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
  // 設定を直接切り替えた場合も、低で前の画質の影を描き続けない。
  renderer.shadowMap.enabled = (QUALITY[S.quality] || QUALITY.high).shadows;
  // 戦の側が光を直接変えた後にも、全画質で同じ夜の散乱光を当てる。
  const nightWorld = game.battle && game.battle.world;
  const night = nightWorld && nightWorld.scene === scene ? nightWorld.prepareNight() : 0;
  UNIT_NIGHT.value = night;
  FLAG_MOON.value = night;
  if (UNIT_NIGHT.value) UNIT_NIGHT_FOCUS.value.copy(game.battle.player.u.pos).applyMatrix4(camera.matrixWorldInverse).multiplyScalar(-1);
  // 画質「低」は明暗順応が無いので、夜の戦はほぼ真っ黒に沈んでいた（携帯の小さな画面で何も見えない）。夜だけ露出を上げて、月明かりの青い夜に
  if (!useFinish()) {
    const e0 = renderer.toneMappingExposure;
    // 昼の雨も、中・高の明暗順応（暗い絵を最大1.3倍）が無い分だけ少し持ち上げる
    const wr = nightWorld && nightWorld.scene === scene ? Math.min(1, nightWorld.rainLevel || 0) * (1 - night) : 0;
    renderer.toneMappingExposure = e0 * (1 + night * 1.25) * (1 + wr * 0.15);
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
  // 夜の戦は中・高でも沈みすぎて何も見えなかった（大河内の夜の雨が真っ黒）。月明かりで兵と地形の形が読める所まで上げる
  U.toneMappingExposure.value = renderer.toneMappingExposure * (1 + night * 0.7);
  U.uNight.value = night;
  adaptPass.mat.uniforms.uNight.value = night;
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
let sizeDirty = false;   // キャンバスの大きさを変えて、まだ描き直していない（setSize は絵を消す）
function resize() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  sizeDirty = true;
  renderer.setSize(w, h, false);
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
applyRenderSettings();

// 設定が変わったときに即時反映
function onSettings(key) {
  if (key === 'qualityMeasure') { qualityWarm = 0; qualityFrames = 0; qualityMs = 0; qualityHeavy = 0; qualityCooldown = 0; qualityLast = 0; }
  if ((key === 'quality' || key === 'all') && !S.qualityAuto) dynResReset();
  if (['fov', 'quality', 'drawDist', 'all'].includes(key)) applyRenderSettings();
  if ((key === 'quality' || key === 'all') && game.battle) game.battle.applyQuality();
  if (['volume', 'volSfx', 'volAmb', 'volMusic', 'all'].includes(key)) setVolume(S.volume);
  if (key === 'townMusic' || key === 'all') {
    townMusic(S.townMusic && game.inTown, game.battle?.def.season, game.inTown);
  }
  if (['voice', 'volume', 'volVoice', 'all'].includes(key) && (S.voice === 'off' || S.volume === 0 || S.volVoice === 0)) window.speechSynthesis?.cancel();
  game.hud.applySettings();
}

// ---------------- 入力 ----------------
const input = {
  keys: new Set(), edge: new Set(), dx: 0, dy: 0, touchDx: 0, touchDy: 0, wheel: 0,
  mouseL: false, mouseR: false, padL: false, padR: false, leftPressed: false, rightPressed: false,
  axis: null, lockPressed: false, quickCmd: null, runHeld: false,
  get left() { return this.mouseL || this.padL; },
  get right() { return this.mouseR || this.padR; },
  key(c) { return this.keys.has(c); },
  pressed(c) { return this.edge.has(c); },
  endFrame() { this.edge.clear(); this.dx = 0; this.dy = 0; this.touchDx = 0; this.touchDy = 0; this.wheel = 0; this.leftPressed = false; this.rightPressed = false; this.lockPressed = false; this.quickCmd = null; },
  clear() { this.keys.clear(); this.mouseL = this.mouseR = this.padL = this.padR = this.runHeld = false; this.axis = null; this.endFrame(); },
};
const GAME_KEYS = new Set(['AltLeft', 'AltRight', 'Enter', 'KeyP', 'KeyU', 'KeyB', 'BracketLeft', 'BracketRight', 'Tab', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyM', 'KeyH', 'KeyG', 'KeyQ', 'KeyR', 'KeyT', 'KeyL', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyN', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'ShiftLeft', 'ShiftRight']);
window.addEventListener('keydown', (e) => {
  if (!$('loading').hidden) return;
  if (game.deployment) {
    if (['Enter', 'Space', 'Escape'].includes(e.code)) { e.preventDefault(); if (!e.repeat) game.deployment.jump(); }
    return;
  }
  if (e.target.closest?.('.word-help') && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault(); e.stopImmediatePropagation(); e.target.closest('.word-help').click(); return;
  }
  if (game.hud.introWaiting) { if (e.code === 'Escape') { e.preventDefault(); setPause(true); } return; }
  if (e.target.closest?.('#hud button, #hud summary, #hud [role=button], #hud [role=menuitem], #choice h5, .battle-retry button')) return;
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
  // 軍議の間は時が止まったまま（game.paused が真のまま）なので、一時停止の札が出ているかで開け閉めを決める
  if (e.code === 'Escape' && !locked && !game.helpOpen) { setPause(game.gungiOn ? $('pause').hidden : !game.paused); return; }
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
let edgeX = null;   // ポインタロックが無い時のカーソルの横位置（端で回り続けるため）
function requestLock(force) {
  // 軍議の間は捕まえない（城を回す・札を押すのにマウスが要る）。攻め始めの釦だけは force で捕まえる
  if (game.hud.introWaiting || game.noLock || (game.gungiOn && !force) || !canvas.requestPointerLock) return;
  autoTry = false;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { game.noLock = true; setPause(false); }); } catch (err) { game.noLock = true; }
}
// 出陣の釦を押した時（その押した勢いのうちに）マウスを捕まえる。だめでも noLock にはせず、下に小さな案内を出すだけ
// （しくじりは Promise と pointerlockerror の両方で届くことがあるので、次に自分で捕まえに行くまで「自動の試み」の印を残す）
let autoTry = false;
function autoLock() {
  if (game.hud.introWaiting || game.noLock || locked || !canvas.requestPointerLock) return;
  autoTry = true;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { if (game.battle) lockHint(true); }); } catch (err) { /* 案内を出すだけ */ }
}
// 戦を始める：マウスを捕まえていれば（捕まえられない環境でも）そのまま始める。捕まえ損ねたら案内だけ出して始める
function beginPlay(afterView = false) {
  const seenIntro = game.hud.introRead || game.G?.battle > 0 || game.G?.history?.some(Boolean);
  if (!afterView && !seenIntro && game.battle && !isNorender()) {
    game.paused = true;
    game.hud.show(false);
    lockHint(false);
    const viewingBattle = game.battle, viewBegan = performance.now();
    const view = deploymentView(viewingBattle, camera, () => {
      if (viewingBattle.startTiming) viewingBattle.startTiming.deploymentMs = Math.round(performance.now() - viewBegan);
      game.deployment = null;
      input.clear(); input.endFrame(); input.axis = null; input.padL = input.padR = false;
      game.hud.show(true);
      beginPlay(true);
    });
    if (view) {
      game.deployment = view;
      $('cine').classList.remove('on');
      $('pause').hidden = true;
      if (document.exitPointerLock && locked) document.exitPointerLock();
      return;
    }
    game.hud.show(true);
  }
  game.starting = false;
  setPause(false);
  // 黒いチカチカ対策：場面が変わるたび、前の場面の明るさを引きずらず目の慣れをやり直す
  if (adaptPass) adaptPass.fresh = true;
  // 開戦の見出し（3.5秒）と重ならないよう、その後に出す
  if (!game.noLock && !locked) setTimeout(() => { if (game.battle && !game.hud.introWaiting && !game.noLock && !locked) lockHint(true); }, 4200);
}
// 画面の上寄りの小さな案内「クリックすると、マウスで見回せます」（下に出すと最初の台詞の字幕に重なる。大きな一時停止の画面にはしない）
function lockHint(on) {
  let el = document.getElementById('lockhint');
  if (on && !el) {
    el = document.createElement('div');
    el.id = 'lockhint';
    el.setAttribute('role', 'status');
    el.textContent = 'クリックすると、マウスで見回せます';
    el.style.cssText = 'position:fixed;left:50%;top:24%;transform:translateX(-50%);z-index:30;pointer-events:none;padding:8px 16px;background:rgba(20,18,15,.86);color:var(--washi,#ece4d2);border:1px solid var(--line,rgba(236,228,210,.16));border-radius:4px;font-size:14px;line-height:1.5;letter-spacing:.06em;white-space:nowrap';
    document.body.appendChild(el);
  }
  if (el) el.hidden = !on;
}
canvas.addEventListener('mousedown', (e) => {
  if (!game.battle || game.paused) return;
  if (isRtsOn(game.battle)) return;
  initAudio();
  // ロックに一度しくじって noLock になっても、押すたびにもう一度捕まえに行く（成功すれば元の見回しに戻る。しくじれば押した動作はそのまま通す）
  if (game.noLock && !locked && canvas.requestPointerLock && !(game.hud.introWaiting)) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* そのまま続ける */ } }
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
  edgeX = e.clientX;
  if (locked || game.noLock || document.pointerLockElement === canvas) { input.dx += e.movementX || 0; input.dy += e.movementY || 0; if (Math.abs(e.movementX) > 2) game.hud.padMode = false; }
});
// 戦の途中でページを閉じようとしたら確かめる
// 戦の途中だけ「離れますか」を聞く（城下は戻るたびに保存してあるので聞かない）
window.addEventListener('risshin-hint-save-failed', () => notice('！ 手ほどきの記録を保存できませんでした。次に開くと説明が出直すことがあります'));
window.addEventListener('音が使えない', () => notice('音を出せませんでした。画面を押して、音の設定を確かめてください。台詞は字幕で読めます'));
window.addEventListener('beforeunload', (e) => { if (game.battle && !game.battle.over && !(game.battle.def && game.battle.def.town)) { e.preventDefault(); e.returnValue = ''; } });
// 思わぬ不具合が起きたら知らせる
// 戦の途中で不具合が起きた時の知らせ（携帯と PC で同じ文。中断の札から立て直せる）
function crashNotice() { notice('問題が起きました。中断の札の「この戦をやり直す」で立て直せます'); }
window.addEventListener('error', (e) => {
  if (!game.battle) return;
  console.error(e.error || e.message);
  reportBug(e.message, `${(e.filename || '').split('/').pop()}:${e.lineno}`);
});
window.addEventListener('unhandledrejection', (e) => {
  if (!game.battle) return;
  const r = e.reason;
  console.error(r);
  reportBug(String((r && r.message) || r), ((r && r.stack) || '').split('\n')[1] || '待ちの失敗');
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) { autoTry = false; lockHint(false); game.noLock = false; edgeX = null; }
  // 軍議の間（城を回して見る・始めの寄せ）は、マウスを放しても捕まえても一時停止の札を出し入れしない
  if (game.gungiOn || game.deployment || game.hud.introWaiting) return;
  if (!locked && game.battle && !game.battle.over && !game.helpOpen && !game.mapOpen && !game.townShop) setPause(true);
  if (locked) setPause(false);
});
document.addEventListener('pointerlockerror', () => { if (autoTry) { autoTry = false; if (game.battle) lockHint(true); return; } game.noLock = true; setPause(false); });
// 別のタブに移ったら止める
document.addEventListener('visibilitychange', () => {
  if (ldPlan && document.hidden) ldPlan.hidden = true;
  duck(document.hidden);
  if (document.hidden) { input.clear(); window.speechSynthesis?.cancel(); }
  if (document.hidden && game.battle && !game.battle.over) setPause(true);
});
// iPhone・iPad のアプリ（ios/ の GameView.swift）から：裏へ回る・電話・コントロールセンターを開いた（false）／戻った（true）
// 戦は一時停止（戻ったら札の「再開する」で続ける）。城下を歩いている時は、その場で保存もする
window.__iosActive = (on) => {
  duck(!on);
  if (on) return;
  if (ldPlan) ldPlan.hidden = true;
  input.clear(); window.speechSynthesis?.cancel();
  const b = game.battle;
  if (b && !b.over && !game.paused) setPause(true);
  if (b && b.def.town && game.G) { try { save(game.G); } catch (e) { /* 書けなくても続ける */ } }
};
// 端末が熱い（thermal 2＝かなり・3＝とても）・低電力モード：描く回数を 30 までにし、細かさの上限も下げる。冷えたら戻す（設定には書かない）
let powerCap = 0, powerRes = 1, powerTold = false;
window.__iosPower = (o) => {
  const t = (o && o.thermal) || 0, low = !!(o && o.lowPower);
  powerCap = t >= 2 || low ? 30 : 0;
  powerRes = t >= 3 ? 0.6 : t >= 2 ? 0.75 : 1;
  if (resTarget > powerRes) resTarget = powerRes;
  if (t >= 2 && !powerTold && game.battle) { powerTold = true; notice('端末が熱くなってきたので、描き込みを軽くしました'); }
  if (t < 2) powerTold = false;
};

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
  if (ph) el.innerHTML = `<b>写真モード</b>　${K('forward')}${K('left')}${K('back')}${K('right')} 移動・${K('dodge')}／${K('attack')} 上下・マウス 見回す・ホイール 画角<br>1〜4 色合い（いま：${FILTER_NAMES[ph.filter]}）・H 自分を隠す・G 構図の線・K 撮る・P 戻る`;
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
  // ポインタロックが使えない時（noLock）は、カーソルが画面の端に着いてもそこで止まらず、端に押し当てている間は向きが回り続ける（左右とも360度向ける）
  if (game.noLock && !locked && game.battle && !game.paused && !isRtsOn(game.battle) && edgeX !== null && !isTouchLd()) {
    const w = window.innerWidth || 1, m = Math.min(48, w * 0.04);
    if (edgeX <= m) input.dx -= 9 * (1 + (m - edgeX) / m);
    else if (edgeX >= w - 1 - m) input.dx += 9 * (1 + (edgeX - (w - 1 - m)) / m);
  }
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (!gp) { input.axis = null; input.padL = input.padR = false; return; }
  const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
  const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const edge = (i) => b(i) && !padPrev[i];
  if (game.deployment) {
    if (edge(0) || edge(9)) game.deployment.jump();
    gp.buttons.forEach((bt, i) => { padPrev[i] = bt.pressed; });
    return;
  }
  // 戦の外（タイトル・城下・評価）と一時停止中は、十字キーで釦を選び A で押す
  const menuOpen = !game.battle || game.paused;
  if (menuOpen) {
    const root = glossaryDialog() || (!$('pause').hidden ? $('pause') : $('screen'));
    const items = [...root.querySelectorAll('button:not([disabled]), input, select, textarea, summary')].filter((e) => e.offsetParent !== null);
    if (items.length) {
      let idx = items.indexOf(document.activeElement);
      const move = (d) => { idx = idx < 0 ? 0 : (idx + d + items.length) % items.length; items[idx].focus({ preventScroll: true }); items[idx].scrollIntoView({ inline: 'nearest', block: 'nearest' }); sfx('hover'); };
      if (edge(13) || edge(15)) move(1);
      if (edge(12) || edge(14)) move(-1);
      if (edge(0) && document.activeElement && items.includes(document.activeElement)) document.activeElement.click();
      if (edge(1)) { if (glossaryDialog()) root.close(); else { const back = root.querySelector('#st-close, #help-close, #pm-resume, #go-no, #nc-no'); if (back) back.click(); } }
    }
  }
  if (edge(9)) { if (glossaryDialog()) glossaryDialog().close(); else if (game.battle && !game.battle.over) setPause(game.gungiOn ? $('pause').hidden : !game.paused); }
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
  if (!$('loading').hidden) { input.clear(); return; }
  if (game.deployment) { input.clear(); return; }
  // 軍議（gungi.js）の間は、札を閉じても時は止めたまま（軍議の下で戦が動き出し、カメラが自分の目へ戻るのを防ぐ）
  game.paused = on || !!game.gungiOn;
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
      town: !!b.def.town,
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
setGlossaryBeforeOpen(() => {
  input.clear();
  if (game.battle && !game.paused && !game.battle.over) {
    setPause(true);
    if (document.exitPointerLock && locked) document.exitPointerLock();
  }
});
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
  (G) => ({ year: '五年後　永禄九年（1566）九月　美濃', title: '墨俣（武功夜話の伝え）', text: [
    '美濃攻めは難航していた。長良川の西岸、墨俣に砦を築く――その普請を任されたのは、木下藤吉郎という男であった。',
    `小競り合いを重ねた${G.name}は、${RANKS[G.rank].name}として${RANKS[G.rank].squad}人の組を率い、砦の守りにつく。`,
  ], button: '墨俣へ' }),
];

const TIPS = [
  '桶狭間では、信長が「首は取るな、討ち捨てにせよ」と命じたと『信長公記』は伝えています。',
  '敵の頭上に「！」が出たら攻撃の合図。その直前に右クリックで構えると受け流しになります。',
  '敵足軽を倒すだけでは戦功に上限があります。任務・救援・側面攻撃のほうが大きな手柄です。',
  `${K('follow')}・${K('hold')}・${K('attack')}・${K('retreat')}で、号令の札を開かずに組へ号令できます。文字キーの段を左から数えます。`,
  `${K('view')}で、自分の目で見る向きと、背中から見る向きを切り替えられます。`,
  '士気が尽きた部隊は崩れて逃げ出します。横や後ろから突くと士気が大きく下がります。',
  `${K('lock')}で敵を狙い定めると、乱戦でも相手を見失いません。`,
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
  ...ADDITIONAL_TIPS,
];

// この戦の心得（物語の幕間に添える）
// 心得は一行で。キーの字は書かず、割り当てが変わっても困らない言い方に（長押しの物は EK() で出す）
TIPS_BATTLE_BY.okehazama = ['列を離れず合図を待て。首は取らず、本陣の旗本は味方と囲んで崩せ', '五人を指示地点に揃え、法螺貝を待ってから横腹を突け', '柵の内から槍で突け。二の手では南の門から出て荷駄を迎えよ'];
const EK = () => (isTouch ? '「取る」の長押し' : `${K('use')} の長押し`);

// ---------------- 織田家編：物語の札と心得（戦の id で引く。戦を足したら、ここにも一つ足す） ----------------
// 年・場所と約百六十字の要点を先に見せ、背景と心得は畳む。持ち場は遊びの復元を含む。
STORY_BY.oda = {
  okehazama: () => ({ battleId: 'okehazama', compact: true, boss: '織田方の上役', year: "永禄三年（1560）五月十九日　尾張・桶狭間", title: "桶狭間", text: [
    "あなたは織田の槍の足軽。中島砦から進んだ谷の出口で、組頭の下知を聞く。雨が弱まり、合図が出たら味方の旗に続け。道の守りを崩し、本陣の幕の口へ寄せる。義元の旗本を味方と崩せ。討取りの後、組と谷を抜ければ任務達成。首取りに足を止めるな。",
    "丸根・鷲津の砦が落ちた後、信長は今川の本陣へ向かった。主人公の持ち場と組の働きは、遊びのための補い。",
  ], button: "組の持ち場へ進む" }),
  moribe: () => ({ battleId: 'moribe', compact: true, boss: '織田方の上役', year: "永禄四年（1561）五月　美濃・森部", title: "森部", text: [
    "織田信長が美濃へ進み、斎藤龍興の兵と森部でぶつかる。あなたは五人の槍組を率いる。雨の楡俣川を腿までつかって渡り、向こう岸の畦で組をそろえよ。法螺貝が鳴ったら前備に続いて斎藤の先手を押し、長い槍の押し合いを支える。長井・日比野の旗本へ攻め入り、退く敵を見届けて組を集めれば勝ち。",
    "信長公記は雨中の楡俣川渡河と長い槍戦、長井・日比野らの討死を伝える。細かな布陣や浅瀬は遊びの補い。",
  ], button: "森部へ出陣する" }),
  sunomata: () => ({ battleId: 'sunomata', compact: true, year: "永禄九年（1566）九月の伝承　美濃・墨俣", title: "墨俣築城防衛", text: [
    "織田方が川を背に砦を築き、斎藤方が北と西から寄せる。あなたは普請を守る組の指揮役。柵を直し、材木を南門へ運び、川からの上陸にも備える。夕暮れの最後の寄せまで持ちこたえ、砦を完成させれば勝ち。一夜城の伝承を使った戦。",
    "信長公記にあるのは永禄四年（1561）の洲股の要害修築と在陣。永禄九年の藤吉郎による一夜城は伝承として分ける。三度の寄せと舟の上陸は遊びの補い。味方千五百・敵四千は、人足と控えを含む仮の目安。",
  ], button: "砦の守りにつく" }),
  inabayama: () => ({ battleId: 'inabayama', compact: true, year: "永禄十年（1567）八月　美濃・稲葉山城", title: "稲葉山城", text: [
    "織田信長が斎藤龍興の稲葉山城を攻める。西美濃の三人衆が織田につき、城は孤立した。あなたは木下藤吉郎の手の攻め手。井口の町で決められた所に火をかけ、斎藤の出撃を退ける。藤吉郎に続いて山の裏道を上れ。本丸の守りを退け、小屋に合図の火をつければ任務達成。",
    "城は金華山の上にある。放火の翌日から囲みを続け、半月ほどで龍興は城を明け渡した。藤吉郎の裏道攻めは後世の伝え。道筋と合図の火は遊びの補い。手向かわぬ町の者は討たない。",
  ], button: "井口の町へ進む" }),
  mitsukuri: () => ({ battleId: 'mitsukuri', compact: true, year: "永禄十一年（1568）九月十二日　近江・箕作城", title: "箕作城", text: [
    "足利義昭を京へ送る織田信長の前に、六角義賢・義治の城々が立ちはだかる。あなたは木下藤吉郎の手。まず三の郭の守りを退ける。日が暮れたら松明を灯し、木戸を破る組を守る。二の丸から本丸へ進み、仲間と三つの曲輪を押さえれば勝ち。",
    "箕作城は六角の本城・観音寺城を支える城。箕作城の落城後、六角方は観音寺城を退いた。松明や門での局地戦は遊びの復元。",
  ], button: "箕作山へ進む" }),
  okawachi: () => ({ battleId: 'okawachi', compact: true, year: "永禄十二年（1569）九月　伊勢・大河内城", title: "大河内城", text: [
    "織田信長が北畠具教・具房の大河内城を囲む。あなたは丹羽長秀の手で攻め口と退路を守る。九月八日の夜攻めは雨で鉄砲が使えず、押し返される。坂道を守って南の陣へ退き、兵糧の道を封じて和睦まで囲みを保てば勝ち。無理な総攻めはしない。",
    "信長公記は西の搦手からの夜攻めを記す。遊びでは南の搦手の西寄りから進む。夜攻めの後は包囲が続き、信長の子を北畠の養子にする和睦へ進んだ。",
  ], button: "大河内へ出陣する" }),
  kanegasaki: () => ({ battleId: 'kanegasaki', compact: true, year: "元亀元年（1570）四月　越前・金ヶ崎", title: "金ヶ崎", text: [
    "朝倉を攻めた織田勢に、同盟していた浅井の離反が届く。信長は京へ退き、木下藤吉郎らが追手を止める。あなたは最後尾を守る殿（しんがり）。谷道で朝倉の追手を引きつけ、鉄砲と槍で時を稼ぐ。味方が退くまで守り、自分も逃げ切れば勝ち。",
    "秀吉・光秀らの退却を支える働きを土台にした戦。谷の伏せ兵や持ちこたえる時間は、遊びのための補い。",
  ], button: "殿の持ち場につく" }),
  anegawa: () => ({ battleId: 'anegawa', compact: true, year: "元亀元年（1570）六月二十八日　近江・姉川", title: "姉川", text: [
    "織田信長・徳川家康が、姉川で浅井長政・朝倉方と向き合う。あなたは森可成の手で織田の組を率いる。川原の正面で槍を合わせ、織田の列を深く破る浅井の先手を受け止める。回り込む敵にも備え、味方と押し返す。下知が出たら森の備と川を渡り、浅井のしんがりを崩せば勝ち。",
    "東で織田と浅井、西で徳川と朝倉が戦ったとされる。磯野員昌の深い突入を採るが、細かな陣形や主人公の持ち場は遊びの復元。",
  ], button: "姉川の川原へ進む" }),
  nodafukushima: () => ({ battleId: 'nodafukushima', compact: true, year: "元亀元年（1570）九月　摂津・野田と福島", title: "野田・福島", text: [
    "織田信長が三好三人衆の野田・福島の砦を囲む。あなたは前田利家の手の攻め手。水路と湿地を越えて砦へ寄せるが、本願寺の参戦で横と後ろにも敵が現れる。早鐘が鳴ったら攻めをやめ、退路を守る。囲まれる前に味方と退ければ勝ち。",
    "本願寺の参戦に加え、浅井・朝倉が京へ迫ったため信長は摂津を退いた。舟や浅瀬、主人公が守る堤は遊びの復元。",
  ], button: "砦の攻め口へ進む" }),
  shiga: () => ({ battleId: 'shiga', compact: true, boss: '森可成', year: "元亀元年（1570）九月　近江・坂本と宇佐山城", title: "志賀の陣・宇佐山城", text: [
    "浅井・朝倉の大軍が坂本へ進み、森可成の少ない兵が迎え撃つ。あなたは森可成の手の守備兵。町口で先手を押し返した後、大軍を受けて南の坂から宇佐山城へ退く。端の砦が燃えても本丸を守り、信長の援軍が届くまで持ちこたえれば勝ち。",
    "十六日の町口の戦いから、十九日ごろの森可成らの討死、二十四日の信長の援軍までを一戦にまとめる。日付には異説があり、城の曲輪や門の攻防は推定を含む。",
  ], button: "坂本の町口へ進む" }),
  hieizan: () => ({ battleId: 'hieizan', compact: true, year: "元亀二年（1571）九月十二日　近江・比叡山", title: "比叡山", text: [
    "織田信長が、浅井・朝倉を支えた比叡山を焼き討ちする。あなたは明智光秀の手で山道を進む兵。燃える堂と坂本の町を通り、刃向かう守りの兵を退けて上へ進む。手向かわぬ僧や里の者を討たず、下知された山道の掃討を終えれば勝ち。",
    "史実では僧だけでなく多くの人々が犠牲になった。遊びでは手向かわぬ者を討つと咎めを受ける。救出や一騎打ちを勝ちの条件にはしない。",
  ], button: "比叡山の山道へ進む" }),
  mikatagahara: () => ({ battleId: 'mikatagahara', compact: true, boss: '佐久間信盛', year: "元亀三年（1572）十二月二十二日　遠江・三方ヶ原", title: "三方ヶ原", text: [
    "徳川家康が浜松城を出て武田信玄を追い、台地で強い武田勢に包まれる。味方は徳川と織田の援軍。あなたは佐久間信盛の援軍に加わる兵。押し寄せる武田の各隊に飲まれぬよう槍をそろえる。崩れる味方と退き、生きて浜松城へ戻れば勝ち。",
    "日付は当時の暦。今の暦では1573年になる。武田を押し崩す戦ではなく、敗れる軍からの退却を描く。主人公の援軍内の持ち場は遊びの補い。",
  ], button: "台地へ出陣する" }),
  tonezaka: () => ({ battleId: 'tonezaka', compact: true, year: "天正元年（1573）八月　越前・刀根坂から一乗谷", title: "刀根坂・一乗谷", text: [
    "小谷の援軍に来た朝倉義景が越前へ退き、織田信長が追い討ちをかける。あなたは織田の先手に続く兵。峠道で朝倉の殿を崩し、立て直す敵にも足を止めず進む。街道から一乗谷の城下まで追い、朝倉方の抵抗を崩して道を押さえれば勝ち。",
    "刀根坂の敗走後、一乗谷が焼かれ、朝倉景鏡の離反で義景は追い詰められた。街道の長さや主人公の追撃の順は遊びの復元。",
  ], button: "刀根坂へ追撃する" }),
  odani: () => ({ battleId: 'odani', compact: true, year: "天正元年（1573）八月　近江・小谷城", title: "小谷城", text: [
    "朝倉が滅び、織田勢は小谷城を囲む。あなたは羽柴秀吉の手の兵。夜の清水谷を登り、大野木屋敷から京極丸へ攻め入る。南北の反撃を退けたら、押さえを残して小丸へ。味方と小丸の内を押さえれば、この組の勝ち。",
    "京極丸を取ることで長政の本丸と久政の小丸を分ける攻めを土台にした戦。門ごとの攻防と主人公の持ち場は遊びの復元。",
  ], button: "小谷の尾根へ進む" }),
  nagashima: () => ({ battleId: 'nagashima', compact: true, year: "天正二年（1574）九月　伊勢・長島の輪中", title: "長島一向一揆", text: [
    "織田信長が長島の門徒勢を陸と九鬼水軍で囲む。あなたは柴田勝家の手で岸を守る兵。柵を結び、水路を封じる。退城する舟への織田方の射撃で、門徒が反撃に転じる。岸の持ち場を守り、中江・屋長島の砦が燃えるまで囲みを保てば勝ち。",
    "信長公記は降伏後の退城への射撃、門徒の反撃、中江・屋長島への放火を記す。大勢の人が犠牲になった。局地の寄せの波と持ちこたえる秒数は遊びの補い。",
  ], button: "輪中の岸へ進む" }),
  shitaragahara: () => ({ battleId: 'shitaragahara', compact: true, year: "天正三年（1575）五月二十一日　三河・設楽原", title: "長篠・設楽原", text: [
    "武田勝頼が長篠城を囲み、織田信長・徳川家康が設楽原で迎え撃つ。あなたは前田利家の手で柵を守る。組を預かる身分なら、自分の組へ下知する。柵と鉄砲の持ち場を固め、山県の赤備えや真田の隊の突撃を止める。柵の敵を味方と押し返し、下知で東へ追う。退き口の馬場隊を崩せば勝ち。勝頼は深追いするな。奥の柵を三十秒占められると負ける。",
    "連吾川の西の柵と鉄砲を土台にした戦。一律の三段撃ちと断定せず、合図に合わせた射撃と柵際の槍戦を描く。局地の敵の入り方は遊びの復元。",
  ], button: "柵の内の持ち場につく" }),
  echizen: () => ({ battleId: 'echizen', compact: true, year: "天正三年（1575）八月　越前・木ノ芽峠", title: "越前・木ノ芽峠", text: [
    "峠口の先手と本道を登る。観音丸の木戸を破り、味方と中を押さえる。次は木ノ芽峠城の主郭へ。上からの矢玉は構えで防げない。竹束や塀の陰へ寄れ。",
    "朝倉滅亡後、越前では一揆勢が支配を広げた。信長の侵攻時、明智・羽柴の手は海側を攻めた。この戦は、峠口の先手が正面から攻めた場合の補い。詳しい史実は戦後の札で読める。",
  ], button: "木ノ芽峠へ進む" }),
  echizen_ikko: () => ({ battleId: 'echizen_ikko', compact: true, boss: '滝川一益', year: "天正三年（1575）八月　越前・大滝寺", title: "越前・大滝寺の夜討ち", text: [
    "織田勢が越前へ進み、山の大滝寺の守りを攻める。あなたは滝川一益の先手。麓から惣門、石段、山門を越えて本堂へ進む。堂が燃えて守りが山上へ退いたら、奥の院を押さえる。手向かわぬ者を討たず、奥山道を九十秒守りきれば勝ち。",
    "大滝寺は白山信仰の寺で、本願寺の寺とは断定しない。滝川一益による堂塔の焼失を土台にした戦。夜討ち、霧、道の寸法や局地の兵数は遊びの補い。",
  ], button: "大滝寺の麓へ進む" }),
  iwamura: () => ({ battleId: 'iwamura', compact: true, year: "天正三年（1575）十一月　美濃・岩村城と水晶山", title: "岩村城・水晶山", text: [
    "織田信忠が、武田の秋山虎繁が守る岩村城を囲む。あなたは河尻秀隆の手で水晶山の陣を守る兵。柵の持ち場に篝火を焚き、夜討ちに備える。山道から来る武田勢を槍で受け止め、退く敵を味方と城の麓まで追う。本陣へ入り込まれ、持ち場を崩されれば失敗。麓で組と合流し、追い討ちを止めれば任務を終える。",
    "十一月十日の水晶山への夜討ちと、城方が合流を試みた出撃を描く。夜討ち勢の所属、篝火の持ち場、人数、道と霧は復元。信忠の城への追撃、後日の開城と処刑は戦後の史実で読む。",
  ], button: "水晶山の柵につく" }),
  tennoji: () => ({ battleId: 'tennoji', compact: true, year: "天正四年（1576）五月七日　摂津・天王寺砦", title: "天王寺", text: [
    "本願寺勢が明智光秀の天王寺砦を囲み、織田信長が少ない兵で救援に向かう。あなたは明智勢の砦守備兵。まず囲みを耐え、南から来る味方の三段の攻めに合わせて打って出る。砦で合流した後は北へ押し返し、本願寺の城戸口への道を開けば勝ち。",
    "信長公記の救援と、砦に入った後の再攻撃を土台にした戦。信長は先手に交じり、足に鉄砲傷を負っても指揮を続けた。その史実を表す足の傷と、戦で受ける傷は別。深手で戦えなくなれば攻めは崩れる。砦の縄張りと攻防の時間は推定。",
  ], button: "天王寺砦を守る" }),
  saika: () => ({ battleId: 'saika', compact: true, year: "天正五年（1577）二月　紀伊・小雑賀川", title: "雑賀攻め・小雑賀川", text: [
    "織田信長が紀伊へ入り、雑賀衆が小雑賀川の高い西岸で迎える。あなたは堀秀政の先手。川を渡るが、岸の鉄砲に阻まれて引き返す。味方の援護で東岸へ戻り、用意された竹束の後ろで持ち場を固める。川上と川下の寄せを払い、東岸の陣を保てば勝ち。",
    "信長公記の渡河、引き退き、川を挟んだ対陣を採る。雑賀の柵を破って追う戦にはしない。杭や竹束、細かな回り込みは遊びの補い。",
  ], button: "小雑賀川へ進む" }),
  tedorigawa: () => ({ battleId: 'tedorigawa', compact: true, year: "天正五年（1577）九月　加賀・手取川", title: "手取川", text: [
    "上杉謙信が七尾城を落とし、援軍に来た柴田勝家の織田勢へ迫る。あなたは柴田の手で最後尾を守る殿（しんがり）。雨で増える手取川へ味方が退く間、上杉の追撃を槍で止める。崩れる味方を渡らせ、自分も南の岸へ逃げ切れば勝ち。",
    "秀吉は勝家と意見が合わず陣を離れたとされる。合戦の規模や経過には諸説がある。雨中の退却を芯に、浅瀬と主人公の殿の持ち場は遊びの復元。",
  ], button: "手取川の退路を守る" }),
  shigisan: () => ({ battleId: 'shigisan', compact: true, year: "天正五年（1577）十月　大和・信貴山城", title: "信貴山城", text: [
    "松永久秀が織田に背き、信貴山城へ籠もる。織田信忠の軍が城を囲み、筒井順慶も攻め手に加わる。あなたは筒井の手の兵。尾根道の伏兵を退け、門を破る味方を守る。北の曲輪から本丸へ進み、最後の守りを崩して城を押さえれば勝ち。",
    "十月十日の夜攻めと落城を土台にした戦。尾根の伏兵や曲輪ごとの攻め方は推定の復元。松永久秀は天守に火を放ち、自害した。",
  ], button: "信貴山の尾根へ進む" }),
  kizugawa: () => ({ battleId: 'kizugawa', compact: true, year: "天正六年（1578）十一月六日　摂津・木津川口の沖", title: "第二次木津川口", text: [
    "九鬼嘉隆の六艘の大船が、毛利水軍の包囲を受ける。味方は織田、敵は本願寺へ兵糧を送る船団。あなたは九鬼の船で大筒と甲板を守る兵。まず俵を積んだ兵糧船を一艘止める。甲板の火を消し、乗り込む敵を退ける。敵の大将船を近くへ引きつけて撃ち、自分の船を守れば勝ち。兵糧船が二艘抜けると負け。",
    "信長公記の近距離で大将船へ大鉄砲を放つ戦いを芯にする。船の鉄張りの範囲や海上封鎖の成否には諸説がある。消火と甲板戦は遊びの補い。",
  ], button: "九鬼の大船に乗る" }),
  miki: () => ({ battleId: 'miki', compact: true, year: "天正七年（1579）九月十日　播磨・三木と大村坂", title: "三木城・大村の合戦", text: [
    "羽柴秀吉が別所長治の三木城を囲み、毛利方が兵糧を運び込もうとする。あなたは囲みを守る兵。西の道で槍組と合流し、荷の護衛を退ける。平田の口で城兵を止めたら、柵の西を回って大村へ。寄せ手を退け、大村の輪へ戻れば勝ち。俵は余裕があれば押さえよう。",
    "三木城への兵糧搬入と、付城をめぐる大村の合戦をまとめる。主人公の荷駄奪取や移動の道筋は遊びの復元。城の降伏は翌年。",
  ], button: "三木の付城へ進む" }),
  arioka: () => ({ battleId: 'arioka', compact: true, year: "天正七年（1579）十月　摂津・有岡城", title: "有岡城", text: [
    "織田に背いた荒木村重が有岡城を離れ、城内から織田へつく申し出が届く。味方は織田、敵は荒木方の城兵。あなたは滝川一益の手の攻め手。内応の合図を待ち、開いた木戸から城の町へ入る。守りを退け、入った木戸と道を固めれば勝ち。",
    "有岡城は町も囲む城。内応による城の町への攻め入りと、その後の城の抵抗を分ける。黒田官兵衛の救出を、この札の勝ちの条件にはしない。",
  ], button: "有岡の木戸へ進む" }),
  iga: () => ({ battleId: 'iga', compact: true, year: "天正九年（1581）九月　伊賀・比自山城", title: "天正伊賀の乱・比自山城", text: [
    "織田方が伊賀へ入り、比自山城の伊賀衆を囲む。あなたは丹羽長秀の一組。夜討ちを防ぎ、南の土橋から攻めるが、城の強い守りに阻まれる。正面攻めをやめて麓を囲み、夜の出撃を退ける。伊賀衆が退いた後、空の曲輪を押さえれば勝ち。",
    "比自山の夜討ち・抵抗・退去は伊乱記の伝承で補う。信長公記の九月十一日の退去は佐奈具の事で、比自山へ移さない。細かな配置と消火は遊びの復元。",
  ], button: "比自山の南の陣につく" }),
  tottori: () => ({ battleId: 'tottori', compact: true, year: "天正九年（1581）十月　因幡・鳥取城と千代川", title: "鳥取城", text: [
    "羽柴秀吉が、毛利方の吉川経家が守る鳥取城を兵糧攻めにする。あなたは秀吉の手で千代川の岸を守る兵。岸の兵糧舟を止め、城への荷を断つ。打って出る城兵を柵の前で受け止め、退く者を追わない。川と城の出口を守り、開城を迎えれば勝ち。",
    "数か月の包囲と兵糧攻めを短い一戦にまとめる。城内では飢えで多くの人が苦しんだ。舟や柵の局地戦、主人公の持ち場は遊びの復元。",
  ], button: "千代川の岸につく" }),
  takato: () => ({ battleId: 'takato', compact: true, year: "天正十年（1582）三月二日　信濃・高遠城", title: "高遠城", text: [
    "織田信忠が、武田方の仁科盛信が守る高遠城へ両口から攻めかかる。あなたは森長可の大手先手。夜明けに寄せ、打って出る城兵を退ける。三の丸から二の丸の空堀と土橋を越えて本丸へ進む。最後の備えを崩し、旗の周りを固めれば勝ち。",
    "信長公記の両口からの突入を土台にした一日攻め。大手は森ら、搦手は信忠の旗本が攻める。城の縮尺と局地の反撃の時間は遊びの復元。",
  ], button: "高遠の大手へ進む" }),
  tano: () => ({ battleId: 'tano', compact: true, year: "天正十年（1582）三月十一日　甲斐・田野、天目山の麓", title: "田野・天目山", text: [
    "織田方の滝川一益が、少ない供と逃れる武田勝頼を谷道で追い詰める。あなたは滝川の先手。日川と崖に挟まれた道で敵の寄せを止め、鉄砲の煙に続いて押す。田野の民家に置かれた仮の柵へ進み、土屋昌恒らの最後の抵抗を崩せば勝ち。",
    "信長公記の険しい山中、平屋敷の仮柵、打って出る侍を芯にする。城攻めや騎馬大軍の戦いにはしない。道幅、鉄砲の合図と主人公の動きは遊びの復元。",
  ], button: "日川の谷へ進む" }),
  honnoji: () => ({ battleId: 'honnoji', compact: true, year: "天正十年（1582）六月二日　山城・京、本能寺と二条御所", title: "本能寺の変", text: [
    "明智光秀が織田信長に背き、夜明けの京へ大軍を入れる。味方は信長・信忠の少ない兵。あなたは本能寺の門を守る一人。信長のそばで戦い、本堂から御殿へ退く。裏門から落ちのびた後は、二条御所の守りに加わる。退く下知が出たら北の口へ。生き延びれば任務達成。",
    "史実では信長は本能寺、信忠は二条御所で亡くなった。主人公の持ち場と脱出は遊びのための補いで、信長や信忠を生き延びさせる筋ではない。",
  ], button: "夜明けの京へ進む" }),
};
TIPS_BATTLE_BY.oda = {
  okehazama: TIPS_BATTLE_BY.okehazama[0], moribe: '楡俣川を渡って畦で組をそろえ、法螺貝で前備に続け。長井・日比野の旗本を崩し、集結の旗へ戻れ', sunomata: '柵を直し、材木を南門へ運べ。北・西・川岸の持ち場を守り、砦の完成まで耐えよ',
  kanegasaki: TIPS_BATTLE_BY.nobunaga_hoi[0], anegawa: TIPS_BATTLE_BY.nobunaga_hoi[1], hieizan: TIPS_BATTLE_BY.nobunaga_hoi[2],
  inabayama: '印の家にだけ火を放て。手向かわぬ町の者は討つな。打って出た斎藤勢を退けたら、藤吉郎について搦手を登れ',
  mitsukuri: 'まず三の郭を取れ。日が暮れたら松明を灯し、木戸を破る組を守れ。仲間と二の丸、本丸へ進め',
  okawachi: '夜攻めが押し返されたら坂の退路を守り、南の陣へ退け。兵糧の道を封じ、囲みを保て',
  nodafukushima: '水路を越えて砦へ寄せよ。早鐘で敵が横と後ろへ来たら、攻めをやめて退路を守れ',
  odani: '秀吉について夜の谷を京極丸まで登れ。取ったら本丸と小丸の両方からの寄せを凌げ',
  nagashima: '岸に柵を結い、水路を封じよ。退城への射撃の後、反撃する門徒を受け止め、囲みを保て',
  takato: '大手門を破る組を守り、三の丸・二の丸・本丸と一つずつ取れ。仁科の兵は降らない',
  honnoji: '表門を見回り、信長様と共に寺を守れ。退く下知に従い、二条御所でも門を支えよ。最後は北の口から落ちのびよ',
  shitaragahara: '柵の持ち場を固めよ。山県・真田の寄せを受け、柵の間に入った敵へ合図で鉄砲を集め、槍で崩せ',
  shiga: '町口で朝倉の先手を受け止めよ。退けの下知が出たら宇佐山城へ。木戸の前で、取り付く寄せ手を討て',
  tonezaka: '刀根坂の殿を崩し、街道から一乗谷まで追え。返し合わせにも足を止めず、道を押さえよ',
  echizen: '先手と本道を登れ。観音丸の木戸を破り、奥の曲輪から主郭へ。矢玉は竹束や塀の陰で避けよ',
  echizen_ikko: '麓から山門・本堂・奥の院へ進め。手向かわぬ者は討たず、奥山道を九十秒守れ',
  tennoji: '砦を守り、南から来る信長の救援に合わせて囲みを破れ。合流後は北の城戸口へ押せ',
  tedorigawa: '浅瀬の口で殿を務め、騎馬には槍を揃えよ。味方が渡りきったら、止まらずに南の岸へ',
  shigisan: `伏兵を退け、門の脇の物見櫓に${EK()}で火をかけよ。門を破る組を守り、天守の前で最後の衆を退けよ`,
  miki: '西の槍組と合流し、荷の護衛と平田へ寄せる城兵を退けよ。柵の西から大村へ進み、敵を退けて輪へ戻れ。俵は後でよい',
  arioka: `内応の合図で開いた木戸から入れ。城の町の守りを退け、木戸と道を固めよ`,
  iga: `夜討ちを防げ。南の守りが強ければ正面攻めをやめ、麓を囲め。敵の退去後に曲輪を押さえよ`,
  kizugawa: `甲板の火を消し、乗り込む敵を退けよ。大将船を引きつけ、合図で大筒をそろえて放て`,
  saika: `渡河が阻まれたら味方の射撃に合わせて戻れ。東岸の竹束を確かめ、川上・川下の寄せを払え`,
  tano: '谷道の寄せを止め、鉄砲の合図で崖道を押せ。平屋敷の仮柵の口を固めよ',
  mikatagahara: '武田の先手を槍を揃えて受けよ。赤備えが来たら崩れる前に組をまとめ、退けの下知で浜松城へ走れ（生きて戻ることが任務）',
  tottori: `舟の番を退け、岸の兵糧舟に${EK()}で火をかけよ。打って出た城兵は柵の前で止め、逃げ帰る者は追うな`,
  iwamura: `柵の持ち場に${EK()}で篝火を焚け。夜討ちは柵を背に槍を揃えて受け、崩れたら城の麓まで追え`,
};

// どの遊び方でも、戦の始まりに視点の切り替えを知らせる
const VIEW_TIP = () => (matchMedia('(pointer: coarse)').matches ? '左上の「視点」で一人称・三人称' : `${K('view')} で一人称・三人称`);
const LORD_TIP = () => (matchMedia('(pointer: coarse)').matches ? '左上の「地図」で軍配の図（味方の全部の隊を動かす）、「使番」で近くの備へ下知' : `${K('map')} で軍配の図（味方の全部の隊を動かす）・ジェーで使番・${K('command')} で旗本へ号令`);

let curG = null;
const game = {
  // 遊ぶ保存が替わるたびに、その保存の筋書き（戦の並び）へ切り替える
  get G() { return curG; },
  set G(v) { curG = v; if (v) setScenario(v.scenario || 'okehazama'); },
  // 軍議（gungi.js）から呼ぶ：一時停止の札を開く・攻め始めの釦でマウスを捕まえる
  openPause: () => setPause(true), requestLock: () => requestLock(true), gungiOn: false,
  resumeBattleRetry: () => { input.clear(); silence(); clearEdgeDark(); },
  hud: new Hud(), camera, battle: null, paused: false, helpOpen: false, lastResult: null, snapshot: null, noLock: false, hitstop: 0, starting: false, bg: null,

  // ゲームパッドの振動
  vibrate(strength, ms) {
    if (!S.vibrate || !this.pad || !this.pad.vibrationActuator) return;
    try { this.pad.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }); } catch (e) { /* 非対応 */ }
  },

  title(pick = '') {
    this.trialReturn = '';
    // 題の画面では戦・人物の素材を読み始めない。
    closeJapan();
    this.stopBattle();
    this.inTown = false;
    townMusic(false);
    playMusic('title');
    // 題の 3D は一度だけ作って使い回す（戻るたびに木・草・兵を作り直さない。890）
    this.bg = this.titleBg || (this.titleBg = titleScene());
    const saved = readProgress(S.slot).game;
    if (saved) setScenario(saved.scenario || 'okehazama');
    titleScreen(saved,
      (name, diff, scn) => { initAudio(); this.G = newGame(name, diff, scn); save(this.G); this.bg = null; this.story(0); },
      () => { initAudio(); this.G = saved; this.bg = null; this.resume(); },
      () => settingsScreen(onSettings, () => this.title()),
      async (G) => { initAudio(); G.slot = S.slot; this.G = G; setScenario(G.scenario); this.bg = null; const ok = await this.resume(); if (ok === false) return false; save(G); notice(progressStored(G) ? '保存コードを確かめて再開し、端末へ保存しました' : '！ 再開しましたが、端末へ保存できませんでした。保存コードを控えてください'); return true; },
      (i, del) => { if (del) { notice(deleteProgress(i) ? 'この枠の記録を消しました' : '！ 記録を消せませんでした。端末の保存の設定を確かめ、もう一度お試しください'); } S.slot = i; saveSettings(); this.title(); },
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
        get list() { return lordList(); },   // 侍大将で出陣と同じ戦の一覧。開く時に作る（題の画面の時はまだ戦の定義を読んでおらず、9戦だけになっていた）
        onBattle: (id, view) => { initAudio(); this.startAsNobunaga(id, view); },
        onMap: (k) => { initAudio(); this.japanAsLord(k); },
      }, pick);
  },

  resume() {
    const G = this.G;
    if (G.japan) return this.japanMap('title', true);
    if (G.battle >= BATTLES.length) return finalScreen(G, () => this.title(), () => this.japanMap('final'));
    else if (G.battle === 0) return this.story(0);
    else return this.base();
  },

  story(i) {
    // 完全版の鍵：4戦目から先は、買うまで札を出す（paywall.js）
    if (isLocked(i)) { $('pause').hidden = true; this.paused = true; return showPaywall(() => this.story(i), () => this.base()); }
    // やり直しでも、前の戦の一時停止札を出陣札の上へ残さない。
    $('pause').hidden = true;
    this.paused = true;
    // 必須の札：初陣は題・名・開戦の三押し（前は物語を足して四押し）。
    // 初陣の背景は支度中に読める。組の支度が要らなければ、そのまま戦へ。
    if (!this.G.lord && !RANKS[this.G.rank].squad) return this.startBattle(i);
    // 信長で遊ぶ時は、信長の立場の札
    const L = this.G.lord && lordOf(BATTLES[i].id);
    if (L) { storyCard({ year: L.year, title: L.name, text: L.goal ? [...L.text, `任務：${L.goal}`] : L.text, button: L.button, tips: L.tip }, () => this.startBattle(i)); return; }
    // この戦の働きで上がり得る身分（826）。城下から来た時は、城下へ戻れる（996）
    const G = this.G, nr = RANKS[G.rank + 1];
    const aim = G.practice || G.lord ? '' : i === 0 ? '生きて帰れ。働けば組頭の目に留まる' : nr && G.rank < (RANK_CEIL[i] ?? 9) ? `この戦の働き次第で「${nr.name}」に取り立てられる（累計戦功 ${nr.min} から）` : nr ? 'この戦では身分は上がらない。戦功と銭を積んでおけ' : '';
    const onBack = i > 0 && !G.practice && !G.lord && G.battle === i ? () => this.base() : null;
    storyCard({ ...storyOf(i)(this.G), battleId: BATTLES[i].id, tips: tipOf(i), aim, onBack }, () => this.departBattle(i));
    // 出陣の前に、連れて行く組の中身（槍・鉄砲・弓・騎馬）を決められる（kumi.js）
    const body = document.querySelector('#screen .story .st-body');
    if (body && !G.practice && !G.lord && scenarioKey() === 'oda') body.insertAdjacentHTML('beforeend', keraiPrepareHtml(G));
    if (body && RANKS[G.rank].squad) { body.insertAdjacentHTML('beforeend', kumiHtml(G)); kumiBind(G, body, () => { if (!G.practice) save(G); }); }
  },

  departBattle(i) {
    // 戦の場所は支度の札にも示す。地図で出陣をもう一度押させない。
    return this.startBattle(i);
  },

  startBattle(i) {
    if (isLocked(i)) return showPaywall(() => this.startBattle(i), () => this.base());
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
    $('tip').innerHTML = i === 0 && !LB && !this.G.practice && scenarioKey() === 'oda'
      ? '桶狭間へ出陣します。<br>味方の旗について進もう。操作は一つずつ案内します。'
      : `${BATTLES[i] && BATTLES[i].year ? `<b style="font-size:1.15em;letter-spacing:.08em">${BATTLES[i].year.replace(/（\d+）/, '')}　${BATTLES[i].place || ''}</b><br>` : ''}この戦の心得：${LB ? LB.tip : tipOf(i)}<br><span style="opacity:.7">${VIEW_TIP()}</span><br><span style="opacity:.7">${LB ? LORD_TIP() : TIPS[Math.floor(Math.random() * TIPS.length)]}</span>`;
    $('loading').hidden = false;
    hideScreen();
    this.stopBattle();
    // マウスは出陣の釦で捕まえる。支度や下知の札では放しておく。
    // 読み込みの段（888）：何をしているかを札の下に一行出し、段ごとの時間を覚える（window.__loadTimes。確かめ係が端末で読む）
    if (!ZKm) zkLoad();
    const previousProfile = window.__loadTimes?.profile;
    const LT = window.__loadTimes = { battle: BATTLES[i] && BATTLES[i].id, quality: S.quality };
    const t0 = performance.now();
    const my = this.startSeq = (this.startSeq || 0) + 1;
    // マウスを捕まえられない遊び手も、描く時は支度を省かない。
    const tool = isNorender() || /[?&]bot/.test(location.search);
    const keys = ['defs', 'assets', 'build', 'warm', 'compile', 'first'].filter((k) => (k !== 'defs' || !BTm || !BM) && (tool || isNorender() ? k === 'build' || k === 'first' || k === 'defs' : true));
    ldBegin(keys, BATTLES[i].id);
    const readingStory = LB ? { year: LB.year, title: LB.name, text: LB.goal ? [...LB.text, `任務：${LB.goal}`] : LB.text } : storyOf(i)(this.G);
    const reader = this.loadingReader = loadingStory(BATTLES[i], readingStory, LB ? LB.tip : tipOf(i), this.G);
    stage('戦の支度を読み込んでいます', keys[0]);
    // 開戦の確かめは、この戻り値を待ってから判定する。読み込み中に次の戦を予約すると、前の支度は取り消される。
    return new Promise((resolve) => setTimeout(() => guarded(async () => {
      if (my !== this.startSeq) return;
      // 戦の定義と仕組みをここで初めて読み、次の戦では使い回す
      if (!BTm || !BM) {
        const tb = performance.now();
        if (!(await readyBattleCode(() => this.startBattle(i)))) return;
        LT.defs = Math.round(performance.now() - tb);
        if (my !== this.startSeq) return;
      }
      // パソコンでは素材の完了まで支度の札で待つ。時間切れで戦へ持ち越さない。
      // 指の端末は従来の待ち時間を保つ。
      if (!tool && !isNorender()) {
        stage('人と具足と武器を読み込んでいます', 'assets');
        const tw = performance.now();
        // 素材ごとの実測は同じ読み込みの記録へ。待ちの打ち切り後も完了時間を残す。
        LT.assetsDetail = {};
        const timed = (key, load) => {
          const began = performance.now();
          return Promise.resolve().then(load).then((value) => {
            const failed = key === '人' ? HUMd.failed : key === '具足' ? DOMd.failed : key === '城' ? cgtOn() && !value : value === false;
            if (failed) throw new Error(key === '人' ? HUMd.err : key === '具足' ? DOMd.err : `${key}を読めませんでした`);
            LT.assetsDetail[key] = { ms: Math.round(performance.now() - began), ok: true }; }).catch((error) => { LT.assetsDetail[key] = { ms: Math.round(performance.now() - began), ok: false, reason: String(error?.message || error) }; if (my === this.startSeq && !LT.assetNoticed) { LT.assetNoticed = true; notice('！ 人や具足の一部を読めませんでした。軽い形で続けます。題へ戻り、ページを読み直してください'); } });
        };
        const assets = [timed('人', loadHumans), timed('具足', loadDomaru), timed('武器', loadWeapons), timed('城', loadCgt)];
        if (!isTouch) assets.push(timed('兜', loadKabuto), timed('馬', loadHorse));
        if (isTouch) await waitLimited(Promise.all(assets), 2500);
        else await Promise.all(assets);
        LT.assets = Math.round(performance.now() - tw);
        if (my !== this.startSeq) return;
      }
      stage('地形と兵をそろえています', 'build');
      if (!isNorender()) await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));   // 字を描いてから組み立てる
      if (my !== this.startSeq) return;
      const tB = performance.now();
      // 組み立てた戦は、絵の下ごしらえ（シェーダ）が済むまで描く輪に渡さない（描く輪が一度に全部を作って固まらないように）
      const b = new BM.Battle(this, i, this.G.lord ? lordDef(BTm.BATTLE_DEFS[i], BATTLES[i].id) : BTm.BATTLE_DEFS[i]);
      LT.build = LT.buildOnly = Math.round(performance.now() - tB);
      applyLord(b);
      b.startAutomatic = tool;
      // 見渡しは今は停止中。出陣後へ映画の引き・見せ場を残さず、本人の視点で支度する。
      b.player.introT = 0; b.player.camShot = null; b.player.cine = null; b.player.shotZoom = 0;
      b.player.updateCamera(1, camera);
      // 戦が始まってすぐ近くに来るはずの人を、幕の内で先に本物の人へ（humans.js の updateHumans を少し進める）。
      // ここをしないと、開戦直後に次々と人の形が変わるたびシェーダーを初めて作ることになり、一コマが0.5秒も固まって
      // 「重くてスロー・画面が黒くチカチカ」に見えていた（dynRes が跳ねてキャンバスの大きさが上下する。kaito 10/1）
      // 指の端末は見た目の作り置き（primeHumans）をしない（幕の内でも、開戦の後の輪の中でも数秒固まる）。近くの兵だけ本物の人にして、下の compileAsync に含める
      if (isTouch && !isNorender()) HUMd.primed = true;
      if (!tool && !isNorender()) {
        stage('近くの兵の姿を整えています', 'warm');
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
        const tH = performance.now(), cap = isTouch ? 400 : 1500;
        // 前の戦の人を片付け、初戦の primed 待ちを支度の中で解く。
        updateHumans(b, 0);
        if (!isTouch && HUMd.ready) await primeHumans(b, renderer, camera, 250, 1, () => my === this.startSeq).catch((error) => { b.dispose(); throw error; });
        if (my !== this.startSeq) { b.dispose(); return; }
        const tNear = performance.now();
        for (let n = 0; n < 200 && performance.now() - tNear < cap; n++) updateHumans(b, 0);
        LT.warm = LT.humansWarm = Math.round(performance.now() - tH);
        if (my !== this.startSeq) { b.dispose(); return; }
      }
      // 887：絵の下ごしらえを、読み込みの札を見せている間に進める（compileAsync は並べて作れる端末では並べて作る）
      if (!tool && !isNorender()) stage('絵を整えています', 'compile');
      const t1 = performance.now();
      // 道具（自動の遊び・撮影）は、すぐ戦が要るので待たない・下ごしらえの遅れも気にしない
      if (tool || isNorender()) HUMd.primed = true;
      try {
        if (!tool && !isNorender()) {
          // 人を作った後の場面も完了まで待つ。時間切れは処理を取り消さないので使わない。
          if (renderer.compileAsync) await renderer.compileAsync(b.scene, camera);
          else renderer.compile(b.scene, camera);
        }
      } catch (e) {
        b.humanPrimeError = LT.compileError = String(e?.message || e);
        if (my !== this.startSeq) { b.dispose(); return; }
        S.quality = 'low'; onSettings('quality'); b.applyQuality();
        notice('！ 絵の支度に失敗したため、画質を低くして一度やり直します');
        try { if (renderer.compileAsync) await renderer.compileAsync(b.scene, camera); else renderer.compile(b.scene, camera); }
        catch (retryError) { LT.compileRetryError = String(retryError?.message || retryError); throw retryError; }
      }
      LT.compile = Math.round(performance.now() - t1);
      if (my !== this.startSeq) { b.dispose(); return; }
      // 読む札を開いている間も、戦の時刻と兵は止めたまま。
      this.paused = true;
      this.battle = b;
      this.hud.show(true);
      // 最初の一枚を描いてから表示（カメラが原点を向いた画面を見せない）。norender では描かない
      // 仕上げ（composer・影・にじみ等）を通して描く：その場のシェーダ作りを、札を見せている間に済ませてしまう
      // （前は renderer.render だけだったので、初めの実物のコマで仕上げの下ごしらえが起き、数百msのコマ落ちになっていた）
      stage('最初の画面を描いています', 'first');
      // 解像度を戻すのは描く前（描いた後にキャンバスの大きさを変えると、その一枚が消えて黒いコマになる）
      dynResReset();
      const t2 = performance.now();
      if (!isNorender()) draw(this.battle.scene);
      LT.first = LT.renderOnly = Math.round(performance.now() - t2);
      LT.profile = { 読み込み: (LT.defs || 0) + (LT.assets || 0), 組立て: LT.buildOnly, 人の支度: LT.humansWarm || 0, 絵の支度: LT.compile, 描画: LT.renderOnly };
      if (previousProfile) { LT.previousProfile = previousProfile; LT.change = {}; for (const key of Object.keys(LT.profile)) LT.change[key] = LT.profile[key] - (previousProfile[key] || 0); }
      LT.total = Math.round(performance.now() - t0);
      b.startTiming = { loadingMs: LT.total, readingMs: 0, deploymentMs: 0, introMs: 0, ready: false };
      LT.startTiming = b.startTiming;
      console.info('読み込みの時間（ミリ秒）', JSON.stringify(LT));
      if (!tool && !isNorender()) ldLearn({ defs: LT.defs, assets: LT.assets, build: LT.buildOnly, warm: LT.humansWarm, compile: LT.compile, first: LT.first });
      stage('戦の支度ができました');
      clearInterval(ldIv); ldIv = 0;
      $('ld-left').textContent = '読む札を開いている時は、閉じるまで戦は止まっています';
      // 指の端末の馬は従来どおり後から読む。パソコンは支度で読んである。
      if (isTouch && !isNorender()) this.horseTimer = setTimeout(() => { this.horseTimer = 0; if (this.battle === b) loadHorse().catch(() => {}); }, 6000);
      const readingBegan = performance.now();
      await reader.wait();
      b.startTiming.readingMs = Math.round(performance.now() - readingBegan);
      reader.dispose();
      if (this.loadingReader === reader) this.loadingReader = null;
      if (my !== this.startSeq) return;
      hideLoading();
      const def = BTm.BATTLE_DEFS[i];
      // 開戦の大見出しは、始めの一時停止を解いた瞬間に出す
      this.pendingIntro = () => { if (def.sides) this.hud.intro(def.sides, BATTLES[i].name, def.date(this.battle).split('　')[0]); else this.hud.banner(BATTLES[i].name, BATTLES[i].year); sfx('horagai', 0.6); };
      sfx('taiko', 0.8);
      // 砦の戦（def.gungi のある戦）だけ、開戦の前に軍議の画面を一度だけ挟む（ほかの戦・画面の流れは変えない）
      // 全軍の攻め口と布陣は総大将が決める。足軽大将も預かった一手の下知に従う。
      const canGungi = !!this.G.lord;
      if (gungiAvailable(def) && canGungi && !this.battle._gungiDone) { this.battle._gungiDone = true; openGungi(this, this.battle, beginPlay); } else beginPlay();
      dynResReset(); window.__startFrames = [];
      return b;
    }, () => this.startBattle(i))().then(resolve), 60));
  },

  stopBattle() {
    this.startSeq = (this.startSeq || 0) + 1;
    this.loadingReader?.dispose(); this.loadingReader = null;
    clearTimeout(this.horseTimer); this.horseTimer = 0;
    if (this.deployment) { this.deployment.dispose(); this.deployment = null; }
    document.querySelectorAll('.rojo-screen').forEach((e) => (e.__close ? e.__close() : e.remove()));   // 籠城の日送りの札（鳥取城）を次の戦へ持ち越さない
    closeGungi();   // 軍議の途中で題へ戻る・やり直す時、軍議の札とカメラを閉じる（残ると題の画面を覆う）
    this.townShop = false;
    this.hud.root.classList.remove('town');
    if (this.battle) { this.battle.dispose(); this.battle = null; }
    clearEdgeDark();   // 深手・疲れで暗くなった四隅を、評価・城下の画面に持ち越さない
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
    if (!b.def.mapCastle) rememberWounds(this.G, b.player.u, b.def);
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
    const lh = b.player.lastHit;
    const cause = b.player.downCause(15);
    const ahead = lh && b.t - lh.t < 15 && lh.allyLeadDistance >= 6
      ? `馬で味方の列より約${Math.round(lh.allyLeadDistance)}メートル先へ出ていた。列へ戻り、肩を並べて進もう。` : '';
    const downInfo = b.result?.down ? {
      wound: b.result.dead ? '討死。命を落とした' : '重傷。戦を続けられなくなった',
      attack: lh && b.t - lh.t < 15 ? `${lh.name || { ashigaru: '敵の足軽', samurai: '敵の侍', busho: '敵の武将', bow: '敵の弓兵', gun: '敵の鉄砲兵', cavalry: '敵の騎馬兵' }[lh.type] || '敵'}に${lh.ranged ? lh.kind === 'arrow' ? '矢を射込まれた' : lh.kind === 'gun' ? '鉄砲で撃たれた' : '矢玉を受けた' : lh.mounted ? '馬上から突かれた' : lh.back ? '背後から突かれた' : lh.side ? '横から突かれた' : '正面から打ち負けた'}` : '最後の攻撃は分からない',
      detail: cause + ahead,
      tip: lh?.ranged ? '矢玉は構えで防げない。物陰へ退く' : lh?.mounted ? '騎馬は味方の槍の列で受ける' : '構えて打ちに備え、囲まれる前に味方の列へ退く',
    } : null;
    // 戦場を片付ける前に一度だけ描き、同じ呼び出しの中で札へ写す。
    let sharecard = null;
    if (!isNorender()) {
      try { draw(b.scene); sharecard = makeSharecard(b, G, BATTLES[i], canvas); }
      catch (e) { /* 札の失敗で戦の評価を止めない */ }
    }
    // 難易度「難」の討死
    if (b.result && b.result.dead) {
      if (!G.practice) {
        G.history ||= [];
        G.history[i] = { battle: BATTLES[i].name };
        recordBattle(G, b, { mainDone: false, lines: b.tracker.lines() });
      }
      const last = { hit: b.player.lastHit ? { ...b.player.lastHit } : null, objectives: b.objectives.map((x) => ({ text: x.text, state: x.state })), time: b.t };
      this.stopBattle();
      if (!G.practice) clearSave();
      playMusic('defeat');
      deathScreen(G, BATTLES[i].name, () => this.title(), downInfo, last);
      if (sharecard) mountSharecard(sharecard, $('b-dead').parentElement);
      return;
    }
    const gBefore = JSON.parse(JSON.stringify(G));
    const prevTotal = i > 0 && G.history[i - 1] ? G.history[i - 1].total : undefined;
    // 供（ともの者）：討たれた者は名簿から外し、生き残りは戦歴+1（給金は settle が褒美から払う）
    const tomoFallen = [];
    // 退き口から逃げ切って描画を外れた者は、討死の名簿へ入れない。
    const survived = (u) => u.alive || (b.withdrawal && u.gone && u.fleeing && u.hp > 0);
    for (const u of b.tomoUnits || []) {
      if (!u.tomo) continue;
      u.tomo.kills = (u.tomo.kills || 0) + (u.kills || 0);
      if (survived(u)) u.tomo.battles = (u.tomo.battles || 0) + 1;
      else { u.tomo.alive = false; tomoFallen.push(u.tomo.name); }
    }
    // 討たれた供の名は、あとで雇う者に使わない
    if (tomoFallen.length) G.tomoDead = [...new Set([...(G.tomoDead || []), ...tomoFallen])];
    if (G.tomo) G.tomo = G.tomo.filter((t) => t.alive);
    const r = settle(G, b.tracker, i);
    const hit = b.player.lastHit;
    if (b.result?.down && hit) {
      const who = hit.name || { ashigaru:'敵の足軽', samurai:'敵の侍', busho:'敵の武将', bow:'敵の弓兵', gun:'敵の鉄砲足軽', cavalry:'敵の騎馬' }[hit.type] || '敵';
      const how = hit.ranged ? hit.kind === 'arrow' ? '矢を受けた' : hit.kind === 'gun' ? '鉄砲の弾を受けた' : '矢玉を受けた' : hit.mounted ? '馬上から突かれた' : hit.back ? '背後から突かれた' : hit.side ? '横から突かれた' : '正面から打ち負けた';
      const guard = hit.ranged ? '矢玉は構えでは防げない。物陰へ退く。' : hit.back || hit.side ? '囲まれる前に下がり、味方と肩を並べる。' : '構えを保ち、打たれる直前に受け流す。';
      const stance = hit.guardBroken ? '構えを崩されていた。' : hit.exhausted ? '息が切れ、構えられなかった。' : hit.guard ? '構えていた。' : '構えを取っていなかった。';
      r.damageNote = `${who}に${how}。${cause}${ahead}${stance}${guard}`;
    }
    r.downInfo = downInfo;
    r.failureReason = b.result?.failureReason || (!r.mainDone ? b.downReason || b.loseReason() : '');
    if (b.result && b.result.taisho === 'a') r.taishoLost = true;
    realmAfter(G, r, b, i);
    // 評価の巻物に、この戦だけの知行の増減と家臣の働きを渡す。
    if (G.dom) r.landChange = { before: gBefore.dom?.koku || 0, after: G.dom.koku || 0 };
    r.keraiLines = ((b.realm && b.realm.keraiUnits) || []).map(({ k, u }) => ({ name: k.name, kills: u.kills || 0, alive: !!u.alive, growth: u.alive ? k.lastGrowth || '' : '' }));
    r.tomoFallen = tomoFallen;
    // 給金が払えなければ、最後に雇った供から暇を出す
    if (r.unpaid && G.tomo && G.tomo.length) { const t = G.tomo.pop(); r.tomoLeft = t.name; }
    r.prevTotal = prevTotal;
    r.stats = { ...b.stats, time: b.t, squad: b.squad.length, squadAlive: b.squad.filter(survived).length };
    r.history = afterHistory(BATTLES[i].id, r.mainDone, b.def.history);
    // 長島・三木・鳥取：戦の中の包囲の値（kakoi.js）を、城下・地図で見える形で持ち越す（state.js には触れない自由な欄）
    if (b.flags && b.flags.kakoi) { G.kakoi = G.kakoi || {}; G.kakoi[BATTLES[i].id] = { ...b.flags.kakoi }; r.kakoiId = BATTLES[i].id; }
    // 名簿を更新（生き残りは戦歴+1、討たれた者は名簿から外す）
    const fallen = [];
    let top = null;
    for (const u of b.squad) {
      if (!u.roster) continue;
      u.roster.kills += u.kills || 0;
      if (survived(u)) u.roster.battles++;
      else { u.roster.alive = false; fallen.push(u.roster.name); if (u.roster.special === 'yashichi') { G.rel.yashichi.like = Math.max(0, G.rel.yashichi.like - 20); } }
      if (!top || (u.kills || 0) > (top.kills || 0)) top = u;
    }
    G.fallen = (G.fallen || []).concat(fallen);
    // 組の者一人ひとりの働き（評価に一行ずつ出す。812・813）
    r.squadLines = b.squad.filter((u) => u.roster).map((u) => ({ name: u.roster.name, kills: u.kills || 0, alive: !!survived(u) }));
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
    r.kansho = r.mainDone && !G.practice && !G.lord && ronkoDeeds(r).notable;
    // 行の頭に評定、後ろに討った数・討たれた者・銭の出入り（褒美と給金、城下での買い物）
    const spent = (G.spend || []).reduce((a, x) => a + x.kan, 0);
    const payIn = (r.pay || []).filter((l) => l.kan > 0).reduce((a, l) => a + l.kan, 0), payOut = (r.pay || []).filter((l) => l.kan < 0).reduce((a, l) => a + l.kan, 0);
    const dead = [...fallen, ...tomoFallen.map((n) => `供の${n}`)];
    G.journal.push({ m: b.def.sides ? b.def.sides.b.mon : undefined, t: `${BATTLES[i].year}　${BATTLES[i].name}`,
      s: `評定「${r.grade}」。戦功${r.total}・討ち取り${b.stats.kills || 0}人。${r.promoted ? `${RANKS[r.rankAfter].name}に取り立てられた。` : ''}${r.kansho ? `感状を賜った。${ronkoDeeds(r).deeds.join('')}` : ''}${dead.length ? `討死：${dead.join('、')}。` : ''}`,
      dead, ledger: { pay: payIn, wage: payOut, spent: -spent, items: (G.spend || []).map((x) => x.n) } });
    G.spend = [];
    G.best = G.best || [];
    r.best = G.best[i] || 0;
    G.best[i] = Math.max(G.best[i] || 0, r.total);
    recordBattle(G, b, r);
    b.player.rememberHorseCondition();
    this.lastResult = r;
    this.stopBattle();
    G.battle = i + 1;
    G.actions = 2;
    G.talked = {};
    const retry = { label: 'この戦をやり直す', confirm: true, fn: () => { this.G = JSON.parse(this.snapshot); this.story(i); } };
    const actions = [];
    // 分捕った馬は、評価の中の一行で持ち帰り（置いていくも選べる。801）
    r.spoilHorse = spoilHorseInfo(G, b.player);
    const show = () => {
      evalScreen(G, r, actions);
      if (sharecard) mountSharecard(sharecard, $('ev-actions').parentElement);
    };
    if (G.practice) {
      const backTo = this.trialReturn;
      actions.push({ label: backTo === 'samurai' ? '戦を選ぶ画面へ戻る' : 'タイトルへ', primary: true, fn: () => this.title(backTo) });
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
    // 主君の前で手柄を読み上げてから、昇進と評定へ進む。
    const showResult = () => {
      // 段2の一歩目：昇進の後に「手柄の評定」で褒美を一つ選ぶ（hyojo.js）
      const reward = () => (r.mainDone && hyojoOn(G) && BATTLES[i].id !== 'honnoji' && i < BATTLES.length - 1 ? hyojoScreen(G, r, show, save) : show());
      const afterAward = () => {
        if (r.promoted && !G.lord) promoScreen(gBefore, G, r, reward);
        else reward();
      };
      if (r.mainDone && !G.practice && !G.lord && !r.taishoLost && BATTLES[i].id !== 'honnoji') ronkoScreen(G, r, afterAward);
      else afterAward();
    };
    if (r.mainDone && !G.practice && !G.lord && scenarioKey() === 'oda') {
      import('./campaign_map.js').then(({ campaignMap }) => {
        if (this.G !== G || this.battle) return;
        campaignMap(BATTLES[i], showResult, null, { G, victory: true });
      }).catch(() => { if (this.G === G && !this.battle) showResult(); });
    } else showResult();
  },

  base() {
    // 試しの間は銭を無限に（kaito 2026-09-27「最初は銭を無限に持たせて問屋で買い物し放題」。設定の freeMoney で切れる）
    if (S.freeMoney !== false && this.G) this.G.kan = Math.max(this.G.kan || 0, 99999);
    closeJapan();
    this.inTown = true;
    if (!isNorender()) { clearTimeout(this.horseTimer); this.horseTimer = setTimeout(() => { this.horseTimer = 0; if (this.inTown) loadHorse().catch(() => {}); }, 800); }
    // 城下の曲に、見出しの季節（春・夏・秋・冬）を渡す（640）
    const tw = scenarioKey() === 'oda' ? odaTown().TOWNS[this.G.battle] : null;
    townMusic(S.townMusic, tw && tw.season, true);
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
    if (!progressStored(this.G) && !this.G.practice) notice('！ 城下の記録を保存できませんでした。題へ戻る前に、端末の保存の空きを確かめてください');
    if (!this.townEntryChosen && !this.noLock && !isNorender() && !/[?&]bot/.test(location.search) && !window.__cardTown && !this.battle?.def.town) {
      const choose = (view) => { this.townEntryChosen = true; S.townWalk = view; const stored = saveSettings(); this.base(); if (!stored) notice('！ 城下の設定を保存できませんでした。今の間だけ使えます'); };
      townEntryScreen(() => choose('walk'), () => choose('cards')); return;
    }
    // 稲葉山前の札は、歩く城下と札の城下のどちらでも一度だけ。
    if (phase2HintScreen(this.G, () => this.base(), save)) return;
    // 城下を歩く（設定の既定）。すでに町にいれば、そのまま町へ戻る
    if (this.townWalkOn()) { if (this.battle && this.battle.def.town) { this.townResume(); return true; } return this.startTown(); }
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
    ldBegin(['defs', 'assets', 'build']); stage('町の支度を読み込んでいます', 'defs');
    const my = this.startSeq = (this.startSeq || 0) + 1;
    return new Promise((resolve) => setTimeout(() => guarded(async () => {
      if (my !== this.startSeq) return false;
      if (!BM) { if (!(await readyBattleCode(() => this.startTown()))) return false; }
      if (my !== this.startSeq) return;
      stage('人と具足を読み込んでいます。間に合わない時は軽い形で始め、準備が済んだ姿に替わります', 'assets');
      if (!this.noLock) await waitLimited(Promise.all([loadHumans(), loadDomaru(), loadCgt()]), 4000);
      if (my !== this.startSeq) return;
      if (!townModule) await townLoad();
      if (my !== this.startSeq) return;
      stage('町をそろえています', 'build');
      const def = townModule.townDef(this);
      const b = new BM.Battle(this, this.G.battle, def);
      // 町の初めの案内が済んでから、一言だけ添える。
      b.after(22, () => b.say('戦の心得・豆知識', pickTip(), 6));
      b.player.updateCamera(1, camera);
      this.battle = b;
      this.hud.root.classList.add('town');   // 町では戦の札（戦功・体力・技の列・照準）を出さない
      this.hud.show(true);
      $('loading').hidden = true;
      this.pendingIntro = () => this.hud.banner(def.place, def.when);
      beginPlay();
      window.__startFrames = [];
      townMusic(S.townMusic, def.season, true);
      return true;
    }, () => this.startTown())().then((ok) => resolve(ok === true)), 60));
  },
  // 戸口で「入る」：町を止めて、その施設の札の画面を開く。閉じると町へ戻る
  townOpen(tab, o = {}) {
    if (!this.battle || this.townShop) return;
    if (this.battle.def.town && this.battle.flags.heat) { this.battle.bark('手配中は支度の札を開けない。捕り方から離れて騒ぎを収めよう'); return; }
    this.townShop = true;
    this.paused = true;
    input.clear();
    if (document.exitPointerLock && locked) document.exitPointerLock();
    this.hud.show(false);
    sfx('ui');
    baseScreen(this.G, this.G.battle, this.lastResult, this, { tab, go: !!o.go, onLeave: () => this.townResume() });
    // 町の門から：出陣の確かめ（やり残し）の所を見せ、「出陣する」に焦点を置く
    if (o.go) setTimeout(() => { const g2 = $('go2'); if (g2) { g2.scrollIntoView({ block: 'center' }); g2.focus({ preventScroll: true }); } }, 60);

    // 町の場所から（蔵＝内政・館の庭＝家臣・使者の間＝外交）：知行の札のその欄を見せる
    if (o.deeds) setTimeout(() => { const d = document.querySelector('.realm-deeds'); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); } }, 60);
    if (o.focus != null) setTimeout(() => { const g = document.querySelector('.realm-grid'), el = g && g.children[o.focus]; if (el) { el.scrollIntoView({ block: 'start' }); el.style.outline = '2px solid var(--kin)'; el.style.outlineOffset = '3px'; } }, 60);
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

  // 二度目からは城下の出陣一押し。前は物語・地図・開戦を足して四押し。
  // 出陣の前に「支度」を一つ整える（hyojo.js）。信長・試しは今のまま一押し
  nextBattle() {
    const G = this.G;
    if (!hyojoOn(G) || G.battle >= BATTLES.length) return this.startBattle(G.battle);
    shitakuScreen(G, () => { save(G); this.startBattle(G.battle); }, () => this.base());
  },

  // 出世の道：いまの枠の身分で見る。段を選んで稽古場で試せる
  ladder(from = 'title') {
    const G = from === 'town' && this.G ? this.G : (readProgress(S.slot).game || newGame('名無し'));
    ladderScreen(G, () => (from === 'town' ? this.base() : this.title()), (step) => { initAudio(); this.startDojo(step); });
  },

  // 侍大将で出陣（試し）：身分・装備・組を侍大将のものにして、選んだ戦へ（記録は残さない）
  startAsSamurai(k, id) {
    this.trialReturn = 'samurai';
    const G = newGame((readProgress(S.slot).game || {}).name || '弥五郎', 'normal', k);
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
    const saved = readProgress(S.slot).game;
    const G = saved ? JSON.parse(JSON.stringify(saved)) : newGame('稽古人');
    G.practice = true; G.injured = false;
    if (step != null) { G.trialStep = step; G.rank = Math.max(G.rank, step >= 2 ? 4 : step === 1 ? 2 : 0); }
    else {
      // 稽古場（腕試し）は、刀・鉄砲・弓への持ち替えと騎乗を必ず試せるように（まだ買っていなくても。記録には残らない）
      for (const it of ['katana', 'teppo', 'yumi']) if (!G.owned.includes(it)) G.owned = [...G.owned, it];
      G.rank = Math.max(G.rank, 3);
    }
    this.dojoStep = step;
    this.G = G;
    this.bg = null;
    this.inTown = false; townMusic(false);
    hideScreen();
    this.stopBattle();
    autoLock();
    $('loading').hidden = false;
    $('tip').textContent = '押し寄せる寄せ手を、倒れるまで何人討てるか。陣と陣の合間に少し回復します。';
    ldBegin(['defs', 'build']); stage('戦の支度を読み込んでいます', 'defs');
    const my = this.startSeq;
    setTimeout(guarded(async () => {
      if (my !== this.startSeq) return;
      if (!BTm || !BM) { if (!(await readyBattleCode(() => this.startDojo(step)))) return; }
      if (my !== this.startSeq) return;
      stage('稽古場をそろえています', 'build');
      this.battle = new BM.Battle(this, 3, BTm.dojo);
      this.hud.show(true);
      this.battle.player.updateCamera(1, camera);
      $('loading').hidden = true;
      this.pendingIntro = () => this.hud.banner('稽古場', '腕試し');
      beginPlay();
    }, () => this.startDojo(step)), 60);
  },

  // 束16 の試しの入口：system_mvp の籠城（70 章の数）で、日を送る画面だけを開く。題の画面には出さず、screens.js の隠しの釦から
  testRojo() {
    hideScreen();
    Promise.all([import('./rojo.js'), import('./rojo_screen.js')]).then(([{ makeRojo }, { openRojo }]) => {
      const R = makeRojo({ castle: { men: 1000, food: 20, morale: 60 }, siege: { men: 3000, food: 30 }, relief: { day: 15 } });
      openRojo(this, R, { side: 'def', role: '城主', castleName: '試しの城（籠城）', onEnd: () => this.title() });
    }).catch(loadFail('籠城の画面'));
  },

  // ---------------- 日本地図 ----------------
  // 城下（足軽大将から、または筋書きを終えた後）とタイトルの「日本地図（試し）」から開く
  // タイトルから開くときは、保存が足軽大将以上か筋書きを終えていればその保存で（地図の進みも残る）、そうでなければ試し（残らない）
  japanMap(from = 'town', keep = false) {
    this.stopBattle();
    this.bg = null;
    this.inTown = from === 'town';
    if (from === 'title' && !keep) {
      const saved = readProgress(S.slot).game;
      const done = saved && saved.battle >= (SCENARIOS[saved.scenario || 'okehazama'] || SCENARIOS.okehazama).battles.length;
      if (saved && (saved.rank >= 4 || done)) this.G = saved;
      else { const G = saved ? JSON.parse(JSON.stringify(saved)) : newGame('名無し'); G.practice = true; G.injured = false; this.G = G; }
    }
    this.mapFrom = from;
    const G = this.G;
    playMusic('map');
    return jp().then((m) => m.japanScreen(G, {
      from, practice: !!G.practice, result: this.mapResult || null,
      // 本編が主：地図の上から次の戦（城下の「出陣する」）へ戻れるように
      next: !G.practice && G.battle < BATTLES.length ? BATTLES[G.battle].name : null,
      onNext: () => { this.mapResult = null; closeJapan(); this.base(); },
      onBack: () => { this.mapResult = null; if (from === 'town') this.base(); else if (from === 'final') finalScreen(G, () => this.title(), () => this.japanMap('final')); else this.title(); },
      onAttack: (info) => { this.mapResult = null; this.startMapBattle(info); },
      onSave: () => save(G),
    })).then(() => { this.mapResult = null; return true; }).catch((e) => { loadFail('天下の地図')(e); this.title(); return false; });
  },

  // 地図から出陣する城攻め（BATTLES の並びには入れない。戦功・昇進・戦の進みは変えない）
  startMapBattle(info, again = false) {
    if (!CBm) { const seq = this.startSeq; import('./b_castle.js').then((m) => { CBm = m; if (seq === this.startSeq) this.startMapBattle(info, again); }).catch(loadFail('城攻め')); return; }
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
    ldBegin(['defs', 'build']); stage('戦の支度を読み込んでいます', 'defs');
    hideScreen();
    this.stopBattle();
    autoLock();
    const my = this.startSeq;
    setTimeout(guarded(async () => {
      if (my !== this.startSeq) return;
      if (!BM) { if (!(await readyBattleCode(() => this.startMapBattle(info, again)))) return; }
      if (my !== this.startSeq) return;
      stage('地形と兵をそろえています', 'build');
      this.battle = new BM.Battle(this, 0, def);
      applyLord(this.battle);
      this.hud.show(true);
      this.battle.player.updateCamera(1, camera);
      dynResReset();   // 描く前に（描いた後に大きさを変えると黒いコマになる）
      if (!isNorender()) draw(this.battle.scene);
      $('loading').hidden = true;
      this.pendingIntro = () => { this.hud.intro(def.sides, def.title, info.date); sfx('horagai', 0.6); };
      sfx('taiko', 0.8);
      beginPlay();
      dynResReset(); window.__startFrames = [];
    }, () => this.startMapBattle(info, again)), 60);
  },

  endMapBattle(b) {
    const info = b.def.mapInfo;
    const won = b.tracker.main === true && !(b.result && b.result.down);
    const stats = { kills: b.stats.kills, t: b.t };
    this.stopBattle();
    // 戦の前の進行へ戻し、地図の進みと本人の傷を書く
    const G = JSON.parse(this.mapSnap);
    rememberWounds(G, b.player.u, b.def);
    this.G = G;
    jp().then((m) => {
      const kouGain = m.japanResult(G, info, won);
      save(G);
      this.mapResult = { won, kouGain, castle: info.castle, castleId: info.castleId, atk: info.atk.name, def: info.def.name, date: `${info.date} ${info.season}`, ...stats };
      this.japanMap(this.mapFrom || 'town', true);
    }).catch((e) => { loadFail('天下の地図')(e); this.title(); });
  },

  // 組の弓の割合（城下の「組の編成」で決める）
  bowsFor(n, i) { return i >= 2 ? Math.round(n * (this.G.bowRatio ?? 0.33)) : 0; },
};
window.__game = game;
// 開発用：今の視点で一コマ描く（撮影の道具が使う。fresh なら目の慣れをやり直す）
game.drawNow = (fresh, scene) => { if (fresh && adaptPass) adaptPass.fresh = true; const sc = scene || (game.battle && game.battle.scene); if (sc) draw(sc); };
try { initMetrics(game); } catch (e) { /* 記録が動かなくても遊べる */ }
try { initCount(game); } catch (e) { /* 数えが動かなくても遊べる */ }
game.renderer = renderer;   // 開発用（描画の重さを計る）
// 城下から設定を開く（995）。閉じたら back へ
game.perf = () => ({ res: resScale, target: resTarget, ft: +ftAvg.toFixed(1) });
game.openSettings = (back) => settingsScreen(onSettings, back);

// ---------------- ループ ----------------
const clock = new THREE.Clock();
let fpsT = 0, frames = 0;
// 数字だけで計る。描く上限の待ち時間・読み込み・一時停止は重さに含めない。
let qualityBattle = null, qualityLast = 0, qualityWarm = 0, qualityFrames = 0, qualityMs = 0;
let qualityHeavy = 0, qualityCooldown = 0, qualityNoticed = false;
const qualitySamples = new Float64Array(36);
document.addEventListener('visibilitychange', () => {
  qualityLast = 0; qualityWarm = 0; qualityFrames = 0; qualityMs = 0; qualityHeavy = 0;
});
function measureQuality(ms, cap) {
  const budget = cap ? 1000 / cap : 1000 / 60;
  if (qualityWarm < 20) { qualityWarm++; return; } // 最初の材質作りを待つ
  if (!S.qualityMeasured) {
    qualitySamples[qualityFrames] = ms;
    qualityMs += ms; qualityFrames++;
    if (qualityFrames < 36) return;
    qualitySamples.sort();
    const avg = Math.max(qualityMs / qualityFrames, qualitySamples[32]);
    S.quality = avg <= Math.max(22, budget * 1.1) ? 'high' : avg <= Math.max(38, budget * 1.5) ? 'mid' : 'low';
    S.qualityMeasured = true;
    saveSettings(); onSettings('quality');
    qualityCooldown = 8;
    return;
  }
  const seconds = ms / 1000;
  if (qualityCooldown > 0) { qualityCooldown -= seconds; return; }
  qualityHeavy = ms > Math.max(40, budget * 1.35) ? qualityHeavy + seconds : Math.max(0, qualityHeavy - seconds * 2);
  if (qualityHeavy < 6 || S.quality === 'low') return;
  S.quality = S.quality === 'high' ? 'mid' : 'low';
  qualityHeavy = 0; qualityCooldown = 8;
  saveSettings(); onSettings('quality');
  if (!qualityNoticed) { qualityNoticed = true; notice('重いため、画質を一段下げました'); }
}
let capAcc = 0, bgAcc = 0, waitingLast = false, loopBattle = null;
function loop() {
  requestAnimationFrame(loop);
  // 確かめ用：開戦から10秒、1コマの重さを window.__startFrames に記す（重いコマを探す道具。遊びには使わない）
  const _pf0 = window.__startFrames ? performance.now() : 0;
  // 待つ札と題の背景は毎秒十枚。再開・戦の切り替えではすぐ入力と絵を戻す。
  const b = game.battle;
  const waiting = document.hidden || (!b && !!game.bg) || !!(b && !game.deployment && !game.photo && (game.townShop || game.paused || game.hud.introWaiting));
  const wake = waiting !== waitingLast || b !== loopBattle;
  waitingLast = waiting; loopBattle = b;
  if (wake) capAcc = 0;   // 札を読んでいた待ち時間を、再開した戦の時間へ足さない。
  const chosenCap = fpsCapNow();
  const cap = waiting ? (chosenCap ? Math.min(chosenCap, 10) : 10) : chosenCap;
  // キャンバスの大きさが変わった（絵が消えた）コマは、上限に関わらず描く（描かないと消えたままの黒いコマが出る）
  if (cap) { capAcc += clock.getDelta(); if (capAcc < 1 / cap - 0.002 && !sizeDirty && !wake) return; }
  const elapsed = cap ? capAcc : clock.getDelta();
  const real = document.hidden ? 0 : Math.min(0.25, elapsed);
  capAcc = 0;
  let dt = real;
  b?.environmentSound?.sync(!game.paused && !game.photo && !game.townShop && !document.hidden && document.hasFocus());
  const qualityActive = b && b.t >= 15 && !b.def.town && S.qualityAuto && !game.paused && !game.photo && !game.townShop && !document.hidden && $('loading').hidden && !isNorender();
  if (qualityBattle !== b) {
    qualityBattle = b; qualityWarm = 0; qualityFrames = 0; qualityMs = 0; qualityHeavy = 0; qualityCooldown = 0; qualityLast = 0;
  }
  const qualityNow = qualityActive ? performance.now() : 0;
  if (qualityNow && qualityLast) measureQuality(qualityNow - qualityLast, cap);
  if (!qualityNow && qualityLast) { qualityWarm = 0; qualityFrames = 0; qualityMs = 0; qualityHeavy = 0; }
  qualityLast = qualityNow;
  // 人の作り置きと絵の下ごしらえは支度中だけ。操作の輪では始めない。
  pollPad();
  touchFrame(real);
  if ((!b || b.def.town) && resScale !== 1) dynResReset();  // 城下（町を歩く時も）・題の画面では下げない
  // 城下の店の札を開いている間は、町を描かない（札が画面を覆う。電池を減らさない）
  if (document.hidden || (b && game.townShop)) { input.endFrame(); return; }
  if (b) {
    // 攻撃が当たった瞬間のわずかな溜め（ヒットストップ）。「動きを減らす」では使わない
    if (game.hitstop > 0) { game.hitstop -= dt; if (!RMm()) dt *= 0.12; }
    // 受け流し・武将討ちの瞬間はゆっくり
    const momentSpeed = decisiveCameraSpeed(b);
    if (game.slowmo > 0) { game.slowmo -= real; if (!RMm()) dt *= Math.min(0.35, momentSpeed); }
    else dt *= momentSpeed;
    // 軍配の図を開いている間は、時がゆっくり流れる
    if (game.cmdMap && isGunbaiOpen()) dt *= 0.15;
    b.world.distMul = S.drawDist;
    // 始まりの重さを測る（開戦後 10 秒だけ）：コマの update と draw を分けて計り、長いコマ（2 コマ分＝約 33ms 超）を覚える
    const measuring = b.t < 10 && window.__startFrames;
    const t_u0 = measuring ? performance.now() : 0;
    if (game.deployment) {
      if (!document.hidden) game.deployment.update(real);   // 窓に焦点が無いだけ（裏の Chrome・別の窓を触った）で止めない
    }
    else if (game.photo && !game.paused) updatePhoto(real);
    else if (!game.paused && !game.hud.introWaiting) {
      // 毎コマ requestAnimationFrame(loop) を先に積んでから中身を進めるので、ここで一度でも投げると
      // 「次のコマでまた同じ所で投げる」が延々続き、画面は止まって見えるのに輪は回り続ける＝固まる（9/30・軍議を経た戦で見つかった）。
      // 一度つかまえたら、その場で一時停止へ落として、Esc の「この戦をやり直す」が確かに効くようにする
      try {
        const spd = getSpeed(), steps = Math.max(1, Math.ceil(dt / 0.05)), slice = dt / steps;
        for (let tick = 0; tick < steps; tick++) {
          for (let si = 0; si < spd; si++) b.update(slice, input);
          if (steps > 1) input.endFrame();
          if (b.over || game.paused || game.hud.introWaiting || game.deployment || game.battle !== b) break;
        }
      } catch (e) {
        console.error(e);
        reportBug(e.message, (e.stack || '').split('\n')[1] || '');
        setPause(true);
      }
    }
    if (game.hud.introWaiting) input.clear();
    if (!game.deployment && !game.hud.introWaiting) {
      if (b.lord) { lordFrame(b); gunbaiFrame(b, real); } else if (isGunbaiOpen()) gunbaiFrame(b, real);
    }
    if (b.noboriFlags) for (let i = 0; i < b.noboriFlags.length; i++) b.noboriFlags[i].rotation.y = Math.sin(b.t * 1.6 + i * 1.3) * 0.18;
    const t_u1 = measuring ? performance.now() : 0;
    // norender：ここから下は「描く」ためだけの仕事（renderer.render・仕上げ・FPS計測・動的解像度）なので、まるごと飛ばす
    if (isNorender()) {
      if (measuring && t_u1 - t_u0 > 24) window.__startFrames.push({ t: +b.t.toFixed(2), upd: +(t_u1 - t_u0).toFixed(1), draw: 0, total: +(t_u1 - t_u0).toFixed(1) });
      input.endFrame(); return;
    }
    // 動的解像度は描く前に変える。描いた後に setSize すると、その一枚の絵が消えたまま画面に出て、黒いコマになっていた（10/2 に測って分かった。
    //   開戦の重いコマで細かさが下がるたびに一枚ずつ黒くなる＝携帯・iPad で「最初に黒くチカチカ」）
    if (!game.paused && !b.def.town && S.qualityMeasured) dynRes(real);
    draw(b.scene); sizeDirty = false;
    if (measuring) {
      const t_d1 = performance.now(), total = t_d1 - t_u0;
      if (total > 24) window.__startFrames.push({ t: +b.t.toFixed(2), upd: +(t_u1 - t_u0).toFixed(1), draw: +(t_d1 - t_u1).toFixed(1), total: +total.toFixed(1) });
    } else if (b.t >= 10 && window.__startFrames) {
      const F = window.__startFrames;
      console.info(`開戦10秒の長いコマ（33ms超）：${F.length}個`, JSON.stringify(F));
      window.__startFrames = null;
    }
    frames++; fpsT += real;
    if (fpsT > 1) {
      // 出している時だけ書き換え、兵を数える（908）
      if (S.showFps) $('fps').textContent = `毎秒 ${frames} 枚 ・ 兵 ${b.army.units.filter((u) => u.alive).length} ・ 解像度 ${Math.round(resScale * 100)}%`;
      frames = 0; fpsT = 0;
    }
  }
  else if (game.bg && !$('screen').hidden && !isNorender()) {
    // タイトルの背景。図鑑・記録帳・設定などで覆われている間は一秒に 10 コマに落とす（891）
    bgAcc += real;
    const covered = !!document.getElementById('zk') || !$('tt-home');
    if (!covered || bgAcc >= 0.1 || sizeDirty) { game.bg.update(bgAcc, camera); draw(game.bg.scene); bgAcc = 0; sizeDirty = false; }
  }
  input.endFrame();
  if (_pf0 && b && b.t <= 10) { window.__startFrames.push({ t: Math.round(b.t * 100) / 100, ms: Math.round((performance.now() - _pf0) * 10) / 10, programs: renderer.info.programs ? renderer.info.programs.length : 0 }); }
}
// 触る端末（携帯・iPad）の操作：棒・丸の釦から input へ入れる
game.hud.onIntroReady = () => {
  input.clear(); input.axis = null; input.padL = input.padR = false;
  const b = game.battle;
  if (b) {
    b.player.introT = 0; b.player.camShot = null; b.player.cine = null; b.player.shotZoom = 0;
    b.player.updateCamera(1, camera);
  }
  if (!isTouch) requestLock();
};
initTouch({ input, game, setPause, toggleBigMap });
loop();
game.title();
// 共有の入口は新しい練習だけ。保存の読み直し・上書き・削除はしない。
const shared = sharedBattle(location.search, BATTLE_IDS);
if (shared) {
  setScenario(shared.scenario);
  const G = newGame('弥五郎', 'normal', shared.scenario);
  G.practice = true;
  const i = BATTLES.findIndex((b) => b.id === shared.id);
  if (i >= 0) {
    G.battle = i; game.G = G; game.bg = null;
    game.story(i);
    notice('同じ戦の練習です。保存した記録は変わりません。');
  }
}
try { window.__bootDone && window.__bootDone(); } catch (e) { /* 題までの札（index.html）が無ければよい */ }
// 開発者向け：?debug で常にFPSを出し、戦へ直接飛べる。?bot で自動テストプレイ
if (/[?&]debug/.test(location.search)) {
  S.showFps = true; game.hud.applySettings();
  const d = document.createElement('div');
  d.className = 'debugbar';
  d.innerHTML = '<b>開発用の戦選び</b>' + Object.entries(SCENARIOS).map(([k, sc]) => sc.battles.map((bb, i) => `<button data-dbg="${i}" data-scn="${k}">${bb.name}</button>`).join('')).join('');
  document.body.appendChild(d);
  d.querySelectorAll('[data-dbg]').forEach((btn) => btn.onclick = () => {
    const i = +btn.dataset.dbg;
    const G = newGame('弥五郎', 'normal', btn.dataset.scn); G.practice = true; G.rank = [0, 1, 2][i]; G.merit = [0, 95, 200][i]; G.aijirushi = 'maru';
    if (i === 2) G.owned.push('katana');
    game.G = G; initAudio(); game.startBattle(i);
  });
}
if (/[?&]bot/.test(location.search)) import('./playbot.js').then((m) => m.run(game));
