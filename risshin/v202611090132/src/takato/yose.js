// ======================================================================
// 高遠城　寄せの道しるべ（3〜11分・docs/oda15_plan_1108.md 30「城門攻撃・堀/土塁／曲輪突破」）
// 総攻めの間、行き先を一つずつ示す：大手門の前（打って出た城兵を受ける）→ 三の丸 → 二の丸の土橋。
// 11/8 bot：元の流れでは、門の前や三の丸の高みで足が止まり、十分を過ぎても曲輪が落ちない事があった（段を入れる前から）。
//   主人公がその曲輪の近くで味方と戦っているのに時間だけが過ぎる時は、味方の総懸かりで門が破れ、曲輪が落ちる
//   （その日のうちに落ちた城。時間を敵の数で伸ばさない）。主人公が離れている時は落とさない。
// 入れ方：takato/kakoi.js の総攻めの始めから start(rt, def, K)。
// ======================================================================
const near = (rt, p, r) => Math.hypot(rt.player.u.pos.x - p.x, rt.player.u.pos.z - p.z) < r;

export function start(rt, def, K) {
  const F = rt.flags;
  if (F.k15yose) return;
  F.k15yose = true; F.k15on = true; F.k15fight = false;
  const t0 = rt.t, OTE = K.OTE, SAN = { x: 60, z: 2 }, NI = K.GATE_NI;
  const heal = () => { const u = rt.player.u; if (u.alive) u.hp = Math.max(u.hp, u.maxHp * 0.85); };
  const tick = () => {
    if (F.ending || rt.over || F.k15hon) return;
    let at = null;
    if (!F.sanFell) {
      at = { x: OTE.x + 10, z: OTE.z };
      if (rt.t - t0 > 90 && !(F.sallyContact >= 4) && !F.sallyPlayerKill && near(rt, OTE, 40)) F.sallyPlayerKill = true;   // 門の前で城兵を受けた
      if (F.sallyPlayerKill || F.sallyContact >= 4) at = { x: OTE.x - 6, z: OTE.z - 6 };
      if (rt.t - t0 > 200 && near(rt, OTE, 50)) {
        for (const q of [F.gates.oteOuter, F.gates.oteInner]) if (!q.opened) q._openNow?.(true);
        def.onZoneFall.call(def, rt, 'san'); heal();
      }
    } else if (!F.niFell) {
      at = { x: NI.x + 14, z: NI.z };
      if (rt.t - (F.sanT ?? rt.t) > 180 && near(rt, NI, 50)) {
        if (!F.gates.gateNi.opened) F.gates.gateNi._openNow?.(true);
        def.onZoneFall.call(def, rt, 'ni'); heal();
      }
    }
    F.k15at = at ? { id: 'yose', at: () => at, r: 6, t0: rt.t } : null;
    rt.after(0.5, tick, true);
  };
  tick();
}
