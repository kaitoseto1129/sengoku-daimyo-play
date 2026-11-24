// 間の寄せ（11/18 K365・司令塔の名指し「斬り合う相手が少ない」設楽原・木津川口・信貴山・今福・鴫野・天王寺）
//   戦いの段で、本人の 10m 内に斬り合える敵（塀を挟まない）が二十秒いない時は、近い敵の組から三人だけ本人へ向ける（二十秒おき）。
//   （信貴山の調べ：30m 内に敵がいても塀の上・塀の向こうで寄って来ず、斬り合いが起きなかった）
//   敵の総数・強さ・受ける傷は変えない。兵を足さず、今いる無名の兵を歩かせるだけ（250 人の上限の内）。
//   前線の濃さ（frontline_density.js）が動いている間はそちらに任せる。def.lullDraw === false で戦ごとに切る。
//   本陣・総大将・伏兵・民・使番・退く隊・塀の向こうの兵は動かさない。
import { fighting } from './frontline_density.js';

const NEAR = 10, WAIT = 20, GAP = 20, TAKE = 3, FAR = 90, LIFE = 25;

const fightable = (u, P) => u.alive && !u.gone && !u.isStruct && !u.fleeing && !u.noTarget && !u.woundOut && !u.civ &&
  u.team !== P.team && u.type !== 'dummy' && u.type !== 'porter' && (u.sidearm || u.type !== 'gun' && u.type !== 'bow') &&
  !u.group?.hidden && !u.group?.people && !u.group?.civ;

function sourceOk(rt, g) {
  if (!g || g.routed || g.hidden || g.ambush || g.people || g.civ || g.isRunner || g.campGuard || g.retreatOnly || g.march || g.marching ||
      g.noEngage || g.interiorHold || g.peaceful || g.isPlayerSquad || g.noLull || g._ai?.ambushWait ||
      g.order === 'retreat' || g.order === 'flee' || g.order === 'path' || g.order === 'move') return false;
  const T = rt.taisho;
  if (g === T?.a?.g || g === T?.b?.g || g === T?.a?.u?.group || g === T?.b?.u?.group || g.butai?.sonae?.line === 'honjin') return false;
  return !/本陣|旗本|馬廻/.test(g.name || '');
}

const pickable = (u, A) => u.alive && !u.gone && !u.name && !u.isLord && !u.isTaisho && !u.mounted && !u.isStandard && !u.stdHeld && !u.banner &&
  u !== u.group.leader && (u.type === 'ashigaru' || u.type === 'samurai' || u.sidearm) && !u.fleeing && !u.woundOut && !u.downed &&
  !u.climb && !u.perch && !u.atk && !u.swing && !u.bind && !(u.lullUntil > A.time) &&
  !(u.target?.alive && u.target.pos && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) <= 8);

export function foeLullTick(rt, dt) {
  const A = rt.army, P = rt.player?.u;
  if (!A || !P) return;
  const L = A.foeLull || (A.foeLull = { scan: 0, empty: 0, next: 0 });
  L.scan += dt;
  if (L.scan < 1) return;
  const el = L.scan; L.scan = 0;
  if (rt.def.lullDraw === false || rt.over || rt.aftermath || rt.withdrawal || rt.flags.ending || !P.alive || rt.def.dojo || rt.def.town ||
      rt.choice || rt.tutPause || (rt.prelude && rt.prelude !== 'done') || A.duel || A.frontlineDensity?.on || !fighting(rt, {}) ||
      P.hp < P.maxHp * 0.5) { L.empty = 0; return; }   // 命が半ばを切った本人へは寄せない（設楽原の追い討ちで弱った本人に侍が続いた）
  for (const u of A.units) {
    if (!fightable(u, P)) continue;
    const dx = u.pos.x - P.pos.x, dz = u.pos.z - P.pos.z;
    if (dx * dx + dz * dz < NEAR * NEAR && Math.abs(u.pos.y - P.pos.y) < 2.5 && !A.wallBetween(u.pos, u.team, P.pos)) { L.empty = 0; return; }
  }
  L.empty += el;
  if (L.empty < WAIT || A.time < L.next) return;
  // 一番近い使える兵の組を一つ選び、その組の本人に近い兵から三人
  let best = null, bd = FAR;
  const W = L.why || (L.why = {});
  for (const u of A.units) {
    if (!fightable(u, P)) continue;
    if (!pickable(u, A)) { W.pick = (W.pick || 0) + 1; continue; }
    if (!sourceOk(rt, u.group)) { W.src = (W.src || 0) + 1; continue; }
    const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
    if (d >= FAR) { W.far = (W.far || 0) + 1; continue; }
    if (Math.abs(u.pos.y - P.pos.y) >= 4) { W.dy = (W.dy || 0) + 1; continue; }
    if (A.wallBetween(u.pos, u.team, P.pos)) { W.wall = (W.wall || 0) + 1; continue; }
    if (d < bd && Math.abs(u.pos.y - P.pos.y) < 4 && !A.wallBetween(u.pos, u.team, P.pos)) { bd = d; best = u; }
  }
  L.next = A.time + GAP;
  if (!best) return;
  const g = best.group, cand = [];
  for (const u of g.units) {
    if (!fightable(u, P) || !pickable(u, A) || Math.abs(u.pos.y - P.pos.y) >= 4 || A.wallBetween(u.pos, u.team, P.pos)) continue;
    cand.push(u);
  }
  cand.sort((a, b) => Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) - Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z));
  for (let i = 0; i < Math.min(TAKE, cand.length); i++) {
    const u = cand[i];
    u.lullUntil = A.time + LIFE; u.target = P; u.watch = null; u.moveTo = null; u.aiT = 0;
  }
  L.empty = 0;
  L.sent = (L.sent || 0) + Math.min(TAKE, cand.length);
}

// 兵の判断から呼ぶ：寄せた兵は本人へ向かう（本人が遠く離れた・組が崩れた・退く下知が出た時は手を引く）
export function foeLullStep(A, u) {
  if (!(u.lullUntil > A.time)) return false;
  const P = A.playerUnit, g = u.group;
  if (!P?.alive || A.duel || u.fleeing || u.woundOut || !g || g.routed || g.order === 'retreat' || g.order === 'flee' || g.order === 'path' ||
      Math.hypot(P.pos.x - u.pos.x, P.pos.z - u.pos.z) > FAR + 20) { u.lullUntil = 0; return false; }
  if (u.atk || u.swing || u.bind) return false;
  u.target = P; u.watch = null; u.moveTo = null;
  return true;
}
