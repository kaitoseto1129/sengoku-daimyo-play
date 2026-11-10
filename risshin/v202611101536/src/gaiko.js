// 外交の使者。保存は既存の G.dip に欄を足すだけ。史実の敵味方と戦の順は変えない。
import { BATTLES, scenarioKey, addKan, zeni } from './state.js';
import * as OLD from './diplomacy.js';
import { allyGroup } from './bhelp.js';
import { spendLog } from './toiya.js';
import { styleOnce } from './style_once.js';

export const TURN_OF = OLD.TURN_OF;
export const houseName = (key) => TARGETS[key]?.name || OLD.houseName(key);
const TARGETS = {
  tokugawa: { name: '徳川家', from: 1562, to: 1582, rank: 2 },
  azai: { name: '浅井家', from: 1567, to: 1573, rank: 2 },
  takeda: { name: '武田家', from: 1565, to: 1582, rank: 2 },
  uesugi: { name: '上杉家', from: 1562, to: 1582, rank: 3 },
  honganji: { name: '本願寺', from: 1568, to: 1580, rank: 2 },
  court: { name: '朝廷', from: 1568, to: 1582, rank: 3 },
  shogun: { name: '将軍', from: 1568, to: 1573, rank: 3 },
};
const WORK = {
  gift: { name: '贈り物を届ける', rank: 2, cost: 1, trust: 8, fear: -2 },
  marriage: { name: '婚姻の縁を取り次ぐ', rank: 4, cost: 3, trust: 12, fear: -4 },
  alliance: { name: '同盟の話を進める', rank: 4, cost: 2, trust: 10, fear: -2 },
  peace: { name: '和睦の話を取り次ぐ', rank: 3, cost: 2, trust: 6, fear: -6 },
  turn: { name: '敵の国衆へ内通を働きかける', rank: 3, cost: 2, trust: -4, fear: 8 },
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n) => Math.max(0, Math.min(100, n));
const yearOf = (G) => Number(BATTLES[G.battle]?.year?.match(/[（(](\d{4})[）)]/)?.[1] || 0);
const on = (G) => !!G && !G.lord && !G.practice && !G.trialStep && scenarioKey() === 'oda' && !!BATTLES[G.battle] && BATTLES[G.battle].id !== 'honnoji';

export function dipOf(G) {
  const D = OLD.dipOf(G);
  D.fear ||= {};
  D.talk ||= {};
  for (const key of Object.keys(TARGETS)) {
    if (!Number.isFinite(D.rel[key])) D.rel[key] = OLD.HOUSES[key]?.rel0 ?? 40;
    D.rel[key] = clamp(D.rel[key]);
    if (!Number.isFinite(D.fear[key])) D.fear[key] = 20;
    D.fear[key] = clamp(D.fear[key]);
    if (!D.talk[key] || typeof D.talk[key] !== 'object') D.talk[key] = {};
  }
  return D;
}

function friendly(G, key) {
  const y = yearOf(G), id = BATTLES[G.battle]?.id;
  if (key === 'tokugawa' || key === 'court') return true;
  if (key === 'azai') return y < 1570;
  if (key === 'takeda') return y < 1572;
  if (key === 'uesugi') return y < 1576;
  return key === 'shogun' && y < 1573 && id !== 'tonezaka';
}
function warning(G, key) {
  const id = BATTLES[G.battle]?.id;
  if (key === 'azai' && id === 'kanegasaki') return '浅井が朝倉を助け、背後へ迫るとの知らせ。離反は止められない。';
  if (key === 'takeda' && id === 'mikatagahara') return '武田が西へ進むとの知らせ。徳川の苦戦は避けられない。';
  if (key === 'honganji' && id === 'nodafukushima') return '本願寺が兵を挙げるとの知らせ。挙兵は止められない。';
  return '';
}
function effect(G, key, work) {
  const D = dipOf(G), w = WORK[work], bi = BATTLES[G.battle];
  const trust = clamp(D.rel[key] + w.trust), fear = clamp(D.fear[key] + w.fear);
  const stage = Math.min(3, (Number(D.talk[key][work]) || 0) + 1);
  const prep = Math.min(12, 3 + Math.floor(trust / 25) + Math.floor(fear / 40) + stage);
  if (key === 'tokugawa' && OLD.AID_OF[bi.id] === key && ['alliance', 'gift'].includes(work)) {
    const n = Math.min(12, 2 + Math.floor(trust / 15) + stage);
    return { kind: 'aid', n, prep, note: `徳川の援兵${n}人を約束する。混む時は入れる人数だけ。` };
  }
  if (work === 'turn') {
    const amount = Math.min(18, 6 + Math.floor((trust + fear) / 20) + stage);
    return { kind: 'turn', amount, prep, who: TURN_OF[bi.id] || `${houseName(key)}につながる国衆`, note: `内通の返事で敵の名のない一隊の士気を最大${amount}下げる。退却は強制しない。対象の隊がなければ知らせによる備えだけ。` };
  }
  return { kind: 'notice', prep, note: `使者の知らせで備える。自分の気力の上限が、この戦だけ${prep}％増す。` };
}

