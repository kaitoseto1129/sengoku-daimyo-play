// 武将登用（ガチャ）の決まり（K588・docs/gacha_price_1120.md・クラウド kaito2 k365-cloud-27・11/21）。
//   値段・率・天井・無料の回数・金のパックをここ一つに置く。画面（toyo_screen.js）も、対戦の置き場（Cloudflare Workers・K589）も同じ関数を使う。
//   本番では抽選はサーバーで行う（online_req 117「ガチャの結果は必ずサーバーで決める」）。ここの関数は乱数 rng を外から受け取るだけで、端末でも置き場でも同じ。
//   決まりの出所：
//     1回＝金300・10回＝金2,800（10組を順に、各組で1人を選ぶ）。金1≒1円。
//     無料＝毎日3回＋毎日の務めで2回＝最大5回。無料は N・R・A（催しの時だけ低い率で S）。
//     有料は3人の候補をそれぞれ別に引く：R 59%・A 30%・S 9%・SS 2%（N は出ない）。
//     天井（有料の回数）：30回＝S 以上の選択券・80回＝SS のランダム確定券・120回＝SS の選択券。120回で一巡して0へ戻る。
//     ピックアップ：SS が出ればその半分はピックアップの武将。ピックアップを取らずに100回で、その武将の確定券。
//   紙に無いので推した所（kaito の確かめ待ち）：
//     無料の率 N 55%・R 35%・A 10%（催しの S は 0.5%）。
//     天井の数え方：30・80・120 は一巡の中の節目。SS を取っても数えは戻さない（「ここまで引けば確実」を崩さない）。
//     ピックアップの数えは、ピックアップの武将を登用した時だけ0へ戻す。
import { BUSHOU_ONLINE, BUSHOU_BY_ID, RANKS } from './bushou_online.js';
import { DUP_SEALS, grant, drawTrio } from './busho_bank.js';

export const PRICE = { one: 300, ten: 2800 };
export const FREE_DAILY = 3, FREE_TASKS = 2;
export const RATES = {
  paid: { R: 0.59, A: 0.30, S: 0.09, SS: 0.02 },
  free: { N: 0.55, R: 0.35, A: 0.10 },
  freeEvent: { N: 0.545, R: 0.35, A: 0.10, S: 0.005 },
};
export const PITY = [
  { at: 30, ticket: 'sSelect', label: 'S 以上の選択券' },
  { at: 80, ticket: 'ssRandom', label: 'SS 確定券' },
  { at: 120, ticket: 'ssSelect', label: 'SS の選択券' },
];
export const PITY_CYCLE = 120, PICKUP_AT = 100, PICKUP_SHARE = 0.5;
// 重なった武将は武将印へ。数の持ち主は 33 の busho_bank.js（DUP_SEALS）。ここは読むだけ（docs/online_plan_1121.md §5 ①）
export const DUP_SEAL = DUP_SEALS;

// 金のパック（App Store の課金の品。id は App Store Connect に登録する名と揃える）。¥12,000 は表で目立たせない（quiet）
export const PACKS = [
  { id: 'kin_160', kin: 160, yen: 160 },
  { id: 'kin_800', kin: 800, yen: 800 },
  { id: 'kin_1600', kin: 1600, yen: 1500, firstBonus: 800 },
  { id: 'kin_3300', kin: 3300, yen: 3000, best: true },
  { id: 'kin_7000', kin: 7000, yen: 6000 },
  { id: 'kin_15000', kin: 15000, yen: 12000, quiet: true },
];
export const OFFERS = [
  { id: 'uijin_pack', name: '初陣の備え', yen: 650, kin: 600, items: ['A 以上の登用券 1', '陣幕 1'], once: true },
  { id: 'gunshikin_month', name: '月次の軍資金', yen: 650, kin: 300, daily: 100, days: 30 },
  { id: 'season_pass', name: 'シーズンの帳', yen: 1200 },
  { id: 'season_pass_plus', name: 'シーズンの帳（上）', yen: 2500 },
];

export function newToyoState(o = {}) {
  const st = { kin: 0, free: FREE_DAILY, freeTask: 0, day: '', owned: {}, seals: 0, pity: 0, pickupPity: 0, bought: {}, log: [], ...o };
  st.tickets = { aSelect: 0, sSelect: 0, ssRandom: 0, ssSelect: 0, pickup: 0, ...(o.tickets || {}) };
  return st;
}

// 日が替わったら無料を3回へ戻す（務めの2回は grantTaskFree で足す）
export function dailyReset(st, day) {
  if (st.day === day) return false;
  st.day = day; st.free = FREE_DAILY; st.freeTask = 0; return true;
}
export function grantTaskFree(st) {
  if (st.freeTask >= FREE_TASKS) return false;
  st.freeTask++; st.free++; return true;
}

const pickRank = (rates, rng) => {
  let r = rng(), acc = 0, last = null;
  for (const k of RANKS) { if (!rates[k]) continue; acc += rates[k]; last = k; if (r < acc) return k; }
  return last;
};
const poolOf = (rank) => BUSHOU_ONLINE.filter((b) => b.rank === rank);

