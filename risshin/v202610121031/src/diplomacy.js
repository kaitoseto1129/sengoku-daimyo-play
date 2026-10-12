// 段2・係C：外交。G.dip を持つ。詳しくは docs/phase2-design.md の 3-C。
// このファイルは係C だけが直す。
import { addKan, zeni, BATTLES } from './state.js';
import { keraiBest } from './retainers.js';
import { allyGroup } from './bhelp.js';
import { spendLog } from './toiya.js';

import { styleOnce } from './style_once.js';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 家の表（史実の敵味方は年で決まっていて遊び手は変えられない。動かせるのは仲だけ）
// mon：textures.js の家紋の鍵（無い家は札に紋を出さず名だけ）
export const HOUSES = {
  tokugawa: { name: '徳川家', mon: 'tokugawa', rel0: 50 },
  imagawa: { name: '今川家', mon: 'imagawa', rel0: 20 },
  saito: { name: '斎藤家', mon: 'saito', rel0: 20 },
  azai: { name: '浅井家', mon: 'azai', rel0: 50 },
  asakura: { name: '朝倉家', mon: 'asakura', rel0: 25 },
  takeda: { name: '武田家', mon: 'takeda', rel0: 40 },
  rokkaku: { name: '六角家', mon: null, rel0: 25 },
  kitabatake: { name: '北畠家', mon: null, rel0: 25 },
  enryakuji: { name: '延暦寺（朝倉家が支援）', mon: null, rel0: 20 },
  saika: { name: '雑賀衆（本願寺と協力）', mon: null, rel0: 20 },
  honganji: { name: '本願寺', mon: null, rel0: 20 },
  uesugi: { name: '上杉家', mon: 'uesugi', rel0: 45 },
  matsunaga: { name: '松永家', mon: null, rel0: 40 },
  mori: { name: '毛利家', mon: 'mori', rel0: 35 },
  araki: { name: '荒木家', mon: null, rel0: 50 },
  bessho: { name: '別所家', mon: null, rel0: 30 },
};

// 戦と相手の家（null は敵の家が無い戦＝本能寺・伊賀）
export const FOE_OF = {
  okehazama: 'imagawa', moribe: 'saito', sunomata: 'saito', inabayama: 'saito', mitsukuri: 'rokkaku', okawachi: 'kitabatake',
  kanegasaki: 'asakura', anegawa: 'azai', nodafukushima: 'honganji', shiga: 'asakura', hieizan: 'enryakuji', mikatagahara: 'takeda',
  tonezaka: 'asakura', odani: 'azai', nagashima: 'honganji', shitaragahara: 'takeda', echizen: 'honganji', echizen_ikko: 'honganji', iwamura: 'takeda',
  tennoji: 'honganji', saika: 'saika', tedorigawa: 'uesugi', shigisan: 'matsunaga', kizugawa: 'mori', miki: 'bessho',
  arioka: 'araki', iga: null, tottori: 'mori', takato: 'takeda', tano: 'takeda', honnoji: null,
};
// 味方が隣で戦う戦
export const AID_OF = { anegawa: 'tokugawa', mikatagahara: 'tokugawa', shitaragahara: 'tokugawa', takato: 'tokugawa', tano: 'tokugawa' };
// 内通で兵を退かせる相手。名のある武将本人や戦の筋は変えない。
export const TURN_OF = {
  inabayama: '美濃三人衆', mitsukuri: '六角の国衆', odani: '阿閉貞征',
  tonezaka: '朝倉景鏡の手勢', takato: '木曾義昌の手勢', tano: '小山田信茂の手勢',
  shigisan: '松永の与力', arioka: '中西新八郎の手勢', miki: '別所の支城の兵',
};

export function dipOf(G) {
  if (!G.dip) G.dip = { rel: {}, next: null, at: -1, wed: [] };
  const D = G.dip;
  if (!D.rel) D.rel = {};
  if (!Number.isInteger(D.at)) D.at = -1;
  if (!Array.isArray(D.wed)) D.wed = [];
  return D;
}

