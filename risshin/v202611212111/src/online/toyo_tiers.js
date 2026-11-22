// 武将登用の商品の段（K604・docs/kaito_gacha_tiers_1121.md・登用の画面の持ち主 k598-toyo・11/21）。値は仮（運営の試しで決める）。
//   通常登用 小判100：3人・3人とも R 以上・1人を選ぶ
//   上級登用 小判1,000：10人・S 以上が1人は必ず（その枠は SS に上がる事がある）・1人を選ぶ
//   特選登用 小判3,000：10人とも S 以上・SS が3人以上・2人を選ぶ
//   無料登用は toyo_rules.js の pull(st, 'free')（毎日5回）のまま。引いた候補は st.tierPending に残す（閉じても続きから選べる）。
//   率と保証の数は tierRates で買う前に見られる（Apple・CESA）。確定の前なら選び直せる（confirmPicks が確定）。
import { BUSHOU_ONLINE, BUSHOU_BY_ID } from './bushou_online.js';
import { RATES, PITY, PITY_CYCLE, choose } from './toyo_rules.js';

export const TIERS = [
  { id: 'normal', name: '通常登用', cost: 100, cands: 3, picks: 1, line: 'R以上3名 1名選択', say: '3名が出現。3名とも R 以上。その中から1名を登用できます' },
  { id: 'joukyu', name: '上級登用', cost: 1000, cands: 10, picks: 1, line: '10名出現 S以上1名確定 1名を選択', say: '10名が出現。S 以上が1名は必ず入ります。その中から1名を登用できます' },
  { id: 'tokusen', name: '特選登用', cost: 3000, cands: 10, picks: 2, line: 'S以上10名 SS3名以上確定 2名登用可能', say: '10名が出現。10名とも S 以上で、SS が3名以上入ります。その中から2名を登用できます' },
];
export const tierOf = (id) => TIERS.find((t) => t.id === id) || null;
const SS_UP = 0.15;   // 上級の保証枠が SS になる率・特選の残り枠が SS になる率（仮）
const poolOf = (rank) => BUSHOU_ONLINE.filter((b) => b.rank === rank);
const pickRank = (rates, rng) => { let r = rng(), acc = 0, last = null; for (const k of ['N', 'R', 'A', 'S', 'SS']) { if (!rates[k]) continue; acc += rates[k]; last = k; if (r < acc) return k; } return last; };

// 候補の人選び（同じ人は並べない。指定の格の池が尽きたら一つ下の格から）
function take(rank, used, rng, banner) {
  const order = ['SS', 'S', 'A', 'R', 'N'];
  for (let i = order.indexOf(rank); i < order.length; i++) {
    const pool = poolOf(order[i]).filter((b) => !used.has(b.id));
    if (!pool.length) continue;
    // 目当て（banner.pickup）が SS の枠に出る率は今までと同じ半分
    if (order[i] === 'SS' && banner.pickup && BUSHOU_BY_ID[banner.pickup]?.rank === 'SS' && !used.has(banner.pickup) && rng() < 0.5 && BUSHOU_BY_ID[banner.pickup]) { used.add(banner.pickup); return BUSHOU_BY_ID[banner.pickup]; }
    const b = pool[Math.floor(rng() * pool.length)]; used.add(b.id); return b;
  }
  return null;
}
export function rollTier(tierId, rng = Math.random, banner = {}) {
  const used = new Set(); const ranks = [];
  if (tierId === 'normal') for (let i = 0; i < 3; i++) ranks.push(pickRank(RATES.paid, rng));
  else if (tierId === 'joukyu') { ranks.push(rng() < SS_UP ? 'SS' : 'S'); for (let i = 0; i < 9; i++) ranks.push(pickRank(RATES.paid, rng)); }
  else if (tierId === 'tokusen') { for (let i = 0; i < 3; i++) ranks.push('SS'); for (let i = 0; i < 7; i++) ranks.push(rng() < SS_UP ? 'SS' : 'S'); }
  else return [];
  // 高い格から先に埋める（池が尽きた時に下へ落ちるのが低い格の方になるように）
  const idx = ranks.map((r, i) => i).sort((a, b) => ['N', 'R', 'A', 'S', 'SS'].indexOf(ranks[b]) - ['N', 'R', 'A', 'S', 'SS'].indexOf(ranks[a]));
  const out = new Array(ranks.length);
  for (const i of idx) out[i] = take(ranks[i], used, rng, banner);
  return out.filter(Boolean);
}

