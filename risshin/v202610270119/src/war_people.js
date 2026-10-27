// 戦の周りの暮らし。兵の名簿・当たり・戦功には入れない、武器を持たない少人数の人。
import * as THREE from 'three';
import { buildModel, poseArms } from './units.js';
import { SOLIDS } from './props.js';
import { S } from './settings.js';
import { personGeo, tintMat } from './town_crowd.js';
import { sfx } from './audio.js';

const NAMES = { farmer: '百姓', porter: '人夫', merchant: '商人', monk: '僧' };
const COLORS = { farmer: 0x62533e, porter: 0x484b3b, merchant: 0x3e4754, monk: 0x2e2925 };

function openGround(rt, x, z) {
  if (Math.abs(x) > rt.world.half - 3 || Math.abs(z) > rt.world.half - 3 || !rt.world.walkable(x, z) || rt.world.inWaterAt(x, z)) return false;
  // 大きな火のそばにも寄らない。
  for (const f of rt.world.fires || []) if (f.size >= 2 && Math.hypot(x - f.x, z - f.z) < 5) return false;
  for (const s of SOLIDS) if (x > s.x0 - 0.4 && x < s.x1 + 0.4 && z > s.z0 - 0.4 && z < s.z1 + 0.4) return false;
  return true;
}

// 危険の外からは近寄らず、すでに巻き込まれた人は離れる向きへ抜ける。
// 線分の最短距離を見るので、逃げる先だけ安全でも兵や火を横切らない。
function leavesDanger(a, b, x, z, radius) {
  const dx = b.x - a.x, dz = b.z - a.z, ax = a.x - x, az = a.z - z;
  const start = ax * ax + az * az, length = dx * dx + dz * dz;
  if (!length) return start >= radius * radius;
  const dot = ax * dx + az * dz;
  if (start < radius * radius) return dot >= 0 && dot * 2 + length > 0;
  const t = Math.max(0, Math.min(1, -dot / length));
  return (ax + dx * t) ** 2 + (az + dz * t) ** 2 >= radius * radius;
}

// 大きな炎は中心からの距離だけでなく、広がった分も空ける。
// 墨俣の民だけで使い、兵の当たりやほかの戦の逃げ方は変えない。
function civilianFireRadius(rt, fire, margin) {
  return margin + (rt.def.civilianCrowd?.avoidFireSpread ? Math.max(0, fire.size - 1) : 0);
}

// 屋根や篝火の台にある炎も、その高さから見張る。煙だけで危険とは決めない。
// 炎の基準位置は絶対標高なので、視線へ渡す時だけ足元からの高さへ戻す。
function civilianFireEye(rt, fire) {
  const eye = Math.max(1.4, fire.size);
  if (!rt.def.civilianCrowd?.watchRaisedFire || !Number.isFinite(fire.base)) return eye;
  return Math.max(eye, fire.base - rt.world.heightAt(fire.x, fire.z) + fire.size * 0.5);
}

function escapeDangerClear(rt, a, b, threat = null, watchers = null) {
  // 一番近い危険から逃げても、別の兵・旗列・火へ近寄る道は選ばない。
  // すでに間合いの内なら、離れる歩みを許す。戦ごとの指定は初めの定義を使い回す。
  const clearance = rt.def.civilianCrowd?.escapeClearance;
  for (const u of rt.army.units) {
    if (!soldier(u, rt)) continue;
    // 斬り合いを見つける間合いと退路の間合いをそろえ、別の乱戦へ逃げ込まない。
    const fighting = civilianCombatActive(rt, u) || u.target?.alive;
    const radius = Math.max(clearance?.soldiers ?? 12, u.mounted ? clearance?.mounted ?? 0 : 0,
      fighting ? clearance?.fighting ?? 0 : 0);
    if (!leavesDanger(a, b, u.pos.x, u.pos.z, radius)
      && (!watchers || routeThreatVisible(rt, watchers, u.pos, u.mounted ? 2.2 : 1.4))) {
      if (threat) { threat.x = u.pos.x; threat.z = u.pos.z; }
      return false;
    }
  }
  for (const f of rt.world.fires || []) if (f.lit !== false && f.size >= (rt.def.civilianCrowd?.fireSize ?? 2)
    && !leavesDanger(a, b, f.x, f.z, civilianFireRadius(rt, f, clearance?.fire ?? 10))
    && (!watchers || routeThreatVisible(rt, watchers, f, civilianFireEye(rt, f)))) {
    if (threat) { threat.x = f.x; threat.z = f.z; }
    return false;
  }
  const troops = distantTroopNear(rt, b.x, b.z, clearance?.troops ?? 12, a, clearance?.mounted ?? 0, watchers);
  if (troops && threat) { threat.x = troops.x; threat.z = troops.z; }
  return !troops;
}

// 見物中にも畦への接近を見張る。近くの物音は、兵本人への警戒とそろえる。
// 四組の見張り時だけ使い、座標は組ごとに用意したものを使い回す。
function routeThreatSeenBy(rt, a, point, targetEye = 1.4) {
  if (!a.out) return false;
  const distance = Math.hypot(a.x - point.x, a.z - point.z);
  return distance <= rt.def.civilianCrowd?.watchRouteDistance
    && dangerVisible(rt, a.x, a.z, point, distance, civilianEye(a.kind), targetEye);
}

// 低い土手越しに見える騎馬や炎は、本人への警戒と同じ高さで退路からも見付ける。
function routeThreatVisible(rt, g, point, targetEye = 1.4) {
  for (const a of g.agents) {
    if (routeThreatSeenBy(rt, a, point, targetEye)) return true;
  }
  return false;
}

// 村外れでは家族ごとに横へ散って待つ。道の中心だけ安全でも、
// 子や年寄りの待ち場所へ兵や火が迫れば、最後の畦へ着く前から気付く。
function watchRouteExitsDanger(rt, g, escaping) {
  const last = g.route.length - 1;
  if (last < 1) return null;
  for (const a of g.agents) {
    // 最後の畦を歩いている人と到着済みの人は、本人への見張りに任せる。
    if (!a.out || !a.routeExit || escaping && a.routeIndex >= last) continue;
    if (!escapeDangerClear(rt, g.route[last - 1], a.routeExit, g.routeThreat, g)) return g.routeThreat;
  }
  return null;
}

function watchRouteDanger(rt, g) {
  const range = rt.def.civilianCrowd?.watchRouteDistance;
  const escaping = g.state === 'flee' && rt.def.civilianCrowd?.watchEscapingRoute;
  if (!range || !g.route?.length || g.state !== 'watch' && !escaping || rt.t < g.routeWatchAt) return null;
  g.routeWatchAt = rt.t + (rt.def.civilianCrowd?.watchRouteCheckInterval ?? 0.8);
  if (escaping) {
    // 逃走中も次の畦へ迫る危険を見張る。通過済みの道へ来た兵では引き返さない。
    // 一人ずつ次の角への道を調べ、残りの共通区間は最後尾から一度だけ調べる。
    let first = g.route.length;
    for (const a of g.agents) {
      if (!a.out || a.routeIndex >= g.route.length) continue;
      first = Math.min(first, a.routeIndex);
      if (!escapeDangerClear(rt, a, routePoint(a, g.route, a.routeIndex), g.routeThreat, g)) return g.routeThreat;
    }
    for (let i = first + 1; i < g.route.length; i++) {
      if (!escapeDangerClear(rt, g.route[i - 1], g.route[i], g.routeThreat, g)) return g.routeThreat;
    }
    return watchRouteExitsDanger(rt, g, true);
  }
  const fromPeople = rt.def.civilianCrowd?.watchRouteFromPeople;
  // 村外れに散って立つ人は、組の中心と畦の間だけでは見張り切れない。
  // 一人ずつ足元から最初の畦までを調べ、その先の共通の道は一度だけ調べる。
  if (fromPeople) for (const a of g.agents) {
    if (a.out && !escapeDangerClear(rt, a, g.route[0], g.routeThreat, g)) return g.routeThreat;
  }
  let prev = fromPeople ? g.route[0] : g.home;
  for (let i = fromPeople ? 1 : 0; i < g.route.length; i++) {
    const point = g.route[i];
    // 家の陰の兵で探索を終えず、同じ畦へ迫る見える兵・火・控えも調べる。
    if (!escapeDangerClear(rt, prev, point, g.routeThreat, g)) return g.routeThreat;
    prev = point;
  }
  return watchRouteExitsDanger(rt, g, false);
}

// 狭い畦や曲がり角でも、前の人の体をすり抜けない。
// 初めから近い人同士は離れる歩みを許し、足止めし合わないようにする。
function escapePeopleClear(rt, a, b) {
  if (!rt.def.civilianCrowd?.keepPeopleApart) return true;
  for (const other of rt.warCrowd.agents) {
    if (other === a || !other.out) continue;
    const radius = 0.35 * (a.sc + other.sc);
    if (!leavesDanger(a, b, other.x, other.z, radius)) return false;
  }
  return true;
}

// 見物を始める時も、すでに立っている人と同じ組の人の体を空ける。
// 家や水路をよけた候補が、別の人の足場と重なるのを防ぐ。
function watchPeopleClear(agents, x, z, scale) {
  for (const a of agents) if (Math.hypot(a.x - x, a.z - z) < 0.35 * (a.sc + scale)) return false;
  return true;
}

const civilianEye = (kind) => kind === 'child' ? 0.9 : kind === 'elder' ? 1.2 : 1.4;
const noticeOrigin = { x: 0, z: 0 };

// 墨俣では遠い家や土手を透かして兵を見つけない。近くは物音でも気付く。
// 退路の安全判定とは分け、気付く前でも危険な道へは踏み込ませない。
function dangerVisible(rt, x, z, point, distance, eye, targetEye = 1.4) {
  const hearing = rt.def.civilianCrowd?.noticeHearingDistance;
  if (hearing == null || distance <= hearing) return true;
  noticeOrigin.x = x; noticeOrigin.z = z;
  return civilianSightClear(rt, noticeOrigin, point, eye, targetEye)
    && terrainSightClear(rt, x, z, eye, point.x, point.z, targetEye);
}

// 見物先と近くの逃げる人を、同じ地形と目線で確かめる。
// 砦を見る時は柵の手前まで、人を見る時は相手まで。座標や形は作らない。
function terrainSightClear(rt, ax, az, eye, bx, bz, endEye, fraction = 1) {
  const startY = rt.world.heightAt(ax, az) + eye;
  const endY = rt.world.heightAt(bx, bz) + endEye;
  const samples = Math.ceil(Math.hypot(bx - ax, bz - az) * fraction / 2);
  for (let j = 1; j <= samples; j++) {
    const along = fraction * j / samples;
    const x = ax + (bx - ax) * along, z = az + (bz - az) * along;
    if (rt.world.heightAt(x, z) + 0.15 >= startY + (endY - startY) * along) return false;
  }
  return true;
}

// 点の間にある家の角や細い稲架も拾う。足場と同じ余白を線分全体へ付ける。
// 座標・形は作らず、既存の建物の外枠で入る時刻と出る時刻を比べる。
function solidPathClear(a, b, startY = null, endY = null, margin = 0.3) {
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const s of SOLIDS) {
    let enter = 0, leave = 1;
    if (dx === 0) {
      if (a.x <= s.x0 - margin || a.x >= s.x1 + margin) continue;
    } else {
      const t0 = (s.x0 - margin - a.x) / dx, t1 = (s.x1 + margin - a.x) / dx;
      enter = Math.max(enter, Math.min(t0, t1)); leave = Math.min(leave, Math.max(t0, t1));
    }
    if (dz === 0) {
      if (a.z <= s.z0 - margin || a.z >= s.z1 + margin) continue;
    } else {
      const t0 = (s.z0 - margin - a.z) / dz, t1 = (s.z1 + margin - a.z) / dz;
      enter = Math.max(enter, Math.min(t0, t1)); leave = Math.min(leave, Math.max(t0, t1));
    }
    if (enter < leave) {
      // 稲架の上に見える炎や騎馬まで、無限の高さの壁として隠さない。
      // 高さが分からない家は従来どおり遮り、歩く退路の判定には高さを使わない。
      if (startY !== null && s.civilianSightTop != null
        && Math.min(startY + (endY - startY) * enter, startY + (endY - startY) * leave) > s.civilianSightTop) continue;
      return false;
    }
  }
  return true;
}

function civilianSightClear(rt, a, b, eye, targetEye) {
  return rt.def.civilianCrowd?.watchTerrainSight
    ? solidPathClear(a, b, rt.world.heightAt(a.x, a.z) + eye, rt.world.heightAt(b.x, b.z) + targetEye)
    : solidPathClear(a, b);
}

function pathClear(rt, a, b, crowd = false) {
  if (rt.army.wallBetween(a, 0, b) || rt.army.wallBetween(a, 1, b)) return false;
  if (crowd && rt.def.civilianCrowd?.continuousEscapeSolids
    && !solidPathClear(a, b, null, null, rt.def.civilianCrowd?.escapeSolidMargin ?? 0.3)) return false;
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.6));
  // 墨俣の畦は体の幅も陸に収まる道だけ使う。中心だけ通れる川岸へ走らせない。
  const bankMargin = crowd ? rt.def.civilianCrowd?.escapeBankMargin ?? 0 : 0;
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const sideX = length ? (b.z - a.z) / length * bankMargin : bankMargin;
  const sideZ = length ? (a.x - b.x) / length * bankMargin : 0;
  const h = rt.world.heightAt(a.x, a.z);
  const fireClearance = crowd ? rt.def.civilianCrowd?.fireClearance ?? 5 : 5;
  let last = h;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    // 外周の村・城下へも逃げられるよう、民の指定範囲を使う。
    if (crowd ? !lightOpen(rt, x, z) : !openGround(rt, x, z)) return false;
    const y = rt.world.heightAt(x, z);
    if (bankMargin) for (let side = -1; side <= 1; side += 2) {
      const bankX = x + sideX * side, bankZ = z + sideZ * side;
      if (!rt.world.walkable(bankX, bankZ) || rt.world.inWaterAt(bankX, bankZ)
        || Math.abs(rt.world.heightAt(bankX, bankZ) - y) > 0.45) return false;
    }
    if (crowd) for (const f of rt.world.fires || []) if (f.lit !== false && f.size >= (rt.def.civilianCrowd?.fireSize ?? 2)) {
      const radius = civilianFireRadius(rt, f, fireClearance);
      if (Math.hypot(x - f.x, z - f.z) < radius
        && !(rt.def.civilianCrowd?.escapeCheckInterval
          ? leavesDanger(a, b, f.x, f.z, radius)
          : Math.hypot(a.x - f.x, a.z - f.z) < radius && leavesFire(a, b, f))) return false;
    }
    if (Math.abs(y - last) > 0.45) return false;
    last = y;
  }
  return true;
}

