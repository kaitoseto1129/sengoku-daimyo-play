// 開戦の溜め（全戦共通。docs/cinematic-battle-req.md 5・6・20・34・49 項）
// 静けさ（鎧・馬の鼻息）→ 遠景を 2〜3 秒 → 使番 → 太鼓 → 法螺 → 構え → 鉄砲隊 → 敵が詰める
// 戦の定義側で切れる：prelude: false（なし）／prelude: 秒（10〜30、既定 15）。本能寺・奇襲の桶狭間などは false。
// 溜めの間は敵の隊を持ち場に留め、筋書きの時計（after）と AI を止める。自分が近づく・斬り合うと、すぐ解く。
import { sfx } from './audio.js';
import { sendOrder } from './denrei.js';
import { S } from './settings.js';

const NEAR = 38;   // 自分がこの近さまで敵に寄ったら、溜めを解く（m）
const BASE = 15;
const WHISPERS = ['槍を離すな。', '合図まで待て。', 'もう来るぞ……。'];
// 溜めの台本（秒, 行い）。長さが違う戦は、時刻を長さの割合で伸び縮みさせる
const SCRIPT = [
  [1.0, 'snort'], [2.6, 'armor'], [4.2, 'runner'], [6.5, 'drum'], [8.2, 'drum'], [9.9, 'drum'], [10.6, 'conch'], [12.4, 'ready'], [14.0, 'fire'],
];

function begin(rt) {
  const d = rt.def;
  if (d.prelude === false || d.dojo || d.mapCastle || d.town || rt.tut || rt.over) return null;
  const requested = typeof d.prelude === 'number' ? d.prelude : BASE;
  if (!Number.isFinite(requested) || requested < 4) return null;
  const len = Math.max(10, Math.min(30, requested));
  const P = rt.player.u, held = [];
  let ex = 0, ez = 0, n = 0, dmin = 1e9;
  for (const g of rt.army.groups) {
    if (g.team === 0 || !(g.count > 0) || g.routed || g.isPlayerSquad || g.isRunner || g.people || !g.units) continue;
    const c = g.center(), dd = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
    dmin = Math.min(dmin, dd); ex += c.x; ez += c.z; n++;
    held.push({ g, order: g.order, aggro: g.aggro, anchor: g.anchor, c });
  }
  // 敵が見えない・もう近い戦は、溜めても落差が出ない
  if (!n || dmin < NEAR + 25) return null;
  // 味方も列を保って待つ。使番・民・移動を演じる者には触れない。
  for (const g of rt.army.groups) {
    if (g.team !== 0 || !(g.count > 0) || g.routed || g.isRunner || g.people || !g.units) continue;
    const c = g.center();
    held.push({ g, order: g.order, aggro: g.aggro, anchor: g.anchor, c });
  }
  for (const h of held) { h.g.order = 'hold'; h.g.aggro = 0; h.g.anchor = { x: h.c.x, z: h.c.z }; }
  const p = { t: 0, len, k: len / BASE, held, next: 0, ex: ex / n, ez: ez / n, yaw0: rt.player.yaw, look: 0, soldiers: [], standing: false, talkAt: 2, line: 0 };
  for (const h of held) for (const u of h.g.units) {
    if (!u.alive || u.isPlayer || u.isStruct || u.name || u.isSub || u.perch || u.loopP || u._crouch || u.type === 'dummy' || u.type === 'porter' || u.atk || u.swing || u.fleeing) continue;
    u.jinchu = p; u.target = null; u.watch = null; u.aiT = 0;
    p.soldiers.push(u);
  }
  return p;
}

function stand(p) {
  p.standing = true;
  for (const u of p.soldiers) if (u.idl) { u.idl.sitW = 0; u.idl.sitT = 12; u.idl.a = null; }
}

function releaseGroup(h) {
  if (h.released) return;
  h.released = true;
  if (!h.g.routed && h.g.order === 'hold' && h.g.aggro === 0) { h.g.order = h.order; h.g.aggro = h.aggro; h.g.anchor = h.anchor; }
}

function release(p) {
  stand(p);
  for (const u of p.soldiers) { if (u.jinchu === p) u.jinchu = null; u.aiT = 0; }
  for (const h of p.held) releaseGroup(h);
}

