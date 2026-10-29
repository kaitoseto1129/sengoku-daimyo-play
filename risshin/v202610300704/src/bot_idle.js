// bot の見張り：本人から30m 内に見える敵のうち、3秒以上ほとんど動かず戦ってもいない者の割合（kaito 10/28「動かない敵はマジクソ」）。
//   0.5秒ごとに、本人から30m 内で画面に入る（u.offscreen でない）生きた敵を調べる。
//   その兵が最後に「何かした」時（0.3m 以上の移動・0.3 rad 以上の向きの変わり・突き・振り・当たり・押し合い・弾込め・身構え）から
//   3秒を超えていれば「動かない」と数える。戦全体の平均（idleAvg）・最も悪い時（idleMax）・悪い場面（idleScenes）を rep に書く。
const ST = new WeakMap();
const busy = (u) => !!(u.atk || u.swing || u.stagger > 0 || !!u.reload || u.dodging || u.climb || u.dragging ||
  u.contactLoad > 0.05 || u.contactBrace > 0.05 || u.contactParry > 0.05 || u.guarding || u.lastHitT < 0.6 || u.cheer > 0.05 || u.fireT > 0);
export function idleWatch(b, rep) {
  let s = ST.get(b);
  if (!s) { s = { next: 0, mem: new WeakMap(), sum: 0, n: 0, max: 0, scenes: [], lastScene: -99 }; ST.set(b, s); rep.idleAvg = 0; rep.idleMax = 0; rep.idleScenes = []; }
  if (b.t < s.next) return;
  s.next = b.t + 0.5;
  const P = b.player && b.player.u; if (!P || !P.alive) return;
  const team = P.team;
  let seen = 0, idle = 0;
  const why = new Map();
  for (const u of b.army.units) {
    if (u.team === team || u.type === 'dummy' || u.isStruct) continue;
    let m = s.mem.get(u);
    if (!u.alive || u.dying || u.downed || u.gone) { if (m) s.mem.delete(u); continue; }
    if (!m) { m = { x: u.pos.x, z: u.pos.z, h: u.heading, t: b.t }; s.mem.set(u, m); }
    const dx = u.pos.x - m.x, dz = u.pos.z - m.z;
    let dh = Math.abs(u.heading - m.h) % (Math.PI * 2); if (dh > Math.PI) dh = Math.PI * 2 - dh;
    if (dx * dx + dz * dz > 0.09 || dh > 0.3 || busy(u)) { m.x = u.pos.x; m.z = u.pos.z; m.h = u.heading; m.t = b.t; }
    const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
    if (d > 30 || u.offscreen) continue;
    seen++;
    if (b.t - m.t > 3) {
      idle++;
      const g = u.group, k = `${g ? g.name || g.label || '隊' + g.id : '―'}・号令 ${g ? g.order : '―'}${u.fleeing ? '・逃げ' : ''}${u.target ? '・相手あり' : ''}${u.moveTo ? '・行き先あり' : ''}${u.farSim ? '・遠扱い' : ''}${u.qualityAbstract ? '・略' : ''}${window.__idleWhy ? `・${u.type}${u.perch ? '・櫓' : ''}${u.civ ? '・民' : ''}${u._crouch ? '・屈' : ''}${u.idl?.sit > 0.5 ? '・座' : ''}${g?.hidden ? '・隠' : ''}${u.climb ? '・登' : ''}${u.jinchu ? '・陣中' : ''}${u.contactFrozen ? '・凍' : ''}${u.farSim || u.qualityAbstract ? '' : ''}${u._mill && u._mill.on > 0 ? '・踏中' : ''}${u.pinT > b.army.time ? '・下敷' : ''}・aiT${(+u.aiT).toFixed(1)}` : ''}`;
      why.set(k, (why.get(k) || 0) + 1);
    }
  }
  if (seen < 3) return;
  const r = idle / seen;
  s.sum += r; s.n++;
  rep.idleAvg = +(s.sum / s.n).toFixed(3);
  if (r > s.max) { s.max = r; rep.idleMax = +r.toFixed(2); }
  if (r >= 0.3 && b.t - s.lastScene > 15 && s.scenes.length < 6) {
    s.lastScene = b.t;
    const top = [...why.entries()].sort((a, c) => c[1] - a[1]).slice(0, 2).map(([k, v]) => `${k}×${v}`).join('／');
    rep.idleScenes.push(`${Math.round(b.t)}秒 段 ${b.phase || '―'}：${idle}/${seen}（${top}）`);
  }
}
