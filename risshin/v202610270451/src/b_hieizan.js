// ======================================================================
// 信長包囲網　比叡山（延暦寺）攻め（元亀二年九月十二日）
// 浅井・朝倉をかくまい、織田に従わなかった延暦寺を、信長は坂本から攻めた。
// 足軽は明智光秀の手。①坂本から山道を登る ②山門の前で僧兵を退け、門を破る組を守る
// ③門の内で、名のある僧兵の大将・正覚院豪盛の薙刀の衆と戦う ④山の上の堂塔が燃える。逃げる者は追わない
// 史実の焼き討ちは多くの死者を出したと伝わるが、ここでは戦う僧兵とだけ戦い、非戦の者は討たない（副任務）
// 向き：東（+x）が琵琶湖と坂本。西（-x）へ登ると山門、その奥に東塔の堂
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, jinmaku, hut, romon, dou, stumps, hashigo, tsuiji, tobiraLeaf, solidCircle } from './props.js';
import { Garan, makeTempleFire } from './temple1571.js';
import { hieiNageshiHeight } from './interior_parts.js';
import { HIEI_NAIJIN_POST_SETBACK } from './interior_layouts.js';
import { dressSlope } from './terrain_slope.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { lookParts } from './units.js';
import { applyLook } from './b_inabayama.js';
// 堂塔が燃える煙で日が陰り、空が茶色く濁った昼
const SMOKY = { sky: 0x8a7a66, fog: 0x7a6a58, sun: 0xd89a64, sunI: 0.95, hs: 0xa89480, hg: 0x3a3026, hI: 1.0, top: 0x5a5048, glow: 0.3, dir: [0.8, 0.35, 0.3], mount: 0x3a342c };
import { sfx } from './audio.js';
import { addDeck } from './floors.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { volleyScene } from './b_shiga.js';
import { camp } from './b_mid.js';
import { depthStart, depthTick, depthBot, rest, pick, fight, hold, move } from './b_depth.js';

const GATE = { x: 8, z: 0 };               // 山門（東向き）
const SAKA = { x: 96, z: 6 };              // 坂本（湖のほとり）
const CHUDO = { x: -50, z: -4 };           // 根本中堂の前
const INSIDE = { x: -18, z: 0 };          // 門内で味方と並ぶ場所
const RESCUE = { x: -17, z: -22 };         // 救出の下知から同じ縁へ案内する

// 畳・紙の建具・須弥壇にも、柱や天井と同じ堂内の光を当てる。
// 共通の室内部品は変えず、この戦の材質だけを一度作って全棟で使い回す。
const HIEI_ROOM_MATERIALS = new WeakMap();
export function hieiRoomMaterial(source) {
  // 光だまり・障子の透け・油皿の火先は、元の明るさと透け方を保つ。
  if (!source.isMeshBasicMaterial || source.transparent || !source.colorWrite
    || source.color.getHex() === 0xffd08b) return source;
  if (!HIEI_ROOM_MATERIALS.has(source)) {
    const material = new THREE.MeshStandardMaterial({
      color: source.color, map: source.map, vertexColors: source.vertexColors,
      alphaMap: source.alphaMap, alphaTest: source.alphaTest, side: source.side,
      depthTest: source.depthTest, depthWrite: source.depthWrite,
      fog: source.fog, toneMapped: source.toneMapped,
      roughness: 1, metalness: 0, emissive: 0x514c41, emissiveIntensity: .16,
    });
    HIEI_ROOM_MATERIALS.set(source, material);
  }
  return HIEI_ROOM_MATERIALS.get(source);
}

// この戦だけの言葉。共通の台詞の元や、ほかの戦には手を加えない。
export function hieiSpeech(rt) {
  const say = rt.say, bark = rt.bark;
  rt.say = function (who, text, dur) {
    if (!(this.def.speechAllowed || hieizan.speechAllowed)(this, who, text)) return;
    if (who === '明智光秀') text = text
      .replace(/その働きは忘れ(?:ません|ぬ)。(?:どうか)?列を離れ(?:ずに|るな)/g, 'よう支えた。列を離れるな')
      .replace(/列を整え(?:ましょう|よ)。一人で前へ出(?:ないでください|るな)/g, '列を乱すな。一人で前へ出るな')
      .replace(/無念(?:です)?(?:……。|……)空いた持ち場を(?:支えてください|頼む)/g, '無念……空いた持ち場を支えよ');
    return say.call(this, who, text, dur);
  };
  rt.bark = function (text, ...args) {
    if (this.flags.ending && /^味方の侍「/.test(text)) return;
    return bark.call(this, text, ...args);
  };
}

