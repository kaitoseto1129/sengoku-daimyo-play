// 武将図鑑のオンラインの頁（K600・docs/kaito_toyo_1121.md 38〜41・86〜87・11/21 iMac k598-home）。
//   筋書きの武将図鑑（zukan.js）の四つ目のタブ「オンライン武将」から開く。筋書きの図鑑には触らない。
//   上に「取得 47/120」と家ごとの数（織田 18/24 …・押すと絞る）。未所持も影にし過ぎず、名・格・家・兵種・戦法・略歴・能力が見られる。違いは「未登用」の印だけ。
//   どの武将も［模擬合戦で試す］（持っていなくても総大将に据えて試せる・手持ちには触らない）。
//   初めて SS を取った人は、図鑑を開いた時に一度だけ「図鑑登録」の動き（印が押され、取得の数が一つ上がる）。登用の画面からも zukanRegisterFx を呼べる。
//   略歴は筋書きの図鑑の名簿（zukan_people.js の一言）を使う。名簿に無い人は家と格から一行。
import { addEn, isEn } from '../i18n.js';
import { BUSHOU_ONLINE, HOUSE_NAME, statsOf, STAT_KEYS } from './bushou_online.js';
import { RARITY, KATA, loadOnline, saveOnline, face, esc } from './house.js';

const RANK_ORDER = ['SS', 'S', 'A', 'R', 'N'];
const HOUSE_ORDER = ['oda', 'takeda', 'uesugi', 'tokugawa', 'mori', 'shimazu', 'date', 'hojo', 'toyotomi', 'other'];
const STAT_NAME = { COMMAND: '統率', MORALE: '士気', COHESION: '隊列', TACTICS: '戦術', MOBILITY: '機動', RANGED: '射撃', SIEGE: '攻城' };
let BIO = null, TAC = null;
async function lore() {
  if (!BIO) { try { const Z = await import('../zukan_people.js'); BIO = new Map(Z.ZUKAN_ROWS.map((r) => [r[0], r[6]])); } catch (e) { BIO = new Map(); } }
  if (!TAC) { try { TAC = await import('./tactics.js'); } catch (e) { TAC = {}; } }
}
const bioOf = (b) => (isEn() && b.en?.bio) || (!isEn() && BIO?.get(b.name)) || `${HOUSE_NAME[b.house] || ''}${b.house === 'other' ? 'の武将' : '家の武将'}。`;
const tacOf = (b) => { const id = TAC?.BUSHO_TACTIC?.[b.name]; const t = id && TAC.TACTICS?.[id]; return t ? { name: t.name, desc: t.desc } : null; };
const ownedSet = (o) => new Set(o?.owned || []);

