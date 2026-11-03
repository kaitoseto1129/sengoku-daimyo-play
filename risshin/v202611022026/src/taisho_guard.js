// 大将の周りの近習・旗本（docs/kaito_play_1101.md の O・全戦の共通の部品。battle.js が毎コマ呼ぶ）
//   信長・秀吉・秀長・家康・秀忠と、味方の総大将（taisho.js の isTaisho='a'）は一人で動かない。
//   ・本物の侍（足軽の陣笠・御貸具足でなく、家の具足に兜の侍）の一団が輪になって囲み、大将ごと動く（味方の大将だけ）
//   ・その外を軽い作りの侍・旗持ち・騎馬の輪（addDistantArmy の people）が囲み、大将の後を付いて歩く（数十人に見せる）
//   ・大将は足軽と斬り合わない：間近の敵だけ払う（army_think.js の u.oTaisho）
//   ・本人（遊び手）が寄ると、近い旗本が二人前へ出て立ち塞がり、大将の間近までは通さない
//   本能寺は森蘭丸と小姓衆が既に上様に付いて動く（b_honnoji.js）ので触らない。def.noTaishoGuard で戦ごとに止められる。
import { GENERALS, FACTION } from './units_data.js';
import { MEM_TIGHT } from './settings.js';
import { BATTLES } from './state.js';

const BIG = new Set(['織田信長', '羽柴秀吉', '木下秀吉', '豊臣秀吉', '羽柴秀長', '豊臣秀長', '徳川家康', '徳川秀忠']);
const SKIP = new Set(['honnoji']);
const pure = (n) => String(n || '').replace(/（.*?）/g, '').replace(/^.* /, '').trim();
const REAL = MEM_TIGHT ? 8 : 14;     // 本物の侍の数（近くの侍を差し引く）。軽い兵は本人の 44m の内に描かれないので、近くは本物で囲む
const LIGHT = MEM_TIGHT ? 16 : 28;   // 軽い作りの輪の数
const RING_R = 5.0;                   // 本物の旗本の輪の半径
const STOP_R = 3.4;                   // 本人はここより内へ入れない
const MEET_R = 7.5;                   // ここまで寄ると旗本が前へ出る
const CAP = 242;                      // 本物の兵の上限（全体 250 ほど）
const NEAR_P = 90;                    // 本人がこの内へ来たら本物の旗本を置く
const FAR_P = 140;                    // 本人がこの外へ離れたら本物の旗本を下げる（枠を空ける。遠くは軽い輪が見せる）

function isGuardLord(rt, u) {
  if (!u.alive || u.isPlayer || u.isStruct || u.type === 'dummy') return false;
  if (BIG.has(pure(u.name))) return true;
  return u.isTaisho === 'a' && (u.type === 'busho' || !!u.name);
}

// 大将の家の侍の姿（具足と威を大将に揃える）
function guardSpec(lord, n) {
  const gd = GENERALS[pure(lord.name)] || {};
  const o = { keep: true };
  if (gd.armor) o.armor = gd.armor;
  if (gd.lace) o.lace = gd.lace;
  return [{ type: 'samurai', n, o }];
}

function aliveCount(army) {
  let n = 0;
  for (const u of army.units) if (u.alive && !u.isStruct) n++;
  return n;
}

function realGuard(rt, L) {
  const army = rt.army, u = L.u, g0 = u.group;
  // 大将のそばに既にいる侍・騎馬（自分の組は除く）は旗本に数える
  let near = 0;
  for (const o of army.units) {
    if (o === u || !o.alive || o.team !== u.team || o.isPlayer || o.group?.isPlayerSquad) continue;
    if ((o.type === 'samurai' || o.type === 'cavalry') && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < RING_R + 2) near++;
  }
  const n = Math.min(REAL - Math.min(REAL, near >> 1), CAP - aliveCount(army) - (army.pendingSpawn || 0));
  if (n < 3) return null;
  const g = army.addGroup({
    team: u.team, faction: g0?.faction || 'oda', name: '', order: 'hold', formation: 'ring',
    anchor: { x: u.pos.x, z: u.pos.z }, facing: g0?.facing ?? 0, aggro: 5, seekRange: 8,
    spacing: RING_R * 2 * Math.PI / (0.95 * n), noRout: true, noAI: true, speed: 2.6,
  });
  g.taishoGuard = u;
  army.queueSpawn(g, guardSpec(u, n));
  return g;
}

function dropGuard(rt, L) {
  const army = rt.army, g = L.g;
  for (const o of g.units) if (o.alive) army.despawn(o);
  const i = army.groups.indexOf(g);
  if (i >= 0 && !g.units.some((o) => o.alive)) army.groups.splice(i, 1);
  L.g = null; L.meet = null;
}

