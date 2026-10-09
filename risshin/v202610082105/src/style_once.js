// 画面の <style> を一度だけ head に入れる（描き直すたびに同じ CSS を作り直さない）。入れたら空の字を返す
// css は <style>…</style> で包んであっても、中身だけでもよい。head に入れられない時は css をそのまま返す
export function styleOnce(id, css) {
  try {
    const key = 'so-' + id;
    if (document.getElementById(key)) return '';
    const el = document.createElement('style');
    el.id = key;
    el.textContent = String(css).replace(/^\s*<style[^>]*>/i, '').replace(/<\/style>\s*$/i, '');
    document.head.appendChild(el);
    return '';
  } catch (e) { return String(css); }
}
