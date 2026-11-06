// 目標に書いた敵は必ずその場に来て戦いになる（kaito 11/5 九-2・BQ「先手を止めよなのに先手が来ない」。全戦共通。battle.js が毎コマ呼ぶ）
//   今の目標が敵を受ける・止める・討つ言い方で、行き先が決まっている時：本人が行き先に着いて六秒たっても敵が寄らなければ、
//   いちばん近い敵の備（本物の兵の隊）を行き先へ駆け寄らせ、着いたら「かかれ」にする。兵は足さず、消さない。
//   大将の隊・城兵・伏兵・筋書きで動かさない隊（noAI・siegeAI・stay など）は動かさない。def.noGoalFoe で止める。
import { fiveGoals, goalTarget } from './goals5.js';

const FOE_WORD = /先手|追手|追い討ち|追っ手|敵|騎馬|一揆|討|止め|受け|防|迎え/;
const QUIET = 6;      // 行き先で敵が寄らないまま待つ秒
const NEAR = 35;      // 行き先のこの内に敵が三人いれば足りている
const FAR = 260;      // これより遠い隊は呼ばない

const movable = (g, me) => g.team !== me && g.count > 0 && !g.routed && !g.civ && !g.hidden && !g.ambush && !g.stay && !g.guard && !g.guardOn &&
  !g.noAI && !g.siegeAI && !g.garrison && !g._massOwn && !g.dispatch && !g.isTomo &&
  !g.units.some((u) => u.alive && (u.isTaisho || u.isLord || u.oTaisho));

export function goalFoeTick(rt, dt) {
  const def = rt.def, A = rt.army, P = rt.player?.u;
  if (!A || !P || !P.alive || rt.over || def.town || def.dojo || def.noGoalFoe || !rt._g5) return;
  if ((rt._gfT = (rt._gfT || 0) - dt) > 0) return;
  rt._gfT = 1;
  const f = fiveGoals(rt);
  if (!f || f.now < 0) { rt._gfQ = 0; return; }
  const g = rt._g5.goals[f.now], text = f.rows[f.now].text || '';
  if ((g.kind !== 'stage' && g.kind !== 'main') || !FOE_WORD.test(text)) { rt._gfQ = 0; return; }
  let at = null;
  try { at = g.place ? g.place(rt) : null; } catch (e) { at = null; }
  if (!at) { const t = goalTarget(rt); if (t && !t.unit) at = t; }
  if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) { rt._gfQ = 0; return; }
  // 本人が行き先に着いているか
  if (Math.hypot(P.pos.x - at.x, P.pos.z - at.z) > 30) { rt._gfQ = 0; return; }
  let n = 0;
  A.forNear(at.x, at.z, NEAR, (o) => { if (o.alive && o.team !== P.team && !o.fleeing && !o.civ && !o.noTarget && !o.isStruct && !o.dying) n++; });
  if (n >= 3) { rt._gfQ = 0; return; }
  rt._gfQ = (rt._gfQ || 0) + 1;
  if (rt._gfQ < QUIET) return;
  rt._gfQ = 0;
  // いちばん近い、動かしてよい敵の備を呼ぶ（三十秒は同じ隊を呼び直さない）
  let best = null, bd = FAR;
  for (const q of A.groups) {
    if (!movable(q, P.team) || q._goalFoeT > rt.t - 30) continue;
    const c = q.center(q._gfProbe || (q._gfProbe = {}));
    const d = Math.hypot(c.x - at.x, c.z - at.z);
    if (d < bd && !A.wallBetween(c, q.team, at)) { best = q; bd = d; }
  }
  if (!best) return;
  const c = best.center(best._gfProbe), d = Math.max(1, bd);
  best._goalFoeT = rt.t;
  best.order = 'move';
  best.dest = { x: at.x + (c.x - at.x) / d * 6, z: at.z + (c.z - at.z) / d * 6 };
  best.onArrive = (gg) => { if (gg.order === 'move') gg.order = 'attack'; };
}
