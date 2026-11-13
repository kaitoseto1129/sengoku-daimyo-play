// 高遠城：四十五秒動けない時は、歩いて届く寄せ道へ案内し直す。
// 待つだけで本人や配下を移したり、門・塀・空堀を飛ばしたりしない。
import { localClear } from '../army_local_way.js';

export function tick(rt, guideId, road) {
  const F = rt.flags, me = rt.player.u, P = me.pos;
  if (F.ending || rt.over || !me.alive || F.step < 1) {
    F.tkStuck = F.tkRecovery = null; rt.unmark('tk-recover'); return;
  }
  if (F.tkRecovery) {
    const q = F.tkRecovery;
    if (Math.hypot(P.x - q.x, P.z - q.z) < .8 || !localClear(rt.army, P, q, true)) {
      F.tkRecovery = null; rt.unmark('tk-recover');
    } else return;
  }
  const S = F.tkStuck;
  // 敵が隣にいても、四十五秒のあいだ傷も討ち取りも動きも無ければ止まっている（三の丸の隅で城兵と向き合ったまま六百秒）
  // 別の曲輪で味方が敵を討っても、本人の足止めは解けていない。
  // 手当ての回復でも時計を戻さず、本人の移動・被弾・討ち取りで見直す。
  const kills = rt.tracker?.kills || 0;
  const hp = Math.round(me.hp);
  if (!S || Math.hypot(P.x - S.x, P.z - S.z) > 6 || hp < S.hp || S.k !== kills) {
    F.tkStuck = { x: P.x, z: P.z, t: rt.t, hp: Math.round(me.hp), k: kills };
    return;
  }
  S.hp = hp;
  if (rt.t - S.t < 45) return;
  const m = (rt.markers || []).find((q) => q.id === guideId);
  let q = m && (typeof m.pos === 'function' ? m.pos() : m.pos);
  F.tkStuck = null;
  // 今の場所から実際に歩いて届く道の点だけへ案内し直す。
  // 開門済みでも塀・建物・切岸は越さず、本人と配下の位置には触れない。
  if (!q || !road) return;
  let best = Infinity, index = -1;
  const probe = F.tkProbe || (F.tkProbe = { x: 0, y: 0, z: 0 });
  for (let i = 0; i < road.length; i++) {
    probe.x = road[i][0]; probe.z = road[i][1]; probe.y = P.y;
    const distance = Math.hypot(probe.x - P.x, probe.z - P.z);
    if (distance < 2 || distance > 16) continue;
    const score = Math.hypot(probe.x - q.x, probe.z - q.z) + distance * .1;
    if (score >= best || !localClear(rt.army, P, probe, true)) continue;
    best = score; index = i;
  }
  if (index < 0) return;
  probe.x = road[index][0]; probe.z = road[index][1]; probe.y = P.y;
  F.tkRecovery = probe;
  F.botRoadI = F.guideRoadI = Math.max(1, index);
  rt.marker('tk-recover', probe, '寄せ道へ戻る');
}
