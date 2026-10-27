// 端末で毎晩自動で遊ばせて、手触りとカクつきを測る入口（iOS アプリの起動引数 -autoplay id,id か、?autoplay=id,id）。
// 遊ぶ時だけ動く。bot（playbot.js の brain）が本番の絵の輪のまま遊び、コマの時間と、触ってから動くまでを記録する。
// 結果は window.webkit.messageHandlers.autoplay（アプリが書類の autoplay.json に書く）か、無ければ window.__autoplayResult へ。
import { newGame, fillRoster, RANKS, BATTLES, setScenario, usePre } from './state.js';
import { brain } from './playbot.js';
import { S } from './settings.js';
import { HSTAT } from './humans.js';
import { LAZY_STAT } from './units_model.js';
import { botInput } from './bot_input.js';
import { ASTC_RT } from './astc_rt.js';
import * as THREE from 'three';
import { DEATH_END } from './units.js';
import { disposeProbe } from './autoplay_probe.js';

const _upV = new THREE.Vector3();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1); };
const MAX_SEC = 150;   // 一つの戦で遊ぶ実時間の上限（測りの道具は window.__autoplaySec で短くできる）

function post(o) {
  window.__autoplayResult = o;
  try { window.webkit.messageHandlers.autoplay.postMessage(JSON.stringify(o)); } catch (e) { /* ブラウザでは postMessage 先が無い */ }
}

