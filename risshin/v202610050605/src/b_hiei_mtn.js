import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
// ======================================================================
// 比叡山（元亀二年・1571 九月十二日）… docs/hiei-1571-spec.md（kaito 10/1）の第一〜第二段階（61章）
// 坂本（日吉社・里）→ 本坂（狭い山道・つづら折り・杉林・石段）→ 文殊楼 → 東塔（根本中堂・廻廊・中門・大講堂・僧坊の群れ）
// → 西塔（浄土院・にない堂・釈迦堂の前身）→ 横川（横川中堂）。筋書きは 46〜53章の P1〜P7（kaito 10/1：横川も掃討する区域に）。
//   ・横川（第三段階・26〜32章）は西塔から長い山道の先。西塔と同じく山道を掃討する。移動範囲はこの戦だけ moveLim で広げる
//   ・山麓から始める。根本中堂の前には出さない（46章）
//   ・全員を倒す戦にしない（mid6 49〜52章）：燃える山道を進む・手向かう者を退ける・次の区域への道を押さえる
//   ・城にしない（36〜39章）：天守・櫓・石垣・枡形・堀を置かない。守りは地形（急坂・狭い道・石段）と門と建物。
//     一時の逆茂木だけ少し（GAME_C）
//   ・人は僧兵だけにしない（54章）：僧兵・武装した神人や里の者・具足を着けた山の衆・逃げる僧・里の者・避難する人
//   ・火は建物ごと＋風向きで、一棟→一群→地区へ（temple1571.js）。鐘が鳴ると守りが警戒する（57章）
// 地形：terrain_hiei.js（国土地理院の標高。宇佐山の志賀の陣と同じ広域の切り出し）。建物と道：castles/hiei1571.js。
// ======================================================================
import * as THREE from 'three';
import { sakamogi, paintGeo } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { battleEvent, EVENT_FIRE_START } from './battle_events.js';
import { runnerBlocked } from './denrei.js';
import { enemyGroup, allyGroup, nm, unitPos } from './bhelp.js';
import { gone } from './b_inabayama.js';
import { Garan, makeTempleFire, ringBell } from './temple1571.js';
import { P, PATHS, BUILDINGS, pathById, pathPoint, height, onFlat } from './castles/hiei1571.js';

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 4;
// 姿：僧兵（裹頭・袈裟・薙刀）／武装した神人・里の者／武装した山の衆／織田
const SOHEI = { sohei: 1, armor: 0x2a2622, lace: 0xcfc7b4, cloth: 0xd8d2c2, hat: 'hachimaki', flag: null };
const LAY = { flag: null, hat: 'hachimaki', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x5a4a38, haori: null, mon: null };
const REM = { flag: null, armor: 0x3a3428, lace: 0x5a4a3a };
const ODA = { flag: 'oda' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const near = (u, p, r) => u && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < r;
// 道の一部（i0〜i1 の折れ点）を、隊の歩く道筋にする
const pts = (id, i0 = 0, i1) => pathById(id).pts.slice(i0, i1 === undefined ? undefined : i1 + 1).map(([x, z]) => [x, z]);
function walk(g, path, speed, onArrive) {
  if (!g || !g.count || g.routed) return;
  const oldHill = g._hillPath, oldIdx = g.pathIdx;
  if (g.order === 'path' && g.path) path = [...g.path.slice(g.pathIdx), ...path];
  // 後ろの列も曲がり角をたどる。直線の縦隊を回すと、後尾が里坊や急斜面へ振り出される。
  g._hillPath = [[g.anchor.x, g.anchor.z], ...path];
  g._hillFace = g._face ?? g.facing;
  if (!g._hillSlot) {
    g._hillSlot = g.slotPos;
    g._hillSlots = Array.from({ length: g.initial }, () => ({ x: 0, z: 0 }));
    g.slotPos = hillSlot;
  }
  for (const q of g._hillSlots) {
    // 段が変わっても、遅れた兵がまだ通っていない折れを残す。
    const join = q.join ? q.join.slice(q.joinI) : [];
    if (oldHill) join.push(...oldHill.slice(q.next, Math.min(oldIdx + 1, oldHill.length)));
    q.next = 1; q.join = join.length ? join : null; q.joinI = 0;
  }
  const leavesShrine = path.some(([x]) => x <= 138);
  for (const u of g.units) {
    const q = g._hillSlots[u.slot];
    q.unit = u;
    // 日吉社で戦って列を離れた兵は、参道を下って坂本の通りへ戻す。
    // 本坂の最初の点へ直行すると、里坊と参道脇の法面を横切ってしまう。
    // 本坂へ向かう道も最初は坂本の通り。最初の点だけで登山を判じない。
    if (leavesShrine && u.alive && u.pos.x > 128 && u.pos.x < 156 && u.pos.z < -3) {
      const road = pathById('hiyoshi').pts;
      let bi = 0, bd = Infinity;
      for (let i = 0; i < road.length; i++) {
        const d = Math.hypot(u.pos.x - road[i][0], u.pos.z - road[i][1]);
        if (d < bd) { bi = i; bd = d; }
      }
      // 古い折れが残る兵にも、参道へ戻る道を先に渡す。
      // 古い点へ直行すると、参道脇の法面を横切って止まる。
      q.join = [...road.slice(0, bi + 1).reverse(), [146, 4], ...(q.join || [])];
    }
  }
  g.order = 'path'; g.path = path; g.pathIdx = 0; g.speed = speed || 2.4; g.formation = 'column'; g.colW = 1;
  const [x, z] = path[path.length - 1];
  g.onArrive = onArrive || ((q) => { q.order = 'hold'; q.anchor = { x, z }; q.formation = 'column'; });
  if (g._command) walk(g._command, path, g.speed * 0.94);
}
function hillSlot(i, n) {
  if (!this._hillPath || this.formation !== 'column' || (this.order !== 'path' && this.order !== 'hold' && this.order !== 'attack')) return this._hillSlot(i, n);
  const q = this._hillSlots[i], cols = this.colW || 2;
  let back = Math.floor(i / cols) * this.spacing * 1.3;
  const side = (i % cols - (cols - 1) / 2) * this.spacing;
  let x = this.anchor.x, z = this.anchor.z;
  let fx = Math.sin(this._hillFace), fz = Math.cos(this._hillFace);
  let k = Math.min(this.pathIdx, this._hillPath.length - 1);
  for (; k >= 0; k--) {
    const p = this._hillPath[k], dx = x - p[0], dz = z - p[1], d = Math.hypot(dx, dz);
    if (d < 0.001) continue;
    fx = dx / d; fz = dz / d;
    if (back <= d) break;
    back -= d; x = p[0]; z = p[1];
    if (k === 0) { fx = Math.sin(this._hillFace); fz = Math.cos(this._hillFace); }
  }
  q.x = x - fx * back - fz * side;
  q.z = z - fz * back + fx * side;
  // 要が先へ進んでも、兵自身がまだ通っていない折れを飛ばさない。
  // 行き先だけを道上に置くと、遅れた兵はつづら折りの内側の急斜面を横切って詰まる。
  const u = q.unit;
  // 持ち場は1.6歩以内で到着扱いになる。曲がり角もその外側で次へ進める。
  while (u && q.join && q.joinI < q.join.length) {
    const p = q.join[q.joinI];
    if (Math.hypot(u.pos.x - p[0], u.pos.z - p[1]) < 1.8) q.joinI++;
    else { q.x = p[0]; q.z = p[1]; return q; }
  }
  while (u && q.next <= k) {
    const a = this._hillPath[q.next - 1], b = this._hillPath[q.next];
    const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1;
    const tx = b[0] - dz / d * side, tz = b[1] + dx / d * side;
    if (Math.hypot(u.pos.x - tx, u.pos.z - tz) < 1.8) q.next++;
    else { q.x = tx; q.z = tz; break; }
  }
  return q;
}
const attackFrom = (q, r = 16) => { q.order = 'attack'; q.seekRange = Math.min(r, 16); q.formation = 'column'; };
const arrived = (g, p, r) => {
  if (!g || gone(g) || Math.hypot(g.anchor.x - p.x, g.anchor.z - p.z) >= r) return false;
  let alive = 0, near = 0, front = 0;
  for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget) {
    alive++;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (d < r) front++;
    const q = g._hillSlots?.[u.slot];
    if (d < r + 12 && (!q || !q.join || q.joinI >= q.join.length)) near++;
  }
  g._hillNear = near; g._hillAlive = alive;
  return front >= Math.min(3, alive) && front > 0 && near >= Math.ceil(alive * 0.6);
};
const columnWait = (g, place) => `${place}で先手の列を待つ。近くまで来た兵 ${g._hillNear || 0}／${g._hillAlive || 0}`;
const guardedRoad = (rt, p) => {
  for (const g of rt.flags.foes) if (!gone(g)) for (const u of g.units) {
    if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 10) return false;
  }
  return true;
};

