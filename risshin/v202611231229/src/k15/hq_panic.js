// ======================================================================
// 徳川編 15　天王寺・岡山：本陣の慌て（K325 の五つの一つ・docs/specs/tennoji_sanada_req_1115.md 5-11）
// 受け持ち（11/15 iMac の係）：この紙だけ。本陣の危うさ（F.hqThreat）は k15/hq_rush.js が出す。ここはそれを絵にする。
// 段を踏む（札でなく、本陣の様子で分からせる）：
//   20 使番が増える：伝令の騎馬が速くなり、本陣を出入りする間が短くなる（危うさが上がるほど）。
//   30 旗本が支度：床几の周りの旗本が寄って、寄せ手の方へ向き直る。
//   55 馬を用意：馬廻の騎馬が後ろから駆けて来て、家康の脇に並ぶ。
//   70 陣幕を外す：本陣の陣幕を柱ごと下ろして畳む（当たりも外す）。
//   85 下がる支度：家康が床几から立ち、旗本が家康の周りに固まる。家康はまだ動かない（退くのは③で側近の声の後）。
// 家康を逃げ回る道化にしない：ここでは家康を動かさない。
// ======================================================================
// bot の記録へ出す数（どの段まで進んだか・何秒に）
export const STAT = { lv: 0, at: {}, folded: false, uma: 0, cs: 1 };
const live = (g) => g && !g.routed && g.count > 0;

// 毎コマ（段2〜4）。本の update から呼ぶ。ctx：{ HON, maku, mawari() }
export function tick(rt, dt, ctx) {
  const F = rt.flags;
  if (F.ending) return;
  const S = F.k325p ||= { lv: 0, fold: 0 };
  const th = Math.max(F.hqThreat || 0, F.step >= 3 ? 50 : 0);
  // 陣幕を下ろす動き（5秒かけて畳む）
  if (S.folding) foldStep(rt, S, ctx, dt);
  if (S.t1 > rt.t) return;
  S.t1 = rt.t + 0.5;
  // 使番が増える：危うさに合わせて伝令の足と出入りを速める
  const want = th >= 70 ? 1.7 : th >= 45 ? 1.4 : th >= 20 ? 1.2 : 1;
  if (rt.couriers?.length && want > (S.cs || 1)) {
    for (const c of rt.couriers) {
      if (c.speed) c.speed = c.speed / (S.cs || 1) * want;
      if (c.st?.mode === 'wait') c.st.t = Math.min(c.st.t, 1.5 / want);
    }
    S.cs = want; STAT.cs = want;
  }
  if (rt.couriers?.length && S.cs > 1) for (const c of rt.couriers) if (c.st?.mode === 'wait' && c.st.t > 3 / S.cs) c.st.t = 3 / S.cs;
  const I = F.ieyasu?.alive ? F.ieyasu : null;
  // 旗本の支度：寄せ手の方へ向き直り、家康の前へ寄る
  if (th >= 30 && S.lv < 30) {
    S.lv = 30; STAT.lv = 30; STAT.at[30] = Math.round(rt.t);
    const g = F.hon, t = nearestFoe(rt, ctx.HON);
    if (live(g) && t) { g.facing = Math.atan2(t.x - ctx.HON.x, t.z - ctx.HON.z); }
    rt.say('旗本', '支度せい！　槍を取れ、床几の前を固めよ！', 2.6);
  }
  // 馬を用意：馬廻の騎馬が後ろから家康の脇へ
  if (th >= 55 && S.lv < 55) {
    S.lv = 55; STAT.lv = 55; STAT.at[55] = Math.round(rt.t);
    try { S.uma = ctx.mawari?.(); STAT.uma = S.uma?.count || 0; } catch (e) { /* そのまま */ }
    rt.say('馬廻', '御馬、これに！', 2.2);
  }
  // 陣幕を外す
  if (th >= 70 && S.lv < 70) {
    S.lv = 70; STAT.lv = 70; STAT.at[70] = Math.round(rt.t);
    if (ctx.maku && !S.folding && !S.folded) { S.folding = true; S.fold = 0; }
    rt.after(0.8, () => rt.say('本陣の侍', '幕を下ろせ！　柱を抜け！', 2.4));
  }
  // 下がる支度：家康が立ち、旗本が固まる（まだ動かない）
  if (th >= 85 && S.lv < 85) {
    S.lv = 85; STAT.lv = 85; STAT.at[85] = Math.round(rt.t);
    if (I) { I._crouch = false; const t = nearestFoe(rt, I.pos); if (t) I.facing = Math.atan2(t.x - I.pos.x, t.z - I.pos.z); }
    const g = F.hon; if (live(g) && g.width) g.width = Math.max(5, g.width - 3);
    rt.say('徳川家康', '……騒ぐな。まだ動かぬ', 2.6);
  }
}

// 本陣の近くの寄せ手（豊臣の兵）の一番近い者
function nearestFoe(rt, p) {
  let best = null, bd = 1e9;
  for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing) { const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z); if (d < bd) { bd = d; best = u.pos; } }
  return best;
}

// 陣幕：柱ごと地面まで下ろす。下ろし切ったら幕の当たりを外し、兵が通れるようにする
function foldStep(rt, S, ctx, dt) {
  const M = ctx.maku;
  S.fold = Math.min(1, S.fold + dt / 5);
  const k = 1 - S.fold * S.fold * 0.94;
  M.traverse?.((o) => { if (o.isLOD) o.scale.y = k; });
  if (S.fold < 1) return;
  S.folding = false; S.folded = true; STAT.folded = true;
  const H = ctx.HON, sol = rt.army.solids;
  if (sol?.length) {
    for (let i = sol.length - 1; i >= 0; i--) {
      const w = sol[i];
      if (w.k === 's' && w.cameraCurtain && Math.abs((w.ax + w.bx) / 2 - H.x) < 12 && Math.abs((w.az + w.bz) / 2 - (H.z + 6)) < 10) sol.splice(i, 1);
    }
  }
}
