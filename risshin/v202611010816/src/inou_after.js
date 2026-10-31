import { INOU_AFTER } from './after_history.js';
import { hideScreen } from './screens.js';

// 稲生の勝利後だけ読み込む。札と地図は一度組み、文と印だけを入れ替える。
export function inouAfterScene(onNext) {
  let page = 0, done = false;
  hideScreen();
  const root = document.getElementById('screen');
  root.hidden = false; root.className = '';
  root.innerHTML = `<style>
      .inou-after{box-sizing:border-box;width:min(960px,100%);margin:auto;padding:16px;color:var(--washi)}
      .inou-after h2{font-size:24px;margin:6px 0 12px}
      .inou-after-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:center}
      .inou-after svg{display:block;width:100%;height:auto;background:#24291f;border:1px solid #a99c7e;box-sizing:border-box}
      .inou-after p{font-size:16px;line-height:1.7;margin:8px 0}
      .inou-after blockquote{margin:12px 0;padding:8px 12px;border-left:3px solid #c2a25a;background:#242018;font-size:16px;line-height:1.7}
      .inou-after small{display:block;font-size:12px;line-height:1.6;color:var(--washi-dim)}
      .inou-after button{min-height:48px;width:100%;font-size:16px;margin-top:12px}
      .inou-after button:focus-visible{outline:3px solid #e6c578;outline-offset:3px}
      @media(max-height:520px) and (min-width:650px){.inou-after{padding:8px 16px}.inou-after h2{font-size:20px;margin:4px 0 8px}.inou-after-layout{gap:16px}.inou-after blockquote{margin:8px 0}}
      @media(max-width:649px){.inou-after-layout{grid-template-columns:1fr;gap:12px}}
    </style><section class="inou-after" aria-label="稲生の戦後の史実">
      <small data-page></small>
      <h2></h2><div class="inou-after-layout">
      <div><svg viewBox="0 0 440 260" role="img">
        <g fill="none" stroke="#59604a" stroke-width="2"><path d="M20 100H420M20 160H420M130 40V240M260 40V240M380 40V240"/></g>
        <g font-family="serif" font-size="18" fill="#fff3d7">
          <text x="20" y="28">尾張</text><text x="396" y="28">北↑</text>
          <circle cx="65" cy="75" r="6"/><text x="32" y="58">清洲</text>
          <circle cx="195" cy="95" r="7" fill="#d5b66e"/><text x="160" y="78">稲生原</text>
          <path d="M322 164H340V182H322Z" fill="#d5b66e"/><text x="303" y="152">末森城</text>
        </g>
        <g data-retreat><path d="M208 103L310 165M295 161L310 165L305 150" fill="none" stroke="#f0d085" stroke-width="4"/></g>
        <g data-fire display="none"><g stroke="#eda370" stroke-width="3" fill="none"><path d="M298 204l8-17 8 17M320 211l8-17 8 17M342 204l8-17 8 17"/></g><text x="240" y="235" fill="#ffd3b5" font-size="18">城下の火</text></g>
        <g data-note display="none"><rect x="26" y="194" width="388" height="42" rx="4" fill="#393424"/><text x="220" y="221" text-anchor="middle" fill="#fff3d7" font-size="18"></text></g>
      </svg><small>位置と道は目安。</small></div>
      <div><p data-history></p>
        <blockquote><b></b><br><span></span></blockquote>
        <small>戦後の史実を描く札。台詞は場面のための再現。</small>
        <button type="button" class="btn primary" id="b-next">次の場面へ進む</button>
      </div></div></section>`;
  const count = root.querySelector('[data-page]');
  const title = root.querySelector('h2');
  const map = root.querySelector('svg');
  const retreat = root.querySelector('[data-retreat]');
  const fire = root.querySelector('[data-fire]');
  const note = root.querySelector('[data-note]');
  const mapText = note.querySelector('text');
  const history = root.querySelector('[data-history]');
  const quote = root.querySelector('blockquote');
  const who = quote.querySelector('b');
  const line = quote.querySelector('span');
  const button = root.querySelector('#b-next');
  const pages = ['一', '二', '三', '四', '五'];
  const draw = () => {
    const scene = INOU_AFTER[page];
    root.scrollTop = 0;
    document.title = `${scene.title}｜戦国立身`;
    count.textContent = `稲生の戦いの後　${pages[page]}／五`;
    title.textContent = scene.title;
    history.textContent = scene.text;
    map.setAttribute('aria-label', `尾張の略図。清洲、稲生原、末森城。${scene.map}。位置と道は目安。`);
    retreat.setAttribute('display', page === 0 ? 'inline' : 'none');
    fire.setAttribute('display', page === 1 ? 'inline' : 'none');
    note.setAttribute('display', page >= 2 ? 'inline' : 'none');
    mapText.textContent = scene.map;
    quote.hidden = !scene.line;
    who.textContent = scene.who || '';
    line.textContent = scene.line ? `「${scene.line}」` : '';
    button.textContent = page === INOU_AFTER.length - 1 ? '戦功の評定へ進む' : '次の場面へ進む';
    button.disabled = false;
    button.focus({ preventScroll: true });
  };
  button.onclick = () => {
    if (done || button.disabled) return;
    button.disabled = true;
    if (++page < INOU_AFTER.length) draw();
    else { done = true; hideScreen(); onNext(); }
  };
  draw();
}
