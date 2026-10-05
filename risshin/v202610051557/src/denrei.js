// 使番と知らせの広がり（denrei.js）：docs/battle-system-plan.md 第1段・docs/battle-system-spec.md 5・10 章（束3）
// ・sendOrder(rt, from, target, cmd, o)：使番が馬で走って下知を運ぶ。川・柵・塀で止まれば届かない。
//   ふだんは点で動く（見えない）。自分から 80m 内を走る時だけ本物の騎馬一人に替える（本物の枠が空いている時だけ）。
//   道の途中で敵の備の 15m 内に入ると、点ならその備の名目の強さでくじ、本物なら本当に斬られうる。
//   着けば下知を渡す。討たれたら logEvent('runnerLost')。返す R の R.onLost(fn) で総大将の頭が再送できる（束5）。
// ・spread(rt, team, key, at, o)・knows(rt, team, key, who)：出来事が味方に伝わるまでの遅れ。
//   30m 内は即時、同じ備は 3 秒、隣の備は敗走兵が着くか使番で 8〜20 秒、本陣は使番が着いた時。who は備の id か 'honjin'。
// 0.25 秒ごとの一つの輪（rt.after）で回す。毎コマは何もしない。
import { logEvent, onEvent } from './senkyo.js';
import { BUTAI_REAL_CAP } from './butai.js';

export const RUNNER_SPEED = 9;     // 馬の使番の足（m/秒）
const STEP = 0.25;
const NEAR_REAL = 80;              // 自分からこの内を走る時だけ本物の騎馬にする
const CUT_R = 15;                  // 敵の備のこの内を通ると討たれうる
const ARRIVE_R = 3;
const NEWS_KEEP = 40;              // 覚えておく出来事の数

function D(rt) {
  return rt.denrei || (rt.denrei = { runners: [], freeReal: [], news: [], on: false, lastT: 0, said: false, speedMul: [1, 1] });
}

// ---- 場所と生き死に（備・本物の隊・Butai・軽い大軍・{x,z}） ----
function lightArmyPos(A) {
  const m = A.mesh, e = m.matrixWorld && m.matrixWorld.elements;
  const lx = (A.cx || 0) + ((A.off && A.off.x) || 0), lz = (A.cz || 0) + ((A.off && A.off.z) || 0);
  if (!e) return { x: m.position.x + lx, z: m.position.z + lz };
  return { x: e[0] * lx + e[8] * lz + e[12], z: e[2] * lx + e[10] * lz + e[14] };
}
export function posOf(t) {
  if (!t) return null;
  if (t.b && t.b.pos) return t.b.pos;                                    // 備（sonae.js）
  if (typeof t.center === 'function') return t.center();                 // 本物の隊（Group）
  if (t.mesh && t.n != null) return lightArmyPos(t);                     // 軽い大軍（world.js）
  if (t.pos && t.pos.x != null) return t.pos;                            // Butai・兵一人
  if (t.x != null) return t;
  return null;
}
function aliveOf(t) {
  if (!t) return false;
  if (t.b && t.b.aliveNominal) return t.b.aliveNominal() > 0;
  if (typeof t.center === 'function') return t.count > 0;
  if (t.mesh && t.n != null) return !t.rout && (t.n - (t.took || 0)) > 0;
  if (t.aliveNominal) return t.aliveNominal() > 0;
  if (t.alive != null) return !!t.alive;
  return true;
}
function teamOf(t) { return t && t.team != null ? t.team : 0; }

// 本陣の場所：本陣の備 → 総大将（taisho.js）→ 信長で遊ぶ時は自分
function honjinPos(rt, team) {
  for (const S of rt.sonae || []) if (S.team === team && S.line === 'honjin' && S.b.aliveNominal() > 0) return S.b.pos;
  const T = rt.taisho, e = T && (team === 0 ? T.a : T.b);
  if (e && e.u && e.u.alive) return e.u.pos;
  if (team === 0 && rt.player && rt.player.u) return rt.player.u.pos;
  return null;
}

// 本物の兵の数（枠を見る）
function realNow(rt) {
  let n = 0;
  for (const u of rt.army.units) if (u.alive) n++;
  return n;
}

