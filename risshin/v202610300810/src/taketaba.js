// ======================================================================
// 竹束（taketaba.js）… docs/quality-upgrade-plan.md「6. 竹束」
// b_castle.js にあった竹束（形・押す・陰は前からの矢玉をほぼ防ぐ）と、
// siege_rocks.js の「抱えた者は落石の7割を防ぐ」の考えを、一つの部品にまとめた。
// castle_plan を使う攻城戦（高遠・比叡山・越前一向一揆・稲葉山など）は、
//   addTaba / placeFromSpots で竹束を置き、patchGunCover(rt) を一度呼び、
//   毎フレーム tickTabas(rt, dt) と tabaInteractTick(rt, opts) を呼べば、
//   押す・据える・陰に入る、が動く。形と材質は使い回し、毎コマ new しない。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pinGroup, keepPinned, unpinGroup } from './siege_zones.js';
import { S } from './settings.js';
import { groundAt } from './floors.js';

function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

const TABA_SHAPES = new Map();
let TABA_MAT = null;
// 縦竹七本を一束として四束並べる。藁縄は各束の外周を三段で締める。
// 台車も同じ結合形を使い回し、置いた後に部品を増やさない。
export function tabaGeo(night = false, pass = false, cart = false, fieldBundle = false, fieldTrestle = false) {
  const high = true;
  const dense = high && (fieldBundle || cart);
  const trestle = high && !cart && fieldTrestle;
  const key = `${night}:${pass}:${cart}:${high}:${dense}:${fieldBundle}:${trestle}`;
  if (TABA_SHAPES.has(key)) return TABA_SHAPES.get(key);
  const parts = [], lift = cart ? .32 : 0;
  // くすんだ黄緑から枯れ色まで。一色に揃えず、束の中で青みと枯れを混ぜる。
  const bamboo = night ? [0x6c7258, 0x77735a, 0x666c56] : [0x8f9156, 0x9c9060, 0x80854c];
  const rope = night ? 0x655e4c : 0xb6a071, wood = night ? 0x514d42 : 0x72644d;
  const add = (g, color, x, y, z) => { g.translate(x, y, z); parts.push(paint(g, color)); };
  const box = (w, h, d, x, y, z) => add(new THREE.BoxGeometry(w, h, d), wood, x, y, z);
  for (let bundle = 0; bundle < 4; bundle++) {
    const cx = (bundle - 1.5) * .46;
    // 車竹束も細竹の外周にする。隠れる内側は太い芯一本で埋め、面数を抑える。
    // 指定された据え竹束は外周十二本・内周六本・芯一本を保ち、束幅と縄の位置も共通にする。
    for (let i = 0; i < (dense ? (fieldBundle ? 19 : 13) : 7); i++) {
      const a = dense ? (i < 12 ? i * Math.PI / 6 : (i - 12) * Math.PI / 3) : i * Math.PI / 3;
      const r = dense ? (i < 12 ? .145 : fieldBundle && i < 18 ? .073 : 0) : i === 6 ? 0 : .126;
      const x = cx + Math.cos(a) * r, z = Math.sin(a) * r;
      const h = 1.69 + ((bundle * 3 + i) % 4) * .035;
      const core = dense && !fieldBundle && i === 12;
      const stalk = paint(new THREE.CylinderGeometry(core ? .113 : dense ? .034 : .061, core ? .115 : dense ? .036 : .065, h, 5, high ? 2 : 1), bamboo[(bundle + i) % 3]);
      if (high) {
        // 泥は接地する下端だけ。根元の一段と頂点色で竹の青黄から分ける。
        const p = stalk.attributes.position, c = stalk.attributes.color;
        const mud = new THREE.Color(night ? 0x393d2d : 0x625838);
        for (let j = 0; j < p.count; j++) {
          // 中間の輪を根元から二十二センチへ寄せ、汚れが竹全体へ伸びるのを防ぐ。
          if (Math.abs(p.getY(j)) < .001) p.setY(j, -h / 2 + .22);
          else if (p.getY(j) < 0) c.setXYZ(j, mud.r, mud.g, mud.b);
        }
      }
      stalk.translate(x, lift + h / 2, z); parts.push(stalk);
      // 内側の詰め物へ節や黒い切り口を重ねない。外周の細竹だけを見せる。
      if (core) continue;
      // 竹の節は二段だけ。切り口は明るい縁の内に暗い口を描く。
      for (const y of [.61, 1.21]) add(new THREE.CylinderGeometry(dense ? .039 : .069, dense ? .039 : .069, .024, 5), bamboo[(bundle + i + 1) % 3], x, lift + y, z);
      const mouth = new THREE.CircleGeometry(dense ? .024 : .045, 5); mouth.rotateX(-Math.PI / 2);
      add(mouth, night ? 0x292b22 : 0x443e25, x, lift + h + .001, z);
      if (high) {
        // 黒い栓に見えないよう、空洞の周りへ淡い竹肉の木口を残す。
        const rim = new THREE.RingGeometry(dense ? .024 : .045, dense ? .034 : .061, 5);
        rim.rotateX(-Math.PI / 2);
        add(rim, night ? 0x878370 : 0xc4b78a, x, lift + h + .002, z);
      }
    }
    for (const y of [.27, .84, 1.43]) {
      if (high) {
        // 一枚の帯でなく、束を三巻きした縄。隙間と色差で巻き目を出す。
        for (const dy of [-.024, 0, .024]) add(new THREE.CylinderGeometry(.2, .2, .017, 8, 1, true),
          dy === 0 ? (night ? 0x77705a : 0xc2ad7f) : rope, cx, lift + y + dy, 0);
      } else add(new THREE.CylinderGeometry(.198, .198, .065, 8, 1, true), rope, cx, lift + y, 0);
      add(new THREE.BoxGeometry(.11, .08, .045), rope, cx, lift + y, -.207);
      if (high) {
        // 結び目から垂れた短い縄端。束ごとに長さを違え、同じ形を共有する。
        const tail = new THREE.CylinderGeometry(.012, .014, .1 + bundle * .012, 4);
        tail.rotateZ(.22); add(tail, rope, cx + .025, lift + y - .075, -.224);
      }
    }
  }
  // 裏の横桟と控え。幅・奥行は従来の弾よけの範囲内。
  for (const y of [.3, 1.4]) box(1.85, .075, .09, 0, lift + y, .25);
  if (trestle) {
    // 姉川の据え竹束だけ、写真の叉木に横木を掛ける木架へ替える。
    // 前後の脚を交差させ、竹束の上へ短い叉を出す。遠景にも同じ支えを残す。
    const pole = (p, q, radius) => {
      const dir = new THREE.Vector3().subVectors(q, p), length = dir.length();
      const g = new THREE.CylinderGeometry(radius * .8, radius, length, 5);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
      add(g, wood, (p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
    };
    for (const x of [-.86, .86]) {
      pole(new THREE.Vector3(x, -.04, -.18), new THREE.Vector3(x, 1.96, .49), .043);
      pole(new THREE.Vector3(x, -.04, 1.36), new THREE.Vector3(x, 1.96, .29), .043);
      if (dense) for (const yy of [1.74, 1.79])
        add(new THREE.CylinderGeometry(.085, .085, .032, 6, 1, true), rope, x, yy, .41);
    }
    pole(new THREE.Vector3(-1.03, 1.79, .4), new THREE.Vector3(1.03, 1.79, .4), .045);
    if (dense) for (const x of [-.69, .69])
      add(new THREE.BoxGeometry(.028, .4, .035), rope, x, 1.59, .26);
  } else for (const x of [-.69, .69]) {
    const pole = new THREE.CylinderGeometry(.035, .045, 1.67, 5);
    pole.rotateX(-.72); add(pole, wood, x, lift + .62, .79);
  }
  if (cart) {
    for (const x of [-.76, .76]) {
      if (high) {
        // 車竹束の台は皮付きの丸太。後ろへ出た木口だけ明るくし、角材と区別する。
        const log = new THREE.CylinderGeometry(.1, .11, 1.7, 6); log.rotateX(Math.PI / 2);
        add(log, night ? 0x494a40 : 0x666754, x, .32, .45);
        const end = new THREE.CircleGeometry(.085, 6);
        add(end, night ? 0x6a6551 : 0xa49a73, x, .32, 1.301);
      } else box(.16, .16, 1.7, x, .32, .45);
    }
    if (high) {
      // 写真の車竹束は束の後ろにも二段の囲いがある。押す側の中央を空け、左右を台木へ留める。
      // 細い角材六本だけを既存の共有形へ結合し、車輪や弾よけの幅は変えない。
      for (const x of [-.76, .76]) {
        box(.075, 1.12, .075, x, .88, 1.12);
        for (const y of [.91, 1.29]) box(.065, .075, .94, x, y, .67);
      }
    }
    for (const z of [-.12, 1.06]) {
      if (high) {
        const axle = new THREE.CylinderGeometry(.075, .085, 2.06, 6); axle.rotateZ(Math.PI / 2);
        add(axle, night ? 0x494a40 : 0x666754, 0, .29, z);
      } else box(2.06, .13, .13, 0, .29, z);
      for (const x of [-1.0, 1.0]) {
        const wheel = new THREE.CylinderGeometry(.29, .29, .12, 10); wheel.rotateZ(Math.PI / 2);
        add(wheel, wood, x, .29, z);
        const hub = new THREE.CylinderGeometry(.07, .07, .16, 6); hub.rotateZ(Math.PI / 2);
        add(hub, rope, x, .29, z);
        if (high) {
          const face = new THREE.CircleGeometry(.263, 10);
          face.rotateY(Math.sign(x) * Math.PI / 2);
          add(face, night ? 0x78705a : 0xaca17e, x + Math.sign(x) * .061, .29, z);
          // 木口の乾いた割れ。円盤の外面だけに刻み、既存の結合形へまとめる。
          for (const dz of [-.13, .11]) add(new THREE.BoxGeometry(.004, .36, .008),
            night ? 0x494735 : 0x73684b, x + Math.sign(x) * .064, .29, z + dz);
        }
      }
    }
  }
  const geo = mergeGeometries(parts);
  parts.forEach(g => g.dispose());
  TABA_SHAPES.set(key, geo);
  return geo;
}
// 竹の肌：縦の繊維と、乾いて白けた筋・薄い染み。明るい下地に頂点の色を掛ける（杉の木目を掛けると黒い板に見えた。10/29）。
let TABA_TEX = null;
function tabaTex() {
  if (TABA_TEX) return TABA_TEX;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  let s = 97; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  g.fillStyle = '#d9d1b9'; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 90; i++) {
    const x = r() * 128, v = r();
    g.fillStyle = v < .5 ? `rgba(${120 + v * 60},${118 + v * 50},${70 + v * 30},.22)` : `rgba(255,250,228,${.12 + v * .14})`;
    g.fillRect(x, 0, .6 + r() * 1.6, 256);
  }
  for (let i = 0; i < 10; i++) {
    const x = r() * 128, y = r() * 256, h = 20 + r() * 60;
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(110,98,60,0)'); gr.addColorStop(.5, 'rgba(110,98,60,.18)'); gr.addColorStop(1, 'rgba(110,98,60,0)');
    g.fillStyle = gr; g.fillRect(x, y, 6 + r() * 14, h);
  }
  TABA_TEX = new THREE.CanvasTexture(c);
  TABA_TEX.colorSpace = THREE.SRGBColorSpace; TABA_TEX.wrapS = TABA_TEX.wrapT = THREE.RepeatWrapping; TABA_TEX.anisotropy = 4;
  return TABA_TEX;
}
export function tabaMat() {
  if (!TABA_MAT) {
    const map = tabaTex();
    // 竹の肌は蝋を含んで鈍く照る。暗い頂点の色を本来の明るさへ持ち上げ、月明かりでも束と節の形が残る程度の下地の明るさを足す。
    TABA_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, map, color: new THREE.Color(0.98, 0.93, 0.84), roughness: 0.7, metalness: 0,
      emissive: 0x24221a, emissiveMap: map, emissiveIntensity: 0.3 });
  }
  return TABA_MAT;
}

