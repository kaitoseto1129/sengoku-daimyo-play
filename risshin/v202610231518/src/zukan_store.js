// 図鑑・実績・稽古場の記録の読み書き（localStorage）。zukan.js・screens.js が同じ書式を読むよう、ここ一か所にまとめる
export const ZK_KEY = 'sengoku-risshin-zukan';
const DOJO_KEY = 'sengoku-risshin-dojo';
const DOJO_DETAIL_KEY = 'sengoku-risshin-dojo-detail';
export const ZK_EMPTY = () => ({ v: 1, met: {}, ach: {}, n: { kills: 0, battles: 0 } });
// 図鑑の記録（読めなければ空）。いつも読み直す
export function readZukanRaw() {
  const base = ZK_EMPTY();
  try {
    const s = JSON.parse(localStorage.getItem(ZK_KEY) || 'null');
    if (s && typeof s === 'object') return { ...base, ...s, met: s.met || {}, ach: s.ach || {}, n: { ...base.n, ...(s.n || {}) } };
  } catch (e) { /* 読めなければ空から */ }
  return base;
}
export function readDojoBest() { try { return +(localStorage.getItem(DOJO_KEY) || 0); } catch (e) { return 0; } }
export function readDojoDetail() { try { return JSON.parse(localStorage.getItem(DOJO_DETAIL_KEY) || 'null'); } catch (e) { return null; } }
// 保存コードへ入れる分
export function exportExtra() {
  const extra = {};
  extra.zk = JSON.parse(localStorage.getItem(ZK_KEY) || 'null'); extra.dojo = localStorage.getItem(DOJO_KEY);
  return extra;
}
// 保存コードから戻す分：図鑑・実績はいまの記録と合わせる（消さない）。稽古場は良い方
export function mergeExtra(ex) {
  if (!ex) return;
  try {
    if (ex.zk) {
      const cur = readZukanRaw();
      const m = { ...cur, met: { ...ex.zk.met, ...cur.met }, ach: { ...ex.zk.ach, ...cur.ach }, at: { ...(ex.zk.at || {}), ...(cur.at || {}) }, n: { kills: Math.max(cur.n?.kills || 0, ex.zk.n?.kills || 0), battles: Math.max(cur.n?.battles || 0, ex.zk.n?.battles || 0) } };
      localStorage.setItem(ZK_KEY, JSON.stringify(m));
    }
    if (ex.dojo && +ex.dojo > readDojoBest()) localStorage.setItem(DOJO_KEY, String(ex.dojo));
  } catch (e) { /* 書けなくても保存だけで続ける */ }
}
