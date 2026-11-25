// K648（kaito 11/25「コンティニューもゲーム内資金（小判）を使わないとできないように」）：負けた・倒れた後に続けるのは小判だけ。
//   枚数はここ一か所の定数（CONTINUE_KOBAN）。小判の箱は online/house.js と同じ risshin_online_v1 の toyo.kin（state.js の保存には触れない）。
//   減らすのは一回の押しで一度だけ（payContinue は同じ印で二度減らさない）。続けるのに失敗したら refundContinue で戻す。
export const CONTINUE_KOBAN = 50;   // 11/25 窓口：kaito「まかせる」で一回 小判50枚に決まった
const KEY = 'risshin_online_v1';
const box = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } };
function put(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { return false; }
  try { window.dispatchEvent(new CustomEvent('risshin-online-saved', { detail: o })); } catch (e) { /* 古い端末 */ }
  return true;
}
export const kobanHave = () => Math.max(0, Math.floor(box().toyo?.kin || 0));
export const canContinue = (n = CONTINUE_KOBAN) => kobanHave() >= n;
const paid = new Set();   // 一つの倒れ（印）に一度だけ
// 小判を減らす。足りない・保存できない・同じ印で二度目なら false（何も変えない）
export function payContinue(tag, n = CONTINUE_KOBAN) {
  if (paid.has(tag)) return false;
  const o = box(), have = Math.max(0, Math.floor(o.toyo?.kin || 0));
  if (have < n) return false;
  o.toyo = { ...(o.toyo || {}), kin: have - n };
  o.toyo.kobanLog = [...(o.toyo.kobanLog || []).slice(-30), { t: Date.now(), koban: n, use: 'continue' }];
  if (!put(o) || kobanHave() !== have - n) return false;   // 書けなかった端末では続けさせない（減らずに続くのを防ぐ）
  paid.add(tag);
  return true;
}
export function refundContinue(tag, n = CONTINUE_KOBAN) {
  if (!paid.delete(tag)) return;
  const o = box();
  o.toyo = { ...(o.toyo || {}), kin: Math.max(0, Math.floor(o.toyo?.kin || 0)) + n };
  o.toyo.kobanLog = [...(o.toyo.kobanLog || []).slice(-30), { t: Date.now(), koban: -n, use: 'continue-refund' }];
  put(o);
}
