// ======================================================================
// 墨俣 13〜15分：夜明け（三の手の終わり）
//   三の手の刻限（本体の finishAt）を過ぎて夜が白むと、柵の外で竹束の陰に立ち往生した寄せ手（物見・夕の寄せ）は、
//   明るくなって砦の鉄砲と弓に狙われるのを嫌って退く（『信長公記』：墨俣の守りは固まり、斎藤方は手を出せなかった）。
//   三の手の旗印（北）と寄せ大将の備（西）は本体の目標どおり。刻限から二分たっても決まらなければ、
//   未接敵の隊は柵へ進め直し、接敵と伏兵到着を経た最後の寄せには退却を命じる。
// ======================================================================
import { sfx } from '../audio.js';
import { sunomataNorthStopped, sunomataReliefSpent } from '../sunomata_goals.js';

const ready = (u) => !!u && u.alive && !(u.hp <= 0) && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;
// 砦は四角い。中心からの距離では、柵の内の四隅まで柵外と判定してしまう。
const outside = (u, fort) => Math.max(Math.abs(u.pos.x), Math.abs(u.pos.z)) > fort + 4;
// 柵には pos が無い。的を持つだけで交戦中にせず、柵の線分への実際の距離を測る。
function fighting(u) {
  const t = u.target;
  if (!t?.alive) return false;
  if (t.pos) return Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) < 4;
  if (!t.seg) return false;
  const [ax, az, bx, bz] = t.seg, dx = bx - ax, dz = bz - az;
  const k = Math.max(0, Math.min(1, ((u.pos.x - ax) * dx + (u.pos.z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(u.pos.x - ax - k * dx, u.pos.z - az - k * dz) < 4;
}

// 一の手・二の手：寄せて二分たっても柵の外で立ち往生している組（竹束の陰で動かない残り）は退く。次の手を止めない
export function waveTick(rt) {
  const F = rt.flags, v = F.s15, C = v.C;
  if (rt.over || F.won || F.ending || !(F.wave === 1 || F.wave === 2) || F.foughtWave !== F.wave) return;
  const t0 = F.wave === 1 ? F.w1T : F.w2Go ?? F.w1T;
  if (t0 == null || rt.t - t0 < 120 || rt.t < (v.waveNext || 0)) return;
  v.waveNext = rt.t + 8;
  let n = 0;
  const active = F.wave === 1 ? [F.W1, F.W1b, F.PR1, F.PR2] : [F.W2];
  for (const g of rt.army.groups) {
    if (g.team !== 1 || g.routed || !active.includes(g) && !F.abMore?.['w' + F.wave]?.extra?.includes(g)) continue;
    const us = g.units.filter(ready);
    if (!us.length || us.some(fighting)) continue;
    if (us.every((u) => outside(u, C.FORT))) { g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.fleeSet = true; g.fleeDir = { x: 0, z: -1 }; n++; }
  }
  // 11/10 関所の4：組ごとに八秒おきで同じ声が三度続いた。一つの手で一度だけ言う。
  if (n && v.waveSaid !== F.wave) { v.waveSaid = F.wave; rt.say('前野長康', '柵の外の寄せ手が退いてゆく。追うな、柵を直せ！', 3); }
}

export function tick(rt) {
  const F = rt.flags, v = F.s15, C = v.C;
  if (rt.over || F.won || F.ending || F.wave < 3) return;
  // 寄せ大将を体力で長引かせない（kaito：敵の体力で伸ばさない）。三の手の刻限を待たず、柵へ寄せた時から
  //   （11/9 見回り：刻限の前に柵の内へ入り、体力 456 のまま 1260 秒の打ち切りまで討てなかった）
  const B0 = F.yoseBoss;
  if (B0?.alive && !B0.gone && !v.bossCap && Math.max(Math.abs(B0.pos.x), Math.abs(B0.pos.z)) < C.FORT + 30) {
    v.bossCap = true; B0.maxHp = Math.min(B0.maxHp || 220, 220); B0.hp = Math.min(B0.hp, B0.maxHp);
  }
  if (!F.finishAt) return;
  const late = rt.t - F.finishAt;
  // 北だけが接敵しても、西の最後の攻撃を済ませない。控えで止まった隊は下の経路で柵へ寄せ直す。
  if (!v.westAtFence && F.W3b?.units.some((u) => ready(u) &&
      Math.abs(u.pos.x + C.FORT) < 10 && Math.abs(u.pos.z) < C.FORT + 10)) v.westAtFence = true;
  // 最新の指示書：波には上限を設け、特定の大将の討死だけで止めない。
  // 生きた伏兵は実着を待つ。伏兵も交代の射手も討たれ尽くした時は、到着を偽らず最後の寄せを退かせる。
  // 勝利は本体が砦の安全・柵の修理・点検を確かめてから決める。
  if (late >= 120 && F.foughtWave === 3 && (F.northAtFence || sunomataNorthStopped(F)) &&
      v.westAtFence && (F.reinforceArrived || sunomataReliefSpent(F)) && !v.lastRetreat) {
    v.lastRetreat = true;
    const groups = [F.W3a, F.W3b, F.W3d, F.lastPush, ...(F.boatWaves || []),
      ...(F.duskWaves || []).map((q) => q.group)];
    for (const g of groups) {
      if (!g || g.routed || !g.units.some(ready)) continue;
      g.noAI = false; g.noRout = false; g.morale = 0; g.routed = true;
      g.order = 'flee'; g.fleeSet = true; g.fleeDir = { x: 0, z: -1 };
      g.focus = null; g.onArrive = null;
    }
    rt.say('前野長康', '最後の寄せも退いてゆく。追うな、柵を仕上げるぞ！', 3);
  }
  if (late < 25 || rt.t < (v.asaNext || 0)) return;
  v.asaNext = rt.t + 8;
  const keep = new Set([F.W3a, F.W3b, F.reserveW3a, F.reserveW3b].filter(Boolean));
  let n = 0;
  for (const g of rt.army.groups) {
    if (g.team !== 1 || g.routed || keep.has(g) || g.stay || g.noTarget) continue;
    const us = g.units.filter(ready);
    if (!us.length) continue;
    if (us.every((u) => outside(u, C.FORT))) { g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.fleeSet = true; g.fleeDir = { x: 0, z: -1 }; n++; }
  }
  if (n && !v.asaSaid) { v.asaSaid = true; sfx('horagai', 0.6); rt.say('足軽', '夜が白んで来た……柵の外の寄せ手が退いてゆくぞ！', 3.2); }
  // 時間だけで接敵・伏兵の到着を済ませない。伏兵が止まった時は残る道を歩き直す。
  const r = F.reinforceReserve;
  if (late >= 120 && F.reinforceCalled && !F.reinforceArrived && r && !r.routed && r.units.some(ready)) {
    const c = r.center(), last = v.reinforceStep;
    if (!last || Math.hypot(c.x - last.x, c.z - last.z) > 2) v.reinforceStep = { x: c.x, z: c.z, t: rt.t };
    else if (rt.t - last.t >= 24) {
      r.noAI = false; r.focus = null; r.order = 'path'; r.pathIdx = 0; r.speed = 3;
      r.path = [];
      // 代わりの射手が柵内で止まった時も、最初の下知と同じ南門から出す。
      // 西の横へ直進させると、壊れていない西柵に向かい続けて挟撃が終わらない。
      if (Math.abs(c.x) < C.FORT + 2 && c.z > -C.FORT - 2 && c.z < 24) {
        r.path.push([0, c.z], [0, 24], [-13, 26.5], [-36, 44], [-60, 44], [-C.FORT - 12, 24]);
      } else {
        if (c.z > 44) r.path.push([-60, 44]);
        if (c.z > 24) r.path.push([-C.FORT - 12, 24]);
      }
      r.path.push([-C.FORT - 12, 10]);
      // 元の到着処理が実際の到着を知らせる。討たれた伏兵を復活させない。
      last.t = rt.t;
    }
  }
  // 夜明けの補修も本体の repairFort に任せる。残る味方と砦の安全を確かめ、
  // 敵の再侵入中や修理役の不在時に、時間だけで柵を復旧しない。
  // 寄せ大将を体力で長引かせない（kaito：敵の体力で伸ばさない）。柵の内へ入ったら旗本と踏みとどまり、討ち合う相手として待つ
  const B = F.yoseBoss;
  if (B?.alive && !B.gone) {
    if (!v.bossCap) { v.bossCap = true; B.maxHp = Math.min(B.maxHp || 220, 220); B.hp = Math.min(B.hp, B.maxHp); }
    const g = B.group;
    if (late >= 60 && !v.bossStand && g && !g.routed && Math.max(Math.abs(B.pos.x), Math.abs(B.pos.z)) < C.FORT + 2) {
      v.bossStand = true; g.order = 'hold'; g.anchor = { x: B.pos.x, z: B.pos.z }; g.focus = null; g.seekRange = 6; g.aggro = 6;
      rt.say('足軽', '寄せ大将が柵の内で踏みとどまったぞ！　討ち取れ！', 3);
    }
  }
  if (late < 120 || v.asaLast) return;
  v.asaLast = true;
  // 離れた敵を討死にせず、既存の兵を実際に柵へ歩かせる。進行中の経路は消さない。
  for (const [g, north] of [[F.W3a, true], [F.W3b, false]]) {
    if (!g || g.routed || !g.units.some(ready) || g.order === 'path') continue;
    const c = g.center();
    if (Math.hypot(c.x, c.z) <= C.FORT + 6) continue;
    g.noAI = false; g.focus = null; g.order = 'path'; g.pathIdx = 0;
    g.path = north ? [[c.x, -C.FORT - 20], [0, -C.FORT - 20], [0, -C.FORT - 6]]
      : [[-C.FORT - 20, c.z], [-C.FORT - 20, 0], [-C.FORT - 6, 0]];
    g._sunoMarch = true; g.speed = 3;
    g.onArrive = (q) => { q.order = 'assault'; q.onArrive = null; };
  }
}
