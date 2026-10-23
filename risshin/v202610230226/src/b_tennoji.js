import { rosterPlan, rosterBuild } from './jinkei_roster.js';
// ======================================================================
// 織田家編　天王寺の戦い（天正四年五月七日）
// 石山本願寺を囲む織田方の天王寺砦（明智光秀らが守る）を、本願寺勢一万五千ほどが囲んだ。
// 京にいた信長は、集まっていたわずか三千ほどを率いて駆けつけ、自ら先頭に立って囲みを破った。
// 信長は足に鉄砲の傷を負ったが、砦に入った後、再び打って出て本願寺勢を崩した。
// 自分は砦の守備隊。籠城→三段の後詰と呼応→砦で合流→二段で再攻撃→城戸口へ追う。
// 信長公記巻九（三）（四）を優先。若江から東の道を来て、住吉口（南）から砦へ突入。
// 北（-z）は石山本願寺。砦から約二・五キロ。細かな縄張りと本陣位置は推定。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, hut, yagura, tawara, kabukimon, jinmaku, dou, dorui, village, castleBoardFence, campfire, shogi, hatazao, solidRect, solidCircle, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { addInterior } from './naka.js';
import { RANKS } from './state.js';
import { S as SETTINGS } from './settings.js';
import { segHit } from './units.js';
import { sfx } from './audio.js';
import { enemyGroup, allyGroup, centerOf } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { namuTex, sagarifujiTex } from './b_nodafukushima.js';
import { battleEvent, EVENT_MESSENGER, EVENT_REINFORCEMENT, EVENT_VOLLEY, EVENT_COMMANDER_ADVANCE, EVENT_RETREAT } from './battle_events.js';
import { camp } from './b_mid.js';
import { sightPoint } from './battle_sight.js';
import { heightOf, buildCastlePlan } from './castle_plan.js';
import { horiboriHeight, mizubori } from './castle_parts.js';
import { reset as flReset, groundAt, addDeck } from './floors.js';
import { NAKA } from './naka.js';
import { aimArm, bodyGeometry } from './units_model.js';
import { lodSwap, muddyFlag } from './units_flags.js';
import { dirtTex, mudTex } from './nature.js';
import { makeNawabari } from './nawabari.js';
import { TENNOJI_PLAN, T_GATE, T_HONGATE, SOTO_POLY, HON_POLY, T_HOUSES, T_ROADS } from './castles/tennoji.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
// 深手で戦えない兵だけが残った隊も、敵の抵抗が終わったと数える。
const spent = (g) => gone(g) || !g.units.some((u) => u.alive && !u.fleeing && !u.woundOut);

// 戦の節目だけ鳴らす。合成の合図を既存の音源制限と距離・向きの処理へ渡す。
function tennojiCue(rt, kind, text, at, id = 'main') {
  const o = rt.objectives.find((o) => o.id === id);
  if (o) { o.cue = '合図：' + text; o.cueT = rt.t; }
  rt.army.playFar('sig_' + kind, at, 1);
  if (kind === 'kakari') {
    const step = rt.flags.step;
    rt.after(2.2, () => {
      if (!rt.over && !rt.flags.ending && rt.flags.step === step)
        rt.army.playFar('toki', at, 0.8);
    });
  }
}

const GATE_HOLD_SECONDS = 20; // 門内を押さえ続けて初めて陥落。押し返せば数え直す。
const FORT = { x: 0, z: -62, r: 18 };      // 天王寺砦（口は南）
const SHELTER = { x: -4, z: -74 };        // 主郭の門から六メートル奥。手当てに必要な護衛の六メートル以内に収める。
const GATE_REAR = { x: T_GATE.x, z: T_GATE.z - 6 };
// 南東の逆茂木の穂先（南へ約二十九メートルの線）より、五メートル外を通る。
const SORTIE_EXIT = { x: T_GATE.x, z: -24 };
const SORTIE_TURN = { x: 38, z: SORTIE_EXIT.z }; // 南門を出た後、東の堀の外へ回る角。
const SORTIE_NORTH = { x: 42, z: -110 }; // 東の逆茂木を越すまで、北へ進む道を示す。
function sortieWaypoint(rt) {
  const p = rt.player.u.pos;
  if (inPoly(SOTO_POLY, p.x, p.z)) return SORTIE_EXIT;
  if (p.x >= 34 && p.z <= -104) rt.flags.sortieClear = true;
  if (rt.flags.sortieClear) return null;
  if (p.x >= 36) return SORTIE_NORTH;
  return p.z < SORTIE_EXIT.z - 2 ? SORTIE_EXIT : SORTIE_TURN;
}
// 二キロ先の札を重ねず、追撃中は少し先の道を示す。同じ座標を使い回す。
function chaseWaypoint(rt) {
  const F = rt.flags;
  if (F.step !== 4 || F.kidoCut || F.ending || !F.chaseWay) return null;
  // 本隊が先に崩れても、まだ門の南にいる本人を堀や逆茂木へ直進させない。
  const exit = sortieWaypoint(rt);
  if (exit) return exit;
  const p = rt.player.u.pos, dx = F.kz.x - p.x, dz = F.kz.z - p.z;
  const scale = Math.min(1, 45 / (Math.hypot(dx, dz) || 1));
  F.chaseWay.x = p.x + dx * scale; F.chaseWay.z = p.z + dz * scale;
  return F.chaseWay;
}
const GATE_ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
function gateDirection(rt, at = T_GATE) {
  const p = rt.player, u = p.u.pos, dx = at.x - u.x, dz = at.z - (at === T_GATE ? 3 : 0) - u.z;
  if (Math.hypot(dx, dz) < 2.5) return 'ここ';
  const turn = Math.atan2(dx, dz) - (p.yaw || 0) - (p.camYawOff || 0);
  return GATE_ARROWS[(Math.round(turn / (Math.PI / 4)) % 8 + 8) % 8];
}
const HONGAN = { x: 30, z: FORT.z - 2500 }; // 石山本願寺。約二・五キロの隔たりを保つ。方角と細かな位置は推定。
const SHITEN = { x: 52, z: 6 };             // 四天王寺（戦国期の伽藍。東大門は石山合戦で焼けた、の設定で門は置かない）
const ODA = { flag: 'oda' };
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, hat: 'hachimaki', flag: 'namu' };
const SAIKA = { armor: 0x2a2622, lace: 0x4a3a2a, hat: 'jingasa', flag: 'sagarifuji' };
const KIDO = { x: 12, z: HONGAN.z + 62 };   // 大坂の城戸口（石山の外の木戸。この戦で本願寺の中へは入らない）
const SHIMO = { x: 34, z: KIDO.z - 18 };    // 下間頼廉の本陣（総大将は城戸口の後ろ。前の斬り合いには出ない）
// 寺内町東側の二街区。水堀・屋敷・井楼の位置と寸法は推定。
// 城戸口の戦列・下間勢の退路（中央）から離し、天王寺の台地の空堀とは分ける。
const TOWN_HORI = [
  [[60, KIDO.z - 42], [112, KIDO.z - 42], [112, KIDO.z - 120], [60, KIDO.z - 120], [60, KIDO.z - 42]],
  [[60, KIDO.z - 81], [112, KIDO.z - 81]],
];
const TOWN_DITCHES = TOWN_HORI.map(pts => horiboriHeight(pts, { depth: 2.2, width: 6 }));


// 四天王寺の西、勝鬘院と茶臼山の間の台地西端とする説に合わせる。
// 大阪府立中之島図書館の位置調査：https://crd.ndl.go.jp/reference/entry/reference/show?id=1000295311&page=ref_view
// 村の家並み・民の人数・細い道筋は推定。現代の城下町は置かず、既存の村と堂を使う。
const PEOPLE_PATHS = [
  [[-56, 66], [-56, 88], [-56, 132], [-70, 182]], // 西の百姓は低地のまま南へ。台地の崖へ登らない。
  [[48, 58], [48, 82], [64, 132], [80, 190]], // 四天王寺門前の人は救援の東西道を渡らず南へ。
  [[38, -118], [54, -118], [76, -148], [120, -180]], // 勝鬘院の堂脇から東へ。砦の空堀と北への追撃路を避ける。
];
const PEOPLE_BANDS = PEOPLE_PATHS.map((path, i) => ({
  x: path[0][0], z: path[0][1], mode: i === 2 ? 'inside' : 'watch',
  kinds: i === 0 ? ['farmer', 'farmer', 'woman', 'child', 'elder']
    : i === 1 ? ['townsman', 'merchant', 'monk', 'woman', 'child']
      : ['monk', 'monk', 'woman', 'elder'],
  route: path.slice(1).map(([x, z]) => ({ x, z })),
}));
function peopleRoadDistance(x, z) {
  let distance = Infinity;
  for (const path of PEOPLE_PATHS) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    distance = Math.min(distance, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return distance;
}

// 野の四角い終わりを霞の奥へつなぐ。既存の外周に一周だけ足し、兵の地面・道は変えない。
function fortHorizon(rt) {
  const W = rt.world, far = W.farLand, p = far.geometry.attributes.position;
  // 北への細長い延長部も、その脇の野も同じ台地につなぐ。
  // 共通の遠景用の丘が境界で急に始まると、四角い棚と裂け目に見える。
  for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
  p.needsUpdate = true;
  far.geometry.computeVertexNormals();
  far.geometry.computeBoundingSphere();
  const color = far.geometry.attributes.color, edge = [];
  let cols = 1;
  while (cols < p.count && p.getZ(cols) === p.getZ(0)) cols++;
  const rows = p.count / cols;
  for (let i = 0; i < cols; i++) edge.push(i);
  for (let j = 1; j < rows; j++) edge.push(j * cols + cols - 1);
  for (let i = cols - 2; i >= 0; i--) edge.push((rows - 1) * cols + i);
  for (let j = rows - 2; j > 0; j--) edge.push(j * cols);
  const x0 = p.getX(0), x1 = p.getX(cols - 1), z0 = p.getZ(0), z1 = p.getZ(p.count - 1);
  const vertices = [], colors = [], index = [], n = edge.length;
  for (const margin of [0, 900]) for (const i of edge) {
    const x = p.getX(i), z = p.getZ(i);
    const ox = x + (x === x0 ? -margin : x === x1 ? margin : 0);
    const oz = z + (z === z0 ? -margin : z === z1 ? margin : 0);
    vertices.push(ox, margin ? baseTerrain(ox, oz) : p.getY(i), oz);
    colors.push(color.getX(i), color.getY(i), color.getZ(i));
  }
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    index.push(i, next, n + i, next, n + next, n + i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index); geometry.computeVertexNormals();
  rt.scene.add(new THREE.Mesh(geometry, far.material));
  const dispose = W.dispose;
  W.dispose = function () { geometry.dispose(); dispose.call(this); };
}

// 携帯の地面は艶を使わず、土・草・泥の色を直接混ぜる。形と足場は共通のまま。
function fortGround(rt) {
  if (SETTINGS.quality === 'high') return;
  const W = rt.world, old = W.terrain.material;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.userData.camNearSolid = true;
  mat.customProgramCacheKey = () => 'tennoji-earth';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, W.groundU);
    sh.vertexShader = 'attribute vec3 splat; attribute float water; varying vec3 vEarthMix; varying vec3 vEarthWorld; varying float vEarthWater;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n vEarthMix = splat; vEarthWater = water; vEarthWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform sampler2D tGrass, tDirt, tMud, tMacro, tWear; uniform float uWet; varying vec3 vEarthMix; varying vec3 vEarthWorld; varying float vEarthWater;\n' + sh.fragmentShader.replace(
      '#include <map_fragment>', `
      vec2 uvEarth = vEarthWorld.xz;
      float patch = texture2D(tMacro, uvEarth * 0.023).r;
      vec3 mixEarth = max(vEarthMix, vec3(0.0));
      vec2 marks = texture2D(tWear, (uvEarth + ${W.half.toFixed(1)}) / ${(W.half * 2).toFixed(1)}).rg;
      float trod = smoothstep(0.05, 0.75, marks.r);
      float bare = mixEarth.x * trod * 0.85;
      mixEarth.x -= bare; mixEarth.y += bare * (1.0 - uWet * 0.6); mixEarth.z += bare * uWet * 0.6;
      mixEarth /= max(0.001, mixEarth.x + mixEarth.y + mixEarth.z);
      vec3 earth = texture2D(tGrass, uvEarth * 0.21).rgb * mixEarth.x
        + texture2D(tDirt, uvEarth * 0.23).rgb * mixEarth.y
        + texture2D(tMud, uvEarth * 0.25).rgb * mixEarth.z;
      earth *= mix(0.78, 1.08, patch) * (1.0 - uWet * 0.25);
      earth = mix(earth, vec3(0.075, 0.08, 0.06), smoothstep(0.3, 0.8, vEarthWater) * 0.85);
      earth = mix(earth, earth * vec3(0.55, 0.3, 0.26), smoothstep(0.08, 0.7, marks.g) * 0.75);
      diffuseColor.rgb *= earth;`);
  };
  W.terrain.material = mat;
  old.dispose();
}

// 城戸口にも同じ土・草の絵。町の堀の近くだけ地面を細分し、遠方は元の粗い面を保つ。
function kidoGround(rt) {
  const W = rt.world, far = W.farLand.geometry, p = far.attributes.position;
  const keep = [], near = [], vertices = [], normals = [], splat = [], remap = new Map();
  const paths = W.def.paths;
  const vertexAt = (x, z, y) => {
    const key = x + ':' + z;
    if (remap.has(key)) return remap.get(key);
    const n = vertices.length / 3;
    remap.set(key, n);
    vertices.push(x, y, z);
    normals.push(0, 1, 0);
    let distance = Infinity;
    for (const path of paths) for (let j = 1; j < path.length; j++) {
      const a = path[j - 1], b = path[j], dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
      distance = Math.min(distance, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
    }
    const inTown = x > 63 && x < 109 && z > KIDO.z - 117 && z < KIDO.z - 45;
    const grass = inTown ? .08 : Math.min(1, Math.max(0, (distance - 1) / 3));
    const mud = (1 - grass) * .24;
    splat.push(grass, 1 - grass - mud, mud);
    return n;
  };
  const vertex = i => vertexAt(p.getX(i), p.getZ(i), height(p.getX(i), p.getZ(i)));
  const midpoint = (a, b) => {
    const x = (vertices[a * 3] + vertices[b * 3]) / 2;
    const z = (vertices[a * 3 + 2] + vertices[b * 3 + 2]) / 2;
    return vertexAt(x, z, height(x, z));
  };
  const subdivide = (a, b, c, depth = 0) => {
    const ids = [a, b, c], xs = ids.map(i => vertices[i * 3]), zs = ids.map(i => vertices[i * 3 + 2]);
    const touches = Math.max(...xs) > 56 && Math.min(...xs) < 116
      && Math.max(...zs) > KIDO.z - 124 && Math.min(...zs) < KIDO.z - 38;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    if (!touches || span <= 2 || depth >= 6) { near.push(a, b, c); return; }
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    subdivide(a, ab, ca, depth + 1); subdivide(ab, b, bc, depth + 1);
    subdivide(ca, bc, c, depth + 1); subdivide(ab, bc, ca, depth + 1);
  };
  const index = far.index.array;
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3;
    const z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
    if (Math.abs(x - KIDO.x) < 130 && Math.abs(z - KIDO.z) < 180) subdivide(vertex(a), vertex(b), vertex(c));
    else keep.push(a, b, c);
  }
  far.setIndex(keep);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('splat', new THREE.Float32BufferAttribute(splat, 3));
  geometry.setAttribute('water', new THREE.Float32BufferAttribute(new Float32Array(vertices.length / 3), 1));
  geometry.setAttribute('groundCover', new THREE.Float32BufferAttribute(new Float32Array(vertices.length / 3 * 2), 2));
  geometry.setIndex(near); geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, W.terrain.material);
  ground.receiveShadow = true;
  rt.scene.add(ground);
  const dispose = W.dispose;
  W.dispose = function () { geometry.dispose(); dispose.call(this); };
}

// 下地：上町台地（天王寺側は高台、西・北西は低地）。砦の段・空堀は castles/tennoji.js の縄張りが重ねる
function baseTerrain(x, z) {
  let h = 0.3 * Math.sin(x * 0.04 + 0.2) * Math.cos(z * 0.03) + 0.2 * Math.sin(z * 0.07 + x * 0.02);
  const cliff = 1 / (1 + Math.exp(-(x + 26) * 0.35));   // 崖線は x=-26 の辺り
  h += 7 * cliff;
  const nw = Math.max(0, Math.min(1, (-88 - z) / 60)) * Math.max(0, Math.min(1, (6 - x) / 60));
  h -= 3 * nw;   // 北西はさらに低く・湿地がち
  // 茶臼山の低い丘。勝鬘院との南北関係を示す補いで、山城の比高は加えない。
  h += 2.5 * Math.exp(-((x + 5) ** 2 + (z - 65) ** 2) / 400);
  if (x > 56 && x < 116 && z > KIDO.z - 124 && z < KIDO.z - 38) {
    // 交差する堀を二重に掘らず、同じ水面へつなぐ。
    let ditch = 0;
    for (const f of TOWN_DITCHES) ditch = Math.min(ditch, f(x, z));
    h += ditch;
  }
  return h;
}
const HORI_FNS = TENNOJI_PLAN.hori.map((h) => horiboriHeight(h.pts, { depth: h.deep ?? 2, width: h.w ?? 6 }));
function baseWithHori(x, z) { let h = baseTerrain(x, z); for (const f of HORI_FNS) h += f(x, z); return h; }
let HEIGHT_FN = null;
function height(x, z) {
  if (!HEIGHT_FN) {
    const raw = heightOf(TENNOJI_PLAN, baseWithHori, 3);
    const pads = T_HOUSES.map((h) => ({ ...h, y: baseTerrain(FORT.x, FORT.z) + (h.kind === 'goten' ? 1.9 : 1.1) }));
    // 曲輪の縁の切岸を虎口だけ緩い坂へ替える。堀の掘り残しと口の幅の内に収める。
    const ramps = [[0, -30, 0, -46, 2.5], [-4, -63, -4, -71, 1.9]].map(([ax, az, bx, bz, w]) => ({
      ax, az, bx, bz, w, dx: bx - ax, dz: bz - az, l2: (bx - ax) ** 2 + (bz - az) ** 2,
      ya: raw(ax, az), yb: raw(bx, bz),
    }));
    HEIGHT_FN = (px, pz) => {
      let y = raw(px, pz);
      for (const r of ramps) {
        const t = ((px - r.ax) * r.dx + (pz - r.az) * r.dz) / r.l2;
        if (t < 0 || t > 1) continue;
        const d = Math.hypot(px - r.ax - r.dx * t, pz - r.az - r.dz * t);
        if (d >= r.w + .5) continue;
        const k = Math.min(1, (r.w + .5 - d) / .5);
        y += (r.ya + (r.yb - r.ya) * t - y) * k;
      }
      // 床下と入口を同じ平場へならす。土塁や主郭の切岸が小屋の隅へ食い込まない。
      for (const p of pads) {
        const d = Math.max(Math.abs(px - p.x) - p.w / 2, Math.abs(pz - p.z) - p.d / 2);
        if (d >= 1) continue;
        const k = Math.min(1, (1 - d) / .75);
        y += (p.y - y) * k;
      }
      return y;
    };
  }
  return HEIGHT_FN(x, z);
}

// 空堀の外は尖った伐り木を斜めに束ねる。直立する支柱と横木は置かない。
function fortAbatis(rt) {
  const W = rt.world, pieces = [], up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion();
  const branch = (ax, ay, az, bx, by, bz, radius) => {
    dir.set(bx - ax, by - ay, bz - az);
    const g = new THREE.CylinderGeometry(.006, radius, dir.length(), 5);
    q.setFromUnitVectors(up, dir.normalize()); g.applyQuaternion(q);
    g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); pieces.push(g);
  };
  for (const [x, z, rot, len] of [[-33, -58, Math.PI / 2, 8], [-33, -74, Math.PI / 2, 8], [33, -60, -Math.PI / 2, 8], [33, -76, -Math.PI / 2, 8], [-14, -101, Math.PI, 9], [14, -101, Math.PI, 9], [-22, -33, 0.5, 7], [22, -33, -0.5, 7]]) {
    const sn = Math.sin(rot), cs = Math.cos(rot);
    for (let i = 0; i < Math.ceil(len / .8); i++) {
      const t = -len / 2 + (i + .5) * .8 + Math.sin(i * 2.3 + x) * .18;
      const scatter = Math.sin(i * 4.1 + z) * .42;
      const ax = x + cs * t + sn * scatter, az = z - sn * t + cs * scatter, ay = W.heightAt(ax, az) + .04;
      const length = 1.8 + (1 + Math.sin(i * 2.7 + x)) * .55, sway = Math.sin(i * 1.7 + z) * .75;
      const bx = ax + sn * length + cs * sway, bz = az + cs * length - sn * sway;
      const by = W.heightAt(bx, bz) + .45 + (1 + Math.sin(i * 3.9 + x)) * .3;
      branch(ax, ay, az, bx, by, bz, .16);
      // 同じ三本分の面数で、平行な棒の束を幹と左右の枝に替える。
      for (const side of [-1, 1]) {
        const along = .38 + (1 + Math.sin(i * 2.1 + side + z)) * .17;
        const sx = ax + (bx - ax) * along, sz = az + (bz - az) * along;
        const sy = ay + (by - ay) * along;
        const spread = .5 + (1 + Math.sin(i * 3.3 + side)) * .25;
        const ex = sx + sn * .55 + cs * side * spread, ez = sz + cs * .55 - sn * side * spread;
        branch(sx, sy, sz, ex, Math.max(sy + .18, W.heightAt(ex, ez) + .12), ez, .035);
      }
    }
  }
  const geometry = mergeGeometries(pieces), material = new THREE.MeshLambertMaterial({ color: 0x776047 });
  const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; rt.scene.add(mesh);
  for (const g of pieces) g.dispose();
}

// 天王寺だけの接地。門の口は保ち、土塁上の杭から足元を離す。
function fortSoldiers(rt) {
  const A = rt.army, W = rt.world, animate = A.animate, add = A.addUnit, loose = A.updateLooseHorses;
  const canDuel = A.hooks.canDuel;
  // 門を守る乱戦では名乗りで足を止めない。打って出た後の勝負は共通のまま。
  A.hooks.canDuel = () => rt.flags.step >= 3 && !!canDuel?.();
  A.addUnit = function (g, o) { const u = add.call(this, g, o); u.tennojiGrounded = true; return u; };
  for (const u of A.units) u.tennojiGrounded = true;
  A.animate = function (u, dt, near) {
    if (u.alive && !u.dying && !u.mounted && !u.climb && !u.downed && !u.perch && !u.isStruct) {
      for (const s of rt.flags.C.walls) {
        if (!s?.seg || !s.alive || s.opened) continue;
        const [ax, az, bx, bz] = s.seg, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((u.pos.x - ax) * dx + (u.pos.z - az) * dz) / (l2 || 1)));
        const ox = u.pos.x - ax - dx * t, oz = u.pos.z - az - dz * t, d = Math.hypot(ox, oz);
        if (d >= .85) continue;
        const nx = d > .001 ? ox / d : -dz / Math.sqrt(l2 || 1), nz = d > .001 ? oz / d : dx / Math.sqrt(l2 || 1);
        u.pos.x += nx * (.85 - d); u.pos.z += nz * (.85 - d);
      }
      u.pos.y = groundAt(W, u.pos.x, u.pos.z, u.pos.y);
    }
    animate.call(this, u, dt, near);
    if (u.alive && !u.dying && !u.mounted && !u.climb && !u.downed && !u.perch && !u.isStruct) {
      // 切岸の急な差を体全体の傾きにしない。斬り合いの腰の弾みも五センチまで。
      u.mesh.rotation.x = THREE.MathUtils.clamp(u.mesh.rotation.x, -.12, .12);
      u.mesh.rotation.z = THREE.MathUtils.clamp(u.mesh.rotation.z, -.12, .12);
      if (u.body) u.body.position.y = Math.min(.05, u.body.position.y);
      // 足が着く拍子だけ土を蹴る。斬り合いの踏み込みと敗走も同じ粒を使う。
      // 骨のある兵は録った歩みの時計、軽い兵は脚の時計へ合わせる。
      const beat = u.human && Number.isFinite(u.human.gaitPhase)
        ? Math.floor(u.human.gaitPhase * 2) : Math.floor(u.anim / Math.PI);
      const landed = u.tennojiFootBeat !== undefined && beat !== u.tennojiFootBeat;
      u.tennojiFootBeat = beat;
      if (near && !u.offscreen && !u.imp && !u.isPlayer && !u.naka && !u.woundOut &&
          !u.hit && !(u.stagger > 0) && u.moving > .35 && u.camD < 40 && landed && !rt.over && !rt.flags.ending) {
        // 全員合わせて〇・一五秒に二回まで。止まった兵から煙を出さない。
        if (this.time >= (this.tennojiFootReset || 0)) { this.tennojiFootReset = this.time + .15; this.tennojiFootN = 0; }
        if (this.tennojiFootN < 2 && Math.abs(u.pos.y - W.heightAt(u.pos.x, u.pos.z)) < .35) {
          this.tennojiFootN++;
          const side = beat % 2 ? .14 : -.14;
          W.puff(u.pos.x + Math.cos(u.heading) * side, u.pos.z - Math.sin(u.heading) * side, 1);
        }
      }
    }
  };
  A.updateLooseHorses = function (dt) {
    loose.call(this, dt);
    const list = this.looseHorses;
    if (!list) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      // 捕らえた馬は残す。主を失った空馬は走り去った後に消す。
      if (!o.kept && !(o.held > 0) && o.t > 4) this.fadeGround(o.h, Math.min(4, Math.ceil(o.t - 4)));
      if (!o.kept && !(o.held > 0) && o.t > 8) { this.scene.remove(o.h); list.splice(i, 1); }
    }
  };
  // 深手の視点にも、通常の視点と同じ手前の門板の回避を使う。
  const player = rt.player, downCamera = player.updateDownCamera;
  const target = new THREE.Vector3(), look = new THREE.Vector3();
  player.updateDownCamera = function (dt, camera) {
    downCamera.call(this, dt, camera);
    target.copy(this.u.pos); target.y += 1.8;
    camera.getWorldDirection(look); look.multiplyScalar(12).add(camera.position);
    this.camFrontClear(target, camera.position, look, false);
    this.camPos.copy(camera.position);
    camera.lookAt(look);
  };
}