// 買う：小判を引いて候補を残す。足りなければ { ok:false, why:'kin', need }。天井の数えは買うごとに一つ（段で変えない）
export function pullTier(st, tierId, rng = Math.random, banner = {}) {
  const t = tierOf(tierId); if (!t) return { ok: false, why: 'tier' };
  if (!(st.kin >= t.cost)) return { ok: false, why: 'kin', need: t.cost - (st.kin || 0) };
  st.kin -= t.cost;
  const cands = rollTier(tierId, rng, banner);
  const got = [];
  st.pity = (st.pity || 0) + 1;
  for (const p of PITY) if (st.pity === p.at) { st.tickets[p.ticket] = (st.tickets[p.ticket] || 0) + 1; got.push(p); }
  if (st.pity >= PITY_CYCLE) st.pity = 0;
  st.tierPending = { tierId, ids: cands.map((b) => b.id), got: got.map((g) => g.label) };
  return { ok: true, tierId, cands, picks: t.picks, got, cost: t.cost };
}
// 閉じる前に選び終えなかった段の候補（続きから）
export function tierPendingNow(st) {
  const p = st.tierPending; if (!p) return null;
  const t = tierOf(p.tierId); const cands = (p.ids || []).map((id) => BUSHOU_BY_ID[id]).filter(Boolean);
  if (!t || cands.length < t.picks) { st.tierPending = null; return null; }
  return { tierId: p.tierId, cands, picks: t.picks, got: (p.got || []).map((label) => ({ label })) };
}
// 確定：選んだ人（picks の数だけ）を登用する。残りは見送り。選び方が違えば何も起きない（null）
export function confirmPicks(st, ids, banner = {}) {
  const p = st.tierPending; if (!p) return null;
  const t = tierOf(p.tierId); const uniq = [...new Set(ids)];
  if (!t || uniq.length !== t.picks || !uniq.every((id) => p.ids.includes(id))) return null;
  const res = uniq.map((id) => choose(st, BUSHOU_BY_ID[id], banner));
  st.tierPending = null;
  return res;
}
// 登用「しない」：回数（小判）は使ったまま、この候補からは誰も取らない
export function declineTier(st) { const had = !!st.tierPending; st.tierPending = null; return had; }

// 提供割合（買う前に見られる）。保証の枠と、保証の外の枠の率を分けて返す
export function tierRates(tierId) {
  const t = tierOf(tierId); if (!t) return null;
  const P = RATES.paid; const pc = (v) => `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%`;
  const row = (r) => Object.keys(r).filter((k) => r[k]).reverse().map((k) => `${k} ${pc(r[k])}`).join('・');
  if (t.id === 'normal') return { t, groups: [{ label: '3名それぞれ（N は出ません）', text: row(P) }] };
  if (t.id === 'joukyu') return { t, groups: [{ label: '保証の枠 1名（S 以上）', text: `S ${pc(1 - SS_UP)}・SS ${pc(SS_UP)}` }, { label: '残りの 9名それぞれ', text: row(P) }] };
  return { t, groups: [{ label: '保証の枠 3名', text: 'SS 100%' }, { label: '残りの 7名それぞれ（S 以上）', text: `S ${pc(1 - SS_UP)}・SS ${pc(SS_UP)}` }] };
}
// 候補の一覧（［候補武将一覧］）：その段で出うる武将を格ごとに
export function tierPool(tierId) {
  const ranks = tierId === 'tokusen' ? ['SS', 'S'] : tierId === 'joukyu' ? ['SS', 'S', 'A', 'R'] : ['SS', 'S', 'A', 'R'];
  return ranks.map((r) => ({ rank: r, list: poolOf(r) }));
}
