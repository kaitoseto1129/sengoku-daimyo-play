// 大軍の寄せ（kaito 10/31「小隊対小隊はチープ。散らばった小隊を一つに集め、大軍対大軍で一気に攻め寄せる」）。
// 手の空いた「かかれ」の隊を、軍ごとに一つの大きな群れ（備）にまとめ、本人の居る前線へ一緒に押し寄せる。
// 兵を後ろの集まり場へ下げて揃えるのでなく、今いる所から前へ寄りながら一つの横列へ揃う（10/31 c_mass_fix：
//   開戦25秒に兵が前から離れて画面に居なくなるのを止める）。揃うのは待たず、前の隊から押し、後の隊は追い付いて加わる。
// 開戦の時から本人の傍（NEAR0）に居る隊（前線の守り・最初の区画の兵）と、今もう本人の傍（NEAR）に居る隊は、群れに入れずそのまま戦わせる。
// 戦の定義の隊は消さず、兵も足さない。動かすのは隊の要（anchor）と向きだけ。斬り合いに入った隊から群れを離れ、ふだんの頭へ戻る。
// 触らない隊：自分の組・本陣・大将・伏兵・守り・城の持ち場・筋書きの下知（frontline_density の movable が見る）・控えの射手。
// def.massAssault = false でその戦だけ止める。
import { localClear } from './army_local_way.js';

const LINE_MAX = 72;      // 一列の幅（m）。超えれば二列目を 12m 後ろへ
const FAR = 150;          // 本人からこの内の隊を集める
const CLOSE = 30;         // 群れの真ん中がこれより近ければ、集めずにそのまま戦わせる
const NEAR = 45;          // 本人からこの内の隊は、もう前線に居るので群れに入れない
const NEAR0 = 70;         // 開戦の時にこの内に居た隊は、ずっと群れに入れない
const probeA = { x: 0, y: 0, z: 0 }, probeB = { x: 0, y: 0, z: 0 };
const cTmp = { x: 0, z: 0 };

function engagedShare(g) {
  let n = 0, e = 0;
  for (const u of g.units) {
    if (!u.alive || u.fleeing) continue;
    n++;
    const t = u.target;
    if (t?.alive && t.pos && t.team !== u.team && Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) < 7) e++;
  }
  return n ? e / n : 1;
}

function missileShare(g) {
  let n = 0, m = 0;
  for (const u of g.units) if (u.alive) { n++; if (!u.sidearm && (u.type === 'gun' || u.type === 'bow')) m++; }
  return n ? m / n : 1;
}

function groundY(g) {
  for (const u of g.units) if (u.alive) return u.pos.y;
  return 0;
}

function eligible(rt, g, movable, P) {
  if (g._massOwn || g._massNear0 || g._pacing || g.order !== 'attack' && g.order !== 'hold' && g.order !== 'yari' || g.count < 4 || g.routed || g.isPlayerSquad) return false;
  if (!movable(rt, g, true)) return false;
  // 守りの隊は、大将の傍（25m）の旗本だけを残し、ほかの備は群れに加える。
  if (g.guard || g.guardOn) {
    const c = g.center(cTmp);
    for (const u of rt.army.units) if (u.alive && u.team === g.team && (u.isLord || u === rt.taisho?.a?.u || u === rt.taisho?.b?.u) &&
      Math.hypot(u.pos.x - c.x, u.pos.z - c.z) < 25) return false;
  }
  if (missileShare(g) >= 0.5 || engagedShare(g) >= 0.25) return false;
  const c = g.center(cTmp), d = Math.hypot(c.x - P.x, c.z - P.z);
  return d >= NEAR && d < FAR;
}

function release(rt, g) {
  g._massOwn = null;
  const A = g._ai;
  // 頭の持ち場を今の所へ移し、元の陣へ引き返させない。
  if (A) { A.home = { x: g.anchor.x, z: g.anchor.z }; A.ax = null; A.spot = null; A.t = Math.min(A.t ?? 0, 0.4); }
  for (const u of g.units) if (u.alive) u.aiT = 0;
}

function disband(rt, M, cd) {
  for (const g of M.groups) if (g._massOwn === M) release(rt, g);
  M.groups.length = 0; M.phase = 'idle'; M.next = rt.army.time + cd;
}

