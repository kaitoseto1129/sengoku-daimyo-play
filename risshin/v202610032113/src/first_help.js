// 遊びの初めの一言。進行の保存とは別に覚え、書けない時もこの場では繰り返さない。
const KEY = 'risshin.first-help-v1';
const seen = Object.create(null);
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  if (saved && typeof saved === 'object') for (const id of Object.keys(saved)) if (saved[id] === true) seen[id] = true;
} catch (e) { /* 読めなくても遊べる */ }

export const HELP = {
  order: '下知は上役の命令。任務の札で、やる事を確かめよう。',
  flag: '味方の旗は集まる目印。迷ったら旗を探そう。',
  ladder: '梯子の足もとで「登る」を選ぶと、塀の上へ進める。',
  ride: '馬は速いが息が切れる。危ない時は手綱で止まろう。',
  gun: '鉄砲は狙って撃とう。次の弾を込める間は身を守ろう。',
  domain: '内政で次の戦に備えよう。仕事の働きを見て選ぼう。',
  retainer: '家臣には役目を選ぼう。得意な仕事を任せよう。',
  diplomacy: '外交で他の家と仲を結ぼう。使う銭と働きを見て選ぼう。',
  map: '地図の印で、味方と目標の場所を確かめよう。',
};

export function helpSeen(id) { return seen[id] === true; }
export function firstHelp(id, show) {
  if (helpSeen(id) || !HELP[id] || show(HELP[id]) === false) return false;
  seen[id] = true;
  try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) { /* この場の記憶だけで続ける */ }
  return true;
}

let observer = null;
const timers = [];
export function stopFirstHelp() {
  if (observer) observer.disconnect();
  observer = null;
  for (const timer of timers) clearTimeout(timer);
  timers.length = 0;
  document.querySelectorAll('[data-first-help]').forEach((el) => el.remove());
}

// 欄が実際に見えた時だけ、その欄に一言を添える。送り下げた先の欄は先に記録しない。
export function watchFirstHelp(entries) {
  stopFirstHelp();
  observer = new IntersectionObserver((changes) => {
    for (const change of changes) {
      if (!change.isIntersecting || !change.target.isConnected) continue;
      const entry = entries.find((x) => x.target === change.target);
      if (!entry) continue;
      firstHelp(entry.id, (text) => {
        const p = document.createElement('p');
        p.dataset.firstHelp = entry.id;
        p.setAttribute('role', 'status'); p.setAttribute('aria-live', 'polite');
        p.style.cssText = 'font-size:15px;line-height:1.6;color:#ece4d2;background:#14120f;border-left:3px solid #c2a25a;padding:8px;margin:8px 0';
        p.textContent = text;
        if (entry.target !== entry.el) entry.target.before(p);
        else entry.el.prepend(p);
        timers.push(setTimeout(() => p.remove(), 6500));
      });
      observer.unobserve(change.target);
    }
  }, { threshold: 0.1 });
  for (const entry of entries) if (entry.el && !helpSeen(entry.id)) {
    entry.target = entry.el.querySelector('h3,h4') || entry.el.firstElementChild || entry.el;
    observer.observe(entry.target);
  }
}
