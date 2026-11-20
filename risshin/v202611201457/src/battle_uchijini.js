// 11/20 K401：名のある武将が討ち死にしたら、画面の真ん中に「〇〇 討ち死に」を出す（kaito が頼んだ字）。全戦共通。
// 戦の画面では hud.banner が出ない決まりなので、自前の一枚を #hud の上に置く。同じ文は八秒に一度。
let el = null;
export function showUchijini(rt, text) {
  const root = document.getElementById('hud') || document.body;
  if (!el || !el.isConnected) {
    el = document.createElement('div');
    el.id = 'uchijini';
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);z-index:60;pointer-events:none;'
      + 'padding:10px 28px;background:rgba(18,14,12,.82);border-top:2px solid #b8402e;border-bottom:2px solid #b8402e;'
      + 'color:#f4ead6;font:700 24px/1.4 serif;letter-spacing:.12em;white-space:nowrap;opacity:0;transition:opacity .35s';
    root.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(el._t);
  if (!window.__keepUchijini) el._t = setTimeout(() => { el.style.opacity = '0'; }, 4500);
}
