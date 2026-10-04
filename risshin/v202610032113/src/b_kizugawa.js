import { rosterPlan } from './jinkei_roster.js';
// ======================================================================
// 織田家編　第二次木津川口の戦い（天正六年十一月六日）
// 石山本願寺へ海から兵糧を運ぶ毛利の水軍に、二年前、織田の水軍は焙烙火矢で焼かれて大敗した。
// 信長は九鬼嘉隆に、鉄の板で覆った大きな安宅船（鉄甲船）を造らせた。天正六年十一月、六艘の大船は木津川口で毛利の船団を迎え、
// 大鉄砲（大筒）で打ち払って退けた。
// 自分は九鬼嘉隆の船の持ち場を守る。包囲→消火→甲板防衛→近距離の大将船へ一斉射→退く船団。
// 大将船への砲撃が史実の芯。消火・乗り込み・荷駄船の個別阻止は遊びの補完。
// 向き：毛利は南西から北東へ。六艘の九鬼船団は河口の沖。東が大坂、北東が本願寺。
// ======================================================================
import * as THREE from 'three';
import { nobori, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { battleEvent, EVENT_VOLLEY, EVENT_FIRE_START, EVENT_UNIT_BREAK, EVENT_RETREAT } from './battle_events.js';
import { volleyAt } from './b_tano.js';
import { addDeck, addLadder } from './floors.js';
import { S } from './settings.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 自船一艘の甲板。実寸約32m×11mを、接近戦と携帯の操作用に広げる。水面は0
const DECK = { x0: -20, x1: 20, z0: -32, z1: 32, y: 2.2 };
const CANNONS = [{ x: -18, z: -16 }, { x: -18, z: 4 }, { x: -18, z: 22 }];   // 西の舷の大筒
const ODA = { flag: 'oda' };
const MORI = { flag: 'mori' };

// 接舷の鉤（鉤縄）：乗り込みの前に、縄が舷に掛かる見た目（軽い・使い回し・数秒で消す）
let HOOK = null;
function grapple(rt, x, z) {
  if (!HOOK) HOOK = { rope: new THREE.CylinderGeometry(0.05, 0.05, 1, 4), hook: new THREE.TorusGeometry(0.22, 0.05, 4, 8), m: new THREE.MeshStandardMaterial({ color: 0x3a2f20, roughness: 0.9 }), i: new THREE.MeshStandardMaterial({ color: 0x4a4440, metalness: 0.5, roughness: 0.5 }) };
  const g = new THREE.Group();
  const h2 = DECK.y + 0.6;
  const rope = new THREE.Mesh(HOOK.rope, HOOK.m); rope.scale.y = h2; rope.position.set(x, h2 / 2, z); g.add(rope);
  const hook = new THREE.Mesh(HOOK.hook, HOOK.i); hook.position.set(x, h2, z); hook.rotation.x = Math.PI / 2; g.add(hook);
  rt.scene.add(g);
  rt.after(9, () => { if (g.parent) rt.scene.remove(g); });
}

function height(x, z) {
  // 海の底
  let h = -3 + 0.4 * Math.sin(x * 0.05) * Math.cos(z * 0.04);
  // 甲板（縁は少しだけ丸める）
  const dx = Math.max(DECK.x0 - x, x - DECK.x1, 0), dz = Math.max(DECK.z0 - z, z - DECK.z1, 0);
  const d = Math.hypot(dx, dz);
  if (d < 1.2) h = DECK.y - d * 0.4;
  // 東の遠くに大坂の浜と、上町台地（石山本願寺の方）。南東に堺の方の低い陸
  h += Math.max(0, (x - 180)) * 0.12 + 20 * gauss(x, z, 300, -60, 16000) + 6 * gauss(x, z, 320, 90, 9000);
  return h;
}

// ---- 船の形（見回り 10/2：前は箱を並べただけで、甲板は芝の四角・矢倉は灰色の箱・小早は茶色の箱だった） ----
// 船体は輪切りの断面を舳先から艫へつないだ「ふくらみのある胴」。鉄甲船は鉄の板（継ぎ目と鋲）を張り、
// 舷の上に狭間（鉄砲を出す穴）の並ぶ楯板（垣立）、外の舷に櫓（漕ぐ櫂）、中央の船に二重の矢倉と望楼。
let SHIPTEX = null;
function shipTex() {
  if (SHIPTEX) return SHIPTEX;
  const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  // 鉄の板：一枚 1m×0.5m ほど。継ぎ目は黒く、鋲は少し明るく、板ごとに錆と色むら
  const plate = mk(256, 128, (g, w, h) => {
    g.fillStyle = '#2a2826'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = c * 64 + (r % 2) * 32, y = r * 32, v = 34 + ((r * 7 + c * 13) % 9) * 3;
      g.fillStyle = `rgb(${v + 4},${v + 1},${v - 2})`; g.fillRect(x + 1, y + 1, 62, 30); g.fillRect(x - 255, y + 1, 62, 30);
      g.fillStyle = 'rgba(110,60,30,0.18)'; g.fillRect(x + 8 + (c * 11) % 30, y + 18, 20, 10);
      g.fillStyle = '#5a5650'; for (let k = 0; k < 6; k++) { g.fillRect(x + 4 + k * 11, y + 3, 2, 2); g.fillRect(x + 4 + k * 11, y + 27, 2, 2); }
    }
  });
  // 楯板（垣立）：鉄の板に、狭間（四角い黒い穴）を一間ごとに。上は白木の笠木
  const tate = mk(256, 64, (g, w, h) => {
    g.fillStyle = '#2c2a27'; g.fillRect(0, 0, w, h);
    for (let c = 0; c < 4; c++) { g.fillStyle = c % 2 ? '#34312d' : '#302d2a'; g.fillRect(c * 64 + 1, 8, 62, 56); }
    g.fillStyle = '#6a5a44'; g.fillRect(0, 0, w, 8);
    g.fillStyle = '#0a0908'; for (let c = 0; c < 4; c++) { g.fillRect(c * 64 + 26, 26, 12, 16); }
    g.fillStyle = '#5a5650'; for (let c = 0; c < 4; c++) for (const y of [12, 58]) for (const x of [6, 56]) g.fillRect(c * 64 + x, y, 2, 2);
  });
  // 板（小早・矢倉の下見板）：横に張った板と継ぎ目
  const board = mk(128, 128, (g, w, h) => {
    g.fillStyle = '#4a3a2a'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) { const v = 62 + (r * 5) % 14; g.fillStyle = `rgb(${v + 12},${v},${v - 14})`; g.fillRect(0, r * 16 + 1, w, 14); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, r * 16 + 15, w, 1); }
  });
  SHIPTEX = { plate, tate, board };
  return SHIPTEX;
}
let SHIPMAT = null;
function shipMats() {
  if (SHIPMAT) return SHIPMAT;
  const T = shipTex();
  SHIPMAT = {
    iron: new THREE.MeshStandardMaterial({ map: T.plate, color: 0xb0aaa2, roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide }),
    tate: new THREE.MeshStandardMaterial({ map: T.tate, color: 0xc0b8ae, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }),
    board: new THREE.MeshStandardMaterial({ map: T.board, roughness: 0.92, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.9 }),
    tile: new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.75, metalness: 0.1 }),
    plaster: new THREE.MeshStandardMaterial({ color: 0xd8d0be, roughness: 0.95 }),
    black: new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.8 }),
    copper: new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.45, metalness: 0.6 }),
  };
  return SHIPMAT;
}
// 櫓は一艘につき一つの描画。柄と水を押す平たい先を同じ形にまとめる。
let RIG = null;
function rigParts() {
  if (RIG) return RIG;
  const shaft = new THREE.BoxGeometry(0.055, 1, 0.055).toNonIndexed();
  const blade = new THREE.BoxGeometry(0.16, 0.28, 0.045).toNonIndexed(); blade.translate(0, -0.42, 0);
  const geo = new THREE.BufferGeometry();
  for (const key of ['position', 'normal', 'uv']) {
    const a = shaft.attributes[key], b = blade.attributes[key];
    const data = new Float32Array(a.array.length + b.array.length); data.set(a.array); data.set(b.array, a.array.length);
    geo.setAttribute(key, new THREE.BufferAttribute(data, a.itemSize));
  }
  shaft.dispose(); blade.dispose();
  const sail = new THREE.PlaneGeometry(1, 1, 8, 5);
  const a = sail.attributes.position;
  for (let i = 0; i < a.count; i++) a.setZ(i, 0.16 * Math.cos(a.getX(i) * Math.PI) * Math.cos(a.getY(i) * Math.PI));
  sail.computeVertexNormals();
  const cloth = new THREE.MeshStandardMaterial({ color: 0xd7c9a8, roughness: 1, side: THREE.DoubleSide });
  // 帆布の縦の継ぎ目。外の素材を読まず小さな絵を共有する。
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#ded2b9'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#b5a88e'; for (let i = 0; i < 64; i += 8) ctx.fillRect(i, 0, 1, 64);
  cloth.map = new THREE.CanvasTexture(c); cloth.map.colorSpace = THREE.SRGBColorSpace;
  RIG = { oar: geo, sail, cloth, box: new THREE.BoxGeometry(1, 1, 1), pole: new THREE.CylinderGeometry(0.06, 0.08, 1, 5), dummy: new THREE.Object3D(),
    foam: new THREE.PlaneGeometry(1, 1), foamMat: new THREE.MeshBasicMaterial({ color: 0xc2d4d0, transparent: true, opacity: 0.26, depthWrite: false }) };
  return RIG;
}
function addOars(g, cx, hw, z0, z1, count, length, left = true, right = true) {
  const R = rigParts(), rows = [];
  for (let sd = -1; sd <= 1; sd += 2) if (sd < 0 ? left : right) for (let i = 0; i < count; i++) rows.push({ sd, z: z0 + (z1 - z0) * i / Math.max(1, count - 1) });
  const mesh = new THREE.InstancedMesh(R.oar, shipMats().wood, rows.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  g.add(mesh); g.userData.rowing = { mesh, rows, cx, hw, length };
  animateRig(g, 0, true);
}
function addSail(g, z, width, height, y, furled = false) {
  const R = rigParts(), M = shipMats();
  const mast = new THREE.Mesh(R.pole, M.dark); mast.scale.y = y + height * 0.6; mast.position.set(0, mast.scale.y / 2, z); g.add(mast);
  const yard = new THREE.Mesh(R.pole, M.wood); yard.scale.y = width + 0.7; yard.rotation.z = Math.PI / 2; yard.position.set(0, y + height / 2, z); g.add(yard);
  const cloth = new THREE.Mesh(furled ? R.box : R.sail, R.cloth);
  cloth.scale.set(width, furled ? 0.28 : height, furled ? 0.28 : width * 0.6);
  cloth.position.set(0, furled ? y + height / 2 - 0.18 : y, z); g.add(cloth);
  g.userData.sail = cloth;
}
function addWake(g, hw, length) {
  const R = rigParts(), wakes = [];
  for (const sd of [-1, 1]) {
    const m = new THREE.Mesh(R.foam, R.foamMat); m.rotation.set(-Math.PI / 2, 0, sd * 0.1);
    m.position.set(sd * (hw + 0.35), 0.13, -length * 0.16); m.scale.set(0.45, length * 0.75, 1); g.add(m); wakes.push(m);
  }
  g.userData.wakes = wakes;
}
function animateRig(g, t, rowing) {
  const r = g.userData.rowing, R = rigParts(), D = R.dummy;
  if (r) {
    for (let i = 0; i < r.rows.length; i++) {
      const o = r.rows[i], beat = rowing ? Math.sin(t * 1.7 + o.z * 0.055) : 0;
      D.position.set(r.cx + o.sd * (r.hw + r.length * 0.28), 0.45, o.z);
      D.rotation.set(beat * 0.2, o.sd * beat * 0.2, o.sd * (1.05 + beat * 0.08)); D.scale.set(r.length * 0.4, r.length, r.length * 0.4); D.updateMatrix(); r.mesh.setMatrixAt(i, D.matrix);
    }
    r.mesh.instanceMatrix.needsUpdate = true;
  }
  if (g.userData.sail) { g.userData.sail.rotation.y = 0.24 + Math.sin(t * 0.8 + g.position.x * 0.02) * 0.08; g.userData.sail.rotation.x = Math.sin(t * 1.1) * 0.025; }
  if (g.userData.wakes) for (const m of g.userData.wakes) m.visible = rowing;
}
function floatShip(g, t, rowing, heavy = false) {
  const phase = t + g.position.x * 0.03 + g.position.z * 0.025;
  g.position.y = (heavy ? 0.08 : 0.16) * Math.sin(phase);
  g.rotation.x = Math.sin(phase * 0.8) * (heavy ? 0.005 : 0.018);
  g.rotation.z = Math.sin(phase * 0.9 + 1) * (heavy ? 0.008 : 0.028);
  animateRig(g, t, rowing);
}

// 胴の形：長さ方向に輪切りを並べてつなぐ。zA＝舳先の尖り、zB＝艫、hw(z)＝その所の半幅、top(z)＝舷の上の高さ
function loftHull(zA, zB, hwAt, topAt, bottomY, n = 18) {
  const pos = [], uv = [], idx = [];
  const ring = [[1, 0], [0.97, 0.45], [0.82, 0.78], [0.55, 1]];   // [半幅の割, 上から下への割]
  const rows = [];
  for (let i = 0; i <= n; i++) {
    const z = zA + (zB - zA) * i / n, hw = hwAt(z), ty = topAt(z);
    const r = [];
    for (const sd of [-1, 1]) for (let k = 0; k < ring.length; k++) {
      const [fw, fy] = ring[k];
      r.push(pos.length / 3); pos.push(sd * hw * fw, ty + (bottomY - ty) * fy, z); uv.push(z / 2, (ty - (ty + (bottomY - ty) * fy)) / 1.0);
    }
    rows.push(r);
  }
  const K = ring.length;
  for (let i = 0; i < n; i++) {
    const a = rows[i], b = rows[i + 1];
    for (let k = 0; k < K - 1; k++) {
      // 左の舷（外向きに巻く）と右の舷
      idx.push(a[k], b[k], a[k + 1], b[k], b[k + 1], a[k + 1]);
      idx.push(a[K + k], a[K + k + 1], b[K + k], b[K + k], a[K + k + 1], b[K + k + 1]);
    }
    // 船底
    idx.push(a[K - 1], b[K - 1], a[2 * K - 1], b[K - 1], b[2 * K - 1], a[2 * K - 1]);
  }
  // 舳先の木口も閉じ、波の間から船体の内側が透けないようにする。
  const front = rows[0];
  for (let k = 0; k < K - 1; k++) idx.push(front[k], front[K + k], front[k + 1], front[K + k], front[K + k + 1], front[k + 1]);
  // 艫の板（平らな戸立て）
  const e = rows[n];
  for (let k = 0; k < K - 1; k++) idx.push(e[k], e[k + 1], e[K + k], e[K + k], e[k + 1], e[K + k + 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// 楯板の一枚（a→b の線に沿って、高さ h）。狭間の絵が 1m ごとに並ぶよう uv を長さに合わせる
function tateWall(ax, az, bx, bz, y0, h, M) {
  const L = Math.hypot(bx - ax, bz - az);
  const g = new THREE.PlaneGeometry(L, h);
  const uvs = g.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setX(i, uvs.getX(i) * L / 4);
  const m = new THREE.Mesh(g, M.tate);
  m.position.set((ax + bx) / 2, y0 + h / 2, (az + bz) / 2);
  m.rotation.y = Math.atan2(bx - ax, bz - az) - Math.PI / 2;
  return m;
}
// 反りのある瓦屋根（四方に葺き下ろす寄棟。軒の反り上がりは四隅を少し持ち上げて見せる）
function hipRoof(w, d, h, M) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.72, h, 4, 1), M.tile);
  body.rotation.y = Math.PI / 4; body.scale.set(w, 1, d); body.position.y = h / 2; g.add(body);
  const eave = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.12, d * 1.02), M.dark); eave.position.y = 0.02; g.add(eave);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.2, (w - d) * 0.5 + 0.3), 0.18, 0.22), M.plaster); ridge.position.y = h + 0.02; g.add(ridge);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), M.dark); c.position.set(sx * w * 0.5, 0.12, sz * d * 0.5); c.rotation.y = sx * sz * Math.PI / 4; c.rotation.z = sx * 0.35; g.add(c); }
  return g;
}