// 板葺きの仮設小屋。外壁と戸口の寸法を共通室内（0_naibu）へ渡す。
// 室内の近接時の処理が、購入済みの城の板床・和の部屋の部品を使う。
function fortHouses(rt) {
  const wood = [], roofs = [], trim = [], shutters = [], rooms = [], floor = .24, doorW = 1.5;
  const detailed = true, stones = [], plaster = [];
  const stone = detailed ? new THREE.DodecahedronGeometry(1, 0) : null;
  // 小さな木目を全棟で共用。外から素材を読まず、設営時に一度だけ描く。
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8d0c2'; ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 96; i++) {
    const xx = (i * 37) % 128, yy = (i * 53) % 256;
    ctx.strokeStyle = i % 3 ? 'rgba(64,48,32,.18)' : 'rgba(255,248,230,.25)';
    ctx.lineWidth = i % 5 ? 1 : 2;
    ctx.beginPath(); ctx.moveTo(xx, yy); ctx.bezierCurveTo(xx + 3, yy + 25, xx - 2, yy + 58, xx + 1, yy + 85); ctx.stroke();
  }
  const grain = new THREE.CanvasTexture(canvas);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.colorSpace = THREE.SRGBColorSpace;
  // 共通の小屋と同じ回り込みの光。日陰の板壁を黒一色にしない。
  // 高画質は空の映り込み、携帯の軽い材質は空からの間接光を使う。
  const houseMaterial = (options) => {
    const material = detailed
      ? new THREE.MeshStandardMaterial({ ...options, roughness: .92, metalness: 0 })
      : new THREE.MeshLambertMaterial(options);
    // 外装だけを画面の形に抜くと、屋根が破れて重し石が宙に残る。
    // 小屋は外形を保ち、既存の壁の当たりで視点を避ける。室内の見通しは共通のまま。
    material.userData.camNearSolid = true;
    if (!detailed) material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n reflectedLight.indirectDiffuse *= 4.0;');
    };
    return material;
  };
  let baseY = 0;
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const box = (bag, x, y, z, w, h, d, rz = 0) => {
    const g = unitBox.clone();
    g.scale(w, h, d);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    const p = g.attributes.position, colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      // 足もとの泥と雨染み。上の板まで一様な茶色にしない。
      const k = bag === wood ? .62 + .38 * Math.min(1, Math.max(0, (p.getY(i) - baseY) / .9)) : 1;
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); bag.push(g);
  };
  for (const h of T_HOUSES) {
    const { x, z, w, d } = h, y = rt.world.heightAt(x, z);
    baseY = y;
    // 番所は低く、蔵は高く急な屋根、陣屋は軒を広くする。床と戸口の位置は保つ。
    const H = h.kind === 'kura' ? 3.05 : h.kind === 'goten' ? 2.85 : d < 4 ? 2.45 : 2.65;
    const pitch = h.kind === 'kura' ? .65 : h.kind === 'goten' ? .48 : .42;
    const eave = h.kind === 'goten' ? .8 : .55;
    box(wood, x, y + H / 2, z - d / 2, w, H, .12);
    for (const side of [-1, 1]) {
      box(wood, x + side * w / 2, y + H / 2, z, .12, H, d);
      const span = (w - doorW) / 2;
      box(wood, x + side * (doorW / 2 + span / 2), y + H / 2, z + d / 2, span, H, .12);
      for (const zz of [-d / 2, d / 2]) box(trim, x + side * w / 2, y + H / 2, z + zz, .2, H + .1, .2);
    }
    const top = floor + 2;
    box(wood, x, y + (top + H) / 2, z + d / 2, doorW, H - top, .12);
    // 横板の下端を重ね、斜めからも板の厚みと陰が見えるようにする。
    for (let yy = .3; yy < H - .1; yy += .32) for (const side of [-1, 1]) {
      box(wood, x + side * (w / 2 + .075), y + yy, z, .055, .08, d);
      if (side < 0) box(wood, x, y + yy, z - d / 2 - .075, w, .08, .055);
      const span = (w - doorW) / 2;
      box(wood, x + side * (doorW / 2 + span / 2), y + yy, z + d / 2 + .075, span, .08, .055);
    }
    // 板の継ぎ目と胴縁。戸口の中には部品を置かず、通れる幅を保つ。
    for (const side of [-1, 1]) {
      for (let xx = -w / 2 + .45; xx < w / 2; xx += .45) {
        const overDoor = side > 0 && Math.abs(xx) < doorW / 2 + .04;
        box(trim, x + xx, y + (overDoor ? (top + H) / 2 : H / 2), z + side * (d / 2 + .065),
          .025, overDoor ? H - top : H, .02);
      }
      for (let zz = -d / 2 + .45; zz < d / 2; zz += .45)
        box(trim, x + side * (w / 2 + .065), y + H / 2, z + zz, .02, H, .025);
      box(trim, x + side * w / 2, y + H - .1, z, .18, .16, d);
      box(trim, x, y + H - .1, z + side * d / 2, w, .16, .18);
      box(trim, x + side * (doorW / 2 + .08), y + floor + 1, z + d / 2, .16, 2.1, .22);
      // 開き戸の付け根を柱へ重ねる。戸先だけが庭に立つような隙間を残さない。
      box(shutters, x + side * (doorW / 2 + .09), y + floor + 1, z + d / 2 + .34, .08, 1.95, .7);
      for (const yy of [.55, 1.5]) {
        box(trim, x + side * (doorW / 2 + .09), y + floor + yy, z + d / 2 + .34, .12, .1, .7);
        // 柱と戸をつなぐ短い取付部。既存の木部へ結合し、描く回数を増やさない。
        box(trim, x + side * (doorW / 2 + .09), y + floor + yy, z + d / 2 + .05, .18, .14, .22);
      }
      // 窓は閉じた板戸として外壁の上へ重ねる。
      box(shutters, x + side * (w / 2 + .09), y + 1.65, z, .08, .85, 1.1);
      for (const yy of [1.18, 2.12]) box(trim, x + side * (w / 2 + .13), y + yy, z, .13, .1, 1.28);
      for (const zz of [-.59, 0, .59]) box(trim, x + side * (w / 2 + .13), y + 1.65, z + zz, .13, .94, .08);
      // 柱と横木の結び縄。短い巻きをまとめて描き、動く部品は増やさない。
      for (const zz of [-d / 2, d / 2]) for (let q = 0; q < 3; q++) {
        box(shutters, x + side * w / 2, y + H - .22 + q * .045, z + zz, .25, .025, .25);
      }
    }
    box(trim, x, y + top, z + d / 2, doorW + .32, .16, .22);
    if (detailed && h.kind === 'goten') {
      // 清洲の御殿のように、陣屋だけ土壁と板の腰。天正四年の付城の細部は推定。
      // 白漆喰の城郭にはせず、くすんだ土色の小壁を柱間へ入れる。
      const low = .95, high = H - .23, panelH = high - low;
      for (const side of [-1, 1]) {
        const face = z + side * (d / 2 + .115);
        for (const sd of [-1, 1]) {
          const start = doorW / 2 + .18, end = w / 2 - .17;
          box(plaster, x + sd * (start + end) / 2, y + (low + high) / 2, face,
            end - start, panelH, .035);
          box(trim, x + sd * (start + end) / 2, y + low, face + side * .025,
            end - start, .12, .1);
          box(trim, x + sd * (start + end) / 2, y + (low + high) / 2, face + side * .025,
            .12, panelH, .1);
        }
        // 側面の板戸とその桟は露出させ、窓を土壁で埋めない。
        for (const sd of [-1, 1]) {
          const start = .72, end = d / 2 - .17;
          box(plaster, x + side * (w / 2 + .115), y + (low + high) / 2,
            z + sd * (start + end) / 2, .035, panelH, end - start);
          box(trim, x + side * (w / 2 + .14), y + low, z + sd * (start + end) / 2,
            .1, .12, end - start);
        }
      }
    }
    // 緩い切妻の板屋根と板の妻壁。瓦・天守の部品は使わない。
    const half = w / 2 + eave, rise = half * pitch, angle = Math.atan2(rise, half);
    // 軒先を壁より下げ、棟と妻壁の頂点をそろえる。
    const roofY = y + H - eave * pitch, slope = Math.hypot(half, rise);
    for (const side of [-1, 1]) {
      // 板葺きを軒から棟へ重ねる。端の段差で平らな一枚板に見せない。
      const rows = Math.ceil(slope / .55);
      for (let q = 0; q < rows; q++) {
        const t = (q + .5) / rows;
        if (detailed) {
          // 長い一枚板をやめ、短い葺き板ごとに褪せと軒の雨染みを描く。
          // 薄い面を二枚の三角で作り、板の数だけ箱を増やさない。
          const length = d + eave * 2, cols = Math.ceil(length / .65);
          const grid = new THREE.PlaneGeometry(slope / rows + .09, length, 1, cols);
          const g = grid.toNonIndexed(); grid.dispose();
          const p = g.attributes.position, colors = new Float32Array(p.count * 3);
          for (let i = 0; i < p.count; i++) {
            const col = Math.floor(i / 6), center = length / 2 - (col + .5) * length / cols;
            p.setY(i, center + (p.getY(i) - center) * (1 - .012 * cols / length));
            const shade = .78 + ((col * 7 + q * 11 + Math.abs(x) + (side + 1) * 3) % 13) * .022;
            const rain = q === rows - 1 ? .83 : 1;
            colors[i * 3] = shade * rain;
            colors[i * 3 + 1] = shade * rain;
            colors[i * 3 + 2] = shade * rain;
          }
          g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          g.rotateX(-Math.PI / 2); g.rotateZ(-side * angle);
          g.translate(x + side * half * t, roofY + rise * (1 - t) + .045, z);
          roofs.push(g);
        } else box(roofs, x + side * half * t, roofY + rise * (1 - t) + .025 * (1 - t), z,
          slope / rows + .09, .085, d + eave * 2, -side * angle);
      }
      for (let zz = -d / 2 - .5; zz <= d / 2 + .5; zz += .45)
        box(trim, x + side * half / 2, roofY + rise / 2 + .07, z + zz, slope, .035, .025, -side * angle);
      box(trim, x + side * half, roofY, z, .13, .18, d + eave * 2);
      if (detailed) {
        // 写真の小屋の軒裏に見える垂木の木口。隠れる屋根内部は作らず、短い張り出しだけ。
        const length = (eave + .18) / Math.cos(angle), t = half - (eave + .18) / 2;
        for (let zz = -d / 2 - .3; zz <= d / 2 + .3; zz += .65)
          box(trim, x + side * t, roofY + (half - t) * pitch - .12, z + zz,
            length, .12, .1, -side * angle);
      }
    }
    box(trim, x, roofY + rise + .07, z, .24, .2, d + 1.25);
    // 古板を押さえる横木。写真の低い番所・長屋の灰茶の板葺きに寄せる。
    for (const side of [-1, 1]) for (const zz of [-d / 3, d / 3])
      box(trim, x + side * half / 2, roofY + rise / 2 + .16, z + zz, slope, .1, .12, -side * angle);
    // 押さえ木に沿う平たい重し石。板の上へ接地させ、瓦の列のようには並べない。
    if (detailed) for (const side of [-1, 1]) for (const zz of [-d / 3, d / 3]) {
      for (const t of [.3, .72]) {
        const g = stone.clone();
        g.scale(.23 + t * .07, .11, .19); g.rotateY(zz + side);
        g.rotateZ(-side * angle);
        g.translate(x + side * half * t, roofY + rise * (1 - t) + .28, z + zz);
        stones.push(g);
      }
    }
    for (const zz of [-d / 2, d / 2]) {
      const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, w / 2 * pitch)]);
      const g = new THREE.ShapeGeometry(shape);
      if (zz < 0) g.rotateY(Math.PI);
      g.translate(x, y + H, z + zz); wood.push(g);
    }
    rooms.push(addInterior(rt.world, { ...h, levels: [{ y: y + floor, w: w - .12, d: d - .12, h: H - floor }],
      hasExterior: true, team: 0, wins: () => [], door: { side: 1, lx: 0, w: doorW, h: 2 },
      approach: { pad: .35, len: 1.1 }, oku: h.kind === 'goten' ? .35 : 0 }));
  }
  // 水を確保する板囲いの井戸も推定。道から離して見た目の半径だけ当たりを付ける。
  const wx = 9, wz = -62, wy = rt.world.heightAt(wx, wz);
  baseY = wy;
  for (const side of [-1, 1]) {
    box(wood, wx + side * .65, wy + .4, wz, .12, .8, 1.4);
    box(wood, wx, wy + .4, wz + side * .65, 1.4, .8, .12);
  }
  solidCircle(wx, wz, 1);
  if (detailed) {
    // 番所裏の備え盾。南の門・長屋の戸口・主郭へ上がる道から外す。
    const sx = -10, sz = -59, sy = rt.world.heightAt(sx, sz);
    for (let i = 0; i < 4; i++) {
      const px = sx - .96 + i * .64;
      box(wood, px, sy + .86, sz, .6, 1.7, .085, 0);
      for (const yy of [.35, 1.3]) box(trim, px, sy + yy, sz - .09, .56, .1, .1);
      box(trim, px, sy + .55, sz - .3, .1, 1.1, .1, 0);
    }
    box(trim, sx, sy + .95, sz - .32, 2.7, .12, .12);
    solidRect(sx, sz - .15, 2.7, .65, 0);
    // 井戸脇の水桶。口は黒い蓋で塞がず、薄い側板と底を別に作る。
    const tub = new THREE.CylinderGeometry(.28, .24, .5, 10, 1, true);
    const hoop = new THREE.TorusGeometry(.265, .018, 4, 10); hoop.rotateX(Math.PI / 2);
    for (const dz of [-.6, .6]) {
      const x = wx + 1.65, z = wz + dz, y = rt.world.heightAt(x, z);
      const g = tub.clone(); g.translate(x, y + .27, z); wood.push(g);
      box(wood, x, y + .045, z, .34, .06, .34);
      for (const yy of [.14, .42]) {
        const ring = hoop.clone(); ring.translate(x, y + yy, z); trim.push(ring);
      }
      solidCircle(x, z, .3);
    }
    tub.dispose(); hoop.dispose(); stone.dispose();
    // 東長屋の脇に予備の槍を預ける架台。常設の武器庫にせず、普請材の足と横木で組む。
    // 位置・本数は補完。門、長屋の南戸口、主郭へ上がる枝道から離す。
    const rx = 10, rz = -62, ry = rt.world.heightAt(rx, rz);
    baseY = ry;
    for (const side of [-1, 1]) {
      const px = rx + side * 1.3, bottom = rt.world.heightAt(px, rz) - .08;
      box(trim, px, (bottom + ry + 1.85) / 2, rz, .13, ry + 1.85 - bottom, .13);
      box(trim, px, bottom + .13, rz, .18, .18, .95);
      for (let i = 0; i < 3; i++) box(shutters, px, ry + 1.5 + i * .04, rz, .18, .025, .19);
    }
    box(trim, rx, ry + 1.55, rz, 2.9, .15, .15);
    const shaft = new THREE.CylinderGeometry(.024, .032, 1, 5);
    const bladeBase = new THREE.ConeGeometry(1, 1, 4), blade = bladeBase.toNonIndexed();
    bladeBase.dispose();
    const lean = .16;
    for (let i = 0; i < 6; i++) {
      const px = rx - 1 + i * .4, bottom = rt.world.heightAt(px, rz + .25);
      const length = 3.5 + (i % 3) * .12;
      const pole = shaft.clone(); pole.scale(1, length, 1); pole.rotateX(-lean);
      pole.translate(px, bottom + .06 + length * Math.cos(lean) / 2,
        rz + .25 - length * Math.sin(lean) / 2); wood.push(pole);
      // 小さな平たい穂先。別の材質を足さず、重し石と同じ灰色の結合へ入れる。
      const head = blade.clone(); head.scale(.065, .27, .022); head.rotateX(-lean);
      head.translate(px, bottom + .06 + (length + .135) * Math.cos(lean),
        rz + .25 - (length + .135) * Math.sin(lean)); stones.push(head);
    }
    shaft.dispose(); blade.dispose();
    solidRect(rx, rz, 2.9, .95, 0);
  }
  unitBox.dispose();
  // 木部は既存の四材質へ結合。高画質の陣屋の土壁だけ一材質を共用する。
  for (const [bag, color] of [[wood, 0x6b5239], [roofs, 0x948777], [trim, 0x493727], [shutters, 0x59432f], [plaster, 0xb5a58a]]) {
    if (!bag.length) continue;
    for (const g of bag) if (!g.attributes.color) {
      const colors = new Float32Array(g.attributes.position.count * 3); colors.fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const pieces = bag.map((g) => g.index ? g.toNonIndexed() : g);
    const geometry = mergeGeometries(pieces, false);
    const mesh = new THREE.Mesh(geometry, houseMaterial({ color, map: bag === plaster ? null : grain, vertexColors: true, side: THREE.DoubleSide }));
    // 束ねた小屋も視点の壁にする。戸口の空きは形のまま判定する。
    mesh.userData.camBlock = true;
    mesh.castShadow = mesh.receiveShadow = true; rt.scene.add(mesh);
    for (const g of pieces) if (!bag.includes(g)) g.dispose();
    for (const g of bag) g.dispose();
  }
  if (stones.length) {
    const mesh = new THREE.Mesh(mergeGeometries(stones), houseMaterial({ color: 0x77746b }));
    mesh.castShadow = mesh.receiveShadow = true; rt.scene.add(mesh);
    for (const g of stones) g.dispose();
  }
  return rooms;
}

// 寺内町は同じ板葺き・土壁の町屋を束ねる。写真の配置を写さず、二街区だけ補う。
function templeTown(rt) {
  const W = rt.world, batch = makeSimpleBatch();
  const detailed = true, fences = [];
  // 共通の静かな水面。堀底の地形は baseTerrain と kidoGround で掘ってある。
  for (const pts of TOWN_HORI) mizubori(rt, pts, { depth: 2.2, width: 6, y: 6.2 });
  for (const dz of [-61, -100]) {
    const z = KIDO.z + dz;
    for (const [x, dd, ww] of [[72, -7, 7], [98, -7, 8], [100, 8, 12]])
      // 写真の町屋のように、黄土の壁と古板の長屋を混ぜる。板葺きの押さえ木は共通部品を使う。
      hut(W, x, z + dd, ww, 5, 0, { batch, ita: true, h: 2.5,
        boardRoof: detailed, wall: detailed ? (x === 72 ? 0xb0a084 : 0x80705a) : 0x88765d, minka: false });
    // 道沿いの板塀は囲いの入口だけ開ける。堀との間に土の通路を残す。
    const edges = [[66, z + 13, 82, z + 13], [90, z + 13, 106, z + 13],
      [66, z - 13, 106, z - 13]];
    // 屋敷の脇と隣家との境も囲う。橋から入る西側と、街区内の横道は開ける。
    if (detailed) edges.push([66, z - 13, 66, z - 2], [66, z + 2, 66, z + 13],
      [106, z - 13, 106, z + 13], [86, z - 13, 86, z - 2], [86, z + 2, 86, z + 13]);
    for (const seg of edges) {
      if (detailed) fences.push(seg);
      else {
        const fence = castleBoardFence(W, seg, { batch, h: 1.7, samaStep: 2 });
        if (!fence.isBatchedPart) rt.scene.add(fence);
      }
      solidRect((seg[0] + seg[2]) / 2, (seg[1] + seg[3]) / 2,
        Math.hypot(seg[2] - seg[0], seg[3] - seg[1]), .25,
        Math.atan2(-(seg[3] - seg[1]), seg[2] - seg[0]));
    }
  }
  finalizeSimpleBatch(rt, batch);
  if (detailed) townBoardEnclosures(rt, fences);
  if (detailed) tennojiWorkYards(rt);
  if (detailed) townMoatStakes(rt);
  if (detailed) townServiceYards(rt);
  // 井楼の横木と屋根は共有済みの形。遠くは既存の粗い形へ切り替わる。
  for (const [x, dz, boarded, height, rot] of [[67, -47, false, 7.2, Math.PI / 2], [105, -114, true, 9.6, 0]])
    rt.scene.add(yagura(W, x, KIDO.z + dz, { height: detailed ? height : 8.8,
      rot: detailed ? rot : 0, boarded, team: 1, mon: 'sagarifuji' }));
  for (const [x, dz] of [[68, -76], [104, -86]]) rt.scene.add(nobori(W, x, KIDO.z + dz, 'sagarifuji', 5));
  // 木橋で堂側と町、二つの街区をつなぐ。板床を実際の通れる床として登録。
  const pieces = [], supports = [], unit = new THREE.BoxGeometry(1, 1, 1);
  for (const [x, dz, w, d] of [[60, -61, 8, 2.8], [86, -81, 2.8, 8]]) {
    const z = KIDO.z + dz, y = Math.max(W.heightAt(x - w / 2, z - d / 2), W.heightAt(x + w / 2, z + d / 2)) + .08;
    // 西の橋も進む向きに直交する短い板を桁へ渡す。高画質以外の床は従来どおり。
    const crossX = detailed && w > d, count = Math.ceil((crossX ? w : d) / .4);
    for (let i = 0; i < count; i++) {
      const g = unit.clone(); g.scale(crossX ? w / count - .012 : w, .16, crossX ? d : d / count - .012);
      g.translate(crossX ? x - w / 2 + (i + .5) * w / count : x, y - .08,
        crossX ? z : z - d / 2 + (i + .5) * d / count); pieces.push(g);
    }
    if (detailed) {
      // 清洲の門前の木橋のように、床板を橋桁と杭で受ける。橋の幅と通れる床は保つ。
      const alongX = w > d, length = alongX ? w : d, width = alongX ? d : w;
      const box = (px, py, pz, bw, bh, bd) => {
        const g = unit.clone(); g.scale(bw, bh, bd); g.translate(px, py, pz); supports.push(g);
      };
      for (const side of [-1, 1]) {
        const cross = side * (width / 2 - .27);
        box(x + (alongX ? 0 : cross), y - .3, z + (alongX ? cross : 0),
          alongX ? length : .2, .28, alongX ? .2 : length);
      }
      for (const along of [-2, 2]) {
        const px = x + (alongX ? along : 0), pz = z + (alongX ? 0 : along);
        box(px, y - .5, pz, alongX ? .22 : width, .2, alongX ? width : .22);
        for (const side of [-1, 1]) {
          const cross = side * (width / 2 - .27);
          const sx = px + (alongX ? 0 : cross), sz = pz + (alongX ? cross : 0);
          const bottom = W.heightAt(sx, sz) - .2, top = y - .4;
          box(sx, (bottom + top) / 2, sz, .2, top - bottom, .2);
        }
      }
    }
    addDeck({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y, pad: 0, name: '寺内町の木橋' });
  }
  const bridge = new THREE.Mesh(mergeGeometries(pieces), new THREE.MeshLambertMaterial({ color: 0x726049 }));
  bridge.castShadow = bridge.receiveShadow = true; rt.scene.add(bridge);
  if (supports.length) {
    const mesh = new THREE.Mesh(mergeGeometries(supports), bridge.material);
    mesh.castShadow = mesh.receiveShadow = true; rt.scene.add(mesh);
    for (const g of supports) g.dispose();
  }
  unit.dispose(); for (const g of pieces) g.dispose();
}

// 清洲の屋敷内のように、主屋と別の小屋・井戸を庭の端へ寄せる。位置と寸法は推定。
function townServiceYards(rt) {
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const dz of [-61, -100]) {
    const x = 90, z = KIDO.z + dz, y = rt.world.heightAt(x, z);
    const lod = new THREE.LOD(); lod.position.set(x, y, z);
    for (const coarse of [false, true]) {
      const pieces = [];
      const box = (px, py, pz, w, h, d, tint, rx = 0) => {
        const g = unit.clone(); g.scale(w, h, d); g.rotateX(rx); g.translate(px, py, pz);
        const p = g.attributes.position, colors = new Float32Array(p.count * 3), c = new THREE.Color(tint);
        for (let i = 0; i < p.count; i++) {
          const k = .66 + .34 * Math.min(1, Math.max(0, (p.getY(i) - py + h / 2) / .5));
          colors[i * 3] = c.r * k; colors[i * 3 + 1] = c.g * k; colors[i * 3 + 2] = c.b * k;
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); pieces.push(g);
      };
      // 二間足らずの納屋。横道と主屋の戸口は空け、南面の戸だけ少し開ける。
      const sy = rt.world.heightAt(x, z - 9) - y;
      for (const side of [-1, 1]) {
        box(side * 1.3, sy + .85, -9, .1, 1.7, 2, 0x73624e);
        box(side * .9, sy + .85, -8, .8, 1.7, .1, 0x80705a);
        box(0, sy + 1.87, -9 + side * .68, 3.2, .09, 1.55, 0x817968, side * .32);
      }
      box(0, sy + .85, -10, 2.6, 1.7, .1, 0x73624e);
      box(0, sy + 1.58, -8, 1, .24, .1, 0x665542);
      box(0, sy + 2.12, -9, 3.3, .13, .17, 0x514637);
      if (!coarse) {
        box(.25, sy + .74, -8.06, .44, 1.46, .07, 0x5d5141);
        // 妻の三角も短い縦板で塞ぎ、屋根だけが壁から浮く隙間を残さない。
        for (let i = 0; i < 7; i++) {
          const zz = -1 + (i + .5) * 2 / 7, h = .4 * (1 - Math.abs(zz));
          for (const side of [-1, 1])
            box(side * 1.3, sy + 1.7 + h / 2, -9 + zz, .1, h, 2 / 7, 0x73624e);
        }
        for (let i = 0; i < 9; i++) for (const side of [-1, 1])
          box(-1.44 + i * .36, sy + 1.94, -9 + side * .68, .035, .04, 1.55, 0x574e40, side * .32);
      }
      // 井筒は四枚の厚板を組む。開いた口の下には暗い内側を残す。
      const wy = rt.world.heightAt(x + 1, z + 6.5) - y;
      for (const side of [-1, 1]) {
        box(1 + side * .53, wy + .36, 6.5, .12, .72, 1.18, 0x817461);
        box(1, wy + .36, 6.5 + side * .53, 1.18, .72, .12, 0x817461);
        box(1 + side * .54, wy + .75, 6.5, .2, .12, 1.35, 0x968772);
        box(1, wy + .75, 6.5 + side * .54, 1.35, .12, .2, 0x968772);
      }
      box(1, wy + .025, 6.5, .94, .04, .94, 0x39382f);
      const mesh = new THREE.Mesh(mergeGeometries(pieces), material);
      mesh.castShadow = !coarse; mesh.receiveShadow = true; mesh.userData.camBlock = true;
      lod.addLevel(mesh, coarse ? 65 : 0);
      for (const g of pieces) g.dispose();
    }
    solidRect(x, z - 9, 2.6, 2, 0);
    solidRect(x + 1, z + 6.5, 1.25, 1.25, 0);
    rt.scene.add(lod);
  }
  unit.dispose();
}

// 水堀の外岸には低い乱杭と横木。岡崎の参照のように、屋敷の板塀とは別の囲いにする。
// 町と城戸口の間の橋は八メートル開ける。細かな並びは復元上の補い。
function townMoatStakes(rt) {
  const lod = new THREE.LOD(); lod.position.set(86, 0, KIDO.z - 81);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const stake = new THREE.CylinderGeometry(.055, .075, 1, 5);
  const tip = new THREE.ConeGeometry(.055, .18, 5);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const segments = [[56, -42, 56, -57], [56, -65, 56, -120],
    [56, -120, 60, -124], [60, -124, 112, -124], [112, -124, 116, -120],
    [116, -120, 116, -42], [116, -42, 112, -38], [112, -38, 60, -38], [60, -38, 56, -42]];
  for (const coarse of [false, true]) {
    const pieces = [];
    const paint = (g, tint, ground) => {
      const color = new THREE.Color(tint), p = g.attributes.position, colors = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const k = .57 + .43 * Math.min(1, Math.max(0, (p.getY(i) - ground) / .65));
        colors[i * 3] = color.r * k; colors[i * 3 + 1] = color.g * k; colors[i * 3 + 2] = color.b * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); pieces.push(g);
    };
    for (const [ax, az, bx, bz] of segments) {
      // 岡崎の堀端のように、近くは人が抜けられない間隔の乱杭。遠くは従来の粗い輪郭。
      const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / (coarse ? 3 : .38));
      if (!coarse) solidRect((ax + bx) / 2, KIDO.z + (az + bz) / 2, len, .16,
        Math.atan2(-(bz - az), bx - ax));
      for (let i = 0; i < n; i++) {
        const t = (i + .5) / n, x = ax + (bx - ax) * t, z = KIDO.z + az + (bz - az) * t;
        const y = rt.world.heightAt(x, z), h = coarse ? 1.25 + (i % 5) * .06
          : 1.18 + ((i * 7 + Math.abs(ax)) % 11) * .035;
        const tilt = coarse ? 0 : ((i % 3) - 1) * .035;
        const g = stake.clone(); g.scale(1, h + .16, 1);
        g.rotateZ(tilt);
        g.translate(x - lod.position.x, y + (h - .16) / 2, z - lod.position.z);
        paint(g, i % 3 ? 0x7d705a : 0x94826a, y);
        if (!coarse) {
          const g = tip.clone(); g.translate(0, (h + .16) / 2 + .09, 0); g.rotateZ(tilt);
          g.translate(x - lod.position.x, y + (h - .16) / 2, z - lod.position.z);
          paint(g, 0x9a886b, y);
        }
      }
      // 横木も斜面の地面に合わせて短く分ける。土橋の開口をまたがない。
      const rails = Math.ceil(len / 3);
      for (let i = 0; i < rails; i++) {
        const t0 = i / rails, t1 = (i + 1) / rails;
        const x0 = ax + (bx - ax) * t0, z0 = KIDO.z + az + (bz - az) * t0;
        const x1 = ax + (bx - ax) * t1, z1 = KIDO.z + az + (bz - az) * t1;
        const y0 = rt.world.heightAt(x0, z0), y1 = rt.world.heightAt(x1, z1);
        const span = len / rails;
        for (const h of [.38, .92]) {
          const g = unit.clone(); g.scale(Math.hypot(span, y1 - y0), .075, .08);
          g.rotateZ(Math.atan2(y1 - y0, span)); g.rotateY(Math.atan2(-(bz - az), bx - ax));
          g.translate((x0 + x1) / 2 - lod.position.x, (y0 + y1) / 2 + h, (z0 + z1) / 2 - lod.position.z);
          paint(g, 0x645842, (y0 + y1) / 2);
        }
      }
    }
    const mesh = new THREE.Mesh(mergeGeometries(pieces), material);
    mesh.castShadow = !coarse; mesh.receiveShadow = true;
    lod.addLevel(mesh, coarse ? 80 : 0);
    for (const g of pieces) g.dispose();
  }
  unit.dispose(); stake.dispose(); tip.dispose(); rt.scene.add(lod);
}

