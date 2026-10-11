// 端末で毎晩自動で遊ばせて、手触りとカクつきを測る入口（iOS アプリの起動引数 -autoplay id,id か、?autoplay=id,id）。
// 遊ぶ時だけ動く。bot（playbot.js の brain）が本番の絵の輪のまま遊び、コマの時間と、触ってから動くまでを記録する。
// 結果は window.webkit.messageHandlers.autoplay（アプリが書類の autoplay.json に書く）か、無ければ window.__autoplayResult へ。
import { newGame, fillRoster, RANKS, BATTLES } from './state.js';
import { brain } from './playbot.js';
import { S } from './settings.js';
import { HSTAT } from './humans.js';
import { botInput } from './bot_input.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1); };
const MAX_SEC = 150;   // 一つの戦で遊ぶ実時間の上限

function post(o) {
  window.__autoplayResult = o;
  try { window.webkit.messageHandlers.autoplay.postMessage(JSON.stringify(o)); } catch (e) { /* ブラウザでは postMessage 先が無い */ }
}

export async function run(game, ids) {
  await import('./battles.js');
  const res = { start: new Date().toISOString(), ua: navigator.userAgent, dpr: devicePixelRatio, screen: [innerWidth, innerHeight], battles: [], done: false };
  game.noLock = true;
  for (const id of ids) {
    const i = BATTLES.findIndex((b) => b.id === id);
    const r = { id, ok: false };
    res.battles.push(r);
    if (i < 0) { r.error = '戦が見つからない'; continue; }
    try { await playOne(game, i, r); } catch (e) { r.error = String(e && e.message || e).slice(0, 120); }
    post(res);
  }
  res.done = true; res.end = new Date().toISOString();
  post(res);
}

// 部ごとの時間（1コマに足し合わせ、コマごとに配列へ）。入れ子の render は一番外側だけ数える。
const AM = ['think', 'act', 'bodies', 'collide', 'animate', 'updateImpostors', 'updateBullets', 'updateArrows', 'updateSmoke', 'updateParticles', 'updateStains', 'updateFalling', 'updateLooseHorses', 'updateGroups', 'duelTick', 'groundTick', 'rebuildGrid', 'rideCheck', 'leaveField'];
const BM = ['updateArmyAids', 'updateSquadAids', 'updateCouriers', 'updateFences', 'updateReserves', 'updateHold'];
const PN = ['update', 'army', 'world', 'ai', 'hud', 'humans', 'render', ...AM.map((k) => 'a.' + k), ...BM.map((k) => 'b.' + k), 'p.update', 'p.cam'];
function profInstall(game, b) {
  const cur = {}; PN.forEach((k) => { cur[k] = 0; });
  cur.calls = cur.tris = 0;
  const undo = [];
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
      finally { depth--; cur.render += performance.now() - t; const i = rd.info.render; cur.calls = i.calls; cur.tris = i.triangles; }
    };
    rd.render = w;
    undo.push(() => { if (rd.render === w) rd.render = f; });
  }
  // 描画器は次の戦でも使うので、前の戦の記録先を残さない。
  return { cur, dispose() { for (const restore of undo) restore(); } };
}

async function playOne(game, i, r) {
  const G = newGame('bot', 'normal', 'oda');
  G.practice = true; G.rank = 2; G.aijirushi = 'maru'; G.owned.push('katana');
  const n = RANKS[G.rank].squad;
  if (n) fillRoster(G, n - Math.round(n / 3), Math.round(n / 3));
  game.G = G; game.lastError = '';
  game.startBattle(i);
  for (let k = 0; k < 240 && !game.battle && !game.lastError; k++) await wait(250);
  const b = game.battle;
  if (!b) { r.error = game.lastError || '戦の支度が終わらない'; return; }
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
  const dts = [], lat = [];
  let last = performance.now(), run = true, slow = 0;
  const frame = (t) => {
    if (!run) return;
    if (!game.paused && !document.hidden) { const d = t - last; if (d < 1000) { dts.push(d); if (d > 50) slow++; for (const k of PN) parts[k].push(cur[k]); } }
    for (const k of PN) cur[k] = 0;
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
  const t0 = performance.now(), bt0 = b.t;
  try {
    while (!b.over && !b.ended && game.battle === b && performance.now() - t0 < MAX_SEC * 1000) {
      if (game.paused) game.paused = false;
      await wait(500);
    }
    run = false; clearInterval(tapTimer);
    const sec = (performance.now() - t0) / 1000;
    Object.assign(r, {
      ok: true, realSec: +sec.toFixed(1), battleSec: +(b.t - bt0).toFixed(1), ended: !!(b.ended || b.over), frames: dts.length,
      frameMs: { median: pct(dts, 0.5), p95: pct(dts, 0.95), max: pct(dts, 1) }, slowFrames: slow,
      fps: +(dts.length / Math.max(1, sec)).toFixed(1), tapMs: { n: lat.length, median: pct(lat, 0.5), max: pct(lat, 1) },
      prof: profSum(dts, parts),
      hp: Math.round(b.player.u.hp), resScale: game.perf ? game.perf().res : null, quality: S.quality, calls: cur.calls, tris: cur.tris,
    });
  } finally {
    run = false; clearInterval(tapTimer);
    b.update = orig; prof.dispose();
    if (game.battle === b) game.stopBattle && game.stopBattle();
  }
}

// 部ごとの中央・95%・平均と、50ms 超のコマの平均（重いコマで何が膨らむか）
function profSum(dts, parts) {
  const out = {}, avg = (a) => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 0;
  for (const k of PN) {
    const a = parts[k], n = Math.min(a.length, dts.length);
    const slowA = []; for (let i = 0; i < n; i++) if (dts[i] > 50) slowA.push(a[i]);
    out[k] = { med: pct(a, 0.5), p95: pct(a, 0.95), avg: avg(a), slowAvg: avg(slowA) };
  }
  return out;
}
