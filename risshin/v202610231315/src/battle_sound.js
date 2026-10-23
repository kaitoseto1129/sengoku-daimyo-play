// 近い兵は個別、中ほどは実在する隊の打ち合いと鬨、遠くは既存の戦場ループへ。
import { MEM_TIGHT } from './settings.js';

const CLASH = new Set(['kin', 'clash', 'nearClash', 'shaftContact', 'yoroi', 'thunk', 'hit', 'cut', 'thud']);
const VOICE = new Set(['shout', 'eshout', 'cry', 'umeki', 'toki', 'eiei']);

export function createBattleSound(rt) {
  const groups = new WeakMap();
  const result = { name: '', pos: null, vol: 1, grouped: false };
  const stats = { individual: 0, grouped: 0, distant: 0, merged: 0, farSoldiers: 0 };
  let speaker = null, nearest = Infinity, at = null, scanT = 0;
  function find(u) {
    if (!u.alive || u.isStruct) return;
    const d = (u.pos.x - at.x) ** 2 + (u.pos.z - at.z) ** 2;
    if (d < nearest) { nearest = d; speaker = u; }
  }
  return {
    stats,
    route(name, pos, vol) {
      result.name = name; result.pos = pos; result.vol = vol; result.grouped = false;
      if (!pos || (!CLASH.has(name) && !VOICE.has(name))) return result;
      const p = rt.player.u.pos, d = Math.hypot(pos.x - p.x, pos.z - p.z);
      // 本人の打ち合いと名のある将の声は、その位置のまま残す。
      const near = MEM_TIGHT ? 25 : 35;
      if (d <= near) { stats.individual++; return result; }
      at = pos; speaker = null; nearest = 2.25;
      rt.army.forNear(pos.x, pos.z, 1.5, find);
      if (speaker?.type === 'busho' && speaker.name && VOICE.has(name)) return result;
      if (d > 100) { stats.distant++; return null; }
      let group = speaker?.group;
      if (!group) {
        let best = 24;
        for (const g of rt.army.groups) {
          if (!g.count) continue;
          const c = g.center(), distance = Math.hypot(c.x - pos.x, c.z - pos.z);
          if (distance < best) { best = distance; group = g; }
        }
      }
      if (!group) return result;
      let state = groups.get(group);
      if (!state) { state = { until: 0, call: false }; groups.set(group, state); }
      if (state.until > rt.t) { stats.merged++; return null; }
      // 一隊で同時に一つ。槍と群声を交互にし、兵数は音の厚みに反映する。
      state.call = VOICE.has(name) || !state.call;
      result.name = state.call ? 'toki' : 'shaftContact';
      result.pos = group.center();
      result.vol = Math.min(1.5, vol * (0.8 + Math.min(0.7, group.count / 50)));
      result.grouped = true;
      state.until = rt.t + (state.call ? 4 : 2.5);
      stats.grouped++;
      return result;
    },
    tick(dt, active) {
      if (!active) { stats.farSoldiers = 0; scanT = 0; return 0; }
      scanT -= dt;
      if (scanT <= 0) {
        scanT = 0.5; stats.farSoldiers = 0;
        const p = rt.player.u.pos;
        for (const g of rt.army.groups) {
          if (!g.count || g.hidden || (g.hideFlags && (g._ai?.ambushWait || g.ambush)) || g.people || g.civ) continue;
          const c = g.center();
          if (Math.hypot(c.x - p.x, c.z - p.z) > 100) stats.farSoldiers += g.count;
        }
      }
      return Math.min(0.65, stats.farSoldiers / 200);
    },
  };
}
