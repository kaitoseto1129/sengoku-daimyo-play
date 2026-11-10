import { useTerrain } from './asset_manifest.js';
import { placeGroup, placePlayer } from './b_opening.js';
import { jinkeiBuild } from './jinkei.js';
import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
import { tsuigekiRetreat, tsuigekiStart, tsuigekiTick } from './c20_tsuigeki.js';
import { KILLS, broke } from './stages.js';
// 設楽原：備ごとの寄せ、柵際の乱戦、内側への後退と合図の一斉射。細部は説による復元。
import { gauss, allyGroup, nm, enemyGroup, centerOf } from './bhelp.js';
import { buildBobosaku } from './b_sunomata.js';
import { scenarioKey, RANKS } from './state.js';
import { S as SETTINGS } from './settings.js';
import { isTouch } from './touch.js';
import { nagashinojo } from './b_nagashinojo.js';
import { nobori, tawara, lumber, stumps, yagura, hiraTateGeo, WOOD_MAT, paintGeo } from './props.js';
import { goten } from './castle_parts.js';
import { tabaGeo, tabaMat } from './taketaba.js';
import { sfx } from './audio.js';
import { battleEvent, EVENT_VOLLEY, EVENT_MESSENGER, EVENT_RETREAT } from './battle_events.js';
import { sightPoint, sightUnit } from './battle_sight.js';
import { sendOrder } from './denrei.js';
import { seasonOf, sky } from './b_shared.js';
import { depthTick } from './b_depth.js';
import { DEPTH_SHITARA } from './shitaragahara/depth.js';
import { camp } from './b_mid.js';
import { demBlend, demSample } from './dem.js';
import { drawGroundAt } from './render_camera.js';
import { WIND_STATE } from './world.js';
import { localClear } from './army_local_way.js';
import { slopeLitter, contactLitter, groundFlagVariant } from './army_ground.js';
import { rockShape, rockTuftShape, groundRocks } from './rock_shape.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flagTexture } from './textures.js';
import { timeslipField, fieldGrassGeo, fieldGrassMat } from './timeslip_field.js';
import { goalsTick } from './hud_goals.js';
import { FACTION } from './units_data.js';
// 15分の構成（docs/oda15_plan_1108.md 17）：段の中身は shitaragahara/ に一段一ファイル
import * as ST_INTRO from './shitaragahara/intro.js';
import * as ST_BREACH from './shitaragahara/breach.js';
import * as ST_HARA from './shitaragahara/hara.js';
import * as ST_YOIN from './shitaragahara/yoin.js';
import * as ST_WALL from './shitaragahara/teppo_wall.js';
import * as ST_TAME from './shitaragahara/tameshi.js';
import * as ST_MEISHO from './shitaragahara/meisho.js';
import * as ST_SOKO from './shitaragahara/sokogeki.js';
// 地面を作る前に標高を読み終える。後から届いても地面の格子は作り直されない。
let DEM = null;
useTerrain('dem_shitaragahara', (data) => { DEM = data; });
import { tagZones, gapSize, inArc, assignBands, ceaseBands, kamaeBands, volleyBands, rollBands, losTick, reserveTick } from './yasen_jinchi.js';

// kaito 10/31：寄せる敵は、ほかの者より本人を多く狙う。本人から三十歩内で打ちかかる組を本人へ向ける
//   （三歩半内の別の敵には先に応じる）。本人が深手の時と、定義が門・櫓へ向けた組は外す。共通の兵の考えは触らない。
function huntPlayer(rt, dt) {
  const F = rt.flags;
  if ((F._huntT = (F._huntT || 0) - dt) > 0) return;
  F._huntT = 0.5;
  const P = rt.player.u;
  if (!P?.alive) return;
  const weak = P.hp < P.maxHp * 0.4;
  for (const g of rt.army.groups) {
    if (g.focus && !g.focus.alive) g.focus = null;
    for (const u of g.units) {
      if (!u.alive || u.isPlayer) continue;
      if (u.target && !u.target.alive) { u.target = null; u.aiT = 0; }
      if (u.atk?.target && !u.atk.target.alive) u.atk = null;
      if (u.swing?.target && !u.swing.target.alive) u.swing = null;
    }
    if (g.team !== 1 || !g.count || g.noHunt) continue;
    const mine = g.focus === P;
    if (g.focus && !mine) continue;
    if (g.routed || weak || g.order !== 'attack' || g.isPlayerSquad) { if (mine) g.focus = null; continue; }
    const c = g.center(), d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
    if (!mine && d < 30) g.focus = P;
    else if (mine && d > 45) g.focus = null;
  }
}

// 10/31 mini の点付け：開戦25秒の本人の位置と向きは流すたびに変わり、決まった所に置いた押し合いが画面から外れた。
// 開戦から win 秒の間、本人の前（カメラの向く先）の foeD 歩へ近い敵の組を、allyD 歩へ味方の組を寄せ続け、
// 画面の正面で斬り合わせる。兵は足さず、瞬間移動もしない（歩いて寄る）。時が過ぎたら元の下知へ戻す。
function heroFrontClash(rt, dt, o = {}) {
  const F = rt.flags, P = rt.player.u;
  const H = F._hfc || (F._hfc = { t: 0, t0: rt.t, saved: new Map() });
  if (H.done || (H.t -= dt) > 0) return;
  H.t = 0.5;
  if (rt.t - H.t0 > (o.win ?? 50) || rt.over || F.ending || !P?.alive || (o.active && !o.active(rt))) {
    for (const [g, s] of H.saved) { g.order = s.order; g.path = s.path; g.pathIdx = s.pathIdx; g.noAI = s.noAI; g.aggro = s.aggro; }
    H.saved.clear(); H.done = true; return;
  }
  const e = rt.camera?.matrixWorld?.elements;
  let fx = e ? -e[8] : 0, fz = e ? -e[10] : 0, L = Math.hypot(fx, fz);
  if (L < 0.3) { fx = Math.sin(P.heading); fz = Math.cos(P.heading); L = 1; }
  fx /= L; fz /= L;
  // 戦の視点が決まった向き（例：表門）を見る時は、その向きを使う
  const D = o.dir && o.dir(rt);
  if (D) { const l = Math.hypot(D.x, D.z) || 1; fx = D.x / l; fz = D.z / l; }
  const pick = (foe, want, d) => {
    let x = P.pos.x + fx * d, z = P.pos.z + fz * d;
    if (o.clamp) ({ x, z } = o.clamp(x, z));
    // 前が塀・柵の向こうなら、本人の手前の側（壁の内）まで縮める
    for (let k = 0; k < 3 && rt.army.wallBetween(P.pos, -1, { x, y: P.pos.y, z }); k++) { d *= 0.6; x = P.pos.x + fx * d; z = P.pos.z + fz * d; if (o.clamp) ({ x, z } = o.clamp(x, z)); }
    const list = [];
    for (const g of rt.army.groups) {
      if ((g.team !== P.team) !== foe || g.isPlayerSquad || g.routed || g.count < 2 || (o.skip && o.skip(g, foe))) continue;
      if (g.assault || g.siegeAI || g.units.some((u) => u.alive && (u.type === 'busho' || u.isLord || u === rt.flags.nb))) continue;
      const c = g.center(), r = Math.hypot(c.x - x, c.z - z);
      // 塀・柵・門の向こうの組は寄せない（壁に詰まって突っ立つ）
      if (r < (o.reach ?? 70) && !rt.army.wallBetween({ x: c.x, y: P.pos.y, z: c.z }, -1, { x, y: P.pos.y, z })) list.push([r, g]);
    }
    list.sort((a, b) => a[0] - b[0]);
    const out = []; let n = 0;
    for (const [, g] of list) { if (n >= want) break; out.push(g); n += g.count; }
    out.forEach((g, k) => {
      if (!H.saved.has(g)) H.saved.set(g, { order: g.order, path: g.path, pathIdx: g.pathIdx, noAI: g.noAI, aggro: g.aggro });
      const side = (k - (out.length - 1) / 2) * 6 + (foe ? 0 : 1.5);
      g.order = 'hold'; g.noAI = true; g.aggro = Math.max(g.aggro || 0, 9);
      if (g.focus && g.focus !== P) g.focus = null;
      g.anchor.x = x + fz * side; g.anchor.z = z - fx * side;
      g.facing = foe ? Math.atan2(-fx, -fz) : Math.atan2(fx, fz);
    });
  };
  pick(true, o.foeN ?? 22, o.foeD ?? 15);
  pick(false, o.allyN ?? 16, o.allyD ?? 9);
}
// 横・奥行き・高さを同じ二分の一にする。南北だけ十倍以上縮めていた旧配置は使わない。
// 鉄砲は柵の口を通り、内側の道から支援の位置へ移る。
function gunRoad(rt, g, z, x, side) {
  const c = g.center();
  // 一・三列目の口は z〜z+6、二列目は z+3〜z+9。重なる道の中央を通る。
  const gateZ = z + 4.5;
  const path = c.x > SB.x0 - 2 * SB.gap ? [[c.x, c.z], [c.x, gateZ], [x, gateZ], [x, side]] : [[c.x, c.z], [x, c.z], [x, side]];
  const a = { x: 0, z: 0 }, b = { x: 0, z: 0 };
  for (let i = 1; i < path.length; i++) {
    a.x = path[i - 1][0]; a.z = path[i - 1][1]; b.x = path[i][0]; b.z = path[i][1];
    if (rt.army.wallBetween(a, -1, b, false)) return null;
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3);
    for (let j = 1; j <= n; j++) if (!rt.world.walkable(a.x + (b.x - a.x) * j / n, a.z + (b.z - a.z) * j / n)) return null;
  }
  return path;
}
function readyCount(g) {
  let n = 0;
  for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.gone && !u.noTarget) n++;
  return n;
}
// 徒歩が退いても、柵内で戦う騎馬が残れば寄せは終わらない。
function waveDefeated(g) {
  return (g.routed || readyCount(g) === 0)
    && (!g.cavSent || g.cavalry.routed || readyCount(g.cavalry) === 0);
}
function shCavalry(rt, g) {
  const F = rt.flags, cav = g.cavalry;
  const footGone = g.routed || readyCount(g) === 0;
  // 柵を破った直後に徒歩が崩れた時も、まだ加勢していない騎馬を置き去りにしない。
  if (footGone && !g.cavSent && !g.escortsRetiring) {
    g.escortsRetiring = true;
    for (const q of [cav, g.missiles]) if (readyCount(q) && !q.routed) {
      q.noRout = false; q.order = 'retreat'; q.dest = { x: 690, z: g.def.z }; q.fleeDir.x = 1;
    }
  } else if (!g.cavSent && !cav.routed && readyCount(cav)
      && !footGone && !(g.cavCheckAt > rt.t) && (g.opened || g.center().x < SB.x0 + 18)) {
    g.cavCheckAt = rt.t + 0.5;
    if (!g.cavApproach) {
      g.cavApproach = true; cav.order = 'move'; cav.dest = { x: SB.x0 + 6, z: g.lane.z };
    }
    // 徒歩が取り付く間に騎馬も口の前へ寄せ、開いたら間を置かずに続く。
    if (rt.t - g.attackAt >= 6 && (g.opened || gapSize(F.fence, zoneOfZ(g.def.z)).m >= 7)) {
      g.cavSent = true;
      cav.formation = 'column'; cav.colW = 1; cav.aggro = 2; cav.roadColumn = true;
      const tail = Math.max(0, readyCount(cav) - 1) * cav.layout(cav.initial).sd * 1.3;
      cav.order = 'path'; cav.pathIdx = 0; cav.dest = null;
      cav.path = [[SB.x0 + 6, g.lane.z], [INNER_POST_X - tail - 1, g.lane.z]];
      cav.arriveCount = readyCount(cav);
      cav.onArrive = (q) => { q.noRout = false; q.order = 'attack'; q.seekRange = 24; q.aggro = 14; };
    }
  }
  // 傷も前進もない騎馬だけが柵間に残った時は退かせ、次の寄せを詰まらせない。
  if (g.cavSent && !cav.routed && readyCount(cav) && !(cav.shCheckAt > rt.t)) {
    cav.shCheckAt = rt.t + 0.5;
    if (cav.order === 'path') cav.arriveCount = readyCount(cav);
    const c = cav.center(), n = readyCount(cav);
    let hp = 0;
    for (const u of cav.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone) hp += u.hp;
    if (n !== cav.shN || hp !== cav.shHp || cav.shX == null || Math.hypot(c.x - cav.shX, c.z - cav.shZ) > 2) {
      cav.shN = n; cav.shHp = hp; cav.shX = c.x; cav.shZ = c.z; cav.shMovedAt = rt.t;
    } else if (rt.t - cav.shMovedAt > 18) { cav.noRout = false; cav.morale = 0; }
  }
  if (waveDefeated(g) && !g.missilesRetiring) {
    g.missilesRetiring = true;
    g.missiles.order = 'retreat'; g.missiles.dest = { x: 690, z: g.def.z };
  }
}
// 退く殿へ追いついた時だけ、現在の兵の位置で守りに移る。
// 既存の到着処理で無敵・敗走禁止を解く。増兵や回復はしない。
function shRearStand(rt) {
  const F = rt.flags, R = F.rear;
  if (F.rearAtExit) return;
  const at = F.rearGuidePoint;
  R.anchor.x = at.x; R.anchor.z = at.z;
  R.path = null; R.dest = null; R.onArrive = null;
  F.rearAtExit = true;
  F.chaseRearDefend(R);
}
// 実際に続けて撃った組だけ硝煙を厚くする。共通の煙の枠を使い回す。
function shSmoke(rt) {
  const field = SETTINGS.quality === 'high';
  for (let i = 0; i < rt.flags.guns.length; i++) {
    const g = rt.flags.guns[i];
    for (const u of g.units) {
      if (!(u.fireT > 0)) { u.shSmokeSeen = false; continue; }
      if (u.shSmokeSeen) continue;
      u.shSmokeSeen = true;
      const smoke = rt.flags.smokeBands[i];
      if (!field) smoke.shotAt = rt.t;
      if (rt.t - (g.shShotAt ?? -9) > 0.6) { g.shShotAt = rt.t; g.shShotN = 0; }
      g.shShotN++;
      // 高では本物の発砲音が一挺ずつ鳴る。二発目へ架空の一斉射を重ねない。
      if (!field && g.shShotN === 2 && rt.t - (g.shVolleySoundAt ?? -9) >= 8) {
        g.shVolleySoundAt = rt.t;
        sfx('volley', 0.65);
      }
      const heading = field ? u.shMuzzleHeading ?? u.heading : u.heading;
      const fx = Math.sin(heading), fz = Math.cos(heading);
      const mx = field ? u.shMuzzleX ?? u.pos.x + fx * 2 : u.pos.x + fx * 2;
      const my = field ? u.shMuzzleY ?? u.pos.y + 1.5 : u.pos.y + 1.5;
      const mz = field ? u.shMuzzleZ ?? u.pos.z + fz * 2 : u.pos.z + fz * 2;
      if (field) {
        // 煙が残る間は発生点を固定する。続く銃口の煙は既存の粒で重ね、
        // 一枚の煙を別の射手へ引き戻したり、広がりを最初からやり直したりしない。
        if (rt.t - smoke.shotAt >= 7) {
          smoke.shotAt = rt.t;
          smoke.x = mx; smoke.y = my; smoke.z = mz;
          smoke.vx = WIND_STATE.dirX * WIND_STATE.gust * 0.6;
          smoke.vz = WIND_STATE.dirZ * WIND_STATE.gust * 0.6;
          smoke.mesh.rotation.y = heading;
        }
      }
      rt.army.smoke(mx, my, mz, fx, fz, 2.4);
      // 高の厚い硝煙は実際に撃った二人から一つずつ。同じ銃口へ二重に置かない。
      if (field && g.shShotN <= 2) rt.world.gunSmoke(mx, mz, 0xeeeae2);
      if (g.shShotN === 1) {
        if (!field) {
          rt.world.gunSmoke(u.pos.x + fx * 2, u.pos.z + fz * 2, 0xc9c4b8);
          rt.world.gunSmoke(u.pos.x + fx * 4.5 + fz * 0.8, u.pos.z + fz * 4.5 - fx * 0.8, 0xb7b2a6);
        }
        // 高では持ち場で弾を込める。一人目の発砲で、まだ狙う同じ列まで動かさない。
        const h = g.shRow;
        if (!field && h && !rt.flags.pursuit && !(h.shReturnAt > rt.t)) {
          h.shReturnAt = rt.t + 6;
          const postX = h.army.cx, postZ = h.army.cz;
          h.moveTo(postX - 0.8, postZ, 1);
          // 移動後の位置ではなく、撃つ前の持ち場へ戻す。斉射のたびに列を後退させない。
          rt.after(6, () => { if (!rt.flags.ending && !rt.flags.pursuit) h.moveTo(postX, postZ, 1); });
        }
      }
    }
  }
}
// 箱の空いた隅でなく、見える体の表面を坂へ接地する。
// 回転途中も落馬時にだけ測り、倒れる間は保存した高さを使う。
function shHorseRest(rt, horse) {
  const floor = drawGroundAt(rt.world, horse.position.x, horse.position.z);
  const ground = rt.flags.horseGround || (rt.flags.horseGround = {
    heightAt: (x, z) => drawGroundAt(rt.world, x, z)
  });
  const visible = horse.visible;
  horse.visible = true;
  horse.rotation.order = 'YXZ';
  horse.position.y = floor;
  horse.rotation.z = 0;
  contactLitter(horse, ground, floor, .015);
  horse.userData.shStandY = horse.position.y;
  horse.userData.shStandQ = horse.quaternion.clone();
  horse.position.y = floor;
  horse.rotation.z = (horse.userData.shFallSide || -1) * 1.5;
  slopeLitter(horse, ground, floor);
  contactLitter(horse, ground, floor, .015);
  horse.userData.shLieY = horse.position.y;
  horse.userData.shLieQ = horse.quaternion.clone();
  if (SETTINGS.quality === 'high') {
    // 胴が横へ張り出す途中も地面を突き抜けない。形の支点は共通処理で使い回す。
    const heights = new Float32Array(17);
    for (let i = 0; i < heights.length; i++) {
      horse.quaternion.slerpQuaternions(horse.userData.shStandQ, horse.userData.shLieQ, i / (heights.length - 1));
      horse.position.y = floor;
      contactLitter(horse, ground, floor, .015);
      heights[i] = horse.position.y;
    }
    horse.userData.shFallHeights = heights;
  }
  shHorseTilt(horse, 0);
  horse.visible = visible;
}
function shHorseTilt(horse, k) {
  // 姿勢と高さを同じ間でつなぎ、倒れ切った時の音と土にも合わせる。
  const fall = SETTINGS.quality === 'high' ? k * k * (3 - 2 * k) : k;
  horse.quaternion.slerpQuaternions(horse.userData.shStandQ, horse.userData.shLieQ, fall);
  const heights = SETTINGS.quality === 'high' && horse.userData.shFallHeights;
  if (heights) {
    const at = fall * (heights.length - 1), i = Math.min(heights.length - 2, Math.floor(at));
    horse.position.y = heights[i] + (heights[i + 1] - heights[i]) * (at - i);
  } else horse.position.y = horse.userData.shStandY + (horse.userData.shLieY - horse.userData.shStandY) * fall;
}
// 倒れた幟は竿ごと伏せる。布の留め辺を保ち、自由な裾だけ皺にする。
// 皺の原形は共有し、倒れた時だけ布を坂へ沿わせる。
const SH_FLAG_POINT = new THREE.Vector3(), SH_FLAG_INVERSE = new THREE.Matrix4();
function shGroundFlag(rt, g) {
  if (g.userData.shGrounded) return;
  const flag = g.userData.flag, source = flag.geometry;
  const cache = rt.flags.groundFlagGeos || (rt.flags.groundFlagGeos = new Map());
  let geo = cache.get(source);
  if (!geo) {
    geo = source.clone(); geo.computeBoundingBox();
    const box = geo.boundingBox, p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const free = (x - box.min.x) / (box.max.x - box.min.x);
      const loose = (box.max.y - y) / (box.max.y - box.min.y);
      p.setXYZ(i, x - free * loose * 0.14, y + free * loose * 0.10,
        -0.015 - Math.abs(Math.sin(x * 19 + y * 11)) * 0.10 * free * loose);
    }
    geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
    cache.set(source, geo);
  }
  flag.geometry = geo; flag.material = groundFlagVariant(flag.material);
  g.rotation.set(Math.PI / 2, g.rotation.y, 0, 'YXZ');
  g.position.y = drawGroundAt(rt.world, g.position.x, g.position.z);
  slopeLitter(g, rt.world, g.position.y);
  const visible = flag.visible;
  flag.visible = true; // 画面外で隠れた旗も、竿と布を測ってから元の表示へ戻す。
  contactLitter(g, rt.world, g.position.y, 0.025);
  // 長い竿の端を支える高さだけでは、窪地の上に布が板状に浮く。
  // 竿は直線のまま残し、布だけを描く地面へ垂らす。毎コマは調べない。
  geo = geo.clone();
  flag.geometry = geo;
  cache.set(g, geo);
  g.updateMatrixWorld(true);
  SH_FLAG_INVERSE.copy(flag.matrixWorld).invert();
  const p = geo.attributes.position, box = geo.boundingBox;
  for (let i = 0; i < p.count; i++) {
    const free = Math.max(0, Math.min(1, (p.getX(i) - box.min.x) / (box.max.x - box.min.x)));
    SH_FLAG_POINT.fromBufferAttribute(p, i).applyMatrix4(flag.matrixWorld);
    const y = drawGroundAt(rt.world, SH_FLAG_POINT.x, SH_FLAG_POINT.z);
    if (!Number.isFinite(y)) continue;
    const fold = Math.abs(p.getZ(i));
    // 竿への留め辺は動かさず、自由な裾へ向かって地面へ落とす。
    SH_FLAG_POINT.y += (y + 0.025 + fold - SH_FLAG_POINT.y) * Math.sqrt(free);
    SH_FLAG_POINT.applyMatrix4(SH_FLAG_INVERSE);
    p.setXYZ(i, SH_FLAG_POINT.x, SH_FLAG_POINT.y, SH_FLAG_POINT.z);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
  flag.visible = visible;
  g.userData.shGrounded = true;
}
// 馬の実際の討死・落馬だけを柵際に残す。形と材質は元の馬と共有する。
function shFallenHorse(rt, u) {
  const F = rt.flags;
  if (u.shHorseShown || !u.horse || u.team !== 1 || Math.abs(u.pos.x - SB.x0) > 35 || F.fallenHorses.length >= 6) return;
  u.shHorseShown = true;
  // 同じ虎口で続けて落馬しても、写した馬を同じ場所へ積み重ねない。
  for (const q of F.fallenHorses) if (Math.hypot(q.horse.position.x - u.pos.x, q.horse.position.z - u.pos.z) < 4) return;
  for (const band of F.frontBands) if (band.fallenHorse?.visible
      && Math.hypot(band.fallenHorse.position.x - u.pos.x, band.fallenHorse.position.z - u.pos.z) < 4) return;
  const horse = u.horse.clone(true);
  // 左右と崩れる速さを個体ごとに変え、同じ型の横倒しが続くのを避ける。
  if (SETTINGS.quality === 'high') horse.userData.shFallSide = u.id % 2 ? 1 : -1;
  horse.position.set(u.pos.x, rt.world.heightAt(u.pos.x, u.pos.z) + 0.55, u.pos.z);
  horse.rotation.set(0, u.heading, 0);
  horse.traverse((m) => { if (m.isMesh) { m.onBeforeRender = () => {}; delete m.userData.lod; } });
  shHorseRest(rt, horse);
  rt.scene.add(horse);
  F.fallenHorses.push({ horse, at: rt.t, duration: SETTINGS.quality === 'high' ? 0.58 + (u.id % 7) * 0.045 : 0.7 });
}
function shPostFlag(rt, p = rt.flags.commandPt) {
  const F = rt.flags;
  F.holdFlag.visible = true;
  // 背後の視点と持ち場の間を空け、旗は前寄りの脇へ据える。
  F.holdFlag.position.set(p.x + 2, drawGroundAt(rt.world, p.x + 2, p.z + 9), p.z + 9);
}
function shHoldFlag(rt) {
  const F = rt.flags, p = F.commandPt;
  // 旗が脇へ移った時も仙石の組と近い守兵が同じ持ち場へ寄る。
  // 射手の前は空け、増援を湧かせず既存の組を動かす。
  postRoad(rt, F.spears[0], p);
  const guard = F.spears[Math.abs(p.z - MOUTHS[0].z) < 60 ? 1 : 2];
  if (guard && readyCount(guard)) postRoad(rt, guard, { x: p.x - 3, z: p.z + 7 });
  // 持ち場の真上に竿を立てず、槍組の脇へ置く。背後の視点を布で覆わない。
  shPostFlag(rt);
  // 奥の柵の危険が続く間は、戻り先の印を後退や判断で消さない。
  rt.unmark('next_mouth');
  rt.marker('command', p, '内側の槍の持ち場', SH_HOLD_GUIDE);
}
function gunsLoaded(gs) {
  let living = false;
  for (const g of gs) if (!g.routed) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.gone && !u.noTarget && !u.sidearm && u.gunAmmo !== 0 && u.type === 'gun') {
    living = true; if (!u.reload) return true;
  }
  return !living;
}

// 土塁の切れ目から奥の道へ出て、次の虎口へ進む。道筋は下知の時だけ作る。
function postRoad(rt, g, pt) {
  const c = g.center(), route = rt.flags.fenceRoute;
  g.focus = null; g.pending = null; g.aggro = 2; g.roadColumn = true;
  const crossesFence = (c.x > SB.x0 - 2 * SB.gap + 2) !== (pt.x > SB.x0 - 2 * SB.gap + 2);
  if (Math.abs(c.z - pt.z) > 24 || crossesFence) {
    let gate = route.gates[0];
    for (const z of route.gates) if (Math.abs(z - c.z) < Math.abs(gate - c.z)) gate = z;
    const gz = gate + route.offset;
    let next = route.gates[0];
    for (const z of route.gates) if (Math.abs(z - pt.z) < Math.abs(next - pt.z)) next = z;
    const nz = next + route.offset;
    g.order = 'path'; g.formation = 'column'; g.colW = 1; g.pathIdx = 0;
    g.path = c.x <= route.rearX + 0.8
      ? [[route.rearX, c.z], [route.rearX, nz], [pt.x, nz], [pt.x, pt.z]]
      : [[c.x, gz], [route.rearX, gz], [route.rearX, nz], [pt.x, nz], [pt.x, pt.z]];
    g.dest = null;
  } else { g.order = 'move'; g.dest = pt; g.path = null; }
  g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI / 2; q.formation = pt.x > route.rearX ? 'column' : q.kind === 'gun' || q.kind === 'bow' ? 'line' : 'yari'; q.colW = 1; };
}

// 知らせの発生時だけ使番を出す。到着・討死は共通の実際の移動で判定する。
// 本物の兵の枠は共通の二百五十人を守る。届かなくても戦の流れは止めない。
function shReport(rt, text, dur = 3, source = null, wave = null) {
  const F = rt.flags;
  F.reportAt ??= Object.create(null);
  if (F.reportAt[text] != null) return;
  F.reportAt[text] = rt.t;
  const pursuit = !!F.pursuit;
  const chaseOrdered = !!F.chaseOrdered;
  const withdrew = !!wave?.withdrew;
  if (!source) {
    const z = wave ? wave.def.z : /南|山県|赤備え/.test(text) ? MOUTHS[2].z
      : /北|真田|丸山/.test(text) ? MOUTHS[0].z : MOUTHS[1].z;
    source = /羽柴/.test(text) ? { x: REAR_POSTS[1][1], z: REAR_POSTS[1][2] }
      : { x: F.fenceRoute.rearX, z };
  }
  sendOrder(rt, source, rt.player.u, { id: 'report', apply() {
    // 戦況が変わった後に、済んだ寄せの下知を届け直さない。
    if (F.ending || rt.over || !rt.player.u.alive || !!F.pursuit !== pursuit || !!F.chaseOrdered !== chaseOrdered || wave?.doneWave || !!wave?.withdrew !== withdrew) return;
    // 寄せ手が退いた後には、済んだ敵を迎え撃つ下知を届けない。
    if (wave && waveDefeated(wave)) return;
    rt.say('使番', text, dur);
  } }, { team: 0, faction: F.oda ? 'oda' : 'tokugawa' });
}
// 使番も三重の柵の口と奥の道を使う。行き先の入れ物は兵ごとに使い回す。
function shRunnerWay(army, u, target) {
  if (!u.group?.isRunner) return target;
  const rearX = SB.x0 - 2 * SB.gap - 6;
  const p = u.pos, out = u.shRunnerPoint || (u.shRunnerPoint = { x: 0, z: 0 });
  out.x = target.x; out.z = target.z;
  const split = SB.x0 - SB.gap;
  const crosses = army.wallBetween(p, -1, target, false);
  if (crosses) {
    let gate = SB.gates[0];
    for (const z of SB.gates) if (Math.abs(z - p.z) < Math.abs(gate - p.z)) gate = z;
    const z = gate + 4.5;
    if (Math.abs(p.z - z) > 1) { out.x = p.x; out.z = z; }
    else { out.x = target.x; out.z = z; }
  } else if (p.x < split && Math.abs(p.z - target.z) > 24) {
    if (Math.abs(p.x - rearX) > 1) { out.x = rearX; out.z = p.z; }
    else { out.x = rearX; out.z = target.z; }
  }
  return out;
}

// 敗兵も閉じた柵へ走り続けず、三重の口を抜けてから退き口へ向かう。
// 通れる破れ目はそのまま使う。経路の判定は間を置き、行き先を兵ごとに使い回す。
function shFleeWay(army, u, target) {
  if (SETTINGS.quality !== 'high' || u.isPlayer) return target;
  const p = u.pos, left = SB.x0 - 2 * SB.gap - 2, right = SB.x0 + 2;
  if (p.x < left && target.x < left || p.x > right && target.x > right) {
    u.shFleeGate = null; u.shFleeBlocked = false; u.shFleeCrossing = false;
    return target;
  }
  const out = u.shFleePoint || (u.shFleePoint = { x: 0, z: 0 });
  if (!(u.shFleeCheckAt > army.time)) {
    u.shFleeCheckAt = army.time + 0.4;
    u.shFleeBlocked = army.wallBetween(p, -1, target, false);
    if (u.shFleeBlocked && u.shFleeGate == null) {
      let gate = SB.gates[0];
      for (const z of SB.gates) if (Math.abs(z + 4.5 - p.z) < Math.abs(gate + 4.5 - p.z)) gate = z;
      // 同じ口でも左右に少し散らす。重なる三列の口の内側に収める。
      u.shFleeGate = gate + 4.5 + ((u.id * 0.618034) % 1 - 0.5) * 1.2;
      u.shFleeCrossing = false;
    }
  }
  if (!u.shFleeBlocked && u.shFleeGate == null) return target;
  const exit = target.x >= p.x ? right : left;
  // 口へ揃えた後も外側まで同じ道を保ち、二列目で再び柵へ斜めに走らせない。
  if (u.shFleeGate != null && (exit === right ? p.x >= right : p.x <= left)) {
    u.shFleeGate = null; u.shFleeBlocked = false; u.shFleeCrossing = false;
    return target;
  }
  // 一度口へ入ったら、小さな肩の押し合いでは前進を止めない。
  // 三列の口から外れそうな時だけ揃え直し、柵の中で横移動を繰り返すのを防ぐ。
  const drift = Math.abs(p.z - u.shFleeGate);
  if (drift <= 0.35) u.shFleeCrossing = true;
  else if (drift > 0.75) u.shFleeCrossing = false;
  out.x = u.shFleeCrossing ? exit : p.x;
  out.z = u.shFleeGate;
  return out;
}

const METRES = 2;
const DEM_SCALE = 0.7;   // 横を二分の一に縮めた分、高さを七割にして両岸の台地と谷の深さを見せる（二分の一では平らな野に見えた。10/28）
// 実測の連吾川の谷筋（南北 20m ごと、実の x）。標高の格子の中心は川から外れていて、川が東の台地の縁を流れ、谷は柵の西にあった。
// 谷の底を東西にずらして川筋（x=22）へ重ね、両岸の台地の高さと起伏は実測のまま使う（10/28）。
let VALLEY = null;
function valleyShift(realZ) {
  if (!DEM) return 0;
  if (!VALLEY) {
    const raw = [];
    for (let rz = -1600; rz <= 1600; rz += 20) {
      let best = 0, low = Infinity;
      for (let rx = -440; rx <= 160; rx += 10) {
        const h = demSample(DEM, rx - 20, rz) + demSample(DEM, rx, rz) + demSample(DEM, rx + 20, rz) + Math.abs(rx + 140) * 0.012;
        if (h < low) { low = h; best = rx; }
      }
      raw.push(best);
    }
    VALLEY = raw.map((_, i) => { let s = 0, n = 0; for (let j = i - 8; j <= i + 8; j++) if (raw[j] !== undefined) { s += raw[j]; n++; } return s / n; });
  }
  const f = Math.max(0, Math.min(VALLEY.length - 1.001, (realZ + 1600) / 20)), i = Math.floor(f), t = f - i;
  return VALLEY[i] * (1 - t) + VALLEY[i + 1] * t;
}
const demRiver = (x, z) => x - 22 + valleyShift(z * METRES) / METRES;
const SB = { x0: 14, gap: 7, z0: -500, z1: 500, gates: [-280, 18, 350] };
// 槍は柵から四メートルの所で受ける。寄せ手も同じ口を目標にする。
const OUTER_POST_X = SB.x0 - 4;
const INNER_POST_X = SB.x0 - 2 * SB.gap - 4;
const MOUTHS = [
  { name: '大宮前', z: SB.gates[0] },
  { name: '柳田前', z: SB.gates[1] },
  { name: '竹広', z: SB.gates[2] },
];
const ZONES = [
  { name: '左翼', z0: SB.z0, z1: -220 },
  { name: '中央左', z0: -220, z1: -60 },
  { name: '中央', z0: -60, z1: 60 },
  { name: '中央右', z0: 60, z1: 260 },
  { name: '右翼', z0: 260, z1: SB.z1 },
];
const zoneOfZ = (z) => (ZONES.find((zz) => z >= zz.z0 && z < zz.z1) || (z < SB.z0 ? ZONES[0] : ZONES[4])).name;
// 11/6 fixc1721（八1）：直線の継ぎで定規の用水路に見えた。実測の谷筋の点の間を十二メートルごとに細かくし、
//   小川らしく左右へ蛇行させる（幅三メートルほど。柵の側へは寄せず、一の柵の前の崖は保つ）。
const RENGO = (() => {
  const base = [[22, -760], [20, -500], [22, -280], [24, -20], [20, 180], [22, 350], [24, 500], [22, 760]], out = [];
  for (let z = -760; z <= 760; z += 12) {
    let i = 1; while (i < base.length - 1 && z > base[i][1]) i++;
    const a = base[i - 1], b = base[i], x = a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
    out.push([x + 1.1 + 1.2 * Math.sin(z * 0.031 + 0.7) + 0.7 * Math.sin(z * 0.083 + 2.1) + 0.3 * Math.sin(z * 0.19), z]);
  }
  return out;
})();
const OMIYA = [[-190, -760], [-170, -400], [-160, 0], [-175, 350], [-190, 760]];
const CHAUSU = { x: -486, z: -100 }; // 柵から実距離約一キロ、西の奥
const KATSUYORI = { x: 430, z: 10 }; // 才ノ神の本陣。東の丘を越えた後方
// 出沢・寒狭川方面の退き口を縮めた遊び用の位置。連吾川と寒狭川を混同しない。
const REARGUARD = { x: 210, z: -320 };
const ESCAPE = { x: 690, z: -420 };
const IEYASU = { x: -80, z: 350 };
const MARUYAMA = { x: -28, z: -440 };

