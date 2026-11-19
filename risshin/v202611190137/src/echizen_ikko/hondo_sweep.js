// 本堂を押さえる段（十七日の朝）：堂の中・縁の下・切岸の上で動けなくなった衆徒が一人残ると、
//   「本堂を味方と押さえる」のまま七分止まった（11/9 二巡・織田H の流し）。
//   本人が外堂・本堂の近くにいる間だけ、五秒ごとに堂の区域を見て、交戦せず詰まった者の経路を引き直す。
import { siegeFighter } from '../siege_zones.js';

export function fighting(rt, u) {
  const target = u.swing?.target || u.atk?.target || u.target;
  const ranged = !u.sidearm && (u.type === 'bow' || u.type === 'gun');
  // 庭と堂内・切岸の上下は、平面で近くても斬り合えない。重なったまま
  // 「交戦中」と数えると、通し確認で残った兵の経路をいつまでも引き直せない。
  // 突撃の状態だけで止まった者や、刀へ持ち替えた鉄砲兵の遠い標的は交戦に数えない。
  const reach = ranged ? u.range || 4 : (u.reach ?? 2.8) + .6;
  // 構え・空振りだけでは交戦にしない。壁越しや届かない高みに向けて
  // 振り続ける守兵も、止まった時間を数えて戸口への経路へ戻す。
  return !!(target && target.team !== u.team &&
    siegeFighter(target) && target.hp > 0 && !target.dying && !target.rearWound &&
    (ranged || !(u.naka || target.naka) || Math.abs(target.pos.y - u.pos.y) <= 1.8) &&
    Math.hypot(target.pos.x - u.pos.x, target.pos.y - u.pos.y, target.pos.z - u.pos.z) <= reach &&
    !rt.army.wallBetween(u.pos, -1, target.pos));
}

// 時間だけで敵を消さない。既存の戸口・石段の案内を使い、近い寄せ手へ歩かせる。
export function resume(rt, u) {
  // 倒れた者や後送中の者を、詰まった守兵として歩かせない。
  if (!siegeFighter(u) || u.hp <= 0 || u.dying || u.rearWound) return;
  let way = null, nearest = Infinity;
  for (const v of rt.army.units) {
    if (v.team === u.team || !siegeFighter(v) || v.hp <= 0 || v.dying || v.rearWound) continue;
    const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z);
    if (d >= nearest) continue;
    // 最寄りの兵への道が塞がっていても、ほかの寄せ手へ出られる道を探す。
    const candidate = rt.def.world.moveWay(rt.army, u, v.pos);
    if (!candidate || rt.army.wallBetween(u.pos, -1, candidate)) continue;
    // 戸口の折り返しが現在地を返す時は、そこへ歩き直しても詰まりが続く。
    // その兵への案内だけを飛ばし、ほかの寄せ手へ踏み出せる道を探す。
    if (Math.hypot(candidate.x - u.pos.x, candidate.z - u.pos.z) < .35) continue;
    const point = u._ikSweepWay || (u._ikSweepWay = { x: 0, z: 0 });
    point.x = candidate.x; point.z = candidate.z;
    // 戸口と堂の床は同じ平面でも高さが違う。歩く時の経路の引き直しへ
    // 高さも渡し、参道へ戻る時は使い回した床の高さを消す。
    point.y = candidate.y;
    way = point; nearest = d;
  }
  if (!way) return;
  u.target = null; u.watch = null; u.charging = false; u.moveTo = way; u.aiT = 2;
}

// 森・谷筋の残党も、堂の外で止まれば同じ経路へ戻す。五秒ごとに調べる。
export function sweepGroup(rt, g) {
  if (!g || g.routed || rt.t < (g._ikSweepAt || 0)) return;
  g._ikSweepAt = rt.t + 5;
  for (const u of g.units) {
    if (!siegeFighter(u) || u.hp <= 0 || u.dying || u.rearWound || fighting(rt, u)) {
      u._ikForestStill = null; continue;
    }
    const s = u._ikForestStill;
    if (!s || Math.hypot(u.pos.x - s.x, u.pos.z - s.z) > 1.5) {
      u._ikForestStill = { x: u.pos.x, z: u.pos.z, t: rt.t }; continue;
    }
    if (rt.t - s.t > 45) { resume(rt, u); s.t = rt.t; }
  }
}

export function tick(rt, dt, zone, near) {
  const F = rt.flags;
  if (F.ending || !zone || (F.ikHondoSweepT = (F.ikHondoSweepT || 0) - dt) > 0) return;
  F.ikHondoSweepT = 5;
  for (const u of rt.army.units) {
    if (u.team !== 1) continue;
    if (!near || !siegeFighter(u) || u.hp <= 0 || u.dying || u.rearWound || !zone.test(u.pos.x, u.pos.z) || fighting(rt, u)) {
      u._ikHondoStill = null; continue;
    }
    const s = u._ikHondoStill;
    if (!s || Math.hypot(u.pos.x - s.x, u.pos.z - s.z) > 1.5) { u._ikHondoStill = { x: u.pos.x, z: u.pos.z, t: rt.t }; continue; }
    if (rt.t - s.t > 45) { resume(rt, u); s.t = rt.t; }
  }
}

// 11/18 22:45 UTC クラウド持ち主：山狩り・奥の院の残党（三〜五人）に、本人の三十m 内で味方の隊が数十人群がり、本人の相手が消えていた（段1・段6 討0）。
//   毎コマ見て、本人が三十m 内なら groups の者は残党を狙わない（狙われた者の返しは残す）。squads の者は残党一人に一人まで（本人の槍を待つ）。
export function leaveForMe(rt, g, groups, squads) {
  const me = rt.player.u;
  if (!g || g.routed || !me.alive) return;
  const per = new Map();
  for (const a of groups) {
    const sq = squads.includes(a);
    for (const u of a.units) {
      const t = u.target;
      if (!t || t.group !== g || t.target === u || Math.hypot(t.pos.x - me.pos.x, t.pos.z - me.pos.z) >= 30) continue;
      if (sq) { const n = (per.get(t) || 0) + 1; per.set(t, n); if (n <= 1) continue; }
      u.target = null;
      // 11/19 03:30 UTC クラウド持ち主：奥の院で麓の後備え二人が残党の前で狙いを毎コマ消され二十秒棒立ち（act bot 451秒「着いて待つ」）。
      //   本人から三十m 外に残党が残っていれば、そちらへ向かわせる（本人の相手は減らさない）。
      if (!sq) {
        let best = null, bd = Infinity;
        for (const v of g.units) {
          if (!siegeFighter(v) || v.hp <= 0 || v.dying || Math.hypot(v.pos.x - me.pos.x, v.pos.z - me.pos.z) < 30) continue;
          const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z);
          if (d < bd) { bd = d; best = v; }
        }
        if (best && bd < 60) u.target = best;
      }
    }
  }
}
