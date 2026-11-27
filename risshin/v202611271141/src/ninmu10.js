// K669 任務の字を kaito の直した紙（ninmu10_words.js）の言葉に。画面に出す時だけ。判定・合図・bot・英語の表は元の字のまま。
// 今の段の字に一番近い行（二文字ずつの重なり）を、その戦の紙から選ぶ。近い行が無ければ替えない（旗印・台詞は触らない）。
import { NINMU10 } from './ninmu10_words.js';
import { isEn } from './i18n.js';
let cur = null;
const grams = (s) => { const a = new Set(); for (let i = 0; i < s.length - 1; i++) a.add(s.slice(i, i + 2)); return a; };
const cache = new Map();
export function ninmuBattle(scn, id) { cur = NINMU10[scn + ':' + id] || null; cache.clear(); }
export function ninmuText(t) {
  if (!cur || isEn() || !t || t.length < 7 || !/[。、]|[るれけろえせめべよ]$|[らうく]$/.test(t)) return t;
  let r = cache.get(t); if (r !== undefined) return r;
  const clean = t.replace(/[①-⑳]/g, ''); r = t;
  if (cur.includes(clean)) { cache.set(t, t); return t; }
  const g = grams(clean); let best = 0, pick = null;
  for (const m of cur) { const h = grams(m); let n = 0; for (const x of g) if (h.has(x)) n++; const s = 2 * n / (g.size + h.size); if (s > best) { best = s; pick = m; } }
  if (pick && best >= 0.3) r = pick;
  cache.set(t, r); return r;
}
