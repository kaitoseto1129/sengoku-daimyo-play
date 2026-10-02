// ======================================================================
// nawabari.js … 城と砦の「今の様子」の表（docs/battle-system-plan.md 束19・
// docs/castle-fort-system-spec.md 3・75・76・80〜84 章）
// 縄張り（castle_plan.js の C と plan）・区域（siege_zones.js の SZ）・門（siege_gate.js の makeGate）を受けて、
// 曲輪・門・ルート・守りの地点の数を一つの表 K にまとめる。0.5 秒ごとに数え直す（毎コマは何も作らない）。
// 門の様子が変わると C.setGateOpen を呼び、閉じた門（閉・閂）を通る道の網の辺を切る（76 章）。
// 画面の字は出さない（記録の言葉だけ日本語）。今の戦の動きは何も変えない（表を作って読むだけ）。
//
// 使い方（戦の定義から）：
//   import { makeNawabari } from './nawabari.js';
//   const K = F.K = makeNawabari(rt, C, { SZ: F.SZ, gates: { ote: [外の門, 内の門], gate_ni: 門, ... }, team: 1 });
//   // update の中で毎コマ
//   K.tick(dt);
//   K.kuruwa.san.captureState   // '敵支配'|'交戦中'|'味方支配'|'無人'（味方＝friendTeam の側から見て）
//   K.gates.ote.state            // '閉'|'閂'|'開'|'破れ'
//   K.routes                     // [{ id, pts, danger, width, slope, defense, distance }]
//   K.byPoint(x, z)              // その点の曲輪の id（無ければ null）
// gates の値は makeGate の戻り（枡形のように二つの門なら配列）か、struct（hp を持つ物）。
// 書かれていない門は「門の無い口」（いつも開）として扱う。
// ======================================================================
import { distToPolyline } from './world.js';

export const CAPTURE = { ENEMY: '敵支配', CONTESTED: '交戦中', FRIEND: '味方支配', EMPTY: '無人' };
export const GATE_STATE = { CLOSED: '閉', BARRED: '閂', OPEN: '開', BROKEN: '破れ' };
// 開いている順（大きいほど開いている。曲輪の gateState は入口の門のうち一番開いた物）
const OPENNESS = { 閂: 0, 閉: 1, 開: 2, 破れ: 3 };

const KIND_VALUE = { hon: 1, ni: 0.7, san: 0.5, koshi: 0.4, obi: 0.3, umadashi: 0.5 };
const GATE_FIRE = { kabuki: 0.2, yagura: 0.4, tetsu: 0.8 };
const DEF_MAXFLOW = 8;          // 門の既定の maxFlow（77 章）
const TICK = 0.5;               // 数え直す間（秒）
const ROUTE_TICK = 2;           // ルートの守りの数を数え直す間（秒）
const ROUTE_NEAR = 20;          // 道の何 m 内の守りを数えるか
const OCCUPY_R = 5;             // 門の何 m 内に攻め手がいれば occupied

function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a) / 2;
}
function bbox(poly) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { x0, x1, z0, z1 };
}
function pathLen(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return d;
}
// 道を step m ごとに区切った点（坂の最大を見る用）
function samplePath(pts, step) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  if (pts.length) out.push(pts[pts.length - 1]);
  return out;
}
const r2 = (v) => Math.round(v * 100) / 100;

