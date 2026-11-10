// 勝った戦の印（kaito 11/2 P「攻略済みの印」「無料の戦は前の戦に勝てば必ず開く」）。
// 本陣から選んだ試しの戦（保存の G に記録を残さない）で勝っても覚えるよう、保存（state.js）と別の鍵に戦の id を持つ。
const KEY = 'risshin_cleared';

export function clearedIds() {
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
// 戦に勝った時に呼ぶ（main.js の戦の終わり）
export function markCleared(id) {
  if (!id) return;
  const a = clearedIds();
  if (a.includes(id)) return;
  a.push(id);
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* 書けなくても遊びは止めない */ }
}
