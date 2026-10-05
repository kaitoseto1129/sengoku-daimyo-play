// 段2・係A：内政と知行。G.dom を持つ。詳しくは docs/phase2-design.md の 3-A。
// このファイルは係A だけが直す。
import { addKan, zeni, BATTLES, scenario } from './state.js';
import { keraiBest, keraiOf } from './retainers.js';
import { spendLog } from './toiya.js';

import { styleOnce } from './style_once.js';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 身分（RANKS の番号）で届く知行の下限（石）。0・1は無し、2組頭=30、3大将候補=60、4大将=100
export const KOKU_FLOOR = [0, 0, 30, 60, 100];
const KOKU_MAX = 1000;

// 城下（town）ごとの国。知行の村の名はここから引く
const TOWN_KUNI = { 清洲: '尾張', 小牧山: '尾張', 岐阜: '美濃', 安土: '近江' };
const VILLAGES = {
  尾張: ['春日井郡 味鋺村', '丹羽郡 楽田村', '中島郡 起村', '葉栗郡 黒田村'],
  美濃: ['厚見郡 加納村', '本巣郡 織部村', '席田郡 河渡村', '安八郡 墨俣村'],
  近江: ['蒲生郡 円山村', '神崎郡 五個荘村', '甲賀郡 石部村', '高島郡 今津村'],
};
function pickVillage(G) {
  const town = (BATTLES[G.battle] && BATTLES[G.battle].town) || '清洲';
  const kuni = TOWN_KUNI[town] || '尾張';
  const list = VILLAGES[kuni];
  const seed = (G.name || 'つ').length * 7 + (G.battle || 0);
  return list[seed % list.length];
}

export function domOf(G) {
  const D = G.dom || (G.dom = {});
  const defaults = { koku: 0, mura: '', ta: 0, machi: 0, hei: 0, ren: 0, hatake: false, tsukuroi: false, at: -1, lastMsg: '', lastEffect: '' };
  if (D.gunsmith === undefined) { D.oldMarketGuns = (D.machi || 0) >= 2; D.gunsmith = 0; }
  if (D.hyourou === undefined) D.hyourou = Math.min(36, (D.ta || 0) * 2);
  for (const key of Object.keys(defaults)) if (D[key] === undefined) D[key] = defaults[key];
  // 古い保存も、今の身分まで届ける。知行と村の名は失わせない。
  D.koku = Math.min(KOKU_MAX, Math.max(D.koku, KOKU_FLOOR[G.rank || 0] || 0));
  if (D.koku && !D.mura) D.mura = pickVillage(G);
  return D;
}
export function kokuOf(G) { return domOf(G).koku; }
export function villageOf(G) { return domOf(G).mura; }

