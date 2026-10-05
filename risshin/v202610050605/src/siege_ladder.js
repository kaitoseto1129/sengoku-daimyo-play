// 梯子（siege_ladder.js）… docs/siege-plan.md C3／docs/siege-spec.md 29〜31章・castle-fort-system-spec.md 40章（束23）
// floors.js の FL.ladders（床の層の土台）に、army の兵を一人ずつ登らせる薄い層。
// 呼び手（城攻めの戦。b_kinome.js など）は：
//   1) placeLadder(world, o) で梯子を立てる（foot・topY・topX/topZ・team・hp・deck・autoKnock・rt）
//   2) 兵が足もとに着いたら startClimb(u, ladder) を呼ぶ（ふさがっていれば自動で並ぶ）
//   3) 毎コマ updateLadders(army, dt) を呼ぶ（登りを進め、着いたら床の高さへ立たせる。運んでいる組も一緒に進む）
//   4) 守り手が押し倒す・梯子を壊す時は knockDown(ladder, army) を呼ぶ（登っている一人が落ちる）
// 束23（瞬間移動にしない）：carryLadder(rt, o) を呼ぶと、二人の兵が梯子を担いで歩き、
//   着いたら「掛ける」→「固定」を経て自動で placeLadder と同じ物になる（updateLadders が一緒に進める）。
// army_move.js の steer() は u.climb がある間は歩み・押し合いで動かさず、
// army_anim.js は u.climb がある間は登る形（poseClimb）を出す。
// 登っている間は u.stagger を切らさず立て直す＝攻撃も込め直しも起きない（既にどの手も見ている「竸り合い中」の印）。
// 登っている間の u._tdef（受ける損の倍率。army_combat.js が既に読む束21の口に乗せる。army_combat.js は直さない）。
import { FL, groundAt } from './floors.js';
import { hashigo } from './props.js';

const RUN = new Map();   // ladder.id -> { u: 登っている兵 | null, queue: [兵] }

function runOf(ladder) {
  let r = RUN.get(ladder.id);
  if (!r) { r = { u: null, queue: [] }; RUN.set(ladder.id, r); }
  return r;
}

// 梯子を新しく立てる。floors.js の FL.ladders を土台に、登る先（topX/topZ）を持たせる
// o.autoKnock：true なら、守り手が近くにいる時に自動で押し倒す（束23）。o.rt：その知らせ（logEvent）を出す先
export function placeLadder(world, o) {
  const foot = o.foot;
  const l = {
    id: FL.ladders.length, x: foot.x, z: foot.z,
    y0: world.heightAt(foot.x, foot.z), y1: o.topY,
    topX: o.topX ?? foot.x, topZ: o.topZ ?? foot.z,
    deck: o.deck ?? null, hp: o.hp ?? 40, maxHp: o.hp ?? 40, team: o.team, name: o.name || '梯子',
    speed: o.speed ?? 1.5, placed: true,
    landing: o.landing || null, onLand: o.onLand || null,
    autoKnock: !!o.autoKnock, rt: o.rt || null, _akT: 6 + Math.random() * 4,
  };
  FL.ladders.push(l);
  return l;
}

// 梯子を壊す・片付ける（門・塀と同じく hp<=0 で崩れる）。登っている兵は落ちる
export function removeLadder(ladder, army) {
  const r = runOf(ladder);
  ladder.hp = 0; ladder.placed = false;
  r.queue.length = 0;
  if (r.u) knockDown(ladder, army);
}

export function ladderAlive(ladder) { return !!(ladder && ladder.placed && ladder.hp > 0); }

// 升目の候補には遠い兵も入る。待つ間に離れた兵も、足もとから登り直す。
function atFoot(u, ladder) {
  return u.alive && !u.fleeing && !u.mounted && !u.climb
    && (ladder.team == null || u.team === ladder.team)
    && Math.hypot(u.pos.x - ladder.x, u.pos.z - ladder.z) <= 2.4
    && Math.abs(u.pos.y - ladder.y0) < 2;
}

// 兵一人を梯子へ取り付かせる：空いていれば登り始め、ふさがっていれば足もとで並ぶ
export function startClimb(u, ladder) {
  if (!ladderAlive(ladder) || !atFoot(u, ladder)) return false;
  const r = runOf(ladder);
  if (r.u) { if (!r.queue.includes(u)) r.queue.push(u); return false; }
  begin(u, ladder, r);
  return true;
}

