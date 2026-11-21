// ======================================================================
// 設楽原の決戦　kaito 11/19 の頼み（docs/kaito_ledger.md・docs/fujin/shitaragahara.md「11/19 柵の内と騎馬の波」）
//   「柵から織田の兵を出ないようにして、もっと武田の騎馬の突撃を増やしてほしい。もっと撃って、敵が騎馬から落っこちるところが見たい。
//    武将たちが前面に出ていないから、足軽だけと戦っている感じになる。後詰めの備ももっとちゃんと前に出した方が、戦いの感じが伝わる。」
//   前の頼み：「追撃するまで兵は一切柵の外に出ないように」。
//   ① fenceKeep：追い討ちの下知（F.pursuit）までは、織田・徳川の兵（本人の組も）を一の柵（x14）より東へ一歩も出さない。
//      出た者はその場で柵の内へ戻し、組の行き先も柵の内へ直す（本人だけは遊ぶ人が動かすので縛らない）。
//   ② kibaTick：武田の騎馬の波。信長公記の寄せの順（一番 山県・二番 逍遥軒・三番 小幡の赤武者・四番 典厩の黒武者）と土屋の手から、
//      名のある将が率いる騎馬衆が、本人の正面の柵（口を外した所）へ段丘から駆け下り、柵の前で撃たれて引き返し、また寄せる（一つの波で三度まで）。
//      柵の内の鉄砲が一斉に放ち、当たった騎馬武者は鞍から落ちて地に倒れ、空の馬が駆け去る（乗り手だけ撃たれた時は馬を死なせない。
//      四発に一発ほどは馬に当たり、馬が崩れて乗り手が投げ出される）。本人に近い騎馬から撃つ（落ちる所が見える）。
//      一度に寄せる波は二つまで。帰り着いた騎馬は段丘の奥で消える（兵の数の上限の内）。
//   兵の形・材質は共通の物を使い、毎コマ new しない。
// ======================================================================
import { isTouch } from '../touch.js';

// 一つの波の騎馬の数（将を除く）。携帯は軽く
export const KIBA_N = isTouch ? 20 : 34;   // 11/19 kaito「騎馬隊を増やして」（16・24）→ 11/20 kaito「全体的に大きく」（20・34）
export const KIBA_WAVES = isTouch ? 3 : 5;   // 11/20 kaito「広い正面から何波も」：同時に寄せる波（3・3→3・4）
export const KIBA_REAL = KIBA_WAVES * (KIBA_N + 1);
// 率いる将（同じ名の将が場にいれば飛ばす）。広瀬・三科は山県の赤備えの侍大将、土屋昌恒は土屋昌次の弟（いずれも長篠に出た）
const LEADERS = [
  { name: '広瀬景房', fac: 'akazonae', flag: 'takeda_kiba', house: '山県' },
  { name: '武田信廉', fac: 'takeda', flag: 'takeda', house: '逍遥軒' },
  { name: '小幡信貞', fac: 'akazonae', flag: 'takeda_kiba', house: '小幡' },
  { name: '土屋昌恒', fac: 'takeda', flag: 'takeda', house: '土屋' },
  { name: '武田信豊', fac: 'takeda', flag: 'takeda', house: '典厩' },
  { name: '三科形幸', fac: 'akazonae', flag: 'takeda_kiba', house: '山県' },
  { name: '三枝守友', fac: 'akazonae', flag: 'takeda_kiba', house: '山県' },   // 11/20：同時の波が増えたので名のある率い手を足す（いずれも長篠で討死した騎馬の将）
  { name: '甘利信康', fac: 'takeda', flag: 'takeda', house: '甘利' },
  { name: '米倉重継', fac: 'takeda', flag: 'takeda', house: '米倉' },
];
const HOME_DX = 110;   // 11/20：150→110（来るのが速く、間が短い）
//   // 段丘の奥（一の柵から百五十）で生まれ、そこへ帰って消える

