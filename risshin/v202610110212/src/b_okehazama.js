import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
// 第1戦　桶狭間。雨後の急襲・旗本の囲み・元の道への帰陣。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SOLIDS } from './props.js';
import { UNIT_MAT } from './units.js';
import { gauss, allyGroup, enemyGroup, unitPos, nm, guardRecover } from './bhelp.js';
import { distToPolyline } from './world.js';
import { palisade, hut, yagura, nobori, tawara, campfire, koshi, umaFollow } from './props.js';
import { nagashinojo } from './b_nagashinojo.js';
import { customFlag } from './b_inabayama.js';
import { farArmy, moveFar, gone, sky } from './b_shared.js';
import { sfx, hush } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { demBlend } from './dem.js';
import { sendOrder, posOf } from './denrei.js';
import { clash } from './b_sekigahara.js';
import { cryCaption } from './battle_cries.js';

// ======================================================================
// 第1戦　桶狭間
// ======================================================================
const P1 = [[0, 172], [-4, 150], [-4, 144], [4, 140], [6, 118], [-8, 90], [-24, 60], [-30, 30], [-22, 0], [-12, -30], [-8, -46]];
const HONJIN = { x: 18, z: -116 };
const readyUnit = (u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;
const readyGroup = (g) => g && !g.routed && g.units.some(readyUnit);

// 桶狭間の幕だけを細かく張り直す。五辺を一枚にまとめ、風は既存の時計で描く。
function okeCloth(camp, world) {
  camp.traverse((m) => {
    if (!m.geometry?.attributes.jpin) return;
    const pieces = [], supports = [], stakes = new Map();
    // 木と縄は元の材質のまま一枚にまとめる。形を作るのは開戦時だけ。
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 6).toNonIndexed();
    const wood = new THREE.Color(0x493823), rope = new THREE.Color(0x827052);
    const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3(), turn = new THREE.Quaternion();
    const rod = (a, b, radius, color, taper = 1) => {
      const geo = cylinder.clone(), P = geo.attributes.position;
      const length = direction.set(b.x - a.x, b.y - a.y, b.z - a.z).length();
      for (let i = 0; i < P.count; i++) {
        const y = P.getY(i), r = radius * (y > 0 ? taper : 1);
        P.setXYZ(i, P.getX(i) * r, y * length, P.getZ(i) * r);
      }
      turn.setFromUnitVectors(up, direction.normalize()); geo.applyQuaternion(turn);
      geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      const colors = new Float32Array(P.count * 3);
      for (let i = 0; i < P.count; i++) {
        colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals(); supports.push(geo);
    };
    const stake = (x, z) => {
      const key = `${x.toFixed(4)},${z.toFixed(4)}`;
      if (stakes.has(key)) return stakes.get(key);
      const ground = world.heightAt(x, z), phase = x * 2.7 + z * 1.3;
      const dx = Math.sin(phase) * 0.09, dz = Math.cos(phase * 1.7) * 0.08;
      const height = 2.3 + Math.sin(phase * 0.8) * 0.09;
      rod({ x, y: ground - 0.05, z }, { x: x + dx, y: ground + height, z: z + dz },
        0.065 + Math.sin(phase * 2.1) * 0.016, wood, 0.78);
      const knot = { x: x + dx * 0.9, y: ground + 2.07, z: z + dz * 0.9 };
      stakes.set(key, knot); return knot;
    };
    for (const [ax, az, bx, bz] of [[5, -125, 31, -125], [5, -125, 5, -107], [31, -125, 31, -107], [5, -107, 13, -107], [23, -107, 31, -107]]) {
      const len = Math.hypot(bx - ax, bz - az), bays = Math.max(1, Math.round(len / 3));
      const tx = (bx - ax) / len, tz = (bz - az) / len, knots = [];
      for (let i = 0; i <= bays; i++) knots.push(stake(ax + tx * len * i / bays, az + tz * len * i / bays));
      // 分割位置を杭にそろえ、柱の間の上縁と吊り縄を同じ曲線で垂らす。
      for (let bay = 0; bay < bays; bay++) {
        const a = knots[bay], b = knots[bay + 1];
        let previous = a;
        for (let i = 1; i <= 8; i++) {
          const u = i / 8, next = { x: a.x + (b.x - a.x) * u,
            y: a.y + (b.y - a.y) * u - Math.sin(u * Math.PI) * 0.22,
            z: a.z + (b.z - a.z) * u };
          rod(previous, next, 0.014, rope); previous = next;
        }
      }
      const geo = new THREE.PlaneGeometry(len, 1.6, bays * 24, 6);
      const P = geo.attributes.position, UV = geo.attributes.uv, pin = new Float32Array(P.count);
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), v = UV.getY(i), along = x + len / 2;
        const span = Math.min(bays, Math.max(0, along / len * bays));
        const bay = Math.min(bays - 1, Math.floor(span)), u = span - bay;
        const a = knots[bay], b = knots[bay + 1], sag = Math.sin(u * Math.PI);
        const fold = Math.sin(u * Math.PI * 8) * 0.11 + Math.sin(u * Math.PI * 16 + sag) * 0.035;
        pin[i] = sag;
        // 留めた上端の間も垂れ、裾は深くたるむ。下端の小さな切れ目はほつれ。
        const fray = v === 0 ? 0.025 + 0.02 * Math.sin(along * 31 + ax) : 0;
        const billow = sag * (1 - v) * 0.32 + fold * (0.18 + (1 - v) * 0.82);
        P.setXYZ(i, a.x + (b.x - a.x) * u - tz * billow,
          a.y + (b.y - a.y) * u - 0.025 - (1 - v) * 1.6 - sag * (0.22 + (1 - v) * 0.12) - fray,
          a.z + (b.z - a.z) * u + tx * billow);
        UV.setX(i, along / 4);
      }
      geo.setAttribute('jpin', new THREE.BufferAttribute(pin, 1));
      geo.computeVertexNormals();
      pieces.push(geo);
    }
    const oldGeo = m.geometry;
    m.geometry = mergeGeometries(pieces); m.geometry.computeBoundingSphere();
    oldGeo.dispose(); for (const geo of pieces) geo.dispose();
    const frame = m.parent.children.find((child) => child.isMesh && child !== m && !child.geometry.attributes.jpin);
    if (frame) {
      const oldFrame = frame.geometry;
      frame.geometry = mergeGeometries(supports); frame.geometry.computeBoundingSphere(); oldFrame.dispose();
    }
    cylinder.dispose(); for (const geo of supports) geo.dispose();
    // 共有の絵には書かず、この幕の絵に縫い糸・織り目・裾のほつれを足す。
    const oldMap = m.material.map, canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const g = canvas.getContext('2d'); g.drawImage(oldMap.image, 0, 0, 512, 128);
    g.fillStyle = 'rgba(236,228,208,0.45)';
    for (let y = 0; y < 128; y += 3) g.fillRect(0, y, 512, 0.5);
    g.fillStyle = 'rgba(63,48,29,0.38)';
    for (let x = 0; x < 512; x += 64) {
      g.fillRect(x, 0, 2, 128);
      for (let y = 3; y < 126; y += 5) { g.fillRect(x + 3, y, 2, 2); g.fillRect(x + 6, y + 2, 1, 2); }
    }
    for (const y of [3, 121]) for (let x = 2; x < 512; x += 6) g.fillRect(x, y, 3, 1);
    for (let x = 0; x < 512; x++) g.clearRect(x, 125 + Math.round(Math.sin(x * 1.7) * 2), 1, 4);
    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace; map.userData.clone = true;
    m.material.map = map; oldMap.dispose(); m.material.alphaTest = 0.35;
    const compile = m.material.onBeforeCompile;
    m.material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      // 杭の所は固定し、濡れた布も裾と柱の間には重い揺れを残す。既存の時計を使う。
      shader.vertexShader = shader.vertexShader
        .replace('(1.0 - uv.y) * (0.25 + 0.75 * jpin)', 'jpin * (0.12 + 0.88 * (1.0 - uv.y))')
        .replace('(0.07 + uGust * 0.09) * (1.0 - uWet * 0.6)', '(0.18 + uGust * 0.18) * (1.0 - uWet * 0.35)');
    };
    m.material.customProgramCacheKey = () => 'okeCloth2';
    m.material.needsUpdate = true;
  });
}

// 木肌・縄・削り口は共通の軽い形を使い、この二つの柵だけ傾きと太さの差を強める。
function okePalisade(world, a, b) {
  const m = palisade(world, [a, -104.8, b, -104.8], { h: 1.5, solid: true });
  const P = m.geometry.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), ground = world.heightAt(x, -104.8);
    const h = Math.max(0, P.getY(i) - ground), variation = Math.sin(x * 4.7);
    P.setXYZ(i, x + h * Math.sin(x * 3.1) * 0.035,
      ground + (P.getY(i) - ground) * (1 + variation * 0.07),
      -104.8 + (z + 104.8) * (1.15 + variation * 0.08) + h * variation * 0.06);
  }
  P.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere();
  return m;
}

// 声は近くの隊だけへ。遠い隊は使番が実際に着いてから下知を受ける。
// 討たれたり幕で止まった使番の代わりに、秒数だけで知らせを通さない。
function fieldNotice(rt, from, target, team, apply) {
  const a = posOf(from), b = posOf(target);
  if (!a || !b) return;
  if (Math.hypot(a.x - b.x, a.z - b.z) <= 12 && !rt.army.wallBetween(a, -1, b)) apply(target);
  else return sendOrder(rt, from, target, { id: '桶狭間の知らせ', apply },
    { team, faction: team ? 'imagawa' : 'oda', name: '備の組頭' });
}

// 台詞も生きた話し手のそばだけで聞く。旗と任務の札は離れても残す。
function localSay(rt, source, who, text, dur) {
  const u = source?.units ? source.units.find(readyUnit) : source;
  if (!u || !readyUnit(u)) return;
  const p = rt.player.u.pos;
  if (Math.hypot(u.pos.x - p.x, u.pos.z - p.z) <= 12 && !rt.army.wallBetween(u.pos, -1, p)) rt.say(who, text, dur);
}

function retreatGroup(g) {
  if (!readyGroup(g) || g.okeReturnOrdered) return;
  g.okeReturnOrdered = true;
  g.guard = false; g.focus = null; g.order = 'path'; g.formation = 'column';
  // 残った敵を追わず、帰る列の目の前の相手だけに応戦する。
  g.aggro = 3;
  g.path = [[18, -100], ...P1.filter(([, z]) => z <= 30).slice().reverse()].map(fieldPathPoint); g.pathIdx = 0;
  g.onArrive = (q) => { q.order = 'hold'; };
}

// 負傷して戦列を離れた兵を、帰る旗の中心に数えない。位置の入れ物は使い回す。
function returnCenter(rt) {
  const F = rt.flags;
  if (!readyGroup(F.returnGroup)) F.returnGroup = F.attackers.find((g) => readyGroup(g) && g.okeReturnOrdered) || F.attackers.find(readyGroup);
  if (!F.returnGroup) return null;
  const p = F.returnCenter || (F.returnCenter = { x: 0, z: 0 });
  let x = 0, z = 0, n = 0;
  for (const u of F.returnGroup.units) if (readyUnit(u)) { x += u.pos.x; z += u.pos.z; n++; }
  p.x = x / n; p.z = z / n;
  return p;
}

// 位置図の北を上にそろえる。中島砦から本陣へは西北西から東南東。
// 図の原点は (2, 3)。本陣はおけはざま山 (110, 30) に置く。
// 戦う範囲の間合いを保ち、砦までの広がりは実地のメートルで別に作る。
// 元の道の曲がりと段の間合いは、同じ回転を全ての位置へかけて保つ。
const FIELD_TURN = Math.atan2(-261, -53) - Math.atan2(-18, 278);
const FIELD_C = Math.cos(FIELD_TURN), FIELD_S = Math.sin(FIELD_TURN);
const FIELD_X = 112 - 18 * FIELD_C + 116 * FIELD_S;
const FIELD_Z = 33 + 18 * FIELD_S + 116 * FIELD_C;
const fieldX = (x, z) => FIELD_X + x * FIELD_C + z * FIELD_S;
const fieldZ = (x, z) => FIELD_Z - x * FIELD_S + z * FIELD_C;
const fieldPoint = (x, z) => ({ x: fieldX(x, z), z: fieldZ(x, z) });
const fieldVector = (x, z) => ({ x: x * FIELD_C + z * FIELD_S, z: -x * FIELD_S + z * FIELD_C });
const localX = (x, z) => (x - FIELD_X) * FIELD_C - (z - FIELD_Z) * FIELD_S;
const localZ = (x, z) => (x - FIELD_X) * FIELD_S + (z - FIELD_Z) * FIELD_C;
const fieldPathPoint = ([x, z]) => [fieldX(x, z), fieldZ(x, z)];
const FIELD_HONJIN = fieldPoint(HONJIN.x, HONJIN.z);
const NAKAJIMA = { x: -2498, z: -497 };
const ZENSHOJI = { x: -3198, z: -997 };
const zenshojiLocal = [localX(ZENSHOJI.x, ZENSHOJI.z), localZ(ZENSHOJI.x, ZENSHOJI.z)];
// 接近路の細かな曲がりは推定。中島から正面へ進み、北への迂回路は足さない。
const APPROACH = [[NAKAJIMA.x, NAKAJIMA.z], [-1798, -377], [-998, -197], ...P1.map(fieldPathPoint)];
const TOKAIDO = [[-998, -537], [742, -537], [2502, -537]];

