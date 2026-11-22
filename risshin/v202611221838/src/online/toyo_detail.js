// 武将の詳細（K601 11〜18・K600 8〜16・iMac k600-engi・11/21）。
//   openBushouDetail(el, b, o) → { dispose() }：el の中身を詳細に替える。o：{ arm（主兵種の字）, onTrial(), onBack() }
//   左に大きな3D全身（指で回す・後ろにその主兵種の隊）と「率いる部隊 〇〇 1000」、右に格・名・家紋・「主兵種 〇〇」、
//   上のタブ［能力］［戦法］［家宝］［戦歴］。能力は英字と日本語を並べる（13）。家宝は小さな補正・外観だけ（15）。戦歴は史実の合戦（16）。
//   形の手本は kaito の写真 docs/kaito_refs_all/k601/4.webp（形だけ。絵や見た目は写さない）。
import { HOUSE_NAME, statsOf, STAT_KEYS } from './bushou_online.js';

const MARK = { SS: '', S: '', A: '', R: '', N: '' };   // K608：印は使わず、格は字と枠の色で
const RCOL = { SS: '#e8c25a', S: '#d9824a', A: '#8fb0d8', R: '#9fc08a', N: '#b8ae9c' };
const STAT_JA = { COMMAND: '統率', MORALE: '士気', COHESION: '隊列', TACTICS: '戦術', MOBILITY: '機動', RANGED: '射撃', SIEGE: '攻城' };
const ARM_MARK = { 槍: '│', 騎馬: '♞', 鉄砲: '●', 弓: ')' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CSS = `
.tyd{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;padding:inherit;background:radial-gradient(ellipse at 30% 40%,#3a2c1c,#0b0806 75%);color:#f1e9d6}
.tyd *{box-sizing:border-box}
.tyd-main{flex:1;display:flex;gap:12px;min-height:0}
.tyd-l{flex:0 0 42%;position:relative;min-height:0;border:1px solid #5a4a32;border-radius:4px;overflow:hidden;background:#0006}
.tyd-l .stg{position:absolute;inset:0}
.tyd-unit{position:absolute;left:8px;bottom:8px;padding:4px 10px;background:#000b;border:1px solid #8a7350;border-radius:3px;font-size:14px}
.tyd-unit b{font-size:17px;color:#f3d68a}
.tyd-r{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;min-height:0}
.tyd-hd{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.tyd-rk{font:700 22px/1.2 serif;padding:2px 12px;border:2px solid currentColor;background:#0008}
.tyd-nm{font-size:26px;font-weight:700;letter-spacing:.1em}
.tyd-hs{font-size:14px;display:flex;align-items:center;gap:6px}
.tyd-hs canvas{width:26px;height:26px}
.tyd-arm{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border:2px solid #e8c77a;background:#5a1f17;border-radius:3px;font-size:16px}
.tyd-arm b{font-size:20px}
.tyd-tabs{display:flex;gap:6px}
.tyd-tabs button{flex:1;min-height:44px;background:#0007;border:1px solid #8a7350;color:inherit;font:inherit;border-radius:4px;cursor:pointer}
.tyd-tabs button[aria-selected="true"]{background:#3b2a16;border-color:#e8c77a;color:#f3d68a}
.tyd-body{flex:1;overflow:auto;min-height:0;font-size:15px;padding:2px 2px 6px}
.tyd-st{display:grid;grid-template-columns:auto 1fr auto;gap:4px 8px;align-items:center}
.tyd-st .en{display:none}
.tyd-st .bar{display:block;gap:0;height:8px;background:#0008;border:1px solid #5a4a32;border-radius:4px;overflow:hidden}
.tyd-st .bar i{display:block;height:100%;background:linear-gradient(90deg,#8a5a28,#e8c77a)}
.tyd-st .v{font-weight:700;min-width:2em;text-align:right}
.tyd-p{margin:4px 0;line-height:1.5}
.tyd-p b{color:#f3d68a}
.tyd-bt{display:flex;flex-wrap:wrap;gap:6px}
.tyd-bt span{padding:2px 10px;border:1px solid #8a7350;border-radius:12px;background:#0006;font-size:14px}
.tyd-foot{display:flex;gap:8px;justify-content:center;flex:none;margin-top:6px}
.tyd-foot button{min-height:44px;min-width:150px;padding:6px 16px;background:#5a1f17;border:1px solid #e8c77a;color:inherit;font:inherit;border-radius:4px;cursor:pointer}
.tyd-foot button.sec{background:#0007;border-color:#8a7350}
`;

export function openBushouDetail(el, b, o = {}) {
  if (!document.getElementById('tyd-css')) { const s = document.createElement('style'); s.id = 'tyd-css'; s.textContent = CSS; document.head.appendChild(s); }
  const arm = o.arm || '槍';
  const box = document.createElement('div'); box.className = 'tyd'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', `${b.name}の詳細`);
  box.innerHTML = `<div class="tyd-main">
      <div class="tyd-l"><div class="stg" aria-label="${esc(b.name)}の全身（指で回せます）"></div><div class="tyd-unit">率いる部隊 <b>${arm} 1000</b></div></div>
      <div class="tyd-r">
        <div class="tyd-hd"><span class="tyd-rk" style="color:${RCOL[b.rank]}">${MARK[b.rank]} ${b.rank}</span><span class="tyd-nm">${esc(b.name)}</span></div>
        <div class="tyd-hd"><span class="tyd-arm" aria-label="主兵種 ${arm}">主兵種 <i aria-hidden="true">${ARM_MARK[arm] || ''}</i><b>${arm}</b></span><span class="tyd-hs"><canvas width="64" height="64" aria-hidden="true"></canvas><span>${HOUSE_NAME[b.house] || ''}</span> <span>・Cost ${b.cost}</span></span></div>
        <div class="tyd-tabs" role="tablist">${['能力', '戦法', '家宝', '戦歴'].map((t, i) => `<button role="tab" data-t="${i}" aria-selected="${i === 0}">${t}</button>`).join('')}</div>
        <div class="tyd-body" role="tabpanel"></div>
      </div></div>
    <div class="tyd-foot">${o.onTrial ? '<button data-a="trial">試す</button>' : ''}<button class="sec" data-a="back">戻る</button></div>`;
  el.appendChild(box);
  import('../bushou_card_art.js').then((A) => A.drawCardMon(box.querySelector('.tyd-hs canvas'), b.name, '#e8c77a')).catch(() => {});
  // 大きな3D全身：後ろにその主兵種の隊（83〜84・K601 17〜18）。描く板は閉じる時に捨てる
  let stage = null, dead = false;
  // K635①：描いた肖像があればそれを大きく出す（無ければ今までの3D全身）
  import('./portrait_art.js').then(async (P) => {
    const g = box.querySelector('.stg'); if (!g || dead) return;
    if ((await P.portraits()).has(b.id)) { const im = new Image(); im.src = P.portraitSrc(b.id); im.alt = ''; im.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block'; g.appendChild(im); return; }
    const R = await import('./toyo_reveal.js'); if (!dead) stage = R.mountBushouStage(g, b, { n: 70, nobori: 24 });
  }).catch(() => {});
  const body = box.querySelector('.tyd-body');
  const tabs = [
    // 能力（13）：英字と日本語を並べ、棒で長さ。数は bushou_online.js の statsOf（模擬合戦・対戦の効き目と同じ値）
    () => { const s = statsOf(b) || {}; return `<div class="tyd-st">${STAT_KEYS.map((k) => `<span class="en">${k}</span><span>${STAT_JA[k]}</span><span class="bar"><i style="width:${Math.max(4, Math.min(100, s[k] || 0))}%"></i></span><span class="v">${s[k] ?? '—'}</span>`).join('')}</div>`; },
    // 戦法（14）：一番の特徴。固有戦術の名・中身・使える時
    async () => {
      const T = await import('./tactics.js');
      const t = T.TACTICS[T.BUSHO_TACTIC[b.name]], p = T.PASSIVES?.[T.BUSHO_PASSIVE?.[b.name]];
      // 表（bushou_online.js の PROFILE）の一行・おすすめ配置・相性の良い武将（9・13・14）も並べる
      const more = `${b.oneLine ? `<p class="tyd-p">${esc(b.oneLine)}</p>` : ''}${b.placement ? `<p class="tyd-p">おすすめ配置：${esc(b.placement)}</p>` : ''}${(b.partners || []).length ? `<p class="tyd-p">相性の良い武将</p><div class="tyd-bt">${b.partners.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}${(b.keywords || []).length ? `<div class="tyd-bt" style="margin-top:6px">${b.keywords.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}`;
      if (t) return `<p class="tyd-p"><b>${esc(t.name)}</b></p><p class="tyd-p">${esc(t.desc)}</p>${t.needs ? `<p class="tyd-p">使える時：${esc(t.needs)}</p>` : ''}${t.uses ? `<p class="tyd-p">一戦に ${t.uses} 回</p>` : ''}${more}`;
      if (p) return `<p class="tyd-p"><b>${esc(p.name)}</b></p>${p.desc ? `<p class="tyd-p">${esc(p.desc)}</p>` : ''}<p class="tyd-p">いつも効く（自分で使う戦法ではありません）</p>${more}`;
      if (b.senpo) return `<p class="tyd-p"><b>${esc(b.senpo.name)}</b></p><p class="tyd-p">${esc(b.senpo.desc)}</p>${more}`;
      return `<p class="tyd-p">${arm}の隊を率いる将。固有の戦法はありません。</p>${more}`;
    },
    // 家宝（15）：一部の武将だけ。大きな強化にしない
    async () => {
      const G = await import('../named_gear.js').catch(() => ({}));
      const g = G.NAMED_GEAR?.[b.name] || {};
      const items = [g.kabuto && `兜：${g.kabuto}`, g.uma && '馬印', typeof g.flag === 'string' && g.flag.startsWith('sashi:') && `旗印：${g.flag.split(':')[1]}`].filter(Boolean);
      const kaho = b.kaho || b.heirloom;   // 表に家宝が足されたらそれを先に（一部の武将だけ・小さな補正と外観・15）
      if (kaho) items.unshift(typeof kaho === 'string' ? kaho : kaho.name);
      return items.length ? `<p class="tyd-p">この武将の家に伝わる品（見た目と図鑑。強さは大きく変わりません）</p><div class="tyd-bt">${items.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : '<p class="tyd-p">家宝を持たない武将です。家宝は一部の武将だけが持ち、強さは大きく変わりません。</p>';
    },
    // 戦歴（16）：図鑑の名簿の一言と、出会える合戦（史実）
    async () => {
      const [{ ZUKAN_ROWS }, St, Ty, Tk] = await Promise.all([import('../zukan_people.js'), import('../state.js'), import('../toyotomi_line.js').catch(() => ({})), import('../tokugawa_line.js').catch(() => ({}))]);
      const r = ZUKAN_ROWS.find((x) => x[0] === b.name || String(x[8] || '').split('・').includes(b.name));
      const NAME = new Map([...(St.ODA_LINE || []), ...(Ty.TOYOTOMI_LINE || []), ...(Tk.TOKUGAWA_LINE || [])].map((x) => [x.id, x.name]));
      // 表の略歴・主な合戦（bushou_online.js の bio・battles）を先に、無ければ図鑑の名簿の一言と出会える合戦
      const bt = [...new Set([...(b.battles || []), ...(r ? r[5].split(' ').map((id) => NAME.get(id)).filter(Boolean) : [])])];
      const bio = b.bio || (r && r[6]);
      return `${bio ? `<p class="tyd-p">${esc(bio)}</p>` : `<p class="tyd-p">${esc(HOUSE_NAME[b.house] || '')}の家中で${arm}の隊を率いた将。くわしい記録は図鑑に足していきます。</p>`}${bt.length ? `<p class="tyd-p"><b>主な合戦</b></p><div class="tyd-bt">${bt.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}`;
    },
  ];
  const show = async (i) => {
    for (const t of box.querySelectorAll('[data-t]')) t.setAttribute('aria-selected', String(+t.dataset.t === i));
    body.innerHTML = '…';
    try { const h = await tabs[i](); if (!dead) body.innerHTML = h; } catch (e) { body.innerHTML = '<p class="tyd-p">読めませんでした。</p>'; }
  };
  show(0);
  const dispose = () => { dead = true; stage?.dispose(); box.remove(); };
  box.onclick = (e) => {
    e.stopPropagation();
    const t = e.target.closest('[data-t]'); if (t) return show(+t.dataset.t);
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'back') { dispose(); o.onBack?.(); }
    if (a === 'trial') { dispose(); o.onTrial?.(); }
  };
  return { dispose };
}
