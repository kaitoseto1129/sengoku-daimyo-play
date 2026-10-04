import { sightPoint } from './battle_sight.js';
// 戦況（senkyo.js）：docs/battle-system-plan.md 0-3・第1段。束1 は記録だけ。束6：知らせ・身分の見え方・戦功
// logEvent(rt, k, o) で rt.senkyo.log に { t, k, team, who, v } を積む。試し（tools/mvp/*.js）がこれを読む。
// 記録は 600 件まで（古い物から捨てる）。毎コマは呼ばない（出来事の時だけ）
//
// 束6（60 章 戦況の知らせ・59 章 身分の見え方・64 章 戦功）：
// ・notice(rt, key, text, o)：画面に出す知らせ（同じ key は 8 秒に一度まで。同時に三つまでは hud.js の bark が守る）
// ・ここから下は、出来事（sonae.js・gunsei.js・denrei.js の logEvent・knows）を聞いて、自分の軍が知った時だけ知らせを出す。
//   siege_zones.js は直さない：城攻めの戦は onFall などの口から zoneNotice(rt, team, name, verb) を呼べば、同じ仕組みで知らせが出る
// ・viewLevel(rt)：0 足軽・1 組頭・2 足軽大将・5 大名。見える範囲は inScope() が rank で変える
// ・meritOf(rt)：戦の終わりに一度呼ぶ。logEvent の記録から戦功（rt.award）を足す（単純な撃破数だけにしない）
//
// sonae.js・denrei.js は、どちらもこのファイルの logEvent・onEvent を使う（束1・束3）。ここから import で戻すと
// 輪になり、どちらが先に読み込まれるかで「hooks が まだ無い」という取り合いが起きる（実際に起きた）。
// なので sonaeById・knows は import せず、ここだけ小さく写して使う（sonae.js・denrei.js は直さない）
const MAX_LOG = 600;

function sonaeById(rt, id) { return (rt.sonae || []).find((s) => s.id === id) || null; }
// denrei.js の knows() と同じ中身（rt.denrei.news を読むだけ。書き換えない）
function knows(rt, team, key, who) {
  const d = rt.denrei;
  if (!d) return null;
  for (const N of d.news || []) if (N.team === team && N.key === key) { const t = N.known.get(who); return t == null ? null : t; }
  return null;
}

export function senkyoOf(rt) {
  return rt.senkyo || (rt.senkyo = { log: [] });
}

// k：出来事の名（'state'・'taishoDown'・'moraleLow'・'rout'・'order' など）。o：{ team, who, v }
export function logEvent(rt, k, o = {}) {
  const L = senkyoOf(rt).log;
  L.push({ t: Math.round((rt.t || 0) * 10) / 10, k, team: o.team ?? null, who: o.who ?? null, v: o.v ?? null });
  if (L.length > MAX_LOG) L.splice(0, L.length - MAX_LOG);
  for (const f of hooks) f(rt, k, o);
}

// 出来事を聞く口（denrei.js が侍大将討死・敗走を知らせの広がりへ回す。束3）
const hooks = [];
export function onEvent(fn) { if (!hooks.includes(fn)) hooks.push(fn); }

// 試しが引く：k（と who）の最初の記録
export function firstEvent(rt, k, who) {
  const s = rt.senkyo;
  if (!s) return null;
  for (const e of s.log) if (e.k === k && (who == null || e.who === who)) return e;
  return null;
}

// ---------------- 59 章：身分の見え方 ----------------
// 0 足軽・1 組頭（候補も）・2 足軽大将（候補も）・5 大名。侍大将・部将（rank の外。今は無いので足軽大将止まり）は表だけ
export function viewLevel(rt) {
  const G = rt.G;
  if (G && G.lordTitle) return 5;
  const r = (G && G.rank) || 0;
  if (r >= 3) return 2;
  if (r >= 1) return 1;
  return 0;
}

// 足軽大将が率いる自分の備：戦の定義が def.playerSonae（備の id）を書いていればそれ、無ければ一番近い味方の備
export function playerSonae(rt) {
  const id = rt.def && rt.def.playerSonae;
  if (id) { const S = sonaeById(rt, id); if (S) return S; }
  const P = rt.player && rt.player.u && rt.player.u.pos;
  if (!P) return null;
  let best = null, bd = Infinity;
  for (const S of rt.sonae || []) {
    if (S.team !== 0) continue;
    const d = Math.hypot(S.b.pos.x - P.x, S.b.pos.z - P.z);
    if (d < bd) { bd = d; best = S; }
  }
  return best;
}