// 戦う地面の細かさは替えず、その外に実寸の丘・砦・道を一度だけ作る。
// 古戦場伝説地は (742, -437)、三角点の丘は (502, 23)。両説の本陣を重ねて作らない。
function fieldSurroundings(rt) {
  const world = rt.world, edge = world.half + 150, oldFarH = world.farH;
  const surroundingHeight = (x, z) => {
    const out = Math.max(Math.abs(x), Math.abs(z)) - edge;
    if (out <= 0) return oldFarH(x, z);
    const ex = Math.max(-edge, Math.min(edge, x)), ez = Math.max(-edge, Math.min(edge, z));
    const blend = Math.min(1, out / 120), t = blend * blend * (3 - 2 * blend);
    const base = 12 + 5 * Math.sin(x * 0.003) * Math.cos(z * 0.004);
    // 標高64.7mの丘は広い裾を持つ。田楽窪はその北東の低地。
    const hill = (64.7 - (12 + 5 * Math.sin(502 * 0.003) * Math.cos(23 * 0.004))) * gauss(x, z, 502, 23, 42000);
    const hollow = 7 * gauss(x, z, 742, -437, 35000);
    return oldFarH(ex, ez) * (1 - t) + (base + hill - hollow) * t;
  };
  // 粗い外周だけを足す。近景の地面・木・川・兵の数は増やさない。
  const positions = [], indices = [];
  const patch = (x0, z0, x1, z1) => {
    const nx = Math.ceil((x1 - x0) / 60), nz = Math.ceil((z1 - z0) / 60), start = positions.length / 3;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
      positions.push(x, surroundingHeight(x, z), z);
      if (i < nx && j < nz) {
        const k = start + j * (nx + 1) + i;
        indices.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2);
      }
    }
  };
  patch(-4500, -1800, -edge, 1800); patch(edge, -1800, 3000, 1800);
  patch(-edge, -1800, edge, -edge); patch(-edge, edge, edge, 1800);
  const landGeo = new THREE.BufferGeometry();
  landGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); landGeo.setIndex(indices); landGeo.computeVertexNormals();
  const landMat = new THREE.MeshLambertMaterial({ color: 0x485333 });
  rt.scene.add(new THREE.Mesh(landGeo, landMat));
  world.farH = surroundingHeight;
  const cameraFar = rt.camera.far;
  rt.camera.far = Math.max(cameraFar, 6000); rt.camera.updateProjectionMatrix();
  // 遠い小道具と軽い控えにも外周の高さを使う。戦う範囲の補間は元のまま。
  const nearHeight = world.heightAt.bind(world);
  world.heightAt = (x, z) => Math.max(Math.abs(x), Math.abs(z)) > edge ? surroundingHeight(x, z) : nearHeight(x, z);
  const roadPos = [], roadIdx = [];
  for (const path of [APPROACH, TOKAIDO]) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(length / 20)), dx = (b[1] - a[1]) / length * 2, dz = -(b[0] - a[0]) / length * 2;
    const start = roadPos.length / 3;
    for (let j = 0; j <= n; j++) for (const side of [-1, 1]) {
      const x = a[0] + (b[0] - a[0]) * j / n + dx * side, z = a[1] + (b[1] - a[1]) * j / n + dz * side;
      roadPos.push(x, (Math.max(Math.abs(x), Math.abs(z)) > world.half ? surroundingHeight(x, z) : nearHeight(x, z)) + 0.08, z);
    }
    for (let j = 0; j < n; j++) { const k = start + j * 2; roadIdx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3)); roadGeo.setIndex(roadIdx); roadGeo.computeVertexNormals();
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x66583f, side: THREE.DoubleSide });
  rt.scene.add(new THREE.Mesh(roadGeo, roadMat));
  // 砦の形は推定。丸根・鷲津は落ちた後の煙だけで、別働勢を本陣へ足さない。
  for (const [x, z, mon] of [[NAKAJIMA.x, NAKAJIMA.z, 'oda'], [ZENSHOJI.x, ZENSHOJI.z, 'oda'], [-3498, -1497, 'oda'], [-3998, -697, 'imagawa'], [-2998, 1203, 'imagawa'], [2502, -197, 'imagawa']]) {
    for (const side of [-1, 1]) rt.scene.add(palisade(world, [x + side * 18, z - 18, x + side * 18, z + 18], { h: 2.2 }));
    rt.scene.add(palisade(world, [x - 18, z + 18, x + 18, z + 18], { h: 2.2 }), hut(world, x - 6, z + 4, 6, 4, 0.2), yagura(world, x + 8, z + 8), nobori(world, x, z, mon, 5.5));
  }
  for (const [x, z] of [[-2298, 553], [-2898, 253]]) world.addSmokeColumn(x, surroundingHeight(x, z) + 3, z, { size: 3 });
  // 足した地面と道も、次の戦へ移る時に解放する。
  const dispose = world.dispose.bind(world);
  world.dispose = () => {
    landGeo.dispose(); landMat.dispose(); roadGeo.dispose(); roadMat.dispose();
    rt.camera.far = cameraFar; rt.camera.updateProjectionMatrix(); dispose();
  };
}

// 幕と手盾を横切る行き先は、本陣の口を経由する。兵と bot で同じ道を使う。
function wayCross(x, z, dx, dz, a, lo, hi) {
  if (Math.abs(dx) < 1e-6) return false;
  const t = (a - x) / dx, q = z + dz * t;
  return t > 0 && t < 1 && q > lo && q < hi;
}
function honjinWay(army, u, goal) {
  const x = localX(u.pos.x, u.pos.z), z = localZ(u.pos.x, u.pos.z);
  const tx = localX(goal.x, goal.z), tz = localZ(goal.x, goal.z);
  const dx = tx - x, dz = tz - z;
  if (!wayCross(x, z, dx, dz, 5, -126, -106) && !wayCross(x, z, dx, dz, 31, -126, -106) &&
      !wayCross(z, x, dz, dx, -125, 4, 32) && !wayCross(z, x, dz, dx, -107, 4, 13.8) && !wayCross(z, x, dz, dx, -107, 22.2, 32) &&
      !wayCross(z, x, dz, dx, -104.8, 3, 12.8) && !wayCross(z, x, dz, dx, -104.8, 23.2, 33)) return goal;
  let wx = 18, wz;
  const inside = x > 5 && x < 31 && z > -125 && z < -107;
  const targetInside = tx > 5 && tx < 31 && tz > -125 && tz < -107;
  if (inside) wz = z < -111 ? -110 : -100;
  // 奥の幕の外から口へ回る時は、先に奥の角を回る。
  // いきなり口の横へ向かうと、奥の幕を斜めに横切って止まる。
  else if (z <= -125 && x > 3 && x < 33) { wx = x < 18 ? 2 : 34; wz = -128; }
  else if (!targetInside && tz <= -125 && (x <= 4 || x >= 32)) { wx = x < 18 ? 2 : 34; wz = -128; }
  else if (z < -101) { wx = x < 18 ? 2 : 34; wz = -100; }
  else if (!targetInside && (tx < 5 || tx > 31)) { wx = tx < 5 ? 2 : 34; wz = -100; }
  else if (!targetInside && tz <= -125) { wx = x < 18 ? 2 : 34; wz = x > 4 && x < 32 ? -100 : -128; }
  else if (Math.abs(x - 18) > 2) wz = -100;
  else wz = -110;
  const q = u._okeWay || (u._okeWay = { x: 0, z: 0 });
  q.x = fieldX(wx, wz); q.z = fieldZ(wx, wz);
  return q;
}

// 幕・柵・丘の小道具を始めに一度だけ回す。当たりの形も同じだけ回す。
function fieldScenery(rt) {
  const scene = new THREE.Group(), start = SOLIDS.length;
  scene.rotation.y = FIELD_TURN; scene.position.set(FIELD_X, 0, FIELD_Z);
  rt.scene.add(scene);
  const world = Object.create(rt.world);
  world.heightAt = (x, z) => rt.world.heightAt(fieldX(x, z), fieldZ(x, z));
  return { world, scene, finish() {
    for (let i = start; i < SOLIDS.length; i++) {
      const o = SOLIDS[i];
      // 当たりの囲みは回す前の四隅から作り直す。
      const corners = [[o.x0, o.z0], [o.x0, o.z1], [o.x1, o.z0], [o.x1, o.z1]].map(fieldPathPoint);
      if (o.k === 's') {
        const a = fieldPoint(o.ax, o.az), b = fieldPoint(o.bx, o.bz);
        o.ax = a.x; o.az = a.z; o.bx = b.x; o.bz = b.z;
      } else {
        const p = fieldPoint(o.x, o.z); o.x = p.x; o.z = p.z;
        if (o.k === 'r') { const c = o.c; o.c = c * FIELD_C - o.s * FIELD_S; o.s = o.s * FIELD_C + c * FIELD_S; }
      }
      o.x0 = Math.min(...corners.map((p) => p[0])); o.x1 = Math.max(...corners.map((p) => p[0]));
      o.z0 = Math.min(...corners.map((p) => p[1])); o.z1 = Math.max(...corners.map((p) => p[1]));
    }
  } };
}

// 現代の標高は水平・高さとも一メートルを一単位で読む。旧地形の確定復元とはしない。
// 手書きの谷と道は推定。素材の格子を引き伸ばしたり、標高を潰したりしない。
let okeDem = null;
import('./asset_dem_okehazama.js').then((m) => { okeDem = m.default; }).catch(() => {});
const OKE_DEM_OPTIONS = { scale: 1, xyScale: 1 };
const okeHeight = (dem, x, z, b) => dem ? demBlend(dem, x, z, b, OKE_DEM_OPTIONS, b - 5) : b;

// 今川の小荷駄（本陣の北の窪み）。俵と幔幕の脇に荷の隊を置く（遠景。数は軽い）
function DA0(rt, scenery) {
  const W = scenery.world;
  const KT2 = nagashinojo.kit;
  for (let i = 0; i < 6; i++) {
    const load = tawara(W, HONJIN.x + 26 + (i % 3) * 3, HONJIN.z - 58 + Math.floor(i / 3) * 3, 0.3 * i, 6);
    load.userData.hist = 'GAME_C'; scenery.scene.add(load);
  }
  const baggage = KT2.farHost(rt, fieldX(HONJIN.x + 34, HONJIN.z - 66), fieldZ(HONJIN.x + 34, HONJIN.z - 66), 26, 10, 70, FIELD_TURN, 0x4a3a2a, 'imagawa', 41, 'mixed');
  baggage.army.hist = 'GAME_C';
  return baggage;
}

// 首巻の本陣急襲。八陣の名を当てず、織田は谷の縦列、今川は休息陣と分遣隊。
const OKEHAZAMA_JIN = [
  battleJin('谷を進む縦備え', 0, fieldPoint(2, 150), Math.PI + FIELD_TURN, [
    ['okhVan', '谷の先手', '名は伝わらない', 600, 2, 140, 'cols.0', 'oda'],
    ['okhMain', '谷の本備', '名は伝わらない', 1200, 2, 158, 'cols.2', 'oda'],
    ['okhNobu', '本陣', '織田信長', 200, 2, 150, 'nob', 'eiraku', 'oda'],
    ['okhSaku', '善照寺方面の控え', '佐久間信盛', 500, ...zenshojiLocal, 'jinSaku', 'oda'],
  ], '攻撃兵二千ほど。善照寺方面の五百は別の控え。家臣ごとの配置と各備の割り振りは推定。', fieldPoint),
  battleJin('休息中の備え', 1, FIELD_HONJIN, FIELD_TURN, [
    ['okhYoshi', '本陣', '今川義元', 1500, HONJIN.x, HONJIN.z + 2, 'hatamoto', 'imagawa'],
    ['okhGuard', '本陣前の守り', '名は伝わらない', 600, 0, -96, 'enemies.0', 'imagawa'],
    ['okhFrontEast', '本陣前の右の守り', '名は伝わらない', 400, 40, -92, 'enemies.1', 'imagawa'],
    ['okhWest', '本陣左の備え', '松井宗信', 1000, -22, -118, 'enemies.2', 'imagawa'],
    ['okhEast', '本陣右の備え', '名は伝わらない', 1000, 40, -124, 'enemies.3', 'imagawa'],
    ['okhReserve', '本陣後ろの控え', '名は伝わらない', 1500, -4, -134, 'enemies.4', 'imagawa'],
  ], '今川全軍二万五千とも。本陣周辺は五千から六千とする説があり、ここでは六千を分けた目安。松平元康らの大高・丸根方面の別働勢はここへ集めない。', fieldPoint),
];

