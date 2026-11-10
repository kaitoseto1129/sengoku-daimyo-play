// 外（iOS アプリの Swift）との橋：iCloud の写しと Game Center。ブラウザでは何もしない。
// iCloud：保存・図鑑・お題などの localStorage の鍵を、iCloud の鍵と値の置き場に写す（state.js には触らない）。
// Game Center：実績の解除と手柄の点のランキング。ID は docs/gamecenter_1101.md。
const H = (n) => (typeof window !== 'undefined' && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers[n]) || null;
const MIRROR = /^(sengoku-risshin|risshin\.)/;
const SKIP = /settings|hints|icloud-at|-bak$/;   // 控えの写しは iCloud の 1MB を食うので写さない
export const GC_BOARD = 'risshin.merit';
export const gcAchId = (id) => `risshin.ach.${id}`;
export function gcUnlock(id) { try { const h = H('gamecenter'); if (h) h.postMessage({ op: 'ach', id: gcAchId(id) }); } catch (e) { /* 失敗しても遊びを止めない */ } }
export function gcScore(pt) { try { const h = H('gamecenter'); if (h && pt > 0) h.postMessage({ op: 'score', board: GC_BOARD, value: Math.round(pt) }); } catch (e) { /* 同上 */ } }
export function gcShow(board) { try { const h = H('gamecenter'); if (h) h.postMessage(board ? { op: 'show', board } : { op: 'show' }); } catch (e) { /* 同上 */ } }
// 戦ごとの順位表（11/2）：討った数（多いほど上）と、早く勝った時間（秒・短いほど上。勝った時だけ）
export const gcKillsBoard = (id) => `risshin.kills.${id}`;
export const gcTimeBoard = (id) => `risshin.time.${id}`;
export function gcBattle(id, kills, sec, win) {
  try {
    const h = H('gamecenter');
    if (!h || !id) return;
    if (kills > 0) h.postMessage({ op: 'score', board: gcKillsBoard(id), value: Math.round(kills) });
    if (win && sec > 0) h.postMessage({ op: 'score', board: gcTimeBoard(id), value: Math.max(1, Math.round(sec)) });
  } catch (e) { /* 同上 */ }
}
export const hasGameCenter = () => !!H('gamecenter');
export const hasICloud = () => !!H('icloud');

function snapshot() {
  const o = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (MIRROR.test(k) && !SKIP.test(k)) o[k] = localStorage.getItem(k); } } catch (e) { /* 読めない時は写さない */ }
  return o;
}
let timer = 0;
// 保存した後に呼ぶ。続けて呼んでも 3 秒に一度だけ写す
export function icloudPush() {
  if (!H('icloud') || timer) return;
  timer = setTimeout(() => {
    timer = 0;
    try { H('icloud').postMessage({ op: 'push', at: Date.now(), data: snapshot() }); localStorage.setItem('risshin.icloud-at', String(Date.now())); } catch (e) { /* 写せなくても遊べる */ }
  }, 3000);
}
// Swift が起動時に window.__icloudPull({at, data}) を呼ぶ。この機種に保存が無い時だけ戻す（今の進みを上書きしない）
export function icloudInit() {
  if (typeof window === 'undefined') return;
  window.__icloudPull = (p) => {
    try {
      if (!p || !p.data) return false;
      const has = Object.keys(snapshot()).some((k) => /save-v1/.test(k));
      if (has) return false;
      for (const [k, v] of Object.entries(p.data)) if (MIRROR.test(k) && !SKIP.test(k) && typeof v === 'string') localStorage.setItem(k, v);
      return true;
    } catch (e) { return false; }
  };
  const h = H('icloud');
  if (h) { try { h.postMessage({ op: 'pull' }); } catch (e) { /* 同上 */ } }
  addEventListener('pagehide', icloudPush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) icloudPush(); });
}
