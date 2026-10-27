// 戦の周りの暮らし。兵の名簿・当たり・戦功には入れない、武器を持たない少人数の人。
import * as THREE from 'three';
import { buildModel, poseArms } from './units.js';
import { SOLIDS } from './props.js';
import { S } from './settings.js';
import { personGeo, tintMat } from './town_crowd.js';
import { sfx } from './audio.js';
import { cameraWallBlocked } from './battle_sight.js';
import { ARMY_P } from './world.js';

const NAMES = { farmer: '百姓', porter: '人夫', merchant: '商人', monk: '僧' };
const COLORS = { farmer: 0x62533e, porter: 0x484b3b, merchant: 0x3e4754, monk: 0x2e2925 };

function openGround(rt, x, z) {
  if (Math.abs(x) > rt.world.half - 3 || Math.abs(z) > rt.world.half - 3 || !rt.world.walkable(x, z) || rt.world.inWaterAt(x, z)) return false;
  // 大きな火のそばにも寄らない。
  for (const f of rt.world.fires || []) if (f.size >= 2 && Math.hypot(x - f.x, z - f.z) < 5) return false;
  for (const s of SOLIDS) if (x > s.x0 - 0.4 && x < s.x1 + 0.4 && z > s.z0 - 0.4 && z < s.z1 + 0.4) return false;
  return true;
}

// 三方ヶ原では炎の外縁から距離を取る。通常の焚き火の距離は保ち、大火だけ広げる。
// 描く炎と同じ size を読み、動く火にも入れ物を作らず追従する。
function crowdFireMargin(rt, f) {
  return Math.max(0, (f.size ?? 1.3) - 1.3) * (rt.def.civilianCrowd?.fireExtent ?? 0);
}

// 姉川の民は火の中心だけでなく、広がった炎の外縁からも間を取る。
function fireRadius(rt, f, distance) {
  return distance + (rt.def.civilianCrowd?.avoidArmies ? Math.max(0, f.size - 1) : 0);
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

function pathClear(rt, a, b, crowd = false, escaping = false, terrainOnly = false, alarm = false) {
  const placing = terrainOnly;
  if (rt.army.wallBetween(a, 0, b) || rt.army.wallBetween(a, 1, b)) return false;
  const clearance = !terrainOnly && crowd && rt.def.civilianCrowd?.soldierClearance;
  if (clearance > 0) {
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    const notice = rt.def.civilianCrowd?.soldierNotice ?? 0;
    const avoidThreats = escaping && rt.def.civilianCrowd?.avoidOtherThreats;
    const margin = Math.max(clearance, avoidThreats ? Math.max(notice, 40) : 0);
    const minX = Math.min(a.x, b.x) - margin, maxX = Math.max(a.x, b.x) + margin;
    const minZ = Math.min(a.z, b.z) - margin, maxZ = Math.max(a.z, b.z) + margin;
    for (const u of rt.army.units) {
      if (!soldier(u, rt)) continue;
      // 遠い兵は引き算や線分の判定より先に除き、歩みごとの確認を軽くする。
      if (u.pos.x < minX || u.pos.x > maxX || u.pos.z < minZ || u.pos.z > maxZ) continue;
      const sx = a.x - u.pos.x, sz = a.z - u.pos.z;
      const start2 = sx * sx + sz * sz, dot = sx * dx + sz * dz;
      // 岩村では別の兵の斬り合いにも、逃げ始める四十メートルの間合いで近寄らない。
      // 歩く兵は土地ごとの間合いを保ち、遠い斬り合いへの気づきだけ狭めない。
      const threatRadius = civilianCombatActive(rt, u) || u.target?.alive ? Math.max(notice, 40) : notice;
      // 間合いの外から別の兵へ近づく道も、線分全体で警戒距離を保つ。
      const safeRadius = avoidThreats ? Math.max(clearance, threatRadius) : clearance;
      if (start2 < safeRadius * safeRadius) {
        // 兵が間合いへ入ってきた時は、離れる一歩を許して立ちすくませない。
        if (dot < 0 || len2 + 2 * dot <= 0) return false;
      } else {
        // 道を離れて逃げ直す時も、別の兵の前を横切らない。線分全体で調べる。
        const t = len2 > 0 ? Math.max(0, Math.min(1, -dot / len2)) : 0;
        const px = sx + dx * t, pz = sz + dz * t;
        if (px * px + pz * pz < safeRadius * safeRadius) return false;
      }
    }
  }
  // 描画用の備や乱戦にも幅がある。民だけが列をすり抜けないよう、道全体で避ける。
  if (clearance > 0 && nearFormation(rt, b.x, b.z, clearance, a, escaping)) return false;
  // 火との間合いは線分全体で一度だけ調べる。点刻みの隙間から火へ近づく道を通さない。
  if (crowd && !terrainOnly && !alarm) {
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    const radius = escaping && rt.def.civilianCrowd?.avoidOtherThreats ? 22 : 5;
    const radius2 = radius * radius;
    for (const f of rt.world.fires || []) {
      if (f.lit === false || !(f.size >= (rt.def.civilianCrowd?.fireSize ?? 2))) continue;
      const sx = a.x - f.x, sz = a.z - f.z;
      const start2 = sx * sx + sz * sz, dot = sx * dx + sz * dz;
      if (start2 < radius2) {
        // 近くに松明が来た時は、離れ続ける道を通す。
        if (dot < 0 || len2 + 2 * dot <= 0) return false;
      } else {
        const t = len2 > 0 ? Math.max(0, Math.min(1, -dot / len2)) : 0;
        const px = sx + dx * t, pz = sz + dz * t;
        if (px * px + pz * pz < radius2) return false;
      }
    }
  }
  const escape = crowd && rt.def.civilianCrowd?.avoidArmies;
  // 既に火が迫った人は、火から離れる向きへ抜け出せる。途中で火を横切る道は選ばない。
  if (escape) for (const f of rt.world.fires || []) {
    if (f.lit !== false && f.size >= (rt.def.civilianCrowd.fireSize ?? 2) &&
      blocksEscape(f.x, f.z, fireRadius(rt, f, rt.def.civilianCrowd.escapeFireDistance ?? 10), a, b.x, b.z)) return false;
  }
  if (crowd && rt.def.civilianCrowd?.continuousEscapeSolids
    && !solidPathClear(a, b, null, null, rt.def.civilianCrowd?.escapeSolidMargin ?? 0.3)) return false;
  // 小谷の里道では、行き先だけでなくそこまでの区間も兵から離す。
  if (crowd && rt.def.civilianCrowd?.safeFlee && !placing) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const ground = rt.world.heightAt(a.x, a.z), dy = rt.world.heightAt(b.x, b.z) - ground;
    const len2 = dx * dx + dz * dz + dy * dy;
    const distant = rt.warCrowd;
    for (let i = 0; i < rt.army.units.length + (distant?.distantCount || 0); i++) {
      const u = rt.army.units[i];
      if (u && !soldier(u, rt)) continue;
      const pos = u ? u.pos : distant.distant[i - rt.army.units.length];
      // 逃げ始める距離とそろえ、別の斬り合いへ近づく里道も避ける。
      const walkRadius = rt.def.civilianCrowd.watchDistance ?? 14;
      const radius = escaping ? (u && (civilianCombatActive(rt, u) || u.target?.alive) ? Math.max(40, walkRadius) : walkRadius) : 12;
      const radius2 = radius * radius;
      // 坂の途中で最も近づく所を比高も含めて探す。平面だけでは、坂上の兵へ寄る道を見落とす。
      const t = len2 ? Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.z - a.z) * dz + (pos.y - ground) * dy) / len2)) : 0;
      const sx = pos.x - a.x - dx * t, sz = pos.z - a.z - dz * t;
      if (sx * sx + sz * sz >= radius2) continue;
      // 切岸の上の兵で、谷底の里道を塞がない。
      const px = a.x + dx * t, pz = a.z + dz * t;
      const sy = pos.y - rt.world.heightAt(px, pz);
      // 既に兵が迫っている時は、今より離れる退き方を妨げない。
      const startX = pos.x - a.x, startZ = pos.z - a.z;
      const startY = pos.y - ground;
      const distance2 = sx * sx + sz * sz + sy * sy;
      if (distance2 < Math.min(radius2, startX * startX + startZ * startZ + startY * startY) - 0.001
        // 見物と同じく、塀や尾根で見えない兵だけでは里道を塞がない。
        // 道の途中から見える兵と、十二メートル以内の足音は避ける。
        && crowdNoticesSoldier(rt, px, pz, pos, Math.sqrt(distance2), (a.sc ?? 1) * 1.5)) return false;
    }
  }
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
    // 小谷では避難の途中も里道とその肩に留める。角の先が見えても田や屋敷跡を横切らない。
    if (crowd && rt.def.civilianCrowd?.safeFlee && !onRetreatPath(rt, x, z)) return false;
    // 配置時の合流点は既に燃えていることもある。足場の炎は配置側で除く。
    if (crowd && rt.def.civilianCrowd?.safeFlee && !placing) {
      for (const f of rt.world.fires || []) {
        if (f.lit === false || f.size < (rt.def.civilianCrowd.fireSize ?? 2)) continue;
        // 炎の幅と比高を含め、足元へ迫った火から離れる歩みは許す。
        const radius = escaping ? Math.min(22, crowdFireDistance(rt, a.x, a.z, f)) : 5;
        const distance = crowdFireDistance(rt, x, z, f);
        if (distance < radius - 0.001 && (!escaping
          || crowdNoticesFire(rt, x, z, f, distance, (a.sc ?? 1) * 1.5))) return false;
      }
    }
    const y = rt.world.heightAt(x, z);
    if (bankMargin) for (let side = -1; side <= 1; side += 2) {
      const bankX = x + sideX * side, bankZ = z + sideZ * side;
      if (!rt.world.walkable(bankX, bankZ) || rt.world.inWaterAt(bankX, bankZ)
        || Math.abs(rt.world.heightAt(bankX, bankZ) - y) > 0.45) return false;
    }
    if (crowd && !terrainOnly && !alarm && !rt.def.civilianCrowd?.safeFlee) for (const f of rt.world.fires || []) if (f.lit !== false && f.size >= (rt.def.civilianCrowd?.fireSize ?? 2)) {
      const radius = civilianFireRadius(rt, f, fireClearance) + crowdFireMargin(rt, f);
      if (Math.hypot(x - f.x, z - f.z) < radius
        && !((rt.def.civilianCrowd?.escapeCheckInterval || rt.def.civilianCrowd?.safeRetreat)
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
  // 畦の外を避難する土地では、散らばる時や逃げ直す時も田と畦を横切らない。
  if (rt.def.civilianCrowd?.avoidFields) for (const f of w.villageFields || []) {
    const dx = x - f.x, dz = z - f.z;
    if (Math.abs(dx * f.c - dz * f.s) < f.w / 2 + 0.6 && Math.abs(dx * f.s + dz * f.c) < f.d / 2 + 0.6) return false;
  }
  const precise = rt.def.civilianCrowd?.safeFlee;
  const footprints = rt.def.civilianCrowd?.buildingFootprints;
  const broadMargin = precise ? Math.max(margin, 0.45) : margin;
  for (const s of SOLIDS) {
    if (x <= s.x0 - broadMargin || x >= s.x1 + broadMargin || z <= s.z0 - broadMargin || z >= s.z1 + broadMargin) continue;
    if (!precise && !(footprints && s.k === 'r')) return false;
    // 小谷の回した民家・斜めの柵では、外接する四角の空いた角を里道として通せる。
    // 兵と同じ置き物の形を使い、壁から三十センチ離す。形や座標の入れ物は足さない。
    if (s.k === 'r') {
      const dx = x - s.x, dz = z - s.z;
      if (Math.abs(dx * s.c - dz * s.s) < s.hw + (precise ? 0.3 : margin)
        && Math.abs(dx * s.s + dz * s.c) < s.hd + (precise ? 0.3 : margin)) return false;
    } else if (s.k === 'c') {
      if ((x - s.x) ** 2 + (z - s.z) ** 2 < (s.r + 0.3) ** 2) return false;
    } else if (s.k === 's') {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1)));
      if ((x - s.ax - dx * t) ** 2 + (z - s.az - dz * t) ** 2 < (s.r + 0.3) ** 2) return false;
    } else return false;
  }
  return true;
}

// 墨俣の普請・荷運びの人足は兵と分ける。護衛の足軽や迫る火は引き続き危険として扱う。
const soldier = (u, rt) => u.alive && !u.isStruct && !u.civ && !u.group?.civ && !u.group?.people && u.type !== 'dummy'
  && !((rt.def.civilianCrowd?.ignoreGoneSoldiers || rt.def.civilianCrowd?.safeRetreat) && (u.gone || u.evacuatedWound))
  && !((rt.def.civilianCrowd?.ignorePorters || rt.def.civilianCrowd?.soldierClearance || rt.def.civilianCrowd?.safeRetreat) && u.type === 'porter');


// 遠景の軍勢も民には兵。三方ヶ原だけ、隊列・後詰め・斬り合いを定期的に拾う。
// 座標の入れ物は使い回し、兵の名簿にも描く形にも人を増やさない。
function crowdArmies(rt, C) {
  C.threatCount = 0;
  if (!rt.def.civilianCrowd?.avoidDistantArmies) return;
  for (const A of rt.world.armies || []) {
    if (A.people || !A.n || !A.mesh.visible) continue;
    if (A.rout) {
      // 敗走は描く時に一人ずつ移動する。元の陣の位置を危険として残さない。
      const body = A.body, info = body.geometry.attributes.aInfo, info2 = body.geometry.attributes.aInfo2;
      const time = A.U.uRoutT.value;
      if (!info || !info2 || A.routHide && time > A.routHide) continue;
      body.updateWorldMatrix(true, false);
      for (let j = 0; j < A.n; j++) {
        if (A.taken?.[j] || A.hid?.[j] > 0) continue;
        const sd = info.getX(j), kind = info.getY(j), s2 = info2.getY(j);
        const t = Math.max(0, time - sd * 1.6), fallAt = 1.2 + s2 * 50;
        if (kind === 6 || s2 <= 0.1 && t >= fallAt + 0.5) continue;
        const run = s2 <= 0.1 ? Math.min(t, fallAt) : t;
        const heading = t > 0.001 ? Math.PI + (s2 - 0.5) * 1.7 : 0;
        const distance = run * (3 + sd * 2.2) * (kind === 5 ? 2 : 1);
        body.getMatrixAt(j, C.routMatrix);
        C.routPoint.set(Math.sin(heading) * distance, 0, Math.cos(heading) * distance)
          .applyMatrix4(C.routMatrix).applyMatrix4(body.matrixWorld);
        // 民から遠い敗兵は判定に足さず、近い者だけ同じ入れ物で追う。
        let near = false;
        for (const a of C.agents) if (Math.abs(a.x - C.routPoint.x) < 48 && Math.abs(a.z - C.routPoint.z) < 48) { near = true; break; }
        if (!near) continue;
        const i = C.threatCount++, q = C.threats[i] || (C.threats[i] = { x: 0, z: 0, radius: 0, hot: false });
        q.x = C.routPoint.x; q.z = C.routPoint.z; q.radius = kind === 5 ? 3 : 1.5; q.hw = 0; q.hot = true; q.fighting = false;
        q.mounted = kind === 5;
      }
      continue;
    }
    const i = C.threatCount++, q = C.threats[i] || (C.threats[i] = { x: 0, z: 0, radius: 0, hot: false });
    const rot = A.mesh.rotation.y, c = Math.cos(rot), s = Math.sin(rot), rear = (A.hostD || 0) / 2;
    q.x = A.mesh.position.x + A.cx + c * A.off.x + s * A.off.z - Math.sin(A.facing) * rear;
    q.z = A.mesh.position.z + A.cz - s * A.off.x + c * A.off.z - Math.cos(A.facing) * rear;
    q.radius = Math.hypot(A.hw0, A.hd0 + rear);
    // 横長の備えを大きな円にすると、兵のいない南側の里道まで塞いでしまう。
    // 隊列と後詰めの幅・奥行き・向きを引き継ぐ。入れ物は敗走・乱戦とも使い回す。
    q.hw = A.hw0; q.hd = A.hd0 + rear;
    q.c = Math.cos(A.facing); q.s = Math.sin(A.facing);
    q.hot = !!A.tw?.charge; q.fighting = false;
    q.mounted = !!A.parts?.riders && A.parts.riders.length > A.n / 2;
  }
  // 軽い乱戦は隊列とは別の一覧にある。近くに本物の兵がいなくても見物をやめ、
  // 里道の途中でも前線を横切らない。押し引きで動く各塊を、同じ入れ物で追う。
  for (const clash of rt.world.clashes || []) {
    if (!clash.mesh.visible || clash.phase !== 'fight' || clash.winner ||
        !clash.A.alive || !clash.B.alive) continue;
    const c = Math.cos(clash.facing), s = Math.sin(clash.facing);
    const radius = (clash.o.w || 60) / clash.nb / 2 + (clash.o.gap ?? 3.4) / 2 + 3;
    for (const b of clash.blocks) {
      if (b.fight <= 0.1 || clash.A.blk[b.j].rt > 0 || clash.B.blk[b.j].rt > 0) continue;
      const i = C.threatCount++, q = C.threats[i] || (C.threats[i] = { x: 0, z: 0, radius: 0, hot: false });
      q.x = clash.x + b.lx * c + b.f * s;
      q.z = clash.z - b.lx * s + b.f * c;
      q.radius = radius; q.hw = 0; q.hot = true; q.fighting = true; q.mounted = false;
    }
  }
}

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


function nearSoldierMikata(rt, x, z, r) {
  for (const u of rt.army.units) if (soldier(u, rt) && Math.abs(u.pos.x - x) < r && Math.abs(u.pos.z - z) < r && Math.hypot(u.pos.x - x, u.pos.z - z) < r) return true;
  const C = rt.warCrowd;
  for (let i = 0; i < (C?.threatCount || 0); i++) {
    const q = C.threats[i];
    if (threatDistance(q, x, z) < r) return true;
  }
  return false;
}

// 安全な間隔へ新たに踏み込まず、既に近い時は距離を広げる。途中のすり抜けも防ぐ。
function blocksEscape(x, z, r, a, bx, bz, progress = 0.2) {
  const dx = bx - a.x, dz = bz - a.z, len2 = dx * dx + dz * dz;
  const start = Math.hypot(a.x - x, a.z - z), end = Math.hypot(bx - x, bz - z);
  const t = len2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0;
  const nearest = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
  return nearest < Math.min(r, start) - 0.001 || start < r && end < start + progress;
}

// 姉川の里道では、遅い年寄りや避難先で待つ人をすり抜けず、脇へ回る。
// 重なってしまった人は離れられる。兵の当たりや名簿には加えない。
function crowdBlocked(C, a, x, z, progress = 0.2) {
  for (const b of C.agents) {
    if (b === a || !b.out) continue;
    // 今歩く短い区間から遠い人は、距離や途中の計算を省く。
    if (b.x < Math.min(a.x, x) - 0.9 || b.x > Math.max(a.x, x) + 0.9 ||
      b.z < Math.min(a.z, z) - 0.9 || b.z > Math.max(a.z, z) + 0.9) continue;
    if (blocksEscape(b.x, b.z, 0.9, a, x, z, progress)) return true;
  }
  return false;
}

// 本物の兵がいない備も、列の幅と奥行きから民までの距離を測る。
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

// 敗走の足元は描画側と同じ種・速さ・向きで求める。倒れた兵は追いかけてこない。
// 小谷の既存の見回りだけで呼び、行列と座標は使い回す。
function distantRoutPoint(army, i, p, matrix) {
  const info = army.body.geometry.getAttribute('aInfo');
  const info2 = army.body.geometry.getAttribute('aInfo2');
  const sd = info.getX(i), kind = info.getY(i), s2 = info2.getY(i), U = army.U;
  const time = Math.max(0, U.uRoutT.value - sd * 1.6);
  const fallAt = 1.2 + s2 * 50;
  if (s2 <= .1 && time >= fallAt + .5) return false;
  if (time < .001 || kind === 6) return true;
  const T = U.uAT.value + sd * 97;
  const lookEdge = Math.max(0, Math.min(1, (Math.sin(T * .045 + sd * 20) - .88) / .12));
  let look = .2 * Math.sin(T * .07) * Math.sin(T * .031 + sd * 9)
    + .6 * lookEdge * lookEdge * (3 - 2 * lookEdge) * (sd > .5 ? 1 : -1);
  look += U.uIdle.value * .16 * Math.sin(T * (.3 + s2 * .25) + sd * 23);
  const far = Math.max(0, Math.min(1, (Math.hypot(p.x - ARMY_P.value.x, p.z - ARMY_P.value.y) - 36) / 24));
  const yaw = U.uTurn.value * Math.PI + Math.PI + (s2 - .5) * 1.7
    + look * .15 * far * far * (3 - 2 * far);
  const distance = (s2 <= .1 ? Math.min(time, fallAt) : time) * (3 + sd * 2.2) * (kind === 5 ? 2 : 1);
  matrix.fromArray(army.base, i * 16);
  p.set(Math.sin(yaw) * distance, 0, Math.cos(yaw) * distance)
    .applyMatrix4(matrix).add(army.off).applyMatrix4(army.mesh.matrixWorld);
  return true;
}

// 小谷の控えの列も民から見える兵。描画の間引きとは別に、残る兵の足元を拾う。
// 初回と既存の見回りだけ更新し、座標の入れ物は使い回す。
function scanDistant(rt, C) {
  C.distantCount = 0;
  const cfg = rt.def.civilianCrowd;
  if (!cfg?.distantArmies) return;
  C.distant ??= [];
  C.distantPoint ??= new THREE.Vector3();
  C.distantMatrix ??= new THREE.Matrix4();
  const p = C.distantPoint, bounds = cfg.bounds;
  for (const army of rt.world.armies || []) {
    // 敗走しても民へ迫る兵は残す。描画を終えた隊を元の整列位置へ戻さない。
    if (!army.mesh.visible || !army.base || army.rout && army.routHide && army.U.uRoutT.value > army.routHide) continue;
    army.mesh.updateWorldMatrix(true, false);
    for (let i = 0; i < army.n; i++) {
      if (army.taken[i]) continue;
      const k = i * 16;
      p.set(army.base[k + 12], army.base[k + 13], army.base[k + 14]).add(army.off).applyMatrix4(army.mesh.matrixWorld);
      if (army.rout && !distantRoutPoint(army, i, p, C.distantMatrix)) continue;
      // 民の里道から遠い列は、以後の歩幅ごとの検査へ持ち込まない。
      if (bounds && (p.x < bounds.minX - 42 || p.x > bounds.maxX + 42 || p.z < bounds.minZ - 42 || p.z > bounds.maxZ + 42)) continue;
      const q = C.distant[C.distantCount] ?? (C.distant[C.distantCount] = { x: 0, y: 0, z: 0 });
      q.x = p.x; q.z = p.z; q.y = rt.world.heightAt(p.x, p.z);
      C.distantCount++;
    }
  }
}

function crowdDistance(rt, x, z, threat, y) {
  // 小谷の谷と曲輪は高さも離れている。ほかの戦の判定は従来通り。
  const dy = rt.def.civilianCrowd?.safeFlee ? (y ?? rt.world.heightAt(threat.x, threat.z)) - rt.world.heightAt(x, z) : 0;
  return Math.hypot(threat.x - x, threat.z - z, dy);
}

// 小谷では火の中心でなく炎の縁から間合いを取る。大火ほど早く退き、燃える幅を横切らない。
// 炎の内側では負の距離も残し、足元まで燃えた時も外へ離れる一歩を許す。
function crowdFireDistance(rt, x, z, fire) {
  // 屋根や櫓の火は地面に下ろさず、描いている炎の高さから熱の間合いを測る。
  // 避難時に覚えた火は、その時の高さを y に残している。
  return crowdDistance(rt, x, z, fire, fire.base ?? fire.y) - fire.size * (rt.def.civilianCrowd?.fireRadiusScale ?? 0);
}

// 家族の危険を比べる時と次の一歩でも、炎の縁からの距離を引き継ぐ。
function crowdThreatDistance(rt, x, z, threat) {
  return rt.def.civilianCrowd?.safeFlee && threat.size > 0
    ? crowdFireDistance(rt, x, z, threat) : crowdDistance(rt, x, z, threat, threat.y);
}