// ---------------- 使番 ----------------
// from：{x,z}・隊・備・兵（出た所）。target：備・本物の隊・Butai・軽い大軍。
// cmd：{ id, …, apply(target) }（apply があればそれで渡す。無ければ target.order(cmd)）
// o：{ team, faction, name, lord（自分が出した下知）, pend（gunbai の残り秒を合わせる物）, onArrive, onLost }
export function sendOrder(rt, from, target, cmd, o = {}) {
  const d = D(rt);
  const p0 = posOf(from) || posOf(target) || { x: 0, z: 0 };
  const R = {
    team: o.team ?? teamOf(target), faction: o.faction || 'oda', name: o.name || '', target, cmd, lord: !!o.lord, pend: o.pend || null,
    x: p0.x, z: p0.z, t0: rt.t || 0, state: 'run', u: null, g: null, cuts: 0,
    _arr: o.onArrive ? [o.onArrive] : [], _lost: o.onLost ? [o.onLost] : [],
    onArrive(fn) { if (R.state === 'done') fn(R); else R._arr.push(fn); return R; },
    onLost(fn) { if (R.state === 'lost') fn(R); else R._lost.push(fn); return R; },
    eta() { const p = posOf(target), q = R.pickup; return p ? (q ? Math.hypot(q.x - R.x, q.z - R.z) + Math.hypot(p.x - q.x, p.z - q.z) : Math.hypot(p.x - R.x, p.z - R.z)) / speed(rt, R.team) : 0; },
  };
  d.runners.push(R);
  logEvent(rt, 'runnerOut', { team: R.team, who: o.who ?? (target && target.id) ?? R.name, v: cmd && cmd.id });
  if (R.pend) R.pend.until = (rt.t || 0) + R.eta();
  loop(rt);
  return R;
}
function speed(rt, team) { const m = D(rt).speedMul[team]; return (rt.def.noHorse ? 4.5 : RUNNER_SPEED) * (m == null ? 1 : m); }
// 本陣を下げる間などに使番の足を変える（束5：0.6 倍）
export function setRunnerSpeed(rt, team, mul) { D(rt).speedMul[team] = mul; }
export function runnersOf(rt) { return D(rt).runners; }

function makeReal(rt, R) {
  if (realNow(rt) >= Math.min(250, BUTAI_REAL_CAP)) return;
  const d = D(rt);
  let active = 0;
  for (const r of d.runners) if (r.u) active++;
  if (active >= 6) return;
  let p = posOf(R.target) || R;
  const i = d.freeReal.findIndex((r) => r.g.team === R.team && r.g.faction === R.faction);
  const spare = i >= 0 ? d.freeReal.splice(i, 1)[0] : null;
  // 同じ騎馬を別の出発点へ飛ばさない。前の到着地から下知を受け取りに走る。
  if (spare) {
    R.pickup = { x: R.x, z: R.z };
    R.x = spare.u.pos.x; R.z = spare.u.pos.z;
    p = R.pickup;
  }
  const face = Math.atan2(p.x - R.x, p.z - R.z);
  const g = spare?.g || rt.army.addGroup({ team: R.team, faction: R.faction, name: '使番', order: 'move', formation: 'column', anchor: { x: R.x, z: R.z }, facing: face, morale: 100, noRout: true, noAI: true, aggro: 0, seekRange: 0 });
  g.isRunner = true;
  g.anchor = { x: R.x, z: R.z };
  g.dest = { x: p.x, z: p.z };
  g.order = 'move';
  let u = spare?.u;
  if (u) {
    // 退場後の使い回しは別の出場。歩みの検査も前の使番から区切る。
    u.appearance = (u.appearance || 0) + 1;
    u.alive = true; u.gone = false; u.hp = u.maxHp; u.target = null; u.heading = face;
    u.vel.x = u.vel.z = 0; u.push.x = u.push.z = 0;
    if (u.mv) u.mv.x = u.mv.z = 0;
    u.fleeing = false; u.stagger = 0; u.aiT = 0;
    u.mesh.position.copy(u.pos); u.mesh.visible = true; rt.scene.add(u.mesh);
  } else {
    // 使番の小隊には武将がいないため、自動の母衣衆にはならない。母衣を明示し、指物は重ねない。
    // 同じ家の使番は退いた騎馬を再利用するので、母衣の形も作り直さない。
    // 馬を使わない山の戦では、使番も徒歩で道を登る。
    [u] = rt.army.spawn(g, [{ type: rt.def.noHorse ? 'ashigaru' : 'cavalry', n: 1, o: { x: R.x, z: R.z, heading: face, flag: null, horo: rt.def.noHorse ? null : R.faction === 'oda' ? 0x9a2418 : 0xd8d0bc } }]);
  }
  if (!u) return;
  g.speed = speed(rt, R.team);
  u.speed = Math.max(u.speed || 0, rt.def.noHorse ? 4.5 : 6);   // 並足でなく駆け足で
  R.g = g; R.u = u;
}
function dropReal(rt, R) {
  if (R.u && R.u.alive) {
    rt.army.despawn(R.u);
    D(rt).freeReal.push({ g: R.g, u: R.u });
  }
  R.u = null; R.g = null;
}

