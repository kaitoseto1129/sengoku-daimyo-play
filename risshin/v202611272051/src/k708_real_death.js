// K708（kaito 11/26「本当に撃たれた時以外に倒すのはダメ」「その分もっと鉄砲とかが打たれるように」）：全戦共通の倒れの関所。
//   兵が倒れるのは、本物の敵の弾・矢・刃（と投げた石・落ちた梯子など本当に起きた物）が当たった時だけ。
//   army.kill は、当たりの道（弾・矢・振り・騎馬の踏み）の中から呼ばれた時だけ倒す。筋書き・数の帳尻・見せかけの突然の死から呼ばれた倒しは、
//   ここで止めて「本物の撃ち手・斬り手に本当に撃たせる・斬らせる」へ置き換える（当たれば倒れる＝その一撃は必ず討つ・外れれば生きる）。
//   撃てる敵が近くに居なければ倒れない。倒れた兵ごとに「誰の何で」を army.k708.log に残す（確かめの道具が読む・画面には出さない）。
//   ?k708=0 で前の倒し方（比べる時だけ）。

import { scriptedShotBlocked } from './projectile_cover.js';

export const K708_OFF = typeof location !== 'undefined' && /[?&]k708=0\b/.test(location.search);

// 当たりの道の中の印。army._k708R が 0 より大きい間の倒しだけが本物。
export function realHit(army, fn) {
  army._k708R = (army._k708R || 0) + 1;
  try { return fn(); } finally { army._k708R--; }
}

function book(army) {
  return army.k708 || (army.k708 = { log: [], real: 0, phys: 0, blocked: 0, forced: 0, forcedHit: 0, noShooter: 0, src: Object.create(null) });
}

// 倒しを記録する（誰の何で）。how：'gun'|'arrow'|刃の技|'rock' など
export function k708Note(army, t, src, how) {
  const K = book(army);
  const L = t.lastHit || {};
  const w = how || t.hitKind || L.wkind || (src?.type === 'gun' ? 'gun' : src?.type === 'bow' ? 'arrow' : 'blade');
  if (K.log.length < 4000) K.log.push({ t: +(army.time || 0).toFixed(1), id: t.id, team: t.team, by: src?.id ?? null, byTeam: src?.team ?? null, byType: src?.type || null, byName: src?.name || null, w, d: src?.pos ? +Math.hypot(src.pos.x - t.pos.x, src.pos.z - t.pos.z).toFixed(1) : null });
  K.real++;
  if (t._k708Doom) { K.forcedHit++; t._k708Doom = null; }
}

// 当たりの道でない倒しの呼び元の目印（確かめで、どの作りが見せかけの倒しを呼んだかを数える）
function caller() {
  const s = new Error().stack || '';
  const ls = s.split('\n');
  for (let i = 3; i < ls.length; i++) {
    const m = /\/src\/([\w/.-]+\.js):(\d+)/.exec(ls[i]);
    if (m && !/k708_real_death|army_combat/.test(m[1])) return m[1] + ':' + m[2];
  }
  return '?';
}

// K708 に足す：撃ち手の筒先から十m の内に、味方の体が射線に掛かっているか（三段に並んだ後ろの列の弾は前の列の味方の背に止まる。そういう者には撃たせない）
function allyInLine(army, o, t) {
  const dx = t.pos.x - o.pos.x, dz = t.pos.z - o.pos.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  let hit = false;
  army.forNear(o.pos.x + ux * 5, o.pos.z + uz * 5, 5.5, (q) => {
    if (hit || q === o || q === t || !q.alive || q.gone || q.team !== o.team || q.isStruct) return;
    const px = q.pos.x - o.pos.x, pz = q.pos.z - o.pos.z, along = px * ux + pz * uz;
    if (along < 0.4 || along > Math.min(10, L - 0.5)) return;
    if (Math.abs(px * uz - pz * ux) < (q.mounted ? 0.65 : 0.4)) hit = true;
  });
  return hit;
}

