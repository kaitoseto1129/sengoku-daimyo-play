// 段2・係C：外交。G.dip を持つ。詳しくは docs/phase2-design.md の 3-C。
// このファイルは係C だけが直す。
import { addKan, zeni, BATTLES, scenario } from './state.js';
import { keraiBest } from './retainers.js';
import { allyGroup, nm } from './bhelp.js';
import { flagMaterial } from './units_flags.js';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

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
  tonezaka: 'asakura', odani: 'azai', nagashima: 'honganji', shitaragahara: 'takeda', echizen: 'honganji', iwamura: 'takeda',
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
  return G.dip;
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
function relWord(v) { return v >= 70 ? '好い' : v >= 40 ? 'ふつう' : '冷たい'; }
function nextBattle(G) { return BATTLES[G.battle]; }

// ---------------- 外交の札 ----------------
export function diploCards(G) {
  const D = dipOf(G);
  const rank = G.rank || 0;
  const bi = nextBattle(G);
  const id = bi && bi.id;
  const foe = id ? FOE_OF[id] : undefined;
  const ally = id ? AID_OF[id] : undefined;
  const list = [];

  if (rank <= 1) {
    if (foe && G.battle % 2 === 0) {
      list.push({ id: 'tomo', name: '使者の供をする', cost: 0,
        eff: () => `${houseName(foe)}への使者の供に付く。その場で何をするか選ぶ`,
        apply: () => { D.next = { battle: G.battle, kind: 'tomo', house: foe }; } });
    }
  }
  if (rank >= 2 && foe && TURN_OF[id]) {
    const p = Math.min(0.85, 0.35 + relWith(G, foe) / 200 + keraiBest(G, 'shisha', 'int') / 400 + rank * 0.04);
    const word = p >= 0.75 ? '八割ほど' : p >= 0.6 ? '六割ほど' : p >= 0.45 ? '五分五分ほど' : '三割ほど';
    list.push({ id: 'shisha', name: `${TURN_OF[id]}へ使者を送る`, cost: 2,
      eff: () => `内通を誘う。見込みは${word}。通れば次の戦で${TURN_OF[id]}が退く`,
      apply: () => { D.next = { battle: G.battle, kind: 'turn', house: foe, p }; } });
  }
  if (rank >= 4 && ally) {
    list.push({ id: 'domei', name: `${houseName(ally)}と同盟の話を進める`, cost: 8,
      eff: () => `${houseName(ally)}との仲が深まる。仲が六割を越えれば次の戦に援軍が来る`,
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
  // 敵味方どちらの家も無い戦（本能寺・伊賀）や、まだ何も開けない時の当たり障りの無い一手
  if (!list.length && rank >= 2) {
    list.push({ id: 'fukin', name: '諸家へ付け届けをする', cost: 1,
      eff: () => '当たり障りのない付け届けをする（大きな効き目は無い）',
      apply: () => { G.superior = Math.min(100, (G.superior || 0) + 1); } });
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
  const relLines = [foe && `${houseName(foe)}との仲：${relWord(relWith(G, foe))}`, ally && `${houseName(ally)}との仲：${relWord(relWith(G, ally))}`]
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
      body = cards.map((c) => {
        const can = (G.kan || 0) >= c.cost;
        const btn = can
          ? `<button class="dp-btn" type="button" data-dp="${c.id}">${esc(c.name)}${c.cost ? `（${zeni(c.cost)}）` : ''}</button>`
          : `<button class="dp-btn" type="button" disabled aria-disabled="true">${esc(c.name)}<small>あと${zeni(c.cost - (G.kan || 0))}</small></button>`;
        return `<div class="dp-card"><b class="dp-t">${esc(c.name)}</b><p class="dp-x">次の戦で${esc(c.eff())}</p>${btn}</div>`;
      }).join('');
    }
  }
  return `<section class="dp" aria-label="外交">
<style>
.dp-rel{font-size:13px;color:var(--washi-dim);margin:0 0 6px}
.dp-card{background:rgba(236,228,210,.05);border:1px solid rgba(236,228,210,.15);border-radius:8px;padding:10px;margin-bottom:8px}
.dp-t{font-size:15px;color:var(--washi);display:block}
.dp-x{font-size:13px;color:var(--washi-dim);margin:4px 0 8px}
.dp-btn{min-height:44px;width:100%;border-radius:8px;border:1px solid var(--kin);background:rgba(194,162,90,.15);color:var(--washi);font-size:15px;padding:0 10px}
.dp-btn:disabled{opacity:.38;border-color:var(--washi-faint)}
.dp-btn small{display:block;font-size:12px;color:var(--washi-faint)}
.dp-note{font-size:13px;color:var(--washi-faint)}
.dp-done .dp-dot{color:var(--kin);margin-right:4px}
</style>
<h3 class="realm-h">外交</h3>${relLines}<div class="dp-list">${body}</div>
</section>`;
}

export function diploBind(G, done) {
  document.querySelectorAll('[data-dp]').forEach((btn) => {
    if (btn.disabled) return;
    btn.onclick = () => {
      const D = dipOf(G);
      if (D.at === G.battle) return;
      const id = btn.getAttribute('data-dp');
      const c = diploCards(G).find((x) => x.id === id);
      if (!c) return;
      if ((G.kan || 0) < c.cost) return;
      const msg = `${c.name}。次の戦で${c.eff()}`;
      if (c.cost) addKan(G, -c.cost);
      c.apply();
      D.at = G.battle;
      D.lastMsg = msg;
      done(msg);
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
  if (rt.def.noDiplo) return;
  const D = dipOf(G);
  const nx = D.next;
  if (!nx || nx.battle !== rt.index) return;
  D.next = null;
  if (nx.kind === 'tomo') {
    rt.after(3, () => {
      if (rt.over) return;
      rt.choose('使者の供として、何をする？', [
        { label: '敵の陣の様子を探る', note: '敵の一隊の弱い所が分かるかもしれない' },
        { label: '贈り物を丁寧に運ぶ', note: `${houseName(nx.house)}との仲が深まる` },
      ], (i) => {
        if (i === 0) {
          waverFoes(rt, 2, 10);
          rt.bark('使者の供で見た、敵の弱い所');
        } else {
          addRel(G, nx.house, 5);
          G.superior = Math.min(100, (G.superior || 0) + 2);
          rt.bark(`${houseName(nx.house)}への進物、上官も労うた`);
        }
      }, 20);
    });
  } else if (nx.kind === 'turn') {
    const ok = Math.random() < nx.p;
    const bi = BATTLES[rt.index];
    const who = (bi && TURN_OF[bi.id]) || '敵の国衆';
    if (ok) {
      // 実った内通は二通り：戦の中で旗を返す（寝返り）か、初めから陣を払って出て来ない（来ない）
      const noshow = Math.random() < 0.5;
      if (noshow) {
        rt.after(3 + Math.random() * 2, () => {
          if (rt.over) return;
          const list = eligibleFoeGroups(rt);
          if (!list.length) return;
          const g = list[Math.floor(Math.random() * list.length)];
          g.morale = 0;
          g.noRout = false;
          rt.banner(`${who}、動かず`, '内応が実り、陣を払うた');
          rt.bark(`${who}は、この戦に加わらぬ`);
          rt.award((t) => t.side.push('調略で敵を動かせなんだ'), '調略で敵を動かせなんだ');
        });
      } else {
        rt.after(35 + Math.random() * 35, () => {
          if (rt.over) return;
          const list = eligibleFoeGroups(rt);
          if (!list.length) return;
          const g = list[Math.floor(Math.random() * list.length)];
          // 旗を掲げ替え、その場に印を出してから兵を退かせる（見た目でも寝返りと分かるように）
          const mat = flagMaterial(rt.G.lordFaction || scenario().faction);
          for (const u of g.units) if (u.alive && u.flag) u.flag.material = mat;
          rt.marker('turn', () => (g.units.some((u) => u.alive) ? g.center() : null), `${who}、寝返り`, { h: 2.4 });
          rt.say(who, `${nm(rt)}殿、お味方いたす！`, 3);
          g.morale = 0;
          rt.banner(`${who}、寝返り`, '内通が実った');
          rt.award((t) => t.side.push('調略で敵を寝返らせた'), '調略で敵を寝返らせた');
          rt.after(8, () => rt.unmark('turn'));
        });
      }
    } else {
      addRel(G, nx.house, -5);
      rt.after(2, () => { rt.banner('使者、討たれる', `${who}への内通、使者が斬られた`); rt.bark('使者が斬られた', true); });
    }
  } else if (nx.kind === 'aid') {
    rt.after(40, () => {
      if (rt.over) return;
      const aliveNow = rt.army.units.filter((u) => u.alive).length;
      if (aliveNow >= 225) return;
      const P = rt.player.u;
      const g = allyGroup(rt, { name: `${houseName(nx.house)}の援兵`, faction: nx.house, order: 'follow',
        anchor: { x: P.pos.x - Math.sin(P.heading || 0) * 25, z: P.pos.z - Math.cos(P.heading || 0) * 25 } },
        [{ type: 'ashigaru', n: 8 }, { type: 'samurai', n: 2 }]);
      rt.realm.aidGroup = g;
      rt.banner(`${houseName(nx.house)}の援軍、参着`, '約定どおり手勢を添える');
      rt.say(`${houseName(nx.house)}の使番`, 'お約束どおり、手勢を添えまする', 3);
    });
  }
}

export function diploAfter(G, r, b, i) {
  const bi = BATTLES[i];
  const id = bi && bi.id;
  const foe = id ? FOE_OF[id] : undefined;
  const ally = id ? AID_OF[id] : undefined;
  if (ally) addRel(G, ally, 2);
  if (foe) addRel(G, foe, -2);
}
