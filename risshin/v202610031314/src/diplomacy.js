// 段2・係C：外交。G.dip を持つ。詳しくは docs/phase2-design.md の 3-C。
// このファイルは係C だけが直す。
import { addKan, zeni, BATTLES } from './state.js';
import { keraiBest } from './retainers.js';
import { allyGroup } from './bhelp.js';

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
  kanegasaki: 'asakura', anegawa: 'azai', nodafukushima: 'honganji', shiga: 'asakura', hieizan: 'asakura', mikatagahara: 'takeda',
  tonezaka: 'asakura', odani: 'azai', nagashima: 'honganji', shitaragahara: 'takeda', echizen: 'honganji', echizen_ikko: 'honganji', iwamura: 'takeda',
  tennoji: 'honganji', saika: 'honganji', tedorigawa: 'uesugi', shigisan: 'matsunaga', kizugawa: 'mori', miki: 'bessho',
  arioka: 'araki', iga: null, tottori: 'mori', takato: 'takeda', tano: 'takeda', honnoji: null,
};
// 味方が隣で戦う戦
export const AID_OF = { anegawa: 'tokugawa', mikatagahara: 'tokugawa', shitaragahara: 'tokugawa', takato: 'tokugawa', tano: 'tokugawa' };
// 調略できる国衆（史実で寝返った・退いた者）
export const TURN_OF = {
  inabayama: '美濃三人衆', mitsukuri: '六角の国衆', odani: '阿閉貞征', tonezaka: '朝倉景鏡の手勢', takato: '木曾義昌の手勢',
  tano: '小山田信茂の手勢', shigisan: '松永の与力', arioka: '中西新八郎の手勢', miki: '別所の支城の兵',
};

export function dipOf(G) {
  if (!G.dip) G.dip = { rel: {}, next: null, at: -1, wed: [] };
  const D = G.dip;
  if (!D.rel) D.rel = {};
  if (!Array.isArray(D.wed)) D.wed = [];
  return D;
}

