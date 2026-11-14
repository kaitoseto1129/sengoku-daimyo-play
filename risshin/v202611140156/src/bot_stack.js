// bot の見張り：隊の兵が一点に重なったまま動かない場面を数える（kaito 10/27「部隊が一箇所に重なって全員動かない」）。
//   五秒ごとに、生きている徒歩の兵が五人以上の隊を調べる。0.5m より近い組の数が兵の数の半分を超え、
//   二十秒ほとんど動かなければ「重なって止まる」と記す。戦ごとに一度だけ。
const ST = new WeakMap();
export function stackWatch(b, rep, tell) {
  let s = ST.get(b);
  if (!s) { s = { next: 0, seen: new Map(), told: new Set(), max: 0 }; ST.set(b, s); rep.stackMax = 0; rep.stackN = 0; }
  if (b.t < s.next) return;
  s.next = b.t + 5;
  for (const g of b.army.groups) {
    let n = 0, cx = 0, cz = 0;
    const al = [];
    for (const u of g.units) if (u.alive && !u.dying && !u.isPlayer && !u.mounted && !u.fleeing && !u.downed && !u.woundOut) { al.push(u); cx += u.pos.x; cz += u.pos.z; n++; }
    if (n < 5) { s.seen.delete(g); continue; }
    cx /= n; cz /= n;
    let close = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = al[i].pos.x - al[j].pos.x, dz = al[i].pos.z - al[j].pos.z;
      if (dx * dx + dz * dz < 0.25 && Math.abs(al[i].pos.y - al[j].pos.y) < 1.5) close++;
    }
    const r = close / n;
    if (r > s.max) { s.max = r; rep.stackMax = +r.toFixed(2); }
    const k = s.seen.get(g);
    if (r > 0.5) {
      if (!k) s.seen.set(g, { t: b.t, x: cx, z: cz });
      else if (b.t - k.t >= 20 && Math.hypot(cx - k.x, cz - k.z) < 1.5 && !s.told.has(g)) {
        s.told.add(g); rep.stackN++;
        const m = `${Math.round(b.t)}秒：隊が一点に重なって止まる（${g.name || g.label || '隊'}・${n}人・重なり ${close}組・号令 ${g.order}・段 ${b.phase || '―'}・${Math.round(cx)}, ${Math.round(cz)}）`;
        rep.stuck.push(m); if (tell) tell(m);
      }
    } else s.seen.delete(g);
  }
}
