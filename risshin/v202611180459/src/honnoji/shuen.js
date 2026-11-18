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
  const fade = 'position:relative;z-index:1;opacity:0;transition:opacity 2s ease';
  el.innerHTML = '<div data-k="b" style="font-size:clamp(15px,2.4vw,20px);letter-spacing:.15em;line-height:1.9;' + fade + '">備中高松　羽柴の陣<br>夜更けに、京からの早馬が着いた</div>'
    + '<div data-k="h" style="font-size:clamp(15px,2.4vw,20px);letter-spacing:.15em;' + fade + '">秀吉は知らせを開き、しばらく黙った</div>'
    + '<div data-k="t" style="margin-top:18px;font-size:clamp(34px,7vw,64px);letter-spacing:.3em;' + fade + '">織田信長　死す</div>'
    + '<div data-k="d" style="font-size:clamp(15px,2.4vw,20px);letter-spacing:.2em;' + fade + '">天正十年六月二日</div>'
    + '<div data-k="l" style="margin-top:14px;font-size:clamp(14px,2vw,17px);letter-spacing:.12em;line-height:1.8;color:#cfc4ae;' + fade + '">本能寺　落去／二条御所　落去<br>織田信長　死去／織田信忠　死去<br>最後の任務　急報を伝える　果たした</div>'
    + '<div data-k="e" style="margin-top:22px;font-size:clamp(16px,2.8vw,24px);letter-spacing:.4em;' + fade + '">中国大返しへ</div>';
  el.prepend(azuchiFar());
  document.body.appendChild(el);
  const dispose = rt.dispose.bind(rt);
  rt.dispose = () => { el.remove(); dispose(); };
  // 結果の画面が出たら外す（rt.dispose が呼ばれない道でも残さない）
  const t = setInterval(() => { if (!rt.over && el.isConnected) return; if (rt.ended || !el.isConnected) { clearInterval(t); setTimeout(() => el.remove(), 800); } }, 1000);
  return el;
}

