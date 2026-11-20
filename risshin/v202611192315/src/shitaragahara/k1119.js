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
export const KIBA_N = isTouch ? 10 : 14;
export const KIBA_REAL = 2 * (KIBA_N + 1);
// 率いる将（同じ名の将が場にいれば飛ばす）。広瀬・三科は山県の赤備えの侍大将、土屋昌恒は土屋昌次の弟（いずれも長篠に出た）
const LEADERS = [
  { name: '広瀬景房', fac: 'akazonae', flag: 'takeda_kiba', house: '山県' },
  { name: '武田信廉', fac: 'takeda', flag: 'takeda', house: '逍遥軒' },
  { name: '小幡信貞', fac: 'akazonae', flag: 'takeda_kiba', house: '小幡' },
  { name: '土屋昌恒', fac: 'takeda', flag: 'takeda', house: '土屋' },
  { name: '武田信豊', fac: 'takeda', flag: 'takeda', house: '典厩' },
  { name: '三科形幸', fac: 'akazonae', flag: 'takeda_kiba', house: '山県' },
];
const HOME_DX = 150;   // 段丘の奥（一の柵から百五十）で生まれ、そこへ帰って消える

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
    if (K.waves.some((w) => w.lead === c.name) || rt.army.units.some((u) => u.alive && u.name === c.name)) continue;
    L = c; K.li = (K.li + i + 1) % LEADERS.length; break;
  }
  if (!L) return null;
  // 本人の正面の柵の、口を外した所（左右へ十四〜二十六）。柵の端は避ける
  let zc = P.z;
  for (let k = 0; k < 8; k++) {
    const z = Math.max(SB.z0 + 30, Math.min(SB.z1 - 30, P.z + (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 12)));
    if (!nearGate(SB, z)) { zc = z; break; }
  }
  const home = { x: SB.x0 + HOME_DX, z: zc + (Math.random() - 0.5) * 30 };
  const make = () => enemyGroup(rt, { faction: L.fac, name: L.house + 'の騎馬衆', fixed: true, noGuard: true, anchor: { ...home }, facing: -Math.PI / 2,
    fleeDir: { x: 1, z: 0 }, aggro: 0, width: 18, spacing: 2.2, formation: 'line', morale: 100, speed: 8.5 },
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
  g.speed = 8.5; g.formation = 'line';
  for (const u of g.units) if (u.alive && u.mounted) u.charging = true;
  try { const c = g.center(); rt.army.play('hooves', { x: c.x, y: 0, z: c.z }, 1.5); rt.army.play('eshout', { x: c.x, y: 0, z: c.z }, 1.2); } catch (e) { /* 音が無くても進む */ }
  if (w.charges === 1 && Math.abs(rt.player.u.pos.z - w.zc) < 90) rt.say('組頭', `${w.house}の騎馬が来るぞ！　引き付けて放て！`, 2.6);
}

function wheel(rt, w) {
  const g = w.g;
  w.state = 'back'; w.at = rt.t;
  g.order = 'move'; g.dest = { ...w.home }; g.path = null; g.speed = 7;
  for (const u of g.units) u.charging = false;
}

// 柵の内の鉄砲の一斉射。本人に近い騎馬から一〜三騎を落とす
function volley(rt, K, w, ctx) {
  const { SB } = ctx, F = rt.flags, P = rt.player.u.pos;
  const rs = riders(w.g).filter((u) => u.pos.x > SB.x0 + 2 && u.pos.x < SB.x0 + 55);
  if (!rs.length) return;
  K.volleys++;
  const z = w.zc;
  try { rt.army.play('volley', { x: SB.x0 + 1, y: 0, z }, 1.3); } catch (e) { /* なし */ }
  for (let k = -2; k <= 2; k++) {
    const zz = z + k * 4;
    try { rt.army.smoke(SB.x0 + 1.5, rt.world.heightAt(SB.x0 + 1.5, zz) + 1.5, zz, 1, 0); } catch (e) { /* なし */ }
  }
  try { rt.world.gunSmoke?.(SB.x0 + 4, z); } catch (e) { /* なし */ }
  // 当てた事にする射手：一番近い柵の鉄砲衆（向きと手柄の元）
  let src = null, sd = 1e9;
  for (const q of [...(F.denseGuns || []), ...(F.guns || [])]) {
    if (Math.abs(q.anchor.z - z) > 40) continue;
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
      rt.after(0.2 + i * 0.15, () => { if (u.alive && u.mounted) { try { rt.army.pullOff(u, src, true); K.falls++; } catch (e) { /* なし */ } } });
      continue;
    }
    w.k++;
    rt.after(0.18 + i * 0.17, () => {
      if (!u.alive || !u.mounted) return;
      K.falls++;
      // 四発に一発は馬に当たる：馬が崩れて乗り手が投げ出される。ほかは乗り手だけが撃たれ、空の馬が駆け去る
      if (Math.random() < 0.25 && u.horse) { try { rt.army.horseDamage(u, 999, src, 'gun'); return; } catch (e) { /* 下へ */ } }
      try { rt.army.kill(u, src); } catch (e) { /* なし */ }
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
      if (rt.t - w.at > 4) charge(rt, K, w, SB);
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
  if (active < 2 && rt.t >= K.nextAt) {
    if (spawnWave(rt, K, ctx)) K.nextAt = rt.t + 14;
    else K.nextAt = rt.t + 5;
  }
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