// まとめ描きは保ち、瓦・石の筋と苔を世界の座標から付ける。
// カメラと本人の間にある屋根・柱だけを透かす。入れ物は開戦時に一度作る。
export function hieiSurface(rt, mesh, kind, solid = false) {
  if (!mesh?.isMesh) return;
  const mat = mesh.material.clone(), oldCompile = mat.onBeforeCompile;
  const stone = kind === 'stone', roof = ['tile', 'ita', 'thatch', 'bark'].includes(kind);
  const fade = !stone && !solid;
  if (fade) { mat.transparent = true; mat.depthWrite = false; }
  if (mat.emissive) { mat.emissive.setHex(0x514c41); mat.emissiveIntensity = 0.16; }
  mat.onBeforeCompile = function (shader, renderer) {
    oldCompile.call(this, shader, renderer);
    shader.uniforms.hieiPlayer = { value: rt.player.u.pos };
    shader.vertexShader = 'varying vec3 vHiei;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvHiei = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'varying vec3 vHiei; uniform vec3 hieiPlayer;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      ${stone ? `float grain = fract(sin(dot(floor(vHiei * 18.0), vec3(12.9, 78.2, 37.7))) * 43758.5);
      float seam = step(0.94, fract(vHiei.x * 1.8 + floor(vHiei.z * 1.4) * 0.5));
      float moss = smoothstep(0.65, 0.9, sin(vHiei.x * 2.1) * sin(vHiei.z * 1.7));
      diffuseColor.rgb *= mix(0.82, 1.18, grain) * (1.0 - seam * 0.22);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.65, 0.9, 0.42), moss * 0.45);` : roof ? `float tileLine = smoothstep(0.82, 0.96, fract(vHiei.x * 2.4)) + smoothstep(0.9, 0.98, fract(vHiei.z * 2.4));
      diffuseColor.rgb *= 1.12 - min(1.0, tileLine) * 0.25;` : ''}
      ${fade ? `vec3 sight = hieiPlayer + vec3(0.0, 1.3, 0.0) - cameraPosition;
      float along = clamp(dot(vHiei - cameraPosition, sight) / max(dot(sight, sight), 0.01), 0.0, 1.0);
      float gap = length(vHiei - cameraPosition - sight * along);
      diffuseColor.a *= mix(0.12, 1.0, smoothstep(1.2, 2.4, gap));` : ''}
    `);
  };
  mat.customProgramCacheKey = () => 'hiei_surface_' + kind + (solid ? '_solid' : '');
  mesh.material = mat;
}

export function hieiGaranLook(rt, garan, solid = false) {
  for (const b of garan.buckets.values()) if (b.mesh && ['tile', 'ita', 'thatch', 'bark', 'wood', 'stone'].includes(b.mk)) hieiSurface(rt, b.mesh, b.mk, solid);
  for (const m of rt.world.mountains.children) {
    m.material.color.setHex(0x24362b);
    // 霞は残し、峰の輪郭だけ濃くする。この戦の材質だけに適用する。
    m.material.fragmentShader = m.material.fragmentShader.replace('mix(c, hc, hz)', 'mix(c, hc, hz * 0.72)');
    m.material.needsUpdate = true;
  }
}
const ROAD = [[150, 10], [SAKA.x, SAKA.z], [60, -4], [34, 6], [GATE.x + 2, 0], [-20, -2], [CHUDO.x, CHUDO.z], [-110, -20], [-178, -30]];
// 道案内と石段で、同じ本坂の中心線を使う。
function roadZ(x) {
  for (let i = 0; i < ROAD.length - 1; i++) {
    const [ax, az] = ROAD[i], [bx, bz] = ROAD[i + 1];
    if ((x - ax) * (x - bx) <= 0 && ax !== bx) return az + (bz - az) * (x - ax) / (bx - ax);
  }
  return 0;
}
const ROAD_WAY = { x: 0, z: 0 }; // 毎コマ作り直さない。
const CLIMB_GOAL = { x: GATE.x + 20, z: roadZ(GATE.x + 20) };
function hieiWay(u, want) {
  const p = u.pos;
  // 本坂を西へ登る時だけ。横攻め・退却・門の内の行き先は保つ。
  if (want.x < GATE.x + 2 || p.x <= want.x || p.x > ROAD[0][0] || Math.abs(want.z - roadZ(want.x)) > 3) return want;
  if (Math.abs(p.z - roadZ(p.x)) > 3) {
    ROAD_WAY.x = p.x; ROAD_WAY.z = roadZ(p.x);
    return ROAD_WAY;
  }
  for (const [x, z] of ROAD) {
    // 曲がり角の手前で次へ渡す。到着半径内で立ち止まらせない。
    if (x >= p.x - 4 || x <= want.x) continue;
    ROAD_WAY.x = x; ROAD_WAY.z = z;
    return ROAD_WAY;
  }
  return want;
}
const HALLS = [[-62, -22, 14, 9], [-44, 22, 9, 6], [-24, -24, 8, 6], [-80, 18, 10, 7]];   // 門の内の堂（x, z, 幅, 奥行）
const FAR = [[-130, -60], [-140, 30], [-120, 90], [-150, -110]];                          // 山の上の遠い堂塔（西塔・横川）

// 僧兵：袈裟と腹巻、顔を出す白い裹頭、薙刀。この戦だけで頭の形を差し替える。
const SOHEI = { armor: 0x2a2622, lace: 0xcfc7b4, cloth: 0xd8d2c2, hat: 'hachimaki', flag: null, weaponExtra: 0, sohei: 1 };
const ODA = { flag: 'oda' };

// 比叡山専用。顔を布で埋めず、額から頬の外側へ巻く裹頭にする。
const HIEI_HEADS = new Map();
let hieiHeadMat;
function hieiPaint(g, hex) {
  const q = g.index ? g.toNonIndexed() : g.clone(), c = new THREE.Color(hex);
  const a = new Float32Array(q.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  q.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) q.deleteAttribute(k);
  return q;
}
// 縮尺を合わせた材へ貼る。木目を長手へ通し、丸柱も高さで引き伸ばさない。
// 外周の角材と同じ幅四十五センチ・長さ二・四メートル。設営時だけ使う。
export function hieiTimberGrain(g, axis, offset = 0, round = false, diameter = .28) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const cross = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  const component = (a, i, k) => k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : a.getZ(i);
  for (let i = 0; i < p.count; i++) {
    const end = Math.abs(component(n, i, axis)) > .5;
    if (round && !end) {
      // 継ぎ目の両側を同じ周方向へ並べ、八角の柱面でも木目を途切れさせない。
      uv.setXY(i, uv.getX(i) * (diameter * Math.PI / .45) + offset, p.getY(i) / 2.4);
      continue;
    }
    const side = end || Math.abs(component(n, i, cross[0])) > .5 ? cross[1] : cross[0];
    uv.setXY(i, component(p, i, side) / .45 + offset,
      end ? component(p, i, cross[0]) / .45 : component(p, i, axis) / 2.4);
  }
}
function hieiHead(look) {
  const v = (look.face | 0) % 12;
  if (HIEI_HEADS.has(v)) return HIEI_HEADS.get(v);
  const cloth = [], width = 0.118 + (v % 3) * 0.003;
  // 正面の顔は開ける。巻き目の段と細かい皺は実際の頂点で付ける。
  const g = new THREE.SphereGeometry(1, 24, 16), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const fold = 0.004 * Math.sin(y * 38 + Math.atan2(x, z) * 3 + v) + 0.0015 * Math.sin(x * 53 + y * 79);
    p.setXYZ(i, x * (width + fold), 1.603 + y * (0.147 + fold), 0.005 + z * (0.139 + fold));
  }
  const ix = g.index.array, kept = [];
  for (let i = 0; i < ix.length; i += 3) {
    let x = 0, y = 0, z = 0;
    for (let j = 0; j < 3; j++) { x += p.getX(ix[i + j]) / 3; y += p.getY(ix[i + j]) / 3; z += p.getZ(ix[i + j]) / 3; }
    if (!(z > 0.058 && Math.abs(x) < 0.098 && y > 1.485 && y < 1.66)) kept.push(ix[i], ix[i + 1], ix[i + 2]);
  }
  g.setIndex(kept); g.computeVertexNormals();
  cloth.push(hieiPaint(g, [0xd9d1be, 0xe3dac8, 0xcac3b3][v % 3])); g.dispose();
  for (const sd of [-1, 1]) {
    const tail = new THREE.BoxGeometry(0.042, 0.19 + (v % 3) * 0.025, 0.012);
    tail.rotateZ(sd * 0.12); tail.translate(sd * 0.042, 1.41, -0.13);
    cloth.push(hieiPaint(tail, 0xc9c0ab)); tail.dispose();
  }
  const hood = mergeGeometries(cloth);
  // 元の顔の目・口の色を保ち、鼻と頬の形をそのまま使う。
  const source = lookParts(look).face;
  const face = hieiPaint(source, 0xc29b78);
  const painted = source.index ? source.toNonIndexed() : source;
  if (painted.attributes.color) face.setAttribute('color', painted.attributes.color.clone());
  const head = mergeGeometries([face, hood]);
  face.dispose(); for (const g of cloth) g.dispose();
  if (painted !== source) painted.dispose();
  const rec = { hood, head }; HIEI_HEADS.set(v, rec);
  return rec;
}
function hieiSoldiers(rt) {
  const add = rt.army.addUnit;
  if (!hieiHeadMat) hieiHeadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, side: THREE.DoubleSide });
  rt.army.addUnit = function (group, options) {
    const u = add.call(this, group, options);
    if (u.look?.sohei && !u.look.kosode) {
      // 骨入りの近い兵にも顔を出す。共通の裹頭を作らせず、専用の布を後で付ける。
      u.look = { ...u.look, hat: 'hachimaki', soheiV: u.look.soheiV ?? 2 };
      const shape = hieiHead(u.look);
      u.head.geometry = shape.head; u.head.material = hieiHeadMat;
      u.head.userData.lod = undefined; u.head.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
    }
    return u;
  };
}
function hieiNearHeads(rt) {
  for (const u of rt.army.units) {
    const h = u.human, face = h?.parts.kato || h?.parts.pface;
    if (h?.hieiHood) { h.hieiHood.visible = !h.lodFar; continue; }
    if (!h || !face || !u.look?.sohei || u.look.kosode) continue;
    const m = new THREE.Mesh(hieiHead(u.look).hood, hieiHeadMat);
    m.matrixAutoUpdate = false; m.matrix.copy(face.matrix);
    m.castShadow = true; m.receiveShadow = true;
    m.visible = !h.lodFar;
    face.parent.add(m); h.hieiHood = m;
  }
}

// 屋根の元の寸法を保ち、四面を反らせ、瓦の段と厚い軒・棟を同じ描画へまとめる。
function hieiRoof(source) {
  source.computeBoundingBox();
  const b = source.boundingBox, ex = (b.max.x - b.min.x) / 2, ez = (b.max.z - b.min.z) / 2;
  const cx = (b.max.x + b.min.x) / 2, cz = (b.max.z + b.min.z) / 2, ey = b.min.y, rh = b.max.y - ey;
  const p = source.attributes.position;
  let rl = 0;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > b.max.y - 0.01) rl = Math.max(rl, Math.abs(p.getX(i) - cx));
  rl = Math.min(rl, ex * 0.8);
  const parts = [], rows = Math.max(8, Math.ceil(ez / 0.42));
  const point = (side, u, t, lift = 0) => {
    const y = ey + rh * Math.pow(1 - t, 1.5) + 0.24 * Math.pow(t, 6) + lift;
    if (side < 2) return [cx + u * (rl + (ex - rl) * t), y, cz + (side ? -1 : 1) * ez * t];
    return [cx + (side === 2 ? 1 : -1) * (rl + (ex - rl) * t), y, cz + u * ez * t];
  };
  const strip = (side, t0, t1, lift, hex) => {
    const a = point(side, -1, t0, lift), b = point(side, 1, t0, lift), c = point(side, -1, t1, lift), d = point(side, 1, t1, lift);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...c, ...b, ...b, ...c, ...d], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0,t0,0,t1,ex,t0,ex,t0,0,t1,ex,t1], 2));
    g.computeVertexNormals(); parts.push(hieiPaint(g, hex)); g.dispose();
  };
  for (let side = 0; side < 4; side++) {
    for (let j = 0; j < rows; j++) {
      strip(side, j / rows, (j + 1) / rows, 0, j % 2 ? 0xa2a5a3 : 0xb4b7b3);
      strip(side, (j + 0.88) / rows, (j + 1) / rows, 0.055, 0xc0c2bb);
    }
    // 軒先は厚さ二十センチの側面。下から見ても紙の端にならない。
    const a = point(side, -1, 1), b = point(side, 1, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a,a[0],a[1]-.2,a[2],...b,...b,a[0],a[1]-.2,a[2],b[0],b[1]-.2,b[2]], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(12), 2); g.computeVertexNormals();
    parts.push(hieiPaint(g, 0x797d79)); g.dispose();
  }
  const ridge = new THREE.BoxGeometry(rl * 2 + 0.5, 0.28, 0.38); ridge.translate(cx, ey + rh + 0.12, cz);
  parts.push(hieiPaint(ridge, 0xa6aaa4)); ridge.dispose();
  const result = mergeGeometries(parts); for (const g of parts) g.dispose();
  return result;
}
// 基礎と柱の下端だけを、回転後の実際の地面まで伸ばす。屋根と床は水平に保つ。
export function hieiGroundFoot(world, rec, geometry, baked = false) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox, low = bounds.min.y;
  const pillar = bounds.max.x - bounds.min.x < .7 && bounds.max.z - bounds.min.z < .7 && bounds.max.y - low > 1.5;
  const base = low < -.1 && (baked || bounds.max.y <= 1.5 || rec.kind === 'lite');
  if (!base && !pillar) return;
  const p = geometry.attributes.position, c = Math.cos(rec.rot || 0), s = Math.sin(rec.rot || 0);
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > low + .001) continue;
    const x = p.getX(i), z = p.getZ(i);
    const ground = world.heightAt(rec.x + x * c + z * s, rec.z - x * s + z * c) - rec.y0 - .15;
    p.setY(i, Math.min(low, ground));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}
class HieiGaran extends Garan {
  add(rec, kind, geometry) {
    if (Array.isArray(geometry)) {
      if (['tile', 'ita', 'thatch', 'bark'].includes(kind)) {
        const joined = mergeGeometries(geometry.map((g) => g.index ? g.toNonIndexed() : g));
        for (const g of geometry) g.dispose(); this.add(rec, kind, joined);
      } else for (const g of geometry) this.add(rec, kind, g);
      return;
    }
    if (['tile', 'ita', 'thatch', 'bark'].includes(kind)) {
      const roof = hieiRoof(geometry); geometry.dispose();
      super.add(rec, 'tile', roof);
    } else {
      if (kind === 'wood' || kind === 'stone' || kind === 'plain') hieiGroundFoot(this.W, rec, geometry);
      // 出入りできる堂の壁板だけを白壁へ。柱・床・戸口は保つ。
      const color = geometry.attributes.color;
      if (kind === 'wood' && color) {
        const brown = new THREE.Color(0x6e5840), white = new THREE.Color(0xd8d0bb);
        let wall = false;
        for (let i = 0; i < color.count; i++) if (Math.abs(color.getX(i)-brown.r)<.001 && Math.abs(color.getY(i)-brown.g)<.001) { color.setXYZ(i, white.r, white.g, white.b); wall = true; }
        if (wall) kind = 'plaster';
      }
      super.add(rec, kind, geometry);
    }
  }
  bake(rec, group) {
    group.traverse((m) => {
      if (m.isMesh && this.mk.get(m.material) === 'tile') { const g = m.geometry; m.geometry = hieiRoof(g); g.dispose(); }
      else if (m.isMesh && m.geometry.attributes.color) {
        hieiGroundFoot(this.W, rec, m.geometry, true);
        const c = m.geometry.attributes.color, brown = new THREE.Color(0x5a3e2a), white = new THREE.Color(0xd8d0bb);
        for (let i=0;i<c.count;i++) if (Math.abs(c.getX(i)-brown.r)<.001 && Math.abs(c.getY(i)-brown.g)<.001) c.setXYZ(i,white.r,white.g,white.b);
      }
    });
    super.bake(rec, group);
  }
  build(b) {
    // 間取り・調度の当たりを作る前に、この戦の型を渡す。
    // 出入り・引き戸・燃える時の片付けは共通の仕組みを使う。
    const rec = super.build({ ...b, profile: 'hieizan' }), grand = b.kind === 'chudo';
    const lv = rec.naka.levels[0], floor = lv.y - rec.y0 - .06;
    const y = floor + lv.h + (grand ? .5 : 0);
    const half = b.w / 2 + (grand ? 1.2 : 0);
    // 白壁の外側も柱と長押で受ける。焼失前の柱割は推定。
    // 内側と同じ窓割を使い、明かり取りと正面の引き戸を柱で塞がない。
    this.hallBeamShape ||= new THREE.BoxGeometry(1, 1, 1);
    const wallBase = lv.y - rec.y0, wallTop = wallBase + lv.h;
    const wallTimber = (w, h, d, x, cy, z, color = 0x634832) => {
      const g = this.hallBeamShape.clone();
      g.scale(w, h, d);
      const plaster = color === 0xd8d0bb;
      // 単位箱の絵を梁全体へ伸ばさず、木目を材の長手へ通す。
      // 門の角材と同じ幅四十五センチ・長さ二・四メートルで繰り返す。
      // 設営時に貼り方だけ変え、共通の形・木材のまとめ描きは保つ。
      const axis = h >= w && h >= d ? 1 : w >= d ? 0 : 2;
      const offset = (x * .37 + cy * .19 + z * .53) % 1;
      if (!plaster) hieiTimberGrain(g, axis, offset);
      g.translate(x, cy, z);
      // 小壁は木材と分け、既存の塗り壁材質でまとめる。白壁へ木目を付けない。
      super.add(rec, plaster ? 'plaster' : 'wood', hieiPaint(g, color)); g.dispose();
    };
    // 僧坊・小堂の入口の踏板を、持ち出した根太と束・束石で受ける。
    // 細かな納まりは推定。共通の入口と同じ寸法を使い、石段の手前へ束を納める。
    // 木部・石は棟の既存の束へまとめ、焼失時も踏板の支えを残さない。
    if (!grand && ['sobo', 'hondo'].includes(rec.naka.kind) && rec.naka.approach) {
      const { pad } = rec.naka.approach, side = rec.naka.door.side;
      const width = rec.naka.door.w + .4, depth = pad + .4;
      const center = b.d / 2 + pad / 2 - .1;
      const top = wallBase - .12, beamH = .1;
      // 踏板中央の横根太も棟へまとめる。共通の入口側では支えを重ねない。
      // 上面を踏板の下面へ揃え、左右の持ち出し材へ荷を渡す。
      wallTimber(width - .16, .08, .1, rec.naka.door.lx, wallBase - .16, side * center);
      for (const sign of [-1, 1]) {
        const x = rec.naka.door.lx + sign * (width / 2 - .06);
        const z = side * (b.d / 2 + .1), [wx, wz] = rec.naka.P(x, z);
        const ground = this.W.heightAt(wx, wz) - rec.y0;
        const footTop = ground + .08, postTop = top - beamH;
        // 地面が高い所では束を逆さに作らず、石も板の下面より上へ出さない。
        if (postTop <= footTop) continue;
        const foot = this.hallBeamShape.clone().scale(.16, .08, .16)
          .translate(x, ground + .04, z);
        super.add(rec, 'stone', hieiPaint(foot, 0x827b6d)); foot.dispose();
        wallTimber(.1, postTop - footTop, .1, x, (footTop + postTop) / 2, z);
        wallTimber(.12, beamH, depth, x, top - beamH / 2, side * center);
      }
    }
    // 四周に軒を出す堂は、隅の垂木も斜めの隅木で下から受ける。
    // 焼失前の断面・仕口は推定。垂木下面へ上端を合わせ、天井板を貫かない。
    // 壁の隅から軒先まで通し、共通の箱と既存の木材のまとめ描きへ納める。
    const eaveHips = (eave, rafterBottom) => {
      const reach = eave - .05, length = Math.hypot(reach, reach);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const g = this.hallBeamShape.clone();
        g.scale(length, .16, .18);
        hieiTimberGrain(g, 0, (sx * .37 + sz * .53) % 1);
        g.rotateY(-Math.atan2(sz, sx));
        g.translate(sx * (b.w / 2 + reach / 2), rafterBottom - .08,
          sz * (b.d / 2 + reach / 2));
        super.add(rec, 'wood', hieiPaint(g, 0x4a3020)); g.dispose();
      }
    };
    // 回り縁は共通の伽藍側で框・下地・縁板と歩く床を一組として作る。
    // 別方向の薄板を上張りすると、下の板の目地を覆い、
    // 歩く床より板面も高くなるため、ここでは重ねない。
    // 室内も同じ柱割を使う。内外で別々に間引くと、窓脇や戸脇の柱筋がずれる。
    lv.wallPosts = [];
    for (const face of ['x', 'z']) for (const side of [-1, 1]) {
      const len = face === 'z' ? b.w : b.d, off = (face === 'z' ? b.d : b.w) / 2;
      const openings = (lv.windows || []).filter(v => v.face === face && v.s === side)
        .map(v => ({ t: v.t, w: v.w }));
      if (face === 'z' && side === rec.naka.door.side) openings.push({ t: rec.naka.door.lx, w: rec.naka.door.w });
      const posts = new Set(), n = Math.max(2, Math.round(len / 1.9));
      // 堂内の繋梁と内陣境の梁、僧坊の座敷境の梁を側壁の柱で受ける。
      // 等間隔だけの柱割では梁端が白壁の途中に掛かっていた。
      // 内外で同じ柱筋を使い、近くの定間隔の柱は省いて重ねない。
      if (face === 'x' && ['chudo', 'hondo', 'sobo'].includes(rec.naka.kind)) {
        const bearings = new Set();
        if (rec.naka.kind === 'sobo') {
          // 襖・障子の間仕切りと天井の横梁に柱筋を合わせる。
          // 外周の隅柱は既にあるため、部屋の境だけを拾う。細かな柱割は推定。
          for (const room of lv.layout.rooms) for (const z of [room.z0, room.z1]) {
            if (z > -b.d / 2 + .2 && z < b.d / 2 - .2) bearings.add(z);
          }
        } else {
          for (const room of lv.layout.rooms) bearings.add((room.z0 + room.z1) / 2);
          const naijin = lv.layout.rooms.find(room => room.name === '内陣');
          // 内陣境の丸柱・横梁と同じ柱芯で側柱を立てる。
          // 古い十五センチの寄せ方では、梁の受けから柱筋が五センチずれていた。
          if (naijin) bearings.add(naijin.z1 - HIEI_NAIJIN_POST_SETBACK);
        }
        for (const t of bearings) {
          if (!openings.some(v => Math.abs(t - v.t) < v.w / 2 + .22)) posts.add(t);
        }
      }
      for (let q = 1; q < n; q++) {
        const t = -len / 2 + q * len / n;
        if (!openings.some(v => Math.abs(t - v.t) < v.w / 2 + .22)
          && ![...posts].some(p => Math.abs(t - p) < .32)) posts.add(t);
      }
      for (const v of openings) for (const edge of [-1, 1]) posts.add(v.t + edge * (v.w / 2 + .08));
      const innerPosts = [-len / 2, len / 2];
      for (const t of posts) {
        if (Math.abs(t) > len / 2 - .2) continue;
        innerPosts.push(t);
        if (face === 'z') wallTimber(.16, lv.h, .16, t, (wallBase + wallTop) / 2, side * off);
        else wallTimber(.16, lv.h, .16, side * off, (wallBase + wallTop) / 2, t);
      }
      lv.wallPosts.push({ face, side, positions: innerPosts });
      // 明かり取りの外側にも窓台と上枠を渡し、左右の柱へ掛ける。
      // 内側だけに枠があると、外からは壁を切った穴で終わっていた。
      // 開口の上下へ納め、障子の二本溝・格子・通行の当たりには出さない。
      // 焼失前の細かな断面は推定。共通の箱と木材のまとめ描きを使う。
      for (const v of lv.windows || []) {
        if (v.face !== face || v.s !== side) continue;
        for (const height of [v.y0 - .05, v.y1 + .05]) {
          const cy = wallBase + height;
          if (face === 'z') wallTimber(v.w + .16, .1, .14,
            v.t, cy, side * (off + .06));
          else wallTimber(.14, .1, v.w + .16,
            side * (off + .06), cy, v.t);
          // 外の窓枠の内面は壁芯から一センチ内、室内の枠の外面は九センチ内。
          // その間を見込み材で閉じ、開口を斜めから見ても壁の中が透けないようにする。
          // 窓台・上枠の高さだけにつなぎ、格子・障子・引き戸の溝は塞がない。
          // 既存の箱と木材のまとめ描きを使い、焼失時も同じ棟として片付ける。
          if (face === 'z') wallTimber(v.w, .1, .08,
            v.t, cy, side * (off - .05));
          else wallTimber(.08, .1, v.w,
            side * (off - .05), cy, v.t);
        }
        // 窓脇も内外の柱をつなぎ、見込みを四周で閉じる。
        // 外柱の内面は壁芯から八センチ、内柱の外面は九センチ内。
        // 残る一センチだけを埋め、柱の面を重ねず、開口と障子の溝を保つ。
        const revealH = v.y1 - v.y0, revealY = wallBase + (v.y0 + v.y1) / 2;
        for (const edge of [-1, 1]) {
          const t = v.t + edge * (v.w / 2 + .08);
          if (face === 'z') wallTimber(.16, revealH, .01,
            t, revealY, side * (off - .085));
          else wallTimber(.01, revealH, .16,
            side * (off - .085), revealY, t);
        }
      }
      // 窓・入口より上で四周を結ぶ。正面戸の溝は室内側にあるため干渉しない。
      const cy = wallBase + hieiNageshiHeight(rec.naka.kind, lv.h);
      // 左右の通し長押の内面（壁から五センチ外）まで延ばし、隅の隙間を閉じる。
      if (face === 'z') wallTimber(len + .1, .12, .08, 0, cy, side * (off + .09));
      else wallTimber(.08, .12, len + .26, side * (off + .09), cy, 0);
      // 外周の長押も柱筋で留め、内外の釘頭を堂内と同じ八角の釘隠しで覆う。
      // 焼失前の金具は推定。内側は室内の長押、外側は上の長押の表面へ納める。
      // 共通の形を使って既存のまとめ描きへ加え、戸の溝や通行の当たりは広げない。
      this.nageshiNailShape ||= new THREE.CylinderGeometry(.036, .036, .008, 8).rotateX(Math.PI / 2);
      // 室内の正面長押は、引き戸を避けた戸柱と同じ面へ寄せる。
      // 室内壁は外壁から十センチ内側。長押の見付け面へ金具の背面を接する。
      // 正面はさらに二十二センチ、ほかは六センチ寄せた長押の厚み五センチを足す。
      const innerNail = -( .1 + (face === 'z' && side === rec.naka.door.side ? .22 : .06) + .05 + .004);
      for (const t of innerPosts) for (const surface of [innerNail, .135]) {
        // 隅柱の芯は長押の木口より外。室内側に下地のない金具を浮かせない。
        if (surface === innerNail && Math.abs(t) > len / 2 - .21) continue;
        const g = this.nageshiNailShape.clone();
        if (face === 'x') g.rotateY(Math.PI / 2);
        g.translate(face === 'z' ? t : side * (off + surface), cy,
          face === 'z' ? side * (off + surface) : t);
        super.add(rec, 'wood', hieiPaint(g, 0x34312b)); g.dispose();
      }
      // 柱脚と窓下も地覆・腰貫でつなぐ。柱の間を白壁だけで終わらせない。
      // 焼失前の仕口は推定。正面の戸口は床際から空け、内側の引き戸の溝へ出さない。
      // 側面を通し材とし、正背面はその内面で止める。
      // 厚さ十センチ・壁から三・五センチ外の材なので、内面は柱芯から一・五センチ内。
      // 四隅で上面を重ねず、側面の木口は正背面の外面まで延ばして閉じる。
      const tieEnd = len / 2 + (face === 'z' ? -.015 : .085);
      const spans = face === 'z' && side === rec.naka.door.side
        ? [[-tieEnd, rec.naka.door.lx - rec.naka.door.w / 2],
          [rec.naka.door.lx + rec.naka.door.w / 2, tieEnd]]
        : [[-tieEnd, tieEnd]];
      for (const [a, c] of spans) {
        if (c - a < .02) continue;
        for (const [height, thick] of [[.12, .16], [.72, .1]]) {
          if (face === 'z') wallTimber(c - a, thick, .1, (a + c) / 2, wallBase + height, side * (off + .035));
          else wallTimber(.1, thick, c - a, side * (off + .035), wallBase + height, (a + c) / 2);
        }
      }
      // 室内の地覆・腰貫は naka.js に揃える。僧坊だけ別の高さ・奥行きへ重ねない。
    }
    // 正面の戸柱と壁をつなぐ見込み板は naka.js の室内側で一度だけ作る。
    // 同じ位置へ戸の高さまで重ねると、堂と僧坊の戸口の表裏がちらつく。
    // 共通の通し材に揃え、引き戸の二本溝と開口の寸法を保つ。
    if (['chudo', 'hondo'].includes(rec.naka.kind)) {
      // 板敷きの端を地覆へ納め、内側の柱脚を四周で結ぶ。
      // 外側の腰貫は室内の壁面に隠れるため、内側にも床際の木を回す。
      // 焼失前の断面は推定。正面の敷居・動く格子戸の溝は空ける。
      const floorBase = lv.y - rec.y0, edge = .13, frameWidth = .12;
      // 左右の框を通し、正背面の木口はその内面で止める。
      // 柱芯まで双方を伸ばすと隅の上面が重なり、床際がちらつく。
      // 焼失前の仕口は推定。正面の戸口・敷居・当たりの幅は保つ。
      const frameEnd = b.w / 2 - edge - frameWidth / 2;
      for (const side of [-1, 1]) {
        wallTimber(frameWidth, .1, b.d - edge * 2 + frameWidth,
          side * (b.w / 2 - edge), floorBase + .05, 0);
        const spans = side === rec.naka.door.side
          ? [[-frameEnd, rec.naka.door.lx - rec.naka.door.w / 2],
            [rec.naka.door.lx + rec.naka.door.w / 2, frameEnd]]
          : [[-frameEnd, frameEnd]];
        for (const [a, c] of spans) if (c > a) wallTimber(c - a, .1, frameWidth,
          (a + c) / 2, floorBase + .05, side * (b.d / 2 - edge));
      }
      // 焼失前の柱割は断定せず、内陣・外陣の天井を受ける柱と梁を補う。
      // 中央の参拝路と、内陣の脇口・引き戸の引き込み先には置かない。
      const base = lv.y - rec.y0, top = base + lv.h - .11;
      // 壁際だけで途切れていた内法長押を、堂内の柱列にも通す。
      // 室内の鴨居・外周の長押と高さを揃え、天井の梁とは分ける。
      const nageshiY = base + hieiNageshiHeight(rec.naka.kind, lv.h);
      this.hallPostShape ||= new THREE.CylinderGeometry(.14, .14, 1, 8);
      // 堂内の丸柱を八角の棒のままにせず、上端を少し絞った丸い材にする。
      // 焼失前の断面の復元とは断定しない。柱脚の根巻は従来の八角を保つ。
      // 最大半径は既存の当たり以内。全堂で形を共有し、木材の束へまとめる。
      this.hallShaftShape ||= new THREE.CylinderGeometry(.13, .14, 1, 16);
      this.hallBeamShape ||= new THREE.BoxGeometry(1, 1, 1);
      // 堂内の横梁は下面を反らせた虹梁にする。焼失前の意匠の復元とは断定しない。
      // 上端は水平に保ち、中央でも従来の梁せいを残して桁とつなぐ。
      // 堂ごとに作り直さず、共通の形を設営時のまとめ描きへ使う。
      if (!this.hallRainbowShape) {
        const shape = new THREE.BoxGeometry(1, 1, 1, 12, 1, 1);
        const p = shape.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const t = p.getX(i) * 2;
          p.setY(i, p.getY(i) > 0 ? 0 : -.28 - .12 * t * t);
        }
        shape.computeVertexNormals();
        this.hallRainbowShape = shape;
      }
      // 虹梁端の木鼻を二つの角箱で終えず、下面を反らせ、先を絞る。
      // 意匠は推定。従来の張り出し・高さの内側に納め、全堂で同じ形を使う。
      if (!this.hallKibanaShape) {
        const shape = new THREE.BoxGeometry(.30, .18, .22, 6, 1, 1);
        const p = shape.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const t = (p.getX(i) + .15) / .30, curve = t * t;
          p.setXYZ(i, .11 + t * .30,
            p.getY(i) > 0 ? -.22 - .015 * curve : -.40 + .08 * curve,
            p.getZ(i) * (1 - .25 * curve));
        }
        shape.computeVertexNormals();
        hieiTimberGrain(shape, 0);
        this.hallKibanaShape = shape;
      }
      // 柱脚の根巻を薄く回し、床際の木口を保護する納まりにする。
      // 焼失前の金具の意匠は断定せず、柱と同じ八角の形を使う。
      // 張り出しは既存の柱の当たりの内側に収める。
      const postFoot = (x, z) => {
        // 胴と上下の縁を積み分け、上面を重ねてちらつかせない。
        // 下縁は床面へ据え、柱身が始まる二十二センチで上縁を止める。
        for (const [cy, h, scale] of [[base + .11, .17, .99], [base + .0125, .025, 1], [base + .2075, .025, 1]]) {
          const g = this.hallPostShape.clone();
          g.scale(scale, h, scale); g.translate(x, cy, z);
          super.add(rec, 'wood', hieiPaint(g, 0x34312b)); g.dispose();
        }
        // 根巻を一体の黒い台にせず、合わせ目を押さえる帯と鋲を見せる。
        // 焼失前の金具の復元とは断定しない。八角の面へ納め、
        // 通行の半径は広げず、既存の箱と木材のまとめ描きを使う。
        const face = .14 * .99 * Math.cos(Math.PI / 8);
        const angle = Math.PI / 8;
        const strip = this.hallBeamShape.clone().scale(.026, .16, .004);
        strip.rotateY(angle);
        strip.translate(x + Math.sin(angle) * (face + .002), base + .11,
          z + Math.cos(angle) * (face + .002));
        super.add(rec, 'wood', hieiPaint(strip, 0x454137)); strip.dispose();
        for (const height of [.06, .16]) {
          const pin = this.hallBeamShape.clone().scale(.012, .012, .004);
          pin.rotateY(angle);
          pin.translate(x + Math.sin(angle) * (face + .006), base + height,
            z + Math.cos(angle) * (face + .006));
          super.add(rec, 'wood', hieiPaint(pin, 0x625b48)); pin.dispose();
        }
      };
      // 長押を柱へ留める釘頭を、素朴な八角の釘隠しで覆う。
      // 焼失前の金具の意匠は推定。共通の形を使い、長押の表面だけに納める。
      this.nageshiNailShape ||= new THREE.CylinderGeometry(.036, .036, .008, 8).rotateX(Math.PI / 2);
      const nageshiNail = (x, z) => {
        for (const side of [-1, 1]) {
          const g = this.nageshiNailShape.clone();
          g.translate(x, nageshiY, z + side * .184);
          super.add(rec, 'wood', hieiPaint(g, 0x34312b)); g.dispose();
        }
      };
      // 斗を角箱のままにせず、下半分に斗繰りを付け、上の平らな面で肘木を受ける。
      // 焼失前の断面は推定。上面の幅・高さは保ち、梁との接点を動かさない。
      // 全堂で一つの形を使い、既存の木材のまとめ描きと燃焼の片付けに含める。
      if (!this.hallMasuShape) {
        const shape = new THREE.BoxGeometry(1, 1, 1, 1, 2, 1);
        const p = shape.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const scale = p.getY(i) < 0 ? .72 : 1;
          p.setXYZ(i, p.getX(i) * scale, p.getY(i), p.getZ(i) * scale);
        }
        shape.computeVertexNormals();
        this.hallMasuShape = shape;
      }
      const masu = (w, h, d, x, cy, z) => {
        const g = this.hallMasuShape.clone();
        g.scale(w, h, d);
        hieiTimberGrain(g, w >= d ? 0 : 2, (x * .37 + z * .53) % 1);
        g.translate(x, cy, z);
        super.add(rec, 'wood', hieiPaint(g, 0x634832)); g.dispose();
      };
      // 内陣境の中央柱も、堂内の柱列と同じ斗・肘木で横梁を受ける。
      // 梁の下面で止め、格天井と建具の通路へ張り出させない。
      // 共通の斗と箱形を木材のまとめ描きへ含め、設営時だけ作る。
      const postBearing = (drop = 0) => top - .64 - drop;
      const postHead = (x, z, drop = 0) => {
        for (let tier = 0; tier < 3; tier++) {
          const cy = postBearing(drop) + .03 + tier * .12, size = .28 + tier * .06;
          masu(size, .06, size, x, cy, z);
          const armY = cy + .06, reach = .52 + tier * .16;
          wallTimber(.18, .06, reach, x, armY, z);
          for (const side of [-1, 1]) {
            wallTimber((reach - .18) / 2, .06, .18,
              x + side * (reach + .18) / 4, armY, z);
          }
        }
      };
      // 柱身は最下段の斗の下面で止め、斗栱・虹梁を天井まで突き抜かせない。
      // 虹梁の反りによる下がりも柱と斗で共有し、共通の柱形を使い回す。
      const postShaft = (x, z, drop = 0) => {
        const bottom = base + .22, bearing = postBearing(drop);
        const g = this.hallShaftShape.clone();
        g.scale(1, bearing - bottom, 1);
        hieiTimberGrain(g, 1, (x * .37 + z * .53) % 1, true);
        g.translate(x, (bottom + bearing) / 2, z);
        super.add(rec, 'wood', hieiPaint(g, 0x634832)); g.dispose();
      };
      // 側柱に差した梁の端にも斗・肘木を添え、壁面だけで受けた形にしない。
      // 室内側の柱芯から持ち送りを出し、上の斗を梁下面へ接する。
      // 焼失前の細部は推定。窓・長押より上に納め、共通の箱とまとめ描きを使う。
      const wallBeamSeat = (z, beamDepth) => {
        const bottom = top - beamDepth;
        for (const side of [-1, 1]) {
          masu(.22, .08, .24, side * (b.w / 2 - .16),
            bottom - .20, z);
          wallTimber(.5, .08, .18, side * (b.w / 2 - .30),
            bottom - .12, z, 0x4a3020);
          masu(.18, .08, .24, side * (b.w / 2 - .42),
            bottom - .04, z);
        }
      };
      const frameZ = [];
      for (const room of lv.layout.rooms) {
        // 内陣は須弥壇の左右へ寄せ、中央の本尊と脇口への通路を空ける。
        const inner = room.name === '内陣';
        const z = (room.z0 + room.z1) / 2, span = b.w * (inner ? .4 : .64);
        const beamT = span / (span + .28), drop = .12 * beamT * beamT;
        frameZ.push(z);
        for (const x of [-span / 2, span / 2]) {
          postShaft(x, z, drop);
          postFoot(x, z);
          const [wx, wz] = rec.naka.P(x, z), solid = solidCircle(wx, wz, .14);
          solid.yBot = lv.y; solid.yTop = rec.y0 + top;
          rec.innerSolids.push(solid);
          // 虹梁は柱際ほど下面が下がる。平梁と同じ高さの斗栱では、
          // 上段の肘木が梁へ十センチほど埋まるため、柱芯の下面で受ける。
          // 梁の形と同じ放物線を使い、内陣境の平梁の斗栱は元の高さに保つ。
          postHead(x, z, drop);
        }
        // 高い外陣の柱頭を、虹梁より下の頭貫でも横につなぐ。
        // 長押だけで離れていた柱列を結ぶ推定の納まり。内陣の天蓋は避ける。
        // 低い堂では長押・斗栱と重なるため足さず、頭上の通路も確保する。
        const tieTop = postBearing(drop) - .04, tieH = .18;
        if (!inner && tieTop - tieH > Math.max(base + 2.4, nageshiY + .12)) {
          const cy = tieTop - tieH / 2;
          wallTimber(span + .48, tieH, .12, 0, cy, z, 0x4a3020);
          // 柱を貫いた材は外側の楔で留める。先細りの形を全堂で使い回す。
          if (!this.hallTieWedgeShape) {
            const shape = this.hallBeamShape.clone(), p = shape.attributes.position;
            for (let i = 0; i < p.count; i++) {
              if (p.getY(i) < 0) p.setX(i, p.getX(i) * .35);
            }
            shape.computeVertexNormals();
            this.hallTieWedgeShape = shape;
          }
          for (const side of [-1, 1]) {
            const wedge = this.hallTieWedgeShape.clone().scale(.045, .24, .14);
            hieiTimberGrain(wedge, 1);
            wedge.translate(side * (span / 2 + .17), cy, z);
            super.add(rec, 'wood', hieiPaint(wedge, 0x95704a)); wedge.dispose();
          }
        }
        // 格縁の下面へ梁の上端を合わせ、格天井を突き抜けない。
        const beam = this.hallRainbowShape.clone();
        beam.scale(span + .28, 1, .24);
        hieiTimberGrain(beam, 0, z * .53 % 1);
        beam.translate(0, top, z);
        super.add(rec, 'wood', hieiPaint(beam, 0x4a3020)); beam.dispose();
        // 虹梁の木口を柱面で切り落とさず、柱の外へ短い木鼻を出す。
        // 梁端を留める楔も柱の両面へ納め、接合部を一枚の棒で終えない。
        // 焼失前の仕口は推定。共通の箱を使い、既存の木材のまとめ描きに含める。
        // 柱頭だけに置くため、内陣の脇口・格子戸・参拝路の当たりは広げない。
        for (const side of [-1, 1]) {
          const x = side * span / 2;
          const nose = this.hallKibanaShape.clone();
          if (side < 0) nose.rotateY(Math.PI);
          nose.translate(x, top, z);
          super.add(rec, 'wood', hieiPaint(nose, 0x634832)); nose.dispose();
          for (const face of [-1, 1]) {
            wallTimber(.055, .14, .055, x, top - .19,
              z + face * .1475, 0x95704a);
          }
        }
        // 中央の虹梁だけで終えず、側柱まで繋梁を渡して脇の格天井を受ける。
        // 柱頭の上へ掛け、格子戸・窓・須弥壇の高さには下げない。
        const wallX = b.w / 2 - .08, postX = span / 2;
        wallBeamSeat(z, .22);
        for (const side of [-1, 1]) {
          wallTimber(wallX - postX + .14, .22, .2,
            side * (wallX + postX) / 2, top - .11, z, 0x4a3020);
          // 繋梁の両端も込栓で留め、柱へ棒を突き合わせただけの見た目にしない。
          // 焼失前の仕口の細部は推定。柱際の梁の中へ納め、栓の木口だけを両面へ出す。
          // 虹梁側・側柱側で共通の箱を使い、既存のまとめ描きと燃焼に含める。
          for (const x of [postX + .12, wallX - .12]) {
            for (const face of [-1, 1]) wallTimber(.045, .065, .012,
              side * x, top - .11, z + face * .106, 0x95704a);
          }
        }
        // 柱の前後に挟み、柱面へ掛ける。頭上に納めて参拝路を空ける。
        // 既存の形と材質のまとめ描きを使い、焼失時も柱と一緒に片付ける。
        for (const side of [-1, 1]) {
          wallTimber(span + .36, .12, .07, 0, nageshiY,
            z + side * .145, 0x4a3020);
        }
        for (const x of [-span / 2, span / 2]) nageshiNail(x, z);
        // 横の長押だけでは柱列の前後が途切れるため、外壁と内陣境の長押へつなぐ。
        // 内陣と外陣では柱筋が違う。境の横木で受け、斜めにつながない。
        // 柱を両側から抱き、格子戸の鴨居より上へ納める。細部は推定。
        // 横の長押を通し、縦の長押はその側面で止める。同じ高さで交差させない。
        // 内陣境は中央柱の前後の長押、外周は室内側の長押の内面へ合わせる。
        // 正面の戸柱側だけ壁から二十二センチ寄る。共通の室内と寸法を揃える。
        const front = room.z0 <= -b.d / 2 + .01
          ? -b.d / 2 + (rec.naka.door.side < 0 ? .27 : .11) : room.z0 - HIEI_NAIJIN_POST_SETBACK + .18;
        const back = room.z1 >= b.d / 2 - .01
          ? b.d / 2 - (rec.naka.door.side > 0 ? .27 : .11) : room.z1 - HIEI_NAIJIN_POST_SETBACK - .18;
        const runs = [[front, z - .18], [z - .11, z + .11], [z + .18, back]];
        for (const x of [-span / 2, span / 2]) for (const side of [-1, 1]) {
          for (const [a, c] of runs) {
            const start = Math.max(front, a), end = Math.min(back, c);
            if (end > start) wallTimber(.07, .12, end - start, x + side * .145,
              nageshiY, (start + end) / 2, 0x4a3020);
          }
          const nail = this.nageshiNailShape.clone();
          nail.rotateY(Math.PI / 2);
          nail.translate(x + side * .184, nageshiY, z);
          super.add(rec, 'wood', hieiPaint(nail, 0x34312b)); nail.dispose();
        }
      }
      // 内陣境の高い小壁も柱と梁で受ける。焼失前の細かな柱割は推定。
      // 中央の固定格子の背面へ柱を寄せ、左右の脇口と戸の引き込み先を空ける。
      const naijin = lv.layout.rooms.find(room => room.name === '内陣');
      if (naijin) {
        // 格子脇の角柱の背面へ丸柱の前面を合わせ、三本の柱を食い込ませない。
        // 柱頭・梁・長押・当たりも同じ柱芯で揃え、左右の脇戸は保つ。
        const z = naijin.z1, postZ = z - HIEI_NAIJIN_POST_SETBACK;
        postShaft(0, postZ);
        postFoot(0, postZ);
        postHead(0, postZ);
        const [wx, wz] = rec.naka.P(0, postZ), solid = solidCircle(wx, wz, .14);
        solid.yBot = lv.y; solid.yTop = rec.y0 + top;
        rec.innerSolids.push(solid);
        // 天井直下の梁を外周まで渡し、中央柱と両端の壁柱で支える。
        wallTimber(b.w - .16, .28, .24, 0, top - .14, postZ, 0x4a3020);
        wallBeamSeat(postZ, .28);
        // 鴨居の上の長押も柱面でつなぎ、格子戸が滑る手前の溝には出さない。
        for (const side of [-1, 1]) {
          wallTimber(b.w - .16, .12, .07, 0, nageshiY, postZ + side * .145, 0x4a3020);
        }
        nageshiNail(0, postZ);
        // 小壁の束・貫と、その間へ納める塗り壁は室内の共通部品で作る。
        // ここでも別の柱割を重ねると、束が塗り壁を貫き、横貫が二段になる。
        // 中央の通し柱・長押・天井直下の梁だけをこの棟の架構として残す。
      }
      // 四周の側柱を頭貫で結び、繋梁と桁の端を受ける。細かな仕口は推定。
      // 天井の細い回縁とは分け、既存の柱頭の高さへ納める。
      for (const side of [-1, 1]) {
        // 側面を通し材とし、正背面の木口をその内面で止める。
        // 四隅で同じ下面を重ねず、柱頭を囲む頭貫としてつなぐ。
        wallTimber(b.w - .36, .32, .2, 0, top - .16, side * (b.d / 2 - .08), 0x4a3020);
        wallTimber(.2, .32, b.d + .04, side * (b.w / 2 - .08), top - .16, 0, 0x4a3020);
      }
      // 内陣と外陣の架構を桁でつなぐ。狭い方の柱筋で両方の横梁に掛ける。
      // 前後も側柱の頭貫まで延ばし、部屋の中央だけで桁を途切れさせない。
      // 桁と虹梁の上端を揃えて交差部を組み、側柱の頭貫にも十分に掛ける。
      // 桁を虹梁の下へ吊るさず、格天井の格縁の下面で止める。
      if (frameZ.length > 1) {
        // 桁を虹梁・繋梁・内陣境の梁へ貫通させず、各梁の側面で継ぐ。
        // 前後も頭貫の内面で止め、同じ高さの下面が重ならないようにする。
        // 仕口の細部は推定。部材は従来のまとめ描きだけに含める。
        const a = -b.d / 2 + .18, c = b.d / 2 - .18;
        const joints = [...frameZ];
        if (naijin) joints.push(naijin.z1 - HIEI_NAIJIN_POST_SETBACK);
        joints.sort((left, right) => left - right);
        for (const x of [-b.w * .2, b.w * .2]) {
          let start = a;
          for (const z of joints) {
            const end = Math.min(c, z - .12);
            if (end > start) wallTimber(.18, .22, end - start,
              x, top - .11, (start + end) / 2, 0x4a3020);
            start = Math.max(start, z + .12);
          }
          if (c > start) wallTimber(.18, .22, c - start,
            x, top - .11, (start + c) / 2, 0x4a3020);
          // 桁の木口を横梁へ突き合わせるだけにせず、細い枘を梁内へ通し、
          // 前後の込栓で留める。焼失前の仕口の細部は推定。
          // 栓の木口だけを梁面の外へ出し、格縁・柱頭の金具とは重ねない。
          // 共通の箱と木材のまとめ描きを使い、通路の当たりは増やさない。
          for (const z of joints) {
            wallTimber(.10, .10, .28, x, top - .08, z, 0x4a3020);
            for (const face of [-1, 1]) wallTimber(.035, .035, .012,
              x, top - .08, z + face * .126, 0x95704a);
          }
        }
      }
      // 天蓋の吊り棒を薄い天井板だけで受けず、前後の吊り受け材から桁へ荷重を渡す。
      // 焼失前の仕口は推定。二本の桁の下面へ掛け、格天井の下に納める。
      // 吊り棒の上端は interior_parts.js と同じ天井下四十五センチに揃える。
      lv.layout.altarSuspensionDrop = .45;
      for (const altar of lv.layout.props) {
        if (altar.part !== 'altar') continue;
        for (const offset of [-.32, .16]) {
          const z = altar.z + offset * altar.d;
          wallTimber(b.w * .4 + .18, .12, .1,
            0, base + lv.h - .39, z, 0x4a3020);
          // 天蓋の吊り棒を受け材の下面へ突き当てるだけにせず、
          // 四隅を鉄の帯で抱き、横栓で棒を留める推定の納まりにする。
          // 棒の位置は室内部品と揃え、帯は受け材の表裏と上面へ回す。
          // 共通の箱と既存のまとめ描きに含め、光源・当たり・更新は足さない。
          for (const side of [-1, 1]) {
            const x = altar.x + side * .6 * altar.w / 2.1;
            const cy = base + lv.h - .39;
            for (const face of [-1, 1]) {
              wallTimber(.06, .15, .012, x, cy - .005,
                z + face * .056, 0x34312b);
              wallTimber(.022, .022, .008, x, cy - .07,
                z + face * .066, 0x514b40);
            }
            wallTimber(.06, .012, .124, x, cy + .066, z, 0x34312b);
            // 横栓は吊り棒の上端二センチを貫き、帯の両面へ通す。
            wallTimber(.018, .018, .124, x, cy - .07, z, 0x34312b);
          }
          // 吊り受け材を桁の下面へ当てるだけにせず、枘を桁へ差して込栓で留める。
          // 焼失前の仕口は推定。枘は桁内、栓の木口だけを桁の側面へ出す。
          // 天蓋・吊り棒の位置と通路は保ち、共通の箱と木材のまとめ描きを使う。
          for (const side of [-1, 1]) {
            const x = side * b.w * .2;
            wallTimber(.08, .16, .06, x, base + lv.h - .27, z, 0x4a3020);
            for (const face of [-1, 1]) wallTimber(.012, .035, .035,
              x + face * .096, base + lv.h - .25, z, 0x95704a);
          }
        }
      }
    }
    // 木の踏板を持つ僧坊と小堂は、同じ床下の支えを使う。
    // 中堂の張り出した縁には専用の支えがあるため、ここでは重ねない。
    if (['sobo', 'hondo'].includes(rec.naka.kind)) {
      // 木の上がり口の踏板を、地面からの束と桁で受ける。細部は推定。
      // naka.js の踊り場と同じ外寸を使い、戸の溝より外・石段の両脇へ納める。
      // 材質別のまとめ描きと焼失時の片付けを使い、更新処理は増やさない。
      const landingWidth = rec.naka.door.w + .4;
      const landingZ = rec.naka.door.side * (b.d / 2 + rec.naka.approach.pad - .04);
      const landingTop = lv.y - rec.y0 - .12;
      wallTimber(landingWidth, .1, .08, rec.naka.door.lx,
        landingTop - .05, landingZ, 0x4a3020);
      this.footStoneShape ||= new THREE.BoxGeometry(1, 1, 1);
      for (const side of [-1, 1]) {
        const x = rec.naka.door.lx + side * (landingWidth / 2 - .05);
        const [wx, wz] = rec.naka.P(x, landingZ);
        const ground = this.W.heightAt(wx, wz) - rec.y0;
        const bottom = Math.min(ground + .06, landingTop - .12);
        const top = landingTop - .1;
        wallTimber(.08, top - bottom, .08, x, (bottom + top) / 2, landingZ);
        const stoneBottom = Math.min(ground - .1, bottom - .08);
        const foot = this.footStoneShape.clone();
        foot.scale(.14, bottom - stoneBottom, .14);
        foot.translate(x, (bottom + stoneBottom) / 2, landingZ);
        super.add(rec, 'stone', hieiPaint(foot, 0x827b6d)); foot.dispose();
        const solid = solidCircle(wx, wz, .07);
        solid.yBot = rec.y0 + stoneBottom; solid.yTop = rec.y0 + top;
        rec.innerSolids.push(solid);
      }
    }
    if (rec.naka.kind === 'sobo') {
      // 紙障子の明かり取りは、外へ張り出す板の小庇で雨を切る。
      // 焼失前の窓庇の細部は推定。共通の窓割を使い、戸の溝より外へ納める。
      // 開口上端より高い所だけに置き、室内の引き戸・通路の当たりは増やさない。
      for (const win of lv.windows) {
        if (!win.shoji) continue;
        const across = win.face === 'z', side = win.s;
        const wall = (across ? b.d : b.w) / 2;
        const width = win.w + .24, reach = .4, fall = .12;
        const head = lv.y - rec.y0 + win.y1;
        const slope = Math.atan2(fall, reach), length = Math.hypot(reach, fall);
        // 室内の水平な窓台だけで終えず、外側へ下がる水切り板を続ける。
        // 焼失前の断面は推定。根元を窓台へ差し、先端は白壁から離して雨を落とす。
        // 障子の二本溝より外・開口より下へ納め、既存の木材の束へまとめる。
        const sill = lv.y - rec.y0 + win.y0;
        const sillReach = .24, sillFall = .04, sillThickness = .045;
        const sillSlope = Math.atan2(sillFall, sillReach);
        const sillBoard = this.hallBeamShape.clone();
        sillBoard.scale(across ? width : Math.hypot(sillReach, sillFall), sillThickness,
          across ? Math.hypot(sillReach, sillFall) : width);
        hieiTimberGrain(sillBoard, across ? 0 : 2, win.t * .53 % 1);
        if (across) sillBoard.rotateX(side * sillSlope);
        else sillBoard.rotateZ(-side * sillSlope);
        const sillOut = side * (wall + .10);
        sillBoard.translate(across ? win.t : sillOut,
          sill - .01 - sillFall / 2 - sillThickness / (2 * Math.cos(sillSlope)),
          across ? sillOut : win.t);
        super.add(rec, 'wood', hieiPaint(sillBoard, 0x634832)); sillBoard.dispose();
        // 三枚の横板を勾配に沿わせ、板端の合わせ目も左右の受け桟へ載せる。
        for (let q = 0; q < 3; q++) {
          const along = (q - 1) * length / 3;
          const g = this.hallBeamShape.clone();
          g.scale(across ? width : length / 3 - .002, .035,
            across ? length / 3 - .002 : width);
          hieiTimberGrain(g, across ? 0 : 2, q * .17);
          if (across) g.rotateX(side * slope);
          else g.rotateZ(-side * slope);
          const out = side * (wall + .18 + along * Math.cos(slope));
          g.translate(across ? win.t : out, head + .22 - along * Math.sin(slope),
            across ? out : win.t);
          super.add(rec, 'wood', hieiPaint(g, q % 2 ? 0x80694c : 0x7a6348));
          g.dispose();
        }
        for (const offset of [-win.w / 2 - .06, win.w / 2 + .06]) {
          const t = win.t + offset;
          // 桟も同じ勾配にし、全長で板の下面へ接する。根元は窓脇へ差し込む。
          const g = this.hallBeamShape.clone(), drop = (.035 + .06) / 2;
          g.scale(across ? .06 : length, .06, across ? length : .06);
          hieiTimberGrain(g, across ? 2 : 0, offset);
          if (across) g.rotateX(side * slope);
          else g.rotateZ(-side * slope);
          const out = side * (wall + .18 - Math.sin(slope) * drop);
          g.translate(across ? t : out, head + .22 - Math.cos(slope) * drop,
            across ? out : t);
          super.add(rec, 'wood', hieiPaint(g, 0x4a3020)); g.dispose();
          // 小庇の受け桟を窓脇の柱から方杖で支える。細かな納まりは推定。
          // 開口の両脇・外壁の外へ納め、室内を滑る障子と窓の見通しを空ける。
          // 桟の下面へ先端を合わせ、既存の箱・木材のまとめ描きだけを使う。
          const braceReach = .3, braceStart = .02;
          const braceTop = head + .22 - (braceStart + braceReach - .18) * fall / reach
            - .035 / (2 * Math.cos(slope)) - .06 / Math.cos(slope);
          const braceBottom = head - .12, braceRise = braceTop - braceBottom;
          const braceLength = Math.hypot(braceReach, braceRise);
          const braceAngle = Math.atan2(braceRise, braceReach);
          const brace = this.hallBeamShape.clone();
          brace.scale(across ? .055 : braceLength, .055, across ? braceLength : .055);
          hieiTimberGrain(brace, across ? 2 : 0, offset);
          if (across) brace.rotateX(-side * braceAngle);
          else brace.rotateZ(side * braceAngle);
          const braceOut = side * (wall + braceStart + braceReach / 2);
          brace.translate(across ? t : braceOut, (braceBottom + braceTop) / 2,
            across ? braceOut : t);
          super.add(rec, 'wood', hieiPaint(brace, 0x634832)); brace.dispose();
        }
      }
      // 僧坊の座敷境・板間境の天井梁を、壁際と戸口脇の柱の肘木で受ける。
      // 竿縁の下面へ梁だけが浮かないよう、柱頭から梁の下面まで束を立てる。
      // 細かな仕口は推定。襖・障子の鴨居より上、長押の裏側へ納める。
      // 室内の梁は天井板の下面で受ける。束・枘・楔も同じ梁下へ揃える。
      const base = lv.y - rec.y0, beamBottom = base + lv.h - .022 - .14;
      const bearingY = base + Math.min(2, lv.h - .5) + .12;
      // 座敷境の横梁の端を細い天井回縁だけで受けず、四周の柱を頭貫で結ぶ。
      // 梁の下面へ上端を合わせ、外周の柱筋に掛ける。焼失前の仕口は推定。
      // 窓・建具より上、壁の厚みの内側へ納め、既存の箱とまとめ描きを使う。
      const tieHeight = .12, tieY = beamBottom - tieHeight / 2;
      for (const side of [-1, 1]) {
        // 僧坊も側面を通し、隅の下面を二重にしない。
        wallTimber(b.w - .32, tieHeight, .16, 0, tieY,
          side * (b.d / 2 - .08), 0x4a3020);
        wallTimber(.16, tieHeight, b.d, side * (b.w / 2 - .08),
          tieY, 0, 0x4a3020);
      }
      // 頭貫を柱へ通すだけで終えず、柱際の楔で抜けを止める納まりを見せる。
      // 焼失前の仕口は推定。窓の上の柱筋だけに置き、障子の溝へは下げない。
      // 柱を貫く木と楔を既存の箱・木材のまとめ描きへ納める。
      for (const row of lv.wallPosts) {
        const across = row.face === 'z', off = (across ? b.d : b.w) / 2 - .08;
        for (const t of row.positions) {
          // 隅は二方向の頭貫が交差するため、途中の柱だけを対象にする。
          if (Math.abs(t) >= (across ? b.w : b.d) / 2 - .2) continue;
          for (const edge of [-1, 1]) {
            const along = t + edge * .115;
            wallTimber(across ? .035 : .2, .17, across ? .2 : .035,
              across ? along : row.side * off, tieY,
              across ? row.side * off : along, 0x95704a);
          }
        }
      }
      // 座敷境の横梁の両端を側柱の持ち送りで受ける。
      // 頭貫だけへ突き合わせず、柱面から短い肘木と束を出して梁下へつなぐ。
      // 焼失前の仕口は推定。側窓のない間仕切りの柱筋だけに納め、
      // 障子・襖の溝より上で止める。形・材質は既存のまとめ描きを使う。
      const wallBearings = new Set();
      for (const room of lv.layout.rooms) for (const z of [room.z0, room.z1]) {
        if (z > -b.d / 2 + .2 && z < b.d / 2 - .2) wallBearings.add(z);
      }
      for (const z of wallBearings) for (const side of [-1, 1]) {
        const post = lv.wallPosts.find(p => p.face === 'x' && p.side === side);
        if (!post?.positions.some(t => Math.abs(t - z) < .01)) continue;
        // 横梁は壁から十センチまで、室内柱の内面は二十三センチ。
        // 持ち送りは柱に掛け、束の上端を梁下面へ合わせる。
        wallTimber(.38, .08, .18, side * (b.w / 2 - .27),
          beamBottom - .2, z, 0x4a3020);
        wallTimber(.12, .16, .14, side * (b.w / 2 - .36),
          beamBottom - .08, z, 0x634832);
        // 側柱側の束も横梁へ枘差しし、両面の込栓で抜けを止める納まりにする。
        // 焼失前の仕口は推定。枘は梁の中へ隠し、栓の木口だけを梁幅十八センチの外へ出す。
        // 共通の箱と木材のまとめ描きを使い、天井板・建具の溝・通路へは張り出させない。
        const jointX = side * (b.w / 2 - .36);
        wallTimber(.07, .1, .1, jointX, beamBottom + .05, z, 0x634832);
        for (const face of [-1, 1]) wallTimber(.045, .045, .012,
          jointX, beamBottom + .065, z + face * .096, 0x95704a);
      }
      // 間仕切りの釘隠しは共通の室内部品で柱の両面へ取り付ける。
      // 同じ位置へ重ねて描かず、長押と金具のちらつきを防ぐ。
      // 長押の上は梁下まで十八ミリしか残らない。小壁は室内部品に任せ、
      // 塗り壁を貫く横木を重ねない。梁を受ける戸口脇の束・肘木は残す。
      const ends = new Set();
      for (const v of lv.layout.walls) {
        if (!v.paper || v.guideOnly || Math.abs(v.az - v.bz) > .01) continue;
        const a = Math.min(v.ax, v.bx), c = Math.max(v.ax, v.bx);
        for (const [x, inward] of [[a + .06, 1], [c - .06, -1]]) {
          // 戸口脇も既存の柱筋から束を立て、長い梁を壁際だけで支えない。
          // 肘木は間仕切り側へ向け、鴨居より上・動く戸の溝より奥に納める。
          const key = x.toFixed(3) + ':' + v.az.toFixed(3);
          if (ends.has(key) || beamBottom <= bearingY + .08) continue;
          ends.add(key);
          const width = Math.min(.4, c - a), cx = x + inward * (width / 2 - .06);
          wallTimber(width, .08, .18, cx, bearingY + .04, v.az, 0x4a3020);
          wallTimber(.12, beamBottom - bearingY - .08, .14, x,
            (bearingY + .08 + beamBottom) / 2, v.az, 0x634832);
          // 束の上端を梁の下面で切るだけにせず、梁を貫く枘と両面の楔で留める。
          // 焼失前の仕口は推定。座敷境・入口境で同じ納まりを使い、
          // 鴨居・欄間より上に収める。既存の箱と木材のまとめ描きへ加える。
          // 枘の下端を束へ一センチ差し込み、梁脇に見える木口を束から離さない。
          // 上端は従来どおり梁内に止め、天井板と楔の高さは保つ。
          wallTimber(.07, .14, .24, x, beamBottom + .06, v.az, 0x634832);
          for (const side of [-1, 1]) {
            wallTimber(.12, .035, .045, x, beamBottom + .07,
              v.az + side * .1175, 0x95704a);
          }
        }
      }
    }
    // 軒を受ける斗栱と柱列。火で潰れる範囲にも同じ建物として登録する。
    // 僧坊の低い軒裏に堂と同じ三段を入れると、上段が天井板を突き抜ける。
    // 二段目を化粧垂木へ掛け、堂だけ三段にする。柱筋・戸口・当たりは共通。
    const bracketTiers = ['chudo', 'hondo'].includes(rec.naka.kind) ? 3 : 2;
    for (const sd of [-1, 1]) {
      const door = rec.naka.door;
      // 僧坊・山の堂は室内と同じ窓割で軒柱を立てる。
      // 等間隔の別の柱列を重ねると、背面障子の中央を柱が塞ぐ。
      // 中堂の縁柱は既存の九間を保ち、戸口の幅だけ空ける。
      const posts = grand ? Array.from({ length: 10 }, (_, q) => {
        const x = -half + q * half * 2 / 9;
        return sd === door.side && Math.abs(x) < door.w / 2 + .3
          ? Math.sign(x) * (door.w / 2 + .35) : x;
      }) : lv.wallPosts.find(row => row.face === 'z' && row.side === sd).positions;
      const z = sd * (b.d / 2 + (grand ? 1.2 : .08));
      for (let px of posts) {
        // 礎石まで戸口へ出さず、戸脇の柱には斗栱も追従させる。
        if (!grand && sd === door.side && Math.abs(px - door.lx) < door.w / 2 + .14) {
          px = door.lx + Math.sign(px - door.lx) * (door.w / 2 + .14);
        }
        for (let j = 0; j < bracketTiers; j++) wallTimber(.34 + j*.22, .13, .38 + j*.32,
          px, y + j*.16, z, 0x72553a);
        if (!grand) {
          const [wx, wz] = rec.naka.P(px, z);
          // 軒柱を土へ直接差さず、地面に据えた礎石で受ける。柱筋と戸口の幅は保つ。
          const ground = this.W.heightAt(wx, wz) - rec.y0;
          const stoneBottom = Math.min(floor - .18, ground - .15), bottom = Math.min(floor, ground + .12);
          this.footStoneShape ||= new THREE.BoxGeometry(1, 1, 1);
          const foot = this.footStoneShape.clone();
          foot.scale(.26, bottom - stoneBottom, .26); foot.translate(px, (stoneBottom + bottom) / 2, z);
          super.add(rec, 'stone', hieiPaint(foot, 0x827b6d)); foot.dispose();
          const g = this.footStoneShape.clone();
          g.scale(.18, y - bottom, .18);
          // 戸口の角柱も室内の柱・長押と同じ縮尺の縦木目にする。
          // 単位箱のままでは数メートルの柱全体へ木肌が引き伸ばされる。
          hieiTimberGrain(g, 1, (px * .37 + z * .53) % 1);
          g.translate(px, (y + bottom) / 2, z); super.add(rec, 'wood', hieiPaint(g, 0x634832)); g.dispose();
          // 描いた柱と同じ位置・高さの当たり。焼失時は既存の片付けに含める。
          const solid = solidCircle(wx, wz, .09);
          solid.yBot = rec.y0 + bottom; solid.yTop = rec.y0 + y;
          rec.innerSolids.push(solid);
          const footSolid = solidCircle(wx, wz, .13);
          footSolid.yBot = rec.y0 + stoneBottom; footSolid.yTop = rec.y0 + bottom;
          rec.innerSolids.push(footSolid);
        }
      }
    }
    if (!grand) {
      // 入れる僧坊・山の堂は壁上端と屋根の間が開いていた。
      // 屋根の立ち上がりから床の厚み六センチを引いた小壁で小屋裏を閉じ、
      // その上端を桁で受ける。焼失前の断面は推定。室内の天井より上に納める。
      // 既存の箱とまとめ描きを使い、窓・引き戸・通行の当たりは増やさない。
      const rise = (rec.naka.kind === 'hondo' ? .4 : .15) - .06;
      for (const side of [-1, 1]) {
        // 正背面を通し、側面の木口へ合わせる。柱芯の幅で止めると隅に穴が残る。
        wallTimber(b.w + .12, rise, .12, 0, wallTop + rise / 2,
          side * b.d / 2, 0xd8d0bb);
        wallTimber(.12, rise, b.d - .12, side * b.w / 2,
          wallTop + rise / 2, 0, 0xd8d0bb);
        wallTimber(b.w + .18, .08, .18, 0, wallTop + rise - .04,
          side * b.d / 2, 0x4a3020);
        wallTimber(.18, .08, b.d - .18, side * b.w / 2,
          wallTop + rise - .04, 0, 0x4a3020);
      }
      if (rec.naka.kind === 'sobo') {
        // 切妻の両端を軒高の小壁だけで終えず、小屋裏まで妻壁で閉じる。
        // 屋根の曲面の下面を使い、直線の三角壁が屋根を貫いたり隙間を残したりしない。
        // 曲面屋根の粗い分割との差は、厚さ二十センチの屋根内へ四センチ差して閉じる。
        // 焼失前の細部は推定。天井より上だけに納め、建具と通路は保つ。
        const bottom = wallTop + rise, roofDepth = b.d / 2 + .8;
        const roofRise = roofDepth * .65;
        const roofBottom = (x, z) => {
          const t = 1 - Math.abs(z) / roofDepth;
          return bottom + roofRise * (.5 * t + .5 * t * t)
            + .22 * Math.pow(Math.abs(x) / (b.w / 2 + .6), 3) * (1 - t) * (1 - t) - .2;
        };
        this.gableWallShape ||= new THREE.BoxGeometry(1, 1, 1, 1, 1, 16);
        for (const side of [-1, 1]) {
          const wall = this.gableWallShape.clone(), p = wall.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const x = side * b.w / 2 + p.getX(i) * .12, z = p.getZ(i) * b.d;
            p.setXYZ(i, x, p.getY(i) > 0 ? roofBottom(x, z) + .04 : bottom, z);
          }
          wall.computeVertexNormals();
          // 妻壁も小壁と同じ塗り壁。登り梁・束は木材の束へ残す。
          super.add(rec, 'plaster', hieiPaint(wall, 0xd8d0bb)); wall.dispose();
          // 妻壁を棟束・脇束と登り梁で受ける。曲面は壁と同じ割付で追う。
          // 共通の箱と木材のまとめ描きを使い、焼失時も同じ棟として片付ける。
          const x = side * (b.w / 2 - .13);
          for (const z of [-b.d / 4, 0, b.d / 4]) {
            const top = roofBottom(x, z) - .14;
            wallTimber(.14, top - bottom, .14, x, (bottom + top) / 2, z);
          }
          for (let q = 0; q < 16; q++) {
            const a = -b.d / 2 + b.d * q / 16, c = -b.d / 2 + b.d * (q + 1) / 16;
            const ya = roofBottom(x, a) - .07, yc = roofBottom(x, c) - .07;
            const beam = this.hallBeamShape.clone();
            beam.scale(.14, .14, Math.hypot(c - a, yc - ya));
            hieiTimberGrain(beam, 2, a * .53 % 1);
            beam.rotateX(-Math.atan2(yc - ya, c - a));
            beam.translate(x, (ya + yc) / 2, (a + c) / 2);
            super.add(rec, 'wood', hieiPaint(beam, 0x634832)); beam.dispose();
          }
        }
      }
      // 僧坊・山の堂も、独立していた軒柱を四周の桁で結ぶ。
      // 柱頭と斗栱の下に納め、正面の障子・格子戸の上を空ける。
      // 既存の木材のまとめ描きと焼失範囲へ加え、更新時の処理は増やさない。
      const depth = b.d / 2 + .08;
      // 側面を通し材とし、正背面の桁の木口をその内面で止める。
      // 隅で下面を重ねず、柱の上で四周をつなぐ。焼失前の仕口は推定。
      // 柱・長押と同じ作り口を使い、木目も桁の長手へ通す。
      for (const side of [-1, 1]) {
        wallTimber(half * 2 - .2, .18, .2, 0, y - .09, side * depth, 0x4a3020);
        wallTimber(.2, .18, depth * 2 + .2, side * half, y - .09, 0, 0x4a3020);
      }
      // 脇の軒桁も柱と礎石で受ける。室内と同じ柱筋を使い、窓の前には立てない。
      // 隅は正背面の既存の柱で受ける。柱割・仕口は焼失前の復元とは断定しない。
      for (const row of lv.wallPosts) {
        if (row.face !== 'x') continue;
        const x = row.side * half;
        const windows = (lv.windows || []).filter(v => v.face === 'x' && v.s === row.side);
        for (const z of row.positions) {
          if (Math.abs(z) > b.d / 2 - .2 || windows.some(v => Math.abs(z - v.t) < v.w / 2 + .09)) continue;
          const [wx, wz] = rec.naka.P(x, z);
          const ground = this.W.heightAt(wx, wz) - rec.y0;
          const stoneBottom = Math.min(floor - .18, ground - .15);
          const bottom = Math.min(floor, ground + .12);
          wallTimber(.18, y - bottom, .18, x, (y + bottom) / 2, z);
          const foot = this.footStoneShape.clone();
          foot.scale(.26, bottom - stoneBottom, .26);
          foot.translate(x, (stoneBottom + bottom) / 2, z);
          super.add(rec, 'stone', hieiPaint(foot, 0x827b6d)); foot.dispose();
          // 礎石を含む実際の幅で当たりを付け、焼失時も建物と一緒に除く。
          for (const [radius, low, high] of [[.09, bottom, y], [.13, stoneBottom, bottom]]) {
            const solid = solidCircle(wx, wz, radius);
            solid.yBot = rec.y0 + low; solid.yTop = rec.y0 + high;
            rec.innerSolids.push(solid);
          }
          // 柱頭から側面の軒裏へ向けて肘木を掛ける。
          for (let j = 0; j < bracketTiers; j++) wallTimber(.38 + j * .32, .13, .34 + j * .22,
            x, y + j * .16, z, 0x72553a);
        }
      }
      // 中堂以外にも軒裏を張る。堂は四周、切妻の僧坊は正背面の軒へ納める。
      // 焼失前の細部は推定。屋根の出に合わせ、室内の天井と戸口には重ねない。
      const hall = rec.naka.kind === 'hondo';
      const eave = hall ? 1.5 : .8, ex = b.w / 2 + (hall ? 1.5 : .6);
      const ceilingY = y + (hall ? .48 : .30), rafterY = ceilingY - .07;
      if (hall) eaveHips(eave, rafterY - .045);
      const frontBays = Math.ceil(ex * 2 / .45), flankBays = Math.ceil(b.d / .45);
      // 長い一枚板にはせず、四本おきの垂木上で継ぐ。隣の列は二本ずらす。
      const ceilingBoards = (a, c, origin, spacing, offset, width, across, row, color) => {
        let start = a, joint = origin + (row % 2 ? 2 : 4) * spacing;
        while (start < c - .003) {
          const end = Math.min(c, joint), mid = (start + end) / 2;
          wallTimber(across ? end - start - .004 : width, .05,
            across ? width : end - start - .004,
            across ? mid : offset, ceilingY, across ? offset : mid, color);
          start = end;
          joint += spacing * 4;
        }
      };
      for (const side of [-1, 1]) {
        // 軒天を幅三十センチほどの板に割り、目地に厚みを持たせる。
        // 正背面を通し、側面はその木口で止める。板割は推定。
        // 中堂と同じ箱・木材のまとめ描きを使い、毎コマの処理は足さない。
        const rows = Math.max(1, Math.round(eave / .3)), pitch = eave / rows;
        for (let q = 0; q < rows; q++) {
          const offset = (q + .5) * pitch, width = pitch - .004;
          const color = q % 2 ? 0x80694c : 0x7a6348;
          ceilingBoards(-ex, ex, -ex + .06, (ex * 2 - .12) / frontBays,
            side * (b.d / 2 + offset), width, true, q, color);
          if (hall) ceilingBoards(-b.d / 2, b.d / 2, -b.d / 2, b.d / flankBays,
            side * (b.w / 2 + offset), width, false, q, color);
        }
        const bays = frontBays;
        for (let q = 0; q <= bays; q++) {
          const x = -ex + .06 + q * (ex * 2 - .12) / bays;
          wallTimber(.065, .09, eave, x, rafterY, side * (b.d / 2 + eave / 2));
        }
        wallTimber(ex * 2, .14, .1, 0, ceilingY - .045, side * (b.d / 2 + eave - .05));
        if (hall) {
          const bays = flankBays;
          for (let q = 1; q < bays; q++) wallTimber(eave, .09, .065, side * (b.w / 2 + eave / 2), rafterY, -b.d / 2 + q * b.d / bays);
          wallTimber(.1, .14, b.d, side * (b.w / 2 + eave - .05), ceilingY - .045, 0);
        }
      }
    }
    if (grand) {
      // 中堂の側面は一組の柱割で統一し、柱・礎石・斗栱・桁・当たりを重複させない。
      // 焼失前の柱割は推定。隅柱は正背面の既存の柱を使い、縁の通路を空ける。
      const depth = b.d / 2 + 1.2, sideBays = Math.max(2, Math.round(depth * 2 / 2.6));
      this.verandaPostShape ||= new THREE.CylinderGeometry(.276, .3, 1, 6, 1, true);
      const timber = (w, h, d, x, cy, z, color = 0x4a3020) => {
        // 回縁の桁・長押・軒裏も室内の材と同じ縮尺で木目を通す。
        // 単位箱の絵を長い材へ引き伸ばさず、既存のまとめ描きを使う。
        wallTimber(w, h, d, x, cy, z, color);
      };
      // 縁板と框は上で組んだ実際の板張りを使う。旧い線だけの目地を重ねない。
      // 屋根の出は三・八メートル。縁の幅一・五メートルで軒裏を切ると、
      // その外側は瓦の裏がむき出しになり、垂木も途中で終わっていた。
      // buildOpenTemple の屋根寸法へ揃え、縁板・柱・出入りの幅はそのまま使う。
      const eave = 3.8, ex = b.w / 2 + eave, ez = b.d / 2 + eave;
      // 縁側の頭上も板天井と化粧垂木で閉じる。焼失前の細かな軒裏は推定。
      // 四周の帯を板に割って身舎を囲み、室内の格天井には重ねない。
      // 垂木の下面を斗栱の上段へ掛け、板はその上に納める。
      // 共通の箱を使い、既存の木材のまとめ描き・焼失範囲へ含める。
      const ceilingY = y + .48, rafterY = y + .41;
      eaveHips(eave, rafterY - .045);
      const frontBays = Math.ceil(ex * 2 / .45), flankBays = Math.ceil(b.d / .45);
      const frontPitch = (ex * 2 - .12) / frontBays, flankPitch = b.d / flankBays;
      // 中堂も二十メートルを越す一枚板にせず、四本おきの垂木上で板を継ぐ。
      // 隣の板列は二本ずらす。板割は推定とし、継ぎ目を支えのない所へ置かない。
      const eaveBoards = (a, c, origin, spacing, offset, width, across, row, color) => {
        let start = a, joint = origin + (row % 2 ? 2 : 4) * spacing;
        while (start < c - .003) {
          const end = Math.min(c, joint), mid = (start + end) / 2;
          timber(across ? end - start - .004 : width, .05,
            across ? width : end - start - .004,
            across ? mid : offset, ceilingY, across ? offset : mid, color);
          start = end;
          joint += spacing * 4;
        }
      };
      for (const side of [-1, 1]) {
        // 板幅を等分して細い目地を残す。正背面を通し、側面はその木口で止める。
        // 一本の幅広い板へ黒線だけを重ねず、共通の箱から軒天の板を取る。
        const rows = Math.max(1, Math.round(eave / .3)), pitch = eave / rows;
        for (let q = 0; q < rows; q++) {
          const offset = (q + .5) * pitch, width = pitch - .004;
          const color = q % 2 ? 0x80694c : 0x7a6348;
          eaveBoards(-ex, ex, -ex + .06, frontPitch,
            side * (b.d / 2 + offset), width, true, q, color);
          eaveBoards(-b.d / 2, b.d / 2, -b.d / 2, flankPitch,
            side * (b.w / 2 + offset), width, false, q, color);
        }
        for (let q = 0; q <= frontBays; q++) {
          const x = -ex + .06 + q * frontPitch;
          timber(.065, .09, eave, x, rafterY, side * (b.d / 2 + eave / 2));
        }
        for (let q = 1; q < flankBays; q++) {
          const z = -b.d / 2 + q * flankPitch;
          timber(eave, .09, .065, side * (b.w / 2 + eave / 2), rafterY, z);
        }
        // 軒先の横木で垂木の木口と天井板の端を受ける。
        timber(ex * 2, .14, .1, 0, y + .435, side * (ez - .05));
        timber(.1, .14, b.d, side * (ex - .05), y + .435, 0);
      }
      for (const side of [-1, 1]) for (let q = 1; q < sideBays; q++) {
        const x = side * half, z = -depth + q * depth * 2 / sideBays;
        // 側面の縁柱も正背面と同じ礎石で受け、柱脚を板床へ埋めない。
        // 既存の柱の当たりの内側に収め、縁側の通路には張り出さない。
        this.verandaFootShape ||= new THREE.CylinderGeometry(.3, .3, .28, 8);
        const foot = this.verandaFootShape.clone();
        foot.translate(x, floor + .04, z);
        super.add(rec, 'stone', hieiPaint(foot, 0x827b6d)); foot.dispose();
        const g = this.verandaPostShape.clone();
        g.scale(1, y - floor - .18, 1);
        // 縁柱は室内柱より太い。直径六十センチの周長で貼り、縦の木目を揃える。
        hieiTimberGrain(g, 1, (x * .37 + z * .53) % 1, true, .6);
        g.translate(x, (floor + .18 + y) / 2, z);
        super.add(rec, 'wood', hieiPaint(g, 0x634832)); g.dispose();
        const [wx, wz] = rec.naka.P(x, z), solid = solidCircle(wx, wz, .3);
        solid.yBot = rec.y0 + floor; solid.yTop = rec.y0 + y;
        rec.innerSolids.push(solid);
        // 側面の斗栱は正面から九十度回した寸法で、軒へ向ける。
        for (let j = 0; j < 3; j++) timber(.38 + j * .32, .13, .34 + j * .22, x, y + j * .16, z, 0x72553a);
      }
      // 四周の柱頭を桁で結び、その下に内法長押を回す。
      // 長押の下面は正面戸より上。既存の横滑り戸と入室の幅を保つ。
      const nageshiY = lv.y - rec.y0 + rec.naka.door.h + .42;
      // 回り縁も柱筋で長押を留め、堂内と同じ八角の釘隠しで釘頭を覆う。
      // 金具の細部は推定。柱を抱く二枚の長押の見付け面へ背を接する。
      // 共通の形を既存のまとめ描きへ加え、戸・通路の当たりは増やさない。
      const verandaNail = (x, z, across) => {
        for (const face of [-1, 1]) {
          const nail = this.nageshiNailShape.clone();
          if (!across) nail.rotateY(Math.PI / 2);
          nail.translate(x + (across ? 0 : face * .339), nageshiY,
            z + (across ? face * .339 : 0));
          super.add(rec, 'wood', hieiPaint(nail, 0x34312b)); nail.dispose();
        }
      };
      for (const side of [-1, 1]) {
        // 縁の桁も側面を通し材にし、正背面の桁の木口をその内面へ納める。
        // 隅の下面を二枚重ねず、斗栱の上の高さと柱筋は保つ。
        timber(half * 2 - .28, .24, .28, 0, y - .12, side * depth);
        // 側面も桁幅の半分だけ柱芯から出し、正背面の外面と木口を揃える。
        timber(.28, .24, depth * 2 + .28, side * half, y - .12, 0);
        for (const face of [-1, 1]) {
          // 柱を抱く内外の長押を、それぞれ同じ面で四周へ回す。
          // 正背面の端は側面の通し材の内面で止め、隅で木口を突き出さない。
          // 焼失前の仕口は推定。重なる面をなくし、既存のまとめ描きへ納める。
          const hx = half + face * .3, hz = depth + face * .3, thick = .07;
          timber(hx * 2 - thick, .12, thick, 0, nageshiY, side * hz);
          timber(thick, .12, hz * 2 + thick, side * hx, nageshiY, 0);
        }
        // 正背面は伽藍側の九間の柱割。正面中央だけ戸口を空けた柱位置へ揃える。
        for (let q = 1; q < 9; q++) {
          let x = -half + q * half * 2 / 9;
          if (side === rec.naka.door.side && Math.abs(x) < rec.naka.door.w / 2 + .3) {
            x = Math.sign(x) * (rec.naka.door.w / 2 + .35);
          }
          verandaNail(x, side * depth, true);
        }
        // 隅は長押の木口を継ぐ所なので避け、途中の柱の見付け面だけへ納める。
        for (let q = 1; q < sideBays; q++) {
          verandaNail(side * half, -depth + q * depth * 2 / sideBays, false);
        }
      }
    }
    // 戸の操作でも実際の柱を避ける。設営時に一度だけ拾い、描画・通行と同じ当たりを借りる。
    rec.naka.doorPosts = rec.innerSolids.filter(solid => solid.k === 'c');
    return rec;
  }
}
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || g.count === 0 || g.routed;
// 討てない大将や、すでに戦いを離れた者を残兵の札に数えない。
function hieiFighters(g) {
  if (gone(g)) return 0;
  let n = 0;
  for (const u of g.units) if (u.alive && !u.invuln && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget) n++;
  return n;
}
// 大将の位置ではなく、まだ戦う最寄りの僧兵へ案内する。位置は兵の物を借りる。
function hieiFighterPos(rt, g) {
  if (gone(g)) return null;
  const p = rt.player.u.pos;
  let nearest = null, best = Infinity;
  for (const u of g.units) {
    if (!u.alive || u.invuln || u.fleeing || u.woundOut || u.gone || u.noTarget) continue;
    const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
    if (d < best) { best = d; nearest = u.pos; }
  }
  return nearest;
}

// 共通の敵印から外れる二人以下の組も、札に残る間は見失わせない。
// 戦える者の位置だけを借り、持ち場への道案内は動かさない。
function hieiRemainingPos(rt, groups) {
  const p = rt.player.u.pos;
  let nearest = null, best = Infinity;
  for (const g of groups) {
    const n = hieiFighters(g);
    if (!n || n > 2) continue;
    const q = hieiFighterPos(rt, g);
    if (!q) continue;
    const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (d < best) { best = d; nearest = q; }
  }
  return nearest;
}

function height(x, z) {
  let h = 0.5 * Math.sin(x * 0.04) * Math.cos(z * 0.033) + 0.35 * Math.sin(z * 0.06 + x * 0.02);
  // 西へ登る比叡の山すそ。門の内は一段ならした平場
  h += Math.max(0, 70 - x) * 0.26;
  h += 10 * gauss(x, z, -150, 0, 6000);
  // 門の内の平場（ならして平らに）
  const flat = Math.max(0, 1 - Math.max(0, Math.hypot(x - (CHUDO.x + 20), z) - 36) / 10);
  h = h * (1 - flat * 0.6) + (70 - (CHUDO.x + 20)) * 0.26 * flat * 0.6;
  // 東は琵琶湖へ
  if (x > 112) h -= Math.min(8, (x - 112) * 0.4);
  return h;
}

// 山門の扉（二枚。破られると内へ倒れる）
function doors(W, x, z, w) {
  const grp = new THREE.Group();
  grp.userData.leaves = [];
  for (const sd of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(0, 0, sd * w / 4);
    const m = tobiraLeaf(w / 2 - 0.06, 3.1, -sd); m.rotation.y = Math.PI / 2;   // 外の面を東（+x）へ
    pv.add(m);
    grp.add(pv);
    grp.userData.leaves.push(pv);
  }
  grp.position.set(x, W.heightAt(x, z), z);
  return grp;
}

// 延暦寺の幟：生成りの布に、墨の輪宝（八本の輻と、縁の八つの爪）。textures.js の紋にはないので、ここで描く
let rinboTex = null;
function rinboTexture() {
  if (rinboTex) return rinboTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e4dccb'; g.fillRect(0, 0, 128, 256);
  const cx = 64, cy = 82, r = 36;
  g.strokeStyle = g.fillStyle = '#1a1712';
  g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r - 7, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    // 輻（細い剣の形）
    g.lineWidth = 4; g.beginPath(); g.moveTo(cx + ca * 9, cy + sa * 9); g.lineTo(cx + ca * (r - 3), cy + sa * (r - 3)); g.stroke();
    // 縁の外の爪（三角）
    const p = (d, o) => [cx + Math.cos(a + o) * d, cy + Math.sin(a + o) * d];
    g.beginPath(); g.moveTo(...p(r + 12, 0)); g.lineTo(...p(r + 1, 0.13)); g.lineTo(...p(r + 1, -0.13)); g.closePath(); g.fill();
  }
  g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e4dccb'; g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
  // 使い込んだ布：織り目と、裾の汚れ
  for (let y = 0; y < 256; y += 2) { g.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.02})`; g.fillRect(0, y, 128, 1); }
  const gr = g.createLinearGradient(0, 180, 0, 256); gr.addColorStop(0, 'rgba(60,48,30,0)'); gr.addColorStop(1, 'rgba(60,48,30,.35)');
  g.fillStyle = gr; g.fillRect(0, 180, 128, 76);
  rinboTex = new THREE.CanvasTexture(c);
  rinboTex.colorSpace = THREE.SRGBColorSpace;
  return rinboTex;
}
function rinboNobori(W, x, z, h) {
  const n = nobori(W, x, z, 'hikyaku', h);
  const f = n.userData.flag, m0 = f.material;
  const m = m0.clone(); m.onBeforeCompile = m0.onBeforeCompile; m.map = rinboTexture();
  f.material = m;
  return n;
}