function finish(rt, R, ok, why) {
  const i = D(rt).runners.indexOf(R);
  if (i >= 0) D(rt).runners.splice(i, 1);
  dropReal(rt, R);
  if (R.pend) R.pend.until = rt.t || 0;
  if (ok) {
    R.state = 'done';
    logEvent(rt, 'runnerArrive', { team: R.team, who: (R.target && R.target.id) ?? R.name, v: Math.round(((rt.t || 0) - R.t0) * 10) / 10 });
    if (!rt.over && aliveOf(R.target)) {
      const c = R.cmd;
      if (c && typeof c.apply === 'function') c.apply(R.target);
      else if (c && R.target && typeof R.target.order === 'function') R.target.order(c);
    }
    for (const f of R._arr) f(R);
  } else {
    R.state = why === 'void' ? 'void' : 'lost';
    if (R.state === 'void') return;
    logEvent(rt, 'runnerLost', { team: R.team, who: (R.target && R.target.id) ?? R.name, v: R.cmd && R.cmd.id });
    if (R.lord && !rt.over) {
      // 自分（信長）の下知だけ、知らせの一行（同じ文は 8 秒に一度：battle.say の決まりに任せる）
      if (rt.bark) rt.bark(`${R.name ? R.name + 'への' : ''}使番が戻らぬ。もう一度送れ`, true);
    }
    for (const f of R._lost) f(R);
  }
}

// 敵の備の 15m 内に入った時のくじ（点の使番）。n＝その備の名目の兵数。0.25 秒ごと
const cutChance = (n) => Math.min(0.4, 0.03 + n / 900);

function cutCheck(rt, R) {
  const x = R.x, z = R.z, real = !!R.u;
  // 本物の敵の隊（点の時だけくじ。本物の使番は、本当の斬り合いに任せる）
  if (!real) {
    for (const g of rt.army.groups) {
      if (g.team === R.team || g.routed || g.isRunner) continue;
      const n = g.count;
      if (!n) continue;
      const c = g.center();
      if (Math.abs(c.x - x) > CUT_R + 20 || Math.abs(c.z - z) > CUT_R + 20) continue;
      if (Math.hypot(c.x - x, c.z - z) < CUT_R + Math.sqrt(n) * 0.6 && Math.random() < cutChance(n * 3)) return true;
    }
  }
  // 軽い備（Butai の数だけの所）
  for (const b of rt.butai || []) {
    if (b.team === R.team) continue;
    const n = b.aliveNominal() - b.realCount();
    if (n <= 0) continue;
    if (Math.hypot(b.pos.x - x, b.pos.z - z) < CUT_R + Math.sqrt(n) * 0.4 && Math.random() < cutChance(n)) return true;
  }
  // 軽い大軍（world.js。gunbai.js が見分けた team の付いた物だけ）
  const W = rt.world && rt.world.armies;
  if (W) for (const A of W) {
    if (A.team == null || A.team === R.team || A.rout || A.people || !A.mesh || !A.mesh.visible) continue;
    const n = A.n - (A.took || 0);
    if (n <= 0) continue;
    const c = lightArmyPos(A);
    if (Math.hypot(c.x - x, c.z - z) < CUT_R + Math.sqrt(n) * 0.5 && Math.random() < cutChance(n)) return true;
  }
  return false;
}