// 群れの前（寄せる先）。敵の群れは本人へ、味方の群れは本人の少し前（敵の側）へ。
function frontPoint(rt, team, out) {
  const P = rt.player.u.pos;
  out.x = P.x; out.z = P.z;
  if (team !== rt.player.u.team) return true;
  let x = 0, z = 0, n = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u.fleeing || u.isStruct || u.team === team) continue;
    const d = Math.hypot(u.pos.x - P.x, u.pos.z - P.z);
    if (d > 120) continue;
    x += u.pos.x; z += u.pos.z; n++;
  }
  if (!n) return false;
  const dx = x / n - P.x, dz = z / n - P.z, d = Math.hypot(dx, dz) || 1;
  const k = Math.min(10, d * 0.5);
  out.x = P.x + dx / d * k; out.z = P.z + dz / d * k;
  return true;
}

function form(rt, M, movable) {
  const A = rt.army, P = rt.player.u.pos, team = M.team;
  const list = M.groups; list.length = 0;
  let n = 0, cx = 0, cz = 0;
  for (const g of A.groups) {
    if (g.team !== team || !eligible(rt, g, movable, P)) continue;
    const c = g.center(cTmp), k = g.count;
    list.push(g); n += k; cx += c.x * k; cz += c.z * k;
  }
  if (list.length < 2 || n < 16 || !frontPoint(rt, team, M.front)) { list.length = 0; return false; }
  cx /= n; cz /= n;
  let dx = M.front.x - cx, dz = M.front.z - cz;
  const L = Math.hypot(dx, dz);
  if (L < CLOSE) { list.length = 0; return false; }
  dx /= L; dz /= L;
  M.dx = dx; M.dz = dz;
  // 横の並びは今の左右の順を保つ（隊どうしが交差しない）。
  const px = dz, pz = -dx;
  for (const g of list) { const c = g.center(cTmp); g._massLat = (c.x - cx) * px + (c.z - cz) * pz; }
  list.sort((a, b) => a._massLat - b._massLat);
  // 一列目・二列目に分け、それぞれの真ん中を揃える。
  let row = 0, w = 0;
  const widths = M.widths || (M.widths = [0, 0]); widths[0] = widths[1] = 0;
  for (const g of list) {
    const gw = Math.max(6, g.halfWidth() * 2) + 2;
    if (row === 0 && w + gw > LINE_MAX && w > 0) { row = 1; w = 0; }
    g._massRow = row; g._massW = gw; g._massS = w + gw / 2; w += gw; widths[row] = w;
  }
  for (const g of list) {
    g._massLat = g._massS - widths[g._massRow] / 2;
    g._massBack = g._massRow * 12;
    g._massOwn = M;
    // 持ち場の隊も「かかれ」に替えて群れと寄せる（群れを離れた後もそのまま戦う）。
    if (g.guardOn) g.guardOn = false;
    if (g.order !== 'attack') { g._massPrev = g.order; (M.conv || (M.conv = [])).push(g); g.order = 'attack'; g.formation = g.formation === 'yari' ? 'line' : g.formation; }
  }
  // 列の始まりは、いちばん前（前線に近い）の隊の所。後ろの隊は下がらせず、前へ寄りながら列に加わる。
  let lead = -Infinity;
  for (const g of list) { const c = g.center(cTmp); lead = Math.max(lead, (c.x - cx) * dx + (c.z - cz) * dz); }
  lead = Math.min(lead, L - CLOSE * 0.5);
  M.x = cx + dx * lead; M.z = cz + dz * lead;
  // 揃うのを待たずにすぐ寄せる。足は群れの並（遅い隊は追い付く足で加わる）。
  M.phase = 'charge'; M.t0 = A.time; M.speed = 0;
  for (const g of list) M.speed += g.speed || 2.2;
  M.speed /= list.length;
  A.play?.('eshout', M, 1); A.play?.('taiko', M, 0.8);
  return true;
}

function slot(M, g, out) {
  const px = M.dz, pz = -M.dx;
  out.x = M.x + px * g._massLat - M.dx * g._massBack;
  out.z = M.z + pz * g._massLat - M.dz * g._massBack;
  return out;
}

