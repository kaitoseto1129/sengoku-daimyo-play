// 段2の評定：足軽は褒美を一つ選び、組頭以上は身分ごとの褒美を賜る。次の戦の前には支度を一つ整える。
// 褒美は既存の武具・供・統率・体力・酒・知行・家臣の欄を使い、次の戦で効く。
// 支度は G.shitaku = { at: 戦の番号, k } に覚え、その戦の始めに hyojoBattle が一度だけ効かせる。
// 保存は G の新しい欄（G.shitaku・G.hyojoLog）を足すだけ。state.js の save・load・migrate には触らない。
import { keraiCommandHtml, keraiCommandBind } from './retainers.js';
import { shitaHtml, shitaBind } from './kumi.js';
import { domOf } from './domain.js';
import { actionCards, KERAI_CAP } from './retainers.js';
import { ITEMS, RANKS, BATTLES, TOMO, newTomo, tomoAlive, tomoCap, scenarioKey } from './state.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
export const hyojoOn = (G) => !!G && !G.lord && !G.practice && scenarioKey() === 'oda';

// 褒美の武具：身の丈の順（安い守りから。身分の要る物は身分が来てから）
const GEAR_ORDER = ['kote', 'haidate', 'suneate', 'spear1', 'body1', 'hat2', 'katana', 'spear4', 'haori', 'body2', 'hat3'];
const SLOT_WORD = { weapon: '槍', hat: '兜', body: '胴', arm: '籠手', thigh: '佩楯', shin: '脛当', side: '刀', coat: '陣羽織' };

function nextGear(G) {
  const own = new Set(G.owned || []);
  for (const id of GEAR_ORDER) {
    const it = ITEMS[id];
    if (!it || own.has(id) || (it.minRank || 0) > (G.rank || 0)) continue;
    return id;
  }
  return null;
}
function gearEffect(it) {
  if (it.slot === 'weapon') return `突きが重くなる（${Math.round((it.mult - 1) * 100)}%増し）`;
  if (it.slot === 'side') return '槍の間合いの内で、刀に持ち替えて斬れる';
  if (it.slot === 'coat') return '組の士気が高いまま戦を始める';
  return `受ける傷が減る（守り ${Math.round((it.def || 0) * 100)}%）`;
}

// 身分の番号は増やさない。設計書の侍は3、侍大将は4に当たる。
function rankReward(G) {
  const rank = G.rank || 0;
  if (rank >= 4) {
    const hires = actionCards(G).filter((c) => c.id.startsWith('hire:'));
    const c = hires.find((c) => c.id === 'hire:c1') || hires[0];
    const beside = (G.kerai || []).some((k) => k.alive && k.role === 'kumi');
    const waiting = beside && (G.kerai || []).find((k) => k.alive && k.role === 'tomo');
    if (c) return { k: 'kerai', cat: '家臣', name: c.candidate, btn: `${c.candidate}を家臣に迎える`,
      eff: `次の戦では${beside ? 'そばで戦う役' : '組の副頭'}を任せる。${waiting ? `${waiting.name}は控えに戻る。` : ''}召し抱える銭は主君が持つ。${c.eff.slice(c.eff.indexOf('俸禄は毎戦')).split('。')[0]}。`, why: '織田信長の名で、一人を預けられる', hire: c };
    return { k: 'train', stat: 'lead', cat: '家臣', name: '家臣と隊のまとめ方を学ぶ', btn: '家臣と隊のまとめ方を学ぶ',
      eff: '次の戦から、組の始めの士気が三つ上がる（上限百）', why: `家臣は上限${KERAI_CAP[rank] || KERAI_CAP[4]}人。新たな者を迎える席がないため、主君が古参を稽古に遣わす` };
  }
  if (rank === 3) {
    const D = domOf(G);
    return { k: 'village', cat: '知行と感状', name: D.mura, btn: '村の知行と感状を賜る',
      eff: '村の兵糧で体を養う。次の戦から体力が十、気力が十二増える',
      why: `織田信長から、${D.mura}の知行${D.koku}石を預かる。村と石高は遊びの数` };
  }
  if (rank >= 1) {
    // 長屋の生きた仲間を先に呼ぶ。加入済み・討死の記憶だけで兵を作らない。
    const names = (G.roster || []).filter((r) => r.alive && !(G.nagaya?.dead || []).includes(r.name))
      .sort((a, b) => Number(!!b.nagaya) - Number(!!a.nagaya)).slice(0, 3).map((r) => r.name);
    return { k: 'praise', cat: '組の手柄', name: names.length ? `${names.join('・')}の働きを褒める` : '生き残った組の者を褒める',
      btn: '組の者と褒美の酒を分ける', eff: '次の戦の始め、組の士気が十上がる（上限百）',
      why: names.length ? `織田信長の言葉。「${names.join('、')}。互いを守り、よく働いた」` : '織田信長の言葉。「組の者も、よく働いた」。名簿にない名は呼ばない' };
  }
  return null;
}

