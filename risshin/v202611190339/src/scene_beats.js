// 一つの戦に、いくつもの場面を詰める（台帳 K306・kaito 11/14「漫画くらい濃く。戦一つで4つ5つの戦が書けるくらいの中身に」）。
// 戦の定義に beats を並べると、段の合間に短い場面が差し込まれる。任務の札・字は増やさない（Simple の決まり）。兵の動きで見せる。
//   { kind: 'skirmish', when(rt), at(rt) → {x,z}, n, side: 'E'|'A', dmg, life, say: [[話し手, 文, 秒]], opts: {組の作りに足す物（spawnPointOK 等）} }
//       小競り合い：小さな組が出て斬り合い、半分討たれるか life 秒で崩れて逃げる（崩れ）。逃げた者は離れたら消える。
//   { kind: 'rout', when(rt), r, chase }  崩れ：本人の r m 内の敵を一度に逃げ散らせ、chase なら味方の組をその背へ掛からせる（追い討ち）。
//   { kind: 'volley', when(rt), at(rt) → {x,z}, n, sound }  物見・小競り合いの合図：遠くからの鉄砲の一斉の音と煙だけ（兵は出さない）。sound を書くとその音だけ（煙なし）。
// どの場面も一度だけ。戦の終わり・負けの後は動かない。本物の兵の上限（cap）の内でしか出さない。
const FOOT = new Set(['ashigaru', 'samurai', 'gun', 'bow']);

function liveDress(rt, team) {
  const T = rt._tpl && rt._tpl[team ? 'E' : 'A'];
  if (T && T.list && T.list.length) return T;
  for (const g of rt.army.groups) {
    if (g.routed || g.team !== team || g.isPlayerSquad) continue;
    const u = g.units.find((v) => v.alive && !v.name && FOOT.has(v.type));
    if (u) return { o: { faction: g.faction, flag: typeof u.flag === 'string' ? u.flag : undefined }, list: [{ type: 'ashigaru', n: 4 }, { type: 'samurai', n: 1 }] };
  }
  return null;
}

function scaled(T, n) {
  const sum = T.list.reduce((a, e) => a + (e.n || 1), 0) || 1;
  return T.list.map((e) => ({ ...e, n: Math.max(1, Math.round((e.n || 1) * n / sum)) }));
}

function okAt(rt, me, p) {
  if (rt.world.walkable && rt.world.walkable(p.x, p.z) === false) return false;
  return !rt.army.wallBetween || !rt.army.wallBetween(me.pos, -1, p);
}