export function relWith(G, house) {
  const D = dipOf(G);
  if (D.rel[house] != null) return D.rel[house];
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

// 年と月だけで決まる敵味方。仲を上げても、史実の戦は変えない。
const STANCES = {
  tokugawa: [[1562, Infinity, 1]], imagawa: [[0, 1561, -1]], saito: [[0, 1568, -1]],
  azai: [[1567, 1570 + 4 / 100, 1], [1570 + 4 / 100, 1574, -1]],
  asakura: [[1570, 1574, -1]],
  takeda: [[1565, 1572 + 10 / 100, 1], [1572 + 10 / 100, 1583, -1]],
  rokkaku: [[1568, Infinity, -1]], kitabatake: [[1569, 1570, -1], [1570, Infinity, 1]],
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

  if (rank <= 1) {
    if (foe && G.battle % 2 === 0) {
      list.push({ id: 'tomo', name: '使者の供をする', cost: 0,
        eff: () => `${houseName(foe)}への使者の供に付く。その場で何をするか選ぶ`,
        apply: () => { D.next = { battle: G.battle, kind: 'tomo', house: foe }; } });
    }
  }
  if (rank >= 2 && foe) {
    const p = Math.min(0.85, 0.35 + relWith(G, foe) / 200 + keraiBest(G, 'shisha', 'int') / 400 + rank * 0.04);
    const word = p >= 0.75 ? '八割ほど' : p >= 0.6 ? '六割ほど' : p >= 0.45 ? '五分五分ほど' : '三割ほど';
    list.push({ id: 'shisha', name: `${turnName(id, foe)}へ使者を送る`, cost: 2,
      eff: () => `内通を誘う。見込みは${word}。通れば次の戦で${turnName(id, foe)}が退く`,
      apply: () => { D.next = { battle: G.battle, kind: 'turn', house: foe, who: turnName(id, foe), p }; } });
  }
  if (rank >= 4 && ally) {
    list.push({ id: 'domei', name: `${houseName(ally)}と同盟の話を進める`, cost: 8,
      eff: () => `${houseName(ally)}との仲が深まる。仲が六割以上なら次の戦に援軍が来る`,
      apply: () => { addRel(G, ally, 10); if (relWith(G, ally) >= 60) D.next = { battle: G.battle, kind: 'aid', house: ally }; } });
  }
  if (rank >= 4 && ally && !D.wed.includes(ally)) {
    list.push({ id: 'konin', name: `${houseName(ally)}と婚姻を仲立ちする`, cost: 10,
      eff: () => `${houseName(ally)}との仲が大きく深まる（この家とは一度だけ）`,
      apply: () => { addRel(G, ally, 20); D.wed.push(ally); } });
  }
  if (rank >= 3 && foe) {
    list.push({ id: `okuri:${foe}`, name: `${houseName(foe)}へ贈り物を届ける`, cost: 6,
      eff: () => `${houseName(foe)}との仲が深まる`,
      apply: () => { addRel(G, foe, 12); } });
  }
  if (rank >= 3 && ally) {
    list.push({ id: `okuri:${ally}`, name: `${houseName(ally)}へ贈り物を届ける`, cost: 6,
      eff: () => `${houseName(ally)}との仲が深まる`,
      apply: () => { addRel(G, ally, 12); } });
  }
  // 本能寺・伊賀では、仲だけを深める。敵の家を作らない。
  if (!foe && !ally && rank >= 2) {
    list.push({ id: 'fukin', name: '徳川家との仲を深める', cost: 6,
      eff: () => '徳川家との仲が深まる。次の戦に効き目は出ない',
      apply: () => { addRel(G, 'tokugawa', 12); } });
  }
  return list.slice(0, 3);
}

export function diploHtml(G) {
  const D = dipOf(G);
  const rank = G.rank || 0;
  const bi = nextBattle(G);
  const id = bi && bi.id;
  const foe = id ? FOE_OF[id] : undefined;
  const ally = id ? AID_OF[id] : undefined;
  const done = D.at === G.battle;
  const relLines = [foe && `${houseName(foe)}との仲：${relWord(relWith(G, foe))}`, ally && `${houseName(ally)}との仲：${relWord(relWith(G, ally))}`,
    !foe && !ally && bi && rank >= 2 && `徳川家との仲：${relWord(relWith(G, 'tokugawa'))}`]
    .filter(Boolean).map((l) => `<p class="dp-rel">${esc(l)}</p>`).join('');
  let body;
  if (done) {
    body = `<div class="dp-card dp-done" role="group" aria-label="外交は済んだ"><b class="dp-t"><span class="dp-dot" aria-hidden="true">●</span>済</b><p class="dp-x">${esc(D.lastMsg || '')}</p></div>`;
  } else {
    const cards = diploCards(G);
    if (!cards.length && rank <= 1) {
      body = '<p class="dp-note">今は使者の用は無い</p>';
    } else if (!cards.length) {
      body = '<p class="dp-note">今できる外交は無い</p>';
    } else {
      body = cards.map((c, i) => {
        const can = (G.kan || 0) >= c.cost;
        const rec = i === 0 && cards.length > 1 && can;
        const btn = can
          ? `<button class="dp-btn" type="button" data-dp="${c.id}">${esc(c.name)}${c.cost ? `（${zeni(c.cost)}）` : ''}</button>`
          : `<button class="dp-btn" type="button" disabled aria-disabled="true">${esc(c.name)}<small>あと${zeni(c.cost - (G.kan || 0))}</small></button>`;
        return `<div class="dp-card${rec ? ' dp-rec' : ''}">${rec ? '<span class="dp-badge">おすすめ</span>' : ''}<b class="dp-t">${esc(c.name)}</b><p class="dp-x">${esc(c.eff())}</p>${btn}</div>`;
      }).join('');
    }
  }
  return `<section class="dp" aria-label="外交">
${styleOnce('dp', `<style>
.dp-rel{font-size:13px;color:var(--washi-dim);margin:0 0 6px}
.dp-card{position:relative;background:rgba(236,228,210,.05);border:1px solid rgba(236,228,210,.15);border-radius:8px;padding:10px;margin-bottom:8px}
.dp-rec{border-color:var(--kin);background:rgba(194,162,90,.1)}
.dp-badge{position:absolute;top:-9px;right:8px;font-size:12px;color:#14110d;background:var(--kin);border-radius:4px;padding:2px 7px}
.dp-t{font-size:15px;color:var(--washi);display:block}
.dp-x{font-size:13px;color:var(--washi-dim);margin:4px 0 8px}
.dp-btn{min-height:44px;width:100%;border-radius:8px;border:1px solid var(--kin);background:rgba(194,162,90,.15);color:var(--washi);font-size:15px;padding:0 10px}
.dp-btn:disabled{opacity:.38;border-color:var(--washi-faint)}
.dp-choice{display:grid;gap:8px}.dp-confirm{margin-top:8px}
.dp-btn small{display:block;font-size:12px;color:var(--washi-faint)}
.dp-note{font-size:13px;color:var(--washi-faint)}
.dp-done .dp-dot{color:var(--kin);margin-right:4px}
</style>`)}
<h3 class="realm-h">外交</h3>${relLines}<div class="dp-list">${body}</div><div class="dp-confirm" id="dp-cf"></div>
</section>`;
}

export function diploBind(G, done, confirm) {
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
        if (c.cost) addKan(G, -c.cost);
        let msg;
        D.next = null;
        if (id === 'tomo') {
          const house = FOE_OF[nextBattle(G).id];
          if (choice === 'scout') {
            D.next = { battle: at, kind: 'waver', house };
            msg = '使者の供で敵の陣を探った。次の戦で敵の一隊の士気が下がる';
          } else {
            addRel(G, house, 5);
            G.superior = Math.min(100, (G.superior || 0) + 2);
            msg = `${houseName(house)}へ贈り物を運んだ。仲が深まり、上官の評価も上がった`;
          }
        } else {
          c.apply();
          msg = id === 'domei'
            ? `${houseName(AID_OF[nextBattle(G).id])}との仲が深まった。${D.next ? '次の戦に援軍が来る' : 'まだ援軍の約束には届かない'}`
            : `${c.name}。${c.eff()}`;
        }
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
      } else if (id === 'konin' && confirm) {
        confirm(document.getElementById('dp-cf'), `${c.eff()}。${zeni(c.cost)}を使う。`, '婚姻を仲立ちする', () => finish());
      } else finish();
    };
  });
}

