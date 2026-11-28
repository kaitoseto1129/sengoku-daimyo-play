// 一騎打ちのオンライン（K317・オンライン P1 の一場面。kaito 11/15「他のユーザーと一騎打ちの時は携帯を刀にしてチャンバラ」）。
//   二人のパソコンが WebRTC（PeerJS の DataChannel）で直につながり、稽古場で一対一。どちらも自分の携帯を刀にできる（phone_sword.js）。
//   URL：開く人 ?duel=host（部屋の名は自動。&room= で決めてもよい）／受ける人 ?duel=join&room=<部屋の名>。アカウントは要らない。
//   当たりと受けはホスト（開いた人）が一つに決めて両方へ流す（res）。両方の画面は同じ res だけで命を減らし、血・火花を出すので必ず揃う。
//   斬った側の画面で刃が届いたか（間合いと向き）を見て hit を送り、ホストが相手の構えと向きで「受けた／斬られた」を決める。
//   送る物：me（20 回/秒：位置・向き・構え）・sw（振り始め：技・速さ）・hit（自分の刃が相手に届いた）・res（ホストの決め）・round（始め直し）・p/q（往復の遅れ）。
//   ソロでは読み込まない（main.js は ?duel= がある時だけ import）。くわしくは docs/online_k317_imac_1115.md。
import { dojo, drillTick } from './b_dojo.js';
import { enemyGroup } from './bhelp.js';

const HP = 100, ME_MS = 50, GAP = 2.4;
const peerName = (room) => 'risshin-duel-' + room;
let D = null;

// 稽古場の形をそのまま使い、寄せ手は出さない
export const duelDef = Object.assign({}, dojo, {
  key: 'netduel', netDuel: true,
  missionHeading: () => '相手と一騎打ち',
  next(rt) { rt.obj('dojo', '相手と一騎打ち', 'main'); },
  update(rt) { const F = rt.flags; if (F.drill) drillTick(rt, F.drill); if (D && D.rt === rt) D.tick(); },
  onKill() {},
});