// 見物と避難で同じ視線を使う。座標は初期化時に用意し、見回りで使い回す。
function crowdCanSee(rt, x, z, p, eyeHeight = 1.5, targetHeight = 1.5) {
  const origin = rt.warCrowd.sight;
  origin.x = x; origin.z = z; origin.y = rt.world.heightAt(x, z);
  if (rt.army.wallBetween(origin, 0, p) || rt.army.wallBetween(origin, 1, p)) return false;
  const eye = origin.y + eyeHeight;
  const steps = Math.max(1, Math.ceil(Math.hypot(p.x - x, p.z - z) / 4));
  const rise = (p.y ?? rt.world.heightAt(p.x, p.z)) + targetHeight - eye;
  // 村の民家は壊せる塀とは別の当たり。回した壁の内側を視線が通る時だけ遮る。
  // 四棟の寸法を使い回し、屋根越しに見える高い尾根の兵までは隠さない。
  for (const b of rt.def.civilianCrowd?.sightBuildings || []) {
    const lx = (x - b.x) * b.c - (z - b.z) * b.s;
    const lz = (x - b.x) * b.s + (z - b.z) * b.c;
    const dx = (p.x - x) * b.c - (p.z - z) * b.s;
    const dz = (p.x - x) * b.s + (p.z - z) * b.c;
    let enter = 0, exit = 1;
    for (let axis = 0; axis < 2; axis++) {
      const start = axis ? lz : lx, delta = axis ? dz : dx, half = axis ? b.hd : b.hw;
      if (Math.abs(delta) < 0.000001) {
        if (Math.abs(start) > half) { exit = -1; break; }
      } else {
        const a = (-half - start) / delta, c = (half - start) / delta;
        enter = Math.max(enter, Math.min(a, c)); exit = Math.min(exit, Math.max(a, c));
      }
      if (enter > exit) break;
    }
    if (enter > exit) continue;
    const base = rt.world.heightAt(b.x, b.z), y0 = eye + rise * enter, y1 = eye + rise * exit;
    if (Math.min(y0, y1) < base + b.h && Math.max(y0, y1) > base) return false;
  }
  for (let j = 1; j < steps; j++) {
    const t = j / steps;
    if (rt.world.heightAt(x + (p.x - x) * t, z + (p.z - z) * t) > eye + rise * t) return false;
  }
  return true;
}

function crowdNoticesSoldier(rt, x, z, p, distance, eyeHeight = 1.5) {
  // 小谷の尾根や塀の向こうの兵には反応しない。十二メートル以内は足音でも気づく。
  // 子の見物と避難で同じ目線を使い、大人だけに見える塀越しの兵で騒がない。
  return !rt.def.civilianCrowd?.sightThreats || distance < 12 || crowdCanSee(rt, x, z, p, eyeHeight);
}

function crowdNoticesFire(rt, x, z, fire, distance, eyeHeight) {
  // 小谷の堂・民家・尾根に隠れた遠い火では騒がず、近い火の熱にはすぐ退く。
  if (!rt.def.civilianCrowd?.sightFires || distance < 12) return true;
  // 高い所で燃える炎も、その見える高さで調べる。見回り用の座標を使い回す。
  const p = rt.warCrowd.fireSight;
  p.x = fire.x; p.z = fire.z;
  p.y = (fire.base ?? rt.world.heightAt(fire.x, fire.z)) + fire.size * .65;
  return crowdCanSee(rt, x, z, p, eyeHeight, 0);
}

function nearSoldierOdani(rt, x, z, r, eyeHeight = 1.5) {
  if (!rt.def.civilianCrowd?.safeFlee) return routeNearSoldier(rt, x, z, r, typeof eyeHeight === 'object' ? eyeHeight : null);
  if (typeof eyeHeight === 'object') eyeHeight = (eyeHeight.sc ?? 1) * 1.5;
  for (const u of rt.army.units) if (soldier(u, rt) && Math.abs(u.pos.x - x) < r && Math.abs(u.pos.z - z) < r) {
    const d = crowdDistance(rt, x, z, u.pos, u.pos.y);
    if (d < r && crowdNoticesSoldier(rt, x, z, u.pos, d, eyeHeight)) return true;
  }
  const C = rt.warCrowd;
  for (let i = 0; i < (C?.distantCount || 0); i++) {
    const p = C.distant[i];
    if (Math.abs(p.x - x) < r && Math.abs(p.z - z) < r) {
      const d = crowdDistance(rt, x, z, p, p.y);
      if (d < r && crowdNoticesSoldier(rt, x, z, p, d, eyeHeight)) return true;
    }
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

function routeNearSoldier(rt, x, z, r, from = null) {
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
  return nearFormation(rt, x, z, r, from, retreat);
}

// 兵の名簿は増やさず、既存の軽い軍勢の外縁だけを調べる。
function nearFormation(rt, x, z, r, from, retreat) {
  const heightGap = rt.def.civilianCrowd?.soldierHeightClearance;
  const ground = heightGap == null ? 0 : rt.world.heightAt(x, z);
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

// 隊の外縁までを見る。巻き込まれた人は、内側でも縁へ近づく向きに抜け出せる。
function crowdBox(C, x, z, r, from, cx, cz, facing, hw, z0, z1, rt = null, eye = null, targetEye = 1.4) {
  const c = Math.cos(facing), s = Math.sin(facing), dx = x - cx, dz = z - cz;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  let qx = Math.max(-hw, Math.min(hw, lx)), qz = Math.max(z0, Math.min(z1, lz));
  const d = Math.hypot(lx - qx, lz - qz);
  if (d >= r && !from) return r;
  if (from) {
    const fx = from.x - cx, fz = from.z - cz;
    const flx = fx * c - fz * s, flz = fx * s + fz * c;
    const fd = Math.hypot(Math.max(0, Math.abs(flx) - hw), Math.max(0, z0 - flz, flz - z1));
    const edge = d + Math.min(0, Math.max(Math.abs(lx) - hw, z0 - lz, lz - z1));
    const fromEdge = fd + Math.min(0, Math.max(Math.abs(flx) - hw, z0 - flz, flz - z1));
    if (edge >= fromEdge + 0.2 || d >= r) {
      // 終点だけが遠くても、隊の角を横切る近道は選ばない。
      // 既に列へ巻き込まれた人も、途中でさらに奥へ入らず外へ抜ける。
      const length = Math.hypot(lx - flx, lz - flz);
      // 遠い隊には細かな途中判定をせず、里道に迫った隊だけを調べる。
      if (Math.min(fd, d) - length >= r) return r;
      const steps = Math.max(1, Math.ceil(length / 0.15));
      for (let i = 1; i < steps; i++) {
        const t = i / steps, px = flx + (lx - flx) * t, pz = flz + (lz - flz) * t;
        const pd = Math.hypot(Math.max(0, Math.abs(px) - hw), Math.max(0, z0 - pz, pz - z1));
        const pe = pd + Math.min(0, Math.max(Math.abs(px) - hw, z0 - pz, pz - z1));
        if (pe < Math.min(r, fromEdge) - 0.001) {
          C.armyDanger.x = cx; C.armyDanger.z = cz;
          return 0;
        }
      }
      return r;
    }
  }
  if (d === 0) {
    // 隊の中では最近点が本人と重なる。そのままでは逃げる向きが常に南になる。
    // 最も近い縁の反対側に危険点を置き、同じ岸の範囲内で隊から抜けられる向きへ導く。
    const left = lx + hw, right = hw - lx, back = lz - z0, front = z1 - lz;
    const nearest = Math.min(left, right, back, front), offset = Math.max(1, nearest);
    if (nearest === left) qx += offset;
    else if (nearest === right) qx -= offset;
    else if (nearest === back) qz += offset;
    else qz -= offset;
  }
  // 見物の危険察知だけは列の近い縁までの見通しを見る。退路の安全判定は保つ。
  // 共用の座標へ候補を置き、見えない列で既に見付けた危険点を上書きしない。
  const dangerX = cx + qx * c + qz * s, dangerZ = cz - qx * s + qz * c;
  if (eye !== null) {
    C.armyPoint.x = dangerX; C.armyPoint.z = dangerZ;
    if (!dangerVisible(rt, x, z, C.armyPoint, d, eye, targetEye)) return r;
  }
  C.armyDanger.x = dangerX; C.armyDanger.z = dangerZ;
  return d;
}

// 敗走の描画と同じ種・速さ・向きから、まだ走る列の外縁を取る。
// 列ごとに控えを使い回し、〇・二秒以内の再探索では兵一人ずつを調べ直さない。
function fleeingBounds(S, b, battle) {
  const B = S.blk[b.j];
  const bounds = B.peopleBounds ??= { time: -1, x0: 0, x1: 0, z0: 0, z1: 0 };
  if (B.rt >= bounds.time && B.rt - bounds.time < 0.2) return bounds;
  bounds.time = B.rt;
  bounds.x0 = bounds.z0 = Infinity; bounds.x1 = bounds.z1 = -Infinity;
  const killedRows = B.kd / battle.cols, frontRow = Math.floor(killedRows);
  for (const u of S.slots[b.j]) {
    if (u.slot + 0.5 <= B.kd) continue;
    const elapsed = Math.max(0, B.rt - u.sd * 1.6), fallAt = 1.2 + u.r2 * 50;
    // 倒れて動かなくなった者を、迫る兵として数え続けない。
    if (u.r2 <= 0.1 && elapsed > fallAt + 0.5) continue;
    const run = (u.r2 <= 0.1 ? Math.min(elapsed, fallAt) : elapsed) * (3 + u.sd * 2.2);
    const yaw = u.yaw - battle.facing, turn = Math.PI + (u.r2 - 0.5) * 1.7;
    const shift = S.sgn * b.f + (u.row <= frontRow + 0.5 ? frontRow : killedRows) * 1.15 + battle.app;
    const dx = Math.sin(turn) * run * u.sc[0], dz = (Math.cos(turn) * run + shift) * u.sc[2];
    const x = u.lx + dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const z = u.lz - dx * Math.sin(yaw) + dz * Math.cos(yaw);
    // 体の幅・走りながらの首振り・次の更新までの移動も含める。
    const pad = 3 + run * 0.16;
    bounds.x0 = Math.min(bounds.x0, x - pad); bounds.x1 = Math.max(bounds.x1, x + pad);
    bounds.z0 = Math.min(bounds.z0, z - pad); bounds.z1 = Math.max(bounds.z1, z + pad);
  }
  return bounds;
}

// 控えの敗走も描く時と同じ種・行列で追う。元の陣形だけを避けると、
// 村外れへ散って走る兵を民がすり抜け、空になった陣形では逃げ道が塞がる。
// 位置の控えは隊ごとに使い回し、短い間隔では計算し直さない。
function routedArmyPositions(A) {
  const time = A.U.uRoutT.value;
  const cache = A.peopleRout ??= { time: -1, positions: new Float32Array(A.n * 4) };
  if (time >= cache.time && time - cache.time < 0.2) return cache.positions;
  cache.time = time;
  const info = A.body.geometry.getAttribute('aInfo'), info2 = A.body.geometry.getAttribute('aInfo2');
  const base = A.base, world = A.mesh.matrixWorld.elements, positions = cache.positions;
  for (let i = 0; i < A.n; i++) {
    const j = i * 4, k = i * 16, sd = info.getX(i), kind = info.getY(i), s2 = info2.getY(i);
    const elapsed = Math.max(0, time - sd * 1.6), fallAt = 1.2 + s2 * 50;
    // 本物へ替わった兵と、倒れて動かなくなった兵は二重に怖がらない。
    if (A.taken[i] || kind === 6 || s2 <= 0.1 && elapsed > fallAt + 0.5) {
      positions[j + 2] = 0; continue;
    }
    const run = (s2 <= 0.1 ? Math.min(elapsed, fallAt) : elapsed) * (3 + sd * 2.2) * (kind === 5 ? 2 : 1);
    const turn = Math.PI * (1 + A.U.uTurn.value) + (s2 - 0.5) * 1.7;
    const dx = Math.sin(turn) * run, dz = Math.cos(turn) * run;
    const x = base[k + 12] + base[k] * dx + base[k + 8] * dz + A.off.x;
    const z = base[k + 14] + base[k + 2] * dx + base[k + 10] * dz + A.off.z;
    positions[j] = world[0] * x + world[8] * z + world[12];
    positions[j + 1] = world[2] * x + world[10] * z + world[14];
    positions[j + 2] = kind === 5 ? 2 : 1;
    positions[j + 3] = 3 + run * 0.16;
  }
  return positions;
}

// 姉川では本物へ替わらない備えと乱戦も民の目に入る。
function nearLightArmy(rt, x, z, r, from = null, rFight = r, rHorse = r, eye = null) {
  if (!rt.def.civilianCrowd?.avoidArmies) return null;
  const C = rt.warCrowd, p = C.armyPoint, out = C.armyDanger;
  let best = Math.max(r, rFight, rHorse), found = false;
  for (const A of rt.world.armies || []) {
    if (!A.mesh.visible || !A.body.visible || A.people || A.took >= A.n) continue;
    A.mesh.updateWorldMatrix(true, false);
    if (A.rout) {
      const positions = routedArmyPositions(A);
      for (let j = 0; j < positions.length; j += 4) {
        if (!positions[j + 2]) continue;
        const px = positions[j], pz = positions[j + 1];
        // 次の位置更新までの移動と体の幅を含め、里道を横切る騎馬にも間を取る。
        const limit = Math.min(positions[j + 2] === 2 ? rHorse : r, best), pad = positions[j + 3];
        const d = crowdBox(C, x, z, limit, from, px, pz, 0, pad, -pad, pad, rt, eye, positions[j + 2] === 2 ? 2.2 : 1.4);
        if (d < limit) { best = d; found = true; }
      }
      continue;
    }
    p.set(A.cx + A.off.x, 0, A.cz + A.off.z).applyMatrix4(A.mesh.matrixWorld);
    const limit = Math.min(A.civilianCavalry ? rHorse : r, best);
    const d = crowdBox(C, x, z, limit, from, p.x, p.z, A.facing, A.hw0, -A.hd0 - (A.hostD || 0), A.hd0,
      rt, eye, A.civilianCavalry ? 2.2 : 1.4);
    if (d < limit) { best = d; found = true; }
  }
  for (const battle of rt.world.clashes || []) {
    if (!battle.mesh.visible) continue;
    const c = Math.cos(battle.facing), s = Math.sin(battle.facing);
    const width = (battle.o.w || 60) / battle.nb;
    const lx = (x - battle.x) * c - (z - battle.z) * s;
    const fromLX = from ? (from.x - battle.x) * c - (from.z - battle.z) * s : lx;
    // 遠い列は除き、既存の半秒余りごとの探索で済ませる。
    // 姉川の長い里道へ合流する時は、終点だけでなく出発点との間も見る。
    // 両端が列から離れていても、途中で乱戦を横切る道は通さない。
    const margin = (battle.o.w || 60) / 2 + rFight + 2;
    let fleeing = false;
    for (const b of battle.blocks) if (battle.A.blk[b.j].rt > 0 || battle.B.blk[b.j].rt > 0) { fleeing = true; break; }
    if (!fleeing && (Math.min(lx, fromLX) > margin || Math.max(lx, fromLX) < -margin)) continue;
    for (let side = 0; side < 2; side++) {
      const S = side ? battle.B : battle.A;
      if (!S.meshes.bodyN.visible || S.alive <= 0) continue;
      for (const b of battle.blocks) {
        const B = S.blk[b.j];
        const blockMargin = width / 2 + rFight + 2;
        if (b.hide > 0.5 || B.k >= B.n0) continue;
        // 敗走して里道へ広がる兵も避ける。元の乱戦の幅だけでは取りこぼす。
        if (B.rt > 0) {
          const bounds = fleeingBounds(S, b, battle), limit = Math.min(r, best);
          if (bounds.x0 > bounds.x1 || Math.min(lx, fromLX) > bounds.x1 + limit ||
            Math.max(lx, fromLX) < bounds.x0 - limit) continue;
          const cx = (bounds.x0 + bounds.x1) / 2;
          const d = crowdBox(C, x, z, limit, from, battle.x + cx * c, battle.z - cx * s,
            battle.facing, (bounds.x1 - bounds.x0) / 2, bounds.z0, bounds.z1, rt, eye);
          if (d < limit) { best = d; found = true; }
          continue;
        }
        if (Math.min(lx, fromLX) > b.lx + blockMargin || Math.max(lx, fromLX) < b.lx - blockMargin) continue;
        // 共通の乱戦の列間隔に合わせ、前詰めと押し引きを含める。斬り合う前列には余裕を足す。
        const front = b.f - S.sgn * ((battle.o.gap ?? 3.4) / 2 - battle.app);
        const back = front - S.sgn * Math.max(0, S.rows - 1 - B.kd / battle.cols) * 1.15;
        const limit = Math.min(rFight, best);
        const d = crowdBox(C, x, z, limit, from, battle.x + b.lx * c, battle.z - b.lx * s,
          battle.facing, width / 2 + 1.5, Math.min(front, back) - 3, Math.max(front, back) + 3, rt, eye);
        if (d < limit) { best = d; found = true; }
      }
    }
  }
  return found ? out : null;
}

function nearSoldier(rt, x, z, r, from = null) {
  if (rt.def.civilianCrowd?.safeRetreat) return nearSoldierMikata(rt, x, z, r);
  if (rt.def.civilianCrowd?.safeFlee) return nearSoldierOdani(rt, x, z, r, from ?? 1.5);
  if (!rt.def.civilianCrowd?.avoidArmies) return routeNearSoldier(rt, x, z, r, from);
  // 姉川は見物をやめた後も兵との間を保つ。最寄りの兵から離れて別の隊へ寄る道も防ぐ。
  // 既に間に入られた時は、同じ判定で兵から離れる向きへ抜けられる。
  if (from) r = Math.max(r, rt.def.civilianCrowd?.escapeDistance ?? r);
  // 姉川では逃走中も斬り合いの間合いを守る。別の乱戦へ近づく道を選ばない。
  const fightRadius = from ? Math.max(r, rt.def.civilianCrowd?.escapeFightDistance ?? r) : r;
  const horseRadius = Math.max(r, rt.def.civilianCrowd?.horseDistance ?? r);
  for (const u of rt.army.units) if (soldier(u, rt)) {
    const distance = Math.max(civilianCombatActive(rt, u) || u.target?.alive ? fightRadius : r, u.mounted ? horseRadius : r);
    if (from ? blocksEscape(u.pos.x, u.pos.z, distance, from, x, z)
      : Math.hypot(u.pos.x - x, u.pos.z - z) < (u.mounted ? horseRadius : r)) return true;
  }
  return !!nearLightArmy(rt, x, z, r, from, fightRadius, horseRadius);
}

// 途中で危険へ寄らない。兵や火が後から迫った時は、近くても離れる一歩を許す。
function keepsClear(a, b, x, z, radius) {
  const dx = b.x - a.x, dz = b.z - a.z, ax = a.x - x, az = a.z - z;
  const d2 = ax * ax + az * az, dot = ax * dx + az * dz, len2 = dx * dx + dz * dz;
  if (d2 < radius * radius) return dot >= 0 && len2 > 0;
  const t = len2 > 0 ? Math.max(0, Math.min(1, -dot / len2)) : 0;
  return (ax + dx * t) ** 2 + (az + dz * t) ** 2 >= radius * radius;
}

// 隊列は向き付きの四角、散った敗兵と乱戦の塊は従来の円で見る。
function threatDistance(q, x, z) {
  if (!q.hw) return Math.max(0, Math.hypot(x - q.x, z - q.z) - q.radius);
  const dx = x - q.x, dz = z - q.z;
  return Math.hypot(Math.max(0, Math.abs(dx * q.c - dz * q.s) - q.hw),
    Math.max(0, Math.abs(dx * q.s + dz * q.c) - q.hd));
}

// 里道へ隊列がかぶった時は、長い列に沿わず最寄りの縁へ抜ける。
// 隊列の向きを使い、馬の周りには退避の道と同じ余裕を取る。
function formationEscapeHeading(a, q, margin) {
  const dx = a.x - q.x, dz = a.z - q.z;
  const x = dx * q.c - dz * q.s, z = dx * q.s + dz * q.c;
  const edgeX = q.hw + margin - Math.abs(x), edgeZ = q.hd + margin - Math.abs(z);
  if (edgeX <= 0 || edgeZ <= 0) return null;
  if (edgeX <= edgeZ) {
    const side = x < 0 ? -1 : 1;
    return Math.atan2(side * q.c, -side * q.s);
  }
  const side = z < 0 ? -1 : 1;
  return Math.atan2(side * q.s, side * q.c);
}

function threatClear(q, a, b, margin) {
  if (!q.hw) return keepsClear(a, b, q.x, q.z, q.radius + margin);
  const ax = (a.x - q.x) * q.c - (a.z - q.z) * q.s;
  const az = (a.x - q.x) * q.s + (a.z - q.z) * q.c;
  const dx = (b.x - a.x) * q.c - (b.z - a.z) * q.s;
  const dz = (b.x - a.x) * q.s + (b.z - a.z) * q.c;
  const hw = q.hw + margin, hd = q.hd + margin;
  // 隊列が後から迫った時は、近い縁から外へ逃げる一歩を許す。
  // 中心から離れるだけでは、長い列に沿って走りながら兵の奥へ踏み込めてしまう。
  // 同じ距離の縁ではどちらへも逃げられ、縁に沿う一歩も妨げない。
  if (Math.abs(ax) < hw && Math.abs(az) < hd) {
    const edgeX = hw - Math.abs(ax), edgeZ = hd - Math.abs(az);
    return dx * dx + dz * dz > 0 &&
      (edgeX <= edgeZ && ax * dx >= 0 || edgeZ <= edgeX && az * dz >= 0);
  }
  // 線分と四辺を見る。両端が空いていても、途中で隊列を横切らない。
  let enter = 0, leave = 1;
  if (Math.abs(dx) < 1e-9) { if (Math.abs(ax) >= hw) return true; }
  else {
    const t0 = (-hw - ax) / dx, t1 = (hw - ax) / dx;
    enter = Math.max(enter, Math.min(t0, t1)); leave = Math.min(leave, Math.max(t0, t1));
  }
  if (Math.abs(dz) < 1e-9) { if (Math.abs(az) >= hd) return true; }
  else {
    const t0 = (-hd - az) / dz, t1 = (hd - az) / dz;
    enter = Math.max(enter, Math.min(t0, t1)); leave = Math.min(leave, Math.max(t0, t1));
  }
  return enter >= leave;
}

function retreatClear(rt, a, b) {
  const C = rt.warCrowd;
  // 騎馬に早く気づく戦では、里道を選ぶ時も同じ分だけ離す。
  // 逃げ直し・道への復帰・待ち場所で共用し、馬の直前へ戻る往復を防ぐ。
  const mountedMargin = 12 + (rt.def.civilianCrowd?.mountedWarning ?? 0);
  for (let i = 0; i < (C?.threatCount || 0); i++) {
    const q = C.threats[i];
    if (!threatClear(q, a, b, q.mounted ? mountedMargin : 12)) return false;
  }
  for (const u of rt.army.units) if (soldier(u, rt) &&
      !keepsClear(a, b, u.pos.x, u.pos.z, u.mounted ? mountedMargin : 12)) return false;
  for (const f of rt.world.fires || []) if (f.lit !== false && f.size >= (rt.def.civilianCrowd.fireSize ?? 2) && !keepsClear(a, b, f.x, f.z, 10 + crowdFireMargin(rt, f))) return false;
  return true;
}

// 道を調べた後に兵や火が動いても、その中へ一歩を踏み出さない。
// 近い物だけ詳しく調べ、危険の内側では離れる動きを許す。座標は共用する。
function mikataStepClear(rt, a, b, radius) {
  // 三方ヶ原の遠景の隊列・騎馬・乱戦も、足場を選んだ後の一歩で避ける。
  // 本物の兵だけを見ると、里道へ入った軽い軍勢の中へ踏み込んでしまう。
  const C = rt.warCrowd;
  // 馬の胴と足の届く幅も空ける。徒歩の兵との間隔は変えない。
  const mountedRadius = Math.max(radius, rt.def.civilianCrowd?.mountedClearance ?? radius);
  for (let i = 0; i < (C?.threatCount || 0); i++) {
    const q = C.threats[i];
    if (!threatClear(q, a, b, q.mounted ? mountedRadius : radius)) return false;
  }
  const step = Math.hypot(b.x - a.x, b.z - a.z);
  for (const u of rt.army.units) {
    if (!soldier(u, rt)) continue;
    const clearance = u.mounted ? mountedRadius : radius, reach = clearance + step;
    if (Math.abs(u.pos.x - a.x) > reach || Math.abs(u.pos.z - a.z) > reach) continue;
    if (!keepsClear(a, b, u.pos.x, u.pos.z, clearance)) return false;
  }
  for (const f of rt.world.fires || []) {
    if (f.lit === false || f.size < (rt.def.civilianCrowd.fireSize ?? 2)) continue;
    const edge = 5 + crowdFireMargin(rt, f);
    if (!keepsClear(a, b, f.x, f.z, edge)) return false;
  }
  return true;
}

function battleCenter(rt, out = { x: 0, z: 0 }) {
  let ax = 0, az = 0, an = 0, bx = 0, bz = 0, bn = 0;
  let fx = 0, fz = 0, fn = 0, gx = 0, gz = 0, gn = 0;
  const watch = rt.def.civilianCrowd?.watchBattle;
  for (const u of rt.army.units) if (soldier(u, rt)) {
    if (u.team === 0) { ax += u.pos.x; az += u.pos.z; an++; }
    else if (u.team === 1) { bx += u.pos.x; bz += u.pos.z; bn++; }
    // 三方ヶ原では本陣・城口の護衛に視線を引かれず、実際に寄せ合う兵を見る。
    // 遠い敵を狙うだけの兵と敗走者は除き、交戦前は両軍の布陣を見る。
    if (!watch || u.fleeing || u.woundOut || u.downed) continue;
    const target = u.atk?.target || u.swing?.target || u.target;
    if (!target || !soldier(target, rt) || target.team === u.team ||
        Math.hypot(target.pos.x - u.pos.x, target.pos.z - u.pos.z) > 40) continue;
    if (u.team === 0) { fx += u.pos.x; fz += u.pos.z; fn++; }
    else if (u.team === 1) { gx += u.pos.x; gz += u.pos.z; gn++; }
  }
  if (fn && gn) { ax = fx; az = fz; an = fn; bx = gx; bz = gz; bn = gn; }
  else if (watch) {
    // 本物の兵がまだ斬り合っていなくても、遠景の押し合いは見える。
    // 避難用に拾った塊を使い回し、本陣や敗走者へ視線を戻さない。
    const C = rt.warCrowd;
    let x = 0, z = 0, n = 0;
    for (let i = 0; i < (C?.threatCount || 0); i++) {
      const q = C.threats[i];
      if (!q.fighting) continue;
      x += q.x; z += q.z; n++;
    }
    if (n) { out.x = x / n; out.z = z / n; return out; }
  }
  const teams = (an > 0 ? 1 : 0) + (bn > 0 ? 1 : 0);
  if (teams) {
    out.x = (ax / (an || 1) + bx / (bn || 1)) / teams;
    out.z = (az / (an || 1) + bz / (bn || 1)) / teams;
  }
  return out;
}

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// 見物場所・避難先を決める時と、逃げ直して落ち着く時に畦道を空ける。
// 自分の道も除けないと、先着した者が曲がり角に立ち、後続の子や年寄りを塞いでしまう。
function nearRefugeLeg(x, z, ax, az, bx, bz, gap) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
  const rx = x - ax - dx * t, rz = z - az - dz * t;
  return rx * rx + rz * rz < gap * gap;
}

// 最後の角から各人の待機先へ分かれる道も空ける。共通の終点だけでは斜めの退路が漏れる。
function refugeBlocksApproach(agents, x, z, gap, owner, reserving) {
  for (const b of agents) {
    if (b === owner || !b.out || !b.refuge || !b.g.route?.length) continue;
    const route = b.g.route, approach = route.length > 1 ? route[route.length - 2] : b.g.home;
    if (nearRefugeLeg(x, z, approach.x, approach.z, b.refuge.x, b.refuge.z, gap)) return true;
    // 新しい退路を予約する時は、先に決めた人の待機先を横切る場合も除く。
    if (reserving && owner?.g.route?.length) {
      const ownRoute = owner.g.route;
      const ownApproach = ownRoute.length > 1 ? ownRoute[ownRoute.length - 2] : owner.g.home;
      if (nearRefugeLeg(b.refuge.x, b.refuge.z, ownApproach.x, ownApproach.z, x, z, gap)) return true;
    }
  }
  return false;
}

function refugeBlocksRoute(rt, x, z, ownHome = null, owner = null, reserving = false) {
  const options = rt.def.civilianCrowd;
  if (!options?.keepRefugeRoutesClear) return false;
  const gap = (options.peopleSpacing ?? 0) + (options.refugeRadius ?? 0);
  for (const band of rt.civilianBands ?? options.bands ?? []) {
    if (!band.route?.length) continue;
    // 見物の散らばりでは自分の出発路を残し、別の一行が通る畦道だけを空ける。
    if (ownHome && band.x === ownHome.x && band.z === ownHome.z) continue;
    let ax = band.x, az = band.z;
    for (const p of band.route) {
      const dx = p.x - ax, dz = p.z - az, len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
      const rx = x - ax - dx * t, rz = z - az - dz * t;
      if (rx * rx + rz * rz < gap * gap) return true;
      ax = p.x; az = p.z;
    }
  }
  if (refugeBlocksApproach(rt.warCrowd?.agents ?? [], x, z, gap, owner, reserving)) return true;
  // 設営中の家族はまだ全体の名簿に入っていない。同じ一行の予約も互いに空ける。
  if (reserving && owner && refugeBlocksApproach(owner.g.agents, x, z, gap, owner, true)) return true;
  return false;
}

function addBandMikata(rt, C, x, z, kinds, mode, face, route = null, routeEnd = null, exitHeading = null) {
  const g = { home: { x, z }, mode, route, routeEnd, state: mode === 'inside' ? 'inside' : 'watch', agents: [], calm: 0, alarmUntil: 0, from: { x, z } };
  const keepResidents = !!(route && rt.def.civilianCrowd?.safeRetreat);
  let firstDanger = null;
  for (const [i, kind] of kinds.entries()) {
    if (C.agents.length >= CAP) break;
    let px = x, pz = z, found = false;
    for (let k = 0; k < 6; k++) {
      const a = i * 2.4 + k, r = 0.9 + i * 0.55 + k * 0.3;
      // 戸口を指定した家族は、狭い口の外へ順に並べる。建物の裏側へ散らさない。
      const door = mode === 'inside' && exitHeading != null;
      const forward = i * 0.55 + k * 0.35, side = (i % 2 ? 1 : -1) * 0.22;
      const tx = door ? x + Math.sin(exitHeading) * forward + Math.cos(exitHeading) * side : x + Math.cos(a) * r;
      const tz = door ? z + Math.cos(exitHeading) * forward - Math.sin(exitHeading) * side : z + Math.sin(a) * r;
      // 三方ヶ原の在所の民は、初めから兵が近くても省かず、里道へ逃がす。
      if (lightOpen(rt, tx, tz) && (keepResidents || !route || mode !== 'watch' || !nearSoldier(rt, tx, tz, 34))) { px = tx; pz = tz; found = true; break; }
    }
    if (!found) continue;
    // 初めも見物中と同じ距離で見る。遠くを歩く兵だけで、開戦前から全員を逃がさない。
    const scale = kind === 'child' ? 0.64 : kind === 'elder' ? 0.93 : 0.95 + rnd() * 0.08;
    if (keepResidents && mode === 'watch' && !firstDanger) firstDanger = dangerNear(rt, px, pz, 40, 14, 22, 1.5 * scale);
    const cols = CROWD[kind];
    // 里道の幅の中で家族の通る位置を分け、曲がり角でも全員を一点へ集めない。
    // 家・崖を横切るずらし方は採らず、座標は初めに作って使い回す。
    let personalRoute = null;
    const lane = rt.def.civilianCrowd?.routeSpread ?? 0;
    if (route?.length && lane > 0) {
      const offset = kinds.length > 1 ? (i * 2 / (kinds.length - 1) - 1) * lane : 0;
      personalRoute = route.map((p, j) => {
        if (j === route.length - 1) return p;
        const prev = route[j - 1] || g.home, next = route[j + 1];
        const dx = next.x - prev.x, dz = next.z - prev.z, len = Math.hypot(dx, dz) || 1;
        const q = { x: p.x + dz / len * offset, z: p.z - dx / len * offset };
        // 曲がり角の横だけ空いていても、前後の道が堂や崖を横切るずらし方は採らない。
        const from = j === 0 ? { x: px, z: pz } : route[j - 1];
        return pathClear(rt, p, q, true) &&
          (!rt.def.civilianCrowd.safeRetreat || pathClear(rt, from, q, true) && pathClear(rt, q, next, true)) ? q : p;
      });
      // 隣り合う角を両方ずらすと、元の角との確認だけでは内側を切ることがある。
      // 一度だけ実際の折れ線を確認し、通れなければ元の里道を使う。
      if (rt.def.civilianCrowd.safeRetreat) {
        let from = { x: px, z: pz };
        for (const p of personalRoute) {
          if (!pathClear(rt, from, p, true)) { personalRoute = null; break; }
          from = p;
        }
      }
    }
    // 三方ヶ原の退避先では、家族が一つの点に重ならず道端に分かれて待つ。
    // 行き先は初めに作り、移動中は同じ座標を使う。
    let end = null;
    const spread = rt.def.civilianCrowd?.endSpread ?? 0;
    if (route?.length && routeEnd === 'wait' && spread > 0) {
      const last = route[route.length - 1], angle = i * Math.PI * 2 / kinds.length;
      const ex = last.x + Math.cos(angle) * spread, ez = last.z + Math.sin(angle) * spread;
      const q = { x: ex, z: ez };
      const approach = (personalRoute || route)[route.length - 2] || { x: px, z: pz };
      // 道端の待ち場所も、最後の角から歩いて届く岸に限る。火の中を待機先にしない。
      if (lightOpen(rt, ex, ez) && (!rt.def.civilianCrowd.safeRetreat ||
          pathClear(rt, approach, q, true) && pathClear(rt, last, q, true) && retreatClear(rt, last, q))) end = q;
    }
    g.agents.push({
      kind, g, x: px, z: pz, h: face + (rnd() - 0.5) * 0.5, col: new THREE.Color(cols[i % cols.length]),
      sc: scale, ph: rnd() * 6,
      spd: (kind === 'child' ? 2.6 : kind === 'elder' ? 1.9 : 3.0) + rnd() * 0.5,
      tx: px, tz: pz, wpT: 0, clearT: 0, ran: 0, pace: 1, routeIndex: 0, personalRoute, end, offRoute: false, model: null, out: mode !== 'inside', idle: rnd() * 6,
    });
  }
  if (g.agents.length) {
    C.bands.push(g); C.agents.push(...g.agents);
    if (firstDanger) {
      g.alarmUntil = rt.t + (rt.def.civilianCrowd?.alarmMemory ?? 0);
      startFlee(rt, C, g, firstDanger);
    }
  }
}

// 家・土塁と地形越しの見物や、見えない隣人への反応を避ける。
// 避難路そのものには見通しを求めず、同じ岸の安全な場所へ退かせる。
function watchOpen(rt, from, to, kind) {
  const w = rt.world, eye = kind === 'child' ? 0.95 : kind === 'elder' ? 1.3 : 1.6;
  // 人を見る時は相手の背丈も使う。低い塀越しに子の頭が見えたことにしない。
  const targetEye = to.kind === 'child' ? 0.95 : to.kind === 'elder' ? 1.3 : 1.6;
  const ay = w.heightAt(from.x, from.z) + eye, by = w.heightAt(to.x, to.z) + targetEye;
  if (cameraWallBlocked(rt, from, to, ay, by)) return false;
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 3));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (w.heightAt(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t) > ay + (by - ay) * t - 0.2) return false;
  }
  return true;
}

