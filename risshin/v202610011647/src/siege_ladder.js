// 梯子（siege_ladder.js）… docs/siege-plan.md C3／docs/siege-spec.md 29〜31章
// floors.js の FL.ladders（床の層の土台）に、army の兵を一人ずつ登らせる薄い層。
// 呼び手（城攻めの戦。b_kinome.js など）は：
//   1) placeLadder(world, o) で梯子を立てる（foot・topY・topX/topZ・team・hp・deck）
//   2) 兵が足もとに着いたら startClimb(u, ladder) を呼ぶ（ふさがっていれば自動で並ぶ）
//   3) 毎コマ updateLadders(army, dt) を呼ぶ（登りを進め、着いたら床の高さへ立たせる）
//   4) 守り手が押し倒す・梯子を壊す時は knockDown(ladder, army) を呼ぶ（登っている一人が落ちる）
// army_move.js の steer() は u.climb がある間は歩み・押し合いで動かさず、
// army_anim.js は u.climb がある間は登る形（poseClimb）を出す。
// 登っている間は u.stagger を切らさず立て直す＝攻撃も込め直しも起きない（既にどの手も見ている「竸り合い中」の印）。
import { FL, groundAt } from './floors.js';

const RUN = new Map();   // ladder.id -> { u: 登っている兵 | null, queue: [兵] }

function runOf(ladder) {
  let r = RUN.get(ladder.id);
  if (!r) { r = { u: null, queue: [] }; RUN.set(ladder.id, r); }
  return r;
}

// 梯子を新しく立てる。floors.js の FL.ladders を土台に、登る先（topX/topZ）を持たせる
export function placeLadder(world, o) {
  const foot = o.foot;
  const l = {
    id: FL.ladders.length, x: foot.x, z: foot.z,
    y0: world.heightAt(foot.x, foot.z), y1: o.topY,
    topX: o.topX ?? foot.x, topZ: o.topZ ?? foot.z,
    deck: o.deck ?? null, hp: o.hp ?? 40, maxHp: o.hp ?? 40, team: o.team, name: o.name || '梯子',
    speed: o.speed ?? 1.5, placed: true,
  };
  FL.ladders.push(l);
  return l;
}

// 梯子を壊す・片付ける（門・塀と同じく hp<=0 で崩れる）。登っている兵は落ちる
export function removeLadder(ladder, army) {
  const r = runOf(ladder);
  if (r.u) knockDown(ladder, army);
  ladder.hp = 0; ladder.placed = false;
  r.queue.length = 0;
}

export function ladderAlive(ladder) { return !!(ladder && ladder.placed && ladder.hp > 0); }

// 兵一人を梯子へ取り付かせる：空いていれば登り始め、ふさがっていれば足もとで並ぶ
export function startClimb(u, ladder) {
  if (!ladderAlive(ladder) || u.climb || !u.alive) return false;
  const r = runOf(ladder);
  if (r.u) { if (!r.queue.includes(u)) r.queue.push(u); return false; }
  begin(u, ladder, r);
  return true;
}

function begin(u, ladder, r) {
  r.u = u;
  u.climb = {
    ladder, t: 0,
    dur: Math.max(1.4, (ladder.y1 - ladder.y0) / (ladder.speed || 1.5)),
    heading: Math.atan2(ladder.topX - ladder.x, ladder.topZ - ladder.z),
    frac: 0,
  };
  u.target = null; u.atk = null; u.swing = null; u.reload = false;
  u.mv.x = 0; u.mv.z = 0; u.push.x = 0; u.push.z = 0;
}

// 並んでいる次の一人を登らせる
function advance(ladder, r) {
  while (r.queue.length && !r.u) {
    const nu = r.queue.shift();
    if (nu.alive && !nu.climb) begin(nu, ladder, r);
  }
}

// 登っている一人を落とす（守り手が押し倒す・梯子が壊れる）。frac が高いほど大きな怪我
export function knockDown(ladder, army) {
  const r = runOf(ladder);
  const u = r.u;
  if (!u) return null;
  const frac = u.climb ? u.climb.frac : 0;
  u.climb = null; r.u = null;
  if (u.alive) {
    u.hp -= 8 + frac * 40; u.lastHitT = army ? army.time : 0;
    if (u.hp <= 0 && army) army.kill(u, null); else u.stagger = Math.max(u.stagger || 0, 1.2);
  }
  advance(ladder, r);
  return u;
}

// 毎コマ：登っている兵を梯子沿いに進め、頂に着いたら床（塀の上）の高さへ立たせる
export function updateLadders(army, dt) {
  const world = army.world;
  for (const ladder of FL.ladders) {
    if (!ladder.placed) continue;
    const r = runOf(ladder);
    if (ladder.hp <= 0) { if (r.u) knockDown(ladder, army); continue; }
    const u = r.u;
    if (!u) { advance(ladder, r); continue; }
    if (!u.alive || !u.climb) { r.u = null; advance(ladder, r); continue; }
    const c = u.climb;
    c.t += dt;
    c.frac = Math.min(1, c.t / c.dur);
    u.pos.x = ladder.x + (ladder.topX - ladder.x) * c.frac;
    u.pos.z = ladder.z + (ladder.topZ - ladder.z) * c.frac;
    u.pos.y = ladder.y0 + (ladder.y1 - ladder.y0) * c.frac;
    u.heading = c.heading;
    // 登っている間は無防備（その間は打てない・込め直せない）
    u.stagger = Math.max(u.stagger || 0, 0.5);
    if (c.frac >= 1) {
      u.climb = null; r.u = null;
      u.pos.y = groundAt(world, u.pos.x, u.pos.z, ladder.y1);
      advance(ladder, r);
    }
  }
}

export function resetLadders() { RUN.clear(); }