// 足軽の候補は今のまま。組頭以上は身分に沿う褒美を一つ受け取る。
// 戦の道筋や次の一手は増やさない。
export function rewardOptions(G) {
  const special = rankReward(G);
  if (special) return [special];
  const L = [];
  const gid = nextGear(G);
  if (gid) {
    const it = ITEMS[gid];
    L.push({ k: 'gear', id: gid, cat: '武具', name: it.name, btn: `${it.name}を賜る`, eff: `次の戦から${gearEffect(it)}`, why: `${SLOT_WORD[it.slot] || '具足'}を良い物に替える` });
  }
  const room = tomoAlive(G).length < tomoCap(G);
  if (room) {
    const kind = (G.rank || 0) >= 2 ? 'wakato' : 'yarimochi';
    L.push({ k: 'tomo', kind, cat: '仲間', name: `${TOMO[kind].name}を一人`, btn: `${TOMO[kind].name}を供に付けてもらう`, eff: '次の戦から、すぐ後ろに付いて共に戦う', why: '同じ村の者が、手柄を聞いて仕えたいと言う' });
  } else if (!(G.rank >= 1) || G.feast) {
    const t = tomoAlive(G).filter((x) => (x.battles || 0) < 3).sort((a, b) => (a.battles || 0) - (b.battles || 0))[0];
    if (t) L.push({ k: 'tomoTrain', id: t.id, cat: '仲間', name: `供の${t.name}を鍛える`, btn: `${t.name}を鍛える`, eff: '次の戦から、その供が打たれ強く、よく突く', why: '戦の合間に、槍の相手をしてやる' });
  } else {
    L.push({ k: 'feast', cat: '仲間', name: '組の者に酒を振る舞う', btn: '組の者に酒を振る舞う', eff: '次の戦の始め、味方の士気が上がる', why: '褒美の酒を、皆で分ける' });
  }
  const st = G.stats || {};
  const sk = (st.spear || 1) <= (st.vit || 1) ? 'spear' : 'vit';
  L.push(sk === 'spear'
    ? { k: 'train', stat: 'spear', cat: '鍛錬', name: '古参に槍を習う', btn: '古参に槍を習う', eff: `突きが重くなる（槍術 ${st.spear || 1} → ${(st.spear || 1) + 1}）`, why: '上役の古参が、手ほどきを申し出た' }
    : { k: 'train', stat: 'vit', cat: '鍛錬', name: '走り込みで体を作る', btn: '走り込みで体を作る', eff: `体力と息が増える（体力 ${st.vit || 1} → ${(st.vit || 1) + 1}）`, why: '具足を着けて、山道を駆ける' });
  return L.slice(0, 3);
}