function tabas(rt) { return rt.flags.tabas || (rt.flags.tabas = []); }

// 押してほしい竹束を金色にほのかに光らせる（字の案内の代わり。テスター 10/27「竹束を押す事が分からない」）。
// 光る材質は一つを使い回し、毎コマ new しない。tb に null を渡すと元へ戻す。
let TABA_LIT = null;
const setTabaMat = (tb, mat) => tb.m.traverse((o) => { if (o.isMesh) o.material = mat; });
export function tabaHighlight(rt, tb) {
  const F = rt.flags;
  if (F.tabaLit && F.tabaLit !== tb) { setTabaMat(F.tabaLit, tabaMat()); F.tabaLit = null; }
  if (!tb) return;
  if (!TABA_LIT) { TABA_LIT = tabaMat().clone(); TABA_LIT.emissive = new THREE.Color(0xffc24a); }
  if (F.tabaLit !== tb) { setTabaMat(tb, TABA_LIT); F.tabaLit = tb; }
  TABA_LIT.emissiveIntensity = S.reduceMotion ? .55 : .45 + .3 * Math.sin(rt.t * 4.2);
}

// 竹束を一つ置く（team の側の楯。o.van があれば、その組の前について動く）
export function addTaba(rt, x, z, team = 0, o = {}) {
  const cart = o.cart ?? !!o.van;
  const near = new THREE.Mesh(tabaGeo(false, !!o.detailed, cart, rt.world.def.denseTabaBundles), tabaMat());
  near.castShadow = true;
  let m = near;
  if (rt.world.def.denseTabaBundles) {
    // 寄せ手が増えても、離れた束に細竹の三角形を使わない。形と材質は全束で共用。
    m = new THREE.LOD();
    const far = new THREE.Mesh(tabaGeo(false, !!o.detailed, cart), tabaMat());
    far.castShadow = true;
    m.addLevel(near, 0); m.addLevel(far, 28, .15);
  }
  rt.scene.add(m);
  const tb = { m, x, z, rot: o.rot ?? Math.PI, team, carrier: null, van: o.van || null, off: o.off || 0, fixed: !!o.fixed,
    faceSign: o.faceSign ?? -1, vanDist: o.vanDist ?? 2.8, dir: o.dir || null };
  placeTaba(rt, tb);
  tabas(rt).push(tb);
  return tb;
}
// 定義（castles/*.js の def）に書いた置き場の列から、まとめて竹束を置く
// spots: [[x,z], ...] か [{x,z,rot?,van?,off?}, ...]
export function placeFromSpots(rt, spots, team = 0, o = {}) {
  for (const s of spots || []) {
    if (Array.isArray(s)) addTaba(rt, s[0], s[1], team, o);
    else addTaba(rt, s.x, s.z, team, { ...o, ...s });
  }
}
// 山寺で使う時だけ足場の傾きに合わせる。向きと行列の位置、矢除けの条件は保つ。
const tabaX = new THREE.Vector3(), tabaY = new THREE.Vector3(), tabaZ = new THREE.Vector3();
const tabaBasis = new THREE.Matrix4();
const tabaFeet = [[-.95, -.05], [.95, -.05], [-.6875, 1.35], [.6875, 1.35]];
function tabaGround(world, x, z) {
  return world.def.tabaDeckGround ? groundAt(world, x, z) : world.heightAt(x, z);
}
export function placeTaba(rt, tb) {
  if (rt.world.def.tabaSlopeGround) {
    // 据えた後や微小な動きで、同じ足場を毎コマ調べ直さない。
    if (tb._slopeX !== undefined && Math.hypot(tb.x - tb._slopeX, tb.z - tb._slopeZ) < .04 &&
        Math.abs(tb.rot - tb._slopeRot) < .01) return;
    tb._slopeX = tb.x; tb._slopeZ = tb.z; tb._slopeRot = tb.rot;
    const yaw = tb.rot + Math.PI, c = Math.cos(yaw), s = Math.sin(yaw), W = rt.world;
    const dx = (tabaGround(W, tb.x + c * .95, tb.z - s * .95) -
      tabaGround(W, tb.x - c * .95, tb.z + s * .95)) / 1.9;
    const dz = (tabaGround(W, tb.x + s * 1.35, tb.z + c * 1.35) -
      tabaGround(W, tb.x - s * .25, tb.z - c * .25)) / 1.6;
    tabaX.set(c, dx, -s).normalize(); tabaZ.set(s, dz, c).normalize();
    tabaY.crossVectors(tabaZ, tabaX).normalize(); tabaZ.crossVectors(tabaX, tabaY).normalize();
    tabaBasis.makeBasis(tabaX, tabaY, tabaZ); tb.m.quaternion.setFromRotationMatrix(tabaBasis);
    // 横束の両端と支え棒の足を調べ、どの足も地面へ潜らない高さにする。
    let y = -Infinity;
    for (const foot of tabaFeet) {
      const fx = tabaX.x * foot[0] + tabaZ.x * foot[1];
      const fz = tabaX.z * foot[0] + tabaZ.z * foot[1];
      y = Math.max(y, tabaGround(W, tb.x + fx, tb.z + fz) - tabaX.y * foot[0] - tabaZ.y * foot[1]);
    }
    tb.m.position.set(tb.x, y - .05, tb.z);
    return;
  }
  tb.m.position.set(tb.x, rt.world.heightAt(tb.x, tb.z) - 0.05, tb.z);
  // 竹束の前（原点の -z）を寄せる向きへ
  tb.m.rotation.y = tb.rot + Math.PI;
}

