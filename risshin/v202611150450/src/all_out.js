import { scriptedAlly } from './ally_orders.js';
// 敵も味方も全力（kaito 11/9 天王寺二回目「5. 敵も味方も全力を出す」・docs/army_depth_spec_1108.md）。全戦共通。battle.js が毎コマ呼ぶ。
//   半秒に一度だけ、両軍の備を見て、次の五つを下知する（兵は足さず、消さない。動かすのは下知・要・探す広さだけ）。
//   ① 見える敵へ：戦っていない敵の備は、140m の内に相手の備が見えれば「かかれ」で寄せる。突っ立たせない（味方は ai.js・ally_goal.js が出す）。
//   ② 前が戦えば後ろも：150m の内で同じ側の備が斬り合っていれば、後ろの備もその斬り合いへ加わる（くすぶらせない）。
//   ③ 本陣を救う：総大将の 30m の内に敵が三人より多く来たら、同じ側の近い備を二つまで本陣へ駆けつけさせる。
//   ④ 追い討ち：敵の備が崩れたら、90m の内の手の空いた備が 20 秒追う（殿に意味を持たせる）。
//   ⑤ 後詰：戦える兵が一番多かった時の四割を切った側は、控え（g.reserve）を一つずつ出す（小勢どうしにしない）。
//   敵の備は、戦っていない間は走って寄せる（g.allOutRun。army_think.js・ai.js が見る）。
//   筋書きで動く隊（行軍・道・退き・城攻め・大軍の寄せ・伏兵・隠れ・持ち場 stay・本人の組・大将の隊）は動かさない。
//   def.allOut = false でその戦だけ止める。
const TICK = 0.5;
const VIEW_FOE = 140, JOIN = 150, HELP = 260, CHASE = 90;

const OFF = typeof location !== 'undefined' && /[?&]aooff\b/.test(location.search);   // 試し：全力を切って比べる
const ST = new Map();   // 備 → 半秒ごとの集計（入れ物は使い回す）

function stat(g) {
  let s = ST.get(g);
  if (!s) { s = { g, x: 0, z: 0, n: 0, eng: 0, lord: null, fx: 0, fz: 0 }; ST.set(g, s); }
  let x = 0, z = 0, n = 0, e = 0, ex = 0, ez = 0, lord = null;
  for (const u of g.units) {
    if (!u.alive || u.fleeing) continue;
    n++; x += u.pos.x; z += u.pos.z;
    if (u.isTaisho || u.oTaisho) lord = u;
    const t = u.target;
    if (t?.alive && t.pos && t.team !== u.team && !t.isStruct && Math.abs(t.pos.x - u.pos.x) + Math.abs(t.pos.z - u.pos.z) < 9) { e++; ex += t.pos.x; ez += t.pos.z; }
  }
  s.n = n; s.x = n ? x / n : 0; s.z = n ? z / n : 0; s.eng = n ? e / n : 0; s.lord = lord;
  s.fx = e ? ex / e : s.x; s.fz = e ? ez / e : s.z;
  return s;
}

// 下知を変えてよい備か（筋書き・守り・隠れは触らない）。fixed（持ち場の形を保つ印）の隊も、見える敵には出る
function movable(rt, g, s) {
  if (!g.count || g.routed || g.civ || g.people || g.hidden || g.stay || g.reserve || g.noAI || g.siegeAI || g._massOwn || g._pacing) return false;
  if (g.isPlayerSquad || g.retreatOnly || g.garrison || g.guard || g.guardOn || g.holdFire || g.dispatch || g.onArrive || g.interiorHold) return false;
  if (g.ambush && !g._ai?.ambushDone) return false;
  if (g.focus && g.focus.alive) return false;
  if (g.order !== 'hold' && g.order !== 'yari' && g.order !== 'attack' && g.order !== 'follow') return false;
  if (g.path?.length && !(g.pathIdx >= g.path.length)) return false;
  const A = g._ai;
  if (A && (A.walled || A.fort || A.garrison)) return false;
  if (s.lord || g === rt.hostGroup) return false;
  if (g.team === rt.player?.u?.team && scriptedAlly(g)) return false;
  for (const u of g.units) if (u.alive && (u.isTaisho || u.oTaisho)) return false;
  return true;
}

function charge(g, seek, why, rt) {
  const was = g.order;
  g.order = 'attack';
  g.seekRange = Math.max(g.seekRange || 0, Math.min(110, seek));
  g.aggro = Math.max(g.aggro || 0, 20);
  g._allOut = why; g._allOutT = rt.t;
  if (was !== 'attack') for (const u of g.units) if (u.alive && !u.fleeing) { u.aiT = Math.min(u.aiT ?? 0, 0.1 + Math.random() * 0.5); u.settled = false; }
}

