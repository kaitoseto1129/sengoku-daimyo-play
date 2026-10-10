// 出世の場面。本陣の幕と主君の背を、一度だけ描いて見せる。
import { RANKS, scenarioKey, scenario } from './state.js';
import { KERAI_CAP } from './retainers.js';
import { KOKU_FLOOR, domainOpened, domainWorkLimit } from './domain.js';
import { drawMon } from './textures.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DIPLO_OPEN = [[], [], ['使者を務める'], ['贈り物を届ける'], ['同盟の話', '婚姻の仲立ち']];
const NEXT = ['', '五人の組に号令を出せる。', '十五人の組を率い、弓の兵を入れて陣形を選べる。', '二十人の組を率いられる。', '三十人の組を率いられる。'];
const GREETING = ['', '五人の組、お下知を待っております。', '十五人、弓の兵も迎えて組を支えます。', '二十人、力を合わせて働きます。', '三十人、新しい旗のもとで働きます。'];
const koku = (G, rank) => Math.max(G.dom?.koku || 0, KOKU_FLOOR[rank] || 0);

export function rankupDetailsHtml(before, G, r) {
  const realm = scenarioKey() === 'oda' && !G.lord;
  const a = r.rankBefore, b = r.rankAfter;
  const rows = [{ label: '組の人数', old: `${RANKS[a].squad}人`, now: `${RANKS[b].squad}人`, note: '城下の「組」で名簿を見る' }];
  if (realm) {
    rows.push({ label: '家臣の上限', old: `${KERAI_CAP[a]}人`, now: `${KERAI_CAP[b]}人`, note: b === 1 ? '知行の札の「家臣」で、郎党を雇える。支度金と毎戦の給金が要る' : '知行の札の「家臣」で、家臣を雇える。支度金と毎戦の俸禄が要る' });
    rows.push({ label: '城下で内政できる回数', old: `${domainWorkLimit(a)}回`, now: `${domainWorkLimit(b)}回`, note: '次の出陣までに使える時' });
    const old = koku(before, a), now = koku(G, b);
    rows.push({ label: '知行（預かる土地）', old: old ? `${old}石` : 'まだ無し', now: now ? `${now}石` : 'まだ無し', note: now ? '知行の札で、土地を育てる' : `${RANKS[KOKU_FLOOR.findIndex((n) => n > 0)].name}から、30石を賜る` });
  }
  const opened = realm ? Array.from({ length: Math.max(0, b - a) }, (_, i) => domainOpened(a + 1 + i).concat(DIPLO_OPEN[a + 1 + i] || [])).flat() : [];
  return `<div class="pc-gains" role="group" aria-label="出世で変わること">${rows.map((x) => `<div><small>${esc(x.label)}</small><b><em>${esc(x.old)} → </em>${esc(x.now)}</b><span>${esc(x.note)}</span></div>`).join('')}</div>
    ${opened.length ? `<p class="pc-open">新しくできる事：${opened.map(esc).join('・')}<br>城下の「知行」で選ぶ。</p>` : ''}`;
}