// 撃てる・斬れる本物の敵を探す。好み：呼び元が名指しした src → 近い鉄砲（百m・見通し）→ 弓（八十m）→ 刃の届く者
function attackerFor(army, t, src) {
  const ok = (o) => o && o.alive && !o.gone && !o.isStruct && !o.isPlayer && o.pos && o.team !== t.team && !o.fleeing && !o.civ && !o.downed && !o.dying && o.type !== 'dummy' && o.type !== 'porter';
  const reachOf = (o) => (o.reach || 1.6) + 0.5;
  const can = (o) => {
    const d = Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z);
    // 弾・矢は、的の手前の竹束・柵・塀に遮られない撃ち手だけ（遮られた一発は柵に当たって終わる）
    if (o.type === 'gun' && !o.sidearm && !o.mounted && d <= 98 && (o.gunAmmo ?? 20) > 0) return army.wallBetween?.(o.pos, -1, t.pos) || scriptedShotBlocked(army, o, t) || allyInLine(army, o, t) ? 0 : 1;
    if (o.type === 'bow' && !o.sidearm && !o.mounted && d <= 80 && d >= 6 && (o.arrowAmmo ?? 24) > 0) return scriptedShotBlocked(army, o, t) ? 0 : 2;
    if (d <= reachOf(o) && !army.wallBetween?.(o.pos, o.team, t.pos)) return 3;
    return 0;
  };
  if (ok(src)) { const k = can(src); if (k) return { a: src, k }; }
  let best = null, bk = 0, bd = 1e9;
  army.forNear(t.pos.x, t.pos.z, 100, (o) => {
    if (!ok(o)) return;
    const k = can(o); if (!k) return;
    const d = Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z);
    if (d < bd) { bd = d; best = o; bk = k; }
  });
  return best ? { a: best, k: bk } : null;
}

// army.kill の入口から呼ぶ。true を返したら倒しを止める（本物の一撃に置き換えた・撃てる者がいない）
export function k708Gate(army, t, src) {
  if (K708_OFF || army._k708R > 0 || !t || t.isStruct || t.isPlayer || t.type === 'dummy' || t.type === 'porter') return false;
  // 戦の後の片付け・幕の外（戦が終わって消す）は数えない
  if (army.aftermath) return false;
  const K = book(army);
  K.blocked++;
  const c = caller(); K.src[c] = (K.src[c] || 0) + 1;
  if (!t.alive || t.gone || !t.pos) return true;
  if (!k708Shoot(army, t, src, true, true)) {
    K.noShooter++;
    // 撃てる・斬れる者がまだ居ない：筋書きが討つと決めた者は、この先に敵の本物の一撃が当たった時に倒れる（九十秒まで）。それまでは倒れない
    t._k708Doom = { by: null, any: true, until: army.time + 90 };
    if (t.invuln && !t.isTaisho && !t.mustLive) t._k708Inv = true;
  }
  k708Again(army, t);
  return true;
}

// 11/27 クラウド21（司令塔の頼み）：筋書きが討つと決めた名のある将は、討つ予約（_k708Doom）が四十五〜九十秒で切れると生きたまま残り、
//   「〇〇の討死を待つ」段が止まった（道明寺の又兵衛：頂の段が 275〜340秒・一戦が千八十秒の時切れ）。
//   名のある者だけ、予約が切れて生きていれば六秒ごとに本物の撃ち手・斬り手へ頼み直す（倒れるのは本物の当たりの時だけのまま・五分まで）
function k708Again(army, t) {
  if (!t.name || t._k708Again) return;
  t._k708Again = true;
  const end = army.time + 300;
  let next = army.time + 6;
  (army._salvoQ || (army._salvoQ = [])).push(() => {
    if (!t.alive || t.gone || army.time > end) return true;
    if (army.time < next) return false;
    next = army.time + 6;
    if (t._k708Doom && t._k708Doom.until >= army.time) return false;
    if (!k708Shoot(army, t, null, true, true)) {
      t._k708Doom = { by: null, any: true, until: army.time + 90 };
      if (t.invuln && !t.isTaisho && !t.mustLive) t._k708Inv = true;
    }
    return false;
  });
}

