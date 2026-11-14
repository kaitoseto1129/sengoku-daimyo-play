// 布陣の表（fujin_table.js）を並べる共通の仕組み（11/14 束A）。battle.js が毎コマ呼ぶ。表のある戦だけ働く。
//   見せかけの兵は作らず、備ごとに「本物の備」を置く（同じ名は一つ・兵の装束はその戦の兵から・旗と具足は表のとおり）。
import { FUJIN } from './fujin_layout.js';
import { realFromLight } from './depth_reserve.js';
import { isTouch } from './touch.js';

export function fujinFor(rt) {
  const id = rt.def && (rt.def.key || rt.def.id);
  return id && FUJIN[id] ? FUJIN[id] : null;
}
export function fujinTick(rt, enemyGroup, allyGroup) {
  const T = fujinFor(rt); if (!T || rt.def.ownFujin || rt.flags._fj) return;
  if (!rt._tpl || !rt._tpl.E || !rt._tpl.A || !rt.player?.u) return;   // 兵の装束が覚えられてから（戦の始めの数コマ後）
  const me = rt.player.u.pos, list = rt.flags._fj = [];
  for (const r of T.rows) {
    if (Math.hypot(r.x - me.x, r.z - me.z) > (isTouch ? 140 : 190)) continue;
    try {
      const g = realFromLight(rt, { x: r.x, z: r.z, w: r.w, d: r.d, count: r.count, facing: r.facing, team: r.side, look: { flag: r.flag, armor: r.armor }, min: isTouch ? 5 : 8 },
        enemyGroup, allyGroup, isTouch ? 0.02 : 0.12, isTouch ? 9 : 36, r.name, r.leaders && r.leaders.length ? r.leaders : null);
      if (g) { g._fujinRow = r.row; list.push(g); }
    } catch (e) { window.__fujinErr = String(e && e.stack || e).slice(0, 300); }
  }
}