// 使番は隊の要へ直進せず、坂本の通りと本坂の折れを通って下知を届ける。
// 道と投影用の入れ物は使い回し、歩けるかの調べも三分の一秒ごとにする。
const RUNNER_ROAD = [...pts('sakamoto'), ...pts('honzaka', 1), ...pts('todo', 1, 3),
  [-24, -5], [-19, -9], ...pts('todo_n', 1), ...pts('saito', 1), ...pts('yokawa', 1)];
const RUNNER_SHRINE_E = [...pts('hiyoshi').reverse(), [158, 5], [170, 7], [184, 7]];
const RUNNER_SHRINE_W = [...pts('hiyoshi').reverse(), [146, 4], ...RUNNER_ROAD.slice(4)];
// 里坊の北へ押し出された兵は、家の裏を通って参道か東の通りへ戻る。
// 通りへの直線は里坊を横切り、既存の参道も二十歩の探索範囲から外れる。
const RUNNER_NORTH_E = [[143, -16], [148, -18], [168, -18], [184, -18], [184, 7], [170, 7], [158, 5]];
const RUNNER_NORTH_W = [[184, -18], [168, -18], [148, -18], [143, -16], ...pts('hiyoshi').slice(0, 2).reverse(), [146, 4], ...RUNNER_ROAD.slice(4)];
const RUNNER_FROM = { x: 0, z: 0, s: 0, d: 0 }, RUNNER_TO = { x: 0, z: 0, s: 0, d: 0 };
const RUNNER_TEST = { x: 0, z: 0 };
const RUNNER_RT = { world: null, army: null };
function runnerClear(army, u, a, b) {
  if (army.wallBetween(a, u.team, b, false)) return false;
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.2);
  RUNNER_RT.world = army.world; RUNNER_RT.army = army;
  for (let i = 1; i <= n; i++) if (runnerBlocked(RUNNER_RT, a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n)) return false;
  return true;
}
function runnerPoint(path, p, out, army, u) {
  out.d = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
    if (d >= out.d || army && d > 20) continue;
    if (army) { RUNNER_TEST.x = x; RUNNER_TEST.z = z; if (!runnerClear(army, u, p, RUNNER_TEST)) continue; }
    out.x = x; out.z = z; out.s = i - 1 + t; out.d = d;
  }
}
function hillRoad(from, to) {
  const north = from.x > 156 && from.z < -3 ? from : to.x > 156 && to.z < -3 ? to : null;
  if (north) {
    const other = north === from ? to : from;
    return other.x > 150 && other.z >= -3 ? RUNNER_NORTH_E : RUNNER_NORTH_W;
  }
  // 里坊の西へ追い出された兵も、参道を回って坂本の通りへ戻る。
  const shrine = from.x > 120 && from.z < -3 ? from : to.x > 120 && to.z < -3 ? to : null;
  const other = shrine === from ? to : from;
  return shrine ? other.x > 150 && other.z >= -3 ? RUNNER_SHRINE_E : RUNNER_SHRINE_W : RUNNER_ROAD;
}
// 横隊の持ち場が里坊や法面の中へ出た時は、歩ける参道へ寄せる。
function followSlot(i, n) {
  const want = this._followSlot(i, n), army = this._hieiArmy;
  if (this.order !== 'follow') return want;
  const q = this._followPoints[i];
  if (q.t > army.time) return q;
  q.t = army.time + 0.33; q.x = want.x; q.z = want.z;
  RUNNER_RT.world = army.world; RUNNER_RT.army = army;
  if (!runnerBlocked(RUNNER_RT, want.x, want.z)) return q;
  const u = this.units.find((o) => o.slot === i);
  if (!u) return q;
  runnerPoint(hillRoad(u.pos, want), want, RUNNER_TO);
  if (RUNNER_TO.d <= 20 && !runnerBlocked(RUNNER_RT, RUNNER_TO.x, RUNNER_TO.z)) {
    q.x = RUNNER_TO.x; q.z = RUNNER_TO.z;
  }
  return q;
}
function runnerWay(army, u, want) {
  // 先手も戦闘で列を離れる。持ち場への帰路は、使番と同じ参道を通す。
  if (!u.group?.isRunner && !u.isPlayer && !(u.group?._hillPath && !u.target) && !(u.group?.isPlayerSquad && u.group.order === 'follow' && !u.target)) return want;
  const q = u._hieiWay || (u._hieiWay = { x: 0, z: 0, t: -1, active: false });
  if (q.t > army.time && (!q.active || Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1)) return q.active ? q : want;
  q.t = army.time + 0.33; q.active = false;
  if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 14 && runnerClear(army, u, u.pos, want)) return want;
  const path = hillRoad(u.pos, want);
  runnerPoint(path, u.pos, RUNNER_FROM, army, u); runnerPoint(path, want, RUNNER_TO);
  if (!Number.isFinite(RUNNER_FROM.d) || RUNNER_TO.d > 20) return want;
  q.active = true;
  if (RUNNER_FROM.d > 1.2) { q.x = RUNNER_FROM.x; q.z = RUNNER_FROM.z; return q; }
  const forward = RUNNER_TO.s > RUNNER_FROM.s;
  let i = forward ? Math.floor(RUNNER_FROM.s) + 1 : Math.ceil(RUNNER_FROM.s) - 1;
  if (i >= 0 && i < path.length && Math.hypot(path[i][0] - u.pos.x, path[i][1] - u.pos.z) < 1.2) i += forward ? 1 : -1;
  if (i < 0 || i >= path.length || (forward ? i > RUNNER_TO.s : i < RUNNER_TO.s)) {
    q.x = RUNNER_TO.x; q.z = RUNNER_TO.z;
  } else { q.x = path[i][0]; q.z = path[i][1]; }
  if (!runnerClear(army, u, u.pos, q) && RUNNER_FROM.d > 0.2) { q.x = RUNNER_FROM.x; q.z = RUNNER_FROM.z; }
  return q;
}

