import { useTerrain } from './asset_manifest.js';
// ======================================================================
// 織田家編　天正伊賀の乱・比自山城（天正九年九月）
// 信長公記巻十四は九月三日の諸口侵攻を記す。比自山の夜討ち・攻めあぐね・退去は伊乱記の伝承で補う。
// 丹羽の一組で、夜討ちを退ける→南の土橋を押さえる→攻めあぐねて包囲へ→夜の出撃を止める→空城の曲輪を調べる。
// 比自山の退去日を佐奈具の九月十一日と混同しない。数・各隊の位置・時間配分は遊びの復元。
// 北（-z）に尾根の曲輪、南（+z）に大手と織田の陣。城域南北約415m・東西約185m・比高約150mを実寸で使う。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { yamaLift } from './yamalift.js';
import { SOLIDS, solidRect, nobori, hut, yagura, campfire, kabukimon, tawara, tobira, palisade, jinmaku } from './props.js';
import { distToPolyline } from './world.js';
import { drawGroundAt, avoidCameraBodies } from './render_camera.js';
import { localClear } from './army_local_way.js';
import { flagTexture } from './textures.js';
import { UNIT_MAT } from './units.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm, unitPos, ringWall } from './bhelp.js';
import { applyLook, NIGHT, DAWN, dress, gone as groupGone } from './b_inabayama.js';
// 深手で戦えない兵だけが残っても、敵の寄せが続くとは数えない。
const igaReady = (u) => u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget && !u.dropped && u.wpnKind !== 'none';
const gone = (g) => groupGone(g) || !g.units.some(igaReady);
import { depthStart, depthTick, rest, move, depthBot } from './b_depth.js';
import { uS, uA, lines, camp } from './b_mid.js';
import { heightOf, buildCastlePlan, inPoly } from './castle_plan.js';
import { HIJIYAMA_PLAN, SHU, KITA, KITASOTO, HIGASHI, KITAEND, SHU_SOUTH, SHU_NORTH, APPROACH, RIDGE, RIDGE_LEVELS, EAST } from './castles/hijiyama.js';
import { demRelief } from './dem.js';
import { monomi, horiboriHeight } from './castle_parts.js';
import { battleEvent, EVENT_FIRE_START, EVENT_RETREAT, EVENT_UNIT_BREAK, EVENT_MESSENGER } from './battle_events.js';
let igDem = null;
useTerrain('dem_hijiyama', (data) => { igDem = data; });
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;
// 布を巻いた印は装いに残る。二度目の出血でも、残る布へ案内する。
const igaNeedsTreatment = (rt) => (rt.player.u.hp < rt.player.u.maxHp * 0.5 || rt.player.u.wounds?.bleed > 0.0001) &&
  rt.player.treatmentLeft > 0;
// 消火の組が動けない時は、札も印も残る火へそろえる。
// 火は味方の消火の組が消す（長押しの札と案内は出さない。Simple is the best）。残った火は百秒で陣の者が消す。
const igaNeedsDousing = () => false;

const CAMP = { x: 0, z: 40 };                     // 丹羽の陣
const BRIDGE_ROAD_INDEX = APPROACH.findIndex(point => point[0] === 0 && point[1] === -48);
const campClearing = (x, z) => Math.abs(x) < 58 && z > -10 && z < 108;
// 伊賀市の城跡資料：観音寺跡は山上の城域。現在の寺を天正九年の堂として置かない。
// https://adeac.jp/iga-city/texthtml/d500010/mp000010-100050/ht300070
// 麓の在所・人数・細道は推定復元。城下町にせず、寺から下りた僧も村の者と退く。
// 東の包囲陣・小城館から離れた南東の裾を使い、大手・土橋・陣の柵を横切らない。
const PEOPLE_HOMES = [[96, 70], [112, 104]];
const PEOPLE_PATHS = [
  [[86, 80], [106, 82], [132, 122], [164, 170], [192, 230]],
  [[96, 75], [106, 82], [132, 122], [164, 170], [192, 230]],
  [[98, 98], [104, 116], [132, 142], [164, 182], [192, 230]],
  [[112, 109], [122, 118], [142, 146], [164, 182], [192, 230]],
];
const PEOPLE_BANDS = PEOPLE_PATHS.map((path, i) => ({
  x: path[0][0], z: path[0][1], mode: i % 2 ? 'inside' : 'watch',
  kinds: i === 0 ? ['farmer', 'farmer', 'woman', 'child', 'elder']
    : i === 2 ? ['townsman', 'merchant', 'monk', 'woman'] : ['farmer', 'woman', 'child', 'elder'],
  route: path.slice(1).map(([x, z]) => ({ x, z })), routeEnd: 'wait',
}));
function peopleClearing(x, z) {
  if (igaFieldClearing(x, z)) return true;
  for (const [hx, hz] of PEOPLE_HOMES) if (Math.abs(x - hx) < 10 && Math.abs(z - hz) < 10) return true;
  for (const path of PEOPLE_PATHS) if (distToPolyline(x, z, path) < 4) return true;
  return false;
}
// 村道の西に小さな刈田を二枚。避難する道と山城の曲輪には掛けない。
const IGA_FIELDS = [[78, 120], [98, 146]];
const igaFieldClearing = (x, z) => IGA_FIELDS.some(([cx, cz]) => Math.abs(x - cx) < 9 && Math.abs(z - cz) < 7);

// 写真の井楼の丸太・貫・縄掛けを、包囲陣の小道具へ使う。
// 攻城櫓や石垣を足す復元ではない。中央の迎撃場と四方の寄せ口は従来のまま。
function igaCampDetails(rt) {
  const W = rt.world;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const pole = new THREE.CylinderGeometry(1, 1, 1, 6);
  const hoop = new THREE.TorusGeometry(1, 0.055, 3, 10);
  const pot = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI * 0.27, Math.PI * 0.73);
  const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), euler = new THREE.Euler();
  const color = new THREE.Color();
  const wood = 0x65503a, bamboo = 0x777047, rope = 0x8c7955, iron = 0x302c28;
  // 一か所を一束へ焼き込み、遠くでは細い節・縄・刈株を省く。毎コマの処理は増やさない。
  function site(cx, cz, build) {
    const near = [], far = [], y = W.heightAt(cx, cz);
    function part(base, x, h, z, sx, sy, sz, tint, rx = 0, ry = 0, rz = 0, fine = false) {
      const g = base.clone();
      pos.set(x, h, z); scale.set(sx, sy, sz); euler.set(rx, ry, rz); rotation.setFromEuler(euler);
      matrix.compose(pos, rotation, scale); g.applyMatrix4(matrix);
      color.setHex(tint);
      const colors = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      near.push(g); if (!fine) far.push(g);
    }
    const ground = (x, z) => W.heightAt(cx + x, cz + z) - y;
    build(part, ground);
    const lod = new THREE.LOD(); lod.position.set(cx, y, cz);
    for (const [pieces, distance] of [[near, 0], [far, 55]]) {
      if (!pieces.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(pieces), mat);
      mesh.receiveShadow = true; mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
      lod.addLevel(mesh, distance);
    }
    lod.addLevel(new THREE.Group(), 145);
    for (const g of near) g.dispose();
    rt.scene.add(lod);
  }
  // 小屋の外壁側の備え。竹の切り口・節・二か所の縄を近くで見せる。
  for (const [cx, cz] of [[-28, 30], [32, 60]]) site(cx, cz, (part, ground) => {
    for (let bundle = 0; bundle < 3; bundle++) {
      const x = (bundle - 1) * 0.85, z = bundle % 2 * 0.2, h = ground(x, z);
      for (let j = 0; j < 7; j++) {
        const a = j * 2.4, dx = x + Math.cos(a) * 0.22, dz = z + Math.sin(a) * 0.22;
        const height = 1.9 + (j % 3) * 0.13;
        part(pole, dx, h + height / 2, dz, 0.085, height, 0.085, j % 2 ? bamboo : 0x8c8055);
        for (const level of [0.3, 1, 1.65]) part(pole, dx, h + level, dz, 0.095, 0.045, 0.095, 0x9b9063, 0, 0, 0, true);
      }
      for (const level of [0.55, 1.45]) part(hoop, x, h + level, z, 0.34, 0.34, 0.34, rope, Math.PI / 2, 0, 0, true);
    }
    // 薪棚は丸太二本と横木。細い割薪を地面へ散らさず積む。
    for (const x of [-1.25, 1.25]) part(pole, x, ground(x, 1.8) + 0.7, 1.8, 0.09, 1.4, 0.09, wood);
    part(pole, 0, ground(0, 1.8) + 1.25, 1.8, 0.075, 2.8, 0.075, wood, 0, 0, Math.PI / 2);
    for (let j = 0; j < 14; j++) {
      const x = (j % 7 - 3) * 0.3, h = ground(x, 2.1) + 0.18 + Math.floor(j / 7) * 0.2;
      part(pole, x, h, 2.1, 0.11, 1.1, 0.1, j % 2 ? wood : 0x847052, Math.PI / 2, j * 0.025);
    }
  });
  // 既存の焚き火を炊事場にする。火・光・煙の発生数は増やさない。
  for (const [cx, cz] of [[-4, 44], [14, 40]]) site(cx, cz, (part, ground) => {
    for (const side of [-1, 1]) {
      part(pole, side * 0.72, 0.83, 0, 0.055, 1.75, 0.055, wood, 0, 0, side * 0.12);
    }
    part(pole, 0, 1.6, 0, 0.05, 1.8, 0.05, wood, 0, 0, Math.PI / 2);
    part(pot, 0, 0.76, 0, 0.43, 0.42, 0.43, iron);
    part(hoop, 0, 1.1, 0, 0.27, 0.35, 0.27, iron, 0, 0, 0, true);
    part(pole, 0, 1.44, 0, 0.018, 0.32, 0.018, iron, 0, 0, 0, true);
    // 水桶の板と二段の箍。火の周囲の通り道へ張り出さない。
    const h = ground(0.95, 0.7);
    part(pole, 0.95, h + 0.25, 0.7, 0.27, 0.5, 0.27, wood);
    for (const level of [0.1, 0.4]) part(hoop, 0.95, h + level, 0.7, 0.28, 0.28, 0.28, rope, Math.PI / 2, 0, 0, true);
  });
  for (const [cx, cz] of IGA_FIELDS) site(cx, cz, (part, ground) => {
    // 一枚の平板を斜面へ浮かせず、小区画の四隅を地表へ沿わせる。
    for (let row = 0; row < 7; row++) for (let col = 0; col < 10; col++) {
      const x = (col - 4.5) * 1.5, z = (row - 3) * 1.5;
      const g = new THREE.PlaneGeometry(1.48, 1.42); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, ground(x + p.getX(i), z + p.getZ(i)) + 0.025);
      g.computeVertexNormals();
      part(g, x, 0, z, 1, 1, 1, (row + col) % 3 ? 0x66543c : 0x746044); g.dispose();
      for (let stalk = 0; stalk < 3; stalk++) {
        const dx = x + (stalk - 1) * 0.35, dz = z + Math.sin(col * 3 + row + stalk) * 0.3;
        part(pole, dx, ground(dx, dz) + 0.12, dz, 0.035, 0.24, 0.035, 0x998251, 0, 0, 0.12, true);
      }
    }
  });
  pole.dispose(); hoop.dispose(); pot.dispose();
}
function igaVillage(rt) {
  const W = rt.world;
  // 二軒で形と材質を共用。民は共通の見物・避難の仕組みだけで描き、兵の名簿へ入れない。
  const house = hut(W, PEOPLE_HOMES[0][0], PEOPLE_HOMES[0][1], 6, 4);
  rt.scene.add(house);
  const [x, z] = PEOPLE_HOMES[1], next = house.clone();
  let y = W.heightAt(x, z);
  for (const dx of [-3, 3]) for (const dz of [-2, 2]) y = Math.max(y, W.heightAt(x + dx, z + dz));
  next.position.set(x, y, z);
  solidRect(x, z, 6.18, 4.18, 0).civilianSite = 'home';
  rt.scene.add(next);
}
// 伊賀の土だけ、端をまたぐ粒を描いてつなぐ。鏡写しにせず、小石の大きさもそろえる。
function igaGroundDetail(rt) {
  const W = rt.world, mat = W.terrain.material;
  // 坂の足場まで網目で抜くと、土の下の空が見える。視点は坂の外へ寄せる。
  mat.userData.camNearSolid = true;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  let seed = 15819;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  g.fillStyle = '#79634c'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = i < 80 ? 12 + rnd() * 12 : 0.7 + rnd() * 0.6;
    const a = rnd() * Math.PI, ry = r * (0.45 + rnd() * 0.55);
    const shade = i % 2 ? '36,29,22' : '184,160,119';
    const blur = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    blur.addColorStop(0, `rgba(${shade},0.12)`); blur.addColorStop(1, `rgba(${shade},0)`);
    for (let ox = -256; ox <= 256; ox += 256) for (let oy = -256; oy <= 256; oy += 256) {
      if (x + ox + r < 0 || x + ox - r > 256 || y + oy + r < 0 || y + oy - r > 256) continue;
      g.save(); g.translate(x + ox, y + oy); g.rotate(a); g.scale(r, ry);
      g.fillStyle = blur; g.fillRect(-1, -1, 2, 2); g.restore();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  W.groundU.tDirt.value = W.groundU.tBank.value = tex;
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => key.call(mat) + '|iga-soil';
  mat.onBeforeCompile = (sh) => {
    compile.call(mat, sh);
    // 三方向とも同じ縮尺で回して貼る。急な坂でも黒い粒を縦に引き伸ばさない。
    sh.fragmentShader = `vec3 igaSoil(sampler2D tex, vec3 p, vec3 n, float scale) {
      vec3 w = pow(abs(n), vec3(8.0)); w /= max(0.001, w.x + w.y + w.z);
      mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
      return texture2D(tex, turn * p.zy * scale + 0.17).rgb * w.x
        + texture2D(tex, turn * p.xy * scale + 0.53).rgb * w.z
        + texture2D(tex, turn * p.xz * scale).rgb * w.y;
    }\n` + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader
      .replace(/vec3 dirt = mix\(texture2D\(tDirt, wuv \* (?:0\.23|0\.46)\)\.rgb, texture2D\(tDirt, ruv \* (?:0\.11|0\.22) \+ 0\.57\)\.rgb, mixK \* 0\.6\) \* mix\(0\.85, 1\.12, macro2\);/,
        'vec3 dirt = igaSoil(tDirt, vWP, gN, 0.23) * mix(0.85, 1.12, macro2);')
      .replace('float df = dot(texture2D(tDirt, ruv * 0.85).rgb, vec3(1.0)) / max(dot(texture2D(tDirt, ruv * 0.85, 9.0).rgb, vec3(1.0)), 1e-3);', 'float df = 1.0;')
      .replace(/vec3 dS = .*;\n/, '')
      .replace('dirt = mix(dirt, dS + dirt * tw.y, slopeK);', '')
      .replace('vec3 mud = texture2D(tMud, wuv * 0.26).rgb;', 'vec3 mud = igaSoil(tMud, vWP, gN, 0.26);')
      // 等間隔の丸を土へ並べると、山道まで滑り止めの板に見える。
      // 土の細かな斑は上の絵で残し、切岸の地層・雨筋・苔は共通の描き方を保つ。
      .replace('pebble * (w.y + bareSoil) * (1.0 - slopeK) * 0.65', '0.0')
      // 色だけ消しても高画質の凹凸に丸い縁が残る。陰も同じ粒から外す。
      .replace('+ crustHeight + pebble * mix(0.018, 0.045, clodSeed) * crustK', '+ crustHeight')
      .replace('grass = mix(grass, gS + grass * tw.y, slopeK);', 'grass = mix(grass, igaSoil(tGrass, vWP, gN, 0.21), slopeK);')
      .replace('vec2 uX = vWP.zy, uZ = vWP.xy;', 'vec2 uX = mat2(0.8, -0.6, 0.6, 0.8) * vWP.zy, uZ = mat2(0.6, 0.8, -0.8, 0.6) * vWP.xy;');
  };
  mat.needsUpdate = true;
  const dispose = rt.dispose;
  rt.dispose = function () { const result = dispose.call(this); tex.dispose(); return result; };
}

// 全域の格子は増やさず、大手坂と最後に渡る北の土橋だけ細かくする。
// 元の三角形を抜いて同じ材質で埋め、境の一升だけ元の地面へつなぐ。
function igaRoadGround(W) {
  // 折り返しは左右二十四メートル、法面はさらに約二十一メートル続く。
  // 道端で粗い格子へ戻さず、法面の外で元の地面へつなぐ。
  igaRoadGroundPatch(W, -48, 48, -80, 20, 8);
  igaRoadGroundPatch(W, -18, 18, KITA.z - 24, SHU_NORTH[1] + 12, 4);
}
function igaRoadGroundPatch(W, left, right, north, south, divisions) {
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
    const base = coarseHeight(x, z), y = base + (height(x, z) - base) * rim * rim * (3 - 2 * rim);
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
    // 二枚目では、一枚目の細かい面も含む。頂点番号を元の格子と取り違えない。
    const x = (original.getX(a) + original.getX(b) + original.getX(c)) / 3;
    const z = (original.getZ(a) + original.getZ(b) + original.getZ(c)) / 3;
    if (x <= x0 || x >= x0 + width || z <= z0 || z >= z0 + depth) indices.push(a, b, c);
  }
  source.setIndex(indices);
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  // 細かい坂も本体の地面へつなぐ。別の面のままだと、描く直前の足場検査に
  // 坂だけが載らず、視点が切岸へ入る。地面を一つにまとめ、描く回数は一回に保つ。
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

// 陣の小屋を横切る視点は、本人側の壁の手前へ戻す。回転と軒の厚みも含める。
function igaHutCameraFraction(from, to, h) {
  const ax = from.x - h.x, az = from.z - h.z, bx = to.x - h.x, bz = to.z - h.z;
  const x = ax * h.cos - az * h.sin, z = ax * h.sin + az * h.cos;
  const dx = bx * h.cos - bz * h.sin - x, dz = bx * h.sin + bz * h.cos - z;
  const y = from.y - h.m.position.y, dy = to.y - from.y;
  // 壁と茅の軒を別に調べる。壁幅だけでは張り出した屋根へ視点が入り、
  // 軒全体を地面まで塞ぐと、軒下の肩を始点にしただけで視点が潰れる。
  let fraction = 1;
  for (let volume = 0; volume < 2; volume++) {
    let enter = 0, leave = 1;
    for (let axis = 0; axis < 3; axis++) {
      const p = axis === 0 ? x : axis === 1 ? z : y;
      const d = axis === 0 ? dx : axis === 1 ? dz : dy;
      const extent = axis === 0 ? (volume ? 4.75 : 3.7) : (volume ? 3.75 : 2.7);
      const lo = axis === 2 ? (volume ? 2.2 : 0) : -extent;
      const hi = axis === 2 ? (volume ? 7.4 : 2.8) : extent;
      if (Math.abs(d) < 1e-8) { if (p < lo || p > hi) { leave = -1; break; } }
      else {
        const a = (lo - p) / d, b = (hi - p) / d;
        enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
        if (enter > leave) break;
      }
    }
    if (enter <= leave) fraction = Math.min(fraction, enter);
  }
  const length = Math.hypot(to.x - from.x, dy, to.z - from.z);
  return fraction < 1 ? Math.max(0, fraction - 0.25 / Math.max(0.25, length)) : 1;
}

function igaSlopeCamera(rt) {
  const player = rt.player, updateCamera = player.updateCamera;
  const look = new THREE.Vector3(), shoulder = new THREE.Vector3(), view = new THREE.Vector3(), road = { x: 0, z: 0, d: 0 };
  const rear = { x: 0, z: 0 }, ahead = { x: 0, z: 0 };
  // 北の曲輪の手前でも、視点を土橋と同じ高さへ戻す。広い主郭の中は自由に見渡せる。
  const onNarrowRoad = () => road.d < 16 && road.z < 35 && road.z > SHU.z - 18 ||
    rt.flags.step >= 3.5 && road.d < 6 && road.z < SHU_NORTH[1] + 8 && road.z > KITA.z - 18;
  // 壁よけで肩の真上まで縮んだ時も、笠を真下へ見続けない。
  // 道に沿った目線へ切り替え、上下の角度を抑える。入れ物は使い回す。
  const levelLook = (camera, direction) => {
    const P = camera.position;
    // 壁よけや兵よけで位置を動かすたび、本人の肩へ目線を戻す。
    // 折れ目の先だけを見続けると、三人称でも本人が画面の端へ消える。
    look.copy(shoulder);
    let flat = Math.hypot(look.x - P.x, look.z - P.z);
    if (flat < 0.6) {
      // 肩へ縮んだ時に人物の向きへ戻すと、谷や切岸を再び向いてしまう。
      // 接線を三歩延ばすと折り返しの外の土壁を見る。先の道の上へ目線を置く。
      // 肩まで縮んだ時も、上り・下りと同じ高さの道をたどる。
      // 角度を抑えた後の視線も調べる。上りで注視点だけ下げると、
      // 視点が土の上にあっても、その先の切岸で画面が埋まる。
      // 正面は四分の一歩ずつたどり、見通せない時だけ反対側も調べる。
      let clear = false;
      for (let side = 0; side < 2 && !clear; side++) for (let i = 0; i < (side ? 3 : 12); i++) {
        igaRoadSight(road.s, side ? -direction : direction, side ? 3 / (1 << i) : 3 - i * 0.25, ahead, true);
        const eyeY = drawGroundAt(rt.world, ahead.x, ahead.z) + 1.6;
        look.set(ahead.x, eyeY, ahead.z);
        flat = Math.hypot(look.x - P.x, look.z - P.z);
        look.y = Math.max(P.y - flat * 0.55, Math.min(P.y + flat * 0.45, look.y));
        if (sightClear(P, look) && player.camBlockHit(P, look) === null) { clear = true; break; }
        // 急な上りでは道に沿って見上げる。水平へ戻し続けると土壁を向く。
        look.y = eyeY;
        if (sightClear(P, look) && player.camBlockHit(P, look) === null) { clear = true; break; }
      }
    }
    // 肩を見る時も、角度を抑えた先に土や建物があるなら元の目線を残す。
    const clearY = look.y;
    look.y = Math.max(P.y - flat * 0.55, Math.min(P.y + flat * 0.45, clearY));
    if (!sightClear(P, look) || player.camBlockHit(P, look) !== null) look.y = clearY;
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
  };
  const cameraRoad = { x: 0, z: 0, d: 0 }, cameraProbe = { x: 0, y: 0, z: 0 };
  const lookProbe = { x: 0, y: 0, z: 0 }, lookRoad = { x: 0, z: 0, d: 0 };
  // 目の前の土壁も調べる。手前の面だけ安全でも、折れ目を横切る視線は壁で埋まる。
  const sightClear = (from, to) => {
    // 細分した坂の一升より細かく調べる。長い視線を五点だけで測ると、
    // 折り返しの薄い切岸を飛び越え、肩から道まで土壁越しに見てしまう。
    const steps = Math.max(6, Math.min(32, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.25)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (drawGroundAt(rt.world, from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t) + 0.2 >
          from.y + (to.y - from.y) * t) return false;
    }
    return true;
  };
  // 中心が道に載っていても、横長の画面の端は切岸へ入る。
  // 共通の最後の検査で上段まで持ち上げられる前に、同じ足場へ寄せる。
  const frameBlocked = (camera) => {
    camera.updateMatrixWorld();
    const P = camera.position, e = camera.matrixWorld.elements;
    const h = camera.near * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
    for (let i = 0; i < 9; i++) {
      const dx = (i % 3 - 1) * h * camera.aspect, dy = (Math.floor(i / 3) - 1) * h;
      const x = P.x + e[0] * dx + e[4] * dy - e[8] * camera.near;
      const y = P.y + e[1] * dx + e[5] * dy - e[9] * camera.near;
      const z = P.z + e[2] * dx + e[6] * dy - e[10] * camera.near;
      if (y < drawGroundAt(rt.world, x, z) + 0.12) return true;
    }
    return false;
  };
  const offBench = (P, p) => {
    cameraProbe.x = P.x; cameraProbe.y = p.y; cameraProbe.z = P.z;
    roadPoint(cameraProbe, cameraRoad);
    // 道の肩へ避けた時も検査する。本人より谷側へ視点を離さない。
    const i = Math.min(ROAD.length - 2, Math.floor(cameraRoad.s)), grade = GRADED?.[i];
    const roadY = grade ? igaRoadHeight(grade, cameraRoad.s - i) : p.y;
    return cameraRoad.d > Math.max(2.8, road.d + 0.4) || Math.abs(rt.world.heightAt(P.x, P.z) - roadY) > 2.4;
  };
  const clampCamera = function (camera) {
    const p = this.u.pos;
    if (p.z > 10 && rt.flags.huts && !this.u.naka) {
      shoulder.copy(p); shoulder.y += 1.6;
      let fraction = 1;
      for (const h of rt.flags.huts) fraction = Math.min(fraction, igaHutCameraFraction(shoulder, camera.position, h));
      if (fraction < 1) {
        camera.position.lerpVectors(shoulder, camera.position, fraction);
        // 小屋を避けて寄った後も本人の肩を見る。元の遠い注視点では足もとへ向きすぎる。
        look.copy(shoulder);
        if (camera.position.distanceToSquared(shoulder) < 0.36) {
          camera.getWorldDirection(view); look.addScaledVector(view, 3);
        }
        camera.lookAt(look); this.camPos.copy(camera.position);
      }
    }
    roadPoint(p, road);
    // 木戸の攻防で数歩押し出されても、補正を切って谷へ視点を放さない。
    const approach = onNarrowRoad();
    if (!this.u.alive && rt.result?.down) return;
    if (!approach) return;
    if (this.fpK >= 0.5) return;
    const W = rt.world, P = camera.position;
    let floor = Math.max(p.y + 0.6, W.heightAt(P.x, P.z) + 0.65);
    camera.getWorldDirection(view);
    // 共通の演出後も山道の水平を保つ。視線はそのまま、傾きだけ戻す。
    camera.up.set(0, 1, 0);
    look.copy(P).add(view); camera.lookAt(look);
    // 視点だけ道へ戻しても、切岸や谷を向くと足場が消える。
    // 三歩先が道を外す時だけ、今向いている側の道筋を映す。
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    lookProbe.x = p.x + sn * 2.25; lookProbe.y = p.y; lookProbe.z = p.z + cs * 2.25;
    roadPoint(lookProbe, lookRoad);
    const lookFloor = W.heightAt(lookProbe.x, lookProbe.z);
    const lostRoad = lookRoad.d > Math.max(2.8, road.d + 0.4) || lookFloor > p.y + 1.6 || lookFloor < p.y - 2.4;
    // 視点だけ敵へ振られた場合は、足軽の向きと画面の向きが違う。
    // 実際の視線が谷や切岸へ抜ける時も、同じ足場から道を見せる。
    const flatView = Math.hypot(view.x, view.z) || 1;
    lookProbe.x = p.x + view.x / flatView * 4.5; lookProbe.z = p.z + view.z / flatView * 4.5;
    roadPoint(lookProbe, lookRoad);
    const viewFloor = W.heightAt(lookProbe.x, lookProbe.z);
    const lostView = lookRoad.d > Math.max(2.8, road.d + 0.4) ||
      viewFloor > p.y + 2.4 || viewFloor < p.y - 3.2;
    // 道の傾きだけで視線を決めると、上りでは本人が画面の下へ消える。
    // 肩が画角の中央寄りに残るかも調べる。一人称は上で除いてある。
    const segment = GRADED?.[Math.min(ROAD.length - 2, Math.floor(road.s))];
    shoulder.copy(p); shoulder.y += 1.6;
    const sx = shoulder.x - P.x, sy = shoulder.y - P.y, sz = shoulder.z - P.z;
    const selfDistance = Math.hypot(sx, sy, sz);
    const lostSelf = selfDistance < 1 || (sx * view.x + sy * view.y + sz * view.z) /
      Math.max(0.001, selfDistance) < Math.cos(camera.fov * Math.PI / (360 * camera.zoom));
    const along = segment ? segment.dx * sn + segment.dz * cs : 1;
    const direction = along >= 0 ? 1 : -1;
    // 角まで半歩で止めると肩へ縮み、本人が消えたまま切岸を見る。
    // 後ろの道を角の先までたどり、切岸を横切る時だけ下の通り道検査で寄せる。
    igaRoadSight(road.s, -direction, 3.2, rear);
    // 下りでは後ろの道が高い。同じ道の目の高さを土壁と間違えて肩へ戻さない。
    const rearY = W.heightAt(rear.x, rear.z) + 1.65;
    const ceiling = Math.max(p.y + 3.2, rearY + 0.15);
    lookProbe.x = P.x + view.x * 4.5; lookProbe.y = P.y + view.y * 4.5; lookProbe.z = P.z + view.z * 4.5;
    const lostSight = !sightClear(P, lookProbe);
    const levelView = view.y >= -0.48 && view.y <= 0.42 && camera.matrixWorld.elements[5] > 0;
    // 地面より上でも、共通の壁よけが足元へ向けた視線は戻す。
    // 帰りの下り坂で、頭上から自分の笠だけを見る状態を残さない。
    // 足場より上でも、谷側や上段の道へはみ出した視点は戻す。
    // 横向きの携帯で、崖と白い空だけが画面を分ける状態を避ける。
    if (levelView && P.y >= floor && P.y <= ceiling && Math.hypot(P.x - p.x, P.z - p.z) <= 4.5 && !offBench(P, p) && !lostRoad && !lostView && !lostSelf && !lostSight && !frameBlocked(camera)) return;
    // 切岸の頂へ視点を持ち上げず、同じ側の肩へ寄せる。山の外の白い空へ向けない。
    shoulder.copy(p); shoulder.y += 1.6;
    // 頭の真上へ縮める前に、同じ道を二歩戻った肩越しの位置を使う。
    // 折れ目では道に沿って戻し、接線を延ばして谷や隣の切岸へ置かない。
    // 視点を前の折り返しまで戻すと、道の内側の切岸越しに本人を見る形になる。
    // 上りでも本人の肩より上から見る。低い視点で六歩先を見上げない。
    P.set(rear.x, Math.max(p.y + 2.2, rearY), rear.z);
    floor = Math.max(p.y + 0.6, W.heightAt(P.x, P.z) + 0.65);
    for (let i = 1; i <= 12 && (P.y < floor || P.y > ceiling || offBench(P, p) || !sightClear(shoulder, P)); i++) {
      // 直線で肩へ寄せると、角の内側の土を横切ってさらに視点が潰れる。
      // 戻る距離を短くして道をたどり直し、同じ踏み面から肩を見せる。
      igaRoadSight(road.s, -direction, 3.2 - i * 0.25, rear);
      P.set(rear.x, Math.max(p.y + 2.2, W.heightAt(rear.x, rear.z) + 1.65), rear.z);
      floor = Math.max(p.y + 0.6, W.heightAt(P.x, P.z) + 0.65);
    }
    if (floor > ceiling || P.y > ceiling || offBench(P, p) || !sightClear(shoulder, P)) {
      P.copy(shoulder); floor = W.heightAt(P.x, P.z) + 0.65;
    }
    P.y = Math.max(P.y, floor);
    // まず肩までの通り道を調べる。最後の目線は、その先の同じ道へ向ける。
    look.copy(shoulder);
    if (lostRoad || lostView) {
      const i = Math.min(ROAD.length - 2, Math.floor(road.s)), a = ROAD[i], b = ROAD[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      // 見えている道と、前へ進む操作の向きもそろえる。
      this.yaw = Math.atan2(dx * direction, dz * direction);
    }
    // 肩へ寄せた後にも軒・壁・坂を避ける。共通の検査後に視点を壁へ戻さない。
    // 共通の前方検査は切岸の上へ視点を持ち上げる。ここでは同じ道の
    // 肩から壁までの距離だけを使い、選んだ低い視点を上段へ押し出さない。
    const block = this.camBlockHit(shoulder, P);
    if (block !== null) P.lerpVectors(shoulder, P, Math.max(0, block - 0.05));
    // 共通の壁よけは上へ持ち上げる。補正後も切岸の頂へ飛ばず、肩から見渡す。
    if (P.y > ceiling || offBench(P, p) || !sightClear(shoulder, P)) P.copy(shoulder);
    P.y = Math.max(P.y, p.y + 0.6, W.heightAt(P.x, P.z) + 0.65);
    if (!sightClear(P, look)) P.copy(shoulder);
    // 坂の補正後にも兵の胴を避ける。共通側だけでは、ここで戻した視点へ
    // 味方の笠が重なり、道を隠す。既存の計算と入れ物を使う。
    avoidCameraBodies(rt.army.units, this.u, shoulder, P);
    // 近すぎる時は笠の上へ跳ね上げず、道を見る目の高さを保つ。
    levelLook(camera, direction);
    for (let i = 0; i < 8 && (frameBlocked(camera) || offBench(P, p) || !sightClear(shoulder, P) || !sightClear(P, look)); i++) {
      P.lerp(shoulder, 0.5);
      P.y = Math.max(P.y, W.heightAt(P.x, P.z) + 0.65);
      levelLook(camera, direction);
    }
    this.camPos.copy(P);
  };
  player.updateCamera = function (dt, camera) {
    roadPoint(this.u.pos, road);
    if (onNarrowRoad()) this.pitch = Math.max(-0.45, Math.min(0.25, this.pitch));
    updateCamera.call(this, dt, camera);
    clampCamera.call(this, camera);
  };
  // 近い敵へ視点を切り替えた後も、同じ道・目線で最後に確かめる。
  // 地図・写真モードは描く側が除き、麓と一人称は上の条件でそのまま通す。
  rt.world.clampDrawCamera = (camera) => clampCamera.call(player, camera);
}
// 消火後の陣口と包囲の夜も、同じ夜討ちの迎撃として扱う。山道の攻めには適用しない。
function igaHoldingRaid(rt) {
  const F = rt.flags;
  return F.step === 1 || (F.step === 1.5 || F.step === 2.5 || F.step === 3) &&
    !!F.dp?.on && F.dp.cur?.s.kind === 'hold';
}
// 夜討ちだけ、敵ごとの横・後ろの最初の一撃を受け流し、向き直る間を残す。
function igaRaidGrace(rt) {
  const player = rt.player, takeDamage = player.takeDamage;
  player.takeDamage = function (amount, src) {
    const u = this.u, F = rt.flags;
    if (amount > 0 && src?.pos && !src.isStruct && src.team !== u.team) F.igaLastAttacker = src;
    if (igaHoldingRaid(rt) && Number.isFinite(amount) && amount > 0 && src?.pos && !src.isStruct &&
        src.team !== u.team && u.hitKind !== 'gun' && u.hitKind !== 'arrow' && !u.hitArmor) {
      const dx = src.pos.x - u.pos.x, dz = src.pos.z - u.pos.z;
      const dot = (dx * Math.sin(u.heading) + dz * Math.cos(u.heading)) / (Math.hypot(dx, dz) || 1);
      if (F.rearGraceUntil > rt.t || dot < 0.5 && (rt.t - (F.step === 1 ? F.stepT : F.dp.cur.t0) < 16 || src.igaRearReadyAt > rt.t)) {
        u.hitKind = null; u.hitHorse = false; return 0;
      }
      if (dot < 0.5 && !src.igaRearParried) {
        src.igaRearParried = true; F.rearGraceUntil = rt.t + 1.2;
        igaRaidNotice(rt, src);
        rt.stats.parries++; sfx('parry', 1);
        u.hitKind = null; u.hitHorse = false; return 0;
      }
    }
    return takeDamage.call(this, amount, src);
  };
}
function igaRaidNotice(rt, u) {
  const F = rt.flags;
  // 遠い足音のために消火の案内を隠さない。すぐそばの敵への警告は残す。
  if (rt.holdId?.startsWith('f') && u?.pos && rt.distTo(u.pos) > 6) return;
  if (u?.pos) rt.hud.damageFrom(Math.atan2(u.pos.x - rt.player.pos.x, u.pos.z - rt.player.pos.z) - rt.player.yaw);
  if (F.igaRearNoticeAt > rt.t) return;
  F.igaRearNoticeAt = rt.t + 8;
  rt.bark('足音！　印の方へ構えよ', true);
}
// 竿・乳・布は全戦共通の幟を使う。
function igaNobori(W, x, z, kind, h) {
  return nobori(W, x, z, kind, h);
}
// この戦の馬廻だけ、派手な青と白を落とす。作る時に指定し、顔の既存の陰影と髭を使う。
function igaAllyDress(rt) {
  const addUnit = rt.army.addUnit;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g2 = c.getContext('2d'), grad = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.24)'); grad.addColorStop(0.4, 'rgba(0,0,0,0.16)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g2.fillStyle = grad; g2.fillRect(0, 0, 64, 64);
  const shadowTex = new THREE.CanvasTexture(c);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const dispose = rt.dispose;
  rt.dispose = function () { const result = dispose.call(this); shadowMat.dispose(); shadowTex.dispose(); return result; };
  rt.army.addUnit = function (g, o) {
    if (g.team === 0 && (o.type === 'samurai' || o.type === 'cavalry' || o.type === 'busho')) {
      o = { ...o, skin: o.skin ?? 0x966b4c, dirt: o.dirt ?? 0.4,
        ...(!o.name ? { armor: 0x1c2835, lace: 0x485061, cloth: 0x353c42, face: [2, 4, 5, 10][g.units.length % 4] } : {}) };
    }
    const u = addUnit.call(this, g, o);
    u.igaGrounded = true;
    if (u.blob) { u.blob.material = shadowMat; u.blob.scale.set(0.85 + (u.id % 5) * 0.09, 1, 0.7 + (u.id % 7) * 0.07); }
    return u;
  };

}
// 炎二つと屋根の赤みを一緒に消す。焼けた茅は残し、任務の数え方は変えない。
function igaDouseFire(rt, i) {
  const F = rt.flags, h = F.huts[i];
  rt.world.removeFire(F.fires[i]); F.fires[i] = null;
  rt.world.removeFire(h.roofFire); h.roofFire = null;
  if (h.burnMat) h.burnMat.emissive.setHex(0x000000);
}
// 伊賀だけの母衣。共有の形を複製し、布と竹の輪に同じ厚みを持たせる。
function igaHoroDetail(rt) {
  const shapes = new Map(), meshes = new WeakSet();
  function shape(original) {
    if (!original?.attributes.uv || !original.attributes.normal) return original;
    if (shapes.has(original)) return shapes.get(original);
    const uv = original.attributes.uv, pos = original.attributes.position;
    const cloth = (i) => uv.getX(i) > 0.75 && uv.getX(i) < 0.875 && uv.getY(i) > 0 && uv.getY(i) < 0.25;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < pos.count; i++) if (cloth(i)) {
      x0 = Math.min(x0, pos.getX(i)); x1 = Math.max(x1, pos.getX(i));
      y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i));
      z0 = Math.min(z0, pos.getZ(i)); z1 = Math.max(z1, pos.getZ(i));
    }
    if (x0 === Infinity) { shapes.set(original, original); return original; }
    const copy = original.clone(), p = copy.attributes.position, n = copy.attributes.normal;
    const cx = (x0 + x1) / 2, cy = y1 - (y1 - y0) * 0.12, cz = z1;
    for (let i = 0; i < p.count; i++) {
      const isCloth = cloth(i), u = uv.getX(i), v = uv.getY(i);
      // 竹と緒だけを拾う。鎧・陣羽織・刀・旗の竿は縮めない。
      const frame = ((u > 0.125 && u < 0.25 && v < 0.125) || (u > 0.875 && v < 0.25)) &&
        p.getX(i) >= x0 - 0.01 && p.getX(i) <= x1 + 0.01 &&
        p.getY(i) >= y0 && p.getY(i) <= y1 && p.getZ(i) >= z0 && p.getZ(i) <= z1 + (y1 - y0) * 0.22;
      if (!isCloth && !frame) continue;
      let relief = 0;
      if (isCloth) {
        const s = (u - 0.75) * 8, t = v * 4;
        // 二本の輪を布の張りとして浮かせ、はぎ目の谷と裾のひだを残す。
        const rings = Math.exp(-Math.pow((t - 0.34) / 0.055, 2)) + Math.exp(-Math.pow((t - 0.72) / 0.055, 2));
        relief = (y1 - y0) * (0.035 * rings - 0.025 * Math.pow(Math.abs(Math.cos(s * Math.PI * 12)), 8));
        for (const key of ['color', 'col2']) {
          const c = copy.attributes[key];
          if (!c) continue;
          // 赤・黒の染めは保ち、白い布だけ薄い黄の染めへ。裏地の暗さも保つ。
          const r = c.getX(i), g = c.getY(i), b = c.getZ(i);
          if (r > 0.18 && g > r * 0.75 && b > r * 0.65) c.setXYZ(i, r * 0.92, g * 0.80, b * 0.52);
        }
      }
      // 戦の指定で丸い籠を使う。横幅を倍にせず、竹と布を同じ断面に保つ。
      p.setXYZ(i, p.getX(i) + n.getX(i) * relief,
        cy + (p.getY(i) - cy + n.getY(i) * relief) * 0.85,
        cz + (p.getZ(i) - cz + n.getZ(i) * relief) * 0.85);
    }
    // 布目の絵と既存の背の骨による風のなびきは、そのまま使う。
    copy.computeVertexNormals(); copy.computeBoundingBox(); copy.computeBoundingSphere();
    shapes.set(original, copy); shapes.set(copy, copy);
    return copy;
  }
  const dressMesh = (m) => {
    if (m.material?.map !== UNIT_MAT.map || !m.geometry) return;
    m.geometry = shape(m.geometry);
    if (meshes.has(m)) return;
    meshes.add(m);
    const lod = m.userData.lod;
    if (lod) { lod[0] = shape(lod[0]); lod[1] = shape(lod[1]); }
    const before = m.onBeforeRender;
    // 形を入れ替える仕掛けの無い部品には足さない（足すと兵の束へまとめられず一つずつ描く）
    if (!lod && before === THREE.Object3D.prototype.onBeforeRender && !m.isSkinnedMesh) return;
    m.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
      before.call(this, renderer, scene, camera, geometry, material, group);
      this.geometry = shapes.get(this.geometry) || this.geometry;
    };
  };
  rt.flags.igaHoroDress = () => {
    for (const u of rt.army.units) if (u.look?.horo && !u.gone) {
      u.mesh?.traverse(dressMesh); u.human?.root?.traverse(dressMesh);
    }
  };
  const dispose = rt.dispose;
  rt.dispose = function () {
    const result = dispose.call(this);
    for (const [original, copy] of shapes) if (original !== copy) copy.dispose();
    shapes.clear(); return result;
  };
}
// 伊賀の小屋だけの板肌。絵と材質は使い回し、共通の木肌には手を加えない。
let igaWoodMat = null;
function igaHut(W, x, z, w, d, rot = 0, o = {}) {
  const m = hut(W, x, z, w, d, rot, { ...o, thatchTies: true });
  const walls = m.children[0], bodies = [];
  // 壁も近景・遠景を持つ。屋根を板壁と取り違えず、両方の壁へ同じ仕上げを渡す。
  walls?.traverse((part) => {
    if (part.isMesh && part.material) { bodies.push(part); part.userData.camSurfaceFade = true; }
  });
  const body = bodies[0];
  // 消火で参照する屋根と壁を、静止物の束へ移さない。
  m.userData.noMerge = true;
  const roof = m.children[1];
  let roofMesh;
  roof?.traverse((part) => { if (!roofMesh && part.isMesh && part.material) roofMesh = part; });
  if (roofMesh) {
    // 共有材質に後から付く見通しの処理を引き継がず、茅の絵・色・厚みを残す。
    const material = roofMesh.material.clone();
    material.userData.camNearSolid = true; material.transparent = false; material.depthWrite = true;
    // 近景・遠景を持つ屋根も、入れ物でなく実際の茅の面を守る。
    roof.traverse((part) => { if (part.isMesh) { part.material = material; part.userData.camSurfaceFade = true; } });
    m.userData.igaRoofMat = material;
  }
  // 小屋ごと隠すと軒の炎だけ空中に残る。壁よけで視点を寄せ、板壁は残す。
  if (roof) roof.userData.camSurfaceFade = true;
  // まとめて描く小屋（材質を持たない入れ物）には板肌を貼らない（10/19：伊賀が始まらなかった）
  if (!body?.material || !roofMesh) return m;
  if (!igaWoodMat) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), bw = 256 / 6;
    g.fillStyle = '#e2d3b8'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? '#d9c9af' : '#e2d3b8'; g.fillRect(i * bw, 0, bw, 256);
      g.fillStyle = '#b7a68c'; g.fillRect(i * bw, 0, 3, 256);
      g.fillStyle = '#70614e'; g.fillRect(i * bw, 0, 1, 256);
      g.fillStyle = '#eee0c7'; g.fillRect(i * bw + 3, 0, 1, 256);
      for (let k = 1; k < 8; k++) {
        g.strokeStyle = 'rgba(105,82,55,0.16)'; g.lineWidth = 0.6; g.beginPath();
        for (let y = 0; y <= 256; y += 8) {
          const px = i * bw + k * bw / 8 + Math.sin(y * 0.026 + i + k) * 0.7;
          if (y === 0) g.moveTo(px, y); else g.lineTo(px, y);
        }
        g.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    igaWoodMat = body.material.clone(); igaWoodMat.map = tex; igaWoodMat.bumpMap = tex; igaWoodMat.bumpScale = 0.018;
    igaWoodMat.userData.camNearSolid = true;
    igaWoodMat.transparent = false; igaWoodMat.depthWrite = true;
    const compile = body.material.onBeforeCompile;
    igaWoodMat.onBeforeCompile = (sh, renderer) => {
      compile.call(igaWoodMat, sh, renderer);
      // 前の戦で共有の木材に付いた透かしも止める。消火中に地面が板壁を透けない。
      if (sh.uniforms.camNearFade) sh.uniforms.camNearFade = { value: 0 };
      // 汚れの帯は絵の繰り返しや壁の大きな三角形で上まで伸ばさない。
      sh.vertexShader = 'varying float vIgaWoodY;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n vIgaWoodY = position.y;');
      sh.fragmentShader = 'varying float vIgaWoodY;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 1.0 - clamp((0.6 - vIgaWoodY) / 0.6, 0.0, 1.0) * 0.15;');
    };
    igaWoodMat.customProgramCacheKey = () => 'iga-board-wall';
  }
  for (const part of bodies) {
    part.material = igaWoodMat;
    const geo = part.geometry, p = geo.attributes.position, n = geo.attributes.normal;
    const uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      // 壁の向きが変わっても継ぎ目は縦。幅約四十センチの板として大きさをそろえる。
      uv.setXY(i, (Math.abs(n.getZ(i)) >= Math.abs(n.getX(i)) ? p.getX(i) : p.getZ(i)) / 2.6, p.getY(i) / 2.6);
    }
  }
  return m;
}
const FORT = { x: SHU.x, z: SHU.z, r: 18 };       // 比自山城・主郭（観音寺跡。口は南）
const NAGATA = { x: -150, z: -60 };               // 長田丸（伊賀衆を支える小城館・丘の上）
const ASAYA = { x: 160, z: -40 };                 // 朝屋丸（同上。山から下りた伊賀衆の連絡先）
import { jinkeiBuild } from './jinkei.js';
import { timeslipField } from './timeslip_field.js';
// 大手の道は南の土橋を必ず通り、曲輪の口と同じ中心線を使う。
const ROAD = [...APPROACH, ...RIDGE.slice(1)];