// iPhone は戦の間でページを読み込み直す（main.js memReloadGate）。進みを sessionStorage に置き、読み込み後に続きから遊ぶ。
const AP_KEY = 'risshin-autoplay-run';
export async function run(game, ids) {
  const key = ids.join(',');
  // app（iOS）は戦の間に WKWebView を作り直す（sessionStorage が消える）ので localStorage に。同じ起動（__bootId）の物だけ続きにする
  const store = window.__iosRecreate ? localStorage : sessionStorage;
  let st = null;
  try { st = JSON.parse(store.getItem(AP_KEY) || 'null'); } catch (e) { st = null; }
  if (!st || st.key !== key || !st.res || (window.__bootId && st.boot !== window.__bootId)) st = null;
  const res = st ? st.res : { start: new Date().toISOString(), ua: navigator.userAgent, dpr: devicePixelRatio, screen: [innerWidth, innerHeight], requested: [...ids], battles: [], done: false };
  const from = st ? st.idx : 0;
  let active = from, savedIndex = from;
  // 本来の熱対策を先に実行し、通知の段階と実際の描き込みの段階を別々に記録する。
  const power = { latest: window.__iosPowerState || null, sink: null }, iosPower = window.__iosPower;
  const observePower = function (o) {
    if (typeof iosPower === 'function') iosPower.apply(this, arguments);
    const thermal = o?.thermal;
    power.latest = { thermal: Number.isInteger(thermal) && thermal >= 0 && thermal <= 3 ? thermal : null, lowPower: !!o?.lowPower };
    if (power.sink) power.sink();
  };
  window.__iosPower = observePower;
  const snapshot = () => {
    const r = res.battles[active];
    if (!r) return;
    const LT = window.__loadTimes;
    if (LT?.battle === r.id) r.load = { ...LT, stages: { ...LT.stages } };
    r.astc = { ...ASTC_RT };
    r.errors ||= [];
    for (const e of window.__preparationErrors || []) {
      if (e.battle && e.battle !== r.id) continue;
      if (!r.errors.some((old) => old.at === e.at && old.type === e.type && old.message === e.message)) r.errors.push(e);
    }
    if (r.errors.length > 32) r.errors.splice(0, r.errors.length - 32);
    r.lastPostAt = new Date().toISOString();
  };
  const keep = (idx) => { savedIndex = idx; snapshot(); assessRun(res); try { store.setItem(AP_KEY, JSON.stringify({ key, res, idx, boot: window.__bootId || null })); } catch (e) { /* 置けなければ続きは無い */ } };
  const publish = () => { keep(savedIndex); post(res); };
  window.addEventListener('risshin-preparation-progress', publish);
  try {
    res.reloads = (res.reloads || 0) + (st ? 1 : 0);
    // 読み込み直しの種類と理由（落ち＝app が load し直す→navigate・gate や支度の失敗→reload）を記録に残す（落ちの切り分け）
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      const why = sessionStorage.getItem('risshin-reload-why'); sessionStorage.removeItem('risshin-reload-why');
      (res.loads ||= []).push({ at: new Date().toISOString(), type: nav ? nav.type : '?', titleMs: window.__bootTitleMs ?? null, origin: Math.round(performance.timeOrigin), resumed: window.__memResumed ? window.__memResumed.fn : null, why: why || undefined, crashes: localStorage.getItem('risshin-crashes') || undefined });
    } catch (e) { /* 記せなくてもよい */ }
    // 最初の戦が終わる前に止まっても、前回の記録を今回の未開始と取り違えない。
    publish();
    try { await import('./battles.js'); }
    catch (e) {
      res.battles = ids.map(id => ({ id, ok: false, error: `戦の読み込みに失敗：${String(e && e.message || e).slice(0, 120)}` }));
      res.done = true; res.end = new Date().toISOString(); publish();
      return;
    }
    game.noLock = true; window.__autoplayUnlock = true;
    const resumed = window.__memResumed; window.__memResumed = null;
    // x_town：遊ぶ人と同じ道（城下を歩く→出陣）で次の戦へ入る。城下の前と出陣の前の二度、iPhone は読み込み直す（memReloadGate）
    const viaTown = !!(window.__apx && window.__apx.town);
    for (let k = from; k < ids.length; k++) {
      active = k;
      const id = ids[k];
      // 読み込み直しの前に支度を始めた戦は、読み込み後に main.js が続きから始めている
      const cont = res.battles.length > k;
      const viaGate = cont && resumed && resumed.fn === 'startBattle';
      const atTown = cont && resumed && resumed.fn === 'startTown';
      if (cont && !viaGate && !atTown) { res.battles[k].error = (res.battles[k].error || '') + '（途中でページが読み込み直された）'; keep(k + 1); publish(); continue; }
      if (atTown) {
        // 城下（歩く町）の支度が済むのを待ち、出陣（startBattle）。memReloadGate で読み込み直され、続きは viaGate で来る
        const i = BATTLES.findIndex((b) => b.id === id);
        for (let n = 0; n < 240 && !(game.battle && game.battle.def.town) && !game.lastError; n++) await wait(250);
        res.battles[k].townSec = Math.round(performance.now() / 100) / 10;
        res.battles[k].error = '城下から出陣の途中で記録が途切れた'; keep(k); publish();
        game.lastError = ''; game.startBattle(i);
        if (window.__memReloading) return;   // 読み込み直しが始まった
        try { await playOne(game, i, res.battles[k], publish, true, false, power); } catch (e) { res.battles[k].error = String(e && e.message || e).slice(0, 120); }
        keep(k + 1); publish();
        continue;
      }
      const firstInou = viaTown && k === 0 && id === 'inou';
      // 戦を探す前に新しい保存の並びに合わせる。端末の古い保存では稲生が外れている。
      if (!viaGate) botG(game, firstInou);
      if (BATTLES.findIndex((b) => b.id === id) < 0) { setScenario('oda'); usePre(game.G); }
      const i = BATTLES.findIndex((b) => b.id === id);
      const r = viaGate ? res.battles[k] : { id, ok: false };
      if (!viaGate) res.battles.push(r);
      // 指定違いはその場で確定して送る。次の重い支度で記録が途切れ、
      // 存在しない戦の失敗と支度の失敗が混ざるのを防ぐ。
      if (i < 0) {
        r.error = '戦が見つからない。自動の試し遊びの指定を確かめてください';
        res.done = true; res.end = new Date().toISOString(); keep(ids.length); publish();
        return;
      }
      r.error = '戦の支度中に記録が途切れた'; keep(k); publish();
      if (viaTown && !viaGate && !firstInou) {
        // 二戦目以降は城下へ（base→startTown）。城下の前に読み込み直される（続きは atTown）
        game.base();
        if (window.__memReloading) return;
        for (let n = 0; n < 240 && !(game.battle && game.battle.def.town) && !game.lastError; n++) await wait(250);
        r.error = '城下から出陣の途中で記録が途切れた'; keep(k); publish();
        game.lastError = ''; game.startBattle(i);
        if (window.__memReloading) return;
        try { await playOne(game, i, r, publish, true, false, power); } catch (e) { r.error = String(e && e.message || e).slice(0, 120); }
        keep(k + 1); publish();
        continue;
      }
      try { await playOne(game, i, r, publish, viaGate, firstInou, power); } catch (e) { r.error = String(e && e.message || e).slice(0, 120); }
      keep(k + 1); publish();
    }
    res.done = true; res.end = res.end || new Date().toISOString();
    keep(ids.length); publish();
  } finally {
    window.removeEventListener('risshin-preparation-progress', publish);
    if (window.__iosPower === observePower) window.__iosPower = iosPower;
  }
}