// 写真の作事小屋を参考にした材木置場。二街区の空いた庭に置き、橋・横道・戦列を空ける。
// 寸法と配置は推定。高画質だけで呼び、近くの板と丸太は結合、遠くは棚と屋根の輪郭に戻す。
function tennojiWorkYards(rt) {
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const log = new THREE.CylinderGeometry(.1, .12, 1, 5); log.rotateZ(Math.PI / 2);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const dz of [-54, -93]) {
    const x = 74, z = KIDO.z + dz, y = rt.world.heightAt(x, z), lod = new THREE.LOD();
    lod.position.set(x, y, z);
    for (const coarse of [false, true]) {
      const pieces = [];
      const paint = (g, tint) => {
        const c = new THREE.Color(tint), p = g.attributes.position, colors = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) {
          const k = .72 + .28 * Math.min(1, Math.max(0, p.getY(i) / .65));
          colors[i * 3] = c.r * k; colors[i * 3 + 1] = c.g * k; colors[i * 3 + 2] = c.b * k;
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); pieces.push(g);
      };
      const box = (px, py, pz, w, h, d, tint, rz = 0) => {
        const g = unit.clone(); g.scale(w, h, d); if (rz) g.rotateZ(rz);
        g.translate(px, py, pz); paint(g, tint);
      };
      // 壁のない低い切妻。柱は庭の高さへ個別に下ろし、軒桁と棟木で支える。
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const bottom = rt.world.heightAt(x + sx * 2, z + sz * 1.3) - y - .12;
        box(sx * 2, (2.25 + bottom) / 2, sz * 1.3, .15, 2.25 - bottom, .15, 0x665441);
      }
      for (const side of [-1, 1]) {
        box(side * 2, 2.22, 0, .18, .16, 3.2, 0x514333);
        box(0, 2.28, side * 1.3, 4.4, .17, .16, 0x514333);
        const n = coarse ? 1 : 9;
        for (let i = 0; i < n; i++) box(side * 1.16, 2.6, -1.65 + (i + .5) * 3.3 / n,
          2.5, .065, 3.3 / n - (coarse ? 0 : .012),
          coarse ? 0x887760 : [0x887760, 0x978267, 0x776b59][i % 3], -side * .3);
        if (!coarse) box(side * 1.15, 2.7, 0, .09, .1, 3.4, 0x594a37);
      }
      box(0, 2.96, 0, .2, .16, 3.5, 0x594a37);
      // 地面に直置きせず、枕木の上へ積む。切り口を淡くし、丸太の側面と分ける。
      for (const sx of [-1, 1]) box(sx * 1.15, .13, -.25, .18, .2, 1.55, 0x514333);
      if (coarse) box(0, .55, -.25, 3.3, .7, 1.4, 0x927957);
      else {
        for (let row = 0; row < 3; row++) for (let i = 0; i < 5 - row; i++) {
          const px = (i % 2) * .05, py = .32 + row * .19, pz = -.8 + i * .24 + row * .12;
          const g = log.clone(); g.scale(3.3 - row * .15, 1, 1); g.translate(px, py, pz); paint(g, 0x8d7556);
          for (const side of [-1, 1]) box(px + side * (3.3 - row * .15) / 2, py, pz,
            .012, .13, .13, 0xb29b75);
        }
        // 奥の棚には替え板。小屋の口と左右は囲わない。
        for (const side of [-1, 1]) box(side * 1.5, .58, -1.12, .12, 1.12, .12, 0x665441);
        for (let i = 0; i < 4; i++) box((i % 2) * .08, 1.02 + i * .075, -1.12,
          3.5, .055, .4, i % 2 ? 0x9b886b : 0x7e6c53);
      }
      const mesh = new THREE.Mesh(mergeGeometries(pieces), material);
      mesh.castShadow = !coarse; mesh.receiveShadow = true; lod.addLevel(mesh, coarse ? 65 : 0);
      for (const g of pieces) g.dispose();
    }
    rt.scene.add(lod);
    solidRect(x, z - .25, 3.5, 1.55, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) solidCircle(x + sx * 2, z + sz * 1.3, .15);
  }
  unit.dispose(); log.dispose();
}

// 寺内町の屋敷境は狭間のない古板。細い縦板と内側の横桟をまとめ、遠くは一枚に戻す。
function townBoardEnclosures(rt, segments) {
  const lod = new THREE.LOD(), unit = new THREE.BoxGeometry(1, 1, 1);
  // 遠近の切り替えは町の中心から測る。城戸口は原点から二・五キロ離れている。
  lod.position.set(86, 0, KIDO.z - 81);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const coarse of [false, true]) {
    const pieces = [];
    for (const [ax, az, bx, bz] of segments) {
      const len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len;
      const rot = Math.atan2(-tz, tx), n = Math.ceil(len / (coarse ? 2 : .32));
      const box = (t, y, offset, w, h, d, tint) => {
        const x = ax + tx * t - tz * offset, z = az + tz * t + tx * offset;
        const g = unit.clone(); g.scale(w, h, d); g.rotateY(rot);
        const ground = rt.world.heightAt(x, z);
        g.translate(x - lod.position.x, ground + y, z - lod.position.z);
        const p = g.attributes.position, colors = new Float32Array(p.count * 3), color = new THREE.Color(tint);
        for (let j = 0; j < p.count; j++) {
          const mud = .68 + .32 * Math.min(1, Math.max(0, (p.getY(j) - ground) / .55));
          colors[j * 3] = color.r * mud; colors[j * 3 + 1] = color.g * mud; colors[j * 3 + 2] = color.b * mud;
        }
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); pieces.push(g);
      };
      for (let i = 0; i < n; i++) {
        const h = coarse ? 1.65 : 1.6 + (i % 4) * .035;
        box((i + .5) * len / n, h / 2, 0, len / n - (coarse ? 0 : .012), h, .07,
          coarse ? 0x786b59 : [0x786b59, 0x80725f, 0x716454, 0x8b7960][i % 4]);
      }
      if (!coarse) {
        for (const y of [.42, 1.22]) box(len / 2, y, .09, len, .1, .12, 0x554938);
        const posts = Math.ceil(len / 2);
        for (let i = 0; i <= posts; i++) box(i * len / posts, .88, .1, .13, 1.85, .15, 0x62523e);
      }
    }
    const mesh = new THREE.Mesh(mergeGeometries(pieces), material);
    mesh.castShadow = !coarse; mesh.receiveShadow = true; mesh.userData.camBlock = true;
    lod.addLevel(mesh, coarse ? 75 : 0);
    for (const g of pieces) g.dispose();
  }
  unit.dispose(); rt.scene.add(lod);
}

// この戦の門も視点の当たりにする。門板を網目に抜かず、共通の視点の寄せで避ける。
function fortGate(world, x, z, w, watch = false) {
  const gate = kabukimon(world, x, z, w, 0, { roof: !watch });
  // 面の検査を待つ間も、梁・開いた扉の中へ視点を入れない。
  // 通路全体を箱で塞がず、上階・柱・冠木・左右の扉を別々に扱う。支度時だけ作る。
  const volumes = [], baseY = world.heightAt(x, z);
  const volume = (px, pz, angle, min, max) => {
    const inverse = new THREE.Matrix4().makeRotationY(angle);
    inverse.setPosition(px, baseY, pz); inverse.invert();
    volumes.push({ inverse, box: new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)) });
  };
  if (watch) volume(x, z, 0, [-w / 2 - 1.1, 3.2, -2.4], [w / 2 + 1.1, 6.1, 1.4]);
  // 主郭の低い門にも屋根がある。面の検査の順番待ちでも、軒や棟を突き抜けない。
  // 冠木門の反りに合わせて分け、屋根の下の空間は視点が通れるままにする。
  else {
    const half = w / 2 + 1.4, depth = 1.45;
    const roofY = t => 3.62 + .88 * (.5 * t + .5 * t * t);
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
      const t0 = i / 6, t1 = (i + 1) / 6;
      const z0 = side * depth * (1 - t0), z1 = side * depth * (1 - t1);
      volume(x, z, 0, [-half, roofY(t0) - .16, Math.min(z0, z1) - .12],
        [half, roofY(t1) + .12, Math.max(z0, z1) + .12]);
    }
    volume(x, z, 0, [-half, 4.45, -.25], [half, 4.83, .25]);
  }
  volume(x, z, 0, [-w / 2 - .95, 3.05, -.25], [w / 2 + .95, 3.52, .25]);
  for (const side of [-1, 1]) {
    const px = x + side * (w / 2 + .17);
    for (const back of [false, true]) {
      const pz = z - (back ? 1.6 : 0), radius = back ? .17 : .23;
      const foot = world.heightAt(px, pz) - baseY;
      volume(px, pz, 0, [-radius, foot - .12, -radius], [radius, back ? 2.6 : 3.45, radius]);
    }
  }
  for (const side of [-1, 1]) volume(x + side * (w / 2 - .02), z - .1,
    side < 0 ? 1.15 : Math.PI - 1.15, [-.12, -.05, -.28], [w / 2 + .07, 3.15, .22]);
  const previousBlock = world.cameraBlockFraction;
  const ray = new THREE.Ray(), end = new THREE.Vector3(), contact = new THREE.Vector3();
  world.cameraBlockFraction = function (from, to) {
    let nearest = previousBlock?.call(this, from, to) ?? null;
    for (const v of volumes) {
      ray.origin.copy(from).applyMatrix4(v.inverse);
      end.copy(to).applyMatrix4(v.inverse);
      ray.direction.copy(end).sub(ray.origin);
      const length = ray.direction.length();
      if (length < .0001) continue;
      ray.direction.multiplyScalar(1 / length);
      const hit = v.box.containsPoint(ray.origin) ? 0
        : ray.intersectBox(v.box, contact) ? ray.origin.distanceTo(contact) / length : null;
      if (hit !== null && hit <= 1 && (nearest === null || hit < nearest)) nearest = hit;
    }
    return nearest;
  };
  if (watch) {
    // 板囲いの小さな渡櫓。柱と開いた扉は既存の門を使い、門下の通路幅を保つ。
    const lod = new THREE.LOD(), unit = new THREE.BoxGeometry(1, 1, 1);
    const detailed = true;
    const mat = new THREE.MeshLambertMaterial({ color: detailed ? 0xffffff : 0x75624d,
      vertexColors: detailed, side: detailed ? THREE.DoubleSide : THREE.FrontSide });
    for (const coarse of [false, true]) {
      const pieces = [];
      const paint = (g, tint) => {
        if (detailed) {
          const color = new THREE.Color(tint), colors = new Float32Array(g.attributes.position.count * 3);
          for (let i = 0; i < colors.length; i += 3) {
            colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b;
          }
          g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        pieces.push(g);
      };
      const box = (px, py, pz, bw, bh, bd, rx = 0, tint = 0x75624d) => {
        const g = unit.clone(); g.scale(bw, bh, bd); g.rotateX(rx); g.translate(px, py, pz); paint(g, tint);
      };
      box(0, 3.55, -.5, w + .8, .22, 2.7);
      if (detailed && !coarse) {
        // 写真の櫓門は太い桁と腕木で上階を受ける。門下の高さと柱間はそのまま。
        for (const side of [-1, 1]) {
          box(0, 3.36, -.5 + side * 1.05, w + 1.1, .24, .22, 0, 0x514333);
          box(side * (w / 2 + .17), 3.45, -.5, .22, .2, 3.05, 0, 0x594b3b);
        }
      }
      if (detailed) {
        // 上階だけの浮いた箱にせず、右脇の踊り場へ架けた梯子でつなぐ。
        // 推定の上り口。門柱の外へ寄せ、門下の通路と既存の床は変えない。
        const lx = w / 2 + .85, bottom = world.heightAt(x + lx, z - 3.5) - world.heightAt(x, z);
        const rise = 3.66 - bottom, run = 3, tilt = Math.atan2(run, rise);
        box(lx - .2, 3.55, -.5, 1.3, .22, 1.05, 0, 0x655642);
        for (const zz of [-.9, -.1]) {
          const foot = world.heightAt(x + lx + .4, z + zz) - world.heightAt(x, z) - .12;
          box(lx + .4, (foot + 3.44) / 2, zz, .14, 3.44 - foot, .14, 0, 0x62523f);
        }
        for (const side of [-1, 1])
          box(lx + side * .36, (bottom + 3.66) / 2, -2, .09, Math.hypot(rise, run) + .25, .1, tilt, 0x73644f);
        const steps = coarse ? 5 : Math.ceil(Math.hypot(rise, run) / .38);
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          box(lx, bottom + rise * t, -3.5 + run * t, .8, .07, .12, 0, 0x96836a);
        }
        // 踊り場の外側だけ手摺。梯子の先と上階への戸口は塞がない。
        for (const zz of [-.95, -.05]) box(lx + .4, 4.04, zz, .09, .9, .09, 0, 0x62523f);
        box(lx + .4, 4.48, -.5, .12, .1, 1.05, 0, 0x62523f);
      }
      for (const side of [-1, 1]) {
        if (detailed && side > 0) {
          for (const sd of [-1, 1]) box(side * (w / 2 + .17), 4.4, -.5 + sd * .84, .24, 2.1, .72);
          box(side * (w / 2 + .17), 5.32, -.5, .24, .26, .96);
        } else box(side * (w / 2 + .17), 4.4, -.5, .24, 2.1, 2.4);
        const count = Math.max(3, Math.round(w / 1.4)), step = (w + .5) / count;
        for (let i = 0; i < count; i++) {
          const px = -(w + .5) / 2 + (i + .5) * step, pz = -.5 + side * 1.2;
          if (coarse) box(px, 4.5, pz, step, 1.7, .1);
          else {
            box(px, 4.05, pz, step, .8, .1); box(px, 5.05, pz, step, .65, .1);
            for (const sd of [-1, 1]) box(px + sd * (step + .2) / 4, 4.58, pz, (step - .2) / 2, .25, .1);
          }
        }
        if (detailed) {
          if (!coarse) {
            // 一枚の壁に見えた面へ縦板の目地と胴縁。狭間の開口には重ねない。
            for (let px = -(w + .5) / 2 + .27; px < (w + .5) / 2; px += .27) {
              for (const [py, ph] of [[4.05, .8], [5.05, .65]]) {
                const seam = new THREE.PlaneGeometry(.012, ph);
                seam.translate(px, py, -.5 + side * 1.257);
                const plain = seam.toNonIndexed(); seam.dispose(); paint(plain, 0x4f4639);
              }
            }
            for (const py of [3.72, 4.38, 4.76, 5.34])
              box(0, py, -.5 + side * 1.28, w + .6, .1, .12, 0, 0x594b3b);
          }
          // 渡櫓の妻を板で塞ぎ、柱の上に屋根だけが浮く隙間をなくす。
          const shape = new THREE.Shape([new THREE.Vector2(-1.3, 5.4),
            new THREE.Vector2(1.3, 5.4), new THREE.Vector2(0, 5.95)]);
          const g = new THREE.ShapeGeometry(shape);
          g.rotateY(side * Math.PI / 2); g.translate(side * (w / 2 + .3), 0, -.5);
          paint(g.toNonIndexed(), 0x6b5842); g.dispose();
          if (!coarse) {
            box(side * (w / 2 + .32), 5.59, -.5, .13, .6, .13);
            box(side * (w / 2 + .32), 5.4, -.5, .13, .12, 2.65);
          }
          // 棟から軒へ流す古板。近くは継ぎ目と色むら、遠くは同じ灰茶の面にまとめる。
          const n = coarse ? 1 : Math.ceil((w + 1.8) / .36), step = (w + 1.8) / n;
          for (let i = 0; i < n; i++) box(-(w + 1.8) / 2 + (i + .5) * step,
            5.6 + (coarse ? 0 : i % 3 * .007), -.5 + side * .83,
            step - (coarse ? 0 : .008), .12, 1.85, side * .4,
            coarse ? 0x797264 : [0x797264, 0x827968, 0x6e685d][i % 3]);
        } else box(0, 5.6, -.5 + side * .83, w + 1.8, .12, 1.85, side * .4);
        if (!coarse) for (let i = 0; i <= 8; i++)
          box(-(w + 1.8) / 2 + i * (w + 1.8) / 8, 5.68, -.5 + side * .83, .07, .08, 1.9, side * .4);
      }
      box(0, 5.98, -.5, w + 2, .18, .25);
      // 妻壁と箱の頂点形式をそろえ、材質を増やさず一つの面にまとめる。
      const mergedPieces = detailed ? pieces.map(g => g.index ? g.toNonIndexed() : g) : pieces;
      const mesh = new THREE.Mesh(mergeGeometries(mergedPieces), mat);
      mesh.castShadow = !coarse; mesh.receiveShadow = true;
      lod.addLevel(mesh, coarse ? 85 : 0);
      for (const g of pieces) g.dispose();
      if (detailed) for (let i = 0; i < pieces.length; i++) if (mergedPieces[i] !== pieces[i]) mergedPieces[i].dispose();
    }
    unit.dispose(); gate.add(lod);
  }
  const materials = new Map();
  const solid = (base) => {
    if (!materials.has(base)) {
      const mat = base.clone(); mat.userData.camNearSolid = true;
      materials.set(base, mat);
    }
    return materials.get(base);
  };
  gate.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.userData.camBlock = true;
    obj.material = Array.isArray(obj.material) ? obj.material.map(solid) : solid(obj.material);
  });
  return gate;
}

function inPoly(P, x, z) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// 門外の土橋や奥の主郭は、南門の占拠に数えない。
function insideGate(pos) {
  return Math.abs(pos.x - T_GATE.x) <= 12 && pos.z <= T_GATE.z - 2 &&
    pos.z >= T_GATE.z - 16 && inPoly(SOTO_POLY, pos.x, pos.z);
}

// 門は二列、開けた追撃路は四列で通り、到着後に槍をそろえる。兵を移し替えない。
function march(g, points, order = 'hold', facing = Math.PI, columns = 2) {
  if (gone(g)) return;
  // 道中と待機は決めた下知を守り、攻める地点に着いてから隊ごと前へ出る。
  if (g.team === 0) g.ai = false;
  // 道中は守りの持ち場から離れ、曲がり角に沿って後列も門を通す。
  g.guard = false; g.guardOn = false; g.stay = false; g.noRing = true;
  g.roadColumn = true; g.spacing = columns > 2 ? 1.1 : Math.min(g.spacing || 0.8, 0.8);
  g.formation = 'column'; g.colW = columns;
  g.order = 'path'; g.path = points; g.pathIdx = 0; g.dest = null;
  g.onArrive = (q) => { if (order === 'attack') { q.guard = false; q.stay = false; q.seekRange = Math.max(q.seekRange || 0, 45); if (q.team === 0) q.ai = true; } q.guard = order === 'hold'; q.order = order; q.formation = 'yari'; q.yariRanks = 3; q.facing = facing; };
}

// 列の後ろの一人が遠い敵を追ったり柵の角に詰まったりすると、隊の要が待ち続けて行軍が止まる。
// 五秒止まった隊だけ、要を道の次の点へゆっくり進める。兵は持ち場を追って歩く（瞬間移動はしない）。
function nudgeMarch(groups, span) {
  for (const g of groups) {
    if (gone(g) || g.order !== 'path' || !g.path) { if (g) g._wd = null; continue; }
    const a = g.anchor;
    if (!g._wd || g._wd.path !== g.path) g._wd = { x: a.x, z: a.z, t: 0, path: g.path };
    const W = g._wd;
    if (Math.hypot(a.x - W.x, a.z - W.z) > 1) { W.x = a.x; W.z = a.z; W.t = 0; continue; }
    W.t += span;
    if (W.t < 5) continue;
    const pt = g.path[g.pathIdx];
    if (!pt) {
      if (g.onArrive) { const f = g.onArrive; g.onArrive = null; f(g); }
      W.t = 0; continue;
    }
    const dx = pt[0] - a.x, dz = pt[1] - a.z, d = Math.hypot(dx, dz);
    if (d < 1.5) { g.pathIdx++; continue; }
    const st = Math.min(d, (g.speed || 2) * span * 0.8);
    a.x += dx / d * st; a.z += dz / d * st;
    W.x = a.x; W.z = a.z;
  }
}

// 門内へ歩いて寄り、後列も近い敵を迎える。大将の円陣や三段の待機に戻さない。
function defendGate(g, x, z) {
  g.guard = false; g.guardOn = false; g.noRing = true;
  // 道中も到着後も門の近くへ絞り、遠い寄せ手を追って持ち場を空けない。
  g.aggro = 6;
  g.spacing = 0.6; g.width = 4;
  march(g, [[x, z]], 'hold', 0);
  g.onArrive = (q) => {
    q.guard = false; q.guardOn = false; q.ai = false;
    q.order = 'hold'; q.formation = q.isGun ? 'line' : 'yari'; q.yariRanks = 3; q.facing = 0;
    q.spacing = q.isGun ? 1.1 : 1;
    q.aggro = 6;
    for (const u of q.units) if (u.alive) u.aiT = 0;
  };
}

// 苦しい戦：生き延びた事そのものを手柄にする（残った体力と、生き残った組の者の割合で）
function survival(rt, label) {
  const u = rt.player.u, sq = rt.squad || [];
  const hpK = Math.max(0, u.hp / u.maxHp), sqK = sq.length ? sq.filter((x) => x.alive).length / sq.length : 1;
  const pts = Math.round(10 + hpK * 10 + sqK * 15);
  rt.award((t) => t.side.push(`${label}（組 ${sq.filter((x) => x.alive).length}/${sq.length}）`), `${label}・生き延びた手柄 +${pts}`);
  rt.award((t) => { t.special = { label, pts: Math.max(t.special ? t.special.pts : 0, pts) }; }, label);
}

