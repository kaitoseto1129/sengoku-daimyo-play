// 外堂の段（十六日の昼・惣門の内）：本人の前に斬り合う相手が残らない事がある。
//   11/18 15:20 UTC クラウド持ち主（act bot 五回に三回、外堂の段の討ち取り0〜1）：
//   味方の先手が本人より先に堂へ入り、外堂の守りを呑んでしまう。
//   惣門が破れた後、本人がまだこの段で一人も討たず、外堂の平場（中心から三十五m 内）にいて
//   五m 内に本人へ掛かる敵が十二秒いない時は、僧坊の縁の下に潜んでいた衆徒三人が本人へ打って掛かる（二度まで・一太刀は三割）。
import { enemyGroup } from '../bhelp.js';
import { siegeFighter } from '../siege_zones.js';

const live = (u) => siegeFighter(u) && u.hp > 0 && !u.dying && !u.rearWound && !u.fleeing;

// at：外堂の中心、look：門徒の小袖
export function tick(rt, at, look) {
  const F = rt.flags;
  if (F.step !== 1 || F.ending || F.gateSomon?.struct?.alive) return;
  const G = F.ikGezan || (F.ikGezan = { k0: rt.stats?.kills ?? 0, drops: 0, quietT: rt.t });
  const me = rt.player?.u;
  if (!me || me.hp <= 0 || G.drops >= 2 || (rt.stats?.kills ?? 0) > G.k0) return;
  const p = me.pos;
  if (Math.hypot(p.x - at.x, p.z - at.z) > 35) { G.quietT = rt.t; return; }
  // 深手の時は呼ばない（手当てへ退く間に囲ませない）
  if (me.hp < (me.maxHp || 100) * 0.4) { G.quietT = rt.t; return; }
  // 味方と斬り合う敵が近くにいても、本人に掛かって来ない限り「相手がいる」に数えない（act bot 1513：外堂の段で討0のまま近くに敵はいた）
  const near = rt.army.units.some((o) => o.team !== me.team && live(o) && (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2 < 25 &&
    (o.target === me || o.swing?.target === me || o.atk?.target === me));
  if (near) { G.quietT = rt.t; return; }
  if (rt.t - G.quietT < 12 || rt.t < (G.nextT || 0)) return;
  G.drops++; G.nextT = rt.t + 20; G.quietT = rt.t;
  // 堂の側（本人から堂の中心の向き）十二m 先の縁の下から出る。
  const dx = at.x - p.x, dz = at.z - p.z, d = Math.hypot(dx, dz) || 1, s = Math.min(12, d) / d;
  const from = { x: p.x + dx * s, z: p.z + dz * s };
  const g = enemyGroup(rt, { faction: 'ikko', flag: 'namu', name: '縁の下に潜んだ衆徒', fixed: true, noGuard: true, anchor: from, facing: Math.atan2(p.x - from.x, p.z - from.z),
    fleeDir: { x: Math.sign(at.x - p.x) || 1, z: 0.4 }, aggro: 24, seekRange: 30, width: 5, formation: 'loose', morale: 100, noRout: true, speed: 3.4 },
  [{ type: 'ashigaru', n: 3, o: { ...(look || {}) } }]);
  g.order = 'attack'; g.focus = me; g.dmgMult = 0.3;
  rt.say('足軽', '縁の下に衆徒が潜んでおったぞ！', 2.5);
}
