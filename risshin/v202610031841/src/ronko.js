// 戦後の論功行賞。支給は今の評定に任せ、ここでは読み上げだけを行う。
import { ITEMS, RANKS, SCENARIOS, scenarioKey, zeni } from './state.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function ronkoDeeds(r) {
  const good = (r.lines || []).filter((l) => l.pts > 0);
  const deeds = [];
  const names = [...new Set(good.filter((l) => l.label === '敵武将撃破').map((l) => l.detail).filter(Boolean))];
  if (names.length) deeds.push(`${names.join('、')}を討ち取った。`);
  const first = good.find((l) => /一番槍/.test(l.label) || /一番槍/.test(l.detail || ''));
  if (first) deeds.push(`${first.label === '副任務達成' ? first.detail : first.label}。先頭で槍をつけた。`);
  // 敵のしんがりを崩した手柄とは分ける。
  const rear = good.find((l) => /(?:しんがり|殿軍).*(?:務め|守|果た|生き延び)|殿を務め/.test(`${l.label} ${l.detail || ''}`));
  if (rear) deeds.push('しんがりを務め、味方の退く道を守った。');
  if (!deeds.length) {
    const special = good.find((l) => l.sp || l.label === '副任務達成');
    deeds.push(special ? `${special.label === '副任務達成' ? special.detail : special.label}。` : '下された務めを果たした。');
  }
  return { deeds, notable: !!(names.length || first || rear) };
}

export function ronkoHtml(G, r) {
  const { deeds } = ronkoDeeds(r);
  const faction = SCENARIOS[scenarioKey()]?.faction;
  // 主君の死後には、その名で褒美を与えない。
  const lord = faction === 'oda' && !/本能寺/.test(r.battle) ? '織田信長' : '主君';
  const cash = (r.pay || []).filter((l) => l.kan > 0 && !/禄/.test(l.label)).reduce((n, l) => n + l.kan, 0);
  const gifts = [];
  if (cash > 0) gifts.push(`銭 ${zeni(Math.round(cash * 1000) / 1000)}`);
  for (const id of r.granted || []) if (ITEMS[id]) gifts.push(ITEMS[id].name);
  if (r.kansho) gifts.push('感状（手柄を認める書状）');
  const land = r.landChange;
  if (land && land.after > land.before) gifts.push(`加増 ${land.after - land.before}石（知行 ${land.after}石）`);
  const oldPay = RANKS[r.rankBefore]?.roku || 0, newPay = RANKS[r.rankAfter]?.roku || 0;
  if (newPay > oldPay) gifts.push(`加増 毎戦の禄 ${zeni(oldPay)} → ${zeni(newPay)}`);
  const praise = deeds.some((s) => /しんがり/.test(s)) ? '最後まで踏みとどまったな。皆の命をよう守った。'
    : deeds.some((s) => /一番槍/.test(s)) ? '真っ先に槍をつけた勇気、しかと聞いた。'
    : deeds.some((s) => /討ち取った/.test(s)) ? 'その討ち取り、見事な働きじゃ。' : 'よう務めを果たした。これからも励め。';
  return `<style>
    #screen .ronko{box-sizing:border-box;width:min(760px,100%);height:min(350px,100dvh - 32px);margin:auto;display:flex;flex-direction:column;gap:8px;color:#ece4d2;background:#14120f;padding:12px 16px;text-align:left}
    .ronko h2{font-size:24px;line-height:1.3;margin:0;color:#c2a25a}.ronko small{font-size:max(12px,calc(12px * var(--text-scale,1)));color:#b9b09c}
    .ronko .rk-body{overflow:auto;min-height:0;flex:1}.ronko .rk-room{display:flex;gap:16px;align-items:center}.ronko canvas{width:144px;height:86px;flex:none}.ronko p,.ronko li{font-size:max(15px,calc(15px * var(--text-scale,1)));line-height:1.6;margin:4px 0}.ronko ul{padding-left:24px;margin:8px 0}
    .ronko .rk-gifts{border-top:1px solid #c2a25a;padding-top:8px}.ronko .rk-gifts small{display:block}.ronko .rk-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.ronko .rk-actions button{min-height:48px;min-width:100px;font-size:max(15px,calc(15px * var(--text-scale,1)));margin:0}.ronko button:focus-visible{outline:3px solid #c2a25a;outline-offset:3px;box-shadow:0 0 0 6px #14120f}
    @media(max-width:520px){#screen .ronko{height:min(560px,100dvh - 32px);padding:12px 8px}.ronko canvas{width:96px;height:58px}.ronko .rk-room{gap:8px}}
  </style><section class="ronko" aria-labelledby="rk-title"><h2 id="rk-title">論功行賞</h2><small>${esc(r.battle)} ・ 遊びの中の褒美の場面</small>
    <div class="rk-body"><div class="rk-room"><canvas id="rk-room" width="480" height="288" role="img" aria-label="${esc(G.name)}が主君の前にひざをつく"></canvas><div><small>主君の前で、手柄を読み上げる</small><p><b>${esc(lord)}</b></p><p>${esc(G.name)}、前へ。</p></div></div>
    <div id="rk-deeds" aria-live="polite"><ul>${deeds.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
    <div id="rk-gifts" class="rk-gifts" hidden><p>「${esc(praise)}」</p><p><b>${gifts.length ? gifts.map(esc).join(' ・ ') : '此度の働きを覚えておく。'}</b></p>${r.kansho ? '<small>感状を賜ったことは、日誌に残る。</small>' : ''}<small>銭・武具・加増は、今回の評定で受け取った分。</small></div></div>
    <div class="rk-actions"><button class="btn" id="rk-skip">場面を飛ばす</button><button class="btn primary" id="rk-next">褒美を受ける</button></div></section>`;
}