const okehazama = {
  jinkei: OKEHAZAMA_JIN,
  noWake: false,
  noReserve: true,
  botOrders: true,   // 性格の突進で、組について進む下知や反撃の隙を上書きしない。
  prelude: false,   // 奇襲の戦は溜めない（prelude.js）
  spawn: { ...fieldPoint(-16, -24), heading: Math.PI + FIELD_TURN },
  lordSpawn: { ...fieldPoint(-44, 8), heading: Math.PI + FIELD_TURN },
  lordAt: { ...fieldPoint(-44, 2), r: 16, why: '谷の馬廻の後ろ（接近路の細かな位置は推定）' },
  world: {
    seed: 3,
    noticeRepeatGap: 30,
    // 実寸で置いた外周の砦にも歩いて入れる。既定の176mでは梯子の前で本陣側へ戻される。
    // 地面を足した範囲に収め、近景の地面や戦う兵は増やさない。
    moveLim: 4500,
    playerBounds: { minX: -4490, maxX: 2990, minZ: -1790, maxZ: 1790 },
    moveWay: honjinWay,
    runnerWay: honjinWay,   // 遠い使番も幕の口へ回り、壁を抜けない。
    muddy: 0.85,     // 豪雨の後の山道はぬかるむ
    paths: [APPROACH, TOKAIDO],
    height(wx, wz) {
      // 舞台の最初の高さを取る時に固定する。遅れて素材が届いても地面を替えない。
      if (!Object.hasOwn(this, '_okeDem')) this._okeDem = okeDem;
      const x = localX(wx, wz), z = localZ(wx, wz);
      let h = 6 * Math.sin(x * 0.021 + 0.5) * Math.cos(z * 0.018) + 3 * Math.sin(x * 0.05) * Math.sin(z * 0.043 + 1);
      h += 16 * gauss(x, z, -85, -10, 2600) + 12 * gauss(x, z, 80, 40, 3000) + 10 * gauss(x, z, 75, -60, 2200) + 9 * gauss(x, z, -70, 110, 2400);
      h += 6 * gauss(x, z, HONJIN.x, HONJIN.z, 1400) + 5 * gauss(x, z, -46, -34, 500);
      // 桶狭間山の本陣周辺の丘と谷。田楽窪の伝説地は北東の外周に分ける
      h += 9 * gauss(x, z, HONJIN.x - 58, HONJIN.z - 6, 900) + 10 * gauss(x, z, HONJIN.x + 60, HONJIN.z + 4, 1000);
      const d = distToPolyline(x, z, P1);
      h -= 4 * Math.exp(-(d * d) / 300);
      return okeHeight(this._okeDem, wx, wz, h);
    },
    clear: (wx, wz) => {
      const x = localX(wx, wz), z = localZ(wx, wz);
      return Math.hypot(x - HONJIN.x, z - HONJIN.z) < 28 || Math.hypot(x, z + 96) < 16 || Math.hypot(x - 40, z + 92) < 14 ||
      Math.hypot(x + 22, z + 118) < 16 || Math.hypot(x, z - 162) < 20 || (z < -30 && z > -66 && x > -50 && x < 36) || Math.hypot(x + 46, z + 34) < 10 ||
      Math.hypot(x - 124, z - 110) < 34;
    },   // 谷の村
    trees: 520,
    lightning: true,
    rainDir: [FIELD_C * 0.18 - FIELD_S * 0.98, -FIELD_S * 0.18 - FIELD_C * 0.98],   // 雨は織田の後ろから本陣へ：織田の背を押し、今川の顔に吹きつける（信長公記）
    // 谷あいの小川と、東の谷の村の水路（要件：竹林・小川・水路・村）
    waterSlow: true,   // 川を渡る間は遅く、馬はもっと遅い（terrain_tags.js の water。10/2）
    streams: [{ pts: [[-70, -150], [-52, -96], [-60, -40], [-80, 20]].map(fieldPathPoint), w: 1.8, depth: 0.9 }, { pts: [[100, 80], [124, 108], [150, 140]].map(fieldPathPoint), w: 1.6, depth: 0.8 }],
    // 谷の田と畦（A036）：道と本陣のまわりを除いて水を張る
    hail: true,
    fieldStage: 'seedling',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(wx, wz) {
      const x = localX(wx, wz), z = localZ(wx, wz);
      if (z > 110 || z < -76 || Math.abs(x) > 96 || Math.hypot(x - HONJIN.x, z - HONJIN.z) < 40 || (Math.abs(x) < 14 && z > 0)) return 0;
      if (distToPolyline(x, z, P1) < 5) return 0;
      if ((Math.floor(x / 20) + Math.floor(z / 16)) % 2 !== 0) return 0;
      const ex = Math.min(((x % 20) + 20) % 20, 20 - ((x % 20) + 20) % 20), ez = Math.min(((z % 16) + 16) % 16, 16 - ((z % 16) + 16) % 16);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.9) / 0.6));
    },
    groves: [{ ...fieldPoint(132, 96), r: 10, n: 22 }, { ...fieldPoint(112, 124), r: 8, n: 16 }, { ...fieldPoint(-60, -70), r: 16, n: 26 }, { ...fieldPoint(55, -20), r: 18, n: 30 }, { ...fieldPoint(-50, 20), r: 14, n: 18 }, { ...fieldPoint(HONJIN.x - 58, HONJIN.z - 6), r: 16, n: 30 }, { ...fieldPoint(HONJIN.x + 62, HONJIN.z + 6), r: 16, n: 30 }],
    // 本陣のまわりは踏み荒らされて泥（雨の後）
    tint(wx, wz, h, c) {
      const x = localX(wx, wz), z = localZ(wx, wz);
      const d = Math.hypot(x - HONJIN.x, z - HONJIN.z);
      if (d < 34) c.lerp({ r: 0.3, g: 0.26, b: 0.2 }, 0.45 * Math.min(1, (34 - d) / 12));
    },
  },
  setup(rt) {
    // 共通の声は、この戦の側で差し替える。使番へ渡す前にも整える。
    const words = (text) => String(text).replace(/今川義元「討ち取ったり！」/g, '今川義元「うろたえるな！　陣を固めよ！」');
    const say = rt.say, bark = rt.bark;
    rt.say = function (who, text, dur) {
      text = words(text);
      if (who === '織田信長') {
        who = '使番';
        text = `殿のお下知じゃ。${text}`;
      }
      return say.call(this, who, text, dur);
    };
    rt.bark = function (text, warn) { return bark.call(this, words(text), warn); };
    // 使番の到着後を含め、実際に出す台詞を三分あける。札は別の時計を保つ。
    const recent = new Map(), hudSay = rt.hud.say, hudBark = rt.hud.bark, hudBanner = rt.hud.banner;
    const repeatOk = (text) => {
      const key = String(text).replace(/^[^「]*「|」$/g, '').replace(/[。！\s]/g, '');
      if (rt.t - (recent.get(key) ?? -Infinity) < 180) return false;
      recent.set(key, rt.t); return true;
    };
    rt.hud.say = function (who, text, dur) { if (repeatOk(text)) return hudSay.call(this, who, text, dur); return false; };
    rt.hud.bark = function (text, warn) { if (repeatOk(text)) return hudBark.call(this, text, warn); };
    rt.hud.banner = function (title, sub, ...rest) {
      if (title === '一騎打ち') {
        if (rt.flags.duelHintShown) return;
        rt.flags.duelHintShown = true;
      }
      return hudBanner.call(this, title, sub, ...rest);
    };
    const onKill = rt.onKill;
    rt.onKill = function (victim, killer) {
      const victoryCry = victim === this.flags.yoshimoto && killer === this.flags.nobKill?.[1];
      const call = !this.over && !this.flags.quiet && killer?.alive &&
        victim.team !== killer.team && !killer.isStruct && !killer.civ &&
        !victim.isStruct && !victim.civ && !victoryCry && (killer.killCryT ?? -99) + 8 <= this.t;
      // 敵側の肉声も抑える。毛利が義元を討った時だけ勝ち名乗りを通す。
      if (killer && !victoryCry) killer.killCryT = this.t;
      if (victoryCry) killer.killCryT = -Infinity;
      onKill.call(this, victim, killer);
      if (call) cryCaption(this, killer.pos, killer === this.flags.yoshimoto ?
        '今川義元「うろたえるな！　陣を固めよ！」' :
        `${killer.name || (killer.team === this.player.u.team ? '味方の兵' : '今川の兵')}「${killer.team === this.player.u.team ? '道を開け！　本陣へ寄せるぞ！' : '陣を固めよ！'}」`);
    };
    // 未の刻ごろの豪雨。鉛色の雲の下でも、顔・具足・旗に昼の散乱光を回す。
    const rainWorld = rt.world, lookOf = rainWorld.lookOf;
    rainWorld.lookOf = function (key) {
      const look = lookOf.call(this, key);
      if (key === 'storm') {
        look.sky.setHex(0x929a9d); look.fog.setHex(0xa4abad); look.top.setHex(0x737f84);
        look.sun.setHex(0xe2e4de); look.sunI = Math.max(look.sunI, 1.65);
        look.hemiSky.setHex(0xd0d3cf); look.hemiGround.setHex(0x8a8376);
        look.hemiI = Math.max(look.hemiI, 2.4);
        look.cloudDark = 0.35;
      }
      return look;
    };
    // 配列の窓を開戦時に縮める。雨量・雷・ぬかるみは保ち、毎コマ動かす雨筋を減らす。
    rainWorld.rainData = rainWorld.rainData.subarray(0, 720 * 3);
    // 手前の太い板状の雨は使わず、一画素の細い線だけにする。
    rainWorld.nearRain = rainWorld.nearRain.subarray(0, 0);
    rainWorld.rainNear.geometry.setDrawRange(0, 0);
    // 共通の天候更新は昼の豪雨の見通しを220mにするので、その後にこの戦だけ整える。
    // 近くの色を残し、遠景は霞ませる。硝煙・土ぼこりによる目隠しは保つ。
    const weatherUpdate = rainWorld.update;
    rainWorld.update = function (dt, focus) {
      weatherUpdate.call(this, dt, focus);
      const smoke = Math.min(1, (this.haze?.k || 0) + (this.dustVeil?.k || 0));
      const lift = (320 - 220) * this.rainLevel * (1 - smoke);
      this.vis += lift;
      // 小数部は雲の影に使うため、見通しは整数部だけ替える。
      this.scene.fog.far = Math.floor(this.vis) + (this.scene.fog.far % 1);
      this.mountU.vis.value = this.vis;
      this.rain.material.opacity = 0.18 * this.rainLevel;
    };
    // 初陣の打撃・同時に打ち込む人数は共通設定を保つ。倒れた後の救済は使わない。
    rt.firstFights = false; rt.flags.rescued = true;
    // 忍んで寄せる間は太鼓で進めと促さない。かかれの合図で解く。
    rt.flags.quiet = true;
    fieldSurroundings(rt);
    const scenery = fieldScenery(rt);
    const W = scenery.world;
    // 今川本陣：陣幕の内に床几と馬印、脇に旗竿・兵糧・馬の杭（義元と旗本は戦う兵で置く）
    const KT = nagashinojo.kit;
    const camp = KT.honjin(scenery, HONJIN.x, HONJIN.z, { mon: 'imagawa', w: 26, d: 18, gap: 10, people: false, tate: false });
    for (const [a, b] of [[4, 11.8], [24.2, 32]]) scenery.scene.add(okePalisade(W, a, b));
    okeCloth(camp, W);
    // 母衣だけの形を複製して使い回す。共有の甲冑や次の戦には書き込まない。
    rt.flags.horoShapes = new Map();
    const dispose = rt.world.dispose.bind(rt.world);
    rt.world.dispose = () => {
      for (const [original, copy] of rt.flags.horoShapes) if (original !== copy) copy.dispose();
      rt.flags.horoShapes.clear();
      rt.hud.say = hudSay; rt.hud.bark = hudBark; rt.hud.banner = hudBanner;
      dispose();
    };
    // 遠景の村（東の谷。雨の中に茅葺きの屋根）
    KT.farVillage(scenery, 124, 110, { rot: Math.PI / 2, n: 6, fields: 8, seed: 3 });
    // 本陣の脇に兵糧の俵
    scenery.scene.add(tawara(W, HONJIN.x - 16, HONJIN.z + 4, 0.3, 6), tawara(W, HONJIN.x + 16, HONJIN.z - 3, -0.5, 5));
    for (const [x, z] of [[6, -106], [30, -106], [4, -128], [32, -128]]) scenery.scene.add(nobori(W, x, z, 'imagawa', 6));
    // 今川の赤鳥の幟：白地に朱の赤鳥（櫛の形）。本陣の奥に混ぜる
    customFlag('akadori', (g) => {
      g.save(); g.fillStyle = g.strokeStyle = '#a8281c';
      g.translate(64, 84);
      g.beginPath(); g.ellipse(0, -8, 34, 16, 0, Math.PI, 0); g.lineTo(34, 2); g.lineTo(-34, 2); g.closePath(); g.fill();
      for (let i = 0; i < 15; i++) { const x = -31 + i * 4.4; g.fillRect(x, 2, 2.4, 26); }
      g.fillStyle = '#e8e2d2'; g.beginPath(); g.ellipse(0, -8, 22, 8, 0, Math.PI, 0); g.fill();
      g.restore();
    });
    for (const [x, z] of [[12, -132], [26, -132], [-2, -118]]) scenery.scene.add(nobori(W, x, z, 'akadori', 6.5));
    // 円陣の中心（18, -114）と退く口に、当たりのある焚火を置かない。
    for (const [x, z] of [[0, -96], [40, -92], [-22, -118], [10, -116]]) { scenery.scene.add(campfire(W, x, z)); rt.world.addFire(fieldX(x, z), fieldZ(x, z)); }
    scenery.scene.add(hut(W, -2, -104, 5, 3.5, 0.4, { wall: 0x857058 }));
    // 義元の塗輿：本陣の幕の内、床几の脇に据えてある
    rt.flags.koshi = koshi(W, HONJIN.x + 5, HONJIN.z - 3, 0.3);
    scenery.scene.add(rt.flags.koshi);

    // 味方の行軍（先手・一の組・自分の槍組・後備）
    // 釜ヶ谷を思わせる林の低地から、十六歩ほど隠れて寄せる（場所・距離は推定）。
    const finals = [[-28, -52], [12, -52], [-8, -46], [-22, -38]];
    const specs = [
      { name: '織田の先手', n: 19 },
      { name: '織田の一の組', n: 20 },
      { name: '織田の槍組', n: 10 },
      { name: '織田の後備', n: 18 },
    ];
    rt.flags.cols = [];
    specs.forEach((sp, i) => {
      const [sx, sz] = finals[i];
      const g = allyGroup(rt, { fixed: true, fullStrength: true, noGuard: true, name: sp.name, anchor: fieldPoint(sx, sz + 16), facing: Math.PI + FIELD_TURN, formation: 'column', spacing: 1.4, order: 'hold', speed: 3.0, morale: 100, noRout: true, fleeDir: fieldVector(0, 1) },
        [{ type: 'samurai', n: 1, o: { name: '' } }, { type: 'ashigaru', n: sp.n }]);
      g.leader = g.units[0];
      g.path = [[sx, sz + 16], [sx, sz]].map(fieldPathPoint); g.pathIdx = 0;
      if (i === 2) {
        // 総数は保ち、手前の組の四人を両翼へ分ける。背中と槍が正面に重なりにくくする。
        g.colW = 3;
        rt.flags.genpachi = g.units[0];
        rt.flags.yashichi = g.units[1];
        // 組頭と足軽にも、普通の兵と同じ死傷がある。
        rt.hostGroup = g;
      }
      if (i === 0) rt.flags.yohei = g.units[0];
      g.onArrive = (gg) => { gg.arrived = true; gg.order = 'hold'; gg.formation = 'yari'; gg.facing = Math.PI + FIELD_TURN; };
      rt.flags.cols.push(g);
    });
    // 信長の馬廻
    const nob = allyGroup(rt, { fixed: true, fullStrength: true, noGuard: true, name: '馬廻', anchor: fieldPoint(-44, 2), facing: Math.PI + FIELD_TURN, formation: 'column', order: 'hold', speed: 3.3, noRout: true },
      [...(rt.G.lord ? [] : [{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true, flag: 'eiraku', horse: true, haori: 0x7a1d14 } }]), { type: 'samurai', n: 1, o: { name: '服部小平太', flag: 'eiraku', invuln: true, horse: false } }, { type: 'samurai', n: 1, o: { name: '毛利新介', flag: 'eiraku', invuln: true, horse: false } }, { type: 'busho', n: 1, o: { name: '前田利家', flag: 'eiraku', invuln: true, horse: false } }, { type: 'busho', n: 1, o: { name: '木下雅楽助', flag: 'eiraku', invuln: true, horse: false } }, { type: 'busho', n: 1, o: { name: '中川金右衛門', flag: 'eiraku', invuln: true, horse: false } }, { type: 'samurai', n: 12, o: { flag: 'eiraku', horse: false } }]);
    nob.path = [[-44, 2], [-44, -30]].map(fieldPathPoint);
    nob.onArrive = (g) => { g.order = 'hold'; g.formation = 'line'; g.facing = Math.PI + FIELD_TURN; };
    rt.flags.nob = nob;
    rt.flags.nobKill = [nob.units.find((u) => u.name === '服部小平太'), nob.units.find((u) => u.name === '毛利新介')];
    const hat = rt.flags.nobKill[0];
    if (hat) {
      // 接触した相手の実際の打撃で手傷を負う。時刻だけでは傷を作らない。
      hat.allyOk = true;
      rt.flags.hattoriWound = hat.onWound = (src) => {
        const hit = hat.lastHit;
        hat.onWound = null;
        rt.army.generalWounded(hat, src);
        // 共通の退場処理が胴の傷に置き換えるため、実際の命中部位を戻す。
        if (hit && hat.hit) {
          hat.hit.part = hit.part; hat.hit.res = hit.res; hat.hit.wkind = hit.wkind;
          hat.hit.from = hit.from; hat.hit.side = hit.side;
          hat.lastHit = hat.hit;
        }
        const y = rt.flags.yoshimoto;
        if (y && src?.pos && src.group === rt.flags.hatamoto &&
            Math.hypot(hat.pos.x - y.pos.x, hat.pos.z - y.pos.z) < 6) {
          rt.flags.hattoriMet = true; rt.flags.hattoriWounded = true;
          const legCut = src === y && hit && (hit.part === 'leg' || hit.part === 'thigh') && src.weapon === 'sword' && hit.res !== 'armor';
          rt.flags.hattoriLegCut = !!legCut;
          if (sightPoint(rt, hat.pos)) rt.bark(legCut ? '服部が義元に脚を斬られ、退く。毛利が代わって寄せる' : '服部が手傷を負って退く。毛利が代わって寄せる');
        }
      };
    }
    rt.flags.attackers = [...rt.flags.cols, nob];
    // 信長の馬印（金の扇）は、馬印持ちが信長の後ろについて運ぶ
    if (!rt.G.lord && nob.units[0]) rt.flags.uma = umaFollow(rt.world, rt.scene, nob.units[0], 'ogi');

    // 今川勢（休息中）
    const E = rt.flags.enemies = [];
    // 前の備えの無名の侍を一騎ずつ騎乗させる補完。討たれれば空馬が残る（実兵数は変えない）。
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(0, -96), facing: FIELD_TURN, morale: 85, fleeDir: fieldVector(0.2, -1), aggro: 7 }, [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'ashigaru', n: 8 }]));
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(40, -92), facing: (-0.4) + FIELD_TURN, morale: 85, fleeDir: fieldVector(0.6, -1), aggro: 7 }, [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'ashigaru', n: 4 }, { type: 'bow', n: 4 }]));
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(-22, -118), facing: (0.3) + FIELD_TURN, morale: 85, fleeDir: fieldVector(-0.5, -1), aggro: 7 }, [{ type: 'busho', n: 1, o: { name: '松井宗信' } }, { type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }]));
    // 本陣の両脇と後方で休む組。近い敵へ備えを向ける。
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(40, -124), facing: (-0.8) + FIELD_TURN, morale: 85, fleeDir: fieldVector(0.6, -1), aggro: 7 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }]));
    E.push(enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', formation: 'yari', spacing: 1.5, width: 12, anchor: fieldPoint(-4, -134), facing: (0.2) + FIELD_TURN, morale: 85, fleeDir: fieldVector(-0.2, -1), aggro: 7 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 11 }, { type: 'bow', n: 2 }]));
    // 輿を捨てた義元は徒歩で刀を振るう。武将の既定の騎乗を使わない。
    const H = enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa', name: '義元の旗本', formation: 'ring', width: 12, anchor: fieldPoint(HONJIN.x, HONJIN.z + 2), facing: FIELD_TURN, morale: 100, fleeDir: fieldVector(0, -1), aggro: 6, noRout: true, spacing: 1.8 },
      [{ type: 'busho', n: 1, o: { name: '今川義元', horse: false, invuln: true, noHead: true, flagScale: 1.4 } }, { type: 'busho', n: 1, o: { name: '山田新右衛門', horse: false } }, { type: 'samurai', n: 29, o: { hp: 55, maxHp: 55 } }]);
    rt.flags.yoshimoto = H.units[0];
    // 義元は主人公だけでなく味方の槍でも傷つく。首を挙げる筋は毛利新介へ結ぶ。
    H.units[0].allyOk = true;
    H.units[0].onWound = () => {
      if (rt.flags.yoshiDown) return;
      rt.flags.yoshiDown = true; rt.flags.yoshiDownT = rt.t;
      const y = H.units[0];
      y.target = null; y.atk = null; y.swing = null;
      y.hit = { kind: 'kneel', t: 0, dur: 1.2, from: 'front', side: 1, part: 'torso', res: 'gap', heavy: true, wkind: 'thrust' };
      y.lastHit = y.hit;
      if (sightPoint(rt, y.pos)) rt.bark('義元が深手を負った。旗本が囲んで支えている。味方と囲みを崩せ');
    };
    rt.flags.hatamoto = H;
    rt.flags.guardStart = H.units.filter((u) => u !== H.units[0] && readyUnit(u)).length;
    H.guard = true;
    // 幕の内の二重の囲み。近づく敵へ踏み出し、義元から離れすぎない。
    H.guardSight = 24; H.guardLeash = 6; H.seekRange = 12;
    H.defMult = 1;
    for (const g of E) { g.guard = true; g.guardSight = 32; g.guardLeash = 12; g.fire = false; }
    E.push(H);
    // 本陣前・右・左の備えから十八人を道へ分ける遊びの補完。増援を湧かせない。
    // 最初の六人は谷の出口手前の見張り。行軍中の小競り合いも遊びの補完。
    // 本陣への急襲は雨の切れ目と信長の合図を待つ。
    rt.flags.road = [[-10, -40], [2, -80], [18, -96]].map(([x, z], i) => {
      const g = enemyGroup(rt, { fixed: true, noGuard: true, faction: 'imagawa',
        name: '谷の守り' + ['一の組', '二の組', '三の組'][i], formation: 'yari',
        spacing: 1.3, width: 6, anchor: fieldPoint(x, z), facing: FIELD_TURN,
        morale: 70, aggro: 0, fleeDir: fieldVector(0, -1) },
        [{ type: 'ashigaru', n: 4 }, { type: 'ashigaru', n: 2, o: { weapon: 'sword', reach: 1.75 } }]);
      E.push(g);
      return g;
    });
    rt.flags.roadStep = -1;

    // 主君で遊ぶ時も、所在が確定していない者から義元の居場所を聞かせない。
    if (rt.G.lord) {
      rt.flags.nobSeen = true;
      rt.setPhase('brief');
      rt.world.setTime('storm'); rt.world.setRainTarget(1);
      rt.obj('honjin0', '今川の備えへかかれ', 'main');
      localSay(rt, rt.G.lord ? rt.player.u : rt.flags.nob, '織田信長', '首は取るな、討ち捨てにせよ。敵の備えを突き崩せ。――出るぞ', 4);
      rt.after(4, () => this.brief(rt));
    } else {
    rt.obj('talk', '組の旗のそばへ行き、組頭の下知を聞け', 'main');
    rt.marker('genpachi', unitPos(rt.flags.genpachi), '組頭・組の旗', { person: true });
    rt.addInteract('talk', unitPos(rt.flags.genpachi), '下知を聞く', () => this.brief(rt), { r: 3.5 });
    rt.setPhase('brief');
    rt.world.setTime('storm'); rt.world.setRainTarget(1);
    localSay(rt, rt.flags.yashichi, '組の足軽', `おう、${nm(rt)}。組頭のそばへ歩け。近づけば「下知を聞く」が出るぞ`, 4);
    }
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    rt.flags.hist = { honjin: 'HIST_B', oketaniTerrain: 'HIST_B', rain: 'HIST_A', nakajimaFort: 'HIST_B', distantArmies: 'GAME_C', takane: 'HIST_B', denrakutsubo: 'HIST_B', kamagaya: 'HIST_B', baggage: 'GAME_C', villageStream: 'GAME_C' };
    // 今川の小荷駄（本陣の北の窪みに荷車と俵。遠景の隊と荷）
    const baggage = DA0(rt, scenery);
    // 本陣周辺六千のうち、戦う範囲の外にいる控えを軽く描く。大高の別働勢は置かない。
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, fieldX(x, z), fieldZ(x, z), w, d, count, facing + FIELD_TURN, armor, flag, seed, kind);
    rt.flags.imaDA = [DA(-20, -210, 70, 16, 300, 0, 0x3f2a24, 'imagawa', 3, 'mixed')];
    [[82, -180, 32, 16, 180, -0.3, 'spear'], [-72, -170, 30, 20, 160, 0.4, 'mixed']]
      .forEach(([x, z, w, d, n, f, kind], i) => rt.flags.imaDA.push(DA(x, z, w, d, kind === 'cavalry' ? 110 : n, f, i % 2 ? 0x3a3026 : 0x3f2a24, 'imagawa', 11 + i, kind)));
    // 荷の護衛も知らせを受けて退く。近づけば既存の総枠で本物へ替わる。
    rt.flags.imaDA.push(baggage);
    // 奥の控えと荷駄は本物へ替えない。迷って本陣の後ろへ寄ると、今川が百人以上湧いて250人の枠を超えた（10/7）。
    for (const m of rt.flags.imaDA) m.army.noWake = true;
    // 落ちた丸根・鷲津の煙のそばと大高方面に、別働の槍列を分ける。
    // 人数・細かな持ち場と移動は遊びの補い。本陣周辺六千の表示には足さない。
    rt.flags.detached = [[-2298, 593], [-2898, 293], [-3498, 803]].map(([x, z], i) => {
      const m = rt.world.addDistantArmy({ x, z, w: 22, d: 10, count: 72, facing: -Math.PI / 2,
        armor: 0x3f2a24, mon: 'imagawa', seed: 151 + i, kind: 'spear', host: false });
      m.army.hist = 'GAME_C';
      m.advance(18, 36 + i * 6);
      return m;
    });
    // 織田の後詰（善照寺砦の方）
    rt.flags.jinSaku = KT.farHost(rt, ZENSHOJI.x, ZENSHOJI.z, 30, 40, 80, Math.PI + FIELD_TURN, 0x2b3140, 'oda', 4, 'spear');
    // 織田の本隊（二千ほど）：行軍が始まると、組の後ろから山あいの道を続いてくる
    rt.flags.far = [];
    for (let i = 0; i < 8; i++) {
      const q = farArmy(rt, fieldX(0, 200), fieldZ(0, 200), 5, 12, 36, FIELD_TURN, 0x2b3140, i % 3 === 1 ? 'eiraku' : 'oda', 70 + i);
      const side = i % 2 ? 3 : -3;
      // 道の途中（組が待つ谷の手前）で止まる。組の待つ所を通り抜けて、戦う兵と重ならないように
      q.path = [[side, 200], ...P1.filter(([, z]) => z > -20).map(([x, z]) => [x + side, z]), [-36 + (i % 4) * 14, -18 + Math.floor(i / 4) * 12]];
      q.s = -i * 14;   // 間をあけて続く
      q.m.visible = false;
      // 行き来する本隊を本物の兵へ替えない（250人の枠を守る。帰り道で味方が湧かない）。
      q.a.noWake = true;
      rt.flags.far.push(q);
    }
    // 本陣の左右でも、ほかの織田の組が今川の備えと組み合う（軽い作り。兵の数・任務には数えない）。
    // 雨の間は霧に沈み、晴れると両脇に合戦が見える。本物の兵へは替えない。
    rt.flags.wings = [[-78, -96, 0.25, 191], [92, -96, -0.3, 192]].map(([x, z, f, seed]) => clash(rt, {
      ...fieldPoint(x, z), facing: Math.PI + FIELD_TURN + f, w: 40, gap0: 44, closeSpeed: 2.6, seed, noRout: true, killRate: 0.1,
      A: { flag: 'oda', armor: 0x2b3140, count: 220 },
      B: { flag: 'imagawa', armor: 0x3f2a24, count: 300, bows: true, flagRate: 0.5 } }));
    scenery.finish();
    buildBattleJin(rt);
    // 名のない敵の仮名は、この戦だけの名簿から選ぶ。実在の武将の名は保つ。
    const foeNames = ['源六', '平八', '彦七', '新八', '又六', '弥三郎', '喜助', '弥五郎']
      .filter((name) => name !== rt.G.name && name !== nm(rt));
    for (const g of E) for (const u of g.units) {
      if (!u.name && u.type === 'samurai') u.name = foeNames[u.id % foeNames.length];
    }
    // 備え表の共通接続で槍列へ戻される旗本を、義元中心の囲みへ戻す。
    H.formation = 'ring'; H.leader = rt.flags.yoshimoto;
    for (let i = 0; i < H.units.length; i++) {
      const u = H.units[i], q = H.slotPos(i, H.initial);
      u.pos.x = q.x; u.pos.z = q.z; u.pos.y = rt.world.heightAt(q.x, q.z); u.mesh.position.copy(u.pos);
    }
    for (let i = 0; i < rt.flags.attackers.length; i++) {
      const g = rt.flags.attackers[i];
      g.yariRanks = 3; g.okeSide = [-12, 12, 0, -6, 4][i]; g.okeBack = i === 4 ? 9 : 3;
    }
  },

  // 軽い本隊は行軍だけを表す。接触域へは押し込まず、実兵と重ねない。
  moveFar(rt, dt) {
    if (rt.phase !== 'march' && !rt.flags.victory) return;
    for (const q of rt.flags.far) {
      if (rt.flags.victory && q.returnWaiting) continue;
      if (!q.done) q.s += dt * 2.5;
      // 入れ物は隊ごとに一つ。毎コマ位置の物を作らない。
      const p = q.walk || (q.walk = { x: 0, z: 0, h: 0, end: false });
      let left = Math.max(0, q.s);
      for (let i = 1; i < q.path.length; i++) {
        const a = q.path[i - 1], b = q.path[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (left <= length || i === q.path.length - 1) {
          const k = length > 0 ? Math.min(1, left / length) : 1;
          p.x = a[0] + (b[0] - a[0]) * k; p.z = a[1] + (b[1] - a[1]) * k;
          p.h = Math.atan2(b[0] - a[0], b[1] - a[1]); p.end = left >= length && i === q.path.length - 1;
          break;
        }
        left -= length;
      }
      q.done = p.end; q.m.visible = q.s > 0;
      moveFar(rt, q, fieldX(p.x, p.z), fieldZ(p.x, p.z), (p.end ? rt.flags.victory ? 0 : Math.PI : p.h) + FIELD_TURN);
    }
  },
  brief(rt) {
    if (rt.over || rt.flags.ending || rt.phase !== 'brief' || rt.flags.briefed) return;
    rt.flags.briefed = true;
    rt.uninteract('talk'); rt.unmark('genpachi'); rt.objDone('talk');
    if (!rt.G.lord) localSay(rt, rt.hostGroup, '組頭', '丸根と鷲津が落ちた。首も分捕りも捨て置け。組の旗に続け', 5);
    rt.after(3, () => this.startMarch(rt));
  },
  startMarch(rt) {
    if (rt.over || rt.flags.ending || rt.phase !== 'brief') return;
    rt.setPhase('march'); rt.objRemove('talk');
    this.marchFlag(rt);
    localSay(rt, rt.hostGroup, '組頭', '林の陰を進め。谷の出口で槍をそろえ、雨の切れ目を待つぞ', 4);
    // 合図で移し直さず、同じ兵が林の低地から歩いて接近する。
    for (const g of rt.flags.cols) { g.arrived = false; g.order = 'path'; g.pathIdx = 0; }
    rt.flags.nob.order = 'path'; rt.flags.nob.pathIdx = 0;
    // 豪雨の間は遠くの列に気づきにくい。至近の敵には普段どおり応戦する。
    for (const g of rt.flags.enemies) g.guardSight = 16;
    rt.flags.rain = true; rt.world.setTime('storm'); rt.world.setRainTarget(1);
    rt.banner('釜ヶ谷を抜ける', '谷と林の陰をたどる。道の細かな位置は推定');
    this.march(rt);
  },
  marchFlag(rt) {
    rt.obj('col', 'すぐ先の組の旗について進め', 'main');
    rt.marker('genpachi', () => {
      const g = rt.hostGroup, s = g.stds && g.stds[0], u = s && s.userData.carrier;
      return u && u.alive ? u.pos : g.count ? g.center() : null;
    }, '組の旗');
  },
  update(rt, dt) {
    const F = rt.flags;
    if (F.uma) F.uma.update(dt);
    if (rt.over || F.ending || !rt.player.u.alive) return;
    this.horoDetail(rt);
    if (rt.phase === 'brief' && rt.t > 12) this.brief(rt);
    nagashinojo.kit.backTick(rt);
    this.guideBack(rt);
    this.moveFar(rt, dt);
    if (rt.phase === 'march') this.march(rt, dt);
    else if (rt.phase === 'wait') this.wait(rt);
    else if (rt.phase === 'assault') this.assault(rt, dt);
  },
  // 遅れて届く骨の入った人にも、一秒に一度、新しい形だけ布の仕立てを足す。
  horoDetail(rt) {
    const F = rt.flags;
    if (!F.horoShapes || rt.t < (F.horoAt || 0)) return;
    F.horoAt = rt.t + 1;
    const dress = (m) => {
      const original = m.geometry, UV = original?.attributes.uv, N = original?.attributes.normal;
      if (!UV || !N || m.material?.map !== UNIT_MAT.map) return;
      if (F.horoShapes.has(original)) { m.geometry = F.horoShapes.get(original); return; }
      let hasCloth = false;
      for (let i = 0; i < UV.count; i++) if (UV.getX(i) > 0.75 && UV.getX(i) < 0.875 && UV.getY(i) > 0 && UV.getY(i) < 0.25) { hasCloth = true; break; }
      if (!hasCloth) { F.horoShapes.set(original, original); return; }
      const copy = original.clone(), P = copy.attributes.position;
      for (let i = 0; i < UV.count; i++) {
        const u = (UV.getX(i) - 0.75) * 8, t = UV.getY(i) * 4;
        if (u <= 0 || u >= 1 || t < 0 || t > 1) continue;
        const seam = Math.pow(Math.abs(Math.cos(u * Math.PI * 12)), 8);
        const fold = -0.012 * seam + (t > 0.9 ? 0.018 : 0);
        P.setXYZ(i, P.getX(i) + N.getX(i) * fold, P.getY(i) + N.getY(i) * fold - Math.pow(t, 8) * 0.025, P.getZ(i) + N.getZ(i) * fold);
      }
      copy.computeVertexNormals(); copy.computeBoundingSphere();
      F.horoShapes.set(original, copy); F.horoShapes.set(copy, copy); m.geometry = copy;
    };
    for (const u of rt.army.units) if (u.look?.horo && !u.gone) {
      u.mesh?.traverse(dress); u.human?.root?.traverse(dress);
    }
  },
  // 半秒に一度だけ距離を見る。戦う兵や、毎コマの入れ物は増やさない。
  guideBack(rt) {
    const F = rt.flags;
    if (F.victory && F.guideWarn) { F.guideWarn = ''; rt.objRemove('oke-back'); rt.unmark('oke-back'); }
    if (rt.G.lord || F.victory || rt.t < (F.guideAt || 0)) return;
    F.guideAt = rt.t + 0.5;
    const host = readyGroup(rt.hostGroup) ? rt.hostGroup : F.attackers.find(readyGroup);
    if (!host) return;
    const target = F.guidePos || (F.guidePos = { x: 0, z: 0 });
    let x = 0, z = 0, n = 0;
    for (const u of host.units) if (readyUnit(u)) { x += u.pos.x; z += u.pos.z; n++; }
    target.x = x / n; target.z = z / n;
    const u = rt.player.u, d = Math.hypot(target.x - u.pos.x, target.z - u.pos.z);
    const hurt = u.hp < u.maxHp * 0.65 && !!rt.army.nearestEnemy(u, 12);
    const warn = d > (F.guideWarn ? 18 : 24) || hurt;
    if (warn) {
      const text = hurt ? '傷が深い。敵を向き、味方の列へ退け' : '組の旗へ戻れ。味方と進め';
      if (F.guideWarn !== text) {
        rt.obj('oke-back', text, 'side');
        if (!F.guideWarn) rt.marker('oke-back', () => F.guidePos, 'ここへ戻る・味方の列');
        F.guideWarn = text;
        rt.bark(text, hurt);
      }
    } else if (F.guideWarn) {
      F.guideWarn = ''; rt.objRemove('oke-back'); rt.unmark('oke-back');
    }
  },
  march(rt, dt = 0) {
    const F = rt.flags, host = rt.hostGroup;
    const c = readyGroup(host) ? host.center() : null, p = rt.player.u.pos;
    const distance = c ? Math.hypot(c.x - p.x, c.z - p.z) : Infinity;
    // 既存の見張りだけが行軍八秒後に寄せる。兵を足さず、位置も移し直さない。
    if (!F.scoutStarted && rt.pt >= 8) {
      F.scoutStarted = true;
      const scout = F.road[0];
      if (readyGroup(scout)) {
        scout.order = 'attack'; scout.aggro = 24; scout.seekRange = 24;
        // 一人討たれただけで六人が逃げ、斬り合いにならなかった。半ばを失うまでは踏みとどまる。
        scout.noRout = true;
        // 見張りは列の端にいる自分へ斬りかかる。最初の斬り合いを一分以内に確かに起こす（主君で遊ぶ時は組の先頭へ）。
        scout.focus = (!rt.G.lord && rt.player.u.alive ? rt.player.u : host?.units.find(readyUnit)) || null;
      }
      localSay(rt, host, '組頭', '道の見張りが来るぞ。組のそばで迎え撃て。深追いするな', 4);
    }
    if (F.scoutStarted && F.road[0].noRout && F.road[0].units.filter(readyUnit).length <= 3) F.road[0].noRout = false;
    F.marchAwayT = distance > 24 ? (F.marchAwayT || 0) + dt : 0;
    if (!F.marchFollowNotice && rt.t >= 15 && distance > 8) {
      F.marchFollowNotice = true;
      rt.bark('組が先へ進む。旗について進め');
    }
    if (rt.pt >= 120 && rt.canFailMission() && !readyGroup(host)) {
      F.ending = true; rt.tracker.main = false; rt.objFail('col'); rt.unmark('genpachi');
      rt.obj('retreat', '組が崩れた。残る味方と砦の方へ退け', 'main');
      for (const g of F.cols) if (g.count && !g.routed) {
        g.order = 'path'; g.path = P1.slice().reverse().map(fieldPathPoint); g.pathIdx = 0;
        g.formation = 'column'; g.onArrive = (q) => { q.order = 'hold'; };
      }
      rt.banner('組を失い、急襲へ進めず'); rt.finish({ failureReason: '組の旗について進む任務に失敗した。組が崩れ、谷の出口へ進めなかった。味方の列のそばで戦おう。' }, 7); return;
    }
    // 札を読む猶予を残す。組から二分離れ続けた時だけ置き去りとする。
    // 組のそばで道が詰まった場合も、三分は待ってから攻めを止める。
    if (F.marchAwayT >= 120 || (distance <= 24 && rt.pt > 180)) {
      F.ending = true; rt.tracker.main = false; rt.objFail('col'); rt.unmark('genpachi');
      rt.banner('谷の出口へ届かず', '残る組と元の道へ退く'); rt.finish({ failureReason: distance > 24 ? '組の旗について進む任務に失敗した。組から離れ続け、谷の出口へ合流できなかった。組の旗と戻る印へ向かおう。' : '組の旗について進む任務に失敗した。谷の出口へ進めず、攻める合図に間に合わなかった。道を空け、組の旗に続こう。' }, 7); return;
    }
    if (host?.arrived && rt.t >= (F.marchNoticeAt || 0)) {
      F.marchNoticeAt = rt.t + 1;
      const late = F.cols.find((g) => g.count && !g.routed && !g.arrived && g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget));
      rt.objProgress('col', distance > 16 ? `組の旗まで ${Math.round(distance)}歩ほど。旗について進め` : late ? `${late.name}が谷を抜けるまで、組の旗の下で構えよ` : '組の旗の下で構えよ');
    }
    if (distance <= 24 && host?.arrived && F.cols.every((g) => !g.count || g.routed || g.arrived || g.units.every((u) => !u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget))) {
      rt.setPhase('wait'); rt.objRemove('col');
      rt.obj('wait', '雨が弱まるまで組のそばで構え、かかれの合図を待て', 'main');
      localSay(rt, rt.hostGroup, '組頭', '身を低くせよ。殿の合図を待つぞ', 3);
    }
  },
  wait(rt) {
    const F = rt.flags;
    // 信長公記：中島での言葉 → 石氷を投げ打つような雨が今川の顔へ → 空が晴れ、鑓を取って「かかれ」。
    // 殿の声は遠いので、組頭が伝える。待ちは十五秒ほどで、雨と雷で張りつめさせる。
    if (!F.waitSpeech) {
      F.waitSpeech = true;
      sfx('thunder', 0.9);
      if (!rt.G.lord) {
        rt.after(1.2, () => { if (rt.phase === 'wait') localSay(rt, rt.hostGroup, '組頭', '殿のお言葉じゃ。敵は夜通し歩いて疲れておる。こちらは新手ぞ', 5); });
        rt.after(6.5, () => { if (rt.phase === 'wait') localSay(rt, rt.hostGroup, '組頭', '小勢でも大敵を恐れるな。運は天にあり、とな', 4); });
      }
      rt.after(4, () => { if (rt.phase === 'wait') { sfx('thunder', 1); rt.bark('雨が石を投げつけるように、今川の陣へ吹きつけている'); } });
    }
    rt.objProgress('wait', F.clear ? '空が晴れた。組の旗で、かかれの合図を待て' : '雨で前が見えぬ。組と身を低くし、旗のそばで構えよ');
    if (rt.pt > 11 && !F.clear) {
      F.clear = true; rt.world.setRainTarget(0); rt.world.setTime('after'); rt.world.addPuddles(30);
      for (const g of F.enemies) g.guardSight = 32;
      rt.banner('雨が上がった', '霧の向こうに、今川本陣の幕と旗が見える');
      // 晴れ間に、本陣の方へ一息だけ目を向ける。構えている時は奪わない。
      const p = rt.player;
      if (!p.lock && !(p.inCombatT > 0)) p.cine = { x: FIELD_HONJIN.x, z: FIELD_HONJIN.z, t: 1.6 };
    }
    if (rt.pt > 15 && !F.kakare) {
      F.kakare = true; hush(2);
      localSay(rt, rt.G.lord ? rt.player.u : rt.flags.nob, '織田信長', 'すわ、かかれ、かかれ！', 3);
      if (!rt.G.lord) rt.after(0.6, () => localSay(rt, rt.hostGroup, '組頭', '殿が鑓を取られた！　かかれ！', 2.5));
      rt.after(2, () => { sfx('horagai', 1); this.startAssault(rt); });
    }
  },
  startAssault(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || rt.phase !== 'wait') return;
    rt.setPhase('assault'); rt.objRemove('col'); rt.objRemove('wait'); rt.objRemove('honjin0');
    F.quiet = false;
    for (const g of F.enemies) g.fire = true;
    for (let i = 0; i < F.cols.length; i++) {
      const g = F.cols[i];
      if (!g.count || g.routed) continue;
      g.order = 'attack'; g.formation = 'yari';
      // 公記：馬廻・小姓衆に手負い・死人は多かったが、攻めは崩れなかった。怯えは兵一人の士気に任せ、隊は崩さない。
      g.facing = Math.PI + FIELD_TURN; g.noRout = true;
    }
    // 馬廻も道から歩いて寄せる。信長を最前列へ単独で放り込まない。
    F.nob.order = 'attack'; F.nob.formation = 'yari';
    F.nob.noRout = true;
    for (const g of F.road) g.aggro = 10;
    for (const C of F.wings || []) { C.go(); C.push('A', 0.25); }
    this.pushRoad(rt);
    // 公記：かかる勢いを見て、前の備えは水をまくように崩れ、弓・槍・旗を捨てた。
    // 本陣の前の二備だけ士気を落とす。崩れるかは兵の士気の仕組みに任せる。
    rt.after(5, () => {
      if (rt.over || F.ending) return;
      let seen = false;
      for (const g of [F.enemies[0], F.enemies[1]]) if (readyGroup(g)) { g.morale -= 30; seen = seen || sightPoint(rt, g.center()); }
      if (seen) rt.bark('今川の前の備えが崩れかかる。槍も旗も捨てて逃げる者がいる');
    });
  },
  pushRoad(rt) {
    const F = rt.flags;
    let step = 0;
    while (step < F.road.length && (gone(F.road[step]) ||
      F.road[step].units.every((u) => !u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget))) step++;
    const block = F.road[step];
    if (step !== F.roadStep) {
      F.roadStep = step;
      rt.unmark('road');
      // 同じ札を出し直さない（札の揺れと、組頭の読み上げの重なりを防ぐ）。
      const text = block ? '味方の旗に続き、道の守りを崩せ' : '味方と本陣の幕の口へ寄せよ';
      if (!F.entered && F.attackText !== text) { F.attackText = text; rt.obj('attack', text, 'main'); }
      if (block) rt.marker('road', block.anchor, '道を守る小隊・味方と崩せ', { red: true });
      else rt.marker('honjin', fieldPoint(18, -100), '今川本陣・幕の口', { red: true });
    }
    // 行き先と探す広さは毎秒かけ直す。隊の頭の仕組みが狭い探索へ戻すと、二十歩先の小隊の前で立ち止まった（10/7）。
    for (let i = 0; i < F.attackers.length; i++) {
      const g = F.attackers[i];
      if (gone(g)) continue;
      // 道の守りへ順に寄せ、外側の遠い備えを追って止まらない。
      const side = [-8, 8, 0, -4, 4][i];
      const x = block ? localX(block.anchor.x, block.anchor.z) : 18;
      const z = block ? localZ(block.anchor.x, block.anchor.z) + 3 : -100;
      g.anchor.x = fieldX(x + side, z); g.anchor.z = fieldZ(x + side, z);
      g.seekRange = block ? 16 : 24;
    }
  },
  assault(rt, dt) {
    const F = rt.flags, y = F.yoshimoto, p = rt.player.u.pos;
    if (F.ending) return;
    if (F.victory) {
      // 公記：深田へ逃げ込んだ者は這いまわり、若者どもが追いついて討った。退き鉦までの短い追い討ち。
      if (F.pursuitUntil > rt.t) {
        if (!(F.returnNoticeAt > rt.t)) {
          F.returnNoticeAt = rt.t + 1;
          rt.objProgress('pursue', `深田へ逃げる今川勢を、組と追い討て。退き鉦まで あと${Math.ceil(F.pursuitUntil - rt.t)}秒`);
          // 近くに敵がいなくなれば、早めに鉦を打つ。
          if (rt.t - F.pursuitStart > 15 && !rt.army.nearestEnemy(rt.player.u, 40)) F.pursuitUntil = rt.t;
        }
        return;
      }
      if (F.pursuitUntil && !F.pursuitDone) {
        F.pursuitDone = true; F.returnRetryAt = 0;
        // 鉦を聞いた組はその場で追い討ちをやめる。動く旗を延々追わせない。
        for (const g of F.attackers) if (readyGroup(g)) {
          const c = g.center();
          g.anchor.x = c.x; g.anchor.z = c.z;
          g.order = 'hold'; g.guard = true; g.focus = null; g.aggro = 3; g.seekRange = 8;
        }
        sfx('kane', 1); rt.after(0.5, () => sfx('kane', 0.9));
        rt.objDone('pursue'); rt.objRemove('pursue');
        localSay(rt, F.returnGroup || rt.hostGroup, '組頭', '退き鉦じゃ！　追うのはここまで。組の旗へ集まれ', 4);
        rt.obj('return', '追うのはここまで。帰る組の旗へ集まれ', 'main');
        rt.marker('genpachi', () => returnCenter(rt), '帰る組の旗');
      }
      const c = returnCenter(rt);
      const distance = c ? Math.hypot(c.x - p.x, c.z - p.z) : Infinity;
      const atFlag = distance <= 8;
      // 帰る列が詰まっても、旗の下で安全に十秒集まれば帰還の終幕へ進む。
      // 使番の到着や下知そのものを、時刻だけで成立させるわけではない。
      if (atFlag && !(F.returnEnemyAt > rt.t)) {
        F.returnEnemyAt = rt.t + 0.5;
        // 背を見せて逃げる者・手負いで退く者は、帰る支度を止めない。
        F.returnEnemyNear = !!rt.army.nearestEnemy(rt.player.u, 12, (o) => !o.fleeing && !o.woundOut &&
          Math.abs(o.pos.y - rt.player.u.pos.y) < 3 && !rt.army.wallBetween(p, -1, o.pos));
      }
      const enemyNear = atFlag && F.returnEnemyNear;
      F.returnGatherT = atFlag && !enemyNear ? (F.returnGatherT || 0) + dt : 0;
      // 使番の遅れや、組がまだ戦っている時間で帰還失敗にしない。
      // 組が谷を抜けた後、一人で離れ続けた時だけ知らせて待つ。
      const leftBehind = c && F.returnGroup.okeReturnOrdered && localZ(c.x, c.z) > 0 && Math.hypot(c.x - p.x, c.z - p.z) >= 16;
      F.returnAwayT = leftBehind ? (F.returnAwayT || 0) + dt : 0;
      if (!leftBehind) F.returnWarn = false;
      if (!F.returnWarn && F.returnAwayT > 30) { F.returnWarn = true; rt.bark('組は谷を抜けた。帰る旗へ戻れ。このまま離れると組に戻れぬぞ', true); }
      if (!(F.returnRetryAt > rt.t)) { F.returnRetryAt = rt.t + 8; this.returnOrders(rt); }
      if (!(F.returnNoticeAt > rt.t)) {
        F.returnNoticeAt = rt.t + 1;
        rt.objProgress('return', !c ? '残る味方と砦の方へ退け' : atFlag ? enemyNear ? '旗の下で、近くの敵が退くのを待て。味方と構えよ' : `旗の下で、組が帰る支度を終えるまであと${Math.max(0, Math.ceil(10 - F.returnGatherT))}秒` : `帰る旗まで ${Math.round(distance)}歩ほど。旗の下で組を待て`);
      }
      // 谷の曲がりまで組も本人も離脱すれば帰還。砦までの空歩きはさせない。
      const leftValley = c && F.returnGroup.okeReturnOrdered && localZ(c.x, c.z) > 0 && localZ(p.x, p.z) > 0 && distance < 16;
      if (leftValley || F.returnGatherT >= 10) {
        F.ending = true; F.returnDone = true; rt.unmark('genpachi'); rt.objDone('return'); rt.tracker.main = true;
        const deed = leftValley ? '組と砦方面へ離脱した' : '帰る旗の下で組と合流した';
        rt.award((t) => t.side.push(deed), deed);
        rt.banner(leftValley ? '組と谷を抜けた' : '帰る組に合流した', 'ここから元の道をたどり、中島を経て清洲へ戻る');
        // 余韻と次への引き。森部（美濃）へつながる一言。
        rt.after(1.5, () => localSay(rt, F.returnGroup || rt.hostGroup, '組頭', 'よう生き残った。東の憂いは晴れた。次は美濃じゃ', 5));
        rt.finish({ scriptedEnd: true }, 7);
      } else if (!c || F.returnAwayT > 60) {
        F.ending = true; rt.objFail('return'); rt.tracker.main = false;
        rt.unmark('genpachi');
        const failureReason = c ? '義元は討たれたが、帰る旗から離れ続け、組への合流を果たせなかった。' : '義元は討たれたが、帰る組が崩れ、組への合流を果たせなかった。';
        rt.banner('織田勢は勝った', failureReason); localSay(rt, rt.hostGroup, '組頭', '残った者を集め、砦の方へ退け！', 3); rt.finish({ scriptedEnd: true, failureReason }, 5);
      }
      return;
    }
    // 局地の変化は一秒に一度。段が替わっても兵は増やさず、生存隊が歩いて動く。
    F.tacticalT = (F.tacticalT || 0) - dt;
    if (F.tacticalT > 0) return;
    F.tacticalT = 1;
    // 攻める織田の備は、手負いが出ても崩れない（公記）。備の士気が尽きて「崩れました」と誤って知らせない。
    for (const S of rt.sonae || []) if (S.team === 0 && S.state !== '敗走' && S.b.morale < 40 && F.attackers.includes(S.b.real)) S.addMorale(40 - S.b.morale);
    // 道中で負傷した服部は、既存の回復で列へ戻る。本陣での接触を待ち続けない。
    // 義元と接触した後の手傷は、そのまま退場させる。
    const hat = F.nobKill[0], mor = F.nobKill[1];
    if (hat && !F.hattoriMet && !F.hattoriWounded) {
      guardRecover(rt, hat, 1, { historicalReturn: true });
      if (!hat.woundOut) hat.onWound = F.hattoriWound;
    }
    if (!F.mainPush) this.pushRoad(rt);
    let guards = 0;
    for (const u of F.hatamoto.units) if (u.alive && u !== y && !u.gone && !u.noTarget && !u.woundOut && !u.fleeing) guards++;
    if (!F.entered && (Math.hypot(p.x - y.pos.x, p.z - y.pos.z) < 18 ||
        F.attackers.some((g) => g.units.some((u) => readyUnit(u) && Math.hypot(u.pos.x - y.pos.x, u.pos.z - y.pos.z) < 18)))) {
      F.entered = true; rt.unmark('honjin');
      // 本陣の左右と後ろの備えが、義元を救いに駆け寄る。幕の内外で入り乱れる斬り合いになる。
      for (const i of [2, 3, 4]) {
        const g = F.enemies[i];
        if (!readyGroup(g)) continue;
        g.guard = false; g.order = 'attack'; g.seekRange = 30; g.aggro = 12; g.focus = null;
      }
      if (sightPoint(rt, y.pos)) rt.bark('本陣の両脇から今川の備えが駆け寄る。組から離れるな', true);
      F.attackText = '組とともに、義元を囲む旗本を三人崩せ';
      rt.obj('attack', F.attackText, 'main');
    }
    // 三人分の囲みが欠けたら、討取りへ向かう任務に進む。全滅は求めない。
    if (F.entered && !F.guardOpened && F.guardStart - guards >= 3) {
      F.guardOpened = true;
      F.attackText = '組とともに、義元の幕の口へ寄せよ';
      rt.objDone('attack'); rt.objRemove('attack'); rt.obj('attack', F.attackText, 'main');
      rt.marker('honjin', fieldPoint(18, -100), '義元の幕の口', { red: true });
      localSay(rt, rt.hostGroup, '組頭', '囲みが欠けたぞ。幕の口へ寄せ、服部と毛利を通せ！', 4);
      // 近くの旗本には応戦しながら、馬廻が義元へ歩いて寄る。
      F.nobClosing = true; F.nob.guard = false; F.nob.order = 'attack'; F.nob.focus = y; F.nob.seekRange = 36;
    }
    // 道の小隊が崩れれば、馬廻も口へ歩いて寄せる。幕の外で止めない。
    if (!F.mainPush && F.roadStep === F.road.length) {
      F.mainPush = true;
      localSay(rt, rt.G.lord ? rt.player.u : F.nob, '織田信長', '旗本はあれじゃ。あれへかかれ！', 3);
      if (!rt.G.lord) rt.after(0.8, () => localSay(rt, rt.hostGroup, '組頭', '殿のお下知じゃ。義元の旗本へかかれ！', 3));
      for (const g of F.attackers) if (g.count && !g.routed) {
        g.anchor = fieldPoint(HONJIN.x + g.okeSide, HONJIN.z + g.okeBack); g.seekRange = 28;
      }
    }
    // 旗本を減らされると、輿を捨て、囲みを保って陣の口から退く。実際に歩く。
    if (!F.koshiLeft && guards <= 22) {
      F.koshiLeft = true; F.koshiLeftT = rt.t;
      if (sightPoint(rt, y.pos)) rt.bark('義元の旗本が囲みを保って退く。味方と押せ、一人で追うな');
      if (F.koshi) { F.koshi.rotation.z = 0.12; F.koshi.position.y -= 0.4; }
      const H = F.hatamoto;
      H.guard = false; H.order = 'path'; H.formation = 'ring'; H.speed = 1.4;
      // 退く先は本陣の東の窪みまで。遠くへ逃げ切らせず、囲みのまま向き直る斬り合いを残す（10/7）。
      H.path = [[18, -100], [44, -114], [64, -124]].map(fieldPathPoint); H.pathIdx = 0;
      H.onArrive = (g) => { g.order = 'hold'; };
    }
    if (F.koshiLeft && F.hatamoto.count && !F.hatamoto.routed) {
      const H = F.hatamoto;
      const foe = rt.army.nearestEnemy(y, H.order === 'hold' ? 12 : 8);
      if (foe && !foe.fleeing && !foe.woundOut && !rt.army.wallBetween(y.pos, 1, foe.pos)) {
        if (H.order !== 'hold') {
          H.anchor.x = y.pos.x; H.anchor.z = y.pos.z;
          // 公記：二、三度、四、五度と向き直りながら退いた。
          F.turnBack = (F.turnBack || 0) + 1;
          if (F.turnBack >= 2 && F.turnBack <= 5 && rt.t >= (F.turnBackAt || 0) && sightPoint(rt, y.pos)) {
            F.turnBackAt = rt.t + 6;
            rt.bark(`義元の旗本がまた向き直った（${['', '', '二', '三', '四', '五'][F.turnBack]}度目）。囲みは細っている`);
          }
        }
        H.order = 'hold'; H.guard = true; H.formation = 'ring';
        H.facing = Math.atan2(foe.pos.x - y.pos.x, foe.pos.z - y.pos.z);
      } else if (H.order === 'hold' && H.pathIdx < H.path.length) {
        H.guard = false; H.order = 'path'; H.formation = 'ring';
      }
    }
    if (F.entered && sightPoint(rt, y.pos) && Math.hypot(p.x - y.pos.x, p.z - y.pos.z) < 24) {
      let best = 0, angle = 0;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        let clear = Math.PI;
        for (const u of F.hatamoto.units) {
          if (u === y || !u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget) continue;
          const b = Math.atan2(u.pos.x - y.pos.x, u.pos.z - y.pos.z);
          clear = Math.min(clear, Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))));
        }
        if (clear > best) { best = clear; angle = a; }
      }
      const q = F.guardGap || (F.guardGap = { x: 0, z: 0 });
      q.x = y.pos.x + Math.sin(angle) * 5; q.z = y.pos.z + Math.cos(angle) * 5;
      const visible = best > 0.55 && sightPoint(rt, q) && !rt.army.wallBetween(p, -1, q);
      if (visible && !F.guardGapMarked) rt.marker('guardGap', () => F.guardGap, '囲みの切れ目・味方と押せ', { red: true });
      if (!visible && F.guardGapMarked) rt.unmark('guardGap');
      F.guardGapMarked = visible;
      if (F.koshiLeft && !F.guardTurnSaid) { F.guardTurnSaid = true; rt.bark('旗本は退いても向き直る。槍の向きを見て、味方と押せ'); }
    } else if (F.guardGapMarked) { rt.unmark('guardGap'); F.guardGapMarked = false; }
    if (!F.entered) rt.objProgress('attack', F.roadStep < F.road.length ? `道の小隊を味方と崩せ・あと${F.road.length - F.roadStep}組。本陣へ続くぞ` : F.mainPush ? '道の守りが崩れた。味方の旗に続き、幕の口へ寄せよ' : '本陣の前の備を、味方と槍をそろえて押せ');
    if (F.entered) {
      const seenHat = hat && hat.alive && !hat.woundOut && !hat.fleeing && !hat.noTarget && sightPoint(rt, hat.pos);
      const seenMor = mor && mor.alive && !mor.woundOut && !mor.fleeing && !mor.noTarget && sightPoint(rt, mor.pos);
      if (seenHat && !F.hattoriMarked) rt.marker('hattori', unitPos(hat), '服部小平太（本陣で戦う）', { person: true });
      else if (!seenHat && F.hattoriMarked) rt.unmark('hattori');
      if (seenMor && !F.moriMarked) rt.marker('mori', unitPos(mor), '毛利新介（本陣へ寄せる）', { person: true });
      else if (!seenMor && F.moriMarked) rt.unmark('mori');
      F.hattoriMarked = !!seenHat; F.moriMarked = !!seenMor;
      const left = Math.max(0, 3 - (F.guardStart - guards));
      const next = !F.guardOpened ? `囲みをあと${left}人崩せ` : F.koshiLeft ? '服部・毛利の旗と退き口へ寄せよ' : F.yoshiDown ? '毛利の手が届くよう、味方と押せ' : '義元の幕の口へ寄せ、服部・毛利を通せ';
      if (!(F.guardNoticeAt > rt.t)) { F.guardNoticeAt = rt.t + 1; rt.objProgress('attack', `旗本は残り${guards}人。${next}`); }
    }
    if (F.mainPush) {
      for (const g of F.attackers) if (g.count && !g.routed) {
        g.anchor.x = y.pos.x + g.okeSide * FIELD_C + g.okeBack * FIELD_S; g.anchor.z = y.pos.z - g.okeSide * FIELD_S + g.okeBack * FIELD_C;
      }
    }
    // 囲みが薄くなったら馬廻の狙いを義元へ。別の敵を追い続けて討取りが止まらないようにする。
    // 深手の後に囲みが残っても、十五秒で馬廻は義元へ寄せる。
    const longDown = F.yoshiDown && rt.t - F.yoshiDownT > 15;
    // 囲みが退き始めて四十秒たっても崩れなければ、馬廻が義元その人へ寄せる（攻めを止まらせない）。
    const longRing = F.koshiLeft && rt.t - F.koshiLeftT > 40;
    if ((guards <= 10 || longDown || longRing) && !F.nobClosing) {
      F.nobClosing = true; F.nob.focus = y; F.nob.seekRange = 36;
    }
    if (hat && hat.alive && !hat.woundOut && !hat.fleeing && !hat.noTarget && Math.hypot(hat.pos.x - y.pos.x, hat.pos.z - y.pos.z) < 3 && !rt.army.wallBetween(hat.pos, 0, y.pos)) F.hattoriMet = true;
    // 深手、旗本の損失、服部の接触、毛利の到着がそろった時だけ討取りへ。
    if (F.yoshiDown && !F.moriClose && mor && mor.alive && Math.hypot(mor.pos.x - y.pos.x, mor.pos.z - y.pos.z) < 7 && sightPoint(rt, y.pos)) {
      F.moriClose = true;
      rt.bark('毛利新介が義元へ斬りかかる！');
    }
    // 服部が義元に会う前に手傷で退いた時は、毛利だけで討つ（服部の接触を待ち続けない）。
    const hattoriDone = F.hattoriMet || !hat || !hat.alive || hat.woundOut || longDown;
    // 深手から二十五秒たっても寄れない時は、毛利が数歩の間合いから飛び込む。
    const reachMori = F.yoshiDown && rt.t - F.yoshiDownT > 25 ? 6 : 3;
    if (F.yoshiDown && rt.t - F.yoshiDownT >= 5 && (guards <= 10 || longDown) && hattoriDone && mor && mor.alive && !mor.woundOut && !mor.fleeing && !mor.noTarget && Math.hypot(mor.pos.x - y.pos.x, mor.pos.z - y.pos.z) < reachMori && !rt.army.wallBetween(mor.pos, 0, y.pos)) {
      y.invuln = false; rt.army.kill(y, mor);
    }
    if (!F.assaultWarn && rt.pt > 360) { F.assaultWarn = true; localSay(rt, rt.hostGroup, '組頭', '攻めが長引いた。守りが崩れねば、残る組を下げるぞ', 4); }
    if (!y.alive) { this.returnHome(rt); return; }
    let ready = 0;
    for (const g of F.attackers) if (readyGroup(g)) ready++;
    // 姿が見えないままでも七分で攻めを止める。接敵の記録だけで終幕を止めない。
    // 囲みが退き口へ着いても、馬廻が追いつく間（九十秒）は失敗にしない（着いた途端に「攻めを止める」になった。10/7）。
    if (rt.pt > 420 || (rt.canFailMission() && (!ready || (F.koshiLeft && rt.t - F.koshiLeftT > 90 && localX(y.pos.x, y.pos.z) > 80 && (!mor || !mor.alive || Math.hypot(mor.pos.x - y.pos.x, mor.pos.z - y.pos.z) > 15))))) {
      F.ending = true; rt.tracker.main = false; rt.objFail('attack');
      rt.unmark('hattori'); rt.unmark('mori'); rt.unmark('guardGap'); rt.unmark('road'); rt.unmark('honjin');
      rt.banner('攻めを止める');
      localSay(rt, rt.hostGroup, '組頭', !ready ? '攻める備が崩れた。残った者を連れて下がれ！' : rt.pt > 420 ? '攻めが長引いた。敵の守りはまだ固い。組を下げよ！' : '義元の旗本に退かれた。深追いせず、組を下げよ！', 3);
      const mission = F.attackText || '味方の旗に続き、道の守りを崩せ';
      const reason = !ready ? '攻める味方の組が崩れた。' : rt.pt > 420 ? '敵の守りを崩せず、攻めが長引いた。' : '義元の旗本が退き、追いつけなかった。';
      rt.finish({ failureReason: `「${mission}」を果たせず。${reason}味方と槍をそろえて押そう。` }, 5);
    }
  },
  returnHome(rt) {
    const F = rt.flags;
    rt.unmark('hattori'); rt.unmark('mori'); rt.unmark('guardGap'); rt.unmark('road'); rt.unmark('honjin');
    F.nob.focus = null;
    F.victory = true; rt.objDone('attack'); rt.objRemove('attack');
    const mor = F.nobKill[1];
    if (sightPoint(rt, F.yoshimoto.pos) && Math.hypot(rt.player.u.pos.x - F.yoshimoto.pos.x, rt.player.u.pos.z - F.yoshimoto.pos.z) <= 12)
      rt.banner('今川義元、討ち取ったり', '毛利新介が首を挙げた');
    else if (Math.hypot(rt.player.u.pos.x - F.yoshimoto.pos.x, rt.player.u.pos.z - F.yoshimoto.pos.z) <= 45) {
      // 少し離れていても、鬨の声の方へ一息だけ目を向ける。構えている時は奪わない。
      const p = rt.player;
      if (!p.lock && !(p.inCombatT > 0)) p.cine = { x: F.yoshimoto.pos.x, z: F.yoshimoto.pos.z, t: 1.4 };
      rt.banner('義元討ち取ったり', '本陣の方で鬨の声が上がる');
    }
    // 討死を見た生存兵から知らせが走る。隊の番号や時刻だけでは崩さない。
    const witness = F.enemies.flatMap((g) => g.units).find((u) => u.alive && !u.gone && !u.woundOut &&
      Math.hypot(u.pos.x - F.yoshimoto.pos.x, u.pos.z - F.yoshimoto.pos.z) < 30 &&
      !rt.army.wallBetween(u.pos, -1, F.yoshimoto.pos));
    for (const C of F.wings || []) C.rout('B', { from: 0, hideAfter: 40 });
    // 勝った側は崩さない。「義元討たれたり」の声で、攻める組の足は軽くなる。
    for (const g of F.attackers) if (readyGroup(g)) { g.noRout = true; g.morale = Math.max(g.morale, 90); }
    if (!rt.G.lord) rt.after(1.2, () => { if (!rt.over) rt.bark('味方の兵「義元が首、毛利新介が取ったり！」'); });
    if (witness) {
      // 討死を目の前で見た備えは、使番を待たずにその場で崩れる。遠い備えには知らせが走る。
      const yp = F.yoshimoto.pos;
      for (const g of F.enemies) if (readyGroup(g)) {
        const seen = g.units.some((u) => readyUnit(u) && Math.hypot(u.pos.x - yp.x, u.pos.z - yp.z) < 45 && !rt.army.wallBetween(u.pos, -1, yp));
        // 逃げる先は西の谷の田（深田）。追い討ちの場をそこへ作る。
        const flee = (q) => { q.noRout = false; q.morale = 0; q.fleeSet = true; q.fleeDir = fieldVector(-0.862, 0.507); };
        if (seen) flee(g); else fieldNotice(rt, witness, g, 1, flee);
      }
      for (const m of F.imaDA) fieldNotice(rt, witness, m.army, 1, () => {
        m.rout({ hideAfter: Infinity });
        // 近づいて本物へ替わった同じ控えにも、届いた知らせを渡す。
        for (const g of rt.army.groups) if (g.recyclable && g.units.some((u) => u.wkFrom?.A === m.army)) {
          g.noRout = false; g.morale = 0;
        }
      });
    }
    F.returnGroup = readyGroup(rt.hostGroup) ? rt.hostGroup : F.attackers.find(readyGroup);
    for (const q of F.far) if (q.m.visible) q.returnWaiting = true;
    // 帰る下知の前に、二十秒だけ追い討ち。集まる十秒と合わせ、帰陣へ進む。
    F.pursuitStart = rt.t; F.pursuitUntil = rt.t + 20;
    for (const g of F.attackers) if (readyGroup(g)) { g.order = 'attack'; g.seekRange = 30; g.focus = null; }
    rt.obj('pursue', '深田へ逃げる今川勢を、組と追い討て', 'main');
    if (!rt.G.lord) rt.after(2.5, () => localSay(rt, rt.hostGroup, '組頭', '逃げる者を追え！　首は捨て置け。組の旗の見える所までじゃ', 4));
  },
  // 討死と帰る下知は生きた使番で届ける。失われた便だけ送り直す。
  returnOrders(rt) {
    const F = rt.flags, mor = F.nobKill[1];
    if (F.pursuitUntil > rt.t) return;
    const commander = rt.G.lord ? rt.player.u : F.nob.units.find((u) => u.name === '織田信長' && readyUnit(u));
    // 下知役が戦列を離れた時は、古い受け手を待ち続けず報告からやり直す。
    if (F.returnChief && !readyUnit(F.returnChief)) F.returnChief = null;
    if (!F.returnChief) {
      if (F.returnReport?.state === 'run') return;
      F.returnReport = fieldNotice(rt, mor, commander || mor, 0, (chief) => {
        F.returnChief = chief;
        for (let i = 0; i < F.far.length; i++) {
          const q = F.far[i];
          if (!q.m.visible) continue;
          fieldNotice(rt, chief, q.a, 0, () => {
            q.path = [[localX(q.x, q.z), localZ(q.x, q.z)], ...q.path.slice().reverse(), [-28 + i * 8, 206 + (i % 2) * 16]];
            q.s = 0; q.done = false; q.returnWaiting = false;
          });
        }
      });
    }
    const chief = F.returnChief;
    if (!chief || !readyUnit(chief)) return;
    for (const g of F.attackers) if (readyGroup(g) && !g.okeReturnOrdered && g.okeReturnRunner?.state !== 'run') {
      g.okeReturnRunner = fieldNotice(rt, chief, g, 0, (q) => {
        retreatGroup(q);
        if (q === F.returnGroup || q === rt.hostGroup) {
          if (!sightPoint(rt, F.yoshimoto.pos)) rt.bark('義元討死の知らせが届いた。組と元の道へ戻れ');
          localSay(rt, q, '組頭', '追うのはここまでじゃ。組の旗について戻れ！', 4);
        }
      });
    }
  },
  onKill(rt, v) {
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1;
    else rt.flags.ak = (rt.flags.ak || 0) + 1;
  },
  onHead(rt) {
    if (!rt.G.lord) rt.violation('分捕りを禁じる下知に背いた', ['組頭', '首を置け。敵を突き崩せ！']);
  },
  onFinish(rt, info) {
    // 任務は義元の討取りと帰る組への合流。判と手柄欄はこの同じ成否を使う。
    const mainDone = rt.flags.victory === true && rt.flags.returnDone === true && !info.down;
    rt.tracker.main = mainDone;
    if (mainDone) {
      // 任務達成でも戦功が少なければ丙。任務失敗の定型文へ戻さない。
      info.failureReason = '義元の討取りと帰る組への合流は果たした。戦功が評定「乙」の目安に届かなかった。';
    } else if (rt.flags.victory) {
      info.failureReason = info.down ? '義元は討たれたが、組と帰る前に倒れ、帰還の任務を果たせなかった。' :
        info.failureReason || '義元は討たれたが、帰る組への合流を果たせなかった。';
    }
    // 共通処理が味方の首袋を自動で数えても、討ち捨ての戦では証言だけを採る。
    for (const record of rt.meritKills || []) { record.head = false; record.carrier = null; }
    rt.meritFirstHead = null;
    // 首実検はこの呼び出しの後。次の更新で巻物の文を整え、得点や証言の判定は保つ。
    rt.after(0, () => {
      const t = rt.tracker;
      for (const sp of t.specials) {
        sp.label = sp.label.replace(/討ち取りの証：首袋で0人分、味方の証言で(\d+)人分を確かめた/, '討ち捨ての働き：味方の証言で$1人分を確かめた');
      }
      if (rt.flags.victory) t.specials.unshift({ label: '今川義元を毛利新介が討ち取った', pts: 0 });
    });
    // 戦全体の決着を巻物の先頭へ。本人の帰還失敗や討死を任務達成に変えない。
    const meritLines = rt.tracker.lines;
    rt.tracker.lines = function () {
      const lines = meritLines.call(this);
      // 成否は上の判定だけから出す。全軍の勝ちと本人の未達を読み分けられる文にする。
      const mission = lines.find((line) => line.label === '任務失敗');
      if (mission && rt.flags.victory) {
        mission.label = info.down ? '組と帰る前に倒れた' : '帰る組への合流を果たせなかった';
        mission.detail = info.failureReason;
      }
      const i = lines.findIndex((line) => line.label === '今川義元を毛利新介が討ち取った');
      if (i > 0) lines.unshift(lines.splice(i, 1)[0]);
      return lines;
    };
  },
};