function applyReward(G, o) {
  if (o.k === 'praise') { G.feast = true; return `${o.name}。褒美の酒を組で分けた`; }
  if (o.k === 'village') {
    const D = domOf(G);
    G.stats ||= {};
    G.stats.vit = (G.stats.vit || 1) + 1;
    return `${D.mura}の知行${D.koku}石と感状を賜った。村の兵糧で体力が${G.stats.vit}に上がった`;
  }
  if (o.k === 'kerai') {
    // 家臣の生成・上限・俸禄は既存の仕組み。初めの雇い銭だけを褒美にする。
    if ((G.kerai || []).filter((k) => k.alive).length >= (KERAI_CAP[G.rank] || 0)) return '';
    o.hire.apply(G);
    const k = G.kerai[G.kerai.length - 1];
    // 次の戦で働く席に必ず据える。満席なら先任を控えに戻す。
    const role = !(G.kerai || []).some((x) => x !== k && x.alive && x.role === 'kumi') ? 'kumi' : 'tomo';
    for (const x of G.kerai) if (x !== k && x.alive && x.role === role) x.role = null;
    k.role = role;
    return `${k.name}を家臣に迎えた。${role === 'kumi' ? '組の副頭' : 'そばで戦う役'}を任せた`;
  }
  if (o.k === 'gear') {
    const it = ITEMS[o.id];
    if (!G.owned.includes(o.id)) G.owned.push(o.id);
    if (it.slot in G.equip) {
      const cur = ITEMS[G.equip[it.slot]];
      if (!cur || (it.def || it.mult || 0) >= (cur.def || cur.mult || 0)) G.equip[it.slot] = o.id;
    }
    return `${it.name}を賜った`;
  }
  if (o.k === 'tomo') {
    const t = newTomo(G, o.kind);
    (G.tomo ||= []).push(t);
    return `${TOMO[o.kind].name}の${t.name}が供に付いた`;
  }
  if (o.k === 'tomoTrain') {
    const t = (G.tomo || []).find((x) => x.id === o.id);
    if (t) { t.battles = (t.battles || 0) + 1; return `供の${t.name}を鍛えた`; }
    return '';
  }
  if (o.k === 'feast') { G.feast = true; return '組の者に酒を振る舞った'; }
  if (o.k === 'train') {
    G.stats ||= {};
    G.stats[o.stat] = (G.stats[o.stat] || 1) + 1;
    if (o.stat === 'lead') return `組のまとめ方を学び、統率が${G.stats.lead}に上がった`;
    return o.stat === 'spear' ? `槍術が${G.stats.spear}に上がった` : `体力が${G.stats.vit}に上がった`;
  }
  return '';
}

const CSS = `<style>
#screen .hy{box-sizing:border-box;width:min(900px,100%);min-height:100dvh;margin:0 auto;padding:10px 0 12px;display:flex;flex-direction:column;gap:8px;color:var(--washi);text-align:left}
#screen .hy h2{margin:0;font-size:22px;color:var(--kin);letter-spacing:.08em}
#screen .hy .hy-sub{margin:0;font-size:15px;color:var(--washi-dim);line-height:1.5}
#screen .hy .hy-sub .v{color:var(--washi);font-weight:700}
#screen .hy .hy-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
#screen .hy .hy-c{display:flex;flex-direction:column;gap:3px;min-height:44px;margin:0;padding:8px 10px;border:1px solid rgba(194,162,90,.4);border-radius:8px;background:rgba(194,162,90,.06);color:var(--washi);font:inherit;text-align:left;cursor:pointer}
#screen .hy .hy-c[aria-pressed=true]{border:2px solid var(--kin);background:rgba(194,162,90,.18);padding:7px 9px}
#screen .hy .hy-c[disabled]{opacity:.38;cursor:default}
#screen .hy .hy-k{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--kin);letter-spacing:.12em}
#screen .hy .hy-n{font-size:16px;line-height:1.35;font-weight:700}
#screen .hy .hy-e{font-size:14px;line-height:1.45;color:var(--washi)}
#screen .hy .hy-w{font-size:13px;line-height:1.45;color:var(--washi-dim)}
#screen .hy .shita{font-size:15px}#screen .hy .shita summary{min-height:44px;display:flex;align-items:center;cursor:pointer;color:var(--kin)}#screen .hy .shita p{margin:4px 0}#screen .hy .shita-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:8px 0}#screen .hy .shita-row b{min-width:5em}#screen .hy .shita button{min-height:44px;min-width:44px;padding:6px 10px;background:#302a20;color:#efe6d2;border:1px solid #c2a25a;font-size:15px;cursor:pointer}#screen .hy .shita button[aria-pressed=true]{outline:2px solid var(--kin)}
#screen .hy .hy-reward{font-size:15px;line-height:1.6}#screen .hy .hy-reward p{margin:0 0 8px}#screen .hy .hy-letter{display:block;width:min(720px,100%);height:auto;margin:0 auto}#screen .hy .hy-note{font-size:13px;color:var(--washi-dim)}
#screen .hy .hy-act{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:auto}
#screen .hy .hy-act .btn{min-height:48px;margin:0;font-size:15px}
#screen .hy .hy-c:focus-visible,#screen .hy .btn:focus-visible{outline:3px solid var(--focus-in,#e9c874);outline-offset:2px;box-shadow:0 0 0 5px #14120f}
@media(max-width:640px){#screen .hy .hy-grid{grid-template-columns:minmax(0,1fr)}}
@media(max-height:430px){#screen .hy h2{font-size:19px}#screen .hy .hy-c{padding:6px 8px;gap:2px}#screen .hy .hy-c[aria-pressed=true]{padding:5px 7px}}
</style>`;