export function rankupHtml(before, G, r, W, flagHtml = '') {
  const realm = scenarioKey() === 'oda' && !G.lord;
  const b = r.rankAfter;
  const next = RANKS[b + 1];
  // 判定と同じ条件を示す。候補に選ばれても、次の戦で自動的には上がらない。
  const candidate = /候補$/.test(RANKS[b].name) && next
    ? `候補は、正式な役目に選ばれる前の身分。${next.name}になるには、昇進できる戦で任務を果たし、累計戦功${next.min}以上・上官の評価50以上・命令違反二回以内が必要です。` : '';
  const lord = realm ? '織田信長' : W.who;
  const word = `${G.name}、今日より${RANKS[b].name}を命じる。組を頼むぞ。`;
  const retainer = (G.kerai || []).find((k) => k.alive && k.name);
  const soldier = (G.roster || []).find((k) => k.alive !== false && k.name);
  const greetingWho = retainer ? `家臣 ${retainer.name}` : soldier ? `組の者 ${soldier.name}` : '組の者';
  return `<style>
    #screen .promo-cine .pc-audience{display:grid;grid-template-columns:120px minmax(0,1fr) 64px;gap:16px;align-items:center;text-align:left;max-width:720px;width:100%}
    .pc-audience>canvas{width:120px;height:72px;animation:pcBow .7s ease-out both}
    .pc-audience small{display:block;font-size:12px;color:var(--washi-dim);margin-bottom:4px}
    .pc-audience b{font-size:16px;color:var(--kin)}
    .pc-audience p{font-size:16px;line-height:1.6;margin:4px 0 0;color:var(--washi)}
    .pc-audience .pc-greeting{font-size:15px;margin-top:8px}
    .pc-audience .pc-greeting small{display:inline;color:var(--kin);margin-right:8px}
    #screen .promo-cine .pc-audience .pc-flag{height:96px;animation:pcBow .7s ease-out both}
    #screen .promo-cine .pc-audience .pc-flag canvas{width:38px;height:89px;animation:none}
    .pc-audience .pc-flagcap{letter-spacing:0;font-size:12px}
    .pc-next-role{width:100%;max-width:720px;margin:0;font-size:16px;line-height:1.6;color:var(--washi)}
    .pc-next-role b{color:var(--kin)}
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
    @media(max-width:520px){#screen .promo-cine .pc-audience{grid-template-columns:64px minmax(0,1fr) 48px;gap:8px}.pc-audience>canvas{width:64px;height:39px}#screen .promo-cine .pc-gains{grid-template-columns:1fr}.pc-gains>div{padding:8px 12px}}
    @media(max-height:500px) and (min-width:521px){#screen .promo-cine{gap:8px;padding-block:8px}#screen .promo-cine .pc-rank{font-size:32px}#screen .promo-cine .pc-lbl,#screen .promo-cine .skiphint{display:none}.pc-gains b{font-size:18px}.pc-audience p{font-size:15px}}
    @media(prefers-reduced-motion:reduce){#screen .promo-cine *{animation:none!important;opacity:1}}
  </style><div class="pc-audience"><canvas id="pc-audience" width="480" height="288" role="img" aria-label="${esc(G.name)}が本陣で新しい役目を受ける。幕の前に座る${esc(lord)}の背"></canvas><div><small>${realm ? '主君の前で' : '上役の前で'}</small><b>${esc(lord)}</b><p>「${esc(word)}」</p><p class="pc-greeting"><small>${esc(greetingWho)}</small>「${esc(GREETING[b] || '新しい役目、お支えします。')}」</p></div>${flagHtml}</div>
    ${candidate ? `<p class="pc-next-role" role="note">${esc(candidate)}</p>` : ''}
    <p class="pc-next-role"><b>これから：</b>${esc(NEXT[b] || `${RANKS[b].squad}人の組を率いられる。`)}</p>`;
}

