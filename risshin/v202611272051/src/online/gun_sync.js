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
    for (const [who, n] of G.out) { try { net.send({ k: 'gun', who, n }); G.sent += n; (G.sentWho ||= {})[who] = (G.sentWho[who] || 0) + n; } catch (e) { /* 送れなくても自分の画面は撃つ */ } }
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
  // 11/27 cloud-26 と cloud-40 が同じ外れ（A→B 放てた 0）を直していた。26 の形（写しの筒が無い時も・的が 99m 内の時だけ本当に撃つ）に一本化し、40 の far（火と煙だけの発）も数える
  const miss = G.miss || (G.miss = {});
  // 11/27 cloud-26（18 の通しで A→B 92 発・放てた 0）：写しの隊は本人から遠く、描く本物の兵が少ない（A の画面の信長の備は鉄砲 129 挺・B の画面の写しは 5 挺）。
  //   届いた数を挺の数で切ると撃てず、的が 100m より遠いと fireGun が断った（invalid）。一挺に何発分も回し（半秒の内にばらす）、
  //   100m 内に的があれば本当に撃ち、無い・断られた時は筒先の火と煙と音だけ出す（当たりと減りは毎秒の合わせで両方の画面がそろう）
  const shells = guns.length ? guns : (s.b.real?.units || []).filter((u) => u.alive);
  const at = shells.length ? null : { x: s.b.pos.x, y: 1.4, z: s.b.pos.z };
  const near = (u) => { let t = null, bd = 99; for (const o of foesU) { if (!o.alive) continue; const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d < bd) { bd = d; t = o; } } return t; };
  const show = (p, h) => { try { const fx = Math.sin(h || 0), fz = Math.cos(h || 0); A.flash?.(p.x + fx, (p.y || 0) + 1.4, p.z + fz, 1); A.smoke?.(p.x + fx, (p.y || 0) + 1.4, p.z + fz, fx, fz, 1); A.play?.('gun', p, 1.2); } catch (e) { /* 絵や音が無くても数える */ } G.played++; G.far = (G.far || 0) + 1; miss.shown = (miss.shown || 0) + 1; };   // far：40 の道具が読む数（火と煙だけで合わせた発）
  for (let i = 0; i < m.n; i++) {
    const u = shells.length ? shells[i % shells.length] : null, wait = (shells.length ? Math.floor(i / shells.length) * 0.5 : 0) + Math.random() * 0.45;
    const fire = () => {
      if (!u) { show(at, s.b.facing); return; }
      const t = u.alive && u.type === 'gun' ? near(u) : null;
      if (t && t.alive) {
        u.reload = null; u.cd = 0; u.atk = null; u.__allowShot = A.time + 1; u.heading = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
        if (A.fireGun(u, t)) { A.startReload?.(u); return; }
        const r = (A.lastGun && A.lastGun.reason) || 'refused'; miss[r] = (miss[r] || 0) + 1;
      }
      const f = near(u) || foesU[0]; show(u.pos, f ? Math.atan2(f.pos.x - u.pos.x, f.pos.z - u.pos.z) : u.heading);
    };
    if (rt.after) rt.after(wait, fire); else fire();
  }
}

// 確かめの道具が読む：送った数・届いた数・相手の画面で放てた数
export function gunSyncStats(rt) { const G = rt.army?.__gunSync; return G ? { sent: G.sent, got: G.got, played: G.played, sentB: G.sentB, gotB: G.gotB, playedB: G.playedB, miss: G.miss || null } : null; }

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
  if (!bows.length) return;
  // 11/21 cloud-37（悪い回線の真似で弓が 85% しか揃わなかった）：射る矢の数が写しの弓より多い・的が百m より遠い・射る前に的が倒れる・前の味方が塞ぐ時に一本ずつ欠けた。
  //   弓は数より多い矢を一張に二本目から回し（半秒ずつ遅らせ）、射る時に百m 内の生きた的を選び直し、射られなければ次に近い的・次の弓で試す（三度まで）
  const near = (u, skip) => { let t = null, bd = 95; for (const o of foesU) { if (!o.alive || skip.has(o)) continue; const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d < bd) { bd = d; t = o; } } return t; };
  bows.sort((a, b) => { const da = near(a, new Set()), db = near(b, new Set()); return (da ? 0 : 1) - (db ? 0 : 1); });
  for (let i = 0; i < m.n; i++) {
    const fire = () => {
      for (let k = 0; k < 3; k++) {
        const u = bows[(i + k) % bows.length]; if (!u.alive) continue;
        const skip = new Set();
        for (let j = 0; j < 2; j++) {
          const t = near(u, skip); if (!t) break;
          if (u.arrowAmmo !== undefined && u.arrowAmmo <= 0) u.arrowAmmo = 1;   // 持ち主の画面で射た矢（写しの矢の残りで欠けさせない）
          u.cd = 0; u.atk = null; u.__allowShot = A.time + 1; u.heading = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
          if (A.shoot(u, t)) return;
          skip.add(t);
        }
      }
    };
    const at = Math.random() * 0.45 + Math.floor(i / bows.length) * 0.5;
    if (rt.after) rt.after(at, fire); else fire();
  }
}