// ---- ① 柵の外へ出さない ----
export function fenceKeep(rt, SB) {
  const F = rt.flags;
  if (F.pursuit || rt.over || !rt.army) return;
  const lim = SB.x0 - 0.8;
  for (const u of rt.army.units) {
    if (u.team !== 0 || u.isPlayer || !u.alive || u.gone || u.isStruct || u.civ) continue;
    if (u.pos.x <= lim) continue;
    u.pos.x = lim;
    if (u.vel && u.vel.x > 0) u.vel.x = 0;
    if (u.push && u.push.x > 0) u.push.x = 0;
    F.fenceBack = (F.fenceBack || 0) + 1;
    const g = u.group;
    if (!g || g._fkAt > rt.t) continue;
    g._fkAt = rt.t + 0.5;
    if (g.anchor && g.anchor.x > lim - 2) g.anchor.x = lim - 3;
    if (g.dest && g.dest.x > lim - 2) g.dest = { x: lim - 3, z: g.dest.z };
    if (g.path && g.path.some((p) => (p[0] ?? p.x) > lim)) { g.path = null; if (g.order === 'path') { g.order = 'hold'; } }
    // 柵の外の敵へ駆け出す下知は、柵の内の守りに戻す（本人の組は本人について来るので触らない）
    if (!g.isPlayerSquad && g.order === 'attack') { g.order = 'hold'; g.focus = null; }
  }
  // 11/21 クラウド 設楽原の持ち主：act bot（0426）で丹羽の先手 二が柵のすぐ内 (13,-138) で、柵の外 (43,-138) の敵へ attack のまま
  //   柵に塞がれて七十秒止まり、一点に重なった（兵は lim を越えないので上の戻しが効かない）。柵の外を指す下知の組は、柵の内で構えて待つ
  if ((F._fkGT || 0) > rt.t) return;
  F._fkGT = rt.t + 1;
  for (const g of rt.army.groups) {
    if (g.team !== 0 || g.isPlayerSquad || g.civ || g.routed || !g.count || g.order !== 'attack' && g.order !== 'move') continue;
    const d = g.focus?.pos || g.dest;
    if (!d || d.x <= lim) continue;
    const c = g.center?.();
    if (!c || c.x < lim - 12) continue;
    g.order = 'hold'; g.focus = null; g.dest = null; g.path = null; g.onArrive = null;
    g.anchor = { x: lim - 3, z: c.z };
  }
}

// ---- ② 騎馬の波 ----
function nearGate(SB, z) { return SB.gates.some((gz) => Math.abs(z - (gz + 4.5)) < 11); }
function liveOf(g) { let n = 0; for (const u of g.units) if (u.alive && !u.gone && !u.fleeing) n++; return n; }
function riders(g) { return g.units.filter((u) => u.alive && !u.gone && u.mounted); }

