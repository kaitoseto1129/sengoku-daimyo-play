// 出世の場面。評定の間を一度だけ描き、一枚の絵で見せる。
import { RANKS, scenarioKey } from './state.js';
import { KERAI_CAP } from './retainers.js';
import { drawCouncil } from './interior_parts.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KOKU = [0, 0, 30, 60, 100];
const OPEN = [[], [], ['田を開く', '兵を集める', '使者を務める'], ['町を開く', '手勢を鍛える', '贈り物を届ける'], ['同盟の話', '婚姻の仲立ち']];
const koku = (G, rank) => Math.max(G.dom?.koku || 0, KOKU[rank] || 0);

export function rankupHtml(before, G, r, W) {
  const realm = scenarioKey() === 'oda' && !G.lord;
  const a = r.rankBefore, b = r.rankAfter;
  const rows = [{ label: '組の人数', old: `${RANKS[a].squad}人`, now: `${RANKS[b].squad}人`, note: '城下の「組」で名簿を見る' }];
  if (realm) {
    rows.push({ label: '家臣の上限', old: `${KERAI_CAP[a]}人`, now: `${KERAI_CAP[b]}人`, note: b === 1 ? '知行の札で、郎党を雇える' : '知行の札で、家臣を雇える' });
    const old = koku(before, a), now = koku(G, b);
    rows.push({ label: '知行（預かる土地）', old: old ? `${old}石` : 'まだ無し', now: now ? `${now}石` : 'まだ無し', note: now ? '知行の札で、土地を育てる' : '足軽組頭から、30石を賜る' });
  }
  const opened = realm ? OPEN.slice(a + 1, b + 1).flat() : [];
  const lord = realm ? '織田信長' : W.who;
  const word = realm ? `${G.name}、よう働いた。今日より${RANKS[b].name}に取り立てる。これからも励め。` : W.text;
  return `<style>
    #screen .promo-cine .pc-audience{display:grid;grid-template-columns:160px minmax(0,460px);gap:16px;align-items:center;text-align:left;max-width:720px}
    .pc-audience canvas{width:160px;height:96px;animation:pcBow .7s ease-out both}
    .pc-audience small{display:block;font-size:12px;color:var(--washi-dim);margin-bottom:4px}
    .pc-audience b{font-size:16px;color:var(--kin)}
    .pc-audience p{font-size:16px;line-height:1.6;margin:4px 0 0;color:var(--washi)}
    #screen .promo-cine .pc-gains{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;width:100%;max-width:720px;text-align:left;margin:0}
    .pc-gains>div{padding:8px 12px;border:1px solid var(--kin);background:rgba(194,162,90,.08)}
    .pc-gains small,.pc-gains span{display:block;font-size:12px;color:var(--washi-dim);line-height:1.5}
    .pc-gains b{display:block;font-size:20px;color:var(--washi);line-height:1.5}
    .pc-gains em{font-size:15px;font-style:normal;color:var(--washi-dim)}
    .pc-open{max-width:720px;margin:0;font-size:15px;line-height:1.6;color:var(--washi)}
    .pc-more{width:100%;max-width:720px;text-align:center}
    .pc-more summary{display:flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:1px solid var(--line);cursor:pointer;font-size:15px;list-style:none}
    .pc-more summary::before{content:'＋';margin-right:8px}
    .pc-more[open] summary::before{content:'−'}
    .pc-more summary:focus-visible{outline:3px solid var(--kin);outline-offset:3px;box-shadow:0 0 0 6px var(--sumi,#14120f)}
    .pc-more[open]>div{margin-top:16px}
    #screen .promo-cine .pc-more .card{font-size:15px;opacity:1;animation:none}
    #screen .promo-cine .pc-more .pc-road{display:flex!important}
    #screen .promo-cine .pc-say{opacity:1;animation:none}
    #screen .promo-cine.still *,#screen .promo-cine.still *::before{animation:none!important;opacity:1}
    @keyframes pcBow{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
    @media(max-width:520px){#screen .promo-cine .pc-audience{grid-template-columns:96px minmax(0,1fr);gap:8px}.pc-audience canvas{width:96px;height:58px}#screen .promo-cine .pc-gains{grid-template-columns:1fr}.pc-gains>div{padding:8px 12px}}
    @media(max-height:500px) and (min-width:521px){#screen .promo-cine{gap:8px;padding-top:8px}.pc-gains b{font-size:18px}.pc-audience p{font-size:15px}}
    @media(prefers-reduced-motion:reduce){#screen .promo-cine *{animation:none!important;opacity:1}}
  </style><div class="pc-audience"><canvas id="pc-audience" width="480" height="288" role="img" aria-label="${esc(G.name)}が評定の間で${esc(lord)}の前にひざをつき、新しい役目を受ける"></canvas><div><small>${realm ? '主君の前で' : '上役の前で'}</small><b>${esc(lord)}</b><p>「${esc(word)}」</p></div></div>
    <div class="pc-gains" role="group" aria-label="出世で変わること">${rows.map((x) => `<div><small>${esc(x.label)}</small><b><em>${esc(x.old)} → </em>${esc(x.now)}</b><span>${esc(x.note)}</span></div>`).join('')}</div>
    ${opened.length ? `<p class="pc-open">新しくできる事：${opened.map(esc).join('・')}<br>城下の「知行」で選ぶ。</p>` : ''}`;
}

export function drawRankup(canvas) {
  if (!canvas) return;
  if (drawCouncil(canvas)) return;
  // 立体を描けない端末では、同じ室内の一枚絵を使う。
  const g = canvas.getContext('2d');
  if (!g) return;
  g.fillStyle = '#242019'; g.fillRect(0, 0, 480, 288);
  // 広間の柱・屏風・一段高い主君の座。
  g.fillStyle = '#55452d'; g.fillRect(32, 16, 12, 220); g.fillRect(436, 16, 12, 220);
  g.fillStyle = '#8e7645'; g.fillRect(66, 30, 160, 128);
  g.strokeStyle = '#443823'; g.lineWidth = 3;
  for (let x = 98; x < 226; x += 32) { g.beginPath(); g.moveTo(x, 30); g.lineTo(x, 158); g.stroke(); }
  g.fillStyle = '#66533b'; g.fillRect(56, 166, 204, 18);
  g.strokeStyle = '#695943';
  for (let y = 208; y < 288; y += 36) { g.beginPath(); g.moveTo(0, y); g.lineTo(480, y); g.stroke(); }
  // 主君は座り、手前の主人公は頭を下げてひざをつく。
  g.fillStyle = '#ddc4a0'; g.beginPath(); g.arc(146, 76, 15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#181512'; g.fillRect(136, 49, 20, 16);
  g.fillStyle = '#442c26'; g.beginPath(); g.moveTo(127, 94); g.lineTo(165, 94); g.lineTo(192, 161); g.lineTo(102, 161); g.closePath(); g.fill();
  g.fillStyle = '#c2a25a'; g.fillRect(141, 101, 8, 49);
  g.fillStyle = '#d2b98f'; g.beginPath(); g.arc(320, 172, 15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#353d40'; g.beginPath(); g.moveTo(327, 183); g.lineTo(361, 196); g.lineTo(382, 237); g.lineTo(302, 237); g.lineTo(288, 217); g.closePath(); g.fill();
  g.strokeStyle = '#c6b394'; g.lineWidth = 7; g.beginPath(); g.moveTo(330, 194); g.lineTo(295, 226); g.lineTo(273, 228); g.stroke();
  g.fillStyle = '#ece4d2'; g.fillRect(237, 208, 26, 8);
}