// 参道：山門の手前の坂に石段を刻み、両脇に石灯籠と杉並木
function sando(W) {
  const stone = [], tree = [];
  const paint = (g, hex) => { const gg = g.toNonIndexed(); const c = new THREE.Color(hex); const a = new Float32Array(gg.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } gg.setAttribute('color', new THREE.BufferAttribute(a, 3)); return gg; };
  const zc = roadZ;
  // 蹴上げは約二十センチ。三枚の石を横に並べ、継ぎ目と石の側面を見せる。
  const block = new THREE.BoxGeometry(0.9, 1.2, 1.7);
  for (let x = GATE.x + 2; x < GATE.x + 32; x += 0.9) {
    const z0 = zc(x), k = Math.round((x - GATE.x - 2) / 0.9);
    const rot = -Math.atan2(zc(x + 0.45) - zc(x - 0.45), 0.9);
    const y = W.heightAt(x - 0.45, zc(x - 0.45)) + 0.04 + (k % 3) * 0.012;
    // 見える踏面と同じ高さを足場へ登録。石灯籠や塀の当たりは変えない。
    addDeck({ x0: x - 0.45, x1: x + 0.45, z0: z0 - 2.6, z1: z0 + 2.6, cx: x, cz: z0, rot, y, pad: 0.02, name: '本坂の石段' });
    for (let j = -1; j <= 1; j++) {
      const g = paint(block.clone(), [0x9b9486, 0x928c80, 0xa39b8c][(k + j + 3) % 3]);
      const colors = g.attributes.color, normals = g.attributes.normal;
      for (let v = 0; v < colors.count; v++) {
        const shade = normals.getY(v) > 0.5 ? 1.08 : 0.82 + ((k + Math.floor(v / 3)) % 3) * 0.035;
        colors.setXYZ(v, colors.getX(v) * shade, colors.getY(v) * shade, colors.getZ(v) * shade);
      }
      g.translate(0, -0.6, j * 1.74); g.rotateY(rot); g.translate(x, y, z0); stone.push(g);
    }
    // 苔は端、落ち葉は継ぎ目へ。まとめて描くので描画回数を増やさない。
    for (const side of [-1, 1]) {
      const moss = new THREE.BoxGeometry(0.42, 0.015, 0.32);
      moss.translate(x, y + 0.01, z0 + side * 2.3); stone.push(paint(moss, k % 2 ? 0x626d43 : 0x738053));
      const leaf = new THREE.BoxGeometry(0.12, 0.012, 0.22);
      leaf.rotateY(k * 1.7); leaf.translate(x + 0.2, y + 0.012, z0 + side * 1.8); stone.push(paint(leaf, k % 2 ? 0x947044 : 0xac8550));
    }
  }
  block.dispose();
  // 石灯籠：竿・火袋・笠・宝珠
  for (const x of [GATE.x + 6, GATE.x + 14, GATE.x + 22, GATE.x + 30]) for (const dz of [-4, 4]) {
    const z = zc(x) + dz, y = W.heightAt(x, z);
    const parts = [[0.5, 0.2, 0.5, 0.1], [0.2, 0.9, 0.2, 0.65], [0.55, 0.12, 0.55, 1.16], [0.42, 0.42, 0.42, 1.43], [0.7, 0.16, 0.7, 1.72]];
    for (const [w, h, d, yy] of parts) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + yy, z); stone.push(paint(g, 0x8a857a)); }
    const hj = new THREE.SphereGeometry(0.12, 6, 4); hj.translate(x, y + 1.9, z); stone.push(paint(hj, 0x8a857a));
  }
  // 杉並木：まっすぐな幹と、段になった暗い葉
  for (let x = GATE.x + 8; x < GATE.x + 44; x += 5) for (const z of [-7.5, 7.5]) {
    const zz = zc(x) + z + ((x * 7) % 3 - 1) * 0.6, y = W.heightAt(x, zz), H = 13 + ((x * 13) % 5);
    const tr = new THREE.CylinderGeometry(0.22, 0.4, H, 6); tr.translate(x, y + H / 2, zz); tree.push(paint(tr, 0x4a3a2c));
    for (let k = 0; k < 4; k++) { const c = new THREE.ConeGeometry(2.2 - k * 0.4, 3.2, 7); c.translate(x, y + H * 0.45 + k * 2.2, zz); tree.push(paint(c, [0x243222, 0x2a3a28, 0x223020, 0x2c3c2a][k])); }
  }
  const g = new THREE.Group();
  const sm = new THREE.Mesh(mergeGeometries(stone), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, emissive: 0x665e4e, emissiveIntensity: 0.18 }));
  sm.receiveShadow = true; sm.castShadow = false; sm.userData.camNear = true;
  const tm = new THREE.Mesh(mergeGeometries(tree), new THREE.MeshLambertMaterial({ vertexColors: true }));
  tm.castShadow = true; tm.userData.camNear = true;
  g.add(sm, tm);
  return g;
}

