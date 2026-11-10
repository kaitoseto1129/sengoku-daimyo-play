// 負けが続いた時のやさしくする手当て（docs/rank_interlude_retry_spec_1108.md 3「やさしくする」・kaito 11/8）。
// その戦だけ。軍（army）に Symbol の鍵で置く：やり直しの写し（battle_retry.js）は Object.keys で写すので、
//   Symbol の鍵は写されず、「直前から再開」で戻しても消えない。次の戦は新しい軍なので、何もしなくても元に戻る。
// support（援護を強くする）：味方の手が少し速い（+12%）・味方の士気が落ちにくい・敵が本人へ集まりすぎない
// easy（この局面を易しくする）：本人の受ける傷 -20%・敵の手 -10%（攻めの間が 1.11 倍）
export const ASSIST = Symbol('assist');
export const assistOf = (army) => (army && army[ASSIST]) || null;
export function setAssist(army, o) {
  if (!army) return;
  const a = army[ASSIST] || (army[ASSIST] = { support: false, easy: false });
  if (o.support) a.support = true;
  if (o.easy) a.easy = true;
}
// 攻めの間の倍率（army_think の tierCd に掛ける）
export function assistCd(army, u) {
  const a = army[ASSIST], P = army.playerUnit;
  if (!a || !P) return 1;
  if (u.team !== P.team) return a.easy ? 1.11 : 1;
  return a.support && !u.isPlayer ? 0.89 : 1;
}
