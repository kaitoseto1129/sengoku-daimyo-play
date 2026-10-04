// 城・寺・屋敷の室内部品。部品の関数を差し替えれば、買った素材でも同じ配置と当たりを使える。
// 形・材質・絵は使い回す。設営時に材質ごとにまとめ、光は絵に焼く（灯りの影や毎コマの生成なし）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solidRect } from './props.js';
import { addInterior, nakaRoomAt } from './naka.js';
import { interiorLayout } from './interior_layouts.js';
import { addNaibu } from './naibu_kit.js';
import { cgtOn, cgtHas, cgtKitGroup, cgtBox, cgtParts, cgtSpend, KitBatch } from './cgt.js';   // 買った素材（床・畳・柱）。読めていれば差し替える

const cacheUsers = [];
const shapes = new Map(), materials = new Map(), rooms = new Map(), panels = new Map(), templeDecor = new Map(), layoutDecor = new Map();
function shape(w, h, d) {
  const key = `${w}:${h}:${d}`;
  if (!shapes.has(key)) shapes.set(key, new THREE.BoxGeometry(w, h, d));
  return shapes.get(key);
}
function picture(kind) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = kind === 'tatami' ? '#aaa477' : kind === 'shoji' ? '#eae6d6' : '#d9cba7';
  g.fillRect(0, 0, 128, 128);
  if (kind === 'tatami') {
    g.strokeStyle = '#929064'; g.lineWidth = 1;
    for (let y = 2; y < 128; y += 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
    const light = g.createLinearGradient(0, 0, 128, 128); light.addColorStop(0, 'rgba(255,248,212,.24)'); light.addColorStop(1, 'rgba(40,32,20,.1)');
    g.fillStyle = light; g.fillRect(0, 0, 128, 128);
  } else if (kind === 'shoji') {
    const light = g.createRadialGradient(64, 48, 8, 64, 48, 95);
    light.addColorStop(0, '#fff9e6'); light.addColorStop(1, '#c9c6b8');
    g.fillStyle = light; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#806248';
    for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 2, 128);
    for (let y = 0; y < 128; y += 24) g.fillRect(0, y, 128, 2);
  } else {
    g.fillStyle = '#a6ad98'; g.beginPath(); g.moveTo(0, 105); g.lineTo(36, 73); g.lineTo(58, 93); g.lineTo(97, 58); g.lineTo(128, 94); g.lineTo(128, 128); g.lineTo(0, 128); g.fill();
    g.strokeStyle = '#645d43'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 109); g.lineTo(37, 48); g.stroke();
    g.fillStyle = '#727b56'; for (const [x, y] of [[29, 48], [44, 57], [22, 65]]) { g.beginPath(); g.ellipse(x, y, 20, 5, -.1, 0, 7); g.fill(); }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function mat(color, kind = '') {
  const key = `${color}:${kind}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshBasicMaterial({ color, map: kind ? picture(kind) : null }));
  return materials.get(key);
}
function box(g, w, h, d, x, y, z, color, kind = '') {
  const m = new THREE.Mesh(shape(w, h, d), mat(color, kind)); cacheUsers.push(new WeakRef(m)); m.position.set(x, y, z); g.add(m); return m;
}
// 購入した和の部品を実寸の箱へ収める。中央の足もと原点を保ち、当たりと絵を合わせる。
function bought(name, w, h, d) {
  if (!cgtOn()) return null;
  const b = cgtBox(name);
  if (!b || b.h.some(v => !Number.isFinite(v) || v < .00001)) return null;
  const faces = cgtParts(name).reduce((n, p) => n + (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3, 0);
  if (!cgtSpend(faces)) return null;
  const sx = w / (b.h[0] * 2), sy = h / (b.h[1] * 2), sz = d / (b.h[2] * 2);
  const part = cgtKitGroup(name, sx, sy, sz);
  if (!part) return null;
  const g = new THREE.Group();
  part.position.set(-b.c[0] * sx, -(b.c[1] - b.h[1]) * sy, -b.c[2] * sz);
  g.add(part); return g;
}
// 一枚の幅は0.9m。足もとを原点とする。襖の破壊や当たりは呼び出し側が受け持つ。
export function fusuma(w = .9, h = 1.8) {
  const kit = bought('slide_door_a', w, h, .06); if (kit) return kit;
  const g = new THREE.Group();
  box(g, w - .06, h - .06, .035, 0, h / 2, 0, 0xffffff, 'fusuma');
  frame(g, w, h, 0x32271c);
  box(g, .06, .08, .055, w / 2 - .13, .85, 0, 0x66553a); return g;
}
function frame(g, w, h, color) {
  for (const y of [.02, h - .02]) box(g, w, .04, .06, 0, y, 0, color);
  for (const x of [-w / 2 + .02, w / 2 - .02]) box(g, .04, h, .06, x, h / 2, 0, color);
}
export function shoji(w = .9, h = 1.8) {
  const kit = bought('slide_door_c', w, h, .06); if (kit) return kit;
  const g = new THREE.Group(); box(g, w - .04, h - .04, .025, 0, h / 2, 0, 0xffffff, 'shoji'); frame(g, w, h, 0x795b3b); return g;
}
export function tatami(w = .9, d = 1.8) {
  const kit = bought('tatami_floor_modular_a', w, .06, d); if (kit) return kit;
  const g = new THREE.Group(); box(g, w, .06, d, 0, .03, 0, 0xffffff, 'tatami');
  for (const x of [-w / 2 + .025, w / 2 - .025]) box(g, .05, .065, d, x, .033, 0, 0x373c2a); return g;
}
export function hashira(h = 2.8) {
  if (cgtOn() && cgtHas('Post_Interior')) { const k = cgtKitGroup('Post_Interior', 0.5, h / 2, 0.5, 0.7); if (k) { const w = new THREE.Group(); w.add(k); return w; } }
  const g = new THREE.Group(); box(g, .16, h, .16, 0, h / 2, 0, 0x614832); return g;
}
export function tokonoma(w = 2.7) {
  const g = new THREE.Group(); box(g, w, .18, .85, 0, .09, 0, 0x604831);
  box(g, w, 2.5, .08, 0, 1.25, -.43, 0xcfc3a2);
  const scroll = bought('wall_scroll', .55, 1.25, .035);
  if (scroll) place(g, scroll, 0, -.37, 0, .775);
  else box(g, .55, 1.25, .025, 0, 1.4, -.37, 0xffffff, 'fusuma');
  for (const x of [-w / 2, w / 2]) { const p = hashira(2.5); p.position.x = x; g.add(p); } return g;
}
export function byobu(n = 4) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const p = fusuma(.65, 1.5); p.position.set((i - (n - 1) / 2) * .61, 0, (i % 2) * .16); p.rotation.y = i % 2 ? -.2 : .2; g.add(p); } return g;
}
export function tsukue() {
  const g = new THREE.Group(); box(g, 1.2, .08, .7, 0, .42, 0, 0x493022);
  for (const x of [-.48, .48]) for (const z of [-.24, .24]) box(g, .07, .4, .07, x, .2, z, 0x493022); return g;
}
export function tomyo() {
  const kit = bought('japanese_lamp_emissive', .32, .95, .32); if (kit) return kit;
  const g = new THREE.Group(); box(g, .32, .05, .32, 0, .025, 0, 0x39291d);
  box(g, .05, .75, .05, 0, .4, 0, 0x604329); box(g, .18, .08, .18, 0, .8, 0, 0xcbb37a);
  box(g, .055, .13, .055, 0, .9, 0, 0xffd08b); return g;
}
export function suwari(color = 0x354349, role = 'kerai') {
  const g = new THREE.Group(); box(g, .7, .18, .55, 0, .12, 0, color); box(g, .42, .55, .26, 0, .44, -.08, color);
  box(g, .2, .22, .2, 0, .84, -.08, 0xd5b990); box(g, .22, .07, .22, 0, .96, -.09, 0x24201b);
  if (role === 'lord') { box(g, .16, .3, .16, 0, 1.12, -.09, 0x24201b); box(g, .36, .035, .12, .1, .36, .24, 0xd5c597); }
  if (role === 'elder') box(g, .2, .08, .08, 0, .72, .02, 0xa8a39b);
  return g;
}
// 設営時だけ形をまとめる。購入部品に替えても部品の名前と足もとの原点は変えない。
export function batchInterior(root) {
  root.updateMatrixWorld(true);
  const groups = new Map(), out = new THREE.Group();
  root.traverse((m) => {
    if (!m.isMesh) return;
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    if (!groups.has(m.material)) groups.set(m.material, []);
    groups.get(m.material).push(geo);
  });
  for (const [material, list] of groups) {
    const geo = mergeGeometries(list); list.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geo, material); out.add(mesh);
  }
  return out;
}
// 寺の破れる襖にも同じ部品を使う。部品内の材質ごとに一つの群れにして描く。
export function panelInstances(kind, count) {
  const key = kind + ':' + (cgtOn() && cgtHas('slide_door_a'));
  if (!panels.has(key)) panels.set(key, batchInterior(kind === 'fusuma' ? fusuma() : shoji()));
  return panels.get(key).children.map((m) => { const copy = new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, count)); cacheUsers.push(new WeakRef(copy)); return copy; });
}
function place(g, part, x, z, rot = 0, y = 0) { part.position.set(x, y, z); part.rotation.y = rot; g.add(part); return part; }

let glowShape, glowMat;
function lightPool() {
  if (!glowMat) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), light = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    light.addColorStop(0, 'rgba(255,190,83,.5)'); light.addColorStop(1, 'rgba(255,190,83,0)');
    g.fillStyle = light; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    glowShape = new THREE.PlaneGeometry(3, 3);
    glowMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
  }
  const m = new THREE.Mesh(glowShape, glowMat); m.rotation.x = -Math.PI / 2; return m;
}
function shadeNight(group) {
  for (const m of group.children) {
    if (m.material.transparent || m.material.color.getHex() === 0xffd08b) continue;
    const key = 'night:' + m.material.uuid;
    if (!materials.has(key)) { const v = m.material.clone(); v.color.multiplyScalar(.55); materials.set(key, v); }
    m.material = materials.get(key);
  }
}
// 本能寺の既存の壁・廊下・燃え方に、共通部品の道具と灯明を重ねる。座標は既存の間取りのまま。
export function furnishTemple(rt, H, y) {
  const key = H.id + ':' + (cgtOn() && cgtHas('tatami_floor_modular_a'));
  if (!templeDecor.has(key)) {
    const g = new THREE.Group(), cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2;
    const put = (part, x, z, rot = 0, yy = .08) => place(g, part, x - cx, z - cz, rot, yy);
    const KT = cgtOn() && cgtHas('Floor_Tatami') && !cgtHas('tatami_floor_modular_a'), kbT = KT ? new KitBatch() : null;
    for (const [a, b, c, d, kind] of H.floors) if (kind === 'tatami' && KT) {
      const nx = Math.max(1, Math.round((c - a) / 2)), nz = Math.max(1, Math.round((d - b) / 2)), cw = (c - a) / nx, cd = (d - b) / nz;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) kbT.add((i + j) % 2 ? 'Floor_Tatami_X' : 'Floor_Tatami', a - cx + i * cw, 0.04, d - cz - j * cd, 0, cw / 2, 0.12, cd / 2);
    } else if (kind === 'tatami') {
      for (let zz = b; zz < d - .02; zz += 3.6) for (let xx = a; xx < c - .02; xx += 1.8) {
        const w = Math.min(1.8, c - xx), depth = Math.min(3.6, d - zz);
        put(tatami(w - .02, depth - .02), xx + w / 2, zz + depth / 2, 0, .035);
      }
    }
    if (H.id === 'goten') {
      put(tokonoma(3), -72.5, 91.5, Math.PI / 2); put(byobu(6), -69.7, 94);
      for (const [x, z] of [[-66.2, 93.6], [-51, 84.5]]) { put(tomyo(), x, z); put(lightPool(), x, z, 0, .17); }
    } else if (H.id === 'hondo') {
      for (const z of [43, 49]) { put(tomyo(), -58.6, z, 0, .95); put(lightPool(), -58.6, z, 0, 1.16); }
    } else { put(tomyo(), -34, 67.2); put(lightPool(), -34, 67.2); }
    if (kbT && kbT.n) g.add(kbT.build({ basic: true, tint: 0.8, shadow: false, camBlock: false }));
    templeDecor.set(key, batchInterior(g));
  }
  const g = templeDecor.get(key).clone(); cacheUsers.push(new WeakRef(g)); g.position.set((H.x0 + H.x1) / 2, y, (H.z0 + H.z1) / 2); rt.scene.add(g); return g;
}

// 購入部品を指定した箱に収める。原点や元の寸法に頼らず、当たりと見た目をそろえる。
export function fitInteriorPart(batch, name, x, y, z, w, h, d, rot = 0) {
  if (!batch || !cgtOn()) return false;
  const b = cgtBox(name);
  if (!b || b.h.some(v => !Number.isFinite(v) || v < .00001)) return false;
  const faces = cgtParts(name).reduce((n, p) => n + (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3, 0);
  if (!cgtSpend(faces)) return false;
  const sx = w / (2 * b.h[0]), sy = h / (2 * b.h[1]), sz = d / (2 * b.h[2]);
  const dx = b.c[0] * sx, dz = b.c[2] * sz, c = Math.cos(rot), sn = Math.sin(rot);
  return batch.add(name, x - dx * c - dz * sn, y + h / 2 - b.c[1] * sy, z + dx * sn - dz * c, rot, sx, sy, sz);
}

// 型の道具と床。材質・形を共有し、建物ごとに一度まとめる。
export function furnishLayout(layout, h = 2.7, { partitions = true, dim = false } = {}) {
  const japanese = !!layout.profile && cgtOn() && cgtHas('naibu_tatami_floor_modular_a');
  const purchased = cgtOn() && cgtHas('Floor_Tatami') && !cgtHas('tatami_floor_modular_a');
  const key = JSON.stringify([layout, h, partitions, dim, purchased, japanese, cgtOn() && cgtHas('tatami_floor_modular_a')]);
  if (layoutDecor.has(key)) { const copy = layoutDecor.get(key).clone(); cacheUsers.push(new WeakRef(copy)); return copy; }
  const g = new THREE.Group(), kb = purchased || japanese ? new KitBatch() : null;
  for (const p of layout.props) {
    const part = new THREE.Group();
    const kit = p.part === 'stove' ? bought('furnace_complete', p.w, p.h, p.d) : p.part === 'storage' ? bought('drawer_a', p.w, p.h, p.d) : p.part === 'altar' ? bought('butsudan', p.w, p.h, p.d) : null;
    if (kit) part.add(kit);
    else if (p.part === 'alcove') {
      if (japanese && addNaibu(kb, 'wall_scroll', p.x, (p.y || 0) + .8, p.z - .35, .55, 1.25, .04)) {
        box(part, 2.3, .18, .85, 0, .09, 0, 0x604831);
        box(part, 2.3, 2.5, .08, 0, 1.25, -.43, 0xcfc3a2);
      } else part.add(tokonoma(2.3));
    } else if (p.part === 'chest') {
      const w = p.w ?? .85, h = p.h ?? .7, d = p.d ?? .7;
      if (japanese && addNaibu(kb, 'drawer_a', p.x, p.y || 0, p.z, w, h, d)) continue;
      box(part, w, h, d, 0, h / 2, 0, 0x503923);
      for (const yy of [.23, .48]) box(part, w - .06, .02, .03, 0, yy, d / 2, 0x252321);
    } else if (p.part === 'hearth') {
      if (japanese && addNaibu(kb, 'furnace', p.x, 0, p.z, p.w, .18, p.d)) {
        addNaibu(kb, 'kettle_low', p.x, .18, p.z, .35, .25, .35);
      } else {
        box(part, p.w, .12, p.d, 0, .06, 0, 0x493022);
        box(part, p.w - .18, .025, p.d - .18, 0, .13, 0, 0x211b17);
        box(part, .35, .25, .35, 0, .3, 0, 0x292723);
      }
      place(part, lightPool(), 0, 0, 0, .2);
    } else if (p.part === 'ammo' && layout.profile === 'yagura' && japanese && addNaibu(kb, 'drawer_a', p.x, p.y || 0, p.z, p.w ?? .85, p.h ?? .55, p.d ?? .7)) {
      // 矢の束と弾の箱。棚の上の矢は軽い共通の形。
      for (let q = 0; q < 5; q++) box(part, .018, .02, (p.d ?? .7) - .05, (q - 2) * .07, (p.h ?? .55) + .04, 0, 0x9b8057);
    } // 武具の間の弾薬を米俵に置き換えず、下の箱と矢の束を使う。
    else if (p.part === 'bedding') {
      box(part, p.w, .06, p.d, 0, .03, 0, 0x958669);
      box(part, p.w * .8, .12, .22, 0, .09, -p.d / 2 + .15, 0x6a5e48);
    } else if (p.part === 'offering') {
      box(part, p.w, .08, p.d, 0, p.h - .04, 0, 0x785b3c);
      for (const x of [-.4, .4]) box(part, .07, p.h, .07, x, p.h / 2, 0, 0x59412b);
      box(part, .18, .18, .18, 0, p.h + .09, 0, 0xd8d0bd);
    }
    else if (p.part === 'desk') part.add(tsukue());
    else if (p.part === 'stove') {
      box(part, .85, .65, .7, 0, .325, 0, 0x75634b);
      box(part, .3, .25, .025, 0, .22, .36, 0x221c17);
      box(part, .42, .18, .42, 0, .72, 0, 0x292723);
    } else if (p.part === 'altar') {
      box(part, 2.1, .55, 1, 0, .275, 0, 0x4f3021);
      box(part, .45, .7, .4, 0, .9, 0, 0xa48b4a);
      box(part, .28, .28, .28, 0, 1.39, 0, 0xa48b4a);
      place(part, tomyo(), -.75, 0, 0, .55); place(part, tomyo(), .75, 0, 0, .55);
    } else {
      const w = p.w ?? (p.part === 'counter' ? 1.1 : .85), h = p.h ?? .55, d = p.d ?? .7;
      box(part, w, h, d, 0, h / 2, 0, 0x503923);
      for (const x of [-w * .35, w * .35]) box(part, .035, h, d + .03, x, h / 2, 0, 0x252321);
      if (p.part === 'stones') for (const x of [-.2, .2]) box(part, .22, .18, .25, x, h + .09, 0, 0x777267);
      if (p.part === 'ammo') for (let q = 0; q < 5; q++) box(part, .018, .02, d - .05, (q - 2) * .07, h + .04, 0, 0x9b8057);
    }
    // 小さな部屋でも調度の絵を、設営時に決めた当たりの寸法へ合わせる。
    if (!kit && p.part === 'desk') part.scale.set(p.w / 1.2, p.h / .46, p.d / .7);
    if (!kit && p.part === 'stove') part.scale.set(p.w / .85, p.h / .9, p.d / .7);
    if (p.part === 'alcove') part.scale.set(p.w / 2.3, p.h / 2.5, p.d / .85);
    if (!kit && p.part === 'altar') part.scale.set(p.w / 2.1, p.h / 1.5, p.d / 1);
    place(g, part, p.x, p.z, 0, p.y || 0);
  }
  for (const r of layout.rooms) {
    if (r.floor === 'tatami') {
      const tileW = .9, tileD = 1.8;
      for (let z = r.z0 + .1; z < r.z1 - .1; z += tileD) for (let x = r.x0 + .1; x < r.x1 - .1; x += tileW) {
        const w = Math.min(tileW, r.x1 - .1 - x), d = Math.min(tileD, r.z1 - .1 - z);
        if (w <= .02 || d <= .02) continue;
        const floorY = r.y || 0;
        if (japanese && addNaibu(kb, 'tatami_floor_modular_a', x + w / 2, floorY, z + d / 2, w - .02, .06, d - .02)) continue;
        if (purchased && !layout.profile) kb.add('Floor_Tatami', x, .035, z + d, 0, w / 2, .12, d / 2);
        else place(g, tatami(w - .02, d - .02), x + w / 2, z + d / 2, 0, floorY);
      }
    } else if (r.floor === 'earth') box(g, r.x1 - r.x0, .025, r.z1 - r.z0, (r.x0 + r.x1) / 2, (r.y || 0) + .013, (r.z0 + r.z1) / 2, 0x655847);
  }
  if (partitions) for (const v of layout.walls) {
    if (v.guideOnly) continue;
    const len = Math.hypot(v.bx - v.ax, v.bz - v.az), n = Math.ceil(len / .9);
    for (let i = 0; i < n; i++) {
      const x = v.ax + (v.bx - v.ax) * (i + .5) / n, z = v.az + (v.bz - v.az) * (i + .5) / n;
      const rot = Math.atan2(-(v.bz - v.az), v.bx - v.ax);
      if (v.paper && japanese && addNaibu(kb, 'slide_door_a', x, 0, z, len / n, h, .06, rot)) continue;
      if (v.paper) place(g, fusuma(len / n, h), x, z, rot);
      else {
        const wall = new THREE.Group(); box(wall, len / n, h, .08, 0, h / 2, 0, 0x795b3b);
        place(g, wall, x, z, rot);
      }
    }
  }
  if (['chudo', 'hondo', 'kuri', 'sobo', 'goten'].includes(layout.kind)) {
    const rs = layout.rooms, hw = Math.max(...rs.map(r => r.x1)), hd = Math.max(...rs.map(r => r.z1));
    for (const x of [-hw + .5, hw - .5]) {
      place(g, tomyo(), x, hd - .75); place(g, lightPool(), x, hd - .75, 0, .09);
    }
    for (const z of [-hd * .5, hd * .5]) {
      const beam = bought('beam', hw * 2, .2, .22);
      if (beam) place(g, beam, 0, z, 0, h - .22);
      else box(g, hw * 2, .2, .22, 0, h - .12, z, 0x3a2a1c);
    }
  }
  if (kb && kb.n) g.add(kb.build({ basic: true, tint: .8, shadow: false, camBlock: false }));
  const mesh = batchInterior(g);
  if (dim) shadeNight(mesh);
  layoutDecor.set(key, mesh);
  const copy = mesh.clone(); cacheUsers.push(new WeakRef(copy)); return copy;
}

// 屋敷と評定の間。局所+zが入口。通れる幅2.4mの戸口と、廊下から室内へ抜ける口を空ける。
export function buildRoom(rt, x, z, { w = 7.2, d = 9, rot = 0, night = false, council = false, collision = true, kind = council ? 'goten' : 'yashiki' } = {}) {
  const KR = cgtOn() && (cgtHas('Floor_Tatami') || cgtHas('tatami_floor_modular_a'));
  const key = `${w}:${d}:${night}:${council}:${kind}:${KR ? 1 : 0}`;
  if (!rooms.has(key)) {
    const g = new THREE.Group(), roof = new THREE.Group(), hw = w / 2, hd = d / 2;
    const layout = interiorLayout(kind, w, d, { profile: council ? 'council' : null });
    const wall = (ww, dd, xx, zz, kind = '') => {
      box(g, ww, 2.7, dd, xx, 1.35, zz, kind ? 0xffffff : 0xb4a68b, kind);
    };
    box(g, w, .08, d, 0, -.04, 0, 0x6e5238);
    g.add(furnishLayout(layout));
    wall(w, .12, 0, -hd);
    for (const xx of [-hw, hw]) {
      const n = Math.ceil(d / .9), span = d / n;
      if (kind === 'shrine' || kind === 'nagaya') wall(.12, d, xx, 0);
      else for (let i = 0; i < n; i++) place(g, shoji(span, 2.7), xx, -hd + (i + .5) * span, Math.PI / 2);
    }
    for (const s of [-1, 1]) wall((w - 2.4) / 2, .12, s * (hw / 2 + .6), hd);
    for (const xx of [-hw, hw]) for (const zz of [-hd, hd]) place(g, hashira(2.7), xx, zz);
    if (kind === 'goten') {
      const r = layout.rooms[0];
      box(g, r.x1 - r.x0 - .3, .16, r.z1 - r.z0 - .4, (r.x0 + r.x1) / 2, .08, (r.z0 + r.z1) / 2, 0xada677, 'tatami');
    }
    if (council) {
      const upper = layout.rooms[0], hall = layout.rooms[1];
      place(g, suwari(0x653b30, 'lord'), 0, (upper.z0 + upper.z1) / 2, 0, .16);
      place(g, suwari(), 0, (hall.z0 + hall.z1) / 2 + .8, Math.PI);
      for (const xx of [-hw + 1, hw - 1]) for (const zz of [hall.z0 + .9, hall.z1 - .7]) place(g, suwari(xx < 0 ? 0x4a5147 : 0x494359, zz < 0 ? 'elder' : 'kerai'), xx, zz, xx < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    if (night) for (const xx of [-hw + .6, hw - .6]) {
      place(g, tomyo(), xx, -hd + 3); place(g, lightPool(), xx, -hd + 3, 0, .075);
    }
    for (const s of [-1, 1]) { const r = new THREE.Mesh(shape(w / 2 + .3, .12, d + .8), mat(0x554436)); r.rotation.z = -s * (kind === 'shrine' ? .38 : .22); r.position.set(s * w / 4, 3.2, 0); roof.add(r); }
    const mesh = batchInterior(g);
    if (night) shadeNight(mesh);
    rooms.set(key, { mesh, roof: batchInterior(roof) });
  }
  const template = rooms.get(key), root = template.mesh.clone(), roof = template.roof.clone();
  const y = rt.world.heightAt(x, z) + .1, c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  root.traverse(m => { if (m.isMesh) m.userData.camBlock = false; });
  const cameraWalls = new THREE.Group();
  const wallMat = materials.get('cameraWall') || new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide });
  materials.set('cameraWall', wallMat);
  const cameraWall = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < .01) return;
    const m = new THREE.Mesh(shape(len, 2.7, .14), wallMat);
    m.position.set((ax + bx) / 2, 1.35, (az + bz) / 2);
    m.rotation.y = Math.atan2(-(bz - az), bx - ax); m.userData.camBlock = true;
    cameraWalls.add(m);
  };
  cameraWall(-w / 2, -d / 2, w / 2, -d / 2);
  for (const side of [-1, 1]) cameraWall(side * w / 2, -d / 2, side * w / 2, d / 2);
  cameraWall(-w / 2, d / 2, -1.2, d / 2); cameraWall(1.2, d / 2, w / 2, d / 2);
  for (const v of interiorLayout(kind, w, d).walls) cameraWall(v.ax, v.az, v.bx, v.bz);
  root.add(cameraWalls);
  root.position.set(x, y, z); root.rotation.y = rot; roof.position.copy(root.position); roof.rotation.y = rot;
  root.userData.noMerge = roof.userData.noMerge = true;
  rt.scene.add(root, roof);
  let inside = null;
  if (collision) {
    inside = addInterior(rt.world, { x, z, rot, kind, name: kind === 'nagaya' ? '長屋' : kind === 'shrine' ? '鎮守の社' : kind === 'goten' ? '主殿' : kind === 'temple' ? '寺' : kind === 'inn' ? '宿' : kind === 'toiya' ? '問屋' : kind === 'shisha' ? '使者の間' : kind === 'machiya' ? '町家' : '屋敷', levels: [{ w, d, y: y + .065, h: 2.635 }], door: { w: 2.4, h: 2.635 }, approach: { pad: .1, len: 1.1 } });
    // すでにまとめた見た目を共通の出入り・戦い・音へ渡す。
    inside.mesh = root; inside.built = true;
  }
  return { root, roof, x, z, w, d, c, s, y: y + .065, P, inside, layout: inside ? inside.levels[0].layout : interiorLayout(kind, w, d) };
}
export function roomTick(room, pos) {
  if (!room || !pos) return;
  const current = nakaRoomAt(pos.x, pos.z, pos.y);
  room.roof.visible = !room.inside || current?.I !== room.inside || pos.y > room.y + 2.7;
}
// 出世の絵は一度だけ立体を描き、すぐ描画器を閉じる。戦の兵や毎コマの描画は増やさない。
export function drawCouncil(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false }); renderer.setSize(canvas.width, canvas.height); renderer.setPixelRatio(1);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x30281e);
    const room = buildRoom({ scene, world: { heightAt: () => 0 } }, 0, 0, { w: 10.8, d: 9, council: true, collision: false });
    room.roof.visible = false;
    const camera = new THREE.PerspectiveCamera(56, canvas.width / canvas.height, .1, 40);
    camera.position.set(3, 2.6, 3.9); camera.lookAt(0, .65, -2);
    renderer.render(scene, camera); canvas.getContext('2d').drawImage(renderer.domElement, 0, 0); return true;
  } catch (_) { return false; }
  finally { if (renderer) { renderer.dispose(); renderer.forceContextLoss(); } }
}

// 設営の終わりだけ呼ぶ。使っていない控えを制限し、共有中の形は残す。
const roomScenes = [];
export function trimInteriorCache(scene) {
  if (!roomScenes.some(ref => ref.deref() === scene)) roomScenes.push(new WeakRef(scene));
  const used = new Set(), removed = new Set();
  const collect = (value, out) => {
    if (value?.isBufferGeometry) out.add(value);
    else if (value?.traverse) value.traverse(m => { if (m.geometry) out.add(m.geometry); });
    else if (value?.mesh) { collect(value.mesh, out); collect(value.roof, out); }
  };
  for (let i = roomScenes.length - 1; i >= 0; i--) { const live = roomScenes[i].deref(); if (!live) roomScenes.splice(i, 1); else collect(live, used); }
  for (let i = cacheUsers.length - 1; i >= 0; i--) { const live = cacheUsers[i].deref(); if (!live) cacheUsers.splice(i, 1); else collect(live, used); }
  for (const [cache, limit] of [[shapes, 128], [rooms, 16], [layoutDecor, 16], [templeDecor, 8]]) {
    const idle = [];
    for (const [key, value] of cache) { const geos = new Set(); collect(value, geos); if (![...geos].some(g => used.has(g))) idle.push(key); }
    for (const key of idle.slice(0, Math.max(0, idle.length - limit))) { collect(cache.get(key), removed); cache.delete(key); }
  }
  // 別の控えと共有している形も保護する。材質と絵は共通なので捨てない。
  for (const cache of [shapes, rooms, panels, templeDecor, layoutDecor]) for (const value of cache.values()) collect(value, used);
  for (const geo of removed) if (!used.has(geo)) geo.dispose();
}
