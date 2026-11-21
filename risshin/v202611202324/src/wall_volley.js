// P7（K427・kaito 11/20「塀の上から明智の鉄砲隊が一斉に撃つ」「鉄砲を持って何もしない者を無くす」・全戦共通）
//   城と寺の塀・櫓の射手の一斉射と、塀の全周に並ぶ攻め手の旗をまとめた部品。
//   手本は真田丸の撃ってくる所（b_k11_sanadamaru.js：塀の裏の台・櫓に据えた撃ち手＝u.perch/u.tower・keepReal）。
//   ① wallShooters(rt, o)：決めた塀の線の上に撃ち手（鉄砲と弓）を据える（動かず・間引かれず、その場で撃つ）
//   ② wallVolleyTick(rt, dt, walls)：塀の上・櫓・塀ぎわ七m の鉄砲と弓の組を「構え」→「放て」で揃えて撃たせる。
//      弓は構えの声で一斉に番え、二秒余り後の鉄砲の放ちと同じ一瞬に離す（煙と音が塀の線にそろって上がる）
//   ③ wallFlagRing(rt, walls, faction)：塀の外の全周（塀から六〜九m）に攻め手の幟を二〜四本の組で立てる（描く回数+2）
//   城攻め共通（siege_feel.js）から毎コマ呼ぶ。def.noWallVolley の戦（真田丸＝ほめた物の撃ち方を変えない）は②を止め、
//   def.noWallFlagRing の戦（本能寺＝K425 の桔梗の幟が先にある）は③を立てない。
import * as THREE from 'three';
import { enemyGroup, allyGroup } from './bhelp.js';
import { nobori, noboriClothLite } from './props.js';

const rr = (x, z, k) => { const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.7) * 43758.5453; return v - Math.floor(v); };
const segDist = (x, z, s) => {
  const [ax, az, bx, bz] = s, dx = bx - ax, dz = bz - az;
  const f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - dx * f, z - az - dz * f);
};
const shooter = (u) => u.alive && !u.isStruct && !u.sidearm && !u.fleeing && (u.type === 'gun' || u.type === 'bow');

// ① 塀の線の上に撃ち手を据える。
//   o.segs: [[ax,az,bx,bz], ...] 塀の線。o.face(x,z) → 撃つ向き（ラジアン）。o.top(x,z) → 足もとの高さ（塀の上なら地＋塀の高さ）
//   o.skip(x,z) → 真なら据えない所。o.n: 人数（鉄砲と弓を o.bow の割合で混ぜる）。o.team（1＝敵・0＝味方）・o.faction・o.name。o.until() が真になれば消える
export function wallShooters(rt, o) {
  const segs = o.segs.filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) > 2);
  if (!segs.length) return null;
  const n = Math.max(2, o.n | 0), nb = Math.round(n * (o.bow ?? 0.3)), ng = n - nb;
  const list = [{ type: 'gun', n: ng }, ...(nb ? [{ type: 'bow', n: nb }] : [])];
  const s0 = segs[0], a0 = { x: (s0[0] + s0[2]) / 2, z: (s0[1] + s0[3]) / 2 };
  const go = { team: o.team ?? 1, faction: o.faction, name: o.name || '塀の上の鉄砲衆', anchor: a0, fixed: true, facing: 0, width: 4, aggro: 0, noRout: true };
  const g = (go.team === 1 ? enemyGroup : allyGroup)(rt, go, list);
  // 塀の長さに比べて人を割り振り、線の上に間を散らして据える（等間に並べると人形の列に見える）
  const lens = segs.map((s) => Math.hypot(s[2] - s[0], s[3] - s[1])), tot = lens.reduce((a, b) => a + b, 0);
  const us = g.units.slice().sort((a, b) => rr(a.id, 1, 2) - rr(b.id, 1, 2));
  // 塀の長さの通しの位置に、人ごとに少しずつ散らして割り振る（短い区画がたくさんある塀でも全周に散る）
  const at = (L) => { for (let i = 0; i < segs.length; i++) { if (L <= lens[i] || i === segs.length - 1) return [segs[i], Math.min(1, L / lens[i])]; L -= lens[i]; } };
  us.forEach((u, k) => {
    let x, z;
    if (o.spots && o.spots[k]) [x, z] = o.spots[k];   // o.spots：据える所を決めて渡す（follow の入れ替え）
    else {
      let L = tot * (k + 0.3 + rr(k, tot, 3) * 0.4) / us.length, s, f;
      // o.skip(x,z)：門の上・乗り越え口など、据えない所は線に沿って少しずらす
      for (let tries = 0; tries < 8; tries++, L = (L + 2.5) % tot) { [s, f] = at(L); if (!o.skip || !o.skip(s[0] + (s[2] - s[0]) * f, s[1] + (s[3] - s[1]) * f)) break; }
      x = s[0] + (s[2] - s[0]) * f; z = s[1] + (s[3] - s[1]) * f;
    }
    const y = o.top(x, z);
    u.pos.set(x, y, z); u.perch = { x, y, z }; u.perchVat = true;
    u.heading = o.face(x, z); u.speed = u.run = 0; u.keepReal = true;
  });
  g.p7 = true; g.keepReal = true;
  // o.follow() → 戦の今の所（多くは本人）。塀が長い時は、そこから四十五m より遠い撃ち手を、十二〜四十m の塀の上へ移す（遠い塀の上で的を持たずに立つ者を無くす）
  if (o.until || o.follow) (rt._p7Until || (rt._p7Until = [])).push({ g, until: o.until || (() => false), o, segs, lens, tot, at, moveT: 6, n0: g.units.length });
  return g;
}

