// 天下の地図の「時の流れ」：年と季節が進むと、史実の出来事が起こる（条件しだいで起こらない・形が変わる）
// japan.js の advance（季節を送る）が tenkaEvents を呼ぶ。一つの出来事は一度だけ（J.ev に覚える）
// 始まりの年より前の出来事は起こさない（その年・その季節に着いた時だけ）

import { capture, historicalDeath } from './naisei.js';

// 家の名から家の番号（無ければ null）
function clanOf(D, name) { for (const [id, c] of Object.entries(D.clans)) if (c.name === name) return +id; return null; }
const castles = (J, cid) => Object.keys(J.own).filter((k) => J.own[k] === cid);
const alive = (J, cid) => cid != null && castles(J, cid).length > 0;
// 城 id を織田家が取る。すでに織田の城なら何もしない（史実の大きな城攻めを、織田家編の年表（ODA_LINE）どおりに）
function odaTakes(c, id) {
  const oda = c.id('織田家');
  if (oda != null && c.D.byId[id] && c.J.own[id] !== oda) capture(c.D, c.J, c.D.byId[id], oda, c.logs, c.t, null);
}
function dies(c, name, reason) { return historicalDeath(c.D, c.J, name, c.logs, c.t, reason); }
const living = (c, name, clan) => c.J.gen[name] && !c.J.gen[name].dead && c.J.gen[name].c === c.id(clan);
// その家の城の兵を k 倍にする
function troops(J, cid, k) { for (const id of castles(J, cid)) { const d = J.dom[id]; if (d) d.h = Math.max(0, Math.round((d.h * k) / 10) * 10); } }
// 二つの家を敵どうしにする（同盟を切り、恨みを残す）
// 同盟と恨みは自分の家（P）から見た物なので、どちらかが自分の家の時だけ変わる
function enmity(J, a, b, t, P) {
  const other = a === P ? b : b === P ? a : null;
  if (other == null) return;
  J.pact ||= {}; J.grudge ||= {}; J.broken ||= {}; J.broken[other] = true;
  if (J.pact[other] > t) J.pact[other] = t;
  J.grudge[other] = Math.max(J.grudge[other] || 0, t + 6);
}

