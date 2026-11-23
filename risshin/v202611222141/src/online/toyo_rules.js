// 武将登用の決まり（K598）。有料の率と天井は従来どおり。
import { BUSHOU_ONLINE, BUSHOU_BY_ID, RANKS } from './bushou_online.js';
import { DUP_SEALS, grant, drawTrio } from './busho_bank.js';
import { isOpen } from './toyo_calendar.js';   // K636：週ごとの暦で解禁した武将だけを出す

// 旧：追加登用 1回300・10回2,800（K598）。K604 の商品の段（online/toyo_tiers.js）で置き換える。画面が移るまでだけ残す
export const PRICE = { one: 300, ten: 2800 };
export const FREE_DAILY = 5, FREE_TASKS = 0;
export const RATES = {
  paid: { R: 0.59, A: 0.30, S: 0.09, SS: 0.02 },
  free: { N: 0.70, R: 0.25, A: 0.05 },
  freeEvent: { N: 0.70, R: 0.25, A: 0.05, S: 0 },
};
export const PITY = [
  { at: 30, ticket: 'sSelect', label: 'S 以上の選択券' },
  { at: 80, ticket: 'ssRandom', label: 'SS 確定券' },
  { at: 120, ticket: 'ssSelect', label: 'SS の選択券' },
];
export const PITY_CYCLE = 120, PICKUP_AT = 100, PICKUP_SHARE = 0.5;
// 重なった武将は武将印へ。数の持ち主は 33 の busho_bank.js（DUP_SEALS）。ここは読むだけ（docs/online_plan_1121.md §5 ①）
export const DUP_SEAL = DUP_SEALS;

// 小判のパック（App Store の課金の品。id は App Store Connect に登録する名と揃える）。¥12,000 は表で目立たせない（quiet）
export const PACKS = [
  { id: 'kin_160', kin: 160, yen: 160 },
  { id: 'kin_800', kin: 800, yen: 800 },
  { id: 'kin_1600', kin: 1600, yen: 1500, firstBonus: 800 },
  { id: 'kin_3300', kin: 3300, yen: 3000, best: true },
  { id: 'kin_7000', kin: 7000, yen: 6000 },
  { id: 'kin_15000', kin: 15000, yen: 12000, quiet: true },
];
export const OFFERS = [
  { id: 'season_pass', name: 'シーズンの帳', yen: 1200 },
  { id: 'season_pass_plus', name: 'シーズンの帳（上）', yen: 2500 },
];

export function newToyoState(o = {}) {
  const st = { kin: 0, free: FREE_DAILY, freeTask: 0, day: '', owned: {}, seals: 0, pity: 0, pickupPity: 0, bought: {}, log: [], ...o };
  st.tickets = { sSelect: 0, ssRandom: 0, ssSelect: 0, pickup: 0, ...(o.tickets || {}) };
  return st;
}

// 日が替わったら残りを持ち越さず無料を5回へ戻す
export function dailyReset(st, day) {
  if (st.day === day) return false;
  st.day = day; st.free = FREE_DAILY; st.freeTask = 0; return true;
}
export function grantTaskFree() { return false; }

const pickRank = (rates, rng) => {
  let r = rng(), acc = 0, last = null;
  for (const k of RANKS) { if (!rates[k]) continue; acc += rates[k]; last = k; if (r < acc) return k; }
  return last;
};
// K636：池は解禁した武将だけ（toyo_calendar.js の暦）。arm＝兵種の週（その兵種だけ。いなければ格の池のまま）
const poolOf = (rank, arm = null) => { const l = BUSHOU_ONLINE.filter((b) => b.rank === rank && isOpen(b.id)); if (!arm) return l; const a = l.filter((b) => b.fav === arm); return a.length ? a : l; };
const openPick = (banner) => (banner.pickup && isOpen(banner.pickup) && (!banner.arm || BUSHOU_BY_ID[banner.pickup]?.fav === banner.arm) ? banner.pickup : null);