// 鉄甲船の船体。castle：true の船（プレイヤーの乗る中央の船）だけ、矢倉を一段上げて床（floors.js）を張り、
// 梯子で上がれる「小さな城」にする（甲板・上甲板・矢倉・階段）。outL・outR：左右の舷に楯板と櫂を付ける
const YAG_Y = DECK.y + 1.6;   // 矢倉（上甲板）の床の高さ
function hull(W, cx, z0, z1, w, castle, outL = true, outR = true) {
  const M = shipMats();
  const g = new THREE.Group();
  const hw0 = w / 2;
  // 舳先（-z）は 9m かけて細り、舷の上は舳先へ向けて 1.4m 反り上がる。艫は少しだけ細る
  const hwAt = (z) => hw0 * (z < z0 + 9 ? 0.18 + 0.82 * Math.sqrt(Math.max(0, (z - (z0 - 6)) / 15)) : z > z1 - 3 ? 1 - (z - (z1 - 3)) * 0.04 : 1);
  const topAt = (z) => DECK.y + 0.25 + (z < z0 + 8 ? 1.4 * ((z0 + 8 - z) / 14) ** 2 : 0);
  const body = new THREE.Mesh(loftHull(z0 - 6, z1, hwAt, topAt, -2.6, 22), M.iron);
  body.position.x = cx; g.add(body);
  // 舷の上の楯板（狭間の並ぶ鉄張りの垣立）：外の舷と、舳先・艫の端。大筒の所は筒口のぶん空ける
  const TH = 1.25;
  const gaps = (zA, zB) => {
    if (!outL) return [[zA, zB]];
    const out = []; let s = zA;
    for (const c of CANNONS) { if (c.z - 1.1 > s && c.z - 1.1 < zB) { out.push([s, c.z - 1.1]); s = c.z + 1.1; } }
    out.push([s, zB]); return out;
  };
  if (outL) for (const [a, b] of gaps(z0 + 1, z1)) g.add(tateWall(cx - hw0 + 0.05, a, cx - hw0 + 0.05, b, DECK.y, TH, M));
  if (outR) g.add(tateWall(cx + hw0 - 0.05, z1, cx + hw0 - 0.05, z0 + 1, DECK.y, TH, M));
  g.add(tateWall(cx - hw0 + 0.1, z1 - 0.05, cx + hw0 - 0.1, z1 - 0.05, DECK.y, TH, M));
  // 舳先の楯板（尖りに沿って二枚）と、舳先の水押（みよし）の太い木
  g.add(tateWall(cx - hwAt(z0 + 1), z0 + 1, cx, z0 - 5.4, topAt(z0 + 1) - 0.25, TH, M), tateWall(cx, z0 - 5.4, cx + hwAt(z0 + 1), z0 + 1, topAt(z0 + 1) - 0.25, TH, M));
  { const st = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.4, 0.6), M.dark); st.position.set(cx, topAt(z0 - 6) - 1.6, z0 - 6.1); st.rotation.x = 0.35; g.add(st); }
  // 甲板の板（船の床）と継ぎ目
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.3, z1 - z0 - 0.4), new THREE.MeshStandardMaterial({ color: 0x6a5642, roughness: 0.9 }));
  deck.position.set(cx, DECK.y - 0.05, (z0 + z1) / 2); g.add(deck);
  for (let i = 1; i < 10; i++) { const seam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, z1 - z0 - 0.6), M.dark); seam.position.set(cx - w / 2 + (w / 10) * i, DECK.y + 0.11, (z0 + z1) / 2); g.add(seam); }
  // 甲板の水桶と縄の輪（火矢の消し水・綱。舷の内側に寄せて、兵の立つ所をふさがない。B065）
  { const barG = new THREE.CylinderGeometry(0.34, 0.3, 0.7, 10), ropeG = new THREE.TorusGeometry(0.34, 0.09, 6, 12);
    for (let i = 0; i < 4; i++) {
      const sd = i % 2 ? 1 : -1, zz = z0 + 12 + i * ((z1 - z0 - 24) / 3);
      const bar = new THREE.Mesh(barG, M.wood); bar.position.set(cx + sd * (hw0 - 0.9), DECK.y + 0.4, zz); g.add(bar);
      const rope = new THREE.Mesh(ropeG, M.dark); rope.rotation.x = Math.PI / 2; rope.position.set(cx + sd * (hw0 - 0.9), DECK.y + 0.14, zz + 1.1); g.add(rope);
    } }
  addOars(g, cx, hw0, z0 + 6, z1 - 4, 14, 7, outL, outR);
  // 戦う時は帆を巻き上げ、甲板と大筒の射界を空ける。
  addSail(g, z0 + 18, w * 0.48, 7, 9, true);
  if (castle) {
    // 矢倉（一段上がった上甲板。床柱を四隅に立てて持ち上げる＝階下から見上げる形）
    const yagW = w * 0.45, yagL = 7, yz = z1 - 5;
    const postH = YAG_Y - DECK.y;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, postH + 2.6, 0.3), M.dark);
      post.position.set(cx + sx * (yagW / 2 - 0.2), DECK.y + (postH + 2.6) / 2, yz + sz * (yagL / 2 - 0.2)); g.add(post);
    }
    // 床下の囲い（板張り）と床
    for (const sd of [-1, 1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.12, postH, yagL), M.board); sk.position.set(cx + sd * (yagW / 2 - 0.1), DECK.y + postH / 2, yz); g.add(sk); }
    const floor = new THREE.Mesh(new THREE.BoxGeometry(yagW + 0.4, 0.25, yagL + 0.4), M.wood);
    floor.position.set(cx, YAG_Y, yz); g.add(floor);
    // 上甲板の楯板（狭間）：胸の高さで四方を囲い、梯子の口だけ空ける
    g.add(tateWall(cx - yagW / 2, yz + yagL / 2, cx - yagW / 2, yz - yagL / 2, YAG_Y, 1.1, M), tateWall(cx + yagW / 2, yz - yagL / 2, cx + yagW / 2, yz + yagL / 2, YAG_Y, 1.1, M));
    g.add(tateWall(cx - yagW / 2, yz + yagL / 2, cx + yagW / 2, yz + yagL / 2, YAG_Y, 1.1, M));
    g.add(tateWall(cx - yagW / 2, yz - yagL / 2, cx - 0.9, yz - yagL / 2, YAG_Y, 1.1, M), tateWall(cx + 0.9, yz - yagL / 2, cx + yagW / 2, yz - yagL / 2, YAG_Y, 1.1, M));
    // 一重目の屋根（柱の上。四方へ葺き下ろす瓦）
    const r1 = hipRoof(yagW + 1.6, yagL + 1.6, 1.3, M); r1.position.set(cx, YAG_Y + 2.6, yz); g.add(r1);
    // 二重目：望楼（白壁に黒い格子窓、黒い腰板）と、その屋根。九鬼の大船は船の上の城と呼ばれた
    const bw = yagW * 0.62, bd = yagL * 0.5, by = YAG_Y + 3.3;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(bw, 1.7, bd), M.plaster); wall.position.set(cx, by + 0.85, yz); g.add(wall);
    const koshi = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.04, 0.6, bd + 0.04), M.black); koshi.position.set(cx, by + 0.3, yz); g.add(koshi);
    for (const sd of [-1, 1]) {
      for (const q of [-1, 1]) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.05), M.black); win.position.set(cx + q * bw * 0.24, by + 1.15, yz + sd * (bd / 2 + 0.02)); g.add(win); }
      const sw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.9), M.black); sw.position.set(cx + sd * (bw / 2 + 0.02), by + 1.15, yz); g.add(sw);
    }
    const r2 = hipRoof(bw + 1.3, bd + 1.3, 1.1, M); r2.position.set(cx, by + 1.75, yz); g.add(r2);
    // 階段（矢倉の梯子口）：船尾側、矢倉の手前に取り付く
    const stair = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, postH / Math.cos(0.9)), M.wood);
    stair.position.set(cx, DECK.y + postH / 2, yz - yagL / 2 - postH * 0.4); stair.rotation.x = -0.9; g.add(stair);
    addDeck({ x0: cx - yagW / 2, x1: cx + yagW / 2, z0: yz - yagL / 2, z1: yz + yagL / 2, y: YAG_Y, name: '矢倉の床' });
    addLadder({ x: cx, z: yz - yagL / 2 - 0.6, y0: DECK.y, y1: YAG_Y, name: '矢倉の階段' });
  } else {
    // 両脇の船：甲板の艫寄りに、板張りの低い屋形（見た目だけ。床は張らない）
    const yw = w * 0.4, yl = 6, yz = z1 - 6;
    const hut = new THREE.Mesh(new THREE.BoxGeometry(yw, 2.2, yl), M.board); hut.position.set(cx, DECK.y + 1.1, yz); g.add(hut);
    const r = hipRoof(yw + 1.2, yl + 1.2, 1.0, M); r.position.set(cx, DECK.y + 2.2, yz); g.add(r);
  }
  for (const m of g.children) { m.castShadow = true; m.receiveShadow = true; }
  return g;
}
// 遠くの供の大安宅船（形と動きだけ。兵は乗せず、数で見せる＝六艘のうち、五艘を軽く埋める）。舳先は +z
let ATK = null;
function atakeLite(W) {
  const M = shipMats();
  if (!ATK) {
    const L = 26, hw = 5.5; // 舳先を含め長さ32m・幅11m（別本の寸法を採る）
    ATK = {
      body: loftHull(-L / 2, L / 2 + 6, (z) => hw * (z > L / 2 - 4 ? 0.18 + 0.82 * Math.sqrt(Math.max(0, (L / 2 + 6 - z) / 10)) : 1), (z) => 2.6 + (z > L / 2 - 4 ? 1.1 * ((z - (L / 2 - 4)) / 10) ** 2 : 0), -2, 14),
      tateL: L, hw,
      yag: new THREE.BoxGeometry(5.6, 2.4, 8), bow: null,
    };
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ATK.body, M.iron));
  const deck = new THREE.Mesh(rigParts().box, M.wood); deck.scale.set(10.5, 0.18, 24); deck.position.set(0, 2.5, -1); g.add(deck);
  for (const sd of [-1, 1]) g.add(tateWall(sd * (ATK.hw - 0.05), -ATK.tateL / 2, sd * (ATK.hw - 0.05), ATK.tateL / 2 - 3, 2.5, 1.2, M));
  const y1 = new THREE.Mesh(ATK.yag, M.iron); y1.position.set(0, 3.8, -4); g.add(y1);
  const r1 = hipRoof(7, 9.6, 1.4, M); r1.position.set(0, 5.0, -4); g.add(r1);
  const tw = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 3.2), M.plaster); tw.position.set(0, 6.6, -4); g.add(tw);
  const r2 = hipRoof(3.8, 4.2, 1.0, M); r2.position.set(0, 7.4, -4); g.add(r2);
  addOars(g, 0, ATK.hw, -9, 10, 10, 5.5);
  addSail(g, 5, 7, 5, 7.2, true); addWake(g, ATK.hw, 30);
  for (const sd of [-1, 1]) {
    g.add(tateWall(0, 19, sd * ATK.hw, 10, 2.5, 1.2, M));
    const gun = taihou(M); gun.scale.setScalar(0.55); gun.position.set(sd * 5, 3.1, 0); gun.rotation.y = sd > 0 ? Math.PI : 0; g.add(gun);
  }
  for (const m of g.children) m.castShadow = m.material !== RIG?.foamMat;
  return g;
}
// 小早（毛利の小舟）：細い胴、舷に竹の楯（たてかけた板）、櫂。舳先は +z
// 小早の形と材質は一つを使い回す（出すたびに作ると、戦の途中で作り直しが起きて重い）
let KOB = null;
function kobaya() {
  const M = shipMats();
  if (!KOB) {
    KOB = {
      body: loftHull(-5, 5.6, (z) => 1.35 * (z > 2 ? 0.15 + 0.85 * Math.sqrt(Math.max(0, (5.6 - z) / 3.6)) : z < -4 ? 0.8 : 1), (z) => 0.75 + (z > 2.5 ? 0.6 * ((z - 2.5) / 3.1) ** 2 : 0), -0.5, 10),
      shield: new THREE.BoxGeometry(0.08, 0.9, 1.1),
      mast: new THREE.CylinderGeometry(0.04, 0.05, 3.2, 4),
      flag: new THREE.PlaneGeometry(0.6, 1.6),
    };
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(KOB.body, M.board));
  for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(KOB.shield, M.wood); s.position.set(sd * 1.25, 1.15, -3.6 + i * 1.15); s.rotation.z = sd * -0.12; g.add(s); }
  const deck = new THREE.Mesh(rigParts().box, M.wood); deck.scale.set(2.4, 0.12, 8.2); deck.position.set(0, 0.65, -0.6); g.add(deck);
  addOars(g, 0, 1.25, -2.8, 2, 4, 3.2); addWake(g, 1.35, 10);
  const mast = new THREE.Mesh(KOB.mast, M.dark); mast.position.set(0, 2.3, -3.8); g.add(mast);
  const R = rigParts();
  if (!R.flagMat) R.flagMat = new THREE.MeshStandardMaterial({ map: flagTexture('mori'), side: THREE.DoubleSide, roughness: 0.9 });
  const fl = new THREE.Mesh(KOB.flag, R.flagMat); fl.position.set(0.32, 2.9, -3.8); fl.rotation.y = Math.PI / 2; g.add(fl);
  for (const m of g.children) m.castShadow = m.material !== RIG?.foamMat;
  return g;
}
// 関船は小早より長く幅広い。低い屋形、板の垣立と多い櫓で姿を分ける。
let SEK = null;
function sekibune(furled = false) {
  const M = shipMats(), R = rigParts();
  if (!SEK) SEK = loftHull(-10, 12, z => 2.6 * (z > 6 ? 0.08 + 0.92 * Math.sqrt(Math.max(0, (12 - z) / 6)) : z < -8 ? 0.85 : 1), z => 1.45 + Math.max(0, z - 6) * 0.12, -1.1, 14);
  const g = new THREE.Group(); g.add(new THREE.Mesh(SEK, M.board));
  const deck = new THREE.Mesh(R.box, M.wood); deck.scale.set(4.8, 0.16, 17); deck.position.set(0, 1.3, -0.8); g.add(deck);
  for (const sd of [-1, 1]) {
    const wall = new THREE.Mesh(R.box, M.board); wall.scale.set(0.12, 1.1, 17); wall.position.set(sd * 2.45, 1.9, -0.6); g.add(wall);
  }
  const hut = new THREE.Mesh(R.box, M.board); hut.scale.set(3.6, 1.5, 5); hut.position.set(0, 2.15, -5.5); g.add(hut);
  const roof = new THREE.Mesh(R.box, M.dark); roof.scale.set(4.1, 0.18, 5.5); roof.position.set(0, 3, -5.5); g.add(roof);
  addOars(g, 0, 2.5, -7.5, 6, 10, 4.4); addSail(g, 1, 5.6, 5, 5.7, furled); addWake(g, 2.6, 22);
  // 毛利の旗は小早と同じ材質を使う。
  if (!R.flagMat) R.flagMat = new THREE.MeshStandardMaterial({ map: flagTexture('mori'), side: THREE.DoubleSide, roughness: 0.9 });
  if (!R.flagGeo) R.flagGeo = new THREE.PlaneGeometry(0.6, 1.6);
  const flag = new THREE.Mesh(R.flagGeo, R.flagMat); flag.position.set(0.32, 4.3, -7); flag.rotation.y = Math.PI / 2; g.add(flag);
  const pole = new THREE.Mesh(R.pole, M.dark); pole.scale.y = 4.5; pole.position.set(0, 2.5, -7); g.add(pole);
  return g;
}
// 火の壺と煙は三か所分を先に用意し、飛ぶ時と消火後にも使い回す。
function prepareHouroku(rt) {
  const R = rigParts(), D = R.dummy;
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x716b62, transparent: true, opacity: 0.22, depthWrite: false });
  const steamMat = new THREE.MeshBasicMaterial({ color: 0xd5d9d2, transparent: true, opacity: 0.24, depthWrite: false });
  const smokeGeo = new THREE.IcosahedronGeometry(1, 1), potGeo = new THREE.SphereGeometry(0.28, 8, 5);
  const potMat = new THREE.MeshStandardMaterial({ color: 0x8c4d2f, roughness: 1 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb43a }), flameGeo = new THREE.ConeGeometry(0.15, 0.65, 5);
  rt.flags.houroku = [];
  for (let i = 0; i < 3; i++) {
    const pot = new THREE.Group(); pot.add(new THREE.Mesh(potGeo, potMat));
    const flame = new THREE.Mesh(flameGeo, flameMat); flame.position.y = 0.4; pot.add(flame);
    const smoke = new THREE.InstancedMesh(smokeGeo, smokeMat, 6), steam = new THREE.InstancedMesh(smokeGeo, steamMat, 6);
    smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage); steam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    smoke.frustumCulled = steam.frustumCulled = false;
    for (let j = 0; j < 6; j++) { D.position.set(0, -100, 0); D.rotation.set(0, 0, 0); D.scale.setScalar(0); D.updateMatrix(); smoke.setMatrixAt(j, D.matrix); steam.setMatrixAt(j, D.matrix); }
    pot.visible = smoke.visible = steam.visible = false; rt.scene.add(pot, smoke, steam);
    rt.flags.houroku.push({ pot, smoke, steam, start: -1, dousedAt: -1 });
  }
}
function updateHouroku(rt, t) {
  const F = rt.flags, D = rigParts().dummy;
  for (let i = 0; i < F.houroku.length; i++) {
    const h = F.houroku[i]; if (h.start < 0) continue;
    const q = F.fl[i], age = rt.t - h.start, u = Math.min(1, age / 1.2);
    h.pot.visible = u < 1 && !S.reduceMotion;
    h.pot.position.set(q.x - 42 * (1 - u), DECK.y + 0.3 + 12 * Math.sin(Math.PI * u), q.z + 9 * (1 - u));
    h.pot.rotation.z = t * 3;
    const steamAge = h.dousedAt < 0 ? -1 : rt.t - h.dousedAt;
    h.smoke.visible = age >= 1.2 && !q.doused; h.steam.visible = steamAge >= 0 && steamAge < 4;
    for (let j = 0; j < 6; j++) {
      const f = S.reduceMotion ? j / 6 : (t * 0.18 + j / 6) % 1;
      D.rotation.set(0, j, 0); D.position.set(q.x + f * 3.8, DECK.y + 1 + f * 6, q.z + f * 1.5);
      D.scale.setScalar((0.3 + f * 1.5) * Math.sin(Math.PI * f)); D.updateMatrix(); h.smoke.setMatrixAt(j, D.matrix);
      D.position.set(q.x + j * 0.16, DECK.y + 0.3 + (S.reduceMotion ? 0 : Math.max(0, steamAge) * 0.7) + j * 0.15, q.z);
      D.scale.setScalar(Math.max(0, 1 - Math.max(0, steamAge) / 4) * (0.45 + j * 0.1)); D.updateMatrix(); h.steam.setMatrixAt(j, D.matrix);
    }
    h.smoke.instanceMatrix.needsUpdate = h.steam.instanceMatrix.needsUpdate = true;
  }
}