// 竹束の陰にいる（team の味方の竹束から 2.6m 以内）か
export function nearTaba(rt, x, z, team) {
  for (const tb of tabas(rt)) {
    if (tb.team !== team) continue;
    if (Math.hypot(tb.x - x, tb.z - z) < 2.6) return tb;
  }
  return null;
}
// 石・丸太など、向きを問わない落下物を防げるか（siege_rocks.js と合わせる）
export function inCoverOf(rt, x, z, team) { return !!nearTaba(rt, x, z, team); }

// 竹束の陰にいる者には、前から来る矢玉がほとんど当たらない（army.damage を一度だけ差し替える）
export function patchGunCover(rt) {
  if (rt.flags.tabaCoverPatched) return;
  rt.flags.tabaCoverPatched = true;
  const army = rt.army;
  const dmg0 = army.damage.bind(army);
  army.damage = (t, amount, src, opts) => {
    if (t && !t.isStruct && src && (src.type === 'gun' || src.type === 'bow') && src.team !== t.team && t.pos && (rt.flags.tabas || []).length) {
      const dS = Math.hypot(src.pos.x - t.pos.x, src.pos.z - t.pos.z);
      if (dS > 6) {
        for (const tb of rt.flags.tabas) {
          if (tb.team !== t.team) continue;
          const dx = tb.x - t.pos.x, dz = tb.z - t.pos.z, d = Math.hypot(dx, dz);
          if (d > 2.6 || d < 0.05) continue;
          const dot = (dx * (src.pos.x - t.pos.x) + dz * (src.pos.z - t.pos.z)) / (d * dS);
          if (dot > 0.5 && Math.random() < 0.85) {
            army.play('knock', { x: tb.x, z: tb.z }, 0.5);
            army.spark(tb.x, rt.world.heightAt(tb.x, tb.z) + 1.2, tb.z, 3);
            rt.flags.tabaSaved = (rt.flags.tabaSaved || 0) + 1;
            return;
          }
        }
      }
    }
    return dmg0(t, amount, src, opts);
  };
}