function act(rt, p, what) {
  const P = rt.player.u;
  switch (what) {
    case 'snort': {
      let horse = null, dist = 35;
      for (const u of rt.army.units) if (u.alive && u.mounted && u.horse) {
        const dd = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
        if (dd < dist) { horse = u; dist = dd; }
      }
      if (horse) rt.army.play('snort', horse.pos, 0.45);
      break;
    }
    case 'armor': sfx('yoroi', 0.4); break;
    case 'runner': {
      // 後ろから自分の隊へ使番が走る（着いても何も起きない）
      const dx = P.pos.x - p.ex, dz = P.pos.z - p.ez, l = Math.hypot(dx, dz) || 1;
      // 次の太鼓までに姿が届く距離。山道では徒歩の使番を生かす。
      const back = (rt.def.noHorse ? 4.5 : 9) * 2.3 * p.k;
      try { sendOrder(rt, { x: P.pos.x + dx / l * back, z: P.pos.z + dz / l * back }, P, { id: 'prelude', apply() {} }, { team: 0, name: '使番' }); } catch (e) { /* 使番の枠がなくても段取りは続ける */ }
      break;
    }
    case 'drum': sfx('taiko', 0.7); break;
    case 'conch': stand(p); sfx('horagai', 0.7); break;
    case 'ready': sfx('yoroi', 0.5); break;
    case 'fire':
      // 鉄砲隊だけ先に解く。射程・射線・弾込め・雨の不発は普段の判断に任せる。
      // 鉄砲のない戦には架空の銃声を足さず、槍の寄せへつなぐ。
      for (const h of p.held) {
        if (!h.g.isGun || h.g.holdFire || h.g.fire === false) continue;
        releaseGroup(h);
        for (const u of h.g.units) if (u.jinchu === p) { u.jinchu = null; u.aiT = 0; }
      }
      break;
  }
}

// 題の札より先に決め、最初の遠景と溜めの見回しを重ねない。
export function preludeStart(rt) { rt.prelude = begin(rt); }

// 毎コマ。溜めの間 true を返す（呼び出し側は、筋書きの時計と AI を止める）
export function preludeTick(rt, dt) {
  if (rt.prelude === undefined) {
    if (rt.t < 0.4) return false;   // 隊が置かれてから
    rt.prelude = begin(rt);
  }
  const p = rt.prelude;
  if (!p || p === 'done') return false;
  p.t += dt;
  const pl = rt.player, P = pl.u;
  // 危険なら次の合図より先に解く。操作して近づいた時の戦いを待たせない。
  let near = false;
  for (const h of p.held) { if (h.g.team === 0) continue; const c = h.g.center(); if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < NEAR) { near = true; break; } }
  if (near || p.danger || pl.inCombatT > 0 || rt.over) {
    release(p);
    rt.prelude = 'done';
    return false;
  }
  rt.ambLineT = rt.t;   // 待つ間の呟きはここにそろえ、通常のざわめきと重ねない。
  // 全体で八秒あける。大事な台詞の間と、遠い陣では声を出さない。
  if (!p.standing && p.t >= p.talkAt && (rt.soldierCallT ?? -99) + 8 <= rt.t && !rt.hud.subQ.length) {
    p.talkAt = p.t + 8;
    let speaker = null, dist = 12;
    for (const u of p.soldiers) {
      if (!u.alive || u.mounted || u.jinchu !== p || u.team !== 0 || u.target || u.atk) continue;
      const dd = Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z);
      if (dd < dist) { speaker = u; dist = dd; }
    }
    if (speaker) {
      rt.soldierCallT = rt.t;
      rt.army.play('jinchuWhisper', speaker.pos, 0.5);
      rt.bark(`足軽「${WHISPERS[Math.min(p.line++, WHISPERS.length - 1)]}」`);
      if (speaker.idl) { speaker.idl.a = 'talk'; speaker.idl.k = 0; speaker.idl.d = 2; speaker.idl.tw = 0.4; speaker.idl.talk = true; }
    }
  }
  while (p.next < SCRIPT.length && SCRIPT[p.next][0] * p.k <= p.t) act(rt, p, SCRIPT[p.next++][1]);
  // 始めの 2〜3 秒だけ敵の旗の方へ目を向け、すぐ自分の向きへ戻す（動きを減らす設定・見せ場の最中・操作中はしない）
  if (!S.reduceMotion && !rt.def.noDespair && !rt.def.world?.mist && !pl.camShot && !pl.lock && !pl.aiming && pl.lookIdle > 0.7) {
    if (p.look === 0 && p.t > 0.6 && p.t < 1.2 && !pl.cine) { p.look = 1; pl.cine = { x: p.ex, z: p.ez, t: 2.4 }; }
    else if (p.look === 1 && p.t > 3.2) {
      p.look = 2;
      pl.cine = { x: P.pos.x + Math.sin(p.yaw0) * 60, z: P.pos.z + Math.cos(p.yaw0) * 60, t: 1.0 };
    }
  }
  if (p.t >= p.len) {
    release(p);
    sfx('shout', 0.5);
    rt.prelude = 'done';
    return false;
  }
  return true;
}