function addBand(rt, C, x, z, kinds, mode, face, route = null, routeEnd = null, escapeBounds = null, keepTogether = false, watchAt = null) {
  if (!rt.def.civilianCrowd?.avoidArmies) return routeAddBand(rt, C, x, z, kinds, mode, face, route, routeEnd, watchAt);
  const g = { home: { x, z }, mode, route, routeEnd, escapeBounds, keepTogether, watchAt, state: mode === 'inside' ? 'inside' : 'watch', agents: [], calm: 0, from: { x, z } };
  const probe = { x, z };
  for (const [i, kind] of kinds.entries()) {
    if (C.agents.length >= CAP) break;
    let px = x, pz = z, found = false, routeIndex = 0;
    // 村口が兵や火で塞がれていても、その組を丸ごと消さない。
    // 姉川の指定路だけ、同じ岸の先の空き地まで順に探す。初期配置時だけの探索。
    const fallback = rt.def.civilianCrowd?.avoidArmies && mode === 'watch' && route?.length ? route.length : 0;
    placement: for (let step = 0; step <= fallback; step++) {
      const origin = step ? route[step - 1] : g.home;
      for (let k = 0; k < 6; k++) {
        const a = i * 2.4 + k, r = 0.9 + i * 0.55 + k * 0.3;
        const tx = origin.x + Math.cos(a) * r, tz = origin.z + Math.sin(a) * r;
        // 姉川の見物人は同じ岸の範囲へ置き、家や溝で里道から隔てられた場所を避ける。
        if (rt.def.civilianCrowd?.avoidArmies && route?.length && mode === 'watch') {
          if (escapeBounds && (tx < escapeBounds.minX || tx > escapeBounds.maxX || tz < escapeBounds.minZ || tz > escapeBounds.maxZ)) continue;
          probe.x = tx; probe.z = tz;
          if (!step && watchAt && rt.def.civilianCrowd.watchSight && !watchOpen(rt, probe, watchAt, kind)) continue;
          const next = route[Math.min(step, route.length - 1)];
          // 村口が安全でも、里道の途中に槍列がある場所からは見物させない。
          // 逃走時と同じ間隔で途中の兵も調べ、塞がれた時は先の空き地を探す。
          if (!pathClear(rt, probe, next, true) || nearSoldier(rt, next.x, next.z, 12, probe)) continue;
          // 塞がれた村口で候補をずらした時も、先に置いた家族や隣の組と重ねない。
          if (g.agents.some((a) => Math.hypot(a.x - tx, a.z - tz) < 0.9) ||
            C.agents.some((a) => Math.hypot(a.x - tx, a.z - tz) < 0.9)) continue;
        }
        // 姉川では燃える村口や斬り合いのそばを見物場所にしない。
        // 塞がれた時は同じ岸の避難路の先を探し、火の中へ人を置かない。
        // 見物をやめる時と同じ間隔で配置する。固定の三十四では、安全な村口も飛ばしてしまう。
        const unsafe = rt.def.civilianCrowd?.avoidArmies && mode === 'watch'
          ? dangerNear(rt, tx, tz, 40, rt.def.civilianCrowd.watchDistance ?? 14, 22)
          : route && mode === 'watch' && nearSoldier(rt, tx, tz, 34);
        if (lightOpen(rt, tx, tz) && !unsafe) {
          px = tx; pz = tz; routeIndex = step; found = true; break placement;
        }
      }
    }
    if (!found) continue;
    const cols = CROWD[kind];
    // 村口を離れて避難路へ回った人は、川前を振り返らず次の里道へ体を向ける。
    // 見物できる村口の人だけが川前を見る。避難先から家や丘を透かして見物させない。
    const look = routeIndex ? route[Math.min(routeIndex, route.length - 1)] : watchAt;
    const heading = look ? Math.atan2(look.x - px, look.z - pz) : face;
    g.agents.push({
      kind, g, x: px, z: pz, h: heading + (rnd() - 0.5) * 0.5, col: new THREE.Color(cols[i % cols.length]),
      sc: kind === 'child' ? 0.64 : kind === 'elder' ? 0.93 : 0.95 + rnd() * 0.08, ph: rnd() * 6,
      spd: (kind === 'child' ? 2.6 : kind === 'elder' ? 1.9 : 3.0) + rnd() * 0.5,
      tx: px, tz: pz, wpT: 0, safeT: 0, ran: 0, routeIndex, routeFree: false, blockedSteps: 0, model: null, out: mode !== 'inside', idle: rnd() * 6,
    });
    // 既に避難を始めた家族は先の道へ進む。元の村口へ引き返さない。
    if (routeIndex) g.state = 'flee';
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

function routeAddBand(rt, C, x, z, kinds, mode, face, route = null, routeEnd = null, watchAt = null,
  targetClearance = rt.def.civilianCrowd?.watchTargetClearance, exitHeading = null) {
  if (rt.def.civilianCrowd?.safeRetreat) return addBandMikata(rt, C, x, z, kinds, mode, face, route, routeEnd, exitHeading);
  if (rt.def.civilianCrowd?.safeFlee) return addBandOdani(rt, C, x, z, kinds, mode, face, route, routeEnd, watchAt);
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

function addBandOdani(rt, C, x, z, kinds, mode, face, route = null, routeEnd = null, watchAt = null) {
  const g = { home: { x, z }, mode, route, routeEnd, state: mode === 'inside' ? 'inside' : 'watch', agents: [], calm: 0, from: { x, z } };
  let fleeFrom = null;
  for (const [i, kind] of kinds.entries()) {
    if (C.agents.length >= CAP) break;
    const eyeHeight = (kind === 'child' ? 0.64 : kind === 'elder' ? 0.93 : 1) * 1.5;
    let px = x, pz = z, found = false, fallback = null, routeIndex = 0;
    const localWatch = rt.def.civilianCrowd?.safeFlee && route && mode === 'watch';
    const watchDistance = rt.def.civilianCrowd?.watchDistance ?? 34;
    const startSpacing = rt.def.civilianCrowd?.startSpacing ?? 0;
    for (let k = 0; k < (startSpacing > 0 ? 12 : 6); k++) {
      const a = i * 2.4 + k, r = 0.9 + i * 0.55 + k * 0.3;
      const tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
      if (!lightOpen(rt, tx, tz) || !localWatch && route && mode === 'watch' && nearSoldier(rt, tx, tz, watchDistance)) continue;
      // 小谷の庭や畦で別の組とも体を重ねない。候補探しは戦の初めだけ。
      if (startSpacing > 0 && (C.agents.some((b) => Math.hypot(tx - b.x, tz - b.z) < startSpacing)
        || g.agents.some((b) => Math.hypot(tx - b.x, tz - b.z) < startSpacing))) continue;
      if (rt.def.civilianCrowd?.safeFlee) {
        // 小谷の寺庭・畦の肩でも、里道まで段差を横切らず戻れる所に立つ。
        const probe = { x: tx, z: tz, sc: eyeHeight / 1.5 };
        // 初めから兵が迫っていても、在所の民を消さずに避難へ移す。
        // 予備の位置も建物・水路・段差・火を避け、里道へつながる所だけ残す。
        if ((rt.world.fires || []).some((f) => f.lit !== false && f.size >= (rt.def.civilianCrowd.fireSize ?? 2)
          && crowdFireDistance(rt, tx, tz, f) < 5) || !pathClear(rt, probe, g.home, true, false, true)) continue;
        // 見物には近すぎる兵も予備位置の危険として残し、民を配置から落とさない。
        const threat = dangerNear(rt, tx, tz, 40, localWatch ? watchDistance : 14, 22, eyeHeight);
        if (threat) {
          if (localWatch && !fallback && !nearSoldier(rt, tx, tz, 2)) { probe.threat = threat; fallback = probe; }
          continue;
        }
        if (route && mode === 'watch' && nearSoldier(rt, tx, tz, watchDistance, eyeHeight) || !pathClear(rt, probe, g.home, true)) continue;
      }
      px = tx; pz = tz; found = true; break;
    }
    // 安全な見物場所がなければ、家族を残して組ごと直ちに避難を始める。
    if (!found && fallback) { px = fallback.x; pz = fallback.z; found = true; fleeFrom ??= fallback.threat; }
    // 戸口や庭が燃えている時は、既に里道へ退いた者として置く。
    // 指定された畦だけを探し、家・田・砦へ散らさない。探索は配置時だけ。
    if (!found && localWatch) {
      for (let j = 1; j < route.length && !found; j++) {
        const from = route[j - 1], to = route[j];
        const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz);
        const steps = Math.max(1, Math.ceil(len / 3));
        for (let k = 1; k <= steps * 3 && !found; k++) {
          const t = Math.ceil(k / 3) / steps, side = ((k - 1) % 3 - 1) * Math.max(1.4, startSpacing);
          const probe = { x: from.x + dx * t - dz * side / (len || 1),
            z: from.z + dz * t + dx * side / (len || 1), sc: eyeHeight / 1.5 };
          if (!lightOpen(rt, probe.x, probe.z)
            || C.agents.some((b) => Math.hypot(probe.x - b.x, probe.z - b.z) < Math.max(1.4, startSpacing))
            || g.agents.some((b) => Math.hypot(probe.x - b.x, probe.z - b.z) < Math.max(1.4, startSpacing))
            || dangerNear(rt, probe.x, probe.z, 40, watchDistance, 22, eyeHeight)
            || !pathClear(rt, probe, to, true, true)) continue;
          px = probe.x; pz = probe.z; routeIndex = j; found = true;
          // 元の庭へ戻らず、この先の角から家族と避難を続ける。
          fleeFrom ??= dangerNear(rt, x, z, 40, watchDistance, 22, eyeHeight) || g.home;
        }
      }
    }
    if (!found) continue;
    const cols = CROWD[kind];
    const spacing = rt.def.civilianCrowd?.waitSpacing ?? 0;
    const end = route?.[route.length - 1];
    // 退避先の立ち位置は初めに作り、道の途中の角は全員で共有する。
    let waitPoint = end && routeEnd === 'wait' && spacing > 0
      ? { x: end.x + Math.floor(i / 3) * spacing, z: end.z + (i % 3 - 1) * spacing } : null;
    // 畦の端が水路・家・段差なら、同じ終点へ全員を集めず最後の里道に待ち場所を探す。
    // 別の家族の予約も避ける。配置時だけ調べ、毎コマの道探しは増やさない。
    if (waitPoint && rt.def.civilianCrowd?.safeFlee) {
      const prev = route[Math.max(0, route.length - 2)];
      const dx = prev.x - end.x, dz = prev.z - end.z, len = Math.hypot(dx, dz);
      // 小谷では畦の肩に一列で待ち、後から逃げてくる家族の通り道を空ける。
      // 最後の道の向きに合わせる。立ち位置を作るのは配置時だけ。
      if (rt.def.civilianCrowd.waitBesidePath && len > 0) {
        waitPoint = { x: end.x + (dx * i - dz) * spacing / len,
          z: end.z + (dz * i + dx) * spacing / len };
      }
      const free = (p) => {
        for (const list of [C.agents, g.agents]) for (const b of list) {
          if (b.waitPoint && Math.hypot(p.x - b.waitPoint.x, p.z - b.waitPoint.z) < spacing - 0.001) return false;
        }
        // 待つ場所の予約は地形だけで決める。一時的な兵や火で全員を同じ終点へ戻さない。
        // 実際に向かう時は通常の避難判定で兵・火を避け、安全になるまで手前で待つ。
        return pathClear(rt, end, p, true, true, true);
      };
      if (!free(waitPoint)) {
        waitPoint = end;
        // 道の幅の中で三列に分け、家族を追い越して元の庭へは戻さない。
        // 終点の近くだけで足りなければ、最後の里道の長さまで待ち場所を探す。
        for (let k = 0; k < 3 * (Math.floor(len / spacing) + 1); k++) {
          const back = Math.floor(k / 3) * spacing, side = (k % 3 - 1) * spacing;
          if (!len || back > len) break;
          const p = { x: end.x + (dx * back - dz * side) / len, z: end.z + (dz * back + dx * side) / len };
          if (free(p)) { waitPoint = p; break; }
        }
      }
    }
    const heading = mode === 'watch' && watchAt ? Math.atan2(watchAt.x - px, watchAt.z - pz) : face;
    g.agents.push({
      kind, g, x: px, z: pz, h: heading + (rnd() - 0.5) * 0.5, col: new THREE.Color(cols[i % cols.length]),
      sc: kind === 'child' ? 0.64 : kind === 'elder' ? 0.93 : 0.95 + rnd() * 0.08, ph: rnd() * 6,
      spd: (kind === 'child' ? 2.6 : kind === 'elder' ? 1.9 : 3.0) + rnd() * 0.5,
      tx: px, tz: pz, wpT: 0, ran: 0, routeIndex, waitPoint, waitForFamily: false, model: null, out: mode !== 'inside', idle: rnd() * 6,
    });
  }
  if (g.agents.length) {
    C.bands.push(g); C.agents.push(...g.agents);
    if (fleeFrom) startFlee(rt, C, g, fleeFrom);
  }
}

function addBandDefault(rt, C, x, z, kinds, mode, face, route = null, routeEnd = null, watchAt = null) {
  const g = { home: { x, z }, mode, route, routeEnd, state: mode === 'inside' ? 'inside' : 'watch', agents: [], calm: 0, from: { x, z }, threat: null };
  const crowd = rt.def.civilianCrowd;
  const initialEscape = mode === 'watch' && route?.length > 0 && crowd?.evacuateAtStart;
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
    const attempts = crowd?.peopleSpacing > 0 ? 24 : 6;
    for (let k = 0; k < attempts * places.length; k++) {
      const place = places[Math.floor(k / attempts)], cx = place.x, cz = place.z;
      const j = k % attempts;
      const a = i * 2.4 + j, r = 0.9 + i * 0.55 + j * 0.3;
      const tx = cx + Math.cos(a) * r, tz = cz + Math.sin(a) * r;
      if (!lightOpen(rt, tx, tz)) continue;
      if (mode === 'watch' && crowd?.keepWatchRoutesClear && refugeBlocksRoute(rt, tx, tz, g.home)) continue;
      const spacing = crowd?.peopleSpacing;
      if (spacing > 0 && (C.agents.some((b) => Math.hypot(tx - b.x, tz - b.z) < spacing) ||
        g.agents.some((b) => Math.hypot(tx - b.x, tz - b.z) < spacing))) continue;
      if (route?.length && (mode === 'watch' || crowd?.safeRouteSetup) &&
        !pathClear(rt, { x: tx, z: tz }, route[place.routeIndex], true, initialEscape, initialEscape)) continue;
      if (!initialEscape && mode === 'watch' && crowd?.safeRouteSetup && dangerNear(rt, tx, tz, 40, 14, 22)) continue;
      // 狭い戸口で家族を重ねると、逃走時の間隔判定で互いを塞いでしまう。
      // 既存の間隔指定がある戦だけ、同じ体幅を設営時にも空ける。
      if (crowd?.keepCivilianSpacing) {
        const sc = kind === 'child' ? 0.64 : kind === 'elder' ? 0.93 : 1.03;
        const overlaps = (b) => Math.hypot(tx - b.x, tz - b.z) < 0.38 * (sc + b.sc) + 0.02;
        if (C.agents.some(overlaps) || g.agents.some(overlaps)) continue;
      }
      if (k >= attempts && !pathClear(rt, place.from, { x: tx, z: tz }, true)) continue;
      // 見物人だけでなく戸口の家族も、散らばった位置から次の角へ出られること。
      // 家の反対側や急な岸には置かず、既存の水・火・塀の判定を共用する。
      if (route?.length && (mode === 'watch' ? crowd?.checkWatchEscape : crowd?.checkDoorEscape)
        && !pathClear(rt, { x: tx, z: tz }, route[place.routeIndex], true)) continue;
      if (route && mode === 'watch' && !initialEscape) {
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
    // 既に避難を始めた家族は先の道へ進む。元の村口へ引き返さない。
    if (routeIndex) g.state = 'flee';
  }
  if (rt.def.civilianCrowd?.keepFamiliesTogether && route && g.agents.length > 1
    && g.agents.some((a) => a.kind === 'child' || a.kind === 'elder')) {
    // 家族は子や年寄りの走れる速さに合わせる。設営時だけ決め、逃走中の計算を増やさない。
    let pace = Infinity;
    for (const a of g.agents) pace = Math.min(pace, a.spd);
    for (const a of g.agents) a.spd = pace;
  }
  if (g.agents.length) {
    // 家族や堂の一行は、子や年寄りの足に合わせて退く。速さは設営時に一度だけ揃える。
    if (rt.def.civilianCrowd?.keepTogether) {
      let pace = Infinity;
      for (const a of g.agents) pace = Math.min(pace, a.spd);
      for (const a of g.agents) a.spd = pace;
    }
    // 避難先では隣の一行とも場所を分ける。設営時だけ調べ、逃げる最中に押し合うのを防ぐ。
    const spacing = rt.def.civilianCrowd?.refugeSpacing;
    if (route?.length && routeEnd === 'wait' && spacing > 0) {
      const end = route[route.length - 1];
      const rings = rt.def.civilianCrowd?.refugeSearchRings ?? 0;
      // 曲がり角の待ち合わせ距離より家族の避難先を離すと、全員が着く前に待ち続ける。
      // 到着と見なす半径も両端から引き、実際に止まる位置でも一行の間合いを保つ。
      const familyGap = rt.def.civilianCrowd?.keepTogether && rt.def.civilianCrowd?.maxSeparation;
      const refugeGap = familyGap > 0 ? Math.max(0, familyGap - 2 * (rt.def.civilianCrowd?.routeRadius ?? 4)) : Infinity;
      const approach = route.length > 1 ? route[route.length - 2] : g.home;
      const direction = Math.atan2(end.z - approach.z, end.x - approach.x);
      for (const [i, a] of g.agents.entries()) {
        // 岩村では終点のすぐ周りが埋まっても、小段の奥まで避難先を探す。
        // 狭い同じ輪だけを探して終点へ戻すと、先着した家族が後続の道を塞いでしまう。
        // 設営時だけ広げ、田・建物・段差を避ける判定と、一行どうしの間隔は保つ。
        // まず安全な待機先を探す。初めから避難する岩村だけは、空きがなければ
        // 地形上の候補も予約する。通行時は兵・火を再確認し、危険な間は近寄らない。
        // 一時的な兵の位置で予約を全て失い、全員が同じ終点へ集まるのを防ぐ。
        const trials = rings > 0 ? 1 + rings * 12 : 24;
        for (let trial = 0; trial < trials * (initialEscape ? 2 : 1); trial++) {
          const terrainOnly = trial >= trials, k = trial % trials;
          // 細い空き地でも、最後の道に沿う前後の候補を必ず含める。
          const h = rings > 0 ? direction + (k - 1) * Math.PI / 6 : i * 2.4 + k * 0.7;
          const r = rings > 0 ? (spacing + 0.1) * Math.ceil(k / 12) : spacing * (1 + Math.floor(k / 8) * 0.5);
          // 個別の空きがない人は道の終点へ向かうので、その人との距離も残す。
          if (r > refugeGap) continue;
          const p = { x: end.x + Math.cos(h) * r, z: end.z + Math.sin(h) * r };
          if (refugeBlocksRoute(rt, p.x, p.z, null, a, true)) continue;
          if (g.agents.some((b) => b.refuge && Math.hypot(p.x - b.refuge.x, p.z - b.refuge.z) > refugeGap)) continue;
          // 岩村では見物場所と同じ間合いで避難先も選ぶ。兵・火のそばを家族の待機場所にしない。
          // 最後の角からの道も逃走時の判定に揃え、別の兵や火へ近づく経路を予約しない。
          if (rt.def.civilianCrowd?.safeRouteSetup &&
            ((!terrainOnly && dangerNear(rt, p.x, p.z, 40, 14, 22)) ||
              !pathClear(rt, route.length > 1 ? route[route.length - 2] : a, p, true, true, terrainOnly))) continue;
          if (!pathClear(rt, end, p, true, false, terrainOnly) ||
            C.agents.some((b) => b.refuge && Math.hypot(p.x - b.refuge.x, p.z - b.refuge.z) < spacing) ||
            g.agents.some((b) => b.refuge && Math.hypot(p.x - b.refuge.x, p.z - b.refuge.z) < spacing)) continue;
          a.refuge = p; break;
        }
      }
    }
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
  const C = rt.warCrowd = { agents: [], bands: [], pool: [], scan: 0, poolT: 0, screamT: -99, barked: false, playerAttackUntil: -1, threats: [], threatCount: 0, routMatrix: new THREE.Matrix4(), routPoint: new THREE.Vector3(), mtn, center: battleCenter(rt), sight: { x: 0, y: 0, z: 0 }, fireSight: { x: 0, y: 0, z: 0 } };
  C.armyPoint = new THREE.Vector3(); C.armyDanger = { x: 0, z: 0 };
  if (rt.def.civilianCrowd?.safeRetreat) crowdArmies(rt, C);
  else scanDistant(rt, C);
  const ctr = rt.def.civilianCrowd?.watchAt ?? C.center, half = rt.world.half;
  // 土地ごとの在所・堂と逃げ道が指定された戦は、兵の中心から民を散らさない。
  const bands = rt.civilianBands ?? rt.def.civilianCrowd?.bands;
  if (bands) {
    const watch = rt.def.civilianCrowd?.watchTarget?.(rt) ?? rt.def.civilianCrowd?.watchAt ?? ctr;
    for (const s of bands) {
      // 家並みの反対側の民まで砦へ向けず、その場所から開けた寄せ道を見せる。
      const at = s.watchAt ?? watch;
      if (rt.def.civilianCrowd?.avoidArmies) addBand(rt, C, s.x, s.z, s.kinds, s.mode ?? 'watch',
        Math.atan2(at.x - s.x, at.z - s.z), s.route, s.routeEnd, s.escapeBounds, s.keepTogether, at);
      else routeAddBand(rt, C, s.x, s.z, s.kinds, s.mode ?? 'watch',
        Math.atan2(at.x - s.x, at.z - s.z), s.route, s.routeEnd, at, s.watchTargetClearance ?? rt.def.civilianCrowd?.watchTargetClearance, s.exitHeading);
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
    // 岩村の里の荷姿。既存の箱と藁の材質を借り、近景の人と一緒に使い回す。
    // 逃げる時も身につけた荷だけを運び、荷物を兵の当たりや人数へ加えない。
    if ((rt.def.civilianCrowd?.carryGoods || rt.def.civilianCrowd?.carryBelongings) && (kind === 'farmer' || kind === 'merchant')) {
      const load = new THREE.Mesh(rt.warPeople.box, rt.warPeople.straw);
      if (kind === 'farmer') {
        load.position.set(0, 1.05, -0.31); load.scale.set(0.48, 0.6, 0.3);
      } else {
        load.position.set(-0.38, 0.65, -0.12); load.scale.set(0.32, 0.38, 0.3);
      }
      if (rt.def.civilianCrowd?.carryBelongings) {
        load.position.set(0, 1.05, -0.34);
        if (kind === 'merchant') load.scale.set(0.62, 0.48, 0.38);
        u.body.add(load);
      } else mesh.add(load);
    }
    mesh.userData.noFreeze = true; mesh.userData.civilian = CROWD_NAMES[kind];
    mesh.visible = false; rt.scene.add(mesh);
    C.pool.push({ kind, u, mesh, a: null });
  }
  // 最初の描画を待たず、一行の端に迫る兵や火も含めて逃げ始める。
  if (rt.def.civilianCrowd?.evacuateAtStart) crowdScan(rt, C, 0);
}

function startFlee(rt, C, g, from, x = g.home.x, z = g.home.z, alarmAt = rt.t) {
  g.state = 'flee'; g.from.x = from.x; g.from.z = from.z; g.threat = from; g.calm = 0;
  g.fledAt = alarmAt;
  g.dangerActive = true;
  // 谷底と曲輪の兵の比高を、逃げる向きの判定まで引き継ぐ。
  if (rt.def.civilianCrowd?.safeFlee) {
    g.from.y = from.base ?? from.y ?? rt.world.heightAt(from.x, from.z);
    g.from.size = from.size ?? 0;
  }
  const immediate = rt.def.civilianCrowd?.checkEscapeStep || rt.def.civilianCrowd?.avoidArmies;
  for (const a of g.agents) {
    a.out = true; a.ran = 0; a.waiting = false; a.safeT = 0;
    // 岩村は兵・火に気づいた回から道を選ぶ。再避難でも古い行き先へ歩き出さない。
    a.wpT = immediate ? 0 : rnd() * 0.3;
    if (immediate) { a.tx = a.x; a.tz = a.z; a.retrying = false; a.escapeT = 0; }
  }
  if (rt.def.civilianCrowd?.safeFlee || rt.def.civilianCrowd?.safeRetreat) {
    // 里道の先で再び逃げる時は、元の寺庭ではなく今いる場所から声を出す。
    x = 0; z = 0;
    for (const a of g.agents) { x += a.x; z += a.z; }
    x /= g.agents.length; z /= g.agents.length;
  }
  const cam = rt.camera.position;
  // 小段へ退いた後の悲鳴も、元の見物場所ではなく今いる人からの距離で聞こえる。
  let d = Infinity;
  for (const a of g.agents) if (a.out) d = Math.min(d, Math.hypot(cam.x - a.x, cam.z - a.z));
  if (d < 90 && rt.t - C.screamT > 6) {
    C.screamT = rt.t;
    const v = Math.max(0.15, 1 - d / 90);
    sfx('himei', v);
    rt.after?.(0.5 + rnd() * 0.4, () => { if (!rt.over) sfx('himei', v * 0.7); });
    if (!C.barked && d < 60 && !rt.over) { C.barked = true; rt.bark?.(g.mode === 'inside' ? '悲鳴。家の者が逃げ出していく' : '悲鳴。見物の者が逃げていく'); }
  }
}

function routeDangerNear(rt, x, z, rFight, rWalk, rFire, eye = 1.4) {
  if (rt.def.civilianCrowd?.safeFlee) return dangerNearOdani(rt, x, z, rFight, rWalk, rFire, typeof eye === 'number' ? eye : 1.5);
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

function dangerNearOdani(rt, x, z, rFight, rWalk, rFire, eyeHeight = 1.5) {
  let best = null, bd = 1e9;
  const heightGap = rt.def.civilianCrowd?.soldierHeightClearance;
  const ground = heightGap == null ? 0 : rt.world.heightAt(x, z);
  for (const u of rt.army.units) {
    if (!soldier(u, rt)) continue;
    const dx = u.pos.x - x, dz = u.pos.z - z;
    if (Math.abs(dx) > rFight || Math.abs(dz) > rFight) continue;
    const d = crowdDistance(rt, x, z, u.pos, u.pos.y), hot = civilianCombatActive(rt, u) || u.target?.alive;
    if ((hot && d < rFight || d < rWalk) && d < bd && crowdNoticesSoldier(rt, x, z, u.pos, d, eyeHeight)) { bd = d; best = u.pos; }
  }
  const C = rt.warCrowd;
  for (let i = 0; i < (C?.distantCount || 0); i++) {
    const p = C.distant[i];
    if (Math.abs(p.x - x) >= rWalk || Math.abs(p.z - z) >= rWalk) continue;
    const d = crowdDistance(rt, x, z, p, p.y);
    if (d < rWalk && d < bd && crowdNoticesSoldier(rt, x, z, p, d, eyeHeight)) { bd = d; best = p; }
  }
  for (const f of rt.world.fires || []) if (f.lit !== false && f.size >= (rt.def.civilianCrowd?.fireSize ?? 2)) {
    const d = crowdFireDistance(rt, x, z, f);
    if (d < rFire && d < bd && crowdNoticesFire(rt, x, z, f, d, eyeHeight)) { bd = d; best = f; }
  }
  return best;
}

function dangerNearDefault(rt, x, z, rFight, rWalk, rFire, watchFire = false) {
  if (rt.def.civilianCrowd?.safeRetreat) return dangerNearMikata(rt, x, z, rFight, rWalk, rFire);
  // 村の子や年寄りは、斬り合いを始めていない兵にも早めに道を空ける。
  // 見物・避難後の待機・家族を待つ判断で同じ間合いを使う。
  rWalk = Math.max(rWalk, rt.def.civilianCrowd?.soldierNotice ?? 0);
  const radius = Math.max(rFight, rWalk);
  let best = null, bd = 1e9;
  const heightGap = rt.def.civilianCrowd?.soldierHeightClearance;
  const ground = heightGap == null ? 0 : rt.world.heightAt(x, z);
  for (const u of rt.army.units) {
    if (!soldier(u, rt)) continue;
    const dx = u.pos.x - x, dz = u.pos.z - z;
    if (Math.abs(dx) > radius || Math.abs(dz) > radius) continue;
    // 平面上で近いだけの山上の兵には驚かず、同じ高さへ下りてきた兵から逃げる。
    if (heightGap != null && Math.abs(u.pos.y - ground) > heightGap) continue;
    const d = Math.hypot(dx, dz), hot = civilianCombatActive(rt, u) || u.target?.alive;
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

// 三方ヶ原では、近くの足音以外は坂と身舎の見通しで危険を察する。
// 見物と避難で同じ目線を使い、確認用の座標も使い回す。
const mikataNoticeEye = { x: 0, z: 0, sc: 1 };
function mikataDangerVisible(rt, x, z, point, distance, eye, targetEye, rWalk) {
  // 組を囲む円は候補の絞り込みだけ。見通しは、その後の一人ずつの確認で調べる。
  if (!rt.def.civilianCrowd?.terrainDangerNotice || rWalk > 14 || distance <= 12) return true;
  mikataNoticeEye.x = x; mikataNoticeEye.z = z; mikataNoticeEye.sc = eye / 1.5;
  return battleVisible(rt, mikataNoticeEye, point, targetEye);
}

function dangerNearMikata(rt, x, z, rFight, rWalk, rFire, eye = 1.4) {
  let best = null, bd = 1e9;
  const C = rt.warCrowd;
  const watchBattle = rt.def.civilianCrowd?.watchBattle;
  // 騎馬には早めに気づいて里道へ退く。判定の入れ物は使い回す。
  const mountedWarning = rt.def.civilianCrowd?.mountedWarning ?? 0;
  const routedWarning = rt.def.civilianCrowd?.routedWarning ?? 0;
  for (let i = 0; i < (C?.threatCount || 0); i++) {
    const q = C.threats[i], d = threatDistance(q, x, z);
    const walk = rWalk + (q.mounted ? mountedWarning : 0);
    if (d < (q.hot ? Math.max(rFight, walk) : walk) && d < bd
      && mikataDangerVisible(rt, x, z, q, d, eye, q.mounted ? 2.2 : 1.4, rWalk)) { bd = d; best = q; }
  }
  for (const u of rt.army.units) {
    if (!soldier(u, rt)) continue;
    const dx = u.pos.x - x, dz = u.pos.z - z;
    // 遠景の敗走者と同じく、本物の敗兵にも早く気づく。静かな布陣の見物は保つ。
    // 倒れた者には広げず、里道へ逃げてくる兵だけを見る。
    const routed = !u.downed && (u.fleeing || u.group?.routed);
    const walk = Math.max(rWalk, routed ? routedWarning : 0) + (u.mounted ? mountedWarning : 0);
    const reach = Math.max(rFight, walk);
    if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
    // 三方ヶ原の見物人は、遠い敵を狙って待つ兵だけで逃げ出さない。
    // 視線と同じ交戦距離を使い、兵が近づいた時と実際の斬り合いには従来どおり逃げる。
    const target = u.target;
    const hot = u.atk || u.swing || target?.alive && (!watchBattle ||
      soldier(target, rt) && target.team !== u.team && Math.hypot(target.pos.x - u.pos.x, target.pos.z - u.pos.z) <= 40);
    const d = Math.hypot(dx, dz);
    if ((hot && d < rFight || d < walk) && d < bd
      && mikataDangerVisible(rt, x, z, u.pos, d, eye, u.mounted ? 2.2 : 1.4, rWalk)) { bd = d; best = u.pos; }
  }
  for (const f of rt.world.fires || []) if (f.lit !== false && f.size >= (rt.def.civilianCrowd?.fireSize ?? 2)) {
    const d = Math.max(0, Math.hypot(f.x - x, f.z - z) - crowdFireMargin(rt, f));
    if (d < rFire && d < bd && mikataDangerVisible(rt, x, z, f, d, eye, civilianFireEye(rt, f), rWalk)) { bd = d; best = f; }
  }
  return best;
}

// 呼び声は、戸口からつながる里道の角を順にたどる。
// 道のりが届く範囲だけ調べ、壁・水・犀ヶ崖の向こうへ近道させない。
// 見回り時だけ既存の角を使い、座標の入れ物は増やさない。
function alarmReachable(rt, a, b, g, radius) {
  if (pathClear(rt, a, b, true, false, false, true)) return true;
  if (!rt.def.civilianCrowd.alarmAroundCorners || !g.route) return false;
  let previous = b, distance = 0;
  for (const corner of g.route) {
    distance += Math.hypot(previous.x - corner.x, previous.z - corner.z);
    if (distance > radius || !pathClear(rt, previous, corner, true, false, false, true)) return false;
    if (distance + Math.hypot(a.x - corner.x, a.z - corner.z) <= radius &&
        pathClear(rt, a, corner, true, false, false, true)) return true;
    previous = corner;
  }
  return false;
}

// 戸口の家族へ、近くの里道を逃げる者の危険を伝える。
// 三方ヶ原では見物人も知らせを受け、兵が目の前に来るまで見続けない。
// 歩いて届く同じ岸だけを見る。犀ヶ崖の対岸へは連鎖させない。
function residentAlarm(rt, C, g) {
  const settings = rt.def.civilianCrowd, radius = settings?.residentWarning;
  const watching = settings?.warnWatchers && g.state === 'watch' && g.mode === 'watch' &&
    g.agents.some((a) => a.routeIndex === 0 && !a.offRoute);
  // 退避済みの家族も、同じ岸から届く新しい知らせで逃げ直す。
  // 里道を歩いている途中の組には広げず、期限切れの伝言も従来どおり捨てる。
  const sheltered = settings?.warnShelteredResidents && g.state === 'watch' && g.routeEnd === 'wait' &&
    g.route?.length && g.agents.every((a) => a.out && !a.offRoute &&
      a.routeIndex === (a.personalRoute || g.route).length);
  if (!radius || g.state !== 'inside' && !watching && !sheltered) return null;
  for (const a of C.agents) {
    if (a.g === g || !a.out || a.g.state !== 'flee') continue;
    const moving = a.ran >= 1 && Math.hypot(a.tx - a.x, a.tz - a.z) >= 0.3;
    if (!moving && !settings.warnBlockedRefugees) continue;
    for (const b of g.agents) {
      if (Math.abs(a.x - b.x) > radius || Math.abs(a.z - b.z) > radius ||
          Math.hypot(a.x - b.x, a.z - b.z) > radius) continue;
      // 火で里道が塞がれても、近い家族へ呼び声は届く。
      // 知らせだけ炎の判定を外す。歩く時の火よけと、壁・水・崖の遮りは保つ。
      if (!alarmReachable(rt, a, b, g, radius)) continue;
      // 道を兵や火に塞がれて動けない者も、同じ岸の家族へ危険を知らせる。
      // 立ち止まった者からは、いま迫る危険がある時だけ伝える。
      // 安全な退避先で後続を待つ者からは連鎖させない。
      if (watching || sheltered || !moving || settings.alarmMemory) {
        const danger = dangerNear(rt, a.x, a.z, 40, 14, 22, 1.5 * a.sc);
        if (danger) {
          g.alarmUntil = rt.t + (settings.alarmMemory ?? 0);
          return danger;
        }
        // 長い里道を走っているだけの者から、消えた火などの古い危険を伝え続けない。
        // 直前の知らせは戸口にも見物仲間にも届けるが、伝言で期限を延ばして連鎖させない。
        if (moving && settings.alarmMemory && a.g.alarmUntil > rt.t) {
          g.alarmUntil = a.g.alarmUntil;
          return a.g.from;
        }
      } else return a.g.from;
    }
  }
  return null;
}

// 麓へ逃げた民は、台地や崖の陰を透かして戦を見続けない。
// 見回り時だけ地面と目線を比べる。座標や形は作らず、子の目の高さも背丈に合わせる。
function battleVisible(rt, a, target, targetEye = 1.2) {
  const dx = target.x - a.x, dz = target.z - a.z;
  // 細い崖の縁も飛び越して透視しない。近い危険を絞った後だけ調べる。
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 2));
  const eye = rt.world.heightAt(a.x, a.z) + 1.5 * a.sc;
  const end = rt.world.heightAt(target.x, target.z) + targetEye;
  // 指定された家・堂の壁も目線を遮る。回した身舎へ線分を移し、細い壁も飛ばさず見る。
  // 見回り時だけ数値で調べ、描く形や毎コマの入れ物は増やさない。
  const buildings = rt.def.civilianCrowd?.watchBuildings;
  if (buildings) for (const b of buildings) {
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const ox = (a.x - b.x) * c - (a.z - b.z) * s;
    const oz = (a.x - b.x) * s + (a.z - b.z) * c;
    const vx = dx * c - dz * s, vz = dx * s + dz * c;
    let near = 0, far = 1;
    if (Math.abs(vx) < 1e-8) { if (Math.abs(ox) > b.w / 2) continue; }
    else {
      const t0 = (-b.w / 2 - ox) / vx, t1 = (b.w / 2 - ox) / vx;
      near = Math.max(near, Math.min(t0, t1)); far = Math.min(far, Math.max(t0, t1));
    }
    if (Math.abs(vz) < 1e-8) { if (Math.abs(oz) > b.d / 2) continue; }
    else {
      const t0 = (-b.d / 2 - oz) / vz, t1 = (b.d / 2 - oz) / vz;
      near = Math.max(near, Math.min(t0, t1)); far = Math.min(far, Math.max(t0, t1));
    }
    if (near > far) continue;
    const base = rt.world.heightAt(b.x, b.z), top = base + b.h;
    const y0 = eye + (end - eye) * near, y1 = eye + (end - eye) * far;
    if (Math.min(y0, y1) <= top && Math.max(y0, y1) >= base) return false;
  }
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (rt.world.heightAt(a.x + dx * t, a.z + dz * t) > eye + (end - eye) * t) return false;
  }
  return true;
}

// 平均地点が坂や堂の陰でも、見えている端の斬り合いを目で追う。
// 三方ヶ原の見回りだけで使い、目線の追加確認は一人六か所まで。座標は既存の物を借りる。
function visibleBattleTarget(rt, C, a) {
  if (battleVisible(rt, a, C.center)) return C.center;
  let checked = 0;
  for (let i = 0; i < C.threatCount; i++) {
    const q = C.threats[i];
    if (!q.fighting) continue;
    if (checked++ >= 6) return null;
    if (battleVisible(rt, a, q)) return q;
  }
  for (const u of rt.army.units) {
    if (!soldier(u, rt) || u.fleeing || u.woundOut || u.downed) continue;
    const target = u.atk?.target || u.swing?.target || u.target;
    if (!target || !soldier(target, rt) || target.team === u.team ||
        Math.hypot(target.pos.x - u.pos.x, target.pos.z - u.pos.z) > 40) continue;
    if (checked++ >= 6) return null;
    if (battleVisible(rt, a, u.pos)) return u.pos;
  }
  return null;
}

function dangerNear(rt, x, z, rFight, rWalk, rFire, watchFire = 1.4) {
  if (rt.def.civilianCrowd?.safeRetreat) return dangerNearMikata(rt, x, z, rFight, rWalk, rFire, typeof watchFire === 'number' ? watchFire : 1.4);
  if (!rt.def.civilianCrowd?.avoidArmies) return routeDangerNear(rt, x, z, rFight, rWalk, rFire, watchFire);
  let best = null, bd = 1e9;
  // 姉川では足の速い騎馬に早く気づき、子や年寄りも里道を空けられる間を取る。
  const horseRadius = Math.max(rWalk, rt.def.civilianCrowd?.horseDistance ?? rWalk);
  const approachSeconds = rt.def.civilianCrowd?.approachSeconds ?? 0;
  for (const u of rt.army.units) {
    if (!soldier(u, rt)) continue;
    const dx = u.pos.x - x, dz = u.pos.z - z;
    const walkRadius = u.mounted ? horseRadius : rWalk, scanRadius = Math.max(rFight, walkRadius) + (approachSeconds ? 12 : 0);
    if (Math.abs(dx) > scanRadius || Math.abs(dz) > scanRadius) continue;
    const d = Math.hypot(dx, dz), hot = civilianCombatActive(rt, u) || u.target?.alive;
    // 姉川だけ、寄せる兵の最接近を短く先読みする。遠ざかる兵では見物をやめない。
    // 先読みは十二歩まで。既存の見回しで計算し、位置の入れ物は作らない。
    let approaching = false;
    if (approachSeconds && d >= walkRadius) {
      const vx = u.vel?.x ?? 0, vz = u.vel?.z ?? 0, speed2 = vx * vx + vz * vz;
      const closing = dx * vx + dz * vz;
      if (speed2 > 0.01 && closing < 0) {
        const t = Math.min(approachSeconds, 12 / Math.sqrt(speed2), -closing / speed2);
        approaching = (dx + vx * t) ** 2 + (dz + vz * t) ** 2 < walkRadius * walkRadius;
      }
    }
    if ((hot && d < rFight || d < walkRadius || approaching) && d < bd
      && dangerVisible(rt, x, z, u.pos, d, watchFire, u.mounted ? 2.2 : 1.4)) { bd = d; best = u.pos; }
  }
  for (const f of rt.world.fires || []) if (f.lit !== false && f.size >= (rt.def.civilianCrowd?.fireSize ?? 2)) {
    const d = Math.hypot(f.x - x, f.z - z);
    if (d < fireRadius(rt, f, rFire) && d < bd
      && dangerVisible(rt, x, z, f, d, watchFire, civilianFireEye(rt, f))) { bd = d; best = f; }
  }
  // 控えの槍列は歩く兵の距離、斬り合う列は実兵の乱戦と同じ距離で怖がる。
  // 避難路の通行判定は戦ごとの間隔を使い、既に迫られた人は離れる向きへ抜ける。
  return nearLightArmy(rt, x, z, Math.min(rWalk, bd), null, Math.min(rFight, bd), Math.min(horseRadius, bd), watchFire) || best;
}

// 曲がった里道では直線の間隔だけで家族の遅れを測らない。
// 道中は最後の畦でも共通の終点までの残りを比べる。
// 各人の待ち場所までで比べると、手前で待つ子や年寄りの遅れを短く数えてしまう。
// 自分の待ち場所に着いた者は残りを零にし、迎えに戻らせない。
// 見回りの時だけ計算し、座標の入れ物は作らない。
function familyRouteRemaining(a, route) {
  if (a.routeIndex >= route.length) return 0;
  const point = route[a.routeIndex];
  let distance = Math.hypot(a.x - point.x, a.z - point.z);
  if (a.routeIndex > 0) {
    const prev = route[a.routeIndex - 1];
    // 待ち場所は畦の肩へずれるが、進みは里道の向きで測る。
    // 斜めの線で測ると、横へよけた家族を再び遅れと取り違える。
    const end = route[a.routeIndex];
    const dx = end.x - prev.x, dz = end.z - prev.z;
    const length = Math.hypot(dx, dz);
    // 畦の肩へよけた子を、道に沿って遅れた子と取り違えない。
    // 角の手前までの進みを道へ写し、横によけた距離は家族の間隔に含めない。
    if (length > 0) distance = Math.max(0, Math.min(length,
      ((point.x - a.x) * dx + (point.z - a.z) * dz) / length));
  }
  for (let i = a.routeIndex + 1; i < route.length; i++) {
    distance += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  }
  return distance;
}

function crowdScanMikata(rt, C) {
  crowdArmies(rt, C);
  // 三方ヶ原の見物人は、寄せや退却で移る軍勢を目で追う。座標は使い回す。
  const watchBattle = rt.def.civilianCrowd?.watchBattle;
  if (watchBattle) battleCenter(rt, C.center);
  for (const g of C.bands) {
    if (g.state === 'gone') continue;
    let cx = 0, cz = 0;
    for (const a of g.agents) { cx += a.x; cz += a.z; }
    cx /= g.agents.length; cz /= g.agents.length;
    // 家族が道で離れても、端の子や年寄りへ迫る兵・火を見落とさない。
    // まず組の広がりで絞る。安全な組まで一人ずつ兵を探し直さない。
    let spread = 0;
    if (rt.def.civilianCrowd?.safeRetreat) for (const a of g.agents) {
      if (a.out || g.state === 'inside') spread = Math.max(spread, Math.hypot(a.x - cx, a.z - cz));
    }
    const inside = g.state === 'inside';
    let dn = dangerNear(rt, cx, cz, (inside ? 34 : 40) + spread, (inside ? 12 : 14) + spread, (inside ? 26 : 22) + spread);
    if (dn && rt.def.civilianCrowd?.safeRetreat) {
      // 崖を回る家族が離れると、組を囲む円は無人の岸まで含む。
      // 誰にも近づいていない兵・火だけで、安全な里道から逃げ続けさせない。
      dn = null;
      for (const a of g.agents) {
        if (!a.out && !inside) continue;
        dn = dangerNear(rt, a.x, a.z, inside ? 34 : 40, inside ? 12 : 14, inside ? 26 : 22, 1.5 * a.sc);
        if (dn) break;
      }
    }
    if (dn) g.alarmUntil = rt.t + (rt.def.civilianCrowd?.alarmMemory ?? 0);
    else dn = residentAlarm(rt, C, g);
    if (dn) {
      if (g.state !== 'flee') startFlee(rt, C, g, dn);
      else { g.from.x = dn.x; g.from.z = dn.z; }
      // 新たに迫った兵や火を見る時は、古い行き先へ進み続けず、同じ更新で道を選び直す。
      if (rt.def.civilianCrowd?.safeRetreat) for (const a of g.agents) a.wpT = 0;
      g.calm = 0; continue;
    }
    // 里道の終点では、家族全員に兵も火も迫っていない時だけ見物へ戻る。
    // 一人ずつの歩みで戻すと、先に調べた安全な者が組を止め、後ろの子が逃げ直せなくなる。
    if (rt.def.civilianCrowd?.safeRetreat && g.state === 'flee' && g.routeEnd === 'wait' && g.route &&
        g.agents.every((a) => a.routeIndex === (a.personalRoute || g.route).length && !a.offRoute)) g.state = 'watch';
    // 里道の終点で避難路を手放した後も、安全な所から動く戦場へ向き直る。
    if (watchBattle && g.state === 'watch') for (const a of g.agents) {
      const target = rt.def.civilianCrowd.watchTerrain ? visibleBattleTarget(rt, C, a) : C.center;
      if (!target) continue;
      const h = Math.atan2(target.x - a.x, target.z - a.z);
      const turn = Math.atan2(Math.sin(h - a.h), Math.cos(h - a.h));
      a.h += Math.max(-0.25, Math.min(0.25, turn));
    }
    if (g.state === 'flee' && !g.route && ++g.calm > 6 && g.agents.every((a) => !a.out || a.ran > 22)) {
      // 十分離れて静かになれば、立ち止まって振り返る（また見物する）。
      g.state = 'watch';
      for (const a of g.agents) { a.tx = a.x; a.tz = a.z; a.h = Math.atan2(g.from.x - a.x, g.from.z - a.z) + (rnd() - 0.5) * 0.4; }
    }
  }
}

function crowdScanOdani(rt, C) {
  scanDistant(rt, C);
  for (const g of C.bands) {
    if (g.state === 'gone') continue;
    // 危険が迫れば付き添いの歩調を解き、全員が自分の速さで退く。
    if (rt.def.civilianCrowd?.escortPace) for (const a of g.agents) a.escortSpeed = 0;
    if (g.state !== 'flee' || !rt.def.civilianCrowd?.keepTogether) {
      for (const a of g.agents) a.waitForFamily = false;
    }
    let cx = 0, cz = 0;
    for (const a of g.agents) { cx += a.x; cz += a.z; }
    cx /= g.agents.length; cz /= g.agents.length;
    const inside = g.state === 'inside';
    // 見物中は配置時と同じ間合いを保つ。里道の後の再避難も、十分離れるまで見物へ戻さない。
    // 小谷では退避の途中も見物と同じ間合いを保ち、里道の終点で兵のそばに居直らない。
    const walkRadius = inside ? 12 : rt.def.civilianCrowd?.safeFlee || g.state === 'watch' || !g.route
      ? (rt.def.civilianCrowd?.watchDistance ?? 14) : 14;
    // 小谷の家族の中心は、家の壁や里道の角の向こうになることがある。
    // 架空の中心から兵を見つけず、下で実際にいる一人ずつの場所から気づく。
    let dn = rt.def.civilianCrowd?.safeFlee ? null
      : dangerNear(rt, cx, cz, inside ? 34 : 40, walkRadius, inside ? 26 : 22);
    if (rt.def.civilianCrowd?.safeFlee) {
      // 退避中に列が伸びても、遅れた子や年寄りのそばの兵・火を見落とさない。
      // 危険に最も近い一人を基準にし、組全体で退く。
      let closest = Infinity;
      for (const a of g.agents) {
        if (!a.out && !inside) continue;
        // 小谷の退避中は、選んだ先へ後から兵や火が入った時も道を選び直す。
        // 既存の見回りで短い区間だけ調べ、毎コマの検査や入れ物は増やさない。
        if (a.out && g.state === 'flee' && Math.hypot(a.tx - a.x, a.tz - a.z) > 0.05) {
          C.wp.x = a.tx; C.wp.z = a.tz;
          if (!pathClear(rt, a, C.wp, true, true)) { a.tx = a.x; a.tz = a.z; a.wpT = 0; }
        }
        const threat = dangerNear(rt, a.x, a.z, inside ? 34 : 40, walkRadius, inside ? 26 : 22, a.sc * 1.5);
        if (!threat) continue;
        const d = crowdThreatDistance(rt, a.x, a.z, threat);
        if (d < closest) { closest = d; dn = threat; }
      }
    }
    if (!dn) dn = fleeingNeighbor(rt, C, g);
    if (rt.def.civilianCrowd?.safeFlee) {
      // 消えた火や去った兵の跡を避け続けず、安全になった里道へ進み直す。
      // 振り返る向きは残し、危険が今もあるかだけを既存の見回りで更新する。
      if (g.dangerActive && !dn) for (const a of g.agents) a.wpT = 0;
      g.dangerActive = !!dn;
    }
    if (dn) {
      // 家族を待つ間に兵や火が来たら、待機を解いて全員で退く。
      for (const a of g.agents) a.waitForFamily = false;
      if (g.state !== 'flee') startFlee(rt, C, g, dn);
      else {
        g.from.x = dn.x; g.from.z = dn.z; g.threat = dn;
        if (rt.def.civilianCrowd?.safeFlee) {
          g.from.y = dn.base ?? dn.y ?? rt.world.heightAt(dn.x, dn.z);
          g.from.size = dn.size ?? 0;
        }
        // 小谷では見回りで危険を見つけたら、古い向きへ走り続けず次の一歩を選び直す。
        if (rt.def.civilianCrowd?.safeFlee) for (const a of g.agents) a.wpT = 0;
      }
      g.calm = 0; continue;
    }
    const watchRange = rt.def.civilianCrowd?.watchTrackDistance;
    if (watchRange && g.state === 'watch') {
      // 小谷の寺庭・町屋の肩・村の畦では、各人から最も近くに見える兵を追う。
      // 架空の家族の中心で一人を選ぶと、本人のそばを通る別の兵を見落とす。
      // 子や年寄りの背丈と、民家・堂・尾根による遮りも本人の場所で調べる。
      // 既存の見回りだけで向きを変え、見物のために軍道へ近づかせない。
      for (const a of g.agents) {
        if (!a.out) continue;
        const eyeHeight = a.sc * 1.5;
        let target = null, range = watchRange;
        for (let i = 0; i < rt.army.units.length + C.distantCount; i++) {
          const u = rt.army.units[i];
          if (u && !soldier(u, rt)) continue;
          const p = u ? u.pos : C.distant[i - rt.army.units.length];
          // 遠い兵は高さや視線を調べる前に外す。座標の入れ物は増やさない。
          if (Math.abs(p.x - a.x) >= range || Math.abs(p.z - a.z) >= range) continue;
          const d = crowdDistance(rt, a.x, a.z, p, p.y);
          if (d >= range || !crowdCanSee(rt, a.x, a.z, p, eyeHeight)) continue;
          target = p; range = d;
        }
        if (target) a.h = Math.atan2(target.x - a.x, target.z - a.z);
      }
    }
    if (rt.def.civilianCrowd?.keepTogether && g.state === 'flee') {
      // 安全な里道では、先行した大人が遅い子・年寄りを待つ。危険が来たら全員逃げる。
      for (const a of g.agents) {
        if (!a.out || a.kind === 'child' || a.kind === 'elder') continue;
        // 六メートル離れたら待ち、三メートルまで戻ってから一緒に進む。
        // 同じ境目で走る・止まるを繰り返さず、待つ間は家族を振り返る。
        const familyDistance = a.waitForFamily ? 3 : 6;
        a.waitForFamily = false;
        const remaining = g.route ? familyRouteRemaining(a, g.route) : 0;
        for (const b of g.agents) {
          if (!b.out || b.kind !== 'child' && b.kind !== 'elder') continue;
          // 寺から家の裏へ曲がる所も、道に沿って六メートル先行したら待つ。
          // 終点で横へ並ぶ家族を、遅れた者と取り違えない。
          const gap = g.route ? familyRouteRemaining(b, g.route) - remaining : Math.hypot(a.x - b.x, a.z - b.z);
          // 小谷の里道では、近くの子や年寄りと歩調を合わせる。
          // 大人が六メートル先へ走っては止まる動きを減らす。既に待ち場所へ着いた者には合わせない。
          if (rt.def.civilianCrowd?.escortPace && gap >= -3 && gap < familyDistance
            && (g.route ? b.routeIndex < g.route.length : Math.hypot(a.x - b.x, a.z - b.z) < 6)) {
            a.escortSpeed = Math.min(a.escortSpeed || a.spd, b.spd);
          }
          if (gap < familyDistance) continue;
          // 畦の終点から再び退く時も、危険から遠くへ先行した大人が家族を待つ。
          const ahead = g.route || crowdDistance(rt, a.x, a.z, g.from, g.from.y) > crowdDistance(rt, b.x, b.z, g.from, g.from.y);
          if (ahead) { a.waitForFamily = true; a.h = Math.atan2(b.x - a.x, b.z - a.z); break; }
        }
      }
    }
    if (g.state === 'flee' && !g.route && ++g.calm > 6 && g.agents.every((a) => !a.out
      || (rt.def.civilianCrowd?.safeFlee || a.ran > 22) && !a.waitForFamily)) {
      // 小谷では全員の周りから兵・火が去って静かになれば、安全な畦で振り返る。
      // 再避難の距離が短くても、二十二メートル走ろうとして里道の端へ走り続けない。
      // ほかの戦は、従来どおり十分な距離を走ってから見物へ戻る。
      g.state = 'watch';
      for (const a of g.agents) { a.tx = a.x; a.tz = a.z; a.h = Math.atan2(g.from.x - a.x, g.from.z - a.z) + (rnd() - 0.5) * 0.4; }
    }
  }
}

function routeCrowdScan(rt, C, elapsed = 0) {
  const watch = rt.def.civilianCrowd?.watchTarget?.(rt);
  if (rt.def.civilianCrowd?.safeFlee) return crowdScanOdani(rt, C);
  scanDistant(rt, C);
  // 同じ村口で逃げ出した人が見えたら、小堂や隣の家の者も避難する。
  // 探索を始める時の状態を控え、一度の探索で離れた組まで恐慌を連鎖させない。
  const warningDistance = rt.def.civilianCrowd?.neighborWarningDistance ?? 0;
  if (warningDistance) for (const g of C.bands) g.warning = g.state === 'flee';
  for (const g of C.bands) {
    if (g.state === 'gone') continue;
    redirectCrowdExit(rt, g);
    const inside = g.state === 'inside';
    // 集団の端の子や年寄りに兵・火が迫った時も、一緒に逃げる。
    let dn = null, nearest = Infinity, alarmAt = rt.t;
    for (const a of g.agents) {
      if (!a.out && !inside) continue;
      const threat = dangerNear(rt, a.x, a.z, inside ? 34 : 40, inside ? 12 : 14, inside ? 26 : 22, rt.def.civilianCrowd?.individualDanger ? civilianEye(a.kind) : true);
      if (!threat) continue;
      const d = Math.hypot(threat.x - a.x, threat.z - a.z);
      // 並び順で遠い兵を選ばず、子や年寄りも含め一行に最も近い危険から離れる。
      if (d < nearest) {
        nearest = d;
        // 共有の探索座標だけ写す。備そのものの位置は残し、避難時も列の外縁を避ける。
        if (threat === troopNearest) { g.from.x = threat.x; g.from.z = threat.z; dn = g.from; }
        else dn = threat;
      }
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
    if (dn) { if (g.state !== 'flee') startFlee(rt, C, g, dn, g.home.x, g.home.z, alarmAt); else { g.from.x = dn.x; g.from.z = dn.z; g.threat = dn; } g.calm = 0; continue; }
    if (g.route && rt.def.civilianCrowd?.followRouteWhenCalm) g.threat = null;
    // 岩村の追撃が麓へ移れば、安全な見物人もゆっくりそちらを向く。
    // 避難を経験した者は、家族を待つ向きや逃げてきた危険への振り返りを保つ。
    if (watch && g.state === 'watch') for (const a of g.agents) {
      if (!a.out || a.ran > 0) continue;
      const target = Math.atan2(watch.x - a.x, watch.z - a.z);
      const turn = Math.atan2(Math.sin(target - a.h), Math.cos(target - a.h));
      const step = elapsed * 1.2;
      a.h += Math.max(-step, Math.min(step, turn));
    }
    // 岩村は気づきを早めても、落ち着くまでの時間まで短くしない。
    const calmSeconds = rt.def.civilianCrowd?.calmSeconds;
    if (g.state === 'flee') {
      if (!g.route) {
        // 逃げ直した先でも、後続の家族が通る畦道を空けてから落ち着く。
        if (g.agents.every((a) => !a.out || !refugeBlocksRoute(rt, a.x, a.z, null, a))) g.calm += calmSeconds > 0 ? elapsed : 1;
        else g.calm = 0;
      }
      else if (calmSeconds > 0 && g.routeEnd === 'wait') {
        // 小段では家族全員の到着後から安全な時間を数える。道中の静けさで待ち時間を済ませない。
        if (g.agents.every((a) => a.routeIndex === g.route.length && !a.refugeEscaping)) g.calm += elapsed;
        else g.calm = 0;
      }
    }
    // 岩村の小段は逃げられる幅が限られる。全員から危険が去って六秒たてば、
    // 二十二メートル走れなくても落ち着く。兵や火が残る間は上の見回りで待ち時間を戻す。
    if (g.state === 'flee' && !g.route && g.calm > (calmSeconds > 0 ? calmSeconds : 6) &&
      (rt.def.civilianCrowd?.stopWhenCalm || g.agents.every((a) => !a.out || a.ran > 22))) {
      // 十分離れて静かになれば、立ち止まって振り返る（また見物する）。
      g.state = 'watch';
      for (const a of g.agents) { a.tx = a.x; a.tz = a.z; a.h = Math.atan2(g.from.x - a.x, g.from.z - a.z) + (rnd() - 0.5) * 0.4; }
    }
  }
}

// 民どうしは兵の当たりに加えず、逃げる一歩だけで互いの間隔を見る。
function crowdSpace(C, a, x, z, spacing) {
  if (!(spacing > 0)) return true;
  const dx = x - a.x, dz = z - a.z, len2 = dx * dx + dz * dz, gap2 = spacing * spacing;
  for (const b of C.agents) {
    if (b === a || !b.out) continue;
    const sx = a.x - b.x, sz = a.z - b.z, start2 = sx * sx + sz * sz, dot = sx * dx + sz * dz;
    // すでに近すぎる時は離れる一歩を通し、互いを押し合って立ちすくませない。
    if (start2 < gap2) {
      if (dot < 0) return false;
    } else {
      const t = len2 > 0 ? Math.max(0, Math.min(1, -dot / len2)) : 0;
      const px = sx + dx * t, pz = sz + dz * t;
      if (px * px + pz * pz < gap2) return false;
    }
  }
  return true;
}


function familyPace(rt, a, route) {
  const gap = rt.def.civilianCrowd?.familyGap;
  if (!gap || !route) return 1;
  const point = route[a.routeIndex];
  const separated = rt.def.civilianCrowd.waitSeparatedFamily;
  let pace = 1;
  for (const b of a.g.agents) {
    if (b === a || !b.out || b.routeIndex > a.routeIndex ||
        !separated && (b.offRoute || b.spd >= a.spd)) continue;
    if (Math.hypot(a.x - b.x, a.z - b.z) <= gap) continue;
    if (b.routeIndex === a.routeIndex &&
        Math.hypot(point.x - b.x, point.z - b.z) <= Math.hypot(point.x - a.x, point.z - a.z) + 1) continue;
    // 道を外れた家族も置き去りにしない。崖や堂を挟んだ別の岸では待たない。
    // 通れるかの確認は、間隔が開いた家族だけ。座標の入れ物は作らない。
    if (b.offRoute && !pathClear(rt, a, b, true)) continue;
    // 後ろの子や年寄りに追手・火が迫る間も、先頭だけ安全だからと減速しない。
    // 待つ必要がある家族だけを調べ、離れていない組の見回りは増やさない。
    if (dangerNear(rt, b.x, b.z, 40, 14, 22, 1.5 * b.sc)) return 1;
    // 元の足が速い者も、里道の角や人待ちで遅れる。速さだけで待つ相手を除かない。
    // 戸口や角で止まった家族には、安全な先の道で立ち止まって待つ。
    // 足の速さだけで減速すると、後ろが動けない間も離れ続けてしまう。
    const waiting = separated && Math.hypot(b.tx - b.x, b.tz - b.z) < 0.3;
    pace = Math.min(pace, waiting ? 0 : Math.min(a.spd, b.spd) * 0.8 / a.spd);
  }
  // 兵や火が近い間は、家族を待つために逃げ足を緩めない。
  return pace < 1 && dangerNear(rt, a.x, a.z, 40, 14, 22, 1.5 * a.sc) ? 1 : pace;
}

function crowdScan(rt, C, elapsed = 0) {
  if (rt.def.civilianCrowd?.safeRetreat) return crowdScanMikata(rt, C);
  if (rt.def.civilianCrowd?.safeFlee) return crowdScanOdani(rt, C);
  if (!rt.def.civilianCrowd?.avoidArmies) return routeCrowdScan(rt, C, elapsed);
  // 同じ村口で逃げ出した人が見えたら、小堂や隣の家の者も避難する。
  // 探索を始める時の状態を控え、一度の探索で離れた組まで恐慌を連鎖させない。
  const warningDistance = rt.def.civilianCrowd?.neighborWarningDistance ?? 0;
  if (warningDistance) for (const g of C.bands) g.warning = g.state === 'flee';
  for (const g of C.bands) {
    if (g.state === 'gone') continue;
    const inside = g.state === 'inside';
    const walkDistance = inside ? 12 : (rt.def.civilianCrowd?.watchDistance ?? 14);
    let dn = null;
    // 姉川は本人の位置で確かめる。中心の二歩以内でも、端の子に兵や火が先に迫る。
    // 離れた家族の間の空き地を危険と誤認せず、既存の探索間隔で全員を見る。
    if (rt.def.civilianCrowd?.avoidArmies) {
      for (const a of g.agents) {
        if (!inside && !a.out) continue;
        dn = dangerNear(rt, a.x, a.z, inside ? 34 : 40, walkDistance, inside ? 26 : 22, civilianEye(a.kind));
        if (dn) break;
      }
    } else {
      let cx = 0, cz = 0;
      for (const a of g.agents) { cx += a.x; cz += a.z; }
      cx /= g.agents.length; cz /= g.agents.length;
      dn = dangerNear(rt, cx, cz, inside ? 34 : 40, walkDistance, inside ? 26 : 22);
    }
    // 姉川の村口は、配置後も戸や陣幕で川前を遮られることがある。
    // 見えなくなった家族は壁越しに見物を続けず、指定された同じ岸の里道へ退く。
    // 既存の探索時だけ調べ、避難先で休む人を見物へ戻さない。
    if (!dn && rt.def.civilianCrowd?.watchSight && g.state === 'watch' && g.watchAt && g.route?.length) {
      for (const a of g.agents) {
        if (a.out && !watchOpen(rt, a, g.watchAt, a.kind)) {
          startFlee(rt, C, g, g.watchAt);
          break;
        }
      }
    }
    // 避難先で休む組も、見える隣人が逃げ直したら危険に気づく。
    if (!dn && warningDistance && (g.state === 'watch' || g.state === 'rest')) {
      neighbors: for (const other of C.bands) {
        if (!other.warning || other === g) continue;
        for (const a of g.agents) {
          if (!a.out) continue;
          for (const b of other.agents) {
            // 避難先で足を止めた人ではなく、実際に逃げている姿に気づく。
            if (!b.out || Math.hypot(b.tx - b.x, b.tz - b.z) < 0.3 ||
              Math.hypot(a.x - b.x, a.z - b.z) > warningDistance || !watchOpen(rt, a, b, a.kind)) continue;
            dn = other.from;
            // 本人の探知範囲に兵が入る前でも、数歩は隣人と一緒に退く。
            // 短い間だけ覚え、安全なら元の里道と避難先を使う。
            g.warningUntil = rt.t + 2.4;
            break neighbors;
          }
        }
      }
    }
    if (dn) { if (g.state !== 'flee') startFlee(rt, C, g, dn); else { g.from.x = dn.x; g.from.z = dn.z; } g.calm = 0; continue; }
    const end = g.route?.[g.route.length - 1];
    // 姉川で道を外れただけの人を到着扱いにしない。途中で見物へ戻すと、
    // 道が空いても避難先へ戻る探索が止まる。終点の近くまで避難を続ける。
    const arrived = g.routeEnd === 'wait' && g.route && g.agents.every((a) => !a.out ||
      (a.routeFree ? !rt.def.civilianCrowd?.avoidArmies || end && Math.hypot(a.x - end.x, a.z - end.z) < 4
        : a.routeIndex === g.route.length));
    if (g.state === 'flee' && g.route && !arrived) g.calm = 0;
    if (g.state === 'flee' && (!g.route || arrived) && ++g.calm > 6 && g.agents.every((a) => !a.out || a.ran > 22 ||
      g.routeEnd === 'wait' && g.route && (a.routeFree && rt.def.civilianCrowd?.avoidArmies ||
        !a.routeFree && a.routeIndex === g.route.length))) {
      // 避難先に残った人は、仲間だけが逃げ直した時にも余分に走らせず落ち着かせる。
      // 姉川の里の者は避難先で休む。見通せても川前の見物へは戻さない。
      // 休む組も上の危険探しを続け、残る兵や火が迫れば再び逃げる。
      const resting = rt.def.civilianCrowd?.restAtRefuge && g.routeEnd === 'wait' && arrived;
      g.state = resting ? 'rest' : 'watch';
      // 川前が見える避難先だけで振り返る。家や丘に遮られた人は、逃げてきた向きで休む。
      // 初期配置と同じ背丈で見通しを調べる。落ち着いた時だけで、毎コマの探索は増やさない。
      const look = g.watchAt ?? g.from;
      for (const a of g.agents) {
        a.tx = a.x; a.tz = a.z;
        if (resting) {
          // 避難してきた向きを保ち、遅れた子や年寄りがいればそちらを向いて休む。
          let family = null, distance = Infinity;
          for (const b of g.agents) {
            if (b === a || !b.out || b.kind !== 'child' && b.kind !== 'elder') continue;
            const d = Math.hypot(b.x - a.x, b.z - a.z);
            if (d > 0.9 && d < distance) { family = b; distance = d; }
          }
          if (family) a.h = Math.atan2(family.x - a.x, family.z - a.z);
          continue;
        }
        if (a.out && (!rt.def.civilianCrowd?.watchSight || watchOpen(rt, a, look, a.kind))) {
          a.h = Math.atan2(look.x - a.x, look.z - a.z) + (rnd() - 0.5) * 0.4;
        }
      }
    }
  }
}

// 同じ里道を逃げる大人は、安全な所で遅れた子や年寄りを待つ。
// 子も先走った時は大人を待つ。大人が年寄りを待つ間に、子だけ村外れへ走り去らせない。
// 道を離れた子や年寄りも待つが、川や兵の方へ迎えには戻らない。探索の時だけ調べる。
function waitForFamily(rt, a) {
  const g = a.g;
  const end = g.route?.[g.route.length - 1];
  if (!g.keepTogether || !end || a.kind === 'elder') return null;
  const remaining = familyRouteRemaining(a, g.route);
  for (const b of g.agents) {
    if (b === a || !b.out) continue;
    const dependent = b.kind === 'child' || b.kind === 'elder';
    if (a.kind === 'child' ? dependent : !dependent) continue;
    const dx = a.x - b.x, dz = a.z - b.z;
    // 曲がった畦では残りの道の長さで遅れを測る。
    // どちらかが道をよけている間は、二人とも避難先までの直線距離で比べる。
    // 同じ物差しを使い、子と大人が互いを待って止まることを防ぐ。
    const offRoute = a.routeFree || b.routeFree;
    const ownRemaining = offRoute ? Math.hypot(a.x - end.x, a.z - end.z) : remaining;
    const otherRemaining = offRoute ? Math.hypot(b.x - end.x, b.z - end.z) : familyRouteRemaining(b, g.route);
    // 家や丘の向こうの家族を透かして待たない。見えなければ避難先へ進み、
    // 里道で再び姿が見えた時に待つ。道を選ぶ時だけ調べ、毎コマは探さない。
    if (dx * dx + dz * dz > 64 &&
      otherRemaining > ownRemaining + 4 &&
      watchOpen(rt, a, b, a.kind)) return b;
  }
  return null;
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

// 指定路を歩き終えた後も、土地ごとの里道とその肩を退き先にする。
function onRetreatPath(rt, x, z) {
  const paths = rt.def.civilianCrowd?.retreatPaths;
  if (!paths) return true;
  const width = rt.def.civilianCrowd.retreatWidth ?? 6;
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const sx = x - a[0] - dx * t, sz = z - a[1] - dz * t;
    if (sx * sx + sz * sz <= width * width) return true;
  }
  return false;
}

// 見回りの合間に火が点いたり広がった時も、実際の一歩で炎へ近づかない。
// 小谷の里道だけで使い、火から離れる歩みは許す。座標の入れ物は作らない。
function crowdFireStepClear(rt, a, x, z) {
  const cfg = rt.def.civilianCrowd;
  if (!cfg?.safeFlee) return true;
  const dx = x - a.x, dz = z - a.z;
  let ground, dy, len2;
  for (const f of rt.world.fires || []) {
    if (f.lit === false || f.size < (cfg.fireSize ?? 2)) continue;
    if (ground === undefined) {
      ground = rt.world.heightAt(a.x, a.z);
      dy = rt.world.heightAt(x, z) - ground;
      len2 = dx * dx + dz * dz + dy * dy;
    }
    // 処理が遅れて一歩が長くなっても、終点の手前の炎を飛び越さない。
    // 坂の比高と炎の幅を含め、歩く区間で最も火に近づく所を調べる。
    const fx = f.x - a.x, fz = f.z - a.z;
    const fy = (f.base ?? f.y ?? rt.world.heightAt(f.x, f.z)) - ground;
    const t = len2 ? Math.max(0, Math.min(1, (fx * dx + fz * dz + fy * dy) / len2)) : 0;
    const distance = Math.hypot(fx - dx * t, fz - dz * t, fy - dy * t)
      - f.size * (cfg.fireRadiusScale ?? 0);
    const before = crowdFireDistance(rt, a.x, a.z, f);
    // 一歩の確認も道選びと同じ目線で行う。近い熱は遮蔽物があっても避ける。
    if (distance < Math.min(22, before) - 0.001
      && crowdNoticesFire(rt, a.x + dx * t, a.z + dz * t, f, distance, a.sc * 1.5)) return false;
  }
  return true;
}

// 小谷では、見回りの合間に里道へ入った兵も実際の一歩で避ける。
// 軽い控え兵も見回りで拾った足元を使い、逃げる途中ですり抜けない。
// 二メートル以内へ踏み込まず、既に近い兵から離れる歩みは許す。
// 遠い兵は平面だけで外し、座標の入れ物や道探しを毎コマ増やさない。
function crowdSoldierStepClear(rt, a, x, z) {
  if (!rt.def.civilianCrowd?.safeFlee) return true;
  const dx = x - a.x, dz = z - a.z;
  const reach = Math.hypot(dx, dz) + 2;
  const C = rt.warCrowd;
  let ground, dy, len2;
  for (let i = 0; i < rt.army.units.length + (C?.distantCount || 0); i++) {
    const u = rt.army.units[i];
    if (u && !soldier(u, rt)) continue;
    const p = u ? u.pos : C.distant[i - rt.army.units.length];
    const bx = p.x - a.x, bz = p.z - a.z;
    if (Math.abs(bx) > reach || Math.abs(bz) > reach) continue;
    if (ground === undefined) {
      ground = rt.world.heightAt(a.x, a.z);
      dy = rt.world.heightAt(x, z) - ground;
      len2 = dx * dx + dz * dz + dy * dy;
    }
    // 尾根の上の兵は、比高のある谷の里道を塞がない。
    const by = p.y - ground, start2 = bx * bx + bz * bz + by * by;
    const t = len2 ? Math.max(0, Math.min(1, (bx * dx + bz * dz + by * dy) / len2)) : 0;
    const sx = bx - dx * t, sz = bz - dz * t, sy = by - dy * t;
    if (sx * sx + sz * sz + sy * sy < Math.min(4, start2) - 0.000001) return false;
  }
  return true;
}

// 里道の合流でも、先を歩く子や別の家族をすり抜けない。
// 区間の最短距離を使い、既に近い者同士は離れる一歩を許す。入れ物は作らない。
function crowdStepClear(C, a, x, z, spacing) {
  if (!spacing) return true;
  const dx = x - a.x, dz = z - a.z, len2 = dx * dx + dz * dz;
  const reach2 = (Math.sqrt(len2) + spacing) ** 2;
  for (const b of C.agents) {
    if (b === a || !b.out) continue;
    const bx = b.x - a.x, bz = b.z - a.z;
    const start2 = bx * bx + bz * bz;
    const radius2 = Math.min(spacing * spacing, start2);
    if (start2 > reach2) continue;
    const t = len2 ? Math.max(0, Math.min(1, (bx * dx + bz * dz) / len2)) : 0;
    const sx = bx - dx * t, sz = bz - dz * t;
    if (sx * sx + sz * sz < radius2 - 0.000001) return false;
  }
  return true;
}

// 逃げる先を三メートル先に一つ選ぶ。危険から離れ、山では谷へ下る。
function waitForRouteFamily(rt, a, route = null) {
  if (!(rt.def.civilianCrowd?.maxSeparation > 0)) return;
  a.waiting = true;
  let last = null, farthest = 0;
  for (const b of a.g.agents) {
    if (b === a || !b.out || route && b.routeIndex >= route.length) continue;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d > farthest) { farthest = d; last = b; }
  }
  // 岩村の畦や避難先では、先に着いた者が遅れた子・年寄りを振り返って待つ。
  if (last) a.h = Math.atan2(last.x - a.x, last.z - a.z);
}

function routeFleeStep(rt, C, a) {
  if (rt.def.civilianCrowd?.safeFlee) return fleeStepOdani(rt, C, a);
  if (!rt.def.civilianCrowd?.individualEscape) {
    if (!rt.def.civilianCrowd?.narrowEscape) return fleeStepOther(rt, C, a);
    return fleeStepDefault(rt, C, a);
  }
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

// 岩村の畦では家族を待ち、塞がった角だけ短い歩みで避ける。
function fleeStepDefault(rt, C, a) {
  const g = a.g, w = rt.world;
  a.retrying = false;
  a.waiting = false;
  // 一行の両側から兵が来た時、端の子や年寄りを反対側の兵へ逃がさない。
  // 岩村では一歩を選ぶ時だけ本人の危険を拾う。共有の危険と家族の避難路は保つ。
  const personalThreat = rt.def.civilianCrowd?.personalThreat;
  const threat = personalThreat && dangerNear(rt, a.x, a.z, 40, 14, 22);
  const from = threat || g.from;
  // 岩村では兵や火が去れば畦道へ戻れる。古い危険の位置だけで、
  // 安全になった曲がり角へ進むことまで禁じると、家族が途中で立ち往生する。
  // 記憶した位置は振り返る向きに残し、実際の兵・火は道全体で確かめる。
  const avoidFrom = !personalThreat || !!threat;
  const away = Math.atan2(a.x - from.x, a.z - from.z), h0 = w.heightAt(a.x, a.z);
  let route = g.route;
  // 小段で逃げ直した人は、古い到着印だけで止めず、安全を確かめてから家族を待つ。
  // 危険な元の避難先へ戻さず、逃げ直した場所をその人の待機場所にする。
  if (route && a.refugeEscaping) {
    if (dangerNear(rt, a.x, a.z, 40, 14, 22) || refugeBlocksRoute(rt, a.x, a.z, null, a)) route = null;
    else {
      a.refugeEscaping = false;
      if (!a.refuge) a.refuge = { x: a.x, z: a.z };
      else { a.refuge.x = a.x; a.refuge.z = a.z; }
    }
  }
  const routeRadius = rt.def.civilianCrowd?.routeRadius ?? 4;
  if (route) {
    // 兵や火で曲がり角が塞がった時は、避けた先から安全に合流できる次の道へ進む。
    // 田・堂・急斜面を横切る近道は許さず、避難先の直前の角までを一つずつ調べる。
    if (rt.def.civilianCrowd?.safeRouteRejoin) {
      while (a.routeIndex + 1 < route.length) {
        const current = route[a.routeIndex];
        const next = a.routeIndex + 1 === route.length - 1 && a.refuge ? a.refuge : route[a.routeIndex + 1];
        // 見物をやめる時と同じ間合いで、塞がった角を見分ける。
        // 斬り合いから四十メートル、火から二十二メートル以内の角へ引き返さない。
        // 合流先までの道は逃走中の判定を通し、田・堂・別の兵や火を避ける。
        if (!dangerNear(rt, current.x, current.z, 40, 14, 22) || !pathClear(rt, a, next, true, true)) break;
        // 斬り合いの間合いでも、実際の一歩では進めない向きへ道の順だけ進めない。
        const fromD = Math.hypot(a.x - from.x, a.z - from.z);
        if (avoidFrom && fromD < 40 && Math.hypot(next.x - from.x, next.z - from.z) < fromD - 0.2) break;
        a.routeIndex++;
      }
    }
    while (a.routeIndex < route.length) {
      const atRefuge = a.routeIndex === route.length - 1 && a.refuge;
      const p = atRefuge ? a.refuge : route[a.routeIndex];
      // 小段では割り当てた場所まで進む。畦の角と同じ広さで止まると、後続の間隔が足りなくなる。
      const arrivalRadius = atRefuge ? Math.min(routeRadius, rt.def.civilianCrowd?.refugeRadius ?? routeRadius) : routeRadius;
      if (Math.hypot(p.x - a.x, p.z - a.z) >= arrivalRadius) break;
      a.routeIndex++;
    }
    if (a.routeIndex === route.length) {
      a.tx = a.x; a.tz = a.z;
      if (g.routeEnd === 'wait') {
        // 包囲された輪中などでは、退避の終点で消さずに残す。危険が迫れば再び逃げる。
        // 見物中と同じ距離で逃げ直す。遠くの火や近づく兵を前に、待機と逃走を繰り返さない。
        // 到着した一人の逃げ直しで、まだ畦道を進む家族の道まで消さない。
        // 個別の空きが予約できず共通の終点に着いた人も、後続の畦道を空ける。
        // 到着半径の縁で道に掛かった時も、家族を待つ前に道の外へ寄る。
        if (dangerNear(rt, a.x, a.z, 40, 14, 22) || refugeBlocksRoute(rt, a.x, a.z, null, a)) {
          if (rt.def.civilianCrowd?.finishRefugeEscape) { a.refugeEscaping = true; g.calm = 0; }
          route = null;
        }
        else if (!(rt.def.civilianCrowd?.calmSeconds > 0 && g.calm < rt.def.civilianCrowd.calmSeconds) &&
          g.agents.every((b) => b.routeIndex === route.length && !b.refugeEscaping &&
            !refugeBlocksRoute(rt, b.x, b.z, null, b) && !dangerNear(rt, b.x, b.z, 40, 14, 22))) {
          g.route = null; g.state = 'watch';
          // 避難後は逃げてきた兵や火を振り返る。走っていた向きのまま見物しない。
          for (const b of g.agents) {
            b.tx = b.x; b.tz = b.z;
            b.h = Math.atan2(g.from.x - b.x, g.from.z - b.z);
          }
        }
      } else { a.out = false; if (g.agents.every((b) => !b.out)) g.state = 'gone'; }
      // 危険がある人と畦道を塞ぐ到着者は、この後で安全な一歩を選び直す。
      if (route) {
        if (g.state === 'flee') waitForRouteFamily(rt, a, route);
        return;
      }
    }
  }
  const goal = route && a.routeIndex === route.length - 1 && a.refuge ? a.refuge : route?.[a.routeIndex];
  const heading = goal ? Math.atan2(goal.x - a.x, goal.z - a.z) : away;
  // 兵や火から離れた後は、予約した畦道の外へ寄って後続の通り道を残す。
  // まだ危険な間は、道を空けるより兵や火から離れることを優先する。
  const clearRoute = !route && rt.def.civilianCrowd?.keepRefugeRoutesClear && !dangerNear(rt, a.x, a.z, 40, 14, 22);
  // 狭い畦道では曲がり角に寄せる。三メートルの固定歩幅で目印を行き過ぎない。
  const routeStep = goal && routeRadius < 3 ? Math.min(3, Math.hypot(goal.x - a.x, goal.z - a.z)) : 3;
  const fromD = Math.hypot(a.x - from.x, a.z - from.z);
  let bx = a.x, bz = a.z, bs = -1e9;
  const candidates = goal ? 18 : 9;
  const narrow = rt.def.civilianCrowd?.narrowEscape;
  const forwardTrials = candidates * (narrow ? 3 : 1);
  for (let trial = 0; trial < forwardTrials + (narrow ? 32 : 0); trial++) {
    const detour = trial >= forwardTrials;
    // 普通の一歩が全て塞がった時だけ半歩・四分の一歩を探す。安全の判定は省かない。
    // 岩村の畦・堂の角では、前方の短い歩みも塞がった時だけ周囲十六方向へ小さくよける。
    if ((detour ? (trial - forwardTrials) % 16 === 0 : trial % candidates === 0) && bs > -1e9) break;
    const i = trial % candidates, scale = trial < candidates ? 1 : trial < candidates * 2 ? 0.5 : 0.25;
    // 避難路が危険なら、まず危険から離れてから道へ戻る。
    if (!detour && i === 9 && bs > -1e9) break;
    const j = detour ? (trial - forwardTrials) % 16 : i % 9;
    const turn = detour ? j * Math.PI / 8 : j === 0 ? 0 : Math.ceil(j / 2) * 0.35 * (j % 2 ? 1 : -1);
    const step = detour ? (trial < forwardTrials + 16 ? 0.75 : 0.375) : (i < 9 ? routeStep : 3) * scale;
    // 横へよける候補は向きを揺らさず、細い畦の空いた方向を必ず含める。
    const h = (detour || i < 9 ? heading : away) + turn + (detour ? 0 : (rnd() - 0.5) * 0.2);
    const x = a.x + Math.sin(h) * step, z = a.z + Math.cos(h) * step;
    // 塀・柵・建物の角を抜けない（途中の一点と塀の当たりも見る）。
    if (!lightOpen(rt, x, z) || !lightOpen(rt, (a.x + x) / 2, (a.z + z) / 2)) continue;
    if (!crowdSpace(C, a, x, z, rt.def.civilianCrowd?.peopleSpacing)) continue;
    C.wp.x = x; C.wp.z = z;
    if (rt.army.wallBetween(a, -1, C.wp)) continue;
    // 道の終点で逃げ直す時も、水路・急な岸・火を途中まで細かく調べる。
    if (!pathClear(rt, a, C.wp, true, true) || goal && !rt.def.civilianCrowd?.soldierClearance && nearSoldier(rt, x, z, 12)) continue;
    const dy = w.heightAt(x, z) - h0;
    if (Math.abs(dy) > 2.2) continue;
    // 道を優先しても、近い兵や火へ向かう曲がり角は選ばない。
    if (goal) {
      if (avoidFrom && fromD < 40 && Math.hypot(x - from.x, z - from.z) < fromD - 0.2) continue;
    }
    const danger = dangerNear(rt, x, z, 12, 8, 10);
    // 小段の避難先で道を離れて逃げ直す時も、別の兵や火へ向かわない。
    // すでに危険が近い時は、そこから離れる一歩を通す。
    if (danger && Math.hypot(x - danger.x, z - danger.z) <= Math.hypot(a.x - danger.x, a.z - danger.z) + 0.2) continue;
    // 狭い道では安全を確認した目印の向きを優先し、危険の反対側へ寄せすぎて田際に詰まらない。
    const s = Math.cos(turn) * 2 + (goal ? Math.cos(h - away) * (routeRadius < 3 ? 0.1 : 1) : 0) - (C.mtn ? dy * 1.2 : Math.abs(dy) * 0.3)
      + (clearRoute && !refugeBlocksRoute(rt, x, z, null, a) ? 4 : 0);
    if (s > bs) { bs = s; bx = x; bz = z; }
  }
  // 同じ速さだけでは、曲がり角で詰まった子や年寄りを置いて進んでしまう。
  // 安全な先行者は一行を待つ。逃げ始める距離と同じ間合いでは避難を優先する。
  // 岩村の家族が、戦う兵から十六〜四十メートルの所で待ち続けないようにする。
  const gap = rt.def.civilianCrowd?.maxSeparation;
  // 避難先から逃げ直して道がなくなった後も、先行者だけが家族を待つ。
  // 横へ離れた二人が互いを待つと止まるため、共有の危険からの距離で順を決める。
  const progress = Math.hypot(a.x - g.from.x, a.z - g.from.z);
  if (gap > 0 && g.agents.some((b) => b !== a && b.out &&
    // 道を先へ進んだ者だけが後続を待つ。折れ曲がる道で、後続まで先行者を待つと互いに動けなくなる。
    ((!route && (!rt.def.civilianCrowd?.orderedFamilyWait ||
      Math.hypot(b.x - g.from.x, b.z - g.from.z) < progress)) ||
      route && (b.routeIndex < a.routeIndex || b.routeIndex === a.routeIndex &&
      Math.hypot(route[a.routeIndex].x - b.x, route[a.routeIndex].z - b.z) >
      Math.hypot(route[a.routeIndex].x - a.x, route[a.routeIndex].z - a.z))) &&
    Math.hypot(bx - b.x, bz - b.z) > gap &&
    Math.hypot(bx - b.x, bz - b.z) > Math.hypot(a.x - b.x, a.z - b.z) + 0.1) &&
    !dangerNear(rt, a.x, a.z, 40, 14, 22)) {
    a.tx = a.x; a.tz = a.z; waitForRouteFamily(rt, a); return;
  }
  a.tx = bx; a.tz = bz;
  // 道も人の隙間も空かない間は短く待つ。毎コマ全候補を探し続けない。
  a.retrying = narrow && bs === -1e9;
}

// 小谷の谷と西麓では、比高と里道に沿って家族を避難させる。
function fleeStepMikata(rt, C, a) {
  const g = a.g, w = rt.world;
  a.pace = 1;
  // 三方ヶ原の里道で家族が離れたら、各人に迫る兵・火から逃げる。
  // 組の中心で選んだ危険だけを見ると、子が火の反対側にいる時に逃げる向きが逆になる。
  // 危険の座標は既存の入れ物を参照し、移動のたびに作らない。
  const retreat = rt.def.civilianCrowd?.safeRetreat;
  const danger = retreat ? dangerNear(rt, a.x, a.z, 40, 14, 22, 1.5 * a.sc) : null;
  const from = danger || g.from;
  const escape = danger?.hw ? formationEscapeHeading(a, danger,
    12 + (danger.mounted ? rt.def.civilianCrowd.mountedWarning ?? 0 : 0)) : null;
  const away = escape ?? Math.atan2(a.x - from.x, a.z - from.z), h0 = w.heightAt(a.x, a.z);
  // 退避先から追われた家族も、危険が去れば同じ待ち場所へ合流する。
  // 崖や堂の向こうへ直行せず、道全体と兵・火の安全を確かめてから戻る。
  if (retreat && !danger && a.offRoute && g.routeEnd === 'wait' && g.route?.length) {
    const remaining = a.personalRoute || g.route;
    // 三方ヶ原では終点への直線が家や犀ヶ崖で塞がれていても、先の里道へ戻れる。
    // 通り過ぎた角へは引き返さず、歩けて兵・火から離れられる角だけを選ぶ。
    const first = rt.def.civilianCrowd.rejoinRoute
      ? Math.min(a.routeIndex, remaining.length - 1) : remaining.length - 1;
    for (let i = first; i < remaining.length; i++) {
      const point = i === remaining.length - 1 && a.end ? a.end : remaining[i];
      if (!pathClear(rt, a, point, true) || !retreatClear(rt, a, point)) continue;
      a.offRoute = false; a.routeIndex = i;
      break;
    }
  }
  const route = a.offRoute || !g.route ? null : a.personalRoute || g.route;
  if (route) {
    // 三方ヶ原の家の角・崖の端では曲がり角まで寄る。三メートルの歩幅でも通過できる幅は残す。
    const reach = rt.def.civilianCrowd?.safeRetreat ? 1.8 : 4;
    while (a.routeIndex < route.length) {
      const last = a.end && a.routeIndex === route.length - 1;
      const point = last ? a.end : route[a.routeIndex];
      if (Math.hypot(point.x - a.x, point.z - a.z) >= (last ? 0.6 : reach)) break;
      // 角の手前から次の角へ結ぶと、元の里道が安全でも堂や崖の内側を切る。
      // 実際の現在地から通れる時だけ進め、塞がる間は今の角への道を保つ。
      if (rt.def.civilianCrowd?.checkRouteCorners && a.routeIndex < route.length - 1) {
        const next = a.routeIndex === route.length - 2 && a.end ? a.end : route[a.routeIndex + 1];
        if (!pathClear(rt, a, next, true) || !retreatClear(rt, a, next)) break;
      }
      a.routeIndex++;
    }
    // 三方ヶ原の里道に兵や火が残る時は、塞がれた角へ戻り続けない。
    // 角そのものだけでなく、そこへ続く道に入った兵や火も見る。
    // 先の角へ実際に歩けて危険も避けられる時だけ回る。崖の対岸や家の裏へは抜けない。
    if (retreat && rt.def.civilianCrowd.bypassBlockedRoute && a.routeIndex < route.length - 1) {
      const point = route[a.routeIndex];
      if (!pathClear(rt, a, point, true) || !retreatClear(rt, a, point)) {
        // 二つ続く角が塞がれても、同じ岸の先の里道へ抜けられるなら立ち往生しない。
        // 近い角から選び、通れる道を無用に飛ばさない。座標は既存の道を使う。
        for (let i = a.routeIndex + 1; i < route.length; i++) {
          const next = a.end && i === route.length - 1 ? a.end : route[i];
          if (!pathClear(rt, a, next, true) || !retreatClear(rt, a, next)) continue;
          a.routeIndex = i;
          break;
        }
      }
    }
    if (a.routeIndex === route.length) {
      a.tx = a.x; a.tz = a.z;
      if (g.routeEnd === 'wait') {
        // 包囲された輪中などでは、退避の終点で消さずに残す。危険が迫れば再び逃げる。
        // 逃げ始める時と同じ距離を見る。近くに追手や火が残る間は見物へ戻さない。
        const danger = rt.def.civilianCrowd?.safeRetreat
          ? dangerNear(rt, a.x, a.z, 40, 14, 22, 1.5 * a.sc)
          : dangerNear(rt, a.x, a.z, 12, 8, 10);
        if (rt.def.civilianCrowd?.safeRetreat) {
          // 先着した子が逃げ直しても、崖や家並みを回る後続の道は消さない。
          if (danger) { a.offRoute = true; g.from.x = danger.x; g.from.z = danger.z; }
          // 全員の合流と安全は組の見回りで確かめる。後続も同じ更新で逃げ直せるよう里道を残す。
        } else if (danger) g.route = null;
        else if (g.agents.every((b) => b.routeIndex === route.length)) { g.route = null; g.state = 'watch'; }
      } else {
        a.out = false;
        if (g.agents.every((b) => !b.out)) g.state = 'gone';
      }
      return;
    }
  }
  const goal = route && a.end && a.routeIndex === route.length - 1 ? a.end : route?.[a.routeIndex];
  a.pace = familyPace(rt, a, route);
  // 巻き込まれている間は里道より隊列の外を優先し、抜けたら元の里道へ戻る。
  const heading = escape ?? (goal ? Math.atan2(goal.x - a.x, goal.z - a.z) : away);
  // 道端に待てる場所を取れなかった人も、里道の角と終点を大股で通り越さない。
  const goalDistance = goal && (retreat || a.end) ? Math.hypot(goal.x - a.x, goal.z - a.z) : Infinity;
  // 三方ヶ原では終点から逃げ直す時も、犀ヶ崖や城下の家・兵・火を避ける。
  const safe = goal || rt.def.civilianCrowd?.safeRetreat;
  const fromD = Math.hypot(a.x - from.x, a.z - from.z);
  let bx = a.x, bz = a.z, bs = -1e9;
  // 三方ヶ原の細い里道では、三メートル先が塞がっていても手前の足場を探す。
  // 長い一歩が通ればそこで終える。短い一歩も同じ崖・建物・兵・火の判定を通す。
  const directions = goal ? 18 : 9, attempts = retreat && rt.def.civilianCrowd.shortRetreatSteps ? 3 : 1;
  for (let i = 0; i < directions * attempts; i++) {
    const candidate = i % directions, attempt = Math.floor(i / directions);
    if (candidate === 0 && bs > -1e9) break;
    // 角の先が塞がれていても、危険から離れる歩幅を角までの残り距離で縮めない。
    // 隊列の外へ抜ける時も同じ。里道に沿う歩みだけ、角や終点の手前で止める。
    const leavingRoute = retreat && (escape != null || candidate >= 9);
    const step = Math.min(3 / (2 ** attempt), leavingRoute ? Infinity : goalDistance);
    // 角の真上で長さゼロの足場を選ぶと、脇へ逃げる候補まで調べず立ち止まる。
    if (retreat && step <= 0.05) continue;
    // 避難路が危険なら、まず危険から離れてから道へ戻る。
    if (candidate === 9 && bs > -1e9) break;
    const j = candidate % 9, turn = j === 0 ? 0 : Math.ceil(j / 2) * 0.35 * (j % 2 ? 1 : -1);
    const h = (candidate < 9 ? heading : away) + turn + (rnd() - 0.5) * 0.2, x = a.x + Math.sin(h) * step, z = a.z + Math.cos(h) * step;
    // 塀・柵・建物の角を抜けない（途中の一点と塀の当たりも見る）。
    if (!lightOpen(rt, x, z) || !lightOpen(rt, (a.x + x) / 2, (a.z + z) / 2)) continue;
    C.wp.x = x; C.wp.z = z;
    if (rt.army.wallBetween(a, -1, C.wp)) continue;
    // 指定路でも水路・急な岸・兵・火を横切らない。途中も細かく調べる。
    if (safe && (!pathClear(rt, a, C.wp, true) || (retreat ? !retreatClear(rt, a, C.wp) : nearSoldier(rt, x, z, 12)))) continue;
    const dy = w.heightAt(x, z) - h0;
    if (Math.abs(dy) > 2.2) continue;
    // 道を優先しても、近い兵や火へ向かう曲がり角は選ばない。
    // 兵が去ったり火が消えた後は、昔の危険の位置だけで里道への復帰を禁じない。
    if (safe && ((!retreat || danger) && fromD < 40 && Math.hypot(x - from.x, z - from.z) < fromD - 0.2 || !retreat && dangerNear(rt, x, z, 12, 8, 10))) continue;
    // 合流する家族も互いの体をすり抜けない。近い民だけを見て、道の脇へ避ける。
    // 危険から離れる一歩は許し、狭い戸口で初めから並ぶ家族を閉じ込めない。
    const space = rt.def.civilianCrowd?.personalSpace;
    let crowded = false, crowdCost = 0;
    if (space) for (const b of C.agents) {
      if (b === a || !b.out || Math.abs(b.x - a.x) > 5 || Math.abs(b.z - a.z) > 5) continue;
      if (!keepsClear(a, C.wp, b.x, b.z, space * (a.sc + b.sc) / 2)) { crowded = true; break; }
      crowdCost += Math.max(0, space * 2 - Math.hypot(x - b.x, z - b.z));
    }
    if (crowded) continue;
    const s = Math.cos(turn) * 2 + (goal ? Math.cos(h - away) : 0) - (C.mtn ? dy * 1.2 : Math.abs(dy) * 0.3) - crowdCost;
    if (s > bs) { bs = s; bx = x; bz = z; }
  }
  a.tx = bx; a.tz = bz;
}

function fleeStepOdani(rt, C, a) {
  const g = a.g, w = rt.world;
  const safe = rt.def.civilianCrowd?.safeFlee;
  // 里道で列が伸びた家族は、一人ずつ今いる場所の兵・火から退く。
  // 子の右に火が迫っても、大人の左の兵を基準に火へ向かわない。
  // 道を選び直す時だけ調べ、座標の入れ物は既存の危険を使う。
  const threat = safe ? dangerNear(rt, a.x, a.z, 40,
    rt.def.civilianCrowd.watchDistance ?? 14, 22, a.sc * 1.5) : null;
  const from = threat ?? g.from;
  const away = Math.atan2(a.x - from.x, a.z - from.z), h0 = w.heightAt(a.x, a.z);
  let route = g.route;
  if (route) {
    const arrival = rt.def.civilianCrowd?.routeArrival ?? 4;
    while (a.routeIndex < route.length) {
      const last = a.waitPoint && a.routeIndex === route.length - 1;
      const point = last ? a.waitPoint : route[a.routeIndex];
      // 待つ位置だけは近くまで歩く。道の角を曲がる判定は狭めない。
      if (Math.hypot(point.x - a.x, point.z - a.z) >= (last ? Math.min(arrival, 0.35) : arrival)) break;
      // 小谷の堂や民家の角では、壁越しに近いだけの目印を通過済みにしない。
      // 兵・火は次の一歩で避け、ここでは里道・壁・段差がつながるかだけ確かめる。
      if (safe && !pathClear(rt, a, point, true, false, true)) break;
      a.routeIndex++;
    }
    if (safe && a.routeIndex < route.length - 1) {
      const point = route[a.routeIndex];
      const next = a.waitPoint && a.routeIndex === route.length - 2 ? a.waitPoint : route[a.routeIndex + 1];
      // 庭や畦から退いた後、兵や火で塞がれた合流点へ引き返さない。
      // 次の角まで全区間を通れる時だけ合流し直す。家・水路・切岸は横切らない。
      if (!pathClear(rt, a, point, true, true) && pathClear(rt, a, next, true, true)) a.routeIndex++;
    }
    if (a.routeIndex === route.length) {
      a.tx = a.x; a.tz = a.z;
      if (g.routeEnd === 'wait') {
        if (safe) {
          const watchDistance = rt.def.civilianCrowd?.watchDistance ?? 14;
          // 先に着いた者だけが危険を避ける。遅れた子や年寄りの里道は消さない。
          if (dangerNear(rt, a.x, a.z, 40, watchDistance, 22, a.sc * 1.5)) route = null;
          else {
            // 西麓の畦へ着いた者は、逃げてきた谷の方を振り返って待つ。
            a.h = Math.atan2(g.from.x - a.x, g.from.z - a.z);
            if (g.agents.every((b) => b.routeIndex === route.length && !dangerNear(rt, b.x, b.z, 40, watchDistance, 22, b.sc * 1.5))) { g.route = null; g.state = 'watch'; }
            return;
          }
        } else {
          // 包囲された輪中などでは、退避の終点で消さずに残す。危険が迫れば再び逃げる。
          if (dangerNear(rt, a.x, a.z, 12, 8, 10)) g.route = null;
          else if (g.agents.every((b) => b.routeIndex === route.length)) { g.route = null; g.state = 'watch'; }
        }
      } else { a.out = false; if (g.agents.every((b) => !b.out)) g.state = 'gone'; }
      if (route) return;
    }
  }
  const goal = route && a.waitPoint && a.routeIndex === route.length - 1 ? a.waitPoint : route?.[a.routeIndex];
  const heading = goal ? Math.atan2(goal.x - a.x, goal.z - a.z) : away;
  // 危険が去った里道では、古い兵や火の位置より次の角へ近づく歩みを選ぶ。
  const following = safe && goal && !threat;
  const goalDistance = following ? Math.hypot(goal.x - a.x, goal.z - a.z) : 0;
  // 小谷では里道の終点から再び逃げる時にも、水路・急斜面・兵・火の確認を続ける。
  const careful = !!goal || safe;
  const fromD = crowdThreatDistance(rt, a.x, a.z, from);
  let bx = a.x, bz = a.z, bs = -1e9;
  const usual = goal ? 18 : 9;
  for (let i = 0; i < usual + (safe ? 32 : 0); i++) {
    // 避難路が危険なら、まず危険から離れてから道へ戻る。
    if ((i === 9 || i === usual || i === usual + 16) && bs > -1e9) break;
    // 三メートル先が畦の端や建物で塞がる時だけ、短い一歩を全方向から探す。
    // 寺庭の角や退避先でも足止めせず、里道・段差・兵・火の検査は同じく通す。
    const short = i >= usual;
    // 一メートル先も塞がる角だけ、三十五センチの歩幅で抜ける向きを探す。
    // 広い道では追加の探索をせず、既存の形・材質と座標の入れ物を使う。
    const small = i >= usual + 16;
    const j = short ? (i - usual) % 16 : i % 9;
    const turn = j === 0 ? 0 : Math.ceil(j / 2) * (short ? Math.PI / 8 : 0.35) * (j % 2 ? 1 : -1);
    // 狭い畦の曲がり角では、目印を飛び越して田や家の側へ切り込まない。
    const stride = short ? (small ? 0.35 : 1) : 3;
    // 短い歩幅の探し直しでも、近くの曲がり角や畦の待つ位置を通り過ぎない。
    const step = safe && goal && (short || i < 9) ? Math.min(stride, Math.hypot(goal.x - a.x, goal.z - a.z)) : stride;
    // 狭い所の短い一歩は向きを揺らさず、同じ隙間を毎回確かめられるようにする。
    const h = (following || i < 9 && !short ? heading : away) + turn + (short ? 0 : (rnd() - 0.5) * 0.2), x = a.x + Math.sin(h) * step, z = a.z + Math.cos(h) * step;
    // 塀・柵・建物の角を抜けない（途中の一点と塀の当たりも見る）。
    if (!lightOpen(rt, x, z) || !lightOpen(rt, (a.x + x) / 2, (a.z + z) / 2)) continue;
    // 最初の避難から再避難まで、里道の肩を越える候補は先に外す。
    if (safe && (!onRetreatPath(rt, x, z) || !onRetreatPath(rt, (a.x + x) / 2, (a.z + z) / 2))) continue;
    if (!crowdStepClear(C, a, x, z, rt.def.civilianCrowd?.moveSpacing)) continue;
    C.wp.x = x; C.wp.z = z;
    if (rt.army.wallBetween(a, -1, C.wp)) continue;
    // 指定路でも水路・急な岸・兵・火を横切らない。途中も細かく調べる。
    if (careful && (!pathClear(rt, a, C.wp, true, safe) || !safe && nearSoldier(rt, x, z, 12))) continue;
    const dy = w.heightAt(x, z) - h0;
    if (Math.abs(dy) > 2.2) continue;
    // 道を優先しても、近い兵や火へ向かう曲がり角は選ばない。
    if (careful && ((!safe || threat) && fromD < 40 && crowdThreatDistance(rt, x, z, from) < fromD - 0.2 || !safe && dangerNear(rt, x, z, 12, 8, 10))) continue;
    // 短い歩幅でも退き先への進みを比べ、狭い合流点で逆戻りを繰り返さない。
    const s = (following ? goalDistance - Math.hypot(goal.x - x, goal.z - z)
      : Math.cos(turn) * 2 + (goal ? Math.cos(h - away) : 0)) - (C.mtn ? dy * 1.2 : Math.abs(dy) * 0.3);
    if (s > bs) { bs = s; bx = x; bz = z; }
  }
  a.tx = bx; a.tz = bz;
}

function fleeStepOther(rt, C, a) {
  const g = a.g, w = rt.world;
  const safe = rt.def.civilianCrowd?.safeFlee;
  // 里道で列が伸びた家族は、一人ずつ今いる場所の兵・火から退く。
  // 子の右に火が迫っても、大人の左の兵を基準に火へ向かわない。
  // 道を選び直す時だけ調べ、座標の入れ物は既存の危険を使う。
  const threat = safe ? dangerNear(rt, a.x, a.z, 40,
    rt.def.civilianCrowd.watchDistance ?? 14, 22, a.sc * 1.5) : null;
  const from = threat ?? g.from;
  const away = Math.atan2(a.x - from.x, a.z - from.z), h0 = w.heightAt(a.x, a.z);
  let route = g.route;
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
        // 逃げ始める時と同じ距離を見る。近くに追手や火が残る間は見物へ戻さない。
        const danger = rt.def.civilianCrowd?.safeRetreat
          ? dangerNear(rt, a.x, a.z, 40, 14, 22)
          : dangerNear(rt, a.x, a.z, 12, 8, 10);
        if (rt.def.civilianCrowd?.safeRetreat) {
          // 先着した子が逃げ直しても、崖や家並みを回る後続の道は消さない。
          if (danger) { a.offRoute = true; g.from.x = danger.x; g.from.z = danger.z; }
          // 全員の合流と安全は組の見回りで確かめる。後続も同じ更新で逃げ直せるよう里道を残す。
        } else if (danger) g.route = null;
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
    // 最初の避難から再避難まで、里道の肩を越える候補は先に外す。
    if (safe && (!onRetreatPath(rt, x, z) || !onRetreatPath(rt, (a.x + x) / 2, (a.z + z) / 2))) continue;
    if (!crowdStepClear(C, a, x, z, rt.def.civilianCrowd?.moveSpacing)) continue;
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
  // 同じ速さだけでは、曲がり角で詰まった子や年寄りを置いて進んでしまう。
  // 安全な先行者は一行を待つ。逃げ始める距離と同じ間合いでは避難を優先する。
  // 岩村の家族が、戦う兵から十六〜四十メートルの所で待ち続けないようにする。
  const gap = rt.def.civilianCrowd?.maxSeparation;
  // 避難先から逃げ直して道がなくなった後も、先行者だけが家族を待つ。
  // 横へ離れた二人が互いを待つと止まるため、共有の危険からの距離で順を決める。
  const progress = Math.hypot(a.x - g.from.x, a.z - g.from.z);
  if (gap > 0 && g.agents.some((b) => b !== a && b.out &&
    // 道を先へ進んだ者だけが後続を待つ。折れ曲がる道で、後続まで先行者を待つと互いに動けなくなる。
    ((!route && (!rt.def.civilianCrowd?.orderedFamilyWait ||
      Math.hypot(b.x - g.from.x, b.z - g.from.z) < progress)) ||
      route && (b.routeIndex < a.routeIndex || b.routeIndex === a.routeIndex &&
      Math.hypot(route[a.routeIndex].x - b.x, route[a.routeIndex].z - b.z) >
      Math.hypot(route[a.routeIndex].x - a.x, route[a.routeIndex].z - a.z))) &&
    Math.hypot(bx - b.x, bz - b.z) > gap &&
    Math.hypot(bx - b.x, bz - b.z) > Math.hypot(a.x - b.x, a.z - b.z) + 0.1) &&
    !dangerNear(rt, a.x, a.z, 40, 14, 22)) {
    a.tx = a.x; a.tz = a.z; waitForRouteFamily(rt, a); return;
  }
  a.tx = bx; a.tz = bz;
  // 道も人の隙間も空かない間は短く待つ。毎コマ全候補を探し続けない。
  a.retrying = false;
}

function fleeStep(rt, C, a) {
  if (rt.def.civilianCrowd?.safeRetreat) return fleeStepMikata(rt, C, a);
  if (!rt.def.civilianCrowd?.avoidArmies) return routeFleeStep(rt, C, a);
  const g = a.g, w = rt.world;
  let returnGoal = null;
  // 姉川では先着した人と遅れた子・年寄りが離れる。組の中心でなく本人に迫る危険から逃げる。
  // 軽い軍勢の危険点は使い回すため、道を調べる前に座標を控える。
  const danger = rt.def.civilianCrowd?.avoidArmies
    ? dangerNear(rt, a.x, a.z, 40, rt.def.civilianCrowd.watchDistance ?? 14, 22, civilianEye(a.kind)) ||
      (g.warningUntil > rt.t ? g.from : null) : null;
  // 安全な迂回先でも家族を待ってから里道へ戻る。兵や火が迫れば待たずに逃げる。
  if (!danger && rt.def.civilianCrowd?.avoidArmies) {
    const family = waitForFamily(rt, a);
    if (family) {
      a.tx = a.x; a.tz = a.z;
      // 里道で立ち止まる人は、遅れた家族を振り返って待つ。
      // 向きだけを変え、川や兵の方へ迎えに戻らない。
      a.h = Math.atan2(family.x - a.x, family.z - a.z);
      return;
    }
  }
  // 指定路を離れた人も、兵や火が去れば同じ岸の避難先へ進む。
  // 里道へ戻る途中も確かめ、家・水路・別の隊を横切る近道には戻さない。
  if (!danger && rt.def.civilianCrowd?.avoidArmies && g.routeEnd === 'wait' && a.routeFree) {
    const route = g.route, length = route?.length ?? 0;
    const end = route?.[length - 1];
    const remaining = end ? Math.hypot(end.x - a.x, end.z - a.z) : Infinity;
    // 迂回して避難先へ着いた人は、その場で待つ。近い終点を飛ばして
    // 手前の中継点へ戻すと、村や川前の方へ引き返してしまう。
    if (end && remaining < 4) {
      a.routeIndex = length; a.routeFree = false;
      a.tx = a.x; a.tz = a.z;
      return;
    }
    let rejoined = false;
    for (let i = Math.min(a.routeIndex, length - 1); i >= 0 && i < length; i++) {
      const goal = route[i];
      if (Math.hypot(goal.x - a.x, goal.z - a.z) < 4) continue;
      // 姉川の各里道は村から避難先へ離れていく。途中まで迂回した人も、
      // 避難先から遠ざかる古い中継点へ戻さず、先の安全な道へ合流させる。
      if (Math.hypot(goal.x - end.x, goal.z - end.z) > remaining) continue;
      C.wp.x = goal.x; C.wp.z = goal.z;
      if (!lightOpen(rt, goal.x, goal.z) ||
        dangerNear(rt, goal.x, goal.z, 40, rt.def.civilianCrowd.watchDistance ?? 14, 22)) continue;
      // 家や林で里道まで一直線に戻れなくても、短い歩幅で回り込む目標は残す。
      // 実際に歩く区間は下で確かめ、壁・水路・兵・火を横切らせない。
      if (!returnGoal) returnGoal = goal;
      if (!pathClear(rt, a, C.wp, true) || nearSoldier(rt, goal.x, goal.z, 12, a)) continue;
      a.routeIndex = i; a.routeFree = false; rejoined = true; break;
    }
    // 安全な目標がなければ待つ。本人に兵や火が迫れば、再び危険から離れる。
    if (!rejoined && !returnGoal) { a.tx = a.x; a.tz = a.z; return; }
  }
  const fromX = danger ? danger.x : g.from.x, fromZ = danger ? danger.z : g.from.z;
  const away = Math.atan2(a.x - fromX, a.z - fromZ), h0 = w.heightAt(a.x, a.z);
  const route = a.routeFree ? null : g.route;
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
        // 先着した人が逃げ直しても、遅れた人の避難路は残す。
        // 見物をやめる距離と揃える。避難先で兵や火を怖がりながら立ち尽くさない。
        if (rt.def.civilianCrowd?.avoidArmies ? danger : dangerNear(rt, a.x, a.z, 12, 8, 10)) a.routeFree = true;
        // 全員の到着後も道を残し、安全な避難先から勝手に走り去らない。
        // 危険が来た人だけ道を離れ、遅れた人は元の道を使う。
      } else { a.out = false; if (g.agents.every((b) => !b.out)) g.state = 'gone'; }
      // 姉川では終点に着いた回でも、迫る兵や火からすぐに次の一歩を選ぶ。
      // 次の探索まで待つと、逃げ直す合図の後も最大〇・六秒その場に残ってしまう。
      // 安全な待機と、ほかの戦での退場は従来どおりここで終える。
      if (!rt.def.civilianCrowd?.avoidArmies || !danger || !a.routeFree || !a.out) return;
    }
  }
  let goal = route?.[a.routeIndex] ?? returnGoal;
  // 姉川の里道が水路・建物・兵・火で塞がれたら、その中継点へ戻り続けず先の道へ回る。
  // 本人の道順だけを進め、後から来る子や年寄りの道は消さない。
  if (rt.def.civilianCrowd?.avoidArmies) {
    // 見物をやめる間合いで中継点も調べる。斬り合いの手前で道へ戻ろうと立ち往生しない。
    const walkDistance = rt.def.civilianCrowd.watchDistance ?? 14;
    // 地形や家で立てない地点も飛ばす。歩ける道筋は下の途中判定で確かめる。
    while (route && goal && (!lightOpen(rt, goal.x, goal.z) || dangerNear(rt, goal.x, goal.z, 40, walkDistance, 22))) {
      goal = route[++a.routeIndex];
      // 避難先まで危険なら道を離れる。同じ岸の範囲と、途中の兵・火の判定は守る。
      if (!goal) a.routeFree = true;
    }
  }
  const heading = goal ? Math.atan2(goal.x - a.x, goal.z - a.z) : away;
  const goalDistance = goal ? Math.hypot(goal.x - a.x, goal.z - a.z) : 0;
  const fromD = Math.hypot(a.x - fromX, a.z - fromZ);
  let bx = a.x, bz = a.z, bs = -1e9;
  const directed = goal ? 18 : 9;
  // 姉川の家の角や林際で前方が塞がれた時だけ、横と後ろの回り道も探す。
  // 同じ岸の範囲・兵・炎の途中判定は保ち、通れる前方があれば探索を増やさない。
  const detours = rt.def.civilianCrowd?.avoidArmies ? 8 : 0;
  // 家の角や待つ家族の脇では、三歩先が塞がれていても足元の回り道は通れる。
  // 姉川だけ、通常の候補が全て塞がれた時に短い歩幅で探す。走る速さは変えない。
  const shortStep = rt.def.civilianCrowd?.shortEscapeStep;
  for (let pass = 0; pass < (shortStep ? 2 : 1) && bs === -1e9; pass++) {
    const stride = pass ? shortStep : 3;
    for (let i = 0; i < directed + detours; i++) {
      // 避難路が危険なら、まず危険から離れてから道へ戻る。
      if (i === 9 && bs > -1e9) break;
      if (i === directed && bs > -1e9) break;
      const detour = i >= directed, j = detour ? i - directed + 1 : i % 9;
      const turn = j === 0 ? 0 : ((detour ? 1.4 : 0) + Math.ceil(j / 2) * 0.35) * (j % 2 ? 1 : -1);
      const h = (!detour && i < 9 ? heading : away) + turn + (rnd() - 0.5) * 0.2, x = a.x + Math.sin(h) * stride, z = a.z + Math.cos(h) * stride;
      // 指定路から外れても土地ごとの避難範囲を守る。姉川では同じ岸に留まり、川へ逃げ戻らない。
      const bounds = g.escapeBounds;
      if (bounds && (x < (bounds.minX ?? -Infinity) || x > (bounds.maxX ?? Infinity) ||
        z < (bounds.minZ ?? -Infinity) || z > (bounds.maxZ ?? Infinity))) continue;
      // 塀・柵・建物の角を抜けない（途中の一点と塀の当たりも見る）。
      if (!lightOpen(rt, x, z) || !lightOpen(rt, (a.x + x) / 2, (a.z + z) / 2)) continue;
      C.wp.x = x; C.wp.z = z;
      if (rt.army.wallBetween(a, -1, C.wp)) continue;
      // 指定路でも水路・急な岸・兵・火を横切らない。途中も細かく調べる。
      const escape = rt.def.civilianCrowd?.avoidArmies;
      if ((goal || escape) && (!pathClear(rt, a, C.wp, true) || nearSoldier(rt, x, z, 12, escape ? a : null))) continue;
      if (escape && crowdBlocked(C, a, x, z)) continue;
      const dy = w.heightAt(x, z) - h0;
      if (Math.abs(dy) > 2.2) continue;
      // 道を優先しても、今も近い兵や火へ向かう曲がり角は選ばない。
      // 姉川では兵が去り、火が消えた後は里道へ戻れる。古い危険点だけで帰路を塞がない。
      // 途中に別の兵や炎があれば、上の通行判定で引き続き避ける。
      if ((goal || escape) && ((!escape || danger) && fromD < 40 && Math.hypot(x - fromX, z - fromZ) < fromD - 0.2 ||
        !escape && dangerNear(rt, x, z, 12, 8, 10))) continue;
      // 姉川では迂回候補も里道の次の地点へ近づく度合いで選ぶ。
      // 兵や火が去った後に、古い危険から離れる向きへ引かれて道からそれないようにする。
      // 危険が残る時だけ離れる向きを加点し、途中の兵・火の判定は上で保つ。
      const direction = escape && goal
        ? (goalDistance - Math.hypot(goal.x - x, goal.z - z)) / stride * 2 + (danger ? Math.cos(h - away) : 0)
        : Math.cos(turn) * 2 + (goal ? Math.cos(h - away) : 0);
      const s = direction - (C.mtn ? dy * 1.2 : Math.abs(dy) * 0.3);
      if (s > bs) { bs = s; bx = x; bz = z; }
    }
  }
  // 中継点自体が安全でも、手前の兵や家の角でそこへ進めないことがある。
  // 姉川では三回続けて足が出なければ、本人だけ先の里道を目指す。
  // 全て塞がった時は同じ岸で迂回し、後から来る家族の道順は残す。
  if (rt.def.civilianCrowd?.avoidArmies && route && goal && !a.routeFree && bs === -1e9) {
    if (++a.blockedSteps >= 3) {
      a.blockedSteps = 0;
      if (++a.routeIndex >= route.length) a.routeFree = true;
    }
  } else a.blockedSteps = 0;
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
  const evacuating = !rt.over || rt.def.civilianCrowd?.evacuateAfterBattle || rt.def.civilianCrowd?.fleeAfterBattle;
  rememberSoldierCombat(rt);
  // 主人公の近接・弓・鉄砲は別の状態を使う。発砲の火は見回りより短く、
  // 直後に狙いを下ろしても見落とさないよう、次の見回りまで危険を覚える。
  // 逃走中の家族も同じ記録を使い、撃ち手のそばで待ち止まらない。
  const player = rt.player, playerUnit = player?.u;
  if (evacuating && rt.def.civilianCrowd?.watchPlayerCombat && playerUnit?.alive
    && (playerUnit.pAtk || playerUnit.atk || playerUnit.swing || playerUnit.fireT > 0 || player.shot)) C.playerAttackUntil = rt.t + 1.2;
  C.scan -= dt;
  C.scanElapsed = (C.scanElapsed ?? 0) + dt;
  if (evacuating && C.scan <= 0) {
    C.scan = rt.def.civilianCrowd?.noticeInterval ?? rt.def.civilianCrowd?.dangerCheckInterval ?? 0.8;
    crowdScan(rt, C, C.scanElapsed); C.scanElapsed = 0;
  }
  const cam = rt.camera.position, still = S.reduceMotion, half = rt.world.half;
  const modelKinds = rt.def.civilianCrowd?.modelKinds;
  // 近い人を本物の形へ（0.3 秒ごと）。
  C.poolT -= dt;
  if (C.poolT <= 0) {
    C.poolT = 0.3;
    for (const P of C.pool) if (P.a && (!P.a.out || Math.hypot(P.a.x - cam.x, P.a.z - cam.z) > NEAR + 4)) { P.a.model = null; P.a = null; P.mesh.visible = false; }
    // 姉川の七人分の姿は、同じ種類でより近い人へ譲る。名簿の先頭を優先すると、
    // 目の前の子や僧が軽い形のまま、遠い同業の人だけ詳しい姿になってしまう。
    if (rt.def.civilianCrowd?.nearKinds) for (const P of C.pool) {
      let nearest = P.a, distance = nearest ? Math.hypot(nearest.x - cam.x, nearest.z - cam.z) : NEAR;
      for (const a of C.agents) {
        if (!a.out || a.kind !== P.kind || a.model && a.model !== P) continue;
        const d = Math.hypot(a.x - cam.x, a.z - cam.z);
        // わずかな距離の変化では入れ替えず、境目で姿がちらつくのを防ぐ。
        if (d < NEAR && d < distance - (nearest ? 2 : 0)) { nearest = a; distance = d; }
      }
      if (nearest && nearest !== P.a) {
        if (P.a) P.a.model = null;
        P.a = nearest; nearest.model = P; P.mesh.scale.setScalar(nearest.sc); P.mesh.visible = true;
      }
    }
    for (const a of C.agents) {
      if (a.model || !a.out || Math.hypot(a.x - cam.x, a.z - cam.z) > NEAR) continue;
      // 職ごとの近景が指定された戦では、空き待ちの間も本人の色の軽い姿を残す。
      const P = C.pool.find((p) => !p.a && p.kind === a.kind) || (!modelKinds && !rt.def.civilianCrowd?.nearKinds && !rt.def.civilianCrowd?.strictNearKinds && (a.kind === 'merchant' || a.kind === 'townsman' || a.kind === 'elder') ? C.pool.find((p) => !p.a && p.kind === 'farmer') : null);
      if (P) {
        P.a = a; a.model = P;
        // 遠近を切り替えても、子・年寄りの背丈や大人ごとの体格を変えない。
        P.mesh.scale.setScalar(a.sc);
        P.mesh.visible = true;
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
      if (rt.def.civilianCrowd?.safeRetreat) {
        const recheck = rt.def.civilianCrowd?.retreatCheckInterval;
        if (recheck) {
          a.clearT -= dt;
          if (a.clearT <= 0) {
            a.clearT = recheck;
            // 選んだ足場へ兵や火が後から入ったら、そのまま歩かず道を選び直す。
            // 地形は変わらないので動く危険だけを間引いて調べ、座標も使い回す。
            C.wp.x = a.tx; C.wp.z = a.tz;
            if (!retreatClear(rt, a, C.wp)) a.wpT = 0;
          }
        }
        const remaining = Math.hypot(a.tx - a.x, a.tz - a.z);
        // 家族待ちや通れない戸口では探索を休む。見回りで危険を知れば即座に再開する。
        if (a.wpT <= 0 || remaining > 0.05 && remaining < 0.3) { a.wpT = 0.6; a.clearT = recheck || 0; fleeStep(rt, C, a); }
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d > 0.05) {
          const st = Math.min(d, a.spd * a.pace * dt);
          C.wp.x = a.x + dx / d * st; C.wp.z = a.z + dz / d * st;
          // 足場を選んだ後にも家族や別の組が動く。実際の一歩で再確認する。
          // 戸口で初めから近い者どうしは、離れる一歩を許す。
          const space = rt.def.civilianCrowd?.personalSpace;
          const clearance = rt.def.civilianCrowd?.stepClearance;
          let clear = !clearance || mikataStepClear(rt, a, C.wp, clearance);
          if (clear && space) for (const b of C.agents) {
            if (b === a || !b.out) continue;
            const radius = space * (a.sc + b.sc) / 2;
            if (Math.abs(b.x - a.x) > st + radius || Math.abs(b.z - a.z) > st + radius) continue;
            if (!keepsClear(a, C.wp, b.x, b.z, radius)) { clear = false; break; }
          }
          if (clear) {
            a.x = C.wp.x; a.z = C.wp.z; a.ran += st; travelled = st; moving = true;
            a.h = Math.atan2(dx, dz);
          } else {
            // 次の更新で脇の足場を探す。同じ行き先へ押し続けない。
            a.tx = a.x; a.tz = a.z; a.wpT = 0;
          }
        }
      } else if (!rt.def.civilianCrowd?.avoidArmies) {
        // 選んだ一歩を歩く間にも兵や火は動く。指定路のある戦だけ、短い間隔で残りの道を見直す。
        // 曲がる候補の総当たりは危険になった時だけ。共用の座標を使い、毎コマ物を作らない。
        if (g.route && rt.def.civilianCrowd?.recheckEscapeStep) {
          a.safeT -= dt;
          if (a.safeT <= 0) {
            a.safeT = 0.2;
            if (a.wpT > 0 && Math.hypot(a.tx - a.x, a.tz - a.z) > 0.05) {
              C.wp.x = a.tx; C.wp.z = a.tz;
              if (!pathClear(rt, a, C.wp, true) || (rt.def.civilianCrowd?.escapeCheckInterval
                ? !escapeDangerClear(rt, a, C.wp) : nearSoldier(rt, a.tx, a.tz, 12, a))) a.wpT = 0;
            }
          }
        }
        // 動く兵や松明が畦道へ入ったら、前に選んだ行き先も捨てる。
        // 指定した戦だけ短い間隔で調べ、点と道の判定は使い回す。
        const recheck = rt.def.civilianCrowd?.escapeRecheck;
        if (recheck > 0 && a.wpT > 0 && !a.waiting) {
          a.escapeT = (a.escapeT ?? 0) - dt;
          if (a.escapeT <= 0) {
            a.escapeT = recheck;
            C.wp.x = a.tx; C.wp.z = a.tz;
            // 岩村の細い畦では、先に選んだ道へ別の家族が入ることもある。
            // 兵・火だけでなく道全体の人の間隔も見直し、直前まで進まず迂回を選び直す。
            if (!crowdSpace(C, a, a.tx, a.tz, rt.def.civilianCrowd?.peopleSpacing) ||
              !pathClear(rt, a, C.wp, true, true)) {
              a.tx = a.x; a.tz = a.z; a.wpT = 0;
            }
          }
        }
        const safeFlee = rt.def.civilianCrowd?.safeFlee;
        const remaining = Math.hypot(a.tx - a.x, a.tz - a.z);
        // 小谷の狭い里道で足止めされた時は、見回りか次の探し直しを待つ。
        // 行き先が足元のままだと、兵・火・段差を調べる道探しが毎コマ繰り返される。
        // 家族を待つ間も探索を休め、危険が迫れば見回りが待機を解いてすぐ退かせる。
        const arrived = safeFlee ? remaining > 0.05 && remaining < 0.3
          : !a.retrying && !(a.waiting && recheck > 0) && remaining < 0.3;
        if ((!safeFlee || !a.waitForFamily) && (a.wpT <= 0 || arrived)) {
          fleeStep(rt, C, a);
          // 家族待ちでも危険は短い間隔で見直す。停止中の全員について毎コマ道を探し直さない。
          a.wpT = (a.waiting || a.retrying) && recheck > 0 ? recheck : rt.def.civilianCrowd?.escapeCheckInterval ?? 0.6;
        }
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d > 0.05 && !a.waitForFamily) {
          const step = Math.min(d, (a.escapeSpeed ?? (a.escortSpeed || a.spd)) * dt);
          const st = rt.def.civilianCrowd?.keepCivilianSpacing ? crowdStride(C, a, a.tx, a.tz, step) : step;
          if (st < step) a.wpT = Math.min(a.wpT, 0.15);
          const x = a.x + dx / d * st, z = a.z + dz / d * st;
          C.wp.x = x; C.wp.z = z;
          // 選んだ道に別の一行が入ってきても、すり抜けず次の一歩を選び直す。
          // 再確認からの短い間に兵や松明が割り込んだ時も、その一歩を止める。
          if (escapePeopleClear(rt, a, C.wp) &&
            (!rt.def.civilianCrowd?.checkEscapeStep || pathClear(rt, a, C.wp, true, true)) &&
            crowdSpace(C, a, x, z, rt.def.civilianCrowd?.peopleSpacing) &&
            crowdStepClear(C, a, x, z, rt.def.civilianCrowd?.moveSpacing) &&
            crowdSoldierStepClear(rt, a, x, z) && crowdFireStepClear(rt, a, x, z) &&
            (!rt.def.civilianCrowd?.escapeCheckInterval || pathClear(rt, a, C.wp, true) && escapeDangerClear(rt, a, C.wp))) {
            a.x = x; a.z = z; a.ran += st; travelled = st; moving = st > 0.001;
            a.h = Math.atan2(dx, dz);
          } else {
            a.tx = a.x; a.tz = a.z;
            a.retrying = !!rt.def.civilianCrowd?.narrowEscape;
            a.wpT = a.retrying ? recheck || 0.2 : safeFlee ? Math.min(a.wpT, 0.2) : 0;
          }
        }
      } else {
        a.safeT -= dt;
        const remaining = Math.hypot(a.tx - a.x, a.tz - a.z);
        // 避難先で待つ人や道を塞がれた人は、毎コマ同じ探索を繰り返さない。
        if (a.wpT <= 0 || remaining > 0.05 && remaining < 0.3) { a.wpT = rt.def.civilianCrowd?.escapeCheckInterval ?? 0.6; fleeStep(rt, C, a); }
        // 動く兵や燃え広がった火で、選んだ道が後から塞がることもある。
        // 姉川の指定だけを短い間隔で確かめ、毎コマの探索は増やさない。
        if (rt.def.civilianCrowd?.avoidArmies && a.safeT <= 0) {
          a.safeT = 0.2;
          C.wp.x = a.tx; C.wp.z = a.tz;
          if (Math.hypot(a.tx - a.x, a.tz - a.z) > 0.05 &&
            (!pathClear(rt, a, C.wp, true) || nearSoldier(rt, a.tx, a.tz, 12, a) || crowdBlocked(C, a, a.tx, a.tz))) {
            a.tx = a.x; a.tz = a.z; a.wpT = 0;
          }
        }
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d > 0.05) {
          const st = Math.min(d, a.spd * dt);
          const x = a.x + dx / d * st, z = a.z + dz / d * st;
          // 姉川の里道で人が交差しても、次の安全確認までの間に重ならない。
          // 今の一歩だけを見る。既に近い人は、小さな歩幅でも離れられる。
          if (rt.def.civilianCrowd?.avoidArmies && crowdBlocked(C, a, x, z, 0)) {
            a.tx = a.x; a.tz = a.z;
            a.wpT = Math.min(a.wpT, 0.2);
          } else {
            a.x = x; a.z = z; a.ran += st; travelled = st; moving = true;
            a.h = Math.atan2(dx, dz);
          }
        }
      }
      // 畦で待つ民は再避難でも残す。包囲の外へ出た扱いで家族を消さない。
      // 場外へ逃がす組だけ、戦場の端まで逃げきったら消える。
      if (!g.route && g.routeEnd !== 'wait' && (Math.abs(a.x) > half - 3 || Math.abs(a.z) > half - 3)) { a.out = false; if (g.agents.every((b) => !b.out)) g.state = 'gone'; }
    } else if (!still) a.idle += dt;
    // 曲がり角や合流直前の短い一歩でも、全速の足踏みをさせない。
    // 子は背丈に合う短い歩幅で刻み、近景と遠景で同じ歩調を使う。
    if (moving && !still) a.ph += naturalGait ? travelled * 3.4 / a.sc : dt * (a.escapeSpeed ?? a.spd) * (rt.def.civilianCrowd?.safeRetreat ? a.pace : 1) * 3.4;
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
      // 逃げ切った近くの人も、その場で隠して枠を返す。次の切り替えまで残像を残さない。
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
    if (rt.def.civilianCrowd?.nearKinds || rt.def.civilianCrowd?.consistentModelScale) m.scale.setScalar(a.sc);
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
      if (rt.def.civilianCrowd?.safeFlee && !crowdCanSee(rt, a.x, a.z,
        b, a.sc * 1.5, b.sc * 1.5)) continue;
      // 隣人そのものを脅威にせず、その人が逃げてきた兵や火の側から離れる。
      return b.g.threat || b.g.from;
    }
  }
  return null;
}







