// 11/27 クラウド k365-cloud-09（K582 の関所・受け持ち 伏見・河田・岐阜・杭瀬川）：
//   K652② の続きの段（tokugawa_more.js）は八十歩内の味方だけを寄せるので、勝った所から本人が一人で続きの段の新手に囲まれて倒れた
//   （杭瀬川 act bot 4本に2本：明石の追手・槍組に三秒で九十余の傷）。敵は弱めず、続きの段の間は近い味方の三組（百二十歩内・動ける組）を
//   本人の左・右・後ろの五歩へ一秒おきに付け直す（寄せ手の来る向きは問わない。斬り合いは持ち場の十二歩内）
const OFF = [[-5, 1], [5, 1], [0, -5]];
export function k652Escort(rt, dt) {
  const F = rt.flags, P = rt.player?.u;
  if (F.k652m !== 'on' || !P?.alive || rt.over) return;
  if ((F._k652EsT = (F._k652EsT || 0) - dt) > 0) return;
  F._k652EsT = 1;
  const p = P.pos, yaw = rt.player.yaw ?? 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const gs = rt.army.groups.filter((g) => g.team === P.team && !g.isPlayerSquad && !g.isRunner && !g.civ && !g.fixed && !g.routed && g.count >= 3 && g.center)
    .map((g) => { const c = g.center(); return { g, d: Math.hypot(c.x - p.x, c.z - p.z) }; }).filter((o) => o.d < 120).sort((a, b) => a.d - b.d).slice(0, 3);
  gs.forEach(({ g, d }, k) => {
    // 本人の向き（yaw）に合わせて左右と後ろ
    const [ox, oz] = OFF[k], x = p.x + ox * cs + oz * sn, z = p.z - ox * sn + oz * cs;
    if (g._k652sp == null) g._k652sp = g.speed || 3;
    g.speed = d > 15 ? Math.max(g._k652sp, 5.4) : g._k652sp;
    g.order = 'attack'; g.dest = null; g.onArrive = null; g.stay = false;
    g.seekRange = 12; g.aggro = Math.max(g.aggro || 0, 10);
    if (!g.anchor) g.anchor = { x, z }; else { g.anchor.x = x; g.anchor.z = z; }
  });
}
