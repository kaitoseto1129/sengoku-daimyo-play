import { camNearMaterials } from './player.js';
import { dressStage } from './stage_dress.js';
import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
import { timeslipField } from './timeslip_field.js';
import { retreatThroughGap, retreatRunFromBlade } from './bot_retreat.js';
// ======================================================================
// 織田家編　志賀の陣・宇佐山城（元亀元年九月）
// 信長が摂津の野田・福島に出ている間に、浅井・朝倉の三万が湖の西を下って坂本へ出てきた。
// 宇佐山城を守る森可成は、信長の弟・織田信治とともに坂本で迎え撃ち、二人とも討ち死にした。
// 城は残った者たちが守り通し、摂津から戻った信長の前に、浅井・朝倉は比叡山へ上がった。
// 足軽は森可成の手。①坂本の町口で浅井・朝倉の先手を迎え撃つ ②大軍に押され、宇佐山城へ退く
// ③宇佐山城の木戸を守る（寄せ手が木戸を破りにかかる）。信長の後詰が来るまで持ちこたえる
// 九月十六日の町口の小勝ち→十九日の両手からの攻撃→城への退き→端城の放火と籠城→二十四日の後詰。
// 日をまたぐ経過は札で示す。両手の位置と木戸の攻防は遊びのための推定復元。
// 向き：東（+x）が琵琶湖。北（-z）から浅井・朝倉が湖の西を下ってくる。南（+z）の山の上に宇佐山城。西に比叡山
// ======================================================================
import { yamaLift, benchRoads } from './yamalift.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addInterior } from './naka.js';
import { nobori as makeNobori, hut, yagura, dou, kabukimon, tawara, ishigaki, dobei, palisade, makeSimpleBatch, finalizeSimpleBatch, makeKitBatch, finalizeKitBatch, solidRect } from './props.js';
import { S as SETTINGS } from './settings.js';
import { flagTexture } from './textures.js';
import { woodTex, leafTex, dirtTex } from './nature.js';
import { rockShape, groundRocks } from './rock_shape.js';
import { RANKS } from './state.js';
import { isTouch } from './touch.js';
import { signal, sfx, withPan, farNext } from './audio.js';
import { battleEvent, EVENT_RETREAT, EVENT_FIRE_START, EVENT_REINFORCEMENT, EVENT_VOLLEY } from './battle_events.js';
import { sightPoint } from './battle_sight.js';
import { drawGroundAt } from './render_camera.js';
import { gauss, enemyGroup as spawnEnemy, allyGroup, nm, centerOf, wallLine } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KIT, farHost } from './b_nagashinojo.js';
import { lines, camp } from './b_mid.js';
// 宇佐山城の縄張り・地形・町口の部隊・寄せの下知・本丸を守り切る勝ち。
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { kido, goten, horiboriHeight } from './castle_parts.js';
import { reset as flReset } from './floors.js';
import { makeSiegeZones, ZONE_STATE, siegeFighter } from './siege_zones.js';
import { makeGate, updateGates, resetGates } from './siege_gate.js';
import { gateUse } from './gate_use.js';
import { makeAttackAI } from './siege_ai.js';
import { makeButai, butaiTick } from './butai.js';
import { distToPolyline, WIND_STATE } from './world.js';
import { hieiWindow, PLACES } from './terrain_hiei.js';
import { USAYAMA_PLAN, HON_C, HILL_C, SAN_LEVEL, NI_LEVEL, HON_LEVEL, GATE_OUT, GATE_NI, GATE_HON, URA, WELL, ROAD as CASTLE_ROAD, PATH_WELL, RAMPS, WALLS, ATTACK_ROUTES, HOUSES, ALL_PATHS as CASTLE_PATHS, TANK, STONE_LINES, DITCHES } from './castles/usayama.js';

// この戦だけ折り返しの間を広げ、二の丸の番所の北から本丸の木戸へ回る。
// 本物の守兵・寄せ手と道の案内を同じ折れ線にする。城の縄張りと他の戦の道は変えない。
// 西端を二十メートル寄せ、六つの長い直線を合わせて百二十メートル縮める。
// 折り返しの数と南北の間隔は保ち、兵と案内と地面で同じ道を使う。
const ROAD = CASTLE_ROAD.map(([x, z], i) => [
  x === -115 && i >= 3 && i < 15 ? -95 : x,
  i >= 3 && i < 15 ? -50 + Math.floor((i - 3) / 2) * 16 : z,
]);
const ALL_PATHS = CASTLE_PATHS.map(p => p === CASTLE_ROAD ? ROAD : p);
// 北国海道は北の控えより先へ続く。旧い北端（－１９０）で道を止めない。
// 大津市「西近江路」：琵琶湖沿いに北行し、今津・海津から敦賀へ至る。
// https://www5.city.otsu.shiga.jp/kankyou/content.asp?key=0413000000&skey=34
// 道筋は推定復元。既存の地面・草木の判定を使い、兵列と城への案内は保つ。
const NORTH_LINK = [[ROAD[0][0], -240], ROAD[0]];
const NORTH_ROAD = [...NORTH_LINK, ...ROAD.slice(1, 3)];
// 公記の大津への進出と逢坂越えの後詰を、同じ湖西の街道で結ぶ。
// 道の位置・幅・勾配は縮小した推定復元。末尾の小曲輪への道の参照は保つ。
// 兵の移動線だけでなく地面と草木にも渡し、南の飾り山を隊列が横切らないようにする。
// 大津・逢坂へ続く道を、南の地面の端まで通す。二百十で行き止まりにしない。
// 『信長公記』巻三「志賀御陣之事」の二十日・二十一日・二十四日の往来に対応する。
// 南端の座標は推定復元。踏み土・地形・草木は既存の道の判定を共用する。
const LAKE_ROAD = [[70, -60], [70, 36], [70, 150], [70, 210], [70, 240]];
// 地形・踏み土・草木・刈田を同じ幅でそろえる。幅十八の後詰と路肩を確保する。
// 公記の大津進出・逢坂越えに対応する通路で、幅二十は遊びのための縮小復元。
const LAKE_ROAD_HALF_WIDTH = 10;
// 北から坂本へ入る道と、大津へ抜ける道の分岐。町屋・刈田を横切らずにつなぐ。
// 公記の坂本から大津への進出に対応する推定復元で、当時の分岐位置は確定しない。
// 後詰の下坂本の着点は LAKE_ROAD の北端に保ち、地面・草木・行軍で同じ接続を使う。
const LAKE_LINK = [ROAD[1], LAKE_ROAD[0]];
// 南下する一手は北の街道上で待つ。控えから分岐まで草地を斜めに横切らせない。
// 公記の二十日の大津進出を示す縮小復元。待機位置と隊の配分は史料で確定しない。
const BYPASS_WAIT_Z = -104;
const BYPASS_WAIT = [ROAD[0][0] + (ROAD[1][0] - ROAD[0][0]) *
  (BYPASS_WAIT_Z - ROAD[0][1]) / (ROAD[1][1] - ROAD[0][1]), BYPASS_WAIT_Z];
// 兵の着点は従来の二百十に保ち、最後尾まで地面の内側で待つ。道だけは南へ続ける。
const BYPASS_ROAD = [BYPASS_WAIT, ...LAKE_LINK, ...LAKE_ROAD.slice(1, -1)];
ALL_PATHS.splice(ALL_PATHS.length - 1, 0, NORTH_LINK, LAKE_LINK, LAKE_ROAD);

// この戦の置き幟だけを控えに入れる。持ち主の兵・開閉する門はまとめない。
function nobori(world, x, z, kind, h = 5) {
  const flag = makeNobori(world, x, z, kind, h);
  flag.userData.shigaEnemy = kind === 'azai' || kind === 'asakura';
  (world.shigaFlags || (world.shigaFlags = [])).push(flag);
  return flag;
}

function batchShigaFlags(rt) {
  const flags = rt.world.shigaFlags || [], groups = new Map(), materials = new Map();
  rt.world.separateFireFlags();
  for (const root of flags) {
    root.updateWorldMatrix(true, true);
    root.traverse((part) => {
      if (!part.isMesh) return;
      // 近くの透け方とはためく位相を、束の原点でなく各幟の位置で決める。
      const base = part.material;
      let mat = materials.get(base);
      if (!mat) {
        mat = base.clone();
        if (camNearMaterials.has(base)) camNearMaterials.add(mat);
        if (false) mat.forceSinglePass = true; // 薄い布と竿は裏表を一度に描く。
        mat.onBeforeCompile = (shader, renderer) => {
          base.onBeforeCompile.call(base, shader, renderer);
          shader.vertexShader = shader.vertexShader.replaceAll(
            'modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)',
            'modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)');
          // 狭い坂と木戸では、少し離れた布も兵の姿を塞ぐ。竿と布を同じ距離で透かす。
          shader.vertexShader = shader.vertexShader.replace(
            'smoothstep(2.0, 10.0, length(nearRoot.xz - cameraPosition.xz))',
            'smoothstep(3.0, 14.0, length(nearRoot.xz - cameraPosition.xz))');
        };
        mat.customProgramCacheKey = () => base.customProgramCacheKey() + '_志賀の置き幟';
        materials.set(base, mat);
      }
      // 敵の撤収用の束を分け、高画質のまま区画ごとに画面外判定を行う。
      const key = Number(root.userData.shigaEnemy) + ':' + part.geometry.uuid + ':' + base.uuid + ':' +
        Math.floor(root.position.x / 48) + ':' + Math.floor(root.position.z / 48);
      let group = groups.get(key);
      if (!group) { group = { geo: part.geometry, mat, parts: [], enemy: root.userData.shigaEnemy }; groups.set(key, group); }
      group.parts.push(part);
    });
  }
  for (const group of groups.values()) {
    const mesh = new THREE.InstancedMesh(group.geo, group.mat, group.parts.length);
    group.parts.forEach((part, i) => mesh.setMatrixAt(i, part.matrixWorld));
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    rt.scene.add(mesh);
    if (group.enemy) (rt.flags.enemyFlagBatches || (rt.flags.enemyFlagBatches = [])).push(mesh);
    rt.world.viewCull([mesh], 16);
  }
  for (const root of flags) root.removeFromParent();
  flags.length = 0;
}

function enemyGroup(rt, o, list) {
  const { marchTo, ...spawnOrders } = o;
  // 後の段の兵も開戦時から控えに置く。位置と死傷者を引き継ぎ、補充しない。
  const ready = rt.flags.roster?.[o.name];
  if (ready) {
    const { anchor, fixed, morale, noRout, ...orders } = spawnOrders;
    const advancing = o.order === 'attack' && !ready.routed;
    Object.assign(ready, orders, { dmgMult: 1, formation: 'yari', width: 4 });
    if (advancing && anchor) {
      // 待機場所で攻撃に替えるだけでは、旗と後列が北に残る。隊ごと町口へ寄せる。
      const to = marchTo || anchor, speed = ready.speed;
      ready.order = 'move'; ready.dest = { x: to.x, z: to.z };
      if (marchTo) ready.speed = 2.8;
      ready.onArrive = (g) => { g.order = 'attack'; g.speed = speed; };
    }
    return ready;
  }
  let room = 245;
  for (const u of rt.army.units) if (u.alive && !u.farSim && u.type !== 'dummy') room--;
  const limited = [];
  for (const e of list) {
    const n = Math.max(0, Math.min(e.n, room));
    if (n) limited.push({ ...e, n });
    room -= n;
  }
  return spawnEnemy(rt, { ...spawnOrders, fixed: true, dmgMult: 1, formation: 'yari', width: 4 }, limited);
}

function keepRoad(g, path, facing) {
  if (!g._keepSlot) {
    g._keepSlot = g.slotPos;
    g._keepSlots = Array.from({ length: g.initial }, () => ({ x: 0, z: 0, i: 0, path: null, unit: null }));
    for (const u of g.units) g._keepSlots[u.slot].unit = u;
    g.slotPos = function (i, n) {
      const q = this._keepSlots[i], u = q.unit;
      if (!q.path || !u || this.order !== 'path' && this.order !== 'hold') return this._keepSlot(i, n);
      const road = q.path;
      while (q.i < road.length && Math.hypot(u.pos.x - road[q.i][0], u.pos.z - road[q.i][1]) < 1.8) q.i++;
      if (q.i < road.length) { q.x = road[q.i][0]; q.z = road[q.i][1]; return q; }
      // 木戸の奥で三列に詰める。長い縦隊の後尾を木戸の外へ置かない。
      const last = road[road.length - 1], back = Math.floor(i / 3) * 1.4, side = (i % 3 - 1) * 1.2;
      q.x = last[0] - Math.sin(this._keepFace) * back + Math.cos(this._keepFace) * side;
      q.z = last[1] - Math.cos(this._keepFace) * back - Math.sin(this._keepFace) * side;
      return q;
    };
  }
  for (const q of g._keepSlots) {
    const remaining = q.path ? q.path.slice(q.i) : [];
    q.path = [...remaining, ...path]; q.i = 0;
  }
  g._keepFace = facing;
  g.order = 'path'; g.path = path; g.pathIdx = 0; g.formation = 'column'; g.colW = 1; g.aggro = 2;
}

const TOWN = { x: 20, z: 10 };             // 坂本の町口
const TOWN_POST = { x: TOWN.x + 8, z: TOWN.z - 2 }; // 組と森の槍の列の間で受ける
// 家の壁と庭塀より北の空き地で受ける。隊の中心だけでなく、後列と旗持ちの場所も空ける。
const NOBUHARU_POST = { x: TOWN.x + 22, z: TOWN.z - 16 };
const AOCHI_POST = { x: TOWN.x - 15, z: TOWN.z - 13 };
// 公記は浅井・朝倉の寄せを記すが、左右の割り振りは不明。
// 本戦の推定配置（山側が浅井、街道側が朝倉）を十六日の先手にも通す。
// 控え・進軍先をそろえ、浅井の先手だけが朝倉の湖側へ交差するのを防ぐ。
const AZAI_VANGUARD_WAIT = { x: -12, z: -68 };
const AZAI_VANGUARD_FRONT = { x: AZAI_VANGUARD_WAIT.x, z: -10 };
const TOWN_HOMES = [[36, 20, .1], [44, 4, -.2], [48, -14, .2], [34, -24, 0], [2, 24, .3], [-6, 6, -.1], [52, 30, .2]];
// 湖側の刈田。民の避難路（東８２〜８４ｍ）と家の菜園を空ける。
const TOWN_FIELDS = [[66, -42, 16, 18], [68, 10, 12, 18], [66, -108, 16, 18]];
function townPaddy(x, z) {
  // 『信長公記』の大津への進出・逢坂越えの後詰を通す復元街道。
  // 地表の色だけでなく、刈株の生成と田の判定も道の外にそろえる。
  if (distToPolyline(x, z, LAKE_ROAD) < LAKE_ROAD_HALF_WIDTH + .5 ||
      ALL_PATHS.some(p => p !== LAKE_ROAD && distToPolyline(x, z, p) < 4.5)) return 0;
  return TOWN_FIELDS.some(([cx, cz, w, d]) => Math.abs(x - cx) < w / 2 && Math.abs(z - cz) < d / 2) ? 1 : 0;
}
function homePoint(home, lx, lz) {
  const [x, z, r] = home, c = Math.cos(r), s = Math.sin(r);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}
// 入口の印を兵に押されて通り過ぎても、坂の道幅内なら先へ案内する。
// 折り返しの角には使わず、柵の外から入口を飛ばせないようにする。
function passedShigaEntry(p, path) {
  const a = path[0], b = path[1], dx = b[0] - a[0], dz = b[1] - a[1];
  const length = Math.hypot(dx, dz), x = p.x - a[0], z = p.z - a[1];
  const along = (x * dx + z * dz) / length;
  return along > 0 && along < length && Math.abs(x * dz - z * dx) / length < 1.8;
}
// 町屋と物見の芯を体積で避ける。格子の隙間を通る線でも、視点を裏へ回さない。
// 向き・土台・幅は設営時に控え、毎コマは数値だけで線分を調べる。
function townCameraHit(home, from, to) {
  const x = from.x - home.x, z = from.z - home.z;
  const dx = to.x - from.x, dz = to.z - from.z;
  const fx = x * home.c - z * home.s, fz = x * home.s + z * home.c;
  const vx = dx * home.c - dz * home.s, vz = dx * home.s + dz * home.c;
  let enter = 0, leave = 1;
  for (let axis = 0; axis < 3; axis++) {
    const start = axis === 0 ? fx : axis === 1 ? from.y - home.y : fz;
    const delta = axis === 0 ? vx : axis === 1 ? to.y - from.y : vz;
    const low = axis === 0 ? -(home.w ?? 3.7) : axis === 1 ? (home.bottom ?? -.4) : -(home.d ?? 2.7);
    const high = axis === 0 ? (home.w ?? 3.7) : axis === 1 ? (home.h ?? 2.85) : (home.d ?? 2.7);
    if (Math.abs(delta) < 1e-8) {
      if (start < low || start > high) return null;
      continue;
    }
    const a = (low - start) / delta, b = (high - start) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return null;
  }
  return enter;
}
// 町の設営時だけ作る。板・筵と畝は各一束、葉は既存の低木の形と材質を借りる。
// 坂本の町屋の足元：壁の下に野面の石の土台、軒下に積んだ薪と桶（10/28 採点：家の下に石の土台、軒下に薪と桶）。
// 三つの InstancedMesh（三回の描画）にまとめ、毎コマの処理は無い。道や逃げ道は塞がない（当たり判定なし）。
function sakamotoEaves(rt, homes) {
  const W = rt.world, pose = new THREE.Object3D(), color = new THREE.Color();

  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const stones = [], logs = [], tubs = [];
  for (const [n, h] of homes.entries()) {
    const c = Math.cos(h.r), s = Math.sin(h.r);
    const at = (lx, lz) => ({ x: h.x + lx * c + lz * s, z: h.z - lx * s + lz * c });
    // 四辺の壁の下に、壁より少し外へ出した石を並べる。
    for (const [ax, az, len, along] of [[0, -h.d / 2, h.w, 1], [0, h.d / 2, h.w, 1], [-h.w / 2, 0, h.d, 0], [h.w / 2, 0, h.d, 0]]) {
      const k = Math.ceil(len / .5);
      for (let i = 0; i < k; i++) {
        const t = -len / 2 + (i + .5) * len / k;
        const out = .16;
        const lx = along ? t : ax + Math.sign(ax) * out, lz = along ? az + Math.sign(az) * out : t;
        stones.push({ ...at(lx, lz), y: h.y + .12, r: h.r + rnd() * .5, sx: .3 + rnd() * .1, sy: .3 + rnd() * .12, sz: .26 + rnd() * .08, g: .13 + rnd() * .1, moss: rnd() < .25 });
      }
    }
    // 軒下（長い壁の外）に薪の山と桶。表と裏の両方に置き、通りから見る向きでも軒下の暮らしが写るようにする（10/28）。
    for (const side of [1, -1]) {
      const wz = side * (h.d / 2 + .4), wx = ((n + (side > 0 ? 0 : 1)) % 3 - 1) * 1.6;
      for (let row = 0; row < 7; row++) for (let i = 0; i < 10 - (row > 4 ? 1 : 0); i++) {
        const p = at(wx + (i - (9 - (row > 4 ? 1 : 0)) / 2) * .17 + (row % 2) * .08, wz);
        logs.push({ ...p, y: h.y + .09 + row * .15, r: h.r, l: .75 + rnd() * .15, g: .75 + rnd() * .35 });
      }
      const tp = at(wx + 1.25 * (side > 0 ? 1 : -1), side * (h.d / 2 + .5));
      tubs.push({ ...tp, y: h.y });
    }
  }
  // 角ばった十二面体でなく、少し崩した丸い野面石（形は一つを使い回す）。
  const stoneGeo = new THREE.IcosahedronGeometry(1, 2);
  { const a = stoneGeo.attributes.position; for (let i = 0; i < a.count; i++) { const x = a.getX(i), y = a.getY(i), z = a.getZ(i), k = 1 + .14 * Math.sin(x * 5.1 + z * 3.7) * Math.cos(y * 4.3 - x * 2.2); a.setXYZ(i, x * k, Math.max(y * k, -.35), z * k); } stoneGeo.computeVertexNormals(); }
  const stoneMesh = new THREE.InstancedMesh(stoneGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), stones.length);
  stones.forEach((t, i) => {
    pose.position.set(t.x, Math.max(t.y, W.heightAt(t.x, t.z) + .04), t.z);
    pose.rotation.set(0, t.r, 0); pose.scale.set(t.sx, t.sy, t.sz); pose.updateMatrix();
    stoneMesh.setMatrixAt(i, pose.matrix);
    // 色は線形の値。明るすぎると白い歯の列に見えるので、灰褐の野面石へ沈め、三つに一つは苔の緑を差す（10/28）
    stoneMesh.setColorAt(i, t.moss ? color.setRGB(t.g * .82, t.g * .95, t.g * .58) : color.setRGB(t.g, t.g * .93, t.g * .8));
  });
  const logGeo = new THREE.CylinderGeometry(.08, .085, 1, 7); logGeo.rotateZ(Math.PI / 2); logGeo.rotateY(Math.PI / 2);
  const logMesh = new THREE.InstancedMesh(logGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), logs.length);
  logs.forEach((t, i) => {
    pose.position.set(t.x, t.y, t.z); pose.rotation.set(0, t.r, 0); pose.scale.set(1, 1, t.l); pose.updateMatrix();
    logMesh.setMatrixAt(i, pose.matrix);
    logMesh.setColorAt(i, color.setRGB(.5 * t.g, .36 * t.g, .22 * t.g));
  });
  // 桶：底のある木の桶に、竹の箍を二本（一つの形にまとめ、描くのは一回）。
  const tubGeo = mergeGeometries([new THREE.CylinderGeometry(.36, .3, .62, 14).translate(0, .31, 0),
    new THREE.TorusGeometry(.345, .025, 4, 14).rotateX(Math.PI / 2).translate(0, .14, 0), new THREE.TorusGeometry(.365, .025, 4, 14).rotateX(Math.PI / 2).translate(0, .5, 0)]);
  const tubMat = new THREE.MeshLambertMaterial({ color: 0x7a5c3c });
  const tubMesh = new THREE.InstancedMesh(tubGeo, tubMat, tubs.length);
  tubs.forEach((t, i) => {
    pose.position.set(t.x, Math.max(t.y, W.heightAt(t.x, t.z)), t.z); pose.rotation.set(0, 0, 0); pose.scale.set(1, 1, 1); pose.updateMatrix();
    tubMesh.setMatrixAt(i, pose.matrix);
  });
  for (const m of [stoneMesh, logMesh, tubMesh]) { m.castShadow = true; m.receiveShadow = true; rt.scene.add(m); }
}
function sakamotoYards(rt) {
  const W = rt.world, pose = new THREE.Object3D(), color = new THREE.Color();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const boards = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, TOWN_HOMES.length * 13);
  // 畝は土へ埋めた丸い盛りにする。角張った端と平らな天面を板に見せない。
  const ridgeGeo = new THREE.SphereGeometry(.5, 8, 4);
  const ridges = new THREE.InstancedMesh(ridgeGeo, mat, TOWN_HOMES.length * 12);
  // world.js の低木（十四枚の葉群）を共用し、新しい葉の絵や材質を増やさない。
  const bush = rt.scene.children.find(o => o.isInstancedMesh && o.geometry.attributes.position.count === 14 * 9 && o.material.map === leafTex('broad'));
  const hedge = bush ? new THREE.InstancedMesh(bush.geometry, bush.material, TOWN_HOMES.length * 6) : null;
  let bn = 0, rn = 0, hn = 0;
  const put = (mesh, n, home, lx, lz, w, h, d, hex, dy = 0) => {
    const [x, z] = homePoint(home, lx, lz);
    if (ALL_PATHS.some(p => distToPolyline(x, z, p) < 2 + Math.max(w, d) / 2) || CIVILIAN_PATHS.some(p => distToPolyline(x, z, p) < 4)) return n;
    pose.position.set(x, W.heightAt(x, z) + h / 2 + dy, z);
    pose.rotation.set(0, home[2], 0); pose.scale.set(w, h, d); pose.updateMatrix();
    mesh.setMatrixAt(n, pose.matrix); mesh.setColorAt(n, color.setHex(hex));
    return n + 1;
  };
  for (const home of TOWN_HOMES) {
    // 一辺だけの板塀。戸口（＋ｚ）と道には口を残し、兵の当たりを増やさない。
    for (let i = 0; i < 9; i++) bn = put(boards, bn, home, -5.3, -3.2 + i * .8, .11, .6, .77, i % 3 === 0 ? 0x675b47 : 0x80735b);
    for (const z of [-3.6, 0, 3.6]) bn = put(boards, bn, home, -5.3, z, .18, .72, .18, 0x514533);
    // 薪棚は hut に既設。戸の横へ筵を一枚だけ添える。
    bn = put(boards, bn, home, -2.1, 3, 1.1, .035, .65, 0x9e8b5b, .02);
    for (let row = 0; row < 4; row++) for (let j = 0; j < 3; j++) {
      rn = put(ridges, rn, home, 5.6 + row * .9, -1.85 + j * 1.85, .65, .24, 1.94, row % 2 ? 0x81704f : 0x8c7956, -.1);
    }
    if (hedge) for (let j = 0; j < 6; j++) {
      // 庭の奥で家々をつなぐ。道と民の逃げ道へは葉を張り出さない。
      const [x, z] = homePoint(home, -3.3 + j * 1.3, -5);
      if (ALL_PATHS.some(p => distToPolyline(x, z, p) < 3) || CIVILIAN_PATHS.some(p => distToPolyline(x, z, p) < 4)) continue;
      pose.position.set(x, W.heightAt(x, z) - .08, z);
      pose.rotation.set(0, home[2] + j * .7, 0); pose.scale.set(1.15, .65, .9); pose.updateMatrix();
      hedge.setMatrixAt(hn, pose.matrix); hedge.setColorAt(hn++, color.setHex(j % 3 ? 0x677044 : 0x807044));
    }
  }
  boards.count = bn; ridges.count = rn;
  for (const mesh of [boards, ridges]) {
    mesh.receiveShadow = true; mesh.castShadow = mesh === boards;
    mesh.computeBoundingSphere(); rt.scene.add(mesh); W.viewCull([mesh], 0, mesh === ridges ? 65 : 95);
  }
  if (hedge) {
    hedge.count = hn; hedge.receiveShadow = true; hedge.castShadow = true;
    hedge.computeBoundingSphere(); rt.scene.add(hedge); W.viewCull([hedge], 0, 65);
  }
}

// 25秒の町口（20,10 から半径50m）の広場：一色の黄褐の地面に、枯れかけの草の群れと青い草の斑、
// 道の轍と路肩の草、落ち藁・小石。群れは低い周波の斑で寄せ、一面に同じ密度で撒かない。当たりは足さない。
function shigaTownGround(rt) {
  const W = rt.world, o = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), color = new THREE.Color();
  let seed = 70913;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const blades = [];
  // 細い葉を14本、表と裏の両方を表の面にする（裏返った面が下向きの法線で黒い板に見えないように。10/29）。
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4 + .3, ca = Math.cos(a), sa = Math.sin(a), w = .022 + (i % 3) * .006, lean = .12 + (i % 5) * .07, h = .26 + (i % 4) * .09;
    const bx = ca * .06, bz = sa * .06;
    const L = [bx - sa * w, 0, bz + ca * w], R = [bx + sa * w, 0, bz - ca * w], T = [ca * lean, h, sa * lean];
    blades.push(...L, ...R, ...T, ...R, ...L, ...T);
  }
  const tuft = new THREE.BufferGeometry(); tuft.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3)); tuft.computeVertexNormals();
  { const n = tuft.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * .3, 1, n.getZ(i) * .3); }
  const patch = new THREE.CircleGeometry(1, 9); patch.rotateX(-Math.PI / 2);
  { const a = patch.attributes.position; for (let i = 1; i < a.count; i++) { const k = .6 + ((i * 53) % 13) / 26; a.setXYZ(i, a.getX(i) * k, 0, a.getZ(i) * k); } }
  const strip = new THREE.PlaneGeometry(1, 1); strip.rotateX(-Math.PI / 2);
  const stone = new THREE.DodecahedronGeometry(1, 0);
  const sets = [[tuft, []], [patch, []], [strip, []], [stone, []]];
  const onPath = (x, z, d) => ALL_PATHS.some((q) => distToPolyline(x, z, q) < d);
  const inHome = (x, z) => TOWN_HOMES.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 7.5);
  const lay = (x, z) => {
    nrm.set(W.heightAt(x - .5, z) - W.heightAt(x + .5, z), 1, W.heightAt(x, z - .5) - W.heightAt(x, z + .5)).normalize();
    o.quaternion.setFromUnitVectors(up, nrm);
  };
  const put = (k, x, z, sx, sy, sz, c, ry, dy = 0) => {
    o.position.set(x, W.heightAt(x, z) + dy, z); o.scale.set(sx, sy, sz);
    if (k === 1 || k === 2) { lay(x, z); o.rotateY(ry); } else o.rotation.set((rnd() - .5) * .2, ry, (rnd() - .5) * .2);
    o.updateMatrix(); sets[k][1].push([o.matrix.clone(), c]);
  };
  const clump = (x, z) => .5 + .5 * Math.sin(x * .21 + Math.sin(z * .17) * 2.1) * Math.cos(z * .19 - x * .07);
  for (let i = 0; i < 2600; i++) {
    const a = rnd() * 6.283, r = 50 * Math.sqrt(rnd()), x = TOWN.x + Math.cos(a) * r, z = TOWN.z + Math.sin(a) * r;
    if (townPaddy(x, z) || inHome(x, z) || x > 74) continue;
    const road = onPath(x, z, 2.4), k = clump(x, z);
    if (road) {
      // 道の真ん中：踏まれた土の濃い斑と落ち藁、小石だけ。
      if (rnd() < .12) put(1, x, z, .5 + rnd() * .8, 1, .3 + rnd() * .5, rnd() < .5 ? 0x4a3c2a : 0x8a7a50, rnd() * 6, .03);
      else if (rnd() < .06) { const s = .05 + rnd() * .09; put(3, x, z, s * 1.3, s * .7, s, rnd() < .5 ? 0x77705f : 0x5f5a50, rnd() * 6, s * .2); }
      continue;
    }
    if (rnd() > .25 + k * .75) continue;
    if (rnd() < .78) {
      const g = .5 + rnd() * .55 + k * .3, c = rnd() < .45 ? 0xa59560 : rnd() < .5 ? 0x7d8650 : 0x6a7448;
      put(0, x, z, g, g * (.8 + rnd() * .5), g, c, rnd() * 6, -.02);
    } else if (rnd() < .7) {
      put(1, x, z, .8 + rnd() * 1.6, 1, .6 + rnd() * 1.1, rnd() < .4 ? 0x4c5a30 : rnd() < .5 ? 0x5a4630 : 0x7a6a40, rnd() * 6, .035);
    } else { const s = .07 + rnd() * .14; put(3, x, z, s * 1.3, s * .7, s, rnd() < .5 ? 0x77705f : 0x5f5a50, rnd() * 6, s * .2); }
  }
  // 轍：町の中の道に、荷車の二本の濃い筋（幅0.25m・間1.5m）。
  for (const q of ALL_PATHS) for (let i = 1; i < q.length; i++) {
    const [ax, az] = q[i - 1], [bx, bz] = q[i], len = Math.hypot(bx - ax, bz - az);
    if (len < .1) continue;
    const tx = (bx - ax) / len, tz = (bz - az) / len, ry = Math.atan2(tx, tz);
    for (let d = 0; d < len; d += 1.6) {
      const cx = ax + tx * d, cz = az + tz * d;
      if (Math.hypot(cx - TOWN.x, cz - TOWN.z) > 48 || townPaddy(cx, cz)) continue;
      for (const sd of [-.75, .75]) {
        const x = cx - tz * sd + (rnd() - .5) * .08, z = cz + tx * sd + (rnd() - .5) * .08;
        put(2, x, z, .3 + rnd() * .06, 1, 2.6, rnd() < .5 ? 0x3e3224 : 0x463828, ry + (rnd() - .5) * .05, .045);
      }
    }
  }
  // 斑と轍の縁をぼかす小さな絵（64画素の放射のぼかし。斑の多角形の縁を見せない）。
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  { const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, '#fff'); gr.addColorStop(.55, '#bbb'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const soft = new THREE.CanvasTexture(cv);
  for (const [geo, list] of sets) {
    const k = sets.findIndex((e) => e[0] === geo);
    if (!list.length) continue;
    const flat = k === 1 || k === 2;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.FrontSide, flatShading: k === 3,
      transparent: flat, opacity: k === 1 ? .55 : k === 2 ? .6 : 1, alphaMap: flat ? soft : null, depthWrite: !flat, polygonOffset: flat, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), list.length);
    mesh.name = 'shigaTownGround' + k; if (flat) mesh.renderOrder = 1;
    list.forEach(([m, c], i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, color.setHex(c)); });
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); mesh.castShadow = false; mesh.receiveShadow = true;
    rt.scene.add(mesh); W.viewCull([mesh], 0, 75, false);
  }
}

// 本の井楼と裏方小屋を手本にした推定の設営。城の模型とは別に、本陣の横だけに置く。
// 形は二つの陣で共用し、遠くは骨組みと屋根、近くは竹束と縄目を各一束で描く。
function shigaCampWorks(rt) {
  const W = rt.world, box = new THREE.BoxGeometry(1, 1, 1);
  const pole = new THREE.CylinderGeometry(1, 1, 1, 6);
  const ring = new THREE.TorusGeometry(1, .045, 3, 10);
  const wood = new THREE.MeshLambertMaterial({ color: 0xffffff, map: woodTex() });
  const rope = new THREE.MeshLambertMaterial({ color: 0x827355 });
  const pose = new THREE.Object3D(), tint = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0), delta = new THREE.Vector3();
  for (const [cx, cz, watch] of [[58, -150, true], [-53, -150, false]]) {
    const planks = [], logs = [], bamboo = [], ties = [];
    const plank = (x, y, z, w, h, d, color, tilt = 0) => {
      pose.position.set(x, y, z); pose.rotation.set(tilt, 0, 0); pose.scale.set(w, h, d);
      pose.updateMatrix(); planks.push({ matrix: pose.matrix.clone(), color });
    };
    const beam = (parts, ax, ay, az, bx, by, bz, r, color) => {
      delta.set(bx - ax, by - ay, bz - az);
      pose.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      pose.quaternion.setFromUnitVectors(up, delta.clone().normalize());
      pose.scale.set(r, delta.length(), r); pose.updateMatrix();
      parts.push({ matrix: pose.matrix.clone(), color });
    };
    // 兵糧の雨覆い。四隅の柱はそれぞれ地面へ差し、片流れの板葺きに押さえ木を載せる。
    const y = Math.max(...[-1, 1].flatMap(sx => [-1, 1].map(sz => W.heightAt(cx + sx * 1.7, cz + sz * 2)))) + .15;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = cx + sx * 1.7, z = cz + sz * 2;
      beam(logs, x, W.heightAt(x, z) - .2, z, x, y + 2.3 + sz * .3, z, .09, 0x82715a);
    }
    for (let i = 0; i < 12; i++) plank(cx - 1.93 + i * .35, y + 2.35, cz, .36, .1, 4.9, i % 3 ? 0x8b7b60 : 0x726149, -.15);
    for (const z of [-1.7, 1.7]) beam(logs, cx - 2.1, y + 2.47 + z * .15, cz + z, cx + 2.1, y + 2.47 + z * .15, cz + z, .065, 0x514633);
    plank(cx, y + .15, cz, 3.1, .18, 3.4, 0x76654c);
    // 板床の上の俵。縄は近景だけ。既存の兵糧と同じ大きさに抑える。
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3 - row; col++) {
      const x = cx - .9 + col * .85 + row * .4, by = y + .5 + row * .5, z = cz - .6;
      beam(bamboo, x, by, z - .48, x, by, z + .48, .3, 0xb19b65);
      for (const dz of [-.3, .3]) {
        pose.position.set(x, by, z + dz); pose.rotation.set(0, 0, 0); pose.scale.setScalar(.31); pose.updateMatrix();
        ties.push({ matrix: pose.matrix.clone(), color: 0xffffff });
      }
    }
    // 運ぶ前の竹束は小屋の脇。前線へ並べたり、通行・矢玉の判定を変えたりしない。
    for (let bundle = 0; bundle < 3; bundle++) {
      const x = cx - 1 + bundle * .8, z = cz + 3.4, by = W.heightAt(x, z);
      for (let i = 0; i < 7; i++) {
        const a = i * Math.PI / 3, r = i === 6 ? 0 : .17;
        const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r;
        beam(bamboo, bx, by, bz, bx + .08, by + 1.55 + (i % 3) * .07, bz, .07, i % 2 ? 0x8e9060 : 0x727b48);
      }
      for (const h of [.4, 1.15]) {
        pose.position.set(x + .03, by + h, z); pose.rotation.set(Math.PI / 2, 0, 0); pose.scale.setScalar(.27); pose.updateMatrix();
        ties.push({ matrix: pose.matrix.clone(), color: 0xffffff });
      }
    }
    if (watch) {
      // 車輪のない低い井楼。四本柱・筋交い・板囲い・狭間と、背後から上がる梯子。
      // 宇佐山城の櫓と競う高層の塔や、平城用の行天橋は足さない。
      const tz = cz - 7, floor = Math.max(...[-1, 1].flatMap(sx => [-1, 1].map(sz => W.heightAt(cx + sx * 1.2, tz + sz * 1.2)))) + 3.6;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = cx + sx * 1.2, z = tz + sz * 1.2;
        beam(logs, x, W.heightAt(x, z) - .25, z, x, floor + 1.6, z, .13, 0x71614b);
      }
      for (const sx of [-1, 1]) {
        beam(logs, cx + sx * 1.2, floor - 3, tz - 1.2, cx + sx * 1.2, floor - .1, tz + 1.2, .08, 0x857253);
        beam(logs, cx - 1.4, floor - .16, tz + sx * 1.2, cx + 1.4, floor - .16, tz + sx * 1.2, .11, 0x594c38);
      }
      for (let i = 0; i < 9; i++) plank(cx - 1.16 + i * .29, floor, tz, .28, .12, 2.65, i % 3 ? 0x9a885f : 0x85704c);
      for (let i = 0; i < 8; i++) {
        const x = cx - 1.1 + i * .315;
        plank(x, floor + .45, tz + 1.25, .3, .85, .08, 0xa29268);
        plank(x, floor + 1.36, tz + 1.25, .3, .24, .08, 0x96845a);
        if (i % 3 !== 1) plank(x, floor + 1, tz + 1.25, .3, .3, .08, 0xa29268);
        for (const sx of [-1, 1]) plank(cx + sx * 1.25, floor + .78, tz - 1.1 + i * .315, .08, 1.48, .3, 0x96845a);
      }
      const foot = W.heightAt(cx, tz - 2.8);
      for (const sx of [-1, 1]) beam(logs, cx + sx * .36, foot, tz - 2.8, cx + sx * .36, floor + .4, tz - 1.1, .045, 0x7c6e50);
      for (let i = 1; i <= 10; i++) {
        const t = i / 11;
        beam(logs, cx - .36, foot + (floor + .4 - foot) * t, tz - 2.8 + 1.7 * t, cx + .36, foot + (floor + .4 - foot) * t, tz - 2.8 + 1.7 * t, .035, 0x97835b);
      }
    }
    for (const [parts, geometry, material, far] of [[planks, box, wood, 170], [logs, pole, wood, 170], [bamboo, pole, wood, 65], [ties, ring, rope, 35]]) {
      const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
      parts.forEach((part, i) => { mesh.setMatrixAt(i, part.matrix); mesh.setColorAt(i, tint.setHex(part.color)); });
      mesh.receiveShadow = true; mesh.computeBoundingSphere(); rt.scene.add(mesh); W.viewCull([mesh], 0, far);
    }
  }
  // 刈田の湖側に稲架。町口の戦列・街道・東八十二メートルの避難路は空ける。
  // 秋の穂と垂れた藁を二本ずつ掛け、遠くでは細かい藁を送らない。
  const harvest = [], stakes = [];
  const stalk = (parts, ax, ay, az, bx, by, bz, r, color) => {
    delta.set(bx - ax, by - ay, bz - az);
    pose.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    pose.quaternion.setFromUnitVectors(up, delta.clone().normalize());
    pose.scale.set(r, delta.length(), r); pose.updateMatrix();
    parts.push({ matrix: pose.matrix.clone(), color });
  };
  for (const [x, z] of [[73, -42], [73, -108]]) {
    const top = Math.max(W.heightAt(x, z - 2.6), W.heightAt(x, z + 2.6)) + 1.65;
    for (const end of [-1, 1]) for (const side of [-1, 1]) {
      const sx = x + side * .6, sz = z + end * 2.6;
      stalk(stakes, sx, W.heightAt(sx, sz) - .1, sz, x, top + .15, sz, .055, 0x756249);
    }
    stalk(stakes, x, top, z - 3, x, top, z + 3, .07, 0x827052);
    for (let i = 0; i < 15; i++) for (const side of [-1, 1]) {
      const sz = z - 2.5 + i * .35;
      stalk(harvest, x + side * .08, top + .1, sz, x + side * .32, top - .75 - (i % 3) * .06, sz + .06, .12, i % 3 ? 0x9e8c51 : 0xb3a16b);
    }
  }
  for (const [parts, far] of [[stakes, 95], [harvest, 55]]) {
    const mesh = new THREE.InstancedMesh(pole, wood, parts.length);
    parts.forEach((part, i) => { mesh.setMatrixAt(i, part.matrix); mesh.setColorAt(i, tint.setHex(part.color)); });
    mesh.receiveShadow = true; mesh.computeBoundingSphere(); rt.scene.add(mesh); W.viewCull([mesh], 0, far);
  }
}

function sakamotoRoofTint(source) {
  const mat = source.clone(), before = source.onBeforeCompile;
  if (camNearMaterials.has(source)) camNearMaterials.add(mat);
  mat.onBeforeCompile = (sh, renderer) => {
    before.call(mat, sh, renderer);
    sh.vertexShader = 'varying vec3 vSakamotoRoof;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvSakamotoRoof = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vSakamotoRoof;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float stain = sin(vSakamotoRoof.x * 1.7 + sin(vSakamotoRoof.z * 1.3)) * sin(vSakamotoRoof.z * 2.1);
      float moss = smoothstep(0.05, 0.65, stain) * 0.38;
      float soot = smoothstep(0.2, 0.85, -stain) * 0.30;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.58, 0.70, 0.43), moss) * (1.0 - soot);`);
  };
  mat.customProgramCacheKey = () => 'sakamoto-thatch-moss-soot';
  return mat;
}
// 坂本は延暦寺・日吉社の門前町。山側の小堂と湖側の在所を分ける。
// 根拠：大津市の坂本保存計画。堂の姿・民の人数・避難路は推定復元。
// https://www1.g-reiki.net/city.otsu/reiki_honbun/x400RG00000643.html
// https://www.city.otsu.lg.jp/bz/a/03/15/60746.html
// 元亀元年には後の坂本城はない。宇佐山城の曲輪にも民を置かない。
const CIVILIAN_TEMPLE = { x: -14, z: -46 };
// 湖側の百姓の在所。家の正確な位置は不明のため、街道と避難路の間へ推定配置する。
const CIVILIAN_HOMES = [[66, -58, 0], [66, -82, 0]];
// 既存の町屋。建物と戸口の避難位置で同じ座標・向きを使う。
const CIVILIAN_TOWN_HOMES = [
  { x: 48, z: -14, rot: 0.2, exit: [[59, -7], [70, -7], [80, 0], [80, 8], [80, 28]] },
  // 南の町屋は北の寄せ手へ引き返さず、刈田の西を南下して南縁から湖側へ抜ける。
  // 路地と田の南縁を回る道筋は推定復元。南隣の家（５２、３０）の東にも間を空ける。
  // 湖側の縦列と斜めに同じ終点へ入ると、待つ位置が道を外れて交差する。
  // 刈田の南縁を回り、東の別の退避先へ。道・庭・水際の間に余白を残す。
  { x: 44, z: 4, rot: -0.2, exit: [[58, 10], [59, 22], [76, 32], [85, 32]] },
];
const civilRoute = (points) => points.map(([x, z]) => ({ x, z }));
// 北の寄せ手から南へ。湖側は水際（東端９４）・町の柵・家・軍の街道を避ける。
// 湖岸の斜面へ寄せすぎず、山側は町の平地が終わる南端２０より手前で止まる。
// 終点は町内の一時退避。そこで姿を消さず、兵や火が迫れば共通の仕組みで再び逃げる。
const LAKE_ESCAPE = civilRoute([[80, -40], [80, -10], [80, 8], [80, 28]]);
const TEMPLE_ESCAPE = civilRoute([[-26, -24], [-26, -4], [-26, 16]]);
const CIVILIAN_BANDS = [
  // 町人と商人は町屋の湖側。信治の列と、湖側で押し合う軽い兵からも離す。
  { x: 84, z: 0, kinds: ['townsman', 'merchant', 'woman', 'child', 'elder'],
    route: LAKE_ESCAPE.slice(2), routeEnd: 'wait' },
  // 町屋に残る一家。南向きの戸口から東へ折れ、町口の柵の湖側へ出る。
  // 正確な戸口・避難路は推定。家や柵、中央の軍道を横切る近道は使わない。
  ...CIVILIAN_TOWN_HOMES.map(home => ({
    x: home.x + Math.sin(home.rot) * 5,
    z: home.z + Math.cos(home.rot) * 5,
    mode: 'inside', kinds: ['townsman', 'merchant', 'woman', 'child'],
    // 戸口ごとの路地と退避先を使う。南の一家を湖側の縦列へ斜めに合流させない。
    route: civilRoute(home.exit),
    routeEnd: 'wait',
  })),
  { x: 80, z: -55, kinds: ['farmer', 'woman', 'child', 'elder'], route: LAKE_ESCAPE, routeEnd: 'wait' },
  // 北の在所は朝倉の控えに近い。家の南東で見物し、初期配置で民が省かれるのを防ぐ。
  { x: 82, z: -70, kinds: ['farmer', 'woman', 'child'],
    route: civilRoute([[80, -60], ...LAKE_ESCAPE.map(p => [p.x, p.z])]), routeEnd: 'wait' },
  // 家に残る者は南向きの戸口で待機。家の東を回って湖側の道へ出る。
  // 見物の者と分け、兵や火が来るまで姿を出さない。戸口と道筋は推定復元。
  ...CIVILIAN_HOMES.map(([x, z]) => ({
    x, z: z + 5, mode: 'inside', kinds: ['farmer', 'woman', 'child'],
    route: civilRoute([[74, z + 7], [80, z + 10], ...LAKE_ESCAPE.filter(p => p.z > z + 10).map(p => [p.x, p.z])]),
    routeEnd: 'wait',
  })),
  // 庭の見物と堂に残る者を分ける。堂の南の階から西へ折れ、柵の西端を回る。
  { x: -26, z: -42, kinds: ['monk', 'merchant', 'farmer'], route: TEMPLE_ESCAPE, routeEnd: 'wait' },
  { x: CIVILIAN_TEMPLE.x, z: CIVILIAN_TEMPLE.z + 7, mode: 'inside',
    kinds: ['monk', 'woman', 'child', 'elder'],
    route: civilRoute([[-26, -34], ...TEMPLE_ESCAPE.map(p => [p.x, p.z])]), routeEnd: 'wait' },
];
// 草木を避難路から離すための折れ線は支度前に一度だけ作る。
const CIVILIAN_PATHS = CIVILIAN_BANDS.map(b => [[b.x, b.z], ...b.route.map(p => [p.x, p.z])]);
const CIVILIAN_PATH_COLOR = { r: .43, g: .36, b: .26 };
const USA = { x: HON_C.x, z: HON_C.z, r: 10 };   // 宇佐山城の本丸（縄張りは castles/usayama.js）
// 本の足軽装束：黒漆の貸し胴に生成りの威糸、柿渋の茶の小袖（味方に藍・紺を使わない。10/29）。金色の一枚胴にはしない。
const ODA = { flag: 'oda', armor: 0x302a25, lace: 0x9b8d70, cloth: 0x4a3a2b };
// 黒漆・鉄錆の範囲で寄せ手を見分ける。色の割り振りは遊びのための補完。
const ASA = { flag: 'asakura', armor: 0x302a25, lace: 0x98764b, cloth: 0x76624a };
const AZA = { flag: 'azai', armor: 0x292c25, lace: 0x7b8960, cloth: 0x626b52 };
// 公記は両手の寄せを記すが、本陣の座標は不明。左右の控えに分けた推定復元。
// 中央の二筋の兵列と陣幕を重ねず、湖側の控えも水際９４より内へ収める。
// 町口の西の山裾に、森隊の物見の段を二段（削った平場・切岸・柵・板葺きの小屋）。町口で西を向くと奥の山肌に見える。
// 位置・形は遊びの補い（史料に無い）。当たりは付けず、兵の道も変えない。設営の時だけ作る。
const MONOMI_DAN = [
  { x: -35.5, z0: -22, z1: -46, w: 4.2, hut: [-34] },
  { x: -40.5, z0: -26, z1: -42, w: 4.6, hut: [-30, -38] },
];
function monomiClear(x, z) { return x > -46 && x < -31 && z > -50 && z < -18; }
function nishiMonomi(rt) {
  const W = rt.world, batch = makeSimpleBatch();
  const top = new THREE.MeshLambertMaterial({ color: 0x5f5a3c }), side = new THREE.MeshLambertMaterial({ color: 0x75593c });
  const mats = [side, side, top, side, side, side];
  for (const d of MONOMI_DAN) {
    const n = Math.max(1, Math.round((d.z1 - d.z0) / -8)), L = (d.z0 - d.z1) / n;
    for (let i = 0; i < n; i++) {
      const zc = d.z0 - L * (i + 0.5), y = W.heightAt(d.x, zc) + 0.25, low = Math.min(W.heightAt(d.x + d.w / 2 + 0.6, zc - L / 2), W.heightAt(d.x + d.w / 2 + 0.6, zc + L / 2));
      const hgt = Math.max(1.5, y - low + 1.5);
      const box = new THREE.Mesh(new THREE.BoxGeometry(d.w, hgt, L + 0.15), mats);
      box.position.set(d.x, y - hgt / 2, zc);
      rt.scene.add(box);
      const flat = Object.create(W); flat.heightAt = () => y;
      // 段の縁の柵（下の側）。平場の高さに立てる。
      palisade(flat, [d.x + d.w / 2 - 0.3, zc - L / 2, d.x + d.w / 2 - 0.3, zc + L / 2], { h: 1.6, batch });
      for (const hz of d.hut) if (Math.abs(hz - zc) < L / 2) hut(flat, d.x - 0.2, hz, 3.4, 4.2, Math.PI / 2, { ita: true, boardRoof: true, weatheredBoards: true, wall: 0x7e7464, h: 2.1, minka: false, solid: false, batch });
    }
  }
  finalizeSimpleBatch(rt, batch);
}
// 宇佐山の北東の尾根の裾（寄せの「北東の尾根」口の東）に、城方の段を二つ（削った平場・切岸・柵・板屋根の小屋と物見櫓）。
// 城は崖の上で町口からは見上げきれないため、町口で南を向いた画面の奥に柵と屋根を見せる（10/29）。
// 位置・形は遊びの補い（史料に無い）。当たりは櫓の柱だけ。兵と民の道・寄せの大手の坂からは外す。
const USA_DAN = [
  { x0: 16, x1: 32, z: 58, d: 6, hut: 22 },
  { x0: 18, x1: 32, z: 70, d: 6, tower: 26 },
];
function usaDanClear(x, z) { return x > 14 && x < 34 && z > 52 && z < 76; }
function usaDan(rt) {
  const W = rt.world, batch = makeSimpleBatch();
  const top = new THREE.MeshLambertMaterial({ color: 0x5f5a3c }), side = new THREE.MeshLambertMaterial({ color: 0x75593c });
  const mats = [side, side, top, side, side, side];
  for (const d of USA_DAN) {
    const n = Math.max(1, Math.round((d.x1 - d.x0) / 8)), L = (d.x1 - d.x0) / n;
    for (let i = 0; i < n; i++) {
      const xc = d.x0 + L * (i + 0.5), y = W.heightAt(xc, d.z) + 0.25;
      const low = Math.min(W.heightAt(xc - L / 2, d.z - d.d / 2 - 0.6), W.heightAt(xc + L / 2, d.z - d.d / 2 - 0.6));
      const hgt = Math.max(1.5, y - low + 1.5);
      const box = new THREE.Mesh(new THREE.BoxGeometry(L + 0.15, hgt, d.d), mats);
      box.position.set(xc, y - hgt / 2, d.z);
      rt.scene.add(box);
      const flat = Object.create(W); flat.heightAt = () => y;
      // 段の縁の柵（町の側＝北）。平場の高さに立てる。
      palisade(flat, [xc - L / 2, d.z - d.d / 2 + 0.3, xc + L / 2, d.z - d.d / 2 + 0.3], { h: 1.6, batch });
      if (d.hut && Math.abs(d.hut - xc) <= L / 2) hut(flat, d.hut, d.z + 0.6, 4.2, 3.4, 0, { ita: true, boardRoof: true, weatheredBoards: true, wall: 0x7e7464, h: 2.1, minka: false, solid: false, batch });
      if (d.tower && Math.abs(d.tower - xc) <= L / 2) rt.scene.add(yagura(flat, d.tower, d.z + 0.5, { kind: 'ro', height: 6.6, boarded: true }));
    }
  }
  finalizeSimpleBatch(rt, batch);
}
const ASAKURA_CAMP = { x: 70, z: -152 };
const AZAI_CAMP = { x: -70, z: -150 };
const REAR_Z = -211;
// 公記の両手の寄せは町口で戦う実兵と本隊が担い、遠景の控えは北の二段を保つ。
// 旧来の計百三十の前進では、先頭の控えが町屋（北端－２４）を突き抜けていた。
// 計三十五なら中心－６６、奥行三十六と列の揺れを含む南端も約－４５に収まる。
// 距離と控えの配置は推定復元。人数・列の密度・実兵の寄せは変えない。
const HOST_FIRST_ADVANCE = 20, HOST_NEXT_ADVANCE = 15;
// 共通の軍勢は本体の後ろに後続兵も付く。二段の間隔五十六に収め、別の備えへ重ねない。
// 各三百二十人と後続二百五十六人は保ち、本体の奥行きだけを詰める推定配置。
const HOST_DEPTH = 36;
// 後続三隊の待機場所と進軍路で同じ幅を使う。人数・幅・奥行きは保つ。
const REAR_HOSTS = [
  { x: 24, w: 40, d: 16, count: 320, facing: 0, look: ASA, seed: 15791 },
  { x: -20, w: 36, d: 14, count: 280, facing: .2, look: AZA, seed: 15792 },
  { x: 60, w: 30, d: 12, count: 220, facing: -.1, look: ASA, seed: 15793 },
];
// 本陣後方の五百六十人は控えに留める。前進させると正面の陣幕へ重なる。
// 待機場所は推定復元。人数・幅・奥行きは保ち、二十四日の移陣には加わる。
const CAMP_HOSTS = [
  { x: ASAKURA_CAMP.x, z: ASAKURA_CAMP.z - 26, w: 34, d: 14, count: 300, facing: 0, look: ASA, seed: -81 },
  { x: AZAI_CAMP.x - Math.sin(.1) * 26, z: AZAI_CAMP.z - Math.cos(.1) * 26,
    w: 34, d: 14, count: 260, facing: .1, look: AZA, seed: -153 },
];
// 北の後続は待機させる。三十五メートル前進すると本陣後方の控えと重なる。
// 公記は後続各隊の動きを特定しないため、人数を保ったまま北の予備として置く。
// 待機する列の幅・奥行きと路肩を含める。
// 三角関数と範囲の入れ物は読み込み時だけ作り、地面の各点では範囲だけ調べる。
const HOST_CORRIDORS = REAR_HOSTS.map(q => ({ ...q, z: REAR_Z })).map(q => {
  const c = Math.cos(q.facing), s = Math.sin(q.facing);
  return { x: q.x, z: q.z,
    halfX: (q.w * Math.abs(c) + q.d * Math.abs(s)) / 2 + 4,
    halfZ: (q.w * Math.abs(s) + q.d * Math.abs(c)) / 2 + 4 };
});
// 両手の控え（中心±３０、幅３６、奥行３６）と前進の通り道。従来の広い空き地は保つ。
// 本陣の空き地と同じく、設営時に草木を除く。兵列・密度・山の高さは変えない。
// 『信長公記』の両手の寄せを見せるための推定配置で、史実の伐採範囲ではない。
function hostClearing(x, z) {
  if (Math.abs(Math.abs(x) - 30) < 22 && z > -187 &&
      z < -101 + HOST_FIRST_ADVANCE + HOST_NEXT_ADVANCE + 30) return true;
  // 北で待機する後続の列を空ける。
  // 斜め向きの隊は幅・奥行きの投影も含める。山の高さ・道・兵の密度には触れない。
  // 公記にある大軍の進出を見せる推定復元で、史実の伐採範囲を示すものではない。
  return HOST_CORRIDORS.some(q => Math.abs(x - q.x) < q.halfX && Math.abs(z - q.z) < q.halfZ);
}
// 陣幕から後ろの控えまで草木を空ける。形を足さず、設営時だけ使う。
function campClearing(x, z, at) {
  return Math.abs(x - at.x) < 24 && z > at.z - 36 && z < at.z + 22;
}
// 逢坂から下坂本へ北上する湖岸の後詰。遠景と陣図で同じ出発点を使う。
// 縦長の本隊と百四十四人の後続も南端二百四十より内に置く。
const AID_START = { x: LAKE_ROAD[0][0], z: 160 };
// 共通の混成隊列には左右へ散る兵がいる。幅十八では幅二十の街道から外れる。
// 百八十人と面積四百三十二は保ち、道に収まる縦長の行軍列へ。隊形は推定復元。
const AID_WIDTH = 8, AID_DEPTH = 54;
// 『信長公記』巻三：二十四日の陣は下坂本。湖岸側の道筋と着点は縮小した推定復元。
// https://ja.wikisource.org/wiki/信長公記
// 城の南で止めず、町の柵（東端５７）と水際（９４）の間を北へ進む。
// 先頭まで街道の北端より内へ止める。中心を北端へ置くと前列が刈田へはみ出す。
const AID_CAMP = { x: LAKE_ROAD[0][0], z: LAKE_ROAD[0][1] + AID_DEPTH / 2 + 3 };
// 『信長公記』巻三は二十四日の移陣先を、はちが峯・あほ山・つほ笠山と記す。
// 三山そのものをこの縮尺の町へ置かず、西の画面外へ向かう三筋の登り口で示す。
// 登り口の座標と各隊への割り振りは推定。全軍を一点へ重ねない。
const HIEI_EXITS = [
  { x: -120, z: -140, name: 'はちが峯' },
  { x: -120, z: -100, name: 'あほ山' },
  { x: -120, z: -60, name: 'つほ笠山' },
];
// 公記にある叡山への移陣を、兵の下知・踏み土・草木で共通の道筋にする。
// 実際の登山道を特定するものではない。曲輪や戦う町口を削らず、西の山肌を保つ。
// ALL_PATHS の造成には加えず、設営時だけ既存の地面の上に細い道を示す。
// 旧経路の西６０・北１４０は浅井本陣の東端すれすれで、幅三十六の兵列が陣幕を横切る。
// 町屋の北・本陣の南で西へ折れ、本陣より西へ離れてから三筋へ分かれる。
// 後続を含む奥行きも南の横道へ逃がす。人数・隊幅・山肌は保つ。
const HIEI_PATHS = HIEI_EXITS.map(to => [[-60, -64], [to.x, -64], [to.x, to.z]]);
// 本陣後方の控えは陣幕の北を西へ抜け、浅井方の陣の西外側から山へ向かう。
// 幅三十四の兵列を陣幕へ通さないための推定復元。道と草木も同じ線を使う。
const CAMP_HIEI_PATHS = CAMP_HOSTS.map((q, i) => [
  [q.x, q.z], [-104, q.z], [-104, -132], [-104, HIEI_EXITS[i].z],
  [HIEI_EXITS[i].x, HIEI_EXITS[i].z],
]);
// 北の後続三隊は待機場所から西へ出す。先に南へ進めると本陣後方の控えを横切る。
// 公記の二十四日の叡山への移陣に対応する推定経路。兵数・隊幅・奥行きは保つ。
const REAR_HIEI_PATHS = REAR_HOSTS.map((q, i) => {
  const z = REAR_Z;
  return [[q.x, z], [-104, z], [-104, -132], [-104, HIEI_EXITS[i].z],
    [HIEI_EXITS[i].x, HIEI_EXITS[i].z]];
});
// 坂本の両手の備えから、西の登り道へ合流する町の北縁。
// 公記の叡山への移陣を示す推定復元。兵が通る横道にも踏み土を続ける。
// 造成は加えず、地表の色と草木の判定だけを登り道と共用する。
const HIEI_JOIN = [[-90, HIEI_PATHS[0][0][1]], [90, HIEI_PATHS[0][0][1]]];
// 終幕の軍勢は最大幅四十。中心線の左右四メートルだけでは両翼が林を横切る。
// 公記の叡山への移陣を示す推定復元。隊幅と揺れの余白を全ての合流路に渡す。
// 地表の踏み土は細いまま、設営時の草木だけを兵列の通る範囲から離す。
const HIEI_HOST_PAD = Math.max(36, ...REAR_HOSTS.map(q => q.w), ...CAMP_HOSTS.map(q => q.w)) / 2;
function hieiPathDistance(x, z, hostPad = 0) {
  let distance = distToPolyline(x, z, HIEI_JOIN);
  for (const path of HIEI_PATHS) distance = Math.min(distance, distToPolyline(x, z, path));
  for (const path of CAMP_HIEI_PATHS) distance = Math.min(distance, distToPolyline(x, z, path));
  for (const path of REAR_HIEI_PATHS) distance = Math.min(distance, distToPolyline(x, z, path));
  return distance - hostPad;
}
// 坂本の通りの両側に詰めた町屋（門前町の家並みの推定復元）。兵・民・軍勢の通り道と
// 田・既存の家の庭を避けた所だけに建てる。当たりは付けず、兵の道筋は変えない。
const STREET_HOMES = (() => {
  const out = [], paths = [...ALL_PATHS, NORTH_ROAD, LAKE_LINK, BYPASS_ROAD, ...CIVILIAN_PATHS,
    [[AZAI_VANGUARD_WAIT.x, AZAI_VANGUARD_WAIT.z], [AZAI_VANGUARD_FRONT.x, AZAI_VANGUARD_FRONT.z]]];
  const homes = [...TOWN_HOMES, ...CIVILIAN_HOMES, [CIVILIAN_TEMPLE.x, CIVILIAN_TEMPLE.z]];
  const posts = [TOWN, TOWN_POST, NOBUHARU_POST, AOCHI_POST];
  const free = (x, z) => paths.every(p => distToPolyline(x, z, p) > 6.5) &&
    distToPolyline(x, z, LAKE_ROAD) > LAKE_ROAD_HALF_WIDTH + 6 && hieiPathDistance(x, z, HIEI_HOST_PAD) > 2 &&
    homes.every(([hx, hz]) => Math.hypot(x - hx, z - hz) > 8.5) && posts.every(q => Math.hypot(x - q.x, z - q.z) > 10) &&
    TOWN_FIELDS.every(([cx, cz, w, d]) => Math.abs(x - cx) > w / 2 + 5 || Math.abs(z - cz) > d / 2 + 5) &&
    out.every(([hx, hz]) => Math.hypot(x - hx, z - hz) > 8.5);
  // 北から来る街道の両側（棟を通りに沿わせる）と、西へ折れる道の両側。
  for (const off of [11, 19]) for (let z = -4; z >= -84; z -= 8) for (const side of [-1, 1]) {
    const x = 24 + side * off - (z + 20) * .06;
    if (free(x, z)) out.push([x, z, Math.PI / 2]);
  }
  for (let x = 10; x >= -50; x -= 8) for (const z of [-29, -11]) if (free(x, z)) out.push([x, z, 0]);
  return out;
})();
// 二十四日の移陣は十八秒の終幕内に見せ切る。四十秒では坂本に本隊が残ったまま終わる。
// 移動時間だけを縮め、兵数・三筋の行き先・戦闘中の歩みは保つ。
const HIEI_MOVE_SECONDS = 16;
// 遠い本隊も登り口へ直行せず、実兵と同じ町の北縁・西の登り道をたどる。
// 公記は叡山への移陣を記す。折れ点と時間は推定復元で、終幕にだけ下知する。
function moveHostToHiei(rt, host, index) {
  const path = HIEI_PATHS[index % HIEI_PATHS.length];
  // 移動済みの中心を使い、まず町の北縁へ出す。登り道への斜行で町や山裾を横切らせない。
  // 隊の原点だけでは、それまでの前進・追従の分が抜ける。終幕の下知時に一度だけ求める。
  const A = host.army;
  const center = host.localToWorld(new THREE.Vector3(A.cx + A.off.x, 0, A.cz + A.off.z));
  const way = host.userData.shigaHieiPath?.slice(1) || [[center.x, path[0][1]], ...path];
  host.follow(null);
  host.moveTo(way[0][0], way[0][1], HIEI_MOVE_SECONDS / 4, { back: true });
  rt.after(HIEI_MOVE_SECONDS / 4, () => {
    host.moveTo(way[1][0], way[1][1], HIEI_MOVE_SECONDS / 4, { back: true });
  });
  rt.after(HIEI_MOVE_SECONDS / 2, () => {
    host.moveTo(way[2][0], way[2][1], HIEI_MOVE_SECONDS / 4, { back: true });
  });
  rt.after(HIEI_MOVE_SECONDS * 3 / 4, () => {
    host.moveTo(way[3][0], way[3][1], HIEI_MOVE_SECONDS / 4, { back: true });
  });
}
// 後詰の言い方（信長で遊ぶ時は、自分が上様なので摂津の本隊）
const AID = (rt) => (rt.G.lord ? '京からの本隊が着くまで' : '上様の後詰まで');
// 足軽大将ほどの身分で出た時は、城兵の一手を預かる
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
// 登城後の静かな待ちを短くする。寄せ手の出発・後詰の移動・本丸の守備条件は保つ。
const HON_HOLD_SECONDS = 70;
const AID_WAIT_SECONDS = 30;

function oldTownSpeech(step, line) {
  if (line.speaker !== '森可成' && line.speaker !== '織田信治' && line.speaker !== '青地茂綱') return false;
  const text = line.text;
  if (step >= 1 && text.startsWith('敵は浅井・朝倉の三万')) return true;
  return step >= 2 && (text.includes('町口') || text.includes('槍の列へ入れ') || text.includes('森殿の列'));
}

// 開いた木戸で「開けずに待て」と言わない。今守る木戸の状態を案内へ渡す。
function castleWatchText(rt) {
  const F = rt.flags, gate = F.backed ? F.gateHonMk : F.backedNi ? F.gateNiMk : F.gateMk;
  if (gate?.breached || gate?.struct.alive === false) return '破られた木戸の内で敵を受けよ';
  if (gate?.opened) return F.shut?.G === gate
    ? '退く味方を待ち、木戸の口を守れ' : '木戸へ寄り「門を閉める」を押せ';
  if (F.nearFoes > 0) return '木戸の内で敵を向いて構えよ';
  // 奥の持ち場から敵が見えなくても、下の木戸を攻めている理由を伝える。
  // 寄せ手の既存の命令を見るだけにし、兵や知らせを増やさない。
  for (const g of F.waves || []) {
    if (gone(g) || g.order !== 'assault' || !g._shigaGate?.alive || g._shigaGate.opened) continue;
    if (F.gates.indexOf(g._shigaGate) < F.gates.indexOf(gate?.struct))
      return '敵は下の木戸を攻めている。ここで後詰を待て';
  }
  for (const g of F.waves || []) if (!gone(g) && g.order === 'path')
    return '敵が坂道を上ってくる。木戸を閉じて待て';
  return '木戸を開けず、外を見張れ';
}

// 日付の札と空を一緒に進める。十九日の朝の光を、二十四日まで持ち越さない。
// 天気・時刻は不明なので、朝と昼は場面を区切る推定復元。雨や夜襲は足さない。
// 日を替える時だけ既存の空を更新し、毎コマの処理や兵の数には触れない。
function shigaDay(rt, day, mood = 'plain') {
  const F = rt.flags, W = rt.world;
  if (F.battleDay === day) return;
  F.battleDay = day;
  // 公記の十九日の端城放火と二十日の在所への放火を、後詰の日まで燃やし続けない。
  // 鎮火の日時は不明。二十二日の急報への場面転換で片付ける演出上の推定。
  // この戦の四つの火だけを扱い、共通の炎・煙・光の後片付けを使う。
  if (day >= 22 && F.shigaFires) {
    for (const fire of F.shigaFires) W.removeFire(fire);
    F.shigaFires.length = 0;
    F.outerFire = false;
  }
  W.mood = mood;
  W.setTime('day');
  W.cloudPhase = (W.cloudPhase + 1700) % 20000;
}

// 合図の音と、台詞・任務の札で意味を伝える時間をそろえる。
function shigaCommandUntil(F) {
  return Math.max(F.townSoundUntil || 0, F.castleSoundUntil || 0,
    F.retreatSoundUntil || 0, F.retreatVoiceUntil || 0, F.retreatGunUntil || 0,
    F.castleRetreatVoiceUntil || 0,
    (F.castleRetreatSignalT ?? -99) + 8);
}

// 補足の声は合成音の合図と札の説明が済んでから。待つ間に段や生死が変われば取り下げる。
function shigaSupportVoice(rt, who, text, dur, active) {
  const speak = () => {
    const F = rt.flags;
    if (rt.over || F.ending || !rt.player.u.alive || !active()) return;
    const wait = Math.max(shigaCommandUntil(F), F.supportVoiceUntil || 0) - rt.t;
    if (wait > 0) { rt.after(wait, speak); return; }
    F.supportVoiceUntil = rt.t + dur;
    rt.say(who, text, dur);
  };
  speak();
}

// 隊の合図は鳴らす時だけ兵の中心を拾う。目標の木戸から先に鳴らさない。
// 合図にも坂や城壁の遮りを通す。遅れは withPan、距離の音量は一度だけ付ける。
function shigaSignal(rt, kind, at, vol) {
  const pan = rt.panAt(at), c = rt.camera.position;
  const dx = at.x - c.x, dz = at.z - c.z, horizontal = Math.hypot(dx, dz);
  // 町口と山城の比高も音量へ通す。背後の向きだけは水平面で求める。
  const sy = Math.max(at.y || 0, rt.world.heightAt(at.x, at.z)) + 1.5;
  const ly = Math.max(c.y || 0, rt.world.heightAt(c.x, c.z) + 1.6);
  const d = Math.hypot(horizontal, ly - sy);
  const back = horizontal > 0 ? Math.max(0, -(dx * Math.sin(rt.player.yaw) + dz * Math.cos(rt.player.yaw)) / horizontal) : 0;
  // 合図の名も渡し、十二席の位置音が混み合っても通常の物音より先に席を取る。
  farNext(d, back, at, c, rt.world, WIND_STATE, 'sig_' + kind);
  // 合図の鬨は通常の近声と別にする。軍の近声は五十五メートルで消え、
  // 坂下や南の後詰では「鬨が聞こえる」という台詞と札だけが出てしまう。
  // 既存の合成した群声を使い、山城の比高と遠さに沿って緩やかに弱める。
  withPan(pan, () => {
    if (kind === 'toki' || kind === 'eiei') sfx('sig_' + kind, vol / (1 + Math.pow(d / 55, 1.35)));
    else signal(kind, d, vol);
  });
}

// 半秒以内に同じ組から鳴った銃声をまとめる。描く速さで一発と斉射が変わらないようにする。
// 控えは組ごとに使い回す。別の組が先に撃っても、後の組の斉射を捨てない。
function shigaGunBurst(rt, key, units, team, active) {
  const F = rt.flags, now = rt.army.time;
  const b = F[key] || (F[key] = { seen: now, step: F.step, groups: new Map() });
  const since = b.seen;
  b.seen = now;
  if (!active || b.step !== F.step || now < since) {
    b.step = F.step;
    for (const q of b.groups.values()) { q.until = 0; q.shots = 0; }
    return 0;
  }
  // 同じコマの銃声を時刻順に控える。組ごとの小さな配列は空にして使い回す。
  // 半秒の境を越えた発砲も、次のまとまりの一発目として残す。
  // 坂下の銃声を頭上の斉射として報せない。合図と同じく、耳までの比高も含める。
  const ear = rt.camera.position;
  for (const u of units) {
    if (u.team !== team || !(u.gunShotAt > since && u.gunShotAt <= now) ||
        Math.hypot(u.pos.x - ear.x, u.pos.y + 1.5 - ear.y, u.pos.z - ear.z) >= 70) continue;
    let q = b.groups.get(u.group);
    if (!q) { q = { until: 0, shots: 0, times: [] }; b.groups.set(u.group, q); }
    let i = q.times.length;
    q.times.push(u.gunShotAt);
    while (i > 0 && q.times[i - 1] > u.gunShotAt) {
      q.times[i] = q.times[i - 1]; i--;
    }
    q.times[i] = u.gunShotAt;
  }
  // 同時に終わった組は大きい方を伝える。別々の組の一発ずつを斉射へ足し合わせない。
  let shots = 0;
  for (const q of b.groups.values()) {
    for (const at of q.times) {
      if (q.shots && at > q.until) {
        shots = Math.max(shots, q.shots);
        q.shots = 0;
      }
      if (!q.shots) q.until = at + 0.5;
      q.shots++;
    }
    q.times.length = 0;
    if (!q.shots || now < q.until) continue;
    shots = Math.max(shots, q.shots);
    q.until = 0; q.shots = 0;
  }
  return shots;
}

// 実際に鳴った味方の銃声を下知へ渡す。音は射手の合成音をそのまま使う。
// 十六日の斉射中は volleyScene に任せ、各々撃つ段になったらこちらで拾う。
function friendlyGunCue(rt) {
  const F = rt.flags;
  const town = F.step === 1.5 || F.step === 1 && F.townVolleyDone;
  const castle = F.step === 3 || F.step === 3.5;
  // 退きの鉦・敵の太鼓・鬨を先に伝え、聞き逃した昔の発砲は後から報せない。
  const active = (town || castle) && F.guns && !F.guns.routed &&
    rt.t >= Math.max(shigaCommandUntil(F), F.supportVoiceUntil || 0) &&
    rt.t - (F.castleGunCueAt ?? -99) >= 20;
  const shots = shigaGunBurst(rt, 'friendlyGunBurst', F.guns?.units, 0, active);
  if (!shots) return;
  F.castleGunCueAt = rt.t;
  const sound = shots > 1 ? '味方の鉄砲の斉射' : '味方の鉄砲の一発';
  if (town) {
    const post = F.step === 1 ? '町口' : '退き口';
    F.townSoundText = `${sound}。弾込めの間は槍の列で${post}を保て`;
    F.townSoundUntil = rt.t + 8;
    rt.objProgress('main', F.townSoundText); rt.objProgress('mouth', F.townSoundText);
    // 十九日の攻防で信治が倒れた後は、残った足軽が銃声を伝える。
    const who = F.nobuU.alive && !F.nobuU.woundOut && !gone(F.nobuharu) && !F.nobuharu.routed ? '織田信治' : '足軽';
    rt.say(who, `${sound}じゃ！　弾を込める間、槍の列で${post}を保て！`, 3.5);
    return;
  }
  F.castleSoundText = `${sound}。弾込めの間は木戸の内で槍を揃えよ`;
  F.castleSoundUntil = rt.t + 8;
  castleProgress(rt, '鉄砲組を守り、寄せ手を内へ入れるな');
  rt.say('武藤五郎右衛門', `${sound}じゃ！　弾を込める間、木戸の内で槍を揃えよ！`, 3.5);
}

// 敵の銃声も実際の発砲から拾う。不発や遠い控えを、近くの斉射として報せない。
// 射手の合成音を使い、知らせのための銃声は重ねない。
function enemyGunCue(rt) {
  const F = rt.flags;
  const town = F.step === 1 || F.step === 1.5;
  const castle = F.step === 3 || F.step === 3.5;
  const retreat = F.step === 2;
  // 退く道と法螺・太鼓・鬨の札を先にする。抑えた昔の発砲は後から報せない。
  const active = (town || castle || retreat) && rt.t - (F.enemyGunCueAt ?? -99) >= 20 &&
    rt.t >= Math.max(shigaCommandUntil(F), F.supportVoiceUntil || 0);
  const shots = shigaGunBurst(rt, 'enemyGunBurst', rt.army.units, 1, active);
  if (!shots) return;
  F.enemyGunCueAt = rt.t;
  const sound = shots > 1 ? '敵の鉄砲の斉射' : '敵の鉄砲の一発';
  if (retreat) {
    // 発砲音は射手の合成音を使う。退き太鼓の後も、道案内を消さずに危険を伝える。
    F.retreatGunText = `${sound}。道沿いの物陰を使え`;
    F.retreatGunUntil = rt.t + 8;
    rt.say('足軽', `${sound}じゃ！　道沿いの物陰を使い、坂道の印から木戸へ退け！`, 3.5);
    return;
  }
  if (town) {
    F.townSoundText = `${sound}。塀や屋敷の陰で矢玉を避け、町口を守れ`;
    F.townSoundUntil = rt.t + 8;
    rt.objProgress('main', F.townSoundText); rt.objProgress('mouth', F.townSoundText);
    rt.say('足軽', `${sound}じゃ！　塀や屋敷の陰へ。町口を離れるな！`, 3.5);
  } else {
    F.castleSoundText = `${sound}。木戸の内の物陰で矢玉を避けよ`;
    F.castleSoundUntil = rt.t + 8;
    castleProgress(rt, '寄せ手を内へ入れるな');
    rt.say('武藤五郎右衛門', `${sound}じゃ！　木戸を出るな、塀の陰で矢玉を避けよ！`, 3.5);
  }
}

// 閉門と守兵待ちの案内にも、今の合図を添える。期限を過ぎた合図は残さない。
function castleGateProgress(rt, text) {
  const F = rt.flags;
  if (rt.t < Math.max(F.castleRetreatVoiceUntil || 0, (F.castleRetreatSignalT ?? -99) + 8))
    text = `退きの鉦。${text}`;
  else if (rt.t < (F.castleSoundUntil || 0)) text = `${F.castleSoundText}。${text}`;
  if (rt.t < (F.gateBreachUntil || 0)) text = `${F.gateBreachText}。${text}`;
  rt.objProgress('inner', text);
}

function castleProgress(rt, text) {
  const F = rt.flags, p = rt.player.u.pos;
  if (F.backed && !F.C.kuruwa.hon.test(p.x, p.z)) text = '退きの鉦。本丸の木戸の印へ退け。切岸へ寄るな';
  else if (F.backedNi && !F.C.kuruwa.ni.test(p.x, p.z) && !F.C.kuruwa.hon.test(p.x, p.z)) text = '退きの鉦。二の丸の木戸の印へ退け';
  else {
    const post = F.backed ? '本丸' : F.backedNi ? '二の丸' : '大手';
    text = `${post}木戸を守れ。${text}`;
    // 秒数の更新でも、今鳴った合図を八秒は残す。退く道の案内を先にする。
    if (rt.t < Math.max(F.castleRetreatVoiceUntil || 0, (F.castleRetreatSignalT ?? -99) + 8)) text = `退きの鉦。${text}`;
    else if (rt.t < (F.castleSoundUntil || 0)) text = `${F.castleSoundText}。${text}`;
  }
  // 木戸の破裂音は八秒だけ札にも残す。退く先と鉦の案内を消さない。
  if (rt.t < (F.gateBreachUntil || 0)) text = `${F.gateBreachText}。${text}`;
  if (F.outerFire && !text.startsWith('端城に火の手')) text = `端城に火の手。火を避けよ。${text}`;
  rt.objProgress('main', text);
  // 下知の札にも今の合図と持ち場を渡す。八秒を過ぎた鬨や太鼓を残さない。
  rt.objProgress('mouth', text);
  // 携帯では下知の札が主の任務より先に出る。見えている札にも守りの条件を添える。
  // 閉める下知や、外の守兵を待つ知らせを、守った秒数で隠さない。
  if (F.shut && F.shut.G.opened && !F.shut.G.breached && F.shut.test(p.x, p.z)) {
    castleGateProgress(rt, F.shut.notice || '木戸の内で退く味方を待て');
    return;
  }
  if (!F.backedNi && F.gateMk.opened && !F.gateMk.breached) {
    castleGateProgress(rt, '大手木戸へ寄り「門を閉める」を押せ');
    return;
  }
  rt.objProgress('inner', text);
}

// 木戸は兵と違い pos を持たない。扉の線の中点から、大手道の口を求める。
function gateRoadIndex(s) {
  const x = (s.seg[0] + s.seg[2]) / 2, z = (s.seg[1] + s.seg[3]) / 2;
  return ROAD.findIndex((p) => Math.hypot(p[0] - x, p[1] - z) < 1);
}

// 使番と寄せ手も九十九折りと木戸を通る。隊の中心への直線は切岸に突き当たる。
function roadProjection(pos, out) {
  out.d = Infinity;
  for (let i = 0; i < ROAD.length - 1; i++) {
    const a = ROAD[i], b = ROAD[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((pos.x - a[0]) * dx + (pos.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(pos.x - x, pos.z - z);
    if (d < out.d) { out.x = x; out.z = z; out.s = i + t; out.d = d; }
  }
}

// 九十九折りの縁に手すりを置く。角でも口を塞がず、人と馬を切岸へ押し出さない。
function guardShigaRoad(rt) {
  // 町口から入る口は開けたまま、最初の斜めの登りにも両脇の柵を通す。
  // 折り返しだけを囲うと、その手前で兵に押されて町側の切岸へ落ちる。
  const path = ROAD.slice(2, ROAD_OUT - 2), edges = [];
  // 町口の乱戦で西へよけてから入口の印へ寄ると、印の真横から
  // 始まる斜めの横木へ突き当たり、数歩の所で入れなくなる。
  // 平地の最初の六メートルを開け、印を踏んで坂へ向き直れる口を残す。
  const entry = path[0], next = path[1], entryLength = Math.hypot(next[0] - entry[0], next[1] - entry[1]);
  path[0] = [entry[0] + (next[0] - entry[0]) * 6 / entryLength,
    entry[1] + (next[1] - entry[1]) * 6 / entryLength];
  const normals = path.slice(1).map((p, i) => {
    const a = path[i], dx = p[0] - a[0], dz = p[1] - a[1], d = Math.hypot(dx, dz);
    return { x: -dz / d, z: dx / d };
  });
  for (const side of [-1, 1]) {
    const edge = path.map((p, i) => {
      const a = normals[Math.max(0, i - 1)], b = normals[Math.min(i, normals.length - 1)];
      const x = a.x + b.x, z = a.z + b.z, scale = side * 2.7 / (x * b.x + z * b.z);
      return [p[0] + x * scale, p[1] + z * scale];
    });
    edges.push(edge);
  }
  // 一つの形と材質で杭と横木を描く。長い坂道に丸太の細工を何千本も足さない。
  const cap = edges.reduce((sum, edge) => sum + edge.slice(1).reduce((n, p, i) =>
    n + (Math.ceil(Math.hypot(p[0] - edge[i][0], p[1] - edge[i][1]) / 3) + 1) * 3, 0), 0);
  const wood = new THREE.CylinderGeometry(.43, .5, 1, 7);
  const mesh = new THREE.InstancedMesh(wood, new THREE.MeshLambertMaterial({ color: 0x76634b, map: woodTex() }), cap);
  // 横木は縄で杭へ留める。形を使い回し、設営時に一束だけ足す。
  const ties = new THREE.InstancedMesh(wood, new THREE.MeshLambertMaterial({ color: 0xa49370 }), cap * 2);
  const pose = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), woodColor = new THREE.Color();
  let count = 0, tieCount = 0;
  const shadowVertices = [], shadowUvs = [], shadowIndices = [];
  const beam = (ax, ay, az, bx, by, bz, binding = false) => {
    dir.set(bx - ax, by - ay, bz - az);
    const length = dir.length();
    pose.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    pose.quaternion.setFromUnitVectors(up, dir.normalize());
    const thick = binding ? .028 : .1 + .025 * Math.sin(ax * 1.7 + az * .8 + ay);
    pose.scale.set(thick, length, thick); pose.updateMatrix();
    if (binding) ties.setMatrixAt(tieCount++, pose.matrix);
    else {
      // 坂の丸太を同じ色の棒にしない。設営時だけ色を付け、形と描画の束は使い回す。
      mesh.setColorAt(count, woodColor.setRGB(1, .98, .93).multiplyScalar(.82 + .18 * (.5 + .5 * Math.sin(ax * 1.3 + az * .6 + ay))));
      mesh.setMatrixAt(count++, pose.matrix);
    }
  };
  const rail = (world, seg) => {
    const [ax, az, bx, bz] = seg, n = Math.ceil(Math.hypot(bx - ax, bz - az) / 3);
    const length = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / length, dz = (bz - az) / length;
    // 両端はつなぎ、途中の杭だけ間隔をずらす。通行を止める線はそのまま。
    const at = (i) => i === 0 || i === n ? i / n : (i + .18 * Math.sin(ax * .7 + az + i * 2.3)) / n;
    for (let i = 0; i <= n; i++) {
      const t = at(i), x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = world.heightAt(x, z);
      const lean = .045 * Math.sin(x * .7 + z * 1.3);
      beam(x, y - .2, z, x + lean, y + 1.25 + .09 * Math.sin(x + z * .4), z - lean);
      for (const h of [.5, 1.1]) {
        const cy = y + h + .04 * Math.sin(x + z), cx = x + lean * h / 1.25 - dz * .075, cz = z - lean * h / 1.25 + dx * .075;
        for (const side of [-1, 1]) beam(cx - dx * .09, cy - side * .09, cz - dz * .09,
          cx + dx * .09, cy + side * .09, cz + dz * .09, true);
      }
      // 低画質でも根元が浮かないよう、薄い接地影を地肌に沿わせて一枚にまとめる。
      const start = shadowVertices.length / 3;
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const px = x + (col - 1) * .55, pz = z + (row - 1) * .55;
        shadowVertices.push(px, world.heightAt(px, pz) + .095, pz);
        shadowUvs.push(col / 2, row / 2);
      }
      for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
        const k = start + row * 3 + col;
        shadowIndices.push(k, k + 3, k + 1, k + 1, k + 3, k + 4);
      }
      if (!i) continue;
      const prev = at(i - 1), px = ax + (bx - ax) * prev, pz = az + (bz - az) * prev, py = world.heightAt(px, pz);
      for (const h of [.5, 1.1]) beam(px, py + h + .04 * Math.sin(px + pz), pz,
        x, y + h + .04 * Math.sin(x + z), z);
    }
    return { isBatchedPart: true };
  };
  for (const edge of edges) for (const s of wallLine(rt, edge, {
    team: 0, hp: 1e9, h: 1.2, name: '坂道の木柵', segLen: 999, mesh: rail,
  })) { s.noTarget = true; s.wall = true; }
  mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = mesh.receiveShadow = true; rt.scene.add(mesh);
  ties.count = tieCount; ties.instanceMatrix.needsUpdate = true; rt.scene.add(ties);
  const shadows = new THREE.BufferGeometry();
  shadows.setAttribute('position', new THREE.Float32BufferAttribute(shadowVertices, 3));
  shadows.setAttribute('uv', new THREE.Float32BufferAttribute(shadowUvs, 2)); shadows.setIndex(shadowIndices);
  rt.scene.add(new THREE.Mesh(shadows, new THREE.MeshBasicMaterial({ map: shigaRoadTextures().shadow,
    transparent: true, opacity: .42, depthWrite: false, side: THREE.DoubleSide })));
}
function shigaRunnerWay(army, u, want) {
  const g = u.group;
  if (!g?.isRunner && !(g?.team === 1 && g.roadColumn && (g.order === 'path' || g.order === 'assault'))) return want;
  // 本物の隊の中心は先に進むため、その中心ではなく届け先を道へ写す。
  const goal = g.isRunner ? g.dest || want : want;
  const q = u._shigaRunnerWay || (u._shigaRunnerWay = { x: 0, z: 0, at: -1, from: {}, to: {} });
  if (q.at > army.time && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1) return q;
  q.at = army.time + 0.25;
  roadProjection(u.pos, q.from); roadProjection(goal, q.to);
  // 下段の折り返しも町より北にある。南北の座標ではなく道の区間で町を分ける。
  if (g.isRunner && q.from.s <= 2 && q.to.s <= 2) { q.x = goal.x; q.z = goal.z; return q; }
  if (q.from.d > 1.2) { q.x = q.from.x; q.z = q.from.z; return q; }
  const forward = q.to.s > q.from.s;
  let i = forward ? Math.floor(q.from.s) + 1 : Math.ceil(q.from.s) - 1;
  if (i >= 0 && i < ROAD.length && Math.hypot(u.pos.x - ROAD[i][0], u.pos.z - ROAD[i][1]) < 1.2) i += forward ? 1 : -1;
  if (i < 0 || i >= ROAD.length || (forward ? i > q.to.s : i < q.to.s)) {
    if (Math.hypot(u.pos.x - q.to.x, u.pos.z - q.to.z) < 1.2) return goal;
    q.x = q.to.x; q.z = q.to.z;
  } else { q.x = ROAD[i][0]; q.z = ROAD[i][1]; }
  return q;
}

// 国土地理院の標高（1571比叡山の係が作った広域の切り出し terrain_hiei.js。宇佐山〜坂本〜比叡山が一枚の格子）。
// 1571比叡山（castles/hiei1571.js）と同じ xy・vs で切り出し、「同じ土地」にする。原点は宇佐山城の史跡の緯度経度、
// ゲーム内の中心は HILL_C（史跡に合わせた位置。castles/usayama.js で保つ）。
const HW = hieiWindow({ lat: PLACES.usayama.lat, lon: PLACES.usayama.lon, xy: 10, vs: 1 / 9 });
// 標高の切り出しと湖面の零点をそろえる。岸の位置・浜の幅・水深は縮小した推定復元。
// 湖面は川の流れ筋でなく風波で見せる。当日の風向・波高は不明で、旗と同じ推定の風を使う。
// 滋賀県琵琶湖環境科学研究センター「びわ湖みらい」第七号（風波と湖流）。
// https://www.lberi.jp/app/webroot/files/03yomu/03-01kankoubutsu/03-01-02biwakomirai/files/files/7.pdf
const SHIGA_LAKE = { x: 94, level: HW.lakeLevel, lake: true };
let HEIGHT_FN = null;
function baseTerrain(x, z) {
  let h = HW.height(x - HILL_C.x, z - HILL_C.z);
  // 地肌の細かい凹凸（広域の格子だけでは粗いので、足元の質感だけ足す）
  h += 0.4 * Math.sin(x * 0.03 + 0.2) * Math.cos(z * 0.028) + 0.25 * Math.sin(z * 0.07 + x * 0.02);
  // 南の山並み（大津・京都方面。広域の格子の外までは出ない、遠景の飾り）
  h += 20 * gauss(x, z, -60, 170, 4000);
  return h;
}
// 山を上げた後で曲輪を平らにする。北・南の二の丸は本丸の３ｍ下を保つ。
// 大津市の宇佐八幡宮祭礼資料：宇佐山３３６ｍ、麓約１１０ｍ。比高約２２６ｍを三分の一にする。
// https://www.city.otsu.lg.jp/material/files/group/90/usasairei.pdf
// 町口の位置は縮小した復元。曲輪の段差と、道に沿った登り方は保つ。
const TOWN_Y = baseTerrain(TOWN.x, TOWN.z);
const RISE = TOWN_Y + (336 - 110) / 3 - HON_LEVEL;
const SAN_Y = SAN_LEVEL + RISE, NI_Y = NI_LEVEL + RISE, HON_Y = HON_LEVEL + RISE;
const ARC_Y = SAN_Y - 2;
const ROAD_OUT = ROAD.findIndex(p=>p[0]===GATE_OUT.x && p[1]===GATE_OUT.z);
const ROAD_HON = ROAD.findIndex(p=>p[0]===GATE_HON.x && p[1]===GATE_HON.z);
const APPROACH_LENGTH = ROAD.slice(2,ROAD_OUT+1).reduce((n,p,i,a)=>n+(i?Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1]):0),0);
const ARC_APPROACH_LENGTH = ROAD.slice(2,ROAD_OUT-2).reduce((n,p,i,a)=>n+(i?Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1]):0),0);
// 退く猶予も実寸の坂道に合わせる。携帯で歩いて退く人（走らない・追手と打ち合う）でも間に合う速さで見込む。
const RETREAT_TIME = Math.ceil(APPROACH_LENGTH / 2.0) + 60;
// 縁のすぐ外を一律に下げる段差を作らず、切岸を曲輪の床へ連続してつなぐ。
// 木戸脇で地面の格子が低い縁を拾い、城内まで溝になるのを防ぐ。
const USA_PLAN = { ...USAYAMA_PLAN, continuousEdges: true, paths: USAYAMA_PLAN.paths.map(p => ({ ...p, pts: p.pts === CASTLE_ROAD ? ROAD : p.pts })), kuruwa: [...USAYAMA_PLAN.kuruwa.map(k => ({...k, level:k.level + RISE})),
    // 本丸の東西の法の下に帯曲輪（春日山の CG の段々の曲輪。宇佐山の腰曲輪の位置と幅は推定復元。10/28）。小屋を一列に並べる
    { id: 'obi_w', name: '本丸の西の帯曲輪', poly: [[-47, 102], [-39.5, 102], [-39.5, 172], [-47, 172]], level: HON_LEVEL - 4 + RISE },
    { id: 'obi_e', name: '本丸の東の帯曲輪', poly: [[-14, 108], [-6.5, 108], [-6.5, 168], [-14, 168]], level: HON_LEVEL - 4 + RISE },
    // 西の帯曲輪のさらに下の段と、三の丸・二の丸の脇の腰曲輪（段々に重ねる。推定復元）
    { id: 'obi_w2', name: '本丸の西の二段目の帯曲輪', poly: [[-55, 108], [-48.5, 108], [-48.5, 166], [-55, 166]], level: HON_LEVEL - 8 + RISE },
    { id: 'koshi_san', name: '三の丸の西の腰曲輪', poly: [[-34, 53], [-27, 53], [-27, 73], [-34, 73]], level: SAN_LEVEL - 3 + RISE },
    { id: 'koshi_ni', name: '二の丸の東の腰曲輪', poly: [[-4.5, 77], [2.5, 77], [2.5, 90], [-4.5, 90]], level: NI_LEVEL - 3 + RISE }],
  // 高画質でも十メートルの格子塔を並べず、通常の物見の高さと板囲いで仕上げる。
  // 配置・屋根・梯子口は既存のもの。高さと囲いは推定復元。
  yagura: USAYAMA_PLAN.yagura.map(y => ({ ...y, height: 6.6, boarded: true })),
};
const USA_DITCHES = DITCHES.map(d => horiboriHeight(d.pts, {width:d.w, depth:d.deep}));
// 町口と両軍の寄せ場を一続きの足場にする。山を支える盛り土を町まで張り出させない。
// 本丸の高さは保ち、町の外側は土手、登り口は西の九十九折りで受ける。
function townGround(x, z, h) {
  // 曲輪のある西側は３９ｍで元の高さへ戻す。城のない湖側は裾を広げる。
  // 東西を同じ線で切ると、町屋の裏に巨大な土の壁が続いてしまう。
  // 湖側の町屋と町口の足場は保つ。道・菜園・刈田の色分けは下の tint で行う。
  const south = 20 + 14 * Math.max(0, Math.min(1, (x + 20) / 20));
  const east = Math.max(0, Math.min(1, x / 20));
  const end = 39 + 45 * east * east * (3 - 2 * east);
  const d = Math.max((-30 - x) * .3, x - 76, -190 - z, (z - south) * 18 / (end - south), 0);
  if (d >= 18) return h;
  const t = 1 - d / 18, k = t * t * (3 - 2 * t);
  const floor = TOWN_Y + (TOWN.x - x) * .025 + (z - TOWN.z) * .015;
  return h + (floor - h) * k;
}
// 宇佐山の実測の尾根と沢（国土地理院 dem5a・20m 格子。広域の格子 hiei_wide の宇佐山の切り出しと同じ測り）。
// 城の山は比高を三分の一（実の九分の一の三倍）に起こしてあるので、実測の細かい起伏も同じだけ起こして山肌へ写す。
// 麓と曲輪の床の近くでは薄め、町・道・曲輪の整地はこの後の処理で従来どおり保つ。
const USA_WIN = 6, USA_GAIN = 2;
function usaRelief(x, z, lift) {
  const f = RISE > 0 ? lift / RISE : 0;
  if (f <= 0 || f >= .97) return 0;
  const a = Math.min(1, f / .25), b = Math.max(0, Math.min(1, (f - .8) / .17));
  const m = a * a * (3 - 2 * a) * (1 - b * b * (3 - 2 * b));
  const qx = x - HILL_C.x, qz = z - HILL_C.z, H = HW.height;
  const c = H(qx, qz), avg = (c + H(qx + USA_WIN, qz) + H(qx - USA_WIN, qz) + H(qx, qz + USA_WIN) + H(qx, qz - USA_WIN)) / 5;
  return (c - avg) * USA_GAIN * m;
}
function liftedTerrain(x,z) {
  const lift = Math.max(yamaLift(x,z,LIFT), yamaLift(x,z,HON_LIFT));
  let h = baseTerrain(x,z) + lift + usaRelief(x, z, lift);
  for (const cut of USA_DITCHES) h += cut(x,z);
  return townGround(x, z, h);
}
// 比叡山の東斜面に三本の浅い沢。町・九十九折り・曲輪より西で消し込む。
// 高さと色が同じ沢を参照する。配列や形を毎回作らない。
function hieiGully(x, z) {
  const t = Math.max(0, Math.min(1, (-110 - x) / 35));
  if (!t) return 0;
  const bend = Math.sin(x * .018) * 7;
  const a = (z + 112 - x * .12 - bend) / 12;
  const b = (z + 8 + x * .09 - bend * .6) / 16;
  const c = (z - 112 - x * .05 + bend) / 14;
  return t * t * (3 - 2 * t) * Math.max(Math.exp(-a * a), Math.exp(-b * b), Math.exp(-c * c));
}
function heightRaw(x, z) {
  if (!HEIGHT_FN) {
    const castle = heightOf(USA_PLAN, liftedTerrain, 3);
    // 町から木戸へ直登する旧い坂は使わない。比高を保ったまま九十九折りで登る。
    const R = RAMPS.slice(1).map(r => ({...r, h:r.h + RISE, h0:r.from == null ? castle(...r.a) : r.from + RISE}));
    // 大手の九十九折りは距離に合わせ一定の勾配で登る。水の手は本丸の床から谷へつなぐ。
    const roads = ALL_PATHS.map(pts => {
      let walked = 0;
      return pts.map((p,i) => {
        if(i) walked += Math.hypot(p[0]-pts[i-1][0],p[1]-pts[i-1][1]);
        let y = castle(...p);
        if (pts === LAKE_ROAD) y = TOWN_Y + (TOWN.x - p[0]) * .025 + (p[1] - TOWN.z) * .015;
        if(pts===ROAD && i>=ROAD_OUT-3 && i<ROAD_OUT) y=ARC_Y;
        if(pts===ROAD && i>=ROAD_OUT) y=i<=ROAD_OUT+2 ? SAN_Y : i<ROAD_HON ? NI_Y : HON_Y;
        if(pts===PATH_WELL && i<=2) y=HON_Y;
        if(pts===ALL_PATHS[ALL_PATHS.length-1]) y=i===0?SAN_Y:ARC_Y;
        if(pts===ALL_PATHS[2]) y=i===0?HON_Y:i===1?HON_Y-3*4.5/11:NI_Y;
        if(pts === ROAD && i >= 2 && i <= ROAD_OUT-3) {
          const before = Math.hypot(ROAD[1][0]-ROAD[0][0],ROAD[1][1]-ROAD[0][1]) + Math.hypot(ROAD[2][0]-ROAD[1][0],ROAD[2][1]-ROAD[1][1]);
          y = castle(...ROAD[2]) + (ARC_Y - castle(...ROAD[2])) * (walked-before)/ARC_APPROACH_LENGTH;
        }
        // 裏の井戸へも道の途中で急な段を生じさせない。
        if(pts === PATH_WELL && i >= 2) {
          const b=pts[pts.length-1], tail=pts.slice(2);
          const length=tail.reduce((n,q,j)=>j?n+Math.hypot(q[0]-tail[j-1][0],q[1]-tail[j-1][1]):0,0);
          const before=Math.hypot(pts[1][0]-pts[0][0],pts[1][1]-pts[0][1])+Math.hypot(pts[2][0]-pts[1][0],pts[2][1]-pts[1][1]);
          y=HON_Y+(castle(...b)-HON_Y)*(walked-before)/length;
        }
        return [...p,y];
      });
    });
    const lakeRoad = roads[ALL_PATHS.indexOf(LAKE_ROAD)];
    HEIGHT_FN = (px, pz) => {
      let h = castle(px,pz);
      for(const r of R) {
        const [ax,az]=r.a, [bx,bz]=r.b, dx=bx-ax,dz=bz-az;
        const t=Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/(dx*dx+dz*dz)));
        const d=Math.hypot(px-ax-dx*t,pz-az-dz*t);
        if(d < r.w) { const k=Math.min(1,(r.w-d)/(r.w*.4)); h += (r.h0+(r.h-r.h0)*t-h)*k; }
      }
      let closest = 1e9, target = h, roadWidth = 3.8, shoulder = 0, weight = 0, hillDistance = 1e9;
      for(const pts of roads) for(let i=0;i+1<pts.length;i++) {
        const [ax,az,ay]=pts[i], [bx,bz,by]=pts[i+1], dx=bx-ax,dz=bz-az;
        const t=Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/(dx*dx+dz*dz || 1)));
        const d=Math.hypot(px-ax-dx*t,pz-az-dz*t);
        if(d<closest) {
          closest=d; target=ay+(by-ay)*t;
          roadWidth = pts === roads[0] && i >= 2 && i < ROAD_OUT - 3 ? 5.8 : 3.8;
          // 幅十八の後詰の列まで路肩に収める。湖の水際には広げない。
          if (pts === lakeRoad) roadWidth = LAKE_ROAD_HALF_WIDTH;
        }
        // 道だけを高く盛らず、折り返しの間を土の山で支える。
        if (pts === roads[0] && i >= 2 && i < ROAD_OUT - 3) {
          hillDistance = Math.min(hillDistance, d);
          const w = 1 / (16 + d * d);
          shoulder += (ay + (by - ay) * t) * w; weight += w;
        }
      }
      if (weight && hillDistance < 45) {
        const k = Math.max(0, Math.min(1, (45 - hillDistance) / 30));
        // 西の九十九折りは、道より高い地肌も隣の段へなじませる。
        // 盛るだけだと道の幅だけ深く削られ、すぐ脇に巨大な板状の崖が残る。
        // 曲輪の西端より外だけでならし、城の床・木戸・最後の登りは削らない。
        const slope = shoulder / weight - 1, supported = Math.max(h, slope);
        const west = Math.max(0, Math.min(1, (-38 - px) / 14));
        const blend = west * west * (3 - 2 * west);
        h += (supported + (slope - supported) * blend - h) * k * k * (3 - 2 * k);
      }
      // 町の西だけは道を支える土を残す。町と曲輪には従来の整地を使う。
      const town = townGround(px, pz, h);
      const roadHill = Math.max(0, Math.min(1, (-30 - px) / 15));
      h = town + (h - town) * roadHill * roadHill * (3 - 2 * roadHill);
      if (closest < roadWidth) {
        // 九十九折りの路肩を狭い帯で切り立てず、隣の山肌へ丸くつなぐ。
        // 道の中心・城の床は保つ。歩く幅は末尾の benchRoads で従来どおり確保する。
        const t = Math.min(1, (roadWidth - closest) / (roadWidth === 5.8 ? 4 : 1.6));
        h += (target - h) * (roadWidth === 5.8 ? t * t * (3 - 2 * t) : t);
      }
      const td=Math.max(Math.abs(px-TANK.x)-TANK.w/2, Math.abs(pz-TANK.z)-TANK.d/2);
      if(td < 0) h -= TANK.deep;
      return h;
    };
  }
  return HEIGHT_FN(x,z) - hieiGully(x, z) * 3.5;
}

// 志賀だけの小さな絵を使い回す。土の粒・轍・草の縁は描画回数を増やさない。
let shigaRoadMaps;
function shigaRoadTextures() {
  if (shigaRoadMaps) return shigaRoadMaps;
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  let seed = 1570;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.fillStyle = '#80796b'; ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 4200; i++) {
    ctx.fillStyle = ['#6c665a', '#958978', '#a09b8c', '#777466'][i % 4];
    ctx.globalAlpha = .18 + rnd() * .28;
    ctx.beginPath();
    ctx.ellipse(rnd() * 256, rnd() * 512, .4 + rnd() * 1.6, .4 + rnd() * 1.2, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const x of [78, 178]) {
    const rut = ctx.createLinearGradient(x - 12, 0, x + 12, 0);
    rut.addColorStop(0, 'rgba(58,51,42,0)'); rut.addColorStop(.5, 'rgba(58,51,42,.32)');
    rut.addColorStop(1, 'rgba(58,51,42,0)'); ctx.fillStyle = rut; ctx.fillRect(x - 12, 0, 24, 512);
    // 轍を途切れさせ、定規で引いた線に見せない。
    for (let y = 0; y < 512; y += 8) {
      ctx.fillStyle = '#9b907e'; ctx.globalAlpha = .25;
      ctx.fillRect(x - 7 + rnd() * 14, y, 2 + rnd() * 5, 3 + rnd() * 8);
    }
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < 600; i++) {
    const side = i % 2 ? 256 : 0, x = side + (side ? -1 : 1) * rnd() * 16;
    ctx.fillStyle = i % 3 ? '#666d4c' : '#a19e90'; ctx.globalAlpha = .45;
    ctx.fillRect(x, rnd() * 512, 1 + rnd() * 4, 2 + rnd() * 7);
  }
  // 硬い板の縁をなくし、路肩の土へ透かす。描画と面の数は増やさない。
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-in';
  const edge = ctx.createLinearGradient(0, 0, 256, 0);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(.14, 'rgba(0,0,0,1)');
  edge.addColorStop(.86, 'rgba(0,0,0,1)'); edge.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = edge; ctx.fillRect(0, 0, 256, 512);
  const soil = new THREE.CanvasTexture(canvas); soil.colorSpace = THREE.SRGBColorSpace;
  soil.wrapT = THREE.RepeatWrapping;
  const shade = document.createElement('canvas'); shade.width = shade.height = 32;
  const sc = shade.getContext('2d'), fade = sc.createRadialGradient(16, 16, 2, 16, 16, 16);
  fade.addColorStop(0, 'rgba(35,31,24,.85)'); fade.addColorStop(1, 'rgba(35,31,24,0)');
  sc.fillStyle = fade; sc.fillRect(0, 0, 32, 32);
  const shadow = new THREE.CanvasTexture(shade); shadow.colorSpace = THREE.SRGBColorSpace;
  return shigaRoadMaps = { soil, shadow };
}

// 町の足場は変えず、踏み跡を一枚にまとめる。水たまりは路端の浅い湿りだけ。
let shigaTownMap;
function dressShigaTown(rt) {
  if (!shigaTownMap) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const g = canvas.getContext('2d');
    let seed = 157019;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const px = x => (x + 14) / 78 * 512, pz = z => (z + 50) / 90 * 512;
    // 足跡より大きい湿乾の斑を先に敷く。一枚の絵に焼き、遠くにも地肌の違いを残す。
    for (let i = 0; i < 85; i++) {
      const x = rnd() * 512, y = rnd() * 512, r = 18 + rnd() * 55;
      const fade = g.createRadialGradient(x, y, 0, x, y, r);
      const damp = i % 3 === 0;
      fade.addColorStop(0, damp ? 'rgba(60,53,39,.36)' : 'rgba(103,110,63,.28)');
      fade.addColorStop(1, damp ? 'rgba(60,53,39,0)' : 'rgba(103,110,63,0)');
      g.fillStyle = fade; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 土の細い筋。透明な縁で元の地肌へなじませる。
    for (let i = 0; i < 5200; i++) {
      const x = rnd() * 512, y = rnd() * 512;
      g.globalAlpha = .18 * Math.min(1, x / 24, (512 - x) / 24, y / 24, (512 - y) / 24);
      g.fillStyle = i % 2 ? '#5e5140' : '#a7997a';
      g.fillRect(x, y, 1 + rnd() * 3, 1 + rnd() * 7);
    }
    for (const x of [21.3, 23]) {
      g.strokeStyle = '#635240'; g.lineWidth = 2;
      for (let z = -44; z < 34; z += 1.6) {
        g.globalAlpha = .18 + rnd() * .16;
        g.beginPath(); g.moveTo(px(x + .12 * Math.sin(z * .3)), pz(z));
        g.lineTo(px(x + .12 * Math.sin((z + 1.2) * .3)), pz(z + 1.2)); g.stroke();
      }
    }
    // 草鞋の踏み跡は中央の通りと家の前に散らし、整列した模様にしない。
    for (let i = 0; i < 500; i++) {
      const x = 17 + rnd() * 15, z = -40 + rnd() * 72;
      g.globalAlpha = .14 + rnd() * .16; g.fillStyle = '#554939';
      g.beginPath(); g.ellipse(px(x), pz(z), .7, 1.2, rnd() - .5, 0, Math.PI * 2); g.fill();
    }
    // 低い草は立体の大きな三角を増やさず、踏まれない家際と路肩に置く。
    for (let i = 0; i < 1500; i++) {
      const x = i % 2 ? 7 + rnd() * 7 : 36 + rnd() * 18, z = -42 + rnd() * 76;
      g.globalAlpha = .18 + rnd() * .22; g.strokeStyle = i % 3 ? '#666b42' : '#8a8054';
      g.beginPath(); g.moveTo(px(x), pz(z)); g.lineTo(px(x) + rnd() * 2 - 1, pz(z) - 1 - rnd() * 3); g.stroke();
    }
    for (const [x, z, w, d] of [[16, -16, 1.4, .6], [30, 26, 1.1, .5], [33, -34, 1.8, .8]]) {
      g.globalAlpha = .6; g.fillStyle = '#685c47';
      g.beginPath(); g.ellipse(px(x), pz(z), w * 7, d * 6, .3, 0, Math.PI * 2); g.fill();
      g.globalAlpha = .35; g.fillStyle = '#7d8580';
      g.beginPath(); g.ellipse(px(x), pz(z), w * 5, d * 4, .3, 0, Math.PI * 2); g.fill();
    }
    // 地表の斑の端も透かし、四角い敷物の境界を作らない。
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in';
    for (const vertical of [false, true]) {
      const edge = g.createLinearGradient(0, 0, vertical ? 0 : 512, vertical ? 512 : 0);
      edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(.07, 'rgba(0,0,0,1)');
      edge.addColorStop(.93, 'rgba(0,0,0,1)'); edge.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = edge; g.fillRect(0, 0, 512, 512);
    }
    shigaTownMap = new THREE.CanvasTexture(canvas); shigaTownMap.colorSpace = THREE.SRGBColorSpace;
  }
  const vertices = [], uvs = [], indices = [], cols = 39, rows = 45;
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
    const x = -14 + col * 2, z = -50 + row * 2;
    vertices.push(x, rt.world.heightAt(x, z) + .09, z); uvs.push(col / cols, 1 - row / rows);
    if (row && col) {
      const k = row * (cols + 1) + col;
      indices.push(k, k - 1, k - cols - 1, k - 1, k - cols - 2, k - cols - 1);
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(indices); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: shigaTownMap, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  mesh.receiveShadow = true; rt.scene.add(mesh);
}

// 土の道は短い面で地肌に沿わせる。草・木・岩・路肩の石は形と材質を共用する。
function dressShigaRoad(rt) {
  const W = rt.world, vertices = [], indices = [], uvs = [], colors = [];
  const parts = { grass: [], rocks: [], stones: [] };
  const put = (kind, x, z, w, h, d, turn = 0) => {
    // 低では小さな株を地面の草模様に任せる。一画素ほどの尖った板を残さない。
    if (kind === 'grass' && false && h < .3) return;
    if (kind !== 'stones' && distToPolyline(x, z, ROAD) < (kind === 'grass' ? 2.1 : 3.3)) return;
    parts[kind].push({ x, y: W.heightAt(x, z) + h / 2, z, w, h, d, turn });
  };
  // 町口から登り口まで土の帯をつなぎ、入口だけ平地の草に埋もれさせない。
  const approach = [[TOWN_POST.x, TOWN_POST.z], ROAD[2], ...ROAD.slice(3, ROAD_OUT + 1)];
  for (let i = 0; i < approach.length - 1; i++) {
    const a = approach[i], b = approach[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const length = Math.hypot(dx, dz), nx = -dz / length, nz = dx / length;
    const steps = Math.ceil(length / 2), start = vertices.length / 3;
    for (let j = 0; j <= steps; j++) {
      const t = j / steps, x = a[0] + dx * t, z = a[1] + dz * t;
      for (let col = 0; col <= 4; col++) {
        const side = col / 2 - 1, px = x + nx * side * 2.25, pz = z + nz * side * 2.25;
        vertices.push(px, W.heightAt(px, pz) + .07, pz);
        uvs.push(col / 4, length * t / 8);
        // 町口の始まりと木戸側の終わりも土へなじませ、四角い敷物の端を残さない。
        const fade = Math.min(1, i === 0 ? length * t / 4 : 1,
          i === approach.length - 2 ? length * (1 - t) / 4 : 1);
        colors.push(1, 1, 1, .65 * fade);
      }
      if (j) for (let col = 0; col < 4; col++) {
        const k = start + (j - 1) * 5 + col; indices.push(k, k + 5, k + 1, k + 1, k + 5, k + 6);
      }
      if (j % 3 === 0 && j !== steps) for (const side of [-1, 1]) {
        const edge = 2.25 + .12 * Math.sin(i * 3 + j);
        put('grass', x + nx * side * edge, z + nz * side * edge, .55, .22, .45, i + j);
        if ((i + j + side) % 4 === 0) {
          const size = .12 + .1 * (.5 + .5 * Math.sin(i * 7.1 + j));
          put('stones', x + nx * side * edge, z + nz * side * edge, size, size * .55, size * .8, i + j);
        }
      }
      if (j % 5 || j === steps) continue;
      for (const side of [-1, 1]) {
        put('grass', x + nx * side * 4.3, z + nz * side * 4.3, 1.5, .5, 1.2, i + j);
        // 腰ほどの同じ塊を並べず、小さな露岩を路外に間を空けて置く。
        if ((i + j) % 3 === 0) {
          const size = .45 + .3 * (.5 + .5 * Math.sin(i * 4.7 + j * 2.3));
          put('rocks', x + nx * side * 5.6, z + nz * side * 5.6, size * 1.3, size * .6, size, i + j);
        }
        // 地面まで葉が覆う円錐の飾り木は置かず、周りの幹・枝のある林を使う。
        // 小さな野面の石を路肩だけに置く。城の総石垣にはしない。
        if ((i + j + side) % 3 === 0) {
          const size = .28 + .32 * (.5 + .5 * Math.sin(i * 3.7 + j * 1.9 + side));
          const edge = 3.1 + .45 * Math.sin(i + j * 2.3 + side), along = Math.sin(i * 4 + j + side) * 1.4;
          put('stones', x + nx * side * edge + dx / length * along,
            z + nz * side * edge + dz / length * along, size, size * .8, size * .7, i * 2.1 + j + side);
        }
      }
    }
  }
  const road = new THREE.BufferGeometry();
  road.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); road.setIndex(indices); road.computeVertexNormals();
  road.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  road.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  const surface = new THREE.Mesh(road, new THREE.MeshLambertMaterial({ map: shigaRoadTextures().soil,
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  surface.receiveShadow = true; rt.scene.add(surface);
  // 七本の葉は細い二枚を交差させる。横から見ても一枚の刃だけにならない。
  for (let i = 0; i < 240; i++) {
    const side = i % 2 ? -1 : 1, band = Math.floor(i / 2);
    const z = -47 + (band * 7.31 % 89), x = 24 + side * (13 + (band * 3.79 % 18));
    if (CIVILIAN_PATHS.some(p => distToPolyline(x, z, p) < 3) || ALL_PATHS.some(p => distToPolyline(x, z, p) < 3)) continue;
    const patch = .5 + .5 * Math.sin(x * .22 + Math.sin(z * .14)) * Math.cos(z * .21);
    if (patch < .46) continue;
    put('grass', x, z, .6 + patch * .7, .3 + patch * .22, .6 + patch * .5, i * 2.4);
  }
  const blades = [], grass = new THREE.BufferGeometry();
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4, x = Math.sin(a) * .3, z = Math.cos(a) * .3;
    const w = .035, top = .12 + (i % 3) * .16;
    for (let k = 0; k < 2; k++) {
      const angle = a + k * Math.PI / 2;
      blades.push(x - Math.cos(angle) * w, -.5, z - Math.sin(angle) * w,
        x + Math.cos(angle) * w, -.5, z + Math.sin(angle) * w,
        x + Math.sin(a) * .14, top, z + Math.cos(a) * .14);
    }
  }
  grass.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
  const normals = new Float32Array(blades.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  grass.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x7b7952, side: THREE.DoubleSide });
  // 葉は空からの光を受ける。Lambert の裏面にも表と同じ光を渡し、黒い刃にしない。
  grassMat.onBeforeCompile = (shader) => {
    // 現行の Lambert は断片側で照らす。裏面でも、草に渡した上向きの法線を保つ。
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nif (!gl_FrontFacing) normal = -normal;\n#endif');
  };
  grassMat.customProgramCacheKey = () => '志賀の路肩の草';
  const pose = new THREE.Object3D();
  for (const [kind, geo, color] of [
    ['grass', grass, 0x7b7952],
    ['rocks', rockShape(.5), 0xffffff],
    ['stones', rockShape(.6), 0xffffff],
  ]) {
    const mesh = new THREE.InstancedMesh(geo, kind === 'grass' ? grassMat : new THREE.MeshLambertMaterial({ color, vertexColors: true }), parts[kind].length);
    parts[kind].forEach((p, i) => {
      pose.position.set(p.x, p.y, p.z);
      pose.rotation.set(kind === 'stones' ? Math.sin(i * 2.4) * .25 : 0, p.turn, kind === 'stones' ? Math.cos(i * 1.7) * .2 : 0);
      pose.scale.set(p.w, p.h, p.d);
      pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix);
    });
    if (kind !== 'grass') groundRocks(W, mesh, kind === 'rocks' ? .5 : .6);
    mesh.computeBoundingSphere(); rt.scene.add(mesh);
    W.viewCull([mesh], kind === 'grass' ? 0 : 16);
  }
  // 木戸の正面とカメラの通る道から竿を離し、短く細くする。
  for (const side of [-1, 1]) {
    const flag = nobori(W, GATE_OUT.x + side * 7, GATE_OUT.z + 5, 'oda', 4);
    flag.scale.set(.65, 1, .65); rt.scene.add(flag);
  }
  // 道の角と長い直線にも小さな山形を残す。退く間だけ一枚の形で示す。
  const arrows = [];
  for (let segment = 0; segment < approach.length - 1; segment++) {
    const a = approach[segment], b = approach[segment + 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const angle = Math.atan2(b[0] - a[0], b[1] - a[1]), count = Math.max(1, Math.ceil(length / 18));
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      for (const side of [-1, 1]) for (const [across, along] of [
        [side * .38, -.28], [0, .3], [0, .16],
        [side * .38, -.28], [0, .16], [side * .3, -.36],
      ]) {
        const px = x + Math.cos(angle) * across + Math.sin(angle) * along;
        const pz = z - Math.sin(angle) * across + Math.cos(angle) * along;
        arrows.push(px, W.heightAt(px, pz) + .11, pz);
      }
    }
  }
  const mark = new THREE.BufferGeometry();
  mark.setAttribute('position', new THREE.Float32BufferAttribute(arrows, 3));
  const guide = new THREE.Mesh(mark, new THREE.MeshBasicMaterial({ color: 0xd7bc78, side: THREE.DoubleSide }));
  guide.visible = false; rt.flags.roadGuide = guide; rt.scene.add(guide);
}

// 板葺きの番所・長屋・蔵。形を共用して一度だけまとめ、室内は近づいた時の共通処理。
function pointInUsa(poly,x,z) {
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i],b=poly[j];
    if((a[1]>z)!==(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
function dressUsayama(rt) {
  const W=rt.world, batch=makeKitBatch(), villageBatch=makeSimpleBatch(), boxes=[];
  const add=m => { if(m && !m.isBatchedPart) rt.scene.add(m); };
  const box=(x,y,z,w,h,d,rot=0,tone=1) => boxes.push({x,y,z,w,h,d,rot,tone});
  // 壁は幅三十センチほどの縦板。戸口の幅と室内の当たりは保つ。
  const boards=(x,y,z,length,H,alongZ=false) => {
    const n=Math.ceil(length/.32), step=length/n;
    for(let i=0;i<n;i++) {
      const off=-length/2+(i+.5)*step;
      box(x+(alongZ?0:off),y,z+(alongZ?off:0),alongZ?.1:step-.008,H,alongZ?step-.008:.1,0,.88+(i%5)*.045);
    }
  };
  // 遺構のある線は数ｍの石の段にする。曲輪より上へ伸ばさず、櫓と木戸を見せる。
  for(const wall of STONE_LINES) add(ishigaki(W,wall.pts,{topY:wall.level+RISE, minH:2.8,maxH:4.8,lean:.2,big:1.7,out:wall.out,batch,scene:rt.scene}));
  for(const h of HOUSES) {
    if(h.kind==='goten') { goten(rt,h.x,h.z,{...h,team:0,tile:false,naka:true,profile:'usayama',doorX:0,noTarget:true}); continue; }
    const y=W.heightAt(h.x,h.z), floor=y+.15, H=2.5, gap=1.4, front=h.z+h.d/2*h.door;
    // 三方の壁と、戸口を空けた正面。室内の壁の位置と幅を一致させる。
    boards(h.x-h.w/2+.05,floor+H/2,h.z,h.d,H,true);
    boards(h.x+h.w/2-.05,floor+H/2,h.z,h.d,H,true);
    boards(h.x,floor+H/2,h.z-h.d/2*h.door,h.w,H);
    const side=(h.w-gap)/2;
    for(const sign of [-1,1]) boards(h.x+sign*(gap+side)/2,floor+H/2,front,side,H);
    box(h.x,floor+H-.15,front,gap,.3,.1);
    const angle=.42, half=h.w/2+.55, rise=Math.tan(angle)*half;
    const roofN=Math.ceil((h.d+1.1)/.36), roofStep=(h.d+1.1)/roofN;
    for(const sign of [-1,1]) for(let i=0;i<roofN;i++)
      box(h.x+sign*half/2,floor+H+rise/2,h.z-(h.d+1.1)/2+(i+.5)*roofStep,
        half/Math.cos(angle),.12,roofStep-.008,-sign*angle,.72+(i%4)*.04);
    // 棟と軒桁、隅柱で板の端を押さえる。妻の三角の隙間も縦板でふさぐ。
    box(h.x,floor+H+rise+.08,h.z,.16,.18,h.d+1.25,0,.62);
    for(const sign of [-1,1]) {
      box(h.x+sign*h.w/2,floor+H-.08,h.z,.18,.2,h.d+.25,0,.62);
      for(const end of [-1,1]) box(h.x+sign*(h.w/2-.06),floor+H/2,h.z+end*(h.d/2-.06),.16,H,.16,0,.62);
      box(h.x+sign*(gap/2+.06),floor+.95,front,.12,1.9,.16,0,.62);
    }
    const gableN=Math.ceil(h.w/.3), gableStep=h.w/gableN;
    for(let i=0;i<gableN;i++) {
      const off=-h.w/2+(i+.5)*gableStep, gh=Math.tan(angle)*(half-Math.abs(off)-gableStep/2);
      for(const end of [-1,1]) box(h.x+off,floor+H+gh/2,h.z+end*(h.d/2-.05),gableStep-.008,gh,.1,0,.9+(i%3)*.05);
    }
    // 番所と水番の小屋は寝所の長屋から分け、控えと帳面・武具を置く。
    const kind = h.name.includes('番') ? 'bansho' : h.kind;
    addInterior(W,{...h,kind,team:0,profile:'usayama',hasExterior:true,wins:()=>[],levels:[{y:floor,w:h.w-.1,d:h.d-.1,h:H}],door:{side:h.door,lx:0,w:gap},approach:{pad:.3,len:1},oku:0});
  }
  // 貯水槽６．５×３．４×深１ｍ。地面も掘り下げ、縁と水面を一致させる。
  const ty=W.heightAt(TANK.x,TANK.z)+TANK.deep;
  for(const side of [-1,1]) {
    solidRect(TANK.x+side*(TANK.w/2+.12),TANK.z,.24,TANK.d+.4,0,ty+.4);
    solidRect(TANK.x,TANK.z+side*(TANK.d/2+.12),TANK.w,.24,0,ty+.4);
  }
  for(const side of [-1,1]) {
    box(TANK.x+side*(TANK.w/2+.12),ty-.3,TANK.z,.24,1.4,TANK.d+.4);
    box(TANK.x,ty-.3,TANK.z+side*(TANK.d/2+.12),TANK.w,.24+1.16,.24);
  }
  const water=new THREE.Mesh(new THREE.PlaneGeometry(TANK.w,TANK.d),new THREE.MeshLambertMaterial({color:0x52675e}));
  water.rotation.x=-Math.PI/2; water.position.set(TANK.x,ty-.55,TANK.z); rt.scene.add(water);
  // 虎口の幅４ｍ・長さ５ｍの石段。通行判定は同じ位置の地形の坂。
  for(let i=0;i<10;i++) {const x=GATE_HON.x,z=83.75+i*.5; box(x,W.heightAt(x,z)-.05,z,4,.14,.53);}
  // 南の入口にも、道の向きに沿う短い石段。
  for(let i=0;i<12;i++) {const x=-17.5+i*.5,z=186;box(x,W.heightAt(x,z)-.05,z,.53,.14,3);}
  // 麓の田と茅葺きの村。軍の街道と町口から外し、遠景は材質ごとにまとめる。
  // 南の在所（６６、－５８）に軒が重なる家は置かず、庭と家の間を空ける。
  for(const [x,z] of [[82,-92],[68,-91],[59,-120]]) hut(W,x,z,6,4,0,{batch:villageBatch,minka:false});
  // 刈田は TOWN_FIELDS と地面の稲株で描く。別置きの板状の田は、
  // 南の在所の戸口（６６、－５３）から東へ逃げる路地を覆ってしまう。
  // 田の場所を地面と共通にし、傾斜にも沿わせ、避難路の踏み跡を残す。
  const boxGeo=new THREE.BoxGeometry(1,1,1), shade=new THREE.Color();
  const instance=(parts,color,wood=false) => {
    const mesh=new THREE.InstancedMesh(boxGeo,new THREE.MeshLambertMaterial({color,map:wood?woodTex():null}),parts.length), dummy=new THREE.Object3D();
    parts.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,p.rot);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(wood) mesh.setColorAt(i,shade.setRGB(p.tone,p.tone,p.tone));});
    mesh.receiveShadow=true;mesh.userData.camBlock=true;rt.scene.add(mesh);
  };
  // 石段と槽は石、板壁と屋根は木。同じ形・材質を使い回す。
  const wooden=boxes.splice(0,boxes.length-4-10-12);
  instance(wooden,0x9a8c79,true);instance(boxes,0x858075);
  const wellY=W.heightAt(WELL.x,WELL.z);
  add(ishigaki(W,[[WELL.x-1,WELL.z-1],[WELL.x+1,WELL.z-1],[WELL.x+1,WELL.z+1],[WELL.x-1,WELL.z+1],[WELL.x-1,WELL.z-1]],{topY:wellY+.6,minH:.6,maxH:.8,batch,noKit:true}));
  finalizeKitBatch(rt,batch);
  finalizeSimpleBatch(rt,villageBatch);
}
// 部隊（butai.js）の本物の兵を決めた数より増やさない（味方も敵の大軍も、遠くで戦う軽い作りのまま）
function capReal(b, n) {
  b._mapPos = { x: 0, z: 0 };
  if (b.light && b.light.army) b.light.army.noWake = true;   // 軽い大軍は近づいても本物の兵に化けさせない（本物は部隊が決めた数だけ）
  b._autoSwitch = function (dt) {
    this._swT -= dt || 0.05;
    if (this._swT > 0) return;
    this._swT = 1.2;
    const have = this.realCount(), want = Math.min(n, this.aliveNominal());
    if (have > want) this.shrinkReal(have - want);
    else if (have < want && this.cmd.id === 'attack') this.growReal(Math.min(3, want - have));
  };
  return b;
}
function bPos(b) {
  if (b.real && b.real.count) return b.pos;
  if (b.light && b.light.army) { const A = b.light.army, p = b._mapPos; p.x = A.cx + (A.off ? A.off.x : 0); p.z = A.cz + (A.off ? A.off.z : 0); return p; }
  return b.pos;
}

// 味方の鉄砲の一斉射（受け持ちの戦で使い回す）：鉄砲の組は込めたまま待ち（holdFire）、敵の前線が at から r に入ったら「放て」。
// 撃った後、寄せた敵の隊の士気を下げて崩れやすくする。shots 回撃つか until 秒たてば、ふだんの撃ち方に戻す
export function volleyScene(rt, o) {
  const V = { n: 0, t0: rt.t, last: -99, pending: false }, shots = o.shots || 3;
  const guns = () => (o.guns() || []).filter((g) => g && g.count > 0 && !g.routed);
  const active = () => !rt.over && !rt.flags.ending && (!o.active || o.active(rt));
  const release = () => { for (const g of guns()) g.holdFire = false; };
  for (const g of guns()) g.holdFire = true;
  const tick = () => {
    if (!active()) { release(); return; }
    if (V.pending) { rt.after(0.4, tick); return; }
    const G = guns();
    if (!G.length) return;
    if (V.n >= shots || rt.t - V.t0 > (o.until || 150)) { release(); o.onCue?.('end'); return; }
    // 志賀の補足の声が続く間は、狙いと発砲を一緒に待つ。
    if (o.canCue && !o.canCue()) { rt.after(0.4, tick); return; }
    const at = typeof o.at === 'function' ? o.at(rt) : o.at, r = o.r || 38;
    let near = Infinity;
    const hit = [];
    for (const g of rt.army.groups) {
      if (g.team === 0 || g.routed || !(g.count > 0)) continue;
      let d = Infinity;
      for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget && !u.isStruct) d = Math.min(d, Math.hypot(u.pos.x - at.x, u.pos.z - at.z));
      near = Math.min(near, d);
      if (d < r) hit.push(g);
    }
    if (!V.warn && near < r + 28) {
      V.warn = true; V.warnUntil = rt.t + 2.5;
      rt.say(o.who, o.wait || 'まだじゃ……撃つな。引きつけよ', 2.5); o.onCue?.('wait');
    }
    // 狙いの号令がある戦は「待て」を読み終えてから。近くへ来た敵にも同じ順で伝える。
    if (hit.length && (!o.aim || rt.t >= V.warnUntil) && rt.t - V.last >= (o.interval || 8)) {
      const ready = [];
      for (const g of G) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.gone && !u.noTarget && u.type === 'gun' && !u.sidearm && !u.reload && u.gunAmmo !== 0) ready.push({ u, shotAt: u.gunShotAt ?? -Infinity });
      if (!ready.length) { rt.after(0.4, tick); return; }
      V.last = rt.t; V.n++; V.pending = !!o.aim;
      // 志賀では狙いの下知を読んでから放つ。他の戦は元の間を保つ。
      const aimDelay = o.aim ? 1.6 : 0;
      const fire = () => {
        if (!active()) { release(); return; }
        for (const g of guns()) g.holdFire = false;
        rt.say(o.who, V.n === 1 ? (o.fire || '放てぇっ！') : V.n === 2 ? '次の組、放て！' : 'もう一度、揃えて放て！', 1.6);
        if (o.aim) o.onCue?.('release');
      };
      if (o.aim) { rt.say(o.who, o.aim, aimDelay); rt.after(aimDelay, fire); }
      else fire();
      o.onCue?.('aim');
      const first = V.n === 1;
      let fired = 0, together = false;
      rt.after(aimDelay + 1.2, () => {
        if (!active()) { release(); return; }
        // 不発でも弾は減る。銃声を伴った発砲だけを数え、一挺を斉射と呼ばない。
        let earliest = Infinity, latest = -Infinity;
        for (const q of ready) if (q.u.gunShotAt > q.shotAt) {
          fired++;
          earliest = Math.min(earliest, q.u.gunShotAt);
          latest = Math.max(latest, q.u.gunShotAt);
        }
        if (!fired) { V.n--; o.onCue?.(o.aim ? 'silent' : 'wait'); return; }
        // 志賀の号令射撃も、実際の銃声が半秒に揃った時だけ斉射と伝える。
        // 発砲と損害は変えず、遅れて撃った銃を音だけで一斉射にしない。
        together = fired > 1 && (!o.aim || latest - earliest <= 0.5);
        o.onCue?.('fire', fired, together);
        if (together) {
          battleEvent(rt, EVENT_VOLLEY, at, G[0], 0, false, '味方の鉄砲が一斉に放たれた');
          if (o.onVolley) o.onVolley(rt, first);
          if (first && o.banner) rt.bark(o.banner[0] + '。' + o.banner[1]);
          for (const c of (o.clash ? o.clash(rt) : null) || []) if (c && c.volley) c.volley(o.side || 'A');
        }
        if (!o.noMorale) for (const g of hit) if (g.count > 0 && !g.routed) g.morale = Math.max(0, g.morale - (o.hit || 14));
      });
      rt.after(aimDelay + 1.6, () => {
        V.pending = false;
        if (!active()) { release(); return; }
        if (V.n < shots) {
          for (const g of guns()) g.holdFire = true;
          // 銃声がなければ、その直前の知らせを保つ。待ち伏せの下知に戻さない。
          if (fired || !o.aim) o.onCue?.(fired ? 'reload' : 'wait', fired, together);
        }
      });
    }
    rt.after(0.4, tick);
  };
  rt.after(o.startDelay ?? 0.4, tick);
  return V;
}

const shiga = {
  syntheticBattleSound: true, // 鉄砲・法螺・馬・風も、既存の合成音を使い回す。
  scriptedBattleVoices: true, // 鬨と退きの合図は、台詞・任務札を伴う下知にそろえる。
  // 共通の軽い民の仕組みだけで描く。兵の名簿・人数・戦功には加えない。
  // 城兵まで含む軍の中心ではなく、坂本の町口を遠巻きに見る。
  civilianCrowd: {
    bands: CIVILIAN_BANDS, watchAt: { x: 22, z: -28 }, watchBattle: true, safeEscape: true, routeSpread: 1.3,
    // 見回りの間に終わる斬撃・発砲も覚え、見物と避難で同じ危険として扱う。
    rememberSoldierCombat: true, watchPlayerCombat: true,
    // 戦場から運び出された負傷兵や退場済みの兵で、里の家族を追い立てない。
    ignoreGoneSoldiers: true,
    // 決着後も町の火と敗走兵は残る。一時退避した家族の警戒・避難を続ける。
    evacuateAfterBattle: true,
    // 湖側の細道でも本隊の幅全体を避け、手前の兵だけをよけて列の奥へ入らない。
    formationEscape: true,
    // 斜めの町屋の軒先は、外接する四角ではなく建物の向きと余白で通れるか決める。
    rotatedHomeEscape: true,
    // 門前の町屋・堂と山裾に遮られた兵を透視せず、見通せる方を見物する。
    watchSight: true,
    // 町口や在所が兵に近い時は、家族を消さず湖側・堂の西の退き道で見物する。
    watchFallback: true,
    // 子や年寄りを含む見物の一家は、全員が待てる同じ道の角を優先する。
    familyWatch: true,
    // 見物場所と家・堂の戸口から、町屋・柵・水際を横切らず退き道へ出られるか確かめる。
    watchExitClear: true,
    // 在所・町屋の一家は、同じ退き道で子や年寄りの歩みに合わせる。
    familyPace: true, familyWait: true,
    // 一時退避の後に再び散って逃げても、安全になれば子や年寄りのそばへ集まる。
    familyRegroup: true,
    // 道を選んだ後にも兵や火は動く。歩いている間だけ短い間隔で進路を確かめ直す。
    escapeCheckInterval: 0.2,
    // 兵や火で路地を外れた後は、通れる次の角へ戻る。水・家・柵を抜ける近道は使わない。
    routeRejoin: true,
    // 角の直前が兵や火で塞がれたら、目印までの残り幅に縛られず退く。
    routeEscapeStride: true,
    // 三メートル先が塞がる町屋の角や堂の脇では、短い歩幅でも退き道を探す。
    shortEscapeSteps: true,
    // 湖岸と沢の縁では、足元だけでなく体の左右四十センチも陸に収める。
    escapeBankMargin: 0.4,
    // 湖側と堂の前の軽い兵も警戒し、寄せ合いの列を避難路で横切らない。
    clashThreats: true,
    // 敗走の下知がまだ届かず、前線で戦う塊からも民は退く。
    clashBreakThreats: true,
    // 敗走中の本隊・控えも、実際に走っている位置で警戒する。
    routedArmyThreats: true,
    // 両翼の軽い兵が崩れた後も、逃げる列を民が横切らない。
    routedClashThreats: true,
    // 大火になる前の火も避ける。逃走のきっかけと道中の火の確認で同じ大きさを使う。
    fireSize: 1,
    // 火が大きくなれば、見物をやめる距離と逃げ道の余白も炎の広がりに合わせる。
    fireSpread: true,
    // 一時退避後も坂本の町と在所の範囲で逃げる。南の曲輪・東の湖・北の本陣へ入れない。
    // 共通の仕組みが内側に二メートルの余白を取り、水・斜面・建物も確かめる。
    bounds: { minX: -36, maxX: 90, minZ: -104, maxZ: 36 },
    // 湖側・堂の西の道の中で前後にも間を空け、退避した家族が一点に重ならない。
    routeQueueGap: 1.6,
    // 横の間隔を人の当たりより広く取り、南端の二十メートルに三列で待つ。
    // 五列では隣同士が近すぎ、先着した者が後続の終点を塞いでいた。
    routeLanes: 3,
    // 近くで使う人形は従来と同じ七人。町人・商人も百姓に置き換えずに見せる。
    nearKinds: ['farmer', 'woman', 'child', 'monk', 'elder', 'townsman', 'merchant'],
  },
  compactIntro: true,
  introTaskFirst: true, // 城や人物の紹介より先に、最初の持ち場と勝つ条件を読む。
  introPeopleFolded: true,
  noUnitContrast: true, // 体から離れる白い人型を出さず、敵味方の頭上の印を残す。
  nearLongWeaponRadius: 10, // 後列の長柄も肩越しへ届く。描く間だけ避け、兵と当たりは残す。
  nearGroundSpearRadius: 10, // 落ち槍も視点を横切る間だけ避け、道と本人を見せる。
  nearFlagFadeRadius: 5, // 本丸前の大幟も実際の布の位置で拾い、門と守兵を見せる。
  nearAllySolidBody: true, // 木戸で視点が味方の頭へ入る前に、共通の処理で目線を避ける。
  nearAllyWholeOcclusion: true, // 目の前を塞ぐ間だけ全身を避け、首や笠の内側を浮かせない。
  compactPlayerSign: true, // 自分の足元の輪を小さくし、壁の向こうへ描かない。
  openingFootSignOnly: true, // 初めの本人案内を足元へ収め、具足を白い全身枠で覆わない。
  playerFootSignOnly: true,
  hideArmyPeek: true, // 坂で任務札に重なる両軍の帯を畳む。軍の名は出陣札に残す。
  playerSignScale: .4, // 白い足形を草鞋より目立たせず、自分の位置は残す。
  playerSignMinScale: .4, // 共通の下限に戻さず、この戦の小さい本人印を使う。
  woundEffectMin: 0.05, // 浅い打撲で守りの下知を退避札に替えない。出血・深手の案内は残す。
  introText() {
    return '東は琵琶湖、西は比叡山方面。敵は北から坂本へ来る。まず「森隊の列」の印へ。敵を向いて槍を構え、町口を守れ。退き太鼓が鳴ったら、道の印をたどって南の宇佐山城へ。';
  },
  guardButtonText: '押して かまえる',
  waitGuardButtonText: '押し続けて ふせぐ',
  // 木戸までの道のりと、目の前の案内印までの距離を混同させない。
  distanceText(rt, distance) {
    const F = rt.flags;
    const place = F.step === 2 ?
      !F.retreatIdx ? '坂道の入口' : F.retreatIdx < F.retreatPath.length - 3 ? '次の角' : '木戸の内' :
      F.step < 2 ? '森隊の列' : '守る持ち場';
    if (F.step >= 3 && distance < 3) return castleWatchText(rt);
    if (F.step < 2 && distance < 3) return '持ち場で敵を向いて構えよ';
    return distance < 3 ? `${place}はすぐ先` : `${place}まで約${Math.round(distance)}歩`;
  },
  taskDetails: true, // 携帯でも守りの条件と残り時間を読めるようにする。
  armySignals: false, // 場面ごとの実際の隊から鳴らす。任務の文言から別の突撃・退き合図を足さない。
  keepCombatTask: true, // 構えの案内中も、守る場所と後詰までの時間を同じ札に残す。
  keepCombatTaskHeading: true, // 携帯でも敵へ進む操作で、守る持ち場の見出しを隠さない。
  keepCombatTaskDetail: true,
  // 共通の構え札に任せると「この中で」だけになる。既存の任務一枚に持ち場を残す。
  combatTaskLabel(rt) {
    if (this.botEvacuating(rt) || !rt.hud.defendEnemy?.alive) return '';
    const F = rt.flags;
    if (F.step < 2) return '森隊の列で町口を守れ';
    return F.backed ? '本丸木戸の内を守れ' : F.backedNi ? '二の丸木戸の内を守れ' : '大手木戸の内を守れ';
  },
  guardStartText: '敵へ向き、押し続けて防ぐ',
  guardWaitText: '敵を向いて構えを保て',
  keepTaskWithDodge: true, // よける案内で、町口を守る下知を隠さない。
  keepTaskWithRain: true, // 敵の矢をよける間も、守る木戸と後詰までの時間を残す。
  keepTaskWithGuard: true, // 押し続ける釦と一緒に、守る持ち場も残す。
  keepTaskWithWork: true, // 閉門の釦が出ても、木戸の内へ戻る下知を残す。
  keepWoundRetreatReason: true, // 出血中も、旗でなく坂道や木戸へ退く下知を残す。
  keepRetreatReason: true,
  immediatePhaseTasks: true,
  immediateTaskChanges: true, // 木戸を閉めた後や奥へ退く下知を、同じ任務でもすぐに示す。
  keepTaskLabel: true,
  keepDestinationTask: true, // 持ち場を含む下知へ、印の名前をもう一度付け足さない。
  keepTaskPanel: true, // 敵を指す時も任務を右端へ動かさず、志賀の欄へ残す。
  keepApproachTaskPanel: true,
  // 狭い横画面では持ち場と行動を先に読む。詳しい下知は任務一覧に残す。
  taskLabel(rt, text) {
    // 内へ着いて守兵を待つ間は、さらに奥へ走らせる下知にしない。
    if (rt.flags.shut?.test(rt.player.u.pos.x, rt.player.u.pos.z) &&
        /^(?:二の丸|本丸)の木戸の内へ退け$/.test(text)) return text.replace('内へ退け', '内で味方を待て');
    if (text === '町口を守れ。深追いするな' || text === '町口を守れ。味方の退き口を保て' ||
        text === '森隊の槍の列に入り、町口を守れ') return '森隊の列で町口を守れ';
    if (text === '坂道の印をたどり、城の木戸へ退け') return '道の印を追って城へ退け';
    if (text === '大手木戸を閉め、内で槍を揃えよ') return '大手木戸を閉めよう';
    if (text === '大手木戸を守れ。破られたら奥へ') return '大手木戸の内を守れ';
    if (text === '二の丸を守れ。危うければ本丸へ') return '二の丸木戸の内を守れ';
    if (text === '本丸の木戸の内で守れ') return '本丸木戸の内を守れ';
    if (text === '木戸の内で受けよ。危うければ奥へ') return '木戸の内で守れ';
    return text;
  },
  // 携帯では残りの道のりと守りの条件を短くし、次の角の距離まで一枚で読めるようにする。
  taskDetail(rt, title, text) {
    // 空の補足が共通の「味方の旗へ」に変わり、持ち場から離れさせないようにする。
    if (!text) return rt.flags.step < 2 ? '退けの声まで、森隊の列を離れるな' :
      rt.flags.step === 2 ? '切岸を避け、道の印をたどれ' : castleWatchText(rt);
    if (rt.flags.step >= 3 && /^(?:木戸を開けず、外を見張れ|木戸の内で敵を向いて構えよ)$/.test(text))
      return castleWatchText(rt);
    if (rt.flags.step < 2 && title === '森隊の列で町口を守れ' && rt.hud.defendEnemy?.alive) {
      // 構えの操作案内でも、今鳴った合図と次の下知は八秒残す。
      if (rt.t < (rt.flags.townSoundUntil || 0)) return rt.flags.townSoundText;
      const guard = isTouch ? '長押しの釦で防ぐ。' : SETTINGS.guardToggle ?
        '右押しで構える。' : '右押しを押し続ける。';
      return guard + '退けの声まで列を離れるな';
    }
    if (!isTouch) return text;
    return text.replace('木戸まで道沿いに約', '木戸まで約')
      .replace('負傷兵を待っている。閉めるなら木戸へ寄れ', '負傷兵を待つ。閉門は木戸のそばで')
      .replace(/^(?:大手|二の丸|本丸)木戸を守れ。/, '');
  },
  meleeGuide(rt, enemy) {
    if (this.botEvacuating(rt)) return false;
    if (!enemy) return true;
    // 守る列から届かない敵へ歩かせない。届く相手への攻防と迫る打ち込みの案内は残す。
    const player = rt.player, u = player.u;
    return enemy.atk?.target === u || Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) <=
      player.meleeReach(player.weapon === 'sword' ? 'slash' : 'thrust');
  },
  waitGuardAllowed(rt) { return !this.botEvacuating(rt); }, // 退却中は押し続ける釦を離し、道の案内を見せる。
  routeGuidePriority(rt) { return this.botEvacuating(rt); }, // 近場へ逃げる印より、木戸まで通じる道を優先する。
  // 味方全体の劣勢で出る退避札にも、今守っている列の名を残す。
  retreatGuideLabel(rt, reached) {
    if (this.botEvacuating(rt)) return this.travelGuideLabel(rt);
    if (rt.flags.step < 2) return reached ? '森隊の列で敵を向いて構えよ' : '森隊の列へ下がろう';
    return reached ? castleWatchText(rt) : '木戸の内へ下がろう';
  },
  dodgeLabel(rt, direction) { return direction ? direction.replace('の印へ', 'へよけよう') : '矢をよけよう'; },
  // これは近くの攻撃をかわす印。町口や木戸から退く下知と区別する。
  dodgeGuideLabel(rt, reached, rain) {
    if (rain) return reached ? '矢に備え、動きを止めるな' : '矢の降る場所から離れよう';
    return reached ? '敵を向いて構えよう' : 'ここへよけて構えよう';
  },
  // 矢の回避札は別の呼び口。隊旗へ退く下知と混同させない。
  rainDodgeGuideLabel: (_rt, reached) => reached ? 'ここで矢をよけよう' : '矢をよけ、足元の印へ',
  escapePlaceLabel: (_rt, rain) => rain ? '矢をよけ、足元の印へ' : '印へよけ、構えよう',
  compactDodgeGuide: true,
  dodgeActionText: '長おしで進む', // 狭い札でも語尾を一字だけ次の行へ送らない。
  singleRetreatArrow: true, // 乱戦を横切る点線を短い矢印一本にし、行き先の旗は残す。
  dodgeAvoidNotices: true,
  dodgeTurnLabel: (_rt, right, touch) => touch
    ? `${right ? '右' : '左'}へなぞって振り向く`
    : `手元の操作器を${right ? '右' : '左'}へ動かして振り向く`,
  dodgeTurnDuration: 3.5,
  pauseTurnPractice: false, // 振り向きの案内は残し、兵と任務の時計を止めない。
  compactCombatGuides: true,
  compactTravelArrow: true, // 道の大矢印を小さくし、前の兵と坂の先を見せる。
  routeDestinationSight: true, // 坂の次の角と近い敵を肩越しに収め、町口の乱戦で視点を引き過ぎない。
  keepPlayerFeet: true, // 携帯の近い視点でも本人の足と進む道を画面に残す。
  footFrameMinDistance: 3, // 壁際で寄った目線は、既存の坂・町屋よけに任せる。
  edgeDestinationLabel(rt) {
    const F = rt.flags;
    if (F.step < 2) return '森隊へ';
    if (F.step !== 2) return '木戸へ';
    if (!F.retreatIdx) return '坂道へ';
    return F.retreatIdx < F.retreatPath.length - 3 ? '次の角へ' : '木戸へ';
  },
  hideGuideSteps: true, // 同じ行き先を歩数とメートルで二重に示さない。
  smallTaskAreas: true, // 民家まで囲む守備の大輪を、持ち場の地面の小印へ替える。
  compactFloorGuides: true, // 近い視点で足元の印が画面の三分の一を占めたら畳む。
  groundCombatMarkers: true,
  subtleTargetFrames: true,
  visibleFlagGuides: true, // 兵や門に隠れた布へ、宙に浮く囲みを残さない。
  enemyCornerSign: true, // 兵の胴を塞がず、細い四隅で相手を示す。
  enemySignOnly: true, // 「この敵」の別札を出さず、守る下知と相手の小印を残す。
  teamSignsOnly: true, // 黄色い全身の線画を外し、敵の具足と動きは四隅の内側に見せる。
  hideArrivedDestination: true, // 木戸の持ち場へ着いたら、大矢印を足元の小さな印へ替える。
  // 狭い木戸でも味方の馬越しに本人と寄せ手を見せる。既存の共用材質で透かす。
  nearAllyFadeRadius: 3.8,
  nearAllyHorseFade: true,
  nearSceneryScreenCut: false, // 木戸の境は残し、視点のすぐ前にある柱・扉だけを避ける。
  reserveCombatCues: true,
  avoidWaymarkThreats: true,
  edgeBehindWaymarks: true,
  namedGuideMarkers: true,
  travelGuideLabel(rt) {
    const F = rt.flags;
    if (F.step < 2) return '森隊の列へ';
    if (F.step === 2) {
      if (!F.retreatIdx) return '町の門の手前から、山側の坂へ';
      return F.retreatIdx < F.retreatPath.length - 3 ? '次の角へ' : '木戸の内へ';
    }
    return F.backed ? '本丸木戸へ' : F.backedNi ? '二の丸木戸へ' : '木戸の内へ';
  },
  uchisute: true, // 退き口と木戸を守る戦では、首を拾う案内で持ち場から誘い出さない。
  // 持ち場を替えても別の曲輪や使番の印へ案内しない。
  guideMarker(rt) {
    const F = rt.flags;
    if (F.ending) return null;
    if (F.step < 2) return 'mori';
    if (F.step === 2) return 'usa';
    return F.backed ? 'hon' : F.backedNi ? 'ni' : 'gate';
  },
  holdLine: true, // 後詰が来ても城兵は木戸を離れて追わない。
  missionDangerText(rt) {
    const F = rt.flags;
    return F.step === 2 ? '味方が押されている。坂道の印をたどり、城へ退け' :
      F.step >= 3 ? F.backed ? '味方が押されている。本丸の木戸の内を守れ' :
        F.backedNi ? '味方が押されている。二の丸の木戸の内を守れ' :
        '味方が押されている。大手木戸の内を守れ' :
      '味方が押されている。森隊の槍の列で受けよ';
  },
  withdrawRoute(rt, g) {
    const c = g.center(), q = {};
    roadProjection(c, q);
    g.roadColumn = true; g.colW = 1; g.speed = 2.8;
    return [[c.x, c.z], [q.x, q.z], ...ROAD.slice(0, Math.ceil(q.s)).reverse()];
  },
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  // 長い登りの後に七十秒＋五十秒の守りがある。共通の八分で途中を切らない。
  // 城内を移る猶予も含め五分まで。期限は段が変わっても延ばさず、未達なら共通の敗北へ。
  pacingWait: (rt) => !rt.flags.ending && (rt.flags.step === 3 || rt.flags.step === 3.5) && rt.t < rt.flags.siegeDeadline,
  botEvacuating: (rt) => rt.flags.step === 2 ||
    (rt.flags.backed && !rt.flags.C.kuruwa.hon.test(rt.player.u.pos.x, rt.player.u.pos.z)) ||
    (rt.flags.backedNi && !rt.flags.C.kuruwa.ni.test(rt.player.u.pos.x, rt.player.u.pos.z) && !rt.flags.C.kuruwa.hon.test(rt.player.u.pos.x, rt.player.u.pos.z)),
  taisho: { a: null, b: { def: true } }, // 城の守りと後詰まで、戦の定義で終わりを決める。
  noWake: true,
  // 稲生の型。退却の道と守兵の動きは、この戦の下知をそのまま使う。
  missionSingleLine: true,
  hideMissionDots: true,
  enemyTriangleSigns: true,
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  noSiegeCards: true,
  noPlayerFoot: true,
  quietMiss: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  bannerAllowed: (rt, text) => rt.over || !!rt.flags.ending || /討死|討ち取|守り通す/.test(text),
  missions: ['森隊に集まれ', '町口を守れ', '▼の敵を倒せ', '道の印をたどれ', '木戸を守れ', '味方と集まれ'],
  missionOf(rt) {
    const F = rt.flags;
    if (F.ending || rt.over) return 5;
    if (!F.step) return rt.distTo(TOWN_POST) > 5 ? 0 : 1;
    if (F.step === 2) return F.C.kuruwa.san.test(rt.player.u.pos.x, rt.player.u.pos.z) ? 4 : 3;
    if (rt.def.missionSignTarget(rt)) return 2;   // 右上の札は this 無しで呼ぶ（hud_cards.js）
    return F.step < 2 ? 1 : 4;
  },
  missionHeading(rt) {
    const F = rt.flags;
    // 一行の任務札では進み具合の欄を描かない。今の合図を見出しにも渡す。
    // 終幕は敵の退きと味方の集合を区別し、敗北時は裏口への退きを伝える。
    if (F.ending || rt.over) {
      const order = rt.objectives.find(o => o.id === 'inner' && !o.state);
      return order?.text || this.missions[5];
    }
    if (F.step === 2) {
      if (rt.t < Math.max(F.retreatSoundUntil || 0, F.retreatGunUntil || 0)) return '城へ退け';   // 右上は短い一行（合図の音は音で伝える）
    }
    if (F.step >= 3) {
      const withdrawing = this.botEvacuating(rt);
      const post = F.backed ? '本丸' : '二の丸';
      if (withdrawing) return `${post}へ退け`;
      if (rt.t < Math.max(F.castleRetreatVoiceUntil || 0, (F.castleRetreatSignalT ?? -99) + 8))
        return '木戸の内を守れ';
    }
    return this.missions[this.missionOf(rt)];
  },
  // 大将は本陣の朝倉義景。守城の任務を無敵の本陣襲撃へ替えず、地図と戦場の印だけ付ける。
  commanderSignTarget(rt) {
    const u = rt.flags.campA?.general;
    return !rt.flags.ending && !rt.over && u?.alive && !u.gone && !u.dying ? u : null;
  },
  namedGuideTarget(rt) { return this.commanderSignTarget(rt); },
  missionSignTarget(rt) {
    const F = rt.flags, me = rt.player.u;
    if (F.ending || rt.over || F.step !== 1 && F.step !== 3 && F.step !== 3.5 || this.botEvacuating(rt)) return null;
    const previous = F.shigaEnemy;
    // 複数の印が同じ相手を使う。討死・潰走は待たずに拾い、見通しの検査だけ五分の一秒ごと。
    if (F.shigaEnemyStep === F.step && rt.t < F.shigaEnemyAt && (!previous ||
        previous.alive && !previous.gone && !previous.dying && !previous.woundOut && !previous.rearWound &&
        !previous.fleeing && !previous.noTarget && !previous.group?.routed)) return previous;
    let target = null, distance = 28 * 28;
    for (const u of rt.army.units) {
      if (u.team === me.team || !u.alive || u.gone || u.dying || u.woundOut || u.rearWound || u.fleeing ||
          u.noTarget || u.invuln || u.isStruct || u.farSim || u.group?.routed || u.group?.civ ||
          F.step === 1 && u.group !== F.w1 && u.group !== F.w1b || Math.abs(u.pos.y - me.pos.y) > 3.5) continue;
      const d = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2;
      if (d >= distance || rt.army.wallBetween(me.pos, me.team, u.pos, false)) continue;
      target = u; distance = d;
    }
    F.shigaEnemy = target; F.shigaEnemyStep = F.step; F.shigaEnemyAt = rt.t + .2;
    return target;
  },
  missionPin(rt) {
    const F = rt.flags, me = rt.player.u;
    if (F.ending || rt.over || !me.alive) return null;
    const pin = F.shigaPin || (F.shigaPin = { x: 0, z: 0, r: 3, hide: 3, always: true, silent: true });
    pin.unit = null; pin.enemy = false; pin.waiting = false; pin.arrived = false; pin.defend = false;
    const enemy = this.missionSignTarget(rt);
    let point;
    if (F.step === 2) {
      // 深手でも別の段の味方を直に指さず、次の角へ案内をそろえる。
      point = F.retreatPoint;
      pin.waiting = pin.defend = F.C.kuruwa.san.test(me.pos.x, me.pos.z);
    }
    else if (enemy) { point = enemy.pos; pin.unit = enemy; pin.enemy = true; }
    else {
      point = F.step < 2 ? TOWN_POST : F.backed ? F.hida.anchor : F.keep.anchor;
      pin.waiting = true; pin.defend = true;
    }
    if (!point) return null;
    pin.x = point.x; pin.z = point.z; pin.r = pin.hide = enemy ? .2 : F.step === 2 ? 1.8 : 3;
    pin.arrived = pin.waiting && Math.hypot(me.pos.x - pin.x, me.pos.z - pin.z) < pin.r;
    return pin;
  },
  attackWarningDelay: 1, // 姿が隠れた敵も、傷の前に迫る向きを知らせる。
  rearThreatFrame: true, // 振り向いた時も、画面から見た敵の方角を知らせる。
  meleeThreatRange: 7, // 遠い追手を出し続けず、槍が迫る手前で知らせる。
  meleeThreatHeight: 2.5, // 折り返しの上段・下段にいる敵の槍を同じ道の危険にしない。
  // 重なる槍で退く間を失わない。既存の傷枠を使い、厳しい戦・矢玉・火傷は従来どおり。
  meleeGrace: { rate: 0.009, burst: 0.08, interval: 1.2 },
  noTaisho: true, // この戦にいない各務元正や、別の本陣襲撃を共通処理で足さない。
  // 狭い折り返しでは徒歩で下知を運ぶ。別仕立ての飾りの騎馬は柵際へ走らせない。
  footRunners: true,
  noCouriers: true,
  camLift: -0.9,   // 騎馬の行軍で真上から見下ろさない。町屋の軒と背の山を画面の上に残す（10/28）
  spawn: { x: TOWN.x + 4, z: TOWN.z + 8, heading: Math.PI + 0.7 },   // 北西へ少し振り、背後の宇佐山の段と柵を始めの画面の縁に入れる（10/28）
  // 身の回りの当時の場（timeslip_field.js）。元亀元年九月の坂本は今の十月末。秋の田の刈り跡と乾いた町口の道。
  // 町口で受けた浅井・朝倉の矢、捨てた笠と槍。城山の斜面と湖の水面には置かない。
  timeslip: {
    wet: 0.15, dust: 0.55, trample: 0.25, debris: 1.1, arrows: 0.9,
    grass: 0xa09a62, grassTints: [0xffffff, 0xe8dca8, 0xc8c494], grassH: 1.1, tallGrass: 0.75,
    flagColors: [0xe6dfcc, 0x24211e, 0x6a5a3a],
    maxSlope: 0.2,
    fights: [[TOWN_POST.x, TOWN_POST.z, 34], [NOBUHARU_POST.x, NOBUHARU_POST.z, 24], [AOCHI_POST.x, AOCHI_POST.z, 24], [GATE_OUT.x, GATE_OUT.z, 22]],
  },
  world: {
    noHaori: true,
    variedInfantry: true,
    variedLoanArmor: true,
    seed: 15709,
    maxWalkDrop: 1.2, // 路肩から横へ退く一歩で、切岸の下へ落ちない。
    gateRoofBacking: true, // 葺き板の下を野地板で閉じ、木戸の屋根越しに空を見せない。
    lowArmyDetail: true, // 低だけ遠い兵の細部を早めに替え、人数と前線を保つ。
    // 二十メートルより先は既存の軽い甲冑へ。骨と斬り合い・前線の人数は保つ。
    lowHumanDetail: 20,
    wind: [-0.3, 0.9], // 風向は推定復元。旗と煙で同じ向きを使う。
    time: 'day',
    fogFar: 320, // 登りから見下ろす町と次の折り返しを、昼の霞の中にも残す。
    battleViewDistance: 110, // 共通の八十歩の霞で、北の浅井・朝倉の控えの群れと宇佐山の段を白く隠さない（見通しの上限は flat_rule の110）。兵数と地形の細かさは増やさない。
    smokeFogFloor: 440, // 高低差のある坂下を、少数の鉄砲の煙で白一色にしない。
    gunHazeScale: .65, // 狭い山道へ流れた硝煙を、小さく短くする。
    muddy: 0.12,
    rocks: 110, // 町と道は既存の clear で空け、山の露岩も減らす。
    groundedSlopeRocks: true, // 切岸の岩の下縁を地肌へ埋め、黒い穴のような浮きを抑える。
    plantedArrows: true, // 携帯でも矢柄を残し、白い羽だけが地面から浮いて見えるのを防ぐ。
    lifeSizePinnedArrows: true, // 胴の拡大率を刺さった矢へ重ねず、長槍ほどの棒にしない。
    pinnedArrowAxisScale: true, // 斜めに刺さる矢も、変換後の各軸で実寸へ戻す。
    naturalArrowRain: true, // 遠い矢を太い黒棒へ拡大せず、霧と細い矢柄になじませる。
    enemyArrowWarnings: true, // 本人に当たらない味方の矢で、守りの列から退かせない。
    arrowRainGroundCue: false, // 民家を囲む白黒の大輪を外し、矢の影・警告・回避先で知らせる。
    arrowRainAreaShadow: false, // 坂や家をまたぐ平面の影を外し、一本ごとの小さな影を残す。
    arrowRainPerBow: 1, // 一斉射ちの補助の矢は弓兵一人につき一本。小勢から数十本を増やさない。
    slopeRockFaces: true, // 急な土の斜面でも岩の厚みを外へ向ける。設営時だけ調べる。
    curvedRockTufts: true,
    litRockTufts: true, // 岩の根草も路肩の葉と同じく、裏表に空からの明るさを残す。
    autumn: true,
    // 旧暦九月の山麓は盛りの紅葉にしない。現代の季節資料を目安にした推定復元。
    // 大津観光協会：比叡山頂の色づき始めは例年十月下旬。山麓は緑を多く残す。
    // https://otsu.or.jp/tripideas/tripidea_autumn_1
    autumnLeafMix: .2,
    // 彼岸花の花期はおおむね今の九月。旧暦九月と取り違えず、ススキと刈田を残す。
    // https://www.city.chiba.jp/toshi/koenryokuchi/kanri/chuo-mihama/higanbana2013.html
    flowers: false,
    fieldStage: 'stubble',
    paddy: townPaddy,
    patchyGround: true, // 草むらと裸地を同じ分布で混ぜ、土だけの広場にしない。
    softPathSoil: true, // 路肩の土と湿りを連続して混ぜ、格子の境を残さない。
    softEarthCrust: true, // 土塊の升ごとに飛ぶ陰を消し、板を敷き詰めた見え方を抑える。
    stableSlopeGrain: true, // 山道の法線で模様を回さず、土手に細い縞を作らない。
    contactShadows: true, // 本人と味方にも共用の柔らかな接地影を残す。
    livingSpearHedge: true,
    infantryWeight: true, // 既存の膝・腰・肩の連動で、構えに体重を乗せる。
    meleeGroundedFeet: true,
    terrainContactFalls: true, // 切岸で足の高さが遅れても、板床と誤認して亡骸を宙へ残さない。
    slopeContactFalls: true, // 低画質でも腰と胸を実際の坂へ合わせる。
    slopeForest: .75, cliffRock: .1, // 杉と緑の残る雑木林を主体にし、露岩を抑える。
    slopeForestTint: true, // 山の基本色と沢の陰を既存の地表へ渡す。
    cliffTurf: 0.8, // 城山の切岸を土の一枚面にせず、春日山の CG のように草で覆い、雨溝と岩だけ土を見せる（10/28）
    water: { ...SHIGA_LAKE, sound: 'lake' },
    scriptedArmySignals: true, // 太鼓と法螺は台詞・任務札を伴う実際の隊の合図だけにする。
    paths: ALL_PATHS,
    moveWay: shigaRunnerWay,
    runnerWay: shigaRunnerWay,
    terrainTags: true,   // 坂・道の速さを効かせる（曲輪の縁の切岸は登れず、道を通る）
    terrainTriangles: true, // 切岸の足場・小道具・目線を、描く地面の三角形と同じ高さにする。
    moveLim: 240, // 遠景の控えも地面の北端まで使い、移陣の最初の横移動を南へ丸めない。
    terrainContactView: true, // 描く直前にも視点の中央と四隅を地面の上へ戻し、坂の裏を映さない。
    groundHalf: 240, // 南へ２０４ｍの本丸と２１４ｍの井戸を、地面の端の内へ収める。
    keepTerrainGrid: true, // 携帯でも描く格子と足場をそろえ、切岸で柵や兵を浮かせない。
    height,
    tint(x, z, h, c) {
      // 緑一色にせず、踏み固めた茶の地と草の斑を混ぜる（色から土と草の割合が決まる）。
      // 今の十月末の坂本：夏の濃い緑でなく、枯れはじめた黄褐の草とまだ青い草の斑（10/28）。
      const patch = .5 + .5 * Math.sin(x * .083 + Math.sin(z * .047) * 1.7) * Math.cos(z * .092 - x * .026);
      if (c.g > c.r) {
        c.setRGB(.33 + patch * .13, .36 + patch * .06, .22 + patch * .05);
      }
      // 西の山肌は暗い緑褐色。沢の底だけ陰を深め、町と城の足場は染めない。
      const mountain = Math.max(0, Math.min(1, (-80 - x) / 40));
      c.lerp({ r: .22, g: .26, b: .16 }, mountain);
      c.multiplyScalar(1 - hieiGully(x, z) * .35);
      if (x > 74) { const k = Math.min(1, (x - 74) / 12); c.lerp({ r: 0.6, g: 0.57, b: 0.48 }, k * 0.7); }
      if (x > -30 && x < 80 && z > -130 && z < 37) {
        // 道の踏み土だけを残し、広場全体を砂色にしない。
        const road = ALL_PATHS.some(p => distToPolyline(x, z, p) < 2);
        const garden = TOWN_HOMES.some(([hx, hz, r]) => {
          const dx = x - hx, dz = z - hz;
          return Math.abs(dx * Math.cos(r) - dz * Math.sin(r) - 7) < 2 && Math.abs(dx * Math.sin(r) + dz * Math.cos(r)) < 3;
        });
        if (road) c.setRGB(.36 + patch * .035, .30 + patch * .025, .21);
        else if (garden) c.setRGB(.24 + patch * .035, .22 + patch * .025, .14);
        else if (townPaddy(x, z)) c.setRGB(.5 + patch * .04, .42 + patch * .03, .24);   // 刈田は藁色
        else c.setRGB(.33 + patch * .13, .36 + patch * .06, .22 + patch * .05);
      }
      // 町の着色範囲より北でも街道の踏み土を続ける。陣中で草地へ途切れさせない。
      // 路肩二メートルから四メートルで元の地肌へ戻し、形・材質は増やさない。
      const northRoadDistance = distToPolyline(x, z, NORTH_ROAD);
      if (z < -80 && northRoadDistance < 4) {
        const t = Math.min(1, (4 - northRoadDistance) / 2);
        c.lerp({ r: .36 + patch * .035, g: .30 + patch * .025, b: .21 }, t * t * (3 - 2 * t));
      }
      // 大津への進出と後詰の通路を、町の外でも草地へ途切れさせない。
      // ならした路肩まで同じ踏み土を渡し、縁の二メートルは周囲の地肌へ戻す。
      const lakeRoadDistance = distToPolyline(x, z, LAKE_ROAD);
      if (lakeRoadDistance < LAKE_ROAD_HALF_WIDTH) {
        const t = Math.min(1, (LAKE_ROAD_HALF_WIDTH - lakeRoadDistance) / 2);
        c.lerp({ r: .36 + patch * .035, g: .30 + patch * .025, b: .21 }, t * t * (3 - 2 * t));
      }
      // 西の登り口も、印だけを林の中に置かず、同じ下知の道へ踏み土を続ける。
      const hieiDistance = hieiPathDistance(x, z);
      if (hieiDistance < 3) {
        const t = Math.min(1, 3 - hieiDistance);
        c.lerp({ r: .36 + patch * .035, g: .30 + patch * .025, b: .21 }, t * t * (3 - 2 * t));
      }
      // 民家の戸口・堂の庭から逃げ道へ続く踏み跡。畑や庭の色を付けた後にも残す。
      // 地面の色だけで描き、軍道の指定や兵の足場・進む速さは変えない。
      let civilianPath = Infinity;
      for (const path of CIVILIAN_PATHS) civilianPath = Math.min(civilianPath, distToPolyline(x, z, path));
      if (civilianPath < 2.4) c.lerp(CIVILIAN_PATH_COLOR, Math.min(1, (2.4 - civilianPath) / 1.2) * .75);
    },
    clear: (x, z) => monomiClear(x, z) || usaDanClear(x, z) || CIVILIAN_HOMES.some(p => Math.hypot(x - p[0], z - p[1]) < 8) || hostClearing(x, z) || hieiPathDistance(x, z, HIEI_HOST_PAD) < 4 || CIVILIAN_BANDS.some(b => Math.hypot(x - b.x, z - b.z) < 6) || CIVILIAN_PATHS.some(p => distToPolyline(x, z, p) < 4) || USA_PLAN.kuruwa.some(k => pointInUsa(k.poly,x,z)) || ALL_PATHS.some(p => distToPolyline(x,z,p) < (p === LAKE_ROAD ? LAKE_ROAD_HALF_WIDTH : 4)) || (Math.abs(x - TOWN.x) < 50 && z > -70 && z < 60) || (x > -48 && x < 6 && z > 64 && z < 116) || distToPolyline(x, z, PATH_WELL) < 5 || (x > -20 && x < 30 && z > 40 && z < 90) || campClearing(x, z, ASAKURA_CAMP) || campClearing(x, z, AZAI_CAMP) || (x > -44 && x < 80 && Math.abs(z - REAR_Z) < 14),
    trees: 520,
    layeredNeedles: true, // 既存の枝の起伏で、杉を積んだ円錐の形に見せない。
    raggedNeedles: true,
    softFarNeedles: true,
    unevenCrowns: true, // 松・雑木も共有の葉房を崩し、刈り込んだ塊の輪郭を和らげる。
    // 林の追加の株も含めて道から離し、近い樹冠で坂と下の段の兵を隠さない。
    treePadMul: 2.2,
    clearGroves: true, // 追加の林にも同じ道幅を適用し、折り返しへ枝を張り出させない。
    tufts: 3400,
    treeDensity: (x, z) => (x > -30 && x < 70 && z > -80 && z < 60 ? 0.15 : 1),
    groves: [{ x: -40, z: 0, r: 14, n: 20 }, { x: 50, z: 70, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (z < -140 || x < -90),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    timeslipField(rt);   // 身の回りの刈り跡の田・町口の矢と笠（def.timeslip）
    // 遠くの木の葉の板は日に白く透けた絵に見える。遠景の板だけ色を沈め、近くの杉と同じ緑へ寄せる。
    {
      const darkened = new Map();
      rt.scene.traverse((m) => {
        const far = m.userData?.farFoliage;
        if (!far?.isInstancedMesh || !far.userData.treeFoliage || Array.isArray(far.material)) return;
        if (!darkened.has(far.material)) { const c = far.material.clone(); c.color.setRGB(.66, .72, .58); darkened.set(far.material, c); }
        far.material = darkened.get(far.material);
      });
    }
    // 志賀の昼だけ陰を補い、土・草・茅の白飛びを抑える。
    // 補助光を抑えた本流の配分で、陰の形と甲冑の見やすさを保つ。
    const lookOf = W.lookOf.bind(W);
    W.lookOf = (key) => {
      const look = lookOf(key);
      if (key === 'day') {
        look.hemiI = 1.3; look.hemiGround.setHex(0x81745a);
        // 東は＋x、南は＋z。北緯約３５度、秋の赤緯を約－８度と仮定した復元。
        // 朝は東南の高度約３０度、昼は真南の約４７度。開戦時刻・当日の赤緯を断定しない。
        // 南中高度＝９０度－緯度＋赤緯。明るさは保ち、光の向きだけを合わせる。
        // https://www.nao.ac.jp/faq/a0109.html
        look.sunI = 1.8;
        if (W.mood === 'morning') look.sunDir.set(100, 70, 74).normalize();
        else look.sunDir.set(0, 107, 100).normalize();
      }
      return look;
    };
    // 地面すれすれの細い影の筋を抑え、人物の影は残す。
    W.sun.shadow.normalBias = .12;
    W.sun.shadow.bias = -.0002;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { usayamaSite: 'HIST_A', sakamoto: 'HIST_A', mori: 'HIST_A', fire: 'HIST_A', kuruwa: 'HIST_B', twoFronts: 'HIST_B', volley: 'GAME_C' };
    F.waves = [];
    F.battleDay = 16;
    F.step = 0; F.ek = 0; F.ak = 0; F.rescued = true; // この戦では致命傷から立ち上がる救済を使わない。
    // ---- 坂本の町（湖べりの町屋） ----
    // 戸口で待つ家族と同じ在所を建て、家の東から湖側へ逃げる道を残す。
    const houses = [...TOWN_HOMES, ...CIVILIAN_HOMES, ...STREET_HOMES];
    let houseWallMat = null, houseRoofMat = null;
    const cameraHomes = [], cameraBlock = W.cameraBlockFraction;
    // 屋根は通れる門の口とは別の体積で避ける。面の判定を待つ間も
    // 軒の裏へ視点が抜けず、柱の間は今までどおり見通せる。
    const cameraGateRoof = (x, z, width, rot) => cameraHomes.push({
      x, z, y: W.heightAt(x, z), c: Math.cos(rot), s: Math.sin(rot),
      w: width / 2 + 1.6, d: 2.1, bottom: 3.25, h: 4.9,
    });
    const homeYards = [];
    for (const [x, z, r] of houses) {
      const street = STREET_HOMES.some(h => h[0] === x && h[1] === z);
      const house = hut(W, x, z, street ? 6.5 : 7, street ? 4.5 : 5, r, { wall: 0x7b6448, groundedHome: true, ...(street ? { solid: false } : {}) });
      // 湖側の在所も町屋と同じ壁として扱い、家族のいる家へ視点を入れない。
      cameraHomes.push({ x, z, y: house.position.y, c: Math.cos(r), s: Math.sin(r) });
      // 壁は近景・遠景の入れ物の下にある。両方へ同じ材質を渡す。
      house.children[0].traverse(o => {
        if (!o.isMesh) return;
        if (!houseWallMat) houseWallMat = o.material;
        o.material = houseWallMat;
      });
      // 壁の囲み球へ目線が入っても、家の壁を丸ごと隠さない。
      // 視点は町屋の面で止め、直前の面だけ共通の距離判定で避ける。
      house.traverse(o => { if (o.isMesh) o.userData.camSurfaceFade = true; });
      house.children[1].traverse(o => {
        if (!o.isMesh) return;
        if (!houseRoofMat) houseRoofMat = sakamotoRoofTint(o.material);
        o.material = houseRoofMat;
      });
      // 茅の厚みは hut の屋根にある。軒へ別の角材を重ねて張り出させない。
      rt.scene.add(house);
      homeYards.push({ x, z, r, w: street ? 6.5 : 7, d: street ? 4.5 : 5, y: house.position.y });
    }
    sakamotoEaves(rt, homeYards);
    W.cameraBlockFraction = function (from, to) {
      let nearest = cameraBlock?.call(this, from, to) ?? null;
      for (const home of cameraHomes) {
        // 開いた扉も板の厚みを残す。門の中央は空け、回った葉だけで視点を止める。
        // 閉門中の箱を丸ごと外すと、肩越しの目線が開いた板の裏へ入ってしまう。
        if (home.gate) {
          if (home.gate.breached || !home.gate.struct.alive || !home.gate.gateObj.door.visible) continue;
          home.leaf.updateWorldMatrix(true, false);
          const e = home.leaf.matrixWorld.elements;
          home.x = e[12]; home.y = e[13]; home.z = e[14];
          home.c = e[0]; home.s = -e[2];
        }
        // 登った時と柱の間を歩く時は、芯の中から全方向を塞がず既存の面判定に任せる。
        if (home.naka != null && (rt.player.u.naka === home.naka + 1 ||
            Math.abs(from.x - home.x) < home.w && Math.abs(from.z - home.z) < home.d)) continue;
        const hit = townCameraHit(home, from, to);
        if (hit !== null && (nearest === null || hit < nearest)) nearest = hit;
      }
      return nearest;
    };
    sakamotoYards(rt);
    // 町口の左右に短い柵。中央と西の退き道には十分な口を空ける。
    const townBatch = makeSimpleBatch();
    for (const seg of [[-12, -28, 12, -28], [32, -28, 57, -28]]) palisade(W, seg, { h: 1.25, batch: townBatch });
    finalizeSimpleBatch(rt, townBatch);
    rt.scene.add(kabukimon(W, 22, -28, 8, Math.PI, { doors: false }));
    cameraGateRoof(22, -28, 8, Math.PI);
    rt.scene.add(tawara(W, 28, 30, 0.2, 5));
    rt.scene.add(dou(W, CIVILIAN_TEMPLE.x, CIVILIAN_TEMPLE.z, 6, 4, 0));
    // ---- 宇佐山城：縄張り（castles/usayama.js）。三の丸・二の丸・本丸の三つの曲輪、木戸三つ＋水の手口、櫓。縁は切岸で、道でしか上れない ----
    resetGates(); flReset();
    const GA = GATE_OUT.rot;   // 木戸の外の向き（北＝坂本の町の側）
    // 常設の物見は屋根と板囲いのある型にそろえ、木戸脇を格子だけの塔にしない。
    F.C = buildCastlePlan(rt, USA_PLAN, { baseHeight: liftedTerrain, edgeW: 3, skipWalls: USA_PLAN.kuruwa.map(k=>k.id), buildTowers: true, towerKind: 'ro', team: 0, life:false,
      // 春日山の CG のように細い段にも小屋を並べる（castle_bldg.js の細い段の置き方。10/28）
      dense: { thin: true } });
    // 物見の旗や梯子まで大きな箱にせず、丸太と板囲いの芯だけを視点から避ける。
    for (const tower of F.C.towers) cameraHomes.push({
      x: tower.x, z: tower.z, y: tower.mesh.position.y, c: 1, s: 0,
      w: 1.85, d: 1.85, h: tower.topY - tower.mesh.position.y + 2.3, naka: tower.naka.id,
    });
    // 柵は城方（味方）の物：castle_plan の塀は寄せ手の側の物なので、口を空けた線で手置きする
    F.uwall = [];
    const wallBatch=makeSimpleBatch(), wallKitBatch=makeKitBatch();
    WALLS.forEach((pts,i) => {
      const baseY=i<4?SAN_Y:i<6?NI_Y:i<9?HON_Y:i<11?NI_Y:ARC_Y;
      const wallWorld=Object.create(W);
      wallWorld.heightAt=(x,z)=>Math.max(baseY,W.heightAt(x,z));
      // 石垣が残る線にだけ土塀を載せる。長い囲いの一部を丸ごと石垣扱いにしない。
      const stoneAt=(x,z)=>STONE_LINES.some(w=>distToPolyline(x,z,w.pts)<.3);
      const wallMesh=(world,seg,opts)=> {
        const stoneTop=stoneAt((seg[0]+seg[2])/2,(seg[1]+seg[3])/2);
        // 土の縁の杭と控えは描く地肌へ差す。曲輪の水平な床まで持ち上げると根元が宙に出る。
        return (stoneTop?dobei:palisade)(stoneTop?wallWorld:W,seg,{...opts,batch:stoneTop?wallKitBatch:wallBatch});
      };
      for(const s of wallLine(rt,pts,{team:0,hp:1e9,name:'城の囲い',segLen:8,mesh:wallMesh,meshOpt:{ita:true,h:1.9,mound:false}})) {s.noTarget=true;s.wall=true;F.uwall.push(s);}
    });
    finalizeSimpleBatch(rt,wallBatch);
    finalizeKitBatch(rt,wallKitBatch);
    // 木戸（castle_parts.kido）を siege_gate の門に。外から叩けば壊れ、内に入られて門兵が居なくなれば開く
    // 大手木戸（三の丸の外）：寄せ手が最初に取り付く、今の「前の木戸」
    F.kido = kido(rt, GATE_OUT.x, GATE_OUT.z, 3.2, GATE_OUT.rot, { team: 0, hp: 2600, name: GATE_OUT.name, h: 2.8 });
    F.gate = F.kido.struct; F.gate.armor = 0.25;
    F.gateC = { x: GATE_OUT.x, z: GATE_OUT.z };
    F.gateN = { x: Math.sin(GA), z: Math.cos(GA) };
    rt.scene.add(kabukimon(W, GATE_OUT.x, GATE_OUT.z, 4.4, GATE_OUT.rot, { doors: false }));
    F.gateMk = makeGate(rt, F.kido, { name: GATE_OUT.name, guardTeam: 0 });
    // 二の丸の木戸（三の丸→二の丸）
    F.kidoNi = kido(rt, GATE_NI.x, GATE_NI.z, 3.2, GATE_NI.rot, { team: 0, hp: 2200, name: GATE_NI.name, h: 2.8 });
    F.gateNiMk = makeGate(rt, F.kidoNi, { name: GATE_NI.name, guardTeam: 0 });
    rt.scene.add(kabukimon(W, GATE_NI.x, GATE_NI.z, 4, GATE_NI.rot, { doors: false }));
    // 本丸の木戸（二の丸→本丸）
    F.kidoHon = kido(rt, GATE_HON.x, GATE_HON.z, 4, GATE_HON.rot, { team: 0, hp: 1800, name: GATE_HON.name });
    F.gateHonMk = makeGate(rt, F.kidoHon, { name: GATE_HON.name, guardTeam: 0 });
    // 水の手口（本丸の裏。木戸の無い口のままだと外から素通りできるので、ここにも木戸を立てる）
    F.kidoUra = kido(rt, URA.x, URA.z, 2.8, 0, { team: 0, hp: 1500, name: URA.name });
    F.gateUraMk = makeGate(rt, F.kidoUra, { name: URA.name, guardTeam: 0 });
    // 細い扉の面だけでは、携帯の横移動で視点が裏へ抜ける。
    // 開閉した各扉と柱の芯を体積で拾い、既存の視点補正で口の内側へ回す。
    // 箱は支度時だけ作る。兵の通り道と門の開閉・耐久には触れない。
    for (const [gate, at, width, frameWidth, height] of [
      [F.gateMk, GATE_OUT, 3.2, 4.4, 2.8],
      [F.gateNiMk, GATE_NI, 3.2, 4, 2.8],
      [F.gateHonMk, GATE_HON, 4, 4, 3],
      [F.gateUraMk, { ...URA, rot: 0 }, 2.8, 2.8, 3],
    ]) {
      const c = Math.cos(at.rot), s = Math.sin(at.rot), y = gate.gateObj.mesh.position.y;
      cameraGateRoof(at.x, at.z, frameWidth, at.rot);
      for (const pivot of gate.gateObj.door.userData.leaves) {
        cameraHomes.push({ x: at.x, z: at.z, y, c, s,
          w: (width / 2 - .04) / 2 + .06, d: .24, h: height,
          gate, leaf: pivot.children[0] });
      }
      for (const side of [-1, 1]) for (const back of [0, -1.6]) {
        const x = at.x + side * (frameWidth / 2 + .17) * c + back * s;
        const z = at.z - side * (frameWidth / 2 + .17) * s + back * c;
        cameraHomes.push({ x, z, y: W.heightAt(x, z) - .05, c, s,
          w: back ? .14 : .2, d: back ? .14 : .2, h: back ? 2.5 : 3.3 });
      }
    }
    // 寄せ手が木戸を破ってゆく順（大手→二の丸→本丸）。onStructHit/onStructDestroyed・HUD・assault の的に使う
    F.gates = [F.gate, F.kidoNi.struct, F.kidoHon.struct];
    // 自分の城の門は、門の前で押して開け閉めできる（城へ退く・打って出る時に。kaito 10/2）
    F.gu = gateUse(rt, [F.gateMk, F.gateNiMk, F.gateHonMk, F.gateUraMk], { team: 0 });
    dressUsayama(rt);
    guardShigaRoad(rt);
    dressShigaRoad(rt);
    dressShigaTown(rt);
    for (const [x, z] of [[-15, 76], [-32, 103], [-21, 136], [-5, 88]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    // ---- 森可成の手（自分の持ち場）と、織田信治の手 ----
    // 森家の鶴丸を隊旗・備の旗にする。具足と陣羽織、十文字槍と豪傑の型は本人の表を使う。
    // 鶴丸の根拠：可児市「可成寺」。この戦での旗の配り方は復元。
    // https://www.city.kani.lg.jp/24538.htm
    // 公記は可成とともに戦った道豪清十郎・道家助十郎兄弟の白い指物を記す。
    // https://ja.wikisource.org/wiki/信長公記#巻三（十）志賀御陣之事
    // 兄の清十郎も同じ森隊に置き、兄弟の白い指物を二人とも見せる。
    // 公記に可成と並んで記される尾藤源内・尾藤又八も同じ手に置く。細かな所属は復元。
    // 足軽十四人の指定（縮小後九人）を、十一人（七人）と名のある二人に分け、人数と兵種は保つ。
    // 名前はこの底本の表記。立ち位置・具足・筆跡と兵種の割り当ては推定復元。
    F.mori = allyGroup(rt, { name: '森可成の手', fixed: true, anchor: { x: TOWN.x, z: TOWN.z - 6 }, facing: Math.PI, width: 5, aggro: 10, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '森可成', invuln: true } },
        { type: 'samurai', n: 1, o: { name: '道家助十郎', flag: '天下一の勇士' } },
        { type: 'ashigaru', n: 1, o: { name: '道豪清十郎', flag: '天下一の勇士' } },
        { type: 'ashigaru', n: 1, o: { name: '尾藤源内' } },
        { type: 'ashigaru', n: 1, o: { name: '尾藤又八' } },
        { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 13 }], { ...ODA, flag: 'tsuru' }));
    F.moriU = F.mori.units[0];
    F.nobuharu = allyGroup(rt, { name: '織田信治の手', fixed: true, anchor: { ...NOBUHARU_POST }, facing: Math.PI, yariRanks: 3, aggro: 10, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '織田信治', invuln: true, hat: 'kabuto_m', haori: 0x6a1a14 } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], ODA));
    F.nobuU = F.nobuharu.units[0];
    // 青地茂綱の手（信長公記に町口での討死が記される）
    F.sakai = allyGroup(rt, { name: '青地茂綱の手', fixed: true, anchor: { ...AOCHI_POST }, facing: Math.PI, width: 4, aggro: 10, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '青地茂綱', invuln: true, hat: 'kabuto_g', haori: 0x5a2a1c } }, { type: 'ashigaru', n: 10 }], ODA));
    F.aochiU = F.sakai.units[0];
    // 城に残る者（武藤五郎右衛門ら）
    // 槍衾の横幅は width ではなく人数と段数で決まる。三人幅で塀と門柱を空ける。
    F.keep = allyGroup(rt, { name: '宇佐山城の守り', fixed: true, anchor: { x: -8, z: 56 }, facing: GA, width: 4, yariRanks: 5, aggro: 10, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '武藤五郎右衛門', invuln: true, hat: 'kabuto_w', horse: false } }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 4 }], ODA));
    F.hida = allyGroup(rt, { name: '肥田彦左衛門の本丸守り', fixed: true, fullStrength: true, anchor: { x: GATE_HON.x, z: GATE_HON.z + 8 }, facing: GATE_HON.rot, width: 3, formation: 'yari', aggro: 8 },
      dress([{ type: 'samurai', n: 1, o: { name: '肥田彦左衛門', invuln: true, horse: false } }, { type: 'ashigaru', n: 7 }], ODA));
    F.oda = [F.mori, F.nobuharu, F.sakai, F.keep, F.hida];
    F.keep.formation = 'yari'; F.keep.width = 4;
    F.castleGuards = [F.keep];
    for (const g of F.oda) {
      const lead = g.units[0], rear = g.units[g.units.length - 1];
      if (lead !== rear) { const slot = lead.slot; lead.slot = rear.slot; rear.slot = slot; }
      g.leader = lead;
    }
    F.guns = allyGroup(rt, { name: '信治の鉄砲組', fixed: true, fullStrength: true, anchor: { x: TOWN.x + 10, z: TOWN.z + 2 }, facing: Math.PI, width: 4, aggro: 4, formation: 'line' }, dress([{ type: 'gun', n: 6 }], ODA));
    const n = RANKS[rt.G.rank || 0].squad;
    if (n) rt.makeSquad({ x: TOWN.x + 8, z: TOWN.z + 10 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 大軍（軽い作り）：湖の西を下ってくる浅井・朝倉 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed, terrainRanks: true });
    // 後続三束は北の別列へ。同じ人数・幅・奥行きを保ち、本陣と二の備えへの重なりを解く。
    F.host = REAR_HOSTS.map((q, i) => {
      const host = DA(q.x, REAR_Z, q.w, q.d, q.count, q.facing, q.look.armor, q.look.flag, q.seed);
      host.userData.shigaHieiPath = REAR_HIEI_PATHS[i];
      return host;
    });
    // 公記の「両手」の方位は不明。陣図と同じ推定（山側が浅井、街道側が朝倉）で控えもそろえる。
    // 両家を横一列ずつ交互に置くと、先手と本陣の間で別家の備えを横切ってしまう。
    // 四束・各三百二十人と後続の人数は保つ。奥行きを詰め、後続まで含む二筋二段にする。
    // 奥行き五十二では次の備えと約十二メートル重なる。三十六なら三メートル余の間が残る。
    // 形・材質・旗の枚数は増やさず、十九日の前進と二十四日の移陣も既存の下知を使う。
    for (let row = 0; row < 4; row++) {
      const mountainSide = row % 2 === 0;
      const x = mountainSide ? -30 : 30, z = -101 - Math.floor(row / 2) * 56;
      const flag = mountainSide ? 'azai' : 'asakura';
      F.host.push(DA(x, z, 36, HOST_DEPTH, 320, 0,
        mountainSide ? AZA.armor : ASA.armor, flag, 15810 + row));
      // 公記の両手を示す推定配置。置き幟も各家の控えの両脇へそろえる。
      // 横一列の旧配置では別家の兵列へ幟が入り、二筋二段の備えと食い違う。
      // 浅井十二本・朝倉十六本を保ち、兵列の幅三十六の外に置いて進軍路を空ける。
      for (let col = 0; col < (mountainSide ? 6 : 8); col++) rt.scene.add(nobori(W,
        x + (col % 2 === 0 ? -20 : 20), z - 18 + Math.floor(col / 2) * 12, flag, 7));
    }
    F.advanceHosts = F.host.slice(REAR_HOSTS.length); // 両手の四束だけ前進。北の後続と本陣の控えは待機。
    // 両家の北の本陣の位置は復元。公記のこの条は朝倉方の将を特定しないため、義景本人と断定しない。
    // 根拠：『信長公記』巻三「志賀御陣之事」。
    // https://ja.wikisource.org/wiki/信長公記#巻三（十）志賀御陣之事
    F.campA = camp(rt, { ...ASAKURA_CAMP, contour: true, facing: 0, team: 1, faction: 'asakura', mon: 'asakura', armor: ASA.armor, general: { name: '朝倉の大将', hat: 'kabuto_m', haori: 0x5a4020 }, guard: 15, reserve: 0, runTo: { x: 26, z: -80 } });
    // 「浅井備前」は長政を指すが、この復元位置の陣を本人の持ち場とは特定できない。
    // 朝倉側と同じく、目に見える本陣の将は名を断定しない。
    F.campB = camp(rt, { ...AZAI_CAMP, contour: true, facing: 0.1, team: 1, faction: 'azai', mon: 'azai', armor: AZA.armor, general: { name: '浅井の大将', hat: 'kabuto_m', haori: 0x2a2a3a }, guard: 15, reserve: 0, runTo: { x: 0, z: -80 } });
    // 本陣の控えは移した陣幕の後ろへ。同じ人数で、二十四日に本隊と一緒に比叡山へ退かせる。
    // 共通の camp 内に任せると参照が残らず、後詰の後も坂本に五百六十人が居座る。
    for (let i = 0; i < CAMP_HOSTS.length; i++) {
      const q = CAMP_HOSTS[i];
      const host = farHost(rt, q.x, q.z, q.w, q.d, q.count,
        q.facing, q.look.armor, q.look.flag, q.seed);
      host.userData.shigaHieiPath = CAMP_HIEI_PATHS[i];
      F.host.push(host);
    }
    // 昼の常設の焚火は置かない。斜面に浮く火を消し、端城への放火は後の段で起こす。
    // 本陣の旗本は、陣幕の前で整った陣形のまま待つ（寄って来た者だけを相手にする）
    for (const c of [F.campA, F.campB]) if (c && c.guard) { c.guard.stay = true; c.guard.formation = 'line'; }
        // ---- 町口の戦いの部隊（butai.js）：前に立つ名のある組（本物）の後ろの本隊。本物はほとんど出さず、遠くで押し合う軽い作り ----
    const mkB = (o, real) => capReal(makeButai(rt, { real, ...o }), real);
    F.bMori = mkB({ name: '森可成の手の本隊', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 400, armor: 0x2a2622, flag: 'tsuru', at: { x: TOWN.x - 2, z: TOWN.z + 16 }, facing: Math.PI }, 0);
    F.bNobu = mkB({ name: '織田信治の手の本隊', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 250, armor: 0x2a2622, flag: 'oda', at: { x: TOWN.x + 30, z: TOWN.z + 12 }, facing: Math.PI }, 0);
    F.bAsa = mkB({ name: '朝倉の先手の本隊', team: 1, faction: 'asakura', kind: 'ashigaru', nominal: 500, armor: ASA.armor, flag: 'asakura', at: { x: 28, z: -96 }, facing: 0 }, 0);
    F.bAza = mkB({ name: '浅井の本隊', team: 1, faction: 'azai', kind: 'ashigaru', nominal: 450, armor: AZA.armor, flag: 'azai', at: { x: -22, z: -92 }, facing: 0.15 }, 0);
    for (const b of [F.bMori, F.bNobu, F.bAsa, F.bAza]) b.order({ id: 'hold' });

    F.bWing = mkB({ name: '尾根を回る浅井の手', team: 1, faction: 'azai', kind: 'ashigaru', nominal: 260, armor: AZA.armor, flag: 'azai', at: { x: -74, z: -120 }, facing: 0 }, 0);
    F.bWing.order({ id: 'hold' });
    // 民は本物の兵と両翼だけでなく、移動する本隊の縁からも退く。
    // 支度時に参照だけを渡し、兵の名簿や毎コマの形を増やさない。
    rt.civilianArmies = [F.bMori, F.bNobu, F.bAsa, F.bAza, F.bWing];
    const roster = {};
    const roles = [
      ['朝倉の先手', ASA, 22, -42, 20], ['浅井の先手', AZA, AZAI_VANGUARD_WAIT.x, AZAI_VANGUARD_WAIT.z, 12],
      // 十九日の二隊は北の空き地に控える。下知から二十秒ほどで町口へ届く位置に置く。
      ['正面から押す朝倉勢', ASA, 32, -54, 8], ['山側から押す浅井勢', AZA, -35, -40, 8],
      ['浅井の手', AZA, -24, -104, 10], ['追いすがる浅井勢', AZA, 22, -36, 3],
      // 公記では町口の守将の討死の後に端城へ攻め上る。十六日から退路の坂を占領させない。
      // 控えの配分と座標は復元。人数・兵種は保ち、同じ兵が北の寄せ場から歩く。
      // 控えは町口の冠木門の先（町屋の間から北が見通せる幅の内、五十〜八十歩）で列を保つ。遠い寄せ場では霞に沈み、
      // 町口から北を向いても浅井・朝倉の群れが見えなかった（10/29）。平たい遠景の兵は霞の手前に描かない決まり
      // （flat_rule.js）なので、見せる群れは既存の実兵で作る。人数・兵種は保ち、城へは同じ大手道へ合流して上る。
      ['城へ寄せる朝倉勢', ASA, 27, -56, 10], ['城へ寄せる浅井勢', AZA, 28, -68, 10],
      ['朝倉の新手', ASA, 16, -52, 10], ['木戸へ迫る最後の寄せ手', ASA, 17, -64, 8],
      ['街道を南へ抜ける朝倉の手', ASA, BYPASS_WAIT[0], BYPASS_WAIT[1], 8],
    ];
    for (const [name, look, x, z, n] of roles) {
      const bows = name.includes('城へ寄せる') || name === '朝倉の新手' || name === '木戸へ迫る最後の寄せ手' ? 2 : 0;
      roster[name] = enemyGroup(rt,
      { name, faction: look === AZA ? 'azai' : 'asakura', anchor: { x, z }, facing: 0, order: 'hold', seekRange: 12, aggro: 8, morale: 90, fleeDir: { x: -1, z: -1 } },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: n - 1 - bows }, { type: 'bow', n: bows }], look));
      const castleReserve = name.includes('城へ寄せる') || name === '朝倉の新手' || name === '木戸へ迫る最後の寄せ手';
      const waiting = castleReserve || name === '正面から押す朝倉勢' || name === '山側から押す浅井勢';
      roster[name].fire = !bows && !waiting;
      if (waiting) {
        // 下知まで北の控えで列を保つ。出発時も位置と死傷者を引き継ぐ。
        roster[name].aggro = 0;
      }
      if (castleReserve) {
        roster[name].formation = 'column'; roster[name].colW = 1;
      }
      if (name === '街道を南へ抜ける朝倉の手') {
        // 狭い北の街道でも全員を道幅へ収め、二十日の出発まで同じ列で待つ。
        roster[name].formation = 'column'; roster[name].colW = 2;
      }
    }
    F.roster = roster;
    // 先手に続く控えも民には兵。描画中の位置を借り、在所の民が列を横切らないようにする。
    const civilianBack = (g, o) => {
      const light = KIT.backOf(rt, g, o);
      rt.civilianArmies.push({ light, group: g, lightCount: () => g.routed ? 0 : g.count });
    };
    civilianBack(roster['朝倉の先手'], { flag: 'asakura', armor: ASA.armor, w: 24, depth: 12, count: 120, seed: 15794 });
    civilianBack(roster['浅井の先手'], { flag: 'azai', armor: AZA.armor, w: 20, depth: 10, count: 90, seed: 15797 });
    // 同じ人数の両翼を町口へ寄せ、共通の突き・受け・引きで前列の圧力をつなぐ。
    // 公記の「坂本の町はつれ」に対応する推定復元。湖側の乱戦を町屋の壁から離す。
    // 中心５４・幅２０では東４８の町屋を横切る。中心６８なら西端５８で町柵の東端５７も避け、
    // 東端７８も民の避難路８２〜８４と水際９４より内側。兵数・幅・密度は保つ。
    F.lines = lines(rt, [
      { x: -8, z: -14, facing: Math.PI, w: 24, measuredMelee: true, seed: 15795, A: ['oda', 0x2a2622, 90, 'oda'], B: ['azai', AZA.armor, 180, 'azai'], flagRateB: .25, surge: false },
      { x: 68, z: -18, facing: Math.PI, w: 20, measuredMelee: true, seed: 15796, A: ['oda', 0x2a2622, 80, 'oda'], B: ['asakura', ASA.armor, 160, 'asakura'], flagRateB: .25, gunsB: true, surge: false },
    ]);

    // 九月十六日・十九日には信長は摂津。後詰は二十四日の札まで姿を出さない。
    // 公記では逢坂越えから下坂本へ進む。城の南の山腹ではなく、東の湖岸寄りを北上させる。
    // 道筋と縮尺は推定。横に散る兵を含め、幅二十の街道と地面の南端の内に収める。
    F.aid = W.addDistantArmy({ ...AID_START, w: AID_WIDTH, d: AID_DEPTH, count: 180, facing: Math.PI, armor: 0x2a2622, flagTex: flagTexture('oda'), mon: 'oda', team: 0, seed: 15924 });
    F.aid.army.noWake = true;
    F.aid.visible = false;
    rt.world.setTime('day');
    for (let i = 3; i < ROAD.length; i += 2) {
      // 曲がり角そのものを空け、手前の直線の路肩へ置く。
      // 東へずらすだけでは、東西に延びる道の中央へ竿が戻ってしまう。
      const [ax, az] = ROAD[i - 1], [bx, bz] = ROAD[i];
      const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
      if (length < 1) continue;
      const x = bx - dx / length * 6 + dz / length * 4.5;
      const z = bz - dz / length * 6 - dx / length * 4.5;
      const flag = nobori(W, x, z, 'oda', 3.2);
      flag.scale.set(.6, 1, .6); rt.scene.add(flag);
    }
    batchShigaFlags(rt);
    // 25秒で着く町口の西（28,6・西を向く）：地面の踏み跡・窪みの泥・草の斑、手前に俵・材木・篝火、半分埋めた岩、
    // 中景に板葺きの番所二つと板塀・織田の幟（森隊の陣）。正面は空ける（stage_dress）。
    dressStage(rt, { at: { x: 28, z: 6 }, heading: -1.3, huts: 2, flag: 'oda', yagura: false, clutter: 5, rocks: 8,
      trodden: .6, wet: .35, radius: 60, seed: 1170, avoid: (x, z) => townPaddy(x, z) || Math.hypot(x - TOWN_POST.x, z - TOWN_POST.z) < 6 });
    nishiMonomi(rt);   // 町口の西の山裾に物見の段（25秒の画面の奥の山肌）
    usaDan(rt);   // 宇佐山の北東の裾に城方の段（町口で南を向いた画面の奥）
    shigaTownGround(rt);   // 25秒の町口の広場の草の群れ・轍・落ち藁・小石
    rt.setPhase('brief');
    // 公記の「三万計」「纔千の内」に合わせ、概数と復元した配分を混同させない。
    rt.banner('坂本へ迫る三万ほどの軍勢', '守る兵は千に満たぬ。九百五十は復元の目安');
    rt.obj('main', '森隊の槍の列に入り、町口を守れ', 'main');
    rt.say('森可成', rt.G.lord ? '敵は浅井・朝倉、三万ほど！　殿、わしらが町口を支えまする！' : '敵は浅井・朝倉、三万ほど！　殿は摂津じゃ。わしの槍の列へ入れ！', 4);
    rt.marker('mori', TOWN_POST, '森隊の槍の列', { guideRadius: 3, hideNear: 3, hideOnArrival: true });
    rt.after(4.5, () => { if (F.step === 0) rt.say('織田信治', '湖側はわしが受ける。森殿の列から離れるな！', 3); });
    rt.after(8, () => { if (!F.ending && !rt.over) this.first(rt); });
  },

  // ① 浅井・朝倉の先手を迎え撃つ
  first(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('first');
    // 本人を囲む数は、共通の槍の間合いに従う。
    // 攻撃人数は共通の間合い判定に従う。本人だけを二人に制限しない。
    rt.marker('mori', TOWN_POST, '守る町口・森隊の列', { guideRadius: 3, hideNear: 3, hideOnArrival: true });
    shigaSignal(rt, 'hajime', TOWN_POST, 0.9);
    F.townSoundText = '開戦の法螺と太鼓。町口で先手を迎え撃て'; F.townSoundUntil = rt.t + 8;
    F.townSignalUntil = F.townSoundUntil;
    rt.banner('九月十六日・坂本の町口', '湖の西の道を、浅井・朝倉の旗が下ってくる');
    rt.obj('main', '町口で先手を迎え撃て', 'main');
    rt.objProgress('main', F.townSoundText);
    // 公記の十六日は足軽合戦、十九日は大軍の両手の寄せ。本隊の一斉前進は十九日に分ける。
    // 北の全軍は同じ人数のまま見せ、先手の後続だけ町口へ出す。近い両翼の乱戦は保つ。
    F.bAsa.order({ id: 'move', to: { x: 28, z: -50 } });
    F.clashT = true;
    const g = enemyGroup(rt, { faction: 'asakura', name: '朝倉の先手', anchor: { x: 22, z: -70 }, marchTo: { x: 22, z: TOWN.z - 10 }, facing: 0, order: 'attack', seekRange: 90, aggro: 14, width: 16, morale: 95, fleeDir: { x: 0, z: -1 }, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '朝倉の侍大将' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'bow', n: 3 }], ASA));
    F.w1 = g;
    // 開戦の法螺を受け、森隊が合成の鬨で応える。一度だけ、今いる隊の位置で鳴らす。
    // 太鼓の余韻と開戦の札の八秒を待ってから、鬨と次の下知を返す。
    rt.after(8, () => {
      if (rt.over || F.ending || F.step !== 1 || gone(F.mori) || F.mori.routed) return;
      shigaSignal(rt, 'eiei', F.mori.center(), 0.65);
      F.townSoundText = '味方の鬨。槍の列を揃え、町口を守れ'; F.townSoundUntil = rt.t + 8;
      F.townSignalUntil = F.townSoundUntil;
      rt.objProgress('main', F.townSoundText);
      rt.objProgress('mouth', F.townSoundText);
      rt.say('森可成', '味方の鬨じゃ！　槍の列を保て、深追いするな！', 3);
    });
    // 町口の左右では、森・信治の手の後ろの者と朝倉の大軍が押し合う（軽い作り）
    F.lines.forEach((c, i) => rt.after(6 + i * 2, () => c.go()));
    rt.marker('w1', centerOf(g), () => `朝倉の先手`, { red: true, group: g });
    rt.say('森可成', '開戦の法螺と太鼓じゃ！　鬨を上げ、槍先を揃えよ！', 3);
    // 勝ち筋：町口は狭く、大軍でも横に広がれぬ。口を塞いで鉄砲で頭を叩く
    rt.after(10, () => shigaSupportVoice(rt, '青地茂綱', '山側はわしが守る！　敵を追って列を空けるな！', 3,
      () => F.step === 1 && F.aochiU.alive));
    rt.obj('mouth', '町口を守れ、深追いするな', 'order');
    rt.objProgress('mouth', F.townSoundText);
    // 一斉射：信治の鉄砲組を町口の前に並べ、先手が寄せた所で放つ（元亀元年、鉄砲はまだ少ない）
    volleyScene(rt, { guns: () => [F.guns], at: { x: TOWN.x + 6, z: TOWN.z - 14 }, r: 34, who: '織田信治', shots: 3, interval: 30, noMorale: true,
      // 法螺と太鼓、八秒後の鬨、続く山側の下知が済んでから射撃の号令へ移る。
      // 鬨の札は十六秒まで。その後の山側の下知三秒と一拍を待ってから放つ。
      // 鉄砲組は初めから撃たずに待つ。台詞だけ隠して銃声や札を重ねない。
      startDelay: 20,
      aim: '鉄砲組、狙いを揃えよ！　まだ撃つな！',
      active: () => F.step === 1,
      // 敵の銃声や不発の説明も八秒保つ。開戦の合図だけを見ると、
      // 聞こえた音の説明を次の射撃号令と札で途中から消してしまう。
      canCue: () => rt.t >= Math.max(shigaCommandUntil(F), F.supportVoiceUntil || 0),
      onCue: (cue, fired, together) => {
        if (cue === 'end') F.townVolleyDone = true;
        // 最後の斉射の直後に射撃の段が終わっても、銃声の札は八秒残す。
        // 次の日や退却へ移った後には、町口の下知を戻さない。
        if (cue === 'end' && rt.t < F.townSoundUntil) {
          const until = F.townSoundUntil;
          rt.after(until - rt.t, () => {
            if (rt.over || F.ending || F.step !== 1 || F.townSoundUntil !== until) return;
            F.townSoundText = '鉄砲組は各々撃て。町口を守り、深追いするな';
            F.townSoundUntil = rt.t + 8;
            rt.objProgress('main', F.townSoundText);
            rt.objProgress('mouth', F.townSoundText);
          });
          return;
        }
        // 鉄砲の待機案内だけで、鳴っている開戦の合図と鬨の札を消さない。
        // 狙い・放ての下知と実際の銃声は、その場で伝える。
        if (cue === 'wait' && rt.t < F.townSignalUntil) return;
        const gunSound = fired > 1 ? together ? '鉄砲の斉射' : '鉄砲のばら撃ち' : '鉄砲の一発';
        // 発砲の札を直後の弾込めで消さず、聞こえた音と次の守り方を一緒に残す。
        F.townSoundText = cue === 'silent' ? '鉄砲の銃声がない。槍の列で町口を支えよ' : cue === 'wait' ? '鉄砲組は敵を引きつける。槍の列を保て' : cue === 'aim' ? '鉄砲組は狙いを揃える。まだ撃つな、槍の列を保て' : cue === 'release' ? '放ての下知。槍の列を保ち、鉄砲組を守れ' : cue === 'fire' ? `${gunSound}。槍の列を保ち、深追いするな` : cue === 'reload' ? `${gunSound}の後、弾込め中。槍の列で町口を支えよ` : '鉄砲組は各々撃て。町口を守り、深追いするな';
        F.townSoundUntil = rt.t + 8;
        rt.objProgress('main', F.townSoundText);
        rt.objProgress('mouth', F.townSoundText);
        // 狙いが遮られた時も、不発と決めつけず、鳴らなかった事と守り方を伝える。
        if (cue === 'silent') rt.say('織田信治', '銃声がないぞ！　鉄砲組は狙いと火縄を確かめよ。槍の列で支えよ！', 3.5);
        if (cue === 'fire' && fired > 1 && !together)
          rt.say('織田信治', '銃声がばらついたぞ！　弾を込め直せ。槍の列で支えよ！', 3.5);
      },
      banner: ['一斉射', '町口の鉄砲が先手を撃つ'], clash: () => F.lines });
    // 公記の十六日は浅井・朝倉の足軽合戦。二つ目の隊を浅井とする配分・位置は推定。
    // 山側の控えから同じ側の乱戦へ寄せる。後続も同じ隊を追い、町屋の北で受ける。
    // 人数・兵種・隊幅・到着の間隔は保つ。左右の配置を史実とは断定しない。
    rt.after(18, () => {
      if (F.step !== 1) return;
      F.w1b = enemyGroup(rt, { faction: 'azai', name: '浅井の先手', anchor: { ...AZAI_VANGUARD_WAIT }, marchTo: AZAI_VANGUARD_FRONT, facing: 0, order: 'attack', seekRange: 90, aggro: 14, width: 12, morale: 90, fleeDir: { x: 0, z: -1 } },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], AZA));
      rt.marker('w1b', centerOf(F.w1b), () => `浅井の先手`, { red: true, group: F.w1b });
      shigaSupportVoice(rt, '青地茂綱', '山側から浅井の先手じゃ！　列を保て！', 2.5,
        () => F.step === 1 && F.aochiU.alive && !gone(F.w1b) && !F.w1b.routed);
    });
  },

  // ①の後の段：町口の押し合い（浅井が背へ回る）→ ②へ
  midA(rt) {
    const F = rt.flags;
    if (F.step >= 1.25) return;
    F.step = 1.25;
    // 日を飛ばす時だけ短く暗転する。人数・傷は引き継ぎ、補充しない。
    const cut = document.createElement('div');
    cut.style.cssText = 'position:fixed;inset:0;background:#080705;color:#f4ead8;display:grid;place-items:center;z-index:10000;pointer-events:none;font-size:20px';
    cut.textContent = '三日後、九月十九日';
    document.body.appendChild(cut); F.dayCut = cut;
    rt.after(0.4, () => {
      if (F.ending || rt.over || !rt.player.u.alive) return;
      // 日差しと雲を替える。朝の光は場面の復元で、史料の開戦時刻ではない。
      shigaDay(rt, 19, 'morning');
      // 三日の間に息を整えた者も、傷・弾数・隊の死傷は戻さない。
      for (const u of rt.army.units) if (u.alive && !u.gone && !u.woundOut && !u.rearWound && !u.dying) {
        u.fat = 0; u.hfat = 0;
      }
      rt.player.sta = rt.player.maxSta; rt.player.hfat = 0;
      // 亡骸だけを片付ける。生きた負傷兵と搬送中の者は消さない。
      for (let i = rt.army.dead.length - 1; i >= 0; i--) {
        const u = rt.army.dead[i];
        if (u.alive || u.isPlayer || u.dying || u.death?.aid) continue;
        rt.uninteract('head' + u.id);
        rt.army.clearCorpse(i);
      }
    });
    rt.after(1.2, () => {
      cut.remove(); F.dayCut = null;
      if (!F.ending && !rt.over && rt.player.u.alive) this.midArmy(rt);
    });
  },

  midArmy(rt) {
    const F = rt.flags;
    F.step = 1.5;
    rt.unmark('w1'); rt.unmark('w1b'); rt.objRemove('mouth');
    for (const q of [F.w1, F.w1b]) if (q && !gone(q)) { q.order = 'hold'; q.seekRange = 12; }
    rt.say('', gone(F.w1) && gone(F.w1b) ? '――九月十六日、先手を押し返した。十九日、敵が再び寄せる' : '――九月十六日、町口を保った。十九日、敵が再び寄せる', 4);
    if (gone(F.w1) && gone(F.w1b)) rt.award((t) => t.side.push('浅井・朝倉の先手を退けた'), '浅井・朝倉の先手を退けた');
    // 控えは北の寄せ場から前進し、町屋の手前で備える。町口へは従来の実兵と本隊が寄せる。
    // 両手の方位・進む距離と秒数は推定復元。兵の削減や追加はしない。
    for (const h of F.advanceHosts) h.advance(HOST_FIRST_ADVANCE, 50);
    F.bAza.order({ id: 'move', to: { x: -12, z: -54 } });
    F.stepT = rt.t;
    // 可成が敵を受けて動いても、守る印は家の方へ追わせず同じ町口へ残す。
    rt.marker('mori', TOWN_POST, '守る町口・森隊の列', { h: 3, guideRadius: 3, hideNear: 3, hideOnArrival: true });
    rt.obj('main', '敵の突撃太鼓。両手の敵を町口で受けよ', 'main');
    rt.obj('mouth', '町口を守れ。味方の退き口を保て', 'order');
    // 日をまたぐ経過は見出しに残す。同時の合図の台詞で日付説明を消さない。
    rt.banner('九月十九日・両手の寄せ', gone(F.w1) && gone(F.w1b)
      ? '十六日は先手を押し返した。十九日、浅井・朝倉が両手から寄せる'
      : '十六日は町口を保った。十九日、浅井・朝倉が両手から寄せる');
    rt.say('森可成', '敵の法螺と突撃太鼓じゃ！　両手から来るぞ、退き口を保て！', 4);
    for (const c of F.lines || []) c.push('B', 0.7);
    F.twoHands = [
      enemyGroup(rt, { faction: 'asakura', name: '正面から押す朝倉勢', anchor: { x: 24, z: -48 }, marchTo: { x: 24, z: TOWN.z - 10 }, facing: 0, order: 'attack', seekRange: 75, aggro: 12, morale: 95 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], ASA)),
      enemyGroup(rt, { faction: 'azai', name: '山側から押す浅井勢', anchor: { x: -35, z: -12 }, marchTo: { x: TOWN.x - 10, z: TOWN.z - 6 }, facing: Math.PI / 2, order: 'attack', seekRange: 75, aggro: 12, morale: 95 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], AZA)),
    ];
    for (const g of F.twoHands) g.fire = true;
    // 寄せ手の早打ちと鬨は出陣時だけ。聞こえる遠さは既存の合成音で決める。
    shigaSignal(rt, 'kakari', F.twoHands[0].center(), 0.85);
    F.townSoundText = '敵の法螺と突撃太鼓。両手の敵を受け、退き口を保て'; F.townSoundUntil = rt.t + 10;
    rt.objProgress('main', F.townSoundText); rt.objProgress('mouth', F.townSoundText);
    // 突撃太鼓の余韻から順に鳴らす。銃声や負傷の下知が入った時も、
    // 固定の十八秒で割り込まず、音・台詞・両方の札をそろえて八秒ずつ保つ。
    const townCues = [
      [0, 'toki', 0.7, '正面の朝倉の鬨。槍の列で受け、退き口を保て', '森可成', '正面の鬨は朝倉じゃ！　槍の列で受けよ！', 1.6],
      [1, 'susume', 0.7, '山側の法螺と進み太鼓。両手の敵を受け、退き口を保て', '青地茂綱', '山側でも法螺と進み太鼓じゃ！　浅井が来るぞ、退き口を保て！', 3.5],
      [1, 'toki', 0.6, '山側の浅井の鬨。両手の敵を受け、退き口を保て', '青地茂綱', '山側の鬨は浅井じゃ！　退き口を空けておけ！', 2.5],
    ];
    let townCue = 0;
    const nextTownCue = () => {
      if (rt.over || F.ending || F.step !== 1.5) return;
      const wait = Math.max(shigaCommandUntil(F), F.supportVoiceUntil || 0) - rt.t;
      if (wait > 0) { rt.after(wait, nextTownCue); return; }
      while (townCue < townCues.length) {
        const [side, kind, vol, text, who, speech, dur] = townCues[townCue++];
        const g = F.twoHands[side];
        if (gone(g) || g.routed) continue;
        shigaSignal(rt, kind, g.center(), vol);
        F.townSoundText = text; F.townSoundUntil = rt.t + 8;
        rt.objProgress('main', text); rt.objProgress('mouth', text);
        rt.say(who, speech, dur);
        if (townCue < townCues.length) rt.after(8, nextTownCue);
        return;
      }
    };
    rt.after(10, nextTownCue);
    // 城攻めの控えは退く味方の後から出す。先に大手道を塞がせない。
  },
  siegeMarch(rt, i) {
    const F = rt.flags;
    const name = ['城へ寄せる朝倉勢', '城へ寄せる浅井勢', '朝倉の新手', '木戸へ迫る最後の寄せ手'][i];
    const g = F.roster[name];
    if (!g || gone(g) || g._siegeMarch) return;
    g._siegeMarch = true;
    // 北の控えは街道の途中から合流する。町口の点へ斜めに道を飛ばさない。
    this.castleAdvance(rt, g);
    rt.marker('x' + i, centerOf(g), g.name, { red: true, group: g });
    // 最初に動けた寄せ手だけが合図する。後続ごとに太鼓を重ねない。
    if (!F.siegeSignal) {
      F.siegeSignal = true;
      const marchSignal = () => {
        if (rt.over || F.ending || F.aidMoving) return;
        // 退却中に先発した隊も、籠城へ移ってから合図する。
        // ここで終えると合図済みの印だけが残り、後続も鳴らせなくなる。
        if (F.step === 2) { rt.after(2, marchSignal); return; }
        if (F.step !== 3 && F.step !== 3.5) return;
        // 待っている間に先頭が崩れたり木戸へ着いたら、まだ坂を進む後続から合図する。
        const marching = F.waves.find(q => !gone(q) && !q.routed && q.order === 'path');
        if (!marching) { F.siegeSignal = false; return; }
        // 兵の行進は止めず、合図と補足の下知を読み終えるまで待つ。
        const wait = Math.max(shigaCommandUntil(F) - rt.t, (F.supportVoiceUntil || 0) - rt.t,
          F.step === 3 ? F.stepT + 8 - rt.t : 0);
        if (wait > 0) { rt.after(wait, marchSignal); return; }
        shigaSignal(rt, 'susume', marching.center(), 0.8);
        F.castleSoundText = '敵の法螺と進み太鼓。木戸の内で受けよ'; F.castleSoundUntil = rt.t + 8;
        rt.say('武藤五郎右衛門', '敵の進み太鼓じゃ！　坂を上ってくるぞ、木戸の内で受けよ！', 3.5);
        rt.obj('mouth', '木戸の内で寄せ手を受けよ', 'order');
        rt.objProgress('mouth', F.castleSoundText);
        const marchCueUntil = F.castleSoundUntil;
        // 合成した太鼓の余韻に加え、進軍の札を八秒保ってから鬨へ移る。
        rt.after(8, () => {
          if (F.castleSoundUntil !== marchCueUntil || rt.over || F.ending || F.aidMoving || (F.step !== 3 && F.step !== 3.5) || gone(marching) || marching.routed ||
              marching.order !== 'path' || rt.t - (F.castleRetreatSignalT ?? -99) < 8) return;
          shigaSignal(rt, 'toki', marching.center(), 0.65);
          F.castleSoundText = '坂道の敵の鬨。木戸の内で寄せ手を受けよ'; F.castleSoundUntil = rt.t + 8;
          rt.objProgress('mouth', F.castleSoundText);
          rt.say('武藤五郎右衛門', '坂道で敵が鬨を上げたぞ！　木戸を出ず、槍を揃えて待て！', 3.5);
        });
      };
      marchSignal();
    }
  },
  // 町口の敵も切岸を直進せず、大手道から順に木戸を攻める。
  castleAdvance(rt, g, minRoad = 0) {
    if (!g || gone(g)) return;
    const F = rt.flags;
    const at = {}; roadProjection(g.anchor, at);
    // 通り過ぎた木戸が背後で閉じても、坂を戻らず次の木戸へ寄せる。
    const gate = F.gates.find((s) => s.alive && !s.opened && gateRoadIndex(s) >= Math.max(at.s - .15, minRoad));
    const found = gate ? gateRoadIndex(gate) : ROAD.length - 1;
    const end = found < 0 ? ROAD.length - 1 : found;
    // 町口からでも現在地に最も近い道へ合流してから、全ての角を通る。
    // 一律に三番目の角から始めると、町から山腹へ斜めに切り込み、
    // 公記の「端城まで攻め上り」を道のない切岸の横断にしてしまう。
    // 合流点・道筋は推定復元。人数・斬り合い・歩みは変えない。
    const start = Math.min(Math.ceil(at.s), end);
    g.order = 'path'; g.path = [[g.anchor.x, g.anchor.z], [at.x, at.z], ...ROAD.slice(start, end + 1)]; g.pathIdx = 0;
    if (gate && end > 0) {
      // 閉じた扉の真ん中を到着点にすると、通れず門攻めへ切り替わらない。
      const last = ROAD[end], prev = ROAD[end - 1], d = Math.hypot(prev[0] - last[0], prev[1] - last[1]);
      g.path[g.path.length - 1] = [last[0] + (prev[0] - last[0]) / d * 2, last[1] + (prev[1] - last[1]) / d * 2];
    }
    g.arriveCount = 2;
    g._shigaGate = gate; g._shigaGateEnd = end;
    g.formation = 'column'; g.colW = 1; g.roadColumn = true; g.aggro = 2; g.speed = F.step < 3 ? 2.2 : 2.8;
    g.fire = F.step >= 3;
    g.assault = () => g._shigaGate?.alive && !g._shigaGate.opened ? g._shigaGate : null;
    g.onArrive = (q) => {
      if (gate && (!gate.alive || gate.opened)) this.castleAdvance(rt, q, end + 1);
      else {
        q.order = F.step < 3 ? 'hold' : gate ? 'assault' : 'attack';
        // 坂を歩く進み太鼓と、木戸に取りつく突撃太鼓を分ける。各木戸で一度だけ。
        const assaultSignal = () => {
          if (q.order !== 'assault' || rt.over || F.ending || F.aidMoving || gone(q) || q.routed ||
              !gate || !gate.alive || gate.opened || gate._shigaAssaultSignal) return;
          // 町口の退き太鼓・城内の鉦・前の木戸の太鼓が終わるまで待つ。
          const wait = Math.max(20 - (rt.t - (F.castleAssaultSignalT ?? -99)),
            shigaCommandUntil(F) - rt.t, (F.supportVoiceUntil || 0) - rt.t);
          if (wait > 0) { rt.after(wait, assaultSignal); return; }
          gate._shigaAssaultSignal = true; F.castleAssaultSignalT = rt.t;
          shigaSignal(rt, 'kakari', q.center(), 0.75);
          F.castleSoundText = '敵の法螺と突撃太鼓。木戸の内で受けよ'; F.castleSoundUntil = rt.t + 10;
          rt.objProgress('mouth', F.castleSoundText);
          rt.say('武藤五郎右衛門', '敵の法螺と突撃太鼓じゃ！　木戸へ取りつくぞ、内で槍を揃えよ！', 3.5);
          // 突撃の連打が終わってから鬨と札を出し、合図の意味を聞き分けられるようにする。
          const assaultCueUntil = F.castleSoundUntil;
          rt.after(10, () => {
            if (F.castleSoundUntil !== assaultCueUntil || rt.over || F.ending || F.aidMoving || gone(q) || q.routed || q.order !== 'assault' ||
                !gate.alive || gate.opened || rt.t - (F.castleRetreatSignalT ?? -99) < 8) return;
            shigaSignal(rt, 'toki', q.center(), 0.65);
            F.castleSoundText = '木戸際の敵の鬨。内で槍を揃え、寄せ手を押し返せ'; F.castleSoundUntil = rt.t + 8;
            rt.objProgress('mouth', F.castleSoundText);
            rt.say('武藤五郎右衛門', '木戸際で敵の鬨じゃ！　内に踏みとどまれ、槍先を揃えよ！', 3.5);
          });
        };
        if (q.order === 'assault') assaultSignal();
      }
    };
    if (!F.waves.includes(g)) F.waves.push(g);
  },

  // 退く間は開いていた手前の木戸も、閉じればそこから攻める。半秒ごとに呼ぶ。
  tickSiegeGates(rt) {
    const F = rt.flags, at = F.gateRoadProbe || (F.gateRoadProbe = {});
    for (const g of F.waves) {
      if (gone(g) || g.order !== 'path' && g.order !== 'hold' && g.order !== 'assault') continue;
      roadProjection(g.anchor, at);
      const gate = F.gates.find((s) => s.alive && !s.opened && gateRoadIndex(s) >= at.s - .15);
      // 変わった時だけ道を組み直す。行進中の列・死傷者・現在地は引き継ぐ。
      if (gate !== g._shigaGate) this.castleAdvance(rt, g);
    }
  },

  // 端城の火の後も、閉じた木戸の内で後詰を待つ。
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 3.5 || !F.honGuarded) return;
    F.step = 3.5; F.stepT = rt.t;
    rt.setPhase('relief');
    rt.objRemove('gate'); rt.objRemove('honmaru');
    rt.obj('main', '城内を守り、後詰を待て', 'main');
    rt.marker('castleHold', HON_C, '守る本丸', { h: 3 });
    rt.obj('inner', F.backed ? '本丸の木戸の内で守れ' : F.backedNi ? '二の丸を守れ。危うければ本丸へ' : '大手木戸を守れ。破られたら奥へ', 'order');
    // 二十一日の逢坂越えは籠城中に知らせ済み。公記の二十二日の注進へ日を進める。
    // https://ja.wikisource.org/wiki/信長公記#巻三（十）志賀御陣之事
    // 二十三日の摂津撤収も分けて示し、二十四日の後詰を突然出現させない。
    // 日ごとの間隔は遊びのために縮めたもの。守りの時間・寄せ手の数は変えない。
    shigaDay(rt, 22);
    rt.banner('九月二十二日・摂津へ急報', '京へ迫る敵の知らせが、摂津の信長に届く');
    castleProgress(rt, '城内を守り、後詰を待て');
    shigaSupportVoice(rt, '肥田彦左衛門', '城を出るな。後詰の旗が見えるまで、口を固めよ！', 4,
      () => F.step === 3.5 && !F.aidMoving);
    rt.after(20, () => {
      if (F.ending || rt.over || F.step !== 3.5 || F.aidMoving) return;
      shigaDay(rt, 23);
      rt.banner('九月二十三日・信長は摂津を引き払う', '柴田勝家・和田惟政がしんがり。本隊は江口を通り京へ');
      rt.say('', '――信長は野田・福島を引き払い、江口の川を渡って帰京する。宇佐山城はなお後詰を待つ', 5);
    });
  },

  // ② 大軍に押され、宇佐山城へ退く
  fall(rt, rescue = false) {
    const F = rt.flags;
    if (F.step >= 2) return;
    // 包囲や深手で退く下知が出たら、もう選べない相談を閉じる。戦闘中の待ち札も外す。
    // 同じ戦の別の相談には触れず、救出を選んだ時も元の筋へ進める。
    if (F.rescuePick) {
      if (rt.pendingChoice?.onPick === F.rescuePick) rt.pendingChoice = null;
      if (rt.choice?.onPick === F.rescuePick) rt.pickChoice(0);
      F.rescuePick = null;
    }
    F.moriRescue = rescue;
    if (rescue) F.hist.moriRescue = 'GAME_C';
    rt.unmark('mori');
    F.step = 2; F.stepT = rt.t; F.retreating = true;
    rt.setPhase('fall');
    rt.unmark('w1'); rt.unmark('w1b'); rt.unmark('campA'); rt.unmark('campB');
    // 二段の間隔を保ったまま寄せ、町屋を貫通する遠景の行軍にしない。
    for (const h of F.advanceHosts) h.advance(HOST_NEXT_ADVANCE, 50);
    // 朝倉・浅井の本隊が町口へなだれ込み、残った森・信治の本隊と押し合う（城へ退く背で。軽い作り）
    F.bAsa.order({ id: 'move', to: { x: 28, z: 0 } });
    F.bAza.order({ id: 'move', to: { x: -12, z: -8 } });
    F.bMori.order({ id: 'move', to: { x: TOWN.x - 2, z: TOWN.z + 6 } });
    for (const c of F.lines || []) c.rout('A', { from: 0, hideAfter: 1e9, minFight: 0 });
    // 日付の大見出しと守将の討死を先に伝え、寄せ手の動きは短い報せにする。
    rt.bark('山側にも浅井の旗。退き口を保て', true);
    const g = enemyGroup(rt, { faction: 'azai', name: '浅井の手', anchor: { x: -30, z: -30 }, marchTo: { x: TOWN.x - 8, z: TOWN.z }, facing: Math.PI * 0.7, order: 'attack', seekRange: 45, aggro: 14, width: 16, morale: 100, fleeDir: { x: -1, z: -1 } },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 20 }], AZA));
    F.w2 = g;
    // 浅井の手は町口へ進み、残った守将と組を攻める。

    rt.marker('w2', centerOf(g), () => `浅井の手`, { red: true, group: g });
    // 守将が町口から動いていても、退きの合図は残った味方の位置から出す。
    const rearGuard = [F.mori, F.nobuharu, F.guns].find(q => !gone(q) && !q.routed);
    shigaSignal(rt, 'nobiki', rearGuard ? rearGuard.center() : TOWN_POST, 0.95);
    F.retreatSoundUntil = rt.t + 10;
    // 法螺・太鼓・鉦の説明、城の受け入れ、しんがりの下知を順に読む時間。
    // 守将の攻防は進めたまま、途中の「押されとる」だけで説明を遮らせない。
    F.retreatVoiceUntil = rt.t + 12;
    rt.say('森可成', '退きの法螺と太鼓じゃ！　続く鉦に従い、南の坂から城へ退け！', 4);
    battleEvent(rt, EVENT_RETREAT, TOWN, F.mori, 0, true, '町口が崩れた。宇佐山城へ退け');
    rt.objRemove('mouth');
    // 退き太鼓の意味と退く先を読み終えてから、しんがりの声を続ける。
    rt.after(8, () => {
      if (rt.over || F.ending || F.step !== 2) return;
      if (rescue && F.moriU.alive && !gone(F.mori) && !F.mori.routed)
        rt.say('森可成', '退き太鼓に従え！　皆を城へ入れるぞ、追手を払い、坂道を空けよ！', 4);
      else if (F.nobuU.alive && !gone(F.nobuharu))
        rt.say('織田信治', 'わしらがここで支えるぞ。殿の後詰まで城を渡すな！', 3.5);
    });
    rt.obj('main', '退きの法螺・太鼓・鉦。坂道の印をたどり、城の木戸へ退け', 'main');
    F.retreatPath = ROAD.slice(2, ROAD.findIndex(([x, z]) => x === GATE_OUT.x && z === GATE_OUT.z) + 1); F.retreatIdx = 0;
    // 全行程の残りは出発時に一度だけ求める。次の角までの距離と木戸までの距離を分ける。
    F.retreatRemaining = new Array(F.retreatPath.length).fill(0);
    for (let i = F.retreatPath.length - 2; i >= 0; i--) {
      const a = F.retreatPath[i], b = F.retreatPath[i + 1];
      F.retreatRemaining[i] = F.retreatRemaining[i + 1] + Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    F.retreatPoint = { x: F.retreatPath[0][0], z: F.retreatPath[0][1] };
    rt.marker('usa', () => F.retreatPoint, () => F.retreatIdx === 0 ? '坂道の入口' :
      F.retreatIdx < F.retreatPath.length - 3 ? '次の曲がり角へ' : '城の木戸へ', { h: 2, guidePriority: 400 });
    // 退く先は大手木戸の内（城の者が木戸を開けて待つ。入ったら自分で閉める）
    rt.zone('usa', F.gateC.x - F.gateN.x * 5, F.gateC.z - F.gateN.z * 5, 5);
    F.gu.open(F.gateMk);
    // 守将は町口で支える。生き残った鉄砲組は主人公の前を通り、同じ坂を歩いて城へ退く。
    F.guns.fixed = false; F.guns.retreatOnly = true; F.guns.fire = false; F.guns.speed = 2.8;
    keepRoad(F.guns, [[TOWN_POST.x, TOWN_POST.z], ...F.retreatPath, [-10, 58], [-17, 63]], Math.PI);
    F.castleGuards.push(F.guns);
    F.guns.onArrive = (q) => { q.order = 'hold'; q.facing = q._keepFace; q.retreatOnly = false; q.fire = true; };
    F.keep.anchor = { x: F.gateC.x - F.gateN.x * 6, z: F.gateC.z - F.gateN.z * 6 };
    F.keep.order = 'hold'; F.keep.aggro = 6;
    // 史実の討死（kaito 10/2）：大軍が森可成・織田信治の周りを埋め、遠くからも見える形で討たれる
    rt.after(3, () => this.doom(rt, { u: F.nobuU, g: F.nobuharu, key: 'nobu', name: '織田信治', flag: ASA, last: '退く者を通せ！　坂道を塞がせるな！', dur: 13 }));
    rt.after(6, () => this.doom(rt, { u: F.aochiU, g: F.sakai, key: 'aochi', name: '青地茂綱', flag: AZA, last: 'ここはわしが受ける！　城へ急げ！', dur: 14 }));
    if (rescue) {
      // 同じ森隊が坂道を歩く。兵の補充・瞬間移動・無敵の護衛は使わない。
      F.moriU.invuln = false;
      F.castleGuards.push(F.mori);
      const path = [...F.retreatPath, [-10, 58], [-17, 63]];
      F.mori.fixed = false; F.mori.retreatOnly = true; F.mori.speed = 3.2;
      keepRoad(F.mori, path, Math.PI);
      F.mori.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; q.retreatOnly = false; };
      rt.banner('もしもの退き口', '森隊を救い、城の守りへ。史実では森可成は討死');
    } else {
      rt.after(8, () => this.doom(rt, { u: F.moriU, g: F.mori, key: 'mori', name: '森可成', flag: AZA, last: 'わしに構うな！　城へ走れ、木戸を守れ！', dur: 15 }));
      F.mori.order = 'hold'; F.mori.aggro = 16;
    }
    F.nobuharu.order = 'hold'; F.nobuharu.aggro = 16;
    rt.objRemove('path');
    // 城内へ入ってから出発させると長い坂の途中で終戦する。町口が崩れる段で全隊を出す。
    // 先回り・補充はせず、既存の三十八人が同じ大手道を続いて上る。
    for (let i = 0; i < 4; i++) this.siegeMarch(rt, i);
    // 坂道を上る間：町口を抜けた浅井の追手が少し追いすがる（歩くだけの間を作らない）
    rt.after(18, () => {
      if (F.step !== 2) return;
      // 追手は自分の背（町口の側）から出る。行く手の坂道の上には出さない
      F.chase = enemyGroup(rt, { faction: 'azai', name: '追いすがる浅井勢', anchor: { x: 22, z: -36 }, facing: 0, order: 'attack', seekRange: 60, aggro: 12, width: 3, morale: 55, fleeDir: { x: 0, z: -1 }, speed: 2.4 },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 2 }], AZA));
      F.chase.aggro = 2; F.chase.fire = false; F.chase.roadColumn = true; F.chase.formation = 'column'; F.chase.colW = 1;
      F.chase.order = 'path'; F.chase.path = [[F.chase.anchor.x, F.chase.anchor.z], ...ROAD.slice(2, ROAD.findIndex(([x, z]) => x === GATE_OUT.x && z === GATE_OUT.z) + 1)]; F.chase.pathIdx = 0; F.chase.onArrive = (q) => { q.order = 'attack'; };
      rt.marker('chase', centerOf(F.chase), () => `追手`, { red: true, group: F.chase });
      rt.say('足軽', '浅井の追手が坂の下へ来たぞ！　立ち止まるな、木戸へ急げ！', 3);
    });
    rt.after(4, () => { if (F.step === 2) rt.say('武藤五郎右衛門', '木戸は開けてあるぞ！　味方を入れたら閉めよ！', 3.5); });
  },

  // ③ 宇佐山城を守る
  siege(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t; F.retreating = false;
    F.siegeDeadline = rt.t + 300;
    rt.setPhase('siege');
    rt.unmark('usa'); rt.unzone('usa'); rt.unmark('w2'); rt.unmark('chase'); rt.objRemove('path');
    if (F.chase && !gone(F.chase)) this.castleAdvance(rt, F.chase);
    for (const g of F.waves) if (!gone(g)) {
      // 退却中から登っている隊も城攻めの歩みに替える。道と兵の位置は引き継ぐ。
      g.speed = 2.8;
      g.fire = true;
      if (g.order === 'hold' && g._shigaGate) this.castleAdvance(rt, g);
    }
    // 坂本の町口の戦いの終わり（史実：森可成・織田信治は討ち死に）
    rt.say('武藤五郎右衛門', HI(rt) ? `${nm(rt)}、木戸の口を預ける。城兵と内で受けよ！` : '木戸を閉めよ！　肥田殿と城を固めるぞ。本丸を渡すな！', 4);
    // 開いたままの大手木戸は、自分で閉める（閉めなければ、しばらくして城の者が閉める）
    if (F.gateMk.opened && !F.gateMk.breached) {
      F.gateHint = true;
      rt.obj('inner', '大手木戸を閉め、内で槍を揃えよ', 'order');
      rt.after(16, () => {
        if (F.ending || rt.over || !F.gateMk.opened || F.gateMk.breached || !F.gu.close(F.gateMk)) return;
        // 奥へ退いた時には目の前の木戸と取り違えさせない。
        rt.say('武藤五郎右衛門', F.backedNi ? '大手木戸は閉めた！　奥の木戸へ退け！' :
          '大手木戸は閉じたぞ！　内で寄せ手を待ち受けよ！', 2.5);
      });
    }
    rt.obj('main', HI(rt) ? '城兵を率いて木戸を守れ。破られたら奥へ' : '木戸の内を守れ。破られたら奥へ', 'main');
    
    if (!F.gateMk.opened) rt.obj('inner', '木戸の内で受けよ。危うければ奥へ', 'order');
    F.keep.order = 'hold'; F.keep.anchor = { x: F.gateC.x - F.gateN.x * 4, z: F.gateC.z - F.gateN.z * 4 }; F.keep.facing = Math.atan2(F.gateN.x, F.gateN.z); F.keep.aggro = 12;
    rt.marker('gate', F.keep.anchor, '大手木戸の内で守る', { h: 2, hideNear: 5, hideOnArrival: true });

    // 城へ入ったら退却から待ち受けへ。退けの乱打とは違う、止まれの鉦二つで伝える。
    // 入城の下知と先の退き太鼓を読み終えてから鳴らし、奥への退きが始まれば取り下げる。
    const holdSignal = () => {
      if (rt.over || F.ending || !rt.player.u.alive || F.step !== 3 || F.backedNi ||
          gone(F.keep) || F.keep.routed) return;
      const wait = Math.max(shigaCommandUntil(F), F.supportVoiceUntil || 0, F.stepT + 4) - rt.t;
      if (wait > 0) { rt.after(wait, holdSignal); return; }
      shigaSignal(rt, 'tomare', F.keep.center(), 0.85);
      F.castleSoundText = '止まれの鉦二つ。木戸の内で槍を揃え、寄せ手を待て';
      F.castleSoundUntil = rt.t + 8;
      castleProgress(rt, '城兵と槍の列を保て');
      rt.say('武藤五郎右衛門', '鉦二つは止まれの合図じゃ！　木戸の内で槍を揃え、寄せ手を待て！', 4);
    };
    rt.after(4, holdSignal);

    // ---- 守る持ち場の区域：三の丸・二の丸・本丸は初めから味方。本丸の守りを保てば最後の守りへ ----
    F.SZ = makeSiegeZones(rt, {
      zones: [
        { id: 'san', name: '三の丸', start: ZONE_STATE.FRIEND, test: F.C.kuruwa.san.test, pos: F.C.kuruwa.san.centroid, need: 6, hold: 10 },
        { id: 'ni', name: '二の丸', start: ZONE_STATE.FRIEND, test: F.C.kuruwa.ni.test, pos: F.C.kuruwa.ni.centroid, need: 6, hold: 12 },
        { id: 'hon', name: '本丸', start: ZONE_STATE.FRIEND, test: F.C.kuruwa.hon.test, pos: F.C.kuruwa.hon.centroid, need: 6, hold: 14 },
      ],
      friendTeam: 0, enemyTeam: 1,
      unitFilter: (u) => !u.fleeing && !u.woundOut && !u.gone && !u.noTarget,
      noReinforce: () => !F.aidArrived,
      quietRange: [0, 0],
      msg: { zoneFallFriend: (name) => `${name}を取り返した`, zoneFallEnemy: (name) => `${name}へ敵が入った` },
      winWhen: [[(ctx) => ctx.byId.hon.owner === ZONE_STATE.FRIEND && F.honGuarded && F.honHeldT >= HON_HOLD_SECONDS]],
      onWin: () => { if (F.step === 3) this.midB(rt); },
      onFall: (id) => this.onZone(rt, id),
    });
    // ---- 城へ迫る浅井・朝倉の大軍（butai.js・軽い作り）。寄せる道は攻めの頭（siege_ai.js の makeAttackAI）が選ぶ ----
    if (F.bMori && F.bMori.light && F.bMori.light.rout) F.bMori.light.rout({ hideAfter: 1e9 });
    if (F.bNobu && F.bNobu.light && F.bNobu.light.rout) F.bNobu.light.rout({ hideAfter: 1e9 });
    F.clashT = false;
    F.bSiege = [F.bAsa, F.bAza, F.bWing];
    // 軽い大軍は向いた方へしか進めないので、選ばれた道の入口へは「向きに沿って、山を越えない所まで」だけ寄せる
    const proxy = (b) => ({
      id: b.id, real: null,
      order(cmd) {
        if (!cmd.to || !b.light || !b.light.advance) return;
        const p = bPos(b), fx = Math.sin(b.facing), fz = Math.cos(b.facing);
        b.light.advance(Math.max(0, Math.min(60, (cmd.to.x - p.x) * fx + (cmd.to.z - p.z) * fz)));
        b.cmd = { id: 'move', to: cmd.to, target: null, form: 'line' };
      },
    });
    // 実兵が通る大手道だけを使う。通れる道のない尾根へ、旗だけを寄せない。
    F.AA = makeAttackAI(rt, { attackers: F.bSiege.map(proxy), routes: ATTACK_ROUTES.filter(r => r.id === 'ote'), feintChance: 0 });
    // 町口の攻防から歩いてきた寄せ手を引き継ぐ。北へ戻したり、道を初めから歩き直させたりしない。
    rt.after(8, () => {
      if (F.step === 3 && !F.ending && rt.t >= shigaCommandUntil(F))
        rt.say('武藤五郎右衛門', '寄せ手が上ってくるぞ！　木戸の内で待ち受けよ！', 3);
    });
    const burn = () => {
      // 『信長公記』巻三：十九日の端城放火、二十日の大津進出の順。
      // 放火は端城の別働の描写。操作する木戸の寄せ手の到着を待つと、
      // 二十日の札で打ち切られ、公記にある十九日の放火が消えてしまう。
      if (F.ending || F.step !== 3 || F.otsuAdvance) return;
      // 公記は端城の放火を記すが、燃えた建物までは特定しない。
      // 推定復元の北の物見と三の丸番所へ既存の二火を合わせる。
      // 空いた地面を燃やさず、大手道・木戸の通り道からも離す。
      const watch = USA_PLAN.yagura.find(y => y.id === 'monomi_arc');
      const hut = HOUSES.find(h => h.name === '三の丸の番所');
      const fire = { x: watch.at[0], z: watch.at[1] };
      F.shigaFires = [
        rt.world.addFire(fire.x, fire.z, { size: 3, h: 3, blackSmoke: true }),
        rt.world.addFire(hut.x, hut.z, { size: 2.4, h: 2.5, blackSmoke: true }),
      ];
      battleEvent(rt, EVENT_FIRE_START, fire, null, 1, true, '端城に火の手。奥の木戸を守れ');
      F.outerFire = true;
      // 火とその合成音はすぐ始める。台詞は太鼓・鬨・退きの鉦を読み終えてから。
      // 待つ間も火の危険は castleProgress が札へ渡し、退く先の案内を保つ。
      const fireReport = () => {
        if (rt.over || F.ending || (F.step !== 3 && F.step !== 3.5)) return;
        const wait = Math.max(shigaCommandUntil(F) - rt.t, (F.supportVoiceUntil || 0) - rt.t);
        if (wait > 0) { rt.after(wait, fireReport); return; }
        // 続く寄せ手や後詰の合図にも、この下知を読む間を空ける。
        F.castleSoundText = '端城に火の手。火を避け、持ち場の木戸を守れ';
        F.castleSoundUntil = rt.t + 8;
        castleProgress(rt, '寄せ手を中へ入れるな');
        rt.banner('九月十九日・端城に火の手', '端城は燃えても、本丸は渡すな');
        rt.say('肥田彦左衛門', '端城に火を掛けられたぞ！　火を避けよ、寄せ手を中へ入れるな！', 4);
      };
      fireReport();
    };
    rt.after(18, burn);
    // 公記の二十日の大津方面への進出。十九日の端城攻めと日を分けて示す。
    rt.after(34, () => {
      if (F.ending || F.step !== 3 || F.battleDay > 20) return;
      shigaDay(rt, 20);
      F.otsuAdvance = true;
      // 『兼見卿記』九月二十日条は坂本の放火も伝える。『信長公記』の端城の火と分ける。
      // https://ukikimaru.ran-maru.net/ran/yosinarihyper.htm （史料の引用）
      // 城内へ退いた後に、避難路と街道から離れた既存の町屋二軒だけで示す。
      // 炎は共通の形・材質を使う。燃える家の位置と着火時刻は推定復元。
      F.shigaFires.push(
        rt.world.addFire(48, -14, { size: 2.4, h: 3, blackSmoke: true }),
        rt.world.addFire(34, -24, { size: 2.4, h: 3, blackSmoke: true }),
      );
      // 公記の大津・馬場・松本への進出を、城外の戦況として伝える。
      // 三つの在所を縮小した坂本の町へ重ねて置かず、守りの場面を保つ。
      rt.banner('九月二十日・大津・馬場・松本に放火', '坂本の町にも火の手。城を守り、街道の敵を追うな');
      // 公記の南への進出と後詰の北上を、同じ街道の印で示す。
      // 在所そのものは画面外。印は復元した道の上に置き、町の位置と取り違えさせない。
      // https://ja.wikisource.org/wiki/信長公記#巻三（十）志賀御陣之事
      rt.marker('lakeRoute', AID_START, '南へ続く道・大津方面（道筋は推定）', { h: 3 });
      const bg = enemyGroup(rt, { faction: 'asakura', name: '街道を南へ抜ける朝倉の手', anchor: { x: BYPASS_WAIT[0], z: BYPASS_WAIT[1] }, facing: 0, order: 'path', aggro: 4, width: 10, morale: 80, speed: 2.4, fleeDir: { x: 0, z: -1 } },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 3 }], ASA));
      F.bypass = bg; F.bypassInitial = bg.count;
      // 宇佐山の東を抜ける湖西の道。南の山腹へ直進せず、町の外で湖岸寄りへ折れる。
      // 道筋は推定復元。二列で分岐を曲がり、後詰と同じ東西位置の道を南へ進む。
      // 北の街道上の控えから分岐へ進み、城の横で止まらず南端まで抜ける。
      // 大津などの在所は画面外。到達地点と行軍時間は縮小した推定復元。
      // 同じ兵を歩かせ、城攻めの兵や乱戦の人数は減らさない。
      bg.path = BYPASS_ROAD.slice(); bg.pathIdx = 0;
      bg.formation = 'column'; bg.colW = 2;
      rt.marker('bypass', centerOf(bg), () => `街道を抜ける朝倉の手`, { red: true, group: bg });
      if (sightPoint(rt, bg.anchor, 120)) rt.say('武藤五郎右衛門', '敵の一手が大津へ向かうぞ。釣られるな、城を守れ！', 4.5);

    });
    // 公記の二十一日の逢坂越え。遠い戦況は知らせで示し、城攻めの兵を抜かない。
    rt.after(68, () => {
      if (F.ending || rt.over || (F.step !== 3 && F.step !== 3.5) || !F.otsuAdvance || F.battleDay > 21) return;
      shigaDay(rt, 21);
      rt.banner('九月二十一日・敵は逢坂を越える', '醍醐・山科に放火。京へ迫っている');
      rt.marker('lakeRoute', AID_START, '南へ続く道・逢坂方面（道筋は推定）', { h: 3 });
      rt.say('使番', '大津へ出た敵が逢坂を越え、醍醐・山科に火を掛けた。城の守りを続けよ！', 4.5);
    });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; F.victory = true; F.victoryVoiceUntil = rt.t + 4;
    rt.setPhase('end');
    // 後詰は下坂本へ到着済み。城へ入れず、その日の陣所で既存の兵列を止める。
    // 終幕で再び六十秒の移動を始めると、十八秒後の終了まで陣所に届かない。
    rt.unmark('castleHold'); rt.unmark('ni'); rt.unmark('hon');
    rt.unmark('gate'); for (let i = 0; i < 4; i++) rt.unmark('x' + i);
    // 公記の三つの移陣先を、既存の退く道と同じ位置の印で知らせる。
    // 三山の所在地を示す印ではなく、推定した登り口。終幕に一度だけ作る。
    for (let i = 0; i < HIEI_EXITS.length; i++) {
      const to = HIEI_EXITS[i];
      rt.marker('hieiExit' + i, to, `${to.name}へ・登り口は推定`, { red: true, h: 3 });
    }
    // 北への引き返しではなく、坂本の西へ分かれて退く。人数と兵列は保つ。
    for (let i = 0; i < F.host.length; i++) {
      moveHostToHiei(rt, F.host[i], i);
    }
    // 公記の叡山への移陣に合わせ、坂本の据え幟も撤収。撤収までの秒数は演出上の復元。
    // 軍勢の携える旗と城の幟は残す。束の取り外しだけで材質・形を作り直さない。
    rt.after(8, () => {
      for (const mesh of F.enemyFlagBatches || []) mesh.removeFromParent();
    });
    let exitIndex = 0;
    for (const q of F.backs || []) if (!q.gone) {
      q.gone = true;
      moveHostToHiei(rt, q.b, exitIndex++);
    }
    for (const c of F.lines || []) c.rout('B', { hideAfter: 1e9 });
    for (const id of ['campA', 'campB', 'bypass', 'w1', 'w1b', 'w2', 'chase']) rt.unmark(id);
    // 攻城の三つの備えも、西の別々の登り口へ退く。
    // 通常の撤退速度では十八秒の終幕まで町口に残る。後方の本隊と同じ十六秒で移陣を示す。
    // 勝ちが決まった後の軽い兵列だけを動かし、戦闘中の兵数・歩みは保つ。
    for (let i = 0; i < (F.bSiege || []).length; i++) {
      const b = F.bSiege[i], to = HIEI_EXITS[i % HIEI_EXITS.length];
      b.order({ id: 'retreat', to });
      if (b.light) moveHostToHiei(rt, b.light, i);
    }
    // 公記の二十四日は坂本の敵が叡山へ上がる。木戸の寄せ手にも退く下知を出す。
    // 町の北縁から西の登り口へ回る道筋は推定。勝ちが決まった後だけ下知する。
    const toHiei = (g) => {
      const path = HIEI_PATHS[exitIndex++ % HIEI_PATHS.length];
      g.roadColumn = false; g.colW = 2;
      if (g === F.bypass && !F.bypassTurn) {
        // 大津へ向かった一手は湖岸道を引き返してから西へ上がる。
        // 北縁へ直進させると、分岐を外して刈田を横切ってしまう。
        // 現在地に近い道の途中から戻し、南の終点へ歩き直させない。
        let best = Infinity, segment = 0, px = 0, pz = 0;
        for (let i = 0; i < BYPASS_ROAD.length - 1; i++) {
          const a = BYPASS_ROAD[i], b = BYPASS_ROAD[i + 1];
          const dx = b[0] - a[0], dz = b[1] - a[1];
          const t = Math.max(0, Math.min(1, ((g.anchor.x - a[0]) * dx + (g.anchor.z - a[1]) * dz) / (dx * dx + dz * dz)));
          const x = a[0] + dx * t, z = a[1] + dz * t;
          const d = Math.hypot(g.anchor.x - x, g.anchor.z - z);
          if (d < best) { best = d; segment = i; px = x; pz = z; }
        }
        g.path = [[px, pz], ...BYPASS_ROAD.slice(0, segment + 1).reverse(),
          [BYPASS_WAIT[0], path[0][1]], ...path];
      } else {
        g.path = [[g.anchor.x, path[0][1]], ...path];
      }
      g.pathIdx = 0;
      g.onArrive = (q) => { q.order = 'hold'; q.aggro = 0; };
    };
    for (const g of rt.army.groups) {
      if (g.team !== 1 || g.civ || !g.count || g.routed) continue;
      g.stay = false; g.focus = null; g.onArrive = null; g.assault = null;
      g.order = 'path'; g.formation = 'column'; g.aggro = 2;
      g.fire = false; g.holdFire = true; g.retreatOnly = true;
      g._shigaGate = null; g.speed = 2.8;
      if (g.roadColumn) {
        // 切岸を西へ直進させない。後列も坂を下り切るまで既存の道案内を使う。
        const at = {}; roadProjection(g.anchor, at);
        g.path = [[g.anchor.x, g.anchor.z], [at.x, at.z], ...ROAD.slice(1, Math.max(2, Math.ceil(at.s))).reverse()];
        g.pathIdx = 0; g.colW = 1; g.arriveCount = g.count;
        g.onArrive = toHiei;
      } else {
        toHiei(g);
      }
    }
    // 公記の二十四日の陣所は下坂本。到着した兵列と知らせの位置を同じ着点にそろえる。
    // 逢坂越えは出発時に知らせ済み。城の南を再び示さず、着陣を伝える。
    battleEvent(rt, EVENT_REINFORCEMENT, AID_CAMP, null, 0, true, '九月二十四日、後詰が下坂本に着陣した');
    rt.marker('lakeRoute', AID_CAMP, '下坂本・信長の陣（位置は推定）', { h: 3 });
    rt.obj('main', '集まれの法螺。城内を保ち、敵を追うな', 'main');
    rt.objDone('main'); rt.objRemove('inner'); rt.objRemove('mouth');
    // 守り通した下知を読み終え、後詰の太鼓や城内の鉦も収まってから敵の退きを知らせる。
    // 後詰の合図が先の下知を待っていても、勝利で取り消さない。
    // 未発なら法螺・太鼓と鬨の各八秒、法螺が済んでいれば鬨の八秒を確保する。
    const aidCueTime = F.aidMoving && !F.aidCallDone ? (F.aidCallStarted ? 8 : 16) : 0;
    const endCueDelay = Math.max(4, shigaCommandUntil(F) - rt.t,
      (F.supportVoiceUntil || 0) - rt.t) + aidCueTime;
    // 完了した任務は進み具合を表示しないため、終幕の合図は下知の札で伝える。
    rt.obj('inner', '城内を保ち、敵を追うな', 'order', true);
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '宇佐山城を守り通した', pts: 20 }; }, '宇佐山城を守り通した');
    // 敵の退きと味方の集合を、出どころと間を分けて知らせる。
    rt.banner('九月二十四日・宇佐山城、守り通す', F.moriSaved ? 'もしもの筋。森隊を救い、後詰まで城を保った' : '摂津から戻った信長の前に、浅井・朝倉は比叡山へ上がった');
    rt.say('武藤五郎右衛門', '後詰が下坂本に着いたぞ！　城は守った、追わず、城内を保て！', 3.5);
    // 勝ちの終幕中は over が立つ。討死や結果画面への移行だけで、残りの合図を止める。
    const endCueActive = () => !rt.ended && rt.player.u.alive && !rt.result?.down;
    rt.after(endCueDelay, () => {
      if (!endCueActive()) return;
      const retreating = (F.waves || []).find(g => !gone(g));
      // 敵軍が引き揚げる長い合図。味方が城内で持ち場を退く短い鉦と聞き分ける。
      shigaSignal(rt, 'nobiki', retreating ? retreating.center() : F.campA.pos, 0.85);
      rt.obj('inner', '敵の退きの法螺・太鼓・鉦。城内を保ち、敵を追うな', 'order', true);
      rt.say('武藤五郎右衛門', '敵の退きの法螺と太鼓じゃ！　続く鉦も敵の合図ぞ。追わず、城内を保て！', 4);
    });
    // 退き太鼓と最後の鉦の余韻まで約十秒。鳴り終えてから味方の集合を伝える。
    rt.after(endCueDelay + 10, () => {
      if (!endCueActive()) return;
      shigaSignal(rt, 'atsumare', F.keep.center(), 0.8);
      rt.obj('inner', '集まれの法螺。城内で槍を揃え、敵を追うな', 'order', true);
      rt.say('武藤五郎右衛門', '集まれの法螺じゃ！　木戸の内で槍を揃えよ！', 3.5);
    });
    // 集合の法螺は三秒後にもう一声。二声目と余韻を待ち、合図の札を守りの下知へ戻す。
    rt.after(endCueDelay + 18, () => {
      if (!endCueActive()) return;
      rt.obj('inner', '城内で槍を揃え、敵を追うな', 'order', true);
      rt.say('', F.moriSaved ? '――森隊を救ったのは、もしもの筋。史実では森可成らの命と引き換えに、城は残った' : '――森可成らの命と引き換えに、城は残った。浅井・朝倉との対陣は、十二月の和議まで続いた', 5);
    });
    rt.after(endCueDelay + 24, () => {
      if (endCueActive()) rt.say('', '――翌二十五日、信長は比叡山の麓を囲み、宇佐山城に陣を置く。山へ移った敵との対陣は続く', 5);
    });
    // 志賀の終幕を保つ。共通の追撃へ移ると結びの台詞が消え、退く下知が再び出る。
    rt.finish({ scriptedEnd: true }, endCueDelay + 30);
  },
  lose(rt, sub, scriptedEnd = false) {
    if (!scriptedEnd && !rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end'); rt.objFail('main'); rt.objRemove('inner'); rt.tracker.main = false;
    for (const id of ['mouth', 'path', 'gate', 'honmaru']) rt.objRemove(id);
    for (const id of ['usa', 'gate', 'castleHold', 'ni', 'hon']) rt.unmark(id);
    rt.unzone('usa');
    rt.banner('持ち場を守り切れず', sub);
    // 城内の退きと同じ鉦。続けて崩れた場合は、鳴っている合図を引き継ぐ。
    if (rt.t - (F.castleRetreatSignalT ?? -99) >= 8) shigaSignal(rt, 'hike', F.keep.center(), 0.85);
    rt.obj('inner', '退きの鉦。裏の口から退け', 'order', true);
    rt.say('武藤五郎右衛門', '退きの鉦じゃ！　この組はもう持たぬ。裏の口から退け！', 4);
    // 評定にも退く下知の未達を残す。生きて城へ届かなかった理由を曖昧にしない。
    rt.finish({ scriptedEnd, failureReason: sub }, 9);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 任務に隠れて読まれなかった町口の声を、登城後まで持ち越さない。会話の記録は残す。
    const hud = rt.hud;
    for (let i = hud.subQ.length - 1; i >= 0; i--)
      if (oldTownSpeech(F.step, hud.subQ[i])) hud.subQ.splice(i, 1);
    if (hud.shownLine && oldTownSpeech(F.step, hud.shownLine)) {
      hud.nextSub(); hud.subT = 0; hud.shownLine = null; hud.shownGoalKey = null;
      document.getElementById('subtitle').textContent = '';
    }
    const player = rt.player, u = player.u;
    const evacuating = this.botEvacuating(rt);
    if (F.coachEvacuating !== evacuating) {
      F.coachEvacuating = evacuating;
      rt.hud.drawCard();
    }
    if (!rt.over && u.hp <= 0) {
      if (u.alive) rt.playerDown();
      else rt.finish({ down: true }, 5);
      return;
    }
    butaiTick(rt, dt);
    for (const q of F.backs || []) if (!q.gone && (q.g.routed || !q.g.count)) { q.gone = true; q.b.rout({ hideAfter: 1e9 }); }
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.roadGuide) F.roadGuide.visible = !F.ending && rt.player.u.alive && F.step === 2;
    if (F.ending || !rt.player.u.alive) return;
    this.retreatSafety(rt, dt);
    if (rt.over || F.ending) return;
    if (F.moriRescue && (!F.moriU.alive || F.mori.routed)) {
      this.lose(rt, '森隊が崩れ、可成を城へ迎えられず', true); return;
    }
    updateGates();
    if (F.gu) F.gu.tick();
    F.campT = (F.campT || 0) - dt;
    if (F.campT <= 0) {
      F.campT = 0.5; this.tickCamps(rt);
      friendlyGunCue(rt);
      enemyGunCue(rt);
      // 槍が届く前の寄せを半秒ごとに拾う。木戸越しの敵は数えない。
      F.nearFoes = 0;
      if (F.step === 1 || F.step === 1.5 || F.step === 3 || F.step === 3.5) {
        const post = F.step === 1 ? TOWN_POST : u.pos;
        for (const foe of rt.army.units) {
          if (!foe.alive || foe.team !== 1 || foe.isStruct || foe.fleeing || foe.woundOut || foe.gone || foe.noTarget) continue;
          if (F.step === 1 && foe.group !== F.w1 && foe.group !== F.w1b) continue;
          if (Math.hypot(foe.pos.x - post.x, foe.pos.z - post.z) >= 14 || rt.army.wallBetween(post, u.team, foe.pos, false)) continue;
          if (F.step === 1 && F.townContactT == null) F.townContactT = rt.t;
          if (++F.nearFoes >= 3) break;
        }
      }
      this.tickSiegeGates(rt);
    }
    this.tickShut(rt, dt);
    if (F.gateHint && F.gateMk.opened === false && !F.gateHintDone) {
      F.gateHintDone = true;
      if (!F.backedNi) rt.obj('inner', '木戸の内で受けよ。危うければ奥へ', 'order');
    }
    if (F.bypass && !F.bypassTurn && !gone(F.bypass) && (F.bypass.count < F.bypassInitial || F.bypass.morale < 55)) {
      F.bypassTurn = true; this.castleAdvance(rt, F.bypass);
    }
    if (F.SZ && (F.step === 3 || F.step === 3.5)) {
      let guards = 0, intruders = 0;
      for (const u of rt.army.units) if (siegeFighter(u) && F.C.kuruwa.hon.test(u.pos.x, u.pos.z)) {
        if (u.team === 0) guards++;
        else if (u.team === 1) intruders++;
      }
      F.honGuards = guards; F.honIntruders = intruders;
      F.honGuarded = guards >= 3 && guards > intruders;
      F.SZ.tick(dt);
      // 少数の侵入だけで守った時間を消さない。互角なら止め、守りが崩れたら数え直す。
      const hon = F.SZ.byId.hon;
      F.honHeldT = hon.owner !== ZONE_STATE.FRIEND || guards < 3 ? 0 :
        (F.honHeldT || 0) + (F.honGuarded ? dt : 0);
      hon.friendHeldT = F.honHeldT;
    }
    if (F.step === 3 || F.step === 3.5) {
      const hon = F.SZ.byId.hon;
      F.honLostT = hon.owner === ZONE_STATE.ENEMY ? (F.honLostT || 0) + dt : 0;
      if (F.honLostT >= 45) { this.lose(rt, '本丸の持ち場を取り返せなかった'); return; }
    }
    F.lightT = (F.lightT || 0) + dt;
    if (F.lightT >= 0.5) { this.tickLight(rt, F.lightT); F.lightT = 0; }
    // 合成の法螺・太鼓・鬨と、その意味を伝える台詞を負傷の助言で遮らない。
    // 助言を済ませた印は表示時だけ付け、合図が収まった後へ持ち越す。
    const commandUntil = Math.max(shigaCommandUntil(F), F.supportVoiceUntil || 0);
    if (!F.hurtHint && rt.t >= commandUntil && rt.player.u.hp < rt.player.u.maxHp * 0.75) {
      F.hurtHint = true;
      // 銃声の説明や寄せ手の合図も、この助言を読む五秒を待つ。
      F.supportVoiceUntil = rt.t + 5;
      const ranged = player.lastHit?.ranged && rt.t - player.lastHit.t < 6;
      const guard = isTouch ? '「構える」を押し続けよ' : '右押しを押し続けよ';
      const retreat = F.step >= 3 ? '木戸の内へ下がれ' : '味方の槍の後ろへ下がれ';
      rt.say('足軽', F.step === 2 ? '傷を受けたぞ。退きの下知に従い、坂道の印から城へ進め！' :
        ranged ? F.step >= 3 ? '矢玉は構えでは防げぬ。木戸の内の塀の陰へ退け' :
          '矢玉は構えでは防げぬ。塀や屋敷の陰へ退け' : `敵を向いて${guard}。${retreat}`, 5);
    }
    const p = rt.player.u.pos;
    if (F.step === 1) {
      // 合図は八秒保ち、鳴り終えたら両方の札を持ち場の案内へ戻す。
      const text = rt.t < F.townSoundUntil ? F.townSoundText : '槍の列を離れず、先手を受けよ';
      rt.objProgress('main', text); rt.objProgress('mouth', text);
      if (F.w1 && F.w1.count < 5 && !gone(F.w1)) F.w1.morale = Math.min(F.w1.morale, 20);
      if (F.w1b && F.w1b.count < 5 && !gone(F.w1b)) F.w1b.morale = Math.min(F.w1b.morale, 20);
      // 先手が列へ届く前に三日後へ飛ばさない。接触後も受け合う間を残す。
      // 寄せが詰まった場合は九十五秒で次へ進め、戦の終わりを待ち続けない。
      if ((F.w1b && gone(F.w1) && gone(F.w1b)) ||
          rt.t - F.stepT > 55 && F.townContactT != null && rt.t - F.townContactT >= 12 ||
          rt.t - F.stepT > 95) this.midA(rt);
    }
    if (F.step === 1.5) {
      const text = rt.t < F.townSoundUntil ? F.townSoundText : '町口を守れ。味方の退き口を保て';
      rt.objProgress('main', text); rt.objProgress('mouth', text);
      if (!F.rescueAsked && rt.t - F.stepT >= 12 && u.hp >= u.maxHp * 0.7 && F.nearFoes < 3 && F.moriU.alive && !F.moriU.woundOut &&
          F.mori.count >= Math.ceil(F.mori.initial * 0.5) && Math.hypot(p.x - F.moriU.pos.x, p.z - F.moriU.pos.z) < 18) {
        F.rescueAsked = true;
        F.rescuePick = (i) => {
          F.rescuePick = null;
          if (i !== 1 || F.step !== 1.5 || F.ending) return;
          if (!F.moriU.alive || F.moriU.woundOut || F.mori.count < Math.ceil(F.mori.initial * 0.5)) {
            rt.bark('森隊はもう退けぬ。町口を守り、城への下知を待て', true); return;
          }
          this.fall(rt, true);
        };
        rt.choose('森隊が退く道は、まだ空いている', [
          { label: '町口で受け続ける', note: '史実の筋。可成らの討死後、城を守る' },
          { label: '森隊を救い、城へ退く', note: 'もしもの筋。可成と隊の三分の一以上を救う' },
        ], F.rescuePick, 20);
      }
      // 深手や包囲を待たず退き口を開く。守将の討死と城の守りは元の筋へつなぐ。
      if (rt.t - F.stepT >= 35 || rt.t - F.stepT >= 12 && (u.hp < u.maxHp * 0.7 || F.nearFoes >= 3)) this.fall(rt);
    }
    if (F.step === 3.5) {
      const hon = F.SZ.byId.hon;
      const inCastle = F.C.kuruwa.san.test(p.x, p.z) || F.C.kuruwa.ni.test(p.x, p.z) || F.C.kuruwa.hon.test(p.x, p.z);
      castleProgress(rt, hon.owner === ZONE_STATE.ENEMY ? `本丸を取り返せ。猶予はあと${Math.max(0, Math.ceil(45 - (F.honLostT || 0)))}秒` : !inCastle ? '城の木戸の内へ戻れ' : !F.honGuarded ? F.honGuards < 3 ? '本丸に味方を三人以上集めよ' : '本丸の敵を押し返せ。味方の列で受けよ' : F.aidMoving ? `後詰の到着まであと${Math.max(0, Math.ceil(20 - (rt.t - F.aidT)))}秒` : `後詰の出発まであと${Math.max(0, Math.ceil(AID_WAIT_SECONDS - (rt.t - F.stepT)))}秒`);
      // 最後の出発待ちを十五秒縮める。後詰が移動する二十秒は保つ。
      if (rt.t - F.stepT >= AID_WAIT_SECONDS && !F.aidMoving) {
        shigaDay(rt, 24);
        F.aidMoving = true; F.aidT = rt.t; F.aid.visible = true;
        rt.banner('九月二十四日・南に後詰の旗', '京の本能寺を発った信長が逢坂を越えた。木戸を守れ');
        rt.marker('lakeRoute', AID_START, '逢坂方面から後詰が北上（道筋は推定）', { h: 3 });
        // 公記の二十四日の陣所まで同じ湖岸道を北上する。移動時間は遊びのための短縮。
        // 六十五メートルだけの前進では城の南で止まり、「到着」の札と兵列の位置が食い違う。
        // 守りの二十秒・兵数は保ち、終幕へ入る前に下坂本へ着ける。
        F.aid.moveTo(AID_CAMP.x, AID_CAMP.z, 20);
        // 寄せ手の合図が鳴り終わってから後詰が応える。進軍と勝ちの条件は待たせない。
        // 勝利の終幕には引き継ぐ。敗北・討死・結果画面では取り下げる。
        const aidCueActive = () => !rt.ended && rt.player.u.alive && !rt.result?.down &&
          (F.victory || !rt.over && !F.ending && F.step === 3.5);
        const aidCueWait = () => Math.max(shigaCommandUntil(F), F.supportVoiceUntil || 0,
          F.victoryVoiceUntil || 0) - rt.t;
        const aidCueCard = () => {
          if (F.victory) rt.obj('inner', F.castleSoundText, 'order', true);
          else castleProgress(rt, '後詰が近づいている。木戸の守りを続けよ');
        };
        const aidSignal = () => {
          if (!aidCueActive()) return;
          const wait = aidCueWait();
          if (wait > 0) { rt.after(wait, aidSignal); return; }
          const aid = F.aid.army;
          shigaSignal(rt, 'susume', { x: aid.cx + aid.off.x, z: aid.cz + aid.off.z }, 0.85);
          F.aidCallStarted = true;
          F.castleSoundText = '南の後詰の法螺と進み太鼓。城を出るな'; F.castleSoundUntil = rt.t + 8;
          rt.objRemove('mouth');
          aidCueCard();
          rt.say('肥田彦左衛門', '南から法螺と進み太鼓じゃ！　味方の後詰ぞ、城を出ず、木戸を守れ！', 4);
          // 進み太鼓の余韻と札の八秒を待ち、今いる後詰の位置から合成の鬨を返す。
          // 城内の退きが挟まった時も、その鉦を読み終えてから応える。
          const aidToki = () => {
            if (!aidCueActive() || !F.aid.visible) return;
            const wait = aidCueWait();
            if (wait > 0) { rt.after(wait, aidToki); return; }
            const arriving = F.aid.army;
            shigaSignal(rt, 'eiei', { x: arriving.cx + arriving.off.x, z: arriving.cz + arriving.off.z }, 0.65);
            F.aidCallDone = true;
            F.castleSoundText = '南の味方の鬨。後詰が近づく、木戸の内を守れ'; F.castleSoundUntil = rt.t + 8;
            aidCueCard();
            rt.say('肥田彦左衛門', '南の鬨は味方じゃ！　後詰が来るぞ、木戸の内で持ちこたえよ！', 3.5);
          };
          rt.after(8, aidToki);
        };
        aidSignal();
      }
      if (F.aidMoving && rt.t - F.aidT >= 20 && hon.owner === ZONE_STATE.FRIEND && F.honGuarded && inCastle) { F.aidArrived = true; this.win(rt); }
    }
    if (F.step === 2) {
      const way = F.retreatPath[F.retreatIdx];
      // 九十九折りの角を四歩手前で飛ばすと、細い道から切岸へ踏み出してしまう。
      // 平らな入口だけは、押し合う兵の肩をよけて通れる幅で拾う。
      // 坂の折り返しは一点へ寄せ、隣の段へ飛ばさない。
      if (way && (Math.hypot(p.x - way[0], p.z - way[1]) < (F.retreatIdx === 0 ? 3.6 : 1.8) ||
          F.retreatIdx === 0 && passedShigaEntry(p, F.retreatPath))) F.retreatIdx++;
      const next = F.retreatPath[F.retreatIdx];
      F.retreatPoint.x = next ? next[0] : F.gateC.x - F.gateN.x * 5;
      F.retreatPoint.z = next ? next[1] : F.gateC.z - F.gateN.z * 5;
      const d = Math.hypot(p.x - (F.gateC.x - F.gateN.x * 5), p.z - (F.gateC.z - F.gateN.z * 5));
      const remaining = next ? Math.ceil((Math.hypot(p.x - next[0], p.z - next[1]) + F.retreatRemaining[F.retreatIdx]) / 10) * 10 : 0;
      let retreatText = (d < 6 || F.C.kuruwa.san.test(p.x, p.z)) ? '木戸の内を守り、退く味方を待て' : F.retreatIdx === 0 ? '坂道の入口へ退け' : F.retreatIdx < F.retreatPath.length - 3 ? `道沿いに木戸まであと約${remaining}メートル。角で折り返せ` : '開いた木戸から城へ入れ';
      // 道の進みに合わせて一度だけ知らせる。歩く間に同じ下知を繰り返さない。
      if (!F.climbHalf && F.retreatIdx >= 6) { F.climbHalf = true; rt.bark('坂道の半ばまで来た。道の外は急な崖だ'); }
      if (!F.climbTop && F.retreatIdx >= 12) { F.climbTop = true; rt.bark('城の木戸が近い。開いた口から中へ入れ'); }
      const inSan = F.C && F.C.kuruwa.san.test(p.x, p.z);
      let saved = 0;
      if (F.moriRescue) for (const u of F.mori.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && F.C.kuruwa.san.test(u.pos.x, u.pos.z)) saved++;
      const moriReady = F.moriRescue ? F.moriU.alive && !F.moriU.woundOut &&
        F.C.kuruwa.san.test(F.moriU.pos.x, F.moriU.pos.z) && saved >= Math.ceil(F.mori.initial / 3) : F.moriDead;
      if (F.moriRescue && (d < 6 || inSan)) retreatText = `城へ入った森隊 ${saved}／${Math.ceil(F.mori.initial / 3)}人以上。外の味方を守れ`;
      // 間に合わなかった理由が、失敗するまで分からない待ち札にしない。
      const left = Math.max(0, Math.ceil(RETREAT_TIME + 30 - (rt.t - F.stepT)));
      if (left <= 60) {
        const task = F.moriRescue && (d < 6 || inSan) ? `森隊 ${saved}／${Math.ceil(F.mori.initial / 3)}人。外の味方を守れ` :
          d < 6 || inSan ? '木戸の内で退く味方を守れ' : '道の印をたどり、木戸の内へ急げ';
        retreatText = `${task}。退く猶予あと${left}秒`;
        if (!F.retreatWarned) {
          F.retreatWarned = true;
          rt.say('武藤五郎右衛門', d < 6 || inSan ? '追手が迫るぞ！　木戸の内で退く味方を守れ！' : '追手が迫るぞ！　坂道をたどり、木戸の内へ急げ！', 3);
        }
      }
      // 道案内を更新しても、法螺・退き太鼓・鉦の最後の響きまで札に残す。
      rt.objProgress('main', rt.t < F.retreatSoundUntil ? `退きの法螺・太鼓・鉦。${retreatText}` :
        rt.t < (F.retreatGunUntil || 0) ? `${F.retreatGunText}。${retreatText}` : retreatText);
      if ((d < 6 || inSan) && moriReady && F.nobuDead && F.aochiDead) {
        F.moriSaved = F.moriRescue;
        if (F.moriSaved) rt.award((t) => t.side.push('もしもの筋・森隊を救い、城へ退いた'), '森隊と宇佐山城へ退いた');
        this.siege(rt);
      } else if (F.moriRescue && rt.t - F.stepT > RETREAT_TIME + 30) {
        this.lose(rt, '森隊を城へ集められず、退く道を守れなかった', true); return;
      } else if (rt.t - F.stepT > RETREAT_TIME + 30 && !F.retreatLateSaid) {
        // 長いつづら折りを歩いて退く人を、時間だけで負けにしない（携帯の bot が半分ほどここで負けていた）。追手の声で急がせる。
        F.retreatLateSaid = true;
        rt.say('武藤五郎右衛門', '追手が坂道に取り付いたぞ！　足を止めるな、木戸の内へ！', 3);
      }
    }
    if (F.step === 3) {
      // 本丸の守りが敵より多い間だけ進む。本丸を取られたら数え直す。
      const hon = F.SZ && F.SZ.byId.hon;
      const honLost = hon && hon.owner !== ZONE_STATE.FRIEND;
      castleProgress(rt, honLost ? `本丸を取り返せ。あと${Math.max(0, Math.ceil(45 - (F.honLostT || 0)))}秒` : !F.honGuarded ? F.honGuards < 3 ? `本丸の味方${F.honGuards}／3人。列へ戻れ。時間は数え直し` : `本丸の味方${F.honGuards}人・敵${F.honIntruders}人。敵を押し返せ。時間は止まる` : `後詰の知らせまであと${Math.max(0, Math.ceil(HON_HOLD_SECONDS - (hon?.friendHeldT || 0)))}秒`);
      if (hon && F.honGuarded && hon.owner === ZONE_STATE.FRIEND && hon.friendHeldT >= HON_HOLD_SECONDS) this.midB(rt);
    }
    // 門が半分傷むか敵が迫った時に退き口を示す。体力を削り切られる前に奥へ通す。
    if ((F.step === 3 || F.step === 3.5) && !F.backedNi && (!F.gate.alive || F.gate.hp < F.gate.maxHp * 0.6 || u.hp < u.maxHp * 0.7 || F.nearFoes >= 3)) this.toNinomaru(rt);
    if ((F.step === 3 || F.step === 3.5) && !F.backed && (!F.kidoNi.struct.alive || F.kidoNi.struct.hp < F.kidoNi.struct.maxHp * 0.6 || u.hp < u.maxHp * 0.5 || F.nearFoes >= 3 && F.C.kuruwa.ni.test(p.x, p.z))) this.toHonmaru(rt);
    if (F.backed && !F.inHon && F.C.kuruwa.hon.test(p.x, p.z)) {
      F.inHon = true;
      rt.objDone('honmaru');
      rt.obj('inner', '本丸の木戸の内を守れ', 'order');
      rt.marker('hon', { x: GATE_HON.x - 3, z: GATE_HON.z + 8 }, '本丸木戸の内で守る', { h: 2, hideNear: 5, hideOnArrival: true });
      // 入城の声で、鳴っている退きの鉦・突撃太鼓・銃声の説明を消さない。
      shigaSupportVoice(rt, '武藤五郎右衛門', 'よう戻った。本丸の口で槍を揃えよ。ここなら寄せ手は横に広がれぬ', 3.5,
        () => (F.step === 3 || F.step === 3.5) && F.C.kuruwa.hon.test(rt.player.u.pos.x, rt.player.u.pos.z));
    }
  },

  // 落ちたままの待ちぼうけを避ける。傷は戻さず、敵前での引き上げもしない。
  retreatSafety(rt, dt) {
    const F = rt.flags, player = rt.player, u = player.u, fall = player.fallFrom;
    if (F.step !== 2 || !fall || u.climb) { F.cliffStuckT = 0; return; }
    if (Math.hypot(u.pos.x - fall.lx, u.pos.z - fall.lz) > 12) { F.cliffStuckT = 0; return; }
    const q = F.cliffRoad || (F.cliffRoad = { x: 0, z: 0, s: 0, d: 0 });
    roadProjection(u.pos, q);
    const trapped = q.d > 3 || rt.world.heightAt(q.x, q.z) - u.pos.y > 4;
    if (!trapped) { F.cliffStuckT = 0; return; }
    const still = F.cliffStill || (F.cliffStill = { x: u.pos.x, z: u.pos.z });
    if (Math.hypot(u.pos.x - still.x, u.pos.z - still.z) > 1) {
      still.x = u.pos.x; still.z = u.pos.z; F.cliffStuckT = 0;
    }
    F.cliffStuckT = (F.cliffStuckT || 0) + dt;
    if (F.cliffStuckT < 5 || rt.army.nearestEnemy(u, 6)) return;
    // 落下前にいた道へ戻す。隣の折り返しへ飛ばして登りを省かない。
    roadProjection(fall, q);
    if (q.d > 4 || rt.world.heightAt(q.x, q.z) - fall.y > 3) return;
    u.pos.x = q.x; u.pos.z = q.z; u.pos.y = rt.world.heightAt(q.x, q.z);
    u.vel.x = u.vel.z = 0; player.hspd = 0;
    player.fallFrom = null; F.cliffStuckT = 0;
    rt.bark(player.mounted ? '味方が手綱を引き、坂道へ戻した' : '味方が槍の柄を差し出し、坂道へ引き上げた', true);
  },

  onFinish(rt) {
    rt.flags.dayCut?.remove(); rt.flags.dayCut = null;
  },

  // 退く時に開けた内の木戸：本人と守兵が通り切ってから閉める。
  tickShut(rt, dt) {
    const F = rt.flags, S = F.shut, u = rt.player.u;
    if (!S) return;
    if (!S.G.opened || S.G.breached) { F.shut = null; return; }
    let outside = 0, wounded = 0;
    for (const g of F.castleGuards) for (const q of g.units) if (q.alive && !q.fleeing && !q.gone && !S.test(q.pos.x, q.pos.z)) { if (q.woundOut) wounded++; else outside++; }
    if (wounded && !S.woundWarned && S.test(u.pos.x, u.pos.z)) {
      S.woundWarned = true; S.woundWait = true;
      rt.choose(`木戸の外に動けぬ負傷兵が${wounded}人いる`, [
        { label: '口を守り、負傷兵を待つ', note: '木戸を開けて待つ。閉めるなら木戸へ寄れ' },
        { label: '木戸を閉めて守る', note: '外の負傷兵を残す。内の守りを固める' },
      ], (i) => { if (F.shut === S) S.woundWait = i !== 1; }, 12);
    }
    const guardIn = outside === 0;
    if (outside && S.test(u.pos.x, u.pos.z)) S.notice = `外の守兵${outside}人を待て。先に閉めるなら木戸へ寄れ`;
    else if (wounded && S.woundWait && S.test(u.pos.x, u.pos.z)) S.notice = '負傷兵を待っている。閉めるなら木戸へ寄れ';
    else S.notice = S.test(u.pos.x, u.pos.z) ? '木戸の内で槍を揃えよ' : '奥の木戸の印へ退け';
    castleGateProgress(rt, S.notice);
    S.inT = S.test(u.pos.x, u.pos.z) && guardIn && (!wounded || !S.woundWait) ? S.inT + dt : 0;
    if (S.inT > 1.5 && F.gu.close(S.G)) {
      F.shut = null;
      rt.obj('inner', F.backed ? '本丸の木戸の内で守れ' : '二の丸の木戸の内で守れ', 'order');
      rt.say('武藤五郎右衛門', `${S.G.name}を閉めた！　内で息を整えよ`, 2.5);
    }
  },
  // 本陣へ寄った時：奥ほど敵が濃いのを知らせ、本陣の印を出す
  tickCamps(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    const command = rt.t < shigaCommandUntil(F);
    // 合図を説明している間は声を待つ。済ませた印も付けず、近くにいれば後で知らせる。
    if (!command && !F.campNear && p.z < -70 && sightPoint(rt, F.campA.pos, 100)) { F.campNear = true; rt.say('足軽', '向こうは敵の本陣だで！　旗があんなに重なっとる、戻ろまい！', 3.5); }
    if (F.step >= 2) return;
    for (const [id, c, label] of [['campA', F.campA, '朝倉方の本陣（位置は推定）'], ['campB', F.campB, '浅井方の本陣（位置は推定）']]) {
      if (!c || F['mk_' + id] || !sightPoint(rt, c.general?.pos || c.pos, 75)) continue;
      F['mk_' + id] = true;
      rt.marker(id, { x: c.pos.x, z: c.pos.z }, label + '・近づくな', { h: 2 });
    }
    // 本陣の将の声は姿が見える近さだけ。台詞は推定で、町口の将の名は捏造しない。
    if (command || rt.t < (F.campVoiceT || 0)) return;
    for (const c of [F.campA, F.campB]) {
      const u = c?.general;
      if (!u?.alive || F['heard_' + u.name] || !sightPoint(rt, u.pos, 30)) continue;
      F['heard_' + u.name] = true; F.campVoiceT = rt.t + 8;
      rt.say(u.name, u.name === '朝倉の大将' ? '町口の守りは少ない。備えを崩さず押せ！' : '朝倉の手と歩みを合わせよ。坂本へ進め！', 3);
      break;
    }
  },
  // 史実の討死：近い敵との攻防を先に見せる。見える先手を倒しても、背後の軽い大軍による討死の報へ進む。
  doom(rt, o) {
    const F = rt.flags, u = o.u;
    if (!u || F.step >= 3 || F[o.key + 'Dead']) return;
    const deadline = rt.t + o.dur + 20;
    const c = { x: u.pos.x, z: u.pos.z };
    // 退き太鼓は町口を退く下知で一度だけ。討死の報に開戦の法螺を重ねない。
    shigaSupportVoice(rt, '足軽', `${o.name}の手が押されとる！　城へ退こまい！`, 3,
      () => F.step < 3 && u.alive && !F[o.key + 'Dead'] && sightPoint(rt, u.pos, 80));
    
    const preferred = o.key === 'nobu' ? F.twoHands[0] : o.key === 'aochi' ? F.twoHands[1] : F.w2;
    const g = !gone(preferred) ? preferred : [F.w1, F.w1b, ...F.twoHands, F.w2].find((q) => q && !gone(q));
    if (g && !gone(g)) {
      // 湖側の平地から町口へ寄せる。山側の切岸へ直進させない。
      g.order = 'path'; g.path = [[22, -20], [22, 4], [c.x, c.z]]; g.pathIdx = 0;
      g.formation = 'column'; g.colW = 1; g.seekRange = 45; g.aggro = 4;
      g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.aggro = 14; };
    }
    if (o.g) { o.g.order = 'hold'; o.g.aggro = 18; }
    rt.after(o.dur - 4, () => {
      // 最期の掛け声で退き太鼓の説明を消さない。討死そのものの知らせは別に必ず出す。
      if (!rt.over && !F.ending && F.step < 3 && rt.t >= shigaCommandUntil(F) &&
          u.alive && sightPoint(rt, u.pos, 40)) rt.say(o.name, o.last, 3);
    });
    u.invuln = false;
    const fall = () => {
      if (F.ending || F.step >= 3) return;
      const foe = u.alive ? rt.army.nearestEnemy(u, 4, (q) => !q.fleeing && !q.isStruct && !rt.army.wallBetween(u.pos, u.team, q.pos, false)) : null;
      if (u.alive && !foe && rt.t < deadline) { rt.after(1, fall); return; }
      if (u.alive) rt.army.kill(u, rt.t < deadline ? foe : null);
      if (u.alive) { rt.after(1, fall); return; }
      this.reportDoom(rt, u, o.key, o.name);
    };
    rt.after(o.dur, fall);

  },
  reportDoom(rt, u, key, name) {
    const F = rt.flags;
    if (u.alive || F[key + 'Dead']) return;
    F[key + 'Dead'] = true;
    if (u.group) { u.group.noRout = false; u.group.morale = 0; u.group.fleeDir = { x: -0.4, z: 1 }; }
    if ((F.moriDead || F.moriRescue) && F.nobuDead && F.aochiDead) {
      for (const q of [F.w1, F.w1b, ...F.twoHands, F.w2]) this.castleAdvance(rt, q);
    }
    // 実際に討たれた時も必ず報せる。三人の報せを同時に重ねない。
    const text = sightPoint(rt, u.pos, 80) ? `${name}が討たれた！` : `町口からの知らせ。${name}が討死`;
    const wait = Math.max(0, (F.doomReportT || 0) - rt.t);
    F.doomReportT = rt.t + wait + 8;
    if (!wait) rt.bark(text, true);
    else rt.after(wait, () => { if (!rt.over && !F.ending) rt.bark(text, true); });
  },
  // 二の丸への退き：三の丸が危うい時、城の守りを二の丸の木戸へ下げる
  toNinomaru(rt) {
    const F = rt.flags;
    if (F.backedNi) return;
    F.backedNi = true;
    rt.unmark('gate');
    rt.marker('ni', { x: GATE_NI.x, z: GATE_NI.z + 3.5 }, '二の丸の木戸の内へ', { h: 3 });
    // 城内の退きは短い鉦の乱打。町口の長い退き太鼓と区別する。
    shigaSignal(rt, 'hike', F.keep.center(), 0.85);
    F.castleRetreatSignalT = rt.t;
    F.castleRetreatVoiceUntil = rt.t + 8;
    F.castleSoundUntil = 0;
    rt.objRemove('mouth');
    rt.obj('inner', '退きの鉦。二の丸の木戸の内へ退け', 'order');
    rt.bark('危うい。二の丸へ退け', true);
    rt.say('武藤五郎右衛門', F.gate.alive ? '退きの鉦じゃ！　三の丸は持たぬ、二の丸の木戸で受けよ！' : '退きの鉦じゃ！　大手が破られた、二の丸へ退け！', 3.5);
    // 二の丸の木戸の内（三の丸の側）で槍を揃える
    F.keep.retreatOnly = true;
    F.keep.order = 'path'; F.keep.path = [[-10, 58], [-11, 69], [GATE_NI.x, GATE_NI.z], [GATE_NI.x, GATE_NI.z + 3.5]]; F.keep.pathIdx = 0; F.keep.formation = 'column'; F.keep.colW = 1; F.keep.aggro = 2; keepRoad(F.keep, F.keep.path, Math.PI); F.keep.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; q.retreatOnly = false; };
    F.guns.retreatOnly = true; F.guns.fire = false;
    keepRoad(F.guns, [...F.keep.path, [-17, 80]], Math.PI);
    if (F.moriSaved) this.moriBack(rt, F.keep.path, Math.PI, [-17, 80]);
    // 二の丸の木戸を開けて迎え入れ、入ったら城の者が閉める（閉めれば、その内で息がつける）
    if (F.gu.open(F.gateNiMk)) F.shut = { G: F.gateNiMk, test: (x, z) => F.C.kuruwa.ni.test(x, z) || F.C.kuruwa.hon.test(x, z), t0: rt.t, inT: 0 };
  },
  // 本丸への退き：印を出し、城の守りを本丸の口へ下げる。任務は続く（持てば勝ち）
  toHonmaru(rt) {
    const F = rt.flags;
    if (F.backed) return;
    if (!F.backedNi) this.toNinomaru(rt);
    F.backed = true;
    F.castleSoundUntil = 0;
    rt.objRemove('mouth');
    rt.unmark('ni');
    // 門口から少し離れた庭へ案内し、後から入る守兵の列を塞がない。
    rt.marker('hon', { x: GATE_HON.x - 3, z: GATE_HON.z + 8 }, '本丸の木戸の内へ', { h: 3 });
    // 一度に本丸まで退く時は、二の丸の鉦と重ねず同じ合図を引き継ぐ。
    if (rt.t - (F.castleRetreatSignalT ?? -99) >= 8) {
      shigaSignal(rt, 'hike', F.keep.center(), 0.85);
      F.castleRetreatSignalT = rt.t;
    }
    // 二の丸の鉦を引き継ぐ時も、本丸への下知と札は改めて八秒保つ。
    // 発音した時刻は動かさず、敵の太鼓や銃声の説明だけを読み終えるまで待たせる。
    F.castleRetreatVoiceUntil = rt.t + 8;
    rt.obj('inner', '退きの鉦。本丸へ退き、木戸の内を守れ', 'order');
    rt.bark('危うい。本丸へ退け', true);
    rt.say('武藤五郎右衛門', F.kidoNi.struct.alive ? '退きの鉦に従え！　まだ本丸がある、奥へ下がって受けよ！' : '退きの鉦に従え！　二の丸も破られた、本丸へ退け、最後の木戸を守れ！', 3.5);
    // 本丸の木戸の内（切岸の上の口）で槍を揃える
    // 番所の北の庭を回り、北向きの本丸木戸の中央を通る。
    F.keep.retreatOnly = true;
    F.keep.order = 'path'; F.keep.path = [...ROAD.slice(ROAD.findIndex(p => p[0] === GATE_NI.x && p[1] === GATE_NI.z) + 1, ROAD_HON + 1), [GATE_HON.x, GATE_HON.z + 3.5]]; F.keep.pathIdx = 0; F.keep.formation = 'column'; F.keep.colW = 1; F.keep.aggro = 2; keepRoad(F.keep, F.keep.path, GATE_HON.rot); F.keep.onArrive = (q) => { q.order = 'hold'; q.facing = GATE_HON.rot; q.retreatOnly = false; };
    F.guns.retreatOnly = true; F.guns.fire = false;
    const rear = [GATE_HON.x - 1.3333, GATE_HON.z + 10];
    keepRoad(F.guns, [...F.keep.path, rear], GATE_HON.rot);
    if (F.moriSaved) this.moriBack(rt, F.keep.path, GATE_HON.rot, rear);
    if (F.gu.open(F.gateHonMk)) F.shut = { G: F.gateHonMk, test: (x, z) => F.C.kuruwa.hon.test(x, z), t0: rt.t, inT: 0 };
  },
  moriBack(rt, path, facing, end) {
    const g = rt.flags.mori;
    g.retreatOnly = true;
    keepRoad(g, [...path, end], facing);
    g.onArrive = (q) => { q.order = 'hold'; q.facing = facing; q.retreatOnly = false; };
  },
  // 守る区域の持ち主が変わった（siege_zones.js の onFall）：三の丸、二の丸、本丸の順に退く
  onZone(rt, id) {
    const F = rt.flags;
    const z = F.SZ && F.SZ.byId[id];
    if (!z || F.ending) return;
    if (id === 'san' && z.owner === ZONE_STATE.ENEMY && !F.backedNi) this.toNinomaru(rt);
    if (id === 'ni' && z.owner === ZONE_STATE.ENEMY && !F.backed) this.toHonmaru(rt);
    if (id === 'hon' && z.owner === ZONE_STATE.ENEMY) {
      rt.marker('hon', HON_C, '取り返す本丸', { h: 3 });
      rt.say('武藤五郎右衛門', '本丸に入られた！　城兵とともに口を押し返せ！', 3.5);
    }
    if (z.owner === ZONE_STATE.FRIEND && F['lost_' + id]) rt.say('武藤五郎右衛門', `${z.name}を取り返した！`, 2.5);
    if (z.owner === ZONE_STATE.ENEMY) F['lost_' + id] = true;
  },
  // 遠い備えの下知。近さと時間だけで死傷者や士気の低下を作らない。
  tickLight(rt, dt) {
    const F = rt.flags;
    if (F.step !== 3 || !F.AA || !F.bSiege) return;
    F.AA.tick(dt);
    if (!F.aaSaid && F.AA.mainRoute) {
      F.aaSaid = true;
      const m = F.AA.mainRoute;
      rt.after(14, () => { if (!F.ending && F.step === 3 && sightPoint(rt, m.entry, 100)) rt.say('足軽', `${m.name}の方に敵の旗が出たがや！`, 3.5); });
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    // 町口で本人や組が先手を討った時だけ、その隊の押す力が弱まる。
    // 一度の局地的な手柄。後の三万の寄せ・守将の討死・後詰の日付は変えない。
    if (!F.ending && F.step === 1 && !F.mouthMerit && v.team === 1 && !v.isStruct &&
        (k === rt.player.u || k?.isSub) && (v.group === F.w1 || v.group === F.w1b) &&
        Math.hypot(v.pos.x - TOWN_POST.x, v.pos.z - TOWN_POST.z) < 24) {
      F.mouthKills = (F.mouthKills || 0) + 1;
      if (F.mouthKills >= 3) {
        F.mouthMerit = true;
        v.group.morale = Math.max(0, v.group.morale - 12);
        rt.award((t) => t.side.push('町口で先手の勢いを削いだ'), '町口で先手の勢いを削いだ', TOWN_POST);
        rt.after(2, () => { if (F.step === 1 && !F.ending) rt.say('森可成', 'よく支えた！　先手の足が鈍ったぞ。列を保て！', 3); });
      }
    }
    if (F.step !== 2 || F.ending) return;
    if (v === F.nobuU) this.reportDoom(rt, v, 'nobu', '織田信治');
    else if (v === F.aochiU) this.reportDoom(rt, v, 'aochi', '青地茂綱');
    else if (v === F.moriU && !F.moriRescue) this.reportDoom(rt, v, 'mori', '森可成');
  },
  onRout(rt, g) {
    if (g.team !== 1 || !sightPoint(rt, g.center(), 80) || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    g._routSaid = true; rt.flags.routSayT = rt.t + 8;   // 隊ごとに一度・間を 8 秒（崩れて立て直す隊が同じ一言を繰り返さない。10/2）
    // 敵の敗走の報せで、法螺・太鼓・鉦の意味と退く先の下知を遮らない。
    const step = rt.flags.step;
    shigaSupportVoice(rt, '足軽', `${g.name}が崩れたがや！`, 2.5,
      () => rt.flags.step === step && g.routed && sightPoint(rt, g.center(), 80));
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if (!F.gates || !F.gates.includes(s)) return;
    const pct = Math.round(Math.max(0, s.hp) / s.maxHp * 100);
    const next = [75, 50, 25].find((q) => pct <= q && !(s._saidPct || []).includes(q));
    if (next) { s._saidPct = [...(s._saidPct || []), next]; rt.bark(`${s.name}が傷んでいる`, true); }
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (!F.gates || !F.gates.includes(s)) return;
    if (s.mesh && s.mesh.userData.fall) s.mesh.userData.fall();   // 扉が内へ倒れる
    // 破れた扉の中点から鳴らし、城壁の遮り・左右・遠さを共通の合成音へ渡す。
    const at = { x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 };
    rt.army.play('wood', at, 1.2);
    F.gateBreachText = `${s.name}が砕ける音。木戸が破られた`;
    F.gateBreachUntil = rt.t + 8;
    const lastGate = s === F.kidoHon.struct;
    const to = F.backed || s !== F.gate ? '本丸' : '二の丸';
    rt.say('武藤五郎右衛門', lastGate
      ? `${s.name}が破られた！　本丸の城兵と槍を揃え、口で押し返せ！`
      : `${s.name}が破られた！　${to}の木戸の内へ退け、道を空けよ！`, 3.5);
    const passed = gateRoadIndex(s);
    for (const q of F.waves || []) if (q.order === 'assault') this.castleAdvance(rt, q, Math.max(2, passed + 1));
  },
};

// ---------------- 町口の押し合いと、宇佐山城の守り ----------------
// 両軍の総勢（宇佐山城の森可成の兵 千ほど、浅井・朝倉 三万ほど。数には諸説ある）
shiga.force = () => {
  return { a: 950, a0: 950, b: 30000, b0: 30000 }; // 出陣時の目安。遠い死傷者を倍率で捏造しない。
};
shiga.sides = { a: { name: '織田軍（宇佐山城）', mon: 'oda' }, b: { name: '浅井・朝倉軍', mon: 'asakura' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
shiga.famous = [];
// 公記の日ごとの戦況に合わせる。天気・時刻は史料で確定できない。
const SHIGA_DAYS = { 16: '十六', 19: '十九', 20: '二十', 21: '二十一', 22: '二十二', 23: '二十三', 24: '二十四' };
shiga.date = (rt) => `元亀元年九月${SHIGA_DAYS[rt?.flags?.battleDay] || '十六'}日（旧暦）　天気・時刻は推定`;
shiga.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '可成の話を飛ばす' : '');
shiga.skip = (rt) => { if (rt.phase === 'brief') shiga.first(rt); };
shiga.history = '足軽の筋は史実に沿い、森可成らの討死の後に宇佐山城を守る。町口で早く退く相談を選び、森可成と森隊の三分の一以上を城へ入れる救出は、もしもの筋。救った隊は木戸ごとの守りへ引き継ぎ、敵の兵力は減らさない。信長の早い帰還は、もしもの筋。『信長公記』巻三「志賀御陣之事」では、九月十六日、森可成は千人に満たない兵で坂本の町はずれへ下り、浅井・朝倉の先手に小勝ちを得た。十六日の先手は朝倉と浅井の二隊で示すが、各隊への配分・位置・到着の間隔は推定復元である。十九日、三万ほどの敵が両手から押し寄せ、森可成・織田信治・青地茂綱らが討ち死にした。二十日とも伝わるが、本戦は信長公記の十九日に合わせた。敵は端城まで攻め上って火を放ったが、武藤五郎右衛門・肥田彦左衛門が城を守った。端城の火元は北の小曲輪の物見と三の丸の番所に合わせた推定復元で、史料は燃えた建物や着火時刻を特定していない。十九日・二十日に示した炎と煙は、二十二日の急報への場面転換で片付け、後詰の日まで同じ火を燃やし続けない。鎮火の日時は史料で確定せず、この切り替えは演出上の推定である。『兼見卿記』九月二十日条は坂本の放火も伝える。本戦では二十日の札で町屋の火を示すが、燃える家の位置と着火時刻は推定復元である。北から坂本へ入る道と大津へ向かう湖岸道を分岐で結び、南へ抜ける一手もその道を通す。南下する一手は北の街道上で二列に控え、二十日に同じ兵が分岐から湖岸道へ進む。待機位置と列の形は推定復元である。分岐の位置・幅・勾配は推定復元で、当時の道筋を確定したものではない。北国海道は北の控えを越えて地面の北端まで続け、陣中でも踏み土を途切れさせない。大津市の西近江路の説明をもとにした補完で、当時の街道の座標・幅を確定したものではない。二十二日、京へ迫る敵の知らせが摂津の信長へ届いた。二十三日、信長は柴田勝家・和田惟政をしんがりに、野田・福島から江口を通って帰京。本戦でも二十二日の急報、二十三日の撤収を日付の札で分けて示すが、知らせの間隔は遊びのために縮めている。二十四日に京の本能寺を発ち、逢坂を越えると、坂本の敵は比叡山側の、はちが峯・あほ山・つほ笠山へ陣を移した。本戦では西の三筋へ退く姿で示すが、登り口の座標と隊の割り振りは推定で、三山の実際の位置を示すものではない。寄せ手の退く道と地表の踏み土をそろえた。町口側の本隊は、兵列が浅井本陣の陣幕を横切らないよう、本陣の南から西外側を回って三筋へ分かれる。道筋は推定復元で、史料が当時の移陣経路を特定したものではない。町の北縁の合流路と三筋の登り道は、最大幅四十の遠い兵列と揺れの余白まで草木を空け、両翼が林を横切らないようにした。伐採範囲は移陣を示すための推定復元であり、史料が道幅を特定したものではない。遠景の本隊も町の北縁から同じ登り道を経由し、十六秒の終幕の移動で三筋へ分かれる。折れ点と移動時間は遊びのための推定復元である。山肌の高さは保ち、道筋・幅・伐採範囲は推定復元である。その日の信長の陣は下坂本で、翌二十五日に山麓の包囲を進めた。兵数や城内の並びには諸説ある。北の両家の本陣の位置と将の姿は復元である。朝倉方は、この条で名の出ない義景本人とは断定しない。浅井方も、公記の浅井備前は長政を指すが、この復元位置に立つ将を本人とは断定しない。両家の本陣は中央の兵列の左右へ分け、後続は北の別列に置く。中央の両手の備えは、各三百二十人と後続二百五十六人を保ち、前後の備えが重ならないよう奥行きを詰めた。備えの間隔と密度は遊びのための推定復元で、史料が隊列の寸法を示すものではない。北の後続三隊の八百二十人は、十九日にも北の待機場所を保つ。町口へ三十五メートル前進させると本陣後方の控えに重なるため、両手の四つの備えだけを前進させた。後続の待機は推定復元で、兵数・列の密度・町口の乱戦は保つ。二十四日は待機場所から本陣の北を西へ抜け、控えや陣幕を横切らずに比叡山へ向かう。踏み土と草木の除去範囲も同じ経路に合わせる。道筋は推定復元である。本陣後方の五百六十人は陣幕を横切って前進させず、控えとして待機させる。二十四日は陣幕の北から西外側へ回って山へ退く。待機と移陣の細かな道筋は推定復元であり、公記が控えの配置を特定するものではない。両手の控えと十九日の前進路は草木を空け、遠い兵も地面の起伏に沿わせる。空き地の範囲は推定復元である。陣幕と兵列を重ねないための推定配置であり、史料が本陣の位置や間隔を示すものではない。城攻めの控えは十六日には北の寄せ場に置き、十九日の町口の崩れから同じ三十八人を大手道へ進める。控えの配分・道筋・行軍の間隔は推定復元である。町口から攻め上る隊も現在地から大手道へ合流し、九十九折りの角を順に通る。合流点は推定で、史料が当時の登城路を特定するものではない。両手を北の正面と西の山側に分けた布陣、少数の鉄砲の射撃、木戸ごとの攻防と時間は遊びのための復元であり、史料にない夜襲は設けていない。城は敵の全てを止めたわけではなく、二十日に大津・馬場・松本、二十一日に醍醐・山科へ敵が進んで放火したと公記は記す。城の役目は街道を監視し、敵の背後を脅かすことにある。千人に満たない守りは九百五十人を出陣時の目安とし、各備への配分と見える人数は縮小した復元である。町口の兵は十九日の場面でも同じ組の生き残りを使い、日ごとの実際の再編を再現したものではない。山麓の雑木は緑を多く残し、色づきを控えめにした。現代の大津の紅葉時期を目安とした推定で、当年の葉色を確定するものではない。旧暦九月を今の九月と取り違えないよう彼岸花は置かず、ススキと刈田を残す。琵琶湖の水面は川の長い流れ筋を使わず、旗や煙と同じ推定の風向に沿う細かな波で示す。これは湖流を再現したものではなく、当日の風向・波高も確定しない。正確な天気と時刻は不明。日差しは北緯約三十五度の秋として、朝は東南の高度約三十度、昼は真南の約四十七度に置いた推定復元である。大津市の資料にある宇佐山の標高三百三十六メートル、麓約百十メートルの差、約二百二十六メートルを目安に、遊びでは町口から本丸の高さを約三分の一に縮めた。山と湖の水平距離も縮め、城の石垣・石段・南の二の丸と貯水槽は遺構の記載をもとに補った。曲輪の南北の並びは資料に食い違いがあり、南の段の方位・建物・門・物見・堀・屋根と道は元亀元年の近江として推定。信長で出る場合の早い帰還は、もしもの筋である。対陣は十二月の和議まで続いた。';

// 退く道は保ち、前後から届く打ち込みだけ構えて受ける。
// 共通の退避は城への退却中に働かないため、走るだけでは追手に背を斬られ続ける。
function retreatOnShigaRoad(b, step) {
  if (b.flags.step !== 2) return true;
  // 道の印だけでは急な路肩も通れる扱いになる。実際の歩みと同じ足場を調べる。
  // 一歩の途中も調べ、終点だけ平らな道へ出る避け足で切岸を横切らない。
  const p = b.player, u = p.u, dx = step.x - u.pos.x, dz = step.z - u.pos.z;
  let x = u.pos.x, z = u.pos.z, y = u.pos.y;
  for (let i = 1; i <= 6; i++) {
    const nx = u.pos.x + dx * i / 6, nz = u.pos.z + dz * i / 6;
    if (!p.canStep(x, z, nx, nz, y)) return false;
    x = nx; z = nz; y = b.world.heightAt(x, z);
  }
  // 町口から入口へ向かう間は、まだ坂道の外。道幅の制限で全方向を塞がない。
  // 入口を踏んだ後だけ、九十九折りの切岸へ出ないようにする。
  if (b.flags.retreatIdx === 0) return true;
  const path = b.flags.retreatPath, i = Math.min(b.flags.retreatIdx, path.length - 1);
  const a = path[i - 1], c = path[i], vx = c[0] - a[0], vz = c[1] - a[1];
  const t = Math.max(0, Math.min(1, ((step.x - a[0]) * vx + (step.z - a[1]) * vz) / (vx * vx + vz * vz || 1)));
  // 別の段の道が近くても、今向かっている角までの道幅から出ない。
  const distance = Math.hypot(step.x - a[0] - vx * t, step.z - a[1] - vz * t);
  if (distance <= 2.2) return true;
  // 兵に道の脇へ押された時は、歩ける足場から同じ区間へ戻る一歩も通す。
  // 戻り切るまで全方向を禁じると、構えたまま動けなくなる。
  const current = Math.max(0, Math.min(1, ((u.pos.x - a[0]) * vx + (u.pos.z - a[1]) * vz) / (vx * vx + vz * vz || 1)));
  return distance < Math.hypot(u.pos.x - a[0] - vx * current, u.pos.z - a[1] - vz * current) - .05;
}

function retreatWithGuard(b, inp, goTo, x, z, r) {
  const p = b.player, u = p.u;
  inp.axis = null; inp.runHeld = false;
  // 前の受けで使った後退・横歩きと狙いを残すと、次の前進と打ち消し合う。
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
  if (p.lock) inp.e.add('KeyQ');
  // 坂の角は行き先に入っている。町では屋敷の壁をよけて入口へ回る。
  // 手すりのある坂へ入ってからだけ、共通の横回りを止める。
  if (b.flags.step !== 2 || b.flags.retreatIdx > 0) {
    p._gtStuckT = 0; p._gtDetourT = 0;
  }
  goTo(p, inp, x, z, r);
  const advancing = inp.k.has('KeyW'), routeYaw = p.yaw;
  retreatThroughGap(b, inp, retreatOnShigaRoad);
  // 狭い角で一歩半の先が塞がっても、手前の半歩が通れば進める。
  // 近道や柵抜けは許さず、同じ足場・当たり・兵の隙間を短い歩幅で調べ直す。
  if (advancing && !inp.k.has('KeyW')) {
    p.yaw = routeYaw; inp.k.add('KeyW');
    retreatThroughGap(b, inp, retreatOnShigaRoad, .5);
  }
  // 本人は気力切れでも走れる。追手から離れる坂では歩きに戻さない。
  inp.runHeld = inp.k.has('KeyW');
  inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
  let attacker = null, nearest = Infinity, impact = Infinity, imminent = false;
  for (const o of b.army.units) {
    if (!o.alive || o.team === u.team || o.fleeing || o.gone || o.downed || o.woundOut || o.rearWound || o.noTarget || o.isStruct ||
        !o.sidearm && (o.type === 'gun' || o.type === 'bow') || Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    const striking = (o.atk && o.atk.target === u && !o.atk.bow && !o.atk.ranged) ||
      (o.swing && !o.swing.done && o.swing.target === u) || (o.charging && o.target === u);
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 振りの切れ目に追手へ背を向け直すと、次の突きまでに指が回らない。
    // 本人を追い、もう間合いへ入る敵には、振りかぶる前から向いて退く。
    const closing = o.target === u && !o.playerQueue && d <= (o.reach || 2.8) + 1.5;
    if (!striking && !closing) continue;
    // 指のなぞりで背後へ向くには時間が要る。槍が届いてからではなく、
    // 振りかぶって追ってくる時から受けを作り、坂道を進む足は保つ。
    if (d <= (o.reach || 2.8) + 3 &&
        !b.army.wallBetween(u.pos, -1, o.pos, (o.wpnKind || o.lookWeapon) === 'spear')) {
      const soon = o.charging ? 0 : o.swing && !o.swing.done && o.swing.target === u
        ? Math.max(0, o.swing.dur * o.swing.at - o.swing.t) : o.atk?.target === u ? o.atk.t : Infinity;
      // 遠い空振りより、今の間合いに届く刃から先に退く。
      const reaches = soon <= .65 && d <= (o.reach || 2.8) + .6;
      if (reaches && !imminent || reaches === imminent && (soon < impact || soon === impact && d < nearest)) {
        attacker = o; nearest = d; impact = soon; imminent = reaches;
      }
    }
  }
  if (!attacker) return;
  const toward = Math.atan2(attacker.pos.x - u.pos.x, attacker.pos.z - u.pos.z);
  // 刃へ正面を向け、棒を連続した向きへ倒して細い坂道を保つ。
  const walkYaw = p.yaw, walking = inp.k.has('KeyW');
  p.yaw = toward;
  inp.k.delete('KeyW');
  if (walking) {
    const fw = Math.cos(walkYaw - p.yaw), side = -Math.sin(walkYaw - p.yaw);
    const axis = b._shigaRetreatAxis || (b._shigaRetreatAxis = { x: 0, y: 0 });
    axis.x = side; axis.y = -fw; inp.axis = axis;
  }
  // 構え・回避は廃止済み。木戸で待つ間も、追手の間合いでは普通の駆け足で離れる。
  // 坂へ進む一歩に横槍があれば別の隙間を探し、全方向が塞がれば棒も取り消す。
  // 構えでは止められないため、追手の振り出しより前に出足の分も空ける。
  // 振りの切れ目も、追手が一歩外へ来た時点で離れ始める。
  // 向き直るだけで待つと、次の突きが出るまでに退く距離を稼げない。
  if (nearest <= (attacker.reach || 2.8) + 1.5) {
    retreatRunFromBlade(b, inp, retreatOnShigaRoad, walking ? walkYaw : null);
  }
  // 追手への向きは保ち、打ち込みの前だけ構える。接近だけの追手に
  // 構え続けると坂で息が戻らず、背後の連続した突きで構えが崩れる。
  // 指と体が横・背へ向き直る間も見込み、正面の受けより早く構える。
  const guardLead = Math.cos(toward - u.heading) < 0.5 ? 1.3 : 0.9;
  inp.guardHold = impact <= guardLead;
  // 構えと回避は本人には使われない。向き直った後も、調べた隙間へ走る。
  // 木戸で待つ時や、通れる足場が無い時には足を出さない。
  inp.runHeld = !!inp.axis && Math.hypot(inp.axis.x, inp.axis.y) > .5;
  inp.leftPressed = false; inp.chargeHold = false;
}

// 素直な遊び手：町口で朝倉と戦い、城へ退き、木戸に取り付く寄せ手を討つ
shiga.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 深手の退避と手当ては共通の判断に任せる。傷は全快しないので、
  // 体力が戻るまで町口の後ろで休む条件を重ねない。

  // 本丸へは道（木戸→二の丸→本丸の木戸）を通る。切岸は登れないので、間の口を順に踏む
  const inHon = F.C && F.C.kuruwa.hon.test(u.pos.x, u.pos.z);
  const inNi = !inHon && F.C && F.C.kuruwa.ni.test(u.pos.x, u.pos.z);
  const inSan = !inHon && !inNi && F.C && F.C.kuruwa.san.test(u.pos.x, u.pos.z);
  const inside = inHon ? { x: USA.x, z: USA.z } : inNi ? { x: GATE_HON.x, z: GATE_HON.z + 4 } : inSan ? { x: GATE_NI.x, z: GATE_NI.z + 4 } : { x: GATE_OUT.x, z: GATE_OUT.z + 4 };
  // 退く下知を敵探しより先に守る。追手を追い返して町口へ戻らない。
  if (F.step === 2) {
    // 木戸の内へ着いたら町口の味方を待つ。守兵の列へ走り続けて押し込まない。
    if (inSan || inNi || inHon) {
      retreatWithGuard(b, inp, goTo, u.pos.x, u.pos.z, 1.5);
      inp.runHeld = false;
      if (!inp.guardHold) {
        inp.guardHold = true;
        p.yaw = Math.atan2(F.gateN.x, F.gateN.z);
      }
      return;
    }
    retreatWithGuard(b, inp, goTo, F.retreatPoint.x, F.retreatPoint.z, 1.5); return;
  }
  if ((F.backed || F.backedNi) && !(F.backed ? inHon : inNi || inHon)) {
    const key = F.backed ? 2 : 1;
    if (F.botInnerKey !== key) {
      F.botInnerKey = key;
      const end = ROAD.findIndex(([x, z]) => x === (F.backed ? GATE_HON.x : GATE_NI.x) && z === (F.backed ? GATE_HON.z : GATE_NI.z));
      let start = 3, best = Infinity;
      for (let i = 3; i <= end; i++) { const d = Math.hypot(u.pos.x - ROAD[i][0], u.pos.z - ROAD[i][1]); if (d < best) { best = d; start = i; } }
      F.botInnerPath = [...ROAD.slice(start, end + 1), F.backed ? [GATE_HON.x, GATE_HON.z + 3.5] : [GATE_NI.x, GATE_NI.z + 3.5]]; F.botInnerIdx = 0;
    }
    const way = F.botInnerPath;
    while (F.botInnerIdx < way.length - 1 && Math.hypot(u.pos.x - way[F.botInnerIdx][0], u.pos.z - way[F.botInnerIdx][1]) < 1.8) F.botInnerIdx++;
    const at = way[F.botInnerIdx]; retreatWithGuard(b, inp, goTo, at[0], at[1], 1.2); return;
  }
  const atTown = F.step === 1 || F.step === 1.5;
  // 先手の中心を追うと、固定された味方の槍の列から離れ、左右の敵に囲まれる。
  // 退避の後も敵の塊へ戻らず、町口の同じ持ち場へ戻る。
  if (atTown && Math.hypot(u.pos.x - TOWN_POST.x, u.pos.z - TOWN_POST.z) > 7) {
    retreatWithGuard(b, inp, goTo, TOWN_POST.x, TOWN_POST.z, 2); return;
  }
  // 切岸の上下を相手にせず、構えを解く間は同じ相手への反撃を保つ。
  const target = strikeTarget(b, 12);
  const e = target && (F.step < 3 || F.C.kuruwa.san.test(target.pos.x, target.pos.z) ||
    F.C.kuruwa.ni.test(target.pos.x, target.pos.z) || F.C.kuruwa.hon.test(target.pos.x, target.pos.z)) &&
    (!F.backed || inHon && F.C.kuruwa.hon.test(target.pos.x, target.pos.z)) &&
    (!F.backedNi || F.backed || inNi && F.C.kuruwa.ni.test(target.pos.x, target.pos.z) || inHon && F.C.kuruwa.hon.test(target.pos.x, target.pos.z)) ? target : null;
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 狙いが古い相手に残ると、更新時にそちらへ向き直り、今の打ち手に背を向ける。
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    if (d >= reach * 0.9 && u.hp > u.maxHp * 0.6) {
      // 敵が持ち場の外でも、こちらが列を離れずに槍の間合いへ寄れるなら進む。
      // 敵の座標だけで六歩の制限をかけると、届かない距離で待ち続けていた。
      const stop = reach * 0.85, k = Math.max(0, d - stop) / (d || 1);
      const x = u.pos.x + (e.pos.x - u.pos.x) * k, z = u.pos.z + (e.pos.z - u.pos.z) * k;
      // 持ち場の範囲内でも、味方が倒れた場所へ一人で追わない。
      // 生きて斬り結べる味方のそばだけで間合いを詰める。
      let supported = false;
      for (const mate of b.army.units) {
        if (mate === u || !mate.alive || mate.team !== u.team || mate.fleeing || mate.downed ||
            mate.noTarget || mate.isStruct || mate.woundOut || mate.rearWound || mate.group?.routed ||
            mate.group?.hidden || mate.type === 'porter' || !mate.sidearm && (mate.type === 'gun' || mate.type === 'bow')) continue;
        if (Math.abs(mate.pos.y - u.pos.y) < 3 && Math.hypot(mate.pos.x - x, mate.pos.z - z) < 8 &&
            !b.army.wallBetween(u.pos, -1, mate.pos)) { supported = true; break; }
      }
      // 奥へ退いた後も、敵を追って木戸の外や切岸へ出ない。
      const inPost = !F.backedNi || (F.backed ? F.C.kuruwa.hon.test(x, z) : F.C.kuruwa.ni.test(x, z) || F.C.kuruwa.hon.test(x, z));
      if (supported && inPost && (!atTown || Math.hypot(x - TOWN_POST.x, z - TOWN_POST.z) <= 7) &&
        !b.army.wallBetween(u.pos, u.team, e.pos, false)) goTo(p, inp, x, z, 0.3);
    }
    // 相手の打ち込みを受け、隙に構えを解いて突く。くじで構えと
    // 突きを同時に選ぶと、槍の払いになり斬り合いが続かなかった。
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  const inG = { x: F.gateC.x - F.gateN.x * 5, z: F.gateC.z - F.gateN.z * 5 };
  // 町口では口を塞ぐ：列の前に立ち、寄せてくる者だけを討つ（大軍の中へ一人で深く追わない）
  if (atTown) { goTo(p, inp, TOWN_POST.x, TOWN_POST.z, 2); return; }
  if (F.step === 3 || F.step === 3.5) {
    // 持ち場の外の相手への狙いも外す。狙い直しで崖側へ向かされないようにする。
    if (p.lock) inp.e.add('KeyQ');
    // 木戸の内で、破って入る寄せ手を討つ（木戸は閉めてある）
    // 退けの声が出たら、内の曲輪へ入って、その口の内で受ける
    if (F.backed || F.backedNi) {
      const inner = F.backed ? inHon : inNi || inHon;
      const hold = F.backed ? { x: GATE_HON.x - 3, z: GATE_HON.z + 8 } : { x: GATE_NI.x, z: GATE_NI.z + 4 };
      const t = inner ? hold : inside;
      goTo(p, inp, t.x, t.z, 2); return;
    }
    const gk = inG;
    
    goTo(p, inp, gk.x, gk.z, 2);
    return;
  }
  const a = F.moriU.pos; goTo(p, inp, a.x + 3, a.z + 4, 3);
};

shiga.rts = false;   // 城の一手を預かる身分でも浅井・朝倉や城全体を上空から指図しない。

// 信長公記巻三：森可成・信治・青地の町口、武藤・肥田の城守り。
// 守りは千人弱、敵は三万ほど。各手・各曲輪の割り振りと敵の左右は推定。
installBattleJinkei(shiga, [
  battleJin('町口と三つの曲輪の守り（配分は推定）', 0, HON_C, Math.PI, [
    ['shiga_mori', '坂本の町口・中央', '森可成', 400, { x: TOWN.x - 2, z: TOWN.z + 16 }, 'tsuru', 'oda', (r) => r.flags.bMori],
    ['shiga_nobuharu', '坂本の町口・湖側', '織田信治', 250, { x: TOWN.x + 30, z: TOWN.z + 12 }, 'oda', 'oda', (r) => r.flags.bNobu],
    ['shiga_aochi', '坂本の町口・山側', '青地茂綱', 150, { ...AOCHI_POST }, 'oda', 'oda', (r) => r.flags.sakai],
    ['shiga_muto', '三の丸の木戸', '武藤五郎右衛門', 60, { x: -8, z: 56 }, 'oda', 'oda', (r) => r.flags.keep],
    ['shiga_hida', '本丸の守り', '肥田彦左衛門', 60, { x: GATE_HON.x, z: GATE_HON.z + 8 }, 'oda', 'oda', (r) => r.flags.hida],
    ['shiga_san', '三の丸の大手木戸', '将の名は不明', 30, { x: -12, z: 60 }, 'oda', 'oda', null, { draw: true, named: false, w: 8, d: 5, count: 20 }],
    ['shiga_aid', '逢坂からの後詰', '織田信長', null, AID_START, 'oda', 'oda', (r) => r.flags.aidMoving ? r.flags.aid : null, { form: 'column', facing: Math.PI }],
  ], '森らの町口の戦いから籠城、九月二十四日の後詰へ。公記は守りを千に満たない兵とし、九百五十の総数や各手への配分は復元の目安。武藤・肥田の曲輪別の担当も復元。'),
  battleJin('朝倉の縦に続く備え（配分は推定）', 1, ASAKURA_CAMP, 0, [
    ['shiga_asakura_hq', '本陣（位置は推定）', '将の名は不明', 6000, ASAKURA_CAMP, 'asakura', 'asakura', (r) => r.flags.campA?.guard, { named: false }],
    ['shiga_asakura_front', '街道の先手', '朝倉の衆（将の名は不明）', 7000, { x: 28, z: -96 }, 'asakura', 'asakura', (r) => r.flags.bAsa, { named: false }],
    ['shiga_asakura_next', '街道の二の備え', '朝倉の衆（将の名は不明）', 7000, { x: 60, z: REAR_Z }, 'asakura', 'asakura', null, { named: false }],
  ], '朝倉と浅井の内訳は推定。町口では北から南へ進み、後詰が来ると比叡山へ退く。'),
  battleJin('浅井の山側の備え（配分は推定）', 1, AZAI_CAMP, 0.1, [
    ['shiga_azai_hq', '本陣（位置は推定）', '将の名は不明', 4000, AZAI_CAMP, 'azai', 'azai', (r) => r.flags.campB?.guard, { named: false }],
    ['shiga_azai_front', '山側の先手', '浅井の衆（将の名は不明）', 6000, { x: -22, z: -92 }, 'azai', 'azai', (r) => r.flags.bAza, { named: false }],
  ], '三万ほどは両家を合わせた概数。公記に浅井備前とあるが、この本陣の将の姿・持ち場は特定できない。両家・各備の兵数と、山側を浅井、街道側を朝倉とする位置は推定。'),
]);

// 志賀に置かれた軽い馬だけを整える。共通の形は複製し、兵数と描画回数は増やさない。
const shigaSetup = shiga.setup;
shiga.setup = function (rt) {
  // 共通の戦況の声も、この戦では退却と木戸の守りを優先する。
  const bark = rt.bark;
  rt.bark = function (text, warn) {
    const F = this.flags;
    // 城を守る間の味方の掛け声を、出撃の下知と取り違えさせない。
    if (F.step >= 3 && !F.ending && text.startsWith('味方の兵「'))
      text = text.replace(/前へ進め！|旗に続け！/g, '木戸の内で備えよ！');
    // 攻め戦向けの横回り・突撃の助言で、町口や木戸から離れさせない。
    if (/^(槍衾だ|鉄砲の列だ)/.test(text)) {
      const guns = text.startsWith('鉄砲');
      text = this.def.botEvacuating(this)
        ? guns ? '敵の鉄砲だ。物陰を通り、木戸の印へ退け' : '敵の槍列を避け、木戸の印へ退け'
        : F.step >= 3
          ? guns ? '敵の鉄砲だ。木戸の内の物陰で待て' : '敵の槍列へ出るな。木戸の内で受けよ'
          : guns ? '敵の鉄砲だ。物陰で待ち、町口を離れるな' : '敵の槍列へ出るな。森隊の列で受けよ';
    }
    // 木戸を押し続けても同じ警告を毎コマ積まない。開閉の判定はそのまま行う。
    if (text === '口に敵がいて、門が閉まらない') {
      if (this.t - (F.gateBlockedNoticeT ?? -99) < 8) return;
      F.gateBlockedNoticeT = this.t;
    }
    if (/敵.*(?:追え|押せ|休ませるな|寄せよ)|敵が退いても堤を下りるな/.test(text)) {
      text = F.step === 2 ? '追いかけるな。城への道を進め' :
        F.step >= 3 ? '追わず、木戸の内で備えよ' :
        '深追いするな。森隊の槍の列を保て';
    }
    if (F.step === 2 && /敵.*(?:向いて構えよ|振り向いて構えよ)/.test(text))
      text = '追手が迫る！　坂道を進み、城へ退け';
    return bark.call(this, text, warn);
  };
  // 矢の警告も既存の三枠へ入れる。任務へ重なる別札と、勝手な見上げをこの戦だけ止める。
  rt.army.hooks.onArrowRain = (volley, under) => {
    if (!under || volley.team === rt.player.u.team || rt.t < 5 || rt.over || rt.ended || !rt.player.u.alive) return;
    if (rt.t - (rt.rainWarnT ?? -99) < 8) return;
    rt.rainWarnT = rt.t;
    // 銃声や退きの合図と同じ持ち場を示す。坂道から町へ戻らせない。
    const F = rt.flags;
    rt.bark(F.step === 2 ? '上から矢！　坂道の印をたどり、城へ退け' :
      F.step >= 3 ? '上から矢！　木戸の内の塀の陰へ退け' :
        '上から矢！　塀や屋敷の陰へ退け', true);
  };
  // 共通の弾込め通知は、一挺目の発砲直後や不発でも呼ばれる。
  // ここで札を八秒占めると、半秒かけて数える enemyGunCue の斉射通知が消える。
  // 志賀は実際の銃声を数えた台詞・札へまとめ、不発は下の専用通知で伝える。
  rt.army.hooks.onFoeReload = () => {};
  // 不発の空音を、味方でも「敵が撃てぬ」と取り違えていた。近くの射手だけを知らせる。
  rt.army.hooks.onGunMisfire = (u) => {
    const F = rt.flags;
    const town = F.step === 1 || F.step === 1.5;
    const castle = F.step === 3 || F.step === 3.5;
    // 銃声の報せと同じく耳までの高さを含め、山の下の空音を近くの不発にしない。
    const ear = rt.camera.position;
    if (rt.over || F.ending || !rt.player.u.alive ||
        Math.hypot(u.pos.x - ear.x, u.pos.y + 1.5 - ear.y, u.pos.z - ear.z) > 45 ||
        rt.t - (F.misfireCueAt ?? -99) < 20) return;
    // 不発の空音より、退く合図と今鳴っている法螺・太鼓・鬨の説明を先にする。
    if ((!town && !castle) || rt.t < Math.max(shigaCommandUntil(F), F.supportVoiceUntil || 0)) return;
    F.misfireCueAt = rt.t;
    const own = u.team === 0;
    const text = own ? '味方の鉄砲が不発。槍の列で支えよ' : '敵の鉄砲が不発。持ち場を離れるな';
    if (town) {
      F.townSoundText = text; F.townSoundUntil = rt.t + 8;
      rt.objProgress('main', text); rt.objProgress('mouth', text);
    } else {
      F.castleSoundText = text; F.castleSoundUntil = rt.t + 8;
      castleProgress(rt, '木戸の内で槍を揃えよ');
      rt.objProgress('mouth', text);
    }
    rt.say(town ? '足軽' : '武藤五郎右衛門', own
      ? '味方の火縄が不発じゃ！　槍の列で鉄砲組を支えよ！'
      : '敵の火縄が不発じゃ！　持ち場を離れるな！', 3.5);
  };
  // 呼び出しの差し替えはこの戦の入れ物だけ。他の戦の台詞・視点には残さない。
  const say = rt.say;
  // 同じ鉄砲組が弾を込め直す。交替する別の組がいるような下知にはしない。
  const volleyCalls = new Map([
    ['放てぇっ！', '鉄砲組、槍の列を狙え、放て！'],
    ['次の組、放て！', '弾込めの済んだ者、町口へ放て！'],
    ['もう一度、揃えて放て！', '鉄砲組、狙いを揃え、もう一度放て！'],
  ]);
  let volleyAt = -99;
  rt.say = function (who, text, dur) {
    // 札と同じく、開戦の合図への応答中は鉄砲組の待機の台詞だけを控える。
    if (who === '織田信治' && this.flags.step === 1 && this.t < this.flags.townSignalUntil &&
        text === 'まだじゃ……撃つな。引きつけよ') return;
    if (who === '織田信治' && /放て/.test(text)) {
      const command = volleyCalls.get(text);
      // 実際の斉射の号令は必ず伝える。直前の自発的な掛け声では消さない。
      if (!command && this.t - volleyAt < 30) return;
      volleyAt = this.t;
      text = command || '鉄砲組、町口へ放て！';
    }
    // 総兵数が減っても、城の木戸を捨てて別の旗へ走らせない。
    if (who === '組頭' && /味方が討ち減らされておる|味方がもう持たぬ/.test(text)) {
      const F = this.flags;
      text = F.step === 2 ? '坂道の印を追って城へ退け。味方と離れるな' :
        F.step >= 3 ? '持ち場の木戸を守れ。城兵の槍の列から離れるな' :
        '森隊の槍の列へ戻れ。町口で味方と受けよ';
    }
    // 合図を伝える予約の間に守将が倒れたら、生き残りが下知を引き継ぐ。
    // 音と任務の札は保ち、討死・負傷退場した本人を話者にしない。
    const F = this.flags;
    const commander = who === '森可成' ? F.moriU : who === '織田信治' ? F.nobuU :
      who === '青地茂綱' ? F.aochiU : null;
    if (commander && (!commander.alive || commander.woundOut || commander.gone)) who = '足軽';
    // 危険時の構え・振り向きの字幕も残し、退く操作が分かるようにする。
    return say.call(this, who, text, dur);
  };
  const player = rt.player, down = rt.playerDown, cameraUpdate = player.updateCamera;
  const canStep = player.canStep;
  player.canStep = function (x0, z0, x, z, y) {
    if (!canStep.call(this, x0, z0, x, z, y)) return false;
    // 道の印の幅へ入るだけで切岸も歩ける扱いになる。地肌から登る時は
    // 一歩の先の上りも調べ、細かい歩幅で土の壁を登り続けるのを防ぐ。
    // 城内の石段・建物の床・梯子は、元の足場の判定に任せる。
    const W = rt.world, h0 = W.heightAt(x0, z0), d = Math.hypot(x - x0, z - z0);
    if (this.u.naka || this.u.climb || rt.flags.step >= 3 || Math.abs(y - h0) > .35 || d < 1e-6) return true;
    const h = W.heightAt(x, z);
    if (h - h0 > d * .75 + .03) return false;
    return W.heightAt(x + (x - x0) / d * 1.2, z + (z - z0) / d * 1.2) - h <= .9;
  };
  const rangeCue = player.updateRangeCue;
  player.updateRangeCue = function (kind) {
    const result = rangeCue.call(this, kind);
    // 退く途中で近くの敵への旋回を勧めない。到達先の案内と重なる小札も消える。
    // 実際に槍が届く印と、敵が迫る向きの警告は残す。
    if (rt.def.botEvacuating(rt) && /へ向く|一歩寄ると届く/.test(this.rangeCue)) this.rangeCue = '';
    return result;
  };
  const slopeLook = new THREE.Vector3(), slopeFrom = new THREE.Vector3(), viewDir = new THREE.Vector3();
  const maxSlope = Math.tan(Math.PI / 6);
  const groundAt = (x, z) => Math.max(rt.world.heightAt(x, z), drawGroundAt(rt.world, x, z));
  const slopeHit = (from, to) => {
    // 端だけが地面の上でも、間の切岸が本人を隠す。近い八点だけを調べる。
    for (let i = 1; i <= 8; i++) {
      const t = i / 8, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      if (from.y + (to.y - from.y) * t < groundAt(x, z) + .25) return (i - 1) / 8;
    }
    return null;
  };
  const stopAtWall = (camera, from) => {
    // 坂で視点を引く時も建物判定を通す。壁の手前に余白を残す。
    const P = camera.position, hit = player.camBlockHit(from, P);
    if (hit === null) return;
    const span = from.distanceTo(P);
    P.lerpVectors(from, P, Math.max(0, hit - .35 / Math.max(.35, span)));
    return true;
  };
  const limitView = (camera, look) => {
    const P = camera.position;
    const dx = P.x - look.x, dz = P.z - look.z, r = Math.hypot(dx, dz);
    const ground = slopeHit(look, P);
    if (r >= 3 && Math.abs(P.y - look.y) <= maxSlope * r && ground === null &&
        player.camBlockHit(look, P) === null) {
      stopAtWall(camera, look);
      camera.up.set(0, 1, 0); camera.lookAt(look); return;
    }
    const nx = r > .01 ? dx / r : -Math.sin(player.yaw);
    const nz = r > .01 ? dz / r : -Math.cos(player.yaw);
    // 真後ろが切岸なら、左右の道側も探す。補正が必要な時だけ、同じ入れ物で調べる。
    let found = false;
    for (let side = 0; side < 7 && !found; side++) {
      const turn = side === 0 ? 0 : (side % 2 ? 1 : -1) * Math.ceil(side / 2) * Math.PI / 4;
      const cx = nx * Math.cos(turn) - nz * Math.sin(turn);
      const cz = nx * Math.sin(turn) + nz * Math.cos(turn);
      // 笠や胴へ寄る候補から選ばず、全身と足場が入る距離を先に探す。
      for (let i = 0; i < 4; i++) {
        const d = 5.9 - i * .9, x = look.x + cx * d, z = look.z + cz * d;
        const y = Math.max(look.y + .25, groundAt(x, z) + .65);
        if (y - look.y > maxSlope * d) continue;
        slopeFrom.set(x, y, z);
        if (player.camBlockHit(look, slopeFrom) !== null || slopeHit(look, slopeFrom) !== null) continue;
        P.copy(slopeFrom); found = true; break;
      }
    }
    // 候補へ引けない場合も、横移動で家の中へ入った視点を壁の手前へ戻す。
    stopAtWall(camera, look);
    const blocked = slopeHit(look, P);
    if (blocked !== null) P.lerpVectors(look, P, Math.max(0, blocked - .03));
    // 切岸や柵で引けない時も、縦だけ振って地面を見下ろさない。
    const span = Math.hypot(P.x - look.x, P.z - look.z);
    if (span < .25) {
      // 木戸で視点と胸の位置が重なったら、長さゼロの視線を作らず門の先を見る。
      look.set(P.x + Math.sin(player.yaw) * 3, P.y, P.z + Math.cos(player.yaw) * 3);
    } else {
      look.y = Math.max(P.y - maxSlope * span, Math.min(P.y + maxSlope * span, look.y));
    }
    camera.up.set(0, 1, 0); camera.lookAt(look);
  };
  // 近い視点の切り替えや直接描画は updateCamera を通らないことがある。
  // 描画の直前にも同じ坂よけを通し、地面を上げるだけで本人を見失わせない。
  const clampDrawCamera = rt.world.clampDrawCamera;
  rt.world.clampDrawCamera = function (camera) {
    clampDrawCamera?.call(this, camera);
    const u = player.u;
    if (!camera.isPerspectiveCamera || !u.alive || u.naka || player.fpK >= .5) return;
    slopeLook.set(u.pos.x, u.pos.y + 1.5, u.pos.z);
    if (slopeHit(slopeLook, camera.position) === null) return;
    limitView(camera, slopeLook);
    player.camPos.copy(camera.position);
    camera.updateMatrixWorld();
  };
  rt.playerDown = function (...args) {
    const result = down.apply(this, args), u = player.u;
    // 討死の前に出た映画の帯を持ち越さず、最後の一撃の方向を広く見せる。
    clearTimeout(this.hud.cineT);
    document.getElementById('cine')?.classList.remove('on');
    if (!u.alive && !u.mounted) {
      u.fallAxis = 'z'; u.fall = 1;
      u.death = { kind: 'side', side: 1, t: 0, pace: 1, floor: true, fwd: false };
    }
    return result;
  };
  const endingView = new THREE.Vector3();
  let endingViewSet = false;
  player.updateCamera = function (dt, camera) {
    try {
      // 共通の終幕視点で地面から離れ、最後に傷を与えた敵へ向く。
      if (!this.u.alive) return cameraUpdate.call(this, dt, camera);
      // 城を守った結びは直前の目線を保ち、主人公と城兵を見せる。
      // 勝利の大きな引きで城の縁へ回り込み、地面だけを映すのを防ぐ。
      if (rt.flags.ending && rt.tracker.main === true) {
        if (!endingViewSet) { endingView.copy(camera.position); endingViewSet = true; }
        camera.position.copy(endingView);
        slopeLook.set(this.u.pos.x, this.u.pos.y + 1.5, this.u.pos.z);
        limitView(camera, slopeLook);
        this.camPos.copy(camera.position);
        return;
      }
      // 戦ごとの上限。共通処理が足す構えの振りも含めて三十度までにする。
      this.pitch = Math.max(-Math.PI / 6 + .06, this.pitch);
      const result = cameraUpdate.call(this, dt, camera);
      camera.getWorldDirection(viewDir);
      slopeLook.set(this.u.pos.x, this.u.pos.y + 1.5, this.u.pos.z);
      // 退く間も、遮りのない目線は保つ。毎回胸へ向け直すと、
      // 追手と味方の重なりや道の先が画面から外れてしまう。
      // 切岸で遮られた時と空だけを映す時は、従来の坂の補正を使う。
      const retreatBlocked = this.fpK < .5 && rt.def.botEvacuating(rt) &&
        (viewDir.y > .3 || slopeHit(slopeLook, camera.position) !== null);
      if (this.fpK < .5 && !this.u.naka && (viewDir.y < -.5 || retreatBlocked)) {
        limitView(camera, slopeLook);
        this.camPos.copy(camera.position);
      } else if (this.fpK < .5) {
        // 町屋も木戸も、浅い目線で壁へ入る前に止める。
        if (stopAtWall(camera, slopeLook)) {
          camera.lookAt(slopeLook);
          this.camPos.copy(camera.position);
        }
      }
      // 壁の手前へ寄せた結果、頭や肩が画面を塞ぐ時は道側へ回す。
      // 室内と一人称は、その場の目線を保つ。新しい形や入れ物は作らない。
      if (this.fpK < .5 && !this.u.naka &&
          Math.hypot(camera.position.x - slopeLook.x, camera.position.z - slopeLook.z) < 3) {
        limitView(camera, slopeLook);
        this.camPos.copy(camera.position);
      }
      // 壁へ寄せた後の注視で、再び真下を向くことがある。最後の向きにも上限を通す。
      // 一人称は位置を動かさず、向いている方角を保つ。室内と討死の目線は元に任せる。
      camera.getWorldDirection(viewDir);
      if (!this.u.naka && Math.abs(viewDir.y) > .5) {
        const horizontal = Math.hypot(viewDir.x, viewDir.z);
        const nx = horizontal > .001 ? viewDir.x / horizontal : Math.sin(this.yaw);
        const nz = horizontal > .001 ? viewDir.z / horizontal : Math.cos(this.yaw);
        slopeFrom.set(camera.position.x + nx * 3,
          camera.position.y + Math.sign(viewDir.y) * maxSlope * 3, camera.position.z + nz * 3);
        camera.up.set(0, 1, 0); camera.lookAt(slopeFrom);
      }
      return result;
    } finally {
      // 横へ回した目線も、このコマの足元の輪・行き先の旗へ渡す。
      // 描く時まで古い行列を残すと、近い視点で本人と印が離れて見える。
      camera.updateMatrixWorld();
    }
  };
  shigaSetup.call(this, rt);
  // 志賀専用の整列指定を有効にする。共通の画面は戦名の印を自動では付けない。
  rt.hud.root.classList.add('shiga');
  // 持ち場を残す指定と、構え釦を敵の脇へ動かす共通の指定が競わないようにする。
  // 志賀の札だけを一つの欄へ収める。支度時に一度作り、戦を離れる時に外す。
  const taskStyle = document.createElement('style');
  taskStyle.textContent = `
/* 明るい町の土でも、操作名と釦の呼び方を同じ濃い墨の上で読めるようにする。 */
html body #hud.shiga:not(.hc) .bottom .slot:not(.locked) {
 background:#14120f; color:#ece4d2;
}
html body #hud.shiga .bottom .slot:not(.locked) em { color:#b9b09c; }
/* 手ほどき中は小地図を描かない。黒い下地だけを出す指定も、この戦では抑える。 */
html body #hud.shiga.novice #minimap { visibility:hidden !important; }
/* 負傷の長い説明で格子の最小幅を広げず、残量と目盛りも命の下地に収める。 */
html body #hud.shiga .bl #h-hp.hp {
 grid-template-columns:minmax(0,1fr) max-content !important;
 width:max(204px,calc(188px * var(--text-scale,1) + 16px));
 min-width:0; max-width:100%;
}
html body #hud.shiga .bl #h-hp.hp i {
 min-width:0; width:100%; max-width:100%;
}
html body #hud.shiga .bl #h-hp.hp em {
 min-width:0; max-width:100%; box-sizing:border-box;
 justify-self:stretch;
 font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
 white-space:normal; word-break:normal; overflow-wrap:anywhere; line-height:1.5;
}
html body #hud.shiga .bl #h-hp.hp em svg { width:18px; height:22px; }
/* 開始札は本文だけ送る。横持ちでは幅と高さを使い、下知と釦を離す。 */
#hud #intro[data-battle="shiga"] .intro-reading {
 flex:1 1 auto; padding-bottom:16px; scroll-padding-bottom:16px; scrollbar-gutter:stable;
}
#hud #intro[data-battle="shiga"] #intro-go { flex-shrink:0; }
#hud #intro[data-battle="shiga"] .intro-people summary {
 min-height:44px; box-sizing:border-box; padding:10px 8px; margin-top:8px;
 font-size:15px; line-height:1.6; color:#f2cd72; text-decoration:underline; cursor:pointer;
}
#hud #intro[data-battle="shiga"] .intro-people summary:focus-visible {
 outline:3px solid #c2a25a; outline-offset:-3px; box-shadow:0 0 0 2px #14120f;
}
@media (max-height:500px) {
 html body #hud #intro[data-battle="shiga"] > .card.card {
  width:min(620px, calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  height:calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  max-height:calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
 }
}
/* 振り向く手ほどき中も、志賀の守る持ち場は読めるままにする。 */
html body #hud.shiga:is(.touch-turn-coach,.dodge-turn-coach) #battle-notices:not(.choosing) {
 visibility:visible !important; pointer-events:auto !important;
}
/* 回避・一時退避の操作だけでは、町口を守る下知と城への退き時が分からない。
   選択中・非表示の札は戻さず、志賀で選ばれた現在の任務一枚だけを残す。 */
html body #hud.shiga:is(.dodge-active,.cover-guidance) #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand):not([hidden]):not(.notice-muted) {
 display:block !important; visibility:visible !important;
}
html body #hud.shiga.wait-guard-active #battle-notices #objectives.keep-guard-task:not(.expand) {
 display:block !important;
}
html body #hud.shiga.working #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand):not([hidden]):not(.notice-muted) {
 display:block !important; visibility:visible !important;
}
/* 矢の警告と持ち場の下知を一緒に読む。共通の回避中の非表示を志賀だけ戻す。 */
html body #hud.shiga.rain-danger #battle-notices #objectives {
 visibility:visible !important;
}
html body #hud.shiga:is(.rain-danger,.dodge-active) #battle-notices #objectives:not(.expand) #obj-list {
 display:block !important;
}
/* 任務と手ほどきに後から固定位置が付いても、同じ欄の流れに戻す。 */
html body #hud.shiga #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; min-width:0 !important; max-width:100% !important;
 height:auto !important; max-height:none !important; flex:0 0 auto; box-sizing:border-box;
}
/* 一覧を開いた時も、小地図の左へそろえて退き先を隠さない。 */
html:root body #hud.shiga.shiga #battle-notices:not(.choosing) > #objectives.ground-order:not(.expand) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; min-width:0 !important; max-width:100% !important;
 box-sizing:border-box; margin:0 !important;
}
@media (min-height:501px) {
 html:root body #hud.shiga #battle-notices:not(.choosing),
 html:root body #hud.shiga.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:auto !important; top:104px !important; right:calc(208px + env(safe-area-inset-right, 0px)) !important;
  width:min(320px, 30vw) !important; max-height:calc(100% - 304px) !important;
 }
 /* 任務だけを中央へ固定する共通指定より、この戦の同じ欄を優先する。 */
 html:root body #hud.shiga #battle-notices:not(.choosing) > #objectives:not(.expand) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; max-width:100% !important; margin:0 !important;
 }
}
/* 台詞の古い固定幅・高さも欄へ収める。親だけ戻しても小地図へはみ出す。 */
html body #hud.shiga #battle-notices #battle-message > :is(#subtitle,.battle-notice) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; min-width:0 !important; max-width:100% !important;
 height:auto !important; min-height:0 !important; max-height:none !important;
 box-sizing:border-box; white-space:normal !important; overflow-wrap:anywhere;
}
html body #hud.shiga.guard-button-help #battle-notices:not(.choosing) #objectives:not(.expand):has(.guard-action-button) {
 position:relative !important; inset:auto !important;
 width:100% !important; max-width:100% !important; box-sizing:border-box;
 padding:6px 8px !important; background:#14120f !important;
 border-left:2px solid #c2a25a !important;
}
#hud.shiga .battle-action .guard-action-button { width:100%; font-size:18px; }
#hud.shiga .battle-action .guard-action-button small { font-size:15px; }
/* 共通の構え手ほどきが任務一覧を隠しても、志賀では持ち場と残り時間を残す。 */
html body #hud.shiga #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) > #obj-list,
html body #hud.shiga #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) > #obj-list li.cur .obj-text {
 display:block !important;
}
html body #hud.shiga #battle-notices #objectives:not(.expand) #obj-list li.cur,
html body #hud.shiga #battle-notices #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
 display:block !important; width:100% !important; min-width:0 !important;
 max-width:100% !important; box-sizing:border-box; float:none !important;
 position:static !important; writing-mode:horizontal-tb !important;
 height:auto !important; max-height:none !important; white-space:normal !important;
 overflow:visible !important; overflow-wrap:anywhere !important; word-break:normal !important;
 -webkit-line-clamp:unset !important; line-clamp:unset !important; line-height:1.5 !important;
}
/* 一覧の縮む幅と、距離の別列を残さない。本文・補足・距離を順に積む。 */
html body #hud.shiga #battle-notices #objectives:not(.expand) > #obj-list {
 width:100% !important; min-width:0 !important; max-width:100% !important;
 margin:0 !important; padding:0 !important; box-sizing:border-box;
}
html body #hud.shiga #battle-notices #objectives:not(.expand) #obj-list li.cur small {
 position:static !important; float:none !important; clear:both;
 width:100% !important; min-width:0 !important; max-width:100% !important;
 box-sizing:border-box; white-space:normal !important; overflow-wrap:anywhere !important;
 word-break:normal !important; height:auto !important; max-height:none !important;
 overflow:visible !important; -webkit-line-clamp:unset !important; line-clamp:unset !important;
 line-height:1.5 !important;
}
/* 閉門の操作と守る条件は、近くの敵が出ても省略せず折り返す。 */
html body #hud.shiga #battle-notices #objectives:not(.expand) #obj-list li.cur > small:not(.goal-place):not(.obj-cue) {
 display:block !important; font-size:max(15px, calc(15px * var(--text-scale, 1))) !important;
}
/* 距離だけを大きくせず、どの印までかを一続きで読む。 */
html body #hud.shiga #battle-notices #objectives:not(.expand):not(.has-action) #obj-list li.cur small.goal-place {
 display:block !important; font-size:max(15px, calc(15px * var(--text-scale, 1))) !important;
}
html body #hud.shiga #battle-notices #objectives:not(.expand) li.cur .obj-now {
 font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
}
/* 行ごとの下地に付く左右の余白も幅へ含め、町口の指図を末尾まで折り返す。 */
html body #hud.shiga:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand):not(.has-action) #obj-list li.cur .obj-now {
 display:block !important; width:auto !important; box-sizing:border-box;
 white-space:normal !important; overflow-wrap:anywhere !important;
}
/* 守る条件と残り時間を、小さな帯に詰めず一続きの文として読む。 */
html body #hud.shiga #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small {
 padding:3px 5px !important; margin:4px 0 0 !important;
 font-size:max(15px, calc(15px * var(--text-scale, 1))) !important;
 line-height:1.6 !important; text-overflow:clip !important;
}
html body #hud.shiga #battle-notices #banner .brush {
 display:block !important; font-size:inherit !important; line-height:1.4 !important;
 white-space:normal !important; overflow-wrap:anywhere !important;
}
/* 釦と持ち場で二行以上になる時も、薄い文字だけを場外へこぼさない。 */
html body #hud.shiga #battle-notices #objectives.has-action:not(.expand) li.cur small.goal-place,
html body #hud.shiga #battle-notices #objectives.has-action:not(.expand) li.cur small.obj-cue { display:none !important; }
/* 二択の間は持ち場の札を重ねず、問いと残り時間を同じ段に収める。 */
@media (min-width:601px) and (max-height:500px) {
 html body #hud.shiga.shiga-choice #battle-notices.choosing {
  max-height:38dvh !important; overflow-y:auto; pointer-events:auto;
 }
 html body #hud.shiga.shiga-choice #battle-notices.choosing #objectives { display:none !important; }
 html body #hud.shiga.shiga-choice #battle-notices #choice { gap:4px 8px; }
 html body #hud.shiga.shiga-choice #battle-notices #choice h5 {
  grid-column:1; grid-row:1; font-size:15px !important;
 }
 html body #hud.shiga.shiga-choice #battle-notices #choice #choice-seconds {
  grid-column:2; grid-row:1; text-align:right; font-size:15px;
 }
 html body #hud.shiga.shiga-choice #battle-notices #choice .choice-help {
  font-size:13px; line-height:1.4;
 }
 html body #hud.shiga.shiga-choice #battle-notices #choice .opt {
  margin-top:0; min-height:48px;
 }
}
@media (max-height:500px) {
 html.touch body #hud.shiga #battle-notices:not(.choosing),
 html.touch body #hud.shiga.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  top:calc(96px + env(safe-area-inset-top, 0px)) !important;
  left:calc(20px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
  width:min(280px, calc(100vw - 200px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))) !important;
  /* 共通の三割の高さでは三行目が欠ける。下の操作を空けて札全体を送れる高さにする。 */
  bottom:auto !important;
  max-height:min(46dvh, calc(100dvh - 192px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))) !important;
  overflow-y:auto; box-sizing:border-box;
 }
 html.touch body #hud.shiga.guard-button-help #battle-notices:not(.choosing) {
  max-height:min(46dvh, calc(100dvh - 192px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))) !important;
 }
}
/* 稲生の一行を使う間は、旧来の守備・回避の指図札を重ねない。一覧と相談は開ける。 */
html:root body #hud.shiga.prog-on.mission-only #battle-notices:not(.choosing) > #objectives:not(.expand),
html:root body #hud.shiga.prog-on.mission-only #battle-notices > :is(#battle-message,#tutorial,#situation,#skiphint) {
 display:none !important;
}
`;
  document.head.appendChild(taskStyle);
  // 未完の稽古は覚えたことにせず、退く間だけ表示から外す。ヒントは残す。
  const drawCard = rt.hud.drawCard;
  rt.hud.drawCard = function () {
    const tutorial = this.tutCur;
    if (rt.def.botEvacuating(rt) && tutorial?.auto) this.tutCur = null;
    try { return drawCard.call(this); }
    finally { this.tutCur = tutorial; }
  };
  const dispose = rt.dispose;
  rt.dispose = function () {
    taskStyle.remove();
    this.hud.root.classList.remove('shiga');
    this.hud.drawCard = drawCard;
    return dispose.call(this);
  };
  // 画面の中央を大きく抜かず、共通の距離判定で目のすぐ前の柱・扉だけを避ける。
  // 共有材質は支度中に一度だけ複製する。地形と床、離れた木戸の姿は残す。
  const nearMats = new Map();
  const solidNear = (source) => {
    if (!source || source.isShaderMaterial || source.transparent || source.userData.camNearSolid) return source;
    if (!nearMats.has(source)) {
      const mat = source.clone();
      // 引き継ぐ近接処理は、複製後も一度だけに保つ。
      if (camNearMaterials.has(source)) camNearMaterials.add(mat);
      mat.onBeforeCompile = source.onBeforeCompile;
      mat.customProgramCacheKey = source.customProgramCacheKey;
      nearMats.set(source, mat);
    }
    return nearMats.get(source);
  };
  rt.scene.traverse((mesh) => {
    if (!mesh.isMesh || !(mesh.userData.camBlock || mesh.userData.camNear || mesh.userData.ext)) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(solidNear) : solidNear(mesh.material);
  });
  // 本丸と水の手の門構えは、この支度の後で場面へ入る。先に同じ材質の複製を通す。
  // 場面だけを巡ると屋根を取りこぼし、近づいた時に葺き板や冠木が欠けて見える。
  for (const gate of [rt.flags.kidoHon, rt.flags.kidoUra]) gate.frame?.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(solidNear) : solidNear(mesh.material);
  });
  // 野地板も近距離の透かしへ入ると、垂木だけ残って空が抜ける。
  // 門の屋根だけは不透明に保つ。柱・扉の視点よけと、共通の木材は変えない。
  const roofMats = new Map();
  const roofMaterial = (source) => {
    if (!roofMats.has(source)) {
      const mat = source.clone();
      // 引き継ぐ近接処理は、複製後も一度だけに保つ。
      if (camNearMaterials.has(source)) camNearMaterials.add(mat);
      mat.onBeforeCompile = source.onBeforeCompile;
      mat.customProgramCacheKey = source.customProgramCacheKey;
      mat.userData.camNearSolid = true;
      roofMats.set(source, mat);
    }
    return roofMats.get(source);
  };
  const keepRoof = (frame) => frame.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    // 冠木門の屋根は柱と別の形。足元から続く柱・控柱を含めない。
    if (mesh.geometry.boundingBox.min.y < 3.2) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(roofMaterial) : roofMaterial(mesh.material);
  });
  for (const frame of rt.scene.children) if (frame.userData.kabuki) keepRoof(frame);
  for (const gate of [rt.flags.kidoHon, rt.flags.kidoUra]) if (gate.frame) keepRoof(gate.frame);
  // 切岸は足場の形を残す。近い土を抜いて空の穴に見せない。
  if (rt.world.terrain) {
    // 大きな多角形の土塊を一面へ敷かず、細粒の地肌に町の踏み跡を重ねる。
    // 一度作った既存の絵を使い、他の戦が使う土の材質は変えない。
    const terrain = rt.world.terrain, soil = dirtTex(true, true);
    rt.world.groundU.tDirt.value = soil;
    // 志賀は地肌の描き方を小さく独立させる。長い共通の地表用の式と、
    // その古い文面への置換を重ねず、既存の草・土・泥と足場の頂点を使う。
    // 陰影・影・昼の霞は通常の材質に任せ、地形の索引と歩く高さは変えない。
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: soil });
    // 地肌の処理が外れても白地へ戻さず、地形の色と細粒の土を残す。
    const tint = terrain.geometry.getAttribute('slopeTint');
    if (tint) { terrain.geometry.setAttribute('color', tint); mat.vertexColors = true; }
    // 標準材質に拡張設定がない時も、地肌の支度を止めない。
    mat.extensions ??= {};
    mat.extensions.derivatives = true;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, rt.world.groundU);
      shader.vertexShader = 'attribute vec3 splat, slopeTint; varying vec3 vShigaGround, vShigaMix, vShigaTint, vShigaN;\n'
        + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vShigaN = normalize(mat3(modelMatrix) * objectNormal);
          vShigaGround = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vShigaMix = splat; vShigaTint = slopeTint;`);
      shader.fragmentShader = `uniform sampler2D tGrass, tDirt, tMud, tMacro, tWear;
        uniform float uWet;
        varying vec3 vShigaGround, vShigaMix, vShigaTint, vShigaN;
        ` + shader.fragmentShader.replace('#include <color_fragment>', '').replace('#include <map_fragment>', `
          vec3 p = vShigaGround;
          vec3 n = abs(normalize(cross(dFdx(p), dFdy(p))));
          vec3 axis = pow(n, vec3(4.0)); axis /= max(0.001, axis.x + axis.y + axis.z);
          // 切岸の縦面にも同じ粒の大きさで土を貼る。上から伸ばした白い筋にしない。
          vec3 soil = texture2D(tDirt, p.zy * 0.23).rgb * axis.x
            + texture2D(tDirt, p.xz * 0.23).rgb * axis.y
            + texture2D(tDirt, p.xy * 0.23).rgb * axis.z;
          float shPatch = 0.5 + 0.5 * sin(p.x * 0.18 + sin(p.z * 0.11) * 2.4)
            * cos(p.z * 0.16 - sin(p.x * 0.09) * 1.8);
          vec3 w = max(vShigaMix, vec3(0.0));
          w.x = min(w.x, clamp((shPatch - 0.28) * 2.2, 0.08, 1.0));
          float wear = texture2D(tWear, (p.xz + 240.0) / 480.0).r;
          w.x *= (1.0 - smoothstep(0.05, 0.75, wear)) * smoothstep(0.4, 0.8, n.y);
          w.z = clamp(w.z + uWet * 0.25, 0.0, 0.8);
          w.y = max(0.0, 1.0 - w.x - w.z);
          w /= max(0.001, w.x + w.y + w.z);
          vec3 grass = texture2D(tGrass, p.xz * 0.23).rgb;
          vec3 mud = texture2D(tMud, p.xz * 0.23).rgb;
          float mottling = mix(0.85, 1.12, texture2D(tMacro, p.xz * 0.023 + 0.37).r);
          // 昼の照明が加わる前の土色。頂点色を白近くまで増幅せず、秋の褐色を残す。
          vec3 tint = clamp(vShigaTint * 1.5, vec3(0.2), vec3(0.75));
          vec3 ground = (grass * w.x + soil * w.y + mud * w.z) * tint;
          // 地面の暗い一色を崩す（10/28）：枯れた黄褐と青い草の大きな斑、十数メートルの明暗、細かな土の濃淡
          float dryK = smoothstep(0.3, 0.72, 0.5 + 0.5 * sin(p.x * 0.065 + 1.3 + sin(p.z * 0.05) * 2.0) * cos(p.z * 0.07 - p.x * 0.03));
          float lightK = 0.5 + 0.5 * sin(p.x * 0.31 + sin(p.z * 0.23) * 1.9) * cos(p.z * 0.27 + sin(p.x * 0.19) * 1.5);
          ground *= mix(vec3(0.9, 1.0, 0.9), vec3(1.7, 1.35, 0.8), dryK * 0.9) * mix(0.7, 1.45, lightK);
          // 城山の切岸も土の一枚面にせず、春日山の CG のように草で覆い、雨溝の筋だけ土を見せる（10/28）
          float steepK = 1.0 - smoothstep(0.45, 0.85, normalize(vShigaN).y);   // 頂点の法線でなめらかに（面ごとの四角い斑にしない）
          float sod = smoothstep(0.38, 0.62, texture2D(tMacro, vec2(p.x * 0.045 + p.z * 0.04, p.y * 0.07) + 0.63).r
            + 0.12 * sin(p.x * 0.7 + p.z * 0.5));
          vec3 grassV = texture2D(tGrass, p.zy * 0.23).rgb * axis.x + texture2D(tGrass, p.xz * 0.23).rgb * axis.y
            + texture2D(tGrass, p.xy * 0.23).rgb * axis.z;
          vec3 turf = grassV * mix(vec3(1.05, 1.25, 0.7), vec3(1.3, 1.15, 0.72), smoothstep(0.3, 0.8, shPatch));
          ground = mix(ground, turf, steepK * sod * 0.85);
          diffuseColor.rgb *= ground * mottling * (1.0 - uWet * 0.18);
        `);
    };
    mat.customProgramCacheKey = () => '志賀の草土と切岸3';
    terrain.material = mat;
    mat.userData.camNearSolid = true;
    mat.needsUpdate = true;
  }
  const shapes = new WeakMap();
  const shape = (source) => {
    if (shapes.has(source)) return shapes.get(source);
    const g = source.clone(), p = g.attributes.position, part = g.attributes.aPart;
    // 兵ごとの並びと動きの属性は元の入れ物を使う（隊の退却・間引きを引き継ぐ）。
    for (const key in source.attributes) if (source.attributes[key].isInstancedBufferAttribute) g.setAttribute(key, source.attributes[key]);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = part.getX(i);
      if (k === 20 && z > -.72) x *= 1.2; // 胸と腹、腰に幅を付ける。
      if (k === 21 || k === 22) {
        const cx = x < 0 ? -.16 : .16, cz = z > 0 ? .6 : -.6;
        const muscle = 1 + .75 * Math.max(0, (y - .25) / .8);
        x = cx + (x - cx) * muscle; z = cz + (z - cz) * muscle;
      }
      if (k === 23 && Math.abs(x) < .025 && z < .9) x *= 1.8; // 鬣の厚み。
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals(); g.computeBoundingSphere(); shapes.set(source, g); return g;
  };
  const pose = (material, horse) => {
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = function (sh, renderer) {
      compile.call(this, sh, renderer);
      // 乗り手と馬を同じ向きへ。首だけ別に向け、列の向きを一様にしない。
      sh.vertexShader = sh.vertexShader.replace('return P;', 'if (kd == 5.0) P.yaw += (sd - 0.5) * 0.42;\n  return P;');
      if (horse) sh.vertexShader = sh.vertexShader.replace('vec3 q = v;', `vec3 q = v;
        if (pt == 23.0) {
          vec3 pivot = vec3(0.0, 1.5, 0.72) * pos;
          float turn = (sd - 0.5) * 0.3 + sin(uAT * 0.65 + sd * 31.0) * 0.08 * uAMotion;
          if (isN < 0.5 && abs(q.x) < 0.045 && q.z < 0.9) {
            q.x += sin(uAT * 1.8 + q.y * 7.0 + sd * 37.0) * 0.025 * uAMotion;
            q.y += (sd - 0.5) * 0.08;
          }
          q = aRotY(turn) * (q - pivot) + pivot;
        }
        if (isN < 0.5 && pt == 20.0 && q.z < -0.74) {
          float tip = clamp((1.4 - q.y) / 0.8, 0.0, 1.0);
          q.x += sin(uAT * (1.1 + sd) + sd * 47.0) * tip * 0.16 * uAMotion;
        }`);
    };
    material.customProgramCacheKey = () => horse ? '志賀の馬の首と尾' : '志賀の馬上の向き';
    material.needsUpdate = true;
  };
  const coat = new THREE.Color(), colors = [0x604331, 0x302720, 0x886344, 0xaaa394, 0x483a2b];
  rt.scene.traverse((node) => {
    const parts = node.army?.parts, horse = parts?.horses;
    if (!horse) return;
    const lod = horse.userData.lod;
    horse.geometry = shape(horse.geometry);
    if (lod) for (const key of ['hi', 'lo', 'xlo', 'xxlo']) lod[key] = shape(lod[key]);
    for (let i = 0; i < parts.riders.length; i++) horse.setColorAt(i, coat.set(colors[parts.riders[i] % colors.length]));
    horse.instanceColor.needsUpdate = true;
    pose(horse.material, true); pose(parts.body.material, false);
  });
  // 説明は開戦前の札に一度だけ添える。次の戦へ呼び出しの差し替えを残さない。
  const intro = rt.hud.intro;
  rt.hud.intro = function (...args) {
    this.intro = intro;
    intro.apply(this, args);
    if (window.__game?.battle !== rt) return;
    const reading = document.querySelector('#intro .intro-reading');
    if (!reading) return;
    const note = document.createElement('p');
    note.textContent = rt.G.lord ? '史実では森可成らが討死しました。信長が早く戻る道は、もしもの筋です。' : '史実では森可成らが討死しました。森隊を救う道は、もしもの筋です。';
    note.style.cssText = 'font-size:15px;line-height:1.6';
    reading.appendChild(note);
  };
};

export { shiga };

// 本丸の比高に合わせて山の地肌も上げる。盛りの裾を町口へ延ばさない。
const LIFT = { x: -30, z: 96, tx: -12, tz: 60, w: 14, R: 32, rise: RISE };
// 南北の本丸と水の手口の肩を支える。東の斜面を広げず、井戸側へ８ｍ延ばす。
const HON_LIFT = { x: HON_C.x, z: URA.z + 8, tx: HON_C.x, tz: GATE_HON.z, w: 10, R: 32, rise: RISE };

let BENCHED = null;
function height(x, z) {
  if (!BENCHED) {
    // 斜めの登り口では３ｍ余の格子が路肩の崖を拾い、道の内側にも急段を作る。
    // 大手の坂だけ腰を広げる。木戸以後と枝道は元の幅で仕上げる。
    const approach = benchRoads(heightRaw, [ROAD.slice(2, ROAD_OUT - 2)], 5, 4);
    BENCHED = benchRoads(approach, ALL_PATHS, 3, 2);
  }
  const h = BENCHED(x, z);
  // 民の避難路（東８４ｍまで）と軍の街道を残し、東８６ｍから砂浜へつなぐ。
  // 湖底を掘らないと、標高零ｍ付近の地肌が水面を覆い、湖が陸続きに見える。
  // 岸より東では水面の下へ連続して下げる。既存の地面だけを使い、形は足さない。
  const shore = SHIGA_LAKE.x - x;
  if (shore >= 8) return h;
  const bed = SHIGA_LAKE.level + Math.max(-3, shore * .3);
  const t = Math.max(0, Math.min(1, (8 - shore) / 8));
  return h + (bed - h) * t * t * (3 - 2 * t);
}