// 準備時に全段の兵を置き、計244人（自分・最大30人の組を含む。別枠の供は最大5人）。
// 櫓の見張りと遠景の実兵化は足さず、大軍・旗・煙は共通の仕組みで描く。
// 信長公記巻九（三）（四）の三段の救援。総勢三千対一万五千、各備の割り振りは補完。
// 信長は先手に交じるため、三段目に本人を重ねて置かない。本願寺の個々の囲みの将は不明。
const JIN = [
  rosterPlan('三段の救援', 0, { x: 126, z: 36 }, -Math.PI / 2, [
    ['first', '一段目', '佐久間信盛・松永久秀・細川藤孝・若江衆', 1200, 72, 26, 'oda', 'oda', 160, { w: 14, d: 8, bind: 'saku' }],
    ['second', '二段目', '滝川一益・蜂屋頼隆・羽柴秀吉・丹羽長秀・稲葉良通・氏家直通・伊賀伊賀守', 1200, 98, 32, 'takigawa', 'takigawa', 160, { w: 14, d: 8, bind: 'taki' }],
    ['third', '三段目の馬廻', '織田信長の馬廻', 600, 126, 36, 'eiraku', 'oda', 80, { bind: 'honjin.guard' }],
    ['nobunaga', '先手の足軽に交じる大将', '織田信長', 0, 80, 20, 'oda', 'oda', 0, { bind: 'nobu' }],
    ['fort', '天王寺付城の守備（人数不明）', '明智光秀・佐久間信栄・猪子兵介・大津伝十郎・江州衆', null, FORT.x, FORT.z, 'akechi', 'akechi', 0, { bind: 'ake' }],
  ], '信長公記巻九（三）（四）。砦の人数は不明、救援の三千とは別'),
  rosterPlan('砦を囲む備え', 1, SHIMO, 0, [
    ['rairen', '本陣の控え', '下間頼廉', 2000, SHIMO.x, SHIMO.z, 'sagarifuji', 'sagarifuji', 260, { bind: 'ehon.guard' }],
    ['west', '砦の西の囲み', '下間頼廉の配下（名は不明）', 2500, -60, -70, 'namu', 'sagarifuji', 260, { w: 14, d: 26, facing: Math.PI / 2 }],
    ['east', '砦の東の囲み', '下間頼廉の配下（名は不明）', 2500, 60, -70, 'sagarifuji', 'sagarifuji', 260, { w: 14, d: 26, facing: -Math.PI / 2 }],
    ['north', '砦の北の囲み', '下間頼廉の配下（名は不明）', 2500, 0, -120, 'namu', 'sagarifuji', 320, { w: 26, d: 12 }],
    ['saika', '西の鉄砲の備え', '雑賀の将（名は不明）', 2000, -84, -22, 'namu', 'sagarifuji', 200, { w: 16, d: 10, kind: 'gun', facing: 0.9 }],
    ['rear', '城戸口の前の後備え', '下間頼廉の配下（名は不明）', 2000, -6, KIDO.z + 10, 'namu', 'sagarifuji', 460, { w: 32, d: 14 }],
    ['flank', '東の脇備え', '下間頼廉の配下（名は不明）', 1500, 84, -40, 'namu', 'sagarifuji', 220, { w: 16, d: 18, facing: -1.1 }],
  ], '信長公記巻九、野戦・城の参照表の天王寺。囲みの細かな配置は補完'),
];
const tennoji = {
  introTaskFirst: true, // 横持ちでは守る場所と勝つ条件を、人物紹介より先に読む。
  introPeopleFolded: true, // 人物の名前を半行で切らず、読みたい時に説明を開く。
  keepOpeningTaskLabel: true, // 最初も南の門内を示し、移動の手ほどきで下知を消さない。
  guardGuideAllowed: () => false, // 門の防衛・合流・出撃を、近くの一人の護衛に置き換えない。
  compactFieldGuides: true, // 太い回避の輪で足元と敵の構えを隠さない。
  compactPlayerSign: true, // 自分の足元と向きは残し、門口の兵を太い輪で覆わない。
  playerSignMinScale: .4, playerSignScale: .4, // 下限も指定し、共通の大きな輪へ戻さない。
  playerFootSignOnly: true, // 振り向く手ほどきでも、本人の胴を白い枠で隠さない。
  openingFootSignOnly: true, // 開始直後の移動の手ほどきも足元だけにし、白い筒で鎧を囲まない。
  noUnitContrast: true, // 肩越しで本人から離れる白い人型は描かず、足元と頭上の印で示す。
  compactHoldGuide: true, // 持ち場は実際の門内の小さな印で示す。
  compactDestinationArea: true, // 近すぎる待機範囲の輪で、兵の足元や画面下を囲まない。
  smallTaskAreas: true, compactFloorGuides: true, // 近い輪は細くし、画面外へ切れる半円は描かない。
  compactCombatGuides: true, // 門の乱戦で敵の隅印を重ねず、頭上の小さい印で示す。
  teamSignsOnly: true, // 白い人型で鎧や門の向こうの兵を囲まず、敵味方の頭上の印を残す。
  nearbyEnemySignLimit: 3, // 隊の詳しい表示を閉じても、門の乱戦で近い敵を見分ける。
  compactDestinationSign: true, // 出撃の矢印で、前を行く味方の頭や幟を隠さない。
  subtleTargetFrames: true, // 目当ての隊旗は細い隅で示し、旗持ちの姿を残す。
  compactRetreatSign: true,
  compactRetreatArea: true,
  keepRetreatReason: true, // 「ここへ」だけに替えず、退く理由を同じ任務札に残す。
  retreatForLimbWounds: false, // 止血後に残る足・腕の傷だけで、守備や追撃の下知を消さない。
  keepWoundTaskLabel: true, // 退く時も門や護衛への道を残す。出血・深手の退避案内は保つ。
  retreatGuideLabel(rt, reached) {
    if (rt.player.u.wounds?.bleed > .0001)
      return reached ? rt.player.treatmentLeft > 0 ? '止まって血を止めよ' : '血が出ている。味方を離れるな'
        : '血が出ている。味方の後ろへ';
    return reached ? '味方の後ろで構えよ' : rt.player.u.mobbed ? '囲まれた。味方へ下がれ' : '味方の列へ下がれ';
  },
  clearTravelGuide: true,
  coverGuidePlace: true, // 門柱などの物陰を、隊旗への集合と取り違えさせない。
  pauseTurnPractice: false, // 追撃中も振り向く操作待ちで兵と任務の時計を止めない。
  dodgeTurnDuration: 4, // 見回す手ほどきは短く示し、退く場所の案内へ戻す。
  shortDodgeArrow: true, // 回避の大矢印と太い道筋で、目前の兵を覆わない。
  retreatArrowLength: 64,
  dodgeAvoidNotices: true,
  keepTaskWithDodge: true, // よける操作の間も、出撃・追撃の目的と止まる場所を読めるようにする。
  dodgeMoveLabel(rt, side, rain) {
    return `${rain ? '矢をよけよ' : '敵から離れよ'}。指を${side}へ`;
  },
  dodgeGuideLabel: (rt, arrived, rain) => arrived ? '敵を向いて構えよ' : rain ? '矢の落ちる所を離れよ' : '敵を離して構え直せ',
  introText: (rt) => rt.G.lord
    ? '先手の味方と進み、囲まれた砦を救おう。'
    : '南の門を出ず、敵を向いて「構え」を押し、信長の救援を待とう。敵に門内を二十秒押さえられると負け。深い傷は砦の奥で手当てしよう。',
  phaseBanners: true,
  noticeLimit: 3,
  taskDetails: true, // 携帯でも門の持ち場・占拠の猶予を任務の下に出す。
  treatmentTaskGuidance: true,
  separateTreatmentRetreat: true, // 止血の場所を、囲みから下がるだけの印で上書きしない。
  treatmentGuideNeeded(rt) {
    const p = rt.player, u = p.u;
    // この戦の護衛への退避とそろえ、止血後に命が六割未満でも追撃へ戻れるようにする。
    return p.treatmentLeft > 0 && (u.wounds?.bleed > .0001 || u.hp < u.maxHp * .5);
  },
  treatmentApproachLabel: '手当ての印へ下がれ',
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.mounted) return '馬を降りて手当て';
    if (p.treating) return '手当てを押し続けよ';
    if (p.treatmentReady) return '「手当て」を三秒長押し';
    if (!cue?.valid) return '味方の後ろへ下がれ';
    // 布の待ち時間より先に到着を調べ、遠い印へ歩く人をその場で止めない。
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius) return '手当ての印へ下がれ';
    if (p.treatmentNext > rt.t) return `次の手当てまであと${Math.ceil(p.treatmentNext - rt.t)}秒`;
    return '足を止め、手当ての支度を待て';
  },
  taskDetail(rt, title, progress) {
    const cue = rt.hud.retreatGuide;
    if (cue?.active && cue.valid && !cue.treatment)
      return cue.enemy?.alive ? '敵を向き、構えて下がれ' : '味方の後ろで構えよ';
    if (!cue?.active || !cue.valid || !cue.treatment) {
      // 救援を待つ札でも、門を奪われる猶予を隠さない。退避・手当ては上の案内を優先する。
      if (rt.flags.pressure > 0 && rt.flags.step < 3 && !rt.over && !rt.flags.ending)
        return `！${gateDirection(rt, GATE_REAR)} 門内の味方へ。敵を押し返せ`;
      // 進む道は見出しに残し、列が崩れる危険は補足から消さない。
      if (rt.flags.reliefRisk && !rt.over && !rt.flags.ending)
        return '！信長の列が危うい。味方を離れるな';
      // 出撃の見出しと同じ道順を重ねず、次の曲がり先を補う。危険の知らせはそのまま。
      if ((rt.flags.step === 3 || rt.flags.step === 4 && !rt.flags.kidoCut) &&
          !rt.flags.shelterShown && !rt.over && !rt.flags.ending && !progress.startsWith('！')) {
        const way = sortieWaypoint(rt);
        if (way === SORTIE_EXIT) return '土橋の先で東へ回れ。味方と進め';
        if (way === SORTIE_TURN) return '堀を越えず、砦を左手に北へ進め';
        if (way === SORTIE_NORTH) return '北の印へ。着いたら味方と合流せよ';
        if (rt.flags.step === 4) return '北の印へ。城戸口の手前で止まれ';
      }
      return progress;
    }
    // 城戸口の進軍札を止血の見出しへ替える時は、補足も同じ行動にそろえる。
    const p = rt.player;
    if (p.treating || p.treatmentReady) return '「手当て」を三秒長押し。血を止めよ';
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius)
      return '印へ下がれ。着いたら止まり、血を止めよ';
    return p.treatmentNext > rt.t ? '次の布を待て。味方の後ろで構えよ' : '敵を離し、動かず手当ての支度を待て';
  },
  keepTaskLabel: true, // 近い敵の印で、門を守る下知を討取りへ替えない。
  hideGuideSteps: true, // 門内の持ち場を遠い旗への歩数で迷わせず、退避の見出しも短く保つ。
  keepDestinationTask: true, // 出撃を「もんへすすめ」に替えず、門を出た後の曲がり先も残す。
  taskLabel(rt, text) {
    if (rt.flags.pressure > 0 && rt.flags.step < 3 &&
        !rt.flags.shelterShown && !rt.over && !rt.flags.ending &&
        rt.objectives.some((o) => o.id === 'main' && !o.state && o.text === text))
      // 補足が構え・退避の案内に替わっても、陥落までの猶予は見出しに残す。
      return `門を奪われるまで あと${Math.max(0, Math.ceil(GATE_HOLD_SECONDS - rt.flags.pressure))}秒`;
    // 入城を塞ぐ敵がいる間は、出迎えるだけの下知に見せない。
    if (rt.flags.step === 1 && !rt.G.lord && !rt.flags.shelterShown && !rt.over && !rt.flags.ending &&
        rt.objectives.some((o) => o.id === 'main' && !o.state && o.text === text))
      return rt.flags.entryThreat > 0 ? '門内で敵を押し返せ' : '門内を守り、救援を待て';
    // 判定用の任務文は保ち、横持ちの見出しだけ一つの行動へ絞る。
    if (text === '南の門内の脇で、信長の入城を迎えよ' || text === '南の門内で、信長の入城を迎えよ') {
      const at = rt.flags.gz;
      // 門を見失っても、集合の判定と同じ場所へ戻す。着いた人には移動を促さない。
      if (at && (rt.distTo(at) >= 10 || !inPoly(SOTO_POLY, rt.player.u.pos.x, rt.player.u.pos.z)))
        return `${gateDirection(rt, at)} 門内の脇の印へ戻れ`;
      return '門内の脇で信長を迎えよ';
    }
    if (text === '南の門内で組をそろえ、下知を待て') return '門内の脇で出撃を待て';
    if (text === '城戸口の手前で、味方と八秒守れ') {
      // 到着前に待機を命じず、「八秒」を改行で切らない。秒数は到着後の補足へ出す。
      const at = rt.flags.kz;
      return at && rt.distTo(at) >= 10 ? '木戸の手前の印へ進め' : '木戸の手前で味方と守れ';
    }
    const chasing = /^(?:組を率い、退く敵を城戸口まで追え|退く敵を大坂の城戸口まで追え)$/.test(text);
    if (/^(?:組を率い、砦の東を回って北の敵を崩せ|南門を出て、砦の東を北へ進め)$/.test(text) || chasing && !rt.flags.kidoCut) {
      const way = sortieWaypoint(rt);
      // 方角をまだ覚えていない人にも、今の視点から曲がる向きを示す。
      const label = way === SORTIE_EXIT ? '南門を出て土橋を渡れ' : way === SORTIE_NORTH ? '堀の外を北へ進め' : '東へ回り、北へ進め';
      return way ? `${gateDirection(rt, way)} ${label}` : chasing ? '城戸口まで敵を追え' : '北の敵を味方と崩せ';
    }
    if (chasing) return '城戸口まで敵を追え';
    return text;
  },
  keepCombatTask: true, // 構えの操作中も、持ち場と救援の進み具合を残す。
  keepTaskWithGuard: true, // 構えの釦を押す間も、城戸口で止まる下知を残す。
  keepCombatTaskHeading: true, // 「つく」の手ほどきだけにならず、出撃の道順を残す。
  keepTaskPanel: true, keepApproachTaskPanel: true, // 接敵しても任務札を敵の頭上へ移さず、同じ欄で読む。
  keepCombatTaskDetail: true, // 斬り合いの操作を教える間も、門の占拠の猶予を消さない。
  meleeGuide(rt, enemy) {
    if (!enemy?.alive || rt.flags.ending) return false;
    const p = rt.player, u = p.u;
    // 遠い敵への「近づけ」で守備・東回り・城戸口への下知を消さない。
    return Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z)
      <= p.meleeReach(p.weapon === 'sword' ? 'slash' : 'thrust') ||
      enemy.atk?.target === u || enemy.swing?.target === u && !enemy.swing.done;
  },
  contextualCoach: true, // 敵が離れたら突きの手ほどきを休め、門内で守る下知を読ませる。
  immediateTaskChanges: true, // 退避先へ着いたら、十秒待たずに手当ての操作を出す。
  immediatePhaseTasks: true,
  // 門と奥の護衛へ通じる道を優先し、小屋の脇の空き地へ逃がさない。
  routeGuidePriority: (rt) => !rt.G.lord && !rt.flags.ending &&
    (rt.flags.step < 3 || rt.flags.shelterShown || rt.flags.step === 3 && !!sortieWaypoint(rt) || rt.flags.step === 4),
  namedGuideMarkers: true,
  travelGuideLabel(rt) {
    if (rt.flags.shelterShown) return rt.flags.step >= 3 ? '味方の列の後ろへ' : '奥の護衛へ';
    if (rt.flags.step === 2 || rt.flags.step === 2.75) return '門内の脇へ';
    if (rt.flags.step < 3) return '南の門内へ';
    if (rt.flags.step === 3 || rt.flags.step === 4 && !rt.flags.kidoCut) {
      const way = sortieWaypoint(rt);
      return way === SORTIE_EXIT ? '南門の外へ' : way === SORTIE_NORTH ? '堀の外を北へ' : way ? '砦の東へ' : rt.flags.step === 4 ? '味方と北へ進め' : '北の敵の旗へ';
    }
    return rt.flags.step === 4 && !rt.flags.kidoCut ? '味方と北へ進め' : '木戸の手前の印へ';
  },
  // 門と二段の列で視点へ入り込む味方や装具を避ける。姿と当たりは描画後に戻す。
  nearAllyFadeRadius: 2.2, // 視点が体へ入る近さだけを調べ、周りで戦う味方は濃く残す。
  nearHatFadeRadius: 0, // 笠だけを透かして頭巾や顔の内側を見せず、体と一緒に避ける。
  nearAllyHorseFade: true,
  nearAllyBodyOnly: true,
  nearAllySolidBody: true, // 門内の味方を部分ごとに透かさず、視点が体へ入った時だけ全身を避ける。
  nearAllyWholeOcclusion: true, // 自分との間を塞ぐ味方も全身で避け、半透明の顔・兜・馬具を重ねない。
  nearSpearFade: false, // 一斉に槍を縮めず、目の前の長柄だけ描く間避ける。
  nearLongWeaponRadius: 10, // 後列の長柄も肩越しへ届く。視点の近くの柄と竿だけ描く間避ける。
  nearGroundSpearRadius: 8, // 持ち主から離れた落ち槍も、視点を塞ぐ時だけ避ける。
  nearFlagFadeRadius: 6,
  softOpen: 90, // 最初の囲みでは傷を半分にし、構えと退き方を覚える間を残す。
  openingGunGrace: 90, // 最初の鉄砲でも体力を残し、物陰へ退けるようにする。
  battleVoices: { lines: { ally: {
    // 筒先と一斉射の知らせを同じ文にそろえ、共通の八秒の間引きを使う。
    gunOne: ['鉄砲がこちらを狙っておる！　物陰へ退け！'],
    gunLine: ['鉄砲がこちらを狙っておる！　物陰へ退け！'],
    gunAtMe: ['鉄砲がこちらを狙っておる！　物陰へ退け！'],
    // 籠城から追撃まで、斬り合いを邪魔する平時の呟きを混ぜない。
    ambient: ['隣を離れるな', '来るぞ、構えよ'],
    encircle1: ['左右にも敵だがや！　槍をそろえるぞ！', '脇にもおるで！　味方を離れるな！'],
    encircle2: ['囲まれたがや！　味方の旗へ退け！', '退き口をあけろ！　皆で抜けるで！'],
  } } },
  jinkei: JIN,
  noWake: true,
  noHorse: true, // 狭い門と土橋を守り、先手の足軽と打って出る局地は徒歩で表す。
  noTaishoRaid: true,
  holdLine: true, // 城戸口で勝っても、共通の追撃で木戸の内へ踏み込まない。
  noDistantBattle: true,
  // 兵舎や本陣への民の自動配置を止め、民は兵の名簿に入れず共通の見物・避難を使う。
  civilianCrowd: { bands: PEOPLE_BANDS },
  spawn: { x: 6, z: -52, heading: 0 },   // 南の門と寄せ手を正面に見る。自分は砦の守備隊、信長は外から来る。
  lordSpawn: { x: 80, z: 20, heading: -Math.PI / 2 },
  world: {
    compactScenery: true, // 低画質は静かな景物を材質ごとに結合し、画面外の部品の面を送らない。
    seed: 15764,
    groundHalf: 260,
    terrainTriangles: true, // 兵・草・小屋の足場を、実際に描く三角形の高さへそろえる。
    distantTerrainTriangles: true, // 軽い遠目の兵も同じ面へ据え、近づいた時に足を跳ねさせない。
    terrainContactView: true, // 門脇の土塁に視点が入り、地面の裏や空が見えるのを防ぐ。
    fieldNorth: HONGAN.z - 180, // 北だけ延ばす。砦の格子・兵数・草木の数は増やさない。
    climbTan: 0.70,
    moveLim: -HONGAN.z + 170, // 城戸口と、その後ろへ退く敵まで届く。
    time: 'day',
    mountainScale: 0.18, // 台地からの遠山を低くし、砦の背後を高い峰で囲まない。
    mountainHaze: 0.65,
    noHorse: true, // 実名による自動乗馬も止め、後詰の将を門内へ騎馬で押し込まない。
    distantFootOnly: true, // 後詰の軽い兵も徒歩にそろえ、砦へ続く列へ無名の騎馬を重ねない。
    ordinaryFlagStride: 4, // 無名の長柄足軽は四人に一本。隊の幟・武将・自分の組は保つ。
    wholeInfantrySilhouette: true, // 軽い姿へ戻る兵も脚を隠さず、門外で胴だけを浮かせない。
    completeCrowdLegs: true, // 骨入りの遠目の姿にも袴と脛の布を残し、具足の隙間を空洞にしない。
    livingSpearHedge: true, // 門の後列は味方を避けて槍を起こし、構える間も息と押し返しを残す。
    drawTimeUnitParts: true, // 移動・旋回後の骨と逆行列を描く時にそろえ、体の部品や槍が取り残されるのを防ぐ。
    movingHiddenBones: true, // 画面外を歩く兵も、根元が動いた時だけ骨をそろえ、宙に具足を残さない。
    fullTipMatrices: true, // 遠い兵の手首と指も同時に動かし、門口から長い皮膚の帯を伸ばさない。
    variedMarch: true, strideLimit: 1.25, // 歩調をばらし、敗走でも腿と膝を振り上げすぎない。速度は保つ。
    fallPaceSpread: .45, // 同時に討たれた兵も、膝が折れる間を一人ずつずらす。
    groundedFalls: true, settleSideFalls: true, // 横倒しの肩と胴を坂へ寝かせ、土へ埋めない。
    terrainContactFalls: true, settledFalls: true, // 段を下りて倒れた根元と、骨のある兵の腰・胸・頭を土へ戻す。
    groundedFallImpact: true, wetEarthBursts: true, // 着地した時だけ重い音と低い土粒を出す。
    bareFallenHats: true, // 落ちた陣笠に頭巾や首の形を残さない。
    slopeLitter: true, // 笠と落とした武具を、砦の坂に沿って寝かせる。
    crumpledFlags: true, // 片付け後の指物も共有の皺へ。拡大された敷板に戻さない。
    longitudinalSpearFalls: true, // 落ちた長柄の穂先と石突で坂を測る。
    smokeFogFloor: 420, // 筒先の硝煙は残し、遠い列と北へ追う道を全体の白い霞で隠さない。
    muddy: 0.3,
    softEarthCrust: true, // 土塊の陰を塊の周りへ限り、砦と追撃路の裸地に四角い継ぎ目を出さない。
    stableSlopeGrain: true, // 土塁の斑を世界座標でつなぎ、法線の向きで扇状の縞へ縮めない。
    softPathSoil: true, // 道の湿りと草際を連続して混ぜる。
    patchyGround: true, // 広い追撃路にも乾いた土と湿った窪みの斑を残す。
    paths: [[[150, 36], [98, 32], [72, 26], [0, 12], [0, T_GATE.z]], [[0, -54], [0, T_GATE.z], [0, -28], [44, -28], [44, -112], [KIDO.x, KIDO.z + 26]], ...T_ROADS, ...PEOPLE_PATHS, [[52, KIDO.z - 61], [86, KIDO.z - 61], [86, KIDO.z - 100]]],
    height,
    moveWay: fortMoveWay,
    runnerWay: fortRunnerWay,
    clear: (x, z) => Math.abs(x) < 70 && z > -100 && z < 150 || peopleRoadDistance(x, z) < 6
      || x > 54 && x < 118 && z > KIDO.z - 126 && z < KIDO.z - 36,
    fieldStage: 'seedling',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (x > -40 || z < -80 || z > 170) return 0;
      // 家の敷地と避難の畦道は乾かす。水田の中へ民を走らせない。
      if (x > -96 && x < -48 && z > 32 && z < 64 || peopleRoadDistance(x, z) < 5) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.7;
    },
    trees: 260,
    tufts: 4200,
    treeDensity: (x, z) => (Math.abs(x) < 80 ? 0.1 : 0.6),
    groves: [{ x: -40, z: 20, r: 10, n: 12 }, { x: 44, z: -10, r: 10, n: 12 }],
    fleeOut: (x, z, team) => team === 1 && (z < HONGAN.z - 120 || Math.abs(x) > 210),
  },

  waitForPlayer: true, // 動く・構える・打つまで開戦を待ち、無操作で敗退させない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 庭や追撃路にも同じ足形を敷き詰めない。実際に歩いた足跡は共通の処理で残す。
    // 作り置きの細粒の絵を共有し、この戦の参照だけ替える。土塁にも同じ地肌を使う。
    W.groundU.tDirt.value = W.groundU.tBank.value = dirtTex(true, true);
    W.groundU.tMud.value = mudTex(true);
    fortGround(rt);
    F.step = 0; F.ek = 0; F.ak = 0; F.rescued = true;
    F.fieldRest = { x: GATE_REAR.x, z: GATE_REAR.z };
    // 敗報の最中でも、初めて狙われた時の鉄砲の予告は待たせない。
    rt.volleyWarnT = rt.t - 15; rt.gunWarnT = rt.t - 9;
    rt.reloadCallT = rt.t; rt.encSayT = rt.t;
    namuTex(); sagarifujiTex();
    // ---- 天王寺砦：原田直政が築いた付城（castles/tennoji.js の縄張り）。外曲輪と主郭の二段、土塁の上の木柵、空堀、物見櫓 ----
    flReset();
    // 狭間の見張りと室内の守りは別の自動配置。両方を止め、櫓だけに余分な兵を残さない。
    const C = F.C = buildCastlePlan(rt, { ...TENNOJI_PLAN, kuruwa: TENNOJI_PLAN.kuruwa.map((k) => ({ ...k, sakamogi: [] })) }, { baseHeight: baseTerrain, edgeW: 3, buildTowers: true, perch: false, interiorGuards: false, towerTeam: 0, team: 0, life: false });
    C.height = height;
    // 柵は味方の物。敵も門へ回し、土塁の上の杭へよじ登らせない。
    for (const s of C.walls) if (s && s.seg) { s.team = 0; s.hp = s.maxHp = 1e9; s.noTarget = true; s.wall = true; s.noClimb = true; }
    // 柵の下の土塁は高さ関数に含まれる。別の薄い土の面を重ねると、
    // 曲輪の角や門脇で四角い縁が浮くので、地形そのものを見せる。
    // 外の門は板囲いの渡櫓、主郭は小さな冠木門（細部は推定）
    rt.scene.add(fortGate(W, T_GATE.x, T_GATE.z, 6.4, true), fortGate(W, T_HONGATE.x, T_HONGATE.z, 4.8));
    // 外曲輪：兵舎（長屋）・兵糧の俵・焚き火。主郭：明智の本陣（陣幕）と陣屋
    F.houses = fortHouses(rt);
    rt.scene.add(tawara(W, -10, -63, 0.4, 6), tawara(W, 10, -73, -0.3, 5), campfire(W, -7, -58), campfire(W, 8, -56));
    rt.scene.add(jinmaku(W, 7, -70, 5, 2, 3), shogi(W, 5, -71, 0, { gunbai: true }),
      hatazao(W, -10, -74, 0, 4, 'akechi'));
    // 旗：門の左右・主郭・櫓の脇（織田と明智の幟）
    for (const [x, z, k, h] of [[-5, -40, 'oda', 6], [5, -40, 'akechi', 6], [-10, -71, 'akechi', 6], [8, -71, 'oda', 6], [-19, -51, 'oda', 5], [19, -80, 'akechi', 5], [0, -88, 'oda', 6]]) rt.scene.add(nobori(W, x, z, k, h));
    // 空堀の外の逆茂木（門の前は空ける）
    fortAbatis(rt);
    fortSoldiers(rt);
    this.fallenScene(rt);
    // 縄張りの今の様子（nawabari.js）：曲輪の表を小地図・軍議に渡す。守りは織田（team 0）
    F.K = makeNawabari(rt, C, { team: 0, friendTeam: 0, enemyTeam: 1 });
    rt.nawabari = F.K;
    // 大坂の城戸口：板塀と土塁・渡櫓。東奥に堀で区切る寺内町（細部は推定）
    fortHorizon(rt);
    kidoGround(rt);
    const kidoBatch = makeSimpleBatch();
    for (const sg of [[KIDO.x - 40, KIDO.z - 4, KIDO.x - 4, KIDO.z], [KIDO.x + 4, KIDO.z, KIDO.x + 36, KIDO.z - 6]]) {
      const len = Math.hypot(sg[2] - sg[0], sg[3] - sg[1]);
      const nx = -(sg[3] - sg[1]) / len, nz = (sg[2] - sg[0]) / len;
      const fence = castleBoardFence(W, sg, { batch: kidoBatch, h: 2.4 });
      if (!fence.isBatchedPart) rt.scene.add(fence);
      solidRect((sg[0] + sg[2]) / 2, (sg[1] + sg[3]) / 2, len, .3,
        Math.atan2(-(sg[3] - sg[1]), sg[2] - sg[0]));
      dorui(W, sg, nx, nz, { batch: kidoBatch, w: 2.6, h: .7,
        capEnds: true, closeBack: true });
    }
    finalizeSimpleBatch(rt, kidoBatch);
    templeTown(rt);
    rt.scene.add(fortGate(W, KIDO.x, KIDO.z, 6.4, true));
    // ---- 四天王寺（戦国期の伽藍。周りを含む広い区域の目印。東大門は石山合戦で焼けた設定で門は置かない） ----
    rt.scene.add(dou(W, SHITEN.x, SHITEN.z, 9, 6.5, Math.PI, { h: 3.6 }), hut(W, SHITEN.x + 16, SHITEN.z - 4, 7, 5, Math.PI, { wall: 0x7a5a3c }));
    rt.scene.add(nobori(W, SHITEN.x - 10, SHITEN.z + 8, 'oda', 5));
    // 勝鬘院（愛染堂）：四天王寺の北西の小さな堂（周りの伽藍の目印）
    // 砦は勝鬘院と茶臼山の間。距離・堂の細部は推定、北の目印を南へ逆転させない。
    rt.scene.add(dou(W, 26, -118, 6, 5, Math.PI, { h: 3 }));
    // ---- 西の低地の集落 ----
    rt.scene.add(village(W, -72, 48, { n: 6, r: 16, seed: 1576 }));
    // 砦に籠もる明智・佐久間信栄の手
    F.ake = allyGroup(rt, { fixed: true, fullStrength: true, formation: 'yari', guard: true, guardLeash: 6, name: '明智光秀の手', anchor: { x: 0, z: -54 }, facing: 0, width: 12, aggro: 10, noRout: false },
      // 門口を受ける槍を厚くする。総数は変えず、鉄砲は後ろの別隊と合わせる。
      dress([{ type: 'busho', n: 1, o: { name: '明智光秀', invuln: true, horse: false } }, { type: 'samurai', n: 1, o: { name: '佐久間信栄', invuln: true, horse: false, hat: 'hachimaki', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 2 }], ODA));
    // ---- 三段の後詰。東の若江道から住吉口へ。信長本人は先手の足軽に交じる ----
    F.nobu = allyGroup(rt, { fixed: true, fullStrength: true, formation: 'yari', guard: true, guardLeash: 6, name: '先手に交じる信長の手', anchor: { x: 80, z: 20 }, order: 'hold', facing: -Math.PI / 2, width: 14, aggro: 12, noRout: false },
      // 信長公記の先手の足軽に交じる姿。狭い門でも徒歩の道を使う。
      dress([{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true, horse: false } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 2 }], ODA));
    F.nobuU = F.nobu.units[0];
    // 信長公記：信長は足に鉄砲傷を受けても下知を続けた。深手で陣の奥へ退かせない。
    F.nobuU.onWound = () => {
      F.nobuU.hp = Math.max(F.nobuU.hp, F.nobuU.maxHp * 0.3);
      if (F.nobuShotSaid) return;
      F.nobuShotSaid = true;
      rt.say('足軽', '殿が撃たれた！　……いや、殿は旗を下げぬ。続け！', 3);
    };
    F.saku = allyGroup(rt, { fixed: true, fullStrength: true, formation: 'yari', guard: true, guardLeash: 6, name: '一段目・佐久間と若江衆', anchor: { x: 72, z: 26 }, order: 'hold', facing: -Math.PI / 2, width: 12, aggro: 10, noRout: false },
      // 門へ突入する局地は徒歩で表す。馬が柱と槍の間で竿立ちを繰り返さない。
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: false, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'samurai', n: 1, o: { name: '松永久秀', invuln: true } }, { type: 'samurai', n: 1, o: { name: '細川藤孝', invuln: true } }, { type: 'ashigaru', n: 8 }], ODA));
    F.taki = allyGroup(rt, { fixed: true, fullStrength: true, formation: 'yari', guard: true, guardLeash: 6, name: '二段目・滝川らの手', anchor: { x: 98, z: 32 }, order: 'hold', facing: -Math.PI / 2, width: 12, aggro: 10, noRout: false },
      dress([{ type: 'samurai', n: 1, o: { name: '滝川一益', invuln: true, horse: false, hat: 'kabuto_w', haori: 0x2a2a3a } }, { type: 'samurai', n: 1, o: { name: '羽柴秀吉', invuln: true } }, { type: 'samurai', n: 1, o: { name: '丹羽長秀', invuln: true } }, { type: 'samurai', n: 1, o: { name: '蜂屋頼隆', invuln: true } }, { type: 'samurai', n: 1, o: { name: '稲葉良通', invuln: true } }, { type: 'samurai', n: 1, o: { name: '氏家直通', invuln: true } }, { type: 'samurai', n: 1, o: { name: '伊賀伊賀守', invuln: true } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }], ODA));
    F.oda = [F.nobu, F.saku, F.taki, F.ake];
    // 将も実際の傷で退く。味方だけの威力・守りの上乗せはしない。
    for (const g of F.oda) {
      g.defMult = 1; g.dmgMult = 1; g.yariRanks = 3;
      for (const u of g.units) if (u.invuln) u.allyOk = true;
    }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 9, z: -50 }, Math.PI, [{ kind: 'spear', n }]);
    // 門前の組は後列の索敵を三メートルに絞らず、組頭の近くの敵にも加勢する。
    for (const g of rt.squadGroups) {
      g.formation = 'loose'; g.width = 4; g.spacing = 0.6;
    }
    // ---- 砦を囲む本願寺勢 ----
    // 南の囲みは門へ進む道の始点から出す。初戦までの余分な三十メートルを省く。
    F.ringA = enemyGroup(rt, { fixed: true, formation: 'yari', guard: true, guardLeash: 6, faction: 'honganji', name: '囲みの門徒', anchor: { x: -8, z: -20 }, facing: Math.PI, order: 'hold', aggro: 16, width: 18, morale: 90, fleeDir: { x: -0.3, z: -1 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 1, o: { name: '南の囲みの侍大将', hat: 'kabuto_m' } }, { type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 15 }], IKKO));
    F.gunA = enemyGroup(rt, { fixed: true, formation: 'yari', guard: true, guardLeash: 6, faction: 'saika', name: '雑賀の鉄砲', anchor: { x: 20, z: -6 }, facing: Math.PI, order: 'hold', aggro: 40, width: 14, morale: 90, fleeDir: { x: 0.3, z: -1 }, dmgMult: 1 },
      dress([{ type: 'samurai', n: 1, o: { name: '雑賀の鉄砲頭' } }, { type: 'gun', n: 6 }], SAIKA));
    // ---- 大軍（軽い作り）：砦を囲む本願寺勢、遠くの石山本願寺 ----
    // 備の表の実名は保ち、軽い兵に同名の大将を重ねて描かない。
    const hosts = rosterBuild(rt, JIN.map((plan) => ({ ...plan, sonae: plan.sonae.map((s) => ({ ...s,
      general: '配下（名は不明）',
      // 門徒の後ろまで背旗を敷き詰めず、既存の人数を少し広い持ち場へ散らす。
      ...(plan.team === 1 ? { host: false, kind: s.kind || 'spear', w: (s.w || 14) * 1.6, d: (s.d || 10) * 1.7 } : {}),
    })) })));
    // 遠すぎて形を省いた備には、描く兵も歩調や列の幅もない。
    // 名簿の備は残し、砂埃と幟は実体のある備だけに付ける。
    F.hostE = Object.values(hosts[1]).filter((host) => host.army.n > 0);
    this.scatterHosts(rt);
    rt.scene.add(dou(W, HONGAN.x, HONGAN.z, 16, 10, 0.3, { h: 4.2 }), hut(W, HONGAN.x - 26, HONGAN.z + 12, 10, 7, 0.3, { h: 3.8, wall: 0x7a5a3c, roof: 0x3a3430 }));   // 本願寺の御影堂（瓦の大屋根）と庫裏
    for (const [x, z] of [[HONGAN.x - 10, HONGAN.z + 22], [HONGAN.x + 12, HONGAN.z + 20]]) rt.scene.add(nobori(W, x, z, 'sagarifuji', 7));
    rt.scene.add(tawara(W, 16, 140, 0.3, 5));
    // 東の救援三段目。信長本人は先手へ出る。
    F.honjin = camp(rt, { x: 126, z: 36, facing: -Math.PI / 2, team: 0, faction: 'oda', mon: 'oda', guard: 15, reserve: 0, runTo: { x: 72, z: 26 } });
    F.honjin.guard.name = '三段目・信長の馬廻';
    F.honjin.guard.guard = true; F.honjin.guard.guardLeash = 6;
    march(F.honjin.guard, [[126, 36]], 'hold', -Math.PI / 2);
    // 本願寺勢の総大将・下間頼廉の本陣：城戸口の後ろ（前の斬り合いには出ない。顕如は石山の内にいて戦場へは出ない）
    F.ehon = camp(rt, { x: SHIMO.x, z: SHIMO.z, facing: 0, team: 1, faction: 'honganji', mon: 'sagarifuji', armor: 0x3a342c, general: { name: '下間頼廉', hat: 'kabuto_m', haori: 0x4a4236 }, guard: 15, reserve: 0, runTo: { x: KIDO.x, z: KIDO.z + 30 } });
    F.ehon.guard.name = '下間頼廉の旗本';
    F.ehon.general.keepInvuln = true;
    F.ehon.general.noTarget = true;
    F.ehon.general.group.guard = true; F.ehon.general.group.guardLeash = 2;
    F.ehon.guard.guard = true; F.ehon.guard.guardLeash = 6;
    this.prepare(rt);
    // 軽い三段を、既存の本物の隊へ結ぶ。読む位置は使い回し、新しい兵を足さない。
    F.hostLinks = [];
    for (const [id, q] of [['first', F.saku], ['second', F.taki], ['third', F.honjin.guard]]) {
      const light = hosts[0][id];
      if (!light) continue;
      const at = { get x() { return q.anchor.x; }, get z() { return q.anchor.z; }, get facing() { return q.facing; } };
      light.follow(() => spent(q) ? null : at, { gap: 0 });
      F.hostLinks.push({ light, q });
    }

    // 城の組み立てで止めた室内兵を、開戦後の自動配置でも戻さない。
    // 門を守る兵が櫓へ移されると、守備の人数と再出撃の隊が食い違う。
    // 井楼の戸口は外の形に含まれる。別の黒い枠を高い床へ足さない。
    for (const I of NAKA.list) if (I.profile === 'yagura') {
      I.guards = [];
      I.hasExterior = true;
    }
    rt.world.setTime('day');
    this.setupNotices(rt);
    rt.setPhase('brief');
    rt.obj('main', rt.G.lord ? '先手の列で住吉口への下知を待て' : HI(rt) ? '組と南の門内を守れ' : '南の門内を守れ', 'main');
    if (!rt.G.lord) rt.marker('defend', GATE_REAR, '南の門内の槍の列', { h: 3, guideAlways: true, waitGuide: true });
    this.prologue(rt);
  },

  // 準備時だけ既存の形と色を変える。動き・敗走・遠さによる間引きは共通処理を使う。
  scatterHosts(rt) {
    const matrix = new THREE.Matrix4(), color = new THREE.Color();
    for (const host of rt.flags.hostE) {
      const army = host.army;
      // 遠すぎる備えは形を持たない控え。幟の寸法も足さず、共通の省略を保つ。
      if (!army.U) continue;
      for (const mesh of host.children) {
        if (!mesh.isInstancedMesh) continue;
        const info = mesh.geometry.getAttribute('aInfo'), flags = mesh.geometry.getAttribute('aInfo2');
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix);
          const x = matrix.elements[12], z = matrix.elements[14];
          const seed = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453, n = seed - Math.floor(seed);
          matrix.elements[12] += (n - .5) * 1.3;
          matrix.elements[14] += Math.sin(seed) * .65;
          mesh.setMatrixAt(i, matrix);
          // 門徒の持ち槍は長柄一色にしない。穂先までの長さだけを変え、背丈は保つ。
          // 体と旗の複製へ同じ値を渡す。準備時だけ既存の属性を書き替える。
          if (info && info.getY(i) === 0) info.setW(i, .9 + n * .3);
          // 背の小旗は八人に一人ほど。大きな幟は残し、人の頭と胴が先に見えるようにする。
          if (flags && info && info.getY(i) !== 4) flags.setX(i, n < .12 ? flags.getX(i) : 0);
          if (mesh === army.body) mesh.setColorAt(i, color.setRGB(.58 + n * .5, .56 + n * .46, .52 + n * .4));
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (flags) flags.needsUpdate = true;
        if (info) info.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
      // 隊と一緒に動く幟。白い小旗の列に埋もれず、散った人の群れの目印になる。
      // 共通の移動は直下の部品の位置を書き替えるので、幟の持ち場を一段内へ保つ。
      const banner = new THREE.Group();
      banner.add(nobori(rt.world, army.cx - army.hw0 * .6, army.cz - army.hd0 * .7, 'sagarifuji', 5));
      host.add(banner);
    }
  },

  // この戦だけの台詞の入口。待っている字幕も見直し、次の戦の準備で元に戻す。
  setupNotices(rt) {
    const F = rt.flags, hud = rt.hud;
    const original = { say: hud.say, bark: hud.bark, update: hud.update, updateLogEntry: hud.updateLogEntry, reset: hud.reset };
    // 横持ちの細い札でも、入城・道順・敗走の警告を最後まで読ませる。
    const taskStyle = document.createElement('style');
    taskStyle.textContent = `
/* 共通の道案内は識別子を二重にして固定配置するため、この戦の欄内配置を優先する。 */
html body #hud.tennoji-tasks #battle-notices:not(.choosing) #objectives#objectives#objectives.keep-combat-task:not(.expand) {
  position:relative !important; inset:auto !important; transform:none !important;
  width:100% !important; min-width:0 !important; max-width:100% !important;
  height:auto !important; max-height:none !important; flex:0 0 auto !important;
}
html body #hud.tennoji-tasks #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) #obj-list,
html body #hud.tennoji-tasks #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) li.cur .obj-text {
  display:block !important;
}
html body #hud.tennoji-tasks #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) li.cur .obj-now,
html body #hud.tennoji-tasks #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) .battle-action:not([hidden]) {
  white-space:normal !important; overflow-wrap:anywhere !important;
  width:100% !important; max-width:100% !important; min-width:0 !important;
  font-size:max(15px, calc(15px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}
html.touch body #hud.tennoji-tasks #battle-notices:not(.choosing):has(#objectives.attack-help:not(.expand)) {
  width:280px !important; max-width:calc(100vw - 176px) !important;
}
#hud.tennoji-tasks #battle-notices:not(.choosing) #objectives:not(.expand) li.cur > small {
  white-space:normal !important; overflow-wrap:anywhere; overflow:visible !important;
  width:100%; max-width:100%; min-width:0; height:auto !important; max-height:none !important;
  box-sizing:border-box;
}
/* よける指の札だけになって、何のために進むか分からなくなるのを防ぐ。 */
html body #hud.tennoji-tasks.dodge-active #battle-notices:not(.choosing) #objectives.keep-dodge-task:not(.expand),
html body #hud.tennoji-tasks.dodge-active #battle-notices:not(.choosing) #objectives.keep-dodge-task:not(.expand) #obj-list,
html body #hud.tennoji-tasks.dodge-active #battle-notices:not(.choosing) #objectives.keep-dodge-task:not(.expand) li.cur .obj-text {
  display:block !important; visibility:visible !important;
}
html body #hud.tennoji-tasks.dodge-active #battle-notices:not(.choosing) #objectives.keep-dodge-task:not(.expand) :is(.battle-action, .victory-condition) {
  display:none !important;
}
html body #hud.tennoji-tasks #battle-notices:not(.choosing) #objectives.keep-combat-task:not(.expand) #obj-list li.cur > small:not(.goal-place):not(.obj-cue) {
  display:block !important;
  font-size:max(15px, calc(15px * var(--text-scale, 1))) !important; line-height:1.4 !important;
}`;
    // 横持ちの会話を二十の字で大きくせず、短い警告と任務を一緒に読ませる。
    taskStyle.textContent += `
@media (max-height:500px) and (orientation:landscape) {
  /* 反撃の札で親に付いた移動を持ち越さず、出撃・回避・構えで同じ上端を使う。 */
  html.touch body #hud.tennoji-tasks.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
    top:calc(12px + env(safe-area-inset-top, 0px)) !important;
    bottom:auto !important; left:50% !important; right:auto !important;
    transform:translateX(-50%) !important;
    width:280px !important; max-width:calc(100vw - 176px) !important;
    max-height:33vh !important; overflow-x:hidden !important; overflow-y:auto !important;
    justify-content:flex-start !important;
  }
  html body #hud.tennoji-tasks #battle-notices #battle-message > div#subtitle,
  html.touch.tc-low body #hud.tennoji-tasks #battle-notices #battle-message > div#subtitle {
    font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
    line-height:1.4 !important;
  }
}`;
    document.head.appendChild(taskStyle);
    hud.root.classList.add('tennoji-tasks');
    const speakers = new Map();
    for (const g of F.fighters) for (const u of g.units) if (u.name) speakers.set(u.name, u);
    for (const g of F.foes) for (const u of g.units) if (u.name) speakers.set(u.name, u);
    const retired = new Set(), generalBack = rt.army.hooks.onGeneralBack;
    rt.army.hooks.onGeneralBack = (u) => { retired.add(u); if (generalBack) generalBack(u); };
    F.warningCalls = { gun: { at: -Infinity, n: 0 }, ring: { at: -Infinity, n: 0 } };
    const gunLines = ['鉄砲がこちらを狙っておる！　物陰へ退け！', '鉄砲の筒先が向いた！　身を低くせよ！', '鉄砲の狙いを外せ！　物陰へ移れ！'];
    const ringLines = ['囲まれた！　敵を向いて構え、味方の列へ退け！', '脇の敵に背を見せるな！　構えて味方へ寄れ！', '退く道を守れ！　味方と一緒に抜けよ！'];
    const silent = () => {
      const u = rt.player.u;
      // 一度深手になった後は、回復しても戦の掛け声を再開しない。
      if (!u.alive || u.woundOut || u.hp < u.maxHp * .3 || rt.result?.down) F.speechStopped = true;
      return !!F.speechStopped;
    };
    const speakerFor = (name) => {
      const u = speakers.get(name);
      return u && (!u.alive || u.woundOut || u.fleeing || u.rearWound || retired.has(u) || u.group?.routed ||
        u.group?.order === 'retreat' || u.group?.order === 'flee') ? '使番' : name;
    };
    const words = (name, text) => {
      if (name === '明智光秀' && /無念/.test(text)) return '南門の守りが薄い！　味方と槍をそろえよ！';
      if (/木津で織田勢を退けた/.test(text)) return '木津では勝ったぞ。砦も押せ！';
      if (name === '使番' && /内からも突いて出る/.test(text)) return '後詰じゃ！　内からも突くぞ！';
      return text;
    };
    const safety = (text) => rt.player.u.alive && !rt.player.u.woundOut && !rt.over &&
      /構え|矢玉|鉄砲|物陰|傷を縛|傷が深|囲まれ/.test(text);
    hud.say = function (speaker, text, dur, urgent, detail) {
      if (silent() && !safety(text)) return false;
      const accepted = original.say.call(this, speakerFor(speaker), words(speaker, text), dur, urgent, detail);
      // 字幕で待たせるのは三件まで。あふれた声も会話の記録には残す。
      while (this.subQ.length > 3) { this.subQ.shift(); this.subDrop = true; }
      return accepted;
    };
    hud.bark = function (text, warn) {
      // 一隊の敗走を追撃の下知にせず、籠城・救援・入城の間は門の持ち場を保つ。
      if (!F.ending && !rt.over && !rt.G.lord && F.step < 3 &&
          /敵が背を見せた！.*追え|敵が崩れた！.*押せ|弾込め.*詰めよ|撃ち終えた.*寄せよ/.test(text))
        text = '敵が退いても門を出るな。味方と槍をそろえよ！';
      if (/敵が退いても堤を下りるな/.test(text))
        text = F.step < 3 ? '敵が退いても門を離れるな。備えを保て！'
          : F.step === 3 ? '味方の列と進め。一人で敵を追うな！'
            : '城戸口で止まれ。木戸の内へ踏み込むな！';
      // 籠城中の守備兵の移動を、まだ下知待ちの後詰の到着と呼ばない。
      if ((F.step === 0 || F.step === 2.5 || F.step === 2) && /(?:[左右]手|後ろ|前)から味方が来るぞ/.test(text)) {
        // 普段の持ち場への移動で警告札を埋めず、接触を避ける必要がある時だけ知らせる。
        if (!warn) return;
        text = '門内の味方が持ち場へ寄るぞ！';
      }
      // 敗走した一隊の声を、砦全体への退却命令と取り違えさせない。
      if (!F.ending && !rt.over && /^味方の侍「/.test(text) &&
          /退き口を守れ|固まって退け|殿を残して下がれ|無駄死にするな|負傷の者を担げ/.test(text))
        text = '味方の一隊が退く！　残る者は列を守れ！';
      if (silent() && !(warn && safety(text))) return;
      // 筒先・一斉射と、二段階の囲みを、それぞれ同じ八秒の枠にまとめる。
      const key = /鉄砲.*(?:狙|構え)|筒先|火蓋/.test(text) ? 'gun'
        : /囲まれ|左右.*敵|脇にも|退き口をあけろ|左右へ回られ|横へ回られ/.test(text) ? 'ring' : null;
      if (key) {
        const call = F.warningCalls[key];
        if (rt.t - call.at < 8) return;
        call.at = rt.t; call.n++;
        const lines = key === 'gun' ? gunLines : ringLines;
        text = lines[call.n < 3 ? 0 : 1 + (call.n - 3) % 2];
        if (key === 'gun' && F.step >= 3) {
          // 野へ出た後は、物陰のない進路へ「物陰へ移れ」と命じない。
          // 北へ向かう任務と両立する、射線を外す動きを知らせる。
          text = '鉄砲だ！　筒先の正面を避け、味方と進め！';
        } else if (key === 'gun' && !rt.G.lord && F.step < 3) {
          const u = rt.player.u;
          const hurt = u.hp < u.maxHp * .5 || rt.player.treatmentLeft > 0 && u.wounds?.bleed > .0001;
          if (hurt) {
            const way = fortMoveWay(rt.army, u, SHELTER);
            text = Math.hypot(u.pos.x - SHELTER.x, u.pos.z - SHELTER.z) <= 2
              ? '鉄砲だ！　護衛の後ろで身を隠せ！'
              : `鉄砲だ！ ${gateDirection(rt, way)} 奥の護衛へ退け！`;
          } else {
            text = inPoly(SOTO_POLY, u.pos.x, u.pos.z)
              ? '鉄砲だ！　門柱の陰へ！'
              : `鉄砲だ！ ${gateDirection(rt, GATE_REAR)} 門内の物陰へ退け！`;
          }
        }
        if (key === 'ring' && !rt.G.lord && F.step < 3) {
          const at = rt.player.u.hp < rt.player.u.maxHp * .5 ? SHELTER : GATE_REAR;
          const way = at === SHELTER ? fortMoveWay(rt.army, rt.player.u, SHELTER) : at;
          const direction = gateDirection(rt, way);
          text = direction === 'ここ'
            ? at === SHELTER ? '囲まれた！　護衛の後ろで身を隠せ！' : '囲まれた！　門内で味方と構えよ！'
            : `囲まれた！ ${direction} ${at === SHELTER ? '奥の護衛へ退け' : '門内の味方へ退け'}`;
        }
      }
      const result = original.bark.call(this, text, warn);
      // 重傷になった時に、既に出した掛け声も札から外せるようにする。
      if (this.notices) for (const item of this.notices.queue) if (item.text === this.terse(text)) item.tennojiVoice = !warn;
      return result;
    };
    hud.updateLogEntry = function () {
      original.updateLogEntry.call(this);
      // 記録は残す。未読を読んだことにせず、入口の数だけ三件で止める。
      if (!this.logEntry.hidden) {
        // 携帯の数字だけの釦も、何を開くか分かる二文字にする。読み上げの件数は保つ。
        this.logEntry.textContent = /^\d+$/.test(this.logEntry.textContent) ? '報せ'
          : this.logEntry.textContent.replace(/未読(?:の下知・報せ)?(\d+)件/, (all, n) =>
            Number(n) > 3 ? '未読3件以上' : all);
      }
    };
    hud.update = function (dt, battle) {
      // 合図は聞いた直後だけ補う。携帯の任務札を三十秒も押し広げない。
      for (const o of rt.objectives) if (o.cue && rt.t - o.cueT >= 8) o.cue = '';
      // 決着後は戦の更新が止まるので、退避の札もここで片付ける。
      if (F.shelterShown && (rt.over || F.ending || !rt.player.u.alive)) {
        rt.objRemove('shelter'); rt.unmark('shelter'); F.shelterShown = false;
      }
      // 深手の退避中に、共通の救援札で敵へ引き返させない。警告の期限は保つ。
      if (F.shelterShown && this.notices) for (const item of this.notices.queue) {
        if (/^危ない！.*のそばへ。敵を押し返せ$/.test(item.text))
          item.text = F.step >= 3 ? '味方も押されている。まず列の後ろへ退け' : '味方も押されている。まず護衛の後ろへ退け';
      }
      if (silent()) {
        // 深手でも、構えと退き方の字幕は読み終えるまで残す。
        for (let i = this.subQ.length - 1; i >= 0; i--) if (!safety(this.subQ[i].text)) this.subQ.splice(i, 1);
        if (this.shownLine && !safety(this.shownLine.text)) {
          this.subT = 0; this.shownLine = null; this.shownGoalKey = null;
          window.speechSynthesis?.cancel();
        }
        if (this.notices) for (let i = this.notices.queue.length - 1; i >= 0; i--)
          if (this.notices.queue[i].tennojiVoice) this.notices.queue.splice(i, 1);
      } else {
        for (const line of this.subQ) { line.text = words(line.speaker, line.text); line.speaker = speakerFor(line.speaker); }
        if (this.shownLine && speakerFor(this.shownLine.speaker) !== this.shownLine.speaker) {
          this.subT = 0; this.shownLine = null; window.speechSynthesis?.cancel();
        }
      }
      return original.update.call(this, dt, battle);
    };
    hud.reset = function () {
      taskStyle.remove();
      this.root.classList.remove('tennoji-tasks');
      for (const key in original) this[key] = original[key];
      return original.reset.call(this);
    };
  },

  fallenScene(rt) {
    const A = rt.army, W = rt.world, animate = A.animDeath, ground = A.groundTick;
    const axis = new THREE.Vector3(), normal = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), slope = new THREE.Quaternion();
    const pose = new THREE.Object3D(), inverse = new THREE.Matrix4();
    const poleGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.6, 5);
    poleGeo.translate(0, 0.8, 0);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x51412c });
    const flagMats = new Map();
    const dispose = W.dispose;
    W.dispose = function () { poleGeo.dispose(); poleMat.dispose(); for (const mat of flagMats.values()) mat.dispose(); if (dispose) dispose.call(this); };
    // 落ち槍は共通の接地を使う。端の高さだけで置き直すと、途中の土塁を貫く。
    let nextGround = 0;
    A.groundTick = function (dt, focus, cam) {
      ground.call(this, dt, focus, cam);
      if (this.time < nextGround) return;
      nextGround = this.time + .5;
      for (let i = this.dead.length - 1; i >= 0; i--) {
        const u = this.dead[i], D = u.death, age = this.time - u.killedAt;
        if (u.isPlayer || u.alive || u.dying || D?.aid || age < 4) continue;
        // 討死・任務の数は変えず、描く亡骸だけ四段で薄くする。
        const step = Math.min(4, Math.ceil((age - 4) / 2));
        this.fadeGround(u.mesh, step);
        if (u.dropped?.parent === this.scene) this.fadeGround(u.dropped, step);
        if (u.hatOff?.parent === this.scene) this.fadeGround(u.hatOff, step);
        // 亡骸を視線に合わせて横滑りさせない。倒れた場所で薄れ、片付ける。
        if (age >= 12) {
          if (u.dropped?.parent === this.scene) u.dropped.userData.groundFadeAt = this.time;
          if (u.hatOff?.parent === this.scene) u.hatOff.userData.groundFadeAt = this.time;
          this.clearCorpse(i);
        }
      }
    };
    A.animDeath = function (u, dt, near) {
      u.tennojiGrounded = true;
      animate.call(this, u, dt, near);
      const D = u.death, m = u.mesh;
      if (u.gone || D.aid || D.t < 0.9) return;
      axis.copy(up).applyQuaternion(m.quaternion);
      const cx = m.position.x + axis.x * 0.85, cz = m.position.z + axis.z * 0.85;
      // 腰と胸の二点を支える共通の接地を保つ。一点で高さを上書きしない。
      if (u.armR) { aimArm(u.armR, 0.36, 0.95, 0.22); aimArm(u.armL, -0.34, 0.9, 0.18); }
      if (!u.flag) return;
      if (!u.tennojiFlagRig) {
        // 一人につき一度だけ外す。元の竿を体へ残さない。
        const rig = new THREE.Group(); rig.matrixAutoUpdate = false;
        rig.add(new THREE.Mesh(poleGeo, poleMat), u.flag); m.add(rig); u.tennojiFlagRig = rig;
        u.flag.position.set(0, 1.16, 0); u.flag.rotation.set(0, 0, 0);
        // 静止させるだけでは敷板に見える。落ちた幟と同じ共有の皺を指物にも使う。
        this.foldGroundFlag(u.flag);
        u.flag.scale.multiplyScalar(Math.min(1, 1.15 / Math.max(u.flag.scale.x, u.flag.scale.y)));
        const src = muddyFlag(u.flagMat || u.flag.material);
        if (!flagMats.has(src)) {
          const mat = src.clone();
          mat.onBeforeCompile = (sh, renderer) => {
            src.onBeforeCompile(sh, renderer);
            // 地に伏せた四角い布を風で持ち上げ、白い三角の面にしない。
            if (sh.uniforms.uGust) sh.uniforms.uGust = { value: 0 };
            if (sh.uniforms.uFlagStill) sh.uniforms.uFlagStill = { value: 1 };
          };
          mat.customProgramCacheKey = () => src.customProgramCacheKey() + '|tennojiStill';
          flagMats.set(src, mat);
        }
        u.flag.material = flagMats.get(src);
        const look = { ...u.look, pole: false }, key = u.body.userData.lookKey + '|tennojiFallen';
        lodSwap(u.body, bodyGeometry(key, look, true, 'nohead'), bodyGeometry(key, look, false, 'nohead'));
      }
      axis.y = 0; axis.normalize();
      const x = cx + axis.z * 0.85 - axis.x * 0.8, z = cz - axis.x * 0.85 - axis.z * 0.8;
      const y = D.floor ? u.pos.y : W.heightAt(x, z), e = 0.6;
      if (D.floor) normal.copy(up);
      else normal.set(W.heightAt(x - e, z) - W.heightAt(x + e, z), 2 * e,
        W.heightAt(x, z - e) - W.heightAt(x, z + e)).normalize();
      slope.setFromUnitVectors(up, normal);
      pose.position.set(x, y + 0.04, z);
      pose.rotation.set(-Math.PI / 2, Math.atan2(-axis.x, -axis.z), 0, 'YXZ');
      pose.quaternion.premultiply(slope); pose.updateMatrix(); m.updateMatrix();
      u.tennojiFlagRig.matrix.copy(inverse.copy(m.matrix).invert()).multiply(pose.matrix);
      u.tennojiFlagRig.matrixWorldNeedsUpdate = true;
    };
  },

  prepare(rt) {
    const F = rt.flags;
    F.fgun = allyGroup(rt, { fixed: true, fullStrength: true, formation: 'line', guard: true, guardLeash: 3, name: '砦の鉄砲組', anchor: { x: FORT.x, z: FORT.z - 2 }, facing: 0, width: 14, aggro: 4, noRout: false },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 2 }], ODA));
    // 検使の猪子・大津も籠城した。既存の槍兵の姿と能力で表し、四人の護衛の数は保つ。
    // 主郭の口で二列に並び、休む場所まで敵を引き込み、追い回さない。
    F.rearGuard = allyGroup(rt, { fixed: true, fullStrength: true, ai: false, formation: 'yari', guard: false, noRing: true,
      name: '主郭の護衛', anchor: { x: T_HONGATE.x, z: T_HONGATE.z - 1.5 }, facing: 0, width: 2, yariRanks: 2, spacing: 1,
      aggro: 4, noRout: false },
      dress([{ type: 'ashigaru', n: 1, o: { name: '猪子兵介' } }, { type: 'ashigaru', n: 1, o: { name: '大津伝十郎' } }, { type: 'ashigaru', n: 2 }], ODA));
    F.ringB = enemyGroup(rt, { fixed: true, formation: 'yari', guard: true, guardLeash: 6, faction: 'honganji', name: '囲みの新手', anchor: { x: -40, z: -6 }, facing: Math.PI / 2, order: 'hold', seekRange: 70, aggro: 16, width: 12, morale: 90, fleeDir: { x: -1, z: -0.5 }, dmgMult: 1 },
        dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 8 }], IKKO));
    F.siegeW = [];
    for (const [x, z, name, facing, gun] of [[-36, -62, '西の門徒', Math.PI / 2, false], [36, -62, '東の雑賀衆', -Math.PI / 2, true], [0, -102, '北の門徒', 0, false]]) {
      const g = enemyGroup(rt, { fixed: true, formation: 'yari', guard: true, guardLeash: 3, faction: 'honganji', name, anchor: { x, z }, facing, order: 'hold', aggro: 22, width: 12, morale: 95, fleeDir: { x: 0, z: -1 } },
        dress(gun ? [{ type: 'samurai', n: 1 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 5 }] : [{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 8 }], gun ? SAIKA : IKKO));
      F.siegeW.push(g);
    }
    F.last = [];
    const mk = (x, z, name, list) => {
      const g = enemyGroup(rt, { fixed: true, formation: 'yari', guard: true, guardLeash: 6, faction: 'honganji', name, anchor: { x, z }, facing: 0, order: 'hold', seekRange: 90, aggro: 10, width: 16, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 1 }, list);
      F.last.push(g);
      return g;
    };
    // 本隊と雑賀の鉄砲衆は一度に構える。本隊の後ろには門徒の大軍（軽い作り）
    mk(-20, -126, '本願寺勢の本隊', dress([{ type: 'samurai', n: 1, o: { name: '本隊の侍大将', hat: 'kabuto_m' } }, { type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 11 }, { type: 'gun', n: 2, o: { flag: 'sagarifuji' } }], IKKO));
    mk(24, -130, '雑賀の鉄砲衆', dress([{ type: 'samurai', n: 2 }, { type: 'gun', n: 6 }, { type: 'ashigaru', n: 4 }], SAIKA));
    F.newHand = mk(-76, -120, '本願寺の後備え', dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 8 }], IKKO));
    F.kidoG = [];
    const add = (x, z, name, list) => {
      const g = enemyGroup(rt, { fixed: true, formation: 'yari', guard: true, guardLeash: 6, faction: 'honganji', name, anchor: { x, z }, facing: 0, order: 'hold', aggro: 20, seekRange: 30, width: 14, morale: 80, fleeDir: { x: 0, z: -1 }, dmgMult: 1 }, list);
      F.kidoG.push(g);
      return g;
    };
    add(KIDO.x - 6, KIDO.z + 14, '城戸口の殿の門徒', dress([{ type: 'samurai', n: 1, o: { name: '殿の侍大将', hat: 'kabuto_m' } }, { type: 'ashigaru', n: 8 }], IKKO));
    add(KIDO.x + 22, KIDO.z + 6, '木戸の雑賀の鉄砲', dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 4 }], SAIKA));
    F.fighters = [...F.oda, F.fgun, F.rearGuard, F.honjin.guard];
    F.defenders = [F.ake, F.fgun, F.rearGuard];
    F.relief = [F.nobu, F.saku, F.taki, F.honjin.guard];
    F.foes = [F.ringA, F.gunA, F.ringB, ...F.siegeW, ...F.last, ...F.kidoG];
    // 門へ寄せる足軽と道を先に用意し、半秒の見回りでは入れ物を増やさない。
    F.fortWaves = [F.ringA, F.ringB, ...F.siegeW].map((g) => ({
      g, sent: false, path: [[0, 0], [0, -30], [0, -30], [0, -46], [0, -52]],
    }));
    F.pressure = 0; F.secured = 0;
  },

  // 五月三日の敗報を短く伝え、五月七日の籠城へ。敗戦の再演や人の筋は入れない。
  prologue(rt) {
    rt.banner('天王寺砦、包囲される', rt.G.lord ? '砦の味方が危ない。先手に交じり、救いに向かえ' : '自分は砦の守り手。南の門を守れば、信長の救いが来る');
    rt.after(2, () => {
      if (rt.phase !== 'brief') return;
      battleEvent(rt, EVENT_MESSENGER, FORT, null, 0, false, '使番が木津の敗戦を伝える');
      rt.say('織田の使番', '木津攻めは敗れ、原田直政殿は討死！　天王寺砦が囲まれております！', 4);
    });
    rt.after(7, () => { if (rt.phase === 'brief') rt.say(rt.G.lord ? '佐久間信盛' : '明智光秀', rt.G.lord ? '住吉口から砦へ向かいます。先手の列は整っております！' : '南の門を渡すな。殿の救いが来るまで、ここを守るぞ！', 4); });
    rt.after(8, () => this.siege(rt));
  },

  // ① 囲みを突き破る
  breakIn(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 3 || F.breakDone) return;
    F.breakDone = true; F.breakGroups = [F.ringA, F.gunA, F.ringB, ...F.siegeW];
    F.step = 1; F.stepT = rt.t; F.secured = 0;
    rt.unmark('reliefWait');
    rt.unmark('hon'); rt.unmark('defend');
    rt.setPhase('break');
    rt.unmark('nobu');
    for (let i = 0; i < 3; i++) rt.unmark('s' + i);
    for (const q of F.siegeW) if (!gone(q) && q.anchor.z > -90) {
      const x = q.anchor.x < 0 ? -40 : 40;
      march(q, [[x, q.anchor.z], [x, -25]], 'attack', Math.PI);
      q.seekRange = 32;
    }
    // 北の足軽も砦の外を回って門の東へ寄る。合流後に遠い北から歩き始めない。
    const north = F.siegeW[2];
    if (!spent(north)) {
      north.ai = false; north.guard = false; north.aggro = 4; north.noRing = true;
      march(north, [[38, -102], [38, -30], [26, -30]], 'hold', -Math.PI / 2);
      north.onArrive = (q) => { q.order = 'hold'; q.guard = false; q.formation = 'column'; };
    }
    rt.banner('三段の後詰', F.gateHelp ? '門を押し返した隙に、信長の後詰が攻め寄せる' : '三千ほどの後詰が、住吉口から攻め寄せる');
    battleEvent(rt, EVENT_REINFORCEMENT, F.nobuU.pos, F.nobu, 0, true, '信長の後詰、囲みへ進む');
    rt.obj('main', rt.G.lord ? '先手と南の門へ進み、囲みを破れ'
      : HI(rt) ? '組と門内で救援を迎えよ' : '門内で救援を迎えよ', 'main');
    tennojiCue(rt, 'kakari', '法螺と早打ち。後詰がかかる', F.nobuU.pos);
    rt.say('使番', rt.G.lord ? '攻めの合図です！　先手と南の門へ！' : '救いが来たぞ！　門の敵を内から押し返せ！', 4);
    for (const [g, delay, x, gateOffset] of [[F.saku, 0, -8, -6], [F.nobu, 0, 4, 1], [F.taki, 8, 16, 12], [F.honjin.guard, 16, 8, 18]]) {
      rt.after(delay, () => {
        if (F.step !== 1) return;
        // 先手は門内の敵まで押し、信長は門口へ続く。敵を払う前に全隊を門外で待たせない。
        // 土橋の手前で二列を中央へ寄せ、後の二段は間をあけて控える。
        march(g, [[g.anchor.x, g.anchor.z], [x, 12], [x, -18], [T_GATE.x, -30], [T_GATE.x, T_GATE.z + gateOffset]], 'hold');
        g.seekRange = 28;
        // 道中の鉄砲は遠い敵へ足を止めて撃たない。列の後ろが残り、後詰が門へ着かなくなる。
        g.fire = false;
        g.onArrive = (q) => {
          q.fire = true;
          // 西の鉄砲や柵の外へ大将を追わせず、近い寄せ手は門前の列で迎える。
          q.ai = false; q.guard = false; q.guardOn = false;
          q.order = 'hold'; q.formation = 'yari'; q.yariRanks = 3;
          q.width = gateOffset <= 1 ? 4 : 6; q.spacing = .8; q.facing = Math.PI;
          // 信長の列は門口を保つ。先手が交戦する遠い敵へ後列まで追い出さない。
          q.aggro = q === F.nobu ? 6 : 18;
          for (const u of q.units) if (u.alive) u.aiT = 0;
        };
      });
    }
    // 後詰が来ても門の槍を外へ出さない。救援の先手が着くまで、内から門口を受ける。
    defendGate(F.ake, T_GATE.x, T_GATE.z - 6);
    rt.marker('join', rt.G.lord ? T_GATE : GATE_REAR, '門内で後詰を迎える', { h: 3, guideAlways: true });
    rt.marker('relief', () => F.step === 1 && F.nobuU.alive ? F.nobuU.pos : null, '門へ進む後詰', { h: 3, noGuide: true, alwaysDistance: true });
    F.ringA.order = 'attack'; F.ringA.onArrive = null; F.ringA.formation = 'yari'; F.ringA.seekRange = 40;
    F.gunA.facing = Math.PI / 2;
    // 外の後詰と、門内の守備隊で挟む。遠い敵を追わず、門口で槍を届かせる。
    F.ake.seekRange = 6;
    // 札（かかれ）が消えてから、門内の明智が呼応する声。
    rt.after(4.5, () => { if (F.step === 1) rt.say('明智光秀', '殿の旗じゃ！　門を開け、内から突け！', 3); });
    rt.marker('ra', centerOf(F.ringA), '門前の敵の旗', { red: true, group: F.ringA });
    rt.marker('ga', centerOf(F.gunA), '鉄砲衆の旗', { red: true, group: F.gunA });
    rt.after(25, () => { if (F.step === 1 && !F.ending) battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.nobuU.pos, F.nobu, 0, true, '信長が先手に交じり、旗を進める'); });
    rt.after(30, () => {
      if (F.step !== 1) return;
      F.ringB.order = 'attack'; F.ringB.seekRange = 70;
      rt.army.play('eshout', { x: -40, z: -6 }, 1.5);
      rt.marker('rb', centerOf(F.ringB), '西の敵の旗', { red: true, group: F.ringB });
    });
  },

  // ② 砦へ入る
  inFort(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    F.fortWaveAt = rt.t + 20;
    if (!rt.G.lord && !F.nobuWounded) {
      F.nobuWounded = true; F.nobuU.hp = Math.min(F.nobuU.hp, F.nobuU.maxHp * 0.75);
      F.nobuU.speed *= 0.85; F.nobuU.run *= 0.85;
    }
    rt.setPhase('fort');
    for (const id of ['ra', 'ga', 'rb', 'join', 'relief']) rt.unmark(id);
    if (Math.hypot(rt.player.u.pos.x - T_GATE.x, rt.player.u.pos.z - T_GATE.z) < 28) rt.award((t) => t.side.push('救援と門前の囲みを突き破った'), '救援と門前の囲みを突き破った');
    else if (inPoly(SOTO_POLY, rt.player.u.pos.x, rt.player.u.pos.z)) rt.award((t) => t.side.push('砦を守り、救援の開いた道を保った'), '砦を守り、救援を迎えた');
    rt.banner('囲みを破った', '門内の脇で信長の入城を迎えよ');
    rt.obj('main', '南の門内の脇で、信長の入城を迎えよ', 'main');
    // 中央の入城路を空ける。西の番所の裏と長屋の間なら、門の列を見ながら待てる。
    const G = { x: -7, z: -54 };
    rt.marker('gate', G, '番所の裏で待て', { h: 3, guideAlways: true, guidePriority: 500, guideRadius: 10 });
    // 持ち場は門の幟で示し、地面に輪を描かない。
    for (const [g, x, z] of [[F.saku, -5, -55], [F.ake, 6, -53], [F.nobu, -5, -60], [F.taki, 6, -60], [F.honjin.guard, 0, -63]]) {
      // 入城済みの隊は門外へ戻さない。後列も土橋に沿って二列で通す。
      g.guard = false; g.guardOn = false; g.noRing = true; g.stay = false;
      g.spacing = 0.8; g.roadColumn = true;
      const c = g.center(), entered = inPoly(SOTO_POLY, c.x, c.z);
      const road = entered ? [[c.x, c.z], [0, -54], [x, z]]
        : [[c.x, c.z], [0, T_GATE.z + 7], [0, -54], [x, z]];
      march(g, road, 'hold', 0);
      // 土橋を通る間は鉄砲も足を止めない。着いてから撃つ。
      g.fire = false;
      const arrive = g.onArrive;
      g.onArrive = (q) => { q.fire = true; arrive(q); };
    }
    rt.marker('nobu', () => F.nobuU.pos, '入城する信長の旗', { h: 3, noGuide: true });
    rt.after(4, () => {
      if ((F.step === 2 || F.step === 2.75) && F.nobuWounded) rt.say('足軽', '殿は足に傷を負った！　門の道を空けよ！', 3);
    });
    F.gz = G;
  },

  // 前段の籠城。救援が来る前に三方の寄せを受ける。
  siege(rt) {
    const F = rt.flags;
    if (F.step !== 0 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 2.5; F.stepT = rt.t;
    rt.setPhase('siege');
    rt.unmark('gate'); rt.unzone('gate'); rt.unmark('nobu');
    sfx('kane', 0.8);
    rt.banner('囲まれた', '本願寺勢が三方から砦へ押し寄せる');
    rt.say(rt.G.lord ? '佐久間信盛' : '組頭', rt.G.lord ? '先手の列でお待ちを。合図で南の門へ進みます！' : '南の門を守れ。柵の内で槍をそろえよ！', 4);
    rt.after(8, () => { if (F.step === 2.5 && !rt.G.lord) rt.say('佐久間信栄', '鉄砲を避けよ。門内で救いを待て！', 4); });
    // 近い鉄砲頭の声だけ。史料にない実名や、遠い本陣から届く肉声は足さない。
    rt.after(24, () => {
      const u = F.gunA.units[0];
      if (F.step === 2.5 && !F.ending && !spent(F.gunA) && u.alive && !u.woundOut && !u.fleeing && rt.distTo(u.pos) < 70)
        rt.say('雑賀の鉄砲頭', '門を狙え！　味方が前なら撃つな！', 3);
    });
    rt.obj('main', rt.G.lord ? '先手の列を保ち、砦への攻めに備えよ' : '南の門内を守れ', 'main');
    // 門の手前で止めず、土橋から門内へ進む。初めの斬り合いを待たせない。
    F.ringA.ai = false; F.ringA.noRing = true; F.ringA.aggro = 18;
    march(F.ringA, [[0, -30], [0, -46]], 'attack');
    F.ringA.seekRange = 32;
    F.fortWaves[0].sent = true;
    F.fortWaveAt = rt.t + 20;
    // 明智の槍を大将の円陣に閉じ込めず、門の内まで進んで迎え撃つ。
    F.ake.order = 'hold'; F.ake.noRing = true;
    defendGate(F.ake, 0, T_GATE.z - 3);
    defendGate(F.fgun, 2, T_GATE.z - 12);
    for (const g of F.siegeW) g.aggro = 28;
    if (rt.G.lord) rt.after(8, () => { if (F.step === 2.5) this.breakIn(rt); });
    else rt.marker('defend', GATE_REAR,
      () => F.pressure > 0 ? '門内の敵を押し返せ' : '南の門内の槍の列',
      { h: 3, guideAlways: true, waitGuide: true, guidePriority: () => F.pressure > 0 ? 500 : 0 });
    rt.marker('reliefWait', F.nobu.anchor, '後詰は下知待ち。持ち場を守れ', { noGuide: true });

  },
  // 合流して二段に立て直す。救援後にもう一度籠城を繰り返さない。
  regroup(rt) {
    const F = rt.flags;
    if (F.step !== 2) return;
    F.step = 2.75; F.stepT = rt.t;
    // 合流した静かな間に、囲みでできなかった手当てをもう一度試せる。
    F.botTreatRetryAt = 0;
    rt.setPhase('regroup'); rt.unmark('nobu'); rt.unmark('gate'); rt.unzone('gate');
    survival(rt, '天王寺砦を守り、救援と合流した');
    rt.banner('砦で合流', '後詰と砦の兵が合流。二段に立て直す');
    rt.obj('main', '南の門内で組をそろえ、下知を待て', 'main');
    tennojiCue(rt, 'atsumare', '法螺の二声。門内へ集まれ', F.nobuU.pos);
    rt.marker('join', F.gz, '番所の裏で列をそろえよ', { h: 3, guideAlways: true, guidePriority: 500, guideRadius: 10 });
    // 門の幟の内で列を立て直す。
    // 入城した兵を同じ地点へ重ねず、門内の二段で待つ。
    for (const g of F.fighters) if (!gone(g) && g.order !== 'path') { g.order = 'hold'; g.onArrive = null; g.formation = 'yari'; g.yariRanks = 3; }
    rt.say('佐久間信盛', '集まれの合図じゃ！　門内で二段に並べ！', 4);
    rt.after(6, () => { if (F.step === 2.75) rt.say(rt.G.lord ? '使番' : '織田信長', rt.G.lord ? '二段に並びました。次の合図で門を出ます！' : '次の合図で門を出よ。二段でもう一度攻めるぞ！', 4); });
  },

  // ③ 再び打って出る
  sortie(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    F.saku.name = '再攻撃の一段目'; F.taki.name = '再攻撃の二段目';
    rt.setPhase('sortie');
    rt.unmark('gate'); rt.unzone('gate');
    rt.unmark('join');
    F.sortieClear = false;
    rt.marker('sortieWay', () => sortieWaypoint(rt), () =>
      sortieWaypoint(rt) === SORTIE_EXIT ? '南門から外へ' : sortieWaypoint(rt) === SORTIE_NORTH ? '堀の外を北へ' : '砦の東を回る',
      { h: 3, guideAlways: true, guidePriority: 500 });
    rt.banner('二段で打って出る', '先の段が本隊を押し、後の段が続く');
    rt.obj('main', HI(rt) ? '組を率い、砦の東を回って北の敵を崩せ' : '南門を出て、砦の東を北へ進め', 'main');
    tennojiCue(rt, 'kakari', '法螺と早打ち。二段で出よ', F.nobuU.pos);
    rt.say('佐久間信盛', '攻めの合図じゃ！　南門を出て、東の堀を回れ！', 4);
    for (const q of F.oda) { q.seekRange = 40; }
    if (rt.player.u.group) rt.player.u.group.defMult = 1;
    for (const x of rt.squad || []) if (x.group) x.group.defMult = 1;
    for (const [q, x, delay] of [[F.saku, 42, 0], [F.ake, 50, 0], [F.nobu, 42, 12], [F.taki, 50, 12], [F.honjin.guard, 46, 20]]) {
      rt.after(delay, () => {
        if (F.step !== 3) return;
        // 門では二列に絞る。南へ出てから堀の外へ回り、北へ向かう。
        // 門前から本隊へ直進すると、砦の斜めの柵を横切ってしまう。
        march(q, [[T_GATE.x, -52], [SORTIE_EXIT.x, SORTIE_EXIT.z], [SORTIE_TURN.x, SORTIE_TURN.z], [x, -112]], 'attack');
        q.seekRange = 40;
        // 門と土橋を出るまで鉄砲は撃ち止め。列の後ろを門に残さない。
        q.fire = false;
        q.onArrive = (a) => { a.fire = true; a.ai = true; a.order = 'attack'; a.formation = 'yari'; a.yariRanks = 3; a.seekRange = 90; a.facing = Math.PI; };
      });
    }
    rt.after(16, () => { if (F.step === 3 && !F.ending) battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.nobuU.pos, F.nobu, 0, true, '二段目も旗を進め、本願寺勢を押す'); });
    for (let i = 0; i < 2; i++) { F.last[i].guard = false; F.last[i].order = 'attack'; F.last[i].seekRange = 55; }
    // 後備えも二段の攻めへ寄せる。西の遠い持ち場に残して待たせない。
    rt.after(20, () => {
      if (F.ending || F.step !== 3 || gone(F.newHand)) return;
      march(F.newHand, [[-48, -112], [24, -112]], 'attack', 0);
      F.newHand.seekRange = 60;
      rt.say('足軽', '西から新手だがや！　先の衆と食い止めるぞ！', 3);
    });
  },

  // ④ 押し戻す：崩れた本願寺勢を大坂の城戸口まで追う。城戸口の後ろには下間頼廉の本陣、木戸の脇には雑賀の鉄砲が残る
  chase(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t; F.secured = 0;
    rt.setPhase('chase');
    rt.unmark('sortieWay');
    for (let i = 0; i < F.last.length; i++) rt.unmark('sortieEnemy' + i);
    for (let i = 1; i <= 3; i++) rt.unmark('l' + i);
    battleEvent(rt, EVENT_RETREAT, KIDO, null, 1, true, '本願寺勢の旗が北の城戸口へ退く');
    if (F.sortieHelp) rt.award((t) => t.side.push('二段の攻めに加わり、本願寺勢の本隊を崩した'), '自分の働きで本隊を押し崩した');
    sfx('horagai', 0.9);
    rt.banner('本願寺勢、崩れる', '石山の城戸口へ退いていく');
    rt.say('足軽', '門徒が崩れたで！　石山へ逃げていくがや！', 3);
    rt.after(3.5, () => { if (!F.ending) rt.say('織田信長', '城戸口まで追い立てよ！　そこから先は追うでないぞ！', 3.5); });
    rt.obj('main', HI(rt) ? '組を率い、退く敵を城戸口まで追え' : '退く敵を大坂の城戸口まで追え', 'main');
    for (const [q, x] of [[F.nobu, 0], [F.saku, -12], [F.taki, 12], [F.ake, 6], [F.honjin.guard, -6]]) {
      // 北へ進んだ隊は引き返させない。まだ砦の南にいる隊だけ、堀の外の角を通す。
      const points = [];
      if (inPoly(SOTO_POLY, q.anchor.x, q.anchor.z)) {
        // 本隊が早く崩れても、出撃待ちの後段を砦の柵へ直進させない。
        points.push([T_GATE.x, -52], [SORTIE_EXIT.x, SORTIE_EXIT.z], [SORTIE_TURN.x, SORTIE_TURN.z]);
      } else if (q.anchor.z > -112 && q.order === 'path' && q.path) {
        // 土橋・東の角を歩いている列は、残りの道順を追撃へ引き継ぐ。
        points.push(...q.path.slice(q.pathIdx));
      }
      if (q.anchor.z > -112) points.push([42 + x, -112]);
      points.push([KIDO.x + x, KIDO.z + 26]);
      march(q, points, 'hold', Math.PI, 4); q.aggro = 24;
    }
    // 退く群れを一つの地点へ重ねない。木戸の両脇と後ろへ退く。
    const host = F.jinRoster[1];
    for (const [id, x, dz] of [['rairen', 34, -48], ['west', -76, -22], ['east', 76, -22], ['north', 0, -32], ['saika', -100, -7], ['rear', -6, -48], ['flank', 110, -32]]) {
      const g = host[id];
      if (!g) continue;
      const at = g.binding.pos, z = KIDO.z + dz;
      // 長い追撃でも兵を早送りしない。近い控えは従来どおりゆっくり退く。
      g.moveTo(x, z, Math.max(45, Math.hypot(x - at.x, z - at.z) / 4), { back: true });
    }
    march(F.ehon.guard, [[SHIMO.x, KIDO.z - 39]], 'hold', 0);
    march(F.ehon.general.group, [[SHIMO.x, KIDO.z - 47]], 'hold', 0);
    // 残りの手：城戸口を守る殿の門徒と、木戸の脇の雑賀の鉄砲。後ろに総大将の本陣（旗本が厚い）
    for (const g of F.kidoG) g.aggro = 30;
    F.kz = { x: KIDO.x, z: KIDO.z + 16 };
    F.chaseWay = { x: 0, z: 0 };
    rt.marker('chaseWay', () => chaseWaypoint(rt), '味方と北へ追う道',
      { h: 3, guideAlways: true, guidePriority: 500 });
    // 道中を省く前は北へ追う任務を読ませ、二キロ先の距離札を方角へ重ねない。
  },

  // 追撃の道中を省く。味方の隊・組・自分を城戸口の南へ移し、残る殿と雑賀の鉄砲と斬り合う。
  toKido(rt) {
    const F = rt.flags;
    if (F.kidoCut || F.ending || rt.over) return;
    F.kidoCut = true;
    rt.unmark('chaseWay');
    rt.obj('main', '城戸口の手前で、味方と八秒守れ', 'main');
    rt.scene.visible = false;
    rt.banner('石山の城戸口へ', '時が過ぎた。崩れた本願寺勢を、大坂の城戸口まで追い立てた');
    const W = rt.world;
    const put = (u, x, z) => {
      u.pos.x = x; u.pos.z = z; u.pos.y = W.heightAt(x, z);
      u.moveTo = null; u.target = null; u.aiT = 0;
      if (u._fortRoad) u._fortRoad.until = -1;
    };
    const shift = (g, x, z) => {
      if (gone(g)) return;
      // 道中を省いた後は、散った生存兵を四列へ集め直す。
      // 平均位置から平行移動すると、遠い敵を追った信長だけが城戸口から離れたままになる。
      const live = g.units.filter((u) => u !== P && u.alive && !u.fleeing && !u.woundOut);
      if (!live.length) return;
      const columns = Math.min(4, live.length);
      for (let i = 0; i < live.length; i++)
        put(live[i], x + (i % columns - (columns - 1) / 2) * 1.1, z + Math.floor(i / columns) * 1.4);
      if (g.anchor) { g.anchor.x = x; g.anchor.z = z; }
      g.focus = null;
    };
    const z0 = KIDO.z + 58;
    const P = rt.player.u;
    const pdx = KIDO.x - P.pos.x, pdz = z0 - P.pos.z;
    for (const g of rt.squadGroups || []) {
      for (const u of g.units) if (u !== P && u.alive && !u.fleeing && !u.woundOut) put(u, u.pos.x + pdx, u.pos.z + pdz);
      if (g.anchor) { g.anchor.x += pdx; g.anchor.z += pdz; }
    }
    put(P, KIDO.x, z0);
    rt.player.lock = null; rt.player.wheelAcc = 0;
    F.kidoMarked = true;
    rt.marker('kido', F.kz, '木戸の手前の集合場所', { h: 3, guideAlways: true, guidePriority: 500, guideRadius: 10 });
    rt.marker('nobu', () => F.nobuU.alive && !F.nobu.routed ? F.nobuU.pos : null,
      '城戸口へ進む信長の旗', { h: 3, noGuide: true });
    // 先手を自分の前へ置く。道中を省いた直後も、味方の槍の列と木戸へ向かう。
    for (const [q, x, dz] of [[F.nobu, 0, -4], [F.saku, -10, -12], [F.taki, 10, 0], [F.ake, 6, -6], [F.honjin.guard, -6, 14], [F.fgun, -4, 20], [F.rearGuard, 4, 24]]) {
      if (q && !(rt.squadGroups || []).includes(q)) shift(q, KIDO.x + x, z0 + dz);
    }
    for (const [q, x] of [[F.nobu, 0], [F.saku, -12], [F.taki, 12], [F.ake, 6]]) {
      if (gone(q)) continue;
      // 勝ち戦の勢いで気力は戻る。城戸口の手前で槍をそろえ、寄せる殿を受ける。
      q.morale = Math.max(q.morale ?? 0, 80);
      march(q, [[KIDO.x + x, KIDO.z + 26]], 'hold', Math.PI, 4); q.aggro = 24; q.seekRange = 30;
    }
    // 脇の鉄砲へ全隊を引かせず、既存の護衛を中央の集合場所へ歩かせる。
    // 主郭の護衛も移した後ろで待たせ続けない。敵を払う役は先手の四隊が担う。
    for (const [q, x] of [[F.honjin.guard, -3], [F.rearGuard, 3]]) {
      if (spent(q)) continue;
      q.morale = Math.max(q.morale ?? 0, 80);
      march(q, [[KIDO.x + x, KIDO.z + 26]], 'hold', Math.PI, 4);
      q.aggro = 6; q.seekRange = 10;
    }
    F.stepT = rt.t;
    rt.after(0.5, () => { rt.scene.visible = true; });
    rt.after(1.5, () => { if (!F.ending) rt.say('織田信長', '城戸口の殿を払え！　木戸の内へは入るな！', 3.5); });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end'); rt.objProgress('main', '');
    for (let i = 1; i <= 3; i++) { rt.unmark('l' + i); rt.unmark('k' + i); }
    rt.unmark('kido'); rt.unmark('nobu'); rt.unmark('chaseWay'); rt.unzone('kido');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '天王寺砦の囲みを破り、本願寺勢を城戸口まで押し戻した', pts: 20 }; }, '天王寺の囲みを破った');
    rt.obj('halt', '城戸口で止まれ。木戸の内へ入るな', 'order');
    tennojiCue(rt, 'tomare', '鉦の二つ打ち＝追撃を止めよ', rt.player.u.pos, 'halt');
    rt.banner('城戸口まで押し戻した', '信長は天王寺砦を救った。本願寺との戦いは続く');
    // 追撃はここで終える。残った敵へ隊が走り続け、木戸の奥へ入らない。
    for (const g of F.fighters) {
      if (spent(g)) continue;
      g.ai = false; g.path = null; g.dest = null; g.onArrive = null;
      g.order = 'hold'; g.guard = true; g.guardLeash = 6; g.noRing = true;
      g.guardOn = false; g.focus = null; g.aggro = 3; g.seekRange = 3; g.fire = false;
      for (const u of g.units) { u.target = null; u.moveTo = null; }
    }
    rt.say('佐久間信盛', '鉦の二つ打ちじゃ。追うのはここまで！　木戸の内へ入るな。砦を守り抜いたな', 5);
    // 城戸口までの追撃は済んだ。共通の終戦後の追撃を重ねず、十二秒で戦後の札へ進む。
    rt.finish({ scriptedEnd: true }, 12);
  },

  fail(rt, reason) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.tracker.main = false;
    rt.setPhase('end'); rt.objFail('main'); rt.objProgress('main', '');
    for (const id of ['relief', 'gate', 'hon', 'defend', 'reliefWait', 'nobu', 'kido', 'chaseWay', 'join', 'ra', 'ga', 'rb', 's0', 's1', 's2']) { rt.unmark(id); rt.unzone(id); }
    for (let i = 1; i <= 3; i++) { rt.unmark('l' + i); rt.unmark('k' + i); }
    const why = reason || (F.pressure >= GATE_HOLD_SECONDS ? '敵に門内を押さえられた。南へ退け' : F.step === 1 && F.nobuU.woundOut ? '信長が深手で戦えなくなった。味方と退け' : '味方の守りか攻めの列が崩れた。南へ退け');
    rt.banner('味方の備え、崩れる', why);
    rt.obj('withdraw', '味方の旗へ退け。南への退き口を保て', 'order');
    tennojiCue(rt, 'nobiki', '低い法螺貝と間を空けた退き太鼓＝退け', rt.player.u.pos, 'withdraw');
    rt.say('組頭', '低い法螺と退き太鼓じゃ！　これ以上は押せぬ。味方の旗へ引け！', 4);
    // 砦を失った結末は八秒で閉じる。共通の長い撤退へ移って門内で再び囲まれない。
    rt.finish({ scriptedEnd: true, failureReason: why }, 8);
  },

  update(rt, dt) {
    const F = rt.flags;
    // 大軍の補いは三秒ごとに動く一隊だけ。列の足元へ散らし、中央から煙を噴かせない。
    F.hostDustT = (F.hostDustT || 0) - dt;
    if (F.hostDustT <= 0 && F.hostE.length) {
      F.hostDustT = 3;
      const host = F.hostE[F.hostDustI || 0], army = host.army;
      F.hostDustI = ((F.hostDustI || 0) + 1) % F.hostE.length;
      // 遠景を省いた控えには歩みの値も幅もない。砂ぼこりだけ省き、戦の段取りは続ける。
      if (!rt.over && !F.ending && host.visible && army.U && (army.U.uMarch.value > .2 || army.rout)) {
        const lateral = Math.sin(rt.t * 1.7) * army.hw0 * .7;
        const x = host.position.x + army.cx + army.off.x + Math.cos(army.facing) * lateral;
        const z = host.position.z + army.cz + army.off.z - Math.sin(army.facing) * lateral;
        if (
          Math.hypot(x - rt.player.u.pos.x, z - rt.player.u.pos.z) < 160 &&
          !(rt.world.rainLevel > .4 || rt.world.wetness > .5) && !rt.world.inWaterAt(x, z))
          rt.world.dustCloud(x, z, false, true);
      }
    }
    for (let i = rt.markers.length - 1; i >= 0; i--) {
      const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id);
    }
    if (F.K) F.K.tick(dt);
    for (const link of F.hostLinks) {
      // 狭い曲輪へ軽い大軍を押し込まない。列を失った局地の隊も遠景で戦い続けない。
      link.light.visible = !spent(link.q) && !inPoly(SOTO_POLY, link.q.anchor.x, link.q.anchor.z);
    }
    if (F.ending || !rt.player.u.alive || rt.over) {
      if (F.shelterShown) { rt.objRemove('shelter'); rt.unmark('shelter'); F.shelterShown = false; }
      return;
    }
    if (F.step === 1 && rt.t >= (F.gunEventAt || 0)) {
      const gun = F.gunA.units.find((u) => u.alive && !u.fleeing && u.fireT > 0);
      if (gun) { F.gunEventAt = rt.t + 8; battleEvent(rt, EVENT_VOLLEY, gun.pos, F.gunA, 1, true, '雑賀の鉄砲が救援の列を撃つ'); }
    }
    if (F.step === 3) for (let i = 0; i < F.last.length; i++) {
      const q = F.last[i];
      if (!gone(q) && !q.sortieMarked && sightPoint(rt, q.anchor)) { q.sortieMarked = true; rt.marker('sortieEnemy' + i, () => q.center(), '北の本隊の旗', { red: true, group: q }); }
    }
    F.scanT = (F.scanT || 0) - dt;
    if (F.scanT > 0) return;
    const span = 0.5 - F.scanT; F.scanT = 0.5;
    if (F.fighters) nudgeMarch(F.fighters, span);
    // 寄せ手も同じ道詰まりの手当てをする。後列が止まって門前が空くのを防ぐ。
    if (F.step < 3 && F.foes) nudgeMarch(F.foes, span);
    const u = rt.player.u;
    // 半秒ごとに既存の兵だけを見る。打ち込まれる前に、指で押す構えを字幕で教える。
    if (!rt.player.guard && rt.t >= (F.guardHintAt || 0)) {
      for (const enemy of rt.army.units) {
        if (!enemy.alive || enemy.woundOut || enemy.fleeing || enemy.team === u.team ||
            enemy.target !== u || !(enemy.atk || enemy.swing) || enemy.type === 'gun' || enemy.type === 'bow') continue;
        const dx = enemy.pos.x - u.pos.x, dz = enemy.pos.z - u.pos.z;
        if (dx * dx + dz * dz > 64) continue;
        F.guardHintAt = rt.t + 8;
        rt.hud.say('組頭', '敵を向き「構え」を押せ。味方へ下がれ！', 4, true);
        break;
      }
    }
    if (rt.player.u.hp < rt.player.u.maxHp * 0.5 && !F.fieldHurtHint) {
      F.fieldHurtHint = true;
      const hit = rt.player.lastHit;
      rt.hud.say('組頭', hit && hit.ranged && rt.t - hit.t < 6
        ? '矢玉じゃ！　物陰へ退け。敵を離して傷を縛れ！'
        : '深手じゃ！　敵を向いて構え、味方の列へ退け！', 5, true);
    }
    const p = rt.player.u.pos, elapsed = rt.t - F.stepT;
    // 隊の生き残りが門外で止まっても、門前が十二秒空けば西の既存の一隊を回す。
    // 鉄砲の控えは除き、門へ来た槍兵がいる間は待つ。半秒の見回りで数えるだけ。
    let gateThreat = false;
    if (F.step === 2.5) for (const g of F.foes) {
      for (const enemy of g.units) {
        if (!enemy.alive || enemy.fleeing || enemy.woundOut || enemy.type === 'gun' || enemy.type === 'bow') continue;
        if (Math.hypot(enemy.pos.x - T_GATE.x, enemy.pos.z - T_GATE.z) < 24) { gateThreat = true; break; }
      }
      if (gateThreat) break;
    }
    F.gateQuiet = F.step === 2.5 && !gateThreat ? (F.gateQuiet || 0) + span : 0;
    // 救援の入城中は新手を足さない。深手や守備隊の退却中も寄せを重ねない。
    // 門内でまだ斬り合う敵が四人以上いる間も、新手を重ねない。
    const siegeFollowup = F.step === 2.5 && !rt.G.lord && !F.siegeFollowupSent &&
      (spent(F.ringA) || F.gateQuiet >= 12) && !spent(F.ake) && !spent(F.fgun);
    if ((F.step === 2.75 || siegeFollowup) && !F.shelterShown && rt.player.u.hp >= rt.player.u.maxHp * .5 &&
        rt.t >= F.fortWaveAt && (F.gateEnemies || 0) < 4) {
      F.fortWaveAt = rt.t + 20;
      let wave = null, nearest = Infinity;
      for (const w of F.fortWaves) {
        if (w.sent || spent(w.g) || siegeFollowup && w.g !== F.ringB) continue;
        for (const u of w.g.units) if (u.alive && !u.fleeing && !u.woundOut && u.type === 'ashigaru') {
          const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
          if (d < nearest) { nearest = d; wave = w; }
        }
      }
      if (wave) {
        const g = wave.g, road = wave.path, c = g.center();
        wave.sent = true;
        if (siegeFollowup) {
          F.siegeFollowupSent = true;
          rt.say('組頭', '西の新手が門へ回るぞ。門内で槍をそろえよ！', 4);
        }
        const side = c.x < 0 ? -38 : 38;
        road[0][0] = side; road[0][1] = c.z; road[1][0] = side;
        g.ai = false; g.guard = false; g.guardOn = false; g.noRing = true;
        g.aggro = 18; g.seekRange = 28; g.speed = 2.8;
        march(g, road, 'attack');
        // 既に南の門前か門内にいる隊は、砦の外へ引き返さない。
        g.pathIdx = inPoly(SOTO_POLY, c.x, c.z) ? 4 : c.z >= -40 ? 2 : 0;
      }
    }
    let allies = 0, invaders = 0, defenders = 0, gateEnemies = 0, gateAllies = 0;
    for (const g of F.fighters) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) allies++;
    for (const g of F.foes) for (const u of g.units) {
      if (u.alive && !u.fleeing && !u.woundOut && inPoly(SOTO_POLY, u.pos.x, u.pos.z)) {
        invaders++;
        if (insideGate(u.pos)) gateEnemies++;
      }
    }
    // 配下も守りに数える。自分は隊に含まれる場合も一人として数える。
    for (const g of rt.army.groups) if (g.team === 0) for (const u of g.units) {
      if (u !== rt.player.u && u.alive && !u.fleeing && !u.woundOut && insideGate(u.pos)) gateAllies++;
    }
    const player = rt.player.u;
    F.gateEnemies = gateEnemies;
    if (player.alive && !player.fleeing && !player.woundOut && insideGate(player.pos)) gateAllies++;
    for (const g of F.defenders) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) defenders++;
    // 救援の入城中も、実際に門内を押さえられた時間で陥落を決める。
    // 元の守備隊が退いても、配下や後詰が押し返せば猶予が戻る。
    F.pressure = (F.step === 0 || F.step === 2.5 || F.step === 1) && gateEnemies >= 4 && gateEnemies > gateAllies ? F.pressure + span : 0;
    if (F.pressure > 0 && u.hp >= u.maxHp * .5 && rt.t >= (F.invasionHintAt || 0)) {
      F.invasionHintAt = rt.t + 8;
      rt.say(rt.G.lord ? '使番' : '組頭', rt.G.lord ? '敵が門内へ！　先手と南の門へお進みください！' : '敵が門内へ！　南の門へ戻り、味方と押し返せ！', 4);
    }
    if ((allies >= 6 && allies < 12 || F.step < 3 && defenders >= 4 && defenders < 8) && !F.lineWarned) {
      F.lineWarned = true;
      rt.say('組頭', '味方の列が危うい！　組を旗のそばへ戻せ。列を切らすな', 4);
    }
    // 負けを決める猶予中も、札の更新と救援の進行は止めない。
    if (rt.canFailMission()) {
      if (F.pressure >= GATE_HOLD_SECONDS) return this.fail(rt, '敵に門内を二十秒押さえられた。南へ退け');
      if (allies < 6) return this.fail(rt, '味方の列が尽きた。南へ退け');
      // 守備隊の人数・退却だけで即座に陥落させず、上の占拠判定を使う。
      // 入城・合流後は別の持ち場へ移るため、南門の人数を敗北条件にしない。
      // 城戸口では信長の手が崩れても、ほかの隊と口を押さえれば役目は果たせる。信長本人の深手は負け。
      if (F.step >= 1 && F.nobuU.woundOut) return this.fail(rt, '信長が深手を負い、救援を続けられなくなった');
      if (F.step >= 1 && F.step < 4 && F.nobu.routed) return this.fail(rt, '信長の隊が退き、救援が崩れた。門内で味方と敵を押し返そう');
      // 本隊が崩れて追い立てに移った後は、先の二隊が退いても負けにしない。
      if (F.step === 3 && F.saku.routed && F.taki.routed) return this.fail(rt, '打って出た二隊が崩れた');
    }
    if (F.step === 2.5) {
      const remaining = Math.ceil(GATE_HOLD_SECONDS - F.pressure);
      // 後詰への下知と到着は別。到着を約束する秒数は出さず、実際の門内の持ち場へ導く。
      const direction = gateDirection(rt, GATE_REAR);
      const hold = insideGate(p) ? '門内で構えよ' : `${direction} 門内の味方へ戻れ`;
      rt.objProgress('main', F.pressure > 0 ? remaining > 0 ? `！${direction} 門内の敵を払え。あと${remaining}秒で門を奪われる` : `！${direction} 門内の敵を払え` : rt.G.lord ? '先手の列を保ち、下知を待て' : defenders < 8 ? `！${direction} 門の守りが薄い。味方と敵を押し返せ` : invaders === 0 && spent(F.ringA) ? `${hold}。救援の合図を待て` : insideGate(p) ? '門を出ず、味方と敵を迎え撃て' : `${hold}。味方と敵を迎え撃て`);
      // 自分か配下が門の敵を倒し、囲みを押し返せば後詰との呼応を早める。
      // 守り切るだけでも従来の時間で進む。討取りを必須にしない。
      // 守備隊が半数ほどか、どちらかの列が退いた時に後詰へ下知。到着や合流の条件は保つ。
      if (elapsed >= 90 || (elapsed >= 45 && (defenders < 12 || F.ake.routed || F.fgun.routed)) || (elapsed >= (F.gateHelp ? 30 : 45) && spent(F.ringA) && invaders === 0)) this.breakIn(rt);
    } else if (F.step === 1) {
      let threat = 0;
      for (const g of F.breakGroups) for (const u of g.units) {
        // 入城を塞ぐ敵だけを数える。柵の脇に残る囲みは、合流後の再攻撃で押し返す。
        if (u.alive && !u.fleeing && !u.woundOut &&
            (insideGate(u.pos) || Math.abs(u.pos.x - T_GATE.x) <= 6 &&
              u.pos.z >= T_GATE.z - 2 && u.pos.z < T_GATE.z + 18) &&
            !rt.army.wallBetween(u.pos, -1, GATE_REAR, false)) threat++;
      }
      F.entryThreat = threat;
      let reliefNear = 0, available = 0;
      for (const g of F.relief) if (!gone(g)) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) { available++; if (Math.hypot(u.pos.x - T_GATE.x, u.pos.z - T_GATE.z) < 28) reliefNear++; }
      const need = Math.min(6, Math.ceil(available / 2));
      const c = F.nobuU.pos;
      F.secured = need > 0 && reliefNear >= need && threat === 0 && Math.hypot(c.x - T_GATE.x, c.z - T_GATE.z) < 60 ? F.secured + span : 0;
      const reliefDistance = Math.ceil(Math.hypot(c.x - T_GATE.x, c.z - T_GATE.z) / 5) * 5;
      rt.objProgress('main', F.pressure > 0 ? `！${gateDirection(rt, GATE_REAR)} 門内の敵を払え。あと${Math.max(0, Math.ceil(GATE_HOLD_SECONDS - F.pressure))}秒で門を奪われる`
        : threat > 0 ? rt.G.lord ? '先手と南門へ。敵を押し返せ'
          : !insideGate(p) ? `${gateDirection(rt, GATE_REAR)} 門内の味方へ戻り、敵を迎え撃て`
          : reliefDistance > 20 ? `救援は門まで約${reliefDistance}歩。門内で迎え撃て`
          : '救援が門前へ。門内の敵を味方と押し返せ'
        : F.secured > 0 ? `門前を守る あと${Math.max(0, Math.ceil(8 - F.secured))}秒`
        : rt.G.lord ? `南の門へ進め。門前の味方 ${reliefNear}／${need}人`
        : reliefDistance > 20 ? insideGate(p) ? `救援まで約${reliefDistance}歩` : `${gateDirection(rt, GATE_REAR)} 南の門内へ戻れ。救援が来る`
          : `${gateDirection(rt, GATE_REAR)} 門内を守れ。門前の後詰 ${reliefNear}／${need}人`);
      if (F.secured >= 8) this.inFort(rt);
      else if (elapsed >= 180) this.fail(rt, '後詰が砦へ入れなかった。味方と南へ退け');
    } else if (F.step === 2 || F.step === 2.75) {
      const d = Math.hypot(p.x - F.gz.x, p.z - F.gz.z);
      let inside = 0, available = 0;
      for (const g of F.fighters) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) available++;
      if (available < 6) return this.fail(rt, '列を組む兵が足りぬ。味方と退け');
      for (const g of F.fighters) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut && inPoly(SOTO_POLY, u.pos.x, u.pos.z)) inside++;
      }
      // 信長と戦える六人が入れば合流。門外を固める馬廻の半数までは待たない。
      // 信長が門口（土橋の内の端）まで来れば入城とみなす。狭い門で後列を待って止めない。
      const nobuIn = inPoly(SOTO_POLY, F.nobuU.pos.x, F.nobuU.pos.z) ||
        Math.hypot(F.nobuU.pos.x - T_GATE.x, F.nobuU.pos.z - T_GATE.z) < 6;
      const playerIn = d < 10 && inPoly(SOTO_POLY, p.x, p.z);
      const joined = playerIn && nobuIn && inside >= 6;
      // 自分が門から一歩離れても、救援の入城待ちを数え直さない。
      F.joinWait = !nobuIn || inside < 6 ? (F.joinWait || 0) + span : 0;
      // 出血中の遊び手へ、手当てと同時に出撃の秒読みを出さない。
      // 待つのは合流後の四十五秒まで。手当てができなくても戦は進む。
      const treating = F.step === 2.75 && elapsed < 45 && !rt.G.lord &&
        rt.player.treatmentLeft > 0 && rt.player.treatmentNext <= rt.t &&
        (u.hp < u.maxHp * .5 || u.wounds?.bleed > .0001);
      const reliefDistance = Math.ceil(Math.hypot(F.nobuU.pos.x - T_GATE.x, F.nobuU.pos.z - T_GATE.z) / 10) * 10;
      rt.objProgress('main', treating ? '出撃前に奥の護衛へ退き、血を止めよ' : !playerIn ? `${gateDirection(rt, F.gz)} 番所の裏の印へ。あと${Math.ceil(d)}歩` : !nobuIn ? reliefDistance > 10 ? `ここで待て。信長は門まで約${reliefDistance}歩` : 'ここで待て。門の真ん中を空けよ' : inside < 6 ? `門の内の味方 ${inside}／六人。道を空けよ` : F.step === 2 ? '味方がそろった。門内で合流せよ' : `門内で列を保て。出撃まで${Math.max(0, Math.ceil(12 - elapsed))}秒`);
      // 救援が戦えない時も、門で延々と待たせない。勝ちにはせず退く下知を出す。
      if (F.joinWait >= 120) return this.fail(rt, '救援が砦へ入れぬ。列を保って南へ退け');
      // 入城がそろえば合流。列を整える十二秒は次の段で一度だけ待つ。
      if (joined && F.step === 2) this.regroup(rt);
      else if (joined && F.step === 2.75 && elapsed >= 12 && !treating) this.sortie(rt);
    } else if (F.step === 3) {
      let broken = true;
      for (const q of F.last) if (!spent(q)) broken = false;
      let seen = null;
      for (const q of F.last) if (!spent(q) && sightPoint(rt, q.anchor)) { seen = q; break; }
      if (!inPoly(SOTO_POLY, p.x, p.z) && p.x >= 34 && p.z <= -104) F.sortieClear = true;
      const way = sortieWaypoint(rt);
      // 柵越しに敵が見えても、先に南門と東の角へ導く。
      rt.objProgress('main', way ? `${gateDirection(rt, way)} ${way === SORTIE_EXIT ? '南門を出て土橋を渡れ' : way === SORTIE_NORTH ? '逆茂木を避け、堀の外を北へ' : '東の印へ。堀の外を回れ'}`
        : seen ? `${gateDirection(rt, seen.anchor)} 敵の旗まで約${Math.ceil(Math.hypot(seen.anchor.x - p.x, seen.anchor.z - p.z) / 5) * 5}歩。味方と進め`
          : '砦の東を北へ進め。味方と敵を押し返せ');
      if (broken) this.chase(rt);
    } else if (F.step === 4) {
      // 城戸口は二・五キロ先。追い立てを少し見せたら、時を進めて城戸口の手前へ移る。
      const exit = !F.kidoCut ? sortieWaypoint(rt) : null;
      if (!F.kidoCut && !exit && rt.t - F.stepT >= 20 && Math.hypot(p.x - F.kz.x, p.z - F.kz.z) > 200) return this.toKido(rt);
      let threat = 0, near = 0;
      for (const g of F.foes) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - F.kz.x, u.pos.z - F.kz.z) < 18) threat++;
      }
      for (const g of F.fighters) for (const u of g.units) {
        if (u.alive && !u.fleeing && !u.woundOut && Math.hypot(u.pos.x - F.kz.x, u.pos.z - F.kz.z) < 30) near++;
      }
      const d = Math.hypot(p.x - F.kz.x, p.z - F.kz.z);
      // 道中を自分で歩いて来た場合にも、城戸口の手前で印を出す。
      if (!F.kidoMarked && d <= 200) {
        F.kidoMarked = true;
        rt.marker('kido', F.kz, '木戸の手前の集合場所', { h: 3, guideAlways: true, guidePriority: 500, guideRadius: 10 });
      }
      // 先手と守備隊が口を押さえれば追撃の役目は済む。
      // 信長一人の位置まで待つと、敵を払った後も下知だけが残り、共通の時間切れで負けてしまう。
      // 本人・味方六人・敵不在の八秒は必要。信長の深手による敗北は上の判定で保つ。
      F.secured = d < 10 && threat === 0 && near >= 6 ? F.secured + span : 0;
      rt.objProgress('main', !F.kidoCut ? `${gateDirection(rt, F.kz)} 崩れた敵を北へ追え。味方と進め` : d > 100 ? `城戸口まで約${Math.ceil(d / 100) * 100}歩。味方と北へ進め` : d >= 10 ? '城戸口の手前の印へ。木戸内へ入るな' : threat > 0 ? '城戸口に残る敵を、味方と払え' : near < 6 ? `集まった味方 ${near}／六人。ここで構えよ` : `木戸内へ入るな。あと${Math.max(0, Math.ceil(8 - F.secured))}秒守れ`);
      if (F.secured >= 8) this.win(rt);
    }
    // 再攻撃は二隊とも退くと敗れる。信長の隊だけでなく、先の二段の危険も知らせる。
    this.sortieWarning(rt);
    // 自分の体力だけでは分からない敗北の危険を、崩れる前から任務の札へ出す。
    // 新しい札は増やさず、退避の案内と門の占拠警告を優先する。
    F.reliefRisk = false;
    if (F.breakDone && F.step < 4 && !F.ending && !F.nobu.routed && !F.shelterShown && F.pressure <= 0) {
      let ready = 0;
      for (const mate of F.nobu.units) if (mate.alive && !mate.fleeing && !mate.woundOut) ready++;
      if (F.nobu.morale < 60 || ready <= Math.ceil(F.nobu.initial * .75)) {
        F.reliefRisk = true;
        const action = rt.G.lord ? '先手の列へ戻れ' : F.step === 3 ? '味方と敵を押し返せ' : '門内から敵を押せ';
        // 門と堀を回る間は見出しの道順と組にし、柵越しへ直進させない。
        if (F.step !== 3 || !sortieWaypoint(rt)) rt.objProgress('main', '！信長の列が危うい。' + action);
        if (rt.t >= (F.reliefWarnAt || 0)) {
          F.reliefWarnAt = rt.t + 8;
          rt.say('使番', '信長の列が崩れれば、救援は続けられぬ！　' + action + '！', 4);
        }
      }
    }
    this.cover(rt);
  },

  sortieWarning(rt) {
    const F = rt.flags;
    if (F.step !== 3 || F.ending || F.shelterShown || rt.over) return;
    // 半秒の見回りで既存の二隊だけを数える。兵や印を足さず、退避と門からの道案内を保つ。
    for (let i = 0; i < 2; i++) {
      const q = i === 0 ? F.saku : F.taki, other = i === 0 ? F.taki : F.saku;
      if (spent(q)) continue;
      let ready = 0;
      for (const u of q.units) if (u.alive && !u.fleeing && !u.woundOut) ready++;
      if (!other.routed && q.morale >= 50 && ready > Math.ceil(q.initial * .65)) continue;
      const name = i === 0 ? '一段目' : '二段目';
      const action = `${gateDirection(rt, q.center())} ${name}の旗へ。味方と構えよ`;
      if (!sortieWaypoint(rt)) rt.objProgress('main', '！' + action);
      if (rt.t >= (F.sortieWarnAt || 0)) {
        F.sortieWarnAt = rt.t + 8;
        rt.say('使番', other.routed
          ? `片方の段が退いた！　${name}も崩れれば負ける。味方と槍をそろえよ！`
          : `${name}の列が危うい！　二段とも退けば攻めは続かぬ。味方を離れるな！`, 4);
      }
      break;
    }
  },

  // 柵そのものが射線を遮る。曲輪全体の防御上げや傷の回復はしない。
  cover(rt) {
    const F = rt.flags, u = rt.player.u;
    if (!u.alive) return;
    const g = u.group; let sq = null;
    for (const x of rt.squad || []) if (x.alive) { sq = x; break; }
    const k = 1; // 傷は射線・柵・鎧で決める。曲輪全体を防具にしない。
    if (g) g.defMult = k;
    if (sq && sq.group && sq.group !== g) sq.group.defMult = k;
    const canTreat = rt.player.treatmentLeft > 0;
    const waiting = canTreat && rt.player.treatmentNext > rt.t;
    // 打って出た後は、砦へ一人で戻さず、生きている味方の列の後ろへ退く。
    // 半秒の見回りで行き先だけ書き替え、兵や道の入れ物は増やさない。
    const field = F.step >= 3, rest = field ? F.fieldRest : SHELTER;
    const fieldSheltered = field && rt.player.treatmentShelter(u.pos);
    // 十字の印は、敵との隔たり・戦える護衛・途中の足場を調べた場所。
    // 自動操作と任務の印もこれを使い、別の列を追って歩き続けない。
    const treatment = field && !rt.G.lord && canTreat && (u.hp < u.maxHp * .5 || u.wounds?.bleed > .0001)
      ? rt.hud.retreatDestination(rt, null, true) : null;
    if (treatment?.valid) { rest.x = treatment.x; rest.z = treatment.z; }
    if (field && !treatment?.valid && !(F.shelterArrived && fieldSheltered && Math.hypot(rest.x - u.pos.x, rest.z - u.pos.z) < 6)) {
      let best = Infinity;
      // 列が崩れた時も、遠い無人の砦へ引き返す印にはしない。
      rest.x = u.pos.x; rest.z = u.pos.z;
      for (const q of F.oda) {
        let z = 0, n = 0;
        if (q.routed) continue;
        for (const mate of q.units) if (mate.alive && !mate.fleeing && !mate.woundOut) {
          z += mate.pos.z; n++;
        }
        if (n < 3) continue;
        z /= n;
        // 隊の平均から六メートルでは護衛の間合いを外れる。
        // 北へ進む列の後ろの実際の兵から四メートルに寄せる。
        for (const mate of q.units) {
          if (!mate.alive || mate.gone || mate.fleeing || mate.woundOut || mate.rearWound || mate.downed ||
              mate.stagger > 0 || mate.hp < mate.maxHp * .35 || mate === u || mate.pos.z < z) continue;
          const rx = mate.pos.x, rz = mate.pos.z + 4;
          if (inPoly(SOTO_POLY, rx, rz)) continue;
          const d = Math.hypot(rx - u.pos.x, rz - u.pos.z);
          if (d < best && rt.world.walkable(rx, rz, groundAt(rt.world, rx, rz, mate.pos.y))) {
            best = d; rest.x = rx; rest.z = rz;
          }
        }
      }
    }
    // 止血後も囲みを抜けるまでは案内する。合流の下知が出たら門の任務へ戻す。
    // 城戸口でも布が残る出血は先に止める。止血後は口を押さえる任務へ戻す。
    const hurt = !rt.G.lord && F.step <= 4 && (F.step < 4 || canTreat && u.wounds?.bleed > .0001) && (u.hp < u.maxHp * .5 || canTreat && u.wounds?.bleed > .0001) &&
      (canTreat || field || F.step === 0 || F.step === 2.5 || F.step === 1);
    if (hurt) {
      // 自動操作が止まる護衛の後ろと、画面で手当てを案内する場所をそろえる。
      const distance = Math.hypot(u.pos.x - rest.x, u.pos.z - rest.z);
      const arrived = field ? fieldSheltered && (distance < 4 || F.shelterArrived && distance < 6)
        : distance <= 2 || distance < 6 && rt.player.treatmentShelter(u.pos);
      F.shelterArrived = arrived;
      const retreat = field ? `${u.hp < u.maxHp * .5 ? '傷が深い' : '血が出ている'}。味方の列の後ろへ退け`
        : u.hp < u.maxHp * .5 ? '傷が深い。奥の護衛へ退け' : '血が出ている。奥の護衛へ退け';
      if (!F.shelterShown) {
        F.shelterShown = true;
        rt.obj('shelter', retreat, 'order');
        // 直線では小屋や主郭の柵へ向く。兵も使う門と道の曲がり角を案内する。
        rt.marker('shelter', () => F.shelterArrived ? u.pos : fortMoveWay(rt.army, u, F.step >= 3 ? F.fieldRest : SHELTER), () => {
          return F.shelterArrived
            ? rt.player.treatmentReady ? 'ここで手当て' : '止まって味方を待つ'
            : F.step >= 3 ? '味方の列の後ろへ' : '奥の護衛への道';
        },
          { h: 2, guideAlways: true, guidePriority: 600, routeDistance: () => {
            if (F.shelterArrived) return 0;
            // 次の角までの一メートルを、護衛までの残りと誤読させない。
            const way = fortMoveWay(rt.army, u, F.step >= 3 ? F.fieldRest : SHELTER);
            return Math.hypot(u.pos.x - way.x, u.pos.z - way.z) + (way.tailDistance ?? 0);
          } });
      }
      const text = !arrived ? retreat
        : !canTreat ? field ? '傷を守り、味方の後ろで進め' : '護衛の後ろで構え、味方を待て'
          : rt.player.treatmentReady ? '止まって手当てをする' : field ? '味方の後ろで止まり、傷を守れ' : '護衛の後ろで止まり、味方を待て';
      if (rt.objectives.find((o) => o.id === 'shelter')?.text !== text) rt.obj('shelter', text, 'order');
      rt.objProgress('shelter', !arrived
        ? `${gateDirection(rt, fortMoveWay(rt.army, u, rest))} ${field ? '構えて味方の列の後ろへ' : '構えて退け。門を通って奥へ'}`
        : !canTreat ? field ? '北の敵は味方に任せ、列の後ろを進め' : '傷は残る。護衛の後ろで構え、味方を待て'
          : waiting ? `次の布まで${Math.ceil(rt.player.treatmentNext - rt.t)}秒。味方の後ろで構えよ`
          : rt.player.treatmentReady ? '「手当て」を三秒長押し。血を止める' : 'ここも安全とは限らない。敵を離し、動かず待て');
    } else if (F.shelterShown) {
      rt.objRemove('shelter'); rt.unmark('shelter'); F.shelterShown = false;
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (F.ending || v.team !== 1 || !k || !(k.isPlayer || k.isSub || rt.squad.includes(k))) return;
    if (F.step === 2.5 && v.group === F.ringA && Math.hypot(v.pos.x - T_GATE.x, v.pos.z - T_GATE.z) < 24) F.gateHelp = true;
    if (F.step === 3 && F.last.includes(v.group)) F.sortieHelp = true;
  },
  // 隊の崩れは共通の使番に任せ、同じ知らせを重ねない。
};

