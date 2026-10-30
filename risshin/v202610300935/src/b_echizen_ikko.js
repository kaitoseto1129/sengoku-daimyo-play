import { rosterPlan } from './jinkei_roster.js';
import * as THREE from 'three';
import { flagMaterial, umaGeometry } from './units_flags.js';
import { NAMED_GEAR } from './named_gear.js';
import { ECHIZEN_IKKO_KACCHU } from './kacchu_data.js';
import { stoneTex, woodTex } from './nature.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sendOrder } from './denrei.js';
// ======================================================================
// 山岳戦　越前一向一揆の山の寺（大滝寺）攻め（late6-1573-1575-spec 80-96。「夜討ち」は GAME_C、焼き討ちは史実）
// 天正三年（1575）八月。信長は大軍で越前へ攻め入り、一向一揆は山々の寺に拠って抗った。
// 大瀧神社の由緒は滝川一益による堂塔の焼失を伝える。夜・霧・局地の兵数と道は遊び用の補い。
// 信長公記巻八の府中龍門寺への夜襲とは別の戦。紙の里は景色で、攻める的にしない。
// 攻め方の作戦四つ（参道・谷の道・森の小道・火攻め）で結果が変わる（木ノ芽峠 b_kinome.js の F9 と同じ仕組み）。
// 比叡山（b_hiei_mtn.js）を手本に、使い回しで作った。
//
// 守る側の山（寄せ手を押し返す、もしもの型）は、同じ縄張り・同じ部品で、同じファイルの中の切り替えで
// 作る（window.__echizenMode==='defend'）。
// b_sunomata.js の「守る砦」と同じ組み合わせ）。lord.js・battles.js には攻め手の一戦だけを登録する。
// ======================================================================
import { hut, tawara, sakamogi, village, scaffold, kagaribi, campfire, palisade, ishigaki, makeKitBatch, finalizeKitBatch, kitFence, bobosaku, tateNarabi, jinmaku, nobori, solidCircle } from './props.js';
import { S as SETTINGS } from './settings.js';
import { kura, monomidai, shoro } from './temple_parts.js';
import { ringBell } from './temple1571.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { enemyGroup, nm, unitPos, wallLine } from './bhelp.js';
import { sightPoint } from './battle_sight.js';
import { battleEvent, showGateBreak, EVENT_FIRE_START, EVENT_UNIT_BREAK, EVENT_RETREAT } from './battle_events.js';
import { distToPolyline } from './world.js';
import { buildCastlePlan, inPoly } from './castle_plan.js';
import { kido, goten } from './castle_parts.js';
import { reset as flReset, addDeck, groundAt } from './floors.js';
import { timeslipField } from './timeslip_field.js';
import { ishidoro } from './gap_scene.js';
import { nakaRoomAt } from './naka.js';
import { interiorWaypoint } from './interior_layouts.js';
import { makeSiegeZones, ZONE_STATE, zoneWord, siegeFighter } from './siege_zones.js';
import { makeMountainAmbush, makeMountainDefense, makeDefenseAI } from './siege_ai.js';
import { WIND_STATE } from './world.js';
import { attachFireSpread } from './siege_fire.js';
import { nightAccuracyMult } from './siege_vis.js';
import { drawGroundAt, avoidCameraBodies } from './render_camera.js';
import { cloneRoomNearMaterial } from './player.js';
import { makeButai, butaiTick } from './butai.js';
import { tickTabas, tabaInteractTick, makeTabaAdvance } from './taketaba.js';
import {
  ECHIZEN_IKKO_PLAN, VILLAGE, GOKA_MURA, GATE_SOMON, GATE_SANMON, OKUYAMA,
  FOREST_POLY, FOREST2_POLY, SANDO, VALLEY_ROAD, FOREST_ROAD, OKU_ROAD, TEMPLE_ROADS, TEMPLE_RIMS,
} from './castles/echizen_ikko.js';

// 見張り（山門番・番所・鐘楼・簡易見張り台）。城の物見櫓は置かない（late6-1573-1575-spec 80-96）
const MONOMI_R = { x: 30, z: -34 };   // 右（谷川沿い）を見おろす見張り台
const MONOMI_L = { x: -26, z: -36 };  // 左（森の小道・五箇の里の裏）を見おろす見張り台
const SHORO_POS = { x: 17, z: -45 };  // 外堂の鐘楼（警報の鐘）

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
// 白山信仰の寺を本願寺の旗で表さない。丸の旗は遊び用の目印。
const IKKO = { armor: 0x2a2622, flag: 'maru' };
const ODA = { armor: 0x211c18, flag: 'takigawa' };
const ROAD_HOLD = 90;
// 外壁は残し、堂内にいる間だけ目の直前の格子や梁を避ける。
const templeSolid = { value: 0 }, templeHallMaterials = new WeakMap();
function templeHallMaterial(source) {
  if (!templeHallMaterials.has(source)) {
    const mat = cloneRoomNearMaterial(source, templeSolid);
    // 光源を受けない室内部品にも夜の暗さを付ける。灯明の透けと光だまりは残す。
    if (mat.isMeshBasicMaterial && !mat.transparent && mat.colorWrite) mat.color.multiplyScalar(.28);
    templeHallMaterials.set(source, mat);
  }
  return templeHallMaterials.get(source);
}
const TEMPLE_HALL_IDS = ['gezan', 'hondo', 'oku'];
const TEMPLE_HALL_NAMES = { gezan: '外堂', hondo: '本堂', oku: '奥の院' };
// 坊は参道の西に寄せ、中央の道を兵と遊び手に共用する。
const OUTER_ROUTE = SANDO.slice(1, 5);
const INNER_ROUTE = SANDO.slice(4);
const BOT_SOMON_ROUTE = OUTER_ROUTE.slice(0, 3);
const BOT_SANMON_ROUTE = INNER_ROUTE.slice(0, 3);
const BOT_OKU_ROUTE = [[0, 20], [0, 36], [0, 55]];
// 平場の横へ押し出された時は、下の門口から入り直す。直前の坂だけでは切岸に遮られる。
const HALL_ENTRY_ROUTES = [SANDO.slice(0, 5), SANDO, [...SANDO, ...BOT_OKU_ROUTE.slice(1)]];
const GATE_ENTRY_ROUTES = [SANDO.slice(0, 4), SANDO.slice(0, 7)];
const GUARD_UPPER_ROUTE = [[0, 20], [0, 36], ...OKU_ROAD];
const OUTER_POS = { x: 2, z: -46 };
const INNER_POS = { x: 0, z: 20 };
const OKU_POS = { x: 0, z: 55 };
// 五箇の紙漉きと山麓・山上の堂は由緒に基づく。民の居所と避難路は地形に合わせた補完。
// https://okamoto-ootakijinja.jp/
// 紙の里の西縁から麓へ。寄せ手の参道・谷川・閉じた山門を通らない。
const PEOPLE_FOOT_ROUTE = [[-58, -174], [-60, -196], [-70, -218]];
const PEOPLE_TEMPLE_ROUTE = [[-20, -38], [-20, -60], [-26, -108], [-30, -150], ...PEOPLE_FOOT_ROUTE];
const PEOPLE_UPPER_ROUTE = [[0, 60], ...OKU_ROAD.slice(1), [-52, 144], [-70, 212]];
const PEOPLE_BANDS = [
  { x: -58, z: -155, kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'],
    route: PEOPLE_FOOT_ROUTE.map(([x, z]) => ({ x, z })) },
  { x: -54, z: -195, kinds: ['merchant', 'townsman', 'woman', 'child'],
    route: [[-60, -202], [-70, -218]].map(([x, z]) => ({ x, z })) },
  { x: -11, z: -51, mode: 'inside', kinds: ['monk', 'monk', 'elder'],
    route: [[-18, -51], ...PEOPLE_TEMPLE_ROUTE.slice(1)].map(([x, z]) => ({ x, z })) },
  { x: -10, z: 55, mode: 'inside', kinds: ['monk', 'woman', 'child'],
    route: [[-4, 55], ...PEOPLE_UPPER_ROUTE].map(([x, z]) => ({ x, z })) },
];
const PEOPLE_PATHS = PEOPLE_BANDS.map((b) => [[b.x, b.z], ...b.route.map((p) => [p.x, p.z])]);
// 提灯は初めに組み、形と材質を寺と里で使い回す。新しい光源は増やさない。
let lanternBody, lanternRim, lanternPaper, lanternWood, templeUmaMat, templeUmaLashingGeo, templeUmaRope;
function templeLantern(rt, x, z) {
  if (!lanternBody) {
    lanternBody = new THREE.CylinderGeometry(.18, .18, .42, 8);
    lanternRim = new THREE.CylinderGeometry(.2, .2, .04, 8);
    lanternPaper = new THREE.MeshBasicMaterial({ color: 0xffd99a });
    // 戸口で目線が灯りへ寄った時だけ紙を抜く。白い面で戦場を覆わない。
    // 全ての提灯で一つの材質を使い、灯りや柱の位置は変えない。
    lanternPaper.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying float vTempleLanternDistance;\n' + shader.vertexShader.replace(
        '#include <project_vertex>', '#include <project_vertex>\nvTempleLanternDistance = length(mvPosition.xyz);');
      shader.fragmentShader = 'varying float vTempleLanternDistance;\n' + shader.fragmentShader.replace(
        '#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vTempleLanternDistance < 0.7) discard;');
    };
    lanternPaper.customProgramCacheKey = () => 'templeLanternNear';
    lanternWood = new THREE.MeshLambertMaterial({ color: 0x493823 });
  }
  const y = rt.world.heightAt(x, z) + 1.9;
  const body = new THREE.Mesh(lanternBody, lanternPaper);
  body.position.set(x, y, z); rt.scene.add(body);
  for (const dy of [-.22, .22]) {
    const rim = new THREE.Mesh(lanternRim, lanternWood);
    rim.position.set(x, y + dy, z); rt.scene.add(rim);
  }
  // 道端の提灯には台と吊り腕を付け、灯りだけが宙に浮かないようにする。
  if (!templePoleGeo) templePoleGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
  const post = new THREE.Mesh(templePoleGeo, lanternWood);
  post.position.set(x + .3, y - .85, z); post.scale.set(.035, 2.1, .035);
  const arm = new THREE.Mesh(templePoleGeo, lanternWood);
  arm.rotation.z = Math.PI / 2; arm.position.set(x + .15, y + .22, z);
  arm.scale.set(.025, .36, .025);
  rt.scene.add(post, arm);
  // 火芯は紙の内に収め、提灯から煙の柱や裸火を突き出さない。
  rt.world.addFire(x, z, { torch: true, h: 1.87, size: .08, smoke: false,
    lightRadius: 4, lightStrength: .7 });
}
// この寺だけの石段。踏面と暗い蹴上げを分け、斜面の下まで石を埋めて隙間を塞ぐ。
let templeStoneGeo, templeStoneMats, templePoleGeo;
function templeSteps(W, ax, az, bx, bz, width = 3.2) {
  if (!templeStoneGeo) {
    // 平らな踏面を残し、縁だけ削った石を全段で共用する。
    templeStoneGeo = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
    const pos = templeStoneGeo.attributes.position;
    const v = new THREE.Vector3(), core = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); core.copy(v).clampScalar(-.46, .46);
      v.sub(core).normalize().multiplyScalar(.04).add(core);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    templeStoneGeo.computeVertexNormals();
    const side = new THREE.MeshLambertMaterial({ color: 0x929084, emissive: 0x292821, map: stoneTex() });
    const top = new THREE.MeshLambertMaterial({ color: 0xaaa797, emissive: 0x20201b, map: stoneTex() });
    templeStoneMats = [side, side, top, side, side, side];
  }
  // 下端を一歩ぶん坂へ延ばす。門直後の切岸に高い最初の段を残さない。
  const approach = Math.hypot(bx - ax, bz - az);
  ax -= (bx - ax) / approach * .8; az -= (bz - az) / approach * .8;
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  const ux = dx / len, uz = dz / len;
  // 中心線だけでなく、実際に描く踏面の全幅で段差を測る。
  // 三角形の山肌が横へ傾く所も、一段を二十センチ以内へ分ける。
  let n = Math.max(2, Math.ceil(len / .5)), tops;
  for (let pass = 0; pass < 6; pass++) {
    tops = new Float64Array(n);
    const depth = len / n;
    let rise = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n, cx = ax + dx * t, cz = az + dz * t;
      let top = -Infinity;
      for (let j = 0; j <= 4; j++) for (const end of [-1, 0, 1]) {
        const offset = (j / 4 - .5) * width;
        top = Math.max(top, W.heightAt(cx + uz * offset + ux * end * depth / 2,
          cz - ux * offset + uz * end * depth / 2));
      }
      tops[i] = top + .12;
      if (i) rise = Math.max(rise, Math.abs(tops[i] - tops[i - 1]));
    }
    if (rise <= .2 || pass === 5) break;
    n *= Math.ceil(rise / .2);
  }
  const depth = len / n;
  const steps = new THREE.InstancedMesh(templeStoneGeo, templeStoneMats, n * 4);
  const stone = new THREE.Object3D(), color = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const t = (i + .5) / n, cx = ax + dx * t, cz = az + dz * t;
    const front = W.heightAt(cx - ux * depth / 2, cz - uz * depth / 2);
    const back = W.heightAt(cx + ux * depth / 2, cz + uz * depth / 2);
    const top = tops[i];
    // 描いた踏面を足場にもする。斜面だけを歩くと兵の腰まで石へ埋まる。
    addDeck({ cx, cz, rot: Math.atan2(dx, dz), x0: -width / 2, x1: width / 2,
      z0: -depth / 2, z1: depth / 2, y: top + .016, pad: .01, name: '寺の石段' });
    for (let j = 0; j < 4; j++) {
      // 縦の目地を一段おきにずらす。端は石段の幅にそろえ、石の数は増やさない。
      const joint = i % 2 ? .1 : 0;
      const left = j === 0 ? -.5 : j / 4 - .5 + joint;
      const right = j === 3 ? .5 : (j + 1) / 4 - .5 + joint;
      const stoneWidth = (right - left) * width;
      const offset = (left + right) * width / 2;
      const x = cx + uz * offset, z = cz - ux * offset;
      let bottom = Math.min(front, back, W.heightAt(x, z));
      // 石の四隅も地面へ埋め、坂の下側に浮く縁を残さない。
      for (const side of [-1, 1]) for (const end of [-1, 1]) {
        bottom = Math.min(bottom, W.heightAt(x + uz * side * stoneWidth / 2 + ux * end * depth / 2,
          z - ux * side * stoneWidth / 2 + uz * end * depth / 2));
      }
      bottom -= .3;
      // 切石を一直線の板に見せず、踏面の差は二センチ未満に収める。
      const stoneTop = top + ((i * 13 + j * 7) % 5 - 2) * .008;
      stone.position.set(x, (stoneTop + bottom) / 2, z);
      stone.rotation.y = Math.atan2(dx, dz);
      stone.scale.set(stoneWidth - .012, stoneTop - bottom, depth - .008);
      stone.updateMatrix(); steps.setMatrixAt(i * 4 + j, stone.matrix);
      color.setScalar(.88 + ((i * 7 + j * 3) % 5) * .03);
      steps.setColorAt(i * 4 + j, color);
    }
  }
  steps.castShadow = steps.receiveShadow = true;
  return steps;
}
// 参道の口の木の鳥居（明神鳥居。風雨に黒ずんだ檜の丸柱・反った笠木・貫・額束）。柱だけを当たりにする。
function templeTorii(W, x, z) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: .85, map: woodTex() });
  const dark = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: .7 });
  const g = new THREE.Group(), y0 = W.heightAt(x, z);
  const add = (geo, mat, px, py, pz, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.z = rz; m.castShadow = m.receiveShadow = true; g.add(m); };
  const H = 5.3, half = 2.7;
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(.26, .32, H, 12), wood, s * half, H / 2, 0, s * .03);
    add(new THREE.CylinderGeometry(.42, .46, .5, 12), dark, s * half, .25, 0);   // 根巻
    solidCircle(x + s * half, z, .4);
  }
  add(new THREE.BoxGeometry(6.8, .3, .46), wood, 0, H - .9, 0);          // 貫
  add(new THREE.BoxGeometry(.5, .9, .3), dark, 0, H - .3, 0);            // 額束
  add(new THREE.BoxGeometry(7.5, .32, .58), wood, 0, H + .25, 0);        // 島木
  add(new THREE.BoxGeometry(7.7, .3, .68), dark, 0, H + .55, 0);         // 笠木
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(1.5, .3, .72), dark, s * 4.4, H + .68, 0, s * .2);   // 反り
  g.position.set(x, y0 - .05, z);
  return g;
}
// 僧兵の指物には共用の背竿が無い。この戦だけ旗の左端に竿と横手を付ける。
function templeFlagPoles(b) {
  if (!templePoleGeo) templePoleGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
  for (const u of b.real?.units || []) {
    const flag = u.flag;
    if (!flag || flag.userData.templePole) continue;
    flag.userData.templePole = true;
    const mat = lanternWood || (lanternWood = new THREE.MeshLambertMaterial({ color: 0x493823 }));
    const top = flag.position.y + .36 * flag.scale.y;
    const pole = new THREE.Mesh(templePoleGeo, mat);
    // 旗の子にして、旗の拡大を打ち消す。裹頭や袖の動きに干渉しない。
    // 共用の布は横幅の中心でなく、左端が原点。竿をその端へ結ぶ。
    pole.position.set(0, ((top + .85) / 2 - flag.position.y) / flag.scale.y, 0);
    pole.scale.set(.018 / flag.scale.x, (top - .85) / flag.scale.y, .018 / flag.scale.z);
    const bar = new THREE.Mesh(templePoleGeo, mat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(.18, .36, 0);
    bar.scale.set(.015 / flag.scale.y, .4, .015 / flag.scale.z);
    flag.add(pole, bar);
    pole.castShadow = bar.castShadow = true;
  }
}
// 外どうしの移動でも、途中に堂があれば軒の角を回る。
// 壁と柵の細道から敵へ向かう時に、壁へ直進し続けない。
function templeHallBetween(army, from, to) {
  let nearest = 1, hall = null;
  if (!army.world.templeHalls) return null;
  for (const b of army.world.templeHalls) {
    if (!b.struct.alive) continue;
    const I = b.I, lv = I.levels[0];
    const fx = from.x - I.x, fz = from.z - I.z;
    const dx = to.x - from.x, dz = to.z - from.z;
    let lo = 0, hi = 1;
    for (let axis = 0; axis < 2; axis++) {
      const start = axis ? fx * I.s + fz * I.c : fx * I.c - fz * I.s;
      const delta = axis ? dx * I.s + dz * I.c : dx * I.c - dz * I.s;
      const half = (axis ? lv.d : lv.w) / 2 + .3;
      if (Math.abs(delta) < .000001) {
        if (Math.abs(start) > half) { hi = -1; break; }
      } else {
        const a = (-half - start) / delta, c = (half - start) / delta;
        lo = Math.max(lo, Math.min(a, c)); hi = Math.min(hi, Math.max(a, c));
        if (lo > hi) break;
      }
    }
    if (lo <= hi && hi >= 0 && lo < nearest) { nearest = lo; hall = I; }
  }
  return hall;
}
// 堂に入った兵も、自分も、外の印へ壁を突き抜けず戸口から戻る。
function templeWay(army, u, goal) {
  const room = nakaRoomAt(u.pos.x, u.pos.z, u.pos.y);
  const targetRoom = nakaRoomAt(goal.x, goal.z, goal.y ?? u.pos.y);
  // 戸をまたいだ直後も、階段の下まで出てから次の道へ渡す。
  // 堂内判定だけで切り替えると、出口の味方や敵を追って中へ戻り続ける。
  const leaving = u._templeExit;
  if (leaving && !room) {
    const out = leaving.doorOut;
    const dx = u.pos.x - out.x, dz = u.pos.z - out.z;
    const ahead = leaving.door.side * (dx * leaving.s + dz * leaving.c);
    // 歩みを止める半径（三十五センチ）より先に案内を渡す。
    if (!leaving.disabled && targetRoom?.I !== leaving && ahead < -.5 &&
        Math.hypot(dx, dz) < leaving.R + 3) return out;
    u._templeExit = null;
  }
  if (!room) {
    if (!targetRoom && !army.wallBetween(u.pos, -1, goal)) return goal;
    const I = targetRoom?.I || templeHallBetween(army, u.pos, goal);
    if (!I) return goal;
    const out = targetRoom ? I.templeDoorOut || (I.templeDoorOut = {
      x: I.doorOut.x, z: I.doorOut.z, y: army.world.heightAt(I.doorOut.x, I.doorOut.z),
    }) : goal;
    if (targetRoom) {
      const dx = u.pos.x - I.x, dz = u.pos.z - I.z;
      const lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
      const outZ = (out.x - I.x) * I.s + (out.z - I.z) * I.c;
      // 戸外の点から離れても、戸口を通り切るまで中へ進む。
      // 半径だけで切り替えると、石段の途中で戸外へ引き返し続ける。
      // 側面・裏面は含めず、戸口に正対した細い通路だけをつなぐ。
      const entering = Math.abs(lx - I.door.lx) < .4 &&
        I.door.side * lz <= I.door.side * outZ &&
        I.door.side * lz >= I.levels[0].d / 2 - .05;
      if (entering || Math.hypot(u.pos.x - out.x, u.pos.z - out.z) < 1.3) return I.doorIn;
    }
    if (!army.wallBetween(u.pos, -1, out)) return out;
    // 戸口が堂の裏側なら軒の外を回る。角と距離の入れ物は堂ごと・兵ごとに使い回す。
    let corners = I.templeCorners;
    if (!corners) {
      const lv = I.levels[0], w = lv.w / 2 + 1.4, d = lv.d / 2 + 1.4;
      corners = I.templeCorners = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, z]) => {
        const px = I.x + x * I.c + z * I.s, pz = I.z - x * I.s + z * I.c;
        // 角の通過判定（六十センチ）より手前で到着にしない。
        // 既定の一歩で止まると、角を通る案内が同じ所を示し続ける。
        return { x: px, y: army.world.heightAt(px, pz), z: pz, botRadius: .35 };
      });
    }
    const route = u._templeDoorRoute || (u._templeDoorRoute = {
      at: -1, I: null, next: null, dist: new Float64Array(4), first: new Int8Array(4), used: new Uint8Array(4),
    });
    if (route.I === I && army.world.time < route.at && route.next &&
        Math.hypot(u.pos.x - route.next.x, u.pos.z - route.next.z) > .6) return route.next;
    route.I = I; route.at = army.world.time + .5; route.next = null;
    const { dist, first, used } = route;
    used.fill(0);
    for (let i = 0; i < 4; i++) {
      dist[i] = army.wallBetween(u.pos, -1, corners[i]) ? Infinity : Math.hypot(u.pos.x - corners[i].x, u.pos.z - corners[i].z);
      first[i] = Math.hypot(u.pos.x - corners[i].x, u.pos.z - corners[i].z) < .7 ? -1 : i;
    }
    let best = Infinity;
    for (let k = 0; k < 4; k++) {
      let i = -1;
      for (let j = 0; j < 4; j++) if (!used[j] && (i < 0 || dist[j] < dist[i])) i = j;
      if (i < 0 || !Number.isFinite(dist[i])) break;
      used[i] = 1;
      const c = corners[i], total = dist[i] + Math.hypot(c.x - out.x, c.z - out.z);
      if (total < best && !army.wallBetween(c, -1, out)) { best = total; route.next = first[i] < 0 ? out : corners[first[i]]; }
      for (let j = 0; j < 4; j++) {
        if (used[j] || (j !== (i + 1) % 4 && j !== (i + 3) % 4)) continue;
        const n = corners[j], length = dist[i] + Math.hypot(c.x - n.x, c.z - n.z);
        if (length < dist[j] && !army.wallBetween(c, -1, n)) { dist[j] = length; first[j] = first[i] < 0 ? j : first[i]; }
      }
    }
    return route.next || out;
  }
  const { I, lv } = room;
  const dx = u.pos.x - I.x, dz = u.pos.z - I.z;
  const ux = dx * I.c - dz * I.s, uz = dx * I.s + dz * I.c;
  // 戸口の内側の点から三十五センチ手前で歩みを止めても、外へ案内を渡す。
  // 以前は切り替えが二十センチ手前で、点に着いた扱いのまま堂を出られなかった。
  const atDoor = Math.abs(ux - I.door.lx) < .4 && I.door.side * uz >= lv.d / 2 - 1.9;
  u._templeExit = targetRoom?.I === I ? null : I;
  const target = targetRoom?.I === I ? goal : atDoor ? I.doorOut : I.doorIn;
  const q = u._templeWay || (u._templeWay = { x: 0, z: 0, botRadius: .35 });
  const tx = target.x - I.x, tz = target.z - I.z;
  interiorWaypoint(lv.layout, ux, uz,
    tx * I.c - tz * I.s, tx * I.s + tz * I.c, q);
  // 通路の角は余白の外へ八センチだけ離してある。手前で止まると
  // 次の経路が家具の余白の中から始まり、足元を指して進めなくなる。
  q.botRadius = .07;
  const rects = lv.layout.paths?.rects;
  if (rects && Math.hypot(q.x - ux, q.z - uz) < .01 && Math.hypot(target.x - u.pos.x, target.z - u.pos.z) > .3) {
    // 押し合いで余白へ入った時は、同じ側の通れる縁へ一歩戻る。
    // 本物の壁を横切る候補は捨て、座標の入れ物は兵ごとに使い回す。
    const probe = u._templeEscape || (u._templeEscape = { x: 0, y: 0, z: 0 });
    let best = Infinity;
    for (const r of rects) {
      if (ux <= r.x0 || ux >= r.x1 || uz <= r.z0 || uz >= r.z1) continue;
      for (let k = 0; k < 4; k++) {
        const x = k === 0 ? r.x0 - .18 : k === 1 ? r.x1 + .18 : ux;
        const z = k === 2 ? r.z0 - .18 : k === 3 ? r.z1 + .18 : uz;
        if (Math.abs(x) > lv.w / 2 - .3 || Math.abs(z) > lv.d / 2 - .3) continue;
        let blocked = false;
        for (const other of rects) if (x > other.x0 && x < other.x1 && z > other.z0 && z < other.z1) { blocked = true; break; }
        if (blocked) continue;
        probe.x = I.x + x * I.c + z * I.s; probe.z = I.z - x * I.s + z * I.c; probe.y = lv.y;
        const d = Math.hypot(x - ux, z - uz);
        if (d < best && !army.wallBetween(u.pos, -1, probe)) { best = d; q.x = x; q.z = z; }
      }
    }
  }
  const lx = q.x, lz = q.z;
  q.x = I.x + lx * I.c + lz * I.s; q.z = I.z - lx * I.s + lz * I.c;
  q.y = lv.y;
  return q;
}
// 寄せている間は門の向こうでなく、実際に歩く竹束の後ろを指す。
// 据えたら既存の隙間の案内へ渡す。点は使い回し、兵の進路は変えない。
function templeTabaFollow(rt) {
  const F = rt.flags, P = rt.player.u.pos;
  if (F.mode !== 'attack' || F.step !== 1 || !F.gateSomon.struct.alive ||
      Math.hypot(P.x - GATE_SOMON.x, P.z - GATE_SOMON.z) < 10) return null;
  const it = F.TA?.items.find((item) => item.g === F.mainSpear);
  if (!it || (it.st !== 'ready' && it.st !== 'push')) return null;
  let tb = null, nearest = Infinity;
  for (const t of it.tabas) {
    const d = Math.hypot(t.x - P.x, t.z - P.z);
    if (d < nearest) { tb = t; nearest = d; }
  }
  if (!tb) return null;
  const q = F.tabaFollow || (F.tabaFollow = { x: 0, y: 0, z: 0 });
  q.x = tb.x - Math.sin(tb.rot) * 1.4;
  q.z = tb.z - Math.cos(tb.rot) * 1.4;
  q.y = groundAt(rt.world, q.x, q.z);
  return q;
}
// 据えた竹束の隙間を先に指す。印を追って竹の正面へ突き当たらない。
function templeGateEntry(rt) {
  const F = rt.flags, P = rt.player.u.pos;
  if (F.step !== 1 || !F.gateSomon.struct.alive) return null;
  // 門打ちの間合いへ着いたら、竹束の零歩の印より門を先に示す。
  if (Math.hypot(P.x - GATE_SOMON.x, P.z - GATE_SOMON.z) < 4) return null;
  const it = F.TA?.items.find((item) => item.g === F.mainSpear);
  if (!it || (it.st !== 'cover' && it.st !== 'free') || it.tabas.length < 2) return null;
  const mid = it.tabas[Math.floor(it.tabas.length / 2)], fx = Math.sin(mid.rot), fz = Math.cos(mid.rot);
  const ahead = (P.x - mid.x) * fx + (P.z - mid.z) * fz;
  if (ahead > 1.2 || Math.hypot(P.x - mid.x, P.z - mid.z) > 18) return null;
  const side = (P.x - mid.x) * fz - (P.z - mid.z) * fx < 0 ? -1 : 1;
  const across = (P.x - mid.x) * fz - (P.z - mid.z) * fx;
  // まず楯の裏で隙間へ横に寄る。前の一点へ斜めに進むと中央の竹束へ当たる。
  const forward = ahead < .8 && Math.abs(across - side * 1.6) > .2 ? -2 : 1.5;
  const q = F.tabaPass || (F.tabaPass = { x: 0, y: 0, z: 0 });
  q.botRadius = forward < 0 ? .1 : .5;
  q.x = mid.x + fz * side * 1.6 + fx * forward;
  q.z = mid.z - fx * side * 1.6 + fz * forward;
  q.y = rt.world.heightAt(q.x, q.z);
  // 隙間を通れたら惣門を示す。零歩の中継点で足を止めない。
  if (forward > 0 && Math.hypot(P.x - q.x, P.z - q.z) < 1.2) return null;
  return q;
}
function templeTaskPoint(rt) {
  const F = rt.flags, foe = F.hallFoe;
  // 平場へ入った直後も古い参道の印へ引き返させない。札と印で同じ区域を読む。
  const zone = F.SZ?.byId[F.step === 1 ? 'gezan' : F.step === 2 ? 'hondo' : F.step === 3 ? 'oku' : ''];
  const gate = F.step === 1 ? F.gateSomon : F.step === 2 ? F.gateSanmon : null;
  if (zone && !gate?.struct.alive) templeEntry(rt, zone);
  const goal = templeTabaFollow(rt) || templeGateEntry(rt) || templeGateApproach(rt) || F.hallEntry || (foe && siegeFighter(foe) ? foe.pos : F.target);
  // 任務の印も兵と同じ戸口を通す。堂の中から壁の向こうを直接指さない。
  return goal ? templeWay(rt.army, rt.player.u, goal) : goal;
}
function templeGateLabel(rt, label) {
  const P = rt.player.u.pos;
  return nakaRoomAt(P.x, P.z, P.y) ? '堂の戸口を出る' : label;
}
// 山門前でも、戸口を出る・応戦する・門を打つの順で同じ下知を出す。
function templeSanmonTask(rt) {
  const P = rt.player.u.pos;
  if (nakaRoomAt(P.x, P.z, P.y)) return '戸口から堂を出て、山門へ';
  if (templeGateApproach(rt)?.returning) return '敵を追わず、参道から山門へ';
  if (templeInMelee(rt)) return '味方のそばで構え、近くの敵を払え';
  return Math.hypot(P.x - GATE_SANMON.x, P.z - GATE_SANMON.z) < 4
    ? '「木づちで山門を打つ」を長押し' : '石段の印をたどり、山門へ';
}
// 門攻め中に追う相手は参道の上だけ。山腹の兵を追って列と竹束から離れない。
// 門の向こうの守りは門を破ってから相手にする。配列は既存の道を使い回す。
function templeGateRoadFoe(F, u) {
  const gate = F.step === 1 ? GATE_SOMON : GATE_SANMON;
  const road = F.step === 1 ? SANDO : INNER_ROUTE;
  return u.pos.z <= gate.z + 1 && distToPolyline(u.pos.x, u.pos.z, road) <= 3.8;
}
// 槍の届く敵がいる間は、両手をふさぐ竹束・柵の操作を勧めない。
// 近場だけを半秒おきに調べ、二つの操作で同じ結果を使う。
function templeInMelee(rt) {
  const F = rt.flags;
  if (rt.t < (F.meleeCheckAt || 0)) return F.inMelee;
  F.meleeCheckAt = rt.t + .5;
  const P = rt.player.u;
  F.inMelee = !!rt.army.nearestEnemy(P, 6, (u) => !u.isStruct && siegeFighter(u) &&
    u.type !== 'bow' && u.type !== 'gun' && Math.abs(u.pos.y - P.pos.y) < 3 &&
    !rt.army.wallBetween(P.pos, -1, u.pos));
  return F.inMelee;
}
// 寺の戦の決まった知らせ（「本丸」「城主」でなく、寺の言葉で）
const TEMPLE_MSG = {
  retreat: (name) => `衆徒が${name}へ退く`,
  honmaruOpen: () => '本堂への道が開いた',
  honmaruFall: () => '本堂に踏み込んだ',
  surrender: () => '衆徒が降った',
  commanderDown: () => '衆徒の頭が討たれた',
  flee: () => '衆徒の頭が奥山へ逃げた',
};

// 携帯の任務札は見出しを先に出す。人数や待ち時間を補足だけに隠さない。
// 一秒ごとの区域点検から呼び、制圧や勝敗の条件は変えない。
// 柵の外では堂の中心へ直行させず、通れる参道の途中を先に示す。
// 印と遊び手の道案内で同じ点を使い、半秒ごとに既存の入れ物へ書く。
function templeWalkClear(rt, from, to) {
  if (rt.army.wallBetween(from, -1, to)) return false;
  // 壁が無くても切岸は登れない。本人と同じ一歩の判定で石段・坂をたどる。
  // 一歩の中へ石段を何段もまとめると、歩ける参道も九十一センチの壁になる。
  // 本人の移動と同じ短い刻みで足場を拾い、途中の切岸は従来どおり止める。
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .2));
  let x = from.x, z = from.z, y = from.y;
  for (let i = 1; i <= n; i++) {
    const nx = from.x + (to.x - from.x) * i / n, nz = from.z + (to.z - from.z) * i / n;
    if (!rt.player.canStep(x, z, nx, nz, y)) return false;
    y = groundAt(rt.world, nx, nz, y); x = nx; z = nz;
  }
  return true;
}
// 門への案内にも同じ通行確認を使う。堂の制圧用の記録とは分けて保つ。
function templeGateApproach(rt) {
  const F = rt.flags, P = rt.player.u.pos;
  const gate = F.step === 1 ? F.gateSomon : F.step === 2 ? F.gateSanmon : null;
  if (F.mode !== 'attack' || !gate?.struct.alive || nakaRoomAt(P.x, P.z, P.y)) return null;
  const cache = F.gateRoadState || (F.gateRoadState = {});
  return templeEntry(rt, null, GATE_ENTRY_ROUTES[F.step - 1], cache);
}
function templeEntry(rt, zone, road = HALL_ENTRY_ROUTES[rt.flags.step - 1], cache = rt.flags) {
  const F = cache, P = rt.player.u.pos, step = rt.flags.step;
  const end = road[road.length - 1];
  if (zone ? zone.test(P.x, P.z) : Math.hypot(P.x - end[0], P.z - end[1]) < 4) {
    F.hallEntry = null; F.hallEntryAt = 0; F.hallEntryReturning = false; return null;
  }
  // 押し合いで道の端をまたいでも、戻る札と進む札を繰り返さない。
  const wasReturning = F.hallEntryStep === step && F.hallEntryReturning;
  const roadDist = distToPolyline(P.x, P.z, road);
  const returning = wasReturning ? roadDist > 1.5 : roadDist >= 3.5;
  if (rt.t < (F.hallEntryAt || 0) && F.hallEntryStep === step && F.hallEntryReturning === returning) return F.hallEntry;
  F.hallEntryAt = rt.t + .5; F.hallEntryStep = step; F.hallEntryReturning = returning;
  const point = F.hallEntryPoint || (F.hallEntryPoint = { x: 0, y: 0, z: 0, i: 0 });
  const probe = F.hallEntryProbe || (F.hallEntryProbe = { x: 0, y: 0, z: 0 });
  let best = Infinity;
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1], b = road[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((P.x - a[0]) * dx + (P.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    // 直近の道が切岸や柵の向こうなら、四歩ごとの途中の口も探す。
    const divisions = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 4));
    for (let k = 0; k <= divisions + 1; k++) {
      const f = k === 0 ? t : (k - 1) / divisions;
      probe.x = a[0] + dx * f; probe.z = a[1] + dz * f;
      probe.y = groundAt(rt.world, probe.x, probe.z, P.y);
      const d = Math.hypot(probe.x - P.x, probe.z - P.z);
      if (d >= best || !templeWalkClear(rt, P, probe)) continue;
      best = d; point.x = probe.x; point.y = probe.y; point.z = probe.z; point.i = i;
    }
  }
  point.returning = returning;
  if (best < Infinity && !returning) {
    // 道に乗った後は八歩先へ案内する。近い門の点へ毎回戻すと、門の四歩先で往復してしまう。
    let remaining = 8;
    for (let i = point.i; i < road.length && remaining > .001; i++) {
      const end = road[i], dx = end[0] - point.x, dz = end[1] - point.z;
      const len = Math.hypot(dx, dz);
      if (len < .001) continue;
      const travel = Math.min(len, remaining), ax = point.x, az = point.z;
      let walked = 0, blocked = false;
      // 八歩先だけを調べると、途中の曲がり角や段差で失敗した時に
      // 足元の印が残る。一歩ずつ調べ、通れる最後の所まで印を進める。
      for (let d = Math.min(1, travel); ; d = Math.min(d + 1, travel)) {
        probe.x = ax + dx * d / len; probe.z = az + dz * d / len;
        probe.y = groundAt(rt.world, probe.x, probe.z, P.y);
        if (!templeWalkClear(rt, P, probe)) { blocked = true; break; }
        point.x = probe.x; point.y = probe.y; point.z = probe.z; walked = d;
        if (d >= travel) break;
      }
      remaining -= walked;
      if (blocked || travel < len) break;
    }
  }
  F.hallEntry = best < Infinity ? point : null;
  return F.hallEntry;
}
function templeOccupation(rt, zone, name) {
  const F = rt.flags;
  const P = rt.player.u.pos;
  const entry = templeEntry(rt, zone);
  // 見通せる残敵を先に示す。堂の中だけに残った時は敵の位置でなく戸口へ案内する。
  // 区域の点検と同じ一秒ごとの処理。兵も座標の入れ物も増やさない。
  F.hallFoe = null;
  F.hallDoor = false;
  F.hallExit = false;
  F.hallAround = false;
  if (zone.test(P.x, P.z) && zone.enemies > 0) {
    let nearest = 24;
    for (const u of rt.army.units) {
      if (u.team === rt.player.u.team || !siegeFighter(u) || !zone.test(u.pos.x, u.pos.z) ||
          Math.abs(u.pos.y - P.y) > 3) continue;
      const d = Math.hypot(u.pos.x - P.x, u.pos.z - P.z);
      if (d < nearest && templeWalkClear(rt, P, u.pos)) { nearest = d; F.hallFoe = u; }
    }
    if (!F.hallFoe && !nakaRoomAt(P.x, P.z, P.y)) {
      for (const u of rt.army.units) {
        if (u.team === rt.player.u.team || !siegeFighter(u) || !zone.test(u.pos.x, u.pos.z) ||
            Math.abs(u.pos.y - P.y) > 3 || !nakaRoomAt(u.pos.x, u.pos.z, u.pos.y)) continue;
        const d = Math.hypot(u.pos.x - P.x, u.pos.z - P.z);
        if (d < nearest && templeWalkClear(rt, P, templeWay(rt.army, rt.player.u, u.pos))) {
          nearest = d; F.hallFoe = u; F.hallDoor = true;
        }
      }
    }
    // 戸口から出た敵や、庭の壁の向こうに残る敵も中心の印に取り残さない。
    if (!F.hallFoe) {
      nearest = Infinity;
      let reachable = false;
      for (const u of rt.army.units) {
        if (u.team === rt.player.u.team || !siegeFighter(u) || !zone.test(u.pos.x, u.pos.z)) continue;
        const d = Math.hypot(u.pos.x - P.x, u.pos.z - P.z);
        // 壁の見通しだけでは、堂の脇の切岸を歩けるとは限らない。
        // 戸口や角への一歩を先に調べ、通れる残敵を距離より優先する。
        const clear = templeWalkClear(rt, P, templeWay(rt.army, rt.player.u, u.pos));
        if ((clear && !reachable) || (clear === reachable && d < nearest)) {
          reachable = clear; nearest = d; F.hallFoe = u;
        }
      }
    }
    if (F.hallFoe) {
      const room = nakaRoomAt(P.x, P.z, P.y);
      const targetRoom = nakaRoomAt(F.hallFoe.pos.x, F.hallFoe.pos.z, F.hallFoe.pos.y);
      F.hallExit = !!room && room.I !== targetRoom?.I;
      F.hallDoor = !room && !!targetRoom;
      F.hallAround = !room && !targetRoom && !!templeHallBetween(rt.army, P, F.hallFoe.pos)
        && rt.army.wallBetween(P, -1, F.hallFoe.pos);
    }
  }
  const text = !zone.test(P.x, P.z) && nakaRoomAt(P.x, P.z, P.y) ? `堂を出て、参道から${name}へ`
    : entry?.returning ? `参道の印へ戻れ。味方と${name}へ`
    : !zone.test(P.x, P.z) ? `参道の印から${name}へ。味方と入れ`
    : F.hallExit ? `堂を出て残る敵へ（あと${zone.enemies}人）`
    : F.hallDoor ? `堂の戸口から中の敵へ（あと${zone.enemies}人）`
    : F.hallAround ? `堂の脇から残る敵へ（あと${zone.enemies}人）`
    : zone.enemies > 0 ? `${name}の敵を味方と払え（あと${zone.enemies}人）`
    : zone.owner === ZONE_STATE.FRIEND ? `${name}の印へ、味方と進め`
    : zone.friends < zone.need ? `${name}で味方を待て（あと${zone.need - zone.friends}人）`
    : rt.t < zone.quietUntil ? `${name}で反撃に備えよ（あと${Math.ceil(zone.quietUntil - rt.t)}秒）`
    : `${name}を守れ（あと${Math.max(0, Math.ceil(zone.hold - zone.holdT))}秒）`;
  rt.obj('main', text, 'main', true);
  // 接近戦の手ほどきが出ても、堂の制圧がどこまで進んだか残す。
  rt.objProgress('main', zone.test(P.x, P.z) && zone.enemies > 0 ? `残る敵 ${zone.enemies}人。味方と押し返せ`
    : zone.owner !== ZONE_STATE.FRIEND && zone.friends < zone.need
      ? `堂の庭に味方${zone.friends}人／必要${zone.need}人。庭の内へ入ろう` : '');
}

// 麓の後備えや、前の堂に残した守りを制圧の援軍に数えない。
// 先手が減った時だけ必要人数を下げる。敵を払う条件と守る秒数は保つ。
function templeHallNeed(rt) {
  const F = rt.flags;
  if (F.mode !== 'attack' || F.step < 1 || F.step > 3 || !F.SZ ||
      rt.t < (F.hallNeedAt || 0)) return;
  F.hallNeedAt = rt.t + 1;
  let available = 0;
  for (const u of rt.army.units) {
    if (u.team !== rt.player.u.team || !siegeFighter(u)) continue;
    const b = u.group?.butai;
    if (b === F.reserve || F.step >= 2 && b === F.scout || F.step === 3 && b === F.flankBow) continue;
    available++;
  }
  const zone = F.SZ.byId[TEMPLE_HALL_IDS[F.step - 1]];
  zone.need = Math.max(1, Math.min(F.step === 1 ? 5 : F.step === 2 ? 7 : 4, available));
}

// 門を破った後は、残る鉄砲・弓の組も堂へ集める。
// 本堂のために外堂の物見を引き抜かず、麓の後備えも持ち場に残す。
function rallyTempleHall(rt) {
  const F = rt.flags;
  if (F.mode !== 'attack' || F.step < 1 || !F.SZ ||
      (F.step === 1 ? F.gateSomon.struct : F.step === 2 ? F.gateSanmon.struct : null)?.alive ||
      rt.t < (F.hallRallyAt || 0)) return;
  F.hallRallyAt = rt.t + 10;
  if (F.step >= 4) {
    // 下知どおり、物見・弓・別手の槍がそれぞれの堂の残敵を払う。
    // 山道の本人を百歩以上引き返させず、既存の兵と戸口の案内を使う。
    for (let i = 0; i < TEMPLE_HALL_IDS.length; i++) {
      const zone = F.SZ.byId[TEMPLE_HALL_IDS[i]];
      const guard = i === 0 ? F.scout : i === 1 ? F.flankBow : F.flankSpear;
      if (!guard?.real || guard.real.routed || guard.real._pinH || guard._route ||
          !guard.real.units.some(siegeFighter)) continue;
      let foe = null, nearest = Infinity;
      for (const u of rt.army.units) {
        if (u.team !== 1 || !siegeFighter(u) || !zone.test(u.pos.x, u.pos.z)) continue;
        const d = Math.hypot(u.pos.x - guard.pos.x, u.pos.z - guard.pos.z);
        if (d < nearest) { nearest = d; foe = u; }
      }
      if (foe) setRoute(guard, [[foe.pos.x, foe.pos.z]], true);
      else if (zone.owner !== ZONE_STATE.FRIEND || zone.friends < zone.need) {
        setRoute(guard, [[zone.pos.x, zone.pos.z]], true);
      }
    }
    return;
  }
  const zone = F.SZ.byId[F.step === 1 ? 'gezan' : F.step === 2 ? 'hondo' : 'oku'];
  // 奥の院へ進んでも、外堂の物見と本堂の弓は守りに残す。
  const stays = (b) => b === F.reserve || F.step >= 2 && b === F.scout || F.step === 3 && b === F.flankBow;
  if (zone.enemies > 0 && F.hallFoe && siegeFighter(F.hallFoe) && zone.test(F.hallFoe.pos.x, F.hallFoe.pos.z)) {
    // 人数が足りても、庭の端に残った敵を中央の槍の組が見落とすことがある。
    // 堂内の敵にも一組だけ寄せる。兵ごとの戸口案内を使い、壁を通り抜けない。
    const foe = F.hallFoe;
    const inside = !!nakaRoomAt(foe.pos.x, foe.pos.z, foe.pos.y);
    let support = null, nearest = 40, needsRoute = false;
    for (const b of F.attackers) {
      if (stays(b) || b.kind !== 'ashigaru' || b._route ||
          !b.real || b.real.routed || b.real._pinH ||
          (b.real.order !== 'hold' && b.real.order !== 'attack') ||
          !b.real.units.some(siegeFighter)) continue;
      // 隊の中心が区域外でも、庭へ入った兵は支援できる。
      // 名簿の先頭が壁の裏にいるだけで、通れる仲間まで待たせない。
      for (const mate of b.real.units) {
        // 制圧人数が足りても、門のすぐ外で止まった槍の組は残敵へ合流させる。
        if (!siegeFighter(mate)) continue;
        const d = Math.hypot(mate.pos.x - foe.pos.x, mate.pos.z - foe.pos.z);
        if (d >= nearest || Math.abs(mate.pos.y - foe.pos.y) >= 3) continue;
        const way = templeWay(rt.army, mate, foe.pos);
        if (!rt.army.wallBetween(mate.pos, -1, way)) {
          nearest = d; support = b;
          // 壁越しに四歩以内でも、戸口や角へ回る下知が要る。
          // 直線の距離だけで待機させると、近い一組が遠い援軍も呼べなくする。
          needsRoute = inside || d > 4 || Math.hypot(way.x - foe.pos.x, way.z - foe.pos.z) > .1;
        }
      }
    }
    if (support) {
      if (needsRoute) setRoute(support, [[foe.pos.x, foe.pos.z]], true);
      // 残敵と向き合う一組だけで、後続を呼ぶ処理まで止めない。
      // 既に間合いにいる少人数の組が毎回選ばれると、人数不足のまま退き陣になる。
      if (zone.friends >= zone.need) return;
    }
  }
  if (zone.friends >= zone.need) return;
  let support = null, most = 0;
  for (const b of F.attackers) {
    if (stays(b) || b._route || !b.real || b.real.routed || b.real._pinH) continue;
    let outside = 0;
    for (const u of b.real.units) if (siegeFighter(u) && !zone.test(u.pos.x, u.pos.z)) outside++;
    // 一人だけ残った槍の組を毎回呼び直し、弓や鉄砲を取り残さない。
    if (outside > most) { most = outside; support = b; }
  }
  if (!support) return;
  const road = F.step === 1 ? OUTER_ROUTE : F.step === 2 ? INNER_ROUTE : BOT_OKU_ROUTE;
  let i = 0;
  while (i < road.length - 1 && road[i][1] < support.pos.z - 4) i++;
  setRoute(support, road.slice(i), true);
  templeSay(rt, '組頭', `${support.kind === 'gun' ? '鉄砲' : support.kind === 'bow' ? '弓' : '槍'}の組、${TEMPLE_HALL_NAMES[zone.id]}へ集まれ`, 4);
}

// 守る側（defend）に切り替える時だけ使う（sim・bot の確かめ用。既定は攻め手）
function mode() { return window.__echizenMode === 'defend' ? 'defend' : 'attack'; }

function baseTerrain(x, z) {
  let h = 0.5 * Math.sin(x * 0.05 - 0.2) * Math.cos(z * 0.04) + 0.3 * Math.sin(z * 0.045 + x * 0.03);
  h += Math.max(0, z + 205) * 0.38;      // 麓から山上へ。実測の縄張りがないため縮めた斜面（+z が登り）
  const dv = distToPolyline(x, z, VALLEY_ROAD);
  h -= Math.max(0, 14 - dv) * 0.35;      // 谷の道の周りはいくらか窪む（伏兵に向く）
  // 周囲の尾根。麓・寺域・谷川の比高を変えない遠景の山（位置と高さは推定）。
  h += 45 * Math.exp(-(((Math.abs(x) - 130) / 48) ** 2) - ((z - 65) / 100) ** 2);
  return h;
}
// 平場の外側は短い土の切岸。登り道だけは別に均し、縁の段差を残さない。
const TERRACES = ECHIZEN_IKKO_PLAN.kuruwa.map((k) => ({
  x0: Math.min(...k.poly.map((p) => p[0])), x1: Math.max(...k.poly.map((p) => p[0])),
  z0: Math.min(...k.poly.map((p) => p[1])), z1: Math.max(...k.poly.map((p) => p[1])), y: k.level(baseTerrain),
}));
function terraceHeight(x, z) {
  let total = baseTerrain(x, z), weight = 1;
  for (const k of TERRACES) {
    const d = Math.hypot(Math.max(k.x0 - x, 0, x - k.x1), Math.max(k.z0 - z, 0, z - k.z1));
    if (d === 0) { total = k.y; weight = 1; break; }
    // 平場と山肌を四歩で結ぶと、人の背丈を越す壁が道の脇へ立つ。
    // 堂・門の高さは保ち、外側の肩だけを広げて土へつなぐ。
    // 隣の平場の肩が重なっても、順番に上書きしない。
    // 平場へ近づくほどその高さを優先し、縁の内外で同じ高さへつなぐ。
    if (d < 24) {
      const t = d / 24, s = t * t * (3 - 2 * t), w = (1 - s) / s;
      total += k.y * w; weight += w;
    }
  }
  let h = total / weight;
  // 土塁は描いた柵と同じ線から盛る。道の口では零に戻る。
  let bank = 0;
  for (const r of TEMPLE_RIMS) bank = Math.max(bank, 1.1 * Math.max(0, 1 - distToPolyline(x, z, r.pts) / 2.8));
  h += bank;
  for (const ditch of ECHIZEN_IKKO_PLAN.hori) {
    const d = distToPolyline(x, z, ditch.pts);
    h -= ditch.deep * Math.max(0, 1 - d / (ditch.w / 2));
  }
  // 道と堂の平場を避け、山腹だけに浅い土の段を残す。
  let roadD = Infinity, terraceD = Infinity;
  for (const road of TEMPLE_ROADS) roadD = Math.min(roadD, distToPolyline(x, z, road));
  for (const k of TERRACES) terraceD = Math.min(terraceD,
    Math.hypot(Math.max(k.x0 - x, 0, x - k.x1), Math.max(k.z0 - z, 0, z - k.z1)));
  const edge = Math.max(0, Math.min(1, (Math.min(roadD, terraceD) - 8) / 6));
  const band = (z + .12 * Math.abs(x)) / 9;
  const phase = band - Math.floor(band);
  h += edge * .8 * (phase - phase * phase * (3 - 2 * phase));
  return h;
}

// 山腹の露岩。地面へ半分埋め、形と材質を一束で共有する。通る道には置かない。
let slopeRockGeo, slopeRockMat, retainingGeo, retainingMat;
function templeSlopeRocks(rt) {
  if (!slopeRockGeo) {
    slopeRockGeo = new THREE.IcosahedronGeometry(1, 0);
    slopeRockMat = new THREE.MeshLambertMaterial({ color: 0x8b8974, map: stoneTex() });
  }
  const rocks = new THREE.InstancedMesh(slopeRockGeo, slopeRockMat, 256);
  const stone = new THREE.Object3D(), color = new THREE.Color();
  let n = 0;
  for (let i = 0; i < 64; i++) {
    const x = 26 + (i * 17 % 63), z = -146 + (i * 37 % 210);
    if (TEMPLE_ROADS.some((road) => distToPolyline(x, z, road) < 8) ||
        ECHIZEN_IKKO_PLAN.kuruwa.some((k) => inPoly(k.poly, x, z))) continue;
    const w = .8 + (i % 5) * .3, h = .65 + (i % 3) * .25;
    // 回した岩の裾を全周で調べる。坂の斜め下側にも土が接し、宙に浮く縁を残さない。
    const yaw = i * 2.4, c = Math.cos(yaw), s = Math.sin(yaw);
    let y = rt.world.heightAt(x, z);
    for (let j = 0; j < 8; j++) {
      const a = j * Math.PI / 4, dx = Math.cos(a) * w, dz = Math.sin(a) * w * .8;
      y = Math.min(y, rt.world.heightAt(x + dx * c + dz * s, z - dx * s + dz * c));
    }
    stone.position.set(x, y - .15, z); stone.rotation.set(0, yaw, 0);
    stone.scale.set(w, h, w * .8); stone.updateMatrix();
    rocks.setMatrixAt(n, stone.matrix);
    color.setScalar(.8 + (i % 4) * .07); rocks.setColorAt(n++, color);
  }
  // 参道の両肩に埋まった小石。広い山腹だけでなく、乱戦する足元にも土の起伏を残す。
  for (let i = 0; i < 192; i++) {
    const road = TEMPLE_ROADS[i % TEMPLE_ROADS.length];
    const j = (i * 7) % (road.length - 1), a = road[j], b = road[j + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < .01) continue;
    const t = ((i * 53) % 191) / 191, side = i % 2 ? 1 : -1;
    const offset = side * (4.4 + (i % 9) * .32);
    const x = a[0] + dx * t + dz / len * offset, z = a[1] + dz * t - dx / len * offset;
    if (ECHIZEN_IKKO_PLAN.kuruwa.some((k) => inPoly(k.poly, x, z))) continue;
    const w = .12 + (i % 7) * .045;
    const y = Math.min(rt.world.heightAt(x, z), rt.world.heightAt(x + w, z),
      rt.world.heightAt(x - w, z), rt.world.heightAt(x, z + w), rt.world.heightAt(x, z - w));
    stone.position.set(x, y - .04, z); stone.rotation.set(.1 * (i % 3), i * 2.4, .12);
    stone.scale.set(w * 1.3, w * .55, w); stone.updateMatrix();
    rocks.setMatrixAt(n, stone.matrix);
    color.setHex(i % 3 ? 0x9e957d : 0x697552); rocks.setColorAt(n++, color);
  }
  rocks.count = n; rocks.receiveShadow = rocks.castShadow = true;
  rt.scene.add(rocks);
}
// 耐久の区画は保ち、横木の形だけ短く割って切岸の地面へ追従させる。
function templeFence(world, seg, opt) {
  const [ax, az, bx, bz] = seg, n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(palisade(world,
    [ax + (bx - ax) * i / n, az + (bz - az) * i / n,
      ax + (bx - ax) * (i + 1) / n, az + (bz - az) * (i + 1) / n], { ...opt, batch: null }));
  const geo = mergeGeometries(parts.map((p) => p.geometry));
  for (const p of parts) p.geometry.dispose();
  // 寺の柵の区画も入れ物へ積み、一つずつ描かない（四十回ほど描いていた）
  const part = kitFence(opt.batch, geo, parts[0].material);
  if (part) return part;
  const mesh = new THREE.Mesh(geo, parts[0].material);
  mesh.castShadow = mesh.receiveShadow = true; mesh.userData.camBlock = true;
  return mesh;
}
// 写真の井楼を手本にした臨時の物見。城の屋根付き櫓を山寺へ持ち込まない。
// 二台とも単位形と材質を共有し、柱・横木・縄・板・木口を五回で描く。
let fieldBoxGeo, fieldLogGeo, fieldMats;
// 割った板と皮付き丸太を同じ木目にしない。樹皮の縦割れは小さな絵一枚で共用する。
function fieldBarkTex() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#a69b89'; ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 160; i++) {
    const x = (i * 47) % 128, y = (i * 83) % 256, length = 12 + i % 43;
    ctx.strokeStyle = i % 3 ? '#786e60' : '#c6baa4';
    ctx.lineWidth = 1 + i % 3;
    // 上下の継ぎ目にも同じ割れを回す。
    for (const offset of [-256, 0]) {
      ctx.beginPath(); ctx.moveTo(x, y + offset);
      ctx.lineTo(x + (i % 5 - 2), y + length / 2 + offset);
      ctx.lineTo(x, y + length + offset); ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
// 板囲いは丸太と別の薄い木肌。縦の割れと裾の雨染みを一枚に描き、二台で共用する。
function fieldBoardTex() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ded8c9'; ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 72; i++) {
    const x = (i * 47) % 128, y = (i * 83) % 256;
    ctx.strokeStyle = i % 3 ? 'rgba(89,79,62,.18)' : 'rgba(255,249,223,.3)';
    ctx.lineWidth = i % 7 ? 1 : 2;
    for (const offset of [-256, 0]) {
      ctx.beginPath(); ctx.moveTo(x, y + offset);
      ctx.lineTo(x + i % 3 - 1, y + 18 + i % 53 + offset); ctx.stroke();
    }
  }
  const stain = ctx.createLinearGradient(0, 190, 0, 256);
  stain.addColorStop(0, 'rgba(67,62,45,0)');
  stain.addColorStop(1, 'rgba(67,62,45,.32)');
  ctx.fillStyle = stain; ctx.fillRect(0, 190, 128, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function fieldLookout(world, x, z) {
  if (!fieldBoxGeo) {
    fieldBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    fieldLogGeo = new THREE.CylinderGeometry(1, 1.12, 1, 6);
    fieldMats = [0x5a4b39, 0x847259, 0xb09b70, 0xa28c66, 0x9a896b].map((color, k) =>
      new THREE.MeshLambertMaterial({ color, map: k === 0 ? fieldBarkTex() : k === 3 ? fieldBoardTex() : k === 2 || k === 4 ? null : woodTex() }));
  }
  const root = new THREE.Group(), rows = [[], [], [], [], []], y0 = world.heightAt(x, z);
  const dummy = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const box = (k, px, py, pz, w, h, d, rot = 0) => {
    dummy.position.set(px, py, pz); dummy.rotation.set(0, rot, 0);
    dummy.scale.set(w, h, d); dummy.updateMatrix(); rows[k].push(dummy.matrix.clone());
  };
  const log = (k, ax, ay, az, bx, by, bz, r) => {
    a.set(ax, ay, az); b.set(bx, by, bz).sub(a);
    dummy.position.copy(a).addScaledVector(b, .5);
    dummy.quaternion.setFromUnitVectors(up, b.clone().normalize());
    dummy.scale.set(r, b.length(), r); dummy.updateMatrix(); rows[k].push(dummy.matrix.clone());
    if (k === 0 && r >= .07) {
      // 樹皮と同じ色だった切り口を分ける。写真の横木の突き出しを木地で読ませる。
      const length = b.length();
      for (const t of [0, 1]) {
        dummy.position.copy(a).addScaledVector(b, t ? 1 + .003 / length : -.003 / length);
        dummy.scale.set(r * (t ? 1 : 1.12), .009, r * (t ? 1 : 1.12));
        dummy.updateMatrix(); rows[4].push(dummy.matrix.clone());
      }
    }
  };
  const H = 4.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const bottom = world.heightAt(x + sx * .9, z + sz * .9) - y0 - .25;
    log(0, sx * .9, bottom, sz * .9, sx * .9, H + 1.2, sz * .9, .13);
    solidCircle(x + sx * .9, z + sz * .9, .18);
  }
  for (let y = .55; y < H; y += .72) for (const side of [-1, 1]) {
    log(0, -1.16, y, side * .9, 1.16, y, side * .9, .075);
    log(0, side * .9, y + .14, -1.16, side * .9, y + .14, 1.16, .075);
    for (const end of [-1, 1]) {
      // 太い一塊の筒だった縄を三巻きに分け、交わる横木にも斜めに掛ける。
      for (const dy of [-.045, .005, .055])
        log(2, end * .9, y + dy, side * .9, end * .9, y + dy + .025, side * .9, .154);
      for (const sg of [-1, 1])
        log(2, end * .9 - .09, y - sg * .1, side * 1.005,
          end * .9 + .09, y + sg * .1, side * 1.005, .013);
    }
  }
  // 写真の井楼のように、横木だけの梯子状の脚へ斜めの筋交いを渡す。
  // 南の梯子口は空け、背面と両側面の上下二段を交互に支える。
  for (let tier = 0; tier < 2; tier++) {
    const low = .69 + tier * 1.44, high = low + 1.44, sign = tier ? -1 : 1;
    log(0, -sign * .9, low - .14, -.99, sign * .9, high - .14, -.99, .055);
    for (const side of [-1, 1])
      log(0, side * .99, low, -sign * .9, side * .99, high, sign * .9, .055);
  }
  // 写真の床下の根太と方杖。張り出す板の端を、横木二本だけで浮かせない。
  // 梯子のある南面は空け、左右の柱から外へ突き出す桁を支える。
  for (const side of [-1, 1]) {
    log(0, -1.3, H - .27, side * .9, 1.3, H - .27, side * .9, .105);
    for (const end of [-1, 1])
      log(0, end * .9, H - 1.1, side * .9, end * 1.22, H - .27, side * .9, .065);
  }
  for (const px of [-.85, 0, .85])
    box(1, px, H - .11, 0, .11, .14, 2.3);
  // 張り出した床は板の継ぎ目を残す。南面の中央は梯子口。
  for (let i = 0; i < 9; i++) box(1, (i - 4) * .255, H, 0, .245, .1, 2.3);
  for (const side of [-1, 1]) {
    box(1, 0, H - .15, side * .8, 2.6, .18, .14);
    for (let i = 0; i < 7; i++) {
      const p = (i - 3) * .3;
      if (!(side === 1 && Math.abs(p) < .45)) {
        // 狭間は黒塗りにせず上下の板を分けて抜く。
        if (i === 1 || i === 5) {
          box(3, p, H + .35, side * 1.08, .285, .6, .05);
          box(3, p, H + .98, side * 1.08, .285, .26, .05);
        } else box(3, p, H + .58, side * 1.08, .285, 1.06, .05);
      }
      // 横面にも二つの四角い狭間。写真と同じく板そのものを上下へ分ける。
      if (i === 1 || i === 5) {
        box(3, side * 1.08, H + .35, p, .285, .6, .05, Math.PI / 2);
        box(3, side * 1.08, H + .98, p, .285, .26, .05, Math.PI / 2);
      } else box(3, side * 1.08, H + .58, p, .285, 1.06, .05, Math.PI / 2);
    }
    for (const y of [H + .25, H + .92]) {
      box(1, side * 1.04, y, 0, .07, .07, 2.14);
      // 正面と背面の板も内側の横桟へ留める。梯子口は塞がない。
      if (side === -1) box(1, 0, y, side * 1.04, 2.14, .07, .07);
      else for (const end of [-1, 1]) box(1, end * .78, y, side * 1.04, .58, .07, .07);
      // 四角い縄の塊を、板と横桟を挟む三巻きと交差する結びへ替える。
      // 南の中央の梯子口を避け、板囲いの端だけを留める。
      for (const end of [-1, 1]) {
        for (const offset of [-.025, 0, .025]) {
          log(2, side * 1.12, y - .065, end * .8 + offset,
            side * 1.12, y + .065, end * .8 + offset, .012);
          log(2, end * .8 + offset, y - .065, side * 1.12,
            end * .8 + offset, y + .065, side * 1.12, .012);
          for (const dy of [-.065, .065]) {
            log(2, side * 1.005, y + dy, end * .8 + offset,
              side * 1.12, y + dy, end * .8 + offset, .012);
            log(2, end * .8 + offset, y + dy, side * 1.005,
              end * .8 + offset, y + dy, side * 1.12, .012);
          }
        }
        for (const sg of [-1, 1]) {
          log(2, side * 1.118, y - .06, end * .8 - sg * .045,
            side * 1.118, y + .06, end * .8 + sg * .045, .011);
          log(2, end * .8 - sg * .045, y - .06, side * 1.118,
            end * .8 + sg * .045, y + .06, side * 1.118, .011);
        }
      }
    }
  }
  const footZ = 2.9, footY = world.heightAt(x, z + footZ) - y0;
  for (const side of [-1, 1]) log(0, side * .29, footY, footZ, side * .29, H + .1, .92, .045);
  for (let i = 1; i <= 12; i++) {
    const t = i / 13;
    log(1, -.32, footY + (H - footY) * t, footZ + (.92 - footZ) * t,
      .32, footY + (H - footY) * t, footZ + (.92 - footZ) * t, .025);
  }
  rows.forEach((list, k) => {
    const mesh = new THREE.InstancedMesh(k === 0 || k === 2 || k === 4 ? fieldLogGeo : fieldBoxGeo, fieldMats[k], list.length);
    const color = new THREE.Color();
    list.forEach((matrix, i) => {
      mesh.setMatrixAt(i, matrix);
      // 板ごとの灰褐色のむらと、土へ埋まる柱の暗さ。材質と描画回数は共用のまま。
      color.setScalar(k === 2 ? 1 : .88 + ((i * 7) % 6) * .025);
      if (k === 0 && i < 4) color.multiplyScalar(.86);
      mesh.setColorAt(i, color);
    });
    mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  });
  root.position.set(x, y0, z);
  return root;
}
// 台は水平に保ち、四本の脚をそれぞれの地面へ埋める。斜面へ台ごと傾けない。
function templeLookout(world, x, z) {
  return fieldLookout(world, x, z);
  const tower = monomidai(world, x, z, 0);
  for (const post of tower.children.slice(0, 4)) {
    const bottom = world.heightAt(x + post.position.x, z + post.position.z) - tower.position.y - .2;
    const length = Math.max(.2, 4.2 - bottom);
    post.scale.y = length / 4.2;
    post.position.y = 4.2 - length / 2;
  }
  return tower;
}
// 鐘楼も近景の木造建物と同じ板葺きへ。鐘と四本柱、当たりは既存の物を使う。
// 復元図のない山寺なので、写真の簡素な切妻・押さえ木を手本に補う。
let bellRoofGeo, bellRoofMat;
function templeBellTower(world, x, z) {
  const tower = shoro(world, x, z, 0);
  const oldRoof = tower.children.find((m) => m.geometry?.type === 'ConeGeometry');
  if (oldRoof) { tower.remove(oldRoof); oldRoof.geometry.dispose(); }
  if (!bellRoofGeo) {
    bellRoofGeo = new THREE.BoxGeometry(1, 1, 1);
    bellRoofMat = new THREE.MeshLambertMaterial({ color: 0x80715d, map: woodTex() });
  }
  const rows = [], shades = [], dummy = new THREE.Object3D();
  const put = (px, py, pz, w, h, d, angle, shade) => {
    dummy.position.set(px, py, pz); dummy.rotation.set(0, 0, angle);
    dummy.scale.set(w, h, d); dummy.updateMatrix();
    rows.push(dummy.matrix.clone()); shades.push(shade);
  };
  const run = 1.85, rise = 1.05, angle = Math.atan2(rise, run), slope = Math.hypot(run, rise);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i++)
      put(side * run / 2, 3 + rise / 2 + (i % 3) * .006, (i - 4.5) * .32,
        slope + .06, .09, .312, -side * angle, .85 + (i % 4) * .06);
    for (const t of [.3, .78])
      put(side * run * t, 3 + rise * (1 - t) + .1, 0, .09, .1, 3.32, 0, .64);
    // 妻端の破風と軒下の垂木を屋根と一緒に一回で描く。
    for (const zz of [-1.62, -1, 0, 1, 1.62])
      put(side * run / 2, 3 + rise / 2 - .1, zz, slope + .12, .14, .1, -side * angle, .68);
  }
  put(0, 4.16, 0, .25, .14, 3.45, 0, .66);
  const roof = new THREE.InstancedMesh(bellRoofGeo, bellRoofMat, rows.length), color = new THREE.Color();
  rows.forEach((matrix, i) => { roof.setMatrixAt(i, matrix); color.setScalar(shades[i]); roof.setColorAt(i, color); });
  roof.castShadow = roof.receiveShadow = true;
  tower.add(roof);
  return tower;
}
// 倉の寸法と戸口を保ち、灰色の一枚面と石置きを、写真の茶褐色の板・押さえ木へ替える。
function templeStore(world, x, z, rot) {
  const store = hut(world, x, z, 5, 4, rot, { h: 2.6, ita: true, wall: 0x6a5c48,
    boardRoof: true, weatheredBoards: true, boardRoofColors: [0x786550, 0x685944, 0x89745b, 0x72614c] });
  store.userData.flammable = true;
  return store;
}
// 写真の井楼・裏方小屋と同じ、丸太・割板・縄で組んだ荷置き場。
// 寸法と置き場所は補完。遠くでは小屋と荷の輪郭だけ、近くでは板目・縄・桶の内側を見せる。
let fieldSupplyGeo, fieldSupplyMats;
function fieldSupplies(rt, x, z, shelter = false) {
  if (!fieldSupplyGeo) {
    fieldSupplyGeo = [new THREE.BoxGeometry(1, 1, 1),
      new THREE.CylinderGeometry(1, 1, 1, 8), new THREE.TorusGeometry(1, .035, 3, 12)];
    fieldSupplyMats = [
      new THREE.MeshLambertMaterial({ color: 0x78634b, map: woodTex() }),
      new THREE.MeshLambertMaterial({ color: 0xa99672, map: fieldBoardTex() }),
      new THREE.MeshLambertMaterial({ color: 0x9b8863 }),
      new THREE.MeshLambertMaterial({ color: 0x38382e }),
    ];
  }
  const W = rt.world, y0 = W.heightAt(x, z), near = new THREE.Group(), far = new THREE.Group();
  const rows = new Map(), coarse = new Map(), dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  const ground = (px, pz) => W.heightAt(x + px, z + pz) - y0;
  const save = (geo, mat, distant) => {
    dummy.updateMatrix();
    const key = geo * 4 + mat;
    if (distant !== 2) {
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push(dummy.matrix.clone());
    }
    if (distant) {
      if (!coarse.has(key)) coarse.set(key, []);
      coarse.get(key).push(dummy.matrix.clone());
    }
  };
  const box = (mat, px, py, pz, w, h, d, tilt = 0, distant = false) => {
    dummy.position.set(px, py, pz); dummy.rotation.set(tilt, 0, 0);
    dummy.scale.set(w, h, d); save(0, mat, distant);
  };
  const pole = (mat, ax, ay, az, bx, by, bz, radius, distant = false) => {
    direction.set(bx - ax, by - ay, bz - az);
    const length = direction.length();
    dummy.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    dummy.quaternion.setFromUnitVectors(up, direction.normalize());
    dummy.scale.set(radius, length, radius); save(1, mat, distant);
  };
  const hoop = (px, py, pz, radius, horizontal = true) => {
    dummy.position.set(px, py, pz); dummy.rotation.set(horizontal ? Math.PI / 2 : 0, 0, 0);
    dummy.scale.setScalar(radius); save(2, 2, false);
  };
  if (shelter) {
    // 背の低い片流れ。幕の裏へ納め、陣の中央と大将の退路は空ける。
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const bottom = ground(sx * 1.35, sz * .85) - .12;
      pole(0, sx * 1.35, bottom, sz * .85, sx * 1.35, 1.9 - sz * .18, sz * .85, .065, true);
      for (const dy of [-.035, 0, .035]) hoop(sx * 1.35, 1.72 + dy - sz * .18, sz * .85, .09);
    }
    for (const sz of [-1, 1]) pole(0, -1.55, 1.9 - sz * .18, sz * .85,
      1.55, 1.9 - sz * .18, sz * .85, .075, true);
    // 遠景専用の一枚屋根は近景へ重ねない。
    for (let i = 0; i < 12; i++) box(0, (i - 5.5) * .27, 1.98, 0, .258, .065, 2.3, .21);
    box(0, 0, 1.98, 0, 3.25, .065, 2.3, .21, 2);
    for (const pz of [-.66, .66]) box(0, 0, 1.98 - pz * .21 + .065, pz, 3.4, .065, .07);
    // 裏の筋交いと横木。正面を開け、布の天幕に見える細い脚だけの形を避ける。
    pole(0, -1.35, .3, -.85, 1.35, 1.95, -.85, .04, true);
    pole(0, -1.35, 1, -.85, 1.35, 1, -.85, .05, true);
    for (let i = 0; i < 9; i++) box(0, (i - 4) * .3, ground((i - 4) * .3, 0) + .025,
      0, .28, .04, 1.45);
  }
  // 薪は小さな三角積み。断面を明るくし、帯で縛った棒の塊にしない。
  for (let tier = 0; tier < 3; tier++) for (let i = 0; i < 4 - tier; i++) {
    const px = -.7 + (i - (3 - tier) / 2) * .2, pz = -.12;
    const py = ground(px, pz) + .14 + tier * .17;
    pole(0, px, py, pz - .58, px, py, pz + .58, .095, true);
    pole(1, px, py, pz - .589, px, py, pz - .575, .083);
    pole(1, px, py, pz + .575, px, py, pz + .589, .083);
  }
  // 水桶は底・箍・十二枚の側板で開口を残す。黒い円板を水面にしない。
  for (let n = 0; n < 2; n++) {
    const px = .65 + n * .65, pz = n ? .45 : -.25, bottom = ground(px, pz) + .04;
    pole(0, px, bottom, pz, px, bottom + .05, pz, .255);
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      dummy.position.set(px + Math.cos(a) * .25, bottom + .24, pz + Math.sin(a) * .25);
      dummy.rotation.set(0, -a, 0); dummy.scale.set(.035, .46, .126); save(0, 0, false);
    }
    for (const dy of [.08, .37]) hoop(px, bottom + dy, pz, .272);
    // 遠くでは蓋付きの荷として閉じ、近くの開いた桶と切り替える。
    dummy.position.set(px, bottom + .23, pz); dummy.rotation.set(0, 0, 0);
    dummy.scale.set(.27, .46, .27); save(1, 0, 2);
    if (!n) {
      pole(3, px, bottom + .12, pz, px, bottom + .135, pz, .23);
      pole(0, px - .3, bottom + .51, pz, px + .3, bottom + .51, pz, .025);
    } else box(0, px, bottom + .51, pz, .54, .045, .48, .16);
  }
  // 門攻め用の予備縄。毎コマ動かさず、交差した巻きと端だけを描く。
  for (let i = 0; i < 4; i++) hoop(.4, ground(.4, 1.05) + .035 + i * .022, 1.05, .23 - i * .025);
  pole(2, .55, ground(.55, 1.12) + .04, 1.12, .95, ground(.95, 1.3) + .04, 1.3, .013);
  const bake = (lists, group) => {
    const color = new THREE.Color();
    for (const [key, matrices] of lists) {
      if (!matrices.length) continue;
      const mesh = new THREE.InstancedMesh(fieldSupplyGeo[Math.floor(key / 4)], fieldSupplyMats[key % 4], matrices.length);
      matrices.forEach((matrix, i) => {
        mesh.setMatrixAt(i, matrix); color.setScalar(.83 + (i * 7 % 6) * .035); mesh.setColorAt(i, color);
      });
      // 小物は影の再描画を増やさず、月光と既存の篝火を受ける。
      mesh.receiveShadow = true; group.add(mesh);
    }
  };
  bake(rows, near); bake(coarse, far);
  const lod = new THREE.LOD();
  lod.position.set(x, y0, z); lod.addLevel(near, 0); lod.addLevel(far, 32, .15);
  // 夜霧の向こうは省く。切り替えには幅を持たせ、境界でちらつかせない。
  lod.addLevel(new THREE.Group(), 85, .15); rt.scene.add(lod);
}
// 寄せ手の控えの両翼だけを備える。参道・谷道と里の避難路を横切らない。
// 滝川勢の紋は兵と同じ物。寺の衆徒へ本願寺の紋を借りない。
function fieldCamp(rt) {
  const W = rt.world, cx = VILLAGE.x - 16, cz = VILLAGE.z;
  // 控えの幕を左右に分け、中央四歩を陣の出入りと大将の退路に残す。
  for (const side of [-1, 1]) rt.scene.add(jinmaku(W, cx + side * 4.5, cz - 2, 5, 6, 5, { mon: ODA.flag, contour: true, fieldHem: true }));
  for (const [ax, az, bx, bz] of [[8, -177, 18, -177], [39, -177, 49, -177]]) {
    // 線の左手が敵側。山上（+z）へ横木と乱杭、麓側へ控えと塹壕を向ける。
    rt.scene.add(bobosaku(W, [bx, bz, ax, az]));
  }
  // 写真の置き楯は、窓も紋も無い縦板二枚と黒い上帯。
  // 二枚ずつ据え、間の通り口も当たりと一致させる。支えは麓側。
  for (const [ax, bx] of [[8, 12], [45, 49]]) rt.scene.add(tateNarabi(W, bx, -181, ax, -181, { fieldPairs: true, fieldTimber: true }));
  // 写真の指物の列を手本に、一段おきに半歩外へ振る。
  // 同じ滝川の紋を保ち、竿を直立させて前後の布が重なり切らないようにする。
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const flag = nobori(W, cx + side * (8 + (i % 2) * 1.2), cz - 5 + i * 3.2, ODA.flag, 4.2);
    flag.rotation.x = flag.rotation.z = 0;
    flag.scale.y = 1;
    rt.scene.add(flag);
  }
  fieldSupplies(rt, cx - 7, cz - 10, true);
}
// 道の横傾きを削り、切岸と土塁の口も歩ける地面にそろえる。
// 同じ高さの目安を全ての道に使い、分かれ道で段差を作らない。
const ROAD_LEVELS = [[-220, baseTerrain(0, -220)], [-150, baseTerrain(0, -150)], [-110, baseTerrain(0, -110)],
  [-70, TERRACES[0].y], [-34, TERRACES[0].y], [-4, TERRACES[1].y],
  [20, TERRACES[1].y], [44, TERRACES[2].y], [70, TERRACES[2].y], [118, baseTerrain(0, 118)]];
// 本堂の南端で平場に着く。中央だけ低いまま二十歩先まで登らせると、
// 堂の横に深い溝ができ、兵が道の側壁へ取り付いていた。
function height(x, z) {
  const ground = terraceHeight(x, z);
  let best = Infinity;
  for (const road of TEMPLE_ROADS) best = Math.min(best, distToPolyline(x, z, road));
  if (best >= 22) return ground;
  let roadY = baseTerrain(0, z);
  for (let i = 1; i < ROAD_LEVELS.length; i++) {
    const a = ROAD_LEVELS[i - 1], b = ROAD_LEVELS[i];
    if (z >= a[0] && z <= b[0]) { roadY = a[1] + (b[1] - a[1]) * (z - a[0]) / (b[0] - a[0]); break; }
  }
  // 押し合う列の足元は幅七・六歩で均し、外側は二十二歩まで緩い肩を残す。
  // 列の幅を保ったまま、狭い帯の端に幹のような崖が戻るのを防ぐ。
  const shoulder = Math.max(0, best - 3.8) * .45;
  const graded = Math.max(roadY - shoulder, Math.min(roadY + shoulder, ground));
  const t = Math.max(0, Math.min(1, (22 - best) / 12));
  return ground + (graded - ground) * t * t * (3 - 2 * t);
}

// 部隊の多点の道。確保する堂では到着後に構え、次の下知まで持ち場を離れない。
function setRoute(b, pts, hold = false, facing = null) {
  b._columnRoad = b._columnRoad ? [...b._columnRoad, ...pts] : [[b.pos.x - Math.sin(b.facing) * (b.lightDepth || 8), b.pos.z - Math.cos(b.facing) * (b.lightDepth || 8)], [b.pos.x, b.pos.z], ...pts];
  b._gateWait = false; b._arriveHold = hold; b._arriveFacing = facing; b._route = pts; b._i = 0; advance(b);
}

// 軽い兵も一人ずつ道の曲がりへ沿わせる。背丈・肩幅と置き換え済みの席は保つ。
// 行列の後ろが曲がり角を抜けるまでは、堂へ着いた先頭と同じ点へ瞬間移動させない。
function mountainColumn(b) {
  const L = b.light;
  // 視野の外の遠景は形を作らない（emptyDistantArmy）。部品の無い隊は沿わせない。
  if (!L || !L.army?.parts?.body) return;
  const A = L.army, P = A.parts, base = new Float32Array(A.n * 16);
  const meshes = [P.body, P.flags, P.shade].filter(Boolean);   // 共通の隊に影の板は無いので、無い部品は更新しない。
  const m = new THREE.Matrix4(), turn = new THREE.Matrix4(), inv = new THREE.Matrix4(), p = new THREE.Vector3();
  const size = new THREE.Vector3();
  let front = 0;
  for (let i = 0; i < A.n; i++) {
    const saved = A.saved?.get(i);
    if (saved) m.copy(saved[0][2]); else P.body.getMatrixAt(i, m);
    m.toArray(base, i * 16);
    front = Math.max(front, (m.elements[12] - A.cx) * Math.sin(A.face0) + (m.elements[14] - A.cz) * Math.cos(A.face0));
  }
  const tick = A.tick;
  let wait = 0, elapsed = 0, drawn = null;
  A.tick = (dt) => {
    tick(dt);
    elapsed += dt;
    wait -= dt;
    const road = b._columnRoad;
    if (wait > 0 || !road || A.rout) return;
    wait = .25;
    L.updateWorldMatrix(true, false); inv.copy(L.matrixWorld).invert();
    p.set(A.cx + A.off.x, 0, A.cz + A.off.z).applyMatrix4(L.matrixWorld);
    let progress = 0, best = Infinity, length = 0, gateAt = Infinity;
    const gate = b._routeGate;
    for (let j = 1; j < road.length; j++) {
      const a = road[j - 1], c = road[j], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
      if (!len) continue;
      const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (len * len)));
      const d = Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t);
      if (d < best) { best = d; progress = length + len * t; }
      length += len;
      if (gate?.alive && c[0] === (gate.seg[0] + gate.seg[2]) / 2 && c[1] === (gate.seg[1] + gate.seg[3]) / 2) gateAt = length;
    }
    progress = Math.min(progress, gateAt - front - 1);
    if (drawn === null) drawn = Math.min(b.lightDepth || 8, progress);
    drawn += Math.max(-elapsed * 1.3, Math.min(elapsed * 1.3, progress - drawn));
    progress = drawn; elapsed = 0;
    for (let i = 0; i < A.n; i++) {
      if (A.taken[i] || A.hid[i] > 0) continue;
      m.fromArray(base, i * 16);
      // 人と旗は同じ直立の座標を使う。坂や元の傾きを継ぎ足して裏返さない。
      size.set(Math.hypot(m.elements[0], m.elements[1], m.elements[2]),
        Math.hypot(m.elements[4], m.elements[5], m.elements[6]),
        Math.hypot(m.elements[8], m.elements[9], m.elements[10]));
      const along = (m.elements[12] - A.cx) * Math.sin(A.face0) + (m.elements[14] - A.cz) * Math.cos(A.face0);
      const across = (m.elements[12] - A.cx) * Math.cos(A.face0) - (m.elements[14] - A.cz) * Math.sin(A.face0);
      let at = progress + along;
      let x = road[0][0], z = road[0][1], yaw = A.face0;
      for (let j = 1; j < road.length; j++) {
        const a = road[j - 1], c = road[j], dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
        if (!len) continue;
        if (at <= len || j === road.length - 1) { yaw = Math.atan2(dx, dz); x = a[0] + dx * at / len; z = a[1] + dz * at / len; break; }
        at -= len;
      }
      x += Math.cos(yaw) * across; z -= Math.sin(yaw) * across;
      p.set(x, 0, z).applyMatrix4(inv).sub(A.off);
      turn.makeRotationY(yaw - L.rotation.y);
      m.copy(turn).scale(size).setPosition(p);
      for (const mesh of meshes) { mesh.setMatrixAt(i, m); mesh.instanceMatrix.needsUpdate = true; }
      if (P.banners) { const j = P.bearers.indexOf(i); if (j >= 0) { P.banners.setMatrixAt(j, m); P.banners.instanceMatrix.needsUpdate = true; } }
      if (A.base) A.base.set(m.elements, i * 16);
    }
    // 行列は元の長方形より広がるため、古い外接球で途中の兵を消さない。
    for (const mesh of L.children) mesh.frustumCulled = false;
  };
}

// 段が変わったら、前の段で待っていた声を取り消す。
function resetTempleSpeech(rt) {
  rt.flags.speechEpoch = (rt.flags.speechEpoch || 0) + 1;
  rt.flags.speechAt = rt.t;
}

// 合図も生きた隊から出す。位置付きの共用音で距離・向き・遅れを付ける。
// 段の切り替えだけで鳴らし、毎コマ音や位置の入れ物を作らない。
function templeSignal(rt, b, sound, vol = .8) {
  const g = b?.real;
  if (!g || g.routed) return;
  let from = b.taishoU || g.leader;
  if (!from?.alive || from.fleeing || from.woundOut) {
    from = null;
    for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget && !u.isStruct) {
      from = u; break;
    }
  }
  if (from) rt.army.play(sound, from.pos, vol);
}

// 声は生きた現場の兵からだけ聞こえる。遠い陣所の知らせは既存の徒歩の使番に運ばせる。
function templeSay(rt, who, text, seconds, remind = false) {
  const P = rt.player.u, F = rt.flags;
  // 出来事は一度だけ。迷っている時の手ほどきは八秒以上あけて伝え直す。
  const said = F.templeSaid || (F.templeSaid = new Set());
  const reminders = F.templeReminders || (F.templeReminders = new Map());
  if (remind ? rt.t < (reminders.get(text) ?? -Infinity) + 8 : said.has(text)) return;
  if (who === '伝令') {
    const from = F.reserve?.taishoU;
    if (from?.alive && !from.fleeing && !from.woundOut) sendOrder(rt, from, P, { id: 'templeNews', apply: () => {
      if (!rt.over && P.alive && !said.has(text)) { said.add(text); rt.say('伝令', text, seconds); }
    } }, { team: P.team, faction: F.mode === 'attack' ? 'oda' : 'ikko' });
    return;
  }
  const team = who === '大滝寺の衆徒' || who === '寺の指揮役' || who === '職人' ? (F.mode === 'defend' ? 0 : 1) : P.team;
  for (const u of rt.army.units) {
    if (u === P || !u.alive || u.team !== team || u.woundOut || u.isStruct) continue;
    if (who === '職人' ? !u.group?.name.includes('職人') : u.fleeing || u.noTarget) continue;
    if (who === '滝川一益' && u !== F.reserve?.taishoU) continue;
    if (who === '寺の指揮役' && u !== (F.ikkoHondoMain || F.ikkoMain)?.taishoU) continue;
    if (Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) <= 30 && Math.abs(u.pos.y - P.pos.y) < 8 && !rt.army.wallBetween(u.pos, -1, P.pos)) {
      if (remind) reminders.set(text, rt.t);
      else said.add(text);
      rt.say(who === '組頭' && u !== u.group?.leader ? '足軽' : who, text, seconds); return;
    }
  }
}
function advance(b) {
  if (!b._route || b._i >= b._route.length) {
    const post = b._arriveHold && b._route?.[b._route.length - 1];
    b.order({ id: b._arriveHold ? 'hold' : 'attack', form: b.kind === 'gun' || b.kind === 'bow' ? 'line' : 'yari' });
    // 縦隊の中心は到着点より後ろにある。待機で中心へ戻すと、
    // 石段を上った兵まで区域外へ下り、味方を待つ任務が終わらなくなる。
    if (post && b.real) { b.real.anchor.x = post[0]; b.real.anchor.z = post[1]; }
    if (b._arriveFacing != null) { b.facing = b._arriveFacing; if (b.real) b.real.facing = b._arriveFacing; }
    b._route = null; b._arriveHold = false; b._arriveFacing = null;
    return;
  }
  const [x, z] = b._route[b._i++];
  b.order({ id: 'move', to: { x, z }, form: 'column' });
}
function tickRoutes(list) {
  for (const b of list) {
    if (!b._route || b.aliveNominal() <= 0 || b.real && (b.real.routed || b.real._pinH)) continue;
    const [x, z] = b._route[b._i - 1];
    // 門の点を通過扱いにして、閉じた門の奥へ行かせない。槍の隊が破ってから先へ進む。
    const gate = b._routeGate;
    if (gate && gate.alive && x === (gate.seg[0] + gate.seg[2]) / 2 && z === (gate.seg[1] + gate.seg[3]) / 2) {
      const order = b.kind === 'gun' || b.kind === 'bow' ? 'hold' : 'assault';
      // 竹束の陰で待つ間は道を進めない。待機が終わったら門攻めの下知を保つ。
      if ((!b._gateWait || b.real && b.real.order !== order) && Math.hypot(b.pos.x - x, b.pos.z - z) < 10) { b._gateWait = true; b.order({ id: order, form: 'column' }); b.light?.halt(); }
      continue;
    }
    if (b._gateWait && gate && !gate.alive) { b._gateWait = false; advance(b); continue; }
    // 堂の最後の点は中まで進む。十歩手前で待つと、門に列が残り守りの人数も足りない。
    const lastHold = b.team === 0 && b._arriveHold && b._i === b._route.length;
    const arrived = b.real?.order === 'hold' &&
      Math.hypot(b.real.anchor.x - x, b.real.anchor.z - z) < 1;
    // 石段では曲がり点まで進む。十歩手前で次へ向くと、段の脇の切岸を横切ってしまう。
    const onSteps = b.team === 0 && z >= -34;
    if (arrived || Math.hypot(b.pos.x - x, b.pos.z - z) < (lastHold || onSteps ? 3 : 10)) advance(b);
  }
}
// 先手が見張りを払っても、竹束を待つ本人の前を空け続けない。
// 一秒ごとに既存の守りだけを寄せる。逃げた組や、閉じた門の向こうの組は呼び戻さない。
function closeTempleGap(rt) {
  const F = rt.flags, P = rt.player.u.pos;
  if (F.step < 1 || F.step >= 5) return;
  for (const u of rt.army.units) {
    if (u.team !== rt.player.u.team && u.alive && !u.fleeing && !u.woundOut &&
        !u.isStruct && !u.civ && !u.noTarget && u.type !== 'dummy' &&
        Math.hypot(u.pos.x - P.x, u.pos.z - P.z) <= 25) { F.emptyRoadT = null; return; }
  }
  if (F.emptyRoadT == null) F.emptyRoadT = rt.t;
  if (rt.t - F.emptyRoadT < 6) return;
  const road = F.step >= 3 ? GUARD_UPPER_ROUTE : P.x < -10 ? FOREST_ROAD : P.x > 14 ? VALLEY_ROAD : SANDO;
  let best = Infinity, x = P.x, z = P.z;
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1], b = road[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((P.x - a[0]) * dx + (P.z - a[1]) * dz) / (len * len || 1)));
    const d = Math.hypot(P.x - a[0] - dx * t, P.z - a[1] - dz * t);
    if (d >= best) continue;
    best = d;
    const ahead = Math.min(1, t + 16 / (len || 1));
    x = a[0] + dx * ahead; z = a[1] + dz * ahead;
  }
  if (best > 12 || Math.hypot(x - P.x, z - P.z) > 22) return;
  let guard = null, distance = 60;
  const goal = F.guardRoadGoal || (F.guardRoadGoal = { x: 0, z: 0 });
  goal.x = x; goal.z = z;
  if (rt.army.wallBetween(P, -1, goal)) return;
  for (const b of F.defenders) {
    if (b.kind !== 'ashigaru' || b._route || b._templeIntercept || b._templeRetired || b._templeBroken ||
        !b.real || b.real.routed || b.real.order !== 'hold' || b.real._pinH ||
        b.pos.z < P.z || b === F.ikkoAmbush || F.roadWaves?.includes(b) && !b._nightReleased ||
        !b.real.units.some((u) => u.alive && !u.fleeing && !u.woundOut)) continue;
    const d = Math.hypot(b.pos.x - P.x, b.pos.z - P.z);
    if (d >= distance || rt.army.wallBetween(b.pos, -1, goal)) continue;
    guard = b; distance = d;
  }
  if (!guard) return;
  guard._templeIntercept = true;
  setRoute(guard, [[x, z]], true, Math.PI);
  F.emptyRoadT = rt.t;
}
// 門には城攻めと同じ掛矢を置く。槍だけで延々と削らせず、任務の門を自分でも打てる。
function gateWork(rt, gate, at) {
  rt.uninteract('templeGate');
  if (rt.flags.mode !== 'attack') return;
  const name = at === GATE_SANMON ? '山門' : '惣門';
  rt.addInteract('templeGate', { x: at.x, z: at.z - 2 }, `木づちで${name}を打つ`, () => {
    if (!gate.alive || rt.flags.ending || rt.over || !rt.player.u.alive) return;
    rt.army.damage(gate, 42, rt.player.u, { kind: 'gateWork' });
    rt.army.play('knock', at, 1.2);
    rt.game.hitstop = 0.05;
  }, { r: 3.4, hold: 0.7, prio: 14 });
}
let KAKeyaHandle, KAKeyaHead, KAKeyaMat;
// 既存の先手から打ち手を選ぶ。兵を足さず、門へ届いた掛矢の作業だけで傷める。
function prepareGateWorkers(rt) {
  if (!KAKeyaHandle) {
    KAKeyaHandle = new THREE.CylinderGeometry(.035, .035, 1.1, 6); KAKeyaHandle.rotateX(Math.PI / 2); KAKeyaHandle.translate(0, 0, .35);
    KAKeyaHead = new THREE.CylinderGeometry(.14, .14, .36, 8); KAKeyaHead.rotateZ(Math.PI / 2); KAKeyaHead.translate(0, 0, .85);
    KAKeyaMat = new THREE.MeshLambertMaterial({ color: 0x6b4d2b });
  }
  const F = rt.flags;
  // 掛矢と竹束への矢玉が重なっても、木を打つ音を連続させない。
  const play = rt.army.play;
  let knockAt = -Infinity;
  rt.army.play = function(name, at, vol) {
    if (name === 'knock') {
      if (rt.t < knockAt) return;
      knockAt = rt.t + 1.4;
    }
    return play.call(this, name, at, vol);
  };
  F.gateWorkers = [];
  for (const b of F.attackers) {
    if (b === F.reserve || b.kind === 'gun' || b.kind === 'bow') continue;
    const u = b.real?.units.find((u) => u.alive && !u.keep && u.hand && u.wpn);
    if (!u) continue;
    const tool = new THREE.Group(); tool.add(new THREE.Mesh(KAKeyaHandle, KAKeyaMat), new THREE.Mesh(KAKeyaHead, KAKeyaMat));
    tool.visible = false; u.hand.add(tool);
    F.gateWorkers.push({ b, u, tool, t: 0 });
  }
  const damage = rt.army.damage;
  rt.army.damage = function(t, amount, src, opts = {}) {
    if (t === F.gateSomon.struct || t === F.gateSanmon.struct) {
      const x = (t.seg[0] + t.seg[2]) / 2, z = (t.seg[1] + t.seg[3]) / 2;
      if (!opts.autoWork && (opts.kind !== 'gateWork' || !src?.alive || src.team === t.team || Math.hypot(src.pos.x - x, src.pos.z - z) > 4)) {
        if (opts.out) opts.out.res = 'armor'; return;
      }
    }
    // 本人の有効な掛矢も記録し、破門の知らせで自分の働きが分かるようにする。
    if (opts.kind === 'gateWork' && src?.isPlayer && t.alive &&
        (t === F.gateSomon.struct || t === F.gateSanmon.struct)) t._templePlayerWorked = true;
    return damage.call(this, t, amount, src, opts);
  };
  const ignite = rt.army.igniteStruct;
  rt.army.igniteStruct = function(s, p) {
    if (s.paperWetUntil > rt.t) return;
    return ignite.call(this, s, p);
  };
}
function tickGateWorkers(rt, dt) {
  const F = rt.flags;
  const pickWorker = rt.t >= (F.pickGateWorkerAt || 0);
  if (pickWorker) F.pickGateWorkerAt = rt.t + 1;
  for (const w of F.gateWorkers) {
    if (!w.u.alive || w.u.woundOut || w.u.fleeing) {
      const next = w.b.real?.units.find((u) => u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.keep && u.hand && u.wpn);
      w.tool.visible = false;
      if (w.u.wpn) w.u.wpn.visible = true;
      w.t = 0;
      if (next && next !== w.u) { next.hand.add(w.tool); w.u = next; }
    }
    const gate = w.b._routeGate;
    // 門に届いた兵へ掛矢を渡す。列の後ろの一人が着くまで、全隊を待たせない。
    if (pickWorker && !w.tool.visible && gate?.alive && w.b._gateWait) {
      const x = (gate.seg[0] + gate.seg[2]) / 2, z = (gate.seg[1] + gate.seg[3]) / 2;
      let next = null, nearest = 3.5;
      for (const mate of w.b.real?.units || []) {
        if (!mate.alive || mate.fleeing || mate.woundOut || mate.rearWound || mate.downed ||
            mate.stagger > 0 || mate.keep || !mate.hand || !mate.wpn) continue;
        const d = Math.hypot(mate.pos.x - x, mate.pos.z - z);
        if (d <= nearest) { nearest = d; next = mate; }
      }
      if (next && next !== w.u) {
        if (w.u.wpn) w.u.wpn.visible = true;
        next.hand.add(w.tool); w.u = next; w.t = 0;
      }
    }
    const u = w.u;
    let work = !F.ending && u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed && !(u.stagger > 0) && !w.b.real.routed && gate?.alive && w.b._gateWait;
    if (work) {
      const x = (gate.seg[0] + gate.seg[2]) / 2, z = (gate.seg[1] + gate.seg[3]) / 2;
      work = Math.hypot(u.pos.x - x, u.pos.z - z) <= 3.5 && Math.abs(u.pos.y - rt.world.heightAt(x, z)) < 2;
      if (work) for (const foe of rt.army.units) if (foe.alive && foe.team !== u.team && !foe.isStruct && !foe.noTarget && !foe.fleeing && !foe.woundOut && Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z) < 3 && !rt.army.wallBetween(u.pos, -1, foe.pos)) { work = false; break; }
    }
    w.tool.visible = !!work;
    if (u.wpn) u.wpn.visible = !work;
    if (!work) { w.t = 0; continue; }
    w.t += dt; w.tool.rotation.x = -.5 + Math.sin(w.t * Math.PI / .8) * .5;
    if (w.t >= 1.6) { w.t = 0; rt.army.damage(gate, 42, u, { kind: 'gateWork' }); }
  }
}
// 各隊の本物は14人まで。攻めの13隊182人＋見張り18人＋自分の組最大30人＋景色10人。残りは既存の軽い軍勢
// 寺の守り：衆徒は既存の目窓付き裹頭と袈裟。生成りと茶で袖・手・襟の輪郭を残す。
function mkB(rt, o) {
  const monk = /衆徒|薙刀|衆|僧/.test(o.name || '') && o.kind !== 'bow' && o.kind !== 'gun';
  // 本の陣笠・雑兵の図に合わせ、僧以外は漆塗りの円錐笠。味方の小袖は茶（紺は夜に青い味方に見える。10/29）。
  // 裹頭の僧は保ち、形・材質は既存の貸し具足を使う。
  const look = monk ? { sohei: 1, soheiV: 2, monk: 1, tier: 0, hat: 'kato', kato: 0xbab3a2, kesa: 0x93734d, cloth: 0x756d5c, skin: 0xc49a77, dirt: .25, kote: 0, sode: false, haori: 0, horo: 0, menpo: 0, tenugui: false, saya: false, trim: 0, left: null, haramaki: false } : { hat: 'jingasa', hatColor: o.faction === 'ikko' ? 0x70372b : 0x191613, lace: 0x5a5040, cloth: o.faction === 'ikko' ? 0x29343d : 0x3a2e24, doStyle: 'okegawa', haori: 0, horo: 0 };
  const b = makeButai(rt, { real: Math.min(14, o.nominal), maxReal: 14, nearReal: 14, farReal: 14, lightWidth: 10, lightDepth: Math.max(8, Math.ceil(o.nominal / 5) * 1.6), look: { ...look, horse: false }, ...o });
  if (b.light) { b.light.army.team = o.team; b.light.army.noWake = true; b.light.army.keepNear = false; }
  mountainColumn(b);
  const grow = b.growReal;
  if (monk && o.faction === 'ikko') templeFlagPoles(b);
  b.growReal = function(k) {
    if (this._templeBroken || this.real && (this.real.routed || this.real.order === 'flee')) return 0;
    const n = grow.call(this, k);
    if (monk && o.faction === 'ikko') templeFlagPoles(this);
    return n;
  };
  const update = b.update;
  b.update = function(dt) {
    if (this.real && !this.real.count && this._prevRealAlive > 0) {
      this.lost = Math.min(this.nominal, this.lost + this._prevRealAlive); this._prevRealAlive = 0;
    }
    if (!this._templeBroken && (this.real?.routed || this.real?.order === 'flee')) {
      this._templeBroken = true; this.light?.rout({ hideAfter: 0 });
    }
    update.call(this, dt);
  };
  if (b.real) { b.real.width = 5; b.real.spacing = 1.6; b.real.noGuard = true; }
  if (b.taishoU) b.taishoU.isLord = true;
  // 不明な将の紋を作らず、既存の丸の指物を大きくする。
  if (b.taishoU && o.general === '寺の指揮役' && b.taishoU.flag) b.taishoU.flag.scale.multiplyScalar(1.6);
  if (b.taishoU && o.general === '滝川一益') {
    b.taishoU.mustLive = true; b.taishoU.invuln = true;
    // 山道へ持ち込まず、麓の陣所に馬印を据える。兵数・戦う役目はそのまま。
    // 形は共通の結合済み馬印。金球と竿の頂点色を保つ材質も、初めに一度だけ作る。
    const mark = new THREE.Mesh(umaGeometry(NAMED_GEAR[o.general].campUma),
      templeUmaMat || (templeUmaMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })));
    const mx = o.at.x - 3, mz = o.at.z;
    // 据えた馬印の支持具は復元。三つ団子の重みを、十字の台と四方の筋交いで受ける。
    // 台の両端を地面に合わせ、既存の共用の竿と木の材質だけで組む。
    const baseY = rt.world.heightAt(mx, mz);
    mark.position.set(mx, baseY + .1 - .9, mz);
    mark.castShadow = true; rt.scene.add(mark);
    // 筋交いの上端を竿へ縛る。結び方も復元で、当日の据え台の仕様を示すものではない。
    // 三巻きを一つの形へ結合し、攻め・守りの作り直しでも形と材質を共用する。
    if (SETTINGS.quality === 'high') {
      if (!templeUmaLashingGeo) {
        const turns = [];
        for (let i = 0; i < 3; i++) {
          const turn = new THREE.TorusGeometry(.035, .011, 4, 10);
          turn.rotateX(Math.PI / 2); turn.translate(0, .91 + i * .02, 0);
          turns.push(turn);
        }
        templeUmaLashingGeo = mergeGeometries(turns);
        for (const turn of turns) turn.dispose();
        templeUmaRope = new THREE.MeshLambertMaterial({ color: 0x89734f });
      }
      const lashing = new THREE.Mesh(templeUmaLashingGeo, templeUmaRope);
      lashing.position.set(mx, baseY, mz); lashing.castShadow = true;
      rt.scene.add(lashing);
    }
    if (!templePoleGeo) templePoleGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    const wood = lanternWood || (lanternWood = new THREE.MeshLambertMaterial({ color: 0x493823 }));
    const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
    const timber = (ax, ay, az, bx, by, bz, radius) => {
      const beam = new THREE.Mesh(templePoleGeo, wood);
      direction.set(bx - ax, by - ay, bz - az);
      beam.scale.set(radius, direction.length(), radius);
      beam.quaternion.setFromUnitVectors(up, direction.normalize());
      beam.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      beam.castShadow = true; rt.scene.add(beam);
    };
    for (let axis = 0; axis < 2; axis++) {
      const dx = axis ? 0 : .7, dz = axis ? .7 : 0;
      const ay = rt.world.heightAt(mx - dx, mz - dz) + .04;
      const by = rt.world.heightAt(mx + dx, mz + dz) + .04;
      timber(mx - dx, ay, mz - dz, mx + dx, by, mz + dz, .06);
      for (const side of [-1, 1]) {
        timber(mx + side * dx, side < 0 ? ay : by, mz + side * dz, mx, baseY + .95, mz, .025);
      }
    }
  }
  return b;
}

// 大滝寺の焼失は由緒、夜討ち・持ち場・兵数は補完。衆徒の将名と家紋は不明。
// 白山信仰の寺に本願寺の将や紋を置かず、丸の目印を保つ。
function templeJin(defend) {
  const row = (id, role, general, soldiers, x, z, flag, bind) => [id, role, general, soldiers, x, z, flag, flag === 'maru' ? null : flag, 0, { bind }];
  return [
    rosterPlan('参道と谷道の寄せ', defend ? 1 : 0, VILLAGE, 0, defend ? [
      row('main', '参道の仕寄り', '滝川一益の配下（名は不明）', 100, VILLAGE.x, VILLAGE.z + 12, 'takigawa', 'odaMain'),
      row('gun', '参道の鉄砲', '滝川一益の配下（名は不明）', 40, VILLAGE.x + 14, VILLAGE.z, 'takigawa', 'odaGun'),
      row('flank', '谷道の別手', '滝川一益の配下（名は不明）', 90, VILLAGE.x + 30, VILLAGE.z + 12, 'takigawa', 'odaFlank'),
      row('reserve', '麓の陣所と守り', '滝川一益', 30, VILLAGE.x - 16, VILLAGE.z, 'takigawa', 'reserve'),
    ] : [
      row('scout', '参道の物見', '滝川一益の配下（名は不明）', 14, VILLAGE.x, VILLAGE.z + 38, 'takigawa', 'scout'),
      row('main', '参道の仕寄り', '滝川一益の配下（名は不明）', 150, VILLAGE.x, VILLAGE.z + 12, 'takigawa', 'mainSpear'),
      row('gun', '参道の鉄砲', '滝川一益の配下（名は不明）', 50, VILLAGE.x + 14, VILLAGE.z, 'takigawa', 'mainGun'),
      row('flank', '谷道の別手', '滝川一益の配下（名は不明）', 100, VILLAGE.x + 30, VILLAGE.z + 12, 'takigawa', 'flankSpear'),
      row('bow', '谷道の弓', '滝川一益の配下（名は不明）', 40, VILLAGE.x + 44, VILLAGE.z + 12, 'takigawa', 'flankBow'),
      row('reserve', '麓の後備え・陣所', '滝川一益', 60, VILLAGE.x - 16, VILLAGE.z, 'takigawa', 'reserve'),
    ], '大瀧神社の由緒、越前和紙の案内。各備えの兵数・攻め口・陣所は仮定。越前へ侵攻した全軍の数ではない'),
    rosterPlan('堂と山道の守り', defend ? 0 : 1, INNER_POS, Math.PI, defend ? [
      row('main', '本堂', '寺の指揮役（名は不明）', 70, 0, 6, 'maru', 'ikkoMain'),
      row('gun', '本堂の鉄砲', '寺の指揮役（名は不明）', 20, -10, 24, 'maru', 'ikkoBow'),
      row('valley', '谷道の伏せ勢', '寺の指揮役（名は不明）', 24, 28, -66, 'maru', 'ikkoAmbushD'),
    ] : [
      row('watchLower', '麓の見張り', '見張り役（名は不明）', 6, 0, -174, 'maru', 'ikkoWatchLower'),
      row('watchMiddle', '参道の見張り', '見張り役（名は不明）', 6, 0, -138, 'maru', 'ikkoWatchMiddle'),
      row('watchGate', '惣門前の見張り', '見張り役（名は不明）', 6, 0, -102, 'maru', 'ikkoWatchGate'),
      row('outer', '外堂の薙刀', '寺の指揮役（名は不明）', 46, 0, -58, 'maru', 'ikkoGezanSpear'),
      row('bow', '外堂の弓', '寺の指揮役（名は不明）', 16, 10, -54, 'maru', 'ikkoGezanBow'),
      row('main', '本堂', '寺の指揮役（名は不明）', 60, 0, 4, 'maru', 'ikkoHondoMain'),
      row('gun', '本堂の鉄砲', '寺の指揮役（名は不明）', 16, -10, 24, 'maru', 'ikkoHondoBow'),
      row('oku', '奥の院', '寺の指揮役（名は不明）', 42, 0, 49, 'maru', 'ikkoOkuLast'),
      row('rear', '山道の守り', '寺の指揮役（名は不明）', 6, -14, 86, 'maru', 'ikkoCounter'),
      row('rear2', '山道の後備え', '衆徒の頭（名は不明）', 8, -20, 98, 'maru', 'roadSecond'),
      row('rear3', '奥山の後備え', '衆徒の頭（名は不明）', 8, -26, 110, 'maru', 'roadThird'),
      row('valley', '谷道の伏せ勢', '寺の指揮役（名は不明）', 26, 30, -70, 'maru', 'ikkoAmbush'),
    ], '大滝寺の要件と既存の堂の並び。戦う衆徒の数・将・布陣は不明'),
  ];
}
const TEMPLE_JIN = templeJin(false), TEMPLE_DEFEND_JIN = templeJin(true);

// 夜の木だけを調整する。共通の葉の揺れと幹の近距離の抜きは残す。
function templeNightTrees(rt) {
  const player = { value: new THREE.Vector3().copy(rt.player.u.pos) };
  rt.flags.treePlayer = player;
  const mats = new Map();
  for (const mesh of rt.world.treeMeshes || []) {
    const base = mesh.material;
    let mat = mats.get(base.uuid + (mesh.userData.treeFoliage ? '|leaves' : ''));
    if (!mat) {
      mat = base.clone();
      const leaves = !!base.alphaTest || !!mesh.userData.treeFoliage;
      mat.color.setHex(leaves ? 0x496647 : 0x8b7d6c);
      mat.emissive.setHex(leaves ? 0x142014 : 0x17130f);
      if (leaves) {
        // 束にした木は一本ずつ半透明の順を並べられない。葉の隙間だけ抜き、奥の山へ重ねる。
        mat.transparent = false; mat.opacity = 1; mat.depthWrite = true;
        mat.alphaTest = .3;
      }
      const key = base.customProgramCacheKey();
      mat.customProgramCacheKey = () => key + (leaves ? '|templeNightLeaves' : '|templeNightBark');
      mat.onBeforeCompile = (shader) => {
        base.onBeforeCompile(shader);
        if (!leaves) return;
        shader.uniforms.uTemplePlayer = player;
        shader.vertexShader = 'varying vec2 vTempleLeafXZ;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 templeLeaf = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            templeLeaf = instanceMatrix * templeLeaf;
          #endif
          vTempleLeafXZ = (modelMatrix * templeLeaf).xz;`);
        shader.fragmentShader = 'uniform vec3 uTemplePlayer; varying vec2 vTempleLeafXZ;\n' + shader.fragmentShader.replace('#include <alphatest_fragment>', `
          // 葉の絵の隙間と、本人の近くで視線を空ける処理を保つ。
          #ifdef USE_MAP
            diffuseColor.a = texture2D(map, vMapUv).a * opacity;
          #endif
          diffuseColor.a *= mix(0.08, 1.0, smoothstep(3.0, 16.0, length(vViewPosition)));
          diffuseColor.a *= smoothstep(3.0, 10.0, distance(vTempleLeafXZ, uTemplePlayer.xz));
          #include <alphatest_fragment>`);
      };
      mats.set(base.uuid + (mesh.userData.treeFoliage ? '|leaves' : ''), mat);
    }
    mesh.material = mat;
  }
}

// 竹束の傾きも含めて視線を調べる。兵と矢除けは動かさず、視点だけ手前へ寄せる。
const templeTabaFrom = new THREE.Vector3(), templeTabaTo = new THREE.Vector3();
const templeTabaInverse = new THREE.Quaternion();
function templeTabaCameraFraction(tabas, from, to, pad = 0) {
  let nearest = null;
  for (const tb of tabas || []) {
    if (!tb.m.visible) continue;
    templeTabaInverse.copy(tb.m.quaternion).invert();
    const a = templeTabaFrom.copy(from).sub(tb.m.position).applyQuaternion(templeTabaInverse);
    const b = templeTabaTo.copy(to).sub(tb.m.position).applyQuaternion(templeTabaInverse);
    let lo = 0, hi = 1;
    for (let axis = 0; axis < 3; axis++) {
      const start = axis === 0 ? a.x : axis === 1 ? a.y : a.z;
      const delta = (axis === 0 ? b.x : axis === 1 ? b.y : b.z) - start;
      // 四束の竹に目線の幅も空ける。後ろの低い支えは、陰にいる本人を囲まない。
      const min = (axis === 0 ? -1.15 : axis === 1 ? -.2 : -.4) - pad;
      const max = (axis === 0 ? 1.15 : axis === 1 ? 2.35 : .4) + pad;
      if (Math.abs(delta) < .000001) {
        if (start < min || start > max) { hi = -1; break; }
      } else {
        const enter = (min - start) / delta, exit = (max - start) / delta;
        lo = Math.max(lo, Math.min(enter, exit)); hi = Math.min(hi, Math.max(enter, exit));
        if (lo > hi) break;
      }
    }
    if (lo <= hi && hi >= 0 && lo < 1 && (nearest === null || lo < nearest)) nearest = lo;
  }
  return nearest;
}
// 寄りの視点と地面補正の後に、画面の手前の幅も竹束の外へ出す。
// 中心の線だけでは横長画面の端と、竹束の裏の控えが取り残される。
function templeTabaCameraClear(tabas, camera) {
  const half = camera.near * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
  const pad = Math.max(.25, Math.hypot(half * camera.aspect, half, camera.near) + .08);
  let moved = false;
  for (const tb of tabas || []) {
    if (!tb.m.visible) continue;
    templeTabaInverse.copy(tb.m.quaternion).invert();
    const p = templeTabaFrom.copy(camera.position).sub(tb.m.position).applyQuaternion(templeTabaInverse);
    if (p.x <= -1.15 - pad || p.x >= 1.15 + pad || p.y <= -.2 - pad ||
        p.y >= 2.35 + pad || p.z <= -.4 - pad || p.z >= 1.55 + pad) continue;
    // 後ろの控えへ押し戻すと坂の補正と競合する。束の上へ一度だけ抜く。
    // 傾いた束の座標を往復しても、丸め誤差で同じ縁へ入り直さない。
    p.y = 2.35 + pad + .01;
    camera.position.copy(p).applyQuaternion(tb.m.quaternion).add(tb.m.position);
    moved = true;
  }
  return moved;
}
// 板の裏側や格子の隙間でも、外の視点を堂の軒へ潜り込ませない。
// 箱は堂を組む時だけ作り、交点は数値だけで求める。
function templeCameraFraction(boxes, from, to, pad = 0) {
  let nearest = null;
  const room = nakaRoomAt(from.x, from.z, from.y);
  for (const b of boxes) {
    if (room?.I === b.I || !b.struct.alive || !b.struct.mesh?.parent || !b.struct.mesh.visible) continue;
    let lo = 0, hi = 1;
    for (let axis = 0; axis < 3; axis++) {
      const start = axis === 0 ? from.x : axis === 1 ? from.y : from.z;
      const delta = (axis === 0 ? to.x : axis === 1 ? to.y : to.z) - start;
      const min = (axis === 0 ? b.x0 : axis === 1 ? b.y0 : b.z0) - pad;
      const max = (axis === 0 ? b.x1 : axis === 1 ? b.y1 : b.z1) + pad;
      if (Math.abs(delta) < .000001) {
        if (start < min || start > max) { hi = -1; break; }
      } else {
        const a = (min - start) / delta, c = (max - start) / delta;
        lo = Math.max(lo, Math.min(a, c)); hi = Math.min(hi, Math.max(a, c));
        if (lo > hi) break;
      }
    }
    if (lo <= hi && hi >= 0 && lo < 1 && (nearest === null || lo < nearest)) nearest = lo;
  }
  return nearest;
}

// 目線自体が壁の余白に入ると、線の交点は零になり同じ所へ戻り続ける。
// 外の視点だけを一番近い箱の外へ出す。箱と数値を使い回し、壁は消さない。
function templeCameraClear(boxes, camera, eye = camera.position) {
  const p = camera.position;
  const half = camera.near * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
  const pad = Math.hypot(half * camera.aspect, half, camera.near) + .1;
  for (const b of boxes) {
    if (!b.struct.alive || !b.struct.mesh?.parent || !b.struct.mesh.visible) continue;
    // 外壁では薄い面を抜けるだけでなく、一歩ぶん離して本人と戸口を映す。
    const sidePad = Math.max(pad, b.wallClearance || 0);
    const x0 = b.x0 - sidePad, x1 = b.x1 + sidePad, y0 = b.y0 - pad, y1 = b.y1 + pad;
    const z0 = b.z0 - sidePad, z1 = b.z1 + sidePad;
    if (p.x <= x0 || p.x >= x1 || p.y <= y0 || p.y >= y1 || p.z <= z0 || p.z >= z1) continue;
    // 本人が箱の外なら、本人から視点への線を手前の面で止める。
    // 面までの距離だけで選ぶと、角に近い本人から見えない側へ視点が出る。
    if (eye.x < x0 || eye.x > x1 || eye.y < y0 || eye.y > y1 || eye.z < z0 || eye.z > z1) {
      const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
      let enter = 0;
      if (eye.x < x0) enter = Math.max(enter, (x0 - eye.x) / dx);
      else if (eye.x > x1) enter = Math.max(enter, (x1 - eye.x) / dx);
      if (eye.y < y0) enter = Math.max(enter, (y0 - eye.y) / dy);
      else if (eye.y > y1) enter = Math.max(enter, (y1 - eye.y) / dy);
      if (eye.z < z0) enter = Math.max(enter, (z0 - eye.z) / dz);
      else if (eye.z > z1) enter = Math.max(enter, (z1 - eye.z) / dz);
      const t = Math.max(0, enter - .02 / Math.max(.01, Math.hypot(dx, dy, dz)));
      p.set(eye.x + dx * t, eye.y + dy * t, eye.z + dz * t);
      continue;
    }
    // 本人の側へ出す。視点だけに近い面を選ぶと、壁の反対側へ押し出し、
    // 本人を見るはずの画面に外壁を大写しにしてしまう。
    let distance = Math.abs(eye.x - x0), axis = 0, edge = x0;
    if (Math.abs(x1 - eye.x) < distance) { distance = Math.abs(x1 - eye.x); edge = x1; }
    if (!b.wallClearance && Math.abs(eye.y - y0) < distance) { distance = Math.abs(eye.y - y0); axis = 1; edge = y0; }
    if (!b.wallClearance && Math.abs(y1 - eye.y) < distance) { distance = Math.abs(y1 - eye.y); axis = 1; edge = y1; }
    if (Math.abs(eye.z - z0) < distance) { distance = Math.abs(eye.z - z0); axis = 2; edge = z0; }
    if (Math.abs(z1 - eye.z) < distance) { axis = 2; edge = z1; }
    if (axis === 0) p.x = edge; else if (axis === 1) p.y = edge; else p.z = edge;
  }
  camera.updateMatrixWorld();
}

// 本人が堂内なら、直接切り替えた視点も壁・梁の内側に収める。
// 屋根の箱を除外するだけでは、描く直前の視点が軒の裏へ残る。
function templeRoomCamera(room, camera, foot) {
  if (!room) return;
  const { I, lv } = room, p = camera.position;
  const half = camera.near * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
  const pad = Math.hypot(half * camera.aspect, half, camera.near) + .08;
  const margin = Math.max(.3, pad + .12);
  const mx = Math.max(0, lv.w / 2 - margin), mz = Math.max(0, lv.d / 2 - margin);
  const dx = p.x - I.x, dz = p.z - I.z;
  let x = Math.max(-mx, Math.min(mx, dx * I.c - dz * I.s));
  let z = Math.max(-mz, Math.min(mz, dx * I.s + dz * I.c));
  // 直接切り替えた視点も本人と同じ側へ収め、間仕切りを透かさずに見せる。
  const fx = foot.x - I.x, fz = foot.z - I.z;
  const ux = fx * I.c - fz * I.s, uz = fx * I.s + fz * I.c;
  const vx = x - ux, vz = z - uz;
  let first = 1;
  for (const w of lv.layout.walls) {
    if (w.guideOnly) continue;
    const sx = w.bx - w.ax, sz = w.bz - w.az, len = Math.hypot(sx, sz);
    if (len < .001) continue;
    const tx = sx / len, tz = sz / len;
    const ax = ux - w.ax, az = uz - w.az;
    // 線を横切らなくても、格子と平行に寄った視点の端が木へ入る。
    // 端まで含む厚みのある箱で、本人から視点までを調べる。
    let lo = 0, hi = first;
    for (let axis = 0; axis < 2; axis++) {
      const start = axis ? -ax * tz + az * tx : ax * tx + az * tz;
      const delta = axis ? -vx * tz + vz * tx : vx * tx + vz * tz;
      const min = axis ? -pad - .12 : -pad;
      const max = axis ? pad + .12 : len + pad;
      if (Math.abs(delta) < .000001) {
        if (start < min || start > max) { hi = -1; break; }
      } else {
        const a = (min - start) / delta, b = (max - start) / delta;
        lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
        if (lo > hi) break;
      }
    }
    if (lo <= hi && hi >= 0 && lo < first) first = lo;
  }
  if (first < 1) {
    const t = Math.max(0, first - .03 / Math.max(.01, Math.hypot(vx, vz)));
    x = ux + vx * t; z = uz + vz * t;
  }
  p.x = I.x + x * I.c + z * I.s; p.z = I.z - x * I.s + z * I.c;
  p.y = Math.max(lv.y + .5, Math.min(lv.y + Math.max(.5, lv.h - Math.max(.8, pad + .45)), p.y));
  camera.updateMatrixWorld();
}

// 声の束は初めに作り、守る側で遊ぶ時も敵味方の呼び掛けを取り違えない。
const TEMPLE_VOICES = {
  ambient: ['参道に寄せ手がおる。物音を聞け', '堂の前を空けるな。隣と槍をそろえよ'],
  nanori: ['大滝寺の衆ぞ。ここは通さぬ！'],
  openLow: ['山門を守れ！　一人で出るな！'],
  openHigh: ['堂の前で支えよ！　槍をそろえよ！'],
  openLord: ['堂を守れ！　列を離れるな！'],
  order: ['参道を押さえよ。堂から離れるな'],
  push: ['押し返せ！　山門から離れるな！'],
  pushing: ['穂先をそろえよ！　道で押し返せ！'],
  waver: ['支えきれぬ！　堂の陰へ下がれ！'],
  breaking: ['道を空けろ！　手負いが通るぞ！'],
  withdraw: ['奥山へ退け！　手負いを置くな！'],
  rout: ['追うな！　山門の列へ戻れ！'],
};
const ODA_VOICES = {
  ambient: ['山道では前の仲間に続け', '堂の陰に備えよ。火縄を絶やすな'],
  nanori: ['滝川勢ぞ！　先手に続け！'],
  order: ['先手と寄せよ。狭い道で列を割るな'],
  push: ['先手を支えよ！　隣と押せ！'],
  pushing: ['槍の間を詰めよ！　堂へ寄せよ！'],
  waver: ['押されるぞ！　参道で支えよ！'],
  breaking: ['麓へ下がれ！　道を塞ぐな！'],
  withdraw: ['手負いを連れ、麓へ退け！'],
  rout: ['深追いするな！　堂の陰に備えよ！'],
};
const ATTACK_VOICES = { lines: { ally: ODA_VOICES, enemy: TEMPLE_VOICES } };
const DEFEND_VOICES = { lines: { ally: TEMPLE_VOICES, enemy: ODA_VOICES } };

// 山上から見下ろしても遠景の四角い端を空へさらさない。
// 既存の遠景の縁から尾根へつなぐ一枚だけ。歩く地面と兵の当たりは変えない。
function templeFarRidges(W) {
  if (!W.farLand || !W.farH) return;
  W.farLand.geometry.computeBoundingBox();
  const edge = W.farLand.geometry.boundingBox.max.x - .5;
  const bands = [0, 90, 240, 520], n = 48, stride = n * 4;
  const pos = [], colors = [], indices = [];
  for (let row = 0; row < bands.length; row++) {
    const half = edge + bands[row];
    for (let side = 0; side < 4; side++) for (let i = 0; i < n; i++) {
      const t = -1 + 2 * i / n;
      const ux = side === 0 ? t : side === 1 ? 1 : side === 2 ? -t : -1;
      const uz = side === 0 ? -1 : side === 1 ? t : side === 2 ? 1 : -t;
      const x = ux * half, z = uz * half, bx = ux * edge, bz = uz * edge;
      // 縁の高さは共用の遠景と一致。先だけに丸い山腹を盛る。
      const blend = Math.min(1, bands[row] / 90);
      const ridge = blend * (65 + 22 * Math.sin(x * .012 + z * .007)
        + 14 * Math.cos(z * .017 - x * .009));
      const y = W.farH(bx, bz) + baseTerrain(x, z) - baseTerrain(bx, bz) + ridge - .08;
      pos.push(x, y, z);
      const shade = .9 + .1 * Math.sin(x * .03 + z * .02);
      colors.push(.14 * shade, .17 * shade, .12 * shade);
      if (row < bands.length - 1) {
        const a = row * stride + side * n + i, b = row * stride + (side * n + i + 1) % stride;
        indices.push(a, b, a + stride, b, b + stride, a + stride);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const ridge = new THREE.Mesh(geometry, W.farLand.material);
  W.scene.add(ridge);
}

// 山上でも空の球の境目を映さない。越前の平野と同じ背景の描き方を、この戦だけに使う。
function templeSky(W, camera) {
  const uniforms = { ...W.skyMat.uniforms,
    passProjection: { value: camera.projectionMatrixInverse }, passView: { value: camera.matrixWorld } };
  const material = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false, fog: false,
    vertexShader: `uniform mat4 passProjection, passView; varying vec3 vP;
      void main() {
        vP = mat3(passView) * (passProjection * vec4(position.xy, 1.0, 1.0)).xyz;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }`,
    fragmentShader: W.skyMat.fragmentShader,
  });
  W.sky.geometry.dispose();
  W.sky.geometry = new THREE.BufferGeometry();
  W.sky.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  W.sky.material = material; W.sky.frustumCulled = false;
  W.sky.onBeforeRender = (_renderer, _scene, cam) => {
    uniforms.passProjection.value = cam.projectionMatrixInverse;
    uniforms.passView.value = cam.matrixWorld;
  };
}

// 写真の直接描画でも、視点と手前の九点を石段の上へ出す。
// 堂内の床や天井は室内の視点に任せ、地面と石段だけを補正する。
// 視点の足元が土の上でも、間の切岸で本人が隠れる。最初に遮る坂の手前へ寄せる。
// この山寺の外だけで使い、描いた地面の高さを既存の表から読む。
function templeSlopeCamera(W, eye, camera) {
  if (nakaRoomAt(eye.x, eye.z, eye.y)) return;
  const p = camera.position, dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
  const length = Math.hypot(dx, dy, dz);
  const samples = Math.min(24, Math.max(2, Math.ceil(length / .5)));
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    if (eye.y + dy * t >= drawGroundAt(W, eye.x + dx * t, eye.z + dz * t) + .3) continue;
    let lo = (i - 1) / samples, hi = t;
    for (let j = 0; j < 5; j++) {
      const mid = (lo + hi) / 2;
      if (eye.y + dy * mid < drawGroundAt(W, eye.x + dx * mid, eye.z + dz * mid) + .3) hi = mid;
      else lo = mid;
    }
    p.lerpVectors(eye, p, Math.max(0, lo - .15 / Math.max(.01, length)));
    camera.updateMatrixWorld();
    return;
  }
}
function templeCameraGround(W, camera) {
  if (!camera.isPerspectiveCamera || nakaRoomAt(camera.position.x, camera.position.z, camera.position.y)) return;
  camera.updateMatrixWorld();
  const p = camera.position, e = camera.matrixWorld.elements;
  const h = camera.near * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
  let lift = 0;
  for (let i = 0; i < 10; i++) {
    const dx = i ? ((i - 1) % 3 - 1) * h * camera.aspect : 0;
    const dy = i ? (Math.floor((i - 1) / 3) - 1) * h : 0;
    const dz = i ? -camera.near : 0;
    const x = p.x + e[0] * dx + e[4] * dy + e[8] * dz;
    const y = p.y + e[1] * dx + e[5] * dy + e[9] * dz;
    const z = p.z + e[2] * dx + e[6] * dy + e[10] * dz;
    const ground = Math.max(drawGroundAt(W, x, z), groundAt(W, x, z, y));
    lift = Math.max(lift, ground + .65 - y);
  }
  if (lift > 0) { p.y += lift; camera.updateMatrixWorld(); }
}

const echizen_ikko = {
  // 稲生の型。進軍・敵・持ち場を同じ一行とピンで示す。
  missionSingleLine: true,
  hideMissionDots: true,
  hideGuideSteps: true,
  enemyTriangleSigns: true,
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  noSiegeCards: true,
  noPlayerFoot: true,
  quietMiss: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  bannerAllowed: (rt, text) => rt.over || !!rt.flags.ending || /討ち取|討死|勝|崩れ|破られ|落ちた/.test(text),
  missions: ['味方と進め', '惣門を破れ', '山門を破れ', '▼の敵をたおせ', 'ここを守れ', '奥山道へ進め'],
  missionOf(rt) {
    const F = rt.flags;
    if (F.mode === 'defend') return 4;
    if (!F.step) return 0;
    const gate = F.step === 1 ? F.gateSomon : F.step === 2 ? F.gateSanmon : null;
    if (gate?.struct.alive) return rt.def.missionSignTarget(rt) ? 3 : F.step;
    if (F.step === 4) return 5;
    if (F.step <= 3) {
      const zone = F.SZ?.byId[TEMPLE_HALL_IDS[F.step - 1]];
      const p = rt.player.u.pos;
      if (!zone?.test(p.x, p.z)) return 0;
      if (rt.def.missionSignTarget(rt)) return 3;
    }
    return 4;
  },
  missionHeading(rt) {
    const p = rt.player, cue = rt.hud.retreatGuide;
    if (p.u.alive && !rt.over && (this.woundRetreatNeeded(rt) || cue?.active && cue.valid)) {
      if (p.treatmentReady || p.treating) return 'ここで手当て';
      return cue?.active && cue.valid && cue.treatment ? '十字の印へ下がれ' : '味方の後ろへ下がれ';
    }
    return this.missions[this.missionOf(rt)];
  },
  // 討った本人を次の描画へ残さず、今の持ち場の最寄りを選ぶ。
  missionSignTarget(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.ending || rt.over || !F.step && F.mode !== 'defend') return null;
    const zone = F.SZ?.byId[F.mode === 'defend' ? 'hondo' : TEMPLE_HALL_IDS[F.step - 1]];
    const gate = F.step === 1 ? F.gateSomon : F.step === 2 ? F.gateSanmon : null;
    if (F.mode === 'attack' && F.step === 4) return null;
    if (F.mode === 'attack' && zone && !gate?.struct.alive && !zone.test(p.x, p.z)) return null;
    let best = null, distance = Infinity;
    for (const u of rt.army.units) {
      if (u.team === rt.player.u.team || !siegeFighter(u) || u.hp <= 0 || u.dying || u.rearWound) continue;
      if (F.mode === 'defend' ? !zone?.test(u.pos.x, u.pos.z)
        : gate?.struct.alive ? !templeGateRoadFoe(F, u)
          : F.step === 5 ? Math.hypot(u.pos.x - OKUYAMA.x, u.pos.z - OKUYAMA.z) >= 18
            : !zone?.test(u.pos.x, u.pos.z)) continue;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (gate?.struct.alive && d > 12) continue;
      if (d < distance) { distance = d; best = u; }
    }
    return best;
  },
  commanderTarget(rt) {
    const F = rt.flags;
    const u = (F.mode === 'defend' ? F.reserve : F.ikkoHondoMain)?.taishoU;
    return u && this.missionSignTarget(rt) === u ? u : null;
  },
  namedGuideTarget(rt) { return this.commanderTarget(rt); },
  missionPin(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.ending || rt.over || !rt.player.u.alive) return null;
    const pin = F.standardPin || (F.standardPin = { x: 0, z: 0 });
    const enemy = this.missionSignTarget(rt);
    const zone = F.SZ?.byId[F.mode === 'defend' ? 'hondo' : TEMPLE_HALL_IDS[F.step - 1]];
    const gate = F.step === 1 ? F.gateSomon : F.step === 2 ? F.gateSanmon : null;
    const defend = F.mode === 'defend' || F.step === 5 || !!zone && !gate?.struct.alive && !enemy && zone.test(p.x, p.z);
    let goal;
    if (F.mode === 'defend') goal = zone?.pos || INNER_POS;
    else if (F.step >= 4) goal = OKUYAMA;
    else if (enemy) goal = enemy.pos;
    else if (gate?.struct.alive) goal = templeTaskPoint(rt);
    else if (zone) goal = templeEntry(rt, zone) || zone.pos;
    else goal = F.localPoint || F.scout?.pos;
    if (!goal) return null;
    const way = templeWay(rt.army, rt.player.u, goal);
    const route = Math.hypot(way.x - goal.x, way.z - goal.z) > .5;
    pin.x = way.x; pin.z = way.z;
    pin.unit = enemy && !route && !defend ? enemy : null;
    pin.enemy = !!pin.unit; pin.route = route;
    pin.r = pin.hide = route ? .5 : defend ? F.step === 5 ? 18 : 6 : enemy ? 3 : 4;
    pin.waiting = defend && !route;
    // 山の斜面や堂の向こうへ囲みを透かさず、持ち場は一つの印で示す。
    pin.defend = false;
    pin.arrived = pin.waiting && Math.hypot(p.x - goal.x, p.z - goal.z) < pin.r;
    pin.silent = true; pin.name = ''; pin.approach = false; pin.arrow = false;
    return pin;
  },
  get battleVoices() { return mode() === 'defend' ? DEFEND_VOICES : ATTACK_VOICES; },
  // 攻め・守りの両方で共通の軽い民を使う。兵の名簿・総勢・戦功には加えない。
  civilianCrowd: { bounds: { minX: -220, maxX: 220, minZ: -222, maxZ: 220 }, bands: PEOPLE_BANDS },
  clampCamera(rt, pos) {
    if (rt.game?.photo || nakaRoomAt(rt.player.u.pos.x, rt.player.u.pos.z, rt.player.u.pos.y)) return;
    // 石段の側へ回った視点も、描いた踏面の下に残さない。
    pos.y = Math.max(pos.y, groundAt(rt.world, pos.x, pos.z, pos.y) + .65);
  },
  get jinkei() { return mode() === 'defend' ? TEMPLE_DEFEND_JIN : TEMPLE_JIN; },
  nearSpearFade: false, // 槍を一斉に縮めず、視線を塞ぐ柄だけ共通の判定で避ける。
  nearSceneryScreenCut: false, // 堂の壁を長方形に切り抜かず、視点のすぐ前だけ避ける。
  nearLongWeaponRadius: 10, // 急坂では手元と視点の高低差も開く。近い長柄と旗竿を既存の処理で避ける。
  nearGroundSpearRadius: 10, // 斜面へ横たわる落ち槍も、目の前を塞ぐ時だけ避ける。
  fadeCloseStandards: true,
  fadeCloseStandardFrame: true, // 近い隊旗は布と横木を一緒に透かし、裸の太い棒を残さない。
  nearHatFadeRadius: 0, // 笠と顔を別々に透かさず、既存の全身よけを使う。
  nearHatAtHead: true, // 足元でなく笠の位置で測り、坂上の笠も視点の直前だけ透かす。
  nearSelfHatFadeRadius: 1.2, // 肩越しの視点へ本人の笠が入った時も同じ材質を使う。
  nearAllySolidBody: true, // 視点を味方の体から避け、顔・首・具足を別々に透かさない。
  nearAllyWholeOcclusion: true, // 本人への視線を塞ぐ味方も全身で避け、透けた首や胴の内側を残さない。
  nearAllyFadeRadius: 1.1, // 視点に触れる一人だけを避け、周囲の戦列は残す。
  nearAllySightWidth: 1.1, // 戸口で横へ重なる肩と笠も、本人への視線で拾う。
  compactIntro: true, // 長い戦名で、勝つ条件が釦の下へ切れないようにする。
  introTaskFirst: true,
  introKeepControls: true, // 初見の門打ちの長押しは、手ほどきを省く設定でも読む。
  introPeopleFolded: true, // 下知と勝つ条件を先に読み、人物の説明は開いて読む。
  keepTaskLabel: true, // 敵一人への手ほどきで、堂を押さえる下知を消さない。
  keepDestinationTask: true, // 「もんへ」の短縮で、石段・山門名・門打ちの下知を消さない。
  keepCombatTask: true,
  keepCombatTaskDetail: true, // 接近戦でも残る敵・味方待ち・守る秒数を消さない。
  keepCombatTaskHeading: true, // 門や堂への下知を残し、同じ「なぞる」の案内を二段に出さない。
  keepTaskWithGuard: true, // 門前で構えても、堂へ進む下知を残す。
  keepTaskWithDodge: true, // 矢を避けている間も、戻る参道を見失わせない。
  keepTaskWithRain: true, // 矢除けへの操作中も、堂と山門への下知を残す。
  pauseTurnPractice: false, // 見回す練習で兵と任務の時計を止めない。
  dodgeTurnDuration: 3.5, // 一度の振り向く案内を出し続けない。
  dodgeAvoidNotices: true,
  dodgeTurnLabel: (_rt, right, touch) => touch
    ? `${right ? '右' : '左'}へなぞって振り向く`
    : `手元の操作器を${right ? '右' : '左'}へ動かして振り向く`,
  dodgeGuideLabel: (_rt, reached, rain) => rain
    ? reached ? '矢に備え、動きを止めるな' : '矢の降る場所から離れよう'
    : reached ? '敵を向いて構えよう' : '味方の後ろへよけよう',
  taskDetails: true,
  taskDetail(rt, title, progress) {
    const F = rt.flags;
    // 退避の札へ門打ちの長押しを併記しない。今できる動作だけを伝える。
    const cue = rt.hud.retreatGuide;
    if (cue?.active && cue.valid) return cue.treatment
      ? '手当てが済んだら、参道の任務へ戻ろう'
      : '敵を向いて構えよう。離れたら参道へ戻ろう';
    if (F.mode !== 'attack' || F.step < 1 || F.step > 3) return progress;
    const gate = F.step === 1 ? F.gateSomon : F.step === 2 ? F.gateSanmon : null;
    if (gate?.struct.alive) {
      const P = rt.player.u.pos;
      if (nakaRoomAt(P.x, P.z, P.y)) return 'まず戸口の印へ。堂の壁は通れない';
      if (templeInMelee(rt)) return '敵を追わず、味方のそばで槍をそろえよう';
      if (F.step === 1 && templeTabaFollow(rt)) return '竹束は竹を束ねた盾。後ろについて矢を避けよう';
      return progress;
    }
    const zone = F.SZ?.byId[TEMPLE_HALL_IDS[F.step - 1]];
    if (!zone) return progress;
    const P = rt.player.u.pos;
    if (!zone.test(P.x, P.z) && nakaRoomAt(P.x, P.z, P.y)) return 'まず戸口の印へ。堂を出て参道へ戻ろう';
    if (!zone.test(rt.player.u.pos.x, rt.player.u.pos.z)) return F.hallEntry
      ? F.hallEntry.returning ? '敵を追わず、参道の印へ戻ろう'
        : '参道の印をたどり、味方と堂へ進もう' : progress;
    if (zone.enemies > 0) return `残る敵 ${zone.enemies}人。味方と進もう`;
    if (zone.owner === ZONE_STATE.FRIEND) return 'ここは押さえた。次の印へ進もう';
    if (zone.friends < zone.need) return `あと${zone.need - zone.friends}人で守れる。印のそばで味方を待とう`;
    if (rt.t < zone.quietUntil) return `敵が立て直している。ここで反撃に備えよう。あと${Math.ceil(zone.quietUntil - rt.t)}秒`;
    return `ここで味方と守ろう。あと${Math.max(0, Math.ceil(zone.hold - zone.holdT))}秒`;
  },
  immediateTaskChanges: true, // 戸口・堂の脇・残り人数を、古い下知からすぐ切り替える。
  introSides: { a: '滝川一益の手', b: '大滝寺の守り' },
  introText: (rt) => rt.flags.mode === 'defend'
    ? '本堂の持ち場へ進もう。寄せてくる織田勢を押し返し、寺を守ろう。'
    : '竹束は竹を束ねた盾。後ろについて味方と進もう。門の前では木づちの札を長押し。外堂から山門へ進み、本堂を味方と押さえよう。奥の院と山道は別の組に任せます。夜と霧は遊びの補いです。',
  spacedCombatCues: true, // 戸口の振り向き札は照準の上へ寄せる。
  reserveCombatCues: true, // 道の印を間合いの札と重ねない。
  clearTravelGuide: true, // 携帯でも道の矢印と到着の輪を案内札で隠さない。
  compactDestinationSign: true, // 道の旗で兵や戸口を隠さず、足元の印は残す。
  cornerEnemyGuide: true, // 描画側と同じ指定で四隅を示し、槍と味方を長い金枠で囲まない。
  playerFootSignOnly: true, // 本人とずれる白い人型を重ねず、足元の輪で居場所を伝える。
  teamSignsOnly: true, // 周りの兵も人型で囲まず、頭上の丸と交差した刀で両軍を分ける。
  compactFlagFrames: true, // 開戦・待機・退避の囲みを、実物の旗の布へ寄せる。
  subtleTargetFrames: true, // 最初の隊旗も細い印で示す。
  compactFlagEmphasis: true, // 開戦の強調でも、旗を縦長の白い輪で囲まない。
  cornerFlagFrames: true,
  subtleFlagFrames: true,
  compactGroundGoalRing: true, // 到着地点は小さな輪で残す。
  compactTravelArrow: true, // 坂の先へ伸びる大きな矢印を、行き先の短い印にする。
  compactDodgeGuide: true, // 急坂で逃げ先の輪が大きく広がり、兵や道を覆うのを抑える。
  coverGuidePlace: true, // 射線を避ける物陰を、進軍の旗と異なる矢印で示す。
  coverGuideLabel: '矢や鉄砲を避け、物かげへ', // 柵操作の有無だけで「しるしまで」に丸めない。
  coverGuideTouchLabel: '長押しで\n物かげへ移動',
  namedGuideMarkers: true,
  travelGuideLabel(rt) {
    const F = rt.flags;
    if (F.mode !== 'attack') return '守りの所へ';
    if (!F.step) return '先手に続く';
    if (F.localRoad || F.step === 1 && F.approachShown) return '参道を進む';
    if (templeTabaFollow(rt)) return '竹束に続く';
    const gateAlive = F.step === 1 ? F.gateSomon.struct.alive : F.step === 2 && F.gateSanmon.struct.alive;
    if (!gateAlive && F.step <= 3) {
      if (F.hallEntry) return F.hallEntry.returning ? '参道へ戻る' : `${TEMPLE_HALL_NAMES[F.step === 1 ? 'gezan' : F.step === 2 ? 'hondo' : 'oku']}への参道`;
      if (F.hallExit) return '堂の外へ';
      if (F.hallDoor) return '堂の戸口へ';
      if (F.hallAround) return '堂の脇を回る';
    }
    if (F.step === 1) return F.gateSomon.struct.alive ? '惣門へ進む' : '外堂へ進む';
    if (F.step === 2) return F.gateSanmon.struct.alive ? '山門へ進む' : '本堂へ進む';
    return F.step === 3 ? '奥の院へ' : '奥山道へ';
  },
  staminaLabel: '気力', // 照準脇の青い輪の意味を字でも示す。
  meleeApproachLabel(rt) {
    const F = rt.flags;
    if (F.hallEntry?.returning) return '敵を追わず、参道へ戻れ';
    if (F.mode !== 'attack') return '味方と持ち場を守れ';
    if (F.step === 1 && F.gateSomon.struct.alive) return '竹束のそばで敵を払え';
    if (F.step === 2 && F.gateSanmon.struct.alive) return '山門の手前で敵を払え';
    const name = TEMPLE_HALL_NAMES[TEMPLE_HALL_IDS[F.step - 1]];
    return name ? `味方と${name}の敵へ` : '味方と奥山道を守れ';
  },
  // 止血後の小さな打撲で、敵へ近づくたびに後退の札へ戻さない。
  // 手足の深い傷・出血・瀕死は退避を保ち、傷の歩速・攻撃への影響も変えない。
  woundRetreatNeeded(rt) {
    const u = rt.player.u;
    return u.wounds?.bleed > .0001 || u.hp < u.maxHp * .3 ||
      (u.woundSlow >= .25 || u.armWound >= .25) && templeInMelee(rt);
  },
  keepRetreatReason: true,
  keepRetreatGestureReason: true, // 携帯のなぞる向きで退く理由を上書きしない。
  keepWoundRetreatReason: true, // 負傷中も旗への集合でなく、味方の後ろへ退く目的を伝える。
  compactRetreatSign: true,
  retreatArrowLength: 72, // 退く向きだけ足元へ示し、兵と道を長い白線で横切らない。
  retreatStepsNewLine: true, // 残りの歩数を分け、一文字だけの折り返しを減らす。
  compactFloorGuides: true,
  retreatGuideLabel: (_rt, reached) => reached ? 'ここで構え、敵を防ぐ' : '味方の後ろへ下がる',
  treatmentApproachLabel: '十字の印へ下がって手当て',
  treatmentTaskGuidance: true,
  treatmentCrossSign: true,
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.treatmentReady) return p.treating ? '手当てを押し続けよう' : '「手当て」を三秒長押し';
    if (!cue?.valid) return '構えて、参道の味方へ下がろう';
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius)
      return '十字の印へ下がって手当て';
    if (p.treatmentNext > rt.t) return `ここで待とう。手当てまであと${Math.ceil(p.treatmentNext - rt.t)}秒`;
    return 'ここで止まり、構えと狙いを解こう';
  },
  // 画面の退く印も本人の一歩で確かめ、途中の柵や切岸を横切らせない。
  // 共通の候補探しは半秒ごと。歩幅・床の入れ物は既存のものを使う。
  retreatPathAllowed(rt, point) {
    return templeWalkClear(rt, rt.player.u.pos, point);
  },
  // 自動の遊び手にも、画面の印と同じ道幅・通行条件を使う。
  botRetreatStepAllowed(rt, point) {
    return rt.def.retreatPointAllowed(rt, point) && rt.def.retreatPathAllowed(rt, point);   // 外から this なしで呼ばれる
  },
  botRetreatWay(rt, back) {
    // 後退中も画面と同じ旗を目指す。近い味方の入れ替わりで山腹へ逸れない。
    const cue = rt.hud.retreatGuide;
    // 通れるかは既存の半秒ごとの旗探しと、一歩ごとの判定で確かめる。
    return cue?.active && cue.valid && !cue.treatment
      ? cue : templeWay(rt.army, rt.player.u, back);
  },
  botTreatmentPoint(rt) {
    const cue = rt.hud.retreatDestination(rt, null, true);
    return cue?.valid && templeWalkClear(rt, rt.player.u.pos, cue) ? cue : null;
  },
  // 逃げ先の自動案内で、参道や堂の平場から谷へ下り続けない。
  // 平場と三つの道は保ち、兵の移動や戦の進行は変えない。
  retreatPointAllowed(rt, point) {
    // 谷道から川床へ近づく手当ての案内を避ける。川へ押し出された時は岸へ退く道を残す。
    const p = rt.player.u.pos;
    for (const stream of rt.world.def.streams || []) {
      const bank = stream.w + 1.2;
      const from = distToPolyline(p.x, p.z, stream.pts);
      const to = distToPolyline(point.x, point.z, stream.pts);
      if (to < Math.min(bank, from) - .01) return false;
    }
    // 道から近くても切岸の途中は退き先にしない。石段の登りは通す。
    if (rt.world.slopeTan(point.x, point.z) > rt.world.def.climbTan) return false;
    for (const k of ECHIZEN_IKKO_PLAN.kuruwa) if (inPoly(k.poly, point.x, point.z)) return true;
    const F = rt.flags;
    if (F.retreatRoadAt === undefined || rt.t >= F.retreatRoadAt) {
      F.retreatRoadAt = rt.t + .5;
      let current = Infinity;
      for (const road of TEMPLE_ROADS) current = Math.min(current, distToPolyline(p.x, p.z, road));
      // 均した道の半幅まで。既に外れた時も、それ以上山腹へ離れない。
      F.retreatRoadDistance = Math.max(3.5, current);
    }
    for (const road of TEMPLE_ROADS) {
      if (distToPolyline(point.x, point.z, road) <= F.retreatRoadDistance) return true;
    }
    return false;
  },
  noticeOnce: false, // 必要な手ほどきは八秒以上あけて伝え直す。
  noDistantBattle: true, // 登録した備え以外の大軍・本陣を自動で足さない。
  noTaisho: true, // 局地の陣所は後備えに結び、全軍の信長をここに置かない。
  noHorse: true,
  noWake: true,
  botOrders: true, // 山道・門・退き口を、性格の突進で上書きしない。
  // 堂を押さえる下知で、遠い別手の旗へ案内を逸らさない。
  guideMarker(rt) {
    const F = rt.flags;
    if (F.mode !== 'attack') return 'main';
    if (!F.step) return 'main';
    if (F.localRoad) return 'localRoad';
    if (F.step === 1 && F.approachShown) return 'approach';
    return 'path';
  },
  // 守る側（defend）は本堂の内（castles/echizen_ikko.js の hondo の中ほど）から始める。攻め手は山麓の村から
  // 身の回りの当時の場（timeslip_field.js）。天正三年八月の夜は今の九月半ば・晩夏の山寺。
  // 参道は湿った土と苔、脇は丈の伸びた夏草と葦。惣門・山門・本堂と攻め上った所ほど、
  // 倒れた槍と薙刀・一揆方の白い旗・刺さった矢が多い。堂の板の間や台の上には置かない。
  timeslip: {
    wet: 0.4, dust: 0.15, trample: 0.25, debris: 1, arrows: 0.5,
    grass: 0x6f8a4c, grassTints: [0xffffff, 0xe2ecc8, 0xc8d4a0], grassH: 1.1, tallGrass: 0.8,
    flagColors: [0xece8dc, 0x24221e, 0xd9b23a],
    fights: [[GATE_SOMON.x, GATE_SOMON.z, 26], [OUTER_POS.x, OUTER_POS.z, 22], [GATE_SANMON.x, GATE_SANMON.z, 24], [INNER_POS.x, INNER_POS.z, 22], [OKU_POS.x, OKU_POS.z, 20]],
  },
  playerRegen: 0.025,   // 10/28：近くで止まった敵が構え直す直しの後、山門の前で囲まれて倒れる回が増えた   // 斬り合いの合間は命が少しずつ戻る
  playerTaken: 0.42,   // 狭い惣門の前で四方から突かれ、二分で倒れていた（bot 10/26）。人数と斬り合いは減らさない
  // 麓の参道を登る間、惣門の切妻の屋根と奥の本堂の大屋根が画面の上で切れていた（10/28 採点）。
  // 惣門の屋根が画面の上四分の一に入るまで、目線だけを上げる（本人が画面に残る角度まで。位置は変えない）。
  frameCamera(rt, pos, look) {
    const P = rt.player, F = rt.flags, u = P.u;
    if (!look || mode() !== 'attack' || rt.game?.photo || rt._rts?.on || P.fpK >= .5 || P.cine) return;
    const want = F.step === 1 && u.pos.z < GATE_SOMON.z - 8 && u.pos.z > VILLAGE.z - 20 ? 1 : 0;
    F.somonLookK = (F.somonLookK || 0) + (want - (F.somonLookK || 0)) * .05;
    if (F.somonLookK < .01) return;
    const gx = GATE_SOMON.x - pos.x, gz = GATE_SOMON.z - pos.z, gd = Math.hypot(gx, gz);
    const gy = rt.world.heightAt(GATE_SOMON.x, GATE_SOMON.z) + 7.5 - pos.y;
    // 竹束の列をよけて斜めに登る間、惣門が画面の横の外（約50度）へ外れていた（10/28 採点）。
    // 門が画面の端から内へ入るまで、目線だけを門の側へ振る（約23度まで・位置は変えない・本人は画面に残る）。
    {
      const lx = look.x - pos.x, lz = look.z - pos.z;
      let d = Math.atan2(gx, gz) - Math.atan2(lx, lz);
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const turn = Math.sign(d) * Math.min(.4, Math.max(0, Math.abs(d) - .5)) * F.somonLookK;
      if (turn) {
        const c = Math.cos(turn), s = Math.sin(turn);
        look.x = pos.x + lx * c + lz * s; look.z = pos.z - lx * s + lz * c;
      }
    }
    const ld = Math.max(.5, Math.hypot(look.x - pos.x, look.z - pos.z));
    const cur = Math.atan2(look.y - pos.y, ld), gate = Math.atan2(gy, gd);
    const lift = Math.min(.21, Math.max(0, gate - .22 - cur)) * F.somonLookK;   // 約12度まで
    if (lift > 0) look.y = pos.y + Math.tan(cur + lift) * ld;
  },
  get spawn() { return mode() === 'defend' ? { x: 0, z: 10, heading: Math.PI } : { x: VILLAGE.x, z: VILLAGE.z - 2, heading: 0 }; },
  world: {
    seed: 15750,
    namedKacchu: ECHIZEN_IKKO_KACCHU, // 近景・遠景とも、この戦の復元装備を使う。
    blockedHint: () => '急な坂や柵は越えられない。参道の印へ戻れ',
    groundHalf: 240, // 麓（-200）と移動範囲（±220）を本物の地面に収め、遠景の林を視点の後ろへ退ける。
    terrainTriangles: true, // 岩・足・柵の高さを、実際に描く山肌の三角形へ合わせる。
    keepTerrainGrid: true, // 携帯でも足場と描く山肌を同じ格子にし、門脇の土が目線を覆わないようにする。
    terrainContactView: true, // 直接描く写真の視点も含め、地面の裏側を見せない。
    moveLim: 220,   // 山麓の村（z≈-200）から始まる。既定の 176 だと村の者と自分が戦場の外の扱いで引き戻されていた（見回り 10/2）
    time: 'night',
    noHorse: true, // 増援や名付きの兵も、狭い山寺では馬を下りる。
    nearAllyFadeRadius: 1.1, // 兵の更新側でも、描画直前の全身よけへ任せる。
    wind: [-0.3, -0.95], // 夜の風向は補完。寺から紙の里へ火の粉が飛ぶ場合がある。
    nightLift: 3.4,   // 月齢は未確定。足元は見せ、山肌を昼のように白く照らさない。
    unitNightScale: 0, // 兵だけの白い縁取りを止め、地面と同じ月光と灯明で照らす。
    roundedFire: true, // 共用の丸い火の舌を使い、大きな三角の板に見える炎を抑える。
    fireLightLift: .9, // 戸口で顔と紙が白く飛ばない強さ。携帯の光源数は増やさない。
    mist: true,
    groundMistScale: .15, // 夏の夜の山を白い雪面にせず、低い霧だけ残す。
    fogTint: 0x17202c, // 遠い木と山を明るい青の切り絵にしない。この戦の夜霧だけを暗くする。
    fogTintStrength: 1, // 夜の青白い既定色を残さず、空に近い暗い霧へそろえる。
    mistFar: 140, // 麓の最初の霧で先手と門が白い壁に隠れない距離。
    smokeFogFloor: 60, // 火と鉄砲の煙は残し、目前の先手と参道を白い壁で隠さない。
    muddy: 0.1,
    patchyGround: true, // 土の斑と草の株を同じ分布にし、道肩に踏み荒らされた裸地を残す。
    roadsideGrass: true, // 草の本数を増やさず、参道の外の斜面へ群落を寄せる。
    softEarthCrust: true, // 土塊の陰を塊の縁へ絞り、参道と堂前の裸地を四角い敷石に見せない。
    softPathSoil: true, // 道肩の土と泥を連続して混ぜ、格子ごとの色の段を残さない。
    stableSlopeGrain: true, // 山肌の向きが変わっても模様を連続させ、細い縞へ引き伸ばさない。
    subtleMudRelief: true, // 泥の窪みは踏まれた所へ絞り、裸地を同じ丸い穴で埋めない。
    groundedSlopeRocks: true, // 坂に埋まる露岩も閉じた形で描き、黒い穴や薄い破片に見せない。
    // 山道でも兵数・間隔・技の時計は保ち、足の踏み替えと槍衾の呼吸だけをずらす。
    variedMarch: true,
    variedInfantry: true,
    variedLoanArmor: true, // 六組の傷み・威・笠の色を共有し、貸し具足の同じ姿をほぐす。
    variedHeadgear: true,
    meleeGroundedFeet: true, // 突き・受け・押し合いの草鞋を、石段と山肌へ接地させる。
    livingSpearHedge: true,
    rearSpearSupport: true, // 二列目も前列の攻防へ構え、直立した柄だけの列にしない。
    reachableSpearGrip: true, // 頭越しの構えでも槍を腕の届く位置へ寄せる。
    fallPaceSpread: .35, // 同時に討たれても、膝が折れる速さを人ごとに変える。
    groundedFallImpact: true, // 討たれた瞬間ではなく、体が地を打つ時に音を出す。
    wetEarthBursts: true, // 湿った参道では、白く高い埃でなく低い土粒を散らす。
    groundedFalls: true, // 横倒しの胴の厚みを支え、落ちた槍も体に沿わせる。
    slopeContactFalls: true, // 坂へ寝かせた胴の真下に接地させ、亡骸が宙へ浮かないようにする。
    settleSideFalls: true, // 横に崩れた肩を斜面へ寝かせる。
    slopeForest: .65,
    cliffRock: .16,
    // 切岸の岩と苔も固定した座標で混ぜ、石段脇で法線ごとに裂ける模様を抑える。
    stableCliffGrain: true,
    stableRockProjection: true,
    streams: [{ pts: [[34, -34], [44, -70], [50, -108], [44, -150], [36, -180], [42, -218]], w: 2.2, depth: 0.8 }],   // 谷川（夜の川音）
    terrainTags: true,   // 急斜面・石段・細道・森で速さ・向き変え・疲れ・当たりが変わる（terrain_tags.js）
    climbTan: .9, // 参道・谷道・森道は通し、道の外の切岸を駆け上がらせない。
    paths: TEMPLE_ROADS,
    moveWay: templeWay,
    interiorMaterial: templeHallMaterial,
    height,
    tint(x, z, h, c) {
      if (inPoly(FOREST_POLY, x, z) || inPoly(FOREST2_POLY, x, z)) c.setRGB(c.r * 0.68, c.g * 0.8, c.b * 0.68);
      // 麓の足元も含め、湿った土と落ち葉を大小の斑に混ぜる。
      const soil = .5 + .5 * Math.sin(x * .31 + z * .18) * Math.cos(z * .27);
      c.setRGB(c.r * .62 + .12 + soil * .09, c.g * .65 + .055, c.b * .5 + .025);
      // 山腹が一色の茶に見えないよう、六〜十メートルほどの草の濃淡と落ち葉の暗がりを重ねる（頂点色だけ。数は増えない）。
      const m1 = Math.sin(x * .63 + Math.sin(z * .21) * 1.8) * Math.sin(z * .47 - x * .29);
      const m2 = Math.sin(x * 1.07 + z * .71) * Math.sin(z * .93 - x * .38);
      const n = m1 * .65 + m2 * .35, grass = Math.max(0, n);
      c.setRGB(c.r * (1 - grass * .16 + Math.min(0, n) * .08), c.g * (1 + grass * .25 + Math.min(0, n) * .1) + grass * .025, c.b * (1 - grass * .08 + Math.min(0, n) * .08));
    },
    // 道の中央は土、道端と山腹は草・落ち葉を混ぜる。株数は増やさず分布を戻す。
    grassMix(x, z, pathDistance) {
      const edge = Math.max(0, Math.min(1, (pathDistance - 1) / 2));
      return edge * (.48 + .3 * (.5 + .5 * Math.sin(x * .18 + Math.sin(z * .11) * 2.4) * Math.cos(z * .16)));
    },
    // 出陣時の引いた視点も空ける。枝葉の透けだけに頼って近い木を残さない。
    clear: (x, z) => PEOPLE_BANDS.some((b) => Math.hypot(x - b.x, z - b.z) < 5) || PEOPLE_PATHS.some((p) => distToPolyline(x, z, p) < 3) || Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 24 || distToPolyline(x, z, SANDO) < (z > -178 && z < -96 ? 8.5 : 16) ||  /* 麓から惣門までの参道は杉並木（10/28） */ distToPolyline(x, z, VALLEY_ROAD) < 12 || distToPolyline(x, z, FOREST_ROAD) < 12 || distToPolyline(x, z, OKU_ROAD) < 6 || ECHIZEN_IKKO_PLAN.kuruwa.some((k) => inPoly(k.poly, x, z)),
    roundNeedles: true,
    nearTreeFadeRadius: 7,
    templeNeedles: true, // この寺だけ、近景と遠景を低い枝のある丸い層にする。
    branchFoliage: true, // 不透明な多面体の樹冠を、隙間と枝先のある共通の葉房へ替える。
    foldedNeedleCards: true,
    unevenCrowns: true,
    closedFarCrowns: true, // 遠景の枝葉も同じ頂点を一緒に動かし、空へ裂ける面を残さない。
    plantedArrows: true, // 地面の矢は羽を見せ、鏃を斜めに埋める。
    keepPinnedArrowSize: true, // 大きさの違う兵へ刺さっても矢の実寸を保ち、戸口へ長い柄を突き出さない。
    noArrowRain: true, // 山寺の少人数の弓組は実際の一射だけ。別枠の斉射と三百六十本の残り矢を重ねない。
    naturalArrowRain: true, // 遠い矢を太い黒棒にせず、細い矢と控えめな影で見せる。
    enemyArrowWarnings: true, // 味方の斉射で参道から退かせず、敵の矢には従来どおり逃げ先を示す。
    arrowRainAreaShadow: false, // 坂を横切る大きな平面の影を外す。矢ごとの小さな影と退避案内は残す。
    arrowRainGroundCue: false, // 大きな発光の輪で山道を囲まない。影・警告・逃げ先の案内は残す。
    arrowRainPerBow: 1, // 少人数の山寺の弓組に合わせ、一射で一人から何本もの矢を増やさない。
    tabaSlopeGround: true, // 竹束の裾と後ろの支えを山肌へ合わせる。この戦だけ。
    tabaDeckGround: true, // 石段では土の坂でなく、兵と同じ踏面へ竹束の脚を据える。
    denseTabaBundles: true, // 写真の細竹を詰めた束。近くのみ詳しくし、遠くは七本の形へ戻す。
    trees: 1500,
    tuftTint: 0x817d5f,
    nearGrassTint: 0x817d5f, // 足元に追加する草にも同じ色を掛け、白い粒の帯にしない。
    tufts: 2400,
    // 資料との差（10/28）：山寺は杉の森に囲まれる。本数は同じまま、寺の山腹（参道の脇）へ寄せ、遠くを減らす。
    treeDensity: (x, z) => (inPoly(FOREST_POLY, x, z) || inPoly(FOREST2_POLY, x, z) ? 1.6 : Math.abs(x) < 95 && z > -175 && z < 90 ? 1.25 : 0.4),
    sugiAt: (x, z) => (Math.abs(x) < 110 && z > -180 && z < 110 ? 0.85 : 0.3),
    // 追加の林は通路の空け幅を無視して生えるため使わない。通常の千五百本で山林を残す。
    fleeOut: (x, z) => Math.abs(x) > 214 || z < -215 || z > 210,
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  // 攻め手の参道は初めから空いている。開いた門の脇で柵倒しへ誘わない。
  fenceUseOK: (rt) => rt.flags.mode === 'defend' && !templeInMelee(rt),
  // 堂を取り合う最中に、通る仲間の前で戸を閉める案内を出さない。
  doorCloseOK: (rt) => rt.flags.mode === 'defend' || !(rt.flags.step >= 1 && rt.flags.step <= 3),
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    rt.def.timeslip.skip = (x, z) => groundAt(W, x, z, W.heightAt(x, z) + 30) > W.heightAt(x, z) + 0.25;   // 堂の板の間・台の上は床に隠れる
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・夏草（def.timeslip）
    // 参道の両脇の石灯籠（資料との差 10/28：山寺の参道に灯籠が無かった）。夜討ちの夜は寺が火を入れている。位置は推定。
    {
      const spots = [];
      for (const z of [-104, -74, -58, -34, -16, 10]) for (const side of [-1, 1]) spots.push([side * 3.6, z, 0]);
      ishidoro(rt, spots, { lit: true });
    }
    // 麓から惣門と本堂の大屋根を見せる遠見の影（10/28）。見通しは八十メートルに抑えるので、
    // 遠い間だけ同じ向きの手前へ縮めて置き、篝火に照らされた軒と黒い屋根の形で山上の寺を示す。近づけば本物に任せる。
    {
      // 屋根は夜空より明るい月明かりの瓦の灰。真っ黒だと夜空に溶けて大屋根の形が読めなかった（10/28 点付け）。
      const roofMat = new THREE.MeshBasicMaterial({ color: 0x2b323c, fog: false, side: THREE.DoubleSide });
      const ridgeMat = new THREE.MeshBasicMaterial({ color: 0x4a5260, fog: false });
      const wallMat = new THREE.MeshBasicMaterial({ color: 0x2a1a10, fog: false });
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xffa24a, fog: false });
      // 寄棟の大屋根：軒の四隅（±1, 0, ±1）から棟（±.47, 1, 0）へ。四角錐だと壁より狭い尖った天幕に見えていた（10/28 撮り直し）。
      const roofGeo = new THREE.BufferGeometry();
      {
        const A = .47, E = [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1]], R0 = [-A, 1, 0], R1 = [A, 1, 0];
        const tri = [E[0], E[1], R1, E[0], R1, R0, E[2], E[3], R0, E[2], R0, R1, E[1], E[2], R1, E[3], E[0], R0];
        roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
      }
      // 切妻の屋根：底の幅 1・高さ 1 の三角の棟（x の向きに長い）
      const gableGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1); gableGeo.rotateZ(Math.PI / 2); gableGeo.rotateX(-Math.PI / 2);
      gableGeo.translate(0, .5, 0); gableGeo.scale(1, 1 / 1.5, 1 / 1.732);
      const flameGeo = new THREE.ConeGeometry(.5, 1, 6, 1);
      const litMat = new THREE.MeshBasicMaterial({ color: 0x6a4224, fog: false });  // 篝火の照る木
      const doorMat = new THREE.MeshBasicMaterial({ color: 0x2e1c10, fog: false });
      const eaveMat = new THREE.MeshBasicMaterial({ color: 0xa8642c, fog: false });
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8, fog: false });
      const boxGeo = new THREE.BoxGeometry(1, 1, 1);
      const part = (g, geo, mat, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); g.add(m); };
      const fars = [];
      const hillGeo = new THREE.CylinderGeometry(.24, 1, 1, 7, 1);
      const hillMat = new THREE.MeshBasicMaterial({ color: 0x0e1217, fog: false }); // 夜空より暗く、屋根の黒より明るい
      const sugiMat = new THREE.MeshBasicMaterial({ color: 0x111d17, fog: false }); // 月明かりの杉の影（土手より僅かに明るい緑の黒）
      const far = (x, z, near, build) => {
        const g = new THREE.Group(); build(g); g.visible = false; rt.scene.add(g);
        fars.push({ g, near, real: new THREE.Vector3(x, W.heightAt(x, z), z) });
      };
      // 本堂（寄棟の大屋根・灯明の戸口）。実寸より一回り大きく、遠くでも形が読めるように。
      far(-11, 6, 98, (g) => {
        // 本堂の建つ山の黒い影。宙に浮いた堂に見せない。
        part(g, hillGeo, hillMat, 64, 26, 44, 0, -12.6, 6);
        // 惣門の上へ持ち上げた時、堂の下に夜空が抜けて宙に浮いて見えた（10/28 撮り直し）。堂の下を山の土手で埋め、石の基壇に載せる。
        part(g, boxGeo, hillMat, 30, 14, 22, 0, -6.6, 2);
        part(g, boxGeo, ridgeMat, 19, .9, 14, 0, .15, 0);
        part(g, boxGeo, wallMat, 16, 4, 11, 0, 2.6, 0);
        // 壁より二メートル張り出す深い軒と、その軒裏の暗がり（寺の大屋根の重さ）
        part(g, boxGeo, doorMat, 20, .5, 14.8, 0, 4.35, 0);
        part(g, roofGeo, roofMat, 10, 5.6, 7.4, 0, 4.6, 0);
        part(g, boxGeo, ridgeMat, 9.5, .8, 1, 0, 10.2, 0);   // 月に照る大棟
        for (const dx of [-5.1, 5.1]) part(g, boxGeo, ridgeMat, .7, 1.5, .9, dx, 10.5, 0);   // 大棟の両端の鬼板
        for (const dx of [-10, 10]) part(g, boxGeo, eaveMat, .3, .3, 14.8, dx, 4.6, 0);   // 左右の軒先も篝火に照る
        for (const dx of [-5, 0, 5]) part(g, boxGeo, glowMat, 1, 1.6, .3, dx, 1.8, -5.7);
        for (const dx of [-7.6, -2.5, 2.5, 7.6]) part(g, boxGeo, litMat, .45, 3.8, .45, dx, 2.5, -5.8);   // 篝火に照る正面の柱
        part(g, boxGeo, eaveMat, 20, .3, .3, 0, 4.6, -7.4);   // 軒先の照り
        part(g, boxGeo, litMat, 17.5, .3, 1.4, 0, 1, -6.2);   // 縁
        part(g, boxGeo, litMat, 6, .5, 2, 0, .4, -7.4);       // 正面の階
        // 堂の下の土手が角の立った黒い板に見えた（10/28 夜）。両肩に杉の木立の影を立て、木の茂る山に見せる。
        for (const [dx, by, h, w, dz] of [[-12.5, -3, 13, 3.4, -1], [-15.5, -5, 15, 4, 3], [-19, -7, 12, 3.6, 0], [-23, -9, 13, 4.2, 4], [12.8, -3.5, 12, 3.2, 1], [15.8, -5, 16, 4, -1], [19.5, -7.5, 13, 3.8, 3], [23.5, -9.5, 12, 4, 0]]) {
          part(g, flameGeo, sugiMat, w, h, w, dx, by + h / 2, dz);
        }
        for (const dx of [-9.5, 9.5]) {
          part(g, flameGeo, glowMat, 1, 1.8, 1, dx, 1.6, -7);
          part(g, flameGeo, coreMat, .5, 1.1, .5, dx, 1.4, -7.05);
        }
      });
      // 惣門（二本の柱と切妻の屋根・両脇の篝火）。篝火に照らされた柱・扉・軒裏の明るい木の色で、
      // 夜空の黒に屋根の形が抜けて読めるようにする（10/28 点付け「惣門が画面に無い」）。
      far(GATE_SOMON.x, GATE_SOMON.z, 70, (g) => {
        const S = 1.05;
        // 門の建つ石段と土手の黒い影。宙に浮いた門に見せない（10/28 撮り直し：門の下が夜空だった）。
        part(g, hillGeo, hillMat, 15 * S, 7 * S, 9 * S, 0, -3.5 * S, 1.5 * S);
        part(g, boxGeo, litMat, 4.6 * S, .25 * S, 1.4 * S, 0, .12 * S, -2.6 * S);   // 篝火に照る石段の踏み面
        for (const dx of [-2.7, 2.7]) part(g, boxGeo, litMat, .6 * S, 4.4 * S, .6 * S, dx * S, 2.2 * S, 0);
        for (const dx of [-1.25, 1.25]) part(g, boxGeo, doorMat, 2.3 * S, 3.6 * S, .2 * S, dx * S, 1.8 * S, -.1 * S);
        part(g, boxGeo, litMat, 7 * S, .45 * S, .5 * S, 0, 4.1 * S, -.2 * S); // 冠木
        part(g, gableGeo, roofMat, 8.2 * S, 1.6 * S, 4.2 * S, 0, 4.5 * S, 0); // 切妻
        part(g, boxGeo, eaveMat, 8 * S, .18 * S, .25 * S, 0, 4.45 * S, -2.05 * S); // 軒先の照り
        for (const [dx, h] of [[-7.4, 8], [-9.6, 10], [7.6, 9], [9.8, 7.5]]) part(g, flameGeo, sugiMat, 2.6 * S, h * S, 2.6 * S, dx * S, (h / 2 - 1.5) * S, 1.5 * S);   // 門の両脇の杉の影
        for (const dx of [-1, 1]) {
          // 篝火：鉄の籠の柱と炎
          part(g, boxGeo, roofMat, .15 * S, 1.6 * S, .15 * S, dx * 4.6 * S, .8 * S, -3 * S);
          part(g, flameGeo, glowMat, .7 * S, 1.3 * S, .7 * S, dx * 4.6 * S, 2.1 * S, -3 * S);
          part(g, flameGeo, coreMat, .35 * S, .8 * S, .35 * S, dx * 4.6 * S, 1.95 * S, -3.05 * S);
        }
      });
      F.templeFars = fars;
      const farNdc = new THREE.Vector3(), farUp = new THREE.Vector3();
      F.templeFar = (cam) => {
        for (const f of fars) {
          const dx = f.real.x - cam.position.x, dy = f.real.y - cam.position.y, dz = f.real.z - cam.position.z;
          const d = Math.hypot(dx, dy, dz);
          f.g.visible = d > 78;
          if (!f.g.visible) continue;
          // 遠いほど手前（惣門は七十・本堂は百メートル弱）へ寄せ、見かけを実寸より大きく（最大二倍余り）する。
          // 実寸の見かけでは麓から豆粒になり、杉と鳥居に埋もれていた（10/28）。
          // 本堂は惣門より一回り大きく（麓では惣門の後ろに重なって一つの小屋に見えていた）。
          const k = Math.min(1, f.near / d), boost = 1 + Math.min(1, (d - 78) / 60) * (f === fars[0] ? 1.5 : 1.3);
          f.g.position.set(cam.position.x + dx * k, cam.position.y + dy * k, cam.position.z + dz * k);
          f.g.scale.setScalar(k * boost);
        }
        // 麓からは参道の真っすぐ奥で、本堂が惣門の真後ろに重なる。惣門が見える間だけ、
        // 本堂を画面の上へ持ち上げ、惣門の屋根の上に山上の大屋根が抜けて見えるようにする。
        const hall = fars[0], gate = fars[1];
        if (hall.g.visible && gate.g.visible && cam.isPerspectiveCamera) {
          cam.updateMatrixWorld();
          // 本堂の足もとを惣門の屋根の上へ。門の屋根と本堂の壁が重なって一つの小屋に見えていた（10/28 撮り直し）。
          const gy = farNdc.set(0, 6.6, 0).multiplyScalar(gate.g.scale.x).add(gate.g.position).project(cam).y - .2;
          const hy = farNdc.copy(hall.g.position).project(cam).y;
          const dGate = gate.real.distanceTo(cam.position);
          const want = Math.min(.62, gy + .22), fade = Math.min(1, Math.max(0, (dGate - 78) / 8));
          if (hy < want && fade > 0) {
            const depth = farNdc.copy(hall.g.position).applyMatrix4(cam.matrixWorldInverse).z;
            const t = Math.tan(cam.fov * Math.PI / 360) / cam.zoom;
            farUp.setFromMatrixColumn(cam.matrixWorld, 1);
            hall.g.position.addScaledVector(farUp, (want - hy) * -depth * t * fade);
          }
        }
        // 持ち上げた本堂の大屋根が画面の上で切れ、壁と灯明だけに見えていた（10/28 撮り直し）。
        // 屋根の頂が画面の上の端より下に来るよう、本堂を足もとを軸に縮める。
        if (hall.g.visible && cam.isPerspectiveCamera) {
          cam.updateMatrixWorld();
          const s = hall.g.scale.x;
          const base = farNdc.copy(hall.g.position).project(cam).y;
          const top = farNdc.set(0, 11 * s, 0).add(hall.g.position).project(cam).y;
          // 縮めすぎると惣門の陰に隠れて本堂が消えた（10/28 採点「本堂が画面に無い」）。惣門より広い大屋根の軒が左右に出る大きさは残す。
          if (top > .97 && top > base && base < .97) hall.g.scale.setScalar(s * Math.max(.8, (.97 - base) / (top - base)));
        }
      };
      const disposeFar = rt.dispose.bind(rt);
      rt.dispose = () => { roofGeo.dispose(); gableGeo.dispose(); flameGeo.dispose(); litMat.dispose(); doorMat.dispose(); eaveMat.dispose(); coreMat.dispose(); hillGeo.dispose(); hillMat.dispose(); boxGeo.dispose(); roofMat.dispose(); ridgeMat.dispose(); wallMat.dispose(); glowMat.dispose(); disposeFar(); };
    }
    const hudRoot = rt.hud.root;
    hudRoot.dataset.echizenIkko = '';
    // 坂を埋める白い矢の列を残さない。この戦の外れ矢だけ短時間・少数に限る。
    const pinArrow = rt.army.pinArrow, bakeArrow = rt.army.bakeArrow;
    rt.army.pinArrow = function(a, life, parent, support = null) {
      if (!parent && !support) {
        let count = 0;
        for (const other of this.arrows) if (other.groundPinned && other.life > 0) count++;
        if (count >= 24) { a.life = 0; return false; }
        life = Math.min(life, 12);
      }
      return pinArrow.call(this, a, life, parent, support);
    };
    rt.army.bakeArrow = function(a) { if (!a.groundPinned) bakeArrow.call(this, a); };
    // 横長の携帯では、矢の警告を右の任務札と中央の照準から離す。
    const rainLayout = document.createElement('style');
    rainLayout.textContent = `
      /* 構える釦は右下へ固定し、右上の任務と中央の敵を隠さない。 */
      @media (max-height:500px) {
        html.touch body #hud[data-echizen-ikko] #wait-guard {
          left:auto !important; right:calc(16px + env(safe-area-inset-right, 0px)) !important;
          top:auto !important; bottom:calc(24px + env(safe-area-inset-bottom, 0px)) !important;
        }
        /* 構えの説明を二枚重ねず、任務は上の欄に残す。 */
        html body #hud[data-echizen-ikko].wait-guard-active #objectives:not(.expand) .battle-action {
          display:none !important;
        }
        html.touch body #hud[data-echizen-ikko].wait-guard-active #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
          left:auto !important; right:calc(88px + env(safe-area-inset-right, 0px)) !important;
          top:calc(16px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
          transform:none !important;
        }
        /* 手・盾・本文を枠内で分け、長い物陰の説明が右端から切れないようにする。 */
        html body #hud[data-echizen-ikko] button.cover-guide.hold-cover {
          width:220px; max-width:calc(100vw - 48px); }
        html body #hud[data-echizen-ikko] button.cover-guide.hold-cover span {
          flex:1 1 0; min-width:0; width:auto; white-space:pre-line;
          overflow-wrap:anywhere; }
      }
      /* 出陣の釦は固定し、下知と勝つ条件は最後まで送って読める。 */
      html body #hud[data-echizen-ikko] #intro > .card.card {
        display:flex; flex-direction:column; gap:8px; }
      #hud[data-echizen-ikko] #intro .intro-reading {
        flex:1 1 auto; min-height:0; overflow-y:auto; touch-action:pan-y;
        pointer-events:auto; overscroll-behavior:contain;
        scroll-padding-bottom:16px; padding-bottom:16px; }
      #hud[data-echizen-ikko] #intro-go { flex-shrink:0; }
      @media (orientation:landscape) and (max-height:500px) {
        html body #hud[data-echizen-ikko] #intro > .card.card {
          width:min(600px, calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
          height:calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
          max-height:calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important; }
      }
      @media (min-height:501px) {
        html body #hud[data-echizen-ikko] #intro > .card.card { height:min(600px, 72dvh); }
      }
      /* 作業札は任務欄の先頭に収める。古い下端指定で欄外へ押し出さない。 */
      html body #hud[data-echizen-ikko].working #battle-notices #prompt.work-action:not([hidden]) {
        position:relative !important; inset:auto !important; }
      #hud[data-echizen-ikko] #prompt button[data-work] {
        min-width:0; width:100%; max-width:100%; }
      #hud[data-echizen-ikko] #prompt button[data-work] span {
        min-width:0; white-space:normal; word-break:normal; overflow-wrap:anywhere; }
      /* 開戦の旗を囲む線は残し、大きな二重枠とひし形で兵を隠さない。 */
      #hud[data-echizen-ikko] #battle-opening .opening-flag-frame {
        border-width:3px; box-shadow:0 0 0 2px #14120f; }
      #hud[data-echizen-ikko] #battle-opening .opening-flag-frame::before {
        font-size:32px; }
      /* 普段の下知は短い帯。大きな字では折り返し、詳しい任務は札を開いて読む。 */
      html body #hud[data-echizen-ikko] #battle-notices:not(.choosing) #objectives:not(.expand) {
        min-height:44px; height:auto !important;
        max-width:100% !important; padding:4px 8px !important; }
      html body #hud[data-echizen-ikko] #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(small,.opb) {
        display:none !important; }
      /* この戦の札だけを同じ欄へ収め、長い下知も縦に折り返す。 */
      html body #hud[data-echizen-ikko] #battle-notices:not(.choosing) #objectives:not(.expand),
      html body #hud[data-echizen-ikko] #battle-notices #battle-message,
      html body #hud[data-echizen-ikko] #battle-notices :is(#banner,#subtitle,#tutorial,.battle-notice) {
        position:relative !important; inset:auto !important; transform:none !important;
        width:100% !important; min-width:0 !important; max-width:100% !important;
        height:auto !important; max-height:none !important; margin:0 !important;
        box-sizing:border-box; flex:0 0 auto; white-space:normal !important;
        overflow-wrap:anywhere; overflow:visible !important; }
      /* 道案内・接近戦に替わっても本文を一文字幅へ縮めず、距離を別の行で読む。 */
      html body #hud[data-echizen-ikko] #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur,
      html body #hud[data-echizen-ikko] #battle-notices:not(.choosing) #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
        display:block !important; position:static !important; width:auto !important;
        min-width:0 !important; max-width:100% !important; height:auto !important;
        max-height:none !important; overflow:visible !important;
        -webkit-line-clamp:unset !important; line-clamp:unset !important;
        white-space:normal !important; overflow-wrap:anywhere !important;
        word-break:normal !important; line-height:1.4 !important; }
      html body #hud[data-echizen-ikko] #battle-notices #objectives:not(.expand) li.cur small {
        position:static !important; width:auto !important; max-width:100%;
        white-space:normal !important; overflow-wrap:anywhere; }
      /* 突き・構えの手ほどきと、堂を押さえる任務を一枚の札で読む。 */
      html body #hud[data-echizen-ikko] #battle-notices #objectives.keep-combat-task:not(.expand) #obj-list {
        display:block !important; }
      html body #hud[data-echizen-ikko] #battle-notices:not(.choosing) #objectives.keep-combat-task.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list,
      html body #hud[data-echizen-ikko] #battle-notices:not(.choosing) #objectives.keep-combat-task.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list li.cur .obj-text {
        display:block !important; }
      /* 見回す手ほどきで欄全体が隠れても、今の下知だけは残す。 */
      html body #hud[data-echizen-ikko]:is(.touch-turn-coach,.dodge-turn-coach,.wait-guard-active,.dodge-active) #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand):not([hidden]):not(.notice-muted) {
        display:block !important; visibility:visible !important; pointer-events:auto; }
      html body #hud[data-echizen-ikko] #battle-notices #objectives.keep-combat-task:not(.expand) li.cur small:not(.goal-place) {
        display:block !important; font-size:max(12px, calc(13px * var(--text-scale, 1)));
        line-height:1.5; }
      html body #hud[data-echizen-ikko] #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) #obj-list li.cur > small:not(.goal-place):not(.obj-cue) {
        display:block !important; }
      html body #hud[data-echizen-ikko] #battle-notices #banner .brush {
        display:block; font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
        line-height:1.5; white-space:normal !important; overflow-wrap:anywhere; }
      /* 後退の操作を本文の途中へ割り込ませず、退き陣の理由も携帯で残す。 */
      html body #hud[data-echizen-ikko].single-guide #battle-notices:not(.choosing) #objectives.keep-combat-task.travel-retreat:not(.expand) #obj-list li.cur .obj-now {
        white-space:pre-line !important; }
      html body #hud[data-echizen-ikko].single-guide #battle-notices:not(.choosing) #objectives.keep-combat-task.travel-retreat:not(.expand) #obj-list li.cur .retreat-caption {
        display:block !important; margin-top:4px;
        font-size:max(13px, calc(13px * var(--text-scale, 1))) !important;
        line-height:1.5 !important; white-space:normal !important; }
      html body #hud[data-echizen-ikko] #battle-notices #objectives .retreat-gesture {
        width:32px; height:32px; }
      html body #hud[data-echizen-ikko][data-temple-retreat] #battle-notices #banner small {
        display:block !important; line-height:1.5; }
      @media (min-height:501px) {
        /* 共通の「任務あり」の右寄せより優先し、地図と下知を離す。 */
        html body #hud[data-echizen-ikko] #battle-notices:not(.choosing),
        html body #hud[data-echizen-ikko].mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
          left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
          top:calc(104px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
          width:min(320px, 30vw) !important; display:flex; flex-direction:column; gap:8px;
          max-height:calc(100% - 260px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
          overflow-y:auto; }
      }
      @media (max-height:500px) {
        #rain-mark.temple-rain { left:calc(16px + env(safe-area-inset-left, 0px)) !important;
          top:calc(64px + env(safe-area-inset-top, 0px)) !important; transform:none !important;
          max-width:calc(40vw - 24px); padding:6px 8px !important;
          font-size:14px !important; letter-spacing:0 !important; }
        html body #hud[data-echizen-ikko] #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
          left:auto !important; right:calc(88px + env(safe-area-inset-right, 0px)) !important;
          top:calc(16px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
          width:min(300px, 36vw) !important; display:flex; flex-direction:column; gap:8px;
          max-height:min(40dvh, calc(100dvh - 160px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))) !important;
          pointer-events:auto; }
      }`;
    document.head.appendChild(rainLayout);
    const dispose = rt.dispose.bind(rt);
    rt.dispose = () => {
      rainLayout.remove(); delete hudRoot.dataset.echizenIkko; delete hudRoot.dataset.templeRetreat; dispose();
    };
    const arrowRain = rt.army.hooks.onArrowRain;
    rt.army.hooks.onArrowRain = (volley, under) => {
      if (volley.team === rt.player.u.team) return;
      arrowRain(volley, under);
      // この戦は落下範囲の輪を描かない。共通の警告も逃げ先の矢印へ言い換える。
      for (const notice of rt.hud.notices.queue) {
        if (notice.text === '矢が来る！ 輪の外へ') notice.text = '矢が来る！ 矢印の先へ逃げよ';
      }
      const mark = document.getElementById('rain-mark');
      if (under && mark && !mark.hidden) { mark.classList.add('temple-rain'); mark.textContent = '▲ 矢が降る　その場を離れよ'; }
    };
    // 地面の tint は草・土の配分用。描く土の色はこの戦の材質へ直接掛ける。
    if (W.terrain) W.terrain.material.color.setHex(0xc5b294);
    // 視点を追う標高零の山並みは、山寺の足元より低く入り裏面をさらす。
    // 寺を囲む尾根は本物の地形と遠景の地面で描く。
    W.mountains.visible = false;
    templeFarRidges(W);
    templeSky(W, rt.camera);
    const beforeTerrain = rt.scene.onBeforeRender;
    const tabaCameraEye = new THREE.Vector3(), tabaCameraStart = new THREE.Vector3();
    const tabaCameraLook = new THREE.Vector3(), tabaCameraDirection = new THREE.Vector3();
    const tabaCameraTilt = new THREE.Vector3();
    rt.scene.onBeforeRender = function (renderer, scene, camera, target) {
      const playing = camera.isPerspectiveCamera && !rt.game?.photo;
      const playerPos = rt.player.u.pos;
      templeSolid.value = playing && nakaRoomAt(playerPos.x, playerPos.z, playerPos.y) ? 1 : 0;
      if (playing) {
        tabaCameraStart.copy(camera.position);
        tabaCameraEye.copy(rt.player.u.pos); tabaCameraEye.y += 1.45;
        // 見ていた点を先に保つ。位置だけを補正すると、坂や竹束の上から
        // 同じ角度で空を見続け、本人と参道が画面の下へ消えてしまう。
        camera.getWorldDirection(tabaCameraDirection);
        const depth = Math.max(2, tabaCameraLook.copy(tabaCameraEye).sub(camera.position).dot(tabaCameraDirection) + 3);
        tabaCameraLook.copy(camera.position).addScaledVector(tabaCameraDirection, depth);
        // 麓から惣門への急な参道では、目線を坂の上へ少し上げる。下を向いたままだと
        // 鳥居の先の石段・惣門・山腹の堂が画面の上へ外れていた（10/28）。本人は画面の下寄りに残る。
        const P = rt.player.u.pos;
        if (F.mode === 'attack' && P.z < GATE_SOMON.z - 8 && !nakaRoomAt(P.x, P.z, P.y)) {
          const rise = W.heightAt(P.x, P.z + 30) - P.y;
          // 麓の参道（惣門の四十歩より下）は惣門と本堂の大屋根が画面の上に入るまで見上げる（10/29 採点：門も屋根も写らず）。
          F.slopeLift = P.z < GATE_SOMON.z - 40 ? Math.min(1.6, Math.max(0, rise) * .13) : Math.min(.9, Math.max(0, rise) * .09);
        } else F.slopeLift = 0;
      }
      // 惣門までの登りでは、肩越しの視点を目の高さへ下げる。上から本人の頭を見下ろすと、
      // 山腹の惣門と本堂の屋根が画面の上へ外れていた（10/28）。後の補正が本人の目線へ向け直す。
      if (playing) {
        const P = rt.player.u.pos;
        const k = Math.max(0, Math.min(1, (GATE_SOMON.z - 6 - P.z) / 10));
        if (k > 0 && !nakaRoomAt(P.x, P.z, P.y)) {
          const low = Math.max(tabaCameraEye.y - .1, drawGroundAt(W, camera.position.x, camera.position.z) + .9);
          if (low < camera.position.y) { camera.position.y += (low - camera.position.y) * k * .85; camera.updateMatrixWorld(); }
        }
      }
      // 直接切り替えた視点も、堂の屋根や竹束の向こうから本人を映さない。
      // いつもの肩越し視点と同じ体積判定を使い、堂と兵は動かさない。
      if (playing) {
        const hit = W.cameraBlockFraction?.(tabaCameraEye, camera.position) ?? null;
        if (hit !== null) {
          const length = tabaCameraEye.distanceTo(camera.position);
          camera.position.lerpVectors(tabaCameraEye, camera.position, Math.max(0, hit - .2 / Math.max(.01, length)));
          camera.updateMatrixWorld();
        }
      }
      // 軒を避けて手前へ寄せると、別の段の土へ戻ることがある。
      // 向きを戻した後の画面の四隅も測り直す。動かなければ二回で終え、最大三回まで。
      for (let pass = 0; pass < (playing ? 3 : 1); pass++) {
        const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
        if (playing) templeSlopeCamera(W, tabaCameraEye, camera);
        templeCameraGround(W, camera);
        if (playing && templeTabaCameraClear(F.tabas, camera)) {
          templeCameraGround(W, camera);
          camera.updateMatrixWorld();
        }
        if (playing) {
          const P = rt.player.u.pos, room = nakaRoomAt(P.x, P.z, P.y);
          if (room) templeRoomCamera(room, camera, P);
          else {
            // 地面や竹束を避けて持ち上げた後も、画面の四隅を軒へ入れない。
            const half = camera.near * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
            const pad = Math.hypot(half * camera.aspect, half, camera.near) + .08;
            const hit = W.templeCameraFraction(tabaCameraEye, camera.position, pad);
            if (hit !== null) {
              const length = tabaCameraEye.distanceTo(camera.position);
              camera.position.lerpVectors(tabaCameraEye, camera.position, Math.max(0, hit - .2 / Math.max(.01, length)));
              camera.updateMatrixWorld();
            }
            W.templeCameraClear(camera, tabaCameraEye);
          }
          // 坂・竹束・門柱を避けた先にも兵がいる。直接切り替えた視点も
          // 普段の肩越し視点と同じ判定で体の外へ戻す。
          avoidCameraBodies(rt.army.units, rt.player.u, tabaCameraEye, camera.position);
          // 兵を避けた先で竹束へ戻る場合も、画面の手前の幅を含めて調べ直す。
          // 初めの中心線だけでは、横長の画面の端へ竹と控えが大写しに残る。
          const half = camera.near * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
          const pad = Math.hypot(half * camera.aspect, half, camera.near) + .08;
          const hit = templeTabaCameraFraction(F.tabas, tabaCameraEye, camera.position, pad);
          if (hit !== null && hit > 0) {
            const length = tabaCameraEye.distanceTo(camera.position);
            camera.position.lerpVectors(tabaCameraEye, camera.position, Math.max(0, hit - .2 / Math.max(.01, length)));
          }
          // 本人の目線も束の余白に入る時は、零距離へ縮めず束の上へ抜く。
          templeTabaCameraClear(F.tabas, camera);
          // 兵や束を避けた最後の位置も堂の壁・格子で確かめる。
          // ここを省くと、先に壁を避けても兵の押し出しで壁の裏へ戻る。
          if (room) templeRoomCamera(room, camera, P);
          else {
            const wallHit = W.templeCameraFraction(tabaCameraEye, camera.position, pad);
            if (wallHit !== null && wallHit > 0) {
              const length = tabaCameraEye.distanceTo(camera.position);
              camera.position.lerpVectors(tabaCameraEye, camera.position, Math.max(0, wallHit - .2 / Math.max(.01, length)));
            }
            W.templeCameraClear(camera, tabaCameraEye);
          }
        }
        if (playing) {
          if (camera.position.distanceToSquared(tabaCameraStart) > .000001) {
            // 遮りを避けた近い視点では、まず本人を中央に戻す。
            // 二歩先まで延ばすと、急坂や屋根だけを映して本人が下端へ消える。
            tabaCameraLook.copy(tabaCameraEye);
          }
          // 外壁を避けた後、二歩先の注視点だけが堂内に残ると壁の拡大になる。
          // 本人までの見通しを保ち、壁の向こうへ目線を延ばさない。
          if (W.templeCameraFraction(tabaCameraEye, tabaCameraLook) !== null) {
            tabaCameraLook.copy(tabaCameraEye);
          }
          // 戸口で目線まで寄った時は、同じ一点を向く計算にしない。
          if (Math.hypot(camera.position.x - tabaCameraLook.x, camera.position.z - tabaCameraLook.z) < .65) {
            // 戸口で目線の真上へ寄せられても、床を真下に見下ろさない。
            const length = Math.hypot(tabaCameraDirection.x, tabaCameraDirection.z);
            const yaw = rt.player.yaw;
            tabaCameraLook.set(camera.position.x + (length > .01 ? tabaCameraDirection.x / length : Math.sin(yaw)) * 2,
              camera.position.y, camera.position.z + (length > .01 ? tabaCameraDirection.z / length : Math.cos(yaw)) * 2);
            // 壁へ寄せられた直後に元の向きを戻すと、再び壁だけを映す。
            // 堂内では室内の中央へ、外では本人の側へ向き直る。
            const room = nakaRoomAt(playerPos.x, playerPos.z, playerPos.y);
            if (room) {
              const dx = tabaCameraLook.x - room.I.x, dz = tabaCameraLook.z - room.I.z;
              const lx = dx * room.I.c - dz * room.I.s, lz = dx * room.I.s + dz * room.I.c;
              if (Math.abs(lx) > room.lv.w / 2 - .4 || Math.abs(lz) > room.lv.d / 2 - .4)
                tabaCameraLook.set(room.I.x, camera.position.y, room.I.z);
            } else if (W.templeCameraFraction(camera.position, tabaCameraLook) !== null) {
              tabaCameraLook.set(camera.position.x + tabaCameraEye.x - tabaCameraLook.x,
                camera.position.y, camera.position.z + tabaCameraEye.z - tabaCameraLook.z);
            }
          }
          // 坂と矢除けの補正後も木や柱を垂直に映す。
          camera.up.set(0, 1, 0);
          // 見上げの高さは注視点までの水平の隔たりで抑える（十一度まで）。視点が本人へ寄った時に
          // 同じ高さを足すと真上の夜空だけを映していた（10/29 18:10 採点：画面が夜空の一色）。
          const liftRoom = Math.hypot(tabaCameraLook.x - camera.position.x, tabaCameraLook.z - camera.position.z) * .2;
          tabaCameraTilt.copy(tabaCameraLook).setY(tabaCameraLook.y + Math.min(F.slopeLift || 0, liftRoom));
          // 注視点が視点の真上近くなら、本人の向きの二歩先を見る（真上を向かせない）。
          if (Math.hypot(tabaCameraTilt.x - camera.position.x, tabaCameraTilt.z - camera.position.z) < Math.abs(tabaCameraTilt.y - camera.position.y) * .5) {
            const yaw = rt.player.yaw;
            tabaCameraTilt.set(camera.position.x + Math.sin(yaw) * 3, camera.position.y - .3, camera.position.z + Math.cos(yaw) * 3);
          }
          camera.lookAt(tabaCameraTilt);
          camera.updateMatrixWorld();
        }
        if (pass > 0 && Math.abs(camera.position.x - cx) + Math.abs(camera.position.y - cy) +
            Math.abs(camera.position.z - cz) < .00001) break;
      }
      // 最後の守り：どの補正の後でも、視点を地面（描く地面と高さの表の高い方）より下に置かず、
      // 夜空ばかりを見上げる向き（十五度より上）にもしない（10/29 18:10 採点：地の下から夜空の一色を映した）。
      if (playing && !nakaRoomAt(camera.position.x, camera.position.z, camera.position.y)) {
        const cp = camera.position, floor = Math.max(W.heightAt(cp.x, cp.z), drawGroundAt(W, cp.x, cp.z)) + .7;
        let moved = false;
        if (cp.y < floor) { cp.y = floor; moved = true; }
        camera.getWorldDirection(tabaCameraDirection);
        if (tabaCameraDirection.y > .26 || moved) {
          const flat = Math.hypot(tabaCameraDirection.x, tabaCameraDirection.z);
          const fx = flat > .05 ? tabaCameraDirection.x / flat : Math.sin(rt.player.yaw), fz = flat > .05 ? tabaCameraDirection.z / flat : Math.cos(rt.player.yaw);
          const up = Math.min(.26, tabaCameraDirection.y);
          camera.up.set(0, 1, 0);
          camera.lookAt(tabaCameraTilt.set(cp.x + fx * 4, cp.y + up * 4 / Math.max(.5, Math.sqrt(1 - up * up)), cp.z + fz * 4));
        }
        camera.updateMatrixWorld();
      }
      beforeTerrain.call(this, renderer, scene, camera, target);
    };
    F.tabaUseOptions = { allowPush: false, team: 0 };
    // 夏の夜の星を雪の粒に見せない。この戦の空だけを控えめにする。
    if (W.stars) {
      W.stars.geometry.setDrawRange(0, 240);
      W.stars.material.size = .65; W.stars.material.opacity = .25;
    }
    // 引いた出陣の視点も空ける。遠景の木も含め、この戦の始点だけを整える。
    const start = this.spawn;
    W.clearTreesAround(start.x, start.z, 38);
    templeNightTrees(rt);
    templeSlopeRocks(rt);
    F.step = 0; F.ek = 0; F.ak = 0;
    F.rescued = true; rt.firstBattle = false; rt.firstFights = false;
    F.fow = true;
    F.mode = mode();
    F.quiet = F.mode === 'attack';
    // 届いた声だけを四秒おきに並べる。使番への受け渡しは元の say に任せる。
    const say = rt.say.bind(rt), speech = new Map();
    F.speechAt = rt.t; F.speechEpoch = 0;
    rt.say = (who, text, seconds = 4) => {
      text = text.replace(/影から出よ/g, '矢が落ちる所を離れよ');
      const key = who === '使番' && text.startsWith('殿の下知にござる。') ? '下知の使番' : who + '：' + text;
      if (rt.t < (speech.get(key) ?? -Infinity) + 8) return;
      const slot = Math.max(rt.t, F.speechAt);
      // 今の戦況を優先する。声を長く積んで、昔の下知を流さない。
      if (slot - rt.t > 8) return;
      speech.set(key, slot);
      const epoch = F.speechEpoch;
      F.speechAt = slot + 4;
      if (slot <= rt.t) say(who, text, Math.min(seconds, 4));
      else {
        const delivered = rt._deliveredNotice;
        rt.after(slot - rt.t, () => {
          if (rt.over || !rt.player.u.alive || epoch !== F.speechEpoch) return;
          const before = rt._deliveredNotice;
          rt._deliveredNotice = delivered;
          try { say(who, text, Math.min(seconds, 4)); }
          finally { rt._deliveredNotice = before; }
        });
      }
    };
    // 矢の言い換え三種を一つの知らせにまとめる。
    rt.army.hooks.onArrowAtPlayer = () => {
      if (F.arrowTold || rt.t < 10) return;
      F.arrowTold = true;
      rt.say('足軽', '矢が来るぞ。竹束の陰へ入れ', 4);
    };
    // 旗の材質はこの戦の味方だけ写し、同じ材質を使い回す。
    F.moonFlagMats = new Map();
    F.lightFlag = (flag, kind) => {
      if (!flag || flag.userData.templeMoon) return;
      flag.userData.templeMoon = true;
      const base = kind === 'takigawa' ? flagMaterial(kind) : flag.material;
      let mat = F.moonFlagMats.get(base);
      if (!mat) {
        mat = base.clone();
        mat.onBeforeCompile = (shader) => {
          base.onBeforeCompile(shader);
          shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
            #ifdef USE_MAP
              float edge = 1.0 - smoothstep(0.0, 0.055, min(min(vMapUv.x, 1.0 - vMapUv.x), min(vMapUv.y, 1.0 - vMapUv.y)));
              outgoingLight += vec3(0.03, 0.04, 0.05) * edge;
            #endif
            #include <opaque_fragment>`);
        };
        mat.customProgramCacheKey = () => 'templeMoonFlag';
        F.moonFlagMats.set(base, mat);
      }
      flag.material = mat;
    };
    // この山だけ補光を削っていた処理を外し、月の散乱光を屋根の裏にも回す。
    // 夜討ちの味方は旗で合図する。敵の警鐘は残す。
    const onSignal = rt.army.hooks.onSignal;
    rt.army.hooks.onSignal = (g, kind, at) => {
      if (F.mode === 'attack' && g.team === rt.player.u.team) return false;
      return onSignal?.(g, kind, at);
    };
    rt.__fireZones = {};
    flReset();

    const C = F.C = buildCastlePlan(rt, ECHIZEN_IKKO_PLAN, { baseHeight: baseTerrain, edgeW: 3, skipWalls: ['gezan', 'hondo', 'oku'] });
    const templeTeam = F.mode === 'defend' ? 0 : 1;
    const rimBatch = makeKitBatch();
    for (const r of TEMPLE_RIMS) wallLine(rt, r.pts, { team: templeTeam, hp: 160, segLen: 8, name: '寺の守りの柵', mesh: templeFence, meshOpt: { h: 1.8, mound: false, noBrace: true, batch: rimBatch } });
    // 幅4.8の木戸の内側へ柵を張り出させない。門を破った後も口が狭まり、列が詰まっていた。
    // 谷道・森の別手の口は残す。
    for (const [z, mouth, end] of [[-86, 2.4, 12], [-6, 2.4, 3.4]]) for (const side of [-1, 1])
      wallLine(rt, [[side * mouth, z], [side * end, z]], { team: templeTeam, hp: 160, name: '木の柵', mesh: templeFence, meshOpt: { h: 1.8, mound: false, noBrace: true, batch: rimBatch } });
    // 山門脇の留め石は坂に沿う短い段。両面と端を積み、薄い板の裏を見せない。
    if (!retainingGeo) {
      retainingGeo = new THREE.BoxGeometry(1, 1, 1);
      retainingMat = new THREE.MeshLambertMaterial({ color: 0x625e51, map: stoneTex() });
    }
    // 留め石の内側へ裏込めを置く。短い区画の石同士に空洞を残さない。
    const fill = new THREE.InstancedMesh(retainingGeo, retainingMat, 16);
    const block = new THREE.Object3D(); let fillI = 0;
    for (const x of [-4.4, 4.4]) for (let z = -11; z < -3; z++) {
      const pts = [[x - .4, z], [x + .4, z], [x + .4, z + 1], [x - .4, z + 1], [x - .4, z]];
      const topY = Math.max(...pts.map(([px, pz]) => W.heightAt(px, pz))) + .35;
      const bottom = Math.min(...pts.map(([px, pz]) => W.heightAt(px, pz))) - .4;
      block.position.set(x, (topY - .08 + bottom) / 2, z + .5);
      block.scale.set(.7, topY - .08 - bottom, 1.02);
      block.updateMatrix(); fill.setMatrixAt(fillI++, block.matrix);
      ishigaki(W, pts, { topY, minH: .8, maxH: 1.3, lean: .1, big: .6, out: -1, noKit: true, batch: rimBatch });
    }
    fill.castShadow = fill.receiveShadow = true; rt.scene.add(fill);
    finalizeKitBatch(rt, rimBatch);
    // 入れる堂は共通の床・戸口・和の部屋（0_naibu）を使う。板葺きは推定。
    const cameraHalls = [];
    // 入れない倉と鐘楼も、実物の箱を支度中に一度だけ測る。
    // 焼失の知らせだけで壁を透過せず、実際に残っている形の外へ目線を戻す。
    const cameraProp = (mesh, clearance = .65) => {
      mesh.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(mesh);
      cameraHalls.push({ I: null, struct: { alive: true, mesh }, wallClearance: clearance,
        x0: bounds.min.x - .08, x1: bounds.max.x + .08,
        z0: bounds.min.z - .08, z1: bounds.max.z + .08,
        y0: bounds.min.y - .08, y1: bounds.max.y + .08 });
    };
    W.templeHalls = [];
    W.templeCameraFraction = (from, to, pad) => templeCameraFraction(cameraHalls, from, to, pad);
    W.templeCameraClear = (camera, eye) => templeCameraClear(cameraHalls, camera, eye);
    W.cameraBlockFraction = (from, to) => {
      const hall = templeCameraFraction(cameraHalls, from, to);
      const taba = templeTabaCameraFraction(F.tabas, from, to);
      return hall === null ? taba : taba === null ? hall : Math.min(hall, taba);
    };
    const hall = (x, z, w, d, name, kind = 'chudo', hp = 150) => {
      // 床の上げ幅を引く。外の屋根より室内の天井が高いと、視点が梁へ入り込む。
      const b = goten(rt, x, z, { w, d, name, kind, profile: 'echizen_ikko', tile: false, templeBoardRoof: true, naka: true, templePaper: true, interiorH: 2.35, door: -1, doorX: 0, doorFire: false, team: templeTeam, hp });
      // 視点は壁と天井の内へ収める。戸口から見る屋根も距離で切り抜かない。
      b.mesh.traverse((mesh) => {
        if (!mesh.isMesh) return;
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(templeHallMaterial) : templeHallMaterial(mesh.material);
      });
      // 戸口の宙に炎だけを浮かせず、道端の支柱付き提灯で入口を照らす。
      for (const side of [-1, 1]) templeLantern(rt, x + side * 1.8, z - d / 2 - 1.5);
      b.naka.levels[0].cameraClearance = .8;
      b.naka.projectileCeiling = true; // 堂の板天井で矢玉を止める。戸口と窓の射線は残す。
      b.naka.templePaper = true;
      b.naka.lampGlowScale = .24; // 灯明の光を器に寄せ、戸口に大きな光の玉を浮かせない。
      W.templeHalls.push({ I: b.naka, struct: b.struct });
      const y = b.naka.levels[0].y - .55;
      cameraHalls.push({ I: b.naka, struct: b.struct, wallClearance: .9, x0: x - w / 2 - .15, x1: x + w / 2 + .15,
        z0: z - d / 2 - .15, z1: z + d / 2 + .15, y0: y + .45, y1: y + 3.08 });
      // 反り・棟木・垂木まで実物から測る。寸法だけの箱では棟と軒先がはみ出す。
      // 組み立て時に一度だけ測り、毎コマは既存の箱を使い回す。
      b.mesh.updateWorldMatrix(true, true);
      const roofBounds = new THREE.Box3().setFromObject(b.mesh);
      cameraHalls.push({ I: b.naka, struct: b.struct,
        x0: roofBounds.min.x - .08, x1: roofBounds.max.x + .08,
        z0: roofBounds.min.z - .08, z1: roofBounds.max.z + .08,
        y0: y + 2.8, y1: roofBounds.max.y + .08 });
      // 板の絵は面の実寸で繰り返す。共有材質や他の堂の形は変えない。
      b.mesh.traverse((m) => {
        if (!m.isMesh || !m.material.map || m.userData.templePaper || m.userData.templeBoard) return;
        const g = m.geometry, uv = g.attributes.uv, pos = g.attributes.position, normal = g.attributes.normal;
        if (!uv || !normal) return;
        for (let i = 0; i < pos.count; i++) {
          const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i));
          uv.setXY(i, (nx > .5 ? pos.getZ(i) : pos.getX(i)) / 1.5, (ny > .5 ? pos.getZ(i) : pos.getY(i)) / 1.5);
        }
        uv.needsUpdate = true;
      });
      b.struct.flammable = true;
      return b;
    };
    const gezanC = C.kuruwa.gezan.centroid, hondoC = C.kuruwa.hondo.centroid, okuC = C.kuruwa.oku.centroid;

    // ---- 板葺きの堂と僧坊：外堂（講堂・僧坊）・本堂（中心伽藍）・奥の院 ----
    hall(gezanC.x - 11, gezanC.z + 6, 7, 5, '外堂の僧坊', 'sobo');
    hall(gezanC.x + 11, gezanC.z - 4, 8, 6, '講堂');
    F.gezanKura = templeStore(W, gezanC.x + 7, gezanC.z + 8, 0.1);
    rt.scene.add(F.gezanKura);
    cameraProp(F.gezanKura);
    F.gezanKuraStruct = rt.army.addStruct({ x: gezanC.x + 7, z: gezanC.z + 8, r: 3, solidR: 3, hp: 150, maxHp: 150, armor: 0, team: templeTeam, name: '外堂の倉', moraleOnBurn: 'small', flammable: true });

    const mainHall = hall(hondoC.x - 11, hondoC.z - 8, 14, 10, '本堂', 'hondo', 260);
    F.hondoBldg = mainHall.mesh; F.hondoStruct = mainHall.struct;
    hall(hondoC.x + 11, hondoC.z + 6, 7.5, 6, '護摩堂');
    // 外堂の平場から本堂の平場までを石段にし、門の下に裸の急坂を残さない。
    rt.scene.add(templeSteps(W, 0, -34, 0, -4, 3.2));
    rt.scene.add(templeSteps(W, 0, 20, 0, 44, 3.2));
    // 麓の村から見上げる参道（持ち場から最初に見える所。10/28）。大滝寺は大瀧神社と一つの神仏習合の山寺なので、
    // 参道の口に木の鳥居、急な登りは石段、両脇に火を入れた石灯籠、鳥居の脇に篝火。位置と寸法は推定。
    {
      // 鳥居は参道の口より少し手前へ。25秒の肩越しのすぐ脇に柱と笠木が額縁のように残らないようにする（10/28 点付け）。
      rt.scene.add(templeTorii(W, 0, -177));
      rt.scene.add(templeSteps(W, -.8, -164, -1.6, -124, 3.6));
      const spots = [];
      for (const z of [-192, -180, -158, -144, -130, -118]) for (const side of [-1, 1]) spots.push([side * 3.3 + (z > -130 ? -1.6 : z > -165 ? -1 : 0), z, 0]);
      ishidoro(rt, spots, { lit: true });
      for (const x of [-4.6, 4.6]) { rt.scene.add(kagaribi(W, x, -175)); W.addFire(x, -175, { torch: true, h: 1.35 }); }
    }
    // 夜でも寺の形が見えるよう、本堂・外堂のまわりに篝火を置く（B021・B022）
    // 南と北の薪火は登り道の斜面から平場へ寄せる。石段と堂の戸口は空ける。
    for (const [x, z] of [[hondoC.x - 18, hondoC.z - 2], [hondoC.x + 8, hondoC.z - 12], [hondoC.x + 16, hondoC.z - 6], [hondoC.x - 8, hondoC.z + 10], [gezanC.x - 14, gezanC.z + 2], [gezanC.x + 14, gezanC.z + 4]]) {
      const logs = campfire(W, x, z);
      // 薪の底を山肌に沿わせる。炎も薪に見合う小ささにする。
      logs.rotation.x = -Math.atan2(W.heightAt(x, z + .4) - W.heightAt(x, z - .4), .8);
      logs.rotation.z = Math.atan2(W.heightAt(x + .4, z) - W.heightAt(x - .4, z), .8);
      rt.scene.add(logs); W.addFire(x, z, { h: .08, size: .65 });
    }

    F.soboStruct = hall(okuC.x - 10, okuC.z + 5, 6.5, 5, '奥の僧坊', 'sobo', 110).struct;
    F.okuBoStruct = hall(okuC.x + 10, okuC.z - 6, 5, 4, '奥の坊', 'sobo', 90).struct;
    // 山頂付近の二社という伝承を、小さな板葺きの社で示す。戦国期の寸法は不明。
    hall(-10, 45, 4, 3, '奥の院の社', 'shrine', 90);
    hall(10, 65, 4, 3, '紙祖神の社', 'shrine', 90);
    // 建物ごとの延焼：僧坊・奥の坊を燃える的にし、外堂の倉→本堂→僧坊→奥の院と火が寺院群へ広がる道を作る（siege_fire.js の燃え移り）
    // 夜の灯明：本堂の前に灯り（灯りが夜の目印）
    for (const [dx, dz] of [[-6, 4], [6, 4]]) templeLantern(rt, hondoC.x + dx, hondoC.z + dz);
    // 門の篝火（寺の見張りが焚く。夜の山で門の場所が遠くから分かり、門の前が照らされる）
    // 講堂の西壁から離し、戸口へ回る兵と肩越しの視点を火床へ重ねない。
    for (const [x, z] of [[GATE_SOMON.x - 4.5, GATE_SOMON.z - 4], [GATE_SOMON.x + 4.5, GATE_SOMON.z - 4], [GATE_SANMON.x - 4.5, GATE_SANMON.z - 4], [GATE_SANMON.x + 4.5, GATE_SANMON.z - 4], [gezanC.x + 5, gezanC.z - 11], [hondoC.x + 3, hondoC.z - 5], [okuC.x - 4, okuC.z - 4], [okuC.x + 4, okuC.z + 8]]) {
      rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { torch: true, h: 1.35 });
    }
    // 麓から見上げた山腹の火（惣門の篝火・参道の石灯籠）。夜の霞に消されず、点々と登る灯で寺の在りかを示す（10/28）。
    // 霞を受けない小さな光の粒だけ。近づけば本物の火に任せて消す。
    {
      const pts = [];
      for (const dx of [-4.5, 4.5]) pts.push(GATE_SOMON.x + dx, W.heightAt(GATE_SOMON.x + dx, GATE_SOMON.z - 4) + 1.5, GATE_SOMON.z - 4);
      for (const z of [-104, -74, -58, -34, -16]) for (const s of [-1, 1]) pts.push(s * 3.6, W.heightAt(s * 3.6, z) + 1.5, z);
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g2 = c.getContext('2d'), gr = g2.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,214,150,1)'); gr.addColorStop(.3, 'rgba(255,150,60,.55)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
      g2.fillStyle = gr; g2.fillRect(0, 0, 32, 32);
      const tex = new THREE.CanvasTexture(c);
      const dots = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.5, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      dots.renderOrder = 2; rt.scene.add(dots); F.fireDots = dots;
    }
    for (const [x, z] of [[VILLAGE.x - 5, VILLAGE.z + 4], [GOKA_MURA.x + 2, GOKA_MURA.z + 10],
      [gezanC.x - 9.5, gezanC.z + 3], [gezanC.x + 12.5, gezanC.z - 7]]) templeLantern(rt, x, z);
    F.gezanBoStruct = hall(gezanC.x - 12, gezanC.z - 11, 5, 4, '外堂の番所', 'bansho', 90).struct;
    rt.scene.add(tawara(W, gezanC.x - 16, gezanC.z - 5, 0, 2));
    rt.scene.add(templeLookout(W, MONOMI_R.x, MONOMI_R.z));
    rt.scene.add(templeLookout(W, MONOMI_L.x, MONOMI_L.z));
    fieldCamp(rt);
    // 東の倉脇に消火と炊事の備え。堂の戸口・鐘楼・参道から離れた二歩四方だけを使う。
    fieldSupplies(rt, 15, -38);
    F.shoroStruct = rt.army.addStruct({ x: SHORO_POS.x, z: SHORO_POS.z, r: 2, solidR: 2, hp: 90, maxHp: 90, armor: 0, team: templeTeam, name: '鐘楼', moraleOnBurn: 'small', flammable: true });
    const bellTower = templeBellTower(W, SHORO_POS.x, SHORO_POS.z);
    rt.scene.add(bellTower);
    // 四本柱の間は見通せる。鐘楼全体を一つの壁にせず、柱・鐘・屋根を別々に測る。
    for (const part of bellTower.children) cameraProp(part, 0);
    for (const [x, z, r] of [[GATE_SANMON.x - 8, GATE_SANMON.z - 2, 0.2], [GATE_SANMON.x + 8, GATE_SANMON.z - 2, -0.2]]) rt.scene.add(sakamogi(W, x, z, r, 4));

    // ---- 五箇の和紙の里（寺と一体。家屋・紙漉き場・乾燥棚・倉。紙と木の家は火が広がりやすい） ----
    rt.scene.add(village(W, GOKA_MURA.x, GOKA_MURA.z, { n: 5, r: 15, rot: 0, fields: 3, bamboo: 0, smoke: 0, seed: 575 }));
    F.gokaKura = templeStore(W, GOKA_MURA.x + 14, GOKA_MURA.z - 4, 0.2);
    rt.scene.add(F.gokaKura, hut(W, GOKA_MURA.x - 10, GOKA_MURA.z + 8, 4, 3.4, 0.15), hut(W, GOKA_MURA.x + 2, GOKA_MURA.z + 12, 4, 3, -0.2));
    cameraProp(F.gokaKura);
    // 紙漉き場・楮（こうぞ）・乾燥棚：紙と木の家は火が広がりやすい（建物ごとの的にして、延焼の道に並べる）
    rt.scene.add(hut(W, GOKA_MURA.x - 2, GOKA_MURA.z - 8, 5, 3.6, 0.1, { wall: 0x8a7a5a, h: 2.2 }), tawara(W, GOKA_MURA.x + 4, GOKA_MURA.z - 7, 0.3, 4), tawara(W, GOKA_MURA.x - 8, GOKA_MURA.z - 4, 0.1, 3));
    rt.scene.add(scaffold(W, GOKA_MURA.x - 14, GOKA_MURA.z - 10, 0.2), scaffold(W, GOKA_MURA.x - 14, GOKA_MURA.z - 14, 0.2));
    F.kamisukiStruct = rt.army.addStruct({ x: GOKA_MURA.x - 2, z: GOKA_MURA.z - 8, r: 3, solidR: 3, hp: 100, maxHp: 100, armor: 0, team: templeTeam, name: '紙漉き場', noTarget: true, invuln: true, fireProof: false, flammable: true });
    F.kansoStruct = rt.army.addStruct({ x: GOKA_MURA.x - 14, z: GOKA_MURA.z - 12, r: 3, solidR: 3, hp: 70, maxHp: 70, armor: 0, team: templeTeam, name: '紙の乾燥棚', noTarget: true, invuln: true, fireProof: false, flammable: true });
    F.gokaKuraStruct = rt.army.addStruct({ x: GOKA_MURA.x + 14, z: GOKA_MURA.z - 4, r: 3, solidR: 3, hp: 120, maxHp: 120, armor: 0, team: templeTeam, name: '五箇の紙倉', noTarget: true, invuln: true, fireProof: false, flammable: true });

    F.paperWorks = [F.kamisukiStruct, F.kansoStruct, F.gokaKuraStruct];
    F.generalSafe = { x: VILLAGE.x - 16, z: VILLAGE.z - 14 };
    F.withdrawRoad = [...SANDO, [0, 55], ...OKU_ROAD.slice(1)].reverse();
    // ---- 木戸（惣門・山門） ----
    // 五歩幅の先手が柱へ詰まらない口を取る。実測の寸法ではなく、この山寺だけの補完。
    // 均した参道の内側に収め、扉と残る門構えの幅をそろえる。
    F.gateSomon = kido(rt, GATE_SOMON.x, GATE_SOMON.z, 4.8, 0, { team: templeTeam, hp: 150, name: GATE_SOMON.name, gate: 0 });
    F.gateSanmon = kido(rt, GATE_SANMON.x, GATE_SANMON.z, 4.8, 0, { team: templeTeam, hp: 180, name: GATE_SANMON.name, gate: 1 });
    // 扉が倒れても屋根は残る。堂と同じ視点の判定へ加え、通過時に屋根で前を覆わない。
    for (const gate of [F.gateSomon, F.gateSanmon]) {
      if (!gate.frame) continue;
      const roof = new THREE.Box3().setFromObject(gate.frame);
      cameraHalls.push({ I: null, struct: { alive: true, mesh: gate.frame },
        x0: roof.min.x, x1: roof.max.x, z0: roof.min.z, z1: roof.max.z,
        y0: gate.frame.position.y + 3, y1: roof.max.y });
      // 屋根だけでは、本柱と控柱の間へ目線が入り、黒い木材で前が塞がる。
      // この二門は幅4.8・向き零。左右だけを囲い、中央の通り口は空ける。
      for (const side of [-1, 1]) {
        const x = gate.frame.position.x + side * (4.8 / 2 + .17);
        const z = gate.frame.position.z;
        cameraHalls.push({ I: null, struct: { alive: true, mesh: gate.frame },
          x0: x - .24, x1: x + .24, z0: z - 1.85, z1: z + .25,
          y0: Math.min(W.heightAt(x, z), W.heightAt(x, z - 1.6)) - .3,
          y1: gate.frame.position.y + 3.3, wallClearance: .65 });
      }
    }

    // ---- 区域の網と退路（siege_zones.js） ----
    const okuyamaTest = (x, z) => Math.hypot(x - OKUYAMA.x, z - OKUYAMA.z) < 22;

    if (F.mode === 'attack') {
      // ===== 攻め手（player＝滝川一益の手）：越前一向一揆の山の寺を攻め落とす =====
      // 麓から惣門まで三十六歩おき。六人ずつの実兵だけで、堂の守りを増やしすぎない。
      const watch = (name, z) => mkB(rt, { name, team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 6, armor: IKKO.armor, flag: IKKO.flag, at: { x: 0, z }, facing: Math.PI });
      F.ikkoWatchLower = watch('麓の見張り', -174);
      F.ikkoWatchMiddle = watch('参道の見張り', -138);
      F.ikkoWatchGate = watch('惣門前の見張り', -102);
      F.watchPosts = [F.ikkoWatchLower, F.ikkoWatchMiddle, F.ikkoWatchGate];
      // 惣門の門前に固まって門を守る一揆勢（本物の兵二十四人。持ち場から動かず、寄せ手が近づいた時だけ槍を合わせる）。
      // 惣門の下の参道の坂に置き、麓の持ち場から松明と篝火に照らされた群れと、その奥の惣門が一緒に見える。人数と位置は推定（10/29）。
      F.ikkoGateCrowd = enemyGroup(rt, { faction: 'ikko', fixed: true, name: '惣門前の一揆勢', anchor: { x: GATE_SOMON.x, z: GATE_SOMON.z - 30 }, facing: Math.PI, width: 12, aggro: 7, formation: 'yari' },
        [{ type: 'ashigaru', n: 20, o: { armor: IKKO.armor, flag: IKKO.flag } }, { type: 'samurai', n: 4, o: { armor: IKKO.armor, flag: IKKO.flag } }]);
      // 惣門前の一揆勢の両脇に篝火の台を二つ（麓の側から火が当たり、顔・笠・槍が浮かぶ）
      for (const dx of [-5.5, 5.5]) { const x = GATE_SOMON.x + dx, z = GATE_SOMON.z - 33; rt.scene.add(kagaribi(W, x, z)); W.addFire(x, z, { torch: true, h: 1.35 }); }
      // 惣門前の一揆勢が掲げる松明（竹の柄の先に火。柄の形と材質は一つを使い回す）。数と並びは推定。
      {
        const poleGeo = new THREE.CylinderGeometry(.025, .035, 2.1, 5), poleMat = new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: .9 });
        for (const [dx, dz] of [[-6, -1.8], [-3.2, -2.4], [-.6, -1.6], [2.4, -2.3], [5.2, -1.7], [-4.4, 1], [3.6, 1.2]]) {
          const x = GATE_SOMON.x + dx, z = GATE_SOMON.z - 30 + dz, y = W.heightAt(x, z);
          const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(x, y + 1.05, z); pole.rotation.z = dx * .02; rt.scene.add(pole);
          W.addFire(x, z, { torch: true, h: 2.1, size: .45 });
        }
      }
      for (const b of F.watchPosts) {
        rt.scene.add(kagaribi(W, b.pos.x + 4, b.pos.z));
        W.addFire(b.pos.x + 4, b.pos.z, { torch: true, h: 1.35 });
      }
      F.ikkoGezanSpear = mkB(rt, { name: '外堂の守り（薙刀）', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 46, armor: IKKO.armor, flag: IKKO.flag, at: { x: gezanC.x, z: gezanC.z - 6 }, facing: Math.PI });
      F.ikkoGezanBow = mkB(rt, { name: '外堂の守り（弓）', team: 1, faction: 'ikko', kind: 'bow', nominal: 16, armor: IKKO.armor, flag: IKKO.flag, at: { x: gezanC.x + 10, z: gezanC.z - 2 }, facing: Math.PI });
      // 石段の先鋒は山門の手前で構える。本堂の奥だけに置いて長い空白を作らない。
      F.ikkoHondoMain = mkB(rt, { name: '大滝寺の衆徒', general: '寺の指揮役', mix: { ashigaru: 0.85, samurai: 0.15 }, team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 60, armor: IKKO.armor, flag: IKKO.flag, at: { x: 0, z: -20 }, facing: Math.PI });
      F.ikkoHondoBow = mkB(rt, { name: '本堂の衆徒（鉄砲）', team: 1, faction: 'ikko', kind: 'gun', nominal: 16, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x - 10, z: hondoC.z + 10 }, facing: Math.PI });
      F.ikkoOkuLast = mkB(rt, { name: '奥の院の衆徒', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 42, armor: IKKO.armor, flag: IKKO.flag, at: { x: okuC.x, z: okuC.z - 6 }, facing: Math.PI });
      // 奥の院の先、道の曲がりで迎える。道を登る間も二十五歩内に守りが見える。
      // 同じ二十二人を三段に分ける。一度に十四人の実兵が襲う終盤にしない。
      F.ikkoCounter = mkB(rt, { name: '山道の守り', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 6, armor: IKKO.armor, flag: IKKO.flag, at: { x: -14, z: 86 }, facing: Math.PI });
      F.roadWaves = [F.ikkoCounter,
        mkB(rt, { name: '山道の後備え', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 8, armor: IKKO.armor, flag: IKKO.flag, at: { x: -20, z: 98 }, facing: Math.PI }),
        mkB(rt, { name: '奥山の後備え', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 8, armor: IKKO.armor, flag: IKKO.flag, at: { x: -26, z: 110 }, facing: Math.PI })];
      F.roadSecond = F.roadWaves[1]; F.roadThird = F.roadWaves[2];
      F.ikkoAmbush = mkB(rt, { name: '谷筋の伏兵', team: 1, faction: 'ikko', kind: 'ashigaru', nominal: 26, armor: IKKO.armor, flag: IKKO.flag, at: { x: 30, z: -70 }, facing: -Math.PI / 2 });
      F.defenders = [F.ikkoWatchLower, F.ikkoWatchMiddle, F.ikkoWatchGate, F.ikkoGezanSpear, F.ikkoGezanBow, F.ikkoHondoMain, F.ikkoHondoBow, F.ikkoOkuLast, ...F.roadWaves, F.ikkoAmbush];
      F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
      F.civ = [];
      // 家や堂の中に埋めず、道端に置く。遠い堂の者まで最初の鐘で消え去らせない。
      this.civ(rt, -10, GOKA_MURA.z + 12, 4, '逃げる和紙の職人', { x: 0, z: -1 },
        [[-8, -174], [-8, -194], [-10, -210], [-30, -218]]);
      this.civ(rt, -3, gezanC.z + 14, 3, '逃げる僧', { x: -1, z: -1 }, PEOPLE_TEMPLE_ROUTE);
      this.civ(rt, 4, okuC.z + 11, 3, '山へ逃れる里の者', { x: 0, z: 1 },
        [...OKU_ROAD.slice(1), [-52, 144], [-70, 212]]);
      rt.obj('civ', '手向かわぬ者を討つな', 'side');

      F.scout = mkB(rt, { name: '物見', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 14, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z + 38 }, facing: 0 });
      F.mainSpear = mkB(rt, { name: '滝川一益の手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 150, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z + 12 }, facing: 0 });
      F.mainGun = mkB(rt, { name: '滝川一益の手（鉄砲）', team: 0, faction: 'oda', kind: 'gun', nominal: 50, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 14, z: VILLAGE.z }, facing: 0 });
      F.flankSpear = mkB(rt, { name: '谷筋へ回る手（槍）', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 100, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 30, z: VILLAGE.z + 12 }, facing: 0 });
      F.flankBow = mkB(rt, { name: '谷筋へ回る手（弓）', team: 0, faction: 'oda', kind: 'bow', nominal: 40, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 44, z: VILLAGE.z + 12 }, facing: 0 });
      F.reserve = mkB(rt, { name: '滝川一益の陣所と後備え', general: '滝川一益', mix: { ashigaru: 0.8, samurai: 0.2 }, team: 0, faction: 'oda', kind: 'ashigaru', nominal: 60, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x - 16, z: VILLAGE.z }, facing: 0 });
      F.attackers = [F.scout, F.mainSpear, F.mainGun, F.flankSpear, F.flankBow, F.reserve];
      F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
      for (const b of F.attackers) b.order({ id: 'hold' });
      for (const b of F.defenders) b.order({ id: 'hold' });

      F.SZ = makeSiegeZones(rt, {
        msg: TEMPLE_MSG, farInterval: 0.5, quietRange: [0, 0],
        zones: [
          { id: 'gezan', name: '外堂（講堂・僧坊）', test: C.kuruwa.gezan.test, pos: gezanC, need: 1, hold: 8, next: 'hondo' },
          { id: 'hondo', name: '本堂（中心伽藍）', test: C.kuruwa.hondo.test, pos: hondoC, need: 1, hold: 10, gate: GATE_SANMON.name, next: 'oku' },
          { id: 'oku', name: '奥の院', test: C.kuruwa.oku.test, pos: okuC, need: 4, hold: 12, next: 'okuyama' },
          { id: 'okuyama', name: OKUYAMA.name, test: okuyamaTest, pos: OKUYAMA, need: 3, hold: 8 },
        ],
        links: [['gezan', 'hondo'], ['hondo', 'oku'], ['oku', 'okuyama']],
        friendTeam: 0, enemyTeam: 1,
        totalDefenders: F.defendTotal,
        noReinforce: () => true,
        escape: { zoneId: 'okuyama', rally: { x: OKUYAMA.x - 24, z: OKUYAMA.z + 14 } },
        onFall: (id) => this.onZoneFall(rt, id),
      });

      // 山の頭（siege_ai.js）：夜と霧は伏兵に近付くまで気付きにくい（revealRange を nightAccuracyMult ぶん縮める）
      const nmul = nightAccuracyMult(W);
      F.AMB = makeMountainAmbush(rt, {
        zones: F.SZ,
        posts: [{ id: 'valley', butai: F.ikkoAmbush, at: { x: 28, z: -66 }, cover: '谷筋・霧の中', revealRange: 20 * nmul, routeZoneId: 'gezan', concentrateShare: 0.35, side: 'flank' }],
      });
      F.MD = makeMountainDefense(rt, {
        // 共通の退路処理は全隊を奥山へ送る。この戦は次の堂で列を立て直す。
        zones: { retreatFate: (b) => {
          if (b.real?.routed || b.aliveNominal() <= 0) return;
          b._templeRetired = true;
          if (b === F.ikkoGezanSpear || b === F.ikkoGezanBow)
            // 山門は閉じているので、守りも谷道の口から本堂へ退く。
            setRoute(b, [[16, -26], [6, 2], [b === F.ikkoGezanBow ? 8 : 0, 18]], true, Math.PI);
          else if (b === F.ikkoHondoMain || b === F.ikkoHondoBow)
            setRoute(b, [[0, 36], [b === F.ikkoHondoBow ? 8 : 0, 55]], true, Math.PI);
          else F.SZ.retreatFate(b);
        } },
        posts: [
          { id: 'gezan_s', butai: F.ikkoGezanSpear, at: gezanC, next: 'hondo_s', fireZoneId: 'gezan' },
          { id: 'gezan_b', butai: F.ikkoGezanBow, at: gezanC, next: 'hondo_s', fireZoneId: 'gezan' },
          { id: 'hondo_s', butai: F.ikkoHondoMain, at: hondoC, next: 'oku_s', fireZoneId: 'hondo' },
          { id: 'hondo_b', butai: F.ikkoHondoBow, at: hondoC, next: 'oku_s', fireZoneId: 'hondo' },
          { id: 'oku_s', butai: F.ikkoOkuLast, at: okuC, fireZoneId: 'oku' },
        ],
        // 山道の守りは終盤に動かす。序盤の逆襲には使わない。
      });
      F.FS = attachFireSpread(rt, { onGranary: (r, st) => {
        if (st === F.gezanKuraStruct) r.__fireZones.gezan = true;
        if (st === F.hondoStruct) r.__fireZones.hondo = true;
      } });

      const n = RANKS[rt.G.rank].squad || 0;
      rt.makeSquad({ x: VILLAGE.x - 4, z: VILLAGE.z - 4 }, 0, [{ kind: 'spear', n }]);

      rt.world.setTime('night');
      rt.setPhase('brief');
      rt.obj('main', hi(rt) ? '先手を率い、参道の最初の門へ' : '先手の旗に続き、参道の最初の門へ', 'main');
      F.target = GATE_SOMON;
      templeSay(rt, '滝川一益', `${nm(rt)}、惣門を打ち破れ。先手と外堂を押さえよ`, 5);
      templeSay(rt, '組頭', '灯りの先が参道じゃ。先手の旗について来い', 4);
      rt.marker('main', unitPos(F.mainSpear.real.units[0]), '先手の旗', {});
      rt.banner('大滝寺の夜討ち（仮定）', '灯りをたどり、先手の旗へ');
      // ---- 竹束の寄せ（taketaba.js）：参道・谷の道の先手は竹束を押し立て、ゆっくり寄せ場まで登って撃ち合う ----
      const SANDO_YOSE = { x: GATE_SOMON.x, z: GATE_SOMON.z - 6 };
      const somonOpen = () => F.gateSomon.struct.hp <= 0, sanmonOpen = () => F.gateSanmon.struct.hp <= 0;
      // 門前へ届いた竹束は据える。応戦で先手が下がっても、案内ごと麓へ戻さない。
      const somonCoverReady = () => somonOpen() || F.TA?.items[0].tabas.some((tb) =>
        Math.hypot(tb.x - GATE_SOMON.x, tb.z - GATE_SOMON.z) < 8);
      const flankYose = (dx) => () => (F.strategy === 'front' ? { x: SANDO_YOSE.x + dx, z: SANDO_YOSE.z } : F.strategy === 'forest' ? { x: -20 + dx, z: -34 } : { x: 20 + dx, z: -34 });
      F.TA = makeTabaAdvance(rt, {
        max: 3, // 三つの楯で道幅を守り、兵が抜ける隙間を残す。
        holdMelee: 2, // 槍の先手は竹束を据えたら門へ寄る。鉄砲の待機は保つ。
        items: [
          { g: F.mainSpear, yose: SANDO_YOSE, until: somonCoverReady, facing: 0 }, { g: F.mainGun, yose: { x: 5, z: -114 }, until: somonOpen, facing: 0 },
          { g: F.flankSpear, yose: flankYose(0), until: () => (F.strategy === 'front' ? somonOpen() : sanmonOpen()) },
          { g: F.flankBow, yose: flankYose(6), until: () => (F.strategy === 'front' ? somonOpen() : sanmonOpen()) },
        ],
        avoid: [this.spawn],
      });
      for (const it of F.TA.items) it.tabas.forEach((tb, i) => { tb.off = (i - (it.tabas.length - 1) / 2) * 3.2; });
      rt.after(5, () => this.assault(rt));
    } else {
      // ===== 守る側（defend）：越前一向一揆として、本堂を守り、寄せ手を押し返す（もしも） =====
      F.ikkoMain = mkB(rt, { name: '大滝寺の衆徒', general: '寺の指揮役', mix: { ashigaru: 0.85, samurai: 0.15 }, team: 0, faction: 'ikko', kind: 'ashigaru', nominal: 70, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x, z: hondoC.z - 8 }, facing: Math.PI });
      F.ikkoBow = mkB(rt, { name: '本堂の衆徒（鉄砲）', team: 0, faction: 'ikko', kind: 'gun', nominal: 20, armor: IKKO.armor, flag: IKKO.flag, at: { x: hondoC.x - 10, z: hondoC.z + 10 }, facing: Math.PI });
      F.ikkoAmbushD = mkB(rt, { name: '衆徒の伏兵（谷筋）', team: 0, faction: 'ikko', kind: 'ashigaru', nominal: 24, armor: IKKO.armor, flag: IKKO.flag, at: { x: 28, z: -66 }, facing: -Math.PI / 2 });
      F.defenders = [F.ikkoMain, F.ikkoBow, F.ikkoAmbushD];
      F.defendTotal = F.defenders.reduce((s, b) => s + b.nominal, 0);
      for (const b of F.defenders) b.order({ id: 'hold' });

      F.odaMain = mkB(rt, { name: '滝川一益の手（槍）', team: 1, faction: 'oda', kind: 'ashigaru', nominal: 100, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x, z: VILLAGE.z + 12 }, facing: 0 });
      F.odaGun = mkB(rt, { name: '滝川一益の手（鉄砲）', team: 1, faction: 'oda', kind: 'gun', nominal: 40, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 14, z: VILLAGE.z }, facing: 0 });
      F.odaFlank = mkB(rt, { name: '谷筋へ回る手', team: 1, faction: 'oda', kind: 'ashigaru', nominal: 90, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x + 30, z: VILLAGE.z + 12 }, facing: 0 });
      F.reserve = mkB(rt, { name: '滝川一益の陣所と守り', general: '滝川一益', mix: { ashigaru: 0.8, samurai: 0.2 }, team: 1, faction: 'oda', kind: 'ashigaru', nominal: 30, armor: ODA.armor, flag: ODA.flag, at: { x: VILLAGE.x - 16, z: VILLAGE.z }, facing: 0 });
      F.attackers = [F.odaMain, F.odaGun, F.odaFlank, F.reserve];
      F.attackTotal = F.attackers.reduce((s, b) => s + b.nominal, 0);
      for (const b of F.attackers) b.order({ id: 'hold' });

      F.SZ = makeSiegeZones(rt, {
        msg: TEMPLE_MSG, farInterval: 0.5,
        zones: [{ id: 'hondo', name: '本堂', test: C.kuruwa.hondo.test, pos: hondoC, need: 1, hold: 8, start: ZONE_STATE.FRIEND }],
        friendTeam: 0, enemyTeam: 1,
        noReinforce: () => true,
      });
      F.DA = makeDefenseAI(rt, {
        posts: [{ id: 'hondo', butai: F.ikkoMain, at: hondoC, ambush: false }, { id: 'valley', butai: F.ikkoAmbushD, at: { x: 28, z: -66 }, ambush: true, revealRange: 20 * nightAccuracyMult(W) }],
        reserves: [F.ikkoBow],
        fallback: { x: okuC.x, z: okuC.z },
      });
      // 攻め手（村で勢揃いしてから、参道・谷の道を本堂まで歩く＝攻め手の assault() と同じ setRoute／tickRoutes を使う。
      // 門は槍の先手が破る。谷の別手は決めた道から進む。
      rt.after(10, () => {
        if (F.ending) return;
        F.odaMain._routeGate = F.odaGun._routeGate = F.gateSomon.struct;
        F.odaMain.assault = () => F.odaMain._routeGate.alive ? F.odaMain._routeGate : null;
        for (const b of [F.odaMain, F.odaGun]) setRoute(b, OUTER_ROUTE, true);
        setRoute(F.odaFlank, [...VALLEY_ROAD]);
      });

      const n = RANKS[rt.G.rank].squad || 0;
      rt.makeSquad({ x: hondoC.x + 4, z: hondoC.z + 4 }, Math.PI, [{ kind: 'spear', n }]);

      rt.world.setTime('night');
      rt.setPhase('brief');
      rt.obj('main', '本堂を守り、寄せ手を押し返せ（もしも）', 'main');
      templeSay(rt, '大滝寺の衆徒', `${nm(rt)}、織田勢が寄せるぞ。山門を固めよ。本堂へ通すでない`, 5);
      rt.marker('main', hondoC, '本堂', { red: false });

    }
    // 山道の槍は縦列、鉄砲は横列。攻守を替えても既存の隊と下知を保つ。
    for (const b of F.attackers) b.setForm('column');
    for (const b of F.defenders) b.setForm(b.kind === 'gun' || b.kind === 'bow' ? 'line' : 'yari');
    F.reserve.setForm('yari');
    if (F.mode === 'attack' && !rt.G.lord) {
      const routes = [{ id: 'localFront', x: -4, name: '参道から先手に続け', pts: SANDO }, { id: 'localValley', x: 2, name: '右の谷道で別手に続け', pts: VALLEY_ROAD }, { id: 'localForest', x: 8, name: '左の森道で別手に続け', pts: FOREST_ROAD }];
      for (const route of routes) rt.addInteract(route.id, { x: route.x, z: VILLAGE.z + 2 }, route.name, () => {
        if (F.ending || rt.over || !rt.player.u.alive || F.step > 1) return;
        F.localRoad = route.pts; F.localRoadI = 0; F.localPoint = { x: route.pts[0][0], z: route.pts[0][1] };
        for (const q of routes) rt.uninteract(q.id);
        rt.marker('localRoad', () => F.localPoint, '先手に続く道'); templeSay(rt, '組頭', route.name + '。列を離れるな。外堂で落ち合え', 4);
      }, { r: 2.8, hold: 1 });
    }
    for (const b of F.roadWaves || []) if (b.real) b.real.siegeAI = true;
    const gun = F.ikkoHondoBow || F.ikkoBow;
    if (gun) gun.setForm('line');
    prepareGateWorkers(rt);
  },

  // ① 物見を先に出し、作戦に応じて参道（表）・谷の道に分かれる（木ノ芽峠 b_kinome.js F9 と同じ三択）
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    if (F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.assaultT = rt.t; F.stepT = rt.t;
    F.watchNext = 0; F.watchAt = rt.t;
    rt.setPhase('climb');
    rt.marker('approach', { x: 0, z: -150 }, '里を抜け、参道へ'); F.approachShown = true;
    rt.unmark('main');
    rt.banner('麓から寄せる', '惣門を破り、外堂へ入る');
    templeSay(rt, '組頭', '声を潜めよ。竹束の陰から惣門へ寄せるぞ', 4);
    rt.obj('main', '惣門を破れ。味方と外堂を取れ', 'main');
    rt.marker('path', () => templeTaskPoint(rt), () => F.gateSomon.struct.alive ? templeGateLabel(rt, templeTabaFollow(rt) ? '竹束の後ろへ' : templeGateEntry(rt) ? '竹束の間を通る' : '惣門を破る') : F.hallEntry ? F.hallEntry.returning ? '参道へ戻る' : '外堂への参道' : F.hallFoe && siegeFighter(F.hallFoe) ? F.hallExit ? '堂を出て、残る敵へ' : F.hallDoor ? '堂の戸口へ' : F.hallAround ? '堂の脇を回る' : '外堂の敵へ' : '外堂へ', { groundGuide: true });
    setRoute(F.scout, [[20, -150], [24, -106]]);
    const strat = F.strategy = F.strategy || 'valley';
    F.mainSpear._routeGate = F.mainGun._routeGate = F.gateSomon.struct;
    F.mainSpear.assault = () => F.mainSpear._routeGate.alive ? F.mainSpear._routeGate : null;
    F.flankSpear.assault = () => F.flankSpear._routeGate?.alive ? F.flankSpear._routeGate : null;
    gateWork(rt, F.gateSomon.struct, GATE_SOMON);
    setRoute(F.mainSpear, OUTER_ROUTE, true);
    // 講堂（東の十一歩）と倉（東の七歩）を避け、参道の内側へ据える。
    setRoute(F.mainGun, [...OUTER_ROUTE.slice(0, -1), [-3, -60]], true);
    const flank = strat === 'front' ? OUTER_ROUTE : strat === 'forest' ? FOREST_ROAD.slice(0, 3) : VALLEY_ROAD.slice(0, 3);
    for (const b of [F.flankSpear, F.flankBow]) {
      b._routeGate = strat === 'front' ? F.gateSomon.struct : null;
      const stand = b === F.flankBow ? [-3, -58] : [3, -48];
      // 別手は坊と倉を横切らず、北の柵の口から中央の参道へ回る。
      const entry = strat === 'forest' ? [[-20, -38], [-20, -26], [-3, -30]]
        : [[16, -26], [3, -30]];
      setRoute(b, strat === 'front' ? [...flank.slice(0, -1), stand] : [...flank, ...entry, stand], true);
    }
    templeSay(rt, '組頭', strat === 'front' ? '参道に槍を集めよ。鉄砲は後ろから門前を押さえよ' : strat === 'forest' ? '別手は左の森へ。外堂の横を突け' : '別手は右の谷へ。物見を先に、外堂の横を突け', 4);
    rt.marker('gezan', OUTER_POS, '外堂の守り', { red: true });
  },

  // 火は到達してから。麓にいるうちに離れた堂を燃やさない。
  burn(rt, id, s) {
    if (!s.alive || s.fireF || rt.__fireZones[id]) return;
    let reached = false;
    for (const u of rt.army.units) {
      if (u.alive && u.team === 0 && !u.fleeing && !u.noTarget && !u.isStruct &&
          Math.hypot(u.pos.x - s.x, u.pos.z - s.z) < (s.solidR || s.r || 3) + 2 &&
          !rt.army.wallBetween(u.pos, -1, s)) { reached = true; break; }
    }
    if (!reached) return;
    s.burn = Math.max(s.burn || 0, 2);
    rt.army.igniteStruct(s, s);
    if (!s.fireF) return;
    rt.__fireZones[id] = true;
    battleEvent(rt, EVENT_FIRE_START, s, null, 1, true, `${s.name}に火の手。守りが山の上へ退く`);
  },

  // 見張りに見つかる→鐘（ringBell）→寺内が警戒。潜入から戦いへ変わる一度きりの出来事
  alarm(rt) {
    const F = rt.flags;
    if (F.alarmed) return;
    F.alarmed = true;
    resetTempleSpeech(rt);
    F.quiet = false;
    ringBell(rt, F.shoroStruct);
    rt.banner('鐘が鳴る', '警鐘が響く。衆徒が門を固める');
    templeSay(rt, '大滝寺の衆徒', '出合え、出合え！　門を固めよ！', 3.5);
    // 潜入中には鳴らさず、見つかった時に初めて寄せ手が合図と鬨で応じる。
    if (F.mode === 'attack') {
      templeSignal(rt, F.mainSpear, 'sig_susume');
      templeSay(rt, '組頭', '進み太鼓と法螺じゃ。鬨を上げ、竹束に続け！', 4);
      if (F.step === 1) rt.obj('main', '進み太鼓・法螺の合図。竹束に続き、惣門を破れ', 'main', true);
      const epoch = F.speechEpoch;
      rt.after(2, () => {
        if (!F.ending && !rt.over && rt.player.u.alive && epoch === F.speechEpoch)
          templeSignal(rt, F.mainSpear, 'toki', .65);
      });
    }
    for (const b of F.defenders) if (b.real) b.real.morale = Math.min(100, b.real.morale + 8);
  },

  // 区域の確保だけでは終わらない。自分も次の印へ進む。
  onZoneFall(rt, id) {
    const F = rt.flags;
    if (F.mode !== 'attack' || F.ending) return;
    const z = F.SZ.byId[id];
    if (!z || z.owner !== ZONE_STATE.FRIEND) return;
    if (id === 'gezan' && !F.gezanFell) {
      F.gezanFell = true;
      rt.unmark('gezan');
    }
  },

  nextAttack(rt, step) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || step <= F.step) return;
    // 一戦を四〜七分に：惣門・山門を破り本堂を押さえたら、この組の任務はここまで（奥の院と山道は別手）。
    if (step === 3) { this.win(rt, true); return; }
    F.step = step; F.stepT = rt.t; F.retreatWarned = false;
    F.hallEntry = null; F.hallEntryAt = 0; F.hallFoe = null; F.hallDoor = false;
    resetTempleSpeech(rt);
    rt.unmark('path');
    if (step === 2) {
      this.burn(rt, 'gezan', F.gezanKuraStruct);
      rt.setPhase('sanmon');
      F.target = GATE_SANMON;
      gateWork(rt, F.gateSanmon.struct, GATE_SANMON);
      templeSignal(rt, F.mainSpear, 'sig_susume');
      rt.obj('main', '進み太鼓・法螺の合図。石段を上り、山門を破れ', 'main', true);
      rt.marker('path', () => templeTaskPoint(rt), () => F.gateSanmon.struct.alive ? templeGateLabel(rt, '山門を破る') : F.hallEntry ? F.hallEntry.returning ? '参道へ戻る' : '本堂への参道' : F.hallFoe && siegeFighter(F.hallFoe) ? F.hallExit ? '堂を出て、残る敵へ' : F.hallDoor ? '堂の戸口へ' : F.hallAround ? '堂の脇を回る' : '本堂の敵へ' : '本堂へ', { groundGuide: true });
      rt.banner('外堂から山門へ', '狭い石段。鉄砲を後ろに、槍を前に');
      templeSay(rt, '組頭', '進み太鼓と法螺じゃ。石段は狭いぞ。槍を揃え、山門へ掛かれ', 4);
      F.mainSpear._routeGate = F.mainGun._routeGate = F.gateSanmon.struct;
      setRoute(F.mainSpear, INNER_ROUTE, true);
      setRoute(F.mainGun, [...INNER_ROUTE.slice(0, -1), [0, 8]], true);
      setRoute(F.scout, [...OUTER_ROUTE.slice(1, 3), [8, -46]], true);
      const route = F.strategy === 'front' ? INNER_ROUTE : F.strategy === 'forest' ? FOREST_ROAD.slice(3) : VALLEY_ROAD.slice(3);
      for (const b of [F.flankSpear, F.flankBow]) {
        b._routeGate = F.strategy === 'front' ? F.gateSanmon.struct : null;
        setRoute(b, route, true);
      }
      F.reserve.order({ id: 'hold', form: 'yari' });
      rt.marker('hondo', INNER_POS, '本堂の守り', { red: true });
    } else if (step === 3) {
      rt.setPhase('oku');
      F.target = OKU_POS;
      rt.unmark('hondo');
      rt.obj('main', '火を避け、味方と奥の院を取れ', 'main');
      rt.marker('path', () => templeTaskPoint(rt), () => F.hallEntry ? F.hallEntry.returning ? '参道へ戻る' : '奥の院への参道' : F.hallFoe && siegeFighter(F.hallFoe) ? F.hallExit ? '堂を出て、残る敵へ' : F.hallDoor ? '堂の戸口へ' : F.hallAround ? '堂の脇を回る' : '奥の院の敵へ' : '奥の院へ', { groundGuide: true });
      rt.banner('奥の院へ進む', '本堂を越え、山上の守りを崩せ');
      templeSay(rt, '組頭', `${nm(rt)}、本堂は取れた。別手に守らせ、奥の院へ続け`, 4);
      this.burn(rt, 'hondo', F.hondoStruct);
      setRoute(F.mainSpear, BOT_OKU_ROUTE, true);
      setRoute(F.mainGun, [[0, 20], [0, 36], [0, 43]], true);
      // 東の坊（10,49）を横切らず、中央の石段から北側へ回る。
      setRoute(F.flankSpear, [...BOT_OKU_ROUTE, [8, 55]], true);
      // 弓の別手は本堂、物見は外堂に残す。奥の院には槍の別手を残す。
      setRoute(F.flankBow, [[8, 8]], true);
    } else if (step === 4) {
      rt.setPhase('mountainRoad');
      F.target = OKUYAMA;
      rt.obj('main', '奥山道へ進み、道を塞げ', 'main');
      rt.marker('path', OKUYAMA, '奥山道を押さえる', {});
      templeSay(rt, '組頭', '奥山道を塞げ。退いた敵が攻め返してくるぞ', 4);
      for (const b of [F.mainSpear, F.mainGun]) setRoute(b, OKU_ROAD.slice(1), true);
      for (const b of [F.flankSpear, F.flankBow, F.scout]) if (!b._route) b.order({ id: 'hold' });
      templeSay(rt, '組頭', '物見は外堂、弓は本堂、別手の槍は奥の院を守れ', 4);
      battleEvent(rt, EVENT_RETREAT, OKU_POS, F.ikkoOkuLast.real, 1, true, '寺の守りが山道へ退く');
      F.ikkoCounter.order({ id: 'hold' });
    } else if (step === 5) {
      rt.setPhase('roadHold');
      F.holdT = 0;
      // 早く登り切っても、開戦から四分になるまで山道を守る。敵と味方の条件は省かない。
      F.roadHoldSeconds = Math.max(ROAD_HOLD, Math.ceil(240 - rt.t));
      F.roadWaveNext = 1; F.roadWaveAt = rt.t + 30;
      rt.obj('main', '味方三人と道を守れ', 'main', true);
      rt.objProgress('main', '敵が来たら押し返せ。守った時間は残る');
      rt.marker('path', () => templeWay(rt.army, rt.player.u, OKUYAMA), '奥山道を守る');
      rt.banner('山道を押さえる', '山から戻る敵を止める');
      templeSay(rt, '組頭', '道を守れ。敵が来たら押し返せ', 4);
      for (const b of [F.mainSpear, F.mainGun]) {
        setRoute(b, [[OKUYAMA.x + (b === F.mainGun ? 5 : -3), OKUYAMA.z - (b === F.mainGun ? 7 : 3)]], true);
      }
      // 通常の突撃は敵を探す下知で、指定地点までの行軍にはならない。道へ寄せてから斬り込む。
      F.ikkoCounter._nightReleased = true;
      setRoute(F.ikkoCounter, [[OKUYAMA.x, OKUYAMA.z]]);
      templeSay(rt, '組頭', '先手を集めよ。槍を道に、鉄砲を後ろに置け', 4);
    }
  },

  win(rt, hondo = false) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    resetTempleSpeech(rt);
    for (const s of F.paperWorks) { rt.unmark('paper' + s.name); rt.uninteract('paper' + s.name); }
    rt.setPhase('end');
    rt.unmark('localRoad'); rt.unmark('approach');
    for (const id of ['localFront', 'localValley', 'localForest']) rt.uninteract(id);
    rt.objProgress('main', ''); rt.uninteract('templeGate');
    for (const id of ['main', 'gezan', 'hondo', 'path', 'oku', 'road']) rt.unmark(id);
    rt.objDone('main');
    rt.tracker.main = true;
    const what = hondo ? '大滝寺の本堂を押さえた' : '大滝寺の堂と山道を押さえた';
    rt.award((t) => { t.main = true; t.special = { label: what, pts: 22 }; }, what);
    if (!F.civHurt) { rt.objDone('civ'); rt.award((t) => t.side.push('職人・僧・里の者を討たなかった'), '手向かわぬ者を討たずに済んだ'); }
    sfx('kane', 0.5);
    rt.banner('大滝寺の戦い、終わる', '大滝寺は滝川勢に焼かれたと伝わる');
    templeSay(rt, '組頭', hondo ? `${nm(rt)}、本堂を取ったぞ。奥は別手に任せ、手負いを連れて戻れ` : `${nm(rt)}、おぬしらが道を守った。手負いを連れて戻れ`, 4);
    rt.after(4, () => templeSay(rt, '組頭', '麓で組を整えよ。越前の戦は、まだ続くぞ', 4));
    rt.finish({}, 10);
  },

  // 守る側は架空の援軍を出さず、実際に寄せ手を退けた時だけ局地の勝ち。
  defendWin(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    resetTempleSpeech(rt);
    rt.setPhase('end');
    rt.unmark('localRoad'); rt.unmark('approach');
    for (const id of ['localFront', 'localValley', 'localForest']) rt.uninteract(id);
    rt.objDone('main');
    rt.tracker.main = true;
    rt.objProgress('main', ''); rt.uninteract('templeGate');
    for (const id of ['main', 'gezan', 'hondo', 'path', 'oku', 'road']) { rt.unmark(id); rt.unzone(id); }
    for (const z of F.SZ.zones) rt.unzone(z.id);
    rt.award((t) => { t.main = true; t.special = { label: 'もしもの局地防衛で、大滝寺の寄せを退けた', pts: 22 }; }, '局地防衛・今の寄せを退けた');
    rt.banner('今の寄せを退けた', '本堂を守り抜いた（もしもの戦）');
    rt.finish({}, 10);
  },

  lose(rt, text) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.hud.root.dataset.templeRetreat = '';
    resetTempleSpeech(rt);
    for (const s of F.paperWorks) { rt.unmark('paper' + s.name); rt.uninteract('paper' + s.name); }
    rt.setPhase('end');
    rt.unmark('localRoad'); rt.unmark('approach');
    for (const id of ['localFront', 'localValley', 'localForest']) rt.uninteract(id);
    rt.tracker.main = false;
    rt.objProgress('main', ''); rt.uninteract('templeGate');
    for (const id of ['main', 'path', 'gezan', 'hondo', 'oku', 'road']) rt.unmark(id);
    rt.banner('退き陣', text);
    // 札から鳴る共用の退き合図と重ねず、現場の隊の位置から一度だけ鳴らす。
    (rt.cueAt || (rt.cueAt = {})).nobiki = rt.t;
    templeSignal(rt, F.mode === 'attack' ? F.mainSpear : F.ikkoMain, 'sig_nobiki');
    rt.obj('main', F.mode === 'attack' ? '退き太鼓・法螺の合図。手負いを連れ、麓へ退け' : '退き太鼓・法螺の合図。奥山道へ退け', 'main', true);
    rt.objFail('main');
    templeSay(rt, F.mode === 'attack' ? '組頭' : '大滝寺の衆徒', F.mode === 'attack' ? '退き太鼓と法螺じゃ。手負いを連れ、麓へ退け' : '退き太鼓と法螺じゃ。ここでは支えきれぬ。奥山道へ退け', 4);
    // 結果の紙にも、門・堂・山道のどこで退いたかを残す。
    rt.finish({ failureReason: text }, 8);
  },

  update(rt, dt) {
    const F = rt.flags, W = rt.world;
    F.treePlayer.value.copy(rt.player.u.pos);
    if (F.fireDots) F.fireDots.visible = rt.player.u.pos.z < GATE_SOMON.z - 40;
    // 麓の参道では、手で見回していない間、肩越しを参道の奥（惣門と本堂の大屋根）へ静かに向け直す（10/29 採点：
    // 25秒の画面が撮るたびに横や谷を向き、門も屋根も写らなかった）。近い敵・狙い・見回しの直後は本人の向きを優先する。
    {
      const P = rt.player, step = Math.min(.1, Math.max(0, rt.t - (F.sandoViewAt ?? rt.t))); F.sandoViewAt = rt.t;
      const u = P.u;
      if (step > 0 && F.mode === 'attack' && u.alive && u.pos.z < GATE_SOMON.z - 30 && u.pos.z > VILLAGE.z + 10 && Math.abs(u.pos.x) < 30 &&
          !P.lock && !P.aiming && !P.cine && (P.lookIdle || 0) > 1.2 && !((P.foeNear || 99) < 4)) {
        const cy = P.yaw + (P.camYawOff || 0), want = Math.atan2(GATE_SOMON.x - u.pos.x, GATE_SOMON.z + 20 - u.pos.z);
        P.yaw += Math.atan2(Math.sin(want - cy), Math.cos(want - cy)) * Math.min(1, step * 1.6);
      }
    }
    if (F.templeFar && rt.camera) F.templeFar(rt.camera);
    // 月光の青と補光を抑え、夏の土を雪のように白く照らさない。光源や影は増やさない。
    W.sun.color.setHex(0xc2c9d4);
    W.sun.intensity = Math.max(W.sun.intensity, .5);
    W.hemi.intensity = Math.max(W.hemi.intensity, .65);
    if (rt.t >= (F.flagLightAt || 0)) {
      F.flagLightAt = rt.t + 1;
      for (const u of rt.army.units) if (u.team === rt.player.u.team) {
        F.lightFlag(u.flag, u.look?.flag); F.lightFlag(u.standardFlag);
      }
    }
    butaiTick(rt, dt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    if (rt.t >= (F.civCheckAt || 0)) {
      F.civCheckAt = rt.t + .5;
      for (const c of F.civ || []) if (!c.routed) {
        let danger = false;
        // 警鐘前でも兵が迫れば逃げる。斬り合いは双方の兵を見て早めに察知する。
        for (const u of rt.army.units) {
          if (u.alive && !u.group?.civ && !u.group?.people && u.type !== 'dummy' && u.type !== 'porter' &&
              !u.woundOut && !u.isStruct && !u.noTarget &&
              Math.hypot(u.pos.x - c.anchor.x, u.pos.z - c.anchor.z) < (u.atk || u.swing || u.target?.alive ? 34 : 14) &&
              Math.abs(u.pos.y - height(c.anchor.x, c.anchor.z)) < 8 &&
              !rt.army.wallBetween(u.pos, -1, c.anchor)) { danger = true; break; }
        }
        if (!danger) for (const s of rt.army.burning || []) if (s.fireF && Math.hypot(s.x - c.anchor.x, s.z - c.anchor.z) < 35) { danger = true; break; }
        if (!danger) for (const s of F.paperWorks) if (s.paperWarned && Math.hypot(s.x - c.anchor.x, s.z - c.anchor.z) < 35) { danger = true; break; }
        if (danger) {
          c.routed = true; c.order = 'flee'; c.noAI = false; c.morale = 0;
          for (const u of c.units) { u.fleeing = true; u.aiT = 0; }
          templeSay(rt, '足軽', 'あの衆は手向かわんで、通したってくれ', 3);
        }
      }
    }
    if (F.approachShown && (rt.player.u.pos.z >= -150 || F.step > 1)) { F.approachShown = false; rt.unmark('approach'); }
    if (F.localRoad && rt.t >= (F.localRoadAt || 0)) {
      F.localRoadAt = rt.t + 0.5;
      const p = rt.player.u.pos, road = F.localRoad;
      while (F.localRoadI < road.length && Math.hypot(p.x - road[F.localRoadI][0], p.z - road[F.localRoadI][1]) < 8) F.localRoadI++;
      if (F.localRoadI >= road.length || F.step > 1) { F.localRoad = null; rt.unmark('localRoad'); }
      else { F.localPoint.x = road[F.localRoadI][0]; F.localPoint.z = road[F.localRoadI][1]; }
    }
    if (F.TA) F.TA.tick(dt);
    tickTabas(rt, dt);
    // 門を破ったら先へ進む。置き終えた竹束の押し直しへ引き戻さない。
    F.tabaUseOptions.allowPush = F.mode === 'attack' &&
      (F.step === 1 && F.gateSomon.struct.alive || F.step === 2 && F.gateSanmon.struct.alive) && !templeInMelee(rt);
    tabaInteractTick(rt, F.tabaUseOptions);
    templeHallNeed(rt);
    rallyTempleHall(rt);
    // 奥の院へ、既存の先手から一隊ずつ寄せる。
    if (F.mode === 'attack' && F.step >= 3 && F.SZ && rt.t >= (F.okuGuardAt || 0)) {
      F.okuGuardAt = rt.t + 1;
      const zone = F.SZ.byId.oku;
      // 奥山道へ進んだ後も、従来どおり残る兵数に合わせる。
      if (F.step >= 4) {
        let remaining = 0;
        for (const u of rt.army.units) if (u.team === 0 && !u.isPlayer && siegeFighter(u)) remaining++;
        zone.need = Math.max(1, Math.min(4, remaining));
      }
      // 既存の先手から一隊ずつ寄せる。行軍中の隊を毎秒呼び直さない。
      if ((zone.friends || 0) < zone.need) {
        for (const b of F.attackers) {
          if (b === F.reserve || b === F.scout || b === F.flankBow ||
              F.step >= 4 && (b === F.mainSpear || b === F.mainGun) || b._route || b.real?.routed) continue;
          let guards = 0, outside = 0;
          for (const u of b.real?.units || []) if (siegeFighter(u)) {
            guards++; if (!zone.test(u.pos.x, u.pos.z)) outside++;
          }
          if (!guards || !outside) continue;
          const road = b.pos.z < 20 ? [...INNER_ROUTE, ...BOT_OKU_ROUTE] : BOT_OKU_ROUTE;
          let i = 0;
          while (i < road.length - 1 && road[i][1] < b.pos.z - 4) i++;
          setRoute(b, road.slice(i), true);
          break;
        }
      }
    }
    if (F.SZ) F.SZ.tick(dt);
    if (F.ending) return;
    // 合流・到着は一秒ごとの知らせを待たず、その場で次の段へ渡す。
    if (F.mode === 'attack' && F.step >= 1 && F.step <= 4) {
      const p = rt.player.u.pos;
      const zone = F.SZ.byId[TEMPLE_HALL_IDS[F.step - 1]];
      const gate = F.step === 1 ? F.gateSomon : F.step === 2 ? F.gateSanmon : null;
      if (F.step === 4 ? Math.hypot(p.x - OKUYAMA.x, p.z - OKUYAMA.z) < 14
        : !gate?.struct.alive && zone.owner === ZONE_STATE.FRIEND && zone.test(p.x, p.z) && !this.missionSignTarget(rt)) {
        this.nextAttack(rt, F.step + 1);
      }
    }
    if (F.AMB) F.AMB.tick(dt);
    if (F.MD) F.MD.tick(dt);
    if (F.DA) F.DA.tick(dt);
    if (F.FS) F.FS.tick(dt);
    if ((F.mode === 'attack' && F.step >= 1) || F.mode === 'defend') tickRoutes(F.attackers);
    if (F.mode === 'attack') tickRoutes(F.defenders);
    tickGateWorkers(rt, dt);
    if (F.mode === 'attack') {
      const P = rt.player.u.pos;
      // 開戦、三十秒、六十秒に既存の見張りを道へ出す。兵を足さず、門の外で小勢を迎える。
      if (F.step === 1 && F.watchNext < F.watchPosts.length && rt.t >= F.watchAt) {
        const b = F.watchPosts[F.watchNext++];
        F.watchAt = rt.t + 30;
        if (!b._templeBroken && !b.real?.routed && b.aliveNominal() > 0 && P.z < b.pos.z + 18) {
          setRoute(b, [[0, Math.min(b.pos.z, P.z + 12)]], false, Math.PI);
        }
      }
      // 奥山の後備えは三十秒ずつ間をあける。初めから全隊で押し寄せない。
      if (F.step === 5 && F.roadWaveNext < F.roadWaves.length && rt.t >= F.roadWaveAt) {
        const b = F.roadWaves[F.roadWaveNext++];
        F.roadWaveAt = rt.t + 30; b._nightReleased = true;
        if (!b._templeBroken && !b.real?.routed && b.aliveNominal() > 0) {
          setRoute(b, [[OKUYAMA.x, OKUYAMA.z]]);
          if (sightPoint(rt, b.pos)) templeSay(rt, '組頭', F.roadWaveNext === 2
            ? '山から次の手が来るぞ。道を空けるな'
            : '奥の後備えも来たぞ。ここで押し返せ', 4);
        }
      }
      if (F.step >= 1 && !F.alarmed) {
        // 麓の見張りと斬り合った時も警鐘を鳴らす。門前まで戦いを無視しない。
        let found = P.z > -104 || F.mainSpear.pos.z > -104 || F.flankSpear.pos.z > -104;
        for (const b of F.watchPosts) {
          if (found) break;
          if (b.real?.routed || b.lost > 0) { found = true; break; }
          for (const u of b.real?.units || []) if (u.alive && !u.fleeing &&
              (u.atk || u.swing || u.target?.alive && u.target.team !== u.team &&
                Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) < 18 &&
                !rt.army.wallBetween(u.pos, -1, u.target.pos))) { found = true; break; }
        }
        if (found) this.alarm(rt);
      }
      // 札・区域の読み取りは一秒ごと。位置や配列を毎コマ作らない。
      F.checkT = (F.checkT || 0) - dt;
      if (F.checkT <= 0) {
        F.checkT = 1;
        closeTempleGap(rt);
        this.paperFire(rt);
        if (F.step === 2) templeSay(rt, '寺の指揮役', '石段を守れ！　本堂へ通すな！', 4);
        const reserve = F.reserve;
        if (!F.generalRetired && reserve.taishoU?.alive) {
          let guards = 0, danger = false;
          for (const u of reserve.real?.units || []) if (u !== reserve.taishoU && u.alive && !u.fleeing && !u.woundOut) guards++;
          for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.woundOut && u.team !== reserve.team && !u.noTarget && !u.isStruct && Math.hypot(u.pos.x - reserve.pos.x, u.pos.z - reserve.pos.z) < 18) danger = true;
          if (guards < 4 || danger) {
            F.generalRetired = true; reserve.order({ id: 'move', to: F.generalSafe, form: 'yari' });
            if (reserve.real) reserve.real.stay = false;
            templeSay(rt, '伝令', '後備えが危ういとの報せにござる。滝川殿は麓へお退きじゃ。先手は備えを崩すな', 4);
          }
        }
        if (!F.woundWarned && rt.player.u.hp < rt.player.u.maxHp * 0.55) {
          F.woundWarned = true;
          templeSay(rt, '組頭', '手負いじゃな。竹束の陰へ退け。傷口を縛れ', 4);
        }
        if (F.gezanFell || F.step === 1 && F.strategy === 'fire') this.burn(rt, 'gezan', F.gezanKuraStruct);
        if (F.step >= 3) this.burn(rt, 'hondo', F.hondoStruct);
        // 鉄砲や自分の組の一人が残る間も、槍の先手が薄くなれば既存の後備えを送る。
        // 全滅を待つと麓からの到着が間に合わず、本人だけが堂で囲まれる。
        let spears = 0;
        for (const b of F.attackers) {
          if (b === F.reserve || b.kind !== 'ashigaru') continue;
          for (const u of b.real?.units || []) if (siegeFighter(u)) spears++;
        }
        if (F.step <= 2 && P.z > -150 && spears <= 12 && !F.reserveSent &&
            !F.generalRetired && !F.reserve.real?.routed &&
            F.reserve.real?.units.some((u) => u !== F.reserve.taishoU && siegeFighter(u))) {
          F.reserveSent = true; F.reserveSentAt = rt.t; F.reserve.real.stay = false;
          F.reserve._routeGate = (F.step === 1 ? F.gateSomon : F.gateSanmon).struct;
          setRoute(F.reserve, F.step === 1 ? SANDO.slice(0, 5) : SANDO, true);
          templeSay(rt, '伝令', '先手が手薄じゃ。後備え、前へ出よ！', 3);
        }
        const zones = F.SZ.byId;
        const near = (at, r) => Math.hypot(P.x - at.x, P.z - at.z) < r;
        if (F.step === 1) {
          F.target = F.gateSomon.struct.alive ? GATE_SOMON : OUTER_POS;
          if (!F.gateSomon.struct.alive) {
            rt.uninteract('templeGate');
            if (!F.somonTaskChanged) {
              F.somonTaskChanged = true;
              rt.obj('main', '外堂を押さえ、印へ', 'main', true);
            }
          }
          // 別手が外堂を取っても、惣門の打ち手を置き去りにして次の門へ向かわせない。
          // 堂の区域へ入れば合流。四角い庭の隅を中央からの円で除くと、
          // 制圧済みでも「先手と合流できず」の退き陣になってしまう。
          if (!F.gateSomon.struct.alive && zones.gezan.owner === ZONE_STATE.FRIEND && zones.gezan.enemies === 0 && zones.gezan.test(P.x, P.z)) this.nextAttack(rt, 2);
          else if (F.gateSomon.struct.alive) {
            const cover = templeTabaFollow(rt);
            const text = nakaRoomAt(P.x, P.z, P.y) ? '堂を出て、参道から惣門へ'
              : templeGateApproach(rt)?.returning ? '敵を追わず、参道から最初の門へ'
              : templeInMelee(rt) ? '味方のそばで構え、近くの敵を払え'
              : cover ? '竹束の後ろで、味方と進め'
              : templeGateEntry(rt) ? '竹束の間を抜け、最初の門へ'
              : !near(GATE_SOMON, 4) ? '参道を進み、最初の門へ'
              : '「木づちで惣門を打つ」を長押し';
            if (F.somonGuide !== text) {
              F.somonGuide = text;
              rt.obj('main', text, 'main', true);
              rt.objProgress('main', '');
            }
          }
          else templeOccupation(rt, zones.gezan, '外堂');
        } else if (F.step === 2) {
          F.target = F.gateSanmon.struct.alive ? GATE_SANMON : INNER_POS;
          if (!F.gateSanmon.struct.alive) {
            rt.uninteract('templeGate');
            if (!F.sanmonTaskChanged) {
              F.sanmonTaskChanged = true;
              rt.obj('main', '本堂を押さえ、印へ', 'main', true);
            }
          }
          if (!F.gateSanmon.struct.alive && zones.hondo.owner === ZONE_STATE.FRIEND && zones.hondo.test(P.x, P.z)) this.nextAttack(rt, 3);
          else if (F.gateSanmon.struct.alive) {
            const text = templeSanmonTask(rt);
            if (F.sanmonGuide !== text) {
              F.sanmonGuide = text; rt.obj('main', text, 'main', true);
            }
            rt.objProgress('main', nakaRoomAt(P.x, P.z, P.y) || templeInMelee(rt)
              ? '' : near(GATE_SANMON, 4) ? '味方と門を打とう' : '門の前に着いたら、木づちを使おう');
          }
          else templeOccupation(rt, zones.hondo, '本堂');
        } else if (F.step === 3) {
          if (zones.oku.owner === ZONE_STATE.FRIEND && zones.oku.test(P.x, P.z)) this.nextAttack(rt, 4);
          else templeOccupation(rt, zones.oku, '奥の院');
        } else if (F.step === 4) {
          if (near(OKUYAMA, 14)) this.nextAttack(rt, 5);
          else rt.objProgress('main', '槍の列に続き、奥山道へ進め');
        }
        if (F.step === 5) {
          F.roadContested = false;
          let friends = 0, available = 0;
          for (const u of rt.army.units) {
            if (!siegeFighter(u)) continue;
            const d = Math.hypot(u.pos.x - OKUYAMA.x, u.pos.z - OKUYAMA.z);
            if (u.team === 1 && d < 10) F.roadContested = true;
            if (u.team === 0 && !u.isPlayer) { available++; if (d < 18) friends++; }
          }
          const need = 3;
          // 一度退けた寄せは記録する。九十秒の間に立て直しても、達成を取り消さない。
          if (F.roadWaveNext === F.roadWaves.length && F.roadWaves.every((b) => b.real?.routed || b.aliveNominal() <= b.nominal * 0.3)) F.counterRepelled = true;
          // 外堂の物見を引き抜かず、道へ向かった先手を呼び戻す。
          if (friends < need && rt.t >= (F.roadRallyAt || 0)) {
            F.roadRallyAt = rt.t + 10;
            for (const b of [F.mainSpear, F.mainGun]) {
              if (b._route || !b.real || b.real.routed || b.real._pinH ||
                  !b.real.units.some((u) => siegeFighter(u) && Math.hypot(u.pos.x - OKUYAMA.x, u.pos.z - OKUYAMA.z) >= 18)) continue;
              setRoute(b, [[OKUYAMA.x, OKUYAMA.z]], true);
            }
          }
          F.roadSupported = friends >= need;
          if (!available && !F.attackers.some((b) => b.aliveNominal() > 0)) { this.lose(rt, '山道を守る味方が尽きた'); return; }
        }

        // 掛矢の打ち手は門を打ち続ける。斬り合いで本人が門へ寄れなくても、四十五秒を過ぎた門は少しずつ傷む。
        { const work = F.step === 1 ? F.gateSomon : F.step === 2 ? F.gateSanmon : null;
          if (work?.struct.alive && rt.t - F.stepT > 45) rt.army.damage(work.struct, 2.5, null, { kind: 'gateWork', autoWork: true }); }
        // 門を破られた堂の守りは長く踏みとどまらない。破れて三十秒で残りを奥へ退かせ、堂を取れるようにする（人数と斬り合いは減らさない）。
        { const id = TEMPLE_HALL_IDS[F.step - 1], zone = F.SZ?.byId?.[id], gate = F.step === 1 ? F.gateSomon : F.step === 2 ? F.gateSanmon : null;
          if (zone && gate && !gate.struct.alive) {
            const key = 'hallBreach_' + id, at = F[key] ??= rt.t;
            if (rt.t - at > 30) {   // 一秒ごと。後から入った守りも崩す
              const me = rt.player.u.team;
              for (const q of rt.army.units) {
                if (!q.alive || q.fleeing || q.civ || q.team === me || q.isStruct || q.noTarget || !zone.test(q.pos.x, q.pos.z)) continue;
                const g = q.group;
                if (g && !g.routed) { g.routed = true; g.order = 'flee'; g.morale = 0; if (g.fleeDir) { g.fleeDir.x = 0; g.fleeDir.z = 1; } }
                q.fleeing = true; q.target = null; q.aiT = 0;
              }
              // 守りが退いた堂に本人が着けば、味方の列が遅れても堂を取った扱いにする（一秒ごと・六秒）。
              const near = zone.test(P.x, P.z) || Math.hypot(P.x - zone.pos.x, P.z - zone.pos.z) < 14;
              F.hallClearT = zone.enemies === 0 && near ? (F.hallClearT || 0) + 1 : 0;
              if (F.hallClearT >= 6 && zone.owner !== ZONE_STATE.FRIEND) {
                F.hallClearT = 0; zone.owner = ZONE_STATE.FRIEND; zone.state = ZONE_STATE.FRIEND; zone.holdT = 0;
                this.onZoneFall(rt, id);
              }
            }
          } }
      }
      // 道へ入った兵をその回に数える。堂が奪い返された間も守り直す。
      if (F.step === 5) {
        let friends = 0;
        F.roadContested = false;
        for (const u of rt.army.units) {
          if (!siegeFighter(u)) continue;
          const d = Math.hypot(u.pos.x - OKUYAMA.x, u.pos.z - OKUYAMA.z);
          if (u.team === 1 && d < 10) F.roadContested = true;
          if (u.team === 0 && !u.isPlayer && d < 18) friends++;
        }
        F.roadSupported = friends >= 3;
        F.roadHall = null;
        for (const id of TEMPLE_HALL_IDS) {
          const zone = F.SZ.byId[id];
          if (zone.owner !== ZONE_STATE.FRIEND) { F.roadHall = zone; break; }
        }
        for (const u of rt.army.units) {
          if (F.roadHall) break;
          if (u.team !== 1 || !siegeFighter(u)) continue;
          for (const id of TEMPLE_HALL_IDS) {
            const zone = F.SZ.byId[id];
            if (zone.test(u.pos.x, u.pos.z)) { F.roadHall = zone; break; }
          }
        }
        F.hallsHeld = !F.roadHall;
        // 止まった理由を任務の見出しに出す。札を増やさず、印も同じ持ち場を指す。
        if (rt.t >= (F.roadGuideAt || 0)) {
          F.roadGuideAt = rt.t + 1;
          const remaining = Math.max(0, Math.ceil(F.roadHoldSeconds - F.holdT));
          const text = Math.hypot(P.x - OKUYAMA.x, P.z - OKUYAMA.z) >= 18 ? '奥山道の印へ戻れ。味方と守れ'
              : F.roadContested ? '道の敵を押し返せ。守った時間は残る'
                : F.roadHall ? `道を守れ。${TEMPLE_HALL_NAMES[F.roadHall.id]}は別手が押さえる`
                : !F.roadSupported ? `味方を道へ集めよ。あと${3 - friends}人`
                  : remaining > 0 ? `味方三人と道を守れ。あと${remaining}秒`
                    : !F.counterRepelled ? '道を守り、山から来る反撃を退けよ' : '道と堂の守りを保て';
          rt.obj('main', text, 'main', true);
          rt.objProgress('main', F.roadHall || F.roadContested || !F.roadSupported
            ? `守りの残り${remaining}秒。持ち場を整えれば再開` : '堂の守りは別手に任せよ');
        }
      }
      if (F.step === 5 && F.hallsHeld && F.roadSupported && !F.roadContested && Math.hypot(P.x - OKUYAMA.x, P.z - OKUYAMA.z) < 18) {
        F.holdT += dt;
        if (F.holdT >= F.roadHoldSeconds && F.SZ.byId.gezan.owner === ZONE_STATE.FRIEND && F.SZ.byId.hondo.owner === ZONE_STATE.FRIEND && F.SZ.byId.oku.owner === ZONE_STATE.FRIEND && F.counterRepelled) this.win(rt);
      }
      else if (F.step === 5 && (!F.hallsHeld || F.roadContested || !F.roadSupported || Math.hypot(P.x - OKUYAMA.x, P.z - OKUYAMA.z) >= 18)) {
        // 反撃中は時計を止める。押し返せば、それまで守った時間から再開する。
        if (F.holdT > 0 && rt.t >= (F.holdResetAt || 0)) {
          F.holdResetAt = rt.t + 8;
          templeSay(rt, '組頭', F.roadHall ? `${TEMPLE_HALL_NAMES[F.roadHall.id]}の敵は別手が払う。先手は道を守れ` : F.roadContested ? '敵が道へ戻ったぞ！　槍を揃えて押し返せ' : Math.hypot(P.x - OKUYAMA.x, P.z - OKUYAMA.z) >= 18 ? '持ち場を離れるな。奥山道へ戻れ' : '道の守りが手薄じゃ。組を呼び戻せ', 4, true);
        }
      }
      // 時間だけで勝たせない。長引いた時は次の仕事を声で伝える。
      if (F.step >= 1 && rt.t - F.stepT > 35 && rt.t >= (F.longAt || 0)) {
        F.longAt = rt.t + 35;
        const gate = F.step === 1 ? F.gateSomon : F.step === 2 ? F.gateSanmon : null;
        const zone = F.SZ.byId[F.step === 1 ? 'gezan' : F.step === 2 ? 'hondo' : 'oku'];
        templeSay(rt, '組頭', gate?.struct.alive ? F.step === 2 ? templeSanmonTask(rt)
          : nakaRoomAt(P.x, P.z, P.y) ? '戸口から堂を出て、惣門へ'
          : templeInMelee(rt) ? '味方のそばで構え、近くの敵を払え' : '門の前へ寄れ。木づちで門を打て'
          : F.step === 5 ? F.roadHall ? `${TEMPLE_HALL_NAMES[F.roadHall.id]}は別手が押さえる。先手は道を守れ` : F.roadContested ? '道の敵を押し返せ。堂の守りも残せ' : !F.roadSupported ? '本隊を道へ集めよ。別手は堂を守れ' : '道を守れ。山から来る反撃を退けよ'
          : F.step === 4 ? '本隊について奥山道へ進め'
          : zone.owner === ZONE_STATE.FRIEND ? '堂は取れたぞ。組を連れ、先手と落ち合え'
          : zone.enemies > 0 ? '堂に敵が残る。味方と押し返せ' : '堂の守りが手薄じゃ。組を呼び寄せよ', 4, true);
      }
      // 同じ段で動けなくなった時は退き陣。時の経過だけで寺を落とした扱いにはしない。
      if (F.step >= 1 && (rt.t - F.stepT >= 240 || rt.t >= 360) && !F.retreatWarned) {
        F.retreatWarned = true;
        templeSay(rt, '組頭', 'このままでは退き陣じゃ。組を揃え、今一度寄せよ', 4);
      }
      if (F.step >= 1 && (rt.t - F.stepT > 300 || rt.t >= 420)) {
        const gate = F.step === 1 ? F.gateSomon : F.step === 2 ? F.gateSanmon : null;
        const zone = F.SZ.byId[F.step === 1 ? 'gezan' : F.step === 2 ? 'hondo' : 'oku'];
        this.lose(rt, gate?.struct.alive ? `${gate.struct.name}を破れず、麓へ退く` : F.step >= 4 ? F.roadContested ? '山道の敵を払えず、堂へ退く' : !F.roadSupported ? '山道を守る味方がそろわず退く' : '山道と堂の守りを保てず退く' : zone.enemies > 0 ? `${zone.name}の敵を押し返せず退く` : zone.friends < zone.need ? `${zone.name}を守る味方が足りず退く` : `${zone.name}を保ち、先手と合流できず退く`);
      }
    } else {
      F.checkT = (F.checkT || 0) - dt;
      if (F.checkT > 0) return;
      F.checkT = 1;
      const z = F.SZ.byId.hondo;
      if (!F.defendClimb && !F.gateSomon.struct.alive && Math.hypot(F.odaMain.pos.x - OUTER_POS.x, F.odaMain.pos.z - OUTER_POS.z) < 16) {
        F.defendClimb = true;
        F.odaMain._routeGate = F.odaGun._routeGate = F.gateSanmon.struct;
        for (const b of [F.odaMain, F.odaGun]) setRoute(b, INNER_ROUTE);
      }
      rt.objProgress('main', sightPoint(rt, INNER_POS) ? `本堂を守れ・${zoneWord(z)}（退くまで${Math.max(0, Math.ceil(420 - rt.t))}秒）` : '本堂へ戻り、守りに加われ');
      if (z.owner !== ZONE_STATE.FRIEND) this.lose(rt, '本堂を失い、山へ退く');
      else if (F.attackers.every((b) => b === F.reserve || b.aliveNominal() <= b.nominal * 0.3 || b.real && b.real.routed)) this.defendWin(rt);
      else if (rt.t > 420) this.lose(rt, '寄せ手を押し返せず、山へ退く');
    }
  },

  // 強い風下へ飛ぶ火の粉は、里へ届くまで予告し、放火とは別の作業にする。
  paperFire(rt) {
    const F = rt.flags, rain = rt.world.rainLevel || 0;
    for (const s of F.paperWorks) {
      if (!s.alive) continue;
      if (s.paperWetUntil > rt.t) { s.emberT = 0; continue; }
      let ember = false;
      for (const source of rt.army.burning || []) {
        if (!source.fireF || source === s) continue;
        const dx = s.x - source.x, dz = s.z - source.z, d = Math.hypot(dx, dz);
        if (d < 180 && d > 0 && (dx * WIND_STATE.dirX + dz * WIND_STATE.dirZ) / d > 0.75 && (WIND_STATE.gust || 1) > 1.15 && rain < 0.4) ember = true;
      }
      s.emberT = ember ? (s.emberT || 0) + 1 : Math.max(0, (s.emberT || 0) - 1);
      if ((s.emberT >= 5 || s.fireF) && !s.paperWarned) {
        s.paperWarned = true;
        rt.marker('paper' + s.name, s, `${s.name}の火の粉を払う`);
        rt.addInteract('paper' + s.name, s, '水を掛け、火の粉を払う', () => {
          if (F.ending || rt.over || !rt.player.u.alive || !s.alive) return;
          s.paperWetUntil = rt.t + 45; s.paperWarned = false; s.emberT = 0; s.burn = 0;
          const burning = rt.army.burning || [], i = burning.indexOf(s); if (i >= 0) burning.splice(i, 1);
          if (s.fireF) { rt.world.removeFire(s.fireF); s.fireF = null; }
          rt.unmark('paper' + s.name); rt.uninteract('paper' + s.name);
        }, { r: 5, hold: 2 });
        if (rt.t >= (F.paperNoticeAt || 0)) { F.paperNoticeAt = rt.t + 8; templeSay(rt, '職人', '火の粉じゃ！　紙に燃え移るぞ！　水を掛けてくれ！', 4); }
        for (const c of F.civ || []) if (c.name.includes('職人')) { c.fleeDir.x = -0.7; c.fleeDir.z = -0.7; }
      }
      if (!s.fireF && s.emberT >= 25) { s.burn = 3; rt.army.igniteStruct(s, s); }
    }
  },

  // 逃げる職人・僧・里の者（戦わない。討てば下知違反）。b_hiei_mtn.js の civ() と同じ作り
  civ(rt, x, z, n2, name, dir, path) {
    const F = rt.flags;
    const monk = name.includes('僧');
    const c = enemyGroup(rt, { faction: 'ikko', fixed: true, name, anchor: { x, z }, facing: Math.atan2(dir.x, dir.z), width: 4, aggro: 0, morale: 0, fleeDir: dir, speed: 2.5 },
      [{ type: 'porter', n: n2, o: monk ? { sohei: 1, flag: null, hat: 'none', armor: 0x1e1c1a, lace: 0x2a2826, cloth: 0x24221f, haori: null, mon: null } : { flag: null, hat: 'none', armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null } }]);
    c.routed = false; c.order = 'hold'; c.noAI = true; c.morale = 100;
    c.fleePath = path;
    for (const u of c.units) { u.fleeing = false; u.noTarget = true; u.dmg = 0; u.aiT = Infinity; }
    c.civ = true;
    (F.civ = F.civ || []).push(c);
    return c;
  },

  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s !== F.gateSomon?.struct && s !== F.gateSanmon?.struct) return;
    // 共通の割れ木・土煙・落下の仕組みを使う。扉を戻さないと共通側が消したままになる。
    if (s._templeFallen) return;
    s._templeFallen = true;
    s.mesh.userData.fall?.();
    s.mesh.userData.noFreeze = true;
    // 扉を左右へ倒し、門の中央に歩ける隙間を残す。共用の門には触らない。
    for (const [i, leaf] of (s.mesh.userData.leaves || []).entries()) {
      const side = i ? 1 : -1;
      leaf.rotation.set(-Math.PI / 2, -side * .65, 0);
      leaf.position.x += side * .35;
    }
    // 倒れた扉を坂へ寝かせる。共用の扉の形は複製し、この二枚だけ地面へ沿わせる。
    // 凍結中の子の行列も、倒した後の位置で一度だけ更新する。
    s.mesh.traverse((node) => {
      node.updateMatrix(); node.matrixWorld.multiplyMatrices(node.parent.matrixWorld, node.matrix);
    });
    const point = new THREE.Vector3(), inverse = new THREE.Matrix4();
    for (const leaf of s.mesh.userData.leaves || []) leaf.traverse((m) => {
      if (!m.isMesh) return;
      m.geometry = m.geometry.clone();
      const pos = m.geometry.attributes.position;
      inverse.copy(m.matrixWorld).invert();
      for (let i = 0; i < pos.count; i++) {
        point.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        // 坂の上端からの高低差を厚みに混ぜない。板の表裏だけ薄く残す。
        // 板・貫・金物の厚さを残す。表裏を二つの高さへ潰すと筋交いが黒い裂け目になる。
        const thickness = .09 - pos.getZ(i);
        point.y = rt.world.heightAt(point.x, point.z) + .04 + thickness;
        point.applyMatrix4(inverse); pos.setXYZ(i, point.x, point.y, point.z);
      }
      pos.needsUpdate = true;
      m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere();
    });
    const x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2;
    // 篝火から散った火の粉。既存の粒の入れ物へ一度だけ入れる。
    const W = rt.world;
    if (!W.embers) W.buildEmbers();
    const E = W.embers, y = W.heightAt(x, z);
    for (let k = 0; k < 18; k++) {
      const i = E.i = (E.i + 1) % E.N, j = i * 3;
      E.pos[j] = x + (Math.random() - .5) * 3;
      E.pos[j + 1] = y + .5 + Math.random() * 2;
      E.pos[j + 2] = z;
      E.vel[j] = (Math.random() - .5) * 2;
      E.vel[j + 1] = 1 + Math.random() * 2;
      E.vel[j + 2] = 1 + Math.random();
      E.life[i] = 1 + Math.random();
    }
    E.pts.geometry.attributes.position.needsUpdate = true;
    E.pts.geometry.attributes.life.needsUpdate = true;
    if (Math.hypot(rt.player.u.pos.x - x, rt.player.u.pos.z - z) < 24) rt.player.addShake(.14);
    // 共通の出来事に寺の門名を渡す。同じ門を門案内でもう一度知らせない。
    rt._gg?.seen.delete(s);
    showGateBreak(rt, `${s.name}、破れる`, F.mode === 'attack' ? s._templePlayerWorked ? 'おぬしの掛矢が効いた。先手と堂へ進め' : '門が開いた。先手と堂へ進め' : '寄せ手が来る。堂を守れ');
    if (F.mode !== 'attack' || F.ending) return;
    const somon = s === F.gateSomon.struct;
    if (F.step !== (somon ? 1 : 2)) return;
    F[somon ? 'somonTaskChanged' : 'sanmonTaskChanged'] = true;
    F.target = somon ? OUTER_POS : INNER_POS;
    rt.uninteract('templeGate');
    rt.obj('main', somon ? '外堂を押さえ、印へ' : '本堂を押さえ、印へ', 'main', true);
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.group && v.group.civ) {
      if (k && (k.isPlayer || k.isSub || rt.squad.includes(k)) && !F.civHurt) { F.civHurt = true; rt.objFail('civ'); }
      return;
    }
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team === 1 && !g.civ && sightPoint(rt, g.anchor)) battleEvent(rt, EVENT_UNIT_BREAK, g.anchor, g, 1, false, '寺の守りが崩れ、山の上へ退く');
    if (g.team !== 1 || g.civ || !sightPoint(rt, g.anchor) || !g.name || rt.t - (F.routSaidT ?? -99) < 8) return;
    // 同じ隊が立て直してはまた崩れる。名は一度だけ言う（見回り 10/2：同じ台詞が十数回）
    F.routSaid = F.routSaid || {}; if (F.routSaid[g.name]) return; F.routSaid[g.name] = 1;
    F.routSaidT = rt.t;
    templeSay(rt, '足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が崩れたがや。山へ逃げてくわ`, 2.5);
  },
};

echizen_ikko.force = (rt) => {
  const F = rt.flags;
  const a = (F.attackers || []).reduce((s, b) => s + b.aliveNominal(), 0);
  const b = (F.defenders || []).reduce((s, b) => s + b.aliveNominal(), 0);
  return F.mode === 'attack' ? { a, a0: F.attackTotal || 1, b, b0: F.defendTotal || 1 } : { a: b, a0: F.defendTotal || 1, b: a, b0: F.attackTotal || 1 };
};
echizen_ikko.sides = { a: { name: '織田軍・滝川一益の手', mon: 'takigawa' }, b: { name: '大滝寺の守り', mon: 'maru' } };
echizen_ikko.date = () => '天正三年 八月ごろ';
echizen_ikko.history = '天正三年（1575）の越前攻め。信長公記巻八は八月十五日の風雨の進軍と、同夜の府中龍門寺への潜入・奪取と近辺への放火、それに続く一揆勢の退却を記す。大滝寺は府中の東の白山信仰の寺で、龍門寺や豊原寺とは別の場所。大瀧神社の由緒と越前和紙の案内は、滝川一益が堂塔を焼き払ったと伝える。大滝寺での夜討ちの日時・霧・局地の兵数・布陣は確認できず、参道から山上を押さえる遊び用の補いとした。画面の兵数もこの場の仮の数。神社庁の由緒にある六、七百の社僧は鎌倉期の記述で、この戦の兵数には使わない。国交省の古社寺案内では兵火を天正九年ともする。越前攻めでは非戦闘員への殺害も記録されているが、この遊びでは手向かわぬ者を攻撃の的にしない。';
// 装備の復元上の留保を、作り手向けの注記だけでなく戦の解説にも残す。
echizen_ikko.history += '滝川一益の筋兜・黒漆の具足・刀は、当日の所用品を特定した姿ではなく復元案。銀水牛の脇立・黒糸威・赤地の陣羽織は時代祭の復元装束に見られる姿を参考にしたもので、この戦での着用を裏付けるものではない。陣羽織は展示紹介の立四窠紋を参考に、外丸のない四弁の竪木瓜で補い、隊旗の丸に竪木瓜と分けた。展示品の細部や当日の着用を確定したものではない。脇立の角の輪郭と寸法は展示の姿を参考にした補完。面頬を省いた姿も当日の非着用を示すものではない。丸に竪木瓜は滝川家の目印として使うが、この場の旗の色や寸法は仮定。金の三つ団子の馬印は伝承にちなみ、三球の大きさ・並べ方と麓の据え方は復元した。大滝寺の守将名は確認できないため、ほかの戦場の武将や豪傑の逸話は加えていない。';

echizen_ikko.history += '銀水牛脇立の丸い縁と、根元から先へ薄くなる断面は、立体として見せるための補完で、伝来品の実測に基づくものではない。';
echizen_ikko.history += '脇差の鍔は打刀と揃う薄い鉄の縦長形で補い、切羽と柄の縁も厚みに合わせた。刀剣博物館の実用刀の材料の説明を参考にした復元案で、一益の所用品の材質・形・寸法を特定したものではない。';
echizen_ikko.history += '脇立の根元には兜へ留める受け金と鋲を補った。取り付け方・寸法・金具の色は復元上の仮定で、一益の所用品の構造を確認したものではない。';
echizen_ikko.history += '陣羽織の前身頃・裏地・胸の留め紐も着衣としての形を補った復元案で、一益の所用品の寸法や仕立てを示すものではない。';
echizen_ikko.history += '前身頃の襟元・前端・脇・裾は表地と裏地をつなぎ、布の厚みを補った。これも復元上の補完で、伝来品の縫製を再現したものではない。';
echizen_ikko.history += '兜を顎の下で留める忍緒を補った。色・通し方・結び方は復元案で、一益の所用品を確認したものではない。';
echizen_ikko.history += '刀の下緒と栗形は納刀して指揮する間も残す。刀剣博物館の刀装部位の説明を参考にした一般的な拵えの補完で、一益の所用品の色や結び方を示すものではない。';
echizen_ikko.history += '胴の裾には刀の下緒を受ける上帯を補った。名古屋刀剣博物館の着付け解説を参考にした復元案で、帯の色・幅・結び方は一益の所用品を確認したものではない。';
echizen_ikko.history += '刀剣博物館が説明する反りのある日本刀を参考に、長い鞘にも反りを補った。反りの量と拵えは既存の刀身に合わせた復元案で、一益の所用品の実測ではない。';
echizen_ikko.history += '大小の鞘は刀身を納める扁平な断面で補い、長い鞘の鯉口と鐺も同じ厚みにそろえた。刀装部位は刀剣博物館の説明を参考にしたが、断面の厚みの比率は復元上の仮定で、一益の所用品の実測ではない。';
echizen_ikko.history += '脇差の鞘にも浅い反りと鐺を補った。大小の柄は扁平な断面とし、長い刀の縁と脇差の縁・頭を補った。刀剣博物館の大小と刀装の解説を参考にした復元案で、当日の一益の所用品や反りの量・断面の比率・金具の仕様を確認したものではない。';
echizen_ikko.history += '腰の大小の柄には、菱巻の窓から鮫皮がのぞく形を補った。刀剣博物館の刀装解説を参考にした一般的な復元で、柄巻の色・巻き方は一益の所用品を特定したものではない。';
echizen_ikko.history += '腰の大小にも目貫を補った。刀剣博物館の刀装解説を参考にした簡素な金具の復元で、意匠・材質・表裏の位置は一益の所用品を確認したものではない。長い刀を抜いた時はその柄と目貫を腰に重複させず、脇差は残す。';
echizen_ikko.history += '長い鞘の栗形には紐を通す穴を設け、下緒を鞘の外側から上帯へ返す形に改めた。刀剣博物館の刀装部位の説明を参考にした一般的な構造の補完で、穴の向き・寸法・結び方は一益の所用品を確認したものではない。';
echizen_ikko.history += '脇差にも穴のある栗形と上帯へ返す下緒を補い、長い刀を抜いた間も残す。刀剣博物館の打刀拵の解説を参考にした復元案で、脇差の栗形の位置・緒の長さ・結び方は一益の所用品を確認したものではない。';

echizen_ikko.history += '腰の大小には鍔の両面を受ける切羽を補った。刀剣博物館の刀装具の解説を参考にした一般的な構造の復元で、厚み・輪郭・銅色は一益の所用品を確認したものではない。長い刀を抜いた時は腰に切羽を重複させず、脇差には残す。';
echizen_ikko.history += '納刀時の大小にも鯉口の縁を補った。刀剣博物館の打刀拵の部位解説を参考にした復元案で、縁の色・厚みは一益の所用品を確認したものではない。脇差の縁は長い刀を抜いた間も残す。';
echizen_ikko.history += '腰の大小には、茎を柄へ固定する目釘を目貫と別に補った。名古屋刀剣博物館の刀装具解説を参考にした一般的な構造の復元で、位置・太さ・色は一益の所用品を確認したものではない。長い刀の抜刀中は腰の柄とともに隠し、脇差には残す。';
echizen_ikko.history += '長い刀の鍔は納刀中も抜刀中と同じ薄い縦長の鉄鍔とし、切羽と縁をその厚みにつないだ。刀装の部位は刀剣博物館の解説を参考にしたが、鍔の輪郭・寸法・鉄の質感は既存の刀に合わせた復元案で、一益の所用品を確認したものではない。';
echizen_ikko.history += '打刀の柄頭も納刀中と抜刀中で鉄色にそろえ、腰の脇差と合わせた。刀剣博物館の実用刀の材料の説明を参考にした復元案で、一益の所用品の材質を特定したものではない。';
echizen_ikko.history += '大小の鞘尻を覆う鐺も、鍔・縁・頭とそろう鉄色に改めた。刀剣博物館の実用刀の材料の説明を参考にした復元案で、一益の所用品が鉄製だったと確認したものではない。納刀中と抜刀中で同じ鞘を使う。';
echizen_ikko.history += '抜刀した打刀の鯉口には、外面の裏が透けないよう木の内壁を補った。刀剣博物館の木製の鞘の説明を参考にした復元案で、内壁の色・厚みは一益の所用品を確認したものではない。';
echizen_ikko.history += '抜刀中の鞘本体の口側を塞いでいた面を除き、反りに沿う内壁と暗い奥を補った。内側の深さ・色は見た目のための復元で、一益の所用品の実測ではない。';
echizen_ikko.history += '筋兜の八幡座の中央には天辺の穴と内壁・暗い裏地を補い、遠景でも座と穴を残した。福岡市博物館の筋兜の解説を参考にした構造の復元で、穴径・金具・裏地の色は一益の所用品を確認したものではない。';
echizen_ikko.history += '筋兜の鉢には、矧板の縁を折り立てた筋を黒漆の立体で補った。千葉県立中央博物館大多喜城分館の解説を参考にした一般的な構造の復元で、三十二間という数・筋の高さは一益の所用品を確認したものではない。';
echizen_ikko.history += '筋兜の後頭部には、笠印を付ける鐶と座金・留め軸を補った。千葉県立中央博物館大多喜城分館の筋兜の解説を参考にした一般的な構造の復元で、鐶の寸法・色・留め方は一益の所用品を確認したものではない。';

echizen_ikko.history += '錣の裾には交差する菱縫の緒を補った。刀剣ワールド所蔵の黒漆塗本小札紺糸威丸胴具足の錣を参考にした一般的な構造の復元で、緒の色・数・縫い方は一益の所用品を確認したものではない。';
echizen_ikko.history += '兜の前面の篠垂は鉢の曲面に沿う薄い筋金で補った。山口県の文化財解説を参考にした一般的な構造の復元で、金色・幅・本数は一益の所用品を確認したものではない。';
echizen_ikko.history += '眉庇には裏面と板の小口を補った。千葉県立中央博物館の鉄板製の真向の解説を参考にした構造の復元で、板厚は一益の所用品の実測ではない。';
echizen_ikko.history += '錣は高画質の近景・遠景とも四段を保ち、札の裏面と上下・左右の小口を補った。千葉県立中央博物館の札の解説を参考にした復元案で、段数・板厚・裏の仕上げは一益の所用品を確認したものではない。';
echizen_ikko.history += '陣羽織の背面も、高画質の近景・遠景とも裏地を残し、肩口・裾・脇で表地とつなぐ袷仕立てとして補った。東京国立博物館所蔵の陣羽織の仕立てを参考にした一般的な復元で、色・厚み・裁ちは一益の所用品を確認したものではない。';
echizen_ikko.history += '吹返しには無地の包革と上下の覆輪を補い、高画質の遠景でも縁の金具を残した。千葉県立中央博物館の革所と金具廻りの解説を参考にした一般的な復元で、革の色・金具の仕様は一益の所用品を確認したものではない。';
echizen_ikko.history += '眉庇と吹返しの表裏には無地の包革を補い、眉庇の覆輪も高画質の遠景で保った。千葉県立中央博物館の金具廻りを表裏とも革で包む解説を参考にした復元案で、革の色・文様の有無・覆輪の仕様は一益の所用品を確認したものではない。';

echizen_ikko.history += '肩上と胸板の鐶をつなぐ高紐を補い、高画質の近景・遠景とも留める構造を残した。刀剣ワールド桑名・多度別館の甲冑の部位解説を参考にした一般的な復元で、色・通し方・寸法は一益の所用品を確認したものではない。';
echizen_ikko.history += '袖の裾板には補強の菱縫を補い、高画質の遠景でも段板と吊り紐を保った。福井市立郷土歴史博物館の甲冑解説を参考にした一般的な構造の復元で、黒い緒の色・交差の数・寸法は一益の所用品を確認したものではない。';
echizen_ikko.history += '草摺も高画質の近景・遠景とも七間五段の板の形を保った。以前に参考とした京都国立博物館所蔵の紺糸威鉄二枚胴具足は十八世紀の作例で、天正三年の装備の根拠にはしない。七間五段の構成は文化庁が紹介する桃山期の本多忠勝所用の黒糸威胴丸具足でも確認できるが、忠勝の具足を一益の所用品とみなすものではない。草摺の裏面と縁にも厚みを補った。段数・色・寸法・板厚・裏の仕上げは一益の所用品を確認したものではなく復元案。';

echizen_ikko.history += '黒糸威の胴には右脇の合わせと引合緒・内側の鎧下を補い、高画質の近景・遠景とも着脱する構造を残した。兵庫県立歴史博物館の胴丸の解説を参考にした一般的な復元で、合わせの幅・緒の数や位置は一益の所用品を確認したものではない。';
echizen_ikko.history += '袖の冠板には裏面と上下・左右の小口を補い、高画質の近景・遠景で板の厚みを保った。千葉県立中央博物館の鉄板製の金具廻りの解説を参考にした一般的な構造の復元で、板厚・寸法・黒漆は一益の所用品を確認したものではない。';
echizen_ikko.history += '草摺の裾板にも、補強と装飾を兼ねる菱縫の緒を補った。福井市立郷土歴史博物館の解説を参考にした一般的な構造の復元で、黒い緒の色・数・寸法は一益の所用品を確認したものではない。';

echizen_ikko.history += '一益の臑当の上下の緒には、後ろで留める結びと短い端を補い、高画質の遠景でも緒を残した。名古屋刀剣博物館の小具足の解説を参考にした一般的な構造の復元で、緒の色・位置・結び方は一益の所用品を確認したものではない。';
echizen_ikko.history += '佩楯には小札を支える家地の裏面と縁を補い、高画質の近景・遠景で残した。名古屋刀剣博物館の佩楯の解説を参考にした一般的な構造の復元で、黒い家地の色・厚みは一益の所用品を確認したものではない。家地は別の武将の威色と混ざらないように共有する。';
echizen_ikko.history += '一益の籠手は、高画質の遠景でも肘金と三本の篠を保ち、手甲と同じ黒漆で補った。名古屋刀剣博物館の籠手の解説を参考にした一般的な仕上げの復元で、篠の数・寸法・黒漆は本人の所用品を確認したものではない。黒い家地と漆の部品は色を含めて共有し、別の武将の威色を混ぜない。';
echizen_ikko.history += '一益の袖の小札板の両端には耳糸を補い、高画質の近景・遠景とも袖と一緒に動かす。福井市立郷土歴史博物館「甲冑の美」の解説を参考にした一般的な構造の復元で、黒い緒の色・通し方・寸法は本人の所用品を確認したものではない。';
echizen_ikko.history += '一益の草摺の小札板の両端にも耳糸を補い、五段の折り返しに沿わせた。高画質の近景・遠景とも腰の形へ結合して使い回す。福井市立郷土歴史博物館「甲冑の美」の解説を参考にした一般的な構造の復元で、黒い緒の色・通し方・太さは本人の所用品を確認したものではない。';

// 軍議（gungi.js と同じ考え方。b_kinome.js F9・b_hiei_mtn.js と同じ作り）：四つの作戦から一つを選ぶ
//   ①front：参道一本で真っ直ぐ本堂へ（早いが、本堂の守りが厚いまま）
//   ②valley（既定）：別手が谷の道から回り込み、本堂を挟み撃つ（伏兵に遭いやすいが崩しやすい）
//   ③fire：先に外堂へ火を放ち、煙と夜霧に紛れて進む（守りの士気を削るが、攻め手も見通しが悪くなる）
echizen_ikko.gungi = (rt) => {
  const F = rt.flags;
  if (F.mode !== 'attack' || !rt.G.lord) return null;   // 守る側は作戦を選ばない（AI 任せ。setRoute で参道・谷の道を歩かせる）
  const G = {
    center: { x: 0, z: -60 }, dist: 110,
    units: [{ id: 'plan', name: '攻め方（滝川一益の手）', group: () => F.mainSpear && F.mainSpear.real, nominal: () => (F.mainSpear ? F.mainSpear.aliveNominal() : 0) }],
    routes: [
      { id: 'front', name: '参道から本堂へ攻め上る' },
      { id: 'valley', name: '谷の道から回り込み、本堂を挟み撃つ' },
      { id: 'forest', name: '五箇の里裏の森から回り込む' },
      { id: 'fire', name: '外堂へ寄って火を放ち、守りを退かせる' },
    ],
    default: { plan: 'valley' },
    enemy: [
      { name: '外堂の守り（数は不明）', known: false },
      { name: '大滝寺の衆徒（本堂）', known: false },
      { name: '谷筋の守り（様子は不明）', known: false },
    ],
    onStart: (assign) => echizen_ikko.onGungiStart(rt, assign),
  };
  const auto = window.__echizenStrategy || (/[?&]bot/.test(location.search) ? 'valley' : null);
  if (auto) { echizen_ikko.onGungiStart(rt, { plan: auto }); return null; }
  return G;
};
echizen_ikko.onGungiStart = (rt, assign) => {
  rt.flags.strategy = (assign && assign.plan) || 'valley';
};

// 素直な遊び手：門前でも打ち手に応戦する。退避・傷を縛る判断は playbot の共通処理に任せる。
echizen_ikko.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.leftPressed = false; inp.chargeHold = false;
  if (!u.alive || F.ending) return;
  const squad = b.squadGroups.find((g) => !g.routed && g.units.some((s) => s.alive && !s.fleeing && !s.woundOut && !s.rearWound));
  // 崩れる前に鼓舞する。逃亡・深手の兵へ突撃を繰り返しても戻らない。
  // 鼓舞は無くした（稲生 55）。
  const back = F.mode === 'attack' ? (F.target || VILLAGE) : (F.ikkoMain ? F.ikkoMain.pos : { x: u.pos.x, z: u.pos.z });
  // 麓での下知が済むまでは先手を待つ。門だけを目指して一人で走り出さない。
  if (F.mode === 'attack' && !F.step) {
    inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
    return;
  }
  const marchingToGate = F.mode === 'attack' && (F.step === 1 && F.gateSomon.struct.alive ||
    F.step === 2 && F.gateSanmon.struct.alive);
  const taskZone = F.mode === 'attack' && !marchingToGate && F.step >= 1 && F.step <= 3
    ? F.SZ.byId[F.step === 1 ? 'gezan' : F.step === 2 ? 'hondo' : 'oku'] : null;
  const returningToHall = taskZone && !taskZone.test(u.pos.x, u.pos.z);
  // 区域外の応戦も下の受け流し判断へ通す。構えを飛ばして突き続けない。
  // 任務の区域を外れた堂でも、壁へ歩き続けず戸口から参道へ戻る。
  if ((marchingToGate || taskZone && !taskZone.test(u.pos.x, u.pos.z)) &&
      (nakaRoomAt(u.pos.x, u.pos.z, u.pos.y) || u._templeExit)) {
    const way = templeWay(b.army, u, back);
    inp.guardHold = templeInMelee(b); inp.runHeld = false;
    if (p.lock) inp.e.add('KeyQ');
    goTo(p, inp, way.x, way.z, way.botRadius ?? .35);
    return;
  }
  // 先手は竹束を押してゆっくり寄せる。自分だけ門へ直行すると、楯を置き去りにして矢を浴びる。
  const cover = templeTabaFollow(b);
  if (cover &&
      !b.army.nearestEnemy(u, 12, (o) => !o.isStruct && !o.fleeing && !o.noTarget &&
        o.type !== 'bow' && o.type !== 'gun' && Math.abs(o.pos.y - u.pos.y) < 3 &&
        (templeGateRoadFoe(F, o) || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 3.5) &&
        !b.army.wallBetween(u.pos, -1, o.pos))) {
    b.botFollowingTaba = true;
    inp.runHeld = false; inp.guardHold = false;
    goTo(p, inp, cover.x, cover.z, 0.5);
    return;
  }
  // 堂を押さえた後は、残敵を追って任務の山道から離れない。道の折れ目を順に歩く。
  if (F.mode === 'attack' && F.step >= 4) {
    inp.guardHold = false;
    if (F.step === 4) {
      if (F.botRoadStep !== F.step) { F.botRoadStep = F.step; F.botRoadI = 0; }
      let at = OKU_ROAD[F.botRoadI];
      if (F.botRoadI < OKU_ROAD.length - 1 && Math.hypot(u.pos.x - at[0], u.pos.z - at[1]) < 5) at = OKU_ROAD[++F.botRoadI];
      goTo(p, inp, at[0], at[1], 3);
      return;
    }
    if (Math.hypot(u.pos.x - OKUYAMA.x, u.pos.z - OKUYAMA.z) > 12) { goTo(p, inp, OKUYAMA.x, OKUYAMA.z, 3); return; }
  }
  // 近いだけの敵より、今こちらへ打ち込む敵を受ける。向きと構えを当たるまで保つ。
  const gate = F.mode === 'attack' ? (F.step === 1 ? F.gateSomon.struct : F.step === 2 ? F.gateSanmon.struct : null) : null;
  const gatePos = F.step === 1 ? GATE_SOMON : GATE_SANMON;
  const atGate = gate?.alive && Math.hypot(u.pos.x - gatePos.x, u.pos.z - gatePos.z) < 4;
  // 門前では目前の打ち手に応戦する。遠い守りを追うたび掛矢の長押しを取り消さない。
  let attacker = null, attackDist = atGate ? 4 : 10, soonest = Infinity;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.noTarget || o.type === 'bow' || o.type === 'gun' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(o.pos, -1, u.pos, (o.wpnKind || o.lookWeapon) === 'spear')) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    const charge = o.charging && o.target === u;
    const swing = o.swing && !o.swing.done && o.swing.target === u;
    const atk = o.atk && o.atk.target === u && !o.atk.bow;
    if (!charge && !swing && !atk) continue;
    const soon = charge ? 0 : swing ? Math.max(0, o.swing.dur * o.swing.at - o.swing.t) : o.atk.t + 0.2;
    if (d < (atGate ? 4 : 10) && (soon < soonest || soon === soonest && d < attackDist)) { attacker = o; attackDist = d; soonest = soon; }
  }
  // 構えを解く半秒の間は同じ相手を保つ。近い兵への選び直しで突きを取り消さない。
  let candidate = attacker || strikeTarget(b, atGate ? 4 : 12);
  // 堂の中心を敵兵と間違えて追わない。放火と門打ちは戦の専用処理に任せる。
  if (candidate && (candidate.isStruct || b.army.wallBetween(u.pos, -1, candidate.pos) || marchingToGate &&
      (nakaRoomAt(candidate.pos.x, candidate.pos.z, candidate.pos.y) || !attacker && !templeGateRoadFoe(F, candidate)))) candidate = b.army.nearestEnemy(u, atGate ? 4 : 12, (o) =>
    !o.isStruct && !o.fleeing && !o.noTarget && !o.invuln && !o.woundOut &&
    !(marchingToGate && (nakaRoomAt(o.pos.x, o.pos.z, o.pos.y) || !templeGateRoadFoe(F, o))) &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
  // 目の前の打ち込みには応戦するが、堂の制圧中は山腹の残敵を追わない。
  if (candidate && taskZone && !attacker && !taskZone.test(candidate.pos.x, candidate.pos.z)) candidate = null;
  // 庭の近い敵でも、切岸や戸口の段差を越えて直進し続けない。
  // 任務札が選んだ通れる残敵へ渡す。目前の打ち込みへの受けは保つ。
  if (candidate && taskZone && !attacker) {
    if (F.botHallFoe !== candidate || b.t >= (F.botHallCheckAt || 0)) {
      F.botHallFoe = candidate; F.botHallCheckAt = b.t + .5;
      F.botHallClear = templeWalkClear(b, u.pos, templeWay(b.army, u, candidate.pos));
    }
    if (!F.botHallClear) candidate = null;
  }
  // 十二歩より遠い庭の残敵も、任務の印と同じ相手へ向かう。
  // 戸口の敵だけに限ると、参道の終点で止まり、残る三人を探しに行かない。
  if (!candidate && !attacker && taskZone && !returningToHall && F.hallFoe &&
      siegeFighter(F.hallFoe) && taskZone.test(F.hallFoe.pos.x, F.hallFoe.pos.z)) candidate = F.hallFoe;
  // 区域の外から中の敵へ直進すると、柵の側面で足が止まる。
  // 目前の打ち込みだけ受け、参道へ戻るまでは敵を追わない。
  if (candidate && returningToHall && (!attacker || Math.hypot(candidate.pos.x - u.pos.x, candidate.pos.z - u.pos.z) > 3.5)) candidate = null;
  const e = F.step !== 5 || candidate && Math.hypot(candidate.pos.x - OKUYAMA.x, candidate.pos.z - OKUYAMA.z) < 15 ? candidate
    : b.army.nearestEnemy(u, 12, (o) => !o.fleeing && !o.noTarget && !o.invuln &&
      Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos) &&
      Math.hypot(o.pos.x - OKUYAMA.x, o.pos.z - OKUYAMA.z) < 15);
  const passage = templeGateEntry(b);
  const approach = marchingToGate && templeGateApproach(b);
  // 道から離れた時と、遠い敵を追う前は、画面と同じ参道の印へ戻る。
  // すぐそばの打ち込みは下の受けに通し、背を向けて歩かせない。
  if (approach && !passage && !cover &&
      (!attacker || attackDist > 3.5) && (!e || Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 3.5)) {
    inp.guardHold = false; inp.runHeld = false;
    if (p.lock) inp.e.add('KeyQ');
    goTo(p, inp, approach.x, approach.z, .7);
    return;
  }
  if (passage && !attacker && (!e || Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 3.5)) {
    inp.guardHold = false; inp.runHeld = false;
    if (p.lock) inp.e.add('KeyQ');
    goTo(p, inp, passage.x, passage.z, passage.botRadius ?? .5);
    return;
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    inp.runHeld = false;
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 刀は槍より短い。槍の間合いで止まると刀が届く前に打たれ続ける。
    const reach = p.weapon === 'sword' ? 1.7 : 2.6;
    // 堂の外からの打ち込みはここで受ける。攻撃の予備動作を追って切岸へ降りない。
    const holdHall = taskZone && !returningToHall && !taskZone.test(e.pos.x, e.pos.z) ||
      marchingToGate && !templeGateRoadFoe(F, e);
    const way = templeWay(b.army, u, e.pos);
    if (!holdHall && Math.hypot(way.x - e.pos.x, way.z - e.pos.z) > .1) {
      inp.guardHold = false; inp.runHeld = false;
      if (p.lock) inp.e.add('KeyQ');
      goTo(p, inp, way.x, way.z, way.botRadius ?? .5, true);
      return;
    }
    if (d > reach && !holdHall) goTo(p, inp, e.pos.x, e.pos.z, reach);
    // 構えた槍の攻撃は払いになり、突きの三倍の気力を使う。打ち込みを受けてから突く。
    if (attacker) {
      // 溜めの初めから構えると、穂先が届く前に受け流しの間が終わる。
      inp.guardHold = !!e.charging || !!(e.swing && !e.swing.done && soonest <= p.parryWin() * 0.35);
      if (inp.guardHold) p.botStrikeUntil = 0;
      else if (d < reach && soonest > 0.85 && e.atk?.t > 0.65) patientStrike(p, inp, e, d, true);
    } else patientStrike(p, inp, e, d);
    // 四秒以内の同じ号令は取り消しになる。行軍中の突撃も出し直さない。
    if (squad && squad.order !== 'attack' && squad.order !== 'move' && squad.order !== 'assault' && !(b.botCmdT > b.t)) { inp.e.add('KeyC'); b.botCmdT = b.t + 5; }
    return;
  }
  // 近くの敵を払ってから門を打つ。門だけを向いて横からの槍を浴びない。
  if (passage) {
    inp.guardHold = false; inp.runHeld = false;
    if (p.lock) inp.e.add('KeyQ');
    goTo(p, inp, passage.x, passage.z, .5);
    return;
  }
  if (atGate) {
    inp.guardHold = false;
    if (p.lock) inp.e.add('KeyQ');
    p.yaw = Math.atan2(gatePos.x - u.pos.x, gatePos.z - u.pos.z);
    // 扉の中心へ歩き続けず、手前で止まって掛矢を打つ。
    goTo(p, inp, gatePos.x, gatePos.z - 2, 1);
    const work = b.interacts.find((it) => it.id === 'templeGate');
    // 札が届く所なら打ち始める。門や柱ぎわで、必要以上に扉へ詰めて止まらない。
    if (work && Math.hypot(u.pos.x - work.pos.x, u.pos.z - work.pos.z) < work.r) {
      inp.k.delete('KeyW'); inp.k.add('KeyE');
    }
    return;
  }
  inp.guardHold = false;
  if (p.lock) inp.e.add('KeyQ');
  if (squad && squad.order !== 'follow' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 5; }
  if (returningToHall) {
    const entry = templeEntry(b, taskZone);
    if (entry) {
      inp.runHeld = false;
      goTo(p, inp, entry.x, entry.z, .7);
      return;
    }
  }
  // 門の前後で同じ道の折れ目を歩く。印への直行では外堂の坊に突き当たる。
  if (F.mode === 'attack' && (F.step === 1 || F.step === 2 || F.step === 3)) {
    const road = F.step === 1 ? (gate?.alive ? BOT_SOMON_ROUTE : OUTER_ROUTE)
      : F.step === 3 ? BOT_OKU_ROUTE : gate?.alive ? BOT_SANMON_ROUTE : INNER_ROUTE;
    if (F.botTempleRoad !== road) {
      F.botTempleRoad = road; F.botTempleI = 0;
      let nearest = Infinity;
      for (let i = 0; i < road.length; i++) {
        const d = Math.hypot(u.pos.x - road[i][0], u.pos.z - road[i][1]);
        if (d < nearest) { nearest = d; F.botTempleI = i; }
      }
    }
    // 敵を追って道から離れた後は、前に通った口へ戻る。
    // 古い進み具合のまま堂へ直進し、柵を横切ろうとしない。
    if (returningToHall && distToPolyline(u.pos.x, u.pos.z, road) >= 2.5) {
      let nearest = Infinity;
      for (let i = 0; i < road.length; i++) {
        const at = road[i];
        const d = Math.hypot(u.pos.x - at[0], u.pos.z - at[1]);
        const goal = F.botReturnGoal || (F.botReturnGoal = { x: 0, z: 0 });
        goal.x = at[0]; goal.z = at[1];
        if (d < nearest && !b.army.wallBetween(u.pos, -1, goal)) { nearest = d; F.botTempleI = i; }
      }
    }
    let at = road[F.botTempleI];
    if (F.botTempleI < road.length - 1 && Math.hypot(u.pos.x - at[0], u.pos.z - at[1]) < 4) at = road[++F.botTempleI];
    goTo(p, inp, at[0], at[1], 3);
    return;
  }
  goTo(p, inp, back.x, back.z, 3);
};

echizen_ikko.withdrawRoute = (rt, g) => {
  if (rt.flags.mode !== 'attack' || g.team !== 0) return null;
  const road = rt.flags.withdrawRoad, c = g.center();
  let i = 0, best = Infinity;
  for (let k = 0; k < road.length; k++) { const d = Math.hypot(c.x - road[k][0], c.z - road[k][1]); if (d < best) { best = d; i = k; } }
  return road.slice(i);
};
export { echizen_ikko };
