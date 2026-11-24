// 金を足す（登用の金・K583/K588）のアプリの購入の口。33・11/21 クラウド k365-cloud-33（決まりの照らしは 45）。
//   流れ（取引を落とさない・二重にしない）：
//     ① buyKin(pack) → アプリへ { op:'buyKin', pid, rid } を送る（webkit.messageHandlers.iap・Android は AndroidIap。見た目の品と同じ橋）
//     ② アプリは StoreKit で買い、取引を「終えずに」 window.__iapKin({ rid, pid, txId }) で返す（取りやめ { rid, cancelled:true }・失敗 { rid, error }）
//     ③ 画面は creditPurchase(st, pack, txId)（toyo_rules・取引の id ごとに一度だけ）→ 保存 → finish() で { op:'finishKin', txId } を送り、アプリが取引を終える
//     ④ 閉じて終わらなかった取引は、アプリが起動の時に __iapKin({ pid, txId, redeliver:true }) で届け直す。setKinSink の受け口が
//        持ち物の箱を読んで足し・保存してから終える（同じ txId は足さずに終えるだけ）
//   Web：買い場は無い（false）。?kintest=1 の時だけ試しの口（アプリと同じ①〜④を localStorage の「終わっていない取引」で真似る）。
//   商品の番号はここ一か所（KIN_PRODUCTS）。実の登録は kaito が App Store Connect で（docs/iap_kin_1121.md）。
import { PACKS } from './toyo_rules.js';
import { addKan } from '../state.js';

const PID_HEAD = 'jp.kaito.sengokurisshin.';   // 完全版・章の品（paywall.js）と同じ頭
// 小判だけを現金で買える。
export const KIN_PRODUCTS = [
  ...PACKS.map((p) => ({ id: p.id, pid: PID_HEAD + p.id, name: '小判', type: 'consumable', yen: p.yen })),
];
export const pidOf = (id) => KIN_PRODUCTS.find((k) => k.id === id)?.pid || null;
export const packOfPid = (pid) => { const k = KIN_PRODUCTS.find((q) => q.pid === pid); return k ? PACKS.find((p) => p.id === k.id) : null; };

// 小判100枚を銭1,000文に替える。保存は呼び出し側で行う。
export function exchangeKobanForZeni(st, G) {
  if (!st || !G || !Number.isFinite(st.kin) || st.kin < 100 || (G.kan != null && !Number.isFinite(G.kan))) return false;
  st.kin -= 100;
  addKan(G, 1);
  return true;
}

const W = typeof window !== 'undefined' ? window : null;
const bridge = () => {
  try {
    if (W?.__androidApp && W.AndroidIap) return (m) => W.AndroidIap.postMessage(JSON.stringify(m));
    const h = W?.webkit?.messageHandlers?.iap; if (h) return (m) => h.postMessage(m);
  } catch (e) { /* 橋が無い */ }
  return null;
};
const testMode = () => { try { return !!(W && (W.__kinTest || /[?&]kintest=1/.test(W.location?.search || ''))); } catch (e) { return false; } };
export const canBuyKin = () => !!bridge() || testMode();

// ---- 試しの口（Web）：アプリの StoreKit を真似る。終わっていない取引は localStorage に残り、読み込み直しで届き直す ----
const TKEY = 'risshin_kin_test_unfinished';
const tRead = () => { try { return JSON.parse(localStorage.getItem(TKEY) || '[]'); } catch (e) { return []; } };
const tWrite = (a) => { try { localStorage.setItem(TKEY, JSON.stringify(a)); } catch (e) { /* 持てない */ } };
const testPost = (m) => {
  if (m.op === 'buyKin') {
    const tx = { pid: m.pid, txId: `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` };
    tWrite([...tRead(), tx]);   // 買えた（まだ終えていない）
    const act = W?.__kinTestAction || 'ok';   // 試しで 'cancel'・'error' を選べる
    setTimeout(() => W.__iapKin(act === 'ok' ? { rid: m.rid, ...tx } : act === 'cancel' ? { rid: m.rid, cancelled: true } : { rid: m.rid, error: '試しの失敗' }), 30);
    if (act !== 'ok') tWrite(tRead().filter((t) => t.txId !== tx.txId));
  } else if (m.op === 'finishKin') tWrite(tRead().filter((t) => t.txId !== m.txId));
  else if (m.op === 'kinPending') setTimeout(() => { for (const t of tRead()) W.__iapKin({ ...t, redeliver: true }); }, 0);
  else if (m.op === 'kinPrices') setTimeout(() => {   // 試しで W.__kinTestPrices＝'none'（店に品が無い）・'error'（つながらない）・'late'（三秒後）を選べる
    const mode = W.__kinTestPrices, all = Object.fromEntries(KIN_PRODUCTS.map((k) => [k.pid, `¥${k.yen.toLocaleString('ja-JP')}`]));
    if (mode === 'error') return W.__iapKin({ pricesError: 'network' });
    if (mode === 'none') return W.__iapKin({ prices: {} });
    if (mode === 'late') return setTimeout(() => W.__iapKin({ prices: all }), 3000);
    W.__iapKin({ prices: all });
  }, 0);
  else if (m.op === 'restoreKin') setTimeout(() => { let a = []; try { a = JSON.parse(localStorage.getItem(TKEY + '_owned') || '[]'); } catch (e) { /* 無い */ } W.__iapKin({ restored: a }); }, 30);
};
const post = (m) => { const b = bridge(); if (b) return b(m); if (testMode()) return testPost(m); throw new Error('no bridge'); };