const hieizan = {
  // 予約時と表示時の両方で確かめ、進んだ段に古い下知を混ぜない。
  // 「僧兵を退け」「僧兵が退く」は、味方への退却命令ではない。
  speechAllowed(rt, speaker, text) {
    const F = rt.flags;
    if (F.retreatWarning) return /寄せを止め|旗へ退け|味方の列へ退け|退き太鼓|下がれ/.test(text);
    // 門前へ着いた後に、石段や横道へ引き返す命令を聞かせない。
    if (F.step >= 2 && /石段|本坂|南の木立|南の杉木立|木立から山門|山門の前へ寄せ/.test(text)) return false;
    // 塀を越えた者には、かんぬきを外す下知だけを残す。
    if (F.step === 2 && F.over && /丸太|梯子/.test(text)) return false;
    if (F.step >= 3 && /丸太|梯子|かんぬき/.test(text)) return false;
    // 中堂へ進んだ後は、門内の古い持ち場へ戻さない。
    if (F.deep && /門内の印|門内の持ち場|中堂から(?:の)?新手/.test(text)) return false;
    // 救出中や決着後に、予約されていた中堂の下知で戦いへ戻さない。
    if ((F.rescueHelp || F.ending) && /中堂.*(?:戻|並べ|崩せ|かかれ)|僧兵.*(?:返せ|崩せ|受ける)|味方.*並べ|槍を揃え|味方三人|二十秒守|印で.*(?:守|並べ)|北.*(?:新手|来た|来る)/.test(text)) return false;
    if (F.ending && /手を貸せ|外へ引き出すぞ|救い出す/.test(text)) return false;
    // 救出の長押しが済んだ後は、順番待ちの手伝いの声を出さない。
    if (F.rescueDone && /手を貸せ|外へ引き出すぞ|僧坊の縁へ寄り/.test(text)) return false;
    return true;
  },
  battleVoices: { enemy: 'tendai', lines: {
    enemy: { ambient: ['山王権現の御山ぞ！　守れ！'], push: ['山門の衆、押し返せ！'], waver: ['堂の陰へ退け！　備えを立て直せ！'] },
    ally: { rout: ['僧兵が退いたぞ！　深追いせんでええ！'], regroup: ['僧兵が寄り直すぞ！　槍を揃えよ！'] },
  } },
  noWake: true, // 山の遠景を新たな戦う兵に替えず、近い僧兵だけを扱う
  spawn: { x: SAKA.x - 18, z: SAKA.z + 4, heading: -Math.PI / 2 },
  world: {
    seed: 1571,
    wind: [0.8, 0.6],   // 比叡おろし：山から湖へ吹き下ろす
    time: 'day',
    autumn: true,     // 旧暦九月：枯れ色の草と色づく木
    stableCliffGrain: true,
    stableSlopeGrain: true,
    stableRockProjection: true,
    cliffRock: 0.45,
    slopeForest: 0.28,
    livingSpearHedge: true,
    roundedFire: true,
    dayFireFill: 0.42, // 昼の焼き討ちにも、共有する光の升で人と軒へ照り返す。
    interiorMaterial: hieiRoomMaterial,
    muddy: 0.2,
    water: { x: 124, level: -2.4 },
    paths: [ROAD],
    pathWidth: 2.6,
    guideWay: hieiWay,
    guideMarkerWay: true,
    blockedHint(rt) {
      const F = rt.flags;
      if (F.retreatWarning) return '列の横を通り、光秀の旗へ退け';
      if (F.rescueHelp) return '救出の印は堂の外。僧坊の縁へ回れ';
      if (F.deep) return '堂と塀を回り、今の持ち場の印へ寄れ';
      if (F.step >= 3) return rt.player.u.pos.x > GATE.x
        ? '山門の開いた口を通り、門内の印へ寄れ'
        : '堂と塀を回り、門内の持ち場の印へ寄れ';
      if (F.over) return '塀の内側を通り、かんぬきの印へ寄れ';
      if (F.step === 2) return F.ladderOrder
        ? '塀は通れない。南の梯子の印へ回れ'
        : F.ladderReady ? '門は丸太の組が破る。そばを守るか、南の梯子へ回れ'
        : '門は丸太の組が破る。門前へ寄る僧兵を退けよ';
      if (F.flank && !F.flankDone) return '急な山肌は登れない。南の杉木立の印へ回れ';
      return '急な山肌は登れない。本坂の石段へ戻れ';
    },
    height,
    tint(x, z, h, c) {
      // 門の内の白い砂の平場
      if (x < GATE.x && x > CHUDO.x - 40 && Math.abs(z) < 40) c.lerp({ r: 0.55, g: 0.52, b: 0.45 }, 0.55);
      // 杉の山は暗く
      else if (x < 40) c.setRGB(c.r * 0.82, c.g * 0.9, c.b * 0.8);
    },
    clear: (x, z) => (x > GATE.x - 70 && x < 110 && Math.abs(z) < 34) || Math.hypot(x - 100, z + 20) < 16,
    trees: 620,
    tufts: 3340, // 道の外の二百六十株を、下の斜面用の束へ移す。
    // 比叡の杉木立（道と平場のまわりは開ける）
    treeDensity: (x, z) => (x > 110 ? 0.1 : Math.abs(z) < 36 && x > -95 ? 0.25 : 1),
    groves: [{ x: 30, z: 40, r: 14, n: 26 }, { x: 40, z: -40, r: 14, n: 26 }, { x: -20, z: 50, r: 14, n: 24 }, { x: -30, z: -52, r: 14, n: 24 }],
    // 退く僧兵と、逃げる人々は山の奥（西）で消す
    fleeOut: (x, z, team) => team === 1 && (x < -105 || x > 110),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    hieiSpeech(rt);
    hieiSoldiers(rt);
    // 本坂と堂の平場を空け、道脇の地山に露岩と根草を据える。当たりは増やさない。
    dressSlope(W, { x0: -115, x1: 100, z0: -64, z1: 64, rocks: 120, tufts: 260,
      minSlope: 0.16, rockShadows: true,
      allow: (x, z) => Math.abs(z - roadZ(x)) > 5.5 && (x > GATE.x + 5 || Math.abs(z) > 42) });
    F.step = 0; F.ek = 0; F.ak = 0; F.civ = [];
    // ---- 山門と、左右の築地塀（壊せない） ----
    F.gate = rt.army.addStruct({ seg: [GATE.x, GATE.z - 3, GATE.x, GATE.z + 3], hp: 1500, maxHp: 1500, armor: 0.2, team: 1, name: '山門' });
    F.gate.mesh = doors(W, GATE.x, GATE.z, 6);
    rt.scene.add(F.gate.mesh);
    // 山門：瓦屋根の二階の楼門
    const gateHouse = romon(W, GATE.x, GATE.z, 6.4, Math.PI / 2);
    gateHouse.traverse((m) => {
      if (!m.isMesh) return;
      // 楼門の屋根は二段を別々に反らせる。元の壁・柱の形は借りるだけ。
      if (m === gateHouse.children[1]) {
        const geo = m.geometry, src = geo.index ? geo.toNonIndexed() : geo;
        const pos = src.attributes.position, low = [], high = [];
        for (let i = 0; i < pos.count; i += 3) {
          const target = (pos.getY(i) + pos.getY(i+1) + pos.getY(i+2))/3 < 6 ? low : high;
          target.push(i, i+1, i+2);
        }
        const roofPart = (indices) => {
          const g = new THREE.BufferGeometry(), a = new Float32Array(indices.length*3);
          for (let j = 0; j < indices.length; j++) { const i = indices[j]; a[j*3] = pos.getX(i); a[j*3+1] = pos.getY(i); a[j*3+2] = pos.getZ(i); }
          g.setAttribute('position', new THREE.BufferAttribute(a, 3));
          const roof = hieiRoof(g); g.dispose(); return roof;
        };
        const a = roofPart(low), b = roofPart(high);
        m.geometry = mergeGeometries([a,b]); a.dispose(); b.dispose(); geo.dispose();
        m.material = m.material.clone(); m.material.side = THREE.DoubleSide; m.material.vertexColors = true;
      } else {
        const c = m.geometry.attributes.color;
        if (c) { const brown = new THREE.Color(0x6a4c34), white = new THREE.Color(0xd8d0bb);
          for (let i = 0; i < c.count; i++) if (Math.abs(c.getX(i)-brown.r)<.001 && Math.abs(c.getY(i)-brown.g)<.001) c.setXYZ(i, white.r, white.g, white.b);
        }
      }
    });
    const frame = [];
    // 山門の通路も屋根の裏面だけで済ませず、柱・貫に掛かる梁で板天井を受ける。
    // 焼失前の細かな架構は推定。扉の上端（三・一メートル）より上へ納める。
    // 共通の箱を設営時だけ伸縮し、既存の木部と一束で描く。
    const gateTimberShape = new THREE.BoxGeometry(1, 1, 1);
    const gateTimber = (w, h, d, x, y, z, color = 0x4e3624) => {
      const g = gateTimberShape.clone();
      g.scale(w, h, d);
      hieiTimberGrain(g, w >= d ? 0 : 2, (x * .37 + z * .53) % 1);
      g.translate(x, y, z);
      frame.push(hieiPaint(g, color)); g.dispose();
    };
    // 正背面の貫は楼門の元の形を使う。中央梁を側柱へ掛け、
    // 縦の受け材は横梁の側面で止めて下面を重ねない。
    gateTimber(7.6, .26, .24, 0, 3.6, 0);
    for (const x of [-3.4, 0, 3.4]) for (const side of [-1, 1]) {
      // 側柱の内面まで受け材を広げ、柱を避けた天井の回縁を下から受ける。
      gateTimber(x === 0 ? .2 : .48, .26, 1.36, x, 3.6, side * .8);
    }
    // 従来の板幅では、天井を越えて伸びる側柱へ板が食い込んでいた。
    // 柱芯三・五メートルから最大半径二十二センチを退け、四周の回縁へ板端を納める。
    // 回縁は既存の貫と広げた受け材の上へ載せる。細かな断面は推定。
    const ceilingHalf = 3.28, ceilingRim = .12;
    const boardHalf = ceilingHalf - ceilingRim, boardDepth = 1.72 - ceilingRim;
    for (const side of [-1, 1]) {
      gateTimber(ceilingRim, .06, 3.44,
        side * (ceilingHalf - ceilingRim / 2), 3.76, 0);
      gateTimber(boardHalf * 2, .06, ceilingRim,
        0, 3.76, side * (1.72 - ceilingRim / 2));
    }
    // 板の中央の継ぎ目は梁上、外端は回縁の内面で止める。通路の幅は保つ。
    const ceilingRows = 12, ceilingPitch = boardDepth * 2 / ceilingRows;
    for (let row = 0; row < ceilingRows; row++) for (const side of [-1, 1]) {
      gateTimber(boardHalf - .003, .06, ceilingPitch - .003,
        side * boardHalf / 2, 3.76, -boardDepth + (row + .5) * ceilingPitch,
        row % 2 ? 0x80694c : 0x7a6348);
    }
    gateTimberShape.dispose();
    for (const sd of [-1,1]) for (const x of [-3.2,-1.6,0,1.6,3.2]) {
      const p = new THREE.BoxGeometry(.17,2,.17); p.translate(x,5.5,sd*1.75); frame.push(hieiPaint(p,0x634832)); p.dispose();
      for (let j=0;j<3;j++) { const g = new THREE.BoxGeometry(.3+j*.2,.12,.4+j*.3); g.translate(x,6.2+j*.15,sd*1.8); frame.push(hieiPaint(g,0x72553a)); g.dispose(); }
    }
    const frameMesh = new THREE.Mesh(mergeGeometries(frame), new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.92 }));
    for (const g of frame) g.dispose(); frameMesh.castShadow = true; frameMesh.receiveShadow = true;
    gateHouse.add(frameMesh);
    gateHouse.traverse((m) => { if (m.isMesh && !Array.isArray(m.material)) hieiSurface(rt, m, m === gateHouse.children[1] ? 'tile' : 'wood'); });
    rt.scene.add(gateHouse);
    wallLine(rt, [[GATE.x, GATE.z - 3], [GATE.x + 1, -24], [GATE.x - 4, -40]], { team: 1, hp: 1e9, name: '築地塀', segLen: 6, mesh: tsuiji });
    wallLine(rt, [[GATE.x, GATE.z + 3], [GATE.x + 1, 24], [GATE.x - 4, 40]], { team: 1, hp: 1e9, name: '築地塀', segLen: 6, mesh: tsuiji });
    // ---- 門の内の堂と、山の上の堂塔 ----
    // 堂は石の基壇・縁側・瓦の大屋根（正面を東の山門へ向ける）
    // 旧い比叡山の戦にも同じ出入りを使う。位置・焼き討ちの順は保つ。
    F.teranaka = new HieiGaran(rt);
    F.halls = HALLS.map(([x, z, w, d], i) => {
      const rec = F.teranaka.build({ id: 'hiei_room_' + i, name: i === 0 ? '根本中堂' : '僧坊', kind: i === 0 ? 'chudo' : 'sobo', x, z, w, d, rot: Math.PI / 2, enterable: true });
      return { x, z, w, d, rec };
    });
    F.farHalls = FAR.map(([x, z], i) => F.teranaka.build({ id: 'hiei_far_' + i, name: '山の堂', kind: 'do', x, z, w: 12, d: 8, rot: Math.PI / 2 + 0.3, enterable: true }));
    F.teranaka.finish();
    hieiGaranLook(rt, F.teranaka);
    F.templeFire = makeTempleFire(rt, F.teranaka, { flames: 4, smokes: 6 });
    // 始めから焼き討ちの最中：麓の坂本の町と日吉の社が燃え、本坂の脇の小屋からも煙が上がる（「煙の上がる本坂」）
    for (const [x, z, s] of [[150, -40, 3.2], [168, 30, 3.6], [140, 64, 2.8]]) W.addFire(x, z, { size: s, h: 1.5 });
    for (const [x, z, s] of [[124, -70, 4], [182, -6, 4], [58, 8, 3.6], [30, -10, 3.2]]) W.addSmokeColumn(x, W.heightAt(x, z) + 5, z, { size: s });
    // 堂の前に集まった僧と山の人々（遠景）。門が破れると奥へ逃れる
    F.crowd = W.addDistantArmy({ x: CHUDO.x - 30, z: 2, w: 16, d: 8, count: 90, facing: Math.PI / 2, armor: 0xcfc7b4, flagTex: rinboTexture(), seed: 1571 });
    W.addDistantArmy({ x: -128, z: -34, w: 12, d: 8, count: 60, facing: Math.PI / 2, armor: 0xbdb5a2, flagTex: rinboTexture(), seed: 1572 });
    // ---- 織田勢：明智光秀の手（自分の持ち場）、門を破る組、佐久間の手 ----
    F.ake = allyGroup(rt, { faction: 'oda', name: '明智光秀の手', anchor: { x: SAKA.x - 24, z: SAKA.z }, facing: -Math.PI / 2, width: 14, aggro: 8, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '明智光秀', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x3a3a52 } }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 4 }], ODA));
    F.akeU = F.ake.units[0];
    F.ram = allyGroup(rt, { faction: 'oda', name: '門を破る組', anchor: { x: SAKA.x - 18, z: SAKA.z + 14 }, facing: -Math.PI / 2, width: 5, aggro: 3, noRout: true, formation: 'column' },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12, o: { hat: 'jingasa_n' } }], ODA));
    F.saku = allyGroup(rt, { faction: 'oda', name: '佐久間信盛の手', anchor: { x: SAKA.x - 20, z: SAKA.z - 16 }, facing: -Math.PI / 2, width: 14, aggro: 8, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 4 }], ODA));
    F.teppo = allyGroup(rt, { faction: 'oda', name: '明智の鉄砲組', anchor: { x: SAKA.x - 22, z: SAKA.z + 8 }, facing: -Math.PI / 2, width: 10, aggro: 4, noRout: true, formation: 'line' },
      dress([{ type: 'gun', n: 6 }], ODA));
    F.oda = [F.ake, F.ram, F.saku, F.teppo];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: SAKA.x - 14, z: SAKA.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n }]);
    F.lossUnits = rt.squad.length ? rt.squad.slice() : F.ake.units.filter((u) => !u.invuln);
    F.lossInitial = F.lossUnits.length;
    // ---- 延暦寺の僧兵：山門の前と、門の内 ----
    F.front = enemyGroup(rt, { faction: 'enryakuji', fixed: true, name: '山門の僧兵', anchor: { x: GATE.x + 12, z: 0 }, facing: Math.PI / 2, aggro: 10, width: 12, morale: 90, fleeDir: { x: -1, z: 0 }, dmgMult: 0.62, formation: 'yari' },
      dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: 24 }, { type: 'bow', n: 4 }], SOHEI));
    // ---- 延暦寺の幟：山門の内と、根本中堂の前 ----
    for (const [x, z] of [[GATE.x - 4, -7], [GATE.x - 4, 7], [CHUDO.x + 8, -12], [CHUDO.x + 8, 12], [-100, -12], [-100, 16]]) rt.scene.add(rinboNobori(W, x, z, 6));
    // ---- 山道：石段・杉並木・石灯籠（寺の山らしく） ----
    const approach = sando(W);
    hieiSurface(rt, approach.children[0], 'stone');
    rt.scene.add(approach);
    for (const side of [-1, 1]) rt.scene.add(nobori(W, 40, roadZ(40) + side * 3.4, 'oda', 5));
    // ---- 陣と旗：坂本の織田の陣 ----
    // 坂本の織田の本陣：信長と旗本（信長で遊ぶ時は旗本だけ）。まわりは囲む大軍（軽い兵）なので控えは置かない
    F.camp = camp(rt, { x: SAKA.x + 4, z: SAKA.z - 26, facing: -Math.PI / 2, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長', hat: 'kabuto_m', haori: 0x8a1a14 }, guard: 15, reserve: 0, runTo: { x: SAKA.x - 24, z: SAKA.z } });
    for (const [x, z, k] of [[SAKA.x - 6, SAKA.z - 36, 'oda'], [SAKA.x + 14, SAKA.z - 36, 'eiraku'], [SAKA.x - 26, SAKA.z + 8, 'oda'], [SAKA.x - 26, SAKA.z - 8, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // ---- 大軍（軽い作り）：比叡を囲む織田勢三万 ----
    const DA = (x, z, w, d, count, facing, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor: 0x2b3140, flagTex: flagTexture(flag), seed });
    // 明智の手の本隊（見た目だけ）：自分の組の後ろに続く
    W.addDistantArmy({ x: SAKA.x - 6, z: SAKA.z + 2, w: 16, d: 8, count: 120, facing: -Math.PI / 2, armor: 0x2e2a30, flagTex: flagTexture('oda'), seed: 1719 });
    [[104, -50, 'oda'], [100, 60, 'eiraku'], [70, -90, 'oda'], [74, 100, 'oda'], [140, -20, 'oda'], [136, 40, 'eiraku']].forEach(([x, z, f], i) => DA(x, z, 26, 14, 220, -Math.PI / 2, f, 1710 + i));

    rt.world.setTime('day');
    applyLook(rt, SMOKY);
    F.templeFire.ignite(F.halls[2].rec, '僧坊への火');
    for (const r of F.farHalls) F.templeFire.ignite(r, '山の上の火');
    F.templeFire.tick(0.5);
    this.civ(rt, 42, 12, 4, '逃げる里の者', { x: 1, z: 0.4 });
    rt.setPhase('brief');
    rt.obj('main', rt.G.lord ? '旗本と明智の手を率い、山門へ寄せよ' : (rt.G.rank || 0) >= 3 ? '先手の一隊を率い、山門へ登れ' : '明智の手に続き、山門へ登れ', 'main');
    rt.obj('civ', '逃げる僧・里の者に刃を向けるな', 'side');
    rt.marker('road', CLIMB_GOAL, '本坂の先・山門', { h: 3, guidePriority: 200, groundGuide: true });
    rt.objProgress('main', '足元の矢印に沿い、石段へ進め');
    F.marchStartX = rt.player.u.pos.x;
    if (rt.G.lord) {
      // 信長で遊ぶ時：光秀の言上を聞いて、山を攻めさせる
      rt.say('明智光秀', '殿、味方と石段を登り、山門へお進みくだされ', 4);
      rt.say('織田信長', '浅井・朝倉に与した山じゃ。堂も社も焼き払え！', 4.5);
    } else {
      // 最初の下知から行き先と同行する味方を伝える。
      rt.say('明智光秀', '味方と石段を登れ。山門の僧兵を退けよ', 4);
      rt.say('明智光秀', '逃げる僧や里の者に、刃を向けるな', 3.5);
    }
    rt.after(15, () => this.climb(rt));
  },

  // ① 山道を登る
  climb(rt) {
    const F = rt.flags;
    if (F.step >= 1 || F.ending || F.retreatWarning) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('climb');
    rt.obj('main', '味方と石段を登り、山門の僧兵を退けよ', 'main');
    F.roadBest = Infinity; F.roadWait = 0; F.roadSayT = -99;
    F.roadStop = { x: 0, z: 0, t: 0, distance: 0, cause: '', allyLoss: 0, foeLoss: 0 };
    // 案内の終点を、門攻めへ進む範囲の内側に置く。
    rt.marker('road', CLIMB_GOAL, '本坂の先・山門', { h: 3, guidePriority: 200, groundGuide: true });
    F.roadMark = rt.markers[rt.markers.length - 1];
    sfx('sig_susume', 1);
    rt.say('明智光秀', '進み太鼓じゃ！　味方と登れ。丸太の組を通すぞ', 4);
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.3; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 10; }; };
    go(F.ake, GATE.x + 34, 2); go(F.saku, GATE.x + 36, -18); go(F.ram, GATE.x + 44, 12); go(F.teppo, GATE.x + 40, -6);
    // 一斉射：明智の鉄砲組は込めたまま登り、山門の僧兵が間合いに入ったら揃えて放つ
    volleyScene(rt, { guns: () => [F.teppo, F.ake], at: () => F.teppo.center(), r: 32, who: '明智光秀', shots: 3, until: 120, wait: '鉄砲、込めたまま登れ。門の前で揃えて放つ',
      banner: ['一斉射', '明智の鉄砲が、山門の前の僧兵を撃ちすくめる'] });
    rt.marker('front', centerOf(F.front), () => `山門の僧兵・${moraleWord(F.front.morale)}`, { red: true, group: F.front });
    rt.after(14, () => {
      if (F.step !== 1 || F.ending || gone(F.front)) return;
      const c = F.front.center();
      if (rt.distTo(c) > 30 || rt.army.wallBetween(rt.player.u.pos, rt.player.u.team, c)) return;
      rt.army.play('eshout', c, 1.6); rt.say('僧兵', '山門の衆、ここは通さぬ！', 3);
    });
  },

  // 山門が近づいたら寄せ方を決める。坂本で判断を急がせず、先着した者も待たせない。
  approach(rt) {
    const F = rt.flags;
    if (F.step !== 1 || F.ending || F.retreatWarning || F.approachAsked || rt.choice) return;
    F.approachAsked = true;
    rt.choose('山門の前を僧兵が固めている。どう崩す？', [
      { label: '鉄砲組と本坂を進み、正面から寄せる', note: '味方と登る。鉄砲は敵に近づくと一斉に撃つ' },
      { label: '佐久間の手と南の杉木立を回り、横から突く', note: '早く崩せる。木立の中で僧兵の弓に狙われる' },
    ], (i) => {
      if (F.ending || F.retreatWarning || F.step !== 1) return;
      F.approachChosen = true;
      F.flank = i === 1;
      if (i === 0) {
        rt.obj('main', '鉄砲組と本坂を登り、山門の僧兵を退けよ', 'main');
        rt.say('明智光秀', '鉄砲組と登れ。門の前で揃えて撃つぞ', 3);
        return;
      }
      rt.say('佐久間信盛', '南の木立を回るぞ！　横腹を突け！', 3);
      const S = F.saku; S.order = 'move'; S.speed = 2.8; S.dest = { x: GATE.x + 20, z: -20 };
      S.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 50; gg.focus = F.front.units.find((u) => u.alive) || null; };
      rt.obj('main', '佐久間の手と南の杉木立へ回り、横を突け', 'main');
      // 横へ回る間は、本坂へ戻す案内を残さない。
      rt.unmark('road'); F.roadMark = null;
      rt.marker('flank', { x: GATE.x + 20, z: -20 }, '南の杉木立', { h: 3, guidePriority: () => F.step === 1 ? 300 : 0, groundGuide: true });
      F.roadMark = rt.markers[rt.markers.length - 1];
      F.roadBest = Infinity; F.roadWait = 0;
      const b = enemyGroup(rt, { faction: 'enryakuji', name: '木立の僧兵の弓', anchor: { x: GATE.x + 14, z: -30 }, facing: Math.PI / 2, order: 'attack', seekRange: 40, aggro: 12, width: 6, morale: 70, fleeDir: { x: -1, z: 0 }, dmgMult: 0.5 },
        dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'bow', n: 5 }, { type: 'ashigaru', n: 6 }], SOHEI));
      F.woodBow = b;
      rt.after(3, () => rt.say('足軽', '木立から矢だがや！　伏せよ！', 2.5));
    }, 14);
  },

  // ② 山門を破る
  assault(rt) {
    const F = rt.flags;
    if (F.step >= 2 || F.ending || F.retreatWarning) return;
    F.step = 2; F.stepT = rt.t;
    F.gateLastHp = F.gate.hp; F.gateMoveT = rt.t; F.gateStalled = false;
    rt.setPhase('gate');
    rt.unmark('road');
    if (F.flankDone) rt.objRemove('flank');
    rt.banner('山門へかかれ', '門を破る組が丸太を担いで進む');
    // 山の上から寺の鐘が乱れ打ちされる（急を告げる早鐘）
    // 陣鉦（kane）ではなく、山の上の青銅の梵鐘の乱れ打ち（bellRapid）を二度。遠いので小さめに
    for (let k = 0; k < 2; k++) rt.after(1 + k * 4.2, () => { if (!F.ending) sfx('bellRapid', 0.6 - k * 0.1); });
    rt.obj('main', '丸太の組へ寄る僧兵を退け、山門を破れ', 'main');
    rt.say('明智光秀', '門は丸太の組が破る。寄ってくる僧兵を退けよ', 4);
    const R = F.ram;
    R.order = 'assault'; R.formation = 'line'; R.aggro = 2; R.assault = () => (F.gate.alive ? F.gate : null);
    for (const g of [F.ake, F.saku]) { g.order = 'attack'; g.seekRange = 40; }
    rt.marker('gate', GATE, () => `山門 ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}％`, { h: 4, guidePriority: 200, groundGuide: true });
    // 門名の一致で加わる百点も越え、守る担ぎ手へ案内する。
    // 控えが交代しても同じ印を使う。
    rt.marker('ram', () => {
      for (let i = 0; i < 2; i++) {
        const g = i ? F.ramReserve : F.ram;
        if (!g || g.routed) continue;
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget) return u.pos;
      }
      return null;
    }, '守る丸太の組', { h: 3, guidePriority: () => F.ladderOrder ? 0 : 350, groundGuide: true });
    // 別の手：南の築地塀に梯子を掛けて越え、内から閂を外す（門が破れるのを待たずに自分で道を選べる）
    rt.after(12, () => this.ladder(rt));
    // 門の脇から僧兵の新手が打って出る
    rt.after(24, () => {
      if (F.step !== 2 || F.ending) return;
      const g = enemyGroup(rt, { faction: 'enryakuji', name: '打って出た僧兵', anchor: { x: GATE.x + 6, z: -30 }, facing: Math.PI / 2, order: 'attack', seekRange: 60, aggro: 12, width: 8, morale: 85, fleeDir: { x: -1, z: 0 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: 16 }], SOHEI));
      g.focus = R.units.find((u) => u.alive) || null;
      F.sally = g;
      if (F.retreatWarning) return;
      rt.say('足軽', F.over ? '塀の外に新手じゃ！　かんぬきを外して味方を通せ！' : '塀の脇だがや！　丸太の組が狙われとる！', 3);
      rt.marker('sally', centerOf(g), () => `打って出た僧兵・${moraleWord(g.morale)}`, { red: true, group: g });
    });
    // 北の塀の脇からも、二度目の打って出
    rt.after(58, () => {
      if (F.step !== 2 || F.ending) return;
      const g = enemyGroup(rt, { faction: 'enryakuji', name: '北から打って出た僧兵', anchor: { x: GATE.x + 6, z: 30 }, facing: Math.PI / 2, order: 'attack', seekRange: 60, aggro: 12, width: 10, morale: 85, fleeDir: { x: -1, z: 0 }, dmgMult: 0.6 },
        dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 3 }], SOHEI));
      g.focus = (F.ram.units.find((u) => u.alive)) || null;
      F.sally2 = g;
      rt.army.play('eshout', { x: GATE.x + 6, z: 30 }, 1.4);
      if (F.retreatWarning) return;
      rt.say('明智光秀', F.over ? '北にも新手じゃ！　内から門を開け、味方を通せ！' : '北からも来た！　門を破る組を囲ませるな！', 3);
      rt.marker('sally2', centerOf(g), () => `北の僧兵・${moraleWord(g.morale)}`, { red: true, group: g });
    });
  },

  ladder(rt) {
    const F = rt.flags;
    if (F.step !== 2 || F.ending || F.retreatWarning || !F.gate.alive || F.ladderReady || F.over) return;
    F.ladderReady = true;
    const L = { x: GATE.x + 2.6, z: -15 };
    rt.say('明智光秀', '丸太の組を守れ。南の梯子からも門を開けられるぞ', 4);
    rt.obj('main', '丸太の組を守るか、南の梯子で内から門を開けよ', 'main');
    rt.marker('ladder', L, '南の梯子', { h: 3, guidePriority: () => F.ladderOrder || F.gateWorkers === 0 || F.gateStalled || rt.distTo(L) < 8 ? 500 : 0, groundGuide: true });
    rt.addInteract('ladder', L, '梯子を掛けて塀を越える', () => this.overWall(rt, L), { r: 3, hold: 1.4, prio: 20 });
  },

  // 梯子で塀を越える：自分と近くの組の者が塀の内へ。内から閂を外せば山門が開く
  overWall(rt, L) {
    const F = rt.flags, W = rt.world;
    if (F.step !== 2 || F.ending || F.retreatWarning || F.over) return;
    F.over = true;
    rt.uninteract('ladder'); rt.unmark('ladder');
    rt.unmark('gate'); rt.unmark('ram');
    rt.obj('main', '門の内側で、かんぬきを外せ', 'main');
    const top = { x: GATE.x - 0.2, y: W.heightAt(GATE.x, L.z) + 2.7, z: L.z };
    rt.scene.add(hashigo({ x: L.x, y: W.heightAt(L.x, L.z), z: L.z }, top));
    rt.army.play('wood', L, 1);
    const pu = rt.player.u, to = { x: GATE.x - 3, z: L.z + 1 };
    for (const u of rt.squad) if (u.alive && Math.hypot(u.pos.x - pu.pos.x, u.pos.z - pu.pos.z) < 16) { u.pos.x = to.x - 1 - Math.random() * 2; u.pos.z = to.z + (Math.random() - 0.5) * 3; }
    pu.pos.x = to.x; pu.pos.z = to.z;
    pu.pos.y = W.heightAt(to.x, to.z);
    for (const u of rt.squad) if (u.alive) u.pos.y = W.heightAt(u.pos.x, u.pos.z);
    sfx('wood', 0.8);
    rt.banner('塀を越えた', '門の内側で、かんぬきを外せ');
    const bar = { x: GATE.x - 1.6, z: 0 };
    rt.marker('bar', bar, 'かんぬき', { h: 3, guidePriority: 200, groundGuide: true });
    rt.addInteract('bar', bar, 'かんぬきを外して門を開ける', () => {
      if (!F.gate.alive) return;
      F.barOpen = true;
      rt.army.damage(F.gate, F.gate.hp + 10, pu);
    }, { r: 2.8, hold: 2.4, prio: 20 });
    rt.say('明智光秀', '門の内側へ寄れ。かんぬきを外せ！', 3);
  },

  // ③ 門の内：豪盛の薙刀の衆
  inside(rt) {
    const F = rt.flags;
    if (F.step >= 3 || F.ending || F.retreatWarning) return;
    F.step = 3; F.stepT = rt.t;
    F.insideArrived = false;
    rt.setPhase('inside');
    rt.unmark('gate'); rt.unmark('ram'); rt.unmark('front'); rt.unmark('sally'); rt.unmark('sally2');
    // 門が開いたら、門攻めの印と長押しを残さない。
    rt.unmark('ladder'); rt.unmark('bar');
    rt.uninteract('ladder'); rt.uninteract('bar');
    F.flankDone = true;
    rt.unmark('flank'); rt.objRemove('flank');
    // 手柄の扱いは保ち、実際に門を通した方法に言葉を合わせる。
    const gateDeed = F.barOpen ? '内から山門を開けた' : '山門を破った';
    rt.award((t) => t.side.push(gateDeed), gateDeed);
    sfx('sig_kakari', 1);
    rt.after(2.4, () => {
      if (F.step !== 3 || F.ending || rt.over || !F.ake.count || F.ake.routed) return;
      rt.army.play('toki', F.ake.center(), 1);
    });
    rt.banner(F.barOpen ? '山門、開く' : '山門、破れる', '門内の印へ進み、味方と並べ');
    const g = enemyGroup(rt, { faction: 'enryakuji', name: '正覚院豪盛の衆', anchor: { x: CHUDO.x + 14, z: 0 }, facing: Math.PI / 2, order: 'attack', seekRange: 80, aggro: 12, width: 12, morale: 100, noRout: true, fleeDir: { x: -1, z: -0.2 }, dmgMult: 0.62, defMult: 1.2 },
      dress([{ type: 'busho', n: 1, o: { name: '正覚院豪盛', invuln: true, hat: 'hachimaki', weapon: 'spear', spear: 'su', haori: 0xd8d2c2, flag: null } }, { type: 'samurai', n: 4, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: 18 }, { type: 'bow', n: 3 }], SOHEI));
    g.units[0].dmg *= 0.5;
    F.gosei = g; F.goseiU = g.units[0];
    rt.say('正覚院豪盛', '御山を守れ！　一人も通すな！', 3);
    rt.say('明智光秀', '門内の印で味方と並べ。僧兵を崩せ。大将は追うな', 4);
    rt.obj('main', '門内の印で味方と並び、豪盛の衆を崩せ', 'main');
    // 敵の印は道案内に使わないため、味方と並ぶ場所を別に示す。
    rt.marker('inside', INSIDE, '門内の持ち場', { h: 3, guidePriority: 200, groundGuide: true });
    rt.marker('gosei', () => hieiFighterPos(rt, g), () => hieiFighters(g) ? `豪盛の衆・${moraleWord(g.morale)}` : '', { red: true, group: g, guidePriority: 200, groundGuide: true });
    for (const q of F.oda) { q.order = 'attack'; q.seekRange = 70; q.formation = 'line'; }
    F.ram.assault = null;
    if (F.ramReserve) { F.ramReserve.assault = null; F.ramReserve.order = 'attack'; }
    // 逃げる僧や里の者（戦わない。誰にも狙われない。自分で討てば下知違反）
    const civ = (x, z, n2, name) => this.civ(rt, x, z, n2, name);
    civ(-12, 8, 5, '逃げる僧'); civ(-24, -9, 4, '逃げる里の者');
    rt.after(20, () => { if (!F.ending) civ(-56, 8, 5, '逃げる僧'); });
    rt.after(10, () => rt.bark('逃げる僧・里の者を追うな'));
    this.insideRest(rt, g);
  },
  // 逃げる僧や里の者（戦わない。誰にも狙われない。自分で討てば下知違反）
  civ(rt, x, z, n2, name, fleeDir) {
    const F = rt.flags;
    {
      const c = enemyGroup(rt, { faction: 'imagawa', name, anchor: { x, z }, facing: -Math.PI / 2, width: 4, aggro: 0, morale: 0, fleeDir: fleeDir || { x: -1, z: z > 0 ? 0.3 : -0.3 }, speed: 1.8 },
        // 今川の色が混じらないよう、姿は全部ここで決める（僧は墨染の衣、里の者は野良着）
        [{ type: 'porter', n: n2, o: name.includes('僧') ? { flag: null, hat: 'none', kosode: 1, bozu: 1, kosodeCol: 0x24221f, armor: 0x1e1c1a, lace: 0x2a2826, cloth: 0x24221f, haori: null, mon: null } : { flag: null, hat: 'none', kosode: 1, kosodeCol: 0x6a5a44, armor: 0x4a4034, lace: 0x5a4e3c, cloth: 0x6a5a44, haori: null, mon: null } }]);
      c.routed = true; c.order = 'flee';
      for (const u of c.units) { u.fleeing = true; u.noTarget = true; u.civ = true; u.dmg = 0; u.speed = 1.5; u.run = 1.8; }
      c.civ = true;
      F.civ.push(c);
      return c;
    }
  },
  insideRest(rt, g) {
    const F = rt.flags;
    // 豪盛は討たれない（山を逃れ、のちに甲斐の武田信玄を頼った）。衆が減れば退く
    F.goseiU.announced = true;
    rt.after(70, () => { g.noRout = false; });
    // 根本中堂の方から、次の僧兵が加わる
    rt.after(18, () => this.insideReinforce(rt));
  },
  insideReinforce(rt) {
    const F = rt.flags;
    // 早く崩した時は待たせず同じ新手を出す。予約から二重には出さない。
    if (F.step !== 3 || F.deep || F.ending || F.retreatWarning || F.gosei2) return;
    const g2 = enemyGroup(rt, { faction: 'enryakuji', name: '中堂の僧兵', anchor: { x: CHUDO.x - 6, z: 14 }, facing: Math.PI / 2, order: 'attack', seekRange: 80, aggro: 12, width: 10, morale: 90, fleeDir: { x: -1, z: 0.3 }, dmgMult: 0.55 },
      dress([{ type: 'samurai', n: 2, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 3 }], SOHEI));
    F.gosei2 = g2;
    rt.army.play('eshout', { x: CHUDO.x, z: 10 }, 1.4);
    rt.say('足軽', '中堂から新手だがや！　槍を揃えよ！', 3);
    rt.marker('gosei2', () => hieiFighterPos(rt, g2), () => hieiFighters(g2) ? `中堂の僧兵・${moraleWord(g2.morale)}` : '', { red: true, group: g2, guidePriority: 200, groundGuide: true });
  },

  // ④ 山の上の堂塔が燃える
  burn(rt) {
    const F = rt.flags;
    if (F.burning) return;
    F.burning = true;
    for (const r of F.farHalls) F.templeFire.ignite(r, '山の上の火');
    // 時刻は変えない（昼のまま）。煙で日が陰り、空が茶色く濁っていく
    rt.after(12, () => { if (!rt.flags.ending) applyLook(rt, SMOKY); });
    rt.banner('山の上の堂塔から煙', '山の奥からも煙が立ち上る');
    rt.say('足軽', '……あの堂も燃えとる。屋根まで火だがや', 3);
    rt.say('明智光秀', '火の粉が来るぞ。堂から離れ、道を塞ぐな！', 4.5);
  },

  // 門の内の堂にも火が入る（ほかの組の火付け。自分は加わらない）
  burnHalls(rt) {
    const F = rt.flags;
    if (F.hallsBurn) return;
    F.hallsBurn = true;
    // 戦っている所から遠い堂から順に
    const p = rt.player.u.pos;
    const hs = [...F.halls].sort((a, b) => Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z));
    hs.forEach((h, i) => rt.after(i * 7, () => {
      F.templeFire.ignite(h.rec, '堂への火');
      if (i === 0) {
        rt.army.play('cry', { x: h.x, z: h.z }, 1.2);
        rt.say('足軽', 'こっちの堂にも火だがや！', 3);
      }
    }));
    // 根本中堂の方の遠景の人々は、山の奥へ逃れていく
    if (F.crowd && F.crowd.rout) F.crowd.rout({ hideAfter: 30 });
  },

  // 中堂の前を押さえ、僧坊に逃げ遅れた人を救い出す
  deep(rt) {
    const F = rt.flags;
    if (F.deep || F.ending || F.retreatWarning) return;
    F.deep = true;
    rt.unmark('gosei'); rt.unmark('gosei2'); rt.unmark('inside');
    for (const q of [F.gosei, F.gosei2]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    rt.award((t) => t.side.push('門の内で豪盛の衆を退けた'), '豪盛の衆を退けた');
    rt.banner('豪盛の衆、退く', '中堂の奥で、僧兵が集まり直している');
    rt.obj('main', '中堂へ進み、僧兵を退けよ', 'main');
    const friends = [];
    const ctx = { faction: 'enryakuji', flag: 'hikyaku', armor: 0xcfc7b4, dmg: 0.7, mass: 100, scale: 1, backing: false, fixedSpawn: true, look: (l) => dress(l, SOHEI),
      // 後詰も同じ持ち場を守る味方。三人の到着判定にも数える。
      friends: () => {
        friends.length = 0;
        for (const g of F.oda) if (g && g.count && !g.routed) friends.push(g);
        // 丸太の控え組も門内へ進み、持ち場の味方三人に数える。
        if (F.ramReserve && F.ramReserve.count && !F.ramReserve.routed) friends.push(F.ramReserve);
        if (ctx.aidG && ctx.aidG.count && !ctx.aidG.routed && !friends.includes(ctx.aidG)) friends.push(ctx.aidG);
        return friends;
      },
      aid: { name: '明智の後詰', faction: 'oda', list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }] }, aidSaid: '明智の後詰が山門をくぐって加わった' };
    depthStart(rt, ctx, hzSteps(this), (rt2, m) => {
      if (m.hSecured && m.hRescued) this.win(rt2, '中堂を押さえ、逃げ遅れた人々を外へ出した');
      else this.stalled(rt2, m.hSecured ? '僧坊の救出が間に合わず、寄せを引いた' : '中堂の持ち場を守れず、寄せを引いた');
    });
  },

  win(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('gosei'); rt.unmark('gosei2'); rt.unmark('dp'); rt.unzone('dp');
    rt.objRemove('dp'); rt.objRemove('danger');
    rt.unmark('danger-retreat');
    rt.obj('main', '中堂を押さえ、人々を堂から出せ', 'main');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: F.barOpen ? '山門を開き、僧兵を退けた' : '山門を破り、僧兵を退けた', pts: 20 }; }, '任務達成・僧兵を退けた');
    if (!F.civHurt) { rt.objDone('civ'); rt.award((t) => t.side.push('手向かわぬ者を討たなかった'), '副任務：手向かわぬ者を討たなかった'); }
    for (const q of [F.gosei, F.gosei2]) if (q && !gone(q)) { q.noRout = false; q.morale = 0; }
    sfx('horagai', 0.7);
    rt.banner('比叡の山、落ちる', how);
    rt.say('明智光秀', rt.G.lord ? '殿、中堂の前を押さえてござる。……山が煙に包まれておりまする' : `${nm(rt)}、中堂は押さえたぞ。……この煙、目に焼きつけよ`, 5);
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 10);
  },

  update(rt, dt) {
    const F = rt.flags;
    hieiNearHeads(rt);
    if (F.templeFire) F.templeFire.tick(dt);
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.ending) return;
    // 退きの下知を、攻撃や救出の進み具合で上書きしない。
    if (F.retreatWarning) {
      rt.objProgress('withdraw', `光秀の旗へ退け。寄せを引くまであと${Math.max(0, Math.ceil(F.retreatAt - rt.t))}秒`);
      return;
    }
    if (!F.lossReady) {
      F.lossReady = true;
      if (rt.squad.length) F.lossUnits = rt.squad.slice();
      F.lossInitial = F.lossUnits.length;
    }
    let alive = 0;
    for (const u of F.lossUnits) if (u.alive && !u.fleeing && !u.woundOut && !u.gone) alive++;
    if (F.lossInitial > 0 && alive * 2 < F.lossInitial) {
      // 十秒の予告中も退きの下知に揃え、攻撃や救出へ進ませない。
      this.stalled(rt, `組の戦える者が半分を割った（${alive}人／${F.lossInitial}人）`);
      return;
    }
    // 石段へ歩き出したら味方も進む。下知を聞く十五秒を待たせない。
    if (F.step === 0 && rt.player.u.pos.x < F.marchStartX - 4) this.climb(rt);
    // 任務の下知を読みやすくするため、死者数の知らせは三十秒ごとにまとめる。
    if (!rt.choice && !F.retreatWarning && rt.t >= (F.lossNoteT ?? 30) && ((F.ak || 0) !== (F.shownAk || 0) || (F.ek || 0) !== (F.shownEk || 0))) {
      F.lossNoteT = rt.t + 30; F.shownAk = F.ak || 0; F.shownEk = F.ek || 0;
      rt.bark(`この持ち場の死者：味方${F.shownAk}人・僧兵${F.shownEk}人`);
    }
    if (F.flank && !F.flankDone) {
      const p = rt.player.u.pos;
      if (Math.hypot(p.x - GATE.x - 20, p.z + 20) < 12) {
        F.flankDone = true; rt.unmark('flank');
        if (F.step === 1) {
          rt.obj('main', '山門の前へ寄せ、丸太の組を通せ', 'main');
          rt.marker('road', CLIMB_GOAL, '山門の前へ寄せる', { h: 3, guidePriority: 200, groundGuide: true });
          F.roadMark = rt.markers[rt.markers.length - 1];
          F.roadBest = Infinity; F.roadWait = 0;
          rt.say('佐久間信盛', '僧兵が乱れたぞ。山門の前へ寄せ、丸太の組を通せ', 3);
        }
        if (F.front && !gone(F.front)) F.front.morale -= 35;
        rt.bark('横を突かれて、山門の僧兵が乱れた');
        rt.award((t) => t.side.push('杉木立を回り、僧兵の横を突いた'), '僧兵の横を突いた');
      } else if (F.step >= 3) { F.flankDone = true; rt.unmark('flank'); rt.objRemove('flank'); }
    }
    if (F.step === 1) {
      const d = Math.hypot(rt.player.u.pos.x - GATE.x, rt.player.u.pos.z - GATE.z);
      if (d < 55) this.approach(rt);
      const flanking = F.flank && !F.flankDone;
      const distance = flanking ? Math.hypot(rt.player.u.pos.x - GATE.x - 20, rt.player.u.pos.z + 20) : d;
      rt.objProgress('main', flanking ? `南の杉木立まで約${Math.round(distance)}歩` : F.flankDone ? `山門まで約${Math.round(d)}歩。木立から門の前へ寄せよ` : `山門まで約${Math.max(0, Math.round(d))}歩。味方と石段を登れ`);
      if (!rt.choice) {
        // 横へ回る時も、今の行き先へ近づいているかで足止めを数える。
        if (distance < F.roadBest - 1) { F.roadBest = distance; F.roadWait = 0; }
        else F.roadWait += dt;
        const m = F.roadMark;
        if (m) m.guideAlways = F.roadWait >= 30;
        if (F.roadWait >= 30 && rt.t - F.roadSayT >= 30) {
          F.roadSayT = rt.t;
          const r = F.roadStop, p = rt.player.u.pos;
          r.x = p.x; r.z = p.z; r.t = rt.t; r.distance = distance;
          r.cause = rt.blockedMove && rt.t - rt.blockedMove.t < 10 ? rt.blockedMove.cause : '進む入力と足止めの記録なし';
          r.allyLoss = F.ak; r.foeLoss = F.ek;
          rt.say('明智光秀', flanking ? '南の杉木立の印へ回れ。佐久間の手に続け' : F.flankDone ? '木立から山門の前へ寄せよ。丸太の組を通すぞ' : '本坂の入口に味方の旗がある。足元の矢印に沿い、石段を登れ', 4);
        }
      }
      // 寄せ方を選び、門前へ着いたら下知を進める。固定の待ち時間を置かない。
      if (F.approachChosen && !rt.choice && !flanking && d < 30) this.assault(rt);
    }
    if (F.step === 2) {
      let workers = 0, ramWorker = null;
      for (let i = 0; i < 2; i++) {
        const g = i ? F.ramReserve : F.ram;
        if (!g || g.routed) continue;
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget) { workers++; if (!ramWorker) ramWorker = u; }
      }
      F.gateWorkers = workers;
      // 担ぎ手が尽きたら、梯子の下知まで立ち尽くさせない。
      if (workers === 0) this.ladder(rt);
      if (F.gate.hp < F.gateLastHp) F.gateMoveT = rt.t;
      F.gateLastHp = F.gate.hp;
      F.gateStalled = rt.t - F.gateMoveT >= 20;
      const ladderDistance = Math.hypot(rt.player.u.pos.x - GATE.x - 2.6, rt.player.u.pos.z + 15);
      const nearLadder = F.ladderReady && ladderDistance < 8;
      // 梯子を選んだ後、少し下がっただけで丸太へ案内を戻さない。
      // 大きく離れれば護衛へ戻れる。長押し中は案内を保つ。
      if (nearLadder) F.ladderChosen = true;
      else if (ladderDistance > 14 && rt.holdId !== 'ladder') F.ladderChosen = false;
      const barDistance = F.over ? Math.hypot(rt.player.u.pos.x - (GATE.x - 1.6), rt.player.u.pos.z) : 0;
      const needLadder = F.ladderReady && (workers === 0 || F.gateStalled) && !F.over;
      // 丸太がまた動いても、梯子へ向かう途中で下知を戻さない。
      // 梯子から離れ、担ぎ手のそばへ戻った時は護衛の案内に戻す。
      const backAtRam = ramWorker && ladderDistance > 14 && rt.distTo(ramWorker.pos) < 10;
      const keepLadderRoute = F.ladderOrder && !backAtRam;
      const ladderRoute = !F.over && (needLadder || F.ladderChosen || keepLadderRoute);
      // 門攻めが止まった時は、同じ札を梯子の下知に替える。塀を越えた後の札は保つ。
      if (F.ladderReady && !F.over && !!F.ladderOrder !== !!ladderRoute) {
        F.ladderOrder = !!ladderRoute;
        rt.obj('main', ladderRoute ? '南の梯子で塀を越え、内から門を開けよ' : '丸太の組を守るか、南の梯子で内から門を開けよ', 'main');
      }
      const opening = F.over && barDistance < 2.8;
      const climbing = !F.over && nearLadder && ladderDistance < 3;
      if (opening || climbing) {
        const id = opening ? 'bar' : 'ladder', seconds = opening ? 2.4 : 1.4;
        const helping = rt.holdId === id;
        const left = Math.max(1, Math.ceil(seconds - (helping ? rt.holdT : 0)));
        rt.objProgress('main', helping ? `${opening ? 'かんぬきを外している' : '梯子を掛けている'}。あと${left}秒` : opening ? '「かんぬきを外して門を開ける」を長押し' : '「梯子を掛けて塀を越える」を長押し');
      } else {
        const ramDistance = ramWorker ? rt.distTo(ramWorker.pos) : 0;
        rt.objProgress('main', F.over ? `門の内側の印へ。かんぬきまで約${Math.round(barDistance)}歩` : ladderRoute ? `南の梯子の印へ。あと約${Math.round(ladderDistance)}歩` : ramDistance > 10 ? `丸太の組まで約${Math.round(ramDistance)}歩。そばで守れ` : `門の強さ${Math.round(Math.max(0, F.gate.hp) / F.gate.maxHp * 100)}％・担ぎ手${workers}人。寄る僧兵を退けよ`);
      }
      if (needLadder && rt.t - (F.ladderHelpT ?? -99) >= 30) {
        F.ladderHelpT = rt.t;
        rt.say('明智光秀', '丸太が止まった。南の梯子を登り、内から門を開けよ', 4);
      }
      // 門を破る組が減ったら、控えの者が加わる
      if (workers < 4 && !F.ram2) {
        F.ram2 = true;
        const g = allyGroup(rt, { faction: 'oda', name: '門を破る組', anchor: { x: GATE.x + 40, z: 10 }, facing: -Math.PI / 2, width: 5, aggro: 2, noRout: true, order: 'assault' },
          dress([{ type: 'ashigaru', n: 10, o: { hat: 'jingasa_n' } }], ODA));
        g.assault = F.ram.assault; F.ramReserve = g;
        rt.say('明智光秀', '控えの者、丸太に付け！', 2);
      }
      // 門が破れるまで、明智・佐久間の手は門を破る組の後ろで構えて待つ（塀の向こうの敵へは届かないので「かかれ」のまま立ち尽くさない）。
      // 打って出た僧兵が寄れば、またかかる
      F.calmT = (F.calmT || 0) - dt;
      if (F.calmT <= 0) {
        F.calmT = 1;
        for (const g of [F.ake, F.saku]) {
          if (!g || !g.count || g.routed || (g.order !== 'attack' && !g.calm)) continue;
          const c = g.center();
          const foe = rt.army.nearestEnemy({ pos: c, team: g.team }, (g.seekRange || 40) + 6, (o) => !rt.army.wallBetween(c, g.team, o.pos));
          if (g.order === 'attack' && !foe) { g.calm = true; g.order = 'hold'; }
          else if (g.calm && foe && g.order === 'hold') { g.calm = false; g.order = 'attack'; }
        }
      }
    }
    // 門が破れたら、構えて待っていた手も「かかれ」に戻す
    if (F.step !== 2) for (const g of [F.ake, F.saku]) if (g && g.calm && g.order === 'hold') { g.calm = false; g.order = 'attack'; }
    if (F.step === 3) {
      const g = F.gosei;
      if (!F.deep) {
        if (!hieiFighters(g) && !F.gosei2) this.insideReinforce(rt);
        const n = hieiFighters(g) + hieiFighters(F.gosei2);
        const distance = rt.distTo(INSIDE), returnToLine = distance >= 22;
        if (!returnToLine) F.insideArrived = true;
        rt.objProgress('main', returnToLine ? `門内の印へ${F.insideArrived ? '戻れ' : '進め'}。あと約${Math.round(distance)}歩` : n ? `戦う僧兵 ${n}人。大将と逃げる者は追うな` : '僧兵は退いた。味方と中堂へ進め');
        if (returnToLine && rt.t - (F.insideReturnT ?? -99) >= 16) {
          F.insideReturnT = rt.t;
          rt.say('明智光秀', F.insideArrived ? '追うな。門内の印へ戻り、味方と並べ' : '門を通れ。門内の印で味方と並べ', 3);
        }
      }
      if (rt.t - F.stepT > 25) this.burn(rt);
      if (rt.t - F.stepT > 30) this.burnHalls(rt);
      if (F.deep) { depthTick(rt, dt); return; }
      if (g.count < 6 && g.noRout) { g.noRout = false; g.morale = Math.min(g.morale, 20); }
      // 札と同じ数え方で、討てない大将や戦えない者だけが残る足止めを防ぐ。
      if (hieiFighters(g) === 0 && F.gosei2 && hieiFighters(F.gosei2) === 0) this.deep(rt);
      else if (rt.t - F.stepT > 150) {
        for (let i = 0; i < 2; i++) {
          const q = i ? F.gosei2 : g;
          if (q && !gone(q) && (q.count <= q.initial * 0.5 || q.morale <= 30)) {
            q.noRout = false; q.morale = Math.min(q.morale, 20);
          }
        }
      }
    }
  },

  stalled(rt, reason, warned = false) {
    const F = rt.flags;
    if (F.ending) return;
    rt.unmark('danger-retreat');
    if (!F.retreatWarning) {
      F.retreatWarning = true;
      F.retreatAt = rt.t + (warned ? 0 : 10);
      if (F.dp) F.dp.on = false;
      F.rescueHelp = null;
      rt.unzone('dp');
      rt.objRemove('main'); rt.objRemove('dp'); rt.objRemove('danger');
      for (const id of ['road', 'dp', 'gate', 'ram', 'front', 'sally', 'sally2', 'gosei', 'gosei2', 'inside', 'flank', 'ladder', 'bar', 'rescue', 'chudo', 'chudo-foe']) { rt.unmark(id); rt.uninteract(id); }
      rt.obj('withdraw', '寄せを止め、光秀の旗へ退け', 'main', true);
      rt.objProgress('withdraw', `光秀の旗へ退け。寄せを引くまであと${Math.max(0, Math.ceil(F.retreatAt - rt.t))}秒`);
      rt.marker('withdraw', () => F.akeU.pos, '退く先・光秀の旗', { h: 3, guidePriority: 500, groundGuide: true });
      // 攻撃の台詞を待たず、その場で退きの下知を伝える。
      rt._sayGate = rt.t; rt.hud.subQ.length = 0; rt.hud.subT = 0;
      if (!warned) {
        rt.banner('危ない', `${reason}。十秒後に味方の列へ退く`);
        rt.say('明智光秀', '寄せを止めよ。わしの旗へ退け！', 3);
        rt.after(10, () => this.stalled(rt, reason));
        return;
      }
    }
    if (rt.t < F.retreatAt) return;
    F.ending = true;
    if (F.dp) {
      F.dp.on = false;
      if (F.dp.cur?.people) F.dp.cur.people.fleePath = null;
    }
    F.rescueHelp = null;
    rt.objRemove('danger');
    rt.unzone('dp');
    rt.setPhase('end');
    rt.objFail('dp'); rt.objFail('main');
    rt.objRemove('dp'); rt.objRemove('main'); rt.tracker.main = false;
    for (const id of ['road', 'dp', 'gate', 'ram', 'front', 'sally', 'sally2', 'gosei', 'gosei2', 'inside', 'flank', 'ladder', 'bar', 'rescue', 'chudo', 'chudo-foe']) { rt.unmark(id); rt.uninteract(id); }
    rt.banner('寄せを立て直す', reason);
    rt._sayGate = rt.t; rt.hud.subQ.length = 0; rt.hud.subT = 0;
    sfx('sig_nobiki', 0.9);
    rt.obj('withdraw', '退き太鼓と低い法螺を合図に、味方の列へ退け', 'order');
    rt.objProgress('withdraw', '光秀の旗の印へ退け');
    rt.marker('withdraw', () => F.akeU.pos, '退く先・光秀の旗', { h: 3, guidePriority: 500, groundGuide: true });
    rt.say('明智光秀', '退き太鼓じゃ！　低い法螺に合わせ、味方の列へ退け。次の備に任せよ', 4.5);
    rt.finish({ scriptedEnd: true, failureReason: reason }, 8);
  },
  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.group && v.group.civ) {
      if (k && k.isPlayer && !F.civHurt) {
        F.civHurt = true;
        rt.objFail('civ');
        rt.violation('手向かわず逃げる者を討った', rt.G.lord ? ['明智光秀', '殿……！　その者は手向かっておりませぬ'] : ['明智光秀', '下知を忘れたか！　手向かわぬ者を討つとは何事じゃ！']);
      }
      return;
    }
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v.type === 'busho' && v.team === 1 && v.group) { v.group.noRout = false; v.group.morale -= 40; }
  },
  onRout(rt, g) {
    if (g.team !== 1 || g.civ || g._routSaid || rt.t < (rt.flags.routSayT || 0)) return;
    const c = g.center();
    if (rt.distTo(c) > 30 || rt.army.wallBetween(rt.player.u.pos, rt.player.u.team, c)) return;
    g._routSaid = true; rt.flags.routSayT = rt.t + 8;
    rt.say('足軽', '僧兵が退くぞ。追わず、味方と並べ！', 3);
  },
  onStructHit(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    const pct = Math.round(Math.max(0, s.hp) / s.maxHp * 100);
    const next = [75, 50, 25].find((q) => pct <= q && !(F.saidPct || []).includes(q));
    if (next) { F.saidPct = [...(F.saidPct || []), next]; rt.bark(`山門がきしむ（残り ${pct}%）`); }
  },
  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s !== F.gate) return;
    for (let i = 0; i < s.mesh.userData.leaves.length; i++) {
      const lv = s.mesh.userData.leaves[i];
      if (F.barOpen) lv.rotation.y = i ? -Math.PI / 2 : Math.PI / 2;
      else { lv.rotation.z = 1.4; lv.position.y = 0.1; }
    }
    rt.uninteract('ladder'); rt.unmark('ladder'); rt.uninteract('bar'); rt.unmark('bar');
    if (F.ending || F.retreatWarning) return;
    if (F.barOpen) {
      rt.award((t) => { t.special = { label: '内から山門を開けた', pts: 20 }; }, '塀を越え、内から山門を開けた');
      rt.say('明智光秀', 'でかした！　門が内から開いたぞ、押し入れ！', 3);
    }
    sfx('wood', 1.2);
    this.inside(rt);
  },
};