function spawnWave(rt, K, ctx) {
  const { SB, enemyGroup, black } = ctx, P = rt.player.u.pos;
  let L = null;
  for (let i = 0; i < LEADERS.length; i++) {
    const c = LEADERS[(K.li + i) % LEADERS.length];
    if (K.waves.some((w) => w.lead === c.name && w.state !== 'gone') || rt.army.units.some((u) => u.alive && u.name === c.name)) continue;
    L = c; K.li = (K.li + i + 1) % LEADERS.length; break;
  }
  if (!L) return null;
  // 11/20 kaito「今は一箇所からしか来ない」：柵の全長（北〜南）に帯を切り、いま寄せている波と離れた帯から寄せる。本人の前の帯も必ず一つは使う
  let zc = P.z;
  const live = K.waves.filter((w) => w.state !== 'gone').map((w) => w.zc);
  const lo = SB.z0 + 50, hi = SB.z1 - 50;
  const near = (z) => live.some((q) => Math.abs(q - z) < 70);
  const needNear = !live.some((q) => Math.abs(q - P.z) < 45);   // 本人の前（四十五m 内）の帯は常に一つ使う：落馬を目の前で見られる
  for (let k = 0; k < 14; k++) {
    const z = needNear && k < 6 ? Math.max(lo, Math.min(hi, P.z + (Math.random() - 0.5) * 70)) : lo + Math.random() * (hi - lo);
    if (!nearGate(SB, z) && !near(z)) { zc = z; break; }
    if (k === 13) zc = z;
  }
  const home = { x: SB.x0 + HOME_DX, z: zc + (Math.random() - 0.5) * 30 };
  const make = () => enemyGroup(rt, { faction: L.fac, name: L.house + 'の騎馬衆', fixed: true, noGuard: true, anchor: { ...home }, facing: -Math.PI / 2,
    fleeDir: { x: 1, z: 0 }, aggro: 0, width: isTouch ? 40 : 64, spacing: 2.2, formation: 'line', morale: 100, speed: 8.5 },
  [{ type: 'busho', n: 1, o: { name: L.name, horse: true, flag: L.flag, invuln: true } },
    { type: 'cavalry', n: KIBA_N, o: { horseBattle: 'mounted', flag: L.flag, keep: true } }]);
  const g = L.fac === 'akazonae' ? make() : black(make);
  g.noFrontline = true; g.holdFire = true; g.noRout = true; g.seekRange = 0; g._kiba = true;
  for (const u of g.units) u.keepReal = true;
  const w = { g, lead: L.name, house: L.house, zc, home, state: 'charge', charges: 0, k: 0, n0: riders(g).length, at: rt.t, vt: 0 };
  charge(rt, K, w, SB);
  K.waves.push(w); K.n++;
  return w;
}

function charge(rt, K, w, SB) {
  const g = w.g;
  w.state = 'charge'; w.charges++; w.at = rt.t; w.k = 0; K.charges++;
  g.order = 'move'; g.dest = { x: SB.x0 + 3.5, z: w.zc + (Math.random() - 0.5) * 6 }; g.path = null; g.onArrive = null;
  g.speed = 10; g.formation = 'line';
  for (const u of g.units) if (u.alive && u.mounted) u.charging = true;
  try { const c = g.center(); rt.army.play('hooves', { x: c.x, y: 0, z: c.z }, 1.5); rt.army.play('eshout', { x: c.x, y: 0, z: c.z }, 1.2); } catch (e) { /* 音が無くても進む */ }
  if (w.charges === 1 && Math.abs(rt.player.u.pos.z - w.zc) < 90) rt.say('組頭', `${w.house}の騎馬が来るぞ！　引き付けて放て！`, 2.6);
}

function wheel(rt, w) {
  const g = w.g;
  w.state = 'back'; w.at = rt.t;
  g.order = 'move'; g.dest = { ...w.home }; g.path = null; g.speed = 9.5;
  for (const u of g.units) u.charging = false;
}

