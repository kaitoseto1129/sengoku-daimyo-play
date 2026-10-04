// 全戦で使う出来事。兵や形を足さず、起きた事を拾って強弱だけを整える。
import { onEvent } from './senkyo.js';
import { S } from './settings.js';
import { hush } from './audio.js';
import { decisiveCameraEvent } from './decisive_camera.js';

export const EVENT_FLAG_FALL = 'EVENT_FLAG_FALL';
export const EVENT_COMMANDER_KILLED = 'EVENT_COMMANDER_KILLED';
export const EVENT_CAVALRY_PASS = 'EVENT_CAVALRY_PASS';
export const EVENT_VOLLEY = 'EVENT_VOLLEY';
export const EVENT_UNIT_BREAK = 'EVENT_UNIT_BREAK';
export const EVENT_MESSENGER = 'EVENT_MESSENGER';
export const EVENT_FIRE_START = 'EVENT_FIRE_START';
export const EVENT_GATE_BREAK = 'EVENT_GATE_BREAK';
export const EVENT_REINFORCEMENT = 'EVENT_REINFORCEMENT';
export const EVENT_RETREAT = 'EVENT_RETREAT';
export const EVENT_COMMANDER_ADVANCE = 'EVENT_COMMANDER_ADVANCE';

const TYPES = [EVENT_FLAG_FALL, EVENT_COMMANDER_KILLED, EVENT_CAVALRY_PASS, EVENT_VOLLEY,
  EVENT_UNIT_BREAK, EVENT_MESSENGER, EVENT_FIRE_START, EVENT_GATE_BREAK, EVENT_REINFORCEMENT, EVENT_RETREAT, EVENT_COMMANDER_ADVANCE];
const WORDS = ['旗が倒れた', '大将が討たれた', '騎馬が駆け抜ける', '鉄砲が一斉に放たれた',
  '隊が崩れた', '使番が走っている', '火の手が上がった', '門が破られた', '新手が加わった', '兵が退き始めた', '大将が前へ出た。旗に続け'];
const BRIDGE = { runnerOut: EVENT_MESSENGER, gotsumeArrive: EVENT_REINFORCEMENT,
  taishoDown: EVENT_COMMANDER_KILLED, rout: EVENT_UNIT_BREAK,
  withdraw: EVENT_RETREAT, honjinFallback: EVENT_RETREAT, honjinRetreat: EVENT_RETREAT, armyBroken: EVENT_RETREAT };
const MAJOR = new Set(['taishoDown', 'honjinFallback', 'honjinRetreat', 'armyBroken']);
onEvent((rt, key, o) => {
  const type = BRIDGE[key];
  if (!type || !rt.events) return;
  const sonae = (rt.sonae || []).find((s) => s.id === o.who);
  battleEvent(rt, type, sonae ? sonae.b.pos : null, sonae ? sonae.b.real : null, o.team, MAJOR.has(key));
});

function slot() { return { type: '', t: -99, x: 0, z: 0, team: null, text: '', group: null, big: false, pending: false, level: 0, logIndex: 0 }; }
function copy(to, from) {
  to.type = from.type; to.t = from.t; to.x = from.x; to.z = from.z; to.team = from.team;
  to.text = from.text; to.group = from.group; to.big = from.big; to.pending = from.pending;
  to.level = from.level;
}
function gap() { return 30 + Math.random() * 30; }

export function battleEventsStart(rt) {
  const E = rt.events = { slots: TYPES.map(slot), log: Array.from({ length: 64 }, slot), count: 0,
    clock: 0, scan: 0, medium: gap(), large: -99, shown: -99, groups: new WeakMap(), fires: new WeakSet(), clashes: new WeakMap() };
  // 初めからいる兵や篝火を、援軍や火攻めと取り違えない。
  scan(rt, E, true);
}