// 締めの一枚（docs/battle_refs/honnoji.md・sengoku_itto_07「月夜に燃える天守の遠景」）：
// 湖の向こうの低い山の上で、安土の天守が燃える。細い月・煙・湖に映る火。字の後ろに薄く敷く（動かない絵）。
function azuchiFar() {
  const W = Math.max(320, innerWidth | 0), H = Math.max(240, innerHeight | 0);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = W * dpr; c.height = H * dpr;
  c.dataset.k = 'a';
  c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;opacity:0;transition:opacity 4s ease';
  const g = c.getContext('2d');
  if (!g) return c;
  g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#05070d'); sky.addColorStop(0.62, '#101522'); sky.addColorStop(0.7, '#1a1410'); sky.addColorStop(1, '#030405');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // 細い月（右上）
  const mx = W * 0.82, my = H * 0.16, mr = Math.min(W, H) * 0.035;
  g.fillStyle = '#d9d2b8'; g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#070a12'; g.beginPath(); g.arc(mx - mr * 0.45, my - mr * 0.15, mr * 0.95, 0, Math.PI * 2); g.fill();
  const hz = H * 0.7, tx = W * 0.3, top = H * 0.5;
  // 火の照り（空）
  const glow = g.createRadialGradient(tx, top, 4, tx, top, H * 0.45);
  glow.addColorStop(0, 'rgba(255,140,50,.55)'); glow.addColorStop(0.35, 'rgba(160,60,20,.22)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  // 煙（火の上へ斜めに流れる）
  for (let i = 0; i < 14; i++) {
    const t = i / 13, x = tx + t * W * 0.22, y = top - 10 - t * H * 0.38, r = 14 + t * H * 0.1;
    g.fillStyle = `rgba(${60 + 50 * (1 - t)},${40 + 20 * (1 - t)},${30},${0.3 * (1 - t * 0.5)})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // 安土山（湖の向こうの低い山）と麓の山並
  g.fillStyle = '#07080a';
  g.beginPath(); g.moveTo(0, hz);
  g.lineTo(W * 0.08, hz - H * 0.03); g.lineTo(W * 0.18, hz - H * 0.09); g.lineTo(tx - W * 0.03, top + H * 0.075);
  g.lineTo(tx + W * 0.04, top + H * 0.08); g.lineTo(W * 0.44, hz - H * 0.07); g.lineTo(W * 0.56, hz - H * 0.025);
  g.lineTo(W * 0.72, hz - H * 0.05); g.lineTo(W, hz - H * 0.02); g.lineTo(W, hz); g.closePath(); g.fill();
  // 天守（五重の段を下から細く積む・火で縁が赤い）
  const base = top + H * 0.078, u = Math.min(W, H) * 0.016;
  const tiers = [[7.5, 2.4], [6.2, 2.2], [5.4, 2.0], [4.2, 1.9], [3.2, 2.1]];
  let y = base;
  for (let i = 0; i < tiers.length; i++) {
    const [hw, hh] = tiers[i];
    g.fillStyle = '#0b0807'; g.fillRect(tx - hw * u, y - hh * u, hw * 2 * u, hh * u);
    g.fillStyle = 'rgba(255,120,40,.85)'; g.fillRect(tx - hw * u * 1.12, y - hh * u, hw * 2.24 * u, Math.max(1, u * 0.25));
    if (i < 3) { g.fillStyle = 'rgba(255,170,70,.9)'; g.fillRect(tx - hw * u * 0.6, y - hh * u * 0.62, hw * u * 1.2, u * 0.5); }
    y -= hh * u;
  }
  // 炎（上の二重を包む揺らぐ塊と、火の粉）
  for (let i = 0; i < 12; i++) {
    const x = tx + (((i * 41) % 11) - 5) * u * 0.9, yy = y + u * (3 - ((i * 23) % 7) * 0.9), r = u * (2.2 + ((i * 17) % 5) * 0.7);
    const fl = g.createRadialGradient(x, yy, 0, x, yy - r * 0.4, r * 1.6);
    fl.addColorStop(0, 'rgba(255,215,120,.85)'); fl.addColorStop(0.45, 'rgba(255,120,35,.5)'); fl.addColorStop(1, 'rgba(120,30,10,0)');
    g.fillStyle = fl; g.beginPath(); g.ellipse(x, yy - r * 0.5, r * 0.8, r * 1.5, 0, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(255,${150 + (i % 4) * 20},60,${0.4 + (i % 3) * 0.2})`;
    g.fillRect(tx + (((i * 67) % 23) - 8) * u * 0.9, y - u * (2 + ((i * 31) % 19) * 1.1), 1.5, 1.5);
  }
  // 湖（暗い水面に火と月の映り）
  g.fillStyle = '#04060a'; g.fillRect(0, hz, W, H - hz);
  for (let i = 0; i < 22; i++) {
    const yy = hz + 3 + i * (H - hz) / 24, w = (W * 0.05) * (1 - i / 30) * (0.6 + ((i * 53) % 7) / 10);
    g.fillStyle = `rgba(255,${120 + (i % 3) * 20},50,${0.5 * (1 - i / 24)})`; g.fillRect(tx - w / 2 + ((i * 29) % 9 - 4), yy, w, 1.5);
    g.fillStyle = `rgba(210,205,180,${0.25 * (1 - i / 24)})`; g.fillRect(mx - w * 0.2, yy, w * 0.4, 1);
  }
  // 字を読ませるため、真ん中を少し沈める
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, W * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,.55)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return c;
}

export function wrap(def) {
  const win = def.win;
  def.win = function (r) {
    const F = r.flags;
    if (!k15Off(r) && !F.ending && !F.k15glow && r.player.u.alive && !r.over) {
      // 未達なら字幕を出さず、本体へ渡して理由を示す。ここで止めると使者の家で決着しない。
      if (F.step !== 7 || !this.goals5(r).slice(0, 4).every((goal) => goal.check(r))) return win.call(this, r);
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
        [4, () => { show('a'); show('e'); }],
        [5, () => {}],
      ]);
    }
    return win.call(this, r);
  };
}