// 視点の前後も折れ目をたどる。入れ物は準備時の物を使い回す。
function igaRoadSight(s, direction, distance, out, stopAtCorner = false) {
  let i = Math.max(0, Math.min(ROAD.length - 2, Math.floor(s)));
  let t = Math.max(0, Math.min(1, s - i));
  for (let n = 0; n < ROAD.length; n++) {
    const a = ROAD[i], b = ROAD[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const length = Math.hypot(dx, dz), left = length * (direction > 0 ? 1 - t : t);
    if (distance <= left && length > 0) {
      t += direction * distance / length;
      out.x = a[0] + dx * t; out.z = a[1] + dz * t; return out;
    }
    out.x = direction > 0 ? b[0] : a[0]; out.z = direction > 0 ? b[1] : a[1];
    // 視線は折れ目の手前へ向ける。六歩先への直線で切岸を横切らない。
    // すぐ足もとの角は通し、角に着いた時は次の道を見せる。
    // 角の真上で後ろの距離をゼロにしない。半歩以内なら前の道へ戻し、
    // 視点と本人の間の切岸は igaSlopeCamera 側で調べる。
    if (stopAtCorner && (stopAtCorner === 'rear' ? left > 0.6 : left > 1)) return out;
    distance -= left; i += direction; t = direction > 0 ? 0 : 1;
    if (i < 0 || i >= ROAD.length - 1) return out;
  }
  return out;
}

// 坂を直線で横切らず、作った道の折れ目と曲輪の口を通る。
// 道の位置と次の一歩は兵ごとに使い回し、調べ直すのは短い間隔を置く。
function roadPoint(p, out) {
  out.d = Infinity;
  let best = Infinity;
  for (let i = 1; i < ROAD.length; i++) {
    const a = ROAD[i - 1], b = ROAD[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
    // 折り返しは上下に重なる。平面の近さだけでは上の道を選び、切岸へ案内してしまう。
    const segment = GRADED?.[i - 1];
    const dy = Number.isFinite(p.y) && segment ? p.y - igaRoadHeight(segment, t) : 0;
    const score = d * d + dy * dy;
    if (score < best) { best = score; out.x = x; out.z = z; out.d = d; out.s = i - 1 + t; }
  }
}
// 退く旗も山道の踏み面へ置く。道の指定だけでは、隣の切岸まで歩ける扱いになる。
// 共通の候補探しが半秒ごとに呼ぶ。調べる点と道の位置は戦ごとに使い回す。
function igaRetreatPointAllowed(rt, point) {
  const W = rt.world;
  if (W.slopeTan(point.x, point.z) > 0.7) return false;
  if (point.z >= APPROACH[0][1] || point.z <= SHU.z - 18) return true;
  const q = rt.flags.retreatRoad || (rt.flags.retreatRoad = { x: 0, z: 0, d: 0 });
  const probe = rt.flags.retreatProbe || (rt.flags.retreatProbe = { x: 0, y: 0, z: 0 });
  probe.x = point.x; probe.z = point.z; probe.y = W.heightAt(point.x, point.z);
  roadPoint(probe, q);
  return q.d <= 2.5;
}
function igaRetreatPathAllowed(rt, point) {
  if (!igaRetreatPointAllowed(rt, point)) return false;
  const p = rt.player.u.pos, W = rt.world;
  const probe = rt.flags.retreatProbe;
  // 陣の候補では、山道用の点がまだ作られていないことがある。
  const end = probe || (rt.flags.retreatProbe = { x: 0, y: 0, z: 0 });
  end.x = point.x; end.z = point.z; end.y = W.heightAt(point.x, point.z);
  if (!localClear(rt.army, p, end, true)) return false;
  // 行き先だけが平らでも、途中で柵や隣の折り返しを横切る線は案内しない。
  const dx = point.x - p.x, dz = point.z - p.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.75));
  for (let i = 1; i < steps; i++) {
    end.x = p.x + dx * i / steps; end.z = p.z + dz * i / steps;
    if (!igaRetreatPointAllowed(rt, end)) return false;
  }
  return true;
}
// 陣の小屋や焚き火の当たりは、塀の検査だけでは分からない。
// 準備時に作った角を使い、壁へ進んで押し戻される前に外側へ回る。
const CAMP_AXES = ['x', 'z'];
function campCross(a, b, box) {
  // 線の両端が同じ外側なら、割り算をせず通れると分かる。
  if ((a.x <= box.x0 + 0.4 && b.x <= box.x0 + 0.4) ||
      (a.x >= box.x1 - 0.4 && b.x >= box.x1 - 0.4) ||
      (a.z <= box.z0 + 0.4 && b.z <= box.z0 + 0.4) ||
      (a.z >= box.z1 - 0.4 && b.z >= box.z1 - 0.4)) return false;
  let lo = 0, hi = 1;
  for (const key of CAMP_AXES) {
    const d = b[key] - a[key], min = box[key + '0'] + 0.4, max = box[key + '1'] - 0.4;
    if (Math.abs(d) < 1e-8) { if (a[key] <= min || a[key] >= max) return false; }
    else {
      const t0 = (min - a[key]) / d, t1 = (max - a[key]) / d;
      lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
      if (lo >= hi) return false;
    }
  }
  return hi > 0 && lo < 1;
}
function igaCampWay(army, u, goal) {
  const boxes = army.igaCampBoxes;
  if (!boxes || u.pos.z < 10) return goal;
  const q = u._igaCampWay || (u._igaCampWay = { x: 0, z: 0, gx: 0, gz: 0, active: false, t: -1, next: null, end: { x: 0, z: 0 }, botRadius: 0.35 });
  // 兵の持ち場が小屋の中なら、今いる側の外縁へ寄せる。消火の中心印はそのまま使う。
  if (!u.isPlayer) for (const box of boxes) {
    if (goal.x <= box.x0 || goal.x >= box.x1 || goal.z <= box.z0 || goal.z >= box.z1) continue;
    const end = q.end; end.x = goal.x; end.z = goal.z;
    const left = Math.hypot(u.pos.x - box.x0, u.pos.z - goal.z), right = Math.hypot(u.pos.x - box.x1, u.pos.z - goal.z);
    const south = Math.hypot(u.pos.x - goal.x, u.pos.z - box.z0), north = Math.hypot(u.pos.x - goal.x, u.pos.z - box.z1);
    const nearest = Math.min(left, right, south, north);
    if (nearest === left) end.x = box.x0; else if (nearest === right) end.x = box.x1;
    else if (nearest === south) end.z = box.z0; else end.z = box.z1;
    goal = end;
  }
  const sameGoal = Math.hypot(goal.x - q.gx, goal.z - q.gz) < 0.75;
  // 古い角へ戻り続けたり、別の小屋に阻まれたまま待ったりしない。
  if (q.active && !(q.checkAt > army.time)) {
    if (Math.hypot(u.pos.x - (q.px ?? u.pos.x), u.pos.z - (q.pz ?? u.pos.z)) < 0.3) q.active = false;
    q.px = u.pos.x; q.pz = u.pos.z; q.checkAt = army.time + 1.5;
  }
  // 一つ目の角に着いたら、覚えておいた二つ目へ進む。同じ角を選び直さない。
  if (q.active && sameGoal && q.next && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) <= 0.8) {
    q.x = q.next.x; q.z = q.next.z; q.next = null;
  }
  if (q.active && sameGoal && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 0.8) return q;
  if (!q.active && q.t > army.time && Math.hypot(goal.x - q.gx, goal.z - q.gz) < 1) return goal;
  q.active = false; q.next = null; q.t = army.time + 0.35; q.gx = goal.x; q.gz = goal.z;
  for (const box of boxes) {
    // 消火の印は小屋の中心。外から水が届くので、中心を囲む角へは誘導しない。
    if (goal.x > box.x0 && goal.x < box.x1 && goal.z > box.z0 && goal.z < box.z1) continue;
    if (!campCross(u.pos, goal, box)) continue;
    // 壁の外でも、体の余裕を含む帯の中から歩き始めることがある。
    if (u.pos.x > box.x0 && u.pos.x < box.x1 && u.pos.z > box.z0 && u.pos.z < box.z1) {
      const left = u.pos.x - box.x0, right = box.x1 - u.pos.x, south = u.pos.z - box.z0, north = box.z1 - u.pos.z;
      const nearest = Math.min(left, right, south, north);
      q.x = u.pos.x; q.z = u.pos.z;
      if (nearest === left) q.x = box.x0; else if (nearest === right) q.x = box.x1;
      else if (nearest === south) q.z = box.z0; else q.z = box.z1;
      q.active = true; return q;
    }
    // 角同士の通行と距離は準備時に済ませる。動く両端だけ四本ずつ調べる。
    let exits = 0;
    for (let j = 0; j < 4; j++) {
      let blocked = false;
      for (const ob of boxes) if (campCross(box.corners[j], goal, ob)) { blocked = true; break; }
      if (!blocked) exits |= 1 << j;
    }
    let best = Infinity, first = null, second = null;
    for (let i = 0; i < 4; i++) {
      const a = box.corners[i];
      let blocked = false;
      for (const ob of boxes) if (campCross(u.pos, a, ob)) { blocked = true; break; }
      if (blocked) continue;
      const start = Math.hypot(a.x - u.pos.x, a.z - u.pos.z);
      for (let j = 0; j < 4; j++) {
        const b = box.corners[j];
        if (!(exits & (1 << j)) || !box.links[i * 4 + j]) continue;
        const length = start + box.lengths[i * 4 + j] + Math.hypot(goal.x - b.x, goal.z - b.z);
        if (length < best) { best = length; first = a; second = b; }
      }
    }
    if (first) {
      // 既に着いた角を経由点にせず、出口側の角へ歩く。
      const atFirst = Math.hypot(first.x - u.pos.x, first.z - u.pos.z) <= 0.8;
      const point = atFirst ? second : first;
      q.x = point.x; q.z = point.z; q.next = !atFirst && second !== first ? second : null;
      q.active = true; return q;
    }
  }
  return goal;
}
function igaCombatSpace(army, u) {
  const p = u.pos;
  // 押し合いで切岸へ出た近接兵は、追撃をやめて同じ段の道へ戻る。
  // 麓の迎撃・土橋の平場・曲輪の射手の持ち場は変えない。
  if (p.z < 12 && p.z > -42 && Math.abs(p.x) < 30 && u.type !== 'bow' && u.type !== 'gun' && !u.group?.ambush) {
    const bank = u._igaBank || (u._igaBank = { x: 0, z: 0, d: 0, t: 0 });
    if (bank.t <= army.time) {
      roadPoint(p, bank); bank.t = army.time + 0.35;
      // 道の縁を往復して攻撃を再開せず、踏み面まで戻ってから構える。
      // 同じ高さの縁でも戻す。高低差を待つと、先に後続が重なって切岸へ押し出す。
      bank.returning = bank.d < 16 && (bank.returning ? bank.d > 1 : bank.d > 2.2);
    }
    if (bank.returning && Math.hypot(bank.x - p.x, bank.z - p.z) > 0.6) return bank;
  }
  const post = u.group?.igaRaidPost;
  // 守る輪は十六メートル。輪の内の本人から敵を引き戻さず、外へ退いた本人は追わせない。
  if (post && !u.fleeing && !u.group.routed && !u.woundOut &&
      (u.group.order === 'hold' && Math.hypot(p.x - post.x, p.z - post.z) > 18 ||
       (u.target?.isPlayer || u.atk?.target?.isPlayer || u.swing?.target?.isPlayer) &&
       Math.hypot(army.playerUnit.pos.x - post.x, army.playerUnit.pos.z - post.z) > 16)) return post;
  // 夜討ちは二人まで本人へ寄せ、後続は味方の兵と戦う。山道の人数は変えない。
  const player = army.playerUnit, front = army.igaFront;
  const limit = army.igaRaidFrontUntil > army.time ? army.igaRaidRecovering ? 1 : 2 : 5;
  if (front && player?.alive && u.team !== player.team && !u.noTarget && !u.group?.retreatOnly &&
      !((u.type === 'gun' || u.type === 'bow') && !u.sidearm) && !u.fleeing && !u.group?.routed && !u.group?.ambush) {
    if (army.igaFrontAt !== army.time) {
      army.igaFrontAt = army.time; front.length = 0;
      for (const o of army.units) {
        if (!o.alive || o.team === player.team || o.fleeing || o.woundOut || o.noTarget || o.isStruct || o.group?.ambush || o.group?.routed) continue;
        // 味方と組み合う兵や、壁・段差の向こうの兵で本人への二人枠を埋めない。
        if (o.target?.alive && o.target !== player && !o.target.fleeing && !o.target.woundOut && !o.target.noTarget &&
            o.atk?.target !== player && o.swing?.target !== player && o.bind?.o !== player) continue;
        o._igaPlayerD = Math.hypot(o.pos.x - player.pos.x, o.pos.z - player.pos.z);
        if (o._igaPlayerD > 14 || o.group?.retreatOnly || ((o.type === 'gun' || o.type === 'bow') && !o.sidearm)) continue;
        if (Math.abs(o.pos.y - player.pos.y) > 3 || army.wallBetween(o.pos, -1, player.pos)) continue;
        let i = 0;
        while (i < front.length && front[i]._igaPlayerD <= o._igaPlayerD) i++;
        if (i < limit) {
          const end = Math.min(limit - 1, front.length);
          for (let j = end; j > i; j--) front[j] = front[j - 1];
          front[i] = o;
        }
      }
    }
    const dx = p.x - player.pos.x, dz = p.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d < 12 && !front.includes(u) && (d < 8 || u.target === player || u.atk?.target === player)) {
      // 味方を狙う後続も本人の肩を囲まない。まず一歩離れ、その後で別の味方と組み合う。
      if (d < 3.5) {
        const q = u._igaWait || (u._igaWait = { x: 0, z: 0 });
        const a = d > 0.1 ? Math.atan2(dx, dz) : u.heading;
        q.x = player.pos.x + Math.sin(a) * 4.5; q.z = player.pos.z + Math.cos(a) * 4.5;
        return q;
      }
      // 本人へ届かぬ後続は、近くの足軽と槍を合わせる。味方を狙う斬撃は取り消さない。
      if (u.target?.alive && u.target.team === player.team && u.target !== player &&
          !u.target.fleeing && !u.target.woundOut && !u.target.noTarget) {
        // 狙いを変えた直後にも、本人へ向けた古い横槍を残さない。
        if (u.atk?.target === player) u.atk = null;
        if (u.swing?.target === player) u.swing = null;
        if (u.bind?.o === player) u.bind = null;
        return null;
      }
      let foe = null, near = 8;
      for (const o of army.units) {
        if (!o.alive || o.team !== player.team || o === player || o.fleeing || o.woundOut || o.noTarget || o.isStruct || o.group?.civ) continue;
        const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
        if (d < near && Math.hypot(o.pos.x - player.pos.x, o.pos.z - player.pos.z) >= 4 &&
            Math.abs(o.pos.y - p.y) < 3 && !army.wallBetween(p, -1, o.pos)) { foe = o; near = d; }
      }
      if (foe) {
        u.target = foe; u.atk = null; u.swing = null; u.bind = null; u.moveTo = null;
        return null;
      }
      const q = u._igaWait || (u._igaWait = { x: 0, z: 0 });
      const a = d > 0.1 ? Math.atan2(dx, dz) : u.heading;
      q.x = player.pos.x + Math.sin(a) * 9; q.z = player.pos.z + Math.cos(a) * 9;
      return q;
    }
  }
  return null;
}
function igaWay(army, u, goal) {
  const p = u.pos;
  // 本人を囲まないための待ち位置も、坂では同じ段の道に置く。
  // 陣だけの迂回で返すと、山道の兵が九歩先の切岸へ直進してしまう。
  if (goal === u._igaWait && p.z < 12 && p.z > -42 && Math.abs(p.x) < 30) {
    const wait = u._igaWaitRoad || (u._igaWaitRoad = { x: 0, z: 0, y: 0 });
    goal.y = p.y;
    roadPoint(goal, wait); wait.y = army.world.heightAt(wait.x, wait.z);
    goal = wait;
  }
  const campGoal = igaCampWay(army, u, goal);
  if (campGoal !== goal) return campGoal;
  // 道沿いに求めた二列の歩き先を、全員同じ折れ目へ集め直さない。
  if (goal === u._columnWay) return goal;
  // 陣の中の迎撃や、東西の林の兵には山道の行軍を強いない。
  if (Math.min(p.z, goal.z) > 12 || Math.max(Math.abs(p.x), Math.abs(goal.x)) > 32) return goal;
  // 折り返しでは真上の敵も平面で三メートル以内になる。近さだけで道の迂回を外さない。
  const d = Math.hypot(goal.x - p.x, goal.z - p.z);
  if (!(p.z < 12 && p.z > -42) && d < 3 && Math.abs(army.world.heightAt(goal.x, goal.z) - p.y) < 1.2 &&
      localClear(army, p, goal, true)) return goal;
  return igaRoadWay(army, u, goal);
}
function igaRoadWay(army, u, goal) {
  const p = u.pos;
  const q = u._igaWay || (u._igaWay = { x: 0, z: 0, t: -1, gx: 0, gz: 0, active: false, from: {}, to: {}, botRadius: 0.35 });
  if (q.t > army.time && Math.hypot(goal.x - q.gx, goal.z - q.gz) < 2 &&
      (!q.active || Math.hypot(q.x - p.x, q.z - p.z) > 1)) return q.active ? q : goal;
  q.t = army.time + 0.35; q.gx = goal.x; q.gz = goal.z; q.active = false;
  roadPoint(p, q.from); roadPoint(goal, q.to);
  if (q.from.d > 20 || q.to.d > 20) return goal;
  // 同じ段の踏み面では各自の持ち場へ進む。角へ集中して互いを切岸へ押さない。
  if (Math.floor(q.from.s) === Math.floor(q.to.s) && q.from.d <= 2.2 && q.to.d <= 2.2 &&
      localClear(army, p, goal, true)) return goal;
  q.active = true;
  if (q.from.d > 2.8) { q.x = q.from.x; q.z = q.from.z; return q; }
  const forward = q.to.s > q.from.s;
  let i = forward ? Math.floor(q.from.s) + 1 : Math.ceil(q.from.s) - 1;
  if (i >= 0 && i < ROAD.length && Math.hypot(ROAD[i][0] - p.x, ROAD[i][1] - p.z) < 0.85) i += forward ? 1 : -1;
  if (i < 0 || i >= ROAD.length || (forward ? i > q.to.s : i < q.to.s)) {
    q.active = false; return goal;
  }
  q.x = ROAD[i][0]; q.z = ROAD[i][1];
  return q;
}