// 候補三人（同じ人は並べない）。banner.pickup＝ピックアップの武将 id。
//   banner.bank＝33 の手持ちの帳（busho_bank.js）がある時は、格を決めた後の人選びを 33 の drawTrio に任せる
//   （無料は持っていない人を一・五倍・有料は三組続けて全部手持ちなら次は手持ちに無い人）。ピックアップの枠だけはここで先に決める。
export function rollSet(kind, rng, banner = {}) {
  banner = { ...banner, pickup: openPick(banner) };
  const rates = kind === 'paid' ? RATES.paid : banner.event ? RATES.freeEvent : RATES.free;
  if (banner.bank) {
    const ranks = [0, 1, 2].map(() => pickRank(rates, rng));
    const pickAt = ranks.findIndex((r) => r === 'SS' && banner.pickup && rng() < PICKUP_SHARE);
    const roster = BUSHOU_ONLINE.filter((b) => b.id !== banner.pickup && isOpen(b.id) && (!banner.arm || b.fav === banner.arm || !BUSHOU_ONLINE.some((c) => c.rank === b.rank && c.fav === banner.arm && isOpen(c.id))));
    const trio = drawTrio(banner.bank, roster, ranks.filter((_, i) => i !== pickAt), { free: kind !== 'paid', rand: rng });
    if (pickAt >= 0) trio.splice(pickAt, 0, BUSHOU_BY_ID[banner.pickup]);
    return trio;
  }
  const out = [];
  for (let i = 0; i < 3; i++) {
    const rank = pickRank(rates, rng);
    let b = null;
    if (rank === 'SS' && banner.pickup && !out.some((c) => c.id === banner.pickup) && rng() < PICKUP_SHARE) b = BUSHOU_BY_ID[banner.pickup];
    if (!b) {
      const pool = poolOf(rank, banner.arm).filter((c) => !out.some((o) => o.id === c.id) && c.id !== banner.pickup);
      b = pool[Math.floor(rng() * pool.length)] || poolOf(rank)[0] || poolOf('N')[0];
    }
    out.push(b);
  }
  return out;
}

// 初陣登用（K600 94〜96）：オンラインを始めて最初の10組のうちに A 以上の候補が一度は入る（入らなければ10組目を A 入りにする）。
//   20組目の候補は S の三人（三人から一人）。組を引くたびに数える（無料・有料とも）。返す：'A'（保証が働いた）・'S'（20組目）・null
export const DEBUT = { guardAt: 10, sAt: 20 };
function debutKind(st, sets) {
  let kind = null;
  for (const set of sets) {
    st.debutN = (st.debutN || 0) + 1;
    if (st.debutN > DEBUT.sAt) continue;
    if (set.some((b) => b.rank === 'A' || b.rank === 'S' || b.rank === 'SS')) st.debutSeen = true;
    if (st.debutN === DEBUT.guardAt && !st.debutSeen) {
      const pool = poolOf('A').filter((b) => !set.some((c) => c.id === b.id));
      if (pool.length) { set[0] = pool[Math.floor(Math.random() * pool.length)]; st.debutSeen = true; kind = kind || 'A'; }
    }
    if (st.debutN === DEBUT.sAt) {
      const pool = poolOf('S').slice(); const out = [];
      while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      if (out.length === 3) { set.splice(0, 3, ...out); kind = 'S'; }
    }
  }
  return kind;
}

