// perch.js … 櫓門・隅櫓・物見櫓の上の守り（城攻め共通）。
// buildCastlePlan が建てた C.towers（隅櫓・物見櫓）と C.gateObjs（櫓門）の床に、本物の鉄砲・弓の兵を少数立たせる。
// 兵は床の上に据え（u.perch。units.js が毎コマ足もとを止める）、近づく攻め手を撃ち下ろす。
// 床へ登って斬る・下から撃って落とせる。上の兵がいなくなれば、その櫓は「落ちた」と記録され、門前が楽になる。
// 本物の数は少なく（隅櫓3・櫓門3・物見2。画質低は一つ減らす）、butai.js の本物の枠（rt.__perchReal）から引く。
import { FL } from './floors.js';
import { S as SETTINGS } from './settings.js';

const MIX = { sumi: ['gun', 'gun', 'bow'], gate: ['gun', 'gun', 'bow'], monomi: ['bow', 'gun'] };

function deckSpots(d, n) {
  const hx = Math.abs(d.x1 - d.x0) / 2, hz = Math.abs(d.z1 - d.z0) / 2;
  const r = d.rot || 0, c = Math.cos(r), s = Math.sin(r);
  const alongX = hx >= hz, half = alongX ? hx : hz, step = Math.min(1.5, (half * 1.6) / Math.max(1, n - 1));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) * step;
    const lx = alongX ? t : 0, lz = alongX ? 0 : t;
    out.push({ x: d.cx + lx * c - lz * s, z: d.cz + lx * s + lz * c, y: d.y });
  }
  return out;
}

function collectPosts(C) {
  const posts = [];
  for (const t of C.towers || []) {
    const id = t.decks ? t.decks[t.decks.length - 1] : t.deckId;
    if (id == null || !FL.decks[id]) continue;
    posts.push({ id: t.id || `tower${posts.length}`, name: t.kind === 'sumi' ? '隅櫓' : '物見櫓', kind: t.kind === 'sumi' ? 'sumi' : 'monomi', deckId: id, spots: t.loopSpots });
  }
  const one = (o, id) => { if (o && o.deckId != null && FL.decks[o.deckId]) posts.push({ id, name: '櫓門', kind: 'gate', deckId: o.deckId, spots: o.loopSpots }); };
  for (const [k, g] of Object.entries(C.gateObjs || {})) {
    if (!g) continue;
    if (g.inner || g.outer) { one(g.inner, `${k}_inner`); one(g.outer, `${k}_outer`); }
    else one(g, k);
  }
  return posts;
}

// C：buildCastlePlan の戻り。o.team：守りの側（既定 1）。o.n：一つの櫓の人数の上限（既定 3）
export function makePerchGuards(rt, C, o = {}) {
  const team = o.team ?? 1;
  const low = SETTINGS.quality === 'low';
  const posts = collectPosts(C);
  const P = { posts, team, started: false, fallen: {}, t: 0, total: 0 };
  rt.perch = P;

  function start() {
    P.started = true;
    const A = rt.army;
    const ref = A.groups.find((g) => g.team === team && g.units.length);
    const faction = o.faction || (ref && ref.faction) || (team === 1 ? 'takeda' : 'oda');
    let total = 0;
    for (const p of posts) {
      const mix = MIX[p.kind];
      const n = Math.max(1, Math.min(o.n ?? 3, mix.length) - (low && p.kind !== 'monomi' ? 1 : 0));
      const d = FL.decks[p.deckId];
      // 中に入れる櫓（naka.js）は、格子窓のすぐ内に立たせ、外を向かせる（窓から姿と筒先が見える。kaito 10/2）
      const spots = p.spots && p.spots.length >= n ? p.spots.slice(0, n) : deckSpots(d, n);
      const g = A.addGroup({ team, faction, name: `${p.name}の守り`, order: 'hold', anchor: { x: d.cx, z: d.cz }, facing: spots[0].heading ?? 0, morale: 100, noRout: true, aggro: 2 });
      const list = mix.slice(0, n).map((type, i) => ({ type, n: 1, o: { x: spots[i].x, z: spots[i].z } }));
      const us = A.spawn(g, list);
      us.forEach((u, i) => {
        u.pos.set(spots[i].x, spots[i].y, spots[i].z); u.perch = { x: spots[i].x, z: spots[i].z }; u.mesh.position.copy(u.pos);
        if (spots[i].heading != null) { u.heading = spots[i].heading; u.mesh.rotation.y = u.heading; }
      });
      p.group = g; total += us.length;
    }
    rt.__perchReal = total;
    P.total = total;
  }

  P.tick = (dt) => {
    if (!rt.army) return;
    if (!P.started) { start(); return; }
    P.t += dt;
    if (P.t < 1) return;
    P.t = 0;
    for (const p of posts) {
      if (!p.group || P.fallen[p.id]) continue;
      if (p.group.count === 0) {
        P.fallen[p.id] = true;
        rt.__siegeLog = rt.__siegeLog || [];
        rt.__siegeLog.push(`${Math.round(rt.t || 0)}s ${p.name}（${p.id}）の上の守りがいなくなった`);
      }
    }
  };
  return P;
}