// ── 地形そのものが城（kaito 11/5 BP・docs/battle_refs/shitaragahara.md「11/5 地形の作り直し」）──
// 連吾川は小川だが岸が急に落ち込む。織田・徳川の側（西）は段丘崖の下から柵の並ぶ段へきつく登り、
// 一の柵は川の崖の上、二の柵・三の柵はそれぞれ切岸の段の上に立つ（攻める側から見上げると山城の曲輪）。
// 東は崖の上がすぐ沼の低地（連吾川から約十メートル）、その先の田と段丘の間に、武田の陣から見えにくい窪地。
// 全域の格子（約十一メートル）は増やさず、柵と川の帯だけ細かい面で埋める（伊賀の大手坂と同じ作り）。
const shSmooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function rengoX(z) {
  if (z <= RENGO[0][1]) return RENGO[0][0];
  // 点は十二メートルごと。地面の頂点ごとに呼ぶので、頭から探さず番号で引く
  const i = Math.min(RENGO.length - 1, Math.max(1, Math.ceil((z - RENGO[0][1]) / 12)));
  const a = RENGO[i - 1], b = RENGO[i];
  if (z >= b[1]) return b[0];
  return a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
}
// 虎口の道（三つの口の四・五メートル北）では崖と段を坂に替え、組と寄せ手が通れる幅を残す。
function shGateK(z) {
  let k = 0;
  for (const g of SB.gates) k = Math.max(k, 1 - shSmooth((Math.abs(z - (g + 4.5)) - 5) / 7));
  return k;
}
// 柵の帯の南北の端で元の地形へ戻す。
const shFortZ = (z) => shSmooth((528 - Math.abs(z)) / 24);
// 窪地（x・z・東西の半幅・南北の半長・深さ）。田の東の縁から武田の備の手前まで。退き口の道（大宮前の東）は空ける。
const SH_HOLLOWS = [
  [66, -420, 8, 30, 2.3], [82, -350, 7, 22, 1.9], [64, -190, 9, 38, 2.6], [84, -110, 7, 26, 2.0], [66, -30, 8, 28, 2.3],
  [64, 95, 9, 34, 2.6], [84, 170, 7, 24, 2.0], [66, 255, 8, 30, 2.3], [82, 430, 8, 28, 2.1],
];
function shHollowAt(x, z) {
  let k = 0;
  for (const [cx, cz, hw, hl] of SH_HOLLOWS) {
    const dx = (x - cx) / hw, dz = (z - cz) / hl;
    if (dx * dx + dz * dz >= 1) continue;
    // 底は平らに、縁は急に落とす（掘った堀でなく、雨水の削った谷地の形にわずかに歪める）
    const e = Math.sqrt(dx * dx + dz * dz) * (1 + 0.08 * Math.sin(z * 0.21 + x * 0.13));
    k = Math.max(k, shSmooth((1 - e) / 0.42));
  }
  return k;
}
function shHollowDepth(x, z) {
  let d = 0;
  for (const [cx, cz, hw, hl, depth] of SH_HOLLOWS) {
    const dx = (x - cx) / hw, dz = (z - cz) / hl;
    if (dx * dx + dz * dz >= 1) continue;
    const e = Math.sqrt(dx * dx + dz * dz) * (1 + 0.08 * Math.sin(z * 0.21 + x * 0.13));
    d = Math.max(d, depth * shSmooth((1 - e) / 0.42));
  }
  return d;
}
// 柵と川の帯の細かい高さ。coarse は元の格子の高さ（実測の標高を含む）。
function shFortHeight(coarse, x, z) {
  const fz = shFortZ(z);
  if (fz <= 0) return coarse(x, z);
  const rx = rengoX(z), r = x - rx, H0 = coarse(rx, z), gk = shGateK(z);
  // 11/6 fixc1721（八1）：川床の幅と崖の勾配を所ごとに変え、定規で引いた土手にしない（崩れた所・えぐれた所）
  const hw = 2.4 + 0.45 * Math.sin(z * 0.071 + 0.4) + 0.25 * Math.sin(z * 0.23 + 1.1);
  const run = 1.8 + 0.7 * (0.5 + 0.5 * Math.sin(z * 0.047 + 1.9));
  const lump = 0.14 * Math.sin(z * 0.91 + x * 1.3) * Math.sin(z * 0.37 + 0.5);
  let y;
  if (r < 0) {
    const d = -r;
    // 西の岸：川床 → 崖（二・八メートル）→ 一の柵の前の浅い空堀 → 二の柵の前の切岸 → 三の柵の前の切岸 → 弾正山へ緩く登る
    let p = -0.45 + 3.25 * shSmooth((d - hw) / run) + lump * Math.exp(-((d - hw - run / 2) ** 2) / 1.5);
    p -= 0.8 * Math.exp(-((x - (SB.x0 + 2.4)) ** 2) / 1.2) * shSmooth((d - 4) / 1.5);
    p += 2.2 * shSmooth((SB.x0 - SB.gap + 3.4 - x) / 2.6);
    p += 2.4 * shSmooth((SB.x0 - 2 * SB.gap + 3.6 - x) / 2.6);
    p += 0.8 * shSmooth((-1 - x) / 12);
    // 虎口：川から三の柵の奥まで一続きの坂（勾配およそ三割）
    const span = rx - 2.4 + 8, t = Math.max(0, Math.min(1, (rx - 2.4 - x) / span));
    const pr = -0.45 + 8.65 * t;
    p = p + (pr - p) * gk;
    y = Math.max(H0 + p - 0.22 * Math.max(0, -4 - x), coarse(x, z));
  } else {
    // 東の岸：崖（一・四メートル）の上がすぐ沼の低地。その先は元の田と段丘へつなぐ
    let p = -0.45 + 1.85 * shSmooth((r - hw) / (run * 0.75)) + lump * Math.exp(-((r - hw - run / 3) ** 2) / 1.2);
    p += 0.12 * Math.sin(z * 0.37 + x * 0.5) * shSmooth((r - 4) / 3);
    const pr = -0.45 + 1.85 * shSmooth((r - 2.4) / 6);
    p = p + (pr - p) * gk;
    const low = H0 + p;
    y = low + (Math.max(coarse(x, z), H0 + 1.4) - low) * shSmooth((r - 12) / 10);
  }
  return coarse(x, z) + (y - coarse(x, z)) * fz;
}
// 足の重さ：沼の低地と窪地の底は terrain_tags.js の 'hori'（歩み六割・上の柵から撃たれると損が増える）。
function shHoriAt(x, z) {
  if (Math.abs(z) > 520) return false;
  const r = x - rengoX(z);
  if (r > 3.6 && r < 12 && shGateK(z) < 0.5) return true;
  return x > 54 && x < 100 && shHollowAt(x, z) > 0.5;
}
// 元の三角形を抜いて同じ材質の細かい面で埋め、境の一升だけ元の地面へつなぐ（b_iga.js の igaRoadGroundPatch と同じ作り）。
function shGroundPatch(W, left, right, north, south, divisions, height) {
  const source = W.terrain.geometry, step = W.step;
  const cols = Math.round(W.half * 2 / step), stride = cols + 1;
  const i0 = Math.floor((W.half + left) / step), i1 = Math.ceil((W.half + right) / step);
  const j0 = Math.floor((W.half + north) / step), j1 = Math.ceil((W.half + south) / step);
  const x0 = -W.half + i0 * step, z0 = -W.half + j0 * step;
  const nx = (i1 - i0) * divisions, nz = (j1 - j0) * divisions, cell = step / divisions;
  const width = nx * cell, depth = nz * cell, coarseHeight = W.heightAt.bind(W);
  const geo = new THREE.PlaneGeometry(width, depth, nx, nz);
  geo.rotateX(-Math.PI / 2); geo.translate(x0 + width / 2, 0, z0 + depth / 2);
  const pos = geo.attributes.position, heights = new Float32Array(pos.count);
  const attrs = Object.entries(source.attributes).filter(([name]) => name !== 'position' && name !== 'normal');
  for (const [name, attr] of attrs) geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(pos.count * attr.itemSize), attr.itemSize));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const k = j * (nx + 1) + i, x = x0 + i * cell, z = z0 + j * cell;
    const rim = Math.max(0, Math.min(1, i / divisions, (nx - i) / divisions, j / divisions, (nz - j) / divisions));
    const base = coarseHeight(x, z), y = base + (height(coarseHeight, x, z) - base) * rim * rim * (3 - 2 * rim);
    heights[k] = y; pos.setXYZ(k, x, y, z);
    const ci = Math.min(cols - 1, i0 + Math.floor(i / divisions)), cj = Math.min(cols - 1, j0 + Math.floor(j / divisions));
    const tx = i0 + i / divisions - ci, tz = j0 + j / divisions - cj, a = cj * stride + ci;
    for (const [name, attr] of attrs) {
      const target = geo.attributes[name].array, n = attr.itemSize, values = attr.array;
      for (let c = 0; c < n; c++) {
        const A = values[a * n + c], B = values[(a + 1) * n + c], C = values[(a + stride) * n + c], D = values[(a + stride + 1) * n + c];
        target[k * n + c] = tx + tz <= 1 ? A + (B - A) * tx + (C - A) * tz : D + (C - D) * (1 - tx) + (B - D) * (1 - tz);
      }
    }
  }
  const indices = [], old = source.index.array, original = source.attributes.position;
  for (let k = 0; k < old.length; k += 3) {
    const a = old[k], b = old[k + 1], c = old[k + 2];
    const x = (original.getX(a) + original.getX(b) + original.getX(c)) / 3;
    const z = (original.getZ(a) + original.getZ(b) + original.getZ(c)) / 3;
    if (x <= x0 || x >= x0 + width || z <= z0 || z >= z0 + depth) indices.push(a, b, c);
  }
  source.setIndex(indices);
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  W.terrain.geometry = mergeGeometries([source, geo]);
  W.terrain.geometry.computeBoundingSphere();
  source.dispose(); geo.dispose();
  W.heightAt = function (x, z) {
    if (x <= x0 || x >= x0 + width || z <= z0 || z >= z0 + depth) return coarseHeight(x, z);
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.min(nx - 1, Math.floor(fx)), j = Math.min(nz - 1, Math.floor(fz));
    const tx = fx - i, tz = fz - j, a = j * (nx + 1) + i;
    const A = heights[a], B = heights[a + 1], C = heights[a + nx + 1], D = heights[a + nx + 2];
    return tx + tz <= 1 ? A + (B - A) * tx + (C - A) * tz : D + (C - D) * (1 - tx) + (B - D) * (1 - tz);
  };
}
// 柵と川の帯は約一・八メートル、窪地の帯は約五メートルの面。草木・川の水面・柵はこの後に、この高さへ据わる。
function shFortGround(W) {
  shGroundPatch(W, -21, 43, -541, 541, 6, shFortHeight);
  shGroundPatch(W, 44, 129, -531, 531, 2, (coarse, x, z) => coarse(x, z) - shHollowDepth(x, z) * shFortZ(z));
}
// 上平井の極楽寺と雁峰山麓の道は新城市の解説に基づく。
// https://www.city.shinshiro.lg.jp/kanko/taiga/shinshiro/gokurakujiato.html
// 堂・村外れの細かな位置、民の人数・見物・避難路は地形に合わせた補い。
// 後世の新城城下は置かず、柵の南北の里と西の寺に分ける。
const PEOPLE_TEMPLE = { x: CHAUSU.x - 104, z: CHAUSU.z + 70 };
const PEOPLE_VILLAGES = [{ x: -105, z: -585 }, { x: -105, z: 585 }];
// 両川を渡らず、村の家並みの東端から南北へ。寺の者は本陣を避けて西の山すそへ。
const PEOPLE_PATHS = [
  [[-72, -562], [-72, -600], [-90, -650], [-110, -720]],
  [[-72, 562], [-72, 600], [-90, 650], [-110, 720]],
  [[PEOPLE_TEMPLE.x, PEOPLE_TEMPLE.z + 14], [-620, -16], [-650, 0], [-710, 30]],
];
const PEOPLE_BANDS = PEOPLE_PATHS.map((path, i) => ({
  x: path[0][0], z: path[0][1], mode: 'watch',
  kinds: i === 2 ? ['monk', 'monk', 'townsman', 'woman', 'child']
    : ['farmer', 'farmer', 'merchant', 'woman', 'child', 'elder'],
  route: path.slice(1).map(([x, z]) => ({ x, z })),
}));
// 名札は実在の家紋と併用。紋が未収録の隊は所属する家の紋で示す。
const ALLIED_POSTS = [
  ['佐久間信盛', -28, -440, 'oda', 'oda', 'spear'],
  // 11/5 check60：参陣の確かでない仙石秀久に替え、『信長公記』の「家康・滝川陣取りの前に柵」の滝川一益を柵の内の槍の将に
  ['滝川一益', -55, -340, 'oda', 'oda', 'spear'],
  ['野々村正成', -55, -200, 'oda', 'oda', 'gun'],
  ['佐々成政', -55, -70, 'oda', 'shuro', 'gun'],
  ['前田利家', -55, 0, 'oda', 'maeda', 'gun'],
  ['塙直政', -55, 70, 'oda', 'oda', 'gun'],
  ['福富平左衛門', -55, 140, 'oda', 'oda', 'gun'],
  ['榊原康政', -65, 240, 'tokugawa', 'tokugawa', 'spear'],
  ['本多忠勝', -65, 440, 'tokugawa', 'honda', 'spear'],
];
const REAR_POSTS = [
  // 11/5 check60：明智光秀は長篠に出ていない。『信長公記』の新御堂山の織田信忠を北の後ろに
  ['織田信忠', -240, -420, 'oda', 'oda', 'spear'],
  ['羽柴秀吉', -300, -320, 'oda', 'oda', 'spear'],
  ['丹羽長秀', -240, -230, 'oda', 'sujikai', 'spear'],
  ['柴田勝家', -240, -110, 'oda', 'oda', 'spear'],
];
const TAKEDA_POSTS = [
  ['馬場信春', 250, -440, 'takeda', 'takeda', 'spear'],
  ['土屋昌次', 105, -340, 'takeda', 'takeda', 'mixed'],
  ['真田信綱', 110, -240, 'takeda', 'sanada', 'mixed'],
  ['真田昌輝', 140, -170, 'takeda', 'sanada', 'mixed'],
  ['内藤昌豊', 105, -30, 'takeda', '内藤の胴赤', 'mixed'],
  ['原昌胤', 140, 70, 'takeda', 'takeda', 'spear'],
  ['武田逍遥軒信廉', 210, 130, 'takeda', 'takeda', 'mixed'],
  ['小山田信茂', 110, 250, 'takeda', 'takeda', 'spear'],
  ['山県昌景', 45, IEYASU.z, 'akazonae', 'akazonae', 'cavalry'], // 家康と実距離二百五十メートル
];
// 初めにだけ作り、同じ隊の幟では材質を使い回す。
const postMaterials = new Map();
// 天正三年の野戦の補い。写真は構造と木地・青竹の色だけの参考とし、配置は推定。
// 城下や石垣を新設せず、既存の陣幕の外側へ道具を据える。共通の城・砦は変えない。
let shTabaNear, shTabaFar, shShieldNear, shShieldFar;
const shLookoutDetailShapes = [];
function shLookoutDetailGeo(coarse) {
  const key = coarse ? 1 : 0;
  if (shLookoutDetailShapes[key]) return shLookoutDetailShapes[key];
  const parts = [], up = new THREE.Vector3(0, 1, 0);
  const pole = (a, b, radius, color) => {
    const from = new THREE.Vector3(...a), dir = new THREE.Vector3(...b).sub(from), length = dir.length();
    const geo = new THREE.CylinderGeometry(radius * .75, radius, length, coarse ? 4 : 6);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()));
    geo.translate(...from.addScaledVector(dir, length / 2).toArray());
    parts.push(paintGeo(geo, color));
  };
  // 写真の狼煙台は下の横木の間に斜材を渡している。南の梯子面を空け、三面を二段で固める。
  // 信号竿と一つの形へ結合し、三陣で使い回す。遠くでも斜材の輪郭だけは残す。
  for (let face = 0; face < 3; face++) {
    const rot = (face + 1) * Math.PI / 2, c = Math.cos(rot), s = Math.sin(rot);
    const point = (x, y) => [x * c + 1.3 * s, y, -x * s + 1.3 * c];
    for (let level = 0; level < 2; level++) {
      const y0 = .67 + level * 2, y1 = y0 + 2, side = level ? 1 : -1;
      pole(point(side * 1.3, y0), point(-side * 1.3, y1), .065, 0x78694f);
      if (!coarse) for (const [x, y] of [[side * 1.3, y0], [-side * 1.3, y1]]) {
        const tie = new THREE.TorusGeometry(.18, .018, 3, 6);
        tie.rotateX(Math.PI / 2); tie.translate(...point(x, y));
        parts.push(paintGeo(tie, 0xa18d65));
      }
    }
  }
  // 写真の狼煙台の細長い竿。井楼の隅柱へ沿わせ、床や梯子口を塞がない。
  pole([1.3, .1, -1.3], [1.3, 15.2, -1.3], .055, 0x8b8066);
  pole([.95, 14.85, -1.3], [1.65, 14.85, -1.3], .035, 0x6e6049);
  // 竿だけで終わらせず、写真の吊り籠を横木の先へ下げる。遠くでは一つの形にする。
  if (coarse) {
    const basket = new THREE.CylinderGeometry(.21, .15, .42, 5);
    basket.translate(.99, 14.15, -1.3); parts.push(paintGeo(basket, 0x504735));
  }
  if (!coarse) {
    // 上げ下ろしの二筋の縄。火や煙は合図のない間には足さない。
    pole([1.61, 14.84, -1.3], [1.61, 5.4, -1.3], .012, 0xb6a077);
    pole([.99, 14.84, -1.3], [.99, 14.58, -1.3], .012, 0xb6a077);
    pole([.99, 13.94, -1.3], [.99, 5.4, -1.3], .012, 0xb6a077);
    for (const side of [-1, 1])
      pole([.99, 14.58, -1.3], [.99 + side * .21, 14.36, -1.3], .012, 0xb6a077);
    // 空の籠は八本の骨と三つの箍。中を黒い塊で埋めず、空が透けるようにする。
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      pole([.99 + c * .15, 13.94, -1.3 + s * .15],
        [.99 + c * .21, 14.36, -1.3 + s * .21], .017, 0x64543b);
    }
    for (const y of [13.96, 14.16, 14.34]) {
      const r = .15 + (y - 13.94) / .42 * .06;
      const hoop = new THREE.TorusGeometry(r, .014, 3, 8);
      hoop.rotateX(Math.PI / 2); hoop.translate(.99, y, -1.3);
      parts.push(paintGeo(hoop, 0x514733));
    }
    for (const y of [5.2, 7.1, 8.7]) {
      const tie = new THREE.CylinderGeometry(.085, .085, .11, 6, 1, true);
      tie.translate(1.3, y, -1.3); parts.push(paintGeo(tie, 0xb6a077));
    }
    // 竿先の振れを反対側の隅柱へ二本の控え縄で受ける。
    for (const [x, z] of [[-1.3, -1.3], [1.3, 1.3]])
      pole([1.3, 12.5, -1.3], [x, 8.8, z], .013, 0x9c8865);
  }
  const geo = mergeGeometries(parts); parts.forEach((part) => part.dispose());
  shLookoutDetailShapes[key] = geo;
  return geo;
}
// 清洲の写真の裏方小屋を手本にした、板葺きの開いた兵糧小屋。
// 設楽原の恒久建築を示すものではなく、両軍の後方の営みを補う仮設物。
const shSupplyShapes = [];
function shSupplyGeo(coarse) {
  const key = coarse ? 1 : 0;
  if (shSupplyShapes[key]) return shSupplyShapes[key];
  const parts = [], up = new THREE.Vector3(0, 1, 0);
  const box = (x, y, z, w, h, d, color, tilt = 0) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.rotateX(tilt); geo.translate(x, y, z);
    parts.push(paintGeo(geo, color));
  };
  const pole = (a, b, r, color) => {
    const from = new THREE.Vector3(...a), dir = new THREE.Vector3(...b).sub(from);
    const length = dir.length(); dir.normalize();
    const geo = new THREE.CylinderGeometry(r * .85, r, length, coarse ? 4 : 6);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    geo.translate(...from.addScaledVector(dir, length / 2).toArray());
    parts.push(paintGeo(geo, color));
  };
  // 前を広く開け、床や白壁を作らず皮付きの細柱と片流れ屋根で雨を避ける。
  for (const x of [-2.1, 2.1]) for (const z of [-1.25, 1.25])
    pole([x, -.18, z], [x, 2.3 - z * .22, z], .095, 0x63523c);
  for (const z of [-1.25, 1.25])
    pole([-2.35, 2.3 - z * .22, z], [2.35, 2.3 - z * .22, z], .085, 0x8a7653);
  if (coarse) {
    box(0, 2.37, 0, 4.9, .1, 3.25, 0x897655, .217);
    box(0, .8, -1.2, 4.15, 1.6, .07, 0x827050);
    box(-.75, .42, -.35, 1.9, .84, .9, 0xa28d5c);
    box(2.9, .3, -.2, .65, .6, 3.2, 0x736044);
  } else {
    for (let i = 0; i < 18; i++) {
      const x = (i - 8.5) * .272;
      // 板端と色を少しずつ違え、平たい一枚板に見せない。
      box(x, 2.37 + (i % 3) * .009, .025 * Math.sin(i * 2.4),
        .28, .075, 3.2 + .1 * Math.sin(i * 1.7), i % 3 ? 0x93815e : 0x796747, .217);
    }
    for (let i = 0; i < 14; i++)
      box((i - 6.5) * .3, .86, -1.22, .285, 1.72, .065, i % 3 ? 0x8f7b56 : 0x756245);
    // 奥の筋交いと柱の結び。裏桟も見せ、板を宙へ浮かせない。
    for (const y of [.45, 1.55]) box(0, y, -1.15, 4.3, .11, .1, 0x64523a);
    for (const x of [-2.1, 2.1]) {
      pole([x, .35, -1.2], [x, 2.05, 1.2], .055, 0x8c7957);
      for (const z of [-1.25, 1.25]) for (const dy of [-.05, 0, .05]) {
        const tie = new THREE.TorusGeometry(.115, .018, 3, 6);
        tie.rotateX(Math.PI / 2); tie.translate(x, 2.2 - z * .22 + dy, z);
        parts.push(paintGeo(tie, 0xb19b6a));
      }
    }
    // 俵は地べたへ直置きせず、低い枕木の上へ二段に積み、縄を二筋掛ける。
    for (const z of [-.7, .05]) box(-.7, .09, z, 2.7, .18, .17, 0x64513a);
    for (let i = 0; i < 5; i++) {
      const x = -.7 + (i < 3 ? i - 1 : i - 3.5) * .72;
      const y = i < 3 ? .48 : 1.02;
      const bale = new THREE.CylinderGeometry(.33, .33, .95, 8);
      bale.rotateX(Math.PI / 2); bale.translate(x, y, -.35);
      parts.push(paintGeo(bale, i % 2 ? 0xa48d55 : 0xb09a63));
      for (const z of [-.65, -.05]) {
        const tie = new THREE.TorusGeometry(.335, .019, 3, 8);
        tie.translate(x, y, z); parts.push(paintGeo(tie, 0x71603d));
      }
    }
    // 小屋の脇に柵の替え丸太。細い切り口と枕木で、土から離れた積み方を見せる。
    for (const z of [-1.3, .9]) box(2.9, .08, z, 1, .16, .18, 0x5f5039);
    for (let i = 0; i < 5; i++) {
      const x = 2.9 + (i < 3 ? i - 1 : i - 3.5) * .25, y = i < 3 ? .27 : .5;
      pole([x, y, -1.85 + i * .04], [x, y, 1.6 - i * .06], .12, i % 2 ? 0x827054 : 0x6a583e);
      const end = new THREE.CylinderGeometry(.09, .09, .012, 6);
      end.rotateX(Math.PI / 2); end.translate(x, y, 1.605 - i * .06);
      parts.push(paintGeo(end, 0xb19a6e));
    }
  }
  const geo = mergeGeometries(parts); parts.forEach((part) => part.dispose());
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  shSupplyShapes[key] = geo;
  return geo;
}
// 馬防柵の根もと：杭を打って踏み固めた土の盛りと、一列目の前の逆茂木（枝を尖らせ敵へ向けた束）。
// 虎口の前後だけに置き、形と材質は一つずつ。毎コマの仕事は無い。
const SH_FOOT_R = 60;
function shFenceFoot(rt, fence, ground) {
  const near = (z) => SB.gates.some((g) => Math.abs(z - g - 4.5) < SH_FOOT_R);
  const clods = [], abatis = [];
  let frontX = -Infinity;
  for (const f of fence) if (f?.seg) frontX = Math.max(frontX, Math.min(f.seg[0], f.seg[2]));
  for (const f of fence) {
    const sg = f?.seg; if (!sg) continue;
    const [ax, az, bx, bz] = sg, len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) continue;
    const front = f.row != null ? f.row === 0 : Math.min(ax, bx) > frontX - 4;
    for (let d = 0.2; d < len; d += 0.45) {
      const t = d / len, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (!near(z)) continue;
      clods.push([x + 0.05, z, 0.42 + 0.12 * Math.sin(z * 3.1 + x)]);
      if (front && Math.round(d / 0.45) % 4 === 0) abatis.push([x + 1.6 + 0.3 * Math.sin(z * 1.7), z + 0.4 * Math.sin(z * 2.3)]);
    }
  }
  const pose = new THREE.Object3D(), col = new THREE.Color();
  // 土の盛り：低く潰した塊を杭ごとに寄せ、続く畝に見せる。
  // 11/6 fixc0504（八1）：十二面の塊は近くで茶色の角ばった板に見えた。丸い低い盛りにして地に半分埋める
  const clodGeo = new THREE.SphereGeometry(1, 9, 5);
  clodGeo.translate(0, -0.5, 0);
  const soil = new THREE.InstancedMesh(clodGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), clods.length);
  clods.forEach(([x, z, r], i) => {
    pose.position.set(x, ground.heightAt(x, z), z);
    pose.rotation.set(0, Math.sin(z * 2.7) * 0.3, 0);
    pose.scale.set(r * 1.1, r * 0.4, r * 1.7); pose.updateMatrix(); soil.setMatrixAt(i, pose.matrix);
    const k = 0.5 + 0.5 * Math.sin(z * 1.9 + x * 0.7);
    soil.setColorAt(i, col.setRGB(0.20 + k * 0.05, 0.17 + k * 0.04, 0.10 + k * 0.03));
  });
  // 11/6 fixc0504（八1）：丸めても柵の足もとで黄土の平たい板が並んで見えた（1600×900 の写真）。盛り土は地面の絵に任せて置かない
  soil.receiveShadow = true; soil.computeBoundingSphere(); soil.dispose();
  // 逆茂木：伐った枝の幹を地に伏せ、尖らせた枝先を東（敵の側）へ斜めに突き出す。
  const parts = [], up = new THREE.Vector3(0, 1, 0);
  const stick = (a, b, r0, r1, color) => {
    const from = new THREE.Vector3(...a), dir = new THREE.Vector3(...b).sub(from), length = dir.length(); dir.normalize();
    const g = new THREE.CylinderGeometry(r1, r0, length, 5, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    g.translate(...from.addScaledVector(dir, length / 2).toArray());
    parts.push(paintGeo(g, color));
  };
  stick([-0.5, 0.12, -1.1], [0.3, 0.2, 1.1], 0.09, 0.07, 0x5a4632);
  for (const [dz, rise, spread, len] of [[-0.8, 0.9, -0.3, 1.4], [-0.3, 1.1, 0.2, 1.6], [0.2, 0.8, -0.25, 1.5], [0.7, 1.0, 0.35, 1.3], [0.0, 0.55, 0.05, 1.2], [-0.55, 0.6, 0.1, 1.1]]) {
    const bx = -0.2 + dz * 0.35, bz = dz;
    stick([bx, 0.15, bz], [bx + len, 0.15 + rise, bz + spread], 0.045, 0.012, 0x6b553b);
  }
  const abGeo = mergeGeometries(parts); for (const g of parts) g.dispose();
  const branch = new THREE.InstancedMesh(abGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), abatis.length);
  abatis.forEach(([x, z], i) => {
    pose.position.set(x, ground.heightAt(x, z) - 0.05, z);
    pose.rotation.set(0, Math.sin(z * 4.1) * 0.25, 0);
    const k = 0.85 + 0.25 * (0.5 + 0.5 * Math.sin(z * 2.9)); pose.scale.set(k, k, k);
    pose.updateMatrix(); branch.setMatrixAt(i, pose.matrix);
  });
  branch.castShadow = true; branch.receiveShadow = true; branch.computeBoundingSphere(); rt.scene.add(branch);
}

// 持ち場（南の虎口の内）の足もとの夏草：柵の間の野が平らな緑の一枚に見えた（10/28）。
// 細い葉を九枚、中ほどで外へ折れて垂れる株を、柵の列・虎口の道・川筋を避けて群れで置く。形と材質は一つ、開戦時だけ。
function shSummerGrass(rt) {
  // 11/2 c_tree_1102c：幅広の三角を九枚の扇は、明るい緑の切り紙の株に見えた。共通の細い株（中筋で折れ、根元が暗く、風でそよぐ）に替える。
  const W = rt.world, geo = fieldGrassGeo();
  let seed = 51575;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const riverD = (x, z) => { let d = 1e9; for (let i = 1; i < RENGO.length; i++) { const [ax, az] = RENGO[i - 1], [bx, bz] = RENGO[i];
    const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return d; };
  const list = [], o = new THREE.Object3D(), c = new THREE.Color();
  for (let g = 0; g < 70; g++) {
    const gx = -8 + rnd() * 26, gz = SB.gates[0] - 38 + rnd() * 76, n = 4 + Math.floor(rnd() * 8);
    for (let k = 0; k < n; k++) {
      const x = gx + (rnd() - .5) * 4, z = gz + (rnd() - .5) * 4;
      if (Math.abs(z - SB.gates[0]) < 4.5 || riverD(x, z) < 5.5) continue;
      if ([SB.x0, SB.x0 - SB.gap, SB.x0 - 2 * SB.gap].some((fx) => Math.abs(x - fx) < 1.2)) continue;
      const s = .7 + rnd() * .7;
      o.position.set(x, W.heightAt(x, z) - .03, z); o.rotation.set((rnd() - .5) * .2, rnd() * 6.28, (rnd() - .5) * .2); o.scale.set(s, s * (.8 + rnd() * .5), s); o.updateMatrix();
      const tone = rnd();
      list.push([o.matrix.clone(), tone < .25 ? c.setRGB(1, .9, .66).getHex() : c.setRGB(.74 + tone * .16, .86 + tone * .1, .62).getHex()]);   // 株の色に掛ける（夏草のくすんだ緑と、枯れかけの藁色）
    }
  }
  const mesh = new THREE.InstancedMesh(geo, fieldGrassMat(), list.length);
  list.forEach(([m, h], i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.setHex(h)); });
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere(); mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'shSummerGrass';
  rt.scene.add(mesh);
}

function shFieldWorks(rt) {
  const W = rt.world, ground = Object.create(W);
  ground.heightAt = (x, z) => drawGroundAt(W, x, z);
  if (!shTabaNear) {
    // 共通の竹束は乾いた黄竹。この陣の据え置き分だけ青竹と根元の土色を残す。
    // 写真の束は太竹七本の疎らな輪でなく細竹が詰まる。外周十二本・内周六本・芯一本の共有形。
    // 据え置き十二基だけに使い、七十五メートル先は従来の一枚の粗い形へ戻す。
    shTabaNear = tabaGeo(false, false, false, true).clone();
    const colors = shTabaNear.attributes.color, positions = shTabaNear.attributes.position;
    const col = new THREE.Color(), green = new THREE.Color(0x6e8050), mud = new THREE.Color(0x65563d);
    for (let i = 0; i < colors.count; i++) {
      col.fromBufferAttribute(colors, i);
      // 藁縄・横桟・暗い切り口を染めず、竹の緑がかった頂点だけを選ぶ。
      if (col.g > col.r * .89 && col.g > col.b * 1.8) {
        col.lerp(green, .48 + .12 * Math.sin(positions.getX(i) * 31));
        col.lerp(mud, .55 * Math.max(0, 1 - positions.getY(i) / .32));
        colors.setXYZ(i, col.r, col.g, col.b);
      }
      // 直立した壁にせず、控え棒のある裏へ上端を約二十五センチ倒す。接地位置は保つ。
      positions.setZ(i, positions.getZ(i) + Math.max(0, positions.getY(i)) * .14);
    }
    shTabaNear.computeVertexNormals();
    shTabaFar = paintGeo(new THREE.BoxGeometry(1.85, 1.75, .42).translate(0, .875, 0), 0x7b844d);
    const farPositions = shTabaFar.attributes.position;
    for (let i = 0; i < farPositions.count; i++)
      farPositions.setZ(i, farPositions.getZ(i) + farPositions.getY(i) * .14);
    shTabaFar.computeVertexNormals();
  }
  if (!shShieldNear) {
    // 写真の幅広い木地の楯。共通の楯を複製し、この戦だけ黄味のある板へ寄せる。
    // 裾から十六センチに頂点のある板を使い、泥色が板の上端まで伸びるのを防ぐ。
    shShieldNear = hiraTateGeo('field', true).clone().scale(1.4, 1, 1);
    // 傾きを一度戻し、黒帯二本だけを上端近くへ寄せる。板の高さや支え棒は動かさない。
    shShieldNear.rotateX(.12);
    const colors = shShieldNear.attributes.color, positions = shShieldNear.attributes.position;
    const col = new THREE.Color(), fresh = new THREE.Color(0xc7b67b), mud = new THREE.Color(0x726247);
    for (let i = 0; i < colors.count; i++) {
      col.fromBufferAttribute(colors, i);
      if (Math.max(col.r, col.g, col.b) <= .12 && positions.getY(i) > 1.15) {
        positions.setY(i, positions.getY(i) + .15);
      }
      // 黒帯は残し、板の木目と左右の色差は共有の木肌に重ねる。
      if (Math.max(col.r, col.g, col.b) > .12) {
        col.lerp(fresh, positions.getX(i) < 0 ? .56 : .42);
        col.lerp(mud, .65 * Math.max(0, 1 - positions.getY(i) / .28));
        colors.setXYZ(i, col.r, col.g, col.b);
      }
    }
    shShieldNear.rotateX(-.12);
    shShieldFar = paintGeo(new THREE.BoxGeometry(.756, 1.63, .065).translate(0, .815, 0), 0xb7a473);
    shShieldFar.rotateX(-.12);
  }
  const matrix = new THREE.Matrix4();
  const set = (geo, coarse, mat, spots, cx, cz) => {
    const lod = new THREE.LOD(), y = ground.heightAt(cx, cz);
    lod.position.set(cx, y, cz);
    for (const [shape, distance] of [[geo, 0], [coarse, 75]]) {
      const mesh = new THREE.InstancedMesh(shape, mat, spots.length);
      for (let i = 0; i < spots.length; i++) {
        const [dx, dz, rot] = spots[i];
        matrix.makeRotationY(rot); matrix.setPosition(dx, ground.heightAt(cx + dx, cz + dz) - y, dz);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.castShadow = distance === 0; mesh.receiveShadow = true;
      mesh.userData.camBlock = true; lod.addLevel(mesh, distance);
    }
    rt.scene.add(lod);
  };
  // 虎口の両肩に据え置きの竹束を寄せ、柵と土塁がつながる守りを見せる。
  // 開口部と使番道は空け、共通の形・材質と距離切り替えを使う。当たりは増やさない。
  for (const mouth of MOUTHS) {
    const spots = [];
    for (const dz of [-16, 24]) for (let i = 0; i < 2; i++) spots.push([0, dz + i * 1.7, Math.PI / 2]);
    set(shTabaNear, shTabaFar, tabaMat(), spots, SB.x0 - 2 * SB.gap - 3, mouth.z);
    // 本陣だけでなく、戦う口にも置楯と裏の支えを残す。幅九メートルの道は空ける。
    // 竹束と同じ足元へ接地させ、共用の形を一括で描く。守備や通行の当たりは増やさない。
    const shields = [];
    for (const dz of [-7, 16]) for (let i = 0; i < 3; i++)
      shields.push([0.08 * (i % 2), dz + (i - 1) * 0.95, -Math.PI / 2]);
    set(shShieldNear, shShieldFar, WOOD_MAT(), shields, -4.5, mouth.z);
  }
  for (const [cx, cz, mon, team] of [[CHAUSU.x, CHAUSU.z, 'oda', 0],
    [IEYASU.x, IEYASU.z, 'tokugawa', 0], [KATSUYORI.x, KATSUYORI.z, 'takeda', 1]]) {
    // 幕は幅十六・奥行十二。南の出入口、旗本の前、東西の使番道を空ける。
    // 竹束は攻城用の台車を付けず、四束の縦竹と三段の縄、裏の控え棒。
    const bamboo = [], shields = [];
    for (const side of [-1, 1]) {
      for (const dz of [-7, -3]) bamboo.push([side * 13, dz, side * Math.PI / 2 - Math.PI]);
      // 三枚ずつの二組。継ぎ目は少し重ね、組の間に一メートルの通り口を残す。
      // 幕の南口や旗本の前へ広げず、枚数は保つ。未確認の紋は描かない。
      for (let i = 0; i < 6; i++) shields.push([side * (13 + (i % 3) * .035), .4 + i * .72 + (i >= 3 ? 1.04 : 0), side * Math.PI / 2]);
      // 旗竿を千鳥に散らさず、幕の後ろの左右へ同じ家の紋を三本ずつ。
      for (let i = 0; i < 3; i++) rt.scene.add(nobori(ground, cx + side * (4 + i * 2), cz - 10, mon, 5.2));
    }
    set(shTabaNear, shTabaFar, tabaMat(), bamboo, cx, cz);
    set(shShieldNear, shShieldFar, WOOD_MAT(), shields, cx, cz);
    // 三陣に一棟だけ。井楼の南、幕・旗本・使番道から外れた六×四メートルに収める。
    // 共通の形と木の材質で一棟一描画。遠くは板目・縄・俵の細部を省く。
    const supplies = new THREE.LOD(), sx = cx - 29, sz = cz + 18;
    supplies.position.set(sx, ground.heightAt(sx, sz), sz);
    const nearSupplies = new THREE.Mesh(shSupplyGeo(false), WOOD_MAT());
    nearSupplies.receiveShadow = true;
    const farSupplies = new THREE.Mesh(shSupplyGeo(true), WOOD_MAT());
    farSupplies.receiveShadow = true;
    supplies.addLevel(nearSupplies, 0); supplies.addLevel(farSupplies, 75);
    // 設営時だけ坂へ沿わせる。近い形で接地を決め、距離の切り替えで上下させない。
    slopeLitter(supplies, ground, supplies.position.y);
    farSupplies.visible = false;
    contactLitter(supplies, ground, supplies.position.y, -.08);
    rt.scene.add(supplies);
    // 四本の皮付き柱、突き出す横木、縄、板床と狭間楯。遠くは既存の粗い形へ。
    rt.scene.add(yagura(ground, cx - 21, cz - 18,
      { mon, team, height: 7.2, boarded: false, fieldFrame: true, fieldGallery: true,
        // 狭間楯は裏桟へ縄で留める。近景の結合形へ加え、遠景の形と材質は増やさない。
        barkPosts: true, fieldDetail: true, fieldLashings: true }));
    const signal = new THREE.LOD();
    signal.position.set(cx - 21, ground.heightAt(cx - 21, cz - 18), cz - 18);
    for (const coarse of [false, true]) {
      const mesh = new THREE.Mesh(shLookoutDetailGeo(coarse), WOOD_MAT());
      mesh.castShadow = !coarse; mesh.receiveShadow = true;
      signal.addLevel(mesh, coarse ? 85 : 0);
    }
    rt.scene.add(signal);
  }
}
function postFlag(rt, name, x, z, mon) {
  const g = nobori(rt.world, x, z, mon, 6.5), cloth = g.userData.flag;
  let mat = postMaterials.get(name);
  if (!mat) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.drawImage(flagTexture(mon).image, 0, 0, 256, 512);
    ctx.fillStyle = '#ece4d2'; ctx.fillRect(28, 284, 200, 204);
    ctx.fillStyle = '#14120f'; ctx.font = 'bold 26px serif'; ctx.textAlign = 'center';
    const rows = name.length > 6 ? [name.slice(0, 2), name.slice(2, 5), name.slice(5)] : [name.slice(0, 2), name.slice(2)];
    rows.forEach((row, i) => ctx.fillText(row, 128, 335 + i * 48));
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.astcAlpha = true;   // iPhone：元の旗と同じく透ける布の RGBA の ASTC で（印が無いと読み出しを捨てていた。11/9 読み込み）
    mat = cloth.material.clone(); mat.map = tex; mat.needsUpdate = true;
    postMaterials.set(name, mat);
  }
  cloth.material = mat;
  rt.scene.add(g);
  return g;
}
const SH_FRONT = SB.x0 + 2;   // これより東へ出たら「柵の外」
const OVERRUN_LIMIT = 30;     // 知らせを見て、組と奥の柵へ戻れる猶予
// 守備は単なる待機にしない。既存の輪と案内を使い、到着後も槍で守る下知を残す。
// 守る場所は輪で示す。「ここで待つ」の札を重ねず、今の任務で行動を伝える。
const SH_HOLD_GUIDE = { h: 3, guideArea: 'guard', guideRadius: 7, guideAlways: true, alwaysDistance: true, hideNear: 7, hideOnArrival: true };
const SH_CHASE_WAIT = '柵の内で組を揃え、進み太鼓を待て';
// 札と声で同じ間合いを見る。遠い敵や柵越しの敵で行軍を止めない。
function shMeleeThreat(rt, enemy) {
  if (!enemy || Math.abs(enemy.pos.y - rt.player.u.pos.y) > 3
      || rt.army.wallBetween(rt.player.u.pos, -1, enemy.pos)) return false;
  const P = rt.player;
  return Math.hypot(enemy.pos.x - P.u.pos.x, enemy.pos.z - P.u.pos.z)
    <= P.meleeReach(P.weapon === 'sword' ? 'slash' : 'thrust') ||
    enemy.atk?.target === P.u || enemy.swing?.target === P.u && !enemy.swing.done;
}
// 道中でも殿が反撃したら、前進の案内から槍の受け方へ切り替える。
function shChaseCounter(rt) {
  const F = rt.flags;
  if (!F.pursuit || !(F.tsuigeki?.stage < 3) || !(F.chaseSkirmishUntil > rt.t)
      || !F.rear || F.rear.routed || !F.rear.count) return false;
  // 遠くで振り向いただけなら追い続ける。実際に届く敵が来た時だけ槍で受ける。
  const p = rt.player.u.pos;
  for (const u of F.rear.units) {
    if (!u.alive || u.fleeing || u.woundOut || u.rearWound || u.gone || u.noTarget || u.invuln
        || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) >= 12) continue;
    if (shMeleeThreat(rt, u)) return true;
  }
  return false;
}
// 札を増やさず、持ち場に着いた後の受け方を同じ任務欄で伝える。
function shGuardOrder(rt) {
  const u = rt.player.u, enemy = rt.army.nearestEnemy(u, 12);
  if (!enemy) return '仲間と並び、槍で敵を止めよ';
  // 柵越しの敵へ突きを促さず、口を守る下知を残す。
  if (rt.army.wallBetween(u.pos, -1, enemy.pos)) return '柵の内で槍を構え、鉄砲組を守れ';
  // 防御の釦がまだ出ない距離では、押せない操作を求めない。
  if (!rt.def.waitGuardAllowed(rt)) return '仲間と並び、敵へ槍を向けよ';
  // 任務は守る目的を伝える。押し方は既存の操作札に任せ、重ねない。
  const attack = rt.player.weapon === 'sword' ? '斬れ' : '突け';
  if (rt.def.attackOpening(rt, enemy)) return rt.player.guard
    ? `守りを解き、すきを見て${attack}` : `仲間と並び、すきを見て${attack}`;
  if (rt.player.guard) return `仲間と構え、防いだら${attack}`;
  return '仲間と並び、槍を構えて守れ';
}
// 奥の柵へ戻った後は、その場で押し返す下知へ替える。札と声で同じ到着範囲を使う。
function shOverrunOrder(rt) {
  const p = rt.player.u.pos;
  return Math.hypot(p.x + 21, p.z - rt.flags.cur.def.z) < SH_HOLD_GUIDE.guideRadius
    ? '奥の柵で仲間と敵を押し返せ'
    : '奥の柵の印へ戻り、仲間と敵を押し返せ';
}
// 柵の口へ来た敵への下知も、本人の現在地と、いま守る旗へ揃える。
function shGuardCall(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  if (F.overrunShown) return shOverrunOrder(rt) + '！';
  const away = Math.hypot(p.x - F.commandPt.x, p.z - F.commandPt.z) >= SH_HOLD_GUIDE.guideRadius;
  if (F.cur?.withdrew) return away
    ? '槍を敵へ向け、内側の旗へ下がれ！'
    : 'ここで仲間と槍を揃えよ！　内側の柵を守れ！';
  return away ? '敵が口へ来た！　槍の印へ戻り、仲間を助けよ！'
    : '敵が口へ来た！　ここで仲間と槍を構えよ！';
}

