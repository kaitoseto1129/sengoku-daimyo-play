// AB（kaito 11/3「出来事は濃く長く。一つの段でたくさんの敵としっかり数分戦い、敵の数と自分の手柄で段が進む。時間で勝手に次の段へ進めない」）
//   段の敵（初めの組）を崩し切っても、段の決めの数（need 人）を崩し、本人が mine 人を討つまでは、同じ方から新手（名の無い兵）が来る。
//   b_depth.js の激突と同じ考えを、段を自前で持つ戦（墨俣・森部など）でも使えるようにした物。
//   使い方：段の始めに abBegin(rt, 'w1')、段を終える判定に `gone(F.W1) && abMore(rt, 'w1', { groups: [F.W1], at, from })`
//   新手は前の新手が崩れてから一組ずつ（本物の兵は 230 を超えて出さない）。七分（limit）を過ぎたら新手は止めて段を進める
import { enemyGroup } from './bhelp.js';

const spent = (g) => !g || g.count <= 2 || g.routed || g.units.every((u) => !u.alive || u.fleeing);
const WORDS = ['新手が来るぞ！　構えよ！', '後ろからまだ寄せて来る！', '敵の新手じゃ！　息を継ぐ間も無いぞ！'];

const box = (rt) => (rt.flags.abMore = rt.flags.abMore || {});
export function abBegin(rt, key) {
  const B = box(rt);
  if (!B[key]) B[key] = { t0: rt.t, k0: rt.stats?.kills || 0, extra: [], n: 0 };
  return B[key];
}
// 段を進めてよければ true。まだなら新手を出して false
export function abMore(rt, key, o = {}) {
  const S = abBegin(rt, key);
  if (S.done) return true;
  const groups = (o.groups || []).filter(Boolean);
  const base = S.base ?? (S.base = groups.reduce((n, g) => n + g.units.length, 0));
  const need = o.need ?? Math.max(40, Math.round(base * 1.6));
  const mine = o.mine ?? 3;
  const beaten = base + S.extra.reduce((n, g) => n + (spent(g) ? g.units.length : g.units.reduce((m, u) => m + (u.alive && !u.fleeing ? 0 : 1), 0)), 0);
  const got = (rt.stats?.kills || 0) - S.k0;
  if ((beaten >= need && got >= mine) || rt.t - S.t0 > (o.limit ?? 420) || rt.over) { S.done = true; return true; }
  if (S.extra.some((g) => !spent(g))) return false;
  if (S.wait && rt.t < S.wait) return false;
  const live = rt.army.units.reduce((n, u) => n + (u.alive ? 1 : 0), 0);
  if (live >= 230) { S.wait = rt.t + 3; return false; }
  // 新手の顔ぶれ：初めの組の名の無い兵の型をそのまま（侍は一人まで）。o.list があればそれ
  const tpl = groups[0] || S.tpl;
  if (tpl && !S.tpl) { S.tpl = tpl; S.faction = tpl.faction; S.name = tpl.name; }
  let list = o.list;
  if (!list) {
    const cnt = {};
    for (const u of (tpl?.units || [])) if (u.type !== 'busho' && !u.name && !u.invuln && !u.isStruct && !u.civ) cnt[u.type] = (cnt[u.type] || 0) + 1;
    list = Object.entries(cnt).map(([type, n]) => ({ type, n: type === 'samurai' || type === 'cavalry' ? Math.min(n, 2) : Math.min(n, 16) }));
    if (!list.length) list = [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }];
  }
  const p = rt.player.u.pos;
  const at = o.at || (tpl && tpl.anchor) || { x: p.x, z: p.z };
  let from = o.from;
  if (!from) {
    // 段の場所から本人と反対へ四十五歩（目の前に湧かせない）
    const dx = at.x - p.x, dz = at.z - p.z, L = Math.hypot(dx, dz);
    const a = L > 3 ? Math.atan2(dx, dz) : S.n * 2.1;
    from = { x: at.x + Math.sin(a) * 45, z: at.z + Math.cos(a) * 45 };
  }
  const fl = { x: from.x - at.x, z: from.z - at.z }, L = Math.hypot(fl.x, fl.z) || 1;
  const g = enemyGroup(rt, { faction: o.faction || S.faction || 'saito', name: '新手の' + (o.name || S.name || '寄せ').replace(/^新手の/, ''), anchor: { x: from.x, z: from.z }, facing: Math.atan2(-fl.x, -fl.z), order: 'attack', seekRange: 70, aggro: 16, width: 10, morale: 80, fleeDir: { x: fl.x / L, z: fl.z / L } }, list);
  g.anchor = { x: at.x, z: at.z };
  g.dmgMult = o.dmg ?? 0.62;
  o.setup?.(g);
  S.extra.push(g); S.n++;
  rt.bark?.(WORDS[S.n % WORDS.length]);
  return false;
}
// 札に出す数：[崩した数, 決めの数]（段の始めから）
export function abCount(rt, key, groups, need) {
  const S = box(rt)[key];
  if (!S) return null;
  const base = S.base ?? (groups || []).filter(Boolean).reduce((n, g) => n + g.units.length, 0);
  const n = need ?? Math.max(40, Math.round(base * 1.6));
  const beaten = (groups || []).filter(Boolean).reduce((m, g) => m + (spent(g) ? g.units.length : g.units.reduce((k, u) => k + (u.alive && !u.fleeing ? 0 : 1), 0)), 0) + S.extra.reduce((m, g) => m + (spent(g) ? g.units.length : g.units.reduce((k, u) => k + (u.alive && !u.fleeing ? 0 : 1), 0)), 0);
  return [Math.min(n, beaten), n];
}