// 史料に人数がある後詰だけを数える。人数不明の守備隊を足して四千と断定しない。
// 局地の死者から全軍の残数を逆算しない。戦う兵と遠景の人数はこの値で変えない。
tennoji.force = (rt) => {
  return { a: 3000, a0: 3000, b: 15000, b0: 15000 };
};
tennoji.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '本願寺勢', mon: 'sagarifuji' } };
// 将の進退はこの戦で扱う。共通の総大将採用による信長の体力三倍化を受けない。
// 頼廉の討死を勝ちの形にしない。城戸口で追い討ちを止める。
tennoji.taisho = { a: { name: '織田信長', def: true }, b: { name: '下間頼廉', def: true } };
tennoji.date = () => '天正四年五月七日　初夏';
tennoji.canSkip = (rt) => (rt.over && rt.flags.ending && rt.tracker.main === true ? '戦後の札へ進む' : rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
tennoji.skip = (rt) => { if (rt.over && rt.flags.ending && rt.tracker.main === true) rt.endT = 0; else if (rt.phase === 'brief') tennoji.siege(rt); };
tennoji.history = '『信長公記』巻九による。五月三日、木津砦を攻めた三好康長・根来衆・和泉衆と原田直政らは、楼の岸から出た本願寺勢の鉄砲に敗れ、直政は討死した。天王寺砦は明智光秀・佐久間信栄、検使の猪子兵介・大津伝十郎と江州衆が守った。信長は五月五日に若江へ入り、七日、約三千を三段に備えて約一万五千の敵へ住吉口から攻めかかった。信長自身も先手の足軽に交じり、足に鉄砲傷を負いながら砦へ入った。守備隊と合流し、なお退かない敵へ二段に立て直して再攻撃。大坂の城戸口まで追い、二千七百余を討ったと記す。兵数には諸説あり、砦の位置は月江寺付近ともいう。本願寺までの約二〜三千歩を、配置では約二・五千歩の隔たりとして保つ。方角と道の細かな位置は推定。細かな縄張り・籠城の秒数は推定で、一斉射は局地の鉄砲戦を表す。空模様は同条に記載がない。砦の守備兵数は不明で、後詰の約三千には含めない。兵力の数値は人数の記された後詰だけを示し、各備への割り振りは推定。検使二人の持ち場と槍兵の姿は遊びの補完。昼の明るさ、兵の小組、待つ長さは推定。二番の伊賀伊賀守は本文の呼び名を使い、安藤守就と同一とは断定しない。下間頼廉の局地の指揮・本陣位置と、東側を回る反撃の道は復元。十の付城による包囲と、その後の戦いはこの日の追撃とは分ける。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる）
tennoji.lordAt = { x: 80, z: 20, r: 12, why: '信長の手（信長は自ら先頭に立ち、天王寺砦へ打ち入った）' };

// 試し役の通り道。主郭・外曲輪の口と、兵舎を避ける角を結ぶ。
// 柵越しに突けることと、柵を歩いて越せることは別。味方の柵も道を遮る。
const BOT_ROAD = [
  [-10.5, -84], [3, -84], [-10.5, -75], [-4, -74], [-4, -70],
  [9, -71], [5, -70],
  [-4, -64], [2, -60], [-9, -60], [-9, -72], [17, -84],
  [0, -52], [0, -46], [0, -40], [SORTIE_EXIT.x, SORTIE_EXIT.z],
  // 東南の櫓の柱と斜めの柵の間から、門内の広場へ戻る角。
  [20, -56], [19, -50.5], [17, -49], [12, -48],
  [-38, SORTIE_EXIT.z], [-38, -54], [-38, -84], [-38, -110],
  [SORTIE_TURN.x, SORTIE_TURN.z], [38, -54], [38, -84], [38, -110], [0, -110],
  // 新しい小屋の戸口と、土橋を避けて西の物見へ向かう道。
  [-10, -64], [-20, -64], [-20, -73.1], [-17, -73.1], [8, -79.1],
  [-7, -46], [-15, -54], [15, -57], [-17, -66.5], [-4, -76.5],
].map(([x, z]) => ({ x, z }));
function roadSolidDistance(s, x, z) {
  if (s.k === 'r') {
    const dx = x - s.x, dz = z - s.z;
    const lx = dx * s.c - dz * s.s, lz = dx * s.s + dz * s.c;
    return Math.hypot(Math.max(0, Math.abs(lx) - s.hw), Math.max(0, Math.abs(lz) - s.hd));
  }
  if (s.k === 'c') return Math.hypot(x - s.x, z - s.z) - s.r;
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) - s.r;
}
function botRoadClear(b, a, q) {
  for (const s of b.army.structs) if (s.alive && s.seg && !s.opened && segHit(a.x, a.z, q.x, q.z, s.seg) >= 0) return false;
  const n = Math.max(1, Math.ceil(Math.hypot(q.x - a.x, q.z - a.z) / 0.5));
  for (let i = 1; i <= n; i++) {
    const x = a.x + (q.x - a.x) * i / n, z = a.z + (q.z - a.z) * i / n;
    if (!b.world.walkable(x, z)) return false;
    for (const s of b.army.solids || []) {
      if (s.struct && (!s.struct.alive || s.struct.opened)) continue;
      if (x < s.x0 - 0.7 || x > s.x1 + 0.7 || z < s.z0 - 0.7 || z > s.z1 + 0.7) continue;
      const d = roadSolidDistance(s, x, z);
      // 実際の当たりは徒歩0.45。柱に触れている時も、柱から離れる道は使える。
      // 安全幅0.7の内側を全部ふさぐと、押し戻された位置から一歩も出られない。
      if (d < 0.7 && d <= roadSolidDistance(s, a.x, a.z) + 1e-6) return false;
    }
  }
  return true;
}
function fortWay(army, u, x, z) {
  const b = army._fortRoadContext || (army._fortRoadContext = { army, world: army.world }), n = BOT_ROAD.length;
  let R = u._fortRoad;
  if (!R) {
    R = u._fortRoad = { x, z, gx: x, gz: z, until: -1, goal: { x, z }, dist: new Float64Array(n), first: new Int16Array(n), used: new Uint8Array(n) };
  }
  if (!army._fortRoadEdges) {
    const edges = army._fortRoadEdges = new Float64Array(n * n);
    edges.fill(Infinity);
    // 道のつながりは全員で使い回す。道順の作り直しは半秒に一度まで。
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (botRoadClear(b, BOT_ROAD[i], BOT_ROAD[j])) {
      edges[i * n + j] = edges[j * n + i] = Math.hypot(BOT_ROAD[i].x - BOT_ROAD[j].x, BOT_ROAD[i].z - BOT_ROAD[j].z);
    }
  }
  const edges = army._fortRoadEdges;
  if (army.time >= R.until || Math.hypot(x - R.gx, z - R.gz) > 1 || Math.hypot(u.pos.x - R.x, u.pos.z - R.z) < 0.8) {
    R.until = army.time + 0.5; R.gx = x; R.gz = z; R.goal.x = x; R.goal.z = z;
    R.x = x; R.z = z; R.tailDistance = 0;
    if (!botRoadClear(b, u.pos, R.goal)) {
      R.used.fill(0);
      for (let i = 0; i < n; i++) {
        R.dist[i] = botRoadClear(b, u.pos, BOT_ROAD[i]) ? Math.hypot(u.pos.x - BOT_ROAD[i].x, u.pos.z - BOT_ROAD[i].z) : Infinity;
        R.first[i] = R.dist[i] < 0.8 ? -1 : i;
      }
      let best = Infinity, next = -1;
      for (let k = 0; k < n; k++) {
        let v = -1, d = Infinity;
        for (let i = 0; i < n; i++) if (!R.used[i] && R.dist[i] < d) { v = i; d = R.dist[i]; }
        if (v < 0 || d >= best) break;
        R.used[v] = 1;
        const end = Math.hypot(x - BOT_ROAD[v].x, z - BOT_ROAD[v].z);
        if (d + end < best && botRoadClear(b, BOT_ROAD[v], R.goal)) { best = d + end; next = R.first[v]; }
        for (let j = 0; j < n; j++) if (!R.used[j] && d + edges[v * n + j] < R.dist[j]) {
          R.dist[j] = d + edges[v * n + j]; R.first[j] = R.first[v] < 0 ? j : R.first[v];
        }
      }
      if (next >= 0) {
        R.x = BOT_ROAD[next].x; R.z = BOT_ROAD[next].z;
        R.tailDistance = Math.max(0, best - Math.hypot(u.pos.x - R.x, u.pos.z - R.z));
      }
    }
  }
  return R;
}

