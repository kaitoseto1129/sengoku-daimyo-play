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
import { nobori, tawara, solidSeg } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm, unitPos } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { battleEvent, EVENT_VOLLEY, EVENT_FIRE_START, EVENT_UNIT_BREAK, EVENT_RETREAT } from './battle_events.js';
import { addDeck, addLadder } from './floors.js';
import { S } from './settings.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 船体は舳先を含め約32m×11m。歩く甲板も同じ幅にする。水面は0。
const DECK = { x0: -5.5, x1: 5.5, z0: -13, z1: 13, y: 2.3 };
const CANNONS = [{ x: -4.6, z: -8 }, { x: -4.6, z: 0 }, { x: -4.6, z: 8 }];   // 西の舷の大筒
// 桶・消火・兵の行き先は、欄干の内側と屋形の両脇にそろえる。
const WATER = [{ x: -4.6, z: -8 }, { x: 4.6, z: -8 / 3 }, { x: -4.6, z: 8 / 3 }, { x: 4.6, z: 8 }];
function deckWay(u, want) {
  const q = u.deckWay || (u.deckWay = { x: 0, z: 0 });
  q.x = Math.max(-4.6, Math.min(4.6, want.x));
  q.z = Math.max(-11.8, Math.min(11.8, want.z));
  if (q.z > 4.8 && Math.abs(q.x) < 3.3) q.x = (u.pos.x < 0 ? -1 : 1) * 3.8;
  // 屋形の奥から反対側へ行く時は、手前へ出てから横切る。
  if (u.pos.z > 4.1 && u.pos.x * q.x < 0) { q.x = (u.pos.x < 0 ? -1 : 1) * 3.8; q.z = 3.8; }
  else if (q.z > 4.8 && (u.pos.x * q.x < 0 || Math.abs(u.pos.x) < 3.3)) q.z = 3.8;
  return q;
}
const ODA = { flag: 'oda' };
const MORI = { flag: 'mori' };
// この戦の知らせだけを間引く。手柄の加算は止めない。
function noticeReady(rt, text) {
  const times = rt.flags.noticeTimes;
  if (rt.t < (times[text] ?? -8) + 8) return false;
  times[text] = rt.t;
  return true;
}

// 射界の判定は発砲と狙い札で共有する。船の形や兵は増やさない。
function cannonTarget(F, c) {
  let best = null, distance = F.step === 4 ? 60 : 95;
  for (const b of F.boats) {
    if (!b.alive || b.damageStage || b.withdrawing || b.landed && !b.big && !b.ranged || F.step === 4 && b !== F.big || b.x >= c.x - 3 || Math.abs(b.z - c.z) > (c.x - b.x) * 0.55 + 3) continue;
    const d = Math.hypot(b.x - c.x, b.z - c.z);
    if (d <= (F.step === 4 ? 60 : 95) && (!best || d < distance)) { best = b; distance = d; }
  }
  return best;
}
function broadside(b, c) { return Math.abs(Math.sin(b.m.rotation.y - Math.atan2(c.x - b.x, c.z - b.z))); }
function aimWord(b, c) {
  const d = Math.hypot(b.x - c.x, b.z - c.z);
  return d > 55 ? 'まだ遠いぞ。弾がそれる' : broadside(b, c) < 0.4 ? '舳先しか見えぬ。横腹を待て' : d > 30 ? '横腹が見えたぞ。筒先を合わせよ' : '横腹が近いぞ。放て！';
}

// 接舷の鉤（鉤縄）：乗り込みの前に、縄が舷に掛かる見た目（軽い・使い回し・数秒で消す）
let HOOK = null, SUPPLY_BALE = null, SUPPLY_MAT = null;
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
  // 甲板。縁の外は海底のまま。歩く床は準備時にも登録する。
  const dx = Math.max(DECK.x0 - x, x - DECK.x1, 0), dz = Math.max(DECK.z0 - z, z - DECK.z1, 0);
  const d = Math.hypot(dx, dz);
  if (d === 0) return DECK.y;
  // 東の遠くに大坂の浜と、上町台地（石山本願寺の方）。南東に堺の方の低い陸
  h += Math.max(0, (x - 180)) * 0.12 + 20 * gauss(x, z, 300, -60, 16000) + 6 * gauss(x, z, 320, 90, 9000);
  // 木津川の口を東岸へ開く。北の台地と南の堺を残し、陸の壁で川口を塞がない。
  // 川筋・幅は推定。自船と接舷する小早の動く海域には届かない。
  if (x > 180) {
    const bank = Math.min(1, Math.max(0, (Math.abs(z) - 24) / 20));
    const mouth = Math.min(1, (x - 180) / 40);
    h += (-3 + (h + 3) * bank - h) * mouth;
  }
  return h;
}

// ---- 船の形（見回り 10/2：前は箱を並べただけで、甲板は芝の四角・矢倉は灰色の箱・小早は茶色の箱だった） ----
// 船体は木造の胴。鉄張りは楯板だけに留める推定復元。
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
  const deck = mk(256, 256, (g, w, h) => {
    g.fillStyle = '#967653'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      const x = i * 32;
      g.fillStyle = i % 2 ? '#9b7d59' : '#856747'; g.fillRect(x + 2, 0, 29, h);
      g.fillStyle = '#403428'; g.fillRect(x, 0, 2, h); g.fillRect(x, (i % 3) * 80 + 12, 32, 2);
      g.strokeStyle = '#715538'; g.beginPath(); g.ellipse(x + 16, 40 + i * 23, 4, 13, 0, 0, Math.PI * 2); g.stroke();
    }
  });
  deck.repeat.set(3, 7);
  const sea = mk(256, 256, (g, w, h) => {
    g.fillStyle = '#315e6c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 24; i++) {
      const x = (i * 73) % w, y = i * 11;
      g.strokeStyle = i % 4 ? '#477a86' : '#83aaa9'; g.lineWidth = i % 4 ? 2 : 3;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 12, y - 4, x + 30, y); g.stroke();
    }
  });
  sea.repeat.set(64, 64);
  SHIPTEX = { plate, tate, board, deck, sea };
  return SHIPTEX;
}
let SHIPMAT = null;
function shipMats() {
  if (SHIPMAT) return SHIPMAT;
  const T = shipTex();
  SHIPMAT = {
    deck: new THREE.MeshStandardMaterial({ map: T.deck, roughness: 1 }),
    iron: new THREE.MeshStandardMaterial({ map: T.plate, color: 0xb0aaa2, roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide }),
    tate: new THREE.MeshStandardMaterial({ map: T.tate, color: 0xc0b8ae, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }),
    board: new THREE.MeshStandardMaterial({ map: T.board, roughness: 0.92, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.9 }),
    tile: new THREE.MeshStandardMaterial({ color: 0x514334, roughness: 0.95 }),
    plaster: new THREE.MeshStandardMaterial({ color: 0x897352, roughness: 0.95 }),
    black: new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 0.8 }),
    copper: new THREE.MeshStandardMaterial({ color: 0x554b39, roughness: 0.9, metalness: 0.25 }),
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
  const fc = document.createElement('canvas'); fc.width = 128; fc.height = 32;
  const fg = fc.getContext('2d'); fg.fillStyle = '#e2efea';
  for (let i = 0; i < 16; i++) { fg.beginPath(); fg.ellipse(4 + i * 8, 16 + Math.sin(i * 1.4) * 4, 7, 3 + i % 3, 0, 0, Math.PI * 2); fg.fill(); }
  const foamMap = new THREE.CanvasTexture(fc); foamMap.colorSpace = THREE.SRGBColorSpace;
  RIG = { oar: geo, sail, cloth, box: new THREE.BoxGeometry(1, 1, 1), pole: new THREE.CylinderGeometry(0.06, 0.08, 1, 5), dummy: new THREE.Object3D(),
    foam: new THREE.PlaneGeometry(1, 1), foamMat: new THREE.MeshBasicMaterial({ map: foamMap, color: 0xc2d4d0, transparent: true, opacity: 0.26, depthWrite: false }) };
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
  const wall = new THREE.Group(); wall.add(m);
  const R = rigParts(), cap = new THREE.Mesh(R.box, M.wood);
  cap.scale.set(L, 0.12, 0.18); cap.position.set(m.position.x, y0 + h, m.position.z); cap.rotation.y = m.rotation.y; wall.add(cap);
  const count = Math.ceil(L / 1.5), posts = new THREE.InstancedMesh(R.box, M.wood, count + 1), D = R.dummy;
  for (let i = 0; i <= count; i++) {
    D.position.set(ax + (bx - ax) * i / count, y0 + h / 2, az + (bz - az) * i / count);
    D.rotation.set(0, 0, 0); D.scale.set(0.1, h, 0.1); D.updateMatrix(); posts.setMatrixAt(i, D.matrix);
  }
  wall.add(posts); return wall;
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
  const hwAt = (z) => hw0 * (z < z0 ? 0.18 + 0.82 * Math.sqrt(Math.max(0, (z - (z0 - 6)) / 6)) : z > z1 - 3 ? 1 - (z - (z1 - 3)) * 0.04 : 1);
  const topAt = (z) => DECK.y + 0.25 + (z < z0 ? 1.4 * ((z0 - z) / 6) ** 2 : 0);
  const body = new THREE.Mesh(loftHull(z0 - 6, z1, hwAt, topAt, -2.6, 22), M.board);
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
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.3, z1 - z0 - 0.4), M.deck);
  deck.position.set(cx, DECK.y - 0.05, (z0 + z1) / 2); g.add(deck);
  for (let i = 1; i < 10; i++) { const seam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, z1 - z0 - 0.6), M.dark); seam.position.set(cx - w / 2 + (w / 10) * i, DECK.y + 0.11, (z0 + z1) / 2); g.add(seam); }
  // 甲板の水桶と縄の輪（火矢の消し水・綱。舷の内側に寄せて、兵の立つ所をふさがない。B065）
  { const barG = new THREE.CylinderGeometry(0.34, 0.3, 0.7, 10), ropeG = new THREE.TorusGeometry(0.34, 0.09, 6, 12);
    for (let i = 0; i < 4; i++) {
      const sd = i % 2 ? 1 : -1, zz = z0 + 5 + i * ((z1 - z0 - 10) / 3);
      const bar = new THREE.Mesh(barG, M.wood); bar.position.set(cx + sd * (hw0 - 0.9), DECK.y + 0.4, zz); g.add(bar);
      const rope = new THREE.Mesh(ropeG, M.dark); rope.rotation.x = Math.PI / 2; rope.position.set(cx + sd * (hw0 - 0.9), DECK.y + 0.14, zz + 1.1); g.add(rope);
    } }
  addOars(g, cx, hw0, z0 + 6, z1 - 4, 14, 7, outL, outR);
  // 戦う時は帆を巻き上げ、甲板と大筒の射界を空ける。
  addSail(g, z0 + 11, w * 0.48, 7, 9, true);
  if (castle) {
    // 矢倉（一段上がった上甲板。床柱を四隅に立てて持ち上げる＝階下から見上げる形）
    const yagW = w * 0.45, yagL = 7, yz = z1 - 4;
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
    // 甲板から見える屋形の窓。黒い窓を白木の横桟で区切る。
    for (const sd of [-1, 1]) {
      const pane = new THREE.Mesh(rigParts().box, M.black); pane.scale.set(0.06, 0.55, 1.8); pane.position.set(cx + sd * yagW / 2, YAG_Y + 1.7, yz); g.add(pane);
      const sill = new THREE.Mesh(rigParts().box, M.wood); sill.scale.set(0.1, 0.08, 1.9); sill.position.set(pane.position.x, pane.position.y, yz); g.add(sill);
    }
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
// 遠い五艘の供船。乗員は共有する軽い形で表す。舳先は +z
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
  g.add(new THREE.Mesh(ATK.body, M.board));
  const deck = new THREE.Mesh(rigParts().box, M.wood); deck.scale.set(10.5, 0.18, 24); deck.position.set(0, 2.5, -1); g.add(deck);
  for (const sd of [-1, 1]) g.add(tateWall(sd * (ATK.hw - 0.05), -ATK.tateL / 2, sd * (ATK.hw - 0.05), ATK.tateL / 2 - 3, 2.5, 1.2, M));
  const y1 = new THREE.Mesh(ATK.yag, M.board); y1.position.set(0, 3.8, -4); g.add(y1);
  const r1 = hipRoof(7, 9.6, 1.4, M); r1.position.set(0, 5.0, -4); g.add(r1);
  const tw = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 3.2), M.plaster); tw.position.set(0, 6.6, -4); g.add(tw);
  const r2 = hipRoof(3.8, 4.2, 1.0, M); r2.position.set(0, 7.4, -4); g.add(r2);
  addOars(g, 0, ATK.hw, -9, 10, 10, 5.5);
  addSail(g, 5, 7, 5, 7.2, true); addWake(g, ATK.hw, 30);
  for (const sd of [-1, 1]) {
    g.add(tateWall(0, 19, sd * ATK.hw, 10, 2.5, 1.2, M));
  }
  // 自船と同じ三門を、西の舷へ。遠景でも筒を小さくせず、共有する形を使う。
  for (const z of [-8, 0, 8]) {
    const gun = taihou(M); gun.position.set(-5.4, 3.4, z); g.add(gun);
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
  const fl = new THREE.Mesh(KOB.flag, R.flagMat); g.userData.flag = fl; fl.position.set(0.32, 2.9, -3.8); fl.rotation.y = Math.PI / 2; g.add(fl);
  for (const m of g.children) m.castShadow = m.material !== RIG?.foamMat;
  return g;
}
let CREW = null;
function addCrew(g, y, count, wide = false) {
  if (!CREW) CREW = { body: new THREE.CylinderGeometry(0.22, 0.25, 1.15, 5), mat: new THREE.MeshStandardMaterial({ color: 0x393831, roughness: 1 }) };
  const mesh = new THREE.InstancedMesh(CREW.body, CREW.mat, count), D = rigParts().dummy;
  for (let i = 0; i < count; i++) {
    D.position.set((i % 2 ? 1 : -1) * (wide ? 3 : 0.6), y + 0.6, -3 + Math.floor(i / 2) * 1.5);
    D.rotation.set(0, 0, 0); D.scale.set(1, 1, 1); D.updateMatrix(); mesh.setMatrixAt(i, D.matrix);
  }
  g.add(mesh); g.userData.crew = mesh;
}

