// bot の見張り：隊の兵が一点に重なったまま動かない場面を数える（kaito 10/27「部隊が一箇所に重なって全員動かない」）。
//   五秒ごとに、生きている徒歩の兵が五人以上の隊を調べる。0.5m より近い組の数が兵の数の半分を超え、
//   二十秒ほとんど動かなければ「重なって止まる」と記す。戦ごとに一度だけ。
//   11/14 K127：場から片付けた兵（u.gone・遠くて描かない控えなど）は数えない（関ヶ原の家康の本陣が、見えない控えの置き場で『重なる』と数えられていた）
// 11/19 夜50-04：重なりの一行に『行き先の種類』（兵の行き先を0.5m で丸めた種類の数）と『持ち場』（slot の種類の数）を足す。行き先が一つなら持ち場の作り、ばらばらなら押し合い・塀で止まると分かる
const ST = new WeakMap();
export function stackWatch(b, rep, tell) {
  let s = ST.get(b);
  if (!s) { s = { next: 0, seen: new Map(), told: new Set(), max: 0 }; ST.set(b, s); rep.stackMax = 0; rep.stackN = 0; }
  if (b.t < s.next) return;
  s.next = b.t + 5;
  for (const g of b.army.groups) {
    let n = 0, cx = 0, cz = 0;
    const al = [];
    for (const u of g.units) if (u.alive && !u.gone && !u.dying && !u.isPlayer && !u.mounted && !u.fleeing && !u.downed && !u.woundOut) { al.push(u); cx += u.pos.x; cz += u.pos.z; n++; }
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
        const m = `${Math.round(b.t)}秒：隊が一点に重なって止まる（${g.name || g.label || '隊'}・${n}人・重なり ${close}組・号令 ${g.order}・${(() => { const c = {}; for (const u of al) c[u.type] = (c[u.type] || 0) + 1; return Object.entries(c).map(([k, v]) => k + v).join(''); })()}・行き先${al[0].moveTo ? Math.round(Math.hypot(al[0].moveTo.x - al[0].pos.x, al[0].moveTo.z - al[0].pos.z)) + 'm' : '無'}・段 ${b.phase || '―'}・${Math.round(cx)}, ${Math.round(cz)}・旗 ${['atk','perch','climb','farSim','qualityAbstract'].map((k) => k + al.filter((u) => u[k]).length).join(' ')}・行き先の種類 ${new Set(al.map((u) => { const w = u._farWant || u.moveTo; return w ? Math.round(w.x * 2) + ',' + Math.round(w.z * 2) : '-'; })).size}・持ち場 ${new Set(al.map((u) => u.slot)).size}・散らし ${g._sgAt != null ? Math.round(b.t - g._sgAt) + '秒前' : '無'}）`;
        rep.stuck.push(m); if (tell) tell(m);
      }
    } else s.seen.delete(g);
  }
}
