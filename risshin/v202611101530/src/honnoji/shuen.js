// ======================================================================
// 本能寺の変　織田編の終わり（14〜15分・docs/oda15_plan_1108.md 32「暗転・『本能寺の変』・織田編終了」）
// 元の勝ち（win）の語りの後、すぐ結果へ行かず：京の空の煙を振り返る → 使者が西へ駆け去る →
// 暗転 → 備中の羽柴の陣 →「織田信長　死す」→「天正十年六月二日」→ 落ちた物 →「中国大返しへ」を、三十秒ほど見せてから結果へ。
// 入れ方：b_honnoji.js で wrap(honnoji) を一度。def.win を包む（信長で遊ぶ時は元のまま）。
// ======================================================================
import { k15Off, k15Afterglow } from '../oda15_kit.js';
import { sfx } from '../audio.js';

function curtain(rt) {
  const el = document.createElement('div');
  el.id = 'k15-curtain';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;inset:0;z-index:40;background:#000;opacity:0;transition:opacity 2.4s ease;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#efe6d2;font-family:"Hiragino Mincho ProN","Yu Mincho",serif;text-align:center';
  // 11/9 kaito 仕様（docs/honnoji_spec_1109.md 終幕）：備中高松の羽柴の陣に早馬が着き、秀吉が知らせを開く→暗転→
  // 「織田信長　死す」→「天正十年六月二日」→「中国大返しへ」。最後は明るい勝ちにせず、落ちた物と果たした任務を並べる。
  const fade = 'opacity:0;transition:opacity 2s ease';
  el.innerHTML = '<div data-k="b" style="font-size:clamp(15px,2.4vw,20px);letter-spacing:.15em;line-height:1.9;' + fade + '">備中高松　羽柴の陣<br>夜更けに、京からの早馬が着いた</div>'
    + '<div data-k="h" style="font-size:clamp(15px,2.4vw,20px);letter-spacing:.15em;' + fade + '">秀吉は知らせを開き、しばらく黙った</div>'
    + '<div data-k="t" style="margin-top:18px;font-size:clamp(34px,7vw,64px);letter-spacing:.3em;' + fade + '">織田信長　死す</div>'
    + '<div data-k="d" style="font-size:clamp(15px,2.4vw,20px);letter-spacing:.2em;' + fade + '">天正十年六月二日</div>'
    + '<div data-k="l" style="margin-top:14px;font-size:clamp(14px,2vw,17px);letter-spacing:.12em;line-height:1.8;color:#cfc4ae;' + fade + '">本能寺　落去／二条御所　落去<br>織田信長　死去／織田信忠　死去<br>最後の任務　急報を伝える　果たした</div>'
    + '<div data-k="e" style="margin-top:22px;font-size:clamp(16px,2.8vw,24px);letter-spacing:.4em;' + fade + '">中国大返しへ</div>';
  document.body.appendChild(el);
  const dispose = rt.dispose.bind(rt);
  rt.dispose = () => { el.remove(); dispose(); };
  // 結果の画面が出たら外す（rt.dispose が呼ばれない道でも残さない）
  const t = setInterval(() => { if (!rt.over && el.isConnected) return; if (rt.ended || !el.isConnected) { clearInterval(t); setTimeout(() => el.remove(), 800); } }, 1000);
  return el;
}

export function wrap(def) {
  const win = def.win;
  def.win = function (r) {
    const F = r.flags;
    if (!k15Off(r) && !F.ending && !F.k15glow && r.player.u.alive && !r.over) {
      F.k15glow = true;
      let el = null;
      const show = (k) => { const q = el?.querySelector(`[data-k="${k}"]`); if (q) q.style.opacity = '1'; };
      k15Afterglow(r, [
        [1, () => r.banner('京の空', '東の空に、本能寺と二条の煙が高く上る')],
        [5, () => r.say('使者', '備中高松へ。羽柴筑前守様へ、必ず', 3)],
        [4, () => { el = curtain(r); requestAnimationFrame(() => { if (el) el.style.opacity = '1'; }); sfx('neigh', 0.35); }],
        [2.5, () => show('b')],
        [3.5, () => show('h')],
        [3.5, () => { sfx('kane', 0.35); show('t'); }],
        [3, () => show('d')],
        [3, () => show('l')],
        [4, () => show('e')],
        [5, () => {}],
      ]);
    }
    return win.call(this, r);
  };
}