// 退く道は兵と同じ柵の口を使う。半秒ごとに調べ、描く時の入れ物は使い回す。
function shRetreatPath(rt, goal) {
  const F = rt.flags, p = rt.player.u.pos;
  const c = F.retreatPathCache || (F.retreatPathCache = {
    at: -1, points: Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0 })), path: []
  });
  if (c.at > rt.t && c.gx === goal.x && c.gz === goal.z && Math.hypot(p.x - c.px, p.z - c.pz) < 1) return c.path;
  c.at = rt.t + .5; c.gx = goal.x; c.gz = goal.z; c.px = p.x; c.pz = p.z;
  c.path.length = 0;
  const a = c.points[0], b = c.points[1], d = c.points[2], end = c.points[3];
  Object.assign(a, p); Object.assign(end, goal); end.y = p.y;
  // 見通せる戻り先は共通の短い矢印で十分。柵を迂回する時だけ曲がり道を描く。
  if (localClear(rt.army, a, end)) return c.path;
  let best = Infinity, gateZ = 0;
  for (const gate of F.fenceRoute?.gates || SB.gates) {
    b.x = p.x; b.z = gate + 4.5; b.y = p.y;
    d.x = goal.x; d.z = b.z; d.y = p.y;
    const length = Math.abs(p.z - b.z) + Math.abs(p.x - goal.x) + Math.abs(goal.z - b.z);
    if (length >= best || !localClear(rt.army, a, b) || !localClear(rt.army, b, d) || !localClear(rt.army, d, end)) continue;
    best = length; gateZ = b.z;
  }
  if (best < Infinity) {
    b.x = p.x; b.z = gateZ; d.x = goal.x; d.z = gateZ;
    c.path.push(a, b, d, end);
  }
  return c.path;
}
// 一隊を退けた声で柵の外へ誘わない。追撃の下知が出た後は元の声を通す。
function shGuardVoice(rt, text) {
  // 柵外へ追う下知の後は、守備用の掛け声で柵へ戻さない。
  if (rt.flags.pursuit && text.includes('馬防柵の内から、狙いを定めよ')) {
    return rt.flags.nf?.step >= 5 ? '退き口で仲間と並び、馬場隊へ槍を向けよ' : '柳田前の虎口を出て、組と連吾川を渡れ';
  }
  if (!rt.flags.pursuit && /敵は総崩れじゃ|敵が背を見せた！|敵が崩れた！|敵が槍を捨てた！|敵が下がった！.*押せ|敵が退いて列を組み直す|敵が息を継いでおる|敵の列が乱れておる/.test(text)) {
    // 配置替えや後退の途中に、足を止める古い下知を重ねない。
    const F = rt.flags;
    // 現在の六つの任務を優先する。旧進行の待機・帰陣の声で、物見の誘いや配置替えを止めない。
    if (F.nf) return NF_TEXT[shitaragahara.missionOf(rt)];
    // 守りを終えた後は、札と同じ攻め方の判断か進み太鼓へ案内する。
    if (F.chaseOrdered) return F.dp?.on && F.dp.cur?.s.kind === 'pick'
      ? '馬場隊を正面から攻めるか、横へ回るか選べ' : SH_CHASE_WAIT;
    if (F.overrunShown) return shGuardCall(rt);
    if (F.pendingWave) {
      const p = rt.player.u.pos, pt = F.commandPt;
      const here = Math.hypot(p.x - pt.x, p.z - pt.z) < SH_HOLD_GUIDE.guideRadius;
      // 配置替えの札と同じ範囲で、着いた兵には守る下知を出す。
      return here ? F.postGunsReady
        ? 'ここで仲間と槍を揃え、寄せを受けよ！'
        : 'ここで槍を構え、移る鉄砲組を守れ！'
        : '柵の奥の道を通れ。槍の印へ進め！';
    }
    if (F.cur?.withdrew && !F.cur.doneWave) return shGuardCall(rt);
    // 一隊が退いても、残る徒歩や騎馬との槍の勝負は続いている。
    if (F.cur && !F.cur.doneWave && !waveDefeated(F.cur)) return '敵の一隊が下がった。柵を出ず、仲間と槍で受けよ！';
    return shitaragahara.missionOf(rt) <= 1
      ? '槍の印へ戻れ。柵は出るな！' : '寄せ手が退く。柵の内で次の下知を待て';
  }
  return text;
}

// 地面の色を作る時だけ使う不揃いな斑。平行な周期の積で丘を縞にしない。
function shSoilPatch(x, z) {
  const px = x / 37, pz = z / 43, ix = Math.floor(px), iz = Math.floor(pz);
  const tx = px - ix, tz = pz - iz;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const a = shSoilSeed(ix, iz), b = shSoilSeed(ix + 1, iz);
  const c = shSoilSeed(ix, iz + 1), d = shSoilSeed(ix + 1, iz + 1);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}
function shSoilSeed(x, z) {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ 57;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

// ---- 稲生の水準（reports/inou-standard.md 10/25）：任務の一行・ピン一本・敵は▼・大将は印 ----
const shFoeOK = (u, me) => !!u?.alive && u.hp > 0 && !u.gone && !u.dying && !u.downed && !u.fleeing && !u.woundOut &&
  !u.rearWound && !u.noTarget && !u.isStruct && !u.civ && !u.invuln && u.team !== me.team && u.group && !u.group.routed && u.type !== 'dummy';
// 守りの目標は持ち場へ来た敵だけ。柵の向こうや別の口の兵へ誘い出さない。
function shPostFoe(rt, u, post) {
  const p = rt.player.u.pos;
  return !!post && u.pos.x <= SB.x0 + 14 && u.pos.x >= -80 &&
    Math.hypot(p.x - post.x, p.z - post.z) <= 10 &&
    Math.hypot(u.pos.x - post.x, u.pos.z - post.z) <= 14 &&
    Math.hypot(u.pos.x - p.x, u.pos.z - p.z) <= 12 &&
    !rt.army.wallBetween(p, -1, u.pos);
}
// 一番近い残りの敵（柵の守りでは柵のそば、追撃では殿の兵だけ）。半秒ごとに選び直し、毎コマ全員を見ない。
function shNearestFoe(rt) {
  const F = rt.flags, me = rt.player.u;
  if (F.pursuit && !(F.tsuigeki?.stage >= 2)) return null;
  const post = F.pursuit ? null : shPostPoint(rt);
  if (rt.t < (F.shFoeAt || 0) && (F.shFoe === null || shFoeOK(F.shFoe, me) &&
      (F.pursuit || shPostFoe(rt, F.shFoe, post)))) return F.shFoe;
  F.shFoeAt = rt.t + .5;
  let best = null, bd = Infinity;
  const list = F.pursuit ? F.rear?.units || [] : rt.army.units;
  for (const u of list) {
    if (!shFoeOK(u, me)) continue;
    if (!F.pursuit && !shPostFoe(rt, u, post)) continue;
    const d = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2;
    if (d < bd) { bd = d; best = u; }
  }
  F.shFoe = best;
  return best;
}
// 名のある敵将：守りでは寄せの大将（柵へ寄った時だけ）、追撃では馬場信春。
function shCommander(rt) {
  const F = rt.flags, me = rt.player.u;
  if (F.ending || rt.over || F.chaseOrdered && !F.pursuit) return null;
  if (F.pursuit) {
    if (F.tsuigeki?.stage !== 3) return null;
    const u = F.rear?.units.find((x) => x.name === '馬場信春');
    return shFoeOK(u, me) ? u : null;
  }
  const g = F.cur;
  if (!g || g.doneWave) return null;
  const post = shPostPoint(rt);
  for (const u of g.units) {
    if (u.type === 'busho' && shFoeOK(u, me) && shPostFoe(rt, u, post)) return u;
  }
  return null;
}
// 守る持ち場（ピンと味方の集まる所）。今の案内の印の位置。
function shPostPoint(rt) {
  const id = shitaragahara.guideMarker(rt);
  const m = id && rt.markers.find((x) => x.id === id);
  const pt = m && (typeof m.pos === 'function' ? m.pos() : m.pos);
  return pt || rt.flags.commandPt || rt.flags.prepPt;
}
// 11/3 b100 ①：今の持ち場の口の名と、そこへ寄せる武田の隊（目標の一行を「どこで・何を」にする）
function shMouthNow(rt) {
  const F = rt.flags, z = (F.commandPt || F.prepPt || { z: SB.gates[0] }).z;
  const k = MOUTHS.reduce((b, m, i) => (Math.abs(m.z - z) < Math.abs(MOUTHS[b].z - z) ? i : b), 0);
  return { mouth: MOUTHS[k].name, foe: k === 1 ? '内藤隊' : k === 2 ? '山県隊' : '真田隊' };
}

// ── 11/6 fixc1721：戦の流れを一本にする（kaito 九1・九2・十1・二2・二6・三2）──
// 夜明け、鳶ヶ巣山の知らせ → 大宮前の柵へ真田隊が寄せ、柵の内の鉄砲と槍で止める → 柵の奥の道を組と歩いて柳田前へ →
// 内藤隊が寄せて崩れる（未の刻へ日が移る）→ 進み太鼓で柳田前の虎口を出て連吾川を渡る → 退き口で馬場信春の殿を討ち破る。
// 目標は右上に①〜④を最初から並べ、果たすまで勝ちにしない。時が切れても勝ちにしない。寄せ手は柵の外で押し合い、柵の内へ入らない。
const NF_TEXT = ['大宮前の柵の外で武田の物見を誘い、柵へ引く', '大宮前の柵で真田隊を止める', '大宮前と柳田前の間の破れ目で山県昌景の赤備えを討つ', '柳田前の柵へ移り、原・内藤隊を止め、破れ目の土屋隊を討つ', '柳田前の虎口を出て、連吾川を渡る', '退き口で馬場信春の殿を討ち破る'];
// 段の道具（shitaragahara/*.js へ渡す）
const stCtx = (rt) => ({ SB, MOUTHS, nfGuns, black: shBlackArmy, ready: nfReady, guns: () => rt.flags.guns, reserve: () => rt.flags.reserve, text: (i) => NF_TEXT[i] });
const NF_NORTH = { x: SB.x0 - SB.gap - 3, z: SB.gates[0] + 4.5 };
const NF_CENTER = { x: SB.x0 - SB.gap - 3, z: SB.gates[1] + 4.5 };
const NF_BANK = { x: 46, z: SB.gates[1] + 4.5 };
const NF_REAR = { x: 112, z: -96 };   // 退き口：柳田前の北東の段丘。勝頼の退く出沢・寒狭川の方へ向く（縮めた遊び用の位置）
const nfReady = (g) => (g ? readyCount(g) : 0);
// 殿の戦える兵。移動中や坂の下の兵も数え、退き口から離れただけで全滅にしない。
function nfRearReady(rt) { return nfReady(rt.flags.rear); }
// 寄せの一隊（徒歩・騎馬・射手）を段丘の縁から柵の外まで歩かせる。柵の外で槍と押し合い、虎口でだけ斬り合う。
function shBlackArmy(make) {
  const keep = { takeda: FACTION.takeda, sanada: FACTION.sanada };
  FACTION.takeda = { ...FACTION.tokugawa, flag: 'takeda' }; FACTION.sanada = { ...FACTION.tokugawa, flag: 'sanada' };
  try { return make(); } finally { FACTION.takeda = keep.takeda; FACTION.sanada = keep.sanada; }
}
function nfSend(rt, g, gateZ) {
  const gz = gateZ + 4.5;
  for (const q of [g, g.cavalry, g.missiles]) q.shWaiting = false;
  g.noRout = true; g.morale = 100; g.focus = null;
  g.order = 'path'; g.pathIdx = 0; g.formation = 'line'; g.roadColumn = false; g.speed = 4;
  g.path = [[SB.x0 + 5, gz]]; g.dest = null;
  g.onArrive = (q) => { q.order = 'hold'; q.anchor.x = SB.x0 + 4; q.anchor.z = gz; q.facing = -Math.PI / 2; q.aggro = 18; q.formation = 'line'; };
  const cav = g.cavalry;
  cav.noRout = true; cav.order = 'path'; cav.pathIdx = 0; cav.formation = 'column'; cav.colW = 2; cav.speed = 4;
  cav.path = [[78, gz + 10], [SB.x0 + 9, gz + 8]]; cav.dest = null;
  cav.onArrive = (q) => { q.order = 'hold'; q.anchor.x = SB.x0 + 8; q.anchor.z = gz + 6; q.aggro = 18; };
  const m = g.missiles;
  m.holdFire = false; m.order = 'move'; m.dest = { x: SB.x0 + 30, z: gz - 12 };
  m.onArrive = (q) => { q.order = 'hold'; q.facing = -Math.PI / 2; q.holdFire = false; q.fire = true; };
  g.nfAt = rt.t; g.nfN0 = nfReady(g) + nfReady(cav);
}
// 寄せの崩れ：残りが四割以下か、柵に取り付いて四十秒。将は柵の内の鉄砲に倒れる（史実の討死）。
function nfBroken(rt, g) {
  if (g.nfAt == null) return false;
  const n = nfReady(g) + nfReady(g.cavalry);
  // 後列が坂や柵で遅れても、先頭が虎口へ着けば受け合いの刻を数える。
  const gz = g.def.z + 4.5;
  if (g.nfArrive == null) for (let i = 0; i < 2 && g.nfArrive == null; i++) {
    const q = i ? g.cavalry : g;
    for (const u of q.units) if (
      u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.rearWound && !u.noTarget &&
      Math.hypot(u.pos.x - (SB.x0 + 5), u.pos.z - gz) < 14) { g.nfArrive = rt.t; break; }
  }
  const at = g.nfArrive;
  return n <= Math.ceil(g.nfN0 * 0.4) || at != null && rt.t - Math.max(at, g.nfAt) > 40;
}
function nfRout(rt, g, dead) {
  for (const q of [g, g.cavalry, g.missiles]) {
    q.noRout = false; q.morale = 0; q.routed = true; q.order = 'retreat'; q.dest = { x: 520, z: q.center().z }; q.fleeDir = { x: 1, z: 0 };
    for (const u of q.units) if (u.alive) {
      if (dead && u.type === 'busho' && !u.invuln) rt.army.kill(u, null);
      else u.fleeing = true;
    }
  }
  const h = rt.flags.jinkeiBound[g.def?.hq];
  if (h) h.retreat(180, 60);
  for (const fc of rt.flags.far) if (g.def && Math.abs(fc.z - g.def.z) < 50 && fc.v !== 2) { fc.v = 2; fc.m.retreat(180, 60); }
}
// 柵の守り手：鉄砲は構えたら撃つ（九4）。弾は尽きない（信長公記の千挺ばかり・玉薬の俵）。
function nfGuns(rt, z) {
  for (const q of rt.flags.guns) {
    // 番の斉射が始まった後は、口ごとの射撃・装填を鉄砲壁に任せる。
    // 別の口への寄せで、交戦中の組を止めたり全組を同時に撃たせたりしない。
    q._fieldWait = false; q.order = 'hold'; q.focus = null;
    if (rt.flags.shWall?.on) continue;
    const south = rt.flags.south;
    const on = Math.abs(q.anchor.z - z) < 40 ||
      !!south?.nfAt && !south.routed && Math.abs(q.anchor.z - MOUTHS[2].z) < 40;
    q.fire = on; q.holdFire = !on;
  }
}
function nfTick(rt, dt) {
  const F = rt.flags, N = F.nf, P = rt.player.u, p = P.pos;
  if (!N || F.ending) return;
  const mi = shitaragahara.missionOf(rt);
  if (N.objI !== mi) { N.objI = mi; rt.obj('pursue', NF_TEXT[mi], 'main', true); }
  const T = rt.t - N.at;
  // 原の寄せの間に守った柳田前も記録する。土屋へ走った後に同じ持ち場へ戻らせない。
  if ((N.step === 2 && N.breachDone || N.step === 3) &&
      Math.hypot(p.x - NF_CENTER.x, p.z - NF_CENTER.z) < 30) N.defendedCenter = true;
  // 導入の段（柵の見回り・物見の誘い出し）が済むまで夜明けの寄せを待つ
  if (N.step === 0 && ST_INTRO.tick(rt, dt)) return;
  if (N.step === 0 && !N.t0) { N.t0 = rt.t; N.at = rt.t; ST_WALL.start(rt); }
  // ― 0：夜明け。鳶ヶ巣山の知らせ（未明に落ちた砦の煙）と、南の山県の寄せ ―
  if (N.step === 0) {
    if (!N.tobi && rt.t > N.t0 + 2) {
      N.tobi = true;
      // 夜明けの落城を先に知らせ、背後を断たれた武田の寄せへ続ける。
      rt.say('使番', '鳶ヶ巣山の砦、陥落！　酒井殿の別手が長篠の囲みを解きました！', 4);
      F.tobiSmoke = [[880, 620], [930, 660], [850, 700]].map(([x, z], i) =>
        rt.world.addSmokeColumn?.(x, rt.world.heightAt(x, z) + 8, z, { size: 4 - i * 0.6, black: true }));
      for (const g of rt.army.groups) if (g.team === 1 && !g.routed) g.morale = Math.max(0, (g.morale ?? 100) - 12);
    }
    if (!N.south && rt.t > N.t0 + 2) { N.south = true; nfSend(rt, F.south, SB.gates[2]); F.jinkeiBound.shitara_yamagata?.advance(25, 12);
      for (const fc of F.far) if (!fc.v && Math.abs(fc.z - MOUTHS[2].z) < 50) { fc.v = 1; fc.m.advance(80, 16, { charge: true }); } sfx('taiko', 1); }
    // 第一波：試しの寄せ（shitaragahara/tameshi.js）。崩れてから真田の本隊を寄せる
    if (rt.t > N.t0 + 3 && ST_TAME.tick(rt, dt, stCtx(rt))) return;
    // 近くの真田隊を五秒以上立たせず、夜明けの知らせ・南の寄せに続いて動かす。
    if (rt.t > N.t0 + 3) {
      N.step = 1; N.at = rt.t;
      const g = F.waveGroups[0];
      nfSend(rt, g, SB.gates[0]); nfGuns(rt, MOUTHS[0].z);
      // 川向こうの本備も同じ下知で寄せる。柵の外に留まり、崩れでは同じ兵が退く。
      F.mainHost?.advance?.(24, 16, { charge: true });
      F.jinkeiBound.shitara_sanada?.advance(40, 18); F.jinkeiBound.shitara_sanada_masateru?.advance(40, 18);
      for (const fc of F.far) if (!fc.v && Math.abs(fc.z - MOUTHS[0].z) < 50) { fc.v = 1; fc.m.advance(70, 16, { charge: true }); }
      sfx('taiko', 1);
      rt.say('組頭', '真田の旗が段丘を下りて来る！　柵の内で槍を揃えよ。鉄砲衆、引き付けて放て！', 4);
    }
    return;
  }
  // 南の山県は徳川の柵で崩れる（知らせと遠くの働き）
  if (N.south && !N.southDone && nfBroken(rt, F.south)) {
    N.southDone = true; nfRout(rt, F.south, true);
    shReport(rt, '竹広の赤備えの別手が崩れた！　徳川殿の柵は破れておらぬ！', 3.5);
  }
  // ― 1：大宮前の柵で真田隊 ―
  if (N.step === 1) {
    const g = F.waveGroups[0];
    if (Math.hypot(p.x - NF_NORTH.x, p.z - NF_NORTH.z) < 30) N.defendedNorth = true;
    if (!N.near && g.center().x < SB.x0 + 40) { N.near = true; sfx('hooves', 0.8); sfx('toki', 0.7); rt.say(g.units.find((u) => u.type === 'busho' && u.alive)?.name || '真田信綱', '真田の槍、ここを通すぞ！', 3); }
    if (N.defendedNorth && nfBroken(rt, g)) {
      nfRout(rt, g, true);
      N.done[0] = true; N.step = 2; N.at = rt.t; N.near = false;
      rt.say('組頭', '真田信綱・昌輝、討死！　大宮前は守れた！', 3);
      rt.banner('真田信綱・昌輝、討死', '大宮前の柵を守った');
      // 戦況の変わり目：口の無い所の柵へ土屋昌次が取り付く（shitaragahara/breach.js）
      ST_BREACH.start(rt, stCtx(rt));
      // 第三波の始まり：同じ時に柳田前へ原昌胤も寄せる（二つの区画を走る）
      ST_HARA.send(rt, stCtx(rt)); N.sent = true; F.jinkeiBound.shitara_hara?.advance(50, 22);
      try { rt.world.setTime('day'); } catch (e) { /* 光が替えられなくても進む */ }
      F.jinkeiBound.shitara_sanada?.retreat(60, 20); F.jinkeiBound.shitara_sanada_masateru?.retreat(60, 20);
      // 組は本人に付いて柵の間の道を歩く（一5）。滝川の備の槍組も同じ道で柳田前へ
      for (const q of rt.squadGroups || []) { q.order = 'follow'; q.focus = null; q.path = null; q.dest = null; q.formation = 'column'; q.colW = 2; }
    }
    return;
  }
  // ― 2：柵の奥の道を歩いて柳田前へ。内藤隊は段丘の縁から寄せ始める ―
  if (N.step === 2) {
    if (ST_BREACH.active(rt)) { ST_BREACH.tick(rt, dt); if (ST_BREACH.active(rt)) return; }
    if (!N.breachDone) {
      N.breachDone = true; N.at = rt.t;
      for (const q of rt.squadGroups || []) { q.order = 'follow'; q.focus = null; q.path = null; q.dest = null; q.formation = 'column'; q.colW = 2; }
      F.spears[0].formation = 'column'; F.spears[0].colW = 1; postRoad(rt, F.spears[0], NF_CENTER);
      return;
    }
    ST_HARA.march(rt, dt, stCtx(rt));
    const d = Math.hypot(p.x - NF_CENTER.x, p.z - NF_CENTER.z);
    if (!N.sent && (d < 130 || T > 45)) {
      N.sent = true;
      // 柳田前へはまず原昌胤の隊が寄せる（shitaragahara/hara.js）。内藤は原が崩れてから
      ST_HARA.send(rt, stCtx(rt));
      F.jinkeiBound.shitara_hara?.advance(50, 22);
      for (const fc of F.far) if (!fc.v && Math.abs(fc.z - MOUTHS[1].z) < 50) { fc.v = 1; fc.m.advance(70, 16, { charge: true }); }
    }
    if (N.sent && (d < 9 || T > 75)) {
      N.step = 3; N.at = rt.t;
      rt.say('組頭', '原昌胤の隊じゃ！　柵の口を槍で守れ。鉄砲の前へ出るな！', 3.5);
    }
    return;
  }
  // ― 3 の前半：原昌胤の寄せ。崩れたら内藤を寄せる ―
  if (N.step === 3 && ST_HARA.active(rt)) {
    const sendNaito = () => {
      nfSend(rt, F.waveGroups[1], SB.gates[1]); nfGuns(rt, MOUTHS[1].z);
      F.jinkeiBound.shitara_naito?.advance(52, 24);
      sfx('taiko', 1); N.at = rt.t; N.naitoSent = true;
      ST_SOKO.start(rt, { ...stCtx(rt), BZ: ST_BREACH.BZ });   // 第四波：内藤と同時に土屋が破れ目へ（shitaragahara/sokogeki.js）
    };
    ST_HARA.tick(rt, dt);
    if (!ST_HARA.active(rt) && !N.naitoSent) sendNaito();
    return;
  }
  // ― 3：柳田前の柵で内藤隊。崩れたら武田の全軍が退く ―
  if (N.step === 3) {
    const g = F.waveGroups[1];
    if (Math.hypot(p.x - NF_CENTER.x, p.z - NF_CENTER.z) < 30) N.defendedCenter = true;
    if (!N.near && g.center().x < SB.x0 + 40) { N.near = true; sfx('hooves', 0.8); rt.say('内藤昌豊', '柵の口を押せ！　武田の意地を見せよ！', 3); }
    ST_SOKO.tick(rt, dt);
    if (N.defendedCenter && T > 25 && !ST_SOKO.active(rt) && nfBroken(rt, g)) {
      nfRout(rt, g, true);
      N.done[1] = true; N.step = 4; N.at = rt.t;
      nfCollapse(rt);
    }
    return;
  }
  // 11/6 fixc0504（一5・九4）：追い討ちの組・槍組は本人の脇を同じ速さで進む（本人一人が先に殿へ当たらない）。
  //   離れた隊だけ本人の脇へ行き先を出し直し、殿の近くでは隊ごと槍を向ける
  if (N.step >= 4 && F.chaseOut && (N.escT = (N.escT || 0) - dt) <= 0) {
    N.escT = 0.5;
    const nearRear = N.step === 5 && Math.hypot(p.x - NF_REAR.x, p.z - NF_REAR.z) < 45;
    F.chaseOut.forEach((q, i) => {
      if (!nfReady(q)) return;
      if (q.isPlayerSquad) { if (q.order !== 'follow' && !nearRear) q.order = 'follow'; return; }
      const c = q.center(), d = Math.hypot(c.x - p.x, c.z - p.z);
      // 虎口を抜けるまでは、柵の内の道順を保つ。本人へ直進すると柵に詰まる。
      if (c.x <= SB.x0 + 4 || q.order === 'path' && q.units.some((u) =>
          u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.gone && !u.noTarget && u.pos.x <= SB.x0 + 4)) return;
      if (nearRear && d < 30) {
        // 探す範囲だけ広げても、各兵の交戦範囲の外では元の持ち場で止まる。
        // 殿の生きた兵を指定し、坂で見通せない間もそこへ歩いて寄せる。
        let foe = null, dist = Infinity;
        for (const u of F.rear.units) {
          if (!shFoeOK(u, P)) continue;
          const r = Math.hypot(u.pos.x - c.x, u.pos.z - c.z);
          if (r < dist) { dist = r; foe = u; }
        }
        q.order = 'attack'; q.focus = foe; q.path = null; q.dest = null; q.onArrive = null;
        q.formation = q.kind === 'gun' ? 'line' : 'yari'; q.roadColumn = false;
        q.seekRange = 60; q.aggro = 14; q.fire = true; q.holdFire = false;
        return;
      }
      if (d > 12 && p.x > SB.x0 + 2) {
        // 本人の左右へ並ぶ（後ろに付けると、前を向く画面に味方が一人も映らなかった）
        const goal = N.step === 5 ? NF_REAR : NF_BANK, gl = Math.hypot(goal.x - p.x, goal.z - p.z) || 1, fx = (goal.x - p.x) / gl, fz = (goal.z - p.z) / gl;
        const s = i % 2 ? 1 : -1, side = s * (5 + (i >> 1) * 3), ahead = 2 - (i >> 1) * 2;
        const tx = p.x + fx * ahead - fz * side, tz = p.z + fz * ahead + fx * side;
        if (q.order !== 'move' || !q.dest || Math.hypot(q.dest.x - tx, q.dest.z - tz) > 8) { q.order = 'move'; q.path = null; q.dest = { x: tx, z: tz }; q.onArrive = null; }
        q.speed = d > 24 ? 5.6 : 5;
      }
    });
  }
  // ― 4：進み太鼓。柳田前の虎口を出て、連吾川を渡る ―
  if (N.step === 4) {
    // 先に東岸へ出ていただけでは果たさない。柳田前の柵から渡り始める。
    if (p.x < SB.x0 && Math.hypot(p.x - NF_CENTER.x, p.z - NF_CENTER.z) < 9) N.crossWest = true;
    if (N.crossWest && Math.abs(p.z - NF_BANK.z) < 12 && p.x > rengoX(p.z) + 9) {
      N.done[2] = true; N.step = 5; N.at = rt.t;
      nfBaba(rt);
    }
    return;
  }
  // ― 5：退き口の馬場の殿 ―
  if (N.step === 5) {
    const R = F.rear, baba = R.units.find((u) => u.name === '馬場信春');
    if (baba && !baba.alive && !N.babaDead) {
      N.babaDead = true; R.noRout = false; R.morale = 10;
      rt.banner('馬場信春、討死', '退き口の殿が崩れた');
    }
    if (baba?.alive) baba.invuln = false;
    // 11/6 fixc0504（三2・遊びの長さ）：殿は段丘の坂の下（退き口から四十メートルほど）で組と槍を合わせる。
    //   退き口から三十四メートル内しか数えず、坂の下の斬り合いが四分続いて八分半の戦になった
    let fighting = false;
    for (const u of R.units) {
      const target = u.atk?.target || u.swing?.target || u.target;
      if (u.alive && target?.alive && target.team !== u.team &&
          Math.hypot(u.pos.x - target.pos.x, u.pos.z - target.pos.z) < 8 &&
          !rt.army.wallBetween(u.pos, -1, target.pos)) { fighting = true; break; }
    }
    if (fighting && Math.hypot(p.x - NF_REAR.x, p.z - NF_REAR.z) < 60) N.babaFight = (N.babaFight || 0) + dt;
    if (!N.babaDead && baba?.alive && (nfRearReady(rt) <= Math.ceil(N.babaN0 * 0.6) || N.babaFight > 60)) rt.army.kill(baba, null);
    if (R.order !== 'hold' || R.anchor.x !== NF_REAR.x) { R.order = 'hold'; R.path = null; R.dest = null; R.anchor.x = NF_REAR.x; R.anchor.z = NF_REAR.z; R.focus = null; }
    // 味方だけが殿を討っても、本人が退き口へ来るまでは最後の目標を果たさない。
    // 馬場本人が生きている間は、残兵が二人でも討死と勝利を先取りしない。
    const rearBroken = baba ? !baba.alive : nfRearReady(rt) <= 2;
    if (rearBroken && N.t0 && N.breachDone && N.done[0] && N.done[1] && N.done[2] && Math.hypot(p.x - NF_REAR.x, p.z - NF_REAR.z) < 60 && !N.done[3]) {
      N.done[3] = true; N.step = 6;
      nfEnd(rt);
    }
  }
}
// 内藤が崩れ、武田の全軍が退く（未の刻）。勝頼は討てず、馬場が殿に残る。
function nfCollapse(rt) {
  const F = rt.flags;
  // 柵の定位置からの斉射を終え、追撃する鉄砲組の射撃を妨げない。
  ST_WALL.stop(rt);
  F.nf.crossWest = false;
  rt.setPhase('pursuit');
  F.pursuit = rt.t;
  try { rt.world.setTime('afternoon'); } catch (e) { /* 光が替えられなくても進む */ }
  rt.army.playFar('sig_nobiki', KATSUYORI, 1);
  rt.say('使番', '内藤昌豊、討死！　武田の備が崩れて退くぞ！', 3.5);
  rt.after(3.8, () => { if (!F.ending) rt.say('使番', '武田勝頼、退きます！　馬場美濃守が殿に残りました！', 3.6); });
  F.katsuyori.retreat(240, 60);
  F.mainHost?.retreat?.(260, 55);
  F.katsCamp.general.invuln = true; F.katsCamp.general._crouch = false;
  for (const q of [F.katsCamp.guard, F.katsCamp.general.group]) {
    q.guard = false; q.stay = false; q.noRout = true; q.retreatOnly = true;
    q.order = 'path'; q.formation = 'column'; q.colW = 2; q.pathIdx = 0;
    q.path = [[520, -100], [ESCAPE.x, ESCAPE.z]]; q.dest = null; q.onArrive = (g) => { g.order = 'hold'; };
  }
  const baba = F.jinkeiBound.shitara_baba;
  F.hill.forEach((h, i) => { if (h !== baba && !h.army.rout) rt.after(i * 1.2, () => h.retreat(200, 50)); });
  for (const fc of F.far) if (fc.v !== 2) { fc.v = 2; fc.m.retreat(200, 55); }
  for (const a of rt.world.armies || []) if (a.team === 1) a.noWake = true;
  // 馬場の殿は退き口の段丘で槍を揃える（初めから北東の段丘に控えていた同じ隊が歩いて出る）
  const R = F.rear;
  R.order = 'move'; R.dest = NF_REAR; R.formation = 'yari'; R.speed = 3.4;
  R.onArrive = (q) => { q.order = 'hold'; q.anchor.x = NF_REAR.x; q.anchor.z = NF_REAR.z; q.facing = -Math.PI / 2 - 0.4; q.aggro = 6; };
  rt.after(3, () => {
    if (F.ending || !rt.player.u.alive) return;
    sfx('sig_susume', 1);
    rt.after(1.2, () => { if (!F.ending) sfx('toki', 0.7); });
    rt.banner('進み太鼓', '柳田前の虎口を出て、連吾川を渡れ');
    rt.say('組頭', '進み太鼓じゃ！　組と虎口を出て、連吾川を渡れ！', 3.5);
    // 柵の守り手も組も、同じ虎口を通って東へ出る（自分一人で追わない・一5）
    const gz = SB.gates[1] + 4.5;
    // 柵の内に控えていた前田・佐々の備の槍組（本物）が、組と同じ虎口から追う。柵の奥から歩いて出る（湧かせて見せない所から）
    F.chasers = [-10, 10].map((dz, i) => allyGroup(rt, { faction: 'oda', name: i ? '佐々の槍組' : '前田の槍組', fixed: true, fullStrength: true, noGuard: true, anchor: { x: -26, z: gz + dz }, facing: Math.PI / 2, width: 10, aggro: 10, formation: 'column' },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }]));
    const out = [...F.chasers, ...F.spears, ...F.guns.filter((q) => q.anchor.z < 200), ...(rt.squadGroups || [])].filter((q, i, a) => q && a.indexOf(q) === i && nfReady(q));
    F.chaseOut = out;
    out.forEach((q, i) => {
      q.noRout = true; q.focus = null; q.roadColumn = true; q.formation = 'column'; q.colW = 2; q.speed = Math.max(q.speed || 3, 3.6);
      if (q.isPlayerSquad) { q.order = 'follow'; return; }
      // 大宮前の隊を柳田前へ斜めに引くと、三の柵で止まる。最寄りの虎口から奥の道へ回す。
      postRoad(rt, q, { x: SB.x0 + 6, z: gz });
      const approach = q.path || [[SB.x0 + 6, gz]];
      q.order = 'path'; q.pathIdx = 0; q.dest = null;
      // 隊の数で待機地点を遠ざけない。全隊が殿を探す範囲まで進んでから槍を向ける。
      q.path = [...approach, [NF_BANK.x, gz + (i % 2 ? 6 : -6)], [NF_REAR.x - 18 - (i % 2) * 4, NF_REAR.z - 12 + (i % 5) * 6]];
      q.onArrive = (g) => { g.order = 'attack'; g.formation = g.kind === 'gun' ? 'line' : 'yari'; g.roadColumn = false; g.seekRange = 60; g.aggro = 14; g.fire = true; g.holdFire = false; };
    });
  });
}
function nfBaba(rt) {
  const F = rt.flags, R = F.rear;
  for (const u of R.units) { u.invuln = false; u.noTarget = false; if (u.type !== 'busho') u.hp = Math.min(u.hp, u.maxHp * 0.55); }
  R.defMult = 0.7;
  R.noRout = true; R.aggro = 6; R.order = 'hold'; F.nf.babaN0 = nfRearReady(rt);
  rt.say('組頭', '馬場美濃守の殿じゃ！　仲間と並び、槍で突け！', 3.5);
  for (const q of [...F.spears, ...F.guns]) if (q.order !== 'path' && q.center().x > SB.x0 + 4) { q.order = 'attack'; q.seekRange = 60; q.aggro = 14; }
}
function nfEnd(rt) {
  const F = rt.flags;
  F.ending = true; F.dpB = true; rt.setPhase('end');
  rt.player.u.invuln = true;
  for (const u of rt.army.units) if (u.team === 1) { u.target = null; u.atk = null; u.swing = null; u.bind = null; if (u.alive) u.fleeing = true; }
  rt.objDone('pursue'); rt.objRemove('hold');
  rt.award((t) => { t.main = true; t.special = { label: '退き口の殿', pts: 25 }; }, '馬場の殿を討ち破った');
  ST_YOIN.install(rt);   // 戦後の余韻（shitaragahara/yoin.js）
  rt.banner('武田勢、退却', '馬場信春は殿にて討死。勝頼は逃れた');
  rt.say('組頭', '勝ちじゃ。追うのはここまで。組と槍を揃えよ！', 4);
  F.epilogue = true;
  rt.after(4, () => rt.say('語り', '武田は山県・内藤・真田・馬場ら多くの宿将を失った。勝頼は生きて戦場を離れた。', 3.5));
  sfx('horagai', 0.8);
  rt.finish({ scriptedEnd: true }, ST_YOIN.LEN);
}
// 右上の札（九1・十1・九3・五3）：目標①〜④を最初から全部並べ、済んだ物に印。両軍の今の兵の数の棒を上に常に出す。
//   画面の端へ出る赤い矢印（敵の大将・脅威の向き）は出さない（行き先は真上の▼一つ・敵は頭上の赤い▼）。
function shHud(rt) {
  const hud = rt.hud, hudProgress = hud.progress, root = document.getElementById('hud');
  hud.progress = function (battle, force = false) {
    const previousRt = this.progTickRt, previousT = this.progTickT;
    const out = hudProgress.call(this, battle, force);
    // 共通の札が更新を待つコマでは、一覧も待つ。強制更新はそのまま通す。
    if (battle === rt && this.prog && !rt.over &&
        (force || previousRt !== this.progTickRt || previousT !== this.progTickT)) goalsTick(this.prog, rt);
    return out;
  };
  root?.classList.add('sh-battle');
  const style = document.createElement('style');
  style.textContent = `
html:root body #hud#hud#hud.sh-battle #armybar { display:grid !important; visibility:visible !important; opacity:1 !important; }
html:root body #hud#hud#hud.sh-battle #h-prog#h-prog #armybar#armybar .gauge.one { display:block !important; grid-column:1 / -1; width:100%; }
html:root body #hud#hud#hud.sh-battle #h-prog#h-prog.goal-mode .pg-goals .tm { display:none !important; }
html:root body #hud#hud#hud.sh-battle #h-prog#h-prog.goal-mode .pg-goals li { display:flex !important; color:#e6dfd2 !important; background:none !important; }
html:root body #hud#hud#hud.sh-battle #h-prog#h-prog.goal-mode .pg-goals li.out { display:none !important; }
html:root body #hud#hud#hud.sh-battle #h-prog#h-prog.goal-mode .pg-goals li span { color:inherit !important; background:none !important; }
html:root body #hud#hud#hud.sh-battle #h-prog#h-prog.goal-mode .pg-goals li.now { color:#fff !important; font-weight:800; }
html:root body #hud#hud#hud.sh-battle #h-prog#h-prog.goal-mode .pg-goals li.done { color:#b9b3a6 !important; }
html:root body #hud#hud#hud.sh-battle #armybar .clock { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.sh-battle #armybar { visibility:hidden !important; }
html:root body #hud#hud#hud.sh-battle #h-prog#h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud#hud.sh-battle #h-prog#h-prog.goal-mode > .pg-goals { display:block !important; }
html:root body #hud#hud#hud.sh-battle #h-prog#h-prog.goal-mode .pg-goals li { white-space:normal !important; }
html:root body #hud#hud#hud.sh-battle :is(.threat.edge, #boss.edge) { display:none !important; }
/* 11/6 fix61（五2・五1）：柵の陰へ寄る「隠」の盾と人形の丸は意味が読めない。柵の内の守りは組頭の声と▼で足りる */
html:root body #hud#hud#hud.sh-battle .cover-guide { display:none !important; }`;
  document.head.appendChild(style);
  // 敵の▼は共通の field_signs に任せる。見える全員へ付き、札・地図・会話の間も同じ条件で隠れる。
  // 独自の字の▼を重ねると二重になり、以前の近接印が残った敵だけ欠けていた。
  const dispose = rt.world.dispose.bind(rt.world);
  rt.world.dispose = () => {
    if (hud.progress !== hudProgress) hud.progress = hudProgress;
    if (hud.prog) hud.prog.classList.remove('goal-mode');
    root?.classList.remove('sh-battle');
    style.remove(); dispose();
  };
}
// 金の▼の行き先（一つだけ）。持ち場に着いたら消え、守る間の敵は頭上の赤い▼で分かる。
function nfPinPoint(rt) {
  const N = rt.flags.nf, p = rt.player.u.pos;
  if (!N || rt.flags.ending) return null;
  if (ST_INTRO.active(rt)) return ST_INTRO.pin(rt);
  if (ST_BREACH.active(rt)) return ST_BREACH.pin(rt);
  if (N.step === 3 && ST_SOKO.active(rt) && rt.flags.shSoko.call && !(rt.flags.shSoko.there)) return ST_SOKO.pin(rt);
  if (N.step <= 1) return Math.hypot(p.x - NF_NORTH.x, p.z - NF_NORTH.z) < 7 ? null : NF_NORTH;
  if (N.step <= 3) return Math.hypot(p.x - NF_CENTER.x, p.z - NF_CENTER.z) < 7 ? null : NF_CENTER;
  if (N.step === 4) return N.crossWest ? NF_BANK : NF_CENTER;
  const baba = rt.flags.rear.units.find((u) => u.name === '馬場信春' && u.alive);
  const c = baba ? baba.pos : NF_REAR;
  return Math.hypot(c.x - p.x, c.z - p.z) < 14 ? null : c;
}