// 近い舟の乗員は準備時か出撃時に本物へ替える。同じ兵が舟と甲板を往復する。
function shipCrew(rt, b, team, count, wide = false, ranged = false) {
  const make = team ? enemyGroup : allyGroup;
  const list = ranged ? [{ type: 'gun', n: count / 4 }, { type: 'bow', n: count / 4 }, { type: 'ashigaru', n: count / 2, o: { spear: 'su' } }]
    : [{ type: 'ashigaru', n: count, o: { spear: 'su' } }];
  const g = make(rt, { name: team ? '舟の毛利勢' : '供船の兵', faction: team ? 'mori' : 'oda', fixed: true,
    fullStrength: true, noGuard: true, anchor: { x: b.x, z: b.z }, order: 'hold', width: 2, spacing: 0.8,
    seekRange: 90, aggro: 14, morale: 80 }, dress(list, team ? MORI : ODA));
  b.group = g; g.boat = b;
  for (let i = 0; i < g.units.length; i++) {
    const u = g.units[i]; u.shipBoat = b;
    u.shipLocal = { x: (i % 2 ? 1 : -1) * (wide ? 3 : 0.55), z: -3 + Math.floor(i / 2) * 1.25 };
    u.shipPost = { x: b.x, y: b.deckY, z: b.z }; u.shipHold = u.shipPost; u.perch = u.shipPost;
    // 乗り移る時も同じ入れ物を使う。毎コマの生成をしない。
    u.shipTransit = { active: false, start: 0, returning: false, x: 0, y: 0, z: 0 };
  }
  if (b.m.userData.crew) b.m.userData.crew.visible = false;
  syncShipCrew(rt, b);
  return g;
}
function syncShipCrew(rt, b) {
  if (!b.group) return;
  const sn = Math.sin(b.m.rotation.y), cs = Math.cos(b.m.rotation.y);
  b.group.anchor.x = b.exit && b.landed ? b.exit.x + (b.from === 's' ? 0 : 2) : b.x;
  b.group.anchor.z = b.exit && b.landed ? b.exit.z - (b.from === 's' ? 2 : 0) : b.z;
  b.group.fire = rt.flags.step >= 1 && !b.damageStage && !b.withdrawing && !rt.flags.ending;
  for (const u of b.group.units) {
    const tr = u.shipTransit;
    if (!u.alive || (!u.shipBoat && !tr?.active)) continue;
    const q = u.shipPost, local = u.shipLocal;
    const x = b.x + local.x * cs + local.z * sn, z = b.z - local.x * sn + local.z * cs;
    const y = b.deckY + b.m.position.y;
    if (tr.active) {
      const f = Math.min(1, (rt.t - tr.start) / 1.8);
      const tx = tr.returning ? x : b.exit.x, tz = tr.returning ? z : b.exit.z, ty = tr.returning ? y : DECK.y;
      q.x = tr.x + (tx - tr.x) * f; q.z = tr.z + (tz - tr.z) * f; q.y = tr.y + (ty - tr.y) * f;
      u.pos.set(q.x, q.y, q.z); u.mesh.position.copy(u.pos);
      if (f >= 1) { tr.active = false; if (tr.returning) u.shipBoat = b; else { u.shipBoat = null; u.shipPost = null; u.perch = null; } }
    } else { q.x = x; q.z = z; q.y = y; }
    if (u.shipPost) { u.perch = q; u.pos.set(q.x, q.y, q.z); u.mesh.position.copy(u.pos); u.moveTo = null; u.moving = tr.active ? 0.6 : 0; }
  }
}
function shipMove(b, dt, speed) {
  const dx = b.t.x - b.x, dz = b.t.z - b.z, d = Math.hypot(dx, dz);
  if (d < 0.7) return true;
  const turn = Math.atan2(Math.sin(Math.atan2(dx, dz) - b.m.rotation.y), Math.cos(Math.atan2(dx, dz) - b.m.rotation.y));
  b.m.rotation.y += Math.max(-dt * 0.35, Math.min(dt * 0.35, turn));
  const near = d < 6;
  const advance = Math.min(d, dt * speed) * (near ? 1 : Math.max(0, Math.cos(turn)));
  b.x += (near ? dx / d : Math.sin(b.m.rotation.y)) * advance; b.z += (near ? dz / d : Math.cos(b.m.rotation.y)) * advance;
  b.m.position.x = b.x; b.m.position.z = b.z;
  return false;
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
    h.pot.position.set(q.x + (h.fromX - q.x) * (1 - u), DECK.y + 0.3 + 12 * Math.sin(Math.PI * u), q.z + (h.fromZ - q.z) * (1 - u));
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
    GUNG = { barrel: new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14), band: new THREE.TorusGeometry(0.385, 0.045, 5, 14), bed: new THREE.BoxGeometry(2.6, 0.5, 1.1), cheek: new THREE.BoxGeometry(1.4, 0.7, 0.18), soot: new THREE.TorusGeometry(0.26, 0.09, 5, 14), fuse: new THREE.CylinderGeometry(0.025, 0.025, 0.25, 4) };
  }
  const g = new THREE.Group();
  const b = new THREE.Mesh(GUNG.barrel, M.copper); b.rotation.z = Math.PI / 2; g.add(b);
  for (const y of [-0.9, 0, 0.8]) { const r = new THREE.Mesh(GUNG.band, M.copper); r.rotation.y = Math.PI / 2; r.position.x = -y; g.add(r); }
  const soot = new THREE.Mesh(GUNG.soot, M.black); soot.rotation.y = Math.PI / 2; soot.position.x = -1.68; g.add(soot);
  const fuse = new THREE.Mesh(GUNG.fuse, M.dark); fuse.position.set(1.2, 0.4, 0); fuse.rotation.z = -0.3; g.add(fuse);
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
    ['kuki', '大将船', '九鬼嘉隆', 120, 1, 4, 'oda', 'oda', 0, { ships: 1, bind: 'kuki' }],
    ['yagosukeA', '一の手の供船', '弥五助', 120, 38, -42, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.0' }],
    ['yagosukeB', '一の手の供船', '弥五助の配下（名は不明）', 120, 76, -84, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.1' }],
    ['umanojoA', '二の手の将船', '右馬之丞', 120, -40, 56, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.2' }],
    ['umanojoB', '二の手の供船', '右馬之丞の配下（名は不明）', 120, -2, 98, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.3' }],
    ['umanojoC', '二の手の供船', '右馬之丞の配下（名は不明）', 120, 36, 140, 'oda', 'oda', 0, { ships: 1, bind: 'escorts.4' }],
  ], '九鬼御伝記の二手。九鬼の自船を含めた並びと兵数は推定、織田の旗は既存の代用'),
  rosterPlan('川口へ寄せる船団', 1, { x: -220, z: 150 }, Math.PI * 3 / 4, [
    ['front', '先手の関船・小早', '毛利・村上の将（名は不明）', 1200, -130, 65, 'mori', 'mori', 0, { ships: 150, bind: 'far.0' }],
    ['west', '西から包む手', '毛利・村上の将（名は不明）', 1200, -226, 35, 'mori', 'mori', 0, { ships: 150, bind: 'far.6' }],
    ['south', '南から包む手', '毛利・村上の将（名は不明）', 1200, -70, 149, 'mori', 'mori', 0, { ships: 150, bind: 'far.27' }],
    ['supply', '兵糧船と後備え', '毛利方の将（名は不明）', 1200, -226, 149, 'mori', 'mori', 0, { ships: 150, bind: 'far.33' }],
  ], '信長公記巻十一の六百余艘。各手の船数・兵数・将・家紋は不明、毛利の旗で代表する'),
];
const kizugawa = {
  jinkei: JIN,
  battleVoices: { lines: { enemy: {
    ambient: ['櫓をそろえよ。船べりへ寄せるぞ', '毛利の旗を見失うな', '鉤縄を掛けるぞ'],
    nanori: ['毛利の水軍ぞ！', '兵糧の道を開け！'],
  } } },
  noHorse: true,   // 海上の戦。騎馬の組も徒の槍に替え、乗馬の検査から外す
  spawn: { x: 3.8, z: -4, heading: -Math.PI / 2 },
  world: {
    seed: 15786,
    time: 'morning',
    fogFar: 360,
    muddy: 0,
    noticeRepeatGap: 30,
    height,
    blockedHint: () => '船べりで止まったら横へ進め。一歩内側へ戻り、屋形の前を回れ',
    playerVelocity(rt, vx, vz) {
      const u = rt.player.u, p = u.pos, q = rt.flags.deckVelocity;
      q.x = vx; q.z = vz;
      if (p.y > DECK.y + 0.5) return q;
      const goal = rt.missionGuide?.marker;
      const at = goal ? (typeof goal.pos === 'function' ? goal.pos() : goal.pos) : null;
      // 横へ滑れていても、前へ進めない理由をその場で知らせる。
      if ((Math.abs(p.x) > 4.5 && vx * p.x > 0 || Math.abs(p.z) > 11.8 && vz * p.z > 0) && !(rt.flags.railHintAt > rt.t)) {
        rt.flags.railHintAt = rt.t + 8;
        rt.hud.flash('船べりに当たった。横へ進め。一歩内側へ戻れば通れる', 'dim');
      }
      // 外向きに押し続けた時だけ、欄干に沿って通り道へすべらせる。
      if (Math.abs(p.x) > 4.5 && vx * p.x > 0) {
        q.x = -Math.sign(p.x) * Math.min(Math.abs(vx), 0.8);
        if (Math.abs(vz) < 0.2) q.z = Math.sign((at?.z ?? 0) - p.z || 1) * Math.abs(vx) * 0.65;
      }
      if (Math.abs(p.z) > 11.8 && vz * p.z > 0) {
        q.z = -Math.sign(p.z) * Math.min(Math.abs(vz), 0.8);
        if (Math.abs(vx) < 0.2) q.x = Math.sign((at?.x ?? 3.8) - p.x || 1) * Math.abs(vz) * 0.65;
      }
      return q;
    },
    clear: () => true,
    trees: 0,
    tufts: 0,
    // 甲板の地面は木の色、甲板の縁から海の底へ落ちる所は鉄の舷の色（前は芝の色のまま、船の縁から緑の崖がはみ出して見えた）
    tint(x, z, h, c) { if (h > DECK.y - 0.05) c.setRGB(0.37, 0.3, 0.23); else c.setRGB(0.15, 0.145, 0.13); },
    // 逃げる兵も自分が乗って来た舟へ戻る。海へ出た瞬間の退場をしない。
    fleeOut: () => false,
    guideWay(u, want) { return u.pos.y > DECK.y + 0.5 ? want : deckWay(u, want); },
    moveWay(army, u, want) {
      if (u.shipPost) return u.shipPost;
      if (u.fleeing && u.group?.boat?.exit) return u.group.boat.exit;
      return deckWay(u, want);
    },
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { ships: 'HIST_A', atakebune: 'HIST_B', supply: 'HIST_A', deckFight: 'GAME_C', bay: 'HIST_B', windTide: 'GAME_C', flooding: 'GAME_C' };
    F.noticeTimes = Object.create(null); F.nextBoardAt = 0;
    // この戦だけ、同じ供船への使番は最初の一度にする。
    const bark = rt.bark.bind(rt);
    rt.bark = (text, warn) => {
      if (text === '使番が供船の兵へ走った') {
        if (F.escortRunnerSeen) return;
        F.escortRunnerSeen = true;
      }
      bark(text, warn);
    };
    rt.onFlankHit = (g) => {
      if (g.flankAwarded) return;
      const hits = Math.min(6, g.flankHits);
      if (hits <= (F.flankHintHits || 0) || hits !== 1 && hits !== 3 && hits !== 6) return;
      F.flankHintHits = hits;
      rt.bark(`横槍の手柄：同じ隊へ横から${hits}回命中。六回で達成`);
    };
    F.small = []; F.boarders = []; F.seaShips = []; F.deckVelocity = { x: 0, z: 0 };
    // 海に共通の遠景処理が陸戦の兵を立てないよう、この戦の水面を伝える。
    W.inWaterAt = (x, z) => W.heightAt(x, z) < 0;
    W.def.fleeWay = (army, u, goal) => u.group?.boat?.alive && u.group.boat.exit ? u.group.boat.exit : goal;
    F.step = 0; F.ek = 0; F.ak = 0; F.deckRepelled = 0; F.sunk = 0; F.doused = 0; F.supplyPassed = 0; F.supplyStopped = 0; F.cannonHits = 0;
    // 船の上では馬に乗らない
    const P = rt.player;
    if (P.mounted) { rt.army.setMounted(P.u, false); P.mounted = false; }
    P.canRide = false; P.u.pos.y = DECK.y;
    // ---- 海（world の川面は岸の線で歩ける所を切るので使わず、ここで海の面だけを張る） ----
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000, 64, 64), new THREE.MeshBasicMaterial({ map: shipTex().sea, color: 0xc0d5d7 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = 0; sea.receiveShadow = true;
    rt.scene.add(sea);
    F.sea = sea; F.waveAt = -1;
    // 波がしらと舷の飛沫は一つの描画にまとめ、準備した形を使い回す。
    const foam = new THREE.InstancedMesh(rigParts().foam, new THREE.MeshBasicMaterial({ map: rigParts().foamMat.map, color: 0xc5e1df, transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide }), 84);
    foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage); foam.frustumCulled = false;
    F.foam = foam; rt.scene.add(foam);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5), new THREE.MeshBasicMaterial({ color: 0xffcc66 }));
    const splash = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshBasicMaterial({ color: 0xc5e1df }));
    flash.visible = splash.visible = false; rt.scene.add(flash, splash);
    F.salvo = { flash, splash, at: -100, next: 12, shot: 0, muzzle: { x: 0, y: 0, z: 0 }, hit: { x: 0, y: 0, z: 0 } };
    prepareHouroku(rt);
    // 船の上に草は生えない（足もとの草の群れを隠す）
    if (W.nearGrass) W.nearGrass.visible = false;
    // 自船と、三艘ずつ二手をなす五艘の供船（並びは推定）。船を板で繋がない。
    F.deckShip = hull(W, 0, DECK.z0, DECK.z1, 11, true); addWake(F.deckShip, 5.5, 26); rt.scene.add(F.deckShip);
    addDeck({ ...DECK, name: '大船の甲板' });
    // 見える船べりで止める。接舷口の低い留めだけは、小舟が着くと開けて乗り込みを通す。
    const rail = (ax, az, bx, bz) => { const s = solidSeg(ax, az, bx, bz, 0.12); s.yBot = DECK.y - 0.2; s.yTop = DECK.y + 1.25; return s; };
    rail(DECK.x1, DECK.z0, DECK.x1, DECK.z1);
    rail(DECK.x0, DECK.z0, DECK.x1, DECK.z0);
    rail(DECK.x0, DECK.z1, -1.1, DECK.z1); rail(1.1, DECK.z1, DECK.x1, DECK.z1);
    let railZ = DECK.z0;
    F.shipMouths = [];
    for (const c of CANNONS) {
      rail(DECK.x0, railZ, DECK.x0, c.z - 1.1); railZ = c.z + 1.1;
      const s = rail(DECK.x0, c.z - 1.1, DECK.x0, c.z + 1.1);
      s.struct = { alive: true, opened: false };
      F.shipMouths.push({ from: 'w', z: c.z, solid: s });
    }
    rail(DECK.x0, railZ, DECK.x0, DECK.z1);
    const stern = rail(-1.1, DECK.z1, 1.1, DECK.z1); stern.struct = { alive: true, opened: false };
    F.shipMouths.push({ from: 's', z: DECK.z1, solid: stern });
    // ---- 東の大坂の岸。川口の両岸を分け、丘は北の上町台地へ寄せる（細部は推定） ----
    { const coast = new THREE.MeshStandardMaterial({ color: 0x3a4838, roughness: 1 });
      const bank = new THREE.BoxGeometry(60, 5, 276);
      for (const z of [-182, 182]) { const shore = new THREE.Mesh(bank, coast); shore.position.set(430, 1.5, z); rt.scene.add(shore); }
      const hill = new THREE.ConeGeometry(44, 26, 7), hillMat = new THREE.MeshStandardMaterial({ color: 0x31402f, roughness: 1 });
      for (let i = 0; i < 3; i++) { const h = new THREE.Mesh(hill, hillMat); h.position.set(480, 8, -240 + i * 70); rt.scene.add(h); }
       }
    // ---- 供の大安宅船（自船と合わせて九鬼の大船六艘。形と動きだけの軽い船） ----
    F.escorts = [[38, -42], [76, -84], [-40, 56], [-2, 98], [36, 140]].map(([x, z]) => {
      const m = atakeLite(W); addCrew(m, 2.5, 12, true); m.position.set(x, 0, z); m.rotation.y = -Math.PI / 4; rt.scene.add(m);
      const flag = nobori(W, x, z, 'oda', 7); flag.position.set(0, 2.6, 0); m.add(flag);
      return { m, x, z, homeX: x, homeZ: z, deckY: 2.5, alive: true, t: { x, z }, sortie: false };
    });
    for (const [x, z] of [[0, 11], [4, -10]]) { const n = nobori(W, x, z, 'oda', 7); rt.scene.add(n); }
    rt.scene.add(tawara(W, 3, 9, 0.2, 2));
    // 大筒（西の舷）
    F.guns = CANNONS.map((c) => {
      const m = taihou(shipMats());
      m.scale.setScalar(0.75); m.position.set(c.x - 0.8, DECK.y + 0.72, c.z);
      rt.scene.add(m);
      return { ...c, m, cd: 0 };
    });
    // ---- 九鬼嘉隆の手（自分の持ち場）と、鉄砲衆 ----
    F.kuki = allyGroup(rt, { name: '九鬼嘉隆の手', fixed: true, fullStrength: true, anchor: { x: 1, z: 4 }, facing: Math.PI, formation: 'ring', spacing: 1, aggro: 4 },
      dress([{ type: 'samurai', n: 1, o: { name: '九鬼嘉隆', invuln: true, keepInvuln: true, horse: false, hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], ODA));
    F.kukiU = F.kuki.units[0];
    F.teppo = allyGroup(rt, { name: '船の鉄砲衆', fixed: true, fullStrength: true, anchor: { x: -4, z: -1 }, facing: -Math.PI / 2, formation: 'line', ranks: 1, width: 15, spacing: 1.1, aggro: 16 },
      dress([{ type: 'samurai', n: 1 }, { type: 'gun', n: 14 }], ODA));
    F.teppo.ranks = 1;
    F.oda = [F.kuki, F.teppo];
    for (const g of F.oda) for (const u of g.units) { const q = deckWay(u, u.pos); u.pos.set(q.x, DECK.y, q.z); }
    F.kukiU.pos.set(1, DECK.y, 4); F.kukiU.shipPost = { x: 1, z: 4 }; F.kukiU.allyOk = true;
    // 大将は屋形の手前で下知を出し、槍の守りが前、鉄砲衆が西の舷。
    F.deckLost = 0; F.fireDanger = 0;
    const n = RANKS[rt.G.rank].squad;
    if (n) {
      rt.makeSquad({ x: 2, z: 0 }, 0, [{ kind: 'spear', n: Math.min(n, 15) }]);
      for (const g of rt.squadGroups) {
        g.formation = 'column'; g.colW = 3; g.width = 3; g.spacing = 0.8;
        for (const u of g.units) { const q = deckWay(u, g.slotPos(u.slot, g.initial)); u.pos.set(q.x, DECK.y, q.z); }
      }
    }
    // ---- 遠くの毛利の船団（小早を並べた影） ----
    F.boats = [];
    F.far = [];
    for (let i = 0; i < 36; i++) {
      const b = i % 6 === 0 ? sekibune(true) : kobaya();
      // 小早の先手は既に包囲へ寄せている。大将船だけは後ろで待つ。
      // 先頭の小早は既に西の舷へ寄せている。大筒を待つ間にも槍で乗り込みを防げる。
      const vanguard = i >= 3 && i <= 9 && i % 6 !== 0;
      b.position.set(i === 0 ? -85 : vanguard ? -28 - (i > 6 ? 14 : 0) : -70 - (i % 9) * 26, 0, i === 0 ? 26 : vanguard ? (i % 3 - 1) * 10 : 35 + Math.floor(i / 9) * 38);
      b.rotation.y = Math.PI * 3 / 4;
      rt.scene.add(b);
      addCrew(b, i % 6 === 0 ? 1.3 : 0.65, 8);
      F.far.push(b);
    }
    for (const e of F.escorts) { shipCrew(rt, e, 0, 12, true, true); F.seaShips.push(e); }
    for (let i = 0; i < 2; i++) {
      const m = F.far[1 + i]; m.userData.departed = true;
      const b = { m, x: m.position.x, z: m.position.z, t: { x: -45 - i * 15, z: -28 + i * 64 },
        alive: true, ranged: true, deckY: 0.65, landed: false };
      b.x = -52 - i * 12; b.z = -16 + i * 36; m.position.set(b.x, 0, b.z);
      shipCrew(rt, b, 1, 8, false, true); F.boats.push(b); F.seaShips.push(b);
      const e = F.escorts[2 + i], small = kobaya();
      // 小型供船の数と位置は補完。六艘の大安宅船には含めない。
      const R = rigParts();
      if (!R.odaFlagMat) R.odaFlagMat = new THREE.MeshStandardMaterial({ map: flagTexture('oda'), side: THREE.DoubleSide, roughness: 0.9 });
      small.userData.flag.material = R.odaFlagMat;
      small.position.set(e.x - 18, 0, e.z + 24); small.rotation.y = -Math.PI / 4; rt.scene.add(small);
      const a = { m: small, x: small.position.x, z: small.position.z, homeX: small.position.x, homeZ: small.position.z,
        t: { x: small.position.x, z: small.position.z }, deckY: 0.65, alive: true, support: true };
      shipCrew(rt, a, 0, 8, false, true); F.seaShips.push(a);
    }
    // 六百余艘のうち六百艘を表す。遠い船は一つにまとめ、兵の判断を動かさない。
    F.distantFleet = new THREE.Group();
    const R = rigParts(), M = shipMats(), D = R.dummy;
    const distant = new THREE.InstancedMesh(KOB.body, M.board, 564);
    const crews = new THREE.InstancedMesh(CREW.body, CREW.mat, 564 * 8);
    const flags = new THREE.InstancedMesh(KOB.flag, R.flagMat, 564);
    const poles = new THREE.InstancedMesh(KOB.mast, M.dark, 564);
    const angle = Math.PI * 3 / 4, sn = Math.sin(angle), cs = Math.cos(angle);
    for (let i = 0; i < 564; i++) {
      // 先手は霧の手前へ。船団の奥まで同じ形・材質を使い、兵の判断は動かさない。
      const x = -130 - (i % 24) * 18, z = 115 + Math.floor(i / 24) * 20;
      D.position.set(x, 0, z);
      D.rotation.set(0, angle, 0); D.scale.set(1, 1, 1); D.updateMatrix(); distant.setMatrixAt(i, D.matrix);
      for (let j = 0; j < 8; j++) {
        const lx = (j % 2 ? 1 : -1) * 0.6, lz = -3 + Math.floor(j / 2) * 1.5;
        D.position.set(x + lx * cs + lz * sn, 1.25, z - lx * sn + lz * cs);
        D.updateMatrix(); crews.setMatrixAt(i * 8 + j, D.matrix);
      }
      D.position.set(x - 3.8 * sn, 2.3, z - 3.8 * cs);
      D.updateMatrix(); poles.setMatrixAt(i, D.matrix);
      D.position.set(x + 0.32 * cs - 3.8 * sn, 2.9, z - 0.32 * sn - 3.8 * cs);
      D.rotation.y = angle + Math.PI / 2; D.updateMatrix(); flags.setMatrixAt(i, D.matrix);
    }
    F.distantFleet.add(distant, crews, flags, poles); rt.scene.add(F.distantFleet);
    // 石山と堺を数百メートルの中に並べた箱の町は外す。
    // 古い河道・町の位置を確定できる資料が揃うまで、縮めた代用品で補わない。
    // 堺沖の別の織田船団。三艘の影は所在を示すだけで、史料の船数や九鬼の六艘には数えない。
    // 関船の形・旗を共有し、戦う兵や毎コマの処理を増やさない。船の寸法も縮めない。
    { const R = rigParts(), D = R.dummy;
      const ships = new THREE.InstancedMesh(SEK, shipMats().board, 3);
      const flags = new THREE.InstancedMesh(R.flagGeo, new THREE.MeshStandardMaterial({ map: flagTexture('oda'), side: THREE.DoubleSide, roughness: 0.9 }), 3);
      const poles = new THREE.InstancedMesh(R.pole, shipMats().dark, 3);
      for (let i = 0; i < 3; i++) {
        D.position.set(120 + i * 24, 0, 260 + i * 32); D.rotation.set(0, -Math.PI / 4, 0); D.scale.set(1, 1, 1); D.updateMatrix(); ships.setMatrixAt(i, D.matrix);
        D.position.y = 4.3; D.updateMatrix(); flags.setMatrixAt(i, D.matrix);
        D.position.y = 2.25; D.scale.y = 4.5; D.updateMatrix(); poles.setMatrixAt(i, D.matrix);
      }
      rt.scene.add(ships, flags, poles);
    }

    // 十六世紀の大坂湾：浅い水域と砂州、淀川・大和川の河口の濁り（今の埋立地や港の岸壁は無い）
    const shoal = new THREE.MeshStandardMaterial({ color: 0x6a7a72, roughness: 0.4, transparent: true, opacity: 0.55 });
    const sand = new THREE.MeshStandardMaterial({ color: 0x9a9070, roughness: 1 });
    const silt = new THREE.MeshStandardMaterial({ color: 0x6e6a52, roughness: 0.6, transparent: true, opacity: 0.6 });
    for (const [x, z, r] of [[170, -20, 70], [200, 80, 60]]) { const sh = new THREE.Mesh(new THREE.CircleGeometry(r, 20), shoal); sh.rotation.x = -Math.PI / 2; sh.position.set(x, 0.05, z); rt.scene.add(sh); }
    for (const [x, z, r] of [[150, -60, 14], [185, 40, 10]]) { const sb = new THREE.Mesh(new THREE.CircleGeometry(r, 14), sand); sb.rotation.x = -Math.PI / 2; sb.position.set(x, 0.12, z); rt.scene.add(sb); }
    { const sl = new THREE.Mesh(new THREE.CircleGeometry(90, 20), silt); sl.rotation.x = -Math.PI / 2; sl.position.set(240, 0.08, -70); rt.scene.add(sl); }
    F.noticeAt = 0;
    // 艫の先手は準備時から見せる。二十四メートルを十六秒で寄せ、
    // 鉤縄の二秒と乗り移りの一・八秒を経て、開戦二十秒までに斬り合う。
    const first = this.launch(rt, 's');
    if (first) {
      first.approach = null; first.t = first.dock; first.sp = 1.5;
      first.x = 0; first.z = DECK.z1 + 30;
      first.m.position.set(first.x, 0, first.z); first.m.rotation.y = Math.PI;
      syncShipCrew(rt, first);
    }
    rt.world.setTime('morning');
    rt.setPhase('brief'); rt.objProgress('main', '');
    rt.obj('main', HI(rt) ? '西の大筒へ。鉄砲衆を預かれ' : '西の大筒で敵船を迎えよ', 'main');
    rt.say('九鬼嘉隆', `${nm(rt)}、西国の船は六百余艘じゃ。こちらは大船六艘。川口を守れ`, 5);
    rt.say('九鬼嘉隆', '大筒の衆は西の舷につけ。槍の衆は屋形を固めよ', 4);
    rt.marker('kuki', unitPos(F.kukiU), '九鬼嘉隆', {});
    rt.after(9, () => this.cannons(rt));
  },

  // 小早を一艘出す（南西から、甲板の西と南の縁へ向かう）
  launch(rt, from) {
    const F = rt.flags;
    // 一番近い小早から寄せる。遠い配列順では最初の接舷が遅れる。
    let m = null, nearest = Infinity;
    for (let i = 0; i < F.far.length; i++) {
      const ship = F.far[i];
      if (i % 6 === 0 || ship.userData.departed) continue;
      const d = Math.hypot(ship.position.x - DECK.x0, ship.position.z);
      if (d < nearest) { nearest = d; m = ship; }
    }
    if (!m || F.ending || F.step > 4 || F.bigSunk) return null;
    let real = 0; for (const u of rt.army.units) if (u.alive) real++;
    // 荷駄船二艘と大将船の乗員二十四人分を先に空け、総数二百人以内に保つ。
    if (real + 8 > 176) return null;
    let dockZ = null;
    for (const z of (from === 's' ? [0] : [-8, 0, 8])) {
      if (!F.boats.some((b) => b.alive && !b.damageStage && !b.withdrawing && !b.big && !b.supply && !b.ranged && b.from === from && (from === 's' || b.exit.z === z))) { dockZ = z; break; }
    }
    if (dockZ === null) return null;
    m.userData.departed = true;
    const s = { x: m.position.x, z: m.position.z };
    const t = from === 's' ? { x: 0, z: DECK.z1 + 6 } : { x: DECK.x0 - 6, z: dockZ };
    const exit = { x: from === 's' ? t.x : DECK.x0 + 0.7, z: from === 's' ? DECK.z1 - 0.7 : t.z };
    const b = { m, x: s.x, z: s.z, t, exit, alive: true, landed: false, from, sp: 3.5, deckY: 0.65, remaining: 8, nextBoard: 0, approach: from === 's' ? { x: -25, z: 24 } : null };
    if (b.approach) { b.dock = t; b.t = b.approach; }
    b.m.rotation.y = Math.atan2(b.t.x - b.x, b.t.z - b.z);
    shipCrew(rt, b, 1, 8); F.small.push(b.group); F.seaShips.push(b);
    F.boats.push(b);
    return b;
  },

  // 毛利の荷駄船（石山本願寺へ兵糧を運ぶ）：西から来て、織田船団の脇を通り東（石山の方）へ抜けようとする
  launchSupply(rt) {
    const F = rt.flags;
    // 近い関船から寄せ、消火に移る前に二艘とも大筒で狙えるようにする。
    let m = null, nearest = Infinity;
    for (let i = 6; i < F.far.length; i += 6) {
      const ship = F.far[i];
      if (ship.userData.departed) continue;
      const d = Math.hypot(ship.position.x + 70, ship.position.z);
      if (d < nearest) { nearest = d; m = ship; }
    }
    if (!m || F.ending) return null;
    m.userData.departed = true;
    if (!SUPPLY_BALE) { SUPPLY_BALE = new THREE.CylinderGeometry(0.5, 0.5, 1.1, 8); SUPPLY_MAT = new THREE.MeshStandardMaterial({ color: 0xc9a66b, roughness: 0.9 }); }
    for (let i = 0; i < 3; i++) { const tw = new THREE.Mesh(SUPPLY_BALE, SUPPLY_MAT); tw.rotation.z = Math.PI / 2; tw.position.set(-0.7 + i * 0.7, 0.9, -1.5 + i * 1.4); m.add(tw); }
    const s = { x: m.position.x, z: m.position.z };
    const t = { x: -70, z: 0 };
    m.position.set(s.x, 0, s.z);
    rt.scene.add(m);
    const b = { m, x: s.x, z: s.z, t, alive: true, landed: false, supply: true, deckY: 1.3, sp: 3.2, approach: t, dock: { x: 230, z: -35 } };
    shipCrew(rt, b, 1, 8); F.seaShips.push(b);
    F.boats.push(b);
    return b;
  },

  // ① 大筒を撃つ
  cannons(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('cannon'); rt.objProgress('main', '');
    rt.unmark('kuki');
    sfx('horagai', 0.9);
    rt.banner('毛利の船団', '南西から来た船が、両脇へ広がる');
    rt.obj('main', HI(rt) ? '鉄砲衆を率い、西の大筒で敵船を払え' : '西の大筒で寄せる船を払え', 'main');
    rt.obj('supply', '俵を積んだ兵糧船二艘を止めよ', 'side');
    for (let i = 0; i < 3; i++) {
      const c = F.guns[i];
      rt.marker('g' + i, { x: c.x, z: c.z }, () => rt.t < c.cd ? '弾込め中' : c.aimHint || '大筒・船を待て', { h: 2 });
      rt.addInteract('g' + i, { x: c.x + 1.6, z: c.z }, '大筒を撃つ', () => this.fire(rt, i), { r: 2.6, hold: 1.2 });
    }
    this.launch(rt, 'w'); rt.after(14, () => { if (F.step < 4 && !F.ending) this.launch(rt, 'w'); }); rt.after(28, () => { if (F.step < 4 && !F.ending) this.launch(rt, 's'); });
    rt.say('砲手', '横腹を狙え！　弾を込めるぞ、身を低くせい！', 4);
    F.nextBoat = rt.t + 42;
    this.launchSupply(rt);
    rt.after(24, () => { if (!F.ending && F.step <= 3) this.launchSupply(rt); });
  },
  fire(rt, i) {
    const F = rt.flags;
    const c = F.guns[i];
    if (F.step === 2 || F.step === 3) { rt.bark('今は甲板の持ち場を守れ'); return; }
    if (F.ending || rt.over || !rt.player.u.alive || (F.step !== 1 && F.step !== 4)) return;
    if (rt.t < c.cd) { rt.bark('弾込め中'); return; }
    // 狙い札と同じ射界で、近い船から狙う。
    const best = cannonTarget(F, c);
    let bd;
    if (!best) { rt.bark(F.step === 4 ? '西へ寄る大船を待て。横腹を狙え' : '筒先に敵船が見えぬ。寄るのを待て'); return; }
    bd = Math.hypot(best.x - c.x, best.z - c.z);
    const word = aimWord(best, c);
    if (noticeReady(rt, word)) rt.say('砲手', word, 2.5);
    c.cd = rt.t + 30;
    rt.army.play('volley', { x: c.x, z: c.z }, 1.6);
    rt.army.smoke(c.x - 2, DECK.y + 1.2, c.z, -1, 0, 2.5);
    // 命中も限られる：遠いほど外れやすい（大きな弾は狙いを付け直しにくい）
    bd = Math.hypot(best.x - c.x, best.z - c.z);
    const missChance = bd <= 40 && broadside(best, c) >= 0.4 ? 0 : Math.max(0.05, Math.min(0.55, (bd - 15) / 110 + (1 - broadside(best, c)) * 0.1));
    if (Math.random() < missChance) { rt.army.smoke(best.x + 5, 0.4, best.z + 4, 0, 0, 2.2); rt.army.play('wood', { x: best.x + 5, z: best.z + 4 }, 0.8); rt.bark('弾が海へ落ちた！'); return; }
    rt.after(0.6, () => {
      if (!best.alive || F.ending) return;
      F.cannonHits++;
      // 大将船への命中を合図に、ほかの大船も一斉に放つ。
      if (best.big) { this.breakFlagship(rt, true); return; }
      best.damageStage = 1; best.hitAt = rt.t; best.leak = true; best.rudderLost = true;
      if (best.supply) {
        rt.army.smoke(best.x, 1, best.z, 0, 0, 3);
        rt.army.play('wood', { x: best.x, z: best.z }, 1.2);
        best.stopping = true;
        rt.bark('兵糧船に命中！　止まるまで見届けよ', true);
        return;
      }
      rt.army.smoke(best.x, 1, best.z, 0, 0, 3);
      rt.army.play('wood', { x: best.x, z: best.z }, 1.2);
      best.stopped = true;
      F.sunk++;
      rt.award((t) => { t.special = { label: '大筒で小早を打ち払った', pts: 3 * Math.min(6, F.sunk) }; }, noticeReady(rt, '小早を打ち払った') ? '小早を打ち払った' : null);
      if (F.step === 1) rt.objProgress('main', '小舟を打ち払った。次の船を迎えよ');
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
    rt.banner('焙烙火矢', '焙烙が甲板で割れ、火が広がる');
    rt.obj('main', '水桶を取り、甲板の火を消せ', 'main');
    F.water = false;
    for (let i = 0; i < 4; i++) {
      const q = WATER[i];
      rt.marker('water' + i, q, '水桶', { guidePriority: () => F.water ? -200 : 150, guideNearest: true, alwaysDistance: true, guideAlways: true });
      rt.addInteract('water' + i, q, '水桶を取る', () => { if (F.step === 2 && !F.ending && !rt.over && rt.player.u.alive && !F.water) { F.water = true; rt.obj('main', '甲板の火へ水を掛けよ', 'main'); rt.bark('桶の水を火へ掛けよ'); } }, { r: 2.2, hold: 1 });
    }
    rt.say('九鬼嘉隆', '水夫ども、水を掛けよ！　屋形へ火を回すな！', 4);
    battleEvent(rt, EVENT_FIRE_START, { x: -2, z: -8 }, null, 1, true, '甲板に火が上がった');
    F.fl = [{ x: -2, z: -8 }, { x: 2, z: -2 }, { x: -3.8, z: 7 }].map((q, i) => {
      const h = F.houroku[i]; h.start = rt.t;
      const source = F.boats.find((b) => b.alive && b.landed && !b.big && !b.supply && !b.ranged);
      h.fromX = source?.x ?? DECK.x0 - 6; h.fromZ = source?.z ?? q.z;
      const fire = { ...q, f: null };
      rt.after(1.2, () => { if (!fire.doused && !F.ending && !rt.over) fire.f = rt.world.addFire(q.x, q.z, { h: 0.3, size: 1.5 }); });
      rt.marker('f' + i, q, '火を消す', { h: 2, guidePriority: () => F.water ? 150 : -200, guideNearest: true, alwaysDistance: true, guideAlways: true });
      rt.addInteract('f' + i, q, '水を掛けて火を消す', () => this.douse(rt, i), { r: 2.8, hold: 1.6 });
      return fire;
    });
  },
  douse(rt, i) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive || F.step !== 2 || !F.fl[i] || F.fl[i].doused || rt.t - F.houroku[i].start < 1.2) return;
    if (!F.water) { rt.bark('船べりの水桶を取れ'); return; }
    F.water = false;
    F.fl[i].doused = true;
    F.houroku[i].dousedAt = rt.t;
    rt.uninteract('f' + i); rt.unmark('f' + i);
    rt.world.removeFire(F.fl[i].f);
    F.doused++;
    if (F.doused < 3) rt.obj('main', '水桶を取り、残る火を消せ', 'main');
    rt.award((t) => { if (!t.side.includes('焙烙の火を消した')) t.side.push('焙烙の火を消した'); }, '火を消した');
    rt.objProgress('main', F.doused < 3 ? '水桶を取り、残る火へ掛けよ' : '火は消えた。南の船べりを守れ');
    if (F.doused >= 3) { rt.obj('main', '南の船べりで敵を防げ', 'main'); rt.marker('guard', { x: 0, z: 10 }, '南の持ち場'); }
  },

  // 大将の船と思われる大船（主と細かな姿は特定しない）
  launchBig(rt) {
    const F = rt.flags;
    const m = F.far[0];
    if (!m || m.userData.departed) return null;
    m.userData.departed = true;
    const s = { x: m.position.x, z: m.position.z }, t = { x: DECK.x0 - 28, z: 0 };
    m.position.set(s.x, 0, s.z);
    rt.scene.add(m);
    const b = { m, x: s.x, z: s.z, t, alive: true, landed: false, from: 'w', big: true, deckY: 1.3 };
    F.boats.push(b);
    shipCrew(rt, b, 1, 8, false, true); F.seaShips.push(b);
    F.big = b;
    return b;
  },

  // ③ 乗り移ってきた毛利勢
  board(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t; F.boardRepelledStart = F.deckRepelled;
    rt.setPhase('board'); rt.objProgress('main', '');
    rt.objDone('main'); rt.unmark('guard');
    for (let i = 0; i < 3; i++) { rt.uninteract('f' + i); rt.unmark('f' + i); }
    for (let i = 0; i < 4; i++) { rt.uninteract('water' + i); rt.unmark('water' + i); }
    rt.banner('船べりを守れ', '寄せる小早が、鉤縄を掛けようとしている');
    rt.obj('main', HI(rt) ? '組を南と西へ寄せ、乗り口を守れ' : '南と西の乗り口を守れ', 'main');
    rt.say('九鬼嘉隆', '槍の衆、押し返せ！　屋形へ一人も通すな！', 3);
    rt.marker('guard', { x: 0, z: 10 }, '南の持ち場');
    // 新手は既に沖にいる小早が接舷してから上がる。
    this.launch(rt, 'w'); this.launch(rt, 's');
    rt.after(38, () => { if (!F.ending && F.step === 3) { this.launch(rt, 'w'); this.launch(rt, 's'); } });
  },

  // 史実の決め手。大将の船と思われる一艘を近くへ寄せる。
  decisive(rt) {
    const F = rt.flags;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('flagship'); rt.objProgress('main', ''); rt.objDone('main'); rt.unmark('guard');
    for (let k = 1; k <= 4; k++) rt.unmark('b' + k);
    if (!this.launchBig(rt)) { this.lose(rt, '敵の大船を見失った。持ち場を立て直せ！'); return; }
    rt.banner('敵の大船を引き付けよ', '遠いうちは撃たず、西の大筒で待つ');
    rt.obj('main', '西の大筒で近い大船の横腹を撃て', 'main');
    rt.say('九鬼嘉隆', 'あれは大将の船と見えるぞ。間近へ寄せ、横腹を撃て！', 4);
    rt.marker('big', () => F.big.m.position, '狙う大船', { red: true, h: 6 });
    const c = F.guns[1];
    rt.marker('g1', CANNONS[1], () => rt.t < c.cd ? '弾込め中' : c.aimHint || '西の大筒・船を待て', { h: 2 });
    rt.addInteract('g1', { x: c.x + 1.6, z: c.z }, '大筒を撃つ', () => this.fire(rt, 1), { r: 2.6, hold: 1.2 });
  },
  breakFlagship(rt, playerShot) {
    const F = rt.flags;
    if (F.bigSunk || !F.big) return;
    F.bigSunk = true; F.big.damageStage = 1; F.big.hitAt = rt.t; F.big.leak = true; F.big.rudderLost = true; F.big.stopped = true;
    rt.unmark('big'); rt.unmark('g1'); rt.uninteract('g1'); rt.objDone('main');
    rt.obj('main', '甲板を守り、退く船を見張れ', 'main');
    rt.banner('大鉄砲の轟き', '敵の大船が崩れ、周りの小舟が止まる');
    rt.say('九鬼嘉隆', '大船が崩れたぞ！　まだ寄せる小舟を打ち払え！', 4);
    for (const c of F.guns) rt.army.smoke(c.x - 2, DECK.y + 1.2, c.z, -1, 0, 2.5);
    for (const e of F.escorts) {
      const dx = F.big.x - e.x, dz = F.big.z - e.z, d = Math.hypot(dx, dz) || 1;
      rt.army.smoke(e.x + dx / d * 5, 3, e.z + dz / d * 5, dx / d, dz / d, 2.5);
    }
    rt.army.play('volley', CANNONS[1], 1.6);
    rt.army.smoke(F.big.x, 2, F.big.z, 0, 0, 3);
    battleEvent(rt, EVENT_VOLLEY, CANNONS[1], F.teppo, 0, true, '大船の大鉄砲が火を吹く');
    battleEvent(rt, EVENT_UNIT_BREAK, F.big, null, 1, true, '敵の大船が崩れ、船団がひるむ');
    // 既存の士気処理へ渡す。討ち取りや作りの一騎打ちにはしない。
    for (const groups of [F.boarders, F.small]) for (const g of groups || []) {
      // 大船に近く、遮られずに崩壊を見た隊から動揺する。甲板の敵を一律に敗走させない。
      const c = g.center(), b = F.big;
      if (Math.hypot(c.x - b.x, c.z - b.z) < 75 && !rt.army.wallBetween(c, -1, b)) { g.flagshipHeard = true; g.morale = Math.max(0, g.morale - 20); }
    }
    F.flagshipHitAt = rt.t;
    if (playerShot) rt.award((t) => t.side.push('引き付けた敵の大船に大鉄砲を当てた'), '敵の大船を打ち崩した');
    for (const b of F.boats) if (b.alive && (!b.supply || !b.passed && !b.damageStage)) {
      // 乗り込みの兵が戻るまでは接舷した舟を動かさない。
      b.remaining = 0;
      if (b.group) b.group.reserveCount = 0;
      b.withdrawing = true;
      if (b.supply) { b.approach = null; b.landed = false; b.t.x = -350; b.t.z = 220; continue; }
      if (!b.group || !b.group.units.some((u) => u.alive && (!u.shipBoat || u.shipTransit?.active))) { b.landed = false; b.t.x = -350; b.t.z = 220; }
    }
  },
  retreat(rt) {
    const F = rt.flags;
    F.step = 5; F.stepT = rt.t;
    rt.setPhase('withdraw'); rt.objProgress('main', ''); rt.objDone('main');
    for (let i = 0; i < 3; i++) { rt.uninteract('g' + i); rt.unmark('g' + i); }
    rt.banner('船団が離れ始めた', '船べりを守り、残る敵を退けよ');
    rt.obj('main', '甲板を守れ。残る敵を退けよ', 'main');
    rt.say('九鬼嘉隆', '深追い無用じゃ。甲板を固めよ。物見は兵糧船を見張れ', 4);
    battleEvent(rt, EVENT_RETREAT, CANNONS[1], null, 1, true, '毛利の船団が大船から離れる');
    rt.world.setTime('day');
    // 戦闘中に寄せた荷駄船の動きを引き続き見張る。新しい船を勝手に沈めない。
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
    if (F.supplyStopped === 2 && !F.supplyPassed) rt.objDone('supply'); else rt.objFail('supply');
    rt.tracker.main = true;
    const passed = F.supplyPassed || 0;
    rt.award((t) => { t.main = true; t.special = { label: '九鬼の船の持ち場を守り、寄せる敵船を退けた', pts: Math.max(6, 20 - passed * 4) }; }, '任務達成・船の持ち場を守った');
    sfx('horagai', 0.8); rt.after(1, () => sfx('toki', 0.8));
    rt.banner('毛利の船団、退く', `自船で止めた兵糧船：${F.supplyStopped}艘。持ち場を抜けた船：${passed}艘`);
    rt.say('九鬼嘉隆', passed === 0 ? `よう働いた、${nm(rt)}！　船を守り通したぞ。川口の警固を続けよ` : `${nm(rt)}、船は守った。抜けた兵糧船は川口の供船が退けた。石山へは通しておらぬ`, 4);
    
    rt.after(5, () => rt.say('船頭', '敵は離れたが、まだ川口の警固があるぞ。持ち場へ戻れ', 4));
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    const motionT = S.reduceMotion ? 0 : rt.t;
    // 大船の上下だけをごく小さく揺らす。歩く床を傾けず、舷と水際に波を見せる。
    const heave = Math.sin(motionT * 0.8) * 0.025;
    F.deckShip.position.y = heave;
    animateRig(F.deckShip, motionT, !S.reduceMotion);
    for (const c of F.guns) c.m.position.y = DECK.y + 0.72 + heave;
    for (const u of F.teppo.units) {
      if (!u.alive || u.fleeing || u.woundOut) { u._crouch = false; continue; }
      const close = u.target?.alive && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 7;
      u._crouch = !close && u.moving < 0.15 && !u.atk && !u.swing && !u.hit && (u.reload > 0 || !u.target);
    }
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
      const D = rigParts().dummy;
      for (let i = 0; i < 84; i++) {
        if (i < 72) {
          const x = -130 + (i % 12) * 22, z = -100 + Math.floor(i / 12) * 40;
          D.position.set(x, 0.32 + Math.sin(motionT * 0.9 + i) * 0.08, z);
          D.rotation.set(-Math.PI / 2, 0, 0.18); D.scale.set(3 + i % 4, 0.8, 1);
        } else {
          const sd = i % 2 ? 1 : -1, z = -10 + Math.floor((i - 72) / 2) * 4;
          D.position.set(sd * 5.65, 0.45 + Math.sin(motionT * 1.4 + i) * 0.16, z);
          D.rotation.set(-Math.PI / 3, 0, sd * 0.2); D.scale.set(0.7, 2.4, 1);
        }
        D.updateMatrix(); F.foam.setMatrixAt(i, D.matrix);
      }
      F.foam.instanceMatrix.needsUpdate = true;
    }
    // 崩れた隊の印は消す
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    // 舷の守りで両軍を船内に留める。敗走兵は接舷口で小舟へ戻る。
    for (const mouth of F.shipMouths) if (!mouth.solid.struct.opened) {
      for (const b of F.boats) if (b.exit && b.landed && b.damageStage && b.from === mouth.from && (b.from === 's' || Math.abs(b.exit.z - mouth.z) < 1)) { mouth.solid.struct.opened = true; break; }
    }
    F.deckAttackers = 0;
    let alive = 0;
    for (const u of rt.army.units) {
      if (u.alive) alive++;
      if (!u.alive) continue;
      if (u.team === 1 && !u.fleeing && !u.woundOut && (!u.shipBoat || u.shipTransit?.active)) F.deckAttackers++;
      if (u.shipBoat || u.shipTransit?.active) {
        if (u.pos.y <= 0 && !u.shipTransit?.active) rt.army.damage(u, u.maxHp * dt / 5, null);
        continue;
      }
      const boat = u.group?.boat;
      if (u.team === 1 && u.fleeing && boat?.alive && !boat.damageStage && Math.hypot(u.pos.x - boat.exit.x, u.pos.z - boat.exit.z) < 1.5) {
        const tr = u.shipTransit;
        if (tr) {
          tr.active = true; tr.returning = true; tr.start = rt.t; tr.x = u.pos.x; tr.y = u.pos.y; tr.z = u.pos.z;
          u.shipPost = u.perch = u.shipHold;
          u.shipPost.x = u.pos.x; u.shipPost.y = u.pos.y; u.shipPost.z = u.pos.z;
        }
        continue;
      }
      if (u.pos.x < DECK.x0 || u.pos.x > DECK.x1 || u.pos.z < DECK.z0 || u.pos.z > DECK.z1) {
        // 壊れた乗り口から落ちた兵を甲板へ戻さない。水面で傷を受け、共通の退場へ渡す。
        u.pos.y = 0; rt.army.damage(u, u.maxHp * dt / 5, null);
      }
    }
    if (F.ending || rt.over || !rt.player.u.alive) return;
    if (F.kukiU.alive && F.kukiU.hp <= F.kukiU.maxHp * 0.55 && !F.kukiWarn) {
      F.kukiWarn = true; rt.say('船頭', '九鬼殿が手負いじゃ！　屋形を固めよ。敵を近づけるな！', 5);
    }
    // 消火の段の勝敗は下の火の判定に任せる。ほかの失敗条件で水運びを打ち切らない。
    const fireProtected = F.step === 2;
    if (!fireProtected && (!F.kukiU.alive || F.kukiU.woundOut || F.kukiU.hp <= F.kukiU.maxHp * 0.36)) { this.lose(rt, 'わしは深手じゃ。船を離せ！'); return; }
    let guards = 0;
    for (const u of F.kuki.units) if (u !== F.kukiU && u.alive && !u.fleeing && !u.woundOut) guards++;
    if (!F.kukiRetired && (guards < Math.max(3, (F.kuki.initial - 1) / 2) || F.deckLost > 3)) {
      F.kukiRetired = true; F.kukiU.shipPost.x = 2; F.kukiU.shipPost.z = 9;
      rt.say('船頭', '屋形の守りが危うい！　九鬼殿を奥へ。乗り口の敵を押し返せ', 4);
    }
    let pressure = 0;
    for (const u of rt.army.units) if (u.alive && !u.fleeing && !u.woundOut && !u.shipBoat && !u.shipTransit?.active && Math.hypot(u.pos.x - 1, u.pos.z - 4) < 4) pressure += u.team === 1 ? 1 : -1;
    F.deckLost = pressure > 0 ? F.deckLost + dt : 0;
    // 兵糧船の取り逃しは脇の手柄だけ。大将船を崩す本筋を打ち切らない。
    if (F.deckLost > 0 && rt.t >= (F.deckWarnAt || 0)) {
      F.deckWarnAt = rt.t + 8;
      if (noticeReady(rt, '屋形に敵が入った！　押し返せ')) rt.bark('屋形に敵が入った！　押し返せ', true);
    }
    if (!fireProtected && F.deckLost >= 12) { this.lose(rt, '屋形を敵に奪われた。船を離せ！'); return; }
    // 供船の大筒が十四秒ごとに沖を撃つ。自分の砲撃の手柄や命中判定には加えない。
    const salvo = F.salvo;
    if (F.step >= 1 && F.step <= 4 && !F.bigSunk && rt.t >= salvo.next) {
      salvo.next = rt.t + 14;
      const e = F.escorts[2], target = F.boats.find(b => b.alive && !b.damageStage && !b.withdrawing);
      if (!e.group.routed && target) {
        const z = (salvo.shot++ % 3 - 1) * 8, sn = Math.sin(e.m.rotation.y), cs = Math.cos(e.m.rotation.y);
        salvo.muzzle.x = e.x - 5.4 * cs + z * sn; salvo.muzzle.y = 3.4; salvo.muzzle.z = e.z + 5.4 * sn + z * cs;
        salvo.hit.x = target.x + 4; salvo.hit.y = 0.5; salvo.hit.z = target.z + 3; salvo.at = rt.t;
        rt.army.play('volley', salvo.muzzle, 1.2);
        rt.army.smoke(salvo.muzzle.x, salvo.muzzle.y, salvo.muzzle.z, -cs, sn, 2);
      }
    }
    const shotAge = rt.t - salvo.at;
    salvo.flash.visible = !S.reduceMotion && shotAge >= 0 && shotAge < 0.16;
    salvo.flash.position.set(salvo.muzzle.x, salvo.muzzle.y, salvo.muzzle.z); salvo.flash.scale.setScalar(0.7);
    salvo.splash.visible = shotAge >= 0.5 && shotAge < 1.5;
    salvo.splash.position.set(salvo.hit.x, salvo.hit.y, salvo.hit.z);
    salvo.splash.scale.set(1.2, S.reduceMotion ? 1.8 : Math.max(0.1, 3 * Math.sin((shotAge - 0.5) * Math.PI)), 1.2);
    // 小早を動かす・沈める
    for (const b of F.boats) {
      if (!b.alive) { if (b.sinkT !== undefined) { b.sinkT += dt; b.m.position.y = -Math.min(1.2, b.sinkT * 0.025); b.m.rotation.z = Math.min(0.28, b.sinkT * 0.005); } continue; }
      if (b.damageStage) {
        const age = rt.t - b.hitAt;
        b.damageStage = age < 8 ? 1 : 2;
        if (b.supply && age >= 8 && !b.stopped) {
          b.stopped = true; F.supplyStopped++;
          rt.objProgress('supply', `自船で止めた船：${F.supplyStopped}艘／二艘。抜けた船：${F.supplyPassed}艘`);
          if (F.supplyStopped === 2 && !F.supplyPassed) rt.objDone('supply');
          rt.award((t) => { if (!t.side.includes('毛利の荷駄船を打ち止めた')) t.side.push('毛利の荷駄船を打ち止めた'); }, `兵糧船一艘を止めた。合計${F.supplyStopped}艘`);
        }
        b.m.position.y = -Math.min(0.65, age * 0.03); b.m.rotation.z = Math.min(0.18, age * 0.008);
        if (b.m.userData.crew) b.m.userData.crew.position.z = -Math.min(2.5, Math.max(0, age - 4) * 0.2);
        if (age >= (b.big || b.supply ? 90 : 45)) { b.alive = false; b.sinkT = age; continue; }
      } else floatShip(b.m, motionT, !b.landed && !S.reduceMotion, !!b.big);
      if (b.landed) {
        // 寄せた大将船は横腹を向ける。狭い船首を狙って撃ち続ける待ち合いにしない。
        if (b.big && !b.damageStage) {
          const turn = Math.atan2(Math.sin(-b.m.rotation.y), Math.cos(-b.m.rotation.y));
          b.m.rotation.y += Math.max(-dt * 0.35, Math.min(dt * 0.35, turn));
          continue;
        }
        if (b.supply) continue;
        if (b.ranged) { if (!b.withdrawing) continue; b.landed = false; }
        if (b.group?.routed) { b.remaining = 0; b.group.reserveCount = 0; b.withdrawing = true; }
        if (!b.remaining && b.group && !b.group.units.some((u) => u.alive && (!u.shipBoat || u.shipTransit?.active))) b.withdrawing = true;
        if (b.withdrawing && (!b.group || !b.group.units.some((u) => u.alive && (!u.shipBoat || u.shipTransit?.active)))) { b.landed = false; b.t.x = -350; b.t.z = 220; }
        else { alive += this.boardFromBoat(rt, b, alive); continue; }
      }
      const dx = b.t.x - b.x, dz = b.t.z - b.z, d = Math.hypot(dx, dz);
      // 風と潮：追い風・満ち潮で速く、向かい風・引き潮で遅い（ゆっくり変わる）。浸水した船は遅く、舵の壊れた船は流される
      const wt = 1; // 短い戦闘中に潮を何度も満ち引きさせない。風向・潮位の史料は未確定。
      const sp = (b.sp || 2.5) * wt * (b.damageStage ? Math.max(0, 1 - (rt.t - b.hitAt) / 8) : b.leak ? 0.72 : 1);
      if (b.rudderLost) b.z += Math.sin(rt.t * 0.7 + b.x) * 2.2 * dt;
      if (d > 0.5) {
        const want = Math.atan2(dx, dz), turn = Math.atan2(Math.sin(want - b.m.rotation.y), Math.cos(want - b.m.rotation.y));
        b.m.rotation.y += Math.max(-dt * 0.35, Math.min(dt * 0.35, turn));
        // 接舷の最後は櫓で横へ寄せる。旋回半径より近い所で回り続けない。
        const docking = d < 12;
        const advance = Math.min(d, sp * dt) * (docking ? 1 : Math.max(0, Math.cos(turn)));
        b.x += (docking ? dx / d : Math.sin(b.m.rotation.y)) * advance; b.z += (docking ? dz / d : Math.cos(b.m.rotation.y)) * advance; b.m.position.x = b.x; b.m.position.z = b.z;
      }
      else if (b.approach) { b.approach = null; b.t = b.dock; }
      else if (b.supply) {
        if (b.withdrawing) { b.landed = true; continue; }
        if (b.stopped || b.stopping) continue;
        if (!b.passed) {
          b.passed = true; F.supplyPassed++;
          // 自船を抜けても石山への搬入成功にはしない。川口の備えに阻まれ、沖へ戻る。
          b.withdrawing = true; b.t.x = -350; b.t.z = 220;
          rt.objFail('supply');
          rt.say('物見', `兵糧船が持ち場を抜けた！　抜けた船は${F.supplyPassed}艘。川口の供船に阻まれ、沖へ退くぞ`, 4);
        }
      }
      else {
        if (b.damageStage) continue;
        if (b.withdrawing) continue;
        b.landed = true;
        if (b.exit) for (const mouth of F.shipMouths) if (mouth.from === b.from && (b.from === 's' || Math.abs(mouth.z - b.exit.z) < 1)) mouth.solid.struct.opened = true;
        if (!b.ranged && !b.supply && !b.big && !b.withdrawing) {
          grapple(rt, b.exit.x, b.exit.z); b.nextBoard = rt.t + 2;
          const notice = b.from === 's' ? 'southHookSeen' : 'westHookSeen';
          if (!F[notice]) { F[notice] = true; rt.say('物見', b.from === 's' ? '艫に鉤縄！　後ろから来るぞ！' : '西の舷に鉤縄！　乗り込んで来るぞ！', 3); }
        }

      }
    }
    // 毛利の船は、大筒・消火・甲板防衛の間は途切れず寄せてくる
    if (F.step >= 1 && F.step <= 4 && !F.bigSunk && rt.t > (F.nextBoat || 1e9)) {
      F.nextBoat = rt.t + 14;
      // 空いている乗り口を先に使う。南が塞がっていても西の接舷を待たせない。
      if (!this.launch(rt, 'w')) this.launch(rt, 's');
    }
    // 遠くの船団がゆれる
    for (let i = 0; i < F.far.length; i++) {
      const b = F.far[i];
      if (b.userData.departed) continue;
      floatShip(b, motionT, !S.reduceMotion);
      if (F.bigSunk) { b.position.x -= dt * 2; b.position.z += dt; }
      else if (F.step >= 1 && i % 6 !== 0) {
        // 後続も沖で止めず、接舷待ちの位置へ櫓で寄せる。船・兵を増やさない。
        const dx = -38 - Math.floor(i / 9) * 12 - (i % 3) * 6 - b.position.x;
        const dz = (Math.floor(i / 3) % 3 - 1) * 18 - b.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.5) {
          const move = Math.min(d, dt * 4);
          b.position.x += dx / d * move; b.position.z += dz / d * move;
          b.rotation.y = Math.atan2(dx, dz);
        }
      }
    }
    for (let i = 0; i < F.escorts.length; i++) {
      const e = F.escorts[i];
      if (i === 2 && !e.group.routed && F.step >= 1 && F.step <= 4 && !F.bigSunk) {
        if (!e.sortie && rt.t >= (e.nextSortie || 35)) { e.sortie = true; e.t.x = e.homeX - 55; e.t.z = e.homeZ + 28; }
        if (e.sortie && shipMove(e, dt, 1.4)) {
          if (e.t.x !== e.homeX) { e.t.x = e.homeX; e.t.z = e.homeZ; }
          else { e.sortie = false; e.nextSortie = rt.t + 12; }
        }
      } else if (e.sortie) { e.t.x = e.homeX; e.t.z = e.homeZ; if (shipMove(e, dt, 1.4)) e.sortie = false; }
      floatShip(e.m, motionT, e.sortie && !S.reduceMotion, true);
    }
    for (const b of F.seaShips) {
      if (b.support) floatShip(b.m, motionT, false);
      if (b.ranged && (b.group.routed || F.bigSunk) && !b.withdrawing) { b.withdrawing = true; b.landed = false; b.t.x = -150; b.t.z = 130; }
      syncShipCrew(rt, b);
    }
    if (F.bigSunk) { F.distantFleet.position.x -= dt * 2; F.distantFleet.position.z += dt; }
    const elapsed = rt.t - F.stepT;
    if (rt.t >= F.noticeAt) {
      F.noticeAt = rt.t + 1;
      if (F.bigSunk) for (const groups of [F.boarders, F.small]) for (const g of groups || []) {
        if (g.flagshipHeard) continue;
        const c = g.center(), b = F.big;
        if (Math.hypot(c.x - b.x, c.z - b.z) < 75 && !rt.army.wallBetween(c, -1, b)) { g.flagshipHeard = true; g.morale = Math.max(0, g.morale - 20); }
      }
      if (F.step === 1 || F.step === 4 && !F.bigSunk) for (const c of F.guns) { const b = cannonTarget(F, c); c.aimHint = b ? aimWord(b, c) : '筒の向く先へ船が寄るのを待て'; }
      if (F.step === 1) rt.objProgress('main', F.cannonHits ? '敵船を打ち払った。次の船を迎えよ' : '西の大筒へ。近い横腹を狙え');
      if (F.step === 3) rt.objProgress('main', '南と西を守れ。屋形へ通すな');
      if (F.step === 4) {
        rt.objProgress('main', F.bigSunk ? '甲板を守り、退く大船を見張れ' : '西の大筒で大船の横腹を狙え');
      }
      if (F.step === 5) {
        let remaining = 0;
        for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && !u.woundOut && u.pos.x >= DECK.x0 && u.pos.x <= DECK.x1 && u.pos.z >= DECK.z0 && u.pos.z <= DECK.z1) remaining++;
        rt.objProgress('main', remaining ? '甲板の残る敵を退けよ' : '持ち場を守り、退く船団を見張れ');
      }
    }
    if (F.step === 1) {
      if (elapsed >= 90 && F.cannonHits >= 1) { this.fires(rt); return; }
      if (elapsed >= 180) { this.lose(rt, '寄せる船を打ち払えぬ。船を離せ！'); return; }
    }
    if (F.step === 2) {
      if (F.doused < 3) F.fireDanger += dt;
      if (rt.t >= (F.fireNoticeT || 0) && F.doused < 3) {
        F.fireNoticeT = rt.t + 1;
        rt.objProgress('main', F.fireDanger >= 60 ? '屋形に火が迫る。水を掛けよ' : F.water ? '残る火へ水を掛けよ' : '船べりの水桶を取り、火を消せ');
      }
      // 九鬼の水夫も手桶で火に掛かる（三十五秒・六十秒に一つずつ）。主人公一人に船の火を任せきりにしない
      const crewAt = [35, 60][F.crewDoused || 0];
      if (F.doused < 3 && crewAt !== undefined && F.fireDanger >= crewAt) {
        const k = F.fl.findIndex((f) => f && !f.doused);
        F.crewDoused = (F.crewDoused || 0) + 1;
        if (k >= 0) {
          F.fl[k].doused = true; F.houroku[k].dousedAt = rt.t;
          rt.uninteract('f' + k); rt.unmark('f' + k); rt.world.removeFire(F.fl[k].f);
          F.doused++;
          rt.say('水夫', F.doused < 3 ? 'ここの火は消えたぞ！　そちらはどうじゃ！' : 'よし、火はみな消えたぞ！', 3);
          if (F.doused >= 3) { this.board(rt); return; }
        }
      }
      if (F.doused < 3 && F.fireDanger >= 75) { this.lose(rt, '火が屋形へ回った。船を離せ！'); return; }
      if (F.doused >= 3) { this.board(rt); return; }
    }
    if (F.step === 3) {
      // 迎撃と消火の間に退けた敵も守りの働きに数える。
      // 早く守り切って新手が尽きても、架空の四人を待たせない。
      let contested = false;
      for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && !u.woundOut && !u.shipBoat && !u.shipTransit?.active && u.pos.x >= DECK.x0 && u.pos.x <= DECK.x1 && u.pos.z >= DECK.z0 && u.pos.z <= DECK.z1) { contested = true; break; }
      if (elapsed >= 75 && F.deckRepelled >= 4 && (F.deckRepelled - F.boardRepelledStart >= 4 || !contested)) {
        rt.award((t) => { if (!t.side.includes('甲板へ乗り込む敵を退けた')) t.side.push('甲板へ乗り込む敵を退けた'); }, '甲板の持ち場を守った');
        this.decisive(rt); return;
      }
      if (elapsed >= 130) { this.lose(rt, '乗り口を守りきれぬ。船を離せ！'); return; }
    }
    if (F.step === 4) {
      if (!F.bigSunk && elapsed >= 120) { this.lose(rt, '大船を崩せぬか。船を離し、備えを立て直せ！'); return; }
      // 命中後の崩れを見せたら退きへ進む。砲撃が早く決まっても待たせない。
      if (F.bigSunk && elapsed >= 30 && rt.t - F.flagshipHitAt >= 8) { this.retreat(rt); return; }
    }
    if (F.step === 5 && elapsed >= 30) {
      let contested = false;
      for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && !u.woundOut && u.pos.x >= DECK.x0 && u.pos.x <= DECK.x1 && u.pos.z >= DECK.z0 && u.pos.z <= DECK.z1) { contested = true; break; }
      if (!contested && F.bigSunk && F.doused >= 3 && F.cannonHits >= 1 && rt.player.u.alive) this.win(rt);
      else if (elapsed >= 100) this.lose(rt, contested ? '甲板の敵を退けきれぬ。船を離せ！' : '船の守りを立て直せ。船を離せ！');
    }

  },

  boardFromBoat(rt, b, alive) {
    const F = rt.flags;
    // 大将船を狙う間も、既に寄せた小早の兵は乗り込む。
    // 乗り込みを止めるのは、一斉射で敵船が退き始めた時。
    if (F.deckAttackers >= (F.step === 1 ? 6 : 8) || rt.t < F.nextBoardAt) return 0;
    if (F.step < 1 || F.step > 4 || F.bigSunk || b.damageStage || b.withdrawing || !b.remaining || rt.t < b.nextBoard) return 0;
    const u = b.group?.units.find(u => u.alive && !u.fleeing && !u.woundOut && u.shipBoat === b && !u.shipTransit.active);
    if (!u) { b.remaining = 0; return 0; }
    const tr = u.shipTransit;
    tr.active = true; tr.returning = false; tr.start = rt.t; tr.x = u.pos.x; tr.y = u.pos.y; tr.z = u.pos.z;
    b.remaining--; b.nextBoard = rt.t + 6;
    F.nextBoardAt = rt.t + 3; F.deckAttackers++;
    b.boarded = (b.boarded || 0) + 1;
    b.group.order = 'attack';
    rt.army.play('stepWood', b.exit, 0.8);
    return 0; // 兵は舟にいる時から本物なので人数を増やさない。

  },

  lose(rt, line) {
    if (rt.flags.step === 2 && rt.flags.doused < 3 && rt.flags.fireDanger < 75) return;
    if (!rt.canFailMission()) return;
    if (rt.flags.ending || rt.over) return;
    rt.flags.ending = true; rt.tracker.main = false;
    rt.setPhase('end'); rt.objFail('main'); rt.objProgress('main', '');
    rt.unmark('big'); rt.unmark('guard'); rt.unmark('kuki');
    for (let i = 1; i <= 4; i++) rt.unmark('b' + i);
    for (let i = 0; i < 3; i++) { rt.unmark('g' + i); rt.unmark('f' + i); }
    rt.objProgress('main', line);
    rt.banner('持ち場を退く', line);
    rt.say('九鬼嘉隆', line, 4);
    for (let i = 0; i < 3; i++) { rt.uninteract('g' + i); rt.uninteract('f' + i); }
    for (let i = 0; i < 4; i++) { rt.uninteract('water' + i); rt.unmark('water' + i); }
    // やり直しの札にも、今回起きた失敗条件を渡す。
    rt.finish({ failureReason: line }, 8);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v.team === 1 && v.group?.boat?.boarded && !v.shipBoat && !v.deckRepelled) { v.deckRepelled = true; F.deckRepelled++; }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team === 1 && g.boat?.boarded) {
      for (const u of g.units) if (u.alive && !u.shipBoat && !u.deckRepelled) { u.deckRepelled = true; F.deckRepelled++; }
    }
    if (g.team !== 1 || !g.boat?.boarded || F.routSeen || F.ending) return;
    F.routSeen = true;
    rt.say('足軽', '敵が小舟へ逃げるで！　乗り口を守ろまい！', 2.5);
  },
};

