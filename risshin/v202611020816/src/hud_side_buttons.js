// 戦の画面の左の釦：音を出す・消す、止める（kaito 11/1 D「左に音のオン・オフのボタンなど。今は何もなさすぎる」。地図の釦は N で消した）
//   パソコン：左の真ん中に二つを縦に並べる。
//   指の端末：止める・視点は既にあるので、音の釦だけを視点の釦の隣に置く。
//   形と字は一度だけ作り、毎コマは触らない（四分の一秒ごとに出す・隠すだけ）。
import { S, saveSettings } from './settings.js';
import { setVolume } from './audio.js';

const SPEAKER = '<path d="M3 8h3.2L11 4v12l-4.8-4H3z" fill="currentColor"/>';
const ICON_ON = `<svg viewBox="0 0 20 20" aria-hidden="true">${SPEAKER}<path d="M13.4 7.2a4 4 0 0 1 0 5.6M15.6 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const ICON_OFF = `<svg viewBox="0 0 20 20" aria-hidden="true">${SPEAKER}<path d="M13.5 7.5l5 5M18.5 7.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_PAUSE = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.2" height="12" fill="currentColor"/><rect x="11.8" y="4" width="3.2" height="12" fill="currentColor"/></svg>';

const CSS = `
#side-ctl { position:fixed; left:max(16px, env(safe-area-inset-left)); top:50%; transform:translateY(-50%); z-index:30;
  display:flex; flex-direction:column; gap:8px; pointer-events:none; }
#side-ctl[hidden], .side-btn[hidden] { display:none !important; }
.side-btn { pointer-events:auto; width:52px; min-height:52px; padding:4px 0 3px; box-sizing:border-box;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px;
  background:rgba(20,18,15,.82); color:#fff3df; border:1px solid rgba(255,243,223,.45); border-radius:6px;
  font:600 12px/1.2 sans-serif; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.side-btn svg { width:22px; height:22px; }
.side-btn:hover { background:rgba(40,34,28,.92); }
.side-btn:focus-visible { outline:2px solid #fff3ba; outline-offset:2px; }
.side-btn.muted { color:#e8a08c; border-color:rgba(232,160,140,.6); }
#tc-sound { position:fixed; z-index:31; }
`;

let made = false;

export function setupSideButtons({ game, setPause }) {
  if (made) return;
  made = true;
  const st = document.createElement('style');
  st.id = 'side-ctl-css'; st.textContent = CSS;
  document.head.appendChild(st);

  const box = document.createElement('div');
  box.id = 'side-ctl'; box.hidden = true;
  const btn = (id, label, icon, text) => {
    const b = document.createElement('button');
    b.type = 'button'; b.id = id; b.className = 'side-btn';
    b.setAttribute('aria-label', label);
    b.innerHTML = `${icon}<span>${text}</span>`;
    // 戦の操作（左の押し・指の動き）へ押しを渡さない。
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    return b;
  };
  const sound = btn('side-sound', '音を消す', ICON_ON, '音');
  const pause = btn('side-pause', '一時停止', ICON_PAUSE, '止める');
  box.append(sound, pause);
  document.body.appendChild(box);

  const battleOn = () => {
    const b = game.battle;
    return !!b && !b.ended && !game.paused && !document.getElementById('hud')?.hidden;
  };
  const paint = () => {
    const off = !(S.volume > 0);
    sound.classList.toggle('muted', off);
    sound.setAttribute('aria-pressed', String(off));
    sound.setAttribute('aria-label', off ? '音を出す' : '音を消す');
    sound.innerHTML = `${off ? ICON_OFF : ICON_ON}<span>${off ? '音なし' : '音'}</span>`;
  };
  sound.addEventListener('click', () => {
    if (S.volume > 0) { S.volumeBeforeMute = S.volume; S.volume = 0; }
    else S.volume = S.volumeBeforeMute > 0 ? S.volumeBeforeMute : 0.8;
    setVolume(S.volume);
    saveSettings();
    paint();
  });
  pause.addEventListener('click', () => {
    const b = game.battle;
    if (b && !b.ended && (!b.over || b.withdrawal) && !game.paused) setPause(true);
  });
  paint();

  // 四分の一秒ごとに、出すか・どこに置くかだけを見る。
  let lastVol = S.volume;
  setInterval(() => {
    const on = battleOn();
    const hud = document.getElementById('hud');
    const quiet = !!hud && /\b(photo|ending)\b/.test(hud.className);
    const touch = document.documentElement.classList.contains('touch');
    const view = touch ? document.getElementById('tc-view') : null;
    const tc = document.getElementById('tc');
    const touchRow = !!view && !!tc && !tc.hidden && view.offsetParent !== null;
    const bigmap = !!document.getElementById('bigmap') && !document.getElementById('bigmap').hidden;
    // 指の端末は音だけを視点の釦の隣へ。パソコンは三つを左の真ん中へ。
    if (touchRow) {
      if (sound.parentNode !== document.body) { document.body.appendChild(sound); sound.id = 'tc-sound'; }
      const r = view.getBoundingClientRect();
      const low = document.documentElement.classList.contains('tc-low');
      sound.style.left = (low ? r.right + 8 : r.left) + 'px';
      sound.style.top = (low ? r.top : r.bottom + 8) + 'px';
      sound.style.width = r.width + 'px'; sound.style.minHeight = r.height + 'px';
      sound.hidden = !on || quiet || bigmap;
      box.hidden = true;
    } else {
      if (sound.parentNode !== box) { box.prepend(sound); sound.id = 'side-sound'; sound.style.cssText = ''; }
      sound.hidden = false;
      box.hidden = !on || quiet;
    }
    if (lastVol !== S.volume) { lastVol = S.volume; paint(); }
  }, 250);
}
