import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
import { retreatThroughGap } from './bot_retreat.js';
// ======================================================================
// 織田家編　志賀の陣・宇佐山城（元亀元年九月）
// 信長が摂津の野田・福島に出ている間に、浅井・朝倉の三万が湖の西を下って坂本へ出てきた。
// 宇佐山城を守る森可成は、信長の弟・織田信治とともに坂本で迎え撃ち、二人とも討ち死にした。
// 城は残った者たちが守り通し、摂津から戻った信長の前に、浅井・朝倉は比叡山へ上がった。
// 足軽は森可成の手。①坂本の町口で朝倉の先手を迎え撃つ ②大軍に押され、宇佐山城へ退く
// ③宇佐山城の木戸を守る（寄せ手が木戸を破りにかかる）。信長の後詰が来るまで持ちこたえる
// 九月十六日の町口の小勝ち→十九日の両手からの攻撃→城への退き→端城の放火と籠城→二十四日の後詰。
// 日をまたぐ経過は札で示す。両手の位置と木戸の攻防は遊びのための推定復元。
// 向き：東（+x）が琵琶湖。北（-z）から浅井・朝倉が湖の西を下ってくる。南（+z）の山の上に宇佐山城。西に比叡山
// ======================================================================
import { yamaLift, benchRoads } from './yamalift.js';
import * as THREE from 'three';
import { addInterior } from './naka.js';
import { nobori as makeNobori, hut, dou, kabukimon, tawara, ishigaki, dobei, palisade, makeSimpleBatch, finalizeSimpleBatch, makeKitBatch, finalizeKitBatch, solidRect } from './props.js';
import { S as SETTINGS } from './settings.js';
import { flagTexture } from './textures.js';
import { woodTex, leafTex, dirtTex } from './nature.js';
import { rockShape, groundRocks } from './rock_shape.js';
import { RANKS } from './state.js';
import { isTouch } from './touch.js';
import { sfx, signal } from './audio.js';
import { battleEvent, EVENT_RETREAT, EVENT_FIRE_START, EVENT_REINFORCEMENT, EVENT_VOLLEY } from './battle_events.js';
import { sightPoint } from './battle_sight.js';
import { drawGroundAt } from './render_camera.js';
import { gauss, enemyGroup as spawnEnemy, allyGroup, nm, centerOf, wallLine } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
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
import { distToPolyline } from './world.js';
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

// この戦の置き幟だけを控えに入れる。持ち主の兵・開閉する門はまとめない。
function nobori(world, x, z, kind, h = 5) {
  const flag = makeNobori(world, x, z, kind, h);
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
      // 低は同じ形・材質を一束に。画面外の幟は viewCull が一本ずつ外す。
      const key = part.geometry.uuid + ':' + base.uuid + (':' +
        Math.floor(root.position.x / 48) + ':' + Math.floor(root.position.z / 48));
      let group = groups.get(key);
      if (!group) { group = { geo: part.geometry, mat, parts: [] }; groups.set(key, group); }
      group.parts.push(part);
    });
  }
  for (const group of groups.values()) {
    const mesh = new THREE.InstancedMesh(group.geo, group.mat, group.parts.length);
    group.parts.forEach((part, i) => mesh.setMatrixAt(i, part.matrixWorld));
    mesh.castShadow = true;
    mesh.computeBoundingSphere();
    rt.scene.add(mesh);
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
const TOWN_HOMES = [[36, 20, .1], [44, 4, -.2], [48, -14, .2], [34, -24, 0], [2, 24, .3], [-6, 6, -.1], [52, 30, .2]];
// 湖側の刈田。民の避難路（東８２〜８４ｍ）と家の菜園を空ける。
const TOWN_FIELDS = [[66, -42, 16, 18], [68, 10, 12, 18], [66, -108, 16, 18]];
function townPaddy(x, z) {
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

function sakamotoRoofTint(source) {
  const mat = source.clone(), before = source.onBeforeCompile;
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
// 元亀元年には後の坂本城はない。宇佐山城の曲輪にも民を置かない。
const CIVILIAN_TEMPLE = { x: -14, z: -60 };
const civilRoute = (points) => points.map(([x, z]) => ({ x, z }));
// 北の寄せ手から南へ。湖側は水際（東端９４）・町の柵・家・軍の街道を避ける。
// 山側は平らな町の西縁を通り、城の急坂や木戸へ逃げ込まない。
const LAKE_ESCAPE = civilRoute([[82, -40], [84, -10], [84, 16], [84, 28]]);
const TEMPLE_ESCAPE = civilRoute([[-26, -44], [-26, -18], [-26, 12], [-22, 24]]);
const CIVILIAN_BANDS = [
  { x: 82, z: -2, kinds: ['townsman', 'merchant', 'woman', 'child', 'elder'],
    route: LAKE_ESCAPE.slice(2) },
  { x: 80, z: -55, kinds: ['farmer', 'woman', 'child', 'elder'], route: LAKE_ESCAPE },
  { x: 68, z: -85, kinds: ['farmer', 'woman', 'child'], mode: 'inside',
    route: civilRoute([[80, -80], ...LAKE_ESCAPE.map(p => [p.x, p.z])]) },
  { x: -22, z: -45, kinds: ['monk', 'merchant', 'farmer'], route: TEMPLE_ESCAPE },
  { x: CIVILIAN_TEMPLE.x, z: CIVILIAN_TEMPLE.z + 7,
    kinds: ['monk', 'woman', 'child', 'elder'], mode: 'inside', route: TEMPLE_ESCAPE },
];
// 草木を避難路から離すための折れ線は支度前に一度だけ作る。
const CIVILIAN_PATHS = CIVILIAN_BANDS.map(b => [[b.x, b.z], ...b.route.map(p => [p.x, p.z])]);
const USA = { x: HON_C.x, z: HON_C.z, r: 10 };   // 宇佐山城の本丸（縄張りは castles/usayama.js）
const ODA = { flag: 'oda' };
// 黒漆・鉄錆の範囲で寄せ手を見分ける。色の割り振りは遊びのための補完。
const ASA = { flag: 'asakura', armor: 0x302a25, lace: 0x98764b, cloth: 0x76624a };
const AZA = { flag: 'azai', armor: 0x292c25, lace: 0x7b8960, cloth: 0x626b52 };
// 後詰の言い方（信長で遊ぶ時は、自分が上様なので摂津の本隊）
const AID = (rt) => (rt.G.lord ? '摂津の本隊が着くまで' : '上様の後詰まで');
// 足軽大将ほどの身分で出た時は、城兵の一手を預かる
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
// 登城後の静かな待ちを短くする。寄せ手の出発・後詰の移動・本丸の守備条件は保つ。
const HON_HOLD_SECONDS = 100;
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
  return '木戸を開けず、外を見張れ';
}

function castleProgress(rt, text) {
  const F = rt.flags, p = rt.player.u.pos;
  if (F.backed && !F.C.kuruwa.hon.test(p.x, p.z)) text = '本丸の木戸の印へ退け。切岸へ寄るな';
  else if (F.backedNi && !F.C.kuruwa.ni.test(p.x, p.z) && !F.C.kuruwa.hon.test(p.x, p.z)) text = '二の丸の木戸の印へ退け';
  else {
    const post = F.backed ? '本丸' : F.backedNi ? '二の丸' : '大手';
    text = `${post}木戸を守れ。${text}`;
  }
  rt.objProgress('main', text);
  // 携帯では下知の札が主の任務より先に出る。見えている札にも守りの条件を添える。
  // 閉める下知や、外の守兵を待つ知らせを、守った秒数で隠さない。
  if (F.shut && F.shut.G.opened && !F.shut.G.breached && F.shut.test(p.x, p.z)) return;
  if (!F.backedNi && F.gateMk.opened && !F.gateMk.breached) {
    rt.objProgress('inner', '大手木戸へ寄り「門を閉める」を押せ');
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
// 史実の比高約２５０ｍは、縮めた水平距離に合わせ表示を三分の一にする。曲輪の段差は保つ。
const TOWN_Y = baseTerrain(TOWN.x, TOWN.z);
const RISE = TOWN_Y + 250 / 3 - HON_LEVEL;
const SAN_Y = SAN_LEVEL + RISE, NI_Y = NI_LEVEL + RISE, HON_Y = HON_LEVEL + RISE;
const ARC_Y = SAN_Y - 2;
const ROAD_OUT = ROAD.findIndex(p=>p[0]===GATE_OUT.x && p[1]===GATE_OUT.z);
const ROAD_HON = ROAD.findIndex(p=>p[0]===GATE_HON.x && p[1]===GATE_HON.z);
const APPROACH_LENGTH = ROAD.slice(2,ROAD_OUT+1).reduce((n,p,i,a)=>n+(i?Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1]):0),0);
const ARC_APPROACH_LENGTH = ROAD.slice(2,ROAD_OUT-2).reduce((n,p,i,a)=>n+(i?Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1]):0),0);
// 退く猶予も実寸の坂道に合わせる。歩みと折り返し・追手への構えの分を見込む。
const RETREAT_TIME = Math.ceil(APPROACH_LENGTH / 2.8) + 60;
// 縁のすぐ外を一律に下げる段差を作らず、切岸を曲輪の床へ連続してつなぐ。
// 木戸脇で地面の格子が低い縁を拾い、城内まで溝になるのを防ぐ。
const USA_PLAN = { ...USAYAMA_PLAN, continuousEdges: true, paths: USAYAMA_PLAN.paths.map(p => ({ ...p, pts: p.pts === CASTLE_ROAD ? ROAD : p.pts })), kuruwa: USAYAMA_PLAN.kuruwa.map(k => ({...k, level:k.level + RISE})),
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
function liftedTerrain(x,z) {
  let h = baseTerrain(x,z) + Math.max(yamaLift(x,z,LIFT), yamaLift(x,z,HON_LIFT));
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
  for(const [x,z] of [[62,-64],[68,-91],[59,-120]]) hut(W,x,z,6,4,0,{batch:villageBatch,minka:false});
  const fields=[];
  for(const [x,z] of [[65,-35],[68,-48],[73,-68]]) fields.push({x,y:W.heightAt(x,z)+.06,z,w:10,h:.1,d:8,rot:0});
  const boxGeo=new THREE.BoxGeometry(1,1,1), shade=new THREE.Color();
  const instance=(parts,color,wood=false) => {
    const mesh=new THREE.InstancedMesh(boxGeo,new THREE.MeshLambertMaterial({color,map:wood?woodTex():null}),parts.length), dummy=new THREE.Object3D();
    parts.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,p.rot);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(wood) mesh.setColorAt(i,shade.setRGB(p.tone,p.tone,p.tone));});
    mesh.receiveShadow=true;mesh.userData.camBlock=parts!==fields;rt.scene.add(mesh);
  };
  // 石段と槽は石、板壁と屋根は木。同じ形・材質を使い回す。
  const wooden=boxes.splice(0,boxes.length-4-10-12);
  instance(wooden,0x9a8c79,true);instance(boxes,0x858075);instance(fields,0x8c8052);
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
  const V = { n: 0, t0: rt.t, last: -99 }, shots = o.shots || 3;
  const guns = () => (o.guns() || []).filter((g) => g && g.count > 0 && !g.routed);
  for (const g of guns()) g.holdFire = true;
  const tick = () => {
    if (rt.over || rt.flags.ending) return;
    const G = guns();
    if (!G.length) return;
    if (V.n >= shots || rt.t - V.t0 > (o.until || 150)) { for (const g of G) g.holdFire = false; return; }
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
    if (!V.warn && near < r + 28) { V.warn = true; rt.say(o.who, o.wait || 'まだじゃ……撃つな。引きつけよ', 2.5); }
    if (hit.length && rt.t - V.last >= (o.interval || 8)) {
      const ready = [];
      for (const g of G) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.gone && !u.noTarget && u.type === 'gun' && !u.sidearm && !u.reload && u.gunAmmo !== 0) ready.push({ u, ammo: u.gunAmmo ?? 20 });
      if (!ready.length) { rt.after(0.4, tick); return; }
      V.last = rt.t; V.n++;
      for (const g of G) g.holdFire = false;
      rt.say(o.who, V.n === 1 ? (o.fire || '放てぇっ！') : V.n === 2 ? '次の組、放て！' : 'もう一度、揃えて放て！', 1.6);
      const first = V.n === 1;
      rt.after(1.2, () => {
        if (rt.flags.ending || rt.over) return;
        let fired = false;
        for (const q of ready) if (q.u.gunAmmo < q.ammo) { fired = true; break; }
        if (!fired) { V.n--; return; }
        battleEvent(rt, EVENT_VOLLEY, at, G[0], 0, false, '味方の鉄砲が一斉に放たれた');
        if (first && o.banner) rt.bark(o.banner[0] + '。' + o.banner[1]);
        for (const c of (o.clash ? o.clash(rt) : null) || []) if (c && c.volley) c.volley(o.side || 'A');
        if (!o.noMorale) for (const g of hit) if (g.count > 0 && !g.routed) g.morale = Math.max(0, g.morale - (o.hit || 14));
      });
      rt.after(1.6, () => { if (!rt.flags.ending && !rt.over && V.n < shots) for (const g of guns()) g.holdFire = true; });
    }
    rt.after(0.4, tick);
  };
  rt.after(0.4, tick);
  return V;
}