export function diploCards(G) {
  if (!on(G)) return [];
  const D = dipOf(G), y = yearOf(G), rank = G.rank || 0, bi = BATTLES[G.battle];
  if (D.at === G.battle) return [];
  const cards = [];
  for (const [key, t] of Object.entries(TARGETS)) {
    if (rank < t.rank || y < t.from || y > t.to || (key === 'azai' && ['nagashima', 'shitaragahara'].includes(bi.id))) continue;
    for (const [work, w] of Object.entries(WORK)) {
      if (rank < w.rank) continue;
      // 大名家の縁組の仲立ちだけ。婚姻成立や同盟成立を遊び手が決める事はない。
      if (work === 'marriage' && (!['azai', 'takeda'].includes(key) || !friendly(G, key))) continue;
      if (work === 'alliance' && (!friendly(G, key) || ['court', 'shogun'].includes(key))) continue;
      if (work === 'peace' && friendly(G, key) && !['court', 'shogun'].includes(key)) continue;
      if (work === 'turn' && (!TURN_OF[bi.id] || OLD.FOE_OF[bi.id] !== key)) continue;
      const e = effect(G, key, work);
      cards.push({ id: `${key}:${work}`, house: key, work, name: `${t.name}へ${w.name}`, cost: w.cost, ...e });
    }
  }
  return cards;
}

export function gaikoAct(G, id) {
  const c = diploCards(G).find((x) => x.id === id);
  if (!c || (G.kan || 0) < c.cost) return '';
  const D = dipOf(G), w = WORK[c.work], t = D.talk[c.house];
  addKan(G, -c.cost); spendLog(G, c.name, c.cost);
  D.rel[c.house] = clamp(D.rel[c.house] + w.trust);
  D.fear[c.house] = clamp(D.fear[c.house] + w.fear);
  t[c.work] = Math.min(3, (Number(t[c.work]) || 0) + 1);
  D.at = G.battle;
  D.next = { battle: G.battle, gaiko: true, kind: c.kind, house: c.house, n: c.n, amount: c.amount, prep: c.prep, who: c.who, note: c.note };
  D.lastMsg = `${c.name}。話は三段のうち${t[c.work]}段まで進んだ。${warning(G, c.house)}${c.note}`;
  return D.lastMsg;
}

const CSS = `.gaiko{min-width:0;color:var(--washi);font-size:16px;line-height:1.6}.gaiko label{display:block;margin:8px 0}.gaiko select,.gaiko button{box-sizing:border-box;width:100%;min-height:48px;margin-top:8px;padding:8px;font-size:16px;white-space:normal;border:1px solid var(--kin);border-radius:8px;background:#242019;color:var(--washi)}.gaiko .gk-fields{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.gaiko p{margin:8px 0;overflow-wrap:anywhere}.gaiko small{font-size:13px;color:var(--washi-dim)}.gaiko button:disabled{border-style:dashed;color:var(--washi-dim)}.gaiko :is(button,select):focus-visible{outline:3px solid var(--kin);outline-offset:2px;box-shadow:0 0 0 5px var(--sumi)}.gaiko .gk-confirm{margin-top:16px}.gaiko .gk-confirm .row{gap:8px}`;
function detail(G, c) {
  const D = dipOf(G), w = WORK[c.work];
  return `<p>${houseName(c.house)}の信用${D.rel[c.house]}・恐れ${D.fear[c.house]}（百まで）。</p><p>この用の話：三段のうち${Number(D.talk[c.house][c.work]) || 0}段。信用${w.trust > 0 ? '＋' : '−'}${Math.abs(w.trust)}・恐れ${w.fear > 0 ? '＋' : '−'}${Math.abs(w.fear)}。</p><p>${esc(warning(G, c.house))}${esc(c.note)}</p><small>${c.work === 'marriage' ? '信長の家の縁を取り次ぐ。自分が婚姻する話ではない。' : c.work === 'peace' ? '休戦の知らせや仲立ちを頼む。次の戦を無くす事はできない。' : '敵味方・戦の順・史実の結末は変わらない。'} 話を重ねると次の戦への備えが増す。</small><button type="button" data-gk-send="${c.id}" ${(G.kan || 0) < c.cost ? 'disabled' : ''}>${esc(c.name)}（${zeni(c.cost)}）</button>${(G.kan || 0) < c.cost ? `<p>銭があと${zeni(c.cost - (G.kan || 0))}要る。</p>` : ''}`;
}
export function diploHtml(G) {
  const D = dipOf(G), cards = diploCards(G);
  const keys = [...new Set(cards.map((c) => c.house))], c = cards[0];
  return `<section class="gaiko" aria-label="外交の使者">${styleOnce('gaiko', CSS)}<h3 class="realm-h">外交の使者</h3><p>次の戦までに、使者の用を一つ選ぶ。</p>${D.at === G.battle ? `<p role="status">● 済　${esc(D.lastMsg)}</p>` : !c ? '<p>今は使者の用がない。組頭から贈り物、侍から和睦と調略、侍大将から同盟と婚姻の仲立ちを任される。</p>' : `<div class="gk-fields"><label>使者を送る相手を選ぶ<select data-gk-house>${keys.map((key) => `<option value="${key}">${houseName(key)}</option>`).join('')}</select></label><label>使者の用を選ぶ<select data-gk-work>${cards.filter((x) => x.house === c.house).map((x) => `<option value="${x.work}">${WORK[x.work].name}</option>`).join('')}</select></label></div><div data-gk-detail>${detail(G, c)}</div><div class="gk-confirm"></div>`}</section>`;
}
export function diploBind(G, done, confirm) {
  const root = document.querySelector('.gaiko'), house = root?.querySelector('[data-gk-house]'), work = root?.querySelector('[data-gk-work]');
  if (!house || !work) return;
  const refresh = (changedHouse) => {
    const cards = diploCards(G).filter((c) => c.house === house.value);
    if (changedHouse) work.innerHTML = cards.map((c) => `<option value="${c.work}">${WORK[c.work].name}</option>`).join('');
    const c = cards.find((x) => x.work === work.value);
    root.querySelector('.gk-confirm').innerHTML = '';
    if (!c) return;
    root.querySelector('[data-gk-detail]').innerHTML = detail(G, c);
    root.querySelector('[data-gk-send]').onclick = () => {
      const at = G.battle;
      confirm(root.querySelector('.gk-confirm'), `${c.name}。${c.note}`, c.name, () => {
        if (G.battle !== at) return;
        const msg = gaikoAct(G, c.id);
        if (msg) done(msg);
      }, { sub: `銭${zeni(c.cost)}を使う。出陣まで使者の用は選び直せない。` });
    };
  };
  house.onchange = () => refresh(true); work.onchange = () => refresh(false); refresh(false);
}

