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
// 主兵種（K601 3〜5）：槍・騎馬・鉄砲・弓。表の fav（得意の型）から読む。弓は小早川隆景のように名で決める
const ARM_BY_NAME = { 小早川隆景: '弓' };
export const armOf = (b) => b.arm || ARM_BY_NAME[b.name] || ({ teppo: '鉄砲', kiba: '騎馬', yari: '槍', shubi: '槍', std: '槍' }[b.fav || 'std'] || '槍');
// K624①：兵種登用（騎馬武将登用・鉄砲武将登用…）。上級と同じ形（10名・S以上1名確定・1名を選択・小判1,000）で、10名とも その兵種だけ。
//   出せる兵種は、10名そろい S 以上が一人はいる兵種だけ（人数が増えたら自然に増える）
export const ARM_TIER_COST = 1000;
export const armsAvailable = () => ['槍', '騎馬', '鉄砲', '弓'].filter((a) => { const l = BUSHOU_ONLINE.filter((b) => armOf(b) === a); return l.filter((b) => b.rank !== 'N').length >= 10 && l.some((b) => b.rank === 'S' || b.rank === 'SS'); });
// K631 ⑤：家登用（織田家武将登用…）。兵種登用と同じ形（10名・S以上1名確定・1名を選択・小判1,000）で、10名とも その家だけ。
//   出せる家は、登録の六家のうち 10名そろい S 以上が一人はいる家だけ
import { HOUSES } from './house.js';
export const houseNameOf = (id) => HOUSES.find((h) => h.id === id)?.name || id;
export const housesAvailable = () => HOUSES.filter((h) => { const l = BUSHOU_ONLINE.filter((b) => b.house === h.id); return l.filter((b) => b.rank !== 'N').length >= 10 && l.some((b) => b.rank === 'S' || b.rank === 'SS'); }).map((h) => h.id);
// 絞り込みの述語（兵種か家）。無ければ null
export const filterOf = (id) => { const m = /^(arm|house):(.+)$/.exec(id || ''); if (!m) return null; return m[1] === 'arm' ? (b) => armOf(b) === m[2] : (b) => b.house === m[2]; };
export function tierOf(id) {
  const t = TIERS.find((x) => x.id === id); if (t) return t;
  const hm = /^house:(.+)$/.exec(id || '');
  if (hm) { const hn = houseNameOf(hm[1]); return { id, house: hm[1], name: `${hn}武将登用`, cost: ARM_TIER_COST, cands: 10, picks: 1, line: `${hn}の武将10名 S以上1名確定 1名を選択`, say: `10名が出現。10名とも${hn}の武将で、S 以上が1名は必ず入ります。その中から1名を登用できます` }; }
  const m = /^arm:(.+)$/.exec(id || ''); if (!m) return null;
  const arm = m[1];
  return { id, arm, name: `${arm}武将登用`, cost: ARM_TIER_COST, cands: 10, picks: 1, line: `${arm}の武将10名 S以上1名確定 1名を選択`, say: `10名が出現。10名とも${arm}の武将で、S 以上が1名は必ず入ります。その中から1名を登用できます` };
}
const SS_UP = 0.15;   // 上級の保証枠が SS になる率・特選の残り枠が SS になる率（仮）
const poolOf = (rank) => BUSHOU_ONLINE.filter((b) => b.rank === rank);
const pickRank = (rates, rng) => { let r = rng(), acc = 0, last = null; for (const k of ['N', 'R', 'A', 'S', 'SS']) { if (!rates[k]) continue; acc += rates[k]; last = k; if (r < acc) return k; } return last; };

// 候補の人選び（同じ人は並べない。指定の格の池が尽きたら一つ下の格から）
function take(rank, used, rng, banner, arm = null) {
  const order = ['SS', 'S', 'A', 'R', 'N'];
  // 兵種登用は人数が少ない：池が尽きたら R まで下へ、その次に上の格へ（N は最後。10名とも R 以上を守る）
  const seq = arm ? [...order.slice(order.indexOf(rank), order.indexOf('R') + 1), ...order.slice(0, order.indexOf(rank)).reverse(), 'N'].map((r) => order.indexOf(r)) : order.slice(order.indexOf(rank)).map((_, k) => order.indexOf(rank) + k);
  for (const i of seq) {
    const pool = poolOf(order[i]).filter((b) => !used.has(b.id) && (!arm || arm(b)));
    if (!pool.length) continue;
    // 目当て（banner.pickup）が SS の枠に出る率は今までと同じ半分
    if (order[i] === 'SS' && banner.pickup && BUSHOU_BY_ID[banner.pickup]?.rank === 'SS' && !used.has(banner.pickup) && (!arm || arm(BUSHOU_BY_ID[banner.pickup])) && rng() < 0.5 && BUSHOU_BY_ID[banner.pickup]) { used.add(banner.pickup); return BUSHOU_BY_ID[banner.pickup]; }
    const b = pool[Math.floor(rng() * pool.length)]; used.add(b.id); return b;
  }
  return null;
}
export function rollTier(tierId, rng = Math.random, banner = {}) {
  const used = new Set(); const ranks = [];
  if (tierId === 'normal') for (let i = 0; i < 3; i++) ranks.push(pickRank(RATES.paid, rng));
  else if (tierId === 'joukyu' || /^(arm|house):/.test(tierId)) { ranks.push(rng() < SS_UP ? 'SS' : 'S'); for (let i = 0; i < 9; i++) ranks.push(pickRank(RATES.paid, rng)); }
  else if (tierId === 'tokusen') { for (let i = 0; i < 3; i++) ranks.push('SS'); for (let i = 0; i < 7; i++) ranks.push(rng() < SS_UP ? 'SS' : 'S'); }
  else return [];
  // 高い格から先に埋める（池が尽きた時に下へ落ちるのが低い格の方になるように）
  const idx = ranks.map((r, i) => i).sort((a, b) => ['N', 'R', 'A', 'S', 'SS'].indexOf(ranks[b]) - ['N', 'R', 'A', 'S', 'SS'].indexOf(ranks[a]));
  const out = new Array(ranks.length);
  const arm = filterOf(tierId);
  for (const i of idx) out[i] = take(ranks[i], used, rng, banner, arm);
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
  if (t.id === 'joukyu' || t.arm || t.house) return { t, groups: [{ label: '保証の枠 1名（S 以上）', text: `S ${pc(1 - SS_UP)}・SS ${pc(SS_UP)}` }, { label: '残りの 9名それぞれ', text: row(P) }] };
  return { t, groups: [{ label: '保証の枠 3名', text: 'SS 100%' }, { label: '残りの 7名それぞれ（S 以上）', text: `S ${pc(1 - SS_UP)}・SS ${pc(SS_UP)}` }] };
}
// 候補の一覧（［候補武将一覧］）：その段で出うる武将を格ごとに
export function tierPool(tierId) {
  const ranks = tierId === 'tokusen' ? ['SS', 'S'] : ['SS', 'S', 'A', 'R'];
  const arm = filterOf(tierId);
  return ranks.map((r) => ({ rank: r, list: poolOf(r).filter((b) => !arm || arm(b)) }));
}
