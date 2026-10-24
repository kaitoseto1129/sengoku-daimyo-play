import './has_shim.js';   // CSS の :has() をクラスの付け外しへ（一番先に読む。10/24）
import { simpleControls } from './simple_controls.js';
import { tinyCull } from './tiny_cull.js';
import { loadYumi } from './yumi.js';
import { loadPropsExt, loadBldg } from './props_ext.js';
import { loadPeopleDetail } from './people_tex.js';
import { loadWarSpeech, releaseWarSpeech } from './war_speech.js';
import { assetsForBattle, prepareBattleAssets, releaseBattleAssets } from './asset_manifest.js';
import { cancelAssetReads } from './asset_reader.js';
import { rememberWounds } from './wounds.js';
import { recoverBattle } from './battle_retry.js';
import { readProgress, progressStored, deleteProgress, safeSave as save } from './save_guard.js';
import * as THREE from 'three';
import { installCanvasAstc } from './astc_rt.js';
import { GPU_GC } from './gpu_gc.js';
import { noboriCull } from './props.js';
import './hidden_skip.js';
import { newGame, settle, BATTLES, RANKS, RANK_CEIL, TITLES, fillRoster, clearSave, setScenario, scenarioKey, SCENARIOS, ladderStep, markReady, usePre } from './state.js';
import { kumiHtml, kumiBind } from './kumi.js';
import { recordBattle } from './kiroku.js';
import { ronkoDeeds } from './ronko.js';
import { afterHistory } from './after_history.js';
import { sharedBattle, makeSharecard, mountSharecard } from './sharecard.js';
import { Hud } from './hud.js';
import { viewSync } from './viewport.js';
import { decisiveCameraSpeed } from './decisive_camera.js';
import { probeDraw, restoreProbeDraw } from './autoplay_probe.js';
import { guardDrawCamera } from './render_camera.js';
import { NAKA } from './naka.js';
import { deploymentView } from './deployment_view.js';
import { setRenderer, FLAG_MOON } from './world.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AdaptPass, FinishPass, clearEdgeDark } from './post.js';
import { initAudio, silence, sfx, setVolume, duck, townMusic, playMusic, stopMusic } from './audio.js';
import { titleScreen, storyCard, loadingStory, inkBand, evalScreen, spoilHorseInfo, aijirushiScreen, baseScreen, finalScreen, hideScreen, helpOverlay, settingsScreen, pauseMenu, notice, deathScreen, promoScreen, ronkoScreen, recordsScreen, dojoResult, epilogueScreen, ladderScreen } from './screens.js';
import { S, QUALITY, saveSettings, canonical, K, reduceMotion, MEM_TIGHT, MEM_TIGHT_TEST } from './settings.js';
import { TIER, noteGL, markInBattle, markCrashed, WEAK_TEX_MAX } from './device_tier.js';
// 自動計測専用：x_pr75（倍率0.75。x_pr70も可）・x_noshadow・x_noai（兵の判断と当たりを停止）・x_noskin（骨を停止）・x_nosmoke（煙・炎・土埃なし）・x_simplemat（照明なし）。通常の高画質には適用しない。
// 既存の札：x_nopost・x_nobloom・x_sm1024・x_noao・x_nodof・x_norays・x_sec180・x_shfull・x_bloomblend。
const APX = (() => {
  const o = {};
  try {
    const src = String(window.__autoplay || new URLSearchParams(location.search).get('autoplay') || '');
    for (const w of src.split(',')) { const m = /^x_([a-z]+)(\d+)?$/.exec(w); if (m) o[m[1]] = m[2] ? +m[2] : true; }
  } catch (e) { /* 無ければ何もしない */ }
  if (o.pr) o.pr /= 100;
  window.__apx = o;
  return o;
})();
import { glossaryDialog, setGlossaryBeforeOpen } from './glossary.js';
import { titleScene } from './preview.js';
import { realmAfter } from './realm.js';
import { hyojoScreen, shitakuScreen, hyojoOn, phase2HintScreen } from './hyojo.js';
import { keraiPrepareHtml } from './retainers.js';
import { BATTLE_IDS } from './battle_ids.js';
import { isLocked, showPaywall } from './paywall.js';
import { ADDITIONAL_TIPS, pickTip } from './tips.js';
import { loadWeapons, UNIT_NIGHT, UNIT_NIGHT_FOCUS, UNIT_FIRE_METAL } from './units_model.js';
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
// 森部は共通の兵の道具と森部の地形だけを読む。全戦の定義を町へ連れてこない。
let moribeDefinition = null, moribePromise = null;
function moribeLoad() {
  if (!moribePromise) moribePromise = import('./b_moribe.js').then((m) => {
    m.moribe.key = 'moribe';
    moribeDefinition = m.moribe;
  }).catch((error) => { moribePromise = null; throw error; });
  return moribePromise;
}
let inouDefinition = null, inouPromise = null;
function inouLoad() {
  if (!inouPromise) inouPromise = import('./b_inou.js').then((m) => {
    m.inou.key = 'inou';
    inouDefinition = m.inou;
  }).catch((error) => { inouPromise = null; throw error; });
  return inouPromise;
}
const battleDefinition = i => BATTLES[i]?.id === 'inou' ? inouDefinition : BATTLES[i]?.id === 'moribe' ? moribeDefinition : BTm?.BATTLE_DEFS[i];
// 保存済みの設定や自動測定でも、画質は高を保つ。
S.quality = 'high';
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
  $('loading').style.setProperty('--ld-progress', '0%');
  $('loading').style.setProperty('--ld-stages', String(keys.length));
  // 見込みの棒とは別に、実際に終わった工程を字のない区切りで残す。
  let steps = $('ld-steps');
  if (!steps) {
    steps = document.createElement('div'); steps.id = 'ld-steps';
    steps.setAttribute('aria-hidden', 'true');
    document.querySelector('#loading .ldbar').after(steps);
  }
  steps.replaceChildren(...keys.map((key, i) => {
    const step = document.createElement('i');
    step.style.flexGrow = String(ldPlan.est[i]);
    step.style.setProperty('--ld-duration', `${Math.round(ldPlan.est[i])}ms`);
    if (RMm()) step.style.setProperty('--ld-duration', '0ms');
    return step;
  }));

  clearInterval(ldIv); ldIv = setInterval(ldTick, 250);
  const actions = document.querySelector('#loading .ld-cancel');
  if (actions) actions.remove();
  const cancel = document.createElement('button');
  cancel.type = 'button'; cancel.className = 'btn small ld-cancel'; cancel.textContent = '始める画面に戻る';
  cancel.style.cssText = 'min-height:44px;margin-top:16px';
  cancel.onclick = () => { game.startSeq = (game.startSeq || 0) + 1; hideLoading(); game.title(); };
  document.querySelector('#loading .ldbar').parentElement.appendChild(cancel);
  ldTick();
}
function ldTick() {
  const el = $('ld-left');
  if ($('loading').hidden || !ldPlan) { clearInterval(ldIv); ldPlan = null; return; }
  if (document.hidden) return;
  const P = ldPlan, i = Math.max(0, P.cur);
  const into = performance.now() - P.t;
  const total = P.est.reduce((sum, ms) => sum + ms, 0) || 1;
  const completed = P.est.slice(0, i).reduce((sum, ms) => sum + ms, 0);
  // 見込みを超えても丸を止めず、現在の段の終わりへゆっくり近づける。
  // 次の段を先取りせず、満ち切るのは実際に支度が終わった時だけ。
  const fraction = into <= P.est[i] ? into / P.est[i] * .8 : .8 + .18 * (1 - Math.exp(-(into - P.est[i]) / P.est[i]));
  // 初陣も工程数ではなく、覚えた所要時間の割合で残る支度を示す。
  const progress = (completed + P.est[i] * fraction) / total;
  P.progress = Math.max(P.progress || 0, Math.min(.99, progress));
  $('loading').style.setProperty('--ld-progress', `${(P.progress * 100).toFixed(1)}%`);
  if (!el) return;
  let left = Math.max(0, P.est[i] - into);
  for (let k = i + 1; k < P.keys.length; k++) left += P.est[k];
  // 見込みを超えても残り秒を消さず、残る段と現在の超過分から目安を直す。
  if (into >= P.est[i]) left += Math.max(1000, P.est[i] * .2);
  const seconds = Math.floor((performance.now() - P.t0) / 1000);
  const text = `動けるまで あと約${Math.max(1, Math.ceil(left / 1000))}秒（目安）・${seconds}秒経過`;
  if (el.textContent !== text) el.textContent = text;
}
// 段に入る：棒をこの段の終わりの手前まで、見込みの時間で伸ばす
function ldStep(key) {
  const P = ldPlan; if (!P) return;
  const i = P.keys.indexOf(key); if (i < 0 || i === P.cur) return;
  P.cur = i; P.t = performance.now();
  const steps = $('ld-steps');
  if (steps) for (let k = 0; k < steps.children.length; k++) {
    steps.children[k].className = k < i ? 'done' : k === i ? 'current' : '';
  }

  // 初陣も合成側で棒を伸ばす。兵を組み立てる間に処理が詰まっても止めない。
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
  if (!t) $('loading').classList.remove('first-battle');
  const LT = window.__loadTimes;
  if (LT && ldPlan?.battle === LT.battle) {
    LT.step = t;
    if (key) {
      LT.phase = key;
      (LT.stages ||= {})[key] = { at: new Date().toISOString(), ms: Math.round(performance.now() - LT.beganMs) };
    }
    window.dispatchEvent(new Event('risshin-preparation-progress'));
  }
  if (t) ldName = ({ defs: '戦の仕組み', assets: '人とよろい', build: '地形と兵', warm: '人の姿', compile: '絵', first: '最初の画面' })[key] || t;
  let el = $('ld-stage');
  if (!el) { el = document.createElement('div'); el.id = 'ld-stage'; el.style.cssText = 'margin-top:10px;font-size:15px;color:var(--washi);text-align:center'; el.innerHTML = '<span role="status" aria-live="polite" aria-atomic="true"></span><span aria-live="off" id="ld-left" style="display:block;margin-top:6px"></span>'; document.querySelector('#loading .ldbar').after(el); }
  el.setAttribute('role', 'region');
  if (!$('ld-left')) el.innerHTML = '<span role="status" aria-live="polite" aria-atomic="true"></span><span aria-live="off" id="ld-left" style="display:block;margin-top:6px"></span>';
  // 初陣でも待つ目安を残す。工程名を畳む表示とは分ける。
  const left = $('ld-left');
  left.hidden = !t; left.style.display = t ? 'block' : 'none';
  const i = ldPlan && key ? ldPlan.keys.indexOf(key) : -1;
  el.firstChild.textContent = i >= 0 ? `${t}（${i + 1}／${ldPlan.keys.length}）` : t;
  if (key) ldStep(key);
};
const stageError = (retry) => { game.loadingReader?.dispose(); game.loadingReader = null; const failedStage = ldName; document.querySelector('#loading .ld-cancel')?.remove(); $('loading').hidden = false; clearInterval(ldIv); ldIv = 0; ldPlan = null; stage(''); const el = $('ld-stage'); el.textContent = `！ ${failedStage}の途中で止まりました。題へ戻っても城下の記録は残ります。もう一度お試しください。`; el.insertAdjacentHTML('beforeend', '<div class="ld-actions"><button class="btn small" id="ld-title">題の画面へ戻る</button><button class="btn small" id="ld-retry">もう一度支度する</button></div>'); el.setAttribute('role', 'alert'); $('ld-retry').onclick = () => { $('ld-retry').disabled = true; $('ld-title').disabled = true; el.setAttribute('role', 'status'); sfx('ui'); if (freshRetry()) return; Promise.resolve().then(retry).catch(() => stageError(retry)); }; $('ld-title').onclick = () => { hideLoading(); game.title(); }; $('ld-title').focus({ preventScroll: true }); };
// 「もう一度支度する」は頁を読み込み直して同じ所から始める（10/24 Lancers：Windows の Chrome で稲生の後の支度が何度押しても止まった）。
// 同じ頁のままだと、一度失敗した部品の読み込み（import の失敗・公開の版の入れ替えで消えた古い版）をブラウザが覚えていて、何度押しても同じ所で止まる
const freshRetry = () => { const ls = game.lastStart; return !!ls && !isNorender() && !/[?&]bot/.test(location.search) && resumeReload(game, ls.fn, ls.args); };
// 部品の読み込み（import）の失敗は、押してもらう前に一度だけ自分で読み込み直す（5分に一度まで）
const importFailed = (e) => /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch|素材を読めませんでした/i.test(String(e && e.message || e));
const autoFreshRetry = () => {
  try { const at = +sessionStorage.getItem('risshin-autoretry') || 0; if (Date.now() - at < 5 * 60 * 1000) return false; sessionStorage.setItem('risshin-autoretry', String(Date.now())); } catch (e) { return false; }
  return freshRetry();
};
// 裏の読み込みや組み立てで例外が出ても、「読み込み中」の札で固まらないように：失敗の札を出してやり直せるようにする
const guarded = (fn, retry) => { const seq = game.startSeq; return async () => {
  if (seq !== game.startSeq) return;
  try { return await fn(); }
  catch (e) { if (seq !== game.startSeq) return; preparationError('guarded', e.message || e, e.stack); console.error(e); game.lastError = `${e.message}\n${(e.stack || '').split('\n')[1] || ''}\n読み込みの失敗`; if (importFailed(e) && autoFreshRetry()) return; stageError(retry); }
}; };
// 画面に出ない失敗（開けない図鑑や地図など）は、知らせを出して題へ戻れるようにする
const loadFail = (what) => (e) => { console.error(e); game.lastError = `${e && e.message}\n${what}を開けなかった`; hideLoading(); notice(`${what}を開けませんでした。通信を確かめて、もう一度開いてください`); };
const hideLoading = () => { game.loadingReader?.dispose(); game.loadingReader = null; clearInterval(ldIv); ldIv = 0; ldPlan = null; const l = $('loading'); if (l) l.hidden = true; };
// 不具合の知らせ（window の error・unhandledrejection・戦の輪の失敗で同じ文と lastError を作る）
function reportBug(message, where) {
  const b = game.battle;
  game.battleFault = b;
  game.lastError = `${message}\n${where}\n戦：${b ? (BATTLES[b.index] ? BATTLES[b.index].name : '稽古') : '-'}　経過 ${b ? Math.round(b.t) : 0}秒　場面 ${b ? b.phase : '-'}`;
  crashNotice();
}
// 戦の定義・仕組みは、出陣する時に読み始める。
// 失敗したら（通信が不安定な端末など）次に押した時にまた読めるよう promise を捨て、字とやり直しボタンを出す
async function readyBattleCode(retry, withWeapons = true, id = '') {
  const seq = game.startSeq;
  const definitionsReady = id === 'town' || (id === 'inou' ? !!inouDefinition : id === 'moribe' ? !!moribeDefinition : !!BTm);
  if (definitionsReady && BM) return true;
  stage('戦の支度を読み込んでいます', 'defs');
  // 武器素材は下の素材支度で読む。ここで待つと、携帯の待ち時間の上限も自動用の省略も効かない。
  try { await Promise.all([id === 'town' ? Promise.resolve() : id === 'inou' ? inouLoad() : id === 'moribe' ? moribeLoad() : btLoad(), bmLoad(), withWeapons && !isNorender() ? loadWeapons() : Promise.resolve()]); try { sessionStorage.removeItem('risshin-reloaded'); } catch (e2) { /* なし */ } return seq === game.startSeq; }
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
        try { sessionStorage.setItem('risshin-reload-why', String(e && e.message || e).slice(0, 200)); } catch (e3) { /* 記せなくてもよい */ }   // 自動遊びの記録に残す（autoplay.js）
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
import { loadHumans, loadHorse, primeHorses, preparationFrame, loadDomaru, loadKabuto, primeHumans, warmBattleFaces, prefetchHumanShapes, updateHumans, setHumanCompiler, humanShadowLod, DOMARU as DOMd, HUM as HUMd } from './humans.js';
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
// iPhone（MEM_TIGHT）は、前の戦の物が WebKit の GPU process・WebContent に残ったまま次の戦を組むと、二戦目の始まりで落ちる（reason=3）。
// 重い場面（戦・城下・道場・地図の戦）を一度組んだ後に次の重い場面へ入る時は、遊びを保存してページを読み込み直し、読み込み後に同じ所から続ける。
// 続きの印は sessionStorage に一つだけ置き、読み込み後に最初に消す（二度は読み込まない）。置けない環境では読み込み直さずにそのまま進む。
const MEM_RESUME_KEY = 'risshin-mem-resume';
function memReloadGate(g, fn, args) {
  if (!MEM_TIGHT || isNorender() || /[?&]bot/.test(location.search) || window.__noMemReload) return false;
  if (!g.memDirty && !g.battle) return false;
  // app（iOS）は WKWebView ごと作り直す（GPU process に前の戦の分が残る。10/20）。その時は sessionStorage が消えるので localStorage に置く
  return resumeReload(g, fn, args, !!window.__iosRecreate);
}
// 遊びを保存して頁を読み込み直し、読み込み後に同じ所（fn(args)）から続ける。続きの印を置けない時は false（読み込み直さない）
function resumeReload(g, fn, args, recreate = false) {
  try {
    const rec = JSON.stringify({ fn, args, G: g.G || null, mapSnap: g.mapSnap || null, mapFrom: g.mapFrom || null, scn: scenarioKey(), t: Date.now(), boot: window.__bootId || null });
    const st = recreate ? localStorage : sessionStorage;
    st.setItem(MEM_RESUME_KEY, rec);
    if (st.getItem(MEM_RESUME_KEY) !== rec) return false;
  } catch (e) { return false; }
  if (g.G) save(g.G);   // 練習（G.practice）は save が何もしないので、続きの印の G だけで戻す
  window.__memReloading = true;
  g.paused = true;
  const card = document.createElement('div');
  card.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#14110d;color:#f1e6cf;font-size:18px;letter-spacing:.1em';
  card.textContent = '支度をしています';
  document.body.appendChild(card);
  setTimeout(() => { if (recreate) { try { window.webkit.messageHandlers.native.postMessage("recreate"); return; } catch (e) { /* 橋が無ければ読み込み直し */ } } location.reload(); }, 80);
  return true;
}
function memResume(g) {
  let rec = null;
  try {
    let s = sessionStorage.getItem(MEM_RESUME_KEY); sessionStorage.removeItem(MEM_RESUME_KEY);
    if (!s) { s = localStorage.getItem(MEM_RESUME_KEY); if (s) localStorage.removeItem(MEM_RESUME_KEY); }
    rec = s ? JSON.parse(s) : null;
  } catch (e) { return false; }
  // 同じ app の起動の中の続きだけ（前の起動の印は使わない）
  if (rec && window.__bootId && rec.boot !== window.__bootId) rec = null;
  if (!rec || typeof g[rec.fn] !== 'function' || !(Date.now() - rec.t < 10 * 60 * 1000)) return false;
  setScenario(rec.scn || (rec.G && rec.G.scenario));
  if (rec.G) g.G = rec.G;
  if (rec.mapSnap) g.mapSnap = rec.mapSnap;
  if (rec.mapFrom) g.mapFrom = rec.mapFrom;
  g.bg = null;
  window.__memResumed = { fn: rec.fn, args: rec.args || [] };
  initAudio();
  g[rec.fn](...(rec.args || []));
  return true;
}
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
  // iPhone は直接描画し、輪郭を滑らかにする追加の描画領域も持たない。
  // 記憶の少ない端末（device_tier.js）：絵の一辺の上限を 1024 と答え、three が 2048 の絵を送る時に半分へ縮める（GPU の絵が 1/4）
  if (TIER.weak) for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C || C.prototype.__weakMax) continue;
    const gp = C.prototype.getParameter; C.prototype.__weakMax = true;
    C.prototype.getParameter = function (p) { const v = gp.call(this, p); return p === 0x0D33 && TIER.weak ? Math.min(v, WEAK_TEX_MAX) : v; };
  }
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !MEM_TIGHT, powerPreference: 'high-performance' });
  noteGL(renderer.getContext());
  window.__tier = TIER;   // 確かめ用
  addEventListener('pagehide', () => markInBattle(false));
} catch (e) {
  $('glfail').hidden = false;
  try { window.__bootDone && window.__bootDone(); } catch (e2) { /* noop */ }
  throw e;
}
// 描く力（WebGL）を失った時（Android の記憶不足で GPU が落ちる。10/24 Lancers Xperia：画面の物が消えて止まった）。
// 弱い端末は兵の形の CPU の写しを手放している（gpuOnly）ので、three の復帰では元に戻らない。
// 記録を守り、戦の始めの記録（snapshot）に戻して、同じ戦（城下なら城下）から頁を読み直して続ける。2 分に一度まで。
canvas.addEventListener('webglcontextlost', () => {
  try {
    if (isNorender() || /[?&]bot/.test(location.search) || window.__memReloading) return;
    markCrashed();
    const at = +sessionStorage.getItem('risshin-gl-lost') || 0;
    if (Date.now() - at < 2 * 60 * 1000) return;   // 続けて失う時は読み直しを繰り返さない（題へは遊ぶ人が戻れる）
    sessionStorage.setItem('risshin-gl-lost', String(Date.now()));
    const ls = game.lastStart;
    if (game.battle && game.snapshot && ls && /^start(Map)?Battle$/.test(ls.fn)) { try { game.G = JSON.parse(game.snapshot); } catch (e) { /* 今の記録のまま */ } }
    if (ls && (game.battle || game.inTown) && resumeReload(game, ls.fn, ls.args)) return;
    if (game.G && !game.battle) save(game.G);
    setTimeout(() => location.reload(), 80);
  } catch (e) { /* 読み直せなければ three の復帰に任せる */ }
});
// iPhone：canvas に描いた絵は GPU へ送る時に ASTC へ圧縮する（astc_rt.js。?astc=1 でほかの機械でも試せる）
try { if (!/x_noastc/.test(String(window.__autoplay || ''))) installCanvasAstc(renderer, /[?&]astc=1/.test(location.search)); } catch (e) { /* 無ければそのまま */ }   // x_noastc：実機の記憶の切り分け（10/22）
// 一つも描く物が無い InstancedMesh（count 0）は、描く呼びかけごと省く（材質の準備だけで一回分の重さ。影の描きでも同じ）
{
  const rbd = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (object.isInstancedMesh && object.count === 0) return;
    geometry.userData.gpuUse = GPU_GC.clock;   // 描いた印（gpu_gc.js：iPhone は長く描かれない形を GPU から返す）
    return rbd.call(this, camera, scene, geometry, material, object, group);
  };
}
// 兵の形（units_model の merge の結果。gpuOnly の印）は、GPU へ送った後は CPU の配列を手放し、要る時だけ GPU から読み戻す。
// iPhone の WebContent は 2GB で切られ、兵 192 人の形の CPU の写し（約 250MB）が一番大きかった（10/19 実機）。
// 読み戻し（getBufferSubData）は束へ写す時・配列を書き換える時だけ起き、その後は普通の配列に戻る。
// iPhone：影の的（2048²）の深さの buffer を 24 bit → 16 bit に（8MB。影は RGBA に畳んだ深さを読むので、ここは描く順の判定にしか使わない）
if (MEM_TIGHT) {
  const gl = renderer.getContext();
  if (gl && gl.renderbufferStorage) {
    const rs = gl.renderbufferStorage.bind(gl);
    gl.renderbufferStorage = function (target, fmt, w, h) { if (fmt === gl.DEPTH_COMPONENT24 && w === h && w >= 2048) fmt = gl.DEPTH_COMPONENT16; return rs(target, fmt, w, h); };
  }
}
{
  const gl = renderer.getContext();
  if (gl && typeof gl.getBufferSubData === 'function' && typeof gl.bindVertexArray === 'function') {
    const bound = { buf: null, target: 0 };
    const ob = gl.bindBuffer.bind(gl);
    gl.bindBuffer = (t, b) => { bound.target = t; bound.buf = b; return ob(t, b); };
    const STAT = window.__gpuOnly = { dropped: 0, droppedMB: 0, readback: 0, readbackMB: 0 };
    const readBack = (attr) => {
      const g = attr._gpuRef; attr._gpuRef = null;
      const a = new g.ctor(g.len);
      try {
        const prevVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
        if (g.target === gl.ELEMENT_ARRAY_BUFFER) gl.bindVertexArray(null);
        const prev = bound.buf, prevT = bound.target;
        ob(g.target, g.buf);
        gl.getBufferSubData(g.target, 0, a);
        ob(g.target, null);
        if (g.target === gl.ELEMENT_ARRAY_BUFFER) gl.bindVertexArray(prevVao);
        if (prev && prevT === g.target) ob(prevT, prev);
        STAT.readback++; STAT.readbackMB += a.byteLength / 1048576;
      } catch (e) { /* 読み戻せない時は空の配列（描く分は GPU に残っている） */ }
      Object.defineProperty(attr, 'array', { value: a, writable: true, configurable: true, enumerable: true });
      return a;
    };
    if (TIER.weak) {
      // 返す形は先に読み戻す（共有の形は次の戦でまた送る。消えた GL の buffer からは読めない）
      const GP = THREE.BufferGeometry.prototype, gd = GP.dispose;
      GP.dispose = function () {
        for (const k in this.attributes) { const a = this.attributes[k]; if (a && a._gpuRef && !a.gpuOnly) void a.array; }
        if (this.index && this.index._gpuRef && !this.index.gpuOnly) void this.index.array;
        return gd.call(this);
      };
    }
    const P = THREE.BufferAttribute.prototype;
    // 記憶の少ない端末（device_tier.js）：兵の形だけでなく、一度だけ送る動かない形（地面・建物・木・束など 64KB 以上）も手放す。
    //   CPU の写しが 120〜160MB あった（10/23 計り：森部・稲葉山）。二度目に送る物（描き換える形）・兵の重ね（Instanced）は手放さない
    const weakDrop = (a, arr) => TIER.weak && arr.byteLength >= 65536 && a.usage === THREE.StaticDrawUsage && !a.isInstancedBufferAttribute && !a.isInterleavedBufferAttribute && (a._upN = (a._upN || 0) + 1) === 1;
    P.onUploadCallback = function () {
      const arr = this.array;
      if (!bound.buf || !arr || arr.byteLength < 16384 || this._gpuRef || !(this.gpuOnly || weakDrop(this, arr))) return;
      this._gpuRef = { buf: bound.buf, target: bound.target, ctor: arr.constructor, len: arr.length };
      STAT.dropped++; STAT.droppedMB += arr.byteLength / 1048576;
      Object.defineProperty(this, 'array', {
        configurable: true, enumerable: true,
        get() { return readBack(this); },
        set(v) { this._gpuRef = null; Object.defineProperty(this, 'array', { value: v, writable: true, configurable: true, enumerable: true }); },
      });
    };
  }
}
// 影の描き方の選び直しを止める：three は一つの影用の材質を骨入り・束・複製・普通の物で使い回し、
// 物が入れ替わるたびに描き方を選び直す（getParameters＋文字列の鍵）。一コマに何百回も起き、
// 捨てる物が毎秒数十MBになって JSC の heap を押し上げていた（10/19 実機の落ちの調べ）。種類ごとに影用の材質を持つ。
{
  const mk = () => { const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); m.name = 'depth-kind'; return m; };
  const kinds = [[THREE.SkinnedMesh, mk()], [THREE.BatchedMesh, mk()], [THREE.InstancedMesh, mk()]];
  for (const [C, dm] of kinds) {
    if (!C || !C.prototype || Object.getOwnPropertyDescriptor(C.prototype, 'customDepthMaterial')) continue;
    Object.defineProperty(C.prototype, 'customDepthMaterial', {
      configurable: true,
      get() {
        if (this._cdm !== undefined) return this._cdm;
        const m = this.material;
        // 穴あき（alphaTest）の物は three の既定（材質ごとの写し）に任せる
        if (!m || Array.isArray(m) || (m.alphaTest > 0 && (m.map || m.alphaMap)) || m.displacementMap || m.clipShadows) return undefined;
        return dm;
      },
      set(v) { this._cdm = v; },
    });
  }
}
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// 影は形の転送前に軽くし、影を描き終えたら画面用へ戻す（影では onBeforeRender が呼ばれない）。
{
  const shadowHeld = [], shadowHidden = [];
  const limitUnitShadow = (o, unit) => {
    // 隠れた枝は影にも出ない。所属する兵は子へ渡し、部品ごとに親を探し直さない。
    if (!o.visible) return;
    unit = o._armyUnit || unit;
    if (o.castShadow && !o.isLight && !o.userData.unitShadowBatch &&
        (!unit?.shOn || !unit.alive || unit.dying || unit.gone)) {
      shadowHeld.push(o); o.castShadow = false;
    }
    const children = o.children;
    for (let i = 0; i < children.length; i++) limitUnitShadow(children[i], unit);
  };
  const shadowRender = renderer.shadowMap.render;
  renderer.shadowMap.render = function (lights, scene, camera) {
    // 影を更新しないコマには、人の形の切替と場面の巡回も要らない。
    if (!this.enabled || !this.autoUpdate && !this.needsUpdate || lights.length === 0) {
      return shadowRender.call(this, lights, scene, camera);
    }
    // 影は本人だけ（10/24 kaito）：本人の入れ物のほかは、影の描き込みの間だけ隠して辿らせもしない。
    const hero = window.__game?.battle?.player?.u?.mesh;
    if (scene.userData.limitedUnitShadows) {
      const ch = scene.children;
      for (let i = 0; i < ch.length; i++) { const c = ch[i]; if (c !== hero && c.visible && !c.isLight) { c.visible = false; shadowHidden.push(c); } }
    }
    try {
      // 景物・遠景・新しく追加された小道具も、動く影の描き込みへ入れない。
      if (scene.userData.limitedUnitShadows) limitUnitShadow(scene, null);
      humanShadowLod(scene, true);
      return shadowRender.call(this, lights, scene, camera);
    } finally {
      humanShadowLod(scene, false);
      for (const o of shadowHeld) o.castShadow = true;
      shadowHeld.length = 0;
      for (const o of shadowHidden) o.visible = true;
      shadowHidden.length = 0;
    }
  };
}
// 0 人の InstancedMesh（遠い軍勢の段落ち・影だけの束・数の尽きた木など）は描かない。three は 0 人でも描き方を整えて一回描く
//   （森部の乱戦で一コマ五十回ほどの空の描き。10/21）
{
  const rbd = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (object.isInstancedMesh && object.count === 0) return;
    return rbd.call(this, camera, scene, geometry, material, object, group);
  };
}
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
setRenderer(renderer); window.__renderer = renderer;
const camera = new THREE.PerspectiveCamera(Math.min(S.fov, 54), 1, 0.1, 150);
// 戦の途中に作った人の材質は、描く前に絵の仕組みを作り始める（humans.js が呼ぶ。もう作ってある材質だけなら何もしない）
setHumanCompiler((obj) => {
  const sc = game?.battle?.scene;
  if (!renderer || !sc || isNorender() || window.__noPreCompile) return false;
  let fresh = false;
  obj.traverse((o) => { const m = o.material; if (!m || fresh) return; for (const x of Array.isArray(m) ? m : [m]) if (!renderer.properties.get(x).currentProgram) fresh = true; });
  if (fresh) renderer.compile(obj, camera, sc);
  return fresh;
}, async (obj, scene) => {
  // 支度中は、まだ game.battle に渡していない戦場を使う。
  const sc = scene || game?.battle?.scene;
  if (!renderer || !sc || isNorender() || window.__noPreCompile) return;
  if (renderer.compileAsync) await Promise.race([renderer.compileAsync(obj, camera, sc), new Promise((r) => setTimeout(r, 8000))]);   // Safari で終わらない事がある（10/17）
  else renderer.compile(obj, camera, sc);
}, renderer);
// 上空視点（rts.js）：touch.js より先に付けて、開いている間は指・マウスの入力をそちらへ渡す（touch.js は直さない）
initRtsInput(canvas, () => game.battle, () => camera);
const HEAT_SCALE = [1.25, 1.0, 0.9, 0.75];   // iPhone の熱の段ごとの描画倍率の上限
let powerScale = MEM_TIGHT ? HEAT_SCALE[0] : 1;   // iPhone は上限、ほかの端末は従来の倍率（__iosPower が動かす）
let powerCap = 0, powerTold = false, heatLevel = 0, heatTarget = 0, heatChangedAt = 0, heatFrame = 0;   // 熱の段（heatStep）
const resScale = 1;   // 描く画素の倍率は熱の段（powerScale）だけ。画質の自動（measureQuality・dynRes）は一度も走らない作りだったので消した（10/21 引き算）
// 描く回数の上限：設定の値と、端末が熱い時の 30（__iosPower）の小さい方
// iPhone は試しの指定や設定によらず毎秒三十枚まで。ほかの端末の試しの指定は従来どおり。
function fpsCapNow() { if (MEM_TIGHT) return 30; if (APX.cap != null) return APX.cap === true ? 30 : APX.cap; return powerCap && (!S.fpsCap || S.fpsCap > powerCap) ? powerCap : S.fpsCap; }
function applyRenderSettings() {
  const Q = QUALITY[S.quality] || QUALITY.high;
  renderer.shadowMap.enabled = false;
  camera.fov = Math.min(S.fov, 54);
  resize();
}
// 画面の仕上げ（画質「中」「高」）：実写の合戦映画のような画（中身は post.js）
// 中：明暗順応・色の作り・周辺減光・粒。高：それに加えて、明るい所のにじみ・接地の影・遠くのぼけ・速く振った時のぶれ
// 画質「低」は仕上げなしでそのまま描く
let composer = null, renderPass = null, bloomPass = null, adaptPass = null, finishPass = null, composerMS = -1, lastDraw = 0;
let composerWidth = 0, composerHeight = 0, composerRatio = 0;
// 題や前の戦の大きな描画領域を、次の素材の展開中まで持ち越さない。
// にじみの領域は composer.dispose では返らないので、各段も個別に返す。
function disposeFinish() {
  if (!composer) return false;
  renderPass.scene = null;
  composer.dispose(); bloomPass?.dispose(); adaptPass.dispose(); finishPass.dispose();
  composer = renderPass = bloomPass = adaptPass = finishPass = null;
  composerMS = -1; composerWidth = composerHeight = composerRatio = lastDraw = 0;
  window.__post = null;
  return true;
}
function useFinish() { return false; }   // 10/24 kaito：仕上げの描き直し（composer）をやめ、全端末で画面へ直接描く
// 光の筋の計算に毎コマ使う入れ物（毎コマ new しない）
const _dSd = new THREE.Vector3(), _dFw = new THREE.Vector3(), _dP = new THREE.Vector3();
const _drawArea = new THREE.Vector4(), _drawSize = new THREE.Vector2(), _drawPixel = new Uint8Array(4);
// 開発用に game.measureDraw = true とした一コマだけ読む。通常は画素を読まない。
function measureSaikaPixels(measure, key) {
  const gl = renderer.getContext();
  renderer.getDrawingBufferSize(_drawSize);
  let dark = 0;
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) {
    gl.readPixels(Math.floor(_drawSize.x * x / 4), Math.floor(_drawSize.y * y / 4), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _drawPixel);
    if (Math.max(_drawPixel[0], _drawPixel[1], _drawPixel[2]) < 16) dark++;
  }
  measure[key] = dark;
}
// 画質「低」：両面の半透明（幟の布・炎の板・煙）は、裏と表の二回に分けて描かず一回で描く（平たい板なので見分けが付かない）。
// 新しい材質の確認は六十コマごとに始め、場全体を一コマで辿らない。
const _singlePass = new WeakSet();
const _singlePassScans = new WeakMap();
function singlePassMaterial(q) {
  if (!q || !q.transparent || q.side !== THREE.DoubleSide || _singlePass.has(q)) return;
  _singlePass.add(q);
  if (!q.forceSinglePass) { q.forceSinglePass = true; q.userData.lowSinglePass = true; }
}
function singlePassObject(o) {
  const m = o.material;
  if (Array.isArray(m)) { for (let i = 0; i < m.length; i++) singlePassMaterial(m[i]); }
  else singlePassMaterial(m); // 一つの材質を配列に包まず、毎回のごみを作らない。
}
function singlePassLow(scene) {
  // 全画質で同じ。最初の画面・明示した作り直しは幕の内で全部整える。
  let scan = _singlePassScans.get(scene);
  if (!scan || scene.userData.singlePassFresh) {
    if (!scan) { scan = { nodes: [], indices: [], wait: 60 }; _singlePassScans.set(scene, scan); }
    scan.nodes.length = scan.indices.length = 0; scan.wait = 60;
    scene.userData.singlePassFresh = false;
    scene.traverse(singlePassObject);
    return;
  }
  const nodes = scan.nodes, indices = scan.indices;
  if (!nodes.length) {
    if (--scan.wait > 0) return;
    nodes.push(scene); indices.push(-1); scan.wait = 60;
  }
  // 深さごとの入れ物を使い回す。幅広い場でも子をまとめて積まない。
  const start = performance.now();
  let visited = 0, steps = 0;
  while (nodes.length && visited < 256) {
    const top = nodes.length - 1, o = nodes[top];
    if (indices[top] === -1) { singlePassObject(o); indices[top] = 0; visited++; }
    if (indices[top] < o.children.length) {
      const child = o.children[indices[top]++];
      nodes.push(child); indices.push(-1);
    } else { nodes.pop(); indices.pop(); }
    // 親へ戻る手間も含め、一コマ一ミリ秒までで次のコマへ渡す。
    if (++steps % 32 === 0 && performance.now() - start >= 1) break;
  }
}
// 戦場の材質が持つ絵を、約 12MB ごとにコマを挟みながら GPU へ送る（最初の一枚での一括送りを避ける）。戻り値は送った枚数と MB
async function paceTextureUploads(scene, current = () => true, extraMaterials = []) {
  const texs = new Set(), PROPS = renderer.properties;
  const collect = (list) => {
    for (const m of list) {
      if (!m) continue;
      for (const k in m) { const v = m[k]; if (v && v.isTexture && !v.isRenderTargetTexture) texs.add(v); }
      if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture && !v.isRenderTargetTexture) texs.add(v); }
    }
  };
  scene.traverse((o) => collect([].concat(o.material || [])));
  collect(extraMaterials);
  let n = 0, bytes = 0, chunk = 0;
  for (const t of texs) {
    if (!current()) break;
    if (PROPS.get(t).__webglTexture) continue;   // もう送ってある
    const im = t.image; if (!im) continue;
    const w = im.width || 0, h = im.height || 0; if (!w || !h) continue;
    try { renderer.initTexture(t); } catch (e) { continue; }
    const sz = w * h * 4; n++; bytes += sz; chunk += sz;
    if (chunk >= 12 * 1048576) { chunk = 0; await preparationFrame(); }
  }
  await freeUploadedImages(scene, current);
  return { n, mb: Math.round(bytes / 1048576) };
}
// GPU へ送り終えた jpg の絵（userData.freeImage の印の texture）は、元の img を手放して解いた絵の写しを消す（WebKit は img を持つ限り解いた絵を残す）。
// 送り直しは起きない（静かな絵だけに印を付ける）。戻り値は手放した枚数
async function freeUploadedImages(scene, current = () => true) {
  const PROPS = renderer.properties, seen = new Set(), materials = new Set();
  let n = 0;
  const one = (t) => {
    if (!t || seen.has(t) || !t.userData || !t.userData.freeImage) return;
    seen.add(t);
    const im = t.image;
    if (!(im instanceof HTMLImageElement) || !PROPS.get(t).__webglTexture) return;
    t.image = { width: im.width, height: im.height };
    n++;
  };
  const material = (m) => {
    if (!m || materials.has(m)) return;
    materials.add(m);
    for (const k in m) { const v = m[k]; if (v && v.isTexture) one(v); }
    if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) one(v); }
  };
  // 十秒後・四十秒後の全場面巡回も分割する。子の一覧や材質の配列を節ごとに作らない。
  // 深さだけの入れ物を持ち、一コマ百二十八手・一ミリ秒を目安に次のコマへ渡す。
  const nodes = [scene], indices = [-1];
  while (nodes.length && current()) {
    const start = performance.now();
    let steps = 0;
    do {
      const top = nodes.length - 1, o = nodes[top];
      if (indices[top] === -1) {
        if (Array.isArray(o.material)) { for (const m of o.material) material(m); }
        else material(o.material);
        indices[top] = 0;
      }
      if (indices[top] < o.children.length) {
        nodes.push(o.children[indices[top]++]); indices.push(-1);
      } else { nodes.pop(); indices.pop(); }
      if (++steps % 16 === 0 && performance.now() - start >= 1) break;
    } while (nodes.length && steps < 128);
    if (nodes.length) await preparationFrame();
  }
  return n;
}
// UnrealBloomPass の描き：明るい所の抜き出し→段ごとのぼかし→合成までで止め、景色の的への足し描きをしない（合成の的 foldTexture を仕上げが読む）
function foldBloom(bp) {
  bp.render = function (renderer, writeBuffer, readBuffer) {
    renderer.getClearColor(this._oldClearColor); this.oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear; renderer.autoClear = false;
    renderer.setClearColor(this.clearColor, 0);
    this.highPassUniforms.tDiffuse.value = readBuffer.texture;
    this.highPassUniforms.luminosityThreshold.value = this.threshold;
    this.fsQuad.material = this.materialHighPassFilter;
    renderer.setRenderTarget(this.renderTargetBright); renderer.clear(); this.fsQuad.render(renderer);
    let input = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++) {
      const m = this.separableBlurMaterials[i];
      this.fsQuad.material = m;
      m.uniforms.colorTexture.value = input.texture; m.uniforms.direction.value = UnrealBloomPass.BlurDirectionX;
      renderer.setRenderTarget(this.renderTargetsHorizontal[i]); renderer.clear(); this.fsQuad.render(renderer);
      m.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture; m.uniforms.direction.value = UnrealBloomPass.BlurDirectionY;
      renderer.setRenderTarget(this.renderTargetsVertical[i]); renderer.clear(); this.fsQuad.render(renderer);
      input = this.renderTargetsVertical[i];
    }
    this.fsQuad.material = this.compositeMaterial;
    this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
    this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
    this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]); renderer.clear(); this.fsQuad.render(renderer);
    this.foldTexture = this.renderTargetsHorizontal[0].texture;
    renderer.setClearColor(this._oldClearColor, this.oldClearAlpha); renderer.autoClear = oldAutoClear;
  };
}
function draw(scene, fresh = false) {
  if (!APX.simplemat && !APX.nosmoke) return drawScene(scene, fresh);
  try { probeDraw(scene, game.battle, APX); return drawScene(scene, fresh); } finally { restoreProbeDraw(); }
}
function drawScene(scene, fresh = false) {
  if (APX.nodraw) return;   // 実機の試し：描かずに輪だけ回す（外の時間が描きの待ちかを見る）
  if (fresh) scene.userData.singlePassFresh = true;
  singlePassLow(scene);
  if (game.battle && game.battle.scene === scene) noboriCull(camera, scene);
  // 設定を直接切り替えた場合も、低で前の画質の影を描き続けない。熱 3 は影を描かない
  heatStep();
  renderer.shadowMap.enabled = false;
  // 熱 1 以上は影の描き直しを二コマに一度（影の的 2048² の描き込みが毎コマの GPU の仕事の大きな分）
  if (heatLevel >= 1 && renderer.shadowMap.enabled) { renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = (++heatFrame & 1) === 0; }
  else if (!renderer.shadowMap.autoUpdate) { renderer.shadowMap.autoUpdate = true; renderer.shadowMap.needsUpdate = true; }
  // 戦の側が光を直接変えた後にも、全画質で同じ夜の散乱光を当てる。
  const nightWorld = game.battle && game.battle.world;
  let drawMeasure = null;
  const probe = game.measureDraw === true && game.battle?.def.fullDrawArea && nightWorld?.scene === scene;
  if (game.battle?.def.fullDrawArea && nightWorld?.scene === scene) {
    drawMeasure = game.battle.flags.saikaDraw || (game.battle.flags.saikaDraw = {});
    renderer.getViewport(_drawArea);
    drawMeasure.x = _drawArea.x; drawMeasure.y = _drawArea.y;
    drawMeasure.width = _drawArea.z; drawMeasure.height = _drawArea.w;
    drawMeasure.scissor = renderer.getScissorTest();
    drawMeasure.offscreen = !!renderer.getRenderTarget();
    drawMeasure.contextLost = renderer.getContext().isContextLost();
    drawMeasure.fresh = fresh; drawMeasure.t = game.battle.t;
    drawMeasure.hold = game.battle.holdPct || 0;
    drawMeasure.frames = (drawMeasure.frames || 0) + 1;
    // 影や一画素の明暗順応の範囲を、画面の描画へ残さない。
    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  }
  // 描く直前に測るので、速回し・直接描画も同じ値になる。
  // flags.drawView に地面・水面までの最小の隙間、めり込みの回数と補正量を残す。
  if (nightWorld && nightWorld.scene === scene && !game.battle.def.town && !game.photo && !game.deployment && !NAKA.cur) {
    const measure = game.battle.flags.drawView || (game.battle.flags.drawView = { groundGap: 0, waterGap: 0, interpolationGap: 0, lift: 0 });
    const beforeX = camera.position.x, beforeY = camera.position.y, beforeZ = camera.position.z;
    guardDrawCamera(nightWorld, camera, measure);
    // 通常の視点は更新時に判定済み。最後の補正で動いた時だけ屋根・壁を調べ直す。
    if (camera.position.x !== beforeX || camera.position.y !== beforeY || camera.position.z !== beforeZ) {
      game.battle.player.clearDrawBuildings(camera);
    }
  } else camera.updateMatrixWorld();
  // 夜の散乱光にも、視点切替後の行列を渡す。低画質も同じ順にする。
  const night = nightWorld && nightWorld.scene === scene ? nightWorld.prepareNight() : 0;
  UNIT_NIGHT.value = nightWorld && nightWorld.scene === scene ? (nightWorld.def.unitNightScale === 0 ? 0 : Math.max(nightWorld.def.unitCloudFill ?? 0.35, night * (nightWorld.def.unitNightScale ?? 1))) : 0;
  UNIT_FIRE_METAL.value = nightWorld && nightWorld.scene === scene ? night * (nightWorld.def.nightMetalness ?? 0) : 0;
  FLAG_MOON.value = night;
  if (UNIT_NIGHT.value) UNIT_NIGHT_FOCUS.value.copy(game.battle.player.u.pos).applyMatrix4(camera.matrixWorldInverse).multiplyScalar(-1);
  // 画質「低」は明暗順応が無いので、夜の戦はほぼ真っ黒に沈んでいた（携帯の小さな画面で何も見えない）。夜だけ露出を上げて、月明かりの青い夜に
  if (!useFinish()) {
    const e0 = renderer.toneMappingExposure;
    // 昼の雨も、中・高の明暗順応（暗い絵を最大1.3倍）が無い分だけ少し持ち上げる
    const wr = nightWorld && nightWorld.scene === scene ? Math.min(1, nightWorld.rainLevel || 0) * (1 - night) : 0;
    renderer.toneMappingExposure = e0 * (1 + night * (nightWorld?.def.lowNightExposure ?? 1.25)) * (1 + wr * 0.15);
    renderer.render(scene, camera);
    renderer.toneMappingExposure = e0;
    if (probe) { measureSaikaPixels(drawMeasure, 'rawDark'); drawMeasure.finishDark = drawMeasure.rawDark; game.measureDraw = false; }
    return;
  }
  const Q = QUALITY[S.quality] || QUALITY.high;
  // 画質「中」は画素を増やさないので、縁のぎざぎざを重ね描きで消す
  const ms = 2;   // 10/24：縁の重ね描きは 2 に（4 は絵を描く側が重い）   // 「高」も縁を滑らかに（895）
  if (!composer || composerMS !== ms) {
    disposeFinish();
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
    // にじみ自身が縦横半分へ縮めるので、元の寸法を渡す。画面回転・倍率変更も同じ扱い。
    // 10/24 kaito：光のにじみ（UnrealBloomPass）はやめる。明るさの慣れ（AdaptPass）も composer へ入れず、明るさは一定
    bloomPass = null;
    adaptPass = new AdaptPass();
    finishPass = new FinishPass(!ms);
    composer.addPass(finishPass);
    // 作った時点で描画器の倍率を引き継いでいる。支度中も同じ大きさで二度作り直さない。
    composerRatio = renderer.getPixelRatio();
    composerWidth = Math.max(1, window.innerWidth); composerHeight = Math.max(1, window.innerHeight);
    composer.setSize(composerWidth, composerHeight);
    window.__post = { composer, renderPass, bloomPass, adaptPass, finishPass };   // 開発用：仕上げの段を一つずつ切って確かめる
  }
  const now = performance.now(), dt = lastDraw ? Math.min(0.25, (now - lastDraw) / 1000) : 1 / 60;
  if (fresh) { adaptPass.fresh = true; finishPass.prevVP = null; }
  lastDraw = now;
  const hi = true, U = finishPass.uniforms;
  { const A2 = adaptPass.mat.uniforms; U.uBloomK.value = 0; U.tBloom.value = null; A2.uBloomK.value = 0; A2.tBloom.value = null; }
  // 夜の戦は中・高でも沈みすぎて何も見えなかった（大河内の夜の雨が真っ黒）。月明かりで兵と地形の形が読める所まで上げる
  U.toneMappingExposure.value = renderer.toneMappingExposure * (1 + night * 0.7);
  U.uNight.value = night;
  adaptPass.mat.uniforms.uNight.value = night;
  if (!RMm()) U.uTime.value = (U.uTime.value + 1 / 60) % 1000;
  renderer.getDrawingBufferSize(U.uRes.value);
  // game.postOff：開発用。{ ao, dof, grade } を true にすると、その仕上げだけ切る（見比べ用）
  const off = game.postOff || { ao: APX.noao, dof: APX.nodof, rays: APX.norays };
  U.uAO.value = 0;   // 仕上げの接地影も描かない。足もとの丸い板はそのまま。
  U.uDof.value = 0;   // 10/24：深さを使うぼけは止める
  U.uGrade.value = off.grade ? 0 : 1;
  U.uBlur.value = 0;   // 10/24：動きのぶれは止める
  U.tAdapt.value = adaptPass.texture;
  adaptPass.dt = dt;
  U.uAuto.value = 0;   // 10/24：明るさは一定（慣れの段を描かない）
  const A = adaptPass.mat.uniforms; A.uNear.value = camera.near; A.uFar.value = camera.far;
  finishPass.setCamera(camera);
  // 光の筋：日が画面の前の方にある時だけ（画質「高」、動きを減らす設定では切る）
  const W = game.battle && game.battle.world;
  U.uSunK.value = 0;
  if (false && hi && W && W.sunOffset && !off.rays) {   // 10/24：光の筋は止める
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
  // 同じ視点・霧・空・影で、仕上げ前後を九か所ずつ比べる。撮影の損ないとも区別できる。
  if (probe) {
    renderer.render(scene, camera);
    measureSaikaPixels(drawMeasure, 'rawDark');
    drawMeasure.exposure = renderer.toneMappingExposure;
    drawMeasure.fogFar = scene.fog?.far;
    drawMeasure.shadow = renderer.shadowMap.enabled;
  }
  composer.render();
  if (probe) { measureSaikaPixels(drawMeasure, 'finishDark'); game.measureDraw = false; }
}
let sizeDirty = false;   // キャンバスの大きさを変えて、まだ描き直していない（setSize は絵を消す）
function resize() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  // 10/24 kaito：携帯は描く細かさ 0.85、熱い時（熱の段 1 以上）は 0.75。パソコンは 1 のまま
  const ratio = MEM_TIGHT ? (heatLevel >= 1 ? 0.75 : 0.85) : 1;
  renderer.getSize(_drawSize);
  // 倍率だけの変更も一度で済ませる。setPixelRatio の中でも setSize が呼ばれるため、
  // 両方呼ぶと同じコマでキャンバスと仕上げの寸法更新が重複していた。
  if (_drawSize.x !== w || _drawSize.y !== h || renderer.getPixelRatio() !== ratio) {
    sizeDirty = true;
    renderer.setDrawingBufferSize(w, h, ratio);
  }
  if (composer) {
    if (composerRatio !== ratio) {
      composer.setPixelRatio(ratio);
      composerRatio = ratio;
    }
    if (composerWidth !== w || composerHeight !== h) {
      composer.setSize(w, h);
      composerWidth = w; composerHeight = h;
    }
  }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
applyRenderSettings();

// 設定が変わったときに即時反映
function onSettings(key) {
  if (['fov', 'quality', 'drawDist', 'all'].includes(key)) applyRenderSettings();
  if ((key === 'quality' || key === 'all') && game.battle) game.battle.applyQuality();
  if (['volume', 'volSfx', 'volAmb', 'volMusic', 'all'].includes(key)) setVolume(S.volume);
  if (key === 'townMusic' || key === 'all') {
    townMusic(S.townMusic && game.inTown, game.battle?.def.season, game.inTown);
  }
  if (['voice', 'volume', 'volVoice', 'all'].includes(key) && (S.voice === 'off' || S.volume === 0 || S.volVoice === 0)) window.speechSynthesis?.cancel();
  if (key === 'heatFloor' || key === 'all') applyHeatFloor();
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
  clear() { this.keys.clear(); this.mouseL = this.mouseR = this.padL = this.padR = this.runHeld = false; this.axis = null; this.touchMoving = false; this.endFrame(); },
};
const GAME_KEYS = new Set(['AltLeft', 'AltRight', 'Enter', 'KeyP', 'KeyU', 'KeyB', 'BracketLeft', 'BracketRight', 'Tab', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyM', 'KeyH', 'KeyG', 'KeyQ', 'KeyR', 'KeyT', 'KeyL', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyN', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'ShiftLeft', 'ShiftRight']);
const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
function movementKeydown(e) {
  const code = canonical(e.code);
  if (!MOVE_KEYS.has(code) || !$('loading').hidden || !game.battle || game.townShop) return;
  // 名前の入力や設定の変更中は、文字や値の操作を保つ。
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement || e.target.isContentEditable) return;
  if (game.deployment) { e.preventDefault(); game.deployment.jump(); return; }
  if (game.hud.introWaiting) $('intro-go')?.click();
  if (game.paused || game.photo || isRtsOn(game.battle)) return;
  e.preventDefault();
  game.hud.padMode = false;
  if (!e.repeat) input.edge.add(code);
  input.keys.add(code);
}
window.addEventListener('keydown', movementKeydown, true);
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
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.target.isContentEditable) return;
  const code = canonical(e.code);
  if (GAME_KEYS.has(e.code) || GAME_KEYS.has(code)) e.preventDefault();
  if (code === null) return;
  if (simpleControls(game.battle) && ['KeyP', 'KeyL', 'KeyB', 'KeyU'].includes(code)) return;
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
  if (e.code === 'Escape' && !locked && !game.helpOpen) {
    if (game.gungiOn ? $('pause').hidden : !game.paused) setPause(true);
    else resumePlay();
    return;
  }
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
window.addEventListener('keyup', (e) => { const c = canonical(e.code); if (c) input.keys.delete(c); }, true);
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
  // 初陣はピンと敵印だけで案内する。指の画面にもマウスの説明を重ねない。
  if (game.battle?.def.key === 'inou' || isTouch) on = false;
  let el = document.getElementById('lockhint');
  if (on && !el) {
    el = document.createElement('div');
    el.id = 'lockhint';
    el.setAttribute('role', 'status');
    el.textContent = '押すと、手元の操作器で見回せます';
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
  if (!locked && !game.noLock) {
    requestLock();
    // 初陣では、見回しを始める一押しも攻撃へ通す。接敵後も空振りに見せない。
    if (game.battle.def.key !== 'inou') return;
  }
  if (e.button === 0) { input.mouseL = true; input.leftPressed = true; }
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
window.addEventListener('beforeunload', (e) => { if (!window.__memReloading && game.battle && !game.battle.over && !(game.battle.def && game.battle.def.town)) { e.preventDefault(); e.returnValue = ''; } });
// 思わぬ不具合が起きたら知らせる
// 戦の途中で不具合が起きた時の知らせ（携帯と PC で同じ文。中断の札から立て直せる）
function crashNotice() { setPause(true); }
function preparationError(type, message, source) {
  if (!window.__autoplay && !new URLSearchParams(location.search).has('autoplay')) return;
  const errors = window.__preparationErrors ||= [];
  errors.push({ type, at: new Date().toISOString(), ms: Math.round(performance.now()), battle: window.__loadTimes?.battle, phase: window.__loadTimes?.phase, message: String(message).slice(0, 500), source: String(source || '').slice(0, 500) });
  if (errors.length > 32) errors.shift();
  window.dispatchEvent(new Event('risshin-preparation-progress'));
}
window.addEventListener('error', (e) => {
  preparationError('window.onerror', e.message || e.error, `${e.filename || ''}:${e.lineno || 0}:${e.colno || 0}`);
  if (!game.battle) return;
  // ResizeObserver の「届けきれなかった」は害の無い知らせ。遊ぶ人に「問題が起きました」を出さない（10/11 木津川口で出た）
  if (/ResizeObserver loop/.test(e.message || '')) return;
  console.error(e.error || e.message);
  reportBug(e.message, `${(e.filename || '').split('/').pop()}:${e.lineno}`);
});
window.addEventListener('unhandledrejection', (e) => {
  preparationError('unhandledrejection', e.reason?.message || e.reason, e.reason?.stack);
  if (!game.battle) return;
  const r = e.reason;
  console.error(r);
  reportBug(String((r && r.message) || r), ((r && r.stack) || '').split('\n')[1] || '待ちの失敗');
});
let escAt = -1e9;
window.addEventListener('keydown', (e) => { if (e.code === 'Escape') escAt = performance.now(); }, true);
document.addEventListener('pointerlockchange', () => {
  const wasLocked = locked;
  locked = document.pointerLockElement === canvas;
  if (locked) { autoTry = false; lockHint(false); game.noLock = false; edgeX = null; }
  // 軍議の間（城を回して見る・始めの寄せ）は、マウスを放しても捕まえても一時停止の札を出し入れしない
  if (game.gungiOn || game.deployment || game.hud.introWaiting) return;
  // マウスの捕まえが外れただけでは止めない（Windows の Chrome で勝手に外れ、すぐ「一時中断」になって遊べなかった。Lancers 10/24）。
  // 自分で Esc を押して外した時だけ止める。外れた後は、画面をクリックすればまた捕まえる。
  if (wasLocked && !locked && performance.now() - escAt < 400 && !game.noLock && game.battle && !game.battle.over && !game.helpOpen && !game.mapOpen && !game.townShop) setPause(true);
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
// 端末が熱い（thermal 1＝少し・2＝かなり・3＝とても）・低電力モード：段階的に軽くする（兵の数と密度は変えない。設定には書かない）。
//   iPhone の描画倍率の上限は平常 1.25・少し熱い 1.0・かなり熱い 0.9・とても熱い 0.75。仕上げは常に切る。
//   1：影の描き直しを二コマに一度。2：描く回数 30 まで。3：影も切る。ほかの端末の倍率は従来どおり。
//   上がる時はすぐ、下がる時は一段ずつ（30 秒おき）。熱 3 のまま森部の乱戦を描くと GPU process ごと切られていた（10/20）
window.__heat = () => ({ level: heatLevel, target: heatTarget });   // 確かめ用
function heatStep() {
  if (!MEM_TIGHT) return;   // 保存された軽量設定でも、パソコンの解像度・光・影は下げない。
  const now = performance.now();
  let lv = heatLevel;
  if (heatTarget > lv) lv = heatTarget;
  else if (heatTarget < lv && now - heatChangedAt > 30000) lv -= 1;
  if (lv === heatLevel) return;
  heatLevel = lv; heatChangedAt = now; window.__heatLevel = lv;
  powerCap = lv >= 2 ? 30 : 0;
  if (lv < 2) { if (composer && !useFinish()) { /* 仕上げは次の draw が作り直す */ } }
  else disposeFinish();   // 仕上げの的（半精度・MSAA 4・約 25MB）も返す
  powerScale = MEM_TIGHT ? HEAT_SCALE[lv] : lv < 2 ? 1 : lv === 2 ? 0.75 : 0.6;
  applyRenderSettings();
  if (lv >= 2 && !powerTold && game.battle) { powerTold = true; notice('端末が熱くなってきたので、描き込みを軽くしました'); }
  if (lv < 2) powerTold = false;
}
window.__iosPower = (o) => {
  iosThermalSeen = true;
  const t = (o && o.thermal) || 0, low = !!(o && o.lowPower);
  window.__iosPowerState = { thermal: t, lowPower: low };   // 自動計測より先に届いた実機の熱も引き継ぐ
  iosHeat = Math.max(t, low ? 2 : 0);
  heatTarget = Math.max(iosHeat, S.heatFloor || 0);
  heatStep();
};
let iosHeat = 0, iosThermalSeen = false;
// 10/24：Web 版（アプリの熱の知らせが無い時）は、コマの長い時が続いたら熱の段 1 を入れ、戻れば外す
let webHeatSlow = 0, webHeatFast = 0;
function webHeatWatch(real) {
  if (real <= 0) return;
  if (real > 0.045) { webHeatSlow += real; webHeatFast = 0; } else { webHeatFast += real; if (webHeatFast > 5) webHeatSlow = 0; }
  const want = webHeatSlow > 8 ? 1 : webHeatFast > 60 ? 0 : heatTarget;
  if (want !== heatTarget && (S.heatFloor || 0) <= want) { heatTarget = want; heatStep(); }
}
// 軽く遊ぶ段（設定の「軽く遊ぶ」・落ちた後の札）：熱の段をこの段から始める
function applyHeatFloor() { heatTarget = Math.max(iosHeat, Math.min(3, S.heatFloor || 0)); heatChangedAt = -1e9; heatStep(); }

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
  if (ph) el.innerHTML = `<b>写真方式</b>　${K('forward')}${K('left')}${K('back')}${K('right')} 移動・空白／${K('attack')} 上下・手元の操作器 見回す・回し車 画角<br>1〜4 色合い（いま：${FILTER_NAMES[ph.filter]}）・H 自分を隠す・G 構図の線・K 撮る・P 戻る`;
}
function togglePhoto() {
  if (simpleControls(game.battle)) return;
  if (!game.battle) return;
  if (game.photo) {
    game.photo = null; game.hud.root.classList.remove('photo'); canvas.style.filter = ''; document.querySelector('.photogrid')?.remove();
    if (game.battle) game.battle.player.u.mesh.visible = true;
    camera.fov = Math.min(S.fov, 54); camera.updateProjectionMatrix();
    photoUi(); notice('写真方式を終えました'); return;
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
    d.innerHTML = `<img src="${url}" alt="撮った一枚" style="filter:${FILTERS[ph.filter]}"><p class="note">画像を右押し（長押し）して保存できます。押して閉じる</p>`;
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
const padAxis = { x: 0, y: 0 };
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
  if (!gp) { if (input.axis === padAxis) input.axis = null; input.padL = input.padR = false; return; }
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
    padAxis.x = dz(gp.axes[0] || 0); padAxis.y = dz(gp.axes[1] || 0);
    if (!input.touchMoving) input.axis = padAxis;
    input.dx += dz(gp.axes[2] || 0) * 16 * S.padSens;
    input.dy += dz(gp.axes[3] || 0) * 11 * S.padSens;
    input.padL = b(7) || b(5);
    if (edge(7) || edge(5)) input.leftPressed = true;
    if (gp.buttons.some((x) => x.pressed) || Math.hypot(input.axis.x, input.axis.y) > 0.3) { game.hud.padMode = true; game.pad = gp; }
    const map = { 2: 'KeyE', 3: 'Tab', 4: 'KeyF' };
    // Y は押している間も「Tab を押している」ことにする（長押しで号令の輪）
    if (b(3)) input.keys.add('Tab'); else if (padPrev[3]) input.keys.delete('Tab');
    for (const [i, code] of Object.entries(map)) if (edge(+i)) input.edge.add(code);
    const dpad = { 12: 'follow', 14: 'hold', 15: 'attack', 13: 'retreat' };
    for (const [i, id] of Object.entries(dpad)) if (edge(+i)) input.quickCmd = id;
    if (edge(10)) padRun = !padRun;
    if (!input.touchMoving) input.runHeld = padRun && Math.hypot(padAxis.x, padAxis.y) > 0.2;
    if (!input.runHeld && Math.hypot(padAxis.x, padAxis.y) < 0.2) padRun = false;
    if (edge(8)) toggleBigMap();   // 922：キーの M と同じ道（信長の軍配・mapOpen もそろう）
  }
  gp.buttons.forEach((bt, i) => { padPrev[i] = bt.pressed; });
}
window.addEventListener('gamepadconnected', () => notice('手持ち操作器をつなぎました'));

// ---------------- 一時停止 ----------------
function resumePlay() {
  const b = game.battle;
  if (b && game.battleFault === b) {
    game.battleFault = null;
    if (!recoverBattle(b)) {
      // 写しをまだ作れていない開戦直後だけ、既存の出陣処理で立て直す。
      game.G = JSON.parse(game.snapshot || 'null') || game.G;
      game.startBattle(b.index);
      return;
    }
    game.lastError = null;
  }
  game.starting = false;
  // 再開はマウスの捕捉を待たない。次に戦場を押した時に捕捉できる。
  if (!locked) game.noLock = true;
  setPause(false);
}
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
      title: game.starting ? `${b.def.title || BATTLES[b.index].name}　押して開始` : '一時停止',
      objectives: b.objectives, merit: b.tracker.total(), time: b.t, lines: b.tracker.lines(), difficulty: b.D.name,
      resume: resumePlay,
      help: () => { toggleHelp(); },
      onSettings,
      // 城攻めの型を使う筋書きの戦（稲葉山など）は地図の城攻めではないので、地図の写し（mapSnap）が無い時は戦の前の写しに戻す
      // 城下を歩いている時：やり直しは町に入り直し、タイトルへは保存してから
      retry: b.def.town ? () => game.startTown() : () => { const fromMap = b.def.mapCastle && b.def.mapInfo && game.mapSnap; game.G = JSON.parse(game.snapshot) || game.G; if (fromMap) game.startMapBattle(b.def.mapInfo, true); else game.startBattle(b.index); },
      title2: b.def.town ? () => { save(game.G); game.title(); } : () => { const snap = (b.def.mapCastle && game.mapSnap) || game.snapshot; const G0 = snap ? JSON.parse(snap) : null; if (G0) { game.G = G0; save(game.G); } game.title(); },
    });
    silence();
    // メニューの外側をクリックしても再開できる
    el.onclick = (e) => { if (e.target === el) resumePlay(); };
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
    '信長は敦盛を舞い、わずかな供と清洲の館を出た。',
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
  '敵の頭上に「！」が出たら攻撃の合図。その直前に右押しで構えると受け流しになります。',
  '敵足軽を倒すだけでは戦功に上限があります。任務・救援・側面攻撃のほうが大きな手柄です。',
  '士気が尽きた部隊は崩れて逃げ出します。横や後ろから突くと士気が大きく下がります。',
  `${K('lock')}で敵を狙い定めると、乱戦でも相手を見失いません。`,
  '深追いは「勝手な追撃」として減点されます。上官の言う線を越えないように。',
  '合印は組の旗印です。戦場で自分の後ろに並ぶ旗が、出世の証になります。',
  '森部の戦い（1561年）では、斎藤方の日比野下野守・長井甲斐守らが討ち取られました。',
  '墨俣の「一夜城」は伝承の色が濃い話です。この試作では「墨俣の砦普請」として扱っています。',
  '突く時は、敵へ向いて一度押すだけ。間合いを保ちましょう。',
  '生き残った部下は古参になり、次の戦で強くなります。城下の「組」で名簿を見られます。',
  '敵の武将が近くにいると、画面下に名前と体力が出ます。',
  '敵も正面からの突きを構えて防ぎます。少し横へ回り、隙を突きましょう。',
  '「組の稽古」で部下全員の練度を上げられます（城下ごとに一度）。',
  '部隊長（侍）を討つと、その部隊は混乱し、士気も大きく下がります。',
  '散開した組は矢に当たりにくく、縦陣は移動が速くなります。',
  '設定で釦割り当て・字と札の大きさ・色覚に配慮した配色を変えられます。',
  ...ADDITIONAL_TIPS,
];