// 本物の撃ち手・斬り手に、t へ本当に一撃を放たせる（弾・矢は飛び、刃は振る）。doom：当たればその一撃で討つ。撃てる者がいなければ false
export function k708Shoot(army, t, src, doom = false, any = false) {
  if (!t || !t.alive || t.gone || !t.pos) return false;
  const K = book(army);
  const f = attackerFor(army, t, src);
  if (!f) return false;
  const { a, k } = f;
  // 討つと決めた相手：この撃ち手・斬り手の本物の当たりが来たら、その一撃で倒れる（外れれば生きる）
  if (doom) {
    t._k708Doom = { by: a, any, until: army.time + (any ? 45 : 12) };
    if (t.invuln && !t.isTaisho && !t.mustLive) t._k708Inv = true;
    K.forced++;
  }
  a.heading = Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
  if (k === 1) {
    // 筋書きが討つと決めた者（any）へは、遮られない鉄砲足軽が五人まで本当に放つ（K708 に足す「もっと鉄砲が撃たれるように」。三人では前の列の味方の体・柵に止まる弾が多く、当たりは三割五分だった。どの一発でも当たれば倒れる・皆外れれば生きる）
    const guns = [a];
    if (any) army.forNear(t.pos.x, t.pos.z, 98, (o) => {
      if (guns.length >= 5 || o === a || !o.alive || o.gone || o.isPlayer || o.team === t.team || o.type !== 'gun' || o.sidearm || o.mounted || o.fleeing || o.reload || (o.gunAmmo ?? 20) <= 0) return;
      if (army.wallBetween?.(o.pos, -1, t.pos) || scriptedShotBlocked(army, o, t) || allyInLine(army, o, t)) return;
      guns.push(o);
    });
    for (const g of guns) {
      const at = army.time + 0.15 + Math.random() * 0.5;
      (army._salvoQ || (army._salvoQ = [])).push(() => {
        if (army.time < at) return false;
        if (g.alive && t.alive && !t.gone) { g.heading = Math.atan2(t.pos.x - g.pos.x, t.pos.z - g.pos.z); g.reload = null; g.cd = 0; if (doom) g._k708Sure = true; const a0 = g.gunAmmo ?? 20; if (army.fireGun(g, t) || (g.gunAmmo ?? 20) < a0) army.startReload?.(g); }
        return true;
      });
    }
  } else if (k === 2) {
    army.shoot?.(a, t);
  } else {
    a.target = t;
    const kind = (a.wpnKind || a.lookWeapon) === 'sword' ? 'kesa' : 'thrust';
    if (!a.swing && army.startSwing) army.startSwing(a, kind, t);
    // 討つと決めた時：刃の届く所の斬り手の振りが届く刻（〇・三秒後）に、まだ届く所に居れば本当に当てる
    if (doom) {
      const at = army.time + 0.3;
      (army._salvoQ || (army._salvoQ = [])).push(() => {
        if (army.time < at) return false;
        if (a.alive && !a.gone && t.alive && !t.gone && Math.hypot(a.pos.x - t.pos.x, a.pos.z - t.pos.z) <= (a.reach || 1.6) + 0.9 && !army.wallBetween?.(a.pos, a.team, t.pos)) {
          realHit(army, () => army.damage(t, Math.max(1, t.hp), a, { kind, pierce: true }));
        }
        return true;
      });
    }
  }
  return true;
}

// army.damage の中：本物の当たりで、討つと決めた撃ち手・斬り手からの一撃なら必ず討つ量にする
export function k708Doomed(army, t, src, amount) {
  const D = t._k708Doom;
  if (!D || !(army._k708R > 0) || D.until < army.time) return amount;
  if (D.by !== src && !(D.any && src && !src.isStruct && src.team !== t.team)) return amount;
  if (t._k708Inv) t.invuln = false;
  return Math.max(amount, t.hp * 1.05 + 1, t.maxHp || 0);
}

// 確かめの道具が読む（画面には出さない）
export function k708Stats(army) {
  const K = army?.k708; const gs = army?.gunStats;
  if (!K) return null;
  const byW = Object.create(null), noSrc = K.log.filter((e) => e.by == null).length;
  for (const e of K.log) byW[e.w] = (byW[e.w] || 0) + 1;
  return { real: K.real, noSrc, blocked: K.blocked, forced: K.forced, forcedHit: K.forcedHit, noShooter: K.noShooter, byW, src: K.src, gun: gs ? gs.map((g) => ({ shots: g.shots, hits: g.hits, kills: g.kills })) : null };
}

// 遠くの押し合い（army_quality.js の考えを省いた兵の損耗）：前は決まった数を間引いて倒していた。
//   今は刃の届く所（体の触れる所）の本物の敵が、その場で本当に一太刀・一突きを入れる（当たり・受け・かわしは strike の決まりのまま）。
//   当たれば討つ（遠くの兵は姿勢を省いているので、振りの姿は付けない）。届く敵がいなければ何も起きない。
//   返り値：0＝届く敵がいない（損耗は取っておき、寄った時に使う）・1＝打ったが倒れない（受けた・かわした）・2＝倒れた
export function k708Melee(army, u, foe) {
  if (!u?.alive || u.gone) return 1;
  let a = null;
  const reach = (o) => (o.reach || 1.6) + 0.6;
  const ok = (o) => o && o.alive && !o.gone && !o.isStruct && !o.isPlayer && o.pos && o.team !== u.team && !o.fleeing && !o.civ && !o.downed && !o.dying && o.type !== 'dummy' && o.type !== 'porter';
  if (ok(foe) && Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z) <= reach(foe)) a = foe;
  else {
    let bd = 1e9;
    army.forNear(u.pos.x, u.pos.z, 3.2, (o) => { if (!ok(o)) return; const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d <= reach(o) && d < bd) { bd = d; a = o; } });
  }
  if (!a || army.wallBetween?.(a.pos, a.team, u.pos)) return 0;
  u._k708Doom = { by: a, until: army.time + 0.5 };
  a.heading = Math.atan2(u.pos.x - a.pos.x, u.pos.z - a.pos.z);
  army.strike(a, u, false, 1, null);
  if (u._k708Doom?.by === a) u._k708Doom = null;
  return u.alive ? 1 : 2;
}