export function relWith(G, house) {
  const D = dipOf(G);
  if (Number.isFinite(D.rel[house])) return Math.max(0, Math.min(100, D.rel[house]));
  return (HOUSES[house] && HOUSES[house].rel0) ?? 20;
}
function addRel(G, house, delta) {
  const D = dipOf(G);
  D.rel[house] = Math.max(0, Math.min(100, relWith(G, house) + delta));
}
export function houseName(house) { return (HOUSES[house] && HOUSES[house].name) || '隣国'; }
// 仲の良さは数字でなく言葉で見せる（やさしい日本語の決まり）
function relWord(v) { return v >= 70 ? '良い' : v >= 40 ? 'ふつう' : '冷たい'; }
function nextBattle(G) { return BATTLES[G.battle]; }
function turnName(id, house) { return TURN_OF[id] || `${houseName(house)}の国衆`; }
export function turnOdds(G, house, skill = keraiBest(G, 'shisha', 'int')) {
  return Math.min(0.85, 0.35 + relWith(G, house) / 200 + skill / 400 + (G.rank || 0) * 0.04);
}
function aidNote(G, house, gain) {
  const after = Math.min(100, relWith(G, house) + gain);
  return after >= 60 ? '次の戦で援軍10人を約束する。戦場が混む時は入れる人数だけ' : `次の戦の援軍には仲があと${60 - after}足りない`;
}

// 年と月だけで決まる敵味方。仲を上げても、史実の戦は変えない。
const STANCES = {
  tokugawa: [[1562, Infinity, 1]], imagawa: [[0, 1561, -1]], saito: [[0, 1568, -1]],
  azai: [[1567, 1570 + 4 / 100, 1], [1570 + 4 / 100, 1574, -1]],
  asakura: [[1570, 1574, -1]],
  takeda: [[1565, 1572 + 10 / 100, 1], [1572 + 10 / 100, 1583, -1]],
  rokkaku: [[1568, Infinity, -1]], kitabatake: [[1569, 1570, -1], [1570, Infinity, 1]],
  enryakuji: [[1571, 1572, -1]], saika: [[1576, 1581, -1]],
  honganji: [[1570, 1581, -1]], uesugi: [[0, 1577, 1], [1577, Infinity, -1]],
  matsunaga: [[1568, 1577 + 8 / 100, 1], [1577 + 8 / 100, Infinity, -1]],
  mori: [[1576, Infinity, -1]], araki: [[0, 1578 + 10 / 100, 1], [1578 + 10 / 100, Infinity, -1]],
  bessho: [[1578, 1581, -1]],
};
function stanceAt(bi, house) {
  if (!bi) return 0;
  if (FOE_OF[bi.id] === house) return -1;
  if (AID_OF[bi.id] === house) return 1;
  const year = String(bi.year || '').match(/[（(](\d{4})[）)]/);
  if (!year) return 0;
  const month = String(bi.year).match(/([一二三四五六七八九十]+)月/);
  const months = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  const date = Number(year[1]) + (month ? months.indexOf(month[1]) + 1 : 0) / 100;
  const span = (STANCES[house] || []).find(([start, end]) => date >= start && date < end);
  return span ? span[2] : 0;
}