const shiga = {
  // 共通の軽い民の仕組みだけで描く。兵の名簿・人数・戦功には加えない。
  civilianCrowd: { bands: CIVILIAN_BANDS },
  compactIntro: true,
  introTaskFirst: true, // 城や人物の紹介より先に、最初の持ち場と勝つ条件を読む。
  introPeopleFolded: true,
  noUnitContrast: true, // 体から離れる白い人型を出さず、敵味方の頭上の印を残す。
  nearLongWeaponRadius: 10, // 後列の長柄も肩越しへ届く。描く間だけ避け、兵と当たりは残す。
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
    return 'まず「森隊の列」の印へ。敵を向いて槍を構え、町口を守れ。退き太鼓が鳴ったら道の印をたどって城へ。';
  },
  guardButtonText: '押して かまえる',
  waitGuardButtonText: '押し続けて ふせぐ',
  // 木戸までの道のりと、目の前の案内印までの距離を混同させない。
  distanceText(rt, distance) {
    const F = rt.flags;
    const place = F.step === 2 ? F.slopeAlly ? '味方の列' :
      !F.retreatIdx ? '坂道の入口' : F.retreatIdx < F.retreatPath.length - 3 ? '次の角' : '木戸の内' :
      F.step < 2 ? '森隊の列' : '守る持ち場';
    if (F.step >= 3 && distance < 3) return castleWatchText(rt);
    if (F.step < 2 && distance < 3) return '持ち場で敵を向いて構えよ';
    return distance < 3 ? `${place}はすぐ先` : `${place}まで約${Math.round(distance)}メートル`;
  },
  taskDetails: true, // 携帯でも守りの条件と残り時間を読めるようにする。
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
      const guard = isTouch ? '長押しの釦で防ぐ。' : SETTINGS.guardToggle ?
        '右クリックで構える。' : '右クリックを押し続ける。';
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
  singleRetreatArrow: true, // 乱戦を横切る点線を短い矢印一本にし、行き先の旗は残す。
  dodgeAvoidNotices: true,
  dodgeTurnLabel: (_rt, right, touch) => touch
    ? `${right ? '右' : '左'}へなぞって振り向く`
    : `マウスを${right ? '右' : '左'}へ動かして振り向く`,
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
    if (F.slopeAlly) return '味方へ';
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
      if (F.slopeAlly) return '味方の列へ';
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
    if (F.step === 2) return F.slopeAlly ? 'slopeBack' : 'usa';
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
  // 長い登りの後に百秒＋五十秒の守りがある。共通の八分で途中を切らない。
  // 城内を移る猶予も含め五分まで。期限は段が変わっても延ばさず、未達なら共通の敗北へ。
  pacingWait: (rt) => !rt.flags.ending && (rt.flags.step === 3 || rt.flags.step === 3.5) && rt.t < rt.flags.siegeDeadline,
  botEvacuating: (rt) => rt.flags.step === 2 ||
    (rt.flags.backed && !rt.flags.C.kuruwa.hon.test(rt.player.u.pos.x, rt.player.u.pos.z)) ||
    (rt.flags.backedNi && !rt.flags.C.kuruwa.ni.test(rt.player.u.pos.x, rt.player.u.pos.z) && !rt.flags.C.kuruwa.hon.test(rt.player.u.pos.x, rt.player.u.pos.z)),
  taisho: { a: null, b: { def: true } }, // 城の守りと後詰まで、戦の定義で終わりを決める。
  noWake: true,
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
  spawn: { x: TOWN.x + 4, z: TOWN.z + 8, heading: Math.PI },
  world: {
    seed: 15709,
    maxWalkDrop: 1.2, // 路肩から横へ退く一歩で、切岸の下へ落ちない。
    gateRoofBacking: true, // 葺き板の下を野地板で閉じ、木戸の屋根越しに空を見せない。
    lowArmyDetail: true, // 低だけ遠い兵の細部を早めに替え、人数と前線を保つ。
    // 二十メートルより先は既存の軽い甲冑へ。骨と斬り合い・前線の人数は保つ。
    lowHumanDetail: 20,
    wind: [-0.3, 0.9], // 湖の北から吹く風を、旗と煙にもそろえる。
    time: 'day',
    fogFar: 320, // 登りから見下ろす町と次の折り返しを、昼の霞の中にも残す。
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
    slopeForest: .75, cliffRock: .1, // 杉と紅葉の密林を主体にし、露岩を抑える。
    slopeForestTint: true, // 山の基本色と沢の陰を既存の地表へ渡す。
    water: { x: 94, level: -2.4 },
    paths: ALL_PATHS,
    moveWay: shigaRunnerWay,
    runnerWay: shigaRunnerWay,
    terrainTags: true,   // 坂・道の速さを効かせる（曲輪の縁の切岸は登れず、道を通る）
    terrainTriangles: true, // 切岸の足場・小道具・目線を、描く地面の三角形と同じ高さにする。
    terrainContactView: true, // 描く直前にも視点の中央と四隅を地面の上へ戻し、坂の裏を映さない。
    groundHalf: 240, // 南へ２０４ｍの本丸と２１４ｍの井戸を、地面の端の内へ収める。
    keepTerrainGrid: true, // 携帯でも描く格子と足場をそろえ、切岸で柵や兵を浮かせない。
    height,
    tint(x, z, h, c) {
      // 緑一色にせず、踏み固めた茶の地と草の斑を混ぜる（色から土と草の割合が決まる）。
      const patch = .5 + .5 * Math.sin(x * .083 + Math.sin(z * .047) * 1.7) * Math.cos(z * .092 - x * .026);
      if (c.g > c.r) {
        c.setRGB(.30 + patch * .055, .37 + patch * .055, .23 + patch * .045);
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
        else if (townPaddy(x, z)) c.setRGB(.36 + patch * .035, .32 + patch * .025, .20);
        else c.setRGB(.30 + patch * .055, .37 + patch * .055, .23 + patch * .045);
      }
    },
    clear: (x, z) => CIVILIAN_BANDS.some(b => Math.hypot(x - b.x, z - b.z) < 6) || CIVILIAN_PATHS.some(p => distToPolyline(x, z, p) < 4) || USA_PLAN.kuruwa.some(k => pointInUsa(k.poly,x,z)) || ALL_PATHS.some(p => distToPolyline(x,z,p)<4) || (Math.abs(x - TOWN.x) < 50 && z > -70 && z < 60) || (x > -48 && x < 6 && z > 64 && z < 116) || distToPolyline(x, z, PATH_WELL) < 5 || (x > -20 && x < 30 && z > 40 && z < 90) || Math.hypot(x - 40, z + 152) < 22 || Math.hypot(x + 34, z + 150) < 22,
    trees: 520,
    layeredNeedles: true, // 既存の枝の起伏で、杉を積んだ円錐の形に見せない。
    raggedNeedles: true,
    softFarNeedles: true,
    unevenCrowns: true, // 松・雑木も共有の葉房を崩し、刈り込んだ塊の輪郭を和らげる。
    // 林の追加の株も含めて道から離し、近い樹冠で坂と下の段の兵を隠さない。
    treePadMul: 2.2,
    tufts: 3400,
    treeDensity: (x, z) => (x > -30 && x < 70 && z > -80 && z < 60 ? 0.15 : 1),
    groves: [{ x: -40, z: 0, r: 14, n: 20 }, { x: 50, z: 70, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && (z < -140 || x < -90),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 志賀の昼は陰の形を残す。補助光で土や茅まで白く照らし過ぎない。
    const lookOf = W.lookOf.bind(W);
    W.lookOf = (key) => {
      const look = lookOf(key);
      if (key === 'day') {
        look.hemiI = 1.3; look.hemiGround.setHex(0x81745a);
        look.sunI = 1.8; look.sunDir.set(45, 110, -35).normalize();
      }
      return look;
    };
    // 地面すれすれの細い影の筋を抑え、人物の影は残す。
    W.sun.shadow.normalBias = .12;
    W.sun.shadow.bias = -.0002;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { usayamaSite: 'HIST_A', sakamoto: 'HIST_A', mori: 'HIST_A', fire: 'HIST_A', kuruwa: 'HIST_B', twoFronts: 'HIST_B', volley: 'GAME_C' };
    F.waves = [];
    F.step = 0; F.ek = 0; F.ak = 0; F.rescued = true; // この戦では致命傷から立ち上がる救済を使わない。
    // ---- 坂本の町（湖べりの町屋） ----
    let houseWallMat = null, houseRoofMat = null;
    const cameraHomes = [], cameraBlock = W.cameraBlockFraction;
    // 屋根は通れる門の口とは別の体積で避ける。面の判定を待つ間も
    // 軒の裏へ視点が抜けず、柱の間は今までどおり見通せる。
    const cameraGateRoof = (x, z, width, rot) => cameraHomes.push({
      x, z, y: W.heightAt(x, z), c: Math.cos(rot), s: Math.sin(rot),
      w: width / 2 + 1.6, d: 2.1, bottom: 3.25, h: 4.9,
    });
    for (const [x, z, r] of TOWN_HOMES) {
      const house = hut(W, x, z, 7, 5, r, { wall: 0x7b6448, groundedHome: true });
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
    }
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
    F.C = buildCastlePlan(rt, USA_PLAN, { baseHeight: liftedTerrain, edgeW: 3, skipWalls: USA_PLAN.kuruwa.map(k=>k.id), buildTowers: true, towerKind: 'ro', team: 0, life:false });
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
    // 森家の鶴丸で指物・隊旗・備の旗を揃える。具足と陣羽織、十文字槍と豪傑の型は本人の表を使う。
    // 鶴丸の根拠：可児市「可成寺」。この戦での旗の配り方は復元。
    // https://www.city.kani.lg.jp/24538.htm
    F.mori = allyGroup(rt, { name: '森可成の手', fixed: true, anchor: { x: TOWN.x, z: TOWN.z - 6 }, facing: Math.PI, width: 5, aggro: 10, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '森可成', invuln: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }], { flag: 'tsuru' }));
    F.moriU = F.mori.units[0];
    F.nobuharu = allyGroup(rt, { name: '織田信治の手', fixed: true, anchor: { ...NOBUHARU_POST }, facing: Math.PI, yariRanks: 3, aggro: 10, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '織田信治', invuln: true, hat: 'kabuto_m', haori: 0x6a1a14 } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], ODA));
    F.nobuU = F.nobuharu.units[0];
    // 青地茂綱の手（信長公記に町口での討死が記される）
    F.sakai = allyGroup(rt, { name: '青地茂綱の手', fixed: true, anchor: { ...AOCHI_POST }, facing: Math.PI, width: 4, aggro: 10, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '青地茂綱', invuln: true, hat: 'kabuto_g', haori: 0x5a2a1c } }, { type: 'ashigaru', n: 10 }], ODA));
    F.aochiU = F.sakai.units[0];
    // 城に残る者（武藤五郎右衛門ら）
    F.keep = allyGroup(rt, { name: '宇佐山城の守り', fixed: true, anchor: { x: -8, z: 56 }, facing: GA, width: 4, aggro: 10, formation: 'yari' },
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
    F.host = [DA(24, -150, 40, 16, 320, 0, ASA.armor, 'asakura', 15791), DA(-20, -160, 36, 14, 280, 0.2, AZA.armor, 'azai', 15792), DA(60, -170, 30, 12, 220, -0.1, ASA.armor, 'asakura', 15793)];
    // 町口の向こうに、霧に重なる旗と軽い兵の列を幾重にも置く。
    for (let row = 0; row < 4; row++) {
      F.host.push(DA(-12 + Math.sin(row * 2.1) * 9, -88 - row * 28, 72, 26, 320, Math.sin(row * 1.7) * .12, row % 2 ? AZA.armor : ASA.armor,
        row % 2 ? 'azai' : 'asakura', 15810 + row));
      for (let col = 0; col < 7; col++) rt.scene.add(nobori(W, -48 + col * 18 + Math.sin(col * 2.3 + row) * 2,
        -88 - row * 24 + Math.sin(col * 1.7 + row * 2) * 4, (row + col) % 2 ? 'azai' : 'asakura', 7));
    }
    // 浅井・朝倉の本陣（北の奥）：朝倉義景と浅井長政。見に行けば大将と旗本がいる（控えは軽い兵）
    F.campA = camp(rt, { x: 40, z: -152, facing: 0, team: 1, faction: 'asakura', mon: 'asakura', armor: ASA.armor, general: { name: '朝倉義景', hat: 'kabuto_m', haori: 0x5a4020 }, guard: 15, reserve: 300, runTo: { x: 26, z: -80 } });
    F.campB = camp(rt, { x: -34, z: -150, facing: 0.1, team: 1, faction: 'azai', mon: 'azai', armor: AZA.armor, general: { name: '浅井長政', hat: 'kabuto_m', haori: 0x2a2a3a }, guard: 15, reserve: 260, runTo: { x: 0, z: -80 } });
    // 昼の常設の焚火は置かない。斜面に浮く火を消し、端城への放火は後の段で起こす。
    // 本陣の旗本は、陣幕の前で整った陣形のまま待つ（寄って来た者だけを相手にする）
    for (const c of [F.campA, F.campB]) if (c && c.guard) { c.guard.stay = true; c.guard.formation = 'line'; }
        // ---- 町口の戦いの部隊（butai.js）：前に立つ名のある組（本物）の後ろの本隊。本物はほとんど出さず、遠くで押し合う軽い作り ----
    const mkB = (o, real) => capReal(makeButai(rt, { real, ...o }), real);
    F.bMori = mkB({ name: '森可成の手の本隊', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 400, armor: 0x2b3140, flag: 'tsuru', at: { x: TOWN.x - 2, z: TOWN.z + 16 }, facing: Math.PI }, 0);
    F.bNobu = mkB({ name: '織田信治の手の本隊', team: 0, faction: 'oda', kind: 'ashigaru', nominal: 250, armor: 0x2b3140, flag: 'oda', at: { x: TOWN.x + 30, z: TOWN.z + 12 }, facing: Math.PI }, 0);
    F.bAsa = mkB({ name: '朝倉の先手の本隊', team: 1, faction: 'asakura', kind: 'ashigaru', nominal: 500, armor: ASA.armor, flag: 'asakura', at: { x: 28, z: -96 }, facing: 0 }, 0);
    F.bAza = mkB({ name: '浅井の本隊', team: 1, faction: 'azai', kind: 'ashigaru', nominal: 450, armor: AZA.armor, flag: 'azai', at: { x: -22, z: -92 }, facing: 0.15 }, 0);
    for (const b of [F.bMori, F.bNobu, F.bAsa, F.bAza]) b.order({ id: 'hold' });

    F.bWing = mkB({ name: '尾根を回る浅井の手', team: 1, faction: 'azai', kind: 'ashigaru', nominal: 260, armor: AZA.armor, flag: 'azai', at: { x: -74, z: -120 }, facing: 0 }, 0);
    F.bWing.order({ id: 'hold' });
    const roster = {};
    const roles = [
      ['朝倉の先手', ASA, 22, -42, 20], ['朝倉の二の手', ASA, 44, -68, 12],
      // 十九日の二隊は北の空き地に控える。下知から二十秒ほどで町口へ届く位置に置く。
      ['正面から押す朝倉勢', ASA, 32, -54, 8], ['山側から押す浅井勢', AZA, -35, -40, 8],
      ['浅井の手', AZA, -24, -104, 10], ['追いすがる浅井勢', AZA, 22, -36, 3],
      // 城攻めの控えも町口の北から歩く。味方の退路の先へ敵を置かない。
      ['城へ寄せる朝倉勢', ASA, 26, -80, 10], ['城へ寄せる浅井勢', AZA, 26, -94, 10],
      ['朝倉の新手', ASA, 26, -108, 10], ['木戸へ迫る最後の寄せ手', ASA, 26, -122, 8],
      ['街道を南へ抜ける朝倉の手', ASA, 60, -104, 8],
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
    }
    F.roster = roster;
    KIT.backOf(rt, roster['朝倉の先手'], { flag: 'asakura', armor: ASA.armor, w: 24, depth: 12, count: 120, seed: 15794 });
    KIT.backOf(rt, roster['朝倉の二の手'], { flag: 'asakura', armor: ASA.armor, w: 20, depth: 10, count: 90, seed: 15797 });
    // 同じ人数の両翼を町口へ寄せ、共通の突き・受け・引きで前列の圧力をつなぐ。
    F.lines = lines(rt, [
      { x: -8, z: -14, facing: Math.PI, w: 24, measuredMelee: true, seed: 15795, A: ['oda', 0x2b3140, 90, 'oda'], B: ['azai', AZA.armor, 180, 'azai'], flagRateB: .25, surge: false },
      { x: 54, z: -18, facing: Math.PI, w: 20, measuredMelee: true, seed: 15796, A: ['oda', 0x2b3140, 80, 'oda'], B: ['asakura', ASA.armor, 160, 'asakura'], flagRateB: .25, gunsB: true, surge: false },
    ]);

    // 九月十六日・十九日には信長は摂津。後詰は二十四日の札まで姿を出さない。
    F.aid = W.addDistantArmy({ x: 30, z: 190, w: 18, d: 24, count: 180, facing: Math.PI, armor: 0x2b3140, flagTex: flagTexture('oda'), mon: 'oda', team: 0, seed: 15924 });
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
    rt.setPhase('brief');
    rt.banner('坂本へ迫る三万の旗', '守る兵は千に満たぬ。森隊と町口を支えよ');
    rt.obj('main', '森隊の槍の列に入り、町口を守れ', 'main');
    rt.say('森可成', rt.G.lord ? '敵は浅井・朝倉の三万！　殿、わしらが町口を支えまする！' : '敵は浅井・朝倉の三万！　殿は摂津じゃ。わしの槍の列へ入れ！', 4);
    rt.marker('mori', TOWN_POST, '森隊の槍の列', { guideRadius: 3, hideNear: 3, hideOnArrival: true });
    rt.after(4.5, () => { if (F.step === 0) rt.say('織田信治', '湖側はわしが受ける。森殿の列から離れるな！', 3); });
    rt.after(8, () => { if (!F.ending && !rt.over) this.first(rt); });
  },

  // ① 朝倉の先手を迎え撃つ
  first(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('first');
    // 本人を囲む数は、共通の槍の間合いに従う。
    // 攻撃人数は共通の間合い判定に従う。本人だけを二人に制限しない。
    rt.marker('mori', TOWN_POST, '守る町口・森隊の列', { guideRadius: 3, hideNear: 3, hideOnArrival: true });
    signal('hajime', rt.distTo(TOWN_POST), 0.9);
    rt.banner('九月十六日・坂本の町口', '湖の西の道を、朝倉の旗が下ってくる');
    rt.obj('main', '開戦の法螺と太鼓。町口で先手を迎え撃て', 'main');
    for (const h of F.host) h.advance(40, 60);
    // 朝倉・浅井の本隊が町口の前の野を埋める（軽い作り。町口の斬り合いは名のある組の本物だけ。本隊は混ぜない）
    F.bAsa.order({ id: 'move', to: { x: 28, z: -50 } });
    F.bAza.order({ id: 'move', to: { x: -12, z: -54 } });
    F.clashT = true;
    const g = enemyGroup(rt, { faction: 'asakura', name: '朝倉の先手', anchor: { x: 22, z: -70 }, marchTo: { x: 22, z: TOWN.z - 10 }, facing: 0, order: 'attack', seekRange: 90, aggro: 14, width: 16, morale: 95, fleeDir: { x: 0, z: -1 }, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '朝倉の侍大将' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'bow', n: 3 }], ASA));
    F.w1 = g;
    // 町口の左右では、森・信治の手の後ろの者と朝倉の大軍が押し合う（軽い作り）
    F.lines.forEach((c, i) => rt.after(6 + i * 2, () => c.go()));
    rt.marker('w1', centerOf(g), () => `朝倉の先手`, { red: true, group: g });
    rt.say('森可成', '開戦の法螺じゃ！　槍先を揃え、町口を渡すな！', 3);
    // 勝ち筋：町口は狭く、大軍でも横に広がれぬ。口を塞いで鉄砲で頭を叩く
    rt.after(8, () => { if (F.step === 1 && !F.ending) rt.say('青地茂綱', '山側はわしが守る！　敵を追って列を空けるな！', 3); });
    rt.obj('mouth', '町口を守れ。深追いするな', 'order');
    // 一斉射：信治の鉄砲組を町口の前に並べ、先手が寄せた所で放つ（元亀元年、鉄砲はまだ少ない）
    volleyScene(rt, { guns: () => [F.guns], at: { x: TOWN.x + 6, z: TOWN.z - 14 }, r: 34, who: '織田信治', shots: 3, interval: 30, noMorale: true,
      banner: ['一斉射', '町口の鉄砲が先手を撃つ'], clash: () => F.lines });
    // 二の手も北の控えから歩く。到着に三十秒ほど要るため、先手の段の途中で出す。
    rt.after(18, () => {
      if (F.step !== 1) return;
      F.w1b = enemyGroup(rt, { faction: 'asakura', name: '朝倉の二の手', anchor: { x: 44, z: -70 }, marchTo: { x: 44, z: TOWN.z - 10 }, facing: 0, order: 'attack', seekRange: 90, aggro: 14, width: 12, morale: 90, fleeDir: { x: 0, z: -1 } },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 2 }], ASA));
      rt.marker('w1b', centerOf(F.w1b), () => `朝倉の二の手`, { red: true, group: F.w1b });
      rt.say('織田信治', '湖べりからも来るぞ！', 2.5);
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
      const W = rt.world;
      W.mood = 'morning'; W.setTime('day');
      W.cloudPhase = (W.cloudPhase + 1700) % 20000;
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
    if (gone(F.w1) && gone(F.w1b)) rt.award((t) => t.side.push('朝倉の先手を退けた'), '朝倉の先手を退けた');
    for (const h of F.host) h.advance(30, 50);
    F.stepT = rt.t;
    // 可成が敵を受けて動いても、守る印は家の方へ追わせず同じ町口へ残す。
    rt.marker('mori', TOWN_POST, '守る町口・森隊の列', { h: 3, guideRadius: 3, hideNear: 3, hideOnArrival: true });
    rt.obj('main', '敵の突撃太鼓。両手の敵を町口で受けよ', 'main');
    rt.obj('mouth', '町口を守れ。味方の退き口を保て', 'order');
    rt.banner('九月十九日・両手の寄せ', '浅井・朝倉が両手から押し寄せる');
    rt.say('森可成', '敵の突撃太鼓じゃ！　両手から来るぞ、退き口を保て！', 4);
    for (const c of F.lines || []) c.push('B', 0.7);
    F.twoHands = [
      enemyGroup(rt, { faction: 'asakura', name: '正面から押す朝倉勢', anchor: { x: 24, z: -48 }, marchTo: { x: 24, z: TOWN.z - 10 }, facing: 0, order: 'attack', seekRange: 75, aggro: 12, morale: 95 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], ASA)),
      enemyGroup(rt, { faction: 'azai', name: '山側から押す浅井勢', anchor: { x: -35, z: -12 }, marchTo: { x: TOWN.x - 10, z: TOWN.z - 6 }, facing: Math.PI / 2, order: 'attack', seekRange: 75, aggro: 12, morale: 95 }, dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], AZA)),
    ];
    for (const g of F.twoHands) g.fire = true;
    // 寄せ手の早打ちと鬨は出陣時だけ。聞こえる遠さは既存の合成音で決める。
    signal('kakari', rt.distTo(F.twoHands[0].anchor), 0.85);
    rt.after(2.4, () => {
      if (!rt.over && !F.ending && F.step === 1.5 && !gone(F.twoHands[0])) rt.army.play('toki', F.twoHands[0].anchor, 0.7);
    });
    // 城攻めの控えは退く味方の後から出す。先に大手道を塞がせない。
  },
  siegeMarch(rt, i) {
    const F = rt.flags;
    const name = ['城へ寄せる朝倉勢', '城へ寄せる浅井勢', '朝倉の新手', '木戸へ迫る最後の寄せ手'][i];
    const g = F.roster[name];
    if (!g || gone(g) || g._siegeMarch) return;
    g._siegeMarch = true;
    this.castleAdvance(rt, g);
    rt.marker('x' + i, centerOf(g), g.name, { red: true, group: g });
  },
  // 町口の敵も切岸を直進せず、大手道から順に木戸を攻める。
  castleAdvance(rt, g, start = 2) {
    if (!g || gone(g)) return;
    const F = rt.flags;
    const at = {}; roadProjection(g.anchor, at);
    // 通り過ぎた木戸が背後で閉じても、坂を戻らず次の木戸へ寄せる。
    const gate = F.gates.find((s) => s.alive && !s.opened && gateRoadIndex(s) >= at.s - .15);
    const found = gate ? gateRoadIndex(gate) : ROAD.length - 1;
    const end = found < 0 ? ROAD.length - 1 : found;
    start = Math.min(Math.max(start, Math.ceil(at.s)), end);
    g.order = 'path'; g.path = [[g.anchor.x, g.anchor.z], ...ROAD.slice(start, end + 1)]; g.pathIdx = 0;
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
      else q.order = F.step < 3 ? 'hold' : gate ? 'assault' : 'attack';
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
    rt.banner('城はまだ落ちぬ', '端城は燃えても、奥の木戸は渡すな');
    rt.say('肥田彦左衛門', '城を出るな。後詰の旗が見えるまで、口を固めよ！', 4);
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
    for (const h of F.host) h.advance(60, 50);
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
    signal('nobiki', rt.distTo(TOWN_POST), 0.95);
    rt.say('森可成', '退き太鼓じゃ！　南の坂を上れ、宇佐山城へ退け！', 4);
    battleEvent(rt, EVENT_RETREAT, TOWN, F.mori, 0, true, '町口が崩れた。宇佐山城へ退け');
    rt.objRemove('mouth');
    rt.say('織田信治', 'わしらがここで支えるぞ。殿の後詰まで城を渡すな！', 3.5);
    rt.obj('main', '坂道の印をたどり、城の木戸へ退け', 'main');
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
      rt.say('森可成', '今じゃ、皆を城へ入れるぞ！　追手を払い、坂道を空けよ！', 4);
    } else {
      rt.after(8, () => this.doom(rt, { u: F.moriU, g: F.mori, key: 'mori', name: '森可成', flag: AZA, last: 'わしに構うな！　城へ走れ、木戸を守れ！', dur: 15 }));
      F.mori.order = 'hold'; F.mori.aggro = 16;
    }
    F.nobuharu.order = 'hold'; F.nobuharu.aggro = 16;
    rt.objRemove('path');
    // 城攻めの控えは退く味方の後から同じ道を上る。籠城が始まるまで待たせない。
    for (let i = 0; i < 4; i++) rt.after(24 + i * 18, () => {
      if (!F.ending && F.step >= 2) this.siegeMarch(rt, i);
    });
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
    for (let i = 0; i < 4; i++) rt.after(8 + i * 30, () => { if (!F.ending) this.siegeMarch(rt, i); });
    rt.unmark('usa'); rt.unmark('slopeBack'); rt.unzone('usa'); rt.unmark('w2'); rt.unmark('chase'); rt.objRemove('path');
    if (F.chase && !gone(F.chase)) this.castleAdvance(rt, F.chase);
    for (const g of F.waves) if (!gone(g)) {
      // 退却中から登っている隊も城攻めの歩みに替える。道と兵の位置は引き継ぐ。
      g.speed = 2.8;
      g.fire = true;
      if (g.order === 'hold' && g._shigaGate) this.castleAdvance(rt, g, g._shigaGateEnd);
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
    rt.after(8, () => { if (F.step === 3 && !F.ending) rt.say('武藤五郎右衛門', '寄せ手が上ってくるぞ！　木戸の内で待ち受けよ！', 3); });
    const burn = () => {
      if (F.ending || F.step < 3) return;
      if (!F.waves.some((g) => !gone(g) && g.anchor.z >= 30)) { rt.after(2, burn); return; }
      const fire = { x: -18, z: 52 };
      rt.world.addFire(fire.x, fire.z, { size: 3, big: true });
      rt.world.addFire(-3, 58, { size: 2.4, big: true });
      battleEvent(rt, EVENT_FIRE_START, fire, null, 1, true, '端城に火の手。奥の木戸を守れ');
      rt.banner('端城に火の手', '端城は燃えても、本丸は渡すな');
      rt.say('肥田彦左衛門', '端城に火を掛けられたぞ！　火を避けよ、寄せ手を中へ入れるな！', 4);
    };
    rt.after(38, burn);
    // 公記の二十日の大津方面への進出。十九日の端城攻めと日を分けて示す。
    rt.after(34, () => {
      if (F.ending || F.step !== 3) return;
      rt.banner('九月二十日・敵の一手は大津へ', '城の守りは続く。街道の敵を追うな');
      const bg = enemyGroup(rt, { faction: 'asakura', name: '街道を南へ抜ける朝倉の手', anchor: { x: 34, z: -6 }, facing: 0, order: 'move', aggro: 4, width: 10, morale: 80, speed: 2.4, fleeDir: { x: 0, z: -1 } },
        dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 3 }], ASA));
      F.bypass = bg; F.bypassInitial = bg.count;
      bg.dest = { x: 30, z: 150 };
      rt.marker('bypass', centerOf(bg), () => `街道を抜ける朝倉の手`, { red: true, group: bg });
      if (sightPoint(rt, bg.anchor, 120)) rt.say('武藤五郎右衛門', '敵の一手が大津へ向かうぞ。釣られるな、城を守れ！', 4.5);

    });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('castleHold'); rt.unmark('ni'); rt.unmark('hon');
    rt.unmark('gate'); for (let i = 0; i < 4; i++) rt.unmark('x' + i);
    // 北への引き返しではなく、坂本の西の比叡山へ。登り口の位置は推定復元。
    for (const h of F.host) h.moveTo(-120, -110, 40, { back: true });
    for (const q of F.backs || []) if (!q.gone) {
      q.gone = true; q.b.follow(null); q.b.moveTo(-120, -80, 30, { back: true });
    }
    for (const c of F.lines || []) c.rout('B', { hideAfter: 1e9 });
    for (const id of ['campA', 'campB', 'bypass', 'w1', 'w1b', 'w2', 'chase']) rt.unmark(id);
    for (const b of F.bSiege || []) b.order({ id: 'retreat' });
    battleEvent(rt, EVENT_REINFORCEMENT, { x: 30, z: 125 }, null, 0, true, '九月二十四日、信長が逢坂を越えた');
    rt.obj('main', '集まれの法螺。城内を保ち、敵を追うな', 'main');
    rt.objDone('main'); rt.objRemove('inner'); rt.objRemove('mouth');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '宇佐山城を守り通した', pts: 20 }; }, '宇佐山城を守り通した');
    signal('atsumare', rt.distTo(F.keep.anchor), 0.8);
    rt.banner('九月二十四日・宇佐山城、守り通す', F.moriSaved ? 'もしもの筋。森隊を救い、後詰まで城を保った' : '摂津から戻った信長の前に、浅井・朝倉は比叡山へ上がった');
    rt.say('武藤五郎右衛門', '南から味方の旗じゃ！　集まれの法螺を吹け。城内を保ち、敵を追うな！', 5);
    rt.after(6, () => rt.say('', F.moriSaved ? '――森隊を救ったのは、もしもの筋。史実では森可成らの命と引き換えに、城は残った' : '――森可成らの命と引き換えに、城は残った。浅井・朝倉との対陣は、十二月の和議まで続いた', 5));
    rt.after(12, () => rt.say('', '――城を残した働きは、次の戦へつながる。信長はなお、四方の敵に囲まれていた', 5));
    // 志賀の終幕を保つ。共通の追撃へ移ると結びの台詞が消え、退く下知が再び出る。
    rt.finish({ scriptedEnd: true }, 18);
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
    rt.say('武藤五郎右衛門', 'この組はもう持たぬ。裏の口から退け！', 4);
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
      this.slopeWarning(rt);
      // 槍が届く前の寄せを半秒ごとに拾う。木戸越しの敵は数えない。
      F.nearFoes = 0;
      if (F.step === 1.5 || F.step === 3 || F.step === 3.5) {
        for (const foe of rt.army.units) {
          if (!foe.alive || foe.team !== 1 || foe.isStruct || foe.fleeing || foe.woundOut || foe.gone || foe.noTarget) continue;
          if (Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z) >= 14 || rt.army.wallBetween(u.pos, u.team, foe.pos, false)) continue;
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
      F.bypassTurn = true; this.castleAdvance(rt, F.bypass, 3);
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
    if (!F.hurtHint && rt.player.u.hp < rt.player.u.maxHp * 0.75) {
      F.hurtHint = true;
      const ranged = player.lastHit?.ranged && rt.t - player.lastHit.t < 6;
      const guard = isTouch ? '「構える」を押し続けよ' : '右クリックを押し続けよ';
      const retreat = F.step >= 3 ? '木戸の内へ下がれ' : '味方の槍の後ろへ下がれ';
      rt.say('足軽', ranged ? '矢玉は構えでは防げぬ。塀や屋敷の陰へ退け' : `敵を向いて${guard}。${retreat}`, 5);
    }
    const p = rt.player.u.pos;
    if (F.step === 1) {
      rt.objProgress('main', '槍の列を離れず、先手を受けよ');
      if (F.w1 && F.w1.count < 5 && !gone(F.w1)) F.w1.morale = Math.min(F.w1.morale, 20);
      if (F.w1b && F.w1b.count < 5 && !gone(F.w1b)) F.w1b.morale = Math.min(F.w1b.morale, 20);
      if ((F.w1b && gone(F.w1) && gone(F.w1b) && rt.t - F.stepT > 35) || rt.t - F.stepT > 65) this.midA(rt);
    }
    if (F.step === 1.5) {
      rt.objProgress('main', '町口を守れ。味方の退き口を保て');
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
      if (rt.t - F.stepT >= 55 || rt.t - F.stepT >= 12 && (u.hp < u.maxHp * 0.7 || F.nearFoes >= 3)) this.fall(rt);
    }
    if (F.step === 3.5) {
      const hon = F.SZ.byId.hon;
      const inCastle = F.C.kuruwa.san.test(p.x, p.z) || F.C.kuruwa.ni.test(p.x, p.z) || F.C.kuruwa.hon.test(p.x, p.z);
      castleProgress(rt, hon.owner === ZONE_STATE.ENEMY ? `本丸を取り返せ。猶予はあと${Math.max(0, Math.ceil(45 - (F.honLostT || 0)))}秒` : !inCastle ? '城の木戸の内へ戻れ' : !F.honGuarded ? F.honGuards < 3 ? '本丸に味方を三人以上集めよ' : '本丸の敵を押し返せ。味方の列で受けよ' : F.aidMoving ? `後詰の到着まであと${Math.max(0, Math.ceil(20 - (rt.t - F.aidT)))}秒` : `後詰の出発まであと${Math.max(0, Math.ceil(AID_WAIT_SECONDS - (rt.t - F.stepT)))}秒`);
      // 最後の出発待ちを十五秒縮める。後詰が移動する二十秒は保つ。
      if (rt.t - F.stepT >= AID_WAIT_SECONDS && !F.aidMoving) {
        F.aidMoving = true; F.aidT = rt.t; F.aid.visible = true;
        rt.banner('九月二十四日・南に後詰の旗', '信長が逢坂を越えた。木戸の守りを続けよ');
        F.aid.advance(65, 20);
        rt.say('肥田彦左衛門', '南に味方の旗じゃ！　城を出ず、木戸を守れ！', 3);
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
      rt.objProgress('main', (d < 6 || F.C.kuruwa.san.test(p.x, p.z)) ? '木戸の内を守り、退く味方を待て' : F.retreatIdx === 0 ? '坂道の入口へ退け' : F.retreatIdx < F.retreatPath.length - 3 ? `木戸まで道沿いに約${remaining}メートル` : '開いた木戸から城へ入れ');
      // 道の進みに合わせて一度だけ知らせる。歩く間に同じ下知を繰り返さない。
      if (!F.climbHalf && F.retreatIdx >= 6) { F.climbHalf = true; rt.bark('坂道の半ばまで来た。道の外は急な崖だ'); }
      if (!F.climbTop && F.retreatIdx >= 12) { F.climbTop = true; rt.bark('城の木戸が近い。開いた口から中へ入れ'); }
      const inSan = F.C && F.C.kuruwa.san.test(p.x, p.z);
      let saved = 0;
      if (F.moriRescue) for (const u of F.mori.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && F.C.kuruwa.san.test(u.pos.x, u.pos.z)) saved++;
      const moriReady = F.moriRescue ? F.moriU.alive && !F.moriU.woundOut &&
        F.C.kuruwa.san.test(F.moriU.pos.x, F.moriU.pos.z) && saved >= Math.ceil(F.mori.initial / 3) : F.moriDead;
      if (F.moriRescue && (d < 6 || inSan)) rt.objProgress('main', `城へ入った森隊 ${saved}／${Math.ceil(F.mori.initial / 3)}人以上。外の味方を守れ`);
      // 間に合わなかった理由が、失敗するまで分からない待ち札にしない。
      const left = Math.max(0, Math.ceil(RETREAT_TIME + 30 - (rt.t - F.stepT)));
      if (left <= 60) {
        const task = F.moriRescue && (d < 6 || inSan) ? `森隊 ${saved}／${Math.ceil(F.mori.initial / 3)}人。外の味方を守れ` :
          d < 6 || inSan ? '木戸の内で退く味方を守れ' : '道の印をたどり、木戸の内へ急げ';
        rt.objProgress('main', `${task}。退く猶予あと${left}秒`);
        if (!F.retreatWarned) {
          F.retreatWarned = true;
          rt.say('武藤五郎右衛門', d < 6 || inSan ? '追手が迫るぞ！　木戸の内で退く味方を守れ！' : '追手が迫るぞ！　坂道をたどり、木戸の内へ急げ！', 3);
        }
      }
      if ((d < 6 || inSan) && moriReady && F.nobuDead && F.aochiDead) {
        F.moriSaved = F.moriRescue;
        if (F.moriSaved) rt.award((t) => t.side.push('もしもの筋・森隊を救い、城へ退いた'), '森隊と宇佐山城へ退いた');
        this.siege(rt);
      } else if (F.moriRescue && rt.t - F.stepT > RETREAT_TIME + 30) {
        this.lose(rt, '森隊を城へ集められず、退く道を守れなかった', true); return;
      } else if (rt.t - F.stepT > RETREAT_TIME + 30) {
        this.lose(rt, '町口から城へ退く下知に間に合わなかった', true); return;
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
      rt.say('武藤五郎右衛門', 'よう戻った。本丸の口で槍を揃えよ。ここなら寄せ手は横に広がれぬ', 3.5);
    }
  },

  // 坂で深手の包囲を受けた時だけ、道を通って味方へ戻る印を一度出す。
  slopeWarning(rt) {
    const F = rt.flags, u = rt.player.u;
    if (F.step !== 2) return;
    if (F.slopeAlly) {
      const a = F.slopeAlly;
      if (!a.alive || a.fleeing || a.woundOut || a.gone || Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) < 4) {
        F.slopeAlly = null; rt.unmark('slopeBack');
      }
    }
    if (F.slopeWarned || !u.mobbed || u.hp >= u.maxHp * .5) return;
    const q = F.slopeRoad || (F.slopeRoad = { x: 0, z: 0, s: 0, d: 0 });
    const aq = F.slopeAllyRoad || (F.slopeAllyRoad = { x: 0, z: 0, s: 0, d: 0 });
    roadProjection(u.pos, q);
    if (q.s < 2 || q.s >= ROAD_OUT || q.d > 4) return;
    let best = Infinity, ally = null;
    for (const a of rt.army.units) {
      if (a === u || a.team !== u.team || !a.alive || a.isStruct || a.fleeing || a.woundOut || a.gone || a.noTarget) continue;
      if (Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) < 4.5) continue;
      roadProjection(a.pos, aq);
      if (aq.d > 3 || aq.s < 2) continue;
      const d = Math.abs(aq.s - q.s);
      if (d < best) { best = d; ally = a; }
    }
    if (!ally) return;
    F.slopeWarned = true; F.slopeAlly = ally;
    F.slopePoint = { x: 0, z: 0 };
    rt.marker('slopeBack', () => {
      if (!F.slopeAlly || F.step !== 2) return null;
      roadProjection(u.pos, q); roadProjection(F.slopeAlly.pos, aq);
      // 折り返しを横切らず、味方へ通じる道の角を順に指す。
      const i = aq.s >= q.s ? Math.floor(q.s + .08) + 1 : Math.ceil(q.s - .08) - 1;
      const at = Math.abs(aq.s - q.s) < .5 ? F.slopeAlly.pos : null;
      F.slopePoint.x = at ? at.x : ROAD[Math.max(0, Math.min(ROAD.length - 1, i))][0];
      F.slopePoint.z = at ? at.z : ROAD[Math.max(0, Math.min(ROAD.length - 1, i))][1];
      return F.slopePoint;
    }, '味方の列へ下がれ', { h: 3, guidePriority: 500 });
    rt.bark('味方の列へ下がれ', true);
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
    if (outside && S.test(u.pos.x, u.pos.z)) rt.objProgress('inner', `外の守兵${outside}人を待て。先に閉めるなら木戸へ寄れ`);
    else if (wounded && S.woundWait && S.test(u.pos.x, u.pos.z)) rt.objProgress('inner', '負傷兵を待っている。閉めるなら木戸へ寄れ');
    else rt.objProgress('inner', '');
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
    if (!F.campNear && p.z < -70 && sightPoint(rt, F.campA.pos, 100)) { F.campNear = true; rt.say('足軽', '向こうは敵の本陣だで！　旗があんなに重なっとる、戻ろまい！', 3.5); }
    if (F.step >= 2) return;
    for (const [id, c, label] of [['campA', F.campA, '朝倉義景の本陣'], ['campB', F.campB, '浅井長政の本陣']]) {
      if (!c || F['mk_' + id] || !sightPoint(rt, c.general?.pos || c.pos, 75)) continue;
      F['mk_' + id] = true;
      rt.marker(id, { x: c.pos.x, z: c.pos.z }, label + '・近づくな', { h: 2 });
    }
    // 本陣の将の声は姿が見える近さだけ。台詞は推定で、町口の将の名は捏造しない。
    if (rt.t < (F.campVoiceT || 0)) return;
    for (const c of [F.campA, F.campB]) {
      const u = c?.general;
      if (!u?.alive || F['heard_' + u.name] || !sightPoint(rt, u.pos, 30)) continue;
      F['heard_' + u.name] = true; F.campVoiceT = rt.t + 8;
      rt.say(u.name, u.name === '朝倉義景' ? '町口の守りは少ない。備えを崩さず押せ！' : '朝倉の手と歩みを合わせよ。坂本へ進め！', 3);
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
    if (sightPoint(rt, u.pos, 80)) rt.say('足軽', `${o.name}の手が押されとる！　城へ退こまい！`, 3);
    
    const preferred = o.key === 'nobu' ? F.twoHands[0] : o.key === 'aochi' ? F.twoHands[1] : F.w2;
    const g = !gone(preferred) ? preferred : [F.w1, F.w1b, ...F.twoHands, F.w2].find((q) => q && !gone(q));
    if (g && !gone(g)) {
      // 湖側の平地から町口へ寄せる。山側の切岸へ直進させない。
      g.order = 'path'; g.path = [[22, -20], [22, 4], [c.x, c.z]]; g.pathIdx = 0;
      g.formation = 'column'; g.colW = 1; g.seekRange = 45; g.aggro = 4;
      g.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.aggro = 14; };
    }
    if (o.g) { o.g.order = 'hold'; o.g.aggro = 18; }
    rt.after(o.dur - 4, () => { if (u.alive && sightPoint(rt, u.pos, 40)) rt.say(o.name, o.last, 3); });
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
      for (const q of [F.w1, F.w1b, ...F.twoHands, F.w2]) this.castleAdvance(rt, q, 3);
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
    rt.obj('inner', '二の丸の木戸の内へ退け', 'order');
    rt.bark('危うい。二の丸へ退け', true);
    rt.say('武藤五郎右衛門', F.gate.alive ? '三の丸は持たぬ！　二の丸の木戸で受けよ！' : '大手が破られた！　二の丸へ退け！', 3.5);
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
    if (!F.backedNi) this.toNinomaru(rt);
    F.backed = true;
    rt.unmark('ni');
    // 門口から少し離れた庭へ案内し、後から入る守兵の列を塞がない。
    rt.marker('hon', { x: GATE_HON.x - 3, z: GATE_HON.z + 8 }, '本丸の木戸の内へ', { h: 3 });
    rt.obj('inner', '本丸の木戸の内へ退け', 'order');
    rt.bark('危うい。本丸へ退け', true);
    rt.say('武藤五郎右衛門', F.kidoNi.struct.alive ? 'まだ本丸があるぞ！　奥へ下がって受けよ！' : '二の丸も破られた！　本丸へ退け、最後の木戸を守れ！', 3.5);
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
    rt.say('足軽', `${g.name}が崩れたがや！`, 2.5);
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
    sfx('wood', 1.2);
    rt.say('武藤五郎右衛門', `${s.name}が破られた！　口で押し返せ、中へ入れるな！`, 3.5);
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
shiga.date = () => '元亀元年九月十六日〜二十四日　日中の景色は復元';
shiga.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '可成の話を飛ばす' : '');
shiga.skip = (rt) => { if (rt.phase === 'brief') shiga.first(rt); };
shiga.history = '足軽の筋は史実に沿い、森可成らの討死の後に宇佐山城を守る。町口で早く退く相談を選び、森可成と森隊の三分の一以上を城へ入れる救出は、もしもの筋。救った隊は木戸ごとの守りへ引き継ぎ、敵の兵力は減らさない。信長の早い帰還は、もしもの筋。『信長公記』巻三「志賀御陣之事」では、九月十六日、森可成は千人に満たない兵で坂本の町はずれへ下り、浅井・朝倉の先手に小勝ちを得た。十九日、三万ほどの敵が両手から押し寄せ、森可成・織田信治・青地茂綱らが討ち死にした。二十日とも伝わるが、本戦は信長公記の十九日に合わせた。敵は端城まで攻め上って火を放ったが、武藤五郎右衛門・肥田彦左衛門が城を守った。二十四日、摂津から戻った信長が逢坂を越えると、坂本の敵は比叡山へ上がった。兵数や城内の並びには諸説ある。両手を北の正面と西の山側に分けた布陣、少数の鉄砲の射撃、木戸ごとの攻防と時間は遊びのための復元であり、史料にない夜襲は設けていない。城は敵の全てを止めたわけではなく、二十日に大津・馬場・松本、二十一日に醍醐・山科へ敵が進んで放火したと公記は記す。城の役目は街道を監視し、敵の背後を脅かすことにある。千人に満たない守りは九百五十人を出陣時の目安とし、各備への配分と見える人数は縮小した復元である。町口の兵は十九日の場面でも同じ組の生き残りを使い、日ごとの実際の再編を再現したものではない。正確な天気と時刻は不明。町口から本丸の比高は約二百五十メートルとし、山と湖の水平距離は縮め、城の石垣・石段・南の二の丸と貯水槽は遺構の記載をもとに補った。曲輪の南北の並びは資料に食い違いがあり、南の段の方位・建物・門・物見・堀・屋根と道は元亀元年の近江として推定。信長で出る場合の早い帰還は、もしもの筋である。対陣は十二月の和議まで続いた。';

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
  // 前の受けで使った後退・横歩きと狙いを残すと、次の前進と打ち消し合う。
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
  if (p.lock) inp.e.add('KeyQ');
  // 坂の角は行き先に入っている。町では屋敷の壁をよけて入口へ回る。
  // 手すりのある坂へ入ってからだけ、共通の横回りを止める。
  if (b.flags.step !== 2 || b.flags.retreatIdx > 0) {
    p._gtStuckT = 0; p._gtDetourT = 0;
  }
  goTo(p, inp, x, z, r);
  retreatThroughGap(b, inp, retreatOnShigaRoad);
  // 長い坂で気力を使い切ると、追手へ向き直っても構えが崩れる。
  // 歩いて受ける余力を戻し、半分以上戻ってから走り直す。
  if (p.sta < p.maxSta * 0.35) b.flags.shigaCatchBreath = true;
  else if (p.sta >= p.maxSta * 0.6) b.flags.shigaCatchBreath = false;
  inp.runHeld = !b.flags.shigaCatchBreath && inp.k.has('KeyW');
  inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
  let attacker = null, nearest = Infinity, impact = Infinity;
  let strikeAngle = null, crossed = false;
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
      if (soon <= 1 && d <= (o.reach || 2.8) + 1) {
        const angle = Math.atan2(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
        if (strikeAngle === null) strikeAngle = angle;
        else if (Math.cos(angle - strikeAngle) < 0.5) crossed = true;
      }
      if (soon < impact || soon === impact && d < nearest) { attacker = o; nearest = d; impact = soon; }
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
    // 一本でも体が向く前に届く刃や、構えが崩れた時は受けられない。
    // 坂道を外れない時だけ退く足を速め、正面で受けられる刃には気力を残す。
    const uncovered = nearest <= (attacker.reach || 2.8) + 0.6 &&
      (p.guardBroken > 0 || Math.cos(toward - u.heading) <= 0.25);
    // 深手では正面の一本も致命傷になりうる。向きが合っていても坂道へ避ける。
    const critical = u.hp <= u.maxHp * 0.35;
    if ((crossed || uncovered || critical) && impact <= 0.35 && !p.mounted && p.dodgeT <= -0.3 &&
        !(p.knockT > 0) && !u.climb &&
        p.sta >= 20 + (critical || p.guardBroken > 0 ? 0 : p.maxSta * 0.4)) {
      const step = b._shigaDodgeStep || (b._shigaDodgeStep = { x: 0, z: 0 });
      step.x = u.pos.x + Math.sin(walkYaw) * 3; step.z = u.pos.z + Math.cos(walkYaw) * 3;
      if (!b.army.wallBetween(u.pos, -1, step) && b.world.walkable(step.x, step.z, u.pos.y) &&
          retreatOnShigaRoad(b, step)) inp.e.add('Space');
    }
  }
  // 追手への向きは保ち、打ち込みの前だけ構える。接近だけの追手に
  // 構え続けると坂で息が戻らず、背後の連続した突きで構えが崩れる。
  // 指と体が横・背へ向き直る間も見込み、正面の受けより早く構える。
  const guardLead = Math.cos(toward - u.heading) < 0.5 ? 1.3 : 0.9;
  inp.guardHold = impact <= guardLead;
  inp.runHeld = false; inp.leftPressed = false; inp.chargeHold = false;
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
  battleJin('町口と三つの曲輪の守り', 0, HON_C, Math.PI, [
    ['shiga_mori', '坂本の町口・中央', '森可成', 400, { x: TOWN.x - 2, z: TOWN.z + 16 }, 'tsuru', 'oda', (r) => r.flags.bMori],
    ['shiga_nobuharu', '坂本の町口・湖側', '織田信治', 250, { x: TOWN.x + 30, z: TOWN.z + 12 }, 'oda', 'oda', (r) => r.flags.bNobu],
    ['shiga_aochi', '坂本の町口・山側', '青地茂綱', 150, { ...AOCHI_POST }, 'oda', 'oda', (r) => r.flags.sakai],
    ['shiga_muto', '三の丸の木戸', '武藤五郎右衛門', 60, { x: -8, z: 56 }, 'oda', 'oda', (r) => r.flags.keep],
    ['shiga_hida', '本丸の守り', '肥田彦左衛門', 60, { x: GATE_HON.x, z: GATE_HON.z + 8 }, 'oda', 'oda', (r) => r.flags.hida],
    ['shiga_san', '三の丸の大手木戸', '将の名は不明', 30, { x: -12, z: 60 }, 'oda', 'oda', null, { draw: true, named: false, w: 8, d: 5, count: 20 }],
    ['shiga_aid', '南からの後詰', '織田信長', null, { x: 20, z: 150 }, 'eiraku', 'oda', (r) => r.flags.aidMoving ? r.flags.aid : null, { form: 'column' }],
  ], '森らの町口の戦いから籠城、九月二十四日の後詰へ。武藤・肥田の曲輪別の担当は復元。'),
  battleJin('朝倉の縦に続く備え', 1, { x: 40, z: -152 }, 0, [
    ['shiga_asakura_hq', '本陣', '朝倉義景', 6000, { x: 40, z: -152 }, 'asakura', 'asakura', (r) => r.flags.campA?.guard],
    ['shiga_asakura_front', '街道の先手', '朝倉の衆（将の名は不明）', 7000, { x: 28, z: -96 }, 'asakura', 'asakura', (r) => r.flags.bAsa, { named: false }],
    ['shiga_asakura_next', '街道の二の備え', '朝倉の衆（将の名は不明）', 7000, { x: 60, z: -170 }, 'asakura', 'asakura', null, { named: false }],
  ], '朝倉と浅井の内訳は推定。町口では北から南へ進み、後詰が来ると比叡山へ退く。'),
  battleJin('浅井の山側の備え', 1, { x: -34, z: -150 }, 0.1, [
    ['shiga_azai_hq', '本陣', '浅井長政', 4000, { x: -34, z: -150 }, 'azai', 'azai', (r) => r.flags.campB?.guard],
    ['shiga_azai_front', '山側の先手', '浅井の衆（将の名は不明）', 6000, { x: -22, z: -92 }, 'azai', 'azai', (r) => r.flags.bAza, { named: false }],
  ], '山側を浅井、街道側を朝倉とする位置は推定。'),
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
    rt.bark('上から矢！　塀や屋敷の陰へ退け', true);
  };
  // 呼び出しの差し替えはこの戦の入れ物だけ。他の戦の台詞・視点には残さない。
  const say = rt.say, calls = ['槍の列を狙え、放て！', '次の組、町口を支えよ！', '狙いを揃え、もう一度撃て！'];
  let volleyAt = -99, volleyCount = 0;
  rt.say = function (who, text, dur) {
    if (who === '織田信治' && /放て/.test(text)) {
      if (this.t - volleyAt < 30) return;
      volleyAt = this.t; text = calls[volleyCount++ % calls.length];
    }
    // 総兵数が減っても、城の木戸を捨てて別の旗へ走らせない。
    if (who === '組頭' && /味方が討ち減らされておる|味方がもう持たぬ/.test(text)) {
      const F = this.flags;
      text = F.step === 2 ? '坂道の印を追って城へ退け。味方と離れるな' :
        F.step >= 3 ? '持ち場の木戸を守れ。城兵の槍の列から離れるな' :
        '森隊の槍の列へ戻れ。町口で味方と受けよ';
    }
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
/* 明るい町の土でも、操作名とキーの呼び方を同じ濃い墨の上で読めるようにする。 */
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
    rt.world.groundU.tDirt.value = dirtTex(true);
    // 志賀は地肌の描き方を小さく独立させる。長い共通の地表用の式と、
    // その古い文面への置換を重ねず、既存の草・土・泥と足場の頂点を使う。
    // 陰影・影・昼の霞は通常の材質に任せ、地形の索引と歩く高さは変えない。
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, rt.world.groundU);
      shader.vertexShader = 'attribute vec3 splat, slopeTint; varying vec3 vShigaGround, vShigaMix, vShigaTint;\n'
        + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vShigaGround = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vShigaMix = splat; vShigaTint = slopeTint;`);
      shader.fragmentShader = `uniform sampler2D tGrass, tDirt, tMud, tMacro, tWear;
        uniform float uWet;
        varying vec3 vShigaGround, vShigaMix, vShigaTint;
        ` + shader.fragmentShader.replace('#include <map_fragment>', `
          vec3 p = vShigaGround;
          vec3 n = abs(normalize(cross(dFdx(p), dFdy(p))));
          vec3 axis = pow(n, vec3(4.0)); axis /= max(0.001, axis.x + axis.y + axis.z);
          // 切岸の縦面にも同じ粒の大きさで土を貼る。上から伸ばした白い筋にしない。
          vec3 soil = texture2D(tDirt, p.zy * 0.23).rgb * axis.x
            + texture2D(tDirt, p.xz * 0.23).rgb * axis.y
            + texture2D(tDirt, p.xy * 0.23).rgb * axis.z;
          float patch = 0.5 + 0.5 * sin(p.x * 0.18 + sin(p.z * 0.11) * 2.4)
            * cos(p.z * 0.16 - sin(p.x * 0.09) * 1.8);
          vec3 w = max(vShigaMix, vec3(0.0));
          w.x = min(w.x, clamp((patch - 0.28) * 2.2, 0.08, 1.0));
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
          diffuseColor.rgb *= (grass * w.x + soil * w.y + mud * w.z) * tint
            * mottling * (1.0 - uWet * 0.18);
        `);
    };
    mat.customProgramCacheKey = () => '志賀の草土と切岸';
    mat.userData.camNearSolid = true;
    rt.world.terrain.material = mat;
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
  return BENCHED(x, z);
}
