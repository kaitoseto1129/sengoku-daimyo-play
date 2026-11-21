// ======================================================================
// K474（kaito 11/20 夕「全部の戦を進軍から始める：坂を登る・道を進む所から。進んだ先で敵が陣を敷いている、と見える」）
// 戦の定義に march を書いた戦だけ、本人と組を道の始め（road[0]）に置き、味方の列が同じ道を前を歩いて陣へ上がる。
//   def.marchIn = { road: [[x,z], …]（始め→陣の後ろ。二点以上）, column: [{ type, n, o }]（前を歩く列。既定は侍二・足軽十二）,
//                 name, speed, facing（着いて向く向き）, behind（着いた列を road の終わりからどれだけ横へずらすか） }
// 戦の段（任務・台詞・時刻）は変えない。始めの持ち場（def.spawn）だけ道の始めへ下げる。列は着いたら道の終わりで槍を揃えて待つ。
// 列の兵は狙われず斬り合わない（行軍の飾り。戦の数・敵の強さに入れない）。
// ======================================================================
import { allyGroup } from './bhelp.js';
import { placePlayer } from './b_opening.js';
import { SOLIDS } from './props.js';

export function marchSpawn(def) {
  if (typeof window !== 'undefined' && window.__noMarch) return def.spawn;   // 前の写真を撮る時（k365_shot の NOMARCH）
  const r = def?.marchIn?.road;
  if (!r || r.length < 2) return def.spawn;
  const [x, z] = r[0], [nx, nz] = r[1];
  return { ...(def.spawn || {}), x, z, heading: Math.atan2(nx - x, nz - z) };
}

export function marchOpen(rt) {
  if (typeof window !== 'undefined' && window.__noMarch) return;
  const M = rt.def?.marchIn;
  if (!M || !M.road || M.road.length < 2 || rt.flags.marchG) return;
  const road = M.road.map((q) => [q[0], q[1]]);
  const [x0, z0] = road[0], [x1, z1] = road[1];
  const h = Math.atan2(x1 - x0, z1 - z0);
  // 列は本人の九歩前から歩き出す（始めの一枚から列の中にいる。11/20 森部：二十六歩前だと霞で見えず一人に見えた）
  const lead = Math.min(9, Math.hypot(x1 - x0, z1 - z0) * 0.5);
  const ax = x0 + Math.sin(h) * lead, az = z0 + Math.cos(h) * lead;
  const list = M.column || [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }];
  let g;
  try {
    g = allyGroup(rt, { fixed: true, name: M.name || '行軍の列', fullStrength: true, anchor: { x: ax, z: az }, facing: h, width: 3, aggro: 0, seekRange: 0, order: 'hold', noAI: true, noRout: true }, list);
  } catch (e) { console.error(e); return; }
  rt.flags.marchG = g;
  // 自分の組も道の始め（本人の五〜九歩後ろ）へ一緒に下げる（置いて行くと組が坂の上で待ち、本人が一人で登る。11/20 三方ヶ原：組が陣の前に残り本人へ駆け戻った）
  for (const q of rt.squadGroups || []) {
    const c = q.center?.(); if (!c) continue;
    const tx = x0 - Math.sin(h) * 7, tz = z0 - Math.cos(h) * 7, dx = tx - c.x, dz = tz - c.z;
    if (q.anchor) { q.anchor.x += dx; q.anchor.z += dz; }
    for (const u of q.units) if (u.alive) { u.pos.x += dx; u.pos.z += dz; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); u.mesh?.position.copy(u.pos); u.moveTo = null; u.target = null; }
  }
  g.arriveNoncombat = true; g.ai = false; g.guard = false; g.stay = false; g.noRing = true;
  for (const u of g.units) u.noTarget = true;
  g.roadColumn = true; g.formation = 'column'; g.colW = 3; g.spacing = 1.1;
  g.speed = M.speed || 4.4;   // 本人が走っても（5m/秒）列の後ろ姿が前に見える速さ
  // 列が先に着いて陣の後ろで待つ。道の終わりで横へ寄せ、本人の行き先（その戦の印）を塞がない
  const end = road[road.length - 1], prev = road[road.length - 2];
  const eh = Math.atan2(end[0] - prev[0], end[1] - prev[1]), side = M.behind ?? 8;
  const stop = [end[0] + Math.cos(eh) * side, end[1] - Math.sin(eh) * side];
  const path = [...road.slice(1, -1), stop];
  g.path = path; g.pathIdx = 0; g.order = 'path';
  const face = M.facing ?? eh;
  // 始めの支度（布陣の並べ直しなど）が列を「その場で待て」に戻すことがある（11/20 三方ヶ原：五秒立ったまま）。一秒・三秒で道の歩みを掛け直す
  //   戦の段が「味方は皆その場で待て」と全部の隊を止める戦もある（11/20 森部：柳の陰で下知を待つ）。着くまで半秒ごとに掛け直す（九十秒まで）
  const keep = () => {
    if (g._marchDone || rt.over || rt.t > 90 || !g.units.some((q) => q.alive)) return;
    if (g.order !== 'path') { g.order = 'path'; g.formation = 'column'; if (!g.path || g.pathIdx >= g.path.length) { g.path = path; g.pathIdx = Math.min(g.pathIdx || 0, path.length - 1); } }
    g.hidden = false; g.ai = false;
    rt.after(0.5, keep);
  };
  rt.after(0.5, keep);
  g.onArrive = (q) => { q._marchDone = true; q.order = 'hold'; q.formation = 'yari'; q.yariRanks = 3; q.facing = face; q.anchor.x = stop[0]; q.anchor.z = stop[1]; };
}

