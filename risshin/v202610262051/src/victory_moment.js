// 勝った瞬間・敵将を討った瞬間（テストプレイの声 10/24「戦闘終了があっけない。勝利の実感がほしい」）
//   鬨の声と太鼓・短い止まり・味方の勝ち鬨・大きな筆文字を一度だけ。カメラは空でなく自分と味方を映す。
import { sfx } from './audio.js';
import { reduceMotion } from './settings.js';

let styleDone = false;
function ensureStyle() {
  if (styleDone) return;
  styleDone = true;
  const st = document.createElement('style');
  st.textContent = `.vic-word{position:fixed;left:50%;top:40%;transform:translate(-50%,-50%) scale(1.3);opacity:0;pointer-events:none;z-index:40;
font-family:"Hiragino Mincho ProN","Yu Mincho",serif;font-weight:900;color:#fbf3dc;white-space:nowrap;letter-spacing:.06em;
text-shadow:0 3px 0 #14120f,0 0 18px rgba(0,0,0,.9),0 0 46px rgba(120,10,0,.6);-webkit-text-stroke:2px #14120f;
transition:opacity .35s ease-out,transform .55s cubic-bezier(.2,.9,.3,1.15)}
.vic-word.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.vic-word.big{font-size:min(36vh,200px);line-height:1}
.vic-word.kill{font-size:min(12vh,68px);line-height:1.1}
.vic-word.introduction{width:30vw;max-width:30vw;top:18%;font-size:min(5.5vw,46px);line-height:1.1;text-align:center;letter-spacing:.04em;transform:translate(-50%,-50%);transition:opacity .35s ease-out;-webkit-text-stroke:1px #14120f}
.vic-word.still{transition:none}`;
  document.head.appendChild(st);
}

// 大きな筆文字を一度だけ出して引く（大きな出来事の見出し。字はこれだけ）。
export function brushWord(rt, text, { big = false, introduction = false, hold = 2.2 } = {}) {
  ensureStyle();
  const e = document.createElement('div');
  e.className = 'vic-word ' + (introduction ? 'introduction' : big ? 'big' : 'kill') + (reduceMotion() ? ' still' : '');
  e.setAttribute('aria-hidden', 'true');
  e.textContent = text;
  document.body.appendChild(e);
  // 登場名は上の空いた所へ。本人の姿と、人数・任務・命の札を避ける。
  let frame = 0;
  const columns = [.5, .34, .66], empty = [];
  const place = () => {
    if (introduction && e.isConnected) {
      const w = innerWidth * .3, h = e.offsetHeight || 50;
      const rects = rt.hud?.hudRects?.() || empty;
      const person = rt.flags.hayaU && rt.hud?.measurePersonFrame?.(rt.flags.hayaU, rt);
      let best = Infinity, bx = innerWidth / 2, by = innerHeight * .18;
      for (let y = h / 2 + 8; y <= innerHeight * .32; y += 8) for (const fraction of columns) {
        const x = innerWidth * fraction;
        let overlap = Math.abs(x - innerWidth / 2) * .001;
        for (let i = 0; i <= rects.length; i++) {
          const r = i === rects.length ? person : rects[i];
          if (!r) continue;
          overlap += Math.max(0, Math.min(x + w / 2 + 8, r.right) - Math.max(x - w / 2 - 8, r.left)) *
            Math.max(0, Math.min(y + h / 2 + 8, r.bottom) - Math.max(y - h / 2 - 8, r.top));
        }
        if (overlap < best) { best = overlap; bx = x; by = y; }
      }
      e.style.left = `${bx}px`; e.style.top = `${by}px`;
      // 空きがない間は重ねず、同じ一度の登場時間内で空きを待つ。
      e.style.visibility = best < 1 ? 'visible' : 'hidden';
      if (e.isConnected) frame = requestAnimationFrame(place);
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(() => { place(); e.classList.add('on'); }));
  const t1 = setTimeout(() => e.classList.remove('on'), hold * 1000);
  const t2 = setTimeout(() => { cancelAnimationFrame(frame); e.remove(); }, hold * 1000 + 600);
  rt.cleanupTasks?.add(() => { clearTimeout(t1); clearTimeout(t2); cancelAnimationFrame(frame); e.remove(); });
}

// 近くの味方の多い向きへ肩越しのカメラを向ける。見上げず、少し見下ろす。
export function faceAllies(rt) {
  const P = rt.player, me = P.u.pos;
  let sx = 0, sz = 0, n = 0;
  for (const o of rt.army.units) {
    if (!o.alive || o.isPlayer || o.team !== P.u.team || o.gone || o.fleeing) continue;
    const dx = o.pos.x - me.x, dz = o.pos.z - me.z, d2 = dx * dx + dz * dz;
    if (d2 > 22 * 22 || d2 < 2) continue;
    sx += dx; sz += dz; n++;
  }
  if (n) P.yaw = Math.atan2(sx, sz);
  P.pitch = -0.1;
  P.lock = null; P.cine = null; P.camShot = null;
}

// 勝った瞬間。title：「勝」か「〇〇 討ち取ったり」。結果の画面へは呼び手が finish で 2〜3 秒後に送る。
export function victoryMoment(rt, title = '勝') {
  if (rt.flags.victoryShown) return;
  rt.flags.victoryShown = true;
  sfx('kachidoki', 1);
  faceAllies(rt);
  rt.vicHoldUntil = rt.t + 4; // この間は見上げない（player.js が pitch を抑える）
  if (!reduceMotion() && rt.game) rt.game.slowmo = Math.max(rt.game.slowmo || 0, 0.45);
  rt.army.celebrate(rt.player.u.team);
  const pos = rt.player.u.pos;
  for (const t of [0.5, 1.7]) rt.after(t, () => { rt.warSpeech?.crowd('eiei', pos, 0.9); rt.warVoices?.play('eiei', pos, 0.9); });
  brushWord(rt, title, { big: title.length <= 2, hold: 2.4 });
}