// 毎フレーム：押している者の前、または組の前について動く
export function tickTabas(rt, dt) {
  const F = rt.flags, pu = rt.player.u;
  for (const tb of F.tabas || []) {
    if (tb.fixed) continue;
    if (tb.carrier === 'player') {
      const h = pu.heading || 0;
      tb.x = pu.pos.x + Math.sin(h) * 1.05; tb.z = pu.pos.z + Math.cos(h) * 1.05; tb.rot = h;
      placeTaba(rt, tb);
    } else if (tb.van && tb.van.count && (tb.van.order === 'move' || tb.van.order === 'hold')) {
      const c = tb.van.center();
      // o.dir（寄せる向きの単位の向き）を渡した竹束は、どの向きからの寄せでも組の前・横 off に付く
      const tx = tb.dir ? c.x + tb.dir.x * tb.vanDist - tb.dir.z * tb.off : c.x + tb.off;
      const tz = tb.dir ? c.z + tb.dir.z * tb.vanDist + tb.dir.x * tb.off : c.z + tb.faceSign * tb.vanDist;
      tb.x += (tx - tb.x) * Math.min(1, dt * 2); tb.z += (tz - tb.z) * Math.min(1, dt * 2);
      placeTaba(rt, tb);
    }
  }
}

// E で使う物（押す・据える）：want 配列（b_castle.js の acts と同じ形）を返す
export function wantEntries(rt, { allowPush = true, team = 0 } = {}) {
  const F = rt.flags, pu = rt.player.u, want = [];
  const mine = (F.tabas || []).find((tb) => tb.carrier === 'player');
  if (mine) want.push(['taba', () => ({ x: mine.x, z: mine.z }), '竹束を据える', () => { mine.carrier = null; mine.fixed = true; }, { r: 3 }]);
  else if (allowPush) {
    let best = null, bd = 2.6;
    for (const tb of F.tabas || []) { if (tb.team !== team || tb.van || tb.carrier) continue; const d = Math.hypot(tb.x - pu.pos.x, tb.z - pu.pos.z); if (d < bd) { bd = d; best = tb; } }
    if (best) want.push(['taba', { x: best.x, z: best.z }, '竹束を押して歩く', () => { best.carrier = 'player'; best.fixed = false; }, { r: 2.8 }]);
  }
  return want;
}
// 自前で E の札を出していない戦のための、まとめの呼び出し（毎フレーム一回）
export function tabaInteractTick(rt, opts) {
  const F = rt.flags;
  const want = wantEntries(rt, opts);
  const key = want.map((w) => w[0] + w[2]).join('|');
  if (key === F.tabaActKey) return;
  F.tabaActKey = key;
  for (const id of F.tabaActIds || []) rt.uninteract(id);
  F.tabaActIds = want.map((w) => w[0]);
  for (const [id, pos, label, fn, o] of want) rt.addInteract(id, pos, label, fn, o);
}

