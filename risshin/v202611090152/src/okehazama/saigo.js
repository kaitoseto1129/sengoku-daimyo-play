// ======================================================================
// 桶狭間 12〜13分：義元の最期（毛利新介が届かない時の保険）
//   『信長公記』：服部小平太が義元にかかって膝を斬られ、毛利新介が義元を斬り伏せて首を取った。
//   義元が深手を負ってから五十秒たっても、退く旗本の囲みや地形に阻まれて毛利の刃が届かない時は、
//   毛利新介が囲みの切れ目を駆け抜けて義元へ寄り（歩く速さの倍。瞬間移動はしない）、間合いに入った所で討つ。
// ======================================================================
const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;

export function tick(rt, dt) {
  const F = rt.flags, y = F.yoshimoto, mor = F.nobKill?.[1];
  if (rt.over || F.ending || F.victory || !F.yoshiDown || !y?.alive || rt.t - F.yoshiDownT < 50) return;
  if (!ready(mor)) {
    // 毛利が手当て中・討死なら、ほかの馬廻が寄る（首を取った者の名は本体の台詞のまま）
    if (rt.t - F.yoshiDownT < 90) return;
  }
  const k = ready(mor) ? mor : (F.nob?.units || []).find((u) => ready(u) && !u.isPlayer && u.name !== '織田信長');
  if (!k) return;
  const d = Math.hypot(k.pos.x - y.pos.x, k.pos.z - y.pos.z);
  if (d > 2.2) {
    const step = Math.min(d - 2, 6 * dt) / d;
    k.pos.x += (y.pos.x - k.pos.x) * step; k.pos.z += (y.pos.z - k.pos.z) * step;
    k.pos.y = rt.world.heightAt(k.pos.x, k.pos.z); k.yaw = Math.atan2(y.pos.x - k.pos.x, y.pos.z - k.pos.z);
    k.target = y;
    return;
  }
  y.invuln = false; y.officerSaved = true; rt.army.kill(y, k);
}