function begin(u, ladder, r) {
  r.u = u;
  u.climb = {
    ladder, t: 0,
    dur: Math.max(1.4, (ladder.y1 - ladder.y0) / (ladder.speed || 1.5)) + (ladder.landing ? 1.2 : 0),
    heading: Math.atan2(ladder.topX - ladder.x, ladder.topZ - ladder.z),
    frac: 0,
  };
  u.target = null; u.atk = null; u.swing = null; u.reload = false;
  u.mv.x = 0; u.mv.z = 0; u.push.x = 0; u.push.z = 0;
  // 登る間は受ける損 1.5 倍（army_combat.js が既に読む _tdef・_tdefHigh の口。束21と同じ仕組み）
  u._tdefPrev = u._tdef; u._tdefHighPrev = u._tdefHigh;
  u._tdef = 1.5; u._tdefHigh = false;
}

// 登り終わり・落ちた時に、受ける損の倍率を元へ戻す
function endClimbDef(u) {
  u._tdef = u._tdefPrev; u._tdefHigh = u._tdefHighPrev;
  delete u._tdefPrev; delete u._tdefHighPrev;
}

// 並んでいる次の一人を登らせる
function advance(ladder, r) {
  if (!ladderAlive(ladder)) { r.queue.length = 0; return; }
  while (r.queue.length && !r.u) {
    const nu = r.queue.shift();
    if (atFoot(nu, ladder)) begin(nu, ladder, r);
  }
}

// 登っている一人を落とす（守り手が押し倒す・梯子が壊れる）。frac が高いほど大きな怪我
export function knockDown(ladder, army) {
  const r = runOf(ladder);
  const u = r.u;
  if (!u) return null;
  const frac = u.climb ? u.climb.frac : 0;
  u.climb = null; r.u = null;
  endClimbDef(u);
  if (u.alive) {
    u.hp -= 8 + frac * 40; u.lastHitT = army ? army.time : 0;
    if (u.hp <= 0 && army) army.kill(u, null); else u.stagger = Math.max(u.stagger || 0, 1.2);
  }
  advance(ladder, r);
  return u;
}

// 毎コマ：登っている兵を梯子沿いに進め、頂に着いたら床（塀の上）の高さへ立たせる。
// 守りの頭（autoKnock）の押し倒しと、運んでいる組（carryLadder）の歩みも一緒に進める
export function updateLadders(army, dt) {
  const world = army.world;
  for (const ladder of FL.ladders) {
    if (!ladder.placed) continue;
    const r = runOf(ladder);
    if (ladder.hp <= 0) { if (r.u) knockDown(ladder, army); continue; }
    // 守りの頭：梯子の上の端の4m内に守りの兵がいれば、6〜10秒に一度35%で押し倒す（束23・o.autoKnockの梯子だけ）
    if (ladder.autoKnock && r.u) {
      ladder._akT = (ladder._akT ?? 6) - dt;
      if (ladder._akT <= 0) {
        ladder._akT = 6 + Math.random() * 4;
        let near = 0;
        if (typeof army.forNear === 'function') {
          army.forNear(ladder.topX, ladder.topZ, 4, (o) => { if (o.alive && !o.isStruct && o.team !== ladder.team) near++; });
        }
        if (near > 0 && Math.random() < 0.35) {
          const fallen = knockDown(ladder, army);
          if (fallen && ladder.rt && typeof ladder.rt.logEvent === 'function') ladder.rt.logEvent('ladderDown', { team: ladder.team, who: fallen.id });
          continue;
        }
      }
    }
    // o.autoUse の梯子（castle_plan の castleLadders）：足もとに来た味方の兵（自分以外）を、二人まで並ばせて登らせる
    if (ladder.autoUse && typeof army.forNear === 'function') {
      ladder._auT = (ladder._auT ?? 0.6) - dt;
      if (ladder._auT <= 0) {
        ladder._auT = 0.6;
        let n = (r.u ? 1 : 0) + r.queue.length;
        army.forNear(ladder.x, ladder.z, 2.4, (o) => {
          if (n >= 3 || o.isStruct || o.isPlayer || !atFoot(o, ladder) || r.queue.includes(o)) return;
          startClimb(o, ladder); n++;
        });
      }
    }
    const u = r.u;
    if (!u) { advance(ladder, r); continue; }
    if (!u.alive || !u.climb) { r.u = null; advance(ladder, r); continue; }
    const c = u.climb;
    c.t += dt;
    c.frac = Math.min(1, c.t / c.dur);
    // 塀の頂まで登ってから、内側へ足を下ろす。石垣の高さも実際の地面から測る。
    const land = ladder.landing, up = land ? Math.min(1, c.t / (c.dur - 1.2)) : c.frac;
    const down = land ? Math.min(1, Math.max(0, (c.t - (c.dur - 1.2)) / 1.2)) : 0;
    u.pos.x = ladder.x + (ladder.topX - ladder.x) * up + (land ? (land.x - ladder.topX) * down : 0);
    u.pos.z = ladder.z + (ladder.topZ - ladder.z) * up + (land ? (land.z - ladder.topZ) * down : 0);
    u.pos.y = ladder.y0 + (ladder.y1 - ladder.y0) * up + (land ? (land.y - ladder.y1) * down : 0);
    u.heading = c.heading;
    // 登っている間は無防備（その間は打てない・込め直せない）
    u.stagger = Math.max(u.stagger || 0, 0.5);
    if (c.frac >= 1) {
      u.climb = null; r.u = null;
      endClimbDef(u);
      u.pos.y = groundAt(world, u.pos.x, u.pos.z, land ? land.y : ladder.y1);
      if (ladder.onLand) ladder.onLand(u);
      advance(ladder, r);
    }
  }
  if (CARRY.length) updateCarries(dt);
  if (WALLCLIMB.length) updateWallClimbs(army, dt);
}