// 門一つの今の様子：makeGate の戻り（opened・breached・struct・inner・innerR・guardTeam）か struct か無し
function gateNow(rt, list, guardTeam) {
  if (!list.length) return { state: GATE_STATE.OPEN, barred: false, hp: 1 };
  let allOpen = true, anyBroken = false, closedFirst = null, hp = 0, max = 0;
  for (const g of list) {
    const s = g.struct || g;
    const h = Math.max(0, s.hp ?? 0), m = s._nwMax || (s._nwMax = Math.max(1, s.maxHp && s.maxHp < 1e8 ? s.maxHp : (s.hp || 1)));
    hp += h; max += m;
    const broken = g.breached || (s.hp != null && s.hp <= 0) || s.alive === false;
    const open = broken || !!g.opened;
    if (broken) anyBroken = true;
    if (!open) { allOpen = false; if (!closedFirst) closedFirst = g; }
  }
  if (allOpen) return { state: anyBroken ? GATE_STATE.BROKEN : GATE_STATE.OPEN, barred: false, hp: hp / max };
  // 閉じている：内の門兵がいれば閂が掛かっている（守りが持っている）、いなければただ閉じているだけ
  let guards = 0;
  const g = closedFirst;
  if (g.inner && rt.army.forNear) {
    const gt = g.guardTeam ?? guardTeam;
    rt.army.forNear(g.inner.x, g.inner.z, g.innerR ?? 5, (u) => { if (u.alive && !u.isStruct && u.team === gt) guards++; });
  } else guards = 1;   // struct だけの門は、閉じていれば閂ありとみなす
  return { state: guards > 0 ? GATE_STATE.BARRED : GATE_STATE.CLOSED, barred: guards > 0, hp: hp / max };
}