function leavesFire(a, b, f) {
  const dx = b.x - a.x, dz = b.z - a.z;
  return dx * dx + dz * dz > 0 && (a.x - f.x) * dx + (a.z - f.z) * dz >= 0;
}

function addPerson(rt, L, kind, x, z, heading) {
  if (L.actors.length >= L.cap || !openGround(rt, x, z)) return false;
  for (const u of rt.army.units) {
    if (!u.alive || u.group?.people || u.type === 'dummy' || u.type === 'porter') continue;
    const d = Math.hypot(u.pos.x - x, u.pos.z - z);
    if (d < 7 || (u.target?.alive || u.atk) && d < 28) return false;
  }
  for (const a of L.actors) if (Math.hypot(a.home.x - x, a.home.z - z) < 3) return false;
  const col = COLORS[kind], monk = kind === 'monk', u = {};
  const mesh = buildModel(u, {
    sohei: 1, soheiV: 9, kosode: !monk, monk: monk ? 1 : 0, tier: 0,
    cloth: col, kesa: monk ? 0x7a6547 : col, armor: col, lace: col, skin: 0xa88868,
    hat: 'none', kato: 0, kote: 0, sode: false, saya: false, flag: null, weapon: 'none',
  });
  mesh.userData.noFreeze = true; mesh.userData.civilian = NAMES[kind];
  mesh.position.set(x, rt.world.heightAt(x, z), z); mesh.rotation.y = heading;
  rt.scene.add(mesh);
  const a = { kind, u, mesh, home: { x, z }, end: { x, z }, probe: { x, z }, heading, fleeing: false, moving: false, wait: 2 + L.actors.length, phase: L.actors.length * 3 };
  L.actors.push(a);
  if (kind === 'porter' || kind === 'farmer') {
    // 背負った藁包み。形と材質はこの戦の全員で共有する。
    const load = new THREE.Mesh(L.box, L.straw);
    load.position.set(0, 1.05, -0.31); load.scale.set(0.48, 0.6, 0.3); mesh.add(load);
  } else if (kind === 'merchant') {
    const stall = new THREE.Mesh(L.box, L.straw);
    stall.position.set(x + Math.cos(heading) * 1.1, rt.world.heightAt(x + Math.cos(heading) * 1.1, z) + 0.2, z);
    stall.scale.set(0.8, 0.4, 0.6); rt.scene.add(stall); L.goods.push(stall);
  }
  return true;
}

export function warPeopleInit(rt, camps) {
  if (rt.def.dojo) return;
  const L = rt.warPeople = { actors: [], goods: [], cap: 8, scan: 0, box: new THREE.BoxGeometry(1, 1, 1), straw: new THREE.MeshLambertMaterial({ color: 0x8b7854 }) };
  // 土地ごとの民を指定した戦は、本陣や砦へ里の者を自動で足さない。
  if (rt.def.civilianCrowd) { crowdInit(rt); return; }
  // 本陣の入口を空け、幕の側面の外で荷を運び、物を売る。
  for (const c of camps) {
    if (rt.def.warPeople?.camps === false) break;
    addPerson(rt, L, 'porter', c.x + c.w / 2 + 4, c.z + c.d / 2 + 3, Math.PI);
    addPerson(rt, L, 'merchant', c.x - c.w / 2 - 4, c.z + c.d / 2 + 3, 0);
  }
  let farmers = 0, monks = 0;
  const perSite = 2;
  for (const s of SOLIDS) {
    const kind = s.civilianSite === 'home' ? 'farmer' : s.civilianSite === 'temple' ? 'monk' : null;
    if (!kind || kind === 'farmer' && farmers >= perSite || kind === 'monk' && monks >= perSite) continue;
    // 戸口の正面を避け、建物の端からさらに三メートル離す。
    const x = s.x + s.c * (s.hw + 3) + s.s * (s.hd + 2);
    const z = s.z - s.s * (s.hw + 3) + s.c * (s.hd + 2);
    if (addPerson(rt, L, kind, x, z, Math.atan2(s.s, s.c))) {
      if (kind === 'farmer') farmers++; else monks++;
    }
  }
  if (!rt.def.mapCastle) crowdInit(rt);
}

function choosePath(rt, a, angle, fleeing) {
  const p = a.mesh.position, q = a.probe;
  // 壁や川へ突っ込まず、逃げる時は危険から離れる半円の中で道を探す。
  for (let i = 0; i < 7; i++) {
    const turn = i === 0 ? 0 : Math.ceil(i / 2) * 0.4 * (i % 2 ? 1 : -1);
    const h = angle + turn, d = fleeing ? 9 : 4;
    q.x = p.x + Math.sin(h) * d; q.z = p.z + Math.cos(h) * d;
    if (!pathClear(rt, p, q)) continue;
    let blocked = false;
    for (const u of rt.army.units) if (u.alive && !u.group?.people && u.type !== 'dummy' && Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < 7) { blocked = true; break; }
    if (blocked) continue;
    a.end.x = q.x; a.end.z = q.z; a.heading = h; a.moving = true;
    return;
  }
  a.moving = false;
}

function scanPeople(rt, L) {
  for (const a of L.actors) {
    const p = a.mesh.position;
    let danger = null, closest = 26;
    for (const u of rt.army.units) {
      if (!u.alive || u.group?.people || u.type === 'dummy' || u.type === 'porter') continue;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (d < closest && (d < 8 || u.atk || u.swing || u.target?.alive)) { danger = u.pos; closest = d; }
    }
    for (const f of rt.world.fires || []) if (f.size >= 2 && Math.hypot(f.x - p.x, f.z - p.z) < closest) { danger = f; closest = Math.hypot(f.x - p.x, f.z - p.z); }
    if (danger) {
      a.fleeing = true;
      choosePath(rt, a, Math.atan2(p.x - danger.x, p.z - danger.z), true);
    } else if (!a.moving && a.wait <= 0) {
      if (a.fleeing) {
        if (Math.hypot(p.x - a.home.x, p.z - a.home.z) < 36) choosePath(rt, a, a.heading, true);
      } else if (a.kind === 'porter') {
        choosePath(rt, a, Math.hypot(p.x - a.home.x, p.z - a.home.z) > 2 ? Math.atan2(a.home.x - p.x, a.home.z - p.z) : a.heading + Math.PI, false);
      }
      a.wait = 4;
    }
  }
}

export function warPeopleTick(rt, dt) {
  const L = rt.warPeople;
  if (!L) return;
  crowdTick(rt, dt);
  L.scan -= dt;
  if (!rt.over && L.scan <= 0) { L.scan = 1; scanPeople(rt, L); }
  for (const a of L.actors) {
    const p = a.mesh.position, u = a.u;
    a.wait -= dt;
    if (!rt.over && a.moving) {
      const dx = a.end.x - p.x, dz = a.end.z - p.z, d = Math.hypot(dx, dz);
      const step = Math.min(d, dt * (a.fleeing ? 2.5 : 0.8));
      if (d > 0.05) {
        const x = p.x + dx / d * step, z = p.z + dz / d * step;
        if (openGround(rt, x, z)) { p.set(x, rt.world.heightAt(x, z), z); a.mesh.rotation.y = Math.atan2(dx, dz); }
        else a.moving = false;
      } else { a.moving = false; a.wait = a.fleeing ? 0 : 4; }
    }
    const near = Math.hypot(rt.camera.position.x - p.x, rt.camera.position.z - p.z) < 85;
    a.mesh.visible = near;
    if (!near) continue;
    const moving = a.moving && !rt.over;
    if (!S.reduceMotion && moving) a.phase += dt * (a.fleeing ? 10 : 5);
    const sw = moving && !S.reduceMotion ? Math.sin(a.phase) * 0.3 : 0;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.body.rotation.x = a.fleeing ? 0.18 : a.kind === 'porter' ? 0.12 : 0;
    u.moving = S.reduceMotion ? 0 : moving ? 1 : 0;
    poseArms(u, a.phase);
    if (a.kind === 'monk' && !moving) { u.armL.rotation.x = -0.7; u.armR.rotation.x = -0.7; }
  }
}

export function warPeopleDispose(rt) {
  const L = rt.warPeople;
  if (!L) return;
  for (const a of L.actors) rt.scene.remove(a.mesh);
  for (const m of L.goods) rt.scene.remove(m);
  crowdDispose(rt);
  L.box.dispose(); L.straw.dispose(); rt.warPeople = null;
}

// ======================================================================
// 見物と逃げる人（kaito 10/14）。兵ではない百姓・町人・女・子・僧・商人。
// 戦の合間は遠巻きに見物し、戦や火が近づくと悲鳴を上げて逃げる。山の寺の人は堂から谷へ下り、町の人は家から逃げ出す。
// 兵の名簿・当たりには入れない。遠くは一つの InstancedMesh（軽い形）で描き、近い数人だけ本物の形に入れ替える。
// ======================================================================
const CROWD = {
  farmer: [0x62533e, 0x5c5444, 0x6a5a40], woman: [0x5a4048, 0x4a5058, 0x6a5048], child: [0x6b5a40, 0x5a5a48],
  elder: [0x575046, 0x4e4a40], merchant: [0x3e4754, 0x464036], monk: [0x2e2925, 0x34302a],
};
CROWD.townsman = CROWD.merchant;
const CROWD_NAMES = { townsman: '町人', farmer: '百姓', woman: '里の女', child: '里の子', elder: '年寄り', merchant: '商人', monk: '僧' };
// 戦ごとの場の型。山の寺は堂から谷へ下る。町は家から逃げ出す。
const MOUNTAIN = new Set(['hieizan', 'hiei_mtn', 'echizen_ikko', 'shigisan']);
const TOWN = new Set(['nagashima', 'honnoji', 'arioka', 'saika', 'iga', 'tennoji', 'odani', 'inabayama']);
const POOL = ['farmer', 'farmer', 'woman', 'woman', 'child', 'monk', 'elder'];
const NEAR = 26, CAP = 44;
let LGEO = null, LMAT = null;

function lightOpen(rt, x, z) {
  const w = rt.world;
  const b = rt.def.civilianCrowd?.bounds;
  const margin = rt.def.civilianCrowd?.escapeSolidMargin ?? 0.3;
  if ((b ? x < b.minX + 2 || x > b.maxX - 2 || z < b.minZ + 2 || z > b.maxZ - 2 : Math.abs(x) > w.half - 2 || Math.abs(z) > w.half - 2) || !w.walkable(x, z) || w.inWaterAt(x, z)) return false;
  for (const s of SOLIDS) if (x > s.x0 - margin && x < s.x1 + margin && z > s.z0 - margin && z < s.z1 + margin) return false;
  return true;
}

// 墨俣の普請・荷運びの人足は兵と分ける。護衛の足軽や迫る火は引き続き危険として扱う。
const soldier = (u, rt) => u.alive && !u.civ && !u.group?.civ && !u.group?.people && u.type !== 'dummy'
  && !(rt.def.civilianCrowd?.ignoreGoneSoldiers && (u.gone || u.evacuatedWound))
  && !(rt.def.civilianCrowd?.ignorePorters && u.type === 'porter');

// 主人公の斬撃と短い発砲も、見張りと退路で同じ危険として扱う。
// 狙っているだけの兵は音を出さない。記録は既存の時刻を使い回す。
function civilianCombatActive(rt, u) {
  return u.atk || u.swing
    || rt.def.civilianCrowd?.rememberSoldierCombat && (u.fireT > 0 || rt.t < u.civilianCombatUntil)
    || rt.def.civilianCrowd?.watchPlayerCombat && u === rt.player?.u && rt.t < rt.warCrowd?.playerAttackUntil;
}