export function resetLadders() { RUN.clear(); for (const j of CARRY) { if (j.mesh && j.rt && j.rt.scene) j.rt.scene.remove(j.mesh); } CARRY.length = 0; WALLCLIMB.length = 0; }

// ---- 柵・塀・石垣を、梯子なしで素手でよじ登る（梯子の poseClimb をそのまま使い回す。kaito 10/2） ----
// army_move.js の collide() が、柵へ押し続けて止まった兵（u._wallStuckT）を見つけたら startWallClimb を呼ぶ。
// u.climb の形は梯子と同じ（frac・heading を army_anim.js の poseClimb がそのまま読む）が、.ladder の代わりに .wall を持つ。
const WALLCLIMB = [];   // 今よじ登っている兵の一覧

export function startWallClimb(u, s, o = {}) {
  if (!u || !u.alive || u.climb || u.mounted || u.isPlayer) return false;
  let nx = s.nx || 0, nz = s.nz || 1;
  // 柵・塀の向こう側（相手の持ち場）へ、越えた先に立つ
  let side = u.team === s.team ? -1 : 1;
  const h = Math.min(3.2, Math.max(1.1, o.height ?? s.h ?? 2.0));
  const fromY = u.pos.y || 0;
  let fromX = u.pos.x, fromZ = u.pos.z;
  let toX = u.pos.x + nx * side * 1.3, toZ = u.pos.z + nz * side * 1.3;
  // 線の塀（seg）は、兵が今いる側から見て向こう側へ越える。外向きの決まり（nx・nz）が塀ごとに逆の事があり、
  // 登りながら塀から離れて外へ浮いていた（信貴山「塀の外で宙に浮いた兵」。見回り 10/2）。登り始めは塀の面に寄せる
  if (s.seg) {
    const [ax, az, bx, bz] = s.seg, L = Math.hypot(bx - ax, bz - az) || 1;
    nx = -(bz - az) / L; nz = (bx - ax) / L;
    const d = (u.pos.x - ax) * nx + (u.pos.z - az) * nz;
    const sg = d >= 0 ? 1 : -1, off = Math.min(Math.abs(d), 0.45);
    fromX = u.pos.x - nx * sg * (Math.abs(d) - off); fromZ = u.pos.z - nz * sg * (Math.abs(d) - off);
    toX = u.pos.x - nx * sg * (Math.abs(d) + 1.1); toZ = u.pos.z - nz * sg * (Math.abs(d) + 1.1);
    side = -sg;
  }
  u.climb = {
    wall: s, t: 0, dur: Math.max(1.3, h / (o.speed ?? 1.1)),
    heading: Math.atan2(nx * side, nz * side), frac: 0,
    fromX, fromZ, fromY, toX, toZ, h,
    foeTeam: 1 - u.team, akT: 1.0 + Math.random() * 1.5,
  };
  u.target = null; u.atk = null; u.swing = null; u.reload = false;
  u.mv.x = 0; u.mv.z = 0; u.push.x = 0; u.push.z = 0;
  u._tdefPrev = u._tdef; u._tdefHighPrev = u._tdefHigh;
  u._tdef = 1.5; u._tdefHigh = false;
  WALLCLIMB.push(u);
  return true;
}

