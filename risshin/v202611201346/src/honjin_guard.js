// 本陣の構え（P5・全戦共通。docs/specs/honjin_req_1118.md の 11〜19・33〜37／K390・K398・K402・K408）
//   両軍の大将と、本陣の名のある将（隊の名に 本陣・旗本・馬廻・近習・小姓 が付く将）の周りの兵を「本陣の守り」として束ね、
//   敵が近づいたら（ALERT_R）固まらせる：内の輪（円陣）が大将を四方から囲み、外の弧（槍衾）が敵の来る側に並んで受ける。
//   本人（遊び手）が大将へ寄ると、守りの者が総出で立ち塞がって斬りかかる。守りが残る間は、簡単に大将へ届かない。
//   敵が去って CALM_T 秒たてば、元の持ち場（隊の陣形）へ戻す。
//   重さ：兵は足さない（今いる本物の兵を動かすだけ）。遠い本陣（本人から REST_P より遠く、敵も近くにいない）は調べない＝休ませる。
//   兵の動き（持ち場へ歩く・寄った敵へ斬りかかる）は officer.js の officerThink の頭（u._hjLord）。
//   def.noHonjinGuard で戦ごとに止められる。本能寺（森蘭丸と小姓衆が上様に付く）・道場・町は触らない。
import { BATTLES } from './state.js';

const POOL_R = 26;     // 大将からこの内の守りの者を束ねる
const ALERT_R = 30;    // この内に敵が来たら構える
const CALM_T = 10;     // 敵が去って、この秒数で構えを解く
const REST_P = 170;    // 本人からこの外の本陣は、敵がいても調べない（遠い本陣は休ませる）
const POOL_MAX = 26;   // 束ねる数の上限
const IN_N = 10;       // 内の輪の数
const SMALL_MAX = 10;  // 本陣でない名のある将の円陣の数
const SMALL_R = 12;    // 本陣でない名のある将は、敵がこの内へ来た時だけ円陣を組む（前の備の斬り合いを止めない）
const SKIP = new Set(['honnoji']);
const HJ = /(本陣|旗本|馬廻|近習|小姓|使番)/;

// 本陣の将（大将・本陣の隊の将）は本陣の守りを総出で束ねる。ほかの名のある将（K398）は、供回りと自分の隊の侍・騎馬だけで間近の円陣を組む
const isHonjinLord = (u) => !!(u.isTaisho || u.oTaisho || HJ.test(u.group?.name || ''));
const isLordUnit = (u) => u.alive && !u.gone && !u.isPlayer && !u.isSub && !u.isTomo && !u.isStruct && !u.civ && u.name &&
  (u.type === 'busho' || u.isTaisho);

const canHold = (v, L) => v.alive && !v.gone && !v.fleeing && !v.woundOut && !v.rearWound && v !== L && !v.name && !v.isPlayer &&
  !v.isStandard && !v.stdHeld && !v.isUma && !v.civ && !v.isStruct && !v.perch && !v.climb &&
  v.type !== 'gun' && v.type !== 'bow' && v.type !== 'porter' && v.type !== 'dummy';

function inPool(v, H) {
  const g = v.group, L = H.u;
  if (!g || g.noAI || g.isPlayerSquad || g.isTomo || g.routed || g.civ || g.hidden || g.ambush || g.order === 'retreat' || g.order === 'flee') return false;
  if (v.officerGuard === L || g.taishoGuard === L) return true;
  if (!H.big) return g === L.group && (v.type === 'samurai' || v.type === 'cavalry');
  return g === L.group || g.guard || HJ.test(g.name || '');
}

function gather(rt, H) {
  const A = rt.army, L = H.u;
  H.pool.length = 0;
  A.forNear(L.pos.x, L.pos.z, POOL_R, (v) => {
    if (H.pool.length >= POOL_MAX * 2 || v.team !== L.team || !canHold(v, L) || !inPool(v, H)) return;
    if (v._hjLord && v._hjLord !== L && v._hjLord.alive) return;   // ほかの大将の守りに付いた者は取らない
    if (Math.abs((v.pos.y ?? 0) - (L.pos.y ?? 0)) > 3) return;
    H.pool.push(v);
  });
  H.pool.sort((a, b) => Math.hypot(a.pos.x - L.pos.x, a.pos.z - L.pos.z) - Math.hypot(b.pos.x - L.pos.x, b.pos.z - L.pos.z));
  const max = H.big ? POOL_MAX : SMALL_MAX;
  if (H.pool.length > max) H.pool.length = max;
}

