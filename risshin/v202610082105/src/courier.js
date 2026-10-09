// 使番の騎馬（courier.js）：本陣で命を受け → 道を駆け → 味方の部隊の頭に着いて馬を止め、伝え → その時に初めて命令が変わり → 本陣へ戻る。
// battle.js の buildCouriers が作った騎馬（rt.couriers）を、updateCouriers から courierTick(rt, dt) で動かす。毎コマ new しない（持ち物は初めに一度）。
// 見えている間は消さない。消えるのは討たれた時だけ（命は届かない。しばらくして本陣から新しい使番が出る）。
import { logEvent } from './senkyo.js';
import { runnerBlocked, honjinPos, RUNNER_SPEED } from './denrei.js';
import { animateHorse } from './units.js';

const TURNS = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6];
const WAIT_HONJIN = [6, 12];     // 本陣で次の命を待つ秒
const GIVE_SEC = 2.6;            // 頭の前で馬を止めて伝える秒
const TAKE_SEC = 1.6;            // 本陣で命を受ける秒
const ARRIVE = 4;                // 頭にこの内まで寄れば着いた
const RESPAWN = 45;              // 討たれてから次の使番が出るまで
const SAY_GAP = 8;               // 知らせの同じ型は 8 秒に一度

function homeOf(rt) {
  const team = rt.player.u.team;
  return honjinPos(rt, team) || rt.player.u.pos;
}
function headOf(g) {
  const l = g.leader;
  if (l && l.alive && !l.gone && l.pos) return l.pos;
  return g.center();
}
function eligible(rt, g, team) {
  return g.team === team && g.count >= 6 && !g.routed && !g.isRunner && !g.people && !g.isPlayerSquad && !g.clashSide && !g.recyclable && g.units && g.units.length;
}
function say(rt, key, text, group) {
  const S = rt._courierSay || (rt._courierSay = {});
  if ((S[key] ?? -99) + SAY_GAP > rt.t) return;
  // 出発と到着を合わせ、同じ組の知らせは三十秒に一度まで。
  if (group && (group._courierNoticeT ?? -99) + 30 > rt.t) return;
  S[key] = rt.t;
  if (group) group._courierNoticeT = rt.t;
  if (rt.bark) rt.bark(text);
}
function log(rt, c, ev, g) {
  const L = rt.courierLog || (rt.courierLog = []);
  if (L.length < 400) L.push({ t: Math.round(rt.t * 10) / 10, c: c.id, ev, g: g ? (g.name || g.kind || '') : '', x: Math.round(c.m.position.x), z: Math.round(c.m.position.z) });
  logEvent(rt, 'courier' + ev, { team: rt.player.u.team, who: g ? (g.name || '') : '' });
}

// この使番が運ぶ命：頭の隊の様子で決める（今の命令の仕組み＝g.order・seekRange・士気）
function giveOrder(rt, g) {
  if (!g.count || g.routed) return '';
  if (g.morale < 40) { g.morale = Math.min(100, g.morale + 12); return '踏みとどまれ'; }
  if (g.order !== 'attack' && g.ai === true && !g.noAI && !g.guard && !g.reserve && g.order !== 'retreat') {
    g.order = 'attack'; g.seekRange = Math.max(g.seekRange || 0, 45);
    for (const u of g.units) if (u.alive) u.aiT = 0;
    return '前へ出よ';
  }
  g.morale = Math.min(100, g.morale + 5);
  return '押し続けよ';
}

function pickTarget(rt, c, team) {
  const home = c.m.position;
  let best = null, bs = -1e9;
  for (const g of rt.army.groups) {
    if (!eligible(rt, g, team)) continue;
    const o = rt.couriers.find((x) => x !== c && x.st && x.st.g === g);
    if (o) continue;
    const p = headOf(g);
    const d = Math.hypot(p.x - home.x, p.z - home.z);
    if (d < 25) continue;   // 本陣のすぐそばの隊（馬廻）へは走らない
    const since = rt.t - (g._courierT ?? -99);
    if (since < 40) continue;
    const sc = (100 - g.morale) / 8 + (g.order !== 'attack' ? 4 : 0) - d / 40 + Math.random() * 3;
    if (sc > bs) { bs = sc; best = g; }
  }
  return best;
}