// 備え表と一致する推定兵数。局地の一人の損害を全軍の十人・二十人へ水増ししない。
kizugawa.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, 720 - (F.ak || 0)), a0: 720, b: Math.max(0, 4800 - (F.ek || 0)), b0: 4800 };
};
kizugawa.sides = { a: { name: '織田水軍（九鬼）', mon: 'oda' }, b: { name: '毛利水軍', mon: 'mori' } };
// 敵の大将船の主は史料で特定されない。名のある将を自船へ乗り込ませない。
kizugawa.famous = [];
kizugawa.date = () => '天正六年十一月六日　冬・辰から午';
kizugawa.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
kizugawa.skip = (rt) => { if (rt.phase === 'brief' && !rt.flags.ending && !rt.over && rt.player.u.alive) kizugawa.cannons(rt); };
kizugawa.history = '『信長公記』巻十一によると、天正六年十一月六日、西国の船六百余艘が木津へ出た。九鬼嘉隆の船団は囲まれ、朝から昼まで海上で戦った。六艘の大船は敵を間近へ寄せ、大将の船と思われる船を大鉄砲で崩し、敵は近寄れなくなったと記す。鉄張りは『多聞院日記』に見えるが、覆った範囲には諸説がある。大きさは『信長公記』別本の長さ十八間・幅六間（約三十二メートル・十一メートル）を遠景に採った。『九鬼御伝記』では三艘ずつ二手に分かれ、敵船を二十四艘取ったともいう。毛利方の文書には木津への着岸が見え、この一戦で海の道が完全に断たれたかには異論もある。自船も同じ船幅に直した。消火・乗り込み・個々の荷駄船の阻止は遊びの補完である。総兵数は味方七百二十・敵四千八百の仮置きで、史料の点呼数ではない。細かな配置と天候も推定である。戦場全体の封鎖成功ではなく、自分の船の持ち場を守る任務として扱う。';
// 確認した史料の翻刻・現代語表記：
// https://kininaruart.com/artist/shincho/n11.html
// https://proto.harisen.jp/koramu/koramu-tekkousen2.htm


