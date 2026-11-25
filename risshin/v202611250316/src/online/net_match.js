// 二人の対戦の通信（K580/K589・iMac② 立身 11/21）。受け渡し所は server/online/（Cloudflare Workers＋Durable Objects）。
//   index.js の toFujin（本当の合戦・practice でない時）が呼ぶ。受け渡し所の在り処が無ければ（今は kaito の登録待ち）何もせず null を返し、
//   今まで通り相手の四備を AI が動かす試合になる。試す時は ?server=ws://localhost:8787 か localStorage 'risshin_online_server'。
//   流れ：findMatch（相手探しの札）→ linkMatch（部屋へつなぎ、match.js の onlineMatch(start, send, recv, { host }) に差す）→ 試合 → closeMatchLink
//   切断：受け渡し所が相手の鼓動の途切れ（5秒）か閉じを { k:'peer', on:false } で知らせる → 40 の matchDrop(rt, 1)（相手の備を AI が継ぐ）。
//         戻れば matchBack(rt, 1)。相手が host で切れたら、客が判定を引き継ぐ（matchHostTakeover）。
//         自分の回線が切れた時は、二分まで繋ぎ直し、その間は相手の備を手元の AI が動かす。
import { isEn } from '../i18n.js';

export const ONLINE_SERVER = '';   // kaito の Cloudflare の登録の後に wss://… を入れる（それまでは空＝二人の対戦は出さない）
const UID_KEY = 'risshin_online_uid';

export function serverUrl() {
  try {
    const q = typeof location !== 'undefined' && new URLSearchParams(location.search).get('server');
    const u = q || (typeof window !== 'undefined' && window.__onlineServer) || localStorage.getItem('risshin_online_server') || ONLINE_SERVER;
    return /^wss?:\/\//.test(u || '') ? u.replace(/\/+$/, '') : '';
  } catch (e) { return ''; }
}
export function myUid() {
  try {
    let u = localStorage.getItem(UID_KEY);
    if (!u || !/^[A-Za-z0-9_-]{8,64}$/.test(u)) {
      const r = new Uint8Array(15); crypto.getRandomValues(r);
      u = Array.from(r, (x) => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join('');
      localStorage.setItem(UID_KEY, u);
    }
    return u;
  } catch (e) { return 'guest' + Math.random().toString(36).slice(2, 12); }
}

// ---- 段位の覚え（K580）：待つ間に受け渡し所が教える今の点（前）と、試合の後に届く新しい点（後）。結果の札が読む ----
const RK = { before: null, after: null, fns: [] };
export const ratingState = () => ({ before: RK.before, after: RK.after });
export const resetRating = () => { RK.after = null; };
export function onRated(fn) { RK.fns.push(fn); if (RK.after != null) fn(RK.before, RK.after); return () => { RK.fns = RK.fns.filter((f) => f !== fn); }; }

// ---- 相手探し ----
//   deck：{ generals:[名×4], layout（布陣の画面の置き場）, house }。見つかれば { room, token, host, seed, map, foe:{ name, rating, deck } }、
//   やめた・繋がらない・九十秒で見つからない時は null（呼ぶ側は AI の試合にする）
export function findMatch(o) {
  const base = serverUrl();
  if (!base || typeof WebSocket === 'undefined') return Promise.resolve(null);
  return new Promise((done) => {
    let ws = null, fin = false, card = null;
    const end = (r) => { if (fin) return; fin = true; clearTimeout(lim); clearInterval(hb); try { card?.remove(); } catch (e) { /* 札が無くても進む */ } try { if (!r) ws?.send(JSON.stringify({ k: 'cancel' })); ws?.close(); } catch (e) { /* 閉じられなくても進む */ } done(r); };
    const lim = setTimeout(() => end(null), o.waitMs || 90000);
    const hb = setInterval(() => { try { ws?.send('{"k":"hb"}'); } catch (e) { /* 次の鼓動で */ } }, 15000);
    card = (o.waitCard || waitCard)(() => end(null));   // K598：相手探しの画面（sagashi_ui.js）が札を差し替える口
    try { ws = new WebSocket(`${base}/lobby?uid=${encodeURIComponent(myUid())}`); } catch (e) { end(null); return; }
    ws.onopen = () => ws.send(JSON.stringify({ k: 'find', name: o.name || '', deck: o.deck || null, map: o.map || 'heigen' }));
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.k === 'wait') { if (m.rating != null) { RK.before = m.rating; RK.after = null; } card?.setN?.(m.n, m.rating); }
      else if (m.k === 'ban') end(null);
      else if (m.k === 'match') end(m);
    };
    ws.onerror = () => end(null);
    ws.onclose = () => end(null);
  });
}

// 待つ間の札（字は一行と、やめる釦だけ）
function waitCard(onCancel) {
  if (typeof document === 'undefined') return null;
  const en = isEn();
  const el = document.createElement('div');
  el.id = 'online-wait';
  el.style.cssText = 'position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:rgba(12,10,8,.78);color:#f3e6cc;font:600 16px/1.4 sans-serif';
  const t = document.createElement('div'); t.textContent = en ? 'Looking for an opponent…' : '相手を探しています…';
  const b = document.createElement('button'); b.type = 'button';
  b.textContent = en ? 'Stop searching' : '探すのをやめる';
  b.style.cssText = 'min-height:44px;min-width:160px;padding:8px 18px;font:600 15px/1.2 sans-serif;color:#fff4e0;background:rgba(60,22,16,.9);border:1px solid #c9a46a;border-radius:6px';
  b.addEventListener('click', (e) => { e.stopPropagation(); onCancel(); });
  el.append(t, b);
  document.body.appendChild(el);
  el.setN = () => {};   // 待つ人の数は出さない（Simple）
  return el;
}

