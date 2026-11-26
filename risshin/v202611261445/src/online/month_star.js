// 月の大物（O9・K636）：暦の月ごとに SSR を 1〜3 人、登用の目当てに前に出す。登用の率は変えない（前に出すだけ）。
//   その月に始まる週で初めて出る SSR があればその人（三人まで）。無い月は、その月の頭で出ている SSR から月ごとに回して一人。
//   描かない純粋な決まり。試し：node prototype/tools/daily_reason_year.mjs
import { WEEKS, weekFrom, openSet, toyoNow, isOpen } from './toyo_calendar.js';
import { BUSHOU_BY_ID } from './bushou_online.js';

const mkey = (d) => d.getFullYear() * 12 + d.getMonth();
let cache = null;
function table() {
  if (cache) return cache;
  const M = new Map();   // 月の通し番号 → { fresh:[id], first:週の番号 }
  WEEKS.forEach((w, i) => {
    const k = mkey(weekFrom(i)), e = M.get(k) || { fresh: [], first: i };
    for (const id of w.add) if (BUSHOU_BY_ID[id]?.rank === 'SSR' && !e.fresh.includes(id)) e.fresh.push(id);
    M.set(k, e);
  });
  cache = M; return M;
}
// その月の大物（id の並び・1〜3 人）。暦の外の月（12/1 より前・暦の終わりの後）は今出ている SSR から一人
export function monthStars(now) {
  const t = toyoNow(now), M = table(), e = M.get(mkey(t));
  if (e && e.fresh.length) return e.fresh.slice(0, 3);
  const i = e ? e.first : 0, pool = [...openSet(weekFrom(i))].filter((id) => BUSHOU_BY_ID[id]?.rank === 'SSR');
  if (!pool.length) return [];
  pool.sort();
  return [pool[(mkey(t) * 5) % pool.length]];
}
// 登用の目当ての並びへ足す（既にある人は足さない・解禁前は足さない・全部で四人まで）
export function withStars(focus, now) {
  const out = [...(focus || [])];
  for (const id of monthStars(now)) if (out.length < 4 && !out.includes(id) && isOpen(id, now)) out.push(id);
  return out;
}