// 引く。n＝1 か 10。kind＝'free'|'paid'。足りなければ { ok:false, why }。
//   返す sets は候補三人の組（n 組）。天井の節目に着いた券は tickets に足し、got に並べる。
export function pull(st, kind, n, rng, banner = {}) {
  if (kind === 'free') {
    if (n !== 1 || st.free < 1) return { ok: false, why: 'free' };
    st.free--;
    const sets = [rollSet('free', rng, banner)];
    const debut = debutKind(st, sets);
    keepPending(st, sets, []);
    return { ok: true, sets, got: [], debut };
  }
  const cost = n === 10 ? PRICE.ten : n === 1 ? PRICE.one : NaN;
  if (!(st.kin >= cost)) return { ok: false, why: 'kin', need: cost - (st.kin || 0) };
  st.kin -= cost;
  const sets = [], got = [];
  for (let i = 0; i < n; i++) {
    sets.push(rollSet('paid', rng, banner));
    st.pity++;
    for (const p of PITY) if (st.pity === p.at) { st.tickets[p.ticket]++; got.push(p); }
    if (st.pity >= PITY_CYCLE) st.pity = 0;
    if (banner.pickup) { st.pickupPity++; if (st.pickupPity >= PICKUP_AT) { st.pickupPity = 0; st.tickets.pickup++; got.push({ ticket: 'pickup', label: `${BUSHOU_BY_ID[banner.pickup]?.name || ''}の確定券` }); } }
  }
  keepPending(st, sets, got);
  return { ok: true, sets, got, cost, debut: debutKind(st, sets) };
}

// 引いた組を選び終えるまで持ち物の箱に残す（33・11/21）。小判と天井の数は引いた時に減る・増えるので、選ぶ前にアプリを閉じても
//   次に開いた時に同じ組の続きから選べる（引き直しにも、引いた分の消えにもならない）。k＝次に選ぶ組
function keepPending(st, sets, got) { st.pending = { ids: sets.map((set) => set.map((b) => b.id)), k: 0, got: got.map((g) => g.label) }; }
export function pendingSets(st) {
  const p = st.pending; if (!p || !Array.isArray(p.ids) || p.k >= p.ids.length) { st.pending = null; return null; }
  const sets = p.ids.map((set) => set.map((id) => BUSHOU_BY_ID[id]).filter(Boolean));
  if (sets.some((set) => !set.length)) { st.pending = null; return null; }
  return { sets, k: p.k | 0, got: (p.got || []).map((label) => ({ label })) };
}
// 組 k から一人を選んだ印（choose の後・同じ save で残す）。二度目は何もしない（同じ組から二人を取らない）
export function choosePending(st, k, b, banner = {}) {
  const p = st.pending;
  if (p && p.k !== k) return null;
  const r = choose(st, b, banner);
  if (p) { p.k = k + 1; if (p.k >= p.ids.length) st.pending = null; }
  return r;
}
// 三人を見て「登用しない」：回数は使ったまま、この組からは誰も取らない（K600 追加・11/21）
export function declinePending(st, k) {
  const p = st.pending;
  if (p && p.k === k) { p.k = k + 1; if (p.k >= p.ids.length) st.pending = null; return true; }
  return false;
}
// 小判を足す：一つの買い物（App Store の取引の id）は一度だけ小判にする。取引を終える（finish）のは、この後の保存が済んでから
//   （K583 の係へ：閉じて取引が届き直しても、ここで二重にならない）
export function creditPurchase(st, p, txId) {
  st.credited = st.credited || {};
  if (txId && st.credited[txId]) return false;
  st.kin += (p.kin || 0) + (p.firstBonus && !st.bought[p.id] ? p.firstBonus : 0);
  st.bought[p.id] = (st.bought[p.id] || 0) + 1;
  if (txId) { st.credited[txId] = 1; const ks = Object.keys(st.credited); if (ks.length > 200) delete st.credited[ks[0]]; }
  return true;
}

// 日本の暦の日番号（務めでも使う）
export const dayNo = (t = Date.now()) => Math.floor((t + 9 * 3600e3) / 86400e3);
// 以前の呼び出しは何も復元しない。
export function restorePass() { return false; }