function open(html) {
  const s = $('screen');
  s.hidden = false; s.className = ''; s.style.paddingBottom = '';
  document.querySelectorAll('.tour').forEach((e) => e.remove());
  s.innerHTML = CSS + html; s.scrollTop = 0;
  document.title = `${s.querySelector('h2')?.textContent || ''}｜戦国立身`;
  return s;
}
function card(o, i, sel) {
  return `<button class="hy-c" data-hy="${i}" aria-pressed="${i === sel}"${o.lock ? ' disabled' : ''}><div class="hy-k"><div>${esc(o.cat)}</div><div>${i === sel ? '● 選んでいる' : '○ 選ぶ'}</div></div><div class="hy-n">${esc(o.name)}</div><div class="hy-e">${esc(o.eff)}</div><div class="hy-w">${esc(o.lock || o.why)}</div></button>`;
}
function pickable(sc, list, sel, onSel) {
  sc.querySelectorAll('[data-hy]').forEach((b) => {
    b.onclick = () => { const i = +b.dataset.hy; if (list[i].lock) return; onSel(i); };
  });
}

// 感状は評定を開いた時だけ描く。紙の繊維・墨字・花押は外の素材を使わない。
function drawLetter(canvas, G, r) {
  if (!canvas) return;
  const c = canvas.getContext('2d');
  if (!c) return;
  c.fillStyle = '#e8dcc0'; c.fillRect(0, 0, 720, 240);
  c.strokeStyle = 'rgba(104,79,45,.12)'; c.lineWidth = 1;
  for (let i = 0; i < 130; i++) {
    const x = (i * 83) % 720, y = (i * 37) % 240;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 16, y + 2); c.stroke();
  }
  c.strokeStyle = '#8a7653'; c.strokeRect(10, 10, 700, 220);
  c.fillStyle = '#28231b'; c.font = 'bold 30px serif'; c.fillText('感状', 32, 48);
  c.font = '22px serif';
  c.fillText(`${G.name || 'そなた'} 殿`, 32, 82, 640);
  c.fillText(`${r.battle}での働き、見事なり。`, 32, 116, 640);
  c.fillText(`${domOf(G).mura}の知行を預ける。`, 32, 150, 640);
  c.font = '20px serif'; c.fillText('織田信長', 480, 207);
  // 創作の花押。信長の史料の写しとしては扱わない。
  c.save(); c.translate(606, 175); c.strokeStyle = '#28231b'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(0, 22); c.bezierCurveTo(38, -22, 59, 17, 12, 29);
  c.moveTo(22, 0); c.bezierCurveTo(36, 40, -5, 55, 59, 35);
  c.moveTo(0, 34); c.lineTo(66, 10); c.stroke(); c.restore();
}