function igaFleeWay(army, u, goal) {
  const path = u.group?.igaRetreat;
  if (!path?.length) return goal;
  const q = u._igaFlee || (u._igaFlee = { x: 0, z: 0, i: 0 });
  if (q.i >= path.length) return goal;
  while (q.i < path.length && Math.hypot(u.pos.x - path[q.i][0], u.pos.z - path[q.i][1]) < 2) q.i++;
  if (q.i >= path.length) return goal;
  q.x = path[q.i][0]; q.z = path[q.i][1];
  return q;
}

// 土橋の直線距離へ向かわせず、兵と同じ九十九折りの次の口を案内する。
function igaBridgeWay(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  // 土橋の持ち場へ届いたら折れ目の案内を終える。横へ避けても坂へ引き戻さない。
  const atBridge = Math.hypot(p.x - F.bridge.x, p.z - F.bridge.z) <= 12 &&
    Math.abs(p.y - rt.world.heightAt(F.bridge.x, F.bridge.z)) < 3;
  // 通った角を覚える。折れ目で上下の道が同じ近さになっても、前の角へ戻さない。
  roadPoint(p, F.bridgeRoad);
  const last = BRIDGE_ROAD_INDEX;
  let i = F.bridgeWayIndex;
  if (F.bridgeRoad.d < 2.8 && F.bridgeRoad.s > i) i = Math.min(last, Math.floor(F.bridgeRoad.s) + 1);
  while (i < last && Math.hypot(p.x - APPROACH[i][0], p.z - APPROACH[i][1]) < 1.4 &&
      Math.abs(p.y - rt.world.heightAt(APPROACH[i][0], APPROACH[i][1])) < 2) i++;
  F.bridgeWayIndex = i;
  F.bridgeWayActive = !atBridge;
  F.bridgeNext.x = atBridge ? F.bridge.x : APPROACH[i][0];
  F.bridgeNext.z = atBridge ? F.bridge.z : APPROACH[i][1];
  return F.bridgeNext;
}

// 備えごとの人数・細かな持ち場は復元値。総勢とは別に本物の兵を増やさない。
// 名の伝わらない持ち場に架空の将を置かず、旗と紋は既存の家の物で示す。
function sonaePlan(name, team, honjin, facing, rows) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, sonae: rows.map(([id, role, general, soldiers, x, z, face, flag, mon, count = 0, w = 14, d = 8]) => ({
    id, role, general, soldiers, at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
    facing: face, flag, mon, count, w, d, bindOnly: count === 0,
  })) };
}

// 作るのは準備時の軽い備えだけ。台本の近い兵・前進・退去を優先する。
function buildSonae(rt, plans) {
  const hosts = [];
  for (const plan of plans) jinkeiBuild(rt, plan, (s, at) => {
    const h = rt.world.addDistantArmy({ ...at, w: s.w, d: s.d, count: s.count, facing: s.facing,
      team: plan.team, armor: plan.team ? 0x34302a : 0x2b3140, flagTex: flagTexture(s.flag), mon: s.mon,
      // 陣を守る控えと山腹の守備は徒歩。混成の既定で騎馬を陣内へ出さない。
      flagRate: plan.team ? 0 : 0.15, banners: 0, kind: 'spear', general: s.general === '名は伝わらない' ? undefined : s.general, seed: 15810 + hosts.length });
    // 遠景の兵が近くで省かれても、布だけ残さない。持ち場の幟は竿ごと地面へ立てる。
    for (const side of [-1, 1]) {
      const offset = side * (s.w / 2 + 1);
      rt.scene.add(igaNobori(rt.world, at.x + Math.cos(s.facing) * offset, at.z - Math.sin(s.facing) * offset, s.flag, 5.2));
    }
    h.army.noWake = false;
    h.army.jinkeiGuard = true;
    hosts.push(h);
    return h;
  });
  return hosts;
}

// 信長公記は侵攻の口、伊乱記・伊賀市の城跡資料は蒲生・堀・筒井の囲みを根拠とする。
// 北伊賀の土豪の曲輪別の将名・旗紋は確定せず、丸は見分けるための代用。
const IGA_ATTACK = sonaePlan('比自山の囲み', 0, { x: CAMP.x + 24, z: CAMP.z + 56 }, Math.PI, [
  ['honjin', '本陣', '堀秀政', 5000, CAMP.x + 24, CAMP.z + 56, Math.PI, 'oda', 'none'],
  ['niwa', '南の仕寄り', '丹羽長秀', 2000, -70, 70, Math.PI, 'sujikai', 'sujikai', 160, 28, 10],
  ['gamo', '東の包囲陣', '蒲生忠三郎', 4000, 70, -40, -Math.PI / 2, 'oda', 'none', 160, 24, 10],
  ['tsutsui', '西の包囲陣', '筒井順慶', 4000, -90, -40, Math.PI / 2, 'igeta', 'igeta', 160, 24, 10],
]);
const IGA_DEFEND = sonaePlan('曲輪と尾根の守り', 1, SHU, 0, [
  ['shu', '主郭の南辺', '名は伝わらない', 1500, SHU.x - 8, SHU.z, 0, 'maru', 'none', 48, 8, 8],
  ['kita', '北の尾根曲輪', '名は伝わらない', 800, KITA.x, KITA.z, Math.PI, 'maru', 'none', 32, 8, 6],
  ['kitasoto', '北外郭の退き口', '名は伝わらない', 500, KITASOTO.x, KITASOTO.z, Math.PI, 'maru', 'none', 24, 7, 6],
  ['higashi', '東の脇曲輪', '名は伝わらない', 700, HIGASHI.x, HIGASHI.z, Math.PI / 2, 'maru', 'none', 32, 7, 6],
]);

const ODA = { flag: 'oda' };
// 丹羽の実兵・陣・遠景で直違の印をそろえる。旗の細かな仕様は復元。
// 家紋の根拠：二本松市「広報にほんまつ」平成三十年六月号（二頁）。
// https://www.city.nihonmatsu.lg.jp/file/webook/151/pageindices/index2.html
const NIWA = { flag: 'sujikai' };
// 伊賀の地侍と足軽。装いと指物の省略は、両軍を見分けるための復元。
// 夜の霧を白く照らしすぎず、兵の輪郭を読むための月明かりは残す。
const IGA_NIGHT = { ...NIGHT, sky: 0x27354c, fog: 0x29384c, top: 0x18273f, sun: 0xa4bbdf, sunI: 0.55, hs: 0x91a5c7, hg: 0x242630, hI: 0.4, dir: [-0.6, 0.38, -0.7], mount: 0x354966 };
function igaNight(rt) {
  // 共通の夜の時計を保ち、伊賀だけの色へ替える。光源の数は増やさない。
  applyLook(rt, NIGHT, false);
  const W = rt.world, L = IGA_NIGHT, U = W.skyMat.uniforms;
  W.scene.background.set(L.sky); W.scene.fog.color.set(L.fog);
  W.sun.color.set(L.sun); W.sun.intensity = L.sunI;
  W.hemi.color.set(L.hs); W.hemi.groundColor.set(L.hg);
  W.hemi.intensity = W.baseHemi = L.hI;
  W.sunOffset.set(...L.dir).normalize().multiplyScalar(120);
  U.top.value.set(L.top); U.bottom.value.set(L.fog);
  U.sunDir.value.set(...L.dir).normalize(); U.sunCol.value.set(L.sun);
  W.mountMats.forEach((m, k) => m.color.set(L.mount).lerp(W.scene.fog.color, [0.2, 0.4, 0.6][k]));
  W.moon?.position.copy(W.sunOffset).multiplyScalar(3.5);
  W.updateEnv(); W.lookDark = true;
}
// 本の足軽の写真：赤茶の漆胴、紺の小袖、低い円錐の陣笠と首布。形・材質は既存の物を共用する。
const IGA = { armor: 0x51362d, lace: 0xb5aa8c, cloth: 0x26343b, hat: 'jingasa', hatColor: 0x57372c, doStyle: 'okegawa', flag: null };

// 守備の範囲へ来た敵だけを案内し、林の待機兵や退く兵を追わせない。
function igaMissionEnemy(rt, leader = false) {
  const F = rt.flags, C = F.dp?.on ? F.dp.cur : null, p = rt.player.u.pos;
  const post = F.step === 2 ? F.bridge : C?.s.kind === 'hold' ? C.at : CAMP;
  if (!post) return null;
  const postY = rt.world.heightAt(post.x, post.z), radius = F.step === 2 ? 24 : 34;
  let best = null, distance = Infinity;
  for (const u of rt.army.units) {
    const g = u.group;
    if (u.team !== 1 || !igaReady(u) || u.gone || u.dying || u.isStruct || !g ||
        g.ambush || g.retreatOnly || g.civ || leader && u !== F.igaBoss) continue;
    if (Math.hypot(u.pos.x - post.x, u.pos.z - post.z) > radius ||
        Math.abs(u.pos.y - postY) >= 3) continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (d < distance) { best = u; distance = d; }
  }
  return best;
}

// 地山（曲輪の段・堀切は heightOf が castles/hijiyama.js の縄張りから被せる）。長田丸・朝屋丸は丘の上
function baseTerrain(x, z) {
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  h += 22 * gauss(x, z, FORT.x, FORT.z, 5200) + 16 * gauss(x, z, NAGATA.x, NAGATA.z, 8000) + 16 * gauss(x, z, ASAYA.x, ASAYA.z, 8000);
  // 国土地理院の標高：戦場の外の遠い山並みにだけ、実際の起伏を足す（1 が実の 5m）
  // 城域と退去路の外だけに足す。読込時刻で曲輪の床や道の高さが変わらない。
  if (igDem) h += demRelief(igDem, x, z, { xy: 5, cx: 0, cz: 0, inner: 450, fade: 60, scale: 0.18 });
  return h;
}
function castleTerrain(x, z) {
  let h = baseTerrain(x, z) + yamaLift(x, z, LIFT);
  // 道だけを深く削ると、折り返しの中間に数十メートルの壁が残る。
  // 大手の山腹も道と同じ登りにそろえ、外側は広い裾へ戻す。主郭の高さは保つ。
  const edgeX = Math.max(0, Math.abs(x) - 50) / 40;
  const edgeZ = Math.max(0, z - 12, -72 - z) / 18;
  const apron = Math.max(0, 1 - Math.max(edgeX, edgeZ));
  if (apron > 0) {
    const ys = approachLevels();
    let grade = ys[z >= APPROACH[0][1] ? 0 : ys.length - 1];
    for (let i = 1; i < APPROACH.length; i++) {
      const az = APPROACH[i - 1][1], bz = APPROACH[i][1];
      if (z <= az && z >= bz) { grade = ys[i - 1] + (ys[i] - ys[i - 1]) * (az - z) / (az - bz); break; }
    }
    h += (grade - h) * apron * apron * (3 - 2 * apron);
  }
  // 陣の平場から山道を始める。小屋・迎撃線・手当ての場所へ道の切岸を作らない。
  const edge = Math.max(Math.abs(x) - 42, 12 - z, z - 108, 0);
  if (edge >= 22) return h;
  const t = 1 - edge / 22, blend = t * t * (3 - 2 * t);
  const level = baseTerrain(CAMP.x, CAMP.z) + 0.12 * Math.sin(x * 0.09) * Math.sin(z * 0.08);
  return h + (level - h) * blend;
}
const HORI_HEIGHTS = HIJIYAMA_PLAN.hori.map(h => horiboriHeight(h.pts, { depth: h.deep, width: h.w }));
function castleGround(x, z) {
  let h = castleTerrain(x, z);
  for (const dip of HORI_HEIGHTS) h += dip(x, z);
  return h;
}
let CASTLE_HEIGHT = null;
function heightRaw(x, z) {
  if (!CASTLE_HEIGHT) {
    // 南群の標高は不明。長い区画を中央一点の高さへ盛ると、麓に巨大な土壁が立つ。
    // 山腹からの切盛りを三メートル以内にし、区画の輪郭と道の踏み面は保つ。
    const south = k => ['minami', 'minaminishi', 'minamihigashi', 'minamishikaku'].includes(k.id);
    const apron = heightOf({ ...HIJIYAMA_PLAN, continuousEdges: true, kuruwa: HIJIYAMA_PLAN.kuruwa.filter(south) }, castleGround, 24);
    const castle = heightOf({ ...HIJIYAMA_PLAN, kuruwa: HIJIYAMA_PLAN.kuruwa.filter(k => !south(k)) }, castleGround, 3);
    CASTLE_HEIGHT = (px, pz) => {
      const base = castleGround(px, pz), terrace = apron(px, pz, base);
      return castle(px, pz, base + Math.max(-3, Math.min(3, terrace - base)));
    };
  }
  let h = CASTLE_HEIGHT(x, z);
  // 広げた法面を陣の小屋まで押し出さない。麓は迎撃と消火に使う同じ平場へ戻す。
  if (z > -12 && z < 108 && Math.abs(x) < 80) {
    const t = Math.max(0, Math.min(1, (z + 12) / 24));
    const side = Math.max(0, Math.min(1, (80 - Math.abs(x)) / 22));
    const level = baseTerrain(CAMP.x, CAMP.z) + 0.12 * Math.sin(x * 0.09) * Math.sin(z * 0.08);
    h += (level - h) * t * t * (3 - 2 * t) * side * side * (3 - 2 * side);
  }
  return h;
}

