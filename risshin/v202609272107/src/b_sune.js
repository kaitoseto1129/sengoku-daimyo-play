// ======================================================================
// 長篠編　鳥居強右衛門の脱出（天正三年五月十四日 夜〜十五日 夜明け）
// 長篠城の崖の下から、豊川の流れに身を沈めて下り、武田の囲みを抜ける。
// 足軽は強右衛門の供。①岸を巡る見張りの松明をかわして川を下る ②川に張られた鳴子の縄を音を立てずに切る
// ③岸へ上がって雁峰山に登り、城へ知らせる狼煙を上げる ④狼煙に気づいた見回りを退け、強右衛門を岡崎への道へ送り出す
// 向き：北が -z（長篠城）。川は北から南へ流れる。雁峰山は南西
// ======================================================================
import * as THREE from 'three';
import { distToPolyline } from './world.js';
import { jinmaku, nobori, hut, yagura, campfire, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';

// 豊川（寒狭川と宇連川が合わさった流れ）
const RIVER = [[-34, -176], [-26, -140], [-12, -104], [0, -66], [6, -30], [4, 6], [-6, 40], [-20, 72], [-30, 104], [-34, 140], [-30, 176]];
const RW = 5, RD = 2.4;                        // 川の幅（片側）と深さ
const CASTLE = { x: -70, z: -140 };            // 長篠城（崖の上）
const START = { x: -16, z: -112 };             // 崖の下の川べり
const NET_Z = -8;                              // 鳴子の縄
const EXIT = { x: -30, z: 80 };                // 岸へ上がる所
const KANBO = { x: -100, z: 116 };             // 雁峰山の頂
const ROAD = [[-100, 116], [-130, 124], [-176, 132]];   // 岡崎への道
const SEE = 12, HALF = 0.55;                   // 松明の目の届く所（長さと、扇の半分の角）

// 川のその高さでの x（川は北から南へ、z に沿って一本）
function riverX(z) {
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    if (z >= az && z <= bz) return ax + (bx - ax) * (z - az) / (bz - az);
  }
  return z < RIVER[0][1] ? RIVER[0][0] : RIVER[RIVER.length - 1][0];
}
const inRiver = (x, z) => distToPolyline(x, z, RIVER) < RW * 0.85;
const ad = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const gone = (g) => !g || g.count === 0 || g.routed;
const sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

function height(x, z) {
  let h = 0.7 * Math.sin(x * 0.035 + 0.3) * Math.cos(z * 0.028) + 0.4 * Math.sin(z * 0.06 + x * 0.02);
  // 長篠城の台地（北西の崖の上）
  const r = Math.hypot(x - CASTLE.x, z - CASTLE.z);
  h += 15 * sm(40, 28, r);
  // 雁峰山（南西）・鳶ヶ巣山の尾根（南東）・東の台・西の山
  h += 26 * gauss(x, z, KANBO.x - 8, KANBO.z + 6, 2400) + 18 * gauss(x, z, 86, 96, 2600) + 12 * gauss(x, z, 110, -50, 3200) + 10 * gauss(x, z, -130, -40, 2600);
  // 川から離れるほど少しずつ高く（谷の底を川が流れる）
  h += Math.min(6, Math.max(0, distToPolyline(x, z, RIVER) - 14) * 0.05);
  return h;
}

// 夜と夜明けの色（鳶ヶ巣山砦夜襲と同じ作り）
const LOOK = {
  night: { sky: 0x2e384c, fog: 0x2a3446, sun: 0xa0b2d2, sunI: 0.7, hs: 0x8494b4, hg: 0x2c2c2e, hI: 1.3, top: 0x161d30, glow: 0.06, dir: [0.8, 0.14, -0.4], mount: 0x14181f },
  dawn: { sky: 0x86808c, fog: 0x76727e, sun: 0xffc48a, sunI: 1.15, hs: 0xa8a4b6, hg: 0x3a3028, hI: 1.0, top: 0x4a5470, glow: 0.2, dir: [1, 0.1, -0.25], mount: 0x2a2826 },
};
function applyLook(rt, key) {
  const W = rt.world;
  rt.flags.look = key;
  W.setTime('dusk');
  const L = LOOK[key];
  W.scene.background.set(L.sky);
  W.scene.fog.color.set(L.fog);
  W.sun.color.set(L.sun); W.sun.intensity = L.sunI;
  W.hemi.color.set(L.hs); W.hemi.groundColor.set(L.hg); W.hemi.intensity = L.hI; W.baseHemi = L.hI;
  W.sunOffset.set(...L.dir).normalize().multiplyScalar(120);
  const U = W.skyMat.uniforms;
  U.top.value.set(L.top); U.bottom.value.set(L.fog);
  U.sunDir.value.set(...L.dir).normalize(); U.sunCol.value.set(L.sun);
  U.glowK.value = L.glow; U.cover.value = 0.35;
  W.mountMats.forEach((m, k) => { const far = m.color.clone().set(L.mount); m.color.set(L.fog).lerp(far, [0.78, 0.52, 0.3][k]); });
  W.updateEnv();
}

