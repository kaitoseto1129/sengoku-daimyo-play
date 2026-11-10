// 織田編 27〜32（有岡・伊賀・鳥取・高遠・田野・本能寺）の「必ず見せる出来事」の小さな道具（docs/battle_events_1101.md）。
// 名のある人を頭上の名つきで一人（と供）置く・行き先に着いたら進める・場面を順に流す。毎コマの仕組みは足さない（rt.after の輪で見る）。
import { allyGroup, enemyGroup } from './bhelp.js';

// 名のある人を置く。team 0 は味方、1 は敵。o.guard で供の侍、o.ash で足軽を添える。既定は討たれない（筋書きで最期を見せる人は o.mortal）。
export function evPerson(rt, team, name, at, facing = 0, o = {}) {
  const make = team === 0 ? allyGroup : enemyGroup;
  const list = [{ type: o.type || 'busho', n: 1, o: { name, invuln: !o.mortal, ...(o.u || {}) } }];
  if (o.guard) list.push({ type: 'samurai', n: o.guard, o: { keep: true } });
  if (o.ash) list.push({ type: 'ashigaru', n: o.ash, o: { keep: true } });
  const g = make(rt, { fixed: true, fullStrength: true, name: o.gname || name, anchor: { x: at.x, z: at.z }, facing, order: o.order || 'hold', width: o.width || 4, aggro: o.aggro ?? (o.calm ? 0 : 6), ...(o.g || {}) }, list);
  if (o.calm) for (const u of g.units) { u.noTarget = true; }
  return g;
}

// 自分が pos の r m 内へ着いたら fn。印と右上の一行を出す。o.limit 秒で着かない時も fn（詰まらないように）。
export function evReach(rt, id, pos, r, objText, label, fn, o = {}) {
  const F = rt.flags, key = '_ev_' + id;
  F[key] = { t: 0 };
  rt.obj(id, objText, 'main', true);
  rt.marker(id, typeof pos === 'function' ? pos : () => pos, label, { h: o.h || 3 });
  const tick = () => {
    if (rt.over || !F[key]) return;
    const p = typeof pos === 'function' ? pos() : pos, me = rt.player.u.pos;
    F[key].t += 0.5;
    if ((!o.canReach || o.canReach(rt, p)) && (!p || Math.hypot(me.x - p.x, me.z - p.z) < r || F[key].t > (o.limit || 90))) {
      F[key] = null; rt.unmark(id); rt.objDone(id); fn(rt); return;
    }
    rt.after(0.5, tick, true);
  };
  rt.after(0.5, tick, true);
}

// 場面を順に流す：[[秒, (rt) => {}], …]。秒は前の場面からの間。
export function evScenes(rt, list, done) {
  let i = 0;
  const step = () => {
    if (rt.over && !list.allowOver) return;
    if (i >= list.length) { if (done) done(rt); return; }
    const [sec, fn] = list[i++];
    rt.after(sec, () => { if (!rt.over) fn(rt); step(); }, true);
  };
  step();
}

// evPerson で置いた人を場から消す（城を離れた・退いた）。討たれた扱いにしない。
export function evRemove(rt, g) {
  if (!g) return;
  for (const u of [...g.units]) if (u.alive && !u.gone) { u.fleeing = false; rt.army.despawn(u); }
}