// 登っている途中で守り手に打たれた・柵が壊れた時：下りの側へ転げ落ちる
export function knockDownWall(u, army) {
  if (!u || !u.climb || !u.climb.wall) return;
  const frac = u.climb.frac;
  u.climb = null; endClimbDef(u);
  const i = WALLCLIMB.indexOf(u); if (i >= 0) WALLCLIMB.splice(i, 1);
  if (u.alive) {
    u.hp -= 6 + frac * 30; u.lastHitT = army ? army.time : 0;
    if (u.hp <= 0 && army) army.kill(u, null); else u.stagger = Math.max(u.stagger || 0, 1.1);
  }
}

function updateWallClimbs(army, dt) {
  const world = army.world;
  for (let i = WALLCLIMB.length - 1; i >= 0; i--) {
    const u = WALLCLIMB[i];
    const c = u && u.climb;
    if (!u || !u.alive || !c || !c.wall) { if (u) endClimbDef(u); WALLCLIMB.splice(i, 1); continue; }
    if (c.wall.hp <= 0 || !c.wall.alive) { u.climb = null; endClimbDef(u); WALLCLIMB.splice(i, 1); continue; }
    c.t += dt;
    c.frac = Math.min(1, c.t / c.dur);
    const k = c.frac;
    // 柵の向こうに守り手がいれば、たまに押し落とされる（梯子の autoKnock と同じ作り）
    if (k > 0.25 && k < 0.92) {
      c.akT -= dt;
      if (c.akT <= 0) {
        c.akT = 2.2 + Math.random() * 2.2;
        let near = 0;
        if (typeof army.forNear === 'function') army.forNear(c.toX, c.toZ, 3.5, (o) => { if (o.alive && !o.isStruct && o.team === c.foeTeam) near++; });
        if (near > 0 && Math.random() < 0.22) { knockDownWall(u, army); continue; }
      }
    }
    u.pos.x = c.fromX + (c.toX - c.fromX) * k;
    u.pos.z = c.fromZ + (c.toZ - c.fromZ) * k;
    // 前半で柵の上まで上がり、後半は向こう側へ下りる（頂で少し間を置く）
    const destY = groundAt(world, c.toX, c.toZ, c.fromY);
    const topY = Math.max(c.fromY, destY) + c.h;
    u.pos.y = k < 0.55 ? c.fromY + (topY - c.fromY) * (k / 0.55) : topY + (destY - topY) * ((k - 0.55) / 0.45);
    u.heading = c.heading;
    u.stagger = Math.max(u.stagger || 0, 0.5);
    if (k >= 1) {
      u.climb = null; endClimbDef(u);
      u.pos.y = groundAt(world, u.pos.x, u.pos.z, destY);
      WALLCLIMB.splice(i, 1);
    }
  }
}

// ---- 束23：梯子を運ぶ→掛ける→固定（瞬間移動にしない） ----

const CARRY = [];   // carryLadder で作った運びの組の記録

function carrierCenter(job) {
  const alive = job.carriers.filter((u) => u.alive);
  if (!alive.length) return null;
  let x = 0, z = 0;
  for (const u of alive) { x += u.pos.x; z += u.pos.z; }
  return { x: x / alive.length, z: z / alive.length };
}

// 担ぎ手が討たれて二人に満たない間、同じ隊の近い者が拾い直す
function refillCarriers(job) {
  job.carriers = job.carriers.filter((u) => u.alive);
  if (job.carriers.length >= 2) return;
  const pool = (job.group && job.group.real && job.group.real.units) || (job.group && job.group.units) || [];
  const c = carrierCenter(job) || job.from;
  let best = null, bd = Infinity;
  for (const u of pool) {
    if (!u.alive || u._carry || u.climb || job.carriers.includes(u)) continue;
    const d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z);
    if (d < bd) { bd = d; best = u; }
  }
  if (best) { best._carry = job; best.atk = null; best.target = null; job.carriers.push(best); }
}

function placeCarryMesh(job, foot, top) {
  if (job.mesh) job.rt.scene.remove(job.mesh);
  job.mesh = hashigo(foot, top);
  job.rt.scene.add(job.mesh);
}