// ---------------- 戦の中 ----------------
function eligibleFoeGroups(rt) {
  return rt.army.groups.filter((g) => g.team === 1 && !g.routed
    && g.units.filter((u) => u.alive).length >= 6
    && !g.units.some((u) => u.invuln || u.name));
}
function waverFoes(rt, n, amount) {
  const list = eligibleFoeGroups(rt);
  for (let k = 0; k < n && k < list.length; k++) list[k].morale = Math.max(0, list[k].morale - amount);
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
    waverFoes(rt, n, 10);
    rt.bark('使者の供で見た敵の弱い所');
    rt.realm.dipResult = { kind: 'tomo', scout: true, house: nx.house };
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
          G.superior = Math.min(100, (G.superior || 0) + 2);
          rt.bark(`${houseName(nx.house)}との仲が深まり、上官の評価も上がった`);
          rt.realm.dipResult = { kind: 'tomo', scout: false, house: nx.house };
        }
      }, 20);
    });
  } else if (nx.kind === 'turn') {
    const ok = Math.random() < nx.p;
    const bi = BATTLES[rt.index];
    const who = nx.who || turnName(bi && bi.id, nx.house);
    rt.after(60 + Math.random() * 60, () => {
      if (rt.over) return;
      if (!ok) {
        addRel(G, nx.house, -5);
        rt.banner('使者は追い返された', `${who}への内通は実らなかった`);
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
      g.noRout = false;
      rt.banner(`${who}、兵を退く`, '内通が実った');
      rt.award((t) => t.side.push('調略で敵を退かせた'), '調略で敵を退かせた');
      rt.realm.dipResult = { kind: 'turn', ok: true, moved: true, who };
    });
  } else if (nx.kind === 'aid') {
    rt.after(40, () => {
      if (rt.over) return;
      let aliveNow = 0;
      for (const u of rt.army.units) if (u.alive) aliveNow++;
      if (aliveNow + 10 > 235) {
        rt.bark('援軍は後ろに控える。今は前に出られない');
        rt.realm.dipResult = { kind: 'aid', house: nx.house, joined: false };
        return;
      }
      const P = rt.player.u;
      const g = allyGroup(rt, { name: '徳川の援兵', faction: nx.house, order: 'follow', fixed: true, fullStrength: true,
        anchor: { x: P.pos.x - Math.sin(P.heading || 0) * 25, z: P.pos.z - Math.cos(P.heading || 0) * 25 } },
        [{ type: 'ashigaru', n: 8 }, { type: 'samurai', n: 2 }]);
      rt.realm.aidGroup = g;
      rt.banner(`${houseName(nx.house)}の援軍が来た`, '約束どおり手勢を添える');
      rt.say('徳川の使番', 'お約束どおり、手勢を添えまする', 3);
      rt.realm.dipResult = { kind: 'aid', house: nx.house, joined: true };
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
  const dr = b.realm && b.realm.dipResult;
  if (dr) {
    if (dr.kind === 'turn') r.realmLines.push(dr.ok
      ? dr.moved === false ? `内通の返事は届いたが、退かせる隊は残っていなかった` : `調略が実り、${dr.who}が兵を退いた`
      : `使者は追い返され、${dr.who}への内通は実らなかった`);
    else if (dr.kind === 'aid') r.realmLines.push(dr.joined === false ? `${houseName(dr.house)}の援軍は後ろに控えた` : `${houseName(dr.house)}の援軍が加勢した`);
    else if (dr.kind === 'tomo') r.realmLines.push(dr.scout ? '使者の供で見た敵の弱みが役に立った' : `${houseName(dr.house)}との仲が深まった`);
  }
}
