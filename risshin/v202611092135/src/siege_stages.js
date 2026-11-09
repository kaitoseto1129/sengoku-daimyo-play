// siege_stages.js … 城攻めの段（docs/siege_honjin_spec_1107.md 1・5・13章）
// 「最初から乱戦にしない」：外の門 → 虎口 → 曲輪 → 本丸 を一つずつ崩す共通の決まり。
//   今の段（まだ破れていない一番手前の門）の守りだけが打って出る。奥の段の守りは持ち場で構えて待つ（aggro を小さく。号令は戦の筋書きのまま）。
//   門が破れる（opened・breached・struct.hp<=0）と、その段の守りの残りが四割を切っていれば次の段の持ち場へ退き、
//   次の段の守りが目を覚ます（元の aggro に戻す）。
// 使い方（戦の定義から。定義を足すだけ）：
//   import { siegeStages } from './siege_stages.js';
//   F.stages = siegeStages(rt, [
//     { gate: F.gates.kido, groups: [F.kidoGuard], at: { x, z } },     // 一の段（at は持ち場。退く先に使う）
//     { gate: F.gates.ni, groups: [F.niGuard], at: { x, z } },
//     { gate: null, groups: [F.honGuard], at: { x, z } },             // 本丸（門の無い最後の段）
//   ]);
//   段に report（使番の一言）・orderLine（大将の一言）・order()（第二隊・鉄砲・予備を出す）を足せば、段が長引いた時に本陣が采配する
//   F.stages.cur  … 今の段の番号
// done: () => bool を渡せば門の代わりにそれで段の終わりを決める（門の無い曲輪の口）
// gate は siege_gate.js の makeGate の戻り値か、army の struct（hp・opened を見る）
// 後の段で出て来る組は、groups を getter（get groups() { return [F.a, F.b].filter(Boolean); }）で渡せば出た時から加わる
const broken = (g) => !g || g.opened || g.breached || (g.struct ? g.struct.hp <= 0 || g.struct.opened : g.hp <= 0 || g.opened || g.alive === false);
const live = (g) => g && g.count > 0 && !g.routed;

export function siegeStages(rt, stages, o = {}) {
  const S = { cur: -1, stages };
  const calm = o.calmAggro ?? 5;
  for (const st of stages) for (const g of st.groups || []) if (g && g._stAggro == null) g._stAggro = g.aggro ?? 8;
  const tick = () => {
    // 岐阜城などの降伏中は、守りの段替えや本陣の下知を重ねない。
    if (rt.ended || rt.over || rt.flags?.ending) return;
    let cur = stages.findIndex((st) => !(st.done ? st.done() : broken(st.gate)));
    if (cur < 0) cur = stages.length - 1;
    if (cur !== S.cur) {
      const prev = S.cur;
      S.cur = cur; S.curT = rt.t; S.reported = false;
      // 破れた段の残りは、四割を切っていれば次の段へ退く
      if (prev >= 0 && prev < cur) for (let k = prev; k < cur; k++) {
        const to = stages[cur].at;
        for (const g of stages[k].groups || []) {
          if (!live(g) || !to) continue;
          const n0 = g._stN || (g._stN = g.units.length);
          if (g.count < n0 * 0.4) { g.anchor = { x: to.x, z: to.z }; g.order = 'hold'; g.aggro = calm; }
        }
      }
    }
    // 本陣の使番の知らせと大将の下知（11章）：一つの段が長引けば、使番が様子を知らせ、大将が次の手（st.order）を打つ
    const st0 = stages[cur];
    if (!S.reported && st0 && st0.report && rt.t - S.curT > (st0.reportAfter ?? o.reportAfter ?? 90)) {
      S.reported = true;
      rt.say(o.runner || '使番', st0.report, 2.6);
      if (st0.order) rt.after(2.8, () => { if (!rt.ended && !rt.over && !rt.flags?.ending && S.cur === cur) { if (st0.orderLine && o.lord) rt.say(o.lord, st0.orderLine, 2.6); st0.order(); } });
    }
    stages.forEach((st, i) => {
      for (const g of st.groups || []) {
        if (!live(g)) continue;
        if (g._stN == null) g._stN = g.units.length;
        if (g._stAggro == null) g._stAggro = g.aggro ?? 8;   // 段の途中で出て来た組（groups を getter で渡した時）
        // 奥の段の守りは、元の気の強さのままなら一度だけ抑える（戦の筋書きが号令や気の強さを変えた組には触らない。
        //   毎回 hold に戻すと、段の替わり目より先に出した打って出の号令を打ち消して止まった・稲葉山 11/8）
        if (i > cur) { if (!g._stHeld && g.aggro > calm && g.aggro === g._stAggro) { g._stHeld = true; g.aggro = calm; } }
        else if (g._stHeld) { g._stHeld = false; if (g.aggro === calm) g.aggro = g._stAggro; }
      }
    });
    rt.after(0.5, tick);
  };
  rt.after(0.5, tick);
  return S;
}