// 前へ。壁・柵・建物・水を避け、小刻みに回り道を試す。進めた長さを返す
function advance(rt, c, tx, tz, dt, spd) {
  const w = rt.world, m = c.m.position;
  let want = { x: tx, z: tz };
  if (w?.def?.runnerWay) {
    const u = c._wayU || (c._wayU = { team: rt.player.u.team, group: { isRunner: true }, pos: { x: 0, z: 0 } });
    u.pos.x = m.x; u.pos.z = m.z;
    want = w.def.runnerWay(rt.army, u, want) || want;
  }
  const dx = want.x - m.x, dz = want.z - m.z, L = Math.hypot(dx, dz) || 1;
  const water = w?.waterSpeedAt ? w.waterSpeedAt(m.x, m.z, true) : 1;
  let dist = Math.min(L, spd * water * dt), done = 0;
  while (dist > 0.001) {
    const step = Math.min(0.6, dist);
    let moved = false;
    for (const a of TURNS) {
      const cs = Math.cos(a), sn = Math.sin(a);
      const nx = m.x + ((dx * cs - dz * sn) / L) * step, nz = m.z + ((dx * sn + dz * cs) / L) * step;
      if (runnerBlocked(rt, nx, nz)) continue;
      c.face = Math.atan2(nx - m.x, nz - m.z); m.x = nx; m.z = nz; moved = true; break;
    }
    if (!moved) break;
    dist -= step; done += step;
  }
  return done;
}

// 壁や柵の中に出てしまったら、近くの通れる所へ寄せる（初めと、動けなくなった時だけ）
function freeSpot(rt, m) {
  if (!runnerBlocked(rt, m.x, m.z)) return;
  for (let r = 2; r <= 14; r += 2) for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, x = m.x + Math.cos(a) * r, z = m.z + Math.sin(a) * r;
    if (!runnerBlocked(rt, x, z)) { m.x = x; m.z = z; return; }
  }
}
function place(rt, c, moving, dt) {
  const m = c.m, w = rt.world;
  m.position.y = w.heightAt(m.position.x, m.position.z);
  // 向きはなめらかに回す
  let d = c.face - m.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  m.rotation.y += d * Math.min(1, dt * 8);
  animateHorse(c.h, dt, moving ? c.speed : 0);
  if (moving && Math.random() < dt * 3) w.puff(m.position.x, m.position.z, 2);
}

function struck(rt, c, dt) {
  const team = rt.player.u.team, x = c.m.position.x, z = c.m.position.z;
  for (const g of rt.army.groups) {
    if (g.team === team || g.routed || !g.count || g.people || g.isRunner) continue;
    const p = g.center();
    if (Math.abs(p.x - x) > 40 || Math.abs(p.z - z) > 40) continue;
    if (Math.hypot(p.x - x, p.z - z) < 8 + Math.sqrt(g.count) * 0.6 && Math.random() < 0.22 * dt) return true;
  }
  return false;
}

