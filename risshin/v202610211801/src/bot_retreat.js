// 退く道を兵の体や追手の刃が塞ぐ時、道の内側の隙間へ一歩ずれる。
// 兵を動かしたり消したりせず、遊び手の歩く向きだけを選ぶ。
export function retreatThroughGap(b, inp, allowed) {
  if (!inp.k.has('KeyW')) return;
  const p = b.player, u = p.u;
  const q = b._botRetreatGap || (b._botRetreatGap = { at: -1, yaw: 0, goal: 0, x: 0, z: 0, open: false, step: { x: 0, z: 0 } });
  const goal = p.yaw;
  // 走って角へ着いた時は、四分の一秒を待たず今の足場から調べ直す。
  if (q.at > b.t && Math.cos(goal - q.goal) > 0.95 &&
      Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < .35) {
    p.yaw = q.yaw;
    if (!q.open) inp.k.delete('KeyW');
    return;
  }
  q.at = b.t + 0.25; q.goal = goal; q.yaw = goal; q.x = u.pos.x; q.z = u.pos.z;
  let best = -Infinity;
  // 前と横が詰まった時は、斜め後ろへ一歩離れてから道へ戻る余地も探す。
  for (let i = 0; i < 8; i++) {
    const turn = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1) * Math.PI / 4;
    const yaw = goal + turn, sx = Math.sin(yaw), sz = Math.cos(yaw);
    const step = q.step;
    step.x = u.pos.x + sx * 1.5; step.z = u.pos.z + sz * 1.5;
    if (b.army.wallBetween(u.pos, -1, step) || !b.world.walkable(step.x, step.z, u.pos.y) ||
        Math.abs(b.world.heightAt(step.x, step.z) - u.pos.y) > 1.5 || allowed && !allowed(b, step)) continue;
    let crowd = 0;
    for (const o of b.army.units) {
      if (o === u || !o.alive || o.gone || o.downed || o.noTarget || o.isStruct || o.group?.hidden ||
          Math.abs(o.pos.y - u.pos.y) > 2) continue;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z;
      if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
      // 行き先だけでなく一歩の途中も調べ、兵を突き抜ける道を選ばない。
      const along = Math.max(0, Math.min(1.5, dx * sx + dz * sz));
      const gap = Math.hypot(dx - sx * along, dz - sz * along);
      const end = Math.hypot(o.pos.x - step.x, o.pos.z - step.z);
      // 初めから離れる歩みだけ通す。終点が遠くても、途中で兵の体を横切る足は塞がる。
      const clearance = dx * sx + dz * sz <= 0 ? end : gap;
      // 塀の向こうの密集は、こちらの戸口や曲輪の足場を塞がない。
      if (clearance < 1.4 && !b.army.wallBetween(u.pos, -1, o.pos)) crowd += (1.4 - clearance) * 6;
      // 肩が空いていても、本人を狙う槍の前へ退けば次の突きを受ける。
      // 順番待ちは体だけ数え、実際の追手から刃の外へ離れる向きを選ぶ。
      const pursuing = o.target === u || o.atk?.target === u || o.swing && !o.swing.done && o.swing.target === u;
      if (o.team !== u.team && pursuing && !o.playerQueue && !o.fleeing && !o.group?.routed &&
          !o.woundOut && !o.rearWound && (o.sidearm || o.type !== 'gun' && o.type !== 'bow')) {
        const reach = (o.reach || 2.8) + 0.8;
        if (end < reach && !b.army.wallBetween(o.pos, -1, u.pos, (o.wpnKind || o.lookWeapon) === 'spear')) {
          crowd += (reach - end) * 3;
        }
      }
    }
    const score = Math.cos(turn) * 2 - crowd;
    if (score > best) { best = score; q.yaw = yaw; }
  }
  // 道の内側に歩ける一歩が無い間は壁へ押し続けず、次の探し直しを待つ。
  q.open = best > -Infinity;
  if (!q.open) inp.k.delete('KeyW');
  p.yaw = q.yaw;
}