// 呼び口は共通。位置は写しておき、後で兵が動いても起きた場所を保つ。
export function battleEvent(rt, type, pos = null, group = null, team = null, big = false, text = '') {
  const E = rt.events, i = TYPES.indexOf(type);
  if (!E || i < 0 || rt.over || rt.def.dojo || !rt.player.u.alive) return false;
  const e = E.slots[i];
  if (rt.t - e.t < 8 && (!big || e.big)) return false;
  const p = pos || rt.player.u.pos;
  if (!big && Math.hypot(p.x - rt.player.u.pos.x, p.z - rt.player.u.pos.z) > 100) return false;
  e.type = type; e.t = rt.t; e.x = p.x; e.z = p.z; e.team = team; e.group = group;
  e.text = text || `${team === 0 ? '味方の' : team === 1 ? '敵の' : ''}${WORDS[i]}`;
  e.big = big; e.pending = true; e.level = 0;
  e.logIndex = E.count++ % E.log.length;
  copy(E.log[e.logIndex], e);
  decisiveCameraEvent(rt, type, pos, team, big, e.text);
  return true;
}

function scan(rt, E, first) {
  const P = rt.player.u.pos;
  for (const g of rt.army.groups) {
    if (g.people || g.isRunner || g.clashSide || g.recyclable) continue;
    let state = E.groups.get(g);
    if (!state) {
      state = { order: g.order };
      E.groups.set(g, state);
      if (!first && g.count >= 4) battleEvent(rt, EVENT_REINFORCEMENT, g.anchor, g, g.team);
    }
    if (!first && g.order === 'retreat' && state.order !== 'retreat' && !g.routed) {
      battleEvent(rt, EVENT_RETREAT, g.anchor, g, g.team);
    }
    state.order = g.order;
    if (g.commanderAdvanceAt !== undefined && state.advance !== g.commanderAdvanceAt) {
      if (!first) battleEvent(rt, EVENT_COMMANDER_ADVANCE, g.commanderPush ? g.commanderPush.pos : g.anchor, g, g.team);
      state.advance = g.commanderAdvanceAt;
    }
    if (g.commanderLostAt !== undefined && state.lost !== g.commanderLostAt) {
      if (!first) battleEvent(rt, EVENT_COMMANDER_KILLED, g.anchor, g, g.team, true);
      state.lost = g.commanderLostAt;
    }
  }
  // 同じ知らせを出せない八秒間は、兵と使番の距離を調べ直さない。
  if (!first && rt.t - E.slots[TYPES.indexOf(EVENT_CAVALRY_PASS)].t >= 8) for (const u of rt.army.units) {
    if (!u.alive || u.isPlayer || u.fleeing || u.type === 'dummy' || !u.mounted || !u.vel) continue;
    const dx = u.pos.x - P.x, dz = u.pos.z - P.z;
    if (u.vel.x * u.vel.x + u.vel.z * u.vel.z > 25 && dx * dx + dz * dz < 784 &&
      battleEvent(rt, EVENT_CAVALRY_PASS, u.pos, u.group, u.team)) break;
  }
  if (!first && rt.t - E.slots[TYPES.indexOf(EVENT_MESSENGER)].t >= 8) for (const c of rt.couriers) {
    if (!c.m.visible) continue;
    const dx = c.m.position.x - P.x, dz = c.m.position.z - P.z;
    if (dx * dx + dz * dz < 3600 && battleEvent(rt, EVENT_MESSENGER, c.m.position, null, 0)) break;
  }
  for (const f of rt.world.fires) {
    if (E.fires.has(f)) continue;
    E.fires.add(f);
    if (!first && f.big && !f.torch) battleEvent(rt, EVENT_FIRE_START, f, null, null, f.size >= 3);
  }
  // 軽い大軍も同じ口へ。本物の兵に替わっただけの時は援軍に数えない。
  for (const C of rt.world.clashes || []) {
    let state = E.clashes.get(C);
    if (!state) {
      state = { a: false, b: false, surges: C.surges || 0, cav: new WeakSet() };
      E.clashes.set(C, state);
      if (first) { state.a = C.A.routed; state.b = C.B.routed; }
    }
    if (!first) {
      if (C.A.routed && !state.a) battleEvent(rt, EVENT_UNIT_BREAK, C, null, C.A.P.team, true);
      if (C.B.routed && !state.b) battleEvent(rt, EVENT_UNIT_BREAK, C, null, C.B.P.team, true);
      if (C.surges > state.surges) battleEvent(rt, EVENT_REINFORCEMENT, C);
    }
    state.a = C.A.routed; state.b = C.B.routed; state.surges = C.surges || 0;
    for (const cv of C.cav) if (cv.t >= 0 && !state.cav.has(cv)) {
      state.cav.add(cv);
      if (!first) battleEvent(rt, EVENT_CAVALRY_PASS, cv);
    }
  }
}

