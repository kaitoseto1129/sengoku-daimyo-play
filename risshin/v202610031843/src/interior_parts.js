// 城・寺・屋敷の室内部品。部品の関数を差し替えれば、買った素材でも同じ配置と当たりを使える。
// 形・材質・絵は使い回す。設営時に材質ごとにまとめ、光は絵に焼く（灯りの影や毎コマの生成なし）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solidRect } from './props.js';
import { addDeck, addRamp } from './floors.js';
import { cgtOn, cgtHas, cgtKitGroup, KitBatch } from './cgt.js';   // 買った素材（床・畳・柱）。読めていれば差し替える

const shapes = new Map(), materials = new Map(), rooms = new Map(), panels = new Map(), templeDecor = new Map();
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
  const m = new THREE.Mesh(shape(w, h, d), mat(color, kind)); m.position.set(x, y, z); g.add(m); return m;
}
// 一枚の幅は0.9m。足もとを原点とする。襖の破壊や当たりは呼び出し側が受け持つ。
export function fusuma(w = .9, h = 1.8) {
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
  const g = new THREE.Group(); box(g, w - .04, h - .04, .025, 0, h / 2, 0, 0xffffff, 'shoji'); frame(g, w, h, 0x795b3b); return g;
}
export function tatami(w = .9, d = 1.8) {
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
  box(g, .55, 1.25, .025, 0, 1.4, -.37, 0xffffff, 'fusuma');
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
  const g = new THREE.Group(); box(g, .32, .05, .32, 0, .025, 0, 0x39291d);
  box(g, .05, .75, .05, 0, .4, 0, 0x604329); box(g, .18, .08, .18, 0, .8, 0, 0xcbb37a);
  box(g, .055, .13, .055, 0, .9, 0, 0xffd08b); return g;
}
export function suwari(color = 0x354349) {
  const g = new THREE.Group(); box(g, .7, .18, .55, 0, .12, 0, color); box(g, .42, .55, .26, 0, .44, -.08, color);
  box(g, .2, .22, .2, 0, .84, -.08, 0xd5b990); box(g, .22, .07, .22, 0, .96, -.09, 0x24201b); return g;
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
  if (!panels.has(kind)) panels.set(kind, batchInterior(kind === 'fusuma' ? fusuma() : shoji()));
  return panels.get(kind).children.map((m) => new THREE.InstancedMesh(m.geometry, m.material, Math.max(1, count)));
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
  if (!templeDecor.has(H.id)) {
    const g = new THREE.Group(), cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2;
    const put = (part, x, z, rot = 0, yy = .08) => place(g, part, x - cx, z - cz, rot, yy);
    const KT = cgtOn() && cgtHas('Floor_Tatami'), kbT = KT ? new KitBatch() : null;
    for (const [a, b, c, d, kind] of H.floors) if (kind === 'tatami' && KT) {
      const nx = Math.max(1, Math.round((c - a) / 2)), nz = Math.max(1, Math.round((d - b) / 2)), cw = (c - a) / nx, cd = (d - b) / nz;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) kbT.add((i + j) % 2 ? 'Floor_Tatami_X' : 'Floor_Tatami', a - cx + i * cw, 0.04, d - cz - j * cd, 0, cw / 2, 0.12, cd / 2);
    } else if (kind === 'tatami') {
      for (let zz = b; zz < d - .02; zz += 1.8) for (let xx = a; xx < c - .02; xx += .9) {
        const w = Math.min(.9, c - xx), depth = Math.min(1.8, d - zz);
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
    templeDecor.set(H.id, batchInterior(g));
  }
  const g = templeDecor.get(H.id).clone(); g.position.set((H.x0 + H.x1) / 2, y, (H.z0 + H.z1) / 2); rt.scene.add(g); return g;
}

// 屋敷と評定の間。局所+zが入口。通れる幅2.4mの戸口と、廊下から室内へ抜ける口を空ける。
export function buildRoom(rt, x, z, { w = 7.2, d = 9, rot = 0, night = false, council = false, collision = true } = {}) {
  const KR = cgtOn() && cgtHas('Floor_Tatami');
  const key = `${w}:${d}:${night}:${council}:${KR ? 1 : 0}`;
  if (!rooms.has(key)) {
    const g = new THREE.Group(), roof = new THREE.Group(), hw = w / 2, hd = d / 2;
    const blocks = [];
    const wall = (ww, dd, xx, zz, kind = '') => {
      box(g, ww, 2.7, dd, xx, 1.35, zz, kind ? 0xffffff : 0xb4a68b, kind);
      blocks.push([xx, zz, ww, dd]);
    };
    box(g, w, .08, d, 0, -.04, 0, 0x6e5238);
    // 1.8m四方ごとに二畳を向きを変えて敷き、畳の四隅が一直線に並ばないようにする。
    const kbR = KR ? new KitBatch() : null;
    for (let iz = 0; iz < Math.floor((d - 1.8) / 1.8); iz++) for (let ix = 0; ix < Math.floor(w / 1.8); ix++) {
      const xx = -hw + .9 + ix * 1.8, zz = -hd + .9 + iz * 1.8, turn = (ix + iz) % 2;
      if (kbR) { kbR.add(turn ? 'Floor_Tatami_X' : 'Floor_Tatami', xx - .9, 0.05, zz + .9, 0, .9, .9, .9); continue; }
      for (const side of [-1, 1]) place(g, tatami(), xx + (turn ? 0 : side * .45), zz + (turn ? side * .45 : 0), turn ? Math.PI / 2 : 0);
    }
    if (kbR && kbR.n) g.add(kbR.build({ basic: true, tint: 0.85, shadow: false, camBlock: false }));
    wall(w, .12, 0, -hd);
    for (const xx of [-hw, hw]) {
      for (let zz = -hd + .45; zz < hd; zz += .9) place(g, shoji(.9, 2.7), xx, zz, Math.PI / 2);
      blocks.push([xx, 0, .08, d]);
    }
    for (const s of [-1, 1]) wall((w - 2.4) / 2, .12, s * (hw / 2 + .6), hd);
    for (const xx of [-hw, hw]) for (const zz of [-hd, hd]) { place(g, hashira(), xx, zz); blocks.push([xx, zz, .16, .16]); }
    const divider = hd - 1.8;
    for (let xx = -hw + .45; xx < hw; xx += .9) if (Math.abs(xx) > 1.2) {
      place(g, fusuma(), xx, divider); blocks.push([xx, divider, .9, .08]);
    }
    const alcove = place(g, tokonoma(), hw - 1.5, -hd + .5); blocks.push([alcove.position.x, alcove.position.z, 2.7, .85]);
    place(g, byobu(), -hw + 1.5, -hd + 1);
    place(g, tsukue(), -hw + 1.4, -hd + 2.4); blocks.push([-hw + 1.4, -hd + 2.4, 1.2, .7]);
    if (council) {
      box(g, w - 3, .16, 2.1, 0, .08, -hd + 1.6, 0xada677, 'tatami');
      place(g, suwari(0x653b30), 0, -hd + 1.6, 0, .16);
      place(g, suwari(), 0, hd - 3.2, Math.PI);
      for (const xx of [-hw + 1, hw - 1]) for (const zz of [-.8, 1]) place(g, suwari(0x4a5147), xx, zz, xx < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    if (night) for (const xx of [-hw + .6, hw - .6]) {
      place(g, tomyo(), xx, -hd + 3); place(g, lightPool(), xx, -hd + 3, 0, .075);
    }
    for (const s of [-1, 1]) { const r = box(roof, w / 2 + .3, .12, d + .8, s * w / 4, 3.2, 0, 0x554436); r.rotation.z = -s * .22; }
    const mesh = batchInterior(g);
    if (night) shadeNight(mesh);
    rooms.set(key, { mesh, roof: batchInterior(roof), blocks });
  }
  const template = rooms.get(key), root = template.mesh.clone(), roof = template.roof.clone();
  const y = rt.world.heightAt(x, z) + .1, c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  // カメラも壁を通り抜けない。材質ごとの少数の形だけを調べる。
  root.traverse((m) => { if (m.isMesh && !m.material.transparent) m.userData.camBlock = true; });
  root.position.set(x, y, z); root.rotation.y = rot; roof.position.copy(root.position); roof.rotation.y = rot;
  rt.scene.add(root, roof);
  if (collision) {
    for (const [xx, zz, ww, dd] of template.blocks) { const p = P(xx, zz); solidRect(p.x, p.z, ww, dd, rot); }
    addDeck({ cx: x, cz: z, x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2, rot, y: y + .065, name: '屋敷の中', roof: y + 2.7 });
    const a = P(0, d / 2 + 1.2), b = P(0, d / 2 - .1);
    addRamp({ ax: a.x, az: a.z, bx: b.x, bz: b.z, w: 2.4, ya: rt.world.heightAt(a.x, a.z), yb: y + .065, inner: true });
  }
  return { root, roof, x, z, w, d, c, s, y: y + .065, P };
}
export function roomTick(room, pos) {
  if (!room || !pos) return;
  const dx = pos.x - room.x, dz = pos.z - room.z;
  room.roof.visible = Math.abs(dx * room.c - dz * room.s) > room.w / 2 + .8 || Math.abs(dx * room.s + dz * room.c) > room.d / 2 + .8;
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