// rt：戦の rt。C：buildCastlePlan の戻り。o = { SZ, gates, plan, team（守りの team、既定 1）, friendTeam（既定 SZ と同じ 0） }
export function makeNawabari(rt, C, o = {}) {
  const plan = o.plan || C.plan || {};
  const team = o.team ?? 1;                    // 守り
  const friendTeam = o.friendTeam ?? 0;        // 「味方」と呼ぶ側（siege_zones の friendTeam と同じ）
  const enemyTeam = team === friendTeam ? (o.enemyTeam ?? 1 - team) : team;
  const SZ = o.SZ || null;
  const gateIn = o.gates || {};
  const world = rt.world;

  const log = (ev, d) => {
    if (typeof rt.logEvent === 'function') rt.logEvent(ev, d);
    else { rt.flags = rt.flags || {}; (rt.flags.nawabariLog = rt.flags.nawabariLog || []).push({ t: r2(rt.t || 0), ev, ...d }); }
  };

  // ---- 門（82 章）：koguchi ごとに一つ ----
  const gates = {};
  const gateSrc = {};
  for (const g of plan.koguchi || []) {
    if (!g.id) continue;
    const src = gateIn[g.id];
    gateSrc[g.id] = src ? (Array.isArray(src) ? src : [src]) : [];
    const kindGate = Array.isArray(g.gate) ? g.gate[g.gate.length - 1] : g.gate;
    const w = g.w ?? Math.min(g.w1 ?? Infinity, g.w2 ?? Infinity);
    gates[g.id] = {
      id: g.id, name: g.name, type: g.kind || null, at: g.at ? { x: g.at[0], z: g.at[1] } : null,
      connects: [g.from || null, g.to || null],
      role: g.role || null,
      maxFlow: g.maxFlow ?? DEF_MAXFLOW,
      width: Number.isFinite(w) ? w : (g.maxFlow ? g.maxFlow * 0.75 : 4),
      fireResistance: g.fireResistance ?? GATE_FIRE[kindGate] ?? 0.1,
      sideFireZones: (g.sideFire || []).map(([x, z, dir, wid]) => ({ x, z, dir, w: wid })),
      durability: 1, state: GATE_STATE.OPEN, barred: false, occupied: false, defenders: 0,
    };
  }

  // ---- 曲輪（81 章） ----
  const kuruwa = {};
  const kList = [];
  for (const pk of plan.kuruwa || []) {
    const ck = C.kuruwa[pk.id];
    if (!ck) continue;
    const z = SZ && SZ.byId ? SZ.byId[pk.id] : null;
    const kind = pk.kind || (z && z.honmaru ? 'hon' : null);
    const K = {
      id: pk.id, name: pk.name, kind, height: ck.level,
      owner: team, captureState: CAPTURE.ENEMY,
      defenders: 0, attackers: 0, realDefenders: 0, realAttackers: 0, morale: 100,
      gateState: null,
      fallbackTo: pk.fallbackTo !== undefined ? pk.fallbackTo : (z ? z.next : null),
      capacity: pk.capacity ?? Math.max(10, Math.round(polyArea(pk.poly) / 16)),
      defenseValue: pk.defenseValue ?? Math.min(1, (KIND_VALUE[kind] ?? 0.5) + (pk.stone ? 0.2 : 0)),
      connectedGates: (plan.koguchi || []).filter((g) => g.id && (g.to === pk.id || g.from === pk.id)).map((g) => g.id),
      entryGates: (plan.koguchi || []).filter((g) => g.id && g.to === pk.id).map((g) => g.id),
      spawnPoints: pk.spawnPoints || [{ x: ck.centroid.x, z: ck.centroid.z }],
      _test: ck.test, _box: bbox(pk.poly), _zone: z,
      _sum: { d: 0, a: 0, rd: 0, ra: 0, m: 0, mn: 0 },
    };
    kuruwa[pk.id] = K;
    kList.push(K);
  }

  // ---- 守りの地点（84 章）：書いてあればそれ、無ければ門・櫓・曲輪から作る ----
  const defensePoints = (plan.defensePoints && plan.defensePoints.length)
    ? plan.defensePoints.map((d) => ({ ...d, position: d.position || (d.at ? { x: d.at[0], z: d.at[1] } : null) }))
    : [
      ...Object.values(gates).filter((g) => g.at).map((g) => ({
        type: 'gate', id: g.id, position: g.at, capacity: Math.max(4, g.maxFlow * 2), preferredUnit: 'spear',
        rangeBonus: 0, defenseBonus: 0.2, fallbackPoint: g.connects[1] ? (kuruwa[g.connects[1]]?.fallbackTo ?? null) : null,
      })),
      ...(plan.yagura || []).filter((y) => y.at).map((y) => ({
        type: 'tower', id: y.id, position: { x: y.at[0], z: y.at[1] }, capacity: y.kind === 'sumi' ? 8 : 4,
        preferredUnit: y.kind === 'sumi' ? 'gun' : 'bow', rangeBonus: 0.2, defenseBonus: 0.15, fallbackPoint: null,
      })),
      ...kList.map((k) => ({
        type: 'kuruwa', id: k.id, position: k.spawnPoints[0], capacity: k.capacity, preferredUnit: 'spear',
        rangeBonus: 0, defenseBonus: k.defenseValue * 0.2, fallbackPoint: k.fallbackTo,
      })),
    ];
  for (const d of defensePoints) if (d.position && !d.fallbackPoint && d.type !== 'kuruwa') {
    const kid = byPoint(d.position.x, d.position.z);
    if (kid) d.fallbackPoint = kuruwa[kid].fallbackTo;
  }

  // ---- ルート（38 章の五つの数）：形で決まる物（distance・width・slope・堀と横矢）は始めに一度だけ ----
  const towersAt = (plan.yagura || []).filter((y) => y.at && y.kind === 'sumi').map((y) => ({ x: y.at[0], z: y.at[1] }));
  const routes = (plan.paths || []).map((p, i) => {
    const pts = p.pts;
    const near = (x, z, r) => distToPolyline(x, z, pts) < r;
    // 狭い所の幅：道の 6m 内の口の幅（無ければ 6m の道）
    let width = Infinity;
    for (const g of Object.values(gates)) if (g.at && near(g.at.x, g.at.z, 6)) width = Math.min(width, g.width);
    if (!Number.isFinite(width)) width = 6;
    // 坂：道の上の勾配の最大（world があれば）
    let slope = 0;
    if (world && world.slopeTan) for (const [x, z] of samplePath(pts, 4)) slope = Math.max(slope, world.slopeTan(x, z));
    // 堀：堀の線のどこかが道の 6m 内にある数（渡るか、沿って登る）
    let hori = 0;
    for (const h of plan.hori || []) {
      const hp = h.pts || [];
      if (samplePath(hp, 3).some(([x, z]) => near(x, z, (h.w ?? 6) / 2 + 3))) hori++;
    }
    // 横矢：道の 20m 内の口の sideFire と隅櫓
    let side = 0;
    for (const g of Object.values(gates)) for (const s of g.sideFireZones) if (near(s.x, s.z, ROUTE_NEAR)) side++;
    for (const t of towersAt) if (near(t.x, t.z, ROUTE_NEAR)) side++;
    return {
      id: p.id || `path${i}`, kind: p.kind || null, pts,
      distance: r2(p.distance ?? pathLen(pts)),
      width: r2(p.width ?? width),
      slope: r2(p.slope ?? slope),
      defense: p.defense ?? 0,
      danger: p.danger ?? 0,
      hori, sideFire: side,
      _fixed: { defense: p.defense != null, danger: p.danger != null },
    };
  });

  // ---- 城壁の区画（束24・11章）：plan.walls（無ければ曲輪の塀を12mごとに切る） ----
  const WALL_SEG = 12;
  const WALL_HOLD = 10;
  const walls = {};
  const wallList = [];
  function addWallRec(id, kuruwaId, at, extra = {}) {
    const k = kuruwa[kuruwaId];
    const w = {
      id, kuruwa: kuruwaId || null, at,
      height: extra.height ?? 3, owner: team, attackersTop: 0, defendersTop: 0, heldT: 0,
      nearGate: extra.nearGate ?? (k && k.entryGates[0]) ?? null,
      climbable: !!extra.climbable, ladderAllowed: extra.ladderAllowed !== false,
    };
    walls[id] = w; wallList.push(w);
  }
  if (plan.walls && plan.walls.length) {
    for (const w of plan.walls) addWallRec(w.id, w.kuruwa, w.at ? { x: w.at[0], z: w.at[1] } : null, w);
  } else {
    for (const pk of plan.kuruwa || []) {
      const poly = pk.poly;
      if (!poly || poly.length < 2) continue;
      let n = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.max(1, Math.round(segLen / WALL_SEG));
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps, t1 = (s + 1) / steps, tm = (t0 + t1) / 2;
          addWallRec(`${pk.id}_w${n++}`, pk.id, { x: a[0] + (b[0] - a[0]) * tm, z: a[1] + (b[1] - a[1]) * tm },
            { height: pk.wallHeight, climbable: pk.climbable, ladderAllowed: pk.ladderAllowed });
        }
      }
    }
  }
  // 区画を取った攻め手の隊（梯子で登った隊）を、nearGate があればその門の内側（繋がる曲輪）へ向かわせる
  function sendInside(w) {
    if (!w.nearGate) return;
    const g = gates[w.nearGate];
    const innerId = g && (g.connects[1] || g.connects[0]);
    const destK = innerId && kuruwa[innerId];
    if (!destK) return;
    let best = null, bd = 30;
    for (const b of rt.butai || []) {
      if (b.team !== enemyTeam || !b.pos) continue;
      const d = Math.hypot(b.pos.x - w.at.x, b.pos.z - w.at.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (best && best.order) best.order({ id: 'move', to: destK.spawnPoints[0], form: 'line' });
  }
  function tickWalls(dt) {
    for (const w of wallList) {
      if (!w.at) continue;
      const topY = (world ? world.heightAt(w.at.x, w.at.z) : 0) + w.height;
      let a = 0, d2 = 0;
      if (rt.army && rt.army.forNear) {
        rt.army.forNear(w.at.x, w.at.z, WALL_SEG * 0.7, (u) => {
          if (!u.alive || u.isStruct) return;
          if (Math.abs((u.pos.y || 0) - topY) > 1.6) return;
          if (u.team === team) d2++; else a++;
        });
      }
      w.attackersTop = a; w.defendersTop = d2;
      if (a > d2 && a > 0) {
        if (w.owner === team) { w.heldT += dt; if (w.heldT >= WALL_HOLD) { w.owner = enemyTeam; w.heldT = 0; log('wallTaken', { id: w.id, from: team, to: enemyTeam }); sendInside(w); } }
      } else if (d2 >= a && w.owner !== team) {
        w.heldT -= dt * 2;
        if (w.heldT <= 0) { w.owner = team; w.heldT = 0; log('wallTaken', { id: w.id, from: enemyTeam, to: team }); }
      } else if (w.owner === team) {
        w.heldT = Math.max(0, w.heldT - dt);
      }
    }
  }

  function byPoint(x, z) {
    for (const k of kList) {
      const b = k._box;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      if (k._test(x, z)) return k.id;
    }
    return null;
  }

  // ---- 数え直し ----
  function countKuruwa() {
    for (const k of kList) { const s = k._sum; s.d = s.a = s.rd = s.ra = s.m = s.mn = 0; }
    const units = rt.army ? rt.army.units : [];
    // 本物の兵はその場で数え、備（butai）の名目の残り（軽い大軍）は備の居場所で数える
    for (const u of units) {
      if (!u.alive || u.isStruct) continue;
      const id = byPoint(u.pos.x, u.pos.z);
      if (!id) continue;
      const s = kuruwa[id]._sum;
      if (u.team === team) {
        s.rd++; s.d++;
        const m = Math.max(0, Math.min(100, u.group && u.group.morale != null ? u.group.morale : 100));
        s.m += m; s.mn++;
      } else { s.ra++; s.a++; }
    }
    for (const b of rt.butai || []) {
      const n = b.aliveNominal ? b.aliveNominal() : 0;
      if (n <= 0 || !b.pos) continue;
      const id = byPoint(b.pos.x, b.pos.z);
      if (!id) continue;
      const s = kuruwa[id]._sum;
      const light = Math.max(0, n - (b.realCount ? b.realCount() : 0));
      if (b.team === team) {
        s.d += light;
        if (light > 0) { s.m += Math.max(0, Math.min(100, b.morale ?? 100)) * Math.min(light, 20); s.mn += Math.min(light, 20); }
      } else s.a += light;
    }
    for (const k of kList) {
      const s = k._sum;
      k.defenders = Math.round(s.d); k.attackers = Math.round(s.a);
      k.realDefenders = s.rd; k.realAttackers = s.ra;
      k.morale = s.mn ? Math.round(s.m / s.mn) : 0;
    }
  }

  function captureOf(k) {
    const fN = team === friendTeam ? k.defenders : k.attackers;
    const eN = team === friendTeam ? k.attackers : k.defenders;
    if (fN <= 0 && eN <= 0) return CAPTURE.EMPTY;
    const z = k._zone;
    if (z) {
      if (z.state === 'contested') return CAPTURE.CONTESTED;
      const fighting = k.realAttackers > 0 && k.realDefenders > 0;
      if (z.state === 'friend') return fighting ? CAPTURE.CONTESTED : CAPTURE.FRIEND;
      if (z.state === 'enemy') return fighting ? CAPTURE.CONTESTED : CAPTURE.ENEMY;
    }
    // 区域が無い・空き：両方の本物がいれば交戦中、片方だけならその側
    if (fN > 0 && eN > 0) return (k.realAttackers > 0 && k.realDefenders > 0) ? CAPTURE.CONTESTED : (fN >= eN ? CAPTURE.FRIEND : CAPTURE.ENEMY);
    return fN > 0 ? CAPTURE.FRIEND : CAPTURE.ENEMY;
  }

  function tickGates(quiet) {
    for (const id in gates) {
      const G = gates[id];
      const now = gateNow(rt, gateSrc[id], team);
      G.durability = r2(now.hp);
      G.barred = now.barred;
      // occupied：門の 5m 内に攻め手（守りと違う team）がいる。defenders：同じ間合いの守り
      let foes = 0, own = 0;
      if (G.at && rt.army && rt.army.forNear) {
        rt.army.forNear(G.at.x, G.at.z, OCCUPY_R, (u) => {
          if (!u.alive || u.isStruct) return;
          if (u.team === team) own++; else foes++;
        });
      }
      G.occupied = foes > 0;
      G.defenders = own;
      if (now.state !== G.state) {
        const from = G.state;
        G.state = now.state;
        if (!quiet) {
        log('gateState', { id, from, to: now.state });
        if (now.state === GATE_STATE.OPEN && from === GATE_STATE.BARRED) {
          log('gateUnbarred', { id });
          if (rt.bark) rt.bark(`${G.name || id}の閂が外れた`);
        }
      }
      }
      // 道の網：閉じた門（閉・閂）を通る辺を切る（76 章）
      if (C.setGateOpen) C.setGateOpen(id, now.state === GATE_STATE.OPEN || now.state === GATE_STATE.BROKEN);
    }
    for (const k of kList) {
      let best = null;
      for (const gid of k.entryGates) {
        const s = gates[gid] && gates[gid].state;
        if (s && (best == null || OPENNESS[s] > OPENNESS[best])) best = s;
      }
      k.gateState = best;
    }
  }

  function tickRoutes() {
    const units = rt.army ? rt.army.units : [];
    for (const R of routes) {
      if (!R._fixed.defense) {
        let d = 0;
        for (const u of units) if (u.alive && !u.isStruct && u.team === team && distToPolyline(u.pos.x, u.pos.z, R.pts) < ROUTE_NEAR) d++;
        for (const b of rt.butai || []) {
          if (b.team !== team || !b.pos) continue;
          const light = Math.max(0, (b.aliveNominal ? b.aliveNominal() : 0) - (b.realCount ? b.realCount() : 0));
          if (light > 0 && distToPolyline(b.pos.x, b.pos.z, R.pts) < ROUTE_NEAR) d += light;
        }
        R.defense = Math.round(d);
      }
      if (!R._fixed.danger) {
        const dd = R.defense / (R.defense + 150);
        R.danger = r2(Math.min(1, 0.5 * dd + 0.25 * Math.min(1, R.sideFire / 3) + 0.25 * Math.min(1, R.hori / 3)));
      }
    }
  }

  // 初めの一度は記録しない（戦の始めは備の本物がまだ出ておらず、門兵の数がそろっていないため）
  let acc = TICK, racc = ROUTE_TICK, started = false;
  const K = {
    kuruwa, gates, routes, defensePoints, walls, team, friendTeam,
    byPoint,
    tick(dt) {
      acc += dt; racc += dt;
      if (acc < TICK) return;
      acc = 0;
      countKuruwa();
      tickGates(!started);
      if (started) tickWalls(TICK);
      for (const k of kList) {
        const to = captureOf(k);
        k.owner = to === CAPTURE.FRIEND ? friendTeam : to === CAPTURE.ENEMY ? enemyTeam : to === CAPTURE.EMPTY ? null : k.owner;
        if (to !== k.captureState) {
          const from = k.captureState;
          k.captureState = to;
          if (started) log('kuruwaState', { id: k.id, from, to });
        }
      }
      started = true;
      if (racc >= ROUTE_TICK) { racc = 0; tickRoutes(); }
    },
    // 記録・確かめ用：今の様子を一覧で
    stat() {
      const out = { kuruwa: {}, gates: {}, routes: [] };
      for (const k of kList) {
        out.kuruwa[k.id] = {
          captureState: k.captureState, owner: k.owner, defenders: k.defenders, attackers: k.attackers,
          morale: k.morale, gateState: k.gateState, fallbackTo: k.fallbackTo, capacity: k.capacity, kind: k.kind,
        };
      }
      for (const id in gates) {
        const g = gates[id];
        out.gates[id] = { state: g.state, durability: g.durability, barred: g.barred, occupied: g.occupied, maxFlow: g.maxFlow, role: g.role };
      }
      for (const R of routes) out.routes.push({ id: R.id, danger: R.danger, width: R.width, slope: R.slope, defense: R.defense, distance: R.distance });
      out.walls = {};
      for (const id in walls) { const w = walls[id]; out.walls[id] = { owner: w.owner, attackersTop: w.attackersTop, defendersTop: w.defendersTop, heldT: r2(w.heldT), nearGate: w.nearGate }; }
      return out;
    },
  };
  // 始めの姿：曲輪の数・門の様子・道の網を一度そろえる（記録は「変わった時」だけにするため、初めの状態は書かない）
  countKuruwa();
  tickGates(true);
  for (const k of kList) { k.captureState = captureOf(k); k.owner = k.captureState === CAPTURE.FRIEND ? friendTeam : k.captureState === CAPTURE.ENEMY ? enemyTeam : k.captureState === CAPTURE.EMPTY ? null : k.owner; }
  tickRoutes();
  if (rt.flags) rt.flags.nawabariLog = rt.flags.nawabariLog || [];
  return K;
}
