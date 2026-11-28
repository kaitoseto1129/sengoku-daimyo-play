// 問屋の入口（K598）。ホーム（main.js hubOpts の tonya・hub.js の銭の字）はここを呼ぶ。中身は tonya_ui.js。
//   openTonya(game か G, { onBack | onClose, tab })：画面の上に問屋を開き、閉じたら onBack()。
//   zeniOf(G)：銭（文の数。G.kan 貫 × 1000）
import { openTonya as openUi } from './tonya_ui.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_tonya.js').then((m) => addEn(m.default)).catch(() => {});   // K516：問屋の馬などの英訳（英語の時だけ読む）
export { zeniOf } from './choku.js';
export { tonyaKitHtml, kobanToZeni, kobanOf } from './tonya_ui.js';
export function openTonya(x, o = {}) {
  const G = x && typeof x === 'object' && 'G' in x && !('kan' in x) ? x.G : x;
  return openUi(G, { tab: o.tab, buyKoban: o.buyKoban, onClose: o.onClose || o.onBack });
}