// 両軍の総勢（織田 三万、延暦寺の僧兵と籠もった者 四千ほど。数には諸説ある）
hieizan.force = (rt) => {
  return { a: 30000, a0: 30000, b: 4000, b0: 4000 };
};
hieizan.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '延暦寺の僧兵', mon: 'hikyaku' } };
// 近くに敵がいても、かんぬきや退く先など今の仕事を札に残す。
hieizan.keepTaskLabel = true;
// 山門の印へ向かう時も、丸太の護衛やかんぬきの下知を札に残す。
hieizan.keepDestinationTask = true;
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
hieizan.famous = [
  { name: '柴田勝家', team: 0, g: /門を破る/, loose: 1, line: '柴田勝家じゃ！　丸太を寄せよ、門を打ち破れ！' },
];
hieizan.date = (rt) => `元亀二年九月十二日　秋・煙に陰る山`;
hieizan.canSkip = (rt) => {
  if (rt.flags.ending || rt.flags.retreatWarning) return '';
  if (rt.phase === 'brief' && rt.t > 3) return '下知を聞き、山門へ進む';
  const D = rt.flags.dp, C = D?.cur;
  return D?.on && C?.s.kind === 'rest' && rt.t - C.t0 >= 4 ? '列を整え、中堂への寄せ方を選ぶ' : '';
};
hieizan.skip = (rt) => {
  if (!hieizan.canSkip(rt)) return;
  if (rt.phase === 'brief') hieizan.climb(rt);
  else rt.flags.dp.cur.ready = true;
};
hieizan.history = '元亀二年九月十二日、織田信長は比叡山を攻めた。前年、山門の衆は浅井・朝倉に味方し、信長が求めた織田方への加勢にも、双方に与しないとの求めにも応じなかった。信長公記は、根本中堂や山王の社、僧坊などを焼き払い、八王子山へ逃れた僧俗や子供、女も殺し、死者は数千に及んだと記す。焼き討ち後、明智光秀に志賀郡が与えられたとも記す。ここで示す両軍三万・四千は遊び上の目安で、信長公記の確定した兵数ではない。煙に陰る昼の景色や火の回る順、山門の攻防、正覚院豪盛の指揮と退却、救出の任務は遊びのための補いである。逃げる者を討たぬ下知も創作で、史実の信長の命令ではない。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
hieizan.lordAt = { x: 104, z: -2, r: 12, why: '坂本の織田の陣（信長は坂本から山を囲ませた）' };
hieizan.lordSpawn = { x: 102, z: 0, heading: -Math.PI / 2 };