// 部ごとの時間（1コマに足し合わせ、コマごとに配列へ）。入れ子の render は一番外側だけ数える。
// 三角・描く回数は、仕上げの段（画質「高」は最後が一枚の板）も含めて一コマ分を足す（一つずつだと最後の段の 1 になる）。
const AM = ['think', 'act', 'bodies', 'collide', 'animate', 'updateImpostors', 'updateBullets', 'updateArrows', 'updateSmoke', 'updateParticles', 'updateStains', 'updateFalling', 'updateLooseHorses', 'updateGroups', 'duelTick', 'groundTick', 'rebuildGrid', 'rideCheck', 'leaveField'];
const BM = ['updateArmyAids', 'updateSquadAids', 'updateCouriers', 'updateFences', 'updateReserves', 'updateHold'];
const PN = ['update', 'army', 'world', 'ai', 'hud', 'humans', 'render', ...AM.map((k) => 'a.' + k), ...BM.map((k) => 'b.' + k), 'p.update', 'p.cam'];
function profInstall(game, b) {
  const cur = {}; PN.forEach((k) => { cur[k] = 0; });
  cur.calls = cur.tris = 0;
  const undo = [];
  // 自動計測の札だけで戦術判断と、主人公から直接呼ばれる攻撃の当たりも止める。
  for (const [obj, name] of [[b.ai, 'update'], [b.army, 'damage']]) {
    const f = obj?.[name];
    if (typeof f !== 'function') continue;
    const w = function () { if (!window.__apx?.noai) return f.apply(this, arguments); };
    obj[name] = w; undo.push(() => { if (obj[name] === w) obj[name] = f; });
  }
  const wrap = (obj, name, key) => {
    const f = obj && obj[name]; if (typeof f !== 'function') return;
    const w = function () { const t = performance.now(); try { return f.apply(this, arguments); } finally { cur[key] += performance.now() - t; } };
    obj[name] = w;
    undo.push(() => { if (obj[name] === w) obj[name] = f; });
  };
  wrap(b.army, 'update', 'army'); wrap(b.world, 'update', 'world'); wrap(b.ai, 'update', 'ai'); wrap(b.hud, 'update', 'hud');
  AM.forEach((k) => wrap(b.army, k, 'a.' + k)); BM.forEach((k) => wrap(b, k, 'b.' + k));
  wrap(b.player, 'update', 'p.update'); wrap(b.player, 'updateCamera', 'p.cam');
  const rd = game.renderer;
  if (rd) {
    const f = rd.render; let depth = 0;
    const w = function () {
      if (depth++) { try { return f.apply(this, arguments); } finally { depth--; } }
      const t = performance.now();
      try { return f.apply(this, arguments); }
      finally { depth--; cur.render += performance.now() - t; const i = rd.info.render; cur.calls += i.calls; cur.tris += i.triangles; }
    };
    rd.render = w;
    undo.push(() => { if (rd.render === w) rd.render = f; });
  }
  // 描画器は次の戦でも使うので、前の戦の記録先を残さない。
  return { cur, dispose() { for (let i = undo.length - 1; i >= 0; i--) undo[i](); } };
}

function botG(game, firstInou = false) {
  const G = newGame('bot', 'normal', 'oda');
  G.owari = 1; usePre(G);
  G.practice = true;
  if (!firstInou) { G.rank = 2; G.aijirushi = 'maru'; G.owned.push('katana'); }
  const n = RANKS[G.rank].squad;
  if (n) fillRoster(G, n - Math.round(n / 3), Math.round(n / 3));
  game.G = G; game.lastError = '';
  return G;
}

// 数だけを写す。描画器の入れ物を残すと、後のコマで過去の記録まで変わってしまう。
function rendererSnapshot(game, calls, triangles) {
  const info = game.renderer?.info;
  if (!info) return null;
  return {
    memory: { geometries: info.memory.geometries, textures: info.memory.textures },
    render: { calls: calls ?? info.render.calls, triangles: triangles ?? info.render.triangles },
    programs: info.programs?.length || 0,
  };
}

