// 退く道を兵の体や追手の刃が塞ぐ時、道の内側の隙間へ一歩ずれる。
// 兵を動かしたり消したりせず、遊び手の歩く向きだけを選ぶ。
export function retreatThroughGap(b, inp, allowed, distance = 1.5, avoidBlades = false, awayFrom = null) {
  if (!inp.k.has('KeyW')) return;
  const p = b.player, u = p.u;
  const q = b._botRetreatGap || (b._botRetreatGap = { at: -1, yaw: 0, goal: 0, x: 0, z: 0, open: false, step: { x: 0, z: 0 } });
  const goal = p.yaw, stride = Math.max(.3, Math.min(1.5, distance));
  // 走って角へ着いた時は、四分の一秒を待たず今の足場から調べ直す。
  // 刃から離れる時は、本人が止まっていても横槍と兵の隙間が変わる。
  // 普段の道よけだけ覚え、目前の刃を避ける判断では毎回調べ直す。
  if (!avoidBlades && q.at > b.t && q.avoidBlades === avoidBlades && q.awayFrom === awayFrom && Math.abs(stride - q.stride) < .05 && Math.cos(goal - q.goal) > 0.95 &&
      Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < .35) {
    p.yaw = q.yaw;
    if (!q.open) inp.k.delete('KeyW');
    return;
  }
  q.at = b.t + 0.25; q.goal = goal; q.yaw = goal; q.x = u.pos.x; q.z = u.pos.z; q.stride = stride; q.avoidBlades = avoidBlades;
  q.awayFrom = awayFrom;
  let best = -Infinity;
  // 前と横が詰まった時は、斜め後ろへ一歩離れてから道へ戻る余地も探す。
  // 八方向が全部塞がった時だけ、その間の八方向も調べる。
  // 斜めの戸口や兵の肩の隙間を見落として、退けるのに突きを待たない。
  // 普段の探索回数と、壁・火・刃を通さない条件は保つ。
  for (let i = 0; i < 16; i++) {
    if (i === 8 && best > -Infinity) break;
    const turn = i < 8
      ? i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1) * Math.PI / 4
      : (2 * Math.floor((i - 8) / 2) + 1) * (i % 2 ? -1 : 1) * Math.PI / 8;
    const yaw = goal + turn, sx = Math.sin(yaw), sz = Math.cos(yaw);
    // 待ち場では追手の側を候補から外す。選んだ後で捨てると、通れる横道まで見落とす。
    if (awayFrom !== null && Math.cos(yaw - awayFrom) > .01) continue;
    const step = q.step;
    step.x = u.pos.x + sx * stride; step.z = u.pos.z + sz * stride;
    if (b.army.wallBetween(u.pos, -1, step) || !b.world.walkable(step.x, step.z, u.pos.y) ||
        Math.abs(b.world.heightAt(step.x, step.z) - u.pos.y) > 1.5 || allowed && !allowed(b, step)) continue;
    // 終点だけ安全な向きを選んだ後で止まると、横の通れる道を見落とす。
    // 刃から走って退く時は、途中の半歩も候補を選ぶ前に調べる。
    if (avoidBlades) {
      let clear = true;
      for (let n = 1; clear && n <= 3; n++) {
        step.x = u.pos.x + sx * stride * n / 3;
        step.z = u.pos.z + sz * stride * n / 3; step.y = u.pos.y;
        clear = b.world.walkable(step.x, step.z, u.pos.y) &&
          Math.abs(b.world.heightAt(step.x, step.z) - u.pos.y) <= 1.5 && (!allowed || allowed(b, step));
      }
      if (!clear) continue;
    }
    let crowd = 0, unsafe = false;
    for (const o of b.army.units) {
      if (o === u || !o.alive || o.gone || o.downed || o.noTarget || o.isStruct || o.group?.hidden ||
          Math.abs(o.pos.y - u.pos.y) > 2) continue;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z;
      if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
      // 行き先だけでなく一歩の途中も調べ、兵を突き抜ける道を選ばない。
      const along = Math.max(0, Math.min(stride, dx * sx + dz * sz));
      const gap = Math.hypot(dx - sx * along, dz - sz * along);
      const end = Math.hypot(o.pos.x - step.x, o.pos.z - step.z);
      // 初めから離れる歩みだけ通す。終点が遠くても、途中で兵の体を横切る足は塞がる。
      const clearance = dx * sx + dz * sz <= 0 ? end : gap;
      if (avoidBlades && clearance < 1.4 && clearance + .01 < Math.hypot(dx, dz) &&
          !b.army.wallBetween(u.pos, -1, o.pos)) { unsafe = true; break; }
      // 塀の向こうの密集は、こちらの戸口や曲輪の足場を塞がない。
      if (clearance < 1.4 && !b.army.wallBetween(u.pos, -1, o.pos)) crowd += (1.4 - clearance) * 6;
      // 肩が空いていても、本人を狙う槍の前へ退けば次の突きを受ける。
      // 順番待ちは体だけ数え、実際の追手から刃の外へ離れる向きを選ぶ。
      const pursuing = o.target === u || o.atk?.target === u || o.swing && !o.swing.done && o.swing.target === u;
      // 待ち場から離れる一歩では、着地点だけでなく振り出された横槍の途中も除く。
      const striking = o.atk?.target === u && !o.atk.ranged && !o.atk.bow ||
        o.swing?.target === u && !o.swing.done;
      if (avoidBlades && o.team !== u.team && !o.fleeing && !o.woundOut &&
          (striking || pursuing && !o.playerQueue && (o.sidearm || o.type !== 'gun' && o.type !== 'bow')) &&
          gap < (o.reach || 2.8) + .6 && gap + .01 < Math.hypot(dx, dz) &&
          !b.army.wallBetween(u.pos, -1, o.pos)) { unsafe = true; break; }
      if (o.team !== u.team && pursuing && !o.playerQueue && !o.fleeing && !o.group?.routed &&
          !o.woundOut && !o.rearWound && (o.sidearm || o.type !== 'gun' && o.type !== 'bow')) {
        const reach = (o.reach || 2.8) + 0.8;
        if (end < reach && !b.army.wallBetween(o.pos, -1, u.pos, (o.wpnKind || o.lookWeapon) === 'spear')) {
          crowd += (reach - end) * 3;
        }
      }
    }
    if (unsafe) continue;
    const score = Math.cos(turn) * 2 - crowd;
    if (score > best) { best = score; q.yaw = yaw; }
  }
  // 道の内側に歩ける一歩が無い間は壁へ押し続けず、次の探し直しを待つ。
  q.open = best > -Infinity;
  if (!q.open) inp.k.delete('KeyW');
  p.yaw = q.yaw;
}

