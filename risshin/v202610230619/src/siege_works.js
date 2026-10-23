// 地図の城攻め：掘った仕寄りと、柴・土俵で埋める堀。兵は増やさない。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addTaba, tabaMat } from './taketaba.js';
import { hiraTateGeo } from './props.js';
import { S } from './settings.js';

let SHIELD = null, EARTH = null, BLOCK = null;
const SCREENS = new Map();
// 門破りの組が押す楯：平盾（置盾）を三枚、めどり羽に少しずつ重ねる（props.js の共通の形。表 = -z）
function shieldGeometry() {
  if (SHIELD) return SHIELD;
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = hiraTateGeo(i === 1 ? 'sama' : 'plain', true).clone();
    g.rotateY(Math.PI); g.translate((i - 1) * 0.48, 0, (i % 2) * 0.06);
    parts.push(g);
  }
  SHIELD = mergeGeometries(parts);
  return SHIELD;
}

// 木幔：四輪の丸太台へ柱と吊り腕を立て、縄で厚い板の幕を吊るす。
// 門破りの組の前に付き、置盾と同じ弾よけの仕組みを使う。
function screenGeometry() {
  const high = true;
  if (SCREENS.has(high)) return SCREENS.get(high);
  const parts = [];
  const add = (g, color, x, y, z) => {
    g = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(color), a = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.translate(x, y, z); parts.push(g);
  };
  const box = (w, h, d, x, y, z, color = 0x76654a) => add(new THREE.BoxGeometry(w, h, d), color, x, y, z);
  // 吊り縄の両端を板と腕木へつなぐ。建てる時だけ作り、一枚の形へ結合する。
  const beam = (p, q, r, color) => {
    const d = new THREE.Vector3().subVectors(q, p), g = new THREE.CylinderGeometry(r, r, d.length(), 5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    add(g, color, (p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
  };
  for (const x of [-.66, .66]) {
    if (high) beam(new THREE.Vector3(x, .3, -.275), new THREE.Vector3(x, .3, 1.175), .11, 0x696958);
    else box(.16, .16, 1.45, x, .3, .45);
  }
  for (const z of [0, .98]) {
    if (high) beam(new THREE.Vector3(-.96, .28, z), new THREE.Vector3(.96, .28, z), .09, 0x666451);
    else box(1.85, .14, .14, 0, .28, z);
    for (const x of [-.87, .87]) {
      const g = new THREE.CylinderGeometry(.28, .28, .12, 10); g.rotateZ(Math.PI / 2);
      add(g, 0x8d7d5e, x, .28, z);
      if (high) {
        const face = new THREE.CircleGeometry(.253, 10);
        face.rotateY(Math.sign(x) * Math.PI / 2);
        add(face, 0xaba383, x + Math.sign(x) * .061, .28, z);
        for (const dz of [-.12, .1]) box(.004, .35, .008,
          x + Math.sign(x) * .064, .28, z + dz, 0x746e55);
        const hub = new THREE.CylinderGeometry(.065, .065, .18, 6);
        hub.rotateZ(Math.PI / 2); add(hub, 0x69634e, x, .28, z);
      }
    }
  }
  if (high) {
    const pivot = new THREE.Vector3(0, 2.65, .95), tip = new THREE.Vector3(0, 3.25, -.13);
    beam(new THREE.Vector3(0, .3, .95), pivot, .095, 0x625d4c);
    // 枝股の左右で吊り腕を受ける。腕は股の間を通り、横倒れを縄で留める。
    for (const s of [-1, 1]) {
      beam(new THREE.Vector3(0, 2.53, .95), new THREE.Vector3(s * .16, 2.93, .95), .055, 0x625d4c);
      beam(new THREE.Vector3(s * .14, .38, .2), new THREE.Vector3(0, 1.16, .95), .045, 0x73705a);
    }
    beam(new THREE.Vector3(0, 2.4, 1.46), tip, .07, 0x7c765e);
    // 写真の幕は幅のある横板を積み、裏の縦桟でつなぐ。七段の継ぎ目に細い影を残す。
    // 外寸と浮かせた下端は保ち、吊り縄を受ける桟も裏へ置く。
    for (let i = 0; i < 7; i++) box(1.674, 1.98 / 7 - .008, .1, 0, .62 + (i + .5) * 1.98 / 7, -.13,
      i % 3 === 0 ? 0x92917a : 0xa09d80);
    for (const x of [-.65, .65]) box(.075, 1.98, .065, x, 1.61, -.0475, 0x797960);
    box(1.72, .075, .065, 0, 2.54, -.0475, 0x797960);
    for (const x of [-.65, .65]) {
      beam(tip, new THREE.Vector3(x, 2.602, -.13), .014, 0xb3a075);
      // 支柱の控え縄は幕板へ結ばず、写真のように台枠の四隅へ張る。
      for (const z of [0, .98]) {
        beam(pivot, new THREE.Vector3(x, .4, z), .012, 0x9e8d68);
        // 台木の外へ三巻きして留める。縄と台車は一つの共有形へ結合する。
        for (const dz of [-.023, 0, .023]) {
          const tie = new THREE.TorusGeometry(.117, .009, 3, 6);
          add(tie, 0xb3a075, x, .3, z + dz);
        }
      }
    }
    box(.28, .1, .23, 0, 2.67, .95, 0xb3a075);
  } else {
    box(.17, 2.12, .17, 0, 1.3, .95);
    box(.14, .14, 1.4, 0, 2.33, .43);
    for (let i = 0; i < 8; i++) box(.204, 1.63, .08, (i - 3.5) * .21, 1.025, -.13, i % 2 ? 0x9b9068 : 0xa79b71);
    for (const y of [.35, .78, 1.21, 1.64]) box(1.7, .075, .05, 0, y, -.19);
    for (const x of [-.7, .7]) {
      const g = new THREE.CylinderGeometry(.012, .012, .84, 4); g.rotateZ(x > 0 ? -.95 : .95);
      add(g, 0xb3a075, x / 2, 2.07, -.13);
    }
  }
  const geo = mergeGeometries(parts); parts.forEach(g => g.dispose());
  SCREENS.set(high, geo);
  return geo;
}

// 準備済みの仕寄りを地形そのものへ掘る。入口・出口はゆるい坂にする。
export function prepareSiegeWorks(P, spawnZ, yoseZ) {
  const height = P.height;
  const lanes = [-14, 3, 14], z0 = yoseZ + 3, z1 = spawnZ - 8;
  function depth(x, z) {
    if (z <= z0 || z >= z1) return 0;
    let side = 0;
    for (const cx of lanes) side = Math.max(side, Math.max(0, Math.min(1, (4 - Math.abs(x - cx)) / 1.6)));
    return 1.15 * side * Math.min(1, (z - z0) / 5, (z1 - z) / 5);
  }
  P.height = (x, z) => height(x, z) - depth(x, z);
  return { depth, ladder: P.ladders.find((l) => l.from === 0), progress: 0, ready: false, active: false };
}

export function buildSiegeWorks(rt, works, team) {
  const l = works.ladder;
  if (!l) { works.ready = true; return; }
  const W = rt.world;
  works.outer = { x: l.x + l.n.x * 17, z: l.z + l.n.z * 17 };
  works.inner = { x: l.x + l.n.x * 1.8, z: l.z + l.n.z * 1.8 };
  works.y0 = W.heightAt(works.outer.x, works.outer.z);
  works.y1 = W.heightAt(works.inner.x, works.inner.z);
  works.blocks = [];
  if (!BLOCK) BLOCK = new THREE.BoxGeometry(1, 1, 1);
  if (!EARTH) EARTH = new THREE.MeshStandardMaterial({ color: 0x6d583b, roughness: 1 });
  // 埋める幅は三人分だけ。切岸や城壁は埋めない。
  for (let i = 0; i < 12; i++) {
    const t = (i + .5) / 12, x = works.outer.x + (works.inner.x - works.outer.x) * t, z = works.outer.z + (works.inner.z - works.outer.z) * t;
    const top = works.y0 + (works.y1 - works.y0) * t, bottom = W.heightAt(x, z);
    if (top - bottom < .35) continue;
    const m = new THREE.Mesh(BLOCK, EARTH);
    m.position.set(x, bottom, z); m.rotation.y = Math.atan2(l.n.x, l.n.z);
    m.scale.set(3.6, .01, 1.4); m.visible = false;
    rt.scene.add(m); works.blocks.push({ m, bottom, top });
  }
  works.ready = works.blocks.length === 0;
  if (!works.ready) rt.marker('fill', works.outer, '堀を埋める所', { h: 2.5 });
  // 門破りの組が板の楯を押す。形と材質は共用する。
  for (const off of [-1.1, 1.1]) {
    const tb = addTaba(rt, rt.flags.ram.anchor.x + off, rt.flags.ram.anchor.z - 2.8, team, { van: rt.flags.ram, off });
    tb.m.geometry = off < 0 ? shieldGeometry() : screenGeometry(); tb.m.material = tabaMat();
  }
  const damage = rt.army.damage.bind(rt.army);
  rt.army.damage = (t, amount, src, opts) => {
    if (t?.alive && !t.isStruct && t.team === team && src?.pos && src.team !== team && (opts?.kind === 'gun' || opts?.kind === 'arrow')) {
      const d = Math.hypot(src.pos.x - t.pos.x, src.pos.z - t.pos.z);
      if (d > 6) {
        // 仕寄りは上から・横からの射撃まで消さない。
        if (!t.climb && works.depth(t.pos.x, t.pos.z) > .7 && src.pos.y - t.pos.y < 4) amount *= .45;
        else if (src.sama && d < 50) amount *= 1.5;
      }
    }
    return damage(t, amount, src, opts);
  };
}

export function beginSiegeWorks(rt, works) {
  if (works.ready || works.active) return;
  works.active = true;
  const g = rt.flags.ram;
  g.order = 'move'; g.speed = .85; g.dest = works.outer; g.formation = 'column';
  g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = works.outer; };
  rt.obj('fill', '楯で堀埋めの組を守れ。柴と土を入れて道を作れ', 'main');
  rt.say('門破りの頭', '堀へ柴と土俵を入れよ！　楯を前へ。狭間の鉄砲に身をさらすな', 4);
}

export function tickSiegeWorks(rt, works, dt) {
  if (!works.active || works.ready) return;
  let hands = 0;
  for (const u of rt.flags.ram.units) {
    if (u.alive && !u.fleeing && !u.climb && !(u.stagger > 0) && !(u.target?.alive && !u.target.isStruct) && Math.hypot(u.pos.x - works.outer.x, u.pos.z - works.outer.z) < 5) hands++;
  }
  // 生きて働ける人数が減るほど遅れる。時間だけでは完成しない。
  works.progress = Math.min(1, works.progress + dt * Math.min(6, hands) / 216);
  for (const b of works.blocks) {
    const h = (b.top - b.bottom) * works.progress;
    b.m.visible = h > .05; b.m.scale.y = Math.max(.01, h); b.m.position.y = b.bottom + h / 2;
  }
  rt.objProgress('fill', `堀埋め ${Math.round(works.progress * 100)}％・働ける者 ${hands}人`);
  if (works.progress < 1) return;
  works.ready = true;
  // 完成した土の道だけを歩ける地面にする。水深・坂・兵の歩みも同じ高さを見る。
  const W = rt.world, base = W.heightAt.bind(W), a = works.outer, b = works.inner;
  const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
  W.heightAt = (x, z) => {
    const t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
    if (t < 0 || t > 1 || Math.abs((x - a.x) * dz - (z - a.z) * dx) > Math.sqrt(len2) * 1.8) return base(x, z);
    return Math.max(base(x, z), works.y0 + (works.y1 - works.y0) * t);
  };
  rt.objDone('fill'); rt.unmark('fill');
  rt.bark('堀に道が通った。梯子を掛け、門破りの組を進めよ');
}

export function siegeWorkEntries(works, want) {
  if (!works.active || works.ready) return;
  want.push(['fill-work', works.outer, '柴と土を堀に入れる', () => { works.progress = Math.min(1, works.progress + .06); }, { r: 4, hold: 1.5 }]);
}
