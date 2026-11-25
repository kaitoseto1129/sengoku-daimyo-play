// 登城帳（K600・docs/kaito_toyo_1121.md 58〜72・98〜99）。月のログインの褒美。iMac K600 の係 11/21。
//   ・連続でなく、その月に登城した日の数で進む（一日抜けても消えない・罰は無い）。月が替われば一から。
//   ・28回の褒美：1 無料登用5回＋武将印／3 小判50／5 SR以上登用1回／7 SR武将候補3人から1人／10 小判100／
//     14 月替わりの指定武将／21 SR以上登用（3候補→1人）／28 SR以上の選択登用。
//   ・SSR は毎月は配らない（66）：SR以上の候補は S だけ。催しの月（EVENT_MONTHS）だけ 28回目に SSR の候補を出す。
//   ・銭はオンラインの箱にまだ無いので、1回目の「銭」は武将印（tsutome.js の務めと同じ扱い）。
//   持ち物はオンラインの箱（house.js の loadOnline/saveOnline）の tojo に置く。state.js には触らない。描かない純粋な決まり。
//   試し：node prototype/tools/tojo_test.mjs
import { BUSHOU_ONLINE, BUSHOU_BY_ID } from './bushou_online.js';
import { newToyoState, choose } from './toyo_rules.js';
import { isOpen } from './toyo_calendar.js';   // K636：褒美の候補も解禁した武将だけ