// 待ち場へ刃が届いたら、廃止された回避ではなく普段の駆け足で一歩離れる。
// 向きは打ち手へ残す。気力を条件にせず、壁・火・切岸と兵の隙間を調べる。
export function retreatRunFromBlade(b, inp, allowed, direction = null) {
  const p = b.player, u = p.u, face = p.yaw;
  if (p.mounted || u.climb || p.knockT > 0) return false;
  // 印へ向かう棒を先に取り消す。退ける隙間が無い時や途中の足場が悪い時に、
  // 直前の歩みだけが残って、危険と判定した刃へ走り続けないようにする。
  inp.axis = null; inp.runHeld = false;
  // 道を移る途中は、その退路を優先する。待ち場では追手の反対側を探す。
  p.yaw = direction ?? face + Math.PI;
  inp.k.add('KeyW');
  retreatThroughGap(b, inp, allowed, 1.5, true, direction === null ? face : null);
  const walk = p.yaw, moving = inp.k.has('KeyW');
  inp.k.delete('KeyW'); p.yaw = face;
  if (!moving || direction === null && Math.cos(walk - face) > .01) return false;
  // 終点だけが平らでも、途中の切岸や火を横切らない。
  const step = b._botRetreatRunPoint || (b._botRetreatRunPoint = { x: 0, y: 0, z: 0 });
  for (let i = 1; i <= 3; i++) {
    step.x = u.pos.x + Math.sin(walk) * i * .5;
    step.z = u.pos.z + Math.cos(walk) * i * .5; step.y = u.pos.y;
    if (!b.world.walkable(step.x, step.z, u.pos.y) ||
        Math.abs(b.world.heightAt(step.x, step.z) - u.pos.y) > 1.5 ||
        allowed && !allowed(b, step)) return false;
  }
  const axis = b._botRetreatRunAxis || (b._botRetreatRunAxis = { x: 0, y: 0 });
  axis.x = Math.sin(face - walk); axis.y = -Math.cos(walk - face);
  inp.axis = axis; inp.runHeld = true;
  return true;
}

