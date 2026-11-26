// 段（K580・11/24 Sanae）：対戦の段位の点（レーティング。始め 1000・server/online/src/core.js の rate）を、見える形の段にする。
//   足軽 → 組頭 → 侍大将 → 備大将 → 大名 → 天下人（docs/online_req_1120.md 47〜52）。各段は三つの階（三・二・一）に分け、一つ上がると次の段。
//   描かない・通信しない決まりだけの部品。相手探し（sagashi_ui）・試合の後の札（match_link）・ホームが同じ関数を読む。
const KAN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
// lo＝その段に入る点。足軽は 1000 未満も足軽（下は 850 を底に数える）
export const TIERS = Object.freeze([
  { id: 'ashigaru', ja: '足軽', en: 'Ashigaru', lo: 850, col: '#9a8f78', mon: 1 },
  { id: 'kumigashira', ja: '組頭', en: 'Kumigashira', lo: 1100, col: '#6fa86a', mon: 2 },
  { id: 'samurai', ja: '侍大将', en: 'Samurai-taisho', lo: 1250, col: '#4f93d6', mon: 3 },
  { id: 'sonae', ja: '備大将', en: 'Sonae-taisho', lo: 1450, col: '#a46ad0', mon: 4 },
  { id: 'daimyo', ja: '大名', en: 'Daimyo', lo: 1700, col: '#e0a23a', mon: 5 },
  { id: 'tenka', ja: '天下人', en: 'Tenkabito', lo: 2000, col: '#e2493a', mon: 6 },
]);
export const START_RATING = 1000;
const STEPS = 3;   // 一つの段の階の数（三が下・一が上）

/** 点 → { tier（段）, idx（0〜5）, step（3〜1・天下人は 0）, lo, hi（この階の始めと次の階の始め）, progress（0〜1・次の階まで）, next（次の階の名か null）, rating } */
export function tierOf(r) {
  r = Math.round(Number(r)); if (!Number.isFinite(r)) r = START_RATING;
  let idx = 0; for (let i = TIERS.length - 1; i >= 0; i--) if (r >= TIERS[i].lo) { idx = i; break; }
  const tier = TIERS[idx], top = idx === TIERS.length - 1;
  if (top) return { tier, idx, step: 0, lo: tier.lo, hi: null, progress: 1, next: null, rating: r };
  const w = (TIERS[idx + 1].lo - tier.lo) / STEPS, k = Math.min(STEPS - 1, Math.max(0, Math.floor((r - tier.lo) / w)));
  const lo = Math.round(tier.lo + w * k), hi = Math.round(tier.lo + w * (k + 1));
  return { tier, idx, step: STEPS - k, lo, hi, progress: Math.max(0, Math.min(1, (r - lo) / Math.max(1, hi - lo))), next: k === STEPS - 1 ? TIERS[idx + 1].ja : `${tier.ja}${KAN[STEPS - k - 1]}`, rating: r };
}
/** 見える名：足軽三・組頭一・天下人 */
export const rankName = (r, en = false) => { const t = tierOf(r); const n = en ? t.tier.en : t.tier.ja; return t.step ? (en ? `${n} ${t.step}` : `${n}${KAN[t.step]}`) : n; };
/** 前と後で段（階）が上がった・下がった・同じ：+1／-1／0（階の差でなく、階を一つ跨いだ向き） */
export function moveOf(before, after) {
  const a = tierOf(before), b = tierOf(after), ka = a.idx * 10 + (10 - a.step), kb = b.idx * 10 + (10 - b.step);
  return { dir: kb > ka ? 1 : kb < ka ? -1 : 0, tierUp: b.idx > a.idx, tierDown: b.idx < a.idx, from: a, to: b, delta: Math.round(after) - Math.round(before) };
}
/** 英語（addEn の表）：足軽三 → Ashigaru 3 */
export const RANK_EN = [...TIERS.flatMap((t) => [[t.ja, t.en], ...[1, 2, 3].map((s) => [`${t.ja}${KAN[s]}`, `${t.en} ${s}`])])];

// ---- 同じ兵力・同じ Cost（ランク戦。金で勝てない・docs/online_req_1120.md 98〜105）----
//   ランク戦では、武将の格に関わらず一人の兵は同じ（RANKED_TROOPS）。格の差は Cost（総大将を除く家臣の合計の上限）で釣り合わせる。
//   能力（得意な兵種・戦法）の違いだけが残る。編成の画面が使う Cost の上限は hensei_ui.capOf（4将65・5将80・6将95…）
export const RANKED_TROOPS = 1000;
export const rankedCap = (n) => ({ 4: 65, 5: 80, 6: 95 }[n] || 65 + 15 * Math.max(0, n - 4));
/** 家臣（二番目から）の Cost 合計が上限の内か：{ ok, cost, cap, troops（総兵力） } */
export function rankedCheck(generals, costOf) {
  const g = (generals || []).filter(Boolean), cap = rankedCap(g.length);
  const cost = g.slice(1).reduce((s, n) => s + (costOf(n) || 0), 0);
  return { ok: cost <= cap && g.length >= 1, cost, cap, troops: g.length * RANKED_TROOPS };
}
