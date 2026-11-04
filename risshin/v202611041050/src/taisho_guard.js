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
// 信長・秀吉・家康がいない戦の、味方の総大将（史実で、その戦の味方を率いた者。o_all60_1102）
const ALLY_LORD = {
  k01_fushimi: ['鳥居元忠'], k02_kawada: ['池田輝政'], k03_gifu: ['池田輝政'], k07_sawayama: ['小早川秀秋'], k09_imafuku: ['佐竹義宣'],
  k10_shigino: ['上杉景勝'], k12_kashii: ['浅野長晟'], k13_domyoji: ['松平忠輝'], k14_yao_wakae: ['藤堂高虎', '井伊直孝'],
  t03_komaki: ['森長可'], t03b_nagakute: ['羽柴秀次'], t06_hetsugi: ['長宗我部元親'], t08_nejirozaka: ['宮部継潤'], t09_yamanaka: ['豊臣秀次'], t10_oshi: ['石田三成'],
  t11_hachioji: ['前田利家'], echizen_ikko: ['柴田勝家'], iga: ['織田信雄'], tano: ['滝川一益'],
};
const pure = (n) => String(n || '').replace(/（.*?）/g, '').replace(/^.* /, '').trim();
const REAL_BIG = MEM_TIGHT ? 8 : 14, REAL_MID = MEM_TIGHT ? 4 : 8;     // 本物の侍の数（近くの侍を差し引く）。軽い兵は本人の 44m の内に描かれないので、近くは本物で囲む
const LIGHT_BIG = MEM_TIGHT ? 16 : 28, LIGHT_MID = MEM_TIGHT ? 10 : 16;   // 軽い作りの輪の数
const RING_R = 5.0;                   // 本物の旗本の輪の半径
const STOP_R = 3.4;                   // 本人はここより内へ入れない
const MEET_R = 7.5;                   // ここまで寄ると旗本が前へ出る
const CAP = 242;                      // 本物の兵の上限（全体 250 ほど）
const MIN_REAL = MEM_TIGHT ? 5 : 6;   // 上限に届いていても、本人の目の前の大将はこれだけの旗本で囲む（大将が一人で立たないように）
const CAP_HARD = 272;                 // その時も、これより多くはしない（有岡のように 260 人で組む戦）
const NEAR_P = 90;                    // 本人がこの内へ来たら本物の旗本を置く
const FAR_P = 140;                    // 本人がこの外へ離れたら本物の旗本を下げる（枠を空ける。遠くは軽い輪が見せる）

function isGuardLord(rt, u) {
  if (!u.alive || u.isPlayer || u.isStruct || u.type === 'dummy') return false;
  if (BIG.has(pure(u.name))) return true;
  if (u.team === rt.player?.u?.team && ALLY_LORD[rt.def?.key]?.includes(pure(u.name))) return true;
  if (u.isTaisho && (u.type === 'busho' || !!u.name)) return true;
  // 名のある武将は誰でも、前線に一人で出ない（侍の一団が周りを囲む）。11/2
  return u.type === 'busho' && !!u.name && !u.keep;
}
const isBig = (u) => BIG.has(pure(u.name)) || u.isTaisho === 'a';

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
  const army = rt.army, u = L.u, g0 = u.group, REAL = L.big ? REAL_BIG : REAL_MID;
  // 大将のそばに既にいる侍・騎馬（自分の組は除く）は旗本に数える
  let near = 0;
  for (const o of army.units) {
    if (o === u || !o.alive || o.team !== u.team || o.isPlayer || o.group?.isPlayerSquad) continue;
    if ((o.type === 'samurai' || o.type === 'cavalry') && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < RING_R + 2) near++;
  }
  const live = aliveCount(army) + (army.pendingSpawn || 0);
  let n = Math.min(REAL - Math.min(REAL, near >> 1), Math.max(CAP - live, Math.min(MIN_REAL, CAP_HARD - live)));
  // 本陣に大将一人だけ（設楽原の信長・家康の本陣など）で兵の上限に届いている時も、四人は必ず囲む（大将が一人で立たない。kaito_play O）
  const alone = (g0?.units || []).filter((o) => o.alive && o !== u).length < 3;
  if (alone && near < 4) n = Math.max(n, 4);
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
  const w = rt.world, u = L.u, LIGHT = L.big ? LIGHT_BIG : LIGHT_MID;
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