function nearSegment(x, z, ax, az, bx, bz, radius) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t) < radius;
}
function blocked(rt, x, z) {
  const w = rt.world;
  if (w?.walkable && !w.walkable(x, z)) return true;
  for (const s of rt.army.structs || []) {
    if (s.alive && s.seg && !s.opened && nearSegment(x, z, s.seg[0], s.seg[1], s.seg[2], s.seg[3], 0.7)) return true;
  }
  for (const s of rt.army.solids || []) {
    if (s.struct && !s.struct.alive) continue;
    const y = w?.heightAt ? w.heightAt(x, z) : 0;
    if (s.yTop != null && y >= s.yTop - 0.05 || s.yBot != null && y < s.yBot) continue;
    if (x < s.x0 - 0.7 || x > s.x1 + 0.7 || z < s.z0 - 0.7 || z > s.z1 + 0.7) continue;
    if (s.k === 'c' && Math.hypot(x - s.x, z - s.z) < s.r + 0.7) return true;
    if (s.k === 's' && nearSegment(x, z, s.ax, s.az, s.bx, s.bz, (s.r || 0) + 0.7)) return true;
    if (s.k === 'r') {
      const dx = x - s.x, dz = z - s.z;
      if (Math.abs(dx * s.c - dz * s.s) < s.hw + 0.7 && Math.abs(dx * s.s + dz * s.c) < s.hd + 0.7) return true;
    }
  }
  return false;
}
export { blocked as runnerBlocked };
// 点で走る遠方の使番も壁を抜けない。入れ物は増やさず、小刻みに回り道を試す。
const TURNS = [0, 0.65, -0.65, 1.2, -1.2];
function advancePoint(rt, R, dx, dz, distance) {
  while (distance > 0.001) {
    const step = Math.min(0.6, distance);
    let moved = false;
    for (const a of TURNS) {
      const c = Math.cos(a), s = Math.sin(a);
      const x = R.x + (dx * c - dz * s) * step, z = R.z + (dx * s + dz * c) * step;
      if (blocked(rt, x, z)) continue;
      R.x = x; R.z = z; moved = true; break;
    }
    if (!moved) return;
    distance -= step;
  }
}

function stepRunner(rt, R, dt) {
  if (!aliveOf(R.target)) { finish(rt, R, false, 'void'); return; }
  const p = R.pickup || posOf(R.target);
  // 本物の騎馬：斬られたか
  if (R.u) {
    if (!R.u.alive) { R.u = null; finish(rt, R, false); return; }
    R.x = R.u.pos.x; R.z = R.u.pos.z;
    if (R.g) { R.g.dest = R.g.dest || {}; R.g.dest.x = p.x; R.g.dest.z = p.z; R.g.order = 'move'; }
  } else {
    let want = p;
    // 遠方の点の使番も、本物と同じ道筋を使う。近づく前に法面や建物へ詰まらせない。
    if (rt.world?.def.runnerWay) {
      const u = R._pointUnit || (R._pointUnit = { team: R.team, group: { isRunner: true }, pos: { x: 0, z: 0 } });
      u.pos.x = R.x; u.pos.z = R.z;
      want = rt.world.def.runnerWay(rt.army, u, p);
    }
    const dx = want.x - R.x, dz = want.z - R.z, L = Math.hypot(dx, dz);
    const water = rt.world?.waterSpeedAt ? rt.world.waterSpeedAt(R.x, R.z, true) : 1;
    const s = Math.min(L, speed(rt, R.team) * water * dt);
    if (L > 0.01) advancePoint(rt, R, dx / L, dz / L, s);
  }
  const left = Math.hypot(p.x - R.x, p.z - R.z);
  // 敵の間を抜けて無事に着いた時だけ伝える。着く直前にも討たれうる。
  if (cutCheck(rt, R)) { R.cuts++; finish(rt, R, false); return; }
  if (left <= ARRIVE_R && !blocked(rt, (p.x + R.x) / 2, (p.z + R.z) / 2)) {
    if (R.pickup) R.pickup = null;
    else { finish(rt, R, true); return; }
  }
  if (R.pend) { R.pend.until = (rt.t || 0) + R.eta(); R.pend.x = R.x; R.pend.z = R.z; }
  // 自分から 80m 内だけ本物に
  const P = rt.player && rt.player.u && rt.player.u.pos;
  const near = P && Math.hypot(P.x - R.x, P.z - R.z) < NEAR_REAL;
  if (near && !R.u) makeReal(rt, R);
  // 一度姿を出した使番は到着まで走り切る（最大六騎）。途中で使い回して出し直さない。
}

