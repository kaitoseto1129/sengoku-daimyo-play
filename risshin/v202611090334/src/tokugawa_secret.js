// 徳川編の秘密の最後の戦（k16_secret）の錠（kaito 11/1 夜・docs/chapter3_tokugawa.md「出世と軍勢・秘密の最後の戦」）。
// 徳川編の15戦（TOKUGAWA_PLAN の k01〜k15）にすべて勝つと開く。勝った戦の id は保存（state.js）と別の鍵に覚える。
// 開発と確かめは URL に ?secret を付けると開く。
import { TOKUGAWA_PLAN } from './tokugawa_plan.js';

export const SECRET_ID = 'k16_secret';
const KEY = 'risshin_toku_won';

export function tokuWon() {
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
// 徳川編の戦に勝った時に呼ぶ（main.js の戦の終わり）
export function markTokuWon(id) {
  if (!id || !/^k\d\d_/.test(id)) return;
  const a = tokuWon();
  if (a.includes(id)) return;
  a.push(id);
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* 書けなくても遊びは止めない */ }
}
export function secretOpen() {
  if (typeof location !== 'undefined' && /[?&]secret\b/.test(location.search)) return true;
  const won = new Set(tokuWon().map((id) => id.slice(0, 3)));
  return TOKUGAWA_PLAN.every((p) => won.has(p.id.slice(0, 3)));
}
// まだ勝っていない徳川編の戦の数（錠の札に出す）
export function secretLeft() {
  const won = new Set(tokuWon().map((id) => id.slice(0, 3)));
  return TOKUGAWA_PLAN.filter((p) => !won.has(p.id.slice(0, 3))).length;
}