async function playOne(game, i, r, progress, started = false, firstInou = false, power) {
  const tLoad = performance.now();
  const requestedFlags = { ...window.__apx };
  // 比較の前半は全試行で通常の乱戦へ進む。比較専用の札は共通区間に入ってから切り替える。
  if (requestedFlags.compare && requestedFlags.ab) {
    for (const key of Object.keys(requestedFlags)) if (!['ab', 'sec', 'compare'].includes(key)) window.__apx[key] = 0;
    if (requestedFlags.pr) window.dispatchEvent(new Event('resize'));
  }
  r.at = new Date().toISOString();
  // 初陣の稲生は、新しく始めた人と同じ story(0) から入る（城下を挟まない）。
  if (!started) { if (firstInou) game.story(0); else game.startBattle(i); }
  // 実機は大きな戦の読み込みが長い。3分まで待ち、かかった秒を記録する（10/17 に60秒で「支度が終わらない」になっていた）
  let nextPost = performance.now() + 10000;
  for (let k = 0; k < 720 && !game.battle && !game.lastError; k++) {
    await wait(250);
    if (performance.now() >= nextPost) {
      r.loadSec = Math.round((performance.now() - tLoad) / 100) / 10;
      progress(); nextPost = performance.now() + 10000;
    }
  }
  const b = game.battle; r.loadSec = Math.round((performance.now() - tLoad) / 100) / 10;
  if (!b) { r.error = (game.lastError || '戦の支度が終わらない') + `（${r.loadSec}秒）`; return; }
  r.error = '開戦の札で記録が途切れた'; progress();
  // 見渡しを飛ばし、開戦の札から出陣
  for (let k = 0; k < 60; k++) {
    if (game.deployment) { try { game.deployment.jump(); game.deployment.update(3); } catch (e) { /* 続ける */ } }
    if (game.pendingIntro && !game.deployment) { const f = game.pendingIntro; game.pendingIntro = null; f(); }
    const go = document.getElementById('intro-go'), intro = document.getElementById('intro');
    if (game.hud.introWaiting && go && !go.disabled && go.getClientRects().length) go.click();
    if (!game.deployment && !game.pendingIntro && !game.hud.introWaiting && intro && intro.hidden) break;
    await wait(300);
  }
  game.paused = false;
  r.error = '戦いの途中で記録が途切れた'; progress();
  const pz = document.getElementById('pause'); if (pz) pz.hidden = true;
  // 本番の update の入力だけを bot に差し替える（絵の輪・描画・音は本番のまま）
  const inp = botInput();
  const orig = b.update;
  const prof = profInstall(game, b), cur = prof.cur;
  b.update = (dt) => {
    try { brain(b, inp); } catch (e) { /* bot の迷いで落とさない */ }
    HSTAT.ms = 0;
    const t = performance.now();
    try { orig.call(b, dt, inp); }
    finally { cur.update += performance.now() - t; cur.humans += HSTAT.ms || 0; inp.endFrame(); }
  };
  const parts = {}; PN.forEach((k) => { parts[k] = []; });
  const dts = [], frameEnds = [], lat = [];
  const t0 = performance.now(), bt0 = b.t;
  let last = t0, run = true, slow = 0, lastCalls = 0, lastTris = 0, lastDrawn = game.drawn | 0;
  r.power = [];
  const samplePower = () => {
    const previous = r.power[r.power.length - 1];
    const thermal = power.latest?.thermal ?? null, lowPower = power.latest?.lowPower ?? false;
    const level = window.__heat?.().level ?? null;
    if (!previous || previous.thermal !== thermal || previous.lowPower !== lowPower || previous.level !== level) {
      r.power.push({ sec: previous ? (performance.now() - t0) / 1000 : 0, thermal, lowPower, level });
    }
  };
  power.sink = samplePower;
  samplePower();
  // 背景から戻った直後は背景にいた時間を数えず、遊んでいる最中の長い停止は捨てない。
  const visibility = () => { last = performance.now(); };
  document.addEventListener('visibilitychange', visibility);
  const ri = r.rendererInfo = { start: rendererSnapshot(game), middle: null, end: null, afterCleanup: null };
  // 半秒ごとに、見えている骨入りの形と、実際に骨が変わった形を数える。共有の骨は一度だけ調べる。
  const boneHistory = new WeakMap();
  r.sceneSamples = [];
  const sceneSnapshot = () => {
    let skinned = 0, activeSkinned = 0, shadowCasters = 0;
    const checked = new Map();
    b.scene.traverseVisible(o => {
      if (o.castShadow && (o.isMesh || o.isPoints || o.isLine)) shadowCasters++;
      if (!o.isSkinnedMesh) return;
      skinned++;
      let moving = checked.get(o.skeleton);
      if (moving === undefined) {
        let hash = 0;
        for (const bone of o.skeleton.bones) {
          const p = bone.position, q = bone.quaternion, s = bone.scale;
          hash = (hash * 31 + p.x + p.y * 3 + p.z * 7 + q.x * 11 + q.y * 13 + q.z * 17 + q.w * 19 + s.x * 23 + s.y * 29 + s.z * 37) % 1000003;
        }
        moving = boneHistory.has(o.skeleton) && boneHistory.get(o.skeleton) !== hash;
        boneHistory.set(o.skeleton, hash); checked.set(o.skeleton, moving);
      }
      if (moving) activeSkinned++;
    });
    return { skinned, activeSkinned, shadowCasters, shadowEnabled: !!game.renderer?.shadowMap.enabled };
  };
  const rendererSamples = [];
  let firstDraw = true;
  const win30 = []; let w30 = [], w30t = performance.now();   // 30 秒ごとの窓（熱で遅くなる様子を見る）
  // 実機の試し（main.js の x_ab）：x_… の印を 6 コマごとに入れたり切ったりして、同じ遊びの中で前後を比べる（各組の初め 2 コマは捨てる）。
  //   描く倍率（pr）は作り直しが重いので 3 秒ごと（初めの 1 秒は捨てる）。6 秒ごとの窓の中央も残す（戦の場面の移りを見る）
  const apx = window.__apx || {}, abKeys = apx.ab ? Object.keys(apx).filter((k) => !['ab', 'sec', 'compare'].includes(k)) : [];
  r.probeFlags = requestedFlags;
  // 全試行で同じ開戦後60〜120秒。最重区間を各回で選び直して比べない。
  const comparison = { startSec: 60, endSec: 120, complete: false, on: null, off: null };
  const paired = { on: { frame: [], calls: [], triangles: [], update: [], render: [] }, off: { frame: [], calls: [], triangles: [], update: [], render: [] } };
  const addPair = (on, d) => {
    const dest = paired[on ? 'on' : 'off'];
    dest.frame.push(d); dest.calls.push(cur.calls); dest.triangles.push(cur.tris); dest.update.push(cur.update); dest.render.push(cur.render);
  };
  const abVals = {}; for (const k of abKeys) abVals[k] = requestedFlags[k];
  let abOn = !apx.compare, abN = 0, abT0 = performance.now(), abCur = [], abCurJ = [], abCurL = [], abCurO = [], abPrevEnd = 0; const abA = [], abB = [], abU = [], abV = [], abWin = [];
  const abSet = (on) => { if (on === abOn) return; abOn = on; for (const k of abKeys) apx[k] = on ? abVals[k] : 0; if (abVals.pr) window.dispatchEvent(new Event('resize')); };
  const frame = (t) => {
    if (!run) return;
    if (game.paused || document.hidden) { last = t; requestAnimationFrame(frame); return; }
    // 描く上限（fpsCap）で飛ばしたコマは数えない（描いたコマの間隔だけを測る）
    if ((game.drawn | 0) === lastDrawn) { requestAnimationFrame(frame); return; }
    lastDrawn = game.drawn | 0;
    if (!game.paused && !document.hidden) {
      const d = t - last;
      if (d > 0) {
        dts.push(d); frameEnds.push((t - t0) / 1000); if (d > 50) slow++; for (const k of PN) parts[k].push(cur[k]);
        w30.push(d); if (t - w30t > 30000) { win30.push({ n: w30.length, med: pct(w30, 0.5), p95: pct(w30, 0.95), slow: w30.filter((x) => x > 50).length }); w30 = []; w30t = t; }
        if (abKeys.length && (!apx.compare || t - t0 > 60000)) {
          const js = cur.update + cur.render;
          abN++;
          let use;
          // このコマを描いた時の札で数え、次のコマの札は数え終えてから変える。
          if (abVals.pr) { const el = (t - abT0) % 6000; use = el % 3000 > 1000 && abOn === (el < 3000); }
          else use = (abN - 1) % 6 >= 2;
          if (use) { (abOn ? abA : abB).push(d); (abOn ? abU : abV).push(js); }
          if (apx.compare && use && t - t0 > 60000 && t - t0 <= 120000) addPair(abOn, d);
          if (abVals.pr) abSet((t - abT0) % 6000 < 3000);
          else if (abN % 6 === 0) abSet(!abOn);
          // 一コマの JS の全体（rAF の始まりからこの記録まで＝本編の輪の全部）と、前のコマの JS の終わりからこのコマの始まりまでの外（GPU 待ち・DOM の配置・描画器の表示）
          const nowS = performance.now(); abCur.push(d); abCurJ.push(js); abCurL.push(nowS - t); abCurO.push(abPrevEnd ? t - abPrevEnd : 0); abPrevEnd = nowS;
          if (t - abT0 > abWin.length * 6000 + 6000) { abWin.push({ n: abCur.length, med: pct(abCur, 0.5), js: pct(abCurJ, 0.5), loop: pct(abCurL, 0.5), out: pct(abCurO, 0.5) }); abCur = []; abCurJ = []; abCurL = []; abCurO = []; }
        } else if (apx.compare && t - t0 > 60000 && t - t0 <= 120000) addPair(true, d);
      }
    }
    for (const k of PN) cur[k] = 0;
    if (cur.calls) {
      lastCalls = cur.calls; lastTris = cur.tris;
      if (firstDraw) { ri.start = rendererSnapshot(game, lastCalls, lastTris); rendererSamples[0].info = ri.start; firstDraw = false; }
    }
    cur.calls = cur.tris = 0;
    last = t; requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // 触ってから絵が出るまで：画面に触れた印を出し、次の絵が描き終わる（次の rAF の後）までの時間。8秒に一度
  const canvas = document.querySelector('canvas');
  const tapTimer = setInterval(() => {
    if (game.paused || document.hidden || !canvas) return;
    const t0 = performance.now();
    try { canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX: innerWidth / 2, clientY: innerHeight / 2, bubbles: true })); canvas.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', clientX: innerWidth / 2, clientY: innerHeight / 2, bubbles: true })); } catch (e) { /* 無ければ飛ばす */ }
    requestAnimationFrame(() => { if (!run) return; const mc = new MessageChannel(); mc.port1.onmessage = () => { if (run) lat.push(performance.now() - t0); mc.port1.close(); mc.port2.close(); }; mc.port2.postMessage(0); });
  }, 8000);
  // 5 秒ごとの数（落ちの切り分け：骨入りの人・絵札・作り直し・束の形・GPU へ送った形）。落ちても直前までが残る
  r.tl = [];
  // 従来の九列は保ち、三十秒ごとの増分を末尾へ付ける。時計は実時間。
  let memoryAt = performance.now(), memoryHeap = performance.memory?.usedJSHeapSize ?? null;
  let memoryCounts = null;
  const memorySample = () => {
    const s = window.__solo || {};
    return { 人作成: HSTAT.makeN, 人再利用: HSTAT.borrowN, 共有形再利用: HSTAT.crowdHit,
      共有形作成: HSTAT.crowdMade, 共通形作成: HSTAT.shapeMade,
      配列破棄: LAZY_STAT.arraysDropped, 配列復元: LAZY_STAT.arraysMade,
      形復元: LAZY_STAT.restored, 仮の形返却: LAZY_STAT.temporaryDisposed,
      束作成: s.batchesMade || 0, 束返却: s.batchesDisposed || 0,
      入れ物作成: s.poolsMade || 0, 入れ物返却: s.poolsDisposed || 0,
      場所再利用: s.reused || 0, 満杯待ち: s.full || 0,
      束配列破棄: s.drop || 0, 束配列復元: s.restore || 0 };
  };
  memoryCounts = memorySample();
  const tlTimer = setInterval(() => {
    try {
      const us = b.army ? b.army.units : [], d = window.__crowdDbg ? window.__crowdDbg() : null, ri = game.renderer && game.renderer.info;
      let hum = 0, vis = 0, ef = 0; for (const u of us) { if (u.human) { hum++; if (u.human.root.visible) vis++; } if (u.efuda) ef++; }
      // 討たれて倒れ終えたのに、骨の人が立ったまま見えている兵（iPhone Safari で見えた「直立の亡骸」の切り分け。10/28）
      let upright = 0, deadDone = 0;
      for (const u of us) {
        if (u.alive || !u.death || u.mounted || u.death.t < DEATH_END || u.death.throe > u.death.th || u.death.aid || u.sinkT) continue;
        deadDone++;
        const h = u.human, head = h && h.root.visible && h.bones && h.bones.Head;
        if (head) { head.getWorldPosition(_upV); if (_upV.y - u.pos.y > 1.05) upright++; }
      }
      r.upright = Math.max(r.upright || 0, upright); r.deadDone = Math.max(r.deadDone || 0, deadDone);
      if (upright) (r.uprightAt ||= []).length < 20 && r.uprightAt.push([Math.round(b.t), upright]);
      r.tl.push([Math.round(b.t), hum, vis, ef, HSTAT.makeN, d ? d.geos.size : -1, d ? d.shapes.size : -1, ri ? ri.memory.geometries : -1, ri ? ri.memory.textures : -1]);
      const now = performance.now();
      if (now - memoryAt >= 30000) {
        const counts = memorySample(), diff = {}, heap = performance.memory?.usedJSHeapSize ?? null;
        for (const key in counts) diff[key] = counts[key] - memoryCounts[key];
        r.tl[r.tl.length - 1].push({ 実秒: (now - t0) / 1000, 間隔秒: (now - memoryAt) / 1000,
          使用量: heap, 毎秒増加量: heap !== null && memoryHeap !== null ? (heap - memoryHeap) / ((now - memoryAt) / 1000) : null,
          増分: diff });
        memoryCounts = counts; memoryHeap = heap; memoryAt = now;
      }
      if (r.tl.length > 200) r.tl.shift();
      progress();
    } catch (e) { /* 数えられなくてもよい */ }
  }, 5000);
  const sampleRenderer = () => {
    const sample = { ms: performance.now() - t0, info: rendererSnapshot(game, cur.calls || lastCalls, cur.calls ? cur.tris : lastTris) };
    rendererSamples.push(sample);
    r.sceneSamples.push({ sec: sample.ms / 1000, ...sceneSnapshot(), thermal: power.latest?.thermal ?? null,
      heatLevel: window.__heat?.().level ?? null, ...sample.info?.memory });
    // 短く終わった戦も、実際に遊んだ時間の中央に最も近い記録を選ぶ。
    const half = sample.ms / 2;
    let middle = rendererSamples[0];
    for (const s of rendererSamples) if (Math.abs(s.ms - half) < Math.abs(middle.ms - half)) middle = s;
    ri.middle = middle.info;
    return sample.info;
  };
  rendererSamples.push({ ms: 0, info: ri.start });
  nextPost = t0 + 10000;
  try {
    while (!b.over && !b.ended && game.battle === b && performance.now() - t0 < (+window.__autoplaySec || MAX_SEC) * 1000) {
      if (game.paused) game.paused = false;
      await wait(500);
      samplePower();
      ri.end = sampleRenderer();
      if (rendererSamples.length === 2 || performance.now() >= nextPost) { progress(); nextPost = performance.now() + 10000; }
    }
    run = false; clearInterval(tapTimer); clearInterval(tlTimer);
    const sec = (performance.now() - t0) / 1000;
    if (apx.compare) {
      comparison.complete = sec >= 120;
      for (const key of ['on', 'off']) {
        const p = paired[key];
        comparison[key] = { n: p.frame.length, frameMs: p.frame.length ? { median: pct(p.frame, 0.5), p95: pct(p.frame, 0.95), p99: pct(p.frame, 0.99) } : null,
          calls: pct(p.calls, 0.5), triangles: pct(p.triangles, 0.5), updateMs: pct(p.update, 0.5), renderMs: pct(p.render, 0.5) };
      }
      r.comparison = comparison;
    }
    Object.assign(r, frameSummary(dts, frameEnds, sec));
    r.thermal = thermalSummary(r.power, sec);
    Object.assign(r, {
      ok: true, error: '', realSec: +sec.toFixed(1), battleSec: +(b.t - bt0).toFixed(1), ended: !!(b.ended || b.over), frames: dts.length,
      slowFrames: slow,
      fps: +(dts.length / Math.max(1, sec)).toFixed(1), tapMs: { n: lat.length, median: pct(lat, 0.5), max: pct(lat, 1) },
      // コマ間隔ではなく更新と描画命令の実働。各コマを足してから分位点を取る。
      workMs: (() => {
        const a = parts.update.map((ms, i) => ms + parts.render[i]).sort((x, y) => x - y);
        const at = (p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null;
        return { metric: 'js-render-v1', n: a.length, median: at(0.5), p95: at(0.95), p99: at(0.99), over30: a.length ? +(a.filter((x) => x > 30).length / a.length).toFixed(3) : null };
      })(),
      prof: profSum(dts, parts),
      ab: abKeys.length ? { keys: abKeys, on: { n: abA.length, median: pct(abA, 0.5), p95: pct(abA, 0.95), p99: pct(abA, 0.99), js: pct(abU, 0.5), js95: pct(abU, 0.95) }, off: { n: abB.length, median: pct(abB, 0.5), p95: pct(abB, 0.95), p99: pct(abB, 0.99), js: pct(abV, 0.5), js95: pct(abV, 0.95) }, win: abWin } : undefined,
      // 重いコマ上位6つの内訳（update・render・人・軍。外＝その他：絵の組み立て・掃除・他の輪）
      top: dts.map((d, i) => [d, i]).sort((x, y) => y[0] - x[0]).slice(0, 6).map(([d, i]) => { const g = (k) => Math.round(parts[k][i] || 0); return { ms: Math.round(d), up: g('update'), rd: g('render'), hum: g('humans'), army: g('army'), hud: g('hud'), out: Math.round(d - (parts.update[i] || 0) - (parts.render[i] || 0)) }; }),
      hp: Math.round(b.player.u.hp), resScale: game.perf ? game.perf().res : null, quality: S.quality, calls: lastCalls, tris: lastTris,
      win30, fpsCap: S.fpsCap, capX: window.__apx ? window.__apx.cap : undefined, endAt: new Date().toISOString(),
    });
  } finally {
    run = false; clearInterval(tapTimer); clearInterval(tlTimer);
    power.sink = null;
    document.removeEventListener('visibilitychange', visibility);
    ri.end = sampleRenderer();
    abSet(true);
    b.update = orig; prof.dispose();
    disposeProbe();
    if (game.battle === b) game.stopBattle && game.stopBattle();
    // 片付けでは描き直さず、その直後の生の情報を残す（描画欄は最後に描いた段の値）。
    ri.afterCleanup = rendererSnapshot(game);
    r.cleanupMemory = ri.afterCleanup ? { ...ri.afterCleanup.memory, programs: ri.afterCleanup.programs, heapBytes: performance.memory?.usedJSHeapSize ?? null } : null;
    progress();
  }
}