// ---------------- 内政の札 ----------------
const CARDS = [
  { id: 'chohei', name: '兵を集める', minRank: 2, cost: (D) => Math.min(4, heiRoom(D)) * 0.5,
    eff: (D) => `次の戦で、手勢${Math.min(4, heiRoom(D))}人が増える。今の上限${Math.min(12, Math.floor((D.koku || 0) / 10))}人${D.koku < 120 ? `。知行${(Math.floor((D.koku || 0) / 10) + 1) * 10}石で次の一人分の枠が増える` : '。手勢の上限は十二人'}`,
    avail: (G, D) => heiRoom(D) > 0,
    apply: (G, D) => { D.hei += Math.min(4, heiRoom(D)); } },
  { id: 'kaikon', name: '田を開く', minRank: 2, cost: 3,
    eff: () => '兵糧が2石増える。戦後に蔵から受け取る米も2石増え、領地収入の前渡しも一割増える（田5枚まで）',
    avail: (G, D) => D.ta < 5,
    apply: (G, D) => { D.ta++; D.hyourou = Math.min(36, D.hyourou + 2); } },
  { id: 'machi', name: '市を開く', minRank: 3, cost: 5,
    eff: () => '毎戦の町の銭が1貫増える。市があると鉄砲鍛冶を呼べる（市5か所まで）',
    avail: (G, D) => D.machi < 5,
    apply: (G, D) => { D.machi++; } },
  { id: 'kaji', name: '鉄砲鍛冶を呼ぶ', minRank: 3, cost: 4,
    eff: (D) => `鉄砲が${Math.min(6, (D.gunsmith || 0) * 2 + 2)}挺まで揃う。手勢の半分まで鉄砲を持てる（鍛冶3か所まで）`,
    avail: (G, D) => D.machi > 0 && (D.gunsmith || 0) < 3,
    apply: (G, D) => { D.gunsmith = (D.gunsmith || 0) + 1; } },
  { id: 'kunren', name: '手勢を鍛える', minRank: 3, cost: 2,
    eff: () => '次の戦で、手勢の強さが8％増す（3段まで）',
    avail: (G, D) => D.ren < 3 && D.hei > 0,
    apply: (G, D) => { D.ren++; } },
  { id: 'tsukuroi', name: '具足を繕う', minRank: 0, cost: 1,
    eff: () => '次の戦で、自分の体力が8％増す（この戦だけ）',
    avail: (G, D) => !D.tsukuroi,
    apply: (G, D) => { D.tsukuroi = true; } },
  { id: 'hatake', name: '屋敷の畑を耕す', minRank: 0, maxRank: 1, cost: 0,
    eff: () => '次の戦で、留守の者が畑を手入れし、500文が入る（足軽のうちは毎戦）',
    avail: (G, D) => !D.hatake,
    apply: (G, D) => { D.hatake = true; } },
];
function heiRoom(D) { return Math.max(0, Math.min(12, Math.floor((D.koku || 0) / 10)) - D.hei); }

function cardCost(c, D) { return typeof c.cost === 'function' ? c.cost(D) : c.cost; }

function priorityOrder(D) {
  const base = ['kaikon', 'machi', 'kaji', 'kunren', 'chohei', 'tsukuroi', 'hatake'];
  return D.hei === 0 ? ['chohei', ...base.filter((x) => x !== 'chohei')] : base;
}

export function domainOpened(rank) { return CARDS.filter((c) => c.minRank === rank).map((c) => c.name); }
export const domainWorkLimit = (rank) => [1, 1, 1, 2, 3][rank || 0] || 1;

export function domainCards(G, includeUnavailable = false) {
  const D = domOf(G);
  const rank = G.rank || 0;
  const on = CARDS.filter((c) => rank >= c.minRank && (c.maxRank === undefined || rank <= c.maxRank) && (includeUnavailable || c.avail(G, D)));
  const order = priorityOrder(D);
  on.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return on;
}

// 城下から次の戦までの時。古い保存の「済」は、使い切ったものとして扱う。
export function domainWork(G) {
  const D = domOf(G), limit = domainWorkLimit(G.rank);
  const used = D.workAt === G.battle ? (D.workN || 0) : D.at === G.battle ? limit : 0;
  return { limit, used, left: Math.max(0, limit - used) };
}
export function domainGuns(D, n = D.hei) {
  // 町だけで鉄砲を揃えた以前の保存も、その分を失わせない。
  return Math.min(Math.floor(n / 2), Math.max((D.gunsmith || 0) * 2, D.oldMarketGuns ? Math.floor(n / 4) : 0));
}
export function domainPreview(G) {
  const D = domOf(G), fed = Math.min(D.hei, D.hyourou * 4);
  const lines = [];
  if (D.hei) lines.push(`手勢：${D.hei}人`);
  if (domainGuns(D)) lines.push(`鉄砲：${domainGuns(D)}挺`);
  if (D.hyourou) lines.push(`兵糧：${D.hyourou}石${fed ? `（手勢${fed}人の体力＋10％）` : '（兵を集めると養える）'}`);
  if (D.ren && D.hei) lines.push(`調練：手勢の強さ＋${D.ren * 8}％`);
  if (D.hatake && (G.rank || 0) <= 1) lines.push('留守の者が畑を手入れし、毎戦500文が入る');
  if (D.tsukuroi) lines.push('繕った具足：体力＋8％');
  return lines.join('\n') || 'まだ戦の備えはない。まず具足を繕うか、畑を耕せる';
}
export function domainAct(G, id) {
  const D = domOf(G), work = domainWork(G);
  const c = domainCards(G).find((x) => x.id === id);
  if (!work.left || !c) return null;
  const cost = cardCost(c, D);
  if ((G.kan || 0) < cost) return null;
  const effect = c.eff(D);
  if (cost) { addKan(G, -cost); spendLog(G, c.name, cost); }
  c.apply(G, D);
  if (D.workAt !== G.battle) D.workLog = [];
  D.workLog ||= [];
  D.workLog.push({ name: c.name, effect, cost });
  D.workLog = D.workLog.slice(-work.limit);
  D.workAt = G.battle; D.workN = work.used + 1;
  if (D.workN >= work.limit) D.at = G.battle;
  D.lastMsg = `${c.name}（今の城下で${D.workN}回目）`;
  D.lastEffect = `${cost ? zeni(cost) + 'を払った' : '銭の支払いなし'}。${effect}`;
  return `${c.name}。${D.lastEffect}`;
}