const CSS = `
.zo{display:flex;flex-direction:column;gap:10px;min-height:0}
.zo-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}
.zo-total{font:700 17px var(--ui,sans-serif);letter-spacing:.06em;margin-right:6px;font-variant-numeric:tabular-nums}
.zo-total b{color:#e6c77a;font-size:20px}
.zo-total.up b{animation:zoUp .9s}
@keyframes zoUp{30%{color:#fff;transform:scale(1.3)}}
.zo-h{min-height:36px;padding:0 10px;border:1px solid rgba(236,228,210,.28);border-radius:18px;background:rgba(20,18,15,.82);color:#ece4d2;font:600 13px var(--ui,sans-serif);white-space:nowrap;cursor:pointer;font-variant-numeric:tabular-nums}
.zo-h[aria-pressed=true]{border-color:#e6c77a;background:rgba(168,128,42,.35)}
.zo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;align-content:start}
.zo-c{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px 6px;border:1px solid rgba(236,228,210,.22);border-top:3px solid var(--rc);border-radius:4px;background:rgba(20,18,15,.82);color:#ece4d2;cursor:pointer;min-height:44px}
.zo-c .zo-f{width:60px;height:60px;border-radius:50%;overflow:hidden;background:#2a241c;display:flex;align-items:center;justify-content:center;border:2px solid var(--rc)}
.zo-c .zo-f img{width:100%;height:100%;object-fit:cover}
.zo-c b{font:600 13px var(--ui,sans-serif);letter-spacing:0;white-space:nowrap}
.zo-c small{font:700 11px var(--ui,sans-serif);color:var(--rc)}
.zo-c.not .zo-f{filter:grayscale(.55) brightness(.8)}
.zo-c.not b{color:#cbbd9c}
.zo-tag{position:absolute;top:4px;left:4px;padding:0 5px;border-radius:3px;background:rgba(0,0,0,.6);border:1px solid rgba(236,228,210,.35);font:600 11px var(--ui,sans-serif);color:#cbbd9c;line-height:16px}
.zo-d{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:12px 16px;background:rgba(8,6,4,.78)}
.zo-dc{position:relative;width:min(720px,100%);max-height:100%;overflow-y:auto;display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px 16px;padding:14px 16px;background:#17130e;border:1px solid var(--rc);border-radius:6px;color:#ece4d2}
.zo-dc .zo-f{width:140px;height:140px;border-radius:6px;overflow:hidden;background:#2a241c;display:flex;align-items:center;justify-content:center;border:2px solid var(--rc)}
.zo-dc .zo-f img{width:100%;height:100%;object-fit:cover}
.zo-dc h3{margin:0;font:700 20px var(--display,serif);letter-spacing:.08em}
.zo-dc .meta{font-size:13px;color:#cbbd9c;margin:2px 0 6px}
.zo-dc .meta b{color:var(--rc)}
.zo-dc p{margin:0 0 6px;font-size:14px;line-height:1.55}
.zo-dc .tac{border-left:3px solid #e6c77a;padding-left:8px}
.zo-st{display:grid;grid-template-columns:auto minmax(0,1fr) 2.2em;gap:3px 6px;align-items:center;font-size:12px}
.zo-st i{display:block;height:6px;border-radius:3px;background:rgba(236,228,210,.15);overflow:hidden}
.zo-st i s{display:block;height:100%;background:#e6c77a}
.zo-btns{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.zo-btns button{min-height:44px;min-width:140px;padding:0 14px;border-radius:4px;font:600 15px var(--ui,sans-serif);color:#fff4e0;background:rgba(20,18,15,.9);border:1px solid rgba(236,228,210,.35);cursor:pointer}
.zo-btns button.go{background:linear-gradient(180deg,#a8402a,#6e2016);border-color:#e0a070}
.zo-reg{position:fixed;inset:0;z-index:85;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(8,6,4,.82);color:#ece4d2;pointer-events:auto}
.zo-reg .zo-f{width:150px;height:150px;border-radius:50%;overflow:hidden;border:3px solid #d9b45a;box-shadow:0 0 40px rgba(217,180,90,.6);background:#2a241c;display:flex;align-items:center;justify-content:center}
.zo-reg .zo-f img{width:100%;height:100%;object-fit:cover}
.zo-reg h3{margin:0;font:700 22px var(--display,serif);letter-spacing:.12em}
.zo-reg .seal{position:absolute;margin:-110px 0 0 140px;width:74px;height:74px;border:4px solid #b8302a;border-radius:8px;color:#b8302a;font:800 15px/1.1 var(--display,serif);display:flex;align-items:center;justify-content:center;text-align:center;transform:rotate(-12deg);animation:zoSeal .6s ease-out;background:rgba(244,232,210,.92)}
@keyframes zoSeal{0%,30%{transform:rotate(-12deg) scale(2.4);opacity:0}}
.zo-reg small{font-size:15px;color:#cbbd9c;font-variant-numeric:tabular-nums}
@media (prefers-reduced-motion:reduce){.zo-reg .seal{animation:none}.zo-total.up b{animation:none}}
@media (max-height:500px){.zo-dc{grid-template-columns:110px minmax(0,1fr);padding:10px 12px}.zo-dc .zo-f{width:104px;height:104px}.zo-dc h3{font-size:18px}.zo-dc p{font-size:13px;margin-bottom:4px}}
`;
const css = () => { if (!document.getElementById('zo-css')) { const st = document.createElement('style'); st.id = 'zo-css'; st.textContent = CSS; document.head.appendChild(st); } };
const sorted = () => BUSHOU_ONLINE.slice().sort((a, b) => HOUSE_ORDER.indexOf(a.house) - HOUSE_ORDER.indexOf(b.house) || RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank));