// ---- 部屋へつなぐ ----
let link = null;
export function linkMatch(game, match, M, L) {
  closeMatchLink();
  const base = serverUrl();
  if (!base || !match?.room) return null;
  const fns = [], q = [];
  const S = link = { ws: null, open: false, closed: false, result: false, host: !!match.host, foeOn: false, dropped: false, took: false, lostAt: 0, tries: 0, hb: null };
  const rt = () => game.battle;
  const turn = (w) => (w === 0 ? 1 : w === 1 ? 0 : w);   // 0⇄1（引き分け null はそのまま）
  const drop = (bye) => { const b = rt(); if (!b?.flags?.match || S.dropped) return; S.dropped = true; try { L?.matchDrop?.(b, 1, !!bye); } catch (e) { /* 継げなくても試合は進む */ } };
  const back = () => { const b = rt(); if (!S.dropped || !b?.flags?.match) return; S.dropped = false; try { L?.matchBack?.(b, 1); } catch (e) { /* 戻せなくても進む */ } };
  const sendRaw = (m) => {
    if (S.closed) return;
    if (m?.k === 'result') { S.result = true; if (S.took) m = { ...m, winner: turn(m.winner) }; }   // 引き継いだ客は自分の向きで送るので、運ぶ札は host の向きへ直す（受け渡し所の段位・相手の画面は host の向き）
    const s = JSON.stringify(m);
    if (S.open) { try { S.ws.send(s); return; } catch (e) { /* 下で溜める */ } }
    if (m?.k !== 'st' && q.length < 60) q.push(s);   // 毎秒の合わせは古くなるので溜めない。命令と勝ち負けは繋ぎ直した時に送る
  };
  const connect = () => {
    if (S.closed) return;
    let ws;
    try { ws = new WebSocket(`${base}/room/${match.room}?uid=${encodeURIComponent(myUid())}&token=${encodeURIComponent(match.token)}`); } catch (e) { retry(); return; }
    S.ws = ws;
    ws.onopen = () => { S.open = true; S.tries = 0; S.lostAt = 0; while (q.length) { try { ws.send(q.shift()); } catch (e) { break; } } };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.k === 'hello') { S.foeOn = !!m.foeHere; S.helloAt = Date.now(); if (m.foeHere) back(); return; }
      if (m.k === 'peer') {
        S.foeOn = !!m.on;
        if (m.on) back();
        else { drop(m.bye); if (!S.host && !S.took) { try { M.matchHostTakeover?.(); S.took = true; } catch (e) { /* 判定は host の札を待つまま */ } } }
        return;
      }
      if (m.k === 'rated') { S.rating = m.rating; RK.after = m.rating; for (const f of RK.fns.slice()) { try { f(RK.before, m.rating); } catch (e) { /* 札が無くても進む */ } } return; }
      if (m.k === 'result') { S.result = true; if (S.took) m = { ...m, winner: turn(m.winner) }; }   // 引き継いだ後に来る札（host の向き）は自分の向きへ
      for (const f of fns) { try { f(m); } catch (e) { /* 一つの受け手の誤りで止めない */ } }
    };
    ws.onclose = () => { if (S.ws !== ws) return; S.open = false; if (!S.closed) { drop(false); retry(); } };
    ws.onerror = () => { try { ws.close(); } catch (e) { /* onclose で繋ぎ直す */ } };
  };
  // 自分の回線が切れた：二分（pvp_rules の backWindow）まで、間を延ばしながら繋ぎ直す
  const retry = () => {
    if (S.closed) return;
    S.lostAt ||= Date.now();
    if (Date.now() - S.lostAt > 120000) return;
    S.tries++; setTimeout(connect, Math.min(8000, 500 * 2 ** Math.min(4, S.tries)));
  };
  // 鼓動は一秒ごと。相手が部屋へ来ないまま十秒（読み込みで落ちた・やめた）なら、相手の備は手元の AI が動かす（来れば戻す）
  S.hb = setInterval(() => {
    if (!S.open) return;
    try { S.ws.send('{"k":"hb"}'); } catch (e) { /* onclose で繋ぎ直す */ }
    if (!S.foeOn && !S.dropped && S.helloAt && Date.now() - S.helloAt > 10000) drop(false);
  }, 1000);
  connect();
  M.onlineMatch((seed) => {}, sendRaw, (fn) => fns.push(fn), { host: S.host });
  return S;
}

// 試合の後（ホームへ戻る時）：決着の前に抜けたなら『わざと抜けた』を知らせてから閉じる。二人の口も外す
export function closeMatchLink(M) {
  const S = link; link = null;
  try { M?.onlineMatchOff?.(); } catch (e) { /* 外せなくても進む */ }
  if (!S || S.closed) return;
  S.closed = true; clearInterval(S.hb);
  try { if (S.open && !S.result) S.ws.send('{"k":"bye"}'); } catch (e) { /* 送れなくても閉じる */ }
  try { S.ws?.close(1000, 'home'); } catch (e) { /* 閉じられなくても進む */ }
}