// ---- K474 全戦：def.marchIn を書いていない野戦は、敵の陣と反対の向きへ道を自分で引く ----
// 本人の始めの持ち場（def.spawn）から、敵の兵の重心の反対へ 60〜75m 下がった所を始めにする。
//   道の途中が歩けない（川・崖・建物・枠の外）向きは捨て、左右へ二十五度ずつ振って探す。見つからない戦は今まで通り。
// 引けた戦は本人と組をそこへ移し（placePlayer と同じ）、味方の列を前に歩かせる。def.marchIn = false で使わない。
function inSolid(x, z) {
  for (const o of SOLIDS) if (x > o.x0 - 1.2 && x < o.x1 + 1.2 && z > o.z0 - 1.2 && z < o.z1 + 1.2) return true;
  return false;
}
export function marchAuto(rt) {
  const def = rt.def;
  if (!def || (typeof window !== 'undefined' && window.__noMarch) || def.marchIn === false || def.marchIn || def.town || def.dojo || def.mapCastle || def.noMarch) return;
  const u = rt.player?.u, sp = def.spawn; if (!u || !sp) return;
  const W = rt.world, lim = (W.def?.moveLim || def.moveLim || 176) - 8;
  let sx = 0, sz = 0, n = 0;
  for (const g of rt.army.groups) {
    if (g.team !== 1 || g.hidden || g.ambush || g.civ || g.people || g.peaceful) continue;
    for (const q of g.units) if (q.alive && Math.hypot(q.pos.x - sp.x, q.pos.z - sp.z) < 420) { sx += q.pos.x; sz += q.pos.z; n++; }
  }
  if (n < 8) { rt.flags.marchWhy = '敵が' + n; return; }
  const ex = sx / n - sp.x, ez = sz / n - sp.z, el = Math.hypot(ex, ez) || 1;
  const base = Math.atan2(-ex / el, -ez / el);   // 敵と反対の向き
  const ok = (x, z) => Math.abs(x) < lim && Math.abs(z) < lim && Number.isFinite(W.heightAt(x, z)) && W.walkable(x, z) && !inSolid(x, z);
  // 先に戦の地図の道（def.paths）をたどる：元の持ち場から二十五歩内を通る道を、敵から遠ざかる向きへ 72m までさかのぼる（山城・寺の坂道・城下の道）。
  //   道の上は急でも歩ける（world.walkable の onRoad）。途中が枠の外・建物なら、そこまでで 40m 以上あれば使う
  const paths = W.def?.paths || [];
  let best = null;
  for (const P of paths) {
    const pts = P?.pts || P; if (!pts || pts.length < 2) continue;
    let bi = -1, bd = 25, bt = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax0, az0] = pts[i - 1], [bx0, bz0] = pts[i], dx = bx0 - ax0, dz = bz0 - az0, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((sp.x - ax0) * dx + (sp.z - az0) * dz) / l2)), d = Math.hypot(ax0 + dx * t - sp.x, az0 + dz * t - sp.z);
      if (d < bd) { bd = d; bi = i; bt = t; }
    }
    if (bi < 0) continue;
    const [ax0, az0] = pts[bi - 1], [bx0, bz0] = pts[bi];
    const foot = [ax0 + (bx0 - ax0) * bt, az0 + (bz0 - az0) * bt];
    // 道のどちら向きが敵から遠ざかるか
    for (const dir of [-1, 1]) {
      const out = [foot]; let len = 0, i = dir < 0 ? bi - 1 : bi, cur = foot;
      while (len < 72 && i >= 0 && i < pts.length) {
        const nx = pts[i][0], nz = pts[i][1], seg = Math.hypot(nx - cur[0], nz - cur[1]);
        let stop = false, k = seg;
        for (let s2 = 2; s2 <= seg; s2 += 2) { const x = cur[0] + (nx - cur[0]) * s2 / seg, z = cur[1] + (nz - cur[1]) * s2 / seg; if (!(Math.abs(x) < lim && Math.abs(z) < lim) || inSolid(x, z) || len + s2 > 72) { k = s2 - 2; stop = true; break; } }
        if (k > 0) { cur = [cur[0] + (nx - cur[0]) * k / (seg || 1), cur[1] + (nz - cur[1]) * k / (seg || 1)]; out.push(cur); len += k; }
        if (stop) break;
        i += dir;
      }
      if (len < 40) continue;
      const far = out[out.length - 1];
      // 敵から遠ざかる（元の持ち場より敵の重心から遠い）向きだけ
      if (Math.hypot(far[0] - sx / n, far[1] - sz / n) < Math.hypot(sp.x - sx / n, sp.z - sz / n) + 10) continue;
      if (!best || len > best.len) best = { out, len };
    }
  }
  if (best) {
    const road = best.out.slice().reverse();
    const [bx, bz] = road[0], [nx, nz] = road[1];
    def.marchIn = { road: road.map((q) => [q[0], q[1]]), auto: 'road', facing: Math.atan2(ex, ez) };
    try { placePlayer(rt, bx, bz, Math.atan2(nx - bx, nz - bz)); } catch (e) { console.error(e); def.marchIn = undefined; return; }
    W.spawnAt = rt.player.u.pos;
    marchOpen(rt);
    return;
  }
  for (const D of [72, 56]) for (const da of [0, 0.44, -0.44, 0.87, -0.87]) {
    const a = base + da, bx = sp.x + Math.sin(a) * D, bz = sp.z + Math.cos(a) * D;
    let good = true, prevH = W.heightAt(bx, bz);
    for (let s = 4; s <= D - 4 && good; s += 4) {
      const x = bx + (sp.x - bx) * s / D, z = bz + (sp.z - bz) * s / D, h = W.heightAt(x, z);
      if (!ok(x, z) || Math.abs(h - prevH) > 1.8) { good = false; (rt.flags.marchWhy ||= []).push([D, +da.toFixed(2), s, Math.abs(x) >= lim || Math.abs(z) >= lim ? '枠' : !W.walkable(x, z) ? '歩けず' : inSolid(x, z) ? '建物' : '段差']); } prevH = h;
    }
    if (!good || !ok(bx, bz)) continue;
    const mx = (bx + sp.x) / 2, mz = (bz + sp.z) / 2;
    const ax = sp.x - Math.sin(a) * -6, az = sp.z - Math.cos(a) * -6;   // 持ち場の六歩手前（列は横へ寄って止まる）
    def.marchIn = { road: [[bx, bz], [mx, mz], [ax, az]], auto: true, facing: Math.atan2(ex, ez) };
    try { placePlayer(rt, bx, bz, Math.atan2(-Math.sin(a), -Math.cos(a))); } catch (e) { console.error(e); def.marchIn = undefined; return; }
    W.spawnAt = rt.player.u.pos;
    marchOpen(rt);
    return;
  }
}