function fortRunnerWay(army, u, want) {
  if (!u.group?.isRunner) return want;
  return fortWay(army, u, want.x, want.z);
}
function nearFort(x, z) {
  return Math.abs(x) < 32 && z < -28 && z > -100;
}
function fortMoveWay(army, u, want) {
  // 砦の近くだけ道を探す。遠い野戦の兵には余分な判断をさせない。
  // 両端が門外でも、間の線が砦を横切る退却は道を探す。
  if (!u.group?.isRunner && !nearFort(u.pos.x, u.pos.z) && !nearFort(want.x, want.z) &&
      (Math.min(u.pos.x, want.x) >= 32 || Math.max(u.pos.x, want.x) <= -32 ||
       Math.min(u.pos.z, want.z) >= -28 || Math.max(u.pos.z, want.z) <= -100)) return want;
  if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 0.8) return want;
  return fortWay(army, u, want.x, want.z);
}
// 砦の南から北の敵へ向かう時は、味方の列と同じく堀の外（東か西の角）を回る。砦の柵を横切らない。
function botAround(u, x, z) {
  if (u.pos.z > FORT.z + 12 && z < FORT.z - 4 && Math.abs(u.pos.x - FORT.x) < 34) {
    const sx = x >= FORT.x ? 1 : -1;
    return [FORT.x + sx * SORTIE_TURN.x, SORTIE_EXIT.z];
  }
  return [x, z];
}
function botWalk(p, inp, x, z, r, goTo) {
  const want = p.u._fortGoal || (p.u._fortGoal = { x, z });
  want.x = x; want.z = z;
  // 北の長い道では砦の曲がり角を探さない。行き先の入れ物も使い回す。
  const R = fortMoveWay(p.rt.army, p.u, want);
  // 同じ入れ物で曲がり角をもう一度探し、元の行き先を上書きしない。
  goTo(p, inp, R.x, R.z, R.x === x && R.z === z ? r : 0.6, true);
}
// 道順を保ったまま、打ち込む相手へ構える。
function botFaceWalking(p, inp, e) {
  const walkYaw = p.yaw, walking = inp.k.has('KeyW');
  p.yaw = Math.atan2(e.pos.x - p.u.pos.x, e.pos.z - p.u.pos.z);
  if (p.lock && p.lock !== e) inp.e.add('KeyQ');
  if (!walking) return;
  inp.k.delete('KeyW');
  const da = walkYaw - p.yaw;
  if (Math.abs(Math.cos(da)) > 0.3) inp.k.add(Math.cos(da) > 0 ? 'KeyW' : 'KeyS');
  if (Math.abs(Math.sin(da)) > 0.3) inp.k.add(Math.sin(da) > 0 ? 'KeyA' : 'KeyD');
}