// ---------------- 知らせの広がり ----------------
// key：出来事の鍵（例 'taishoDown:A'・'rout:B'・'honjinDanger'）。同じ team・key は最初の一度だけ広げる。
// o：{ src（起きた備の id）, v, routers（敗走兵が隣へ走る＝true。無ければ使番）}
export function spread(rt, team, key, at, o = {}) {
  const d = D(rt);
  if (d.news.some((n) => n.team === team && n.key === key)) return null;
  const now = rt.t || 0;
  const N = { team, key, at: { x: at.x, z: at.z }, t0: now, src: o.src ?? null, known: new Map(), pend: [] };
  d.news.push(N);
  if (d.news.length > NEWS_KEEP) d.news.shift();
  const S0 = o.src != null ? (rt.sonae || []).find((s) => s.id === o.src) : null;
  const routers = o.routers ?? (S0 ? S0.state === '敗走' : false);
  const near = new Set();
  if (S0) near.add(S0.left()).add(S0.right()).add(S0.behind());
  for (const S of rt.sonae || []) {
    if (S.team !== team || S.line === 'honjin') continue;
    const p = S.b.pos, dist = Math.hypot(p.x - N.at.x, p.z - N.at.z);
    if (dist < 30) { know(rt, N, S.id); continue; }
    if (S === S0) { N.pend.push({ who: S.id, t: now + 3 }); continue; }
    if (near.has(S)) {
      // 敗走兵が駆け込む（4m/秒）か、使番（9m/秒）。どちらも 8〜20 秒に収める
      const t = Math.max(8, Math.min(20, dist / (routers ? 4 : RUNNER_SPEED) + 4 + Math.random() * 3));
      N.pend.push({ who: S.id, t: now + t });
    }
  }
  // 本陣：使番が着いた時（30m 内なら即時）。討たれたら 20 秒後にもう一騎
  const hp = honjinPos(rt, team);
  if (hp) {
    if (Math.hypot(hp.x - N.at.x, hp.z - N.at.z) < 30) know(rt, N, 'honjin');
    else newsRunner(rt, N, hp, 0);
  }
  loop(rt);
  return N;
}
function newsRunner(rt, N, hp, tries) {
  const tgt = { pos: hp, alive: true, team: N.team, id: 'honjin' };
  sendOrder(rt, N.at, tgt, { id: 'news', v: N.key, apply: () => know(rt, N, 'honjin') }, { team: N.team, name: '本陣', who: 'honjin' })
    .onLost(() => { if (tries < 2) rt.after(20, () => { if (!rt.over && !N.known.has('honjin')) newsRunner(rt, N, honjinPos(rt, N.team) || hp, tries + 1); }); });
}
function know(rt, N, who) {
  if (N.known.has(who)) return;
  N.known.set(who, rt.t || 0);
  logEvent(rt, 'knows', { team: N.team, who, v: N.key });
}
// who が key を知っているか（知った秒を返す。知らなければ null）
export function knows(rt, team, key, who) {
  const d = rt.denrei;
  if (!d) return null;
  for (const N of d.news) if (N.team === team && N.key === key) { const t = N.known.get(who); return t == null ? null : t; }
  return null;
}

// ---------------- 0.25 秒ごとの輪 ----------------
function loop(rt) {
  const d = D(rt);
  if (d.on) return;
  d.on = true;
  d.lastT = rt.t || 0;
  rt.after(STEP, () => tick(rt), true, true);
}
function tick(rt) {
  const d = D(rt);
  if (rt.over) { d.on = false; for (const R of d.runners) dropReal(rt, R); d.runners.length = 0; return; }
  const now = rt.t || 0, dt = Math.max(0, Math.min(1, now - d.lastT)) || STEP;
  d.lastT = now;
  for (let i = d.runners.length - 1; i >= 0; i--) { const R = d.runners[i]; if (R) stepRunner(rt, R, dt); }
  let waiting = false;
  for (const N of d.news) {
    if (!N.pend.length) continue;
    for (let i = N.pend.length - 1; i >= 0; i--) {
      if (N.pend[i].t <= now) { know(rt, N, N.pend[i].who); N.pend.splice(i, 1); }
    }
    if (N.pend.length) waiting = true;
  }
  if (d.runners.length || waiting) rt.after(STEP, () => tick(rt), true, true);
  else d.on = false;
}

// ---------------- 備の出来事を広げる（sonae.js の taishoDown・rout の記録を聞く。sonae.js は直さない） ----------------
const SPREAD_K = new Set(['taishoDown', 'rout']);
onEvent((rt, k, o) => {
  if (!SPREAD_K.has(k) || o.who == null) return;
  const S = (rt.sonae || []).find((s) => s.id === o.who);
  if (!S) return;
  // 討死は将が倒れた場所から伝わる。備の重心が離れていれば同じ備にも数秒を要する
  const at = k === 'taishoDown' && S.b.taishoU ? S.b.taishoU.pos : S.b.pos;
  spread(rt, S.team, `${k}:${S.id}`, at, { src: S.id, routers: k === 'rout' });
});