// 候補三人（同じ人は並べない）。banner.pickup＝ピックアップの武将 id。
//   banner.bank＝33 の手持ちの帳（busho_bank.js）がある時は、格を決めた後の人選びを 33 の drawTrio に任せる
//   （無料は持っていない人を一・五倍・有料は三組続けて全部手持ちなら次は手持ちに無い人）。ピックアップの枠だけはここで先に決める。
export function rollSet(kind, rng, banner = {}) {
  const rates = kind === 'paid' ? RATES.paid : banner.event ? RATES.freeEvent : RATES.free;
  if (banner.bank) {
    const ranks = [0, 1, 2].map(() => pickRank(rates, rng));
    const pickAt = ranks.findIndex((r) => r === 'SS' && banner.pickup && rng() < PICKUP_SHARE);
    const roster = BUSHOU_ONLINE.filter((b) => b.id !== banner.pickup);
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
      const pool = poolOf(rank).filter((c) => !out.some((o) => o.id === c.id) && c.id !== banner.pickup);
      b = pool[Math.floor(rng() * pool.length)] || poolOf(rank)[0];
    }
    out.push(b);
  }
  return out;
}

// 引く。n＝1 か 10。kind＝'free'|'paid'。足りなければ { ok:false, why }。
//   返す sets は候補三人の組（n 組）。天井の節目に着いた券は tickets に足し、got に並べる。
export function pull(st, kind, n, rng, banner = {}) {
  if (kind === 'free') {
    if (n !== 1 || st.free < 1) return { ok: false, why: 'free' };
    st.free--;
    const sets = [rollSet('free', rng, banner)];
    keepPending(st, sets, []);
    return { ok: true, sets, got: [] };
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
  return { ok: true, sets, got, cost };
}

// 引いた組を選び終えるまで持ち物の箱に残す（33・11/21）。金と天井の数は引いた時に減る・増えるので、選ぶ前にアプリを閉じても
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
// 金を足す：一つの買い物（App Store の取引の id）は一度だけ金にする。取引を終える（finish）のは、この後の保存が済んでから
//   （K583 の係へ：閉じて取引が届き直しても、ここで二重にならない）
export function creditPurchase(st, p, txId) {
  st.credited = st.credited || {};
  if (txId && st.credited[txId]) return false;
  st.kin += (p.kin || 0) + (p.firstBonus && !st.bought[p.id] ? p.firstBonus : 0);
  if (p.id === 'uijin_pack') st.tickets.aSelect = (st.tickets.aSelect || 0) + 1;
  if (p.daily && p.days) startPass(st, p);
  st.bought[p.id] = (st.bought[p.id] || 0) + 1;
  if (txId) { st.credited[txId] = 1; const ks = Object.keys(st.credited); if (ks.length > 200) delete st.credited[ks[0]]; }
  return true;
}

// 月次の軍資金（自動で更新しない30日・33 11/21）：買った日から days 日、その日はじめて開いた時に金 daily（同じ日は一度だけ）。
//   30日で終わり、自動では続かない（続ける時はもう一度買う＝その時は終わりを30日延ばす）。日は日本の暦（UTC+9）で数える
export const dayNo = (t = Date.now()) => Math.floor((t + 9 * 3600e3) / 86400e3);
function startPass(st, p, now = Date.now(), from = null) {
  st.passes = st.passes || {};
  const g = st.passes[p.id], d = dayNo(now);
  if (g && d < g.start + g.days) g.days += p.days;            // 続きで買った：終わりを延ばす
  else st.passes[p.id] = { start: from ?? d, days: p.days, last: null };
  passTick(st, now);
}
export function passTick(st, now = Date.now()) {
  let got = 0;
  for (const p of OFFERS) {
    const g = st.passes?.[p.id]; if (!g || !p.daily) continue;
    const d = dayNo(now);
    if (d < g.start || d >= g.start + g.days || g.last === d) continue;
    g.last = d; st.kin += p.daily; got += p.daily;
  }
  return got;
}
export function passLeft(st, id, now = Date.now()) {
  const g = st.passes?.[id]; if (!g) return 0;
  return Math.max(0, g.start + g.days - dayNo(now));
}
// 購入の復元（別の端末で買った月次の軍資金）：届く日の続きだけを戻す（初めの金300は買った端末で足し済み＝ここでは足さない）
export function restorePass(st, p, txId, boughtAt, now = Date.now()) {
  st.credited = st.credited || {};
  if (!p || !p.daily || (txId && st.credited[txId])) return false;
  const start = dayNo(boughtAt);
  if (dayNo(now) >= start + p.days) return false;               // もう終わった
  st.passes = st.passes || {};
  if (!st.passes[p.id] || st.passes[p.id].start + st.passes[p.id].days <= dayNo(now)) st.passes[p.id] = { start, days: p.days, last: null };
  if (txId) st.credited[txId] = 1;
  passTick(st, now);
  return true;
}

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
  if (kind === 'sSelect') return BUSHOU_ONLINE.filter((b) => b.rank === 'S' || b.rank === 'SS');
  if (kind === 'ssSelect') return BUSHOU_ONLINE.filter((b) => b.rank === 'SS');
  if (kind === 'pickup') return banner.pickup ? [BUSHOU_BY_ID[banner.pickup]] : [];
  return [];
}
export function useTicket(st, kind, rng, pickId, banner = {}) {
  if (!(st.tickets[kind] > 0)) return null;
  let b = null;
  if (kind === 'ssRandom') { const p = poolOf('SS'); b = p[Math.floor(rng() * p.length)]; }
  // 初陣の備えの「A 以上の登用券」：有料の率の A・S・SS だけを比べて一人を引く（選ぶ券ではない）
  else if (kind === 'aSelect') { const r = RATES.paid, sum = r.A + r.S + r.SS; const p = poolOf(pickRank({ A: r.A / sum, S: r.S / sum, SS: r.SS / sum }, rng)); b = p[Math.floor(rng() * p.length)]; }
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
