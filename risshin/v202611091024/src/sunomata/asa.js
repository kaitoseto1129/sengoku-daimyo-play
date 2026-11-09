// ======================================================================
// 墨俣 13〜15分：夜明け（三の手の終わり）
//   三の手の刻限（本体の finishAt）を過ぎて夜が白むと、柵の外で竹束の陰に立ち往生した寄せ手（物見・夕の寄せ）は、
//   明るくなって砦の鉄砲と弓に狙われるのを嫌って退く（『信長公記』：墨俣の守りは固まり、斎藤方は手を出せなかった）。
//   三の手の旗印（北）と寄せ大将の備（西）は本体の目標どおり。刻限から二分たっても決まらなければ、
//   北と西の寄せを柵へ進め直す。旗印・伏兵・寄せ大将の戦果は実際の接敵と討死で判定する。
// ======================================================================
import { sfx } from '../audio.js';

const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;
// 砦は四角い。中心からの距離では、柵の内の四隅まで柵外と判定してしまう。
const outside = (u, fort) => Math.max(Math.abs(u.pos.x), Math.abs(u.pos.z)) > fort + 4;

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
    if (!us.length || us.some((u) => u.target?.alive && (!u.target.pos || Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 4))) continue;
    if (us.every((u) => outside(u, C.FORT)) && us.every((u) => Math.hypot(u.pos.x, u.pos.z) < C.FORT + 40)) { g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.fleeSet = true; g.fleeDir = { x: 0, z: -1 }; n++; }
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
      if (c.z > 44) r.path.push([-60, 44]);
      if (c.z > 24) r.path.push([-C.FORT - 12, 24]);
      r.path.push([-C.FORT - 12, 10]);
      // 元の到着処理が実際の到着を知らせる。討たれた伏兵を復活させない。
      last.t = rt.t;
    }
  }
  // 人足が皆討たれて破れた柵を直す手が無い時は、前野の足軽が杭を打ち直す（直す者がいないまま夜明けで止まらない）
  if (late >= 60 && F.w3Clear && !F.buildBusy && !v.asaFix && (F.segs || []).some((q) => !q.alive) && !(F.wk?.units || []).some(ready)) {
    v.asaFix = rt.t;
    rt.say('前野長康', '人足が討たれた。わしらの手で杭を打ち直すぞ！', 3);
    rt.after(15, () => {
      if (rt.over || F.won || F.ending) return;
      for (const q of F.segs || []) if (!q.alive) {
        if (rt.army.falling) rt.army.falling = rt.army.falling.filter((f) => f.s !== q);
        rt.army.structTilt?.(q, 0);
        q.wearLv = 0; q.tiltA = 0; q.knock = 0;
        q.alive = true; q.hp = q.maxHp; q.building = false; if (q.mesh) q.mesh.visible = true;
        if (q.stumps) { rt.scene.remove(q.stumps); q.stumps = null; }
      }
      rt.army.play?.('knock', { x: 0, z: -C.FORT }, 0.8);
      rt.say('足軽', '柵を結び直したぞ！', 2.4);
    });
  }
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