// 松明の明かり：足もとが一番明るく、外へ柔らかく消える丸いにじみ（加算で淡く。川面ではゆらぐ）
// 地面の起伏に沿うよう、輪を重ねた円板に放射の絵を貼る
const GL_N = 28, GL_R = 6;
let glowTex = null;
function glowMesh() {
  if (!glowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.72)'); gr.addColorStop(0.45, 'rgba(255,255,255,.26)');
    gr.addColorStop(0.75, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
  }
  const V = 1 + GL_R * GL_N;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
  const uv = new Float32Array(V * 2);
  uv[0] = uv[1] = 0.5;
  for (let r = 1; r <= GL_R; r++) for (let i = 0; i < GL_N; i++) {
    const a = (i / GL_N) * Math.PI * 2, k = 1 + (r - 1) * GL_N + i;
    uv[k * 2] = 0.5 + 0.5 * (r / GL_R) * Math.cos(a); uv[k * 2 + 1] = 0.5 + 0.5 * (r / GL_R) * Math.sin(a);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const idx = [];
  for (let i = 0; i < GL_N; i++) idx.push(0, 1 + (i + 1) % GL_N, 1 + i);
  for (let r = 1; r < GL_R; r++) {
    const a = 1 + (r - 1) * GL_N, b = 1 + r * GL_N;
    for (let i = 0; i < GL_N; i++) { const i2 = (i + 1) % GL_N; idx.push(a + i, a + i2, b + i2, a + i, b + i2, b + i); }
  }
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff9a50, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }));
  m.frustumCulled = false; m.renderOrder = 2;
  return m;
}
function drawGlow(W, m, x, z, R, t) {
  const P = m.geometry.attributes.position;
  const wet = (px, pz) => inRiver(px, pz);
  const yAt = (px, pz) => (wet(px, pz) ? W.heightAt(riverX(pz), pz) + RD * 0.55 + 0.05 : W.heightAt(px, pz) + 0.08);
  P.setXYZ(0, x, yAt(x, z), z);
  for (let r = 1; r <= GL_R; r++) {
    for (let i = 0; i < GL_N; i++) {
      const a = (i / GL_N) * Math.PI * 2;
      let rr = (R * r) / GL_R;
      let px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      // 川面では照り返しが流れにゆれる
      if (wet(px, pz)) { rr *= 1 + 0.07 * Math.sin(a * 3 + t * 3.1 + r) + 0.05 * Math.sin(pz * 0.9 - t * 2.3); pz += 0.25 * Math.sin(t * 1.7 + a * 2); px = x + Math.cos(a) * rr; }
      P.setXYZ(1 + (r - 1) * GL_N + i, px, yAt(px, pz), pz);
    }
  }
  P.needsUpdate = true;
  // 炎のゆらぎで明るさもわずかに揺れる
  m.material.opacity = 0.4 + 0.05 * Math.sin(t * 9.3) + 0.03 * Math.sin(t * 23.7);
}
// 見張りの目の届く所：見つかりそうな時だけ、地面に細い朱の線で扇の縁を示す
const FAN_N = 18;
function fanMesh() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((FAN_N + 3) * 3), 3));
  const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xd8583a, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  m.frustumCulled = false; m.renderOrder = 3; m.visible = false;
  return m;
}
function drawFan(W, m, x, z, look, R, half) {
  const P = m.geometry.attributes.position;
  const yAt = (px, pz) => (inRiver(px, pz) ? W.heightAt(riverX(pz), pz) + RD * 0.55 + 0.08 : W.heightAt(px, pz) + 0.15);
  // 見張りの足もと → 縁の弧 → 足もと
  P.setXYZ(0, x, yAt(x, z), z);
  for (let i = 0; i <= FAN_N; i++) {
    const a = look - half + (2 * half * i) / FAN_N;
    const px = x + Math.sin(a) * R, pz = z + Math.cos(a) * R;
    P.setXYZ(1 + i, px, yAt(px, pz), pz);
  }
  P.setXYZ(FAN_N + 2, x, yAt(x, z), z);
  P.needsUpdate = true;
}
// 手に持った松明の火を動かす
function moveFire(f, W, x, z, h) {
  f.x = x; f.z = z;
  f.base = W.heightAt(x, z) + h;
  f.flame.position.z = z; f.inner.position.set(x, f.base - f.size * 0.08, z);
  if (f.glow) f.glow.position.set(x, W.heightAt(x, z) + 0.06, z);
  if (f.light) f.light.position.set(x, f.base + 0.4, z);
}
// 鳴子の縄：両岸の杭に張った縄に、板の鳴子が下がる
function naruko(W, z) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
  const rope = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 });
  const rx = riverX(z), x0 = rx - 11, x1 = rx + 11;
  for (const x of [x0, x1]) {
    const y = W.heightAt(x, z);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.2, 6), mat); p.position.set(x, y + 1, z); grp.add(p);
  }
  const ya = W.heightAt(x0, z) + 1.8, yb = W.heightAt(x1, z) + 1.8;
  const n = 22, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t;
    const water = W.heightAt(rx, z) + RD * 0.55;
    const sag = Math.sin(t * Math.PI);
    pts.push(new THREE.Vector3(x, (ya + (yb - ya) * t) * (1 - sag) + (water + 0.5) * sag, z));
  }
  const cv = new THREE.CatmullRomCurve3(pts);
  grp.add(new THREE.Mesh(new THREE.TubeGeometry(cv, 30, 0.025, 4, false), rope));
  for (let i = 2; i < n - 1; i += 2) {
    const q = cv.getPoint(i / n);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.03), mat);
    b.position.set(q.x, q.y - 0.18, q.z); b.rotation.y = Math.random() * 0.6;
    grp.add(b);
  }
  return grp;
}

// 見張りの巡る道（岸の上。side：川の西 -1 ／東 +1）
const PATROLS = [
  { side: 1, z0: -104, z1: -74, off: 10 },
  { side: -1, z0: -80, z1: -50, off: 10 },
  { side: 1, z0: -54, z1: -26, off: 10 },
  { side: -1, z0: 18, z1: 50, off: 10 },
  { side: 1, z0: 40, z1: 70, off: 10 },
];
// 武田の陣（焚き火と、眠る兵）
const CAMPS = [[52, -92], [64, -38], [50, 18], [-58, -34], [-62, 16], [60, 62], [-4, -150]];