// 素直な遊び手：光秀の手のそばで僧兵を突き、門の前では門を破る組を守り、門の内では豪盛の衆へ。逃げる者には手を出さない
hieizan.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.55) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, GATE.x + 40, 4, 2); return; }
  if (F.rescueHelp) {
    inp.guardHold = false;
    goTo(p, inp, F.rescueHelp.x, F.rescueHelp.z, 2);
    if (Math.hypot(u.pos.x - F.rescueHelp.x, u.pos.z - F.rescueHelp.z) < 4) inp.k.add('KeyE');
    return;
  }
  if (F.deep) { depthBot(b, inp, goTo); return; }
  const inside = F.step >= 3;
  const e = b.army.nearestEnemy(u, inside ? 16 : 12, (o) => !o.fleeing && !o.invuln && !(o.group && o.group.civ) && (inside || o.pos.x > GATE.x + 0.5));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 3) { const t = [F.gosei, F.gosei2].find((q) => q && !gone(q)); if (t) { const c = t.center(); goTo(p, inp, c.x, c.z, 2); return; } }
  if (F.step === 2) { goTo(p, inp, GATE.x + 8, 0, 2); return; }
  if (F.step === 1) { const at = hieiWay(u, CLIMB_GOAL); goTo(p, inp, at.x, at.z, 2); return; }
  const a = F.akeU.pos; goTo(p, inp, a.x + 4, a.z + 3, 3);
};

