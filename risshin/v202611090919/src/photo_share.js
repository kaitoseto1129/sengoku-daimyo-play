// 写真の場面（kaito 11/1）：撮った一枚を写真に保存・共有する口と、触る画面での操作。
// 字は出さない。押せる所は丸い印（シャッター・戻る）だけ。指でなぞると見回し、左の半分をなぞると歩く。

// 今の描画を二次元の画布へ写し、色合いを焼き込んで PNG の Blob にする（描いた直後に呼ぶ）。
export function photoBlob(src, filter) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  if (filter && 'filter' in g) g.filter = filter;
  g.drawImage(src, 0, 0);
  const url = c.toDataURL('image/png');
  return new Promise((ok) => {
    if (c.toBlob) c.toBlob((b) => ok({ blob: b, url }), 'image/png'); else ok({ blob: null, url });
  });
}

// iOS・Android の共有の小窓（写真に保存も入る）。使えない所では、撮った絵を大きく出して長押しで保存。
export async function photoShare(shot, onDone) {
  const name = `sengoku-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.png`;
  try {
    const file = shot.blob && typeof File === 'function' ? new File([shot.blob], name, { type: 'image/png' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      onDone?.(true);
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') { onDone?.(false); return; }
  }
  const d = document.createElement('div');
  d.className = 'shot';
  d.innerHTML = `<img src="${shot.url}" alt="撮った一枚"><a class="btn" download="${name}" href="${shot.url}" aria-label="保存する" style="min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;margin-top:8px">⤓</a>`;
  d.onclick = (e) => { if (e.target.tagName !== 'A') d.remove(); };
  document.body.appendChild(d);
  onDone?.(true);
}

// 触る画面の写真の操作。ph は main.js の game.photo（x・y・z・yaw・pitch）。
// 返す物の dispose で外す。シャッターは onShot、戻るは onExit。
export function photoTouch(ph, onShot, onExit) {
  const root = document.createElement('div');
  root.id = 'photo-touch';
  root.style.cssText = 'position:fixed;inset:0;z-index:21;touch-action:none';
  const btn = (label, glyph, css, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('aria-label', label); b.textContent = glyph;
    b.style.cssText = 'position:absolute;width:64px;height:64px;border-radius:50%;border:3px solid rgba(240,232,214,.9);background:rgba(12,10,8,.45);color:#f0e8d6;font-size:24px;line-height:1;' + css;
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    root.appendChild(b);
    return b;
  };
  btn('撮る', '', 'right:calc(20px + env(safe-area-inset-right,0px));top:50%;transform:translateY(-50%);background:rgba(240,232,214,.85)', onShot);
  btn('写真を終えて戦へ戻る', '✕', 'left:calc(16px + env(safe-area-inset-left,0px));top:calc(12px + env(safe-area-inset-top,0px));width:48px;height:48px;font-size:20px', onExit);
  const touches = new Map();
  root.addEventListener('pointerdown', (e) => { touches.set(e.pointerId, { x: e.clientX, y: e.clientY, move: e.clientX < window.innerWidth * 0.4 }); root.setPointerCapture?.(e.pointerId); });
  root.addEventListener('pointermove', (e) => {
    const t = touches.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    t.x = e.clientX; t.y = e.clientY;
    if (t.move) {
      // 左の半分：なぞった向きへ歩く（上へなぞると前へ）
      const fx = Math.sin(ph.yaw), fz = Math.cos(ph.yaw), k = 0.03;
      ph.x += (-fx * dy - Math.cos(ph.yaw) * dx) * k; ph.z += (-fz * dy + Math.sin(ph.yaw) * dx) * k;
    } else {
      ph.yaw -= dx * 0.005; ph.pitch = Math.max(-1.3, Math.min(1.2, ph.pitch - dy * 0.004));
    }
  });
  const up = (e) => touches.delete(e.pointerId);
  root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
  document.body.appendChild(root);
  return { dispose() { root.remove(); touches.clear(); } };
}