// 隊の中心でなく、向きと奥行きを含めた列の端から距離を測る。座標は使い回す。
const troopPoint = new THREE.Vector3();
const troopStart = new THREE.Vector3();
const troopNearest = new THREE.Vector3();
// 列の隣り合う二辺を斜めに横切る道も、角との最短距離で調べる。
// 始点・終点に近い列端だけでは、その間の角へ寄る近道を見落とす。
function troopSegmentClear(ax, az, bx, bz, hw, hd, radius) {
  const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
  let enter = 0, leave = 1;
  if (dx === 0) {
    if (Math.abs(ax) > hw) enter = Infinity;
  } else {
    const t0 = (-hw - ax) / dx, t1 = (hw - ax) / dx;
    enter = Math.max(enter, Math.min(t0, t1)); leave = Math.min(leave, Math.max(t0, t1));
  }
  if (dz === 0) {
    if (Math.abs(az) > hd) enter = Infinity;
  } else {
    const t0 = (-hd - az) / dz, t1 = (hd - az) / dz;
    enter = Math.max(enter, Math.min(t0, t1)); leave = Math.min(leave, Math.max(t0, t1));
  }
  if (enter <= leave) return false;
  // 線分が列を横切らなければ、最短になるのは端点か四つの角。
  // 端点の間合いは呼び出し元で確認済み。座標や配列は作らない。
  for (let i = 0; i < 4; i++) {
    const x = (i < 2 ? -hw : hw) - ax, z = (i % 2 ? -hd : hd) - az;
    const t = length ? Math.max(0, Math.min(1, (x * dx + z * dz) / length)) : 0;
    if ((x - dx * t) ** 2 + (z - dz * t) ** 2 < radius * radius) return false;
  }
  return true;
}
function distantTroopNear(rt, x, z, r, from = null, mountedRadius = r, watchers = null, noticeEye = null) {
  if (!rt.def.civilianCrowd?.avoidDistantTroops) return null;
  let bestDistance = Infinity, found = false;
  for (const A of rt.world.armies || []) {
    if (A.people || A.rout && !rt.def.civilianCrowd?.avoidRoutedTroops || A.took >= A.n || !A.mesh.visible) continue;
    // 控えの騎馬も、近くで実兵に替わる前から同じ間合いを空ける。
    const radius = A.kind === 'cavalry' ? Math.max(r, mountedRadius) : r;
    A.mesh.updateWorldMatrix(true, false);
    troopPoint.set(x, 0, z); A.mesh.worldToLocal(troopPoint);
    const cx = A.cx + A.off.x, cz = A.cz + A.off.z;
    const dx = troopPoint.x - cx, dz = troopPoint.z - cz;
    const s = Math.sin(A.facing), c = Math.cos(A.facing);
    const ex = dx * c - dz * s, ez = dx * s + dz * c;
    const across = Math.max(0, Math.abs(ex) - A.hw0);
    const along = Math.max(0, Math.abs(ez) - A.hd0);
    const endDistance = Math.hypot(across, along);
    if (from) {
      troopStart.set(from.x, 0, from.z); A.mesh.worldToLocal(troopStart);
      const sx = troopStart.x - cx, sz = troopStart.z - cz;
      const ax = sx * c - sz * s, az = sx * s + sz * c;
      const nx = ax - Math.max(-A.hw0, Math.min(A.hw0, ax));
      const nz = az - Math.max(-A.hd0, Math.min(A.hd0, az));
      const startDistance = Math.hypot(nx, nz);
      // 列が迫って安全な間合いを失っても、列の端から離れる歩みは止めない。
      // 最初の向きも調べ、列を横切って反対側へ抜ける近道を防ぐ。
      if (startDistance < radius) {
        // 列に追い付かれて内側へ入った民も、最寄りの列端へ一歩ずつ抜ける。
        // 内側では距離が常に零になるため、外へ出た一歩だけ許すと動けなくなる。
        if (startDistance === 0) {
          const towardEdge = A.hw0 - Math.abs(ax) <= A.hd0 - Math.abs(az)
            ? (ex - ax) * (ax < 0 ? -1 : 1) : (ez - az) * (az < 0 ? -1 : 1);
          if (towardEdge > 0) continue;
        }
        if (nx * (ex - ax) + nz * (ez - az) >= 0 && endDistance > startDistance) continue;
      } else {
        // 外から来た人は、途中も列の間合いへ入れない。
        if (rt.def.civilianCrowd?.continuousTroopClearance) {
          if (endDistance >= radius && troopSegmentClear(ax, az, ex, ez, A.hw0, A.hd0, radius)) continue;
        } else {
          const qx = ex - Math.max(-A.hw0, Math.min(A.hw0, ex));
          const qz = ez - Math.max(-A.hd0, Math.min(A.hd0, ez));
          troopStart.x = ax; troopStart.z = az; troopPoint.x = ex; troopPoint.z = ez;
          if (endDistance >= radius && leavesDanger(troopStart, troopPoint, ex - qx, ez - qz, radius)
            && leavesDanger(troopStart, troopPoint, ax - nx, az - nz, radius)) continue;
        }
      }
    } else if (endDistance >= radius) continue;
    if (from) {
      // 長い列の中心が家の陰や見張りの範囲外でも、畦へ迫る列端は見える。
      // 一人ずつ最寄りの列端を調べ、見えた位置を逃げる向きにも渡す。座標は使い回す。
      if (watchers) {
        for (const a of watchers.agents) {
          if (!a.out) continue;
          troopPoint.set(a.x, 0, a.z); A.mesh.worldToLocal(troopPoint);
          const wx = troopPoint.x - cx, wz = troopPoint.z - cz;
          const qx = Math.max(-A.hw0, Math.min(A.hw0, wx * c - wz * s));
          const qz = Math.max(-A.hd0, Math.min(A.hd0, wx * s + wz * c));
          troopPoint.set(cx + qx * c + qz * s, 0, cz - qx * s + qz * c).applyMatrix4(A.mesh.matrixWorld);
          if (routeThreatSeenBy(rt, a, troopPoint, A.kind === 'cavalry' ? 2.2 : 1.4)) return troopPoint;
        }
        continue;
      }
      // 通れるかの判定は、一つでも危険な列があればそこで止める。
      troopPoint.set(cx, 0, cz).applyMatrix4(A.mesh.matrixWorld);
      return troopPoint;
    }
    // 逃げる向きには一番近い列端を使う。先に登録された遠い隊の中心を
    // 恐れて、すぐ脇の兵や火へ向かう向きにならないようにする。
    // 内側では最寄りの列端と逆側へ危険の向きを置く。中心から離れるだけでは、
    // 幅の狭い列を縦に走ったり、中心で逃げる向きが決まらなくなったりする。
    let qx = Math.max(-A.hw0, Math.min(A.hw0, ex));
    let qz = Math.max(-A.hd0, Math.min(A.hd0, ez));
    if (!endDistance) {
      if (A.hw0 - Math.abs(ex) <= A.hd0 - Math.abs(ez)) qx -= ex < 0 ? -1 : 1;
      else qz -= ez < 0 ? -1 : 1;
    }
    troopPoint.set(cx + qx * c + qz * s, 0, cz - qx * s + qz * c).applyMatrix4(A.mesh.matrixWorld);
    const distance = Math.hypot(troopPoint.x - x, troopPoint.z - z);
    // 見張りでは列の中心でなく近い列端を見る。隠れた列で、見える別の列を見落とさない。
    if (noticeEye !== null && !dangerVisible(rt, x, z, troopPoint, distance, noticeEye, A.kind === 'cavalry' ? 2.2 : 1.4)) continue;
    if (distance < bestDistance) {
      bestDistance = distance; found = true; troopNearest.copy(troopPoint);
    }
  }
  return found ? troopNearest : null;
}

function lightArmyDistance(b, x, z) {
  if (!b.lightCount()) return Infinity;
  const a = b.light.army, dx = x - b.pos.x, dz = z - b.pos.z;
  const c = Math.cos(b.facing), s = Math.sin(b.facing);
  return Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - a.hw0),
    Math.max(0, Math.abs(dx * s + dz * c) - a.hd0));
}

function clashDistance(c, x, z) {
  if (!c.mesh.parent || c.A.alive + c.B.alive <= 0) return Infinity;
  const dx = x - c.x, dz = z - c.z, co = Math.cos(c.facing), si = Math.sin(c.facing);
  const depth = (c.o.gap ?? 3.4) / 2 + Math.max(c.A.rows, c.B.rows) * 1.15 + Math.abs(c.app);
  return Math.hypot(Math.max(0, Math.abs(dx * co - dz * si) - (c.o.w || 60) / 2),
    Math.max(0, Math.abs(dx * si + dz * co - c.drift) - depth));
}

function formationBlocks(shape, distance, center, x, z, r, from, retreat) {
  if (!from) return distance(shape, x, z) < r;
  const dx = x - from.x, dz = z - from.z;
  let last = distance(shape, from.x, from.z);
  const escaping = retreat && last < r && dx * dx + dz * dz > 0
    // 列の外では外縁から離れればよい。長い列の中心へ斜めに近づいても、
    // 町外れの道を列から離れる向きに進む一歩まで塞がない。
    // 列の中は距離が零なので、従来どおり中心から外へ向く一歩だけ通す。
    && (last > 0 || (from.x - center.x) * dx + (from.z - center.z) * dz >= 0);
  if (last < r && !escaping) return true;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.6));
  for (let i = 1; i <= n; i++) {
    const d = distance(shape, from.x + dx * i / n, from.z + dz * i / n);
    if (escaping ? d < last - 0.0001 : d < r) return true;
    last = d;
  }
  return false;
}

function crowdCornerPassed(w, a, route) {
  const p = route[a.routeIndex], q = route[a.routeIndex + 1];
  if (!q) return false;
  const dx = q.x - p.x, dz = q.z - p.z, len2 = dx * dx + dz * dz;
  if (!len2) return false;
  const t = ((a.x - p.x) * dx + (a.z - p.z) * dz) / len2;
  if (t <= 0 || t > 1) return false;
  const x = p.x + dx * t, z = p.z + dz * t;
  return Math.hypot(a.x - x, a.z - z) < 3
    && Math.abs(w.heightAt(a.x, a.z) - w.heightAt(x, z)) < 1.2;
}

function crowdCornerClear(rt, C, a, route) {
  const next = route[a.routeIndex + 1];
  if (!next) return true;
  const dx = next.x - a.x, dz = next.z - a.z, d = Math.hypot(dx, dz);
  const t = !rt.def.civilianCrowd?.checkFullEscapeCorner && d > 4 ? 4 / d : 1;
  C.wp.x = a.x + dx * t; C.wp.z = a.z + dz * t;
  // 角を捨てた後で列に塞がれると、元の路地へ戻る目印がなくなる。
  // 実兵・軽い軍勢・乱戦を一歩の判定と同じ幅で避け、迫った兵から離れる道は通す。
  return pathClear(rt, a, C.wp, true)
    && (!rt.def.civilianCrowd?.checkFullEscapeCorner || !nearSoldier(rt, C.wp.x, C.wp.z, 12, a));
}

function crowdBypassCorner(rt, a, route) {
  const corner = route[a.routeIndex], next = route[a.routeIndex + 1];
  return !!next && !!dangerNear(rt, corner.x, corner.z, 12, 12, 10)
    && pathClear(rt, a, next, true) && !nearSoldier(rt, next.x, next.z, 12, a);
}

function familyRouteGap(a, b, route) {
  let distance = 0, x = b.x, z = b.z;
  // 軒や塀を挟んだ直線距離ではなく、まだ通る生活道に沿って離れ具合を測る。
  // 既存の角を読むだけで、避難中に道や座標の入れ物を作らない。
  for (let i = b.routeIndex; i < a.routeIndex && i < route.length; i++) {
    const p = route[i];
    distance += Math.hypot(p.x - x, p.z - z); x = p.x; z = p.z;
  }
  return distance + Math.hypot(a.x - x, a.z - z);
}

function familyWaiting(rt, a, route) {
  const gap = rt.def.civilianCrowd?.familyWaitDistance, g = a.g;
  if (!gap || !g.agents.some((b) => b.kind === 'child' || b.kind === 'elder')) return false;
  const goal = route[a.routeIndex];
  const ahead = g.agents.some((b) => b !== a && b.out && (a.routeIndex === route.length
    ? b.routeIndex < route.length
    : (rt.def.civilianCrowd?.familyFollowPath && b.routeIndex < a.routeIndex
      ? familyRouteGap(a, b, route) : Math.hypot(a.x - b.x, a.z - b.z)) > gap && (b.routeIndex < a.routeIndex
      || b.routeIndex === a.routeIndex && Math.hypot(goal.x - b.x, goal.z - b.z) > Math.hypot(goal.x - a.x, goal.z - a.z))));
  // 兵や火が迫った所では待たず、既存の退き道へ逃げ続ける。
  return ahead && !dangerNear(rt, a.x, a.z, 40, 14, 26, rt.def.civilianCrowd?.waitFireAlarm);
}

function crowdArrivalSafe(rt, a, end) {
  return !dangerNear(rt, a.x, a.z, 40, 14, 26)
    && pathClear(rt, a, end, true) && !nearSoldier(rt, end.x, end.z, 12, a);
}

function crowdStride(C, a, x, z, step) {
  const dx = x - a.x, dz = z - a.z, len = Math.hypot(dx, dz);
  if (!len) return 0;
  const vx = dx / len, vz = dz / len;
  let stride = step;
  for (const b of C.agents) {
    if (b === a || !b.out) continue;
    const bx = b.x - a.x, bz = b.z - a.z, radius = 0.38 * (a.sc + b.sc);
    const along = bx * vx + bz * vz, d2 = bx * bx + bz * bz;
    if (along <= 0 || d2 > (step + radius) * (step + radius)) continue;
    if (d2 < radius * radius) { stride = 0; break; }
    const side2 = Math.max(0, d2 - along * along);
    if (side2 >= radius * radius) continue;
    stride = Math.min(stride, Math.max(0, along - Math.sqrt(radius * radius - side2) - 0.02));
  }
  return stride;
}