export function allOutTick(rt, dt) {
  const def = rt.def, A = rt.army, P = rt.player?.u;
  if (OFF || !A || !P || rt.over || rt.aftermath || def.allOut === false || def.dojo || def.town || rt.flags?.ending) return;
  if ((rt._aoT = (rt._aoT || 0) - dt) > 0) return;
  rt._aoT = TICK;
  const t = rt.t, me = P.team;
  const L = [];
  for (const g of A.groups) {
    if (!g.count || g.civ || g.people) continue;
    const s = stat(g);
    if (s.n) L.push(s);
  }
  // 敵は戦っていない間は走る（味方は本人の歩みに合わせるので、寄せる時だけ）
  for (const s of L) {
    const g = s.g;
    g.allOutRun = !g.routed && s.eng < 0.3 && (g.team !== me || g._allOut != null) && (g.order === 'attack' || g.pursuing);
    if (g._aoPursueT != null && t > g._aoPursueT) { g._aoPursueT = null; g.pursuing = false; }
  }
  // 味方の備で、全力で出たのに 70m 内に敵の備がいないまま 15 秒たてば、その場の持ち場（hold）へ戻す（本人と一緒に進む仕組みへ返す）
  for (const o of L) {
    const g = o.g;
    if (g.team !== me || g._allOut == null || g.order !== 'attack' || g.pursuing || o.eng > 0) { if (g._allOut != null) g._aoQuiet = null; continue; }
    let near = false;
    for (const q of L) if (q.g.team !== me && !q.g.routed && q.n >= 2 && Math.hypot(q.x - o.x, q.z - o.z) < 70) { near = true; break; }
    if (near) { g._aoQuiet = null; continue; }
    if (g._aoQuiet == null) g._aoQuiet = t;
    else if (t - g._aoQuiet > 15) { g.order = 'hold'; g.anchor.x = o.x; g.anchor.z = o.z; g._allOut = null; g._aoQuiet = null; g.allOutRun = false; }
  }
  const safe = Math.max(12, def.openingSafe || 0) + 4;
  if (t < safe) return;
  const advanceOff = def.enemyTactics === false || def.enemyTactics && def.enemyTactics.advance === false;
  // ③ 本陣を救う
  for (const s of L) {
    const lord = s.lord;
    if (!lord || lord.isPlayer || s.g.routed) continue;
    let foes = 0;
    A.forNear(lord.pos.x, lord.pos.z, 30, (o) => { if (o.alive && !o.fleeing && o.team !== lord.team && !o.isStruct && !o.civ) foes++; });
    if (foes < 4) { s.g._aoThreat = null; continue; }
    if (s.g._aoThreat && t - s.g._aoThreat < 12) continue;
    s.g._aoThreat = t;
    const pick = [];
    for (const o of L) {
      const g = o.g;
      if (g.team !== lord.team || o === s || o.eng > 0.5 || !movable(rt, g, o)) continue;
      const d = Math.hypot(o.x - lord.pos.x, o.z - lord.pos.z);
      if (d < HELP) pick.push([d, o]);
    }
    pick.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(2, pick.length); i++) {
      const [d, o] = pick[i];
      o.g.anchor.x = lord.pos.x; o.g.anchor.z = lord.pos.z;
      charge(o.g, d + 25, 'honjin', rt);
      o.g.allOutRun = true;
    }
  }
  // ④ 追い討ち
  for (const s of L) {
    const r = s.g;
    if (!r.routed || r._aoChased) continue;
    r._aoChased = t;
    for (const o of L) {
      const g = o.g;
      if (g.team === r.team || g.noPursue || o.eng > 0.3 || !movable(rt, g, o)) continue;
      if (g.team !== me && advanceOff) continue;
      if (Math.hypot(o.x - s.x, o.z - s.z) > CHASE) continue;
      charge(g, 70, 'pursue', rt);
      g.pursuing = true; g._aoPursueT = t + 20; g.allOutRun = true;
    }
  }
  // ①② 見える敵へ・前が戦えば後ろも
  for (const o of L) {
    const g = o.g;
    if (o.eng >= 0.2 || !movable(rt, g, o)) continue;
    const foeSide = g.team !== me;
    if (foeSide && advanceOff) continue;
    if (g.order === 'attack' && g._allOut != null) continue;   // もう寄せている
    let nd = Infinity;
    for (const q of L) if (q.g.team !== g.team && !q.g.routed && !q.g.hidden && q.n >= 2) nd = Math.min(nd, Math.hypot(q.x - o.x, q.z - o.z));
    // 味方の見える敵への寄せは ai.js（70m で出る）と ally_goal.js（本人と一緒に進む）に任せる。ここは前の斬り合いへの加勢だけ
    if (foeSide) {
      const dp = P.alive ? Math.hypot(P.pos.x - o.x, P.pos.z - o.z) : Infinity;
      nd = Math.min(nd, dp);
      if (nd < VIEW_FOE) { charge(g, nd + 20, 'see', rt); continue; }
    }
    for (const q of L) {
      if (q === o || q.g.team !== g.team || q.eng < 0.25 || q.g.routed) continue;
      const d = Math.hypot(q.fx - o.x, q.fz - o.z);
      if (d < JOIN) { g.anchor.x = q.fx; g.anchor.z = q.fz; charge(g, d + 25, 'join', rt); break; }
    }
  }
  // ⑤ 後詰：戦える兵が一番多かった時の四割を切った側は、控えを一つずつ出す（十五秒に一度）
  if (!(rt._aoResT > t)) {
    rt._aoResT = t + 15;
    const live = [0, 0], peak = rt._aoPeak || (rt._aoPeak = [0, 0]);
    for (const s of L) if (!s.g.routed && !s.g.reserve && !s.g.hidden) live[s.g.team === me ? 0 : 1] += s.n;
    for (let k = 0; k < 2; k++) {
      peak[k] = Math.max(peak[k], live[k]);
      if (t < 60 || live[k] >= peak[k] * 0.4) continue;
      let best = null, bd = Infinity;
      for (const s of L) {
        const g = s.g;
        if (!g.reserve || g.routed || g.hidden || (g.team === me ? 0 : 1) !== k || g.noAI || g.siegeAI) continue;
        const d = Math.hypot(s.x - P.pos.x, s.z - P.pos.z);
        if (d < bd) { bd = d; best = g; }
      }
      if (best) { best.reserve = false; charge(best, 90, 'gozume', rt); best.allOutRun = true; }
    }
  }
}

// 確かめ用：今の全力の下知の数
export function allOutStats(rt) {
  const c = { see: 0, join: 0, honjin: 0, pursue: 0, gozume: 0 };
  for (const g of rt.army?.groups || []) if (g._allOut && c[g._allOut] != null) c[g._allOut]++;
  return c;
}