// y 年・season 季節に起こる。when(ctx) が偽なら、alt があればそちら（条件で変わる）
const EVENTS = [
  { id: 'okehazama', y: 1560, season: '夏', when: (c) => alive(c.J, c.id('今川家')) && alive(c.J, c.id('織田家')) && living(c, '今川義元', '今川家'),
    run: (c) => { dies(c, '今川義元', '桶狭間で討死'); troops(c.J, c.id('今川家'), 0.6); return '桶狭間にて今川義元、討死。今川家は大きく揺らぐ'; } },
  { id: 'okawachi', y: 1569, season: '秋', when: (c) => alive(c.J, c.id('織田家')) && c.D.byId[175] && c.J.own[175] !== c.id('織田家'),
    run: (c) => { odaTakes(c, 175); return '織田勢、伊勢の大河内城を降す。北畠家は信長の次男・茶筅丸を養子に迎え、事実上その軍門に降る'; } },
  { id: 'jyoraku', y: 1568, season: '秋', when: (c) => alive(c.J, c.id('織田家')) && castles(c.J, c.id('織田家')).length >= 6,
    run: (c) => { troops(c.J, c.id('織田家'), 1.15); return '織田信長、足利義昭を奉じて上洛。畿内の兵が織田に集まる'; },
    alt: (c) => (alive(c.J, c.id('織田家')) ? '織田家は上洛の兵を整えられず、機を逃した' : null) },
  { id: 'hoi', y: 1570, season: '夏', when: (c) => alive(c.J, c.id('織田家')) && castles(c.J, c.id('織田家')).length >= 10,
    run: (c) => { const o = c.id('織田家'); for (const n of ['浅井家', '朝倉家', '本願寺', '武田家', '三好家']) { const e = c.id(n); if (alive(c.J, e)) enmity(c.J, e, o, c.t, c.D.player); } return '浅井・朝倉・本願寺らが手を結び、信長包囲網が敷かれる'; } },
  { id: 'shingen', y: 1573, season: '夏', when: (c) => alive(c.J, c.id('武田家')) && living(c, '武田信玄', '武田家'),
    run: (c) => { dies(c, '武田信玄', '西上の陣中に病没'); troops(c.J, c.id('武田家'), 0.85); return '武田信玄、西上の陣中に病没。武田勢は甲斐へ退く'; } },
  { id: 'odani', y: 1573, season: '秋', when: (c) => alive(c.J, c.id('織田家')) && c.D.byId[25] && c.J.own[25] !== c.id('織田家'),
    run: (c) => { const azai = c.id('浅井家'); const suicide = c.J.own[25] === azai && living(c, '浅井長政', '浅井家') && c.J.gen['浅井長政'].at === 25; if (suicide) dies(c, '浅井長政', '小谷城で自刃'); odaTakes(c, 25); return `織田勢、小谷城を落とす。${suicide ? '浅井長政、自刃。' : ''}${alive(c.J, azai) ? '浅井家は残る城で抗戦を続ける' : '浅井家は城をすべて失う'}`; } },
  { id: 'nagashino', y: 1575, season: '夏', when: (c) => alive(c.J, c.id('武田家')) && (alive(c.J, c.id('織田家')) || alive(c.J, c.id('徳川家'))),
    run: (c) => { troops(c.J, c.id('武田家'), 0.7); return '設楽原にて武田の騎馬、織田・徳川の鉄砲に崩れる'; } },
  { id: 'kenshin', y: 1578, season: '春', when: (c) => alive(c.J, c.id('上杉家')) && living(c, '上杉謙信', '上杉家'),
    run: (c) => { dies(c, '上杉謙信', '急死'); troops(c.J, c.id('上杉家'), 0.8); return c.J.succession?.[c.id('上杉家')]?.candidates.length > 1 ? '上杉謙信、急死。上杉家は家督を争う' : '上杉謙信、急死。家督の行方は家中の控えに記す'; } },
  { id: 'iga', y: 1581, season: '秋', when: (c) => alive(c.J, c.id('織田家')) && c.D.byId[284] && c.J.own[284] !== c.id('織田家'),
    run: (c) => { odaTakes(c, 284); return '天正伊賀の乱。織田勢四万余りが伊賀へ攻め入り、比自山城ほか伊賀衆の城々が開く'; } },
  { id: 'tottori', y: 1581, season: '冬', when: (c) => alive(c.J, c.id('織田家')) && c.D.byId[75] && c.J.own[75] !== c.id('織田家'),
    run: (c) => { odaTakes(c, 75); return '羽柴秀吉の兵糧攻めにより、鳥取城が開く。城中の困窮は凄惨を極めたと伝わる'; } },
  { id: 'takato', y: 1582, season: '春', when: (c) => alive(c.J, c.id('武田家')) && c.D.byId[13] && c.J.own[13] !== c.id('織田家'),
    run: (c) => { const fallen = living(c, '仁科盛信', '武田家') && c.J.gen['仁科盛信'].at === 13; if (fallen) dies(c, '仁科盛信', '高遠城で討死'); odaTakes(c, 13); troops(c.J, c.id('武田家'), 0.5); return `甲州征伐、始まる。織田勢、高遠城を落とす${fallen ? '。仁科盛信、討死' : ''}`; } },
  { id: 'honnoji', y: 1582, season: '夏', when: (c) => alive(c.J, c.id('織田家')) && castles(c.J, c.id('織田家')).length >= 8 && living(c, '織田信長', '織田家'),
    run: (c) => { if (living(c, '織田信忠', '織田家')) dies(c, '織田信忠', '二条御所で自刃'); dies(c, '織田信長', '本能寺で自刃'); troops(c.J, c.id('織田家'), 0.75); return '明智光秀、本能寺に信長を討つ。天下は再び乱れる'; },
    alt: (c) => (alive(c.J, c.id('織田家')) ? '織田家はまだ天下に遠く、京に火は上がらなかった' : null) },
];

// 季節を送った時に呼ぶ。起きた出来事の知らせ（{ t, s, k:'big' }）を返す
export function tenkaEvents(D, J, t, now) {
  J.ev = J.ev || {};
  const out = [];
  const ctx = { D, J, t, logs: [], id: (n) => clanOf(D, n) };
  for (const e of EVENTS) {
    if (J.ev[e.id] || now.y !== e.y || now.season !== e.season) continue;
    const before = JSON.parse(JSON.stringify(J));
    ctx.logs.length = 0;
    try {
      const s = e.when(ctx) ? e.run(ctx) : e.alt ? e.alt(ctx) : null;
      J.ev[e.id] = t || 1;
      if (J.evErrors) delete J.evErrors[e.id];
      if (s) out.push({ t, s, k: 'big' });
      out.push(...ctx.logs);
    } catch (err) {
      for (const key of Object.keys(J)) delete J[key];
      Object.assign(J, before);
      J.evErrors ||= {}; J.evErrors[e.id] = { reason: '出来事の処理が途中で止まった', detail: String(err?.message || err), t };
      out.push({ t, s: '出来事の処理が途中で止まった。変更を戻した。同じ季節の処理をやり直せます', k: 'bad' });
    }
  }
  return out;
}
// これから起こりうる出来事（年の順。天下の札の「先の世」に使える）
export function tenkaAhead(y, n = 3) { return EVENTS.filter((e) => e.y >= y).sort((a, b) => a.y - b.y).slice(0, n).map((e) => ({ y: e.y, season: e.season, id: e.id })); }