export const DAYS = 28;
// 日の字は登用の間（index.js の toToyo）と同じ端末の暦。月の字は 'YYYY-M'
const dayKey = (now) => { const d = new Date(now); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const monthKey = (now) => { const d = new Date(now); return `${d.getFullYear()}-${d.getMonth() + 1}`; };
const monthOf = (now) => new Date(now).getMonth() + 1;

// 月替わりの指定武将（14回目）。11月 前田利家（A）・12月 山県昌景（S）は要件書の例のまま。ほかの月は家を回す
// K636：2月は立花宗茂がまだ登用に出ない（暦で 2/16 から）ので上杉景勝に替えた
export const MONTH_GENERAL = { 1: 'kanetsugu', 2: 'kagekatsu', 3: 'tadakatsu', 4: 'kanbei', 5: 'kageie', 6: 'motoharu', 7: 'iehisa', 8: 'naomasa', 9: 'mitsuhide', 10: 'masayuki', 11: 'toshiie', 12: 'masakage' };
// 催しの月（28回目に SSR の候補を出す）。正月だけ（周年・大型の更新は足す時にここへ）
export const EVENT_MONTHS = [1];

const S_POOL = () => BUSHOU_ONLINE.filter((b) => b.rank === 'SR' && isOpen(b.id));
const SS_POOL = () => BUSHOU_ONLINE.filter((b) => b.rank === 'SSR' && isOpen(b.id));
// 月ごとに決まった並び（同じ月・同じ回なら同じ候補。開き直しで引き直しにならない）
const seeded = (seed) => { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
const seedOf = (mk, n) => [...`${mk}#${n}`].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
function pickN(pool, n, rng) {
  const a = pool.slice(), out = [];
  while (a.length && out.length < n) out.push(a.splice(Math.floor(rng() * a.length), 1)[0]);
  return out;
}

// 褒美の表。kind：free（毎日の無料登用＋武将印）・seals（武将印）・kin（小判）・aUp（SR以上を一人）・pick3（候補三人から一人）・gen（指定の武将）・sel（選ぶ）
export function rewardOf(n, now = Date.now()) {
  const m = monthOf(now), g = BUSHOU_BY_ID[MONTH_GENERAL[m]];
  switch (n) {
    case 1: return { n, kind: 'free', free: 5, seals: 10, label: '無料登用5回＋武将印10', big: 1 };
    case 3: return { n, kind: 'kin', kin: 50, label: '小判50', big: 1 };
    case 5: return { n, kind: 'aUp', label: 'SR以上登用1回', big: 1 };
    case 7: return { n, kind: 'pick3', label: 'SR武将 候補3人から1人', big: 1 };
    case 10: return { n, kind: 'kin', kin: 100, label: '小判100', big: 1 };
    case 14: return { n, kind: 'gen', id: g?.id, label: g ? `${g.name}（${g.rank}）` : '今月の武将', big: 1 };
    case 21: return { n, kind: 'pick3', label: 'SR以上登用（候補3人から1人）', big: 1 };
    case 28: return EVENT_MONTHS.includes(m) ? { n, kind: 'sel', ss: true, label: 'SSR候補3人から1人', big: 1 } : { n, kind: 'sel', label: 'SR以上の武将を選んで登用', big: 1 };
    default: return { n, kind: 'seals', seals: n < 10 ? 5 : 10, label: `武将印${n < 10 ? 5 : 10}` };
  }
}
export const monthGeneral = (now = Date.now()) => BUSHOU_BY_ID[MONTH_GENERAL[monthOf(now)]] || null;

// 今月の帳（月が替われば作り直す）。count＝今月登城した日の数・got＝受け取った回
export function book(save, now = Date.now()) {
  const mk = monthKey(now);
  if (!save.tojo || save.tojo.month !== mk) save.tojo = { month: mk, count: 0, last: '', got: {} };
  return save.tojo;
}
// 今日の登城を数える（一日一度）。数えた時は今日の回（1〜28）、もう数えた日・28回を越えた日は 0
export function checkIn(save, now = Date.now()) {
  const t = book(save, now), d = dayKey(now);
  if (t.last === d) return 0;
  t.last = d;
  if (t.count >= DAYS) return 0;
  t.count += 1;
  return t.count;
}
// 次の大きな褒美（武将印だけの日は飛ばす）
const nextBig = (from, now) => { for (let n = Math.max(1, from); n <= DAYS; n++) { const r = rewardOf(n, now); if (r.big) return r; } return null; };
// 画面の見出し：今月の武将・今の回・今日・次・その先
export function view(save, now = Date.now()) {
  const t = book(save, now), next = nextBig(t.count + 1, now);
  return { count: t.count, general: monthGeneral(now), genAt: 14, today: t.count ? rewardOf(t.count, now) : null, todayGot: !!t.got[t.count], next, after: next ? nextBig(next.n + 1, now) : null, got: { ...t.got } };
}
// 選ぶ褒美（pick3・sel）の候補
export function choicesOf(r, now = Date.now()) {
  const rng = seeded(seedOf(monthKey(now), r.n));
  if (r.kind === 'pick3') return pickN(S_POOL(), 3, rng);
  if (r.kind === 'sel') return r.ss ? pickN(SS_POOL(), 3, rng) : S_POOL();
  return [];
}

// 一人をオンラインの箱へ入れる（登用の間の keep と同じ：手持ちの帳・登用の写し・編成の名の並び）
function give(save, b) {
  save.toyo = newToyoState(save.toyo || {});
  const r = choose(save.toyo, b, save.bank ? { bank: save.bank } : {});
  save.owned = save.owned || []; save.kata = save.kata || {};
  if (!save.owned.includes(b.name)) { save.owned.push(b.name); save.kata[b.name] = b.fav || 'std'; }
  return r;
}
// SR を一人（11/24 前は A 九割・S 一割。A と S を SR にまとめた。SSR は出さない＝66）
function rollAUp(rng) {
  const rank = 'SR';
  const pool = BUSHOU_ONLINE.filter((b) => b.rank === rank && isOpen(b.id));
  return pool[Math.floor(rng() * pool.length)];
}

// 今日の褒美を受け取る（一度だけ）。pickId＝選ぶ褒美で選んだ武将の id。返り値：{ r, b?, dup?, seal?, kin?, free?, seals? } か null
export function claim(save, pickId = null, now = Date.now(), rng = Math.random) {
  const t = book(save, now), n = t.count;
  if (!n || t.got[n]) return null;
  const r = rewardOf(n, now), out = { r };
  if (r.kind === 'free' || r.kind === 'seals') {
    // 無料登用5回は毎日の5回そのもの（toyo_rules の FREE_DAILY）。重ねて足さない。武将印だけ足す
    save.toyo = newToyoState(save.toyo || {});
    if (save.bank) save.bank.seals = (save.bank.seals || 0) + r.seals;
    save.toyo.seals = save.bank ? save.bank.seals : (save.toyo.seals || 0) + r.seals;
    out.seals = r.seals; if (r.free) out.free = r.free;
  } else if (r.kind === 'kin') {
    save.toyo = newToyoState(save.toyo || {});
    save.toyo.kin = (save.toyo.kin || 0) + r.kin; out.kin = r.kin;
  } else {
    let b = null;
    if (r.kind === 'aUp') b = rollAUp(rng);
    else if (r.kind === 'gen') b = BUSHOU_BY_ID[r.id] || null;
    else b = choicesOf(r, now).find((x) => x.id === pickId) || null;
    if (!b) return null;
    Object.assign(out, give(save, b));
  }
  t.got[n] = 1;
  return out;
}
