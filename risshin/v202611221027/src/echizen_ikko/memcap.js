// 11/22 クラウド 越前一向の持ち主（K564）：記憶4GB 以下の携帯（?mem=4・MEM_BUDGET.real＝205）で本物の兵が予算を越えていた
//   （mem=4 の描かずの数え・_eik_memcount.mjs：30秒 221・90秒 228・210〜240秒 228・300秒 209）。高遠の takato/memcap.js と同じ手：
//   三秒ごと・持ち場で待つ・斬り合っていない組の名の無い徒の兵を、本人とカメラから百m 外（またはカメラの後ろ四十m 外）の遠い組から外す（一組六人まで残す）。
//   名のある将・旗持ち・馬・本人の組・前線の兵と斬り合いは減らさない。記憶の多い端末とパソコンは今まで通り
import * as THREE from 'three';
import { MEM_BUDGET } from '../device_tier.js';
import { isTouch } from '../touch.js';
const _fw = new THREE.Vector3();
export function ikkoMemCap(rt, dt) {
  const F = rt.flags;
  if (!isTouch || !MEM_BUDGET.real || !rt.player?.u || !rt.army) return;
  if ((F._ikCapT = (F._ikCapT || 0) - dt) > 0) return;
  F._ikCapT = 3;
  let over = -MEM_BUDGET.real; for (const u of rt.army.units) if (u.alive && !u.gone && u.type !== 'porter') over++;
  if (over <= 0) return;
  const me = rt.player.u.pos, cam = rt.camera?.position;
  const farR = (p, R) => Math.hypot(p.x - me.x, p.z - me.z) > R && (!cam || Math.hypot(p.x - cam.x, p.z - cam.z) > R);
  const fw = cam && rt.camera.getWorldDirection ? rt.camera.getWorldDirection(_fw) : null;
  const behind = (p) => fw && ((p.x - cam.x) * fw.x + (p.z - cam.z) * fw.z) < -0.3 * Math.hypot(p.x - cam.x, p.z - cam.z);
  const outOfSight = (p) => farR(p, 100) || (behind(p) && farR(p, 40));
  const keep = (u) => u.name || u.isPlayer || u.isSub || u.invuln || u.mustLive || u.mounted || u.stdHeld || u.isStandard || u.keep || u.type === 'busho';
  const gs = [];
  for (const g of rt.army.groups) {
    if (g.isPlayerSquad || g.routed || g.order === 'flee' || !g.units) continue;   // 大滝寺は寄せの組も持ち場の外で attack・move のまま待つので、見えない所なら命の札を問わない
    const us = g.units.filter((u) => u.alive && !u.gone);
    const lo = us.every((u) => farR(u.pos, 150)) ? 4 : 6;   // 山の上の寺の守り（百五十m 外）は四人まで
    if (us.length <= lo || us.some((u) => u.atk || u.fleeing || u.isPlayer || (u.target && u.target.alive && u.target.pos && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 30) || !outOfSight(u.pos))) continue;
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
      if (!u.alive || u.gone || keep(u) || !(farR(u.pos, 150) || (behind(u.pos) && farR(u.pos, 60)))) continue;
      try { rt.army.despawn(u); over--; } catch (e) { /* そのまま */ }
    }
  }
}