// 史料にない迂回の選択や、一人の足軽による全軍指揮を入れない。
okehazama.rts = true;
// 討ち捨ての下知（信長公記）。首を袋へ促す知らせを出さない。足軽へ他の隊の居場所を使番で知らせない。
okehazama.uchisute = true;
okehazama.noAllyReports = true;
// 信長はこの戦の馬廻で扱う。共通の手傷による退場・本陣襲撃を重ねない。
okehazama.taisho = { a: { name: '織田信長', def: true } };
okehazama.sides = { a: { name: '織田軍（出陣時の目安）', mon: 'oda' }, b: { name: '今川軍（出陣時の目安）', mon: 'imagawa' } };
// 参戦者は開始時の馬廻・旗本へ置いた。後から名前のある兵を足さない。
okehazama.date = (rt) => `永禄三年五月十九日　初夏・${sky(rt)}`;
// 見える局地戦の数。本陣から離れた大高・鳴海などの兵をここへ合算しない。
// 損害一人を何十人へ水増しせず、出陣時の目安を示す。
okehazama.force = () => ({ a: 2000, a0: 2000, b: 6000, b0: 6000 });
okehazama.history = '豪雨が弱まった後、織田勢は今川の備えを攻めた。『信長公記』では、義元の旗本は囲みを保って退き、何度も向き直って戦った。服部小平太が義元と戦って膝を斬られ、毛利新介が義元を討ち取った。織田の攻撃兵は二千に足らずという。本陣周辺の今川六千は後世の推定を参考にした目安で、全軍の数ではない。今川全軍は二万五千ともいい、公記の数とは異なる。両軍の備えの割り振り、細かな配置、小川、砦の形、短い待ち時間は推定復元。本陣は桶狭間山説に置いた。北東の田楽窪と東の高い丘は別の場所として残した。戦場の位置と接近路にも諸説がある。';