const sune = {
  spawn: { x: START.x + 1, z: START.z - 2, heading: 0.1 },
  world: {
    seed: 514,
    time: 'dusk',
    muddy: 0.3,
    paths: [ROAD],
    height,
    tint(x, z, h, c) {
      const n = Math.sin(x * 0.37) * Math.cos(z * 0.29) * 0.04;
      // 崖と山の急な所は岩肌
      const sl = Math.abs(height(x + 1.5, z) - height(x - 1.5, z)) + Math.abs(height(x, z + 1.5) - height(x, z - 1.5));
      if (sl > 2.4) c.lerp(new THREE.Color(0.33 + n, 0.31 + n, 0.27 + n), Math.min(1, (sl - 2.4) / 2.5));
      // 川原：石まじりの砂
      const rd = distToPolyline(x, z, RIVER);
      if (rd < 12 && rd > RW) c.lerp(new THREE.Color(0.44, 0.42, 0.37), 0.6);
    },
    clear: (x, z) => distToPolyline(x, z, RIVER) < 14,
    streams: [{ pts: RIVER, w: RW, depth: RD }],
    trees: 520,
    tufts: 4200,
    // 川べりの藪と、雁峰山の森
    treeDensity: (x, z) => (distToPolyline(x, z, RIVER) < 22 ? 0.35 : 1),
    groves: [{ x: KANBO.x + 16, z: KANBO.z - 14, r: 16, n: 26 }, { x: -44, z: 60, r: 10, n: 14 }, { x: 30, z: 30, r: 10, n: 12 }, { x: -40, z: -20, r: 9, n: 10 }],
    // 退く武田兵は、川から離れた陣の奥で消す
    fleeOut: (x, z, team) => team === 1 && Math.abs(x - riverX(z)) > 48,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 夜の川に伝令の騎馬は走らない
    for (const c of rt.couriers) rt.scene.remove(c.m);
    rt.couriers.length = 0;
    F.step = 0; F.alert = 0; F.found = 0; F.ek = 0; F.ak = 0;

    // ---- 見張り（松明を持って岸を巡る。はじめの四つの松明だけが地面を照らす） ----
    F.pat = PATROLS.map((p, i) => this.makePatrol(rt, p, i));
    // 鳴子の番：縄の両端の番所に一人ずつ、川を見張る
    F.netGuards = [-1, 1].map((s, i) => {
      const x = riverX(NET_Z) + s * 12, z = NET_Z + 2;
      const g = enemyGroup(rt, { faction: 'takeda', name: '鳴子の番', anchor: { x, z }, facing: s > 0 ? -Math.PI / 2 : Math.PI / 2, aggro: 0, width: 2, morale: 70, fleeDir: { x: s, z: 0 } },
        [{ type: 'ashigaru', n: 2, o: { flag: null } }]);
      rt.scene.add(campfire(W, x + s * 2.5, z + 1.5));
      W.addFire(x + s * 2.5, z + 1.5, { h: 0.1 });
      rt.scene.add(hut(W, x + s * 5, z - 2, 4, 3, s > 0 ? -Math.PI / 2 : Math.PI / 2, { h: 2.2, roof: 0x5a4a38 }));
      const w = { g, x, z, idx: 20 + i, fixed: true, ph: i * 0.4, look: 0, sus: 0, R: 11, fan: fanMesh(), glow: glowMesh(), base: Math.atan2(riverX(NET_Z) - x, NET_Z - z) };
      w.fire = W.addFire(x, z, { torch: true, h: 1.9 });
      rt.scene.add(w.fan, w.glow);
      return w;
    });
    F.net = naruko(W, NET_Z);
    rt.scene.add(F.net);
    applyLook(rt, 'night');

    // ---- 長篠城（北西の崖の上）：塀の上の松明と、奥平の旗 ----
    rt.scene.add(hut(W, CASTLE.x - 6, CASTLE.z - 4, 10, 6, 0.2, { h: 3, wall: 0x6e5a44 }));
    rt.scene.add(yagura(W, CASTLE.x + 16, CASTLE.z + 14), yagura(W, CASTLE.x - 18, CASTLE.z + 12));
    for (const [dx, dz] of [[10, 18], [-4, 22], [-16, 16], [20, 4]]) rt.scene.add(nobori(W, CASTLE.x + dx, CASTLE.z + dz, 'okudaira', 5.5));
    for (const [dx, dz] of [[14, 20], [-8, 23]]) W.addFire(CASTLE.x + dx, CASTLE.z + dz, { h: 1.6 });
    W.addDistantArmy({ x: CASTLE.x, z: CASTLE.z + 16, w: 26, d: 4, count: 40, facing: 0.2, armor: 0x24221f, flagTex: flagTexture('okudaira'), seed: 511 });

    // ---- 武田の囲み：川の両岸の陣に焚き火と眠る兵、旗。遠くの山にも陣の火 ----
    const DA = (x, z, w, d, count, facing, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor: 0x3a2622, flagTex: flagTexture(flag), seed });
    CAMPS.forEach(([x, z], i) => {
      rt.scene.add(campfire(W, x, z));
      W.addFire(x, z, { h: 0.1 });
      const s = x > riverX(z) ? 1 : -1;
      DA(x + s * 12, z, 22, 12, 110, s > 0 ? -Math.PI / 2 : Math.PI / 2, i % 2 ? 'furin' : 'takeda', 521 + i);
      rt.scene.add(nobori(W, x + s * 4, z - 5, i % 2 ? 'furin' : 'takeda', 6), nobori(W, x + s * 4, z + 5, 'takeda', 6));
    });
    rt.scene.add(jinmaku(W, 72, -40, 16, 10, 5), jinmaku(W, -74, 16, 14, 10, 5));
    rt.scene.add(tawara(W, 58, -26, 0.4, 5));
    // 医王寺山の勝頼の本陣（北東）と、鳶ヶ巣山の砦（南東の尾根）
    DA(40, -168, 60, 12, 300, Math.PI * 0.9, 'takeda', 531);
    DA(88, 100, 36, 12, 200, -Math.PI * 0.7, 'furin', 532);
    DA(120, -80, 30, 16, 200, -Math.PI / 2, 'takeda', 533);
    for (const [x, z] of [[40, -160], [84, 92], [118, -74]]) W.addFire(x, z, { h: 0.1 });

    // ---- 強右衛門（供の足軽のあとについてくる） ----
    const sg = allyGroup(rt, { faction: 'tokugawa', name: '鳥居強右衛門', anchor: { x: START.x - 1, z: START.z - 4 }, facing: 0, noRout: true, aggro: 3, width: 1 },
      [{ type: 'ashigaru', n: 1, o: { name: '鳥居強右衛門', flag: null, hat: 'none' } }]);
    F.suneG = sg; F.sune = sg.units[0];
    F.sune.hp = F.sune.maxHp = 320;

    rt.setPhase('brief');
    rt.obj('main', '鳥居強右衛門を守り、川を下って武田の囲みを抜けよ', 'main');
    rt.obj('stealth', '見張りに見つからずに抜ける', 'side');
    rt.marker('sune', unitPos(F.sune), '鳥居強右衛門', { h: 2.6 });
    rt.after(14, () => rt.unmark('sune'));
    rt.say('鳥居強右衛門', `${nm(rt)}殿、ここからが本当の道じゃ。流れに身を沈めて、川を下る`, 4.5);
    rt.say('鳥居強右衛門', '岸には松明を持った武田の見張りが巡っておる。灯りの中へ入れば、すぐに見つかる', 4.5);
    if (rt.G.rank > 0) rt.say('鳥居強右衛門', '組の者は城に残してきた。忍ぶには二人が限りじゃ', 3.5);
    rt.say('', '松明の照らす扇が見張りの目。走ると足音で気づかれます。右ボタンで構えて歩けば忍び足。川の中は見つかりにくい', 7);
    rt.after(18, () => this.start(rt));
  },

  makePatrol(rt, p, i, at) {
    const W = rt.world;
    const z = at ? at.z : p.z0 + (p.z1 - p.z0) * ((i * 0.37) % 1);
    const x = at ? at.x : riverX(z) + p.side * p.off;
    const g = enemyGroup(rt, { faction: 'takeda', name: '武田の見張り', anchor: { x, z }, facing: 0, aggro: 0, width: 2, spacing: 1.3, morale: 75, fleeDir: { x: p.side, z: 0 }, dmgMult: 0.7 },
      [{ type: 'ashigaru', n: 2, o: { flag: null } }]);
    const w = { g, p, x, z, idx: i, dir: i % 2 ? 1 : -1, pause: 0, look: 0, sus: 0, R: SEE, fan: fanMesh(), glow: glowMesh(), ph: i * 1.7 };
    w.fire = W.addFire(x, z, { torch: true, h: 1.9 });
    rt.scene.add(w.fan, w.glow);
    return w;
  },

  start(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1;
    rt.setPhase('river');
    F.riverT = rt.t;
    rt.say('鳥居強右衛門', '参ろう。……わしから離れすぎぬよう頼む', 3);
    rt.marker('net', { x: riverX(NET_Z), z: NET_Z }, '鳴子の縄', { h: 1.6 });
  },

  // 見つかった：見張りが声を上げ、近くの陣から番兵が出てくる
  spotted(rt, w, why) {
    const F = rt.flags;
    if (w && w.alerted) return;
    if (w) { w.alerted = true; w.on = false; w.sus = 0; w.fan.visible = false; w.g.aggro = 12; w.g.order = 'attack'; w.g.seekRange = 30; }
    F.found++;
    F.alert = Math.min(3, F.alert + 1);
    if (F.found === 1) rt.objFail('stealth');
    rt.banner('見つかった', why);
    rt.say('武田の見張り', '曲者じゃ！　川に誰かおるぞ！', 2.5);
    const p = rt.player.u.pos;
    rt.army.play('eshout', p, 1.6);
    rt.after(0.8, () => sfx('taiko', 0.6));
    // 近くの陣から番兵が駆けつける
    let best = null, bd = Infinity;
    for (const [x, z] of CAMPS) { const d = Math.hypot(x - p.x, z - p.z); if (d < bd) { bd = d; best = { x, z }; } }
    if (best && bd < 90 && (F.guards || []).filter((g) => !gone(g)).length < 2) {
      const s = best.x > riverX(best.z) ? 1 : -1;
      const g = enemyGroup(rt, { faction: 'takeda', name: '番兵', anchor: best, facing: -s * Math.PI / 2, order: 'attack', seekRange: 70, aggro: 12, width: 4, morale: 70, fleeDir: { x: s, z: 0 }, dmgMult: 0.7 },
        [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 3 + F.alert }]);
      F.guards = [...(F.guards || []), g];
      rt.marker('guard' + F.guards.length, centerOf(g), () => `番兵・${moraleWord(g.morale)}`, { red: true, group: g });
    }
    rt.after(2.5, () => rt.say('鳥居強右衛門', F.found > 1 ? 'またか……！　斬り抜けて、闇に紛れるほかない' : 'しまった！　斬り抜けるぞ。騒ぎが大きくなる前に片を付けよ', 3.5));
    // しばらくして騒ぎが静まれば、見張りの目は厳しくなる
    rt.obj('flee', '追っ手を退けよ（騒ぎが静まれば、また忍んで進める）', 'order');
  },

  // 見張りを一つ動かし、目の届く所に誰かいれば怪しむ
  watch(rt, w, dt) {
    const F = rt.flags;
    const W = rt.world;
    const g = w.g;
    if (gone(g)) { w.on = false; w.fan.visible = false; w.glow.visible = false; if (w.fire) { W.removeFire(w.fire); w.fire = null; } return; }
    // 斬られた見張りは声を上げる
    if (!w.alerted && g.units.some((u) => !u.alive || u.hp < u.maxHp)) this.spotted(rt, w, '見張りに斬りかかった');
    const u0 = g.units.find((u) => u.alive);
    if (w.alerted) {
      w.fan.visible = false;
      if (w.fire && u0) moveFire(w.fire, W, u0.pos.x + Math.sin(u0.heading + 0.6) * 0.4, u0.pos.z + Math.cos(u0.heading + 0.6) * 0.4, 1.9);
      if (w.fire) drawGlow(W, w.glow, w.fire.x, w.fire.z, 5.5, rt.t + w.ph); else w.glow.visible = false;
      return;
    }
    const t = rt.t + w.ph;
    if (w.fixed) {
      // 鳴子の番：その場で、川と岸をゆっくり見渡す
      w.look = w.base + Math.sin(t * 0.62) * 0.95;
    } else {
      const p = w.p;
      const spd = 1.3 * (1 + F.alert * 0.15);
      if (w.pause > 0) {
        w.pause -= dt;
        // 角で立ち止まり、松明を振って川を照らす
        const toRiver = -p.side * Math.PI / 2;
        w.look = toRiver + Math.sin(t * 0.9) * 0.9;
      } else {
        w.z += w.dir * spd * dt;
        if (w.z > p.z1) { w.z = p.z1; w.dir = -1; w.pause = 4; }
        if (w.z < p.z0) { w.z = p.z0; w.dir = 1; w.pause = 4; }
        w.x = riverX(w.z) + p.side * p.off;
        // 歩きながら、ときどき川の方をうかがう
        const along = w.dir > 0 ? 0 : Math.PI;
        w.look = along + ad(along, -p.side * Math.PI / 2) * (0.35 + 0.3 * Math.sin(t * 0.7));
      }
      g.anchor.x = w.x; g.anchor.z = w.z;
    }
    g.facing = w.look;
    for (const u of g.units) if (u.alive && !u.target) u.heading += ad(u.heading, w.look) * Math.min(1, dt * 3);
    if (w.fire && u0) moveFire(w.fire, W, u0.pos.x + Math.sin(u0.heading + 0.6) * 0.4, u0.pos.z + Math.cos(u0.heading + 0.6) * 0.4, 1.9);
    const R = w.R * (1 + F.alert * 0.12) * (F.look === 'dawn' ? 1.3 : 1);
    const ex = w.x, ez = w.z;
    w.on = true;
    // 明かりは松明の足もと（少し前へ寄る）に。目の届く扇より小さい
    if (w.fire) drawGlow(W, w.glow, w.fire.x + Math.sin(w.look) * 1.2, w.fire.z + Math.cos(w.look) * 1.2, 5.5, t);
    // 目と耳：自分と強右衛門
    const P = rt.player;
    const sp = Math.hypot(P.u.vel.x, P.u.vel.z);
    const sneak = P.guard || sp < 2.6;
    const run = sp > 4.6;
    let gain = 0;
    for (const t2 of [P.u, F.sune]) {
      if (!t2 || !t2.alive) continue;
      const dx = t2.pos.x - ex, dz = t2.pos.z - ez, d = Math.hypot(dx, dz);
      const wet = inRiver(t2.pos.x, t2.pos.z);
      let v = 0;
      if (d < R && Math.abs(ad(w.look, Math.atan2(dx, dz))) < HALF) v = 1.15 - (d / R) * 0.7;
      if (d < 2.4) v = Math.max(v, 1.4);
      // 足音：走れば遠くまで聞こえる（川の中なら水音）
      if (run && d < (wet ? 15 : 13)) v = Math.max(v, 0.35 + 0.4 * (1 - d / 15));
      else if (!sneak && d < 4.5) v = Math.max(v, 0.3);
      let mul = sneak ? 0.45 : run ? 1.5 : 1;
      if (wet && !run) mul *= 0.5;
      gain = Math.max(gain, v * mul);
    }
    if (gain > 0) w.sus = Math.min(1, w.sus + gain * dt * 0.95);
    else w.sus = Math.max(0, w.sus - dt * 0.22);
    // 怪しんだら、灯りを向けて立ち止まる
    if (w.sus > 0.35 && !w.fixed) w.pause = Math.max(w.pause, 1.2);
    const id = 'sus' + w.idx;
    if (w.sus > 0.3 && !w.susMark) { w.susMark = true; rt.marker(id, { x: ex, z: ez }, '見張り（怪しんでいる）', { red: true, h: 2.4 }); if (!(F.susT > rt.t)) { F.susT = rt.t + 10; rt.bark('見張りがこちらをうかがっている……動くな、灯りの外へ', true); } }
    if (w.sus < 0.15 && w.susMark) { w.susMark = false; rt.unmark(id); }
    if (w.susMark) rt.marker(id, { x: ex, z: ez }, w.sus > 0.7 ? '見張り（見つかりそう！）' : '見張り（怪しんでいる）', { red: true, h: 2.4 });
    F.maxSus = Math.max(F.maxSus || 0, w.sus);
    // 怪しんでいる間だけ、目の届く扇の縁を薄く見せる
    w.fan.visible = w.sus > 0.12;
    if (w.fan.visible) { w.fan.material.opacity = Math.min(0.75, 0.15 + w.sus * 0.6); drawFan(W, w.fan, ex, ez, w.look, R, HALF); }
    if (w.sus >= 1) { rt.unmark(id); w.susMark = false; this.spotted(rt, w, w.fixed ? '鳴子の番に見つかった' : '見張りの松明に照らされた'); }
  },

  // 鳴子の縄を切る
  cutNet(rt) {
    const F = rt.flags;
    if (F.netCut) return;
    F.netCut = true;
    rt.uninteract('net');
    rt.unmark('net');
    rt.scene.remove(F.net);
    sfx('ui');
    rt.bark('鳴子の縄を切った。鳴子は音もなく流れに沈んだ');
    rt.say('鳥居強右衛門', '見事じゃ。……さあ、この先は囲みの外れ。岸へ上がる所まで、あと少し', 4);
    rt.marker('exit', EXIT, '岸へ上がる所', { h: 1.5 });
    rt.zone('exit', EXIT.x, EXIT.z, 6);
    rt.obj('main', '川を下り、囲みの外れで岸へ上がれ', 'main');
  },

  // 鳴子が鳴った
  netRang(rt) {
    const F = rt.flags;
    if (F.netCut) return;
    F.netCut = true; F.netRang = true;
    rt.uninteract('net');
    rt.unmark('net');
    rt.army.play('knock', { x: riverX(NET_Z), z: NET_Z }, 1.4);
    rt.bark('カラカラカラ……！　鳴子が鳴った', true);
    for (const w of F.netGuards) this.spotted(rt, w, '鳴子の縄に掛かった');
    rt.marker('exit', EXIT, '岸へ上がる所', { h: 1.5 });
    rt.zone('exit', EXIT.x, EXIT.z, 6);
    rt.obj('main', '川を下り、囲みの外れで岸へ上がれ', 'main');
  },

  // 岸へ上がり、雁峰山へ
  ashore(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2;
    rt.setPhase('hill');
    rt.unmark('exit'); rt.unzone('exit');
    rt.award((t) => t.side.push('武田の囲みを抜けた'), '武田の囲みを抜けた');
    rt.banner('囲みを抜けた', '豊川の流れを下り、武田の陣の外れへ');
    rt.say('鳥居強右衛門', 'ここまで来れば……。あの山が雁峰山じゃ。頂で狼煙を上げれば、城からも見える', 4.5);
    rt.say('鳥居強右衛門', '殿（奥平信昌）とは、抜けたら狼煙で知らせると約してある', 3.5);
    rt.obj('main', '雁峰山の頂に登り、城へ知らせる狼煙を上げよ', 'main');
    rt.marker('kanbo', KANBO, '雁峰山の頂（狼煙）', { h: 2 });
    // 山の中腹の見回り
    const w = this.makePatrol(rt, { side: -1, z0: 0, z1: 0, off: 0 }, 9, { x: -52, z: 98 });
    w.hill = true; w.pts = [[-52, 98], [-74, 88]]; w.k = 1; w.fixed = true; w.base = 0;
    F.pat.push(w);
    rt.addInteract('smoke', KANBO, '狼煙を上げる', () => this.smoke(rt), { r: 3.2, hold: 2.5 });
  },

  // 狼煙を上げる
  smoke(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3;
    rt.setPhase('smoke');
    rt.uninteract('smoke'); rt.unmark('kanbo');
    rt.objProgress('main', '狼煙が上がった');
    const W = rt.world;
    const y = W.heightAt(KANBO.x, KANBO.z);
    // 狼煙の焚き場：積んだ薪の上に火。火より煙が主（火が大きすぎると、近くで光の塊に見える）
    rt.scene.add(campfire(W, KANBO.x + 1, KANBO.z));
    const f = W.addFire(KANBO.x + 1, KANBO.z, { h: 0.2 }); f.size = 1.5;
    F.smokeCols = [W.addSmokeColumn(KANBO.x + 1, y + 1.5, KANBO.z, { size: 3.2 }), W.addSmokeColumn(KANBO.x + 1.4, y + 2, KANBO.z + 0.4, { size: 2.6 })];
    for (const w of F.pat) { w.on = false; w.fan.visible = false; w.glow.visible = false; if (w.fire) { W.removeFire(w.fire); w.fire = null; } }
    for (const w of F.netGuards) { w.on = false; w.fan.visible = false; w.glow.visible = false; if (w.fire) { W.removeFire(w.fire); w.fire = null; } }
    applyLook(rt, 'dawn');
    rt.award((t) => { t.special = { label: '狼煙を上げた', pts: 20 }; }, '狼煙を上げた');
    rt.banner('狼煙が上がった', '夜が白む。長篠城から、かすかに鬨の声');
    rt.after(1.5, () => { rt.player.cine = { x: CASTLE.x, z: CASTLE.z, t: 3.5 }; rt.army.play('eshout', { x: CASTLE.x * 0.4 + KANBO.x * 0.6, z: CASTLE.z * 0.4 + KANBO.z * 0.6 }, 1.2); });
    rt.say('鳥居強右衛門', '聞こえるか……城の者が、狼煙に応えておる！', 3.5);
    rt.say('鳥居強右衛門', 'あとは岡崎へ走るだけじゃ。殿と信長公に後詰を願い、必ず戻る', 4);
    rt.after(9, () => this.pursuit(rt));
  },

  // 狼煙に気づいた武田の見回りが、岡崎への道から山へ上がってくる
  pursuit(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.pT = rt.t;
    rt.setPhase('pursuit');
    sfx('taiko', 0.8);
    rt.army.play('hooves', { x: -150, z: 128 }, 1.4);
    rt.banner('武田の見回り', '狼煙に気づき、岡崎への道を駆け上がってくる');
    rt.say('足軽', `${nm(rt)}殿、下の道に騎馬が！　狼煙を見られた！`, 3);
    rt.say('鳥居強右衛門', '道をふさがれては岡崎へ行けぬ。……頼む、あの者どもを退けてくれ', 4);
    const g = enemyGroup(rt, { faction: 'takeda', name: '武田の見回り', anchor: { x: -160, z: 128 }, facing: Math.PI / 2, order: 'attack', seekRange: 120, aggro: 14, width: 6, morale: 80, fleeDir: { x: -1, z: 0.3 }, dmgMult: 0.6, speed: 3 },
      [{ type: 'samurai', n: 1, o: { horse: true, hat: 'kabuto_m' } }, { type: 'cavalry', n: 2 }, { type: 'ashigaru', n: 5 }]);
    for (const u of g.units) if (u.type === 'cavalry' || u.mounted) u.dmg *= 0.6;
    F.purs = g;
    rt.obj('main', '武田の見回りを退け、強右衛門を岡崎への道へ送り出せ', 'main');
    rt.marker('purs', centerOf(g), () => `武田の見回り・${moraleWord(g.morale)}`, { red: true, group: g });
    rt.after(70, () => { if (!gone(g)) { g.morale = 0; g.noRout = false; } });
  },

  depart(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5;
    rt.setPhase('end');
    rt.unmark('purs');
    const g = F.suneG;
    g.order = 'path'; g.path = ROAD.slice(1).map((q) => [...q]); g.pathIdx = 0; g.speed = 4.5;
    F.sune.speed = F.sune.run = 5.5;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '強右衛門を送り出した');
    if (!F.found) rt.award((t) => t.side.push('見つからずに抜けた'), '副任務：見つからずに抜けた');
    if (!F.found) rt.objDone('stealth');
    rt.say('鳥居強右衛門', `${nm(rt)}殿、かたじけない。城の皆に伝えてくだされ。……後詰は、必ず来ると`, 4.5);
    rt.banner('強右衛門、岡崎へ', '朝の道を、ひとり駆けていった');
    rt.after(5, () => rt.say('', `――${nm(rt)}は夜を待って崖の細道から城へ戻り、奥平信昌に強右衛門の脱出を告げた`, 5));
    rt.player.u.invuln = true;
    rt.finish({}, 11);
  },

  fail(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.objFail('main');
    rt.banner('強右衛門が討たれた', why);
    rt.say('', '――使いは岡崎へ届かなかった。城は、別の者を出すことになる', 4.5);
    rt.finish({}, 8);
  },

  update(rt, dt) {
    const F = rt.flags;
    const P = rt.player, p = P.u.pos;
    const S = F.sune, SG = F.suneG;
    if (F.ending) return;
    if (!S.alive) { this.fail(rt, '囲みの中で、武田の兵に討たれた'); return; }
    // 強右衛門は供のすぐ後ろにつく（忍び足なら忍び足で）
    if (F.step < 5) {
      const back = { x: p.x - Math.sin(P.u.heading) * 2.2, z: p.z - Math.cos(P.u.heading) * 2.2 };
      if (Math.hypot(SG.anchor.x - back.x, SG.anchor.z - back.z) > 1.2) { SG.anchor.x = back.x; SG.anchor.z = back.z; }
      SG.facing = P.u.heading;
      const sp = Math.hypot(P.u.vel.x, P.u.vel.z);
      S.speed = P.guard || sp < 2.6 ? 2.1 : 3.6;
      S.run = 6.2;
    }
    // 見張り
    F.maxSus = 0;
    for (const w of F.pat) {
      if (w.hill && !w.alerted && !gone(w.g)) {
        // 中腹の見回りは二つの点を行き来する
        const q = w.pts[w.k];
        const dx = q[0] - w.x, dz = q[1] - w.z, d = Math.hypot(dx, dz);
        if (w.pause > 0) w.pause -= dt;
        else if (d < 0.5) { w.k = 1 - w.k; w.pause = 4; }
        else { w.x += dx / d * 1.3 * dt; w.z += dz / d * 1.3 * dt; }
        w.fixed = true; w.base = w.pause > 0 ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
        w.g.anchor.x = w.x; w.g.anchor.z = w.z;
      }
      if (F.step < 3) this.watch(rt, w, dt);
    }
    if (F.step < 3) for (const w of F.netGuards) this.watch(rt, w, dt);
    // 騒ぎ：追っ手がいなくなれば静まる
    const chasers = [...F.pat.filter((w) => w.alerted).map((w) => w.g), ...F.netGuards.filter((w) => w.alerted).map((w) => w.g), ...(F.guards || [])].filter((g) => !gone(g));
    if (F.found && !chasers.length && !F.calm) {
      F.calm = true;
      rt.objDone('flee'); rt.objRemove('flee');
      rt.bark('騒ぎが静まった。見張りの目は厳しくなっている');
      rt.say('鳥居強右衛門', '……今のうちじゃ。また流れに身を沈めて進もう', 3);
    }
    if (chasers.length) F.calm = false;
    // 追っ手から遠く離れれば、振り切れる
    for (const g of chasers) {
      const c = g.center();
      if (Math.hypot(c.x - p.x, c.z - p.z) > 45 && g.order === 'attack') { g.morale = 0; g.noRout = false; }
    }
    if (F.step === 1) {
      // 鳴子の縄：川の中ほどで切る。切らずに越えれば鳴る
      if (!F.netCut) {
        const rx = riverX(NET_Z);
        if (!rt.interacts.some((i) => i.id === 'net')) rt.addInteract('net', { x: rx, z: NET_Z - 1 }, '鳴子の縄を切る（音を立てずに）', () => this.cutNet(rt), { r: 3, hold: 2.2 });
        const crossed = [P.u, S].some((u) => u.pos.z > NET_Z + 0.6 && Math.abs(u.pos.x - rx) < 13);
        if (crossed) this.netRang(rt);
        const d = Math.hypot(p.x - rx, p.z - NET_Z);
        if (d < 16 && !F.netSaid) {
          F.netSaid = true;
          rt.say('鳥居強右衛門', '見よ、川に縄が張ってある。鳴子じゃ。触れれば鳴って番所に知れる', 4);
          rt.say('鳥居強右衛門', '番の目がよそを向いた隙に、流れの中ほどで縄を切ってくだされ', 4);
        }
      }
      const left = Math.max(0, Math.round(EXIT.z - p.z));
      const state = F.maxSus > 0.7 ? '見つかりそう！' : F.maxSus > 0.3 ? '見張りが怪しんでいる' : '気づかれていない';
      rt.objProgress('main', `${F.netCut ? '' : '鳴子の縄の先・'}岸へ上がる所まで ${left}m`);
      rt.objProgress('stealth', F.found ? '' : state);
      if (F.netCut && Math.hypot(p.x - EXIT.x, p.z - EXIT.z) < 7) this.ashore(rt);
      // 夜が明けかける（長くかかりすぎたとき）
      if (rt.t - F.riverT > 300 && !F.late) { F.late = true; F.alert = Math.min(3, F.alert + 1); rt.bark('東の空が白みはじめた。急げ', true); }
    }
    if (F.step === 2) {
      const d = Math.hypot(p.x - KANBO.x, p.z - KANBO.z);
      rt.objProgress('main', `頂まで ${Math.max(0, Math.round(d))}m`);
    }
    if (F.step === 4) {
      const g = F.purs;
      rt.objProgress('main', `見回り ${g.count}人`);
      if (gone(g) && !chasers.length) this.depart(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else if (!v.isPlayer) F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.purs) rt.say('鳥居強右衛門', '見回りが逃げていく！　今じゃ！', 2.5);
  },
};