// 頁を描く（zukan.js の setTab が呼ぶ）。o：{ onTrial(name) }（無ければ［模擬合戦で試す］は出さない）
export async function renderOnlineZukan(pane, o = {}) {
  en(); css(); await lore();
  const save = loadOnline(), own = ownedSet(save);
  const all = sorted(), total = all.length, got = all.filter((b) => own.has(b.name)).length;
  let filter = pane.dataset.zoHouse || '';
  const houses = HOUSE_ORDER.filter((h) => all.some((b) => b.house === h));
  const cnt = (h) => { const L = all.filter((b) => b.house === h); return `${L.filter((b) => own.has(b.name)).length}/${L.length}`; };
  pane.innerHTML = `<div class="zo"><div class="zo-head"><span class="zo-total" id="zo-total">取得 <b>${got}</b>/${total}</span>
    ${houses.map((h) => `<button type="button" class="zo-h" data-h="${h}" aria-pressed="${filter === h}">${esc(HOUSE_NAME[h])} ${cnt(h)}</button>`).join('')}</div>
    <div class="zo-grid" role="list"></div></div>`;
  const grid = pane.querySelector('.zo-grid');
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); face(e.target, e.target.dataset.n); } }, { root: null, rootMargin: '120px' }) : null;
  const draw = () => {
    grid.innerHTML = '';
    for (const b of all.filter((x) => !filter || x.house === filter)) {
      const has = own.has(b.name), c = document.createElement('button');
      c.type = 'button'; c.className = 'zo-c' + (has ? '' : ' not'); c.setAttribute('role', 'listitem'); c.style.setProperty('--rc', RARITY[b.rank]?.color || '#888');
      c.innerHTML = `${has ? '' : '<span class="zo-tag">未登用</span>'}<span class="zo-f" data-n="${esc(b.name)}"></span><b>${esc(b.name)}</b><small>${b.rank}</small>`;
      c.setAttribute('aria-label', `${b.name}・${b.rank}・${HOUSE_NAME[b.house] || ''}${has ? '' : '・未登用'}`);
      c.addEventListener('click', () => openDetail(b, has, o));
      grid.appendChild(c);
      const f = c.querySelector('.zo-f'); if (io) io.observe(f); else face(f, b.name);
    }
  };
  pane.querySelectorAll('.zo-h').forEach((x) => x.addEventListener('click', () => {
    filter = filter === x.dataset.h ? '' : x.dataset.h; pane.dataset.zoHouse = filter;
    pane.querySelectorAll('.zo-h').forEach((y) => y.setAttribute('aria-pressed', String(y.dataset.h === filter))); draw();
  }));
  draw();
  // 初めて SS を取った人へ一度だけ図鑑登録の動き（取った SS の中で、まだ図鑑で見せていない人）
  const seen = save?.zukanSS || {};
  const fresh = all.filter((b) => b.rank === 'SS' && own.has(b.name) && !seen[b.name] && !b.start);
  if (save && fresh.length) {
    save.zukanSS = { ...seen, ...Object.fromEntries(all.filter((b) => b.rank === 'SS' && own.has(b.name)).map((b) => [b.name, 1])) };
    saveOnline(save);
    zukanRegisterFx(fresh[0].name, { got, total }).then(() => { const t = pane.querySelector('#zo-total'); if (t) { t.classList.remove('up'); void t.offsetWidth; t.classList.add('up'); } });
  } else if (save && !save.zukanSS) { save.zukanSS = Object.fromEntries(all.filter((b) => b.rank === 'SS' && own.has(b.name)).map((b) => [b.name, 1])); saveOnline(save); }
}