const hiei_mtn = {
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  spawn: { x: P.spawn.x, z: P.spawn.z, heading: -Math.PI / 2 },
  world: {
    seed: 15710,
    moveLim: 250,           // この戦だけ：横川（z≈-228）まで歩けるよう移動範囲を広げる（ほかの戦は既定の176）
    time: 'day',
    mist: false,           // 当日の霧は不明。煙は建物の火から生じる。山の上は森と霞に隠れて見えない（P1）
    autumn: true,          // 旧暦九月
    wind: [-0.86, -0.4],   // 当日の風向は不明。復元の湖から山へ吹き上げる風（火は西・北西へ広がる）
    muddy: 0.15,
    terrainTags: true,     // 急斜面・石段・細道・森で速さと疲れが変わる（terrain_tags.js）
    climbTan: 1.4,         // 山の斜面は遅く疲れるが、道の外も登れる（崖ほどの所だけ登れない。法面や森に閉じ込めない）
    paths: PATHS.map((p) => p.pts),
    moveWay: runnerWay,
    runnerWay,
    treePadMul: 0.42,      // 細い山道は、杉が道の際まで迫る
    height,
    clear: onFlat,
    water: { x: 198, level: 0.4 },   // 琵琶湖（坂本の東）
    tint(x, z, h, c) {
      if (x > 128 && Math.abs(z) < 34) return;                        // 坂本の里と田畑
      if (x < -24 && x > -66 && z > -24 && z < 13) { c.lerp({ r: 0.56, g: 0.53, b: 0.46 }, 0.5); return; }   // 中庭の白い砂
      c.setRGB(c.r * 0.8, c.g * 0.88, c.b * 0.78);                    // 杉の山は暗く
    },
    trees: 1500,
    tufts: 2600,
    treeDensity: (x, z) => (x > 128 && Math.abs(z) < 40 ? 0.04 : x < -10 && x > -90 && z > -45 && z < 25 ? 0.3 : 1),
    sugiAt: (x, z) => (x > -12 && x < 118 && Math.abs(z) < 40 ? 0.9 : x < -10 ? 0.55 : 0.2),
    groves: [{ x: 60, z: -28, r: 16, n: 30 }, { x: 18, z: 18, r: 16, n: 30 }, { x: 100, z: 22, r: 14, n: 22 }, { x: -2, z: -40, r: 12, n: 18 }],
    // 逃げる僧兵と人々は、山の奥（西）や谷、横川より先の山中へ消える
    fleeOut: (x, z, team) => team === 1 && (x < -240 || Math.abs(z) > 245),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.civ = []; F.civByPlace = {}; F.foes = [];
    F.t0 = rt.t; F._gp = { x: P.spawn.x, z: P.spawn.z };

    // ---- 伽藍・坂本・本坂の建物（まとめて描く。史実の確度の札つき） ----
    const G = F.G = new Garan(rt);
    for (const b of BUILDINGS) G.build(b);
    F.valleyWays = PATHS.filter((p) => ['hannyadani', 'kogadani', 'kaishindani', 'gedatsudani', 'tosotsudani', 'iimurodani'].includes(p.id));
    for (const p of F.valleyWays) {
      const [x, z] = p.pts[p.pts.length - 1];
      G.build({ id: 'valley_' + p.id, name: p.name.replace('への道', 'の僧坊'), kind: 'sobo', x: x + 3, z, w: 4, d: 3, dist: 'far', lite: true, hist: 'HIST_B' });
      G.lantern(p.pts[0][0] + 1.5, p.pts[0][1], 'yokawa');
    }
    // 三塔の山道・各堂の入口にも石段。寺なので城の切岸・堀・石垣は足さない。
    for (const p of PATHS) G.stairs(p, pathPoint, { minG: .32, dist: p.id.startsWith('entry_') ? BUILDINGS.find((b) => 'entry_' + b.id === p.id).dist : p.id === 'todo' ? 'todo' : 'path' });
    // 坂本の東の田畑。区画・畦・色は当時の近江の里として推定し、湖の手前に留める。
    const fields = G.build({ id: 'sakamoto_fields', name: '坂本の田畑', kind: 'landscape', x: 0, z: 0, w: 1, d: 1, dist: 'far', lite: true, noBurn: true, hist: 'GAME_C' });
    for (const z of [-38, -28, 28, 38]) {
      const g = new THREE.PlaneGeometry(12, 7, 3, 2); g.rotateX(-Math.PI / 2); g.translate(184, 0, z);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, W.heightAt(pos.getX(i), pos.getZ(i)) - fields.y0 + .03);
      g.computeVertexNormals(); G.add(fields, 'plain', paintGeo(g, 0x8b8749));
      for (const offset of [-3.5, 0, 3.5]) {
        const ridge = new THREE.BoxGeometry(12, .12, .18); ridge.translate(184, W.heightAt(184, z + offset) - fields.y0 + .06, z + offset);
        G.add(fields, 'plain', paintGeo(ridge, 0x665c3b));
      }
    }
    for (const [x, z] of [[-6, -9.5], [-6, -2.5], [-23, -8.5], [-23, -1.5], [-34, -8.5], [-34, -1.5], [144, -2], [144, 8]]) G.lantern(x, z, x > 100 ? 'sakamoto' : 'todo');
    // 『耶蘇会士日本通信』所収のフロイスの焼き討ち報告：戦乱で僧坊が減り、谷々に残ったという。
    // 紹介：https://nihonsizatugaku.net/hieizan/
    // 旧跡との照合：https://www.jstage.jst.go.jp/article/aija/91/841/91_646/_pdf
    // 数と位置は確定できない。本道脇の礎石は、この戦より前の荒廃を表す推定の景色。
    const stone = new THREE.BoxGeometry(0.55, 0.24, 0.55);
    for (const [i, x, z] of [[0, 82, -9], [1, 68, -13], [2, 54, -10]]) {
      const rec = G.build({ id: 'old_sobo_' + i, kind: 'sobo_ato', x, z, w: 4, d: 3, dist: 'path', lite: true, noBurn: true, hist: 'HIST_B' });
      rec.top = 0.3;
      for (const dx of [-1.8, 0, 1.8]) for (const dz of [-1.2, 1.2]) {
        const g = stone.clone(); g.translate(dx, W.heightAt(x + dx, z + dz) - rec.y0 + 0.05, dz);
        G.add(rec, 'plain', paintGeo(g, 0x77746b));
      }
    }
    stone.dispose();
    G.finish();
    F.fire = makeTempleFire(rt, G, {
      onIgnite: (r) => {
        if (r.kind === 'chudo') F.chudoFire = true;
        battleEvent(rt, EVENT_FIRE_START, r, null, 1, r.kind === 'chudo', `${r.name}に火がかかった`);
      },
      onBurnt: (r) => { if (r.kind === 'shoro') rt.bark(`${r.name}が焼け落ちた`); },
    });
    // 一時の逆茂木（戦の時だけの物。GAME_C）：文殊楼の石段の上に二つ。真ん中は道
    for (const [x, z, r] of [[-10, -10.2, 0.25], [-10, -1.8, -0.25]]) rt.scene.add(sakamogi(W, x, z, r, 3.2));

    // ---- 織田勢：明智光秀の手（自分の持ち場）と鉄砲。坂本のまわりに大軍（軽い作り） ----
    // 坂本の通りに整列する。背後へ振り直すと民家の裏から道へ戻れなくなる。
    F.akechi = allyGroup(rt, { faction: 'oda', fixed: true, name: '明智の先手', anchor: { x: 158, z: 1 }, facing: -Math.PI / 2, width: 3, aggro: 9, formation: 'column', colW: 2 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }], ODA));
    F.command = allyGroup(rt, { faction: 'oda', fixed: true, fullStrength: true, noGuard: true, name: '明智光秀と供の衆', anchor: { x: 174, z: 6 }, facing: -Math.PI / 2, width: 2, formation: 'column', colW: 2, aggro: 4, seekRange: 8, guard: true, guardSight: 12, guardLeash: 3, noRing: true, noRout: true },
      dress([{ type: 'samurai', n: 2 }, { type: 'busho', n: 1, o: { name: '明智光秀', invuln: true, horse: false, hat: 'kabuto_w', haori: 0x3a3a52 } }, { type: 'samurai', n: 2 }], ODA));
    F.akeU = F.command.units.find((u) => u.name === '明智光秀');
    F.command.leader = F.akeU;
    F.akechi._command = F.command;
    F.teppo = allyGroup(rt, { faction: 'oda', fixed: true, name: '明智の鉄砲組', anchor: { x: 160, z: 9 }, facing: -Math.PI / 2, width: 3, aggro: 5, formation: 'line' }, dress([{ type: 'gun', n: 6 }], ODA));
    F.oda = [F.akechi, F.teppo, F.command];
    for (const g of F.oda) { g.defMult = 1; g.dmgMult = 1; }
    const n = RANKS[rt.G.rank].squad || 0;
    if (n) rt.makeSquad({ x: P.spawn.x - 3, z: P.spawn.z + 3 }, -Math.PI / 2, [{ kind: 'spear', n }]);
    const DA = (x, z, w, d, count, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing: -Math.PI / 2, armor: 0x2b3140, flagTex: flagTexture(flag), seed });
    [[176, -26, 'oda'], [178, 30, 'eiraku'], [184, 62, 'oda']].forEach(([x, z, f], i) => DA(x, z, 22, 10, 160, f, 1571 + i));

    // ---- P1 山麓：日吉社の鳥居の前の神人と僧兵、里坊の弓 ----
    F.hiyoshiG = this.foe(rt, { name: '日吉社の神人と僧兵', anchor: { x: 146, z: -7 }, facing: Math.PI / 2, width: 7, aggro: 12, morale: 75, fleeDir: { x: -1, z: -0.6 } },
      [...dress([{ type: 'ashigaru', n: 4 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'ashigaru', n: 3 }], LAY)]);
    F.satoboBow = this.foe(rt, { name: '里坊の僧兵（弓）', anchor: { x: 134, z: -5 }, facing: Math.PI / 2, width: 4, aggro: 10, morale: 60, fleeDir: { x: -1, z: -0.3 } }, dress([{ type: 'bow', n: 3 }], SOHEI));

    F.akechi2 = allyGroup(rt, { faction: 'oda', fixed: true, name: '煙に迷う明智の兵', anchor: { x: 180, z: 7 }, facing: -Math.PI / 2, width: 2, aggro: 10, formation: 'column', colW: 2, order: 'hold', seekRange: 12 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }], ODA));
    F.akechi2.defMult = 1; F.akechi2.dmgMult = 1;
    F.oda.push(F.akechi2);
    for (const g of F.oda) g.historicalOrders = true;
    this.preparePeople(rt);
    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '明智光秀の先手の一隊を預かり、坂本から山へ登れ' : '明智光秀のもとで、坂本から山へ登れ', 'main');
    rt.obj('civ', '刃向かわぬ者（僧・里の者）は討つな', 'side');
    rt.say('明智光秀', `${nm(rt)}、まず日吉社の前を抜け、本坂の登り口を押さえる`, 5);
    rt.say('明智光秀', '刃向かう者とは戦え。逃げる者、手向かわぬ者は追うな', 4.5);
    rt.marker('ake', unitPos(F.akeU), '明智光秀', {});
    rt.after(12, () => { if (rt.phase === 'brief') this.p1(rt); });
  },

  preparePeople(rt) {
    const F = rt.flags;
    // つづら折りの下の道に僧兵、上の折れに弓（上から射る）
    F.sw1 = this.foe(rt, { name: 'つづら折りの僧兵', anchor: { x: 83, z: 9 }, facing: Math.PI / 2, width: 4, aggro: 10, morale: 70, formation: 'yari', fleeDir: { x: -1, z: -0.4 } },
      [...dress([{ type: 'ashigaru', n: 4 }], SOHEI), ...dress([{ type: 'ashigaru', n: 1 }], LAY)]);
    F.sw1Bow = this.foe(rt, { name: '折れの上の僧兵（弓）', anchor: { x: 74, z: -13 }, facing: Math.PI / 2, width: 4, aggro: 12, morale: 60, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'bow', n: 3 }], SOHEI));
    // 中腹の小堂：僧兵・神人・具足を着けた山の衆の鉄砲が混じる
    F.midG = this.foe(rt, { name: '中腹の小堂の衆', anchor: { x: 42, z: -8 }, facing: Math.PI / 2, width: 6, aggro: 12, morale: 75, fleeDir: { x: -1, z: -0.2 } },
      [...dress([{ type: 'ashigaru', n: 3 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'ashigaru', n: 2 }], LAY), ...dress([{ type: 'gun', n: 1, o: { hat: 'jingasa' } }], REM)]);
    // 文殊楼の守り（石段の上）と、門の内の武装した山の衆。鐘が鳴ると集まる
    F.monjuG = this.foe(rt, { name: '文殊楼の僧兵', anchor: { x: -9, z: -6 }, facing: Math.PI / 2, width: 5, aggro: 8, morale: 85, formation: 'yari', fleeDir: { x: -1, z: 0.2 } },
      dress([{ type: 'ashigaru', n: 5 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI));
    F.monjuBow = this.foe(rt, { name: '文殊楼脇の弓', anchor: { x: -16, z: -11 }, facing: Math.PI / 2, width: 4, aggro: 12, morale: 70, fleeDir: { x: -1, z: -0.2 } }, dress([{ type: 'bow', n: 3 }], SOHEI));
    F.remG = this.foe(rt, { name: '武装した山の衆', anchor: { x: -22, z: -3 }, facing: Math.PI / 2, width: 4, aggro: 8, morale: 90, fleeDir: { x: -1, z: 0.3 } },
      dress([{ type: 'samurai', n: 3, o: { hat: 'kabuto' } }, { type: 'gun', n: 1, o: { hat: 'jingasa' } }], REM));
    F.mudojiG = this.foe(rt, { name: '無動寺谷の伏兵', anchor: { x: 46, z: 20 }, facing: -Math.PI / 2, width: 4, aggro: 14, morale: 70, fleeDir: { x: 0.2, z: 1 } }, dress([{ type: 'ashigaru', n: 4 }, { type: 'bow', n: 2 }], SOHEI));
    // 東塔の中の守り（先に置いておく。鐘で集まった衆）
    F.chudoG = this.foe(rt, { name: '根本中堂の前の僧兵', formation: 'yari', anchor: { x: -40, z: -7 }, facing: Math.PI / 2, width: 6, aggro: 12, morale: 95, fleeDir: { x: -1, z: -0.4 } },
      dress([{ type: 'samurai', n: 1, o: { weapon: 'spear' } }, { type: 'ashigaru', n: 6 }], SOHEI));
    F.courtBow = this.foe(rt, { name: '廻廊の弓', anchor: { x: -36, z: -10 }, facing: Math.PI / 2, width: 4, aggro: 12, morale: 70, fleeDir: { x: -1, z: -0.4 } }, dress([{ type: 'bow', n: 3 }], SOHEI));
    F.kodoG = this.foe(rt, { name: '大講堂の僧兵', anchor: { x: -46, z: -27 }, facing: Math.PI / 2, width: 6, aggro: 10, morale: 85, fleeDir: { x: -1, z: -0.6 } },
      [...dress([{ type: 'ashigaru', n: 4 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'ashigaru', n: 2 }], LAY)]);
    F.saitoG = this.foe(rt, { name: '西塔からの加勢', anchor: { x: -100, z: -31 }, facing: Math.PI / 2, width: 4, aggro: 12, morale: 85, fleeDir: { x: -1, z: -0.3 } },
      [...dress([{ type: 'ashigaru', n: 4 }], SOHEI), ...dress([{ type: 'samurai', n: 2, o: { hat: 'kabuto' } }], REM)]);
    // にない堂（常行堂・法華堂）周辺の森の伏せ。東塔より道が狭く、森が深い（25章）
    F.ninaidoG = this.foe(rt, { name: 'にない堂の僧兵', formation: 'yari', anchor: { x: -110, z: -44 }, facing: Math.PI / 2, width: 4, aggro: 11, morale: 78, fleeDir: { x: -1, z: -0.3 } },
      [...dress([{ type: 'ashigaru', n: 4 }], SOHEI), ...dress([{ type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI)]);
    // 釈迦堂の守り（西塔の中心）
    F.shakadoG = this.foe(rt, { name: '西塔・釈迦堂の僧兵', anchor: { x: -124, z: -44 }, facing: Math.PI / 2, width: 5, aggro: 12, morale: 92, formation: 'yari', fleeDir: { x: -1, z: -0.4 } },
      [...dress([{ type: 'ashigaru', n: 5 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'gun', n: 1, o: { hat: 'jingasa' } }], REM)]);
    F.saitoBow2 = this.foe(rt, { name: '西塔の弓', anchor: { x: -125, z: -52 }, facing: Math.PI / 2, width: 3, aggro: 11, morale: 65, fleeDir: { x: -1, z: -0.3 } }, dress([{ type: 'bow', n: 2 }], SOHEI));
    F.yokawaG = this.foe(rt, { name: '横川中堂の僧兵', anchor: { x: -94, z: -215 }, facing: 0, width: 5, aggro: 12, morale: 90, formation: 'yari', fleeDir: { x: 0, z: -1 } },
      [...dress([{ type: 'ashigaru', n: 5 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'bow', n: 2 }], SOHEI)]);
    for (const [x, z] of [[12, -19], [16, 4]]) {
      const g = this.foe(rt, { name: '杉林の僧兵', anchor: { x, z }, facing: Math.PI / 2, order: 'hold', ambush: true, seekRange: 16, width: 3, aggro: 12, morale: 70, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'ashigaru', n: 3 }], SOHEI));
      F.ambG = (F.ambG || []).concat(g);
    }
    F.preparing = true;
    this.civ(rt, 150, 14, 5, '逃げる里の者', { x: 0.25, z: 1 });
    this.civ(rt, 151, -13, 3, '逃げる僧', { x: -1, z: -0.5 });
    this.civ(rt, 30, 8, 6, '逃げる僧', { x: 0.2, z: 1 });
    this.civ(rt, 38, -14, 6, '山へ逃れていた里の者', { x: 0.3, z: 1 });
    this.civ(rt, -44, -8, 7, '逃げる僧', { x: -1, z: 0.25 });
    this.civ(rt, -52, -25, 7, '大講堂に逃れていた人々', { x: -0.4, z: -1 });
    this.civ(rt, -30, 18, 6, '南谷の僧', { x: -0.3, z: 1 });
    this.civ(rt, -118, -56, 7, '西塔の僧坊に逃れていた人々', { x: -1, z: -0.4 });
    this.civ(rt, -130, -32, 6, '逃げる僧', { x: -1, z: -0.4 });
    this.civ(rt, -116, -242, 7, '横川の僧坊に逃れていた人々', { x: 0, z: -1 });
    this.civ(rt, -96, -207, 5, '逃げる僧', { x: 0, z: -1 });
    F.preparing = false;
  },

  foe(rt, o, list) {
    // 山道と堂の前に置く守りは、カメラの背後へ振り直さない。
    // 振り直すと坂本では湖際、東塔では根本中堂の当たりの中に出てしまう。
    const g = enemyGroup(rt, { faction: 'saito', order: 'hold', dmgMult: 1, seekRange: 16, formation: list.every((q) => q.type === 'bow' || q.type === 'gun') ? 'line' : 'column', colW: 2, ...o, fixed: true }, list);
    rt.flags.foes.push(g);
    return g;
  },
  // 逃げる僧・里の者・避難する人（戦わない。誰にも狙われない。自分で討てば下知違反）
  civ(rt, x, z, n2, name, dir) {
    const F = rt.flags;
    const key = x + ':' + z;
    if (!F.preparing) {
      const c = F.civByPlace[key];
      c.routed = true; c.order = 'flee';
      for (const u of c.units) u.fleeing = true;
      return c;
    }
    const monk = name.includes('僧');
    const c = enemyGroup(rt, { faction: 'imagawa', name, anchor: { x, z }, fixed: true, facing: Math.atan2(dir.x, dir.z), width: 4, aggro: 0, morale: 100, noRout: true, fleeDir: dir, speed: 2.5 },
      [{ type: 'porter', n: n2, o: monk ? { sohei: 0, flag: null, hat: 'none', armor: 0x1e1c1a, lace: 0x2a2826, cloth: 0x24221f, haori: null, mon: null } : { flag: null, hat: 'none', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null } }]);
    for (const u of c.units) { u.noTarget = true; u.dmg = 0; }
    F.civByPlace[key] = c;
    c.civ = true;
    F.civ.push(c);
    return c;
  },

  // ===== P1 山麓：坂本の里に火がかかる。日吉社の前を抜け、本坂の登り口へ =====
  p1(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t; F.smokeCall = false; F.t1 = rt.t;
    rt.setPhase('climb');
    sfx('horagai', 0.85);
    rt.unmark('ake');
    rt.obj('main', '日吉社の鳥居の前の僧兵を退け、本坂の登り口へ', 'main');
    rt.marker('hiyoshi', { x: 148, z: -4 }, '日吉社の鳥居', { red: true });
    walk(F.akechi, [[150, 4], [147, 2]], 2.6, (q) => attackFrom(q, 26));
    walk(F.teppo, [[154, 8], [152, 7]], 2.4);
    this.civ(rt, 150, 14, 5, '逃げる里の者', { x: 0.25, z: 1 });
    this.civ(rt, 151, -13, 3, '逃げる僧', { x: -1, z: -0.5 });
    rt.after(8, () => { if (F.fire.ignite('minka_5')) rt.bark('坂本の家に火がかかった'); });
    rt.after(30, () => { if (F.fire.ignite('hiyoshi_honden')) rt.say('足軽', '……日吉の社にまで火を', 3); });
    rt.after(3, () => rt.bark('手向かわずに逃げる僧や里の者は追うな。討てば下知に背くぞ'));
  },

  // ===== P2 登山：狭い山道・つづら折り・杉林。小さな抵抗。鐘・叫び・前の煙 =====
  p2(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t; F.smokeCall = false;
    rt.unmark('hiyoshi');
    rt.banner('本坂', '狭い山道を登る。上から射られるぞ');
    rt.obj('main', '煙の上がる本坂を、手向かう者を退けながら登れ', 'main');
    rt.marker('stairs', () => F._gp || P.stairsFoot, '本坂（道なりに文殊楼へ）', { h: 3 });
    walk(F.akechi, [[146, 4], [134, 3], ...pts('honzaka', 0, 19)], 2.5, (q) => { q.order = 'hold'; q.aggro = 12; });
    walk(F.akechi2, [[170, 7], [158, 5], [146, 4], [134, 3], ...pts('honzaka')], 2.4);
    walk(F.teppo, [[138, 4], ...pts('honzaka', 0, 12)], 2.4);
    // 無動寺谷への分かれ道（別ルート・退き道・伏兵の谷）：本道を外れて谷へ下りれば、僧兵の伏兵が待つ
    rt.marker('mudoji', P.branch, '谷への分かれ道・任務は本道', { h: 2 });
    rt.after(14, () => rt.say('明智光秀', '無動寺の谷道は退き口にもなる。伏兵に気をつけよ', 4));
    this.civ(rt, 30, 8, 6, '逃げる僧', { x: 0.2, z: 1 });
    this.civ(rt, 38, -14, 6, '山へ逃れていた里の者', { x: 0.3, z: 1 });
    rt.say('明智光秀', '細道じゃ。一人ずつ、前を詰めて登れ', 4);
  },

  // 中腹の平場に着いた：東塔の鐘が鳴り、前に煙が上がる（東谷に火が上がる）
  bellTodo(rt) {
    const F = rt.flags;
    if (F.bell1) return;
    F.bell1 = true;
    ringBell(rt, F.G.byId.todo_shoro);
    rt.banner('東塔の鐘が鳴る', '山の上の僧兵が集まってくる');
    rt.army.play('eshout', { x: -10, z: -6 }, 1.2);
    for (const g of [F.monjuG, F.monjuBow, F.remG]) if (g) { g.aggro = 13; g.morale = Math.min(100, g.morale + 10); }
    rt.after(6, () => {
      const r = F.G.recs.find((q) => q.cl === 'higashidani' && q.state === 0 && q.kind === 'sobo');
      if (r && F.fire.ignite(r)) rt.say('足軽', '上に煙が……東の谷で火が上がったぞ', 3.5);
    });
  },

  // 杉林の伏せ：狭い道の両側の木の間から
  ambush(rt) {
    const F = rt.flags;
    if (F.amb) return;
    F.amb = true;
    for (const g of F.ambG) if (!gone(g)) attackFrom(g, 16);
    rt.army.play('eshout', { x: 12, z: -8 }, 1.4);
    rt.bark('杉林から僧兵が！', true);
  },

  // ===== P3 文殊楼：石段の上の楼門。ここで初めて東塔の大伽藍が見える =====
  p3(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    rt.unmark('mudoji');
    F.step = 3; F.stepT = rt.t; F.smokeCall = false;
    rt.unmark('stairs');
    this.bellTodo(rt);
    rt.banner('文殊楼', '石段の上の楼門。東塔の入口');
    rt.obj('main', '文殊楼を抜け、燃える堂の間の山道へ進め', 'main');
    rt.marker('monju', P.monjuro, '文殊楼・門を抜ける', { h: 3 });
    walk(F.akechi, pts('honzaka', 19, 22), 2.5, (q) => attackFrom(q, 30));
    walk(F.teppo, [...pts('honzaka', 12, 18)], 2.4, (q) => { q.order = 'hold'; q.anchor = { x: 6, z: -10 }; });
    rt.after(6, () => { if (!F.ending) F.fire.ignite('konponchudo_1571'); });
    rt.army.play('eshout', P.monjuro, 1.5);
    rt.say('僧兵', '仏敵じゃ！　この御山に一歩も入れるな！', 3);
  },

  // ===== P4 根本中堂の周り：燃える堂の間を掃討。逃げ惑う人々と煙に混乱する味方 =====
  p4(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t; F.smokeCall = false;
    rt.unmark('monju');
    rt.banner('東塔へ入る', '根本中堂の火。堂の間を逃げる人々');
    rt.obj('main', '燃える根本中堂の前を抜け、山道を西塔へ掃討せよ', 'main');
    rt.objProgress('main', '根本中堂の前へ');
    rt.marker('court', () => F._gp, () => F.courtDone ? '西塔への山道' : '根本中堂', { h: 3 });
    walk(F.akechi, pts('todo', 0, 3), 2.5, (q) => attackFrom(q, 30));
    walk(F.teppo, pts('honzaka', 18, 22), 2.4, (q) => { q.order = 'hold'; q.anchor = { x: -18, z: -8 }; });
    // 煙で道を見失った味方。救い出しの任務にはしない
    walk(F.akechi2, [...pts('todo', 0, 1), [-19, -9], ...pts('todo_n', 1, 2)], 2.3);
    F.lostT = rt.t + 8; F.lostN = 0;
    rt.say('明智光秀', '堂が燃えておる。手向かう者だけを退け、山道を先へ進め。逃げる者は追うな', 4.5);
    rt.after(8, () => { if (!F.ending) F.fire.ignite('daikodo_old'); });
    this.civ(rt, -44, -8, 7, '逃げる僧', { x: -1, z: 0.25 });
    this.civ(rt, -52, -25, 7, '大講堂に逃れていた人々', { x: -0.4, z: -1 });
    this.civ(rt, -30, 18, 6, '南谷の僧', { x: -0.3, z: 1 });
    // 火が地区へ広がりはじめる：南谷と西谷の僧坊
    rt.after(10, () => { const r = F.G.recs.find((q) => q.cl === 'minamidani' && q.state === 0); if (r) F.fire.ignite(r); });
    if (hi(rt) && F.akechi2 && !gone(F.akechi2)) rt.choose('後ろの別手をどこへ回す？（細かな動きは推定）', [
      { label: '本道の列を支える', note: '本人は先手と本道を掃討する' },
      { label: '南谷の道を押さえる', note: '既存の別手だけを回す。逃げる人は追わない' },
    ], (i) => {
      if (F.ending || F.step !== 4 || i !== 1 || gone(F.akechi2)) return;
      F.valleyOrder = true;
      walk(F.akechi2, [[-19, -9], [-18, -1], ...pts('todo_s', 1)], 2.2);
      rt.say('明智光秀', '別手は南谷の口を押さえよ。本人の組は本道へ続け。逃げる者は追うな', 4);
    }, 12);
    rt.after(24, () => { const r = F.G.recs.find((q) => q.cl === 'nishidani' && q.state === 0); if (r) F.fire.ignite(r); });
  },

  // 西塔の鐘：別の地区が警戒し、西塔から加勢が来る（P5 の入口）
  bellSaito(rt) {
    const F = rt.flags;
    if (F.bell2) return;
    F.bell2 = true; F.westT = rt.t;
    walk(F.akechi, [[-30, -5], [-24, -5], [-19, -9], ...pts('todo_n', 1), ...pts('saito', 1, 4)], 2.3);
    walk(F.teppo, [[-19, -9], ...pts('todo_n', 1), ...pts('saito', 1, 4)], 2.2);
    ringBell(rt, F.G.byId.saito_shoro, { rapid: true });
    rt.banner('西塔の鐘が鳴る', '西の山道から加勢が来る');
    rt.unmark('court');
    rt.obj('main', '燃える東塔を抜け、西塔へ続く山道を掃討せよ', 'main');
    rt.marker('west', () => F._gp || P.westGate, '西塔への山道', { h: 3 });
    walk(F.saitoG, [[-96, -30], [-86, -27], [-76, -21]], 2.6, (q) => attackFrom(q, 28));
    rt.say('明智光秀', '西塔の鐘か。煙の中で味方が乱れておる。組を離すな、山道を先へ押し上げよ', 4.5);
  },

  // ===== P6 西塔：浄土院を抜け、にない堂の森を経て釈迦堂へ。密林・建物間の狭い戦い（19〜25章） =====
  p6(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5; F.stepT = rt.t; F.smokeCall = false;
    rt.unmark('west');
    rt.banner('西塔へ', '浄土院を過ぎ、森の深い谷間へ入る');
    rt.obj('main', '浄土院を荒らさず抜け、燃える西塔の山道を掃討せよ', 'main');
    rt.marker('west', () => F._gp, '西塔の山道', { h: 3 });
    F.jodoinShown = false;
    walk(F.akechi, pts('saito', 4), 2.3, (q) => attackFrom(q, 24));
    walk(F.teppo, pts('saito', 4, 7), 2.1);
    this.civ(rt, -118, -56, 7, '西塔の僧坊に逃れていた人々', { x: -1, z: -0.4 });
    this.civ(rt, -130, -32, 6, '逃げる僧', { x: -1, z: -0.4 });
    rt.after(8, () => { if (!F.ending) F.fire.ignite('shakado_old'); });
    rt.say('明智光秀', '木立を抜けよ。前の者に続き、列を切らすな', 4);
    rt.after(16, () => rt.bark('北の山の奥、横川のあたりにも煙が見える……この山はどこまでも寺が続く'));
  },

  // ===== P7 横川：西塔からさらに北へ長い山道。燃える横川中堂への山道を掃討する（26〜32章） =====
  p7(rt) {
    const F = rt.flags;
    if (F.step >= 6) return;
    F.step = 6; F.stepT = rt.t; F.smokeCall = false;
    rt.unmark('shakado'); rt.unmark('jodoin'); rt.unmark('west');
    rt.banner('横川へ', '長い山道の先、北の山中へ入る');
    rt.obj('main', '逃げ惑う人々を追わず、横川への山道を掃討せよ', 'main');
    rt.marker('yokawa', () => F._gp, '横川への山道', { h: 3 });
    walk(F.akechi, pts('yokawa'), 2.2, (q) => attackFrom(q, 24));
    this.civ(rt, -116, -242, 7, '横川の僧坊に逃れていた人々', { x: 0, z: -1 });
    this.civ(rt, -96, -207, 5, '逃げる僧', { x: 0, z: -1 });
    rt.after(8, () => { if (!F.ending) F.fire.ignite('yokawa_chudo_1571'); });
    rt.say('明智光秀', '横川まではなお長い。六谷へ逃げる人を追うな。我らは本道を進め', 4);
    rt.marker('valley', { x: -90, z: -216 }, '六谷への逃げ道・掃討は本道', { h: 2 });
  },

  win(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('mudoji');
    for (const id of ['hiyoshi', 'trail', 'stairs', 'monju', 'court', 'kodo', 'chudoG', 'west', 'jodoin', 'shakado', 'yokawa', 'valley']) rt.unmark(id);
    rt.objDone('main');
    if (!F.civHurt) rt.objDone('civ');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '燃える山道を掃討した', pts: 22 }; }, '任務達成・山道を掃討した');
    sfx('kane', 0.5);
    rt.banner('比叡の山、煙に包まれる', why || '燃える山道の掃討を終え、味方が後を引き継いだ');
    rt.say('明智光秀', `${nm(rt)}、ようやった。……この山の煙は、京からも見えよう`, 4.5);
    rt.player.u.invuln = true;
    rt.finish({}, 10);
  },

  lose(rt) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end');
    for (const id of ['mudoji', 'hiyoshi', 'trail', 'stairs', 'monju', 'court', 'kodo', 'chudoG', 'west', 'jodoin', 'shakado', 'yokawa', 'valley']) rt.unmark(id);
    rt.objRemove('civ');
    rt.objFail('main'); rt.tracker.main = false;
    rt.banner('山道を押し通せず', '先手が崩れた。組とともに坂本へ退く');
    rt.say('明智光秀', '先手が持たぬ。組を離さず、来た山道を下がれ', 4);
    const back = (F._route || pts('honzaka')).slice(0, Math.max(1, F._gI || 0)).reverse();
    rt.marker('retreat', { x: back[0][0], z: back[0][1] }, '来た山道へ退く', { h: 3 });
    for (const g of F.oda) if (!gone(g)) walk(g, back, 2.2);
    rt.player.u.invuln = true; rt.finish({}, 9);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.fire) F.fire.tick(dt);
    if (F.ending || F.step < 1 || !rt.player.u.alive) return;
    for (const g of rt.squadGroups) if (!g._followSlot) {
      g._followSlot = g.slotPos; g._hieiArmy = rt.army;
      g._followPoints = Array.from({ length: g.initial }, () => ({ x: 0, z: 0, t: -1 }));
      g.slotPos = followSlot;
    }
    const u = rt.player.u;
    // 道しるべ：任務の印は、道筋（本坂・東塔の小道）の少し先の点に置く（斜面や森へまっすぐ向かわせない）
    {
      const R = routeFor(F), key = F._routeKey;
      if (F._gKey !== key && rt.t >= (F._gTryT || 0)) {
        F._gKey = key;
        let bi = -1, bd = Infinity;
        for (let i = 0; i < R.length; i++) {
          RUNNER_TEST.x = R[i][0]; RUNNER_TEST.z = R[i][1];
          const d = Math.hypot(RUNNER_TEST.x - u.pos.x, RUNNER_TEST.z - u.pos.z);
          if (d < bd && runnerClear(rt.army, u, u.pos, RUNNER_TEST)) { bd = d; bi = i; }
        }
        F._gHold = bi < 0;
        if (bi >= 0) F._gI = bi;
        else { F._gKey = null; F._gTryT = rt.t + 0.5; }
      }
      while (!F._gHold && F._gI < R.length - 1 && Math.hypot(R[F._gI][0] - u.pos.x, R[F._gI][1] - u.pos.z) < 1.8) F._gI++;
      if (!F._gHold) { F._gp.x = R[F._gI][0]; F._gp.z = R[F._gI][1]; }
    }
    if (F.step === 1) {
      const cleared = gone(F.hiyoshiG);
      rt.objProgress('main', !cleared ? '鳥居の前の僧兵を、味方と退けよ' : !near(u, P.trailhead, 16) ? '本坂の登り口の印へ' : '登り口で明智の先手を待て');
      if (cleared && !F.hiyoDone) {
        F.hiyoDone = true; rt.unmark('hiyoshi'); rt.bark('日吉社の前が開いた。登り口へ');
        rt.marker('trail', P.trailhead, '本坂の登り口', { h: 3 });
        // 鳥居の前で「かかれ」のまま待たせず、実際に登り口へ列を進める。
        walk(F.akechi, [[150, 5], [146, 4], [134, 3], [124, 2]], 2.6);
      }
      if (cleared && near(u, P.trailhead, 16) && arrived(F.akechi, P.trailhead, 10)) { rt.unmark('trail'); this.p2(rt); }
    } else if (F.step === 2) {
      if (u.pos.x < 64) this.bellTodo(rt);
      if (u.pos.x < 30) this.ambush(rt);
      if (near(u, P.stairsFoot, 9) && arrived(F.akechi, P.stairsFoot, 12)) { this.p3(rt); return; }
      rt.objProgress('main', near(u, P.stairsFoot, 9) && !arrived(F.akechi, P.stairsFoot, 12) ? columnWait(F.akechi, '石段の下') : '本道の印をたどり、石段の下へ');
    } else if (F.step === 3) {
      rt.objProgress('main', !near(u, P.monjuro, 6) ? '石段を上り、文殊楼の門へ' : !arrived(F.akechi, P.monjuro, 10) ? columnWait(F.akechi, '門の前') : !guardedRoad(rt, P.monjuro) ? '門の近くの手向かう者を退けよ' : '門を抜け、堂の見える道へ');
      if (near(u, P.monjuro, 6) && arrived(F.akechi, P.monjuro, 10) && guardedRoad(rt, P.monjuro)) this.p4(rt);
    } else if (F.step === 4) {
      if (!F.courtDone) arrived(F.akechi, P.court, 10);
      if (!F.courtDone) rt.objProgress('main', near(u, P.court, 9) ? columnWait(F.akechi, '根本中堂の前') : '堂の間の道をたどり、根本中堂の前へ');
      if (!F.courtDone && (near(u, P.court, 9) && arrived(F.akechi, P.court, 10))) {
        F.courtDone = true;
        rt.objProgress('main', '堂の間を抜け、西の山道へ');
        rt.bark('根本中堂の前へ出た。煙の中を西の山道へ');
      }
      if (F.courtDone && guardedRoad(rt, P.court)) this.bellSaito(rt);
      if (F.bell2) {
        rt.objProgress('main', near(u, P.westGate, 12) && !arrived(F.akechi, P.westGate, 12) ? columnWait(F.akechi, '西の道の入口') : near(u, P.westGate, 12) && !guardedRoad(rt, P.westGate) ? '西の道の入口の手向かう者を退けよ' : '組と西の山道の印へ');
        if (near(u, P.westGate, 12) && arrived(F.akechi, P.westGate, 12) && guardedRoad(rt, P.westGate)) this.p6(rt);
      }
    } else if (F.step === 5) {
      const byJodoin = near(u, P.jodoin, 18);
      if (byJodoin && !F.jodoinShown) { F.jodoinShown = true; rt.bark('浄土院の御廟を荒らすな。本道の列に続け'); }
      rt.objProgress('main', near(u, P.saito, 12) && !arrived(F.akechi, P.saito, 12) ? columnWait(F.akechi, '釈迦堂の前') : near(u, P.saito, 12) && !guardedRoad(rt, P.saito) ? '釈迦堂の前の手向かう者を退けよ' : '印をたどり、釈迦堂の前へ');
      if (near(u, P.saito, 12) && arrived(F.akechi, P.saito, 12) && guardedRoad(rt, P.saito)) this.p7(rt);
    } else if (F.step === 6) {
      rt.objProgress('main', near(u, P.yokawa, 12) && !arrived(F.akechi, P.yokawa, 12) ? columnWait(F.akechi, '横川への道') : near(u, P.yokawa, 12) && !guardedRoad(rt, P.yokawa) ? '横川への道の手向かう者を退けよ' : '北の本道の印をたどり、横川へ');
      if (near(u, P.yokawa, 12) && arrived(F.akechi, P.yokawa, 12) && guardedRoad(rt, P.yokawa)) this.win(rt, '燃える堂の間を抜け、横川への山道の掃討を終えた');
    }
    // 煙で道を見失う味方。移動先は使い回し、下知を出す時だけ更新する。
    if (F.step === 4 && !F.valleyOrder && F.akechi2 && !gone(F.akechi2) && F.akechi2.order !== 'path' && F.lostN < 3 && rt.t >= F.lostT) {
      F.lostT = rt.t + 8;
      const g = F.akechi2, at = LOST_POINTS[F.lostN % LOST_POINTS.length];
      g.order = 'move'; g.speed = 2; g.dest = at; g.onArrive = holdLost;
      if (F.lostN % 3 === 0) rt.say('足軽', LOST_LINES[(F.lostN / 3 | 0) % LOST_LINES.length], 3);
      F.lostN++;
      if (F.lostN === 3) {
        rt.say('明智光秀', '本道へ戻れ！　前の列に続き、西の山道へ進め', 3);
        walk(g, [[-21, -18], ...pts('todo_n', 2), ...pts('saito', 1, 4)], 2.3);
      }
    }
    // 先手が壊滅・敗走した時だけ、この持ち場の失敗とする。秒数で山の戦を終えない。
    if (gone(F.akechi)) this.lose(rt);
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.group && v.group.civ) {
      if (k && k.isPlayer && !F.civHurt) {
        F.civHurt = true;
        rt.objFail('civ');
        rt.violation('逃げる非戦の者を討った', ['明智光秀', '追うなと申したはずじゃ。刃向かわぬ者を討って、何の手柄か']);
      }
      return;
    }
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || g.civ || g._routSaid || !g.name || rt.t - (F.routSaidT || -99) < 8) return;
    let seen = false;
    for (const u of g.units) if (u.alive && !u.gone && sightPoint(rt, u.pos, 40)) { seen = true; break; }
    g._routSaid = true; F.routSaidT = rt.t;
    const V = [`${g.name}が崩れた`, `${g.name}の寄せが止まった`, `${g.name}が持ち場を離れた`, `${g.name}が山の奥へ逃げていく`];
    if (seen) rt.say('足軽', V[(F.routN = (F.routN || 0) + 1) % V.length], 2.5);
    else rt.say('伝令', `${g.name}が持ち場を離れたとの報せです`, 2.5);
  },
};