// 内の輪（大将を四方から）と外の弧（敵の来る側に槍衾）の持ち場を配る。並びは今いる向きの順にして、すれ違わせない
function place(rt, H, foe) {
  const A = rt.army, L = H.u, n = H.pool.length;
  if (!n) return;
  const th = Math.atan2(foe.pos.x - L.pos.x, foe.pos.z - L.pos.z);
  const nIn = Math.min(n, IN_N), nOut = n - nIn;
  const rIn = L.mounted ? 3.6 : 3.0, rOut = rIn + 3.2;
  const spots = [];
  for (let i = 0; i < nIn; i++) spots.push(th + (i / nIn) * Math.PI * 2);
  // 外の弧は敵の側の ±75 度に並べる（二列目は半間ずらして後ろ）
  for (let i = 0; i < nOut; i++) {
    const row = i < 11 ? 0 : 1, k = row ? i - 11 : i, m = row ? nOut - 11 : Math.min(11, nOut);
    spots.push({ a: th + (m > 1 ? (k / (m - 1) - 0.5) : 0) * 2.6 + row * 0.12, r: rOut + row * 1.3 });
  }
  const ang = (v) => Math.atan2(v.pos.x - L.pos.x, v.pos.z - L.pos.z);
  const rel = (a) => { let d = a - th; while (d < -Math.PI) d += Math.PI * 2; while (d > Math.PI) d -= Math.PI * 2; return d; };
  // 敵に近い者を外の弧へ、残りを内の輪へ
  const byFoe = H.pool.slice().sort((a, b) => Math.hypot(a.pos.x - foe.pos.x, a.pos.z - foe.pos.z) - Math.hypot(b.pos.x - foe.pos.x, b.pos.z - foe.pos.z));
  const out = byFoe.slice(0, nOut).sort((a, b) => rel(ang(a)) - rel(ang(b)));
  const inn = byFoe.slice(nOut).sort((a, b) => rel(ang(a)) - rel(ang(b)));
  const inSpots = spots.slice(0, nIn).sort((a, b) => rel(a) - rel(b));
  // 大将が陣幕・塀の囲いの内なら、その口（囲いの外へ抜けられる向き）を探す。内の輪の者は口を通って中へ入る（K408：家久の幕の内が空で、旗本は幕の外に溜まっていた）
  const M = mouth(A, L, H);
  const set = (v, a, r, inner) => {
    const s = v._hjSpot || (v._hjSpot = { x: 0, z: 0 });
    let x = L.pos.x + Math.sin(a) * r, z = L.pos.z + Math.cos(a) * r;
    // 内の輪：幕・塀の向こうなら半分まで寄せ、それでも越えるなら大将のすぐ脇（囲いの内に立つ）。外の弧（槍衾）は囲いの外のまま
    if (inner && A.wallBetween(L.pos, -1, { x, z })) { x = L.pos.x + Math.sin(a) * r * 0.5; z = L.pos.z + Math.cos(a) * r * 0.5; }
    if (inner && A.wallBetween(L.pos, -1, { x, z })) { x = L.pos.x + Math.sin(a) * 1.4; z = L.pos.z + Math.cos(a) * 1.4; }
    s.x = x; s.z = z;
    v._hjMouth = inner && M ? M : null; v._hjInner = inner;
    if (v._hjLord !== L) { v._hjLord = L; v.aiT = 0; }
  };
  inn.forEach((v, i) => set(v, inSpots[i], rIn, true));
  out.forEach((v, i) => set(v, spots[nIn + i].a, spots[nIn + i].r, false));
}

// 囲いの口：大将から 16 の向きへ 9m の線を引き、幕・塀に当たらない向きを口とする（全部当たらなければ囲い無し＝null）。
//   口の内（大将から 1.5m）と外（9m）の二点を返す。大将が動かない間は覚えて使い回す
function mouth(A, L, H) {
  if (H.mouthAt && Math.hypot(H.mouthAt.x - L.pos.x, H.mouthAt.z - L.pos.z) < 1) return H.mouthV;
  H.mouthAt = { x: L.pos.x, z: L.pos.z };
  let open = -1, blocked = 0;
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, q = { x: L.pos.x + Math.sin(a) * 9, z: L.pos.z + Math.cos(a) * 9 };
    if (A.wallBetween(L.pos, -1, q)) blocked++; else if (open < 0) open = k;
  }
  if (blocked < 4 || open < 0) return (H.mouthV = null);
  // 開いた向きが続く所の真ん中を口にする
  let k0 = open, k1 = open;
  const free = (k) => { const a = ((k % 16) + 16) % 16 / 16 * Math.PI * 2; return !A.wallBetween(L.pos, -1, { x: L.pos.x + Math.sin(a) * 9, z: L.pos.z + Math.cos(a) * 9 }); };
  while (k0 > open - 15 && free(k0 - 1)) k0--;
  while (k1 < k0 + 15 && free(k1 + 1)) k1++;
  const a = (k0 + k1) / 2 / 16 * Math.PI * 2;
  return (H.mouthV = { ix: L.pos.x + Math.sin(a) * 1.5, iz: L.pos.z + Math.cos(a) * 1.5, ox: L.pos.x + Math.sin(a) * 9, oz: L.pos.z + Math.cos(a) * 9 });
}