const iga = {
  missionSingleLine: true,
  hideMissionDots: true, hideGuideSteps: true,
  enemyTriangleSigns: true, nearbyAllySignLimit: 0,
  noDodgeCard: true, noPlayerFoot: true, quietMiss: true,
  missionPinCaption: '', missionDetail: () => '', missionStatus: () => '',
  speechAllowed: (rt) => rt.over || !!rt.flags.ending,
  bannerAllowed: (rt) => rt.over || !!rt.flags.ending,
  missions: ['ここを守れ', '火を消せ', '土橋へ進め', '土橋を守れ', '麓の陣へ戻れ', '曲輪を調べよ', '▼の敵を倒せ', '伊賀の組頭を倒せ'],
  missionOf(rt) {
    const F = rt.flags;
    if (F.step === 3.5) return 5;
    if (F.step === 2.5 && F.dp?.cur?.s.kind === 'move') return 4;
    if (F.step === 2) return F.bridgeStarted == null ? 2 : 3;
    if (F.step === 1 && igaNeedsDousing(rt) && F.doused < 3) return 1;
    const C = F.dp?.on ? F.dp.cur : null;
    if (C?.s.kind === 'hold' && !C.waves.length && igaMissionEnemy(rt))
      return iga.commanderTarget(rt) ? 7 : 6;   // 札の側から this なしで呼ばれる
    return 0;
  },
  missionHeading(rt) {
    if (rt.flags.ending) return rt.tracker.main ? '比自山城を押さえた' : '戦を終える';
    const C = rt.flags.dp?.on ? rt.flags.dp.cur : null;
    if (rt.flags.step === 3.5 && C?.s.kind === 'move')
      return C.at === SHU ? '主郭を調べよ' : '北の曲輪へ進め';
    return this.missions[this.missionOf(rt)];
  },
  commanderTarget(rt) {
    if (rt.over || rt.flags.ending) return null;
    return igaMissionEnemy(rt, true);
  },
  commanderSignTarget(rt) { return this.commanderTarget(rt); },
  namedGuideTarget(rt) { return this.commanderTarget(rt); },
  missionSignTarget(rt) {
    if (rt.over || rt.flags.ending || rt.flags.step >= 3) return null;
    return this.commanderTarget(rt) || igaMissionEnemy(rt);
  },
  missionPin(rt) {
    const F = rt.flags, p = rt.player.u.pos, stage = this.missionOf(rt);
    if (F.ending || rt.over || !rt.player.u.alive) return null;
    const q = F.igaPin || (F.igaPin = { always: true, silent: true, arrow: false });
    q.unit = null; q.marker = null; q.enemy = q.fire = q.treatment = q.route = false;
    q.follow = q.defend = q.waiting = q.arrived = q.footRing = false;
    q.r = 3; q.hide = 1;
    let id = '', at = CAMP;
    if (igaNeedsTreatment(rt)) id = 'raidRecovery';
    else if (stage === 1) {
      let distance = Infinity;
      for (const m of rt.markers) if (/^f[0-2]$/.test(m.id) && F.fires[+m.id[1]]) {
        const v = typeof m.pos === 'function' ? m.pos() : m.pos;
        const d = v ? Math.hypot(p.x - v.x, p.z - v.z) : Infinity;
        if (d < distance) { distance = d; id = m.id; }
      }
    } else if (stage === 2) id = F.bridgeWayActive ? 'bridgeWay' : 'bridge';
    else if (stage === 4 || stage === 5) id = 'dp';
    else if (stage === 6 || stage === 7) {
      const u = stage === 7 ? this.commanderTarget(rt) : igaMissionEnemy(rt);
      if (u) {
        if (rt.player.inRange && rt.player.rangeCueTarget === u) return null;
        q.unit = u; q.enemy = q.follow = true; at = u.pos; q.r = q.hide = .2;
      }
    } else {
      at = stage === 3 ? F.bridge : F.dp?.on && F.dp.cur?.s.kind === 'hold' ? F.dp.cur.at : CAMP;
      q.defend = q.waiting = true; q.r = 8;
      q.arrived = Math.hypot(p.x - at.x, p.z - at.z) < q.r;
    }
    if (id) {
      const m = rt.markers.find((m) => m.id === id);
      if (!m) return null;
      at = m.guideDestination?.() || (typeof m.pos === 'function' ? m.pos() : m.pos);
      if (!at) return null;
      q.marker = m; q.fire = /^f[0-2]$/.test(id); q.treatment = id === 'raidRecovery';
    }
    q.key = id || (q.enemy ? 'foe' : 'post'); q.x = at.x; q.z = at.z;
    return q;
  },
  meleeGrace: { rate: 0.008, burst: 0.35, interval: 1.6 },
  teamSignsOnly: true,
  noUnitContrast: true, // 本人の具足にも白い人型を重ねず、足元の印と敵味方の印を残す。
  taskLabelMinFont: 16, // 横向きの携帯でも、伊賀の札に合わせた文字を二十画素へ戻さない。
  compactPlayerSign: true, playerSignMinScale: 0.4,
  openingFootSignOnly: true, playerFootSignOnly: true, playerSignBodyScale: 0,
  // 始めの案内でも人を白い枠で包まず、足元と「自分」の印で本人を知らせる。
  playerSignScale: 0.6, // 小さい輪の指定も有効にし、草鞋や坂の足場を覆わない。
  nearAllyFadeRadius: 2.2,
  nearFlagFadeRadius: 5, // 横長の画面へ大写しになる近い布も、既存の視線よけで避ける。
  nearAllySolidBody: true, // 既存の視点よけを使い、顔や具足を部分ごとに透かさない。
  nearAllyHorseFade: true, // 騎手だけでなく、低い視点を塞ぐ馬の胴も拾う。
  nearAllyWholeOcclusion: true, // 視点へ重なる騎手と馬を一緒に避け、巨大な胴や浮く具足を残さない。
  battleVoices: { lines: { ally: { praise: ['よう働いた！', '天晴れじゃ！', 'その槍、見事なり！'] } } },
  noHorse: true, // 夜討ちの陣の中を回る。徒歩で出る
  gateGuide: false, // 木戸は味方の組が打つ。近づくだけで土橋の護衛を別の下知へ替えない。
  jinkei: [IGA_ATTACK, IGA_DEFEND],
  civilianCrowd: { bands: PEOPLE_BANDS },
  noWake: false, wakeRoom: 250, moveLim: 470, // 共通の枠を使い、近い備えを同じ場所で本物へ替える。
  noReserve: true, noDistantBattle: true,
  groundStandards: true,
  botOrders: true, // 山へ追わず、消火・土橋・陣の口の下知を守る。
  immediateTaskChanges: true, // 土橋へ進む・戻る下知が変わったら、札の古い文もすぐ替える。
  keepTaskLabel: true, // 近い敵を見ても、土橋や陣口を守る下知を追撃の札へ替えない。
  keepDestinationTask: true,
  keepFlagTravelTask: true, keepFlagArrivalTask: true, // 坂の行き先を「旗まで」の操作案内へ置き換えない。
  compactDestinationArea: true, // 切岸をまたいで縦に伸びる到着の輪は描かず、道の印を残す。
  compactFloorGuides: true, // 肩へ寄った視点でも足元の輪を画面いっぱいに広げない。
  compactRetreatArea: true, compactRetreatSign: true, treatmentCrossSign: true,
  compactFlagGuide: true, groundFlagGuides: true, // 実旗を大きく囲まず、小さな旗で行き先を示す。
  compactDestinationSign: true, singleDestinationArrow: true, // 到着の旗と道の矢印を小さくし、兵を隠さない。
  avoidAllDestinationNotices: true, // 画面外の坂道・守備先も、命や任務の札を避けて案内する。
  smallTaskAreas: true, taskAreaFootRing: true, // 守備・退避の輪も、切岸をまたぐ白い輪郭にしない。
  namedGuideMarkers: true, // 小屋の火と守る陣を、同じ「旗へすすめ」にしない。
  travelGuideLabel: (rt) => igaNeedsTreatment(rt) ? '味方の後ろで手当て' :
    rt.flags.step === 1 && igaNeedsDousing(rt) ? '小屋の火へ進め' :
    igaHoldingRaid(rt) ? '味方の列へ戻れ' : rt.flags.step === 2 ? '土橋へ進め' : '任務の印へ進め',
  // この札は旗ではなく、届く距離の外にいる敵を指す。夜討ちでは追撃を促さない。
  meleeApproachText: (rt) => igaHoldingRaid(rt) ? '列で待ち、来る敵を防げ' : '敵に近づき、槍を向けよ',
  missionDangerText: (rt) => igaNeedsTreatment(rt) ? '傷の手当てをせよ。味方の後ろへ下がれ' :
    rt.flags.step === 1 && igaNeedsDousing(rt) ? '火が残っている。小屋のそばで水を掛けよ' :
    igaHoldingRaid(rt) ? '味方が少ない。陣の口で共に防げ。林へ追うな' :
    '味方が少ない。下知に従い、組から離れるな',
  keepOpeningTaskLabel: true, // 携帯でも最初の下知を指の絵へ置き換えない。
  introTaskFirst: true,
  introPeopleFolded: true,
  introText: '味方の列を守ろう。火は味方が消す。',
  distanceUnit: 'steps',
  // 夜討ちを終えて山を往復する段は、戦全体の八分で途切れさせない。
  // 移動は実際の前進で猶予を更新する。立ち止まりと各段の上限は残す。
  pacingWait: (rt) => {
    const F = rt.flags;
    const C = F.dp?.on ? F.dp.cur : null;
    if (!F.ending && (F.step === 2 && F.bridgeStarted == null || C?.s.kind === 'move')) {
      const q = F.marchPacing || (F.marchPacing = { road: {}, step: -1, part: null, best: -Infinity, at: 0 });
      roadPoint(rt.player.u.pos, q.road);
      const progress = F.step === 2.5 ? -q.road.s : q.road.s;
      if (q.step !== F.step || q.part !== C) {
        q.step = F.step; q.part = C; q.best = progress; q.at = rt.t;
      } else if (progress > q.best + 0.1) { q.best = progress; q.at = rt.t; }
      return rt.t - q.at < 90 && rt.t - (C?.t0 ?? F.stepT) < 420;
    }
    // 到着後の護衛・迎撃は、その段の開始から数える。
    if (!F.ending && C) return rt.t - C.t0 < 240;
    if (!F.ending && F.step === 2 && F.bridgeStarted != null) return rt.t - F.bridgeStarted < 90;
    const allowance = F.step === 2 || F.step === 2.5 ? 240 : F.step === 3 ? 120 : F.step === 3.5 ? 150 : 0;
    return !F.ending && allowance > 0 && rt.t - F.stepT < allowance;
  },
  // 守る陣から離脱する意味にせず、危ない一撃を避ける印だと伝える。
  retreatGuideLabel: (rt, reached) => reached ? 'ここで構えよ' :
    rt.player.u.pos.z < APPROACH[0][1] ? rt.flags.step === 2.5 ? '来た道を戻り、麓へ退け' : '槍を避け、印へ下がれ' : '味方の後ろへ下がれ',
  retreatPointAllowed: igaRetreatPointAllowed,
  retreatPathAllowed: igaRetreatPathAllowed,
  // 回避でも同じ踏み面を調べ、平らに見える隣の切岸へ近道させない。
  dodgePointAllowed: igaRetreatPointAllowed,
  dodgeAvoidNotices: true, avoidCenteredDodgeNotice: true,
  // 坂では視点が道に沿って補正される。本人基準の左右を画面へ書かず、実際の印へ導く。
  escapePlaceLabel: (_rt, rain) => rain ? '矢を避け、印の所へ' : '印の所へよけよ',
  keepRetreatReason: true, // 歩数を添える時も、退く理由を旗だけの指示へ置き換えない。
  keepWoundRetreatReason: true, // 足の傷でも「旗まで」に戻さず、同じ退避先を言葉で伝える。
  retreatForLimbWounds: false, // 止血後の手足の傷だけで、陣を守る下知を退避へ替え続けない。
  dodgeLabel: (_rt, direction, rain) => direction ? direction.replace(/にげる/g, '下がる') : rain ? '◇ 矢の外の印へ' : '◇ 印の所へ下がれ',
  botBrainDepth: true, // 守る段も、比自山の持ち場に沿った迎撃を使う。
  // 城内の確認は実際の到着を必要とする。放置しても城を押さえた扱いにしない。
  taisho: { a: null, b: null }, // この城で百地丹波を討つ筋にはしない。
  spawn: { x: 6, z: 50, heading: Math.PI },
  noFieldMap: true,   // 稲生の標準：小さな地図は出さず、行き先のピンと敵の印に絞る
  playerRegen: 0.02,   // 稲生の標準：戦っていない間は命が戻り、血も止まる（player_hurt.js）
  playerTaken: 0.75,   // 受ける傷を七割五分に（稲生の初陣は六割。最後まで戦い通せるように）
  // 身の回りの当時の場（timeslip_field.js）。天正九年九月は今の十月末・秋の夜。
  // 乾いた山の土に、夜討ちで踏み荒らした陣の口・土橋への道。伊賀衆の矢と、倒れた槍・脱げた陣笠。枯れかけた薄（すすき）。
  timeslip: {
    wet: 0, dust: 0.35, trample: 0.25, debris: 1, arrows: 0.9,
    grass: 0x968c5c, grassTints: [0xffffff, 0xe2d4a0, 0xb8b088], grassH: 1.1, tallGrass: 0.8,
    flagColors: [0xe6dfcc, 0x24211e, 0x4a3a2c], hazeColor: 0x3a4250,
    fights: [[CAMP.x, CAMP.z - 30, 34], [0, -48, 26], [SHU.x, SHU.z, 24]],
  },
  world: {
    compactScenery: true,
    seed: 15819, moveLim: 470, groundHalf: 480,
    // 切岸でも兵・木・視点の足場を描く面にそろえる。伊賀だけ標準の格子を保つ。
    keepTerrainGrid: true, terrainTriangles: true,
    // 建物よけ・近景の視点切替の後にも、同じ山道から見直す。
    terrainContactView: true,
    // 木と草も細かい坂の表面へ置く。配置後に地面だけ削ると宙に残る。
    prepareTerrain: igaRoadGround,
    time: 'night',
    unitNightScale: 0, // 白い縁取りの補光を重ねず、月光・篝火で漆と布の色を見せる。
    nightFill: 0.38, // 月の向いた面は保ち、軒下と火から離れた土を一様に照らさない。
    nightMoonMin: IGA_NIGHT.sunI, // 共通の最低値で月光を昼のように強めず、伊賀の夜色を保つ。
    contactShadows: true, // 味方・本人の足元にも、共通の柔らかい陰を使う。
    infantryWeight: true, // 前後の列へ膝と腰の踏ん張りを渡す。攻撃の間と兵数は保つ。
    longHoro: 'round', // 使番の母衣は背に負う籠。既存の丸い形を近景・遠景とも使う。
    roundedFire: true, // 軒の火も既存の丸い舌を使い、板の輪郭を和らげる。
    naturalArrowRain: true, noGroundArrows: true, // 外れ矢を坂へ積まず、飛ぶ矢・兵や木に刺さる矢は残す。
    keepPinnedArrowSize: true, // 胴や馬の拡大率を受け継がず、刺さる前の矢の長さを保つ。
    pinnedArrowAxisScale: true, // 斜めに刺さる矢も、胴の縦横を含めた各軸で実寸を保つ。
    pinnedArrowRenderScale: true, // 親子の行列更新で、描く直前の体格にも矢の実寸を合わせる。
    arrowRainGroundCue: false, // 切岸に沿って伸びる白黒の帯を外す。矢の影・声・退き先の印で知らせる。
    wind: [0.5, 1],
    clothFolds: true,
    autumn: true,
    slopeForest: 0.7, // 木を増やさず、山腹に既存の林床・樹冠の斑を使う。大手の踏み跡は残る。
    muddy: 0.25,
    softEarthCrust: true, stableSlopeGrain: true, // 土塊の升目と、斜面の法線で伸びる縞を残さない。
    subtleMudRelief: true, sparseEarthCrust: true, // 円い窪みを一面に並べず、踏まれた泥と土塊の斑に限る。
    variedMarch: true, strideLimit: 1.1, // 山道の歩調をばらし、逃げ足でも腿と膝を振り上げすぎない。移動速度は保つ。
    livingSpearHedge: true, // 槍の列は保ち、呼吸と押し合いによる手元の揺れだけを一人ずつずらす。
    fallPaceSpread: 0.35, groundedFalls: true, settleSideFalls: true, // 膝が折れる間をずらし、横斬りでは肩から坂の土へ寝かせる。
    contactFalls: true, wetEarthBursts: true, // 体が地へ着いた時に具足の音。湿った土は低く短い泥粒にする。
    bareFallenHats: true, slopeLitter: true, longitudinalSpearFalls: true, // 笠に首布を残さず、長柄は穂先と石突の高さで坂へ寝かせる。
    terrainTags: true,   // 急斜面・細道・森で速さ・向き変え・疲れが変わる（terrain_tags.js）
    noticeRepeatGap: 32, quietMarch: true,
    // 大手道（南）＋北の搦手・裏の尾根（KITA→KITASOTO）に加え、犬走り（斜面沿いの細道。主郭の周り→北・東の曲輪へ）
    paths: [[[0, 150], ...APPROACH], RIDGE, EAST, ...PEOPLE_PATHS],
    moveWay: igaWay, fleeWay: igaFleeWay, combatSpace: igaCombatSpace,
    height,
    clear: (x, z) => campClearing(x, z) || peopleClearing(x, z) || HIJIYAMA_PLAN.kuruwa.some(k => inPoly(k.poly, x, z)) || Math.hypot(x - FORT.x, z - FORT.z) < FORT.r + 8
      || Math.hypot(x - KITA.x, z - KITA.z) < 14 || Math.hypot(x - KITASOTO.x, z - KITASOTO.z) < 13 || Math.hypot(x - HIGASHI.x, z - HIGASHI.z) < 13
      || (Math.abs(x) < 18 && z < 0 && z > KITAEND.z - 40) || Math.hypot(x - NAGATA.x, z - NAGATA.z) < 16 || Math.hypot(x - ASAYA.x, z - ASAYA.z) < 16,
    // 大きな円錐の葉を、既存の枝葉の房へ替える。形と材質は林で共用する。
    trees: 680, thickTrees: true, branchFoliage: true, unevenCrowns: true, nearCedarBranches: true,
    tufts: 1800, tuftTint: 0x928779,
    treeDensity: (x, z) => (campClearing(x, z) || peopleClearing(x, z) || HIJIYAMA_PLAN.kuruwa.some(k => inPoly(k.poly, x, z))) ? 0 : ((Math.abs(x) < 20 && z < -80 && z > KITAEND.z - 40) || Math.hypot(x - HIGASHI.x, z - HIGASHI.z) < 16) ? 0.1 : 1,
    // 盆地・丘陵・森の伊賀。山城だけでなく、山麓の集落（小屋二つ）と、長田丸・朝屋丸の小城館の森
    groves: [{ x: -76, z: 30, r: 14, n: 22 }, { x: 76, z: 10, r: 14, n: 22 }, { x: NAGATA.x, z: NAGATA.z, r: 16, n: 18 }, { x: ASAYA.x, z: ASAYA.z, r: 16, n: 18 }],
    fleeOut: (x, z, team) => team === 1 && (z < KITAEND.z - 24 || x < -90 || x > 150),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と矢・秋の薄（def.timeslip）
    // 伊賀専用の折り返し・小地図との間隔・消火札の配置を有効にする。
    rt.hud.root.classList.add('iga');
    // 秋の夜空の星を雪粒ほど大きくしない。空の形と月明かりは共通のまま。
    if (W.stars) { W.stars.material.size = 0.18; W.stars.material.opacity = 0.12; }
    // 伊賀の焚き火の煙だけ、白い玉の列を薄い灰の煙へ。共有の煙は変えない。
    const smokeMat = W.smokeCol?.pts.material;
    if (smokeMat) {
      // 色の uniform は共通の時刻更新で毎回替わる。空色への追従を残し、描く時に灰色を掛ける。
      smokeMat.fragmentShader = smokeMat.fragmentShader
        .replace('mix(color, vec3(0.065, 0.058, 0.052), vSoot)', 'mix(color * vec3(0.52, 0.56, 0.62), vec3(0.065, 0.058, 0.052), vSoot)')
        .replace('mix(0.42, 0.62, vSoot)', 'mix(0.18, 0.36, vSoot)');
      smokeMat.needsUpdate = true;
    }
    igaGroundDetail(rt);
    // 足もとの草だけが月明かりを強く返していた。伊賀で作った草の材質を一度だけ落ち着かせる。
    const grassMap = W.nearGrass?.material.map, grassMats = new Set();
    if (grassMap) W.scene.traverse((m) => {
      const mat = m.material;
      if (!mat || mat.map !== grassMap || grassMats.has(mat)) return;
      grassMats.add(mat); mat.color.multiplyScalar(0.55); mat.envMapIntensity = 0.3;
    });
    igaSlopeCamera(rt);
    igaHoroDetail(rt);
    // 刺さった矢の実寸は共通の行列更新で保つ。描画前に全矢を調べ直す必要はない。
    igaRaidGrace(rt);
    // 矢を避ける印にも山道の足場検査を渡す。候補と途中の点は既存の入れ物を使う。
    rt.army.hooks.rainEscapePointAllowed = (point) => igaRetreatPointAllowed(rt, point);
    // 共通の背後・刃・側面の知らせも、この夜討ちでは一つに束ねる。
    const bark = rt.bark;
    rt.bark = function (text, warn) {
      text = text.replace(/影から出よ/g, '矢が落ちる所を離れよ');
      // 陣を守る下知と、共通の追撃の掛け声を食い違わせない。
      if (igaHoldingRaid(rt) && /突け、突け|槍を揃えよ.*かかれ|腰を落とせ.*ひるむな|ここが死に場所/.test(text)) {
        return bark.call(this, igaNeedsTreatment(rt) ? '味方の後ろへ下がれ。旗本のそばで血を止めよ' :
          F.step !== 1 || F.bucketOn ? '丹羽の列で迎えよ。林へ追うな' : '火の印へ寄れ。桶の水を掛けよ', false);
      }
      if ((igaHoldingRaid(rt) || F.step === 2 || F.step === 2.5) && /休ませるな|今のうちに寄せよ|背を見せた.*追え|備えが戻る前に押せ/.test(text)) {
        return bark.call(this, F.step === 2 ? '土橋の味方を守れ。敵を追って列を離れるな' :
          F.step === 2.5 ? '来た道を戻り、麓の陣へ退け' : '敵を追うな。丹羽の兵のそばで迎えよ', false);
      }
      if (igaHoldingRaid(rt) && /後ろ(?:だ|に敵|で足音|から敵)|[左右]手から敵|刃が光った|大きく振りかぶった/.test(text)) {
        igaRaidNotice(rt); return;
      }
      return bark.call(this, text, warn);
    };
    const onRearApproach = rt.army.hooks.onRearApproach;
    rt.army.hooks.onRearApproach = (u, target) => {
      if (igaHoldingRaid(rt)) igaRaidNotice(rt, u);
      else onRearApproach?.(u, target);
    };
    const onWindup = rt.army.hooks.onWindup;
    rt.army.hooks.onWindup = (u, target) => {
      if (!igaHoldingRaid(rt) || !target.isPlayer || u.atk?.ranged || u.atk?.bow) return onWindup?.(u, target);
      rt.army.rearWindup(u, target);
      const dx = u.pos.x - target.pos.x, dz = u.pos.z - target.pos.z;
      if ((dx * Math.sin(target.heading) + dz * Math.cos(target.heading)) / (Math.hypot(dx, dz) || 1) >= 0.5) return;
      if (!u.igaFlankWarned) {
        u.igaFlankWarned = true;
        if (u.atk && !u.atk.ranged && !u.atk.bow) { u.atk.t = Math.max(u.atk.t, 0.6); u.atk.dur = Math.max(u.atk.dur, 0.6); }
      }
      igaRaidNotice(rt, u);
      rt.army.play('step', u.pos, 0.9);
      rt.hud.damageFrom(Math.atan2(u.pos.x - target.pos.x, u.pos.z - target.pos.z) - rt.player.yaw);
    };
    igaAllyDress(rt);
    // 伊賀衆は手で下知を伝える。味方の合図は既存のまま、敵の音と反復だけを止める。
    const onSignal = rt.army.hooks.onSignal;
    rt.army.hooks.onSignal = (g, kind, at) => {
      if (g.team !== 1) return onSignal?.(g, kind, at);
      if (!rt.over && !g.ambush && rt.distTo(at) < 24 &&
          !(F.igaSignalAt > rt.t) && (F.igaSignalN || 0) < 2) {
        F.igaSignalAt = rt.t + 45; F.igaSignalN = (F.igaSignalN || 0) + 1;
        rt.bark(kind === 'hike' ? '伊賀の者が手で合図し、退いてゆく' : kind === 'tomare' ? '伊賀の者が手で合図し、足を止めた' : '伊賀の者が手で合図し、寄せてくる');
      }
      return false;
    };
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完。表には出さない）
    F.hist = { castleSite: 'HIST_A', nightRaid: 'HIST_B', emptyCastle: 'HIST_B', nagata: 'HIST_B', asaya: 'HIST_B', approach: 'GAME_C', distantFires: 'GAME_C', ridgeHq: 'GAME_C' };
    F.step = 0; F.ek = 0; F.ak = 0; F.doused = 0;
    F.raidRest = { x: 4, z: 66 }; // 陣口から離れた小屋の外。旗本を前へ置いて手当てを守る。
    rt.army.igaFront = [];
    rt._rfN = 3; // 共通の段処理による、出所のない新手をこの戦では出さない。
    // ---- 丹羽の陣：陣幕と小屋 ----
    // 比自山を囲む堀秀政の陣。信雄の総本陣とは分ける。
    // 幕を中央の消火・迎撃の道から外し、東奥の本陣へ寄せる。
    F.honjin = camp(rt, { x: CAMP.x + 24, z: CAMP.z + 56, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '堀秀政', hat: 'kabuto_m', haori: 0x6a1d2a }, guard: 15, reserve: 260, runTo: { x: 24, z: 76 } });
    // 本陣の大将は陣で下知する。自動の出撃で閉じた木戸へ追わせず、近づいた敵は迎え撃つ。
    if (F.honjin.general) {
      const g = F.honjin.general.group; g.stay = true; g.noAI = true;
      g.anchor = { x: CAMP.x + 24, z: CAMP.z + 56 };
      g.order = 'hold'; g.guard = true; g.guardSight = 12; g.guardLeash = 8; g.seekRange = 8;
    }
    F.huts = [[-20, 30, 0.1], [18, 26, -0.2], [-8, 60, 0.2], [26, 56, 0]].map(([x, z, r]) => {
      const m = igaHut(W, x, z, 7, 5, r, { wall: 0x6e5a40,
        interior: { name: '陣の兵の小屋', kind: 'nagaya', profile: 'iga', team: 0 } });
      rt.scene.add(m); return { x, z, m, cos: Math.cos(r), sin: Math.sin(r) };
    });
    igaVillage(rt);
    // 陣の輪郭は準備時に作る。大手・東西・裏の寄せ口を空け、夜討ちの筋を塞がない。
    for (const seg of [[-38, 12, -10, 12], [10, 12, 38, 12], [-38, 26, -38, 42], [-38, 56, -38, 80],
      [38, 12, 38, 18], [38, 32, 38, 42], [38, 56, 38, 80], [-22, 80, -10, 80], [10, 80, 38, 80]]) {
      rt.scene.add(palisade(W, seg, { h: 1.7, solid: true }));
    }
    for (const x of [-35, 35]) rt.scene.add(jinmaku(W, x, 66, 4, 10, 4, { mon: 'sujikai', solid: false }));
    // 携帯でも光の枠は共通の二つのまま。寄せ口を横切る実兵の姿と空き地を照らす。
    // 東西の寄せ口の中心線へ薪を置かない。後列まで柵の切れ目を歩ける幅を残す。
    for (const [x, z] of [[-44, 16], [44, 16], [-44, 64], [44, 64], [-28, 76], [8, 76], [-8, 14], [8, 14], [-48, 34], [48, 42], [-12, -12], [12, -12]]) {
      rt.scene.add(campfire(W, x, z)); W.addFire(x, z, { size: 0.9 });
    }
    // 荷は小屋の脇へ寄せる。陣口の中央や裏から寄せる兵の道を塞がない。
    rt.scene.add(tawara(W, -26, 34, 0.3, 6), tawara(W, 26, 66, -0.2, 5));
    for (const [x, z] of [[-10, 20], [10, 20], [-34, 30], [34, 34]]) rt.scene.add(igaNobori(W, x, z, NIWA.flag, 6));
    for (const [x, z] of [[-4, 44], [14, 40]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    igaCampDetails(rt);
    // ---- 比自山城：主郭→北の尾根曲輪→堀切→北外郭、主郭→堀切→東の脇曲輪（一本道でない）。南の大手だけ手組みの木戸 ----
    // 山腹の囲いは低い透ける木柵。斜面を登る板塀が黒い太鼓橋のように見えないようにする。
    // 曲輪の輪郭・虎口・当たりは保ち、既存の杭と横木を静止物の束へまとめる。
    const southCourts = new Set(['minami', 'minaminishi', 'minamihigashi', 'minamishikaku']);
    // 坂の逆茂木は枝先まで同じ足場に収まる所だけ。谷へ長い幹を架けず、道も空ける。
    const castlePlan = { ...HIJIYAMA_PLAN, terrainBanks: true, sakamogiMaxRise: 2, kuruwa: HIJIYAMA_PLAN.kuruwa.map(k =>
      southCourts.has(k.id) ? { ...k, wallMesh: palisade, wallOpt: { ...k.wallOpt, h: 1.4, openFence: true, lightFence: true, terrainRails: true, mound: false, noBrace: true } } : k) };
    F.castleC = buildCastlePlan(rt, castlePlan, { baseHeight: castleTerrain, edgeW: 3, buildSeat: false, life: false });
    // 土塁は歩く地形に一度だけ盛る。柵の下へ別の土手を重ねない。
    for (const s of F.castleC.walls) { s.noTarget = true; s.wall = true; }
    // 北・東の木戸は退去路を開けた冠木門。南だけが台本で閉じる木戸。
    for (const g of HIJIYAMA_PLAN.koguchi) if (g.id !== 'kido_shu') {
      rt.scene.add(kabukimon(W, g.at[0], g.at[1], 5.4, g.id === 'kido_higashi' ? Math.PI / 2 : 0, { doors: false }));
    }
    // 柵と土塁は縄張りの口を共用し、北と東の道を二重の囲いで塞がない。
    F.shikisho = monomi(rt, FORT.x - 9, FORT.z - 12, { team: 1, name: '主郭の物見' });
    // 北へ続く尾根道の幅を空け、退く守備兵と城内を調べる組を通す。
    // 寺跡の番所として推定する。現存の堂と決めつけて本尊を置かない。
    rt.scene.add(igaHut(W, SHU.x - 9, SHU.z - 4, 8, 6, 0, { wall: 0x6e5a40,
      interior: { name: '主郭の番所', kind: 'bansho', profile: 'iga', team: 1 } }));
    // 遠くの別方向の戦い・火・狼煙：長田丸・朝屋丸のあたり、山の向こう
    for (const [x, z, s2] of [[NAGATA.x, NAGATA.z - 30, 2.4], [ASAYA.x, ASAYA.z - 24, 3.2], [-120, -170, 2.0], [140, -150, 2.2]]) { W.addSmokeColumn(x, W.heightAt(x, z) + 4, z, { size: s2 }); }
    for (const [x, z] of [[-150, -100], [165, -80]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z, { h: 0.15 }); }
    const seg = [-2.5, SHU_SOUTH[1], 2.5, SHU_SOUTH[1]];
    F.gate = rt.army.addStruct({ seg, nx: 0, nz: 1, hp: 260, maxHp: 260, armor: 0.2, team: 1, name: '木戸', noTarget: true });
    F.gz = seg[1];
    const dm = tobira(W, FORT.x, F.gz, seg[2] - seg[0] - 0.2, 0, { h: 2.8 });
    F.gate.mesh = dm;
    // 観音寺跡の主郭。名のある城主・最後の一騎打ちは置かない。
    rt.scene.add(dm, kabukimon(W, FORT.x, F.gz, seg[2] - seg[0] + 0.8, 0, { doors: false }), yagura(W, FORT.x + 10, FORT.z + 6));
    // ---- 周りの小城館：長田丸・朝屋丸（連絡の拠点。館の中は取次と座敷の推定復元） ----
    for (const [S, nm2] of [[NAGATA, '長田丸'], [ASAYA, '朝屋丸']]) {
      const rr = ringWall(rt, S.x, S.z, 9, { gapAt: Math.PI, gapW: 0.5, team: 1, hp: 1e9, name: nm2 + 'の柵', segLen: 5 });
      for (const s of rr) s.noTarget = true;
      rt.scene.add(igaHut(W, S.x, S.z, 7, 5, 0, { wall: 0x5a4a38,
        interior: { name: nm2 + 'の館', kind: 'yashiki', profile: 'iga', team: 1 } }),
        yagura(W, S.x + 6, S.z - 6), igaNobori(W, S.x - 6, S.z + 6, 'maru', 6));
    }
    // ---- 丹羽長秀の手（自分の持ち場）、筒井の手、木戸を破る組 ----
    F.niwa = allyGroup(rt, { fixed: true, formation: 'ring', guard: true, guardLeash: 8, name: '丹羽長秀の手', anchor: { x: 0, z: 36 }, facing: Math.PI, width: 14, aggro: 10, noRout: false },
      dress([{ type: 'busho', n: 1, o: { name: '丹羽長秀', invuln: true, horse: false, hat: 'kabuto_w', haori: 0x2a3a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], NIWA));
    F.niwaU = F.niwa.units[0];
    F.tsutsui = allyGroup(rt, { fixed: true, formation: 'line', guard: true, guardLeash: 12, name: '西の押さえの組', anchor: { x: -26, z: 40 }, facing: Math.PI, width: 12, aggro: 10, noRout: false },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }], ODA));
    F.ram = allyGroup(rt, { fixed: true, name: '木戸を破る組', anchor: { x: 20, z: 44 }, facing: Math.PI, width: 5, aggro: 3, noRout: false, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.oda = [F.niwa, F.tsutsui, F.ram];
    F.niwa.leader = F.niwaU;
    for (const g of F.oda) { g.defMult = 1; g.dmgMult = 1; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: 48 }, Math.PI, [{ kind: 'spear', n }]);
    F.honjin.guard.anchor = { x: CAMP.x + 6, z: CAMP.z + 7 };
    F.honjin.guard.guard = true; F.honjin.guard.guardLeash = 10;
    F.jinHosts = buildSonae(rt, this.jinkei);
    // 夜討ちの全組を準備時に林へ置く。時刻で新しく湧かせず、同じ兵へ進撃を命じる。
    F.raiders = [igaEnemy(rt, 6, 28, 3, '陣の口から寄せる伊賀衆'), igaEnemy(rt, 48, 50, 5, '東から忍び寄る伊賀衆'), igaEnemy(rt, -30, 95, 5, '裏へ回る伊賀衆')];
    F.waveA = [igaEnemy(rt, 48, 25, 9, '東の林の伊賀衆'), igaEnemy(rt, -48, 50, 9, '西の林の伊賀衆'), igaEnemy(rt, 0, 96, 8, '陣の裏の伊賀衆')];
    F.waveB = [igaEnemy(rt, ...APPROACH[3], 10, '城から出る伊賀衆'), igaEnemy(rt, ...APPROACH[2], 10, '林を回る伊賀衆')];
    // 最後の夜討ちの組を率いる既存の一人。史料に無い将名は作らない。
    F.igaBoss = F.waveB[1].units.find((u) => u.type === 'samurai') || null;
    F.sally = igaEnemy(rt, 55, -46, 12, '林の伊賀衆');
    F.wallBow = igaEnemy(rt, FORT.x, F.gz - 5, 8, '土塁の伊賀衆', [{ type: 'bow', n: 6 }, { type: 'gun', n: 2 }]);
    F.wallBow.ambush = false; F.wallBow.aggro = 34; F.wallBow.facing = 0;
    // 登りと退きの道を三人ずつが守る。城の放棄後に新手を出さない。
    // 長い折れ目の中ほどへ準備時に置き、実兵の上限は igaEnemy で守る。
    F.roadGuards = [];
    for (let i = 1; i < 7; i++) {
      const a = APPROACH[i - 1], b = APPROACH[i];
      for (const step of [2, 2.5]) {
        const g = igaEnemy(rt, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 3, '山道の伊賀衆');
        g.igaStep = step; g.aggro = 0;
        for (const u of g.units) u.noTarget = true;
        F.roadGuards.push(g);
      }
    }
    F.igun = allyGroup(rt, { fixed: true, name: '丹羽の鉄砲組', anchor: { x: 14, z: 28 }, facing: Math.PI, formation: 'line', width: 4, aggro: 4 }, dress([{ type: 'gun', n: 6 }], NIWA));
    // 夜討ちの切れ目を埋める二人組。道と陣の外縁へ先に置き、既存の隊の人数を削らない。
    F.raidPatrols = [];
    for (const [x, z] of [[-12, 14], [12, 14], [-12, 72], [12, 72], [-34, 38], [34, 38], APPROACH[1], APPROACH[2]]) {
      const g = igaEnemy(rt, x, z, 2, '道に潜む伊賀衆');
      g.aggro = 0;
      for (const u of g.units) u.noTarget = true;
      F.raidPatrols.push(g);
    }
    // 陣の中で寝ずの番をする織田の兵：焚き火を囲んで座る者・立つ番の者。夜でも火に照らされて見える
    {
      const ppl = [];
      for (const [fx, fz] of [[-8, 24], [12, 18]]) for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2 + fx * 0.1, r = k % 3 === 2 ? 3.2 : 2.1;
        ppl.push({ x: fx + Math.sin(a) * r, z: fz + Math.cos(a) * r, k: k % 3 === 2 ? 'spear' : 'seated', facing: a + Math.PI, flag: 0 });
      }
      W.addDistantArmy({ people: ppl, armor: 0x2b3140, team: 0, flagTex: flagTexture('oda'), seed: 15814 });   // 見張りの姿は軽い遠景のまま
      for (const [x, z] of [[-8, 24], [12, 18]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    }

    // 陣幕の線と、見張りの焚き火も置き終えてから、迂回の当たりをそろえる。
    rt.army.igaCampBoxes = SOLIDS.filter((s) => s.z0 > 10).map((s) => {
      const x0 = s.x0 - 0.9, x1 = s.x1 + 0.9, z0 = s.z0 - 0.9, z1 = s.z1 + 0.9;
      return { x0, x1, z0, z1, corners: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }] };
    });
    for (const box of rt.army.igaCampBoxes) {
      box.links = new Uint8Array(16); box.lengths = new Float64Array(16);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const a = box.corners[i], b = box.corners[j], k = i * 4 + j;
        box.links[k] = rt.army.igaCampBoxes.some(ob => campCross(a, b, ob)) ? 0 : 1;
        box.lengths[k] = Math.hypot(b.x - a.x, b.z - a.z);
      }
    }
    // 敵の札は任務の下へ八画素離す。この戦を離れたら指定も外す。
    const layout = document.createElement('style');
    layout.id = 'iga-layout';
    layout.textContent = '#hud #target { left: 50%; right: auto; top: 128px !important; bottom: auto; transform: translateX(-50%); width: max(160px, min(240px, calc(100vw - 600px))); max-width: 240px; box-sizing: border-box; white-space: normal; overflow-wrap: anywhere; background: #14120f; font-size: max(12px, calc(13px * var(--text-scale, 1))); } #hud #target span { display: block; white-space: normal; } #hud:has(#objectives.expand) #target { display: none; }';
    // 横向きの携帯でも二行の知らせを札ごと読める高さにする。伊賀を離れたら外す。
    // 長い題を一文字だけ次の行へ送らず、携帯では既存の小さい字を使う。
    layout.textContent += '@media (min-height:501px) { #hud #intro .card .ttl { font-size:max(24px, calc(clamp(24px, 3.2vw, 44px) * var(--text-scale, 1))); text-wrap:balance; } }';
    // パソコンでも小地図の幅と八画素の間を必ず空ける。選択中の配置は共通のまま。
    layout.textContent += '@media (min-height:501px) { html body #hud.iga #battle-notices:not(.choosing):not(:has(#objectives.expand)), html body #hud.iga.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) { left:auto !important; right:calc(208px + env(safe-area-inset-right, 0px)) !important; top:calc(96px + env(safe-area-inset-top, 0px)) !important; width:min(320px, calc(100vw - 256px)) !important; } }';
    layout.textContent += '@media (max-height:500px) { html.touch body #hud.iga #battle-notices:not(.choosing):not(:has(#objectives.expand)) { max-height:min(32vh, calc(100% - var(--notice-top, 60px) - var(--notice-floor, 96px) - 8px)) !important; } html.touch body #hud.iga #intro:has(#intro-go) > .card.card { max-height:calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important; } }';
    // 消火中は進み具合と下知を残し、短い雑報で台詞の末尾を押し出さない。
    layout.textContent += `@media (max-height:500px) {
      html.touch body #hud.iga #battle-notices #battle-message #subtitle {
        font-size:max(15px, calc(15px * var(--text-scale, 1))) !important; line-height:1.5;
      }
      html.touch body #hud.iga #battle-notices #subtitle .sp { display:inline; margin-right:8px; }
      html.touch body #hud.iga:has(#boss:not([hidden])) #battle-message > .battle-notice:not(.warn) { display:none !important; }
      /* 消火の札の下は一枚にする。被弾時は台詞より身を守る知らせを優先する。 */
      html.touch body #hud.iga:has(#boss:not([hidden])) #battle-message:has(> .battle-notice.warn:not([hidden]):not(.notice-muted)) #subtitle { display:none !important; }
    }`;
    // 携帯の横画面では札を横に広げ、下知と勝つ条件の折り返しを減らす。
    // 説明は必要なら中だけを送れ、出陣のボタンは縮めない。
    layout.textContent += '@media (max-height:500px) { html body #hud.iga #intro:has(#intro-go) > .card.card { width:min(520px, calc(100vw - 32px)) !important; max-width:calc(100vw - 32px) !important; max-height:calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important; box-sizing:border-box; } #hud.iga #intro .intro-reading p { margin:6px 0; } }';
    layout.textContent += '#hud.iga #intro:has(#intro-go) > .card { display:flex; flex-direction:column; gap:8px; } #hud.iga #intro .intro-reading { min-height:0; flex:1 1 auto; overflow-y:auto; touch-action:pan-y; pointer-events:auto; overscroll-behavior:contain; padding-bottom:12px; scroll-padding-bottom:12px; } #hud.iga #intro-go { flex-shrink:0; }';
    // けがの長い説明で格子が下地を押し広げない。伊賀の札の中で折り返す。
    layout.textContent += `
      html body #hud.iga .bl #h-hp.hp {
        grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important;
        width:min(280px,calc(100vw - 40px)); min-width:0;
      }
      html body #hud.iga .bl #h-hp.hp > * { min-width:0; max-width:100%; box-sizing:border-box; }
      html body #hud.iga .bl #h-hp.hp em {
        font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
        white-space:normal; word-break:normal; overflow-wrap:anywhere;
      }
      html body #hud.iga .bl #h-hp.hp em small { font-size:inherit; white-space:normal; word-break:normal; overflow-wrap:anywhere; }
      html body #hud.iga .bl #h-hp.hp em svg { width:18px; height:22px; }
    `;
    // 小地図の六十二画素と余白を空け、被弾の二行札も地図へ重ねない。
    layout.textContent += '@media (max-height:500px) { html.touch body #hud #battle-notices:not(.choosing):not(:has(#objectives.expand)) { right:calc(88px + env(safe-area-inset-right, 0px)) !important; max-width:min(320px, calc(100vw - 184px)) !important; } }';
    // 矢の知らせを任務と台詞の間に重ねない。戦を離れたらこの指定も消える。
    layout.textContent += 'body:has(#iga-layout) #rain-mark { top:auto !important; bottom:calc(env(safe-area-inset-bottom, 0px) + 100px); max-width:calc(100vw - 48px); box-sizing:border-box; font-size:max(12px, calc(15px * var(--text-scale, 1))) !important; }';
    // 移動中も本文と距離を縦に積む。距離だけが一文字幅へ押し込まれないようにする。
    layout.textContent += `
      html body #hud.iga #battle-notices:not(.choosing) #objectives:not(.expand),
      html body #hud.iga #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
        position:relative !important; inset:auto !important; transform:none !important;
        width:100% !important; min-width:0 !important; max-width:100% !important;
        height:auto !important; max-height:none !important; box-sizing:border-box;
      }
      html body #hud.iga #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur,
      html body #hud.iga #battle-notices:not(.choosing) #objectives:not(.expand) li.cur :is(.obj-text,.obj-now,.goal-place) {
        display:block !important; position:static !important; float:none !important;
        width:auto !important; min-width:0 !important; max-width:100% !important;
        height:auto !important; max-height:none !important;
        white-space:normal !important; overflow:visible !important;
        overflow-wrap:anywhere !important; word-break:normal !important;
        writing-mode:horizontal-tb !important; transform:none !important;
        text-wrap:pretty; -webkit-line-clamp:unset; line-clamp:unset;
      }
      html body #hud.iga #battle-notices:not(.choosing) #objectives:not(.expand) li.cur .goal-place {
        margin:4px 0 0 !important; font-size:max(13px, calc(13px * var(--text-scale, 1))) !important;
        line-height:1.4 !important;
      }
      /* 共通の携帯用二十画素では末尾の一字が次行へ落ちる。本文は十六画素で読む。 */
      @media (max-height:500px) {
        html.touch body #hud.iga #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
          font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
          line-height:1.4 !important;
        }
      }
      /* 画面外の行き先に歩数を添えた時は、同じ距離をもう一行出さない。 */
      html body #hud.iga #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur:has(.edge-goal-detail) > .goal-place {
        display:none !important;
      }
    `;
    rt.hud.root.appendChild(layout);
    F.targetStyle = layout.sheet.cssRules[0].style;
    F.taskLabel = document.getElementById('objectives');
    F.bossLabel = document.getElementById('boss');
    const dispose = rt.dispose;
    rt.dispose = function () {
      this.hud.root.classList.remove('iga');
      layout.remove(); const result = dispose.call(this);
      for (const h of F.huts) { h.burnMat?.dispose(); h.m.userData.igaRoofMat?.dispose(); }
      return result;
    };

    // 月齢は復元せず、遊びのための月明かりで林と峰の輪郭を残す。
    igaNight(rt);
    rt.setPhase('brief');
    rt.banner('伊賀の山城を囲む夜', 'あなたは丹羽の組。まず麓の陣を守れ');
    rt.obj('main', HI(rt) ? '味方の列を率いて備えよ' : '味方の列で備えよ', 'main');
    rt.say('丹羽長秀', `${nm(rt)}、山へ追うな。味方のそばで夜討ちに備えよ`, 5);
    rt.marker('niwa', unitPos(F.niwaU), '味方の列', { guideAlways: true, guidePriority: 10 });
    rt.after(6, () => this.raid(rt));
  },

  // ① 夜討ち
  raid(rt) {
    const F = rt.flags;
    if (F.step >= 1 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1; F.stepT = rt.t;
    rt.world.def.raidSenseDistance = 32;
    rt.army.igaRaidFrontUntil = rt.army.time + 150;
    F.raidNearT = rt.t + 24; // 最初の迎撃中は、別の伏兵を重ねない。
    rt.setPhase('raid');
    // 夜討ちの間は列の位置を保つ。共通の攻撃判断で陣を離れ、戻る印まで動かさない。
    for (const g of [F.niwa, F.tsutsui]) {
      g.noAI = true; g.order = 'hold'; g.guard = g.guardOn = true; g.aggro = 6;
    }
    const rearGuard = F.honjin.guard;
    rearGuard.anchor.x = F.raidRest.x; rearGuard.anchor.z = F.raidRest.z - 4;
    rearGuard.noAI = true; rearGuard.order = 'hold'; rearGuard.fixed = false; rearGuard._fitAt = 0;
    rearGuard.formation = 'line'; rearGuard.width = 8; rearGuard.facing = Math.PI;
    rearGuard.guard = rearGuard.guardOn = true; rearGuard.guardLeash = 4; rearGuard.seekRange = 8;
    rt.unmark('niwa');
    rt.marker('raidRecovery', F.raidRest, () => igaNeedsTreatment(rt) ? '味方の後ろで手当て' : '',
      { h: 2, guideAlways: true, guidePriority: 600 });
    rt.army.playFar('kane', CAMP, 0.8);
    for (let i = 1; i < 3; i++) rt.after(i * 0.4, () => {
      if (F.step === 1 && !F.ending && !rt.over) rt.army.playFar('kane', CAMP, 0.8);
    });
    rt.banner('夜討ち', '陣の中に伊賀の者が忍び込み、小屋の軒に火をつけた');
    const alarm = rt.obj('main', '丹羽の兵のそばで、敵を防げ', 'main');
    alarm.cue = '合図：鉦の三つ打ち＝夜討ちの警報'; alarm.cueT = rt.t;
    rt.say('足軽', '鉦だ、夜討ちだがね！　小屋が燃えとる！', 2.5);
    rt.after(3, () => { if (F.step === 1 && !F.ending) rt.say('丹羽の組頭', '火は消火の組が消す。その方は敵を防げ', 4); });
    const W = rt.world;
    battleEvent(rt, EVENT_FIRE_START, CAMP, F.niwa, 1, true, '夜討ちで陣に火の手が上がった');
    F.fires = [];
    // 初めの六つだけ屋根へ下向きに当て、実際の茅の面から燃やす。
    const roofRay = new THREE.Raycaster(), roofOrigin = new THREE.Vector3(), roofDown = new THREE.Vector3(0, -1, 0), roofHits = [];
    F.huts.slice(0, 3).forEach((h, i) => {
      // 炎の板の下端を茅の表面へ重ね、同じ軒の前後二か所から燃やす。
      const side = h.x < CAMP.x ? 1 : -1, ca = Math.cos(h.m.rotation.y), sa = Math.sin(h.m.rotation.y);
      const fireAt = (offset, along, size) => {
        const x = h.x + ca * offset + sa * along, z = h.z - sa * offset + ca * along;
        h.m.updateWorldMatrix(true, true);
        roofOrigin.set(x, h.m.position.y + 12, z); roofRay.set(roofOrigin, roofDown); roofHits.length = 0;
        // 高画質の屋根は、近景と遠景の茅を入れた入れ物。中の面まで調べる。
        roofRay.intersectObject(h.m.children[1], true, roofHits);
        const roofY = roofHits.length ? roofHits[0].point.y : W.heightAt(x, z);
        return W.addFire(x, z, { h: roofY - 0.08 + size * 0.3 - W.heightAt(x, z), size, blackSmoke: true });
      };
      // 同じ白い火を二列に並べず、茅の軒へ小さい火と大きい火をずらす。
      // 根元の高さは各点で屋根へ当て直す。火の数と消火の判定は変えない。
      F.fires.push(fireAt(side * 3.9, -1.15, 0.78 + i * 0.04));
      h.roofFire = fireAt(side * 3.65, 1.25, 0.62 + i * 0.03);
      const roof = h.m.children[1];
      let roofMesh;
      roof.traverse((m) => { if (!roofMesh && m.isMesh && m.material) roofMesh = m; });
      h.burnMat = roofMesh.material.clone();
      const compileRoof = roofMesh.material.onBeforeCompile, roofKey = roofMesh.material.customProgramCacheKey();
      h.burnMat.onBeforeCompile = function (sh, renderer) {
        compileRoof.call(this, sh, renderer);
        // 軒の二か所だけを焦がす。棟まで赤い板にせず、茅の肌と夜の陰影を残す。
        sh.vertexShader = 'varying vec2 vIgaEave;\n' + sh.vertexShader
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n vIgaEave = position.xz;');
        sh.fragmentShader = 'varying vec2 vIgaEave;\n' + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
            float igaBurn = (1.0 - smoothstep(0.35, 1.35, abs(vIgaEave.x - ${side * 3.9})))
              * (1.0 - smoothstep(0.35, 1.05, abs(abs(vIgaEave.y) - 1.3)));
            diffuseColor.rgb *= 1.0 - igaBurn * 0.55;`)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= igaBurn;');
      };
      h.burnMat.customProgramCacheKey = () => roofKey + '|iga-eave-burn|' + side;
      // 同じ小屋の近景・遠景は焦げの材質を共用。距離が変わっても火と焦げを残す。
      roof.traverse((m) => { if (m.isMesh) m.material = h.burnMat; });
      h.burnMat.emissive.setHex(0x5b2010); h.burnMat.emissiveIntensity = 0.12;
      // 屋内の中心へ矢印を立てず、火のある軒の外へ案内する。小屋の回転も合わせる。
      // 火の印と長押しの札は出さない。消火の組が軒の外から水を掛ける。
    });
    // 最初の三人は前の明るい陣口から歩いて寄せる。後の組の順番は変えない。
    igaAdvance(F.raiders[0], CAMP, true);
    rt.after(8, () => { if (F.step === 1 && !F.ending) rt.bark('陣の口に敵がおる！　前を向いて迎えよ'); });
  },
  douse(rt, i, byPlayer = true) {
    const F = rt.flags;
    if (F.ending || rt.over || F.step !== 1 || !F.fires[i]) return;
    rt.uninteract('f' + i); rt.unmark('f' + i);
    igaDouseFire(rt, i);
    sfx('wood', 0.4);
    F.doused++;
    // 次の火は消火役へ任せ直す。止まった火への下知は、戦闘の有無で揺らさない。
    F.bucketManual = false; F.bucketStallT = 0; F.douseHelp = false;
    rt.objProgress('main', `火を消した小屋 ${F.doused}／3軒`);
    if (!byPlayer) rt.bark(`小屋の火を消した（${F.doused}／3軒）`);
    if (F.doused === 1) {
      F.bucketOn = true; F.bucketIndex = -1; F.bucketT = 0; F.bucketStallT = 0;
      rt.obj('main', '丹羽の兵のそばで、敵を防げ', 'main');
      rt.marker('raidGuard', () => igaNeedsTreatment(rt) ? F.raidRest : F.niwa.anchor,
        () => igaNeedsTreatment(rt) ? '味方の後ろで手当て' : '丹羽の列へ戻る', { h: 3, guideAlways: true,
        // 深手は手当てを優先。消火が止まった後は、戦闘中も残る火の印を保つ。
        guidePriority: () => igaNeedsTreatment(rt) || !igaNeedsDousing(rt) ? 500 : 0 });
      rt.say('丹羽の組頭', '残る火は味方が消す。丹羽の列へ戻り、敵を防げ', 4);
    }
    if (byPlayer) rt.award((t) => t.side.push(`夜討ちの火を一軒消した（合計${F.doused}／3軒）`), `小屋の火を消した（${F.doused}／3軒）`);
  },

  // 夜討ちを退けても追い散らさない。山道へ進む前に、陣の口を固める。
  midA(rt) {
    const F = rt.flags;
    if (F.step >= 1.5 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 1.5; F.stepT = rt.t;
    rt.unmark('raidGuard');
    rt.unmark('raidRecovery');
    F.honjin.guard.anchor.x = CAMP.x + 6; F.honjin.guard.anchor.z = CAMP.z + 7;
    F.honjin.guard.guardLeash = 10;
    for (let i = 0; i < 3; i++) { rt.uninteract('f' + i); rt.unmark('f' + i); rt.unmark('r' + i); if (F.fires[i]) igaDouseFire(rt, i); }
    retireRaid(rt, F.raiders);
    for (const g of F.raidPatrols) if (!g.ambush) retireRaid(rt, [g]);
    rt.obj('main', '陣の口へ集まり、夜討ちに備えよ', 'main');
    depthStart(rt, igaCtx(rt), igaA(rt), () => { rt.objRemove('dp'); if (!F.ending) this.assault(rt); });
  },

  // 南の守りへ取り付く。強い土塁と空堀が、正面攻めを押し返す。
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 2 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 2; F.stepT = rt.t;
    for (const g of F.raidPatrols) if (!g.ambush) retireRaid(rt, [g]);
    rt.setPhase('gate');
    applyLook(rt, DAWN); rt.world.lookDark = false;
    rt.world.setTime('morning');
    rt.army.playFar('sig_susume', CAMP, 1);
    rt.banner('攻め重ねた後の朝', '南の土橋へ進み、木戸を破る組を守れ');
    const advance = rt.obj('main', HI(rt) ? '組を率い、南の土橋を守れ' : '南の土橋で味方を守れ', 'main');
    advance.cue = '合図：法螺貝と進み太鼓＝土橋へ進め'; advance.cueT = rt.t;
    rt.say('丹羽長秀', '夜が明けた。南の土橋へ進め。木戸を破る組を守れ', 5);
    rt.after(3.2, () => {
      if (F.step === 2 && !F.ending && !rt.over) rt.army.play('toki', F.niwa.anchor, 0.8);
    });
    F.gate.noTarget = false;
    F.bridge = { x: 0, z: -48 };
    F.bridgeRoad = {}; F.bridgeWayIndex = 0;
    F.bridgeNext = { x: 0, z: 0 }; F.bridgeGuideAt = 0;
    igaBridgeWay(rt);
    rt.marker('bridge', F.bridge, () => F.bridgeWayActive ? '' : '南の土橋', { h: 3 });
    rt.marker('bridgeWay', F.bridgeNext, () => F.bridgeWayActive ? '坂道の折れ目へ' : '',
      { h: 2, guideAlways: true, guidePriority: 200 });
    rt.zone('bridge', 0, -48, 12);
    F.bridgeT = 0;
    for (const [g, x, z] of [[F.ram, 0, -42], [F.niwa, ...APPROACH[4]], [F.tsutsui, ...APPROACH[3]], [F.igun, ...APPROACH[5]]]) {
      g.formation = 'column'; g.colW = 2; g.roadColumn = true;
      g.followColumnRoad = true;
      // 後列の持ち場も折り返しをたどる。直線の縦隊を切岸へ押し付けない。
      // 消火の近距離迎撃から、土橋を守る備えへ戻す。
      g.guardOn = false;
      if (g === F.ram) { g.guard = false; g.seekRange = 16; }
      else if (g === F.niwa || g === F.tsutsui) g.aggro = 10;
      // 出す場所の固定はここまで。行軍中は道幅と持ち場を合わせる。
      g.fixed = false; g._fitAt = 0;
      g.noAI = true; g.focus = null;
      g.order = 'path'; g.path = [[g.anchor.x, g.anchor.z]]; g.pathIdx = 1; g.speed = 2.3;
      // 山道の折れ目から土橋へ。護衛の列を崩して直進しない。
      for (const point of APPROACH) { if (point[1] < g.anchor.z && point[1] > z) g.path.push(point); }
      g.path.push([x, z]); g.dest = null;
      // 着いた後も後列は曲がった道に残す。直線の縦隊へ戻すと切岸へ並んでしまう。
      g.onArrive = (q) => { q._fitAt = 0; q.aggro = 16; };
    }
    F.lines = lines(rt, [
      { x: -48, z: -55, facing: Math.PI, w: 28, seed: 15821, A: ['oda', 0x2b3140, 1200, 'oda'], B: ['maru', IGA.armor, 350, 'iga'], flagRateB: 0, bowsB: true, surge: false },
      { x: 48, z: -55, facing: Math.PI, w: 28, seed: 15822, A: [NIWA.flag, 0x2b3140, 1200, 'oda'], B: ['maru', IGA.armor, 350, 'iga'], flagRateB: 0, gunsB: true, surge: false },
    ]);
    for (const c of F.lines) { c.go(); c.push('B', 0.55); }
    // 鉄砲は実際の弾込め・射線・命中で働く。号令だけで敵の士気を下げない。
    F.igun.holdFire = false;
    // 出撃と一斉射撃は土橋への到着後に進める。登りの間に山場を終わらせない。
  },

  // 攻めあぐねた正面を離れ、麓を囲む。撤退と敗走は共通の仕掛けに任せる。
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 2.5) return;
    F.step = 2.5; F.stepT = rt.t;
    rt.unmark('bridge'); rt.unmark('bridgeWay'); rt.unzone('bridge');
    const retreat = rt.obj('main', '麓の陣へ退け。組をそろえよ', 'main');
    for (const g of F.oda) { g.order = 'retreat'; g.anchor = { x: CAMP.x, z: CAMP.z }; g.dest = null; g.onArrive = null; }
    for (const c of F.lines) { c.push('A', -0.5); c.shake('A', 12); }
    battleEvent(rt, EVENT_RETREAT, F.bridge, F.niwa, 0, true, '正面攻めをやめ、山の麓を囲む');
    if (F.sally) retireRaid(rt, [F.sally]);
    F.igun.order = 'retreat'; F.igun.anchor = { x: 14, z: 30 }; F.igun.holdFire = false;
    rt.say('丹羽長秀', F.bridgeHeld
      ? 'そなたが土橋を保ち、木戸の組を救った。組と退け。今度は麓を囲むぞ'
      : '土塁は破れぬ。下がって麓を囲め。陣の口を守るぞ', 5);
    depthStart(rt, igaCtx(rt), igaB(rt), () => { rt.objRemove('dp'); if (!F.ending) this.withdraw(rt); });
    // 帰陣の札にも同じ合図を残す。共通の間引きで太鼓を二重に鳴らさない。
    const returnTask = rt.objectives.find((o) => o.id === 'dp');
    if (returnTask) { returnTask.cue = retreat.cue; returnTask.cueT = retreat.cueT; }
  },

  withdraw(rt) {
    const F = rt.flags;
    if (F.step >= 3 || F.ending || rt.over || !rt.player.u.alive) return;
    F.step = 3; F.stepT = rt.t;
    retireRaid(rt, F.roadGuards);
    rt.setPhase('withdraw');
    igaBeginCastleRetreat(rt);
    rt.obj('main', '城兵の退きを待て。陣の口を守れ', 'main');
    rt.say('伝令', '城兵が尾根伝いに退くのを見届けたでござる。木戸には物見を置いた', 4);

  },

  // 無人になった木戸を開け、複数の曲輪を調べる。最後の衆・奪回軍は作らない。
  inside(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5; F.stepT = rt.t;
    // 夜の退去を確かめてから、木戸と曲輪を調べる。
    // 遠景の兵は尾根の先へ歩かせたまま残す。
    rt.setPhase('inside');
    applyLook(rt, DAWN); rt.world.lookDark = false; rt.world.setTime('morning');
    // 既に破れた扉を、退去後に新品の開いた扉へ戻さない。
    if (F.gate.alive) F.gate.mesh.userData.open();
    F.gate.alive = false; F.gate.noTarget = true;
    rt.obj('main', '主郭から北の曲輪を調べよ', 'main');
    rt.banner('城が静まった朝', '主郭に入った。北の曲輪に伏兵はおらぬか');
    // 空城までの長い登りは朝への場面替えで省く。確認する曲輪は残す。
    const P = rt.player.u;
    let seat = 0;
    for (const g of rt.squadGroups || []) {
      for (const u of g.units) if (u.alive) {
        u.pos.x = seat % 2 ? 1.5 : -1.5; u.pos.z = SHU.z + 4 + Math.floor(seat++ / 2) * 1.1;
        u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
        u.target = null; u.moveTo = null; u.vel.x = 0; u.vel.z = 0;
      }
      g.anchor.x = SHU.x; g.anchor.z = SHU.z + 7;
    }
    seat = 0;
    for (const u of rt.tomoUnits || []) if (u.alive) {
      u.pos.x = seat % 2 ? 3 : -3; u.pos.z = SHU.z + 3 + Math.floor(seat++ / 2) * 1.1;
      u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
      u.target = null; u.moveTo = null; u.vel.x = 0; u.vel.z = 0;
    }
    P.pos.set(SHU.x, rt.world.heightAt(SHU.x, SHU.z + 5), SHU.z + 5);
    P.vel.x = 0; P.vel.z = 0; rt.player.vel.x = 0; rt.player.vel.z = 0; rt.player.lock = null;
    rt.say('丹羽の組頭', '朝だ。城兵は夜のうちに退いた。北の曲輪へ進め', 5);
    depthStart(rt, igaCtx(rt), [
      igaMove({ to: SHU, r: 3, max: 45, label: '主郭', obj: '主郭を調べよ' }),
      igaMove({ to: KITA, r: 9, max: 45, label: '北の曲輪', obj: '北の曲輪へ進め', say: [['足軽', '堂も空だがね。北へ足跡が続いとる', 4]] }),
      rest({ dur: 8, fn: (r) => { r.objRemove('dp'); r.obj('main', '北の曲輪で、報せを待て', 'main'); }, say: [['伝令', '城に敵はおらぬ。柏原へ退いたとの報せだ', 4]] }),
    ], () => { rt.objRemove('dp'); if (!F.ending) this.win(rt); });
  },

  lose(rt, reason) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    if (F.dp) F.dp.on = false;
    rt.unmark('dp'); rt.unzone('dp'); rt.objRemove('dp');
    rt.unmark('turn'); rt.unmark('bridge'); rt.unzone('bridge'); rt.unmark('raidRecovery');
    for (let i = 0; i < 3; i++) { rt.unmark('f' + i); rt.uninteract('f' + i); rt.unmark('r' + i); }
    rt.setPhase('end'); rt.objProgress('main', ''); rt.objFail('main'); rt.tracker.main = false;
    rt.banner('持ち場を守れず', reason);
    rt.player.u.invuln = true;
    // この戦の終幕で閉じる。共通の追撃・退却を重ねて、別の行き先を出さない。
    rt.finish({ failureReason: reason, scriptedEnd: true }, 9);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.obj('main', '比自山城の曲輪を押さえた', 'main'); rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '比自山城を押さえた', pts: 20 }; }, '比自山城の曲輪を押さえた');
    sfx('horagai', 0.6);
    rt.banner('比自山城を押さえた', '幾度も攻めを退けた伊賀衆は、夜のうちに城を離れた');
    rt.say('丹羽長秀', `${nm(rt)}、そなたが陣を保った。城の口へ組を置け`, 4);
    rt.after(5, () => { if (!rt.over) rt.say('語り', '伊賀の戦は続く。西では秀吉が鳥取城を囲んでいる', 4); });
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 10);
  },

  // 山麓の集落→森→外郭→堀切→主尾根→主郭、と進む流れの呼び名（足軽のいる所で変わる）
  stageOf(z) { return z > 30 ? '山麓の集落' : z > 5 ? '森の道' : z > -40 ? '外郭' : z > -62 ? '堀切' : z > FORT.z + FORT.r ? '主尾根' : '主郭'; },
  update(rt, dt) {
    const F = rt.flags;
    rt.world.def.raidSenseDistance = igaHoldingRaid(rt) ? 32 : 0;
    // 戦の時計と兵の時計の差で、最後の寄せだけ五人枠に戻さない。
    rt.army.igaRaidFrontUntil = igaHoldingRaid(rt) ? rt.army.time + 1 : 0;
    // 下がる間は一人が追い、後続は味方と組み合う。手当てを終えれば通常の迎撃へ戻す。
    rt.army.igaRaidRecovering = igaHoldingRaid(rt) && igaNeedsTreatment(rt);
    // 遅れて届く人の形と増援も、一秒に一度だけ仕立てる。
    if (!(F.igaHoroAt > rt.t)) { F.igaHoroAt = rt.t + 1; F.igaHoroDress(); }
    depthTick(rt, dt);
    // 印を調べるための毎コマの配列コピーは作らない。
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.ending) return;
    if (!rt.player.u.alive || rt.over) return;
    if (rt.player.u.hp < rt.player.u.maxHp * 0.5 && !(F.retreatHintAt > rt.t)) {
      F.retreatHintAt = rt.t + 30;
      rt.bark('下がれ！　来た道から味方の後ろへ。離れて傷の手当てをせよ', true);
    }
    // 本物へ替えた備えも持ち場を守る。近づいただけで城兵が麓へ突撃しない。
    if (!(F.sonaeCheckAt > rt.t)) {
      F.sonaeCheckAt = rt.t + 0.3;
      for (const h of F.jinHosts) for (const g of h.army.wk?.groups || []) {
        if (g.igaGuard) continue;
        g.igaGuard = true;
        if (g.team === 1) {
          g.faction = 'iga';
          for (const u of g.units) if (u.type === 'samurai' || u.type === 'busho') u.nanori = '伊賀の地侍なり！';
        }
        if (F.step >= 3 && g.team === 1) continue;
        g.noAI = true; g.order = 'hold'; g.guard = true;
        g.guardLeash = 6; g.guardSight = 12; g.seekRange = 8;
      }
    }
    // 本陣の待機と道詰まりを区別する。堀の奥の守りを解いて前線へ出さない。
    const chief = F.honjin?.general, cg = chief?.group;
    if (chief?.alive && !chief.fleeing && !chief.woundOut && !chief.target && chief.moving < 0.1 &&
        (cg.order === 'attack' || cg.order === 'assault' || cg.order === 'move' || cg.order === 'path')) {
      F.campWaitT = (F.campWaitT || 0) + dt;
      if (F.campWaitT > 8 && !(F.campWaitSayT > rt.t) && rt.distTo(chief.pos) < 50) {
        F.campWaitSayT = rt.t + 20;
        rt.bark(chief.stk?.n > 0 || chief.stk?.d > 0 || chief._gated
          ? '本陣の使い「道が塞がれたでござる。旗本を先に通されよ」'
          : '本陣の使い「久太郎殿は本陣で下知なさる。旗本は守りを固めよ」', true);
      }
    } else F.campWaitT = 0;
    F.guideT = (F.guideT || 0) - dt;
    const guide = F.guideT <= 0;
    if (guide) {
      F.guideT = 0.5;
      const rain = document.getElementById('rain-mark');
      if (rain && !rain.hidden) rain.textContent = '▲ 矢が降る　落ちる所を離れよ';
      // 任務の行数・大きな字にも合わせる。毎コマの寸法読みはしない。
      let bottom = F.taskLabel.getBoundingClientRect().bottom;
      if (!F.bossLabel.hidden) bottom = Math.max(bottom, F.bossLabel.getBoundingClientRect().bottom);
      F.targetStyle.setProperty('top', `${bottom + 8}px`, 'important');
    }
    if (guide && F.step === 1) {
      // 消火・迎撃の下知と、深手の者が向かう手当ての印を食い違わせない。
      const task = rt.objectives.find((o) => o.id === 'main' && !o.state);
      if (F.bucketOn && igaNeedsDousing(rt)) F.bucketManual = true;
      const text = igaNeedsTreatment(rt) ? '味方の後ろへ下がり、血を止めよ' :
        igaNeedsDousing(rt) ? `小屋の火へ。水を八秒掛けよ（${F.doused}／3軒）` : '丹羽の兵のそばで、敵を防げ';
      if (task && task.text !== text) { task.text = text; rt.missionGuide && (rt.missionGuide.scan = 0); }
      if (F.bucketOn && igaNeedsDousing(rt) && !igaNeedsTreatment(rt) && !F.douseHelp) {
        F.douseHelp = true;
        rt.say('丹羽の組頭', '消火の組が動けぬ。残る火へ水を掛けよ', 4);
      }
      igaRaidPatrol(rt);
      // 近づく敵の足音を先に鳴らす。背後の知らせは夜討ちで一度だけ。
      const p = rt.player.u;
      for (const u of rt.army.units) {
        if (!u.alive || u.team === p.team || u.isStruct || u.fleeing || u.woundOut || u.noTarget || u.group?.ambush || u.type === 'gun' || u.type === 'bow') continue;
        const dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z, d = Math.hypot(dx, dz);
        if (d < 24 && u.moving > 0.1 && !(F.igaFootAt > rt.t)) { F.igaFootAt = rt.t + 0.8; rt.army.play('step', u.pos, 0.9); }
        if (d > 24 || Math.abs(u.pos.y - p.pos.y) > 3 || (dx * Math.sin(p.heading) + dz * Math.cos(p.heading)) / (d || 1) >= 0.5 || rt.army.wallBetween(p.pos, p.team, u.pos)) continue;
        if (u.igaRearReadyAt == null) u.igaRearReadyAt = rt.t + 0.6;
        igaRaidNotice(rt, u);
      }
    }
    if (guide && (F.step === 2 || F.step === 2.5)) {
      for (const g of F.roadGuards) {
        if (!g.ambush || g.igaStep !== F.step || rt.distTo(g.anchor) > 25) continue;
        for (const u of g.units) u.noTarget = false;
        igaAdvance(g, g.igaHome);
        g.guard = true; g.guardLeash = 10; g.guardSight = 25;
      }
    }
    if (F.step === 1) {
      if (F.bucketOn && F.doused < 3 && !gone(F.ram)) {
        let i = F.bucketIndex;
        if (i < 0 || !F.fires[i]) {
          i = F.fires.findIndex(Boolean); F.bucketIndex = i; F.bucketT = 0;
          if (i >= 0) {
            const h = F.huts[i];
            // 二列の縦隊では後列が軒へ届かない。軒の外で横に並び、近い敵だけ迎える。
            F.ram.noAI = true; F.ram.fixed = false; F.ram._fitAt = 0;
            F.ram.formation = 'line'; F.ram.width = 5;
            F.ram.guard = true; F.ram.guardLeash = 3; F.ram.seekRange = 3;
            F.ram.order = 'move'; F.ram.dest = { x: h.x, z: h.z + 4.2 };
            F.ram.onArrive = (g) => { g.order = 'hold'; g.facing = Math.PI; };
          }
        }
        if (i >= 0) {
          const h = F.huts[i]; let buckets = 0;
          for (const u of F.ram.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget &&
              !u.atk && !u.swing && !u.target?.alive && Math.hypot(u.pos.x - h.x, u.pos.z - h.z) <= 5.2) buckets++;
          F.bucketAble = buckets;
          F.bucketStallT = buckets >= 2 ? 0 : (F.bucketStallT || 0) + dt;
          F.bucketT = buckets >= 2 ? F.bucketT + dt : 0;
          if (F.bucketT >= 8) this.douse(rt, i, false);
        }
      }
      const L = F.raiders || [];
      // 退いた組へ命令を出し直さない。寄せの間に、味方へ戻って息を整える間を置く。
      for (let i = 1; i < L.length; i++) {
        // 手当ての下知と新手の寄せを重ねない。準備済みの兵は林で待つ。
        if (igaNeedsTreatment(rt)) break;
        if (rt.t - F.stepT < (i === 2 ? 42 : 26)) break;
        if (L[i].igaSent || !L[i - 1].igaSent || !gone(L[i - 1])) continue;
        if (F.nextRaidAt == null) F.nextRaidAt = rt.t + 8;
        if (rt.t < F.nextRaidAt) break;
        F.nextRaidAt = null;
        if (igaAdvance(L[i], i === 1 ? { x: 12, z: 40 } : CAMP, true)) {
          rt.say('足軽', i === 1 ? '東から来るがね！　こっちで迎えるぞ！' : '裏道にもおるがね！', 2);
        }
        break;
      }
      if (guide) rt.objProgress('main', igaNeedsTreatment(rt) ? rt.player.treatmentNext > rt.t
        ? '味方の後ろで休め。布を巻き直せるまで待て'
        : '敵から離れ、「血を止める」を三秒長押し' :
        F.doused < 3 ? `消火 ${F.doused}／3軒・あと${Math.max(0, Math.ceil(150 - (rt.t - F.stepT)))}秒。${igaNeedsDousing(rt) ? '火のそばで水を掛けよ' : F.bucketAble >= 2 ? '消火の組を守れ' : '味方と敵を防げ'}` : '火は消えた。味方の列で陣を守れ');
      for (const q of L) if (q.count < 3 && !gone(q)) q.morale = Math.min(q.morale, 20);
      // 組頭が消火の場所を知らせる。離れた場所の火を味方の台詞だけで消さない。
      const w = rt.t - F.stepT, foes = L.length >= 3 && L.every(gone);
      // 桶の長押しを知らない人も止めない。二十秒たてば味方の消火の組が自分から火へ向かう。
      if (!F.bucketOn && w > 4 && !gone(F.ram)) { F.bucketOn = true; F.bucketIndex = -1; F.bucketT = 0; F.bucketStallT = 0; }
      if (F.doused < 3 && w > 55 && !F.nudge && !igaNeedsTreatment(rt)) {
        F.nudge = true;
        if (igaNeedsDousing(rt) && !F.douseHelp) rt.say('丹羽の組頭', '火の印へ。水を掛ける札を八秒長押しせよ', 4);
      }
      if (guide) {
        const trace = F.raidTrace || (F.raidTrace = { fires: 0, holding: '', held: 0, enemies: 0, nearest: 0 });
        trace.fires = F.fires.reduce((n, f) => n + (f ? 1 : 0), 0);
        trace.holding = rt.holdId || ''; trace.held = rt.holdT || 0; trace.enemies = 0; trace.nearest = Infinity;
        for (const g of L) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) {
          trace.enemies++; trace.nearest = Math.min(trace.nearest, Math.hypot(u.pos.x - CAMP.x, u.pos.z - CAMP.z));
        }
      }
      if (gone(F.niwa) && gone(F.tsutsui)) {
        this.lose(rt, '陣を守る味方が崩れ、陣を退く'); return;
      }
      // 消火と陣の保持が役目。林や切岸に残る一人の全滅を求め、消火済みでも時間で負けにしない。
      if (F.doused >= 3 && (foes || w >= 45 && L.every((g) => g.igaSent))) {
        if (!foes) rt.say('丹羽の組頭', '火は消え、陣は持ちこたえた。敵が退くぞ。追うな', 4);
        this.midA(rt); return;
      }
      // 消火の組が崩れても負けにしない。残る火は陣の者が消し、迎え撃ちを続ける。
      if (w >= 100 && F.doused < 3) F.fires.forEach((f, i) => { if (f) this.douse(rt, i, false); });

    }
    if (F.step === 3 && guide && rt.t - F.stepT <= 8) rt.objProgress('main', '物見が木戸と曲輪を見張る');
    if (F.step === 3 && guide && rt.t - F.stepT > 8) {
      const clear = igaCastleCleared(rt);
      rt.objProgress('main', clear ? '城は静まった。物見の報せを待て' : '物見が城兵の退きを確かめている。陣を守れ');
      if (clear) this.inside(rt);
      else if (rt.t - F.stepT >= 15) this.inside(rt);   // 残る城兵は物見が見届ける。止めずに城内へ進める
    }
    if (F.step === 2) {
      const p = rt.player.u.pos;
      const bridgeY = rt.world.heightAt(F.bridge.x, F.bridge.z);
      const atBridge = Math.hypot(p.x - F.bridge.x, p.z - F.bridge.z) <= 12 && Math.abs(p.y - bridgeY) < 3;
      if (rt.t >= F.bridgeGuideAt) { F.bridgeGuideAt = rt.t + 0.35; igaBridgeWay(rt); }
      let friends = 0, foes = 0;
      for (const u of rt.army.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.isStruct || u.group?.civ ||
            Math.abs(u.pos.y - bridgeY) >= 3 || Math.hypot(u.pos.x - F.bridge.x, u.pos.z - F.bridge.z) >= 24) continue;
        if (u.team === 0) friends++; else foes++;
      }
      let supported = false;
      for (const u of F.ram.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget &&
          Math.abs(u.pos.y - bridgeY) < 3 && Math.abs(p.y - u.pos.y) < 3 && Math.hypot(u.pos.x - F.bridge.x, u.pos.z - F.bridge.z) < 24 && Math.hypot(p.x - u.pos.x, p.z - u.pos.z) < 12 && !rt.army.wallBetween(p, -1, u.pos)) { supported = true; break; }
      // 平面上で近い下段の道を到着としない。実際に土橋へ着いてから守備を始める。
      if (F.bridgeStarted == null && atBridge) F.bridgeStarted = rt.t;
      const elapsed = F.bridgeStarted == null ? 0 : rt.t - F.bridgeStarted;
      if (F.bridgeStarted != null && elapsed >= 8 && !F.sally.igaSent) {
        igaAdvance(F.sally, F.bridge);
        F.sally.focus = F.ram.units.find((u) => u.alive && !u.fleeing && !u.woundOut && !u.noTarget) || null;
        rt.say('足軽', '東の林から出たがね！　土橋の味方が危ねえ！', 3);
      }
      if (F.bridgeStarted != null && elapsed >= 24 && !F.bridgeVolley) {
        F.bridgeVolley = true;
        for (const c of F.lines) c.volley('B');
        rt.say('伊賀の地侍', '土橋へ狙いをそろえよ！　この山は渡さぬ！', 4);
      }
      // 敵を押し返した後も、味方のそばで退き道を保つ働きを数える。
      if (F.sally.igaSent && supported && friends > foes && atBridge) F.bridgeT += dt;
      if (F.bridgeT >= 20 && !F.bridgeHeld) {
        F.bridgeHeld = true;
        rt.award((t) => t.side.push('南の土橋で木戸の組を守った'), '土橋を保ち、木戸の組の退き道を守った');
      }
      if (guide) {
        const nearBridge = atBridge;
        const text = F.bridgeStarted == null ? F.bridgeWayActive ? '坂の印をたどり、土橋へ進め' : '道沿いの敵を押し返し、南の土橋へ進め'
          : F.ramLost || !F.ram.count ? '土橋を守り、味方の退き道を空けよ'
          : !nearBridge ? F.bridgeWayActive ? '坂の印をたどり、土橋へ戻れ' : '土橋の印へ戻り、味方を守れ'
          : !supported ? '木戸を破る味方のそばで守れ'
          : friends <= foes ? '土橋の味方と敵を押し返せ'
          : F.bridgeHeld ? '土橋を保ち、退く下知を待て' : '土橋で木戸を破る味方を守れ';
        const task = rt.objectives.find((o) => o.id === 'main' && !o.state);
        if (task && task.text !== text) { task.text = text; if (rt.missionGuide) rt.missionGuide.scan = 0; }
        rt.objProgress('main', F.bridgeHeld ? '退き道は保った。土橋を離れるな'
          : supported && nearBridge && friends > foes ? `味方を守った時間 ${Math.min(20, Math.floor(F.bridgeT))}／20秒`
          : text);
      }
      if (!F.ram.count && !F.ramLost) { F.ramLost = true; rt.say('丹羽の組頭', '木戸の組が崩れた！　その方は土橋を保ち、味方が退く道を空けよ', 4); }
      if (F.sally && F.sally.count < 4 && !gone(F.sally)) { F.sally.noRout = false; F.sally.morale = Math.min(F.sally.morale, 20); }
      if (elapsed >= 45 || (elapsed >= (F.bridgeHeld ? 26 : 34) && gone(F.sally) && friends > 0 && atBridge) ||
          F.bridgeStarted == null && rt.t - F.stepT > 70) this.midB(rt);   // 坂で手間取っても、正面攻めは九十秒で引き上げる
    }
  },

  onKill(rt, v) {
    if (v.isStruct || v.group?.civ || v.type === 'porter') return;
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onStructDestroyed(rt, s) {
    if (s !== rt.flags.gate) return;
    if (s.mesh && s.mesh.userData.fall) s.mesh.userData.fall();
    sfx('wood', 1.2);
    rt.bark('木戸が破れた。城兵はまだ残る。土橋の持ち場を守れ', true);
    // 門の破損は勝利にも退去にも直結させない。曲輪の守りと包囲は続く。
  },
};

// 比自山周辺の設定兵力。退去を討死として減らさない。伊賀全土の四万余を、この一城の兵と混ぜない。
iga.force = () => ({ a: 15000, a0: 15000, b: 3500, b0: 3500 });
iga.sides = { a: { name: '織田の包囲勢（推定）', mon: 'oda' }, b: { name: '比自山の伊賀衆（推定）', mon: 'maru' } };
iga.famous = []; // 東の包囲陣の将を、南の木戸組へ重複して置かない。
// 正面攻めから帰陣する間も朝。包囲の夜へ替わった時に、景色と同じ時計で札を替える。
iga.date = (rt) => `天正九年九月　秋・${rt.world.timeKey === 'night' ? '夜' : '朝'}（攻防の復元）`;
iga.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '見張りを始める' : '');
iga.skip = (rt) => { if (rt.phase === 'brief' && !rt.over && !rt.flags.ending) iga.raid(rt); };
iga.history = '信長公記巻十四は、天正九年九月三日、信雄らが甲賀・信楽・加太・大和などの口から伊賀へ入ったと記す。九月十一日の夜間退去は佐奈具の城の記録で、比自山の落城日とは別である。比自山の詳しい攻防は後世の伊乱記で補い、蒲生忠三郎・堀秀政・筒井順慶らの包囲、繰り返す攻めへの抵抗、夜討ち、夜の城の放棄を描いた。守り手は柏原へ移ったとも伝わる。城跡は寺跡を使い、比高約百五十歩、縄張図の図読みでは南北約四百十五歩・東西約百八十五歩に曲輪と空堀が続く。南辺の土塁と空堀が強く、守りの正面と考えられる。丹羽の一組の役割、各隊の場所、陣の小屋の消火、土橋の鉄砲、時間配分は遊びのための復元。兵数には諸説あり、設定の味方一万五千・守り三千五百は比自山周辺の推定で、伊賀全土の総勢でも、城に逃れた非戦の者を含む数でもない。 各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。 曲輪の守将の名と家紋は確定せず、丸の旗を代用した。朝と夜は数日にわたる攻防を縮めた景色で、当日の時刻・天気・月齢を確定するものではない。総本陣の信雄はこの狭い戦場には置かず、堀の局地の本陣と区別した。 城域と主な平場・南の小曲輪群・北の段数は伊賀市史の縮尺二千分の一の縄張図から読んだ目安。細かな輪郭と道、長田丸・朝屋丸の位置は推定で、読めない空堀の幅・深さ・標高は従来の復元値を保つ。近隣の川や旧河道を測量どおりに復元した地形ではない。';

// 任務の印へ向かう自動の遊び手。
iga.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null; inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) {
    const C = F.dp.cur;
    const needsTreatment = igaNeedsTreatment(b);
    if (F.step === 2.5 && C?.s.kind === 'move' && !needsTreatment && !F.dpBack &&
        igaFightBot(b, inp, goTo, patientStrike, u.pos, 18)) return;
    if (C?.s.kind === 'hold' && !F.dpBack && !needsTreatment && p.sta >= p.maxSta * 0.22) {
      inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false; inp.runHeld = false;
      // 印と敵へ同じコマに歩かせると、行き先が毎回変わって小屋を回る避け足が消える。
      // 迎撃の相手を先に決め、敵がいない時だけ印へ戻る。
      // 持ち場の外へ敵を追うと守った時間が増えない。輪の縁では先に列へ戻る。
      if (b.distTo(C.at) > C.botRadius - 2 ||
          !igaFightBot(b, inp, goTo, patientStrike, C.at, C.botRadius - 2)) goTo(p, inp, C.at.x, C.at.z, 4);
      return;
    }
    depthBot(b, inp, goTo);
    return;
  }
  // 傷は自然には戻らない。手当てを済ませ、息が戻れば任務に戻る。
  const canTreat = p.treatmentLeft > 0 && !p.mounted;
  if ((igaNeedsTreatment(b) && canTreat) || p.sta < p.maxSta * 0.22) b.botRest = true;
  if (b.botRest && (!igaNeedsTreatment(b) || !canTreat) && p.sta > p.maxSta * 0.55) b.botRest = false;
  if (b.botRest) {
    inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
    const threat = igaBotThreat(b);
    if (p.treatmentReady && canTreat && !threat) inp.k.add('KeyE');
    // 土橋へ登る途中の息切れだけで、麓の陣まで逆走しない。傷の手当ては従来の場所へ戻る。
    else if (F.step === 2 && !igaNeedsTreatment(b)) {
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      inp.runHeld = false;
    } else goTo(p, inp, F.step === 1 ? F.raidRest.x : CAMP.x, F.step === 1 ? F.raidRest.z : CAMP.z + 8, 2);
    if (threat) {
      // 小屋を避ける退き道を保ち、打ち手を向いて後ろ・横へ歩く。
      const moving = inp.k.has('KeyW'), retreatYaw = p.yaw;
      p.yaw = Math.atan2(threat.pos.x - u.pos.x, threat.pos.z - u.pos.z);
      inp.k.delete('KeyW'); inp.guardHold = true; inp.runHeld = false;
      if (moving) {
        const along = Math.cos(retreatYaw - p.yaw), across = Math.sin(retreatYaw - p.yaw);
        if (Math.abs(along) > 0.38) inp.k.add(along > 0 ? 'KeyW' : 'KeyS');
        if (Math.abs(across) > 0.38) inp.k.add(across > 0 ? 'KeyA' : 'KeyD');
      }
    }
    return;
  }
  const travelling = F.step === 2 && (b.distTo(F.bridge) > 12 ||
    Math.abs(u.pos.y - b.world.heightAt(F.bridge.x, F.bridge.z)) >= 3);
  const post = F.step === 2 ? travelling ? u.pos : F.bridge : F.niwa.anchor;
  // 麓の敵を二十四メートル先まで追うと、下知の列から一人だけ離れてしまう。
  // 登りの途中は自分へ迫る敵だけ防ぐ。下段の敗走兵を追って土橋への前進を止めない。
  if ((F.step === 1 || F.step === 2) && igaFightBot(b, inp, goTo, patientStrike, post, F.step === 1 ? 12 : 24,
      travelling || F.step === 1 && igaNeedsDousing(b))) return;
  inp.guardHold = false;
  if (F.step === 1) {
    // 一軒を消したら消火役へ任せ、林の敵を追わず味方の列へ戻る。
    if (!igaNeedsDousing(b)) {
      goTo(p, inp, CAMP.x + 4, CAMP.z, 3); return;
    }
    let it = null, bd = Infinity;
    for (const x of b.interacts) if (x.id.startsWith('f')) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
    if (it) { if (bd > 4.8) goTo(p, inp, it.pos.x, it.pos.z, 4.8); else inp.k.add('KeyE'); return; }
  }
  if (F.step === 2) {
    const next = igaBridgeWay(b);
    // 既に折れ目を選んだ道を、共通の道探しでもう一度前の角へ引き戻さない。
    goTo(p, inp, next.x, next.z, F.bridgeWayActive ? 0.7 : 4, true); return;
  }
  goTo(p, inp, CAMP.x + 4, CAMP.z, 3);
};

// 持ち場の周りの、同じ高さで道が通る敵だけを迎える。敗走や城内の守り手は追わない。
function igaFightBot(b, inp, goTo, patientStrike, post, radius, defendOnly = false) {
  const p = b.player, u = p.u;
  const eligible = (o) => o.alive && o.team !== u.team && !o.fleeing && !o.woundOut && !o.noTarget && !o.invuln && o.type !== 'dummy' &&
    o.pos.z > b.flags.gz + 0.8 && Math.hypot(o.pos.x - post.x, o.pos.z - post.z) <= radius &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos, false);
  // 寄せる間も相手を保つ。毎回近い兵へ替えると、どの相手にも届かない。
  const previous = p.igaFightFoe;
  // 火へ向かう時・水を掛ける時も、持ち場の外から本人を狙う三メートル内の敵を先に迎える。
  const close = b.flags.step === 1 || defendOnly ? igaBotThreat(b) : null;
  const e = close || (defendOnly ? null : previous && eligible(previous) && Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < 30
    ? previous : b.army.nearestEnemy(u, 30, eligible));
  p.igaFightFoe = e;
  if (!e) return false;
  const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
  inp.k.delete('KeyE');
  const reach = p.weapon === 'sword' ? 1.7 : 2.8;
  if (p.lock && p.lock !== e) inp.e.add('KeyQ');
  // 登りで迎える時は敵の足元へ追わない。隣の折り返しとの間は切岸である。
  if (defendOnly && u.pos.z < 12 && u.pos.z > -42) {
    inp.k.delete('KeyW'); inp.k.delete('KeyA'); inp.k.delete('KeyS'); inp.k.delete('KeyD');
    inp.runHeld = false;
  } else goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
  // 届く所で敵を向く。移動中に向きを戻すと、焚き火や小屋を避ける歩みを打ち消す。
  if (d < reach && !inp.k.has('KeyW')) p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
  let attacker = close && (close.atk?.target === u || close.swing?.target === u && !close.swing.done) ? close : null;
  let attackD = attacker ? d : Infinity;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.woundOut || o.team === u.team || o.type === 'gun' || o.type === 'bow' ||
        !(o.atk?.target === u || o.swing?.target === u && !o.swing.done) || Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    const od = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (od > (o.reach || 2.8) + 0.8 || od >= attackD || b.army.wallBetween(u.pos, -1, o.pos)) continue;
    attacker = o; attackD = od;
  }
  // 実際に打ち込む相手へ構える。別の敵を向いたまま背中で受けない。
  const threatened = !!attacker;
  if (attacker) {
    p.yaw = Math.atan2(attacker.pos.x - u.pos.x, attacker.pos.z - u.pos.z);
    inp.k.delete('KeyW'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
    inp.runHeld = false;
  }
  // 構えたままの一押しは槍の払いになる。隙に構えを解き、突けるまで待つ。
  inp.guardHold = threatened; inp.leftPressed = false; inp.chargeHold = false;
  if (d < reach && !threatened) patientStrike(p, inp, e, d);
  return true;
}

// 振り始める前の狙いも拾う。壁や段差の向こう、味方と戦う敵には火消しを止めない。
function igaBotThreat(b) {
  const u = b.player.u;
  let nearest = null, best = 9;
  for (const o of b.army.units) {
    if (!o.alive || o.team === u.team || o.fleeing || o.woundOut || o.noTarget || o.isStruct ||
        o.type === 'dummy' || (o.type === 'gun' || o.type === 'bow') && !o.sidearm ||
        !(o.target === u || o.atk?.target === u || o.swing?.target === u && !o.swing.done) ||
        Math.abs(o.pos.y - u.pos.y) >= 3) continue;
    const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d2 = dx * dx + dz * dz;
    if (d2 > best || b.army.wallBetween(u.pos, -1, o.pos)) continue;
    nearest = o; best = d2;
  }
  return nearest;
}

// 準備時に実兵を置き、波はその兵への下知で表す。携帯用の実兵枠を越えない。
function igaEnemy(rt, x, z, n, name, list = null) {
  let live = 0;
  for (const u of rt.army.units) if (u.alive) live++;
  let room = Math.max(0, 240 - live);
  const troops = [];
  for (const q of list || [{ type: 'samurai', n: 1, o: name === '林を回る伊賀衆'
    ? { name: '伊賀の組頭', hat: 'kabuto_m', flag: 'maru' } : { hat: 'kabuto_m' } }, uA(n - 1)]) {
    const count = Math.min(room, q.n); room -= count;
    if (count) troops.push({ ...q, n: count });
  }
  // 折れ目の中ほどを守る三人組は、麓への直線でなく道に沿って一列に立つ。
  // 準備時だけ向きを決め、固定の持ち場も同じ列を使う。
  const roadPost = n === 3 && z < 12 && z > -42;
  let facing = Math.atan2(-x, CAMP.z - z);
  if (roadPost) {
    const road = {};
    roadPoint({ x, z }, road);
    const a = ROAD[Math.floor(road.s)], b = ROAD[Math.floor(road.s) + 1];
    facing = Math.atan2(a[0] - b[0], a[1] - b[1]);
  }
  const g = enemyGroup(rt, { fixed: true, ambush: !list, faction: 'iga', name, anchor: { x, z },
    facing, formation: 'column', colW: roadPost ? 1 : 2, width: 2,
    igaHome: { x, z }, order: 'hold', noAI: true, aggro: 8, morale: 85, fleeDir: { x: Math.sign(x), z: -1 }, dmgMult: 1 }, dress(troops, IGA));
  for (const u of g.units) if (u.type === 'samurai' || u.type === 'busho') u.nanori = '伊賀の地侍なり！';
  return g;
}
// 半秒ごとに近くの戦える敵を調べる。十二秒途切れたら、近い伏兵だけを寄せる。
// 三十六メートル以内の二人組が歩いて来る余裕を残し、瞬間移動や毎コマの兵作りはしない。
function igaRaidPatrol(rt) {
  const F = rt.flags, p = rt.player.u;
  if (rt.t - F.stepT < 24) return;
  // 深手で味方へ下がる者や、次の寄せを待つ間へ、別の伏兵を重ねない。
  // 林で待つ未出撃の組まで「寄せている敵」に数えると、切れ目を埋める組が動けない。
  if (igaNeedsTreatment(rt) || F.nextRaidAt > rt.t || F.raiders.some((g) => g.igaSent && !gone(g))) return;
  for (const u of rt.army.units) {
    if (!u.alive || u.team === p.team || u.isStruct || u.fleeing || u.woundOut || u.noTarget || u.group?.ambush) continue;
    if (Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) <= 12 && Math.abs(u.pos.y - p.pos.y) < 3 &&
        !rt.army.wallBetween(p.pos, -1, u.pos, false)) { F.raidNearT = rt.t; return; }
  }
  if (rt.t - F.raidNearT < 12) return;
  let next = null, nearest = 36;
  for (const g of F.raidPatrols) {
    if (!g.ambush) continue;
    // 待機兵は狙えなくしてあるため、gone ではなく生存で調べる。
    if (!g.units.some((u) => u.alive && !u.fleeing && !u.woundOut)) continue;
    const d = rt.distTo(g.anchor);
    if (d < nearest && Math.abs(rt.world.heightAt(g.anchor.x, g.anchor.z) - p.pos.y) < 3) { next = g; nearest = d; }
  }
  if (!next) return;
  for (const u of next.units) u.noTarget = false;
  igaAdvance(next, CAMP, true);
  // 道を歩いて陣へ寄せる。本人一人を追わせず、迎えた味方とも戦わせる。
  next.focus = null;
  F.raidNearT = rt.t;
  rt.bark('道の脇に敵がおる！　味方のそばで迎えよ');
}

function igaAdvance(g, at, guardCamp = false) {
  if (!g) return false;
  g.igaSent = true;
  g.ambush = false;
  if (g.routed || !g.units.some((u) => u.alive && !u.fleeing && !u.woundOut)) return false;
  for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) u.noTarget = false;
  // 陣へ向かう途中で遠い番兵を狙うと、後列が道を外れ、先頭も待ち続ける。
  // 近くの迎撃には応じ、陣に着いたら従来の索敵範囲へ戻す。
  g.noAI = true; g.seekRange = 60; g.aggro = guardCamp ? 5 : 14;
  g.fixed = false; g._fitAt = 0;
  g.igaRaidPost = guardCamp ? { x: at.x, z: at.z } : null;
  const home = g.igaHome || { x: g.anchor.x, z: g.anchor.z };
  const path = [];
  // 柵の切れ目と火のそばを通る。暗い林から本人へ直線で殺到させない。
  if (at.z > 12 && home.z > 80) {
    // 裏の中央から斜めに入ると、十〜三十八メートルの柵に突き当たる。
    // 中央の切れ目を南へ抜けてから東西へ回す。退く時も同じ道を逆に使う。
    if (Math.abs(home.x) < 22) path.push([0, 86], [0, 74]);
    path.push([home.x < 0 ? -28 : 28, 74], [home.x < 0 ? -32 : 32, 50]);
  }
  else if (at.z > 12 && home.z >= 12 && home.z <= 80 && Math.abs(home.x) > 38)
    path.push([Math.sign(home.x) * 32, home.z < 38 ? (home.x < 0 ? 20 : 26) : 50]);
  if (Math.abs(home.x) < 20 && home.z < -5) {
    for (let i = APPROACH.length - 1; i >= 0; i--) if (APPROACH[i][1] > home.z && APPROACH[i][1] < at.z) path.push(APPROACH[i]);
  } else if (at.z < -5) path.push([home.x, -20], [0, -20]);
  path.push([at.x, at.z]);
  g.igaIngress = [[home.x, home.z], ...path];
  // 後列も寄せ口まで同じ折れ目をたどる。一直線の隊列で薪や柵へ引っ掛けない。
  g.order = 'path'; g.path = g.igaIngress; g.pathIdx = 0; g.formation = 'column'; g.colW = 2;
  g.roadColumn = true;
  g.onArrive = (q) => {
    q.path = null;
    // 夜討ちは陣口で味方と戦う。傷を負って列の後ろへ下がる一人を陣奥まで追わない。
    q.order = guardCamp ? 'hold' : 'attack';
    if (guardCamp) { q.guard = q.guardOn = true; q.aggro = 8; q.guardLeash = 18; q.guardSight = 20; q.seekRange = 18; }
  };
  for (const u of g.units) u._crouch = false;
  return true;
}

// 持ち場を守った時間と、実際の敵の退き方で決める。秒数だけで敵の士気を落とさない。
function igaHold(o) {
  return {
    kind: 'hold', max: Infinity,
    start(rt, C) {
      C.at = o.at; C.goal = o.at; C.inT = 0; C.outT = 0; C.botRadius = o.r;
      C.waves = o.waves.slice(); C.nextWaveAt = 0; C.lastWaveT = 0; C.lastContactT = 0;
      // 陣へ来た敵を外へ押し返した事も迎撃の成果。林の生き残りの全滅を求めない。
      // まだ陣へ来ていない組は区別し、待っているだけで撃退済みにしない。
      C.raidEntered = new Set(); C.raidAway = new Map(); C.repulsed = new Set(); C.raidHealth = new Map();
      C.raidGone = (g) => gone(g) || C.repulsed.has(g);
      rt.objRemove('main');
      rt.banner(o.title, o.sub); rt.obj('dp', o.obj, 'main');
      // 到着後も持ち場の印を残し、集まる味方と同じ所を示す。
      rt.marker('dp', C.at, o.label, { h: 3, guideAlways: true, guideDefend: true });
      rt.zone('dp', C.at.x, C.at.z, o.r);
      // 消火後も手当ての行き先を残す。陣口の印と敵の方向の印は別の役目。
      rt.marker('raidRecovery', rt.flags.raidRest, () => igaNeedsTreatment(rt) ? '味方の後ろで手当て' : '',
        { h: 2, guideAlways: true, guidePriority: 600 });
      const guard = rt.flags.honjin.guard;
      guard.anchor.x = rt.flags.raidRest.x; guard.anchor.z = rt.flags.raidRest.z - 4;
      guard.guardLeash = 4;
      rt.army.igaRaidFrontUntil = rt.army.time + 1;
      for (const [who, line, dur] of o.say || []) rt.say(who, line, dur);
      for (let i = 0; i < rt.flags.oda.length; i++) {
        const g = rt.flags.oda[i];
        igaGather(rt, g, { x: C.at.x + (i - 1) * 8, z: C.at.z + 5 });
      }
      // 鉄砲組も同じ陣口へ戻す。以前の東十四・北十の持ち場は守る輪の外で、
      // そばで撃っていても守備の人数に入らなかった。消火後も帰陣後も同じ列にそろえる。
      igaGather(rt, rt.flags.igun, { x: C.at.x + 12, z: C.at.z - 4 });
    },
    tick(rt, C, m, ctx, el, dt) {
      // 前の寄せを退けてから八秒空ける。決まった時刻に敵を重ねない。
      const prior = C.groups[C.groups.length - 1];
      if (prior && !C.raidGone(prior)) C.nextWaveAt = el + 8;
      const w = C.waves[0];
      if (w && el >= w.t && el >= C.nextWaveAt && (!prior || C.raidGone(prior))) {
        C.waves.shift(); C.groups.push(w.group); C.lastWaveT = el;
        C.raidHealth.set(w.group, w.group.units.reduce((sum, u) => sum + (u.alive ? Math.max(0, u.hp) : 0), 0));
        if (igaAdvance(w.group, C.at, true) && w.say) rt.say(w.say[0], w.say[1], 3.5);
      }
      // 仲間を失った少人数の組は退ける。林の最後の一人を探す任務にしない。
      const postY = rt.world.heightAt(C.at.x, C.at.z);
      for (const g of C.groups) if (!C.raidGone(g)) {
        let ready = 0, near = false, intercepted = false, atEdge = false, health = 0;
        // 味方の突きを受けて退いた敵も数える。敵側の攻撃動作だけでは、
        // 構えたまま押し返された組や、コマの間に倒れた兵を取りこぼす。
        for (const u of g.units) {
          if (u.alive) health += Math.max(0, u.hp);
          if (!u.noTarget && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) <= o.r + 18 &&
              Math.abs(u.pos.y - postY) < 3) atEdge = true;
        }
        if (atEdge && health < C.raidHealth.get(g) - 0.01) intercepted = true;
        for (const u of g.units) if (igaReady(u)) {
          ready++;
          // 勢力を数える守備範囲とそろえる。外の六メートル帯の敵が、
          // 陣内にいないのに撃退待ちを続ける扱いにならないようにする。
          if (Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) <= o.r &&
              Math.abs(u.pos.y - postY) < 3) near = true;
          // 陣の外縁で味方と実際に槍を合わせた組も、迎撃された組として記録する。
          // 索敵中の標的や遠い待機兵だけでは数えず、林への追撃を求めない。
          const target = u.atk?.target || (u.swing && !u.swing.done ? u.swing.target : null);
          if (target && igaReady(target) && target.team === 0 &&
              Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) <= o.r + 18 &&
              Math.abs(u.pos.y - postY) < 3 && Math.abs(u.pos.y - target.pos.y) < 3 &&
              Math.hypot(u.pos.x - target.pos.x, u.pos.z - target.pos.z) <= (u.reach || 2.8) + 0.8)
            intercepted = true;
        }
        if (intercepted && !C.raidEntered.has(g)) {
          C.lastContactT = el; C.raidEntered.add(g);
        }
        if (near) {
          // 林から回り込む時間で迎撃の猶予を使い切らない。各組の初到達だけを記録する。
          if (!C.raidEntered.has(g)) C.lastContactT = el;
          C.raidEntered.add(g); C.raidAway.set(g, 0);
        }
        else if (C.raidEntered.has(g)) {
          const away = (C.raidAway.get(g) || 0) + dt;
          C.raidAway.set(g, away);
          if (away >= 12) {
            C.repulsed.add(g);
            // 消さず、来た道を歩いて退かせる。次の寄せとの間は八秒空ける。
            retireRaid(rt, [g]);
            rt.bark('陣の外へ押し返したぞ。追わずに列を守れ');
            continue;
          }
        }
        if (ready <= Math.max(2, Math.floor(g.units.length / 2))) {
          g.noRout = false; g.morale = Math.min(g.morale, 20);
        }
      }
      const p = rt.player.u.pos;
      const d = Math.hypot(p.x - C.at.x, p.z - C.at.z);
      let friend = 0, enemy = 0;
      for (const u of rt.army.units) {
        if (!igaReady(u) || u.isStruct || u.group?.civ || u.group?.ambush) continue;
        if (Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) > o.r ||
            Math.abs(u.pos.y - postY) > 3) continue;
        if (u.team === 0) friend++; else enemy++;
      }
      // 槍を合わせて敵を押し返す時間も、持ち場を守った時間に含める。
      if (d <= o.r && friend >= 2 && friend >= enemy) C.inT += dt;
      C.outT = d <= o.r + 6 || igaNeedsTreatment(rt) ? 0 : C.outT + dt; // 短い押し出しと、下知どおりの手当ては離脱にしない。
      // 敵が陣へ入っていない間は、味方の集合待ちだけで「押し負け」を数えない。
      // 離脱・時間切れは別に判定し、敵が入った時の十五秒の猶予は保つ。
      C.breachT = enemy > 0 && (enemy > friend || friend < 2) ? (C.breachT || 0) + dt : 0;
      // 陣へ届いた組とは四十五秒は戦える。出入りで期限を延ばさず、未到達なら従来どおり。
      const deadline = Math.max(Math.max(o.dur, C.lastWaveT) + 25, C.lastContactT + 20);   // 一つの戦を四〜七分に収める
      if (C.breachT >= 30) { iga.lose(rt, '陣の口で味方が押し負け、後ろの備えへ退く'); return false; }
      if (C.outT > 60) { iga.lose(rt, '陣の口を離れ、組を支えられなかった'); return false; }
      const clear = !C.waves.length && C.groups.every(C.raidGone);
      // 最後の敵が退いたコマを時間切れで敗戦にしない。
      if (clear && C.inT >= o.dur * 0.6) return true;
      // 期限まで陣が崩れずに持ったなら、守りきった扱い（敵は林へ退く）。止まらずに次へ進める。
      if (el > deadline) { C.held = true; return true; }
      C.guideT = (C.guideT || 0) - dt;
      if (C.guideT <= 0) {
        C.guideT = 0.5;
        // 出撃の合図と陣への到着は別。まだ林にいる敵は、方角と実際の距離で知らせる。
        let incoming = null, incomingD = Infinity;
        if (prior && !C.raidGone(prior) && !enemy) for (const u of prior.units) if (igaReady(u)) {
          const distance = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
          if (distance < incomingD) { incoming = u; incomingD = distance; }
        }
        const incomingSide = incoming ? Math.abs(incoming.pos.x - C.at.x) > Math.abs(incoming.pos.z - C.at.z)
          ? incoming.pos.x > C.at.x ? '東' : '西' : incoming.pos.z > C.at.z ? '南' : '北' : '';
        // 手当ての印へ退く下知を、任務の見出しにも合わせる。
        const task = rt.objectives.find((q) => q.id === 'dp' && !q.state);
        // 携帯で補足が省かれても、今の危険と次の行動を見出しで伝える。
        const text = igaNeedsTreatment(rt) ? '味方の後ろへ下がり、血を止めよ'
          : d > o.r ? '陣の印へ戻り、味方の列を守れ'
          : C.breachT > 0 ? `陣内は味方${friend}人・敵${enemy}人。あと${Math.max(1, Math.ceil(15 - C.breachT))}秒で押し負ける`
          : el > deadline - 15 && !clear ? '敵が残る。味方の列で押し返せ'
          : friend < 2 && !enemy ? '味方が帰陣中。陣の印で合流せよ'
          : prior && !C.raidGone(prior) ? enemy ? o.obj : C.raidEntered.has(prior) ? '敵を押し返した。列を守れ'
            : incoming ? `${incomingSide}から敵が来る。列で迎えよ` : '味方の列を守れ'
          : C.waves.length ? prior ? '列を守れ。次の寄せを迎えよ' : '林から敵が来る。列で迎えよ'
          : `あと${Math.max(1, Math.ceil(o.dur * 0.6 - C.inT))}秒、陣を守れ`;
        if (task && task.text !== text) { task.text = text; if (rt.missionGuide) rt.missionGuide.scan = 0; }
        rt.objProgress('dp', igaNeedsTreatment(rt)
          ? rt.player.treatmentNext > rt.t ? '味方の後ろで休め。布を巻き直せるまで待て'
            : '敵から離れ、止まって「血を止める」を三秒長押し'
          : d > o.r
          ? '陣の印へ戻れ。離れ続けると務めを失う'
          : C.breachT > 0 ? `陣内は味方${friend}人・敵${enemy}人。列へ寄り、敵を防げ`
          : el > deadline - 15 && !clear ? '敵を防ぎきれぬ。味方の列で迎え、林へ追うな'
          : prior && !C.raidGone(prior) ? `寄せ ${C.groups.length}／${o.waves.length}。陣内の敵 ${enemy}人。${enemy ? '味方と防げ' : C.raidEntered.has(prior) ? '陣の外へ押し返した。列を守れ' : '敵が近づく。列を守れ'}`
          : C.waves.length ? '味方の列をそろえ、次の寄せに備えよ'
          : '陣の口を保ち、次の下知を待て');
      }
      return false;
    },
    end(rt, C, m) {
      rt.unmark('dp'); rt.unzone('dp'); rt.unmark('raidRecovery');
      rt.flags.honjin.guard.anchor.x = CAMP.x + 6; rt.flags.honjin.guard.anchor.z = CAMP.z + 7;
      rt.flags.honjin.guard.guardLeash = 10;
      const won = C.held || C.inT >= o.dur * 0.6;
      if (!won) { iga.lose(rt, '陣の口を離れ、組を支えられなかった'); return; }
      rt.objDone('dp');
      if (o.reward) rt.award((t) => t.side.push(o.reward), o.reward);
      if (o.onEnd) o.onEnd(rt, m, won);
    },
  };
}

// 上の道から要だけ麓へ移すと、後列の持ち場が切岸の向こうになる。
// 生き残った同じ兵を、今いる高さの折れ目から歩いて帰す。
function igaGather(rt, g, at) {
  if (!g || g.routed || !g.units.some(igaReady)) return;
  const c = g.center(), from = { x: c.x, z: c.z, y: rt.world.heightAt(c.x, c.z) }, road = {};
  const formUp = (q) => {
    q.order = 'hold'; q.path = null; q.dest = null; q.roadColumn = false;
    q.formation = q === rt.flags.niwa ? 'ring' : 'yari';
    q.guard = q.guardOn = true; q.guardLeash = 8; q.aggro = 8; q._fitAt = 0;
  };
  g.noAI = true; g.focus = null; g.dest = null; g.onArrive = null;
  g.guard = g.guardOn = false; g.fixed = false; g._fitAt = 0;
  if (from.z < 12) {
    roadPoint(from, road);
    g.anchor = { x: from.x, z: from.z };
    g.path = [[road.x, road.z]];
    for (let i = Math.floor(road.s); i >= 0; i--) g.path.push(ROAD[i]);
    g.path.push([at.x, at.z]); g.pathIdx = 0;
    g.order = 'path'; g.formation = 'column'; g.colW = 2; g.roadColumn = true;
    // 帰りの後列も上りと同じ折れ目を使い、近い下段へ直進しない。
    g.followColumnRoad = true;
    g.speed = 2.3; g.onArrive = formUp;
  } else {
    g.anchor = at;
    formUp(g);
  }
}

function igaMove(o) {
  const s = move(o), start = s.start;
  s.start = (rt, C, m, ctx) => {
    rt.objRemove('main');
    rt.unmark('turn');
    for (const g of rt.flags.oda) { g.formation = 'column'; g.colW = 2; }
    start(rt, C, m, ctx);
    for (let i = 0; i < rt.flags.oda.length; i++)
      igaGather(rt, rt.flags.oda[i], { x: C.at.x + (i - 1) * 8, z: C.at.z + 5 });
    igaGather(rt, rt.flags.igun, { x: C.at.x + 12, z: C.at.z - 4 });
    C.guideUnit = { pos: rt.player.u.pos }; C.guideAt = 0;
    C.lastDistance = Infinity; C.stuckT = 0; C.corner = { x: 0, z: 0 }; C.roadFrom = {}; C.roadTo = {};
  };
  s.tick = (rt, C, m, ctx, el, dt) => {
    const distance = Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z);
    if (!C.arr && distance < (o.r || 8) && Math.abs(rt.player.u.pos.y - rt.world.heightAt(C.at.x, C.at.z)) < 3) { C.arr = true; rt.unmark('dp'); rt.unzone('dp'); }
    const arrived = !!C.arr;
    if (!C.arr && rt.t >= C.guideAt) {
      C.guideAt = rt.t + 0.5;
      const d = Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z);
      C.stuckT = d < C.lastDistance - 0.5 ? 0 : C.stuckT + 0.5; C.lastDistance = d;
      let next = igaWay(rt.army, C.guideUnit, C.at);
      if (C.stuckT >= 8 && next === C.at) {
        roadPoint(rt.player.u.pos, C.roadFrom); roadPoint(C.at, C.roadTo);
        if (C.roadFrom.d > 2.8) { C.corner.x = C.roadFrom.x; C.corner.z = C.roadFrom.z; }
        else {
          const forward = C.roadTo.s > C.roadFrom.s;
          const i = Math.max(0, Math.min(ROAD.length - 1, forward ? Math.floor(C.roadFrom.s) + 1 : Math.ceil(C.roadFrom.s) - 1));
          C.corner.x = ROAD[i][0]; C.corner.z = ROAD[i][1];
        }
        next = C.corner;
      }
      if (next !== C.at) {
        // 目的地と折れ目の矢印を重ねず、次に歩く所だけを同じ印で示す。
        rt.marker('dp', next, '道の折れ目', { h: 3 }); C.goal = next;
        if (!C.detour) { rt.unzone('dp'); C.detour = true; }
        rt.objProgress('dp', '道の折れ目へ回れ。堀や小屋を避けよ');
      } else {
        rt.marker('dp', C.at, o.label || '次の持ち場', { h: 3 }); C.goal = C.at;
        if (C.detour) { rt.zone('dp', C.at.x, C.at.z, o.r || 8); C.detour = false; }
        rt.objProgress('dp', `印まで あと ${Math.round(d)}歩`);
      }
    }
    if (C.arr) rt.unmark('turn');
    return arrived;
  };
  s.max = Infinity; // 到着前の時間切れを、確認済みにはしない。
  return s;
}

// 生き残りは歩いて退く。実際に見えなくなった時の退場は共通の逃走判定に任せる。
function retireRaid(rt, groups) {
  for (const g of groups || []) {
    g.noRout = false; g.focus = null; g.ambush = false;
    // 退く下知を受けた組は、近い追手だけ防ぎ、古い相手を追い直さない。
    g.retreatOnly = true; g.guard = g.guardOn = false; g.igaRaidPost = null;
    for (const u of g.units) { u.target = null; u.atk = null; u.swing = null; u.bind = null; u.aiT = 0; }
    const home = g.igaHome;
    g.igaRetreat = (g.igaIngress || (home ? [[home.x, home.z]] : RIDGE)).slice().reverse();
    // 最後に陣を出た地点は飛ばし、来た林・山道を逆に歩く。
    if (g.igaRetreat.length > 1) g.igaRetreat.shift();
    g.order = 'path'; g.path = g.igaRetreat; g.pathIdx = 0; g.dest = null;
    g.formation = 'column'; g.colW = 2; g.noAI = true;
    g.onArrive = (q) => { q.order = 'retreat'; q.path = null; };
    if (home) { g.fleeDir.x = Math.sign(home.x); g.fleeDir.z = home.z > CAMP.z ? 1 : -1; }
  }
}

// 列が崩れても同じ尾根道で退く。敗走用の道がないと、北へ直進して切岸に詰まる。
function igaCastleRetreat(g, path) {
  g.noRout = false; g.noAI = true; g.fixed = false; g._fitAt = 0;
  g.guard = g.guardOn = false; g.focus = null; g.dest = null;
  g.retreatOnly = true; g.igaRaidPost = null;
  g.formation = 'column'; g.colW = 2; g.march = true; g.roadColumn = true;
  g.followColumnRoad = true;
  // 最初の持ち場も道順へ残し、折れ目の後列が切岸へ直進しない。
  g.order = 'path'; g.path = [[g.anchor.x, g.anchor.z], ...path]; g.pathIdx = 0;
  g.igaRetreat = g.path;
  g.fleeDir = { x: 0, z: -1 };
  for (const u of g.units) {
    u.target = null; u.atk = null; u.swing = null; u.bind = null; u.moveTo = null; u.aiT = 0;
  }
  g.onArrive = (q) => { q.order = 'retreat'; q.path = null; q.march = false; q.onArrive = null; };
}

// 夜討ちの間に城内の列が北へ退く。迎撃後に初めて長い退去を始めない。
function igaBeginCastleRetreat(rt) {
  const F = rt.flags;
  if (F.castleRetreatStarted) return;
  F.castleRetreatStarted = true;
  // 既存の北の口から退く。柵を壊したり、守備兵を秒数だけで消したりしない。
  // 退去の下知では、遠い攻め手への射撃をやめて北の口へ歩く。
  igaCastleRetreat(F.wallBow, RIDGE.slice(1));
  F.castleChecks = [
    { x: F.bridge.x, z: F.bridge.z, r: 28 },
    { x: SHU.x, z: SHU.z, r: 22 },
    { x: KITA.x, z: KITA.z, r: 22 },
  ];
  for (const at of F.castleChecks) at.y = rt.world.heightAt(at.x, at.z);
  for (const h of F.jinHosts) if (h.army.team === 1) {
    // 退く備えから新しい守備兵を出さず、既に替えた兵にも同じ退去の下知を出す。
    h.army.noWake = true; h.army.facing = 0;
    h.moveTo(h.army.cx + h.army.off.x, h.army.cz + h.army.off.z - 110, 40, { back: true });
    for (const g of h.army.wk?.groups || []) {
      const path = [];
      if (g.anchor.x > 35) path.push(...EAST.slice().reverse());
      for (const point of RIDGE) if (point[1] < g.anchor.z) path.push(point);
      igaCastleRetreat(g, path);
    }
  }
  for (const c of F.lines) c.rout('B', { hideAfter: Infinity, minFight: 0 });
}

function igaCastleCleared(rt) {
  const F = rt.flags;
  // 戦えない負傷者や敗走兵を、城を守り続ける敵として待たない。
  for (const u of F.wallBow.units) if (igaReady(u) && u.pos.z > KITA.z - 22) return false;
  for (const u of rt.army.units) {
    if (u.team !== 1 || !igaReady(u) || u.isStruct || u.group?.civ || u.group?.ambush) continue;
    for (const at of F.castleChecks) {
      // 平面で重なる下段の兵は、上の曲輪を塞いでいない。
      if (Math.abs(u.pos.y - at.y) < 3 && Math.hypot(u.pos.x - at.x, u.pos.z - at.z) < at.r) return false;
    }
  }
  return true;
}

function igaCtx(rt) {
  const F = rt.flags;
  // 波は準備時に置いた隊を使う。遠景の控えを追加せず、総勢を重ねて見せない。
  return { faction: 'iga', flag: 'maru', armor: IGA.armor, dmg: 1, scale: 1, backing: false, look: (l) => dress(l, IGA), friends: () => F.oda };
}
function igaA(rt) {
  return [
    rest({ dur: 4, say: [['丹羽の組頭', '火は消えた。槍をそろえて陣の口を固めよ。林へ追うな', 4]] }),
    igaHold({ at: CAMP, dur: 38, r: 16, title: '陣の口を守れ', sub: '山から下りた伊賀衆が、左右の林へ回る', label: '陣の口', obj: '陣の口で左右の敵を防げ',
      waves: [
        { t: 5, group: rt.flags.waveA[0], say: ['足軽', '右の林だがね！　槍をこっちへ！'] },
        { t: 16, group: rt.flags.waveA[1], say: ['足軽', '左にもおる！　追ったらいかん！'] },
        { t: 28, group: rt.flags.waveA[2], say: ['丹羽の組頭', '後ろの道にも槍を向けよ。陣の口を空けるな'] },
      ], reward: '陣の口で夜討ちを退けた', onEnd: (rt) => retireRaid(rt, rt.flags.dp.cur.groups) }),
  ];
}
function igaB(rt) {
  return [
    // 帰りの道を歩く段を先に置く。休息が退却を止め、帰陣前に守備の失敗を数えない。
    igaMove({ to: CAMP, r: 10, label: '包囲の陣', obj: '来た道を戻り、麓の陣へ退け' }),
    rest({ dur: 4, banner: ['包囲を続けた夜', '正面攻めをやめ、陣の口を守る'], fn: (rt) => {
      rt.objRemove('dp');
      rt.obj('main', '陣の口で組をそろえ、夜討ちに備えよ', 'main');
      igaNight(rt);
      igaBeginCastleRetreat(rt);
      battleEvent(rt, EVENT_MESSENGER, CAMP, null, 0, true, '蒲生・堀・筒井の手が山の麓を囲んだ');
      for (const c of rt.flags.lines) c.push('A', 0.25);
    } }),
    igaHold({ at: CAMP, dur: 38, r: 16, title: '包囲の夜', sub: '城から出た伊賀衆が、麓の陣へ切り込む', label: '陣の口', obj: '陣の口で城から出る敵を防げ',
      say: [['丹羽長秀', '包囲を続け、また夜になった。陣の口で敵を防げ。追うな', 4]],
      waves: [
        { t: 8, group: rt.flags.waveB[0], say: ['足軽', '城の道から下りてきよる！'] },
        { t: 20, group: rt.flags.waveB[1], say: ['足軽', '西へ回りよった！　陣の脇が危ねえ！'] },
      ], reward: '包囲の陣を夜討ちから守った', onEnd: (rt) => {
        retireRaid(rt, rt.flags.dp.cur.groups);
        battleEvent(rt, EVENT_UNIT_BREAK, CAMP, null, 1, true, '夜討ちの隊が、山へ退いた');
      } }),
  ];
}

export { iga };

// 山城の高さ（kaito 10/3）：本物の山の比高に近づける。麓の陣は今まで通りの高さ、本丸のほうへ向かって高くなる（yamalift.js）
// 北端の外まで尾根を保ち、最後の木戸の直後に急な落差を作らない。
const LIFT = { x: 0, z: -425, tx: 0, tz: -80, w: 45, R: 110, rise: 123.4 };

let GRADED = null;
let BRIDGE_Y = 0;
let APPROACH_Y = null;
// 山腹と道が同じ高さを使う。曲輪の加工前に決め、互いの高さを呼び合わない。
function approachLevels() {
  if (APPROACH_Y) return APPROACH_Y;
  const lengths = [0];
  for (let i = 1; i < APPROACH.length; i++) lengths[i] = lengths[i - 1] + Math.hypot(APPROACH[i][0] - APPROACH[i - 1][0], APPROACH[i][1] - APPROACH[i - 1][1]);
  const start = baseTerrain(CAMP.x, CAMP.z), top = baseTerrain(SHU.x, SHU.z) + yamaLift(SHU.x, SHU.z, LIFT) + 5;
  APPROACH_Y = lengths.map(d => start + (top - start) * d / lengths[lengths.length - 1]);
  BRIDGE_Y = APPROACH_Y[APPROACH.findIndex(p => p[0] === 0 && p[1] === -48)];
  // 平らな土橋の始まりまで、道の長さに合わせて登る。最後の折れ目に登りを集中させない。
  const entry = APPROACH.findIndex(p => p[1] === -42);
  for (let i = 0; i < entry; i++) APPROACH_Y[i] = start + (BRIDGE_Y - start) * lengths[i] / lengths[entry];
  for (let i = 0; i < APPROACH.length; i++) if (APPROACH[i][1] >= -54 && APPROACH[i][1] <= -42) APPROACH_Y[i] = BRIDGE_Y;
  return APPROACH_Y;
}
// 道の高さは準備時に一度だけ決める。曲輪の口では床と同じ高さにし、
// 麓から木戸までは九十九折りの道の長さで均等に登る。堀の中央は土橋になる。
function prepareRoadHeights() {
  const level = id => HIJIYAMA_PLAN.kuruwa.find(k => k.id === id).level(castleTerrain);
  const shu = level('shu');
  const approachY = approachLevels();
  const rows = [
    [APPROACH, approachY],
    [RIDGE, RIDGE_LEVELS.map((id, i) => id ? level(id) : heightRaw(RIDGE[i][0], RIDGE[i][1]))],
    [EAST, [shu, shu, shu, level('higashi'), level('higashi')]],
  ];
  const segments = [];
  for (const [pts, ys] of rows) for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1];
    segments.push({ x: a[0], z: a[1], dx, dz, l2: dx * dx + dz * dz, y: ys[i - 1], dy: ys[i] - ys[i - 1] });
  }
  return segments;
}
// 麓の折れ目は前後一割だけ勾配を緩める。曲がる所で上下の道が作る
// 急な横勾配を抑え、粗い地面の補間でも次の一歩を切岸と判定させない。
// 中ほどは一定勾配。兵の道探しと視点も、描く土と同じ高さを使う。
function igaRoadHeight(s, t) {
  if (s.z > -42 && s.z <= 12) t = t < 0.1 ? t * t / 0.18
    : t > 0.9 ? 1 - (1 - t) * (1 - t) / 0.18 : (t - 0.05) / 0.9;
  return s.y + s.dy * t;
}
function height(x, z) {
  if (!GRADED) GRADED = prepareRoadHeights();
  const h = heightRaw(x, z);
  // 道の外側を広くなじませる処理は、麓の小屋の下まで山を盛らない。
  // 最初の折れ目は十二メートルより北。道の高さは保ち、南の陣へ八メートルで戻す。
  if (z >= APPROACH[0][1] + 8) return h;
  // 土橋の横は幅十六メートルの平場。両脇は二十四メートルかけて山肌へ戻す。
  // 南は半メートルで道へ戻す。三メートル先の上り道まで土橋の高さにすると、
  // 最後の折り返しに歩けない盛り上がりができる。北のすり付けは八メートル。
  const bridgeT = Math.max(0, 1 - Math.max((-54 - z) / 8, (z + 42) / 0.5, 0));
  // 平場は土橋の周りだけ。左右二十四メートルの折り返しを同じ高さへ引き上げない。
  const bridgeSide = Math.max(0, Math.min(1, (24 - Math.abs(x)) / 16));
  const bridgeBlend = bridgeT * bridgeT * (3 - 2 * bridgeT) * bridgeSide * bridgeSide * (3 - 2 * bridgeSide);
  // 最後の折れ目で法面の幅を急に替えると、同じ山肌が南北の境で裂ける。
  // 土橋の前後十二メートルで幅をつなぎ、踏み面と土橋の高さは保つ。
  const slopeT = Math.max(0, Math.min(1, (z + 54) / 12));
  const slopeFade = 3.5 + 14.5 * slopeT * slopeT * (3 - 2 * slopeT);
  const half = 2.8 + 5.2 * bridgeBlend, fade = slopeFade * (1 - bridgeBlend) + 24 * bridgeBlend;
  const edge = half + fade;
  let best = edge, second = edge, roadY = h, nearestY = h, weight = 0, sumY = 0;
  for (const s of GRADED) {
    const t = Math.max(0, Math.min(1, ((x - s.x) * s.dx + (z - s.z) * s.dz) / s.l2));
    const d = Math.hypot(x - s.x - s.dx * t, z - s.z - s.dz * t);
    if (d < edge) {
      // 隣り合う折り返しを距離で混ぜる。最短の一本へ瞬時に切り替えると、
      // 等距離の境目に数十メートルの段差ができ、兵が壁を歩いてしまう。
      const rim = 1 - d / edge, w = rim * rim / (0.01 + d * d * d * d);
      const y = igaRoadHeight(s, t);
      weight += w; sumY += y * w;
      if (d < best) { second = best; best = d; nearestY = y; }
      else second = Math.min(second, d);
    }
  }
  if (weight > 0) roadY = sumY / weight;
  // 幅五・六メートルの踏み面は、その道の高さを使う。隣の上段を混ぜると横にも急傾斜になる。
  // 道の外だけ一メートルかけて元の混ぜ方へ戻し、切岸の境をつなぐ。
  // 折り返しの先端では上下の道幅が重なる。等距離の境の六十センチだけ
  // 平均へ戻し、道の中心まで上段の高さを混ぜて歩けない勾配を作らない。
  const benchT = Math.max(0, Math.min(1, 3.8 - best, (second - best) / 0.6));
  // 土橋の前後でも道の踏み面を優先し、広い平場で上り坂を押しつぶさない。
  roadY += (nearestY - roadY) * benchT * benchT * (3 - 2 * benchT);
  // 踏み面を決めてから土橋を重ねる。逆順だと隣の坂の高さへ戻り、
  // 平らなはずの土橋に傾きと段差が残る。
  best += (Math.abs(x) - best) * bridgeBlend;
  roadY += (BRIDGE_Y - roadY) * bridgeBlend;
  if (best >= edge) return h;
  const t = Math.min(1, (edge - best) / fade), blend = t * t * (3 - 2 * t);
  const campT = Math.max(0, Math.min(1, (APPROACH[0][1] + 8 - z) / 8));
  return h + (roadY - h) * blend * campT * campT * (3 - 2 * campT);
}
