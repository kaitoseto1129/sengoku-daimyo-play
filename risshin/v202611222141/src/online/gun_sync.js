// 二人の対戦（K580）：鉄砲の撃ちを両方の画面で合わせる（11/21 cloud-31）。
//   弓も同じ形（{ k:'bow', who, n }）。二つの画面はそれぞれ戦を計算している（cloud-26 の合わせは兵の数と位置を毎秒そろえる）。鉄砲はそれぞれの画面で勝手に撃つので、
//   A が撃った数と、B の画面で見える A の撃ちが合わなかった（60秒で 26 発／20 発・撃つ刻が十〜二十秒ずれる）。
//   直し：自分の側（team 0）の発砲を武将ごとに半秒ずつまとめて { k:'gun', who, n } で送る。
//   相手の画面では、その武将の隊（team 1）の鉄砲は自分では撃たず、届いた数だけを込めた筒から揃えて放つ（scriptSalvo）。
//   当たり・討ち取りはその画面の計算のまま（兵の数は 26 の合わせで毎秒そろう）。描く物は鉄砲の束の使い回し（増えない）。
//   練習（両軍 AI・net 無し）では何もしない。tactics.js の tacticsLink から呼ばれる（match.js の一行は同じ）。

export function gunSyncLink(rt, net) {
  const A = rt.army, M = rt.flags?.match;
  if (!A || !net || A.__gunSync) return;
  const G = A.__gunSync = { out: new Map(), outB: new Map(), sendT: 0, sent: 0, got: 0, played: 0, sentB: 0, gotB: 0, playedB: 0 };
  const sonaeOf = (u) => (M?.sonae || []).find((s) => s.b && (s.b.real === u.group || (u.group && u.group.name === s.taisho + 'の騎馬')));
  const base = A.fireGun.bind(A);
  A.fireGun = function (u, t, ...r) {
    // 相手の画面の武将の隊（team 1）：届いた分（u.__allowShot）だけ撃つ。自分で撃とうとした時は込めたまま待つ
    if (u.team === 1 && !(u.__allowShot > A.time)) { A.lastGun = { u, t, reason: 'sync' }; u.cd = Math.max(u.cd || 0, 0.5); return false; }
    const ok = base(u, t, ...r);
    if (ok && u.team === 0) { const s = sonaeOf(u); if (s) G.out.set(s.taisho, (G.out.get(s.taisho) || 0) + 1); }
    if (ok && u.team === 1) { u.__allowShot = 0; G.played++; }
    return ok;
  };
  // 弓も同じ形（11/21 司令塔）：自分の側の矢を武将ごとに送り、相手の画面の武将の弓は届いた数だけ射る
  const baseShoot = A.shoot.bind(A);
  A.shoot = function (u, t, ...r) {
    if (u.team === 1 && !u.isPlayer && u.type === 'bow' && !(u.__allowShot > A.time)) { u.cd = Math.max(u.cd || 0, 0.5); return false; }
    const ok = baseShoot(u, t, ...r);
    if (ok && u.team === 0 && u.type === 'bow') { const s = sonaeOf(u); if (s) G.outB.set(s.taisho, (G.outB.get(s.taisho) || 0) + 1); }
    if (ok && u.team === 1 && u.type === 'bow') { u.__allowShot = 0; G.playedB++; }
    return ok;
  };
  if (net.recv) net.recv((m) => { if (m && m.k === 'gun') replay(rt, m); else if (m && m.k === 'bow') replayBow(rt, m); });
  G.flush = () => {
    if ((!G.out.size && !G.outB.size) || !net.send) return;
    for (const [who, n] of G.out) { try { net.send({ k: 'gun', who, n }); G.sent += n; } catch (e) { /* 送れなくても自分の画面は撃つ */ } }
    G.out.clear();
    for (const [who, n] of G.outB) { try { net.send({ k: 'bow', who, n }); G.sentB += n; } catch (e) { /* 同じ */ } }
    G.outB.clear();
  };
}

