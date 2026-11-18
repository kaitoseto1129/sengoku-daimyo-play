// ======================================================================
// 織田編15分の構成（docs/oda15_plan_1108.md・kaito 11/8 夜）の、段のファイルが使う小さな道具。
// 戦の定義の本体を書き換えず、段のファイル（prototype/src/<戦のid>/<段>.js）から呼ぶ。
// ・k15Go：行き先へ歩かせ、着いたら必ず何かを起こす（物見・合流・伝令）。着かなくても limit 秒で進む。
// ・k15Scenes：台詞と出来事を順に流す。
// ・k15Afterglow：勝ちの締め（rt.finish）を遅らせ、最後の30秒の余韻（旗・勝鬨・会話）を入れる。
// ・k15Fade：場面を移す時の暗転（時が飛ぶ・場所が変わる）。
// ・k15Bot：bot が段の行き先へ歩き、寄る敵と斬り合う。
// ======================================================================
import { centerOf } from './bhelp.js';
import { timeSkipGoal } from './center_call.js';

// 行き先へ歩かせる。着いたら fn。右上の一行は 'main' を使う（段の目標は一つずつ）。
export function k15Go(rt, id, pos, r, text, label, fn, o = {}) {
  const F = rt.flags;
  const at = typeof pos === 'function' ? pos : () => pos;
  // 屋内では曲がり角を案内する。到着は最後の目的地で判定する。
  const guide = o.guide || at;
  F.k15at = { id, at: guide, r: o.guide ? 0.6 : r, t0: rt.t, fight: !!o.fight };
  rt.obj('main', text, 'main', true);
  if (o.progress) rt.objProgress('main', o.progress);
  rt.marker('k15', guide, label, { h: o.h || 3, guideAlways: true });
  const tick = () => {
    // 討死から結果待ちまでの間も予約は来る。到着扱いで次の寄せ手を出さない。
    if (rt.over || F.ending || rt.player.u.alive === false || !F.k15at || F.k15at.id !== id) return;
    const p = at(), me = rt.player.u.pos;
    if (!p || (Math.hypot(me.x - p.x, me.z - p.z) < r && (!o.canArrive || o.canArrive())) || rt.t - F.k15at.t0 > (o.limit || 60)) {
      F.k15at = null; rt.unmark('k15'); fn(rt); return;
    }
    rt.after(0.5, tick, true);
  };
  rt.after(0.5, tick, true);
}

// [[秒, fn], …] を順に。秒は前からの間。stop() が true なら止める。
export function k15Scenes(rt, list, done, stop) {
  let i = 0;
  const step = () => {
    if (rt.over || stop?.(rt)) return;
    if (i >= list.length) { done?.(rt); return; }
    const [sec, fn] = list[i++];
    rt.after(sec, () => { if (rt.over || stop?.(rt)) return; fn(rt); step(); }, true);
  };
  step();
}

// 暗転して場面を移す。mid は暗い間に呼ぶ（兵を置き直す・時を進める）。
export function k15Fade(rt, mid, title, sub) {
  rt.scene.visible = false;
  try { mid(rt); } finally { rt.after(0.6, () => { rt.scene.visible = true; if (title) rt.banner(title, sub || ''); timeSkipGoal(rt, title ? 3 : 1); }, true); }
}

// 勝ちの締めを遅らせて余韻を入れる。勝ちの関数を呼ぶ直前に一度。scenes は [[秒, fn], …]（合わせて20〜30秒）。
export function k15Afterglow(rt, scenes) {
  const fin = rt.finish.bind(rt);
  let used = false;
  rt.finish = (info, sec) => {
    if (used || !(info?.scriptedEnd || rt.tracker?.main === true) || info?.failureReason) return fin(info, sec);
    used = true;
    rt.player.u.invuln = true;
    k15Scenes(rt, scenes, () => fin(info, sec));
  };
}

// 隊の生きている者の数
export const k15Live = (gs) => (Array.isArray(gs) ? gs : [gs]).reduce((n, g) => n + (g ? g.units.filter((u) => u.alive && !u.gone && !u.fleeing).length : 0), 0);

// 隊を崩して逃がす（走って去る）
export function k15Rout(rt, g, to) {
  if (!g || g.routed) return;
  const c = g.center(), dx = to.x - c.x, dz = to.z - c.z, L = Math.hypot(dx, dz) || 1;
  g.noRout = false; g.routed = true; g.order = 'flee'; g.fleeDir = { x: dx / L, z: dz / L }; g.fleeSet = true;
  for (const u of g.units) if (u.alive) { u.fleeing = true; u.running = true; u.fleeT = rt.army.time; u.target = null; u.atk = null; u.swing = null; }
}

// 敵の組を本人の方へ寄せる
export function k15Charge(rt, g, at) {
  if (!g) return;
  g.noAI = false; g.fixed = false; g.order = 'attack'; g.aggro = 30; g.seekRange = 40;
  if (at) { g.anchor.x = at.x; g.anchor.z = at.z; }
  if (rt.player.u.alive) g.focus = rt.player.u;
}