// 軽い作りの外の輪：侍・旗持ち・騎馬。大将の周り 6〜10m に散らして置く（前は少し開けて、大将の見通しを残す）
function lightRing(rt, L) {
  const w = rt.world, u = L.u;
  if (!w?.addDistantArmy) return null;
  const gd = GENERALS[pure(u.name)] || {}, fac = FACTION[u.group?.faction] || FACTION.oda;
  const mon = gd.mon || fac.flag || 'oda', h = u.group?.facing ?? u.heading ?? 0;
  let s = 0; for (const ch of String(u.name)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const R = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const people = [];
  for (let i = 0; i < LIGHT; i++) {
    // 前（大将の向き）の 70 度は空ける
    const a = h + 0.6 + (i + R() * 0.6) / LIGHT * (Math.PI * 2 - 1.2), r = 6 + R() * 4;
    const k = i % 9 === 4 ? 'banner' : i % 7 === 3 ? 'rider' : 'samurai';
    people.push({ x: u.pos.x + Math.sin(a) * r, z: u.pos.z + Math.cos(a) * r, facing: h + (R() - 0.5) * 0.6, k });
  }
  const grp = w.addDistantArmy({ people, facing: h, armor: gd.armor || fac.busho || fac.armor, flag: mon, mon, team: u.team, host: false, seed: s % 997 + 1 });
  if (!grp || !grp.follow) return null;
  if (grp.army) grp.army.noWake = true;
  grp.follow(() => (u.alive && !u.fleeing ? { x: u.pos.x, z: u.pos.z, facing: u.group?.facing ?? h } : null), { gap: 0, speed: 3.2 });
  return grp;
}

// 寄った本人の前へ、近い旗本を二人出して立ち塞がらせる。本人は STOP_R より内へ入れない
function stopPlayer(rt, L) {
  const P = rt.player?.u, u = L.u;
  if (!P || !P.alive || P.team !== u.team) return;
  const dx = P.pos.x - u.pos.x, dz = P.pos.z - u.pos.z, d = Math.hypot(dx, dz);
  if (d > MEET_R || d < 1e-3) { L.meet = null; return; }
  const ux = dx / d, uz = dz / d;
  if (L.g) {
    if (!L.meet || rt.t > L.meetT) {
      L.meet = L.g.units.filter((o) => o.alive && !o.target).sort((a, b) =>
        Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) - Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z)).slice(0, 2);
      L.meetT = rt.t + 1;
    }
    const r = Math.max(STOP_R + 0.4, Math.min(d - 1.1, RING_R));
    L.meet.forEach((o, i) => {
      if (!o.alive || o.target) return;
      const side = (i ? 1 : -1) * 0.7;
      o.moveTo = { x: u.pos.x + ux * r - uz * side, z: u.pos.z + uz * r + ux * side };
      o.aiT = Math.max(o.aiT || 0, 0.6);
    });
  }
  if (d < STOP_R) { P.pos.x = u.pos.x + ux * STOP_R; P.pos.z = u.pos.z + uz * STOP_R; }
}

function adoptLord(rt, S, u) {
  const L = { u, g: null, ring: null };
  u.oTaisho = true; u.isLord = true;
  // 城の中・櫓の上の大将には外の輪を付けない（壁の内へ兵を寄せない）
  const ground = rt.world?.heightAt ? rt.world.heightAt(u.pos.x, u.pos.z) : u.pos.y;
  const inside = u.perch || u.climb || (u.pos.y ?? ground) - ground > 1.5;
  // 本物の旗本は、本人が 90m の内へ来た時に置く（遠い大将の分で本物の兵の枠を使わない）
  L.wantReal = !inside && u.team === rt.player?.u?.team;
  if (!inside) L.ring = lightRing(rt, L);
  S.list.push(L);
}

export function taishoGuardTick(rt, dt) {
  const def = rt.def;
  if (!rt.army || def?.dojo || def?.mapCastle || def?.noTaishoGuard || rt.G?.lord || SKIP.has(BATTLES[rt.index]?.id)) return;
  const S = rt.taishoGuard || (rt.taishoGuard = { list: [], scanT: 0, seen: new Set() });
  if (rt.t >= S.scanT) {
    S.scanT = rt.t + 2;
    for (const u of rt.army.units) if (!S.seen.has(u) && isGuardLord(rt, u)) { S.seen.add(u); adoptLord(rt, S, u); }
    const P = rt.player?.u;
    for (const L of S.list) {
      if (!L.wantReal || !L.u.alive || !P) continue;
      const d = Math.hypot(P.pos.x - L.u.pos.x, P.pos.z - L.u.pos.z);
      if (!L.g && d < NEAR_P) L.g = realGuard(rt, L);
      else if (L.g && d > FAR_P) dropGuard(rt, L);
    }
  }
  for (const L of S.list) {
    const u = L.u;
    if (!u.alive) continue;
    if (L.g) {
      // 輪は大将について動く。大将が退く・逃げる時も囲んだまま
      L.g.anchor.x = u.pos.x; L.g.anchor.z = u.pos.z;
      L.g.facing = u.group?.facing ?? L.g.facing;
      if (L.g.routed) { L.g.routed = false; L.g.morale = Math.max(L.g.morale, 40); }
    }
    stopPlayer(rt, L);
  }
}