// 信長の三井寺本陣はこの切り出しの南の外。豪盛を架空の山の総大将にしない。
hiei_mtn.taisho = { a: null, b: null };
hiei_mtn.noHorse = true;
hiei_mtn.noWake = true;       // 軽い遠景の大軍を本物の兵へ増やさず、携帯向けの人数を守る
hiei_mtn.noTaishoRaid = true;   // 山では、殿を狙う別手を崖や谷の向こうに湧かせない（本坂を登る筋に絞る）
hiei_mtn.sides = { a: { name: '織田軍（明智光秀の手）', mon: 'oda' }, b: { name: '延暦寺の衆徒・武装した里の者', mon: 'namu' } };
hiei_mtn.famous = []; // 光秀本人と供は開戦時に置く。後から別の隊へ足さない。
hiei_mtn.date = () => '元亀二年（1571）九月十二日　秋';
hiei_mtn.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '登りの下知まで待つ' : '');
hiei_mtn.skip = (rt) => { if (rt.phase === 'brief') hiei_mtn.p1(rt); };
hiei_mtn.history = '元亀二年九月十二日、織田信長は比叡山延暦寺を攻めた。延暦寺は前年の志賀の陣で浅井・朝倉を山にかくまい、信長の求めに応じなかった。信長公記は、坂本の町から山上の堂塔に火が放たれ、僧も俗も区別なく多くが討たれたと記す。兼見卿記・多聞院日記も焼き討ちと大きな犠牲を伝える。死者は数百とも数千とも言われ、焼けた広さにも諸説がある。正覚院豪盛は山を逃れ、のちに武田信玄を頼ったという。山には東塔・西塔・横川の三地区があり、堂と僧坊が谷々に散らばっていた。この戦の建物は、焼ける前の姿を推し量って作った。霧や局地の時刻、持ち場ごとの兵数と光秀の細かな登路・攻め順は確認できないため、景色の復元として扱う。この遊びでは、燃える堂と坂本の町の間の山道を上へ掃討し、刃向かう者とだけ戦い、逃げ惑う者を討たない形にしている。この下知は遊びのためのもので、史実の焼き討ちを非戦の者が守られた出来事として描くものではない。 『耶蘇会士日本通信』に収められたフロイスの焼き討ち報告は、谷々にあった僧坊が長い戦乱で減っていたと伝える。本道脇の礎石は、その荒廃を表す推定の景色であり、史料がこの場所の建物跡を示したわけではない。手紙は僧や女性、子どもも犠牲になったと伝えるが、人数や全ての経過が確定したわけではない。宣教師は布教の立場から仏教を厳しく評しており、その評価を山の人々すべての姿としては使わない。台詞は自分の言葉で短く言い直した。『武功夜話』は後の時代の作で、成立や内容に疑いがあるため、今回の根拠には使っていない。';