function release(H) {
  for (const v of H.held) if (v._hjLord === H.u) { v._hjLord = null; v.aiT = 0; }
  H.held.length = 0;
}

// 近くの本陣でない備を二つまで、迫る敵へ向ける（予備の投入。十五秒に一度）
function callReserve(rt, H, foe) {
  if ((H.callT ?? -99) + 15 > rt.t) return;
  H.callT = rt.t;
  const A = rt.army, L = H.u, near = [];
  for (const g of A.groups) {
    if (g.team !== L.team || g === L.group || g.routed || g.isPlayerSquad || g.isTomo || g.civ || g.hidden || g.ambush || g.stay || g.fixed || g.noRescue ||
      g.order === 'retreat' || g.order === 'path' || g.order === 'move' || (g.count ?? 0) < 3 || (g.focus && g.focus.alive) || HJ.test(g.name || '') || g.taishoGuard) continue;
    const c = g.center(), d = Math.hypot(c.x - L.pos.x, c.z - L.pos.z);
    if (d < 70) near.push([d, g]);
  }
  near.sort((a, b) => a[0] - b[0]);
  for (const [, g] of near.slice(0, 2)) if (!g._retFocus) { g.focus = foe; g._retFocus = { u: foe, until: rt.t + 15 }; }
}

// 大将から r の内の一番近い敵（nearestEnemy は隊の『まわりに敵無し』の覚えで早く返すが、床几に据えた大将の隊（noAI）はその覚えが古いまま）
function nearFoe(A, L, r) {
  let best = null, bd = r * r;
  A.forNear(L.pos.x, L.pos.z, r, (o) => {
    if (!o.alive || o.team === L.team || o.fleeing || o.isStruct || o.civ || o.downed || o.type === 'dummy' || Math.abs((o.pos.y ?? 0) - (L.pos.y ?? 0)) > 4) return;
    const d = (o.pos.x - L.pos.x) ** 2 + (o.pos.z - L.pos.z) ** 2;
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}

export function honjinGuardTick(rt, dt) {
  const def = rt.def;
  if (!rt.army || !rt.player?.u || rt.over || def?.dojo || def?.town || def?.mapCastle || def?.noHonjinGuard || SKIP.has(BATTLES[rt.index]?.id)) return;
  const S = rt.honjinGuard || (rt.honjinGuard = { list: [], seen: new Set(), scanT: 0, t: 0 });
  if ((S.t -= dt) > 0) return;
  S.t = 0.5;
  const A = rt.army, P = rt.player.u;
  if (rt.t >= S.scanT) {
    S.scanT = rt.t + 3;
    for (const g of A.groups) for (const u of g.units) if (!S.seen.has(u) && isLordUnit(u)) { S.seen.add(u); S.list.push({ u, big: false, pool: [], held: [], until: -1, said: false }); }
  }
  for (const H of S.list) {
    const L = H.u;
    if (!L.alive || L.gone || L.fleeing || L.group?.routed) { if (H.held.length) release(H); continue; }
    // 遠い本陣は休ませる（調べない・動かさない）
    if (Math.hypot(L.pos.x - P.pos.x, L.pos.z - P.pos.z) > REST_P) { if (H.held.length && A.time > H.until) release(H); continue; }
    H.big = isHonjinLord(L);
    const foe = nearFoe(A, L, H.big ? ALERT_R : SMALL_R);
    if (foe) {
      H.until = A.time + CALM_T;
      L._hjAlert = H.until;
      gather(rt, H);
      if (H.pool.length < 3) { if (H.held.length) release(H); continue; }
      // 束ねから外れた者は元の隊の動きへ返す
      for (const v of H.held) if (v._hjLord === L && !H.pool.includes(v)) { v._hjLord = null; v.aiT = 0; }
      place(rt, H, foe);
      H.held.length = 0; for (const v of H.pool) H.held.push(v);
      if (H.big) callReserve(rt, H, foe);
      // 敵の大将の本陣へ本人が迫った時だけ、一度だけ声（K400：短く。字の札は出さない）
      if (!H.said && H.big && foe === P && L.team !== P.team) { H.said = true; rt.say(L.name, '旗本、前へ！　本陣を固めよ', 2.6); A.play?.('eshout', L.pos, 1.1); }
    } else if (H.held.length && A.time > H.until) release(H);
  }
}