// 大筒：青銅色の筒（尾栓の玉・帯・筒口の張り出し）を、木の台に載せる。筒は -x（西の舷の外）を向く
let GUNG = null;
function taihou(M) {
  if (!GUNG) {
    const prof = [[0, -1.7], [0.22, -1.72], [0.3, -1.6], [0.38, -1.45], [0.4, -1.3], [0.36, -1.2], [0.36, 0.9], [0.33, 1.0], [0.3, 1.1], [0.3, 1.45], [0.36, 1.55], [0.37, 1.68], [0.2, 1.7], [0.16, 1.4], [0.15, -1.0]];
    GUNG = { barrel: new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14), band: new THREE.TorusGeometry(0.385, 0.045, 5, 14), bed: new THREE.BoxGeometry(2.6, 0.5, 1.1), cheek: new THREE.BoxGeometry(1.4, 0.7, 0.18) };
  }
  const g = new THREE.Group();
  const b = new THREE.Mesh(GUNG.barrel, M.copper); b.rotation.z = Math.PI / 2; g.add(b);
  for (const y of [-0.9, 0, 0.8]) { const r = new THREE.Mesh(GUNG.band, M.copper); r.rotation.y = Math.PI / 2; r.position.x = -y; g.add(r); }
  const bed = new THREE.Mesh(GUNG.bed, M.dark); bed.position.set(0.3, -0.7, 0); g.add(bed);
  for (const sd of [-1, 1]) { const c = new THREE.Mesh(GUNG.cheek, M.wood); c.position.set(0.5, -0.3, sd * 0.45); g.add(c); }
  for (const m of g.children) m.castShadow = m.material !== RIG?.foamMat;
  return g;
}

