// 外堂の段（十六日の昼・惣門の内）：本人の前に斬り合う相手が残らない事がある。
//   11/18 15:20 UTC クラウド持ち主（act bot 五回に三回、外堂の段の討ち取り0〜1）：
//   味方の先手が本人より先に堂へ入り、外堂の守りを呑んでしまう。
//   惣門が破れた後、本人がまだこの段で一人も討たず、外堂の平場（中心から三十五m 内）にいて
//   五m 内に本人へ掛かる敵が六秒いない時は、僧坊の縁の下に潜んでいた衆徒三人が本人へ打って掛かる（三度まで・本人が三人討つまで・一太刀は三割）。
import { enemyGroup } from '../bhelp.js';
import { siegeFighter } from '../siege_zones.js';

const live = (u) => siegeFighter(u) && u.hp > 0 && !u.dying && !u.rearWound && !u.fleeing;

// at：外堂の中心、look：門徒の小袖
export function tick(rt, at, look) {
  const F = rt.flags;
  if (F.step !== 1 || F.ending || F.gateSomon?.struct?.alive) return;
  const G = F.ikGezan || (F.ikGezan = { k0: rt.stats?.kills ?? 0, drops: 0, quietT: rt.t });
  const me = rt.player?.u;
  // 11/19 00:30 UTC 持ち主（act bot 0014・0024：外堂の段 討0・討4、本人は惣門の内 (-2,-73)・堂の中心から二十m で十秒余り相手無し、
  //   その間に味方の三手が堂を取って段が終わる）：一人討つまで→三人討つまで、二度→三度、静かな間 十二秒→六秒
  if (!me || me.hp <= 0) return;
  const p = me.pos;
  // 11/19 04:40 UTC 持ち主（act bot 0417 の二秒刻みの記録：169〜250秒、本人は惣門の内の登り坂 (0,-75)・外堂の守りは坂の上の縁 (0,-70) に
  //   本人より一・五〜四m 高く立って本人を狙ったまま、八十秒どちらの刃も届かず（本人の傷0・外堂の段 討0）、味方の三手が先に削った）：
  //   坂の上から本人を狙う守りは、二秒ごとに坂を下りて本人と同じ高さ（本人の一・五m 前）で打ち合う
  if (me.hp >= (me.maxHp || 100) * 0.45 && rt.t >= (G.slopeT || 0)) {
    G.slopeT = rt.t + 2;
    for (const u of rt.army.units) {
      if (u.team === me.team || !live(u) || u.isPlayer || (u.target !== me && u.atk?.target !== me) || u.type === 'gun' || u.type === 'bow') continue;
      const dy = u.pos.y - p.y, dx = p.x - u.pos.x, dz = p.z - u.pos.z, d = Math.hypot(dx, dz);
      if (dy < 1.3 || dy > 4.5 || d > 6 || d < 1.6 || (u.swing && !u.swing.done)) continue;
      const k = (d - 1.5) / d;
      u.atk = null; u.target = null; u.moveTo = { x: u.pos.x + dx * k, z: u.pos.z + dz * k }; u.aiT = 1.2;
    }
  }
  if ((rt.stats?.kills ?? 0) > G.k0 + 2) return;
  // 11/19 00:50 UTC 持ち主（act bot 0034：縁の下の二組目が本人の五〜七m で味方と組み合い、本人へ来なかった）：出た衆徒は一秒ごとに本人へ向け直す
  //   00:58 同じ持ち主（act bot 0052：205秒 深手で退く本人を縁の下の衆徒が追い続けて倒した）：本人の命が四割半より下の間は向け直さず、狙い（focus）も外す
  const lowMe = me.hp < (me.maxHp || 100) * 0.45;
  if (G.gs && lowMe) for (const g of G.gs) { g.focus = null; g.order = 'hold'; for (const u of g.units) if (u.target === me && !(u.swing && !u.swing.done)) { u.target = null; u.aiT = 1.5; } }
  if (G.gs && !lowMe && rt.t >= (G.aimT || 0)) {
    G.aimT = rt.t + 1;
    for (const g of G.gs) { g.focus = me; g.order = 'attack'; }
    for (const g of G.gs) for (const u of g.units) if (live(u) && u.target !== me && !(u.swing && !u.swing.done) && !(u.atk && !u.atk.done)) { u.target = me; u.watch = null; u.moveTo = null; u.pullUntil = (rt.army.time || 0) + 4; u.aiT = 0; }
  }
  if (G.drops >= 3) return;
  if (Math.hypot(p.x - at.x, p.z - at.z) > 35) { G.quietT = rt.t; return; }
  // 深手の時は呼ばない（手当てへ退く間に囲ませない）
  if (me.hp < (me.maxHp || 100) * 0.4) { G.quietT = rt.t; return; }
  // 味方と斬り合う敵が近くにいても、本人に掛かって来ない限り「相手がいる」に数えない（act bot 1513：外堂の段で討0のまま近くに敵はいた）
  const near = rt.army.units.some((o) => o.team !== me.team && live(o) && (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2 < 25 &&
    (o.target === me || o.swing?.target === me || o.atk?.target === me));
  if (near) { G.quietT = rt.t; return; }
  if (rt.t - G.quietT < 6 || rt.t < (G.nextT || 0)) return;
  G.drops++; G.nextT = rt.t + 14; G.quietT = rt.t;
  // 堂の側（本人から堂の中心の向き）十二m 先の縁の下から出る。
  const dx = at.x - p.x, dz = at.z - p.z, d = Math.hypot(dx, dz) || 1, s = Math.min(12, d) / d;
  let from = { x: p.x + dx * s, z: p.z + dz * s };
  // 11/19 00:45 UTC 持ち主（act bot 0025：二度出たが討0。本人は惣門の内の参道 (-2,-77)、堂の向き十二m 先は段の縁の上で二m 高く、
  //   衆徒が縁の上に立ったまま下の本人へ届かなかった）：本人と同じ高さ（一m 内）で塀を挟まない所を、堂の側から順に八方・九m で探す
  const W = rt.world, A = rt.army, py = W?.heightAt ? W.heightAt(p.x, p.z) : 0, a0 = Math.atan2(dx, dz);
  if (W?.heightAt) for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) {
    const a = a0 + k * Math.PI / 4, c = { x: p.x + Math.sin(a) * 9, z: p.z + Math.cos(a) * 9 };
    if (Math.abs(W.heightAt(c.x, c.z) - py) > 1 || Math.abs(W.heightAt((c.x + p.x) / 2, (c.z + p.z) / 2) - py) > 1) continue;
    if (A.wallBetween && A.wallBetween(c, 1 - me.team, p)) continue;
    from = c; break;
  }
  const g = enemyGroup(rt, { faction: 'ikko', flag: 'namu', name: '縁の下に潜んだ衆徒', fixed: true, noGuard: true, anchor: from, facing: Math.atan2(p.x - from.x, p.z - from.z),
    fleeDir: { x: Math.sign(at.x - p.x) || 1, z: 0.4 }, aggro: 24, seekRange: 30, width: 5, formation: 'loose', morale: 100, noRout: true, speed: 3.4 },
  [{ type: 'ashigaru', n: 3, o: { ...(look || {}) } }]);
  // 11/19 00:40 UTC 持ち主（act bot 0021・0035：二度出たが本人の討ち0、味方の太刀と矢が先に倒した）：本人でない者からの傷は七分の一（今福の守将と同じ takeNonPlayer）
  (G.gs ||= []).push(g);
  for (const u of g.units) u.takeNonPlayer = 0.15;
  g.order = 'attack'; g.focus = me; g.dmgMult = 0.3;
  rt.say('足軽', '縁の下に衆徒が潜んでおったぞ！', 2.5);
}