// ---------------- 外交の札 ----------------
export function diploCards(G) {
  const D = dipOf(G);
  const rank = G.rank || 0;
  const bi = nextBattle(G);
  const id = bi && bi.id;
  const foe = id ? FOE_OF[id] : undefined;
  const ally = id ? AID_OF[id] : undefined;
  const list = [];
  if (!bi || G.lord || G.practice) return list;

  if (rank <= 1 && foe && G.battle % 2 === 0) {
    list.push({ id: 'tomo', name: '使者の供をする', cost: 0,
      eff: () => '次の戦で敵の一隊の士気を下げるか、贈り物で仲と上官の評価を上げるかを選ぶ',
      apply: () => { D.next = { battle: G.battle, kind: 'tomo', house: foe }; } });
  }
  if (rank >= 2 && foe) {
    const p = turnOdds(G, foe);
    const word = p >= 0.75 ? '八割ほど' : p >= 0.6 ? '六割ほど' : p >= 0.45 ? '五分五分ほど' : '三割ほど';
    list.push({ id: 'shisha', name: `${turnName(id, foe)}へ使者に立つ`, cost: 2,
      eff: () => `次の戦の途中で敵の一隊を退かせる。見込みは${word}。${keraiBest(G, 'shisha', 'int') ? '家臣の使者が見込みを高めている。' : '家臣を使者にすると見込みが上がる。'}失敗すると仲が5下がる`,
      apply: () => { D.next = { battle: G.battle, kind: 'turn', house: foe, who: turnName(id, foe), p }; } });
  }
  if (rank >= 3) {
    for (const house of [foe, ally].filter(Boolean)) {
      list.push({ id: `okuri:${house}`, name: `${houseName(house)}へ贈り物を届ける`, cost: 6,
        eff: () => house === foe
          ? '次の戦の兵は変わらない。仲が12上がり、次に送る内通の使者が通りやすくなる'
          : '次の戦の援軍は約束しない。仲が12上がり、次に同盟の話を進める時の支えになる',
        apply: () => { addRel(G, house, 12); } });
    }
  }
  if (rank >= 4 && ally) {
    list.push({ id: 'domei', name: `${houseName(ally)}と同盟の話を進める`, cost: 8,
      eff: () => `仲が10上がる。${aidNote(G, ally, 10)}`,
      apply: () => { addRel(G, ally, 10); if (relWith(G, ally) >= 60) D.next = { battle: G.battle, kind: 'aid', house: ally }; } });
    if (!D.wed.includes(ally)) {
      list.push({ id: 'konin', name: `${houseName(ally)}との婚姻の縁を取り次ぐ`, cost: 10,
        eff: () => '次の戦の援軍は約束しない。主君の縁組の使者を務め、仲が20上がる。この家に一度だけ。新たな縁組は作らない',
        apply: () => { addRel(G, ally, 20); D.wed.push(ally); } });
    }
  }
  // 本能寺・伊賀では、仲だけを深める。敵の家を作らない。
  if (!foe && !ally && rank >= 2) {
    list.push({ id: 'fukin', name: '徳川家との仲を深める', cost: 6,
      eff: () => '次の戦には効き目は出ない。徳川家との仲が12上がる',
      apply: () => { addRel(G, 'tokugawa', 12); } });
  }
  return list;
}

function cardBody(G, c) {
  const can = (G.kan || 0) >= c.cost;
  return `<b class="dp-t">${esc(c.name)}</b><p class="dp-x">${esc(c.eff())}</p><button class="dp-btn" type="button" data-dp="${esc(c.id)}" ${can ? '' : 'disabled aria-disabled="true"'}>${esc(c.name)}${c.cost ? `（${zeni(c.cost)}）` : ''}</button>${can ? '' : `<p class="dp-note">銭があと${zeni(c.cost - (G.kan || 0))}足りない</p>`}`;
}
// 同じ種類の用は一枚にまとめる。三枚の中で贈り先や味方への用を選べる。
function cardGroups(cards) {
  const groups = [];
  for (const c of cards) {
    const key = c.id.startsWith('okuri:') ? 'gift' : ['domei', 'konin'].includes(c.id) ? 'ally' : c.id;
    let group = groups.find((g) => g.key === key);
    if (!group) { group = { key, cards: [] }; groups.push(group); }
    group.cards.push(c);
  }
  return groups;
}