// 身分でこの備の事を知らせてよいか：足軽は周り 40m・組頭は周り 90m・足軽大将は自分の備と隣・後詰・本陣・大名は全部
function inScope(rt, S, lvl) {
  if (!S) return false;
  if (lvl >= 5) return true;
  if (lvl >= 2) {
    const own = playerSonae(rt);
    if (own && (S === own || S === own.left() || S === own.right() || S === own.behind() || S.line === 'honjin')) return true;
  }
  const P = rt.player && rt.player.u && rt.player.u.pos;
  if (!P) return false;
  const d = Math.hypot(S.b.pos.x - P.x, S.b.pos.z - P.z);
  return lvl === 0 ? d < 40 : d < 90;
}

// ---------------- 60 章：戦況の知らせ ----------------
// notice(rt, key, text, o)：o.warn で警告の色。同じ key は 8 秒に一度まで（同時に三つまでは hud.js の bark が守る）
export function notice(rt, key, text, o = {}) {
  if (!rt || !text) return false;
  const s = senkyoOf(rt);
  const seen = s._noticeSeen || (s._noticeSeen = new Map());
  const now = rt.t || 0;
  const last = seen.get(key);
  if (last != null && now - last < 8) return false;
  seen.set(key, now);
  if (rt.bark) rt.bark(text, !!o.warn);
  return true;
}

// 城攻めの戦（siege_zones.js は直さない）：onFall などの口から呼べば、同じ知らせの仕組みに乗る
export function zoneNotice(rt, team, name, verb, warn = true) {
  logEvent(rt, 'zoneEvent', { team, who: name, v: verb });
  notice(rt, `zoneEvent:${name}:${verb}`, `${name}、${verb}`, { warn });
}

function sonaeName(rt, id) { const S = sonaeById(rt, id); return String((S && S.name) || id || '備').replace(/[（(][^）)]*[）)]/g, '') || '備'; }

// 自分の軍が knows の時だけ出す出来事（rout・taishoDown）：denrei.js の knows 記録（v が出来事の鍵）から拾う
function fromKnows(rt, e, lvl) {
  const v = e.v;
  if (typeof v !== 'string') return;
  let m = /^rout:(.+)$/.exec(v);
  if (m) { const S = sonaeById(rt, m[1]); if (inScope(rt, S, lvl)) notice(rt, `rout:${m[1]}`, `${sonaeName(rt, m[1])}、崩れました`, { warn: true }); return; }
  m = /^enemyRout:(.+)$/.exec(v);
  if (m) { const S = sonaeById(rt, m[1]); if (lvl >= 1 && inScope(rt, S, lvl)) notice(rt, `rout:${m[1]}`, `${sonaeName(rt, m[1])}、崩れました`, { warn: true }); return; }
  m = /^taishoDown:(.+)$/.exec(v);
  if (m) { const S = sonaeById(rt, m[1]); if (inScope(rt, S, lvl)) notice(rt, `taishoDown:${m[1]}`, `${(S && S.taisho) || '味方の将'}、討死`, { warn: true }); return; }
  m = /^enemyTaishoDown:(.+)$/.exec(v);
  if (m) { const S = sonaeById(rt, m[1]); if (lvl >= 1 && inScope(rt, S, lvl)) notice(rt, `taishoDown:${m[1]}`, `敵将${(S && S.taisho) || '某'}、討死`, { warn: true }); return; }
}