// 戦の途中の保存（battle_checkpoint.js・仕様33）：CP1 第一波の後（真田の寄せ）／CP2 山県の柵破りの前／CP3 内藤の寄せ（勝頼の退く前）。
//   段の始まりは nfTick を声なしで先へ流して作り直す（前の段の寄せ手は崩した事にする）
function shCp1(rt) {
  const F = rt.flags, N = F.nf;
  if (F.shIntro) F.shIntro.s = 9;
  if (!N.t0) { N.t0 = rt.t - 10; N.at = rt.t; ST_WALL.start(rt); }
  N.tobi = true;
  if (!F.shTame) F.shTame = { done: true };
  else F.shTame.done = true;
  nfTick(rt, 0.05);
}
function shCp2(rt) {
  const F = rt.flags, N = F.nf;
  if (N.step < 1) shCp1(rt);
  const g = F.waveGroups[0];
  for (const q of [g, g.cavalry]) for (const u of q.units) if (u.alive && u.type !== 'busho') u.fleeing = true;
  N.defendedNorth = true; g.nfAt = g.nfAt || rt.t; g.nfArrive = rt.t - 60;
  nfTick(rt, 0.05);
}
function shCp3(rt) {
  const F = rt.flags, N = F.nf;
  if (N.step < 2) shCp2(rt);
  const B = F.shBreach;
  if (B && !B.done) {
    // 再開でも実際に柵を倒す。段だけ進めると、続く土屋隊の道に柵が残る。
    if (B.s === 0) { B.arrived = true; ST_BREACH.tick(rt, 0.05); }
    B.there = true;
    const l = B.g.units.find((u) => u.name === '山県昌景');
    if (l?.alive) rt.army.kill(l, null);
  }
  nfTick(rt, 0.05); nfTick(rt, 0.05);
  const H = F.shHara;
  if (H && !H.done) { H.there = true; const l = H.g.units.find((u) => u.name === '原昌胤'); if (l?.alive) rt.army.kill(l, null); }
  N.step = 3; N.at = rt.t;
  nfTick(rt, 0.05);
}
const shitaragahara = {
  // 11/9 kaito「なんで鉄砲を持ってないの俺は」：柵の内の鉄砲の戦。火縄銃を持って始め、敵が近づいたら槍・刀へ持ち替える（spec 24〜25）。
  //   携帯でも「持替」の丸を出す（touch.js の touchBattleControls）
  touchBattleControls: true,
  // 布陣図どおりの奥の層（docs/fujin/shitaragahara.md・army_depth の軽い備）。柵の際と寄せの最前は本物と既存の列
  depth: DEPTH_SHITARA,
  checkpointStep(rt) {
    const N = rt.flags.nf;
    if (!N || rt.flags.ending) return null;
    if (N.step >= 3 && N.naitoSent) return 3;
    if (N.step === 2 && ST_BREACH.active(rt)) return 2;
    if (N.step === 1) return 1;
    return null;
  },
  resumeSteps: [[1, shCp1], [2, shCp2], [3, shCp3]],
  resumeAt(rt, step) { return step === 1 ? NF_NORTH : step === 2 ? { x: SB.x0 - SB.gap - 3, z: ST_BREACH.BZ + 20 } : NF_CENTER; },
  mapBadgeTai: true, // 地図の組の札を「隊N」で出す（hud_map）
  kumiLead: false, // 11/6 fixc1721（五2）：意味の分からない組の小旗の印を出さない
  // 稲生の水準：右上は任務の一行だけ。段の丸・小旗・避ける札・足元の白い輪・空振りの音は出さない。
  // 11/6 fixc1721（九1）：一行の札をやめ、右上に①〜④を並べる（goals5）
  hideMissionDots: true,
  nearbyAllySignLimit: 0,
  // 11/3 b100 ⑧：印は一つだけ。今の目標はいつも持ち場か追う隊なので、ついていく相手の青い印は出さない（金の▼一つ）
  noLeaderFollow: true,
  goalSignNoLabel: true, // 11/4 jin：▼の上に字を出さない（字は使わない・kaito 10/23）
  noTravelArrow: true, // 11/4 jin（AV15・BH6）：足元・画面の端の矢印は描かない
  noGoalCount: true, // 11/6 fix61（五3）：目標の相手（馬場隊・真田隊）を指す画面の端の赤い矢印（goal_count.js）も出さない
  actionGuideTarget: () => null, // 11/4 jin：追い討ちで殿の兵の上に「ここを攻める」の札を出さない（敵は頭上の赤い▼、行き先は金の▼一つ）
  goalSignOnly: true, // 持ち場の旗・輪・枠のピンも重ねず、頭上の金の▼だけ（場所は missionPin が決め、goals5 の goalTarget が同じ所を指す）
  noDodgeCard: true,
  noPlayerFoot: true,
  quietMiss: true,
  inouFeel: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  // 大きな見出しは決着の時だけ。段の替わりは任務の一行とピンで伝える。
  // 11/3 b100 ⑦：持ち場を移す場面替え（柳田前へ・大宮前の虎口へ）は、画面の真ん中に次の目標を短く出す
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /退却|討死|柵へ$|進み太鼓/.test(t),
  // 11/3 b100 ①：どこで・何をするかの一行（「持ち場へ」「柵を守れ」では場所が分からない）
  // 11/6 fixc1721（九1・十1）：右上は①〜④を最初から並べる（goals5.js の shitaragahara と同じ字）。今の一行も同じ字で、途中で言い替えない
  missions: NF_TEXT,
  goalsAllRows: false,
  goalVisibleRows: 5, // 六つの目標は今の段を含む五つずつ見せる。
  goalRowsAhead: true, // 開戦時から先の目標も並べ、最後の殿も順に見せる。
  missionOf(rt) { const N = rt.flags.nf; return !N || ST_INTRO.active(rt) ? 0 : N.step <= 1 ? 1 : N.step === 2 && !N.breachDone ? 2 : N.step <= 3 ? 3 : N.step === 4 ? 4 : 5; },
  missionHeading(rt) { return NF_TEXT[shitaragahara.missionOf(rt)]; },
  commanderTarget: (rt) => null,
  missionSignTarget: (rt) => null,
  namedGuideTarget: (rt) => null,
  missionPin(rt) {
    const F = rt.flags;
    if (rt.over || !rt.player.u.alive) return null;
    const pt = nfPinPoint(rt);
    if (!pt) return null;
    const q = F.shPin || (F.shPin = { x: 0, z: 0, r: 5, hide: 5 });
    q.unit = null; q.enemy = false; q.waiting = false; q.arrived = false; q.defend = false;
    q.follow = false; q.fire = false; q.gate = false; q.footRing = false; q.area = false; q.passage = false;
    q.x = pt.x; q.z = pt.z; q.r = q.hide = 6;
    return q;
  },
  // 民は war_people の共有する形で描く。兵の名簿・人数・当たり・戦功へ加えない。
  civilianCrowd: { bounds: { minX: -740, maxX: 740, minZ: -740, maxZ: 740 }, bands: PEOPLE_BANDS },
  singlePassageArrow: false, // 11/6 fix61（五3）：柵のすき間を矢印で示さない
  compactHoldGuide: true, // 持ち場の中心には輪と矢印を置く。
  compactGroundGoalRing: true, // 輪の太さと最小径を抑え、足元の兵や落ちた武具を見せる。
  compactGuardPostRing: true, // 到着後の守備の輪にも小さい表示を適用する。
  smallTaskAreas: true, smallRetreatAreas: true, taskAreaFootRing: true, // 待機・退避の強調も足元の小旗へそろえ、柵際を大輪で囲まない。
  subtleGroundGuides: true, // 持ち場の小さい印を残し、携帯でも兵と柵を見せる。
  keepOpeningTaskLabel: true, // 始まりの「ここへ」で、柵へ進んで槍を構える下知を消さない。
  keepWaitOrderLabel: true,
  waitGuardButtonText: '押して槍を構える',
  compactWaitGuard: true, // 携帯横画面の防御釦は下端に置き、柵際の寄せ手を隠さない。
  meleeControlGuide: true, // 反撃の説明と、下端で押す「つく」「きる」の札をそろえる。
  hidePlayerSign: false, // 自分の足元のひし形を残し、行き先の旗と区別する。
  compactPlayerSign: true,
  playerSignMinScale: .65, playerSignScale: .65, // 足元のひし形を見失わず、具足と地面も見せる。
  playerFootSignOnly: true, // 振り向く時も本人の全身を白い枠で覆わない。
  passiveGuardStatus: true, // 構えた後は押せない待機札にし、元の構える操作を残す。
  guardStatusText: '槍を構えている', // 構えは討ち取った印ではなく、今の姿勢として伝える。
  compactRouteGuide: true, // 川を渡る道筋は細い点線にし、手前の地面と兵を空ける。
  avoidAllDestinationNotices: true, // 見切れた持ち場の印は操作欄を避け、空いた端で向きを示す。
  teamSignsOnly: true, // 敵は交差した刀と近くの輪郭、味方は丸で示す。
  compactCombatGuides: true, // 既存の小さな敵の印と短い矢印を使い、兵の姿と槍先を空ける。
  meleeApproachArrowLength: 72, // 追撃で敵へ寄る時も、白い案内線で本人の背を覆わない。
  guideLinkLength: 72, // 札から足元まで戦場を横切らず、指す場所のそばだけに線を残す。
  guideArrowLength: 72,
  swipeArrowLength: 72,
  hideDefenseArea: true, // 持ち場の境と敵の四隅を残し、防御用の大輪を重ねない。
  subtleTargetFrames: true, // 狙う敵の胴を太い箱で覆わず、細い四隅で示す。
  cornerEnemyGuide: true, // 描画側の指定に合わせ、敵の胸と槍を細い四隅で示す。
  enemyCornerSign: true, // 実際に敵を描く側の指定。太い白枠で全身を囲まない。
  compactDestinationSign: true, // 退く旗と矢印を小さくし、寄せ手の姿を隠さない。
  compactDestinationArea: true, // 足元いっぱいに広がる持ち場の輪は省き、旗と下知を残す。
  compactGuardArea: true, // 待つ場所は小さな囲みと字で示し、戦場を空ける。
  compactRetreatSign: true, // 手当てへ戻る案内の旗と矢印を小さくし、前の兵を見せる。
  retreatArrowLength: 72, // 退避先まで長い線を引かず、足元から短く向きを示す。
  retreatLinkLength: 140,
  compactFloorGuides: true, // 近い地面の印が大きく投影された時も、戦場を覆わない。
  compactDodgeGuide: true, singleRetreatArrow: true, // 矢や騎馬から退く時も、小さい輪と短い矢印だけにする。
  openingWait: () => false,
  releaseGuardForAttack: true, // 槍の届くすきには、防ぐ長押しから既存の反撃案内へ渡す。
  // 11/4 jin（Simple・BH6）：「敵をたおせ」の札と敵を指す矢印は出さない。敵は頭上の▼で分かる
  meleeGuide() { return false; },
  waitGuardAllowed(rt) {
    // 持ち場に着いたら寄せ手が来る前から構えられる。移動中の案内は保つ。
    const F = rt.flags, p = rt.player.u.pos;
    if (F.ending) return false;
    if (!F.pursuit) {
      const mark = rt.markers.find(m => m.id === this.guideMarker(rt));
      const pt = mark && (typeof mark.pos === 'function' ? mark.pos() : mark.pos);
      if (pt && Math.hypot(p.x - pt.x, p.z - pt.z) < (mark.guideRadius || 7)) return true;
    }
    // 持ち場へ戻る途中も、近くの敵には構えられる。行き先の札はそのまま残す。
    for (const e of rt.army.units) {
      if (!e.alive || e.team === rt.player.u.team || e.gone || e.fleeing || e.woundOut || e.noTarget || e.invuln ||
          !e.sidearm && (e.type === 'gun' || e.type === 'bow') || Math.abs(e.pos.y - p.y) > 3 ||
          (e.pos.x - p.x) ** 2 + (e.pos.z - p.z) ** 2 >= 64 || rt.army.wallBetween(p, -1, e.pos)) continue;
      return true;
    }
    return false;
  },
  attackOpening(rt, enemy) {
    const P = rt.player, u = P.u, F = rt.flags;
    if (F.ending || rt.over ||
        F.cur?.withdrew && !F.cur.doneWave && F.commandPt &&
          Math.hypot(u.pos.x - F.commandPt.x, u.pos.z - F.commandPt.z) > SH_HOLD_GUIDE.guideRadius ||
        !enemy?.alive || enemy.team === u.team || enemy.gone || enemy.fleeing ||
        enemy.woundOut || enemy.noTarget || enemy.invuln || enemy.atk || enemy.swing && !enemy.swing.done ||
        P.weapon !== 'spear' && P.weapon !== 'sword' ||
        Math.abs(enemy.pos.y - u.pos.y) > 1.5 ||
        Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) > P.meleeReach(P.weapon === 'sword' ? 'slash' : 'thrust') ||
        rt.army.wallBetween(u.pos, -1, enemy.pos)) return false;
    // 正面の敵が休んでいても、別の敵が打ち込む間は守りを解かない。
    for (const e of rt.army.units) {
      if (!e.alive || e.team === u.team || e.gone || e.fleeing || e.woundOut || e.noTarget) continue;
      if ((e.atk?.target === u || e.swing?.target === u && !e.swing.done) &&
          Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 4.5 &&
          !rt.army.wallBetween(u.pos, -1, e.pos)) return false;
    }
    return true;
  },
  treatmentTaskGuidance: true, // 移動・待機・手当ての長押しを、今できる操作で案内する。
  treatmentApproachLabel: '手当ての旗へ すすむ',
  treatmentMoveCaption: '丸から旗へ なぞって下がる', // 止血は到着後。移動の指なぞりと混ぜない。
  rangedThreatNeedsShot: true, // 発射予告と飛来中だけ警告し、弾込め中は柵を守る下知を残す。
  coverGuideLabel: '柵のうしろへ',
  coverGuideTouchLabel: '長押しで\n柵のうしろへ移動',
  dodgeTurnDuration: 3, // 向き直りの手ほどきから、実際に退く場所の案内へ戻す。
  dodgeTurnInterval: 12,
  dodgeAvoidNotices: true,
  dodgeActionText: '長押しでよける', // 横画面の札で末尾だけ折り返さず、押した時の動きを伝える。
  dodgeActionHelp: () => '矢印の方へよける',
  dodgeTurnLabel: (_rt, right, touch) => touch ? `${right ? '右' : '左'}へ なぞって振り向く` : `${right ? '右' : '左'}へ 振り向く`,
  arrivalLabel: '着いた',
  // 11/6 fixc1721（九1）：距離は m（共通の既定）
  immediateTaskChanges: true, // 渡河・後退・殿への到着で、古い行き先を十秒残さない。
  keepTaskLabel: true, // 近い敵が見えても、柵を離れて倒しに行く下知へ替えない。
  keepTaskPanel: true, // 敵の拡大札へ切り替えず、柵の持ち場と馬場隊への下知を残す。
  keepApproachTaskPanel: true, // 敵へ寄る時も下知を残し、兵の姿は実物の小さい敵印で示す。
  keepGuardTaskLabel: true, // 守備中も持ち場の下知を残し、敵一人を追う札へ動かさない。
  keepTaskWithGuard: true, // 防御の釦を出しても、同じ任務欄に持ち場の下知を残す。
  keepDestinationTask: true, // 配置替え・弾込め・後退の下知を、旗への案内だけにしない。
  hideGuideSteps: true, // 持ち場の下知と重なる歩数の札を省き、戦場を空ける。
  meleeTurnText: '敵のほうへ なぞれ', // 指と矢印を添え、触る場所と向きを示す。
  meleeApproachText: () => isTouch ? '自分から敵へ なぞって進む' : '印の敵へ 進もう',
  waitOrderLabel(rt) { return NF_TEXT[shitaragahara.missionOf(rt)]; },
  clearTravelGuide: true, // 追撃の旗と行き先の字の重なりを避ける。
  travelGuideLabel: () => '',
  keepRetreatReason: true,
  keepWoundRetreatReason: true,
  retreatGuideLabel(rt, reached) {
    const u = rt.player.u;
    if (!reached) return u.wounds?.bleed > .0001 ? '血を止めるため 下がろう' : 'ここまで下がろう';
    if (u.wounds?.bleed > .0001) return '血を止めよう';
    if (u.hp < u.maxHp * .3) return '仲間のそばで 身を守れ';
    return 'ここで 槍を構えよ';
  },
  introTaskFirst: true, // 横画面でも、人物紹介より先に持ち場の下知を見せる。
  // 11/5 check60（五4）：始まりの札は操作の字でなく、戦の二三行
  introText: () => '長篠城を救いに来た織田・徳川は、連吾川の西の段に柵を三重に組んだ。夜明け、武田勢が川向こうの段丘から寄せて来る。柵の内で仲間と槍を揃え、鉄砲衆を守れ。',
  retreatGuidePath: shRetreatPath,
  // 反撃を受ける間は敵への向きと守りを先に示し、札と矢印を揃える。
  routeGuidePriority: (rt) => !!rt.flags.pursuit && rt.flags.tsuigeki?.stage < 3 && !shChaseCounter(rt),
  movePathDirection: false, // 11/6 fix61（五3）：浅瀬の道筋の矢印・柵の口の矢印は出さない（行き先は真上の▼一つ）
  routeWaymarks: false,
  routeWaymarkLabel: 'ここを渡る',
  guidePath: () => null,
  placeFrame: () => null,
  dodgeLabel: (rt, direction, rain) => direction || 'いまは さがれ',
  // けがの札は体への影響を示す。追撃の下知と逆向きの案内を常時出さない。
  retreatForLimbWounds: false, // 止血後の手足のけがだけでは退かせない。出血と瀕死の案内は残す。
  woundEffectText: (_rt, slow) => slow ? '足のけが・歩みが遅い' : '腕のけが・突きが弱い',
  guardPurposeText: () => '仲間と槍で止めよう',
  guardPostFrame(rt, guide) {
    // 持ち場に接する柵の一部だけを囲む。大きな枠で寄せ手を覆わない。
    const center = guide.marker.guideDestination?.() || guide.pos;
    const frame = rt.flags.guardFenceFrame || (rt.flags.guardFenceFrame = Array.from({ length:4 }, () => ({ x:0, y:0, z:0 })));
    let gate = SB.gates[0];
    for (const z of SB.gates) if (Math.abs(z + 4.5 - center.z) < Math.abs(gate + 4.5 - center.z)) gate = z;
    const z0 = center.z >= gate + 4.5 ? gate + 10.5 : gate - 7.5;
    const row = Math.max(0, Math.min(2, Math.round((SB.x0 - center.x - 4) / SB.gap)));
    for (let i = 0; i < 4; i++) {
      const p = frame[i]; p.x = SB.x0 - row * SB.gap; p.z = z0 + (i === 0 || i === 3 ? 1.8 : 4.2);
      p.y = drawGroundAt(rt.world, p.x, p.z) + (i < 2 ? 1.9 : .1);
    }
    return frame;
  },
  compactIntro: true,
  introPeopleFolded: true, // 携帯の横画面で人物の名を半行に切らない。
  // 四つの目標は新しい進行に揃える。旧進行の渡河・待機の下知で上書きしない。
  taskText: (rt, text) => text,
  // 追撃は各地点の百五十秒で締める。共通の八分で途中の任務と帰り支度を切らない。
  pacingWait: () => true, // 11/6 fixc1721（十1）：時が切れて勝ちにしない。四つの目標を果たして締める
  battleVoices: { lines: { ally: {
    withdraw: ['組と並び、槍を敵へ向けよ！'],
    encircle2: ['敵に囲まれた！　組と並び、槍を敵へ向けよ'],
  } } },
  guideMarker: () => null,
  // 追撃では退散中の別隊へ印を移さず、実際に追う殿の兵を示す。
  objectiveEnemies: (rt) => rt.flags.nf?.step === 5 ? rt.flags.rear?.units : null,
  noAllyReports: true, // 遠い武将の掛け声を、使番で繰り返さない。
  // 追い討ちの下知と敵の目前では、柵の修理へ誘わない。
  fenceUseOK: (rt) => !rt.flags.pursuit && !rt.flags.ending && !rt.army.nearestEnemy(rt.player.u, 6),
  groundStandards: true, // 坂でも隊旗の竿を地面から立て、持ち手と旗の位置を合わせる。
  noticeOnce: false, // 再び危なくなった時も知らせる。同文は共通の札で八秒あける。
  nearAllyFadeRadius: 1.05,
  nearAllySolidBody: true, // 視点を兵から避け、入り込む時だけ一人の全身を描画中に避ける。
  nearHoroRadius: 9, // 騎馬の背から張り出す母衣も、近い視点で顔と敵を覆わない。
  nearHoroHide: true,
  nearFlagFadeRadius: 6, // 長い白旗が肩越しの視点へ入る前に、既存の遮蔽判定で避ける。
  nearSpearFade: false, // 周囲の槍を一律に縮めず、視線を塞ぐ柄だけ既存の判定で避ける。
  noWake: false, // 近い兵は同じ位置から本物へ替える。通常兵は消さず、空いた枠だけ使う。
  wakeOK: (rt) => !rt.flags.ending && !rt.flags.chaseCease,
  noReinforcements: true, // 休息の間も、人数だけを見て新手を湧かせない。
  wakeFullSize: true, // 遠景の背丈を本物の人物へ掛けて縮めない。
  botOrders: true, // 虎口の道筋・持ち場・反撃を、走る癖や持ち替えで上書きしない。
  noCouriers: true,  // 戦に加わらない伝令の騎馬は置かない（稲生の標準。kaito 10/24「動かない味方と敵は一切排除」）
  noControlsHelp: true, // 操作の字（なぞって動く・つく）は出さない（操作は尾張の戦で覚える。kaito 10/20）
  enemyTriangleSigns: true, // 敵は頭上の赤い▼で示す（刀の印は使わない。稲生の標準）
  playerRegen: 0.02, // 稲生の標準：斬り合いの合間は命が少しずつ戻る（bot が柵の口で倒れる回が半分あった 10/28）
  playerTaken: 0.3, // 柵の口へ来る武田の侍は三太刀で命を八割削っていた（bot 10/26 に二度倒れた）。10/28 も柵の前で侍に囲まれ四戦三敗。人数と斬り合いは減らさず傷だけ軽く
  spawn: { x: SB.x0 - SB.gap - 3, z: SB.gates[0] + 4.5, heading: Math.PI / 2 },
  moveLim: 740, // 南北の虎口・両本陣・東の退路を、歩ける場にも収める
  taisho: { a: { name: '織田信長', use: true }, b: { name: '武田勝頼', def: true } },
  noTaishoRaid: true, // 柵と川を無視して本陣を狙う共通の新手は出さない
  wakeRoom: 190, // 10/31 245 だと遠くへ戻す・近くで作り直すが 3 分で 500 人を超え、兵の表と写しが増え続けて iPhone で落ちた。190 なら作り直しは 3 分で 60 人ほど
  prelude: false, // 霧の寄せをすぐ始める。共通の待機で隊を止めない。
  // 身の回りの当時の場（timeslip_field.js）。天正三年五月二十一日は今の七月上旬・梅雨の晴れ間。
  // 前日までの雨で連吾川べりの田と畦はぬかるみ、夏草は丈が高い。柵の口ほど踏み荒らされ、倒れた槍・武田方の旗・矢が散る。
  // 柵の内には鉄砲衆の玉薬の俵と織田の幟。追い討ちの東の野も、馬場隊の殿と斬り合った所ほど荒れる。
  timeslip: {
    // 11/6 fixc1721（四6・八1）：地面に槍や矢が林のように刺さって柵の杭と見分けられなかった。散らばりを半分以下に
    wet: 0.25, dust: 0.3, trample: 0.3, debris: 0.45, arrows: 0.15,   // 晴れ間の朝。水たまりは置かない（朝の空を映して白い円盤に見えた）
    // 10/29 手本（長篠合戦図屏風・設楽原の写真）と並べて：原色の緑と、目の前の葉の大きな株が絵に見えた。くすんだ夏草の色と丈へ。
    grass: 0x7b8758, grassTints: [0xc4c2a8, 0xb4b296, 0xa8a286], grassH: 0.85, tallGrass: 0.9,
    flagColors: [0xe8e2d2, 0x1e1c1a, 0x9a2c22],
    fights: [...SB.gates.map((z) => [SB.x0 + 4, z + 4.5, 34]), [REARGUARD.x, REARGUARD.z, 40], [250, -440, 34]],
    sets: [
      { k: 'tawara', x: -14, z: SB.gates[0] - 6, rot: 0.2, n: 6 },
      { k: 'tawara', x: -14, z: SB.gates[1] - 6, rot: -0.3, n: 5 },
      { k: 'nobori', x: -18, z: SB.gates[0] + 14, dx: 0, dz: 4, n: 3, kind: 'oda', h: 5 },
    ],
  },
  // 11/1：共通の既定（本人へ四人が同時に打つ・構えずに受けた一太刀は命の五割）で bot が倒れて負けた。寄せる数・敵の強さ・大軍の見た目は変えず、
  //   一太刀を三割五分（侍は四割強）に、刃を受けた後の2.2秒は次の刃を通さない（同じ一瞬に二太刀・三太刀を浴びない）。
  // 11/2 oda_bot_1102：追い討ちの段で足軽の突きを重ねて倒れた（五回に一回）。一太刀を二割七分半（侍は三割三分）に
  cutFloor: 0.55,
  meleeGrace: { rate: 1, burst: 1, interval: 2.2 },
  world: {
    playerAtkMax: 2,   // 11/1：本人へ同時に打ち込むのは二人まで（共通の既定は四人・player_pressure.js）
    // 小堂は敷地全体の高い地面に床を合わせる。中心だけでは斜面が内陣・外陣へ突き出す。
    // 外観・板床・戸口・石段は既存の共通基準高を使い、設営時だけ地面を測る。
    get interiorFit() { return SETTINGS.quality === 'high'; },
    noGroundRipples: true, // 実測の丘と不規則な起伏を使い、川向こうへ等間隔の細波を足さない。
    stableSlopeGrain: true, // 坂の法線から模様を引かず、川向こうまで続く波状の縞を防ぐ。
    longHoro: 'round', // 既存の籠と布の丸い断面を使い、赤い母衣を薄い板にしない。
    terrainTriangles: true, // 本物の兵も、柵・軽い兵と同じ描く地面の面へ足を据える。
    distantTerrainTriangles: true, // 柵際で押し合う軽い兵も、同じ三角形の坂へ足を据える。
    clashTerrainTriangles: true, // 描画を束ねる乱戦兵は、戦の中で接地方法を統一する。
    slopeContactFalls: true, // 携帯でも倒れた腰と胸を坂へ合わせ、接線の上へ体を浮かせない。
    crumpledFlags: true, // 落ちた指物は既存の皺のある形へ。拡大された布を板のように残さない。
    slopeLitter: true, // 坂に落ちる長柄は握りの位置で高さを合わせ、携帯でも中央を浮かせない。
    keepTerrainGrid: true, // 携帯でも足場と同じ格子を描き、兵の足と川面を斜面から浮かせない。
    terrainViewCull: true, // 遠景の地面は見える区画だけ一回で描く。前線と足場は同じ。
    terrainBackfaceCull: true, // 川岸の裏向きの地面だけ送らない。兵の数・足場・影は保つ。
    terrainCullCell: 32, // 細長い前線の画面外を小区画で外す。地面の頂点と描く回数は保つ。
    terrainClipCells: 2, // 規則格子の画面端も二升で選び、遠景の平坦部は元の粗い面を使う。
    highUnitNear: 8, // 八メートル先の甲冑の細部だけ軽い形へ。兵数・入り乱れ・動きは保つ。
    highHumanDetail: 8, // 骨の入った無名兵も甲冑を一体にまとめ、近い本人と武将は細かい姿を保つ。
    completeCrowdLegs: true, // 中の体を隠す距離でも袴と脛の布を残し、草摺と臑当の間を空洞にしない。
    livingSpearHedge: true, // 柵際で止まる後列も、前の味方を避けて長柄を起こし、押し合いへ応じる。
    unitPartCull: true, // 槍が見える兵も、画面外の体の部品は送らない。影の束は残す。
    lowArmyDetail: true, // 志賀と同じ寄せの軍勢を、低だけ早めに軽い形へ。
    seed: 57,
    moveLim: 740,
    groundHalf: 780, // 地面の頂点数は増やさず、南北二キロの柵と後方の山まで収める
    // 視点に付いてくる遠景は低い稜線にし、裾を地面に埋めて朝霞へつなぐ。
    mountainScale: 0.35,
    mountainBase: -80,
    mountainHaze: 0.82,
    mood: 'morning',
    // 11/6 fixc1721（二1・BP）：隣の杭を逆に傾けて上で交わらせた形は、逆茂木の切れ端に見えた。杭を立て並べ、横木を縄で結ぶ柵に（柵の一般の形・設楽原の復元柵）
    bobosakuCrossed: false,
    bobosakuBook: true,// 杭の間 90cm・見える高さ約 180cm（甲冑の本の柵の線画。資料との差 10/28）
    bobosakuGroundMound: false, // 土盛りと空堀は地形で作る。三列の根元へ土の板を重ねない。
    // 長い柵は材質ごとに結合し、画面と影に入る区画だけを描く。破壊は区画ごとに保つ。
    // 11/6 fixc1721（二1・BP）：柵を材質ごとに束ねると、影だけ落ちて柵そのものが描かれなかった（写真で確かめた）。束ねない
    mergeFenceBatches: false,
    distantMaterialBatch: true,
    lowMountainCull: true, // 丘の向こうに全体が隠れた遠い景物だけ送らない。近景と影は残す。
    distantPartCull: true, // 遠い縄などの小部品は既存の寸法判定で省き、柵の杭と横木は残す。
    staticBatchBeforeDraw: false, // 11/6 fixc1721：転送前の選び直しでも柵が消えた。使わない
    staticBackfaceCull: true, // 柵の裏向きの面は送らず、列の密度と影は保つ。
    staticFaceCell: 2, // 長い馬防柵の画面外を二メートル区画で外す。同じ材質は一回で描く。
    distantDetailGrid: 0.05,
    distantDetailNear: 28,
    distantDetailFarGrid: 0.2, // 遠い柵の凹凸だけをまとめ、細い杭と横木の輪郭は既存の判定で保つ。
    distantDetailFar: 64, // 六十四メートル先の凹凸だけ軽くし、細い杭や横木の輪郭保護は保つ。
    middleInfantryArms: true, // 近い控えの中距離の形にも腕・袖を残す。既存の軽い形を共有する。
    highClashDetail: true, // 遠い乱戦の細部だけを省く。兵の数・位置・斬り合いは同じ。
    highClashFarDetail: 24, // 二十四メートル先は輪郭の形を共有し、袖と草摺の細部だけを省く。
    soldierMiddleFarDetail: true, // 鉄砲列の中距離にも遠景の指定を適用し、人数と射撃は保つ。
    clashSoldierLOD: true, // 乱戦の細部は、隊の端でなく兵ごとの距離で選ぶ。
    singleSoldierLOD: true, // 遠近の境でも同じ兵を重ねて送らず、一人一束で描く。
    armyCompactAll: true, // 小隊の遠い列も兵ごとに選び、見えない兵の面だけを省く。射撃と人数は同じ。
    routedSoldierLOD: true, // 敗走先も移動の余裕を含めて細部を選び、兵数と走る動きは保つ。
    armyFarDetail: 36, // 三十六メートルに足踏みの余裕を足した先は輪郭の形へ。人数・隊列・動きは同じ。
    soldierDetailNear: 12, // 十二メートルに移動の余裕を足すまで細かい形を保ち、その先も全員を描く。
    soldierDetailMiddle: 24, // 二十四メートルに足踏みの余裕を足した先は輪郭の形へ。射撃と押し合いは同じ。
    soldierDetailMargin: 3, // 押し引きは実際の位置で測り、足踏みの余裕を三メートル残す。
    tightSceneryCull: true, // 草木の実寸で囲み、画面外の長い株を余分に送らない。
    sceneryViewOnly: true, // 動く影を省いた草木は、近い背後の株も画面へ送らない。
    staticFaceNormalStep: 0.0625, // 丸太の向きの余裕を狭め、裏に隠れる面だけ送らない。
    armyViewCull: true, // 押し合いの位置と槍の余裕を含め、画面外の遠景兵だけ送らない。
    naturalArrowRain: true, // 遠矢も実際の細さと朝霞に合わせ、空に太い黒棒を浮かせない。
    variedMarch: true, strideLimit: 1.1, // 列の歩調を一人ずつずらし、敗走でも腿と膝を振り上げすぎない。移動速度は保つ。
    livingSpearHedge: true, // 槍の列と斬り合いの間は保ち、呼吸と押し返す手元に小さな違いを付ける。
    closeBattleWeight: SETTINGS.quality === 'high', // 押された腰の戻り、敗走の振り返り、胴の接地点をそろえる。
    responsiveBattleMotion: SETTINGS.quality === 'high', // 受け止められた息・追手への振り返り・湿土での沈み込みを実際の出来事へ合わせる。
    contactBraceObstacles: SETTINGS.quality === 'high', // 鉄砲の狙い先や柵越しの敵を押し合いと数えず、槍の前列だけを支える。
    routedFlightPose: SETTINGS.quality === 'high', // 備が崩れた兵も逃げる姿へつなぎ、道が詰まっても雑談や休息へ戻さない。
    groundedFlightPace: SETTINGS.quality === 'high', // 逃げ足は実際に進んだ距離へ合わせ、仲間に詰まった足だけを空回りさせない。
    plantedBattleMotion: SETTINGS.quality === 'high', // 発砲を肩と膝で受け、敗走の倒れ込みと踏んだ足の泥をつなぐ。
    carryFallPosture: SETTINGS.quality === 'high', // 押す肩や逃げる前傾から膝が抜け、直立へ跳ね戻らず倒れる。
    weightedFallTravel: SETTINGS.quality === 'high', // 体が崩れる側へ半歩よろめき、背を討たれた兵は走る勢いを引き継ぐ。
    weightedFallImpact: SETTINGS.quality === 'high', directedFallMud: SETTINGS.quality === 'high', // 倒れる重さと向きへ着地音・泥を合わせ、既存の粒を使う。
    contactDust: SETTINGS.quality === 'high', // 踏みしめた瞬間だけ湿った土を跳ねる。兵と攻撃の密度は保つ。
    fallPaceSpread: 0.35, groundedFalls: true, settleSideFalls: true, // 一斉射で倒れる間をばらし、横倒しは肩から地へ寝かせる。
    contactFalls: true, wetEarthBursts: true, // 胴が地を打つ時に具足の音と低く短い泥粒。雨後の土に白い埃を立てない。
    terrainContactFalls: SETTINGS.quality === 'high', // 坂を踏み外して討たれても、元の足の高さへ亡骸を浮かせない。
    slopeContactFalls: SETTINGS.quality === 'high', // 柵へ登る坂でも、倒れた胴の下の地面で支える。
    lifeSizePinnedArrows: true, // 刺さった矢は兵の骨や体の倍率を受けず、実寸のまま残す。
    pinnedArrowAxisScale: true, // 斜めの矢は矢自身の三軸で縮尺を戻し、胴から長い柄を伸ばさない。
    plantedArrows: true, // 地面の矢は鏃を下へ向け、羽だけの黒い板を足元に残さない。
    arrowRainGroundCue: false, // 柵際を白黒の大輪で覆わない。矢の影・警告・退き先は残す。
    muddy: 0.4,   // 前の日までの梅雨の雨で足元がぬかるむ（kaito 11/5 BP。歩みはどこでも一割ほど重い）
    prepareTerrain: shFortGround,   // 連吾川の崖・柵の段・窪地（草木と水面を据える前に地面を細かくする）
    horiAt: shHoriAt,   // 沼の低地と窪地の底は足が六割に落ち、上の柵から撃たれる
    mist: true,
    mistFar: 330, // 朝霞は遠い丘に残し、川向こうの寄せ手と柵の木組みを見せる。
    groundMistScale: 0.22, // 川岸の薄い靄を残し、足元と柵の口を白い帯で隠さない。
    smokeFogFloor: 260, // 硝煙の粒は残し、近い寄せ手まで白い壁で隠さない。
    wetStart: 0.55,      // 前の雨で湿った地面。朝の戦の間は雨を降らせない
    time: 'day',
    runnerWay: shRunnerWay,
    moveWay: shRunnerWay,
    fleeWay: shFleeWay,
    waterSlow: true,   // 連吾川・水田で騎馬の加速が落ちる（terrain_tags.js の 'water' タグ。長篠・設楽原 統合版 3〜4 章）
    blockedHint: (rt) => rt.flags.pursuit ? '川向こうの武田勢を追え。浅瀬で足を止めるな' : '柵の口へ回れ。仲間の列に続け',
    paths: [
      [[-176, 10], [-80, 8], [-55, 8]],
      [[-55, -440], [-55, 440]],
      // 土塁の奥の南北道と三つの虎口。急な岸でも、組が徒歩で移れる道を残す。
      [[-6, SB.z0], [-6, SB.z1]],
      ...SB.gates.map((z) => [[-55, z + 4.5], [-6, z + 4.5], [SB.x0 + 6, z + 4.5]]),
      // 退き口へ続く細い土道。川と虎口の通り方は変えない。
      [[60, MOUTHS[0].z + 4.5], [125, MOUTHS[0].z + 4.5], [REARGUARD.x, REARGUARD.z], [ESCAPE.x, ESCAPE.z]],
      ...PEOPLE_PATHS,
    ],
    height(x, z) {
      // 標高の外側にも周期的な波を並べず、低い不揃いな起伏をつなぐ。
      let h = (shSoilPatch(x, z) - 0.5) * 1.6;
      // 標高の範囲を出た時だけ使う、低い弾正山・丸山と東の丘の続き
      h += 8 * Math.exp(-((x + 85) ** 2) / 3200) + 6 * gauss(x, z, MARUYAMA.x, MARUYAMA.z, 1600) + 18 * gauss(x, z, CHAUSU.x, CHAUSU.z, 16000);
      h += 18 * Math.exp(-((x - 180) ** 2) / 16000) + 12 * gauss(x, z, KATSUYORI.x, KATSUYORI.z, 16000);
      if (DEM) h = demBlend(DEM, demRiver(x, z), z, h, { scale: DEM_SCALE, xyScale: METRES });
      // 標高の粗い格子をそのまま岸へ使うと、浅い川面が斜面に埋まる。
      // 川筋の高さは保ち、岸だけをなだらかにする。地面の頂点数は増やさない。
      for (let i = 1; i < RENGO.length; i++) {
        const a = RENGO[i - 1], b = RENGO[i];
        if (z < a[1] || z > b[1]) continue;
        const rx = a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
        const d = Math.abs(x - rx);
        // 川岸は地面の格子二つ分を使ってつなぐ。細い補正だと水面を三角の土が横切る。
        // 大宮前の浅瀬では、さらに広い帯で坂へ戻す。
        const ford = Math.max(0, Math.min(1, (64 - Math.abs(z - (MOUTHS[0].z + 4.5))) / 24));
        if (d < 24 + 18 * ford) {
          let bank = (shSoilPatch(rx, z) - 0.5) * 1.6;
          bank += 8 * Math.exp(-((rx + 85) ** 2) / 3200) + 6 * gauss(rx, z, MARUYAMA.x, MARUYAMA.z, 1600) + 18 * gauss(rx, z, CHAUSU.x, CHAUSU.z, 16000);
          bank += 18 * Math.exp(-((rx - 180) ** 2) / 16000) + 12 * gauss(rx, z, KATSUYORI.x, KATSUYORI.z, 16000);
          if (DEM) bank = demBlend(DEM, demRiver(rx, z), z, bank, { scale: DEM_SCALE, xyScale: METRES });
          const lip = Math.min(1, d / 10);
          bank += 0.45 * ford * lip * lip * (3 - 2 * lip);
          const k = Math.min(1, Math.max(0, (d - 12) / (12 + 18 * ford)));
          h = bank + (h - bank) * k * k * (3 - 2 * k);
        }
        break;
      }
      // 丘には浅く不揃いな起伏だけを足す。等間隔の畝を遠くまで並べない。
      if (x > 60) h += Math.min(1, (x - 60) / 24) * 0.24 * (shSoilPatch(x, z) - 0.5);
      // 柵の前の浅い空堀と、柵の後ろの土盛り
      const fx = SB.x0 + 2.6;
      h -= 0.9 * Math.exp(-((x - fx) ** 2) / 1.6) * (Math.abs(z) < SB.z1 ? 1 : 0);
      const bx = SB.x0 - 2 * SB.gap - 3;
      // 草色の薄い面を重ねず、地面そのものを緩く盛る。粗い地形格子でも裾がつながる幅にする。
      // 虎口と南北の端では高さをなだらかに戻し、通り道を空ける。
      let bankEnd = Math.min(z - (SB.z0 + 2), SB.z1 - 2 - z);
      for (const gate of SB.gates) bankEnd = Math.min(bankEnd, Math.max(gate - 1 - z, z - (gate + 10)));
      const bankFade = Math.max(0, Math.min(1, bankEnd / 12));
      h += 0.75 * Math.exp(-((x - bx) ** 2) / 64) * bankFade * bankFade * (3 - 2 * bankFade);
      // 控えの足元にも浅い土のうねりを残す。虎口の道・川岸・格子の細かさは保つ。
      h += 0.28 * Math.exp(-((x + 30) ** 2) / 240) * bankFade
        * Math.sin(x * 0.17 + Math.sin(z * 0.07)) * Math.cos(z * 0.12);
      return h;
    },
    tint(x, z, h, c) {
      // 柵の並ぶ所は踏み固められて土が出ている
      if (x > -50 && x < SB.x0 + 4 && Math.abs(z) < SB.z1) {
        const patch = shSoilPatch(x, z);
        c.setRGB(0.58 - patch * 0.07, 0.50 + patch * 0.06, 0.34 - patch * 0.03);   // 夏の踏み固めた土。暗い一枚に沈めない（10/28）
      }
      // 草の丘・畦・湿った土を分け、東の追い道にも明暗を残す。
      if (x > 36 && x < 320) {
        // 川岸と奥の丘では元の色へ戻し、草色の帯の継ぎ目も残さない。
        const edge = Math.min(1, (x - 36) / 24, (320 - x) / 24);
        const grass = (0.28 + 0.50 * shSoilPatch(x, z)) * edge * edge * (3 - 2 * edge);
        c.setRGB(c.r * (1 - grass) + 0.31 * grass, c.g * (1 - grass) + 0.34 * grass, c.b * (1 - grass) + 0.21 * grass);
      }
      // 川沿いの湿った田
      if (Math.abs(x - 21) < 14) c.setRGB(c.r * 0.85, c.g * 0.9, c.b * 0.8);
      // 梅雨の晴れ間の夏草は、芝生の原色の緑でなく黄と灰の混じる色（手本の設楽原の野と屏風の土色）。全体の彩りを四分の一落とす。
      const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
      c.setRGB(c.r + (lum - c.r) * 0.25 + 0.012, c.g + (lum - c.g) * 0.25, c.b + (lum - c.b) * 0.25 - 0.006);
    },
    // 追撃の道にも見通しを残す。脇の林は残し、道の真ん中に大木を立てない。
    clear: (x, z) => x > -45 && x < 95 || x >= 95 && x < 260 && Math.abs(z - REARGUARD.z) < 26,
    fieldStage: 'seedling',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (x < 28 || x > 58) return 0;
      if ((Math.floor(x / 11) + Math.floor(z / 16)) % 2) return 0;
      const ex = Math.min(((x % 11) + 11) % 11, 11 - ((x % 11) + 11) % 11), ez = Math.min(((z % 16) + 16) % 16, 16 - ((z % 16) + 16) % 16);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6));
    },
    // 連吾川の渡渉を扱う浅い流れ。深さは推定で、腰を越す一様な水深にはしない。
    streams: [{ pts: RENGO, w: 4.8, depth: 0.45, surfaceDrop: 0.02 }, { pts: OMIYA, w: 2, depth: 0.8, surfaceDrop: 0.45 }],
    trees: 300,
    groundedSlopeRocks: true,
    rockDrawGround: true,
    rockSlopeContact: true, // 回転後の腹と縁を描く地面へ埋め、追撃路の岩を宙へ残さない。
    curvedRockTufts: true,
    layeredNeedles: true, // 既存の枝葉の形を共用し、杉の一直線の縁を崩す。
    raggedNeedles: true, // 退き口の杉も既存の枝先の形を使い、円錐の平らな縁を崩す。
    tufts: 4200,
    // 武田の陣の丘は木を疎らに（丘に並ぶ武田の備が柵から見えるように）
    treeDensity: (x, z) => (x < -60 ? (Math.abs(z + 65) < 28 || Math.abs(z - 28) < 65 ? 0.12 : 0.65) : x > 168 ? 1 : x > 60 ? 0.12 : 0.3),
    groves: [{ x: -70, z: -40, r: 14, n: 22 }, { x: 168, z: 20, r: 16, n: 26 }, { x: 150, z: -120, r: 14, n: 20 }],
  },

  setup(rt) {
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }   // 11/1：刃の一太刀を def.cutFloor 倍に（共通の一太刀五割・六割は変えず、この戦だけ）
    rt.player.startGun = true;   // 火縄銃を持って始める（player.js が最初のコマで持ち替える）
    const W = rt.world;
    const F = rt.flags;
    SH_RT = rt;
    // 戦を出たら手放す（持ったままだと戦がまるごと残った。11/8 docs/crash_1108.md）
    rt.cleanupTasks?.add(() => { if (SH_RT === rt) SH_RT = null; });
    const openingDetail = SETTINGS.quality === 'high';
    // 持ち場の正面、川向こうの田だけに低い畦を据える。道幅と兵の通り方は保つ。
    if (openingDetail) {
      const vertices = [], indices = [];
      const ridge = (ax, az, bx, bz) => {
        const length = Math.hypot(bx - ax, bz - az), steps = Math.ceil(length / 0.7);
        const nx = -(bz - az) / length, nz = (bx - ax) / length;
        const base = vertices.length / 3;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          const lift = Math.min(1, i / 2, (steps - i) / 2);
          for (let j = -1; j <= 1; j++) {
            const px = x + nx * j * 0.48, pz = z + nz * j * 0.48;
            vertices.push(px, drawGroundAt(W, px, pz) + 0.025 + (j === 0 ? 0.24 * lift : 0), pz);
          }
          if (i) for (let j = 0; j < 2; j++) {
            const a = base + (i - 1) * 3 + j, b = a + 3;
            indices.push(a, a + 1, b, a + 1, b + 1, b);
          }
        }
      };
      ridge(29, -298, 57, -296);
      ridge(29, -253, 57, -251);
      ridge(42, -298, 43, -283);
      ridge(43, -267, 44, -252);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geo.setIndex(indices); geo.computeVertexNormals(); geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x697044 }));
      mesh.receiveShadow = true; rt.scene.add(mesh);
    }
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・夏草（def.timeslip）
    // 連吾川の川石は朝日で白い丸い塊に見えた（10/28）。濡れて苔の付いた暗い石へ。形と数は変えない。
    for (const st of W.def.streams || []) if (st.rockMesh) {
      const m = st.rockMesh.material.clone(); m.color.setHex(0x47443b); m.roughness = 0.95; st.rockMesh.material = m;
    }
    // 支度の途中で増える柵も、毎回同じ一覧から転送前に準備する。
    const beforeScenery = rt.scene.onBeforeRender;
    rt.scene.onBeforeRender = function (renderer, scene, camera, target) {
      beforeScenery.call(this, renderer, scene, camera, target);
      if (W.materialDrawPreparers) for (const prepare of W.materialDrawPreparers) prepare(renderer, scene, camera);
    };
    // 人の姿と体格は矢の更新後にも替わる。描く束へ写す直前に実寸へ戻す。
    // この戦の軍勢だけを包み、共有の形・矢の当たり・寿命は変えない。
    const batchDraw = rt.army.batchDraw;
    rt.army.batchDraw = function (camera) {
      this.syncPinnedArrowScales?.();   // 共有の側で外された時も描くのを止めない
      return batchDraw.call(this, camera);
    };
    // 坂を壁と同じ処理で抜くと、足元に白い遠景が三角形に露出する。
    // 地面は残し、視点の潜り込みは既存の地形判定へ任せる。この戦の材質だけ。
    W.terrain.material.userData.camNearSolid = true;
    // 朝の色を保ち、笠の下と黒い具足へ空からの光を少し足す。この戦だけ。
    const lookOf = W.lookOf.bind(W);
    W.lookOf = (key) => {
      const look = lookOf(key);
      if (key === 'day' || key === 'morning' || key === 'noon') {
        look.sunI *= 1.06; look.hemiI *= 1.35;
      }
      return look;
    };
    // 時刻の仕組みは設営より先に朝と昼の色を控える。その控えにも補いを渡す。
    if (W.dayClock) {
      W.dayClock.morning = W.lookOf('morning');
      W.dayClock.noon = W.lookOf('noon');
      W.dayClock.tick(0);
    }
    F.faceMats = new Map();
    // 視点直前で本人を隠す部材だけ避け、脇と前方の柵は木の実体を保つ。
    // 奥の柵と影は残し、材質の並べ替えや毎コマの複製を増やさない。
    // 材質の複製は開戦時だけ。影・当たり・壊れる区画は元のまま。
    const fadeMats = new Map();
    const nearMaterial = (source) => {
      if (fadeMats.has(source)) return fadeMats.get(source);
      const mat = source.clone(), compile = source.onBeforeCompile, key = source.customProgramCacheKey.bind(source);
      mat.onBeforeRender = source.onBeforeRender;
      mat.transparent = false; mat.depthWrite = true;
      mat.userData.camNearSolid = true; // 専用の透かしに共通の点描を重ねない。
      // 複製は userData を写し直すので、本物に替わる輪の広さ（軽い兵の形を選ぶ物差し）は元の入れ物を指したままにする。
      if (source.userData.armyU) mat.userData.armyU = source.userData.armyU;
      mat.onBeforeCompile = (sh, renderer) => {
        compile(sh, renderer);
        sh.vertexShader = 'varying vec3 vShNear;\nvarying vec2 vShProjection;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vShNear = mvPosition.xyz; vShProjection = vec2(projectionMatrix[0][0], projectionMatrix[1][1]);');
        sh.fragmentShader = 'varying vec3 vShNear;\nvarying vec2 vShProjection;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `
          vec2 shScreen = abs(vShNear.xy * vShProjection / max(0.01, -vShNear.z));
          float shEdge = smoothstep(0.22, 0.38, max(shScreen.x, shScreen.y));
          float shFront = smoothstep(2.0, 4.0, length(vShNear));
          // 画面端でも視点へ寄り過ぎた丸太を避け、柵の中から前を見渡せるようにする。
          float shFenceCover = min(smoothstep(1.25, 2.25, length(vShNear)), max(shEdge, shFront));
          vec2 shFencePixel = mod(floor(gl_FragCoord.xy), 2.0);
          float shFencePattern = (2.0 * mod(shFencePixel.x + shFencePixel.y, 2.0) + shFencePixel.y + 0.5) / 4.0;
          if (shFenceCover < shFencePattern) discard;
          #include <alphatest_fragment>
        `);
      };
      mat.customProgramCacheKey = () => key() + '_設楽原の柵の透かし';
      fadeMats.set(source, mat);
      return mat;
    };
    const groundMat = W.terrain.material, groundCompile = groundMat.onBeforeCompile;
    const groundKey = groundMat.customProgramCacheKey.bind(groundMat);
    const lowPuddles = false;
    groundMat.onBeforeCompile = (sh, renderer) => {
      groundCompile(sh, renderer);
      // 共通の泥の窪みを野一面へ並べない。設楽原だけ小さく疎らにし、
      // 実際に踏まれた所へ浅く残す。歩行・川床・他の戦の材質は変えない。
      sh.fragmentShader = sh.fragmentShader
        // 元の泥の絵にも丸い穴がある。追加の窪みだけを弱めても消えないため、
        // 同じ一回の絵の読みで粒を細かくし、土の色を混ぜて明るい縁を抑える。
        .replace('vec3 mud = texture2D(tMud, wuv * 0.26).rgb;',
          'vec3 mud = mix(dirt * vec3(0.46, 0.45, 0.43), texture2D(tMud, wuv * 0.65).rgb, 0.25);')
        .replace('ruv * vec2(1.6, 2.4)', 'ruv * vec2(3.2, 4.8)')
        .replace('mix(0.35, 1.0, trod) * (1.0 - slopeK)',
          'trod * step(0.78, clodSeed) * 0.28 * (1.0 - slopeK)')
        .replace('clodRim * 0.016 - clodHollow * 0.035', 'clodRim * 0.004 - clodHollow * 0.008');
      // 粗い地形の格子で水色を補間すると四角く光る。水の縁は地面の座標から描く。
      // 足を取る田の範囲は保ち、形・材質・毎コマの物を増やさない。
      sh.fragmentShader = `
        float shPuddle(vec2 p) {
          if (p.x <= 28.0 || p.x >= 58.0) return 0.0;
          vec2 cell = floor(p / vec2(11.0, 16.0));
          if (mod(cell.x + cell.y, 2.0) > 0.5) return 0.0;
          // 田一枚ごとに水を張り、縁の畦だけを残す（歩みの遅れる田の範囲と同じ升）。
          vec2 m = mod(p, vec2(11.0, 16.0)), e = min(m, vec2(11.0, 16.0) - m);
          float wob = sin(p.y * 0.9 + cell.x * 2.0) * 0.12 + sin(p.x * 1.3 + cell.y) * 0.1;
          float edge = min(min(e.x, e.y), min(p.x - 28.0, 58.0 - p.x)) + wob;
          return smoothstep(0.8, 1.4, edge) * ${W.field.wet ? '1.0' : '0.0'};
        }
        // 田の升の縁の畦。水の無い升も同じ畦で囲み、田の並びを見せる。
        float shAze(vec2 p) {
          if (p.x <= 27.0 || p.x >= 59.0) return 0.0;
          vec2 m = mod(p, vec2(11.0, 16.0)), e = min(m, vec2(11.0, 16.0) - m);
          float wob = sin(p.y * 0.9 + floor(p.x / 11.0) * 2.0) * 0.12 + sin(p.x * 1.3 + floor(p.y / 16.0)) * 0.1;
          float edge = min(min(e.x, e.y), min(abs(p.x - 28.0), abs(58.0 - p.x))) + wob;
          return 1.0 - smoothstep(0.35, 0.8, edge);
        }
      ` + sh.fragmentShader
        .replace('vec2 wuv = vWP.xz;', 'vec2 wuv = vWP.xz; float shPaddyWater = shPuddle(wuv);')
        // 共通の泥の窪みは各升に明るい輪を作り、湿った平場で型押しに見える。
        // この戦だけ輪の色・凹凸・水溜まり・艶をまとめて外す。小石と実際の歩行跡、
        // 虎口の不規則な泥塊・轍・まばらな蹄跡は残す。
        .replace(/float clodK = [^;]+;/, 'float clodK = 0.0;')
        .replaceAll('smoothstep(0.3, 0.8, vWater)', 'shPaddyWater')
        // 低では地面の水に空を映さず、ほかの画質でも泥の艶に留める。
        .replace('wat * 0.24 + pool * 0.2', 'wat * 0.025 + pool * 0.06')
        // 空の映り込みを外しても、濡れた土の強い鏡面光は残る。
        // 水のある田だけ艶を残し、岸と草地には広い白い光の帯を作らない。
        .replace('roughnessFactor = mix(roughnessFactor, 0.12, pool);',
          'roughnessFactor = max(roughnessFactor, mix(0.86, 0.62, shPaddyWater));')
        .replace('reflectedLight.indirectDiffuse += uSoilSky * sheen * reflectedCloud;',
          lowPuddles ? '' : 'reflectedLight.indirectDiffuse += uSoilSky * sheen * reflectedCloud;')
        .replace('vec3(0.075, 0.08, 0.06) + mud * 0.22 + grass * 0.05',
          // 田の水は濁った暗い泥水に（霧の空を映して灰の板に見えた 10/28）。
          'col * vec3(0.4, 0.4, 0.32) + mud * 0.07')
        .replace('float wat = shPaddyWater;', `float wat = shPaddyWater;
          // 水際だけ湿った泥色につなぎ、青い紙のような輪郭を消す。
          float shMudRim = smoothstep(0.0, 0.3, wat) * (1.0 - wat);
          col = mix(col, mud * vec3(0.8, 0.7, 0.55), shMudRim * 0.65);
          // 田植えから三週ほどの苗の列（天正三年五月二十一日は今の七月上旬）。水を張った田にだけ、
          // 列に並ぶ若い緑の株を地面の絵で描く。遠くは細かい縞がちらつくので、列の平均の緑に溶かす。
          vec2 shNaeP = vec2(wuv.x / 0.33, wuv.y / 0.24 + sin(wuv.x * 0.21) * 0.6);
          vec2 shNaeD = abs(fract(shNaeP) - 0.5);
          float shNae = (1.0 - smoothstep(0.1, 0.28, shNaeD.x)) * (1.0 - smoothstep(0.14, 0.34, shNaeD.y));
          float shNaeAA = 1.0 - smoothstep(0.25, 0.6, max(fwidth(shNaeP.x), fwidth(shNaeP.y)));
          col = mix(col, vec3(0.25, 0.35, 0.11), wat * mix(0.45, shNae * 0.9, shNaeAA));`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        // 地面の絵の上に土の筋と踏み跡を描く。板や毎こまの物は増やさない。
        float shFence = (1.0 - smoothstep(490.0, 505.0, abs(vWP.z)))
          * (1.0 - smoothstep(35.0, 55.0, abs(vWP.x + 12.0)));
        // 土の筋は進路に沿って途切れさせ、均等な横縞にしない。
        float shRuts = smoothstep(0.82, 0.98, sin(vWP.z * 7.0 + sin(vWP.x * 0.41) * 2.0 + macro2 * 9.0))
          * smoothstep(0.1, 0.7, sin(vWP.x * 0.77 + vWP.z * 0.23))
          * (1.0 - smoothstep(8.0, 24.0, length(vWP - cameraPosition)));
        // 足跡は小さく散らし、全ての升目に同じ輪郭を刻まない。
        vec2 shStepCell = floor(vWP.xz / vec2(2.7, 0.85));
        float shStepSeed = fract(sin(dot(shStepCell, vec2(127.1, 311.7))) * 43758.5453);
        vec2 shStep = fract(vWP.xz / vec2(2.7, 0.85)) - 0.5;
        shStep -= vec2(sin(shStepCell.y * 2.1), cos(shStepCell.x * 1.7)) * 0.22;
        float shFoot = (1.0 - smoothstep(0.65, 1.0, length(shStep * vec2(12.0, 3.2))))
          * step(0.65, shStepSeed) * shFence * (1.0 - smoothstep(8.0, 20.0, length(vWP - cameraPosition)));
        float shDitch = (1.0 - smoothstep(0.35, 1.35, abs(vWP.x - 16.6)))
          * (1.0 - smoothstep(490.0, 505.0, abs(vWP.z)));
        float shWater = shDitch * smoothstep(0.35, 0.8, sin(vWP.z * 1.7) * 0.5 + 0.5);
        diffuseColor.rgb = diffuseColor.rgb * (1.0 - shFence * shRuts * 0.16 - shFoot * 0.30);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.22, 0.20), shWater * 0.4);
        // 柵の内の野を暗い一枚の土に見せない（10/28）：夏草の青い斑と、乾いて白んだ土の斑を大きく混ぜる。
        // 斑は 10m ほどの細かさも混ぜる。足もとの十数 m が一つの斑に入って一色に見えないように。
        float shPatchN = texture2D(tMacro, vWP.xz * 0.085 + 0.71).r * 0.6 + macro2 * 0.4;
        float shSummer = smoothstep(0.5, 0.6, shPatchN) * step(vWP.x, 27.0) * (1.0 - shFoot);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.9, 1.45, 0.7) + vec3(0.03, 0.07, 0.01), shSummer * 0.7);
        float shDry = (1.0 - smoothstep(0.38, 0.46, shPatchN)) * step(vWP.x, 27.0) * (1.0 - shSummer);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.4, 1.28, 1.05) + vec3(0.06, 0.05, 0.03), shDry * 0.6);
        // 柵の内の野（持ち場の足もと）は暗い緑の一枚に沈んでいた。朝の日の当たる夏の野の明るさへ持ち上げる。
        float shInner = (1.0 - smoothstep(20.0, 27.0, vWP.x)) * smoothstep(-70.0, -50.0, vWP.x) * (1.0 - smoothstep(490.0, 505.0, abs(vWP.z)));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.3, 1.32, 1.12) + vec3(0.035, 0.035, 0.015), shInner * (0.55 + shPatchN * 0.5));
        // 野の緑が平らな一枚に見えた（10/29 15:10 採点）。二〜三 m の草叢の陰と、五十 cm の葉の粒の明暗を重ね、
        // 刈られぬ夏草の株の凹凸を色で見せる。近くほど強く、遠くは粒がちらつかないよう弱める。
        float shTuftN = texture2D(tMacro, vWP.xz * 0.42 + 0.31).r;
        float shGrainN = texture2D(tMacro, vWP.xz * 1.85 + 0.13).r;
        float shNearG = 1.0 - smoothstep(30.0, 90.0, length(vWP - cameraPosition));
        float shMeadow = step(vWP.x, 27.0) * (1.0 - shFoot);
        diffuseColor.rgb *= mix(1.0, mix(0.66, 1.14, smoothstep(0.28, 0.72, shTuftN)) * mix(0.86, 1.1, shGrainN * shNearG + 0.5 * (1.0 - shNearG)), shMeadow);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.05, 0.72), shMeadow * smoothstep(0.62, 0.8, shGrainN) * shNearG * 0.5);
        // 虎口の周囲にだけ踏み荒らしを集め、乾いた一枚の平面から湿った土へつなぐ。
        float shBattle = 0.0;
        ${MOUTHS.map((m) => `shBattle = max(shBattle, 1.0 - smoothstep(9.0, 38.0,
          length((vWP.xz - vec2(16.0, ${(m.z + 4.5).toFixed(1)})) * vec2(0.8, 1.0))));`).join('\n')}
        // 土の斑は既存の不規則な絵から拾う。周期的な正弦波を並べない。
        float shClods = (macro2 - 0.5) * (0.6 + macro * 0.8);
        float shWetSoil = shBattle * smoothstep(-0.6, 0.7, shClods);
        vec2 shHoofCell = floor(vWP.xz / vec2(1.7, 1.15));
        vec2 shHoof = fract(vWP.xz / vec2(1.7, 1.15)) - 0.5;
        shHoof -= vec2(sin(shHoofCell.y * 4.1), sin(shHoofCell.x * 2.7)) * 0.18;
        float shHoofSeed = fract(sin(dot(shHoofCell, vec2(269.5, 183.3))) * 43758.5453);
        float shHoofAngle = shHoofSeed * 6.28318;
        shHoof = mat2(cos(shHoofAngle), -sin(shHoofAngle), sin(shHoofAngle), cos(shHoofAngle)) * shHoof;
        float shHoofR = length(shHoof * vec2(12.0, 9.0));
        float shHoofMark = (1.0 - smoothstep(0.7, 1.0, shHoofR))
          * smoothstep(0.3, 0.55, shHoofR) * step(-0.015, shHoof.y)
          * step(0.72, shHoofSeed) * shBattle
          * (1.0 - smoothstep(8.0, 22.0, length(vWP - cameraPosition)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.19, 0.155, 0.105), shWetSoil * ${openingDetail ? '0.30' : '0.56'});
        ${openingDetail ? `
        // 柵の影の中も乾いた土・濡れた窪み・草の斑で分ける。絵の読みと形は増やさない。
        // 上の夏の野の shDry と名が重なり、地面の絵が作れず白い一枚に抜けていた（10/30）。
        float shDryF = shFence * smoothstep(0.30, 0.76, macro2) * (1.0 - shWetSoil * 0.7);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.39, 0.33, 0.22), shDryF * 0.36);
        ` : ''}
        diffuseColor.rgb *= 1.0 - shHoofMark * 0.34;
        // 既存の土と草の絵から、踏み倒された葉と泥塊の斑を拾う。
        float shLitter = shFence * (1.0 - shBattle * 0.65)
          * smoothstep(0.38, 0.64, grass.g - grass.r * 0.3)
          * smoothstep(0.3, 0.6, macro2);
        diffuseColor.rgb = mix(diffuseColor.rgb, grass * vec3(0.66, 0.68, 0.43), shLitter * 0.42);
        // 古い畦の草と湿った斑。既存の雑音を使い、平行な波を作らない。
        float shField = smoothstep(-58.0, -35.0, vWP.x) * (1.0 - smoothstep(100.0, 150.0, vWP.x))
          * (1.0 - smoothstep(490.0, 505.0, abs(vWP.z)));
        float shRidge = smoothstep(0.48, 0.64, macro2) * (1.0 - smoothstep(0.64, 0.78, macro2));
        float shDrain = (1.0 - smoothstep(0.3, 0.48, macro2)) * smoothstep(0.4, 0.65, macro);
        // 畦は田の端の短い跡に留める。丘まで続く等間隔の波と強い法線を作らない。
        float shFieldEnd = 1.0 - smoothstep(48.0, 65.0, vWP.x);
        float shRidgeBreak = smoothstep(0.3, 0.65, macro);
        float shEdge = shField * shFieldEnd * shRidgeBreak * (1.0 - shBattle * 0.9)
          * (1.0 - smoothstep(18.0, 40.0, length(vWP - cameraPosition)));
        float shPatch = macro2;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.23, 0.27, 0.115), shRidge * shEdge * (0.3 + shPatch * 0.3));
        diffuseColor.rgb *= 1.0 - shDrain * shEdge * 0.24;
        // 田の畦：草の生えた細い土手。
        float shAzeK = shAze(vWP.xz);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.33, 0.15) * (0.85 + macro2 * 0.3), shAzeK * 0.8);
      `).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // 色だけの足跡を浅い窪みにする。画面内の微分で、追加の絵の読みを省く。
        // 遠い川岸まで周期的な法線を足すと、平場が波打つ布のように見える。
        float shHeight = (shClods * shBattle * 0.045 - shHoofMark * 0.025 - shFoot * 0.018
          - shFence * shRuts * 0.012) * (1.0 - smoothstep(8.0, 22.0, length(vWP - cameraPosition)));
        vec3 shDx = dFdx(-vViewPosition), shDy = dFdy(-vViewPosition);
        vec3 shR1 = cross(shDy, normal), shR2 = cross(normal, shDx);
        float shDet = dot(shDx, shR1) * faceDirection;
        normal = normalize(abs(shDet) * normal - sign(shDet)
          * (dFdx(shHeight) * shR1 + dFdy(shHeight) * shR2));
      `).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.53, shWetSoil * 0.65);
        roughnessFactor = mix(roughnessFactor, 0.94, max(shLitter, shHoofMark) * 0.7);
      `).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        // 柵の影でも土の形を残す。低では空堀にも青い照り返しを足さない。
        // 柵の内の野は影でも夏の土と草の色を見せ、暗い一枚に沈めない（10/28）。
        reflectedLight.indirectDiffuse += diffuseColor.rgb * (0.10 + 0.22 * (1.0 - smoothstep(14.0, 20.0, vWP.x)))
          ${lowPuddles ? '' : '+ vec3(0.025, 0.028, 0.025) * shWater'};
        // 田の水面：朝の空の薄い灰を映す。低い角度ほど明るく、泥の穴に見せない。
        float shPaddySky = shPuddle(vWP.xz);
        if (shPaddySky > 0.001) {
          float shGraze = 1.0 - clamp(normalize(cameraPosition - vWP).y, 0.0, 1.0);
          float shRipple = 0.85 + 0.15 * sin(vWP.x * 1.9 + vWP.z * 0.7 + sin(vWP.z * 0.5) * 2.0);
          reflectedLight.indirectDiffuse += vec3(0.30, 0.31, 0.29) * shPaddySky * (0.18 + shGraze * shGraze * 0.32) * shRipple;
          // 遠くの田は早苗の列が一株ずつ見えない。列の緑を水の色に混ぜ、灰の板でなく植えた田に見せる（10/28）。
          float shFar = smoothstep(16.0, 40.0, length(vWP - cameraPosition));
          float shRow = 0.65 + 0.35 * smoothstep(0.2, 0.8, abs(fract(vWP.z / 0.8) - 0.5) * 2.0);
          reflectedLight.indirectDiffuse = mix(reflectedLight.indirectDiffuse, vec3(0.07, 0.12, 0.035) * shRow, shPaddySky * shFar * 0.7);
          reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse, reflectedLight.directDiffuse * vec3(0.75, 1.15, 0.55), shPaddySky * shFar * 0.6);
        }
      `);
    };
    groundMat.customProgramCacheKey = () => groundKey() + '_設楽原の踏み荒らし_' + lowPuddles + openingDetail;
    groundMat.needsUpdate = true;
    // 既存の流れの筋を強め、朝の照り返しが白い帯になるのを抑える。
    for (const st of W.def.streams) {
      const mat = st.mesh.material, compile = mat.onBeforeCompile, key = mat.customProgramCacheKey.bind(mat);
      // 岸だけでなく川の中央も一度調べ、地面との浅い接点を泥へつなぐ。
      // 水面の高さと渡渉用の記録は保つ。一メートル以下の間隔で岸の接点を読む。
      // 設営時だけの分割で、描く回数と毎コマの処理は増やさない。
      const oldGeo = st.mesh.geometry, src = oldGeo.attributes;
      const columns = 9, divisions = 4;
      const sourceRows = src.position.count / 2, rows = (sourceRows - 1) * divisions + 1, count = rows * columns;
      const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
      const flows = new Float32Array(count * 2), edge = new Float32Array(count), depth = new Float32Array(count);
      const indices = [];
      for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
        const i = row * columns + col, t = col / (columns - 1);
        const a = Math.floor(row / divisions) * 2, b = a + 1;
        const c = Math.min(a + 2, (sourceRows - 1) * 2), d = c + 1, along = (row % divisions) / divisions;
        for (let k = 0; k < 3; k++) {
          const start = src.position.array[a * 3 + k] * (1 - t) + src.position.array[b * 3 + k] * t;
          const end = src.position.array[c * 3 + k] * (1 - t) + src.position.array[d * 3 + k] * t;
          positions[i * 3 + k] = start + (end - start) * along;
          colors[i * 3 + k] = src.color.array[a * 3 + k] * (1 - t) + src.color.array[b * 3 + k] * t;
        }
        for (let k = 0; k < 2; k++) flows[i * 2 + k] = src.waterFlow.array[a * 2 + k] * (1 - t) + src.waterFlow.array[b * 2 + k] * t;
        edge[i] = 1 - t * 2;
        const floor = drawGroundAt(W, positions[i * 3], positions[i * 3 + 2]);
        // 長い川面の補間が描く地面へ埋まる所だけ救う。正面の細い流れを途切れさせない。
        if (openingDetail && st.pts === RENGO && Math.abs(positions[i * 3 + 2] + 275.5) < 55) {
          const centre = Math.max(0, 1 - Math.abs(1 - t * 2) / 0.72);
          positions[i * 3 + 1] = Math.max(positions[i * 3 + 1], floor + 0.16 * centre);
        }
        depth[i] = positions[i * 3 + 1] - floor;
        if (row && col < columns - 1) indices.push(i - columns, i, i - columns + 1, i - columns + 1, i, i + 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('waterFlow', new THREE.BufferAttribute(flows, 2));
      geo.setAttribute('shStreamEdge', new THREE.BufferAttribute(edge, 1));
      geo.setAttribute('shStreamDepth', new THREE.BufferAttribute(depth, 1));
      geo.setIndex(indices); geo.computeVertexNormals();
      st.mesh.geometry = geo; oldGeo.dispose();
      // 共通の水面は不透明。岸の薄さを実際に描き、透明な端は深さも書かない。
      // 水の高さ・浅瀬の判定は保ち、この戦の材質だけを変える。
      mat.transparent = true; mat.alphaTest = 0.01; mat.depthWrite = false;
      mat.color.setHex(0x2c362f); mat.roughness = 0.42; mat.envMapIntensity = 0.38;   // 霧の空を映して白い幅広の帯に見えた（10/30）。照りを細く、濁りを濃く   // 灰の道に見えた（10/28）。岸より暗い濁り水に、朝の光の照りを細く   // 柵越しの低い目で、濁った流れが空を映して川筋と分かるように（10/28）
      mat.onBeforeCompile = (sh, renderer) => {
        compile(sh, renderer);
        sh.vertexShader = 'attribute float shStreamEdge; attribute float shStreamDepth; varying float vShStreamEdge; varying float vShStreamDepth;\n' + sh.vertexShader
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n vShStreamEdge = shStreamEdge; vShStreamDepth = shStreamDepth;');
        sh.fragmentShader = 'varying float vShStreamEdge; varying float vShStreamDepth;\n' + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
            float shBankNoise = texture2D(tMacro, vWPw.xz * 0.21).r;
            float shBank = abs(vShStreamEdge) + (shBankNoise - 0.5) * 0.16;
            float shShallow = 1.0 - smoothstep(0.02, 0.22, vShStreamDepth);
            float shMud = max(smoothstep(0.4, 0.9, shBank), shShallow);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25, 0.22, 0.16), shMud * 0.65);
            // 浅瀬と岸ぎわに白い小波の筋（流れに沿って動く）。灰の板でなく流れる川に見せる。
            float shFoamN = texture2D(tMacro, vec2(vWPw.x * 0.9, vWPw.z * 0.18 - uTime * 0.12)).r;
            float shFoam = smoothstep(0.55, 0.75, shFoamN) * max(shShallow * 0.9, smoothstep(0.35, 0.6, shBank) * (1.0 - smoothstep(0.6, 0.85, shBank)));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.64, 0.60), shFoam * 0.5);
            float shRim = (shBankNoise - 0.5) * 0.12;
            diffuseColor.a *= (1.0 - smoothstep(0.58 + shRim, 0.96, shBank))
              * smoothstep(0.0, 0.12, vShStreamDepth);`);
        // 等間隔の明暗を横一杯へ並べず、既存の濃淡で短い流れに崩す。
        sh.fragmentShader = sh.fragmentShader
          .replace('sin(streamAcross * 4.8 + sin(streamAlong * 0.22 - uTime * 0.8) * 0.7)',
            '(texture2D(tMacro, vec2(streamAcross * 0.35, streamAlong * 0.12 - uTime * 0.04)).r - 0.5)')
          .replace('streamNear * 0.065', 'streamNear * 0.10')
          .replace('(0.08 + waterEdge * 0.3)', '(0.025 + waterEdge * 0.09)');
      };
      mat.customProgramCacheKey = () => key() + '_設楽原の流れ'; mat.needsUpdate = true;
      // 九列の岸と水深で仕上げた面。開戦時に共通の二列の川へ戻さない。
      // 岸の石と草も下で配置するので、共通の岸飾りを川中へ重ねない。
      st.mesh.userData.waterSurfaceReady = true;
      // 共通の川石は艶のある丸石で、朝の空を映して柵の向こうに白い丸い塊として浮いていた。
      // 濡れた暗い石の色にし、照りを消して半ば川床へ沈める。形と数は変えない。
      if (st.rockMesh) {
        const rm = st.rockMesh.material;
        rm.color.setHex(0x3f3a31); rm.roughness = 0.95; rm.metalness = 0;
        if ('envMapIntensity' in rm) rm.envMapIntensity = 0.05;
        st.rockMesh.position.y -= 0.12;
      }
    }
    // 少ない草を広い戦場へ均等に撒かず、柵の足元と追い道の脇へ寄せる。
    // 短く曲がる葉と材質を全株で共有し、開戦時だけ並べる。
    const blades = rockTuftShape(true);
    const grassMesh = new THREE.InstancedMesh(blades,
      new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide }), 720);
    const grassPose = new THREE.Object3D(), grassColor = new THREE.Color();
    let grassCount = 0;
    for (let i = 0; i < 720; i++) {
      const nearFence = i < 540, k = i % 180, mouth = MOUTHS[Math.floor(i / 180) % 3];
      // 株数は保ち、柵際の乱戦とその脇へ短い草の群落を寄せる。
      let z = mouth.z - 37 + k * 0.43 + Math.sin(i * 1.37) * 1.5;
      const x = nearFence ? -24 + (0.5 + 0.5 * Math.sin(i * 2.399)) * 52
        : 38 + (0.5 + 0.5 * Math.sin(i * 2.399)) * 122;
      // 同じ株数を寄せ道の畦へ移す。泥の中央へ均等に生やさない。
      if (!nearFence) {
        const bend = Math.sin(x * 0.045) * 0.32;
        z = (Math.round((z * 0.17 + bend) / (Math.PI * 2)) * Math.PI * 2 - bend) / 0.17
          + Math.sin(i * 1.71) * 0.8;
      }
      // 水田で大きさゼロにしていた株は束へ送らない。見える株の位置と色は元の番号で保つ。
      if (W.def.paddy(x, z) > 0.3) continue;
      // 柵の口は踏み固めた土のまま。草は進路を塞がない小さな株にする。
      grassPose.position.set(x, drawGroundAt(W, x, z) - 0.025, z);
      const size = 0.6 + (0.5 + 0.5 * Math.sin(i * 1.71)) * 0.8;
      const trampled = SB.gates.some((g) => Math.abs(z - g - 4.5) < 7);
      // 通り道は低く広がる倒れ草、脇は立つ葉。同じ株の形を使い回す。
      const spread = size * (trampled ? 1.65 : 1.25);
      grassPose.scale.set(spread, size * (trampled ? 0.16 : 0.85), spread);
      grassPose.rotation.y = i * 2.399; grassPose.updateMatrix(); grassMesh.setMatrixAt(grassCount, grassPose.matrix);
      const tone = 0.5 + 0.5 * Math.sin(i * 0.81);
      grassColor.setRGB(0.32 + tone * 0.18, 0.40 + tone * 0.13, 0.19 + tone * 0.09);
      if (trampled) grassColor.multiplyScalar(0.86);
      grassMesh.setColorAt(grassCount++, grassColor);
    }
    grassMesh.count = grassCount;
    grassMesh.receiveShadow = true;   // 10/24：草は作らない
    // 株数と並びは保ち、画面に入る草だけ同じ束へ詰める。
    W.viewCull([grassMesh], 0, Infinity, false);
    // 連吾川の岸の葦と、川向こうの田の畦（10/28）。柵の後ろ低い目から、柵越しに川筋と田の並びが分かるように。
    // 形と材質は一つずつ、開戦時に並べるだけ。毎コマの物は増やさない。
    const rengoX = (z) => {
      for (let i = 1; i < RENGO.length; i++) {
        const a = RENGO[i - 1], b = RENGO[i];
        if (z >= a[1] && z <= b[1]) return a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
      }
      return 22;
    };
    // 夏の葦：細い葉を八枚、少し開いて一株に。人の背を越える丈。
    const reedShape = (segments) => {
      const reedParts = [];
      for (let j = 0; j < 8; j++) {
        const leaf = new THREE.PlaneGeometry(0.07, 1, 1, segments), lp = leaf.attributes.position;
        const lean = 0.10 + (j % 3) * 0.08, a = j * 2.399, r = 0.05 + (j % 4) * 0.06;
        for (let k = 0; k < lp.count; k++) {
          const t = lp.getY(k) + 0.5;
          lp.setXYZ(k, lp.getX(k) * (1 - t * 0.85) + r + lean * t * t, t * (0.78 + (j % 2) * 0.22), 0);
        }
        leaf.rotateY(a); reedParts.push(leaf);
      }
      const geo = mergeGeometries(reedParts);
      for (const part of reedParts) part.dispose();
      geo.computeVertexNormals();
      return geo;
    };
    const reedGeo = reedShape(3);
    const reedSpots = [];
    for (const m of MOUTHS) {
      const ford = m.z + 4.5;
      for (let z = ford - 46; z <= ford + 46; z += 0.85) {
        if (Math.abs(z - ford) < 4) continue;   // 渡り口の浅瀬は空ける
        for (const side of [-1, 1]) {
          const n = Math.sin(z * 0.37 + side * 1.3) + Math.sin(z * 1.13 + side) * 0.6;
          if (n < -0.55) continue;   // 群れの切れ目から水面を見せる
          const x = rengoX(z) + side * (2.7 + (0.5 + 0.5 * Math.sin(z * 2.9 + side)) * 1.6);
          // 柵の側の岸は低く疎らに、向こう岸を高く。柵越しに水面が見える。
          if (side < 0 && n < 0.2) continue;
          reedSpots.push([x, z + Math.sin(z * 5.1) * 0.3, (side < 0 ? 0.9 : 1.5) + (0.5 + 0.5 * Math.sin(z * 0.71 + side * 2)) * (side < 0 ? 0.5 : 0.9)]);
        }
      }
    }
    const reeds = new THREE.InstancedMesh(reedGeo,
      new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), reedSpots.length);
    const reedPose = new THREE.Object3D(), reedColor = new THREE.Color();
    reedSpots.forEach(([x, z, h], i) => {
      reedPose.position.set(x, drawGroundAt(W, x, z) - 0.08, z);
      reedPose.scale.set(1 + h * 0.2, h, 1 + h * 0.2);
      reedPose.rotation.set(Math.sin(i * 1.7) * 0.08, i * 2.399, Math.sin(i * 2.3) * 0.08);
      reedPose.updateMatrix(); reeds.setMatrixAt(i, reedPose.matrix);
      const tone = 0.5 + 0.5 * Math.sin(i * 0.93);
      reedColor.setRGB(0.20 + tone * 0.10, 0.29 + tone * 0.08, 0.11 + tone * 0.04);
      reeds.setColorAt(i, reedColor);
    });
    rt.scene.add(reeds);
    // 三十二メートル先は葉の曲がりの節だけ省く。八枚の葉と株数・色・丈は保つ。
    const farReeds = new THREE.InstancedMesh(reedShape(1), reeds.material, reedSpots.length);
    farReeds.count = 0; farReeds.frustumCulled = false; farReeds.userData.noFreeze = true;
    reeds.userData.foliageDetailNear = 32;
    reeds.userData.farFoliage = farReeds; rt.scene.add(farReeds);
    W.viewCull([reeds], 0, Infinity, false);
    // 田の畦：草をかぶった細い土手。升の縁（11m×16m）に沿い、4m ごとに地面へ合わせて置く。
    const azeSpots = [];
    for (const m of MOUTHS) {
      const z0 = Math.floor((m.z - 40) / 16) * 16, z1 = m.z + 52;
      for (let z = z0; z <= z1; z += 16) for (let x = 28; x < 58; x += 4) azeSpots.push([x + 2, z, 0]);
      for (const x of [28, 33, 44, 55, 58]) for (let z = z0; z < z1; z += 4) azeSpots.push([x, z + 2, 1]);
    }
    // 箱でなく、上の丸い土手（半ば埋めた横倒しの円柱）。角の立った緑の板に見せない。
    // 幅広く低い土の盛り（高さ十五センチほど）にする。細く黒い丸太の格子が原一面に散り、馬防柵の一列が読めなかった（10/29 差の表）。
    const azeGeo = new THREE.CylinderGeometry(0.8, 0.8, 4.15, 9, 1, true);
    azeGeo.rotateZ(Math.PI / 2); azeGeo.scale(1, 0.24, 1); azeGeo.translate(0, -0.05, 0);
    const aze = new THREE.InstancedMesh(azeGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), azeSpots.length);
    azeSpots.forEach(([x, z, along], i) => {
      reedPose.position.set(x, drawGroundAt(W, x, z), z);
      reedPose.rotation.set(0, along ? Math.PI / 2 : 0, 0);
      reedPose.scale.set(1, 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(i * 1.9)), 1);
      reedPose.updateMatrix(); aze.setMatrixAt(i, reedPose.matrix);
      const tone = 0.5 + 0.5 * Math.sin(i * 0.77);
      reedColor.setRGB(0.40 + tone * 0.05, 0.38 + tone * 0.05, 0.25 + tone * 0.03);   // 草の株の下は土の色。周りの田より少し明るい草土で、暗い丸太の筋に見せない
      aze.setColorAt(i, reedColor);
    });
    aze.receiveShadow = true;
    // 11/6 fixc1721（八1）：横倒しの円柱の畦は、遠くから茶色の角ばった板が並ぶように見えた。畦は地面の絵（shAze）と草の株だけで見せる
    // 畦の肩に夏草の株を（葦と同じ形を低く使い回す。描くのは一回だけ）。
    const azeGrass = new THREE.InstancedMesh(reedGeo, reeds.material, azeSpots.length);
    azeSpots.forEach(([x, z, along], i) => {
      const o = Math.sin(i * 2.71) * 1.6, gx = along ? x : x + o, gz = along ? z + o : z;
      const h = 0.38 + 0.3 * (0.5 + 0.5 * Math.sin(i * 1.31));
      reedPose.position.set(gx, drawGroundAt(W, gx, gz) + 0.06, gz);
      reedPose.scale.set(1.5, h, 1.5); reedPose.rotation.set(0, i * 2.399, 0);
      reedPose.updateMatrix(); azeGrass.setMatrixAt(i, reedPose.matrix);
      const tone = 0.5 + 0.5 * Math.sin(i * 1.13);
      reedColor.setRGB(0.26 + tone * 0.12, 0.33 + tone * 0.08, 0.13 + tone * 0.04);
      azeGrass.setColorAt(i, reedColor);
    });
    rt.scene.add(azeGrass);
    W.viewCull([azeGrass], 0, Infinity, false);
    // 植えて間もない早苗の列（旧暦五月二十一日・田植えの後）。灰の水の板でなく、水を張った田に見せる。
    // 一株は細い葉三枚、八株を一列に合わせた形を使い回す。開戦時に並べるだけ。
    const naeParts = [];
    for (let s = 0; s < 8; s++) for (let j = 0; j < 3; j++) {
      const leaf = new THREE.PlaneGeometry(0.06, 1, 1, 1), lp = leaf.attributes.position;
      for (let k = 0; k < lp.count; k++) {
        const t = lp.getY(k) + 0.5;
        lp.setXYZ(k, lp.getX(k) * (1 - t * 0.8) + 0.07 * t * t, t * (0.42 + (j % 2) * 0.1), 0);
      }
      leaf.rotateY(j * 2.094 + s * 0.7);
      leaf.translate(s * 0.62, 0, Math.sin(s * 2.3) * 0.04);
      naeParts.push(leaf);
    }
    const naeGeo = mergeGeometries(naeParts);
    for (const part of naeParts) part.dispose();
    naeGeo.computeVertexNormals();
    const inPaddy = (x, z) => {
      if (x < 28.6 || x > 57.4) return false;
      if ((Math.floor(x / 11) + Math.floor(z / 16)) % 2) return false;
      const ex = Math.min(((x % 11) + 11) % 11, 11 - ((x % 11) + 11) % 11), ez = Math.min(((z % 16) + 16) % 16, 16 - ((z % 16) + 16) % 16);
      return Math.min(ex, ez) > 1.1;
    };
    const naeSpots = [];
    for (const m of MOUTHS) {
      const z0 = Math.floor((m.z - 40) / 16) * 16, z1 = m.z + 52;
      for (let z = z0 + 0.35; z < z1; z += 0.8) for (let x = 28.6; x < 57.4; x += 5.2) {
        if (inPaddy(x, z) && inPaddy(x + 4.4, z)) naeSpots.push([x, z]);
      }
    }
    const nae = new THREE.InstancedMesh(naeGeo,
      new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), naeSpots.length);
    naeSpots.forEach(([x, z], i) => {
      reedPose.position.set(x, drawGroundAt(W, x + 2.2, z) - 0.03, z);
      reedPose.rotation.set(0, Math.sin(i * 1.7) * 0.02, 0);
      reedPose.scale.set(1, 0.9 + 0.25 * (0.5 + 0.5 * Math.sin(i * 0.61)), 1);
      reedPose.updateMatrix(); nae.setMatrixAt(i, reedPose.matrix);
      const tone = 0.5 + 0.5 * Math.sin(i * 0.37 + Math.floor(z / 16));
      reedColor.setRGB(0.26 + tone * 0.08, 0.50 + tone * 0.1, 0.10 + tone * 0.03);
      nae.setColorAt(i, reedColor);
    });
    rt.scene.add(nae);
    W.viewCull([nae], 0, Infinity, false);
    // 連吾川の岸の丸石は、柵の向こうで白い丸い塊に見えていた。岸には置かず、追い道の脇だけに散らす。
    const banks = [];
    // 追い道の脇にも同じ石を散らす。道の中央と田は空ける。
    for (let i = 0; i < 72; i++) {
      const z = 24 - i * 5, x = 100 + (0.5 + 0.5 * Math.sin(i * 2.399)) * 165;
      banks.push([x, z, 0.18 + (0.5 + 0.5 * Math.sin(i * 1.71)) * 0.24]);
    }
    const stones = new THREE.InstancedMesh(rockShape(1, true, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide }), banks.length);
    const stoneMatrix = new THREE.Matrix4();
    banks.forEach(([x, z, r], i) => {
      stoneMatrix.makeScale(r * 1.3, r * 0.6, r);
      stoneMatrix.setPosition(x, W.heightAt(x, z) + r * 0.2, z); stones.setMatrixAt(i, stoneMatrix);
    });
    groundRocks(W, stones); rt.scene.add(stones);
    // 三十二メートル先の小石は割れ目だけ省き、本数・位置・色を保つ。
    // 既存の草木の距離切替で詰め、近づけば元の形と影へ戻す。
    const farStones = new THREE.InstancedMesh(rockShape(1, true, 0), stones.material, banks.length);
    farStones.count = 0; farStones.receiveShadow = true; farStones.frustumCulled = false;
    farStones.userData.noFreeze = true;
    stones.userData.foliageDetailNear = 32;
    stones.userData.farFoliage = farStones; rt.scene.add(farStones);
    // 川岸から追い道までの石を、画面の外も全て描いていた。
    W.viewCull([stones], 0, Infinity, false);
    // 浅い水面をさらに下げると粗い地面に埋まる。幅を格子に届かせ、膝以下の流れを残す。
    // 遠景の足元も、四隅の平均ではなく描いている地面の三角形に合わせる。
    // この戦の世界だけに付ける。形・材質は使い回し、毎コマの並べ直しはしない。
    const addDistantArmy = W.addDistantArmy.bind(W);
    W.addDistantArmy = (o) => {
      // 少人数の控えも袖と草摺のある既存の形へ。遠い大軍の細部は増やさない。
      const smallGuard = o.team === 0 && o.count > 0 && o.count <= 48 && !o.people;
      if (smallGuard) o = { ...o, near: true, detailPerSoldier: true,
        detailMiddle: o.detailMiddle ?? 48 };
      const h = addDistantArmy(o);
      // 視野の外で形を作らなかった空の軍勢（emptyDistantArmy）。下の書き込みで支度を止めない。
      if (!h.army?.body) {
        if (h.army && !h.army.U) h.army.U = { uNear: { value: 0 }, uRealNear: { value: 0 }, uSplitR: { value: new THREE.Vector3() } };
        return h;
      }
      if (smallGuard) {
        h.army.U.uSplitR.value.x = 28;
        h.army.body.userData.soldierDetailNear = 28;
      }
      // 手前十メートルは本物の兵へ任せ、撮り方で簡略な控えを露出させない。
      if (o.team === 0 && h.army) h.army.U.uNear.value = 10;
      if (h.army?.parts?.shade) h.army.parts.shade.visible = false;   // 影の板は無い時もある（iw8c_ground_floaters 以後。無いと戦が始まらなかった）
      for (const m of h.children) if (m.isInstancedMesh) {
        const mat = m.material;
        if (mat.userData.shGrounded) continue;
        mat.userData.shGrounded = true;
        const compile = mat.onBeforeCompile;
        const key = mat.customProgramCacheKey.bind(mat);
        mat.onBeforeCompile = (sh, renderer) => {
          compile(sh, renderer);
          // 柵の影でも肌・袖・胴の色を残す。灯りや描く束を増やさず、この戦の控えだけに照り返しを補う。
          if (o.team === 0 && mat.vertexColors && !mat.map) {
            sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>',
              'outgoingLight += diffuseColor.rgb * 0.18;\n#include <opaque_fragment>');
          }
          sh.vertexShader = sh.vertexShader.replace('gl_Position = projectionMatrix * mvPosition;',
              'gl_Position = max(abs(aWF.x), abs(aWF.z)) > uHP.x ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mvPosition;');
        };
        mat.customProgramCacheKey = () => key() + '_設楽原の足元';
      }
      return h;
    };
    // 時間切れの直前と帰り支度中は敵が退く。位置を共有し、攻撃の途中でも刃を引く。
    W.def.combatSpace = (army, u) => u.team === 1 && (F.chaseCease || F.ending) ? ESCAPE : null;
    F.fallenHorses = [];
    // この戦の組頭は一度に一つの下知だけ。共通ファイルの台詞もここで束ねる。
    const say = rt.say.bind(rt);
    const bark = rt.bark.bind(rt);
    // 独立した矢の札を重ねず、任務と同じ知らせ欄で危険を一件だけ伝える。
    rt.army.hooks.onArrowRain = (rain, under) => {
      if (!under || rt.t < 5 || rt.over || rt.ended || !rt.player.u.alive) return;
      F.rainNoticeUntil = Math.max(F.rainNoticeUntil || 0, rt.t + rain.T - rain.t + 0.4);
      rt.hud.notices.push('矢が降る。横へ走れ', 110, Math.max(0.5, rain.T - rain.t + 0.4), 'warn',
        () => !rt.over && !rt.ended && rt.player.u.alive && rain.t < rain.T + 0.4 &&
          Math.hypot(rt.player.u.pos.x - rain.x, rt.player.u.pos.z - rain.z) < rain.r + 4);
    };
    rt.bark = (text, warn) => {
      // 11/6 fixc1721（二2）：設楽原に横槍の場面は無い。共通の『横槍が入った』の声は出さない
      if (/横槍/.test(text)) return;
      text = shGuardVoice(rt, text);
      // 落ちる矢を知らせている間は、同じ危険の声を別の札にしない。
      if (/矢が来る|矢じゃ|矢の雨|笠を傾け|矢が降る/.test(text) && rt.t < (F.rainNoticeUntil || 0)) return;
      // 騎馬を止めた同じ出来事は言い回しにかかわらず一枚の札にする。
      if (/騎馬を槍衾|馬が止まった|馬が棹立ち|槍の穂先に馬|騎馬が柵|馬が柵|柵の前で馬/.test(text)) text = '騎馬が止まった！　槍で受けよ！';
      // 一隊の後退を全軍の退却と取り違えず、追撃の下知と両立させる。
      if (F.pursuit && !F.ending && text === '味方の兵が退き始めた') text = '味方の一隊が下がった。追手は組と進め';
      bark(text, warn);
    };
    rt.say = (who, text, dur = 4) => {
      if (/横槍/.test(text)) return;
      text = shGuardVoice(rt, text);
      if (F.checkingChaseEnd && /追い切れぬ。深追い/.test(text)) return;
      // 道中で殿が反撃している間は、前へ走らせる声より槍で受ける下知を優先する。
      if (shChaseCounter(rt)
          && /印の方へ東へ追え|東の印へ進め。味方と合流して追え|川を渡れ！|槍を捨てて逃げるぞ/.test(text)) {
        text = '敵が振り向いた。仲間と並び、槍で止めよ！';
      } else if (F.pursuit && /槍を捨てて逃げるぞ/.test(text)) {
        text = '馬場隊が退くぞ。仲間と退き道の印へ進め！';
      }
      // 退き口に着いた声も、選んだ攻め方と札に揃える。
      if (F.pursuit && /^馬場の殿が槍を揃えた！/.test(text)) text = F.dpMem?.shiSide && !F.rearFlanked
        ? '馬場隊じゃ！　仲間と横へ回り、槍で突け！'
        : '馬場隊じゃ！　仲間と並び、槍で突け！';
      // 長く留まった時の呼び掛けも今の段へ揃え、殿に着いた兵を東へ走らせない。
      if (F.pursuit && /印の方へ東へ追え|東の印へ進め。味方と合流して追え|川を渡れ！/.test(text)) {
        const at = F.rearGuidePoint, p = rt.player.u.pos;
        text = F.tsuigeki?.stage === 3 ? (F.dpMem?.shiSide && !F.rearFlanked
          ? '仲間と馬場隊の横へ回れ！'
          : at && Math.hypot(p.x - at.x, p.z - at.z) > 12
            ? '仲間と馬場隊の旗へ進め！' : 'ここで仲間と並び、馬場隊へ槍を向けよ！')
          : F.tsuigeki?.stage === 1 ? '浅瀬を渡れ。向こう岸の印へ進め！'
          : F.tsuigeki?.stage === 2 ? '退く馬場隊の印へ。仲間と進め！'
          : '柵の口の印へ進め。仲間と柵を抜けよ！';
      }
      if (F.ending && !/^勝ちじゃ/.test(text) && !(F.epilogue && who === '語り')) return;
      // 決着後は戦の時刻が止まる。間を空けた語りを待ち行列へ戻さない。
      if (F.ending && F.epilogue && who === '語り') rt._sayGate = rt.t;
      if (who === '組頭' && !/^勝ちじゃ/.test(text)) {
        // 後退・合図・追撃へ変わった声は、直前の待機の声で間引かない。
        // 同じ文の八秒制限と札の三枠は、共通の知らせの仕組みに任せる。
        const orderKey = `${rt.phase}:${F.wave}:${!!F.pendingWave}:${!!F.cur?.withdrew}:${!!F.overrunShown}:${!!F.signalPreparing}:${!!F.trap}:${!!F.waveRest}:${F.tsuigeki?.stage ?? -1}:${shChaseCounter(rt)}`;
        if (F.leaderOrderKey === orderKey && rt.t < (F.leaderNextAt || 0)) return;
        F.leaderOrderKey = orderKey;
        F.leaderNextAt = rt.t + Math.max(4, dur);
      }
      say(who, text, dur);
    };
    F.holdFlag = nobori(W, -12, MOUTHS[0].z + 10.5, scenarioKey() === 'oda' ? 'oda' : 'tokugawa', 4.5);
    F.holdFlag.visible = false; rt.scene.add(F.holdFlag);
    F.fence = [];
    const fenceStart = rt.scene.children.length;
    // 携帯で描く地面は歩行用より粗い。丸太と土の根元を実際の面へ据える。
    // 柵を作る間だけ高さの読み口を替え、道・当たり・地面の頂点数は保つ。
    const fenceWorld = Object.create(W);
    fenceWorld.heightAt = (x, z) => drawGroundAt(W, x, z);
    F.fenceGround = fenceWorld;
    const fenceRt = { world: fenceWorld, army: rt.army, scene: rt.scene };
    // 10/31 iPhone の記憶：口から百メートル先の間の柵は、杭ごと・横木ごとの縄の巻き（一区画で二千六百頂点）を省く。
    //   斬り合う三つの口の前（前後九十六メートル）は交差の杭と縄を保つ。
    const plainWorld = Object.create(fenceWorld);
    plainWorld.def = { ...W.def, bobosakuCrossed: false };
    const plainRt = { ...fenceRt, world: plainWorld };
    let edge = SB.z0;
    for (const mouth of MOUTHS) {
      const z0 = mouth.z - 96, z1 = mouth.z + 96;
      // 交戦口は六メートル、間の柵は三十メートル単位でまとめ、壊せる区画の増え方を抑える。
      if (edge < z0) buildBobosaku(plainRt, { x0: SB.x0, z0: edge, z1: z0, gap: SB.gap, segLen: 30, facing: 1 }).forEach((f) => F.fence.push(f));
      F.fence.push(...buildBobosaku(fenceRt, { x0: SB.x0, z0, z1, gap: SB.gap, gates: [mouth.z], facing: 1 }));
      edge = z1;
    }
    if (edge < SB.z1) F.fence.push(...buildBobosaku(plainRt, { x0: SB.x0, z0: edge, z1: SB.z1, gap: SB.gap, segLen: 30, facing: 1 }));
    // 10/31 iPhone の記憶：馬防柵は口ごとに一つの束（三十八万頂点）。一区画が倒れる 0.8 秒のあいだ毎コマ傾けると、
    //   そのたびに束を丸ごと書き直して送り直していた（三十秒で数百 MB の屑）。倒れる間の傾きは 0.3 ずつ・倒れ切りだけ書く。
    const fenceSet = new Set(F.fence), army = rt.army, tilt = army.structTilt;
    army.structTilt = function (st, ang) {
      if (fenceSet.has(st) && ang < 1.349 && Math.abs(ang - (st._tiltW ?? -9)) < 0.3 && this.falling?.some((q) => q.s === st)) return true;
      if (fenceSet.has(st)) st._tiltW = ang;
      return tilt.call(this, st, ang);
    };
    for (let i = fenceStart; i < rt.scene.children.length; i++) rt.scene.children[i].traverse((m) => {
      if (m.isMesh && m.material) {
        m.material = nearMaterial(m.material);
        // 結合した柵は大きな球で囲まれる。視点が球の内でも束ごと消さず、近い面だけ透かす。
        m.userData.camSurfaceFade = true;
      }
    });
    tagZones(F.fence, ZONES);
    shFenceFoot(rt, F.fence, F.fenceGround);
    // 三列の虎口が重なる所を道筋に使う。遊び手の頭に古い座標を残さない。
    F.fenceRoute = { gates: SB.gates, offset: 4.5, rearX: SB.x0 - 2 * SB.gap - 6, frontX: SB.x0 + 6 };
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { fence: 'HIST_A', tripleFence: 'HIST_B', rengoRiver: 'HIST_A', honjinOda: 'HIST_B', honjinTokugawa: 'HIST_B', takedaWaves: 'GAME_C', fenceTrap: 'GAME_C', dorui: 'HIST_B', orderDelay: 'GAME_C', footFirst: 'GAME_C' };
    // 三重目の柵の後ろの土盛りと、前の浅い空堀は地形（height）だけで作る。
    F.broken = 0;
    // 総勢は戦後の解説へ。足元の討死から全軍の残数を推定して知らせない。
    // 織田家編では、織田の鉄砲奉行（前田利家）の下の足軽として柵の内に立つ。戦の流れは同じで、上役・家・持ち場の旗だけ替わる
    const oda = scenarioKey() === 'oda' && !rt.G.lord;
    F.oda = oda;
    F.boss = oda ? '前田利家' : '大久保忠世';
    F.canLead = rt.G.lord || rt.G.rank >= 1;
    F.canGun = rt.G.lord || rt.G.rank >= 4;
    F.noticePt = { x: 0, z: 0 };
    F.voice = '組頭';
    const odaZ = 190;   // これより北（-z）は織田の持ち場（通説どおり織田が北寄り、徳川が南）
    // 鉄砲組：一列目の柵のすぐ内。号令があるまで撃たない
    F.guns = [];
    // 11/9 仕様（鉄砲の密度）：口ごとに五組。本人の近く（軽い兵を描かない 150m の内）を本物の鉄砲兵で厚くする。左右へ三十メートルずつ並ぶ
    for (const mouth of MOUTHS) for (let i = 0; i < (mouth === MOUTHS[2] ? 3 : 5); i++) {   // 竹広（本人が行かない徳川の口）は三組のまま
      const z = mouth.z + (i - 2) * 13;
      // 各組四挺。傷を人数で割らず、三つの口に本物の射手を残す。
      const gunN = 7;   // 11/9 設楽原の仕様（鉄砲の密度が最重要）：一組四挺から七挺へ。三組で一つの口に二十一挺
      F.guns.push(allyGroup(rt, { faction: z < odaZ ? 'oda' : 'tokugawa', name: mouth === MOUTHS[0] ? '野々村の鉄砲組' : mouth === MOUTHS[1] ? (['佐々の鉄砲組', '前田の鉄砲組', '塙の鉄砲組'][i] || '柳田前の鉄砲組') : mouth.name + 'の鉄砲組', fixed: true, fullStrength: true, noGuard: true, anchor: { x: SB.x0 - 2.4 - (i % 3) * 1.5, z }, facing: Math.PI / 2, width: gunN > 4 ? 12 : 8, spacing: gunN > 4 ? 1.4 : 2, ranks: 1, aggro: 44, holdFire: true, dmgMult: 0.8 }, [{ type: 'gun', n: gunN }]));
      if (mouth === MOUTHS[0]) F.guns[F.guns.length - 1]._fieldWait = true;
    }
    // 五人の鉄砲奉行は、自分の備の控えとともに持ち場に残る。
    F.officers = [];
    for (const [name, x, z, fac] of ALLIED_POSTS.slice(2, 7)) {
      const q = allyGroup(rt, { faction: fac, name: name + 'の控え', fixed: true, fullStrength: true, noGuard: true, anchor: { x, z }, facing: Math.PI / 2, width: 6, aggro: 6, formation: 'yari' },
        [{ type: 'busho', n: 1, o: { name, invuln: true } }, { type: 'samurai', n: 1 }]);
      // 柵から離れた奉行の控えに供回りを足さない（本物の兵の枠を柵際の鉄砲へ回す）
      q.noRetinue = true;
      // 控えは奉行と侍二人だけ残す（共通の付き人で十五人になっていた）。枠は柵際の鉄砲組へ回す
      for (const u of q.units.slice(3)) {
        if (u.name) continue;
        if (u.mesh) rt.scene.remove(u.mesh);
        const ai = rt.army.units.indexOf(u); if (ai >= 0) rt.army.units.splice(ai, 1);
        u.alive = false; u.gone = true;
      }
      q.units = q.units.filter((u) => !u.gone);
      F.officers.push(q);
      if (name === F.boss) F.okubo = q.units[0];
    }
    if (!F.okubo) {
      const q = allyGroup(rt, { faction: 'tokugawa', name: '大久保忠世の控え', fixed: true, fullStrength: true, noGuard: true, anchor: { x: -95, z: 390 }, facing: Math.PI / 2, width: 6, aggro: 6, formation: 'yari' },
        [{ type: 'busho', n: 1, o: { name: '大久保忠世', invuln: true, horse: true } }, { type: 'samurai', n: 2 }]);
      F.officers.push(q); F.okubo = q.units[0];
    }
    // 列を機械的に回さず、別の組が弾込めの間を補う。
    F.bands = assignBands(F.guns);
    ST_WALL.install(rt, { SB, MOUTHS, ZONES });   // 鉄砲の壁（shitaragahara/teppo_wall.js）
    for (const q of F.guns) q.fireArc = Math.PI * 80 / 180;
    F.hudBands = null; F.hudZone = null;
    // 槍の組：動く一組と、南北の虎口に残る守り。大将本人を連れ回さない。
    const ok = allyGroup(rt, { faction: 'oda', name: '大宮前の槍組', fixed: true, fullStrength: true, noGuard: true, yariRanks: 3, anchor: { x: ALLIED_POSTS[1][1], z: ALLIED_POSTS[1][2] }, facing: Math.PI / 2, width: 16, aggro: 6, formation: 'yari', order: 'hold' },
      // 滝川一益本人は持ち場の備（旗本に囲まれる）に残し、動く槍組は名の無い侍大将が率いる
      [{ type: 'busho', n: 1, o: { name: '侍大将', invuln: true, horse: true, weapon: 'spear' } }, { type: 'ashigaru', n: 7 }]);
    F.sengoku = ok.units[0];
    F.spears = [ok];
    for (const [z, fac] of [[MOUTHS[0].z + 4.5, 'oda'], [MOUTHS[1].z + 4.5, 'oda'], [42, 'oda'], [MOUTHS[2].z + 4.5, 'tokugawa']]) {
      F.spears.push(allyGroup(rt, { faction: fac, name: '槍組', fixed: true, fullStrength: true, noGuard: true, anchor: { x: z === 42 ? SB.x0 - 2 * SB.gap - 1 : SB.x0 - 2, z }, facing: Math.PI / 2, width: 16, aggro: 6, formation: 'yari', order: 'hold' },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: Math.abs(z) < 60 ? 6 : 3 }]));
    }
    // 予備隊（長篠・設楽原 統合版 37・45 章）：柵の後ろに控え、いちばん危ない区画へ自動で動く・向き直る（reserveTick が毎コマ判断）
    F.reserve = allyGroup(rt, { faction: oda ? 'oda' : 'tokugawa', name: '予備の槍組', fixed: true, fullStrength: true, noGuard: true, anchor: { x: SB.x0 - 2 * SB.gap - 5, z: 0 }, facing: Math.PI / 2, width: 14, aggro: 8, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 }]);
    F.spears.push(F.reserve);
    // 柵の守りは敗走の連鎖で消えない。傷と討死は残し、援護へ戻る時を作る。
    for (const q of F.spears) { q.defMult = 1.6; q.noRout = true; }
    const n = Math.min(30, (RANKS[rt.G.rank] || RANKS[0]).squad);
    // 設楽原は鉄砲の見せ場：組の中身を城下・出陣前で決めていなければ（makeSquad の側で kumi が優先される）、
    //   既定で三分の一ほどを鉄砲にして持たせる（柵の内で鉄砲隊を率いる役目）
    F.bigGun = n ? Math.max(1, Math.round(n / 3)) : 0;
    if (n) rt.makeSquad({ x: SB.x0 - 2 * SB.gap - 4, z: SB.gates[1] + 8 }, Math.PI / 2, F.bigGun ? [{ kind: 'spear', n: n - F.bigGun }, { kind: 'gun', n: F.bigGun, ranks: 2 }] : [{ kind: 'spear', n }]);
    // 守兵は遠くなっても消さない。新手も初めから置き、枠のための退場を使わない。

    // 本物の列の左右と奥は、同じ向きの軽い鉄砲・槍の列でつなぐ。
    // 開戦時に一度だけ並べる。南北の柵全体を三列でつなぎ、中央の槍だけ奥へ厚くする。
    // 槍の控えは西へ寄せる。持ち場を結ぶ道と、押し返す奥の柵（x=-21）を空ける。
    // 虎口と本物の兵の足もとは空け、兵の判断処理は増やさない。
    const guardUnits = [...F.guns, ...F.spears, ...F.officers].flatMap((g) => g.units);
    for (const fac of ['oda', 'tokugawa']) for (const kind of ['gun', 'spear']) for (const rank of kind === 'gun' ? [0, 1, 2] : [0]) {
      const people = [], rows = kind === 'gun' ? [11.6 - rank * 1.5] : [-40, -43, -46, -49, -52, -55, -58, -61, -64, -67];
      for (const x of rows) for (let z = SB.z0 + 2; z <= SB.z1 - 2; z += 2.4) {
        if (kind === 'spear' && x < -46 && Math.abs(z) > 94) continue;
        if ((z < odaZ ? 'oda' : 'tokugawa') !== fac) continue;
        const field = true, column = Math.round((z - SB.z0 - 2) / 2.4);
        // 槍の控えは七人幅の備の間に一人分の通り道を残す。射手の列は切らない。
        if (kind === 'spear' && column % 8 === 7) continue;
        const block = Math.floor(column / 8), row = Math.round((-40 - x) / 3);
        const dx = kind === 'spear' ? Math.sin(block * 2.17 + row * 0.73) * 0.8 + Math.sin(column * 1.91 + row) * 0.22 : 0;
        const dz = kind === 'spear' ? Math.sin(block * 1.37 + row * 0.31) * 0.45 + Math.cos(column * 2.3 + row) * 0.16 : 0;
        // 三列の柵を通る道は z+4.5 が中心。列をずらした後の位置でも道と本物の兵を避ける。
        if (SB.gates.some((g) => Math.abs(z + dz - (g + 4.5)) < 6.5)) continue;
        if (guardUnits.some((u) => Math.hypot(u.pos.x - x - dx, u.pos.z - z - dz) < 3.2)) continue;
        people.push({ x: x + dx, z: z + dz, k: kind, facing: Math.PI / 2 + (kind === 'spear' ? Math.sin(block + row * 0.4) * 0.09 : 0),
          // 長槍の長さは保ち、前後の列で重ねる。背旗は列をまたいで筋を通す。
          ex: kind === 'spear' && field ? 1.5 + Math.round((-40 - x) / 3) * .025 : kind === 'spear' ? 1.2 : 0,
          flag: field ? (column % 3 === 0 ? 1 : 0) : people.length % 3 === 0 ? 1 : 0 });
      }
      const h = W.addDistantArmy({ people, kind, team: 0, mon: fac, flag: fac,
        fieldRanks: kind === 'spear', // 控えの長槍は同じ傾きで支え、隣の列の頭上で交差させない。
        near: true, detailPerSoldier: true, detailMiddle: 72,
        armor: nagashinojo.kit.ARMOR[fac], facing: Math.PI / 2, host: false, seed: 5750 + (fac === 'oda' ? 0 : 2) + (kind === 'gun' ? 0 : 1) });
      // 射手の形は近くでも残す。本物を重ねない範囲だけ、三列をつなぐ。
      if (kind === 'gun') { h.army.U.uRealNear = { value: 3.5 }; h.army.noWake = true; }
      // 槍の控えも一人ずつ形を選ぶ。長い列全体を遠景の棒状の形へ替えない。
      else h.army.U.uRealNear = { value: 12 };
      // パソコンの近い控えは、顔・袖・草摺のある形を二十八メートルまで保つ。
      // 兵ごとの切り替えの上限にも同じ距離を渡す。人数と本物へ替わる範囲は保つ。
      h.army.U.uSplitR.value.x = 28;
      h.army.body.userData.soldierDetailNear = 28;
      // 柵内の控えも近い者から本物へ替え、列を守ったまま遠い枠を回す。
      h.army.people = false;
      h.army.jinkeiGuard = true;
      // 近い控えの形は共通の距離切り替えに任せ、厚みのある姿を保つ。
      if (kind === 'gun') for (const q of F.guns) if ((q.anchor.z < odaZ ? 'oda' : 'tokugawa') === fac) {
        if (F.guns.indexOf(q) % 3 === rank) q.shRow = h;
      }
    }

    // 家康は弾正山の南、信長は西の奥の茶臼山。自分の組は前田・佐々の持ち場を保つ。
    const KT = nagashinojo.kit, A = KT.ARMOR;
    const fieldMelee = SETTINGS.quality === 'high';
    // 虎口そのものは本物の兵に任せ、外と内の柵際を軽い押し合いの帯でつなぐ。
    // 形と材質は既存の合戦と共用し、ここから本物の兵を起こさない。
    F.frontBands = [];
    // 別の帯でも近くの同じ声を重ね続けない。打ち合いと息の枠は分けて使い回す。
    F.frontSoundUntil = { voice: 0, contact: 0 };
    for (const mouth of MOUTHS) for (const inner of [false, true]) for (const side of [-1, 1]) {
      const z = mouth.z + 4.5 + side * 18;
      const x = inner ? SB.x0 - 2 * SB.gap : SB.x0;
      // 同じ人数を最初から描き、両脇で槍が届くまでの半歩だけ違える。
      // 接敵後の間隔・手数・討死の割合は保つ。元より遠くは離さない。
      const approachGap = fieldMelee ? 5.4 + Math.sin(F.frontBands.length * 2.39996) * 0.6 : 6;
      // 遠い帯は形と音の時計がまだない。出足の間は設定で渡し、起きた時から数える。
      const beat = (F.frontBands.length * 0.618034) % 1;
      const clash = W.addClash({ x, z, facing: Math.PI / 2, w: 12, bw: 6,
        gap: 3.6, gap0: approachGap, maxDrift: 0, noRout: true, noWake: true, host: false,
        killRate: 0.12, nearHide: 12, seed: 5860 + F.frontBands.length,
        // 高だけ、構えから突いて戻し、同じ場所・背丈のまま膝から倒れる。
        // 雨上がりは既存の泥粒を使い、敗走は知らせの届いた塊からほどく。
        measuredMelee: fieldMelee, groundedMelee: fieldMelee, weightedMelee: fieldMelee, contactMelee: fieldMelee,
        soundDelay: fieldMelee ? 0.4 + beat * 2 : 1,
        shoutDelay: fieldMelee ? 3 + beat * 8 : 4,
        // 見えている乱戦の位置から、押す声・息・崩れる声を鳴らす。
        play: (kind, pos, vol) => {
          if (!clash.mesh.visible || F.ending) return;
          if (fieldMelee) {
            const voice = kind === 'eshout' || kind === 'umeki' || kind === 'soldierBreath';
            const contact = kind === 'clash' || kind === 'parry' || kind === 'bodyLand';
            if (voice || contact) {
              const key = voice ? 'voice' : 'contact';
              // 遠い音で近い一息の枠を使わない。捨てた音を後からまとめて鳴らさない。
              const p = rt.player.u.pos;
              if ((pos.x - p.x) ** 2 + (pos.z - p.z) ** 2 < 40 * 40) {
                if (F.frontSoundUntil[key] > rt.t) return;
                F.frontSoundUntil[key] = rt.t + (voice ? 0.32 + beat * 0.14 : 0.07);
              }
            }
          }
          rt.army.play(kind, pos, vol);
        },
        A: { team: 0, flag: mouth.z < odaZ ? 'oda' : 'tokugawa', armor: A.oda, count: 48 },
        B: { team: 1, flag: 'takeda', armor: A.takeda, count: 48 } });
      clash.A.U.uRealNear = { value: 12 }; clash.B.U.uRealNear = { value: 12 };
      clash.mesh.visible = false;
      // 内側の騎馬は三重の口の重なる道を使い、閉じた柵を横切らない。
      const horseZ = inner ? mouth.z + 4.5 + side * 0.4 : z;
      const horses = W.addDistantArmy({ x: inner ? 38 : 52, z: horseZ, w: inner ? 2 : 10, d: 8, count: 12,
        team: 1, kind: 'cavalry', flag: 'takeda', facing: -Math.PI / 2,
        near: true, detailPerSoldier: true, detailMiddle: 48,
        host: false, seed: 5870 + F.frontBands.length });
      horses.army.noWake = true; horses.army.shScenery = true; horses.army.U.uRealNear = { value: 12 };
      // 柵際の少数の騎馬は、乗り手と馬を同じ距離で細かな形へ替える。
      // 近い味方の控えとそろえ、大軍全体の描画距離は延ばさない。
      horses.army.U.uSplitR.value.x = 28;
      for (const mesh of horses.children) if (mesh.isInstancedMesh) mesh.userData.soldierDetailNear = 28;
      horses.visible = false;
      F.frontBands.push({ z: mouth.z, sideZ: z, inner, horseZ, clash, horses, started: false, retired: false });
    }
    // 撃った組ごとに一枚の煙を使い回す。煙の帯は顔より少し上へ流す。
    // 丸い一つのぼかしは白い塊に見えた（10/30 採点）。横へ伸びた濃淡の筋を重ねた絵を風下へ流し、
    // 縁だけは動かない別の絵で薄れさせる。絵は二枚を全ての帯で使い回す。
    const smokeCanvas = document.createElement('canvas'); smokeCanvas.width = 128; smokeCanvas.height = 64;
    const smokeCtx = smokeCanvas.getContext('2d');
    let smokeSeed = 7;
    const smokeRnd = () => (smokeSeed = (smokeSeed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 70; n++) {
      const x = smokeRnd() * 128, y = 14 + smokeRnd() * 36, r = 5 + smokeRnd() * 13, a = 0.06 + smokeRnd() * 0.16;
      const v = 190 + Math.floor(smokeRnd() * 50);
      for (const ox of [-128, 0, 128]) {
        smokeCtx.save(); smokeCtx.translate(x + ox, y); smokeCtx.scale(2.2, 0.75);
        const gr = smokeCtx.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, `rgba(${v},${v - 4},${v - 12},${a})`); gr.addColorStop(1, `rgba(${v},${v - 4},${v - 12},0)`);
        smokeCtx.fillStyle = gr; smokeCtx.fillRect(-r, -r, r * 2, r * 2); smokeCtx.restore();
      }
    }
    const smokeEdge = document.createElement('canvas'); smokeEdge.width = 64; smokeEdge.height = 32;
    const edgeCtx = smokeEdge.getContext('2d');
    const edgeX = edgeCtx.createLinearGradient(0, 0, 64, 0);
    edgeX.addColorStop(0, '#000'); edgeX.addColorStop(0.3, '#fff'); edgeX.addColorStop(0.65, '#ccc'); edgeX.addColorStop(1, '#000');
    edgeCtx.fillStyle = edgeX; edgeCtx.fillRect(0, 0, 64, 32);
    const edgeY = edgeCtx.createLinearGradient(0, 0, 0, 32);
    edgeY.addColorStop(0, 'rgba(0,0,0,1)'); edgeY.addColorStop(0.45, 'rgba(0,0,0,0)'); edgeY.addColorStop(0.7, 'rgba(0,0,0,0)'); edgeY.addColorStop(1, 'rgba(0,0,0,1)');
    edgeCtx.fillStyle = edgeY; edgeCtx.fillRect(0, 0, 64, 32);
    const smokeTex = new THREE.CanvasTexture(smokeCanvas), smokeEdgeTex = new THREE.CanvasTexture(smokeEdge);
    smokeTex.wrapS = THREE.RepeatWrapping;
    const smokeGeo = new THREE.PlaneGeometry(14, 3.2);
    F.smokeBands = F.guns.map((g, gi) => {
      // 帯ごとに流れの位置だけを変える（絵は共有のまま）。
      const map = smokeTex.clone(); map.offset.x = gi * 0.37;
      const mat = new THREE.MeshBasicMaterial({ map, alphaMap: smokeEdgeTex, color: 0xd8d4ca, transparent: true,
        opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      // 厚みのない硝煙の板は、表裏を別々に送らず一回で両面を描く。
      mat.forceSinglePass = true;
      const mesh = new THREE.Mesh(smokeGeo, mat);
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(g.anchor.x + 2, W.heightAt(g.anchor.x + 2, g.anchor.z) + 2.4, g.anchor.z);
      mesh.visible = false; rt.scene.add(mesh);
      return { mesh, map, shotAt: -99, x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, vx: 0.28, vz: 0 };
    });
    // 追撃では最初からいる敗兵を道沿いで逃がす。任務や当たりは増やさない。
    F.retreatBands = [];
    for (const [x, z] of [[90, MOUTHS[0].z + 4.5], [155, MOUTHS[0].z - 12], [REARGUARD.x - 25, REARGUARD.z]]) {
      const h = W.addDistantArmy({ x, z: z + 11, w: 12, d: 8, count: 18, team: 1,
        // 崩れる前は追手へ向く。共通の敗走で踵を返し、東の退き口へ散って走る。
        kind: 'spear', flag: 'takeda', armor: A.takeda, facing: -Math.PI / 2,
        // 三組の敗兵も兵ごとの遠さで形を選び、近い列を遠景の棒へ替えない。
        near: true, detailPerSoldier: true, detailMiddle: 48,
        host: false, seed: 5890 + F.retreatBands.length });
      h.army.noWake = true; h.army.shScenery = true; h.army.U.uRealNear = { value: 3 }; h.visible = false;
      F.retreatBands.push({ h, x, z: z + 11, started: false });
    }
    F.reserveHome = { x: SB.x0 - 2 * SB.gap - 5, z: 0 };
    F.reserveOptions = { x: F.reserveHome.x, home: F.reserveHome, facing: Math.PI / 2 };
    // 高画質の山麓の本陣だけ幕を地面へ沿わせる。裾が斜面に埋まったり宙へ出たりしないようにする。
    // 共通の丸紋入り手盾は使わず、脇に据えた木地の置楯へ統一する。旗本の前と出入口は空ける。
    const fieldCamp = { contour: true, tate: false };
    F.camps = [
      camp(rt, { ...fieldCamp, x: IEYASU.x, z: IEYASU.z, facing: Math.PI / 2, team: 0, faction: 'tokugawa', mon: 'tokugawa', general: { name: '徳川家康' }, guard: 15, reserve: 240, runTo: { x: SB.x0 - 12, z: MOUTHS[2].z } }),
      camp(rt, { ...fieldCamp, x: CHAUSU.x, z: CHAUSU.z, facing: Math.PI / 2, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 15, reserve: 260, runTo: { x: SB.x0 - 12, z: -50 } }),
    ];
    F.katsCamp = camp(rt, { ...fieldCamp, x: KATSUYORI.x, z: KATSUYORI.z, facing: -Math.PI / 2, team: 1, faction: 'takeda', mon: 'takeda', general: { name: '武田勝頼' }, guard: 15, reserve: 0, runTo: { x: 280, z: 10 } });
    shFieldWorks(rt);
    shSummerGrass(rt);
    // 本陣の旗本は陣を守る。共通の「近い敵へ出る」判断で、柵や川へ追い出さない。
    for (const c of F.camps) {
      c.guard.guard = true; c.guard.stay = true;
      c.guard.guardSight = 22; c.guard.guardLeash = 8;
    }
    // 10/31 iPhone の記憶：共通の陣は旗本を十五人より減らさない。柵から遠い味方の二つの陣だけ、組頭を残して詰める
    //   （茶臼山は一キロ西で本人が行かない。家康の陣は竹広の後ろの控え）。勝頼の陣は追い討ちで斬り合うので保つ。
    F.camps.forEach((c, i) => { const g = c.guard, keep = i ? 5 : 9; let k = 0; for (const u of g.units) if (u !== g.leader && ++k > keep) rt.army.despawn(u); });
    // 11/4 jin（AV7）：三人の総大将は後方の本陣の床几に座る（勝頼は退きの下知で立つ）
    for (const c of [...F.camps, F.katsCamp]) if (c.general) c.general._crouch = true;
    F.katsCamp.guard.formation = 'yari';
    F.katsCamp.guard.noRout = true; F.katsCamp.guard.guard = true;
    F.katsCamp.guard.stay = true; F.katsCamp.guard.guardSight = 22; F.katsCamp.guard.guardLeash = 8; // 勝頼の馬廻は退きの下知まで本陣を守る

    for (const [x, z, k, h] of [[IEYASU.x - 10, IEYASU.z + 10, 'onri', 6.5], [CHAUSU.x + 10, CHAUSU.z + 10, 'eiraku', 6.5]]) rt.scene.add(nobori(W, x, z, k, h));
    // 柵の内の旗（織田が北寄り、徳川が南）
    // 11/5 BP：柵の間に旗がずらり。二の柵と三の柵の間は二十二メートルごと、一の柵と二の柵の間にも口を避けて互い違いに。
    for (let z = SB.z0 + 34; z <= SB.z1 - 12; z += 44) {
      if (SB.gates.some((g) => Math.abs(z + 5 - (g + 4.5)) < 16)) continue;
      const post = ALLIED_POSTS.find((p) => Math.abs(p[2] - z - 5) <= 23);
      rt.scene.add(nobori(W, SB.x0 - 2.6, z + 5, post ? post[4] : z < odaZ ? 'oda' : 'tokugawa', 4.6));
    }
    for (let z = SB.z0 + 12; z <= SB.z1 - 12; z += 22) {
      let mon = z < odaZ ? (oda && z % 44 === 0 ? 'maeda' : 'oda') : (z % 44 === 0 ? 'okubo' : 'tokugawa');
      if (true) {
        // 余りの一致で選ぶと固有の紋が一度も出ない。既存の備えの持ち場で選ぶ。
        const post = ALLIED_POSTS.find((p) => Math.abs(p[2] - z - 5) <= 23);
        mon = post ? post[4] : z < odaZ ? 'oda' : 'tokugawa';
      }
      rt.scene.add(nobori(W, SB.x0 - SB.gap - 3, z + 5, mon, 5));
    }
    rt.scene.add(tawara(W, -30, 30, 0.3, 6), tawara(W, -34, -20, -0.4, 5));
    // 南の口の持ち場（二重の柵の間）の脇に、兵が担いで来た予備の柵木の山と俵（信長公記：柵の木を各自に持たせた）。
    // 25秒の画面の右手前に入る所。口（z -280）から十歩以上離し、当たりは足さない（10/28 採点：柵の内が草の野だけ）。
    rt.scene.add(lumber(W, 9.6, -266, 0.12), lumber(W, 10.8, -262.6, -0.18), tawara(W, 12.2, -268.6, 0.6, 4, { solid: false }));
    // 柵際と避難路を空けた南北の集落。戸数を保ち、各家の戸口から入れる。
    // 室内は推定。長篠城と鳶ヶ巣山の砦は、この戦場には置かない。
    for (const [i, v] of PEOPLE_VILLAGES.entries()) KT.farVillage(rt, v.x, v.z,
      { rot: i ? 0 : Math.PI, n: i ? 5 : 6, fields: 0, seed: 21 + i,
        interiorHomes: { name: i ? '南の集落の民家' : '北の集落の民家', kind: 'minka', profile: 'shitaragahara' } });
    // 村外れの小堂は外陣・内陣・須弥壇を備える推定の姿。避難先を攻撃の的にしない。
    const villageHall = goten(rt, PEOPLE_TEMPLE.x, PEOPLE_TEMPLE.z,
      { w: 8, d: 6, name: '村外れの寺の堂', kind: 'hondo', profile: 'shitaragahara',
        naka: true, noTarget: true, templePaper: true, interiorH: 2.35, doorX: 0, oku: 0,
        doorFire: false, // 避難先の小堂に本陣用の篝を並べず、内陣の灯明を使う。
        // 御殿の大将用の場所を空けて須弥壇を消さない。明かり障子は外壁の正面二間に合わせる。
        // 隅柱の内面と窓枠の間を空ける。外観の窓も一間の左右を四十二センチずつ残す。
        wins: () => [-8 / 3, 8 / 3].map(t => ({ face: 'z', s: 1, t,
          w: 8 / 3 - (SETTINGS.quality === 'high' ? .84 : .24),
          y0: 1.375 - .55, y1: 2.525 - .55, shoji: true, sliding: SETTINGS.quality === 'high' }))
          // 来迎壁と本尊の背後は壁を残し、左右の柱間から内陣へ採光する推定の姿。
          // 外の格子の内側に引違いの明かり障子を納め、裏窓も閉じられるようにする。
          // 格子は外観を共用し、紙戸と溝だけを既存の室内の仕組みで組む。
          .concat(SETTINGS.quality === 'high' ? [-8 / 3, 8 / 3].map(t => ({ face: 'z', s: -1, t,
            w: (8 / 3 - .24) * .7, y0: 1.5 - .55, y1: 2.3 - .55,
            exteriorLattice: true, shoji: true, sliding: true })) : []) });
    villageHall.naka.templePaper = true;
    // 大軍：織田・徳川三万八千、武田一万五千。備ごとに名と持ち場を分ける。
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    // 一隊の体・旗・馬をそのまま使い、四つの備えを一度に描く。毎コマの並べ直しはしない。
    const deepHost = (x, z, count, facing, armor, flag, seed, kind, step, width, team = 0, general = null) => {
      const people = [], sx = Math.sin(facing), sz = Math.cos(facing);
      const per = Math.ceil(count / 4), cols = Math.ceil(width / 1.5), rows = Math.ceil(per / cols);
      for (let i = 0; i < per; i++) for (let a = 0; a < 4; a++) {
        if (i * 4 + a >= count) continue;
        const row = Math.floor(i / cols), l = (i % cols - (cols - 1) / 2) * 1.5;
        const back = a * step + row * 1.25;
        const yose = team === 1 && (kind === 'mixed' || kind === 'cavalry');
        const front = yose && a === 0 && row < 2;
        const banner = !front && i % (yose ? 9 : 43) === 0;
        people.push({ x: x - sx * back + sz * (l + (a % 2 ? 3 : -3)),
          z: z - sz * back - sx * (l + (a % 2 ? 3 : -3)), facing,
          general: i === Math.floor(cols / 2) && a === 0 ? general : undefined,
          k: general && i === Math.floor(cols / 2) && a === 0 ? 'rider' : front ? 'rider' : banner ? 'banner' : (kind === 'cavalry' || kind === 'mixed') && i % 6 === 0 ? 'rider' : kind === 'gun' && a === 0 ? 'gun' : i % 19 === 0 ? 'samurai' : 'spear',
          ex: front ? (i === Math.floor(cols / 2) ? 2 : 0) : banner && yose ? (Math.floor(i / 9) + a) % 6 : 1.3, flag: banner ? 0 : front || i % 3 === 0 ? 1 : 0 });
      }
      const g = W.addDistantArmy({ x: x - sx * (step * 1.5 + rows * 0.625), z: z - sz * (step * 1.5 + rows * 0.625),
        people, team, yoseFamily: team === 1 ? 'takeda' : flag, yose: team === 1 && (kind === 'mixed' || kind === 'cavalry'), w: width + 6, d: step * 3 + rows * 1.25, facing, armor, mon: flag, seed, kind,
        near: true, detailMiddle: 48, host: false });
      // 高画質の控えも、近い一人ずつを既存の細かな形へ替える。
      // 十二メートルの内は本物に任せ、遠い数千人を丸ごと細かくしない。
      if (true) {
        g.army.U.uRealNear = { value: 12 };
        g.army.U.uSplitR.value.x = 28;
      }
      // 陣幕の人ではなく通常の備えとして、近い十数人だけ本物へ替える。
      // 並びを四段ずつ交互にしたので、低画質で間引いても奥の備えが残る。
      g.army.people = false; g.army.nImp = team === 1 && (kind === 'mixed' || kind === 'cavalry') ? g.army.nImp : 32; g.army.jinkeiGuard = true;
      return g;
    };
    // 陣形の表と描く備えを同じ場所へ結ぶ。遠景を二重に置かず、近い兵を替える仕組みも保つ。
    const buildHost = (p) => jinkeiBuild(rt, { ...p, sonae: p.sonae.filter((s) => s.draw).map((s) => ({ ...s, bindOnly: false })) }, (s, at) => {
      const h = deepHost(at.x, at.z, s.count, p.facing, A[s.flag] || A[p.team ? 'takeda' : 'oda'], s.mon,
        5700 + p.team * 100 + p.sonae.findIndex((q) => q.id === s.id), s.kind || 'spear', p.team ? 18 : 22, p.team ? 30 : 40, p.team, s.named === false || rt.army.units.some((u) => u.name === s.general)
          || ['馬場信春', '山県昌景', '真田信綱', '真田昌輝', '内藤昌豊'].includes(s.general) ? null : s.general);
      h.name = s.general + '隊';
      F.jinkeiBound[s.id] = h;
      h.army.noWake = false; // 元の備の近い兵と将だけを替え、遠い兵を新手として足さない
      if (s.named !== false) {
        h.namedFlag = postFlag(rt, s.general, at.x + (p.team ? -2 : 2), at.z, s.mon);
        h.flagX = h.namedFlag.position.x; h.flagZ = h.namedFlag.position.z;
      }
      return h;
    });
    F.alliedHosts = [...Object.values(buildHost(SHITARA_ODA_JIN)), ...Object.values(buildHost(SHITARA_TOKUGAWA_JIN))];
    F.hill = Object.values(buildHost(SHITARA_TAKEDA_JIN));
    F.namedHosts = [...F.alliedHosts, ...F.hill];
    postFlag(rt, '徳川家康', IEYASU.x, IEYASU.z, 'tokugawa');
    postFlag(rt, '織田信長', CHAUSU.x, CHAUSU.z, 'oda');
    F.katsuyori = DA(KATSUYORI.x, KATSUYORI.z, 38, 30, 300, -Math.PI / 2, A.takeda, 'takeda', 57, 'honjin');
    postFlag(rt, '武田勝頼', KATSUYORI.x, KATSUYORI.z, 'takeda');
    F.mouthFlags = MOUTHS.map((mouth) => postFlag(rt, mouth.name, SB.x0 - SB.gap - 3, mouth.z - 9, mouth.z < 190 ? 'oda' : 'tokugawa'));
    // 勝頼本人と馬廻は後方の陣幕へ置いた。共通の大将・新手を重ねない。
    F.katsuyori.noWake = true; F.katsuyori.army.noWake = true;
    // 近接する寄せ手と殿は開戦前からそれぞれの備に置く。
    F.waveGroups = this.WAVES.map((w) => this.makeWave(rt, w));
    F.south = this.makeWave(rt, { name: '山県昌景', general: '赤備えの侍大将', hq: 'shitara_yamagata', fac: 'akazonae', z: MOUTHS[2].z, home: { x: 60, z: MOUTHS[2].z + 4.5 }, cav: 3, ash: 8, bamboo: true });
    // 退路の旗と馬は軽い備の討死の跡。元の馬の形・材質を共用する。
    const fallenModel = F.south.cavalry.units.find((u) => u.horse)?.horse;
    // 10/31 iPhone の記憶：three の clone は userData を JSON で写し直す。乗った馬の userData から辿れる物まで
    //   一頭ごとに文字に起こして持ち続け、飾りの馬だけで三百 MB を超えていた。userData は浅く写す（中身は共有）。
    const cloneFallen = () => {
      const saved = [];
      fallenModel.traverse((o) => { saved.push(o.userData); o.userData = {}; });
      let copy;
      try { copy = fallenModel.clone(true); } finally { let i = 0; fallenModel.traverse((o) => { o.userData = saved[i++]; }); }
      // 骨組みの控え（userData.horse）は元の馬の脚や首を指すので写さない（飾りの馬は動かさない）。
      let j = 0; copy.traverse((o) => { o.userData = { ...saved[j++] }; delete o.userData.horse; });
      return copy;
    };
    // 高の柵際には実際に倒れた馬だけを残す。時刻だけで亡骸を足さない。
    if (fallenModel && !fieldMelee) for (const band of F.frontBands) {
      // 口の内側は実際の落馬だけを残す。八十センチ間隔の飾り馬を二頭重ねない。
      if (band.inner) continue;
      const horse = cloneFallen();
      const x = SB.x0 + 12;
      horse.position.set(x, W.heightAt(x, band.horseZ) + 0.55, band.horseZ);
      horse.rotation.set(0, -Math.PI / 2, 0);
      horse.traverse((m) => { if (m.isMesh) { m.onBeforeRender = () => {}; delete m.userData.lod; } });
      shHorseRest(rt, horse);
      horse.visible = false; rt.scene.add(horse); band.fallenHorse = horse;
    }
    for (const band of F.retreatBands) {
      const remains = new THREE.Group();
      const flag = nobori(W, band.x + 28, band.z + 5, 'takeda', 3.5);
      shGroundFlag(rt, flag); remains.add(flag);
      if (fallenModel) {
        const horse = cloneFallen();
        horse.position.set(band.x + 25, W.heightAt(band.x + 25, band.z + 8) + 0.55, band.z + 8);
        horse.rotation.set(0, Math.PI / 2, -1.5);
        horse.traverse((m) => { if (m.isMesh) { m.onBeforeRender = () => {}; delete m.userData.lod; } });
        shHorseRest(rt, horse); shHorseTilt(horse, 1);
        remains.add(horse);
      }
      remains.visible = false; rt.scene.add(remains); band.remains = remains;
    }
    // 後方の高みの旗を、柵の内の合図役が取り次ぐ。旗は開戦時にだけ作る。
    F.signalFlag = nobori(W, -32, MOUTHS[1].z - 12, 'oda', 8);
    F.signalBaseY = F.signalFlag.position.y;
    F.signalFlag.rotation.z = 0.65;
    rt.scene.add(F.signalFlag);
    F.hashibaFlag = nobori(W, REAR_POSTS[1][1], REAR_POSTS[1][2], 'oda', 10);
    F.hashibaFlag.rotation.z = 0.65;
    rt.scene.add(F.hashibaFlag);
    // 11/6 fixc1721（九2）：馬場の殿は退き口の手前の段丘（柳田前の北東）に控え、崩れの時に退き口で槍を揃える。目標に書いた敵が必ずその場で戦う
    F.rear = shBlackArmy(() => enemyGroup(rt, { faction: 'takeda', name: '馬場隊', fixed: true, noGuard: true, anchor: { x: NF_REAR.x + 34, z: NF_REAR.z - 40 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 8, width: 16, formation: 'yari', morale: 95, noRout: true },
      [{ type: 'busho', n: 1, o: { name: '馬場信春', horse: true, flag: 'takeda' } }, { type: 'samurai', n: 3, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 11, o: { flag: 'takeda' } }, { type: 'gun', n: 2, o: { flag: 'takeda' } }]));
    // 馬場隊は追撃の退き口で初めて戦う。柵前で先に討死させない。
    for (const u of F.rear.units) { u.invuln = true; u.noTarget = true; }
    nagashinojo.kit.backOf(rt, F.rear, { flag: 'takeda', armor: A.oda, kind: 'spear', w: 22, depth: 10, count: 120, seed: 79 });
    // 別の備も開戦前から待機し、寄せの下知で前進する。
    F.far = [];
    for (const [z, f, kind] of [[MOUTHS[2].z + 24, 'akazonae', 'mixed'], [MOUTHS[2].z - 24, 'akazonae', 'mixed'], [MOUTHS[1].z + 24, 'takeda', 'mixed'], [MOUTHS[1].z - 24, 'takeda', 'spear'], [MOUTHS[0].z + 24, 'takeda', 'mixed'], [MOUTHS[0].z - 24, 'takeda', 'mixed']]) {
      // 南の赤備えは二備とも幅と厚みを増し、柵の内から川向こうに大きな赤い塊として見せる（10/29 15:10 採点：赤備えの群れが小さい）。軽い作りのまま。
      const red = f === 'akazonae';
      const m = DA(red ? 118 : 125, z, red ? 34 : kind === 'mixed' ? 20 : 14, red ? 18 : 12, red ? 170 : kind === 'mixed' ? 80 : 90, -Math.PI / 2, A[f], f, 61 + F.far.length, kind);
      m.army.noWake = true; // 待機中から見える備。合図で前進するだけ。
      F.far.push({ m, z, v: 0 });
    }
    // 10/31 採点 基準4：大宮前の持ち場から東を見た25秒の画面で、武田の備が地平の細い線にしか見えなかった。
    //   連吾川の向こう五十〜七十メートルに、旗の林立する武田の本備を一つの大きな塊で置く（軽い作りだけ。本物の兵・大きい絵は足さない。iPhone の記憶のため）。
    //   持ち場が初めの視点から遠く、並びの指定（w・d）では作られない（遠い隊の省き）ので、一人ずつの並びで渡す。
    {
      const people = [], z0 = MOUTHS[0].z + 4;
      for (let r = 0; r < 6; r++) for (let c = 0; c < 40; c++) {
        const i = r * 40 + c, x = 56 + r * 3.2 + Math.sin(c * 1.7 + r) * .6, z = z0 + (c - 19.5) * 1.95 + (r % 2) * .9 + Math.cos(c * 2.3 + r * 1.1) * .35;
        const banner = (c + r * 3) % 7 === 0, rider = !banner && r < 2 && c % 5 === 2;
        people.push({ x, z, facing: -Math.PI / 2 + Math.sin(i * 1.3) * .06, k: banner ? 'banner' : rider ? 'rider' : i % 19 === 0 ? 'samurai' : 'spear', ex: banner ? (c + r) % 6 : rider ? 0 : 1.3, flag: banner ? 0 : i % 3 === 0 ? 1 : 0 });
      }
      F.mainHost = W.addDistantArmy({ people, team: 1, kind: 'mixed', facing: -Math.PI / 2, armor: A.takeda, flag: 'takeda', mon: 'takeda', host: false, seed: 5771 });
    }
    // 持ち場から四十六〜六十四メートル。霞に沈まないよう、軽い兵を描かない輪を狭める。
    if (F.mainHost.army) {
      // 更新時も替えない指定を保つ。控えを静止した本物へ替えて実兵の枠を埋めない。
      F.mainHost.army.shScenery = true; F.mainHost.army.noWake = true;
      if (F.mainHost.army.body) F.mainHost.army.U.uRealNear = { value: 24 };
    }
    F.chaseHosts = [];
    for (let i = 0; i < 4; i++) {
      const x = -24 - Math.floor(i / 2) * 9, z = MOUTHS[i < 2 ? 1 : 0].z + (i % 2 ? 22 : -22);
      // 付き添いは小さな槍の組。後尾の大旗持ちが視点の両脇へ入り続けるのを避ける。
      // 旗持ちの枠も槍兵に充て、人数を保ったまま列を短くする。奥の控えは元の備え。
      const h = W.addDistantArmy({ x, z, w: i < 2 ? 4 : 3, d: i < 2 ? 8 : 18, banners: i < 2 ? 0 : undefined,
        count: i < 2 ? 12 : 24, team: 0, kind: 'spear', facing: Math.PI / 2,
        armor: A.oda, flag: 'oda', seed: 5810 + i, host: false, near: true, detailPerSoldier: true, detailMiddle: 48 });
      h.army.noWake = true;
      // 高画質の兵ごとの切替は、輪が零だと働かない。付き添いも細かな姿を使う。
      // 本物へ替える処理は止めたまま、足元半歩だけを空ける。
      h.army.U.uRealNear = { value: i < 2 ? 0.5 : 12 };
      h.army.U.uSplitR.value.x = 28;
      // 付き添う控えは本物へ替えないため、本人の近くでも同じ兵の姿を残す。
      // 視点のすぐそばは、既存の材質の透かしで見通しを保つ。
      if (i < 2) {
        h.army.U.uNear.value = 0;
        // 付き添う二十四人だけ、戦全体の十六メートル制限から外す。
        // 袖・草摺・袴と足のある近景を保ち、遠い控えや携帯の形は増やさない。
        h.army.body.userData.soldierDetailNear = 28;
      }
      // 本人に付く控えは、距離に応じた既存の形を使う。近くでも棒の形へ固定しない。
      F.chaseHosts.push({ h, escort: i < 2, step: 0, points: [
        { x: -18, z: MOUTHS[0].z + 4.5 }, { x: -6, z: MOUTHS[0].z + 4.5 },
        { x: 46, z: MOUTHS[0].z + 4.5 }, { x: 112, z: MOUTHS[0].z + (i % 2 ? 20 : -20) },
        { x: REARGUARD.x - 22, z: REARGUARD.z + (i % 2 ? 24 : -24) },
      ] });
    }
    // 朝六時からの時計を使う。morning は時計の段に無く、寄せの間に日が止まっていた。
    rt.world.setTime('day');
    rt.setPhase('brief');
    F.wave = 0;
    F.prepAt = rt.t;
    // 初めの寄せを受ける北の持ち場に備える。開戦直後の三百メートルの移動を挟まない。
    F.prepPt = { x: OUTER_POST_X, z: SB.gates[0] + 4.5 };
    shPostFlag(rt, F.prepPt);
    placePlayer(rt, this.spawn.x, this.spawn.z, this.spawn.heading);
    let row = 0;
    for (const q of rt.squadGroups || []) {
      q.formation = 'column'; q.colW = 1; q.roadColumn = true;
      placeGroup(rt, q, OUTER_POST_X - 4 - row++ * 5, F.prepPt.z);
    }
    // 目の前に槍の将を置き、同じ口を守る仲間と敵を初めから見せる。
    F.spears[0].formation = 'column'; F.spears[0].colW = 1;
    placeGroup(rt, F.spears[0], OUTER_POST_X - 2, F.prepPt.z);
    // 11/6 fixc1721（九2・一3）：真田隊は連吾川の東の段丘の縁に構えて始まり、下知で段丘を下りて大宮前の柵へ寄せる。
    //   開戦から柵の外で団子にしない。目標は右上に①〜④（goals5）。行き先は頭上の金の▼一つ（missionPin）。
    F.nf = { step: 0, at: rt.t, done: [false, false, false, false] }; F.prepDone = true;
    rt.obj('pursue', NF_TEXT[0], 'main', true);
    ST_INTRO.start(rt, stCtx(rt));   // 導入の段（shitaragahara/intro.js）
    shHud(rt);
    // 11/6 fixc0504（一5・九6）：柵の内の槍の組頭は馬を下りて徒歩で組と並ぶ（柵の内に馬の通る幅は無い）。
    //   馬の背の本人だけが柵の間の道と追い討ちを駆け抜け、組を百メートル後ろに置いて一人で殿に当たっていた
    {
      const P = rt.player;
      if (P.mounted) { rt.army.setMounted(P.u, false); P.mounted = false; P.hspd = 0; }
      P.canRide = false; P.horse = P.ownedHorse = null; P.loose = null;
    }
    rt.say('侍大将', '長篠を救うぞ。武田が寄せるまでに、柵の守りを固めよ', 3.5);
    rt.after(2, () => {
      if (F.ending || F.pursuit || F.frontsStarted) return;
      sfx('taiko', 0.8);
    });
    rt.after(4, () => {
      if (F.ending || F.pursuit) return;
      // 雨上がりの湿土や川から乾いた土煙を上げない。煙の枠は既存のものを使う。
      if (W.rainLevel > 0.4 || (W.wetness ?? W.def.wetStart ?? 0) > 0.5) return;
      if (!W.inWaterAt(125, MOUTHS[0].z + 24)) W.dustCloud(125, MOUTHS[0].z + 24, true, true);
      if (!W.inWaterAt(125, MOUTHS[2].z + 24)) W.dustCloud(125, MOUTHS[2].z + 24, true, true);
    });
  },

  // 全軍の確かな攻撃順とはしない。南北は並行し、北から中央への長い行軍は場面替えで省く。
  // AB（kaito 11/3）：一つの寄せを厚くし、柵の前で数分斬り合ってから崩れる（波は敵の数で進む・時間では進まない）
  // 11/6 fixc1721：寄せる二つの備。初めは連吾川の東の段丘の縁に構え、下知で段丘を下りて柵へ寄せる（開戦から柵の外で団子にしない）。
  //   具足は黒（赤備えは南の山県だけ・四3）。家の旗は真田の六連銭と武田菱。軍勢対軍勢に見えるよう、本物の徒歩を三十四人に。
  WAVES: [
    { name: '真田信綱・昌輝', hq: 'shitara_sanada', fac: 'takeda', flag: 'sanada', z: MOUTHS[0].z, home: { x: 148, z: MOUTHS[0].z + 4.5 }, cav: 8, ash: 22, brother: true },
    { name: '内藤昌豊', hq: 'shitara_naito', fac: 'takeda', flag: '内藤の胴赤', z: MOUTHS[1].z, home: { x: 152, z: MOUTHS[1].z + 4.5 }, cav: 8, ash: 22, general: '内藤昌豊', final: true },
  ],

  makeWave(rt, w) {
    if (w.fac !== 'akazonae' && !w.blackDone) return shBlackArmy(() => this.makeWave(rt, { ...w, blackDone: true }));
    const flag = w.flag || w.fac, red = w.fac === 'akazonae';
    const frontX = w.home?.x ?? 105, homeZ = w.home?.z ?? w.z + 4.5;
    const g = enemyGroup(rt, { faction: w.fac, name: w.name + '隊', fixed: true, noGuard: true, anchor: { x: frontX, z: homeZ }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 8, width: w.ash > 20 ? 30 : 12, spacing: 1.4, formation: 'line', morale: 100, speed: 3 },
      [{ type: 'ashigaru', n: w.ash, o: { tatake: !!w.bamboo, flag } }, { type: 'busho', n: 1, o: { name: w.brother ? '真田信綱' : w.general || w.name, horse: true, flag } },
        ...(w.brother ? [{ type: 'busho', n: 1, o: { name: '真田昌輝', horse: true, flag } }] : [])]);
    g.def = this.WAVES.find((x) => x.name === w.name) || w;
    g.cavalry = enemyGroup(rt, { faction: w.fac, name: w.name + '隊の騎馬衆', fixed: true, noGuard: true, anchor: { x: frontX + 10, z: homeZ + 8 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 8, width: 10, morale: 95, speed: 5 }, [{ type: 'cavalry', n: w.cav, o: { horseBattle: 'mounted', flag: red ? 'takeda_kiba' : flag } }]);
    g.missiles = enemyGroup(rt, { faction: w.fac, name: w.name + '隊の鉄砲・弓', fixed: true, noGuard: true, anchor: { x: frontX + 16, z: homeZ - 14 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 6, width: 10, morale: 85, speed: 2.6 },
      [{ type: 'samurai', n: 1, o: { flag } }, { type: 'gun', n: 2, o: { flag } }, { type: 'bow', n: 2, o: { flag } }]);
    g.missiles.holdFire = true;
    // 下知前の本隊は川向こうの集結位置に控える。柵際で静止させず、先手の斉射にも巻き込まない。
    for (const q of [g, g.cavalry, g.missiles]) q.shWaiting = true;
    for (const u of g.missiles.units) if (u.type === 'gun') u.gunAmmo = 3;
    nagashinojo.kit.backOf(rt, g, { flag, armor: nagashinojo.kit.ARMOR[red ? 'akazonae' : 'oda'], kind: 'mixed', w: 30, depth: 18, count: 120, gap: 6, seed: 71 + this.WAVES.indexOf(w), stop: () => g.center().x < SB.x0 + 8 });   // 後ろの大軍も柵の近くまで押して、寄せの厚みを見せる
    return g;
  },

  update(rt, dt) {
    huntPlayer(rt, dt);
    // 寄せの道筋は nfSend に任せる。画面の正面へ固定すると、柵で止まり寄せの下知も失われる。
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive) return;
    const p = rt.player.u.pos;
    nfTick(rt, dt);
    ST_WALL.tick(rt, dt);
    // 替えた兵にも同じ武器の威力を使う。柵の内では控えを勝手に侵入させない。
    if ((F.wkT = (F.wkT || 0) - dt) <= 0) {
      F.wkT = 0.5;
      const ammoLimit = 3;
      for (const u of rt.army.units) {
        if (u.type !== 'gun' || !u.alive) continue;
        if (u.team === 0) {
          u.gunAmmo = Infinity;
          if (u.isPlayer) rt.player.gunAmmo = null;
        } else u.gunAmmo = Math.min(u.gunAmmo ?? ammoLimit, ammoLimit);
      }
      for (const A of rt.world.armies || []) if (A.team === 1 && !A._autoDistant) {
        // 退却の下知を上書きしない。追撃の反撃は既存の殿だけで受ける。
        A.noWake = !!A.shScenery || !!F.pursuit || A === F.katsuyori.army;
        A.jinkeiGuard = true;
      }
    }
    // 名入りの旗も同じ備と前進・後退する。遠方でも、討死後に旗が倒れるのを見せる。
    if ((F.flagAt || 0) <= rt.t) {
      F.flagAt = rt.t + 0.5;
      for (const h of F.namedHosts) if (h.namedFlag) {
        const f = h.namedFlag, a = h.army;
        // 落ちた旗を敗走する兵へ追従させず、その場に残す。
        if (f.userData.shGrounded) continue;
        f.position.x = h.flagX + a.off.x; f.position.z = h.flagZ + a.off.z;
        f.position.y = rt.world.heightAt(f.position.x, f.position.z);
        if (a.rout) shGroundFlag(rt, f);
      }
    }
    // 背後の軽い控えも、近接する備と同じ場所から戦い始める。
    for (const q of F.backs || []) if (!q.gone && (q.g.routed || !q.g.count)) {
      q.gone = true; q.b.retreat(180, 60);
    }
    nagashinojo.kit.backTick(rt);
    // 射線の遮り（11〜23 章）：鉄砲組の前で味方の槍組が揉み合っていれば、その鉄砲組は撃てない
    if (F.bands) losTick(F.guns, F.spears);
    if ((F.hudT = (F.hudT || 0) - dt) <= 0) {
      F.hudT = 0.5;
      // 隣の突破兵が近づけば組ごと向き直る。向きを直す間は射撃を止める。
      for (const q of F.guns) if (q.order === 'hold' && !q.routed && !(q.gunTurnUntil > rt.army.time)) {
        let threat = null, nearest = 25;
        for (const u of q.units) {
          const t = u.target;
          if (!u.alive || !t?.alive || t.isStruct || t.team === q.team || t.noTarget) continue;
          const d = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
          if (d < nearest) { nearest = d; threat = t; }
        }
        if (threat && !inArc(q, threat.pos.x, threat.pos.z, q.fireArc / 2)) {
          const c = q.center(), a = Math.atan2(threat.pos.x - c.x, threat.pos.z - c.z);
          const turn = Math.abs(Math.atan2(Math.sin(a - q.facing), Math.cos(a - q.facing)));
          q.facing = a; q.gunTurnUntil = rt.army.time + turn / 1.2;
        }
      }
    }
    shSmoke(rt);
    // 11/6 fixc1721（九7）：配置替え中も見回した向きを保ち、柵の敵や川向こうへカメラを勝手に戻さない。
    // 夜明けからの鉄砲の撃ち合いの名残。号令の前も、柵の内の鉄砲組の前に硝煙の帯が薄く残り、始めの40秒ほどで晴れる
    // （25秒の画面に煙が無かった。10/29）。既にある硝煙の帯をそのまま使い、形・材質・描く数は増やさない。
    if (F.lingerT0 == null) F.lingerT0 = rt.t;
    const lt = rt.t - F.lingerT0;
    const linger = F.ending || F.pursuit || lt > 45 ? 0 : 0.2 * Math.min(1, lt / 3) * Math.min(1, (45 - lt) / 10);
    // 筒先の煙は shSmoke の実際の発砲だけで出す。開戦前の名残は帯で表す。
    for (const smoke of F.smokeBands) {
      const age = rt.t - smoke.shotAt, fresh = age < 7;
      smoke.mesh.visible = (fresh || linger > 0) && !F.ending;
      if (!smoke.mesh.visible) continue;
      const field = SETTINGS.quality === 'high';
      if (field) {
        // 発砲点に残した同じ煙を風下へ広げる。次の射手へ飛び移らせない。
        smoke.mesh.visible = fresh;
        if (!fresh) continue;
        smoke.mesh.material.opacity = Math.max(0, 0.28 * (1 - age / 7)) * Math.min(1, age / 0.35);
        const spread = Math.min(1, age / 1.4);
        smoke.mesh.scale.set(0.16 + spread * 0.84, 0.45 + Math.min(1, age / 2.4) * 0.75, 1);
        smoke.mesh.position.set(smoke.x + age * smoke.vx, smoke.y + age * 0.12, smoke.z + age * smoke.vz);
        smoke.map.offset.x -= dt * 0.035;
      } else {
        const drift = fresh ? age : 0, k = smoke.x * 0.7;
        smoke.mesh.material.opacity = Math.max(linger * (0.75 + 0.25 * Math.sin(k)), fresh ? 0.28 * (1 - age / 7) : 0);
        smoke.mesh.position.x = smoke.x + drift * 0.28 + (fresh ? 0 : 3 + Math.sin(lt * 0.15 + k) * 0.8);
        smoke.mesh.position.y = smoke.y + drift * 0.12 + (fresh ? 0 : -0.6);
        // 風下へゆっくり流れ、撃った直後ほど筋がほどけて広がる。
        smoke.map.offset.x -= dt * (fresh ? 0.035 : 0.012);
        smoke.mesh.scale.set(1 + drift * 0.09, 1 + drift * 0.12, 1);
      }
    }
    for (const band of F.frontBands) {
      // 11/6 fixc1721（一8）：柵の内の帯（三の柵の際）は使わない。寄せ手は一の柵の外で押し合う
      const wave = band.z === MOUTHS[2].z ? F.south : band.z === MOUTHS[0].z ? F.waveGroups[0] : F.waveGroups[1];
      const engaged = !band.inner && !F.pursuit && !F.ending && !!wave.nfArrive && !wave.routed;
      if (engaged && !band.started) {
        band.started = true; band.startedAt = rt.t; band.clash.mesh.visible = true; band.clash.go();
        band.horses.visible = true;
      }
      // 同じ十二騎を消さずに待たせ、徒歩が開いた口へ本隊に続いて進む。
      if (engaged && !band.horsesSent && (SETTINGS.quality !== 'high' || wave.cavSent)) {
        // 内外と両脇が一斉に飛び出さない。人数と行き先は保ち、出足だけずらす。
        if (band.horsesSendAt == null) band.horsesSendAt = rt.t + (SETTINGS.quality === 'high'
          ? 0.12 + (band.inner ? 0.3 : 0) + (band.sideZ > band.z ? 0.25 : 0) : 0);
        if (rt.t >= band.horsesSendAt) {
          band.horsesSent = true;
          band.horses.moveTo(band.inner ? INNER_POST_X + 8 : SB.x0 + 10, band.horseZ, 8, { charge: true });
        }
      }
      if (band.started && band.fallenHorse && rt.t - band.startedAt >= 12) {
        band.fallenHorse.visible = true;
        shHorseTilt(band.fallenHorse, Math.min(1, (rt.t - band.startedAt - 12) / 0.7));
      }
      if (engaged && !band.retired) band.retireAt = null;
      if (band.started && !engaged && !band.retired) {
        const field = SETTINGS.quality === 'high';
        // 虎口から崩れが伝わり、内外・南北の兵が同時に踵を返さない。
        if (band.retireAt == null) band.retireAt = rt.t + (field ? 0.2 + (band.inner ? 0.45 : 0) + (band.sideZ > band.z ? 0.65 : 0) : 0);
        if (rt.t >= band.retireAt) {
          band.retired = true;
          // 高では逃げる兵と転んだ兵を秒数で消さず、既存の距離・画面外判定に任せる。
          band.clash.rout('B', { hideAfter: field ? Infinity : 18, from: field ? (band.sideZ > band.z ? -1 : 1) : 0 });
          // 騎馬は足を止め、徒歩の崩れを見てから逃げる。同じ十二騎を残す。
          if (field) {
            band.horses.halt();
            band.horsesRetreatAt = rt.t + 0.65 + (band.inner ? 0.2 : 0) + (band.sideZ > band.z ? 0.25 : 0);
          }
          else band.horses.moveTo(145, band.horseZ, 25);
        }
      }
      if (band.horsesRetreatAt > 0 && rt.t >= band.horsesRetreatAt) {
        band.horsesRetreatAt = 0;
        // 既存の敗走で一騎ずつ振り向く。時間では消さず、蹄と土も元の処理を使う。
        band.horses.rout({ hideAfter: 0 });
      }
      // 追撃の合図でも姿を消さず、同じ兵が踵を返して逃げるところを残す。
      if (F.ending) band.clash.mesh.visible = false;
    }
    if (F.pursuit && !F.ending) for (const band of F.retreatBands) {
      if (band.started || Math.hypot(p.x - band.x, p.z - band.z) > 75) continue;
      band.started = true; band.h.visible = true;
      // 同じ十八人を、人ごとの出足・速さ・よろめきで逃がす。時間だけでは消さない。
      band.h.rout({ hideAfter: 0 });
    }
    for (const q of F.fallenHorses) {
      const k = Math.min(1, (rt.t - q.at) / q.duration);
      shHorseTilt(q.horse, k);
      // 実際の落馬の接地で一度だけ鳴らす。湿った土は低い泥粒、浅瀬は飛沫にする。
      if (SETTINGS.quality === 'high' && k >= 1 && !q.landed) {
        q.landed = true;
        rt.army.play('bodyLand', q.horse.position, 0.9);
        const x = q.horse.position.x, z = q.horse.position.z;
        if (Math.hypot(x - p.x, z - p.z) < 40) {
          // 雨が止んだ後も共通の湿土判定を使い、胴の着地に蹄跡を付けない。
          // 浅瀬では同じ接地の一度だけ水音を重ねる。粒は既存の五粒を使う。
          if (rt.world.inWaterAt(x, z)) rt.army.play('wade', q.horse.position, 0.7);
          rt.world.puff(x, z, 5, true, false);
        }
      }
    }
    // 後から本物へ替わった兵も、近景の頭・笠・胴の距離をそろえる。
    if (!(F.nearLookAt > rt.t)) {
      F.nearLookAt = rt.t + 0.5;
      for (const u of rt.army.units) {
        if (u.team === 1 && u.horseHp <= 0) shFallenHorse(rt, u);
        if (!u.alive || u.shNearLook || Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 28) continue;
        u.shNearLook = true;
        for (const m of [u.body, u.head]) if (m?.userData.lod) m.userData.lod[2] = 28;
        if (u.head?.material && !Array.isArray(u.head.material)) {
          const source = u.head.material;
          let mat = F.faceMats.get(source);
          if (!mat) {
            mat = source.clone(); mat.onBeforeCompile = source.onBeforeCompile; mat.onBeforeRender = source.onBeforeRender;
            mat.customProgramCacheKey = source.customProgramCacheKey.bind(source);
            mat.color.multiplyScalar(0.88); mat.roughness = 0.95; mat.envMapIntensity = 0.12;
            F.faceMats.set(source, mat);
          }
          u.head.material = mat;
        }
      }
    }
  },

  onRout(rt, g) {},
  onKill(rt, v, k) {
    ST_MEISHO.onKill(rt, v, { groundFlag: shGroundFlag });   // 名のある将の討死：大旗が倒れ気が崩れる（shitaragahara/meisho.js）
    // 両軍の今の数の棒（九3）：討たれた本物の兵の数から史実の規模へ
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1; else rt.flags.ak = (rt.flags.ak || 0) + 1;
    if (v.mounted) shFallenHorse(rt, v);
    nagashinojo.kit.carrion(rt, v);
    if (v.type === 'busho' && v.team === 1 && v.name && !v.shFallSaid) {
      v.shFallSaid = true;
      if (sightPoint(rt, v.pos, 55) || k?.isPlayer) rt.say('足軽', `${v.name}が倒れたで！`, 3);
      if (v.group) v.group.morale -= 30;
    }
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (!F.fence.includes(s) || !s.seg) return;
    if (s.row === 0) {
      F.broken++;

    }
    // 壊れた後も、建っていた時と同じ描画用の地面へ根元と横木を据える。
    s.stumps = stumps(F.fenceGround, s.seg, { rails: true });
    rt.scene.add(s.stumps);
    F.noticePt.x = (s.seg[0] + s.seg[2]) / 2; F.noticePt.z = (s.seg[1] + s.seg[3]) / 2;
    if (!F.pursuit && !F.ending && sightPoint(rt, F.noticePt, 55)) {
      rt.marker('breach', { x: F.noticePt.x, z: F.noticePt.z }, '破れた柵 ◆', { h: 4, noGuide: true });
      // 柵破りの下知は fallBack にまとめる。南北の破れ目は印で示す。
    }
    // 足軽大将以上（鉄砲の一手を預かる・侍大将）には、区画の柵の残り（細いゲージ）と突破口の広さを知らせる（60〜62 章）
    if (!F.pursuit && !F.ending && s.row === 0 && s.zone && (rt.G.lord || rt.G.rank >= 4) && Math.abs(rt.player.u.pos.z - (s.seg[1] + s.seg[3]) / 2) < 40) {
      if (sightPoint(rt, F.noticePt, 55)) {
        // 破れ目へ引き返させず、後退・配置替え中も今の任務と同じ下知を伝える。
        const objective = rt.objectives.find(o => o.kind === 'main' && !o.state);
        rt.bark('柵が破られた。' + this.taskText(rt, objective?.text || '槍の持ち場で仲間と敵を止めよ') + '！', true);
      }
    }
    sfx('wood', 1);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if (!F.fence.includes(s) || !s.seg) return;
    if ((F.hitWarn || -99) + 12 > rt.t) return;
    F.noticePt.x = (s.seg[0] + s.seg[2]) / 2; F.noticePt.z = (s.seg[1] + s.seg[3]) / 2;
    if (!sightPoint(rt, F.noticePt, 55)) return;
    F.hitWarn = rt.t;
    // 取り付いた敵は頭上の▼とピンで示す。字の知らせは出さない（稲生の水準）。
  },
};
// 11/6 fixc1721：bot（遊び手の代わり）も金の▼の行き先へ歩き、届く敵とだけ戦う（柵を出て野へ追わない）
shitaragahara.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags, N = F.nf;
  if (!u.alive || F.ending || !N) return false;
  if (N.step >= 5) {
    let best = null, bd = Infinity;
    for (const o of F.rear.units) if (o.alive && !o.fleeing && !o.gone && !o.woundOut && !o.rearWound && !o.noTarget && Math.hypot(o.pos.x - NF_REAR.x, o.pos.z - NF_REAR.z) < 40) { const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) - (o.name === '馬場信春' ? 6 : 0); if (d < bd) { bd = d; best = o; } }
    if (!best) {
      // 味方が先に殿を討った時も、本人は最後の目標の退き口まで進む。
      const pt = nfPinPoint(b);
      if (pt) { goTo(p, inp, pt.x, pt.z, 2.5); return true; }
      return false;
    }
    const d = Math.hypot(best.pos.x - u.pos.x, best.pos.z - u.pos.z);
    if (d > 2.6) { goTo(p, inp, best.pos.x, best.pos.z, 2); return true; }
    return patientStrike(p, inp, best, d) === false ? false : true;
  }
  const e = b.army.nearestEnemy(u, 5);
  if (e && !b.army.wallBetween(u.pos, -1, e.pos)) return false;
  const baba = N.step >= 5 && F.rear.units.find((x) => x.name === '馬場信春' && x.alive);
  const pt = baba && Math.hypot(baba.pos.x - u.pos.x, baba.pos.z - u.pos.z) > 3 ? baba.pos : nfPinPoint(b);
  if (pt) { goTo(p, inp, pt.x, pt.z, 2.5); return true; }
  return N.step >= 5 ? false : true;
};
// 総勢は歴史欄だけに置く。個々の討死から全軍の損害へ倍率を掛けない。
// 11/6 fixc1721（九3・十二1）：両軍の今の兵の数を史実の規模で。描く本物の兵一人が討たれるごとに、武田は六十人・織田徳川は四十人分減らす
//   （武田の損害は諸説で一万とも数千とも。終わりに一万五千が七千ほどまで減る目安）。
shitaragahara.force = (rt) => ({ a: Math.max(0, 38000 - (rt?.flags?.ak || 0) * 40), a0: 38000, b: Math.max(4000, 15000 - (rt?.flags?.ek || 0) * 60), b0: 15000 });
// 持ち場へ着き、仲間と並べてから待ち時間だけを飛ばす。
// 11/6 fixc1721：待ちを飛ばす釦は出さない（夜明けの知らせから九秒で寄せが始まる）
shitaragahara.canSkip = () => '';
// 11/6 fixc0504（二1・三1）：柵の守りの間に将の決まり声「敵は怯んだぞ！押し込め！」で柵の外へ誘わない（信長公記：柵から出ずに撃ち退けた）
let SH_RT = null;   // 今の戦（generalLines は rt を受け取らない）
shitaragahara.generalLines = (name, scene) => {
  if (scene !== 'pushing' && scene !== 'enemyFlee') return undefined;
  if (SH_RT?.flags?.pursuit) return scene === 'pushing' ? ['組と並べ！　殿の槍を崩せ！'] : ['離れるな！　組と並んで追え！'];
  return scene === 'pushing' ? ['柵から出るな！　引き付けて放て！', '槍は柵の口で揃えよ！'] : ['追うな！　柵の内で進み太鼓を待て！'];
};
// 織田家編では、味方の紋を織田の木瓜に
shitaragahara.sides = { a: { name: '織田・徳川軍', get mon() { return scenarioKey() === 'oda' ? 'oda' : 'tokugawa'; } }, b: { name: '武田軍', mon: 'takeda' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
// 奉行は各持ち場へ初めから置く。別名の同一人物や土屋を他将の隊へ追加しない。
shitaragahara.famous = [];
// 出典確認：新城市 https://www.city.shinshiro.lg.jp/kanko/meisyo/nagashino-shitaragah.html
shitaragahara.history = '長篠城は寒狭川と宇連川の合流点の崖の上にあり、本丸と野牛曲輪は木の柵と板葺の小屋で守られていた。奥平信昌の約五百が武田一万五千の囲みに耐え、織田・徳川の後詰を待った。天正三年五月二十一日、織田・徳川軍は設楽原で柵と多数の鉄砲を用い、武田軍を破った。武田勢は東の段丘を駆け下り、連吾川とぬかるんだ低地を越えて、柵のある西の段へ登って寄せたとされる。三重の馬防柵と身隠しに加え、川や斜面そのものが守りを助けた。早朝の鉄砲の撃ち合いから槍の勝負へ移り、足軽が柵の外へ誘い出て、敵が寄せれば柵へ引く駆け引きが続いたとされる。騎馬の一斉突撃から始まったとはしない。酒井忠次の別働隊は夜明けに鳶ヶ巣山の砦を攻め、長篠城の囲みを解いた。本作ではその知らせが夜明けの開戦の時に届き、背後を断たれた武田が前へ出る形にする。知らせの届いた時刻は遊びのための補いである。武田の弾は早く尽き、連合軍の厚い兵力と弾薬が勝敗を分けたという見方がある。一番槍を競い、命を惜しまぬ武田勢の気風も、長く戦えた理由とされる。『信長公記』は鉄砲千挺ほどを奉行に預け、柵の外へ出ず、寄せる武田勢を撃ち退けたと記す。山県昌景の赤備え、真田信綱・昌輝らの奮戦と討死は『甲陽軍鑑』にも伝わる。山県・内藤・真田兄弟ら多くの宿将が討死し、午後二時ごろ（未の刻）に武田勢が崩れ、織田・徳川は柵を出て追撃した。馬場信春は出沢・寒狭川方面の退き口で殿を務め、勝頼を逃がして討死したと伝わる。勝頼本人はこの戦で討たれていない。『信長公記』の寄せの順は山県・武田信廉・小幡・武田信豊・馬場であり、本作では南の山県を先手とし、主人公の前へは北の真田、続いて中央の内藤が寄せる形にまとめて描く。各備の順や場所は確定した再現ではない。『信長公記』は家康と滝川一益の陣の前に柵を付けさせたと記す。本作は滝川の備を大宮前の柵の内に置き、その槍組を率いる名の無い侍大将の働きは創作の補いである。明智光秀は長篠に出ておらず、陣に置かない。織田信忠は新御堂山に陣を取った。寄せ手は柵の外で押し合い、虎口でだけ槍を合わせる形にした。柵を破って中へ入られた場面の伝えもあり、本作では口の無い所の柵を土屋昌次の隊が押し倒す場面として描く（場所と人数は遊びの補い）。土屋昌次・原昌胤も柵の前で討死したと伝わる。山県の赤備えの他の武田の兵の具足は黒とし、赤い具足は山県の隊だけにした。新城市の解説は、川や田、柵と多数の鉄砲を組み合わせた守りを紹介している。鉄砲三千挺や三段撃ちは、小瀬甫庵『信長記』以後の書物に伝わる。三段撃ちを裏付ける確かな史料はなく、本作の射撃の交代は、弾込めの間を別の組が補う演出である。三重の柵、細かな備の兵数・居場所・天気・距離・時間と、追撃の道筋・浅瀬・殿の位置は推定と遊びの補いである。北の大宮前から中央の柳田前へは、柵の内を組と歩いて移る。追い討ちは柳田前の虎口から出て連吾川を渡る。馬場の殿の位置は退き口を縮めた遊びの補いである。武将の掛け声は創作である。追撃で渡る浅い川は連吾川で、勝頼が逃れたと伝わる寒狭川そのものではない。南の討死の知らせと備の崩れは戦全体の流れの演出で、目の前の武将を討った手柄とは分ける。総勢は織田・徳川三万八千、武田一万五千とも伝わるが、長篠側の別手を含む数であり、決戦場に全員を置いた意味ではない。';
shitaragahara.date = (rt) => `天正三年五月二十一日　${seasonOf('五月')}・${sky(rt)}`;
shitaragahara.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）


// 信長公記巻八・地形参照：西の織田と徳川、東の武田十三の備え。
// 各備の兵数・間隔は復元。酒井の鳶ヶ巣山別働は決戦場の備に重ねない。
const alliedIds = ['sakuma', 'takigawa', 'nonomura', 'sassa', 'maeda', 'ban', 'fukutomi', 'sakakibara', 'honda'];
const rearIds = ['nobutada', 'hashiba', 'niwa', 'shibata'];
const takedaIds = ['baba', 'tsuchiya', 'sanada', 'sanada_masateru', 'naito', 'hara', 'shoyoken', 'oyamada', 'yamagata'];
const postRows = (posts, ids, count) => posts.map(([name, x, z, fac, mon, kind], i) =>
  ['shitara_' + ids[i], '持ち場の備え', name, null, { x, z }, fac, mon, null, { draw: true, count, kind }]);
const SHITARA_ODA_JIN = battleJin('柵と土塁に沿う織田の備え', 0, CHAUSU, Math.PI / 2, [
  ['shitara_oda_hq', '本陣・茶臼山', '織田信長', null, CHAUSU, 'eiraku', 'oda', (r) => r.flags.camps?.[1]?.guard],
  ...postRows(ALLIED_POSTS.filter((p) => p[3] === 'oda'), alliedIds, 240),
  ...postRows(REAR_POSTS, rearIds, 240),
], '織田三万の目安。布陣図の並びを使うが、各備の人数は不明。五人の鉄砲奉行を別の大軍として加算しない。');
const SHITARA_TOKUGAWA_JIN = battleJin('弾正山と南の柵の守り', 0, IEYASU, Math.PI / 2, [
  ['shitara_ieyasu', '本陣・弾正山の南', '徳川家康', null, IEYASU, 'onri', 'tokugawa', (r) => r.flags.camps?.[0]?.guard],
  ...postRows(ALLIED_POSTS.slice(7), alliedIds.slice(7), 160),
  ['shitara_okubo', '南の柵の控え', '大久保忠世・大久保忠佐', null, { x: -95, z: 390 }, 'okubo', 'tokugawa', null, { draw: true, count: 100, named: false }],
  ['shitara_ishikawa', '南の丘の控え', '石川数正', null, { x: -145, z: 290 }, 'tokugawa', 'tokugawa', null, { draw: true, count: 100 }],
], '徳川八千の目安。細かな人数と控えの位置は復元。酒井忠次は鳶ヶ巣山の別働へ出ており、南の柵に本人を二重に置かない。');
const SHITARA_TAKEDA_JIN = battleJin('川向こうの十三の備え', 1, KATSUYORI, -Math.PI / 2, [
  ['shitara_katsuyori', '本陣・才の神方面', '武田勝頼', null, KATSUYORI, 'takeda', 'takeda', (r) => r.flags.katsCamp?.guard],
  ...postRows(TAKEDA_POSTS, takedaIds, 120).map((row, i) => { if (i === 0) row[7] = (r) => r.flags.rear; return row; }),
  ['shitara_anayama', '中央の親類衆の控え', '穴山信君', null, { x: 280, z: -60 }, 'takeda', 'takeda', null, { draw: true, count: 80 }],
  ['shitara_nobutoyo', '中央の親類衆の控え', '武田信豊', null, { x: 280, z: 70 }, 'takeda', 'takeda', null, { draw: true, count: 80 }],
  ['shitara_south', '南の国衆の控え', '将の名は不明', null, { x: 230, z: 300 }, 'takeda', 'takeda', null, { draw: true, count: 60, named: false }],
], '武田一万五千から鳶ヶ巣山の三千を除き、決戦場は一万二千の目安。十三か所の記述を採用し、全ての備の将や順が確定したとはしない。');
installBattleJinkei(shitaragahara, [SHITARA_ODA_JIN, SHITARA_TOKUGAWA_JIN, SHITARA_TAKEDA_JIN]);

// 武将の名簿（bushou_roster.js）から、この戦に出てまだ場にいない武将を足す（11/01 bushou_17_32）。鳶ヶ巣山の別働（酒井・金森）・長篠城の奥平・野々村正成（野々村三十郎）は重ねない。
shitaragahara.bushou = ['織田信忠', '柴田勝家', '丹羽長秀', '佐久間信盛', '滝川一益', '羽柴秀吉', '本多忠勝', '榊原康政', '大久保忠世', '大久保忠佐', '甘利信康', '小山田信茂', '穴山信君', '武田信廉', '武田信豊'];
// 倒す数（kaito_play O）：柵へ寄せる今の備（と後から出る騎馬）を退ければ次の備が来る。waveDefeated と同じ物差しで数える
KILLS.shitaragahara = { 0: (rt) => {
  const F = rt.flags, N = F.nf;
  const extra = ST_TAME.group(rt) || ST_BREACH.group(rt) || ST_HARA.group(rt) || (ST_SOKO.active(rt) && rt.flags.shSoko.call && !rt.flags.shSoko.there ? ST_SOKO.group(rt) : null);
  if (extra) return broke([extra], (u) => u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget, (q) => q.routed);
  const g = N && N.step <= 3 && !ST_INTRO.active(rt) ? F.waveGroups[N.step <= 1 ? 0 : 1] : null;
  return g && g.units ? broke([g, g.cavalry], (u) => u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.gone && !u.noTarget, (q) => q.routed) : null;
} };
// 命懸けの戦場（docs/lethal_howto.md）。柵の前の鉄砲と騎馬の突き。開戦の二分は静かに、間を広く（11/9 先取りの列）
shitaragahara.lethal = { max: 5, firstAt: 120, gap: 55 };
export { shitaragahara };
