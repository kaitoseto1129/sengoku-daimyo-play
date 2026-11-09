// 大軍の戦の本陣・先手・中軍を史実の比で厚くし、絵だけの大軍を出さない（kaito 11/3 AV4・7・10・全戦共通。battle.js が毎コマ呼ぶ）
//   ・名のある将の隊（本陣＝総大将・旗本、先手・中軍＝そのほかの名のある将）に、見えない所で本物の兵を足す（上限 250 を守る）
//   ・その隊の後ろに、同じ具足・同じ旗の軽い兵の段を付けて歩かせる（数は両軍の兵力から。本陣が一番厚い）。
//     この段は近づくと本物の兵に替わる（b_nagashinojo.js の wake・A.wakeAlways）。近づいて消える「絵」にしない
//   ・本物の兵の付いていない、本物に替わらない軽い大軍（遠くの絵の大軍）は描かない（近くに本物の兵が来たら戻す）
//   重さ：作るのは本人の 150m の内に来た隊だけ・段の人数は戦ごとの上限の内。隠した絵の大軍の分だけ軽くなる。0.5 秒に一度だけ考える
//   def.noAvHost で止める。絵の大軍を隠すのだけ止めるなら def.keepPaint
import { MEM_TIGHT } from './settings.js';
import { FACTION } from './units_data.js';
import { ARMY_STRENGTH } from './army_scale.js';

const BIG = /(徳川家康|徳川秀忠|羽柴秀吉|豊臣秀吉|木下秀吉|豊臣秀頼|織田信長|今川義元|武田勝頼|武田信玄|石田三成|宇喜多秀家|毛利輝元|上杉景勝|北条氏政|島津義久)/;
const CAP = 200;                                   // 本物の兵がこの数を超えていれば足さない（wake の枠を残す）
const REAL = MEM_TIGHT ? { hon: 20, saki: 12 } : { hon: 28, saki: 18 };   // 一つの隊の本物の兵の数（足すのはここまで）
const REAL_BUDGET = MEM_TIGHT ? 40 : 70;           // 一つの戦で足す本物の兵の合わせた数
const LIGHT_BUDGET = MEM_TIGHT ? 1100 : 2000;      // 一つの戦の軽い段の合わせた人数
const VIS_CAP = MEM_TIGHT ? 2600 : 4200;           // 見えている軽い兵（段を含む）の合わせた人数の上限（今より重くしない）
const MAKE_R = 150, FAR_SPAWN = 45;

function strength(rt) {
  const d = rt.def;
  let n = 0;
  try { const f = d.force?.(rt); if (f && f.a0 + f.b0 > 0) n = f.a0 + f.b0; } catch (e) { /* 数の無い戦 */ }
  const s = ARMY_STRENGTH[d.key];
  return Math.max(n, s ? s[0] + s[1] : 0);
}

const headOf = (g) => g.units.find((u) => u.alive && u.type === 'busho' && u.name && !u.isPlayer);
function roleOf(g, L) {
  const nm = String(L.name).replace(/（.*?）/g, '');
  return L.isTaisho || BIG.test(nm) || /(本陣|旗本|馬廻)/.test(g.name || '') ? 'hon' : 'saki';
}
// 隊の見た目（無名の兵から具足の色と旗の家）
function lookOf(g) {
  const fac = FACTION[g.faction] || {};
  let armor = fac.armor ?? 0x24221f, flag = fac.flag || g.faction;
  for (const u of g.units) {
    if (!u.alive || u.name || u.isPlayer) continue;
    const lk = u.look || {};
    if (lk.armor != null) armor = lk.armor;
    if (typeof lk.mon === 'string' && lk.mon) flag = lk.mon;
    break;
  }
  return { armor, flag };
}

export function avHostInit(rt) {
  const def = rt.def;
  if (def.noAvHost || def.dojo || def.town) return;
  const total = strength(rt);
  rt._av = { total, big: total >= 15000, f: Math.max(0, Math.min(1, Math.log10(Math.max(1, total) / 10000) / 1.3)), light: 0, real: 0, t: 0, paintT: 0, list: [] };
}

export function avHostTick(rt, dt) {
  const S = rt._av, P = rt.player?.u;
  if (!S || !P || rt.over || !rt.army) return;
  if ((S.t -= dt) > 0) return;
  S.t = 0.5;
  // 先に絵だけの大軍を隠し、その残りで段の人数の枠を決める。枠は始めに見えていた軽い兵の数まで（今より重くしない）
  if (S.vis0 == null) { S.vis0 = 0; for (const a of rt.world.armies || []) if (a.mesh?.visible && !a.people) S.vis0 += a.n || 0; S.vis0 = Math.min(S.vis0, VIS_CAP); }
  if (!rt.def.keepPaint && (S.paintT -= 0.5) <= 0) { S.paintT = 1; paint(rt, S.big); }
  if (S.big) escorts(rt, S, P);
  for (const q of S.list) if (!q.gone && (q.g.routed || !q.g.count)) { q.gone = true; q.b.rout?.({ hideAfter: 16 }); }
}

