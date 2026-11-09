// 記憶の少ない端末（iPhone 11 ＝ A13 以前・RAM 3〜4GB）を見分ける（10/23 Lancers：iPhone 11 の Safari で四つの戦とも落ちた）。
//   iPhone の Safari と WKWebView は GPU の名を「Apple GPU」としか返さないので、画面の大きさと画素の倍率で当てる。
//   ・倍率 2 の iPhone（XR・11・SE 2/3・8 以前）・短辺 375 以下（X・XS・11 Pro・12/13 mini）・414×896 の倍率 3（XS Max・11 Pro Max）は弱い。
//   ・393×852・402×874・428×926・430×932・440×956 は強い（今のまま）。
//   ・iPad は 768×1024 の倍率 2（無印 5〜9 世代・mini 4/5・Air 2）を弱いとする。
//   ・deviceMemory が 4GB 以下なら弱い（Chrome の 8GB は上限値なので高性能端末も含む）。
//   ・GPU が Mali・Adreno 6xx 以下と 700〜729（Xperia 10 VII の 710 など中の下）・PowerVR、Windows の Intel UHD/Iris も弱い。
//   ・戦の途中で頁が読み直された（落ちた）機械も、次から弱いとする（risshin-weak）。
//   試し：?weak=1 で弱い作り・?weak=0 で強い作りに決める。
const q = typeof location !== 'undefined' ? location.search : '';
function detect() {
  if (/[?&]weak=1/.test(q)) return 'url';
  if (/[?&]weak=0/.test(q)) return '';
  // 実機の試し：-autoplay x_weak,… は落ちた後の弱い作りで遊ぶ（前の日の実機の数と同じ条件で比べる）
  if (typeof window !== 'undefined' && /\bx_weak\b/.test(String(window.__autoplay || ''))) return 'url';
  // 実機の試し：-autoplay x_fresh,… は前に落ちた印を消して、初めての人と同じ作りで遊ぶ
  try { if (typeof window !== 'undefined' && /\bx_fresh\b/.test(String(window.__autoplay || ''))) localStorage.removeItem('risshin-weak'); } catch (e) { /* 保存が無ければそのまま */ }
  try { if (localStorage.getItem('risshin-weak') === '1') return 'crashed'; } catch (e) { /* 保存が無くても見分ける */ }
  if (typeof navigator === 'undefined' || typeof screen === 'undefined') return '';
  const ua = navigator.userAgent || '';
  const s = Math.min(screen.width, screen.height), l = Math.max(screen.width, screen.height), r = Math.round(window.devicePixelRatio || 1);
  if (/iPhone|iPod/.test(ua)) {
    if (r <= 2) return 'iphone-2x';
    if (s <= 375) return 'iphone-small';
    if (s === 414 && l === 896) return 'iphone-xsmax';
    // 390×844 は iPhone 12・13（RAM 4GB）を含む。12 で稲生の耐える段に落ちた（Lancers 10/24）。14・16e も同じ画面なので弱い作りに入る。
    if (s === 390 && l === 844) return 'iphone-390';
    return '';
  }
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iPad) return s <= 768 && l <= 1024 ? 'ipad-old' : '';
  if (navigator.deviceMemory && navigator.deviceMemory <= 4) return 'mem' + navigator.deviceMemory;
  return '';
}
const why = detect();
export const TIER = { weak: !!why, why };
// GPU の名でも見る（WebGL ができた後に一度だけ。iPhone は名が出ないので変わらない）
export function noteGL(gl) {
  if (TIER.weak || /[?&]weak=0/.test(q) || !gl) return;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '');
    const windowsIntel = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent || '') && /Intel.*(?:UHD|Iris)/i.test(name);
    const modernMali = /(?:Mali.*G(?:7[12]\d|9\d\d)|Immortalis)/i.test(name);
    if (/Adreno\s*(?:\(TM\)\s*)?(?:[0-6]\d\d|7[0-2]\d)\b|PowerVR/i.test(name) || /Mali/i.test(name) && !modernMali || windowsIntel || gl.getParameter(gl.MAX_TEXTURE_SIZE) < 8192) { TIER.weak = true; TIER.why = 'gpu:' + name.slice(0, 40); }
  } catch (e) { /* 判らなければ強いまま */ }
}
// 戦の途中の印。戦の外へ出る前に頁が読み直されたら、落ちたと見なして次から弱い作りに。
try {
  if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('risshin-inbattle') === '1' && !/[?&]weak=0/.test(q)) {
    localStorage.setItem('risshin-weak', '1'); TIER.weak = true; TIER.why ||= 'reloaded';
  }
} catch (e) { /* 保存できなければ見ない */ }
export function markInBattle(on) {
  try { if (on) sessionStorage.setItem('risshin-inbattle', '1'); else sessionStorage.removeItem('risshin-inbattle'); } catch (e) { /* 保存できなければ見ない */ }
}
export function markCrashed() { TIER.weak = true; TIER.why ||= 'crashed'; try { localStorage.setItem('risshin-weak', '1'); } catch (e) { /* 保存できなければ今回だけ */ } }
// 弱い端末の絵の一辺の上限（2048 の絵を 1024 へ。three が送る時に縮める）
export const WEAK_TEX_MAX = 1024;

// Android（携帯・タブレット）。大きなタブレットの Chrome は既定で「パソコン版サイト」を開き、名乗りが Linux のパソコンになる
//   （10/26 Lancers：Xiaomi Pad 8 がパソコンの作りで描いて、乱戦がずっとカクカク）。Linux でも指で触る画面なら Android とみなす。
//   試し：?android=0 で前の見分け（名乗りだけ）に戻す。
export const ANDROID = typeof navigator !== 'undefined' && !/[?&]android=0/.test(q) && (/Android/i.test(navigator.userAgent || '') ||
  /Linux/.test(navigator.userAgent || '') && !/CrOS/.test(navigator.userAgent || '') && navigator.maxTouchPoints > 0 &&
  typeof matchMedia !== 'undefined' && matchMedia('(any-pointer: coarse)').matches);
// 倍率だけでなく面積と長辺も制限する。端末の画素倍率を掛け直さない。
export function battleDrawRatio(w, h, tight, heat) {
  const base = tight ? (heat >= 1 ? .75 : .85) : 1;
  return ANDROID ? Math.min(base, .85, 1280 / Math.max(w, h), Math.sqrt(576000 / (w * h))) : base;
}
