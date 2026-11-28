// 11/20 クラウドす（K435・K452 kaito「ただ立っているだけの棒人間がまだいる」）：
//   描かずの通し（780秒・本人の30m内で8秒動かず相手も振りも無い者を数えた）で、立ち尽くす者のほとんどは
//   寺の四方の通りに置いた明智の塊（fujin_layout の honnoji・noEngage・hold）だった（319〜423秒 西洞院の備・町の通りの備で一度に二十〜三十人）。
//   塊は持ち場で待つだけなので、塀の外で寺を囲んだまま人形のように立っていた。
//   鬨の声（F.honnoShoutT）の後、本人から80m内の通りの塊は：
//   ①九〜十五秒おきに塊ごと寺の方へ一歩半押し出し、三秒半で元の持ち場へ戻る（押し寄せては退く寄せ手の波。持ち場・数・号令は変えない）
//   ②押し出す時は前の者たちが得物を振り上げて鬨を上げ（u.cheer・近ければ鬨の声）、待つ間も一人ずつ時々振り上げる
//   走り回らせない（K459）：動くのは塊の押し出しの一歩半だけ。斬り合い中・弾込め・打たれた者は触らない。
const PUSH = 1.6, PUSH_T = 3.5;
export function streetLife(rt, dt, center) {
  const F = rt.flags;
  if (!F.honnoShoutT || rt.over) return;
  if ((F._slT = (F._slT || 0) - dt) > 0) return;
  F._slT = 0.5;
  const me = rt.player?.u, list = F._fj;
  if (!me || !list || !list.length) return;
  const t = rt.t;
  for (const g of list) {
    const r = g && g._fjR;
    if (!r || !r.noEngage || g.team === me.team || g.routed || !(g.count > 0) || g._fjMoving) continue;
    // 11/28 13:35 UTC クラウド 本能寺の持ち主（act bot 1321-2 196秒 alarm：『西洞院の備 三』5人が号令 move・行き先無しのまま (6,96) で一点に重なり止まった）：
    //   持ち場で待つだけの通りの塊が、行き先の無い move のまま残ったら、持ち場で待つ（hold）へ戻す（持ち場・数は変えない）
    if (g.order === 'move' && !g.dest && !g.onArrive) { g.order = 'hold'; if (!g.anchor) g.anchor = { x: r.x, z: r.z }; g.focus = null; }
    const S = g._sl || (g._sl = { next: t + 2 + ((g.id ?? 0) % 7) * 1.3, base: null, back: 0 });
    // 押し出しの戻り（ほかの仕組みが持ち場を替えていたら、そちらを残す）
    if (S.base && t >= S.back) {
      if (g.anchor === S.pushed) g.anchor = S.base;
      S.base = null; S.pushed = null;
    }
    const a = g.anchor || r;
    const d = Math.hypot(a.x - me.pos.x, a.z - me.pos.z);
    if (d > 80) continue;
    const us = g.units || [];
    if (!S.base && t >= S.next && g.order === 'hold' && g.anchor) {
      S.next = t + 9 + Math.random() * 6;
      const dx = center.x - a.x, dz = center.z - a.z, k = Math.hypot(dx, dz) || 1;
      S.base = g.anchor;
      S.pushed = g.anchor = { x: a.x + dx / k * PUSH, z: a.z + dz / k * PUSH };
      S.back = t + PUSH_T;
      // 前の者（寺に近い半分）が鬨を上げて得物を振り上げる
      for (const u of us) {
        if (!u.alive || u.gone || u.atk || u.swing || u.target || u.reload || u.hit || u.fleeing) continue;
        if ((u.pos.x - a.x) * dx + (u.pos.z - a.z) * dz < 0) continue;
        u.cheer = 0.7 + Math.random() * 0.7;
      }
      if (d < 45 && t > (F._slShoutT || 0)) { F._slShoutT = t + 5; try { rt.army.play('eshout', { x: a.x, z: a.z }, 0.6); } catch (e) { /* 声が無くても動きは残す */ } }
      continue;
    }
    // 待つ間：二十人に一人ほどが時々振り上げる
    for (const u of us) {
      if (!u.alive || u.gone || u.cheer > 0 || u.atk || u.swing || u.target || u.reload || u.hit || u.fleeing) continue;
      if (Math.random() < 0.025) u.cheer = 0.6 + Math.random() * 0.5;
    }
  }
  // 11/28 クラウド 本能寺の持ち主（K452 の続き）：描かずの通しで、塀の外を一人ずつ据えて囲む明智勢（K449 の寺を囲む明智勢・持ち場に据えて動かない）が
  //   229〜480秒の間ずっと一人も動かず立っていた（本人の40m内で五秒動かず相手も振りも無い者の数えで、この組が毎回出る）。
  //   据えた所は変えず（走らせない・K459）、待つ間に時々得物を振り上げて鬨を上げる（通りの塊と同じ二十人に一人ほど・本人の80m内だけ）。
  for (const g of F.wallGuard?.groups || []) {
    for (const u of g.units || []) {
      if (!u.alive || u.gone || u.cheer > 0 || u.atk || u.swing || u.target || u.reload || u.hit || u.fleeing) continue;
      if (Math.abs(u.pos.x - me.pos.x) > 80 || Math.abs(u.pos.z - me.pos.z) > 80) continue;
      if (Math.random() < 0.025) u.cheer = 0.6 + Math.random() * 0.5;
    }
  }
}
// 11/28 15:20 UTC クラウド 本能寺の持ち主（act bot 1447 829秒 end1：斎藤利三の備19人が号令 attack・行き先1m のまま、
//   本人から遠い門前の通り (-170,60) の一点に重なって止まった）：御殿と最後の段（goten・end1）では、
//   本人から四十五m より遠く、だれも相手を持たず、塊がほとんど動かない攻めの備は、今の所を持ち場にして寺の方を向いて構える
//   （hold・寄せの強さは下げる。数・名は変えない。近づけば斬り合う）。散らしは共通の hold の並びに任せる。
export function farAttackRest(rt) {
  const F = rt.flags, me = rt.player?.u;
  if (!me?.alive || rt.over || !(rt.phase === 'goten' || rt.phase === 'end1')) return;
  if (rt.t < (F._farAtkT || 0)) return;
  F._farAtkT = rt.t + 1;
  for (const g of rt.army.groups || []) {
    if (!g || g.team === me.team || g.routed || g.order !== 'attack' || g._hsFocus || g === F.chase) continue;
    const us = (g.units || []).filter((u) => u.alive && !u.gone);
    if (us.length < 3) continue;
    let cx = 0, cz = 0, near = false, busy = false;
    for (const u of us) {
      cx += u.pos.x; cz += u.pos.z;
      if (Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) < 45) { near = true; break; }
      if (u.target || u.atk || u.swing) busy = true;
    }
    if (near || busy) { g._farAtk = null; continue; }
    cx /= us.length; cz /= us.length;
    const S = g._farAtk;
    if (!S || Math.hypot(S.x - cx, S.z - cz) > 1.5) { g._farAtk = { x: cx, z: cz, t: rt.t }; continue; }
    if (rt.t - S.t < 3) continue;
    g.order = 'hold'; g.anchor = { x: cx, z: cz }; g.aggro = Math.min(g.aggro || 4, 4); g.focus = null; g.onArrive = null; g.dest = null;
    g._farAtk = null;
  }
}