function decide(rt, M, movable) {
  const A = rt.army;
  // 斬り合いに入った隊・下知が変わった隊・崩れた隊は群れを離れる。
  for (let i = M.groups.length - 1; i >= 0; i--) {
    const g = M.groups[i];
    if (g._massOwn !== M || g.order !== 'attack' || g.routed || g.count < 2 || !movable(rt, g, true) || engagedShare(g) >= 0.3) {
      if (g._massOwn === M) release(rt, g);
      M.groups.splice(i, 1);
    }
  }
  if (M.groups.length < 1) { disband(rt, M, 8); return; }
  frontPoint(rt, M.team, M.front);
  if (M.phase === 'charge') {
    let n = 0, e = 0;
    for (const g of M.groups) { const k = g.count; n += k; e += engagedShare(g) * k; }
    if (Math.hypot(M.front.x - M.x, M.front.z - M.z) < 6 || e > n * 0.35 || A.time - M.t0 > 45) { disband(rt, M, 14); return; }
  }
  // 行き先までの道が塞がれた隊は、その隊だけ離す（川・塀を要だけが越えない）。
  for (let i = M.groups.length - 1; i >= 0; i--) {
    const g = M.groups[i], q = slot(M, g, cTmp), y = groundY(g);
    probeA.x = g.anchor.x; probeA.z = g.anchor.z; probeA.y = y;
    probeB.x = q.x; probeB.z = q.z; probeB.y = y;
    const lim = Math.hypot(q.x - g.anchor.x, q.z - g.anchor.z);
    if (lim > 1 && !localClear(A, probeA, probeB)) { release(rt, g); M.groups.splice(i, 1); }
  }
  if (!M.groups.length) disband(rt, M, 8);
}

function move(rt, M, dt) {
  const A = rt.army;
  if (M.phase === 'charge') {
    // 真ん中を前へ。遅れた隊は待たない（後から追い付いて加わる）。
    const sp = M.speed * 1.15;
    const dx = M.front.x - M.x, dz = M.front.z - M.z, d = Math.hypot(dx, dz);
    if (d > 0.1) { const k = Math.min(d, sp * dt); M.x += dx / d * k; M.z += dz / d * k; }
  }
  const h = Math.atan2(M.dx, M.dz);
  for (const g of M.groups) {
    const q = slot(M, g, cTmp);
    let dx = q.x - g.anchor.x, dz = q.z - g.anchor.z;
    // 前の隊を後ろへ下げない：列より前に出ている隊は、横へだけ寄って列を待たずにそのまま押す。
    const ahead = -(dx * M.dx + dz * M.dz);
    if (ahead > 0) { dx += M.dx * ahead; dz += M.dz * ahead; dx += M.dx * Math.min(ahead, M.speed * 1.15); dz += M.dz * Math.min(ahead, M.speed * 1.15); }
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      // 列に追い付くまでは各自の早足で、列に着いたら真ん中と同じ足で。兵が要に遅れた隊だけは要を緩める。
      const c = g.center(probeA), lag = Math.hypot(c.x - g.anchor.x, c.z - g.anchor.z);
      const sp = (d > 6 ? Math.max((g.speed || 2.2) * 1.3, M.speed * 1.6) : M.speed * 1.6) * (lag > g.halfWidth() + 8 ? 0.3 : 1);
      const k = Math.min(d, sp * dt);
      g.anchor.x += dx / d * k; g.anchor.z += dz / d * k;
    }
    g.facing = h;
  }
}

export function massAssaultTick(rt, on, dt, movable) {
  const A = rt.army;
  const S = A.mass || (A.mass = [0, 1].map((team) => ({ team, phase: 'idle', groups: [], next: 0, front: { x: 0, z: 0 }, x: 0, z: 0, dx: 0, dz: 1, t0: 0, speed: 2.2, at: 0 })));
  const off = !on || rt.def.massAssault === false || !rt.player?.u?.alive || A.duel;
  // 開戦の時から本人の傍に居る隊は、最初の一度だけ印を付けて群れに入れない（前線の守り・最初の区画の兵）。
  if (!A._massNear0Done && rt.player?.u?.pos) {
    A._massNear0Done = true;
    const P = rt.player.u.pos;
    for (const g of A.groups) { if (!g.count) continue; const c = g.center(cTmp); if (Math.hypot(c.x - P.x, c.z - P.z) < NEAR0) g._massNear0 = true; }
  }
  for (const M of S) {
    if (off) {
      if (M.phase !== 'idle') disband(rt, M, 4);
      // 退き・行軍の段へ移ったら、持ち場から連れ出した隊のうち斬り合っていない隊を元の下知へ戻す（追手を増やさない）。
      if (M.conv?.length && on === false) {
        for (const g of M.conv) if (g.order === 'attack' && g._massPrev && !g.routed && engagedShare(g) < 0.3) { g.order = g._massPrev; g.anchor.x = g.center(cTmp).x; g.anchor.z = cTmp.z; }
        M.conv.length = 0;
      }
      continue;
    }
    if (A.time >= M.at) {
      M.at = A.time + 1;
      if (M.phase === 'idle') { if (A.time >= M.next && !form(rt, M, movable)) M.next = A.time + 3; }
      else decide(rt, M, movable);
    }
    if (M.phase !== 'idle') move(rt, M, dt);
  }
}