export function courierTick(rt, dt) {
  if (!rt.couriers || !rt.couriers.length || !rt.player || !rt.player.u) return;
  const team = rt.player.u.team;
  const home = homeOf(rt);
  for (const c of rt.couriers) {
    let s = c.st;
    if (!s) {
      s = c.st = { mode: 'wait', t: 6 + c.s * 14 + Math.random() * 4, g: null, order: '' };
      c.id = rt.couriers.indexOf(c);
      c.face = 0;
      c.m.position.set(home.x + (c.id ? 3 : -3), 0, home.z + 4);
      c.m.rotation.y = 0;
      c.m.visible = true;
      freeSpot(rt, c.m.position);
      c.speed = RUNNER_SPEED + c.id * 0.8;
    }
    if (s.mode === 'dead') {
      s.t -= dt;
      if (s.t > 0) continue;
      s.mode = 'wait'; s.t = 4; s.g = null;
      c.m.position.set(home.x + (c.id ? 3 : -3), 0, home.z + 4);
      c.m.visible = true;
      freeSpot(rt, c.m.position);
    }
    const m = c.m.position;
    let moving = false;
    if (s.mode === 'wait' || s.mode === 'take') {
      // 本陣で控える。次の命を待ち、受ける間は馬を止める
      s.t -= dt;
      if (s.mode === 'wait' && s.t <= 0) {
        const g = pickTarget(rt, c, team);
        if (g) { s.mode = 'take'; s.t = TAKE_SEC; s.g = g; s.order = ''; c.face = Math.atan2(headOf(g).x - m.x, headOf(g).z - m.z); }
        else s.t = 3;
      } else if (s.mode === 'take' && s.t <= 0) {
        s.mode = 'out'; s.stuck = 0; s.t = 0; s.nudged = false; freeSpot(rt, m);
        g_mark(rt, s.g);
        log(rt, c, 'Out', s.g);
        say(rt, 'out', `使番が${s.g.name || '味方の備'}へ走った`, s.g);
      }
    } else if (s.mode === 'out') {
      const g = s.g;
      if (!eligible(rt, g, team)) { s.mode = 'back'; s.stuck = 0; log(rt, c, 'Void', g); }
      else {
        const p = headOf(g);
        const done = advance(rt, c, p.x, p.z, dt, c.speed);
        moving = done > 0;
        s.stuck = done < c.speed * dt * 0.25 ? s.stuck + dt : 0;
        c.face = Math.atan2(p.x - m.x, p.z - m.z);
        if (Math.hypot(p.x - m.x, p.z - m.z) <= ARRIVE) { s.mode = 'give'; s.t = GIVE_SEC; moving = false; log(rt, c, 'Reach', g); }
        else if (s.stuck > 3 && !s.nudged) { s.nudged = true; freeSpot(rt, m); }
        else if (s.stuck > 6) { s.mode = 'back'; s.stuck = 0; log(rt, c, 'Stuck', g); }
        else if (struck(rt, c, dt)) { c.m.visible = false; s.mode = 'dead'; s.t = RESPAWN; log(rt, c, 'Lost', g); say(rt, 'lost', `${g.name || '味方の備'}へ向かった使番が討たれた`); continue; }
      }
    } else if (s.mode === 'give') {
      // 頭の前で馬を止めて伝える。伝え終えた時に初めて命令が変わる
      const g = s.g, p = headOf(g);
      c.face = Math.atan2(p.x - m.x, p.z - m.z);
      s.t -= dt;
      if (s.t <= 0) {
        if (eligible(rt, g, team)) {
          s.order = giveOrder(rt, g);
          log(rt, c, 'Give', g);
          if (rt.replyGroup) rt.replyGroup(g, false, false);
          say(rt, 'give', `${g.name || '味方の備'}に命が届いた。${s.order}`, g);
        }
        s.mode = 'back'; s.stuck = 0;
      }
    } else if (s.mode === 'back') {
      const done = advance(rt, c, home.x, home.z, dt, c.speed);
      moving = done > 0;
      s.stuck = done < c.speed * dt * 0.25 ? s.stuck + dt : 0;
      c.face = Math.atan2(home.x - m.x, home.z - m.z);
      if (Math.hypot(home.x - m.x, home.z - m.z) <= ARRIVE + 1 || s.stuck > 8) {
        s.mode = 'wait'; s.t = WAIT_HONJIN[0] + Math.random() * (WAIT_HONJIN[1] - WAIT_HONJIN[0]); moving = false;
        log(rt, c, 'Back', s.g); s.g = null;
      } else if (struck(rt, c, dt)) { c.m.visible = false; s.mode = 'dead'; s.t = RESPAWN; log(rt, c, 'Lost', null); continue; }
    }
    place(rt, c, moving, dt);
  }
}
function g_mark(rt, g) { g._courierT = rt.t; }