function nearSoldier(rt, x, z, r, from = null) {
  if (rt.def.civilianCrowd?.avoidDistantTroops) {
    for (const u of rt.army.units) if (soldier(u, rt) && Math.hypot(u.pos.x - x, u.pos.z - z) < r) return true;
    return !!distantTroopNear(rt, x, z, Math.min(r, rt.def.civilianCrowd?.distantWatchDistance ?? 14));
  }
  const retreat = from && rt.def.civilianCrowd?.retreatFromSoldiers;
  const dx = from ? x - from.x : 0, dz = from ? z - from.z : 0, len2 = dx * dx + dz * dz;
  const heightGap = rt.def.civilianCrowd?.soldierHeightClearance;
  const ground = heightGap == null ? 0 : rt.world.heightAt(x, z);
  for (const u of rt.army.units) {
    if (!soldier(u, rt)) continue;
    const fx = from ? from.x - u.pos.x : x - u.pos.x, fz = from ? from.z - u.pos.z : z - u.pos.z;
    // 兵が戸口まで来ても立ち往生させない。初めから近い兵から離れ続ける一歩だけ許す。
    if (retreat && fx * fx + fz * fz < r * r && len2 > 0 && fx * dx + fz * dz >= 0) continue;
    // 逃げる一歩の途中で兵の脇をすり抜けることも防ぐ。
    const t = retreat && len2 > 0 ? Math.max(0, Math.min(1, -(fx * dx + fz * dz) / len2)) : 1;
    const ux = from ? fx + dx * t : fx, uz = from ? fz + dz * t : fz;
    if (ux * ux + uz * uz >= r * r) continue;
    // 坂道は終点と途中で高さが違う。兵へ最も寄る場所の地面で比べ、
    // 道の途中にいる兵を見落とさず、頭上の曲輪の守備兵だけを除く。
    // 平面で近い兵だけ調べ、座標の入れ物は毎回作らない。
    const roadGround = heightGap != null && from && t < 1
      ? rt.world.heightAt(from.x + dx * t, from.z + dz * t) : ground;
    if (heightGap != null && Math.abs(u.pos.y - roadGround) > heightGap) continue;
    return true;
  }
  if (rt.def.civilianCrowd?.avoidLightArmies) for (const b of rt.butai || []) {
    if (heightGap != null && Math.abs(rt.world.heightAt(b.pos.x, b.pos.z) - ground) > heightGap) continue;
    if (formationBlocks(b, lightArmyDistance, b.pos, x, z, r, from, retreat)) return true;
  }
  if (rt.def.civilianCrowd?.avoidClashes) for (const c of rt.world.clashes || []) {
    if (heightGap != null && Math.abs(rt.world.heightAt(c.x, c.z) - ground) > heightGap) continue;
    // 戸口まで乱戦が来た時は外へ逃がす。初めから列の中に見物人は置かない。
    if (formationBlocks(c, clashDistance, c, x, z, r, from, true)) return true;
  }
  return false;
}

function battleCenter(rt) {
  const s = [[0, 0, 0], [0, 0, 0]];
  for (const u of rt.army.units) if (soldier(u, rt) && (u.team === 0 || u.team === 1)) { const c = s[u.team]; c[0] += u.pos.x; c[1] += u.pos.z; c[2]++; }
  if (s[0][2] && s[1][2]) return { x: (s[0][0] / s[0][2] + s[1][0] / s[1][2]) / 2, z: (s[0][1] / s[0][2] + s[1][1] / s[1][2]) / 2 };
  const c = s[0][2] ? s[0] : s[1];
  return c[2] ? { x: c[0] / c[2], z: c[1] / c[2] } : { x: 0, z: 0 };
}

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function addBand(rt, C, x, z, kinds, mode, face, route = null, routeEnd = null, watchAt = null,
  targetClearance = rt.def.civilianCrowd?.watchTargetClearance) {
  // 墨俣の畦道は全経路を確認し、他の戦の生活道の配置も保つ。
  if (!rt.def.civilianCrowd?.requireFullRouteAccess) return addBandDefault(rt, C, x, z, kinds, mode, face, route, routeEnd, watchAt);
  // 墨俣の座標の組と、他の戦の座標付きの道を、初めに同じ形へそろえる。
  if (route) route = route.map((p) => Array.isArray(p) ? { x: p[0], z: p[1] } : p);
  // 最初の畦へ出られても、その先が家や水路で切れていれば見物場所にしない。
  // 退路全体の確認は配置時だけ。逃走中の危険はこれまで通り一歩ずつ調べる。
  if (route && rt.def.civilianCrowd?.requireFullRouteAccess) {
    for (let i = 1; i < route.length; i++) {
      if (!pathClear(rt, route[i - 1], route[i], true)
        || rt.def.civilianCrowd?.requireSafeRouteAccess && !escapeDangerClear(rt, route[i - 1], route[i])) return;
    }
  }
  // 家並みの裏や稲架の陰を、砦が見える見物場所として選ばない。
  // 戦ごとの指定がある時だけ近くの遮りを調べる。道標の点とは別に、配置時だけ使う。
  const targetSight = mode === 'watch' && watchAt && targetClearance != null;
  const sightDistance = mode === 'watch' ? rt.def.civilianCrowd?.watchSightDistance : 0;
  const sightStart = sightDistance || targetSight ? { x: 0, z: 0 } : null;
  const sightEnd = sightDistance || targetSight ? { x: 0, z: 0 } : null;
  const g = { home: { x, z }, mode, route, routeEnd, state: mode === 'inside' ? 'inside' : 'watch', agents: [], calm: 0, danger: false, fledAt: -Infinity, from: { x, z }, routeWatchAt: 0, routeThreat: { x, z } };
  for (const [i, kind] of kinds.entries()) {
    if (C.agents.length >= CAP) break;
    let px = x, pz = z, found = false;
    for (let k = 0; k < 6; k++) {
      const a = i * 2.4 + k, r = 0.9 + i * 0.55 + k * 0.3;
      const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
      if (sightStart) {
        sightStart.x = tx; sightStart.z = tz;
        // 墨俣では足元の先だけでなく、見ている寄せ道まで家や稲架を調べる。
        // 対象の砦自体を遮りとしないよう、指定した手前までに留める。
        const distance = targetSight ? Math.hypot(watchAt.x - tx, watchAt.z - tz) : 0;
        const t = distance ? Math.max(0, distance - targetClearance) / distance : 0;
        sightEnd.x = targetSight ? tx + (watchAt.x - tx) * t : tx + Math.sin(face) * sightDistance;
        sightEnd.z = targetSight ? tz + (watchAt.z - tz) * t : tz + Math.cos(face) * sightDistance;
        // 手前で切った線の終点も、見物先への視線と同じ高さにする。
        const startY = rt.world.heightAt(tx, tz) + civilianEye(kind);
        const endY = targetSight ? startY + (rt.world.heightAt(watchAt.x, watchAt.z) + 1.4 - startY) * t : startY;
        const sightEye = endY - rt.world.heightAt(sightEnd.x, sightEnd.z);
        if (!civilianSightClear(rt, sightStart, sightEnd, civilianEye(kind), sightEye)) continue;
        // 村外れの低い起伏も視線を遮る。子は大人より低い目線から確かめる。
        // 配置時と組の見張りだけで調べ、毎コマの歩行処理には加えない。
        if (targetSight && rt.def.civilianCrowd?.watchTerrainSight
          && !terrainSightClear(rt, tx, tz, civilianEye(kind), watchAt.x, watchAt.z, 1.4, t)) continue;
      }
      // 大人の最大の幅で余裕を取り、初期配置だけで使う。逃走中の形は増やさない。
      if (rt.def.civilianCrowd?.keepPeopleApart
        && (!watchPeopleClear(C.agents, tx, tz, 1.03) || !watchPeopleClear(g.agents, tx, tz, 1.03))) continue;
      // 見物の足場だけでなく、最初の道標へ陸続きで出られることも確かめる。
      // 家の角や水路で道と切れた位置からは見物を始めない。
      if (route?.length && rt.def.civilianCrowd?.requireRouteAccess
        && (!pathClear(rt, { x: tx, z: tz }, route[0], true)
          || rt.def.civilianCrowd?.requireSafeRouteAccess && !escapeDangerClear(rt, { x: tx, z: tz }, route[0]))) continue;
      // 配置時から子・年寄り本人の目線を使い、見物中の見張りとそろえる。
      if (lightOpen(rt, tx, tz) && (!route || mode !== 'watch' || !nearSoldier(rt, tx, tz, 34)
        && !dangerNear(rt, tx, tz, 34, 14, 22, civilianEye(kind)))) { px = tx; pz = tz; found = true; break; }
    }
    if (!found) continue;
    const cols = CROWD[kind];
    // 列を避けて道端へずらした後も、元の立ち位置でなく今いる所から町の騒ぎを見る。
    const heading = mode === 'watch' && watchAt ? Math.atan2(watchAt.x - px, watchAt.z - pz) : face;
    g.agents.push({
      kind, g, x: px, z: pz, h: (targetSight ? Math.atan2(watchAt.x - px, watchAt.z - pz) : face) + (rnd() - 0.5) * 0.5, col: new THREE.Color(cols[i % cols.length]),
      sc: kind === 'child' ? 0.64 : kind === 'elder' ? 0.93 : 0.95 + rnd() * 0.08, ph: rnd() * 6,
      spd: (kind === 'child' ? 2.6 : kind === 'elder' ? 1.9 : 3.0) + rnd() * 0.5,
      tx: px, tz: pz, wpT: 0, safeT: (i % 4) * 0.05, ran: 0, routeIndex: 0, model: null, out: mode !== 'inside', idle: rnd() * 6,
    });
  }
  if (g.agents.length) {
    // 家・水路・兵で大人の配置だけが除かれた時、子だけを村外れに残さない。
    // 組を名簿へ足す前に一度だけ調べ、逃走中の人数や兵の数には触れない。
    if (rt.def.civilianCrowd?.requireAdultCompanion && g.agents.every((a) => a.kind === 'child')) return;
    // 出口で家族を待つ人が一点に重ならないよう、最後の畦に沿って立つ場所を分ける。
    // 初めに陸続きの場所だけ決め、逃走中はこの座標を使い回す。
    const spacing = rt.def.civilianCrowd?.exitSpacing;
    if (spacing && route?.length > 1 && routeEnd !== 'wait') {
      const end = route[route.length - 1], prev = route[route.length - 2];
      const dx = end.x - prev.x, dz = end.z - prev.z, length = Math.hypot(dx, dz);
      if (length) for (const [i, a] of g.agents.entries()) {
        const offset = (i - (g.agents.length - 1) / 2) * spacing;
        const exit = { x: end.x + dz / length * offset, z: end.z - dx / length * offset };
        // 家や岸で予定の位置が使えない時も、全員を同じ終点へ戻さない。
        // 墨俣で空けてある畦幅の中から、先に決めた家族の体を空けて探す。
        const width = rt.def.civilianCrowd?.routeRejoinDistance ?? spacing * g.agents.length;
        const slots = Math.floor(width / spacing);
        for (let slot = -1; slot <= slots * 2; slot++) {
          const across = slot < 0 ? offset : Math.ceil(slot / 2) * spacing * (slot % 2 ? 1 : -1);
          if (Math.abs(across) > width) continue;
          exit.x = end.x + dz / length * across; exit.z = end.z - dx / length * across;
          let occupied = false;
          for (let j = 0; j < i; j++) {
            const other = g.agents[j];
            // 到着判定の手前で止まる分も空け、待つ人同士の体を重ねない。
            const margin = 0.35 * (a.sc + other.sc) + 2 * (rt.def.civilianCrowd?.routeArrivalRadius ?? 0);
            if (Math.hypot(exit.x - other.routeExit.x, exit.z - other.routeExit.z) < margin) { occupied = true; break; }
          }
          if (occupied || !pathClear(rt, prev, exit, true)
            || rt.def.civilianCrowd?.requireSafeRouteAccess && !escapeDangerClear(rt, prev, exit)) continue;
          a.routeExit = exit;
          break;
        }
        // 家族全員の待ち場所が取れない畦からは見物を始めない。
        if (!a.routeExit) return;
      }
    }
    // 在所の一組は遅い人の歩調を基準にする。速さは初めに一度だけ求める。
    g.escapePace = Infinity;
    for (const a of g.agents) g.escapePace = Math.min(g.escapePace, a.spd);
    C.bands.push(g); C.agents.push(...g.agents);
  }
}

