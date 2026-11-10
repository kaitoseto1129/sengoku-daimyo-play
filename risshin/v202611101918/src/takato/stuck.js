// 高遠城：段差や堀へ落ちて抜けられない時の助け（11/10 クラウドの流し：三の丸の北の低い段（33,-44）へ落ち、
//   敵もいないまま六百秒動けず刻限が切れた）。本人が四十五秒、六歩の内から動けず、同じ高さの敵も近くにいなければ、
//   暗転して今の行き先の印（道の印・門の前）へ送る。字は出さない。
//   隣に城兵が立っていても、傷も討ち取りも無いまま四十五秒なら同じ（建物の中・塀越しの城兵と向き合ったまま止まる）。
import { k15Fade } from '../oda15_kit.js';

export function tick(rt, guideId) {
  const F = rt.flags, me = rt.player.u, P = me.pos;
  if (F.ending || rt.over || !me.alive || F.step < 1) { F.tkStuck = null; return; }
  const S = F.tkStuck;
  // 敵が隣にいても、四十五秒のあいだ傷も討ち取りも動きも無ければ止まっている（三の丸の隅で城兵と向き合ったまま六百秒）
  const kills = (F.pushKills?.san || 0) + (F.pushKills?.ni || 0) + (F.pushKills?.hon || 0) + (rt.tracker?.kills || 0);
  if (!S || Math.hypot(P.x - S.x, P.z - S.z) > 6 || S.hp !== Math.round(me.hp) || S.k !== kills) {
    F.tkStuck = { x: P.x, z: P.z, t: rt.t, hp: Math.round(me.hp), k: kills };
    return;
  }
  if (rt.t - S.t < 45) return;
  const m = (rt.markers || []).find((q) => q.id === guideId);
  let q = m && (typeof m.pos === 'function' ? m.pos() : m.pos);
  F.tkStuck = null;
  // 門脇の詰まりを助ける時も、本丸の二つの門を越したことにはしない。
  // 門が閉じている間は既存の門前の印を使い、寄せ手が実際に破るのを待つ。
  const hon = F.C?.kuruwa?.hon;
  const honOpen = () => !!F.gates?.honOuter?.opened && !!F.gates?.honInner?.opened;
  const crossesHon = (at) => hon?.test(at.x, at.z) && !hon.test(P.x, P.z) && !honOpen();
  if ((!q || Math.hypot(q.x - P.x, q.z - P.z) < 8) && F.niFell && !F.honFell && hon?.centroid && honOpen()) q = hon.centroid;
  if (!q || Math.hypot(q.x - P.x, q.z - P.z) < 8) return;
  if (crossesHon(q)) return;
  const ox = P.x, oz = P.z;
  k15Fade(rt, () => {
    if (F.ending || rt.over || !me.alive || crossesHon(q)) return;
    const put = (u, x, z) => { u.pos.x = x; u.pos.z = z; u.pos.y = rt.world.heightAt(x, z); u.vel && (u.vel.x = u.vel.z = 0); };
    put(me, q.x, q.z);
    for (const g of rt.squadGroups || []) for (const v of g.units) if (v.alive && !v.fleeing && !v.woundOut && Math.hypot(v.pos.x - ox, v.pos.z - oz) < 30) put(v, q.x - 2 + Math.random() * 4, q.z - 2 + Math.random() * 4);
  });
}