// ---- ①② 買う ----
const waiting = new Map();
let rid = 0;
export let lastKinError = null;
// 返り値：買えたら { txId, pid, finish }（finish は保存の後に呼ぶ）。取りやめ・失敗・橋が無い時は false
export function buyKin(pack) {
  const pid = pidOf(pack?.id);
  lastKinError = null;
  if (!pid || !canBuyKin()) { lastKinError = pid ? 'noStore' : 'noProduct'; return Promise.resolve(false); }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { lastKinError = 'offline'; return Promise.resolve(false); }   // 通信が無い時は待たずに知らせる
  const r = ++rid;
  try { window.risshinMetrics?.kinBuyTap?.({ pid }); } catch (e) {}
  return new Promise((done) => {
    const timer = setTimeout(() => { waiting.delete(r); lastKinError = 'timeout'; done(false); }, 120000);   // 返事が無い時は待ちを解く（後で届けば ④ で足す）
    waiting.set(r, { pid, done, timer });
    try { post({ op: 'buyKin', pid, rid: r }); } catch (e) { clearTimeout(timer); waiting.delete(r); lastKinError = 'noStore'; done(false); }
  });
}
export const finishKin = (txId) => { try { if (txId) post({ op: 'finishKin', txId }); } catch (e) { /* 次の起動でまた届く */ } };

// ---- 値段（App Store の値。届くまでは表の円）と購入の復元（自動で更新しない購読＝月次の軍資金・シーズンの帳） ----
const prices = {};
export const priceOf = (id) => prices[pidOf(id)] || null;
// 値段の届き具合（33 11/21）：'web'＝橋が無い・'waiting'＝店へ聞いて返事待ち・'ok'＝値段が届いた・'missing'＝店は答えたがこの品が無い
//   （App Store Connect に無い・その国で売っていない＝押しても買えないので札を押せなくする）・'error'＝店へつながらない（押せば店の画面が訳を出す）
let pricesAsked = 0, pricesAnswered = false, pricesError = null;
export function kinState(id) {
  if (!canBuyKin()) return 'web';
  if (priceOf(id)) return 'ok';
  if (pricesError) return 'error';
  return pricesAnswered ? 'missing' : 'waiting';
}
// 買い場を開いた時に呼ぶ：まだ届いていない・前の答えが古い（十分）・つながらなかった時は聞き直す
export function refreshPrices() {
  if (!canBuyKin()) return false;
  if (pricesAnswered && !pricesError && Date.now() - pricesAsked < 600000) return false;
  if (Date.now() - pricesAsked < 5000) return false;   // 描き直し→聞き直し→答え→描き直しの輪にしない（つながらない時の店の答えで回り続けない）
  pricesAsked = Date.now();
  try { post({ op: 'kinPrices' }); return true; } catch (e) { return false; }
}
let restoring = null;
// 返り値：[{ pid, txId, date }]（今も有効な購読の取引）か false
export function restoreKin() {
  if (restoring) return restoring.promise;
  if (!canBuyKin()) return Promise.resolve(false);
  let done; const promise = new Promise((r) => { done = r; });
  const timer = setTimeout(() => { restoring = null; lastKinError = 'timeout'; done(false); }, 60000);
  restoring = { promise, done, timer };
  try { post({ op: 'restoreKin' }); } catch (e) { clearTimeout(timer); restoring = null; done(false); }
  return promise;
}

// ---- ④ 届き直しの受け口（index.js が持ち物の箱をつなぐ）。sink(pack, txId) は足して保存まで済ませて true を返す ----
let sink = null;
const early = [];
export function setKinSink(fn) {
  sink = fn;
  while (early.length) deliver(early.shift());
  try { post({ op: 'kinPending' }); pricesAsked = Date.now(); post({ op: 'kinPrices' }); } catch (e) { /* 橋が無い */ }   // 起動の後に、終わっていない取引と値段を送ってもらう
}
function deliver(o) {
  const pack = packOfPid(o.pid);
  if (!pack) return;               // 知らない品は終えない（品の表を直した後に届き直す）
  if (!sink) { early.push(o); return; }
  let saved = false;
  try { saved = sink(pack, o.txId) !== false; } catch (e) { saved = false; }
  if (saved) finishKin(o.txId);
}

if (W) {
  W.__iapKin = (o) => {
    if (!o) return;
    if (o.prices || o.pricesError) {
      if (o.prices) { for (const k of Object.keys(prices)) delete prices[k]; Object.assign(prices, o.prices); }   // 店の答えは毎回全部の品の表（前の答えの値段を残すと、店から消えた品が買えそうに見える）
      pricesAnswered = true; pricesError = o.pricesError || null;
      try { W.dispatchEvent(new CustomEvent('risshin-kin-prices')); } catch (e) { /* 古い端末 */ }   // 開いている買い場が描き直す
    }
    if ((o.restored || o.restoreError) && restoring) { const r = restoring; restoring = null; clearTimeout(r.timer); if (o.restoreError) lastKinError = o.restoreError; r.done(Array.isArray(o.restored) ? o.restored : false); return; }
    const w = o.rid != null ? waiting.get(o.rid) : null;
    if (w && !o.redeliver) {
      waiting.delete(o.rid); clearTimeout(w.timer);
      if (o.cancelled) { lastKinError = 'cancel'; return w.done(false); }
      if (o.error || !o.txId) { lastKinError = o.error || 'error'; return w.done(false); }
      return w.done({ txId: o.txId, pid: o.pid, finish: () => finishKin(o.txId) });
    }
    if (o.txId && !o.cancelled && !o.error) deliver(o);   // 待っていない時の返事（時間切れの後・起動時の届き直し）
  };
}