function addBandDefault(rt, C, x, z, kinds, mode, face, route = null, routeEnd = null, watchAt = null) {
  const g = { home: { x, z }, mode, route, routeEnd, state: mode === 'inside' ? 'inside' : 'watch', agents: [], calm: 0, from: { x, z }, threat: null };
  const crowd = rt.def.civilianCrowd;
  const seek = route?.length ? (mode === 'watch' ? crowd?.watchPlacementDistance : crowd?.doorPlacementDistance) ?? 0 : 0;
  const places = [{ x, z, from: g.home, routeIndex: 0 }];
  let from = g.home, remaining = seek;
  // 最初の角が近い寺や町外れでも、そこだけで見物人の置き場を諦めない。
  // 指定の生活道に沿って探し、角の向こうの家や川を直線で横切らない。
  if (seek) for (let n = 0; n < route.length; n++) {
    if (n && !(mode === 'watch' && crowd?.followWatchEscape)) break;
    const to = route[n], len = Math.hypot(to.x - from.x, to.z - from.z), reach = Math.min(remaining, len);
    if (!len) { from = to; continue; }
    for (let d = Math.min(6, reach); d > 0; d = Math.min(d + 6, reach)) {
      const place = { x: from.x + (to.x - from.x) * d / len,
        z: from.z + (to.z - from.z) * d / len, from, routeIndex: n };
      if (n && !pathClear(rt, from, place, true)) break;
      places.push(place);
      if (d === reach) break;
    }
    if (reach < len || !pathClear(rt, from, to, true)) break;
    remaining -= len;
    if (remaining <= 0) break;
    from = to;
  }
  for (const [i, kind] of kinds.entries()) {
    if (C.agents.length >= CAP) break;
    let px = x, pz = z, routeIndex = 0, found = false;
    // 指定地が兵の列に近い時は、見物人を省く前に既存の退き道の手前を探す。
    // 戸口も指定のある戦だけ、家の角を抜けられる位置を退き道の手前で探す。
    // 設営時だけの処理。兵や火が近づくまで、家の者は従来どおり非表示で籠もる。
    for (let k = 0; k < 6 * places.length; k++) {
      const place = places[Math.floor(k / 6)], cx = place.x, cz = place.z;
      const j = k % 6;
      const a = i * 2.4 + j, r = 0.9 + i * 0.55 + j * 0.3;
      const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
      if (!lightOpen(rt, tx, tz)) continue;
      // 狭い戸口で家族を重ねると、逃走時の間隔判定で互いを塞いでしまう。
      // 既存の間隔指定がある戦だけ、同じ体幅を設営時にも空ける。
      if (crowd?.keepCivilianSpacing) {
        const sc = kind === 'child' ? 0.64 : kind === 'elder' ? 0.93 : 1.03;
        const overlaps = (b) => Math.hypot(tx - b.x, tz - b.z) < 0.38 * (sc + b.sc) + 0.02;
        if (C.agents.some(overlaps) || g.agents.some(overlaps)) continue;
      }
      if (k >= 6 && !pathClear(rt, place.from, { x: tx, z: tz }, true)) continue;
      // 見物人だけでなく戸口の家族も、散らばった位置から次の角へ出られること。
      // 家の反対側や急な岸には置かず、既存の水・火・塀の判定を共用する。
      if (route?.length && (mode === 'watch' ? crowd?.checkWatchEscape : crowd?.checkDoorEscape)
        && !pathClear(rt, { x: tx, z: tz }, route[place.routeIndex], true)) continue;
      if (route && mode === 'watch') {
        if (nearSoldier(rt, tx, tz, 34)) continue;
        // 立ち位置だけが安全でも、最初の角まで兵の列を横切る場所では見物しない。
        // 設営時だけ、逃走と同じ実兵・備・乱戦の間隔で生活道への出口を調べる。
        if (crowd?.checkWatchEscapeSoldiers
          && nearSoldier(rt, route[place.routeIndex].x, route[place.routeIndex].z, 12, { x: tx, z: tz })) continue;
        // 稲葉山の見物は逃走時と同じ警戒で置く。交戦中の兵の三十四〜四十歩先や、
        // 大火の見える所を避け、設営直後から逃げ出す食い違いを防ぐ。
        if (crowd?.checkWatchDanger && dangerNear(rt, tx, tz, 40, 14, 26, true)) continue;
        // 見物の配置でも火を避ける。家の中の者は配置してから既存の避難で外へ出す。
        if ((rt.world.fires || []).some((f) => f.lit !== false
          && f.size >= (rt.def.civilianCrowd?.fireSize ?? 2) && Math.hypot(tx - f.x, tz - f.z) < 26)) continue;
      }
      px = tx; pz = tz; routeIndex = place.routeIndex; found = true; break;
    }
    if (!found) continue;
    const cols = CROWD[kind];
    // 列を避けて道端へずらした後も、元の立ち位置でなく今いる所から町の騒ぎを見る。
    const heading = mode === 'watch' && watchAt ? Math.atan2(watchAt.x - px, watchAt.z - pz) : face;
    g.agents.push({
      kind, g, x: px, z: pz, h: heading + (rnd() - 0.5) * 0.5, col: new THREE.Color(cols[i % cols.length]),
      sc: kind === 'child' ? 0.64 : kind === 'elder' ? 0.93 : 0.95 + rnd() * 0.08, ph: rnd() * 6,
      spd: (kind === 'child' ? 2.6 : kind === 'elder' ? 1.9 : 3.0) + rnd() * 0.5,
      tx: px, tz: pz, wpT: 0, safeT: (i % 4) * 0.05, ran: 0, routeIndex, model: null, out: mode !== 'inside', idle: rnd() * 6,
    });
  }
  if (rt.def.civilianCrowd?.keepFamiliesTogether && route && g.agents.length > 1
    && g.agents.some((a) => a.kind === 'child' || a.kind === 'elder')) {
    // 家族は子や年寄りの走れる速さに合わせる。設営時だけ決め、逃走中の計算を増やさない。
    let pace = Infinity;
    for (const a of g.agents) pace = Math.min(pace, a.spd);
    for (const a of g.agents) a.spd = pace;
  }
  if (g.agents.length) {
    const offsets = rt.def.civilianCrowd?.routeExitOffsets;
    if (offsets && route?.length > 1 && routeEnd !== 'wait') {
      // 終点だけを組ごとに選び直す。共用の町・寺・村の道は書き換えない。
      // 候補の座標は設営時に作り、逃走中は既存の見回りで安全を調べる。
      const end = route[route.length - 1];
      g.route = route.slice();
      g.exitOptions = [end, ...offsets.map((dx) => ({ x: end.x + dx, z: end.z }))];
    }
    C.bands.push(g); C.agents.push(...g.agents);
  }
}