// 素直な遊び手：その段の道筋（castles/hiei1571.js の道）をたどり、近い敵とは戦う。深手なら味方の中へ下がる
const ROUTE = {
  1: (F) => F.hiyoDone ? [[150, 5], [146, 4], [134, 3], [124, 2]]
    : [[160, 5], [150, 5], [148, -6], [143, -16]],
  2: () => [[143, -16], [148, -6], [150, 5], [146, 4], [134, 3], ...pathById('honzaka').pts.slice(0, 21)],
  3: () => [...pathById('honzaka').pts.slice(17), [-20, -6]],
  4: (F) => (!F.courtDone && !F.bell2 ? [[-8, -6], [-12, -6], [-17, -6], [-22, -5.5], [-26, -5], [-30, -5], [-38, -5]]
    : [[-30, -5], [-24, -5], [-19, -9], [-21, -18], [-28, -25], [-38, -29], [-50, -24], [-60, -22], [-70, -20], [-76, -21]]),
  5: () => [...pts('saito', 4)],
  6: () => [...pts('yokawa')],
};
// 段や目的地が変わった時だけ道筋を作る。毎コマ配列を作らない。
function routeFor(F) {
  const key = F.step * 8 + (F.courtDone ? 1 : 0) + (F.bell2 ? 2 : 0) + (F.hiyoDone ? 4 : 0);
  if (F._routeKey !== key) { F._routeKey = key; F._route = (ROUTE[F.step] || ROUTE[4])(F); }
  return F._route;
}
const LOST_POINTS = [{ x: -22, z: -24 }, { x: -28, z: -25 }, { x: -21, z: -18 }];
const LOST_LINES = ['煙で前が見えぬ！　道はどちらじゃ', '堂が崩れるぞ！　下がれ、下がれ', '味方はどこじゃ、声を出せ！'];
const canFight = (o) => !o.fleeing && !o.noTarget;
const holdLost = (g) => { g.order = 'hold'; g.anchor = g.dest; };
hiei_mtn.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE'); inp.k.delete('KeyS');
  if (!u.alive || F.ending || !F.step) return;
  // 深手の退避と手当ては、先に呼ばれる共通の survive に任せる。
  // 山だけの後ずさりを重ねると、狙いを外せず、打ち手と違う方を向いて受けてしまう。
  // 段の上（法面の上）の敵へ向かって詰まった時は、しばらく道筋へ戻る（石段から回り込む）
  const moved = F._fLast ? Math.hypot(F._fLast.x - u.pos.x, F._fLast.z - u.pos.z) : 1;
  if (!F._fLast) F._fLast = { x: 0, z: 0 };
  F._fLast.x = u.pos.x; F._fLast.z = u.pos.z;
  if (!F._canFight) F._canFight = (o) => canFight(o) && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false);
  // 正面の打ち手を先に受ける。近いだけの別の敵へ向くと、横からの槍を防げない。
  let attacker = null, ad = 8;
  for (const o of b.army.threats || []) {
    if (o.type === 'gun' || o.type === 'bow' || !o.alive || !F._canFight(o)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d < ad) { attacker = o; ad = d; }
  }
  const e = attacker || (b.t < (F._ignoreT || 0) ? null : strikeTarget(b, 11));
  if (e) {
    F._fStuck = moved < 0.03 && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 3 ? (F._fStuck || 0) + 1 : 0;
    if (F._fStuck > 50) { F._fStuck = 0; F._ignoreT = b.t + 7; }
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.6 : 2.5;
    if (d > reach && !e.charging) goTo(p, inp, e.pos.x, e.pos.z, reach);
    // 毎コマのくじで構えを解かず、敵の振りを受け、隙に構えを解いてから突く。
    patientStrike(p, inp, e, d);
    // 槍の届かぬ間から構え続けると、登る列に遅れ、弓の射線に居残る。
    if (!attacker && d > reach + 1.5) inp.guardHold = false;
    return;
  }
  inp.guardHold = false;
  // 道筋をたどる。回り込みは実際の時間で詰まりを見る共通の goTo に任せる。
  const R = routeFor(F);
  const key = F._routeKey;
  if (F._botKey !== key) {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < R.length; i++) {
      RUNNER_TEST.x = R[i][0]; RUNNER_TEST.z = R[i][1];
      const d = Math.hypot(RUNNER_TEST.x - u.pos.x, RUNNER_TEST.z - u.pos.z);
      if (d < bd && runnerClear(b.army, u, u.pos, RUNNER_TEST)) { bd = d; bi = i; }
    }
    // 近さだけで壁の向こうの点を選ばず、帰路の案内で道へ戻ってから選び直す。
    if (bi < 0) { goTo(p, inp, R[0][0], R[0][1], 1.2); return; }
    F._botKey = key; F._botI = bi;
  }
  while (F._botI < R.length - 1 && Math.hypot(R[F._botI][0] - u.pos.x, R[F._botI][1] - u.pos.z) < 1.8) F._botI++;
  const k = F._botI;
  goTo(p, inp, R[k][0], R[k][1], 1.2);
};