function openDetail(b, has, o) {
  const st = statsOf(b) || {}, tac = tacOf(b), kata = KATA.find((k) => k.id === b.fav)?.name || '標準';
  const el = document.createElement('div');
  el.className = 'zo-d'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', b.name);
  el.innerHTML = `<div class="zo-dc" style="--rc:${RARITY[b.rank]?.color || '#888'}"><span class="zo-f"></span><div>
      <h3>${esc(b.name)}</h3><div class="meta"><b>${b.rank}</b>　<span>${esc(HOUSE_NAME[b.house] || '')}</span>　<span>${esc(kata)}</span>　<span>コスト ${b.cost}</span>${has ? '' : '　<span>未登用</span>'}</div>
      <p>${esc(bioOf(b))}</p>${tac ? `<p class="tac"><b>${esc(tac.name)}</b>　<span>${esc(tac.desc)}</span></p>` : ''}
      <div class="zo-st">${STAT_KEYS.map((k) => `<span>${STAT_NAME[k]}</span><i><s style="width:${st[k] || 0}%"></s></i><span>${st[k] || 0}</span>`).join('')}</div></div>
    <div class="zo-btns">${o.onTrial ? '<button type="button" class="go" data-a="trial">試す</button>' : ''}<button type="button" data-a="close">閉じる</button></div></div>`;
  document.body.appendChild(el);
  face(el.querySelector('.zo-f'), b.name);
  const close = () => { el.remove(); document.removeEventListener('keydown', key, true); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.querySelector('[data-a="close"]').addEventListener('click', close);
  el.querySelector('[data-a="trial"]')?.addEventListener('click', () => { close(); o.onTrial(b.name); });
  (el.querySelector('[data-a="trial"]') || el.querySelector('[data-a="close"]')).focus({ preventScroll: true });
}

// 図鑑登録の動き（初めての SS）。押すか 2.6 秒で閉じる。{ got, total } があれば「取得 n/m」を出す
export function zukanRegisterFx(name, n = null) {
  en(); css();
  return new Promise((done) => {
    const el = document.createElement('div');
    el.className = 'zo-reg'; el.setAttribute('role', 'status');
    el.innerHTML = `<span class="zo-f"></span><span class="seal" aria-hidden="true">図鑑<br>登録</span><h3>${esc(name)}</h3><small>図鑑に登録しました${n ? `　取得 ${n.got}/${n.total}` : ''}</small>`;
    document.body.appendChild(el);
    face(el.querySelector('.zo-f'), name);
    let fin = false; const end = () => { if (fin) return; fin = true; clearTimeout(t); el.remove(); done(); };
    const t = setTimeout(end, 2600);
    el.addEventListener('click', end);
  });
}

let enDone = false;
function en() {
  if (enDone) return; enDone = true;
  addEn([['北条氏康', 'Hōjō Ujiyasu'], ['長宗我部元親', 'Chōsokabe Motochika'], ['立花宗茂', 'Tachibana Muneshige'], ['島左近', 'Shima Sakon'],   // 英訳の表に無かった四人
    ['オンライン武将', 'Online warlords'], ['未登用', 'Not recruited'], ['模擬合戦で試す', 'Try in practice'], ['閉じる', 'Close'], ['図鑑登録', 'Registered'],
    ['統率', 'Command'], ['士気', 'Morale'], ['結束', 'Cohesion'], ['隊列', 'Cohesion'], ['戦術', 'Tactics'], ['機動', 'Mobility'], ['射撃', 'Ranged'], ['攻城', 'Siege'],
    ['織田', 'Oda'], ['武田', 'Takeda'], ['上杉', 'Uesugi'], ['徳川', 'Tokugawa'], ['毛利', 'Mori'], ['島津', 'Shimazu'], ['諸家', 'Others'],
    ['標準', 'Standard'], ['槍重視', 'Spear'], ['鉄砲重視', 'Guns'], ['騎馬重視', 'Cavalry'], ['守備重視', 'Defense'], ['オンライン軍団', 'Online army'],
    [/^取得$/, () => 'Owned'], [/^コスト (\d+)$/, (m) => `Cost ${m[1]}`], [/^(織田|武田|上杉|徳川|毛利|島津|諸家) (\d+\/\d+)$/, (m, tr) => `${tr(m[1])} ${m[2]}`],
    [/^図鑑に登録しました(?:　取得 (\d+)\/(\d+))?$/, (m) => `Added to the guide${m[1] ? `  ${m[1]}/${m[2]}` : ''}`],
    [/^(.+)家の武将。$/, (m, tr) => `A warlord of the ${tr(m[1])} clan.`], [/^諸家の武将。$/, () => 'A warlord of another clan.']]);
}