// ======================================================================
// 竹束の寄せ（kaito 10/1「攻城戦は、もっとみんながゆっくり竹束を持って近づいていく感じに」）
// 攻め手の組が、竹束を前に押し立てて、寄せ場（yose）の手前 near m からは歩く速さの半分ほど（speed）で進み、
// 着いたら竹束を据えて、その陰でしばらく（hold 秒）鉄砲・弓で撃ち合ってから、戦の下知どおりに進む。
// 竹束は本物の兵 2〜3 人に一つ（兵は増やさない）。castle_plan の plan.taba で置いた竹束は、組の前へ並べ直す。
// 使い方：setup で組を作った後に
//   F.TA = makeTabaAdvance(rt, { items: [{ g: F.oteSpear, yose: { x: 0, z: -70 } }, ...], avoid: [spawn] });
//   update で毎コマ F.TA.tick(dt)（tickTabas の前）
// g は butai.js の部隊でも、ふつうの組（Group）でもよい。until() が true になれば（門が破れた等）待たずに進む。
// ======================================================================
const grpOf = (b) => (b && b.real !== undefined ? b.real : b && b.units ? b : null);
const yoseOf = (it) => (typeof it.yose === 'function' ? it.yose() : it.yose);
const RANGED = (g) => { let r = 0, n = 0; for (const u of g.units) if (u.alive) { n++; if (u.type === 'gun' || u.type === 'bow') r++; } return n && r / n > 0.5; };