// 素直な遊び手：囲みの兵と戦い、砦の門に入り、打って出て本願寺勢と戦う
// 人ごとの突進で、門を通る道順と深手の退避を上書きしない。
tennoji.botOrders = true;
// 共通の直線退避では柵に詰まる。危険時も砦の門と兵舎を回る。
tennoji.botDefendsFort = true;
// 矢玉の避け足も、櫓の柱・兵舎・切岸を越える向きには出さない。
tennoji.botCoverBlocked = (b, a, q) => !botRoadClear(b, a, q);
// 味方も柵へ向かって逃げず、南の門を通って若江道へ退く。
tennoji.withdrawRoute = (rt, g) => {
  if (g.team !== 0) return null;
  const c = g.center();
  if (c.x < -32) return [[-38, c.z], [-38, 55], [-145, 55]];
  return inPoly(SOTO_POLY, c.x, c.z)
    ? [[0, -52], [0, -30], [38, -30], [145, 55]]
    : [[38, -30], [145, 55]];
};
// 決着後も、砦の柵と兵舎を避けて南の退き口から若江道へ離れる。
tennoji.botWithdraw = (b, inp, { goTo }) => botWalk(b.player, inp, 145, 55, 3, goTo);
tennoji.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 息切れの休みと傷の手当ては、互いの終了条件で打ち切らない。
  if (p.sta < p.maxSta * 0.25) F.botStaminaRest = true;
  if (F.botStaminaRest && p.sta > p.maxSta * 0.75) F.botStaminaRest = false;
  const siege = F.step === 0 || F.step === 2.5 || F.step === 2.75;
  const holdingFort = siege || !b.G.lord && F.step === 1;
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  const canFight = (o) => o.alive && o.team !== u.team && !o.fleeing && !o.woundOut && !o.noTarget && !o.isStruct &&
    o.type !== 'dummy' && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos,
      p.weapon === 'spear' && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < reach);
  let attacker = null, ad = 8, close = 0;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.team === u.team || o.fleeing || o.woundOut || o.noTarget || o.isStruct ||
        o.type === 'dummy' || o.type === 'gun' || o.type === 'bow' || Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    // 予兆の一覧は前のコマのもの。受け流して消えた振りを追い続けない。
    if (!(o.atk?.target === u && !o.atk.bow) && !(o.swing && !o.swing.done && o.swing.target === u) &&
        !(o.charging && o.target === u)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // こちらの槍が届かなくても、敵の長い槍は柵越しに届く。敵の間合いで受けを決める。
    const over = (o.wpnKind || o.lookWeapon || o.weapon) === 'spear' && d < o.reach;
    if (b.army.wallBetween(o.pos, -1, u.pos, over)) continue;
    // 敵の槍が届く所では受ける。遠い予兆で門への歩みを止めない。
    if (d < Math.max(reach, o.reach + 0.35) && d < ad) { attacker = o; ad = d; }
  }
  for (const o of b.army.units) if (o.team !== u.team && o.type !== 'gun' && o.type !== 'bow' &&
      Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 5 && canFight(o) &&
      // 包囲は敵から実際に打てるかで数える。自分の槍が柵越しに届くこととは別。
      !b.army.wallBetween(o.pos, -1, u.pos, (o.wpnKind || o.lookWeapon || o.weapon) === 'spear' &&
        Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < o.reach)) close++;
  // 布は残りと待ち時間で判断する。一枚目を巻いた印で二枚目を封じない。
  const canTreat = p.treatmentLeft > 0 && p.treatmentNext <= b.t && !p.mounted;
  if ((u.hp < u.maxHp * 0.5 || u.wounds?.bleed > .0001) && canTreat && !F.botTreatRest && b.t >= (F.botTreatRetryAt || 0)) {
    F.botTreatRest = true; F.botRestT = b.t;
  }
  if (F.botTreatRest && (!canTreat || b.t - F.botRestT >= 45)) {
    F.botTreatRest = false;
    // 手当てできない場所で固まり続けず、少し間を空けて退避を試す。
    F.botTreatRetryAt = b.t + (canTreat ? 8 : 0);
  }
  b.botRest = !!(F.botStaminaRest || F.botTreatRest);
  // 打って出た後の深手は、一人で前へ出ず味方の列の後ろで受ける。
  const weak = F.step >= 3 && u.hp < u.maxHp * 0.45;
  if (u.mobbed || (close >= 3 && b.army.playerSupport < close) || (weak && close >= 2) ||
      (close && p.sta < p.maxSta * 0.22)) F.botRetreatUntil = b.t + 2;
  // 守る門を離れて組ごと奥へ戻り続けない。門内で槍をそろえ、退避時は組も呼ぶ。
  // 止血しても深手は残る。救援と合流する下知までは、門へ戻って斬り合いを再開しない。
  const fortWounded = !b.G.lord && (F.step === 0 || F.step === 2.5 || F.step === 1) && u.hp < u.maxHp * .5;
  const retreating = b.botRest || fortWounded || F.botRetreatUntil > b.t;
  const atGate = holdingFort && Math.hypot(u.pos.x - T_GATE.x, u.pos.z - (T_GATE.z - 3)) < 2;
  const order = !retreating && atGate ? 'yari' : 'follow';
  if (b.squad?.length && (b.t >= (F.botOrderAt || 0) || retreating && !F.botWasRetreating) &&
      b.squadGroups?.some((g) => g.order !== order)) {
    inp.quickCmd = order; F.botOrderAt = b.t + 10;
    if (order === 'yari') p.yaw = 0;
  }
  F.botWasRetreating = retreating;
  const c = F.nobu.center();
  if (retreating) {
    inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
    const foe = attacker || b.army.nearestEnemy(u, 6, canFight);
    if (F.botTreatRest && p.treatmentReady && !foe) { if (p.lock) inp.e.add('KeyQ'); inp.k.add('KeyE'); return; }
    // 信長の前線を追って休まず、門を通って守備隊のいる砦へ戻る。
    const fortRest = !b.G.lord && F.step < 3;
    // 護衛の後ろへ着いたら足を止める。安全な場所を通り過ぎて、指定の一点へ歩き続けない。
    if (fortRest && !foe && Math.hypot(u.pos.x - SHELTER.x, u.pos.z - SHELTER.z) < 6 && p.treatmentShelter(u.pos)) return;
    if (F.step >= 3 && F.botTreatRest && !foe && p.treatmentShelter(u.pos)) return;
    // 城戸口では砦まで戻らず、信長の旗の後ろへ下がる。
    if (F.step === 3 || F.step === 4 && F.shelterShown) {
      botWalk(p, inp, F.fieldRest.x, F.fieldRest.z, 2, goTo);
    } else if (F.step === 4 && F.kidoCut) {
      const c = F.nobuU.alive && !F.nobu.routed ? F.nobuU.pos : F.kz;
      botWalk(p, inp, c.x, c.z + 10, 2, goTo);
    } else botWalk(p, inp, fortRest ? SHELTER.x : siege ? T_HONGATE.x : 2,
      fortRest || siege ? SHELTER.z : -50, 1, goTo);
    if (foe) {
      botFaceWalking(p, inp, foe); inp.guardHold = true;
      // 奥まで敵が来たら、止まって受け続けない。追わず、その場で槍の届く敵だけ押し返す。
      const d = Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
      if (fortRest && Math.hypot(u.pos.x - SHELTER.x, u.pos.z - SHELTER.z) <= 2 &&
          d < reach && p.sta > p.maxSta * .45) patientStrike(p, inp, foe, d);
    }
    return;
  }
  // 構えを解く半秒の間、届く相手を保つ。柵越しや別の高さの兵は追わない。
  const previous = p.botStrikeFoe;
  const e = p.botStrikeUntil > p.time && previous && canFight(previous) && !previous.invuln &&
    Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < reach ? previous :
    b.army.nearestEnemy(u, weak ? reach : F.step === 2 ? 5 : siege ? 9 : 12, (o) => canFight(o) && !o.invuln &&
      // 城戸口では木戸の内へ追わない。印の近くの敵だけを払う。
      (F.step !== 4 || !F.kidoCut || Math.hypot(o.pos.x - F.kz.x, o.pos.z - F.kz.z) < 16) &&
      (Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < reach || botRoadClear(b, u.pos, o.pos)) &&
      (!siege || inPoly(SOTO_POLY, o.pos.x, o.pos.z) || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 3.5) &&
      // 救援と呼応する段では、門を離れて西の囲みや鉄砲組へ一人で斬り込まない。
      (F.step !== 1 || b.G.lord || inPoly(SOTO_POLY, o.pos.x, o.pos.z) ||
        Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < reach));
  // 救援待ちで門外へ押し出された時は、敵の予兆より持ち場への帰路を優先する。
  // 受けは保つが、西の囲みへ歩みを進めない。
  if (!b.G.lord && F.step === 1 && !inPoly(SOTO_POLY, u.pos.x, u.pos.z)) {
    botWalk(p, inp, GATE_REAR.x, GATE_REAR.z, 1, goTo);
    if (attacker) { botFaceWalking(p, inp, attacker); inp.guardHold = true; }
    return;
  }
  if (attacker) {
    p.yaw = Math.atan2(attacker.pos.x - u.pos.x, attacker.pos.z - u.pos.z);
    if (p.lock && p.lock !== attacker) inp.e.add('KeyQ');
    // 敵の長い槍を受けるだけで止まらず、自分の槍が届く所まで詰める。
    if (ad > reach * 0.9 && botRoadClear(b, u.pos, attacker.pos) &&
        (!holdingFort || insideGate(attacker.pos))) inp.k.add('KeyW');
    // 攻撃が終わった兵を、前のコマの予兆だけで受け続けない。
    // 受け流した隙も共通の判断で構えを解き、槍を突く。
    patientStrike(p, inp, attacker, ad);
    return;
  }
  // 再攻撃でも先に南門と東の角を通る。柵越しの敵へ引かれて
  // 西の空堀へ出たり、味方の二段と別の道へ進んだりしない。
  const sortieWay = F.step === 3 ? sortieWaypoint(b) : null;
  if (sortieWay && (!e || Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > reach)) {
    inp.guardHold = false;
    botWalk(p, inp, sortieWay.x, sortieWay.z, 1, goTo);
    return;
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    // 籠城中は門外の敵を追って味方の槍の列から飛び出さない。
    if (d > reach * 0.9 && botRoadClear(b, u.pos, e.pos) && (!holdingFort || insideGate(e.pos))) inp.k.add('KeyW');
    // 構えたまま突くと払いになる。敵の隙に構えを解いてから突く。
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (F.step === 1) {
    // 討取りのために遠い隊の中心を追わず、明智勢と救援の合流する門前を保つ。
    botWalk(p, inp, T_GATE.x, b.G.lord ? T_GATE.z + 7 : GATE_REAR.z, 1, goTo);
    return;
  }
  if (F.step === 2) { botWalk(p, inp, F.gz.x, F.gz.z, 1.5, goTo); return; }
  if (siege) {
    botWalk(p, inp, T_GATE.x, T_GATE.z - 3, 1, goTo);
    if (inp.quickCmd === 'yari') p.yaw = 0;
    return;
  }
  // 城戸口の敵が払われた後は、深手でも印へ進んで口を押さえる。
  if (weak && (F.step === 3 || b.army.nearestEnemy(u, 10, canFight))) {
    // 退避札と同じ後列へ付く。別の隊の平均を追って案内から離れない。
    if (F.step === 3) { botWalk(p, inp, F.fieldRest.x, F.fieldRest.z, 2, goTo); return; }
    // 近い味方の隊の後ろ（砦の側）へ付く。
    let best = null, bd = 1e9;
    for (const g of [F.saku, F.taki, F.nobu, F.ake, F.honjin.guard]) {
      if (spent(g)) continue;
      const c = g.center(), d = Math.hypot(c.x - u.pos.x, c.z - u.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (best && !inPoly(SOTO_POLY, u.pos.x, u.pos.z)) { const [x, z] = botAround(u, best.x, best.z + 6); botWalk(p, inp, x, z, 2, goTo); return; }
  }
  if (F.step === 3) {
    // 一人で敵の本隊へ駆けず、先の段の味方と並んで当たる。味方が敵に組んだ所へ加わる。
    let q = null, qd = 1e9, mate = null;
    for (const g of [F.saku, F.ake, F.nobu, F.taki]) {
      if (spent(g)) continue;
      const c = g.center();
      if (!mate) mate = c;
      for (const x of F.last || []) {
        if (spent(x)) continue;
        const t = x.center(), d = Math.hypot(t.x - c.x, t.z - c.z);
        if (d < qd) { qd = d; q = x; mate = c; }
      }
    }
    if (inPoly(SOTO_POLY, u.pos.x, u.pos.z)) { botWalk(p, inp, FORT.x, FORT.z + FORT.r + 4, 1, goTo); return; }
    if (q && qd < 25) { const t = q.center(), [x, z] = botAround(u, t.x, t.z); botWalk(p, inp, x, z, 2, goTo); return; }
    if (mate) { const [x, z] = botAround(u, mate.x, mate.z + 3); botWalk(p, inp, x, z, 3, goTo); return; }
  }
  if (F.step === 4 && F.kz) {
    const exit = !F.kidoCut ? sortieWaypoint(b) : null;
    if (exit) { botWalk(p, inp, exit.x, exit.z, 1, goTo); return; }
    const [kx, kz] = botAround(u, F.kz.x, F.kz.z);
    botWalk(p, inp, kx, kz, 2, goTo); return;
  }
  botWalk(p, inp, c.x + 2, c.z + 4, 3, goTo);
};

export { tennoji };