// 戸口や手当ての印で止まっていても、目前の刃には退路の側へかわす。
// 一歩が空いているだけでは足りない。回避の三歩全部を調べる。
export function retreatDodge(b, inp, walk, allowed) {
  // 携帯には避ける釦が無い（Simple is the best）。押せない Space のために歩みを止めて立ち尽くさない。
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('touch')) return false;
  const p = b.player, u = p.u;
  const step = b._botRetreatDodgePoint || (b._botRetreatDodgePoint = { x: 0, y: 0, z: 0 });
  for (let i = 0; i < 5; i++) {
    const turn = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1) * Math.PI / 4;
    const yaw = walk + turn, sx = Math.sin(yaw), sz = Math.cos(yaw);
    let clear = true;
    for (let n = 1; clear && n <= 3; n++) {
      step.x = u.pos.x + sx * n; step.z = u.pos.z + sz * n; step.y = u.pos.y;
      clear = !b.army.wallBetween(u.pos, -1, step) && b.world.walkable(step.x, step.z, u.pos.y) &&
        Math.abs(b.world.heightAt(step.x, step.z) - u.pos.y) <= 1.5 && (!allowed || allowed(b, step));
    }
    if (!clear) continue;
    for (const o of b.army.units) {
      if (o === u || !o.alive || o.gone || o.downed || o.noTarget || o.isStruct || o.group?.hidden ||
          Math.abs(o.pos.y - u.pos.y) > 2) continue;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z;
      if (Math.abs(dx) > 7 || Math.abs(dz) > 7 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
      const forward = dx * sx + dz * sz, along = Math.max(0, Math.min(3, forward));
      const end = Math.hypot(o.pos.x - step.x, o.pos.z - step.z);
      const gap = Math.hypot(dx - sx * along, dz - sz * along);
      // 追う相手と、既に振り出した刃の相手は別。戸口で止まった時も
      // 本人へ残る突き・横薙ぎの間合いへ回避しない。
      const striking = o.atk?.target === u && !o.atk.ranged && !o.atk.bow ||
        o.swing?.target === u && !o.swing.done;
      const pursuing = !o.playerQueue && o.target === u &&
        (o.sidearm || o.type !== 'gun' && o.type !== 'bow');
      // 既に触れている兵から離れる足は通し、途中で肩を横切る足は除く。
      // 着地点が安全でも、途中で横槍へ近づく回避は選ばない。
      // 初めから離れる足を丸め誤差で塞がないよう、一センチの余裕を残す。
      if ((forward <= 0 ? end : gap) < 1.4 ||
          o.team !== u.team && !o.fleeing && !o.woundOut && (striking || pursuing) &&
          gap < (o.reach || 2.8) + .6 && gap + .01 < Math.hypot(dx, dz)) { clear = false; break; }
    }
    if (!clear) continue;
    const axis = b._botRetreatDodgeAxis || (b._botRetreatDodgeAxis = { x: 0, y: 0 });
    axis.x = Math.sin(p.yaw - yaw); axis.y = -Math.cos(yaw - p.yaw);
    inp.axis = axis; inp.k.delete('KeyW'); inp.runHeld = false;
    inp.e.add('Space');
    return true;
  }
  return false;
}
