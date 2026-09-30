// 天下の地図の「時の流れ」：年と季節が進むと、史実の出来事が起こる（条件しだいで起こらない・形が変わる）
// japan.js の advance（季節を送る）が tenkaEvents を呼ぶ。一つの出来事は一度だけ（J.ev に覚える）
// 始まりの年より前の出来事は起こさない（その年・その季節に着いた時だけ）

// 家の名から家の番号（無ければ null）
function clanOf(D, name) { for (const [id, c] of Object.entries(D.clans)) if (c.name === name) return +id; return null; }
const castles = (J, cid) => Object.keys(J.own).filter((k) => J.own[k] === cid);
const alive = (J, cid) => cid != null && castles(J, cid).length > 0;
// その家の城の兵を k 倍にする
function troops(J, cid, k) { for (const id of castles(J, cid)) { const d = J.dom[id]; if (d) d.h = Math.max(0, Math.round((d.h * k) / 10) * 10); } }
// 二つの家を敵どうしにする（同盟を切り、恨みを残す）
// 同盟と恨みは自分の家（P）から見た物なので、どちらかが自分の家の時だけ変わる
function enmity(J, a, b, t, P) {
  const other = a === P ? b : b === P ? a : null;
  if (other == null) return;
  if (J.pact[other] > t) J.pact[other] = t;
  J.grudge[other] = Math.max(J.grudge[other] || 0, t + 6);
}

// y 年・season 季節に起こる。when(ctx) が偽なら、alt があればそちら（条件で変わる）
const EVENTS = [
  { id: 'okehazama', y: 1560, season: '夏', when: (c) => alive(c.J, c.id('今川家')) && alive(c.J, c.id('織田家')),
    run: (c) => { troops(c.J, c.id('今川家'), 0.6); return '桶狭間にて今川義元、討死。今川家は大きく揺らぐ'; } },
  { id: 'jyoraku', y: 1568, season: '秋', when: (c) => alive(c.J, c.id('織田家')) && castles(c.J, c.id('織田家')).length >= 6,
    run: (c) => { troops(c.J, c.id('織田家'), 1.15); return '織田信長、足利義昭を奉じて上洛。畿内の兵が織田に集まる'; },
    alt: (c) => (alive(c.J, c.id('織田家')) ? '織田家は上洛の兵を整えられず、機を逃した' : null) },
  { id: 'hoi', y: 1570, season: '夏', when: (c) => alive(c.J, c.id('織田家')) && castles(c.J, c.id('織田家')).length >= 10,
    run: (c) => { const o = c.id('織田家'); for (const n of ['浅井家', '朝倉家', '本願寺', '武田家', '三好家']) { const e = c.id(n); if (alive(c.J, e)) enmity(c.J, e, o, c.t, c.D.player); } return '浅井・朝倉・本願寺らが手を結び、信長包囲網が敷かれる'; } },
  { id: 'shingen', y: 1573, season: '春', when: (c) => alive(c.J, c.id('武田家')),
    run: (c) => { troops(c.J, c.id('武田家'), 0.85); return '武田信玄、西上の陣中に病没。武田勢は甲斐へ退く'; } },
  { id: 'nagashino', y: 1575, season: '夏', when: (c) => alive(c.J, c.id('武田家')) && (alive(c.J, c.id('織田家')) || alive(c.J, c.id('徳川家'))),
    run: (c) => { troops(c.J, c.id('武田家'), 0.7); return '設楽原にて武田の騎馬、織田・徳川の鉄砲に崩れる'; } },
  { id: 'kenshin', y: 1578, season: '春', when: (c) => alive(c.J, c.id('上杉家')),
    run: (c) => { troops(c.J, c.id('上杉家'), 0.8); return '上杉謙信、春日山城にて急死。上杉家は家督を争う'; } },
  { id: 'honnoji', y: 1582, season: '夏', when: (c) => alive(c.J, c.id('織田家')) && castles(c.J, c.id('織田家')).length >= 8,
    run: (c) => { troops(c.J, c.id('織田家'), 0.75); return '明智光秀、本能寺に信長を討つ。天下は再び乱れる'; },
    alt: (c) => (alive(c.J, c.id('織田家')) ? '織田家はまだ天下に遠く、京に火は上がらなかった' : null) },
];

// 季節を送った時に呼ぶ。起きた出来事の知らせ（{ t, s, k:'big' }）を返す
export function tenkaEvents(D, J, t, now) {
  J.ev = J.ev || {};
  const out = [];
  const ctx = { D, J, t, id: (n) => clanOf(D, n) };
  for (const e of EVENTS) {
    if (J.ev[e.id] || now.y !== e.y || now.season !== e.season) continue;
    J.ev[e.id] = t;
    let s = null;
    try { s = e.when(ctx) ? e.run(ctx) : e.alt ? e.alt(ctx) : null; } catch (err) { s = null; }
    if (s) out.push({ t, s, k: 'big' });
  }
  return out;
}
// これから起こりうる出来事（年の順。天下の札の「先の世」に使える）
export function tenkaAhead(y, n = 3) { return EVENTS.filter((e) => e.y >= y).slice(0, n).map((e) => ({ y: e.y, season: e.season, id: e.id })); }