// 11/20 kaito「武田の騎馬を撃って落馬させ、R で乗ろうとしても乗れない」：討たれた騎馬の空馬は柵の外（東）を駆け去り、
//   本人は柵（壁）の内にいるので手綱が届かなかった。本人が柵のそば（百m 内）にいる時は、空馬が柵の口を抜けて本人の脇（三歩後ろ）へ
//   駆け込んで落ち着く（共通の空馬の仕組み＝army.looseHorses の tame・calm のまま。本人の手綱取り・R は共通のまま使う）。一頭ずつ
function bringHorse(rt, SB, u, n0) {
  const A = rt.army, LH = A.looseHorses, P = rt.player, pu = P?.u;
  if (!LH || LH.length <= n0 || !pu?.alive || P.mounted || P.mayRide === false || rt.flags.pursuit) return;
  const o = LH[LH.length - 1];
  if (!o || !o.h || Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z) > 3 || !o.from) return;
  if (Math.abs(pu.pos.z - u.pos.z) > 100) return;
  if (LH.some((q) => q !== o && q.tamedIn && q.h.parent && Math.hypot(q.h.position.x - pu.pos.x, q.h.position.z - pu.pos.z) < 12)) return;   // 本人の脇に空馬が居れば足さない
  const place = () => {
    if (!LH.includes(o) || o.kept || !pu.alive || P.mounted) return;
    // 本人と同じ高さで、壁を挟まず手綱の届く所（二〜五歩の輪）を探す。土手の斜面だと高さが合わず乗れない
    const W = rt.world, V = { x: 0, y: 0, z: 0 };
    let ok = false;
    for (let i = 0; i < 16 && !ok; i++) {
      const r = 2.2 + Math.floor(i / 8) * 1.4, an = pu.heading + Math.PI + ((i % 8) - 3.5) * 0.7;
      V.x = pu.pos.x + Math.sin(an) * r; V.z = pu.pos.z + Math.cos(an) * r; V.y = W.heightAt(V.x, V.z);
      if (W.walkable && W.walkable(V.x, V.z) === false) continue;
      if (Math.abs(V.y - pu.pos.y) > 0.5 || !P.horseReachable(V)) continue;
      ok = true;
    }
    if (!ok) { if ((o.tries = (o.tries || 0) + 1) < 4) rt.after(1.5, place); return; }
    o.h.position.set(V.x, V.y, V.z);
    o.h.rotation.y = o.heading = pu.heading;
    o.held = 45;   // 手綱を取られた馬のように、その場でこちらを向いて立つ（四十五秒）
    o.tame = o.calm = true; o.tamedIn = true; o.spd = 0; o.t = 2; o.shyT = -2; o.awayAt = Infinity;
    if (o.h.userData.horse) o.h.userData.horse.spook = 0;
    try { A.play('neigh', o.h.position, 0.6); } catch (e) { /* なし */ }
  };
  rt.after(2.2, place);
}

// 柵の内の鉄砲の一斉射。本人に近い騎馬から一〜三騎を落とす
function volley(rt, K, w, ctx) {
  const { SB } = ctx, F = rt.flags, P = rt.player.u.pos;
  const rs = riders(w.g).filter((u) => u.pos.x > SB.x0 + 2 && u.pos.x < SB.x0 + 55);
  if (!rs.length) return;
  K.volleys++;
  const z = w.zc;
  try { rt.army.play('volley', { x: SB.x0 + 1, y: 0, z }, 1.3); } catch (e) { /* なし */ }
  rt.after(0.14, () => { try { rt.army.play('volley', { x: SB.x0 + 1, y: 0, z: z + 8 }, 1.1); } catch (e) { /* なし */ } });   // 11/20：二つに割れた一斉射（ずぁーん・ずだーん）
  for (let k = -4; k <= 4; k++) {   // 11/20 kaito「一斉射の煙」：煙の帯を三十mへ広げる（5→9）
    const zz = z + k * 4;
    try { rt.army.smoke(SB.x0 + 1.5, rt.world.heightAt(SB.x0 + 1.5, zz) + 1.5, zz, 1, 0); } catch (e) { /* なし */ }
  }
  try { rt.world.gunSmoke?.(SB.x0 + 4, z); } catch (e) { /* なし */ }
  // 当てた事にする射手：一番近い柵の鉄砲衆（向きと手柄の元）
  let src = null, sd = 1e9;
  for (const q of [...(F.denseGuns || []), ...(F.guns || [])]) {
    if (Math.abs(q.anchor.z - z) > 40) continue;
    // 11/20 cloud-31（kaito_now③ 設楽原を天王寺の出来へ）：合図の音と煙だけで、柵の筒は合図と別の刻に一挺ずつ撃っていた。
    //   込め終えた筒は合図と一緒に放つ（筒先の火・煙・弾が一斉射の音と揃う）。柵の筒は holdFire（番の斉射を待つ）なので、一組二挺までに抑える
    try { rt.army.scriptSalvo?.(q, [w.g], 2, 75); } catch (e) { /* なし */ }
    for (const u of q.units) if (u.alive && !u.gone) { const d = Math.abs(u.pos.z - z); if (d < sd) { sd = d; src = u; } }
  }
  rs.sort((a, b) => Math.hypot(a.pos.x - P.x, a.pos.z - P.z) - Math.hypot(b.pos.x - P.x, b.pos.z - P.z));
  const cap = Math.ceil(w.n0 * 0.42);   // 一度の寄せで落ちるのは四割まで（残りは引き返してまた寄せる）
  const n = Math.min(rs.length, 1 + Math.floor(Math.random() * 3));
  for (let i = 0; i < n && w.k < cap; i++) {
    const u = rs[i];
    if (u.invuln) {
      // 率いる将は二度目の寄せから撃たれて落ちる（名のある将は落馬では討たれない・徒歩で引く）
      if (w.charges < 2 || u.pos.x > SB.x0 + 30) continue;
      w.k++;
      rt.after(0.2 + i * 0.15, () => { if (u.alive && u.mounted) { const n0 = rt.army.looseHorses?.length || 0; try { rt.army.pullOff(u, src, true); K.falls++; } catch (e) { /* なし */ } bringHorse(rt, SB, u, n0); } });
      continue;
    }
    w.k++;
    rt.after(0.18 + i * 0.17, () => {
      if (!u.alive || !u.mounted) return;
      K.falls++;
      // 四発に一発は馬に当たる：馬が崩れて乗り手が投げ出される。ほかは乗り手だけが撃たれ、空の馬が駆け去る
      if (Math.random() < 0.25 && u.horse) { try { rt.army.horseDamage(u, 999, src, 'gun'); return; } catch (e) { /* 下へ */ } }
      const LH = rt.army.looseHorses, n0 = LH ? LH.length : 0;
      try { rt.army.kill(u, src); } catch (e) { /* なし */ }
      bringHorse(rt, SB, u, n0);
    });
  }
}