// 半秒ごとにまとめて送る（tactics.js の tacticsTick から呼ぶ）
export function gunSyncTick(rt, dt) {
  const G = rt.army?.__gunSync;
  if (!G || (G.sendT -= dt) > 0) return;
  G.sendT = 0.5;
  G.flush();
}

function replay(rt, m) {
  const A = rt.army, G = A.__gunSync, M = rt.flags?.match;
  const s = (M?.sonae || []).find((q) => q.team === 1 && q.taisho === m.who);
  if (!s || !s.b) return;
  G.got += m.n;
  const gs = [s.b.real, ...A.groups.filter((g) => g.name === s.taisho + 'の騎馬')].filter((g) => g && g.count && !g.routed);
  const mine = A.groups.filter((g) => g.team === 0 && g.count && !g.routed);
  // 込めた筒から n 挺を選び、一挺ずつ一番近い自分の側の兵へ放つ（半秒の内にばらす）。込めた筒が足りなければ、込め直し中の筒も撃たせる
  //   （相手の画面では込めが終わっているので、ここで待つと数が減る。scriptSalvo では選んだ筒と撃つ筒がずれて三割が撃てなかった）
  const foesU = A.units.filter((o) => o.alive && o.team === 0 && !o.isStruct && !o.noTarget);
  const guns = [];
  for (const g of gs) for (const u of g.units) if (u.alive && u.type === 'gun' && !u.sidearm && !u.mounted) guns.push(u);
  guns.sort((a, b) => (a.reload ? 1 : 0) - (b.reload ? 1 : 0));
  for (let i = 0; i < Math.min(m.n, guns.length); i++) {
    const u = guns[i];
    let t = null, bd = 260;   // 両方の画面で兵の位置が百m 余りずれる（26 の合わせ）。届く的が無くても数と刻は合わせる
    for (const o of foesU) { const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d < bd) { bd = d; t = o; } }
    if (!t) continue;
    const fire = () => { if (!u.alive || !t.alive) return; u.reload = null; u.cd = 0; u.atk = null; u.__allowShot = A.time + 1; u.heading = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); if (A.fireGun(u, t)) A.startReload?.(u); };
    if (rt.after) rt.after(Math.random() * 0.45, fire); else fire();
  }
}

// 確かめの道具が読む：送った数・届いた数・相手の画面で放てた数
export function gunSyncStats(rt) { const G = rt.army?.__gunSync; return G ? { sent: G.sent, got: G.got, played: G.played, sentB: G.sentB, gotB: G.gotB, playedB: G.playedB } : null; }

// 弓：届いた数だけ、その武将の隊の弓から一張ずつ一番近い自分の側の兵へ射る（半秒の内にばらす）
function replayBow(rt, m) {
  const A = rt.army, G = A.__gunSync, M = rt.flags?.match;
  const s = (M?.sonae || []).find((q) => q.team === 1 && q.taisho === m.who);
  if (!s || !s.b) return;
  G.gotB += m.n;
  const gs = [s.b.real, ...A.groups.filter((g) => g.name === s.taisho + 'の騎馬')].filter((g) => g && g.count && !g.routed);
  const foesU = A.units.filter((o) => o.alive && o.team === 0 && !o.isStruct && !o.noTarget);
  const bows = [];
  for (const g of gs) for (const u of g.units) if (u.alive && u.type === 'bow' && !u.sidearm) bows.push(u);
  for (let i = 0; i < Math.min(m.n, bows.length); i++) {
    const u = bows[i];
    let t = null, bd = 260;
    for (const o of foesU) { const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d < bd) { bd = d; t = o; } }
    if (!t) continue;
    const fire = () => { if (!u.alive || !t.alive) return; u.cd = 0; u.atk = null; u.__allowShot = A.time + 1; u.heading = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); A.shoot(u, t); };
    if (rt.after) rt.after(Math.random() * 0.45, fire); else fire();
  }
}