// 小さな絵でも主君が主役になる構図。壁や箱の人形を映さず、画質によらず一枚だけ描く。
export function drawRankup(canvas) {
  if (!canvas) return;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.save(); g.scale(canvas.width / 480, canvas.height / 288);
  const cloth = g.createLinearGradient(0, 0, 0, 240);
  cloth.addColorStop(0, '#c3b89e'); cloth.addColorStop(.5, '#e4dbc4'); cloth.addColorStop(1, '#8e816b');
  g.fillStyle = cloth; g.fillRect(0, 0, 480, 288);
  // 幕の縫い目と垂れた布。木の板の筋にはしない。
  for (const x of [24, 156, 324, 456]) {
    const fold = g.createLinearGradient(x - 12, 0, x + 18, 0);
    fold.addColorStop(0, 'rgba(59,45,30,0)'); fold.addColorStop(.45, 'rgba(59,45,30,.24)'); fold.addColorStop(.7, 'rgba(255,246,216,.24)'); fold.addColorStop(1, 'rgba(59,45,30,0)');
    g.fillStyle = fold; g.fillRect(x - 12, 0, 30, 236);
  }
  g.strokeStyle = '#64513a'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, 15); g.quadraticCurveTo(240, 28, 480, 15); g.stroke();
  // 家の紋は現在の筋書きから取る。別の主家で信長の紋を出さない。
  for (const x of [83, 397]) {
    g.save(); g.beginPath(); g.arc(x, 93, 36, 0, Math.PI * 2); g.clip();
    g.translate(x - 36, 57); drawMon(g, scenario().mon, 72, 144); g.restore();
  }
  const ground = g.createLinearGradient(0, 227, 0, 288);
  ground.addColorStop(0, '#847355'); ground.addColorStop(1, '#3d3428');
  g.fillStyle = ground; g.fillRect(0, 237, 480, 51);
  g.fillStyle = 'rgba(25,20,16,.4)'; g.beginPath(); g.ellipse(240, 266, 111, 15, 0, 0, Math.PI * 2); g.fill();
  // 座った主君の肩から袖・膝へ続く布の量感。背を大きく取り、顔のない人形を避ける。
  const robe = g.createLinearGradient(139, 0, 339, 0);
  robe.addColorStop(0, '#171c1c'); robe.addColorStop(.3, '#414747'); robe.addColorStop(.52, '#252d2e'); robe.addColorStop(.8, '#393e3d'); robe.addColorStop(1, '#101616');
  g.fillStyle = robe; g.beginPath();
  g.moveTo(211, 127); g.bezierCurveTo(193, 128, 175, 137, 166, 154);
  g.bezierCurveTo(151, 177, 155, 207, 139, 242); g.quadraticCurveTo(127, 261, 155, 265);
  g.quadraticCurveTo(240, 281, 324, 264); g.quadraticCurveTo(353, 261, 340, 241);
  g.bezierCurveTo(325, 204, 329, 178, 313, 155); g.quadraticCurveTo(299, 132, 268, 127); g.closePath(); g.fill();
  const neck = g.createLinearGradient(220, 0, 262, 0);
  neck.addColorStop(0, '#80624b'); neck.addColorStop(.55, '#c7a781'); neck.addColorStop(1, '#927254');
  g.fillStyle = neck; g.beginPath(); g.moveTo(222, 103); g.lineTo(258, 103); g.quadraticCurveTo(254, 122, 266, 131); g.lineTo(240, 150); g.lineTo(215, 131); g.quadraticCurveTo(226, 121, 222, 103); g.fill();
  // 髷と後頭部。丸い玉と箱を重ねず、耳・襟足まで一つの輪郭にする。
  const hair = g.createLinearGradient(216, 65, 260, 114);
  hair.addColorStop(0, '#37332e'); hair.addColorStop(.45, '#191b19'); hair.addColorStop(1, '#090e0d');
  g.fillStyle = hair; g.beginPath(); g.moveTo(220, 108);
  g.bezierCurveTo(207, 97, 209, 69, 221, 61); g.quadraticCurveTo(239, 51, 259, 61);
  g.bezierCurveTo(272, 73, 270, 97, 258, 110); g.quadraticCurveTo(240, 120, 220, 108); g.fill();
  g.beginPath(); g.moveTo(233, 64); g.bezierCurveTo(230, 49, 230, 42, 238, 43); g.quadraticCurveTo(250, 43, 248, 63); g.closePath(); g.fill();
  g.strokeStyle = '#a58d62'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(213, 131); g.lineTo(240, 152); g.lineTo(269, 131); g.stroke();
  // 縫い目と袖のひだに明暗を入れ、胴が平たい札にならないようにする。
  for (const side of [-1, 1]) {
    g.strokeStyle = 'rgba(8,13,13,.55)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(240 + side * 46, 146); g.quadraticCurveTo(240 + side * 53, 203, 240 + side * 82, 252); g.stroke();
    g.strokeStyle = 'rgba(163,162,139,.25)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(240 + side * 61, 159); g.quadraticCurveTo(240 + side * 72, 192, 240 + side * 70, 222); g.stroke();
  }
  const shade = g.createRadialGradient(240, 147, 75, 240, 147, 285);
  shade.addColorStop(0, 'rgba(12,16,14,0)'); shade.addColorStop(1, 'rgba(12,16,14,.55)');
  g.fillStyle = shade; g.fillRect(0, 0, 480, 288);
  g.restore();
}