export function kibaTick(rt, dt, ctx) {
  const F = rt.flags, { SB } = ctx;
  const K = F.kiba || (F.kiba = { waves: [], n: 0, charges: 0, volleys: 0, falls: 0, li: 0, nextAt: 0, tickAt: 0 });
  if ((K.tickAt -= dt) > 0) return;
  K.tickAt = 0.25;
  const P = rt.player.u;
  const on = !F.pursuit && !F.ending && !rt.over && P.alive && F.shWall?.on && (F.nf?.step ?? 0) >= 1;
  // 波の動き
  for (let i = K.waves.length - 1; i >= 0; i--) {
    const w = K.waves[i], g = w.g;
    const alive = g.units.filter((u) => u.alive && !u.gone);
    if (!alive.length) { K.waves.splice(i, 1); continue; }
    if (!on && w.state !== 'gone') { wheel(rt, w); w.state = 'gone'; }
    if (w.state === 'charge') {
      const front = Math.min(...alive.map((u) => u.pos.x));
      // 柵へ四十m 内に入ったら、二秒半ごとに一斉射
      if (front < SB.x0 + 45 && (w.vt -= 0.25) <= 0) { w.vt = 2.2 + Math.random() * 0.8; volley(rt, K, w, ctx); }
      if (front < SB.x0 + 6.5 || rt.t - w.at > 30) { wheel(rt, w); rt.after(0.5, () => { if (w.state === 'back') volley(rt, K, w, ctx); }); }
    } else if (w.state === 'back') {
      const c = g.center();
      if (c.x > w.home.x - 12 || rt.t - w.at > 30) {
        if (w.charges < 3 && on && riders(g).length >= 4) { w.state = 'rest'; w.at = rt.t; }
        else w.state = 'gone';
      }
    } else if (w.state === 'rest') {
      if (rt.t - w.at > 1.5) charge(rt, K, w, SB);   // 11/20：寄せの合間 4→1.5秒
    }
    if (w.state === 'gone') {
      // 段丘の奥へ帰り着いた者（本人から百m 余り）から消す。歩いて退く将も同じ
      g.order = 'move'; g.dest = { ...w.home };
      for (const u of alive) {
        if (u.pos.x > SB.x0 + HOME_DX - 15 || Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 130) { try { rt.army.despawn(u); } catch (e) { u.gone = true; } }
      }
    }
  }
  if (!on) return;
  // 一度に寄せる波は二つまで。前の波が寄せてから十四秒あけて次の波
  const active = K.waves.filter((w) => w.state !== 'gone').length;
  if (active < KIBA_WAVES && rt.t >= K.nextAt) {   // 11/19 kaito「騎馬隊を増やして」：同時の波 2→3・間 14→9秒
    if (spawnWave(rt, K, ctx)) K.nextAt = rt.t + 3;   // 11/20 kaito「間隔が長い」：9→3秒
    else K.nextAt = rt.t + 2;
  }
}