// ---- 門の内から先の段 ----
const SO = (s, a, bw) => [{ type: 'samurai', n: s, o: { hat: 'hachimaki', weapon: 'spear' } }, { type: 'ashigaru', n: a }, { type: 'bow', n: bw }];
// 中堂の前を押さえ、逃げ遅れた人を助ける。前年の朝倉・浅井の兵は新手にしない。
function hzSteps(def) {
  const steps = [
    rest({ dur: 8, heal: 0.2, say: [['明智光秀', '列を整えよ。次は中堂じゃ。里の者に刃を向けるな', 3]] }),
    pick({ title: '中堂の前に僧兵と里の者がいる。どう寄せる？',
      pre: (rt) => { rt.obj('dp', '中堂の前への進み方を選べ', 'main'); },
      options: [{ label: '道を空け、人々を逃がして僧兵を受ける', note: '中堂の前で味方と持ちこたえる' }, { label: '僧兵を押し退け、中堂の前を押さえる', note: '里の者へ刃を向けぬよう寄せる' }],
      on: (rt, m, i) => {
        rt.objRemove('main');
        m.hLet = i === 0;
        def.civ(rt, -36, 9, 4, '逃げる里の者');
        rt.say('明智光秀', i === 0 ? '道を空けよ。僧兵はここで受ける！' : '中堂へかかれ。里の者に刃を向けるな', 3);
      } }),
    hold({ skip: (rt, m) => !m.hLet, at: { x: -34, z: 2 }, dur: 65, realHold: true, r: 14,
      title: '中堂の前', sub: '味方と並び、人々の逃げ道を守る', label: '中堂の前', obj: '中堂前で味方と並び、僧兵を返せ',
      say: [['明智光秀', '輪の中で味方三人と並べ。二十秒守り、次の敵も返せ']],
      waves: [
        { t: 4, say: ['足軽', '堂の陰だがや！　薙刀が来るぞ！'], foes: () => [{ name: '中堂の僧兵', from: { x: -58, z: 5 }, list: SO(2, 12, 2), noRout: 20 }] },
        { t: 30, say: ['明智光秀', '北にも来た。隣の組と並べ！'], foes: () => [{ name: '僧坊の僧兵', from: { x: -42, z: 30 }, list: SO(2, 10, 2) }] },
      ], reward: '中堂の前で逃げ道を守った',
      onEnd: (rt, m, won) => { m.hSecured = won; if (!won) def.stalled(rt, '中堂の持ち場を守れず、寄せを引いた'); } }),
    fight({ skip: (rt, m) => m.hLet, at: { x: -40, z: 0 }, title: '中堂へかかれ', sub: '堂の前の僧兵を押し退ける', obj: '中堂の前の僧兵を崩せ',
      preserveFoes: true,
      foes: () => [{ name: '中堂を守る僧兵', from: { x: -58, z: 5 }, list: SO(3, 14, 2), noRout: 20 }],
      later: [{ t: 24, say: ['足軽', '北の僧坊からも出てきたがや！'], foes: () => [{ name: '僧坊の僧兵', from: { x: -42, z: 30 }, list: SO(2, 10, 2) }] }],
      max: 100, reward: '中堂の前を押さえた',
      onEnd: (rt, m, won) => { m.hSecured = won; if (!won) def.stalled(rt, '中堂の僧兵を崩せず、寄せを引いた'); } }),
    hzRescue(def),
  ];
  // 段が敗れた後は、残る下知や救出の札を出さない。
  for (const step of steps) {
    const skip = step.skip;
    step.skip = (rt, m) => rt.flags.ending || rt.flags.retreatWarning || !!(skip && skip(rt, m));
    if (step.kind === 'rest') {
      const start = step.start, tick = step.tick;
      const seconds = 8;
      step.start = (rt, C, m, ctx) => {
        start(rt, C, m, ctx);
        // 古い攻撃・達成の札を残さず、同じ一枠で次の下知を示す。
        rt.objRemove('main');
        rt.obj('dp', '光秀の旗へ寄り、列を整えよ', 'main');
        rt.marker('dp', () => rt.flags.akeU.pos, '光秀の旗・列を整える', { h: 3, guidePriority: 200, groundGuide: true });
        rt.objProgress('dp', '旗へ寄れば、列を整えて次へ進める');
      };
      step.tick = (rt, C, m, ctx, el) => {
        const distance = rt.distTo(rt.flags.akeU.pos);
        // 旗のそばでは四秒で下知が出る。実際に待つ秒数を札にも示す。
        const left = Math.max(0, Math.ceil((distance <= 8 ? 4 : seconds) - el));
        rt.objProgress('dp', distance > 8 ? `旗まで約${Math.round(distance)}歩。寄れば早く進める。下知まで${left}秒` : `ここで列を整えよ。次の下知まで${left}秒`);
        // 下知を聞く四秒は保ち、旗へ着いた者を残り時間だけ待たせない。
        return C.ready || (el >= 4 && distance <= 8) || tick(rt, C, m, ctx, el);
      };
    }
    if (step.kind === 'pick') {
      const start = step.start;
      step.start = (rt, C, m, ctx) => {
        rt.unmark('dp');
        start(rt, C, m, ctx);
      };
    }
    if (step.kind === 'hold') {
      const start = step.start, tick = step.tick, end = step.end;
      step.start = (rt, C, m, ctx) => {
        start(rt, C, m, ctx);
        // 「印へ戻れ」の下知と、足元の道案内を同じ持ち場に揃える。
        rt.marker('dp', C.at, '中堂の前', { h: 3, guidePriority: 200, groundGuide: true });
        // 守備時間が進む範囲を、そのまま足元の輪にする。判定は変えない。
        rt.zone('dp', C.at.x, C.at.z, C.botRadius + 8);
        rt.marker('chudo-foe', () => hieiRemainingPos(rt, C.groups), '残る僧兵', { red: true });
      };
      step.end = (rt, C, m, ctx) => {
        rt.unmark('chudo-foe');
        // 守備時間だけ満たして時間切れになった時も、札と同じ条件で成否を決める。
        if (!C.hieiHeld) C.timeout = true;
        end(rt, C, m, ctx);
      };
      step.tick = (rt, C, m, ctx, el, dt) => {
        tick(rt, C, m, ctx, el, dt);
        let enemies = 0;
        for (const g of C.groups) enemies += hieiFighters(g);
        const p = rt.player.u.pos, distance = Math.hypot(p.x - C.at.x, p.z - C.at.z);
        // 最後も持ち場で味方と並ぶ。離れた所で古い守備時間だけを満たして終えない。
        const inLine = distance < C.botRadius + 8 && (C.nearCached || 0) >= 3;
        const done = !C.waves.length && !enemies && C.arrivedHold >= 20 && inLine;
        C.hieiHeld = done;
        if (done) return true;
        const left = Math.max(0, Math.ceil(step.max - el));
        let progress = '';
        // 守る秒数が進まない理由と戻る先を示す。共通の守備判定は変えない。
        if (!done && distance >= C.botRadius + 8) {
          progress = `印へ戻れ。あと約${Math.round(distance)}歩`;
          if (rt.t - (C.returnSayT ?? -99) >= 8) {
            C.returnSayT = rt.t;
            rt.say('明智光秀', '追いすぎるな。中堂前の印へ戻り、味方と並べ', 3);
          }
        } else if (!done && (C.nearCached || 0) < 3) {
          progress = `印で味方を待て。あと${3 - (C.nearCached || 0)}人`;
          if (rt.t - (C.gatherSayT ?? -99) >= 16) {
            C.gatherSayT = rt.t;
            rt.say('明智光秀', '印で味方三人と並べ。そろえば守る時間が進むぞ', 3);
          }
        } else if (!done && (C.arrivedHold || 0) < 20) {
          progress = `印で味方と守れ。守りあと${Math.max(0, Math.ceil(20 - (C.arrivedHold || 0)))}秒`;
        } else if (!done) {
          if (enemies) progress = `印を守り、僧兵${enemies}人を返せ`;
          else if (C.waves.length) {
            let next = Infinity;
            for (const wave of C.waves) next = Math.min(next, wave.t);
            progress = `印で守れ。次の寄せまで${Math.max(0, Math.ceil(next - el))}秒`;
          }
        }
        // 守る二十秒と、段全体の締め切りを区別して同じ札に示す。
        if (left > 15 && C.waves.length && (enemies || !inLine || (C.arrivedHold || 0) < 20)) {
          let next = Infinity;
          for (const wave of C.waves) next = Math.min(next, wave.t);
          progress += `。新手まで${Math.max(0, Math.ceil(next - el))}秒`;
        }
        progress += `。持ち時間${left}秒`;
        if (progress) rt.objProgress('dp', progress);
        if (!done && left <= 15 && !C.hurrySaid) {
          C.hurrySaid = true;
          rt.say('明智光秀', '時がない。印で味方と並び、残る僧兵を返せ', 3);
        }
        return done;
      };
    }
    if (step.kind === 'fight') {
      const start = step.start, tick = step.tick, end = step.end;
      step.start = (rt, C, m, ctx) => {
        start(rt, C, m, ctx);
        // 敵の印は新手ごとに消えるため、戻る持ち場の印を別に保つ。
        rt.marker('chudo', C.at, '中堂の前', { h: 3, guidePriority: 200, groundGuide: true });
        rt.marker('chudo-foe', () => hieiRemainingPos(rt, C.groups), '残る僧兵', { red: true });
        rt.say('明智光秀', '中堂前の僧兵を崩せ。北からの新手にも備えよ', 3);
      };
      step.end = (rt, C, m, ctx) => {
        rt.unmark('chudo');
        rt.unmark('chudo-foe');
        // 札に残る僧兵がいる時は、共通の六割撃退による成功に替えない。
        // 新手も全て迎えた時だけ、次の救出へ進める。
        let enemies = 0;
        for (const g of C.groups) enemies += hieiFighters(g);
        C.timeout = !!C.later.length || enemies > 0;
        end(rt, C, m, ctx);
      };
      step.tick = (rt, C, m, ctx, el) => {
        tick(rt, C, m, ctx, el);
        let enemies = 0;
        for (const g of C.groups) enemies += hieiFighters(g);
        // 札と同じ数え方に揃え、負傷して戦えない者を探させない。
        // 予定された新手は全て出してから、救出へ進む。
        // 共通の「二人以下なら崩れた」判定では、札に戦える者が残ってしまう。
        const done = !C.later.length && !enemies;
        if (done) return true;
        // 最後の新手の後も、同じ札に次の行動と持ち時間を残す。
        if (!done && C.later.length) {
          let next = Infinity;
          for (const wave of C.later) next = Math.min(next, wave.t);
          const left = Math.max(0, Math.ceil(next - el));
          if (enemies) rt.objProgress('dp', `僧兵${enemies}人を崩せ。北の新手まであと${left}秒`);
          if (!enemies) {
            const distance = Math.hypot(rt.player.u.pos.x - C.at.x, rt.player.u.pos.z - C.at.z);
            rt.objProgress('dp', distance > 14 ? `中堂前へ戻れ。印まで約${Math.round(distance)}歩` : `味方と並べ。北の新手まであと${left}秒`);
            if (!C.waitSaid) {
              C.waitSaid = true;
              rt.say('明智光秀', '追うな。中堂の前で味方と並べ。北からも来るぞ', 3);
            }
          }
        }
        if (!done && !C.later.length) {
          const left = Math.max(0, Math.ceil(step.max - el));
          rt.objProgress('dp', `残る僧兵${enemies}人を崩せ${enemies <= 2 ? '。「残る僧兵」の印を探せ' : ''}。持ち時間${left}秒`);
          if (!C.lastWaveSaid) {
            C.lastWaveSaid = true;
            rt.say('明智光秀', '新手は出そろった。味方と残る僧兵を崩せ', 3);
          }
        }
        return done;
      };
    }
  }
  return steps;
}