// bot：段の行き先があれば歩き、近くで本人を狙う敵（か o.foes の敵）とは斬り合う。扱ったら true。
export function k15Bot(b, inp, { goTo, patientStrike }, o = {}) {
  const F = b.flags, p = b.player, u = p.u;
  if (!F.k15on) return false;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive) return true;
  // 深手の時は共通の頭（退いて手当て）に任せる
  if (u.hp < u.maxHp * 0.4 && !F.k15at?.hold) { inp.quickCmd = null; return false; }
  const ok = (q) => !q.fleeing && !q.woundOut && !q.noTarget && !q.invuln && Math.abs(q.pos.y - u.pos.y) < 3;
  const foe = b.army.nearestEnemy(u, F.k15fight ? 22 : 5, ok);
  if (foe && patientStrike) {
    const d = Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z), reach = p.weapon === 'sword' ? 1.9 : 2.8;
    p.yaw = Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
    if (d > reach * 0.85) goTo(p, inp, foe.pos.x, foe.pos.z, reach * 0.85);
    patientStrike(p, inp, foe, d);
    return true;
  }
  if (p.lock) inp.e.add('KeyQ');
  inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
  const at = F.k15at?.at?.() || o.idle?.(b);
  if (at) goTo(p, inp, at.x, at.z, Math.max(1, (F.k15at?.r || 4) * 0.5));
  return true;
}

export { centerOf };

// 戦の botBrain を包む（段の中だけ k15Bot が動き、ほかは元の頭）
export const k15WrapBot = (orig) => (b, inp, h) => k15Bot(b, inp, h) || orig(b, inp, h);

// 自分の組を本人の近くへ移し、付き従わせる（場面替えの後に置いて行かない）
export function k15Squad(rt, x, z) {
  for (const g of rt.squadGroups || []) {
    if (g.routed) continue;
    g.anchor.x = x; g.anchor.z = z;
    // 日送りでも、倒れた兵・討死の処理中・後送中の兵は元の場所に残す。
    for (const u of g.units) if (u.alive && u.hp > 0 && !u.dying && !u.downed &&
        !u.gone && !u.fleeing && !u.woundOut && !u.rearWound) {
      const at = g.slotPos(u.slot, g.initial);
      u.pos.set(at.x, rt.world.heightAt(at.x, at.z), at.z); u.mesh?.position.copy(u.pos); u.moveTo = null; u.target = null;
    }
    g.order = 'follow'; g.dest = null; g.path = null; g.onArrive = null; g.focus = null;
  }
}

// 段を入れない時（信長で遊ぶ時・確かめで元の流れと比べる時 ?nok15）
export const k15Off = (rt) => !!rt.G?.lord || (typeof location !== 'undefined' && /[?&]nok15\b/.test(location.search));

// 敵の一手を出して斬り合わせ、減るか時が過ぎたら退かせて after。
// o：{ name, faction, at, to, list, label, reward, sec, left, flee, focusPlayer, look }
export function k15Wave(rt, o, after) {
  const F = rt.flags;
  const g = o.make(rt, { fixed: true, name: o.name, faction: o.faction, anchor: o.at, facing: Math.atan2(o.to.x - o.at.x, o.to.z - o.at.z), width: o.width || 4, aggro: 18, morale: 95 }, o.list);
  g.noRout = true;
  o.look?.(g);
  const N0 = k15Live(g), t0 = rt.t;
  F.k15fight = true;
  rt.army.play?.('eshout', o.at, 0.8);
  k15Charge(rt, g, o.to);
  if (!o.focusPlayer) g.focus = null;
  rt.marker('k15foe', centerOf(g), o.label, { red: true, group: g });
  const tick = () => {
    if (rt.over || F.ending) return;
    const left = k15Live(g);
    rt.objProgress('main', `${o.label} ${left}／${N0}`);
    if (left <= (o.left ?? 2) || rt.t - t0 > (o.sec || 100)) {
      k15Rout(rt, g, o.flee || o.at); rt.unmark('k15foe'); F.k15fight = false;
      if (o.reward) rt.award((t) => t.side.push(o.reward), o.reward);
      after?.(g);
      return;
    }
    rt.after(0.5, tick, true);
  };
  rt.after(1, tick, true);
  return g;
}

// 出した一手の残りを数え、減るか時が過ぎたら退かせて done（戦ごとの兵の出し方を使う時）
export function k15Track(rt, g, label, o, done) {
  const F = rt.flags;
  if (!g) { rt.after(1, () => { if (!rt.over && !F.ending && rt.player.u.alive !== false) done?.(); }, true); return; }
  const N0 = k15Live(g), t0 = rt.t;
  F.k15fight = true;
  rt.marker('k15foe', centerOf(g), label, { red: true, group: g });
  const tick = () => {
    if (rt.over || F.ending || rt.player.u.alive === false) return;
    const left = k15Live(g);
    rt.objProgress('main', `${label} ${left}／${N0}`);
    if (left <= (o.left ?? 1) || rt.t - t0 > (o.sec || 90)) {
      // 残りは退く（次の段へ持ち越して数を積み上げない）
      if (o.flee) k15Rout(rt, g, o.flee); else for (const u of [...g.units]) if (u.alive && !u.gone) rt.army.despawn(u);
      rt.unmark('k15foe'); F.k15fight = false;
      if (o.reward) rt.award((t) => t.side.push(o.reward), o.reward);
      done?.();
      return;
    }
    rt.after(0.5, tick, true);
  };
  rt.after(1, tick, true);
}

// 段の合間に息を整える（長くした戦で、前の段の傷だけで倒れきらないように）
export function k15Heal(rt, k = 0.85) { const u = rt.player.u; if (u.alive) u.hp = Math.max(u.hp, u.maxHp * k); }

// 段の間、前の段の時計（F[key]）を止める（前の段の「何秒たったら失敗・先へ」を、挟んだ段の長さで踏まない）
export function k15Freeze(rt, stage, key = 'pT') {
  const F = rt.flags, t0 = rt.t, base = F[key];
  const keep = () => { if (F.k15stage !== stage || rt.over || F.ending || rt.player.u.alive === false) return; if (base != null) F[key] = base + (rt.t - t0); rt.after(0.5, keep, true); };
  keep();
}