function crowdInit(rt) {
  const key = rt.def.key || '', mtn = MOUNTAIN.has(key), town = TOWN.has(key);
  seed = 7 + key.length * 131;
  const C = rt.warCrowd = { agents: [], bands: [], pool: [], scan: 0, poolT: 0, screamT: -99, barked: false, playerAttackUntil: -1, mtn, center: battleCenter(rt) };
  const ctr = rt.def.civilianCrowd?.watchAt ?? C.center, half = rt.world.half;
  // 土地ごとの在所・堂と逃げ道が指定された戦は、兵の中心から民を散らさない。
  const bands = rt.civilianBands ?? rt.def.civilianCrowd?.bands;
  if (bands) {
    for (const s of bands) {
      // 家並みの反対側の民まで砦へ向けず、その場所から開けた寄せ道を見せる。
      const at = s.watchAt ?? ctr;
      addBand(rt, C, s.x, s.z, s.kinds, s.mode ?? 'watch',
        Math.atan2(at.x - s.x, at.z - s.z), s.route, s.routeEnd, at, s.watchTargetClearance ?? rt.def.civilianCrowd?.watchTargetClearance);
    }
  } else {
    // 1) 遠巻きに見物する組（戦場の外。兵から三十メートル以上離す）。
    const plan = rt.def.warPeople;
    const want = plan ? 0 : mtn ? 1 : town ? 2 : 3, spots = [];
    for (let i = 0; i < 28 && spots.length < want; i++) {
      const a = i * 2.39996 + 0.4, r = 56 + (i % 4) * 9;
      const x = ctr.x + Math.cos(a) * r, z = ctr.z + Math.sin(a) * r;
      if (Math.abs(x) > half - 12 || Math.abs(z) > half - 12 || !lightOpen(rt, x, z) || nearSoldier(rt, x, z, 34)) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 40)) continue;
      spots.push({ x, z });
    }
    const mix = [['farmer', 'woman', 'child', 'farmer', 'elder'], ['merchant', 'woman', 'farmer', 'child', 'farmer', 'woman'], ['farmer', 'elder', 'woman', 'child']];
    for (const [i, s] of spots.entries()) addBand(rt, C, s.x, s.z, mix[i % mix.length], 'watch', Math.atan2(ctr.x - s.x, ctr.z - s.z));
    for (const s of plan?.watch || []) addBand(rt, C, s.x, s.z, s.kinds, 'watch',
      Math.atan2(ctr.x - s.x, ctr.z - s.z), s.route, s.routeEnd);
    // 2) 家・寺に籠もる人。戦や火が来ると飛び出して逃げる（山の寺は谷へ下る）。
    let sites = SOLIDS.filter((s) => s.civilianSite);
    // 印の無い寺・町（比叡山・長島・本能寺など）は、四角い建物の当たりを家・堂と見る（細長い塀・柵は外す）。
    if (sites.length < 3 && (mtn || town)) sites = SOLIDS.filter((s) => s.k === 'r' && !s.yTop && Math.min(s.hw, s.hd) > 1.8 && s.hw * s.hd < 160);
    sites.sort((a, b) => Math.hypot(a.x - ctr.x, a.z - ctr.z) - Math.hypot(b.x - ctr.x, b.z - ctr.z));
    const maxSites = mtn ? 7 : town ? 6 : 3;
    let used = 0;
    for (const s of sites) {
      if (used >= maxSites || C.agents.length >= CAP) break;
      if (C.bands.some((g) => Math.hypot(g.home.x - s.x, g.home.z - s.z) < 14)) continue;
      // 戸口の前（建物の正面から外へ）。塞がっていれば裏口。
      let x = s.x + s.s * (s.hd + 1.6), z = s.z + s.c * (s.hd + 1.6);
      if (!lightOpen(rt, x, z)) { x = s.x - s.s * (s.hd + 1.6); z = s.z - s.c * (s.hd + 1.6); if (!lightOpen(rt, x, z)) continue; }
      const kinds = s.civilianSite === 'temple' || !s.civilianSite && mtn ? (mtn ? ['monk', 'monk', 'woman', 'child', 'elder'] : ['monk', 'monk', 'farmer'])
        : (used % 2 ? ['woman', 'child', 'elder', 'farmer'] : ['farmer', 'woman', 'child']);
      addBand(rt, C, x, z, kinds, 'inside', Math.atan2(x - s.x, z - s.z), plan?.siteRoute);
      used++;
    }
  }
  if (!C.agents.length) { rt.warCrowd = null; return; }
  if (!LGEO) { LGEO = personGeo(); LMAT = tintMat(); }
  const im = new THREE.InstancedMesh(LGEO, LMAT, C.agents.length);
  im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
  for (const [i, a] of C.agents.entries()) im.setColorAt(i, a.col);
  rt.scene.add(im);
  C.im = im; C.m4 = new THREE.Matrix4(); C.q = new THREE.Quaternion(); C.e = new THREE.Euler(); C.p = new THREE.Vector3(); C.sv = new THREE.Vector3();
  C.zero = new THREE.Matrix4().makeScale(0, 0, 0); C.wp = { x: 0, z: 0 };
  // 兵とは別の描画専用の民にも、同じ大きさの柔らかな接点を一束で残す。
  if (rt.world.def.contactShadows) {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x211b16, transparent: true, opacity: 0.48,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    mat.onBeforeCompile = sh => {
      sh.vertexShader = 'varying vec2 vCivilFoot;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvCivilFoot = uv * 2.0 - 1.0;');
      sh.fragmentShader = 'varying vec2 vCivilFoot;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float bodyContact = (1.0 - smoothstep(0.05, 1.0, length(vCivilFoot))) * 0.45;
        vec2 feet = vec2(abs(vCivilFoot.x) - 0.3, vCivilFoot.y);
        float soleContact = 1.0 - smoothstep(0.08, 0.52, length(feet * vec2(1.3, 1.0)));
        diffuseColor.a *= max(bodyContact, soleContact);`);
    };
    mat.customProgramCacheKey = () => 'civilian-foot-contact';
    C.shade = new THREE.InstancedMesh(geo, mat, C.agents.length);
    C.shade.frustumCulled = false; rt.scene.add(C.shade);
    C.shadeClock = 0;
  }
  // 近くで本物の形に入れ替える数人（使い回す。毎コマ作らない）。
  for (const kind of rt.def.civilianCrowd?.modelKinds ?? rt.def.civilianCrowd?.nearKinds ?? POOL) {
    const col = CROWD[kind][0], monk = kind === 'monk', u = {};
    const mesh = buildModel(u, {
      sohei: 1, soheiV: 9, kosode: !monk, monk: monk ? 1 : 0, tier: 0,
      cloth: col, kesa: monk ? 0x7a6547 : col, armor: col, lace: col, skin: kind === 'child' ? 0xb09070 : 0xa88868,
      hat: 'none', kato: 0, kote: 0, sode: false, saya: false, flag: null, weapon: 'none',
    });
    if (kind === 'child') mesh.scale.setScalar(0.64);
    mesh.userData.noFreeze = true; mesh.userData.civilian = CROWD_NAMES[kind];
    mesh.visible = false; rt.scene.add(mesh);
    C.pool.push({ kind, u, mesh, a: null });
  }
}

function startFlee(rt, C, g, from, x = g.home.x, z = g.home.z, alarmAt = rt.t) {
  g.state = 'flee'; g.from.x = from.x; g.from.z = from.z; g.calm = 0; g.threat = from;
  g.fledAt = alarmAt;
  for (const a of g.agents) { a.out = true; a.ran = 0; a.wpT = rnd() * 0.3; }
  // 町外れへ見物場所をずらした組も、今いる道端から悲鳴を上げる。
  const cam = rt.camera.position, d = Math.hypot(cam.x - x, cam.z - z);
  if (d < 90 && rt.t - C.screamT > 6) {
    C.screamT = rt.t;
    const v = Math.max(0.15, 1 - d / 90);
    sfx('himei', v);
    rt.after?.(0.5 + rnd() * 0.4, () => { if (!rt.over) sfx('himei', v * 0.7); });
    if (!C.barked && d < 60 && !rt.over) { C.barked = true; rt.bark?.(g.mode === 'inside' ? '悲鳴。家の者が逃げ出していく' : '悲鳴。見物の者が逃げていく'); }
  }
}

function dangerNear(rt, x, z, rFight, rWalk, rFire, eye = 1.4) {
  if (!rt.def.civilianCrowd?.individualDanger) return dangerNearDefault(rt, x, z, rFight, rWalk, rFire, eye === true);
  // 土地ごとに決めた見物の間合いを、逃走・合流の判定にもそろえる。
  // 家の中に籠もる人の判定（十二メートル）は変えない。
  const watching = rWalk === 14;
  // 見物場所を選ぶ時も逃走中も、戦ごとの乱戦への警戒距離を使う。
  if (watching) rFight = rt.def.civilianCrowd?.fightingNoticeDistance ?? rFight;
  if (watching) rWalk = rt.def.civilianCrowd?.soldierNoticeDistance ?? rWalk;
  const mountedNotice = watching ? (rt.def.civilianCrowd?.mountedNoticeDistance ?? rWalk) : rWalk;
  let best = distantTroopNear(rt, x, z, rWalk, null, mountedNotice, null, watching ? eye : null), bd = best ? Math.hypot(best.x - x, best.z - z) : 1e9;
  for (const u of rt.army.units) {
    if (!soldier(u, rt)) continue;
    // 墨俣の見物・逃走・家族待ちで共通に使う。家に籠もる人や他の戦は従来の間合い。
    const notice = watching && u.mounted ? Math.max(rWalk, rt.def.civilianCrowd?.mountedNoticeDistance ?? rWalk) : rWalk;
    const dx = u.pos.x - x, dz = u.pos.z - z;
    const reach = Math.max(rFight, notice);
    if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
    const d = Math.hypot(dx, dz), hot = civilianCombatActive(rt, u) || u.target?.alive;
    // 村から姿が見えなくても、実際に槍や刀を振るう音は届く。
    // 敵を狙っているだけの兵は、家越しの斬り合いとして扱わない。
    const heardFight = watching && civilianCombatActive(rt, u)
      && d < (rt.def.civilianCrowd?.fightingHearingDistance ?? 0);
    // 墨俣では家並みの陰を走る馬にも蹄の音で気付く。止まった馬は見通しで判断する。
    // 子や年寄りの警戒、避難中と家族待ちも、同じ探索と間合いを使う。
    const heardHorse = watching && u.mounted && u.moving > 0.1
      && d < (rt.def.civilianCrowd?.mountedHearingDistance ?? 0);
    if ((hot && d < rFight || d < notice) && d < bd
      && (!watching || heardFight || heardHorse || dangerVisible(rt, x, z, u.pos, d, eye, u.mounted ? 2.2 : 1.4))) { bd = d; best = u.pos; }
  }
  for (const f of rt.world.fires || []) if (f.lit !== false && f.size >= (rt.def.civilianCrowd?.fireSize ?? 2)) {
    const d = Math.hypot(f.x - x, f.z - z);
    if (d < civilianFireRadius(rt, f, rFire) && d < bd
      && (!watching || dangerVisible(rt, x, z, f, d, eye, civilianFireEye(rt, f)))) { bd = d; best = f; }
  }
  return best;
}

function dangerNearDefault(rt, x, z, rFight, rWalk, rFire, watchFire = false) {
  let best = null, bd = 1e9;
  const heightGap = rt.def.civilianCrowd?.soldierHeightClearance;
  const ground = heightGap == null ? 0 : rt.world.heightAt(x, z);
  for (const u of rt.army.units) {
    if (!soldier(u, rt)) continue;
    const dx = u.pos.x - x, dz = u.pos.z - z;
    if (Math.abs(dx) > rFight || Math.abs(dz) > rFight) continue;
    // 平面上で近いだけの山上の兵には驚かず、同じ高さへ下りてきた兵から逃げる。
    if (heightGap != null && Math.abs(u.pos.y - ground) > heightGap) continue;
    const d = Math.hypot(dx, dz), hot = u.atk || u.swing || u.target?.alive
      || rt.def.civilianCrowd?.rememberSoldierCombat && rt.t < u.civilianCombatUntil
      || rt.def.civilianCrowd?.watchPlayerCombat && u === rt.player?.u && rt.t < rt.warCrowd.playerAttackUntil;
    if ((hot && d < rFight || d < rWalk) && d < bd) { bd = d; best = u.pos; }
  }
  if (rt.def.civilianCrowd?.avoidLightArmies) for (const b of rt.butai || []) {
    const d = lightArmyDistance(b, x, z), hot = rt.t - b._clashAt < 3;
    if (heightGap != null && d < rFight && Math.abs(rt.world.heightAt(b.pos.x, b.pos.z) - ground) > heightGap) continue;
    if ((d < rWalk || hot && d < rFight) && d < bd) { bd = d; best = b.pos; }
  }
  if (rt.def.civilianCrowd?.avoidClashes) for (const c of rt.world.clashes || []) {
    const d = clashDistance(c, x, z), r = c.phase === 'fight' ? rFight : rWalk;
    if (heightGap != null && d < r && Math.abs(rt.world.heightAt(c.x, c.z) - ground) > heightGap) continue;
    if (d < r && d < bd) { bd = d; best = c; }
  }
  const alarm = watchFire && rt.def.civilianCrowd?.fireAlarm;
  for (const f of rt.world.fires || []) if (f.lit !== false && f.size >= (rt.def.civilianCrowd?.fireSize ?? 2)) {
    // 大火は遠くからも察知する。足元の通行判定には広い警戒範囲を使わない。
    const radius = alarm && f.size >= alarm.size ? Math.max(rFire, alarm.radius) : rFire;
    const d = Math.hypot(f.x - x, f.z - z);
    if (d < radius && d < bd) { bd = d; best = f; }
  }
  return best;
}

function crowdExitClear(rt, g, end) {
  if (dangerNear(rt, end.x, end.z, 40, 14, 26)) return false;
  const last = g.route.length - 1, corner = g.route[last - 1];
  // まだ最後の角へ来ていない家族には角からの道も必要。
  // 全員が通り過ぎた角の後ろに火が来ても、前へ逃げる道まで塞がない。
  if (!rt.def.civilianCrowd?.checkRouteExitApproach || g.agents.some((a) => a.out && a.routeIndex < last)) {
    if (!pathClear(rt, corner, end, true) || nearSoldier(rt, end.x, end.z, 12, corner)) return false;
  }
  for (const a of g.agents) {
    if (!a.out || a.routeIndex < last) continue;
    if (!pathClear(rt, a, end, true) || nearSoldier(rt, end.x, end.z, 12, a)) return false;
  }
  return true;
}

function redirectCrowdExit(rt, g) {
  if (!g.exitOptions || g.state !== 'flee') return;
  const last = g.route.length - 1, end = g.route[last];
  // 退き口そのものが静かでも、途中を兵や火が塞いだら同じ南端の脇道へ。
  if (rt.def.civilianCrowd?.checkRouteExitApproach ? crowdExitClear(rt, g, end)
    : !dangerNear(rt, end.x, end.z, 40, 14, 26)) return;
  for (const next of g.exitOptions) {
    if (next === end || !crowdExitClear(rt, g, next)) continue;
    g.route[last] = next;
    for (const a of g.agents) if (a.out && a.routeIndex >= last) {
      a.routeIndex = last; a.wpT = 0; a.safeT = 0;
    }
    return;
  }
}

// 道を逃げる隣人の声でも戸口から退く。既に逃げている組同士で警戒を更新し合わない。
function fleeingNeighbor(rt, C, g) {
  const radius = rt.def.civilianCrowd?.neighborAlarmRadius;
  if (!radius || g.state === 'flee') return null;
  const heightGap = rt.def.civilianCrowd?.soldierHeightClearance;
  for (const b of C.agents) {
    if (b.g === g || !b.out || b.g.state !== 'flee') continue;
    for (const a of g.agents) {
      if (Math.hypot(a.x - b.x, a.z - b.z) >= radius) continue;
      // 頭上の曲輪や別の尾根から、麓の家々へ直接知らせを飛ばさない。
      if (heightGap != null && Math.abs(rt.world.heightAt(a.x, a.z) - rt.world.heightAt(b.x, b.z)) > heightGap) continue;
      // 隣人そのものを脅威にせず、その人が逃げてきた兵や火の側から離れる。
      return b.g.threat || b.g.from;
    }
  }
  return null;
}

function crowdScan(rt, C) {
  for (const g of C.bands) {
    if (g.state === 'gone') continue;
    redirectCrowdExit(rt, g);
    const inside = g.state === 'inside';
    let cx = 0, cz = 0, count = 0;
    for (const a of g.agents) {
      // 南の退き口を抜けた人は数えず、まだ道にいる人の周りを警戒する。
      // 戸口で籠もる家族は非表示でも、兵や火が迫れば全員を逃がす。
      if (!inside && !a.out) continue;
      cx += a.x; cz += a.z; count++;
    }
    if (!count) continue;
    cx /= count; cz /= count;
    let dn = null, alarmAt = rt.t;
    if (rt.def.civilianCrowd?.individualDanger) {
      // 組の中心が安全でも、端の子や遅れた年寄りへ危険が迫れば組で逃げる。
      // 逃げ切った人の位置は見張りに使わない。座標はその場で使い、毎回作らない。
      let closest = Infinity;
      for (const a of g.agents) {
        if (!a.out && !inside) continue;
        const threat = dangerNear(rt, a.x, a.z, inside ? 34 : 40, inside ? 12 : 14, inside ? 26 : 22, civilianEye(a.kind));
        if (!threat) continue;
        const d = Math.hypot(threat.x - a.x, threat.z - a.z);
        if (d >= closest) continue;
        closest = d;
        // 遠い旗列の判定が返す共有座標は、次の人の探索より前に写す。
        g.from.x = threat.x; g.from.z = threat.z; dn = g.from;
      }
    } else dn = dangerNear(rt, cx, cz, inside ? 34 : 40, inside ? 12 : 14, inside ? 26 : 22, true);
    // 本人へ迫る前でも、見えている退路が塞がり始めたら家族で退く。
    if (!dn && rt.def.civilianCrowd?.scanIndividuals) for (const a of g.agents) {
      if (!a.out && !inside) continue;
      dn = dangerNear(rt, a.x, a.z, inside ? 34 : 40, inside ? 12 : 14, inside ? 26 : 22, true);
      if (dn) break;
    }
    if (!dn) dn = fleeingNeighbor(rt, C, g);
    if (!dn) dn = watchRouteDanger(rt, g);
    // 家族や退路へ迫る危険を覚える。隣の組の悲鳴だけでは駆け足を続けさせない。
    g.danger = !!dn;
    // 同じ在所の近くの民が逃げ始めたら、遠巻きの見物も切り上げる。
    // 逃げ続けている人から古い警戒を広げず、家の中の人や他の戦には使わない。
    const alarmDistance = rt.def.civilianCrowd?.neighborAlarmDistance;
    if (!dn && g.state === 'watch' && alarmDistance) {
      const duration = rt.def.civilianCrowd.neighborAlarmDuration ?? 3;
      for (const other of C.bands) {
        if (other === g || other.state !== 'flee' || rt.t - other.fledAt >= duration) continue;
        let near = false;
        for (const a of g.agents) {
          if (!a.out) continue;
          // 家や土手の陰でも、近い悲鳴は聞こえる。遠くの組は姿が見える時だけ気付く。
          // 音の届く間合いは兵と火への警戒とそろえ、合図の連鎖は元の時間内に限る。
          for (const b of other.agents) {
            if (!b.out) continue;
            const distance = Math.hypot(a.x - b.x, a.z - b.z);
            if (distance < alarmDistance && (distance <= (rt.def.civilianCrowd?.noticeHearingDistance ?? 0)
              || civilianSightClear(rt, a, b, civilianEye(a.kind), civilianEye(b.kind)) && (!rt.def.civilianCrowd?.watchTerrainSight
                || terrainSightClear(rt, a.x, a.z, civilianEye(a.kind), b.x, b.z, civilianEye(b.kind))))) { near = true; break; }
          }
          if (near) break;
        }
        // 悲鳴を聞いた組から次の組へ伝わっても、最初の合図の時刻を保つ。
        // 毎回時刻を更新すると、三秒の合図が在所の遠くまで連鎖し続ける。
        if (near) { dn = other.from; alarmAt = other.fledAt; break; }
      }
    }
    if (dn) { if (g.state !== 'flee') startFlee(rt, C, g, dn, cx, cz, alarmAt); else { g.from.x = dn.x; g.from.z = dn.z; g.threat = dn; } g.calm = 0; continue; }
    if (g.route && rt.def.civilianCrowd?.followRouteWhenCalm) g.threat = null;
    if (g.state === 'flee' && !g.route && ++g.calm > 6 && g.agents.every((a) => !a.out || a.ran > 22)) {
      // 十分離れて静かになれば、立ち止まって振り返る（また見物する）。
      g.state = 'watch';
      for (const a of g.agents) { a.tx = a.x; a.tz = a.z; a.h = Math.atan2(g.from.x - a.x, g.from.z - a.z) + (rnd() - 0.5) * 0.4; }
    }
  }
}

// 迂回して次の畦へ出た時だけ道標を進める。家・川・兵・火を横切る近道は使わない。
function routePoint(a, route, index) {
  return index === route.length - 1 && a.routeExit ? a.routeExit : route[index];
}

function rejoinEscapeRoute(rt, a, route) {
  const width = rt.def.civilianCrowd?.routeRejoinDistance ?? 1;
  // 兵や火をよけて角の先の畦へ出ることもある。現在の角からの一区間だけで
  // 判定すると、すでに通り過ぎた角へ戻ろうとするため、先の畦から探す。
  for (let index = route.length - 2; index >= a.routeIndex; index--) {
    const p = routePoint(a, route, index), q = routePoint(a, route, index + 1);
    const dx = q.x - p.x, dz = q.z - p.z, length = dx * dx + dz * dz;
    if (!length) continue;
    const ax = a.x - p.x, az = a.z - p.z, t = (ax * dx + az * dz) / length;
    // 次の区間の道幅内へ出ていなければ、元の曲がり角をたどる。
    // 墨俣では家族や兵をよけた畦の脇からも戻れる幅を使う。
    // 道標の先までよけた時も、すぐ近くの終点へ出られるなら古い角へ引き返さない。
    if (t <= 0 || t > 1 && rt.def.civilianCrowd?.routeRejoinDistance == null) continue;
    const along = Math.min(1, t);
    if (Math.hypot(ax - dx * along, az - dz * along) > width) continue;
    // 畦へ戻る線上に家族がいれば、先の道標へ切り替えず元の角から合流する。
    // 足元だけで止めると、前の人を横切る道標を選び直して立ち往生する。
    if (!pathClear(rt, a, q, true) || !escapeDangerClear(rt, a, q)
      || !escapePeopleClear(rt, a, q)) continue;
    a.routeIndex = index + 1;
    return;
  }
}

// 逃げる先を三メートル先に一つ選ぶ。危険から離れ、山では谷へ下る。
function fleeStep(rt, C, a) {
  if (!rt.def.civilianCrowd?.individualEscape) return fleeStepDefault(rt, C, a);
  const g = a.g, w = rt.world;
  const escapeCheck = rt.def.civilianCrowd?.escapeCheckInterval;
  // 組の端にいる本人に近い危険を使う。組の反対側の兵へ背を向け、目の前の火へ走らない。
  const threat = rt.def.civilianCrowd?.individualEscape
    ? dangerNear(rt, a.x, a.z, 40, 14, 22, civilianEye(a.kind)) : null;
  // 遠い旗列の座標は探索で使い回されるため、次の道の判定より前に数値を写す。
  const fromX = threat ? threat.x : g.from.x, fromZ = threat ? threat.z : g.from.z;
  const away = Math.atan2(a.x - fromX, a.z - fromZ), h0 = w.heightAt(a.x, a.z);
  // 遅れた家族へ兵や火が迫る間も、前の人が歩調を落としたり畦で待ったりしない。
  // 警戒は既存の組ごとの見張りを使い、一人ごとの探索を増やさない。
  const familyDanger = rt.def.civilianCrowd?.familyDangerResponse && g.danger;
  a.escapeSpeed = rt.def.civilianCrowd?.sharedEscapePace && !threat && !familyDanger ? g.escapePace : a.spd;
  const route = g.route;
  let fleeExit = false;
  if (route) {
    if (rt.def.civilianCrowd?.rejoinEscapeRoute) rejoinEscapeRoute(rt, a, route);
    while (a.routeIndex < route.length) {
      // 曲がり角は余裕を持って通すが、指定された出口には最後まで歩く。
      const radius = a.routeIndex === route.length - 1 ? (rt.def.civilianCrowd?.routeArrivalRadius ?? 4)
        : (rt.def.civilianCrowd?.routeCornerRadius ?? 4);
      const point = routePoint(a, route, a.routeIndex);
      if (Math.hypot(point.x - a.x, point.z - a.z) >= radius) break;
      a.routeIndex++;
    }
    if (a.routeIndex === route.length) {
      a.tx = a.x; a.tz = a.z;
      if (g.routeEnd === 'wait') {
        // 包囲された輪中などでは、退避の終点で消さずに残す。危険が迫れば再び逃げる。
        if (dangerNear(rt, a.x, a.z, 12, 8, 10)) g.route = null;
        else if (g.agents.every((b) => b.routeIndex === route.length)) { g.route = null; g.state = 'watch'; }
      } else if (rt.def.civilianCrowd?.keepFamiliesTogether) {
        // 外周でも遅れた子や年寄りを待ち、同じ組がそろって戦場を離れる。
        if (threat || familyDanger) {
          // 墨俣の出口でも、遅れた家族へ兵や火が迫る間は待たず道を空ける。
          // 最後の道標を残し、安全になってから出口へ戻って合流する。
          a.routeIndex = route.length - 1;
          fleeExit = true;
        } else if (g.agents.every((b) => b.routeIndex === route.length)
          && g.agents.every((b) => !dangerNear(rt, b.x, b.z, 40, 14, 22, civilianEye(b.kind)))) {
          // 全員が着いても、組の端へ兵や火が迫っていれば姿を消さない。
          for (const b of g.agents) b.out = false;
          g.state = 'gone';
        } else {
          // 村外れの出口では、逃げた向きのまま立たず遅れた家族を振り返る。
          // 姿の出ている未到着の人から近い一人を選び、座標や形は増やさない。
          let waitingFor = null, closest = Infinity;
          for (const b of g.agents) {
            if (b === a || !b.out || b.routeIndex === route.length) continue;
            const distance = Math.hypot(b.x - a.x, b.z - a.z);
            if (distance < closest) { waitingFor = b; closest = distance; }
          }
          if (waitingFor) a.h = Math.atan2(waitingFor.x - a.x, waitingFor.z - a.z);
        }
      } else { a.out = false; if (g.agents.every((b) => !b.out)) g.state = 'gone'; }
      if (a.routeIndex === route.length) return;
    }
  }
  const goal = fleeExit || !route ? null : routePoint(a, route, a.routeIndex), heading = goal ? Math.atan2(goal.x - a.x, goal.z - a.z) : away;
  if (goal && !threat && !familyDanger && rt.def.civilianCrowd?.keepFamiliesTogether) {
    // 出口の立ち位置は一人ずつ違う。先後は共通の道標から測り、
    // 左右へ離れた家族が互いを「後ろ」と見て待ち続けないようにする。
    const familyGoal = route[a.routeIndex];
    const remaining = Math.hypot(familyGoal.x - a.x, familyGoal.z - a.z);
    for (const b of g.agents) {
      if (b === a || !b.out || Math.hypot(b.x - a.x, b.z - a.z) < 6) continue;
      // 曲がり角を先に抜けた大人は、後ろの人を待つ。危険の間近では足を止めない。
      if (b.routeIndex < a.routeIndex || b.routeIndex === a.routeIndex
        && Math.hypot(familyGoal.x - b.x, familyGoal.z - b.z) > remaining) {
        a.tx = a.x; a.tz = a.z;
        // 畦の角でも、待っている子や年寄りの方へ体を向ける。
        a.h = Math.atan2(b.x - a.x, b.z - a.z);
        return;
      }
    }
  }
  const fromD = Math.hypot(a.x - fromX, a.z - fromZ);
  // 外周の出口へ近づいたら歩幅を詰め、地面の外の三メートル先を探して立ち往生しない。
  const step = goal ? Math.min(3, Math.hypot(goal.x - a.x, goal.z - a.z)) : 3;
  let bx = a.x, bz = a.z, bs = -1e9;
  // 家の角や細い畦では三メートル先が塞がっていても、短い歩幅なら曲がれる。
  // 墨俣で指定した時だけ段階的に詰める。安全な候補があれば長い歩幅を使う。
  const attempts = rt.def.civilianCrowd?.shortEscapeSteps ? 4 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const stride = step / (attempt === 0 ? 1 : attempt === 1 ? 2 : 5);
    // 墨俣の畦で前と左右が塞がれた時だけ、短い一歩で後ろ側も探す。
    // 三段階で通れれば増やさず、家・水路・兵・火の判定は同じものを使う。
    const around = attempt === 3, directions = around ? 18 : 9;
    for (let i = 0; i < (goal && !around ? directions * 2 : directions); i++) {
      // 避難路が危険なら、まず危険から離れてから道へ戻る。
      if (i === directions && bs > -1e9) break;
      const j = i % directions, turn = around && j === 17 ? Math.PI
        : j === 0 ? 0 : Math.ceil(j / 2) * 0.35 * (j % 2 ? 1 : -1);
      const h = (i < directions ? heading : away) + turn + (rnd() - 0.5) * 0.2, x = a.x + Math.sin(h) * stride, z = a.z + Math.cos(h) * stride;
      // 塀・柵・建物の角を抜けない（途中の一点と塀の当たりも見る）。
      if (!lightOpen(rt, x, z) || !lightOpen(rt, (a.x + x) / 2, (a.z + z) / 2)) continue;
      C.wp.x = x; C.wp.z = z;
      if (rt.army.wallBetween(a, -1, C.wp)) continue;
      if (!escapePeopleClear(rt, a, C.wp)) continue;
      // 指定路でも水路・急な岸・兵・火を横切らない。途中も細かく調べる。
      if ((goal || escapeCheck) && (!pathClear(rt, a, C.wp, true)
        || (escapeCheck ? !escapeDangerClear(rt, a, C.wp) : nearSoldier(rt, x, z, 12)))) continue;
      const dy = w.heightAt(x, z) - h0;
      if (Math.abs(dy) > 2.2) continue;
      // 今も迫る兵や火からは離れる。退いた兵や消えた火の跡で畦への復帰を止めない。
      if (goal && ((!escapeCheck || threat) && fromD < 40 && Math.hypot(x - fromX, z - fromZ) < fromD - 0.2
        || !escapeCheck && dangerNear(rt, x, z, 12, 8, 10))) continue;
      const s = Math.cos(turn) * 2 + (goal && (!escapeCheck || threat) ? Math.cos(h - away) : 0) - (C.mtn ? dy * 1.2 : Math.abs(dy) * 0.3);
      if (s > bs) { bs = s; bx = x; bz = z; }
    }
    if (bs > -1e9) break;
  }
  a.tx = bx; a.tz = bz;
}

// 他の戦は、町・寺の生活道と備の外縁を使う既存の退き方を保つ。
function fleeStepDefault(rt, C, a) {
  const g = a.g, w = rt.world;
  const away = Math.atan2(a.x - g.from.x, a.z - g.from.z), h0 = w.heightAt(a.x, a.z);
  const route = g.route;
  if (route) {
    const familyGap = rt.def.civilianCrowd?.familyWaitDistance;
    let finalArrival = 4;
    if (familyGap) for (const b of g.agents) {
      if (b.kind === 'child' || b.kind === 'elder') { finalArrival = Math.min(4, familyGap / 2); break; }
    }
    while (a.routeIndex < route.length) {
      const p = route[a.routeIndex], d = Math.hypot(p.x - a.x, p.z - a.z);
      // 危険な角へ近づくまで待つと、十歩を空ける火の手前で永遠に足踏みする。
      // 稲葉山では既存の次の道へ安全に合流できる時だけ、手前から回り込む。
      if (rt.def.civilianCrowd?.bypassUnsafeRouteCorner && crowdBypassCorner(rt, a, route)) {
        a.routeIndex++; continue;
      }
      const corners = rt.def.civilianCrowd?.passRouteCorners;
      // 最後の角も四歩手前で着いた扱いにすると、家族が最大八歩離れたまま消える。
      // 稲葉山の南の退き口では、全員が待ち合わせの半径内へ寄ってから退避を終える。
      // 途中の路地の曲がり方は保ち、終点だけ家族の待ち合わせ幅に合わせる。
      const arrival = a.routeIndex === route.length - 1 ? finalArrival : 4;
      if (d >= arrival && !(corners && crowdCornerPassed(w, a, route))) break;
      // 南の退き口は近いだけで到着にしない。川岸・塀の反対側や、
      // 兵・火で塞がれた道の手前から消えず、歩いて抜けられる側まで逃がす。
      if (a.routeIndex === route.length - 1 && rt.def.civilianCrowd?.safeRouteExit
        && (!pathClear(rt, a, p, true) || nearSoldier(rt, p.x, p.z, 12, a))) break;
      if (corners && d > 0.3 && !crowdCornerClear(rt, C, a, route)) break;
      a.routeIndex++;
    }
    // 南の退き口に兵や火が来た時は、そこへ着いただけで退避済みにしない。
    // 最後の道を保ち、同じ地形・危険の判定で安全な脇へ逃がす。
    if (a.routeIndex === route.length && rt.def.civilianCrowd?.safeRouteExit
      && !crowdArrivalSafe(rt, a, route[route.length - 1])) a.routeIndex--;
    if (familyWaiting(rt, a, route)) { a.tx = a.x; a.tz = a.z; return; }
    if (a.routeIndex === route.length) {
      a.tx = a.x; a.tz = a.z;
      if (g.routeEnd === 'wait') {
        // 包囲された輪中などでは、退避の終点で消さずに残す。危険が迫れば再び逃げる。
        if (dangerNear(rt, a.x, a.z, 12, 8, 10)) g.route = null;
        else if (g.agents.every((b) => b.routeIndex === route.length)) { g.route = null; g.state = 'watch'; }
      } else {
        // 先着した者だけ消さず、家族全員が南の退き口へ着くまで道端で待つ。
        // 各人の歩行更新には間隔があるため、到着済みの家族へ新たに迫った兵・火もここで見る。
        if (familyGap) {
          const safe = g.agents.every((b) => !b.out || b.routeIndex === route.length
            && (!rt.def.civilianCrowd?.safeRouteExit || crowdArrivalSafe(rt, b, route[route.length - 1])));
          if (!safe) return;
          for (const b of g.agents) b.out = false;
        } else a.out = false;
        if (g.agents.every((b) => !b.out)) g.state = 'gone';
      }
      return;
    }
  }
  const goal = route?.[a.routeIndex], heading = goal ? Math.atan2(goal.x - a.x, goal.z - a.z) : away;
  const routeOnly = goal && rt.def.civilianCrowd?.followRouteWhenCalm && !g.threat;
  // 見回りで覚えた備を参照し、道の候補でも中心ではなく列の外縁から測る。
  let fromArmy = null;
  if (rt.def.civilianCrowd?.avoidLightArmies) for (const b of rt.butai || []) {
    if (b.pos === g.threat) { fromArmy = b; break; }
  }
  const fromD = routeOnly ? Infinity : fromArmy ? lightArmyDistance(fromArmy, a.x, a.z) : Math.hypot(a.x - g.from.x, a.z - g.from.z);
  let bx = a.x, bz = a.z, bs = -1e9;
  const detour = goal && rt.def.civilianCrowd?.allowSafeRouteDetour;
  // 町・寺・村の狭い角へ近づく時は、残りの道より長い一歩で角を越えない。
  // 次の路地が塀で見通せない時も角まで寄ってから曲がれる。危険から退く候補と
  // 最後の退き口は三歩を保ち、火や兵に追われた時に終点へ縛り付けない。
  const cornerStep = goal && a.routeIndex < route.length - 1 && rt.def.civilianCrowd?.checkFullEscapeCorner
    ? Math.min(3, Math.hypot(goal.x - a.x, goal.z - a.z)) : 3;
  for (let i = 0; i < (goal ? detour ? 27 : 18 : 9); i++) {
    // 避難路が危険なら、まず危険から離れてから道へ戻る。
    if ((i === 9 || i === 18) && bs > -1e9) break;
    const j = i % 9, turn = j === 0 ? 0 : Math.ceil(j / 2) * 0.35 * (j % 2 ? 1 : -1);
    const stride = i < 9 || i >= 18 ? cornerStep : 3;
    const h = (i < 9 || i >= 18 || routeOnly ? heading : away) + turn + (rnd() - 0.5) * 0.2, x = a.x + Math.sin(h) * stride, z = a.z + Math.cos(h) * stride;
    // 塀・柵・建物の角を抜けない（途中の一点と塀の当たりも見る）。
    if (!lightOpen(rt, x, z) || !lightOpen(rt, (a.x + x) / 2, (a.z + z) / 2)) continue;
    C.wp.x = x; C.wp.z = z;
    if (rt.army.wallBetween(a, -1, C.wp)) continue;
    // 指定路でも水路・急な岸・兵・火を横切らない。途中も細かく調べる。
    if (goal && (!pathClear(rt, a, C.wp, true) || nearSoldier(rt, x, z, 12, a))) continue;
    const dy = w.heightAt(x, z) - h0;
    if (Math.abs(dy) > 2.2) continue;
    // 道を優先しても、近い兵や火へ向かう曲がり角は選ばない。
    if (goal) {
      // 路地の折れが危険の側へ向くこともある。通常の退き方が全て塞がれた時だけ
      // 距離が縮む脇道を許す。家・水・全ての兵と火の判定は省かない。
      const nextD = fromArmy ? lightArmyDistance(fromArmy, x, z) : Math.hypot(x - g.from.x, z - g.from.z);
      if (i < 18 && fromD < 40 && nextD < fromD - 0.2) continue;
      const danger = dangerNear(rt, x, z, 12, 8, 10);
      // 火・乱戦・兵から退く一歩は通す。ほかの兵への接近は上の nearSoldier で拒む。
      if (danger) {
        let armyDanger = false, escapingArmy = false;
        if (rt.def.civilianCrowd?.avoidLightArmies) for (const b of rt.butai || []) {
          if (b.pos !== danger) continue;
          armyDanger = true;
          // 長い備の脇では、中心へ近づいても列の外縁からは離れられる。
          // 佐久間勢などを避ける民を、中心だけの判定で町外れに足止めしない。
          escapingArmy = lightArmyDistance(b, a.x, a.z) < 12
            && !formationBlocks(b, lightArmyDistance, b.pos, x, z, 12, a, true);
          break;
        }
        const escapingFire = (w.fires || []).includes(danger) && Math.hypot(a.x - danger.x, a.z - danger.z) < 10 && leavesFire(a, C.wp, danger);
        const escapingClash = rt.def.civilianCrowd?.avoidClashes && (w.clashes || []).includes(danger)
          // 乱戦の外縁から離れる一歩を、中心との距離でもう一度塞がない。
          // 途中で列へ寄る道は、兵の回避と同じ判定で止める。
          && clashDistance(danger, a.x, a.z) < 12
          && !formationBlocks(danger, clashDistance, danger, x, z, 12, a, true);
        const escapingSoldier = rt.def.civilianCrowd?.retreatFromSoldiers
          && !armyDanger
          && !(w.fires || []).includes(danger) && !(w.clashes || []).includes(danger)
          && leavesFire(a, C.wp, danger);
        if (!escapingArmy && !escapingFire && !escapingClash && !escapingSoldier) continue;
      }
    }
    const space = rt.def.civilianCrowd?.keepCivilianSpacing ? crowdStride(C, a, x, z, stride) : stride;
    // 退き口で待つ家族や合流した民に塞がれた向きを、歩ける候補に数えない。
    // 全て塞がれた時は危険から離れる向き・脇道の探索へ進め、後ろの家族を足止めしない。
    if (space <= 0.05) continue;
    const s = Math.cos(turn) * 2 + (goal ? Math.cos(h - (routeOnly ? heading : away)) : 0) - (C.mtn ? dy * 1.2 : Math.abs(dy) * 0.3)
      - (stride - space) * 2;
    if (s > bs) { bs = s; bx = x; bz = z; }
  }
  a.tx = bx; a.tz = bz;
}

// 見回りは〇・八秒ごとだが、発砲の火は〇・四五秒で消える。
// 直前の戦いを兵本人に覚え、町・寺・里の警戒と家族の待ち合わせで共用する。
function rememberSoldierCombat(rt) {
  if (rt.over && !rt.def.civilianCrowd?.evacuateAfterBattle || !rt.def.civilianCrowd?.rememberSoldierCombat) return;
  for (const u of rt.army.units) {
    if (soldier(u, rt) && (u.atk || u.swing || u.fireT > 0)) u.civilianCombatUntil = rt.t + 1.2;
  }
}

function crowdGround(rt, x, z) {
  const height = rt.def.civilianCrowd?.drawHeight;
  return height ? height(rt.world, x, z) : rt.world.heightAt(x, z);
}

function crowdTick(rt, dt) {
  const C = rt.warCrowd;
  if (!C) return;
  // 終幕でも火と民の道が残る戦では、兵の決着とは別に警戒と避難を続ける。
  const evacuating = !rt.over || rt.def.civilianCrowd?.evacuateAfterBattle;
  rememberSoldierCombat(rt);
  // 主人公の近接・弓・鉄砲は別の状態を使う。発砲の火は見回りより短く、
  // 直後に狙いを下ろしても見落とさないよう、次の見回りまで危険を覚える。
  // 逃走中の家族も同じ記録を使い、撃ち手のそばで待ち止まらない。
  const player = rt.player, playerUnit = player?.u;
  if (evacuating && rt.def.civilianCrowd?.watchPlayerCombat && playerUnit?.alive
    && (playerUnit.pAtk || playerUnit.atk || playerUnit.swing || playerUnit.fireT > 0 || player.shot)) C.playerAttackUntil = rt.t + 1.2;
  C.scan -= dt;
  if (evacuating && C.scan <= 0) { C.scan = rt.def.civilianCrowd?.dangerCheckInterval ?? 0.8; crowdScan(rt, C); }
  const cam = rt.camera.position, still = S.reduceMotion, half = rt.world.half;
  // 近い人を本物の形へ（0.3 秒ごと）。
  C.poolT -= dt;
  if (C.poolT <= 0) {
    C.poolT = 0.3;
    for (const P of C.pool) if (P.a && (!P.a.out || Math.hypot(P.a.x - cam.x, P.a.z - cam.z) > NEAR + 4)) { P.a.model = null; P.a = null; P.mesh.visible = false; }
    for (const a of C.agents) {
      if (a.model || !a.out || Math.hypot(a.x - cam.x, a.z - cam.z) > NEAR) continue;
      const P = C.pool.find((p) => !p.a && p.kind === a.kind) || (!rt.def.civilianCrowd?.strictNearKinds
        && (a.kind === 'merchant' || a.kind === 'townsman' || a.kind === 'elder') ? C.pool.find((p) => !p.a && p.kind === 'farmer') : null);
      if (P) {
        P.a = a; a.model = P;
        // 遠景と同じ体格を使い、近づいた年寄りや子の背丈を変えない。
        P.mesh.scale.setScalar(a.sc); P.mesh.visible = true;
      }
    }
  }
  const im = C.im;
  C.shadeClock -= dt;
  const shadeUpdate = C.shade && C.shadeClock <= 0;
  if (shadeUpdate) C.shadeClock = 0.25;
  const naturalGait = rt.def.civilianCrowd?.naturalEscapeGait;
  for (const [i, a] of C.agents.entries()) {
    const g = a.g;
    let moving = false, travelled = 0;
    if (evacuating && g.state === 'flee' && a.out) {
      a.wpT -= dt;
      // 選んだ一歩を歩く間にも兵や火は動く。指定路のある戦だけ、短い間隔で残りの道を見直す。
      // 曲がる候補の総当たりは危険になった時だけ。共用の座標を使い、毎コマ物を作らない。
      if (g.route && rt.def.civilianCrowd?.recheckEscapeStep) {
        a.safeT -= dt;
        if (a.safeT <= 0) {
          a.safeT = 0.2;
          if (a.wpT > 0 && Math.hypot(a.tx - a.x, a.tz - a.z) > 0.05) {
            C.wp.x = a.tx; C.wp.z = a.tz;
            if (!pathClear(rt, a, C.wp, true) || nearSoldier(rt, a.tx, a.tz, 12, a)) a.wpT = 0;
          }
        }
      }
      if (a.wpT <= 0 || Math.hypot(a.tx - a.x, a.tz - a.z) < 0.3) { a.wpT = rt.def.civilianCrowd?.escapeCheckInterval ?? 0.6; fleeStep(rt, C, a); }
      const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const step = Math.min(d, (a.escapeSpeed ?? a.spd) * dt);
        const st = rt.def.civilianCrowd?.keepCivilianSpacing ? crowdStride(C, a, a.tx, a.tz, step) : step;
        if (st < step) a.wpT = Math.min(a.wpT, 0.15);
        const x = a.x + dx / d * st, z = a.z + dz / d * st;
        // 探索の後で火がついたり道が塞がれても、そのまま踏み込まない。
        C.wp.x = x; C.wp.z = z;
        if (!escapePeopleClear(rt, a, C.wp)
          || rt.def.civilianCrowd?.escapeCheckInterval && (!pathClear(rt, a, C.wp, true) || !escapeDangerClear(rt, a, C.wp))) {
          a.tx = a.x; a.tz = a.z; a.wpT = 0;
        } else {
          a.x = x; a.z = z; a.ran += st; travelled = st; moving = st > 0.001;
          a.h = Math.atan2(dx, dz);
        }
      }
      // 戦場の端まで逃げきったら消える。
      if (!g.route && (Math.abs(a.x) > half - 3 || Math.abs(a.z) > half - 3)) { a.out = false; if (g.agents.every((b) => !b.out)) g.state = 'gone'; }
    } else if (!still) a.idle += dt;
    // 曲がり角や合流直前の短い一歩でも、全速の足踏みをさせない。
    // 子は背丈に合う短い歩幅で刻み、近景と遠景で同じ歩調を使う。
    if (moving && !still) a.ph += naturalGait ? travelled * 3.4 / a.sc : dt * (a.escapeSpeed ?? a.spd) * 3.4;
    const pace = naturalGait ? Math.min(1, travelled / Math.max(dt, 0.0001) / 3) : 1;
    const lean = moving ? naturalGait ? (a.kind === 'elder' ? 0.15 : 0.04) + pace * 0.12 : 0.22
      : a.kind === 'elder' ? 0.15 : 0;
    const P = a.model;
    if (shadeUpdate) {
      const W = rt.world;
      if (!a.out || Math.hypot(a.x - cam.x, a.z - cam.z) > 55 || W.inWaterAt(a.x, a.z)) C.shade.setMatrixAt(i, C.zero);
      else {
        const y = crowdGround(rt, a.x, a.z), span = 0.8 * a.sc;
        const gx = (crowdGround(rt, a.x + 0.3, a.z) - crowdGround(rt, a.x - 0.3, a.z)) / 0.6;
        const gz = (crowdGround(rt, a.x, a.z + 0.3) - crowdGround(rt, a.x, a.z - 0.3)) / 0.6;
        const cs = Math.cos(a.h) * span, sn = Math.sin(a.h) * span;
        if (!Number.isFinite(y + gx + gz) || gx * gx + gz * gz > 4) C.shade.setMatrixAt(i, C.zero);
        else {
          C.m4.set(cs, 0, sn, a.x, gx * cs - gz * sn, 1, gx * sn + gz * cs, y + 0.022,
            -sn, 0, cs, a.z, 0, 0, 0, 1);
          C.shade.setMatrixAt(i, C.m4);
        }
      }
    }
    if (!a.out) {
      im.setMatrixAt(i, C.zero);
      // 逃げ切った近くの人も、その場で隠して使い回しの枠を空ける。
      if (P) { P.mesh.visible = false; P.a = null; a.model = null; }
      continue;
    }
    if (P) im.setMatrixAt(i, C.zero);
    const y = crowdGround(rt, a.x, a.z);
    if (!P) {
      const bob = moving && !still ? Math.abs(Math.sin(a.ph)) * 0.06 * (naturalGait ? a.sc * pace : 1) : 0;
      C.e.set(naturalGait ? lean : moving ? 0.2 : 0, a.h + (!moving && !still ? Math.sin(a.idle * 0.4) * 0.15 : 0), 0);
      C.q.setFromEuler(C.e); C.p.set(a.x, y + bob, a.z); C.sv.setScalar(a.sc);
      C.m4.compose(C.p, C.q, C.sv); im.setMatrixAt(i, C.m4);
      continue;
    }
    const m = P.mesh, u = P.u;
    if (rt.def.civilianCrowd?.consistentModelScale) m.scale.setScalar(a.sc);
    m.position.set(a.x, y, a.z); m.rotation.y = a.h;
    const sw = moving && !still ? Math.sin(a.ph) * (naturalGait ? 0.25 + pace * 0.2 : 0.45) : 0;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.body.rotation.x = lean;
    u.moving = still ? 0 : moving ? 1 : 0;
    poseArms(u, a.ph);
    if (moving) { u.armL.rotation.x = -0.6 + sw * 0.4; u.armR.rotation.x = -0.6 - sw * 0.4; }
    else if (a.kind === 'monk') { u.armL.rotation.x = -0.7; u.armR.rotation.x = -0.7; }  // 合掌
  }
  im.instanceMatrix.needsUpdate = true;
  if (shadeUpdate) C.shade.instanceMatrix.needsUpdate = true;
}

function crowdDispose(rt) {
  const C = rt.warCrowd;
  if (!C) return;
  rt.scene.remove(C.im); C.im.dispose();
  if (C.shade) {
    rt.scene.remove(C.shade); C.shade.geometry.dispose(); C.shade.material.dispose(); C.shade.dispose();
  }
  for (const P of C.pool) rt.scene.remove(P.mesh);
  rt.warCrowd = null;
}