// 手柄の評定：論功行賞・昇進の後、身分に合う褒美を受け取る。受け取り済みの戦では重ねない。
export function hyojoScreen(G, r, onDone, save) {
  if (!hyojoOn(G) || !r || !r.mainDone || G.hyojoLog?.at === G.battle) { onDone(); return; }
  const list = rewardOptions(G);
  const fixed = (G.rank || 0) >= 1;
  let sel = 0, done = false;
  const draw = () => {
    const rank = RANKS[G.rank] || RANKS[0];
    const sc = open(`<section class="hy" aria-labelledby="hy-t"><h2 id="hy-t">手柄の評定</h2>
      <p class="hy-sub">${esc(r.battle)}。戦功 <span class="v">${r.total}</span>・評定 <span class="v">${esc(r.grade || '')}</span>。${r.promoted ? `<span class="v">${esc(rank.name)}</span>に取り立てられた。` : `いまは<span class="v">${esc(rank.name)}</span>。`}${fixed ? '主君から褒美を賜る。' : '褒美を一つ選ぶ。'}</p>
      ${fixed ? `<div class="hy-reward"><p><b>${esc(list[0].name)}</b></p><p>${esc(list[0].why)}</p>${list[0].k === 'village' ? `<canvas class="hy-letter" id="hy-letter" width="720" height="240" role="img" aria-label="${esc(`${G.name || 'そなた'}殿。${r.battle}での働きを褒め、${domOf(G).mura}を預ける織田信長の感状`)}"></canvas><p class="hy-note">遊びの感状。文と花押は史料の写しではありません。</p>` : ''}<p>${esc(list[0].eff)}</p></div>` : `<div class="hy-grid" role="group" aria-label="褒美を一つ選ぶ">${list.map((o, i) => card(o, i, sel)).join('')}</div>`}
      <div class="hy-act"><button class="btn primary" id="hy-ok">${esc(list[sel].btn)}（受け取る）</button></div></section>`);
    drawLetter($('hy-letter'), G, r);
    pickable(sc, list, sel, (i) => { sel = i; draw(); $('hy-ok').focus({ preventScroll: true }); });
    $('hy-ok').onclick = () => {
      if (done) return; done = true;
      const msg = applyReward(G, list[sel]);
      G.hyojoLog = { at: G.battle, k: list[sel].k, msg };
      if (save) save(G);
      onDone(msg);
    };
    $('hy-ok').focus({ preventScroll: true });
  };
  draw();
}

// ---------------- 支度（次の戦の前に一つ整える） ----------------
function squadWord(G) {
  const sq = (RANKS[G.rank] || RANKS[0]).squad || 0;
  const tomo = tomoAlive(G).slice(0, tomoCap(G));
  if (sq) return { who: '組の者', eff: `組${sq}人の士気が高く、崩れにくい` };
  if (tomo.length) return { who: `供の${tomo.map((t) => t.name).join('・')}`, eff: '供が打たれ強く、よく突く' };
  return { who: '同じ組の足軽', eff: '近くの味方の士気が上がり、崩れにくい' };
}
export function shitakuOptions(G) {
  const w = ITEMS[G.equip.weapon] || ITEMS.spear0;
  const sw = squadWord(G);
  return [
    { k: 'togi', cat: '装備', name: `${w.name}の穂を研ぐ`, eff: 'この戦だけ、突きが一割ほど重い', why: '砥石で一晩かけて研ぐ' },
    { k: 'hyoro', cat: '装備', name: '腰兵糧を多めに持つ', eff: 'この戦だけ、息が長く続く（気力 +20%）', why: '干飯と味噌玉を腰に下げる' },
    { k: 'nakama', cat: '仲間', name: `${sw.who}と申し合わせる`, eff: `この戦だけ、${sw.eff}`, why: '互いの背を守る約束をする' },
  ];
}
// 稲葉山前の城下で見せる一枚。課金の鍵や戦の順には触らない。
export function phase2HintScreen(G, onBack, save) {
  if (!hyojoOn(G) || BATTLES[G.battle]?.id !== 'inabayama' || G.phase2HintSeen) return false;
  G.phase2HintSeen = true;
  save(G);
  open(`<section class="hy" aria-labelledby="hy-t"><h2 id="hy-t">この先：知行の村・家臣・使者</h2>
    <p class="hy-sub">稲葉山の戦の後、身分が上がると知行の村を預かる。田を開き、手勢を鍛えれば、次の戦の備えが育つ。</p>
    <p class="hy-sub">家臣を召し抱え、侍大将になれば先手・鉄砲頭・旗本に据えられる。名を持つ家臣が共に戦い、討たれれば戻らない。</p>
    <p class="hy-sub">使者を送り、内通や援軍の備えを整える。次の戦への道は、織田信長の歩みに沿って続く。</p>
    <div class="hy-act"><button type="button" class="btn primary" id="hy-back">城下へ戻る</button></div></section>`);
  let done = false;
  $('hy-back').onclick = () => { if (!done) { done = true; onBack(); } };
  $('hy-back').focus({ preventScroll: true });
  return true;
}