// ② 揃えた一斉射。walls は守り手の塀・櫓の struct（seg を持つ）の並び。
export function wallVolleyTick(rt, dt, walls) {
  const A = rt.army, st = rt._p7 || (rt._p7 = { scanT: 0, groups: [], next: {}, fire: [] });
  // 役目の済んだ撃ち手を消す（本能寺：寺を出た後に塀の上に残さない）
  if (rt._p7Until && rt._p7Until.length) for (let i = rt._p7Until.length - 1; i >= 0; i--) {
    const q = rt._p7Until[i];
    if (!q.until()) continue;
    for (const u of q.g.units) if (u.alive && !u.gone) { try { A.despawn(u); } catch (e) { /* 消せなければそのまま */ } }
    rt._p7Until.splice(i, 1);
  }
  if (rt._p7Until) for (const q of rt._p7Until) if (q.o.follow && (q.moveT -= dt) <= 0) {
    q.moveT = 6;
    const fp = q.o.follow(); if (!fp) continue;
    const live = q.g.units.filter((u) => u.alive && u.perch);
    // o.refill：撃たれて六割を切ったら、梯子で塀に上がる次の撃ち手を足す（回数まで）
    if (q.o.refill > 0 && live.length < q.n0 * 0.6) { q.o.refill--; wallShooters(rt, { ...q.o, n: q.n0 - live.length, refill: 0 }); }
    const far = live.filter((u) => Math.hypot(u.pos.x - fp.x, u.pos.z - fp.z) > 45);
    if (!far.length) continue;
    const spots = [];
    for (let L = rr(fp.x, fp.z, 4) * 3; L < q.tot; L += 3) {
      const [s, f] = q.at(L), x = s[0] + (s[2] - s[0]) * f, z = s[1] + (s[3] - s[1]) * f, d = Math.hypot(x - fp.x, z - fp.z);
      if (d < 12 || d > 40 || (q.o.skip && q.o.skip(x, z)) || live.some((u) => Math.hypot(u.pos.x - x, u.pos.z - z) < 2.5)) continue;
      spots.push([x, z]);
    }
    spots.sort((a, b) => rr(a[0], a[1], 5) - rr(b[0], b[1], 5));
    // 遠い者を一息に飛ばさず（飛びは bot が見張る）、遠い者は下ろし（消し）、同じ数を近い塀の上に上げる
    const n = Math.min(far.length, spots.length);
    if (n < 2) continue;
    for (const u of far.slice(0, n)) { try { A.despawn(u); } catch (e) { /* 消せなければそのまま */ } }
    wallShooters(rt, { ...q.o, n, refill: 0, spots: spots.slice(-n), bow: far.slice(0, n).filter((u) => u.type === 'bow').length / n });
  }
  // K487（kaito 11/20「攻める側も守る側も鉄砲でバンバン撃ち合う。寄せ手も竹束の陰から撃ち返す。弾が当たれば双方が倒れる」）：
  //   守り手の一斉射と同じ間で、塀へ七十m 内の寄せ手の鉄砲が揃って撃ち返す（真田丸も。ほめた守り手の撃ち方は変えない）
  if ((st.rfT = (st.rfT ?? 5) - dt) <= 0) { st.rfT = 6 + Math.random() * 2; returnFire(rt, walls); }
  if (rt.def.noWallVolley) return;
  if ((st.scanT -= dt) <= 0) {
    st.scanT = 10;
    const segs = (walls || []).filter((s) => s.alive && s.seg).map((s) => s.seg);
    st.groups = [];
    for (const g of A.groups) {
      if (g.routed || !g.count || g.isPlayerSquad || g.civ || (g.salvoOnly && !g.p7)) continue;
      let n = 0, near = 0, fixed = 0;
      for (const u of g.units) if (shooter(u)) { n++; if (u.perch || u.tower) fixed++; if (u.perch || u.tower || segs.some((s) => segDist(u.pos.x, u.pos.z, s) < 7)) near++; }
      // 打って出る・退く組は塀の守りに数えない（据えた撃ち手の組は下知に関わらず数える）
      const moving = !fixed && /^(attack|assault|charge|flee|retreat|path|move)$/.test(g.order || '');
      if (n >= 2 && near * 2 >= n && !moving) { g.p7 = true; st.groups.push(g); }
      else if (g.p7 && !rt._p7Until?.some((q) => q.g === g)) { g.p7 = false; g.salvoOnly = false; }
    }
    for (const g of st.groups) if (g.units.some((u) => u.type === 'gun')) g.salvoOnly = true;
  }
  // 放ち（構えから二秒余り後）
  for (let i = st.fire.length - 1; i >= 0; i--) {
    const f = st.fire[i];
    if (A.time < f.at) continue;
    st.fire.splice(i, 1);
    let shots = 0;
    for (const g of f.groups) {
      if (!g.count || g.routed) continue;
      g.salvoAt = (g.salvoAt || 0) + 1;
      for (const u of g.units) {
        const ok = u.alive && u.type === 'gun' && !u.sidearm && !u.reload && !(u.cd > 0) && u.gunAmmo !== 0 && u.target && u.target.alive;
        u.salvoAt = ok ? g.salvoAt : null; if (ok) shots++;
      }
      g.fire = true; g.holdFire = false;
    }
    if (shots >= 3 && f.c) A.play('volley', f.c, Math.min(1.4, 0.7 + shots * 0.06));
  }
  // 構え：組ごとの陣営で、撃てる的を持つ者がいれば号令。弓はここで一斉に番える
  for (const team of [0, 1]) {
    if ((st.next[team] = (st.next[team] ?? 3 + Math.random() * 2) - dt) > 0) continue;
    const gs = st.groups.filter((g) => g.team === team && g.count && !g.routed);
    let x = 0, z = 0, m = 0;
    for (const g of gs) for (const u of g.units) {
      if (!shooter(u)) continue;
      // 的を持たずに立つ撃ち手（持ち場で待つ aggro 0 の組など）には、届いて見える近い敵を渡す（鉄砲を持って何もしない者を無くす・K427）
      if ((!u.target || !u.target.alive || u.target.isStruct) && !u.atk) {
        const r = Math.min(u.range || 60, 70);
        const e = A.nearestEnemy(u, r, (q) => !q.isStruct && !q.noTarget && !q.civ && !q.fleeing && Math.hypot(q.pos.x - u.pos.x, q.pos.z - u.pos.z) > 4 && !A.hiddenBehind(u, q));
        if (e) u.target = e;
      }
      if (!u.target || !u.target.alive || u.target.isStruct) continue;
      const d = Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z);
      if (d > 4 && d < (u.range || 60) * 1.05) { x += u.pos.x; z += u.pos.z; m++; }
    }
    if (!m) { st.next[team] = 1; continue; }
    st.next[team] = 6.5 + Math.random() * 1.5;
    const c = { x: x / m, z: z / m };
    for (const g of gs) if (g.units.some((u) => u.type === 'bow')) g.bowT = A.time;
    const P = rt.player.u;
    if (P && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 90) A.play(rt.def.scriptedBattleCries ? 'soldier_fire' : 'eshout', c, 0.55);
    st.fire.push({ at: A.time + 2.05, groups: gs, c });
  }
}