// 信長公記巻十一・多聞院日記・九鬼御伝記。六艘を三艘ずつ二手に分ける。
// 将船は九鬼。弥五助・右馬之丞の担当する船の細かな順、毛利の各手の将は不明。
// 兵数は船数から置いた遊びの目安。南西から来る六百余艘を四手の影で表す。
const JIN = [
  rosterPlan('三艘ずつ二手', 0, { x: 0, z: 0 }, -Math.PI / 4, [
    ['kuki', '大将船', '九鬼嘉隆', 120, 0, 0, 'oda', 'oda', 0, { ships: 1, bind: 'kuki' }],
    ['yagosukeA', '一の手の供船', '弥五助', 120, 38, -42, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.0' }],
    ['yagosukeB', '一の手の供船', '弥五助の配下（名は不明）', 120, 76, -84, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.1' }],
    ['umanojoA', '二の手の将船', '右馬之丞', 120, -40, 56, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.2' }],
    ['umanojoB', '二の手の供船', '右馬之丞の配下（名は不明）', 120, -2, 98, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.3' }],
    ['umanojoC', '二の手の供船', '右馬之丞の配下（名は不明）', 120, 36, 140, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.4' }],
  ], '九鬼御伝記の二手。九鬼の自船を含めた並びと兵数は推定、織田の旗は既存の代用'),
  rosterPlan('川口へ寄せる船団', 1, { x: -220, z: 150 }, Math.PI * 3 / 4, [
    ['front', '先手の関船・小早', '毛利・村上の将（名は不明）', 1200, -130, 45, 'mori', 'mori', 0, { ships: 150, bind: 'far.0' }],
    ['west', '西から包む手', '毛利・村上の将（名は不明）', 1200, -232, 45, 'mori', 'mori', 0, { ships: 150, bind: 'far.6' }],
    ['south', '南から包む手', '毛利・村上の将（名は不明）', 1200, -130, 141, 'mori', 'mori', 0, { ships: 150, bind: 'far.27' }],
    ['supply', '兵糧船と後備え', '毛利方の将（名は不明）', 1200, -232, 141, 'mori', 'mori', 0, { ships: 150, bind: 'far.33' }],
  ], '信長公記巻十一の六百余艘。各手の船数・兵数・将・家紋は不明、毛利の旗で代表する'),
];
const kizugawa = {
  jinkei: JIN,
  noHorse: true,   // 海上の戦。騎馬の組も徒の槍に替え、乗馬の検査から外す
  spawn: { x: -8, z: 0, heading: -Math.PI / 2 },
  world: {
    seed: 15786,
    time: 'day',
    muddy: 0,
    height,
    clear: () => true,
    trees: 0,
    tufts: 0,
    // 甲板の地面は木の色、甲板の縁から海の底へ落ちる所は鉄の舷の色（前は芝の色のまま、船の縁から緑の崖がはみ出して見えた）
    tint(x, z, h, c) { if (h > DECK.y - 0.05) c.setRGB(0.37, 0.3, 0.23); else c.setRGB(0.15, 0.145, 0.13); },
    fleeOut: (x, z, team) => team === 1 && (x < DECK.x0 - 3 || z < DECK.z0 - 3 || z > DECK.z1 + 3),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { ships: 'HIST_A', atakebune: 'HIST_B', supply: 'HIST_A', deckFight: 'GAME_C', bay: 'HIST_B', windTide: 'GAME_C', flooding: 'GAME_C' };
    F.small = []; F.boarders = [];
    // 海に共通の遠景処理が陸戦の兵を立てないよう、この戦の水面を伝える。
    W.inWaterAt = (x, z) => W.heightAt(x, z) < 0;
    F.step = 0; F.ek = 0; F.ak = 0; F.sunk = 0; F.doused = 0; F.supplyPassed = 0; F.supplyStopped = 0;
    // 船の上では馬に乗らない
    const P = rt.player;
    if (P.mounted) { rt.army.setMounted(P.u, false); P.mounted = false; }
    P.canRide = false;
    // ---- 海（world の川面は岸の線で歩ける所を切るので使わず、ここで海の面だけを張る） ----
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 64, 64), new THREE.MeshStandardMaterial({ color: 0x3a4e55, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.94 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = 0; sea.receiveShadow = true;
    rt.scene.add(sea);
    F.sea = sea; F.waveAt = -1;
    prepareHouroku(rt);
    // 船の上に草は生えない（足もとの草の群れを隠す）
    if (W.nearGrass) W.nearGrass.visible = false;
    // 自船と、三艘ずつ二手をなす五艘の供船（並びは推定）。船を板で繋がない。
    F.deckShip = hull(W, 0, DECK.z0, DECK.z1, 40, true); rt.scene.add(F.deckShip);
    // ---- 遠い大坂の岸（東）と、西から来る毛利の船団の影（水平線に見せる。B070・B071） ----
    { const shore = new THREE.Mesh(new THREE.BoxGeometry(60, 5, 640), new THREE.MeshStandardMaterial({ color: 0x3a4838, roughness: 1 }));
      shore.position.set(430, 1.5, 0); rt.scene.add(shore);
      for (let i = 0; i < 6; i++) { const h = new THREE.Mesh(new THREE.ConeGeometry(34 + (i % 3) * 10, 22 + (i % 2) * 10, 7), new THREE.MeshStandardMaterial({ color: 0x31402f, roughness: 1 })); h.position.set(480, 8, -240 + i * 100); rt.scene.add(h); }
       }
    // ---- 供の大安宅船（自船と合わせて九鬼の大船六艘。形と動きだけの軽い船） ----
    F.escorts = [[38, -42], [76, -84], [-40, 56], [-2, 98], [36, 140]].map(([x, z]) => {
      const m = atakeLite(W); m.position.set(x, 0, z); m.rotation.y = -Math.PI / 4; rt.scene.add(m);
      const flag = nobori(W, x, z, 'oda', 7); flag.position.y = 2.6; rt.scene.add(flag);
      return { m, x, z };
    });
    for (const [x, z] of [[-13, 8], [0, 10], [13, 8], [-6, -24], [6, -24]]) { const n = nobori(W, x, z, 'oda', 7); rt.scene.add(n); }
    rt.scene.add(tawara(W, 8, 14, 0.2, 5), tawara(W, -4, -12, -0.3, 4));
    // 大筒（西の舷）
        F.guns = CANNONS.map((c) => {
      const m = taihou(shipMats());
      m.position.set(c.x - 0.8, DECK.y + 1.1, c.z);
      rt.scene.add(m);
      return { ...c, m, cd: 0 };
    });
    // ---- 九鬼嘉隆の手（自分の持ち場）と、鉄砲衆 ----
    F.kuki = allyGroup(rt, { name: '九鬼嘉隆の手', anchor: { x: -6, z: 0 }, facing: -Math.PI / 2, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '九鬼嘉隆', invuln: true, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }], ODA));
    F.kukiU = F.kuki.units[0];
    F.teppo = allyGroup(rt, { name: '船の鉄砲衆', anchor: { x: -12, z: -18 }, facing: -Math.PI / 2, width: 10, aggro: 40, noRout: true },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 14 }], ODA));
    F.oda = [F.kuki, F.teppo];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 6, z: 4 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 20) }]);
    // ---- 遠くの毛利の船団（小早を並べた影） ----
    F.boats = [];
    F.far = [];
    for (let i = 0; i < 36; i++) {
      const b = i % 6 === 0 ? sekibune() : kobaya();
      b.position.set(-130 - (i % 9) * 17, 0, 45 + Math.floor(i / 9) * 32 + (i % 3) * 7);
      b.rotation.y = Math.PI * 3 / 4;
      rt.scene.add(b);
      F.far.push(b);
    }
    // ---- 遠景：北東に石山本願寺の方（上町台地）、南東に堺の方の低い町並み ----
    const land = new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 1 });
    const town = new THREE.MeshStandardMaterial({ color: 0x6b6456, roughness: 1 });
    const honganji = new THREE.Mesh(new THREE.BoxGeometry(44, 20, 16), land); honganji.position.set(280, 10, -70); rt.scene.add(honganji);
    const sakai = new THREE.Mesh(new THREE.BoxGeometry(60, 9, 20), town); sakai.position.set(300, 4.5, 90); rt.scene.add(sakai);

    // 十六世紀の大坂湾：浅い水域と砂州、淀川・大和川の河口の濁り（今の埋立地や港の岸壁は無い）
    const shoal = new THREE.MeshStandardMaterial({ color: 0x6a7a72, roughness: 0.4, transparent: true, opacity: 0.55 });
    const sand = new THREE.MeshStandardMaterial({ color: 0x9a9070, roughness: 1 });
    const silt = new THREE.MeshStandardMaterial({ color: 0x6e6a52, roughness: 0.6, transparent: true, opacity: 0.6 });
    for (const [x, z, r] of [[170, -20, 70], [200, 80, 60], [-80, 170, 50]]) { const sh = new THREE.Mesh(new THREE.CircleGeometry(r, 20), shoal); sh.rotation.x = -Math.PI / 2; sh.position.set(x, 0.05, z); rt.scene.add(sh); }
    for (const [x, z, r] of [[150, -60, 14], [185, 40, 10], [-60, 150, 9]]) { const sb = new THREE.Mesh(new THREE.CircleGeometry(r, 14), sand); sb.rotation.x = -Math.PI / 2; sb.position.set(x, 0.12, z); rt.scene.add(sb); }
    { const sl = new THREE.Mesh(new THREE.CircleGeometry(90, 20), silt); sl.rotation.x = -Math.PI / 2; sl.position.set(240, 0.08, -70); rt.scene.add(sl); }
    // 石山本願寺の遠景：寺内町の低い屋根の連なりと、大屋根の御堂・櫓
    const roofM = new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 1 });
    for (let i = 0; i < 9; i++) { const rf = new THREE.Mesh(new THREE.BoxGeometry(10 + (i % 3) * 3, 5, 8), roofM); rf.position.set(262 + (i % 3) * 16, 22 + (i % 2) * 2, -86 + Math.floor(i / 3) * 14); rt.scene.add(rf); }
    const yg = new THREE.Mesh(new THREE.BoxGeometry(6, 10, 6), land); yg.position.set(262, 30, -96); rt.scene.add(yg);
    F.windSeed = 1.6; F.noticeAt = 0;
    rt.world.setTime('day');
    rt.setPhase('brief'); rt.objProgress('main', '');
    rt.obj('main', HI(rt) ? '九鬼嘉隆の船で鉄砲衆の一手を預かり、下知を待て' : '九鬼嘉隆のもとで、下知を待て', 'main');
    rt.say('九鬼嘉隆', `${nm(rt)}、南西から六百余艘が来る。わしらの大船は六艘。川口を渡すな`, 5);
    rt.say('九鬼嘉隆', '西の大筒につけ。遠いうちは撃つな。近くへ寄せてから放て', 4);
    rt.marker('kuki', unitPos(F.kukiU), '九鬼嘉隆', {});
    rt.after(14, () => this.cannons(rt));
  },

  // 小早を一艘出す（南西から、甲板の西と南の縁へ向かう）
  launch(rt, from) {
    const F = rt.flags;
    const m = kobaya();
    const s = from === 's' ? { x: -85, z: 170 } : { x: -190, z: 60 + Math.random() * 70 };
    const t = from === 's' ? { x: -6 + Math.random() * 12, z: DECK.z1 + 4 } : { x: DECK.x0 - 4, z: Math.max(DECK.z0 + 4, Math.min(DECK.z1 - 4, s.z)) };
    m.position.set(s.x, 0, s.z);
    m.rotation.y = Math.atan2(t.x - s.x, t.z - s.z);
    rt.scene.add(m);
    const b = { m, x: s.x, z: s.z, t, alive: true, landed: false, from };
    F.boats.push(b);
    return b;
  },

  // 毛利の荷駄船（石山本願寺へ兵糧を運ぶ）：西から来て、織田船団の脇を通り東（石山の方）へ抜けようとする
  launchSupply(rt) {
    const F = rt.flags;
    const m = sekibune();
    const wood = new THREE.MeshStandardMaterial({ color: 0xc9a66b, roughness: 0.9 });
    for (let i = 0; i < 3; i++) { const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.1, 8), wood); tw.rotation.z = Math.PI / 2; tw.position.set(-0.7 + i * 0.7, 0.9, -1.5 + i * 1.4); m.add(tw); }
    const z = -16 + Math.random() * 38;
    const s = { x: -200, z: z + 90 };
    const t = { x: 230, z: z + (Math.random() - 0.5) * 20 };
    m.position.set(s.x, 0, s.z);
    m.rotation.y = Math.atan2(t.x - s.x, t.z - s.z);
    rt.scene.add(m);
    const b = { m, x: s.x, z: s.z, t, alive: true, landed: false, supply: true, sp: 3.2 };
    F.boats.push(b);
    return b;
  },

  // ① 大筒を撃つ
  cannons(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('cannon'); rt.objProgress('main', '');
    rt.unmark('kuki');
    sfx('horagai', 0.9);
    rt.banner('毛利の船団', '南西から来た船が、両脇へ広がる');
    rt.obj('main', HI(rt) ? '西の大筒と鉄砲衆を預かれ。近い小舟を撃て' : '西の大筒へ。近い小舟を撃て', 'main');
    for (let i = 0; i < 3; i++) {
      const c = F.guns[i];
      rt.marker('g' + i, { x: c.x, z: c.z }, '大筒', { h: 2 });
      rt.addInteract('g' + i, { x: c.x + 1.6, z: c.z }, '大筒を撃つ', () => this.fire(rt, i), { r: 2.6, hold: 1.2 });
    }
    this.launch(rt, 'w'); rt.after(6, () => this.launch(rt, 'w')); rt.after(14, () => this.launch(rt, 'w'));
    F.nextBoat = rt.t + 22;
  },
  fire(rt, i) {
    const F = rt.flags;
    const c = F.guns[i];
    if (F.step === 2 || F.step === 3) { rt.bark('今は甲板の持ち場を守れ'); return; }
    if (F.step === 5 || F.ending) return;
    if (rt.t < c.cd) { rt.bark('まだ弾込めが済んでおらぬ'); return; }
    c.cd = rt.t + 8.5;   // 込めるのが遅い大鉄砲（弾も火薬も大きい）
    rt.army.play('volley', { x: c.x, z: c.z }, 1.6);
    rt.army.smoke(c.x - 2, DECK.y + 1.2, c.z, -1, 0, 2.5);
    // 西向きの射界内だけを狙う。決め手の段では大将船を優先する。
    let best = null, bd = 95;
    for (const b of F.boats) if (b.alive && (!b.landed || b.big) && b.x < c.x - 3 && Math.abs(b.z - c.z) < 50) { const d = Math.hypot(b.x - c.x, b.z - c.z); if (d < bd) { bd = d; best = b; } }
    if (F.step === 4) best = F.big && F.big.alive && Math.hypot(F.big.x - c.x, F.big.z - c.z) <= 75 ? F.big : null;
    if (!best) { rt.bark(F.step === 4 ? 'まだ遠い。大船を引き付けよ' : '大筒は届かぬ。小早を引き付けよ'); return; }
    // 命中も限られる：遠いほど外れやすい（大きな弾は狙いを付け直しにくい）
    const missChance = best.big ? 0 : Math.max(0, Math.min(0.55, (bd - 25) / 110));
    if (Math.random() < missChance) { rt.army.smoke(best.x + 5, 0.4, best.z + 4, 0, 0, 2.2); rt.army.play('wood', { x: best.x + 5, z: best.z + 4 }, 0.8); rt.bark('大筒、外れた！　波に消える'); return; }
    rt.after(0.6, () => {
      if (!best.alive || F.ending) return;
      // 大将船への命中を合図に、ほかの大船も一斉に放つ。
      if (best.big) { this.breakFlagship(rt, true); return; }
      best.alive = false;
      if (best.supply) {
        F.supplyStopped++;
        rt.army.smoke(best.x, 1, best.z, 0, 0, 3);
        rt.army.play('wood', { x: best.x, z: best.z }, 1.2);
        best.sinkT = 0;
        rt.bark('荷駄船を沈めた！　兵糧を断ったぞ', true);
        rt.award((t) => t.side.push('毛利の荷駄船を沈めた'), '荷駄船を沈めた');
        return;
      }
      rt.army.smoke(best.x, 1, best.z, 0, 0, 3);
      rt.army.play('wood', { x: best.x, z: best.z }, 1.2);
      best.sinkT = 0;
      F.sunk++;
      rt.award((t) => { t.special = { label: '大筒で小早を沈めた', pts: 3 * Math.min(6, F.sunk) }; }, '小早を沈めた');
      if (F.step === 1) rt.objProgress('main', `小舟${F.sunk}艘を打ち払った`);
    });
  },

  // ② 焙烙火矢の火を消す
  fires(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('fire'); rt.objProgress('main', '');
    for (let i = 0; i < 3; i++) { rt.unmark('g' + i); rt.uninteract('g' + i); }
    rt.objDone('main');
    sfx('volley', 0.8);
    rt.banner('焙烙火矢', '甲板に火の壺が投げ込まれた');
    rt.obj('main', '甲板に上がった火を消せ（3か所）', 'main');
    rt.say('九鬼嘉隆', '甲板に火が上がった！　印の水桶へ走り、水を掛けよ！', 3.5);
    battleEvent(rt, EVENT_FIRE_START, { x: -4, z: -20 }, null, 1, true, '甲板に火が上がった');
    F.fl = [{ x: -4, z: -20 }, { x: 8, z: -4 }, { x: -2, z: 20 }].map((q, i) => {
      const h = F.houroku[i]; h.start = rt.t;
      const fire = { ...q, f: null };
      rt.after(1.2, () => { if (!fire.doused) fire.f = rt.world.addFire(q.x, q.z, { h: 0.3, size: 1.5 }); });
      rt.marker('f' + i, q, '火を消す', { h: 2 });
      rt.addInteract('f' + i, q, '水を掛けて火を消す', () => this.douse(rt, i), { r: 2.8, hold: 1.6 });
      return fire;
    });
  },
  douse(rt, i) {
    const F = rt.flags;
    if (!F.fl[i] || F.fl[i].doused) return;
    F.fl[i].doused = true;
    F.houroku[i].dousedAt = rt.t;
    rt.uninteract('f' + i); rt.unmark('f' + i);
    rt.world.removeFire(F.fl[i].f);
    F.doused++;
    rt.award((t) => t.side.push('焙烙の火を消した'), '火を消した');
    rt.objProgress('main', `${F.doused}／3か所`);
    if (F.doused >= 3) { rt.obj('main', '火は消えた。南の船べりで乗り込みを防げ', 'main'); rt.marker('guard', { x: -8, z: 22 }, '南の持ち場'); }
  },

  // 大将の船と思われる大船（主と細かな姿は特定しない）
  launchBig(rt) {
    const F = rt.flags;
    const m = sekibune(true);
    m.scale.set(1.2, 1.2, 1.2);
    const s = { x: -160, z: 100 }, t = { x: DECK.x0 - 28, z: 4 };
    m.position.set(s.x, 0, s.z);
    m.rotation.y = Math.atan2(t.x - s.x, t.z - s.z);
    rt.scene.add(m);
    const b = { m, x: s.x, z: s.z, t, alive: true, landed: false, from: 'w', big: true };
    F.boats.push(b);
    F.big = b;
    return b;
  },

  // ③ 乗り移ってきた毛利勢
  board(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('board'); rt.objProgress('main', '');
    rt.objDone('main'); rt.unmark('guard');
    for (let i = 0; i < 3; i++) { rt.uninteract('f' + i); rt.unmark('f' + i); }
    rt.banner('乗り移ってくる', '小早から、毛利の兵が甲板へ乗り込んできた');
    rt.obj('main', HI(rt) ? '組を南へ寄せ、乗り込む敵を防げ' : '南の船べりへ。乗り込む敵を防げ', 'main');
    rt.say('九鬼嘉隆', '槍を取れ！　一人も甲板に居させるな！', 3);
    rt.marker('guard', { x: -8, z: 22 }, '南の持ち場');
    rt.after(35, () => { if (F.step === 3) volleyAt(rt, { guns: () => [F.teppo], foes: () => F.boarders, who: '九鬼嘉隆', near: 8, drop: 24, max: 8, say: '船べりまで寄せたぞ。鉄砲衆、放て！', line: '甲板の敵がひるむ' }); });
    F.boarders = [];
    const mk = (x, z, name, face, lead) => {
      const list = lead ? [{ type: 'busho', n: 1, o: { name: lead } }, { type: 'samurai', n: 1 }] : [{ type: 'samurai', n: 2 }];
      grapple(rt, x, z);
      // 鉤縄の場所から乗り込む。陸の新手を隠す処理で海や反対の舷へ移さない。
      const g = enemyGroup(rt, { faction: 'mori', name, fixed: true, noGuard: true, anchor: { x, z }, facing: face, order: 'attack', seekRange: 50, aggro: 16, width: 8, morale: 90, fleeDir: { x: -1, z: 0 }, dmgMult: 0.62 },
        dress([...list, { type: 'ashigaru', n: 10 }], MORI));
      F.boarders.push(g);
      rt.marker('b' + F.boarders.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
      rt.army.play('eshout', { x, z }, 1.5);
      if (lead) rt.say(lead, '船を寄せよ！　鉄の板など越えて乗り込め！', 3.5);
    };
    // 寄せは二度の大波：舷と舳先から一度に乗り込み、しばらくして村上の水軍がまとめて来る
    mk(DECK.x0 + 2, 10, '西から乗り込んだ毛利勢', Math.PI / 2);
    mk(-6, DECK.z1 - 2, '南から乗り込んだ毛利勢', Math.PI);
    rt.after(38, () => {
      if (F.ending) return;
      mk(DECK.x0 + 2, 18, '村上の者', Math.PI / 2); mk(8, DECK.z1 - 2, '南の新手', Math.PI);
      flotilla(rt, 3, 'w');
      rt.say('足軽', '村上の水軍じゃ！　西からも南からも、まだ乗り込んでくる……！', 3);
    });
  },

  // 史実の決め手。大将の船と思われる一艘を近くへ寄せる。
  decisive(rt) {
    const F = rt.flags;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('flagship'); rt.objProgress('main', ''); rt.objDone('main'); rt.unmark('guard');
    for (let k = 1; k <= 4; k++) rt.unmark('b' + k);
    this.launchBig(rt);
    rt.banner('敵の大船を引き付けよ', '遠いうちは撃たず、西の大筒で待つ');
    rt.obj('main', '西の大筒へ。敵の大船を近くへ寄せて撃て', 'main');
    rt.say('九鬼嘉隆', 'あれが大将船か。引きつけて、六艘で撃て', 4);
    rt.marker('big', () => F.big.m.position, '狙う大船', { red: true, h: 6 });
    rt.marker('g1', CANNONS[1], '西の大筒', { h: 2 });
    const c = F.guns[1];
    rt.addInteract('g1', { x: c.x + 1.6, z: c.z }, '大筒を撃つ', () => this.fire(rt, 1), { r: 2.6, hold: 1.2 });
  },
  breakFlagship(rt, playerShot) {
    const F = rt.flags;
    if (F.bigSunk || !F.big) return;
    F.bigSunk = true; F.big.alive = false; F.big.sinkT = 0;
    rt.unmark('big'); rt.objDone('main');
    rt.obj('main', '甲板を守り、敵の船が離れるのを見届けよ', 'main');
    rt.banner('六艘の一斉射', '敵の大船が崩れ、周りの小舟が止まる');
    rt.say('九鬼嘉隆', '放て！　敵の大船が崩れた。寄せる小舟も打ち払え！', 4);
    for (const c of F.guns) rt.army.smoke(c.x - 2, DECK.y + 1.2, c.z, -1, 0, 2.5);
    for (const e of F.escorts) rt.army.smoke(e.x - 5, 3, e.z, -1, 0, 2.5);
    rt.army.play('volley', CANNONS[1], 1.6);
    rt.army.smoke(F.big.x, 2, F.big.z, 0, 0, 3);
    battleEvent(rt, EVENT_VOLLEY, CANNONS[1], F.teppo, 0, true, '六艘の大鉄砲が一斉に火を吹く');
    battleEvent(rt, EVENT_UNIT_BREAK, F.big, null, 1, true, '敵の大船が崩れ、船団がひるむ');
    // 既存の士気処理へ渡す。討ち取りや作りの一騎打ちにはしない。
    for (const groups of [F.boarders, F.small]) for (const g of groups || []) { g.noRout = false; g.morale = Math.min(g.morale, 18); }
    if (playerShot) rt.award((t) => t.side.push('引き付けた敵の大船に大鉄砲を当てた'), '敵の大船を打ち崩した');
    for (const b of F.boats) if (b.alive && !b.supply) {
      b.landed = false; b.t.x = -250; b.t.z = 160; b.m.rotation.y = Math.atan2(b.t.x - b.x, b.t.z - b.z);
    }
  },
  retreat(rt) {
    const F = rt.flags;
    F.step = 5; F.stepT = rt.t;
    rt.setPhase('withdraw'); rt.objProgress('main', ''); rt.objDone('main');
    for (let i = 0; i < 3; i++) { rt.uninteract('g' + i); rt.unmark('g' + i); }
    rt.banner('船団が離れ始めた', '川口を守り、兵糧の船を通すな');
    rt.obj('main', '甲板を守れ。残る敵を退け、川口を押さえよ', 'main');
    rt.say('九鬼嘉隆', '追って船をばらばらにするな。川口を守れ。兵糧の船を通すな', 4);
    battleEvent(rt, EVENT_RETREAT, CANNONS[1], null, 1, true, '毛利の船団が大船から離れる');
    // 大筒は鉄砲衆が受け持つ。自分の甲板戦と二つの操作を競合させない。
    for (let i = 0; i < 2; i++) rt.after(5 + i * 15, () => {
      if (F.step !== 5) return;
      const b = this.launchSupply(rt);
      rt.after(12, () => {
        if (!b.alive || F.step !== 5) return;
        b.alive = false; b.sinkT = 0; F.supplyStopped++;
        rt.army.smoke(b.x, 1, b.z, 0, 0, 2); rt.army.play('volley', CANNONS[1], 1);
        rt.bark('鉄砲衆が兵糧の船を打ち払った');
      });
    });
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end'); rt.objProgress('main', '');
    for (let i = 1; i <= 4; i++) rt.unmark('b' + i);
    for (const groups of [F.boarders, F.small]) for (const q of groups || []) if (!gone(q)) { q.noRout = false; q.morale = 0; }
    for (let i = 0; i < 3; i++) { rt.uninteract('g' + i); rt.unmark('g' + i); }
    rt.objDone('main');
    rt.tracker.main = true;
    const passed = F.supplyPassed || 0;
    rt.award((t) => { t.main = true; t.special = { label: passed === 0 ? '鉄甲船で毛利の船団を退け、荷駄船を一艘も通さなかった' : `鉄甲船で毛利の船団を退けた（荷駄船${passed}艘が通った）`, pts: Math.max(6, 20 - passed * 4) }; }, '任務達成・木津川口を守った');
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    if (passed === 0) rt.banner('毛利の船団、退く', '川口へ寄せた敵船を打ち払った');
    else rt.banner('毛利の船団、退く', `荷駄船${passed}艘が石山の方へ抜けた。兵糧は、わずかに届いてしまった`);
    rt.say('九鬼嘉隆', passed === 0 ? `見たか、${nm(rt)}！　川口は守った。大船の持ち場を離れるな` : `${nm(rt)}、よう防いだ。……抜けた舟もあるか`, 4);
    
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    const motionT = S.reduceMotion ? 0 : rt.t;
    animateRig(F.deckShip, motionT, !S.reduceMotion);
    updateHouroku(rt, motionT);
    // 波の頂点と法線は毎秒十回だけ。自船の床は固定したまま。
    if (rt.t >= F.waveAt) {
      F.waveAt = rt.t + 0.1;
      const p = F.sea.geometry.attributes.position, n = F.sea.geometry.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = -p.getY(i), a = x * 0.075 + z * 0.045 + motionT * 0.9, b = z * 0.12 - motionT * 1.2;
        p.setZ(i, 0.16 * Math.sin(a) + 0.08 * Math.sin(b));
        const nx = -0.012 * Math.cos(a), ny = 0.0072 * Math.cos(a) + 0.0096 * Math.cos(b), inv = 1 / Math.hypot(nx, ny, 1);
        n.setXYZ(i, nx * inv, ny * inv, inv);
      }
      p.needsUpdate = n.needsUpdate = true;
    }
    // 崩れた隊の印は消す
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    // 船上の足場：押し合いで味方（九鬼方）が舷から海へ落ちないよう、甲板の縁に留める
    //   （毛利方は崩れて海へ飛び込んで良い＝fleeOut。味方だけ縁の内に押し戻す。kaito botrun 10/1）
    const M = 0.15;   // 縁ぎりぎりまでは歩ける薄い留め（広く取ると隅で「進めない」になる。kaito botrun 10/1）
    let alive = 0;
    for (const u of rt.army.units) {
      if (u.alive) alive++;
      if (!u.alive || u.team !== 0) continue;
      if (u.pos.x < DECK.x0 + M) u.pos.x = DECK.x0 + M;
      else if (u.pos.x > DECK.x1 - M) u.pos.x = DECK.x1 - M;
      if (u.pos.z < DECK.z0 + M) u.pos.z = DECK.z0 + M;
      else if (u.pos.z > DECK.z1 - M) u.pos.z = DECK.z1 - M;
    }
    if (F.ending) return;
    // 小早を動かす・沈める
    for (const b of F.boats) {
      if (!b.alive) { if (b.sinkT !== undefined && b.sinkT < 6) { b.sinkT += dt; b.m.position.y = -b.sinkT * 0.5; b.m.rotation.z = b.sinkT * 0.12; } else if (b.m.parent) rt.scene.remove(b.m); continue; }
      floatShip(b.m, motionT, !b.landed && !S.reduceMotion, !!b.big);
      if (b.landed) continue;
      const dx = b.t.x - b.x, dz = b.t.z - b.z, d = Math.hypot(dx, dz);
      // 風と潮：追い風・満ち潮で速く、向かい風・引き潮で遅い（ゆっくり変わる）。浸水した船は遅く、舵の壊れた船は流される
      const wt = 1 + 0.2 * Math.sin(rt.t * 0.06 + (F.windSeed || 0)) + 0.08 * Math.sin(rt.t * 0.17 + 1);
      const sp = (b.sp || 5) * wt * (b.leak ? 0.72 : 1);
      if (b.rudderLost) b.z += Math.sin(rt.t * 0.7 + b.x) * 2.2 * dt;
      if (d > 0.5) { b.x += dx / d * sp * dt; b.z += dz / d * sp * dt; b.m.position.x = b.x; b.m.position.z = b.z; }
      else if (b.supply) {
        b.landed = true;
        F.supplyPassed++;
        rt.bark('毛利の荷駄船が、石山の方へ抜けていった……', true);
        rt.after(2, () => { if (b.m.parent) rt.scene.remove(b.m); });
      }
      else {
        b.landed = true;
        // 包囲が続く消火・甲板防衛の間も、着いた小早から乗り込む。
        // 六隊の上限は今戦える隊で数える。倒した隊を数え続けて新手を止めない。
        let smallActive = 0;
        for (const g of F.small) if (!gone(g)) smallActive++;
        if (F.step >= 1 && F.step <= 3 && smallActive < 6 && alive + 4 <= 210) {
          const ax = b.from === 's' ? b.x : DECK.x0 + 2, az = b.from === 's' ? DECK.z1 - 2 : Math.max(DECK.z0 + 3, Math.min(DECK.z1 - 3, b.z));
          grapple(rt, ax, az);
          const g = enemyGroup(rt, { faction: 'mori', name: '小早から上がった毛利勢', fixed: true, noGuard: true, anchor: { x: ax, z: az }, facing: b.from === 's' ? Math.PI : Math.PI / 2, order: 'attack', seekRange: 40, aggro: 14, width: 5, morale: 80, fleeDir: { x: -1, z: 0 }, dmgMult: 0.6 },
            dress([{ type: 'ashigaru', n: 4 }], MORI));
          F.small.push(g); alive += 4;
          rt.bark('鉤縄が舷に掛かった！　乗り込んでくる！', true);
        }
      }
    }
    // 毛利の船は、大筒・消火・甲板防衛の間は途切れず寄せてくる
    if (F.step >= 1 && F.step <= 3 && rt.t > (F.nextBoat || 1e9)) { F.nextBoat = rt.t + 12; let moving = 0; for (const b of F.boats) if (b.alive && !b.landed) moving++; if (moving < 10) this.launch(rt, Math.random() < 0.7 ? 'w' : 's'); }
    // 遠くの船団がゆれる
    for (const b of F.far) { floatShip(b, motionT, !S.reduceMotion); if (F.bigSunk) { b.position.x -= dt * 2; b.position.z += dt; } }
    for (const e of F.escorts) floatShip(e.m, motionT, !S.reduceMotion, true);
    const elapsed = rt.t - F.stepT;
    if (rt.t >= F.noticeAt) {
      F.noticeAt = rt.t + 1;
      if (F.step === 1) rt.objProgress('main', `包囲の波 あと${Math.max(0, Math.ceil(70 - elapsed))}秒・小舟${F.sunk}艘を撃退`);
      if (F.step === 3) rt.objProgress('main', `次の下知まで あと${Math.max(0, Math.ceil(85 - elapsed))}秒`);
      if (F.step === 4) rt.objProgress('main', F.bigSunk ? `敵の船が離れるまで あと${Math.max(0, Math.ceil(70 - elapsed))}秒` : Math.hypot(F.big.x - CANNONS[1].x, F.big.z - CANNONS[1].z) <= 75 ? '敵の大船が射程に入った。大筒を撃て' : 'まだ遠い。大筒で待て');
      if (F.step === 5) rt.objProgress('main', `川口の見張り あと${Math.max(0, Math.ceil(45 - elapsed))}秒`);
    }
    if (F.step === 1 && elapsed >= 70) { this.fires(rt); return; }
    if (F.step === 2) {
      if (elapsed >= 50 && F.doused < 3) {
        rt.say('九鬼嘉隆', '消火の手が水を掛けた！　南の船べりを固めよ', 3);
        for (let i = 0; i < 3; i++) if (rt.interacts.some((q) => q.id === 'f' + i)) this.douse(rt, i);
      }
      if (elapsed >= 30 && F.doused >= 3) { this.board(rt); return; }
    }
    if (F.step === 3 && elapsed >= 85) { this.decisive(rt); return; }
    if (F.step === 4) {
      if (!F.bigSunk && elapsed >= 85) { rt.say('九鬼嘉隆', 'ほかの船も狙いがついた。六艘、放て！', 3); this.breakFlagship(rt, false); }
      if (F.bigSunk && elapsed >= 70) { this.retreat(rt); return; }
    }
    if (F.step === 5 && elapsed >= 45) this.win(rt);

  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1 || rt.t < (F.routSayT || 0)) return;   // 同じ知らせを続けて出さない
    F.routSayT = rt.t + 10;
    rt.say('足軽', `${String(g.name).replace(/（[^）]*）/g, '')}が海へ飛び込んで逃げた！`, 2.5);
  },
};

