// 足軽の主人公は組頭に従う（kaito 11/2 Q「自分勝手に動かない：『組頭に従え』と組頭が動き、自分はそれについていく形を基本に」）。全戦共通。
//   足軽（身分の一段目と二段目。信長で遊ぶ時は除く）の間だけ動く。
//   ① 組頭を決める：戦が決めた上役（rt.flags.kumiLeader・自分の組 rt.hostGroup の頭・稲生や森部の源八）か、近くの名のある味方の侍。
//   ② 組頭の組が先に動く：任務の行き先があれば、組頭の組（筋書きで動かす隊・本陣・大将の隊は除く）が行き先へ歩き出す。
//   ③ 自分が組頭から離れたら、行き先のピンの代わりに組頭の頭上のひし形と、組頭への地面の矢印を出す（mission_pin.js が kumiFollow を見る）。
//      組頭は「組頭に従え」と怒鳴る（同じ言葉は 20 秒に一度まで）。
//   def.kumiLead = false でその戦だけ止める。兵は足さず、消さない。
import { target } from './mission_pin_target.js';
import { movable } from './frontline_density.js';

const FAR = 13;           // 組頭からこれより離れたら、組頭について行く印にする
const STEP = 14;          // 組の要を一度に進める長さ
const c0 = { x: 0, z: 0 };
const proxy = { x: 0, z: 0, followUnit: null, follow: true, r: 3 };

function on(rt) {
  const G = rt.G || {};
  return rt.def.kumiLead !== false && !G.lord && (G.rank ?? 0) < 2 && !rt.def.dojo && !rt.def.town && !rt.def.mapCastle &&
    !rt.over && !rt.aftermath && rt.player?.u?.alive && !rt.player.mounted;
}

function usable(u, me) {
  return u?.alive && !u.gone && !u.fleeing && !u.woundOut && !u.downed && u !== me && !u.isPlayer && u.team === me.team && !u.mounted;
}

function findLeader(rt) {
  const me = rt.player.u, F = rt.flags;
  for (const u of [F.kumiLeader, rt.hostGroup?.leader, F.genU, F.genpachi, F.moribeOfficer]) if (usable(u, me)) return u;
  let best = null, bs = -Infinity;
  for (const u of rt.army.units) {
    if (!usable(u, me) || !u.name || u.type === 'busho' || u.isLord || u.isStandard || u.group?.isRunner) continue;
    const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z);
    if (d > 30) continue;
    const s = (/組頭|源八|隊長|足軽大将|物頭/.test(u.name) ? 100 : 0) - d;
    if (s > bs) { bs = s; best = u; }
  }
  return best;
}

// 組頭の組を行き先へ一歩ずつ進める（筋書きの隊は動かさない）
function lead(rt, K, dest) {
  const g = K.u.group;
  if (!g || g.isPlayerSquad || !movable(rt, g)) return;
  const c = g.center(c0);
  const dx = dest.x - c.x, dz = dest.z - c.z, d = Math.hypot(dx, dz);
  const stop = Math.max(4, (dest.r ?? 6) * 0.6);
  if (d <= stop + 1) return;
  // 斬り合っている間は動かない（前の敵を置いて行かない）
  let fight = 0, n = 0;
  for (const u of g.units) {
    if (!u.alive) continue; n++;
    const t = u.target;
    if (t?.alive && t.team !== u.team && Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) < 6) fight++;
  }
  if (n && fight / n > 0.3) return;
  const k = Math.min(STEP, d - stop) / d;
  g.anchor.x = c.x + dx * k; g.anchor.z = c.z + dz * k;
  g.facing = Math.atan2(dx, dz);
  const A = g._ai;
  if (A) { A.home = { x: g.anchor.x, z: g.anchor.z }; A.ax = null; A.spot = null; A.t = Math.min(A.t ?? 0, 0.4); }
  for (const u of g.units) if (u.alive) u.aiT = 0;
  K.moved = true;
}

export function kumiLeadTick(rt, dt) {
  const K = rt.kumiLead || (rt.kumiLead = { t: 0, u: null, show: false, moved: false, sayAt: -99 });
  if (!on(rt)) { K.show = false; return; }
  K.t -= dt;
  if (K.t > 0) return;
  K.t = 0.5;
  if (!usable(K.u, rt.player.u)) K.u = findLeader(rt);
  if (!K.u) { K.show = false; return; }
  const me = rt.player.u.pos, L = K.u.pos;
  let dest = null;
  try { dest = target(rt); } catch (e) { dest = null; }
  const usableDest = dest && !dest.follow && !dest.followUnit && !dest.fire && !dest.gate && !dest.route && !dest.passage && !dest.treatment &&
    !(dest.unit && dest.unit.team === rt.player.u.team) && Number.isFinite(dest.x);
  if (usableDest && !rt.choice && !rt.tutPause) lead(rt, K, dest);
  const far = Math.hypot(L.x - me.x, L.z - me.z);
  // 自分の方が行き先に近い（組頭より先に着いている）時は、ふだんのピンのまま
  const ahead = usableDest && Math.hypot(dest.x - me.x, dest.z - me.z) + 4 < Math.hypot(dest.x - L.x, dest.z - L.z);
  // 目の前で斬り合う敵がいる間は、組頭の印で邪魔をしない
  const busy = rt.player.inRange || dest?.enemy && Math.hypot(dest.x - me.x, dest.z - me.z) < 10;
  K.show = far > (usableDest ? FAR : FAR + 7) && !ahead && !busy;
  // 叱るのは組の頭（組頭・物頭）だけ。名のある侍（毛利新介ら）に足軽を叱らせない（11/6 桶狭間の学び・川田）
  if (K.show && far > 22 && rt.t - K.sayAt > 20 && !rt.choice && !(K.u.name && !/組頭|物頭|足軽大将|お頭|源八/.test(K.u.name))) {
    K.sayAt = rt.t;
    rt.say(K.u.name || '組頭', ['組頭に従え！　わしについて来い', '勝手に動くな！　組から離れるな', '遅れるな！　組と共に進め'][Math.floor(rt.t / 20) % 3], 3);
  }
}

// mission_pin.js：組頭について行く時の行き先（組頭の足もと）。ふだんは null
export function kumiFollow(rt) {
  const K = rt.kumiLead;
  if (!K?.show || !on(rt) || !usable(K.u, rt.player.u)) return null;
  proxy.x = K.u.pos.x; proxy.z = K.u.pos.z; proxy.followUnit = K.u; proxy.unit = K.u;
  return proxy;
}