// K487：寄せ手の撃ち返し。塀・櫓の上に出た守り手（u.perch・u.tower、塀ぎわ三m の撃ち手）へ、塀から七十m 内の寄せ手の鉄砲（十二挺まで）が
//   揃って放つ（筒先の煙・音）。当たりは一斉射ごとに守り手一人まで（六挺からは六割・足りなければ三割の見込み）。守り手の組は半ばより減らさない（撃ってくる所を消さない）
function returnFire(rt, walls) {
  const A = rt.army, segs = (walls || []).filter((s) => s.alive && s.seg).map((s) => s.seg);
  if (!segs.length || !A || !A.units) return;
  const wt = walls[0].team;
  const D = [], G = [];
  for (const u of A.units) {
    if (!u.alive || u.gone || u.dying || u.isStruct || u.fleeing || u.downed) continue;
    if (u.team === wt) { if (u.perch || u.tower || (shooter(u) && segs.some((q) => segDist(u.pos.x, u.pos.z, q) < 3))) D.push(u); }
    else if (u.type === 'gun' && !u.isPlayer && !u.sidearm && !u.woundOut && !u.mounted) G.push(u);
  }
  if (!D.length || G.length < 2) return;
  const sh = [];
  for (const u of G) {
    if (sh.length >= 12) break;
    let best = null, bd = 70;
    for (const v of D) { const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z); if (d < bd && d > 6) { bd = d; best = v; } }
    if (best) sh.push([u, best]);
  }
  const st = rt._p7 || {}; st.rfG = G.length; st.rfS = sh.length;
  if (sh.length < 2) return;
  st.rfV = (st.rfV || 0) + 1;
  let cx = 0, cz = 0;
  for (const [u, v] of sh) {
    const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1;
    // 寄せ手の的と向きには触らない（11/21 act bot：真田丸の④で的を持った先手が前線の整理の下知で動かず刻限に）
    A.smoke(u.pos.x + dx / d * 1.2, u.pos.y + 1.45, u.pos.z + dz / d * 1.2, dx / d, dz / d, 0.8);
    cx += u.pos.x; cz += u.pos.z;
  }
  const c = { x: cx / sh.length, z: cz / sh.length }, P = rt.player && rt.player.u;
  if (!P || Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 120) A.play('volley', c, Math.min(1.2, 0.5 + sh.length * 0.05));
  if (Math.random() > (sh.length >= 6 ? 0.6 : 0.3)) return;
  for (let k = 0; k < sh.length; k++) {
    const [u, v] = sh[(k + Math.floor(Math.random() * sh.length)) % sh.length];
    const g = v.group;
    if (!v.alive || v.invuln || v.mustLive || v.name || v.type === 'busho') continue;
    if (g) { g._rfN0 = g._rfN0 || g.units.length; if (g.units.filter((q) => q.alive).length <= g._rfN0 * 0.5) continue; }
    A.damage(v, v.maxHp * 0.9, u, { kind: 'gun', pierce: true });
    st.rfK = (st.rfK || 0) + 1;
    break;
  }
}