// この戦の心得（物語の幕間に添える）
// 心得は一行で。キーの字は書かず、割り当てが変わっても困らない言い方に（長押しの物は EK() で出す）
TIPS_BATTLE_BY.okehazama = ['列を離れず合図を待て。首は取らず、本陣の旗本は味方と囲んで崩せ', '五人を指示地点に揃え、法螺貝を待ってから横腹を突け', '柵の内から槍で突け。二の手では南の門から出て荷駄を迎えよ'];
const EK = () => (isTouch ? '「取る」の長押し' : `${K('use')} の長押し`);

// ---------------- 織田家編：物語の札と心得（戦の id で引く。戦を足したら、ここにも一つ足す） ----------------
// 年・場所と約百六十字の要点を先に見せ、背景と心得は畳む。持ち場は遊びの復元を含む。
STORY_BY.oda = {
  inou: () => ({ battleId: 'inou', compact: true, boss: '組頭 源八', year: "弘治二年（1556）八月二十四日　尾張・稲生", title: "稲生", text: [
    "父の信秀が亡くなり、尾張の織田家は割れた。家老の柴田勝家と林兄弟は、信長の弟の信勝を立てて背いた。あなたは信長の旗本の足軽。於多井川を渡った稲生の野で、組頭の源八の下に立つ。東から来る柴田勢の寄せを、信長の旗のそばで受け止めよ。次に南から来る林美作守の隊を崩す。信長の旗へ戻れば任務達成。",
    "『信長公記』は、信長方七百足らず、柴田勢千・林勢七百と記す。信長の大声で柴田の兵が逃げ、美作守は信長が自ら討った。兵の配置と寄せ口、名塚の砦の形は遊びの補い。",
  ], button: "稲生の野へ進む" }),
  okehazama: () => ({ battleId: 'okehazama', compact: true, boss: '織田方の上役', year: "永禄三年（1560）五月十九日　尾張・桶狭間", title: "桶狭間", text: [
    "信長は敦盛を舞い、わずかな供と清洲の館を出た。あなたは織田の槍の足軽。中島砦から進んだ谷の出口で、組頭の下知を聞く。空が晴れ、合図が出たら味方の旗に続け。道の守りを崩し、本陣の幕の口へ寄せる。義元の旗本を味方と崩せ。討取りの後、組と谷を抜ければ任務達成。首取りに足を止めるな。",
    "昼までに丸根・鷲津を落とした今川は優勢だった。義元のねらいは国境の城を助けることだったと見る説がある。『信長公記』に背後への迂回は記されない。雨は信長勢の接近後に降り、攻めたのは空が晴れてから。主人公の持ち場と組の働きは、遊びのための補い。",
  ], button: "組の持ち場へ進む" }),
  moribe: () => ({ battleId: 'moribe', compact: true, boss: '織田方の上役', year: "永禄四年（1561）五月　美濃・森部", title: "森部", text: [
    "織田信長が美濃へ進み、斎藤龍興の兵と森部でぶつかる。あなたは五人の槍組を率いる。雨の楡俣川を腿までつかって渡り、向こう岸の畦で組をそろえよ。法螺貝が鳴ったら前備に続いて斎藤の先手を押し、長い槍の押し合いを支える。長井・日比野の旗本へ攻め入り、退く敵を見届けて組を集めれば勝ち。",
    "信長公記は雨中の楡俣川渡河と長い槍戦、長井・日比野らの討死を伝える。細かな布陣や浅瀬は遊びの補い。",
  ], button: "森部へ出陣する" }),
  sunomata: () => ({ battleId: 'sunomata', compact: true, year: "永禄九年（1566）九月の伝承　美濃・墨俣", title: "墨俣築城防衛", text: [
    "織田方が川を背に砦を築き、斎藤方が北と西から寄せる。あなたは普請を守る組の指揮役。柵を直し、材木を南門へ運び、川からの上陸にも備える。夕暮れの最後の寄せまで持ちこたえ、砦を完成させれば勝ち。一夜城の伝承を使った戦。",
    "信長公記にあるのは永禄四年（1561）の洲股の要害修築と在陣。永禄九年の藤吉郎による一夜城は伝承として分ける。三度の寄せと舟の上陸、昼から夕への時刻と空模様は遊びの補い。兵数は史料では確かめられない。陣図の味方千五百・敵四千は、人足と砦外の控えを含む仮の総勢。この場に見える人数とは別の目安。",
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
  echizen: () => ({ battleId: 'echizen', compact: true, year: "天正三年（1575）八月　越前・木の芽峠", title: "越前・木の芽峠", text: [
    "峠口の先手と本道を登る。観音丸の木戸を破り、味方と中を押さえる。次は木の芽峠城の主郭へ。上からの矢玉は構えで防げない。竹束や塀の陰へ寄れ。",
    "朝倉滅亡後、越前では一揆勢が支配を広げた。信長の侵攻時、明智・羽柴の手は海側を攻めた。この戦は、峠口の先手が正面から攻めた場合の補い。詳しい史実は戦後の札で読める。",
  ], button: "木の芽峠へ進む" }),
  echizen_ikko: () => ({ battleId: 'echizen_ikko', compact: true, boss: '滝川一益', year: "天正三年（1575）八月　越前・大滝寺", title: "越前・大滝寺の夜討ち", text: [
    "織田勢が越前へ進み、山の大滝寺の守りを攻める。あなたは滝川一益の先手。麓から惣門、石段、山門を越えて本堂へ進む。堂が燃えて守りが山上へ退いたら、奥の院を押さえる。手向かわぬ者を討たず、奥山道を九十秒守りきれば勝ち。",
    "大滝寺は白山信仰の寺で、本願寺の寺とは断定しない。滝川一益が堂塔を焼いたとの伝承を土台にした戦。大徳山の麓から山上へ向かう道は距離を縮めてある。夜討ち・霧・谷川や門の配置・局地の兵数は遊びの補い。府中龍門寺の夜襲とは別の場所。",
  ], button: "大滝寺の麓へ進む" }),
  iwamura: () => ({ battleId: 'iwamura', compact: true, year: "天正三年（1575）十一月　美濃・岩村城と水晶山", title: "岩村城・水晶山", text: [
    "岩村城は遠山氏の山城。三年前、信長の叔母おつやの方は、命を助ける約束で武田方の秋山虎繁に城を渡し、虎繁と夫婦になった。",
    "織田信忠が、武田の秋山虎繁が守る岩村城を囲む。あなたは河尻秀隆の手で水晶山の陣を守る兵。柵の持ち場に篝火を焚き、夜討ちに備える。山道から来る武田勢を槍で受け止め、退く敵を味方と城の麓まで追う。本陣へ入り込まれ、持ち場を崩されれば失敗。麓で組と合流し、追い討ちを止めれば任務を終える。",
    "十一月十日の水晶山への夜討ちと、城方が合流を試みた出撃を描く。夜討ち勢の所属、篝火の持ち場、人数、道と霧は復元。信忠の城への追撃、後日の開城と処刑は戦後の史実で読む。",
  ], button: "水晶山の柵につく" }),
  tennoji: () => ({ battleId: 'tennoji', compact: true, year: "天正四年（1576）五月七日　摂津・天王寺砦", title: "天王寺", text: [
    "本願寺勢が明智光秀の天王寺砦を囲み、織田信長が少ない兵で救援に向かう。あなたは明智勢の砦守備兵。まず囲みを耐え、南から来る味方の三段の攻めに合わせて打って出る。砦で合流した後は北へ押し返し、本願寺の城戸口への道を開けば勝ち。",
    "信長公記の救援と、砦に入った後の再攻撃を土台にした戦。信長は先手に交じり、足に鉄砲傷を負っても指揮を続けた。その史実を表す足の傷と、戦で受ける傷は別。深手で戦えなくなれば攻めは崩れる。砦の縄張りと攻防の時間は推定。",
  ], button: "天王寺砦を守る" }),
  saika: () => ({ battleId: 'saika', compact: true, year: "天正五年（1577）二月　紀伊・小雑賀川", title: "雑賀攻め・小雑賀川", text: [
    "織田信長は和泉で軍を山手と浜手に分けた。根来寺の杉之坊と、雑賀のうち味方についた三緘衆を案内に、山手勢が紀伊へ進む。あなたは堀秀政の先手。小雑賀川を渡るが、高い西岸の鉄砲に阻まれて引き返す。味方の援護で東岸へ戻り、用意された竹束の後ろで持ち場を固める。川上と川下の寄せを払い、東岸の陣を保てば勝ち。",
    "信長公記の渡河、引き退き、川を挟んだ対陣を採る。杭や竹束、細かな回り込みは遊びの補い。渡河記事に兵数の記載はなく、表示は目の前の川岸に描く兵の目安。渡河の日・時刻・天気も不明で、昼の明るさと湿った岸、地形の寸法や東西の向きは復元。",
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
  inou: '信長の旗を離れず、槍をそろえて柴田の寄せを受けよ。南から林の手が来たら向き直れ。追わずに旗へ戻る',
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
const LORD_TIP = () => (matchMedia('(pointer: coarse)').matches ? '左上の「地図」で軍配の図（味方の全部の隊を動かす）、「使番」で近くの備へ下知' : `${K('map')} で軍配の図（味方の全部の隊を動かす）・じぇーで使番・${K('command')} で旗本へ号令`);

let curG = null;
const game = {
  // 遊ぶ保存が替わるたびに、その保存の筋書き（戦の並び）へ切り替える
  get G() { return curG; },
  set G(v) { curG = v; if (v) { usePre(v); setScenario(v.scenario || 'okehazama'); } },
  // 軍議（gungi.js）から呼ぶ：一時停止の札を開く・攻め始めの釦でマウスを捕まえる
  openPause: () => setPause(true), requestLock: () => requestLock(true), gungiOn: false,
  // やり直しの札から戻った時は、止めた時を必ず動かす（マウスを捕まえ直せなくても止まったままにしない。kaito 10/23 稲生 13・25）
  resumeBattleRetry: () => { input.clear(); silence(); clearEdgeDark(); game.starting = false; setPause(false); },
  hud: new Hud(), camera, battle: null, paused: false, helpOpen: false, lastResult: null, snapshot: null, noLock: false, hitstop: 0, starting: false, bg: null,

  // ゲームパッドの振動
  vibrate(strength, ms) {
    if (!S.vibrate || !this.pad || !this.pad.vibrationActuator) return;
    try { this.pad.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }); } catch (e) { /* 非対応 */ }
  },

  // 題の 3D（木 260・草 3200・兵 28）は戦と城下の間は手放す。iPhone は WebContent の 2GB の壁があるので持ち越さない（題へ戻れば作り直す）
  freeTitle() {
    const bg = this.titleBg;
    if (!bg) return;
    this.titleBg = null;
    if (this.bg === bg) this.bg = null;
    try { bg.dispose && bg.dispose(); } catch (e) { /* 手放せなくてもよい */ }
    this.battleReleasePending = true;   // 題からすぐ続ける時も、前の形の回収を待ってから町や戦を組む。
  },

  title(pick = '') {
    this.lastError = null; this.battleFault = null;
    this.trialReturn = '';
    // 題の画面では戦・人物の素材を読み始めない。
    closeJapan();
    this.stopBattle();
    this.inTown = false;
    townMusic(false);
    playMusic('title');
    // 題の 3D は一度だけ作って使い回す（戻るたびに木・草・兵を作り直さない。890）
    const saved = readProgress(S.slot).game;
    const firstVisit = [0, 1, 2].every(slot => { const r = readProgress(slot); return !r.game && !r.bad; });
    this.bg = firstVisit ? null : this.titleBg || (this.titleBg = titleScene());
    usePre(saved);
    if (saved) setScenario(saved.scenario || 'okehazama');
    titleScreen(saved,
      (name, diff, scn) => { initAudio(); this.G = newGame(name, diff, scn); save(this.G); this.bg = null; this.story(0); },
      () => { initAudio(); this.G = saved; this.bg = null; this.resume(); },
      () => settingsScreen(onSettings, () => this.title()),
      async (G) => { initAudio(); G.slot = S.slot; this.G = G; setScenario(G.scenario); this.bg = null; const ok = await this.resume(); if (ok === false) return false; save(G); notice(progressStored(G) ? '保存文字列を確かめて再開し、端末へ保存しました' : '！ 再開しましたが、端末へ保存できませんでした。保存文字列を控えてください'); return true; },
      (i, del) => { if (del) { notice(deleteProgress(i) ? 'この枠の記録を消しました' : '！ 記録を消せませんでした。端末の保存の設定を確かめ、もう一度お試しください'); } S.slot = i; saveSettings(); this.title(); },
      (i) => {
        // 章を選んで遊ぶ（記録は残さない）
        initAudio();
        const G = JSON.parse(JSON.stringify(saved));
        G.practice = true; G.injured = false;
        // 前からの織田家編の保存で、新しい尾張統一戦（稲生）を遊ぶ：記録は残さず、この時だけ並びに入れる
        if (i === 'pre') { G.owari = 1; this.G = G; this.bg = null; this.story(0); return; }
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
    // 初陣は題の旗を一度押すだけ。名と開戦の確認を挟まない。
    // 初陣の背景は支度中に読める。組の支度が要らなければ、そのまま戦へ。
    // 稲生は札の説明の画面を出さず、すぐ戦へ（kaito 10/23 稲生 15）。
    if (BATTLES[i]?.id === 'inou' || BATTLES[i]?.id === 'okehazama' || !this.G.lord && !RANKS[this.G.rank].squad) return this.startBattle(i);
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
    if (memReloadGate(this, 'startBattle', [i])) return;
    this.lastStart = { fn: 'startBattle', args: [i] };
    this.lastError = null; this.battleFault = null;
    markInBattle(true);   // 戦の途中で頁が読み直されたら、次から記憶の少ない作りに（device_tier.js）
    try { localStorage.setItem('risshin-lastbattle', BATTLES[i]?.id || String(i)); localStorage.setItem('risshin-lastbattle-at', String(Date.now())); } catch (e) { /* 保存できなければ記さない */ }
    if (isLocked(i)) return showPaywall(() => this.startBattle(i), () => this.base());
    const firstBattle = BATTLES[i]?.id === 'inou' && !this.G.practice && !this.G.lord && !this.G.history?.some(Boolean);
    $('loading').classList.toggle('first-battle', firstBattle);
    this.bg = null;
    this.freeTitle();
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
      ? `${BATTLES[0].name.replace(/の戦い$/, '')}へ出陣します。<br>味方の旗について進もう。操作は一つずつ案内します。`
      : `${BATTLES[i] && BATTLES[i].year ? `<b style="font-size:1.15em;letter-spacing:.08em">${BATTLES[i].year.replace(/（\d+）/, '')}　${BATTLES[i].place || ''}</b><br>` : ''}この戦の心得：${LB ? LB.tip : tipOf(i)}<br><span style="opacity:.7">${VIEW_TIP()}</span><br><span style="opacity:.7">${LB ? LORD_TIP() : TIPS[Math.floor(Math.random() * TIPS.length)]}</span>`;
    $('loading').hidden = false;
    hideScreen();
    this.stopBattle();
    // マウスは出陣の釦で捕まえる。支度や下知の札では放しておく。
    // 読み込みの段（888）：何をしているかを札の下に一行出し、段ごとの時間を覚える（window.__loadTimes。確かめ係が端末で読む）
    const previousProfile = window.__loadTimes?.profile;
    const LT = window.__loadTimes = { battle: BATTLES[i] && BATTLES[i].id, quality: S.quality, beganAt: new Date().toISOString(), beganMs: performance.now(), stages: {} };
    const t0 = performance.now();
    const my = this.startSeq = (this.startSeq || 0) + 1;
    // マウスを捕まえられない遊び手も、描く時は支度を省かない。
    const tool = isNorender() || /[?&]bot/.test(location.search);
    const keys = ['defs', 'assets', 'build', 'warm', 'compile', 'first'].filter((k) => (k !== 'defs' || !battleDefinition(i) || !BM) && (tool || isNorender() ? k === 'build' || k === 'first' || k === 'defs' : true));
    ldBegin(keys, BATTLES[i].id);
    const readingStory = LB ? { year: LB.year, title: LB.name, text: LB.goal ? [...LB.text, `任務：${LB.goal}`] : LB.text } : storyOf(i)(this.G);
    const reader = this.loadingReader = loadingStory(BATTLES[i], readingStory, LB ? LB.tip : tipOf(i), this.G, firstBattle);
    stage('戦の支度を読み込んでいます', keys[0]);
    // 開戦の確かめは、この戻り値を待ってから判定する。読み込み中に次の戦を予約すると、前の支度は取り消される。
    return new Promise((resolve) => setTimeout(() => guarded(async () => {
      if (my !== this.startSeq) return;
      // 前の戦を解放した後は、空のコマを挟んで自動回収へ時間を渡す。
      if (this.battleReleasePending) {
        const until = performance.now() + (MEM_TIGHT ? 1500 : 250);
        while (performance.now() < until) {
          await preparationFrame();
          if (my !== this.startSeq) return;
        }
        this.battleReleasePending = false;
      }
      // 戦の定義と仕組みをここで初めて読み、次の戦では使い回す
      if (!battleDefinition(i) || !BM) {
        const tb = performance.now();
        if (!(await readyBattleCode(() => this.startBattle(i), false, BATTLES[i].id))) return;
        LT.defs = Math.round(performance.now() - tb);
        if (my !== this.startSeq) return;
      }
      if (!(await prepareBattleAssets(BATTLES[i].id, () => my === this.startSeq))) return;
      // 稲生と森部は専用の定義で支度済み。全戦用の読み口はほかの戦だけで使う。
      if (BATTLES[i].id !== 'moribe' && BATTLES[i].id !== 'inou') {
        await BTm.loadBattleDefinition(BATTLES[i].id);
        if (my !== this.startSeq) return;
        if (!(await prepareBattleAssets(BATTLES[i].id, () => my === this.startSeq))) return;
      }
      // 携帯も素材の完了まで支度の札で待ち、戦中の差し替えを避ける。
      if (!tool && !isNorender()) {
        stage('人とよろいと武器を読み込んでいます', 'assets');
        const tw = performance.now();
        // 素材ごとの完了時間も同じ読み込みの記録へ残す。
        LT.assetsDetail = {};
        const timed = (key, load) => {
          const began = performance.now();
          return Promise.resolve().then(load).then((value) => {
            const failed = key === '人' ? HUMd.failed : key === '具足' ? DOMd.failed : key === '城' ? cgtOn() && !value : value === false;
            if (failed) throw new Error(key === '人' ? HUMd.err : key === '具足' ? DOMd.err : `${key}を読めませんでした`);
            LT.assetsDetail[key] = { ms: Math.round(performance.now() - began), ok: true }; }).catch((error) => { LT.assetsDetail[key] = { ms: Math.round(performance.now() - began), ok: false, reason: String(error?.message || error) }; if (my === this.startSeq && !LT.assetNoticed) { LT.assetNoticed = true; console.warn('素材の一部を読めず、軽い形で続けます', key, error); /* 遊ぶ人には知らせない（kaito 10/22） */ } });
        };
        // 展開中の文字列・画像・形を重ねない。一種類ずつ終え、画面へ戻してから次を読む。
        for (const [key, name, load] of [['人', 'mhbody', loadHumans], ['具足', 'domaru', loadDomaru], ['武器', 'weapons', loadWeapons], ['城', 'cgt', loadCgt], ['兜', 'kabuto', loadKabuto], ['弓', 'yumi', loadYumi], ['馬', 'horse', loadHorse], ['道具', 'props_ext', loadPropsExt], ['建物', 'bldg', loadBldg], ['模様', 'tex_people', loadPeopleDetail], ['声', 'voice', loadWarSpeech]]) {
          // 初陣は人・具足・武器だけ。城や模様などは必要な戦で読む。
          if (firstBattle && !['mhbody', 'domaru', 'weapons', 'kabuto'].includes(name)) continue;
          if (!assetsForBattle(BATTLES[i].id).includes(name)) continue;
          if (my !== this.startSeq) return;
          await timed(key, load);
          await preparationFrame();
        }
        LT.assets = Math.round(performance.now() - tw);
        if (my !== this.startSeq) return;
      }
      stage('地形と兵をそろえています', 'build');
      if (!isNorender()) await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));   // 字を描いてから組み立てる
      if (my !== this.startSeq) return;
      const tB = performance.now();
      // 組み立てた戦は、絵の下ごしらえ（シェーダ）が済むまで描く輪に渡さない（描く輪が一度に全部を作って固まらないように）
      const b = new BM.Battle(this, i, this.G.lord ? lordDef(battleDefinition(i), BATTLES[i].id) : battleDefinition(i));
      LT.build = LT.buildOnly = Math.round(performance.now() - tB);
      applyLord(b);
      b.startAutomatic = tool;
      b.firstBattle = firstBattle;
      // 馬の読み込みは支度中に済ませる。開戦六秒後に形・動き・絵の仕組みをまとめて作らない。
      b.horseLoadPending = !tool && !isNorender();
      // 見渡しは今は停止中。出陣後へ映画の引き・見せ場を残さず、本人の視点で支度する。
      b.player.introT = 0; b.player.camShot = null; b.player.cine = null; b.player.shotZoom = 0;
      b.player.updateCamera(1, camera);
      // 戦が始まってすぐ近くに来るはずの人を、幕の内で先に本物の人へ（humans.js の updateHumans を少し進める）。
      // ここをしないと、開戦直後に次々と人の形が変わるたびシェーダーを初めて作ることになり、一コマが0.5秒も固まって
      // 「重くてスロー・画面が黒くチカチカ」に見えていた（dynRes が跳ねてキャンバスの大きさが上下する。kaito 10/1）
      // 携帯も姿の種類ごとに作り置きし、戦中に新しい材質を作る山を減らす。
      if (!tool && !isNorender()) {
        stage('近くの兵の姿を整えています', 'warm');
        await preparationFrame();
        const tH = performance.now(), cap = 400;
        const warmCurrent = () => my === this.startSeq && performance.now() - tH < 30000;
        if (!firstBattle) await primeHorses(b, warmCurrent);
        if (my !== this.startSeq) { b.dispose(); return; }
        b.horseLoadPending = firstBattle;
        // 携帯は顔の支度と同じ24人まで。残りは開戦後の小分け作成へ回す。
        // 戦中は updateHumans が制限を外すので、兵の人数・密度・画質は変えない。
        b.humanPreparationCap = firstBattle ? 4 : MEM_TIGHT ? 16 : 24;
        // 前の戦の人を片付け、初戦の primed 待ちを支度の中で解く。
        updateHumans(b, 0);
        if (HUMd.ready) await primeHumans(b, renderer, camera, b.humanPreparationCap, 1, warmCurrent).catch((error) => { LT.humanPrimeError = String(error?.message || error); });
        // この戦で出る兵（後から出る援軍・武将も）の顔を、支度の間に全部作る。戦の中では作らずに使い回す（10/24）
        if (!window.__nofw && HUMd.ready && warmCurrent()) { const tF = performance.now(); LT.faces = await warmBattleFaces(b, warmCurrent).catch(() => -1); LT.facesMs = Math.round(performance.now() - tF); }
        if (my !== this.startSeq) { b.dispose(); return; }
        const tNear = performance.now();
        // 携帯でも心得を読んだり支度を取り消したりできるよう、一人ごとに画面へ戻す。
        for (let n = 0; n < 200 && performance.now() - tNear < cap; n++) {
          if (my !== this.startSeq) { b.dispose(); return; }
          updateHumans(b, 0);
          await preparationFrame();
        }
        // 指の端末：近くの兵の形だけは前もって作る（開戦後の一人ずつの形づくりを軽く。材質は作らないので固まらない）
        if (!firstBattle && HUMd.ready && warmCurrent()) await prefetchHumanShapes(b, camera, 700, warmCurrent);
        // まだ見えない兵の顔は、近づいた時に作る。全員分を開戦前に描かない。
        HUMd.primed = true;
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
          b.army.prepareDrawMaterials();
          b.army.prepareRangedFx();
          renderer.initTexture(b.army.flashTex);
          renderer.initTexture(b.army.smokeTex);
          if (b.army._rain) renderer.initTexture(b.army._rain.dots.material.map);
          if (firstBattle) {
            // 初めに使う戦場の描き方だけ。傷・倒れ・遠い姿の総当たりを待たない。
            singlePassLow(b.scene);
            if (renderer.compileAsync) await renderer.compileAsync(b.scene, camera);
            else renderer.compile(b.scene, camera);
          } else {
            const { prepareBattlePrograms } = await import('./battle_programs.js');
            // 時間切れで戦中へ残さない。姿をまとめて組み立て、完了を一度だけ待つ。
            const current = () => my === this.startSeq;
            LT.programs = await prepareBattlePrograms(renderer, b, camera, current, {
              offscreen: useFinish(),
              uploadTextures: async (scene, materials) => {
                singlePassLow(scene);
                return paceTextureUploads(scene, current, materials);
              },
            });
          }
        }
      } catch (e) {
        // 絵の支度に失敗しても戦を始める。止まった同じ支度をもう一度待たない。
        b.humanPrimeError = LT.compileError = String(e?.message || e);
      }

      LT.compile = Math.round(performance.now() - t1);
      if (my !== this.startSeq) { b.dispose(); return; }
      // 読む札を開いている間も、戦の時刻と兵は止めたまま。
      this.paused = true;
      // 最初の一枚を描いてから表示（カメラが原点を向いた画面を見せない）。norender では描かない
      // 仕上げ（composer・影・にじみ等）を通して描く：その場のシェーダ作りを、札を見せている間に済ませてしまう
      // （前は renderer.render だけだったので、初めの実物のコマで仕上げの下ごしらえが起き、数百msのコマ落ちになっていた）
      stage('絵を画面へ送っています', 'first');
      // 絵（texture）は最初の一枚で一度に送らず、数コマに分けて先に送る。iPhone（WebKit）は一コマに 130MB を送ると
      // WebContent の作業用の写しが一度に積み上がり、2GB の壁を越えて落ちていた（10/19 実機で確かめ）
      // 分割転送の待ちで通常の描画が割り込むと、残りの絵を一括転送してしまう。
      // 転送と画像の片付けが済んでから、戦場を描く輪へ渡す。
      if (!tool && !isNorender()) { LT.texPace = await paceTextureUploads(b.scene, () => my === this.startSeq); if (my !== this.startSeq) { b.dispose(); return; } }
      this.battle = b;
      this.hud.show(true);
      stage('最初の画面を描いています');
      // 解像度を戻すのは描く前（描いた後にキャンバスの大きさを変えると、その一枚が消えて黒いコマになる）
      
      const t2 = performance.now();
      if (!isNorender()) draw(this.battle.scene);
      LT.first = LT.renderOnly = Math.round(performance.now() - t2);
      LT.profile = { 読み込み: (LT.defs || 0) + (LT.assets || 0), 組立て: LT.buildOnly, 人の支度: LT.humansWarm || 0, 絵の支度: LT.compile, 描画: LT.renderOnly };
      if (previousProfile) { LT.previousProfile = previousProfile; LT.change = {}; for (const key of Object.keys(LT.profile)) LT.change[key] = LT.profile[key] - (previousProfile[key] || 0); }
      LT.total = Math.round(performance.now() - t0);
      // 開戦後に送られる絵（馬・具足）も、10 秒・40 秒後にもう一度手放す
      for (const ms of [10000, 40000]) b.defer(ms, () => {
        if (my !== this.startSeq || this.battle !== b) return;
        freeUploadedImages(b.scene, () => my === this.startSeq && this.battle === b).catch(() => { /* 手放せなくてもよい */ });
      });
      // 図鑑は地図の部品も読むので、戦ができる前の読み込みに重ねない。
      // 図鑑は開いた時に読む。戦場では地図の部品を先読みしない。
      b.startTiming = { loadingMs: LT.total, readingMs: 0, deploymentMs: 0, introMs: 0, ready: false };
      LT.startTiming = b.startTiming;
      console.info('読み込みの時間（千分の一歩秒）', JSON.stringify(LT));
      if (!tool && !isNorender()) ldLearn({ defs: LT.defs, assets: LT.assets, build: LT.buildOnly, warm: LT.humansWarm, compile: LT.compile, first: LT.first });
      stage('戦の支度ができました');
      if ($('ld-steps')) for (const step of $('ld-steps').children) step.className = 'done';
      clearInterval(ldIv); ldIv = 0;
      $('loading').style.setProperty('--ld-progress', '100%');
      { const bar = document.querySelector('#loading .ldbar i'); if (bar) { bar.style.transition = 'transform .3s linear'; bar.style.transform = 'scaleX(1)'; } await new Promise((r) => setTimeout(r, 350)); }   // 残りを急に消さず、満ちてから閉じる（kaito 10/23 稲生 37）
      const readingBegan = performance.now();
      await reader.wait();
      b.startTiming.readingMs = Math.round(performance.now() - readingBegan);
      reader.dispose();
      if (this.loadingReader === reader) this.loadingReader = null;
      if (my !== this.startSeq) return;
      hideLoading();
      const def = battleDefinition(i);
      // 開戦の大見出しは、始めの一時停止を解いた瞬間に出す
      this.pendingIntro = () => {
        // 支度を待たずに進める試走へ、開戦前の札を遅れて重ねない。
        // 通常の出陣は零秒のままなので、読む時間と開戦の停止を保つ。
        if (this.battle !== b || b.t > 0 || b.over || b.ended) return;
        if (def.sides) this.hud.intro(def.sides, BATTLES[i].name, def.date(b).split('　')[0]);
        else this.hud.banner(BATTLES[i].name, BATTLES[i].year);
        sfx('horagai', 0.6);
      };
      sfx('taiko', 0.8);
      // 馬の形は動けるようになってから、既存の小分け更新に任せる。
      if (firstBattle) b.defer(12000, () => { if (this.battle === b && my === this.startSeq) b.horseLoadPending = false; });
      // 砦の戦（def.gungi のある戦）だけ、開戦の前に軍議の画面を一度だけ挟む（ほかの戦・画面の流れは変えない）
      // 全軍の攻め口と布陣は総大将が決める。足軽大将も預かった一手の下知に従う。
      const canGungi = !!this.G.lord;
      if (gungiAvailable(def) && canGungi && !this.battle._gungiDone) { this.battle._gungiDone = true; openGungi(this, this.battle, beginPlay); } else beginPlay();
      window.__startFrames = [];
      return b;
    }, () => this.startBattle(i))().then(resolve), 60));
  },

  releaseBattleFrame(b) {
    if (this.battle !== b) return;
    cancelAnimationFrame(loopFrame);
    this.battle = null;
    loopBattle = null;
    if (disposeFinish()) this.battleReleasePending = true;
    loopFrame = requestAnimationFrame(loop);
  },

  stopBattle() {
    const endedKey = this.battle?.def.key;
    const hadBattle = !!this.battle;
    cancelAssetReads((name) => name.startsWith('dem_') || name === 'voice');
    releaseWarSpeech();
    this.startSeq = (this.startSeq || 0) + 1;
    this.loadingReader?.dispose(); this.loadingReader = null;
    clearTimeout(this.horseTimer); this.horseTimer = 0;
    if (this.deployment) { this.deployment.dispose(); this.deployment = null; }
    document.querySelectorAll('.rojo-screen').forEach((e) => (e.__close ? e.__close() : e.remove()));   // 籠城の日送りの札（鳥取城）を次の戦へ持ち越さない
    closeGungi();   // 軍議の途中で題へ戻る・やり直す時、軍議の札とカメラを閉じる（残ると題の画面を覆う）
    this.townShop = false;
    this.hud.root.classList.remove('town');
    if (this.battle) {
      this.memDirty = true;   // 重い場面を一度組んだ印（iPhone は次の重い場面の前に読み込み直す。memReloadGate）
      const scene = this.battle.scene;
      this.battle.dispose(); this.battle = null;
      this.battleReleasePending = true;
      if (renderPass?.scene === scene) renderPass.scene = null;
      this.hud.reset();
      this.pendingIntro = null;
      loopBattle = null;
      if (performance.memory) {
        (window.__loadTimes ||= {}).afterDispose = {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
        };
      }
    }
    releaseBattleAssets();
    if (disposeFinish()) this.battleReleasePending = true;
    this.renderer.renderLists.dispose();
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
    if (!hadBattle) return;
    const memory = this.renderer.info.memory;
    const rows = (this.teardownMemory ||= []);
    rows.push({ battle: endedKey, geometries: memory.geometries, textures: memory.textures,
      programs: this.renderer.info.programs?.length ?? 0,
      heap: performance.memory?.usedJSHeapSize ?? null });
    if (rows.length > 3) rows.shift();
  },

  endBattle(b) {
    if (!b.def.mapCastle) rememberWounds(this.G, b.player.u, b.def);
    const zk = ZKm ? ZKm.zukanRecord(b, this.G) : null;   // 図鑑：会った武将と実績を記す（戦の始めに読み込んである）
    if (b.def.mapCastle) { this.endMapBattle(b); return; }
    const G = this.G;
    const i = b.index;
    if (b.def.dojo) {
      const k = b.flags.kills || 0, w = b.flags.wave || 0, t = b.t;
      this.stopBattle(); b = null;
      const st = this.dojoStep;
      dojoResult(k, w, t, () => this.startDojo(st), () => this.title(), st, st != null ? () => this.ladder() : null);
      return;
    }
    const lh = b.player.lastHit;
    const cause = b.player.downCause(15);
    const ahead = lh && b.t - lh.t < 15 && lh.allyLeadDistance >= 6
      ? `馬で味方の列より約${Math.round(lh.allyLeadDistance)}歩先へ出ていた。列へ戻り、肩を並べて進もう。` : '';
    const downInfo = b.result?.down ? {
      wound: b.result.dead ? '討たれた。命を落とした' : '討たれた。深手で戦を続けられない',
      attack: lh && b.t - lh.t < 15 ? `${lh.name || { ashigaru: '敵の足軽', samurai: '敵の侍', busho: '敵の武将', bow: '敵の弓兵', gun: '敵の鉄砲兵', cavalry: '敵の騎馬兵' }[lh.type] || '敵'}に${lh.ranged ? lh.kind === 'arrow' ? '矢を射込まれた' : lh.kind === 'gun' ? '鉄砲で撃たれた' : '矢玉を受けた' : lh.mounted ? '馬上から突かれた' : lh.back ? '背後から突かれた' : lh.side ? '横から突かれた' : '正面から打ち負けた'}` : '最後の攻撃は分からない',
      detail: cause + ahead,
      tip: lh?.kind === 'fire' ? '燃える場所から離れよう' : lh?.ranged ? '矢玉は構えで防げない。物陰へ退く' : lh?.mounted ? '騎馬は味方の槍の列で受ける' : '構えて打ちに備え、囲まれる前に味方の列へ退く',
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
      const last = { hit: b.player.lastHit ? { ...b.player.lastHit } : null, objectives: b.objectives.map((x) => ({ text: x.text, state: x.state })), time: b.t, stats: { ...b.stats } };
      this.stopBattle(); b = null;
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
    r.outcomeReason = b.result?.outcomeReason;
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
    r.spoilHorse = spoilHorseInfo(G, b.player);
    this.stopBattle();
    G.battle = i + 1;
    G.actions = 2;
    G.talked = {};
    const retry = { label: 'この戦をやり直す', confirm: true, fn: () => { this.G = JSON.parse(this.snapshot); this.story(i); } };
    const actions = [];
    // 分捕った馬は、評価の中の一行で持ち帰り（置いていくも選べる。801）
    // 評価の釦が同じ関数の環境を持っても、前の戦の中身を残さない。
    b = null;
    const show = () => {
      evalScreen(G, r, actions);
      if (sharecard) mountSharecard(sharecard, $('ev-actions').parentElement);
    };
    if (G.practice) {
      const backTo = this.trialReturn;
      actions.push({ label: backTo === 'samurai' ? '戦を選ぶ画面へ戻る' : '題の画面へ', primary: true, fn: () => this.title(backTo) });
      actions.push(retry);
    } else if (i === 0 && (scenarioKey() === 'oda' ? !r.mainDone : G.rank === 0)) {
      // 最初の戦をしくじった時は、もう一度（織田家編は桶狭間では昇進しないので、任務を果たせば城下へ進む）
      // 織田家編は、しくじっても戦功なしで城下へ進める（最初の戦で先へ進めなくならないように）
      if (scenarioKey() === 'oda') actions.push({ label: '次へ（城下へ・戦功なし）', primary: true, fn: () => { save(G); this.base(); } });
      actions.push({ label: `${BATTLES[0].name.replace(/の戦い$/, '')}に再挑戦する`, primary: scenarioKey() !== 'oda', fn: retry.fn });
      actions.push({ label: '題の画面へ', fn: () => this.title() });
    } else if (i === BATTLES.length - 1) {
      save(G);
      actions.push({ label: '後日譚へ', primary: true, fn: () => epilogueScreen(G, () => finalScreen(G, () => this.title(), () => this.japanMap('final'))) });
      actions.push(retry);
    } else {
      save(G);
      // 墨の帯で「清洲へ戻る」と一枚挟んでから城下へ（827）
      const toTown = () => inkBand(`${(BATTLES[G.battle] && BATTLES[G.battle].town) || '城下'}へ戻る`, BATTLES[i].name, () => this.base());
      actions.push({ label: '次へ（城下へ）', primary: true, fn: () => (G.rank >= 1 && !G.aijirushi ? aijirushiScreen(G, () => { save(G); toTown(); }) : toTown()) });
      actions.push(retry);
    }
    // 勝った時は、城下へ戻った後に App Store のレビューの窓を出す候補にする（review_ask.js）
    if (r.mainDone) import('./review_ask.js').then((m) => m.noteWin(G)).catch(() => {});
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
    const afterScene = () => {
      if (r.mainDone && !G.practice && !G.lord && scenarioKey() === 'oda') {
        import('./campaign_map.js').then(({ campaignMap }) => {
          if (this.G !== G || this.battle) return;
          campaignMap(BATTLES[i], showResult, null, { G, victory: true });
        }).catch(() => { if (this.G === G && !this.battle) showResult(); });
      } else showResult();
    };
    if (r.mainDone && BATTLES[i].id === 'inou') {
      // 戦場を片付けてから読む。他の戦へ稲生の札の処理を持ち込まない。
      const seq = this.startSeq;
      import('./inou_after.js').then(({ inouAfterScene }) => {
        if (this.G !== G || this.battle || this.startSeq !== seq) return;
        inouAfterScene(afterScene);
      }).catch(() => { if (this.G === G && !this.battle && this.startSeq === seq) afterScene(); });
    } else afterScene();
  },

  base() {
    import('./review_ask.js').then((m) => m.maybeAskReview()).catch(() => {});
    // 開発用の試しを明示した時だけ補充する。通常の遊びでは昔の保存の印も効かせない。
    if (S.freeMoney === true && this.G) this.G.kan = Math.max(this.G.kan || 0, 99999);
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
    if (memReloadGate(this, 'startTown', [])) return;
    this.lastStart = { fn: 'startTown', args: [] };
    this.bg = null;
    this.freeTitle();
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
      // 戦・中止した町・題の形と、次の町の組み立てを重ねない。
      if (this.battleReleasePending) {
        const until = performance.now() + (MEM_TIGHT ? 1500 : 250);
        while (performance.now() < until) {
          await preparationFrame();
          if (my !== this.startSeq) return false;
        }
        this.battleReleasePending = false;
      }
      if (!BM) { if (!(await readyBattleCode(() => this.startTown(), false, 'town'))) return false; }
      if (my !== this.startSeq) return;
      stage('人とよろいを読み込んでいます', 'assets');
      if (!this.noLock) {
        // 四秒で待つのをやめると、展開中の素材に町の形が重なる。戦と同じく一種類ずつ完了を待つ。
        for (const load of [loadHumans, loadDomaru, loadCgt]) {
          if (my !== this.startSeq) return false;
          await load();
          await preparationFrame();
        }
      }
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
    // 町の門からでも献立の先頭を見せ、今日の支度を読んでから確かめる。
    if (o.go) $('go')?.focus({ preventScroll: true });

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
    if (memReloadGate(this, 'startDojo', [step])) return;
    this.lastStart = { fn: 'startDojo', args: [step] };
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
    this.freeTitle();
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
    this.freeTitle();
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
    if (memReloadGate(this, 'startMapBattle', [info, again])) return;
    this.lastStart = { fn: 'startMapBattle', args: [info, again] };
    if (!CBm) { const seq = this.startSeq; import('./b_castle.js').then((m) => { CBm = m; if (seq === this.startSeq) this.startMapBattle(info, again); }).catch(loadFail('城攻め')); return; }
    this.bg = null;
    this.freeTitle();
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
        // 描く前に（描いた後に大きさを変えると黒いコマになる）
      if (!isNorender()) draw(this.battle.scene);
      $('loading').hidden = true;
      this.pendingIntro = () => { this.hud.intro(def.sides, def.title, info.date); sfx('horagai', 0.6); };
      sfx('taiko', 0.8);
      beginPlay();
      window.__startFrames = [];
    }, () => this.startMapBattle(info, again)), 60);
  },

  endMapBattle(b) {
    const info = b.def.mapInfo;
    const won = b.tracker.main === true && !(b.result && b.result.down);
    const stats = { kills: b.stats.kills, t: b.t };
    // 戦場を手放す前に本人の傷だけ保存する。
    const G = JSON.parse(this.mapSnap);
    rememberWounds(G, b.player.u, b.def);
    this.stopBattle();
    b = null;
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
// 重さで落ちて読み直された時は印を残し、画質は高を保つ。
//   iOS は落ちた時刻（at）・熱さ（th）を渡す。どの戦の何秒で止まったかと回数を localStorage に残し（autoplay の記録も読む）、
//   一度だけ「軽く遊ぶ」の札を出す（熱の段を一つ上から始めるか選ぶ。設定の「軽く遊ぶ」で戻せる。10/21）
try {
  const qs = new URLSearchParams(location.search);
  if (qs.has('crashed')) {
    const id = localStorage.getItem('risshin-lastbattle') || '';
    const at = Number(qs.get('at')) || Date.now(), from = Number(localStorage.getItem('risshin-lastbattle-at')) || 0;
    const secs = from && at > from ? Math.round((at - from) / 1000) : null;
    const log = JSON.parse(localStorage.getItem('risshin-crashes') || '[]'); log.push([at, id, S.quality, secs, qs.has('th') ? Number(qs.get('th')) : null, S.heatFloor || 0]); localStorage.setItem('risshin-crashes', JSON.stringify(log.slice(-20)));
    localStorage.setItem('risshin-crashcount', String((Number(localStorage.getItem('risshin-crashcount')) || 0) + 1));
    S.quality = 'high'; S.lowMem = true; saveSettings(); markCrashed();
    history.replaceState(null, '', location.pathname);
    if (!window.__autoplay) setTimeout(() => crashCard(id), 1500);
  }
} catch (e) { /* 保存できない時は何もしない */ }
function crashCard(id) {
  const floor = Math.min(3, S.heatFloor || 0), name = BATTLES.find((b) => b.id === id)?.name;
  const el = document.createElement('div');
  el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-labelledby', 'crash-cf-t');
  el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;max-width:min(30em,calc(100vw - 32px));box-sizing:border-box;padding:16px;background:rgba(20,18,15,.96);color:#f1e9d8;border:1px solid #b8963e;border-radius:8px;font-size:16px;line-height:1.6';
  const msg = `前回は${name ? `「${String(name).replace(/[<>&"]/g, '')}」の` : ''}途中で止まってしまいました。`;
  const close = (light) => {
    if (light) { S.heatFloor = floor + 1; saveSettings(); onSettings('heatFloor'); }
    el.remove();
    notice(light ? '軽くしました。設定の「軽く遊ぶ」で戻せます' : 'このまま遊びます。設定の「軽く遊ぶ」でいつでも軽くできます');
  };
  el.innerHTML = floor >= 3
    ? `<p id="crash-cf-t" style="margin:0 0 12px">${msg}いちばん軽い設定で遊んでいます。もう一度、戦を選んで「出陣する」を押してください。</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-k="no" style="min-height:44px">閉じる</button></div>`
    : `<p id="crash-cf-t" style="margin:0 0 12px">${msg}軽く遊べる設定にしますか？<br><small style="font-size:14px">影や仕上げを省いて、止まりにくくします。兵の数は変わりません。あとで設定から戻せます。</small></p><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn primary" data-k="yes" style="min-height:44px">軽くして遊ぶ</button><button type="button" class="btn" data-k="no" style="min-height:44px">今のまま遊ぶ</button></div>`;
  el.querySelector('[data-k=no]').onclick = () => close(false);
  const yes = el.querySelector('[data-k=yes]'); if (yes) yes.onclick = () => close(true);
  el.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } };
  document.body.appendChild(el);
  (yes || el.querySelector('button')).focus({ preventScroll: true });
}
if (S.heatFloor) applyHeatFloor();
// 開発用：今の視点で一コマ描く（撮影の道具が使う。fresh なら目の慣れをやり直す）
game.drawNow = (fresh, scene) => { const sc = scene || (game.battle && game.battle.scene); if (sc) draw(sc, fresh); };
try { initMetrics(game); } catch (e) { /* 記録が動かなくても遊べる */ }
try { initCount(game); } catch (e) { /* 数えが動かなくても遊べる */ }
game.renderer = renderer;   // 開発用（描画の重さを計る）
// 城下から設定を開く（995）。閉じたら back へ
game.perf = () => ({ res: resScale });
game.openSettings = (back) => settingsScreen(onSettings, back);

// ---------------- ループ ----------------
const clock = new THREE.Clock();
let fpsT = 0, frames = 0, loopFrame = 0;
let capAcc = 0, bgAcc = 0, waitingLast = false, loopBattle = null;
// 一コマの中で b.update を刻む数の上限と、前のコマの一刻みの重さ（ms）。
// 刻みは「dt が 50ms を超えたら 50ms ずつ」だが、重い機械では「重いコマ → 刻みが増える → もっと重いコマ」の渦になっていた
// （4倍遅くの測りで 233ms のコマは 5 回 update して update が 176ms。カクつきの一番の元。10/20 カクつきの係）。
// 一刻みが既に重い（24ms 超）時は刻まず一回で進め（戦の時が少しゆっくりになるが、画面は止まらない）、軽い時も二回まで。
let stepMs = 0;
function loop() {
  loopFrame = requestAnimationFrame(loop);
  // 確かめ用：開戦から10秒、1コマの重さを window.__startFrames に記す（重いコマを探す道具。遊びには使わない）
  const _pf0 = window.__startFrames ? performance.now() : 0;
  // 待つ札と題の背景は毎秒十枚。再開・戦の切り替えではすぐ入力と絵を戻す。
  const b = game.battle;
  const waiting = document.hidden || (!b && !!game.bg) || !!(b && !game.deployment && !game.photo && (game.townShop || game.paused || game.hud.introWaiting));
  const wake = waiting !== waitingLast || b !== loopBattle;
  waitingLast = waiting; loopBattle = b;
  if (wake) capAcc = 0;   // 札を読んでいた待ち時間を、再開した戦の時間へ足さない。
  const chosenCap = fpsCapNow();
  // 戦は毎秒三十枚。毎秒十五回の煙の計算結果を、その間のコマで補間する。
  const cap = waiting ? (chosenCap ? Math.min(chosenCap, 10) : 10) : b ? Math.min(chosenCap || 30, 30) : chosenCap;
  // パソコンは大きさの変更や再開時にすぐ描く。iPhone はその時も三十枚の間隔を守る。
  if (cap) {
    capAcc += clock.getDelta();
    // iPhone は前に描いたコマから 33.3ms 未満なら描かない。余りは下で捨て、遅れを取り戻す連続描画をしない。
    // 画面の更新（60/120Hz）の揺れで 33.2ms に来たコマを飛ばすと 50ms になる（10/21 実機：考えを止めても中央・95% が 50ms ちょうど）。4ms の余裕を持つ
    const interval = MEM_TIGHT ? (waiting ? 1 / cap : 1 / 30 - 0.004) : 1 / cap - 0.002;
    if (capAcc < interval && (MEM_TIGHT || !sizeDirty && !wake)) return;
  }
  // ここから先は描くコマだけ（上限で飛ばすコマは何もしない：札の場所の測りも innerWidth の読みも配置を起こす）
  game.drawn = (game.drawn | 0) + 1;   // 描いたコマの通し番号（autoplay.js が描いたコマだけを数えるのに使う）
  // 札の場所（hudRects）は、前のコマの描画で配置が済んだ今のうちに測る（札を書き換えた後に測ると、その場で配置をやり直して重いコマになる）
  if (!isNorender()) viewSync();
  if (b && b.hud && b.hud.rt && b.hud.hudRects && !isNorender()) b.hud.hudRects();
  const elapsed = cap ? capAcc : clock.getDelta();
  const real = document.hidden ? 0 : Math.min(0.25, elapsed);
  capAcc = 0;
  let dt = real;
  b?.environmentSound?.sync(!game.paused && !game.photo && !game.townShop && !document.hidden && document.hasFocus());
  // 人の作り置きと絵の下ごしらえは支度中だけ。操作の輪では始めない。
  pollPad();
  touchFrame(real);
  // 城下の店の札を開いている間は、町を描かない（札が画面を覆う。電池を減らさない）
  if (document.hidden || (b && game.townShop)) { input.endFrame(); return; }
  if (b) {
    // 攻撃が当たった瞬間のわずかな溜め（ヒットストップ）。「動きを減らす」では使わない
    if (game.hitstop > 0) {
      const stopped = Math.min(real, game.hitstop, 0.06);
      game.hitstop = Math.max(0, Math.min(game.hitstop, 0.06) - real);
      if (!RMm()) dt -= stopped * 0.65;
    }
    // 受け流し・武将討ちの瞬間はゆっくり
    const momentSpeed = decisiveCameraSpeed(b);
    if (game.slowmo > 0) { game.slowmo -= real; if (!RMm()) dt *= Math.min(0.35, momentSpeed); }
    else dt *= momentSpeed;
    b.army.hitReactionScale = dt > 0 ? real / dt : 1;
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
        const spd = getSpeed(), maxSteps = stepMs > 24 ? 1 : 2;
        const steps = Math.min(maxSteps, Math.max(1, Math.ceil(dt / 0.05)));
        // 一刻みは 1/15 秒まで（当たり・歩みの刻みを粗くしすぎない。余った分は戦の時がその分ゆっくり進む）
        const slice = Math.min(dt / steps, 1 / 15);
        const tS0 = performance.now();
        for (let tick = 0; tick < steps; tick++) {
          for (let si = 0; si < spd && !b.disposed && game.battle === b; si++) b.update(slice, input);
          if (steps > 1) input.endFrame();
          if (b.disposed || b.over || game.paused || game.hud.introWaiting || game.deployment || game.battle !== b) break;
        }
        stepMs = (performance.now() - tS0) / steps;
      } catch (e) {
        console.error(e);
        reportBug(e.message, (e.stack || '').split('\n')[1] || '');
      }
    }
    if (b.disposed || game.battle !== b) { input.endFrame(); return; }
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
    // 10/24 kaito（熱）：止めた画面・大きな地図・戦の後の札の間は 3D を描かない（前の絵がそのまま残る）
    const still3d = (game.paused && !game.photo && !game.deployment) || (game.mapOpen && !game.cmdMap) || (b.over && !$('screen').hidden);
    if (!still3d || sizeDirty || wake) {
      if (MEM_TIGHT) tinyCull(b.scene, camera, renderer);
      draw(b.scene); sizeDirty = false;
    }
    if (MEM_TIGHT && !iosThermalSeen && !still3d) webHeatWatch(real);
    if (measuring) {
      const t_d1 = performance.now(), total = t_d1 - t_u0;
      if (total > 24) window.__startFrames.push({ t: +b.t.toFixed(2), upd: +(t_u1 - t_u0).toFixed(1), draw: +(t_d1 - t_u1).toFixed(1), total: +total.toFixed(1) });
    } else if (b.t >= 10 && window.__startFrames) {
      const F = window.__startFrames;
      console.info(`開戦10秒の長いこま（33ms超）：${F.length}個`, JSON.stringify(F));
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
    // 携帯（iPhone）は題の画面を毎コマ描かない：一秒に 15 コマ（題で端末が熱くなるのを抑える。kaito 10/20「端末が熱くならないように」）
    if (!covered && !(MEM_TIGHT && bgAcc < 1 / 15) || bgAcc >= 0.1 || sizeDirty) { game.bg.update(bgAcc, camera); draw(game.bg.scene); bgAcc = 0; sizeDirty = false; }
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
    window.dispatchEvent(new Event('risshin-battle-ready'));
  }
  if (!isTouch) requestLock();
};
initTouch({ input, game, setPause, toggleBigMap });
game.toggleBigMap = toggleBigMap; // 隅の小さな地図（field_map.js）を押した時も同じ道で開く
loop();
// 自動計測の鍵は出陣の再開より先に用意する。後で解くと、読み直した四戦目以降が購入案内で止まる。
const autoplayRequest = window.__autoplay || new URLSearchParams(location.search).get('autoplay');
if (autoplayRequest) window.__autoplayUnlock = true;
const memResumed = memResume(game);
if (!memResumed) game.title();
// 共有の入口は新しい練習だけ。保存の読み直し・上書き・削除はしない。
const shared = !memResumed && sharedBattle(location.search, BATTLE_IDS);
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
// 端末の毎晩の自動プレイ（iOS の起動引数 -autoplay、または ?autoplay=id,id）。遊ぶ時だけ読む
if (autoplayRequest) { if (APX.sec) window.__autoplaySec = APX.sec; import('./autoplay.js').then((m) => m.run(game, String(autoplayRequest).split(',').filter((w) => w && !/^x_/.test(w) && w !== 'tight'))).catch((e) => console.warn('自動の試し遊びで止まりました。', e && e.stack || e)); }