// 旗本の備（kaito AW6「名のある武将・侍大将の周りには常に何百の旗本」）：輪の外、将の後ろに軽い作りの備を一つ。
//   将について歩き、将が討たれる・逃げると崩れて散る。本物の兵・当たり・兵力の数には入れない（本物に替えない）。
//   本人が 130m の内へ来た時に作る（遠い将の分で記憶を使わない）。一戦の合計は HATA_MAX まで。
//   重さ：front_fill（奥の何もしない乱戦の絵・AV4）を止めた分をここへ回す（front_fill.js の HATA）。
const HATA_BIG = MEM_TIGHT ? 220 : 420, HATA_MID = MEM_TIGHT ? 90 : 180, HATA_MAX = MEM_TIGHT ? 700 : 1500, HATA_R = 130;
function hatamotoMass(rt, S, L) {
  const w = rt.world, u = L.u;
  if (!w?.addDistantArmy) return null;
  const n = Math.min(L.big || u.isTaisho ? HATA_BIG : HATA_MID, HATA_MAX - (S.hata || 0));
  if (n < 40) return null;
  const gd = GENERALS[pure(u.name)] || {}, fac = FACTION[u.group?.faction] || FACTION.oda;
  const mon = gd.mon || fac.flag || 'oda', h = u.group?.facing ?? u.heading ?? 0;
  const bx = -Math.sin(h), bz = -Math.cos(h), back = 12 + Math.sqrt(n) * 0.5;
  let s = 7; for (const ch of String(u.name)) s = (s * 33 + ch.charCodeAt(0)) >>> 0;
  const grp = w.addDistantArmy({ x: u.pos.x + bx * back, z: u.pos.z + bz * back, w: 10 + Math.sqrt(n) * 0.9, d: 6 + Math.sqrt(n) * 0.5,
    count: n, facing: h, armor: fac.armor, flag: mon, mon, team: u.team, kind: 'mixed', flagRate: 0.3, host: false, farFill: true, seed: s % 991 + 3 });
  if (!grp || !grp.follow || !grp.army?.n) return null;
  grp.army.noWake = true;
  S.hata = (S.hata || 0) + n;
  grp.follow(() => (u.alive && !u.fleeing ? { x: u.pos.x, z: u.pos.z, facing: u.group?.facing ?? h } : null), { gap: back, speed: 2.8 });
  return grp;
}

// 寄った本人の前へ、近い旗本を二人出して立ち塞がらせる。本人は STOP_R より内へ入れない
function stopPlayer(rt, L) {
  const P = rt.player?.u, u = L.u;
  if (!L.big || !P || !P.alive || P.team !== u.team) return;
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

const GUARD_CUT = 9;                  // 大将からこの内へ来た敵に、旗本を当てる
function interceptFoes(rt, L) {
  const u = L.u;
  let free = null;
  for (const e of rt.army.units) {
    if (!e.alive || e.team === u.team || e.isStruct || e.fleeing || e.type === 'dummy') continue;
    if (Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > GUARD_CUT) continue;
    if (L.g.units.some((o) => o.alive && o.target === e)) continue;
    free = free || L.g.units.filter((o) => o.alive && !o.fleeing && (!o.target || o.target.isStruct));
    let best = null, bd = 1e9;
    for (const o of free) { const d = Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z); if (d < bd && !o.target) { bd = d; best = o; } }
    if (!best) break;
    best.target = e; best.aiT = Math.max(best.aiT || 0, 1.2);
  }
}

function adoptLord(rt, S, u) {
  const L = { u, g: null, ring: null, big: isBig(u) };
  if (L.big) { u.oTaisho = true; u.isLord = true; }
  // 城の中・櫓の上の大将には外の輪を付けない（壁の内へ兵を寄せない）
  const ground = rt.world?.heightAt ? rt.world.heightAt(u.pos.x, u.pos.z) : u.pos.y;
  const inside = u.perch || u.climb || (u.pos.y ?? ground) - ground > 1.5;
  // 本物の旗本は、本人が 90m の内へ来た時に置く（遠い大将の分で本物の兵の枠を使わない）
  L.wantReal = !inside && !(u.isTaisho === 'b' && u.group?.guard);   // 敵の総大将は taisho.js の本陣の旗本がいる
  L.inside = !!inside;
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
    for (const L of S.list) {
      if (L.mass === undefined && L.u.alive && P && !L.inside && Math.hypot(P.pos.x - L.u.pos.x, P.pos.z - L.u.pos.z) < HATA_R) L.mass = hatamotoMass(rt, S, L);
      if (L.mass && !L.massGone && (!L.u.alive || L.u.fleeing || L.u.group?.routed)) { L.massGone = true; L.mass.rout?.({ hideAfter: 30 }); }
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
      u.oGuardG = L.g;
      // 大将へ寄る敵は、旗本が前へ出て受ける（大将が足軽と斬り合わないように）
      if (rt.t >= (L.cutT || 0)) { L.cutT = rt.t + 0.5; interceptFoes(rt, L); }
    }
    stopPlayer(rt, L);
  }
}
