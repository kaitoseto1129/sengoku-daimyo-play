// 小荷駄の列（kaito 10/28 の割合：小者・陣夫・荷駄・馬方 20%）。本物の兵の戦にも、本陣の裏で荷を担いで行き来する味方の小者を置く。
// 前線には出さない。道の点（pts）を往復し、着いたら少し休んで折り返す（突っ立たせない）。
// 小者（type 'porter'）は狙われず、狙わない（units.js）。形と荷は units.js の共用の作りを使う。
import { allyGroup } from './bhelp.js';

export function porterTrain(rt, pts, n = 6, o = {}) {
  if (!pts || pts.length < 2) return null;
  const g = allyGroup(rt, { name: o.name || '小荷駄', fixed: true, fullStrength: true, anchor: { x: pts[0][0], z: pts[0][1] },
    facing: Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]), width: 2, aggro: 0, ...(o.group || {}) },
    [{ type: 'porter', n, o: { ...(o.look || {}), keep: true } }]);
  let route = pts.slice();
  const go = () => {
    if (!g.units.some((u) => u.alive)) return;
    g.order = 'path'; g.formation = 'column'; g.path = route; g.pathIdx = 0;
    g.onArrive = () => {
      g.order = 'hold'; g.onArrive = null;
      route = route.slice().reverse();
      rt.after(3 + Math.random() * 3, go);
    };
  };
  rt.after(1 + Math.random() * 2, go);
  return g;
}