// 堂の外で手を貸して初めて救出とする。近づいただけでは手柄にしない。
function hzRescue(def) {
  const at = RESCUE;
  // 六秒の待ち段を省き、その分は救出の持ち時間に含める。
  const step = move({ to: at, max: 66, r: 4, label: '煙の残る僧坊の縁', obj: '僧坊の印へ。「救い出す」を三秒長押し',
    onEnd: (rt, m, rescued) => {
      rt.flags.rescueHelp = null;
      rt.uninteract('rescue');
      rt.unmark('rescue');
      if (!rescued) return;
      rt.award((t) => t.side.push('僧坊から人々を救い出した'), '僧坊から人々を救い出した');
      rt.say('足軽', 'みな外へ出たぞ！　堂から離れよう！', 3);
    } });
  const start = step.start, end = step.end;
  step.start = (rt, C, m, ctx) => {
    start(rt, C, m, ctx);
    rt.say('明智光秀', '僧坊に人が残っておる。印で手を貸せ', 3);
    // 到着だけで消える移動の印を、救出が済むまで残す印に替える。
    rt.unmark('dp');
    rt.marker('rescue', at, '僧坊の縁・救出', { h: 3, guidePriority: 200, groundGuide: true });
    m.hRescued = false;
    rt.flags.rescueDone = false;
    C.people = def.civ(rt, at.x, at.z, 4, '逃げ遅れた人々');
    C.people.fleePath = [[at.x, at.z]];
    rt.flags.rescueHelp = at;
    rt.addInteract('rescue', at, '救い出す', () => {
      if (rt.flags.ending || m.hRescued) return;
      m.hRescued = true;
      rt.flags.rescueDone = true;
      C.people.name = '救い出した人々';
      C.people.fleePath = [[-17, -16], [-34, -10], [-106, -8]];
      for (const u of C.people.units) u.fleePathIdx = 0;
      rt.uninteract('rescue');
    }, { r: 4, hold: 3, prio: 20 });
  };
  step.tick = (rt, C, m, ctx, el) => {
    // 移動だけの到着判定は使わず、救出が済むまで持ち場の輪も残す。
    const p = rt.player.u.pos, distance = Math.hypot(p.x - at.x, p.z - at.z);
    const left = Math.max(0, Math.ceil(step.max - el));
    const helping = rt.holdId === 'rescue';
    const helpLeft = Math.max(1, Math.ceil(3 - (helping ? rt.holdT : 0)));
    rt.objProgress('dp', helping ? `引き出すまで${helpLeft}秒。残り${left}秒` : distance < 4 ? `「救い出す」を三秒長押し。残り${left}秒` : `僧坊の印まで約${Math.round(distance)}歩。残り${left}秒`);
    if (left <= 15 && !C.hurrySaid && !m.hRescued) {
      C.hurrySaid = true;
      rt.say('明智光秀', '急げ。僧坊の縁へ寄り、外から手を貸せ！', 3);
    }
    if (distance < 4 && !C.helpSaid && !m.hRescued) {
      C.helpSaid = true;
      rt.say('足軽', 'ここじゃ。手を貸せ、外へ引き出すぞ！', 3);
    }
    return m.hRescued;
  };
  step.end = (rt, C, m, ctx) => {
    C.arr = !!m.hRescued;
    C.people.fleePath = m.hRescued ? C.people.fleePath : null;
    end(rt, C, m, ctx);
  };
  return step;
}

export { hieizan };