export function makeTabaAdvance(rt, o = {}) {
  const team = o.team ?? 0, SPD = o.speed ?? 1.2, NEAR = o.near ?? 45, PER = o.perTaba ?? 2.5, MAX = o.max ?? 5;
  const F = rt.flags;
  const avoid = (o.avoid || []).filter(Boolean);
  const pool = (F.tabas || []).filter((tb) => tb.team === team && !tb.carrier && !tb.van);
  const items = (o.items || []).filter((it) => it && it.g).map((it) => ({ ...it, st: 'ready', tabas: [], t0: 0, t1: 0 }));
  for (const it of items) {
    const g = grpOf(it.g);
    const k = Math.max(1, Math.min(MAX, Math.round((g && g.count ? g.count : 10) / PER)));
    for (let i = 0; i < k; i++) {
      const tb = pool.shift() || addTaba(rt, 0, 0, team);
      tb.fixed = true; tb.van = it; it.tabas.push(tb);
    }
  }
  // 余った置きっぱなしの竹束は、組の前の竹束へ足す（一つの組に 7 つまで）。それでも余れば片付ける
  for (let i = 0; pool.length && i < items.length * 3; i++) {
    const it = items[i % items.length];
    if (it.tabas.length >= 7) continue;
    const tb = pool.shift(); tb.fixed = true; tb.van = it; it.tabas.push(tb);
  }
  for (const tb of pool) { rt.scene.remove(tb.m); F.tabas.splice(F.tabas.indexOf(tb), 1); }
  for (const it of items) it.tabas.forEach((tb, i) => { tb.off = (i - (it.tabas.length - 1) / 2) * 1.9; });

  // 組の前（進む向き）に竹束を並べる。snap なら一度に、そうでなければ少しずつ寄せる
  function front(it, dt, snap) {
    const b = it.g, g = grpOf(b);
    let c, f;
    if (g && g.count) { c = g.center(); f = g.facing; } else { c = b.pos || (g && g.anchor); f = b.facing || 0; }
    if (!c) return;
    const Y = yoseOf(it);
    if (it.st === 'ready' && Y && Math.hypot(Y.x - c.x, Y.z - c.z) > 3) f = Math.atan2(Y.x - c.x, Y.z - c.z);
    // 狭い参道では、応戦する兵の向きと矢除けを寄せる向きを分ける。
    if (Number.isFinite(it.facing)) f = it.facing;
    const fx = Math.sin(f), fz = Math.cos(f), px = Math.cos(f), pz = -Math.sin(f);
    let lead = 0;
    if (g && g.count) for (const u of g.units) if (u.alive) lead = Math.max(lead, (u.pos.x - c.x) * fx + (u.pos.z - c.z) * fz);
    lead = Math.min(lead, 8) + 1.2;
    const k = snap ? 1 : Math.min(1, dt * 2);
    for (const tb of it.tabas) {
      let tx = c.x + fx * lead + px * tb.off, tz = c.z + fz * lead + pz * tb.off;
      // 自分の出だしなど、空けておく所には置かない（横へずらす）
      for (const a of avoid) { const d = Math.hypot(tx - a.x, tz - a.z); if (d < 3) { const s = tb.off >= 0 ? 1 : -1; tx += px * s * (3 - d + 0.5); tz += pz * s * (3 - d + 0.5); } }
      tb.x += (tx - tb.x) * k; tb.z += (tz - tb.z) * k; tb.rot = f;
      placeTaba(rt, tb);
    }
  }
  function plant(it) { for (const tb of it.tabas) { tb.van = null; tb.fixed = true; } }
  const moving = (g) => g && (g.order === 'move' || g.order === 'path' || g.order === 'attack' || g.order === 'assault' || g.order === 'charge');
  // until は旗（真偽）を返す関数のほかに、時の〆切（数＝rt.t がそれを過ぎたら終い）でも渡せる。
  // 関数のつもりで数を渡すと it.until() が「関数でない」で例外になり、tick() ごと止まって箕作が固まっていた（10/1）。
  const untilDone = (it) => { const u = it.until; if (!u) return false; return typeof u === 'function' ? !!u() : rt.t >= u; };
  for (const it of items) front(it, 0, true);

  return {
    items,
    tick(dt) {
      for (const it of items) {
        if (it.st === 'free') continue;
        const b = it.g, g = grpOf(b);
        const gone = (!g || !g.count) && (!b.aliveNominal || b.aliveNominal() <= 0);
        if (gone) { if (it.st === 'cover' && g) unpinGroup(g); plant(it); it.st = 'free'; continue; }
        if (it.st === 'ready') {
          // 〆切が来たのに組の下知が動かないまま（hold 等）だと、ここで待ち続けて次の段へ進めなくなる→終いにする
          if (untilDone(it)) { plant(it); it.st = 'free'; continue; }
          if (moving(g)) { it.st = 'push'; it.t0 = rt.t; it.spd0 = g.speed; }
          front(it, dt, false);
          continue;
        }
        if (it.st === 'push') {
          const Y = yoseOf(it);
          if (!Y || untilDone(it)) { if (g) g.speed = it.spd0; plant(it); it.st = 'free'; continue; }
          // 寄せ場の手前で止められた（hold）ら、また動き出すまで竹束を前に構えて待つ
          if (g && !moving(g)) { g.speed = it.spd0; it.st = 'ready'; front(it, dt, false); continue; }
          const c = g && g.count ? g.center() : b.pos;
          const d = Math.hypot(Y.x - c.x, Y.z - c.z);
          // 自分が組より 15m 以上先に出ていたら、置き去りにしないよう少しだけ足を早める（それでも歩くよりは遅い）
          const pu = rt.player && rt.player.u;
          const ahead = pu && pu.alive && Math.hypot(Y.x - pu.pos.x, Y.z - pu.pos.z) < d - 15;
          if (g) g.speed = d < NEAR ? (ahead ? Math.max(SPD, it.spd0 * 0.75) : SPD) : it.spd0;
          front(it, dt, false);
          if (d < (it.r ?? 8) || rt.t - it.t0 > (o.maxPush ?? 160)) {
            if (g) g.speed = it.spd0;
            plant(it);
            if (g && g.count) {
              const walk = (g.order === 'move' || g.order === 'path') && g.anchor;
              pinGroup(g, walk ? { x: g.anchor.x, z: g.anchor.z } : c, g.facing, { by: it, aggro: 8 });
              it.st = 'cover'; it.t1 = rt.t;
              it.holdT = it.hold ?? (RANGED(g) ? (o.holdRanged ?? 30) : (o.holdMelee ?? 14));
            } else it.st = 'free';
          }
          continue;
        }
        if (it.st === 'cover') {
          if (g && g._pinH && g._pinH.by === it) keepPinned(g);
          if (rt.t - it.t1 > it.holdT || untilDone(it)) { if (g) unpinGroup(g); it.st = 'free'; }
        }
      }
    },
    // 確かめ用：いま押している・陰にいる組の数と、竹束の数
    stat() { const n = (s) => items.filter((it) => it.st === s).length; return { ready: n('ready'), push: n('push'), cover: n('cover'), free: n('free'), tabas: (F.tabas || []).length }; },
  };
}

// 寄せの合図：「竹束を前へ」。大将の声と呼び出し札
export function announceAdvance(rt, speaker, line = '者ども、竹束を前へ！　押し立てて寄せよ！') {
  rt.banner('竹束を前へ', '押して、寄せ場まで');
  if (speaker) rt.say(speaker, line, 3);
}