// 素直な遊び手：大筒を撃ち、火を消し、乗り込んだ毛利勢と戦う
// 船の持ち場と受けてからの反撃を、性格の突進で上書きしない。
kizugawa.botOrders = true;
kizugawa.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 深手の退避と手当ては共通の頭に任せる。手当ては体力の四分の三までなので、
  // 自然回復を待つと甲板の隅から二度と戦いへ戻れない。
  const e = b.army.nearestEnemy(u, 10, (o) => !o.fleeing && !o.woundOut && !o.noTarget && !o.invuln && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos));
  const pre = F.step === 1 || F.step === 4 && !F.bigSunk ? 'g' : F.step === 2 ? (F.water ? 'f' : 'water') : null;
  if (e && (!pre || Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 3.5)) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.6 : 2.4;
    if (d > reach) goTo(p, inp, e.pos.x, e.pos.z, reach);
    // 構えたままの連打は払いになり、気力を失う。敵の隙に構えを解いて突く。
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (pre) {
    let it = null, bd = Infinity;
    for (const x of b.interacts) if (x.id.startsWith(pre)) {
      if (pre === 'g') { const gi = +x.id.slice(1); if (b.t < F.guns[gi].cd || !cannonTarget(F, F.guns[gi])) continue; }
      const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; }
    }
    if (it) { if (bd > 1.2) goTo(p, inp, it.pos.x, it.pos.z, 0.8); else inp.k.add('KeyE'); }
    return;
  }
  if (F.step === 3 || F.step === 4 && F.bigSunk || F.step === 5) {
    // 一斉射の後も甲板を守る。十歩より遠い残敵を見落として立ち止まらない。
    const q = b.army.nearestEnemy(u, 80, (o) => !o.fleeing && !o.woundOut && !o.noTarget && !o.invuln && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos) && o.pos.x >= DECK.x0 && o.pos.x <= DECK.x1 && o.pos.z >= DECK.z0 && o.pos.z <= DECK.z1);
    if (q) { goTo(p, inp, q.pos.x, q.pos.z, 2); return; }
    // 敵が甲板へ上がるまで南だけで待つと、西の乗り口は鉄砲衆だけが戦う。
    // 次に接舷する小早の乗り口へ寄り、上がる敵を味方と迎える。
    // 舟は南西の曲がり口を通るので、残る二つの道の長さも数える。
    if (F.step === 3) {
      let next = null, distance = Infinity;
      for (const boat of F.boats) {
        if (!boat.alive || boat.big || boat.supply || boat.damageStage || boat.withdrawing || !boat.remaining) continue;
        const d = boat.landed ? 0 : Math.hypot(boat.t.x - boat.x, boat.t.z - boat.z) +
          (boat.approach ? Math.hypot(boat.dock.x - boat.t.x, boat.dock.z - boat.t.z) : 0);
        if (d < distance) { next = boat; distance = d; }
      }
      if (next) {
        goTo(p, inp, next.exit.x + (next.from === 's' ? 0 : 2), next.exit.z - (next.from === 's' ? 2 : 0), 1);
        return;
      }
    }
    goTo(p, inp, 0, 10, 2);
  }
};


export { kizugawa };