// 組から一人を登用する。重なれば武将印。ピックアップを取ればその数えを戻す
//   banner.bank があれば、手持ちと武将印は 33 の帳（grant）が持つ。st.owned・st.seals はその写し（画面の字のため）
export function choose(st, b, banner = {}) {
  const dup = banner.bank ? !!banner.bank.owned[b.id] : (st.owned[b.id] || 0) > 0;
  if (banner.bank) { grant(banner.bank, b); st.owned[b.id] = banner.bank.owned[b.id]; st.seals = banner.bank.seals; }
  else { st.owned[b.id] = (st.owned[b.id] || 0) + 1; if (dup) st.seals += DUP_SEAL[b.rank] || 0; }
  if (banner.pickup && b.id === banner.pickup) st.pickupPity = 0;
  st.log.push(b.id); if (st.log.length > 50) st.log.shift();
  return { b, dup, seal: dup ? DUP_SEAL[b.rank] || 0 : 0 };
}

// おすすめ：格の高い人 → ピックアップ → まだ持っていない人
export function recommend(set, st, banner = {}) {
  let best = 0, bs = -1;
  set.forEach((b, i) => { const s = RANKS.indexOf(b.rank) * 100 + (b.id === banner.pickup ? 50 : 0) + ((st.owned[b.id] || 0) ? 0 : 10); if (s > bs) { bs = s; best = i; } });
  return best;
}

// 券で選べる人（選択券）・確定券で引く人
export function ticketChoices(kind, banner = {}) {
  if (kind === 'sSelect') return BUSHOU_ONLINE.filter((b) => (b.rank === 'S' || b.rank === 'SS') && isOpen(b.id));
  if (kind === 'ssSelect') return BUSHOU_ONLINE.filter((b) => b.rank === 'SS' && isOpen(b.id));
  if (kind === 'pickup') return banner.pickup && isOpen(banner.pickup) ? [BUSHOU_BY_ID[banner.pickup]] : [];
  return [];
}
export function useTicket(st, kind, rng, pickId, banner = {}) {
  if (!(st.tickets[kind] > 0)) return null;
  let b = null;
  if (kind === 'ssRandom') { const p = poolOf('SS'); b = p[Math.floor(rng() * p.length)]; }
  else b = ticketChoices(kind, banner).find((c) => c.id === pickId) || null;
  if (!b) return null;
  st.tickets[kind]--;
  return choose(st, b, banner);
}

// 確率の表示（一人ごとの率と、三人のどれかに出る率）
export function rateTable(kind, banner = {}) {
  const rates = kind === 'paid' ? RATES.paid : banner.event ? RATES.freeEvent : RATES.free;
  const rows = RANKS.filter((k) => rates[k]).reverse().map((k) => {
    const n = poolOf(k).length, any = 1 - Math.pow(1 - rates[k], 3);
    // ピックアップの SS：一人分の率は SS の半分、残りの SS はあとの半分を分ける
    if (k === 'SS' && banner.pickup && kind === 'paid') return { rank: k, each: rates[k], any, n, pickPer: rates[k] * PICKUP_SHARE, per: rates[k] * (1 - PICKUP_SHARE) / (n - 1) };
    return { rank: k, each: rates[k], any, per: rates[k] / n, n };
  });
  const sUp = (rates.S || 0) + (rates.SS || 0);
  return { rows, anySS: 1 - Math.pow(1 - (rates.SS || 0), 3), anySUp: 1 - Math.pow(1 - sUp, 3) };
}

// 天井までの残り（画面の「〇〇確定まで 残り N回」）
export function pityLeft(st, banner = {}) {
  const next = PITY.find((p) => p.at > st.pity) || PITY[0];
  return { next, left: next.at - st.pity, pickupLeft: banner.pickup ? PICKUP_AT - st.pickupPity : null };
}

// K604 商品の段は画面の持ち主（k598-toyo）の online/toyo_tiers.js が持つ（二つ持たない。11/21 iMac K604 の係が一度ここに入れた物は外した）