// 判定には丸める前の値を使う。並べ替えは集計時だけで、コマの輪には足さない。
function frameSummary(dts, ends, sec) {
  const stats = (values, duration) => {
    const sorted = [...values].sort((a, b) => a - b);
    const quantile = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null;
    let sumMs = 0, excessMs = 0, stalls = 0, longestMs = 0;
    for (const ms of values) {
      sumMs += ms; excessMs += Math.max(0, ms - 16.7);
      if (ms >= 100) { stalls++; longestMs = Math.max(longestMs, ms); }
    }
    return { n: values.length, median: quantile(0.5), p95: quantile(0.95), p99: quantile(0.99), max: quantile(1), sumMs,
      hitch: duration > 0 ? excessMs / duration : null, stalls: { count: stalls, longestMs } };
  };
  // 窓はコマの終了時刻で (開始, 終了]。コマごとにずらし、合計時間で選ぶ。
  // 初めと終わりの窓も含め、同じ合計なら先に現れた区間を残す。
  const width = Math.min(60, sec);
  let left = 0, sum = 0, bestSum = -1, bestLeft = 0, bestRight = 0, bestEnd = width;
  for (let right = 0; right < dts.length; right++) {
    const end = Math.max(width, ends[right]);
    sum += dts[right];
    while (left <= right && ends[left] <= end - width) sum -= dts[left++];
    if (sum > bestSum) { bestSum = sum; bestLeft = left; bestRight = right + 1; bestEnd = end; }
  }
  const measuredSec = dts.reduce((sum, ms) => sum + ms, 0) / 1000;
  const all = stats(dts, measuredSec);
  return {
    frameMs: { median: all.median, p95: all.p95, p99: all.p99, max: all.max, over30: dts.length ? +(dts.filter((x) => x > 30).length / dts.length).toFixed(3) : null },
    measuredSec, hitch: all.hitch, stalls: all.stalls,
    worst60: { startSec: Math.max(0, bestEnd - width), sec: width, complete: sec >= 60,
      ...stats(dts.slice(bestLeft, bestRight), width) },
  };
}