// 梯子を運ぶ組を作る：group（real.units を持つ備）から二人の兵を取り、担いで歩かせる。
// 着いたら「掛ける」3秒→「固定」2秒（その間は登れない）→ placeLadder と同じ物になる
// o: { team, from:{x,z}, to:{ foot:{x,z}, topY, topX, topZ }, carriers:2, group, autoKnock, hp }
export function carryLadder(rt, o) {
  const { team, from, to, carriers: nCarry = 2, group, autoKnock = false, hp = 40 } = o;
  const pool = (group && group.real && group.real.units) || (group && group.units) || [];
  const units = pool.filter((u) => u.alive && !u._carry && !u.climb).slice(0, nCarry);
  if (!units.length) return null;
  const job = {
    rt, team, group, from: { x: from.x, z: from.z }, to, hp, autoKnock,
    carriers: units, phase: 'carry', t: 0, mesh: null, ladder: null,
  };
  for (const u of units) { u._carry = job; u.atk = null; u.target = null; }
  placeCarryMesh(job,
    { x: from.x, y: rt.world.heightAt(from.x, from.z) + 0.9, z: from.z - 1 },
    { x: from.x, y: rt.world.heightAt(from.x, from.z) + 0.9, z: from.z + 1 });
  CARRY.push(job);
  return job;
}

export function carryAlive(job) { return !!(job && job.phase !== 'lost' && job.phase !== 'done'); }

function finishCarry(job) {
  const l = placeLadder(job.rt.world, {
    foot: job.to.foot, topY: job.to.topY, topX: job.to.topX, topZ: job.to.topZ,
    team: job.team, hp: job.hp, name: '運んだ梯子', autoKnock: job.autoKnock, rt: job.rt,
  });
  if (job.mesh) job.rt.scene.remove(job.mesh);
  l.mesh = hashigo({ x: l.x, y: l.y0, z: l.z }, { x: l.topX, y: l.y1, z: l.topZ });
  job.rt.scene.add(l.mesh);
  for (const u of job.carriers) if (u.alive) u._carry = null;
  job.ladder = l; job.phase = 'done';
  if (typeof job.rt.logEvent === 'function') job.rt.logEvent('ladderSet', { team: job.team });
}

// 毎コマ：運んでいる組を進める（updateLadders から呼ぶ。単独でも呼べる）
export function updateCarries(dt) {
  for (let i = CARRY.length - 1; i >= 0; i--) {
    const job = CARRY[i];
    if (job.phase === 'done' || job.phase === 'lost') { CARRY.splice(i, 1); continue; }
    refillCarriers(job);
    const alive = job.carriers.filter((u) => u.alive);
    if (!alive.length) { job.phase = 'lost'; if (job.mesh) job.rt.scene.remove(job.mesh); CARRY.splice(i, 1); continue; }
    if (job.phase === 'carry') {
      const c = carrierCenter(job);
      const dx = job.to.foot.x - c.x, dz = job.to.foot.z - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) { job.phase = 'set'; job.t = 0; continue; }
      const hx = dx / dist, hz = dz / dist;
      for (const u of alive) {
        const sp = (u.speed || 1.6) * 0.7;
        u.pos.x += hx * sp * dt; u.pos.z += hz * sp * dt;
        u.pos.y = groundAt(job.rt.world, u.pos.x, u.pos.z, u.pos.y);
        u.heading = Math.atan2(hx, hz);
        if (u.mv) { u.mv.x = 0; u.mv.z = 0; }
      }
      const gy = job.rt.world.heightAt(c.x, c.z) + 0.9;
      placeCarryMesh(job, { x: c.x - hx * 0.6 - hz * 0.8, y: gy, z: c.z - hz * 0.6 + hx * 0.8 },
                           { x: c.x + hx * 1.6 - hz * 0.8, y: gy, z: c.z + hz * 1.6 + hx * 0.8 });
    } else if (job.phase === 'set') {
      job.t += dt;
      for (const u of alive) if (u.mv) { u.mv.x = 0; u.mv.z = 0; }
      if (job.t >= 3) { job.phase = 'fix'; job.t = 0; }
    } else if (job.phase === 'fix') {
      job.t += dt;
      for (const u of alive) if (u.mv) { u.mv.x = 0; u.mv.z = 0; }
      if (job.t >= 2) finishCarry(job);
    }
  }
}
