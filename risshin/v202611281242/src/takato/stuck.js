// 高遠城：四十五秒動けない時は、歩いて届く寄せ道へ案内し直す。
// 待つだけで本人や配下を移したり、門・塀・空堀を飛ばしたりしない。
import { localClear } from '../army_local_way.js';
import { askThen } from '../b_opening.js';

export function tick(rt, guideId, road) {
  const F = rt.flags, me = rt.player.u, P = me.pos;
  if (F.ending || rt.over || !me.alive || F.step < 1) {
    F.tkStuck = F.tkRecovery = null; rt.unmark('tk-recover'); return;
  }
  if (F.tkRecovery) {
    const q = F.tkRecovery;
    // 11/18 16:50 クラウド持ち主（act bot 1080秒 刻限切れ：③の段で本人が (-17,8) へ流れた後も「寄せ道へ戻る」の印が七十m 先 (57,10) に残り、任務の印へ戻れなかった）：
    //   十六m 内で立てた戻りの印は、本人が二十四m より離れたら古いとして消す
    const far = Math.hypot(P.x - q.x, P.z - q.z) > 24;
    if (far || Math.hypot(P.x - q.x, P.z - q.z) < .8 || !localClear(rt.army, P, q, true)) {
      F.tkRecovery = null; rt.unmark('tk-recover');
    } else return;
  }
  const S = F.tkStuck;
  // 敵が隣にいても、四十五秒のあいだ傷も討ち取りも動きも無ければ止まっている（三の丸の隅で城兵と向き合ったまま六百秒）
  // 別の曲輪で味方が敵を討っても、本人の足止めは解けていない。
  // 手当ての回復でも時計を戻さず、本人の移動・被弾・討ち取りで見直す。
  const kills = rt.tracker?.kills || 0;
  const hp = Math.round(me.hp);
  // 11/18 追い（main の流しで「寄せ道へ戻る」のまま三の丸の備えに囲まれ、78,−14 から三十五秒動けず倒れた）：
  //   道へ戻る途中で命が半分を切った時は、斬られても止まりの時計を戻さず、十二秒動けなければすぐ道の点へ下ろす
  // 三の丸で諏訪勝右衛門の備えに囲まれ、命三割のまま四十秒同じ所で斬られ続けた時も同じ（囲まれた時は六歩より遠い道の点へ）
  // （11/18 囲まれた時を六割・八秒にした試しは、本丸へ進めず十八分の打ち切り2回・倒れ1回で戻した）
  const back = (!!F.roadGuide?.returning || !!me.mobbed) && me.hp < me.maxHp * 0.5;
  if (!S || Math.hypot(P.x - S.x, P.z - S.z) > (back ? 2 : 6) || (hp < S.hp && !back) || S.k !== kills) {
    F.tkStuck = { x: P.x, z: P.z, t: rt.t, hp: Math.round(me.hp), k: kills };
    return;
  }
  S.hp = hp;
  if (rt.t - S.t < (back ? 12 : 45)) return;
  // 11/18 K358：道の点へ案内し直しても段差で降りられず（三の丸の南の土塁 68,−21 → 道 74,−8）、四十五秒の止まりを繰り返した。三度目は道の点へ下ろす
  F.tkStuckN = (F.tkStuckN || 0) + 1;
  if ((F.tkStuckN >= 3 || back) && road) {
    F.tkStuckN = 0;
    let bi = -1, bd = Infinity;
    for (let i = 0; i < road.length; i++) { const d = Math.hypot(road[i][0] - P.x, road[i][1] - P.z); if (d < bd && !(back && me.mobbed && d < 6)) { bd = d; bi = i; } }
    // 11/28 16:45 クラウド 高遠の一時間の持ち主（K667：act bot --mobile 493秒に本人が (-31,-10)→(-41,-8) へ一コマで10m・562秒に7m 飛んだ元＝ここの黙った置き直し。
    //   pos の書き手の見張りで分かった）：勝手に移さず、b_takato_siege.js と同じく書いたボタンを押した時だけ道の点へ（六m 内なら今まで通りすぐ）
    if (bi >= 0) {
      const [x, z] = road[bi]; F.botRoadI = F.guideRoadI = Math.max(1, bi); F.tkRecovery = null; rt.unmark('tk-recover');
      askThen(rt, x, z, '寄せ道へ戻る', () => { P.x = x; P.z = z; P.y = rt.world.heightAt(x, z); if (me.vel) { me.vel.x = 0; me.vel.z = 0; } me.mesh?.position.copy(P); });
      return;
    }
  }
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
