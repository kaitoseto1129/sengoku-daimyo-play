// 11/22 クラウド 紀州の持ち主（K564 落ちない）：記憶4GB 以下の携帯（MEM_BUDGET.real＝205・3GB は180）で本物の兵が予算を越えた
//   （mem=4 の描かずの数え：千石堀 30秒 227・60秒 223・150秒 208／太田 90秒 210・120秒 216・150秒 211）。根来（negoroMemTrim）と同じ手：
//   三秒ごとに、本人とカメラから百m 外（カメラの後ろは四十m 外）・持ち場で待つ・斬り合っていない組の名の無い徒の兵を遠い組から外す（一組六人・三百m 外は四人まで残す）。
//   まだ越える時は百五十m 外へ逃げ去った組の名の無い兵を外す。名のある将・旗持ち・馬・本人の組・前線の兵と斬り合いは減らさない。記憶の多い端末とパソコンは今まで通り
//   千石堀・太田の両方の index.js の update から呼ぶ
import { isTouch as TOUCH } from '../touch.js';
import { MEM_BUDGET } from '../device_tier.js';

const LOWMEM = !!(TOUCH && MEM_BUDGET.real && MEM_BUDGET.real <= 180);
let _fw = null;
export function kishuMemTrim(rt, dt) {
  const F = rt.flags;
  if (!TOUCH || !MEM_BUDGET.real || !rt.player?.u) return;
  //   11/28 14:00 UTC：mem=4 の数え（15秒刻み）で太田 45秒 210・75秒 212（土橋を渡る雑賀衆の湧き）と越えた＝根来と同じく、兵が湧いた次のコマで外しを回す
  const nu = rt.army.units.length, grew = nu > (F._kmLen || 0); F._kmLen = nu;
  if ((F._kmCapT = (F._kmCapT || 0) - dt) > 0 && !grew) return;
  F._kmCapT = 3;
  let over = -MEM_BUDGET.real; for (const u of rt.army.units) if (u.alive && !u.gone && u.type !== 'porter') over++;
  if (over <= 0) return;
  const me = rt.player.u.pos, cam = rt.camera?.position;
  const farR = (p, R) => Math.hypot(p.x - me.x, p.z - me.z) > R && (!cam || Math.hypot(p.x - cam.x, p.z - cam.z) > R);
  const fw = cam && rt.camera.getWorldDirection ? rt.camera.getWorldDirection(_fw ||= cam.clone()) : null;
  const behind = (p) => fw && cam && ((p.x - cam.x) * fw.x + (p.z - cam.z) * fw.z) < -0.3 * Math.hypot(p.x - cam.x, p.z - cam.z);
  //   11/28：千石堀 60秒 213＝本人から75〜86m で待つ堀・長谷川の手（誰も的を持たない）が百m 線の内で外れなかった→雑賀と同じく、狙いの無い組は七十m 外から
  const outOfSight = (p, idle) => farR(p, LOWMEM ? 60 : idle ? 70 : 100) || (behind(p) && farR(p, 40));
  const keep = (u) => u.name || u.isPlayer || u.isSub || u.invuln || u.mustLive || u.mounted || u.stdHeld || u.isStandard || u.keep || u.type === 'busho';
  const gs = [];
  for (const g of rt.army.groups) {
    if (g.isPlayerSquad || g.routed || g.order !== 'hold' || !g.units) continue;
    const us = g.units.filter((u) => u.alive && !u.gone), idle = !us.some((u) => u.target && u.target.alive);
    //   11/28：雑賀と同じく、百m 外の組は四人（三百m 外は三人）まで残す。記憶3GB は一人少なく
    const lo = (us.every((u) => farR(u.pos, 300)) ? 3 : us.every((u) => farR(u.pos, 100)) ? 4 : 6) - (LOWMEM ? 1 : 0);
    if (us.length <= lo || us.some((u) => u.atk || u.fleeing || u.isPlayer || (u.target && u.target.alive && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 30) || !outOfSight(u.pos, idle))) continue;
    const c = g.center ? g.center() : us[0].pos;
    gs.push({ us, lo, d: Math.hypot(c.x - me.x, c.z - me.z) });
  }
  gs.sort((a, b) => b.d - a.d);
  for (const { us, lo } of gs) {
    if (over <= 0) break;
    const cut = us.filter((u) => !keep(u)).reverse();
    for (let k = 0; k < cut.length && over > 0 && us.length - k > lo; k++) { try { rt.army.despawn(cut[k]); over--; } catch (e) { /* そのまま */ } }
  }
  if (over > 0) for (const g of rt.army.groups) {
    if (over <= 0) break;
    if (g.isPlayerSquad || !g.units || !(g.routed || g.order === 'flee')) continue;
    for (const u of g.units) {
      if (over <= 0) break;
      if (!u.alive || u.gone || keep(u) || !(farR(u.pos, 150) || (behind(u.pos) && farR(u.pos, 40)))) continue;
      try { rt.army.despawn(u); over--; } catch (e) { /* そのまま */ }
    }
  }
}