function loadScript(rel) {
  return new Promise((ok, ng) => {
    const url = new URL(rel, import.meta.url).href;
    if (document.querySelector(`script[src="${url}"]`)) return ok();
    const s = document.createElement('script');
    s.src = url; s.onload = ok; s.onerror = () => ng(new Error('読めない ' + rel));
    document.head.appendChild(s);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 題の画面から入る（main.js の起動の後）
export async function bootDuel(game) {
  const q = new URLSearchParams(location.search);
  const host = q.get('duel') !== 'join';
  const room = (q.get('room') || '').replace(/[^a-z0-9]/gi, '').slice(0, 12) || Math.random().toString(36).slice(2, 8);
  window.__duel = { boot: true, host, room };
  game.startDojo(null, duelDef);
  for (let k = 0; k < 600; k++) {
    const b = game.battle;
    if (b && b.def === duelDef && b.player && b.player.u && $loaded()) return attach(b, { host, room, name: q.get('name') });
    await wait(200);
  }
  window.__duel.err = '戦が始まりませんでした';
}
const $loaded = () => { const l = document.getElementById('loading'); return !l || l.hidden; };

function attach(rt, { host, room, name }) {
  const me = host ? 0 : 1, other = 1 - me;
  const army = rt.army, P = rt.player, U = P.u;
  const st = Object.assign(window.__duel, { slot: me, open: false, ready: false, rtt: 0, log: [], hp: [HP, HP], over: false, win: -1, round: 0,
    sent: { me: 0, sw: 0, hit: 0 }, got: { me: 0, sw: 0, hit: 0, res: 0 }, swGot: [], swSent: [] });
  // 自分：刀を持たせ、命は 100 に揃える（どちらも同じ重さで斬り合う）。ほかの物には斬られない
  P.hasKatana = true; if (P.weapon !== 'sword' && P.switchWeapon) P.switchWeapon('sword');
  U.maxHp = U.hp = HP; U.invuln = true;
  // 相手の分身：名のある侍一人。自分からは斬りかからない（動きは相手の me だけ）
  const spot = (s) => ({ x: 0, z: s === 0 ? GAP / 2 : -GAP / 2, h: s === 0 ? Math.PI : 0 });
  const o = spot(other);
  const g = enemyGroup(rt, { faction: 'saito', fixed: true, noAI: true, noRout: true, order: 'hold', aggro: 0, seekRange: 0, anchor: { x: o.x, z: o.z }, facing: o.h, width: 1, name: '相手' },
    [{ type: 'samurai', n: 1, o: { name: '相手', weapon: 'sword', horse: false } }]);
  const R = g.units[0];
  R.playerOpeningBlocked = true; R.mustLive = true; R.maxHp = R.hp = HP; R.noRetinue = true;
  const remote = { x: o.x, z: o.z, h: o.h, g: false, at: 0 };
  let conn = null, peer = null, lastMe = 0, mySwing = null, hitSwing = null, resN = 0, lastHitAt = [0, 0], pingT = 0, lastT = performance.now();
  const send = (m) => { try { if (conn && conn.open) conn.send(m); } catch (e) { /* 切れた */ } };

  // ---- 画面：待つ間の札（部屋の名・相手に送る URL）・相手の命の棒・勝ち負けの札 ----
  const css = 'position:fixed;z-index:9998;box-sizing:border-box;background:rgba(20,18,15,.92);color:#f1e9d8;border:1px solid #b8963e;border-radius:8px;font-size:15px;line-height:1.5';
  const lobby = document.createElement('div');
  lobby.id = 'duel-lobby'; lobby.setAttribute('role', 'dialog'); lobby.setAttribute('aria-label', '一騎打ちの相手を待つ');
  lobby.style.cssText = css + ';left:50%;top:16px;transform:translateX(-50%);padding:10px 12px;max-width:min(30em,calc(100vw - 32px));text-align:center';
  const invite = new URL(location.pathname + '?duel=join&room=' + room, location.href).href;
  lobby.innerHTML = host
    ? `<div style="font-size:13px">相手に送る</div><div style="font-size:24px;letter-spacing:.12em;font-weight:bold">${room}</div>
       <input id="duel-url" readonly aria-label="相手に送る URL" value="${invite}" style="width:100%;font-size:13px;min-height:32px;margin:4px 0;box-sizing:border-box">
       <button type="button" class="btn" id="duel-copy" style="min-height:44px;min-width:44px">${navigator.share ? '相手に送る' : '写す'}</button>
       <p id="duel-st" role="status" aria-live="polite" style="margin:6px 0 0;font-size:13px">相手を待っています</p>`
    : `<p id="duel-st" role="status" aria-live="polite" style="margin:0;font-size:15px">つないでいます</p>`;
  document.body.appendChild(lobby);
  const say = (t) => { const s = lobby.querySelector('#duel-st'); if (s) s.textContent = t; };
  const cp = lobby.querySelector('#duel-copy');
  // K501（11/25）：携帯では写さずに LINE などへそのまま送れる（Web Share）。使えない時・やめた時は今まで通り写す
  if (cp) cp.onclick = async () => { if (navigator.share) { try { await navigator.share({ url: invite }); say('送りました'); return; } catch (e) { /* やめた・出来ない時は写す */ } } const i = lobby.querySelector('#duel-url'); i.select(); try { navigator.clipboard.writeText(invite); } catch (e) { document.execCommand('copy'); } say('写しました'); };
  const bar = document.createElement('div');
  bar.id = 'duel-foe'; bar.setAttribute('aria-label', '相手の命');
  bar.style.cssText = 'position:fixed;z-index:9997;right:16px;top:64px;width:180px;pointer-events:none;color:#f1e9d8;font-size:13px;text-shadow:0 1px 2px #000;text-align:right';
  bar.innerHTML = '<div id="duel-foe-n">相手</div><div style="height:8px;background:rgba(0,0,0,.55);border:1px solid #b8963e;border-radius:4px;overflow:hidden"><div id="duel-foe-b" style="height:100%;width:100%;background:#c8462f"></div></div>';
  bar.hidden = true;
  document.body.appendChild(bar);
  const showHp = () => { const b = bar.querySelector('#duel-foe-b'); if (b) b.style.width = Math.max(0, st.hp[other]) + '%'; };
  let card = null;
  const endCard = (win) => {
    card && card.remove();
    card = document.createElement('div');
    card.id = 'duel-end'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', '一騎打ちの結び');
    card.style.cssText = css + ';left:50%;top:38%;transform:translate(-50%,-50%);padding:14px 18px;text-align:center';
    card.innerHTML = `<div style="font-size:30px;font-weight:bold;color:${win ? '#f0c95a' : '#d8d0bc'}">${win ? '勝ち' : '負け'}</div>
      <button type="button" class="btn" id="duel-again" style="min-height:44px;min-width:44px;margin-top:8px">もう一番</button>`;
    document.body.appendChild(card);
    card.querySelector('#duel-again').onclick = () => { if (host) newRound(); else send({ t: 'again' }); card.querySelector('#duel-again').disabled = true; };
  };

  // 一対一にする：自分の組（足軽）は下げる
  const clearSquad = () => { for (const s of [...(rt.squad || [])]) if (s && !s.isPlayer && !s.gone) army.despawn(s); };
  clearSquad();
  // ---- 並び直し（一番ごと）。ホストが決め、round で両方へ ----
  const setMe = () => {
    const s = spot(me);
    U.pos.set(s.x, rt.world.heightAt(s.x, s.z), s.z); U.heading = s.h; P.yaw = s.h; if ('camYawOff' in P) P.camYawOff = 0;
  };
  const startRound = (n) => {
    st.round = n; st.over = false; st.win = -1; st.hp = [HP, HP];
    U.hp = U.maxHp = HP; R.hp = R.maxHp = HP; R.stagger = 0; R.alive = true;
    setMe(); card && card.remove(); card = null; showHp(); clearSquad();
  };
  const newRound = () => { const n = st.round + 1; send({ t: 'round', n }); startRound(n); };

  // ---- 斬った側：自分の刃が相手の分身に届いた（army_combat.js の damage の頭から呼ばれる） ----
  R.netDuel = (amount, src, opts) => {
    if (!src || !src.isPlayer || st.over || !st.open) return;
    if (U.swing && hitSwing === U.swing) return;   // 一振りで一度
    hitSwing = U.swing;
    const m = { t: 'hit', a: me, k: opts.kind || 'kesa', dmg: Math.round(amount), gb: !!opts.guardBreak };
    st.sent.hit++;
    if (host) decide(m); else send(m);
  };
  // ---- ホスト：受けたか斬られたかを決める ----
  function decide(m) {
    if (st.over) return;
    const a = m.a, d = 1 - a, now = performance.now();
    if (now - lastHitAt[a] < 220) return;
    lastHitAt[a] = now;
    const du = d === me ? U : R, au = a === me ? U : R;
    const guard = d === me ? !!(P.guard || U.guard) : !!remote.g;
    const dx = au.pos.x - du.pos.x, dz = au.pos.z - du.pos.z, dl = Math.hypot(dx, dz) || 1;
    const front = (dx * Math.sin(du.heading) + dz * Math.cos(du.heading)) / dl > 0.34;   // 前の左右 70 度
    const raw = Math.max(5, Math.min(40, +m.dmg || 0));
    let res, dmg;
    if (guard && front) { res = 'block'; dmg = m.gb ? Math.round(raw * 0.25) : 0; }   // 上段の斬り下ろしは受けても少し通る
    else { res = 'hit'; dmg = Math.round(raw); }
    const hp = st.hp.slice(); hp[d] = Math.max(0, hp[d] - dmg);
    const r = { t: 'res', n: ++resN, round: st.round, a, d, k: m.k, res, dmg, hp, win: hp[d] <= 0 ? a : -1 };
    send(r); apply(r);
  }
  // ---- 両方：決めを画面へ（命・血・火花・勝ち負け） ----
  function apply(r) {
    st.got.res += host ? 0 : 1;
    st.log.push({ n: r.n, round: r.round, a: r.a, d: r.d, k: r.k, res: r.res, dmg: r.dmg, hp: r.hp.slice(), win: r.win });
    st.hp = r.hp.slice();
    const du = r.d === me ? U : R, au = r.a === me ? U : R;
    U.hp = Math.max(1, st.hp[me]); R.hp = Math.max(1, st.hp[other]);
    if (r.res === 'hit') {
      try { army.bleed(du, au, r.k, r.dmg / HP, 'torso'); } catch (e) { /* 血は無くても進む */ }
      try { army.hitFlash && army.hitFlash(du.pos.x, army.partY(du, 'torso'), du.pos.z, r.dmg >= 30); } catch (e) { /* 光 */ }
      army.play(r.a === me ? 'playerCut' : 'hit', du.pos, 1);
      if (du === U) { try { P.feelHit && P.feelHit(r.dmg, R); rt.hud.damageFrom && rt.hud.damageFrom(Math.atan2(R.pos.x - U.pos.x, R.pos.z - U.pos.z) - P.yaw, r.dmg); } catch (e) { /* 揺れ */ } }
      else R.stagger = Math.max(R.stagger || 0, 0.34);
    } else {
      try { army.clashAt(au, du); } catch (e) { /* 火花 */ }
      army.play('clash', du.pos, 1);
      if (du === R) { R.guardFlash = 0.3; R.guarding = 0.6; }
    }
    if (r.a === me && U.swing) U.swing.res = r.res;
    if (r.a === me && window.__swordBuzz) window.__swordBuzz(1);
    showHp();
    if (r.win >= 0) {
      st.over = true; st.win = r.win;
      if (r.win === me) R.stagger = 2.5;
      endCard(r.win === me);
    }
  }

  // ---- 届いた物 ----
  function onData(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'me') {
      st.got.me++;
      remote.x = +m.x; remote.z = +m.z; remote.h = +m.h; remote.g = !!m.g; remote.at = performance.now();
    } else if (m.t === 'sw') {
      st.got.sw++; st.swGot.push({ k: m.k, pow: m.pow, ph: !!m.ph });
      const pow = Math.max(0.85, Math.min(1.3, +m.pow || 1));
      // 相手の振りの向き（技）と速さ（速いほど短く振り抜く）を分身の刀に
      R.swing = { kind: String(m.k || 'kesa'), t: 0, dur: Math.max(0.16, (+m.dur || 0.24) / pow), at: 0, done: true, res: null, target: null, d: 0, side: m.side || 1, dir: m.dir || 1 };
      R.strikeT = 0.2;
    } else if (m.t === 'hit' && host) { st.got.hit++; decide(m); }
    else if (m.t === 'res' && !host) apply(m);
    else if (m.t === 'round' && !host) startRound(+m.n || 1);
    else if (m.t === 'again' && host && st.over) newRound();
    else if (m.t === 'hi') { if (m.name) { R.name = String(m.name).slice(0, 12); const n = bar.querySelector('#duel-foe-n'); if (n) n.textContent = R.name; } }
    else if (m.t === 'p') send({ t: 'q', ts: m.ts });
    else if (m.t === 'q') st.rtt = Date.now() - m.ts;
  }
  function setConn(c) {
    try { conn && conn.close(); } catch (e) { /* 前の相手 */ }
    conn = c;
    c.on('open', () => {
      st.open = true; say('つながりました'); bar.hidden = false;
      send({ t: 'hi', name: name || rt.G?.name || '' });
      if (host) newRound();
      setTimeout(() => { lobby.hidden = true; }, 900);
    });
    c.on('data', onData);
    c.on('close', () => { st.open = false; lobby.hidden = false; say(host ? '相手が切れました。待っています' : '切れました'); });
  }

  // ---- 毎コマ（duelDef.update から） ----
  D = {
    rt,
    tick() {
      const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
      // 相手の分身を受けた位置へ滑らかに寄せる（AI では動かさない）
      const k = Math.min(1, dt * 14);
      R.pos.x += (remote.x - R.pos.x) * k; R.pos.z += (remote.z - R.pos.z) * k; R.pos.y = rt.world.heightAt(R.pos.x, R.pos.z);
      let dh = remote.h - R.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); R.heading += dh * k;
      g.anchor = { x: remote.x, z: remote.z };
      R.target = null; R.atk = null; R.bind = null;
      if (remote.g) R.guarding = Math.max(R.guarding || 0, 0.2);
      if (!st.open) return;
      if (now - lastMe >= ME_MS) {
        lastMe = now; st.sent.me++;
        send({ t: 'me', x: Math.round(U.pos.x * 100) / 100, z: Math.round(U.pos.z * 100) / 100, h: Math.round(U.heading * 100) / 100, g: P.guard || U.guard ? 1 : 0 });
      }
      // 自分が振り始めた：技と速さを相手へ（携帯の振りなら携帯の速さ）
      const s = U.swing;
      if (s && s !== mySwing) {
        mySwing = s;
        const L = window.__swordLast, ph = !!(L && now - L.at < 500);
        const m = { t: 'sw', k: s.kind, dur: Math.round((s.dur || 0.24) * 1000) / 1000, dir: s.dir || 1, side: s.side || 1, pow: ph ? L.pow : 1, ph };
        st.sent.sw++; st.swSent.push({ k: m.k, pow: m.pow, ph });
        send(m);
      }
      if (now - pingT > 1000) { pingT = now; send({ t: 'p', ts: Date.now() }); }
    },
  };

  // ---- つなぐ（PeerJS。合図の受け渡しだけ公開の所、動きは直に） ----
  (async () => {
    try { await loadScript('./vendor/peerjs.min.js'); } catch (e) { say('部品を読めませんでした'); return; }
    // 受け渡し所を替える時は window.__swordPeerOpts、中継（TURN）を足す時は window.__netIce（[{ urls, username, credential }]）
    const opts = Object.assign({}, window.__swordPeerOpts || {});
    if (window.__netIce) opts.config = { iceServers: window.__netIce };
    const hasOpts = Object.keys(opts).length > 0;
    if (host) {
      peer = hasOpts ? new window.Peer(peerName(room), opts) : new window.Peer(peerName(room));
      peer.on('open', () => { st.ready = true; });
      peer.on('connection', (c) => setConn(c));
      peer.on('error', (e) => { st.err = String(e && e.type || e); say(e && e.type === 'unavailable-id' ? 'この部屋の名は使われています' : 'つなぐ所に届きませんでした'); });
    } else {
      peer = hasOpts ? new window.Peer(opts) : new window.Peer();
      peer.on('open', () => { st.ready = true; setConn(peer.connect(peerName(room), { reliable: true, serialization: 'json' })); });
      peer.on('error', (e) => { st.err = String(e && e.type || e); say(e && e.type === 'peer-unavailable' ? '部屋が見つかりません' : 'つなぐ所に届きませんでした'); });
    }
  })();
  // 自分の携帯も刀に（パソコンの時だけ。QR は左下）
  import('./phone_sword.js').then((m) => { if (m.swordOffered()) m.openSwordPair({ corner: true }); }).catch(() => { /* 携帯なしでもキーとマウスで遊べる */ });
  st.dispose = () => { try { conn && conn.close(); peer && peer.destroy(); } catch (e) { /* 片付け */ } lobby.remove(); bar.remove(); card && card.remove(); D = null; };
  return st;
}