// 出来事をそのまま知らせにする物（denrei の伝わりを待たず、身分の見える範囲だけで出す）
function fromImmediate(rt, e, lvl) {
  const S = e.who != null ? sonaeById(rt, e.who) : null;
  // 使番の到着を経ない知らせは、見える備に限る。
  if (!S || !sightPoint(rt, S.b.pos)) return;
  switch (e.k) {
    case 'armyBroken': return;
    case 'flankOpen': if (e.team === 0 && inScope(rt, S, lvl)) notice(rt, `flankOpen:${e.who}`, `${sonaeName(rt, e.who)}、側面を突かれています`, { warn: true }); return;
    case 'moraleLow': if (e.team === 0 && inScope(rt, S, lvl)) notice(rt, `moraleLow:${e.who}`, `${sonaeName(rt, e.who)}、押されています`, { warn: true }); return;
    case 'withdraw': if (e.team === 0 && inScope(rt, S, lvl)) notice(rt, `withdraw:${e.who}`, `${sonaeName(rt, e.who)}、後退しています`, { warn: false }); return;
    case 'succeed': if (e.team === 0 && inScope(rt, S, lvl)) notice(rt, `succeed:${e.who}`, `${e.v || '副将'}、後を継ぎました`, { warn: false }); return;
    case 'rally': if (e.team === 0 && inScope(rt, S, lvl)) notice(rt, `rally:${e.who}`, `${sonaeName(rt, e.who)}、立て直しました`, { warn: false }); return;
    case 'gotsumeArrive': if (lvl >= 1) notice(rt, 'gotsumeArrive', '後詰が到着', { warn: false }); return;
    case 'gotsumeSent': if (lvl >= 1) notice(rt, 'gotsumeSent', '援軍、間もなく到着', { warn: false }); return;
    case 'zoneEvent': if (lvl >= 0) notice(rt, `zoneEvent:${e.who}:${e.v}`, `${e.who}、${e.v}`, { warn: true }); return;
  }
}

onEvent((rt, k, o) => {
  if (!rt || !rt.senkyo) return;
  const lvl = viewLevel(rt);
  if (k === 'knows') fromKnows(rt, o, lvl);
  else fromImmediate(rt, { k, ...o }, lvl);
});

// ---------------- 64 章：戦功（単純な撃破数だけにしない）----------------
// 戦の終わりに一度呼ぶ：logEvent の記録から rt.award へ足す（rt.award は battle.js の既にある仕組み）
export function meritOf(rt) {
  const s = rt.senkyo;
  if (!s || s._meritDone || !rt.award) return;
  s._meritDone = true;
  const seenWho = new Set();
  for (const e of s.log) {
    if (e.k === 'rout' && e.team === 1 && e.who != null && !seenWho.has('rout:' + e.who)) {
      seenWho.add('rout:' + e.who);
      rt.award((t) => t.side.push('敵の備を退けた'), `敵の備（${sonaeName(rt, e.who)}）を退けた`);
    } else if (e.k === 'taishoKilledBy' && e.who != null && !seenWho.has('kill:' + e.who)) {
      seenWho.add('kill:' + e.who);
      rt.award((t) => { t.special = { label: '侍大将を討った', pts: 20 }; }, `敵の侍大将（${e.v || '某'}）を討った`);
    } else if (e.k === 'succeed' && e.team === 0 && e.who != null && !seenWho.has('save:' + e.who)) {
      const S = sonaeById(rt, e.who);
      if (S && S.major) { seenWho.add('save:' + e.who); rt.award((t) => t.side.push('味方の武将を救った'), '味方の武将を救った（副将が後を継いだ）'); }
    } else if (e.k === 'withdraw' && e.team === 0 && e.who != null && !seenWho.has('sin:' + e.who)) {
      seenWho.add('sin:' + e.who);
      const later = s.log.find((x) => x.k === 'rout' && x.who === e.who && x.t > e.t);
      if (!later) rt.award((t) => t.side.push('しんがりを務めた'), `しんがりを務めた（${sonaeName(rt, e.who)}）`);
    } else if (e.k === 'rally' && e.team === 0 && e.who != null) {
      const S = sonaeById(rt, e.who);
      if (S && S.line === 'gotsume' && !seenWho.has('gotsume:' + e.who)) { seenWho.add('gotsume:' + e.who); rt.award((t) => { t.main = t.main === false ? false : true; }, `後詰（${sonaeName(rt, e.who)}）で戦線を戻した`); }
    }
  }
  const honjin = (rt.sonae || []).find((x) => x.team === 0 && x.line === 'honjin');
  if (honjin && honjin.state !== '敗走' && honjin.b.aliveNominal() > 0) rt.award((t) => { t.main = t.main === false ? false : true; }, '本陣を守った');
}
