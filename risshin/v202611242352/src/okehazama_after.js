import { hideScreen } from './screens.js';

// 桶狭間の勝利後だけ読み込む（札一枚）。出所：『信長公記』（義元を毛利新助・服部一忠が討つ）、
// 『三河物語』ほか（元康は大高城から岡崎城へ入る）、1562 年の清洲同盟。伝承は断定しない。
export const OKEHAZAMA_AFTER = {
  title: '義元の首と、今川の退き',
  text: '今川義元は討たれ、今川勢は駿河へ退いた。大高城にいた松平元康は岡崎城へ入り、やがて今川から離れて、信長と手を結んだ。',
  who: '織田信長', line: '義元の首、確かに取った。清洲へ戻るぞ。',
};

export function okehazamaAfterScene(onNext) {
  let done = false;
  hideScreen();
  const root = document.getElementById('screen');
  root.hidden = false; root.className = '';
  const s = OKEHAZAMA_AFTER;
  root.innerHTML = `<style>
      .oke-after{box-sizing:border-box;width:min(960px,100%);margin:auto;padding:16px;color:var(--washi)}
      .oke-after h2{font-size:24px;margin:6px 0 12px}
      .oke-after-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:center}
      .oke-after svg{display:block;width:100%;height:auto;background:#24291f;border:1px solid #a99c7e;box-sizing:border-box}
      .oke-after p{font-size:16px;line-height:1.7;margin:8px 0}
      .oke-after blockquote{margin:12px 0;padding:8px 12px;border-left:3px solid #c2a25a;background:#242018;font-size:16px;line-height:1.7}
      .oke-after small{display:block;font-size:12px;line-height:1.6;color:var(--washi-dim)}
      .oke-after button{min-height:48px;width:100%;font-size:16px;margin-top:12px}
      .oke-after button:focus-visible{outline:3px solid #e6c578;outline-offset:3px}
      @media(max-height:520px) and (min-width:650px){.oke-after{padding:8px 16px}.oke-after h2{font-size:20px;margin:4px 0 8px}.oke-after-layout{gap:16px}.oke-after blockquote{margin:8px 0}}
      @media(max-width:649px){.oke-after-layout{grid-template-columns:1fr;gap:12px}}
    </style><section class="oke-after" aria-label="桶狭間の戦後の史実">
      <small>桶狭間の戦いの後</small>
      <h2></h2><div class="oke-after-layout">
      <div><svg viewBox="0 0 440 260" role="img" aria-label="尾張から三河の略図。桶狭間で今川勢は東の駿河へ退き、元康は大高城から岡崎城へ入る。">
        <g font-family="serif" font-size="18" fill="#fff3d7">
          <text x="20" y="28">三河</text><text x="396" y="28">北↑</text>
          <circle cx="360" cy="80" r="6"/><text x="326" y="66">清洲</text>
          <circle cx="300" cy="150" r="7" fill="#d5b66e"/><text x="262" y="134">桶狭間</text>
          <circle cx="330" cy="190" r="5"/><text x="300" y="212">大高城</text>
          <circle cx="110" cy="120" r="6"/><text x="80" y="106">岡崎城</text>
          <text x="22" y="240">駿河へ</text>
        </g>
        <g fill="none" stroke="#f0d085" stroke-width="4"><path d="M290 156L60 230M75 222L60 230L80 232"/><path d="M322 190L120 128M135 128L120 128L128 142"/></g>
      </svg></div>
      <div><p></p>
        <blockquote><b></b><br><span></span></blockquote>
        <button type="button" class="btn primary" id="b-next">戦功の評定へ進む</button>
      </div></div></section>`;
  root.querySelector('h2').textContent = s.title;
  document.title = `${s.title}｜戦国立身`;
  root.querySelector('p').textContent = s.text;
  root.querySelector('b').textContent = s.who;
  root.querySelector('blockquote span').textContent = `「${s.line}」`;
  const button = root.querySelector('#b-next');
  button.onclick = () => { if (done) return; done = true; hideScreen(); onNext(); };
  button.focus({ preventScroll: true });
}
