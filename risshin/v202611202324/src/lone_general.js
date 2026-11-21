// 11/20 K466・K468（kaito 三方ヶ原「武将だけ・数人だけが前に出て討たれる」／cloud-26・cloud-27 の確かめ：設楽原の原昌胤・馬場信春・山県昌景・土屋昌次・内藤昌豊、
//   桶狭間の終盤の井伊直盛・由比正信・山田新右衛門が、味方が十五m 内に二人以下のまま四十m 内の敵の前に立った）：
//   布陣の表で武将に付けた塊（fujin_place.js fujinMoves）の無い台本の敵将にも、旗本を付け直す。
//   一秒ごとに、本人の敵の名のある武将で、十五m 内の味方が二人以下・四十m 内に敵がいる者を、九十m 内で一番近い五人以上の同じ側の組の中（真ん中の持ち場）へ移す。
//   （先に試した「近くの兵を武将の組へ移す」は設楽原で単騎がかえって増えた＝寄せる組に兵を足すと武将ごと柵へ駆けた。武将の方を隊の中へ戻す）窓の __k468off は前後の比べの動画だけ。
export function loneGeneralTick(rt, opt = {}) {   // opt.range＝組を探す広さ（既定90m）・opt.rejoin＝組を移し直してよい秒（既定は一度だけ。関ヶ原は30）
  if (typeof window !== 'undefined' && window.__k468off) return;
  const F = rt.flags, me = rt.player?.u;
  if (!me || rt.over || (F._lgT || 0) > rt.t) return;
  F._lgT = (rt.t || 0) + 1;
  const units = rt.army.units;
  for (const u of units) {
    if (!u.alive || u.gone || u.isPlayer || u.type !== 'busho' || !u.name || u.team === me.team || u.fleeing || u._standIn || u._k06Seat || u.noTarget) continue;   // 床几の総大将・落ち延びる将は動かさない（関ヶ原）
    const g = u.group; if (!g || g.routed || !g.units) continue;
    let f = 0, foe = false;
    for (const v of units) {
      if (!v.alive || v.gone || v === u) continue;
      const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z);
      if (v.team === u.team) { if (d < 15 && !v.fleeing) f++; } else if (d < 40 && !v.civ && !v.isStruct) foe = true;
    }
    if (f > 2 || !foe) continue;
    if (rt.t - (u._lgMoved ?? -99) < 8) continue;   // 移した後は八秒、組の真ん中へ歩く間を待つ（すぐ次の組へ移し直さない）
    // 今の組に五人以上が四十m 内に立っていれば、組は替えずにその真ん中へ戻る
    { const al = g.units.filter((o) => o !== u && o.alive && !o.gone && !o.fleeing && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 40);
      if (al.length >= 5) { let cx = 0, cz = 0; for (const o of al) { cx += o.pos.x; cz += o.pos.z; } u.target = null; u.atk = null; u.moveTo = { x: cx / al.length, z: cz / al.length }; u.aiT = 3; u._lgMoved = rt.t; continue; } }
    // 九十m 内で一番近い、五人以上立つ同じ側の組（武将の今の組でなく、本陣や城の中の守りでもない）の中へ武将を移す（武将は隊の中）
    let best = null, bd = opt.range || 90;
    for (const q of rt.army.groups) {
      if (q === g || q.team !== u.team || q.routed || q.civ || q.honjin || q.interiorHold || !q.units) continue;
      const al = q.units.filter((o) => o.alive && !o.gone && !o.fleeing && !o.isPlayer); if (al.length < 5) continue;
      let cx = 0, cz = 0; for (const o of al) { cx += o.pos.x; cz += o.pos.z; } cx /= al.length; cz /= al.length;
      const d = Math.hypot(cx - u.pos.x, cz - u.pos.z); if (d < bd) { bd = d; best = { q, al, cx, cz }; }
    }
    if (best && u._lgJoined && !(opt.rejoin && rt.t - (u._lgJoinT ?? -99) >= opt.rejoin)) best = null;   // 組を移すのは一人の武将に一度だけ（三方ヶ原の小山田は本人へ駆けるたびに一人になり、七秒ごとに組から組へ移り続けた）
    if (!best) {
      // 近くに立つ組が無い時（設楽原の柵の前で旗本が撃ち減らされた武田の将）は、一番近い敵から三十m 離れる向きへ退いて味方を待つ（一人で柵や本人の前に立ち続けない）
      let e = null, ed = 1e9; for (const v of units) { if (!v.alive || v.gone || v.team === u.team || v.civ || v.isStruct) continue; const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z); if (d < ed) { ed = d; e = v; } }
      if (!e) continue;
      const dx = u.pos.x - e.pos.x, dz = u.pos.z - e.pos.z, dl = Math.hypot(dx, dz) || 1;
      const tx = u.pos.x + dx / dl * 30, tz = u.pos.z + dz / dl * 30, W = rt.world, h = W?.heightAt?.(tx, tz);
      if (W?.walkable && !W.walkable(tx, tz, h)) continue;
      u.target = null; u.atk = null; u.moveTo = { x: tx, z: tz }; u.aiT = 5; u._lgMoved = rt.t;
      continue;
    }
    const { q, al, cx, cz } = best;
    // 組の真ん中に立つ兵の持ち場を武将に（その兵には空いた持ち場を）
    let mid = null, md = 1e9; for (const o of al) { const d = Math.hypot(o.pos.x - cx, o.pos.z - cz); if (d < md) { md = d; mid = o; } }
    g.units = g.units.filter((o) => o !== u); u._lgFrom = u._lgFrom || g; u.group = q; q.units.push(u); q.initial = Math.max(q.initial || 0, q.units.filter((o) => o.alive && !o.gone).length);   // 将を足した分、初めの数も上げる（bot の「人数が初めより多い」・関ヶ原 小西の三の備 6/5）   // _lgFrom＝元の組（台本が元の組から将を探す時に使う）
    const used = new Set(q.units.filter((o) => o !== u && o.alive && !o.gone).map((o) => o.slot));
    let s = 0; while (used.has(s)) s++;
    if (mid) { u.slot = mid.slot; mid.slot = s; } else u.slot = s;
    q._slotChkAt = 0; q._fitAt = 0;
    u.target = null; u.atk = null; u.moveTo = { x: cx, z: cz }; u.aiT = 3; u._lgMoved = rt.t; u._lgJoined = true; u._lgJoinT = rt.t;
  }
}