// 両軍の総勢（九鬼の大船六艘と供の船の兵 数千、毛利の船団 六百艘とも。数には諸説ある）
kizugawa.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(3000 - (F.ak || 0) * 10), a0: 3000, b: Math.max(0, 8000 - (F.ek || 0) * 20 - F.sunk * 60), b0: 8000 };
};
kizugawa.sides = { a: { name: '織田水軍（九鬼）', mon: 'oda' }, b: { name: '毛利水軍', mon: 'mori' } };
// 敵の大将船の主は史料で特定されない。名のある将を自船へ乗り込ませない。
kizugawa.famous = [];
kizugawa.date = () => '天正六年十一月六日　冬・朝から昼';
kizugawa.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
kizugawa.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
kizugawa.history = '『信長公記』巻十一によると、天正六年十一月六日、西国の船六百余艘が木津へ出た。九鬼嘉隆の船団は囲まれ、朝から昼まで海上で戦った。六艘の大船は敵を間近へ寄せ、大将の船と思われる船を大鉄砲で崩し、敵は近寄れなくなったと記す。鉄張りは『多聞院日記』に見えるが、覆った範囲には諸説がある。大きさは『信長公記』別本の長さ十八間・幅六間（約三十二メートル・十一メートル）を遠景に採った。『九鬼御伝記』では三艘ずつ二手に分かれ、敵船を二十四艘取ったともいう。毛利方の文書には木津への着岸が見え、この一戦で海の道が完全に断たれたかには異論もある。自船の甲板は操作のため広げた。消火・乗り込み・個々の荷駄船の阻止、総兵数と天候は遊びの補完である。';
// 確認した史料の翻刻・現代語表記：
// https://kininaruart.com/artist/shincho/n11.html
// https://proto.harisen.jp/koramu/koramu-tekkousen2.htm