function foeGroup(rt) {
  return rt.army.groups.find((g) => g.team === 1 && !g.routed && !g.civ && !g.ambush && !g.noRout && !g.onRout && !g.onArrive
    && g.units.some((u) => u.alive) && !g.units.some((u) => u.invuln || u.name || u.type === 'busho'));
}
export function diploBattle(rt) {
  if (!on(rt.G) || rt.def.town || rt.def.dojo || rt.def.mapCastle || rt.def.noDiplo || rt.realm.gaikoApplied) return;
  const D = dipOf(rt.G), nx = D.next;
  if (!nx || nx.battle !== rt.index) return;
  // 古い保存の使者も、元の働きのまま届ける。
  if (!nx.gaiko) { OLD.diploBattle(rt); return; }
  D.next = null; rt.realm.gaikoApplied = true;
  rt.player.maxSta = Math.round(rt.player.maxSta * (1 + nx.prep / 100));
  rt.player.sta = rt.player.maxSta;
  const result = rt.realm.gaikoResult = { line: `使者の知らせで備え、気力の上限が${nx.prep}％増した` };
  rt.after(10, () => { if (!rt.over) rt.bark(`${houseName(nx.house)}への使者：気力の上限が${nx.prep}％増した`); });
  if (nx.kind === 'turn') rt.after(45, () => {
    if (rt.over) return;
    const g = foeGroup(rt);
    if (g) {
      const before = g.morale;
      g.morale = Math.min(before, Math.max(35, before - nx.amount));
      result.line += `。${nx.who}の返事で敵の一隊の士気が${Math.round(before - g.morale)}下がった`;
      rt.bark('内通の返事が届いた。敵の一隊が戦いをためらう');
    } else result.line += '。内通の返事は届いたが、動かせる敵隊は残っていなかった';
  });
  if (nx.kind === 'aid') rt.after(40, () => {
    if (rt.over) return;
    let alive = 0;
    for (const u of rt.army.units) if (u.alive) alive++;
    const n = Math.max(0, Math.min(nx.n, 235 - alive));
    if (n) {
      const P = rt.player.u;
      const g = allyGroup(rt, { name: '徳川の援兵', faction: 'tokugawa', order: 'move', fullStrength: true,
        dest: { x: P.pos.x, z: P.pos.z }, onArrive: (group) => { group.order = 'attack'; },
        anchor: { x: P.pos.x - Math.sin(P.heading || 0) * 15, z: P.pos.z - Math.cos(P.heading || 0) * 15 } }, [{ type: 'ashigaru', n }]);
      rt.realm.aidGroup = g;
    }
    result.line += `。徳川の援軍${n}人が加勢${n < nx.n ? `、${nx.n - n}人は後ろに控えた` : 'した'}`;
    rt.bark(n ? `徳川の援兵${n}人が加わった` : '徳川の援兵は後ろに控える');
  });
}
export function diploAfter(G, r, rt, i) {
  const nx = rt.realm?.dip;
  if (!nx?.gaiko) { OLD.diploAfter(G, r, rt, i); return; }
  const D = dipOf(G);
  if (D.gaikoAfter === i) return;
  D.gaikoAfter = i;
  r.realmLines ||= [];
  r.realmLines.push(`外交の控え：${D.lastMsg}`, rt.realm.gaikoResult?.line || '使者の知らせは、この戦には届かなかった');
  if (nx.kind === 'aid' && !rt.realm.aidGroup) r.realmLines.push('徳川の援兵は戦場に加わらなかった');
}
