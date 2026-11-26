// 11/22 クラウド 高遠の持ち主（K564）：記憶4GB 以下の携帯（MEM_BUDGET.real＝205）で本物の兵が予算を越えた
//   （mem=4 の描かずの数えで 60秒 245・240秒 221・540秒 220）。手取川・根来と同じ手を高遠に合わせた物：
//   高遠は城が小さく、寄せ手の後ろの備・毛利・小笠原・行軍の列がみな本人の百m 内にいて、遠い組だけでは外せなかった（240秒 234）。
//   そこで根来と同じく、カメラの後ろ（見ている向きと逆）で四十m 外の持ち場の組も外してよい物にする。
//   三秒ごと・持ち場で待つ・斬り合っていない組の名の無い徒の兵を遠い組から外す（一組六人・三百m 外は四人まで残す）。
//   名のある将・旗持ち・馬・本人の組・前線の兵と斬り合いは減らさない。記憶の多い端末とパソコンは今まで通り
import * as THREE from 'three';
import { MEM_BUDGET } from '../device_tier.js';
import { isTouch } from '../touch.js';
const _fw = new THREE.Vector3();
// opt.skip(g)：外さない組（11/22 山中城：これから本人が斬り合う城方の組を、着く前に減らさない）
export function takatoMemCap(rt, dt, opt) {
  const skip = (opt && opt.skip) || (() => false);
  const F = rt.flags;
  if (!isTouch || !MEM_BUDGET.real || !rt.player?.u || !rt.army) return;
  if ((F._tkCapT = (F._tkCapT || 0) - dt) > 0) return;
  F._tkCapT = 3;
  let over = -MEM_BUDGET.real; for (const u of rt.army.units) if (u.alive && !u.gone && u.type !== 'porter') over++;
  if (over <= 0) return;
  const me = rt.player.u.pos, cam = rt.camera?.position;
  const farR = (p, R) => Math.hypot(p.x - me.x, p.z - me.z) > R && (!cam || Math.hypot(p.x - cam.x, p.z - cam.z) > R);
  const fw = cam && rt.camera.getWorldDirection ? rt.camera.getWorldDirection(_fw) : null;
  const behind = (p) => fw && ((p.x - cam.x) * fw.x + (p.z - cam.z) * fw.z) < -0.3 * Math.hypot(p.x - cam.x, p.z - cam.z);
  const outOfSight = (p) => farR(p, 100) || (behind(p) && farR(p, 40));
  //   道の始めの行軍の列（march_open.js の飾りの味方十八人）は、着いた後に列の誰もが見えない所なら先に外す
  const mg = F.marchG;
  if (mg && rt.t > 45) {
    const us = (mg.units || []).filter((u) => u.alive && !u.gone);
    if (us.length && us.every((u) => farR(u.pos, 70) || (behind(u.pos) && farR(u.pos, 25)))) for (const u of us) { try { rt.army.despawn(u); over--; } catch (e) { /* そのまま */ } }
  }
  //   11/22 13:40 UTC 持ち主（K564 の残り：始めの三分は列十八人が本人のそばで 217〜220）：着いた後も予算を越える間は、
  //   列のうちカメラの後ろで十二m 外か六十m 外の者を外す（六人は残す。前に見えている列は減らさない）
  if (over > 0 && mg && rt.t > 60) {
    const us = (mg.units || []).filter((u) => u.alive && !u.gone && !u.name && !u.stdHeld && !u.isStandard);
    const far = (p) => farR(p, 60) || (behind(p) && farR(p, 12));
    for (let k = us.length - 1, n = us.length; k >= 0 && over > 0 && n > 6; k--) if (far(us[k].pos)) { try { rt.army.despawn(us[k]); over--; n--; } catch (e) { /* そのまま */ } }
  }
  if (over <= 0) return;
  const keep = (u) => u.name || u.isPlayer || u.isSub || u.invuln || u.mustLive || u.mounted || u.stdHeld || u.isStandard || u.keep || u.type === 'busho';
  const gs = [];
  for (const g of rt.army.groups) {
    if (g.isPlayerSquad || g.routed || !(g.order === 'hold' || g.order === 'yari') || !g.units || skip(g)) continue;
    const us = g.units.filter((u) => u.alive && !u.gone);
    const lo = us.every((u) => farR(u.pos, 150)) ? 4 : 6; // 11/22 13:40 UTC 三百m→百五十m（信忠の旗本・仁科の旗本・二の丸の備えが百五十〜二百m で六人のまま残った）
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
    if (g.isPlayerSquad || !g.units || !(g.routed || g.order === 'flee') || skip(g)) continue;
    for (const u of g.units) {
      if (over <= 0) break;
      if (!u.alive || u.gone || keep(u) || !(farR(u.pos, 150) || (behind(u.pos) && farR(u.pos, 60)))) continue;
      try { rt.army.despawn(u); over--; } catch (e) { /* そのまま */ }
    }
  }
}
