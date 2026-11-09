// ======================================================================
// 墨俣 13〜15分：夜明け（三の手の終わり）
//   三の手の刻限（本体の finishAt）を過ぎて夜が白むと、柵の外で竹束の陰に立ち往生した寄せ手（物見・夕の寄せ）は、
//   明るくなって砦の鉄砲と弓に狙われるのを嫌って退く（『信長公記』：墨俣の守りは固まり、斎藤方は手を出せなかった）。
//   三の手の旗印（北）と寄せ大将の備（西）は本体の目標どおり。刻限から二分たっても決まらなければ、
//   後詰と前野の槍が旗印の組を押し返し、寄せ大将を討つ（自分が何もしなくても物語は進む・標準 二-5）。
// ======================================================================
import { sfx } from '../audio.js';

const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;

// 一の手・二の手：寄せて二分たっても柵の外で立ち往生している組（竹束の陰で動かない残り）は退く。次の手を止めない
export function waveTick(rt) {
  const F = rt.flags, v = F.s15, C = v.C;
  if (rt.over || F.won || F.ending || !(F.wave === 1 || F.wave === 2)) return;
  const t0 = F.wave === 1 ? F.w1T : F.w2Go ?? F.w1T;
  if (t0 == null || rt.t - t0 < 120 || rt.t < (v.waveNext || 0)) return;
  v.waveNext = rt.t + 8;
  let n = 0;
  for (const g of rt.army.groups) {
    if (g.team !== 1 || g.routed) continue;
    const us = g.units.filter(ready);
    if (!us.length || us.some((u) => u.target?.alive && (!u.target.pos || Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 4))) continue;
    if (us.every((u) => Math.hypot(u.pos.x, u.pos.z) > C.FORT + 4) && us.every((u) => Math.hypot(u.pos.x, u.pos.z) < C.FORT + 40)) { g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.fleeSet = true; g.fleeDir = { x: 0, z: -1 }; n++; }
  }
  if (n) rt.say('前野長康', '柵の外の寄せ手が退いてゆく。追うな、柵を直せ！', 3);
}

export function tick(rt) {
  const F = rt.flags, v = F.s15, C = v.C;
  if (rt.over || F.won || F.ending || F.wave < 3 || !F.finishAt) return;
  const late = rt.t - F.finishAt;
  if (late < 25 || rt.t < (v.asaNext || 0)) return;
  v.asaNext = rt.t + 8;
  const keep = new Set([F.W3a, F.W3b, F.reserveW3a, F.reserveW3b].filter(Boolean));
  let n = 0;
  for (const g of rt.army.groups) {
    if (g.team !== 1 || g.routed || keep.has(g)) continue;
    const us = g.units.filter(ready);
    if (!us.length) continue;
    if (us.every((u) => Math.hypot(u.pos.x, u.pos.z) > C.FORT + 4)) { g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.fleeSet = true; g.fleeDir = { x: 0, z: -1 }; n++; }
  }
  if (n && !v.asaSaid) { v.asaSaid = true; sfx('horagai', 0.6); rt.say('足軽', '夜が白んで来た……柵の外の寄せ手が退いてゆくぞ！', 3.2); }
  if (late < 120 || v.asaLast) return;
  v.asaLast = true;
  // 二分の保険：後詰と前野の槍が押し返す
  F.reinforceArrived = true;
  const g = F.W3a;
  if (g && !g.routed && g.units.some(ready)) { F.northAtFence = true; g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.fleeSet = true; g.fleeDir = { x: 0, z: -1 }; }
  const B = F.W3b;
  if (B) for (const u of B.units) if (ready(u) && u !== F.yoseBoss) { u.fleeing = true; u.target = null; u.atk = null; }
  const boss = F.yoseBoss;
  if (ready(boss)) {
    let k = null, bd = 1e9;
    for (const u of rt.army.units) if (ready(u) && u.team === 0 && !u.isPlayer) { const d = (u.pos.x - boss.pos.x) ** 2 + (u.pos.z - boss.pos.z) ** 2; if (d < bd) { bd = d; k = u; } }
    boss.invuln = false; rt.army.kill(boss, k);
    rt.say('前野長康', '寄せ大将、前野の手の者が討ち取ったり！', 3);
  }
}