// 自分の組へ続く。物陰越しの敵・遠い敵を追わず、帰陣では旗へ戻る。
okehazama.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive) return;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
  inp.guardHold = false;
  inp.leftPressed = false; inp.chargeHold = false;
  inp.runHeld = false;
  // 手綱を取る間は止まる。組への追従で走り抜けると、手綱取りが取り消される。
  if (p.catching || p.mountT > 0) return;
  if (b.phase === 'brief' && !F.briefed && !b.G.lord) {
    const q = F.genpachi.pos; goTo(p, inp, q.x, q.z, 2);
    if (Math.hypot(q.x - u.pos.x, q.z - u.pos.z) < 3) inp.e.add('KeyE');
    return;
  }
  const host = F.victory ? F.returnGroup : b.hostGroup.count ? b.hostGroup : F.attackers.find((g) => g.count && !g.routed);
  if (!host || !host.count) return;
  // 行軍中も目の前の見張りには応戦する。旗から離れて本陣へは追わない。
  if ((b.phase === 'march' || b.phase === 'wait') && F.scoutStarted) {
    const e = strikeTarget(b, 8), q = F.guidePos || host.anchor;
    if (e && e.group === F.road[0] && Math.hypot(e.pos.x - q.x, e.pos.z - q.z) <= 16 &&
        !b.army.wallBetween(u.pos, -1, e.pos)) {
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z), reach = p.weapon === 'sword' ? 1.9 : 2.8;
      if (d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
      patientStrike(p, inp, e, d);
      return;
    }
  }
  if (b.phase === 'assault' && (!F.victory || F.pursuitUntil > b.t)) {
    // 討ち取れない義元の一撃も受ける。攻める相手だけを探すと、構えずに打たれる。
    const threat = b.army.nearestEnemy(u, 10, (o) =>
      ((o.atk && !o.atk.bow && o.atk.target === u) ||
       (o.swing && !o.swing.done && o.swing.target === u) ||
       (o.charging && o.cv === 'in' && o.target === u)) &&
      Math.abs(o.pos.y - u.pos.y) < 3 &&
      Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= (o.reach || 2.8) + 0.6 &&
      !b.army.wallBetween(u.pos, -1, o.pos));
    // 囲みを開いた後も、別の備えや深手の義元だけを追い続けない。
    const guard = F.entered && b.army.nearestEnemy(u, 10, (o) => o.group === F.hatamoto &&
      (o !== F.yoshimoto || !F.yoshiDown) && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
    const e = threat || guard || strikeTarget(b, 10);
    if (e) {
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z), reach = p.weapon === 'sword' ? 1.9 : 2.8;
      // 打ち込み中は回り道で背を向けず、その場で受ける。
      if (!threat && d > reach * 0.85) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
      // 不死身の義元へ連打せず、周りの旗本の隙を突く。構えを解き、届く時だけ突く。
      patientStrike(p, inp, e, d);
      return;
    }
    // 組の中心で待つだけでは、前列が戦っていても十歩先の敵に届かない。
    // 前列が狙う敵へ道をたどる。味方の背で止まると、幕の向こうの敵へ届かない。
    let front = null, frontDist = Infinity;
    for (const mate of host.units) {
      const foe = mate.target;
      if (mate === u || !mate.alive || mate.fleeing || mate.woundOut || mate.noTarget ||
          !foe || !foe.alive || foe.fleeing || foe.woundOut || foe.noTarget || foe.isStruct ||
          Math.abs(mate.pos.y - u.pos.y) >= 3 ||
          Math.hypot(foe.pos.x - mate.pos.x, foe.pos.z - mate.pos.z) > 6) continue;
      const d = Math.hypot(mate.pos.x - u.pos.x, mate.pos.z - u.pos.z);
      if (d < frontDist) { front = mate; frontDist = d; }
    }
    if (front) {
      const foe = front.target;
      const q = honjinWay(b.army, u, foe.pos);
      goTo(p, inp, q.x, q.z, q === foe.pos ? p.weapon === 'sword' ? 1.6 : 2.4 : 1);
      return;
    }
    // 敵が目の前にいない時だけ、組の近くの空馬へ寄る。帰陣の下知では寄り道しない。
    if (!p.mounted && b.army.looseHorses && !b.army.nearestEnemy(u, 6)) {
      const q = host.center();
      let horse = null, near = 15;
      for (const o of b.army.looseHorses) {
        if (!o.from || !o.h.parent || o.mode === 'fled') continue;
        const hp = o.h.position, d = Math.hypot(hp.x - u.pos.x, hp.z - u.pos.z);
        if (d < near && Math.hypot(hp.x - q.x, hp.z - q.z) < 16 && !b.army.wallBetween(u.pos, -1, hp)) { horse = o; near = d; }
      }
      if (horse) {
        goTo(p, inp, horse.h.position.x, horse.h.position.z, 2.5);
        if (near < 3.2) inp.k.add('KeyE');
        return;
      }
    }
  }
  if (b.phase === 'assault' && !F.victory) {
    const block = F.road[F.roadStep];
    // 幕と手盾を横切らず、本陣の口を回って義元へ寄る（幕の外で198秒止まった。10/7）。
    const q = block ? block.anchor : honjinWay(b.army, u, F.yoshimoto.pos);
    goTo(p, inp, q.x, q.z, block ? 3 : 5);
    return;
  }
  const q = host.center(); goTo(p, inp, q.x, q.z, 4);
};

