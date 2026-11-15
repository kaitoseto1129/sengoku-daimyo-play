// K314・K073（kaito 11/15「パソコンでも合戦が重い」）：パソコン（MEM_TIGHT でない）も、戦の最中に
//   数秒の平均のコマの間隔が目標（上限の 1.35 倍）を二回続けて超えたら、描く倍率→影の順に一段ずつ下げる。
//   字や札は出さない。戦が変わったら元の段（0）に戻す。携帯は熱の段（heatStep）が受け持つ。
const WIN = 4, COOL = 6;   // 平均を取る秒・段を下げた後に待つ秒
export const pcq = { bad: 0, step: 0, acc: 0, n: 0, wait: 0, battle: null };
window.__pcq = pcq;   // 確かめ用
// 毎コマ呼ぶ。段が変わった時だけ true（呼び手が倍率を作り直す）
export function pcqSample(battle, elapsed, cap, active) {
  if (!/[?&]pcq=on/.test(location.search)) return false;   // 11/15 kaito「画質は高しか認めない」＝自動で画質を下げる仕組みは既定で止める（?pcq=on の時だけ動く）
  if (battle !== pcq.battle) { pcq.battle = battle; const was = pcq.step; pcq.step = 0; pcq.acc = pcq.n = pcq.wait = 0; return was !== 0; }
  if (!active || /[?&]nopcq/.test(location.search)) { pcq.acc = pcq.n = 0; return false; }
  if (pcq.wait > 0) { pcq.wait -= elapsed; return false; }
  pcq.acc += elapsed; pcq.n++;
  if (pcq.acc < WIN) return false;
  const avg = pcq.acc / pcq.n; pcq.acc = pcq.n = 0;
  pcq.bad = avg > 1.35 / (cap || 60) ? pcq.bad + 1 : 0;   // 二回続けて遅い時だけ（一度の揺れで下げない）
  if (pcq.bad >= 2 && pcq.step < 3) { pcq.step++; pcq.bad = 0; pcq.wait = COOL; return true; }
  return false;
}
// 段ごとの描く倍率（1・.85・.7・.6）。段2から影を切る
export const pcqRatio = () => [1, .85, .7, .6][pcq.step];
export const pcqNoShadow = () => pcq.step >= 2;