// ---- ②-2 佇む部隊を無くす（11/20 kaito「連吾川の辺りで何もせず佇んでいる部隊がいる・川を越えて柵を出て攻撃しろと言われても敵がもういない」）----
//   ・柵を攻める間（段1〜3）：連吾川の東で持ち場に立ち尽くす「遠くの備」を、二組ずつ順に柵の前（一の柵から二十五）まで押し出し、
//     二十五秒したら東へ戻す。柵の内の鉄砲が実際に撃つ（兵は柵の内へ入らない・fenceKeep は味方だけ縛る）
//   ・追い討ちの段（下知のあと）：持ち場に立ったままの武田の備（土屋・原・甘利ほか）を戦う備に直す。川を越えた本人の前に必ず敵が居る
const FAR_NAMES = /遠くの備|新手|土屋昌次の備/;
export function idleTick(rt, dt, ctx) {
  const F = rt.flags, { SB } = ctx, K = F.kiba;
  if (!K || rt.over || F.ending) return;
  if ((K.idleAt = (K.idleAt || 0) - dt) > 0) return;
  K.idleAt = 2;
  const A = rt.army, P = rt.player.u;
  if (F.pursuit) {
    for (const g of A.groups) {
      if (g.team !== 1 || !g.count || g.routed || g._kiba || g.order !== 'hold') continue;
      const c = g.center?.() || g.anchor; if (!c) continue;
      if (c.x > 300 || c.x < SB.x0 + 6) continue;   // 勝頼の本陣と、柵の内には触らない
      if (g.units.some((u) => u.name === '馬場信春')) continue;   // 殿は自分の段で動く
      if (g._idleFix || /勝頼|旗本|甘利|馬場/.test(g.name || '')) continue;
      g._idleFix = true;
      if (g.units.filter((u) => u.alive && !u.gone).length < 5) continue;
      g.noAI = false; g.stay = false; g.retreatOnly = false; g.fleeing = false; g.holdFire = false;
      g.aggro = Math.max(g.aggro || 0, 30); g.seekRange = 60; g.speed = Math.max(g.speed || 0, 3.2);
      g.order = 'attack'; g.focus = null;
    }
    return;
  }
  if (!((F.nf?.step ?? 0) >= 1) || !F.shWall?.on) return;
  const live = K.far || (K.far = []);
  for (let i = live.length - 1; i >= 0; i--) {
    const e = live[i];
    if (!e.g.count || rt.t - e.at > 25 || e.g.routed) {
      if (e.g.count && !e.g.routed) { e.g.order = 'move'; e.g.dest = { ...e.home }; e.g.speed = 3; e.g.path = null; e.g.onArrive = (q) => { q.order = 'hold'; }; }
      live.splice(i, 1);
    }
  }
  if (live.length >= 2 || rt.t < (K.farAt || 0)) return;
  K.farAt = rt.t + 14;
  const cand = A.groups.filter((g) => g.team === 1 && g.count > 8 && !g.routed && !g._kiba && FAR_NAMES.test(g.name || '') && g.order === 'hold' && !live.some((e) => e.g === g));
  if (!cand.length) return;
  // 本人に近い組を優先（本人の目の前で寄せる）
  cand.sort((a, b) => { const ca = a.center(), cb = b.center(); return Math.hypot(ca.x - P.pos.x, ca.z - P.pos.z) - Math.hypot(cb.x - P.pos.x, cb.z - P.pos.z); });
  const g = cand[Math.floor(Math.random() * Math.min(3, cand.length))], c = g.center();
  const home = { x: c.x, z: c.z };
  g.noAI = true; g.stay = false; g.holdFire = false; g.aggro = 4;
  g.order = 'move'; g.dest = { x: SB.x0 + 25, z: Math.max(SB.z0 + 30, Math.min(SB.z1 - 30, c.z)) }; g.speed = 3.4; g.path = null; g.formation = 'line';
  g.onArrive = (q) => { q.order = 'attack'; };
  live.push({ g, at: rt.t, home });
}

