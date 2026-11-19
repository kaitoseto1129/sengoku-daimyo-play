// 寺の段（外堂・本堂・奥の院）で本人に斬り掛かる相手が残らない事がある。
//   11/18 19:30 UTC クラウド持ち主（act bot 1909・1920・1921 三回続けて「7〜8分で5〜6人」★）：位置の記録で、本堂の段は
//   本人の十四m 先に持ち場「待て」の衆徒が七人立ち、本人の八m 内の敵0のまま二十秒、本人は印の前で立ち尽くしていた。
//   門が破れた後、本人の命が四割半より上で、本人へ掛かる敵が八秒いない時は、本人の十六m 内で同じ高さの刀・槍・薙刀の衆徒
//   三人までが本人へ向き直る（名のある者・弓鉄砲・逃げる者・壁の向こうの者は除く）。数・強さは変えない（同時に打つのは二人のまま）。
const R = 16, N = 3;
export function tick(rt) {
  const A = rt.army, P = rt.player?.u, F = rt.flags;
  if (!P?.alive || P.hp <= 0 || P.noTarget || P.invuln || A.duel || F.ending || rt.over) return;
  if (rt.t < (F._ikPressAt || 0)) return;
  F._ikPressAt = rt.t + 0.5;
  const low = P.hp < (P.maxHp || 100) * 0.45;
  let on = 0;
  const cand = [], beside = [], onP = [];
  for (const u of A.units) {
    if (!u.alive || u.hp <= 0 || u.team === P.team || u.isStruct || u.dying || u.downed || u.gone || u.fleeing || u.woundOut || u.rearWound) continue;
    const dx = u.pos.x - P.pos.x, dz = u.pos.z - P.pos.z;
    if (Math.abs(dx) > R || Math.abs(dz) > R) continue;
    const d = Math.hypot(dx, dz);
    if (d > R || Math.abs(u.pos.y - P.pos.y) > 1.8) continue;
    if (u.target === P || u.atk?.target === P || u.swing?.target === P) { on++; onP.push([d, u]); continue; }
    const g = u.group;
    // 11/18 21:30 UTC 持ち主（act bot 2122：298秒 本人の三m 半の脇で衆徒の侍が号令 move・待つ のまま六秒立つ★）：
    //   ほかの敵が本人に掛かっていても、すぐ脇（3.5m）で誰も狙わず三秒立つ者は本人へ向き直る（本人へ掛かる者が二人に満たない時だけ。
    //   act bot 2127 で三人目以上を向けた時に石段の下で囲まれて倒れた）
    if (d < 3.5 && !u.target && !u.atk && !u.name && !u.civ && !u.noTarget && !u.climb && !u.perch && !(g && (g.routed || g.hidden)) &&
      !(A.wallBetween && A.wallBetween(u.pos, u.team, P.pos))) {
      if (u._ikBeside == null) u._ikBeside = rt.t;
      else if (rt.t - u._ikBeside > 3) { beside.push(u); continue; }
    } else u._ikBeside = null;
    if (u.name || u.noTarget || u.civ || u.mounted || u.climb || u.perch || u.bind) continue;
    if (!u.sidearm && (u.type === 'gun' || u.type === 'bow')) continue;
    if (u.type === 'busho' || u.type === 'porter' || u.type === 'dummy') continue;
    if (!g || g.routed || g.hidden || g.order === 'flee' || g.order === 'retreat') continue;
    if ((u.atk && !u.atk.done) || (u.swing && !u.swing.done)) continue;
    if (A.wallBetween && A.wallBetween(u.pos, u.team, P.pos)) continue;
    cand.push([d, u]);
  }
  // 11/18 22:45 UTC 持ち主（act bot 2229：外堂の段 217〜251秒 谷筋の伏兵十人が霧から一度に本人へ掛かり「囲退」で倒れた）：
  //   本人に掛かる者は四人まで（命が四割半より下なら三人）。多い者は遠い順に、八m 内の本人でない味方へ向ける（居なければ狙いを外して一息置く）。
  const cap = low ? 3 : 4;
  if (onP.length > cap) {
    onP.sort((a, b) => b[0] - a[0]);
    for (const [, u] of onP.slice(0, onP.length - cap)) {
      if ((u.atk && !u.atk.done) || (u.swing && !u.swing.done)) continue;
      let alt = null, best = 8;
      for (const v of A.units) {
        if (v === P || v.team !== P.team || !v.alive || v.hp <= 0 || v.isStruct || v.dying || v.gone || v.civ) continue;
        const e = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z);
        if (e < best) { best = e; alt = v; }
      }
      u.target = alt; u.pullUntil = 0; u.aiT = alt ? 1 : 1.5;
      on--;
    }
  }
  if (low) { F._ikPressQuiet = rt.t; return; }
  for (const u of beside) {
    if (on >= 2) break;
    u._ikBeside = null; u.target = P; u.watch = null; u.moveTo = null; u.pullUntil = A.time + 4; u.aiT = 0; on++;
  }
  if (on > 0) { F._ikPressQuiet = rt.t; return; }
  F._ikPressQuiet ??= rt.t;
  if (rt.t - F._ikPressQuiet < 8 || !cand.length) return;
  F._ikPressQuiet = rt.t;
  cand.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < cand.length && i < N; i++) {
    const u = cand[i][1];
    u.target = P; u.watch = null; u.moveTo = null; u.pullUntil = A.time + 4; u.aiT = 0;
  }
}