function present(rt, E, e, level, sub = '') {
  e.level = level;
  const record = E.log[e.logIndex];
  if (record.type === e.type && record.t === e.t) record.level = level;
  // 近くの隊旗の返事を使い回す。カメラや操作は奪わない。
  if (!S.reduceMotion && e.group && e.group.count && !e.group.routed) {
    for (const st of e.group.stds || []) if (st.userData.std) st.userData.std.dipT = level === 2 ? 1.6 : 0.9;
  }
  if (level === 2) {
    // 戦固有の見出し・任務が先。同じ討ち取りの見出しを二度出さない。
    if (rt.t - (rt._bannerT ?? -99) >= 8 && !rt.hud.bannerQ.length && rt.hud.bannerT <= 0) rt.banner(e.text, sub);
    else rt.bark(e.text, true);
    E.large = E.clock;
  } else if (level === 1) {
    // 字が既存の知らせに抑えられても、一息だけ曲を引いて中の間を作る。
    hush(1);
    rt.bark(e.text, e.team === 1);
  }
  e.pending = false;
  E.shown = E.clock;
  if (level > 0) E.medium = E.clock + gap();
}

// 城攻めの門突破は、その場の見出しと共通の出来事を一つにまとめる。
export function showGateBreak(rt, text, sub = '') {
  const E = rt.events, e = E && E.slots[TYPES.indexOf(EVENT_GATE_BREAK)];
  if (!e || !e.pending) return;
  e.text = text;
  copy(E.log[e.logIndex], e);
  if (E.clock - E.shown >= 8) present(rt, E, e, 2, sub);
}

export function battleEventsTick(rt, dt) {
  const E = rt.events;
  if (!E || rt.over || rt.def.dojo || !rt.player.u.alive) return;
  // 奇襲前・題の溜めでは時計も止める。台詞や任務の段取りは変えない。
  if (rt.flags.quiet || (rt.prelude && rt.prelude !== 'done')) return;
  E.clock += dt;
  E.scan -= dt;
  if (E.scan <= 0) { E.scan = 0.5; scan(rt, E, false); }
  let best = null;
  for (const e of E.slots) {
    if (!e.pending) continue;
    if (rt.t - e.t > 60) { e.pending = false; continue; }
    if (!best || (e.big && !best.big) || (e.big === best.big && e.t > best.t)) best = e;
  }
  if (best && best.big && E.clock - E.large >= 12 && E.clock - E.shown >= 8) {
    present(rt, E, best, 2);
  } else if (E.clock >= E.medium && E.clock - E.shown >= 8) {
    // 中は30〜60秒の間に一度。新しい出来事が無ければ、今いる隊の様子を報せる。
    if (!best) {
      let near = null, d = 100;
      for (const g of rt.army.groups) {
        if (!g.count || g.people || g.isRunner) continue;
        const c = g.anchor, dist = Math.hypot(c.x - rt.player.u.pos.x, c.z - rt.player.u.pos.z);
        if (dist < d) { near = g; d = dist; }
      }
      if (near) {
        const word = near.routed ? '退いている' : near.morale < 40 ? '苦戦している' : near.order === 'attack' ? '前へ進んでいる' : '持ち場を守っている';
        battleEvent(rt, EVENT_MESSENGER, near.anchor, near, near.team, false, `${near.team === 0 ? '味方' : '敵'}の隊は${word}`);
        const e = E.slots[TYPES.indexOf(EVENT_MESSENGER)];
        if (e.pending) best = e;
      }
    }
    if (best) present(rt, E, best, 1);
  }
  // 小は元からある倒れ方・煙・蹄・使番の姿だけ。字や大音量を重ねない。
}