// ③ 塀の外の全周に攻め手の幟。walls（守り手の塀の struct）の外へ、塀から六〜九m に二〜四本の組で立てる。
export function wallFlagRing(rt, walls, faction, gates = []) {
  const W = rt.world, segs = walls.filter((s) => s.seg && Math.hypot(s.seg[2] - s.seg[0], s.seg[3] - s.seg[1]) > 3);
  if (!segs.length || !faction) return null;
  let cx = 0, cz = 0;
  for (const s of segs) { cx += (s.seg[0] + s.seg[2]) / 2; cz += (s.seg[1] + s.seg[3]) / 2; }
  cx /= segs.length; cz /= segs.length;
  const pts = [];
  for (const s of segs) {
    const [ax, az, bx, bz] = s.seg, len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len;
    let nx = -tz, nz = tx;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }   // 外向き＝塀の真ん中から離れる側
    const h0 = W.heightAt(mx, mz);
    for (let d = 2 + rr(ax, az, 11) * 5; d < len - 2;) {
      const k = 2 + Math.floor(rr(ax + d, az + d, 12) * 3);
      for (let i = 0; i < k && d < len - 1; i++, d += 1.4 + rr(ax + d, az, 13) * 1.8) {
        const off = 6 + rr(ax + d, az + i, 14) * 3;
        const x = ax + tx * d + nx * off, z = az + tz * d + nz * off, y = W.heightAt(x, z);
        if (Math.abs(y - h0) > 4 || (W.walkable && !W.walkable(x, z, y))) continue;   // 崖の下・堀の水・壁の中には立てない
        if (Math.hypot(x - cx, z - cz) < Math.hypot(mx - cx, mz - cz)) continue;
        if (segs.some((q) => q !== s && segDist(x, z, q.seg) < 4)) continue;          // 隣の曲輪の塀の内側には立てない
        if (gates.some((g) => Math.hypot(x - g.x, z - g.z) < 9)) continue;             // 門の前（寄せの道）は空ける
        pts.push([x, z, rr(x, z, 15), Math.atan2(nx, nz)]);
      }
      d += 6 + rr(ax + d, az, 16) * 8;
    }
  }
  if (!pts.length) return null;
  pts.sort((a, b) => rr(a[0], a[1], 17) - rr(b[0], b[1], 17));
  if (pts.length > 120) pts.length = 120;
  const proto = nobori(W, 0, 0, faction, 6.4), flagSrc = proto.userData.flag;
  if (!flagSrc) return null;
  const staffSrc = flagSrc.children[0];
  const grp = new THREE.Group(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const [geo, mat] of [[staffSrc.geometry, staffSrc.material], [noboriClothLite(6.4), flagSrc.material]]) {
    const im = new THREE.InstancedMesh(geo, mat, pts.length);
    pts.forEach(([x, z, j, yaw], i) => {
      v.set(x, W.heightAt(x, z), z);
      e.set((j - 0.5) * 0.12, yaw + (rr(x, z, 18) - 0.5) * 0.7, (rr(x, z, 19) - 0.5) * 0.12);
      const w = 0.9 + j * 0.2; sc.set(w, 0.82 + rr(x, z, 20) * 0.26, w);
      q.setFromEuler(e); m.compose(v, q, sc); im.setMatrixAt(i, m);
    });
    im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    grp.add(im);
  }
  rt.scene.add(grp);
  rt._p7ringN = pts.length; return { grp, n: pts.length };
}
