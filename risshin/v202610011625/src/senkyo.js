// 戦況（senkyo.js）：docs/battle-system-plan.md 0-3・第1段。束1 は記録だけ（知らせ・身分の見え方・備の札は束6）
// logEvent(rt, k, o) で rt.senkyo.log に { t, k, team, who, v } を積む。試し（tools/mvp/*.js）がこれを読む。
// 記録は 600 件まで（古い物から捨てる）。毎コマは呼ばない（出来事の時だけ）

const MAX_LOG = 600;

export function senkyoOf(rt) {
  return rt.senkyo || (rt.senkyo = { log: [] });
}

// k：出来事の名（'state'・'taishoDown'・'moraleLow'・'rout'・'order' など）。o：{ team, who, v }
export function logEvent(rt, k, o = {}) {
  const L = senkyoOf(rt).log;
  L.push({ t: Math.round((rt.t || 0) * 10) / 10, k, team: o.team ?? null, who: o.who ?? null, v: o.v ?? null });
  if (L.length > MAX_LOG) L.splice(0, L.length - MAX_LOG);
  for (const f of hooks) f(rt, k, o);
}

// 出来事を聞く口（denrei.js が侍大将討死・敗走を知らせの広がりへ回す。束3）
const hooks = [];
export function onEvent(fn) { if (!hooks.includes(fn)) hooks.push(fn); }

// 試しが引く：k（と who）の最初の記録
export function firstEvent(rt, k, who) {
  const s = rt.senkyo;
  if (!s) return null;
  for (const e of s.log) if (e.k === k && (who == null || e.who === who)) return e;
  return null;
}