export function sceneBeats(rt, enemyGroup, allyGroup) {
  const B = rt.def && rt.def.beats, me = rt.player && rt.player.u;
  if (!B || !me || !me.alive || rt.over || rt.flags.ending) return;
  if (typeof location !== 'undefined' && /[?&]nobeats\b/.test(location.search)) return;   // 前後の比べ専用
  const S = rt.flags._beats || (rt.flags._beats = { t: 0, s: B.map(() => ({ st: 0 })) });
  if (S.t > rt.t) return;
  S.t = rt.t + 0.5;
  // 任務の段（def.missionOf）と、その段に入ってからの秒。inStage(k, 秒) で使う
  let m = -1; try { m = rt.def.missionOf ? rt.def.missionOf(rt) : -1; } catch (e) { m = -1; }
  if (m !== S.m) { S.m = m; S.mT = rt.t; }
  let n = 0; for (const u of rt.army.units) if (u.alive && !u.gone && !u.isStruct && !u.civ && !u.noTarget) n++;   // 戦う兵だけ数える
  const cap = (rt.def.cap || 250) + 80;   // 小競り合いは三十秒ほどで消える組なので、上限（建物・人足・町の者を含む数）の上まで許す
  B.forEach((b, i) => {
    const s = S.s[i];
    if (s.st === 0) {
      if (!b.when(rt)) return;
      s.st = 1; s.t0 = rt.t;
      for (const [who, text, at] of b.say || []) rt.after(at || 0, () => { if (!rt.over) rt.say(who, text, 3); });
      if (b.kind === 'skirmish') {
        const team = b.side === 'A' ? 0 : 1, T = liveDress(rt, team), p = b.at(rt);
        if (!T || !p || n + (b.n || 6) > cap) { s.st = 3; s.why = !T ? 'dress' : !p ? 'place' : 'cap ' + n; return; }
        const make = team ? enemyGroup : allyGroup;
        s.g = make(rt, { ...T.o, team, name: b.name || (team ? '物見の組' : '味方の物見'), anchor: { x: p.x, z: p.z }, fixed: true, order: 'attack', aggro: 18, seekRange: 40, width: 3, morale: 70, dmgMult: b.dmg ?? 0.5, ...(b.opts || {}) }, scaled(T, b.n || 6));
        if (s.g) { s.g.isBeat = true; s.n0 = s.g.count || s.g.units.length; if (team) s.g.focus = me; }   // 刃の浅い小勢なので本人へ掛からせる（立ち尽くさない）
        else s.st = 3;
      } else if (b.kind === 'volley') {
        const p = b.at(rt);
        // sound: 'arrowRain' で弓の一斉（雨で火縄が湿る夜は鉄砲の音と煙を出さない・手取川 11/19）
        if (p) { rt.army.play(b.sound || 'volley', p, 1.1); if (!b.sound && rt.army.smoke) rt.army.smoke(p.x, 2, p.z, 0, 0.5, 2.4); }
        s.st = 3;
      } else if (b.kind === 'rout') {
        const r = b.r || 45;
        for (const g of rt.army.groups) {
          if (g.team === me.team || g.routed || g.isStruct) continue;
          const live = g.units.filter((u) => u.alive && !u.name && u.type !== 'busho' && Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) < r);
          if (!live.length) continue;
          for (const u of live) { u.fleeing = true; u.target = null; }
        }
        if (b.chase) for (const g of rt.army.groups) {
          if (g.team !== me.team || g.routed || g.isPlayerSquad) continue;
          const c = g.center && g.center(); if (!c || Math.hypot(c.x - me.pos.x, c.z - me.pos.z) > 60) continue;
          g.aggro = Math.max(g.aggro || 0, 16); g.seekRange = Math.max(g.seekRange || 0, 40);
        }
        s.st = 3;
      }
      return;
    }
    if (s.st === 1 && s.g) {   // 小競り合いの組：半ば討たれるか時が来たら崩れて逃げる
      const live = s.g.units.filter((u) => u.alive && !u.gone);
      if (!live.length) { s.st = 3; return; }
      if (live.length <= Math.ceil(s.n0 / 2) || rt.t - s.t0 > (b.life || 35)) {
        s.st = 2;
        const dx = live[0].pos.x - me.pos.x, dz = live[0].pos.z - me.pos.z, l = Math.hypot(dx, dz) || 1;
        for (const u of live) { u.fleeing = true; u.target = null; u.moraleFleeDir = { x: dx / l, z: dz / l }; }
        for (const [who, text, at] of b.breakSay || []) rt.after(at || 0, () => { if (!rt.over) rt.say(who, text, 3); });
      }
      return;
    }
    if (s.st === 2 && s.g) {   // 逃げた者は 50m 離れるか 25 秒で消す（任務の残りの敵に数え続けない）
      const late = rt.t - s.t0 > (b.life || 35) + 25;
      for (const u of s.g.units) if (u.alive && !u.gone && (late || Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) > 50)) { try { rt.army.despawn(u); } catch (e) { /* 消せなければそのまま */ } }
      if (!s.g.units.some((u) => u.alive && !u.gone)) s.st = 3;
    }
  });
}

// 場面の置き場：本人から一番近い敵の方へ d m・横へ lat m（敵が見えなければ本人の向きの前）。置けない所なら横へずらして探す
export function aheadOf(rt, d, lat = 0) {
  const me = rt.player && rt.player.u; if (!me) return null;
  let nd = 1e9, f = null;
  for (const u of rt.army.units) { if (!u.alive || u.team === me.team || u.fleeing) continue; const k = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z); if (k < nd) { nd = k; f = u; } }
  let dx, dz;
  if (f && nd > 1) { dx = (f.pos.x - me.pos.x) / nd; dz = (f.pos.z - me.pos.z) / nd; } else { const h = rt.player.yaw ?? me.heading ?? 0; dx = Math.sin(h); dz = Math.cos(h); }
  for (const k of [1, 0.7, 1.35, 0.5]) for (const sh of [0, 10, -10, 20, -20]) {
    const p = { x: me.pos.x + dx * d * k - dz * (lat + sh), z: me.pos.z + dz * d * k + dx * (lat + sh) };
    if (okAt(rt, me, p)) return p;
  }
  return null;
}

// 「任務の k 番目の段に入って after 秒」の時（def.missionOf のある戦）
export const inStage = (k, after = 0) => (rt) => { const S = rt.flags._beats; return !!S && S.m === k && rt.t - S.mT >= after; };