export function shitakuScreen(G, onGo, onBack) {
  if (!hyojoOn(G)) { onGo(); return; }
  const list = shitakuOptions(G);
  const bi = BATTLES[G.battle];
  const prev = G.shitaku && G.shitaku.at === G.battle ? list.findIndex((o) => o.k === G.shitaku.k) : -1;
  let sel = prev >= 0 ? prev : 0, done = false;
  const draw = () => {
    const sc = open(`<section class="hy" aria-labelledby="hy-t"><h2 id="hy-t">出陣の支度</h2>
      <p class="hy-sub">次の戦：<span class="v">${esc(bi ? bi.name : '')}</span>${bi && bi.place ? `（${esc(bi.place)}）` : ''}。夜明けまでに、一つだけ整えられる。</p>
      <div class="hy-grid" role="group" aria-label="支度を一つ選ぶ">${list.map((o, i) => card(o, i, sel)).join('')}</div>
      ${shitaHtml(G)}
      ${keraiCommandHtml(G)}
      <style>#screen .hy .kerai-command button:focus-visible,#screen .hy .kerai-command summary:focus-visible{outline:3px solid var(--kin);outline-offset:2px;box-shadow:0 0 0 5px var(--sumi,#14120f)}</style>
      <div class="hy-act">${onBack ? '<button class="btn" id="hy-back">城下へ戻る</button>' : ''}<button class="btn primary" id="b-next">${esc(list[sel].name)}で出陣する</button></div></section>`);
    const redraw = (i = sel) => {
      const expanded = sc.querySelector('.shita')?.open;
      const heads = sc.querySelector('.kerai-command')?.open;
      const scroll = sc.scrollTop;
      sel = i; draw();
      const next = $('screen');
      const panel = next.querySelector('.shita'); if (panel) panel.open = !!expanded;
      const command = next.querySelector('.kerai-command'); if (command) command.open = !!heads;
      next.scrollTop = scroll;
    };
    pickable(sc, list, sel, redraw);
    shitaBind(G, sc);
    keraiCommandBind(G, sc, () => redraw());
    if (onBack) $('hy-back').onclick = () => { if (!done) { done = true; onBack(); } };
    $('b-next').onclick = () => {
      if (done) return; done = true;
      G.shitaku = { at: G.battle, k: list[sel].k };
      onGo();
    };
    $('b-next').focus({ preventScroll: true });
  };
  draw();
}

// 戦の始め（realm.js の realmBattle から）：選んだ支度をこの戦にだけ効かせる
export function hyojoBattle(rt) {
  const G = rt.G, S0 = G.shitaku;
  if (!hyojoOn(G) || !S0 || S0.at !== rt.index || !rt.player) return;
  const p = rt.player;
  rt.shitaku = S0.k;
  let word = '';
  if (S0.k === 'togi') {
    const base = p.spearDmg.bind(p);
    p.spearDmg = () => base() * 1.12;
    word = '研いだ穂先で、突きが重い';
  } else if (S0.k === 'hyoro') {
    p.maxSta = Math.round(p.maxSta * 1.2); p.sta = p.maxSta;
    word = '腰兵糧で、息が長く続く';
  } else if (S0.k === 'nakama') {
    for (const u of rt.tomoUnits || []) { u.hp = u.maxHp = u.maxHp * 1.15; u.dmg *= 1.15; }
    // 組と近くの味方の隊は、組ができてから士気を上げる
    rt.after(1.5, () => {
      const P = p.u.pos, seen = new Set();
      for (const u of rt.squad || []) if (u.group) seen.add(u.group);
      if (!seen.size) for (const g of rt.army.groups || []) {
        if (g.team !== 0 || g.isTomo || !g.anchor) continue;
        if (Math.hypot(g.anchor.x - P.x, g.anchor.z - P.z) < 45) seen.add(g);
      }
      for (const g of seen) g.morale = Math.min(100, (g.morale || 0) + 10);
      rt.shitakuGroups = seen.size;
    });
    word = '申し合わせた味方が、崩れにくい';
  }
  if (word) rt.after(7, () => { if (!rt.over) rt.bark(`支度：${word}`); });
}