// ---- ③ 名のある味方の将を柵のすぐ後ろへ ----
//   布陣図の将（佐久間・滝川・羽柴・丹羽・柴田・榊原・家康・本多）を、三の柵（x0）のすぐ後ろ（x−10）に馬上で立たせる。
//   名入りの旗は陣立ての備（ALLIED_POSTS・REAR_POSTS を前へ寄せた所）が立てる。家康・羽柴・柴田は馬印も（金扇・瓢箪・金の御幣）。
//   開戦の支度の中で、共通の名のある武将の置き場（placeFamous）より先に作る（同じ将を二か所に置かない）
export const FRONT_LORDS = [
  { name: '佐久間信盛', z: -400, fac: 'oda', flag: 'sakuma' },
  { name: '滝川一益', z: -322, fac: 'oda', flag: 'takigawa' },
  { name: '羽柴秀吉', z: -246, fac: 'oda', flag: 'toyotomi', uma: 'fukube' },
  { name: '丹羽長秀', z: -168, fac: 'oda', flag: 'sujikai' },
  { name: '柴田勝家', z: -98, fac: 'oda', flag: 'oda', uma: 'shide' },
  { name: '榊原康政', z: 232, fac: 'tokugawa', flag: 'tokugawa' },
  { name: '徳川家康', z: 298, fac: 'tokugawa', flag: 'tokugawa', uma: 'ogi' },
  { name: '本多忠勝', z: 430, fac: 'tokugawa', flag: 'honda' },
];
export const FRONT_X = -10;
export const FRONT_REAL = FRONT_LORDS.length * 3;
export function frontLords(rt, ctx) {
  const F = rt.flags, { allyGroup, umajirushi } = ctx;
  F.frontLords = [];
  for (const L of FRONT_LORDS) {
    if (rt.army.units.some((u) => u.alive && u.name === L.name)) continue;
    const g = allyGroup(rt, { faction: L.fac, name: L.name + 'の旗本', fixed: true, fullStrength: true, noGuard: true, noRetinue: true, anchor: { x: FRONT_X, z: L.z }, facing: Math.PI / 2, width: 6, aggro: 4, seekRange: 5, formation: 'line', order: 'hold' },
      [{ type: 'busho', n: 1, o: { name: L.name, invuln: true, horse: true, flag: L.flag } }, { type: 'samurai', n: 2, o: { flag: L.flag } }]);
    g.noRetinue = true; g.stay = true; g.noRout = true; g._idleOk = true; g.historicalOrders = true;
    for (const u of g.units.slice(3)) { if (u.name) continue; try { rt.army.despawn(u); } catch (e) { u.gone = true; } }
    if (L.uma && umajirushi) { try { const m = umajirushi(rt.world, FRONT_X - 3, L.z - 2.5, Math.PI / 2, L.uma); rt.scene.add(m); } catch (e) { /* 馬印が無くても進む */ } }
    F.frontLords.push(g);
  }
}