// 味方の鉄砲の一斉射：敵の組が鉄砲の前へ寄せた所で一度だけ「放て」。当たった組の士気を落とし、崩れやすくする
export function volleyAt(rt, key, guns, foes, o = {}) {
  const F = rt.flags; F.vol = F.vol || {};
  if (F.vol[key] || gone(guns)) return false;
  const gc = guns.center(), r = o.r || 32;
  const near = foes.filter((g) => !gone(g) && Math.hypot(g.center().x - gc.x, g.center().z - gc.z) < r);
  if (!near.length && !(o.until && rt.t > o.until)) return false;
  F.vol[key] = true;
  const hit = near.length ? near : foes.filter((g) => !gone(g));
  guns.order = 'attack'; guns.seekRange = r + 10;
  rt.say(o.who || '鉄砲頭', o.text || '引きつけたぞ。……放てえっ！', 3);
  rt.banner(o.title || '鉄砲、放て', o.sub || '味方の鉄砲が一斉に火を噴く');
  rt.army.play('volley', gc, 1.8);
  rt.after(0.5, () => rt.army.play('volley', gc, 1.2));
  for (const g of hit) { g.morale -= o.hit || 28; if (o.unpin) g.noRout = false; }
  rt.after(2.5, () => { if (o.then) rt.say(o.then[0], o.then[1], 3); });
  return true;
}

export { okehazama };