// 本文は写さず、書状の配置を借りる。実物の印・花押は作らない。
// 北条家裁許印判状：日付の所に印を置く（国立公文書館）。
// https://www.archives.go.jp/exhibition/digital/rekishitomonogatari/contents/35.html
// 信長朱印状：宛行いと奉公を結ぶ（神戸大学・中川家文書）。
// https://hdl.handle.net/20.500.14094/0100399105
export function monjoHtml({ title, body, plain, date, sender, recipient }) {
  return `${styleOnce('monjo', `
.monjo{position:relative;isolation:isolate;box-sizing:border-box;width:100%;max-width:38em;min-width:0;margin:10px auto 14px;padding:16px;background:#efe3c9;border:1px solid #b19b77;color:#30271e;text-align:left;overflow-wrap:anywhere}
.monjo .mj-paper{position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none}
.monjo .mj-title{display:block;font:600 18px/1.5 serif;letter-spacing:.12em;color:#30271e;margin:0 0 8px}
.monjo .mj-body{font:16px/1.8 serif;color:#30271e;margin:0 0 8px;animation:none;opacity:1;transform:none}
.monjo .mj-end{text-align:right;font:15px/1.5 serif;color:#30271e;margin:0 0 8px;animation:none;opacity:1;transform:none}
.monjo .mj-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;font:14px/1.6 serif}
.monjo .mj-foot span{display:block;color:#30271e}
.monjo .mj-mark{width:56px;height:56px;flex:none}
.monjo .mj-to{display:block;margin:8px 0;font:600 16px/1.6 serif;color:#30271e}
.monjo .mj-plain{padding-top:8px;border-top:1px solid #b19b77;color:#403426;font:15px/1.6 sans-serif}
.monjo .mj-plain b{display:block;color:#403426;font-size:12px}
.monjo .mj-source{margin-top:8px;font:12px/1.6 sans-serif;color:#514334}
.monjo .mj-source summary{min-height:44px;display:flex;align-items:center;cursor:pointer;color:#514334}
.monjo .mj-source a{display:flex;align-items:center;min-height:44px;margin:8px 0;color:#633322;text-decoration:underline}
.story.short .monjo{padding:10px 12px;margin:8px 0}
.story.short .monjo .mj-title{font-size:16px;margin-bottom:4px}
`)}<article class="monjo" aria-label="${esc(title)}">
<canvas class="mj-paper" width="640" height="360" aria-hidden="true"></canvas>
<b class="mj-title">${esc(title)}</b><p class="mj-body">${esc(body)}</p><p class="mj-end">仍って件の如し（右に書いたとおり）</p>
<div class="mj-foot"><div><span>${esc(date)}</span><span>${esc(sender)}</span></div><canvas class="mj-mark" width="112" height="112" aria-hidden="true"></canvas></div>
<b class="mj-to">${esc(recipient)}</b><div class="mj-plain"><b>やさしく読むと</b>${esc(plain)}</div>
<details class="mj-source"><summary>書状の手本と、遊びで補った所</summary>
<div>結びの言葉は「右に書いたとおり」の意味。文と印は遊び用です。実物の書状の写しではありません。</div>
<div>日付欄は戦の時期、または日付不明としました。書状が出た日は分かりません。知行の村と石高は遊びの数です。</div>
<div><a href="https://www.archives.go.jp/exhibition/digital/rekishitomonogatari/contents/35.html" target="_blank" rel="noopener noreferrer">北条家裁許印判状（国立公文書館）</a>は、日付の所に印を置く形の手本です。</div>
<div><a href="https://hdl.handle.net/20.500.14094/0100399105" target="_blank" rel="noopener noreferrer">織田信長朱印状（神戸大学・中川家文書）</a>は、土地を与え、働きを求める文の手本です。本文は写していません。</div>
<div>桑山基氏文書・革島一宣宛信長朱印状・保阪潤治氏文書の個々の本文と印の形は、ここでは確かめきれていないため再現していません。</div>
</details></article>`;
}

// 紙と遊び用の印は、最初の表示で一枚ずつ描き、以後は使い回す。
let monjoPaper = null, monjoMark = null;
export function mountMonjo(root = document) {
  const papers = root.querySelectorAll('.mj-paper');
  if (!papers.length) return;
  if (!monjoPaper) {
    monjoPaper = document.createElement('canvas');
    monjoPaper.width = 640; monjoPaper.height = 360;
    const c = monjoPaper.getContext('2d');
    if (c) {
      c.fillStyle = '#efe3c9'; c.fillRect(0, 0, 640, 360);
      c.strokeStyle = 'rgba(103,77,44,.07)'; c.lineWidth = 1;
      for (let i = 0; i < 420; i++) {
        const x = (i * 97) % 640, y = (i * 53) % 360;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + 2 + i % 7, y + i % 3); c.stroke();
      }
      for (const x of [214, 427]) {
        c.fillStyle = 'rgba(103,77,44,.08)'; c.fillRect(x, 0, 2, 360);
        c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(x + 2, 0, 2, 360);
      }
      c.strokeStyle = 'rgba(103,77,44,.18)'; c.strokeRect(.5, .5, 639, 359);
    }
    monjoMark = document.createElement('canvas');
    monjoMark.width = monjoMark.height = 112;
    const s = monjoMark.getContext('2d');
    if (s) {
      s.translate(56, 56); s.rotate(-.05);
      s.strokeStyle = '#9b352b'; s.fillStyle = '#9b352b'; s.lineWidth = 4;
      s.strokeRect(-38, -38, 76, 76); s.lineWidth = 1; s.strokeRect(-32, -32, 64, 64);
      s.font = 'bold 48px serif'; s.textAlign = 'center'; s.textBaseline = 'middle'; s.fillText('印', 0, 0);
      s.fillStyle = '#efe3c9';
      for (let i = 0; i < 24; i++) s.fillRect((i * 19) % 76 - 38, (i * 29) % 76 - 38, 2, 2);
    }
  }
  papers.forEach((el) => el.getContext('2d')?.drawImage(monjoPaper, 0, 0));
  root.querySelectorAll('.mj-mark').forEach((el) => el.getContext('2d')?.drawImage(monjoMark, 0, 0));
}

export function domainHtml(G) {
  const D = domOf(G);
  const work = domainWork(G), done = !work.left;
  const wages = keraiOf(G).filter((k) => k.alive).reduce((sum, k) => sum + k.pay, 0);
  const cards = domainCards(G, true);
  const list = cards.map((c) => {
    const available = c.avail(G, D), cost = cardCost(c, D);
    const missing = c.id === 'kaji' && !D.machi ? '先に市を開く' : c.id === 'kunren' && !D.hei ? '先に兵を集める' : '';
    const status = !available ? missing || '済・上限まで備えた' : done ? '今の城下の時は使い切った' : (G.kan || 0) < cost ? `あと${zeni(cost - (G.kan || 0))}` : '今できる';
    const can = available && !done && (G.kan || 0) >= cost;
    return `<div class="dm-card${!available && !missing ? ' dm-done' : ''}"><b class="dm-t">${esc(c.name)}</b><p class="dm-x">${esc(status)}${available ? `。${esc(c.eff(D))}。時を1回使う` : ''}</p><button class="dm-btn" type="button" ${can ? `data-dm="${c.id}"` : 'disabled aria-disabled="true"'}>${esc(c.name)}${available && cost ? `（${zeni(cost)}）` : ''}</button></div>`;
  }).join('') || '<p class="dm-note">今できる内政は無い</p>';
  const performed = D.workAt === G.battle && D.workLog?.length ? `<div class="dm-done"><b class="dm-t">この城下で済んだ仕事</b><ul class="dm-x">${D.workLog.map((x) => `<li>${esc(x.name)}：${x.cost == null ? '費用の記録なし' : x.cost ? zeni(x.cost) + 'を払った' : '銭の支払いなし'}。${esc(x.effect)}</li>`).join('')}</ul></div>` : D.lastMsg && (D.workAt === G.battle || D.at === G.battle) ? `<p class="dm-x">済：${esc(D.lastMsg)}。${esc(D.lastEffect)}</p>` : '';
  const muraLine = D.mura ? `${monjoHtml({
    title: '知行宛行いの控え（領地の書付）',
    body: `${D.mura}の内、${D.koku}石を宛て置く。領内をよく治むべきこと。`,
    plain: `${D.mura}で、${D.koku}石分の収入を受ける知行です。村を整え、次の戦に備えられます。`,
    date: '日付不明（いまの知行の控え）', sender: '主家より', recipient: `${G.name || '家臣'}殿`,
  })}<p class="dm-note">田${D.ta}枚・市${D.machi}か所・鍛冶${D.gunsmith || 0}か所・手勢${D.hei}人・調練${D.ren}段</p>` : '<p class="dm-note">足軽組頭になると、村から収入を受ける知行30石をもらい、田を開けます。</p>';
  return `<section class="dm" aria-label="内政">
${styleOnce('dm', `<style>
.realm .dm-mura{font-size:13px;color:var(--washi-dim);margin:0 0 6px}
.realm .dm-card{position:relative;background:rgba(236,228,210,.05);border:1px solid rgba(236,228,210,.15);border-radius:8px;padding:10px;margin-bottom:8px}
.realm .dm-rec{border-color:var(--kin);background:rgba(194,162,90,.1)}
.realm .dm-badge{float:right;font-size:12px;color:var(--kin);padding:2px 7px}
.realm .dm-t{font-size:15px;color:var(--washi);display:block}
.realm .dm-x{font-size:15px;line-height:1.6;color:var(--washi-dim);margin:4px 0 8px}
.realm .dm-btn{box-sizing:border-box;min-height:44px;width:100%;border-radius:8px;border:1px solid var(--kin);background:rgba(194,162,90,.15);color:var(--washi);font-size:15px;padding:0 10px}
.realm .dm-btn:disabled{opacity:.38;border-color:var(--washi-faint)}
.realm .dm-btn small{display:block;font-size:12px;color:var(--washi-faint)}
.realm .dm-note{font-size:13px;color:var(--washi-faint)}
.realm .dm-done .dm-dot{color:var(--kin);margin-right:4px}
.realm .dm button:focus-visible{outline:3px solid var(--kin);outline-offset:2px;box-shadow:0 0 0 5px var(--sumi,#14120f)}
</style>`)}
<h3 class="realm-h">領地と戦の支度</h3>${muraLine}<p class="dm-x">銭 ${zeni(G.kan)}。兵糧の蓄え${D.hyourou || 0}石。知行${D.koku || 0}石。出陣までの時はあと${work.left}回／${work.limit}回。身分が上がると任される土地と、使える時が増える。</p><details><summary class="dm-btn">備えの内訳を開く</summary><p class="dm-x">手勢${D.hei}人・鉄砲${domainGuns(D)}挺・調練${D.ren}段・兵糧${D.hyourou}石</p></details><ul class="dm-x">${domainPreview(G).split("\n").map((line) => `<li>${esc(line)}</li>`).join('')}</ul><p class="dm-note">兵糧1石で手勢4人を養う。食べた分は戦で使い、戦の後は以前の収穫の蓄えから、田1枚につき2石を受け取る（蓄え36石まで）。鉄砲は手勢に持たせる。兵や家臣を増やすと、毎戦の扶持と俸禄も増える。</p><p class="dm-x">毎戦の支払い：手勢の扶持${zeni(D.hei * 0.2)}・家臣の俸禄${zeni(wages)}。内政も褒美も使者も、手元の銭から払う。</p>${G.rank >= 3 && !D.machi ? '<p class="dm-note">鉄砲鍛冶は先に市を一か所開くと呼べる。</p>' : ''}${G.rank >= 3 && !D.hei ? '<p class="dm-note">調練は先に兵を集めると選べる。</p>' : ''}${performed}<div class="dm-list">${list}</div>
</section>`;
}

export function domainBind(G, done, confirm) {
  mountMonjo(document.querySelector('.realm') || document);
  document.querySelectorAll('[data-dm]').forEach((btn) => {
    if (btn.disabled) return;
    btn.onclick = () => {
      const msg = domainAct(G, btn.getAttribute('data-dm'));
      if (!msg) return;
      done(msg);
    };
  });
}

// ---------------- 戦の中 ----------------
export function domainBattle(rt) {
  const G = rt.G, D = domOf(G);
  if (D.tsukuroi) {
    rt.player.u.maxHp *= 1.08;
    rt.player.u.hp *= 1.08;
    D.tsukuroi = false;
    rt.realm.tsukuroi = true;
  }
  if (D.hei > 0) {
    const aliveNow = rt.army.units.filter((u) => u.alive).length;
    const n = Math.max(0, Math.min(D.hei, 235 - aliveNow));
    rt.realm.heiHeld = D.hei - n;
    rt.realm.heiN = n;
    if (n > 0) {
      const P = rt.player.u, h = P.heading || 0;
      const g = rt.army.addGroup({
        team: 0, faction: rt.G.lordFaction || scenario().faction, name: '手勢', order: 'follow', formation: 'line', facing: h,
        anchor: { x: P.pos.x - Math.sin(h) * 5, z: P.pos.z - Math.cos(h) * 5 }, aggro: 8, spacing: 1.5, morale: 80, noRout: false,
      });
      g.kind = 'tegei'; g.fire = true;
      const gunN = domainGuns(D, n);
      const ashiN = n - gunN;
      const units = [];
      if (ashiN) units.push(...rt.army.spawn(g, [{ type: 'ashigaru', n: ashiN, o: { flag: null } }]));
      if (gunN) units.push(...rt.army.spawn(g, [{ type: 'gun', n: gunN, o: { flag: null } }]));
      const mult = 1 + 0.08 * D.ren;
      const fed = Math.min(units.length, Math.floor(D.hyourou) * 4);
      const food = Math.ceil(fed / 4);
      D.hyourou -= food;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        u.hp = u.maxHp = u.maxHp * mult * (i < fed ? 1.1 : 1);
        u.dmg *= mult; u.isHei = true; u.isSub = true; u.kills = 0;
      }
      rt.realm.gunN = gunN; rt.realm.food = food; rt.realm.fedN = fed; rt.realm.train = D.ren * 8;
      rt.realm.tegei = g;
      rt.realm.heiN = units.length;
      rt.after(6, () => { if (!rt.over) rt.bark(`手勢${units.length}人が後ろに付く`); });
    }
  }
}

export function domainAfter(G, r, b, i) {
  const before = G.dom ? (G.dom.koku || 0) : (KOKU_FLOOR[r.rankBefore ?? G.rank] || 0);
  const D = domOf(G), landLines = [], losses = [];
  r.realmLines ||= [];
  if (D.koku > before) landLines.push(before ? `知行が${D.koku}石に上がった` : `${D.mura}に知行${D.koku}石を賜った`);
  if ((G.rank || 0) >= 2) {
    const add = Math.min(KOKU_MAX - D.koku, { 甲上: 20, 甲: 10, 乙: 5, 丙: 0 }[r.grade] || 0);
    if (add > 0) { D.koku += add; landLines.push(`加増　＋${add}石（${r.grade}の働き）`); }
  }
  if (b.realm && D.hei > 0) r.realmLines.push(`手勢の出陣${b.realm.heiN || 0}人・留守の控え${b.realm.heiHeld || 0}人（戦場の兵数の上限で決まる）`);
  // 手勢の頭の家臣は、手勢の人数と損耗に数えない。
  if (b.realm && b.realm.tegei) {
    let lost = 0, killed = 0;
    for (const u of b.realm.tegei.units) {
      if (!u.isHei) continue;
      if (!u.alive) lost++;
      killed += u.kills || 0;
    }
    if (lost) { D.hei = Math.max(0, D.hei - lost); losses.push(`手勢のうち${lost}人が討たれた`); }
    if (killed) losses.push(`手勢の働きで敵${killed}人を討ち取った`);
  }
  if (D.koku > 0) {
    const pol = keraiBest(G, 'rusu', 'pol');
    const nen = Math.round(D.koku * 0.05 * (1 + 0.1 * D.ta) * (1 + pol / 500) * 1000) / 1000;
    const base = Math.round(D.koku * 0.05 * (1 + 0.1 * D.ta) * 1000) / 1000;
    const extra = Math.round((nen - base) * 1000) / 1000;
    if (nen) { addKan(G, nen); r.realmLines.push(`領地収入の前渡し　＋${zeni(base)}`); if (extra) r.realmLines.push(`留守居の働きで前渡し　＋${zeni(extra)}（政治${pol}）`); }
  }
  const harvest = Math.max(0, Math.min(36 - D.hyourou, D.ta * 2));
  D.hyourou += harvest;
  if (harvest) r.realmLines.push(`蔵の蓄えから補給　兵糧＋${harvest}石（蓄え${D.hyourou}石）`);
  if (b.realm && b.realm.food) r.realmLines.push(`兵糧${b.realm.food}石で手勢${b.realm.fedN}人を養った（体力＋10％）`);
  if (landLines.length) landLines.push(`任される土地${D.koku}石・手勢は${Math.min(12, Math.floor(D.koku / 10))}人まで・内政の時は${domainWork(G).limit}回`);
  r.realmLines.push(...landLines);
  if (D.machi) { addKan(G, D.machi); r.realmLines.push(`町の銭　＋${zeni(D.machi)}`); }
  if (D.hatake && (G.rank || 0) <= 1) { addKan(G, 0.5); r.realmLines.push(`留守の者が手入れした屋敷の畑から　＋${zeni(0.5)}`); }
  r.realmLines.push(...losses);
  if (D.hei > 0) {
    // 文で計算し、一人分払えないごとに去る。残る者の扶持だけ払う。
    const paidN = Math.min(D.hei, Math.floor(Math.round((G.kan || 0) * 1000) / 200));
    const goneN = D.hei - paidN, wage = paidN * 0.2;
    if (wage) { addKan(G, -wage); spendLog(G, '手勢の扶持', wage); r.realmLines.push(`手勢の扶持　−${zeni(wage)}`); }
    D.hei = paidN;
    if (goneN) r.realmLines.push(`扶持が払えず、手勢${goneN}人が去った`);
  }
}