// 両軍の総勢（城兵 五百、囲む武田 一万五千）
sune.force = (rt) => {
  const F = rt.flags;
  return { a: 500, a0: 500, b: 15000 - (F.ek || 0) * 18, b0: 15000 };
};
sune.sides = { a: { name: '徳川方・奥平勢', mon: 'okudaira' }, b: { name: '武田軍', mon: 'takeda' } };
sune.date = (rt) => (rt.flags.look === 'dawn' ? '天正三年五月十五日　夏・晴・夜明け' : '天正三年五月十四日　夏・晴・夜');
sune.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '川を下りはじめる' : '');
sune.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
sune.history = '天正三年五月十四日の夜、長篠城の足軽・鳥居強右衛門は城を抜け出し、川に潜って武田の囲みをくぐったと伝わる。武田方は川に縄を張り、鳴子を下げて見張っていたが、強右衛門はそれを切って下ったという。翌朝、雁峰山で狼煙を上げて脱出を城に知らせ、その日のうちに岡崎へ走って家康と信長に後詰を願った。城へ戻る途中で捕らえられ、「援軍は来ない」と告げるよう命じられたが、「援軍はすぐに来る」と叫んで磔にされた。この戦に出てくる供の足軽は、遊びのための人物である。';

// 素直な遊び手：川の真ん中を下り、見張りの扇が近ければ止まって待つ。鳴子は番の目がそれた時に切る。
// 岸へ上がれば頂へ登って狼煙を上げ、最後は見回りを突く
function danger(F, x, z, pad) {
  for (const w of [...F.pat, ...F.netGuards]) {
    if (w.alerted || gone(w.g) || !w.on) continue;
    const dx = x - w.x, dz = z - w.z, d = Math.hypot(dx, dz);
    const R = w.R * (1 + F.alert * 0.12) + pad;
    if (d < 4 + pad || (d < R && Math.abs(ad(w.look, Math.atan2(dx, dz))) < HALF + 0.3)) return true;
  }
  return false;
}
sune.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.guardHold = false;
  if (!u.alive || F.ending) return;
  const fight = (e) => {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.8;
  };
  // 追っ手・見回りと戦う（まだ気づいていない見張りには手を出さない）
  const e = b.army.nearestEnemy(u, F.step >= 4 ? 80 : 14, (o) => !o.fleeing && (F.step >= 4 || o.group.order === 'attack'));
  if (e) { fight(e); return; }
  // 強右衛門が遅れていれば待つ
  const S = F.sune;
  if (Math.hypot(S.pos.x - u.pos.x, S.pos.z - u.pos.z) > 6 && F.step < 4) return;
  if (F.step === 1) {
    const rx = riverX(NET_Z);
    if (!F.netCut) {
      const cut = { x: rx, z: NET_Z - 1.5 };
      const d = Math.hypot(cut.x - u.pos.x, cut.z - u.pos.z);
      if (d < 2.4) { if (!danger(F, u.pos.x, u.pos.z, 0)) inp.k.add('KeyE'); return; }
      const nz = Math.min(NET_Z - 1.5, u.pos.z + 5);
      if (danger(F, riverX(nz), nz, 1) && d > 4) return;
      if (u.pos.z > NET_Z - 12) goTo(p, inp, cut.x, cut.z, 1); else goTo(p, inp, riverX(nz), nz, 0.8);
      return;
    }
    const nz = Math.min(EXIT.z - 4, u.pos.z + 5);
    const tgt = u.pos.z > EXIT.z - 10 ? EXIT : { x: riverX(nz), z: nz };
    if (danger(F, tgt.x, tgt.z, 1) && !danger(F, u.pos.x, u.pos.z, 0)) return;
    goTo(p, inp, tgt.x, tgt.z, 0.8);
    return;
  }
  if (F.step === 2) {
    const d = Math.hypot(KANBO.x - u.pos.x, KANBO.z - u.pos.z);
    if (d < 2.4) { inp.k.add('KeyE'); return; }
    goTo(p, inp, KANBO.x, KANBO.z, 1.5);
    return;
  }
  if (F.step === 4 && F.purs && F.purs.count) { const c = F.purs.center(); goTo(p, inp, c.x, c.z, 3); }
};

export { sune };