export function diploHtml(G) {
  const D = dipOf(G);
  const rank = G.rank || 0;
  const bi = nextBattle(G);
  const id = bi && bi.id;
  const foe = id ? FOE_OF[id] : undefined;
  const ally = id ? AID_OF[id] : undefined;
  const done = D.at === G.battle;
  const relLines = [foe && `${houseName(foe)}との仲：${relWord(relWith(G, foe))}（${relWith(G, foe)}／100）`, ally && `${houseName(ally)}との仲：${relWord(relWith(G, ally))}（${relWith(G, ally)}／100）`,
    !foe && !ally && bi && rank >= 2 && `徳川家との仲：${relWord(relWith(G, 'tokugawa'))}`]
    .filter(Boolean).map((l) => `<p class="dp-rel">${esc(l)}</p>`).join('');
  let body;
  if (done) {
    body = `<div class="dp-card dp-done" role="group" aria-label="外交は済んだ"><b class="dp-t"><span class="dp-dot" aria-hidden="true">●</span>済</b><p class="dp-x">${esc(D.lastMsg || '')}</p></div>`;
  } else {
    const cards = diploCards(G);
    if (!cards.length && rank <= 1) {
      body = '<p class="dp-note">今は使者の用は無い。出陣の支度を進められる。</p>';
    } else if (!cards.length) {
      body = '<p class="dp-note">今できる外交は無い</p>';
    } else {
      body = cardGroups(cards).map((group) => {
        // 携帯の選択欄は長い文を折り返せない。用の全文と銭は下の札で読む。
        const choice = group.cards.length > 1 ? `<label class="dp-pick">${group.key === 'gift' ? '贈り先を選ぶ' : '味方への用を選ぶ'}<select class="dp-btn" data-dp-pick>${group.cards.map((c) => {
          const label = group.key === 'gift' ? houseName(c.id.slice(6)).replace(/（.*）/, '') : c.id === 'domei' ? '同盟の話を進める' : '婚姻の縁を取り次ぐ';
          return `<option value="${esc(c.id)}">${esc(label)}</option>`;
        }).join('')}</select></label>` : '';
        return `<div class="dp-card">${choice}<div class="dp-action">${cardBody(G, group.cards[0])}</div></div>`;
      }).join('');
    }
  }
  return `<section class="dp" aria-label="外交">
${styleOnce('dp', `<style>
.realm .dp,.realm .dp :is(.dp-card,.dp-action,.dp-pick,.dp-confirm){min-width:0;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere}
.realm .dp-rel{font-size:max(12px,calc(13px * var(--text-scale,1)));line-height:1.6;color:var(--washi-dim);margin:0 0 8px}
.realm .dp-list{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
.realm .dp-card{position:relative;background:#2c2821;border:1px solid var(--washi-faint);border-radius:8px;padding:16px}
.realm .dp-t{font-size:max(12px,calc(15px * var(--text-scale,1)));line-height:1.5;color:var(--washi);display:block}
.realm .dp-x{font-size:max(12px,calc(16px * var(--text-scale,1)));line-height:1.6;color:var(--washi-dim);margin:8px 0}
.realm .dp-btn{box-sizing:border-box;min-height:48px;max-width:100%;width:100%;border-radius:8px;border:1px solid var(--kin);background:rgba(194,162,90,.15);color:var(--washi);font-size:max(12px,calc(15px * var(--text-scale,1)));line-height:1.3;padding:8px;white-space:normal;overflow-wrap:anywhere;cursor:pointer}
.realm .dp-btn:disabled{opacity:1;background:var(--sumi,#14120f);color:var(--washi-dim);border-color:var(--washi-faint);border-style:dashed;cursor:default}
.realm .dp-btn:hover:not(:disabled){background:rgba(194,162,90,.23)}
.realm .dp-btn:active:not(:disabled){background:rgba(194,162,90,.27)}
.realm .dp-pick{display:block;font-size:max(12px,calc(13px * var(--text-scale,1)));line-height:1.6;color:var(--washi-dim);margin-bottom:16px}.realm .dp-pick select{display:block;margin-top:8px;background:var(--sumi,#14120f);padding-right:32px}
#screen .realm .dp-pick select{font-size:max(16px,calc(16px * var(--text-scale,1)))!important}
.realm .dp-choice{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-top:8px}.realm .dp-choice .dp-x{margin:0 0 8px}.realm .dp-confirm:not(:empty){margin-top:24px}
.realm .dp-confirm .row{gap:8px;flex-wrap:wrap}.realm .dp-confirm .btn{min-height:48px}
.realm .dp-note{font-size:max(12px,calc(13px * var(--text-scale,1)));line-height:1.6;color:var(--washi-dim);margin:8px 0 16px}
.realm .dp-done .dp-dot{color:var(--kin);margin-right:4px}
.realm .dp .dp-btn:focus-visible{outline:3px solid var(--kin);outline-offset:2px;box-shadow:0 0 0 5px var(--sumi,#14120f)}
</style>`)}
<h3 class="realm-h">外交</h3><p class="dp-note">次の戦までに一つ選べる。家の敵味方は史実の筋に沿う。仲を上げても戦は無くならない。</p>${relLines}${!done ? `<p class="dp-note">${rank < 2 ? '足軽組頭から、国衆へ使者に立てる' : rank < 3 ? '足軽大将候補から、贈り物を届けられる' : rank < 4 ? '足軽大将から、同盟の話と婚姻の仲立ちができる' : '援軍は同盟の話で約束する。仲が60以上になると来る'}</p>` : ''}<div class="dp-list">${body}</div><div class="dp-confirm" id="dp-cf"></div>
</section>`;
}

export function diploBind(G, done, confirm) {
  document.querySelectorAll('[data-dp-pick]').forEach((select) => {
    select.onchange = () => {
      if (dipOf(G).at === G.battle) return;
      const c = diploCards(G).find((x) => x.id === select.value);
      if (!c) return;
      select.closest('.dp-card').querySelector('.dp-action').innerHTML = cardBody(G, c);
      diploBind(G, done, confirm);
    };
  });
  document.querySelectorAll('[data-dp]').forEach((btn) => {
    if (btn.disabled) return;
    btn.onclick = () => {
      const D = dipOf(G), at = G.battle;
      if (D.at === at) return;
      const id = btn.getAttribute('data-dp');
      const c = diploCards(G).find((x) => x.id === id);
      if (!c || (G.kan || 0) < c.cost) return;
      const finish = (choice) => {
        // 確認札を開いている間に、別の札や出陣を選んでも二度行わない。
        if (G.battle !== at || D.at === at || !diploCards(G).some((x) => x.id === id) || (G.kan || 0) < c.cost) return;
        if (c.cost) { addKan(G, -c.cost); spendLog(G, c.name, c.cost); }
        let msg;
        D.next = null;
        if (id === 'tomo') {
          const house = FOE_OF[nextBattle(G).id];
          if (choice === 'scout') {
            D.next = { battle: at, kind: 'waver', house };
            msg = '使者の供で敵の陣を探った。次の戦で敵の一隊の士気が下がる';
          } else {
            addRel(G, house, 5);
            G.superior = Math.min(100, (G.superior ?? 50) + 2);
            msg = `${houseName(house)}へ贈り物を運んだ。仲が深まり、上官の評価も上がった`;
          }
        } else {
          c.apply();
          msg = id === 'shisha' ? '使者を送った。内通の返事は次の戦で分かる' : id === 'domei'
            ? `${houseName(AID_OF[nextBattle(G).id])}との仲が深まった。${D.next ? '次の戦に援軍が来る' : 'まだ援軍の約束には届かない'}`
            : `${c.name}。${c.eff()}`;
        }
        if (D.next) D.next.cost = c.cost;
        D.at = at;
        D.lastMsg = msg;
        done(msg);
      };
      if (id === 'tomo') {
        const box = btn.closest('.dp-card');
        box.innerHTML = '<b class="dp-t">使者の供として、何をする？</b><div class="dp-choice"><button class="dp-btn" type="button" data-dp-choice="scout">敵の陣の様子を探る</button><p class="dp-x">次の戦で敵の一隊の士気を下げる</p><button class="dp-btn" type="button" data-dp-choice="gift">贈り物を丁寧に運ぶ</button><p class="dp-x">その家との仲と、上官の評価が上がる</p></div>';
        box.querySelectorAll('[data-dp-choice]').forEach((choice) => {
          choice.onclick = () => finish(choice.getAttribute('data-dp-choice'));
        });
        box.querySelector('[data-dp-choice]').focus();
      } else if (id === 'konin' && confirm) {
        confirm(document.getElementById('dp-cf'), `${c.eff()}。${zeni(c.cost)}を使う。`, '婚姻を仲立ちする', () => finish());
      } else finish();
    };
  });
}

// ---------------- 戦の中 ----------------
function eligibleFoeGroups(rt) {
  return rt.army.groups.filter((g) => g.team === 1 && !g.routed
    && !g.civ && !g.ambush && !g.noRout && !g.onRout && !g.onArrive
    && g.units.filter((u) => u.alive).length >= 6
    && !g.units.some((u) => u.invuln || u.name || u.type === 'busho'));
}
function waverFoes(rt, n, amount) {
  const list = eligibleFoeGroups(rt);
  const changed = Math.min(n, list.length);
  for (let k = 0; k < changed; k++) list[k].morale = Math.max(0, list[k].morale - amount);
  return changed;
}

export function diploBattle(rt) {
  const G = rt.G;
  if (G.lord || G.practice || rt.def.dojo || rt.def.mapCastle || rt.def.noDiplo) return;
  const D = dipOf(G);
  const nx = D.next;
  if (!nx || nx.battle !== rt.index) return;
  D.next = null;
  if (!rt.realm) rt.realm = {};
  const scout = (n) => {
    const changed = waverFoes(rt, n, 10);
    rt.bark(changed ? nx.gift ? `贈り物で敵${changed}隊が戦いをためらっている` : `使者の供で見た弱みで敵${changed}隊の士気が下がった` : '使者は用を果たしたが、士気を変えられる敵隊はいない');
    rt.realm.dipResult = { kind: 'tomo', scout: true, gift: !!nx.gift, house: nx.house, changed };
  };
  if (nx.kind === 'waver') {
    scout(1);
  } else if (nx.kind === 'tomo') {
    // 前の保存に残っている使者の供も、その戦で一度だけ使う。
    rt.after(3, () => {
      if (rt.over) return;
      rt.choose('使者の供として、何をする？', [
        { label: '敵の陣の様子を探る', note: '敵の一隊の士気を下げる' },
        { label: '贈り物を丁寧に運ぶ', note: `${houseName(nx.house)}との仲が深まる` },
      ], (i) => {
        if (rt.over) return;
        if (i === 0) scout(1);
        else {
          addRel(G, nx.house, 5);
          G.superior = Math.min(100, (G.superior ?? 50) + 2);
          rt.bark(`${houseName(nx.house)}との仲が深まり、上官の評価も上がった`);
          rt.realm.dipResult = { kind: 'tomo', scout: false, house: nx.house };
        }
      }, 20);
    });
  } else if (nx.kind === 'turn') {
    const ok = Math.random() < (Number.isFinite(nx.p) ? nx.p : turnOdds(G, nx.house));
    const bi = BATTLES[rt.index];
    const who = nx.who || turnName(bi && bi.id, nx.house);
    rt.after(60 + Math.random() * 60, () => {
      if (rt.over) return;
      if (!ok) {
        addRel(G, nx.house, -5);
        rt.bark('使者は追い返された。相手の家との仲が下がった');
        rt.realm.dipResult = { kind: 'turn', ok: false, who };
        return;
      }
      const list = eligibleFoeGroups(rt);
      if (!list.length) {
        rt.bark('内通の返事は届いたが、退かせる敵の隊は残っていない');
        rt.realm.dipResult = { kind: 'turn', ok: true, moved: false, who };
        return;
      }
      const g = list[Math.floor(Math.random() * list.length)];
      g.morale = 0;
      rt.banner(`${who}、兵を退く`, '内通が実った');
      rt.award((t) => t.side.push('調略で敵を退かせた'), '調略で敵を退かせた');
      rt.realm.dipResult = { kind: 'turn', ok: true, moved: true, withdrew: true, who };
    });
  } else if (nx.kind === 'aid') {
    rt.after(40, () => {
      if (rt.over) return;
      let aliveNow = 0;
      for (const u of rt.army.units) if (u.alive) aliveNow++;
      const n = Math.max(0, Math.min(10, 235 - aliveNow));
      if (n < 1) {
        rt.bark('援軍は後ろに控える。今は前に出られない');
        rt.realm.dipResult = { kind: 'aid', house: nx.house, joined: false };
        return;
      }
      const P = rt.player.u;
      const g = allyGroup(rt, { name: `${houseName(nx.house)}の援兵`, faction: nx.house, order: 'move', fullStrength: true,
        dest: { x: P.pos.x, z: P.pos.z }, onArrive: (group) => { group.order = 'attack'; },
        anchor: { x: P.pos.x - Math.sin(P.heading || 0) * 25, z: P.pos.z - Math.cos(P.heading || 0) * 25 } },
        [{ type: 'ashigaru', n: n - Math.floor(n / 5) }, { type: 'samurai', n: Math.floor(n / 5) }]);
      rt.realm.aidGroup = g;
      rt.say(`${houseName(nx.house)}の使番`, 'お約束どおり、手勢を添えまする', 3);
      rt.realm.dipResult = { kind: 'aid', house: nx.house, joined: true, n };
    });
  }
}

export function diploAfter(G, r, b, i) {
  const def = b.def || {};
  if (G.lord || G.practice || def.dojo || def.mapCastle || def.noDiplo) return;
  const bi = BATTLES[i];
  for (const house of Object.keys(HOUSES)) {
    const stance = stanceAt(bi, house);
    if (stance) addRel(G, house, stance * 2);
  }
  if (!r.realmLines) r.realmLines = [];
  if (dipOf(G).at === i && dipOf(G).lastMsg) r.realmLines.push(`外交の控え：${dipOf(G).lastMsg}`);
  const dr = b.realm && b.realm.dipResult;
  if (!dr && b.realm?.dip?.kind === 'turn') r.realmLines.push(`${b.realm.dip.who || turnName(bi?.id, b.realm.dip.house)}への内通の返事が届く前に戦が終わった。敵は退いていない。使者の費用${zeni(b.realm.dip.cost ?? 2)}は支払済みで戻らない`);
  if (!dr && b.realm?.dip?.kind === 'aid') r.realmLines.push(`${houseName(b.realm.dip.house)}の援軍が着く前に戦が終わった。仲は深まった。使者の費用${zeni(b.realm.dip.cost ?? 0)}は支払済みで戻らない`);
  if (!dr && ['tomo', 'waver'].includes(b.realm?.dip?.kind)) r.realmLines.push('使者の働きが戦に届く前に戦が終わった。使者の費用は支払済みで戻らない');
  if (dr) {
    if (dr.kind === 'turn') r.realmLines.push(dr.ok
      ? dr.moved === false ? '内通の返事は届いたが、退かせる隊は残っていなかった' : `調略が実り、${dr.who}への使者の働きで敵の一隊が退いた`
      : '使者は追い返された。相手の家との仲が5下がった');
    else if (dr.kind === 'aid') r.realmLines.push(dr.joined === false ? `${houseName(dr.house)}の援軍は後ろに控えた` : `${houseName(dr.house)}の援軍${dr.n || 10}人が加勢した`);
    else if (dr.kind === 'tomo') r.realmLines.push(dr.changed === 0 ? '使者の用は果たしたが、士気を変えられる敵隊がなかった' : dr.gift ? '贈り物で敵の一隊が戦いをためらった' : dr.scout ? '使者の供で見た敵の弱みが役に立った' : `${houseName(dr.house)}との仲が深まった`);
  }
}
