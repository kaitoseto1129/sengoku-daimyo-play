// 画面の大きさ（innerWidth・innerHeight）の写し。コマの初め（main.js の輪）と大きさが変わった時だけ読む。
//   札を書き換えた後に innerWidth を読むと、その場で配置をやり直して重いコマになる（携帯で目立つ）。毎コマの計算はこちらを使う
export const VIEW = { w: window.innerWidth, h: window.innerHeight };
export function viewSync() { VIEW.w = window.innerWidth; VIEW.h = window.innerHeight; }
addEventListener('resize', viewSync);

// 安全な余白は大きさや向きが変わった時だけ測り、頭上の印にも使う。
const safe = { left: 0, right: 0, top: 0, bottom: 0 };
let safeProbe, safeKey;
export function safeInsets() {
  const key = `${VIEW.w}/${VIEW.h}/${window.screen?.orientation?.angle ?? window.orientation ?? 0}`;
  if (safeKey === key) return safe;
  if (!safeProbe) {
    safeProbe = document.createElement('div');
    safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(safeProbe);
  }
  const css = getComputedStyle(safeProbe);
  safe.left = parseFloat(css.paddingLeft) || 0; safe.right = parseFloat(css.paddingRight) || 0;
  safe.top = parseFloat(css.paddingTop) || 0; safe.bottom = parseFloat(css.paddingBottom) || 0;
  safeKey = key;
  return safe;
}
addEventListener('orientationchange', () => { safeKey = null; });