// 信長公記・兼見卿記・多聞院日記。三井寺の本陣と坂本→本坂→三塔。
// 山の守りの将・人数は不明。豪盛を討死する城将として置かない。
installBattleJinkei(hiei_mtn, [
  battleJin('山麓の陣と本坂の縦隊', 0, { x: 184, z: 62 }, -Math.PI / 2, [
    ['hiei_hq', '三井寺へ続く後方の道', '織田の衆（将の名は不明）', null, { x: 184, z: 62 }, 'eiraku', 'oda', null, { named: false }],
    ['hiei_akechi', '本坂へ登る先手', '明智光秀の手', null, { x: 158, z: 1 }, 'oda', 'akechi', (r) => r.flags.akechi, { form: 'column' }],
    ['hiei_command', '先手の後ろを進む供の衆', '明智光秀', null, { x: 174, z: 6 }, 'oda', 'akechi', (r) => r.flags.command, { form: 'column' }],
    ['hiei_teppo', '先手の鉄砲', '明智光秀の手', null, { x: 160, z: 9 }, 'oda', 'akechi', (r) => r.flags.teppo, { form: 'line' }],
    ['hiei_north', '北の山麓の囲み', '織田の衆（将の名は不明）', null, { x: 176, z: -26 }, 'oda', 'oda', null, { named: false }],
    ['hiei_south', '南の山麓の囲み', '織田の衆（将の名は不明）', null, { x: 178, z: 30 }, 'oda', 'oda', null, { named: false }],
  ], '信長の三井寺本陣はこの場の南の外。陣地と登山の順は復元、持ち場別の兵数は不明。'),
  battleJin('里坊と三塔に分かれた守り', 1, P.chudo, Math.PI / 2, [
    ['hiei_hiyoshi', '日吉社前・坂本の里坊', '神人と衆徒（将の名は不明）', null, { x: 146, z: -7 }, null, null, (r) => r.flags.hiyoshiG, { named: false }],
    ['hiei_honzaka', '本坂のつづら折り', '衆徒（将の名は不明）', null, { x: 83, z: 9 }, null, null, (r) => r.flags.sw1, { named: false, form: 'column' }],
    ['hiei_monju', '文殊楼・石段の上', '衆徒（将の名は不明）', null, { x: -9, z: -6 }, null, null, (r) => r.flags.monjuG, { named: false }],
    ['hiei_chudo', '東塔・根本中堂の前', '衆徒（将の名は不明）', null, { x: -40, z: -7 }, null, null, (r) => r.flags.chudoG, { named: false }],
    ['hiei_kodo', '東塔・大講堂の前', '衆徒（将の名は不明）', null, { x: -46, z: -27 }, null, null, (r) => r.flags.kodoG, { named: false }],
    ['hiei_saito', '西塔・にない堂', '衆徒（将の名は不明）', null, { x: -110, z: -44 }, null, null, (r) => r.flags.ninaidoG, { named: false }],
    ['hiei_yokawa', '横川中堂の前', '衆徒（将の名は不明）', null, { x: -94, z: -215 }, null, null, (r) => r.flags.yokawaG, { named: false }],
  ], '城の曲輪ではなく堂と山道ごとの守り。非戦の僧・里の者は備に数えず、家の旗を作らない。'),
]);

export { hiei_mtn };