function escorts(rt, S, P) {
  const A = rt.army, W = rt.world;
  let alive = A.pendingSpawn || 0;
  for (const u of A.units) if (u.alive) alive++;
  for (const g of A.groups) {
    if (g._av === 'done' || g.isPlayerSquad || g.civ || g.hidden || g.ambush || g.routed || g.count < 2 || g.isRunner || g.people) continue;
    const L = headOf(g);
    if (!L) { g._av = 'done'; continue; }
    const c = g.center(), d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
    const role = roleOf(g, L);
    // 本物の兵を足す（一度だけ。見えない所にいる時か、始まりの五秒の内）
    if (!g._avReal && (rt.t < 5 || d > FAR_SPAWN) && alive < CAP && S.real < REAL_BUDGET) {
      g._avReal = true;
      const n = Math.min(REAL[role] - g.count, CAP - alive, REAL_BUDGET - S.real);
      if (n > 0) {
        const lk = lookOf(g), o = { armor: lk.armor };
        const list = role === 'hon'
          ? [{ type: 'samurai', n: Math.ceil(n * 0.5), o }, { type: 'ashigaru', n: Math.floor(n * 0.3), o }, { type: 'gun', n: n - Math.ceil(n * 0.5) - Math.floor(n * 0.3), o }]
          : [{ type: 'ashigaru', n: Math.ceil(n * 0.6), o }, { type: 'gun', n: Math.floor(n * 0.2), o }, { type: 'samurai', n: n - Math.ceil(n * 0.6) - Math.floor(n * 0.2), o }];
        A.spawn(g, list.filter((s) => s.n > 0));
        S.real += n; alive += n;
      }
    }
    // 後ろの軽い段（本人が 150m の内に来た時に作る）
    if (!g._avBack && d < MAKE_R && S.light < LIGHT_BUDGET) {
      g._avBack = true;
      const big = role === 'hon';
      let vis = 0;
      for (const a of W.armies || []) if (a.mesh?.visible && !a.people && !a._avHid && !(a.rout && a.routHide)) vis += a.n || 0;
      const n = Math.min(LIGHT_BUDGET - S.light, S.vis0 - vis, Math.round((big ? 260 + 380 * S.f : 120 + 200 * S.f) * (MEM_TIGHT ? 0.6 : 1)));
      if (n >= 40) {
        const b = backing(rt, W, g, c, big, n);
        if (b) { S.light += n; S.list.push({ g, b }); }
      }
    }
    if (g._avReal && g._avBack) g._av = 'done';
  }
}

function backing(rt, W, g, c, big, n) {
  const lk = lookOf(g), f = g.facing || 0;
  const w = big ? 30 : 22, depth = big ? 16 : 12, back = 5 + depth / 2 + 3;
  // 見える所の外では形を作らない決まり（outsideNearView）を、この隊の所で測る
  const lf = W.lastFocus; W.lastFocus = { x: c.x, z: c.z };
  let b;
  try {
    b = W.addDistantArmy({ x: 0, z: 0, w, d: depth, count: n, facing: f, armor: lk.armor, flag: lk.flag, mon: lk.flag, team: g.team,
      kind: big ? 'mixed' : 'spear', seed: 7300 + (g.id || rt._av.list.length * 13), host: false });
  } finally { W.lastFocus = lf; }
  if (!b?.army?.body) return null;
  b.position.set(c.x - Math.sin(f) * back, 0, c.z - Math.cos(f) * back);
  b.army.x0 = b.position.x; b.army.gap = back;
  const at = { x: c.x, z: c.z, facing: f };
  b.follow(() => {
    if (!g.count || g.routed) return null;
    let x = 0, z = 0, k = 0;
    for (const u of g.units) if (u.alive && !u.fleeing) { x += u.pos.x; z += u.pos.z; k++; }
    if (!k) return null;
    at.x = x / k; at.z = z / k;
    return at;
  }, { gap: back });
  b.army.team = g.team; b.army.wakeAlways = true; b.army.avHost = true;
  return b;
}

// 絵だけの大軍（本物に替わらない軽い大軍）は、近くに本物の兵がいる時だけ描く
function paint(rt, big) {
  const W = rt.world, units = rt.army.units, def = rt.def;
  for (const A of W.armies || []) {
    if (A.people || A.avHost || A.followFn || A.rout || !A.mesh) continue;
    // 大軍の戦は、本物に替わる軽い大軍でも本物の兵の付いていない物は隠す（広い野の遠くの山に並ぶ絵。11/3 AV4）
    const canWake = !big && !def.noWake && !A.noWake;
    if (canWake) { if (A._avHid) { A._avHid = false; A.mesh.visible = true; } continue; }
    if (!A._avHid && !A.mesh.visible) continue;   // 戦の台本が隠している物はそのまま
    const cx = A.mesh.position.x + (A.cx || 0) + (A.off?.x || 0), cz = A.mesh.position.z + (A.cz || 0) + (A.off?.z || 0);
    const r = Math.max(A.hw0 || 10, A.hd0 || 5) + 36, r2 = r * r;
    let near = false;
    for (const u of units) {
      if (!u.alive || u.isPlayer) continue;
      const dx = u.pos.x - cx, dz = u.pos.z - cz;
      if (dx * dx + dz * dz < r2) { near = true; break; }
    }
    if (near === !A._avHid) continue;
    // 11/4 AF：見えている所で急に現れたり消えたりしない。本人とカメラの両方から霞の奥（85m より先）の時だけ替える
    const P = rt.player?.u?.pos, C = rt.camera?.position, lim = r - 36 + 85;   // 隊の縁から 85m
    if ((P && Math.hypot(P.x - cx, P.z - cz) < lim) || (C && Math.hypot(C.x - cx, C.z - cz) < lim)) continue;
    A._avHid = !near; A.mesh.visible = near;
  }
}
