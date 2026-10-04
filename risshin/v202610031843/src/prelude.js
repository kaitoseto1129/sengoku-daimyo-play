// 開戦の溜め（全戦共通。docs/cinematic-battle-req.md 5・6・20・34・49 項）
// 静けさ（鎧・馬の鼻息）→ 遠景の敵の旗へ 2〜3 秒だけ目を向ける → 使番が走る → 太鼓 → 法螺 → 兵が構える → 敵が詰める
// 戦の定義側で切れる：prelude: false（なし）／prelude: 秒（長さ。既定 15）。本能寺・奇襲の桶狭間などは false か短く。
// 溜めの間は敵の隊を持ち場に留め、筋書きの時計（after）と AI を止める。自分が近づく・斬り合うと、すぐ解く。
import { sfx, signal } from './audio.js';
import { sendOrder } from './denrei.js';
import { S } from './settings.js';

const NEAR = 38;   // 自分がこの近さまで敵に寄ったら、溜めを解く（m）
const BASE = 15;
// 溜めの台本（秒, 行い）。長さが違う戦は、時刻を長さの割合で伸び縮みさせる
const SCRIPT = [
  [1.0, 'snort'], [2.6, 'armor'], [4.2, 'runner'], [6.5, 'drum'], [8.2, 'drum'], [9.9, 'drum'], [10.6, 'susume'], [12.4, 'conch'], [13.2, 'ready'],
];

function begin(rt) {
  const d = rt.def;
  if (d.prelude === false || d.dojo || d.mapCastle || d.town || rt.tut || rt.over) return null;
  const len = typeof d.prelude === 'number' ? d.prelude : BASE;
  if (len < 4) return null;
  const P = rt.player.u, held = [];
  let ex = 0, ez = 0, n = 0, dmin = 1e9;
  for (const g of rt.army.groups) {
    if (g.team === 0 || !(g.count > 0) || g.routed || g.isPlayerSquad || !g.units) continue;
    const c = g.center(), dd = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
    dmin = Math.min(dmin, dd); ex += c.x; ez += c.z; n++;
    held.push({ g, order: g.order, aggro: g.aggro, anchor: g.anchor, c });
  }
  // 敵が見えない・もう近い戦は、溜めても落差が出ない
  if (!n || dmin < NEAR + 25) return null;
  for (const h of held) { h.g.order = 'hold'; h.g.aggro = 0; h.g.anchor = { x: h.c.x, z: h.c.z }; }
  return { t: 0, len, k: len / BASE, held, next: 0, ex: ex / n, ez: ez / n, yaw0: rt.player.yaw, look: 0 };
}

function release(p) {
  for (const h of p.held) if (!h.g.routed && h.g.order === 'hold' && h.g.aggro === 0) { h.g.order = h.order; h.g.aggro = h.aggro; h.g.anchor = h.anchor; }
}

function act(rt, p, what) {
  const P = rt.player.u, dEnemy = Math.hypot(p.ex - P.pos.x, p.ez - P.pos.z);
  switch (what) {
    case 'snort': sfx('snort', 0.45); break;
    case 'armor': sfx('yoroi', 0.4); break;
    case 'runner': {
      // 後ろから自分の隊へ使番が走る（着いても何も起きない）
      const dx = P.pos.x - p.ex, dz = P.pos.z - p.ez, l = Math.hypot(dx, dz) || 1;
      try { sendOrder(rt, { x: P.pos.x + dx / l * 60, z: P.pos.z + dz / l * 60 }, { x: P.pos.x, z: P.pos.z }, { id: 'prelude', apply() {} }, { team: 0, name: '使番' }); } catch (e) { /* 音だけ */ }
      sfx('hooves', 0.5);
      break;
    }
    case 'drum': sfx('taiko', 0.7); break;
    case 'susume': signal('susume', dEnemy, 0.9); break;
    case 'conch': sfx('horagai', 0.7); break;
    case 'ready': sfx('kane', 0.35); sfx('yoroi', 0.5); break;
  }
}

// 毎コマ。溜めの間 true を返す（呼び出し側は、筋書きの時計と AI を止める）
export function preludeTick(rt, dt) {
  if (rt.prelude === undefined) {
    if (rt.t < 0.4) return false;   // 隊が置かれてから
    rt.prelude = begin(rt);
  }
  const p = rt.prelude;
  if (!p || p === 'done') return false;
  p.t += dt;
  while (p.next < SCRIPT.length && SCRIPT[p.next][0] * p.k <= p.t) act(rt, p, SCRIPT[p.next++][1]);
  // 始めの 2〜3 秒だけ敵の旗の方へ目を向け、すぐ自分の向きへ戻す（動きを減らす設定・見せ場の最中・操作中はしない）
  const pl = rt.player, P = pl.u;
  if (!S.reduceMotion && !pl.camShot && !pl.lock) {
    if (p.look === 0 && p.t > 0.6 && !pl.cine) { p.look = 1; pl.cine = { x: p.ex, z: p.ez, t: 2.4 }; }
    else if (p.look === 1 && p.t > 3.2) {
      p.look = 2;
      pl.cine = { x: P.pos.x + Math.sin(p.yaw0) * 60, z: P.pos.z + Math.cos(p.yaw0) * 60, t: 1.0 };
    }
  }
  // 解く：長さを超えた・自分が敵に寄った・斬り合いになった・戦が終わった
  let near = false;
  for (const h of p.held) { const c = h.g.center(); if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < NEAR) { near = true; break; } }
  if (p.t >= p.len || near || pl.inCombatT > 0 || rt.over) {
    release(p);
    sfx('shout', 0.5);
    rt.prelude = 'done';
    return false;
  }
  return true;
}
