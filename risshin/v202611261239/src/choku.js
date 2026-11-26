// 直属兵（K598・docs/home_economy_1121.md の頭の修正版「死んだ直属の兵は戻らない。戦後 直属兵 43/60 → 問屋で17人補充」）。
//   直属兵＝組の名簿（G.roster の生きている者）。上限は位の組の人数（state.js RANKS の squad：雑兵 0・足軽 5/15・足軽大将 20・侍大将 30）。
//   位が上がって増えた枠は一度だけ無料で埋まる（G.chokuGiven＝無料で渡した枠の数）。討たれた分は問屋で雇い直す（tonya_ui.js）。
//   練習・信長・侍大将の試し・bot の流しは今まで通り無料で全部埋める（bot は買い物をしないので）。
import { RANKS, newRecruit, fillRoster } from './state.js';

export const CHOKU_KINDS = {
  spear: { name: '槍足軽', one: 50, pack: 10, packCost: 500, minRank: 1 },
  bow: { name: '弓足軽', one: 70, pack: 10, packCost: 700, minRank: 1 },
  gun: { name: '鉄砲足軽', one: 100, pack: 10, packCost: 1000, minRank: 2 },
  cavalry: { name: '騎馬兵', one: 240, pack: 5, packCost: 1200, minRank: 3 },
};
const W = typeof window !== 'undefined' ? window : null;
export const chokuFree = (G) => !G || G.practice || G.lord || G.trialStep != null
  || !!(W && (W.__autoplayUnlock || /[?&](bot|autoplay)/.test(W.location?.search || '')));
export const chokuCap = (G) => (RANKS[G?.rank] || RANKS[0]).squad || 0;
export const chokuAlive = (G) => (G?.roster || []).filter((r) => r.alive).length;
export const chokuNeed = (G) => Math.max(0, chokuCap(G) - chokuAlive(G));
// 銭は G.kan（貫）。問屋の画面では文の数で「銭 4,850」と書く（一貫＝千文）
export const zeniOf = (G) => Math.round((G?.kan || 0) * 1000);
export const kanOfZeni = (z) => Math.round(z) / 1000;
// 不足分を一括で補充する値（槍と弓を組の割合で。弓は三戦目から）
export function refillPlan(G, need = chokuNeed(G)) {
  const bows = (G.battle || 0) >= 2 ? Math.round(need * (G.bowRatio ?? 0.33)) : 0;
  return { spear: need - bows, bow: bows, cost: (need - bows) * CHOKU_KINDS.spear.one + bows * CHOKU_KINDS.bow.one };
}
export function chokuAdd(G, kind, n) {
  G.roster = (G.roster || []).filter((r) => r.alive);
  const added = [];
  for (let i = 0; i < n; i++) { const r = newRecruit(G, kind); G.roster.push(r); added.push(r); }
  return added;
}
// 城下へ戻った時・次の戦の前（main.js refillSquad）：埋めてよい人数の上限。null＝今まで通り全部埋める
export function chokuFillTo(G, n) {
  if (chokuFree(G)) return null;
  if (G.chokuGiven == null) { G.chokuGiven = n; return null; }   // 前からの保存は一度だけ今まで通り満たしてから、新しい決まりへ
  const alive = chokuAlive(G);
  if (n > G.chokuGiven) { const extra = n - G.chokuGiven; G.chokuGiven = n; return Math.min(n, alive + extra); }
  return alive;
}
// 戦の組（battle.js makeSquad）：欠けた直属兵の分だけ、この戦に出る組の人数を減らす（一度だけ）
export function chokuCut(G, list) {
  if (chokuFree(G) || G.chokuGiven == null) return list;
  let cut = chokuNeed(G);
  if (!cut) return list;
  const out = list.map((s) => ({ ...s }));
  for (const kind of ['spear', 'bow', 'gun', 'cavalry']) for (const s of out) {
    if (!cut || s.kind !== kind && !(kind === 'spear' && !s.kind) || s.members) continue;
    const k = Math.min(cut, s.n || 0); s.n -= k; cut -= k;
  }
  return out;
}
// 名簿を埋める口（main.js の戦の始めと refillSquad）：今まで通りなら全部、新しい決まりなら位で増えた枠だけ。bowsOf(k)＝k人のうち弓の数
export function chokuTopUp(G, n, bowsOf) {
  const to = chokuFillTo(G, n);
  if (to == null) { const b = bowsOf(n); return fillRoster(G, n - b, b); }
  const k = Math.max(0, to - chokuAlive(G)), kb = bowsOf(k);
  return [...chokuAdd(G, 'bow', kb), ...chokuAdd(G, 'spear', k - kb)];
}
