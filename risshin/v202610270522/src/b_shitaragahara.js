import { useTerrain } from './asset_manifest.js';
import { placeGroup, placePlayer } from './b_opening.js';
import { jinkeiBuild } from './jinkei.js';
import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
import { tsuigekiRetreat, tsuigekiStart, tsuigekiTick } from './c20_tsuigeki.js';
// 設楽原：備ごとの寄せ、柵際の乱戦、内側への後退と合図の一斉射。細部は説による復元。
import { gauss, allyGroup, nm, enemyGroup, centerOf } from './bhelp.js';
import { buildBobosaku } from './b_sunomata.js';
import { scenarioKey, RANKS } from './state.js';
import { S as SETTINGS } from './settings.js';
import { isTouch } from './touch.js';
import { nagashinojo } from './b_nagashinojo.js';
import { nobori, tawara, stumps, dou, yagura, hiraTateGeo, WOOD_MAT, paintGeo } from './props.js';
import { goten } from './castle_parts.js';
import { tabaGeo, tabaMat } from './taketaba.js';
import { sfx } from './audio.js';
import { battleEvent, EVENT_VOLLEY, EVENT_MESSENGER, EVENT_RETREAT } from './battle_events.js';
import { sightPoint } from './battle_sight.js';
import { sendOrder } from './denrei.js';
import { seasonOf, sky } from './b_shared.js';
import * as DP from './b_depth.js';
import { depthTick, depthStart } from './b_depth.js';
import { camp } from './b_mid.js';
import { demBlend } from './dem.js';
import { drawGroundAt } from './render_camera.js';
import { localClear } from './army_local_way.js';
import { slopeLitter, contactLitter, groundFlagVariant } from './army_ground.js';
import { rockShape, rockTuftShape, groundRocks } from './rock_shape.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flagTexture } from './textures.js';
import { timeslipField } from './timeslip_field.js';
// 地面を作る前に標高を読み終える。後から届いても地面の格子は作り直されない。
let DEM = null;
useTerrain('dem_shitaragahara', (data) => { DEM = data; });
import { tagZones, gapSize, inArc, assignBands, ceaseBands, kamaeBands, volleyBands, rollBands, losTick, reserveTick } from './yasen_jinchi.js';

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
  if (footGone && !g.opened && !g.cavSent && !g.escortsRetiring) {
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
  for (let i = 0; i < rt.flags.guns.length; i++) {
    const g = rt.flags.guns[i];
    for (const u of g.units) {
      if (!(u.fireT > 0)) { u.shSmokeSeen = false; continue; }
      if (u.shSmokeSeen) continue;
      u.shSmokeSeen = true;
      rt.flags.smokeBands[i].shotAt = rt.t;
      if (rt.t - (g.shShotAt ?? -9) > 0.6) { g.shShotAt = rt.t; g.shShotN = 0; }
      g.shShotN++;
      if (g.shShotN === 2 && rt.t - (g.shVolleySoundAt ?? -9) >= 8) {
        g.shVolleySoundAt = rt.t; sfx('volley', 0.65);
      }
      const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
      rt.army.smoke(u.pos.x + fx * 2, u.pos.y + 1.5, u.pos.z + fz * 2, fx, fz, 2.4);
      if (g.shShotN === 1) {
        rt.world.gunSmoke(u.pos.x + fx * 2, u.pos.z + fz * 2, 0xeeeae2);
        // 同じ煙の枠へ一斉射の厚みを溜め、三列の撃つ順を見せる。
        rt.world.gunSmoke(u.pos.x + fx * 2, u.pos.z + fz * 2, 0xeeeae2);
        // 撃った組は弾込めへ少し下がる。その間の射撃を別の組が補う。
        const h = g.shRow;
        if (h && !rt.flags.pursuit && !(h.shReturnAt > rt.t)) {
          h.shReturnAt = rt.t + 6;
          h.moveTo(h.army.cx - 0.8, h.army.cz, 1);
          rt.after(6, () => { if (!rt.flags.ending && !rt.flags.pursuit) h.moveTo(h.army.cx, h.army.cz, 1); });
        }
      }
    }
  }
}
// 箱の空いた隅で支えると横倒しの馬が浮く。見える体の表面を坂へ接地する。
// 両姿勢は開戦時・落馬時だけ測り、倒れる間は保存した値を使う。
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
  horse.rotation.z = -1.5;
  slopeLitter(horse, ground, floor);
  contactLitter(horse, ground, floor, .015);
  horse.userData.shLieY = horse.position.y;
  horse.userData.shLieQ = horse.quaternion.clone();
  shHorseTilt(horse, 0);
  horse.visible = visible;
}
function shHorseTilt(horse, k) {
  horse.quaternion.slerpQuaternions(horse.userData.shStandQ, horse.userData.shLieQ, k);
  horse.position.y = horse.userData.shStandY + (horse.userData.shLieY - horse.userData.shStandY) * k;
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
  horse.position.set(u.pos.x, rt.world.heightAt(u.pos.x, u.pos.z) + 0.55, u.pos.z);
  horse.rotation.set(0, u.heading, 0);
  horse.traverse((m) => { if (m.isMesh) { m.onBeforeRender = () => {}; delete m.userData.lod; } });
  shHorseRest(rt, horse);
  rt.scene.add(horse);
  F.fallenHorses.push({ horse, at: rt.t });
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
  rt.unmark('next_mouth'); rt.unmark('overrun');
  rt.marker('command', p, '槍の持ち場', SH_HOLD_GUIDE);
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
  if (!source) {
    const z = /南|山県|赤備え/.test(text) ? MOUTHS[2].z
      : /北|真田|丸山/.test(text) ? MOUTHS[0].z : MOUTHS[1].z;
    source = /羽柴/.test(text) ? { x: REAR_POSTS[1][1], z: REAR_POSTS[1][2] }
      : { x: F.fenceRoute.rearX, z };
  }
  sendOrder(rt, source, rt.player.u, { id: 'report', apply() {
    // 戦況が変わった後に、済んだ寄せの下知を届け直さない。
    if (F.ending || rt.over || !rt.player.u.alive || !!F.pursuit !== pursuit || wave?.doneWave) return;
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

const METRES = 2;
const DEM_SCALE = 1 / METRES;
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
const RENGO = [[22, -760], [20, -500], [22, -280], [24, -20], [20, 180], [22, 350], [24, 500], [22, 760]];
const OMIYA = [[-190, -760], [-170, -400], [-160, 0], [-175, 350], [-190, 760]];
const CHAUSU = { x: -486, z: -100 }; // 柵から実距離約一キロ、西の奥
const KATSUYORI = { x: 430, z: 10 }; // 才ノ神の本陣。東の丘を越えた後方
// 出沢・寒狭川方面の退き口を縮めた遊び用の位置。連吾川と寒狭川を混同しない。
const REARGUARD = { x: 210, z: -320 };
const ESCAPE = { x: 690, z: -420 };
const IEYASU = { x: -80, z: 350 };
const MARUYAMA = { x: -28, z: -440 };
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
  ['仙石秀久', -55, -340, 'oda', 'oda', 'spear'],
  ['野々村正成', -55, -200, 'oda', 'oda', 'gun'],
  ['佐々成政', -55, -70, 'oda', 'shuro', 'gun'],
  ['前田利家', -55, 0, 'oda', 'maeda', 'gun'],
  ['塙直政', -55, 70, 'oda', 'oda', 'gun'],
  ['福富平左衛門', -55, 140, 'oda', 'oda', 'gun'],
  ['榊原康政', -65, 240, 'tokugawa', 'tokugawa', 'spear'],
  ['本多忠勝', -65, 440, 'tokugawa', 'honda', 'spear'],
];
const REAR_POSTS = [
  ['明智光秀', -240, -420, 'oda', 'akechi', 'spear'],
  ['羽柴秀吉', -300, -320, 'oda', 'oda', 'spear'],
  ['丹羽長秀', -240, -230, 'oda', 'sujikai', 'spear'],
];
const TAKEDA_POSTS = [
  ['馬場信春', 250, -440, 'takeda', 'takeda', 'spear'],
  ['土屋昌次', 105, -340, 'takeda', 'takeda', 'mixed'],
  ['真田信綱', 110, -240, 'takeda', 'sanada', 'mixed'],
  ['真田昌輝', 140, -170, 'takeda', 'sanada', 'mixed'],
  ['内藤昌豊', 105, -30, 'takeda', 'takeda', 'mixed'],
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
const SH_HOLD_GUIDE = { h: .1, guideArea: 'guard', guideRadius: 7, waitGuide: () => '柵の内で 仲間と守る' };
const SH_CHASE_WAIT = '仲間がそろうまで 柵で待つ';
// 到着後の下知と、押す釦の操作を混ぜない。
function shGuardOrder(rt) {
  if (rt.flags.chaseOrdered && !rt.flags.pursuit) return SH_CHASE_WAIT;
  if (!rt.flags.pursuit && (rt.flags.cur?.doneWave || rt.flags.waveRest)) return '柵の内で 次の敵を待つ';
  const P = rt.player, p = P.u.pos;
  for (const enemy of rt.army.units) {
    if (!enemy.alive || enemy.team === P.u.team || enemy.gone || enemy.fleeing ||
        enemy.woundOut || enemy.noTarget || enemy.invuln || Math.abs(enemy.pos.y - p.y) > 1.5) continue;
    if (Math.hypot(enemy.pos.x - p.x, enemy.pos.z - p.z) <= P.meleeReach(P.weapon === 'sword' ? 'slash' : 'thrust') &&
        !rt.army.wallBetween(p, -1, enemy.pos)) {
      return rt.def.attackOpening(rt, enemy) ? 'てきを たおす' : 'かまえて ふせぐ';
    }
  }
  if (rt.flags.pursuit) return rt.player.guard ? '仲間と まもっている' : '仲間と 槍を構えよう';
  return rt.player.guard ? '柵の内で まもっている' : '柵の内で 槍を構えよう';
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
    return rt.flags.tsuigeki?.stage === 3 ? '仲間と並び、馬場隊へ槍を向けよ' : '組を離れるな。退く武田の旗を追え';
  }
  if (!rt.flags.pursuit && /敵は総崩れじゃ|敵が背を見せた！|敵が崩れた！|敵が槍を捨てた！|敵が下がった！.*押せ|敵が退いて列を組み直す|敵が息を継いでおる|敵の列が乱れておる/.test(text)) {
    return '寄せ手が退く。柵の内で次の下知を待て';
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
// 一番近い残りの敵（柵の守りでは柵のそば、追撃では殿の兵だけ）。半秒ごとに選び直し、毎コマ全員を見ない。
function shNearestFoe(rt) {
  const F = rt.flags, me = rt.player.u;
  if (rt.t < (F.shFoeAt || 0) && (F.shFoe === null || shFoeOK(F.shFoe, me))) return F.shFoe;
  F.shFoeAt = rt.t + .5;
  let best = null, bd = Infinity;
  const list = F.pursuit ? F.rear?.units || [] : rt.army.units;
  for (const u of list) {
    if (!shFoeOK(u, me)) continue;
    // 柵の守りでは、柵を越えて来る敵だけを数える（川向こうの控えへ誘わない）。
    if (!F.pursuit && (u.pos.x > SB.x0 + 14 || u.pos.x < -80)) continue;
    const d = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2;
    if (!F.pursuit && d > 45 * 45) continue;
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
  for (const u of g.units) {
    if (u.type !== 'busho' || !shFoeOK(u, me) || u.pos.x > SB.x0 + 14) continue;
    if (Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) < 40) return u;
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

const shitaragahara = {
  mapBadgeTai: true, // 地図の組の札を「隊N」で出す（hud_map）
  // 稲生の水準：右上は任務の一行だけ。段の丸・小旗・避ける札・足元の白い輪・空振りの音は出さない。
  missionSingleLine: true,
  hideMissionDots: true,
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  noPlayerFoot: true,
  quietMiss: true,
  inouFeel: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  // 大きな見出しは決着の時だけ。段の替わりは任務の一行とピンで伝える。
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /退却|討ち取|勝/.test(t),
  missions: ['持ち場へ', '柵を守れ', '▼の敵をたおせ', '大将をたおせ', '合図を待て', '馬場隊を追え', '組と帰れ'],
  // 毎回いまの戦場から決める。討った・着いた瞬間に次の一行へ替わり、古い字を残さない。
  missionOf(rt) {
    const F = rt.flags;
    if (F.ending) return 6;
    if (shCommander(rt)) return 3;
    if (F.chaseOrdered && !F.pursuit) return 4;
    if (F.pursuit) {
      const u = shNearestFoe(rt), me = rt.player.u.pos;
      return u && Math.hypot(u.pos.x - me.x, u.pos.z - me.z) < 30 ? 2 : 5;
    }
    if (shNearestFoe(rt)) return 2;
    const pt = shPostPoint(rt), me = rt.player.u.pos;
    return pt && Math.hypot(pt.x - me.x, pt.z - me.z) > 7 ? 0 : 1;
  },
  missionHeading(rt) {
    const i = shitaragahara.missionOf(rt);
    if (i === 3) return `${shCommander(rt).name}をたおせ`;
    return shitaragahara.missions[i];
  },
  commanderTarget: (rt) => shCommander(rt),
  missionSignTarget(rt) {
    const i = shitaragahara.missionOf(rt);
    return i === 3 ? shCommander(rt) : i === 2 ? shNearestFoe(rt) : null;
  },
  namedGuideTarget: (rt) => shCommander(rt),
  // 守る段は持ち場に刺したまま（味方もそこへ集まる）。倒す段は一番近い残りの敵へ。追撃は殿の旗へ。
  missionPin(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive) return null;
    const q = F.shPin || (F.shPin = { x: 0, z: 0, r: 5, hide: 5 });
    const me = rt.player.u.pos, i = shitaragahara.missionOf(rt);
    q.unit = null; q.enemy = false; q.waiting = false; q.arrived = false; q.defend = false;
    q.follow = false; q.fire = false; q.gate = false; q.footRing = false; q.area = false; q.passage = false;
    if (i === 2 || i === 3) {
      const u = i === 3 ? shCommander(rt) : shNearestFoe(rt);
      // 槍の届く近さでは頭上の▼に任せ、足元にピンを重ねない。
      if (!u || Math.hypot(u.pos.x - me.x, u.pos.z - me.z) < 12) return null;
      q.x = u.pos.x; q.z = u.pos.z; q.r = q.hide = 8;
      return q;
    }
    if (i === 5) {
      const id = shitaragahara.guideMarker(rt), m = rt.markers.find((x) => x.id === id);
      const pt = m && (typeof m.pos === 'function' ? m.pos() : m.pos);
      if (!pt) return null;
      q.x = pt.x; q.z = pt.z; q.r = q.hide = F.tsuigeki?.stage < 3 ? 3 : 7;
      return q;
    }
    const pt = shPostPoint(rt);
    if (!pt) return null;
    q.x = pt.x; q.z = pt.z; q.r = q.hide = 5;
    q.waiting = q.defend = true; q.arrived = Math.hypot(me.x - pt.x, me.z - pt.z) < 7;
    return q;
  },
  // 民は war_people の共有する形で描く。兵の名簿・人数・当たり・戦功へ加えない。
  civilianCrowd: { bounds: { minX: -740, maxX: 740, minZ: -740, maxZ: 740 }, bands: PEOPLE_BANDS },
  singlePassageArrow: true, // 次に通る柵のすき間を、一つの矢印で示す。
  compactHoldGuide: true, // 持ち場の中心には輪と矢印を置く。
  compactGroundGoalRing: true, // 輪の太さと最小径を抑え、足元の兵や落ちた武具を見せる。
  compactGuardPostRing: true, // 到着後の守備の輪にも小さい表示を適用する。
  smallTaskAreas: true, smallRetreatAreas: true, taskAreaFootRing: true, // 待機・退避の強調も足元の小旗へそろえ、柵際を大輪で囲まない。
  subtleGroundGuides: true, // 持ち場の小さい印を残し、携帯でも兵と柵を見せる。
  keepOpeningTaskLabel: true, // 始まりの「ここへ」で、柵へ進んで槍を構える下知を消さない。
  keepWaitOrderLabel: true,
  waitGuardButtonText: 'おして やりをかまえよう',
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
  openingWait: (rt) => Math.hypot(rt.player.u.pos.x - rt.flags.prepPt.x,
    rt.player.u.pos.z - rt.flags.prepPt.z) < SH_HOLD_GUIDE.guideRadius,
  releaseGuardForAttack: true, // 槍の届くすきには、防ぐ長押しから既存の反撃案内へ渡す。
  meleeGuide(rt, enemy) {
    const F = rt.flags, P = rt.player;
    if (!F.prepDone || F.ending || !enemy) return false;
    // 虎口と浅瀬では道案内を保つ。渡河後は道中の殿の反撃も受けられる。
    if (F.pursuit && !(F.tsuigeki?.stage >= 2)) return false;
    if (F.pursuit && F.tsuigeki.stage === 3) return true;
    return Math.hypot(enemy.pos.x - P.u.pos.x, enemy.pos.z - P.u.pos.z)
      <= P.meleeReach(P.weapon === 'sword' ? 'slash' : 'thrust') ||
      enemy.atk?.target === P.u || enemy.swing?.target === P.u && !enemy.swing.done;
  },
  waitGuardAllowed(rt) {
    // 持ち場に着いたら寄せ手が来る前から構えられる。移動中の案内は保つ。
    const F = rt.flags, p = rt.player.u.pos;
    if (F.ending || F.pursuit && !(F.tsuigeki?.stage >= 2)) return false;
    if (!F.pursuit) {
      const mark = rt.markers.find(m => m.id === this.guideMarker(rt));
      const pt = mark && (typeof mark.pos === 'function' ? mark.pos() : mark.pos);
      if (pt) return Math.hypot(p.x - pt.x, p.z - pt.z) < (mark.guideRadius || 7);
    }
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
    if (F.ending || rt.over || !F.prepDone || F.pursuit && !(F.tsuigeki?.stage >= 2) ||
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
  distanceUnit: 'ken',
  immediateTaskChanges: true, // 渡河・後退・殿への到着で、古い行き先を十秒残さない。
  keepTaskLabel: true, // 近い敵が見えても、柵を離れて倒しに行く下知へ替えない。
  keepTaskPanel: true, // 敵の拡大札へ切り替えず、柵の持ち場と馬場隊への下知を残す。
  keepApproachTaskPanel: true, // 敵へ寄る時も下知を残し、兵の姿は実物の小さい敵印で示す。
  keepGuardTaskLabel: true, // 守備中も持ち場の下知を残し、敵一人を追う札へ動かさない。
  keepTaskWithGuard: false, // 到着後は長押しの札一枚にまとめる。
  keepDestinationTask: true, // 持ち場と受け方を、旗へ進むだけの案内で隠さない。
  meleeTurnText: '敵のほうへ なぞれ', // 指と矢印を添える共通の案内で、触る場所と向きを示す。
  meleeApproachText: () => isTouch ? '自分から敵へ なぞって進む' : '印の敵へ 進もう',
  waitOrderLabel: (rt, reached) => rt.flags.chaseOrdered && !rt.flags.pursuit ? SH_CHASE_WAIT : reached ? shGuardOrder(rt) : rt.flags.pursuit ? '敵の馬場隊へ すすむ' : '柵の内の旗へ すすむ',
  hideGuideSteps: true, // 行き先は一つの下知にまとめ、小さい歩数を重ねない。
  clearTravelGuide: true, // 追撃の旗と行き先の字の重なりを避ける。
  travelGuideLabel(rt) {
    if (!rt.flags.pursuit) return '持ち場へ';
    const stage = rt.flags.tsuigeki?.stage;
    return stage === 0 ? '柵の口へ' : stage === 1 ? '浅瀬へ' : '敵・馬場隊へ';
  },
  keepRetreatReason: true,
  keepWoundRetreatReason: true,
  retreatGuideLabel(rt, reached) {
    const u = rt.player.u;
    if (!reached) return u.wounds?.bleed > .0001 ? '血を止めるため 下がろう' : 'ここまで下がろう';
    if (u.wounds?.bleed > .0001) return '血を止めよう';
    if (u.hp < u.maxHp * .3) return '仲間のそばで 身を守れ';
    return 'ここで 槍を構えよ';
  },
  retreatGuidePath: shRetreatPath,
  routeGuidePriority(rt) {
    const stage = rt.flags.tsuigeki?.stage;
    return !!rt.flags.pursuit && stage < 3 && !(stage === 2 && this.waitGuardAllowed(rt));
  },
  movePathDirection: true, // 浅瀬が画面外でも、旗だけでなく実際に進む向きを示す。
  routeWaymarks: true, // 岸から渡り口まで、既存の経路へ矢印を並べる。
  routeWaymarkLabel: 'ここを渡る',
  guidePath(rt, marker) {
    const F = rt.flags, T = F.tsuigeki;
    if (!F.pursuit || F.ending || T?.stage !== 1 || marker?.id !== 'pursuit_road') return null;
    if (F.fordGuidePath) return F.fordGuidePath;
    const z = T.points[1].z;
    for (let i = 1; i < RENGO.length; i++) {
      const a = RENGO[i - 1], b = RENGO[i];
      if (z < a[1] || z > b[1]) continue;
      const x = a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
      // 浅瀬の手前の岸から、実際の渡河先まで。経路と到着の判定は変えない。
      const path = [{ x: x - 8, z }, { x: T.points[1].x, z }];
      return F.fordGuidePath = path;
    }
    return null;
  },
  routeSignPoint(rt, fallback) {
    const frame = this.placeFrame(rt);
    if (!frame) return fallback;
    const point = rt.flags.passagePoint || (rt.flags.passagePoint = { x: 0, y: 0, z: 0 });
    point.x = (frame[2].x + frame[3].x) / 2;
    point.y = (frame[2].y + frame[3].y) / 2;
    point.z = (frame[2].z + frame[3].z) / 2;
    return point;
  },
  placeFrame(rt) {
    const F = rt.flags;
    if (!F.pursuit || F.ending || F.tsuigeki?.stage !== 0) return null;
    // 三重の柵で次に通る口を囲む。ずれた三列すべてを通れる幅に合わせる。
    const p = rt.player.u.pos;
    const row = p.x < SB.x0 - SB.gap - 1 ? 2 : p.x < SB.x0 - 1 ? 1 : 0;
    const x = SB.x0 - row * SB.gap, z = F.tsuigeki.points[0].z;
    const frame = F.pursuitFrame || (F.pursuitFrame = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0 })));
    for (let i = 0; i < 4; i++) {
      const q = frame[i];
      q.x = x; q.z = z + (i === 0 || i === 3 ? -1.5 : 1.5);
      q.y = drawGroundAt(rt.world, q.x, q.z) + (i < 2 ? 3.2 : .1);
    }
    return frame;
  },
  dodgeLabel: (rt, direction, rain) => direction || 'いまは さがれ',
  // けがの札は体への影響を示す。追撃の下知と逆向きの案内を常時出さない。
  retreatForLimbWounds: false, // 止血後の手足のけがだけでは退かせない。出血と瀕死の案内は残す。
  woundEffectText: (_rt, slow) => slow ? '足のけが・歩みが遅い' : '腕のけが・突きが弱い',
  guardPurposeText: (rt) => rt.flags.pursuit ? '仲間と槍で止めよう' :
    rt.flags.cur?.doneWave || rt.flags.waveRest ? '次の敵にそなえよう' : '仲間と 槍で止めよう',
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
  introTaskFirst: true, // 横画面でも、人物紹介より先に柵を守る下知を見せる。
  introText: '武田の騎馬が柵へ寄せてくる。ピンの柵の内で敵を突き、合図のあと馬場隊を追え。',
  taskText(rt, text) {
    const F = rt.flags;
    if (F.ending) return text;
    if (F.chaseOrdered && !F.pursuit) return SH_CHASE_WAIT;
    if (F.pursuit && F.tsuigeki?.stage < 3) {
      if (F.tsuigeki.stage === 0) return '柵の間へ進もう';
      if (F.tsuigeki.stage === 1) return 'ここを渡る';
      if (this.waitGuardAllowed(rt)) return '殿の槍を受け 仲間と突こう';
      const at = F.rearGuidePoint, p = rt.player.u.pos;
      return F.rearAtExit && at && Math.hypot(p.x - at.x, p.z - at.z) <= 12
        ? '仲間と 馬場隊をたおせ' : '仲間と 退く馬場隊を追おう';
    }
    // 共通の戦闘案内が分かる言葉にそろえ、近い敵には旗の輪より敵印を出す。
    if (F.pursuit && F.tsuigeki?.stage === 3) {
      const at = F.rearGuidePoint, p = rt.player.u.pos;
      return at && Math.hypot(p.x - at.x, p.z - at.z) > 12
        ? '敵の馬場隊へ すすむ' : '仲間と 馬場隊をたおせ';
    }
    if (F.pursuit || !rt.objectives.some(o => o.id === 'hold' && !o.state)) return text;
    // 北を守った報告と次の操作を一枚へ詰め込まない。報告は台詞と任務一覧に残す。
    const id = this.guideMarker(rt);
    const mark = rt.markers.find(m => m.id === id);
    const pt = mark && (typeof mark.pos === 'function' ? mark.pos() : mark.pos);
    if (!pt) return text;
    const here = Math.hypot(rt.player.u.pos.x - pt.x, rt.player.u.pos.z - pt.z) < (mark.guideRadius || 7);
    if (F.cur?.doneWave || F.waveRest) return here ? shGuardOrder(rt) : '持ち場の印へ';
    if (F.overrunShown) return here ? '仲間と敵を押し返そう' : '奥の旗へ戻ろう';
    if (!here) return '持ち場の旗へ すすむ';
    return shGuardOrder(rt);
  },
  // 追撃は各地点の百五十秒で締める。共通の八分で途中の任務と帰り支度を切らない。
  pacingWait: (rt) => !!rt.flags.pursuit || !!rt.flags.ending,
  battleVoices: { lines: { ally: {
    withdraw: ['組と並び、槍を敵へ向けよ！'],
    encircle2: ['敵に囲まれた！　組と並び、槍を敵へ向けよ'],
  } } },
  guideMarker(rt) {
    const F = rt.flags;
    if (F.ending) return null;
    if (F.pursuit) return F.tsuigeki?.stage === 3 ? 'pursuit_goal' : 'pursuit_road';
    if (F.overrunShown) return 'overrun';
    if (F.cur?.withdrew && !F.cur.doneWave) return 'command';
    if (!F.prepDone) return 'prepare';
    // 内側の旗へ下がると次の口の印は外す。同じ持ち場の印へ案内を引き継ぐ。
    return rt.markers.some((m) => m.id === 'command') ? 'command' : 'next_mouth';
  },
  // 追撃では退散中の別隊へ印を移さず、実際に追う殿の兵を示す。
  objectiveEnemies: (rt) => rt.flags.pursuit ? rt.flags.rear?.units : null,
  noAllyReports: true, // 遠い武将の掛け声を、使番で繰り返さない。
  // 追い討ちの下知と敵の目前では、柵の修理へ誘わない。
  fenceUseOK: (rt) => !rt.flags.pursuit && !rt.flags.ending && !rt.army.nearestEnemy(rt.player.u, 6),
  groundStandards: true, // 坂でも隊旗の竿を地面から立て、持ち手と旗の位置を合わせる。
  noticeOnce: true, // この戦では、台詞と知らせの同文を一度だけ出す。
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
  playerTaken: 0.75, // 柵の口へ来る武田の侍は三太刀で命を八割削っていた（bot 10/26 に二度倒れた）。傷を四分の三に
  spawn: { x: OUTER_POST_X, z: SB.gates[0] + 4.5, heading: Math.PI / 2 },
  moveLim: 740, // 南北の虎口・両本陣・東の退路を、歩ける場にも収める
  taisho: { a: { name: '織田信長', use: true }, b: { name: '武田勝頼', def: true } },
  noTaishoRaid: true, // 柵と川を無視して本陣を狙う共通の新手は出さない
  wakeRoom: 245,
  prelude: false, // 霧の寄せをすぐ始める。共通の待機で隊を止めない。
  // 身の回りの当時の場（timeslip_field.js）。天正三年五月二十一日は今の七月上旬・梅雨の晴れ間。
  // 前日までの雨で連吾川べりの田と畦はぬかるみ、夏草は丈が高い。柵の口ほど踏み荒らされ、倒れた槍・武田方の旗・矢が散る。
  // 柵の内には鉄砲衆の玉薬の俵と織田の幟。追い討ちの東の野も、馬場隊の殿と斬り合った所ほど荒れる。
  timeslip: {
    wet: 0.25, dust: 0.3, trample: 0.3, debris: 1.1, arrows: 0.5,   // 晴れ間の朝。水たまりは置かない（朝の空を映して白い円盤に見えた）
    grass: 0x7e9c50, grassTints: [0xffffff, 0xe6eecc, 0xd4dca8], grassH: 1.2, tallGrass: 0.9,
    flagColors: [0xe8e2d2, 0x1e1c1a, 0x9a2c22],
    fights: [...SB.gates.map((z) => [SB.x0 + 4, z + 4.5, 34]), [REARGUARD.x, REARGUARD.z, 40], [250, -440, 34]],
    sets: [
      { k: 'tawara', x: -14, z: SB.gates[0] - 6, rot: 0.2, n: 6 },
      { k: 'tawara', x: -14, z: SB.gates[1] - 6, rot: -0.3, n: 5 },
      { k: 'nobori', x: -18, z: SB.gates[0] + 14, dx: 0, dz: 4, n: 3, kind: 'oda', h: 5 },
    ],
  },
  world: {
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
    bobosakuCrossed: true,
    bobosakuGroundMound: false, // 土盛りと空堀は地形で作る。三列の根元へ土の板を重ねない。
    // 長い柵は材質ごとに結合し、画面と影に入る区画だけを描く。破壊は区画ごとに保つ。
    mergeFenceBatches: true,
    distantMaterialBatch: true,
    staticBatchBeforeDraw: true, // 柵の索引を転送前に確定し、前の視点の面を送らない。
    staticBackfaceCull: true, // 柵の裏向きの面は送らず、列の密度と影は保つ。
    staticFaceCell: 2, // 長い馬防柵の画面外を二メートル区画で外す。同じ材質は一回で描く。
    distantDetailGrid: 0.05,
    distantDetailNear: 28,
    distantDetailFarGrid: 0.2, // 遠い柵の凹凸だけをまとめ、細い杭と横木の輪郭は既存の判定で保つ。
    distantDetailFar: 64, // 六十四メートル先の凹凸だけ軽くし、細い杭や横木の輪郭保護は保つ。
    middleInfantryArms: true, // 近い控えの中距離の形にも腕・袖を残す。既存の軽い形を共有する。
    highClashDetail: true, // 遠い乱戦の細部だけを省く。兵の数・位置・斬り合いは同じ。
    highClashFarDetail: 24, // 二十四メートル先は輪郭の形を共有し、袖と草摺の細部だけを省く。
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
    lifeSizePinnedArrows: true, // 刺さった矢は兵の骨や体の倍率を受けず、実寸のまま残す。
    pinnedArrowAxisScale: true, // 斜めの矢は矢自身の三軸で縮尺を戻し、胴から長い柄を伸ばさない。
    plantedArrows: true, // 地面の矢は鏃を下へ向け、羽だけの黒い板を足元に残さない。
    arrowRainGroundCue: false, // 柵際を白黒の大輪で覆わない。矢の影・警告・退き先は残す。
    muddy: 0.25,
    mist: true,
    mistFar: 330, // 朝霞は遠い丘に残し、川向こうの寄せ手と柵の木組みを見せる。
    groundMistScale: 0.22, // 川岸の薄い靄を残し、足元と柵の口を白い帯で隠さない。
    smokeFogFloor: 260, // 硝煙の粒は残し、近い寄せ手まで白い壁で隠さない。
    wetStart: 0.55,      // 前の雨で湿った地面。朝の戦の間は雨を降らせない
    time: 'day',
    runnerWay: shRunnerWay,
    moveWay: shRunnerWay,
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
      if (DEM) h = demBlend(DEM, x - 22, z, h, { scale: DEM_SCALE, xyScale: METRES });
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
          if (DEM) bank = demBlend(DEM, rx - 22, z, bank, { scale: DEM_SCALE, xyScale: METRES });
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
        c.setRGB(0.43 - patch * 0.07, 0.36 + patch * 0.06, 0.24 - patch * 0.03);
      }
      // 草の丘・畦・湿った土を分け、東の追い道にも明暗を残す。
      if (x > 36 && x < 320) {
        // 川岸と奥の丘では元の色へ戻し、草色の帯の継ぎ目も残さない。
        const edge = Math.min(1, (x - 36) / 24, (320 - x) / 24);
        const grass = (0.28 + 0.50 * shSoilPatch(x, z)) * edge * edge * (3 - 2 * edge);
        c.setRGB(c.r * (1 - grass) + 0.30 * grass, c.g * (1 - grass) + 0.38 * grass, c.b * (1 - grass) + 0.19 * grass);
      }
      // 川沿いの湿った田
      if (Math.abs(x - 21) < 14) c.setRGB(c.r * 0.85, c.g * 0.9, c.b * 0.8);
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
    const W = rt.world;
    const F = rt.flags;
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・夏草（def.timeslip）
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
          vec2 shift = vec2(sin(cell.y * 2.3 + cell.x), sin(cell.x * 1.7 - cell.y)) * 1.3;
          vec2 size = vec2(3.0, 4.5) + vec2(sin(cell.y * 1.3), sin(cell.x + cell.y * 2.1)) * 1.1;
          vec2 q = (mod(p, vec2(11.0, 16.0)) - vec2(5.5, 8.0) - shift) / size;
          float a = sin(cell.x * 1.9 + cell.y * 0.8) * 0.65;
          q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
          float rim = length(q) + sin(q.x * 4.0 + cell.y * 1.7) * 0.16
            + sin(q.y * 5.0 + cell.x * 2.3) * 0.12;
          return (1.0 - smoothstep(0.55, 1.1, rim))
            * smoothstep(28.0, 29.5, p.x) * (1.0 - smoothstep(56.5, 58.0, p.x))
            * ${W.field.wet ? '1.0' : '0.0'};
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
          'col * vec3(0.62, 0.58, 0.48) + mud * 0.12')
        .replace('float wat = shPaddyWater;', `float wat = shPaddyWater;
          // 水際だけ湿った泥色につなぎ、青い紙のような輪郭を消す。
          float shMudRim = smoothstep(0.0, 0.3, wat) * (1.0 - wat);
          col = mix(col, mud * vec3(0.8, 0.7, 0.55), shMudRim * 0.65);`);
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
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.19, 0.155, 0.105), shWetSoil * 0.56);
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
        reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.10
          ${lowPuddles ? '' : '+ vec3(0.025, 0.028, 0.025) * shWater'};
      `);
    };
    groundMat.customProgramCacheKey = () => groundKey() + '_設楽原の踏み荒らし_' + lowPuddles;
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
        depth[i] = positions[i * 3 + 1] - drawGroundAt(W, positions[i * 3], positions[i * 3 + 2]);
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
      mat.color.setHex(0x8f9b82); mat.roughness = 0.82; mat.envMapIntensity = 0.12;
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
    // 川中の石に加え、岸にも低い丸石を一括で置く。浅瀬の通り道は空ける。
    const banks = [];
    for (let i = 1; i < RENGO.length; i++) {
      const a = RENGO[i - 1], b = RENGO[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = -(b[1] - a[1]) / length, nz = (b[0] - a[0]) / length;
      for (let d = 6; d < length; d += 16) for (const side of [-1, 1]) {
        const t = d / length, off = side * (5.3 + 0.4 * Math.sin(d));
        const x = a[0] + (b[0] - a[0]) * t + nx * off, z = a[1] + (b[1] - a[1]) * t + nz * off;
        if (SB.gates.some((gate) => Math.abs(z - gate - 4.5) < 9)) continue;
        banks.push([x, z, 0.35 + 0.15 * (1 + Math.sin(d + i))]);
      }
    }
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
      text = shGuardVoice(rt, text);
      if (F.checkingChaseEnd && /追い切れぬ。深追い/.test(text)) return;
      // 殿に着いた後は、済んだ行軍を促さず槍の使い方を知らせる。
      if (F.tsuigeki?.stage === 3 && /印の方へ東へ追え/.test(text)) {
        text = '馬場の殿を崩せ！　仲間と並び、槍で突け。構えた敵には横へ回れ！';
      }
      if (F.ending && !/^勝ちじゃ/.test(text) && !(F.epilogue && who === '語り')) return;
      // 決着後は戦の時刻が止まる。間を空けた語りを待ち行列へ戻さない。
      if (F.ending && F.epilogue && who === '語り') rt._sayGate = rt.t;
      if (who === '組頭' && !/^勝ちじゃ/.test(text)) {
        if (rt.t < (F.leaderNextAt || 0)) return;
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
    let edge = SB.z0;
    for (const mouth of MOUTHS) {
      const z0 = mouth.z - 96, z1 = mouth.z + 96;
      // 交戦口は六メートル、間の柵は三十メートル単位でまとめ、壊せる区画の増え方を抑える。
      if (edge < z0) buildBobosaku(fenceRt, { x0: SB.x0, z0: edge, z1: z0, gap: SB.gap, segLen: 30, facing: 1 }).forEach((f) => F.fence.push(f));
      F.fence.push(...buildBobosaku(fenceRt, { x0: SB.x0, z0, z1, gap: SB.gap, gates: [mouth.z], facing: 1 }));
      edge = z1;
    }
    if (edge < SB.z1) F.fence.push(...buildBobosaku(fenceRt, { x0: SB.x0, z0: edge, z1: SB.z1, gap: SB.gap, segLen: 30, facing: 1 }));
    for (let i = fenceStart; i < rt.scene.children.length; i++) rt.scene.children[i].traverse((m) => {
      if (m.isMesh && m.material) {
        m.material = nearMaterial(m.material);
        // 結合した柵は大きな球で囲まれる。視点が球の内でも束ごと消さず、近い面だけ透かす。
        m.userData.camSurfaceFade = true;
      }
    });
    tagZones(F.fence, ZONES);
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
    for (const mouth of MOUTHS) for (let i = 0; i < 3; i++) {
      const z = mouth.z + (i - 1) * 12;
      // 各組四挺。傷を人数で割らず、三つの口に本物の射手を残す。
      const gunN = 4;
      F.guns.push(allyGroup(rt, { faction: z < odaZ ? 'oda' : 'tokugawa', name: mouth === MOUTHS[0] ? '野々村の鉄砲組' : mouth === MOUTHS[1] ? ['佐々の鉄砲組', '前田の鉄砲組', '塙の鉄砲組'][i] : mouth.name + 'の鉄砲組', fixed: true, fullStrength: true, noGuard: true, anchor: { x: SB.x0 - 2.4 - i * 1.5, z }, facing: Math.PI / 2, width: gunN > 4 ? 14 : 8, spacing: gunN > 4 ? 1.4 : 2, ranks: 1, aggro: 44, holdFire: true, dmgMult: 0.8 }, [{ type: 'gun', n: gunN }]));
      if (mouth === MOUTHS[0]) F.guns[F.guns.length - 1]._fieldWait = true;
    }
    // 五人の鉄砲奉行は、自分の備の控えとともに持ち場に残る。
    F.officers = [];
    for (const [name, x, z, fac] of ALLIED_POSTS.slice(2, 7)) {
      const q = allyGroup(rt, { faction: fac, name: name + 'の控え', fixed: true, fullStrength: true, noGuard: true, anchor: { x, z }, facing: Math.PI / 2, width: 6, aggro: 6, formation: 'yari' },
        [{ type: 'busho', n: 1, o: { name, invuln: true } }, { type: 'samurai', n: 2 }]);
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
    for (const q of F.guns) q.fireArc = Math.PI * 80 / 180;
    F.hudBands = null; F.hudZone = null;
    // 槍の組：動く一組と、南北の虎口に残る守り。大将本人を連れ回さない。
    const ok = allyGroup(rt, { faction: 'oda', name: '仙石の槍組', fixed: true, fullStrength: true, noGuard: true, yariRanks: 3, anchor: { x: ALLIED_POSTS[1][1], z: ALLIED_POSTS[1][2] }, facing: Math.PI / 2, width: 16, aggro: 6, formation: 'yari', order: 'hold' },
      [{ type: 'busho', n: 1, o: { name: '仙石秀久', invuln: true, horse: true, weapon: 'spear' } }, { type: 'ashigaru', n: 8 }]);
    F.sengoku = ok.units[0];
    F.spears = [ok];
    for (const [z, fac] of [[MOUTHS[0].z + 4.5, 'oda'], [MOUTHS[1].z + 4.5, 'oda'], [42, 'oda'], [MOUTHS[2].z + 4.5, 'tokugawa']]) {
      F.spears.push(allyGroup(rt, { faction: fac, name: '槍組', fixed: true, fullStrength: true, noGuard: true, anchor: { x: z === 42 ? SB.x0 - 2 * SB.gap - 1 : SB.x0 - 2, z }, facing: Math.PI / 2, width: 16, aggro: 6, formation: 'yari', order: 'hold' },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: Math.abs(z) < 60 ? 7 : 3 }]));
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
    // 虎口そのものは本物の兵に任せ、外と内の柵際を軽い押し合いの帯でつなぐ。
    // 形と材質は既存の合戦と共用し、ここから本物の兵を起こさない。
    F.frontBands = [];
    for (const mouth of MOUTHS) for (const inner of [false, true]) for (const side of [-1, 1]) {
      const z = mouth.z + 4.5 + side * 18;
      const x = inner ? SB.x0 - 2 * SB.gap : SB.x0;
      const clash = W.addClash({ x, z, facing: Math.PI / 2, w: 12, bw: 6,
        measuredMelee: true, // 既存の踏ん張りと膝から倒れる動きを使い、柵際で体が跳ねるのを抑える。
        gap: 3.6, gap0: 6, maxDrift: 0, noRout: true, noWake: true, host: false,
        killRate: 0.12, nearHide: 12, seed: 5860 + F.frontBands.length,
        // 見えている乱戦の位置から、打ち合い・息・崩れる声を共通の間隔で鳴らす。
        play: (kind, pos, vol) => {
          if (clash.mesh.visible && !F.pursuit && !F.ending) rt.army.play(kind, pos, vol);
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
    const smokeCanvas = document.createElement('canvas'); smokeCanvas.width = smokeCanvas.height = 64;
    const smokeCtx = smokeCanvas.getContext('2d');
    const smokeGrad = smokeCtx.createRadialGradient(32, 32, 2, 32, 32, 32);
    smokeGrad.addColorStop(0, 'rgba(255,255,255,0.8)'); smokeGrad.addColorStop(1, 'rgba(255,255,255,0)');
    smokeCtx.fillStyle = smokeGrad; smokeCtx.fillRect(0, 0, 64, 64);
    const smokeTex = new THREE.CanvasTexture(smokeCanvas), smokeGeo = new THREE.PlaneGeometry(14, 3.2);
    F.smokeBands = F.guns.map((g) => {
      const mat = new THREE.MeshBasicMaterial({ map: smokeTex, color: 0xeeeae2, transparent: true,
        opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      // 厚みのない硝煙の板は、表裏を別々に送らず一回で両面を描く。
      mat.forceSinglePass = true;
      const mesh = new THREE.Mesh(smokeGeo, mat);
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(g.anchor.x + 2, W.heightAt(g.anchor.x + 2, g.anchor.z) + 2.4, g.anchor.z);
      mesh.visible = false; rt.scene.add(mesh);
      return { mesh, shotAt: -99, x: mesh.position.x, y: mesh.position.y };
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
    // 本陣の旗本は陣を守る。共通の「近い敵へ出る」判断で、柵や川へ追い出さない。
    for (const c of F.camps) {
      c.guard.guard = true; c.guard.stay = true;
      c.guard.guardSight = 22; c.guard.guardLeash = 8;
    }
    F.katsCamp.guard.formation = 'yari';
    F.katsCamp.guard.noRout = true; F.katsCamp.guard.guard = true;
    F.katsCamp.guard.stay = true; F.katsCamp.guard.guardSight = 22; F.katsCamp.guard.guardLeash = 8; // 勝頼の馬廻は退きの下知まで本陣を守る

    for (const [x, z, k, h] of [[IEYASU.x - 10, IEYASU.z + 10, 'onri', 6.5], [CHAUSU.x + 10, CHAUSU.z + 10, 'eiraku', 6.5]]) rt.scene.add(nobori(W, x, z, k, h));
    // 柵の内の旗（織田が北寄り、徳川が南）
    for (let z = SB.z0 + 12; z <= SB.z1 - 12; z += 44) {
      let mon = z < odaZ ? (oda && z % 44 === 0 ? 'maeda' : 'oda') : (z % 44 === 0 ? 'okubo' : 'tokugawa');
      if (true) {
        // 余りの一致で選ぶと固有の紋が一度も出ない。既存の備えの持ち場で選ぶ。
        const post = ALLIED_POSTS.find((p) => Math.abs(p[2] - z - 5) <= 23);
        mon = post ? post[4] : z < odaZ ? 'oda' : 'tokugawa';
      }
      rt.scene.add(nobori(W, SB.x0 - SB.gap - 3, z + 5, mon, 5));
    }
    rt.scene.add(tawara(W, -30, 30, 0.3, 6), tawara(W, -34, -20, -0.4, 5));
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
    F.south = this.makeWave(rt, { name: '山県昌景', hq: 'shitara_yamagata', fac: 'akazonae', z: MOUTHS[2].z, cav: 3, ash: 8, bamboo: true });
    // 退路の旗と馬は軽い備の討死の跡。元の馬の形・材質を共用する。
    const fallenModel = F.south.cavalry.units.find((u) => u.horse)?.horse;
    if (fallenModel) for (const band of F.frontBands) {
      // 口の内側は実際の落馬だけを残す。八十センチ間隔の飾り馬を二頭重ねない。
      if (band.inner) continue;
      const horse = fallenModel.clone(true);
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
        const horse = fallenModel.clone(true);
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
    F.rear = enemyGroup(rt, { faction: 'takeda', name: '馬場隊', fixed: true, noGuard: true, anchor: { x: 250, z: -440 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 8, width: 12, formation: 'yari', morale: 95, noRout: true },
      [{ type: 'busho', n: 1, o: { name: '馬場信春', horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 4 }, { type: 'gun', n: 2 }]);
    // 馬場隊は追撃の退き口で初めて戦う。柵前で先に討死させない。
    for (const u of F.rear.units) { u.invuln = true; u.noTarget = true; }
    nagashinojo.kit.backOf(rt, F.rear, { flag: 'takeda', armor: A.takeda, kind: 'spear', w: 18, depth: 10, count: 120, seed: 79 });
    // 別の備も開戦前から待機し、寄せの下知で前進する。
    F.far = [];
    for (const [z, f, kind] of [[MOUTHS[2].z + 24, 'akazonae', 'mixed'], [MOUTHS[2].z - 24, 'akazonae', 'mixed'], [MOUTHS[1].z + 24, 'takeda', 'mixed'], [MOUTHS[1].z - 24, 'takeda', 'spear'], [MOUTHS[0].z + 24, 'takeda', 'mixed'], [MOUTHS[0].z - 24, 'takeda', 'mixed']]) {
      const m = DA(125, z, kind === 'mixed' ? 20 : 14, 12, kind === 'mixed' ? 80 : 90, -Math.PI / 2, A[f], f, 61 + F.far.length, kind);
      m.army.noWake = true; // 待機中から見える備。合図で前進するだけ。
      F.far.push({ m, z, v: 0 });
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
    rt.banner('川向こうに武田勢', '柵の口を槍で守れ。鉄砲の弾込めを支えよ');
    rt.obj('hold', '槍の持ち場で仲間と並び、柵の口を守れ', 'main', true);
    // 柵を出ない決まりは台詞で伝え、任務札は一つにする。

    rt.marker('prepare', F.prepPt, '槍の持ち場', SH_HOLD_GUIDE);
    // 長篠城は別の戦場。城の囲みを救う後詰として、設楽原の戦が始まる。
    rt.say('語り', '長篠を救うため、武田を迎え撃つ。', 3);
    rt.say('仙石秀久', 'わしと柵の口を守れ。柵は出るな！', 3);
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
  WAVES: [
    { name: '真田信綱・昌輝', hq: 'shitara_sanada', fac: 'takeda', z: MOUTHS[0].z, home: { x: 110, z: -240 }, cav: 3, ash: 12, brother: true, line: '南の山県に続き、北の真田も寄せる！　柵を守れ！' },
    { name: '武田の中央の諸隊', hq: 'shitara_naito', fac: 'takeda', z: MOUTHS[1].z, cav: 3, ash: 12, general: '内藤昌豊', final: true, line: '北に代わり、中央の諸隊が寄せる！　柳田前を守れ！' },
  ],

  makeWave(rt, w) {
    // 北の先手は行軍を済ませた所から始める。本隊の布陣と南北の順は変えない。
    const frontX = w.brother ? 38 : w.bamboo ? 38 : w.home?.x ?? 105;
    const homeZ = w.brother || w.bamboo ? w.z + 4.5 : w.home?.z ?? (w.final ? -30 : w.z);
    const g = enemyGroup(rt, { faction: w.fac, name: w.name + '隊', fixed: true, noGuard: true, anchor: { x: frontX, z: homeZ }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 8, width: w.ash > 20 ? 22 : 12, spacing: 1.4, formation: 'yari', morale: 100, speed: 3 },
      [{ type: 'ashigaru', n: w.ash, o: { tatake: !!w.bamboo, flag: w.brother ? 'sanada' : w.bamboo ? 'takeda_kiba' : w.fac } }, { type: 'busho', n: 1, o: { name: w.brother ? '真田信綱' : w.general || w.name, horse: true, flag: w.brother ? 'sanada' : w.bamboo ? 'takeda_kiba' : w.fac } },
        ...(w.brother ? [{ type: 'busho', n: 1, o: { name: '真田昌輝', horse: true, flag: 'sanada' } }] : [])]);
    g.def = w;
    g.cavalry = enemyGroup(rt, { faction: w.fac, name: w.name + '隊の騎馬衆', fixed: true, noGuard: true, anchor: { x: frontX + 10, z: w.z + 4.5 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 8, width: 10, morale: 95, speed: 5 }, [{ type: 'cavalry', n: w.cav, o: { horseBattle: 'mounted', flag: w.brother ? 'sanada' : 'takeda_kiba' } }]);
    g.missiles = enemyGroup(rt, { faction: w.fac, name: w.name + '隊の鉄砲・弓', fixed: true, noGuard: true, anchor: { x: frontX + 16, z: homeZ - 14 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 6, width: 10, morale: 85, speed: 2.6 },
      [{ type: 'samurai', n: 1 }, { type: 'gun', n: w.ash > 20 ? 5 : 2 }, { type: 'bow', n: w.ash > 20 ? 5 : 2 }]);
    g.missiles.holdFire = true;
    for (const u of g.missiles.units) if (u.type === 'gun') u.gunAmmo = w.final ? 2 : w.bamboo ? 5 : 3;
    nagashinojo.kit.backOf(rt, g, { flag: w.fac, armor: nagashinojo.kit.ARMOR[w.fac], kind: 'mixed', w: 26, depth: 18, count: 120, gap: 6, seed: 71 + this.WAVES.indexOf(w), stop: () => g.center().x < SB.x0 + 8 });   // 後ろの大軍も柵の近くまで押して、寄せの厚みを見せる
    return g;
  },

  // 一の柵の一区画を目標にする。口へ直行せず、取り付いた足軽の打撃で破る。
  attackFence(rt, g) {
    const F = rt.flags;
    let best = null, d = Infinity;
    for (const s of F.fence) if (s.row === 0 && s.alive) {
      const dz = Math.abs((s.seg[1] + s.seg[3]) / 2 - (g.def.z - 3));
      if (dz < d) { d = dz; best = s; }
    }
    g.breach = d < 18 ? best : null;
    g.lane = { x: SB.x0 - SB.gap + 1, z: g.def.z + 4.5 };
    g.formation = 'column'; g.colW = g.count > 14 ? 3 : 2; g.noRout = true;   // 大きな寄せは横に広げ、柵に前の列が並んで取り付く
    // 先手の南と続く北は、川岸から同じ口へ短い距離で寄せる。
    g.attackAt = rt.t; g.speed = F.tobiDone || g.def.bamboo || g.def.brother ? 4 : 3;
    g.siegeStallAt = rt.t; g.lastFenceHp = g.breach?.hp;
    // 既存の槍組が口から誘い出て、敵が迫れば同じ道で柵へ戻る。
    g.lureSpear = F.spears[g.def.bamboo ? 4 : g.def.final ? 2 : 1];
    g.lureOut = { x: SB.x0 + 10, z: g.lane.z };
    g.lureBack = { x: SB.x0 - SB.gap - 2, z: g.lane.z };
    g.luring = true; g.lureAt = rt.t;
    postRoad(rt, g.lureSpear, g.lureOut);
    g.order = 'move';
    g.dest = g.breach ? { x: Math.max(g.breach.seg[0], g.breach.seg[2]) + 2, z: (g.breach.seg[1] + g.breach.seg[3]) / 2 } : g.lane;
    g.onArrive = (q) => { q.order = 'hold'; q.aggro = 2; };
    g.cavalry.noRout = true;
    g.cavalry.order = 'hold'; g.cavalry.dest = null;
    g.cavalry.onArrive = null;
    g.missiles.holdFire = false; g.missiles.order = 'move';
    g.missiles.dest = { x: SB.x0 + 40, z: g.def.z - 14 };
    g.missiles.onArrive = (q) => { q.order = 'hold'; };
  },

  fronts(rt) {
    const F = rt.flags;
    if (F.frontsStarted) return;
    F.frontsStarted = true;
    this.attackFence(rt, F.south);
    sfx('taiko', 1);
    shReport(rt, '南の山県勢、田を進む！　竹束を盾に寄せて参る！', 3.5);
    const south = F.jinkeiBound.shitara_yamagata;
    if (south) south.advance(25, 12);
    for (const fc of F.far) if (!fc.v && Math.abs(fc.z - F.south.def.z) < 50) {
      fc.v = 1; fc.owner = F.south; fc.m.advance(80, 16, { charge: true });
    }
    F.roll = rollBands(rt, F.bands);
    rt.after(8, () => {
      if (F.ending || F.pursuit) return;
      sfx('taiko', 0.8);
      F.jinkeiBound.shitara_naito?.advance(52, 24);
      shReport(rt, '中央の諸隊も動く！　南と北に続く備じゃ！', 3);
    });
    rt.after(16, () => {
      if (F.ending || F.pursuit) return;
      sfx('taiko', 0.8);
      F.jinkeiBound.shitara_baba?.advance(278, 38);
      F.jinkeiBound.shitara_sakuma?.retreat(36, 16);
      shReport(rt, '北の諸隊も入れ替わりに寄せる！　佐久間勢が退く！', 3);
      rt.after(38, () => {
        if (!F.ending && !F.pursuit) shReport(rt, '北の丸山に馬場の旗！　敵が取り付いた由！', 3);
      });
    });
    rt.after(4, () => { if (!F.ending && !F.pursuit) this.wave(rt); });
  },

  wave(rt, ready = false) {
    const F = rt.flags, w = this.WAVES[F.wave];
    if (!w || F.pursuit || F.ending || (F.cur && !F.cur.doneWave)) return;
    if (!ready) {
      if (F.pendingWave) return;
      if (w.final && !F.transferSignalled) {
        F.transferSignalled = true;
        F.mouthFlags[0].rotation.z = 0;
        // 合図は竿を立てて示す。根元を持ち上げて宙へ浮かせない。
        F.mouthFlags[0].position.y = rt.world.heightAt(F.mouthFlags[0].position.x, F.mouthFlags[0].position.z);
        F.mouthFlags[1].rotation.z = 0;
        F.mouthFlags[1].position.y = rt.world.heightAt(F.mouthFlags[1].position.x, F.mouthFlags[1].position.z);
        sfx('horagai', 0.8);
        // 持ち場へ移した後の見出し一つで、次の下知を伝える。
        // 旗を上げる間にも、次の備を止めずに寄せる。
      }
      F.pendingWave = true; F.postWaitAt = rt.t;
      // 持ち場を替える間も歩兵と射手は寄せる。騎馬は槍の勝負を待つ。
      const incoming = F.waveGroups[F.wave];
      // 前の寄せで出した軍配の下知を、次の寄せの働きへ持ち越さない。
      incoming.lordBefore = F.alliedHosts.map((h) => ({ cmd: h.army.lordCmd, order: h.army.lordOrder, target: h.army.lordTgt }));
      if (w.final) {
        // 北の備を退けた後の行軍だけを省く。傷・弾・人数・身分は引き継ぐ。
        placePlayer(rt, INNER_POST_X, w.z + 4.5, Math.PI / 2);
        let row = 0;
        for (const q of [...(rt.squadGroups || []), F.spears[0]]) {
          q.formation = 'column'; q.colW = 1; q.roadColumn = true;
          placeGroup(rt, q, INNER_POST_X - 2 - row++ * 5, w.z + 4.5);
        }
        placeGroup(rt, incoming, 30, w.z + 4.5);
        placeGroup(rt, incoming.cavalry, 40, w.z + 4.5);
        placeGroup(rt, incoming.missiles, 46, w.z - 14);
        rt.banner('中央の持ち場へ', '柳田前で槍を揃え、寄せを受けよ');
      }
      if (w.final) this.tobigasu(rt);
      this.attackFence(rt, incoming);
      F.commandPt = { x: w.final ? INNER_POST_X : OUTER_POST_X, z: w.z + 4.5 };
      shPostFlag(rt);
      // 中央の守兵も内側の旗へ歩いて寄る。外の柵に残して本人だけで待たせない。
      if (w.final) postRoad(rt, F.spears[2], { x: F.commandPt.x - 3, z: F.commandPt.z + 7 });
      F.stageGuns = F.guns.filter((q) => Math.abs(q.anchor.z - w.z) < 25);
      for (const q of rt.squadGroups || []) postRoad(rt, q, F.commandPt);
      postRoad(rt, F.spears[0], F.commandPt);
      rt.setPhase('redeploy');
      rt.marker('next_mouth', F.commandPt, w.final ? '柳田前の持ち場' : '大宮前の持ち場', SH_HOLD_GUIDE);
      rt.obj('hold', '旗のそばで槍を揃えよ', 'main', true);
      rt.objRemove('stay');
      rt.say(F.voice, w.final ? '柳田前を守るぞ。鉄砲衆の前を空け、槍を揃えよ' : '大宮前へ急げ。北の柵を敵に渡すでないぞ', 3.5);
      return;
    }
    F.pendingWave = false;
    const g = F.waveGroups[F.wave++];
    F.cur = g; F.curMis = g.missiles;
    g.commandAt = F.postWaitAt;
    F.waveAt = rt.t; F.waveRest = false; F.signalPreparing = false; F.close = false; F.trap = false;
    F.flank = false; F.volleys = 0; F.overrunT = 0;
    F.overrunShown = false; F.overrunWarnAt = 0;
    rt.unmark('overrun'); rt.objProgress('stay', '');
    F.commandPt = { x: w.final ? INNER_POST_X : OUTER_POST_X, z: w.z + 4.5 }; F.lane = { x: 8, z: w.z + 4.5 };
    shPostFlag(rt);
    F.focusGuns = F.guns.filter((q) => Math.abs(q.anchor.z - w.z) < 25);
    F.stageGuns = F.focusGuns;
    F.focusBands = assignBands(F.focusGuns);
    // 最初の寄せは柵前まで引きつけ、込め終えた鉄砲を一緒に放つ。
    for (const q of F.focusGuns) if (w.brother && !g.firstVolley) { q._fieldWait = true; q.holdFire = true; }
    for (const q of F.focusGuns) {
      q.focus = null; q.fire = true;
      q.order = 'hold'; q.onArrive = null; q.facing = Math.PI / 2;
    }
    if (!F.roll?.active) F.roll = rollBands(rt, F.bands);
    for (const q of rt.squadGroups || []) postRoad(rt, q, F.commandPt);
    const spear = F.spears[0];
    postRoad(rt, spear, F.commandPt);
    // 移動中に始めた寄せの道と、柵を叩いている時間を継続する。
    if (!g.lane) this.attackFence(rt, g);
    const hq = F.jinkeiBound[w.hq];
    if (hq && !hq.army.rout) hq.moveTo(hq.army.cx - (w.final ? 42 : 34), w.z, 20);
    if (w.brother) F.jinkeiBound.shitara_sanada_masateru?.moveTo(106, w.z + 12, 20);
    // 野々村の控えは北の口を助け、前田の備は中央に残す。
    const nonomura = F.jinkeiBound.shitara_nonomura;
    if (w.brother && nonomura) nonomura.moveTo(nonomura.army.cx, w.z + 24, 20);
    for (const fc of F.far) if (!fc.v && Math.abs(fc.z - w.z) < 50) {
      fc.v = 1; fc.owner = g; fc.m.advance(80, 18, { charge: true });
    }
    // 柵際の軽い押し合いも、この備の接近と後退に合わせる。
    sfx('taiko', 1);
    rt.setPhase('defend');
    rt.banner(w.final ? '中央の敵、寄せる' : '真田の備、前へ', w.final ? '内側の柵で受けよ。合図の旗を見よ' : '鉄砲で撃ち退け、柵際は槍で支えよ');
    shReport(rt, w.line, 3, null, g);
    rt.marker('wave', centerOf(g), w.name + 'の旗', { red: true, group: g });
    rt.marker('next_mouth', F.commandPt, w.final ? '柳田前の持ち場' : '仙石・野々村の持ち場', SH_HOLD_GUIDE);
    rt.obj('hold', '仲間と並び、来る敵を槍で止めよ', 'main', true);
    if (w.final) {
      rt.world.setTime('day');
      F.jinkeiBound.shitara_hara?.advance(50, 22);
      rt.after(4, () => {
        if (!F.ending && !F.pursuit) { sfx('taiko', 0.7); F.jinkeiBound.shitara_shoyoken?.advance(60, 24); }
      });
      rt.obj('hold', '槍の旗のそばで、敵を止めよ', 'main', true);
    }
    if (g.opened) this.fallBack(rt, g);
  },

  // 打撃は近い足軽だけ。半秒ごとの同じ枠で柵への圧力を調べる。
  siegeTick(rt, g) {
    if (!g || g.doneWave) return;
    if (g.routed || !g.count) {
      if (g.luring) { g.luring = false; postRoad(rt, g.lureSpear, g.lureBack); }
      return;
    }
    const F = rt.flags, s = g.breach;
    if (g.luring && (g.opened || F.overrunT > 0 || rt.t - g.lureAt >= 5 && g.center().x < SB.x0 + 24 || rt.t - g.lureAt >= 8)) {
      g.luring = false; g.lureAt = rt.t;
      postRoad(rt, g.lureSpear, g.lureBack);
      shReport(rt, '敵が寄せる！　誘いの足軽は柵へ戻れ！', 3);
    } else if (!g.luring && !g.opened && !F.overrunT && rt.t - g.lureAt >= (F.tobiDone ? 8 : 14) && g.center().x > SB.x0 + 1 && g.lureSpear.order === 'hold') {
      g.luring = true; g.lureAt = rt.t;
      postRoad(rt, g.lureSpear, g.lureOut);
    }
    if (s?.alive) {
      const x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2;
      for (const u of g.units) if (s.alive && u.alive && !u.fleeing && !u.woundOut && !u.gone && Math.hypot(u.pos.x - x, u.pos.z - z) < 5.5) {
        u.cheer = 0.5; rt.army.damage(s, F.tobiDone ? 12 : 4, u);
      }
      if (s.hp !== g.lastFenceHp) { g.lastFenceHp = s.hp; g.siegeStallAt = rt.t; }
      const c = g.center();
      if (g.siegeX == null || Math.hypot(c.x - g.siegeX, c.z - g.siegeZ) > 1) {
        g.siegeX = c.x; g.siegeZ = c.z; g.siegeStallAt = rt.t;
      }
      if (rt.t - g.siegeStallAt > (F.tobiDone ? 4 : 8)) {
        g.breach = null;
        shReport(rt, '敵が柵の口へ回る！　槍の備を崩されるな！', 3);
      }
      return;
    }
    if (g.opened) return;
    g.opened = true; g.noRout = false;
    // 柵間で折れ曲がらず、外で一列に揃えて三重の口をまっすぐ抜ける。
    g.order = 'path'; g.pathIdx = 0; g.colW = 1; g.roadColumn = true;
    g.path = [[SB.x0 + 6, g.lane.z], [INNER_POST_X - 3, g.lane.z]];
    g.onArrive = (q) => {
      q.order = 'attack'; q.aggro = 14; q.seekRange = 22;
    };
    if (g === rt.flags.south) {
      shReport(rt, s ? '南の一の柵が破れた！　徳川は二の柵で受ける！' : '南の敵が柵の口へ来た！　徳川は二の柵で受ける！', 3.5);
      for (const q of rt.flags.guns) if (q.anchor.z > 250) {
        q.order = 'move'; q.dest = { x: SB.x0 - SB.gap - 2, z: q.anchor.z };
        q.fire = false; q.holdFire = true; q._wantFire = false;
        q.onArrive = (qq) => { qq.order = 'hold'; qq.fire = true; qq.holdFire = true; };
      }
    } else if (rt.flags.cur === g) {
      this.fallBack(rt, g);
      const u = rt.flags.sengoku;
      if (g.def.brother && u.alive && !u.woundOut) {
        rt.after(4, () => { if (!g.doneWave && !rt.flags.ending) rt.say('仙石秀久', u.mounted ? 'ここは渡さぬ！　槍で支えよ！' : '馬は失うても、ここは渡さぬ！', 3); });
        rt.after(8, () => {
          if (rt.flags.cur === g && !g.doneWave && !rt.flags.ending) shReport(rt, '野々村の鉄砲が横から助けるぞ！', 3);
        });
      }
    }
  },

  fallBack(rt, g) {
    const F = rt.flags;
    if (g.withdrew) return;
    g.withdrew = true;
    F.commandPt = { x: INNER_POST_X, z: g.def.z + 4.5 };
    postRoad(rt, F.spears[0], F.commandPt);
    for (const q of rt.squadGroups || []) postRoad(rt, q, F.commandPt);
    // 二の柵の口を通り、三の柵の手前で槍を揃える。射手は両脇から狙う。
    for (const q of F.focusGuns) {
      const path = gunRoad(rt, q, g.def.z, -1, q.anchor.z);
      if (path) {
        q.order = 'path'; q.path = path; q.pathIdx = 0; q.formation = 'column'; q.colW = 1; q.roadColumn = true;
        q.fire = false; q.holdFire = true; q._wantFire = false;
        q.onArrive = (qq) => { qq.order = 'hold'; qq.fire = true; qq.holdFire = true; qq.formation = 'line'; qq.facing = Math.PI / 2; };
      }
    }
    // 同じ組の一度だけの後退に、合成の退き太鼓と低い法螺を合わせる。
    rt.army.playFar('sig_nobiki', F.commandPt, 0.9);
    rt.obj('hold', '退き太鼓じゃ。内側の槍の旗へ下がり、敵を止めよ', 'main', true);
    rt.objRemove('stay');
    rt.say(F.voice, '退き太鼓じゃ！　内側の旗へ下がれ。槍は敵へ向けよ！', 3.5);
    shHoldFlag(rt);
    if (F.canLead) rt.choose('柵が破られる。組をどこへ移す？', [
      { label: '内側の柵へ下がり、槍を揃える', note: '敵を正面で止め、鉄砲の前を空ける' },
      { label: '内側の柵の脇で受ける', note: '近い破れ目へ横から槍を入れる' },
    ], (i) => {
      if (F.cur !== g || g.doneWave || F.ending) return;
      F.flank = i === 1;
      F.commandPt = { x: INNER_POST_X, z: g.lane.z + (i ? 7 : 0) };
      for (const q of rt.squadGroups || []) postRoad(rt, q, F.commandPt);
      shHoldFlag(rt);
    }, 8);
  },

  signalVolley(rt, g) {
    const F = rt.flags;
    if (F.trap || !g || waveDefeated(g)) return;
    F.trap = true; F.fireAt = rt.t; F.volleys = 3;
    // 竿ごと持ち上げると空に黒い棒が浮く。立てる動きだけで合図する。
    F.signalFlag.rotation.z = 0; F.signalFlag.position.y = F.signalBaseY;
    F.hashibaFlag.rotation.z = 0;
    rt.obj('hold', '内側の槍の旗で、残る敵を押し返せ', 'main', true);
    rt.banner('合図の旗、上がる', '鉄砲衆、柵際の敵を囲んで撃て');
    shReport(rt, '羽柴の旗が上がった！　鉄砲衆、放たれよ！', 3.5);
    // 弾込め・射線を無視して命中を作らない。撃てる射手だけ同時に解禁する。
    ceaseBands(F.bands, F.roll);
    kamaeBands(F.bands);
    for (const q of F.guns) { q.focus = null; q._fieldWait = false; }
    volleyBands(F.bands);
    rt.after(2.5, () => {
      if (F.ending || F.pursuit) return;
      if (F.waveRest) ceaseBands(F.bands, F.roll);
      else F.roll = rollBands(rt, F.bands);
    });
    battleEvent(rt, EVENT_VOLLEY, F.lane, null, 0, true, '旗の合図で、まわりの鉄砲が撃つ');
    g.noRout = false;
    this.lossReport(rt, F.south);
    rt.after(8, () => {
      if (F.ending) return;
      const sanada = F.waveGroups[0];
      // 柵前でなお戦う者を消さない。退いた備の知らせは一度だけにする。
      let departed = true;
      for (const u of sanada.units) if (u.type === 'busho' && u.alive && !u.fleeing && !u.gone && !sanada.routed) departed = false;
      if (departed) {
        this.lossReport(rt, sanada);
      }
    });
  },

  // 討死は実際に倒れた将だけ知らせる。生きた将は退かせ、史実のその後は歴史欄へ。
  lossReport(rt, g) {
    if (!g || g.deathReported || !waveDefeated(g)) return;
    const F = rt.flags;
    g.deathReported = true;
    if (g === F.south) {
      const fallen = g.units.some((u) => u.type === 'busho' && !u.alive);
      shReport(rt, fallen ? '山県昌景、討死！　南の赤備えが崩れた！' : '南の赤備えが退く！　徳川が押し返したぞ！', 3.5);
    } else if (g.def.brother) {
      let dead = 0;
      for (const u of g.units) if (u.type === 'busho' && !u.alive) dead++;
      shReport(rt, dead >= 2 ? '真田兄弟、討死！　北の備が崩れた！' : dead ? '真田の将が討たれた！　北の備が崩れた！' : '真田の備が退く！　北の旗が乱れておる！', 3.5);
    } else {
      const fallen = g.units.some((u) => u.type === 'busho' && !u.alive);
      shReport(rt, fallen ? '内藤昌豊、討死！　中央の備が崩れた！' : '中央の備が退く！　武田の旗が乱れておる！', 3.5);
    }
    const h = F.jinkeiBound[g.def.hq];
    if (h) h.retreat(180, 60);
    g.noRout = false; g.morale = 0;
    g.cavalry.noRout = false; g.cavalry.morale = 0;
    g.missiles.noRout = false; g.missiles.morale = 0;
    for (const fc of F.far) if (Math.abs(fc.z - g.def.z) < 50 && fc.v !== 2) {
      fc.v = 2; fc.m.retreat(180, 60);
    }
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive) return;
    if (F.okubo.woundOut && !F.bossWounded) {
      F.bossWounded = true;
      shReport(rt, `${F.boss}様が手傷で退かれた。持ち場を守れ！`, 3.5, { x: F.okubo.pos.x, z: F.okubo.pos.z });
    }
    const p = rt.player.u.pos;
    if (rt.player.u.alive && rt.player.u.hp < rt.player.u.maxHp * 0.45 && !(F.woundWarnAt > rt.t)) {
      F.woundWarnAt = rt.t + 30;
      rt.say(F.voice, F.pursuit
        ? 'その傷ではもたぬ！　仲間の後ろで手当てせよ。ひとりで追うな！'
        : 'その傷ではもたぬ！　槍を向けたまま、組と柵の奥へ下がれ！', 3.5);
    }
    if (F.wave === 0 && !F.prepDone) {
      const here = Math.hypot(p.x - F.prepPt.x, p.z - F.prepPt.z) < 7;
      let together = !F.canLead;
      for (const q of rt.squadGroups || []) for (const u of q.units) {
        if (u.alive && !u.fleeing && !u.woundOut && !u.gone && Math.hypot(u.pos.x - F.prepPt.x, u.pos.z - F.prepPt.z) < 10) together = true;
      }
      F.prepT = here && together ? (F.prepT || 0) + dt : 0;
      rt.objProgress('hold', !here ? '槍組の持ち場へ進め' : !together ? '持ち場で組を待て' : '仲間と並び、敵を待て');
      if ((F.prepT >= 4 && rt.t - F.prepAt >= 4) || rt.t - F.prepAt >= 6) {
        F.prepDone = true;
        rt.objProgress('hold', '');
        // 持ち場を確かめただけで、柵の丈夫さや傷を増減させない。
        rt.unmark('prepare');
        rt.say(F.voice, F.prepT >= 4 ? 'よし、槍が揃った。武田の寄せを受けるぞ' : '槍はまだ揃わぬ。武田が来るぞ、持ち場へ急げ！', 3.5);
        this.fronts(rt);
      }
    }
    // 生きている守兵の到着を待つ。全滅した組や退いた組を待ち続けない。
    if (F.pendingWave && !(F.postCheckAt > rt.t)) {
      F.postCheckAt = rt.t + 0.5;
      let gunsReady = true;
      for (const q of F.stageGuns) if (!q.routed && readyCount(q)) {
        const c = q.center();
        if (q.order !== 'hold' || Math.abs(c.z - F.commandPt.z) > 24) gunsReady = false;
      }
      const here = Math.hypot(p.x - F.commandPt.x, p.z - F.commandPt.z) < 12;
      rt.objProgress('hold', !here ? '柵の奥を通り、次の持ち場へ進め' : !gunsReady ? '持ち場で鉄砲組を待て' : '槍を揃え、寄せを受けよ');
      if ((here && gunsReady) || rt.t - F.postWaitAt >= (F.tobiDone ? 6 : 12)) {
        rt.objProgress('hold', ''); this.wave(rt, true);
        if (!here) rt.say(F.voice, '敵が柵へ来るぞ！　奥の道を通り、持ち場へ急げ！', 3);
      }
    }
    // 替えた兵にも同じ武器の威力を使う。柵の内では控えを勝手に侵入させない。
    if ((F.wkT = (F.wkT || 0) - dt) <= 0) {
      F.wkT = 0.5;
      const ammoLimit = F.tobiDone ? (F.cur?.def.final && F.cur.opened || rt.t - F.tobiAt >= 18 ? 0 : 1) : F.wave ? 2 : F.frontsStarted ? 3 : 5;
      for (const u of rt.army.units) {
        if (u.type !== 'gun' || !u.alive) continue;
        if (u.team === 0) {
          u.gunAmmo = Infinity;
          if (u.isPlayer) rt.player.gunAmmo = null;
        } else u.gunAmmo = Math.min(u.gunAmmo ?? ammoLimit, ammoLimit);
      }
      if (F.tobiDone && ammoLimit === 0 && !F.ammoReported && !F.pursuit) {
        F.ammoReported = true;
        rt.say(F.voice, '武田の鉄砲が黙った。槍と弓の寄せを受けよ！', 3.5);
      }
      for (const A of rt.world.armies || []) if (A.team === 1 && !A._autoDistant) {
        // 退却の下知を上書きしない。追撃の反撃は既存の殿だけで受ける。
        A.noWake = !!A.shScenery || !!F.chaseOrdered || F.chaseCease || A === F.katsuyori.army;
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
    // 遠い隊は近接する同じ備が退いた時に後退する。時刻だけで撃ち倒さない。
    for (const fc of F.far || []) if (fc.v === 1 && (fc.owner.routed || !fc.owner.count)) {
      fc.v = 2; fc.m.retreat(180, 60);
    }
    // 背後の軽い控えも、近接する備と同じ場所から戦い始める。
    for (const q of F.backs || []) if (!q.gone && (q.g.routed || !q.g.count)) {
      q.gone = true; q.b.retreat(180, 60);
    }
    nagashinojo.kit.backTick(rt);
    // 射線の遮り（11〜23 章）：鉄砲組の前で味方の槍組が揉み合っていれば、その鉄砲組は撃てない
    if (F.bands) losTick(F.guns, F.spears);
    // 予備隊、区画ごとに自動で動く（37・45 章）：柵が破られた区画へ入り・向き直る。別の区画が薄くなれば、そちらが次に危なくなる
    if (F.reserve && !F.pursuit) reserveTick(rt, F.reserve, F.fence, ZONES, dt, F.reserveOptions);
    // 近い鉄砲組の弾込めは言葉で知らせる。数字の表は戦場へ出さない。
    if ((F.hudT = (F.hudT || 0) - dt) <= 0) {
      F.hudT = 0.5;
      F.reloadNote = '';
      const guns = F.focusGuns || F.stageGuns;
      if (guns) for (let i = 0; i < guns.length; i++) {
        const q = guns[i];
        if (q.routed) continue;
        for (const u of q.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && u.reload && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 28 && sightPoint(rt, u.pos, 28)) {
          F.reloadNote = `${i === 0 ? '一' : i === 1 ? '二' : '三'}の組が弾を込める。槍で支えよ`; break;
        }
        if (F.reloadNote) break;
      }
      F.hudBands = null;
      F.hudZone = null;
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
      // 危ない奥の柵の下知を、弾込めや通常の持ち場の案内で上書きしない。
      if (F.cur && !F.cur.doneWave && !F.pendingWave && !F.waveRest && !F.pursuit && !F.overrunShown) {
        const away = Math.hypot(p.x - F.commandPt.x, p.z - F.commandPt.z) >= 24;
        // 敵が柵を叩く間と、口へ来て槍で受ける時を区別する。待機を放置と誤解させない。
        rt.objProgress('hold', away ? '槍の持ち場の印へ戻り、仲間を助けよ'
          : F.signalPreparing && !F.trap ? '槍で敵を止めよ。鉄砲は旗の合図を待つ'
          : F.close || F.trap ? '鉄砲の前を空け、槍で敵を押し返せ'
          : F.reloadNote || (!F.cur.reachedMouth ? '敵が柵へ寄せている。ここで槍を構えよ' : '仲間と並び、槍で敵を止めよ'));
      }
    }
    shSmoke(rt);
    for (const smoke of F.smokeBands) {
      const age = rt.t - smoke.shotAt;
      smoke.mesh.visible = age < 7 && !F.ending;
      if (!smoke.mesh.visible) continue;
      smoke.mesh.material.opacity = Math.max(0, 0.28 * (1 - age / 7));
      smoke.mesh.position.x = smoke.x + age * 0.28;
      smoke.mesh.position.y = smoke.y + age * 0.12;
    }
    for (const band of F.frontBands) {
      const wave = band.z === MOUTHS[2].z ? F.south
        : F.pendingWave && F.waveGroups[F.wave]?.def.z === band.z ? F.waveGroups[F.wave] : F.cur;
      const engaged = F.frontsStarted && !F.pursuit && !F.ending
        && wave && wave.def.z === band.z && !wave.doneWave && !waveDefeated(wave)
        && (!band.inner || wave.opened);
      if (engaged && !band.started) {
        band.started = true; band.startedAt = rt.t; band.clash.mesh.visible = true; band.clash.go();
        band.horses.visible = true;
        band.horses.moveTo(band.inner ? INNER_POST_X + 8 : SB.x0 + 10, band.horseZ, 8, { charge: true });
      }
      if (band.started && band.fallenHorse && rt.t - band.startedAt >= 12) {
        band.fallenHorse.visible = true;
        shHorseTilt(band.fallenHorse, Math.min(1, (rt.t - band.startedAt - 12) / 0.7));
      }
      if (band.started && !engaged && !band.retired) {
        band.retired = true; band.clash.rout('B', { hideAfter: 18 });
        band.horses.moveTo(145, band.horseZ, 25);
      }
      if (F.pursuit || F.ending) band.clash.mesh.visible = false;
    }
    if (F.pursuit && !F.ending) for (const band of F.retreatBands) {
      if (band.started || Math.hypot(p.x - band.x, p.z - band.z) > 75) continue;
      band.started = true; band.h.visible = true; band.remains.visible = true;
      // 同じ十八人を、人ごとの出足・速さ・よろめきで逃がす。時間だけでは消さない。
      band.h.rout({ hideAfter: 0 });
    }
    for (const q of F.fallenHorses) shHorseTilt(q.horse, Math.min(1, (rt.t - q.at) / 0.7));
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
    if (F.pursuit && !F.ending) {
      const T = F.tsuigeki;
      // 浅瀬を実際に抜けた槍組だけ本人に付き添う。遠い敵へ単独で走らせない。
      // 目的地は下知時に作った物を使い回し、半秒ごとに更新する。
      if (!(F.escortAt > rt.t)) {
        F.escortAt = rt.t + 0.5;
        for (const e of F.chaseEscorts) {
          const q = e.group;
          if (q.routed || !readyCount(q) || q.order === 'retreat' || q.order === 'flee') continue;
          if (q.order === 'path') {
            // 後列まで東岸へ渡ったら、遠い持ち場への整列待ちを終えて本人に続く。
            // まだ川や柵にいる兵は元の道を歩かせる。
            let across = true;
            for (const u of q.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.gone && !u.noTarget && u.pos.x < 58) across = false;
            if (!across) continue;
            q.onArrive?.(q); q.onArrive = null;
          }
          q.seekRange = 12; q.pursuing = false;
          const c = q.center(), d = Math.hypot(c.x - p.x, c.z - p.z);
          if (p.x >= 65) {
            // 最後の槍の勝負では、本人の後ろへ戻す下知を終える。
            // 渡り終えた同じ組だけが近い敵へ出る。敗走兵や川の中の兵は呼び戻さない。
            if (T.stage === 3 && c.x >= 65 && d < 18 &&
                Math.hypot(c.x - F.rearGuidePoint.x, c.z - F.rearGuidePoint.z) < 24) {
              q.order = 'attack'; q.path = null; q.dest = null; q.onArrive = null;
              q.formation = 'yari'; q.roadColumn = false;
              q.seekRange = 24; q.aggro = 14;
              continue;
            }
            e.point.x = p.x - 3; e.point.z = p.z + e.side;
            // 近づいただけで止めると十メートルごとに足踏みし、追手が後ろへ残る。
            // 実際に敵を受ける時だけ現在地で槍を揃え、道中は本人と歩き続ける。
            const fighting = d < 10 && q.units.some((u) => u.alive && !u.fleeing &&
              u.target?.alive && !u.target.fleeing && !u.target.noTarget &&
              Math.hypot(u.target.pos.x - c.x, u.target.pos.z - c.z) < 12);
            if (fighting) {
              if (q.order !== 'hold') { q.anchor.x = c.x; q.anchor.z = c.z; }
              q.order = 'hold'; q.dest = null; q.aggro = 14;
            } else {
              // 東岸の開けた道では、離れた追手も通常の駆け足で遅れを縮める。
              // 柵と浅瀬の行軍速度、兵自身の速さや傷による遅れは変えない。
              q.speed = d > 10 ? 4.2 : 3.4;
              q.order = 'move'; q.dest = e.point; q.aggro = 8;
            }
            q.onArrive = null;
          }
        }
      }
      // 段ごとの150秒の保険はそのまま。最後の20秒は新たに敵を寄せない。
      F.chaseCease = T?.stageAt != null && rt.t - T.stageAt >= 130;
      if (F.chaseCease) {
        for (const u of rt.army.units) if (u.team === 1) {
          u.target = null; u.atk = null; u.swing = null; u.bind = null;
        }
      }
      // 入力があるのに止まった時だけ、浅瀬の中で横へ一歩逃がす。
      // 閉じた柵・兵・岸を飛び越さず、共通の一歩ずつの判定を使う。
      if (rt.player.blockedWalkT >= 2 && p.x > 18 && p.x < 44
          && Math.abs(p.z - (MOUTHS[0].z + 4.5)) < 36) {
        rt.player.blockedWalkT = 0;
        rt.player.escapeBlocked(Math.sin(rt.player.u.heading), Math.cos(rt.player.u.heading));
      }
      // 同じ殿の小勢が道中で三度だけ追手を受け、また東へ退く。増兵・回復はしない。
      if (!F.chaseCease && !F.rearAtExit && T.stage === 2 && F.chaseSkirmishes < 3
          && rt.t >= F.chaseSkirmishAt && rt.t >= (F.chaseSkirmishUntil || 0)) {
        F.chaseSkirmishes++; F.chaseSkirmishAt = rt.t + 38; F.chaseSkirmishUntil = rt.t + 12;
        const R = F.rear, at = F.chaseRearPoint;
        at.x = Math.max(42, Math.min(REARGUARD.x - 20, p.x + 12)); at.z = p.z;
        R.path[0][0] = at.x; R.path[0][1] = at.z;
        R.order = 'path'; R.pathIdx = 0; R.retreatOnly = false;
        R.formation = 'yari'; R.facing = -Math.PI / 2; R.aggro = 12;
        for (const u of R.units) if (u.type !== 'busho') u.invuln = false;
        rt.say('足軽', '武田の殿が振り向いた！　組と槍を揃えよ！', 3);
      }
      if (F.chaseRearPoint && !F.rearAtExit && !F.chaseCease
          && !(F.chaseSkirmishUntil > rt.t) && !(F.chaseRearAt > rt.t)) {
        F.chaseRearAt = rt.t + 0.5;
        const at = F.chaseRearPoint, R = F.rear;
        R.retreatOnly = true; R.formation = 'column'; R.facing = Math.PI / 2; R.aggro = 0;
        at.x = Math.max(at.x, Math.min(REARGUARD.x, Math.max(58, p.x + 30)));
        const k = Math.max(0, Math.min(1, (at.x - 58) / (REARGUARD.x - 58)));
        at.z = MOUTHS[0].z + 4.5 + (REARGUARD.z - (MOUTHS[0].z + 4.5)) * k;
        R.path[0][0] = at.x; R.path[0][1] = at.z;
        if (Math.hypot(at.x - R.anchor.x, at.z - R.anchor.z) >= 1) R.pathIdx = 0;
        if (R.order === 'hold') { R.order = 'path'; R.pathIdx = 0; R.onArrive = F.chaseRearArrive; }
      }
      // 名入りの旗と案内は、まだ戦える殿の兵の居場所にそろえる。
      // 行軍の先頭や最後の固定地点を、目の前の敵の居場所として示さない。
      if (!(F.rearFlagAt > rt.t)) {
        F.rearFlagAt = rt.t + 0.5;
        const at = F.rearGuidePoint;
        let x = 0, z = 0, n = 0;
        for (const u of F.rear.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.gone && !u.noTarget) { x += u.pos.x; z += u.pos.z; n++; }
        at.x = n ? x / n : F.rear.anchor.x; at.z = n ? z / n : F.rear.anchor.z;
        F.rearFlag.visible = n > 0 && !F.rear.routed;
        F.rearFlag.position.set(at.x, rt.world.heightAt(at.x, at.z), at.z);
      }
      for (const m of rt.markers) if (m.id === 'pursuit_road') {
        m.guideAlways = true; m.alwaysDistance = true;
        if (F.tsuigeki?.stage < 3) { m.guideArea = 'move'; m.guideRadius = 3; }
      }
      for (const q of F.chaseHosts) if (!q.escort && !q.h.army.tw && q.step < q.points.length) {
        const target = q.points[q.step], a = q.h.army;
        // 遊び手より一地点先までにし、立ち止まっても周囲の追手が先へ消えない。
        if (q.step > (F.tsuigeki?.stage || 0) + 2) continue;
        const d = Math.hypot(target.x - a.cx - a.off.x, target.z - a.cz - a.off.z);
        q.h.moveTo(target.x, target.z, Math.max(2, d / 3.4), { charge: true }); q.step++;
      }
      if (!(F.chaseSmokeAt > rt.t)) {
        F.chaseSmokeAt = rt.t + 18;
        for (const z of [MOUTHS[0].z - 30, MOUTHS[0].z + 35, MOUTHS[1].z]) rt.world.gunSmoke(85, z, 0xeeeae2, true);
      }
      if (F.tsuigeki?.stage === 3 && !F.rearGoalShown) {
        F.rearGoalShown = true;
        rt.unmark('rear');
        rt.obj('pursue', '馬場隊を崩せ。仲間と並び、槍で突け', 'main', true);
        // 敵の名札とは別に、任務の行き先として示す。敵であることは字と形で残す。
        rt.marker('pursuit_goal', () => F.rearFlag.visible ? F.rearGuidePoint : null, '▲ 敵・馬場隊', { guideAlways: true, alwaysDistance: true, hideNear: 7, h: 4 });
      }
    }
    // 南北とも同じ口を通る。徒歩が崩れても、入った騎馬は槍の守りへ寄せる。
    if (F.frontsStarted && !F.pursuit) shCavalry(rt, F.south);
    const cur = F.cur;
    if (cur && !cur.doneWave && !F.pursuit) {
      shCavalry(rt, cur);
      const cmd = rt.player.lastCmd;
      const here = Math.hypot(p.x - F.commandPt.x, p.z - F.commandPt.z) < 24;
      // 敵が実際に柵の口へ来たことを確かめる。遠くの敵を倒すだけでは達成しない。
      let atMouth = false;
      for (let i = 0; i < 2; i++) {
        const q = i ? cur.cavalry : cur;
        for (const u of q.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget
            && u.pos.x <= SB.x0 + 8 && u.pos.x > -35 && Math.abs(u.pos.z - cur.lane.z) < 18) atMouth = true;
      }
      if (atMouth) cur.reachedMouth = true;
      // 名乗りは近くまで来た、生きて戦う将から一度だけ聞かせる。
      if (atMouth && !cur.voiceHeard) for (const u of cur.units) {
        if (u.type !== 'busho' || !u.alive || u.fleeing || u.woundOut || u.gone || !sightPoint(rt, u.pos, 35)) continue;
        cur.voiceHeard = true;
        rt.say(u.name, cur.def.brother ? '真田の槍、ここを通すぞ！' : '柵の口を押せ！　武田の意地を見せよ！', 3);
        break;
      }
      // 下知を持たない足軽も、柵の口で寄せを受け続ければ槍組を支えたことになる。
      cur.holdT = atMouth && here && p.x <= SH_FRONT ? (cur.holdT || 0) + dt : 0;
      if (cur.holdT >= 3) cur.helped = true;
      if (cur.def.brother && !cur.firstVolley && atMouth && gunsLoaded(F.focusGuns)) {
        cur.firstVolley = true;
        F.mouthFlags[0].rotation.z = 0;
        F.mouthFlags[0].position.y = rt.world.heightAt(F.mouthFlags[0].position.x, F.mouthFlags[0].position.z);
        ceaseBands(F.bands, F.roll); kamaeBands(F.focusBands);
        for (const q of F.focusGuns) q._fieldWait = false;
        volleyBands(F.focusBands);
        rt.banner('北の旗、上がる', '鉄砲衆、柵前の敵へ放て！');
        battleEvent(rt, EVENT_VOLLEY, F.lane, null, 0, true, '北の旗の合図で鉄砲が撃つ');
        rt.after(2.5, () => { if (!F.ending && !F.pursuit && !F.waveRest) F.roll = rollBands(rt, F.bands); });
      }
      if (cur.cavApproach && atMouth && readyCount(cur.cavalry) && !(cur.hoofAt > rt.t)) {
        cur.hoofAt = rt.t + 8;
        if (Math.hypot(p.x - cur.lane.x, p.z - cur.lane.z) < 55) { sfx('hooves', 0.85); sfx('toki', 0.7); }
      }
      if (!waveDefeated(cur) && (cur.opened || cur.center().x < SB.x0 + 24)
          && (here || rt.G.lord) && cmd && cmd.id !== 'retreat' && cmd.t >= cur.commandAt && rt.t - cmd.t <= 12) cur.helped = true;
      if (here && !waveDefeated(cur) && (cur.opened || cur.center().x < SB.x0 + 24)
          && cur.helpCmdAt >= cur.commandAt && rt.t - cur.helpCmdAt <= 12) cur.helped = true;
      // 鉄砲の号令は共通の号令通知を通らないため、実際の構えと射撃の時刻を見る。
      const gunCmd = rt.kamae;
      if (here && !waveDefeated(cur) && (cur.opened || cur.center().x < SB.x0 + 24)
          && gunCmd && gunCmd.t >= cur.commandAt && rt.t - gunCmd.t <= 12
          && (gunCmd.st === 'reload' || gunCmd.mode === 'roll')) cur.helped = true;
      if (rt.G.lord && !waveDefeated(cur)) for (let i = 0; i < F.alliedHosts.length; i++) {
        const a = F.alliedHosts[i].army, before = cur.lordBefore[i];
        if (a.lordCmd && a.lordOrder !== 'retreat' && Math.abs(a.cz - cur.def.z) < 60
            && (a.lordCmd !== before.cmd || a.lordOrder !== before.order || a.lordTgt !== before.target)) cur.helped = true;
      }
      if (here && rt.player.guard && rt.army.nearestEnemy(rt.player.u, 6)) cur.helped = true;
    }
    // 敵が槍の守りを押し崩し、奥の持ち場を占め続ければ、この手は敗北する。
    if (!F.pursuit && F.cur && !F.cur.doneWave && (F.lossPoll = (F.lossPoll || 0) - dt) <= 0) {
      F.lossPoll = 0.5;
      let enemy = 0, guards = 0;
      for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget && !u.isStruct && Math.abs(u.pos.z - F.cur.def.z) < 24 && u.pos.x < -8 && u.pos.x > -35) {
        if (u.team === 1) enemy++; else guards++;
      }
      // 遊び手が遠くても同じ条件。押し返して敵の優勢を崩せば、占領の時を戻す。
      F.overrunT = rt.canFailMission() && enemy >= 5 && enemy > guards * 2 ? (F.overrunT || 0) + 0.5 : 0;
      const flag = F.mouthFlags[F.cur.def.final ? 1 : 0];
      flag.rotation.z = Math.min(1.1, F.overrunT / OVERRUN_LIMIT * 1.1);
      if (F.overrunT >= 2 && !(F.overrunWarnAt > rt.t)) {
        F.overrunWarnAt = rt.t + 8;
      }
      if (F.overrunT >= 2) {
        if (!F.overrunShown) rt.marker('overrun', { x: -21, z: F.cur.def.z }, '押し返す奥の柵', SH_HOLD_GUIDE);
        rt.objProgress('hold', '奥の旗へ戻り、敵を押し返せ'); F.overrunShown = true;
      } else if (F.overrunShown) {
        rt.objProgress('hold', '奥の旗のそばで槍を揃えよ');
        rt.unmark('overrun'); F.overrunShown = false;
      }
      if (F.overrunT >= OVERRUN_LIMIT) {
        F.ending = true; rt.setPhase('end');
        rt.tracker.main = false; rt.objFail('hold'); rt.objRemove('stay');
        for (const id of ['prepare', 'next_mouth', 'wave', 'command', 'overrun']) rt.unmark(id);
        rt.banner('持ち場を破られた', '組とともに西へ退け');
        rt.finish({}, 8); return;
      }
    }
    if (F.frontsStarted && !F.pursuit && (F.siegeAt || 0) <= rt.t) {
      F.siegeAt = rt.t + 0.5;
      this.siegeTick(rt, F.south);
      this.siegeTick(rt, F.cur);
      if (F.pendingWave) {
        const incoming = F.waveGroups[F.wave];
        this.siegeTick(rt, incoming);
        shCavalry(rt, incoming);
      }
    }
    const g = F.cur;
    if (g && !g.doneWave && !g.routed && g.count && !F.pursuit) {
      // 通常は近づく敵を削り続ける。中央突破の時だけ、旗のために弾を込める。
      let entered = 0;
      for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && u.pos.x < SB.x0 - SB.gap && Math.abs(u.pos.z - g.def.z) < 24) entered++;
      if (g.opened && !F.close && entered) {
        F.close = true;
        for (const q of F.spears) if (Math.abs(q.anchor.z - g.def.z) < 45) {
          q.order = 'attack'; q.seekRange = 18; q.aggro = 12;
        }
        for (const q of rt.squadGroups || []) if (q.kind !== 'gun' && q.kind !== 'bow' && q.order !== 'path') {
          q.order = 'attack'; q.seekRange = 16; q.aggro = 10;
        }
        g.noRout = false;
        rt.obj('hold', '仲間と並び、柵の内の敵を槍で突け', 'main', true);
        rt.say('組頭', '敵が内側へ来た！　組とともに踏ん張れ！', 3);
      }
      if (g.def.final && g.opened && !F.signalPreparing) {
        F.signalPreparing = true; F.signalWaitAt = rt.t;
        for (const q of F.focusGuns) { q.holdFire = true; q.fire = false; }
        rt.obj('hold', '内側の槍の旗で敵を止め、合図を待て', 'main', true);
        rt.say('組頭', '鉄砲は弾を込めよ！　槍は旗の合図まで支えよ！', 3);
      }
      let firingPosts = 0;
      for (const q of F.focusGuns) if (!q.routed && q.count && q.order === 'hold' && !q._losBlocked) firingPosts++;
      if (g.def.final && !F.trap && F.signalPreparing && rt.t - F.signalWaitAt >= 6 && ((entered >= 3 && firingPosts) || rt.t - F.signalWaitAt > 16)) {
        // 奥へ入れなかった場合も、侵入成功の文にはせず、柵前の敵への合図にする。
        this.signalVolley(rt, g);
        if (entered < 3) rt.obj('hold', '仲間と並び、柵の口で敵を止めよ', 'main', true);
      }
      for (const q of F.focusGuns) {
        const waiting = g.def.brother && !g.firstVolley || g.def.final && F.signalPreparing && !F.trap;
        q._fieldWait = waiting;
        q.fire = !waiting && !q._losBlocked && q.order === 'hold';
        q.holdFire = !q.fire || !q._wantFire;
      }
    }
    // 届かない残兵や、柵間で止まった備は退く。移動・負傷が続く斬り合いには時間切れを設けない。
    if (g && !g.doneWave && !F.pursuit && !(g.stallCheckAt > rt.t)) {
      g.stallCheckAt = rt.t + 0.5;
      const n = readyCount(g), c = g.center();
      let hp = 0;
      for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone) hp += u.hp;
      if (n !== g._lastRC || hp !== g._lastHP || g._lastX == null || Math.hypot(c.x - g._lastX, c.z - g._lastZ) > 2) {
        g._lastRC = n; g._lastHP = hp; g._lastX = c.x; g._lastZ = c.z; g._rcT = rt.t;
      } else if (n > 0 && (n <= 3 && rt.t - g._rcT > 8 || g.opened && rt.t - g._rcT > 12)) {
        g.noRout = false; g.morale = 0; g.routed = true;
        for (const u of g.units) if (u.alive) u.fleeing = true;
      }
    }
    // 寄せを退けたら、弾を込め直し中央の組をそろえる。
    if (g && !F.pursuit && waveDefeated(g) && !g.doneWave && !F.waveRest) {
      F.waveRest = true; F.waveRestAt = rt.t;
      rt.obj('hold', g.def.final ? '組をそろえ、退く敵への下知を待て' : '弾を込め直し、次の寄せに備えよ', 'main', true);
      rt.objProgress('hold', '');
    }
    if (F.waveRest && g && !g.doneWave) rt.objProgress('hold', F.wave === this.WAVES.length ? '追い討ちの下知を待て' : gunsLoaded(F.focusGuns || []) ? '槍を揃え、次の寄せに備えよ' : F.reloadNote || '近い鉄砲組の後ろで槍を揃えよ');
    // 弾込めは移動中に続ける。退いた備の後へ、次の備をすぐ寄せる。
    if (g && !F.pursuit && waveDefeated(g) && !g.doneWave) {
      g.doneWave = true;
      if (g.luring) { g.luring = false; postRoad(rt, g.lureSpear, g.lureBack); }
      F.overrunT = 0; F.overrunShown = false;
      F.mouthFlags[g.def.final ? 1 : 0].rotation.z = 0;
      rt.unmark('overrun'); rt.objProgress('stay', '');
      ceaseBands(F.bands, F.roll);
      rt.unmark('command'); rt.unmark('breach'); F.holdFlag.visible = false;
      for (const q of rt.squadGroups || []) { q.order = 'follow'; q.focus = null; q.onArrive = null; q.holdFire = false; q.fire = true; }
      for (const q of F.guns) { q.focus = null; q.order = 'hold'; q.onArrive = null; }
      // 敗走は東の退路へ歩く。枠を空けるために守兵を消さない。
      rt.unmark('wave'); rt.unmark('next_mouth');
      rt.obj('hold', '馬防柵を守り、次の下知を待て', 'main', true);
      if (g.def.brother) {
        if (g.helped && g.reachedMouth) rt.say(F.voice, 'そなたが口を支えた。北は守れたぞ。次は中央じゃ！', 4);
        else shReport(rt, '北の柵を支え切った！　中央の寄せに備えられよ！', 3);
        F.jinkeiBound.shitara_sanada?.retreat(35, 20);
        F.jinkeiBound.shitara_sanada_masateru?.retreat(35, 20);
      }
      else shReport(rt, '中央の敵も退いた！　まだ柵を出られるな！', 3);
      if (g.def.final && !F.south.deathReported) this.lossReport(rt, F.south);
      if (g.helped) rt.award((t) => t.side.push(`${g.def.name}隊を退けた`), `${g.def.name}隊を退けた`);
      if (F.wave < this.WAVES.length) {
        // 北を守った手応えを聞く四秒。弾込めと南の戦いは続ける。
        rt.obj('hold', '北の柵を守った。弾を込め直し、中央への下知を待て', 'main', true);
        rt.after(4, () => {
          if (!F.ending && !F.pursuit && rt.player.u.alive && F.cur === g) this.wave(rt);
        });
      } else this.decide(rt);
    }
    // 柵の外へ出たか（打って出る下知の間は咎めない）
    if (!F.pursuit && p.x > SH_FRONT && !rt.G.lord) {
      if (!(F.outT > 0) && rt.t >= (F.outCallT || 0)) F.outCallT = rt.t + 8;
      F.outT = (F.outT || 0) + dt;
      if (F.outT > 3 && !F.outWarned) {
        F.outWarned = true;
        rt.violation('下知なく柵の外へ出た', ['組頭', '戻れ！　下知も待たず、討たれに行く気か！']);
        rt.objFail('stay');
      }
    } else if (!F.pursuit) F.outT = 0;
    // 追い討ち：殿の馬場信春の隊を崩せば勝ち
    if (F.dp?.on) depthTick(rt, dt);
    if (F.pursuit && !F.ending && !F.dpB) {
      const R = F.rear;
      if (!F.rearFlanked && (F.dpMem || {}).shiSide && R && !R.routed && R.count && R.order === 'hold') {
        const c = R.center();
        for (const q of rt.squadGroups || []) if (q.count && !q.routed) {
          const a = q.center();
          if (Math.abs(a.x - c.x) < 14 && Math.abs(a.z - c.z) > 8 && Math.abs(a.z - c.z) < 24) {
            F.rearFlanked = true; R.morale -= 20;
            rt.say('組頭', '馬場隊の横へ回った！　槍を入れよ！', 3);
            rt.award((t) => t.c.flank++, '馬場隊の横へ回った'); break;
          }
        }
      }
      const chaseStage = F.tsuigeki.stage;
      // 動く殿の中心へ十メートルまで寄る条件だけでは、追っても先へ逃げ続ける。
      // 追いついた時か、三度の反撃を終えた時には、その場で最後の守りに移る。
      // 兵の移し替え・増兵はせず、追撃の時間切れも従来どおり残す。
      if (chaseStage === 2 && !F.rearAtExit && !F.chaseCease &&
          (Math.hypot(p.x - F.rearGuidePoint.x, p.z - F.rearGuidePoint.z) < 18 ||
           F.chaseSkirmishes >= 3 && rt.t >= F.chaseSkirmishUntil)) shRearStand(rt);
      F.checkingChaseEnd = true;
      const chaseDone = tsuigekiTick(rt, dt);
      F.checkingChaseEnd = false;
      if (!chaseDone && chaseStage !== F.tsuigeki.stage && F.tsuigeki.stage === 2) {
        rt.obj('pursue', '退く武田の殿を追え。仲間と槍を揃えよ', 'main', true);
        rt.marker('pursuit_road', F.rearGuidePoint, '▲ 敵・退く武田の殿', { guideAlways: true, alwaysDistance: true });
      }
      // 「馬場隊を倒せ」の下知が出たら、その場で殿が槍を揃える。
      // 退き道を更新し続けたり、最終地点まで無敵のまま逃がしたりしない。
      if (!chaseDone && chaseStage !== F.tsuigeki.stage && F.tsuigeki.stage === 3) {
        shRearStand(rt);
      }
      if (chaseDone) {
        F.dpB = true; F.ending = true; rt.setPhase('end');
        // 決着後に残った矢や斬撃で帰り支度の体力を奪わない。
        rt.player.u.invuln = true;
        for (const u of rt.army.units) if (u.team === 1) {
          u.target = null; u.atk = null; u.swing = null; u.bind = null;
        }
        const escaped = F.tsuigeki.timedOut;
        if (escaped) rt.objFail('pursue'); else rt.objDone('pursue');
        rt.objRemove('pursue'); rt.objRemove('hold');
        rt.obj('return', '深追いをやめ、仲間と帰り支度をせよ', 'main', true);
        F.holdFlag.visible = false;
        for (const q of F.chaseHosts) { q.h.halt(); q.h.army.followFn = null; }
        rt.award((t) => { t.main = true; if (!escaped) t.special = { label: '追い討ち', pts: 25 }; }, escaped ? '馬防柵を守り抜いた' : '武田を退かせ、殿を崩した');
        for (const id of ['rear', 'pursuit_goal', 'pursuit_road', 'breach', 'wave', 'command', 'next_mouth', 'prepare', 'overrun']) rt.unmark(id);
        rt.banner('武田勢、退却', escaped ? '殿を追い切れなかった。勝頼は逃れた' : '退き口の守りを崩した。勝頼は逃れた');
        rt.say('組頭', '勝ちじゃ。深追いはやめよ。組を揃えて帰るぞ！', 4);
        F.epilogue = true;
        rt.after(4, () => rt.say('語り', '武田は多くの宿将を失った。勝頼は生きて、この戦場を離れた。', 3));
        rt.after(7.5, () => rt.say('語り', scenarioKey() === 'oda'
          ? '信長は次に越前へ。柵を支えた働きを胸に、次の戦へ向かう。'
          : '徳川は遠江の奪い返しへ。次は諏訪原城。仲間とまた歩み出す。', 3));
        sfx('horagai', 0.8);
        rt.finish({ scriptedEnd: true }, 11);
      }
    }
  },

  // 夜明けの別働の働きを、北を守った後に届く知らせとして置く。到着時刻は補い。
  tobigasu(rt) {
    const F = rt.flags;
    if (F.tobiDone || F.pursuit || F.ending || !rt.player.u.alive) return;
    F.tobiDone = true; F.tobiAt = rt.t;
    battleEvent(rt, EVENT_MESSENGER, null, null, 0, true, '酒井忠次の別働隊から知らせが届いた');
    rt.say('使番', '酒井忠次殿の別働隊より！　夜明けに鳶ヶ巣山の砦を破り、長篠城を救ったぞ！', 4);
    shReport(rt, '武田は退き口を恐れておる！　備を替えて猛攻じゃ！', 4);
    const groups = [F.cur, ...(F.hill || []), F.katsuyori].filter((g) => g && g.count > 0);
    for (const g of groups) g.morale = Math.max(15, (g.morale ?? 80) - 10);
  },
  decide(rt) {
    const F = rt.flags;
    if (!F.waveGroups.some((g) => g.helped && g.reachedMouth)) {
      F.ending = true; rt.setPhase('end'); rt.tracker.main = false;
      rt.objFail('hold'); rt.objRemove('stay');
      for (const id of ['command', 'wave', 'next_mouth', 'overrun']) rt.unmark(id);
      rt.banner('武田勢、退却', '戦は勝った。組は柵の口を支えられなかった');
      // 個人の任務失敗から、味方全軍の敗走を始めない。
      rt.finish({ scriptedEnd: true, failureReason: '柵の口で敵の寄せを支えられなかった' }, 8);
      return;
    }
    rt.objDone('hold');
    F.chaseOrdered = true;
    rt.award((t) => { t.side.push('馬防柵を守り抜いた'); }, '馬防柵を守り抜いた');
    if (!F.outWarned && !rt.G.lord) rt.objDone('stay');
    rt.objRemove('stay');
    rt.obj('hold', SH_CHASE_WAIT, 'main', true);
    rt.objProgress('hold', '');

    if (!F.ammoReported) {
      F.ammoReported = true;
      for (const u of rt.army.units) if (u.team === 1 && u.type === 'gun') u.gunAmmo = 0;
      // 敵が退いた後に、寄せを受ける古い下知を出さない。
    }
    // 寄せを早く退けた時は残りの戦闘時間を場面替えで省く。
    // 未の刻の知らせと日付・日の向きを揃え、正午から追撃を始めない。
    if (rt.world.dayClock) rt.world.dayClock.hour = Math.max(rt.world.dayClock.hour, 14);
    rt.world.setTime('afternoon');
    // 武田本陣の退きの合図は、その位置から距離に応じて鳴らす。
    rt.army.playFar('sig_nobiki', KATSUYORI, 1);
    rt.say('使番', '敵が退く。組をそろえよ。進み太鼓まで柵を出るな', 4);
    // 待つ下知は任務札一枚に集め、進む合図も同じ場所へ出す。
    // 本陣は東から出沢・寒狭川方面へ退く。勝頼は史実どおり討てない。
    F.katsuyori.retreat(240, 60);
    F.katsCamp.general.invuln = true;
    for (const q of [F.katsCamp.guard, F.katsCamp.general.group]) {
      q.guard = false; q.stay = false; q.noRout = true; q.retreatOnly = true;
      q.order = 'path'; q.formation = 'column'; q.colW = 2; q.pathIdx = 0;
      q.path = [[520, -100], [ESCAPE.x, ESCAPE.z]]; q.dest = null;
      q.fleeDir = { x: 1, z: -0.2 }; q.onArrive = (g) => { g.order = 'hold'; };
    }
    battleEvent(rt, EVENT_RETREAT, KATSUYORI, null, 1, true, '勝頼の本陣が東へ退き始めた');
    // 馬場の備だけは残る。陣形の同じ備を殿の本物の隊へ結ぶ。
    const baba = F.jinkeiBound.shitara_baba;
    if (baba && !baba.army.rout) baba.advance(40, 25);
    F.hill.forEach((h, i) => { if (h !== baba && !h.army.rout) rt.after(i * 1.5, () => h.retreat(180, 55)); });
    shReport(rt, '勝頼の本陣が退く！　馬場美濃守、殿にて退き口を守っておる由！', 4, CHAUSU);
    const runners = [F.south, ...F.waveGroups].flatMap((g) => [g, g.cavalry, g.missiles]);
    // 控えから本物へ替わった寄せ手にも退却の下知を渡す。
    // 退く軽い備から新たな迎撃隊を出さず、馬場の殿は既存の隊で受ける。
    for (const a of rt.world.armies || []) if (a.team === 1) a.noWake = true;
    for (const g of rt.army.groups) if (g.team === 1 && g.woke && g !== F.rear) {
      g.guard = false; g.stay = false; g.retreatOnly = true;
      for (const u of g.units) { u.target = null; u.atk = null; u.swing = null; u.bind = null; }
      runners.push(g);
    }
    tsuigekiRetreat(rt, runners, F.rear, REARGUARD, ESCAPE);
    // 組を揃え直す間も、本陣と敗兵は退き続ける。
    const go = (fn) => (!F.canLead || rt.G.lord ? rt.after(3, fn) : rt.after(1, () => depthStart(rt, shiCtx(rt), shiA(rt), fn)));
    go(function begin() {
      if (F.ending || !rt.player.u.alive) return;
      F.pursuit = rt.t;
      // 中央から北の虎口へ戻る長い行軍だけ省く。傷・弾・兵数は引き継ぐ。
      const z = MOUTHS[0].z + F.fenceRoute.offset;
      placePlayer(rt, -9, z, Math.PI / 2);
      let row = 0;
      for (const q of [...(rt.squadGroups || []), F.spears[0], F.reserve]) {
        q.formation = 'column'; q.colW = 1; q.roadColumn = true;
        placeGroup(rt, q, -12 - row++ * 5, z);
      }
      // 中央に残っていた二組の控えも、同じ場面替えで虎口へ集め直す。
      // 既存の兵だけを動かし、追撃が始まってから瞬間移動させない。
      let escortRow = 0;
      for (const q of F.chaseHosts) if (q.escort) {
        const a = q.h.army;
        q.h.position.x = -18 - a.cx; q.h.position.z = z + (escortRow++ ? 9 : -9) - a.cz;
        a.x0 = q.h.position.x;
      }
      rt.banner('大宮前の虎口へ', '組を集め直した。川を渡り、馬場の殿を崩せ');
      F.holdFlag.visible = false;
      rt.unmark('breach'); rt.unmark('command'); rt.unmark('next_mouth');
      F.rearFlag = postFlag(rt, '馬場の殿', REARGUARD.x - 10, REARGUARD.z, 'takeda');
      sfx('sig_susume', 1);
      rt.say('組頭', '進み太鼓じゃ！　追い討ちの下知ぞ。組を揃え、虎口から東へ追え！', 4);
      rt.after(1.2, () => { if (!F.ending && F.pursuit && rt.player.u.alive) sfx('toki', 0.7); });
      rt.objRemove('hold');
      ceaseBands(F.bands, F.roll);
      F.close = false;
      // 本物の槍・鉄砲と自分の組が、最寄りの三重の口を通って出る。
      tsuigekiStart(rt, { groups: [...F.spears, ...F.guns, ...(rt.squadGroups || [])], rear: F.rear,
        rearAt: REARGUARD, preserveRear: true, side: !!F.dpMem?.shiSide, ...F.fenceRoute });
      rt.obj('pursue', '進み太鼓じゃ。組と虎口を抜け、東へ追え', 'main', true);
      // 仙石の槍組は浅瀬を抜けた所で打ち手へ戻す。
      // 殿の最終地点まで行軍を優先すると、道中の反撃を本人だけで受けることになる。
      F.chaseEscorts = [F.spears[0], F.reserve, ...(rt.squadGroups || [])].map((group, i) => ({ group, point: { x: 0, z: 0 }, side: i % 2 ? 4 : -4 }));
      for (const e of F.chaseEscorts) {
        e.group.speed = Math.max(e.group.speed, 3.4);
        const riverEnd = e.group.path?.findIndex((pt) => pt[0] === 65) ?? -1;
        if (riverEnd >= 0) {
          e.group.path.length = riverEnd + 1;
          // 先頭が岸へ着くだけでは長い一列の後尾が川に残る。
          // 列の長さだけ先へ進ませ、全員が東岸へ出る条件を満たせるようにする。
          const tail = Math.max(0, e.group.initial - 1) * e.group.layout(e.group.initial).sd * 1.3;
          e.group.path[riverEnd][0] = Math.max(65, 60 + tail);
          // 浅瀬を抜けた組は本人に付き添う。遠い退き口へ走る下知を残さない。
          e.group.onArrive = (q) => {
            q.order = 'hold'; q.path = null; q.dest = null; q.roadColumn = false;
            q.formation = 'yari'; q.facing = Math.PI / 2; q.seekRange = 12; q.aggro = 14; q.pursuing = false;
          };
        }
      }
      // 虎口への場面替えと一緒に、既存の殿も浅瀬の向こうへ置く。増兵・回復はしない。
      const rearArrive = F.rear.onArrive;
      F.chaseRearDefend = rearArrive;
      F.rear.facing = Math.PI / 2;
      F.rear.formation = 'column'; F.rear.colW = 2;
      placeGroup(rt, F.rear, 58, z);
      for (const u of F.rear.units) if (u.alive && !u.gone) {
        u.heading = Math.PI / 2; u.noTarget = false;
      }
      F.chaseRearPoint = { x: 58, z };
      F.rearGuidePoint = { x: 58, z };
      // 川を渡った後は、通り過ぎた固定の印へ戻さず、実際に退く殿へ案内する。
      // 旗と同じ入れ物を半秒ごとに更新し、浅瀬の通過と追撃の時間切れは保つ。
      F.tsuigeki.points[2] = F.rearGuidePoint;
      F.tsuigeki.labels[2] = '退く武田の殿';
      F.chaseSkirmishes = 0; F.chaseSkirmishAt = rt.t + 18;
      F.rear.path = [[58, z]];
      F.chaseRearArrive = (g) => {
        if (F.chaseRearPoint.x < REARGUARD.x) { g.order = 'hold'; return; }
        F.rearAtExit = true;
        rearArrive(g);
      };
      F.rear.onArrive = F.chaseRearArrive;
      F.rear.order = 'path'; F.rear.pathIdx = 0;
      for (const q of F.chaseHosts) if (q.escort) {
        // 二つの控えは組とともに走る。柵の口と奥の道を通し、位置は使い回す。
        const runner = { group: { isRunner: true }, pos: { x: 0, z: 0 } };
        const target = { x: 0, z: 0, facing: Math.PI / 2 };
        const followPoint = { x: 0, z: 0 };
        const side = F.chaseHosts.indexOf(q) ? 6 : -6;
        q.h.follow(() => {
          if (F.ending || !rt.player.u.alive) return null;
          const a = q.h.army, p = rt.player.u.pos;
          runner.pos.x = q.h.position.x + a.cx; runner.pos.z = q.h.position.z + a.cz;
          // 柵と浅瀬では後ろを通り、東岸へ出たら斜め前で槍を揃える。
          // 本人より遅い歩みで画面の後ろへ取り残されるのを防ぐ。
          followPoint.x = p.x + (p.x >= 65 ? 3 : -7); followPoint.z = p.z + side;
          const way = shRunnerWay(rt.army, runner, followPoint);
          target.x = way.x; target.z = way.z;
          target.facing = Math.atan2(way.x - runner.pos.x, way.z - runner.pos.z);
          return target;
        }, { gap: 0, speed: 5.8 });
      }
      for (const m of rt.markers) if (m.id === 'pursuit_road') {
        m.guideAlways = true; m.alwaysDistance = true;
        if (F.tsuigeki?.stage < 3) { m.guideArea = 'move'; m.guideRadius = 3; }
      }
      // 追手の控えも、開戦前からいる同じ兵が虎口を通って走る。
    });
  },

  onRout(rt, g) {
    if (g === rt.flags.rear) { rt.unmark('rear'); rt.say('足軽', '殿が崩れたで！', 2.5); }
  },
  onPlayerHit(rt, target) {
    const g = rt.flags.cur;
    if (g && !g.doneWave && (target.group === g || target.group === g.cavalry || target.group === g.missiles)) g.helped = true;
  },
  onSquadCommand(rt, id) {
    const F = rt.flags, g = F.pendingWave ? F.waveGroups[F.wave] : F.cur;
    if (!g || g.doneWave || F.pursuit || F.ending || id === 'retreat' || id === 'ceasefire') return;
    const p = rt.player.u.pos;
    if (Math.hypot(p.x - F.commandPt.x, p.z - F.commandPt.z) < 24) g.helpCmdAt = rt.t;
  },
  onKill(rt, v, k) {
    const g = rt.flags.cur;
    if (g && !g.doneWave && (v.group === g || v.group === g.cavalry || v.group === g.missiles)
        && (k?.isPlayer || k?.isSub && Math.max(rt.player.lastCmd?.t ?? -1, g.helpCmdAt ?? -1, rt.kamae?.t ?? -1) >= g.commandAt)) g.helped = true;
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1; else rt.flags.ak = (rt.flags.ak || 0) + 1;
    if (v.mounted) shFallenHorse(rt, v);
    nagashinojo.kit.carrion(rt, v);
    if (v.group === rt.flags.rear && v.type === 'busho' && rt.flags.pursuit) {
      v.group.morale -= 35;
      if (sightPoint(rt, v.pos, 55) || k?.isPlayer) rt.say('足軽', '馬場美濃守が討たれたで！　退き口の槍衾を崩すぞ！', 3.5);
    }
    if (v.type === 'busho' && v.group && v.group.def && !v.shFallSaid) {
      v.shFallSaid = true;
      if (v.group.def.brother && !rt.flags.south.deathReported) this.lossReport(rt, rt.flags.south);
      if (sightPoint(rt, v.pos, 55) || k?.isPlayer) rt.say('足軽', `${v.name || v.group.def.name}が倒れたで！`, 3);
      v.group.morale -= 30;
      v.group.noRout = false;
      const host = rt.flags.jinkeiBound[v.group.def.hq];
      if (host) host.retreat(180, 60);
      v.group.cavalry.morale -= 30; v.group.missiles.morale -= 30;
      this.chainCollapse(rt, v.group);
    }
  },
  // 連鎖崩壊（43〜44 章）：侍大将の討死→同じ備の士気は onKill で大きく下がる→隣の備（近くの武田のまとまり）も中くらい下がる。
  //   複数の侍大将が討死すれば、丘の本隊（勝頼の本陣含む）にも薄く効き、全線が崩れやすくなる
  chainCollapse(rt, deadGroup) {
    const F = rt.flags;
    const c = deadGroup.center ? deadGroup.center() : null;
    const near = [F.cur, F.curMis, ...(F.hill || [])].filter((g) => g && g.count > 0 && g !== deadGroup);
    if (c) for (const g of near) {
      const gc = g.center ? g.center() : null; if (!gc) continue;
      if (Math.hypot(gc.x - c.x, gc.z - c.z) < 45) g.morale = Math.max(15, (g.morale ?? 80) - 15);
    }
    F.genDeaths = (F.genDeaths || 0) + 1;
    if (F.genDeaths === 2 && F.katsuyori && F.katsuyori.count) {
      F.katsuyori.morale = Math.max(20, (F.katsuyori.morale ?? 80) - 12);

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
    // 破れ目は印で示す。字の知らせは出さない（稲生の水準）。
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
// 総勢は歴史欄だけに置く。個々の討死から全軍の損害へ倍率を掛けない。
shitaragahara.force = () => ({ a: 38000, a0: 38000, b: 15000, b0: 15000 });
shitaragahara.canSkip = (rt) => (rt.phase === 'brief' && rt.flags.wave === 0 && rt.t > 3 ? '武田の寄せまで待つ' : '');
shitaragahara.skip = (rt) => { if (rt.phase === 'brief' && rt.flags.wave === 0) rt.flags.prepAt = rt.t - 6; };
// 織田家編では、味方の紋を織田の木瓜に
shitaragahara.sides = { a: { name: '織田・徳川軍', get mon() { return scenarioKey() === 'oda' ? 'oda' : 'tokugawa'; } }, b: { name: '武田軍', mon: 'takeda' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
// 奉行は各持ち場へ初めから置く。別名の同一人物や土屋を他将の隊へ追加しない。
shitaragahara.famous = [];
// 出典確認：新城市 https://www.city.shinshiro.lg.jp/kanko/meisyo/nagashino-shitaragah.html
shitaragahara.history = '長篠城は寒狭川と宇連川の合流点の崖の上にあり、本丸と野牛曲輪は木の柵と板葺の小屋で守られていた。奥平信昌の約五百が武田一万五千の囲みに耐え、織田・徳川の後詰を待った。天正三年五月二十一日、織田・徳川軍は設楽原で柵と多数の鉄砲を用い、武田軍を破った。武田勢は連吾川を下り、柵のある側へ登って寄せたとされる。三重の馬防柵と身隠しに加え、川や斜面そのものが守りを助けた。早朝の鉄砲の撃ち合いから槍の勝負へ移り、足軽が柵の外へ誘い出て、敵が寄せれば柵へ引く駆け引きが続いたとされる。騎馬の一斉突撃から始まったとはしない。酒井忠次の別働隊は夜明けに鳶ヶ巣山の砦を攻め、長篠城の囲みを解いた。本作ではその知らせが北の寄せを退けた後に届く。知らせの到着時刻と、その直後の中央の猛攻は遊びのための補いである。武田の弾は早く尽き、連合軍の厚い兵力と弾薬が勝敗を分けたという見方がある。一番槍を競い、命を惜しまぬ武田勢の気風も、長く戦えた理由とされる。『信長公記』は鉄砲千挺ほどを奉行に預け、柵の外へ出ず、寄せる武田勢を撃ち退けたと記す。山県昌景の赤備え、真田信綱・昌輝らの奮戦と討死は『甲陽軍鑑』にも伝わる。山県・内藤・真田兄弟ら多くの宿将が討死し、午後二時ごろ（未の刻）に武田勢が崩れ、織田・徳川は柵を出て追撃した。馬場信春は出沢・寒狭川方面の退き口で殿を務め、勝頼を逃がして討死したと伝わる。勝頼本人はこの戦で討たれていない。『信長公記』の寄せの順は山県・武田信廉・小幡・武田信豊・馬場であり、本作では南の山県を先手とし、続く中央・北の諸隊の寄せをまとめて描く。各備の順や場所は確定した再現ではない。仙石秀久の参陣は確かな史料で確かめられず、本作の持ち場と働きは創作に近い補いである。山県の竹束と柵破り、徳川の二の柵への後退、馬場の丸山占領、仙石の落馬と槍での奮戦、野々村の援護は伝承や解釈を取り入れた復元である。中央突破を内側の柵へ誘い、羽柴の旗で囲んで撃つ策は漫画『せんごく』にも描かれる説をもとにした演出で、確かな史実とはしない。新城市の解説は、川や田、柵と多数の鉄砲を組み合わせた守りを紹介している。鉄砲三千挺や三段撃ちは、小瀬甫庵『信長記』以後の書物に伝わる。三段撃ちを裏付ける確かな史料はなく、本作の射撃の交代は、弾込めの間を別の組が補う演出である。三重の柵、細かな備の兵数・居場所・天気・距離・時間と、追撃の道筋・浅瀬・殿の位置は推定と遊びの補いである。中央から北の虎口へ戻る行軍は場面替えで省く。武将の掛け声は創作である。追撃で渡る浅い川は連吾川で、勝頼が逃れたと伝わる寒狭川そのものではない。南の討死の知らせと備の崩れは戦全体の流れの演出で、目の前の武将を討った手柄とは分ける。総勢は織田・徳川三万八千、武田一万五千とも伝わるが、長篠側の別手を含む数であり、決戦場に全員を置いた意味ではない。';
shitaragahara.date = (rt) => `天正三年五月二十一日　${seasonOf('五月')}・${sky(rt)}`;
shitaragahara.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）

// ---- 設楽原 ----
function shiCtx(rt) {
  const F = rt.flags;
  // 自分の持ち場の槍組を段に引き継ぐ。上官本人は後方の控えに残す。
  return { faction: 'takeda', dmg: 1, friends: () => [F.spears && F.spears[0]].filter((g) => g && g.count && !g.routed) };
}
// 中央突破を退けた後：組を揃え直し、大宮前の虎口から正面か脇から追い討ちへ
function shiA(rt) {
  const B = '組頭';
  return [
    DP.rest({ dur: 4, heal: 0, say: [[B, '組を集めよ。手負いは後ろへ。次は馬場の殿を崩すぞ']] }),
    DP.pick({ time: 12, title: '勝頼が退く。馬場の殿をどちらから攻める？',
      options: [{ label: '虎口を出て、東の殿へ正面から当たる', note: '川を渡り、退き口へ進む。正面は槍衾' }, { label: '虎口を出て、馬場の殿の脇へ回る', note: '川を渡り、組を揃えて横から槍を入れる' }],
      on: (rt, m, i) => { m.shiSide = i === 1; } }),
  ];
}


// 信長公記巻八・地形参照：西の織田と徳川、東の武田十三の備え。
// 各備の兵数・間隔は復元。酒井の鳶ヶ巣山別働は決戦場の備に重ねない。
const alliedIds = ['sakuma', 'sengoku', 'nonomura', 'sassa', 'maeda', 'ban', 'fukutomi', 'sakakibara', 'honda'];
const rearIds = ['akechi', 'hashiba', 'niwa'];
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

export { shitaragahara };