function thermalSummary(power, sec) {
  let seriousEntries = 0, seriousStart = null, maxSeriousSec = 0, critical = false, previous = null;
  const recovery = [];
  let knownSec = 0, pending = null;
  for (let i = 0; i < power.length; i++) {
    const p = power[i], at = Math.min(sec, Math.max(0, p.sec));
    const end = Math.min(sec, power[i + 1]?.sec ?? sec);
    if (p.thermal !== null) knownSec += Math.max(0, end - at);
    // 「かなり熱い」以上の連続を測る。「とても熱い」に上がっても途切れ扱いにしない。
    if (p.thermal >= 2 && seriousStart === null) { seriousEntries++; seriousStart = at; }
    if ((p.thermal === null || p.thermal < 2) && seriousStart !== null) {
      maxSeriousSec = Math.max(maxSeriousSec, at - seriousStart); seriousStart = null;
    }
    if (p.thermal === 3) critical = true;
    // 段階をさらに下げても、最初に描き込みを下げた時からの回復時間を測る。
    if (previous && p.level !== null && previous.level !== null && p.level > previous.level && pending === null) {
      pending = { startSec: at, seconds: null }; recovery.push(pending);
    }
    if (pending && p.thermal !== null && p.thermal <= 1) { pending.seconds = at - pending.startSec; pending = null; }
    previous = p;
  }
  if (seriousStart !== null) maxSeriousSec = Math.max(maxSeriousSec, sec - seriousStart);
  return { seriousEntries, maxSeriousSec, seriousOngoing: seriousStart !== null, critical,
    knownSec, complete: power.length > 0 && power.every(p => p.thermal !== null),
    loweredBeforeStart: (power[0]?.level ?? 0) > 0, recovery };
}

