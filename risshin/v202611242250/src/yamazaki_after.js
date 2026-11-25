import { hideScreen } from './screens.js';

// 山崎の勝利後だけ読み込む（札一枚）。出所：『兼見卿記』『惟任退治記』ほか（光秀は小栗栖で討たれる＝最期の細部は伝承）、6/27 清洲会議。
export const YAMAZAKI_AFTER = {
  title: '光秀の最期と、清洲の評定',
  text: '明智光秀は勝竜寺城へ退き、夜のうちに坂本を目指したが、小栗栖で落ち武者狩りに討たれたと伝わる。信長の仇を討った秀吉は、二週間後、清洲で織田家の跡目を決める席に着いた。',
  who: '羽柴秀吉', line: '天下は、この一戦で動いたわい。',
};

export function yamazakiAfterScene(onNext) {
  let done = false;
  hideScreen();
  const root = document.getElementById('screen');
  root.hidden = false; root.className = '';
  const s = YAMAZAKI_AFTER;
  root.innerHTML = `<style>
      .yama-after{box-sizing:border-box;width:min(960px,100%);margin:auto;padding:16px;color:var(--washi)}
      .yama-after h2{font-size:24px;margin:6px 0 12px}
      .yama-after-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:center}
      .yama-after svg{display:block;width:100%;height:auto;background:#24291f;border:1px solid #a99c7e;box-sizing:border-box}
      .yama-after p{font-size:16px;line-height:1.7;margin:8px 0}
      .yama-after blockquote{margin:12px 0;padding:8px 12px;border-left:3px solid #c2a25a;background:#242018;font-size:16px;line-height:1.7}
      .yama-after small{display:block;font-size:12px;line-height:1.6;color:var(--washi-dim)}
      .yama-after button{min-height:48px;width:100%;font-size:16px;margin-top:12px}
      .yama-after button:focus-visible{outline:3px solid #e6c578;outline-offset:3px}
      @media(max-height:520px) and (min-width:650px){.yama-after{padding:8px 16px}.yama-after h2{font-size:20px;margin:4px 0 8px}.yama-after-layout{gap:16px}.yama-after blockquote{margin:8px 0}}
      @media(max-width:649px){.yama-after-layout{grid-template-columns:1fr;gap:12px}}
    </style><section class="yama-after" aria-label="桶狭間の戦後の史実">
      <small>山崎の戦いの後</small>
      <h2></h2><div class="yama-after-layout">
      <div><svg viewBox="0 0 440 260" role="img" aria-label="山城の略図。山崎で敗れた光秀は勝竜寺城から坂本へ向かい、小栗栖で討たれる。">
        <g font-family="serif" font-size="18" fill="#fff3d7">
          <text x="396" y="28">北↑</text>
          <circle cx="260" cy="170" r="7" fill="#d5b66e"/><text x="222" y="196">山崎</text>
          <circle cx="220" cy="140" r="5"/><text x="150" y="128">勝竜寺城</text>
          <circle cx="330" cy="80" r="5"/><text x="300" y="66">小栗栖</text>
          <circle cx="360" cy="40" r="5"/><text x="330" y="26">坂本</text>
        </g>
        <g fill="none" stroke="#f0d085" stroke-width="4"><path d="M250 164L226 146"/><path d="M226 140L322 86M310 84L322 86L316 96"/></g>
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
