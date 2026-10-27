import { fireGlow } from './fire_glow.js';
import * as THREE from 'three';
import { fieldState } from './world_fields.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeFenceBatch } from './props_batch.js';
import { flagTexture, jinmakuTexture, enemyFlagKind } from './textures.js';
import { GUST, WIND_STATE, WET, rippleWater, hasMultiDraw, flagMoonlight } from './world.js';
import { woodTex, thatchTex, barkTex, dirtTex, bankTex, grassTex } from './nature.js';
import { generatedTex } from './generated_tex.js';
import { FLAG_T } from './units.js';
import { WIND_DIR } from './world_weather.js';
import { addDeck, addLadder, FL } from './floors.js';
import { addInterior, facePanels, windowLatticeMembers } from './naka.js';
import { sumiInside, gateInside, lookoutInside, interiorBase } from './yagura_inside.js';
import { S as SETTINGS } from './settings.js';
import { extScatter, extGateRoof, extMinka, extTempleRoof } from './props_ext.js';
import { cgtOn, cgtHas, whenCgt, KitBatch, kitStoneSeg, cgtScene, cgtSpend, kitAttach } from './cgt.js';
import { tabaGeo, tabaMat } from './taketaba.js';

// 柵・屋根・土塁など数の多い物の材質：画質「低」「中」は陰影の計算が重い Standard/Physical をやめて
// 軽い Lambert にする（見た目はほぼ同じ、GPU だけ軽くなる）。Lambert に無い項目は外す
function liteMat(opts) {
  return new THREE.MeshStandardMaterial(opts);
  // 軽い材質でも瓦・石・漆喰の凹凸は残す。絵と形は既存の物を共用する。
  const { roughness, metalness, envMapIntensity, clearcoat, clearcoatRoughness, ...rest } = opts;
  const m = new THREE.MeshLambertMaterial(rest);
  // 「高」は空の照り返し（environment）が陰の面にも回る。Lambert はそれが無く、日の当たらない壁・屋根の裏が
  // 真っ黒な箱になった（墨俣の兵舎・稲葉山の櫓）。空からの回り込みの光だけを強めて埋め合わせる（夜は空の光ごと暗いので浮かない）
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.indirectDiffuse *= 4.0;'); };
  return m;
}

// ---------------- 置き物の当たり ----------------
// 小物（杭・薪・俵・鍋・荷など）は登録せず、自分も兵も踏み越えられる。
// 建物・陣幕など大きな物の足もとの形（人と馬が通り抜けないように）。戦の始めに battle.js が空にして army.solids に渡し、
// units.js の collide が押し戻す（柵・門のような「壊せる・戦の筋に関わる」物は army.addStruct のまま。こちらは押し戻すだけ）
// 形は三つ：'r' 回した四角（x, z が真ん中、hw・hd が半分の幅と奥行き、rot）、'c' 円、's' 太さのある線分
export const SOLIDS = [];
const aabb = (o, pts) => { o.x0 = Math.min(...pts.map((p) => p[0])); o.x1 = Math.max(...pts.map((p) => p[0])); o.z0 = Math.min(...pts.map((p) => p[1])); o.z1 = Math.max(...pts.map((p) => p[1])); return o; };
// yTop を渡すと、その高さ以上（足の高さ）は素通し＝中に床・梯子がある建物（天守など）の「外壁の当たり」は
// 地面近くだけ押し返し、床の層（floors.js）で登った先は中を歩けるようにする（docs/castle-design.md 4章）
export function solidRect(x, z, w, d, rot = 0, yTop = null) {
  const c = Math.cos(rot), sn = Math.sin(rot), hw = w / 2, hd = d / 2;
  const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [x + lx * c + lz * sn, z - lx * sn + lz * c]);
  const o = aabb({ k: 'r', x, z, hw, hd, c, s: sn, yTop }, pts);
  SOLIDS.push(o);
  return o;
}
export function solidCircle(x, z, r) { const o = { k: 'c', x, z, r, x0: x - r, x1: x + r, z0: z - r, z1: z + r }; SOLIDS.push(o); return o; }
export function solidSeg(ax, az, bx, bz, r = 0.12) { const o = aabb({ k: 's', ax, az, bx, bz, r }, [[ax - r, az - r], [bx + r, bz + r], [ax + r, az + r], [bx - r, bz - r]]); SOLIDS.push(o); return o; }

// 柵・陣幕・幟・小屋などの小道具
// 木肌の絵に色を掛ける（丸太ごとに少しずつ色を変える）
// 木目・干割れ・藁の束・樹皮の割れ目は、同じ絵を凹凸（bumpMap）にも使って、光の当たり方で浮き出させる
// 画質「低」を携帯が決めるのは main.js の読み込みの途中（touch.js）なので、ここで即 new すると
// 早すぎて質が決まる前に Standard で固まってしまう。実に使う時（戦が始まる時）まで待つ（lazy）
const lazy = (f) => { let v; return () => v || (v = f()); };
const MAT = lazy(() => {
  const mat = liteMat({ vertexColors: true, map: woodTex(), bumpMap: woodTex(), bumpScale: 0.045, roughness: 0.88, metalness: 0 });
  if (mat.isMeshStandardMaterial) {
    // 柵の干割れ・汚れは照りを鈍くする。既に読んだ木肌の色から
    // 粗さを作り、木目の凹凸とそろえる。絵・材質・描画回数は増やさない。
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace(
          'diffuseColor *= sampledDiffuseColor;', `
          // 木肌は濃淡、木の色は頂点で持つ。二重に暗い茶を掛けて黒い柵にしない。
          sampledDiffuseColor.rgb = mix(vec3(0.42), vec3(1.0), sampledDiffuseColor.rgb);
          diffuseColor *= sampledDiffuseColor;`) + `
          float woodCavity = 1.0 - smoothstep(0.43, 0.58, dot(diffuseColor.rgb, vec3(0.333)));`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          reflectedLight.indirectDiffuse *= 1.0 - woodCavity * 0.3;
          reflectedLight.indirectSpecular *= 1.0 - woodCavity * 0.45;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (0.5 - dot(diffuseColor.rgb, vec3(0.333))) * 0.2, 0.82, 0.98);`);
    };
    mat.customProgramCacheKey = () => 'weathered-wood-grain';
  }
  return mat;
});
const EARTH_V = lazy(() => groundedHomeMat());
const ITA_MAT = lazy(() => liteMat({ map: woodTex(), bumpMap: woodTex(), bumpScale: 1.2, color: 0x8a8274, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));   // 灰茶に褪せた板葺き
const THATCH = lazy(() => liteMat({ map: thatchTex(), bumpMap: thatchTex(), bumpScale: 1.5, roughness: 0.97, metalness: 0, side: THREE.DoubleSide }));
const BARK = lazy(() => liteMat({ vertexColors: true, map: barkTex('pine'), bumpMap: barkTex('pine'), bumpScale: 1.5, roughness: 0.95, metalness: 0 }));
const vary = (hex, k) => { const c = new THREE.Color(hex); const f = 0.82 + (((k * 7919) % 37) / 37) * 0.36; return c.multiplyScalar(f).getHex(); };

// 家・堂・城で共用する塗り壁。三段で上端を引き込み、薄い帯は一段にして、
// 手塗りの膨らみと軒下・地際の陰を形へ焼く。絵や毎コマの処理は増やさない。
const buildingWallShapes = new Map();
function buildingWall(w, h, d, hex) {
  const key = [w, h, d].join(':');
  let shape = buildingWallShapes.get(key);
  if (!shape) {
    shape = new THREE.BoxGeometry(w, h, d, 1, h > .8 ? 3 : 1, 1);
    const p = shape.attributes.position;
    const inset = Math.min(.035, Math.min(w, d) * .16);
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / h + .5;
      const shoulder = Math.sin(t * Math.PI) * inset * .4 - t * t * inset;
      // 開口の脇を継ぐ薄い壁は厚みだけ動かし、隣の壁との継ぎ目を開けない。
      if (w < d * 4) p.setX(i, p.getX(i) + Math.sign(p.getX(i)) * shoulder);
      if (d < w * 4) p.setZ(i, p.getZ(i) + Math.sign(p.getZ(i)) * shoulder);
    }
    shape.computeVertexNormals();
    // 戦を渡り歩いても、乱数寸法の原形を際限なくためない。
    if (buildingWallShapes.size >= 96) {
      const oldest = buildingWallShapes.keys().next().value;
      buildingWallShapes.get(oldest).dispose(); buildingWallShapes.delete(oldest);
    }
    buildingWallShapes.set(key, shape);
  }
  const g = paint(shape, hex), p = g.attributes.position, colors = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h + .5;
    const foot = Math.max(0, 1 - t * h / .6);
    const eave = Math.max(0, (t - .8) / .2);
    const shade = 1 - foot * .22 - eave * .24;
    colors.setXYZ(i, colors.getX(i) * shade, colors.getY(i) * shade, colors.getZ(i) * shade);
  }
  return g;
}

// 柱・貫・桁の組み方を寸法ごとに共有。塗り壁より手前へ出し、接合部に
// 奥行きと木口を残す。既存の壁の束へ結合し、近景だけで使う。
const buildingFrameShapes = new Map();
function buildingFrame(w, d, h) {
  const key = [w, d, h].join(':');
  let shape = buildingFrameShapes.get(key);
  if (!shape) {
    const parts = [];
    const box = (x, y, z, bw, bh, bd, hex) => {
      const g = new THREE.BoxGeometry(bw, bh, bd);
      // 壁へ埋まる背面は描かない。外の面と木口は残し、横から見た厚みを保つ。
      const normal = g.attributes.normal, indices = [];
      for (let i = 0; i < g.index.count; i += 3) {
        const v = g.index.getX(i);
        const inward = Math.abs(z) > d / 2
          ? normal.getZ(v) * Math.sign(z) < -.5
          : normal.getX(v) * Math.sign(x) < -.5;
        // 柱の上下は桁・土台に収まる。貫の木口は外から見えるので残す。
        if (inward || (bh > h / 2 && Math.abs(normal.getY(v)) > .5)) continue;
        indices.push(g.index.getX(i), g.index.getX(i + 1), g.index.getX(i + 2));
      }
      g.setIndex(indices);
      g.translate(x, y, z); parts.push(paintWorn(g, hex, 0, h));
      g.dispose();
    };
    for (const side of [-1, 1]) {
      for (const y of [.18, h - .12]) {
        box(0, y, side * (d / 2 + .045), w + .22, .16, .18, 0x74614b);
        box(side * (w / 2 + .045), y, 0, .18, .16, d + .22, 0x74614b);
      }
      const nx = Math.max(2, Math.round(w / 1.8)), nz = Math.max(2, Math.round(d / 1.8));
      for (let i = 0; i <= nx; i++) {
        // 正面中央は戸口。柱が閉じた戸を横切らないようにする。
        const x = -w / 2 + i * w / nx;
        if (side > 0 && Math.abs(x + w * .15) < .85) continue;
        box(x, h / 2, side * (d / 2 + .055), .15, h, .18, 0x69543f);
      }
      for (let i = 1; i < nz; i++) box(side * (w / 2 + .055), h / 2,
        -d / 2 + i * d / nz, .18, h, .15, 0x69543f);
    }
    shape = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (buildingFrameShapes.size >= 32) {
      const oldest = buildingFrameShapes.keys().next().value;
      buildingFrameShapes.get(oldest).dispose(); buildingFrameShapes.delete(oldest);
    }
    buildingFrameShapes.set(key, shape);
  }
  return shape.clone();
}

function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

// 木橋の床板：長手の木目、踏み面の退色、湿った木口と削れた角を共通化する。
// 上面は元の高さを越えない。割れと留め栓も一枚の形へまとめ、遠景は元の箱へ戻す。
export function bridgeBoard(w, h, d, coarse = false) {
  const g = new THREE.BoxGeometry(w, h, d, coarse ? 1 : 8, 1, coarse ? 1 : 4);
  const p = g.attributes.position, normal = g.attributes.normal, uv = g.attributes.uv;
  const colors = new Float32Array(p.count * 3), tone = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const end = Math.abs(x) / (w / 2), edge = Math.abs(z) / (d / 2);
    // 角を落とした厚板。両木口の細い裂けを実際の輪郭に入れ、箱の反復を崩す。
    // 同じ位置の頂点は面を問わず同じ量だけ動かし、側面との隙間を作らない。
    if (!coarse) {
      const split = end > .99 && edge < .01;
      const rim = Math.pow(end, 8) * .018 + Math.pow(edge, 4) * .018;
      p.setX(i, x - Math.sign(x) * (split ? Math.min(.085, w * .035) : 0));
      p.setY(i, y > 0 ? y - rim - (split ? .025 : 0) : y);
      // 鋸で揃えた直線より、手斧で仕上げた縁の小さな不揃いを残す。
      if (edge > .99) p.setZ(i, z - Math.sign(z) * (.004 + .006 * Math.sin(x * 13) ** 2));
    }
    const top = normal.getY(i) > .5;
    tone.setHex(top ? 0xb3aa96 : Math.abs(normal.getX(i)) > .5 ? 0x60503b : 0x76664f);
    if (top) tone.multiplyScalar(coarse ? .85 : 1 - Math.pow(edge, 2) * .23 - Math.pow(end, 4) * .22);
    // 木口の裂けの奥と厚みは暗く、踏まれた中央は乾いた灰茶。光なしでも厚板を読める。
    if (!coarse && end > .99 && edge < .01) tone.multiplyScalar(.48);
    colors[i * 3] = tone.r; colors[i * 3 + 1] = tone.g; colors[i * 3 + 2] = tone.b;
    // 側面も同じ寸法の木目を使い、長い板へ絵を引き伸ばさない。
    uv.setXY(i, Math.abs(normal.getX(i)) > .5 ? z / 2.4 : x / 2.4,
      Math.abs(normal.getY(i)) > .5 ? z / .55 : y / .55);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  if (coarse) return g;
  // 桁に留めた木栓。上面の浅い埋木だけで表し、材質・描く回数・影の物体を増やさない。
  const parts = [g.toNonIndexed()];
  for (const side of [-1, 1]) {
    const x = side * (w / 2 - Math.min(.18, w * .12));
    const end = Math.abs(x) / (w / 2);
    const plug = paint(new THREE.CircleGeometry(.022, 6), 0x4b4032);
    plug.rotateX(-Math.PI / 2);
    plug.translate(x, h / 2 - Math.pow(end, 8) * .018 + .001, 0);
    // 床板と同じ木肌を小さく使う。色も同じ共用材質で描く。
    const puv = plug.attributes.uv;
    for (let i = 0; i < puv.count; i++) puv.setXY(i, puv.getX(i) * .04, puv.getY(i) * .04);
    parts.push(plug);
  }
  const board = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  g.dispose();
  return board;
}
// 木橋全体で既存の木肌と材質を共有。戦の片付けでは共用材質を捨てない。
export function bridgeWoodMaterial() { return MAT(); }

// 根元ほど泥で黒ずみ、上ほど日に褪せて灰がかる色を塗る（y0 は地面の高さ、h は丸太の長さ）
const MUD = new THREE.Color(0x2e261c), BLEACH = new THREE.Color(0x9a9288);
function paintWorn(geo, hex, y0, h) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const base = new THREE.Color(hex), c = new THREE.Color();
  const P = g.attributes.position, n = P.count;
  const uv = g.attributes.uv;
  if (uv) {
    const u = h01(P.getX(0) * 3.7, P.getZ(0) * 2.3 + hex % 31);
    const v = h01(P.getX(0) * 1.9 + y0, P.getZ(0) * 4.1);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (0.65 + u * 0.45) + u, uv.getY(i) * (0.8 + v * 0.4) + v);
  }
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = P.getY(i) - y0;
    const mud = 1 - Math.min(1, Math.max(0, (y - 0.05) / 0.45));
    const top = Math.min(1, Math.max(0, (y - h * 0.55) / (h * 0.45)));
    c.copy(base).lerp(BLEACH, top * 0.28).lerp(MUD, mud * 0.7);
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// 属性のそろわない形が混じると mergeGeometries は null を返す（伊賀の小屋で戦が始まらなかった 10/28）。共通の属性だけにそろえて束ね直す
function mergeLoose(parts) {
  const g = mergeGeometries(parts);
  if (g || !parts.length) return g;
  const names = Object.keys(parts[0].attributes).filter((k) => parts.every((p) => p.attributes[k] && p.attributes[k].itemSize === parts[0].attributes[k].itemSize));
  const indexed = parts.every((p) => p.index);
  const fixed = parts.map((p) => {
    const q = indexed ? p.clone() : p.index ? p.toNonIndexed() : p.clone();
    for (const k of Object.keys(q.attributes)) if (!names.includes(k)) q.deleteAttribute(k);
    q.morphAttributes = {};
    return q;
  });
  const out = mergeGeometries(fixed);
  for (const q of fixed) q.dispose();
  return out;
}

function merged(parts, mat = MAT(), batch = null) {
  const g = mergeLoose(parts);
  // 城の塀のまとめ（castle_plan の別の形の batch）が渡ってきた時は、ここではまとめず一つの形で返す
  if (batch && batch.byMat) return pushSimpleBatch(batch, g, mat);
  // 城の kit の入れ物（makeKitBatch）を渡された柵も、区画ごとの描画にせず同じ城の束へ（finalizeKitBatch で一緒にまとめる）
  //   城の柵の区画が一つずつ描かれ、長島・信貴山で三十〜八十回になっていた
  if (batch && batch.pending && !batch.done) return pushSimpleBatch(batch.simple || (batch.simple = makeSimpleBatch()), g, mat);
  const m = new THREE.Mesh(g, mat);
  // カメラが建物や柵にめり込まないよう、当たりを調べる相手にする
  m.userData.camBlock = true;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// 柵・土塁など「一区画＝一つの材質」の物を、wallLike() のような呼び手のループ全体で一つの
// BatchedMesh にまとめる軽い入れ物（城の塀と同じ考え：壊れた時の個別の傾き・非表示は
// BatchedPart の setMatrixAt・setVisibleAt でそのまま保つ）。makeSimpleBatch()〜finalizeSimpleBatch() で使う
// 材質ごとに分けて貯める（一つの区画が二つ以上の材質を持つ時も、一つの BatchedPart で
// 動き・表示をまとめて扱えるよう、part を渡せば同じ入れ物へ継ぎ足せる）
// 土壁の家の材質は一つを使い回す（家ごとに作ると束へまとめられない）
let _groundedHome = null;
function groundedHomeMat() {
  if (_groundedHome) return _groundedHome;
  const mat = liteMat({ vertexColors: true, bumpMap: dirtTex(), bumpScale: 0.075, roughness: 0.94 });
  const prior = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, renderer) => {
    prior.call(mat, sh, renderer);
    sh.uniforms.uHomeWood = { value: woodTex() };
    // 壁・木組み・根石を一つの材質で描き分ける。高さは家の中の値なので、束へまとめても染みがずれない。
    sh.vertexShader = 'attribute vec2 homeSurface; varying vec2 vHomeSurface;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvHomeSurface = homeSurface;');
    sh.fragmentShader = 'uniform sampler2D uHomeWood; varying vec2 vHomeSurface;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float homeGrain = texture2D(bumpMap, vBumpMapUv).r;
      float homeWood = ${'texture2D(uHomeWood, vBumpMapUv).r'};
      float homeWall = 1.0 - step(0.5, abs(vHomeSurface.x - 1.0));
      float homeTimber = 1.0 - step(0.5, abs(vHomeSurface.x));
      // 土壁は細かな粒と下からの湿り。木組みは木目と銀灰色の退色を残す。
      float homeFoot = 1.0 - smoothstep(0.08, 0.65, vHomeSurface.y);
      float homeRain = smoothstep(0.38, 0.72, homeGrain);
      diffuseColor.rgb *= mix(1.0, 0.78 + homeWood * 0.44, homeTimber);
      diffuseColor.rgb *= mix(1.0, (0.92 + homeGrain * 0.16)
        * (1.0 - homeFoot * (0.18 + homeRain * 0.12)), homeWall);
      diffuseColor.rgb *= 1.0 - homeFoot * homeTimber * 0.22;
      // 茅の張り出しのすぐ下は空からの光も遮られる。共有材質内で軒の陰を残す。
      float homeEave = smoothstep(1.9, 2.6, vHomeSurface.y);
      diffuseColor.rgb *= 1.0 - homeEave * (homeWall * 0.22 + homeTimber * 0.12);`);
  };
  mat.customProgramCacheKey = () => 'grounded-home-earth-timber';
  return (_groundedHome = mat);
}
export function makeSimpleBatch() { return { byMat: new Map() }; }
// 束（BatchedMesh）の中の小さく遠い部品（画面で半径二画素ほどより小さい物）は描かない。影の描き込みは、もう少し大きな物まで省く。
//   画面の外を省く既定の判定の前に、描く間だけ見えない印を付けて、描いた後に戻す（壊れた時の非表示とは混ぜない）
const _scS = new THREE.Sphere(), _scM = new THREE.Matrix4(), _scHid = [];
function sizeCull(bm) {
  const orig = bm.onBeforeRender, cam = new THREE.Vector3();
  let seen = false;
  bm.onBeforeRender = function (r, scene, camera, geo, mat) {
    if (scene !== null && camera) { cam.setFromMatrixPosition(camera.matrixWorld); seen = true; }
    const vis = this._visibility, k = scene !== null ? 0.008 : 0.02, pair = this.userData.lodPair, pair2 = this.userData.lodPair2, isLo = this.userData.lodLo;
    _scHid.length = 0;
    if (seen && vis) for (let i = 0; i < vis.length; i++) {
      if (!vis[i] || (this._active && this._active[i] === false)) continue;
      this.getMatrixAt(i, _scM); this.getBoundingSphereAt(i, _scS).applyMatrix4(_scM);
      const d = _scS.center.distanceTo(cam);
      // 遠い時の粗い形（lodPair）：細かい形と粗い形のどちらか一つだけを描く。粗い形を持つ物は、遠さの判定を細かい形の囲みで行う
      if (isLo && isLo[i]) continue;
      const lo = pair ? pair[i] : -1, lo2 = pair2 ? pair2[i] : -1;
      if (_scS.radius < d * k) { vis[i] = false; _scHid.push(i); if (lo >= 0 && vis[lo]) { vis[lo] = false; _scHid.push(lo); } if (lo2 >= 0 && vis[lo2]) { vis[lo2] = false; _scHid.push(lo2); } continue; }
      if (lo >= 0 && vis[lo]) {
        const e = d - _scS.radius, show = lo2 >= 0 && e > KIT_LOD_D2 ? lo2 : e > KIT_LOD_D ? lo : i;
        for (const h of [i, lo, lo2]) if (h >= 0 && h !== show && vis[h]) { vis[h] = false; _scHid.push(h); }
      }
    }
    orig.call(this, r, scene, camera, geo, mat);
    for (const i of _scHid) vis[i] = true;
  };
}
// 城の組み物の遠い時の粗い形：頂点を升でまとめ（面の向きの違う頂点は分けたまま）、つぶれた面を落とす。減りが少ない時は null
const KIT_LOD_D = 42, KIT_LOD_CELL = 0.45, KIT_LOD_D2 = 95, KIT_LOD_CELL2 = 1.0;
function kitCoarse(geo, cell = KIT_LOD_CELL) {
  if (geo.morphAttributes.position) return null;
  const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count, I = geo.index ? geo.index.array : null, triN = I ? I.length / 3 : n / 3;
  if (triN < 150) return null;
  const map = new Map(), rep = [], remap = new Int32Array(n), sum = [];
  const P = pos.array, N = nor ? nor.array : null;
  for (let i = 0; i < n; i++) {
    let key = Math.round(P[i * 3] / cell) + ',' + Math.round(P[i * 3 + 1] / cell) + ',' + Math.round(P[i * 3 + 2] / cell);
    if (N) key += ',' + Math.round(N[i * 3] * 1.4) + ',' + Math.round(N[i * 3 + 1] * 1.4) + ',' + Math.round(N[i * 3 + 2] * 1.4);
    let j = map.get(key);
    if (j === undefined) { j = rep.length; map.set(key, j); rep.push(i); sum.push([0, 0, 0, 0]); }
    remap[i] = j; const q = sum[j]; q[0] += P[i * 3]; q[1] += P[i * 3 + 1]; q[2] += P[i * 3 + 2]; q[3]++;
  }
  const keep = [];
  for (let t = 0; t < triN; t++) { const a = remap[I ? I[t * 3] : t * 3], b = remap[I ? I[t * 3 + 1] : t * 3 + 1], c = remap[I ? I[t * 3 + 2] : t * 3 + 2]; if (a !== b && b !== c && a !== c) keep.push(a, b, c); }
  if (keep.length / 3 > triN * 0.85 || keep.length < 3) return null;
  const out = new THREE.BufferGeometry();
  if (I) {
    // 番号付きの形は番号付きのまま（同じ束の形はそろえる決まり）
    for (const name in geo.attributes) {
      const at = geo.attributes[name], sz = at.itemSize, arr = new at.array.constructor(rep.length * sz);
      for (let j = 0; j < rep.length; j++) {
        if (name === 'position') { const q = sum[j]; arr[j * 3] = q[0] / q[3]; arr[j * 3 + 1] = q[1] / q[3]; arr[j * 3 + 2] = q[2] / q[3]; }
        else for (let k = 0; k < sz; k++) arr[j * sz + k] = at.array[rep[j] * sz + k];
      }
      out.setAttribute(name, new THREE.BufferAttribute(arr, sz, at.normalized));
    }
    out.setIndex(keep); out.computeBoundingSphere();
    return out;
  }
  for (const name in geo.attributes) {
    const at = geo.attributes[name], sz = at.itemSize, arr = new at.array.constructor(keep.length * sz);
    for (let v = 0; v < keep.length; v++) {
      const j = keep[v], r = rep[j];
      if (name === 'position') { const q = sum[j]; arr[v * 3] = q[0] / q[3]; arr[v * 3 + 1] = q[1] / q[3]; arr[v * 3 + 2] = q[2] / q[3]; }
      else for (let k = 0; k < sz; k++) arr[v * sz + k] = at.array[r * sz + k];
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, sz, at.normalized));
  }
  out.computeBoundingSphere();
  return out;
}
// 材質一つの形の並び（{ geo, part }）を一つの BatchedMesh へ。
//   遠い（囲みの端が 42m より先の）部品は、頂点を升でまとめた粗い形で描く。壊れた時の傾き・非表示は両方の形に写す
function kitBatchMesh(list, mat) {
  const los = list.map(({ geo }) => kitCoarse(geo));
  // さらに遠い（95m より先）時の、もっと粗い形（粗い形のある物だけ）
  const los2 = list.map(({ geo }, i) => (los[i] ? kitCoarse(los[i], KIT_LOD_CELL2) : null));
  let totalV = 0, totalI = 0, nG = 0;
  const add = (g) => { totalV += g.attributes.position.count; totalI += g.index ? g.index.count : g.attributes.position.count; nG++; };
  for (let i = 0; i < list.length; i++) { add(list[i].geo); if (los[i]) add(los[i]); if (los2[i]) add(los2[i]); }
  const bm = new THREE.BatchedMesh(nG, Math.max(totalV, 1), Math.max(totalI, 1), mat);
  bm.castShadow = true; bm.receiveShadow = true; sizeCull(bm);
  const pair = new Int32Array(nG).fill(-1), pair2 = new Int32Array(nG).fill(-1), isLo = new Uint8Array(nG);
  list.forEach(({ geo, part }, i) => {
    const id = bm.addGeometry(geo);
    part._addInst(bm, id);
    if (los[i]) { const lo = bm.addGeometry(los[i]); part._addInst(bm, lo); pair[id] = lo; isLo[lo] = 1; los[i].dispose(); }
    if (los2[i]) { const lo2 = bm.addGeometry(los2[i]); part._addInst(bm, lo2); pair2[id] = lo2; isLo[lo2] = 1; los2[i].dispose(); }
  });
  if (los.some(Boolean)) { bm.userData.lodPair = pair; bm.userData.lodLo = isLo; }
  if (los2.some(Boolean)) bm.userData.lodPair2 = pair2;
  return bm;
}
// 戦の側で組んだ柵の形を、城の kit の入れ物へ積む（積めない時は null。呼び手が一つの Mesh にする）
export function kitFence(batch, geo, mat) {
  if (batch && batch.pending && !batch.done) return pushSimpleBatch(batch.simple || (batch.simple = makeSimpleBatch()), geo, mat);
  return null;
}
export function pushSimpleBatch(batch, geo, mat, part) {
  let list = batch.byMat.get(mat);
  if (!list) { list = []; batch.byMat.set(mat, list); }
  if (!part) part = new BatchedPart();
  list.push({ geo, part });
  return part;
}
export function finalizeSimpleBatch(rt, batch) {
  for (const [mat, list] of batch.byMat) {
    if (!list.length) continue;
    // 戦の指定がある時は拡張のある機種も区画で結合し、遠景の細部を省く。
    const merge = (false && rt.world?.def?.mergeStaticBatches)
      || rt.world?.def?.distantMaterialBatch
      || (batch.mergeFence && rt.world?.def?.mergeFenceBatches);
    if (merge || (!hasMultiDraw() && (batch.mergeFence || false))) { mergeFenceBatch(rt.scene, list, mat, true, false, rt.world); continue; }
    // 頂点の数だけでなく、面（index）の数も渡す：既定（頂点の数の2倍）では足りない形
    // （丸太を組んだ柵・馬防柵など）があり、長い柵（設楽原の馬防柵）で積み切れず落ちていた
    const bm = kitBatchMesh(list, mat);
    bm.userData.camBlock = true;
    rt.scene.add(bm);
  }
  batch.byMat.clear();
  return null;
}
// 二点を結ぶ丸太（p→q、根元の太さ r0・先の太さ r1）
const _up = new THREE.Vector3(0, 1, 0), _dv = new THREE.Vector3(), _qt = new THREE.Quaternion();
function logGeo(p, q, r0, r1, sides = 6, open = true) {
  _dv.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]); const L = _dv.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, sides, 1, open); g.translate(0, L / 2, 0);
  // 木目の長さを実寸にそろえる。長い幹でも節が引き伸ばされない。
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * Math.max(0.4, L / 2));
  g.applyQuaternion(_qt.setFromUnitVectors(_up, _dv.normalize())); g.translate(p[0], p[1], p[2]);
  return g;
}
// 絵を使わない（uv を 0 にして木肌の一点の色だけ）部品：土・縄・鉄
const flat = (g, hex) => { const p = paint(g, hex); p.attributes.uv.array.fill(0); return p; };
const h01 = (a, b = 0) => { let h = Math.imul(Math.floor(a * 97.13) ^ Math.imul(Math.floor(b * 57.7) + 7, 2654435761), 1597334677) >>> 0; h = (h ^ (h >>> 13)) >>> 0; return (h % 9973) / 9973; };
// 柵の根元の盛り土（踏み固めた土。柵の線に沿った低いかまぼこ形）。木の部品と同じ入れ物に入れる（描く数を増やさない）
function moundGeo(parts, world, ax, az, bx, bz, wd = 0.55, hh = 0.28, col = 0x5a4a36) {
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 1.2));
  const tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz, nz = tx, pos = [], cl = [];
  const U = [-1, -0.55, 0, 0.55, 1], c0 = new THREE.Color(col), cg = new THREE.Color(0x4e5a32), c = new THREE.Color();
  const V = (t, u) => {
    const j = (h01(t * 13 + ax, u * 3) - 0.5) * 0.12, w = wd * (1 + (h01(t * 7, 2 + az) - 0.5) * 0.4);
    const x = ax + tx * len * t + nx * u * w, z = az + tz * len * t + nz * u * w;
    return [x, world.heightAt(x, z) - 0.06 + hh * (1 - u * u) * (1 + j), z];
  };
  const C = (t, u) => { c.copy(c0).lerp(cg, Math.abs(u) > 0.5 ? 0.55 * h01(t * 11, u) : 0.1).multiplyScalar(0.85 + h01(t * 17, u * 5) * 0.3); return [c.r, c.g, c.b]; };
  for (let i = 0; i < n; i++) for (let q = 0; q < U.length - 1; q++) {
    const t0 = i / n, t1 = (i + 1) / n, u0 = U[q], u1 = U[q + 1];
    for (const [t, u] of [[t0, u0], [t0, u1], [t1, u1], [t0, u0], [t1, u1], [t1, u0]]) { pos.push(...V(t, u)); cl.push(...C(t, u)); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); g.computeVertexNormals();
  parts.push(g);
}

// 柵（先を尖らせた丸太を並べ、横木で結ぶ）：山で伐ったままの不揃いな丸太（皮つきと剥いだ物・太さ・高さ・傾き・削いだ先の向き）を
// 根元の盛り土に打ち込み、内の側（進む向きの右手）に横木を二段、丸太ごとに縄で巻いて結ぶ。ところどころ内へ控えの斜め木
// 削いだ丸太の先：円錐の頂を片側の縁の上へ寄せる（斧の一太刀で斜めに落とした切り口）。a は削ぎの向き
function sogiTip(r, h, a) {
  const g = new THREE.ConeGeometry(r, h, 7, 1, true); g.translate(0, h / 2, 0);
  const P = g.attributes.position, ox = Math.cos(a) * r * 0.75, oz = Math.sin(a) * r * 0.75;
  for (let i = 0; i < P.count; i++) { const t = P.getY(i) / h; P.setXYZ(i, P.getX(i) + ox * t, P.getY(i), P.getZ(i) + oz * t); }
  g.computeVertexNormals();
  return g;
}
// 板塀の厚板の型。近景は一枚ずつ、遠景は既存の束の粗い形へまとめる。
const FENCE_BOARD = lazy(() => new THREE.BoxGeometry(1, 1, 1).toNonIndexed());
function fenceBoard(w, h, depth, seed, bottom) {
  const g = FENCE_BOARD().clone(), p = g.attributes.position, uv = g.attributes.uv;
  const lean = (seed - .5) * .024;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * w, y = p.getY(i) * h, z = p.getZ(i) * depth;
    // 木口を少し欠き、板ごとに違う反りと厚みを残す。板の幅と狭間の輪郭内へ収める。
    p.setXYZ(i, x * (1 - .012 * seed), y - Math.sign(y) * .006 * seed,
      z * (.88 + seed * .24) + Math.sin((bottom + y + h / 2) * 1.7 + seed * 9) * lean);
    // 縦目の寸法を板幅と高さに合わせる。狭間の上下でも同じ板の木目を続ける。
    uv.setXY(i, x / .38 + seed * 7, (bottom + y + h / 2) / 2 + seed * 3);
  }
  g.computeVertexNormals();
  return g;
}
// 土の城の板塀。狭間は実際に空け、丸太の乱杭を一間ごとに添える。
// 全区画を既存の束へまとめる。丸太柵より少ない面で、石の腰を作らない。
export function castleBoardFence(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az);
  if (len < 0.01) return new THREE.Group();
  const n = Math.max(1, Math.round(len / (o.samaStep || 1.5))), span = len / n;
  const rot = Math.atan2(-(bz - az), bx - ax), tx = (bx - ax) / len, tz = (bz - az) / len;
  const baseH = o.h || 2.6, parts = [];
  const weathered = true;
  const boardCap = weathered && o.boardCap === true;
  // 屋敷の境の板塀だけ狭間を省く。城の外周の防御塀は従来どおり。
  const plain = weathered && o.plainBoards === true;
  let H = baseH;
  const panel = (x, z, y, w, h, depth, col) => {
    const g = new THREE.BoxGeometry(w, h, depth); g.rotateY(rot); g.translate(x, y, z);
    parts.push(weathered ? paintWorn(g, col, world.heightAt(x, z), H) : paint(g, col));
  };
  const boarding = (x, z, y, w, h, col, ground = false) => {
    if (!weathered) { panel(x, z, y, w, h, .1, col); return; }
    // 全幅に同じ板割りを使い、狭間の上下と左右で縦の継ぎ目をそろえる。
    const count = Math.max(1, Math.round(span / .28)), bw = span / count;
    const center = (x - ax) * tx + (z - az) * tz;
    const start = Math.floor((center - w / 2) / span + .0001) * span;
    for (let j = 0; j < count; j++) {
      const lo = Math.max(center - w / 2, start + j * bw);
      const hi = Math.min(center + w / 2, start + (j + 1) * bw);
      if (hi - lo < .005) continue;
      const mid = (lo + hi) / 2, px = ax + tx * mid, pz = az + tz * mid;
      const seed = h01(ax + tx * (start + (j + .5) * bw), az + tz * (start + (j + .5) * bw));
      let bottom = y - h / 2;
      // 高遠の坂では柱間の中央より裾が低い。板ごとの両端・両面まで土へ埋める。
      // 狭間より下の板だけを延ばす。準備時だけ調べ、面数と上端は保つ。
      if (ground && o.groundBoards) for (const u of [lo, mid, hi]) for (const side of [-.06, .06])
        bottom = Math.min(bottom, world.heightAt(ax + tx * u - tz * side, az + tz * u + tx * side) - .08);
      const top = y + h / 2, boardH = top - bottom, boardY = (top + bottom) / 2;
      const g = fenceBoard(hi - lo - .003, boardH, .1, seed, bottom);
      // 物理寸法の木目は paintWorn の区画単位の伸縮から外す。
      const uv = g.attributes.uv.clone();
      g.rotateY(rot); g.translate(px, boardY, pz);
      const worn = paintWorn(g, col, world.heightAt(px, pz), H);
      worn.setAttribute('uv', uv);
      const colors = worn.attributes.color, normal = worn.attributes.normal;
      for (let k = 0; k < colors.count; k++) {
        // 木口と板の間の厚みを暗くし、使い込んだ板ごとの退色を分ける。
        const edge = Math.abs(normal.getX(k) * tx + normal.getZ(k) * tz);
        const shade = (.88 + seed * .24) * (1 - edge * .3);
        colors.setXYZ(k, colors.getX(k) * shade, colors.getY(k) * shade, colors.getZ(k) * shade);
      }
      parts.push(worn);
    }
  };
  for (let i = 0; i < n; i++) {
    const u = (i + .5) * span, x = ax + tx * u, z = az + tz * u, y = world.heightAt(x, z);
    // 地続きの古い板塀は、柱間ごとに沈みと建て起こしの差を付ける。狭間の高さは保つ。
    H = baseH + (weathered && o.unevenBoards ? Math.sin(x * 1.7 + z * .63) * .09 : 0);
    const bow = i % 2, hy = bow ? 1.4 : 1.15, hh = bow ? .95 : .22, hw = Math.min(.21, span * .28);
    const col = vary(0x78654c, i);
    if (plain) boarding(x, z, y + H / 2, span, H, col, true);
    else {
      boarding(x, z, y + (hy - hh / 2) / 2, span, hy - hh / 2, col, true);
      boarding(x, z, y + (hy + hh / 2 + H) / 2, span, H - hy - hh / 2, col);
      for (const sd of [-1, 1]) {
        const off = sd * (span + hw) / 4;
        boarding(x + tx * off, z + tz * off, y + hy, (span - hw) / 2, hh, col);
      }
    }
    if (boardCap) {
      // 岩村の板塀だけ、塀の両側へ張り出す浅い切妻の笠板。
      for (const sd of [-1, 1]) {
        const cap = new THREE.BoxGeometry(span + .04, .055, .31);
        cap.rotateX(sd * .32); cap.rotateY(rot);
        cap.translate(x - tz * sd * .145, y + H + .08, z + tx * sd * .145);
        parts.push(paintWorn(cap, vary(0x756b59, i + sd), y, H));
      }
    } else panel(x, z, y + H, span + .03, .1, .2, 0x514330);
    if (weathered && o.boardRailsSide) {
      // 指定した塀だけ、内面に板を留める二段の横桟を通す。
      // 狭間の上下へ寄せ、矢穴を塞がず、通路へ控え柱も張り出さない。
      const off = Math.sign(o.boardRailsSide) * .1;
      for (const h of [.55, H - .35])
        panel(x - tz * off, z + tx * off, y + h, span + .02, .12, .1, 0x594d3d);
    }
    const px = x - tx * span / 2, pz = z - tz * span / 2, py = world.heightAt(px, pz);
    parts.push(paint(logGeo([px, py - .25, pz], [px, py + H + (boardCap ? 0 : .3), pz], .11, .08, 5), 0x594b38));
    if (weathered && o.boardBracesSide && i > 0 && i % 2 === 0 && i < n - 1) {
      // 箕作の板塀は支柱二本おきに内側へ短い控えを置く。端と虎口の脇には出さない。
      // 支柱へ寄せた幅七十センチだけで支え、狭間と守兵の間を空ける。
      const side = Math.sign(o.boardBracesSide), fx = px - tz * side * .7, fz = pz + tx * side * .7;
      const bottom = world.heightAt(fx, fz) - .12, top = py + H - .35;
      if (bottom < top - .4) {
        parts.push(paintWorn(logGeo([fx, bottom, fz],
          [px - tz * side * .12, top, pz + tx * side * .12], .075, .065, 5), 0x685b47, bottom, H));
      }
    }
    if (!boardCap) {
      const tip = sogiTip(.08, .3, i); tip.translate(px, py + H + .3, pz); parts.push(paint(tip, 0x9c8764));
    }
    if (o.holes && !plain) o.holes.push({ x, z, y: y + hy, kind: bow ? 'bow' : 'gun' });
  }
  // 板の継ぎ目の前に細い乱杭を添える。頂部を不揃いにし、既存の束へ結合する。
  if (weathered && !boardCap) for (let i = 0, u = .45; u < len - .15; i++, u += .52) {
    if (Math.abs(u / span - Math.round(u / span)) < .15) continue;
    const x = ax + tx * u - tz * .12, z = az + tz * u + tx * .12, y = world.heightAt(x, z);
    const h = H + .12 + h01(x * 2.7, z * 3.1) * .3;
    parts.push(paintWorn(logGeo([x, y - .12, z], [x, y + h - .2, z], .045, .035, 4), 0x746650, y, h));
    const tip = sogiTip(.035, .22, i); tip.translate(x, y + h - .2, z); parts.push(paint(tip, 0x9c8b6d));
  }
  if (weathered && o.unevenBoards) for (const g of parts) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), rise = Math.max(0, p.getY(i) - world.heightAt(x, z));
      const lean = Math.sin((x * tx + z * tz) * .47) * .018 * rise;
      p.setX(i, x - tz * lean); p.setZ(i, z + tx * lean);
    }
    g.computeVertexNormals();
  }
  return merged(parts, o.material || MAT(), o.batch);
}

// 太い杭の型は共用。根元の一段だけ泥の帯を作り、六面の木肌をわずかにうねらせる。
// 縄を四面に減らした分を、背の高い防柵の中段へ回す。
const FENCE_POST = lazy(() => new THREE.CylinderGeometry(1, 1, 1, 6, 2, true));
const FENCE_TIE = lazy(() => new THREE.CylinderGeometry(1, 1, .075, 4, 1, true));
// 円錐の一点ではなく、斧で両側から削った刃状の先。八面の型を全ての防柵で使い回す。
const FENCE_CUT = lazy(() => {
  const s = Math.sqrt(3) / 2;
  const v = [[1, 0, 0], [.5, 0, s], [-.5, 0, s], [-1, 0, 0], [-.5, 0, -s], [.5, 0, -s], [.35, 1, .12], [-.35, .86, .12]];
  const faces = [[0, 6, 1], [1, 6, 7], [1, 7, 2], [2, 7, 3], [3, 7, 4], [4, 7, 6], [4, 6, 5], [5, 6, 0]];
  const p = [], uv = [];
  for (const face of faces) for (const i of face) {
    p.push(...v[i]); uv.push(v[i][0] * .09 + .5, v[i][1] * .3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
});
function fencePostGeo(x, y, z, top, rad, seed) {
  const g = FENCE_POST().toNonIndexed(), p = g.attributes.position, uv = g.attributes.uv;
  const h = top[1] - y + .35;
  for (let j = 0; j < p.count; j++) {
    const t = p.getY(j) > .1 ? 1 : p.getY(j) < -.1 ? 0 : Math.min(.8, .8 / h);
    const a = Math.atan2(p.getZ(j), p.getX(j));
    const r = rad * (1.08 - t * .18) * (1 + Math.sin(a * 3 + seed) * .08);
    p.setXYZ(j, x + (top[0] - x) * t + p.getX(j) * r,
      y - .35 + h * t, z + (top[2] - z) * t + p.getZ(j) * r);
    // 周囲を一枚の巨大な木目で包まず、幹の太さに合わせて細い縦目を出す。
    uv.setXY(j, uv.getX(j) * Math.PI * rad + seed, t * h / 2);
  }
  g.computeVertexNormals();
  return g;
}

export function palisade(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg;
  // o.solid：飾りの柵にも当たりを付ける（壊せる柵は army.addStruct の方で当たる）
  if (o.solid) Object.assign(solidSeg(ax, az, bx, bz, 0.15), { missileH: o.h || 2.4, missileType: 'wood' });
  const len = Math.hypot(bx - ax, bz - az);
  if (len < .01) return new THREE.Group();
  const parts = [];
  // 高さは図の柵（朝倉家 180cm・織田家 200cm 余り）に合わせて既定 2.1m
  const H = o.h || 2.1;
  // 指定した山城の段だけ、写真の細い杭と二段の横木。縄と面数も抑える。
  const lightFence = o.lightFence === true && (true || o.terrainRails === true);
  const ang = Math.atan2(bx - ax, bz - az);
  const px = Math.cos(ang), pz = -Math.sin(ang);   // 柵に直角な向き（内の側）
  const tx = (bx - ax) / len, tz = (bz - az) / len, sd = ax * 3.1 + az * 1.7;
  const posts = [];
  let u = 0, i = 0;
  while (u <= len + 0.01) {
    const r = h01(sd + i, 1), r2 = h01(sd + i, 2), r3 = h01(sd + i, 3);
    const rad = lightFence ? .045 + r2 * .02 : 0.07 + r2 * 0.055;   // 段の仕切りと外周の太い防柵を分ける
    const x = ax + tx * u + px * (r3 - 0.5) * 0.1, z = az + tz * u + pz * (r3 - 0.5) * 0.1;
    const y = world.heightAt(x, z);
    const h = H * (0.84 + r * 0.24) * (r3 < 0.04 ? 0.7 : 1);      // たまに短い（折れた・継いだ）丸太
    const lean = [(r - 0.5) * 0.09, (r2 - 0.5) * 0.07];
    const top = [x + lean[0] * h, y + h - 0.25, z + lean[1] * h];
    const bark = r3 > 0.62;
    const hewn = true && !lightFence && H >= 1.7;
    const shaft = hewn
      ? fencePostGeo(x, y, z, top, rad, r * 6.283)
      : logGeo([x, y - 0.35, z], top, rad * 1.08, rad * 0.9, lightFence ? 4 : 7);
    parts.push(paintWorn(shaft, bark ? vary(0x5a4c3c, i) : vary(0x857a66, i), y, h));
    // 太い防柵は二つの広い削り面で光を受ける。細い仕切りと低画質は従来の粗い先端。
    const tip = hewn ? FENCE_CUT().clone() : sogiTip(rad * 0.92, 0.34 + r * 0.3, r2 * 6.283);
    if (hewn) {
      tip.scale(rad * .92, .34 + r * .3, rad * .92);
      // 六角の幹と底を合わせ、削り面の向きも杭ごとに変わる。
      tip.rotateY(Math.PI / 6 + Math.floor(r2 * 6) * Math.PI / 3);
    }
    tip.translate(top[0], top[1] - 0.02, top[2]);
    parts.push(paint(tip, vary(bark ? 0x948468 : 0xa69a80, i + 3)));
    posts.push({ x, z, y, rad, lean, u });
    // 切り落とした枝の節。丸太と同じ束へ入れ、描く回数は増やさない。
    if (!lightFence && i % 3 === 0) {
      const hy = h * (0.36 + r2 * 0.3), a = [x + lean[0] * hy, y + hy, z + lean[1] * hy];
      const b = [a[0] - px * rad * 1.25, a[1] + 0.025, a[2] - pz * rad * 1.25];
      parts.push(paint(logGeo(a, b, rad * 0.35, rad * 0.3, 6, false), 0x75634c));
    }
    // 柱は間を空けて立てる（図の柵は一間に五本ほど。隙間から槍・鉄砲を出す）
    u += lightFence ? .48 + r * .08 : rad * 2 + 0.17 + r * 0.12; i++;
  }
  // 横木（内の側）：朝倉家の柵のように横木を多く、高さに合わせて三〜四段。柱ごとに縄で巻いて結ぶ
  const RAILS = lightFence ? [.4, H * .76] : H >= 1.7 ? [0.32, 0.32 + (H * 0.8 - 0.32) / 3, 0.32 + (H * 0.8 - 0.32) * 2 / 3, H * 0.8] : [0.3, H * 0.45, H * 0.78];
  for (let k = 0; k < RAILS.length; k++) {
    const hy = RAILS[k], anchors = [];
    // 長い一本棒で斜面を横切らず、四本おきの杭に横木を当てる。継ぎ目は上下でずらす。
    // 指定した山腹では、簡素な柵と低画質も途中の杭へ継ぐ。地面の上下を横切らない。
    for (let q = 0; q < posts.length; q++) {
      if (!o.terrainRails && (lightFence) && q !== 0 && q !== posts.length - 1) continue;
      if (q !== 0 && q !== posts.length - 1 && q % 4 !== (k % 2) * 2) continue;
      const P = posts[q], off = P.rad + .055;
      anchors.push({ u: P.u, p: [P.x + P.lean[0] * hy + px * off, P.y + hy, P.z + P.lean[1] * hy + pz * off] });
    }
    // 区画の端まで横木を通し、隣の柵との短い隙間も残さない。
    if (anchors.length === 1) anchors.push({ u: len, p: [bx + px * .15, world.heightAt(bx, bz) + hy, bz + pz * .15] });
    const first = anchors[0], last = anchors[anchors.length - 1];
    first.p[0] -= tx * first.u; first.p[2] -= tz * first.u; first.u = 0;
    last.p[0] += tx * (len - last.u); last.p[2] += tz * (len - last.u); last.u = len;
    for (let q = 1; q < anchors.length; q++) {
      const a = anchors[q - 1].p, b = anchors[q].p;
      parts.push(paintWorn(logGeo(a, b, .07, .06, 5), vary(0x76695a, k + q), Math.min(a[1], b[1]) - hy, H));
    }
    // 画質「低」：縄の結びは上と下の横木だけ、四角の輪で（柵の三角の半分ほどが縄の輪だった）
    const lowTie = false;
    if (lowTie && k !== 0 && k !== RAILS.length - 1) continue;
    let span = 1;
    for (let q = 0; q < posts.length; q++) {
      if (lightFence && q % 4 !== 0) continue;
      const P = posts[q];
      while (span < anchors.length - 1 && P.u > anchors[span].u) span++;
      const a = anchors[span - 1], b = anchors[span], t = (P.u - a.u) / Math.max(.001, b.u - a.u);
      const rx = a.p[0] + (b.p[0] - a.p[0]) * t, rz = a.p[2] + (b.p[2] - a.p[2]) * t;
      const yy = a.p[1] + (b.p[1] - a.p[1]) * t, cx = P.x + P.lean[0] * hy, cz = P.z + P.lean[1] * hy;
      // 杭だけを巻く輪から、横木も抱える斜めの結束へ。同じ四面の輪を伸ばして使う。
      const band = FENCE_TIE().clone();
      band.rotateY(Math.PI / 4); band.scale((P.rad + .024) * Math.SQRT2, 1, (Math.hypot(rx - cx, rz - cz) / 2 + P.rad + .035) * Math.SQRT2);
      band.rotateX(q % 2 ? .35 : -.35); band.rotateY(ang + Math.PI / 2);
      band.translate((cx + rx) / 2, yy, (cz + rz) / 2);
      parts.push(flat(band, 0x93815c));   // 藁縄を斜めに掛けて結ぶ
    }
  }
  // 控え：内へ倒れないよう斜めに支える丸太（2.5m ほどごと）
  if (!o.noBrace) for (let t = 1.2; t < len - 0.5; t += 2.4 + h01(sd, t) * 0.8) {
    const x = ax + tx * t, z = az + tz * t, y = world.heightAt(x, z), fx = x + px * 1.3, fz = z + pz * 1.3;
    parts.push(paintWorn(logGeo([fx, world.heightAt(fx, fz) - 0.1, fz], [x + px * 0.18, y + H * 0.62, z + pz * 0.18], 0.085, 0.07, 5), vary(0x76695a, Math.round(t * 7)), y, H));
  }
  // 墨俣など、指定した区画だけ古板を杭へ結う。壊れる柵と同じ束なので破損・修理も一緒。
  if (o.boardScreen && true) {
    const n = Math.ceil(len / .38), step = len / n;
    for (let k = 0; k < n; k++) {
      const t = (k + .5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const h = H * (.78 + h01(sd + k, 8) * .1);
      // 上端を不揃いにし、杭の先と槍を出す隙間を残す。
      const g = new THREE.BoxGeometry(step - .035, h, .055);
      g.rotateY(Math.atan2(-tz, tx));
      g.translate(x - px * .13, world.heightAt(x, z) + h / 2 + .08, z - pz * .13);
      parts.push(paintWorn(g, vary(0x796953, k + sd), world.heightAt(x, z), h));
    }
  }
  if (o.mound !== false) moundGeo(parts, world, ax, az, bx, bz, 0.6, 0.3);
  return merged(parts, MAT(), o.batch);
}

// 破られた柵の残骸：根元で折れて裂けた丸太（焦げの黒）、倒れた丸太と横木、散った土
export function stumps(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg;
  const len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / (len || 1), tz = (bz - az) / (len || 1), px = tz, pz = -tx, sd = ax * 2.3 + az * 4.1;
  const parts = [];
  const n = Math.max(5, Math.round(len / 0.55));
  // 設楽原では残った横木で柵の線を読ませ、白い切り口だけの杭にしない。
  if (o.rails) for (let i = 0; i < 3; i++) {
    const a = (i + 0.06) / 3, b = (i + 0.8) / 3;
    const x0 = ax + (bx - ax) * a, z0 = az + (bz - az) * a;
    const x1 = ax + (bx - ax) * b, z1 = az + (bz - az) * b;
    parts.push(paintWorn(logGeo([x0, world.heightAt(x0, z0) + 0.65, z0],
      [x1, world.heightAt(x1, z1) + 0.35, z1], 0.085, 0.075, 6), 0x514432, 0, 1));
  }
  for (let i = 0; i < n; i++) {
    const r = h01(sd + i, 1), r2 = h01(sd + i, 2), r3 = h01(sd + i, 3);
    const u = (i + 0.3 + r * 0.4) / n * len, x = ax + tx * u, z = az + tz * u, y = world.heightAt(x, z), rad = 0.08 + r2 * 0.05;
    const burnt = r3 < 0.35, col = burnt ? 0x1e1a16 : vary(0x6a6052, i);
    if (r < 0.55) {
      // 折れて残った根元：高さまちまち、裂けた先
      const h = 0.25 + r2 * 0.9, lx = (r3 - 0.5) * 0.4;
      parts.push(paintWorn(logGeo([x, y - 0.3, z], [x + lx * px, y + h, z + lx * pz], rad, rad * 0.95, 6), col, y, h + 0.3));
      const sp = new THREE.ConeGeometry(rad * 0.7, 0.3, 4); sp.rotateZ((r - 0.3) * 1.2); sp.translate(x + lx * px, y + h + 0.1, z + lx * pz); parts.push(paint(sp, burnt ? 0x2a241e : o.rails ? 0x79674d : 0xa89878));
    } else {
      // 倒れた丸太：外か内へ、斜めに
      const L = 1.4 + r2 * 1.2, a = (r3 - 0.5) * 1.4 + (r > 0.8 ? 0 : Math.PI), dx = Math.sin(ang0(px, pz) + a) * L, dz = Math.cos(ang0(px, pz) + a) * L;
      parts.push(paintWorn(logGeo([x, y + 0.05, z], [x + dx, world.heightAt(x + dx, z + dz) + 0.12, z + dz], rad, rad * 0.8, 6), col, y - 0.3, 0.6));
    }
  }
  // 外れた横木
  { const x = ax + tx * len * 0.35, z = az + tz * len * 0.35; parts.push(paintWorn(logGeo([x - px * 0.4, world.heightAt(x, z) + 0.06, z - pz * 0.4], [x + tx * 2.6 + px * 0.5, world.heightAt(x + tx * 2.6, z + tz * 2.6) + 0.1, z + tz * 2.6 + pz * 0.5], 0.06, 0.055, 5), 0x4a4238, 0, 1)); }
  moundGeo(parts, world, ax, az, bx, bz, 0.8, 0.18, 0x4a3c2c);
  return merged(parts);
}
const ang0 = (px, pz) => Math.atan2(px, pz);

// 陣幕の布：風（幟と同じ時計と突風）で裾ほど大きく、ゆっくりふくらむ。濡れると重く揺れが小さい（A4）
function jinmakuMat(t) {
  const m = new THREE.MeshLambertMaterial({ map: t, vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlagT = FLAG_T; sh.uniforms.uGust = GUST; sh.uniforms.uWet = WET; sh.uniforms.uClothDir = WIND_DIR;
    sh.vertexShader = 'uniform float uFlagT, uGust, uWet;\nuniform vec2 uClothDir;\nattribute float jpin;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float jk = (1.0 - uv.y) * jpin;
      vec3 jw = (modelMatrix * vec4(position, 1.0)).xyz;
      float jp = dot(jw.xz, uClothDir) * 0.075 - uFlagT * 1.2;
      vec3 jn = normalize(mat3(modelMatrix) * objectNormal);
      float pressure = dot(jn.xz, uClothDir);
      float jA = uGust * (0.06 + 0.1 * smoothstep(-0.3, 0.9, sin(jp))) * (1.0 - uWet * 0.6) * pressure;
      transformed += objectNormal * (sin(uFlagT * 1.1 + jp) * 0.6 + sin(uFlagT * 2.3 + jp * 2.1) * 0.4) * jA * jk;`);
    // 濡れた生成りは暗く重くする。追加の光・絵・光沢計算は使わない。
    sh.fragmentShader = 'uniform float uWet;\n' + sh.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(1.0), vec3(0.76, 0.79, 0.81), uWet);');
  };
  return m;
}
// 家紋ごとに絵と材質を共用。陣の数だけ複製しない。
const jinmakuMaterials = new WeakMap();
function jinmakuSharedMat(tex) {
  let m = jinmakuMaterials.get(tex);
  if (!m) {
    tex.wrapS = THREE.RepeatWrapping; tex.needsUpdate = true;
    m = jinmakuMat(tex); jinmakuMaterials.set(tex, m);
  }
  return m;
}
// 陣幕の設営具。結び目と杭の原形は全陣で共用し、近景の柱と一つにまとめる。
const jinmakuRigShapes = lazy(() => {
  const parts = [];
  for (const y of [0, .032]) {
    const ring = new THREE.TorusGeometry(.061, .012, 3, 6);
    ring.rotateX(Math.PI / 2); ring.translate(0, y, 0);
    parts.push(paint(ring, 0xa69570));
  }
  // 巻いた縄を締める結び玉と、短く垂れた縄端。
  const knot = new THREE.BoxGeometry(.045, .055, .035);
  knot.translate(.055, .005, 0); parts.push(paint(knot, 0x88744f));
  parts.push(paint(logGeo([.06, 0, 0], [.085, -.12, .025], .011, .008, 3, false), 0xa69570));
  const tie = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  const stake = paint(new THREE.CylinderGeometry(.025, .045, .46, 4), 0x766043);
  // 斜めに打つ杭。原点は地表、縄を掛ける頭は地表から約二十センチ。
  stake.rotateZ(-.22); stake.translate(0, .04, 0);
  return { tie, stake, cord: paint(new THREE.CylinderGeometry(1, 1, 1, 3, 1, true), 0xa69570) };
});
function jinmakuRig(world, cx, cz, w, d, gap, posts) {
  const shape = jinmakuRigShapes(), parts = [], axis = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const cord = (a, b) => {
    dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const length = dir.length(); rotation.setFromUnitVectors(axis, dir.divideScalar(length));
    const g = shape.cord.clone(); g.scale(.014, length, .014); g.applyQuaternion(rotation);
    g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); parts.push(g);
  };
  for (const [x, z] of posts.values())
    parts.push(shape.tie.clone().translate(x, world.heightAt(x, z) + 2.08, z));
  // 四隅と入口の袖を外へ引く。縄と杭は飾りで、通路や兵の当たりは変えない。
  const anchors = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) anchors.push([sx * w / 2, sz * d / 2, sx * .85, sz * .85]);
    if (w - gap > 1) anchors.push([sx * gap / 2, d / 2, sx * .65, 1]);
  }
  for (const [lx, lz, dx, dz] of anchors) {
    const x = cx + lx, z = cz + lz, px = x + dx, pz = z + dz;
    const y = world.heightAt(x, z) + 2.1, py = world.heightAt(px, pz);
    const peg = shape.stake.clone(); peg.rotateY(Math.atan2(dx, dz)); peg.translate(px, py, pz); parts.push(peg);
    parts.push(shape.tie.clone().scale(.75, .75, .75).translate(px, py + .19, pz));
    // 二辺でごく浅いたるみを作り、張り縄を棒に見せない。
    const a = [x, y, z], b = [px, py + .19, pz];
    const mid = [(x + px) / 2, (y + py + .19) / 2 - .035, (z + pz) / 2];
    cord(a, mid); cord(mid, b);
  }
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return geometry;
}
// 陣幕：柱の間で布が少したるみ、風にふくらむ。o.mon で幕に家紋を染め抜く
export function jinmaku(world, cx, cz, w, d, gapSouth = 6, o = {}) {
  const high = true;
  const contour = high && o.contour !== false;
  const fieldHem = high && o.fieldHem !== false;
  const clothH = fieldHem ? 1.87 : 1.6, clothCenter = 2.05 - clothH / 2;
  addNightBeacon(world, cx + gapSouth / 2 + 0.8, cz + d / 2 + 0.8);
  const tex = jinmakuTexture(o.mon);
  const grp = new THREE.Group();
  const sides = [
    [cx - w / 2, cz - d / 2, cx + w / 2, cz - d / 2],
    [cx - w / 2, cz - d / 2, cx - w / 2, cz + d / 2],
    [cx + w / 2, cz - d / 2, cx + w / 2, cz + d / 2],
    [cx - w / 2, cz + d / 2, cx - gapSouth / 2, cz + d / 2],
    [cx + gapSouth / 2, cz + d / 2, cx + w / 2, cz + d / 2],
  ];
  const poles = [], cloths = [], coarseCloths = [], ties = [], rigPosts = new Map();
  // 幕は通り抜けられない（開いた口だけ通れる）。角は少し内側で切って、角に押し込まれて詰まらないようにする
  if (o.solid !== false) for (const [ax, az, bx, bz] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len <= 0.5) continue;
    const inset = Math.min(0.6, len * 0.1);
    const t = inset / len;
    solidSeg(ax + (bx - ax) * t, az + (bz - az) * t, bx - (bx - ax) * t, bz - (bz - az) * t, 0.12);
  }
  for (const [ax, az, bx, bz] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) continue;
    const n = Math.max(1, Math.round(len / 3));
    const midY = world.heightAt((ax + bx) / 2, (az + bz) / 2);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    // 近くは吊り元の張りじわと重い裾、遠くは同じ輪郭の粗い布。
    // 頂点は初回だけ作り、毎コマは共有の風の時計だけで動かす。
    const makeCloth = (detail) => {
      const geo = new THREE.PlaneGeometry(len, clothH, Math.max(4, n * (detail ? 10 : 4)), detail ? 6 : 3);
      const P = geo.attributes.position;
      const pin = new Float32Array(P.count), colors = new Float32Array(P.count * 3);
      const tone = new THREE.Color(), linen = new THREE.Color(0xd8cfb9), hem = new THREE.Color(0x75654e);
      for (let k = 0; k < P.count; k++) {
        const x = P.getX(k), y = P.getY(k), v = (y + clothH / 2) / clothH;
        const span = (x + len / 2) / (len / n), u = span - Math.floor(span);
        const sag = Math.sin(u * Math.PI);
        // 柱で留めた布の斜めじわは吊り元に集まり、下は重みで緩く垂れる。
        const fold = sag * Math.cos(u * Math.PI * 4 + (1 - v) * 1.8);
        const pleat = detail ? Math.sin(u * Math.PI * 8 + (1 - v) * 3) * sag * v * v * .045 : 0;
        // 濡れた裾の重さと、柱から斜めに走る張りじわ。面を増やさず輪郭と法線で見せる。
        const gather = Math.sin(u * Math.PI * 6 + (1 - v) * 4) * sag * (1 - v) * .035;
        const t = .5 - x / len;
        const ground = contour ? world.heightAt(ax + (bx - ax) * t, az + (bz - az) * t) - midY : 0;
        pin[k] = sag * (fieldHem ? .55 + v * .45 : 1);
        P.setY(k, y + ground - sag * .13 * (.5 + v) + gather * (1 - v));
        P.setZ(k, sag * .23 * (.3 + (1 - v) * .7) + fold * .14 * Math.sin(v * Math.PI) + pleat + gather);
        // 裾の吸水跡は一様な帯にせず、縫い合わせに沿って高さを変える。
        const stain = Math.pow(1 - v, 3) * (.34 + .2 * Math.sin(span * 5.7 + .8) ** 2);
        tone.copy(linen).lerp(hem, stain).multiplyScalar(.92 + fold * .1);
        colors[k * 3] = tone.r; colors[k * 3 + 1] = tone.g; colors[k * 3 + 2] = tone.b;
      }
      const UV = geo.attributes.uv;
      for (let k = 0; k < UV.count; k++) UV.setX(k, UV.getX(k) * len / 4);
      geo.setAttribute('jpin', new THREE.BufferAttribute(pin, 1));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      geo.rotateY(Math.atan2(bx - ax, bz - az) + Math.PI / 2);
      geo.translate(mx, midY + clothCenter, mz);
      return geo;
    };
    cloths.push(makeCloth(high));
    if (high) coarseCloths.push(makeCloth(false));
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      const postKey = `${x.toFixed(4)},${z.toFixed(4)}`;
      if (!rigPosts.has(postKey)) {
        const y = world.heightAt(x, z);
        const p = logGeo([x, y - .05, z], [x + .018, y + 2.25, z - .012], .055, .038, 5, false);
        poles.push(paintWorn(p, 0x75634a, y, 2.3));
      }
      rigPosts.set(postKey, [x, z]);
      if (fieldHem) {
        // 柱の二重巻きは共通の設営具へまとめ、布へ渡す短い吊り紐を残す。
        const y = world.heightAt(x, z), tx = (bx - ax) / len, tz = (bz - az) / len;
        for (const sign of [-1, 1]) {
          if ((i === 0 && sign < 0) || (i === n && sign > 0)) continue;
          ties.push(paint(logGeo([x, y + 2.14, z],
            [x + tx * sign * .1, y + 2.03, z + tz * sign * .1], .012, .012, 3, false), 0x9a8964));
        }
      }
    }
    // 幕を吊る縄
    if (contour) {
      // 横縄も同じ面分割で追従させ、斜面で幕から離れないようにする。
      const count = Math.max(4, n * 6);
      for (let i = 0; i < count; i++) {
        const t0 = i / count, t1 = (i + 1) / count;
        const point = (t) => {
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          return [x, world.heightAt(x, z) + 2.05 - Math.sin((t * n % 1) * Math.PI) * .195, z];
        };
        poles.push(paint(logGeo(point(t0), point(t1), .015, .015, 3, false), 0x6a5a40));
      }
    } else {
      // 高画質だけ縄も布と同じたるみにする。低・中は従来の粗い形を使う。
      const rope = new THREE.CylinderGeometry(0.015, 0.015, len, 3, n * 6);
      const rp = rope.attributes.position;
      for (let k = 0; k < rp.count; k++) {
        const u = (rp.getY(k) / len + .5) * n;
        rp.setZ(k, rp.getZ(k) + Math.sin((u % 1) * Math.PI) * .195);
      }
      rope.rotateX(Math.PI / 2); rope.rotateY(Math.atan2(bx - ax, bz - az));
      rope.translate(mx, world.heightAt(mx, mz) + 2.05, mz);
      rope.computeVertexNormals();
      poles.push(paint(rope, 0x6a5a40));
    }
  }
  // 張り縄・杭・結び目も近景の柱へ統合。遠景では布と一緒に粗くする。
  if (high && rigPosts.size) ties.push(jinmakuRig(world, cx, cz, w, d, gapSouth, rigPosts));
  if (cloths.length) {
    const material = jinmakuSharedMat(tex);
    const clothMesh = (parts) => {
      const m = new THREE.Mesh(mergeGeometries(parts), material);
      for (const g of parts) g.dispose();
      m.castShadow = m.receiveShadow = true; m.userData.camBlock = true;
      return m;
    };
    const near = new THREE.Group();
    near.add(clothMesh(cloths), merged([...poles, ...ties]));
    if (high) {
      const lod = new THREE.LOD();
      // 形は世界座標なので、囲いの中心へ寄せて距離の切替を判定する。
      near.position.set(-cx, -world.heightAt(cx, cz), -cz);
      const far = new THREE.Group();
      far.add(clothMesh(coarseCloths), merged(poles));
      far.position.copy(near.position);
      lod.position.set(cx, world.heightAt(cx, cz), cz);
      lod.addLevel(near, 0); lod.addLevel(far, 38); grp.add(lod);
    } else grp.add(near);
    for (const g of [...poles, ...ties]) g.dispose();
  }
  return grp;
}

// 幟の布：竿から離れるほど、下へ行くほど大きくはためく
const noboriMats = new Map();
function noboriMaterial(kind) {
  const enemy = enemyFlagKind(kind);
  const key = enemy ? kind + '|e' : kind;
  if (noboriMats.has(key)) return noboriMats.get(key);
  const m = SETTINGS.simpleMaterials
    ? new THREE.MeshPhongMaterial({ map: flagTexture(kind, true, enemy), side: THREE.DoubleSide, shininess: 4, specular: 0x171717, alphaTest: 0.5 })
    : liteMat({ map: flagTexture(kind, true, enemy), side: THREE.DoubleSide, roughness: 0.95, alphaTest: 0.5 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlagT = FLAG_T;
    sh.uniforms.uGust = GUST;
    sh.uniforms.uWet = WET;
    // 突風が来ると大きく速くはためく（草と同じ風）。濡れた布は重く、はためきが小さい
    if (SETTINGS.flagMotion) sh.vertexShader = 'uniform float uFlagT, uGust, uWet;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 fo = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float ph = fo.x * 0.53 + fo.z * 0.37;
      // 上の横木と竿の側は固定し、裾だけを風に開く。布の上端を竿から浮かせない。
      float k = smoothstep(0.0, 0.25, 1.0 - uv.y) * clamp((position.x - 0.025) / 0.75, 0.0, 1.0);
      float gA = uGust * (1.0 - uWet * 0.6);
      transformed.z += (sin(uFlagT * 3.1 + position.x * 7.0 + position.y * 1.6 + ph) * 0.14 * gA + sin(uFlagT * 1.3 + ph) * 0.08 * uGust * (1.0 - uWet * 0.5)) * k;`);
    if (SETTINGS.flagMotion) sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      float phN = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).x * 0.53 + (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z * 0.37;
      float kyN = smoothstep(0.0, 0.25, 1.0 - uv.y);
      float kxN = clamp((position.x - 0.025) / 0.75, 0.0, 1.0);
      float aN = uFlagT * 3.1 + position.x * 7.0 + position.y * 1.6 + phN;
      float gN = uGust * (1.0 - uWet * 0.6);
      float waveN = sin(aN) * 0.14 * gN + sin(uFlagT * 1.3 + phN) * 0.08 * uGust * (1.0 - uWet * 0.5);
      objectNormal.x -= kyN * (cos(aN) * 0.98 * gN * kxN + waveN / 0.75);
      objectNormal.y -= cos(aN) * 0.224 * gN * kxN * kyN;
      objectNormal = normalize(objectNormal);`);
    flagMoonlight(sh);
    // 濡れた布は色が濃い
    sh.fragmentShader = 'uniform float uWet;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= 1.0 - uWet * 0.3;');
    sh.uniforms.uWet = WET;
  };
  m.customProgramCacheKey = () => '置き幟の皺';
  noboriMats.set(key, m);
  return m;
}

// 置き幟も、布と竿を一緒に薄くする。材質ごとに使い回し、毎コマの処理を足さない。
const nearNoboriMats = new WeakMap();
function nearNoboriMaterial(base) {
  if (nearNoboriMats.has(base)) return nearNoboriMats.get(base);
  const m = base.clone(), compile = base.onBeforeCompile;
  m.transparent = true; m.depthWrite = false; m.forceSinglePass = true;   // 両面透明の二度描き（毎コマの needsUpdate）を避ける
  m.onBeforeCompile = (sh, renderer) => {
    compile.call(base, sh, renderer);
    sh.vertexShader = 'varying float vNearNobori;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 nearRoot = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vec4 nearView = viewMatrix * nearRoot;
      // 手前の大旗も、中央の進路を塞ぐ間は薄くする。遠い軍勢の旗は残す。
      vec2 nearScreen = abs(nearView.xy * vec2(projectionMatrix[0][0], projectionMatrix[1][1]) / max(0.1, -nearView.z));
      float nearCenter = 1.0 - smoothstep(0.85, 1.2, nearScreen.x);
      float nearDistance = smoothstep(7.0, 18.0, length(nearRoot.xz - cameraPosition.xz));
      vNearNobori = mix(0.1, 1.0, mix(smoothstep(2.0, 10.0, length(nearRoot.xz - cameraPosition.xz)), nearDistance, nearCenter));`);
    // 画面上の点を間引くと、視点移動や縮小描画で砂嵐になる。布と竿を滑らかに透かす。
    sh.fragmentShader = 'varying float vNearNobori;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
      diffuseColor.a *= vNearNobori;`);
  };
  m.customProgramCacheKey = () => base.customProgramCacheKey() + '_near_nobori';
  nearNoboriMats.set(base, m);
  return m;
}

// 高さごとの竿・乳・布を使い回す。波は材質で動かし、毎コマ形を作らない。
const noboriGeos = new Map();
const noboriStaffMat = lazy(() => nearNoboriMaterial(liteMat({ vertexColors: true, roughness: 0.9 })));
function noboriGeometry(h) {
  if (noboriGeos.has(h)) return noboriGeos.get(h);
  const pole = new THREE.CylinderGeometry(0.065, 0.08, h, 6);
  pole.translate(0, h / 2, 0);
  const bar = new THREE.CylinderGeometry(0.035, 0.035, 0.86, 4);
  bar.rotateZ(Math.PI / 2); bar.translate(0.4, h - 0.1, 0);
  // 木の大きな凹凸用の材質を避け、細い竿にも竹の茶色を残す。
  const parts = [paint(pole, 0x806344), paint(bar, 0x806344)];
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.TorusGeometry(.085, .018, 4, 8);
    const cy = h - .3 - i * .6;
    ring.rotateX(Math.PI / 2); ring.translate(0, cy, 0);
    const tie = new THREE.BoxGeometry(.10, .07, .025); tie.translate(.07, cy, 0);
    parts.push(paint(ring, 0xcfc5ae), paint(tie, 0xcfc5ae));
  }
  const staff = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  const geos = { staff, cloth: noboriCloth(h, 6, 14) }; noboriGeos.set(h, geos);
  return geos;
}
function noboriCloth(h, sx, sy) {
  const cloth = new THREE.PlaneGeometry(0.75, 2.8, sx, sy);
  cloth.translate(0.4, h - 1.5, 0);
  const p = cloth.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), free = (x - .025) / .75;
    p.setZ(i, Math.sin(free * Math.PI * 4 + (h - .1 - y) * 1.8) * .07 * free * (1 - cloth.attributes.uv.getY(i)));
  }
  cloth.computeVertexNormals();
  return cloth;
}
// 遠くにたくさん並べる幟（本能寺の囲み）の布：割りを減らした形（168 面 → 72 面）
const noboriLite = new Map();
export function noboriClothLite(h) { if (!noboriLite.has(h)) noboriLite.set(h, noboriCloth(h, 4, 9)); return noboriLite.get(h); }

// 画質「低」：霧の奥（150m より先）の幟は布も描かない（描く直前に main.js が呼ぶ。外れた幟は一覧から落とす）
const NOBORI_ALL = [];
const _nbP = new THREE.Vector3();
export function noboriCull(cam, scene) {
  const low = false;
  for (let i = NOBORI_ALL.length - 1; i >= 0; i--) {
    const f = NOBORI_ALL[i];
    let top = f; while (top.parent) top = top.parent;
    if (top !== scene) { NOBORI_ALL.splice(i, 1); continue; }   // 前の戦の幟・場に置かれなかった幟は忘れる
    f.getWorldPosition(_nbP);
    const far = low && (_nbP.x - cam.position.x) ** 2 + (_nbP.z - cam.position.z) ** 2 > 22500;
    f.layers.mask = far ? 0 : 1;
  }
}
export function nobori(world, x, z, kind, h = 5) {
  const grp = new THREE.Group(), geos = noboriGeometry(h);
  const y = world.heightAt(x, z);
  // 幟ごとに高さと竿の傾きを少しずつ変える。形は高さごとに共用する。
  const rr = (k) => { const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.7) * 43758.5453; return v - Math.floor(v); };
  grp.scale.y = 0.92 + rr(1) * 0.16;
  const staff = new THREE.Mesh(geos.staff, noboriStaffMat());
  staff.castShadow = true;
  const flag = new THREE.Mesh(geos.cloth, nearNoboriMaterial(noboriMaterial(kind)));
  flag.castShadow = true;
  // 布を隠した時は竿と乳も一緒に消し、竿だけを残さない。
  flag.add(staff); grp.add(flag);
  NOBORI_ALL.push(flag);
  // 画質「低」：70m より先の幟は竿（太さ数cm。一画素に満たない）を描かない。布の色と紋は残す
  if (false) {
    const ob = flag.onBeforeRender;
    flag.onBeforeRender = function (r, sc, cam, g, m, gr) {
      const e = this.matrixWorld.elements, c = cam.matrixWorld.elements;
      const st = this.children[0];   // 複製された幟でも、その幟の竿を見る
      if (st) st.layers.mask = (e[12] - c[12]) ** 2 + (e[14] - c[14]) ** 2 > 4900 ? 0 : 1;
      return ob.call(this, r, sc, cam, g, m, gr);
    };
  }
  grp.position.set(x, y, z);
  grp.rotation.y = Math.atan2(-WIND_STATE.dirZ, WIND_STATE.dirX) + (rr(4) - 0.5) * 0.2;
  grp.rotation.x = (rr(2) - 0.5) * 0.07; grp.rotation.z = (rr(3) - 0.5) * 0.07;
  grp.userData.flag = flag;
  return grp;
}

// 小屋・陣屋・兵糧蔵（kaito 10/2「本物の水準に」）：礎石の上に柱を一間（約 1.8m）ごとに立て、土台と桁で結び、
// 柱の間に板壁（押縁の縦の桟）。茅葺きは軒の切り口が厚く（約 0.5m）、棟は杉皮で包んで押さえ木を X に組む（烏おどり）。
// 板葺き（o.ita）は薄い板を重ね、押さえの丸太と石。屋根は下ほど雨で黒ずみ、軒の際に苔（頂点の色）。
// 画質「低」は壁を面ごとに一枚・柱は隅と戸口だけ・棟の押さえは無し（面の数を増やさない）
const THATCH_V = lazy(() => liteMat({ vertexColors: true, map: thatchTex(), bumpMap: thatchTex(), bumpScale: 0.065, roughness: 0.97, metalness: 0, side: THREE.DoubleSide }));
const ITA_V = lazy(() => liteMat({ vertexColors: true, map: woodTex(), bumpMap: woodTex(), bumpScale: 0.035, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));
// 村の壁の陰・退色は頂点色へ焼いてある。高画質でも軽い共用材質で受ける。
const VILLAGE_WALL = lazy(() => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
const VILLAGE_WALL_LITE = lazy(() => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
const VILLAGE_THATCH = lazy(() => new THREE.MeshLambertMaterial({ map: thatchTex(), vertexColors: true }));
const VILLAGE_RIDGE = lazy(() => {
  const g = new THREE.CylinderGeometry(.28, .28, 1, 6, 1, false, 0, Math.PI);
  g.rotateZ(Math.PI / 2); return g;
});
// 入れる民家の小屋組は同じ角材の形から組み、既存の木部へまとめる。
const VILLAGE_ROOF_BEAM = lazy(() => new THREE.BoxGeometry(1, 1, 1));
// 板葺きの葺き重ね。一枚の小さな絵を全戦で共用し、板を一枚ずつ描かない。
const BOARD_ROOF = lazy(() => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#a49b87'; ctx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) for (let col = -1; col < 8; col++) {
    const x = col * 40 + (row % 2) * 20, y = row * 32;
    const tone = 138 + Math.floor(h01(row, col) * 48);
    ctx.fillStyle = `rgb(${tone},${tone - 9},${tone - 24})`; ctx.fillRect(x, y, 39, 32);
    for (let i = 0; i < 10; i++) {
      const gx = x + h01(row * 11 + i, col) * 38;
      ctx.fillStyle = i % 3 ? 'rgba(46,37,27,.14)' : 'rgba(224,214,188,.18)';
      ctx.fillRect(gx, y, 1, 32);
    }
    ctx.fillStyle = 'rgba(31,26,20,.65)'; ctx.fillRect(x, y + 29, 40, 3);
    ctx.fillStyle = 'rgba(229,217,191,.35)'; ctx.fillRect(x, y, 39, 1);
  }
  const map = new THREE.CanvasTexture(canvas); map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  return liteMat({ vertexColors: true, map, bumpMap: map, bumpScale: .025,
    roughness: .94, metalness: 0, side: THREE.DoubleSide });
});

// 板葺き共通の妻壁。板の奥に下地を残し、継ぎ目から空が透けないようにする。
// 梁・束・斜材は既存の木材へ結合し、寸法別の形だけ保存する。
const boardGableShapes = new Map();
function boardGableGeo(w, rise, pitch, bottom = 0, color = 0x776451) {
  const key = [w, rise, pitch, bottom, color].join(':');
  let shapes = boardGableShapes.get(key);
  if (shapes) return shapes;
  const top = x => rise - Math.abs(x) * pitch - .12;
  const panel = (a, b, z, hex) => {
    const outline = [new THREE.Vector2(a, bottom), new THREE.Vector2(b, bottom),
      new THREE.Vector2(b, top(b))];
    if (a < 0 && b > 0) outline.push(new THREE.Vector2(0, top(0)));
    outline.push(new THREE.Vector2(a, top(a)));
    const g = new THREE.ShapeGeometry(new THREE.Shape(outline));
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * .65, p.getY(i) * 1.6);
    g.translate(0, 0, z); return paint(g, hex);
  };
  const far = panel(-w / 2, w / 2, -.045, color), parts = [far.clone()];
  const count = Math.ceil(w / .6) * 2, step = w / count;
  for (let i = 0; i < count; i++) {
    const a = -w / 2 + i * step + .004;
    parts.push(panel(a, a + step - .008, -.025, vary(color, i + 11)));
  }
  const beam = (ax, ay, bx, by, thickness) => {
    const g = new THREE.BoxGeometry(Math.hypot(bx - ax, by - ay), thickness, .14);
    g.rotateZ(Math.atan2(by - ay, bx - ax));
    g.translate((ax + bx) / 2, (ay + by) / 2, .035); parts.push(paint(g, 0x514130));
  };
  beam(-w / 2 - .08, bottom + .08, w / 2 + .08, bottom + .08, .18);
  beam(0, bottom + .08, 0, top(0) - .04, .14);
  for (const side of [-1, 1]) beam(side * w * .32, bottom + .15, 0, top(0) * .65, .1);
  shapes = { near: mergeGeometries(parts), far };
  for (const g of parts) g.dispose();
  boardGableShapes.set(key, shapes); return shapes;
}

// 堂・屋敷にも使える板葺き。遠方も妻壁を残し、梁と板の細部だけ省く。
const boardRoofShapes = new Map();
export function timberRoof(x, y, z, w, d, rot = 0, o = {}) {
  const eave = o.eave ?? .7, pitch = o.pitch ?? .42, color = o.color ?? 0x8a7760;
  const key = [w, d, eave, pitch, color, SETTINGS.quality].join(':');
  let shapes = boardRoofShapes.get(key);
  if (!shapes) {
    const run = w / 2 + eave, rise = run * pitch, angle = Math.atan(pitch);
    const length = d + 2 * eave, roofParts = [], frame = [], farGables = [];
    const gable = boardGableGeo(w, rise, pitch, -.17);
    for (const side of [-1, 1]) {
      const near = gable.near.clone(), far = gable.far.clone();
      for (const g of [near, far]) {
        if (side < 0) g.rotateY(Math.PI);
        g.translate(0, 0, side * d / 2);
      }
      // 屋根面は番号付きなので、遠景の妻壁も同じ形式へそろえて結合する。
      far.setIndex(Array.from({ length: far.attributes.position.count }, (_, i) => i));
      frame.push(near); farGables.push(far);
    }
    for (const side of [-1, 1]) {
      const slab = roofSlab(length, Math.hypot(run, rise), .16, color, 0x494236, 17, true);
      slab.translate(Math.hypot(run, rise) / 2, -.08, 0);
      slab.rotateZ(-angle); if (side < 0) slab.rotateY(Math.PI);
      slab.translate(0, rise, 0); roofParts.push(slab);
      // 妻の破風と軒桁は、屋根から離さず下端へ沿わせる。
      for (const zz of [-length / 2 + .06, length / 2 - .06]) {
        const fascia = new THREE.BoxGeometry(Math.hypot(run, rise) + .06, .18, .12);
        fascia.rotateZ(-side * angle); fascia.translate(side * run / 2, rise / 2 - .09, zz);
        frame.push(paint(fascia, 0x514435));
      }
      const beam = new THREE.BoxGeometry(.16, .18, length);
      beam.translate(side * (w / 2 - .06), eave * pitch - .23, 0); frame.push(paint(beam, 0x44392d));
      if (true) {
        const count = Math.ceil(length / .6);
        for (let i = 0; i <= count; i++) frame.push(paint(logGeo(
          [0, rise - .22, -length / 2 + i * length / count],
          [side * (run - .06), -.18, -length / 2 + i * length / count], .045, .04, 4), 0x65513b));
      }
    }
    const ridge = new THREE.BoxGeometry(.28, .2, length + .12);
    ridge.translate(0, rise + .035, 0); frame.push(paint(ridge, 0x514435));
    shapes = { roof: mergeGeometries(roofParts), frame: mergeGeometries(frame) };
    const coarse = kitCoarse(shapes.roof);
    shapes.coarseRoof = mergeGeometries([coarse || shapes.roof, ...farGables]);
    if (coarse) coarse.dispose();
    for (const g of farGables) g.dispose();
    for (const part of [...roofParts, ...frame]) part.dispose();
    boardRoofShapes.set(key, shapes);
  }
  const lod = new THREE.LOD(), near = new THREE.Group();
  for (const [geometry, material] of [[shapes.roof, BOARD_ROOF()], [shapes.frame, MAT()]]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true; mesh.userData.camBlock = true; near.add(mesh);
  }
  const far = new THREE.Mesh(shapes.coarseRoof, BOARD_ROOF()); far.receiveShadow = true; far.userData.camBlock = true;
  lod.addLevel(near, 0); lod.addLevel(far, 55);
  lod.position.set(x, y, z); lod.rotation.y = rot;
  return lod;
}
// 板小屋の軒先：破風・鼻隠し・垂木を一つの形にし、同寸の長屋で使い回す。
// 高さは軒を原点にする。既存の壁材へ結合し、遠景は既存の粗い形へ落とす。
const hutEaveShapes = new Map();
function hutEaveGeo(w, d, eave, rh) {
  const key = [w, d, eave, rh].join(':');
  let geo = hutEaveShapes.get(key);
  if (!geo) {
    const parts = [], run = w / 2 + eave, length = d + 2 * eave;
    const angle = Math.atan2(rh, run), slope = Math.hypot(run, rh);
    const box = (bw, bh, bd, x, y, z, tilt, color) => {
      const g = new THREE.BoxGeometry(bw, bh, bd);
      g.rotateZ(tilt); g.translate(x, y, z); parts.push(paint(g, color));
    };
    for (const side of [-1, 1]) {
      // 妻の端を覆う破風と、雨に褪せた軒の木口。屋根の厚みへ直接つなぐ。
      for (const zz of [-length / 2, length / 2])
        box(slope + .08, .18, .11, side * run / 2, rh / 2 - .045, zz, -side * angle, 0x78644d);
      box(.12, .18, length, side * run, -.1, 0, 0, 0x65513e);
      // 壁の桁から軒へ出る短い垂木。屋根の裏で等間隔の陰と木口を作る。
      const count = Math.min(16, Math.max(2, Math.ceil(length / .65)));
      const start = w / 2 - .15, end = run - .07, mid = (start + end) / 2;
      for (let i = 0; i <= count; i++)
        box((end - start) / Math.cos(angle), .11, .075, side * mid,
          rh * (1 - mid / run) - .06, -length / 2 + .14 + i * (length - .28) / count,
          -side * angle, 0x594735);
    }
    geo = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    hutEaveShapes.set(key, geo);
  }
  return geo;
}
// 屋根の板（棟から軒へ下る一枚）：u を棟に沿わせ、v を流れに（茅の筋が流れに沿い、葺いた段が軒と平行に並ぶ）。
// 頂点の色：軒ほど雨で黒ずみ、軒の際に苔の緑をまだらに
const lappedRoofShapes = new Map();
function roofSlab(L, slope, th, ridgeHex, eaveHex, seed, weathered = false, roughThatch = false) {
  const lapped = weathered && true && !roughThatch;
  const key = lapped ? [L, slope, th, ridgeHex, eaveHex, seed].join(':') : null;
  if (key && lappedRoofShapes.has(key)) return lappedRoofShapes.get(key).clone();
  // 一段約四十センチの葺き足。段の直前と直後を分け、板の薄い木口を実際の面にする。
  const courses = Math.min(12, Math.max(3, Math.round(slope / .4)));
  const g = new THREE.BoxGeometry(slope, th, L, roughThatch ? 12 : lapped ? courses * 2 : 3, 1,
    roughThatch ? Math.min(32, Math.ceil(L / .28)) : Math.max(1, Math.round(L / 1.5)));
  const P = g.attributes.position, N = g.attributes.normal, uv = g.attributes.uv, n = P.count, col = new Float32Array(n * 3);
  const cR = new THREE.Color(ridgeHex), cE = new THREE.Color(eaveHex), cM = new THREE.Color(0x4a5232), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), t = Math.min(1, Math.max(0, x / slope + 0.5));   // t：0 = 棟・1 = 軒（負の端数で pow が NaN にならないよう挟む）
    uv.setXY(i, (z + y * 0.3) / 2.6, (x + y) / 2.2);
    // 近くの茅だけ、束の凹凸・葺き重ねの浅い段・不揃いな軒の切り口を作る。
    // 上下と側面の共有位置を同じ式で動かし、継ぎ目を開けない。
    if (roughThatch) {
      const bundle = Math.sin(z * 13.7 + seed) * .025 + Math.sin(z * 5.1 + seed) * .035;
      // 葺き足を二分割ずつで刻む。厚い束の丸みと重ね目を実際の面の陰影にする。
      const row = Math.round(t * 12), course = (row % 2 ? .045 : -.025) * Math.sin(t * Math.PI);
      P.setY(i, y + bundle * (.3 + t * .7) + course - Math.sin(t * Math.PI) * .055);
      P.setX(i, x + t * t * (.065 * Math.sin(z * 9.3 + seed) + .035 * Math.sin(z * 19.1)));
    }
    c.copy(cR).lerp(cE, Math.pow(t, 1.6));
    if (lapped) {
      const step = Math.round(t * courses * 2);
      const lip = step % 2 === 1;
      const row = Math.floor(step / 2);
      const edge = lip ? (row + 1) / courses - .006 / slope : row / courses;
      // 上下・妻の同じ頂点を同じ量だけ動かし、屋根の閉じた厚みを保つ。
      // 最後の軒だけもとの位置へ戻し、建物の輪郭と当たりを広げない。
      P.setX(i, (edge - .5) * slope);
      P.setY(i, y + (lip ? .028 : 0));
      // 模様の重ね目を実際の段へ合わせる。木目を斜面一杯へ引き伸ばさない。
      uv.setXY(i, z / 3.25, 1 - edge * courses / 8);
      if (!lip && row > 0 && row < courses && N.getY(i) > .5) c.multiplyScalar(.68);
      if (N.getY(i) < -.5 || N.getX(i) > .5) c.multiplyScalar(.7);
    }
    if (roughThatch) {
      // 切り口は乾いた束、軒裏は深い陰。専用材質や透過の毛束は増やさない。
      if (N.getX(i) > .5) {
        c.lerp(cR, .38).multiplyScalar(.78 + h01(Math.floor(z * 12) + seed, 4) * .24);
        uv.setXY(i, z * 1.8, y * 2.8);
      } else if (N.getY(i) < -.5) c.multiplyScalar(.57);
      else if (Math.abs(N.getZ(i)) > .5) c.multiplyScalar(.75);
    }
    // 指定した板葺きだけ、既存の頂点で古板の灰色と差し替え板の茶色を混ぜる。
    // 古板の色は共有の頂点色で付け、材質と描く回数は増やさない。
    if (weathered) {
      const band = h01(Math.floor((z + L / 2) / 1.5) + seed, 8);
      c.lerp(band > .8 ? cM.setHex(0x987650) : cM.setHex(0x777267), band > .8 ? .48 : .28);
      c.multiplyScalar(.78 + band * .32);
      cM.setHex(0x4a5232);
    }
    const m = t > 0.82 ? h01(Math.floor(z * 1.7) + seed, 4.4) * (t - 0.82) * 3 : 0;
    if (m > 0.25) c.lerp(cM, Math.min(0.6, m));
    c.multiplyScalar(0.9 + h01(Math.floor(z * 2.3) + seed, Math.floor(t * 5)) * 0.18);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (lapped) {
    g.computeVertexNormals();
    lappedRoofShapes.set(key, g.clone());
  }
  return g;
}
// 全戦共通の茅屋根。近景の形は寸法別に共有し、まとめ描きでも同じ茅束を使う。
// 遠景は通常の屋根では LOD、束では kitCoarse の二段階で面を減らす。
const thatchRoofShapes = new Map();
// 棟を屋根から浮いた半円と長い角木にせず、両勾配をまたぐ杉皮で納める。
// 寸法別の原形だけを保存。木・縄も既存の壁柱材質へまとめ、更新処理は持たない。
const thatchRidgeShapes = new Map();
function thatchRidgeGeo(L, angle, coarse) {
  const key = [L, angle, coarse].join(':');
  let geo = thatchRidgeShapes.get(key);
  if (geo) return geo;
  const parts = [], pitch = Math.tan(angle), width = .62;
  const count = coarse ? 1 : Math.max(2, Math.ceil(L / .8)), step = L / count;
  for (let i = 0; i < count; i++) {
    // 杉皮の端を少し重ね、下面も閉じる。頂部を丸めた六角の断面が屋根を包む。
    const edge = .26 - width * pitch;
    const outline = new THREE.Shape([
      new THREE.Vector2(-width, edge - .10), new THREE.Vector2(0, .16),
      new THREE.Vector2(width, edge - .10), new THREE.Vector2(width, edge),
      new THREE.Vector2(.12, .29), new THREE.Vector2(-.12, .29),
      new THREE.Vector2(-width, edge),
    ]);
    const g = new THREE.ExtrudeGeometry(outline, { depth: step + (coarse ? 0 : .05), bevelEnabled: false, steps: 1, curveSegments: 1 });
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const color = new Float32Array(p.count * 3), tone = new THREE.Color();
    for (let j = 0; j < p.count; j++) {
      const xx = p.getX(j), zz = p.getZ(j);
      // 棟頂は銀灰色、雨の落ちる端と重ね目は黒茶。木肌の粒径は全寸法でそろえる。
      tone.setHex(n.getY(j) < -.2 ? 0x302b24 : 0x887b68);
      tone.multiplyScalar((.86 + h01(i, 9) * .22) * (1 - Math.abs(xx) / width * .35));
      color[j * 3] = tone.r; color[j * 3 + 1] = tone.g; color[j * 3 + 2] = tone.b;
      uv.setXY(j, (zz + i * step) * .8, xx * 2);
    }
    g.setAttribute('color', new THREE.BufferAttribute(color, 3));
    g.translate(0, coarse ? 0 : (i % 3) * .009, -L / 2 + i * step);
    parts.push(g);
  }
  if (!coarse) {
    // 押さえ木は屋根に伏せ、縄で両側の縦木へ締める。遠方では束の簡略化で落ちる太さ。
    const railX = .52, railY = .30 - railX * pitch;
    for (const side of [-1, 1]) parts.push(paint(logGeo(
      [side * railX, railY, -L / 2], [side * railX, railY, L / 2], .045, .045, 5), 0x62543f));
    const ties = Math.max(2, Math.round(L / 1.2));
    for (let i = 0; i < ties; i++) {
      const zz = -L / 2 + (i + .5) * L / ties;
      for (const side of [-1, 1]) {
        parts.push(paint(logGeo([0, .36, zz], [side * .79, .32 - .79 * pitch, zz], .04, .035, 5), 0x79664b));
        // 二重の縄を棟頂から押さえ木へ密着させる。透過の絵や別材質は使わない。
        for (const offset of [-.028, .028]) parts.push(paint(logGeo(
          [0, .405, zz + offset], [side * .56, .37 - .56 * pitch, zz + offset], .013, .013, 4), 0xb09a71));
      }
    }
  }
  geo = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  thatchRidgeShapes.set(key, geo);
  return geo;
}
function thatchRoofGeo(L, slope, th, angle, rh) {
  const key = [L, slope, th, angle, rh].join(':');
  let geo = thatchRoofShapes.get(key);
  if (!geo) {
    const halves = [];
    for (const side of [1, -1]) {
      const g = roofSlab(L, slope, th, 0xd6ccbc, 0x958a7a, side > 0 ? 17 : 67, false, true);
      g.translate(slope / 2 - .15, -th / 2 + .05, 0);
      g.rotateZ(-angle); if (side < 0) g.rotateY(Math.PI);
      g.translate(0, rh + .05, 0);
      halves.push(g);
    }
    geo = mergeGeometries(halves);
    geo.computeVertexNormals();
    for (const half of halves) half.dispose();
    thatchRoofShapes.set(key, geo);
  }
  return geo;
}
// 茅葺きの妻の木組み。屋根を受ける登り梁と煙出しを寸法別に共有する。
// 壁柱の束へ結合し、遠くでは梁二本と暗い煙出しだけに戻す。
const thatchGableShapes = new Map();
function thatchGableGeo(w, rh, angle, th, openSmoke = false) {
  const key = [w, rh, angle, th, openSmoke].join(':');
  let shapes = thatchGableShapes.get(key);
  if (!shapes) {
    const near = [], far = [];
    const box = (parts, bw, bh, bd, x, y, z, tilt, hex) => {
      const g = new THREE.BoxGeometry(bw, bh, bd);
      g.rotateZ(tilt); g.translate(x, y, z); parts.push(paint(g, hex));
    };
    const peak = rh + .1 + .15 * Math.tan(angle) - th / Math.cos(angle) - .08;
    const edge = peak - w / 2 * Math.tan(angle);
    for (const parts of [near, far]) {
      for (const side of [-1, 1]) {
        box(parts, Math.hypot(w / 2, peak - edge), .14, .18,
          side * w / 4, (peak + edge) / 2, .035, -side * angle, 0x62503b);
      }
      if (!openSmoke) box(parts, .76, .48, .045, 0, rh * .62, -.025, 0, 0x1e1912);
    }
    // 入れる民家の煙出しは、裏を黒い板で塞がない。妻壁の内面まで木の見込みでつなぐ。
    if (openSmoke) for (const parts of [near, far]) {
      if (parts === far) for (const yy of [-.15, 0, .15]) box(parts, .76, .055, .12, 0, rh * .62 + yy, .055, .06, 0x8a7556);
      for (const side of [-1, 1]) box(parts, .065, .61, .28, side * .41, rh * .62, -.02, 0, 0x79644a);
      for (const yy of [-.28, .28]) box(parts, .9, .075, .28, 0, rh * .62 + yy, -.02, 0, 0x5b4934);
    }
    // 束柱を避けて左右へ開く煙出し。奥の暗がりと手前の桟を分け、絵の黒い四角にしない。
    if (!openSmoke) {
      for (const side of [-1, 1]) box(near, .065, .61, .13, side * .41, rh * .62, .045, 0, 0x79644a);
      for (const yy of [-.28, .28]) box(near, .9, .075, .15, 0, rh * .62 + yy, .045, 0, 0x5b4934);
    }
    for (const yy of [-.15, 0, .15]) box(near, .76, .055, .12, 0, rh * .62 + yy, .055, .06, 0x8a7556);
    // 煙出しの下で左右の登り梁をつなぐ貫。壁を奥へ下げた分だけ木口と陰が見える。
    const tieY = Math.min(rh * .36, peak - .2);
    const tieW = Math.min(w, 2 * (peak - tieY) / Math.tan(angle));
    box(near, tieW, .13, .16, 0, tieY, .04, 0, 0x594632);
    shapes = { near: mergeGeometries(near), far: mergeGeometries(far) };
    for (const part of [...near, ...far]) part.dispose();
    thatchGableShapes.set(key, shapes);
  }
  return shapes;
}
// 土壁は均一な板でなく、柱際へ薄く引き込んだ手塗りの面にする。
// 寸法ごとの形と陰を共有し、遠くでは元の箱へ戻す。輪郭と当たりの範囲は広げない。
const earthWallShapes = new Map();
function earthWallGeo(w, h) {
  const key = [w, h].join(':');
  let geo = earthWallShapes.get(key);
  if (!geo) {
    geo = new THREE.BoxGeometry(w, h, .06, Math.max(2, Math.ceil(w / .32)),
      Math.max(2, Math.ceil(h / .32)), 1);
    const p = geo.attributes.position, shade = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const edge = Math.min(w / 2 - Math.abs(x), h / 2 - Math.abs(y));
      const inset = Math.max(0, 1 - edge / .14);
      const swell = Math.sin((x + w / 2) * 5.3) * Math.sin((y + h / 2) * 4.1);
      // 柱の縁は薄く、中央にこて跡の浅いうねり。裏表とも同じ式で閉じる。
      p.setZ(i, Math.sign(z) * (.022 - .012 * inset + .007 * swell));
      const foot = Math.max(0, 1 - (y + h / 2) / .65);
      const patch = .5 + .5 * Math.sin(x * 6.1 + Math.sin(y * 3.7));
      const light = (1 - inset * .22) * (1 - foot * (.16 + .12 * patch))
        * (.96 + .04 * swell);
      shade[i * 3] = light; shade[i * 3 + 1] = light; shade[i * 3 + 2] = light;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
    geo.computeVertexNormals();
    earthWallShapes.set(key, geo);
  }
  return geo.clone();
}
export function hut(world, x, z, w, d, rot = 0, o = {}) {
  // 姉川の外戸は壁から三十六センチ外に二筋の溝を持つ。
  // 外側の戸と敷居（壁から五十三センチ）を平らな踏み板で受け、段はその先へ置く。
  const entryPad = SETTINGS.quality === 'high' && o.interior?.profile === 'anegawa' ? .65 : .25;
  // 土台は四隅でいちばん高い地面に合わせる（低い隅は束で埋める）。真ん中だけで決めると、斜面で家が地面に埋まって傾いて見える（A027）
  let y = world.heightAt(x, z);
  for (const [cx, cz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) y = Math.max(y, world.heightAt(x + cx * Math.cos(rot) + cz * Math.sin(rot), z - cx * Math.sin(rot) + cz * Math.cos(rot)));
  if (SETTINGS.quality === 'high' && o.interior?.profile === 'anegawa') {
    // 姉川の館・番小屋・民家は床下全体と戸口の踊り場も測る。
    // 四隅の間の盛り上がりで板間や敷居が埋まらないよう、外装と室内を一緒に上げる。
    // 設営時だけ地面を読み、形・材質や毎コマの処理は増やさない。
    const c = Math.cos(rot), s = Math.sin(rot);
    const nx = Math.max(1, Math.ceil(w)), nz = Math.max(1, Math.ceil(d));
    for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
      const lx = -w / 2 + w * ix / nx, lz = -d / 2 + d * iz / nz;
      y = Math.max(y, world.heightAt(x + lx * c + lz * s, z - lx * s + lz * c));
    }
    // 開いた外戸は戸口の左右へ引かれる。中央の踏み板だけでなく、
    // 敷居の端の戸当たりと束石まで測り、斜面が引き込み先へ食い込まない高さにする。
    // 戸口一・二五＋引き増し・戸当たり〇・〇五五＋束石の半幅〇・一一。
    const sillHalf = 1.25 + .055 + .11, sillCols = Math.ceil(sillHalf * 2 / .5);
    for (let iz = 0; iz <= 3; iz++) for (let ix = 0; ix <= sillCols; ix++) {
      const lx = -sillHalf + sillHalf * 2 * ix / sillCols;
      const lz = (d - .18) / 2 + iz * (entryPad + .1) / 3;
      y = Math.max(y, world.heightAt(x + lx * c + lz * s, z - lx * s + lz * c));
    }
  }
  if (o.interior?.profile === 'iga') {
    // 入れる伊賀の建物は、四隅の間の盛り上がりも測る。
    // 戸口を含む床全体を同じ高さへ上げ、地面が板間や敷居を突き抜けるのを防ぐ。
    // 外壁・室内・入口の段は下の共通の y を使う。設営時だけ調べる。
    const c = Math.cos(rot), s = Math.sin(rot);
    const nx = Math.ceil(w / .5), nz = Math.ceil(d / .5);
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const lx = -w / 2 + w * i / nx, lz = -d / 2 + d * j / nz;
      y = Math.max(y, world.heightAt(x + lx * c + lz * s, z - lx * s + lz * c));
    }
  }
  if (o.solid !== false && !o.interior) {
    const s = solidRect(x, z, w + 0.18, d + 0.18, rot);
    // 民家の外にだけ里の者を置く。倉・陣屋には置かない。まとめて描く家も同じ印を持つ。
    if (!o.ita && o.h === undefined && o.minka !== false) s.civilianSite = 'home';
  }
  const parts = [];
  const H = o.h || 2.6;
  const lo = false;
  const nodaHome = SETTINGS.quality === 'high' && o.interior?.profile === 'nodafukushima' && o.interior.kind === 'minka';
  // 河口の民家の採光は推定復元。背面の小窓を外壁・室内・板戸で共用する。
  // 寺の紙障子を流用せず、格子の内側に雨戸を引く。寸法は床高から測る。
  const homeWindows = nodaHome ? [{ face: 'z', s: -1, t: 0, w: .9, y0: 1, y1: 1.65,
    outerLattice: { divisions: 4, width: .04, depth: .08, offset: .09 } }] : [];
  if (nodaHome) {
    // 背面の小窓だけでは炉のある板間の横が塞がる。側面にも格子窓を設ける推定復元。
    // 炉と煙抜きのある左手は壁を保ち、右手の板間だけへ採光する。
    // 内装と同じ内寸・土間境を使い、全開の板戸と両端の竪枠まで一室へ納める。
    const innerD = d - .18, cut = innerD / 2 - Math.min(2, innerD * .42);
    const span = cut + innerD / 2, width = Math.min(.8, (span - .7) / 2);
    if (width >= .5) homeWindows.push({ face: 'x', s: 1, t: (-innerD / 2 + cut) / 2,
      w: width, y0: 1, y1: 1.65,
      outerLattice: { divisions: 4, width: .04, depth: .08, offset: .09 } });
    // 炊事土間にも明かり取りを設ける推定復元。炉のある板間と離した左の高窓にし、
    // 薪・作業台より上で採光する。紙障子でなく共通の板戸を横へ滑らせる。
    // 二倍幅の引き代と竪枠を土間の内寸へ納め、玄関の戸と間仕切りには重ねない。
    // 一面一窓の外壁の組み立てと同じ定義を、室内・格子・開閉の当たりにも渡す。
    const earthSpan = innerD / 2 - cut, earthWidth = Math.min(.65, (earthSpan - .7) / 2);
    if (earthWidth >= .5) homeWindows.push({ face: 'x', s: -1, t: (cut + innerD / 2) / 2,
      w: earthWidth, y0: 1.2, y1: 1.85, doorKind: 'itado',
      outerLattice: { divisions: 4, width: .04, depth: .08, offset: .09 } });
  }
  // 伊賀の館は室内の土壁と外の仕上げをそろえる推定復元。陣小屋の板張りとは分ける。
  const igaPlaster = o.interior?.profile === 'iga' && o.interior.kind === 'yashiki';
  const wallHex = igaPlaster ? 0xb2a58b : o.wall || (o.ita ? 0x7e7464 : 0x86705a);
  const postHex = 0x55463a, sillHex = 0x4a3d30, sd0 = Math.round(x * 3.7 + z * 5.3);
  const perim = [[-w / 2, -d / 2, w / 2, -d / 2], [w / 2, -d / 2, w / 2, d / 2], [w / 2, d / 2, -w / 2, d / 2], [-w / 2, d / 2, -w / 2, -d / 2]];
  const DOOR = 1.25;   // 戸口の幅（+z の面の真ん中）
  // 姉川は徒歩の体の高さ（一・七メートル）に余裕を取る。
  // 外壁・鴨居・動く戸で床上の内法を共有し、開けたのに頭がつかえる戸口を作らない。
  const doorHeight = o.interior?.profile === 'anegawa' ? 1.85 : 1.65;
  const doorTop = .25 + doorHeight;
  // 姉川の民家の格子窓は暗い板を貼るだけにせず、外壁と内壁に同じ穴を開ける。
  // 窓の位置は設営時に一度作り、室内の採光と当たりにも渡す。
  const anegawaWindows = SETTINGS.quality === 'high' && o.groundedHome && !o.ita
    && o.interior?.profile === 'anegawa' && o.interior.kind === 'minka' && w >= 4
    ? [
      { face: 'z', s: 1, t: -w * .3, w: .88, y0: 1.095, y1: 1.745 },
      { face: 'z', s: -1, t: 0, w: .85, y0: 1.175, y1: 1.825 },
      { face: 'x', s: -1, t: 0, w: .85, y0: 1.175, y1: 1.825 },
      { face: 'x', s: 1, t: 0, w: .85, y0: 1.175, y1: 1.825 },
    ] : SETTINGS.quality === 'high' && o.interior?.profile === 'anegawa'
      && ['yashiki', 'kura', 'bansho', 'nagaya'].includes(o.interior.kind)
      // 館・番小屋・板倉・南の宿小屋の採光窓は用途からの推定。奥の両側に小さな格子窓を置く。
      // 外壁・室内・当たりが同じ開口を読み、閉じた戸の奥も外光が届くようにする。
      ? [-1, 1].map(s => ({ face: 'x', s, t: -d * .18, w: .8, y0: 1.45, y1: 1.95 })) : null;
  const villageInterior = SETTINGS.quality === 'high' && o.interior?.profile === 'shitaragahara';
  if (villageInterior) {
    // 四隅より高い畦や斜面の膨らみも土間の下へ収める。
    // 戸口と敷地の内側を一メートル以内の間隔で測り、外観と室内の基準高を共用する。
    // 設営時だけ調べる。床や地形の当たりを消して出入りさせない。
    const cols = Math.max(1, Math.ceil(w)), rows = Math.max(1, Math.ceil(d));
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) {
      const lx = -w / 2 + w * i / cols, lz = -d / 2 + d * j / rows;
      y = Math.max(y, world.heightAt(x + lx * c + lz * s, z - lx * s + lz * c));
    }
  }
  // 入れる民家の床・板戸・鴨居は同じ高さを使う。外だけ固定値にすると戸の上端とずれる。
  // 徒歩の通行判定は体高一・七メートル。開いた板戸でも鴨居に当たらない高さを残す。
  // 設楽原の高画質だけ六尺ほどにし、外の鴨居・動く戸・壁の当たりで共有する。
  const interiorDoorH = o.interior?.profile === 'iga' ? 1.85 : villageInterior ? 1.8 : 1.65, interiorFloorY = .25;
  const lintelY = (villageInterior || o.interior?.profile === 'iga') ? interiorFloorY + interiorDoorH + .06 : 1.95;
  // 集落の民家にも採光口を設ける。戸口を避けた両端の柱間に納め、内外で同じ寸法を使う。
  const windowBay = w / Math.max(1, Math.round(w / 1.8));
  // 隅柱は内寸から十六センチ内側にも立つ。柱の内面（三十三センチ）に
  // 障子の縦枠と余白を足し、窓の両端を柱芯から四十二センチ離す。
  // 外壁の穴・見込み枠・動く障子は、この幅を共用する。
  const villageWindowW = Math.min(1.2, windowBay - .84);
  const villageWindows = villageInterior ? [-1, 1].map(side => ({
    face: 'z', s: 1, t: side * (w - windowBay) / 2, w: villageWindowW,
    y0: .8, y1: 1.6, shoji: true, sliding: true, exteriorLattice: true,
  })) : [];
  // 奥座敷の左右にも明かり障子を置く推定復元。片隅だけの採光にせず、
  // 中央と隅の柱を避けた二つの柱間へ納める。外壁の開口・木枠・室内の
  // 動く戸は同じ窓を使い、紙戸の形と材質も既存と共有する。
  if (villageInterior) for (const side of [-1, 1]) villageWindows.push({
    face: 'z', s: -1, t: side * (w - windowBay) / 2, w: villageWindowW,
    y0: .8, y1: 1.6, shoji: true, sliding: true, exteriorLattice: true,
  });
  // 伊賀の戸口は徒歩の体高と敷居を通せる高さにする。馬は頭上の当たりで止める。
  // 外の鴨居・小壁と室内の引き戸へ、同じ開口高を渡す。
  const igaEntry = o.interior?.profile === 'iga';
  // 伊賀の背面に明かり取り。柱一間の中央に置き、外壁と室内で同じ穴を使う。
  // 個別の窓位置は不明のため推定。貫より上に小さな格子窓を納める。
  const igaBay = Math.max(1, Math.round(w / 1.8));
  const igaWindow = o.interior?.profile === 'iga' ? {
    face: 'z', s: -1, t: -w / 2 + (Math.floor(igaBay / 2) + .5) * w / igaBay,
    w: .7, y0: 1.4, y1: 2,
  } : null;
  const box = (hex, px, py, pz, bw, bh, bd, ry = 0, earth = false) => {
    const b = earth ? earthWallGeo(bw, bh) : new THREE.BoxGeometry(bw, bh, bd);
    // 伊賀の縦板・柱は上下、土台・桁・窓枠は長手へ木目を通す。
    // 回して束ねる前に貼り、壁全体の座標で横木まで縦板にしない。
    const igaGrain = igaEntry && !igaPlaster && !earth
      && (bh <= .24 || bw <= .24 && bd <= .3);
    if (igaGrain) {
      const p = b.attributes.position, n = b.attributes.normal, uv = b.attributes.uv;
      const vertical = bh > .24 && (bd < .2 || bh >= Math.max(bw, bd));
      const alongX = bw >= bd;
      for (let i = 0; i < p.count; i++) {
        const across = vertical ? Math.abs(n.getZ(i)) >= Math.abs(n.getX(i)) ? p.getX(i) : p.getZ(i)
          : Math.abs(n.getY(i)) > .5 ? alongX ? p.getZ(i) : p.getX(i) : p.getY(i);
        const along = vertical ? p.getY(i) : alongX ? p.getX(i) : p.getZ(i);
        uv.setXY(i, across / 2.6, along / 2.6);
      }
    }
    if (o.groundedHome) {
      // 面の大きさに合わせて土壁の粒を貼り、長い壁にも同じ粒径を保つ。
      const p = b.attributes.position, n = b.attributes.normal, uv = b.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i,
        (Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) + pz : p.getX(i) + px) * 1.4,
        (Math.abs(n.getY(i)) > 0.5 ? p.getZ(i) + pz : p.getY(i) + py) * 1.4);
    }
    if (ry) b.rotateY(ry); b.translate(px, py, pz);
    let g;
    if (earth) {
      g = b.toNonIndexed(); b.dispose();
      const color = new THREE.Color(hex), shades = g.attributes.color;
      for (let i = 0; i < shades.count; i++) {
        const s = shades.getX(i); shades.setXYZ(i, color.r * s, color.g * s, color.b * s);
      }
      const coarse = box(hex, px, py, pz, bw, bh, bd, ry);
      parts.pop();
      g.userData.homeCoarse = coarse;
    } else g = paint(b, hex);
    g.userData.homeTimber = true; g.userData.igaGrain = igaGrain; parts.push(g); return g;
  };
  let k = 0;
  for (const [ax, az, bx, bz] of perim) {
    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
    const front = az === d / 2 && bz === d / 2;
    const faceSide = az === bz ? Math.sign(az) : 0;
    const faceWindows = villageWindows.filter(v => v.s === faceSide);
    const backWindow = nodaHome ? homeWindows.find(v => v.face === 'z'
      ? az === v.s * d / 2 && bz === az : ax === v.s * w / 2 && bx === ax) : null;
    const tx = (bx - ax) / len, tz = (bz - az) / len;
    const face = az === bz ? 'z' : 'x', side = Math.sign(face === 'z' ? az : ax);
    const windows = anegawaWindows?.filter(v => v.face === face && v.s === side) || [];
    const windowCuts = windows.map(v => {
      const center = face === 'z' ? (v.t - ax) / tx : (v.t - az) / tz;
      return { t0: center - v.w / 2, t1: center + v.w / 2, y0: v.y0 - .25, y1: v.y1 - .25 };
    });
    const windowU = backWindow ? (backWindow.t - (backWindow.face === 'z' ? ax : az)) / (backWindow.face === 'z' ? tx : tz) : len / 2;
    // 柱の間（一間ごと）。戸口の面は真ん中を空ける
    const nb = lo ? 1 : Math.max(1, Math.round(len / 1.8));
    const cuts = [];
    for (let i = 0; i < nb; i++) cuts.push([i * len / nb, (i + 1) * len / nb]);
    const spans = [];
    for (const [s0, s1] of cuts) {
      if (front && s0 < (len + DOOR) / 2 && s1 > (len - DOOR) / 2) {
        if ((len - DOOR) / 2 - s0 > 0.05) spans.push([s0, (len - DOOR) / 2]);
        if (s1 - (len + DOOR) / 2 > 0.05) spans.push([(len + DOOR) / 2, s1]);
      } else spans.push([s0, s1]);
    }
    for (const [s0, s1] of spans) {
      const m = (s0 + s1) / 2, L = s1 - s0, px = ax + tx * m, pz = az + tz * m;
      const window = igaWindow && az === -d / 2 && bz === -d / 2 ? igaWindow : null;
      // 板壁（腰の 0.25m は土台に任せる）。少し内へ下げ、柱と土台の面が前へ出る
      if (nodaHome || o.interior?.profile === 'anegawa') {
      const color = vary(wallHex, k++ + sd0);
      const panels = o.interior?.profile === 'anegawa' ? facePanels(L, H - .35, windowCuts.map(v => ({ ...v, t0: v.t0 - m, t1: v.t1 - m }))) : backWindow ? facePanels(L, H - .35, [{
        t0: windowU - backWindow.w / 2 - m, t1: windowU + backWindow.w / 2 - m,
        y0: backWindow.y0, y1: backWindow.y1 }]) : [[-L / 2, L / 2, 0, H - .35]];
      for (const [a, b, low, high] of panels) {
        const along = m + (a + b) / 2;
        const panel = box(color, ax + tx * along, .25 + (low + high) / 2, az + tz * along,
          b - a + .01, high - low, .06, ry, o.groundedHome && true && !o.batch);
        if (o.groundedHome) {
          panel.userData.homeWall = true;
          if (panel.userData.homeCoarse) panel.userData.homeCoarse.userData.homeWall = true;
        }
      }
      } else {
      const earth = (o.groundedHome || igaPlaster) && !o.batch;
      const markWall = panel => {
        if (!o.groundedHome) return;
        panel.userData.homeWall = true;
        if (panel.userData.homeCoarse) panel.userData.homeCoarse.userData.homeWall = true;
      };
      if (villageInterior && faceWindows.length) {
        // 窓の高さは室内床（地面から二十五センチ）を基準にそろえる。
        const holes = faceWindows.map(v => ({ t0: v.t - v.w / 2 - px, t1: v.t + v.w / 2 - px,
          y0: v.y0, y1: v.y1 }));
        const color = vary(wallHex, k++ + sd0);
        for (const [a, b, low, high] of facePanels(L, H - .35, holes))
          markWall(box(color, px + (a + b) / 2, .25 + (low + high) / 2, pz,
            b - a, high - low, .06, 0, earth));
      } else if (window) {
        const holes = [{ t0: window.t - window.w / 2 - px, t1: window.t + window.w / 2 - px,
          y0: window.y0, y1: window.y1 }];
        for (const [a, b, low, high] of facePanels(L + .01, H - .35, holes))
          box(vary(wallHex, k + sd0), px + (a + b) / 2, .25 + (low + high) / 2,
            pz, b - a, high - low, .06, ry, igaPlaster);
        k++;
      } else {
        markWall(box(vary(wallHex, k++ + sd0), px, .25 + (H - .35) / 2, pz,
          L + .01, H - .35, .06, ry, earth));
      }
      }
      // 塗り壁には板壁の押縁を貼らず、一間ごとの柱と貫で面を受ける。
      if (!lo && !o.groundedHome && !igaPlaster) for (let q = 1; q < Math.round(L / 0.45); q++) {
        const u = s0 + q * L / Math.round(L / 0.45), qx = ax + tx * u, qz = az + tz * u;
        if (windowCuts.some(v => u > v.t0 - .04 && u < v.t1 + .04)) continue;
        if (backWindow && Math.abs(u - windowU) < backWindow.w / 2 + .06) continue;
        if (villageInterior && faceWindows.some(v => Math.abs(qx - v.t) < v.w / 2 + .03)) continue;
        const bands = window && Math.abs(qx - window.t) < window.w / 2 + .025
          ? [[.25, .25 + window.y0], [.25 + window.y1, H - .15]] : [[.275, H - .125]];
        for (const [low, high] of bands)
          box(vary(0x6a5a48, q + k), qx, (low + high) / 2, qz, .05, high - low, .09, ry);   // 押縁（縦の桟）
      }
    }
    // 柱（一間ごと・隅・戸口の脇）と礎石
    const postAt = new Set([0, len]);
    if (!lo) for (let i = 1; i < nb; i++) postAt.add(i * len / nb);
    if (front) { postAt.add((len - DOOR) / 2 - 0.08); postAt.add((len + DOOR) / 2 + 0.08); }
    for (const v of windowCuts) { postAt.add(v.t0 - .08); postAt.add(v.t1 + .08); }
    // 窓の上下を横木で受ける。左右の柱とともに既存の外壁へ結合する。
    if (o.interior?.profile === 'anegawa' && !o.groundedHome) for (const v of windowCuts) {
      const u = (v.t0 + v.t1) / 2;
      for (const py of [v.y0 + .21, v.y1 + .29])
        box(sillHex, ax + tx * u, py, az + tz * u, v.t1 - v.t0 + .2, .08, .14, ry);
    }
    const igaUnderposts = igaEntry ? [] : null;
    if (backWindow) for (const side of [-1, 1]) postAt.add(windowU + side * (backWindow.w / 2 + .08));
    for (const u of postAt) {
      // 設楽原の民家の隅柱は、次の壁の始点で一本だけ立てる。
      // 同じ隅に色の違う柱・束・礎石を重ねず、四方の壁と桁を一本で受ける。
      // 始点は必ず残すので、戸口脇や一間ごとの柱は欠かさない。
      if (villageInterior && u === len) continue;
      if (front && u > (len - DOOR) / 2 && u < (len + DOOR) / 2) continue;
      if (windowCuts.some(v => u > v.t0 - .07 && u < v.t1 + .07)) continue;
      if (backWindow && Math.abs(u - windowU) < backWindow.w / 2 + .06) continue;
      const px = ax + tx * u, pz = az + tz * u;
      box(vary(postHex, Math.round(u * 7) + k), px, (H + 0.2) / 2 + 0.05, pz, 0.16, H + 0.1, 0.16);
      // 斜面に建つ時：柱の下の地面が低ければ、束（床下の柱）を地面まで下ろして根石を置く（宙に浮いた小屋にしない）
      const wxp = x + px * Math.cos(rot) + pz * Math.sin(rot), wzp = z - px * Math.sin(rot) + pz * Math.cos(rot), gy = world.heightAt(wxp, wzp) - y;
      if (igaUnderposts) igaUnderposts.push(u);
      if (gy < -0.15) box(vary(postHex, Math.round(u * 5) + k), px, gy / 2, pz, 0.18, -gy + 0.1, 0.18);
      if (!lo || o.groundedHome) { const st = new THREE.DodecahedronGeometry(0.2, 0); st.scale(1.3, 0.5, 1.3); st.translate(px, Math.min(0, gy), pz); parts.push(flat(st, vary(0x7d786c, Math.round(u * 13)))); }
    }
    // 伊賀の斜面の床下は、長い束を足固めの貫で結ぶ推定復元。
    // 地面の高い側へ材を埋めず、戸口と入口の段の下は空ける。
    // 柱と同じ静止した束・材質へ焼き込み、毎コマの処理は増やさない。
    if (igaUnderposts) {
      igaUnderposts.sort((a, b) => a - b);
      const c = Math.cos(rot), s = Math.sin(rot);
      for (let i = 1; i < igaUnderposts.length; i++) {
        const a = igaUnderposts[i - 1], b = igaUnderposts[i];
        if (front && a < (len + DOOR) / 2 && b > (len - DOOR) / 2) continue;
        let groundTop = -Infinity;
        const samples = Math.max(1, Math.ceil((b - a) / .25));
        for (let j = 0; j <= samples; j++) {
          const u = a + (b - a) * j / samples, px = ax + tx * u, pz = az + tz * u;
          groundTop = Math.max(groundTop, world.heightAt(x + px * c + pz * s, z - px * s + pz * c) - y);
        }
        // 根石からも離し、床下に十分な高さがある柱間だけ納める。
        if (groundTop > -.55) continue;
        const tieY = groundTop + .25, mid = (a + b) / 2;
        box(sillHex, ax + tx * mid, tieY, az + tz * mid, b - a + .18, .1, .08, ry);
        for (const u of [a, b]) for (const side of [-1, 1])
          box(postHex, ax + tx * u + side * tz * .096, tieY,
            az + tz * u - side * tx * .096, .022, .022, .016, ry);
      }
    }
    // 土台（柱の根を結ぶ横木）と、軒の桁
    if (villageInterior && front) {
      // 土間の板戸の下へ高い土台を渡さない。戸口だけは下の低い敷居で受ける。
      // 土台は左右の壁の下に残し、開けた時にも土間まで歩いて入れる形にする。
      for (const side of [-1, 1]) {
        const span = (len - DOOR) / 2;
        box(sillHex, side * (len + DOOR) / 4, .14, d / 2, span, .2, .18);
      }
    } else box(sillHex, ax + tx * len / 2, 0.14, az + tz * len / 2, len + 0.1, 0.2, 0.18, ry);
    if (o.groundedHome) {
      // 一枚の灰色の帯をやめ、地面へ埋まる不揃いの根石と土の裾を同じ束へ入れる。
      const n = Math.ceil(len / 0.65), nx = tz, nz = -tx;
      const ground = (px, pz) => world.heightAt(x + px * Math.cos(rot) + pz * Math.sin(rot),
        z - px * Math.sin(rot) + pz * Math.cos(rot)) - y;
      for (let j = 0; j < n; j++) {
        const u = (j + 0.5) * len / n, px = ax + tx * u, pz = az + tz * u;
        const bottom = Math.min(0, ground(px, pz)) - .1, top = .12 + .025 * Math.sin(j * 3.7 + sd0);
        const stone = box(vary(0x80745f, j + k), px, (bottom + top) / 2, pz,
          len / n + .035, top - bottom, .3 + .035 * Math.sin(j * 2.3), ry);
        stone.userData.homeTimber = false;
      }
      // 三本の帯で地形へなじませる。外縁は地面へ潜らせ、四角い敷物の縁を残さない。
      const apron = new THREE.PlaneGeometry(len, 1, n, 3), pos = apron.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const u = pos.getX(j) + len / 2, t = pos.getY(j) + .5;
        const reach = t * (0.8 + .12 * Math.sin(u * 4.3 + sd0));
        const px = ax + tx * u + nx * reach, pz = az + tz * u + nz * reach;
        pos.setXYZ(j, px, ground(px, pz) + .13 * (1 - t) * (1 - t) - .025 * t, pz);
      }
      apron.computeVertexNormals(); parts.push(paint(apron, 0x75674e));
      if (!lo) for (let j = 0; j < n; j++) {
        const u = (j + .4) * len / n, reach = .3 + .25 * Math.sin(j * 7 + sd0) ** 2;
        // 戸口には草を生やさず、軒下に短い落ち藁と草の株を交互に残す。
        if (front && Math.abs(u - len / 2) < .9) continue;
        const px = ax + tx * u + nx * reach, pz = az + tz * u + nz * reach, gy = ground(px, pz) + .06;
        if (j % 3) box(0xa28e5f, px, gy, pz, .19, .012, .025, j * 2.3);
        else for (const side of [-1, 1]) {
          const blade = new THREE.ConeGeometry(.045, .22, 3);
          blade.rotateZ(side * .3); blade.translate(px + side * .04, gy + .08, pz);
          parts.push(paint(blade, 0x72734d));
        }
      }
      // 入れる姉川の家は、開口ごとの四方枠・連子・横貫を室内側で一組作る。
      // 古い中央固定の飾りを残すと格子が二重になり、宿小屋の裏の土壁にも窓が付いてしまう。
      if (!front && !anegawaWindows && !nodaHome) {
        box(0x453d30, ax + tx * len / 2, 1.5, az + tz * len / 2, 0.85, 0.65, 0.1, ry);
        for (const offset of [-0.3, 0, 0.3]) box(0xaa9575, ax + tx * (len / 2 + offset), 1.5, az + tz * (len / 2 + offset), 0.06, 0.7, 0.13, ry);
      }
    }
    if (backWindow) {
      const v = backWindow, lattice = v.outerLattice;
      for (const yy of [v.y0 + .22, v.y1 + .28])
        box(postHex, ax + tx * windowU, yy, az + tz * windowU, v.w + .16, .06, .14, ry);
      for (let j = 0; j <= lattice.divisions; j++) {
        const u = windowU - v.w / 2 + v.w * j / lattice.divisions;
        box(postHex, ax + tx * u, .25 + (v.y0 + v.y1) / 2, az + tz * u,
          lattice.width, v.y1 - v.y0, lattice.depth, ry);
      }
    }
    box(0x4c3e30, ax + tx * len / 2, H - 0.05, az + tz * len / 2, len + 0.24, 0.2, 0.2, ry);
    if (!lo) {
      if (o.interior?.profile === 'anegawa') {
      // 姉川の入れる家は、貫を戸口の両脇で止める。顔の高さに横木を渡さない。
      const spans = front && o.interior?.profile === 'anegawa'
        ? [[0, (len - DOOR) / 2], [(len + DOOR) / 2, len]] : [[0, len]];
      for (const [a, b] of spans) {
        const mid = (a + b) / 2;
        const holes = windowCuts.map(v => ({ ...v, t0: v.t0 - mid, t1: v.t1 - mid,
          y0: v.y0 + .25 - (H * .55 - .05), y1: v.y1 + .25 - (H * .55 - .05) }));
        for (const [p0, p1, low, high] of facePanels(b - a, .1, holes))
          box(0x4c3e30, ax + tx * (mid + (p0 + p1) / 2), H * .55 - .05 + (low + high) / 2,
            az + tz * (mid + (p0 + p1) / 2), p1 - p0, high - low, .1, ry);
      }
      } else {
      // 入れる民家の貫は戸口の両脇で止める。動く板戸の前へ横木を渡さない。
      if (villageInterior && (front || faceWindows.length)) {
        const holes = faceWindows.map(v => ({ t0: v.t - v.w / 2, t1: v.t + v.w / 2, y0: 0, y1: .1 }));
        if (front) holes.push({ t0: -DOOR / 2, t1: DOOR / 2, y0: 0, y1: .1 });
        for (const [a, b] of facePanels(len, .1, holes))
          box(0x4c3e30, (a + b) / 2, H * .55, faceSide * d / 2, b - a, .1, .1);
      } else {
      // 伊賀の入れる小屋・館は戸口を貫で横切らない。引き戸の前を空け、左右の柱へ納める。
      const nukiSpans = nodaHome && backWindow
        ? [[0, windowU - backWindow.w / 2], [windowU + backWindow.w / 2, len]]
        : front && (o.interior?.profile === 'iga' || nodaHome)
        ? [[0, (len - DOOR) / 2], [(len + DOOR) / 2, len]] : [[0, len]];
      for (const [a, b] of nukiSpans) {
        const u = (a + b) / 2;
        box(0x4c3e30, ax + tx * u, H * 0.55, az + tz * u, b - a, 0.1, 0.1, ry);
      }
      }
    }
  }
  }
  // 明かり障子の窓枠。外壁から二本の溝まで見込みを付け、斜めから壁の切り口が抜けないようにする。
  // 動く紙と桟は naka_doors.js に任せ、窓の左右だけを木で受ける。
  for (const v of villageWindows) {
    const bottom = .25 + v.y0, top = .25 + v.y1;
    for (const side of [-1, 1]) box(postHex, v.t + side * (v.w / 2 + .035),
      (bottom + top) / 2, v.s * (d / 2 + .08), .07, top - bottom + .12, .28);
    for (const yy of [bottom - .03, top + .03])
      box(sillHex, v.t, yy, v.s * (d / 2 + .08), v.w, .06, .28);
    // 民家の明かり窓は外に簡素な木格子、内に引違いの紙障子を置く推定復元。
    // 格子の木口は上下の枠へ納め、室内側の戸と溝には重ねない。外壁の束へ一度だけ結合する。
    const bars = Math.max(2, Math.round(v.w / .18));
    for (let j = 0; j < bars; j++) box(postHex, v.t + (j - (bars - 1) / 2) * v.w / bars,
      (bottom + top) / 2, v.s * (d / 2 + .08), .035, top - bottom, .035);
  }
  if (igaWindow) {
    // 外壁の窓も窓台・まぐさ・縦枠で受ける。穴だけでは板の切り口が露出し、
    // 室内の格子を外から見た時に壁の中へ差しただけの形になっていた。
    // 窓の高さは板壁の下端 .25 を含めて室内と一致する。開口を枠で狭めない。
    const wx = igaWindow.t, wz = -d / 2 - .035;
    const low = .25 + igaWindow.y0, high = .25 + igaWindow.y1;
    for (const side of [-1, 1])
      box(postHex, wx + side * (igaWindow.w / 2 + .04), (low + high) / 2,
        wz, .08, high - low, .16);
    box(sillHex, wx, high + .04, wz, igaWindow.w + .16, .08, .16);
    // 窓台は壁より外へ出し、下に水切りの溝を通す。既存の板壁の束へまとめる。
    box(sillHex, wx, low - .04, wz - .03, igaWindow.w + .2, .08, .22);
    box(0x30251b, wx, low - .081, wz - .115, igaWindow.w + .12, .004, .012);
  }
  // 中のない小屋は戸を閉じる。当たりのない飾りだけ半開きにする。
  const closed = o.solid !== false && !o.interior;
  if (!closed && !o.interior) box(0x120e0a, 0, 0.95, d / 2 - 0.25, DOOR - 0.1, 1.85, 0.02);
  if (o.interior?.profile === 'anegawa') {
  box(0x4a3d30, 0, 0.08, d / 2, DOOR + 0.3, 0.1, 0.16);
  box(0x4a3d30, 0, doorTop + .05, d / 2, DOOR + 0.3, 0.12, 0.14);
  if (o.interior?.profile === 'anegawa' && SETTINGS.quality === 'high' && H > doorTop + .1) {
    // 入れる小屋の鴨居上も外壁でふさぐ。内側の小壁と同じ戸口上端から軒桁まで納める。
    box(wallHex, 0, (doorTop + H - .1) / 2, d / 2, DOOR, H - .1 - doorTop, .06);
  }
  } else {
  // 伊賀の引き戸は床高 .25 の上に敷居がある。外の敷居も同じ上端 .29 へ納める。
  box(0x4a3d30, 0, igaEntry ? .27 : .08, d / 2, DOOR + 0.3, igaEntry ? .04 : .1, 0.16);
  const entryHeaderY = lintelY;
  box(0x4a3d30, 0, entryHeaderY, d / 2, DOOR + 0.3, 0.12, 0.14);
  // 戸口を壁の上まで抜いたままにせず、鴨居の上から軒桁の下まで小壁でつなぐ。
  // 内側だけ壁があると、外からは鴨居の上に深い穴が残ってしまう。
  const entryWallBottom = entryHeaderY + .06;
  if ((igaEntry || villageInterior) && H - .1 > entryWallBottom)
    box(wallHex, 0, (entryWallBottom + H - .1) / 2, d / 2, DOOR + .01, H - .1 - entryWallBottom, .06, 0, igaPlaster);
  if (nodaHome) {
    // 室内の戸の上端（床高 .25 ＋ 戸高 1.65）に合わせた鴨居の上を小壁で納める。
    // 外から天井裏へ抜けて見える隙間を塞ぎ、動く板戸の通りは空ける。
    const bottom = 2.01, top = H - .15;
    if (top > bottom) box(wallHex, 0, (bottom + top) / 2, d / 2, DOOR, top - bottom, .06);
  }
  }
  if (!o.interior) box(vary(0x75644e, 3), closed ? 0 : DOOR * 0.55, 1.0, d / 2 + 0.08, closed ? DOOR : DOOR * 0.62, 1.8, 0.05);
  if (closed) for (const hy of [0.45, 1.0, 1.55]) box(sillHex, 0, hy, d / 2 + 0.12, DOOR, 0.06, 0.06);
  // 民家の格子窓と薪棚。既存の壁柱と同じ束へ入れ、戸口と外の当たりは保つ。
  if (o.groundedHome && !lo && !o.ita && w >= 4) {
    const wx = -w * .3, wz = d / 2 + .04;
    // 姉川の入れる家は、開口に合わせた室内側の連子と窓枠を使う。
    // 古い飾り窓を重ねると民家の格子が二重になり、側窓だけの宿小屋では
    // 穴のない正面の土壁に格子だけが貼られる。薪棚はそのまま軒下へ納める。
    if (!anegawaWindows) {
      box(0x302a20, wx, 1.42, wz, .88, .65, .035);
      for (const side of [-1, 1]) box(postHex, wx + side * .46, 1.42, wz + .04, .07, .78, .06);
      for (const yy of [1.05, 1.79]) box(sillHex, wx, yy, wz + .05, 1, .08, .09);
      for (let j = 0; j < 5; j++) box(vary(0x716049, j + sd0), wx - .34 + j * .17, 1.42, wz + .045, .035, .65, .04);
    }
    // 薪は軒の内側の壁際へ積む。土台と同じ高さで浮かせない。
    for (let row = 0; row < 3; row++) for (let j = 0; j < 5 - row; j++) {
      box(vary(0x65503a, j + row * 5 + sd0), w * .26 + j * .12 + row * .04, .28 + row * .12,
        d / 2 + .22, .105, .105, .38, .02 * Math.sin(j + sd0));
    }
  }
  // 指定した長屋・主殿は長手の軒下に閉じた板戸を並べる。
  // 入れる建物は妻の戸口を使い、長手の板戸の裏は壁のまま保つ。
  // 柱より外へ板戸と枠を出し、壁の貫が戸を横切って見えないようにする。
  if (o.nagayaDoors === true && (closed || o.interior?.profile === 'miki') && o.ita) {
    const bays = Math.max(2, Math.round(d / 3));
    for (let i = 0; i < bays; i++) {
      const zz = -d / 2 + (i + .5) * d / bays, face = w / 2 + .14;
      // 戸板四枚と上下の桟。隙間と古板の色の差で建具の幅を出す。
      for (let j = 0; j < 4; j++) box(vary(0x75644e, i * 7 + j), face, 1.08,
        zz - .54 + (j + .5) * .27, .055, 1.8, .263);
      for (const offset of [-.62, .62]) box(postHex, face + .025, 1.1, zz + offset, .13, 2.02, .12);
      for (const yy of [.17, 2.05]) box(sillHex, face + .025, yy, zz, .15, .13, 1.4);
      for (const yy of [.52, 1.62]) box(sillHex, face + .045, yy, zz, .07, .07, 1.08);
    }
  }
  // 指定した主殿だけ長手の戸口に柱立ちの下屋を添える。
  // 床や当たりは増やさず、板戸の間に柱を立て、薄い庇と既存の束へ結合する。
  if (o.eaveGallery === true && o.ita) {
    const face = w / 2, depth = 1.15, bays = Math.max(2, Math.round(d / 3));
    const roof = new THREE.BoxGeometry(depth + .18, .075, d + .9);
    roof.rotateZ(-.18); roof.translate(face + depth / 2 - .12, H - .12, 0);
    parts.push(paint(roof, 0x716451));
    box(sillHex, face + depth - .2, H - .25, 0, .14, .16, d + .55);
    for (let i = 0; i <= bays; i++) {
      const zz = -d / 2 + i * d / bays, px = face + depth - .2;
      const gy = world.heightAt(x + px * Math.cos(rot) + zz * Math.sin(rot),
        z - px * Math.sin(rot) + zz * Math.cos(rot)) - y;
      box(postHex, px, (gy + H - .25) / 2, zz, .12, H - .25 - gy, .12);
    }
    for (let i = 0; i < 3; i++) box(0x4e473c, face + .15 + i * .36,
      H - .12 - (i * .36 - .3) * .18 + .06, 0, .045, .055, d + .85);
  }
  // 屋根：茅葺きは急な勾配と厚い軒。瓦葺きは根拠のある建物だけ指定する。
  const roofParts = [];
  const tile = o.tileRoof === true, ita = !!o.ita || tile, eave = ita ? 0.7 : 0.85;
  // 指定した高画質の小屋だけ、石置きでなく茶褐色の板と押さえ木で葺く。
  const boardRoof = true && ita && !tile && o.boardRoof === true;
  const roofColors = boardRoof ? o.boardRoofColors : null;
  const rh = ita ? (w / 2 + eave) * 0.42 : Math.max(w * 0.5, Math.max(w, d) * 0.42) + 0.5;
  const th = tile ? 0.18 : ita ? 0.1 : (lo ? 0.42 : 0.5);
  const th0 = Math.atan2(rh, w / 2 + eave), slope = Math.hypot(w / 2 + eave, rh) + (ita ? 0.1 : 0.25);
  const L = d + eave * 2;
  if (boardRoof) {
    const frame = hutEaveGeo(w, d, eave, rh).clone();
    frame.translate(0, H, 0); parts.push(frame);
  }
  if (!lo) {
    // 軒裏に短い垂木を通し、茅の厚みを梁が受ける構造にする。
    // 壁と同じ束へ焼き込み、材質と描く回数は増やさない。
    // 設楽原の小屋裏は下の叉首・垂木に任せ、ここでは壁から外の軒だけを残す。
    const reach = w / 2 + eave - .12, ridgeY = H + rh - th - .04, eaveY = H - th * .65;
    const start = villageInterior && !ita ? (w / 2 - .12) / reach : 0;
    for (const zz of [-d / 2, 0, d / 2]) for (const sd of [-1, 1]) {
      parts.push(paint(logGeo([sd * reach * start, ridgeY + (eaveY - ridgeY) * start, zz],
        [sd * reach, eaveY, zz], 0.065, 0.055, 5), postHex));
    }
  }
  for (const sd of [1, -1]) {
    const boards = boardRoof ? Math.ceil(L / .48) : 1;
    for (let i = 0; i < boards; i++) {
      const g = roofSlab(L / boards - (boardRoof ? .008 : 0), slope, th,
        roofColors ? roofColors[(i + (sd > 0 ? 0 : 2)) % roofColors.length] : boardRoof ? (i % 5 === 2 ? 0xa3835b : 0x806347) : ita ? 0x9a9282 : 0xd6ccbc,
        roofColors ? 0x494638 : boardRoof ? 0x514332 : ita ? 0x6e675c : 0x958a7a, sd0 + i + (sd > 0 ? 0 : 50),
        ita && !tile && o.weatheredBoards === true,
        false);
      if (tile) {
        // 共用の瓦の絵は八列・八段。屋根の大きさに合わせ、棟から軒へ葺く。
        const p = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) / 2.4, p.getX(i) / 2.4);
      }
      g.translate(slope / 2 - (ita ? 0.05 : 0.15), -th / 2 + 0.05, 0);
      g.rotateZ(-th0); if (sd < 0) g.rotateY(Math.PI);
      g.translate(0, H + rh + 0.05 + (boardRoof ? (i % 3) * .008 : 0), -L / 2 + (i + .5) * L / boards);
      roofParts.push(g.toNonIndexed());
      g.dispose();
    }
  }
  if ((villageInterior || nodaHome) && !ita) {
    // 土間・板間の上は天井を張らず、梁の上に叉首と母屋を組む推定復元。
    // 茅の下面に納め、軒の桁から棟まで支える。毎コマは組み直さない。
    const half = w / 2 - .12;
    // 屋根の下面は妻壁と同じ式。軒の出を無視して叉首を壁の高さまで下げると、
    // 垂木と木舞が茅から離れ、母屋も別の勾配になってしまう。
    // 木舞は垂木の上へ勾配を揃えて載せる。二材の厚みを含め、
    // 木舞の上面と茅の下面にも一センチの余白を残す。
    const roofUnder = px => H + rh + .1 - (Math.abs(px) - .15) * Math.tan(th0) - th / Math.cos(th0);
    const rafterH = .055, lathH = .025, rafterLift = .055;
    const frameInset = Math.max(.12, rafterLift + (rafterH / 2 + lathH) / Math.cos(th0) + .01);
    const ridgeY = roofUnder(0) - frameInset, footY = roofUnder(half) - frameInset;
    const rise = ridgeY - footY, beamTop = H + .02;
    const length = Math.hypot(half, rise), angle = Math.atan2(rise, half);
    // 囲炉裏のある板間の上は、煙を受ける梁・垂木・木舞に煤の濃淡を付ける推定復元。
    // 炉の位置は室内と同じ内寸・土間の奥行きから求め、座敷の天井裏まで黒くしない。
    // 既存の頂点色へ設営時だけ焼き込み、面・材質・光源や毎コマの処理は増やさない。
    const smokeX = -(w - .18) / 2 + 1;
    const smokeZ = (d - .18) * .185 - .825;
    const parlorEdge = -(d - .18) / 2 + (d - .18) * .37;
    const timber = (px, py, pz, bw, bh, bd, tilt = 0, color = 0x493829, pitch = 0) => {
      const g = VILLAGE_ROOF_BEAM().clone();
      g.scale(bw, bh, bd); g.rotateX(pitch); g.rotateZ(tilt); g.translate(px, py, pz);
      const shaded = paint(g, color), positions = shaded.attributes.position, colors = shaded.attributes.color;
      for (let i = 0; i < positions.count; i++) {
        const vx = positions.getX(i), vy = positions.getY(i), vz = positions.getZ(i);
        if (vz <= parlorEdge || vy < H - .2) continue;
        const spread = 1.1 + Math.max(0, vy - H) * .35;
        const dx = vx - smokeX, dz = vz - smokeZ;
        const plume = Math.max(0, 1 - (dx * dx + dz * dz) / (spread * spread));
        const edge = Math.min(1, (vz - parlorEdge) / .35);
        const shade = 1 - .48 * plume * edge;
        colors.setXYZ(i, colors.getX(i) * shade, colors.getY(i) * shade, colors.getZ(i) * shade);
      }
      parts.push(shaded);
    };
    // 叉首の合掌部は木を重ねるだけで終えず、棟木と一緒に縄で締める推定の納まり。
    // 三巻きの縄も共通の箱から作り、動かない外観の束へまとめる。
    const bind = (px, py, pz, bw, bh) => {
      const cord = .018;
      for (const offset of [-.055, 0, .055]) {
        for (const side of [-1, 1]) {
          timber(px, py + side * bh / 2, pz + offset, bw + cord, cord, cord, 0, 0x897557);
          timber(px + side * bw / 2, py, pz + offset, cord, bh, cord, 0, 0x897557);
        }
      }
    };
    // 側壁の柱と同じ外寸・間数を使い、小屋梁の両端を柱の芯で受ける。
    // 妻から十五センチ内へ寄せると柱のない所へ梁と叉首の重さが掛かってしまう。
    const bays = Math.max(2, Math.round(d / 1.8));
    // 小座敷の境は内寸の奥から三十七％（間取りと同じ）。
    // 座敷へ掛かる小屋梁は天井板の上へ納め、竿縁の下へ太い梁を突き出さない。
    const parlorEnd = -(d - .18) / 2 + (d - .18) * .37;
    const beamTopAt = zz => zz - .09 < parlorEnd ? H + .26 : beamTop;
    for (let i = 0; i <= bays; i++) {
      const zz = -d / 2 + d * i / bays;
      const localBeamTop = beamTopAt(zz);
      timber(0, localBeamTop - .1, zz, w, .2, .18);
      for (const side of [-1, 1]) {
        // 座敷の梁を上げた分は柱頭の受け材でつなぐ。天井板の上で梁だけを浮かせない。
        const bearingH = localBeamTop - .2 - H;
        if (bearingH > 0) timber(side * w / 2, H + bearingH / 2, zz,
          .16, bearingH, .18);
        // 柱頭と小屋梁の取り合いは、差し込んだほぞを木栓で留める推定の納まり。
        // 梁を載せただけの姿にせず、梁の表裏へ栓の木口をわずかに出す。
        // 座敷の上げた梁も同じ位置で留め、通行する高さには材を足さない。
        // 共通の角材・材質を外観の束へまとめ、毎コマの処理や当たりは増やさない。
        timber(side * (w / 2 - .04), localBeamTop - .1, zz,
          .022, .022, .196, 0, 0x786044);
        // 勾配を揃えて持ち上がった叉首の足は、小屋梁の上の束で受ける。
        // 足元を空中へ浮かせず、同じ原形と材質で外観の束へまとめる。
        if (footY > localBeamTop) timber(side * half, (localBeamTop + footY) / 2, zz,
          .16, footY - localBeamTop, .18);
        timber(side * half / 2, (footY + ridgeY) / 2, zz, length, .16, .14, -side * angle);
        // 叉首の足元も束との取り合いで締める。棟だけに縄があって足が載るだけの姿にしない。
        bind(side * half, footY, zz, .23, .26);
      }
      bind(0, ridgeY - .045, zz, .25, .3);
    }
    // 小座敷の竿縁天井は野縁と吊り木で小屋梁へ留める推定の納まり。
    // 野縁は天井の裏板上端 H + .05 に載せる。吊り木は裏板で止めず、
    // naka.js と同じ回縁の内寸・竿縁割りを使い、竿縁の上端 H まで下ろす。
    // 薄い天井板だけへ荷重を掛けず、板間・土間へ野縁を延ばさない。
    // 吊り木は梁の側面へ添え、共通の角材で一度だけ外観の束へまとめる。
    const ceilingBack = -(d - .18) / 2 + .14, ceilingFront = parlorEnd - .02;
    const ceilingWidth = w - .18 - .32;
    const ceilingSpans = Math.max(1, Math.round(ceilingWidth / .45));
    const supportRail = Math.max(1, Math.min(ceilingSpans - 1, Math.round(ceilingSpans / 4)));
    // 吊り木の下端を竿縁の上へ載せるだけにせず、側面へ二・五センチ添えて釘で留める。
    // 竿縁は幅三・五センチ・下面 H - .035。吊り木と釘頭をその下面より上に収める。
    // 上側の接合位置は保ち、下端だけ竿縁の横へ曲がる二材の継ぎ手とする推定の納まり。
    const hangerFoot = (xx, zz) => {
      // 竿縁と上の吊り木へ五ミリ以内で欠き合わせ、木口同士の隙間を残さない。
      const side = xx < 0 ? -1 : 1, footX = xx + side * .0275;
      timber(footX, H + .005, zz, .03, .06, .04);
      for (const yy of [H - .0125, H + .02]) {
        box(0x39362e, xx + side * .01, yy, zz, .07, .006, .006);
        box(0x39362e, xx + side * .0455, yy, zz, .006, .014, .014);
      }
    };
    // 桁行きの受け木二本だけでは、その間の竿縁が吊り木へつながらない。
    // 直交する野縁を足し、天井板の裏から全ての竿縁を同じ架構へ留める推定復元。
    // 受け木の側面へ木口を納め、同じ高さの木を交差させて重ねない。
    // 共通の角材を既存の外観へまとめ、毎コマの処理は増やさない。
    const supportX = ceilingWidth * (.5 - supportRail / ceilingSpans);
    if (ceilingFront - ceilingBack > .06) {
      const crossCount = Math.max(2, Math.ceil((ceilingFront - ceilingBack) / .6));
      const ends = [-ceilingWidth / 2, -supportX - .03, -supportX + .03,
        supportX - .03, supportX + .03, ceilingWidth / 2];
      for (let i = 0; i < crossCount; i++) {
        const zz = ceilingBack + .03 + (ceilingFront - ceilingBack - .06) * i / (crossCount - 1);
        for (let j = 0; j < ends.length; j += 2) {
          const left = ends[j], right = ends[j + 1];
          if (right > left) timber((left + right) / 2, H + .08, zz,
            right - left, .06, .06);
        }
        // 短い吊り木は野縁の横へ添え、上端まで掛けて和釘で留める推定の納まり。
        // 下面で止めると木口が触れるだけで、竿縁を吊れない。
        // 二本の受け木には下の長い吊り木がある。天井の下面へは出さない。
        for (let rail = 1; rail < ceilingSpans; rail++) {
          const xx = ceilingWidth * (rail / ceilingSpans - .5);
          if (Math.abs(Math.abs(xx) - supportX) < .001) continue;
          const side = zz + .07 <= ceilingFront ? 1 : -1;
          const hangerZ = zz + side * .05;
          // 野縁の見込み六センチの外面へ、厚さ四センチの吊り木を突き付ける。
          // 下端は竿縁の上端へ揃え、既存の天井板・通行の高さは保つ。
          timber(xx, H + .055, hangerZ, .03, .11, .04);
          hangerFoot(xx, hangerZ);
          box(0x39362e, xx, H + .08, zz + side * .035, .006, .006, .08);
          box(0x39362e, xx, H + .08, zz + side * .073, .014, .014, .006);
        }
      }
    }
    if (ceilingFront > ceilingBack) for (const side of [-1, 1]) {
      const xx = side * supportX;
      timber(xx, H + .08, (ceilingBack + ceilingFront) / 2,
        .06, .06, ceilingFront - ceilingBack);
      for (let i = 0; i <= bays; i++) {
        const zz = -d / 2 + d * i / bays;
        // 梁脇の吊り木を野縁の範囲へ収め、妻壁や座敷境へ突き抜けさせない。
        for (const edge of [-1, 1]) {
          const hangerZ = zz + edge * .11;
          if (hangerZ - .02 < ceilingBack || hangerZ + .02 > ceilingFront) continue;
          const top = beamTopAt(zz) - .02, bottom = H;
          if (top > bottom) {
            timber(xx, (bottom + top) / 2, hangerZ, .04, top - bottom, .04);
            hangerFoot(xx, hangerZ);
            // 吊り木を梁と野縁へ添えただけにせず、和釘で留める推定の納まり。
            // 上は梁の側面、下は野縁の側面へ打つ。釘頭は木の表へ出し、
            // 軸は接合する二材へ渡す。既存の箱と材質で静止した束へまとめる。
            for (const yy of [top - .045, H + .08]) {
              if (yy - .012 < bottom || yy + .012 > top) continue;
              box(0x39362e, xx, yy, hangerZ - edge * .012,
                .008, .008, .08);
              box(0x39362e, xx, yy, hangerZ + edge * .023,
                .022, .022, .006);
            }
          }
        }
      }
    }
    // 足束を桁行きの小屋貫でつなぐ推定の木組み。各架構が独立して立つ姿を避ける。
    // 束のある高さだけに通し、座敷の天井や土間の通行範囲へは下ろさない。
    if (footY > beamTop + .16) for (const side of [-1, 1])
      timber(side * half, (beamTop + footY) / 2, 0, .09, .12, d - .12);
    // 桁行きは貫だけでなく、両端の束間に斜めの木を入れて固める推定復元。
    // 梁の上から叉首の足までで止め、座敷の天井・障子・土間の頭上へ下ろさない。
    // 四本とも共通の原形を使い、既存の動かない外観の束へ一緒に焼き込む。
    const braceRun = d / bays;
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const zz = end * (d / 2 - braceRun / 2);
      // 両端の梁高を参照し、座敷側の高い梁より下へ斜材を突き出さない。
      const supportTop = Math.max(beamTopAt(end * d / 2), beamTopAt(end * (d / 2 - braceRun)));
      const braceRise = footY - supportTop - .16;
      if (braceRise <= .12) continue;
      timber(side * half, (supportTop + footY) / 2, zz,
        .08, .08, Math.hypot(braceRun, braceRise), 0, 0x493829,
        end * Math.atan2(braceRise, braceRun));
    }
    // 棟木と母屋も両妻の架構の芯まで渡し、移した叉首との間に隙間を残さない。
    // 垂木の下面から受け材の上面を決める。固定値では勾配ごとに隙間や食い込みが変わる。
    // 棟木は左右の垂木の下端へ、母屋は勾配に沿う上面で垂木へ接する。
    const rafterBottom = rafterLift - rafterH / 2 / Math.cos(angle);
    timber(0, ridgeY + rafterBottom - .09 - .09 * Math.tan(angle), 0, .18, .18, d);
    for (const side of [-1, 1]) for (const t of [.36, .72])
      timber(side * half * t, ridgeY - rise * t + rafterLift - (rafterH / 2 + .08) / Math.cos(angle),
        0, .14, .16, d, -side * angle);
    // 板間と土間から見上げる茅の下地。叉首に沿う垂木と、それに直交する細い木舞を重ねる。
    // 座敷の竿縁天井は保ち、原形と材質を使い回して外観の束へ一度だけまとめる。
    const rafterBays = Math.max(bays, Math.ceil((d - .3) / .6));
    for (let i = 0; i <= rafterBays; i++) {
      const zz = -d / 2 + .15 + (d - .3) * i / rafterBays;
      for (const side of [-1, 1])
        timber(side * half / 2, (footY + ridgeY) / 2 + rafterLift, zz, length, rafterH, .055, -side * angle);
    }
    // 木舞を水平な角材のまま垂木へ埋めず、下面を垂木の上面へ接する。
    // 同じ傾きなら接合面が揃い、板間・土間から見上げても木口が交差しない。
    const lathLift = rafterLift + (rafterH + lathH) / 2 / Math.cos(angle);
    const lathRows = Math.max(2, Math.ceil(length / .3));
    for (let i = 1; i < lathRows; i++) {
      const t = i / lathRows;
      for (const side of [-1, 1])
        timber(side * half * t, ridgeY - rise * t + lathLift, 0, .035, lathH, d - .16, -side * angle);
    }
  }
  // 妻壁（三角の板壁）と、妻の破風（板葺き）／茅の妻の小さな煙出し
  for (const zz of [d / 2, -d / 2]) {
    if (boardRoof && o.boardGables !== false) {
      const shapes = boardGableGeo(w, rh + .05, Math.tan(th0), -.02, wallHex);
      const near = shapes.near.clone(), far = shapes.far.clone();
      for (const g of [near, far]) {
        if (zz < 0) g.rotateY(Math.PI);
        g.translate(0, H, zz); g.userData.homeTimber = true;
      }
      // 単独の小屋は既存の壁の距離切替へ渡す。束ねる小屋は既存の簡略化を使う。
      if (!o.batch) near.userData.homeCoarse = far;
      else far.dispose();
      parts.push(near);
    } else if (o.interior?.profile === 'iga') {
      // 伊賀の入れる小屋は軒側にも立ち上がりがある。三角だけでは屋根との間が開く。
      // 薄い厚みを付け、天井を張らない民家でも妻壁の裏が消えないようにする。
      const edge = rh * eave / (w / 2 + eave);
      const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0),
        new THREE.Vector2(w / 2, edge), new THREE.Vector2(0, rh), new THREE.Vector2(-w / 2, edge)]);
      if (!ita && o.interior.kind === 'minka') {
        // 黒い板を貼る代わりに煙出しを抜く。外の札や毎コマの処理は増やさない。
        const vent = new THREE.Path(), cy = rh * .62;
        vent.moveTo(-.35, cy - .2); vent.lineTo(-.35, cy + .2);
        vent.lineTo(.35, cy + .2); vent.lineTo(.35, cy - .2); vent.closePath();
        shape.holes.push(vent);
        // 煙抜きの切り口を枠で受ける。室内からも板の端が宙に浮かない。
        for (const vx of [-.385, .385]) box(postHex, vx, H + cy, zz, .07, .54, .12);
        for (const vy of [cy - .235, cy + .235]) box(sillHex, 0, H + vy, zz, .7, .07, .12);
      }
      const g = new THREE.ExtrudeGeometry(shape, { depth: .06, bevelEnabled: false, steps: 1, curveSegments: 1 });
      g.translate(0, H, zz - .03);
      parts.push(paint(g, vary(wallHex, 5)));
      // 民家・陣小屋・番所の妻壁は、下の板壁に続く縦板で納める。
      // 館は下の階と同じ塗り壁なので、内外とも板の目地を付けない。
      // 板壁の目地は屋根の勾配で切り、煙出しには板や横貫を通さない。
      // 既存の静止した壁の束へ入れ、材質と描く回数を増やさない。
      const pitch = rh / (w / 2 + eave), boards = Math.max(2, Math.ceil(w / .3));
      const smoke = !ita && o.interior.kind === 'minka', ventY = rh * .62;
      for (let i = 1; !igaPlaster && i < boards; i++) {
        const px = -w / 2 + i * w / boards, top = rh - Math.abs(px) * pitch;
        const spans = smoke && Math.abs(px) < .35
          ? [[0, ventY - .2], [ventY + .2, top]] : [[0, top]];
        for (const [low, high] of spans) if (high > low)
          for (const side of [-1, 1]) box(0x4a3828, px, H + (low + high) / 2,
            zz + side * .031, .006, high - low, .004);
      }
      // 民家は煙出しを横切る中央の束を両脇の束へ替える推定復元。
      // 下の桁から妻壁の上端まで支え、開口の枠と横貫を受ける。
      // 柱は穴の外へ離し、既存の壁の束へまとめる。
      if (smoke) for (const px of [-.45, .45]) {
        const top = rh - Math.abs(px) * pitch - .08;
        if (top > 0) box(postHex, px, H + top / 2, zz, .12, top, .14);
      }
      // 板を受ける横貫も両面へ通す。上段は煙出しの下へ収める。
      for (const yy of [edge * .5, rh * .45]) {
        const width = Math.min(w, 2 * (rh - yy - .04) / pitch);
        for (const side of [-1, 1]) box(postHex, 0, H + yy,
          zz + side * .04, width, .08, .04);
      }
    } else {
      // 茅屋根の裏面まで妻壁を閉じる。軒の出を棟の高さから引くと棟下に空洞が残る。
      const top = px => Math.max(.03, rh + .1 - (Math.abs(px) - .15) * Math.tan(th0) - th / Math.cos(th0));
      const outline = ita
        ? [new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rh * (w / 2) / (w / 2 + eave))]
        : [new THREE.Vector2(-w / 2, -.02), new THREE.Vector2(w / 2, -.02),
          new THREE.Vector2(w / 2, top(w / 2)), new THREE.Vector2(0, top(0)), new THREE.Vector2(-w / 2, top(w / 2))];
      const tri = new THREE.Shape(outline);
      if ((villageInterior || nodaHome) && !ita) {
        // 囲炉裏の上に煙の逃げ道を残す推定の納まり。外の飾りだけでなく内外の妻壁を同じ穴で抜く。
        const ventY = rh * .62;
        tri.holes.push(new THREE.Path([
          new THREE.Vector2(-.38, ventY - .24), new THREE.Vector2(-.38, ventY + .24),
          new THREE.Vector2(.38, ventY + .24), new THREE.Vector2(.38, ventY - .24),
        ]));
      }
      const recessed = !ita && !o.batch;
      const faceZ = zz - (recessed ? Math.sign(zz) * .1 : 0);
      const tg = new THREE.ShapeGeometry(tri);
      // 外向きだけの妻壁は土間から裏が抜けて見える。引き込んだ外面と内面をそろえる。
      if ((villageInterior || nodaHome) && !ita) {
        const inner = tg.clone();
        if (zz > 0) inner.rotateY(Math.PI);
        inner.translate(0, H, faceZ - Math.sign(zz) * .035);
        parts.push(paint(inner, 0x594735));
        // 煙出しの四周も木の見込みで表裏をつなぐ。薄い妻壁を二枚並べるだけでは、
        // 小屋裏から斜めに見上げた時に切り口の中が抜ける。開口の幅と高さは保つ。
        // 既存の箱と材質で組み、壁・梁と同じ動かない束へ納める。
        const ventY = H + rh * .62, frameZ = faceZ - Math.sign(zz) * .0175;
        for (const side of [-1, 1]) {
          box(postHex, side * .395, ventY, frameZ, .03, .54, .035);
          box(postHex, 0, ventY + side * .255, frameZ, .76, .03, .035);
        }
      }
      if (zz < 0) tg.rotateY(Math.PI);
      tg.translate(0, H, faceZ);
      parts.push(paint(tg, vary(wallHex, 5)));
    }
    if (!lo) {
      // 妻の真ん中の束柱と、梁の先
      if (!(boardRoof && o.boardGables !== false)) {
        const kingH = !ita ? rh + .1 + .15 * Math.tan(th0) - th / Math.cos(th0) : boardRoof ? rh - .08 : rh * .84 * (w / 2) / (w / 2 + eave);
        if ((villageInterior || nodaHome) && !ita) {
          // 入れる民家の妻束は煙出しを貫かせず、左右の添え束と上下の横木へ荷を渡す推定の納まり。
          // 壁に抜いた幅七十六センチ・高さ四十八センチは保ち、小屋裏からも空きを見せる。
          // 共通の角材を写し、外壁・梁と同じ静止した束へまとめる。
          const vent = rh * .62, lower = vent - .36, upper = vent + .36;
          const member = (px, bottom, top, width) => {
            if (top <= bottom) return;
            const g = VILLAGE_ROOF_BEAM().clone().scale(width, top - bottom, .14);
            g.translate(px, H + (bottom + top) / 2, zz);
            parts.push(paint(g, postHex));
          };
          member(0, 0, lower, .14);
          member(0, upper, kingH, .14);
          for (const side of [-1, 1]) member(side * .45, 0, upper, .14);
          member(0, lower, vent - .24, .76);
          member(0, vent + .24, upper, .76);
        } else if (!(!ita && igaEntry && o.interior.kind === 'minka')) box(postHex, 0, !ita || boardRoof ? H + kingH / 2 : H + rh * .42, zz, .14, kingH, .14);
        box(0x4c3e30, 0, H + 0.12, zz + Math.sign(zz) * 0.12, w + 0.3, 0.2, 0.2);
      }
      if (!ita && !o.batch && !(igaEntry && o.interior.kind === 'minka')) {
        const shapes = thatchGableGeo(w, rh, th0, th, villageInterior || nodaHome);
        const near = shapes.near.clone(), far = shapes.far.clone();
        for (const g of [near, far]) {
          if (zz < 0) g.rotateY(Math.PI);
          g.translate(0, H, zz);
          g.userData.homeTimber = true;
        }
        near.userData.homeCoarse = far;
        parts.push(near);
      } else if (!ita && !(o.interior?.profile === 'iga' && o.interior.kind === 'minka')) { const v = new THREE.BoxGeometry(0.7, 0.45, 0.04); v.translate(0, H + rh * 0.62, zz + Math.sign(zz) * 0.03); parts.push(paint(v, 0x16110c)); }
    }
  }
  const rl = L + 0.3;
  if (tile) {
    // 瓦屋根には石置き板屋根の押さえ木を載せない。棟も屋根と一緒に描く。
    const ridge = new THREE.BoxGeometry(0.34, 0.22, rl).toNonIndexed();
    ridge.translate(0, H + rh + 0.16, 0);
    roofParts.push(paint(ridge, 0xffffff));
  } else if (ita) {
    // 押さえの丸太と石（石置き屋根）
    for (const sd of [1, -1]) for (let q = 0; q < 3; q++) {
      const t = (q + 0.5) / 3, lx = sd * (w / 2 + eave) * t, ly = H + rh * (1 - t) + 0.13;
      const bar = new THREE.CylinderGeometry(0.06, 0.06, L, 5); bar.rotateX(Math.PI / 2); bar.translate(lx, ly, 0); parts.push(paint(bar, 0x4e473c));
      if (!lo && !boardRoof) for (let k2 = 0; k2 < 5; k2++) { const st = new THREE.DodecahedronGeometry(0.16 + ((q * 5 + k2) % 3) * 0.04, 0); st.scale(1.2, 0.7, 1); st.translate(lx, ly + 0.1, -L / 2 + (k2 + 0.5) * L / 5); parts.push(paint(st, vary(0x8a867c, q * 7 + k2))); }
    }
    const ridge = new THREE.BoxGeometry(0.34, 0.16, rl); ridge.translate(0, H + rh + 0.14, 0); parts.push(paint(ridge, 0x4a4238));
  } else {
    // 茅の棟：屋根に重なる杉皮と、勾配に沿って伏せた押さえ木。
    if (o.thatchTies) {
      // 伊賀の小屋は浮いて見える弓形の飾りを省き、屋根に重なる棟板だけを残す。
      box(0x3b332a, 0, H + rh + 0.04, 0, 0.46, 0.16, L);
    } else {
      const ridge = thatchRidgeGeo(rl, th0, false).clone();
      ridge.translate(0, H + rh, 0);
      ridge.userData.homeTimber = true;
      parts.push(ridge);
    }
  }
  // 伊賀の窓枠は上で開口の外へ納めた一組だけを使う。
  // 開口の端にもう一組重ねると、縦枠・上下枠が穴へ張り出し、
  // 内側の見込み板と格子に合わない狭い窓になる。格子は室内側で描く。
  const roofGeo = mergeGeometries(roofParts);
  roofGeo.computeVertexNormals();
  const roofMat = tile ? TILE() : boardRoof ? BOARD_ROOF() : ita ? ITA_V() : THATCH_V();
  // 伊賀の壁と一緒に束ねる礎石へ、板目や板の凹凸を掛けない。
  // 色から推測せず部材の印を頂点へ渡し、描く回数と材質数は保つ。
  if (igaEntry && !igaPlaster) for (const g of parts) {
    const wood = new Float32Array(g.attributes.position.count);
    // 二は回す前に部材の長手へ貼った木。一は従来の壁座標で貼る木。
    if (g.userData.homeTimber) wood.fill(g.userData.igaGrain ? 2 : 1);
    g.setAttribute('igaWood', new THREE.BufferAttribute(wood, 1));
  }
  if (o.groundedHome) for (const g of parts.flatMap(g => g.userData.homeCoarse ? [g, g.userData.homeCoarse] : [g])) {
    const pos = g.attributes.position, uv = g.attributes.uv;
    const surface = new Float32Array(pos.count * 2);
    // 木以外の根石・草・土の裾は木目を掛けない。色でなく部品の用途で分ける。
    const kind = g.userData.homeWall ? 1 : g.userData.homeTimber ? 0 : 2;
    for (let i = 0; i < pos.count; i++) {
      surface[i * 2] = kind; surface[i * 2 + 1] = pos.getY(i) * 2.6 / H;
      if (kind === 0) uv.setXY(i, uv.getX(i) * .38, uv.getY(i) * 1.6);
    }
    g.setAttribute('homeSurface', new THREE.BufferAttribute(surface, 2));
  }
  // まとめて描く小屋も室内を一度だけ登録する。姉川の屋根・戸口・採光窓の寸法も保つ。
  const anegawaInterior = o.interior?.profile === 'anegawa';
  const inside = o.interior ? addInterior(world, { ...o.interior, x, z, rot, hasExterior: true,
    ...(anegawaInterior ? { roof: { kind: 'gable', rise: rh, run: w / 2 + eave,
      lining: ita ? 'boards' : 'battens',
      // 屋根板の下面より内側へ垂木を納める。茅は厚みの分だけ深く取る。
      inset: ita ? .12 : .3 } } : {}),
    levels: [{ y: y + interiorFloorY, w: w - .18, d: d - .18, h: H - interiorFloorY }],
    door: { w: DOOR, h: anegawaInterior ? doorHeight : interiorDoorH },
    approach: { pad: anegawaInterior ? entryPad : .25, len: 1.1 },
    wins: () => anegawaInterior
      ? anegawaWindows ? anegawaWindows.map(v => ({ ...v, y0: v.y0 - interiorFloorY, y1: v.y1 - interiorFloorY })) : []
      : nodaHome ? homeWindows : igaWindow ? [igaWindow] : villageWindows }) : null;
  if (o.batch) {
    // 町屋・小屋が何十も並ぶ所（本能寺の京の町並み等）は、材質ごとの BatchedMesh にまとめて
    // 描く回数を減らす（makeSimpleBatch／finalizeSimpleBatch。壁柱材質は MAT、屋根は別材質）
    const bake = (g) => { if (rot) g.rotateY(rot); g.translate(x, y, z); return g; };
    merged(parts.map(bake), o.groundedHome ? EARTH_V() : MAT(), o.batch);
    if (!ita && true) {
      // 金ヶ崎の在所など、まとめた民家にも厚い茅束の軒先を残す。
      // 材質と描画の束は増やさず、同寸の原形から設営時にだけ複製する。
      const detailed = thatchRoofGeo(L, slope, th, th0, rh).clone();
      detailed.translate(0, H, 0);
      pushSimpleBatch(o.batch, bake(detailed), roofMat);
      roofGeo.dispose();
    } else pushSimpleBatch(o.batch, bake(roofGeo), roofMat);
    return null;
  }
  let m = merged(parts);
  if (o.groundedHome) {
    // 土壁と木組みを共通の材質で描き分ける。
    m.material = groundedHomeMat();
  }
  if (parts.some(g => g.userData.homeCoarse)) {
    const far = merged(parts.map(g => g.userData.homeCoarse || g), m.material);
    const walls = new THREE.LOD();
    walls.addLevel(m, 0); walls.addLevel(far, 32);
    m = walls;
  }
  let roof = new THREE.Mesh(roofGeo, roofMat);
  roof.userData.camBlock = true;
  roof.castShadow = true; roof.receiveShadow = true;
  if (boardRoof && o.weatheredBoards === true) {
    // 単独の小屋も、束に入れた屋根と同じ間隔で遠景の重ね目を省く。
    const coarse = kitCoarse(roofGeo);
    if (coarse) {
      const far = new THREE.Mesh(coarse, roofMat);
      far.castShadow = far.receiveShadow = true; far.userData.camBlock = true;
      const lod = new THREE.LOD();
      lod.addLevel(roof, 0); lod.addLevel(far, KIT_LOD_D); roof = lod;
    }
  }
  if (!ita && true) {
    const far = roof;
    const near = new THREE.Mesh(thatchRoofGeo(L, slope, th, th0, rh), roofMat);
    near.position.y = H;
    near.userData.camBlock = true;
    near.castShadow = near.receiveShadow = true;
    roof = new THREE.LOD();
    roof.addLevel(near, 0); roof.addLevel(far, 38);
  }
  const grp = new THREE.Group();
  grp.add(m, roof);
  grp.position.set(x, y, z);
  grp.rotation.y = rot;
  if (inside) grp.userData.naka = inside;
  // 茅葺きの普通の家（色や高さを指定した陣屋・倉でない物）は、素材の民家に替える（props_ext.js の extMinka。画質「低」・読めない時は手作りのまま）
  if (!o.interior && !ita && o.minka !== false && o.wall === undefined && (o.h === undefined || o.h <= 3) && w >= 5.5 && w <= 11 && d >= 3.8 && d <= 7.5) extMinka(grp, [m, roof], w, d, H, sd0);
  // 呼び出し側が mesh として扱っても困らないよう、材質の参照を持たせる
  grp.castShadow = true;
  return grp;
}

const LUMBER_GEO = new Map();
export function lumber(world, x, z, rot = 0) {
  // 九本の積み方を四種類で共有する。切り口の線・太さ・長さをずらし、同じ山の反復を避ける。
  const variant = Math.abs(Math.round(x * 3 + z * 7)) % 4;
  if (!LUMBER_GEO.has(variant)) {
    const parts = [];
    let k = 0;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 4 - row; i++) {
        const q = h01(variant * 13 + k, 17), r = .145 + h01(k, variant + 21) * .025;
        const log = new THREE.CylinderGeometry(r * .84, r, 3.3 + q * .55, 8);
        log.rotateZ(Math.PI / 2);
        log.rotateY((h01(k, variant + 9) - .5) * .055);
        log.translate((q - .5) * .2, .16 + row * .28, (i - (3 - row) / 2) * .33);
        parts.push(paint(log, vary(0x9a7a56, k++ + variant * 9)));
      }
    }
    LUMBER_GEO.set(variant, mergeGeometries(parts));
    for (const g of parts) g.dispose();
  }
  const m = new THREE.Mesh(LUMBER_GEO.get(variant), MAT());
  m.userData.camBlock = true; m.castShadow = true; m.receiveShadow = true;
  m.position.set(x, world.heightAt(x, z), z);
  m.rotation.y = rot;
  return m;
}

// 写真の高井楼：形は二種類の板囲いと遠景用で共有。建築時だけ組み、兵や旗の更新では作らない。
const LOOKOUT_GEO = new Map();
const LOOKOUT_BARK_POSTS = new Map();
const LOOKOUT_FOOT = lazy(() => paint(new THREE.CylinderGeometry(.14, .16, 1, 6), 0x393027));
export const lookoutDeckHeight = () => 8.8;
function highLookoutGeo(boarded, coarse, H, fieldFrame = false, fieldGallery = false, barkPosts = false, logFrame = false, fieldDetail = false, fieldLashings = false, crossLashings = false, fieldBraces = false, deckBraces = false) {
  const key = `${boarded}:${coarse}:${H}:${fieldFrame}:${fieldGallery}:${barkPosts}:${logFrame}:${fieldDetail}:${fieldLashings}:${crossLashings}:${fieldBraces}:${deckBraces}`;
  if (LOOKOUT_GEO.has(key)) return LOOKOUT_GEO.get(key);
  const parts = [];
  const beam = (p, q, r, col, rawLog = false) => {
    // 井桁の横丸太だけ、元口と末口の太さを違える。段ごとの古材の差は遠景にも残す。
    // 頂点と面の数は増やさず、共有する形を組む時だけ決める。
    const seed = p[1] * 17 + p[0] * 3 + p[2] * 7;
    const radius = rawLog ? r * (.93 + h01(seed, 12) * .14) : r;
    const taper = rawLog ? .04 + h01(seed, 19) * .08 : 0;
    const g = paintWorn(logGeo(p, q, radius * (1 + taper), radius * (1 - taper), coarse ? 4 : 6, false), col, 0, H);
    // 突き出た木口は灰茶の切断面。既存の端面の頂点色だけで、中心と外縁を描き分ける。
    const normal = g.attributes.normal, position = g.attributes.position, color = g.attributes.color;
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], len = Math.hypot(dx, dy, dz);
    const end = new THREE.Color(0x9b896c);
    for (let i = 0; i < normal.count; i++) {
      const dot = (normal.getX(i) * dx + normal.getY(i) * dy + normal.getZ(i) * dz) / len;
      if (Math.abs(dot) < .95) {
        if (rawLog) {
          // 水の回る下面を少し煤けさせ、上面は灰色へ褪せさせる。照明と別に古材の色を持たせる。
          const up = normal.getY(i), mix = up < 0 ? -up * .18 : up * .09;
          const tint = up < 0 ? MUD : BLEACH;
          color.setXYZ(i, color.getX(i) * (1 - mix) + tint.r * mix,
            color.getY(i) * (1 - mix) + tint.g * mix, color.getZ(i) * (1 - mix) + tint.b * mix);
        }
        continue;
      }
      const center = dot > 0 ? q : p;
      const edge = Math.min(1, Math.hypot(position.getX(i) - center[0], position.getY(i) - center[1], position.getZ(i) - center[2]) / (radius * (dot > 0 ? 1 - taper : 1 + taper)));
      const mix = .38 - edge * .2;
      color.setXYZ(i, color.getX(i) * (1 - mix) + end.r * mix,
        color.getY(i) * (1 - mix) + end.g * mix, color.getZ(i) * (1 - mix) + end.b * mix);
    }
    parts.push(g);
  };
  const box = (w, h, d, x, y, z, col) => {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(paint(g, col));
  };
  // 仮設井楼は通し柱を垂直に立て、楯の上へ木口を出す。
  if (!barkPosts) for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam([sx * 1.3, -.4, sz * 1.3],
    [sx * (fieldFrame || logFrame ? 1.3 : 1.05), H + (fieldFrame ? 1.85 : 0), sz * (fieldFrame || logFrame ? 1.3 : 1.05)],
    .14, fieldFrame ? 0x696354 : 0x554536);
  // 二方向の横木を交互の高さで重ね、柱から木口を突き出す。筋交いの鉄塔の姿にしない。
  for (let y = .45; y < H; y += coarse ? 1.6 : .8) {
    const w = fieldFrame || logFrame ? 1.3 : 1.3 - .25 * y / H;
    for (const side of [-1, 1]) {
      // 小谷の井楼は一段ごとに上下の組み順を入れ替え、木口を角の外へ出す。
      const layer = Math.round((y - .45) / .8);
      const swap = logFrame && layer % 2 ? .22 : 0;
      // 切り揃えた材の列にせず、木口の出を二十八〜四十四センチでずらす。柱と結び目は動かさない。
      // 高さから決めるので、遠景へ切り替わっても残る段の木口は跳ねない。
      const tail = k => .28 + h01(layer * 13 + side * 5, k) * .16;
      beam([-w - tail(3), y + swap, side * w], [w + tail(11), y + swap, side * w], .11, 0x6b5640, true);
      beam([side * w, y + .22 - swap, -w - tail(19)], [side * w, y + .22 - swap, w + tail(29)], .11, 0x62503d, true);
      // 柱と横木を縄で縛る。遠景には足さず、近景の共通形へ焼き込む。
      if (!coarse) for (const sx of [-1, 1]) {
        // 共通の井桁は、柱だけを巻く輪でなく、上下二本の横木を抱く交差縛り。
        // 角の二面へ回した縄と中央の締め縄を同じ形へ焼き込み、材質と描画回数を増やさない。
        if (logFrame || crossLashings) {
          const cy = y + .11, rope = vary(0xb19a70, layer * 7 + sx + side * 3);
          for (const sign of [-1, 1]) {
            parts.push(flat(logGeo([sx * w - .16, cy - sign * .23, side * (w + .145)],
              [sx * w + .16, cy + sign * .23, side * (w + .145)], .023, .023, 4), rope));
            parts.push(flat(logGeo([sx * (w + .145), cy - sign * .23, side * w - .16],
              [sx * (w + .145), cy + sign * .23, side * w + .16], .023, .023, 4), rope));
          }
          // 巻きの中央を締める短い縄。丸太より外に出し、木へ埋まった輪にしない。
          parts.push(flat(logGeo([sx * w - .085, cy, side * (w + .17)],
            [sx * w + .085, cy, side * (w + .17)], .027, .027, 4), 0x8e7855));
          parts.push(flat(logGeo([sx * (w + .17), cy, side * w - .085],
            [sx * (w + .17), cy, side * w + .085], .027, .027, 4), 0x8e7855));
        } else {
          for (const dy of [-.035, .035]) {
            const tie = new THREE.CylinderGeometry(.165, .165, .04, 6, 1, true);
            tie.translate(sx * w, y + .11 + dy, side * w); parts.push(paint(tie, 0xa18d65));
          }
          box(.09, .12, .06, sx * w, y + .11, side * (w + .17), 0x8d7956);
        }
      }
    }
    if (fieldFrame && !coarse) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const rope = new THREE.TorusGeometry(.18, .025, 3, 6);
      rope.rotateX(Math.PI / 2); rope.translate(sx * w, y + .12, sz * w);
      parts.push(paint(rope, 0xa58e61));
    }
  }
  if (fieldBraces) {
    // 写真の丸太の斜材は一段ずつ向きを返す。梯子のある南面は空ける。
    // 遠景も少数の斜材で輪郭を保ち、細かな縄だけを省く。
    const levels = [0.67, H * .5, fieldGallery ? H * .68 - .2 : H - .25];
    for (let k = 0; k < levels.length - 1; k++) {
      const low = levels[k], high = levels[k + 1], sign = k % 2 ? -1 : 1;
      for (const face of [0, 1, 3]) {
        const rot = face * Math.PI / 2, c = Math.cos(rot), s = Math.sin(rot);
        const point = (xx, yy) => [xx * c - 1.16 * s, yy, -xx * s - 1.16 * c];
        const p = point(-sign * 1.3, low), q = point(sign * 1.3, high);
        beam(p, q, .075, 0x817056);
        if (!coarse) for (const t of [.04, .96]) {
          const tie = new THREE.CylinderGeometry(.11, .11, .1, 6, 1, true);
          const dir = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]).normalize();
          tie.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
          tie.translate(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t);
          parts.push(paint(tie, 0xac966d));
        }
      }
    }
  }
  if (deckBraces && !fieldFrame) for (const side of [-1, 1]) {
    // 箕作の見張り床を受ける二方向の腕木。井桁の最上段から床の縁へ木口を出す。
    // 南の梯子は中央なので、左右の柱に付く短い斜材と交差しない。
    box(3.2, .16, .16, 0, H - .13, side * 1.3, 0x75634a);
    box(.16, .16, 3.2, side * 1.3, H - .29, 0, 0x66543e);
    if (!coarse) for (const corner of [-1, 1]) {
      beam([corner * 1.3, H - .95, side * 1.3], [corner * 1.52, H - .21, side * 1.3], .065, 0x6b5a44);
      beam([side * 1.3, H - 1.11, corner * 1.3], [side * 1.3, H - .37, corner * 1.52], .065, 0x62523e);
    }
  }
  if (boarded) {
    // 下半分は南面も梯子口の左右を板で覆う。中段の張り出しと腰板で二重の姿を出す。
    const mid = H * .5, bh = mid - .12;
    // 一枚壁に黒い線を貼らず、幅のある古板を並べる。根元の泥と上の褪せは頂点色で描く。
    // 遠景は面に戻し、南の九十五センチの上り口は同じ幅で残す。
    const panel = (x0, x1, z0, z1, seed) => {
      const len = Math.hypot(x1 - x0, z1 - z0), count = coarse ? 1 : Math.ceil(len / .24);
      const rot = Math.atan2(-(z1 - z0), x1 - x0);
      for (let i = 0; i < count; i++) {
        const t = (i + .5) / count, bottom = coarse ? 0 : h01(i + seed, 7) * .035;
        const g = new THREE.BoxGeometry(len / count - (coarse ? 0 : .008), bh - bottom, .08, 1, coarse ? 1 : 3, 1);
        // 下の一段だけを泥色にし、背の高い板全体へ黒ずみを引き伸ばさない。
        const p = g.attributes.position;
        if (!coarse) for (let j = 0; j < p.count; j++) {
          const u = p.getY(j) / (bh - bottom) + .5;
          p.setY(j, (u < .5 ? u * 3 * .5 : .5 + (u * 3 - 1) * (bh - bottom - .5) / 2) - (bh - bottom) / 2);
        }
        g.rotateY(rot); g.translate(x0 + (x1 - x0) * t, (bh + bottom) / 2, z0 + (z1 - z0) * t);
        parts.push(paintWorn(g, vary(0x66594b, i + seed), 0, mid));
      }
    };
    // 中段の腰板も幅のある縦板にする。近くだけ隙間と下端の傷みを付け、遠景は一面に戻す。
    const galleryPanel = (x0, x1, z0, z1, seed) => {
      const len = Math.hypot(x1 - x0, z1 - z0), count = coarse ? 1 : Math.ceil(len / .26);
      const rot = Math.atan2(-(z1 - z0), x1 - x0);
      for (let i = 0; i < count; i++) {
        const t = (i + .5) / count, chip = coarse ? 0 : h01(i + seed, 9) * .035;
        const g = new THREE.BoxGeometry(len / count - (coarse ? 0 : .008), .72 - chip, .07);
        g.rotateY(rot); g.translate(x0 + (x1 - x0) * t, mid + .42 + chip / 2, z0 + (z1 - z0) * t);
        parts.push(paintWorn(g, vary(0x705f4c, i + seed), 0, H));
      }
    };
    for (const side of [-1, 1]) {
      panel(side * 1.27, side * 1.27, -1.25, 1.25, side > 0 ? 17 : 3);
      panel(side * .475, side * 1.275, 1.27, 1.27, side > 0 ? 11 : 23);
      box(.48, .16, 3.25, side * 1.48, mid, 0, 0x66503b);
      galleryPanel(side * 1.68, side * 1.68, -1.625, 1.625, side > 0 ? 31 : 7);
      box(.13, .12, 3.4, side * 1.68, mid + .82, 0, 0x49392b);
      box(.8, .16, .48, side * 1.05, mid, 1.48, 0x66503b);
      galleryPanel(side * .65, side * 1.45, 1.68, 1.68, side > 0 ? 13 : 23);
    }
    panel(-1.25, 1.25, -1.27, -1.27, 29);
    // 張り出しと笠木は櫓の高さに合わせる。側面と重ねて二重に作らない。
    box(3.4, .16, .48, 0, mid, -1.48, 0x66503b);
    galleryPanel(-1.7, 1.7, -1.68, -1.68, 41);
    box(3.5, .12, .13, 0, mid + .82, -1.68, 0x49392b);
  }
  for (const z of [-.9, 0, .9]) box(3.45, .18, .18, 0, H - .12, z, 0x4e3d2e);
  if (fieldGallery) {
    // 指定した物見だけ、上の楯囲いの下へ張り出す見張り床を付ける。
    // 四周の床は中央を抜き、南面は既存の梯子と同じ口を開ける。
    const mid = H * .68, edge = 1.78, detailedFloor = fieldDetail && fieldLashings;
    // 姉川の近景は桁へ渡す短い床板。黒線を貼らず、板の隙間と木口を見せる。
    // 遠景と指定のない井楼は従来の一枚へ戻す。床の上面と梯子口は変えない。
    const plankFloor = (w, d, x, z, alongX, seed) => {
      if (!detailedFloor || coarse) { box(w, .1, d, x, mid, z, 0x938063); return; }
      const len = alongX ? w : d, count = Math.ceil(len / .23), step = len / count;
      for (let i = 0; i < count; i++) {
        const t = -len / 2 + (i + .5) * step;
        box(alongX ? step - .009 : w, .1, alongX ? d : step - .009,
          x + (alongX ? t : 0), mid, z + (alongX ? 0 : t),
          vary(i % 7 === 3 ? 0xa38c65 : 0x938063, i + seed));
      }
    };
    plankFloor(2.4, .62, 0, -1.5, true, 7);
    for (const yy of [mid + .38, mid + .82]) box(3.65, .075, .075, 0, yy, -edge, 0x807052);
    for (const side of [-1, 1]) {
      box(4.05, .18, .18, 0, mid - .16, side * 1.18, 0x655442);
      plankFloor(.62, 3.6, side * 1.5, 0, false, side > 0 ? 19 : 3);
      plankFloor(.72, .62, side * .84, 1.5, true, side > 0 ? 29 : 11);
      for (const yy of [mid + .38, mid + .82]) {
        box(.075, .075, 3.65, side * edge, yy, 0, 0x807052);
        box(1.3, .075, .075, side * 1.13, yy, edge, 0x807052);
      }
      for (const zz of [-edge, 0, edge]) box(.075, .9, .075, side * edge, mid + .45, zz, 0x6c5b44);
      box(.075, .9, .075, side * .48, mid + .45, edge, 0x6c5b44);
      if (!coarse && !detailedFloor) for (let i = -7; i <= 7; i++) {
        // 板の継ぎ目は近くだけ刻み、遠くは床と手すりの輪郭を残す。
        box(.6, .006, .014, side * 1.5, mid + .053, i * .23, 0x63523d);
      }
    }
    if (fieldDetail && !coarse) {
      // 写真の張り出し床は縦格子。横桟だけの柵にせず、南の梯子口は九十六センチ空ける。
      for (let i = -5; i <= 5; i++) {
        const t = i * .3;
        box(.055, .78, .055, t, mid + .43, -edge, 0x8b795b);
        if (Math.abs(t) > .48) box(.055, .78, .055, t, mid + .43, edge, 0x8b795b);
        for (const side of [-1, 1]) {
          if (i !== 0) box(.055, .78, .055, side * edge, mid + .43, t, 0x8b795b);
        }
      }
    }
  }
  // 板床は共通の室内の床。梯子の口を塞がない。
  const n = coarse ? 1 : 10;
  // 仮設井楼の指定がある時だけ、屋根の代わりに狭間のある置楯を横木へ結ぶ。
  // 遠くは穴を省き、同じ外形の板囲いにする。ほかの櫓の形は従来どおり。
  if (fieldFrame && !coarse) for (let face = 0; face < 4; face++) {
    const rot = face * Math.PI / 2;
    for (let i = 0; i < 5; i++) {
      if (face === 0 && i === 2) continue;
      const offset = face === 0 ? Math.sign(i - 2) * (.75 + (Math.abs(i - 2) - 1) * .56) : (i - 2) * .56;
      const shield = hiraTateGeo('tower', false, true).clone();
      if (fieldDetail) {
        // 指定した陣だけ、写真の黄味の強い木地へ。狭間の暗い木口と裏桟は残す。
        const colors = shield.attributes.color, positions = shield.attributes.position;
        const col = new THREE.Color(), timber = new THREE.Color(0xd0bd7c), foot = new THREE.Color(0x827052);
        for (let v = 0; v < colors.count; v++) {
          col.fromBufferAttribute(colors, v);
          if (col.r < .27 || col.g < .2) continue;
          col.lerp(timber, positions.getX(v) < 0 ? .72 : .58);
          col.lerp(foot, .32 * Math.max(0, 1 - positions.getY(v) / .3));
          colors.setXYZ(v, col.r, col.g, col.b);
        }
      }
      shield.rotateY(rot); shield.translate(Math.sin(rot) * 1.42 + Math.cos(rot) * offset,
        H + .03, Math.cos(rot) * 1.42 - Math.sin(rot) * offset);
      parts.push(shield);
      if (fieldLashings) for (const yy of [.35, 1.35]) for (const sx of [-.18, .18]) {
        // 楯を裏桟へ回して縛る縄の巻き目。同じ結合形へ入れ、狭間を塞がない。
        const tie = new THREE.BoxGeometry(.022, .14, .15);
        tie.translate(offset + sx, H + yy, 1.39); tie.rotateY(rot);
        parts.push(paint(tie, 0xb6a078));
      }
    }
    // 楯は黒帯を描かず、裏の横桟を上下二段で通して柱へ結ぶ。
    for (const yy of [.35, 1.35]) {
      for (const offset of face === 0 ? [-1.02, 1.02] : [0]) {
        const rail = new THREE.BoxGeometry(face === 0 ? 1.01 : 3.05, .09, .09);
        rail.translate(offset, H + yy, 1.33); rail.rotateY(rot);
        parts.push(paint(rail, 0x74654c));
      }
    }
  }
  if (!fieldFrame || coarse) for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
    const t = -1.4 + (i + .5) * 2.8 / n;
    // 常設の腰板は上端をそろえ、下端だけ欠けさせる。
    const chip = coarse || fieldFrame ? 0 : h01(i + side * 13, 4) * .045;
    const railH = (fieldFrame ? 1.63 : 1.15) - chip, railY = H + (fieldFrame ? .84 : .6) + chip / 2;
    // 上段の板囲いは各面二つの狭間を抜く。黒い板を貼らず、内からも外を見通せる穴にする。
    // 仮設井楼の遠景は、置楯と同じ明るい板色を保つ。
    const width = 2.8 / n - (coarse ? 0 : .012);
    const panel = (along, yy, w, h, cross) => {
      // 面ごとに板色をずらし、隣り合う面で同じ縞を繰り返さない。
      const seed = cross ? (side > 0 ? 29 : 11) : (side > 0 ? 17 : 3);
      const col = vary(fieldFrame ? (fieldDetail ? 0xc3ae77 : 0xa69072) : 0x746451, i + seed);
      const g = new THREE.BoxGeometry(cross ? .07 : w, h, cross ? w : .07);
      g.translate(cross ? side * 1.42 : along, yy, cross ? along : side * 1.42);
      const board = paint(g, col);
      if (!coarse && !fieldFrame) {
        // 腰板の笠木際は日褪せ、下端は雨だれ。同じ板の上下を頂点色で分ける。
        // 狭間を分割した板も、床からの高さを使い、穴ごとに汚れを繰り返さない。
        const p = board.attributes.position, colors = board.attributes.color, tint = new THREE.Color();
        const faded = new THREE.Color(0x9a9288), damp = new THREE.Color(0x463d32);
        for (let v = 0; v < p.count; v++) {
          const t = Math.max(0, Math.min(1, (p.getY(v) - H) / 1.2));
          tint.set(col).lerp(damp, (1 - t) * .24).lerp(faded, t * .22);
          colors.setXYZ(v, tint.r, tint.g, tint.b);
        }
      }
      parts.push(board);
    };
    for (const cross of [false, true]) {
      if (!cross && side === 1 && Math.abs(t) <= .45) continue;
      if (!coarse && (i === 2 || i === 7)) {
        const bottom = railY - railH / 2, holeY = H + .82, holeH = .22, holeW = .13;
        const lower = holeY - holeH / 2 - bottom, upper = bottom + railH - holeY - holeH / 2;
        panel(t, bottom + lower / 2, width, lower, cross);
        panel(t, holeY + holeH / 2 + upper / 2, width, upper, cross);
        for (const edge of [-1, 1]) panel(t + edge * (width + holeW) / 4, holeY, (width - holeW) / 2, holeH, cross);
      } else panel(t, railY, width, railH, cross);
    }
  }
  if (!fieldFrame && !coarse) for (const side of [-1, 1]) {
    // 横桟は狭間の上下へ通し、笠木は雨で褪せた色にする。南の梯子口は空ける。
    for (const yy of [.25, 1.02, 1.2]) {
      const h = yy === 1.2 ? .07 : .085, col = yy === 1.2 ? 0x887b65 : 0x514536;
      box(.09, h, 2.9, side * 1.36, H + yy, 0, col);
      if (side === -1) box(2.9, h, .09, 0, H + yy, -1.36, col);
      box(.98, h, .09, side * .96, H + yy, 1.36, col);
    }
  }
  // 南の梯子口は遠景でも開ける。
  if (coarse) for (const side of [-1, 1]) box(.95, fieldFrame ? 1.63 : 1.15, .07, side * .975, H + (fieldFrame ? .84 : .6), 1.42, fieldFrame ? (fieldDetail ? 0xc3ae77 : 0xa69072) : 0x746451);
  // 軒の内側で柱を止め、桁・妻の束・垂木で棟を支える。柱頭を屋根から突き出さない。
  if (!fieldFrame) for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam([sx * 1.28, H, sz * 1.28], [sx * 1.28, H + 1.9, sz * 1.28], .075, 0x554536);
  if (!fieldFrame && !coarse) for (const side of [-1, 1]) {
    beam([side * 1.28, H + 1.82, -1.45], [side * 1.28, H + 1.82, 1.45], .085, 0x554536);
    beam([-1.45, H + 1.82, side * 1.28], [1.45, H + 1.82, side * 1.28], .085, 0x554536);
    beam([0, H + 1.82, side * 1.28], [0, H + 2.35, side * 1.28], .065, 0x554536);
    for (const sx of [-1, 1]) beam([0, H + 2.35, side * 1.28], [sx * 1.8, H + 2.35 - 1.8 * Math.tan(.34), side * 1.28], .055, 0x62503d);
  }
  if (!fieldFrame) for (const side of [-1, 1]) {
    // 妻側の板張りは一重にし、桁より下の見張り窓を残す。遠景は二枚にまとめる。
    const boards = coarse ? 2 : 10, step = 3 / boards;
    for (let i = 0; i < boards; i++) {
      const g = new THREE.BoxGeometry(step - (coarse ? 0 : .008), 1, .055);
      const p = g.attributes.position, x = -1.5 + (i + .5) * step;
      for (let j = 0; j < p.count; j++) {
        const xx = p.getX(j) + x;
        p.setXYZ(j, xx, H + (p.getY(j) > 0 ? 2.38 - Math.abs(xx) * Math.tan(.34) : 1.82), p.getZ(j) + side * 1.48);
      }
      g.computeVertexNormals();
      parts.push(paint(g, vary(0x615343, i + (side > 0 ? 7 : 19))));
    }
  }
  if (!fieldFrame) for (const side of [-1, 1]) {
    // 短い板を軒から三段に重ねる。段ごとに継ぎ目を半枚ずらし、上の板が下の板を覆う。
    // 灰茶の古板と差し替えた茶色の板を混ぜ、遠景は従来と同じ一枚に戻す。
    const rows = coarse ? 1 : 3, step = .38;
    for (let row = 0; row < rows; row++) for (let i = 0; i < (coarse ? 1 : 10 + row % 2); i++) {
      const z0 = coarse ? -1.9 : Math.max(-1.9, -1.9 + (i - (row % 2) * .5) * step);
      const z1 = coarse ? 1.9 : Math.min(1.9, -1.9 + (i + 1 - (row % 2) * .5) * step);
      const roof = new THREE.BoxGeometry(coarse ? 2.05 : .75, .055, z1 - z0 - (coarse ? 0 : .01));
      roof.translate(side * (coarse ? .96 : .31 + row * .65),
        coarse ? 0 : (2 - row) * .03 + (i % 3) * .009, (z0 + z1) / 2);
      roof.rotateZ(-side * .34); roof.translate(0, H + 2.4, 0);
      const board = paint(roof, coarse ? 0x797363 : vary(i === 3 && row === 1 ? 0x806448 : 0x797363, i + row * 7 + (side > 0 ? 0 : 11)));
      if (!coarse) {
        // 軒へ流れる雨で板の先が黒ずむ。短い板の上手は褪せた木色にし、面は増やさない。
        const p = board.attributes.position, colors = board.attributes.color, tint = new THREE.Color();
        const wet = new THREE.Color(0x4e4538), dry = new THREE.Color(0xaaa08a);
        const middle = (.31 + row * .65) * Math.cos(.34);
        const stain = .18 + h01(i + row * 13, side + 8) * .12;
        for (let v = 0; v < p.count; v++) {
          const downhill = side * p.getX(v) > middle;
          tint.fromBufferAttribute(colors, v).lerp(downhill ? wet : dry, downhill ? stain : .12);
          colors.setXYZ(v, tint.r, tint.g, tint.b);
        }
      }
      parts.push(board);
    }
    if (!coarse) for (const x of [.65, 1.35]) beam([side * x, H + 2.43 - x * .34, -1.95], [side * x, H + 2.43 - x * .34, 1.95], .055, 0x514030);
  }
  // 妻板の継ぎ目と下桟。板張りを重ねず、既存の妻板の外面へ合わせる。
  if (!fieldFrame) for (const side of [-1, 1]) {
    if (!coarse) for (let i = -4; i <= 4; i++) {
      const px = i * .26, h = .56 - Math.abs(px) * Math.tan(.34);
      box(.025, h, .035, px, H + 1.82 + h / 2, side * 1.525, 0x483b2e);
    }
    box(2.75, .09, .13, 0, H + 1.82, side * 1.48, 0x4e3d2e);
  }
  if (!fieldFrame) beam([0, H + 2.43, -2], [0, H + 2.43, 2], .085, 0x4e3d2e);
  for (const x of [-.3, .3]) beam([x, 0, 2.9], [x, H + .9, 1.45], .045, 0x6b5640);
  // 高さが違っても踏桟は約三十センチ間隔。床より上は握るための縦木だけを残す。
  // 遠景は一段おきに省き、上り口と既存の梯子の当たりは変えない。
  const rungCount = Math.ceil(Math.hypot(H, 1.45 * H / (H + .9)) / .3);
  for (let i = 0; i < rungCount; i += coarse ? 2 : 1) {
    const t = (i + .5) / rungCount * H / (H + .9);
    beam([-.32, (H + .9) * t, 2.9 - 1.45 * t], [.32, (H + .9) * t, 2.9 - 1.45 * t], .035, 0x6b5640);
  }
  const geo = mergeGeometries(parts); parts.forEach(g => g.dispose()); LOOKOUT_GEO.set(key, geo);
  return geo;
}
function highLookout(world, x, z, o) {
  const rot = o.rot || 0, c = Math.cos(rot), s = Math.sin(rot), y = world.heightAt(x, z);
  // 十メートルの高井楼も、外の形・梯子・旗・兵が立つ室内の床を同じ高さにそろえる。
  const H = o.height ?? lookoutDeckHeight();
  const boarded = o.boarded ?? h01(x + 11, z + 5) > .66;
  const root = new THREE.Group(), lod = new THREE.LOD();
  // 指定した野戦の井楼だけ、樹皮の通し柱と皮を剥いだ横木を描き分ける。形は高さと遠近ごとに共有。
  const barkPosts = o.fieldFrame === true && o.barkPosts === true;
  // 城・砦・陣の共通形を垂直な井桁にそろえる。戦ごとの二重指定がなくても横木の木口を交互に出す。
  const logFrame = o.logFrame !== false;
  for (const coarse of [false, true]) {
    const m = new THREE.Mesh(highLookoutGeo(boarded, coarse, H, o.fieldFrame === true, o.fieldGallery === true, barkPosts, logFrame, o.fieldFrame === true && o.fieldDetail === true, o.fieldFrame === true && o.fieldLashings === true, o.crossLashings === true, o.fieldFrame === true && o.fieldBraces === true, world.def.lookoutDeckBraces === true), MAT());
    m.castShadow = !coarse; m.receiveShadow = true; m.userData.camBlock = true;
    if (barkPosts) {
      const key = `${H}:${coarse}`;
      if (!LOOKOUT_BARK_POSTS.has(key)) {
        const parts = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1])
          parts.push(paintWorn(logGeo([sx * 1.3, -.4, sz * 1.3],
            [sx * 1.3, H + 1.85, sz * 1.3], .16, .14, coarse ? 4 : 6, false), 0x817a68, 0, H));
        LOOKOUT_BARK_POSTS.set(key, mergeGeometries(parts));
        parts.forEach(g => g.dispose());
      }
      const posts = new THREE.Mesh(LOOKOUT_BARK_POSTS.get(key), BARK());
      posts.castShadow = !coarse; posts.receiveShadow = true; posts.userData.camBlock = true;
      const frame = new THREE.Group(); frame.add(m, posts); lod.addLevel(frame, coarse ? 85 : 0);
    } else lod.addLevel(m, coarse ? 85 : 0);
  }
  root.add(lod); root.position.set(x, y, z); root.rotation.y = rot;
  const feet = new THREE.InstancedMesh(LOOKOUT_FOOT(), barkPosts ? BARK() : MAT(), 4), matrix = new THREE.Matrix4();
  let footIndex = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = x + (sx * c + sz * s) * 1.3, pz = z + (-sx * s + sz * c) * 1.3;
    solidCircle(px, pz, .25);
    const bottom = Math.min(-.4, world.heightAt(px, pz) - y - .3), length = -.35 - bottom;
    matrix.makeScale(1, length, 1); matrix.setPosition(sx * 1.3, bottom + length / 2, sz * 1.3);
    feet.setMatrixAt(footIndex++, matrix);
  }
  feet.castShadow = true; feet.receiveShadow = true; root.add(feet);
  // 幟の形・布・紋も既存の共有部品。所属を指定できない場所は無地にする。
  const mon = o.mon || world.def.sides?.[o.team === 0 ? 'a' : 'b']?.mon || 'plain';
  // 写真のように櫓脇の地面へ幟を立てる。屋根を貫かず、梯子前も空ける。
  const flagX = -2.35, flagZ = 1.2;
  const wx = x + flagX * c + flagZ * s, wz = z - flagX * s + flagZ * c;
  const flag = nobori(world, wx, wz, mon, 4.6);
  flag.position.set(flagX, world.heightAt(wx, wz) - y, flagZ); root.add(flag);
  root.userData.naka = lookoutInside(world, x, z, o);
  if (o.fieldGallery) {
    // 板床の上面と足場を一致させる。中央と南の梯子口は抜いたまま。
    for (const [lx, lz, w, d] of [[0, -1.5, 2.4, .62], [-1.5, 0, .62, 3.6],
      [1.5, 0, .62, 3.6], [-.84, 1.5, .72, .62], [.84, 1.5, .72, .62]]) {
      addDeck({ cx: x + lx * c + lz * s, cz: z - lx * s + lz * c,
        x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2,
        rot, y: y + H * .68 + .05, pad: 0, name: '井楼の見張り床' });
    }
  }
  return root;
}

// 井楼櫓（物見の櫓）：皮つきの丸太の柱を四本、上へすぼめて立て、筋交いと横木を縄で結んで組む。足もとは盛り土。
// 上は腕木で張り出した床に、狭間を切った板の囲いと笠木、浅い切妻の板屋根（押さえ木と石を置く）。梯子は斜めに掛ける。木は灰茶に褪せた色
// o.kind：'ro'（屋根と板囲いの井楼櫓）・'seiro'（組上げ井楼：細い丸太を段ごとに横木で組み上げた臨時の見張り。屋根なし、上に盾を立てる）・
// 'kaidate'（揺楯櫓：上の囲いを板の代わりに掻楯（平盾）を並べて作る）。指定が無ければ場所で決まる（陣・砦ごとに混ざる）
export function yagura(world, x, z, o = {}) {
  return highLookout(world, x, z, o);
  const rot = o.rot || 0, c = Math.cos(rot), s = Math.sin(rot);
  const kind = o.kind || world.def.lookoutKind || ['ro', 'seiro', 'kaidate'][Math.min(2, Math.floor(h01(x * 0.37 + 11, z * 0.71 + 5) * 3))];
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solidCircle(x + (dx * c + dz * s) * 1.3, z + (-dx * s + dz * c) * 1.3, 0.5);
  const parts = [], y0 = world.heightAt(x, z), gy = (dx, dz) => world.heightAt(x + dx * c + dz * s, z - dx * s + dz * c) - y0;
  const H = o.height ?? 6.6, W0 = 1.3, W1 = o.logFrame ? 1.3 : 1.05;   // 柱は上へ少しすぼまる
  const colP = 0x5e5548, colB = 0x6e675a, rope = 0x6a5c44;
  const at = (sx, sz, y) => { const k = W0 + (W1 - W0) * (y / H); return [sx * k, y, sz * k]; };
  const band = (p, r) => { const g = new THREE.CylinderGeometry(r, r, 0.12, 6); g.translate(p[0], p[1], p[2]); parts.push(flat(g, rope)); };
  const seiro = kind === 'seiro';
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const b0 = at(dx, dz, gy(dx * W0, dz * W0) - 0.4), b1 = at(dx, dz, H + (seiro ? 1.3 : 0.25));
    parts.push(paintWorn(logGeo(b0, b1, seiro ? 0.1 : 0.14, seiro ? 0.075 : 0.1, 7), vary(colP, dx * 3 + dz), gy(dx * W0, dz * W0), H));
    // 足もとの盛り土と根石
    const m = new THREE.CylinderGeometry(0.34, 0.5, 0.3, 7); m.translate(dx * W0, gy(dx * W0, dz * W0) + 0.05, dz * W0); parts.push(flat(m, 0x5a4a36));
  }
  // 筋交い（四面をたすきに・二段）と横木（三段）。交わる所に縄
  const side = [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]];
  // 組上げ井楼：横木を 0.8m ごとに一周させ、角を縄で結ぶ（筋交いは入れない。組み立て式の枠を積み上げた形）
  if (seiro) for (const [ax, az, bx, bz] of side) for (let y = 0.45; y < H + 1.2; y += 0.8) {
    // 横木は柱の外へ突き出し、前後と左右を少し違う高さで組む。
    const yy = y + (ax === bx ? .12 : 0), p = at(ax, az, yy), q = at(bx, bz, yy);
    const dx = bx - ax, dz = bz - az;
    p[0] -= dx * .13; p[2] -= dz * .13; q[0] += dx * .13; q[2] += dz * .13;
    parts.push(paint(logGeo(p, q, .085, .075, 6), vary(0x776c54, y * 3 + ax * 2 + bz)));
    band(at(ax, az, yy), .16); band(at(bx, bz, yy), .16);
  }
  if (o.logFrame) for (const [ax, az, bx, bz] of side) for (let y = .4; y < H; y += .8) {
    // 横木を交互の高さで組み、柱の外へ丸太の木口を出す。
    const yy = y + (ax === bx ? .15 : 0);
    parts.push(paint(logGeo(at(ax * 1.18, az * 1.18, yy), at(bx * 1.18, bz * 1.18, yy), .11, .1, 5), vary(colB, y * 3 + az)));
  }
  if (!seiro && !o.logFrame) for (const [ax, az, bx, bz] of side) {
    for (const [ya, yb] of [[0.5, 3.1], [3.1, 5.7]]) {
      parts.push(paint(logGeo(at(ax, az, ya), at(bx, bz, yb), 0.05, 0.045, 5), vary(0x5a5346, ya * 10 + ax)));
      parts.push(paint(logGeo(at(bx, bz, ya), at(ax, az, yb), 0.05, 0.045, 5), vary(0x5a5346, ya * 10 + bz + 3)));
      const mid = at((ax + bx) / 2, (az + bz) / 2, (ya + yb) / 2); band(mid, 0.075);
    }
    for (const y of [0.5, 3.1, 5.7]) { const p = at(ax, az, y), q = at(bx, bz, y); parts.push(paint(logGeo(p, q, 0.06, 0.055, 5), vary(0x5e574a, y + ax * 2))); band(p, 0.16); }
  }
  // 二重の井楼は下半分を板で覆う。南の梯子口を空け、上は丸太組みを見せる。
  if (o.boarded) {
    for (const [ax, az, bx, bz] of side) {
      const ang = Math.atan2(-(bz - az), bx - ax);
      for (let i = 0; i < 8; i++) {
        const t = (i + .5) / 8, px = (ax + (bx - ax) * t) * 1.25, pz = (az + (bz - az) * t) * 1.25;
        if (az === 1 && bz === 1 && Math.abs(px) < .6) continue;
        const g = new THREE.BoxGeometry(.3, 2.8, .07); g.rotateY(ang); g.translate(px, 1.65, pz);
        parts.push(paint(g, vary(0x75634e, i)));
      }
    }
    const g = new THREE.BoxGeometry(2.55, .12, 2.55); g.translate(0, 3.12, 0); parts.push(paint(g, 0x544634));
  }
  // 床：太い腕木を二方へ張り出し、その上に板
  for (const s of [-0.9, 0, 0.9]) { const g = new THREE.BoxGeometry(3.4, 0.16, 0.16); g.translate(0, H - 0.12, s); parts.push(paint(g, 0x4e473c)); }
  // 床は室内の床を使う（石落としの口を塞がない）。
  // 板の囲い（縦の板を少しずつ不揃いに）。各面に狭間を二つ、上に笠木
  let k = 0;
  const E = 1.42;
  if (kind !== 'ro') {
    // 盾の囲い：平盾を表を外へ向けて並べる（揺楯櫓は一辺に三枚・組上げ井楼は二枚を上の横木に結ぶ）。梯子の口は空ける
    const per = 5;
    for (const [ax, az, bx, bz] of [[-E, -E, E, -E], [E, -E, E, E], [E, E, -E, E], [-E, E, -E, -E]]) {
      const nx = -(bz - az) / (2 * E), nz = (bx - ax) / (2 * E), face = Math.atan2(-nx, -nz);
      for (let i = 0; i < per; i++) {
        const t = (i + 0.5) / per, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        if (az === E && bz === E && Math.abs(px) < .55) continue;
        const g = hiraTateGeo(i % 2 ? 'sama' : 'plain', world.def.detailedBoardShields, true).clone();
        // 上の板囲いは盾の折り畳み脚を持たせず、外側の縄留めで立てる。
        g.rotateY(face); g.translate(px - nx * .15, H + .08, pz - nz * .15); parts.push(g); k++;
      }
    }
  }
  if (kind === 'ro') for (const [ax, az, bx, bz] of [[-E, -E, E, -E], [E, -E, E, E], [E, E, -E, E], [-E, E, -E, -E]]) {
    const L = Math.hypot(bx - ax, bz - az), n = 11, rot = Math.atan2(bx - ax, bz - az) + Math.PI / 2, nx = -(bz - az) / L, nz = (bx - ax) / L;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t, hb = 1.1 + h01(k, 4) * 0.08;
      if (az === E && bz === E && Math.abs(px) < .55) continue;
      const b = new THREE.BoxGeometry(L / n - 0.012, hb, 0.045); b.rotateZ((h01(k, 5) - 0.5) * 0.03); b.rotateY(rot); b.translate(px, H + 0.07 + hb / 2, pz); parts.push(paint(b, vary(colB, k++)));
    }
    for (const t of [0.3, 0.7]) { const hole = new THREE.BoxGeometry(0.16, 0.2, 0.06); hole.rotateY(rot); hole.translate(ax + (bx - ax) * t - nx * 0.01, H + 0.8, az + (bz - az) * t - nz * 0.01); parts.push(flat(hole, 0x0c0a08)); }
    if (az === E && bz === E) continue;
    const kasa = new THREE.BoxGeometry(L + 0.12, 0.08, 0.14); kasa.rotateY(rot); kasa.translate((ax + bx) / 2, H + 1.22, (az + bz) / 2); parts.push(paint(kasa, 0x4e473c));
  }
  // 屋根の柱と、浅い切妻の板屋根（長い板を重ねて葺き、押さえ木と石を置く）
  if (kind === 'ro') for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(paint(logGeo([dx * 1.28, H, dz * 1.28], [dx * 1.28, H + 2.15, dz * 1.28], 0.065, 0.06, 5), colP));
  if (kind === 'ro') for (const s of [1, -1]) {
    for (let q = 0; q < 7; q++) {
      const g = new THREE.BoxGeometry(1.95, 0.045, 0.52); g.translate(0.95 * s, (q % 2) * 0.03, -1.56 + q * 0.52); g.rotateZ(s * -0.34); g.translate(0, H + 2.4, 0);
      parts.push(paint(g, vary(0x5c564a, q + (s > 0 ? 0 : 9))));
    }
    const os = new THREE.CylinderGeometry(0.05, 0.05, 3.7, 5); os.rotateX(Math.PI / 2); os.translate(1.05 * s, H + 2.4 - 0.27, 0); parts.push(paint(os, 0x4a443a));
    for (const q of [-1.1, 0.2, 1.3]) { const st = new THREE.DodecahedronGeometry(0.13 + h01(q, s) * 0.06, 0); st.translate(1.05 * s, H + 2.4 - 0.2, q); parts.push(flat(st, 0x77736a)); }
  }
  if (kind === 'ro') { const rid = new THREE.CylinderGeometry(0.07, 0.07, 3.8, 5); rid.rotateX(Math.PI / 2); rid.translate(0, H + 2.42, 0); parts.push(paint(rid, 0x4a443a)); }
  // 梯子：地面から床の縁へ斜めに掛け、段は縄で結ぶ
  const f0 = 2.9, fy = gy(0, f0);
  for (const lx of [-0.3, 0.3]) parts.push(paint(logGeo([lx, fy - 0.1, f0], [lx, H + 0.9, 1.45], 0.045, 0.04, 5), 0x5a5346));
  const rungs = Math.ceil(H / .55);
  for (let r = 0; r < rungs; r++) { const t = (r + 0.6) / (rungs + .5), yy = fy + (H + 0.9 - fy) * t, zz = f0 + (1.45 - f0) * t; const rung = new THREE.CylinderGeometry(0.03, 0.03, 0.64, 4); rung.rotateZ(Math.PI / 2); rung.translate(0, yy, zz); parts.push(paint(rung, 0x6e675a)); }
  const m = merged(parts);
  m.position.set(x, y0, z); m.rotation.y = rot;
  m.userData.naka = lookoutInside(world, x, z, o);
  return m;
}
// 土塁：柵の外に盛った土の斜面（草が生え、裾は土が出る）。seg に沿って、外の向き (nx, nz) へ w m 下る。h は柵の足もとの高さ
export function dorui(world, seg, nx, nz, o = {}) {
  const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az), w = o.w || 3.2, h = o.h || 0.7;
  // 盛り土の上面も弾よけにする。移動の当たりは増やさない。
  if (!o.surfaceOnly) (world.missileEarth || (world.missileEarth = [])).push({ ax, az, bx, bz, nx, nz, w, h, len2: len * len,
    x0: Math.min(ax, bx, ax + nx * w, bx + nx * w) - 0.3,
    x1: Math.max(ax, bx, ax + nx * w, bx + nx * w) + 0.3,
    z0: Math.min(az, bz, az + nz * w, bz + nz * w) - 0.3,
    z1: Math.max(az, bz, az + nz * w, bz + nz * w) + 0.3 });
  const n = Math.max(2, Math.round(len / (o.surfaceOnly ? 2.5 : 1.5))), pos = [], col = [];
  // 普請したばかりの土塁だけ土色にする。既存の草の土塁は同じ色を保つ。
  const cT = new THREE.Color(o.bareSoil ? 0x817052 : 0x5f7a3c), cM = new THREE.Color(o.bareSoil ? 0x7c694d : 0x6c7a44), cB = new THREE.Color(0x7a6448);
  const V = (t, u) => {
    const x = ax + (bx - ax) * t + nx * (u * w - 0.3), z = az + (bz - az) * t + nz * (u * w - 0.3);
    const j = Math.sin(t * 17 + u * 5 + ax) * 0.06;
    return [x, world.heightAt(x, z) + (o.surfaceOnly ? 0.09 : Math.max(0, h * (1 - u * u)) + j - (u > 0.98 ? 0.1 : 0)), z];
  };
  // 色：上は草、法面は草と崩れた土のまだら（雨で流れた筋）、裾は踏まれた土
  const cD = new THREE.Color(0x6a5238);
  const C = (t, u) => {
    const c = u < 0.3 ? cT.clone().lerp(cM, u / 0.3) : cM.clone().lerp(cB, (u - 0.3) / 0.7);
    const bare = h01(Math.floor(t * len * 0.8) + ax, 3.3) * (u > 0.2 && u < 0.9 ? 1 : 0.3);
    if (bare > 0.55) c.lerp(cD, (bare - 0.55) * 1.6);
    const f = 0.86 + h01(t * len * 3 + az, u * 9) * 0.22; return [c.r * f, c.g * f, c.b * f];
  };
  const US = [0, 0.15, 0.3, 0.48, 0.65, 0.82, 1];
  for (let i = 0; i < n; i++) for (let q = 0; q < US.length - 1; q++) {
    const t0 = i / n, t1 = (i + 1) / n, u0 = US[q], u1 = US[q + 1];
    const quad = [[t0, u0], [t1, u0], [t1, u1], [t0, u0], [t1, u1], [t0, u1]];
    for (const [t, u] of quad) { pos.push(...V(t, u)); col.push(...C(t, u)); }
  }
  // 指定した土塁だけ端を地面まで閉じる。法面を裏から見ても中空の薄板にしない。
  if (o.capEnds) for (const t of [0, 1]) for (let q = 0; q < US.length - 1; q++) {
    const a = V(t, US[q]), b = V(t, US[q + 1]);
    const ga = [a[0], world.heightAt(a[0], a[2]) - .12, a[2]];
    const gb = [b[0], world.heightAt(b[0], b[2]) - .12, b[2]];
    const tint = C(t, .85);
    for (const p of [a, ga, gb, a, gb, b]) { pos.push(...p); col.push(...tint); }
  }
  // 指定した土塁は高い側も地面へ閉じる。裏から薄い庇に見える隙間を残さない。
  if (o.closeBack && !o.surfaceOnly) for (let i = 0; i < n; i++) {
    const a = V(i / n, 0), b = V((i + 1) / n, 0);
    const ga = [a[0], world.heightAt(a[0], a[2]) - .12, a[2]];
    const gb = [b[0], world.heightAt(b[0], b[2]) - .12, b[2]];
    const tint = C(i / n, .85);
    for (const p of [a, b, gb, a, gb, ga]) { pos.push(...p); col.push(...tint); }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // 同じ点をつなぎ、法面の三角ごとの折り目を消す。面の数は増やさない。
  const joined = mergeVertices(g); g.dispose(); g = joined;
  g.computeVertexNormals();
  if (o.batch) return pushSimpleBatch(o.batch, g, doruiMaterial());
  // 巻きの向きで裏返っていても見えるよう両面で
  const m = new THREE.Mesh(g, doruiMaterial());
  m.receiveShadow = true;
  return m;
}
const bankPlainMaterial = lazy(() => makeBankMaterial(false));
const bankDetailMaterial = lazy(() => makeBankMaterial(true));
const doruiMaterial = () => bankDetailMaterial();
function makeBankMaterial(detail) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  // 材質と絵は全土塁で共用。世界の座標で貼り、長い緑の板や継ぎ目にしない。
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tBankGrass = { value: grassTex() }; sh.uniforms.tBankDirt = { value: bankTex() };
    sh.vertexShader = 'varying vec3 vBankWP;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vBankWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform sampler2D tBankGrass, tBankDirt;\nvarying vec3 vBankWP;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      // 面の本当の向きで貼る：立った面は横から（x か z の向き）、寝た面は上から。斜めに一枚で貼ると立った面で絵が伸びる
      vec3 bankN = abs(normalize(cross(dFdx(vBankWP), dFdy(vBankWP))));
      vec2 sideUV = bankN.x > bankN.z ? vBankWP.zy : vBankWP.xy;
      float topK = smoothstep(0.45, 0.8, bankN.y);
      float bankGrass = clamp((vColor.g - vColor.r + 0.03) * 9.0, 0.0, 1.0);
      vec3 bankG = mix(texture2D(tBankGrass, sideUV * 0.21).rgb, texture2D(tBankGrass, vBankWP.xz * 0.21).rgb, topK);
      vec3 bankD = mix(texture2D(tBankDirt, sideUV * 0.23).rgb, texture2D(tBankDirt, vBankWP.xz * 0.23).rgb, topK);
      bankD = mix(bankD, vec3(dot(bankD, vec3(0.333))) * vec3(1.06, 0.97, 0.86), 0.4);   // 赤土の絵は色が強すぎる。日本の山の褐色の土へ寄せる
      // 頂点の草・土色は混ぜる割合に使い、暗い色を二重に掛けない。
      ${detail ? `
      // 草の斜面は刈りそろえた緑一色にせず、枯れ草の塊と斜面を下る細い雨筋を混ぜる。
      float dryPatch = smoothstep(-0.4, 0.7, sin(vBankWP.x * 0.63) * cos(vBankWP.z * 0.81));
      float straw = dot(bankG, vec3(0.299, 0.587, 0.114));
      bankG = mix(bankG, straw * vec3(1.16, 1.08, 0.76), 0.22 + dryPatch * 0.42);
      float across = vBankWP.x * bankN.z - vBankWP.z * bankN.x;
      float runoff = smoothstep(0.68, 0.96, sin(across * 8.1 + sin(across * 1.7)));
      bankD *= 1.0 - runoff * (1.0 - topK) * 0.16;
      bankGrass *= 1.0 - runoff * (1.0 - topK) * 0.3;
      ` : ''}
      diffuseColor.rgb *= mix(bankD, bankG, bankGrass) / max(vColor, vec3(0.035));
      ${detail ? `
      // 頂点に残した裾の湿りと天端の日焼け。色の二重掛けにはせず、明るさだけを穏やかに戻す。
      diffuseColor.rgb *= clamp(0.65 + dot(vColor, vec3(0.299, 0.587, 0.114)) * 1.3, 0.72, 1.08);
      ` : ''}`);
  };
  return mat;
}
// 細い丸太を格子に組んだ低い柵（曲輪の中の仕切り・畑の囲い）
export function koshisaku(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az), H = o.h || 1.2, parts = [];
  if (len < .01) return new THREE.Group();
  const n = Math.max(2, Math.round(len / 0.5));
  const anchors = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = world.heightAt(x, z);
    const r = h01(x, z), top = y + H + (r - .5) * .12;
    const p = logGeo([x, y - .2, z], [x + (r - .5) * .035, top, z], .045, .031, 4, false);
    parts.push(paintWorn(p, vary(0x80705a, i), y, H));
    if (i % 3 === 0 || i === n) anchors.push([x, y, z]);
    // 一つおきの杭だけ藁縄を巻く。丸太の面を減らした分に収める。
    if (i % 2 === 0) {
      const tie = FENCE_TIE().clone(); tie.scale(.061, .7, .061); tie.translate(x, y + H - .12, z);
      parts.push(flat(tie, 0x9b8965));
    }
  }
  for (const hy of [.35, H - .1]) for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    // 横木を地表へ沿わせ、山腹で浮いた長い棒にしない。
    parts.push(paintWorn(logGeo([a[0], a[1] + hy, a[2] + .035], [b[0], b[1] + hy, b[2] + .035], .035, .028, 4), 0x786750, Math.min(a[1], b[1]), H));
  }
  return merged(parts, MAT(), o.batch);
}

let CAMPFIRE_GEO = null;
export function campfire(world, x, z) {
  if (!CAMPFIRE_GEO) {
    const parts = [];
    const ash = new THREE.SphereGeometry(1, 10, 4);
    ash.scale(0.48, 0.055, 0.42); ash.translate(0, 0.035, 0);
    parts.push(paint(ash, 0x696157));
    for (let i = 0; i < 5; i++) {
      const log = new THREE.CylinderGeometry(0.075, 0.09, 0.68 + i * 0.025, 8);
      log.rotateZ(Math.PI / 2 - 0.12 - (i % 2) * 0.15);
      log.rotateY(i * 1.25);
      log.translate(Math.sin(i * 2.4) * 0.09, 0.13 + (i % 2) * 0.065, Math.cos(i * 2.4) * 0.06);
      parts.push(paint(log, i % 2 ? 0x34271d : 0x4a3828));
    }
    CAMPFIRE_GEO = mergeGeometries(parts);
    for (const g of parts) g.dispose();
  }
  const m = new THREE.Mesh(CAMPFIRE_GEO, MAT());
  m.receiveShadow = true;
  m.position.set(x, world.heightAt(x, z), z);
  return m;
}

// 普請の足場（丸太を組んだ枠）
export function scaffold(world, x, z, rot = 0) {
  { const c = Math.cos(rot), sn = Math.sin(rot); for (const [dx, dz] of [[-2, -1], [2, -1], [-2, 1], [2, 1]]) solidCircle(x + dx * c + dz * sn, z - dx * sn + dz * c, 0.2); }
  const parts = [];
  const H = 4.2;
  for (const [dx, dz] of [[-2, -1], [2, -1], [-2, 1], [2, 1]]) {
    const p = new THREE.CylinderGeometry(0.07, 0.08, H, 5);
    p.translate(dx, H / 2, dz);
    parts.push(paint(p, 0x7a5c3c));
  }
  for (const y of [1.4, 2.8, 4.0]) {
    for (const [ax, az, bx, bz] of [[-2, -1, 2, -1], [-2, 1, 2, 1], [-2, -1, -2, 1], [2, -1, 2, 1]]) {
      const len = Math.hypot(bx - ax, bz - az);
      const b = new THREE.CylinderGeometry(0.05, 0.05, len, 4);
      b.rotateZ(Math.PI / 2);
      b.rotateY(Math.atan2(bx - ax, bz - az) - Math.PI / 2);
      b.translate((ax + bx) / 2, y, (az + bz) / 2);
      parts.push(paint(b, 0x6b5238));
    }
  }
  const plank = new THREE.BoxGeometry(4.2, 0.08, 2.2);
  plank.translate(0, 2.85, 0);
  parts.push(paint(plank, 0x8a6b48));
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  m.rotation.y = rot;
  return m;
}

// 門の角材：一枚の木肌を部材いっぱいに伸ばさず、横幅四十五センチ・長手二・四メートルで繰り返す。
// 回転前の材の軸で貼り、横梁も斜めの葺き板も繊維を長手へ通す。
// 頂点と絵・材質は増やさず、木口と下面の暗さを既存の頂点色へ焼き込む。
function gateTimberBox(w, h, d, hex, axis = h >= w && h >= d ? 1 : w >= d ? 0 : 2, offset = 0, widthRepeat = .45, lengthRepeat = 2.4) {
  const g = paint(new THREE.BoxGeometry(w, h, d), hex);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, color = g.attributes.color;
  const cross = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  const component = (a, i, k) => k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : a.getZ(i);
  for (let i = 0; i < p.count; i++) {
    const end = Math.abs(component(n, i, axis)) > .5;
    // 面に垂直な軸を除いて幅を拾う。柱の四面と梁の下面で木目の寸法をそろえる。
    const side = end || Math.abs(component(n, i, cross[0])) > .5 ? cross[1] : cross[0];
    uv.setXY(i, component(p, i, side) / widthRepeat + offset,
      end ? component(p, i, cross[0]) / widthRepeat : component(p, i, axis) / lengthRepeat);
    const shade = end ? .72 : n.getY(i) < -.5 ? .78 : 1;
    color.setXYZ(i, color.getX(i) * shade, color.getY(i) * shade, color.getZ(i) * shade);
  }
  return g;
}

// 門の小屋組。同じ寸法の門は形と木材を共有し、遠くでは垂木を省く。
const gateFrameShapes = new Map();
export function gateRoofFrame(w, o = {}) {
  const eave = o.eave ?? 3.62, half = o.half ?? 1.45, rise = o.rise ?? .88;
  const offset = o.offset ?? 0, curved = !!o.curved;
  const key = [w, eave, half, rise, offset, curved].join(':');
  let shapes = gateFrameShapes.get(key);
  if (!shapes) {
    const frame = [], rafters = [], profile = (t) => eave + rise * (curved ? .5 * t + .5 * t * t : t);
    // 角材の木目を実寸へ。下面・木口の暗さは頂点色で付け、別の影の絵は増やさない。
    const beam = (parts, px, py, pz, bw, bh, bd, angle = 0, tone = 0x665642) => {
      const g = gateTimberBox(bw, bh, bd, tone);
      g.rotateX(angle); g.translate(px, py, pz); parts.push(g);
    };
    for (const sx of [-1, 1]) {
      const px = sx * (w / 2 + .17);
      // 本柱上の梁を控柱まで通し、その上の束で棟木を受ける。
      beam(frame, px, 3.48, offset, .28, .28, half * 2 + .12);
      const top = profile(1) - .16;
      beam(frame, px, (3.6 + top) / 2, offset, .22, top - 3.6 + .08, .22);
      for (const side of [-1, 1]) {
        const t = .16;
        beam(frame, px, (3.6 + profile(t) - .16) / 2, offset + side * half * (1 - t),
          .18, Math.max(.12, profile(t) - .16 - 3.6 + .08), .18);
      }
    }
    for (const t of [0, 1]) for (const side of t === 1 ? [1] : [-1, 1])
      beam(frame, 0, profile(t) - .16, offset + side * half * (1 - t), w + 1.35, .2, .18, 0, 0x514333);
    const count = Math.min(18, Math.ceil((w + 1.2) / .75)), segments = curved ? 3 : 1;
    for (let i = 0; i <= count; i++) for (const side of [-1, 1]) for (let j = 0; j < segments; j++) {
      const t0 = j / segments, t1 = (j + 1) / segments;
      const y0 = profile(t0), y1 = profile(t1), run = half * (t1 - t0);
      beam(rafters, -(w + 1.2) / 2 + i * (w + 1.2) / count, (y0 + y1) / 2 - .08,
        offset + side * half * (1 - (t0 + t1) / 2), .09, .12,
        Math.hypot(run, y1 - y0) + .06, side * Math.atan2(y1 - y0, run));
    }
    shapes = { near: mergeGeometries([...frame, ...rafters]), far: mergeGeometries(frame) };
    for (const g of [...frame, ...rafters]) g.dispose();
    gateFrameShapes.set(key, shapes);
  }
  const lod = new THREE.LOD();
  for (const [geometry, distance] of [[shapes.near, 0], [shapes.far, 45]]) {
    const m = new THREE.Mesh(geometry, MAT());
    m.castShadow = m.receiveShadow = true; m.userData.camBlock = true;
    lod.addLevel(m, distance);
  }
  return lod;
}

// 冠木門：角に削った本柱を礎石に立て（根巻きの鉄）、上に冠木と貫を渡し、後ろの控柱と貫で結ぶ。冠木の上に板葺きの小さな切妻。
// 扉は内（-z）へ開いたまま：縦の板に横桟と斜めの筋交い、鉄の乳金物と肘金。脇に外した閂を立て掛ける。o.roof = false で屋根なし
export function kabukimon(world, x, z, w = 6.4, rot = 0, o = {}) {
  const parts = [], backing = [];
  // 高さは図の城門（三メートルほど）に合わせる：扉の上に貫、その上に冠木
  const H = o.groundedGate ? 3.5 : 3.3, y0 = world.heightAt(x, z);
  const c = Math.cos(rot), sn = Math.sin(rot), gy = (lx, lz) => world.heightAt(x + lx * c + lz * sn, z - lx * sn + lz * c) - y0;
  // 冠木と柱は従来の木目寸法を保ち、共通部品の木口・下面の陰影も使う。
  const timber = (bw, bh, bd, hex) => gateTimberBox(bw, bh, bd, hex, undefined, 0, .32, 1.6);
  const box = (hex, px, py, pz, bw, bh, bd, ry = 0, rz = 0, fl = false) => { const g = fl ? new THREE.BoxGeometry(bw, bh, bd) : timber(bw, bh, bd, hex); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(px, py, pz); parts.push(fl ? flat(g, hex) : g); };
  const IRONC = 0x1c1a18;
  for (const sx of [-1, 1]) {
    const px = sx * (w / 2 + 0.17), g0 = gy(px, 0);
    // 本柱（角材・褪せた灰茶）と礎石・根巻き
    const pw = o.groundedGate ? .4 : .36;
    const post = timber(pw, H - g0 + 0.3, pw, 0x6a6254); post.translate(px, (H + g0 - 0.3) / 2, 0); parts.push(paintWorn(post, vary(0x6a6254, sx + 2), g0, H));
    box(0x7a766c, px, g0 - 0.02, 0, 0.7, 0.2, 0.7, 0.3 * sx, 0, true);
    box(IRONC, px, g0 + 0.3, 0, 0.4, 0.34, 0.4, 0, 0, true);
    // 控柱と、本柱と結ぶ貫（二段）
    const bz = -1.6, gb = gy(px, bz);
    const kH = o.yakui ? H + 0.15 : 2.5, kw = o.yakui ? 0.3 : 0.24;   // 薬医門の控柱は屋根まで立つ
    const kp = timber(kw, kH - gb + 0.2, kw, 0x645c4e); kp.translate(px, (kH + gb - 0.2) / 2, bz); parts.push(paintWorn(kp, vary(0x645c4e, sx + 5), gb, kH));
    box(0x7a766c, px, gb - 0.02, bz, 0.5, 0.16, 0.5, 0, 0, true);
    for (const hy of [0.9, 2.25]) box(0x564e42, px, hy, bz / 2, 0.14, 0.2, -bz + 0.3);
    // 扉：肘金（蝶番）を軸に内へ開く（o.doors === false の時は描かない。閉じた扉は tobira を別に置く）
    if (o.doors !== false) {
    // 三木の指定だけ扉を直角まで開き、門の中央へ張り出させない。
    const openFlat = true && o.openFlat === true;
    const dw = w / 2 - 0.05, th = openFlat ? Math.PI / 2 : 1.15, r = sx < 0 ? th : Math.PI - th, hx = sx * (w / 2 - 0.02), hz = -0.1;
    const foot = o.groundedGate ? Math.max(g0, gy(hx, hz - dw)) : 0;
    const door = (hex, lx, ly, lz, bw, bh, bd, rz = 0, fl = false) => { const g = fl ? new THREE.BoxGeometry(bw, bh, bd) : gateTimberBox(bw, bh, bd, hex, undefined, lx * 1.7); if (rz) g.rotateZ(rz); g.translate(lx, ly, lz); g.rotateY(r); g.translate(hx, 0, hz);
      // 坂の木戸は扉の下端を門内の高い足場へ合わせ、上端は冠木の下へ収める。
      if (o.groundedGate) {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          // 三木だけ、下端を坂に沿って切り詰める。高い端の高さで扉全体を浮かせない。
          const sill = o.slopeDoorBottom ? gy(p.getX(i), p.getZ(i)) : foot;
          p.setY(i, sill + p.getY(i) * Math.max(.2, (H - sill) / H));
        }
        g.computeVertexNormals();
      }
      parts.push(fl ? flat(g, hex) : openFlat ? paintWorn(g, hex, 0, H) : g); };
    const np = 6;
    for (let i = 0; i < np; i++) door(vary(0x6d6558, i + (sx > 0 ? 7 : 0)), (i + 0.5) * dw / np, 1.55, 0, dw / np - 0.015, 2.9 - (i % 2) * 0.03, 0.07);
    for (const hy of [0.45, 1.55, 2.65]) door(0x4e473c, dw / 2, hy, -0.07, dw - 0.1, 0.16, 0.07);
    door(0x4e473c, dw / 2, 1.0, -0.075, Math.hypot(dw - 0.3, 1.0), 0.13, 0.06, Math.atan2(1.0, dw - 0.3) * (sx < 0 ? -1 : 1) * -1);
    for (const hy of [0.45, 1.55, 2.65]) {
      door(IRONC, 0.25, hy, 0.045, 0.5, 0.1, 0.02, 0, true);                         // 肘金の帯
      for (let q = 1; q < 5; q++) door(0x2a2622, q * dw / 5, hy, 0.05, 0.07, 0.07, 0.03, 0, true);   // 乳金物
    }
    }
  }
  // 冠木と貫（冠木は柱より両へ長く突き出す）。冠木の上の板葺きの小屋根
  box(0x5c5548, 0, H + 0.02, 0, w + 1.9, 0.36, 0.4);
  box(0x655d50, 0, H - 0.27, 0, w + 0.9, 0.18, 0.16);
  for (const sx of [-1, 1]) box(0x4e473c, sx * (w / 2 + 0.17), H - 0.27, 0, 0.1, 0.24, 0.24, 0, 0, true);   // 貫の楔
  const nRoof0 = parts.length;
  if (o.roof !== false) {
    // 板葺きの切妻：軒で緩く棟で急な反りの面に、短い板を段に重ねて葺く（一段ごとに下の段へ被さり、上から段の筋が見える）。
    // 棟は箱棟、妻は反りに沿った破風板と懸魚
    // 薬医門（o.yakui）：本柱と控柱の間の真ん中に棟を置き、四本の柱をまとめて覆う大きな切妻（館・寺の表門）
    const YK = !!o.yakui, L = w + (YK ? 2.2 : 2.6), Z = YK ? 2.35 : 1.45, yE = H + 0.32, yR = H + (YK ? 1.75 : 1.2), NR = YK ? 8 : 6;
    const prof = (t) => yE + (yR - yE) * (0.5 * t + 0.5 * t * t);   // t：0 = 軒・1 = 棟
    for (const s of [1, -1]) {
      for (let q = 0; q < NR; q++) {
        const t0 = q / NR, t1 = (q + 1) / NR, z0 = s * Z * (1 - t0), z1 = s * Z * (1 - t1), y0 = prof(t0), y1 = prof(t1);
        const sl = Math.hypot(z1 - z0, y1 - y0) + 0.1, ang = Math.atan2(y1 - y0, Math.abs(z1 - z0));
        // 高遠の指定だけ、短い葺き板の下へ連続した野地板を通す。
        // 板の目地や段の境から空が抜けず、門の下から見ても屋根が閉じる。
        // 同じ木材の形へ結合するので、描く回数と材質は増やさない。
        if (world.def.gateRoofBacking) {
          const base = gateTimberBox(L, .09, sl + .06, 0x4e473c);
          if (o.roofBackingMaterial) {
            const p = base.attributes.position, uv = base.attributes.uv;
            for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / .65, p.getZ(i) / 1.4);
          }
          base.rotateX(s * ang);
          base.translate(0, (y0 + y1) / 2 - .045, (z0 + z1) / 2 - s * .04);
          (o.roofBackingMaterial ? backing : parts).push(base);
        }
        let xx = -L / 2, k = 0;
        while (xx < L / 2 - 0.05) {
          const pw = Math.min(L / 2 - xx, 0.7 + h01(q * 13 + k, s + 3) * 0.7);
          const g = gateTimberBox(pw - 0.015, 0.045, sl, vary(0x5c564a, q * 7 + k + (s > 0 ? 0 : 3)), 2, k * .37 + q * .19);
          g.rotateX(s * ang); g.translate(xx + pw / 2, (y0 + y1) / 2 + 0.03 + (q % 2) * 0.012, (z0 + z1) / 2 - s * 0.04);
          parts.push(g);
          xx += pw; k++;
        }
      }
      // 破風板：両の妻で反りに沿って折る
      for (const sx of [-1, 1]) for (let q = 0; q < 3; q++) {
        const t0 = q / 3, t1 = (q + 1) / 3;
        parts.push(paint(logGeo([sx * (L / 2 + 0.03), prof(t0) - 0.08, s * Z * (1 - t0) + s * 0.08], [sx * (L / 2 + 0.03), prof(t1) - 0.08, s * Z * (1 - t1)], 0.09, 0.09, 4, false), 0x3e3830));
      }
    }
    box(0x4a443a, 0, yR + 0.12, 0, L + 0.1, 0.24, 0.34);            // 箱棟
    box(0x3e3830, 0, yR + 0.27, 0, L + 0.2, 0.06, 0.46);            // 棟の上の冠の板
    for (const sx of [-1, 1]) box(0x6a5c44, sx * (L / 2 + 0.05), yR - 0.25, 0, 0.05, 0.4, 0.3, 0, 0, true);   // 懸魚
    for (let q = -2; q <= 2; q++) box(0x4e473c, q * w / 5, H + 0.28, 0, 0.1, 0.14, 1.6);                   // 垂木の先（冠木の上の梁）
  }
  if (o.yakui && o.roof !== false) {
    // 薬医門：冠木から控柱へ渡す男梁（腕木）と、その上の束。屋根の部品をまとめて控柱の側へ寄せる
    for (const sx of [-1, 1]) {
      box(0x4e473c, sx * (w / 2 + 0.17), H + 0.26, 0, 0.22, 0.26, 2.3);
      box(0x564e42, sx * (w / 2 + 0.17), H + 0.62, 0, 0.16, 0.5, 0.16);
    }
    box(0x564e42, 0, H + 0.9, 0, w + 0.8, 0.18, 0.18);   // 棟木の下の桁
    for (let i = nRoof0; i < parts.length; i++) parts[i].translate(0, 0, -0.8);
  }
  const roofGeos = parts.splice(nRoof0);   // 屋根の部品は別の Mesh にして、素材の屋根が読めたら入れ替える（props_ext.js の extGateRoof）
  // 外した閂（柱に立て掛けて）
  box(0x5a5040, -w / 2 + 0.35, 1.2 + gy(-w / 2 + 0.35, -0.5), -0.5, 0.14, 2.6, 0.14, 0, 0.2);
  const m = merged(parts);
  if (backing.length) {
    const underside = merged(backing, o.roofBackingMaterial);
    underside.castShadow = false; m.add(underside);
  }
  let roofM = null;
  if (roofGeos.length) { roofM = merged(roofGeos); m.add(roofM); }
  if (o.roof !== false && true) m.add(gateRoofFrame(w, {
    eave: H + .32,
    half: o.yakui ? 2.35 : 1.45, rise: o.yakui ? 1.43 : .88,
    offset: o.yakui ? -.8 : 0, curved: true,
  }));
  m.position.set(x, y0, z);
  m.rotation.y = rot;
  if (roofM && o.tileRoof === true && w >= 4.2) extGateRoof(m, roofM, w, H);   // 瓦葺きの根拠がある門だけ
  m.userData.kabuki = true;   // 木戸（castle_parts.kido）が同じ所に門構えを二重に建てないための印
  return m;
}

// 門の扉の一枚（閉じた形）の部品：縦の板を並べ、外の面（+z）に肘金の帯と乳金物、内の面（-z）に貫三段と筋交い。
// 左右の真ん中が x=0・足もとが y=0。hinge は肘金の側（1 = +x の縁）
function leafParts(parts, lw, h, hinge, k0 = 0) {
  const B = (hex, px, py, pz, bw, bh, bd, rz = 0) => { const g = new THREE.BoxGeometry(bw, bh, bd); if (rz) g.rotateZ(rz); g.translate(px, py, pz); parts.push(paint(g, hex)); };
  const np = Math.max(3, Math.round(lw / 0.45));
  for (let i = 0; i < np; i++) {
    const col = vary(0x5a4a38, i + k0 + (hinge < 0 ? 11 : 0));
    const bh = h - (i % 2) * 0.03;
    // 根元の濡れと中段の乾きを分け、木目は板ごとにずらす。既存の扉の束へ結合する。
    for (let row = 0; row < 3; row++) {
      const g = new THREE.BoxGeometry(lw / np - 0.012, bh / 3, 0.09);
      g.translate(-lw / 2 + (i + 0.5) * lw / np, bh * (row + 0.5) / 3, 0);
      parts.push(paintWorn(g, col, 0, h));
    }
  }
  for (const f of [0.14, 0.5, 0.86]) B(0x3e3226, 0, h * f, -0.08, lw - 0.08, 0.18, 0.08);          // 貫（内）
  const dl = Math.hypot(lw - 0.2, h * 0.36);
  B(0x3a2e22, 0, h * 0.32, -0.08, dl, 0.14, 0.07, Math.atan2(h * 0.36, lw - 0.2) * -hinge);       // 筋交い（内）
  for (const f of [0.14, 0.5, 0.86]) {
    B(0x1c1a18, hinge * (lw / 2 - 0.3), h * f, 0.055, 0.6, 0.12, 0.025);                          // 肘金の帯（外）
    for (let q = 1; q < 5; q++) B(0x2a2622, -lw / 2 + q * lw / 5, h * f + 0.12, 0.055, 0.07, 0.07, 0.03);   // 乳金物
  }
}
const _leafCache = new Map();
// 扉の一枚を形にする（門を破られると倒れる扉。置き場の Group の中で、y=0 を軸に回して倒す）
export function tobiraLeaf(lw, h = 3.1, hinge = 1) {
  const key = `${lw.toFixed(2)}:${h}:${hinge}`;
  if (!_leafCache.has(key)) { const parts = []; leafParts(parts, lw, h, hinge); _leafCache.set(key, mergeGeometries(parts)); }
  const m = new THREE.Mesh(_leafCache.get(key), MAT());
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// 閉じた門の扉（二枚）：門の口の真ん中 (x, z)・幅 w・向き rot（kabukimon と同じ。外は +z）。
// 一枚ずつ肘金の所を軸にした Group に入れる。userData.open()：内へ開く／userData.fall()：破られて内へ倒れる
export function tobira(world, x, z, w, rot = 0, o = {}) {
  addNightBeacon(world, x + Math.cos(rot) * (w / 2 + 0.8) + Math.sin(rot) * 0.7, z - Math.sin(rot) * (w / 2 + 0.8) + Math.cos(rot) * 0.7);
  const grp = new THREE.Group(), h = o.h || 3.0, lw = w / 2 - 0.04;
  grp.userData.leaves = [];
  for (const sd of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(sd * (w / 2 - 0.02), 0, 0);
    const m = tobiraLeaf(lw, h, sd); m.position.x = -sd * lw / 2; m.userData.camBlock = true;
    pv.add(m); grp.add(pv); grp.userData.leaves.push(pv);
  }
  // 閂（内の面に横一本。開くと外す）
  const k = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.22, 0.2), MAT()); k.position.set(0, h * 0.5, -0.2); grp.add(k);
  grp.userData.open = () => { k.visible = false; grp.userData.leaves.forEach((pv, i) => { pv.rotation.y = (i ? -1 : 1) * 1.25; }); };
  grp.userData.fall = () => {
    grp.visible = true; k.visible = false;
    grp.userData.leaves.forEach((pv, i) => {
      pv.rotation.set(-1.45, (i ? 1 : -1) * 0.12, 0); pv.position.y = 0.08; pv.position.z = -0.1;
      if (!world.def?.terrainTriangles) return;
      // 山門の高さに板を寝かせず、倒れる側の坂へ沿わせる。形と材質は二枚で共有したまま。
      const c = Math.cos(rot), s = Math.sin(rot), lx = pv.position.x + pv.children[0].position.x;
      const cx = x + lx * c - .1 * s, cz = z - lx * s - .1 * c;
      const base = world.heightAt(cx, cz), tip = world.heightAt(cx - h * s, cz - h * c);
      pv.rotation.set(-Math.PI / 2 + Math.atan2(tip - base, h), 0, 0);
      pv.position.y = base - grp.position.y + .08;
      // 坂の折れ目と板の横幅も調べ、木口が土へ潜り込まない高さに落ち着ける。
      grp.updateWorldMatrix(true, true);
      const point = new THREE.Vector3();
      let lift = 0;
      for (const side of [-1, 1]) for (let j = 0; j <= 4; j++) {
        point.set(pv.children[0].position.x + side * lw / 2, h * j / 4, 0);
        pv.localToWorld(point);
        lift = Math.max(lift, world.heightAt(point.x, point.z) + .06 - point.y);
      }
      pv.position.y += lift;
    });
  };
  grp.position.set(x, world.heightAt(x, z) - 0.05, z);
  grp.rotation.y = rot;
  return grp;
}

// 俵（兵糧）：藁の俵を積み、縄で縛る
export function tawara(world, x, z, rot = 0, n = 6, o = {}) {
  // 室内の調度として置く時は、間取り側で高さ付きの当たりを作る。
  if (o.solid !== false) solidRect(x, z, 1.1, n > 3 ? 1.8 : 1.3, rot);
  const parts = [];
  let k = 0;
  for (let row = 0; row < 3 && k < n; row++) {
    for (let i = 0; i < 3 - row && k < n; i++, k++) {
      const g = new THREE.CylinderGeometry(0.28, 0.28, 0.75, 10); g.rotateZ(Math.PI / 2);
      // 俵は胴がふくらむ
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) { const t = 1 - Math.pow(p.getX(v) / 0.375, 2) * 0.35; p.setY(v, p.getY(v) * t); p.setZ(v, p.getZ(v) * t); }
      g.translate(0, 0.26 + row * 0.46, (i - (2 - row) / 2) * 0.54);
      parts.push(paint(g, vary(0xc8b07a, k)));
      for (const bx of [-0.22, 0.22]) { const r = new THREE.TorusGeometry(0.265, 0.018, 4, 12); r.rotateY(Math.PI / 2); r.translate(bx, 0.26 + row * 0.46, (i - (2 - row) / 2) * 0.54); parts.push(paint(r, 0x6a5a3a)); }
    }
  }
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  m.rotation.y = rot;
  return m;
}

// 馬防柵（織田家の形。『甲冑と戦国の攻城兵器』の図に合わせる）：高さ二メートル余りの丸太を一間に一本ほど間を空けて立て
// （鉄砲を隙間から撃てる）、横木は敵の側（外）に三本、いちばん下は膝の高さ。柱と横木の交わりは縄の男結び（X の結び目）。
// 内の側は塹壕（鉄砲の膝射ち・立ち射ち・長槍を置く溝）と、掘った土を後ろへ盛った低い畝。o.noTrench で塹壕を付けない
const BOBO_RAILS = [0.5, 1.2, 1.88];
export function bobosaku(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg;
  const len = Math.hypot(bx - ax, bz - az);
  const ang = Math.atan2(bx - ax, bz - az);
  const px = Math.cos(ang), pz = -Math.sin(ang);   // 柵に直角（敵の側が +）
  const tx = (bx - ax) / (len || 1), tz = (bz - az) / (len || 1), sd = ax * 2.7 + az * 1.3;
  const n = Math.max(2, Math.round(len / 1.0));
  const parts = [], posts = [];
  const crossed = !!world.def.bobosakuCrossed;
  const noMound = o.noMound || world.def.bobosakuGroundMound === false;
  const fieldSplices = true && (o.fieldSplices === true || crossed);
  for (let i = 0; i <= n; i++) {
    const r = h01(sd + i, 1), r2 = h01(sd + i, 2), r3 = h01(sd + i, 3);
    // 両端は区画へ合わせ、中の杭だけ間隔をずらす。壊れる区画と通れる口は保つ。
    const t = (i + (i > 0 && i < n ? (r3 - 0.5) * 0.3 : 0)) / n;
    const x = ax + (bx - ax) * t + px * (r3 - 0.5) * 0.08, z = az + (bz - az) * t + pz * (r3 - 0.5) * 0.08;
    const y = world.heightAt(x, z);
    const h = 2.05 + r * 0.32;
    // 丸太は山から伐ったまま：太さも傾きも一本ずつ違う。皮付きと剥いだ物がまじる
    const rad = (crossed ? 0.078 : 0.075) + r2 * 0.04;
    // 設楽原の復元：隣の杭を逆向きに傾け、上で交差させる。
    const tilt = crossed ? (i % 2 ? -1 : 1) * (0.23 + r3 * 0.13) : 0;
    const lean = [(r - 0.5) * 0.06 + tx * tilt, (r2 - 0.5) * 0.05 + tz * tilt];
    const top = [x + lean[0] * h, y + h - 0.2, z + lean[1] * h];
    const bark = r3 > 0.55;
    parts.push(paintWorn(logGeo([x, y - 0.4, z], top, rad * 1.1, rad * 0.92, 7), bark ? vary(0x5c4c3a, i) : vary(0x7e705c, i), y, h));
    // 先は斧で斜めに削いだ尖り（切り口は白っぽい木地）
    const tip = sogiTip(rad * 0.94, 0.3 + r * 0.22, r2 * 6.283); tip.translate(top[0], top[1] - 0.02, top[2]);
    parts.push(paint(tip, vary(0xa89a7e, i + 3)));
    // 払った枝の節（図の丸太にある短い突起）
    if (i % 2 === 0) {
      const hy = 0.8 + r2 * 0.9, a = [x + lean[0] * hy, y + hy, z + lean[1] * hy], sg = r > 0.5 ? 1 : -1;
      parts.push(paint(logGeo(a, [a[0] + tx * sg * 0.16 - px * 0.04, a[1] + 0.06, a[2] + tz * sg * 0.16 - pz * 0.04], rad * 0.32, rad * 0.24, 5, false), 0x6a5a46));
    }
    posts.push({ x, z, y, rad, lean });
    // 内へ倒した控え（三本に一本）
    if (i % 3 === 1) parts.push(paintWorn(logGeo([x - px * 1.15, world.heightAt(x - px * 1.15, z - pz * 1.15) - 0.1, z - pz * 1.15], [x - px * 0.12, y + 1.45, z - pz * 0.12], 0.06, 0.05, 5), 0x5e4a34, y, 1.5));
  }
  // 横木三本：外（敵の側）に、柱の面へ添わせて縄で結ぶ。丸太の継ぎ目が区画の端に出る
  for (let k = 0; k < BOBO_RAILS.length; k++) {
    const hy = BOBO_RAILS[k], off = 0.15 + k * 0.004;
    const e = 0.22 + h01(sd, k) * 0.15;
    const a = [ax - tx * e + px * off, world.heightAt(ax, az) + hy + (h01(sd, k + 3) - 0.5) * 0.08, az - tz * e + pz * off];
    const b = [bx + tx * e + px * off, world.heightAt(bx, bz) + hy + (h01(sd, k + 7) - 0.5) * 0.08, bz + tz * e + pz * off];
    if (fieldSplices) {
      // 控えの柵だけ三間隔ごとの杭で丸太を継ぐ。段ごとに継ぎ杭をずらす。
      // 継ぎ目は前後へ重ね、薄い木口を残す。材質と描画のまとめ方は元のまま。
      for (let first = 0, section = 0; first < n; section++) {
        const last = Math.min(n, first + (section === 0 ? 2 + k % 2 : 3));
        const offY = section % 2 ? .045 : -.045;
        const point = (t) => {
          const x = ax + (bx - ax) * t + px * off, z = az + (bz - az) * t + pz * off;
          return [x, world.heightAt(x, z) + hy + offY, z];
        };
        const p = point(first / n - .18 / (len || 1)), q = point(last / n + .18 / (len || 1));
        parts.push(paintWorn(logGeo(p, q, .07 - k * .006, .058 - k * .006, 6, false),
          vary(0x7a6b53, k * 7 + section), Math.min(p[1], q[1]) - hy, 2.4));
        first = last;
      }
    } else parts.push(paintWorn(logGeo(a, b, 0.07 - k * 0.006, 0.058 - k * 0.006, 6, false), vary(0x6e5e48, k + 2), Math.min(a[1], b[1]) - hy, 2.4));
    // 男結び：柱ごとに横木の外の面へ縄を X に掛ける（面の板二枚。外から見える側だけ）
    for (let q = 0; q < posts.length; q++) {
      const P = posts[q], f = q / Math.max(1, posts.length - 1), yy = a[1] + (b[1] - a[1]) * f;
      const cx = P.x + P.lean[0] * hy + px * (off + 0.072), cz = P.z + P.lean[1] * hy + pz * (off + 0.072);
      for (const sg of [1, -1]) {
        const g = new THREE.PlaneGeometry(0.035, 0.24); g.rotateZ(sg * 0.78); g.rotateY(ang + Math.PI / 2); g.translate(cx, yy, cz);
        parts.push(flat(g, 0x9c8a62));
      }
      if (crossed) {
        // 表裏を回る縄の巻き。木と同じ形にまとめ、描画回数を増やさない。
        const rope = new THREE.TorusGeometry(P.rad + 0.075, 0.022, 3, 6);
        rope.rotateX(Math.PI / 2); rope.translate(P.x + P.lean[0] * hy + px * off * 0.5, yy, P.z + P.lean[1] * hy + pz * off * 0.5);
        parts.push(flat(rope, 0xb6a078));
      }
    }
  }
  // 柵の前（敵の側）の乱杭：先を尖らせた短い杭を、敵へ向けて斜めに不揃いに打つ（見た目だけ）
  for (let i = 0; i < n; i += 2) {
    const r = h01(sd + i, 5), r2 = h01(sd + i, 6);
    const t = (i + 0.3 + r * 0.4) / n, d = 1.2 + r2 * 0.8;
    const x = ax + (bx - ax) * t + px * d, z = az + (bz - az) * t + pz * d, y = world.heightAt(x, z);
    const h = 0.6 + r * 0.4;
    const g = new THREE.CylinderGeometry(0.012, 0.045, h, 5);
    g.translate(0, h / 2, 0); g.rotateX(0.5 + r2 * 0.25); g.rotateY(ang + Math.PI / 2 + (r - 0.5) * 0.5);
    g.translate(x, y - 0.12, z);
    parts.push(paintWorn(g, vary(0x6e5236, i + 9), y, h));
  }
  // batch がある時：馬防柵と根元の土・塹壕を、二つの材質それぞれ一つの BatchedMesh へ積む
  // （同じ BatchedPart に両方の実体を結ぶので、壊れた時の傾き・非表示は一緒に動く）
  if (o.batch) {
    const part = pushSimpleBatch(o.batch, mergeGeometries(parts), MAT());
    if (!noMound) pushSimpleBatch(o.batch, fenceMoundGeo(world, seg, !o.noTrench), MOUND(), part);
    return part;
  }
  const m = merged(parts);
  if (!noMound) m.add(fenceMound(world, seg, !o.noTrench));
  return m;
}

// 柵の根元の土：柱を打ち込んで踏み固めた低い盛り（柵の線に沿って）。trench の時は内の側に塹壕を掘り、
// 掘った土を後ろへ盛る（地面は下げられないので、溝の底を暗い土にし、前後の畝で深さを見せる）
const MOUND = lazy(() => liteMat({ map: dirtTex(), vertexColors: true, color: 0xffffff, roughness: 0.97, metalness: 0 }));
// 断面：[u（敵の側が +）, 高さ, 色]
const MOUND_C = 0x9a8c78, PIT_C = 0x30291f, SPOIL_C = 0x8c7c64, EDGE_C = 0x6a7044;
const PROF_PLAIN = [[0.55, -0.04, EDGE_C], [0.2, 0.15, MOUND_C], [-0.2, 0.15, MOUND_C], [-0.55, -0.04, EDGE_C]];
const PROF_TRENCH = [[0.6, -0.05, EDGE_C], [0.22, 0.2, MOUND_C], [-0.22, 0.26, SPOIL_C], [-0.42, 0.06, PIT_C], [-0.55, 0.02, PIT_C],
  [-1.3, 0.02, PIT_C], [-1.45, 0.1, PIT_C], [-1.7, 0.44, SPOIL_C], [-2.15, 0.34, SPOIL_C], [-2.75, -0.05, EDGE_C]];
function fenceMoundGeo(world, seg, trench = false) {
  const [ax, az, bx, bz] = seg;
  const len = Math.hypot(bx - ax, bz - az) || 1;
  const n = Math.max(2, Math.round(len / 1.5));
  const tx = (bx - ax) / len, tz = (bz - az) / len, px = tz, pz = -tx;   // + は bobosaku の敵の側
  const prof = trench ? PROF_TRENCH : PROF_PLAIN, pos = [], cl = [], uv = [], c = new THREE.Color();
  const V = (i, q) => {
    const t = i / n, [u, h0, col] = prof[q], j = (h01(i * 3.1 + ax, q) - 0.5) * 0.06;
    // 区画の端では畝を低く崩す（隣の区画と折れて継がる所に、四角い切り口を見せない）
    const e = i === 0 || i === n ? 0.3 : 1, h = h0 > 0.05 ? h0 * e : h0;
    const x = ax + tx * len * t + px * u, z = az + tz * len * t + pz * u;
    c.setHex(col).multiplyScalar(0.9 + h01(i * 5.7 + az, q * 2) * 0.2);
    return [x, world.heightAt(x, z) + h + (h > 0.05 ? j : 0), z, c.r, c.g, c.b, len * t / 2, u / 2];
  };
  const ext = 0.25;   // 区画の端を少し伸ばして、隣の区画と継ぎ目を空けない
  for (let i = 0; i < n; i++) for (let q = 0; q < prof.length - 1; q++) {
    const A = V(i, q), B = V(i, q + 1), C = V(i + 1, q + 1), D = V(i + 1, q);
    if (i === 0) for (const P of [A, B]) { P[0] -= tx * ext; P[2] -= tz * ext; }
    if (i === n - 1) for (const P of [C, D]) { P[0] += tx * ext; P[2] += tz * ext; }
    for (const P of [A, B, C, A, C, D]) { pos.push(P[0], P[1], P[2]); cl.push(P[3], P[4], P[5]); uv.push(P[6], P[7]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
  return g;
}
function fenceMound(world, seg, trench = false) {
  const mesh = new THREE.Mesh(fenceMoundGeo(world, seg, trench), MOUND());
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------- 陣の小道具 ----------------
// どれも (world, x, z, 向き) で置き、返す物を rt.scene.add する。当たり判定は無い（見た目だけ）

// 鉄の鍋（鈍い照り返し）
const IRON = lazy(() => liteMat({ color: 0x2a2724, roughness: 0.55, metalness: 0.6 }));

// 床几の骨組みと革座。色ごとに一度だけ作り、諸将の席は同じ形を六回使う。
const shogiShapes = new Map();
function shogiGeometry(color = 0x3a2a20) {
  if (shogiShapes.has(color)) return shogiShapes.get(color);
  const parts = [];
  for (const sz of [-0.2, 0.2]) {
    for (const s of [1, -1]) {
      const leg = new THREE.CylinderGeometry(0.025, 0.032, 0.66, 4);
      leg.rotateY(Math.PI / 4);
      leg.rotateZ(s * 0.62); leg.translate(0, 0.27, sz);
      parts.push(paintWorn(leg, 0x66503b, 0, .55));
    }
    const pin = new THREE.SphereGeometry(.027, 4, 2);
    pin.scale(1, 1, 1.5); pin.translate(0, .27, sz);
    parts.push(flat(pin, 0x25221e));
  }
  for (const sx of [-0.2, 0.2]) { const bar = logGeo([sx, .5, -.24], [sx, .5, .24], .028, .025, 4, false); parts.push(paint(bar, 0x736047)); }
  // 革の縁を桟に巻く。中央は腰の重みで沈み、縁は細い明るさを残す。
  const seat = new THREE.PlaneGeometry(0.46, 0.46, 6, 2); seat.rotateX(-Math.PI / 2);
  const P = seat.attributes.position;
  for (let k = 0; k < P.count; k++) {
    const u = Math.abs(P.getX(k)) / .23;
    P.setY(k, .5 - Math.cos(Math.min(1, u) * Math.PI / 2) * .055 - Math.max(0, (u - .84) / .16) * .038);
  }
  seat.computeVertexNormals();
  const leather = flat(seat, color), C = leather.attributes.color, base = new THREE.Color(color);
  for (let k = 0; k < C.count; k++) {
    const edge = Math.abs(leather.attributes.position.getZ(k)) > .21;
    const f = edge ? .7 : 1.08;
    C.setXYZ(k, base.r * f, base.g * f, base.b * f);
  }
  parts.push(leather);
  const geometry = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  shogiShapes.set(color, geometry);
  return geometry;
}
const shogiFan = lazy(() => {
  const fan = new THREE.CylinderGeometry(0.13, 0.13, 0.012, 14); fan.scale(1, 1, 1.15); fan.translate(0, 0.52, 0.02);
  const hdl = logGeo([.09, .52, .02], [.31, .52, .02], .014, .012, 5, false);
  const geometry = mergeGeometries([flat(fan, 0x141210), paint(hdl, 0x5a3a20)]);
  fan.dispose(); hdl.dispose();
  return { geometry, material: liteMat({ vertexColors: true, roughness: .35, metalness: .1 }) };
});
// 床几（しょうぎ）：脚を X に組んだ折りたたみの腰掛け。o.gunbai で軍配を載せる
export function shogi(world, x, z, rot = 0, o = {}) {
  const grp = new THREE.Group();
  const stool = new THREE.Mesh(shogiGeometry(o.color), MAT());
  stool.castShadow = stool.receiveShadow = true; stool.userData.camBlock = true;
  grp.add(stool);
  if (o.gunbai) {
    const f = shogiFan(), fm = new THREE.Mesh(f.geometry, f.material);
    fm.rotation.y = 0.4; grp.add(fm);
  }
  grp.position.set(x, world.heightAt(x, z), z);
  grp.rotation.y = rot;
  return grp;
}

// 旗竿の束：巻いた幟を何本も、横木の架けに立て掛ける。kind は家紋（巻いた布の色に使う）
const hatazaoShapes = new Map();
function hatazaoGeometry(n, kind, coarse) {
  const key = `${n}:${kind}:${coarse}`;
  if (hatazaoShapes.has(key)) return hatazaoShapes.get(key);
  const parts = [];
  const bg = new THREE.Color(0xe8e2d2);
  if (kind === 'oda' || kind === 'eiraku') bg.set(0xd9b43c); else if (kind === 'akazonae' || kind === 'sanada') bg.set(0x8e2a1e); else if (kind === 'furin') bg.set(0x1f2a44);
  // 架け：二本の柱に横木
  for (const sx of [-1.1, 1.1]) { const p = new THREE.CylinderGeometry(0.05, 0.06, 2.4, 5); p.translate(sx, 1.2, 0); parts.push(paint(p, 0x4a3826)); }
  const bar = new THREE.CylinderGeometry(0.04, 0.04, 2.5, 5); bar.rotateZ(Math.PI / 2); bar.translate(0, 2.2, 0); parts.push(paint(bar, 0x4a3826));
  for (let i = 0; i < n; i++) {
    const r = ((i * 7919) % 97) / 97;
    const px = -0.95 + (i / Math.max(1, n - 1)) * 1.9 + (r - 0.5) * 0.1, lean = 0.18 + r * 0.1, H = 5 + r * 0.8;
    const pole = new THREE.CylinderGeometry(0.021, 0.036, H, 4);
    pole.translate(0, H / 2, 0); pole.rotateX(-lean); pole.translate(px, 0, 0.55);
    parts.push(paintWorn(pole, vary(0x80694a, i), 0, H));
    // 竿に巻き付けた布
    const furl = new THREE.CylinderGeometry(0.06, 0.075, 1.9, coarse ? 4 : 6);
    const F = furl.attributes.position;
    for (let j = 0; j < F.count; j++) {
      const a = Math.atan2(F.getZ(j), F.getX(j)), f = 1 + Math.sin(a * 3 + i) * .16;
      F.setXYZ(j, F.getX(j) * f, F.getY(j) + Math.cos(a * 2 + i) * .035, F.getZ(j) * f);
    }
    furl.computeVertexNormals();
    furl.translate(0, H - 1.4, 0.04); furl.rotateX(-lean); furl.translate(px, 0, 0.55);
    parts.push(flat(furl, bg.clone().multiplyScalar(0.85 + r * 0.2).getHex()));
    if (!coarse) for (const offset of [.8, 1.8]) {
      const tie = new THREE.CylinderGeometry(0.08, 0.08, 0.035, 3, 1, true);
      tie.translate(0, H - offset, 0.04); tie.rotateX(-lean); tie.translate(px, 0, 0.55);
      parts.push(flat(tie, 0x9a8660));
    }
  }
  const geometry = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  hatazaoShapes.set(key, geometry);
  return geometry;
}
export function hatazao(world, x, z, rot = 0, n = 7, kind = 'tokugawa') {
  const lod = new THREE.LOD();
  lod.userData.noMerge = true;   // 距離で切り替える二つの形を静止物の束へ吸い込ませない。
  for (const coarse of [false, true]) {
    const m = new THREE.Mesh(hatazaoGeometry(n, kind, coarse), MAT());
    m.castShadow = m.receiveShadow = true; m.userData.camBlock = true;
    lod.addLevel(m, coarse ? KIT_LOD_D : 0);
  }
  lod.position.set(x, world.heightAt(x, z), z); lod.rotation.y = rot;
  return lod;
}

// 馬を繋ぐ杭：杭を並べて縄を張る（len m の長さ、向き rot）
export function umatsunagi(world, x, z, rot = 0, len = 8) {
  const parts = [];
  const n = Math.max(2, Math.round(len / 2.2));
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i <= n; i++) {
    const t = i / n - 0.5, lx = t * len;
    const wx = x + lx * c, wz = z - lx * s;
    const r = ((i * 7919) % 101) / 101;
    const post = new THREE.CylinderGeometry(0.06, 0.08, 1.3, 6);
    post.rotateZ((r - 0.5) * 0.1);
    post.translate(wx, world.heightAt(wx, wz) + 0.5, wz);
    parts.push(paint(post, vary(0x6b5238, i)));
  }
  // 縄は杭の間で少したるむ
  for (let i = 0; i < n; i++) {
    const t0 = i / n - 0.5, t1 = (i + 1) / n - 0.5;
    for (let k = 0; k < 4; k++) {
      const a = t0 + (t1 - t0) * k / 4, b = t0 + (t1 - t0) * (k + 1) / 4;
      const sagA = Math.sin((k / 4) * Math.PI) * 0.12, sagB = Math.sin(((k + 1) / 4) * Math.PI) * 0.12;
      const ax = x + a * len * c, az = z - a * len * s, bx = x + b * len * c, bz = z - b * len * s;
      const ay = world.heightAt(ax, az) + 1.05 - sagA, by = world.heightAt(bx, bz) + 1.05 - sagB;
      const L = Math.hypot(bx - ax, by - ay, bz - az);
      const seg = new THREE.CylinderGeometry(0.014, 0.014, L, 3);
      seg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, by - ay, bz - az).normalize()));
      seg.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      parts.push(paint(seg, 0x7a6a48));
    }
  }
  return merged(parts);
}

// 炊事の鍋：三本の木を組んで鉄鍋を吊り、下で薪が燃え、湯気と煙が昇る
// 返す物の userData.fire は world.removeFire に渡せる
export function nabe(world, x, z, o = {}) {
  const y = world.heightAt(x, z);
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094 + 0.3;
    const leg = new THREE.CylinderGeometry(0.03, 0.04, 1.9, 5);
    leg.translate(0, 0.95, 0); leg.rotateX(0.38); leg.rotateY(a); leg.translate(Math.sin(a) * -0.02, 0, Math.cos(a) * -0.02);
    parts.push(paint(leg, 0x3a2c1c));
  }
  const chain = new THREE.CylinderGeometry(0.008, 0.008, 0.9, 3); chain.translate(0, 1.3, 0); parts.push(paint(chain, 0x1a1816));
  // 薪と、火を囲う石
  for (let i = 0; i < 5; i++) { const log = new THREE.CylinderGeometry(0.04, 0.05, 0.6, 4); log.rotateZ(Math.PI / 2 - 0.25); log.rotateY(i * 1.25); log.translate(0, 0.1, 0); parts.push(paint(log, 0x2a1f16)); }
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; const st = new THREE.DodecahedronGeometry(0.1 + (i % 3) * 0.02, 0); st.translate(Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.45); parts.push(paint(st, vary(0x6a655c, i))); }
  const grp = new THREE.Group();
  grp.add(merged(parts));
  // 鍋：胴のふくらんだ鉄鍋と、つる
  const pot = new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65); pot.translate(0, 0.62, 0);
  const rim = new THREE.TorusGeometry(0.22, 0.02, 4, 14); rim.rotateX(Math.PI / 2); rim.translate(0, 0.82, 0);
  const handle = new THREE.TorusGeometry(0.2, 0.01, 3, 12, Math.PI); handle.translate(0, 0.83, 0);
  const pm = new THREE.Mesh(mergeGeometries([pot, rim, handle].map((g) => (g.index ? g.toNonIndexed() : g))), IRON());
  pm.castShadow = true;
  grp.add(pm);
  grp.position.set(x, y, z);
  if (o.fire !== false && world.addFire) grp.userData.fire = world.addFire(x, z, { h: 0.08 });
  // 10/24：鍋の火の煙は作らない（全戦）
  return grp;
}

// 兵糧の置き場：俵の山をいくつかと、上に掛けた筵（むしろ）
export function hyoro(world, x, z, rot = 0) {
  const grp = new THREE.Group();
  const c = Math.cos(rot), s = Math.sin(rot);
  const put = (lx, lz, r, n) => { const m = tawara(world, x + lx * c + lz * s, z - lx * s + lz * c, rot + r, n); grp.add(m); };
  put(0, 0, 0, 6); put(0, 1.9, 0.08, 6); put(1.6, 0.9, 1.5, 3);
  // 指定された戦だけ、設営時に俵の形を読んで筵を掛ける。
  // 後から読み込む荷や木箱には合わせず、三つの俵山だけを支えにする。
  const coverPiles = world.def.fitSupplyCover ? grp.children.slice() : null;
  // 素材の荷（読めたら足す）：藁の叺の山と木箱
  { const at = (lx, lz, o = {}) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c, rot: rot + (o.r || 0), dy: o.dy || 0 });
    extScatter(grp, 'sack', [at(-1.5, 0.5, { r: 1.57 }), at(-1.5, 1.25, { r: 1.5 }), at(-1.5, 0.9, { r: 1.6, dy: 0.57 })], world);
    extScatter(grp, 'box_b', [at(-1.4, 2.3, { r: 0.2 })], world); }
  // 筵：藁で編んだ敷物を俵の山に掛ける
  const mat = new THREE.PlaneGeometry(1.9, 1.5, 4, 4);
  const P = mat.attributes.position; for (let k = 0; k < P.count; k++) { const u = P.getX(k) / 0.95; P.setZ(k, Math.max(0, 1 - u * u) * 0.5); }
  mat.rotateX(-Math.PI / 2); mat.rotateY(Math.PI / 2);
  if (coverPiles) {
    grp.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0), hits = [];
    const base = world.heightAt(x, z) + 1;
    for (let i = 0; i < P.count; i++) {
      const px = P.getX(i), pz = P.getZ(i), wx = x + px * c + pz * s, wz = z - px * s + pz * c;
      const ground = world.heightAt(wx, wz);
      origin.set(wx, ground + 4, wz); ray.set(origin, down); hits.length = 0;
      ray.intersectObjects(coverPiles, false, hits);
      // 支えのない裾は地面へ落とす。俵に触れる所は布一枚ぶんだけ離す。
      P.setY(i, (hits.length ? Math.max(ground, hits[0].point.y) : ground) + 0.025 - base);
    }
    mat.computeVertexNormals();
  }
  const mm = new THREE.Mesh(mat, liteMat({ map: thatchTex(), color: 0xb8a57a, roughness: 1, side: THREE.DoubleSide }));
  mm.position.set(x, world.heightAt(x, z) + 1.0, z); mm.rotation.y = rot; mm.castShadow = true;
  grp.add(mm);
  return grp;
}

// 馬印：大将の居場所を示す大きな印。竿の上に金の扇（kind が 'fukube' なら金の瓢箪、'kasa' なら織田の金の唐傘）
const GOLD = lazy(() => liteMat({ color: 0xc9a040, roughness: 0.35, metalness: 0.75, side: THREE.DoubleSide }));
export function umajirushi(world, x, z, rot = 0, kind = 'ogi') {
  const grp = new THREE.Group();
  const pole = new THREE.CylinderGeometry(0.05, 0.07, 7.2, 6); pole.translate(0, 3.6, 0);
  grp.add(merged([paint(pole, 0x241a12)]));
  let g;
  if (kind === 'fukube') {
    g = mergeGeometries([new THREE.SphereGeometry(0.42, 10, 8).translate(0, 7.4, 0), new THREE.SphereGeometry(0.3, 10, 8).translate(0, 7.95, 0)]);
  } else if (kind === 'kasa') {
    // 金の唐傘（信長の馬印）：半ば窄めた傘が竿の頭から下へ垂れる。骨ごとに紙が折れて縦の襞。頂に赤い毛の出し
    const prof = [[0.05, 7.62], [0.2, 7.58], [0.46, 7.42], [0.5, 7.3], [0.44, 6.95], [0.36, 6.55], [0.3, 6.32]].map(([r, y]) => new THREE.Vector2(r, y));
    g = new THREE.LatheGeometry(prof.reverse(), 48);
    const P = g.attributes.position;
    for (let k = 0; k < P.count; k++) { const x = P.getX(k), z = P.getZ(k), a = Math.atan2(x, z), f = 1 + 0.07 * Math.abs(Math.sin(a * 12)) - 0.035; P.setX(k, x * f); P.setZ(k, z * f); }
    g.computeVertexNormals();
    const dashi = mergeGeometries(Array.from({ length: 9 }, (_, i) => { const a = i / 9 * Math.PI * 2, c = new THREE.ConeGeometry(0.05, 0.42, 4); c.translate(0, 0.21, 0); c.rotateX(Math.sin(a) * 0.5); c.rotateZ(Math.cos(a) * 0.5); return c.translate(0, 7.7, 0); }));
    const dm = new THREE.Mesh(dashi, liteMat({ color: 0x9a1e16, roughness: 0.9 })); dm.castShadow = true; grp.add(dm);
    grp.add(merged([paint(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 6).translate(0, 7.66, 0), 0x241a12)]));
  } else {
    // 開いた扇：骨の数だけ少し折れる
    g = new THREE.CircleGeometry(1.0, 16, Math.PI * 0.12, Math.PI * 0.76);
    const P = g.attributes.position;
    for (let k = 0; k < P.count; k++) { const a = Math.atan2(P.getY(k), P.getX(k)); P.setZ(k, Math.sin(a * 16) * 0.03 * Math.hypot(P.getX(k), P.getY(k))); }
    g.computeVertexNormals(); g.translate(0, 6.7, 0.06);
  }
  const m = new THREE.Mesh(g, GOLD()); m.castShadow = true; grp.add(m);
  grp.position.set(x, world.heightAt(x, z), z);
  grp.rotation.y = rot;
  return grp;
}

// 陣一式：陣幕の囲い、中に床几の大将と左右に居並ぶ諸将、後ろに馬印と旗本の旗、口に番の兵、脇に旗竿の束・兵糧・馬を繋ぐ杭・炊事の鍋と煙
// (cx, cz) は陣幕の真ん中、w×d は陣幕の大きさ、mon は幕と旗の家紋。開いた口は南（+z）
// 人（大将・諸将・旗本・番の兵）は world.addDistantArmy の軽い兵で置く（少しずつ動く）。返す物の userData.people にその隊が入る
// o.people === false で人を置かない。o.armor は具足の色、o.generalArmor は大将と諸将の具足の色
export function jinCamp(world, cx, cz, o = {}) {
  const w = o.w || 16, d = o.d || 12, mon = o.mon || 'tokugawa';
  const grp = new THREE.Group();
  // 本陣の動きは、実際に置かれた幕の場所だけで足す。
  grp.userData.commandPost = { x: cx, z: cz, w, d, mon, people: o.people !== false };
  grp.add(jinmaku(world, cx, cz, w, d, o.gap || 6, { mon, contour: o.contour }));
  // 奥に大将の床几、左右に並ぶ諸将の床几
  grp.add(shogi(world, cx, cz - d / 2 + 2, 0, { gunbai: true, color: 0x5a1a14 }));
  // 素材の小道具（読めたら足す）：床几の脇の行灯、幕の隅の木箱と樽
  extScatter(grp, 'andon', [{ x: cx + 1.5, z: cz - d / 2 + 2.2 }], world);
  extScatter(grp, 'crate', [{ x: cx - w / 2 + 1.1, z: cz - d / 2 + 1.0, rot: 0.3 }], world);
  extScatter(grp, 'box_a', [{ x: cx - w / 2 + 1.9, z: cz - d / 2 + 1.1, rot: -0.2 }], world);
  extScatter(grp, 'barrel', [{ x: cx + w / 2 - 1.1, z: cz - d / 2 + 1.0 }, { x: cx + w / 2 - 1.8, z: cz - d / 2 + 1.3, rot: 1 }], world);
  // 六席で一つの形と材質を使い回す。複製した頂点を持たず一回で描く。
  {
    const stools = new THREE.InstancedMesh(shogiGeometry(), MAT(), 6), pose = new THREE.Object3D();
    let index = 0;
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
      const x = cx + sx * 2.4, z = cz - d / 2 + 3.6 + i * 1.6;
      pose.position.set(x, world.heightAt(x, z), z); pose.rotation.y = sx * Math.PI / 2; pose.updateMatrix();
      stools.setMatrixAt(index++, pose.matrix);
    }
    stools.instanceMatrix.needsUpdate = true;
    stools.castShadow = stools.receiveShadow = true; stools.userData.camBlock = true; grp.add(stools);
  }
  // 口の外に、手盾（板の楯）を並べて口の左右を固める。本陣へは口からしか入れない
  if (o.tate !== false) {
    const g2 = (o.gap || 6) / 2, zf = cz + d / 2 + 2.2;
    grp.add(tateNarabi(world, cx - g2 - 1.2, zf, cx - w / 2 - 1, zf), tateNarabi(world, cx + w / 2 + 1, zf, cx + g2 + 1.2, zf));   // 線の左手（外）が楯の表
  }
  // 陣太鼓（台に据えた大太鼓）と、床几の脇の法螺貝
  grp.add(jindaiko(world, cx + w / 2 - 2, cz - d / 2 + 2.2, -0.4));
  grp.add(horagai(world, cx + 0.7, cz - d / 2 + 2.1));
  // 幕の外に沿って通れるよう、竿・俵の当たりと幕の当たりの間を人ひとり分（0.9m）より広く空ける
  // 狭い砦では幕の外に荷や馬繋ぎを広げず、隣の建物の戸口を空ける。
  if (!o.compact) {
    grp.add(hatazao(world, cx - w / 2 - 3.2, cz - d / 4, Math.PI / 2, 7, mon));
    grp.add(hyoro(world, cx + w / 2 + 3.6, cz - d / 4, 0.2));
    grp.add(umatsunagi(world, cx + w / 2 + 3, cz + d / 2 + 3, Math.PI / 2 + 0.2, 9));
    grp.add(nabe(world, cx - w / 2 - 3, cz + d / 2 + 3));
    if (o.fire !== false) grp.add(nabe(world, cx + w / 2 + 1.5, cz + d / 2 + 6));
  }
  // 馬印は幕の後ろ、大将の真後ろに高く
  // 個人の馬印が分からない陣では、戦の指定で省き、所属旗を目印に残す。
  if (o.uma !== false && !o.noUma) grp.add(umajirushi(world, cx + 0.6, cz - d / 2 - 1.2, 0, o.uma || (mon === 'oda' || mon === 'eiraku' ? 'kasa' : 'ogi')));
  // 口の両脇に家紋の幟
  for (const sx of [-1, 1]) grp.add(nobori(world, cx + sx * ((o.gap || 6) / 2 + 0.6), cz + d / 2 + 0.6, mon, 5.5));
  if (o.people !== false && world.addDistantArmy) {
    const P = [{ x: cx, z: cz - d / 2 + 2, facing: 0, k: 'seated' }];
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) P.push({ x: cx + sx * 2.4, z: cz - d / 2 + 3.6 + i * 1.6, facing: -sx * Math.PI / 2, k: 'seated', helm: i === 2 ? 0 : 1 });
    // 大将の後ろに控える小姓と、幕の内の隅に立つ旗本
    P.push({ x: cx - 1.4, z: cz - d / 2 + 1.1, facing: 0, k: 'samurai', flag: 0 }, { x: cx + w / 2 - 1.2, z: cz + d / 2 - 1.4, facing: -2.4, k: 'samurai' }, { x: cx - w / 2 + 1.2, z: cz + d / 2 - 1.4, facing: 2.4, k: 'samurai' });
    const lead = world.addDistantArmy({ people: P, armor: o.generalArmor || 0x2a2622, flag: mon, seed: 5 + Math.round(cx), near: true });
    const G = [];
    // 口の番：槍を立てた兵が両脇に三人ずつ
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) G.push({ x: cx + sx * ((o.gap || 6) / 2 + 1.2 + i * 0.9), z: cz + d / 2 + 1.6 + (i % 2) * 0.5, facing: sx * 0.2, k: 'spear' });
    // 幕の後ろの旗本：幟を立てて並ぶ
    for (let i = 0; i < 8; i++) G.push({ x: cx - w / 2 + 1 + i * (w - 2) / 7, z: cz - d / 2 - 2.8 - (i % 2) * 0.8, facing: 0, k: 'banner' });
    // 脇に控える兵（鍋の周り・兵糧の番）
    G.push({ x: cx - w / 2 - 2.2, z: cz + d / 2 + 4.2, facing: 1.2, k: 'spear' }, { x: cx - w / 2 - 3.8, z: cz + d / 2 + 2.2, facing: 2.2, k: 'gun' }, { x: cx + w / 2 + 3.8, z: cz - d / 4 + 1.8, facing: -1.6, k: 'spear' });
    const guard = world.addDistantArmy({ people: G, armor: o.armor || 0x33302a, flag: mon, seed: 9 + Math.round(cz), near: true });
    grp.userData.people = [lead, guard];
  }
  // 幟は風の向きが変わると向き直る。陣の中に置くと、そのたびに陣の全部が「動いた」と見なされ、まとめて描けなくなる（長島で描く回数が二十余り）。
  //   置かれた時に幟だけを陣の外（同じ親）へ移す（陣の位置は原点なので、場所は変わらない）
  const lift = () => { grp.removeEventListener('added', lift); const p = grp.parent; if (p) for (const c of [...grp.children]) if (c.userData.flag) p.add(c); };
  grp.addEventListener('added', lift);
  return grp;
}

// 村（遠景）：茅葺きの家並み、田と畦、炊事の煙、柿の木。どれもまとめて少ない描画で
// o：{ n 家の数（既定 7）, r 家の散らばる広さ（既定 22）, rot 田の並びの向き, fields 田の数（既定 12）, smoke 煙を上げる家の数（既定 2）, seed, autumn（柿の実）}
// 田は家並みの南（rot の向きの前）に広がる。返す物は scene に add する
export function village(world, x, z, o = {}) {
  let s = (o.seed || 11) >>> 0; const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const n = o.n ?? 7, rad = o.r ?? 22, rot = o.rot ?? 0;
  // 姉川の村も単独の民家と同じ踏み板で、壁の外へ張り出す外戸の敷居を受ける。
  // 二筋の戸と敷居は内壁から五十三センチ外まであるため、その先から段を下ろす。
  const entryPad = SETTINGS.quality === 'high' && o.interior?.profile === 'anegawa' ? .65 : .25;
  const c = Math.cos(rot), sn = Math.sin(rot);
  const W = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  const walls = [], houseFrames = [], roofs = [], trees = [];
  const ry0 = (i) => rot + i * 1.3;
  const spots = [];
  for (let k = 0; k < n * 8 && spots.length < n; k++) {
    const lx = (R() - 0.5) * rad * 2, lz = (R() - 0.5) * rad;
    if (spots.some((q) => Math.hypot(q[0] - lx, q[1] - lz) < 11)) continue;
    spots.push([lx, lz]);
  }
  const roofMats = [], homes = [];
  spots.forEach(([lx, lz], i) => {
    const [hx, hz] = W(lx, lz);
    let y = world.heightAt(hx, hz);
    const hw = 3.2 + R() * 1.6, hd = 2.4 + R() * 0.8, H = o.interior ? 2.6 : 2.1, rh = 3.2 + R() * 0.8, e = 0.9;
    // 村の戸口も、体の高さと同寸で引っかからない内法にする。
    const doorHeight = o.interior?.profile === 'anegawa' ? 1.85 : 1.7;
    const ry = rot + (R() < 0.5 ? 0 : Math.PI / 2) + (R() - 0.5) * 0.3;
    // 姉川の村の窓は暗い板の飾りで塞がず、内外で同じ開口を使う推定復元。
    // 高さは室内の床から測り、外壁へ渡す時だけ土台の高さを足す。
    const homeWindows = SETTINGS.quality === 'high' && o.interior?.profile === 'anegawa'
      ? [-1, 1].map(s => ({ face: 'x', s, t: 0, w: 1.2, y0: .8, y1: 1.5 })) : [];
    if (o.groundedHomes) for (const px of [-hw, 0, hw]) for (const pz of [-hd, 0, hd])
      y = Math.max(y, world.heightAt(hx + px * Math.cos(ry) + pz * Math.sin(ry), hz - px * Math.sin(ry) + pz * Math.cos(ry)));
    if (SETTINGS.quality === 'high' && o.interior?.profile === 'anegawa') {
      // 入れる村の家も館と同じ一メートル以下の間隔で床下を測る。
      // 九点の間の盛り上がりで板間・土間が埋まらないよう、外装と室内を一緒に上げる。
      // 戸口は左寄りなので、その位置の踊り場も測る。設営時だけで描く形は増やさない。
      const c = Math.cos(ry), s = Math.sin(ry);
      const nx = Math.ceil(hw * 2), nz = Math.ceil(hd * 2);
      for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
        const px = -hw + hw * 2 * ix / nx, pz = -hd + hd * 2 * iz / nz;
        y = Math.max(y, world.heightAt(hx + px * c + pz * s, hz - px * s + pz * c));
      }
      // 左寄りの戸口だけでなく、開いた板戸を受ける敷居と束石の全幅を測る。
      // 単独の家と同じ半メートル以下の間隔で、引き込み先の盛り上がりも拾う。
      const sillHalf = 1.6 + .055 + .11, sillCols = Math.ceil(sillHalf * 2 / .5);
      for (let iz = 0; iz <= 3; iz++) for (let ix = 0; ix <= sillCols; ix++) {
        const px = -hw * .3 - sillHalf + sillHalf * 2 * ix / sillCols;
        const pz = hd - .09 + iz * (entryPad + .1) / 3;
        y = Math.max(y, world.heightAt(hx + px * c + pz * s, hz - px * s + pz * c));
      }
    }
    const place = (g) => { g.rotateY(ry); g.translate(hx, y, hz); return g; };
    if (o.interiorHomes) {
      // 元の家の数・場所・広さを保ち、外の戸口と中の当たりを同じ小屋の仕組みにする。
      // 素材の民家へ替えると戸口が塞がるため、入れる家は手作りの外壁を使う。
      const home = hut(world, hx, hz, hw * 2, hd * 2, ry,
        { minka: false, interior: o.interiorHomes });
      homes.push(home);
    } else {
    if (o.interior) {
      // 入れる村だけ箱の壁を四面へ分け、戸口を中の床・出入り口と揃える。
      const entryX = -hw * .3;
      for (const face of ['z', 'x']) for (const side of [-1, 1]) {
        const len = face === 'z' ? hw * 2 : hd * 2;
        const holes = face === 'z' && side === 1
          ? [{ t0: entryX - .8, t1: entryX + .8, y0: .25, y1: .25 + doorHeight }] : [];
        for (const v of homeWindows) if (v.face === face && v.s === side)
          holes.push({ t0: v.t - v.w / 2, t1: v.t + v.w / 2, y0: v.y0 + .25, y1: v.y1 + .25 });
        for (const [a, b, low, high] of facePanels(len, H, holes)) {
          const panel = new THREE.BoxGeometry(face === 'z' ? b - a : .08, high - low, face === 'z' ? .08 : b - a);
          panel.translate(face === 'z' ? (a + b) / 2 : side * hw, (low + high) / 2,
            face === 'z' ? side * hd : (a + b) / 2);
          walls.push(paint(place(panel), vary(0x86705a, i)));
        }
      }
      addInterior(world, { ...o.interior, x: hx, z: hz, rot: ry, hasExterior: true,
        roof: { kind: 'hip', ex: hw + e, ez: hd + e, ridge: Math.max(.6, hw - hd), rise: rh },
        levels: [{ y: y + .25, w: hw * 2 - .18, d: hd * 2 - .18, h: H - .25 }],
        door: { lx: entryX, w: 1.6, h: doorHeight }, approach: { pad: entryPad, len: 1.1 }, wins: () => homeWindows });
    } else {
      solidRect(hx, hz, hw * 2 + 0.3, hd * 2 + 0.3, ry);
      // 壁：下は板、上は土壁。戸口の暗がり
      const wall = buildingWall(hw * 2, H, hd * 2, vary(0x786851, i)); wall.translate(0, H / 2, 0); walls.push(place(wall));
      const band = buildingWall(hw * 2 + 0.04, 0.7, hd * 2 + 0.04, vary(0xb8ad94, i + 3)); band.translate(0, H - 0.5, 0); walls.push(place(band));
      // 原形は一つ。村全体を既存の壁と一回で描き、遠くでは細い木組みを省く。
      houseFrames.push(place(buildingFrame(8, 5.6, H).scale(hw / 4, 1, hd / 2.8)));
      const door = new THREE.BoxGeometry(1.6, 1.7, 0.05); door.translate(-hw * 0.3, 0.85, hd + 0.02); walls.push(paint(place(door), o.groundedHomes ? 0x9a8060 : 0x16120e));
    }
    if (o.groundedHomes) {
      const timber = new THREE.BoxGeometry(1, 1, 1);
      const box = (px, py, pz, bw, bh, bd, hex) => {
        const g = timber.clone(); g.scale(bw, bh, bd); g.translate(px, py, pz); walls.push(paint(place(g), hex));
      };
      if (!o.interior) for (const hy of [0.35, 0.85, 1.35]) box(-hw * 0.3, hy, hd + 0.07, 1.6, 0.07, 0.07, 0x594630);
      if (homeWindows.length) for (const v of homeWindows) {
        const low = v.y0 + .25, high = v.y1 + .25, px = v.s * (hw - .09);
        // 連子は壁の厚みを通す。窓台・まぐさと両脇の枠で上下を受ける。
        // 内側の格子と同じ割り付けにし、外を暗い板で覆わない。
        for (const yy of [low - .04, high + .04])
          box(px, yy, v.t, .28, .08, v.w + .16, 0x594630);
        for (const edge of [-1, 1])
          box(px, (low + high) / 2, v.t + edge * (v.w / 2 + .04), .28, high - low, .08, 0x594630);
        for (let q = -1; q <= 1; q++)
          box(px, (low + high) / 2, v.t + q * v.w * .3, .24, high - low, .05, 0xaa9575);
      }
      else for (const side of [-1, 1]) {
        box(side * (hw + 0.03), 1.4, 0, 0.08, 0.7, 1.2, 0x453d30);
        for (const pz of [-0.45, 0, 0.45]) box(side * (hw + 0.09), 1.4, pz, 0.08, 0.76, 0.06, 0xaa9575);
      }
      for (const [ax, az, bx, bz] of [[-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [hw, hd, -hw, hd], [-hw, hd, -hw, -hd]]) {
        let bottom = y;
        for (const t of [0, 0.5, 1]) {
          const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
          bottom = Math.min(bottom, world.heightAt(hx + px * Math.cos(ry) + pz * Math.sin(ry), hz - px * Math.sin(ry) + pz * Math.cos(ry)));
        }
        box((ax + bx) / 2, (bottom - y + .16) / 2, (az + bz) / 2,
          Math.abs(bx - ax) + .25, y - bottom + .28, Math.abs(bz - az) + .25, 0x918878);
      }
      timber.dispose();
    }
    // 寄棟の厚い茅葺き屋根：四つの面と、軒の厚み、棟
    const ex = hw + e, ez = hd + e, rl = Math.max(0.6, ex - ez);
    const v = [
      [-ex, H, ez], [ex, H, ez], [rl, H + rh, 0], [-rl, H + rh, 0],
      [ex, H, -ez], [-ex, H, -ez], [-rl, H + rh, 0], [rl, H + rh, 0],
      [ex, H, ez], [ex, H, -ez], [rl, H + rh, 0],
      [-ex, H, -ez], [-ex, H, ez], [-rl, H + rh, 0],
    ];
    const pos = [], uv = [];
    const quad = (a, b, cc, d2) => { pos.push(...a, ...b, ...cc, ...a, ...cc, ...d2); };
    quad(v[0], v[1], v[2], v[3]); quad(v[4], v[5], v[6], v[7]);
    pos.push(...v[8], ...v[9], ...v[10], ...v[11], ...v[12], ...v[13]);
    // 軒の厚み（茅の切り口）
    const t = 0.45, ring = [[-ex, ez], [ex, ez], [ex, -ez], [-ex, -ez], [-ex, ez]];
    for (let k = 0; k < 4; k++) { const [ax, az] = ring[k], [bx, bz] = ring[k + 1]; quad([ax, H - t, az], [bx, H - t, bz], [bx, H, bz], [ax, H, az]); }
    // 軒の下（下から見ても中が抜けない）
    if (o.interior) {
      // 室内の梁を軒裏で覆わず、外へ張り出す四辺だけ塞ぐ。
      for (const [a, b, c, d] of [[-ex, ex, -ez, -hd], [-ex, ex, hd, ez], [-ex, -hw, -hd, hd], [hw, ex, -hd, hd]])
        quad([a, H - t, c], [b, H - t, c], [b, H - t, d], [a, H - t, d]);
    } else quad([-ex, H - t, -ez], [ex, H - t, -ez], [ex, H - t, ez], [-ex, H - t, ez]);
    for (let k = 0; k < pos.length; k += 3) uv.push((pos[k] + pos[k + 2]) * 0.35, pos[k + 1] * 0.5);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    rg.computeVertexNormals();
    const colors = new Float32Array(pos.length), straw = new THREE.Color();
    const dry = new THREE.Color(0xb8ad92), wet = new THREE.Color(0x837b64);
    for (let k = 0; k < rg.attributes.position.count; k++) {
      const py = rg.attributes.position.getY(k), ny = rg.attributes.normal.getY(k);
      straw.copy(wet).lerp(dry, Math.max(0, Math.min(1, (py - H) / rh)));
      if (ny < .05) straw.multiplyScalar(ny < -.5 ? .52 : .78);
      colors[k * 3] = straw.r; colors[k * 3 + 1] = straw.g; colors[k * 3 + 2] = straw.b;
    }
    rg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    roofs.push(place(rg));
    // 棟（竹と杉皮で押さえた黒い棟）
    const mune = VILLAGE_RIDGE().clone().scale(rl * 2 + .6, 1, 1);
    mune.translate(0, H + rh - .06, 0); walls.push(paint(place(mune), vary(0x615440, i + 2)));
    roofMats.push({ hx, hz, top: y + H + rh, ry, rl });
    }
    // 家の脇に柿の木
    if (R() < 0.75) {
      const [tx, tz] = W(lx + (R() < 0.5 ? -1 : 1) * (hw + 3 + R() * 2), lz + (R() - 0.5) * 4);
      const ty = world.heightAt(tx, tz);
      const trunk = new THREE.CylinderGeometry(0.14, 0.2, 2.4, 5); trunk.rotateZ((R() - 0.5) * 0.3); trunk.translate(tx, ty + 1.2, tz); trees.push(paint(trunk, 0x3a3026));
      for (let q = 0; q < 3; q++) {
        const crownRadius = 1.4 + R() * .6;
        const crownX = tx + (R() - .5) * 1.6, crownY = ty + 3 + R() * .8, crownZ = tz + (R() - .5) * 1.6;
        if (o.bareTrees) {
          // 落葉期の柿。乱数の順と家の配置を保ち、葉の塊を細い枝へ替える。
          const angle = q * Math.PI * 2 / 3 + i;
          for (const side of [-1, 1]) {
            const length = side < 0 ? 1.8 : 1.15;
            const branch = new THREE.CylinderGeometry(.025, .065, length, 4);
            branch.rotateZ(side * .65); branch.rotateY(angle);
            branch.translate(tx - side * Math.cos(angle) * length * .3,
              ty + 2.1 + length * .4, tz + side * Math.sin(angle) * length * .3);
            trees.push(paint(branch, 0x514235));
          }
        } else {
          const cr = new THREE.IcosahedronGeometry(crownRadius, 1); cr.scale(1.2, .8, 1.1);
          cr.translate(crownX, crownY, crownZ);
          trees.push(paint(cr, vary(0x3e4a2c, q + i)));
        }
      }
      if (o.autumn) for (let q = 0; q < 14; q++) { const f = new THREE.OctahedronGeometry(0.12, 0); f.translate(tx + (R() - 0.5) * 3.2, ty + 2.6 + R() * 1.6, tz + (R() - 0.5) * 3.2); trees.push(paint(f, 0xd8701c)); }
    }
  });
  // 井戸（石の井筒と、つるべの屋根）・干し物（竿に掛けた布）・置き去りの荷車。家ごとに少しずつ
  spots.forEach(([lx, lz], i) => {
    const k = R();
    if (i === 0 || k < 0.25) {
      const [wx, wz] = W(lx + 6, lz + 4); const wy = world.heightAt(wx, wz);
      const ring = new THREE.CylinderGeometry(0.6, 0.65, 0.7, 10, 1, true); ring.translate(wx, wy + 0.35, wz); walls.push(paint(ring, 0x7a756a));
      solidCircle(wx, wz, 0.75);
      const water = new THREE.CircleGeometry(0.55, 10); water.rotateX(-Math.PI / 2); water.translate(wx, wy + 0.5, wz); walls.push(paint(water, 0x1a1c1c));
      for (const sx of [-0.7, 0.7]) { const p = new THREE.BoxGeometry(0.1, 1.9, 0.1); p.translate(wx + sx, wy + 0.95, wz); walls.push(paint(p, 0x4a3a28)); }
      const rf = new THREE.BoxGeometry(1.9, 0.08, 1.2); rf.rotateZ(0.05); rf.translate(wx, wy + 1.95, wz); walls.push(paint(rf, 0x3a342c));
    } else if (k < 0.6) {
      const [ax, az] = W(lx - 4, lz + 4), [bx, bz] = W(lx + 1, lz + 4.6);
      for (const [px2, pz2] of [[ax, az], [bx, bz]]) { const p = new THREE.CylinderGeometry(0.04, 0.05, 1.8, 4); p.translate(px2, world.heightAt(px2, pz2) + 0.9, pz2); walls.push(paint(p, 0x5a4a34)); }
      for (let q = 0; q < 3; q++) {
        const t = 0.2 + q * 0.28, cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
        const cl = new THREE.PlaneGeometry(0.7, 0.9); cl.rotateY(Math.atan2(bx - ax, bz - az) + Math.PI / 2); cl.translate(cx, world.heightAt(cx, cz) + 1.3, cz);
        walls.push(paint(cl, [0x3a4a6a, 0xa89a80, 0x6a4a3a][q]));
      }
    } else if (k < 0.75) {
      // 荷車：二つの車輪と荷台。逃げた後に置き去りにされ、荷が崩れている
      const [cx, cz] = W(lx + 5, lz - 3); const cy = world.heightAt(cx, cz), cr = ry0(i);
      const bed = new THREE.BoxGeometry(1.2, 0.12, 2.4); bed.rotateX(0.18); bed.rotateY(cr); bed.translate(cx, cy + 0.55, cz); walls.push(paint(bed, 0x5a4630));
      for (const sd of [-1, 1]) { const wh = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 10); wh.rotateZ(Math.PI / 2); wh.rotateY(cr); wh.translate(cx + Math.cos(cr) * sd * 0.7, cy + 0.5, cz - Math.sin(cr) * sd * 0.7); walls.push(paint(wh, 0x3a2c1e)); }
      for (let q = 0; q < 3; q++) { const b = new THREE.BoxGeometry(0.5, 0.35, 0.4); b.rotateY(q); b.translate(cx + (q - 1) * 0.6 + 0.9, cy + 0.18, cz + (q % 2) * 0.5); walls.push(paint(b, vary(0x8a7650, q))); }
    }
  });
  // 竹林：家並みの裏（田と反対の側）に、細く高い竹が群れて立つ（尾張・美濃の里の景色）
  const bam = o.bamboo ?? 2;
  for (let bI = 0; bI < bam; bI++) {
    const [bx, bz] = W((R() - 0.5) * rad * 1.6, -rad * 0.6 - 6 - R() * 6);
    for (let q = 0; q < 26; q++) {
      const x = bx + (R() - 0.5) * 9, z = bz + (R() - 0.5) * 6, y = world.heightAt(x, z), H = 8 + R() * 5;
      const st = new THREE.CylinderGeometry(0.05, 0.07, H, 5); st.rotateZ((R() - 0.5) * 0.12); st.translate(x, y + H / 2, z);
      trees.push(paint(st, vary(0x7a8a4a, q)));
      // 竹の葉：梢の上の方に、横へ広がって垂れる細かな葉の房をいくつか（逆さの円錐にしない）。梢は少し片側へしなる
      const lean = R() * 6.28;
      for (let l = 0; l < 3; l++) {
        const lf = new THREE.IcosahedronGeometry(0.62 + R() * 0.35, 0);
        lf.scale(1.35, 0.5 + R() * 0.2, 1.05); lf.rotateY(R() * 6.28); lf.rotateZ((R() - 0.5) * 0.5);
        const off = 0.3 + l * 0.35;
        lf.translate(x + Math.cos(lean) * off + (R() - 0.5) * 0.6, y + H - 0.4 - l * 1.3, z + Math.sin(lean) * off + (R() - 0.5) * 0.6);
        trees.push(paint(lf, vary(0x4e6a34, q + l)));
      }
    }
  }
  const grp = new THREE.Group();
  for (const home of homes) grp.add(home);
  if (walls.length) {
    const mat = o.groundedHomes ? VILLAGE_WALL() : VILLAGE_WALL_LITE();
    const near = merged([...walls, ...houseFrames], mat), far = merged(walls, mat);
    const coarse = kitCoarse(far.geometry, .8);
    if (coarse) { far.geometry.dispose(); far.geometry = coarse; }
    for (const m of [near, far]) { m.castShadow = false; if (o.cameraWalls) m.userData.camBlock = true; }
    const originY = world.heightAt(x, z);
    for (const m of [near, far]) m.geometry.translate(-x, -originY, -z);
    const lod = new THREE.LOD(); lod.position.set(x, originY, z);
    lod.addLevel(near, 0); lod.addLevel(far, Math.max(42, rad * 2)); grp.add(lod);
    for (const g of [...walls, ...houseFrames]) g.dispose();
  }
  if (roofs.length) {
    const rm = new THREE.Mesh(mergeGeometries(roofs), VILLAGE_THATCH());
    rm.receiveShadow = true; rm.userData.camBlock = true; grp.add(rm);
    for (const g of roofs) g.dispose();
  }
  if (trees.length) grp.add(new THREE.Mesh(mergeGeometries(trees), new THREE.MeshLambertMaterial({ vertexColors: true })));
  // 田と畦：家並みの前に、段になった小さな田が並ぶ。水を張った田に空が映る
  const nf = o.fields ?? 12, cols = Math.max(2, Math.round(Math.sqrt(nf * 1.6))), fw = 14, fd = 9;
  const water = [], aze = [], fieldSites = [];
  const field = fieldState(world.def, !!o.autumn);
  for (let k = 0; k < nf; k++) {
    const ci = k % cols, ri = Math.floor(k / cols);
    const lx0 = (ci - cols / 2) * (fw + 0.8), lz0 = rad * 0.5 + 6 + ri * (fd + 0.8);
    const g = new THREE.PlaneGeometry(fw, fd, 4, 3); g.rotateX(-Math.PI / 2);
    const P = g.attributes.position;
    // 田の面は平ら（真ん中の高さ）、畦は縁の高さに沿う
    const [mx, mz] = W(lx0 + fw / 2, lz0 + fd / 2);
    let lo = Infinity, hi = -Infinity;
    for (let q = 0; q < P.count; q++) {
      const [wx, wz] = W(lx0 + fw / 2 + P.getX(q), lz0 + fd / 2 + P.getZ(q));
      const h = world.heightAt(wx, wz); lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    // 斜面へ水を貼らない。段を削る縄張りがない所は田を置かない。
    if (hi - lo > 0.18) { g.dispose(); continue; }
    const my = hi + 0.03;
    fieldSites[k] = my;
    if (world.villageFields) world.villageFields.push({ x: mx, z: mz, c, s: sn, w: fw, d: fd, y: my, wet: field.wet });
    for (let q = 0; q < P.count; q++) {
      const [wx, wz] = W(lx0 + fw / 2 + P.getX(q), lz0 + fd / 2 + P.getZ(q));
      P.setXYZ(q, wx, field.wet ? my : world.heightAt(wx, wz) + 0.02, wz);
    }
    g.computeVertexNormals();
    water.push(g);
    const ring = [[0, 0], [fw, 0], [fw, fd], [0, fd], [0, 0]];
    for (let e = 0; e < 4; e++) {
      const [ax, az] = ring[e], [bx, bz] = ring[e + 1];
      for (let q = 0; q < 3; q++) {
        const t0 = q / 3, t1 = (q + 1) / 3;
        const [x0, z0] = W(lx0 + ax + (bx - ax) * t0, lz0 + az + (bz - az) * t0), [x1, z1] = W(lx0 + ax + (bx - ax) * t1, lz0 + az + (bz - az) * t1);
        const L = Math.hypot(x1 - x0, z1 - z0);
        const b = new THREE.BoxGeometry(0.5, 0.3, L + 0.1);
        b.rotateY(Math.atan2(x1 - x0, z1 - z0));
        const bxm = (x0 + x1) / 2, bzm = (z0 + z1) / 2;
        b.translate(bxm, Math.max(my, world.heightAt(bxm, bzm)) + 0.08, bzm);
        aze.push(paint(b, vary(0x6a6a44, e + q + k)));
      }
    }
  }
  if (water.length) {
    const wm = new THREE.Mesh(mergeGeometries(water), liteMat({ color: field.wet ? 0x5f6e62 : 0x756447, roughness: field.wet ? 0.28 : 0.95, metalness: 0 }));
    if (field.wet) rippleWater(wm.material, WIND_STATE.dirX * 0.15, WIND_STATE.dirZ * 0.15, 0.6, world.hemi.color);
    wm.receiveShadow = true; grp.add(wm);
    // 水のある時期だけ薄い水面の色を重ねる。
    if (field.wet && field.height > 0) {
    const ne = new THREE.Mesh(mergeGeometries(water.map((g) => g.clone().translate(0, 0.04, 0))), new THREE.MeshLambertMaterial({ color: 0x6f8a4a, transparent: true, opacity: 0.35, depthWrite: false }));
    grp.add(ne);
    }
  }
  if (aze.length) grp.add(new THREE.Mesh(mergeGeometries(aze), new THREE.MeshLambertMaterial({ vertexColors: true })));
  // 稲の株の列：水面から立つ細い緑の筋（一つの形にまとめて軽く）。畑：家の脇に畝を立て、青物の列。道祖神：里の入口の小さな石の神
  const crops = [];
  for (let k = 0; k < nf; k++) {
    if (fieldSites[k] == null || field.height <= 0) continue;
    const ci = k % cols, ri = Math.floor(k / cols);
    const lx0 = (ci - cols / 2) * (fw + 0.8), lz0 = rad * 0.5 + 6 + ri * (fd + 0.8);
    const [mx, mz] = W(lx0 + fw / 2, lz0 + fd / 2);
    const my = fieldSites[k];
    if (o.riceClumps) {
      // 近くまで歩ける村だけ、連続した緑の壁を隙間のある稲株へ替える。
      // 設営時に全株を既存の作物の形へまとめ、描く回数は増やさない。
      const blades = [];
      for (let q = 0.8; q < fw - 0.5; q += 0.9) for (let r = 0.6; r < fd - 0.5; r += 0.85) {
        const jitter = Math.sin(k * 17 + q * 9 + r * 7);
        const lx = lx0 + q + jitter * 0.08, lz = lz0 + r + Math.cos(q * 7 + r * 11) * 0.08;
        const h = field.height * (0.8 + (jitter + 1) * 0.17);
        const [bx, bz] = W(lx, lz);
        for (let leaf = 0; leaf < 3; leaf++) {
          const a = leaf * Math.PI * 2 / 3 + jitter, dx = Math.cos(a), dz = Math.sin(a);
          const [tx, tz] = W(lx + dx * 0.18, lz + dz * 0.18);
          const [ax, az] = W(lx + dx * 0.07 - dz * 0.025, lz + dz * 0.07 + dx * 0.025);
          const [ex, ez] = W(lx + dx * 0.07 + dz * 0.025, lz + dz * 0.07 - dx * 0.025);
          blades.push(bx, my, bz, ax, my + h * 0.55, az, tx, my + h, tz,
            bx, my, bz, tx, my + h, tz, ex, my + h * 0.55, ez);
        }
      }
      const rice = new THREE.BufferGeometry();
      rice.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
      rice.computeVertexNormals(); crops.push(paint(rice, vary(field.color, k)));
      continue;
    }
    for (let q = 0.8; q < fw - 0.5; q += 0.9) {
      const [x0, z0] = W(lx0 + q, lz0 + 0.6), [x1, z1] = W(lx0 + q, lz0 + fd - 0.6);
      const L = Math.hypot(x1 - x0, z1 - z0), b = new THREE.BoxGeometry(0.1, field.height, L);
      b.rotateY(Math.atan2(x1 - x0, z1 - z0)); b.translate((x0 + x1) / 2, my + field.height / 2, (z0 + z1) / 2);
      crops.push(paint(b, vary(field.color, k + Math.round(q))));
    }
  }
  const nh = Math.min(3, spots.length);
  for (let i = 0; i < nh; i++) {
    const [lx, lz] = spots[i], ox = lx + (R() < 0.5 ? -1 : 1) * 7, oz = lz - 5;
    const cy = world.heightAt(...W(ox, oz));
    for (let q = 0; q < 5; q++) {
      const [x0, z0] = W(ox - 3, oz + q * 1.1), [x1, z1] = W(ox + 3, oz + q * 1.1);
      const L = Math.hypot(x1 - x0, z1 - z0), a2 = Math.atan2(x1 - x0, z1 - z0);
      const une = new THREE.BoxGeometry(0.6, 0.25, L); une.rotateY(a2); une.translate((x0 + x1) / 2, cy + 0.1, (z0 + z1) / 2);
      crops.push(paint(une, vary(0x5a4632, q + i)));
      const ao = new THREE.BoxGeometry(0.35, 0.3, L - 0.4); ao.rotateY(a2); ao.translate((x0 + x1) / 2, cy + 0.36, (z0 + z1) / 2);
      crops.push(paint(ao, vary(i % 2 ? 0x4f6e2c : 0x6a7f34, q)));
    }
  }
  {
    const [dx, dz] = W(-rad - 3, 2), dy = world.heightAt(dx, dz);
    const st = new THREE.CylinderGeometry(0.22, 0.3, 0.7, 7); st.translate(dx, dy + 0.35, dz); crops.push(paint(st, vary(0x7a776c, 1)));
    const base = new THREE.BoxGeometry(0.8, 0.18, 0.8); base.translate(dx, dy + 0.09, dz); crops.push(paint(base, vary(0x6a675e, 2)));
    const rf = new THREE.ConeGeometry(0.62, 0.35, 4); rf.rotateY(Math.PI / 4 + rot); rf.translate(dx, dy + 1.05, dz); crops.push(paint(rf, vary(0x4a3a2a, 3)));
    for (const sx of [-0.4, 0.4]) { const po = new THREE.BoxGeometry(0.06, 0.95, 0.06); po.translate(dx + sx * c, dy + 0.48, dz - sx * sn); crops.push(paint(po, vary(0x4a3a2a, 4))); }
  }
  if (crops.length) grp.add(new THREE.Mesh(mergeGeometries(crops), new THREE.MeshLambertMaterial({ vertexColors: true, side: o.riceClumps ? THREE.DoubleSide : THREE.FrontSide })));
  // 炊事の煙：いくつかの家の棟の端から昇る
  if (world.addSmokeColumn) roofMats.slice(0, o.smoke ?? 2).forEach((h) => world.addSmokeColumn(h.hx + Math.sin(h.ry + Math.PI / 2) * h.rl, h.top, h.hz + Math.cos(h.ry + Math.PI / 2) * h.rl, { size: 0.8 }));
  return grp;
}

// ---- 絵の道具（城の材質と瓦）：色と高さを一度に描き、高さから法線の絵を作る
const rnd = (s) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
// 高さの絵（白いほど手前）から法線の絵を作る。少しぼかしてから差を取り、端は反対側へ回り込む（繰り返しても繋ぎ目が出ない）
function normalFrom(hc, k) {
  const w = hc.width, h = hc.height, s = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const a = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = s[i * 4] / 255;
  const at = (A, x, y) => A[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b[y * w + x] = (at(a, x, y) * 4 + at(a, x - 1, y) + at(a, x + 1, y) + at(a, x, y - 1) + at(a, x, y + 1)) / 8;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // 絵の下向きは v の逆（flipY）なので、縦の差は符号を返す
    const nx = -(at(b, x + 1, y) - at(b, x - 1, y)) * k, ny = (at(b, x, y + 1) - at(b, x, y - 1)) * k, l = Math.hypot(nx, ny, 1), i = (y * w + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (0.5 / l + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
// 色の絵と高さの絵を一度に描き、{ map, nrm } を返す。どれも最初の一度だけ作って使い回す
function pairTex(w, h, f, k = 6) {
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const c = mk(), hc = mk();
  f(c.getContext('2d'), hc.getContext('2d', { willReadFrequently: true }));
  const map = new THREE.CanvasTexture(c); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace;
  const nrm = new THREE.CanvasTexture(normalFrom(hc, k)); nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
  map.userData.astcStatic = nrm.userData.astcStatic = true;   // 一度描いたきり：iPhone は送った後に canvas を返す（astc_rt）
  return { map, nrm };
}
const gray = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
// 端にかかる物は反対側にも描く（繰り返しの繋ぎ目を消す）
const wrapDraw = (S, x0, y0, x1, y1, f) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) if (x1 + ox > 0 && x0 + ox < S && y1 + oy > 0 && y0 + oy < S) f(ox, oy); };
const polyPath = (g, pts, ox, oy) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + ox, y + oy) : g.moveTo(x + ox, y + oy))); g.closePath(); };

// 瓦の屋根：本瓦葺き。丸瓦の列（山）と平瓦（谷）、段ごとに瓦尻が一段高く、その下に影。瓦一枚ずつの濃淡・谷の苔・雨だれ・山の上の白い埃
// 色と法線の二枚（一度だけ作る）。一回りは 8 列 × 8 段
let tileTexC = null;
function tileTex() {
  if (tileTexC) return tileTexC;
  tileTexC = pairTex(256, 256, (g, hg) => {
    const S = 256, C = 32, R = rnd(41);
    g.fillStyle = '#34332f'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += C) {
      for (let x = 0; x < S; x += C) {
        const t = (R() - 0.5) * 16;
        // 平瓦（谷）：浅く窪み、両脇は丸瓦の影
        g.fillStyle = `rgb(${54 + t},${53 + t},${49 + t})`; g.fillRect(x, y, 20, C);
        const vg = g.createLinearGradient(x, 0, x + 20, 0); vg.addColorStop(0, 'rgba(0,0,0,.38)'); vg.addColorStop(0.3, 'rgba(0,0,0,0)'); vg.addColorStop(0.7, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.3)');
        g.fillStyle = vg; g.fillRect(x, y, 20, C);
        const vh = hg.createLinearGradient(x, 0, x + 20, 0); vh.addColorStop(0, gray(110)); vh.addColorStop(0.5, gray(60)); vh.addColorStop(1, gray(110));
        hg.fillStyle = vh; hg.fillRect(x, y, 20, C);
        // 丸瓦（山）：左が明るく右が暗い丸み
        const mg = g.createLinearGradient(x + 20, 0, x + 32, 0); mg.addColorStop(0, `rgb(${112 + t},${111 + t},${106 + t})`); mg.addColorStop(0.4, `rgb(${80 + t},${79 + t},${75 + t})`); mg.addColorStop(1, '#1e1d1b');
        g.fillStyle = mg; g.fillRect(x + 20, y, 12, C);
        const mh = hg.createLinearGradient(x + 20, 0, x + 32, 0); mh.addColorStop(0, gray(130)); mh.addColorStop(0.45, gray(255)); mh.addColorStop(1, gray(130));
        hg.fillStyle = mh; hg.fillRect(x + 20, y, 12, C);
        // 山の上に白い埃
        g.fillStyle = `rgba(200,196,186,${0.04 + R() * 0.08})`; g.fillRect(x + 22, y, 3, C);
      }
      // 段：一枚の瓦は下（軒の側・絵の下）へ行くほど浮き、瓦尻で一段落ちる
      const sg = hg.createLinearGradient(0, y, 0, y + C); sg.addColorStop(0, gray(0, 0.35)); sg.addColorStop(0.6, gray(0, 0)); sg.addColorStop(1, gray(255, 0.25));
      hg.fillStyle = sg; hg.fillRect(0, y, S, C);
      // 瓦尻の縁の光と、下の段に落ちる影
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0, y + C - 2, S, 1);
      const yy = (y + C) % S, dg = g.createLinearGradient(0, yy, 0, yy + 6); dg.addColorStop(0, 'rgba(0,0,0,.55)'); dg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = dg; g.fillRect(0, yy, S, 6);
    }
    // 谷の苔と、上から下へ流れた雨だれの白い筋
    for (let i = 0; i < 140; i++) { const x = Math.floor(R() * 8) * C + 3 + R() * 14; g.fillStyle = `rgba(${66 + R() * 30},${84 + R() * 30},50,${0.08 + R() * 0.16})`; g.fillRect(x, R() * S, 2 + R() * 4, 2 + R() * 9); }
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(200,196,186,${0.03 + R() * 0.05})`; g.fillRect(R() * S, 0, 1 + R(), S); }
  }, 8);
  return tileTexC;
}
const TILE = lazy(() => liteMat({ map: tileTex().map, normalMap: tileTex().nrm, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.62, metalness: 0.08, side: THREE.DoubleSide }));

// 寄棟の屋根の形（軒 ex×ez、高さ rh、棟の半分 rl）。y は軒の高さ。
// 反り：面は軒から棟へ次第に急になる（縦の断面が凹む）、軒の隅は跳ね上がる（隅から棟へ向けて薄れる）。
// 隅棟の線は隣り合う二つの面で同じ点を通るので割れない。四つの面ごとに滑らかな法線、軒先に厚み
const roofY = (rh, t) => rh * (0.5 * t + 0.5 * t * t);
const roofLift = (lift, u, t) => lift * Math.pow(Math.abs(u), 3) * (1 - t) * (1 - t);
function hipGeo(ex, ez, rh, y, rl = Math.max(0.4, ex - ez), lift = Math.min(0.55, 0.28 + ez * 0.04), thickness = .24) {
  const NU = 8, NT = 6, parts = [];
  // 面：eave(u) から ridge(u) へ（u は -1〜1、t は 0 = 軒・1 = 棟）
  const faces = [
    [(u) => [u * ex, ez], (u) => [u * rl, 0], ex],
    [(u) => [-u * ex, -ez], (u) => [-u * rl, 0], ex],
    [(u) => [ex, -u * ez], () => [rl, 0], ez],
    [(u) => [-ex, u * ez], () => [-rl, 0], ez],
  ];
  for (const [E, Rg, half] of faces) {
    const pos = [], uv = [], idx = [];
    const slope = Math.hypot(ez, rh);
    for (let j = 0; j <= NT; j++) for (let i = 0; i <= NU; i++) {
      const u = i / NU * 2 - 1, t = j / NT, [ex0, ez0] = E(u), [rx, rz] = Rg(u);
      pos.push(ex0 + (rx - ex0) * t, y + roofY(rh, t) + roofLift(lift, u, t), ez0 + (rz - ez0) * t);
      uv.push(u * half * 0.5, t * slope * 0.5);
    }
    for (let j = 0; j < NT; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
    // 軒の厚み（跳ね上がりに沿う帯）
    const th = thickness, o = pos.length / 3;
    for (let i = 0; i <= NU; i++) { const u = i / NU * 2 - 1, [ex0, ez0] = E(u), yy = y + roofLift(lift, u, 0); pos.push(ex0, yy, ez0, ex0, yy - th, ez0); uv.push(u * half * 0.5, 0, u * half * 0.5, 0.06); }
    for (let i = 0; i < NU; i++) { const a = o + i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g.toNonIndexed());
  }
  return mergeGeometries(parts);
}
// 屋根の面の上の点（ktile の隅棟と軒瓦を面に沿わせる）
function hipPoint(ex, ez, rh, rl, lift, face, u, t) {
  const E = [[u * ex, ez], [-u * ex, -ez], [ex, -u * ez], [-ex, u * ez]][face], R = [[u * rl, 0], [-u * rl, 0], [rl, 0], [-rl, 0]][face];
  return [E[0] + (R[0] - E[0]) * t, roofY(rh, t) + roofLift(lift, u, t), E[1] + (R[1] - E[1]) * t];
}

// 堂と楼門で共用する軒裏。反った屋根と同じ座標から野地板・桁・垂木を作る。
// 木の既存のまとめへ結合し、材質も描画回数も増やさない。遠方と軽い画質は板と桁だけ。
const hipEaveShapes = new Map();
export function hipEaveGeo(ex, ez, rh, y, rl, coarse = false, exposed = false) {
  const key = [ex, ez, rh, rl, coarse, exposed].join(':');
  let geo = hipEaveShapes.get(key);
  if (!geo) {
    const parts = [], lift = Math.min(.55, .28 + ez * .04);
    const point = (face, u, t, drop) => {
      const p = hipPoint(ex, ez, rh, rl, lift, face, u, t);
      return new THREE.Vector3(p[0], p[1] - drop, p[2]);
    };
    const beam = (a, b, width, height, color) => {
      const delta = b.clone().sub(a), g = new THREE.BoxGeometry(width, height, delta.length());
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.normalize()));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      parts.push(paint(g, color));
    };
    const segments = coarse ? 4 : 8;
    for (let face = 0; face < 4; face++) {
      const positions = [], uv = [];
      for (let i = 0; i < segments; i++) {
        const u0 = i * 2 / segments - 1, u1 = (i + 1) * 2 / segments - 1;
        // 化粧屋根裏を見せる鐘楼は、軒だけでなく棟まで野地板を張る（造作は推定）。
        // 瓦と同じ六段の反りへ沿わせ、下から瓦の裏面が見えないようにする。
        const rows = exposed ? 6 : 1;
        for (let j = 0; j < rows; j++) {
          const t0 = exposed ? j / rows : 0, t1 = exposed ? (j + 1) / rows : .24;
          const a = point(face, u0, t0, .24), b = point(face, u1, t0, .24);
          const c = point(face, u0, t1, .24), d = point(face, u1, t1, .24);
          for (const p of [a, d, b, a, c, d]) { positions.push(p.x, p.y, p.z); uv.push(p.x / 2, p.z / 2); }
        }
        beam(point(face, u0, .18, .38), point(face, u1, .18, .38), .22, .24, 0x544332);
        beam(point(face, u0, 0, .24), point(face, u1, 0, .24), .12, .16, 0x79634a);
      }
      const board = new THREE.BufferGeometry();
      board.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      board.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      board.computeVertexNormals(); parts.push(paint(board, 0x554534));
      if (!coarse) {
        const half = face < 2 ? ex : ez, count = Math.min(20, Math.max(4, Math.ceil(half * 2 / .65)));
        for (let i = 1; i < count; i++) {
          const u = i / count * 2 - 1;
          // 二つの短い材で屋根の反りへ沿わせ、木口を軒の厚みへ収める。
          const runs = exposed ? 6 : 2, step = exposed ? 1 / runs : .12;
          for (let j = 0; j < runs; j++) beam(point(face, u, j * step, .32), point(face, u, (j + 1) * step, .32), .085, .12, 0x887054);
        }
      }
    }
    geo = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    hipEaveShapes.set(key, geo);
  }
  return geo.clone().translate(0, y, 0);
}

// 楼門：二階建ての寺の門。下は柱の間を通り、上に高欄を回した楼、二重の瓦の屋根。
// 冠木門（kabukimon）と同じく、w は通り道の幅、rot で向き（rot = π/2 で東西に通る）
export function romon(world, x, z, w = 6.4, rot = 0) {
  const parts = [], tiles = [];
  // 両脇の柱の並び（真ん中は通れる）
  { const c = Math.cos(rot), sn = Math.sin(rot), W2 = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    for (const sx of [-w / 2 - 0.3, w / 2 + 0.3]) { const [ax, az] = W2(sx, -1.6), [bx, bz] = W2(sx, 1.6); solidSeg(ax, az, bx, bz, 0.35); } }
  const D = 1.6, H = 3.6, col = 0x5e4230;
  for (const sx of [-w / 2 - 0.3, w / 2 + 0.3]) for (const sz of [-D, 0, D]) {
    const p = new THREE.CylinderGeometry(0.2, 0.22, H + 2.6, 10); p.translate(sx, (H + 2.6) / 2, sz); parts.push(paint(p, vary(col, sx * 3 + sz)));
    const base = new THREE.CylinderGeometry(0.34, 0.4, 0.28, 8); base.translate(sx, 0.14, sz); parts.push(paint(base, 0x8a857a));
  }
  // 貫と、上の楼の床
  for (const y of [H - 0.8, H]) { const b = new THREE.BoxGeometry(w + 1.2, 0.26, 0.24); b.translate(0, y, D); parts.push(paint(b, 0x4e3624)); const b2 = b.clone(); b2.translate(0, 0, -2 * D); parts.push(paint(b2, 0x4e3624)); }
  // 下の屋根（腰の屋根）
  tiles.push(hipGeo(w / 2 + 1.9, D + 1.7, 0.7, H + 0.2, w / 2 + 1.2));
  parts.push(hipEaveGeo(w / 2 + 1.9, D + 1.7, 0.7, H + 0.2, w / 2 + 1.2));
  // 楼：板壁と、まわりの高欄
  const room = new THREE.BoxGeometry(w + 0.4, 2.0, 2 * D + 0.2); room.translate(0, H + 1.9, 0); parts.push(paint(room, 0x6a4c34));
  const plaster = new THREE.BoxGeometry(w + 0.44, 0.6, 2 * D + 0.24); plaster.translate(0, H + 2.5, 0); parts.push(paint(plaster, 0xcfc6b2));
  const deck = new THREE.BoxGeometry(w + 1.6, 0.14, 2 * D + 1.4); deck.translate(0, H + 0.95, 0); parts.push(paint(deck, 0x4a3422));
  for (const [lx, lz, L, rotY] of [[0, D + 0.7, w + 1.6, 0], [0, -D - 0.7, w + 1.6, 0], [w / 2 + 0.8, 0, 2 * D + 1.4, Math.PI / 2], [-w / 2 - 0.8, 0, 2 * D + 1.4, Math.PI / 2]]) {
    const r = new THREE.BoxGeometry(L, 0.08, 0.1); r.rotateY(rotY); r.translate(lx, H + 1.55, lz); parts.push(paint(r, 0x3a2818));
  }
  // 上の大屋根と棟
  tiles.push(hipGeo(w / 2 + 2.2, D + 2.0, 1.9, H + 3.0, w / 2 + 0.6));
  parts.push(hipEaveGeo(w / 2 + 2.2, D + 2.0, 1.9, H + 3.0, w / 2 + 0.6));
  const mune = new THREE.BoxGeometry(w + 1.6, 0.34, 0.4); mune.translate(0, H + 4.95, 0); parts.push(paint(mune, 0x222120));
  const grp = new THREE.Group();
  grp.add(merged(parts));
  const tm = new THREE.Mesh(mergeGeometries(tiles), TILE()); tm.castShadow = true; tm.receiveShadow = true; tm.userData.camBlock = true;
  grp.add(tm);
  grp.position.set(x, world.heightAt(x, z), z);
  grp.rotation.y = rot;
  return grp;
}

// 寺の堂：石の基壇に柱を並べ、縁側を回し、軒の深い瓦の大屋根。w×d は堂の身舎（もや）の大きさ、rot で向き（正面は +z）
export function dou(world, x, z, w = 10, d = 7, rot = 0, o = {}) {
  const parts = [], tiles = [], latticeParts = [];
  // 小堂の縁板・軒天・梁は窓の連子と同じ木材へ結合する。
  // 材の長手へ木目を通し、面の大きさで木肌の粒が伸びないようにする。
  const woodGrain = (g, bw, bh, bd) => {
    const pos = g.attributes.position, normal = g.attributes.normal, uv = g.attributes.uv;
    const axis = bw >= bh && bw >= bd ? 'x' : bh >= bd ? 'y' : 'z';
    for (let j = 0; j < pos.count; j++) {
      const across = axis === 'y'
        ? Math.abs(normal.getX(j)) > .5 ? pos.getZ(j) : pos.getX(j)
        : Math.abs(normal.getY(j)) > .5 ? axis === 'x' ? pos.getZ(j) : pos.getX(j) : pos.getY(j);
      uv.setXY(j, across, axis === 'x' ? pos.getX(j) : axis === 'y' ? pos.getY(j) : pos.getZ(j));
    }
    return g;
  };
  if (!o.interior) solidRect(x, z, w + 3.4, d + 3.4, rot).civilianSite = 'temple';
  const y0 = 0.7, H = o.h || 3.6;
  let ground = world.heightAt(x, z), lowest = ground;
  if (o.interior?.profile === 'anegawa') {
    // 基壇の九点だけでは、点の間の起伏が床や縁側へ食い込む。
    // 高画質では館と同じ一メートル以下の間隔で基壇全体を測る。
    // 設営時だけ測り、低い側の基壇・石段・室内・柱の当たりへ同じ高さを渡す。
    const c = Math.cos(rot), s = Math.sin(rot);
    const nx = SETTINGS.quality === 'high' ? Math.ceil(w + 3.4) : 2;
    const nz = SETTINGS.quality === 'high' ? Math.ceil(d + 3.4) : 2;
    for (let iz = 0; iz <= nz; iz++)
      for (let ix = 0; ix <= nx; ix++) {
        const px = -w / 2 - 1.7 + (w + 3.4) * ix / nx;
        const pz = -d / 2 - 1.7 + (d + 3.4) * iz / nz;
        const h = world.heightAt(x + px * c + pz * s, z - px * s + pz * c);
        ground = Math.max(ground, h); lowest = Math.min(lowest, h);
      }
  }
  // 姉川の小堂の採光は用途からの推定。須弥壇の背面を避け、外陣の両側に連子窓を置く。
  // 窓の高さは室内の床から測り、外壁の開口・内壁・当たりで同じ寸法を使う。
  const hallWindows = SETTINGS.quality === 'high' && o.interior?.profile === 'anegawa'
    ? [-1, 1].map(s => ({ face: 'x', s, t: (d - .18) * .17,
      w: Math.min(.9, (d - .18) * .24), y0: .85, y1: Math.min(1.65, H - .3) })) : [];
  // 基壇（まわりの地面の低い所に合わせて深めに）
  const baseBottom = Math.min(-1.2, lowest - ground - .15);
  const base = new THREE.BoxGeometry(w + 3.4, y0 - baseBottom, d + 3.4); base.translate(0, (y0 + baseBottom) / 2, 0); parts.push(paint(base, 0x8a857a));
  // 縁側と、正面の階
  const en = new THREE.BoxGeometry(w + 2.4, 0.12, d + 2.4); en.translate(0, y0 + 0.3, 0); parts.push(paint(en, 0x5a4230));
  const nx = Math.max(2, Math.round(w / 2.4)), nz = Math.max(2, Math.round(d / 2.4));
  if (o.interior?.profile === 'anegawa' && SETTINGS.quality === 'high') {
    // 四辺の縁板は線だけでなく、木目のある板で張る推定復元。
    // 前後は横、脇は縦。四隅は前後の板を通し、身舎の床と戸口へは重ねない。
    // 既存の板面の高さと下地を使い、薄い表板だけ窓の木材へ一束にまとめる。
    const joint = new THREE.BoxGeometry(1, 1, 1);
    const plank = (px, pz, bw, bd, color) => {
      const g = joint.clone(); g.scale(bw, .004, bd);
      woodGrain(g, bw, .004, bd);
      g.translate(px, y0 + .36, pz); latticeParts.push(paint(g, color));
    };
    // 縁板を建物の端から端まで一枚にせず、床下の根太の上で木口を継ぐ。
    // 縁柱と同じ割り付けを使い、目地の下には既存の縁板下地を残す。
    // 部材は設営時だけ分け、共有の箱・材質と既存の結合先へ納める。
    const frontCuts = [-w / 2 - 1.2];
    const sideCuts = [-d / 2];
    for (let i = 1; i < nx; i++) frontCuts.push(-w / 2 - .5 + i * (w + 1) / nx);
    for (let i = 1; i < nz; i++) sideCuts.push(-d / 2 - .5 + i * (d + 1) / nz);
    frontCuts.push(w / 2 + 1.2); sideCuts.push(d / 2);
    for (const side of [-1, 1]) {
      for (let q = 0; q < 4; q++) {
        const color = q % 2 ? 0x725b40 : 0x6a5238;
        for (let i = 1; i < frontCuts.length; i++) {
          const a = frontCuts[i - 1], b = frontCuts[i];
          plank((a + b) / 2, side * (d / 2 + (q + .5) * .3), b - a - .002, .298, color);
        }
        for (let i = 1; i < sideCuts.length; i++) {
          const a = sideCuts[i - 1], b = sideCuts[i];
          plank(side * (w / 2 + (q + .5) * .3), (a + b) / 2, .298, b - a - .002, color);
        }
      }
    }
    joint.dispose();
  }
  if (o.interior?.profile === 'anegawa') {
    // 小堂の石段は室内の登り坂と同じ両端を使い、縁板の上面までつなぐ。
    const near = (d - .18) / 2 + 1.3, far = near + 1.8;
    const low = world.heightAt(x + far * Math.sin(rot), z + far * Math.cos(rot)) - ground;
    const top = y0 + .36, count = Math.max(1, Math.ceil(Math.abs(top - low) / .18));
    const stone = new THREE.BoxGeometry(1, 1, 1);
    for (let s = 0; s < count; s++) {
      const stepTop = low + (top - low) * (s + 1) / count;
      const bottom = Math.min(low - .2, stepTop - .12);
      const st = stone.clone();
      st.scale(2.5, stepTop - bottom, 1.8 / count);
      st.translate(0, (stepTop + bottom) / 2, far - (s + .5) * 1.8 / count);
      parts.push(paint(st, 0x7a756a));
    }
    stone.dispose();
  } else for (let s = 0; s < 3; s++) { const st = new THREE.BoxGeometry(2.4, 0.2, 0.5); st.translate(0, 0.1 + s * 0.2, d / 2 + 1.5 + (2 - s) * 0.45); parts.push(paint(st, 0x7a756a)); }
  // 身舎：板壁の下半分と、白い上半分。正面は格子戸の暗がり
  if (o.interior) {
    // 入れる小堂は中身を箱で埋めず、正面の戸口を抜いた四面の板壁にする。
    for (const face of ['x', 'z']) for (const sd of [-1, 1]) {
      const len = face === 'z' ? w : d, off = (face === 'z' ? d : w) / 2;
      const holes = face === 'z' && sd === 1 ? [{ t0: -1.1, t1: 1.1, y0: 0, y1: 2.1 }] : [];
      for (const v of hallWindows) if (v.face === face && v.s === sd)
        holes.push({ t0: v.t - v.w / 2, t1: v.t + v.w / 2, y0: v.y0 + .06, y1: v.y1 + .06 });
      for (const [a, b, low, high] of facePanels(len, H, holes)) {
        // 姉川の小堂は、室内の板壁上端（二・〇四メートル）と同じ高さで
        // 外壁も板と白い小壁に分ける。窓や戸口ごとの面の切れ目では色を決めない。
        // 外壁の原点は床より六センチ低いため、ここでは二・一メートルで切る。
        const panels = o.interior.profile === 'anegawa'
          ? [[low, Math.min(high, 2.1), o.wall || 0x5a3e2a],
            [Math.max(low, 2.1), high, 0xcdc4b0]]
          : [[low, high, low >= 2.1 ? 0xcdc4b0 : o.wall || 0x5a3e2a]];
        for (const [bottom, top, color] of panels) {
          if (top <= bottom) continue;
          const g = new THREE.BoxGeometry(b - a, top - bottom, .12);
          if (face === 'x') g.rotateY(Math.PI / 2);
          g.translate(face === 'z' ? (a + b) / 2 : sd * off,
            y0 + .3 + (bottom + top) / 2, face === 'z' ? sd * off : (a + b) / 2);
          parts.push(paint(g, color));
        }
      }
    }
    // 窓枠と連子は一本の形を使い回して外装へ結合する。小堂の内外は一組の木組みにする。
    const timber = hallWindows.length ? new THREE.BoxGeometry(1, 1, 1) : null;
    for (const v of hallWindows) {
      const frame = (px, py, pz, bw, bh, bd, grain = false) => {
        const g = timber.clone(); g.scale(bw, bh, bd);
        if (grain) {
          // 連子の縦木と横貫の長手へ共有の木目を通す。内側からも木肌を残す。
          const pos = g.attributes.position, normal = g.attributes.normal, uv = g.attributes.uv;
          for (let j = 0; j < pos.count; j++) {
            const across = Math.abs(normal.getX(j)) > .5 ? pos.getZ(j) : pos.getX(j);
            uv.setXY(j, bh > bd ? across : pos.getY(j), bh > bd ? pos.getY(j) : pos.getZ(j));
          }
        }
        g.translate(px, py, pz);
        (grain ? latticeParts : parts).push(paint(g, 0x4a3422));
      };
      const px = v.s * w / 2, bottom = y0 + .36 + v.y0, top = y0 + .36 + v.y1;
      for (const py of [bottom - .04, top + .04]) frame(px, py, v.t, .22, .08, v.w + .16);
      for (const side of [-1, 1]) frame(px, (bottom + top) / 2,
        v.t + side * (v.w / 2 + .04), .22, top - bottom, .08);
      if (o.interior.profile === 'anegawa' && SETTINGS.quality === 'high') {
        // 框へ縦連子を差し、横貫で受ける推定復元。壁厚を通して組み、
        // 内側へ別の格子を重ねない。共通の寸法を当たりにも渡す。
        for (const [t, yy, ww, hh, depth] of windowLatticeMembers(v.w, top - bottom))
          frame(px - v.s * .08, bottom + yy, v.t + t, depth + .22, hh, ww, true);
      } else for (let q = -1; q <= 1; q++) frame(px - v.s * .08, (bottom + top) / 2,
        v.t + q * v.w * .3, .26, top - bottom, .05);
    }
    if (timber) timber.dispose();
  } else {
  const wall = buildingWall(w, H, d, o.wall || 0x786048); wall.translate(0, y0 + 0.3 + H / 2, 0); parts.push(wall);
  const up = buildingWall(w + 0.04, H * 0.3, d + 0.04, 0xd9d0bb); up.translate(0, y0 + 0.3 + H * 0.85, 0); parts.push(up);
  // 身舎の柱と貫を見せ、縁の丸柱だけで大きな箱を囲って見えるのを防ぐ。
  parts.push(buildingFrame(w, d, H).translate(0, y0 + .3, 0));
  const door = new THREE.BoxGeometry(w * 0.5, H * 0.62, 0.06); door.translate(0, y0 + 0.3 + H * 0.31, d / 2 + 0.03); parts.push(paint(door, 0x1c1610));
  for (let i = 0; i <= 6; i++) { const b = new THREE.BoxGeometry(0.05, H * 0.62, 0.08); b.translate(-w * 0.25 + i * w * 0.5 / 6, y0 + 0.3 + H * 0.31, d / 2 + 0.07); parts.push(paint(b, 0x4a3422)); }
  }
  // 縁の柱
  // 小堂の柱は縁板の途中で止めず、基壇上の礎石で受ける推定復元。
  // 柱頭の高さは保ち、床下へ柱脚を延ばす。形は全柱で共有して外装へ結合する。
  const stoneFeet = o.interior?.profile === 'anegawa' && SETTINGS.quality === 'high';
  const pillarBottom = y0 + (stoneFeet ? .12 : .3), pillarTop = y0 + .3 + H + .4;
  // 小堂の縁柱も内陣と同じ丸み・実寸の縦木目にする。
  // 礎石と頭貫に隠れる端面を省き、十六分割でも元の八角柱と三角形数をそろえる。
  const pillarHeight = pillarTop - pillarBottom;
  const pillarShape = new THREE.CylinderGeometry(.17, .19, pillarHeight, stoneFeet ? 16 : 8, 1, stoneFeet);
  if (stoneFeet) {
    const pos = pillarShape.attributes.position, uv = pillarShape.attributes.uv;
    for (let j = 0; j < pos.count; j++)
      uv.setXY(j, uv.getX(j) * Math.PI * .36 * 2, (pos.getY(j) + pillarHeight / 2) * .65);
  }
  const footShape = stoneFeet ? new THREE.CylinderGeometry(.28, .31, .12, 8) : null;
  const porchPillar = (px, pz, seed) => {
    const pillar = pillarShape.clone();
    if (stoneFeet) {
      const uv = pillar.attributes.uv, offset = (px + pz) * .17;
      for (let j = 0; j < uv.count; j++)
        uv.setXY(j, uv.getX(j) + offset, uv.getY(j) + offset * .37);
    }
    pillar.translate(px, (pillarTop + pillarBottom) / 2, pz);
    (stoneFeet ? latticeParts : parts).push(paint(pillar, vary(0x5e4230, seed)));
    if (footShape) parts.push(paint(footShape.clone().translate(px, y0 + .06, pz), vary(0x8a857a, seed)));
  };
  for (let i = 0; i <= nx; i++) for (const sz of [-1, 1])
    porchPillar(-w / 2 - .5 + i * (w + 1) / nx, sz * (d / 2 + .5), i);
  for (let i = 1; i < nz; i++) for (const sx of [-1, 1])
    porchPillar(sx * (w / 2 + .5), -d / 2 - .5 + i * (d + 1) / nz, i + 5);
  pillarShape.dispose(); footShape?.dispose();
  if (o.interior?.profile === 'anegawa') {
    // 小堂の縁柱を長押と頭貫でつなぐ推定復元。戸口より上へ納め、正面の出入りを空ける。
    // 一本の箱を使い回して既存の外装へまとめ、描く束や毎コマの処理を増やさない。
    const timber = new THREE.BoxGeometry(1, 1, 1);
    const beam = (px, py, pz, bw, bh, bd) => {
      const g = timber.clone(); g.scale(bw, bh, bd);
      const grain = SETTINGS.quality === 'high';
      if (grain) woodGrain(g, bw, bh, bd);
      g.translate(px, py, pz);
      (grain ? latticeParts : parts).push(paint(g, 0x4a3422));
    };
    for (const py of [y0 + .3 + 2.24, y0 + .3 + H + .25]) {
      for (const sz of [-1, 1]) beam(0, py, sz * (d / 2 + .5), w + 1.4, .16, .22);
      // 前後の横木を通し、脇の木口をその内面へ突き付ける推定の納まり。
      // 同じ高さの材を四隅で交差させず、柱頭の支えと入口の高さを保つ。
      const sideLength = SETTINGS.quality === 'high' ? d + 1 - .22 : d + 1.4;
      for (const sx of [-1, 1]) beam(sx * (w / 2 + .5), py, 0, .22, .16, sideLength);
    }
    if (SETTINGS.quality === 'high') {
      // 小堂の縁先は縁框で板の木口を受ける推定復元。
      // 上端は縁板・石段とそろえ、四隅は前後の框へ脇の框を突き付ける。
      // 既存の縁側の外寸へ納め、戸口・丸柱の通り道は保つ。
      for (const sz of [-1, 1])
        beam(0, y0 + .27, sz * (d / 2 + 1.14), w + 2.4, .18, .12);
      for (const sx of [-1, 1])
        beam(sx * (w / 2 + 1.14), y0 + .27, 0, .12, .18, d + 2.16);
      // 縁側の床下は基壇から浮かせず、縁桁と根太で板の下面を受ける推定復元。
      // 板の下面は y0 + .24。桁の下端を基壇の上面へ置く。
      for (const sz of [-1, 1]) beam(0, y0 + .12, sz * (d / 2 + .5), w + 2.4, .24, .18);
      // 脇の桁も前後の桁の内面まで伸ばす。身舎の奥行きで止めると、
      // 両端が四十一センチ離れ、縁柱の足元まで支えが届かない。
      for (const sx of [-1, 1]) beam(sx * (w / 2 + .5), y0 + .12, 0, .18, .24, d + 1 - .18);
      for (let i = 0; i <= nx; i++) for (const sz of [-1, 1]) {
        const px = -w / 2 - .5 + i * (w + 1) / nx;
        beam(px, y0 + .19, sz * (d / 2 + .6), .1, .1, 1.2);
      }
      for (let i = 1; i < nz; i++) for (const sx of [-1, 1]) {
        const pz = -d / 2 - .5 + i * (d + 1) / nz;
        beam(sx * (w / 2 + .6), y0 + .19, pz, 1.2, .1, .1);
      }
      // 身舎の天井だけで終わらせず、縁側にも板張りの軒天と繋ぎ梁を納める。
      // 内陣の格天井や外戸の二筋の溝には重ねず、縁柱の頭で受ける。
      const ceilingY = y0 + H + .72;
      // 軒天を大きな一枚板と目地の線で済ませず、梁の上で木口を継ぐ推定復元。
      // 前後の板を通し、脇の板はその内面で止める。木目は各板の長手へ通す。
      // 薄い下地を残して隙間から屋根を透かさず、既存の木材の一束へ結合する。
      const frontJoints = [-w / 2 - 1.2];
      for (let i = 0; i <= nx; i++) frontJoints.push(-w / 2 - .5 + i * (w + 1) / nx);
      frontJoints.push(w / 2 + 1.2);
      const sideJoints = [-d / 2];
      for (let i = 1; i < nz; i++) sideJoints.push(-d / 2 - .5 + i * (d + 1) / nz);
      sideJoints.push(d / 2);
      for (const sz of [-1, 1]) {
        beam(0, ceilingY + .006, sz * (d / 2 + .6), w + 2.4, .028, 1.2);
        for (let q = 0; q < 4; q++) for (let i = 1; i < frontJoints.length; i++) {
          const a = frontJoints[i - 1], b = frontJoints[i];
          beam((a + b) / 2, ceilingY - .014, sz * (d / 2 + (q + .5) * .3),
            b - a - .002, .012, .298);
        }
        for (let i = 0; i <= nx; i++)
          beam(-w / 2 - .5 + i * (w + 1) / nx, ceilingY - .09,
            sz * (d / 2 + .6), .14, .14, 1.2);
      }
      for (const sx of [-1, 1]) {
        beam(sx * (w / 2 + .6), ceilingY + .006, 0, 1.2, .028, d);
        for (let q = 0; q < 4; q++) for (let i = 1; i < sideJoints.length; i++) {
          const a = sideJoints[i - 1], b = sideJoints[i];
          beam(sx * (w / 2 + (q + .5) * .3), ceilingY - .014, (a + b) / 2,
            .298, .012, b - a - .002);
        }
        for (let i = 1; i < nz; i++)
          beam(sx * (w / 2 + .6), ceilingY - .09,
            -d / 2 - .5 + i * (d + 1) / nz, 1.2, .14, .14);
      }
    }
    timber.dispose();
    // 縁側を歩く時も丸柱をすり抜けない。見た目と同じ柱位置・太さ・高さだけを塞ぐ。
    const c = Math.cos(rot), s = Math.sin(rot);
    const pillar = (px, pz) => {
      const hit = solidCircle(x + px * c + pz * s, z - px * s + pz * c, .19);
      hit.yBot = ground + pillarBottom; hit.yTop = ground + pillarTop;
    };
    for (let i = 0; i <= nx; i++) for (const sz of [-1, 1])
      pillar(-w / 2 - .5 + i * (w + 1) / nx, sz * (d / 2 + .5));
    for (let i = 1; i < nz; i++) for (const sx of [-1, 1])
      pillar(sx * (w / 2 + .5), -d / 2 - .5 + i * (d + 1) / nz);
  }
  // 大屋根：軒は深く、屋根は高く
  const ey = y0 + H + 0.8;
  tiles.push(hipGeo(w / 2 + 2.4, d / 2 + 2.4, (d / 2 + 2.4) * 0.8, ey, w / 2 * 0.55));
  parts.push(hipEaveGeo(w / 2 + 2.4, d / 2 + 2.4, (d / 2 + 2.4) * 0.8, ey, w / 2 * 0.55));
  const mune = new THREE.BoxGeometry(w * 0.55 + 0.6, 0.4, 0.5); mune.translate(0, ey + (d / 2 + 2.4) * 0.8 + 0.1, 0);
  const grp = new THREE.Group();
  if (latticeParts.length) {
    // 窓・縁板・軒の木組みを一束へ結合し、板壁と同じ共有木材を使う。
    const lattice = new THREE.Mesh(mergeGeometries(latticeParts), ITA_V());
    lattice.castShadow = lattice.receiveShadow = true; lattice.userData.camBlock = true;
    grp.add(lattice); latticeParts.forEach(g => g.dispose());
  }
  const body = merged(parts), coarse = kitCoarse(body.geometry);
  if (coarse) {
    const far = new THREE.Mesh(coarse, body.material); far.castShadow = far.receiveShadow = true; far.userData.camBlock = true;
    const lod = new THREE.LOD(); lod.addLevel(body, 0); lod.addLevel(far, 55); grp.add(lod);
  } else grp.add(body);
  const muneM = merged([paint(mune, 0x222120)]); grp.add(muneM);   // 棟の押さえは別の Mesh（素材の屋根に替える時は隠す）
  const tm = new THREE.Mesh(mergeGeometries(tiles), TILE()); tm.castShadow = true; tm.receiveShadow = true; tm.userData.camBlock = true;
  grp.add(tm);
  grp.position.set(x, ground, z);
  grp.rotation.y = rot;
  grp.userData.roofY = ey;
  if (o.interior) {
    const I = addInterior(world, { ...o.interior, x, z, rot, hasExterior: true,
      levels: [{ y: grp.position.y + y0 + .36, w: w - .18, d: d - .18, h: H - .06 }],
      door: { w: 2.2, h: 2.04 }, approach: { pad: 1.3, len: 1.8 }, wins: () => hallWindows });
    grp.userData.naka = I;
    if (o.interior.profile === 'anegawa') {
      // 縁板の上面と足場を一致させる。堂の周囲を歩いても板をすり抜けない。
      // 身舎の中は既存の床に任せ、四辺の縁側だけを登録する。
      const hw = w / 2, hd = d / 2, c = Math.cos(rot), s = Math.sin(rot);
      for (const [x0, x1, z0, z1] of [
        [-hw - 1.2, hw + 1.2, -hd - 1.2, -hd], [-hw - 1.2, hw + 1.2, hd, hd + 1.2],
        [-hw - 1.2, -hw, -hd, hd], [hw, hw + 1.2, -hd, hd],
      ]) {
        const lx = (x0 + x1) / 2, lz = (z0 + z1) / 2;
        addDeck({ cx: x + lx * c + lz * s, cz: z - lx * s + lz * c, rot,
          x0: -(x1 - x0) / 2, x1: (x1 - x0) / 2, z0: -(z1 - z0) / 2, z1: (z1 - z0) / 2,
          y: I.levels[0].y, pad: 0, name: '小堂の縁側' });
      }
    }
  }
  if (w >= 7) extTempleRoof(grp, [tm, muneM], w, d, ey);   // 素材の瓦の大屋根に替える（props_ext.js。小さな堂・画質「低」は手作りのまま）
  return grp;
}

// 梯子：竹の二本の親柱に横木。foot と top は世界の座標 { x, y, z }
export function hashigo(foot, top) {
  const parts = [];
  const dx = top.x - foot.x, dy = top.y - foot.y, dz = top.z - foot.z;
  const len = Math.hypot(dx, dy, dz), hl = Math.hypot(dx, dz) || 1;
  const sx = -dz / hl * 0.28, sz = dx / hl * 0.28;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
  for (const s of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.045, 0.055, len + 0.5, 5);
    g.applyQuaternion(q); g.translate(foot.x + dx / 2 + sx * s, foot.y + dy / 2 + 0.25, foot.z + dz / 2 + sz * s);
    parts.push(paint(g, 0x8a7a50));
  }
  const n = Math.round(len / 0.36);
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const g = new THREE.CylinderGeometry(0.028, 0.028, 0.6, 4); g.rotateZ(Math.PI / 2); g.rotateY(Math.atan2(sz, -sx) + Math.PI / 2);
    g.translate(foot.x + dx * t, foot.y + dy * t, foot.z + dz * t);
    parts.push(paint(g, 0x6b5a3c));
  }
  return merged(parts);
}

// 川の小早に寄せた小舟。船首尾を絞り、舷側の板は外へ開く。寸法ごとに形を共用する。
const KOBUNE_GEO = new Map();
export function kobune(x, y, z, rot = 0, len = 7) {
  let geo = KOBUNE_GEO.get(len);
  if (!geo) {
    const parts = [];
    const hw = 0.8, n = 8;
    const width = (t) => hw * (1 - Math.pow(Math.abs(t) * 2, 2.4) * 0.85);
    const lift = (t) => Math.pow(Math.abs(t) * 2, 3) * (t > 0 ? 0.42 : 0.24);
    const panel = (a, b, c, d, col) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([a[2] / 2, a[1] + a[0], b[2] / 2, b[1] + b[0], c[2] / 2, c[1] + c[0], d[2] / 2, d[1] + d[0]], 2));
      g.setIndex([0, 1, 2, 2, 1, 3]); g.computeVertexNormals(); parts.push(paint(g, col));
    };
    for (let i = 0; i < n; i++) {
      const t0 = i / n - 0.5, t1 = (i + 1) / n - 0.5;
      const w0 = width(t0), w1 = width(t1), z0 = t0 * len, z1 = t1 * len, y0 = lift(t0), y1 = lift(t1);
      // 底板の表と裏。端まで幅と高さを連続させ、箱の継ぎ目をなくす。
      panel([-w0, y0, z0], [-w1, y1, z1], [w0, y0, z0], [w1, y1, z1], 0x6a5740);
      panel([-w0, y0 - 0.07, z0], [w0, y0 - 0.07, z0], [-w1, y1 - 0.07, z1], [w1, y1 - 0.07, z1], 0x3a3024);
      for (const s of [-1, 1]) {
        for (let row = 0; row < 3; row++) {
          const h0 = row * 0.17, h1 = (row + 1) * 0.17;
          const a = [s * (w0 + h0 * 0.28), y0 + h0, z0], b = [s * (w0 + h1 * 0.28), y0 + h1, z0];
          const c = [s * (w1 + h0 * 0.28), y1 + h0, z1], d = [s * (w1 + h1 * 0.28), y1 + h1, z1];
          const ai = [a[0] - s * 0.055, a[1], z0], bi = [b[0] - s * 0.055, b[1], z0];
          const ci = [c[0] - s * 0.055, c[1], z1], di = [d[0] - s * 0.055, d[1], z1];
          const col = vary(0x756049, i + row * 13);
          if (s > 0) { panel(a, b, c, d, col); panel(ai, ci, bi, di, col); }
          else { panel(a, c, b, d, col); panel(ai, bi, ci, di, col); }
          if (s > 0) panel(b, bi, d, di, 0x9a8768);
          else panel(b, d, bi, di, 0x9a8768);
        }
      }
    }
    // 船首尾の板と、舟べりを結ぶ座板。すべて船体と一つにまとめる。
    for (const t of [-0.5, 0.5]) {
      const w = width(t), h = lift(t), zz = t * len;
      const end = new THREE.BoxGeometry(w * 2 + 0.15, 0.5, 0.075); end.translate(0, h + 0.25, zz); parts.push(paint(end, 0x66523c));
    }
    for (const t of [-0.22, 0.14]) {
      const seat = new THREE.BoxGeometry(width(t) * 2 + 0.16, 0.08, 0.26); seat.translate(0, lift(t) + 0.4, t * len); parts.push(paint(seat, 0x8a775a));
    }
    // 棹
    const sao = new THREE.CylinderGeometry(0.03, 0.03, 4.5, 4); sao.rotateX(0.5); sao.translate(0.4, 1.6, -len * 0.3); parts.push(paint(sao, 0x8a7a50));
    geo = mergeGeometries(parts); KOBUNE_GEO.set(len, geo);
    for (const g of parts) g.dispose();
  }
  const m = new THREE.Mesh(geo, MAT());
  m.castShadow = true; m.receiveShadow = true;
  m.userData.camBlock = false;
  m.position.set(x, y, z);
  m.rotation.y = rot;
  return m;
}

// 稲架（はさ）：刈った稲を掛けて干す木組み。刈田の畦に立てる。前は +z
export function hasa(world, x, z, rot = 0, len = 8) {
  const parts = [];
  solidRect(x, z, len + 0.4, 0.6, rot).civilianSightTop = world.heightAt(x, z) + 2.1;
  const n = Math.max(2, Math.round(len / 2.2));
  for (let i = 0; i <= n; i++) {
    const lx = (i / n - 0.5) * len;
    for (const s of [-1, 1]) { const p = new THREE.CylinderGeometry(0.04, 0.05, 2.1, 4); p.rotateX(s * 0.18); p.translate(lx, 1.0, s * 0.18); parts.push(paint(p, 0x5a4a34)); }
  }
  for (const y of [1.0, 1.5]) {
    const bar = new THREE.CylinderGeometry(0.03, 0.03, len + 0.4, 4); bar.rotateZ(Math.PI / 2); bar.translate(0, y, 0); parts.push(paint(bar, 0x6a5a40));
    // 掛けた稲束（黄金の藁の房が並ぶ）
    for (let k = 0; k < Math.round(len / 0.35); k++) {
      const lx = -len / 2 + 0.2 + k * 0.35;
      const b = new THREE.ConeGeometry(0.17, 0.75, 4); b.rotateX(Math.PI); b.translate(lx, y - 0.32, 0);
      parts.push(paint(b, vary(0xb89a50, k)));
    }
  }
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  m.rotation.y = rot;
  return m;
}

// 塗輿（ぬりごし）：黒漆に金の金具の輿。二本の長柄で担ぐ。前は +z
export function koshi(world, x, z, rot = 0, o = {}) {
  const parts = [];
  const tilt = o.dropped ? 0.12 : 0;
  const body = new THREE.BoxGeometry(1.0, 1.05, 1.3); body.translate(0, 0.95, 0); parts.push(paint(body, 0x141210));
  const roof = new THREE.BoxGeometry(1.25, 0.14, 1.55); roof.translate(0, 1.55, 0); parts.push(paint(roof, 0x1a1816));
  const roof2 = new THREE.BoxGeometry(0.9, 0.12, 1.25); roof2.translate(0, 1.68, 0); parts.push(paint(roof2, 0x141210));
  // 金の縁と金具、簾の窓
  for (const y of [0.45, 1.46]) { const b = new THREE.BoxGeometry(1.04, 0.05, 1.34); b.translate(0, y, 0); parts.push(paint(b, 0xb08a38)); }
  const win = new THREE.BoxGeometry(0.02, 0.45, 0.8); win.translate(0.51, 1.0, 0); parts.push(paint(win, 0x6a5a38));
  const win2 = win.clone(); win2.translate(-1.02, 0, 0); parts.push(paint(win2, 0x6a5a38));
  // 長柄（担ぎ棒）
  for (const sx of [-0.62, 0.62]) { const p = new THREE.CylinderGeometry(0.05, 0.05, 4.2, 6); p.rotateX(Math.PI / 2); p.translate(sx, 0.95, 0); parts.push(paint(p, 0x2a1c12)); }
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z) + (o.dropped ? -0.45 : 0), z);
  m.rotation.set(tilt, rot, o.dropped ? 0.08 : 0);
  return m;
}

// 陣太鼓：胴の太い太鼓を木の台に斜めに据える（号令の太鼓）
export function jindaiko(world, x, z, rot = 0) {
  const parts = [];
  const body = new THREE.CylinderGeometry(0.42, 0.42, 0.5, 14, 1, true); body.rotateZ(Math.PI / 2); body.scale(1, 1.08, 1.08); body.translate(0, 1.05, 0); parts.push(paint(body, 0x5a2a1a));
  for (const sx of [-0.26, 0.26]) { const hd = new THREE.CircleGeometry(0.45, 14); hd.rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2); hd.translate(sx, 1.05, 0); parts.push(paint(hd, 0xc8b690)); }
  for (const sx of [-0.25, 0.25]) for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const nb = new THREE.SphereGeometry(0.025, 4, 3); nb.translate(sx, 1.05 + Math.sin(a) * 0.44, Math.cos(a) * 0.44); parts.push(paint(nb, 0x1a1816)); }
  // 台
  for (const sz of [-0.35, 0.35]) { const l = new THREE.BoxGeometry(0.08, 0.9, 0.08); l.rotateX(sz > 0 ? -0.25 : 0.25); l.translate(0, 0.45, sz); parts.push(paint(l, 0x3a2c1e)); }
  const bar = new THREE.BoxGeometry(0.1, 0.08, 0.9); bar.translate(0, 0.62, 0); parts.push(paint(bar, 0x3a2c1e));
  // 撥
  for (const sz of [-0.1, 0.1]) { const b = new THREE.CylinderGeometry(0.02, 0.025, 0.45, 5); b.rotateZ(1.2); b.translate(0.45, 0.66, sz); parts.push(paint(b, 0x6a5a40)); }
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  m.rotation.y = rot;
  return m;
}
// 法螺貝：床几の脇の小さな台に置く
export function horagai(world, x, z) {
  const parts = [];
  const shell = new THREE.ConeGeometry(0.12, 0.42, 9); shell.rotateZ(Math.PI / 2); shell.translate(0, 0.52, 0); parts.push(paint(shell, 0xd8c8a4));
  const mouth = new THREE.TorusGeometry(0.1, 0.03, 5, 10); mouth.rotateY(Math.PI / 2); mouth.translate(-0.21, 0.52, 0); parts.push(paint(mouth, 0xb88a6a));
  const tbl = new THREE.BoxGeometry(0.4, 0.4, 0.3); tbl.translate(0, 0.2, 0); parts.push(paint(tbl, 0x2a1e14));
  const m = merged(parts);
  m.position.set(x, world.heightAt(x, z), z);
  return m;
}

// 手に持つ松明：units の者の手もとに小さな火を付け、update() で一緒に動かす（倒れたら消す）
// 夜の戦で、兵の一部にだけ持たせる（足もとが明るく、光の数は絞る）
export function carryTorches(world, units, o = {}) {
  const list = units.filter((u) => u && u.alive).map((u) => {
    const f = world.addFire(u.pos.x, u.pos.z, { torch: true, h: 2.1, size: o.size, smoke: o.smoke === true, blackSmoke: true });
    return { u, f };
  });
  return {
    update() {
      for (const c of list) {
        const u = c.u, f = c.f;
        if (!f) continue;
        if (!u.alive) { world.removeFire(f); c.f = null; continue; }
        const h = u.heading || 0, x = u.pos.x + Math.cos(h) * 0.35, z = u.pos.z - Math.sin(h) * 0.35, y = world.heightAt(x, z) + 2.1;
        f.x = x; f.z = z; f.base = y + f.size * 0.3;
        f.flame.position.set(x, f.base, z); f.inner.position.set(x + f.size * .12, f.base - f.size * 0.08, z - f.size * .1);
        if (f.smoke != null && (f.smokeAt == null || world.time >= f.smokeAt)) {
          world.moveSmokeColumn(f.smoke, x, f.base + f.size * .55, z); f.smokeAt = world.time + .12;
        }
        if (f.glow) f.glow.position.set(x, world.heightAt(x, z) + 0.06, z);
        if (f.light) f.light.position.set(x, y + 0.8, z);
      }
    },
  };
}

// 平盾（置盾）：縦の板二枚を裏の桟二本で留めた一枚（約 163×54cm）。表に黒い横線二本と家紋（丸）、
// 鉄砲の後の形は狭間（小窓）。裏の琵琶枝（折りたたみの支え棒）で少し後ろへ倒して立てる。
// 原点の足もと、表 = +z。kind: 'mon'（家紋）・'plain'（無紋）・'field'（陣の木地）・'sama'（狭間）・'tower'（井楼用の無帯板）。形は使い回す
const HIRATATE = {};
export function hiraTateGeo(kind = 'mon', detailed = false, mounted = false) {
  const key = kind + (detailed ? ':board' : '') + (mounted ? ':tower' : '');
  if (HIRATATE[key]) return HIRATATE[key];
  const P = [], H = 1.63, W = 0.27, T = 0.045, lean = 0.12;
  const box = (w, h, d, x, y, z, hex) => {
    const fieldBoard = kind === 'field' && h === H && d === T;
    let g = new THREE.BoxGeometry(w, h, d, 1, fieldBoard ? 2 : 1, 1);
    if (fieldBoard) {
      // 地面に触れる裾だけを泥色にするため、分割を下から十六センチへ寄せる。
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i)) < .001) p.setY(i, -H / 2 + .16);
    }
    g.translate(x, y, z);
    const source = g;
    g = paint(g, fieldBoard ? (x < 0 ? 0xc8b57b : 0xb6a16d) : hex);
    if (g !== source) source.dispose();
    if (fieldBoard) {
      const p = g.attributes.position, colors = g.attributes.color, col = new THREE.Color(), mud = new THREE.Color(0x625b40);
      for (let i = 0; i < p.count; i++) {
        col.fromBufferAttribute(colors, i);
        col.lerp(mud, p.getY(i) < .01 ? .65 : p.getY(i) < .17 ? .2 : 0);
        colors.setXYZ(i, col.r, col.g, col.b);
      }
      g.computeVertexNormals();
    }
    P.push(g);
  };
  // 板二枚（矧ぎ目を少し空け、色を違える）
  if (kind === 'sama' || kind === 'tower') {
    // 小窓は黒い四角を貼らず、板を分けて穴を開ける。
    box(W - 0.006, .945, T, -W / 2, .4725, 0, 0xa69072);
    box(W - 0.006, H - 1.055, T, -W / 2, (H + 1.055) / 2, 0, 0xa69072);
    for (const sx of [-1, 1]) box(.077, .11, T, -W / 2 + sx * .0935, 1, 0, 0xa69072);
  } else box(W - 0.006, H, T, -W / 2, H / 2, 0, 0xa69072);
  box(W - 0.006, H, T, W / 2, H / 2, 0, 0x9a8466);
  // 表の黒い横線二本
  if (kind !== 'tower') for (const yy of [1.2, 1.36]) box(W * 2 + 0.004, 0.075, 0.006, 0, yy, T / 2 + 0.002, 0x15120f);
  if (kind === 'mon') {
    // 家紋の丸（黒い輪）：板ごとに一つ
    for (const sx of [-1, 1]) {
      const o = new THREE.CircleGeometry(0.085, 10); o.translate(sx * W / 2, 0.92, T / 2 + 0.004); P.push(paint(o, 0x15120f));
      const i = new THREE.CircleGeometry(0.045, 8); i.translate(sx * W / 2, 0.92, T / 2 + 0.006); P.push(paint(i, sx > 0 ? 0x9a8466 : 0xa69072));
    }
  } else if (kind === 'sama' || kind === 'tower') {
    // 狭間：鉄砲を出す小窓の木口
    box(0.15, 0.025, 0.012, -W / 2, 1.07, T / 2 + 0.004, 0x5e4c38);
  }
  // 裏の桟二本
  for (const yy of [0.32, 1.28]) box(W * 2 - 0.04, 0.075, 0.045, 0, yy, -T / 2 - 0.022, 0x5a4834);
  if (detailed) {
    // 小雑賀川の板盾だけに、木口の縁と裏の持ち手を足す。形は種類ごとに使い回す。
    for (const sx of [-1, 1]) box(0.028, H, 0.075, sx * (W - 0.014), H / 2, 0, 0x73583c);
    for (const yy of [0.02, H - 0.02]) box(W * 2, 0.04, 0.075, 0, yy, 0, 0xb19a76);
    for (const sx of [-0.07, 0.07]) box(0.025, 0.04, 0.09, sx, 0.8, -0.07, 0x65482e);
    box(0.165, 0.035, 0.03, 0, 0.8, -0.12, 0x856044);
    // 傷は表裏に細く刻み、暗い裏側でも板の面を読めるようにする。
    for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) {
      const scratch = new THREE.BoxGeometry(0.012, 0.15 + (i % 3) * 0.05, 0.004);
      scratch.rotateZ(0.24 + (i % 2) * 0.3);
      scratch.translate(-0.19 + i * 0.09, 0.24 + (i * 0.23) % 1.16, sd * (T / 2 + 0.003));
      P.push(paint(scratch, i % 2 ? 0x65503b : 0xc1a584));
    }
  }
  const geo = mergeGeometries(P);
  if (kind !== 'tower') geo.rotateX(-lean);   // 井楼に結ぶ板は垂直、置楯は少し傾ける
  if (mounted) { HIRATATE[key] = geo; return geo; }
  // 琵琶枝：裏の上の桟から後ろの地面へ（倒した後の位置で）
  const top = new THREE.Vector3(0, 1.28, -T / 2 - 0.05).applyAxisAngle(new THREE.Vector3(1, 0, 0), -lean);
  const foot = new THREE.Vector3(0, -0.02, top.z - 0.72), dv = new THREE.Vector3().subVectors(top, foot), L = dv.length();
  const st = new THREE.CylinderGeometry(0.018, 0.022, L, 5); st.translate(0, L / 2, 0);
  st.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv.normalize())); st.translate(foot.x, foot.y, foot.z);
  HIRATATE[key] = mergeGeometries([geo, paint(st, 0x4a3a28)]);
  return HIRATATE[key];
}
// 平盾の並び（めどり羽）：一枚ずつ少しずらして重ね、継ぎ目を後ろの楯の板でふさぐ（当たり付き）。a→b の線の左手が表
export function tateNarabi(world, ax, az, bx, bz, o = {}) {
  const parts = [];
  const len = Math.hypot(bx - ax, bz - az), pairs = Math.max(1, Math.floor(len / 1.45));
  const tx = (bx - ax) / Math.max(len, .001), tz = (bz - az) / Math.max(len, .001);
  const n = o.fieldPairs ? pairs * 2 : Math.max(1, Math.round(len / (o.spacing || 0.47))), ang = Math.atan2(bx - ax, bz - az);
  const fx = Math.cos(ang), fz = -Math.sin(ang);   // 表の向き
  for (let i = 0; i < n; i++) {
    // 姉川の置楯は二枚ずつ、間を空けて据える。写真の無紋・窓なしの板を使う。
    const t = o.fieldPairs ? (Math.floor(i / 2) + .5) / pairs + (i % 2 ? .265 : -.265) / Math.max(len, 1.08) : (i + .5) / n;
    const sg = i % 2 ? -1 : 1, x = ax + (bx - ax) * t + fx * sg * 0.035, z = az + (bz - az) * t + fz * sg * 0.035;
    // 指定した陣だけ無紋の板楯を使う。既存の混成の楯列は変えない。
    const fieldTimber = true && o.fieldPairs && o.fieldTimber === true;
    const g = hiraTateGeo(o.fieldPairs ? (fieldTimber ? 'field' : 'plain') : (o.kind || (o.sama || i % 3 === 1 ? 'sama' : 'mon')), world.def.detailedBoardShields).clone();
    g.rotateY(Math.atan2(fx, fz) + (h01(ax + i, 3) - 0.5) * 0.08); g.translate(x, world.heightAt(x, z), z);
    parts.push(g);
    if (o.fieldPairs) Object.assign(solidSeg(x - tx * .27, z - tz * .27,
      x + tx * .27, z + tz * .27, .25), { missileH: 1.6, missileType: 'wood' });
  }
  if (!o.fieldPairs) Object.assign(solidSeg(ax, az, bx, bz, 0.25), { missileH: 1.6, missileType: 'wood' });
  return merged(parts);
}

// 武将について歩く馬印：馬印持ちが武将の 2m 後ろで竿を立てて付いて行く（update() を毎コマ呼ぶ）
export function umaFollow(world, scene, unit, kind = 'ogi') {
  const m = umajirushi(world, unit.pos.x, unit.pos.z, 0, kind);
  scene.add(m);
  return {
    mesh: m,
    update(dt) {
      if (!unit.alive) { m.rotation.z = Math.min(1.3, m.rotation.z + dt * 1.5); return; }
      const h = unit.heading || 0, x = unit.pos.x - Math.sin(h) * 2.2, z = unit.pos.z - Math.cos(h) * 2.2;
      m.position.x += (x - m.position.x) * Math.min(1, dt * 3); m.position.z += (z - m.position.z) * Math.min(1, dt * 3);
      m.position.y = world.heightAt(m.position.x, m.position.z);
      m.rotation.y = h;
    },
  };
}

// ======================================================================
// 城の部品（石垣・土塀・隅櫓・櫓門・天守・逆茂木・竹束・篝火）
// 稲葉山・小谷・有岡・墨俣など、戦の定義から置く。素材は一揃いを使い回し、一つの建物は素材ごとに一つの形にまとめる
// 当たり：土塀は wallLine の柵（army.addStruct）が受け持つ。櫓・天守は足もとの四角だけ SOLIDS に入れる。石垣は見た目だけ（斜面に置く）
// ======================================================================

// 石垣の面（城攻めの石垣の箱が使う大きな面。2.2m で一回り）：
// nozura（野面積み：丸みのある自然石を大小まぜて積み、隙間に間詰石。目地が深い）／uchikomi（打込接：角を叩いて面をそろえた石・目地は細い・鑿の跡）
// 石一つずつの膨らみ・目地の影・苔（目地と下の縁）・雨だれと白い流れの筋を、色と法線の二枚で
function stoneFace(kind) {
  const noz = kind === 'nozura', S = 512, R = rnd(noz ? 11 : 29);
  return pairTex(S, S, (g, hg) => {
    // 目地の奥：暗い裏込めと詰めた土
    g.fillStyle = noz ? '#1b1814' : '#27231e'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${60 + R() * 30},${52 + R() * 24},${40 + R() * 16},0.35)`; g.fillRect(R() * S, R() * S, 2 + R() * 5, 2 + R() * 4); }
    hg.fillStyle = gray(0); hg.fillRect(0, 0, S, S);
    const stone = (cx, cy, rx, ry, small) => {
      // 形：野面は歪んだ丸、打込接は角を少し落とした四角
      let pts;
      if (noz) { const n = 11, a0 = R() * 6.28; pts = []; for (let i = 0; i < n; i++) { const a = a0 + i / n * 6.283, r = 0.8 + R() * 0.22; pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]); } }
      else { const j = () => (R() - 0.5) * 4, c = 3 + R() * 3; pts = [[cx - rx + c, cy - ry + j()], [cx + rx - c + j(), cy - ry + j()], [cx + rx + j(), cy - ry + c], [cx + rx + j(), cy + ry - c], [cx + rx - c, cy + ry + j()], [cx - rx + c + j(), cy + ry + j()], [cx - rx + j(), cy + ry - c], [cx - rx + j(), cy - ry + c]]; }
      const v = (noz ? 118 : 132) + R() * 64, t = R() * 18 - 9, hue = R();
      const col = hue < 0.25 ? [v + 12 + t, v + t * 0.5, v - 20] : hue > 0.8 ? [v - 8, v - 2, v + 6] : [v + t, v + t * 0.6, v - 10];
      const seed = [R(), R(), R(), R(), R()];
      wrapDraw(S, cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2, (ox, oy) => {
        const x = cx + ox, y = cy + oy, Rs = rnd(1 + Math.floor(seed[0] * 1e6));
        // 色
        polyPath(g, pts, ox, oy); g.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; g.fill();
        g.save(); polyPath(g, pts, ox, oy); g.clip();
        // 膨らみ：上が明るく下が暗い（上からの光）
        const gr = g.createLinearGradient(0, y - ry, 0, y + ry); gr.addColorStop(0, 'rgba(255,248,230,0.2)'); gr.addColorStop(0.45, 'rgba(255,248,230,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.34)');
        g.fillStyle = gr; g.fillRect(x - rx, y - ry, rx * 2, ry * 2);
        // 肌理：斑と小さな窪み
        for (let i = 0; i < rx * ry * 0.06; i++) { const q = 90 + Rs() * 140; g.fillStyle = `rgba(${q},${q - 4},${q - 12},0.22)`; g.fillRect(x - rx + Rs() * rx * 2, y - ry + Rs() * ry * 2, 1 + Rs() * 2.5, 1 + Rs() * 2.5); }
        // 地衣（白っぽい斑）と黒い汚れ
        if (seed[1] < 0.35) { g.fillStyle = `rgba(196,196,170,${0.18 + seed[2] * 0.2})`; g.beginPath(); g.ellipse(x + (seed[3] - 0.5) * rx, y + (seed[4] - 0.5) * ry, rx * 0.3, ry * 0.22, seed[2] * 3, 0, 7); g.fill(); }
        else if (seed[1] > 0.8) { g.fillStyle = 'rgba(30,30,26,0.22)'; g.beginPath(); g.ellipse(x + (seed[3] - 0.5) * rx, y, rx * 0.5, ry * 0.35, 0, 0, 7); g.fill(); }
        // 苔：石の下の縁に
        if (seed[2] < 0.3) { g.fillStyle = `rgba(66,${88 + seed[3] * 30},44,0.4)`; g.beginPath(); g.ellipse(x + (seed[4] - 0.5) * rx, y + ry * 0.85, rx * (0.4 + seed[3] * 0.4), ry * 0.25, 0, 0, 7); g.fill(); }
        // 打込接：叩いた鑿の跡（斜めの短い筋）
        if (!noz) { g.strokeStyle = 'rgba(40,36,30,0.16)'; g.lineWidth = 1; for (let i = 0; i < rx * ry * 0.02; i++) { const px = x - rx + Rs() * rx * 2, py = y - ry + Rs() * ry * 2; g.beginPath(); g.moveTo(px, py); g.lineTo(px + 5, py + 3); g.stroke(); } }
        g.restore();
        // 縁の影（目地に落ちる所）
        polyPath(g, pts, ox, oy); g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = noz ? 2.5 : 1.5; g.stroke();
        // 高さ：野面は丸い膨らみ、打込接は平らな面と面取り
        if (noz) {
          const hgr = hg.createRadialGradient(x - rx * 0.1, y - ry * 0.15, 0, x, y, Math.max(rx, ry) * 1.05);
          hgr.addColorStop(0, gray(small ? 170 : 240)); hgr.addColorStop(0.6, gray(small ? 130 : 185)); hgr.addColorStop(1, gray(80));
          polyPath(hg, pts, ox, oy); hg.fillStyle = hgr; hg.fill();
        } else {
          polyPath(hg, pts, ox, oy); hg.fillStyle = gray(150); hg.fill();
          const s = 1 - 4 / Math.min(rx, ry);
          polyPath(hg, pts.map(([px, py]) => [cx + (px - cx) * s, cy + (py - cy) * s]), ox, oy); hg.fillStyle = gray(210); hg.fill();
        }
        hg.save(); polyPath(hg, pts, ox, oy); hg.clip();
        for (let i = 0; i < rx * ry * 0.03; i++) { hg.fillStyle = gray(Rs() < 0.5 ? 60 : 255, 0.12); hg.beginPath(); hg.ellipse(x - rx + Rs() * rx * 2, y - ry + Rs() * ry * 2, 1 + Rs() * 3, 1 + Rs() * 2, 0, 0, 7); hg.fill(); }
        if (!noz) { hg.strokeStyle = gray(120, 0.35); hg.lineWidth = 1; for (let i = 0; i < rx * ry * 0.02; i++) { const px = x - rx + Rs() * rx * 2, py = y - ry + Rs() * ry * 2; hg.beginPath(); hg.moveTo(px, py); hg.lineTo(px + 5, py + 3); hg.stroke(); } }
        hg.restore();
      });
    };
    // 間詰石：大きな石の間に詰めた小石（先に描き、大きな石の隙間にだけ残る）
    if (noz) for (let i = 0; i < 90; i++) { const r = 5 + R() * 8; stone(R() * S, R() * S, r * (1 + R() * 0.6), r, true); }
    // 段：高さを合わせてちょうど S にし、段ごとに石の幅もちょうど S にそろえる（上下左右とも繰り返せる）
    const rows = []; let sum = 0;
    while (sum < S) { const h = noz ? 40 + R() * 44 : 48 + R() * 12; rows.push(h); sum += h; }
    let y = 0;
    for (const h0 of rows) {
      const rh = h0 * S / sum, ws = []; let wsum = 0;
      while (wsum < S) { const w = noz ? 44 + R() * 90 : 72 + R() * 56; ws.push(w); wsum += w; }
      let x = R() * S;
      for (const w0 of ws) {
        const w = w0 * S / wsum, gap = noz ? 3 + R() * 3 : 1.6;
        // 野面は段が揺れる（石の大きさで上下にずれる）
        const dy = noz ? (R() - 0.5) * rh * 0.25 : 0, sh = noz ? 0.9 + R() * 0.22 : 1;
        stone((x + w / 2) % S, y + rh / 2 + dy, w / 2 - gap, rh / 2 * sh - gap, false);
        x += w;
      }
      y += rh;
    }
    // 目地の苔：高さの絵で目地（黒い所）を探して、緑の点を置く
    const hd = hg.getImageData(0, 0, S, S).data;
    for (let i = 0; i < 2600; i++) { const px = (R() * S) | 0, py = (R() * S) | 0; if (hd[(py * S + px) * 4] > 20) continue; g.fillStyle = `rgba(${58 + R() * 20},${80 + R() * 34},${40 + R() * 12},${0.35 + R() * 0.35})`; g.fillRect(px - 1, py - 1, 2 + R() * 3, 2 + R() * 3); }
    // 雨だれ：上から揺れながら下り、細く薄くなる筋（黒い水の跡と、白く乾いた流れ）
    for (let i = 0; i < (noz ? 34 : 42); i++) {
      const white = R() < 0.25, a0 = white ? 0.1 + R() * 0.08 : 0.12 + R() * 0.14, l = 80 + R() * 300, w = 2 + R() * 6;
      let x = R() * S; const y0 = R() * S;
      for (let yy = 0; yy < l; yy += 3) {
        x += (R() - 0.5) * 0.9;
        const a = a0 * (1 - yy / l), ww = w * (1 - yy / l * 0.6);
        g.fillStyle = white ? `rgba(222,216,198,${a})` : `rgba(22,26,20,${a})`;
        for (const oy of [0, -S]) for (const ox of [0, -S, S]) g.fillRect(x + ox, y0 + yy + oy, ww, 3);
      }
    }
  }, noz ? 9 : 7);
}
// 石の肌理：一つの石の面に貼る細かい凹凸（斑・小さな窪み・野面は瘤、打込接は鑿の跡）。縁は目地へ落ちて暗く、上から雨だれ、下に苔
function stoneGrain(kind) {
  const noz = kind === 'nozura', S = 128, R = rnd(noz ? 34 : 65);
  return pairTex(S, S, (g, hg) => {
    g.fillStyle = '#bab4a8'; g.fillRect(0, 0, S, S);
    hg.fillStyle = gray(170); hg.fillRect(0, 0, S, S);
    // 瘤と窪み（大きな起伏）
    for (let i = 0; i < (noz ? 22 : 8); i++) {
      const x = R() * S, y = R() * S, r = (noz ? 10 : 18) + R() * 20, up = R() < 0.6;
      wrapDraw(S, x - r, y - r, x + r, y + r, (ox, oy) => { const gr = hg.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, gray(up ? 255 : 60, noz ? 0.35 : 0.15)); gr.addColorStop(1, gray(up ? 255 : 60, 0)); hg.fillStyle = gr; hg.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); });
      wrapDraw(S, x - r, y - r, x + r, y + r, (ox, oy) => { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, up ? 'rgba(236,230,214,0.12)' : 'rgba(60,56,48,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); });
    }
    // 斑（石の粒）
    for (let i = 0; i < 1100; i++) { const v = 110 + R() * 130, x = R() * S, y = R() * S, s = 1 + R() * 2.5; g.fillStyle = `rgba(${v},${v - 4},${v - 12},0.35)`; g.fillRect(x, y, s, s); hg.fillStyle = gray(v, 0.25); hg.fillRect(x, y, s, s); }
    // 小さな窪み（気泡・欠け）
    for (let i = 0; i < 46; i++) { const x = R() * S, y = R() * S, rx = 1 + R() * 3, ry = 1 + R() * 2, a = R() * 3; g.fillStyle = `rgba(40,38,34,${0.15 + R() * 0.2})`; g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, 7); g.fill(); hg.fillStyle = gray(40, 0.7); hg.beginPath(); hg.ellipse(x, y, rx, ry, a, 0, 7); hg.fill(); }
    // 打込接：鑿の跡（斜めに平行な筋）
    if (!noz) for (let i = 0; i < 110; i++) { const x = R() * S, y = R() * S, a = -0.6 + (R() - 0.5) * 0.3, l = 5 + R() * 5; for (const [c, v] of [[g, 'rgba(60,56,50,0.22)'], [hg, gray(90, 0.5)]]) { c.strokeStyle = v; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); } }
    // 雨だれ（上から）と、下の縁の苔
    for (let i = 0; i < 7; i++) { const x = R() * S, l = 40 + R() * 80, gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(34,36,30,0.16)'); gr.addColorStop(1, 'rgba(34,36,30,0)'); g.fillStyle = gr; g.fillRect(x, 0, 1.5 + R() * 3, l); }
    const mg = g.createLinearGradient(0, S - 30, 0, S); mg.addColorStop(0, 'rgba(70,92,48,0)'); mg.addColorStop(1, 'rgba(70,92,48,0.3)'); g.fillStyle = mg; g.fillRect(0, S - 30, S, 30);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${60 + R() * 20},${86 + R() * 30},44,${0.2 + R() * 0.3})`; g.fillRect(R() * S, S - Math.pow(R(), 2) * 26, 1 + R() * 3, 1 + R() * 2); }
    // 縁：目地へ落ちる面取りと影（箱の一面ごとに縁が暗く丸くなる）
    const e = noz ? 16 : 8;
    for (const [x0, y0, x1, y1] of [[0, 0, 0, e], [0, S, 0, S - e], [0, 0, e, 0], [S, 0, S - e, 0]]) {
      const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(20,18,14,0.4)'); gr.addColorStop(1, 'rgba(20,18,14,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
      const hr = hg.createLinearGradient(x0, y0, x1, y1); hr.addColorStop(0, gray(70, 0.9)); hr.addColorStop(1, gray(70, 0)); hg.fillStyle = hr; hg.fillRect(0, 0, S, S);
    }
  }, noz ? 5 : 4);
}
// 土塀の壁：砂利を塗り込めた土の壁（『甲冑と戦国の攻城兵器』。壊して石つぶてにも使った）。
// 黄土の塗りむら・塗り込めた砂利と小石・藁すさ・雨だれの筋。壁の一面に一枚貼る
const tsuchiTex = () => pairTex(512, 512, (g, hg) => {
  const S = 512, R = rnd(17);
  g.fillStyle = '#c8b494'; g.fillRect(0, 0, S, S);
  hg.fillStyle = gray(140); hg.fillRect(0, 0, S, S);
  for (let i = 0; i < 240; i++) { g.fillStyle = `rgba(${150 + R() * 60},${126 + R() * 50},${92 + R() * 40},0.18)`; g.beginPath(); g.ellipse(R() * S, R() * S, 14 + R() * 50, 8 + R() * 26, R() * 3, 0, 7); g.fill(); }
  // 塗り込めた砂利：大小の石が面から少し出る（色は灰・茶・白っぽい物がまじる）
  for (let i = 0; i < 1500; i++) {
    const x = R() * S, y = R() * S, r = R() < 0.1 ? 3 + R() * 4 : 0.8 + R() * 2.2, v = R();
    const c = v < 0.4 ? [110 + R() * 40, 104 + R() * 36, 96 + R() * 30] : v < 0.75 ? [96 + R() * 40, 80 + R() * 30, 60 + R() * 24] : [196 + R() * 40, 190 + R() * 36, 176 + R() * 30];
    g.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},0.9)`; g.beginPath(); g.ellipse(x, y, r, r * (0.6 + R() * 0.4), R() * 3, 0, 7); g.fill();
    hg.fillStyle = gray(200, 0.8); hg.beginPath(); hg.ellipse(x, y, r, r * 0.8, 0, 0, 7); hg.fill();
  }
  // 藁すさ（細い短い筋）
  for (let i = 0; i < 260; i++) { const x = R() * S, y = R() * S, a = R() * 6.28, l = 3 + R() * 7; g.strokeStyle = 'rgba(200,170,110,0.45)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  // 雨だれの筋と、軒下の煤け
  for (let i = 0; i < 70; i++) { let x = R() * S; const l = 60 + R() * 300, a0 = 0.06 + R() * 0.1; for (let yy = 0; yy < l; yy += 3) { x += (R() - 0.5) * 0.7; g.fillStyle = `rgba(70,58,42,${a0 * (1 - yy / l)})`; g.fillRect(x, yy, 2, 3); } }
  const top = g.createLinearGradient(0, 0, 0, S * 0.18); top.addColorStop(0, 'rgba(50,42,32,0.4)'); top.addColorStop(1, 'rgba(50,42,32,0)'); g.fillStyle = top; g.fillRect(0, 0, S, S * 0.18);
}, 4);
// 白壁：漆喰の塗りむらと鏝の跡・軒下の煤け・雨だれの筋・剥げて土壁がのぞく所（藁すさ）・罅・足もとの泥はねと藻
// 壁の一面にそのまま一枚貼る（上が軒、下が足もと）
const plasterTex = () => pairTex(512, 512, (g, hg) => {
  const S = 512, R = rnd(5);
  g.fillStyle = '#f0ebe0'; g.fillRect(0, 0, S, S);
  hg.fillStyle = gray(150); hg.fillRect(0, 0, S, S);
  // 塗りむら（色）と、鏝で撫でた浅い起伏（高さ）
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${200 + R() * 40},${196 + R() * 36},${180 + R() * 30},0.16)`; g.beginPath(); g.ellipse(R() * S, R() * S, 12 + R() * 50, 6 + R() * 22, R() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 180; i++) { hg.fillStyle = gray(R() < 0.5 ? 120 : 185, 0.2); hg.beginPath(); hg.ellipse(R() * S, R() * S, 20 + R() * 60, 3 + R() * 6, (R() - 0.5) * 0.5, 0, 7); hg.fill(); }
  // 軒下の煤け（上ほど暗い、むらのある帯）
  const top = g.createLinearGradient(0, 0, 0, S * 0.2); top.addColorStop(0, 'rgba(56,50,42,0.42)'); top.addColorStop(1, 'rgba(56,50,42,0)'); g.fillStyle = top; g.fillRect(0, 0, S, S * 0.2);
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(60,54,44,0.08)'; g.beginPath(); g.ellipse(R() * S, R() * 30, 20 + R() * 40, 6 + R() * 16, 0, 0, 7); g.fill(); }
  // 雨だれ：軒から垂れた水の筋。上で太く濃く、揺れながら細く薄くなり、止まった所に溜まりの染み
  for (let i = 0; i < 110; i++) {
    let x = R() * S; const y0 = R() * 40, l = 50 + R() * 380, w = 1 + R() * 3.5, a0 = 0.07 + R() * 0.14;
    for (let yy = 0; yy < l; yy += 3) { x += (R() - 0.5) * 0.7; const f = 1 - yy / l; g.fillStyle = `rgba(82,74,60,${a0 * f})`; g.fillRect(x, y0 + yy, w * (0.5 + f * 0.5), 3); }
    if (R() < 0.3) { g.fillStyle = `rgba(82,74,60,${a0 * 0.6})`; g.beginPath(); g.ellipse(x + w / 2, y0 + l, w * 1.4, 3, 0, 0, 7); g.fill(); }
  }
  // 剥げ：漆喰が欠けて土壁がのぞく（窪み）。縁は崩れた漆喰、中に藁すさ
  for (let i = 0; i < 4; i++) {
    const x = 20 + R() * (S - 40), y = 200 + R() * 260, w = 10 + R() * 26, h = 8 + R() * 16, pts = [];
    for (let k = 0; k < 11; k++) { const a = k / 11 * 6.28, r = 0.38 + R() * 0.24; pts.push([x + Math.cos(a) * w * r, y + Math.sin(a) * h * r]); }
    g.fillStyle = 'rgba(210,202,186,1)'; g.beginPath(); g.ellipse(x, y, w * 0.64, h * 0.64, R() * 0.5, 0, 7); g.fill();
    polyPath(g, pts, 0, 0); g.fillStyle = '#9c8262'; g.fill();
    polyPath(hg, pts, 0, 0); hg.fillStyle = gray(40); hg.fill();
    polyPath(g, pts, 0, 0); g.strokeStyle = 'rgba(50,38,26,0.5)'; g.lineWidth = 1.5; g.stroke();
    for (let k = 0; k < 18; k++) { const sx = x - w * 0.3 + R() * w * 0.6, sy = y - h * 0.3 + R() * h * 0.6, a = R() * 3.14; g.strokeStyle = `rgba(${170 + R() * 40},${140 + R() * 30},80,0.55)`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(a) * 5, sy + Math.sin(a) * 5); g.stroke(); }
    for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(60,44,30,0.4)'; g.fillRect(x - w * 0.3 + R() * w * 0.6, y - h * 0.3 + R() * h * 0.6, 3, 1); }
    // 剥げの下へ流れた土の染み
    const st = g.createLinearGradient(0, y, 0, y + 60); st.addColorStop(0, 'rgba(120,96,66,0.22)'); st.addColorStop(1, 'rgba(120,96,66,0)'); g.fillStyle = st; g.fillRect(x - w * 0.2, y + h * 0.3, w * 0.3, 60);
  }
  // 細い罅（色も高さも凹む）
  for (let i = 0; i < 16; i++) {
    let x = R() * S, y = R() * S; const pts = [[x, y]];
    for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 26; y += R() * 20; pts.push([x, y]); }
    for (const [c, v, lw] of [[g, 'rgba(70,64,54,0.4)', 0.9], [hg, gray(60, 0.8), 1.2]]) { c.strokeStyle = v; c.lineWidth = lw; c.beginPath(); pts.forEach(([px, py], k) => (k ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke(); }
  }
  // 足もと：泥はね（下ほど濃い点）と、湿って青い藻
  const bot = g.createLinearGradient(0, S * 0.8, 0, S); bot.addColorStop(0, 'rgba(96,78,54,0)'); bot.addColorStop(1, 'rgba(96,78,54,0.45)'); g.fillStyle = bot; g.fillRect(0, S * 0.8, S, S * 0.2);
  for (let i = 0; i < 1400; i++) { const y = S - Math.pow(R(), 2.2) * 110, s = 0.6 + R() * 2.2; g.fillStyle = `rgba(${86 + R() * 30},${68 + R() * 20},${46 + R() * 12},${0.2 + R() * 0.35})`; g.beginPath(); g.ellipse(R() * S, y, s, s * (0.6 + R() * 0.6), 0, 0, 7); g.fill(); }
  for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(84,100,62,0.12)'; g.beginPath(); g.ellipse(R() * S, S - R() * 30, 10 + R() * 30, 4 + R() * 10, 0, 0, 7); g.fill(); }
}, 4);
// 下見板：黒く塗った板を横に重ね張りし、縦に押縁を打つ。板ごとの濃淡・木目と節・継ぎ目・重ねの段と影・日に焼けて褪せた所・剥げた墨
const shitamiTex = () => pairTex(256, 256, (g, hg) => {
  const S = 256, B = 32, R = rnd(9);
  g.fillStyle = '#2a2521'; g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += B) {
    const t = R() * 12;
    g.fillStyle = `rgb(${38 + t},${33 + t * 0.8},${28 + t * 0.6})`; g.fillRect(0, y, S, B);
    // 重ね張り：板の上は薄く（奥）、下の縁は厚く（手前）
    const hgr = hg.createLinearGradient(0, y, 0, y + B); hgr.addColorStop(0, gray(70)); hgr.addColorStop(1, gray(210)); hg.fillStyle = hgr; hg.fillRect(0, y, S, B);
    // 木目：揺れる筋（墨の下から浮く）
    for (let k = 0; k < 22; k++) {
      const yy = y + 2 + R() * (B - 5), ph = R() * 6, amp = 0.8 + R() * 1.6, lw = 0.6 + R() * 0.8;
      for (const [c, v] of [[g, `rgba(${92 + R() * 40},${80 + R() * 30},${64 + R() * 20},${0.06 + R() * 0.1})`], [hg, gray(R() < 0.5 ? 40 : 255, 0.14)]]) {
        c.strokeStyle = v; c.lineWidth = lw; c.beginPath(); c.moveTo(0, yy); for (let x = 0; x <= S; x += 8) c.lineTo(x, yy + Math.sin(x * 0.04 + ph) * amp); c.stroke();
      }
    }
    // 節
    if (R() < 0.6) { const x = R() * S, yy = y + 8 + R() * (B - 16); for (let r = 6; r > 0; r -= 1.5) { g.strokeStyle = `rgba(14,12,10,${0.3})`; g.lineWidth = 0.8; g.beginPath(); g.ellipse(x, yy, r * 1.8, r * 0.7, 0, 0, 7); g.stroke(); } hg.fillStyle = gray(60, 0.5); hg.beginPath(); hg.ellipse(x, yy, 4, 2, 0, 0, 7); hg.fill(); }
    // 上の縁は日に焼けて褪せる
    g.fillStyle = `rgba(150,136,116,${0.05 + R() * 0.07})`; g.fillRect(0, y, S, 8);
    // 板の継ぎ目（縦の隙間）
    for (let x = R() * 80; x < S; x += 80 + R() * 80) { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y, 2, B); g.fillStyle = 'rgba(150,136,116,.1)'; g.fillRect(x + 2, y, 1, B); hg.fillStyle = gray(20); hg.fillRect(x, y, 2, B); }
  }
  // 重ねの影：上の板の下の縁が、下の板の頭に落とす影
  for (let y = B; y <= S; y += B) { const yy = y % S, sg = g.createLinearGradient(0, yy, 0, yy + 6); sg.addColorStop(0, 'rgba(0,0,0,.7)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.fillRect(0, yy, S, 6); g.fillStyle = 'rgba(160,146,124,.12)'; g.fillRect(0, (y - 2 + S) % S, S, 1); }
  // 押縁（縦の細い材）と釘
  for (let x = 20; x < S; x += 64) {
    g.fillStyle = '#1c1916'; g.fillRect(x, 0, 7, S); g.fillStyle = 'rgba(140,126,106,.14)'; g.fillRect(x, 0, 2, S); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x + 7, 0, 2, S);
    hg.fillStyle = gray(255); hg.fillRect(x + 1, 0, 5, S); hg.fillStyle = gray(200); hg.fillRect(x, 0, 1, S); hg.fillRect(x + 6, 0, 1, S);
    for (let y = B - 6; y < S; y += B) { g.fillStyle = 'rgba(120,108,92,.5)'; g.fillRect(x + 2.5, y, 2, 2); }
  }
  // 墨が剥げて木地がのぞく所と、白く粉を吹いた褪せ
  for (let i = 0; i < 18; i++) { const x = R() * S, y = R() * S, w = 4 + R() * 18, h = 2 + R() * 5; g.fillStyle = `rgba(110,90,64,${0.15 + R() * 0.2})`; g.fillRect(x, y, w, h); hg.fillStyle = gray(90, 0.3); hg.fillRect(x, y, w, h); }
  for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(170,160,146,0.05)'; g.beginPath(); g.ellipse(R() * S, R() * S, 20 + R() * 40, 8 + R() * 20, 0, 0, 7); g.fill(); }
}, 7);
let CK = null;
function ck() {
  if (CK) return CK;
  const st = (T, ns, rough = 0.95) => liteMat({ vertexColors: true, map: T.map, normalMap: T.nrm, normalScale: new THREE.Vector2(ns, ns), roughness: rough, metalness: 0 });
  CK = {
    nozura: st({ map: generatedTex('nozura', true), nrm: null }, 0), uchikomi: st(stoneGrain('uchikomi'), 0.9),
    // 大きな面に石の並びを描いた物（城攻めの石垣の箱が使う）。face は野面積み、faceU は打込接
    face: st({ map: generatedTex('nozura'), nrm: null }, 0), faceU: st(stoneFace('uchikomi'), 1.1),
    plaster: st(plasterTex(), 0.6, 0.92), tsuchi: st(tsuchiTex(), 1.0, 0.97),
    shitami: st({ map: woodTex(), nrm: null }, 0, 0.85),
    wood: MAT(), tile: TILE(), iron: IRON(),
  };
  return CK;
}
// 城攻め（b_castle.js）も同じ石垣の素材を使う（k = 'uchikomi' で打込接の面）
export function castleStoneMat(k = 'nozura') {
  const M = ck();
  // 必要な城だけ乱積みの面・一石の肌を使う。共通の材質は替えない。
  if (k === 'warishi' || k === 'warishiGrain') {
    if (!M[k]) {
      const T = k === 'warishi' ? stoneFace('nozura') : stoneGrain('nozura');
      M[k] = M.faceU.clone(); M[k].map = T.map; M[k].normalMap = T.nrm;
    }
    return M[k];
  }
  return k === 'uchikomi' ? M.faceU : M.face;
}
export function castleMat(k) { return ck()[k]; }
// 石段の踏石。欠けた角の形を使い回し、目地を残して一段をまとめる。
const STEP_STONES = [];
export function stoneStepGeo(w, h, d, seed = 0) {
  if (!STEP_STONES.length) for (let k = 0; k < 4; k++) {
    const c = 0.06 + k * 0.012;
    const sh = new THREE.Shape([
      new THREE.Vector2(-0.5 + c, -0.5), new THREE.Vector2(0.43, -0.5),
      new THREE.Vector2(0.5, -0.41), new THREE.Vector2(0.5, 0.5 - c),
      new THREE.Vector2(0.5 - c, 0.5), new THREE.Vector2(-0.42, 0.5),
      new THREE.Vector2(-0.5, 0.4), new THREE.Vector2(-0.5, -0.5 + c),
    ]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1, steps: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5); g.rotateX(-Math.PI / 2); STEP_STONES.push(g);
  }
  const n = Math.max(1, Math.ceil(w / (1.05))), parts = [];
  for (let i = 0; i < n; i++) {
    const r = h01(seed, i), g = STEP_STONES[(i + Math.abs(Math.floor(seed))) % 4].clone();
    g.scale(w / n - Math.min(0.025, w / n * 0.04), h, d * (0.96 + r * 0.04));
    g.translate(-w / 2 + (i + 0.5) * w / n, (r - 0.5) * 0.018, (r - 0.5) * 0.035);
    parts.push(paint(g, vary(0x888477, i + Math.abs(Math.floor(seed)))));
  }
  return mergeGeometries(parts);
}
// 部品を素材ごとに集める入れ物
const kit = () => ({ nozura: [], uchikomi: [], plaster: [], tsuchi: [], shitami: [], wood: [], tile: [], iron: [] });
// 汚れと陰：一つの部品の中で、下ほど雨の跳ねと泥で黒ずみ（石は湿りと苔で暗く）、白壁は軒のすぐ下が陰る
const WEATHER = { plaster: [0.8, 0.86], tsuchi: [0.78, 0.84], shitami: [0.84, 1], nozura: [0.86, 1], uchikomi: [0.88, 1] };
function weather(g, k) {
  const W = WEATHER[k];
  if (!W) return g;
  const P = g.attributes.position, C = g.attributes.color;
  if (!C) return g;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const h = Math.max(0.01, y1 - y0);
  for (let i = 0; i < P.count; i++) {
    const t = (P.getY(i) - y0) / h;
    // 下の 1.2m ほどが黒ずむ。白壁は上の端が軒の陰
    let f = W[0] + (1 - W[0]) * Math.min(1, (t * h) / 1.2);
    if (W[1] < 1 && t > 0.92) f *= W[1];
    C.setXYZ(i, C.getX(i) * f, C.getY(i) * f, C.getZ(i) * f);
  }
  return g;
}
function kitMesh(B, cam = true, batch = null, near = false) {
  const M = ck();
  if (!batch) {
    const grp = new THREE.Group();
    for (const k of Object.keys(B)) {
      if (!B[k].length) continue;
      const m = new THREE.Mesh(mergeGeometries(B[k].map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => weather(g.attributes.color ? g : paint(g, 0xffffff), k))), M[k]);
      m.castShadow = true; m.receiveShadow = true; m.userData.camBlock = cam; m.userData.camNear = near;
      grp.add(m);
    }
    return grp;
  }
  // batch がある時：城ひとつぶんの「材質ごとの入れ物」へ、この部品（壁の一区画・櫓一つ等）の
  // 材質ごとの形を積むだけ（実の描画は finalizeKitBatch でまとめて一つずつの BatchedMesh にする）
  const part = new BatchedPart();
  for (const k of Object.keys(B)) {
    if (!B[k].length) continue;
    const geo = mergeGeometries(B[k].map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => weather(g.attributes.color ? g : paint(g, 0xffffff), k)));
    // 簡単な束（makeSimpleBatch）を渡されても落とさず、その束へ積む（小谷が支度の途中で止まった）
    if (!batch.pending) { pushSimpleBatch(batch, geo, M[k], part); continue; }
    (batch.pending[k] || (batch.pending[k] = [])).push({ geo, part, cam, near });
  }
  return part;
}

// ======================================================================
// 城の塀・門の櫓・石垣は、同じ形を army の struct と一対一でメッシュに持つと、城ひとつで
// 何十もの描く回数（draw call）になる（docs のお題：高遠を軽く）。壊れた時の個別の見た目
// （structTilt の行列・structFall の非表示）は変えず、材質ごとに一つの THREE.BatchedMesh へ
// まとめて描く（r160 の BatchedMesh は addGeometry が返す番号＝そのまま一つの「実体」の番号で、
// setMatrixAt・setVisibleAt でその一つだけ動かせる＝army_fx.js の struct.mesh の使い方とそのまま合う）。
// ======================================================================
export function makeKitBatch() { return { pending: {}, meshes: [] }; }

class BatchLiveMatrix extends THREE.Matrix4 {
  constructor(owner) { super(); this.owner = owner; }
  copy(m) { super.copy(m); this.owner._sync(); return this; }
  multiply(m) { super.multiply(m); this.owner._sync(); return this; }
  premultiply(m) { super.premultiply(m); this.owner._sync(); return this; }
}
// army_fx.js の structTilt・structFall が触る物（m.position・m.rotation・m.matrix・m.matrixAutoUpdate・
// m.visible）だけを、本物の Object3D の代わりに持つ入れ物。実は BatchedMesh の一つの実体を指すだけ
class BatchedPart {
  constructor() {
    this.isBatchedPart = true;
    this.userData = {};
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler();
    this.matrixAutoUpdate = true;
    this.matrixWorldNeedsUpdate = false;
    this.matrix = new BatchLiveMatrix(this);
    this._insts = [];
    this._visible = true;
  }
  // 買った素材の形（cgt.js の Group。座標は世界のまま）に替える：旧い実体は隠し、動き・見える見えないは Group が受け継ぐ
  setKit(grp) {
    this._kit = grp; grp.matrixAutoUpdate = false; grp.visible = this._visible;
    for (const [mesh, id] of this._insts) mesh.setVisibleAt(id, false);
    this._insts.length = 0;
  }
  _addInst(mesh, id) { if (this._kit) { mesh.setVisibleAt(id, false); return; } this._insts.push([mesh, id]); if (!this._visible) mesh.setVisibleAt(id, false); }
  _sync() { for (const [mesh, id] of this._insts) mesh.setMatrixAt(id, this.matrix); if (this._kit) { this._kit.matrix.copy(this.matrix); this._kit.matrixWorldNeedsUpdate = true; } }
  // 火で焦がす処理（army_fx.js igniteStruct）などが子を辿る時は、辿る子が無い（束の一つの実体なので材質は替えない）
  traverse() {}
  get visible() { return this._visible; }
  set visible(v) { this._visible = v; for (const [mesh, id] of this._insts) mesh.setVisibleAt(id, v); if (this._kit) this._kit.visible = v; }
}
// 城の積み終わり：材質ごとにためた形を、一つずつの BatchedMesh にして舞台へ置く
export function finalizeKitBatch(rt, batch) {
  const M = ck();
  for (const key of Object.keys(batch.pending)) {
    const list = batch.pending[key];
    if (!list.length) continue;
    // 携帯の一括描画がない時と戦の指定がある時は、材質と区画で結合する。開閉・破壊も保つ。
    if (rt.world?.def?.distantMaterialBatch || false && (!hasMultiDraw() || rt.world?.def?.mergeStaticBatches)) {
      for (const cam of [false, true]) for (const near of [false, true]) {
        const entries = list.filter((e) => !!e.cam === cam && !!e.near === near);
        if (entries.length) batch.meshes.push(...mergeFenceBatch(rt.scene, entries, M[key], cam, near, rt.world));
      }
      continue;
    }
    const bm = kitBatchMesh(list, M[key]);
    let anyCam = false, anyNear = false;
    for (const { cam, near } of list) { if (cam) anyCam = true; if (near) anyNear = true; }
    bm.userData.camBlock = anyCam; bm.userData.camNear = anyNear;
    rt.scene.add(bm);
    batch.meshes.push(bm);
  }
  batch.pending = {};
  if (batch.simple) { finalizeSimpleBatch(rt, batch.simple); batch.simple = null; }
  batch.done = true;   // この後に積む柵は一つずつ描く（まとめる時が来ないので）
}
// 箱（中心 x,y,z、幅 w・高さ h・奥行き d、y 軸の回り rot）。uvk：絵の繰り返しを大きさに合わせる（m ごと）
function kbox(P, hex, x, y, z, w, h, d, rot = 0, uvk = 0, surface = false) {
  // 高い面は縦に割る（下の黒ずみと軒下の陰を、面の途中で付けられるように）
  const g = surface ? buildingWall(w, h, d, hex) : new THREE.BoxGeometry(w, h, d, 1, !uvk && h > 0.8 ? 5 : 1, 1);
  if (uvk && surface) {
    // 分割数に依存せず、壁の長さに合う粒径を保つ。
    const p = g.attributes.position, normal = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i,
      (Math.abs(normal.getX(i)) > .5 ? p.getZ(i) : p.getX(i)) / uvk,
      (Math.abs(normal.getY(i)) > .5 ? p.getZ(i) : p.getY(i)) / uvk);
  } else if (uvk) { const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / uvk, uv.getY(i) * dims[f][1] / uvk); } }
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  P.push(surface ? g : paint(g, hex));
}
// 寄棟の瓦屋根（軒 w×d、高さ h、軒の高さ y）。hipGeo の反った形に瓦の絵。W は漆喰の入れ物（棟の白い筋）。
// 軒先の丸い軒瓦と隅棟は面の反りに沿わせ、隅棟の先は跳ね上がる。棟は熨斗瓦の積みと冠瓦、両端に鬼瓦
function ktile(P, W, x, y, z, w, d, h, rot = 0, ridge = 0.35, lower = false) {
  const rl = Math.max(0.3, (w - d) / 2 + ridge), ex = w / 2, ez = d / 2, lift = Math.min(0.55, 0.28 + ez * 0.04);
  const g = hipGeo(ex, ez, h, 0, rl, lift);
  if (rot) g.rotateY(rot);
  g.translate(x, y, z);
  P.push(g);
  const Q = Lr(x, z, rot);
  const at = (f, u, t, dy = 0) => { const [lx, ly, lz] = hipPoint(ex, ez, h, rl, lift, f, u, t); const [wx, wz] = Q(lx, lz); return [wx, y + ly + dy, wz]; };
  // 軒先：軒瓦の丸い縁（面ごとに跳ね上がりに沿って四つに折る）
  for (let f = 0; f < 4; f++) for (let k = 0; k < 4; k++) { const u0 = k / 2 - 1, u1 = (k + 1) / 2 - 1; P.push(paint(logGeo(at(f, u0, 0, -0.06), at(f, u1, 0, -0.06), 0.1, 0.1, 6), 0x3a3937)); }
  // 棟：太い熨斗瓦の積み（丸い筒で）と、両端の鬼瓦（二重目の床の下に収める下の屋根は、棟の飾りを付けない）
  if (!lower) {
  const rg = new THREE.CylinderGeometry(0.2, 0.22, rl * 2 + 0.2, 8); rg.rotateZ(Math.PI / 2); rg.rotateY(rot); rg.translate(x, y + h + 0.1, z); P.push(paint(rg, 0x2e2d2b));
  { const [lx, lz] = Q(0, 0.215), [rx2, rz2] = Q(0, -0.215); for (const [px, pz] of [[lx, lz], [rx2, rz2]]) { const b = new THREE.BoxGeometry(rl * 2 + 0.1, 0.05, 0.03); b.rotateY(rot); b.translate(px, y + h + 0.08, pz); W.push(paint(b, 0xd8d2c4)); } }
  const kg = new THREE.CylinderGeometry(0.11, 0.11, rl * 2 + 0.26, 8, 1, false, -Math.PI / 2, Math.PI); kg.rotateZ(Math.PI / 2); kg.rotateX(-Math.PI / 2); kg.rotateY(rot); kg.translate(x, y + h + 0.3, z); P.push(paint(kg, 0x8e8d88));
  for (const s of [-1, 1]) { const [ox, oz] = Q(s * (rl + 0.12), 0); const o = new THREE.BoxGeometry(0.16, 0.6, 0.55); o.rotateY(rot); o.translate(ox, y + h + 0.32, oz); P.push(paint(o, 0x2a2927)); }
  }
  // 隅棟：隅から棟の端へ、面の反りに沿って三つに折る。先に小さな鬼瓦
  for (const [f, u] of [[0, -1], [0, 1], [1, -1], [1, 1]]) {
    for (let k = 0; k < (lower ? 2 : 3); k++) P.push(paint(logGeo(at(f, u, k / 3, 0.08), at(f, u, (k + 1) / 3, 0.08), 0.13, 0.12, 6), 0x2e2d2b));
    const c = at(f, u, 0, 0.14); const o = new THREE.BoxGeometry(0.22, 0.36, 0.22); o.rotateY(rot); o.translate(c[0], c[1] + 0.06, c[2]); P.push(paint(o, 0x2a2927));
  }
}
// 妻（破風）：屋根の面から張り出す三角の切妻。漆喰の妻壁・黒い破風板（反りを付けて）・懸魚・瓦の二枚の面。
// 局所の向き：+z へ張り出す。中心 (cx, cz) は妻の下の真ん中、y は妻の下、gw は幅、gh は高さ、dep は奥行き（棟の長さ）
function gable(B, Q, rot, face, cx, cz, y, gw, gh, dep) {
  const ca = Math.cos(face), sa = Math.sin(face);
  const L = (lx, lz) => Q(cx + lx * ca + lz * sa, cz - lx * sa + lz * ca);
  const R = rot + face;
  // 妻壁：三角の板（両面）
  { const [px, pz] = L(0, dep / 2 - 0.05), cr = Math.cos(R), sr = Math.sin(R);
    const v = [[-gw / 2, 0], [gw / 2, 0], [0, gh]].map(([lx, ly]) => [px + lx * cr, y + ly, pz - lx * sr]);
    const pos = [...v[0], ...v[1], ...v[2], ...v[0], ...v[2], ...v[1]];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, gw / 3, 0, gw / 6, gh / 3, 0, 0, gw / 6, gh / 3, gw / 3, 0], 2)); g.computeVertexNormals();
    B.plaster.push(paint(g, 0xe0dacb)); }
  // 屋根の二枚の面（瓦）：棟から両へ下る。先（妻の側）は妻壁より張り出す
  for (const s of [-1, 1]) {
    const sl = Math.hypot(gw / 2 + 0.5, gh), a = Math.atan2(gh, gw / 2 + 0.5);
    const g = new THREE.BoxGeometry(sl, 0.12, dep + 0.5);
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * sl * 0.5, uv.getY(k) * (dep + 0.5) * 0.5);
    g.translate(s * sl / 2, 0, 0); g.rotateZ(-s * a); g.translate(0, gh + 0.08, 0.2); g.rotateY(R); const [px, pz] = L(0, 0); g.translate(px, y, pz); B.tile.push(paint(g, 0xffffff));
    // 破風板：妻の二つの辺に沿った黒い板（下の端で外へ反る）
    const hb = new THREE.BoxGeometry(sl + 0.3, 0.3, 0.1); hb.translate(s * (sl / 2 + 0.05), -0.05, 0); hb.rotateZ(-s * a); hb.translate(0, gh + 0.02, 0); hb.rotateY(R); const [qx, qz] = L(0, dep / 2 + 0.3); hb.translate(qx, y, qz); B.wood.push(paint(hb, 0x2a2420));
    const tip = new THREE.BoxGeometry(0.5, 0.26, 0.1); tip.rotateZ(s * 0.35); tip.translate(s * (gw / 2 + 0.6), 0.12, 0); tip.rotateY(R); tip.translate(qx, y, qz); B.wood.push(paint(tip, 0x2a2420));
  }
  // 懸魚（頂の下の飾り板）と棟の瓦
  { const g = new THREE.BoxGeometry(0.34, 0.5, 0.06); g.rotateY(R); const [px, pz] = L(0, dep / 2 + 0.36); g.translate(px, y + gh - 0.3, pz); B.iron.push(paint(g, 0x8a7640)); }
  { const g = new THREE.CylinderGeometry(0.13, 0.13, dep + 0.6, 6); g.rotateX(Math.PI / 2); g.rotateY(R); const [px, pz] = L(0, 0.2); g.translate(px, y + gh + 0.2, pz); B.tile.push(paint(g, 0x2e2d2b)); }
}
const Lr = (x, z, rot) => (lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];

// ---- 石を一つずつ積む（A4）：石は凹凸のある小さな塊で、目地は奥の暗い裏込めが覗く。下ほど苔、ところどころ雨だれの筋
// 面の向き N（外向き）、線 a→b、上の高さ top と下の高さ bot（各点で関数）、勾配 lean と反り（下ほど外へ開く）
const hsh = (a, b) => { let h = Math.imul(Math.floor(a * 73.1) ^ Math.imul(Math.floor(b * 91.7), 2654435761), 1597334677) >>> 0; h = (h ^ (h >>> 15)) >>> 0; return (h % 10007) / 10007; };
const UPV = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
function stoneGeo(w, h, d, kind, seed, seg = 2) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, 1);
  const P = g.attributes.position, round = kind === 'nozura' ? 0.38 : 0.24;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const fx = Math.abs(x) / (w / 2), fy = Math.abs(y) / (h / 2);
    // 前の面の縁ほど奥へ（角が丸い石）。同じ所の頂点は同じだけ動かす（割れ目を作らない）
    if (z > 0) z -= (Math.max(fx, fy) ** 2) * d * round + hsh(seed + x * 3, y * 5) * d * (kind === 'nozura' ? 0.25 : 0.06);
    x *= 1 + (hsh(seed, y * 7 + 1) - 0.5) * (kind === 'nozura' ? 0.16 : 0.04);
    y *= 1 + (hsh(seed + 2, x * 7) - 0.5) * (kind === 'nozura' ? 0.14 : 0.04);
    P.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
function stoneCourse(B, kind, ax, az, bx, bz, topAt, botAt, lean, side, seed, big = 1, faceSegments = big > 1 ? 1 : 2, backInset = 0) {
  const len = Math.hypot(bx - ax, bz - az); if (len < 0.3) return;
  const tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz * side, nz = tx * side;
  const face = Math.atan2(nx, nz);
  const noz = kind === 'nozura';
  const gap = noz ? 0.035 : 0.018;
  // 裏込め（目地の奥の暗い面）：長さに沿って高さを追う帯を、石の少し奥に両面で張る（坂でも隙間から空が見えないように）
  {
    const NS = Math.max(2, Math.ceil(len / 2)), pos = [];
    // 野面は裏込めを石の芯の所まで出し、反りに沿って縦にも四つに折る（目地が浅く、黒い穴に見えない）
    const NV = noz ? 4 : 1;
    const at = (t, v) => {
      const bot = botAt(t) - 0.15, top = topAt(t), H = Math.max(0.05, top - bot), q = 1 - v / NV;
      // 大きく丸めた石では裏込めが表の面を横切る。指定した戦だけ芯の後ろへ下げる。
      const y = v === NV ? top - 0.05 : bot + (top - bot) * (1 - q), o = H * lean * Math.pow(q, 1.5) + (noz ? 0.1 : 0.02) - backInset;
      return [ax + tx * len * t + nx * o, y, az + tz * len * t + nz * o];
    };
    for (let k = 0; k < NS; k++) for (let v = 0; v < NV; v++) {
      const a0 = at(k / NS, v), a1 = at((k + 1) / NS, v), b0 = at(k / NS, v + 1), b1 = at((k + 1) / NS, v + 1);
      pos.push(...a0, ...a1, ...b1, ...a0, ...b1, ...b0, ...a0, ...b1, ...a1, ...a0, ...b0, ...b1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    g.computeVertexNormals();
    B[kind].push(paint(g, noz ? 0x5a554c : 0x2e2b27));   // 野面の裏込めは栗石の灰（黒い穴に見せない）
  }
  let y0 = 0, row = 0;
  const Hmax = Math.max(...[0, 0.25, 0.5, 0.75, 1].map((t) => topAt(t) - botAt(t)));
  while (y0 < Hmax - 0.05) {
    const rh = (noz ? 0.34 + hsh(seed + row, 3.3) * 0.36 : 0.42 + hsh(seed + row, 1.7) * 0.1) * big;
    let u = -hsh(seed + row, 9.1) * 0.6;
    let k = 0;
    while (u < len) {
      const sw = (noz ? 0.38 + Math.pow(hsh(seed + row * 31, u * 3 + 0.3), 1.6) * 1.15 : 0.7 + hsh(seed + row * 17, u * 2) * 0.35) * big;
      const u0 = Math.max(0, u), u1 = Math.min(len, u + sw);
      u += sw; k++;
      if (u1 - u0 < 0.15) continue;
      const t = (u0 + u1) / 2 / len, bot = botAt(t), top = topAt(t), H = top - bot;
      const yb = y0, yt = Math.min(y0 + rh, H);
      if (yt - yb < 0.12 || yb >= H) continue;
      // 反り：上ほど立ち、下ほど外へ（高さの割合 q の所の張り出し）
      const q = 1 - (yb + yt) / 2 / Math.max(0.5, H);
      const out = H * lean * Math.pow(q, 1.5) + 0.12;
      // 野面積み（乱積み）：段の高さを石ごとに崩す（横の目地が一直線に通らない）。ときどき二段にまたがる大石、
      // 面の出入り（石ごとに数 cm 前後）と、縦に細い石・寝かせた平たい石を混ぜる
      let hS = yt - yb - gap, yc = (yb + yt) / 2, dOut = 0;
      if (noz) {
        const r1 = hsh(seed + k * 5, row * 7 + 0.2), r4 = hsh(seed + k * 11, row * 3 + 0.9);
        const tall = r1 > 0.86 && yt + rh * 0.8 < H;
        hS = hS * (tall ? 1.9 : 1.04 + r1 * 0.34); yc = (yb + yt) / 2 + (tall ? rh * 0.45 : 0) + (r4 - 0.5) * rh * 0.22;
        if (yc + hS / 2 > H) { hS = Math.max(0.12, H - (yc - hS / 2)); yc = H - hS / 2; }
        dOut = (r4 - 0.5) * 0.12;
      }
      const wS = u1 - u0 - gap, dS = noz ? 0.55 : 0.45;
      const g = stoneGeo(wS, hS, dS, kind, seed * 13 + row * 101 + k, faceSegments);
      const tilt = Math.atan(lean * 1.5 * Math.pow(Math.max(q, 0.01), 0.5));
      _e.set(-tilt, face, 0, 'YXZ'); g.applyQuaternion(_q.setFromEuler(_e));
      const cx = ax + tx * (u0 + u1) / 2 + nx * (out + dOut), cz = az + tz * (u0 + u1) / 2 + nz * (out + dOut);
      g.translate(cx, bot + yc, cz);
      // 色：石ごとの濃淡、下ほど苔の緑、雨だれの筋（縦に並ぶ石が暗い）
      const r = hsh(seed + k * 7, row * 3 + 0.5), r2 = hsh(seed + k * 3, row * 5 + 0.7), streak = hsh(Math.floor(cx * 1.3 + cz * 1.3), 7.7) < 0.12 ? 0.8 : 1;
      const c = new THREE.Color(noz ? 0xa29d90 : 0xb0aa9c).multiplyScalar((0.62 + r * 0.55) * streak);
      if (r2 < 0.3) c.lerp(new THREE.Color(0xa08a6a), 0.45);           // 赤み・黄みの石
      else if (r2 > 0.8) c.lerp(new THREE.Color(0x7e8890), 0.35);      // 青みの石
      const moss = Math.max(0, 1 - (yb / Math.max(0.5, H)) * 2.2) * (0.25 + hsh(k, row) * 0.5);
      c.lerp(new THREE.Color(0x4e5a38), moss);
      B[kind].push(paint(g, c.getHex()));
      // 間詰石（野面積み）：石の継ぎ目の上の角に、小さな石を少し奥へ詰める（裏込めの黒い穴に見せない）
      if (noz && big <= 1 && hsh(seed + k * 13, row * 1.3) < 0.6 && yc + hS / 2 < H - 0.1) {
        const sw2 = 0.14 + hsh(k, row + 0.3) * 0.16, sh2 = 0.1 + hsh(k + 3, row) * 0.12;
        const g2 = stoneGeo(sw2, sh2, 0.3, kind, seed * 7 + row * 31 + k, 1);
        g2.applyQuaternion(_q);
        const uu = Math.max(0, u0 - 0.02), cx2 = ax + tx * uu + nx * (out - 0.06), cz2 = az + tz * uu + nz * (out - 0.06);
        g2.translate(cx2, bot + yc + hS / 2 - 0.02, cz2);
        B[kind].push(paint(g2, c.clone().multiplyScalar(0.8).getHex()));
      }
    }
    y0 += rh; row++;
  }
}
// 石垣：点の並び pts に沿って、進む向きの左手側（o.out = -1 で右手側）へ張り出す石の面。上端は線の地面の高さ + o.top、
// 下は外の地面より o.sink 深く（o.maxH まで）。o.kind：'nozura'（野面積み・既定）か 'uchikomi'（打込接）
export function ishigaki(world, pts, o = {}) {
  const B = kit(), kind = o.kind || 'nozura', side = o.out || 1;
  const lean = o.lean ?? (kind === 'nozura' ? 0.34 : 0.26);
  const faceSegments = o.faceSegments ?? world.def?.stoneFaceSegments;
  const backInset = o.backInset ?? world.def?.stoneBackInset ?? 0;
  const kitSegs = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az); if (len < 0.5) continue;
    const nx = -(bz - az) / len * side, nz = (bx - ax) / len * side;
    const P = (t) => [ax + (bx - ax) * t, az + (bz - az) * t];
    // o.topY：天端の高さを決め打ち（曲輪の外へ張り出して積む時。線の上の地面はもう切岸の下なので）
    const topAt = (t) => { if (o.topY != null) return o.topY; const [x, z] = P(t); return world.heightAt(x, z) + (o.top ?? 0.4); };
    const botAt = (t) => { const [x, z] = P(t); const tp = topAt(t); const b = Math.min(world.heightAt(x + nx * 2.5, z + nz * 2.5), world.heightAt(x + nx * 5, z + nz * 5), tp - (o.minH ?? 2)) - (o.sink ?? 0.4); return Math.max(b, tp - (o.maxH ?? 4)); };
    kitSegs.push({ s, ax, az, bx, bz, nx, nz, len, topAt, botAt, seed: s * 17 + Math.round(ax * 3 + az * 5) });
    // 大きさの指定が無い石垣は、少し大きな石で積む（城一つの石垣で二十万面を越えていた。石の並び・反り・苔は同じ）
    stoneCourse(B, kind, ax, az, bx, bz, topAt, botAt, lean, side, s * 17 + Math.round(ax * 3 + az * 5), o.big || 1.2, faceSegments, backInset);
    // 天端の笠石：平たい石を一列（板に見えないよう、一つずつ）
    stoneCourse(B, kind, ax, az, bx, bz, (t) => topAt(t) + 0.22, (t) => topAt(t) - 0.02, 0, side, s * 23 + 7, o.big || 1.2, world.def?.stoneFaceSegments, backInset);
    // o.capIn：天端から内へ o.capIn m の平らな石敷き（張り出して積んだ石垣と曲輪の縁の間の切岸を、上から塞ぐ）
    if (o.capIn) {
      const rot = Math.atan2(-(bz - az), bx - ax), ci = o.capIn, mx = (ax + bx) / 2 - nx * ci / 2, mz = (az + bz) / 2 - nz * ci / 2;
      kbox(B[kind], 0x8a8478, mx, topAt(0.5) - 0.35, mz, len + 0.6, 0.7, ci + 0.2, rot, 1.4);
    }
  }
  const ret = kitMesh(B, true, o.batch);
  if (!o.noKit) kitStoneOver(ret, pts, o, side, kitSegs);
  return ret;
}
// 買った石垣の部品（cgt.js）で張り替える：読めたら旧い手作りの石垣を隠し、同じ線に部品を並べる（画質「低」・描かない時は何もしない）。
// 舞台は o.scene か、返した Group の親。折れ角が大きい端は、継ぎ目の隙間が出ないよう少し伸ばす
function kitStoneOver(ret, pts, o, side, segs) {
  if (!cgtOn() || !segs.length) return;
  const scene = o.scene || cgtScene();
  if (segs.reduce((s, g) => s + g.topAt(0.5) - g.botAt(0.5), 0) / segs.length < 1.8) return;   // 低い石垣（寺の土台など）は部品（最低 2m）が合わない
  Promise.resolve().then(() => whenCgt(() => {
    if (!scene) return;
    // 面の数の予算（石垣は 2m で 1〜3 千面）。使い切っていたら旧い手作りのまま
    let est = 0; for (const g of segs) est += g.len / 2 * 1500;
    if (!cgtSpend(est)) return;
    const kb = new KitBatch(), n = pts.length, closed = Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) < 0.1;
    const turn = (p, a, b) => { const d1 = Math.atan2(a[1] - p[1], a[0] - p[0]), d2 = Math.atan2(b[1] - a[1], b[0] - a[0]); let d = Math.abs(d2 - d1); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
    for (const g of segs) {
      const pa = g.s > 0 ? pts[g.s - 1] : closed ? pts[n - 2] : null, pb = g.s + 2 < n ? pts[g.s + 2] : closed ? pts[1] : null;
      const A = pts[g.s], Bp = pts[g.s + 1];
      g.extA = pa && turn(pa, A, Bp) > 0.35 ? 1.1 : 0; g.extB = pb && turn(A, Bp, pb) > 0.35 ? 1.1 : 0; g.side = side;
      kitStoneSeg(kb, g);
      if (o.capIn) {
        const rot = Math.atan2(-(g.bz - g.az), g.bx - g.ax), ci = o.capIn;
        kb.addBox('Gravel', (g.ax + g.bx) / 2 - g.nx * ci / 2, g.topAt(0.5) - 0.38, (g.az + g.bz) / 2 - g.nz * ci / 2, g.len + 0.6, 0.7, ci + 0.2, rot);
      }
    }
    if (!kb.n) return;
    kitAttach(ret, kb.build(), scene);
  }));
}
// 買った素材の石垣で四角い台を積む（stoneBase の代わり）。台の足もとが旧い台の輪郭に収まるよう、天端の線を内へ寄せ、奥行きを縮める
function kitStoneRect(kb, cx, cz, w, d, rot, top, bot) {
  const P = Lr(cx, cz, rot), H = top - bot, zs = 0.34, inset = Math.min(0.55 * H * zs, w / 2 - 0.2, d / 2 - 0.2);
  const hw = w / 2 - inset, hd = d / 2 - inset;
  const c = [P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
    kitStoneSeg(kb, { ax, az, bx, bz, side: -1, extA: 0.7, extB: 0.7, zs, topAt: () => top, botAt: () => bot, seed: i * 5 + Math.round(cx + cz) });
  }
  kb.addBox('Gravel', cx, top - 0.38, cz, w - inset * 2 + 0.6, 0.7, d - inset * 2 + 0.6, rot);
}
// 渡櫓の白壁（買った素材）：長さ W・奥行き D の長方形に、高さ 2m の白壁を一周。外（-z）は格子窓を三つ、内（+z）は二つ、妻は板壁。足もとの高さ y
function kitGateWalls(kb, P, rot, y, W, D) {
  const N = Math.max(2, Math.round(W / 2)), cw = W / N, M = Math.max(1, Math.round(D / 2)), cd = D / M, at = (lx, lz) => { const [x, z] = P(lx, lz); return [x, z]; };
  for (let i = 0; i < N; i++) {
    const lx = -W / 2 + i * cw, win = i > 0 && i < N - 1;
    { const [x, z] = at(lx + cw, -D / 2); kb.add(win ? 'Wall_White_Window' : 'Wall_White_Plain', x, y, z, rot + Math.PI, cw / 2, 1, 1); }
    { const [x, z] = at(lx, D / 2); kb.add(i % 2 === 1 ? 'Wall_White_Window' : 'Wall_White_Plain', x, y, z, rot, cw / 2, 1, 1); }
  }
  for (let j = 0; j < M; j++) for (const s of [-1, 1]) {
    const lz = -D / 2 + j * cd, [x, z] = s > 0 ? at(W / 2, lz + cd) : at(-W / 2, lz);
    kb.add('Wall_White_Plain', x, y, z, rot + (s > 0 ? Math.PI / 2 : -Math.PI / 2), cd / 2, 1, 1);
  }
}
// 四角い台（櫓・天守・門の脇）を石で積む：中心 x,z、幅 w・奥行き d、回り rot、高さ h（下は地面より 0.6 深く）
function stoneBase(B, world, kind, x, z, w, d, rot, h) {
  const P = Lr(x, z, rot), top = world.heightAt(x, z) - 0.3 + h;
  const c = [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2), P(-w / 2, d / 2)];
  const lean = kind === 'nozura' ? 0.22 : 0.16;
  for (let i = 0; i < 4; i++) {
    const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
    // 角を順に回ると外は右手側（side = -1）
    stoneCourse(B, kind, ax, az, bx, bz, () => top, (t) => Math.min(top - 0.5, world.heightAt(ax + (bx - ax) * t, az + (bz - az) * t) - 0.6), lean, -1, i * 29 + Math.round(x * 7 + z * 3));
  }
  // 隅の算木積み：長い石と短い石を、段ごとに向きを替えて互い違いに組む（隅は面より少し張り出し、角が立つ）
  for (let i = 0; i < 4; i++) {
    const [cx, cz] = c[i], [px, pz] = c[(i + 3) % 4], [nx2, nz2] = c[(i + 1) % 4];
    const ea = [px - cx, pz - cz], eb = [nx2 - cx, nz2 - cz], la = Math.hypot(...ea), lb = Math.hypot(...eb);
    const da = [ea[0] / la, ea[1] / la], db = [eb[0] / lb, eb[1] / lb];
    // 各辺の外向き：角から辺を見て外側（もう一つの辺と反対）
    const na = [-db[0], -db[1]], nb = [-da[0], -da[1]];
    const bot = Math.min(top - 0.5, world.heightAt(cx, cz) - 0.6), H = top - bot;
    let yb = 0, k = 0;
    while (yb < H - 0.1) {
      const rh = Math.min(0.46 + hsh(i + x, k) * 0.08, H - yb);
      if (rh < 0.14) break;
      const q = 1 - (yb + rh / 2) / Math.max(0.5, H), out = H * lean * Math.pow(q, 1.5) + 0.16;
      const along = k % 2 ? da : db, nrm = k % 2 ? na : nb, Lg = (k % 2 ? 1.25 : 1.1) * (0.9 + hsh(k, i + z) * 0.2);
      const g = stoneGeo(Lg, rh - 0.035, 0.7, kind === 'nozura' ? 'uchikomi' : kind, i * 31 + k * 7, 2);
      _e.set(-Math.atan(lean * 1.2 * Math.sqrt(Math.max(q, 0.01))), Math.atan2(nrm[0], nrm[1]), 0, 'YXZ'); g.applyQuaternion(_q.setFromEuler(_e));
      const ox = cx + (na[0] + nb[0]) * out + along[0] * (Lg / 2 - 0.08), oz = cz + (na[1] + nb[1]) * out + along[1] * (Lg / 2 - 0.08);
      g.translate(ox, bot + yb + rh / 2, oz);
      const cc = new THREE.Color(0xb2ac9e).multiplyScalar(0.78 + hsh(k * 3, i) * 0.3);
      cc.lerp(new THREE.Color(0x4e5a38), Math.max(0, 0.3 - yb / H) * 0.8);
      B[kind].push(paint(g, cc.getHex()));
      yb += rh; k++;
    }
  }
  kbox(B[kind], 0x8e897d, x, top + 0.06, z, w + 0.2, 0.16, d + 0.2, rot, 1.4);
  return top;
}

// 土塀（wallLine の mesh にそのまま渡せる形）：『甲冑と戦国の攻城兵器』の図に合わせ、既定は砂利を塗り込めた土の壁に
// 板葺の笠、矢狭間（縦 97×横 21cm の縦長）と丸・三角の鉄砲狭間。o.shikkui：白い漆喰と瓦の笠（石垣の城の塀）。
// o.ita：板葺（既定）、o.kawara：瓦。o.samaStep：狭間の間合い（bhelp の samaTs と同じ割り方）。o.h：壁の高さ（既定 2.3）
export function dobei(world, seg, o = {}) {
  const shikkui = !!o.shikkui, ita = o.kawara ? false : (o.ita ?? !shikkui);
  // o.baseY：足もとの高さを決め打ち（石垣の天端の上に建てる時）
  const HY = o.baseY != null ? () => o.baseY : (x, z) => world.heightAt(x, z);
  const [ax, az, bx, bz] = seg;
  const B = kit();
  const len = Math.hypot(bx - ax, bz - az), rot = Math.atan2(-(bz - az), bx - ax);
  const H = o.h || 2.3;
  const n = Math.max(1, Math.round(len / 1.8));
  const step = o.samaStep || 1.8, holes = Math.max(1, Math.round(len / step));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
    const y = HY(mx, mz), L = len / n + 0.02;
    if (i === 0) stoneCourse(B, 'nozura', ax, az, bx, bz, (t) => HY(ax + (bx - ax) * t, az + (bz - az) * t) + 0.75, (t) => HY(ax + (bx - ax) * t, az + (bz - az) * t) - 0.3, 0.1, 1, Math.round(ax * 5 + az * 3));   // 腰の石（外の面）
    kbox(B.nozura, 0x6a645a, mx, y + 0.3, mz, L, 1.1, 0.6, rot, 1.4);                     // 腰の芯（目地の奥。栗石の灰＝黒い穴に見せない）
    if (o.tera) kbox(B.plaster, vary(o.earth ?? 0xcdbfa2, i), mx, y + 0.75 + (H - 0.75) / 2, mz, L, H - 0.75, 0.52, rot, 0, true);   // 築地：土を突いた厚い壁（狭間も下見板も無い）
    else if (shikkui) {
      kbox(B.plaster, vary(0xc9c2b0, i), mx, y + 0.85 + (H - 0.85) / 2, mz, L, H - 0.85, 0.36, rot, 0, true);   // 漆喰
      kbox(B.shitami, 0x9a948a, mx, y + 1.05, mz, L, 0.5, 0.38, rot, 1.2);                   // 腰の下見板
    } else kbox(B.tsuchi, vary(o.tsuchi ?? 0xf2ead8, i), mx, y + 0.75 + (H - 0.75) / 2, mz, L, H - 0.75, 0.4, rot, 1.6, true);   // 砂利を塗り込めた土の壁
    kbox(B.wood, 0x2c2622, mx, y + H - 0.12, mz, L, 0.1, 0.38, rot);                       // 長押
    // 瓦の笠：切妻に葺いた二枚の瓦の面（外と内へ傾け、軒は壁より張り出す）と、軒先の丸瓦の列の影、白い棟
    for (const sd of [1, -1]) {
      const g = new THREE.BoxGeometry(L + 0.02, 0.07, 0.62);
      const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (L + 0.02) / 0.9, uv.getY(k) * 0.62 / 0.9);
      g.translate(0, 0, sd * 0.29); g.rotateX(sd * 0.42); g.rotateY(rot); g.translate(mx, y + H + 0.16, mz);
      (ita ? B.wood : B.tile).push(paint(g, ita ? 0x75644c : 0xffffff));
      const nx0 = Math.sin(rot) * sd * 0.56, nz0 = Math.cos(rot) * sd * 0.56;
      kbox(B.iron, 0x1a1a1c, mx + nx0, y + H + 0.02, mz + nz0, L, 0.06, 0.05, rot);        // 軒先の瓦の口の影
    }
    kbox(ita ? B.wood : B.plaster, ita ? 0x574431 : 0xe2dccc, mx, y + H + 0.3, mz, L + 0.02, 0.1, 0.16, rot);              // 棟の漆喰
    kbox(ita ? B.wood : B.tile, ita ? 0x75644c : 0xffffff, mx, y + H + 0.37, mz, L + 0.02, 0.07, 0.2, rot);                // 棟瓦
  }
  // 狭間：三角・丸・四角を交互に（外と内の同じ所）
  const nx = -(bz - az) / len, nz = (bx - ax) / len;
  if (!o.tera) for (let k = 0; k < holes; k++) {
    const t = (k + 0.5) / holes, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = HY(x, z);
    // 矢狭間は縦 97×横 21cm の縦長（下端は腰の高さ）。鉄砲狭間は膝射ちの高さの丸か三角
    const gun = k % 2 === 0, hy = y + (gun ? 1.05 : 1.22), hs = gun ? 0.2 : 0.95;
    // 形：鉄砲狭間は丸か三角、矢狭間は縦長の四角。外の面は縁取りが少し厚い
    const shape = gun ? (k % 4 === 0 ? 'maru' : 'sankaku') : 'shikaku';
    for (const s of [1, -1]) {
      const fo = shikkui || o.tera ? 0.185 : 0.21, px = x + nx * s * fo, pz = z + nz * s * fo;
      if (shape === 'shikaku') kbox(B.iron, 0x0e0d0c, px, hy, pz, 0.2, hs, 0.03, rot);
      else {
        const g = new THREE.CylinderGeometry(0.12, 0.12, 0.03, shape === 'maru' ? 10 : 3);
        g.rotateX(Math.PI / 2); if (shape === 'sankaku') g.rotateZ(Math.PI / 2 * 0 + Math.PI); g.rotateY(rot); g.translate(px, hy, pz); B.iron.push(paint(g, 0x0e0d0c));
      }
      if (s === 1) kbox(shikkui ? B.plaster : B.tsuchi, shikkui ? 0xe6e0d2 : 0xd8ccb0, x + nx * (shikkui ? 0.18 : 0.205), hy, z + nz * (shikkui ? 0.18 : 0.205), 0.32, (shape === 'shikaku' ? hs : 0.24) + 0.08, 0.02, rot);
    }
  }
  // 控柱：o.hikae（1 = 進む向きの左手側・-1 = 右手側。城の内の側を渡す）に 1.8m ごと、壁から 0.9m 離して立て、壁と貫で結ぶ（上に小さな板の笠）
  const hs = o.hikae || 0;
  if (hs) for (let k = 0; k < Math.max(1, Math.round(len / 1.8)); k++) {
    const t = (k + 0.5) / Math.max(1, Math.round(len / 1.8)), x = ax + (bx - ax) * t + nx * hs * 0.95, z = az + (bz - az) * t + nz * hs * 0.95, y = HY(x, z);
    kbox(B.nozura, 0x8a857a, x, y + 0.05, z, 0.42, 0.2, 0.42, rot, 1.4);
    kbox(B.wood, vary(0x3e3228, k), x, y + 0.85, z, 0.18, 1.7, 0.18, rot);
    for (const hy of [0.7, 1.45]) kbox(B.wood, 0x33291f, x - nx * hs * 0.42, y + hy, z - nz * hs * 0.42, 0.1, 0.14, 0.95, rot);
    kbox(B.wood, 0x2c2622, x, y + 1.74, z, 0.3, 0.06, 0.3, rot);
  }
  // 桟敷：城攻めに備えて土塀の内に板の足場を組み、上に置盾を並べる（『甲冑と戦国の攻城兵器』）。
  // 床は人の頭より上（2m）にして、塀ぎわの兵は下をくぐれる。o.sajikiC（曲輪の真ん中）の側を内とする。長さ 7m 以上の区画の中ほどだけ
  if (o.sajikiC && !o.tera && len >= 7) {
    const sdi = ((o.sajikiC.x - (ax + bx) / 2) * nx + (o.sajikiC.z - (az + bz) / 2) * nz) > 0 ? 1 : -1;
    const t0 = 0.2, t1 = 0.8, n2 = Math.max(2, Math.round(len * (t1 - t0) / 1.8)), DW = 1.5, DY = 2.0;
    const at = (t, d) => [ax + (bx - ax) * t + nx * sdi * d, az + (bz - az) * t + nz * sdi * d];
    for (let k = 0; k <= n2; k++) {
      const t = t0 + (t1 - t0) * k / n2;
      for (const d of [0.35, DW]) { const [px, pz] = at(t, d), y = HY(px, pz); kbox(B.wood, vary(0x4a3c2c, k), px, y + DY / 2, pz, 0.13, DY + 0.2, 0.13, rot); }
      const [bxm, bzm] = at(t, (0.35 + DW) / 2); kbox(B.wood, 0x3e3226, bxm, HY(bxm, bzm) + DY - 0.1, bzm, 0.12, 0.14, DW - 0.2, rot);   // 床の梁
    }
    const [mx, mz] = at((t0 + t1) / 2, (0.25 + DW) / 2), my = HY(mx, mz) + DY;
    for (const sd of [0, 1]) {   // 床板（二列）
      const [px, pz] = at((t0 + t1) / 2, 0.25 + (sd + 0.5) * (DW - 0.25) / 2);
      kbox(B.wood, vary(0x6a5a44, sd + 3), px, my, pz, len * (t1 - t0) + 0.3, 0.06, (DW - 0.25) / 2 - 0.02, rot);
    }
    // 置盾：塀の笠より上へ、表を外へ向けて並べる（琵琶枝で立てる）
    const face = Math.atan2(-nx * sdi, -nz * sdi), nt = Math.max(2, Math.round(len * (t1 - t0) / 0.56));
    for (let k = 0; k < nt; k++) {
      const [px, pz] = at(t0 + (t1 - t0) * (k + 0.5) / nt, 0.42), g = hiraTateGeo(k % 3 === 1 ? 'sama' : 'mon').clone();
      g.rotateY(face); g.translate(px, HY(px, pz) + DY + 0.03, pz); B.wood.push(g);
    }
    // 掛けた梯子（内の地面から床の縁へ）
    { const [lx, lz] = at(t0 + 0.04, DW + 1.0), [tx2, tz2] = at(t0 + 0.04, DW), y0 = HY(lx, lz);
      for (const o2 of [-0.25, 0.25]) { const ex = (bx - ax) / len * o2, ez = (bz - az) / len * o2; B.wood.push(paint(logGeo([lx + ex, y0 - 0.05, lz + ez], [tx2 + ex, HY(tx2, tz2) + DY + 0.4, tz2 + ez], 0.035, 0.03, 5), 0x5a4a36)); }
      for (let r = 1; r < 6; r++) { const f = r / 6, rx = lx + (tx2 - lx) * f, rz = lz + (tz2 - lz) * f; kbox(B.wood, 0x6a5a44, rx, y0 + (HY(tx2, tz2) + DY + 0.4 - y0) * f, rz, 0.55, 0.04, 0.05, rot); } }
  }
  return kitMesh(B, true, o.batch);
}

// 築地塀（寺や御所の塀）：土塀と同じ瓦の笠と腰の石で、狭間と下見板の無い厚い土の壁
export function tsuiji(world, seg, o = {}) { return dobei(world, seg, { ...o, tera: true, h: o.h || 2.6 }); }

// 隅櫓（二重櫓）：石垣の台・下見板の一重・白壁の二重・瓦の屋根。石落としと格子窓。rot で正面の向き
// 四枚の壁（箱の代わり。中に入れる櫓）：外の面は hex、内の面は暗い板（覗くと中が暗く見える）。±z の面に穴を開ける
// holes：[{ t（面に沿う位置）, w, y0, y1（壁の下からの高さ）}]。P：Lr の局所→世界。y：壁の下の高さ、w×d の外のり、h の高さ
function holedWalls(B, key, hex, P, rot, y, w, d, h, holes, uvk = 0) {
  const T = 0.1;
  const slab = (lx, lz, ww, hh, dd, yy, inner) => { const [px, pz] = P(lx, lz); kbox(inner ? B.wood : B[key], inner ? 0x2a2119 : hex, px, yy, pz, ww, hh, dd, rot, inner ? 0 : uvk, !inner && key === 'plaster'); };
  for (const sx of [-1, 1]) { slab(sx * (w / 2 - T / 2), 0, T, h, d, y + h / 2); slab(sx * (w / 2 - T - 0.02), 0, 0.03, h, d - 2 * T, y + h / 2, true); }
  for (const sz of [-1, 1]) {
    const hs = holes.filter(o => o.side == null || o.side === sz).map(o => ({ t0: o.t - o.w / 2, t1: o.t + o.w / 2, y0: o.y0, y1: o.y1 }));
    for (const [t0, t1, a0, a1] of facePanels(w - 2 * T, h, hs)) {
      slab((t0 + t1) / 2, sz * (d / 2 - T / 2), t1 - t0, a1 - a0, T, y + (a0 + a1) / 2);
      slab((t0 + t1) / 2, sz * (d / 2 - T - .02), t1 - t0, a1 - a0, .03, y + (a0 + a1) / 2, true);
    }
  }
}
export function sumiyagura(world, x, z, o = {}) {
  const managed = o.inside != null;
  o = { ...o, inside: o.inside !== false };
  const rot = o.rot || 0, w = o.w || 6, d = o.d || 5, B = kit();
  const y = world.heightAt(x, z) - 0.3;
  const base = o.base ?? 2.2;
  solidRect(x, z, w + 1.6, d + 1.6, rot, o.inside ? y + base - 0.3 : null);   // 中に入れる時（castle_parts）は台の高さまでだけ
  const P = Lr(x, z, rot);
  // 台の石垣（四方へ少し裾を広げる）
  stoneBase(B, world, o.stone || 'nozura', x, z, w + 1.2, d + 1.2, rot, base + 0.3);
  let yy = y + base;
  // 一重：腰は下見板、上は白壁
  if (o.inside) {
    // 中に入れる櫓：箱でなく四枚の壁にして、格子窓（±z の面）を本当に開ける（狭間から人と筒先が見える。kaito 10/2）
    holedWalls(B, 'shitami', 0xa8a298, P, rot, yy, w, d, 2.0, [{ side: 1, t: -w * 0.18, w: 1.1, y0: 0, y1: 2.0 }], 2);
    holedWalls(B, 'plaster', 0xcdc6b4, P, rot, yy + 2.0, w, d, 1.0, [-1, 1].map((q) => ({ t: q * w * 0.25, w: 0.9, y0: 0.2, y1: 0.7 })));
  } else {
    kbox(B.shitami, 0xa8a298, x, yy + 1.0, z, w, 2.0, d, rot, 2);
    kbox(B.plaster, 0xcdc6b4, x, yy + 2.5, z, w, 1.0, d, rot, 0, true);
  }
  // 格子窓と石落とし
  for (const s of [-1, 1]) {
    for (const q of [-1, 1]) { const [wx, wz] = P(q * w * 0.25, s * (d / 2 + 0.02)); if (!o.inside) kbox(B.iron, 0x121110, wx, yy + 2.45, wz, 0.9, 0.5, 0.04, rot); for (const b of o.inside ? [-1.6, 0, 1.6] : [-2, -1, 0, 1, 2]) { const [lx, lz] = P(q * w * 0.25 + b * 0.18, s * (d / 2 + 0.05)); kbox(B.wood, 0x3a2e24, lx, yy + 2.45, lz, 0.05, 0.54, 0.04, rot); } }
  }
  { const [sx, sz] = P(w / 2 - 0.6, d / 2 + 0.35); kbox(B.plaster, 0xe0dac8, sx, yy + 1.6, sz, 1.4, 1.0, 0.7, rot); kbox(B.iron, 0x0c0b0a, sx, yy + 1.08, sz, 1.2, 0.04, 0.55, rot); }
  // 中に入れる櫓：一重目の屋根の頂が二重目の床（+3.35）から出て、二階の部屋に瓦の山が立つので、床の下に収める（B102）
  if (o.inside) ktile(B.tile, B.plaster, x, yy + 2.72, z, w + 1.8, d + 1.8, 0.55, rot, 0.9, true);
  else ktile(B.tile, B.plaster, x, yy + 3.0, z, w + 1.8, d + 1.8, 0.9, rot, 0.9);
  yy += 3.35;
  const w2 = w * 0.72, d2 = d * 0.72;
  if (o.inside) {
    holedWalls(B, 'plaster', 0xd0c9b8, P, rot, yy + 0.7, w2, d2, 1.5, [{ t: 0, w: 1.1, y0: 0.38, y1: 0.92 }]);
    holedWalls(B, 'shitami', 0xa8a298, P, rot, yy, w2 + 0.04, d2 + 0.04, 0.7, [], 2);
  } else {
    kbox(B.plaster, 0xd0c9b8, x, yy + 1.1, z, w2, 2.2, d2, rot, 0, true);
    kbox(B.shitami, 0xa8a298, x, yy + 0.35, z, w2 + 0.02, 0.7, d2 + 0.02, rot, 2);
  }
  for (const s of [-1, 1]) {
    const [wx, wz] = P(0, s * (d2 / 2 + 0.02)); if (!o.inside) kbox(B.iron, 0x121110, wx, yy + 1.35, wz, 1.1, 0.55, 0.04, rot);
    // 格子（太い木の縦格子）と、窓の上下の白い額縁
    for (const bq of o.inside ? [-1.8, 0, 1.8] : [-2, -1, 0, 1, 2]) { const [lx, lz] = P(bq * 0.2, s * (d2 / 2 + 0.05)); kbox(B.wood, 0x3a2e24, lx, yy + 1.35, lz, 0.07, 0.6, 0.06, rot); }
    for (const hy of [1.06, 1.64]) { const [fx, fz] = P(0, s * (d2 / 2 + 0.05)); kbox(B.plaster, 0xe6e0d0, fx, yy + hy, fz, 1.3, 0.08, 0.08, rot); }
  }
  ktile(B.tile, B.plaster, x, yy + 2.2, z, w2 + 1.9, d2 + 1.9, 1.5, rot, 0.4);
  // 棟の鯱
  // 鯱は棟の両端に（前は二重目の壁の端の上＝隅棟の斜面の上に浮いていた）
  { const rl2 = Math.max(0.3, (w2 - d2) / 2 + 0.4); for (const s of [-1, 1]) { const [cx, cz] = P(s * (rl2 + 0.1), 0); kbox(B.iron, 0x2a2622, cx, yy + 2.2 + 1.5 + 0.3, cz, 0.18, 0.55, 0.26, rot); } }
  if (!managed) sumiInside(world, x, z, o);
  return kitMesh(B, true, o.batch);
}

// 板葺の切妻（棟は局所の x に沿う）：軒の高さ y、幅 L・奥行き D・高さ h。長い板を段に重ね、押さえの竹と石、箱棟
function itaGable(B, P, rot, y, L, D, h) {
  const ang = Math.atan2(h, D / 2), sl = Math.hypot(h, D / 2) + 0.15, NR = 4;
  for (const s of [1, -1]) {
    for (let q = 0; q < NR; q++) {
      const t = (q + 0.5) / NR, g = new THREE.BoxGeometry(L, 0.05, sl / NR + 0.12);
      g.rotateX(s * ang); const [cx, cz] = P(0, s * (D / 2) * (1 - t));
      g.rotateY(rot); g.translate(cx, y + h * t + 0.04 + (q % 2) * 0.015, cz); B.wood.push(paint(g, vary(0x5c564a, q + (s > 0 ? 0 : 5))));
      if (true) {
        // 長い一枚板の帯を、目地をずらした小幅の葺き板に見せる。裏と厚みは既存の帯を共用。
        // 一枚二三角の表だけを木材の束に結合し、描く回数を増やさない。
        const count = Math.ceil(L / .55), step = L / count, depth = sl / NR + .12;
        const tone = new THREE.Color();
        for (let i = -1; i < count; i++) {
          const a = Math.max(-L / 2, -L / 2 + (i + (q % 2) * .5) * step);
          const b = Math.min(L / 2, -L / 2 + (i + 1 + (q % 2) * .5) * step);
          if (b - a < .02) continue;
          const plank = paint(new THREE.PlaneGeometry(b - a - .009, depth), 0x81745f);
          const p = plank.attributes.position, c = plank.attributes.color;
          const seed = h01(i + q * 23, s + 4), hex = seed > .83 ? 0x96764f : 0x817967;
          for (let k = 0; k < p.count; k++) {
            tone.setHex(hex).multiplyScalar((.82 + seed * .2) * (p.getY(k) * s < 0 ? .78 : 1));
            c.setXYZ(k, tone.r, tone.g, tone.b);
          }
          plank.rotateX(-Math.PI / 2); plank.translate((a + b) / 2, .028, 0);
          plank.rotateX(s * ang); plank.rotateY(rot);
          plank.translate(cx, y + h * t + .04 + (q % 2) * .015, cz); B.wood.push(plank);
        }
      }
    }
    for (const t of [0.3, 0.7]) {
      const g = new THREE.CylinderGeometry(0.045, 0.045, L + 0.1, 5); g.rotateZ(Math.PI / 2); const [cx, cz] = P(0, s * (D / 2) * (1 - t));
      g.rotateY(rot); g.translate(cx, y + h * t + 0.1, cz); B.wood.push(paint(g, 0x4a443a));
      for (let k = -2; k <= 2; k++) { const [sx, sz] = P(k * L / 5.2, s * (D / 2) * (1 - t)); const st = new THREE.DodecahedronGeometry(0.15, 0); st.translate(sx, y + h * t + 0.17, sz); B.nozura.push(paint(st, 0x77736a)); }
    }
  }
  const [rx, rz] = P(0, 0); kbox(B.wood, 0x4a443a, rx, y + h + 0.1, rz, L + 0.1, 0.22, 0.32, rot);
}

// 櫓門：門柱の上に渡櫓（白壁と下見板・格子窓）を渡し、瓦の屋根。w は通り道の幅。当たりは門柱と両脇の石垣だけ（通り道は空ける）
// o.earth（石垣の無い城・砦）：『甲冑と戦国の攻城兵器』の門櫓のとおり、脇は土の台、渡櫓は板壁、屋根は板葺の切妻
export function yaguramon(world, x, z, w = 5, rot = 0, o = {}) {
  const managed = o.inside != null;
  o = { ...o, inside: o.inside !== false };
  const B = kit(), P = Lr(x, z, rot);
  // 買った素材の部品が読めていれば、脇の石垣の台と渡櫓の白壁を部品で組む（当たり・hp・通れる幅は変えない）。入れ物（batch）の時は旧いまま
  const KB = !o.earth && !o.batch && !o.noKit && cgtOn() && cgtHas('Wall_White_Window') && cgtSpend(60000) ? new KitBatch() : null;
  const y = o.inside ? interiorBase(world, x, z, w + 5.6, 4.2, rot) : world.heightAt(x, z);
  for (const sx of [-1, 1]) {
    const [px, pz] = P(sx * (w / 2 + 1.4), 0);
    // 中に入れる櫓門は脇の台の奥行きを詰める（2.8m）。前は 4m あり、門の前後へ 2m ずつ張り出した台と塀の角の間に、
    // 寄せ手が詰まる袋の角ができていた（高遠の大手の枡形・bot の「進めない」(5,-66)・(7,-59)。10/2）
    const bd = o.inside ? 2.8 : 4;
    solidRect(px, pz, 2.6, bd, rot, o.inside ? y + 3.7 : null);   // 中に入れる時は、渡櫓の床の上は素通し
    // 脇の台：石垣（安土のころから）か、o.earth の時は土の城の、下見板を張った土壁の台
    if (o.earth) {
      const gy = world.heightAt(px, pz);
      if (true) {
        // 写真の門脇は白い台ではなく板囲い。既存の台と同じ寸法で、裾は泥で暗くする。
        kbox(B.shitami, 0x786a55, px, gy + 1.2, pz, 2.6, 3.0, bd, rot, 1.6);
        kbox(B.wood, 0x514636, px, gy + .05, pz, 2.62, .3, bd + .02, rot);
        for (const side of [-1, 1]) {
          const [fx, fz] = P(sx * (w / 2 + 1.4), side * (bd / 2 + .025));
          kbox(B.wood, 0x584b3b, fx, gy + 2.65, fz, 2.6, .14, .1, rot);
        }
      } else kbox(B.tsuchi, 0xe8dcc6, px, gy + 1.2, pz, 2.6, 3.0, bd, rot, 1.6);
    }   // 土の台を囲う板。通れる幅と当たりは共通。
    else if (KB) kitStoneRect(KB, px, pz, 2.6, bd, rot, world.heightAt(px, pz) - 0.3 + 2.9, world.heightAt(px, pz) - 0.6);
    else stoneBase(B, world, o.stone || 'nozura', px, pz, 2.6, bd, rot, 2.9);
    const [cx, cz] = P(sx * (w / 2 + 0.1), 0);
    kbox(B.wood, 0x3e2e22, cx, y + 1.9, cz, 0.45, 3.8, 0.45, rot);
  }
  const Lw = w + 5.6;
  if (!o.inside) kbox(B.wood, 0x3a2a1c, x, y + 3.85, z, Lw, 0.3, 4.2, rot);
  if (KB && !o.inside) kitGateWalls(KB, P, rot, y + 4.0, Lw - 0.2, 3.8);
  else if (o.inside || (o.earth && true)) {
    // 渡櫓の中に入れる：四枚の壁にし、格子窓を本当に開ける（狭間から人と筒先が見える。kaito 10/2）
    // 中へ入らない土の門も、黒い札の窓ではなく奥行きのある開口と格子にする。
    const doors = o.inside ? [{ side: 1, t: Lw / 2 - 1.2, w: 1.1, y0: 0, y1: 1.0 }] : [];
    holedWalls(B, 'shitami', 0xa8a298, P, rot, y + 4.0, Lw - 0.2, 3.8, 1.0, doors, 2);
    holedWalls(B, 'plaster', 0xcdc6b4, P, rot, y + 5.0, Lw - 0.2, 3.8, 1.0, [...[-1, 0, 1].map((q) => ({ t: q * 2.4, w: 1.0, y0: 0.15, y1: 0.65 })), ...doors.map(d => ({ ...d, y1: 0.85 }))]);
    for (const s of [-1, 1]) for (const q of [-1, 0, 1]) for (const b of [-0.32, 0, 0.32]) { const [lx, lz] = P(q * 2.4 + b, s * 1.92); kbox(B.wood, 0x3a2e24, lx, y + 5.4, lz, 0.06, 0.5, 0.05, rot); }
  } else {
    kbox(B.shitami, 0xa8a298, x, y + 4.5, z, Lw - 0.2, 1.0, 3.8, rot, 2);
    kbox(B.plaster, 0xcdc6b4, x, y + 5.5, z, Lw - 0.2, 1.0, 3.8, rot);
    for (const s of [-1, 1]) for (const q of [-1, 0, 1]) { const [wx, wz] = P(q * 2.4, s * 1.92); kbox(B.iron, 0x121110, wx, y + 5.4, wz, 1.0, 0.5, 0.04, rot); }
  }
  // 冠木（太い横木）と、柱の根巻きの金具・鎹
  kbox(B.wood, 0x33261b, x, y + 3.55, z, w + 1.2, 0.45, 0.5, rot);
  for (const sx of [-1, 1]) { const [cx, cz] = P(sx * (w / 2 + 0.1), 0); kbox(B.iron, 0x1a1816, cx, y + 0.35, cz, 0.52, 0.6, 0.52, rot); kbox(B.iron, 0x1a1816, cx, y + 3.2, cz, 0.5, 0.14, 0.5, rot); }
  // 扉（開いたまま、内へ）：縦の板に、黒い鉄の帯と乳金物（o.doors === false の時は描かない。閉じた扉は tobira を別に置く）
  if (o.doors !== false) for (const sx of [-1, 1]) {
    const [dx, dz] = P(sx * (w / 2 - 0.2), -1.4); kbox(B.wood, 0x3a2c20, dx, y + 1.6, dz, 0.18, 3.2, 2.4, rot);
    for (const yy of [0.5, 1.6, 2.7]) kbox(B.iron, 0x161412, dx, y + yy, dz, 0.22, 0.14, 2.42, rot);
    for (const zz of [-0.8, 0, 0.8]) for (const yy of [0.5, 1.6, 2.7]) { const [nx2, nz2] = P(sx * (w / 2 - 0.2) + sx * 0.12, -1.4 + zz); kbox(B.iron, 0x201d1a, nx2, y + yy, nz2, 0.06, 0.12, 0.12, rot); }
  }
  // 木組み：門柱の後ろの控柱と、門柱と結ぶ貫（上下二段）。控柱の根にも金具
  for (const sx of [-1, 1]) {
    const [bx2, bz2] = P(sx * (w / 2 + 0.1), -1.6);
    kbox(B.wood, 0x3a2b20, bx2, y + 1.3, bz2, 0.3, 2.6, 0.3, rot);
    kbox(B.iron, 0x1a1816, bx2, y + 0.25, bz2, 0.36, 0.4, 0.36, rot);
    for (const hy of [0.9, 2.4]) { const [mx2, mz2] = P(sx * (w / 2 + 0.1), -0.8); kbox(B.wood, 0x33261b, mx2, y + hy, mz2, 0.16, 0.22, 1.7, rot); }
  }
  // 渡櫓の床を支える腕木（梁の先が表に並ぶ）と、軒下の出桁
  for (let q = -4; q <= 4; q++) for (const s2 of [-1, 1]) { const [ax2, az2] = P(q * Lw / 9, s2 * 2.15); kbox(B.wood, 0x2e2219, ax2, y + 3.95, az2, 0.18, 0.2, 0.5, rot); }
  for (const s2 of [-1, 1]) { const [ex, ez] = P(0, s2 * 2.3); kbox(B.wood, 0x2a1f17, ex, y + 5.92, ez, Lw + 0.6, 0.16, 0.16, rot); }
  if (o.earth) {
    // 板壁：白壁と下見板の部品を、縦の板を張った灰茶の板壁の色に（形と窓の穴はそのまま）
    for (const k of ['plaster', 'shitami']) { for (const g of B[k]) B.wood.push(paint(g, vary(0x6e604c, B.wood.length))); B[k] = []; }
    if (true) {
      // 切妻の端を板壁で棟まで閉じる。左右二枚の楔で屋根の勾配に合わせる。
      // 屋根の軒は壁より深いので、妻の端にも屋根の下まで板を残す。
      const end = new THREE.BoxGeometry(.12, 1, 1.9);
      for (const side of [-1, 1]) for (const half of [-1, 1]) {
        const g = end.clone(), p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const lz = p.getZ(i) + half * .95;
          p.setZ(i, lz);
          p.setY(i, p.getY(i) > 0 ? 1.3 * (1 - Math.abs(lz) / 2.7) - .04 : 0);
        }
        g.computeVertexNormals(); g.rotateY(rot);
        const [px, pz] = P(side * (Lw / 2 - .1), 0);
        g.translate(px, y + 6, pz); B.wood.push(paint(g, 0x6e604c));
      }
      end.dispose();
      for (const side of [-1, 1]) for (let i = -4; i <= 4; i++) {
        const lz = i * .38, h = 1.3 * (1 - Math.abs(lz) / 2.7) - .06;
        const [px, pz] = P(side * (Lw / 2 - .025), lz);
        kbox(B.wood, vary(0x594e40, i + 5), px, y + 6 + h / 2, pz, .04, h, .035, rot);
      }
      // 写真の縦板の目地を押縁で出す。窓の手前は空け、既存の木材の束へ結合する。
      const count = Math.ceil((Lw - .2) / .4), step = (Lw - .2) / count;
      // 押縁だけでは壁一面が同じ板に見える。板ごとの日焼けと、下端に残る雨染みを薄い表面に描く。
      // 窓と戸口の端で割り、開口は埋めない。共通の木材へ結合し、描画回数は増やさない。
      const face = new THREE.PlaneGeometry(1, 1), tone = new THREE.Color();
      for (const side of [-1, 1]) {
        const cuts = [-(Lw - .2) / 2, (Lw - .2) / 2];
        for (let i = 1; i < count; i++) cuts.push(-(Lw - .2) / 2 + i * step);
        for (const q of [-2.4, 0, 2.4]) cuts.push(q - .5, q + .5);
        const doorX = Lw / 2 - 1.2;
        if (o.inside && side === 1) cuts.push(doorX - .55, doorX + .55);
        cuts.sort((a, b) => a - b);
        const rows = [0, 1, 1.15, 1.65, 1.85, 2];
        for (let i = 1; i < cuts.length; i++) for (let j = 1; j < rows.length; j++) {
          const a = cuts[i - 1], b = cuts[i], lx = (a + b) / 2;
          const bottom = rows[j - 1], top = rows[j], mid = (bottom + top) / 2;
          if (b - a < .005 || (mid > 1.15 && mid < 1.65 && [-2.4, 0, 2.4].some(q => Math.abs(lx - q) < .5))) continue;
          if (o.inside && side === 1 && Math.abs(lx - doorX) < .55 && mid < 1.85) continue;
          const board = Math.floor((lx + (Lw - .2) / 2) / step);
          const g = paint(face.clone(), 0x817663), p = g.attributes.position, c = g.attributes.color;
          const shade = .85 + h01(board + 9, side + 2) * .25;
          for (let k = 0; k < p.count; k++) {
            const up = p.getY(k) > 0 ? top : bottom;
            tone.setHex(0x817663).lerp(MUD, Math.max(0, 1 - up / .65) * .36).multiplyScalar(shade);
            c.setXYZ(k, tone.r, tone.g, tone.b);
          }
          g.scale(b - a, top - bottom, 1); g.rotateY(rot + (side < 0 ? Math.PI : 0));
          const [px, pz] = P(lx, side * 1.906);
          g.translate(px, y + 4 + mid, pz); B.wood.push(g);
        }
      }
      face.dispose();
      for (const side of [-1, 1]) for (let i = 1; i < count; i++) {
        const lx = -(Lw - .2) / 2 + i * step, [px, pz] = P(lx, side * 1.91);
        if (o.inside && side === 1 && Math.abs(lx - (Lw / 2 - 1.2)) < .6) continue;
        const tone = vary(0x594e40, i);
        kbox(B.wood, tone, px, y + 4.5, pz, .035, .98, .045, rot);
        if (![-2.4, 0, 2.4].some(q => Math.abs(lx - q) < .58))
          kbox(B.wood, tone, px, y + 5.5, pz, .035, .96, .045, rot);
      }
      for (const side of [-1, 1]) {
        for (let i = 1; i < 10; i++) {
          const [px, pz] = P(side * (Lw / 2 - .08), -1.9 + i * .38);
          kbox(B.wood, vary(0x594e40, i), px, y + 5, pz, .045, 1.96, .035, rot);
        }
        // 中へ入れる門の戸口には横材を渡さない。
        if (!(o.inside && side === 1)) {
          const [px, pz] = P(0, side * 1.93);
          kbox(B.wood, 0x4c4032, px, y + 4.04, pz, Lw - .2, .12, .1, rot);
        }
      }
    }
    itaGable(B, P, rot, y + 6.0, Lw + 1.4, 5.4, 1.3);
  } else ktile(B.tile, B.plaster, x, y + 6.0, z, Lw + 1.6, 5.6, 1.6, rot, 0.3);
  if (!managed) gateInside(world, x, z, w, rot, o);
  const out = kitMesh(B, true, o.batch);
  if (KB && !out.isBatchedPart) out.add(KB.build());
  return out;
}

// 多聞櫓：石垣の上に長く続く一重の櫓（塀の代わりに城の縁を囲う長屋）。seg に沿い、進む向きの左手（o.out = -1 で右手）が外。
// 外の面に野面の石垣（隅は算木積み）、腰は下見板・上は白壁、格子窓と、ところどころ石落とし。屋根は反った瓦の寄棟。
// o.d：奥行き（既定 4.5）、o.base：石垣の高さ（既定 2.4）、o.stone：石の積み方
export function tamon(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az), B = kit();
  const d = o.d || 4.5, side = o.out || 1;
  const tx = (bx - ax) / len, tz = (bz - az) / len, nx = -tz * side, nz = tx * side;
  const cx = (ax + bx) / 2 - nx * d / 2, cz = (az + bz) / 2 - nz * d / 2, rot = Math.atan2(-(bz - az), bx - ax);
  const top = stoneBase(B, world, o.stone || 'nozura', cx, cz, len, d, rot, o.base ?? 2.4);
  solidRect(cx, cz, len + .4, d + .4, rot, top - .1);
  const P = Lr(cx, cz, rot), fw = nx * Math.sin(rot) + nz * Math.cos(rot) > 0 ? 1 : -1;   // 外の面が局所の +z か -z か
  const y = top + 0.14;
  const nwin = Math.max(1, Math.round(len / 2.6));
  const doorX = -len / 2 + Math.min(1.2, len / 2);
  const door = { side: -fw, t: doorX, w: 1.1, y0: 0, y1: 1.6 };
  holedWalls(B, 'shitami', 0xa8a298, P, rot, y, len, d, 1.6, [door], 2);
  const windows = Array.from({ length: nwin }, (_, q) => ({ t: -len / 2 + (q + .5) * len / nwin, w: 1, y0: .22, y1: .78 }));
  holedWalls(B, 'plaster', 0xcdc6b4, P, rot, y + 1.6, len, d, 1.1, [...windows, { ...door, y1: .4 }]);
  for (let q = 0; q < nwin; q++) {
    const lx = -len / 2 + (q + 0.5) * len / nwin;
    for (const s2 of [-1, 1]) {
      // 格子の間は塞がず、渡櫓の中から外が見える。
      for (let bq = -2; bq <= 2; bq++) { const [gx, gz] = P(lx + bq * 0.2, s2 * (d / 2 + 0.05)); kbox(B.wood, 0x3a2e24, gx, y + 2.1, gz, 0.07, 0.6, 0.06, rot); }
      for (const hy of [1.8, 2.42]) { const [fx, fz] = P(lx, s2 * (d / 2 + 0.05)); kbox(B.plaster, 0xe6e0d0, fx, y + hy, fz, 1.2, 0.07, 0.08, rot); }
    }
    // 外の面の狭間（丸と三角）と、三つに一つの石落とし
    const [hx, hz] = P(lx + 1.1, fw * (d / 2 + 0.03)); const hg = new THREE.CylinderGeometry(0.12, 0.12, 0.04, q % 2 ? 10 : 3); hg.rotateX(Math.PI / 2); hg.rotateY(rot); hg.translate(hx, y + 1.2, hz); B.iron.push(paint(hg, 0x0e0d0c));
    if (q % 3 === 1) { const [sx, sz] = P(lx, fw * (d / 2 + 0.35)); kbox(B.plaster, 0xe0dac8, sx, y + 0.9, sz, 1.4, 1.0, 0.7, rot); kbox(B.iron, 0x0c0b0a, sx, y + 0.38, sz, 1.2, 0.04, 0.55, rot); }
  }
  ktile(B.tile, B.plaster, cx, y + 2.72, cz, len + 1.6, d + 1.8, 1.5, rot, 0.4);
  addInterior(world, { name: '渡櫓', kind: 'gate', profile: 'yagura', team: o.team, x: cx, z: cz, rot,
    levels: [{ y, w: len - .2, d: d - .2, h: 2.7 }], door: { side: -fw, lx: doorX, w: 1.1 },
    approach: { pad: .8, len: Math.max(2.4, (o.base ?? 2.4) * 1.15) },
    wins: () => windows.flatMap(v => [-1, 1].map(s => ({ face: 'z', s, t: v.t, w: v.w, y0: 1.82, y1: 2.38 }))),
  });
  return kitMesh(B, true, o.batch);
}

// 曲輪の中（中を歩ける城の地面の上）：土蔵・番所・井戸・兵糧の俵・槍立て・石灯籠を、曲輪の広さ w×d に合わせて置く。
// 真ん中は通り道として空ける。o.seed でばらつき、o.rot で向き、o.kura（土蔵の数）
export function kuruwa(world, cx, cz, w, d, o = {}) {
  const rot = o.rot || 0, B = kit(), P = Lr(cx, cz, rot);
  let sd = (o.seed || 7) >>> 0; const R = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  const grp = new THREE.Group();
  // 土蔵：黒い海鼠壁の腰・白い漆喰・瓦の置屋根・鉄の扉
  const nk = o.kura ?? Math.max(1, Math.round(w / 18));
  for (let i = 0; i < nk; i++) {
    const lx = -w / 2 + 5 + (i + 0.5) * (w - 10) / nk, lz = -d / 2 + 4.5;
    const [x, z] = P(lx, lz), y = world.heightAt(x, z), kw = 5.5 + R() * 1.5, kd = 4;
    solidRect(x, z, kw + 0.4, kd + 0.4, rot);
    kbox(B.nozura, 0x8a857a, x, y + 0.2, z, kw + 0.3, 0.5, kd + 0.3, rot, 1.4);
    kbox(B.shitami, 0x3a3834, x, y + 0.95, z, kw, 1.0, kd, rot, 2);
    kbox(B.plaster, 0xd6cfbe, x, y + 1.45 + 1.4, z, kw, 2.8, kd, rot);
    for (let q = -2; q <= 2; q++) { const [gx, gz] = P(lx + q * kw / 5.2, lz + kd / 2 + 0.02); kbox(B.plaster, 0xeae4d6, gx, y + 0.95, gz, 0.06, 0.95, 0.03, rot); }
    { const [dx, dz] = P(lx, lz + kd / 2 + 0.06); kbox(B.iron, 0x1c1a18, dx, y + 1.45, dz, 1.3, 2.1, 0.08, rot); kbox(B.plaster, 0xcfc8b6, dx, y + 2.75, dz, 1.8, 0.35, 0.3, rot); }
    ktile(B.tile, B.plaster, x, y + 4.25, z, kw + 1.2, kd + 1.2, 1.5, rot, 0.4);
  }
  // 番所：板葺きの小屋（柱と腰板、格子の窓）
  { const [x, z] = P(w / 2 - 5, d / 2 - 4), y = world.heightAt(x, z); solidRect(x, z, 4.4, 3.4, rot);
    kbox(B.wood, 0x4a3a2a, x, y + 1.1, z, 4, 2.2, 3, rot); for (const q of [-1, 1]) for (const r of [-1, 1]) { const [px, pz] = P(w / 2 - 5 + q * 2, d / 2 - 4 + r * 1.5); kbox(B.wood, 0x2e241a, px, y + 1.2, pz, 0.2, 2.4, 0.2, rot); }
    ktile(B.tile, B.plaster, x, y + 2.3, z, 5, 4, 1.0, rot, 0.4); }
  // 井戸（石の井筒と、つるべの屋根）
  { const [x, z] = P(-w / 2 + 6, d / 2 - 5), y = world.heightAt(x, z); solidCircle(x, z, 1);
    const ring = new THREE.CylinderGeometry(0.85, 0.9, 0.8, 12, 1, true); ring.translate(x, y + 0.4, z); B.nozura.push(paint(ring, 0x8a857a));
    for (const q of [-1, 1]) { const [px, pz] = P(-w / 2 + 6 + q * 0.9, d / 2 - 5); kbox(B.wood, 0x3a2c20, px, y + 1.2, pz, 0.14, 2.4, 0.14, rot); }
    ktile(B.tile, B.plaster, x, y + 2.35, z, 2.4, 1.4, 0.6, rot, 0.5); }
  // 槍立て（槍を並べて立てる木の枠）と兵糧の俵、石灯籠
  { const [x, z] = P(-w / 2 + 3, 0), y = world.heightAt(x, z); kbox(B.wood, 0x3a2c20, x, y + 0.9, z, 0.15, 0.12, 3.5, rot + Math.PI / 2); kbox(B.wood, 0x3a2c20, x, y + 0.3, z, 0.15, 0.12, 3.5, rot + Math.PI / 2);
    for (let q = 0; q < 9; q++) { const [sx, sz] = P(-w / 2 + 3, -1.6 + q * 0.4); kbox(B.wood, 0x5a4630, sx, y + 1.9, sz, 0.05, 3.8, 0.05, rot); kbox(B.iron, 0x9a9a98, sx, y + 3.95, sz, 0.04, 0.35, 0.04, rot); } }
  grp.add(kitMesh(B));
  { const [x, z] = P(w / 2 - 4, -d / 2 + 5); grp.add(tawara(world, x, z, rot, 8)); }
  // 素材の小道具（読めたら足す）：番所の脇の樽と木箱、井戸の脇の荷車
  { const L = (lx, lz, r = 0, n = 'barrel') => { const [x, z] = P(lx, lz); return { n, x, z, rot: rot + r }; };
    const add = (n, l) => extScatter(grp, n, l.filter((e) => e.n === n), world);
    const l = [L(w / 2 - 7.2, d / 2 - 3), L(w / 2 - 7.8, d / 2 - 2.3, 1), L(w / 2 - 7.4, d / 2 - 5.2, 0.4, 'crate'), L(-w / 2 + 9.5, d / 2 - 5.5, 1.2, 'cart')];
    for (const n of ['barrel', 'crate', 'cart']) add(n, l); }
  for (const q of [-1, 1]) {
    const [x, z] = P(q * 3.2, d / 2 - 2), y = world.heightAt(x, z), L = kit();
    kbox(L.nozura, 0x8a857a, x, y + 0.3, z, 0.7, 0.6, 0.7, rot, 1.4); kbox(L.nozura, 0x8a857a, x, y + 0.9, z, 0.3, 0.6, 0.3, rot, 1.4);
    kbox(L.uchikomi, 0x9a958a, x, y + 1.45, z, 0.6, 0.5, 0.6, rot, 1.4); const cap = new THREE.ConeGeometry(0.62, 0.4, 4); cap.rotateY(Math.PI / 4 + rot); cap.translate(x, y + 1.9, z); L.uchikomi.push(paint(cap, 0x8e897d));
    grp.add(kitMesh(L));
  }
  return grp;
}

// 曲輪の中の建物を一つ（castle_plan の autoKuruwaLife が縁の内に並べる）。kind：'kura'（土蔵）・'bansho'（番所）・'ido'（井戸）・
// 'umaya'（厩：前を開け放った長屋に馬栓棒と飼い葉桶）。前（入口）は局所の +z（rot の向き）。当たりは足もとの四角。
// o.batch：城の kit の入れ物（makeKitBatch）。o.one：画質「低」。材質を木一つにまとめる（描く回数を増やさない）
export function kuruwaBldg(world, kind, x, z, rot = 0, o = {}) {
  const B = kit(), P = Lr(x, z, rot), y = world.heightAt(x, z);
  // 指定した山城だけ板の継ぎ目と押縁を作る。材質と描画の束は既存の木と共用。
  const boardRoof = o.ita && o.boardRoof === true && true;
  const timberStore = o.ita && o.timberStore === true && true;
  const openStable = kind === 'umaya' && o.openStable === true && SETTINGS.quality === 'high';
  const roof = (ry, w, d, h) => {
    if (!o.ita) { ktile(B.tile, B.plaster, x, ry, z, w, d, h, rot, 0.4); return; }
    if (boardRoof) {
      const n = Math.min(26, Math.ceil(w / .42)), angle = Math.atan2(h, d / 2);
      const plank = new THREE.BoxGeometry(w / n - .008, .07, Math.hypot(d / 2, h));
      for (const sd of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          const g = plank.clone();
          g.rotateX(sd * angle);
          g.translate(-w / 2 + (i + .5) * w / n, h / 2 + (i % 3) * .006, sd * d / 4);
          g.rotateY(rot); g.translate(x, ry, z);
          B.wood.push(paint(g, vary(i % 7 === 3 ? 0x947657 : 0x756b59, i + x * 3 + z)));
        }
        for (const t of [.3, .72]) {
          const [px, pz] = P(0, sd * d * t / 2);
          kbox(B.wood, 0x514333, px, ry + h * (1 - t) + .09, pz, w + .08, .09, .10, rot);
        }
      }
      plank.dispose();
      kbox(B.wood, 0x584735, x, ry + h + .07, z, w + .16, .13, .16, rot);
      return;
    }
    // 二枚の厚い板屋根。低画質も同じ木の材質へまとめる。
    for (const sd of [-1, 1]) {
      const g = new THREE.BoxGeometry(w, 0.12, Math.hypot(d / 2, h));
      g.rotateX(sd * Math.atan2(h, d / 2)); g.translate(0, h / 2, sd * d / 4);
      g.rotateY(rot); g.translate(x, ry, z); B.wood.push(paint(g, 0x5c5244));
    }
  };
  let fw = 4, fd = 4;
  if (kind === 'kura') {
    const kw = 5.4, kd = 4; fw = kw; fd = kd;
    kbox(timberStore ? B.wood : B.nozura, timberStore ? 0x4b4032 : 0x8a857a, x, y + 0.2, z, kw + 0.3, 0.5, kd + 0.3, rot, timberStore ? 0 : 1.4);
    kbox(timberStore ? B.wood : B.shitami, timberStore ? 0x5d503d : 0x3a3834, x, y + 0.95, z, kw, 1.0, kd, rot, timberStore ? 0 : 2);
    kbox(o.ita ? B.wood : B.plaster, o.ita ? 0x75634c : 0xd6cfbe, x, y + 1.45 + 1.4, z, kw, 2.8, kd, rot);
    { const [dx, dz] = P(0, kd / 2 + 0.06); kbox(timberStore ? B.wood : B.iron, timberStore ? 0x4c3b2b : 0x1c1a18, dx, y + 1.45, dz, 1.3, 2.1, 0.08, rot); kbox(timberStore ? B.wood : B.plaster, timberStore ? 0x594733 : 0xcfc8b6, dx, y + 2.75, dz, 1.8, 0.35, 0.3, rot); }
    if (timberStore) {
      for (const q of [-1, 1]) for (const r of [-1, 1]) {
        const [px, pz] = P(q * kw / 2, r * kd / 2);
        kbox(B.wood, 0x50402f, px, y + 2.3, pz, .16, 3.9, .16, rot);
      }
      for (const hy of [.9, 2.1]) {
        const [px, pz] = P(0, kd / 2 + .12);
        kbox(B.wood, 0x867153, px, y + hy, pz, 1.35, .10, .08, rot);
      }
    }
    { const [wx, wz] = P(kw * 0.25, -kd / 2 - 0.03); kbox(B.iron, 0x16140f, wx, y + 3.3, wz, 0.6, 0.5, 0.04, rot); }
    roof(y + 4.25, kw + 1.2, kd + 1.2, 1.5);
  } else if (kind === 'bansho') {
    fw = 4.4; fd = 3.4;
    kbox(B.wood, 0x5a4634, x, y + 0.95, z, 4, 1.9, 3, rot);
    for (const q of [-1, 1]) for (const r of [-1, 1]) { const [px, pz] = P(q * 2, r * 1.5); kbox(B.wood, 0x2e241a, px, y + 1.2, pz, 0.2, 2.4, 0.2, rot); }
    { const [wx, wz] = P(0, 1.52); kbox(B.iron, 0x14110d, wx, y + 1.5, wz, 1.6, 0.6, 0.03, rot); for (let q = -3; q <= 3; q++) { const [gx, gz] = P(q * 0.22, 1.56); kbox(B.wood, 0x3a2c20, gx, y + 1.5, gz, 0.05, 0.62, 0.05, rot); } }
    roof(y + 2.3, 5, 4, 1.0);
  } else if (kind === 'ido') {
    fw = 2.2; fd = 2.2;
    const ring = new THREE.CylinderGeometry(0.85, 0.9, 0.8, 12, 1, true); ring.translate(x, y + 0.4, z); B.nozura.push(paint(ring, 0x8a857a));
    const lid = new THREE.CylinderGeometry(0.8, 0.8, 0.06, 12); lid.translate(x, y + 0.2, z); B.iron.push(paint(lid, 0x10161a));
    for (const q of [-1, 1]) { const [px, pz] = P(q * 0.9, 0); kbox(B.wood, 0x3a2c20, px, y + 1.2, pz, 0.14, 2.4, 0.14, rot); }
    { const [px, pz] = P(0, 0); kbox(B.wood, 0x3a2c20, px, y + 2.2, pz, 2.0, 0.12, 0.12, rot); }
    roof(y + 2.35, 2.4, 1.4, 0.6);
  } else {
    // 厩：奥と妻は板壁、前は柱だけ（開け放ち）。仕切りの板、馬栓棒、飼い葉桶。板葺きの切妻
    const L = 10.8, D = 4.4, H = 2.6; fw = L; fd = D;
    // 稲葉山の厩は中央二房を出入り口にする推定の納まり。
    // 見える壁・柱・馬栓棒だけに当たりを付け、開いた正面を四角で塞がない。
    const barrier = (ax, az, bx, bz, r, top) => {
      if (!openStable) return;
      const a = P(ax, az), b = P(bx, bz);
      Object.assign(solidSeg(a[0], a[1], b[0], b[1], r), { yBot: y - .3, yTop: y + top });
    };
    { const [bx, bz] = P(0, -D / 2); kbox(B.wood, 0x5e4a38, bx, y + H / 2, bz, L, H, 0.08, rot); }
    barrier(-L / 2, -D / 2, L / 2, -D / 2, .04, H);
    for (const q of [-1, 1]) { const [sx, sz] = P(q * L / 2, 0); kbox(B.wood, 0x5e4a38, sx, y + H / 2, sz, 0.08, H, D, rot); }
    for (const q of [-1, 1]) barrier(q * L / 2, -D / 2, q * L / 2, D / 2, .04, H);
    for (let i = 0; i <= 6; i++) {
      const lx = -L / 2 + i * L / 6;
      for (const lz of [-D / 2, D / 2]) { const [px, pz] = P(lx, lz); kbox(B.wood, 0x3a2c20, px, y + H / 2, pz, 0.18, H, 0.18, rot); }
      for (const lz of [-D / 2, D / 2]) barrier(lx, lz - .09, lx, lz + .09, .09, H);
      if (i > 0 && i < 6 && !(openStable && i === 3)) {
        const [qx, qz] = P(lx, -0.2); kbox(B.wood, 0x5a4634, qx, y + 0.8, qz, 0.06, 1.4, D - 0.6, rot);
        barrier(lx, -D / 2 + .1, lx, D / 2 - .5, .03, 1.5);
      }
    }
    const rails = openStable ? [[-L / 2 + .1, -L / 6], [L / 6, L / 2 - .1]] : [[-L / 2 + .1, L / 2 - .1]];
    for (const [a, b] of rails) {
      for (const hy of [0.8, 1.25]) { const [mx, mz] = P((a + b) / 2, D / 2 - 0.1); kbox(B.wood, 0x4a3a2a, mx, y + hy, mz, b - a, 0.08, 0.08, rot); }
      barrier(a, D / 2 - .1, b, D / 2 - .1, .04, 1.29);
    }
    if (openStable) {
      // 飼い葉桶は底・側板・木口と脚で組み、中を覗ける形にする。
      const troughZ = -D / 2 + .45;
      for (const [lz, width, height, depth, cy] of [[troughZ, L - .4, .06, .5, .505],
        [troughZ - .22, L - .4, .29, .06, .68], [troughZ + .22, L - .4, .29, .06, .68]]) {
        const [tx, tz] = P(0, lz); kbox(B.wood, 0x4a3a2a, tx, y + cy, tz, width, height, depth, rot);
      }
      for (const lx of [-L / 2 + .23, L / 2 - .23]) {
        const [tx, tz] = P(lx, troughZ); kbox(B.wood, 0x4a3a2a, tx, y + .68, tz, .06, .29, .5, rot);
      }
      for (const lx of [-L / 3, 0, L / 3]) {
        const [tx, tz] = P(lx, troughZ); kbox(B.wood, 0x3a2c20, tx, y + .24, tz, .12, .48, .44, rot);
      }
      barrier(-L / 2 + .2, troughZ, L / 2 - .2, troughZ, .25, .825);
      // 平らな一枚天井を外し、柱上の桁と梁で板屋根を受ける。
      for (const lz of [-D / 2, D / 2]) {
        const [px, pz] = P(0, lz); kbox(B.wood, 0x3e3226, px, y + H + .32, pz, L + .2, .24, .18, rot);
      }
      kbox(B.wood, 0x3e3226, x, y + H + 1.12, z, L + .4, .16, .16, rot);
      const halfRoof = (D + 1.4) / 2, slope = Math.atan2(1.1, halfRoof);
      const rafter = new THREE.BoxGeometry(.08, .12, Math.hypot(halfRoof, 1.1));
      for (let i = 0; i <= 6; i++) {
        const lx = -L / 2 + i * L / 6, [px, pz] = P(lx, 0);
        kbox(B.wood, 0x3e3226, px, y + H + .1, pz, .18, .2, D + .4, rot);
        kbox(B.wood, 0x3e3226, px, y + H + .62, pz, .12, .84, .12, rot);
        for (const sd of [-1, 1]) {
          const g = rafter.clone(); g.rotateX(sd * slope);
          g.translate(lx, H + .65, sd * halfRoof / 2);
          g.rotateY(rot); g.translate(x, y, z); B.wood.push(paint(g, 0x5c5244));
        }
      }
      rafter.dispose();
    } else {
      { const [tx, tz] = P(0, -D / 2 + 0.45); kbox(B.wood, 0x4a3a2a, tx, y + 0.65, tz, L - 0.4, 0.35, 0.5, rot); }
      { const [px, pz] = P(0, 0); kbox(B.wood, 0x3e3226, px, y + H + 0.1, pz, L + 0.4, 0.2, D + 0.4, rot); }
    }
    if (boardRoof) roof(y + H + .2, L + 1.2, D + 1.4, 1.1);
    else for (const sd of [-1, 1]) { const g = new THREE.BoxGeometry(L + 1.2, 0.1, D / 2 + 1.1); g.translate(0, 0, sd * (D / 4 + 0.35)); g.rotateX(sd * 0.36); g.translate(0, H + 0.75, 0); g.rotateY(rot); g.translate(x, y, z); B.wood.push(paint(g, 0x5c5244)); }
  }
  if (!openStable) solidRect(x, z, fw + 0.4, fd + 0.4, rot);
  if (o.one) {
    // 画質「低」：みな木の材質へ（瓦は暗い灰、漆喰は白の色で）
    const tint = { tile: 0x4a4846, plaster: 0xd8d0c0, shitami: 0x2e2c28, nozura: 0x8a857a, uchikomi: 0x8a857a, iron: 0x1a1816 };
    for (const k of Object.keys(B)) { if (k === 'wood') continue; for (const g of B[k]) B.wood.push(g.attributes.color ? g : paint(g, tint[k] || 0x888888)); B[k] = []; }
  }
  return kitMesh(B, true, o.batch);
}

// 城・砦を縄張り（world.js の castlePlan。World は def.castle があれば world.castle に持つ）どおりに建てる。
// 曲輪の縁に柵（砦・下の曲輪）か土塀（城の上の曲輪。外の斜面に野面の石垣）、門の所は空けて冠木門・櫓門、主郭の門は枡形（内にもう一つの門を直角に）。
// 曲輪の角に井楼櫓・隅櫓、中に小屋（砦は石置き屋根）・主殿（城は天守）、下の曲輪の外の斜面に逆茂木、門に幟。o.tenshu（城の天守を建てるか）・o.mon（幟の紋）
export function buildCastle(world, plan, o = {}) {
  const grp = new THREE.Group(), fort = plan.kind === 'fort';
  // 石垣と天守は根拠を持つ呼び元だけが指定する。既定は土の城。
  const azuchi = (o.name || plan.name) === '安土城';
  const early = (o.year ?? plan.year ?? 1575) <= 1582 && !azuchi;
  const stone = !fort && !early && !!(o.stone || plan.stone);
  const hasTenshu = !fort && azuchi && (o.tenshu === true || plan.tenshu === true) && (o.year ?? plan.year ?? 0) >= 1576;
  let sd = (plan.seed * 97 + 13) >>> 0; const R = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  const G = plan.gates;
  plan.kuruwa.forEach((k, ki) => {
    const C = plan.corners(k);
    const upper = stone && k.lv < 7;
    for (let e = 0; e < 4; e++) {
      const [ax, az] = C[e], [bx, bz] = C[(e + 1) % 4], L = Math.hypot(bx - ax, bz - az);
      // この辺にある門の所を空ける
      const cuts = G.filter((g) => g.k === ki).map((g) => ({ t: ((g.x - ax) * (bx - ax) + (g.z - az) * (bz - az)) / (L * L), d: Math.abs((g.x - ax) * (bz - az) - (g.z - az) * (bx - ax)) / L })).filter((q) => q.d < 0.8 && q.t > 0 && q.t < 1).map((q) => q.t).sort((a, b) => a - b);
      const spans = []; let t0 = 0;
      for (const t of cuts) { spans.push([t0, t - 2.8 / L]); t0 = t + 2.8 / L; }
      spans.push([t0, 1]);
      // 外の向き（曲輪の真ん中と反対）
      const nx = -(bz - az) / L, nz = (bx - ax) / L, outSide = (k.x - (ax + bx) / 2) * nx + (k.z - (az + bz) / 2) * nz > 0 ? -1 : 1;
      for (const [s0, s1] of spans) {
        if (s1 - s0 < 0.04) continue;
        const seg = [ax + (bx - ax) * s0, az + (bz - az) * s0, ax + (bx - ax) * s1, az + (bz - az) * s1];
        if (upper) {
          grp.add(dobei(world, seg, { hikae: -outSide, shikkui: true }));
          solidSeg(seg[0], seg[1], seg[2], seg[3], 0.25);
          // 石垣は主郭の縁だけ（石は大きめ・高さは 3.5m まで。石の数を抑えて重くしない）
          if (stone && k.kind === 'hon') grp.add(ishigaki(world, [[seg[0], seg[1]], [seg[2], seg[3]]], { out: outSide, top: -0.1, minH: 2.2, maxH: 3.5, big: 1.4 }));
        } else grp.add(palisade(world, seg, { solid: true, h: 2.3 + R() * 0.4 }));
        // 下の曲輪の外の斜面に逆茂木
        if (!upper && k.lv > (fort ? 1 : 5) && R() < 0.5) { const mx = (seg[0] + seg[2]) / 2 + nx * outSide * 4, mz = (seg[1] + seg[3]) / 2 + nz * outSide * 4; grp.add(sakamogi(world, mx, mz, Math.atan2(bz - az, bx - ax) * -1, Math.min(6, L * (s1 - s0) * 0.6))); }
      }
    }
    // 角の櫓：一つか二つ（外の角を選ぶ）
    const nt = k.kind === 'hon' ? (4) : R() < 0.6 ? 1 : 0;
    const order = C.map((c, i) => ({ i, d: -Math.hypot(c[0] - plan.x, c[1] - plan.z) })).sort((a, b) => a.d - b.d);
    for (let q = 0; q < nt; q++) {
      const [x, z] = C[order[q].i], ix = x + (k.x - x) * 0.12, iz = z + (k.z - z) * 0.12;
      grp.add(upper ? sumiyagura(world, ix, iz, { rot: k.rot, w: 5, d: 4.2, base: 0.4 }) : yagura(world, ix, iz, { rot: k.rot, mon: o.mon }));
    }
    // 中の建物
    if (k.kind === 'hon') {
      if (hasTenshu) grp.add(tenshu(world, k.x - Math.cos(k.rot) * k.w * 0.18, k.z + Math.sin(k.rot) * k.w * 0.18, { rot: k.rot, floors: 5, borou: true, old: true, b: Math.min(10, k.d * 0.45) }));
      else grp.add(hut(world, k.x, k.z, Math.min(9, k.w * 0.4), Math.min(6, k.d * 0.4), k.rot, {}));
    } else if (k.kind !== 'umadashi' && R() < 0.8) {
      const hw = Math.min(6, k.w * 0.35), hd = Math.min(4, k.d * 0.35);
      grp.add(hut(world, k.x + (R() - 0.5) * (k.w - hw * 2) * 0.5, k.z + (R() - 0.5) * (k.d - hd * 2) * 0.5, hw, hd, k.rot + (R() < 0.5 ? 0 : Math.PI / 2), { ita: fort || k.lv > 6 }));
    }
  });
  // 門：大手と主郭は櫓門（砦は冠木門）。主郭の門は枡形：門の内に四角い囲いを作り、直角の向きにもう一つの門
  for (const g of G) {
    const big = (g.masu || g.ote) && stone;
    grp.add(big ? yaguramon(world, g.x, g.z, 4.2, g.rot) : kabukimon(world, g.x, g.z, 4.6, g.rot));
    if (o.mon) for (const sx of [-1, 1]) grp.add(nobori(world, g.x + Math.cos(g.rot) * sx * 4, g.z - Math.sin(g.rot) * sx * 4, o.mon, 4.5));
    if (g.masu && !early) {
      const k = plan.kuruwa[g.k], ix = k.x - g.x, iz = k.z - g.z, il = Math.hypot(ix, iz) || 1, ux = ix / il, uz = iz / il;
      const cx = g.x + ux * 5, cz = g.z + uz * 5, px = -uz, pz = ux, hs = 4.5;
      const P2 = (a, b) => [cx + px * a + ux * b, cz + pz * a + uz * b];
      // 囲いの三方（入ってきた門の辺は外の塀が受け持つ）。奥の辺は塞ぎ、横の一方に二の門
      for (const [a0, b0, a1, b1] of [[-hs, -hs, -hs, hs], [-hs, hs, hs, hs], [hs, hs, hs, 1.6]]) {
        const [x0, z0] = P2(a0, b0), [x1, z1] = P2(a1, b1);
        grp.add(fort ? palisade(world, [x0, z0, x1, z1], { solid: true }) : dobei(world, [x0, z0, x1, z1]));
        if (!fort) solidSeg(x0, z0, x1, z1, 0.25);
      }
      { const [x2, z2] = P2(hs, -hs * 0.35); grp.add(kabukimon(world, x2, z2, 3.6, Math.atan2(px, pz))); }
    }
  }
  return grp;
}

// 天守：石垣の天守台に、下見板と白壁の重ね。庇の瓦屋根・千鳥破風・最上階の廻縁と高欄・鯱。floors 階、b は一階の幅
// o.old：古い型（黒い下見板を多く・破風少なめ）。当たりは天守台
export function tenshu(world, x, z, o = {}) {
  const rot = o.rot || 0, floors = o.floors || 3, b = o.b || 9, B = kit(), P = Lr(x, z, rot);
  const y0 = world.heightAt(x, z) - 0.4;
  // 望楼型は広い下層の上に小さな物見を載せる。全階を同率で縮めない。
  const step = (k, width) => o.borou ? (k < floors - 3 ? 1 : k === floors - 3 ? 0.62 : 0.9) : width ? 0.78 : 0.8;
  const base = o.base ?? 4;
  solidRect(x, z, b + 3, b * 0.86 + 3, rot, y0 + base - 0.3);   // 石垣・土台の高さまでだけ外壁の当たり。登った先（床）は中を歩ける
  stoneBase(B, world, o.stone || 'nozura', x, z, b + 1.4, b * 0.86 + 1.4, rot, base + 0.1);
  // 中（naka.js。kaito 10/2）：階ごとの床・中の階段・壁・入口の石段。階の寸法は下の積みと同じ割り
  const LV = [];
  { let yy = y0 + base, ww = b, dd = b * 0.86; for (let k = 0; k < floors; k++) { const fh = k === floors - 1 ? 2.9 : 3.2; LV.push({ y: yy, w: ww - 0.1, d: dd - 0.1, h: fh - 0.05, ew: ww, ed: dd, fh }); yy += fh + 0.4; ww *= step(k, true); dd *= step(k, false); } }
  const IN = addInterior(world, {
    name: o.name || '天守', kind: 'tenshu', profile: o.profile, x, z, rot, levels: LV, where: o.where,
    door: { side: 1, lx: b * 0.25, w: 1.2 }, approach: { pad: 2.0, len: Math.max(3, base * 1.1) },
    // 外の黒い格子窓（下の積み）と同じ場所に、本当の窓を開ける
    wins: (lv) => {
      const out = [], nw = Math.max(2, Math.round(lv.ew / 2.6)), yc = lv.fh * 0.62;
      for (let q = 0; q < nw; q++) {
        const t = -lv.ew / 2 + (q + 0.5) * lv.ew / nw;
        for (const sd of [-1, 1]) { out.push({ face: 'z', s: sd, t, w: 0.8, y0: yc - 0.25, y1: yc + 0.25 }); out.push({ face: 'x', s: sd, t: t * lv.ed / lv.ew, w: 0.8 * lv.ed / lv.ew, y0: yc - 0.25, y1: yc + 0.25 }); }
      }
      return out;
    },
  });
  let y = y0 + base, w = b, d = b * 0.86, prevY = null;
  for (let k = 0; k < floors; k++) {
    const top = k === floors - 1, fh = top ? 2.9 : 3.2;
    const deckId = IN.deckIds[k];
    // 天守の梯子は常に登れる（siege_ladder.js で使える形）。一階は外の足もとから天守の真ん中（床の内）へ、二階からは真ん中で縦につなぐ
    const laddO = { hp: o.laddHp ?? 45, team: o.team, placed: true };
    if (k === 0) {
      const [fx, fz] = P(0, d / 2 + 1.5);
      const id = addLadder({ x: fx, z: fz, y0: world.heightAt(fx, fz), y1: y, deck: deckId, name: '天守の梯子', ...laddO });
      // 足もとは外（天守台の下）でも、上り着く先は床の内（天守の真ん中）にする
      const l = FL.ladders[id]; l.maxHp = l.hp; l.topX = x; l.topZ = z;
    } else {
      const id = addLadder({ x, z, y0: prevY, y1: y, deck: deckId, name: '天守 内の梯子', ...laddO });
      const l = FL.ladders[id]; l.maxHp = l.hp; l.topX = l.x; l.topZ = l.z;
    }
    prevY = y;
    const black = o.old ? 0.75 : 0.4;
    if (k === 0) {
      const lower = fh * black, dh = Math.min(IN.levels[0].h - 0.3, 2);
      const door = { side: 1, t: IN.door.lx, w: IN.door.w, y0: 0, y1: Math.min(lower, dh) };
      holedWalls(B, 'shitami', 0xa8a298, P, rot, y, w, d, lower, [door], 2);
      holedWalls(B, 'plaster', 0xd0c9b8, P, rot, y + lower, w, d, fh - lower, dh > lower ? [{ ...door, y1: dh - lower }] : []);
    } else {
      kbox(B.shitami, 0xa8a298, x, y + fh * black / 2, z, w, fh * black, d, rot, 2);
      kbox(B.plaster, 0xd0c9b8, x, y + fh * black + fh * (1 - black) / 2, z, w, fh * (1 - black), d, rot);
    }
    const nw = Math.max(2, Math.round(w / 2.6));
    for (let q = 0; q < nw; q++) {
      const lx = -w / 2 + (q + 0.5) * w / nw;
      for (const s of [-1, 1]) {
        const [ax, az] = P(lx, s * (d / 2 + 0.02)); kbox(B.iron, 0x121110, ax, y + fh * 0.62, az, 0.8, 0.5, 0.04, rot);
        const [cx, cz] = P(s * (w / 2 + 0.02), lx * d / w); kbox(B.iron, 0x121110, cx, y + fh * 0.62, cz, 0.04, 0.5, 0.8 * d / w, rot);
      }
    }
    if (k === 0) {
      // 一階の隅の石落とし（石垣の上へ張り出した袴）
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [px, pz] = P(sx * (w / 2 - 0.5), sz * (d / 2 + 0.25)); kbox(B.plaster, 0xd6cfbe, px, y + 0.9, pz, 1.2, 1.0, 0.5, rot); kbox(B.iron, 0x0c0b0a, px, y + 0.38, pz, 1.0, 0.04, 0.4, rot); }
    }
    if (top) {
      kbox(B.wood, 0x33261c, x, y + 0.12, z, w + 1.4, 0.14, d + 1.4, rot);
      for (const [lx, lz, ww, dd] of [[0, (d + 1.3) / 2, w + 1.4, 0.06], [0, -(d + 1.3) / 2, w + 1.4, 0.06], [(w + 1.3) / 2, 0, 0.06, d + 1.4], [-(w + 1.3) / 2, 0, 0.06, d + 1.4]]) { const [px, pz] = P(lx, lz); kbox(B.wood, 0x3a2a1c, px, y + 0.7, pz, ww, 0.08, dd, rot); }
      // 高欄の束（手すりの柱）
      for (let q = -3; q <= 3; q++) for (const s2 of [-1, 1]) { const [px, pz] = P(q * (w + 1.3) / 7, s2 * (d + 1.3) / 2); kbox(B.wood, 0x3a2a1c, px, y + 0.45, pz, 0.08, 0.55, 0.08, rot); }
      // 入母屋の大屋根：寄棟の上半分の両の端に妻を立てる
      const TW = w + 2.4, TD = d + 2.4, TH = 2.2, rl = Math.max(0.3, (TW - TD) / 2 + 0.6);
      ktile(B.tile, B.plaster, x, y + fh, z, TW, TD, TH, rot, 0.6);
      const t0 = 0.42, gy2 = y + fh + roofY(TH, t0);
      for (const sx of [-1, 1]) gable(B, P, rot, sx * Math.PI / 2, sx * (rl + 0.1), 0, gy2, TD * (1 - t0) * 0.95, TH * (1 - t0) + 0.25, 1.4);
      // 鯱：既定は瓦。金箔は城ごとに明示した時だけ。
      const shachiColor = o.goldShachi ? 0xb09040 : 0x4a4846;
      for (const s2 of [-1, 1]) {
        const [cx, cz] = P(s2 * (rl + 0.05), 0), sy = y + fh + TH + 0.5;
        kbox(B.iron, shachiColor, cx, sy, cz, 0.3, 0.55, 0.3, rot);
        const tail = new THREE.ConeGeometry(0.2, 0.7, 5); tail.rotateZ(-s2 * 0.5); tail.rotateY(rot); tail.translate(cx, sy + 0.45, cz); B.iron.push(paint(tail, shachiColor));
      }
    } else if (!o.borou || k >= floors - 3) {
      const RW = w + 2.6, RD = d + 2.6;
      // 上の階の床（+0.4）の下に屋根の頂を収める（瓦の山が上の階の部屋に立たないように。B078）
      ktile(B.tile, B.plaster, x, y + fh - 0.22, z, RW, RD, 0.58, rot, (w - d) / 2 + 0.6, true);
      // 千鳥破風（正面と裏、横は階ごとに互い違い）。古い型は一階だけ
      if (!o.old || k === 0) {
        const faces = k % 2 === 0 ? [0, Math.PI] : [Math.PI / 2, -Math.PI / 2];
        for (const f of faces) {
          const side = Math.abs(Math.sin(f)) > 0.5, half = side ? w / 2 : d / 2, span = side ? d : w;
          gable(B, P, rot, f, Math.sin(f) * (half + 0.15), Math.cos(f) * (half + 0.15), y + fh - 0.05, Math.min(3.4, span * 0.42), 1.35, 2.2);
        }
      }
    }
    y += fh + 0.4; w *= step(k, true); d *= step(k, false);
  }
  return kitMesh(B, true, o.batch);
}

// 逆茂木：枝を尖らせた伐り木を、梢を外（rot の向きの +z）へ向けて寝かせ、互い違いに重ねて絡ませる。根元は杭と横木で押さえる。len の長さ
export function sakamogi(world, x, z, rot = 0, len = 6, batch = null) {
  const B = kit(), P = Lr(x, z, rot);
  const n = Math.max(3, Math.round(len / 0.8)), sd = x * 1.7 + z * 2.9;
  const Y = (lx, lz) => { const [wx, wz] = P(lx, lz); return world.heightAt(wx, wz); };
  const pt = (lx, lz, up) => { const [wx, wz] = P(lx, lz); return [wx, world.heightAt(wx, wz) + up, wz]; };
  for (let i = 0; i < n; i++) {
    const r = h01(sd + i, 1), r2 = h01(sd + i, 2), r3 = h01(sd + i, 3);
    const lx = -len / 2 + (i + 0.5) * len / n + (r - 0.5) * 0.5, lz = -0.3 + r3 * 0.4;
    const sw = (r2 - 0.5) * 0.9, L = 2.6 + r * 1.4;
    const a = pt(lx, lz, 0.18), b = pt(lx + sw, lz + L, 0.9 + r2 * 0.8);
    B.wood.push(paintWorn(logGeo(a, b, 0.13 + r * 0.05, 0.055, 6, false), vary(r3 > 0.5 ? 0x80725e : 0x93816a, i), Y(lx, lz), L));
    // 根元の横木と伐り木を縛った縄。円筒の帯を幹の向きへ合わせる。
    const tie = new THREE.CylinderGeometry(0.15 + r * 0.05, 0.15 + r * 0.05, 0.09, 7, 1, true);
    _dv.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    tie.applyQuaternion(_qt.setFromUnitVectors(_up, _dv)); tie.translate(a[0], a[1] + 0.035, a[2] + 0.08);
    B.wood.push(flat(tie, 0xa29270));
    // 枝：幹の途中から左右・上へ。先は尖る
    const nb = 4 + Math.floor(r2 * 3);
    for (let k = 0; k < nb; k++) {
      const t = 0.3 + (k / nb) * 0.6, q = h01(sd + i * 7, k), side = k % 2 ? 1 : -1;
      const s = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const bl = 0.6 + q * 0.9 * (1 - t * 0.5);
      const [ex, ez] = P(lx + sw * t + side * bl * 0.7, lz + L * t + bl * 0.6);
      const e = [ex, s[1] + 0.25 + q * 0.6, ez];
      // 槍のような丸い蓋をやめ、斧で削った二つの面へ。枝数と張り出しは保つ。
      _dv.set(e[0] - s[0], e[1] - s[1], e[2] - s[2]).normalize();
      const cutLength = .22, rad = .07 * (1 - t * .4);
      const neck = [e[0] - _dv.x * cutLength, e[1] - _dv.y * cutLength, e[2] - _dv.z * cutLength];
      B.wood.push(paint(logGeo(s, neck, rad, rad * .55, 6), vary(0x75634e, i + k)));
      const tip = FENCE_CUT().clone(); tip.scale(rad * .55, cutLength, rad * .55);
      tip.applyQuaternion(_qt.setFromUnitVectors(_up, _dv)); tip.translate(...neck);
      B.wood.push(paint(tip, vary(0xb09a76, i + k)));
      if (q > 0.5) { const m = [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2, (s[2] + e[2]) / 2]; B.wood.push(paint(logGeo(m, [m[0] + (e[0] - s[0]) * 0.4 + 0.1, m[1] + 0.25, m[2] + (e[2] - s[2]) * 0.5], 0.015, 0.005, 3), 0x4a3e30)); }
    }
  }
  // 根元を押さえる横木と杭
  { const a = pt(-len / 2, -0.2, 0.18), b = pt(len / 2, -0.2, 0.18); B.wood.push(paintWorn(logGeo(a, b, 0.09, 0.08, 6), 0x4a3a2a, Math.min(a[1], b[1]) - 0.2, 1)); }
  for (let lx = -len / 2 + 0.4; lx < len / 2; lx += 1.5) { const a = pt(lx, -0.45, -0.2), b = pt(lx + 0.05, -0.4, 0.55); B.wood.push(paintWorn(logGeo(a, b, 0.05, 0.03, 5), 0x5a4a38, a[1], 0.8)); }
  return kitMesh(B, false, batch, !!world.def.nearStakeFade);
}

// 竹束（置き物）：縄で締めた縦竹の束と控え棒（taketaba.js と同じ形・材質）。rot の向き（+z）が前
export function takataba(world, x, z, rot = 0, o = {}) {
  const dense = true && o.fieldBundle === true;
  const make = (detailed) => {
    const mesh = new THREE.Mesh(tabaGeo(false, false, false, detailed, dense && o.fieldTrestle === true), tabaMat());
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  };
  const m = dense ? new THREE.LOD() : make(false);
  if (dense) { m.addLevel(make(true), 0); m.addLevel(make(false), 45); }
  m.position.set(x, world.heightAt(x, z), z); m.rotation.y = rot + Math.PI;
  Object.assign(solidRect(x, z, 1.9, 0.6, rot), { missileH: 1.7, missileType: 'wood' });
  return m;
}

// 木戸と陣幕の口に小さな篝火。既存の火が近ければ重ねない。
// 作るのは舞台の組み立て時だけ。篝火の光は三つの枠を使い回す。
function addNightBeacon(world, x, z) {
  if (!world.fires || world.def.town || world.def.dojo || (world.nightBeaconCount || 0) >= 16) return;
  for (const f of world.fires) if (Math.hypot(f.x - x, f.z - z) < 5) return;
  world.scene.add(kagaribi(world, x, z));
  world.addFire(x, z, { h: 1.35, size: 0.7, nightOnly: true });
  world.nightBeaconCount = (world.nightBeaconCount || 0) + 1;
}

// 篝火専用の光。戦ごとに三つだけ作り、本人に近い順の選び直しは半秒ごと。
// 炎の板の自発光と、地形に沿う円い照りは addFire の既存の物を使う。
// 円い照りの絵も既存の一枚を共用し、遠い火のための板や描画を足さない。
const KAGA_POOLS = new WeakMap();
function kagaPool(world) {
  let pool = KAGA_POOLS.get(world);
  if (pool) return pool;
  pool = { list: [], lights: [], timer: 0, position: new THREE.Vector3() };
  for (let i = 0; i < 3; i++) {
    const light = fireGlow(0xff8736, 0, 7, 2);
    light.name = '篝火の照り'; light.castShadow = false;
    light.userData.noFreeze = true;
    world.scene.add(light);
    pool.lights.push({ light, beacon: null });
  }
  KAGA_POOLS.set(world, pool);
  const update = world.update;
  world.update = function (dt, focus) {
    const result = update.call(this, dt, focus);
    updateKagaPool(this, pool, dt, focus);
    return result;
  };
  return pool;
}
const kagaNear = (a, b) => a.distance - b.distance;
function updateKagaPool(world, pool, dt, focus) {
  if (!focus) return;
  pool.timer -= dt;
  if (pool.timer <= 0) {
    pool.timer = 0.5;
    const night = world.nightAmount() > 0.1 || world.duskAmount() > 0.4;
    for (const beacon of pool.list) {
      const group = beacon.group;
      let visible = true, node = group;
      while (node && node !== world.scene) { if (!node.visible) visible = false; node = node.parent; }
      visible = visible && node === world.scene;
      group.getWorldPosition(pool.position);
      beacon.x = pool.position.x; beacon.y = pool.position.y; beacon.z = pool.position.z;
      // 篝火の後に addFire が呼ばれるため、組み立て後の最初の更新で対応を探す。
      if (!beacon.fire || !world.fires.includes(beacon.fire)) {
        beacon.fire = null;
        for (const fire of world.fires) if (Math.abs(fire.x - beacon.x) < 0.1 && Math.abs(fire.z - beacon.z) < 0.1) { beacon.fire = fire; break; }
      }
      const fire = beacon.fire;
      beacon.active = visible && night && !!fire?.lit;
      const dx = beacon.x - focus.x, dy = beacon.y + 1.55 - (focus.y || 0), dz = beacon.z - focus.z;
      beacon.distance = beacon.active ? dx * dx + dy * dy + dz * dz : Infinity;
    }
    pool.list.sort(kagaNear);
    for (let i = 0; i < pool.lights.length; i++) {
      const slot = pool.lights[i], beacon = pool.list[i];
      slot.beacon = beacon?.active ? beacon : null;
      if (slot.beacon) slot.light.position.set(beacon.x, beacon.y + 1.55, beacon.z);
    }
  }
  for (const slot of pool.lights) {
    const beacon = slot.beacon;
    const lit = beacon && beacon.group.visible && beacon.fire?.lit;
    const flicker = SETTINGS.reduceMotion ? 1 : 1 + Math.sin((world.time || 0) * 2.3 + beacon?.phase) * 0.035;
    slot.light.intensity = lit ? 9 * flicker : 0;
  }
}

// 篝火：三本脚の上に鉄の籠。薪を籠に盛る（炎の板は world.addFire で別に灯す）
let KAGA = null;
function kagaGeometry() {
  if (!KAGA) {
    const I = [], Wd = [];
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3, c = Math.cos(a), s = Math.sin(a);
      I.push(logGeo([c * .36, -.03, s * .36], [c * .16, 1.23, s * .16], .03, .022, 4, false));
    }
    const ring = new THREE.TorusGeometry(0.28, 0.02, 3, 10); ring.rotateX(Math.PI / 2); ring.translate(0, 1.2, 0); I.push(ring);
    const ring2 = ring.clone(); ring2.scale(1.25, 1, 1.25); ring2.translate(0, 0.28, 0); I.push(ring2);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      I.push(logGeo([c * .265, 1.19, s * .265], [c * .35, 1.49, s * .35], .015, .012, 3));
    }
    const ash = new THREE.SphereGeometry(1, 8, 4); ash.scale(.25, .045, .25); ash.translate(0, 1.23, 0); Wd.push(paint(ash, 0x696157));
    for (let k = 0; k < 6; k++) { const g = new THREE.CylinderGeometry(0.04, 0.05, 0.44 + k * .01, 5); g.rotateZ(Math.PI / 2 - 0.35); g.rotateY(k); g.translate(Math.sin(k) * .05, 1.3 + (k % 2) * .045, Math.cos(k) * .04); Wd.push(paint(g, k % 2 ? 0x211d19 : 0x594838)); }
    const iron = I.map((g) => {
      const p = flat(g, 0x57504a), C = p.attributes.color, P = p.attributes.position;
      for (let j = 0; j < C.count; j++) {
        // 籠の内側は煤、外の縁は焼けた鉄。光沢は一つの共有材質で受ける。
        const f = P.getY(j) > 1.22 && P.getY(j) < 1.44 ? .48 : .85;
        C.setXYZ(j, C.getX(j) * f, C.getY(j) * f, C.getZ(j) * f);
      }
      return p;
    });
    const material = liteMat({ vertexColors: true, roughness: .72, metalness: .65 });
    KAGA = { iron: mergeGeometries(iron), wood: mergeGeometries(Wd), material };
    for (const g of [...I, ...iron, ...Wd]) g.dispose();
  }
  return KAGA;
}
// 既に炎の照明がある並び。形と材質を共用し、照明枠や影を追加せず二回で描く。
export function kagaribiBatch(world, points) {
  const geo = kagaGeometry(), mat = ck(), grp = new THREE.Group();
  grp.name = '篝火の並び';
  const iron = new THREE.InstancedMesh(geo.iron, mat.iron, points.length);
  const wood = new THREE.InstancedMesh(geo.wood, mat.wood, points.length);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    matrix.makeTranslation(x, world.heightAt(x, z), z);
    iron.setMatrixAt(i, matrix); wood.setMatrixAt(i, matrix);
  }
  iron.receiveShadow = wood.receiveShadow = true;
  iron.computeBoundingSphere(); wood.computeBoundingSphere();
  grp.add(iron, wood);
  return grp;
}
export function kagaribi(world, x, z) {
  kagaGeometry();
  const grp = new THREE.Group();
  grp.name = '篝火';
  const a = new THREE.Mesh(KAGA.iron, KAGA.material), b = new THREE.Mesh(KAGA.wood, MAT());
  a.castShadow = a.receiveShadow = b.receiveShadow = true; grp.add(a, b);
  grp.position.set(x, world.heightAt(x, z), z);
  kagaPool(world).list.push({ group: grp, fire: null, x, y: grp.position.y, z, phase: x * 0.7 + z * 0.3, active: false, distance: Infinity });
  return grp;
}

// 乱杭の共通形：太さを残した丸太の先だけを削る。三色を使い回し、呼び手で高さと傾きを変える。
const POINTED_STAKES = [];
export function pointedStakeGeo(k) {
  const key = ((k % 3) + 3) % 3;
  if (!POINTED_STAKES[key]) {
    let g = new THREE.CylinderGeometry(.08, .095, 1, 5, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > .49) { p.setX(i, 0); p.setZ(i, 0); }
      else if (Math.abs(y) < .01) p.setY(i, .28);
    }
    g.computeVertexNormals();
    const colored = paint(g, [0x756b59, 0x62594b, 0x827864][key]);
    if (colored !== g) g.dispose();
    g = colored;
    const pos = g.attributes.position, col = g.attributes.color, tint = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      tint.setRGB(col.getX(i), col.getY(i), col.getZ(i));
      if (y >= .28) tint.setHex(0xa39779);   // 削った木口
      else tint.multiplyScalar(y < -.4 ? .57 : .92);   // 湿った地際と古い樹皮
      col.setXYZ(i, tint.r, tint.g, tint.b);
    }
    POINTED_STAKES[key] = g;
  }
  return POINTED_STAKES[key];
}

// 高い土塁：塀のように高く（既定 3.2m）、視界を遮り、進路を限る。両側へ法面を落とす二枚の土塁を背中合わせに置く。
// seg は [ax, az, bx, bz]。当たりも付ける（人は通れない）
export function takaDorui(world, seg, o = {}) {
  const [ax, az, bx, bz] = seg, len = Math.hypot(bx - ax, bz - az) || 1;
  const nx = -(bz - az) / len, nz = (bx - ax) / len, h = o.h || 3.2, w = o.w || 2.2;
  const g = new THREE.Group();
  for (const sgn of [1, -1]) {
    const d = dorui(world, [ax, az, bx, bz], nx * sgn, nz * sgn, { w, h, batch: o.batch, capEnds: o.capEnds });
    if (!d.isBatchedPart) g.add(d);
  }
  Object.assign(solidSeg(ax, az, bx, bz, w * 0.5), { missileH: h, missileType: 'dust' });
  return g;
}
// 食い違い虎口：二枚の高い土塁を食い違いに置き、一本道を折れ曲がらせる（入口の正面は壁で、横を向いて歩かされる）。
// 土塁の端点を返す。wallA・wallB は [ax, az, bx, bz]
export function kuichigaiKoguchi(world, wallA, wallB, o = {}) {
  const g = new THREE.Group();
  g.add(takaDorui(world, wallA, o), takaDorui(world, wallB, o));
  return g;
}
// 畝堀：堀の底に土の畝を何本も残す（堀の向きは x 軸。z0〜z1 が堀の幅）。畝は堀の幅いっぱいに横切り、並んだ畝の間へ落ちる。
// 横へ自由に動けず、畝の上を一列で渡る所を、土塁の上から撃たれる。x0〜x1 の間に gap おきに畝を立てる
export function uneBori(world, x0, x1, z0, z1, o = {}) {
  const gap = o.gap || 3.2, h = o.h || 1.5, parts = [];
  const w = Math.abs(z1 - z0), cz = (z0 + z1) / 2, lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  if (true) {
    // 堀障子：丸い山の列ではなく、裾が広く天端の細い土畝で堀底を格子に区切る。
    // 短い区間ごとに底へ沿わせ、全区間を一つに結合。通り道を残す範囲は呼び手が指定する。
    const crest = new THREE.Color(0x969064), foot = new THREE.Color(0x584936), grass = new THREE.Color(0x7c8653), tint = new THREE.Color();
    const ridge = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 2.5));
      const rot = Math.atan2(bx - ax, bz - az);
      for (let i = 0; i < n; i++) {
        const x = ax + (bx - ax) * (i + .5) / n, z = az + (bz - az) * (i + .5) / n;
        const g = paint(new THREE.BoxGeometry(1, h, len / n), 0x817052), p = g.attributes.position, c = g.attributes.color;
        for (let k = 0; k < p.count; k++) {
          const top = p.getY(k) > 0, end = p.getZ(k) > 0 ? i === n - 1 : i === 0;
          p.setX(k, p.getX(k) * (top ? .32 : 1.35));
          // 畝の自由端は垂直な切断面にせず、細い天端を引いて裾へ斜めに落とす。
          // 中継ぎの端は動かさず、畝の長さ・格子の位置を保つ。
          if (top && end) p.setZ(k, p.getZ(k) - Math.sign(p.getZ(k)) * Math.min(.55, len / n * .3));
        }
        g.rotateY(rot); g.translate(x, 0, z);
        // 区間の中心で水平に置くと継ぎ目が階段になる。各頂点を同じ地面に沿わせる。
        // 共有する端の高さをそろえ、法面へ続く畝も切れ目なくつなぐ。
        for (let k = 0; k < p.count; k++) {
          // 畝の裾は湿った土、細い天端は乾いた黄土とまばらな草。同じ座標は同じ色にする。
          const rise = p.getY(k) > 0 ? 1 : 0;
          // 畝の上にも黄緑の草の塊を残す。底まで同じ草色にせず、湿った裾との違いを出す。
          // 世界座標の緩やかな模様なので、短い区間の継ぎ目で色が切れない。
          const patch = Math.sin(p.getX(k) * 1.3 + .7) * Math.cos(p.getZ(k) * 1.1);
          tint.copy(foot).lerp(crest, rise).lerp(grass, rise * Math.max(0, patch) * .9)
            .multiplyScalar(.94 + h01(p.getX(k), p.getZ(k)) * .12);
          c.setXYZ(k, tint.r, tint.g, tint.b);
          p.setY(k, p.getY(k) + world.heightAt(p.getX(k), p.getZ(k)) + h / 2 - .12);
        }
        g.computeVertexNormals(); parts.push(g);
      }
    };
    const za = Math.min(z0, z1) + .15, zb = Math.max(z0, z1) - .15;
    if (hi - lo < .5 || zb <= za) return new THREE.Group();
    for (let x = lo + gap / 2; x < hi; x += gap) ridge(x, za, x, zb);
    if (o.grid !== false) {
      const rows = Math.max(1, Math.floor((zb - za) / gap));
      for (let i = 0; i < rows; i++) {
        const z = za + (zb - za) * (i + .5) / rows;
        ridge(lo, z, hi, z);
      }
    }
    const grp = new THREE.Group();
    if (parts.length) grp.add(merged(parts, doruiMaterial()));
    return grp;
  }
  for (let x = lo + gap / 2; x < hi; x += gap) {
    const g = new THREE.SphereGeometry(1, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(0.9, h, w * 0.5 - 0.3); g.translate(x, world.heightAt(x, cz) - 0.15, cz);
    parts.push(paint(g, 0x6a5a3a));
  }
  if (!parts.length) return new THREE.Group();
  const m = merged(parts, new THREE.MeshLambertMaterial({ vertexColors: true }));
  const grp = new THREE.Group(); grp.add(m); return grp;
}

// 隠し銃座（小谷の堀の中・清水谷の登り道の脇。ほかの城でも使える）：土に半ば埋めた囲いの中に鉄砲衆が膝をついて潜み、
// 前は土の壁と細い狭間（横長の穴）だけ。前に竹の束と丸太の矢来、上に土を被せる。後ろは開いていて、回り込めば斬れる。
// x, z は銃座の真ん中、rot は撃つ向き（+z を rot だけ回した向き）。返すのは { group, spots（兵を置く場所）, mouth（狭間の外）, fwd }
export function hiddenGunNest(world, x, z, rot = 0, o = {}) {
  const n = o.n || 3, W = Math.max(2, n * 0.7), HW = W / 2;
  const sn = Math.sin(rot), cs = Math.cos(rot);
  const loc = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  // 四隅でいちばん低い地面に土台を置く（土に埋めるので斜面でも浮かない）
  let y0 = 1e9;
  for (const [lx, lz] of [[-HW, -0.9], [HW, -0.9], [-HW, 2.6], [HW, 2.6], [0, 0.4]]) y0 = Math.min(y0, world.heightAt(...loc(lx, lz)));
  const parts = [];
  const box = (w, h, d, px, py, pz, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(px, py, pz); parts.push(paint(g, hex)); };
  const EARTH = 0x6a5238, GRASS = 0x5f7a3c, DARK = 0x0c0a08;
  // 前の壁：下の段と上の段の間が狭間（高さ 0.14m・幅いっぱい）
  box(W + 1, 1.2, 0.8, 0, 0.1, 1.1, EARTH);
  box(W + 1, 0.55, 0.8, 0, 1.43, 1.1, EARTH);
  box(W - 0.2, 0.16, 0.7, 0, 0.78, 1.1, DARK);   // 狭間の奥（穴は暗い）
  // 横の壁
  for (const s of [-1, 1]) box(0.5, 1.7, 2.2, s * (HW + 0.25), 0.25, 0.15, EARTH);
  // 屋根：板の上に土を被せ、草が生える。高さは 1.4m の内側のすぐ上
  box(W + 1.3, 0.28, 2.6, 0, 1.78, 0.15, EARTH);
  { const g = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); g.scale((W + 1.7) / 2, 0.5, 1.7); g.translate(0, 1.9, 0.15); parts.push(paint(g, GRASS)); }
  // 土の盛り（前と横の裾を地面へなだらかに）
  { const g = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); g.scale((W + 2.4) / 2, 0.9, 1.5); g.translate(0, 0.1, 1.5); parts.push(paint(g, 0x5a4630)); }
  // 後ろの入り口の両わき（黒い板。真ん中 0.9m が口）
  for (const s of [-1, 1]) box(HW - 0.45, 1.3, 0.1, s * (HW / 2 + 0.45), 0.55, -0.9, DARK);
  // 前の竹の束：五本ずつ縄でくくった束を二列
  for (let i = 0; i < Math.round(W + 1); i++) {
    const bx = -W / 2 - 0.25 + i * 1.0 + 0.1;
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2, rx = bx + Math.cos(a) * 0.09, rz = 2.0 + Math.sin(a) * 0.09 + (i % 2) * 0.1;
      const g = new THREE.CylinderGeometry(0.035, 0.045, 1.5 + (k % 2) * 0.12, 4); g.translate(rx, 0.7, rz); parts.push(paint(g, k % 2 ? 0x8a8a52 : 0x6e7a46));
    }
    const rope = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 6); rope.translate(bx, 0.9, 2.0 + (i % 2) * 0.1); parts.push(paint(rope, 0x4a3a28));
  }
  // 丸太の矢来：交差させて立てた丸太の列と、渡した横木
  const nX = Math.round(W / 0.9) + 2;
  for (let i = 0; i < nX; i++) {
    const px = -HW - 0.4 + i * ((W + 0.8) / (nX - 1));
    parts.push(paint(logGeo([px - 0.35, 0, 2.7], [px + 0.35, 1.5, 2.85], 0.07, 0.06, 5), 0x5a4a38));
    parts.push(paint(logGeo([px + 0.35, 0, 2.7], [px - 0.35, 1.5, 2.85], 0.07, 0.06, 5), 0x4e4032));
  }
  parts.push(paint(logGeo([-HW - 0.6, 0.85, 2.78], [HW + 0.6, 0.85, 2.78], 0.07, 0.07, 5), 0x4a3a2c));
  const mesh = merged(parts);
  const group = new THREE.Group();
  group.add(mesh);
  group.position.set(x, y0, z); group.rotation.y = rot;
  group.userData.hiddenGunNest = true;
  // 当たり：前の壁と両わきの壁。後ろは開けておく（回り込めば入れる）
  solidRect(...loc(0, 1.1), W + 1, 0.8, rot);
  for (const s of [-1, 1]) solidRect(...loc(s * (HW + 0.25), 0.15), 0.5, 2.2, rot);
  const spots = [];
  for (let i = 0; i < n; i++) { const [sx, sz] = loc(-HW + 0.35 + i * ((W - 0.7) / Math.max(1, n - 1)), 0.2); spots.push({ x: sx, z: sz }); }
  const [mx, mz] = loc(0, 3.2);
  return { group, spots, mouth: { x: mx, z: mz }, center: { x, z }, fwd: { x: sn, z: cs } };
}

// 横矢の座：虎口の曲がり角で、通る者の横から撃つ鉄砲・弓の席。低い土の盛りの上に、狭間を開けた掻盾（板の盾）を横に並べる。
// x, z は座の真ん中、rot は撃つ向き（+z を rot だけ回した向き）、o.n は兵の数。返す物は hiddenGunNest と同じ形
export function yokoyaZa(world, x, z, rot = 0, o = {}) {
  const n = o.n || 2, W = Math.max(2.4, n * 1.2), HW = W / 2;
  const sn = Math.sin(rot), cs = Math.cos(rot);
  const loc = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  let y0 = 1e9;
  for (const [lx, lz] of [[-HW, 0], [HW, 0], [0, 0.9], [0, -0.9]]) y0 = Math.min(y0, world.heightAt(...loc(lx, lz)));
  const parts = [];
  const box = (w, h, d, px, py, pz, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(px, py, pz); parts.push(paint(g, hex)); };
  box(W + 0.6, 0.5, 1.6, 0, 0.05, 0.1, 0x6a5238);
  const nb = Math.round(W / 0.9);
  for (let i = 0; i < nb; i++) {
    const bx = -HW + 0.45 + i * (W - 0.9) / Math.max(1, nb - 1);
    box(0.62, 0.9, 0.09, bx, 1.0, 0.85, i % 2 ? 0x6e5c44 : 0x5e4e3a);   // 下の板
    box(0.62, 0.45, 0.09, bx, 1.72, 0.85, i % 2 ? 0x6e5c44 : 0x5e4e3a);   // 上の板（間が狭間）
  }
  box(W + 0.4, 0.1, 0.16, 0, 1.97, 0.85, 0x4a3a2c);
  for (const sg of [-1, 1]) box(0.12, 1.9, 0.12, sg * (HW + 0.15), 0.95, 0.85, 0x4a3a2c);
  const mesh = merged(parts);
  const group = new THREE.Group();
  group.add(mesh); group.position.set(x, y0, z); group.rotation.y = rot;
  solidRect(...loc(0, 0.85), W + 0.4, 0.3, rot);
  const spots = [];
  for (let i = 0; i < n; i++) { const [sx, sz] = loc(-HW + 0.6 + i * ((W - 1.2) / Math.max(1, n - 1)), 0.2); spots.push({ x: sx, z: sz }); }
  const [mx, mz] = loc(0, 3);
  return { group, spots, mouth: { x: mx, z: mz }, center: { x, z }, fwd: { x: sn, z: cs } };
}

// 寺の伽藍をまとめて描く temple1571.js が、同じ形・材質を使い回すための口（中身は上のまま）
export { paint as paintGeo, hipGeo, TILE as TILE_MAT, MAT as WOOD_MAT, THATCH as THATCH_MAT, ITA_MAT, vary as varyHex };