// 素直な遊び手：大筒を撃ち、火を消し、乗り込んだ毛利勢と戦う
kizugawa.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 深手の退避と手当ては共通の頭に任せる。手当ては体力の四分の三までなので、
  // 自然回復を待つと甲板の隅から二度と戦いへ戻れない。
  const e = b.army.nearestEnemy(u, 10, (o) => !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  const pre = F.step === 1 || F.step === 4 && !F.bigSunk ? 'g' : F.step === 2 ? 'f' : null;
  if (pre) {
    let it = null, bd = Infinity;
    for (const x of b.interacts) if (x.id.startsWith(pre)) {
      if (pre === 'g') { const gi = +x.id.slice(1); if (b.t < F.guns[gi].cd) continue; }
      const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; }
    }
    if (it) { if (bd > 1.2) goTo(p, inp, it.pos.x, it.pos.z, 0.8); else inp.k.add('KeyE'); }
    return;
  }
  if (F.step === 3) {
    // 二度の大波だけでなく、小早から乗り込んだ新手にも向かう。
    const q = b.army.nearestEnemy(u, 80, (o) => !o.fleeing && o.pos.x >= DECK.x0 && o.pos.x <= DECK.x1 && o.pos.z >= DECK.z0 && o.pos.z <= DECK.z1);
    if (q) { goTo(p, inp, q.pos.x, q.pos.z, 2); return; }
    goTo(p, inp, -8, 0, 2);
  }
};

// 軽い小舟を段の切り替わりだけで足す。
const flotilla = (rt, n, from) => { for (let i = 0; i < n; i++) rt.after(i * 1.2, () => { if (!rt.flags.ending && rt.flags.step < 4) kizugawa.launch(rt, from || 'w'); }); };

export { kizugawa };