function assessRun(res) {
  // 戦の間の読み込み直しも越えて、片付け直後の同じ資源数を三戦分比べる。
  // 使用量の API がある端末では、描画資源に加えて実際のヒープのバイト数も比べる。
  const cleaned = res.battles.filter(b => b.cleanupMemory);
  const recent = cleaned.slice(-3).map(b => b.cleanupMemory);
  const keys = ['geometries', 'textures', 'programs'];
  const bytesMeasured = recent.length === 3 && recent.every(m => Number.isFinite(m.heapBytes));
  if (bytesMeasured) keys.push('heapBytes');
  const growing = recent.length === 3 ? keys.filter(k => recent[0][k] < recent[1][k] && recent[1][k] < recent[2][k]) : [];
  for (const r of res.battles) {
    const failures = [], w = r.worst60, th = r.thermal;
    r.memoryTrend = { samples: cleaned.length, checked: keys, growing, bytesMeasured,
      status: growing.length ? '増加' : recent.length < 3 ? '未計測' : bytesMeasured ? '安定' : '資源安定・使用量未計測' };
    if (!r.ok || r.error || r.errors?.length) failures.push('実行失敗');
    if (r.quality !== 'high') failures.push('画質');
    if (!r.frames || !w || !w.complete) failures.push('重区間未計測');
    if (w?.p95 > 33.3) failures.push('重区間九五％');
    if (w?.p99 > 50) failures.push('重区間九九％');
    if (r.stalls?.count > 0) failures.push('百ミリ秒停止');
    if (r.hitch == null || w?.hitch == null) failures.push('引っ掛かり未計測');
    else if (r.hitch > 25 || w.hitch > 25) failures.push('引っ掛かり再調整');
    else if (r.hitch > 15 || w.hitch > 15) failures.push('引っ掛かり');
    if (r.frameMs?.p95 == null) failures.push('全体未計測');
    else if (r.frameMs.p95 > 33.3) failures.push('全体九五％');
    if (!th?.complete) failures.push('熱未計測');
    if (th?.maxSeriousSec > 90) failures.push('高熱継続');
    if (th?.critical) failures.push('最高熱');
    if (!r.cleanupMemory || !bytesMeasured) failures.push('メモリ未計測');
    if (growing.length) failures.push('メモリ増加');
    r.failures = failures;
    r.verdict = failures.length ? failures.join('・') : '合格';
  }
}

// 部ごとの中央・95%・平均と、50ms超および全体の95%以上のコマの内訳。
// 部ごとの95%は別々のコマなので足せない。全体で選んだ同じ重いコマの平均も残す。
function profSum(dts, parts) {
  const out = {}, avg = (a) => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 0;
  const sorted = [...dts].sort((x, y) => x - y);
  const tailAt = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : Infinity;
  for (const k of PN) {
    const a = parts[k], n = Math.min(a.length, dts.length);
    const slowA = [], tailA = [];
    for (let i = 0; i < n; i++) { if (dts[i] > 50) slowA.push(a[i]); if (dts[i] >= tailAt) tailA.push(a[i]); }
    out[k] = { med: pct(a, 0.5), p95: pct(a, 0.95), avg: avg(a), slowAvg: avg(slowA), tailAvg: avg(tailA) };
  }
  return out;
}
