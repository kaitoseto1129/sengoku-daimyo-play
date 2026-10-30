// ======================================================================
// 稲生の戦い（kaito 10/29 夜の仕様 docs/inou_spec_1029.md）
// 南北300m×東西150m。南端から北の土手の林美作守へ。正面の道と葦原の脇道。
// 行き先は美作守の高い赤い旗印だけ（ピン・矢印・小さな地図は出さない）。
// 雑兵は北へ退く槍兵（8mで振り向く）と立ち止まる弓兵。近づいた区画から出す。
// 乱戦激戦（kaito 10/29 夜「同時2体・画面15体は無視。乱戦激戦にしないと」）：正面の道には味方と林勢が押し合う乱戦の塊を
// 先々に置き続け、本人は四方から攻められる（同時に打つのは四人まで。組頭と味方が横で受け止める）。土手は取り巻きと林勢の最後の踏ん張り。
// 地面・田・草・甲冑の見た目は前の稲生（b_inou.js）の world を使う。座標：南が +z、北が −z。
// ======================================================================
import * as THREE from 'three';
import { inou as OLD } from './b_inou.js';
import { enemyGroup, allyGroup } from './bhelp.js';
import { nobori } from './props.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { victoryMoment } from './victory_moment.js';
import { sfx } from './audio.js';

const XW = 74, ZS = 146, ZN = -146;           // 見えない壁（東西 ±74・南北 ±146）
const START = { x: 12, z: 136 };
const BOSS = { x: 8, z: -134 };               // 北の土手の上
const FLAG = { x: 8, z: -139 };
const FRONT_X = 12;                            // 正面の道
const SIDE = [[-40, 150], [-46, 80], [-36, 0], [-44, -80], [-30, -122], [0, -132]];   // 葦原の脇道
const sideX = (z) => { for (let i = 0; i < SIDE.length - 1; i++) { const [ax, az] = SIDE[i], [bx, bz] = SIDE[i + 1]; if (z <= az && z >= bz) return ax + (bx - ax) * (az - z) / (az - bz); } return SIDE[SIDE.length - 1][0]; };
const REAL_CAP = 150;                          // 戦う本物の兵の上限（iPhone の重さ。近くは本物の形の兵だけ）
const ALLY_CAP = 52;                           // 味方の本物の兵の上限
// 乱戦の塊：正面の道の先々で、味方の組と林勢の組が組み合う（主人公の 72m 先までに来たら出す）
const KNOTS = [122, 108, 86, 64, 42, 20, -2, -24, -46, -68, -90];
const TURN = 8;                                // 槍兵が振り向く近さ
const BOW_RANGE = 30;
const BOSS_RANGE = 20;
const BOSS_HP = 115;                           // 美作守の命（四方から攻められる分、一騎打ちは四十秒〜一分に収まるよう軽く）
// 雑兵の装い：黒・茶・柿渋（青にしない）。旗指物は赤でない物
const ZAKO = { armor: 0x2e2822, hatColor: 0x1c1916, lace: 0x6a4a30, cloth: 0x7a5236, flag: 'kari', flagShape: 1 };
const dress = (list) => list.map((s) => ({ ...s, o: { ...ZAKO, ...(s.o || {}) } }));
// 区画：z は区画の中ほど。出すのは主人公がこの z の 75m 内に来た時
const SECTIONS = [
  ...[96, 70, 44, 16, -14, -40, -64].map((z, i) => ({ id: 'f' + i, kind: 'spear', n: 5, x: FRONT_X + (i % 2 ? 5 : -5), z })),
  // 葦原の脇道：少ない敵が葦に潜む（しゃがんで待ち、7m で飛び出す）
  ...[96, 58, 20, -18, -56, -92].map((z, i) => ({ id: 's' + i, kind: 'lurk', n: i % 2 ? 2 : 3, x: sideX(z) + (i % 2 ? 3.5 : -3.5), z })),
  { id: 'b0', kind: 'bow', n: 2, x: FRONT_X + 18, z: -62 }, { id: 'b1', kind: 'bow', n: 2, x: FRONT_X - 14, z: -112 },
  { id: 'b2', kind: 'bow', n: 2, x: sideX(-30) - 12, z: -30 },
];

// 北の土手：z −118 から −132 にかけて二メートル半ほど上がる
const bank = (z) => { const k = Math.max(0, Math.min(1, (-118 - z) / 14)); return k * k * (3 - 2 * k) * 2.6; };
const baseH = OLD.world.height;
const height = (x, z) => baseH(x, z) + bank(z);

// 稲架（10/30 採点「稲架が無い」）：25秒の所（道の z 100〜110）から八方のどこを向いても一〜二基が入るよう、道の東西と前後に四基。
// 杭と横木と垂らした稲束を、頂点の色だけの材質一つ・形一つにまとめる（絵は足さない。描く数は一つ。影は落とさない）。束は五角の筒で軽く。
// 当たりは付けない（兵の歩く道を変えない）。道（x 12）と葦原の脇道からは離す。
const HASA = [[-6, 92, 0.12, 8], [31, 96, -0.08, 7], [33, 121, Math.PI / 2 + 0.1, 8], [-8, 120, Math.PI / 2 - 0.12, 7]];
function hasaField(rt) {
  const W = rt.world, parts = [], c = new THREE.Color(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), O = new THREE.Vector3(1, 1, 1);
  const paint = (g, hex, k) => { c.setHex(hex).multiplyScalar(k); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.index) { const ng = g.toNonIndexed(); g.dispose(); return ng; } return g; };
  for (const [x, z, rot, len] of HASA) {
    const one = [], tiers = 2, top = 0.75 + tiers * 0.55, n = Math.max(2, Math.round(len / 1.8));
    for (let i = 0; i <= n; i++) { const p = new THREE.CylinderGeometry(0.045, 0.06, top + 0.35, 5, 1, true); p.rotateZ(0.03 * Math.sin(i * 2.7)); p.translate((i / n - 0.5) * len, (top + 0.35) / 2 - 0.15, 0); one.push(paint(p, 0x5a4a38, 0.75 + 0.15 * Math.abs(Math.sin(i * 1.9)))); }
    for (let t = 0; t < tiers; t++) {
      const y = 0.75 + (t + 1) * 0.55 - 0.05;
      const bar = new THREE.CylinderGeometry(0.03, 0.03, len + 0.5, 4, 1, true); bar.rotateZ(Math.PI / 2); bar.translate(0, y, 0); one.push(paint(bar, 0x625240, 0.85));
      const m = Math.floor(len / 0.17);
      for (let k = 0; k < m; k++) {
        const lx = -len / 2 + 0.1 + k * 0.17 + 0.02 * Math.sin(k * 3.1 + t);
        const r1 = Math.abs(Math.sin(k * 12.9898 + t * 78.233 + x) * 43758.5453) % 1, r2 = Math.abs(Math.sin(k * 4.1 + t * 9.7 + z) * 9631.7) % 1;
        if (r1 < 0.07) continue;
        const h = 0.42 + 0.22 * r2, k0 = 0.8 + 0.22 * r1 - 0.07 * (tiers - 1 - t);
        for (const s of [-1, 1]) {
          const g = new THREE.CylinderGeometry(0.06 + 0.025 * r2, 0.1 + 0.03 * r1, h, 5, 1, true); g.scale(1, 1, 0.6); g.rotateZ((r1 - 0.5) * 0.22);
          g.rotateX(-s * 0.2); g.translate(lx, y - h / 2 + 0.03, s * 0.07);
          one.push(paint(g, r2 < 0.2 ? 0x8a7a5c : s > 0 ? 0xa89878 : 0x9c8c6e, k0));
        }
      }
    }
    const g = mergeGeometries(one); for (const q of one) q.dispose();
    M.compose(V.set(x, W.heightAt(x, z) - 0.05, z), Q.setFromEuler(E.set(0, rot, 0)), O); g.applyMatrix4(M); parts.push(g);
  }
  const geo = mergeGeometries(parts); for (const q of parts) q.dispose();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  mesh.name = 'hasaField'; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  rt.scene.add(mesh);
}

// 葦原：脇道の両側に背の高い葦（一つの InstancedMesh）
function reeds(rt) {
  const W = rt.world, blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.05, 0, 0, 0.05, 0, 0, 0.02, 2.5, 0.06, -0.05, 0, 0, 0.02, 2.5, 0.06, -0.03, 1.2, 0.02], 3));
  blade.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8150, roughness: 0.95, side: THREE.DoubleSide });
  const pts = [];
  let s = 1556;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let z = 128; z > -116; z -= 0.55) {
    const cx = sideX(z);
    for (let k = 0; k < 6; k++) {
      const off = (2.2 + rnd() * 10) * (rnd() < 0.5 ? -1 : 1);
      pts.push([cx + off, z + (rnd() - 0.5) * 0.5, rnd()]);
    }
  }
  const m = new THREE.InstancedMesh(blade, mat, pts.length);
  const o = new THREE.Object3D(), c = new THREE.Color();
  pts.forEach(([x, z, r], i) => {
    o.position.set(x, W.heightAt(x, z) - 0.05, z);
    o.rotation.set((r - 0.5) * 0.25, r * Math.PI * 2, (rnd() - 0.5) * 0.25);
    const sc = 0.75 + r * 0.55; o.scale.set(1, sc, 1); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    c.setRGB(0.5 + r * 0.12, 0.47 + r * 0.1, 0.27 + r * 0.05); m.setColorAt(i, c);
  });
  m.frustumCulled = false; m.receiveShadow = true;
  rt.scene.add(m);
}

// どこからでも見える美作守の旗印（赤い大幟。霧に消されない・光に沈まない）。
// 写す距離は 150m までなので、遠い間は同じ見かけの大きさのまま 135m の所へ寄せて立てる
function bossFlag(rt) {
  const f = nobori(rt.world, 0, 0, 'aka_kari', 9);
  // 朱（雑兵の黒・茶・柿渋と違う鮮やかな赤）に染め直す。元の絵の黄みを使わず、朱の地に白い丸い紋を自前で描く
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
  const g = cv.getContext('2d'); g.fillStyle = '#d4221a'; g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#f4ece0'; g.beginPath(); g.arc(32, 44, 15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d4221a'; g.beginPath(); g.arc(32, 44, 8, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const red = new THREE.MeshBasicMaterial({ map: tex, fog: false, side: THREE.DoubleSide, toneMapped: false });
  const pole = new THREE.MeshBasicMaterial({ color: 0x3a2a1a, fog: false, toneMapped: false });
  f.traverse((o) => {
    if (o.material) o.material = o.isMesh && o.parent === f.userData.flag ? pole : red;
    o.frustumCulled = false;
  });
  f.userData.base = { x: f.scale.x * 14, y: f.scale.y * 6.6 };   // 遠くからも見えるよう、二倍以上の高い大幟
  rt.scene.add(f);
  rt.flags.flag = f;
}
function flagTick(rt) {
  const f = rt.flags.flag, c = rt.camera;
  if (!f || !c) return;
  const dx = FLAG.x - c.position.x, dz = FLAG.z - c.position.z, d = Math.hypot(dx, dz) || 1, R = 135;
  const k = d > R ? R / d : 1, x = c.position.x + dx * k, z = c.position.z + dz * k;
  const W = rt.world, y0 = W.heightAt(FLAG.x, FLAG.z);
  f.position.set(x, c.position.y + (y0 - c.position.y) * k, z);
  f.scale.set(f.userData.base.x * k, f.userData.base.y * k, f.userData.base.x * k);
}

const aliveFoes = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && u.team === 1 && !u.civ ? 1 : 0), 0);
const aliveReal = (rt, team) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && u.type !== 'porter' && (team == null || u.team === team) ? 1 : 0), 0);
const live = (g) => g && g.units.some((u) => u.alive && !u.gone);
// 兵の割合（kaito 10/28）：槍が主・侍一人・弓か鉄砲一人（1556 は鉄砲が少ない）。背の指物は多めに立てて林立させる
const foeKnot = (i, n = 8) => dress([{ type: 'ashigaru', n: Math.ceil((n - 2) * 0.6), o: { flagScale: 1 } }, { type: 'ashigaru', n: (n - 2) - Math.ceil((n - 2) * 0.6) },
  { type: 'samurai', n: 1 }, { type: i % 3 === 0 ? 'gun' : 'bow', n: 1 }]);
const allyKnot = (n = 6) => [{ type: 'ashigaru', n: n - 2, o: { flagScale: 1 } }, { type: 'ashigaru', n: 1 }, { type: 'samurai', n: 1 }];

const inou_spec = {
  missionStyle: 'lesson',
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,   // 共通の物見の足軽は足さない（乱戦の塊はこの定義が置く）
  playerAtkMax: 4,           // 四方から同時に打つのは四人まで（五人目からは後ろで待つ）
  enemyTactics: false,       // 敵の動きはこの定義が決める（退く槍・立つ弓）
  noFieldMap: true,
  noMiniMap: true,           // 小さな地図も出さない（行き先は赤い旗印だけ）
  hideArmyPeek: true,
  hideGuideSteps: true,
  missionSingleLine: true,
  noPlayerFoot: true,
  nearbyAllySignLimit: 0,
  foeMarks: true,
  enemyTriangleSigns: true,
  foeMarkRange: 30,
  missionPin: () => null,       // 行き先は旗印だけ
  missionPinCaption: '',
  learningFight: true,
  playerTaken: 0.42,         // 四人まで同時に打たれる乱戦なので、一太刀は前より軽く（前は二人で 0.6）
  playerRegen: 0.02,
  pacingWait: () => true,
  botDefendsFort: true,      // bot：矢を避けて物陰へ下がらず、赤い旗へ進む
  autoTargetCamera: true,
  steadyMeleeCamera: true,
  closeCombatAssist: true,
  noWinCrane: true,
  compactIntro: true,
  introText: () => '柴田勝家の軍勢が崩れて退いた。退く信勝方の殿（しんがり）を務める林美作守（はやしみまさかのかみ）を討て。',
  minutes: 8,
  spawn: { x: START.x, z: START.z, heading: Math.PI },
  world: {
    ...OLD.world,
    height,
    paths: [{ pts: [[FRONT_X, 160], [FRONT_X, -118], [BOSS.x, -134]], w: 4 }, { pts: SIDE, w: 2 }],
    // 屋敷林の帯（10/30）：前の稲生の林は |x|≤56 で外れ、25秒の所（道の z 108 あたり）から八方のどこを向いても林が写らなかった。
    // 道（x 12）を挟んで東西に杉の帯（東 48m・西 76m）、出だしの裏（南）と土手の奥（北）にも帯を回し、田の四方を黒い緑で塞ぐ。
    // 東の小川（x 72）・葦原（x −58 まで）・道は空ける。帯の中心は戦う所から遠く、林の見通し減（groves の r）は道に掛からない。
    groves: [...(OLD.world.groves || []).filter((g) => Math.abs(g.x) > 56 && Math.abs(g.z) < 140),
      { x: 60, z: 0, line: [0, 300], r: 3, n: 115, kind: 'sugi' }, { x: -64, z: 0, line: [0, 300], r: 3, n: 115, kind: 'sugi' },
      { x: -34, z: 154, line: [80, 0], r: 3, n: 31, kind: 'sugi' }, { x: 46, z: 154, line: [56, 0], r: 3, n: 22, kind: 'sugi' },
      { x: 0, z: -152, line: [148, 0], r: 3, n: 57, kind: 'sugi' },
      // 裏の二列目（外へ四・五m）：一列では幹の間に空が抜けた。少なめの株で前の列の隙間を塞ぐ。
      { x: 64.5, z: 0, line: [0, 300], r: 3, n: 70, kind: 'sugi' }, { x: -68.5, z: 0, line: [0, 300], r: 3, n: 70, kind: 'sugi' },
      { x: -34, z: 158.5, line: [80, 0], r: 3, n: 19, kind: 'sugi' }, { x: 46, z: 158.5, line: [56, 0], r: 3, n: 14, kind: 'sugi' },
      { x: 0, z: -156.5, line: [148, 0], r: 3, n: 35, kind: 'sugi' }],
    // 田と畦の色（10/30）：前の稲生の田は |z|≤120 までで、出だしの南（z 120〜146）と土手の手前が砂色の野のままだった。
    // 南北の端も同じ 24×20m の区画の色（畦の土色の筋と稲の縞）で塗る。区画の並びは 20m ごとなので、z をずらして前の式を借りる。
    tint(x, z, h, c) { OLD.world.tint(x, z > 120 && z < 180 ? z - 60 : z < -120 && z > -160 ? z + 40 : z, h, c); },
    // 稲の縞（10/30 採点「稲の縞が無く地が土の一色」）：田の色は藁色なので、色から読む草の割合が 0 になり、田の全部が土の絵だった。
    // 田の中は草の絵（藁色に染まって稲の株に見える）を区画ごとに多め・少なめにし、刈った区画は株の列と土の列を交互に（東西の縞）。
    // 頂点の割合だけを変える（形・絵・描く数は増えない）。道と畦の肩は土のまま。
    grassMix(x, z, pd) {
      if (pd < 1.3 || Math.abs(x) > 112) return 0;
      const zz = z > 120 && z < 180 ? z - 60 : z < -120 && z > -160 ? z + 40 : z;
      if (Math.abs(zz) > 120) return 0;
      const ex = Math.abs(x - Math.round(x / 24) * 24), ez = Math.abs(zz - Math.round(zz / 20) * 20);
      if (Math.min(ex, ez) < 1.3) return 0.15;
      const f = Math.sin(Math.round(x / 24) * 12.9898 + Math.round(zz / 20) * 78.233) * 43758.5453, r = f - Math.floor(f);
      const row = Math.round((z + 320) / (640 / 144)) % 2;
      return r > 0.6 ? 0.7 + 0.2 * r : row ? 0.85 : 0.08;
    },
    // 10/30 採点「地が土の一色」：上の tint は地面の色にならない（tint の色は草の割合を読むためだけで、草の割合は grassMix が上書きする）。
    // 地の色は藁色の草の絵と土の絵の二つだけで、土は明るい砂色寄り・藁と同じ色相だったので一色に見えた。
    // 数で見ると、25秒の画面の地面の画素のうち緑が勝つのは3%だけで、共通の重ね塗り（landOverlay）の草の斑・株のむらは掛からず、土の明暗だけが効いていた。
    // 刈った区画と踏まれた所の土を湿った黒褐へ沈めて藁の株と分け、株の抜けた裸地の斑（patchyGround）を足す（絵・形・描く数・足場は同じ）。
    dirtTint: [0.5, 0.45, 0.38],
    patchyGround: true,
    autumn: true,   // 八月二十四日（今の九月末）の刈り入れ時：田の草の絵を枯れた藁色に（地面の描き方の枝を替えるだけ。絵は増えない）
    // 西の於多井川（x −145）は見えない壁（±74）と杉の二重の帯と霞の向こうで見えないのに、水面と岸を描いていた（10/30）。
    // 外して、稲架の描く一つと三角の分を相殺する。東の小川（x 72）は残す。
    streams: OLD.world.streams.slice(1),
    clear: (x, z) => Math.abs(x) < 80 && Math.abs(z) < 150,
    fleeOut: (x, z, team) => team === 1 && z < -150,
    armyFlagKinds: undefined,
  },

  setup(rt) {
    const F = rt.flags;
    rt.def.playerAtkMax = 4;
    F.sec = {}; F.groups = []; F.holdPlayer = true; F.knots = []; F.allyGs = []; F.dinT = 2;
    reeds(rt);
    hasaField(rt);
    bossFlag(rt);
    // 夏の終わりの薄雲と霞（前の稲生の setup と同じ。この戦の setup は前の物を呼ばないので、ここで掛ける）：
    // 霞を緑がかった灰に、日を弱めて影を柔らかく。昼の霞だけ百五十mで閉じ、五十〜八十m先の杉の帯を白く透かさない。
    // 兵を描く遠さと敵を見つける見通し（W.vis）は変えない。
    { const W = rt.world, lookOf = W.lookOf, upd = W.update;
      W.lookOf = function (key) { const L = lookOf.call(this, key); if (key === 'day') { L.fog.setHex(0x8c9a8e); L.sunI *= 0.78; L.hemiI *= 1.18; L.cover = Math.max(L.cover, 0.62); } return L; };
      if (W.timeKey === 'day') W.applyLook(W.lookOf('day'));
      W.update = function (...a) { const r = upd.apply(this, a), fog = this.scene.fog, f = Math.floor(fog.far);
        if (this.timeKey === 'day' && f >= 85 && f < 150) fog.far = 150 + (fog.far - f); return r; }; }
    // 組頭（倒されない）と味方の足軽四人
    F.kumi = allyGroup(rt, { name: '組頭', anchor: { x: START.x + 2, z: START.z }, facing: Math.PI, aggro: 6, speed: 4.2, order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '組頭', invuln: true } }]);
    F.kumiU = F.kumi.units[0];
    F.allies = allyGroup(rt, { name: '味方の足軽', anchor: { x: START.x, z: START.z + 4 }, facing: Math.PI, aggro: 9, speed: 3.6, order: 'move', dest: { x: FRONT_X, z: -100 } },
      [{ type: 'ashigaru', n: 4 }]);
    F.allies.ai = true;
    rt.obj('main', '林美作守を討て', 'main');
    // 組頭の三つの台詞（字幕）。終わるまで動けない
    const L = [['柴田の軍勢は崩れたぞ！', 0.6], ['林美作の殿がまだ踏みとどまっておる。あの赤い旗じゃ！', 3.4], ['討ち取って手柄にせい、行けっ！', 7.2]];
    for (const [s, t] of L) rt.after(t, () => rt.say('組頭', s, 2.8));
    rt.after(9.6, () => { F.holdPlayer = false; });
  },

  spawnSection(rt, S) {
    const F = rt.flags;
    const g = enemyGroup(rt, { faction: 'nobukatsu', name: S.kind === 'bow' ? '林勢の弓' : '林勢の槍', anchor: { x: S.x, z: S.z }, facing: 0, fleeDir: { x: 0, z: -1 }, width: S.kind === 'lurk' ? 2 : 4,
      noRout: true, formation: 'line', morale: 70, dmgMult: 0.55,
      ...(S.kind === 'bow' ? { order: 'hold', aggro: 0, fire: false, fixed: true }
        : S.kind === 'lurk' ? { order: 'hold', aggro: 0, fire: false, ambush: true }
          : { order: 'retreat', dest: { x: S.x, z: -150 }, speed: 0.6, aggro: 0, fire: false }) },
    S.kind === 'bow' ? dress([{ type: 'bow', n: S.n }]) : dress([{ type: 'ashigaru', n: S.n - 2, o: { flagScale: 1 } }, { type: 'ashigaru', n: 2 }]));
    g.secKind = S.kind;
    F.groups.push(g);
  },

  // 乱戦の塊：味方の組（南）と林勢の組（北）を五歩の間で向き合わせ、始めから押し合い斬り合わせる
  spawnKnot(rt, z, i) {
    const F = rt.flags, side = i % 2 ? 1 : -1, x = FRONT_X + side * 3;
    const foe = enemyGroup(rt, { faction: 'nobukatsu', name: '林勢の槍', anchor: { x, z: z - 2.5 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 5,
      noRout: true, formation: 'line', morale: 85, dmgMult: 0.42, order: 'attack', seekRange: 24, aggro: 11, speed: 2.4 }, foeKnot(i, i % 2 ? 9 : 8));
    foe.secKind = 'knot'; F.groups.push(foe);
    const K = { z, foe, ally: null };
    if (aliveReal(rt, 0) < ALLY_CAP) {
      K.ally = allyGroup(rt, { name: '味方の足軽', fullStrength: true, anchor: { x: x - side, z: z + 2.5 }, facing: Math.PI, width: 4, aggro: 11, speed: 3.2,
        order: 'attack', seekRange: 24, dmgMult: 0.38, noRout: true }, allyKnot(i % 3 ? 6 : 7));
      K.ally.ai = true; F.allyGs.push(K.ally);
    }
    F.knots.push(K);
    rt.army.play('toki', { x, z }, 1.2);
  },

  // 新手：本人の近くで敵が薄くなった時、北の先（霧の中）から鬨を上げて駆け込む組
  spawnSurge(rt, P) {
    const F = rt.flags, i = (F.surgeN = (F.surgeN || 0) + 1), x = Math.max(-XW + 6, Math.min(XW - 6, P.pos.x + (i % 2 ? 8 : -8))), z = Math.max(-112, P.pos.z - 58);
    const g = enemyGroup(rt, { faction: 'nobukatsu', name: '林勢の新手', anchor: { x, z }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 4,
      noRout: true, formation: 'line', morale: 85, dmgMult: 0.42, order: 'attack', seekRange: 70, aggro: 12, speed: 3.4 }, foeKnot(i, 7));
    g.secKind = 'knot'; F.groups.push(g);
    rt.army.play('toki', { x, z }, 1.3);
  },

  // 土手の踏ん張り：美作守の左右に林勢の二組（侍まじり）。本人が近づくと味方の二組が鬨を上げて土手へ駆け上がる
  spawnBank(rt) {
    const F = rt.flags;
    F.bankG = [-1, 1].map((sd, i) => {
      const g = enemyGroup(rt, { faction: 'nobukatsu', name: '林勢の殿', anchor: { x: BOSS.x + sd * 12, z: BOSS.z + 6 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 5,
        noRout: true, formation: 'line', morale: 95, dmgMult: 0.42, order: 'hold', aggro: 14, speed: 2.6 },
      dress([{ type: 'ashigaru', n: 5, o: { flagScale: 1 } }, { type: 'ashigaru', n: 2 }, { type: 'samurai', n: 2 }, { type: 'bow', n: 1 }]));
      g.secKind = 'bank'; F.groups.push(g);
      return g;
    });
  },
  bankCharge(rt) {
    const F = rt.flags;
    F.bankAllies = [-1, 0, 1].map((sd) => {
      const g = allyGroup(rt, { name: '味方の足軽', fullStrength: true, anchor: { x: BOSS.x + sd * 12, z: -92 + Math.abs(sd) * 3 }, facing: Math.PI, width: 4, aggro: 12, speed: 3.6,
        order: 'move', dest: { x: BOSS.x + sd * 12, z: BOSS.z + 9 }, dmgMult: 0.38, noRout: true }, allyKnot(8));
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 26; };
      if (!sd) g.dest = { x: BOSS.x, z: BOSS.z + 12 };
      g.ai = true; F.allyGs.push(g);
      return g;
    });
    rt.army.play('toki', { x: BOSS.x, z: -96 }, 1.5); rt.after(0.5, () => sfx('taiko', 0.9));
  },

  spawnBoss(rt) {
    const F = rt.flags;
    // 大将は一人の備（列の後ろへ下がらない）。取り巻きの槍五人は前に別の備で
    F.bossG = enemyGroup(rt, { faction: 'nobukatsu', name: '林美作守', anchor: { x: BOSS.x, z: BOSS.z }, facing: 0, width: 1, noRout: true, noAI: true,
      order: 'hold', aggro: 0, morale: 100, dmgMult: 0.6, fixed: true },
    dress([{ type: 'busho', n: 1, o: { name: '林美作守', hat: 'kabuto_m', flag: 'aka_kari' } }]));
    F.guardG = enemyGroup(rt, { faction: 'nobukatsu', name: '林美作守の旗本', anchor: { x: BOSS.x, z: BOSS.z + 4 }, facing: 0, width: 5, noRout: true, noAI: true,
      formation: 'line', order: 'hold', aggro: 0, morale: 90, dmgMult: 0.55, fixed: true },
    dress([{ type: 'ashigaru', n: 5 }]));
    const b = F.bossU = F.bossG.units[0];
    const put = (u, x, z) => { u.pos.x = x; u.pos.z = z; u.pos.y = rt.world.heightAt(x, z); };
    put(b, BOSS.x, BOSS.z);
    F.guardG.units.forEach((u, i) => put(u, BOSS.x + (i - 2) * 2.4, BOSS.z + 3.5));
    // 四十秒〜一分で倒せる強さ（仮）
    b.maxHp = b.hp = BOSS_HP;
  },

  update(rt, dt) {
    const F = rt.flags;
    flagTick(rt);
    if (F.ending) return;
    const P = rt.player.u;
    // 見えない壁（時間切れで逃げる者は外へ出す）
    if (!rt.timeLimit?.up) for (const u of rt.army.units) {
      if (!u.alive || u.gone) continue;
      if (u.pos.x > XW) u.pos.x = XW; else if (u.pos.x < -XW) u.pos.x = -XW;
      if (u.pos.z > ZS) u.pos.z = ZS; else if (u.pos.z < ZN) u.pos.z = ZN;
    }
    // 組頭は主人公の脇に付いて北へ
    if ((F.kumiT = (F.kumiT || 0) - dt) <= 0) {
      F.kumiT = 0.5;
      const g = F.kumi;
      if (Math.hypot(F.kumiU.pos.x - P.pos.x, F.kumiU.pos.z - P.pos.z) > 4) { g.order = 'move'; g.dest = { x: P.pos.x + 2.5, z: P.pos.z + 1.5 }; }
      else g.order = 'hold';
    }
    if ((F.scanT = (F.scanT || 0) - dt) > 0) return;
    F.scanT = 0.25;
    // 区画と乱戦の塊を近い順に出す（本物の兵は REAL_CAP まで。美作守の備は先に出す）
    let n = aliveReal(rt);
    if (!F.bossG && P.pos.z < -40) { this.spawnBoss(rt); this.spawnBank(rt); n += 26; F.groups.push(F.guardG); F.guardG.secKind = 'guard'; }
    if (F.bossG && !F.bankAllies && P.pos.z < -84) this.bankCharge(rt);
    KNOTS.forEach((z, i) => {
      if (F.sec['k' + i] || P.pos.z - z > 72 || z > P.pos.z + 8 || n > REAL_CAP - 15) return;
      F.sec['k' + i] = true; this.spawnKnot(rt, z, i); n += 15;
    });
    // 先の塊が討ち尽くされても乱戦を絶やさない：本人の 15〜70m 先に戦う塊が無ければ、霧の際（55m 先）に新しい塊を置く
    if (!F.holdPlayer && P.pos.z > -78 && n < REAL_CAP - 15 && !F.knots.some((K) => live(K.foe) && K.z < P.pos.z - 5 && K.z > P.pos.z - 75)) {
      F.extraN = (F.extraN || 0) + 1; this.spawnKnot(rt, Math.max(-96, P.pos.z - 55), F.extraN + 1); n += 15;
    }
    for (const S of SECTIONS) {
      if (F.sec[S.id] || Math.abs(P.pos.z - S.z) > 75 || S.z > P.pos.z + 30) continue;
      if (n + S.n > REAL_CAP) break;
      F.sec[S.id] = true; this.spawnSection(rt, S); n += S.n;
    }
    // 塊の林勢が討たれ切ったら、残った味方の組は次の乱戦へ北上する
    for (const K of F.knots) {
      if (K.done || live(K.foe)) continue;
      K.done = true;
      const g = K.ally;
      if (live(g)) { g.order = 'move'; g.dest = { x: FRONT_X + (K.z % 2 ? 4 : -4), z: Math.max(-104, K.z - 26) }; g.speed = 3.4; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; }; }
    }
    // 新手：本人の 40m 内で戦う林勢が六人を切って八秒たてば、北の霧の中から一組（土手の手前まで）
    if (P.pos.z > -96 && !F.holdPlayer) {
      let near = 0;
      for (const u of rt.army.units) if (u.alive && !u.gone && u.team === 1 && u.type !== 'bow' && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) < 40) near++;
      if (near >= 6) F.thinT = rt.t; else if (rt.t - (F.thinT ?? rt.t) > 8 && n < REAL_CAP - 8) { F.thinT = rt.t; this.spawnSurge(rt, P); }
    }
    // 槍兵：8m で振り向いて戦う。退き切った者は（本人から遠い所でだけ）去らせる。弓兵：30m で射る。葦の伏兵：7m で飛び出す
    for (const g of F.groups) {
      let near = Infinity;
      for (const u of g.units) {
        if (!u.alive || u.gone) continue;
        if (g.order === 'retreat' && u.pos.z < -128 && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 70) { rt.army.despawn(u); continue; }
        near = Math.min(near, Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z));
      }
      if (g.secKind === 'bow') { const on = near < BOW_RANGE; g.fire = on; g.aggro = on ? BOW_RANGE : 0; }
      else if (g.secKind === 'lurk' && g.order === 'hold' && near < 7) { g.order = 'attack'; g.focus = P; g.aggro = 10; g.speed = 3.4; rt.army.play('eshout', P.pos, 1); }
      else if (g.order === 'retreat' && near < TURN) { g.order = 'attack'; g.focus = P; g.aggro = 10; g.speed = 3; }
    }
    // 乱戦の音：近い塊ごとに、足音の地響き・鬨・槍の打ち合いを順に重ねる（人数で厚く）
    if ((F.dinT -= 0.25) <= 0) {
      F.dinT = 1.4 + Math.random() * 1.2;
      let best = null, bd = 80;
      for (const g of F.groups) {
        if (!g.count || g.order === 'retreat' || g.secKind === 'bow' || g.secKind === 'lurk') continue;
        const c = g.center(), d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
        if (d < bd && d > 6 && g.units.some((u) => u.alive && u.target)) { bd = d; best = c; }
      }
      if (best) {
        const k = (F.dinK = ((F.dinK || 0) + 1) % 4), v = Math.min(1.4, 0.7 + 30 / (bd + 20));
        rt.army.play(k === 0 ? 'tramp' : k === 1 ? 'shaftContact' : k === 2 ? 'eshout' : 'clash', { x: best.x, z: best.z }, v);
      }
    }
    // 美作守と取り巻き：20m で戦い始める
    const B = F.bossU;
    if (B && !F.bossOn && Math.hypot(B.pos.x - P.pos.x, B.pos.z - P.pos.z) < BOSS_RANGE) {
      F.bossOn = true;
      for (const g of [F.bossG, F.guardG]) { g.noAI = false; g.order = 'hold'; g.aggro = 14; }   // 土手を離れず、近づいた者と戦う
    }
    // 殿は土手から離れない（追っても 14m で戻る）
    if (B?.alive && F.bossOn && !rt.timeLimit?.up) {
      const g = F.bossG, d = Math.hypot(B.pos.x - BOSS.x, B.pos.z - BOSS.z);
      if (d > 14 && g.order !== 'move') { g.order = 'move'; g.dest = { x: BOSS.x, z: BOSS.z }; g.speed = 3; B.target = null; B.atk = null; }
      else if (d < 3 && g.order === 'move') g.order = 'hold';
    }
    // 美作守との一騎打ちの間（8m 内）は、取り巻きと林勢は周りで味方と斬り合い、本人へ同時に打つのは美作守ともう一人まで
    if (B?.alive) rt.def.playerAtkMax = F.bossOn && Math.hypot(B.pos.x - P.pos.x, B.pos.z - P.pos.z) < 8 ? 2 : 4;
    if (B && !B.alive) this.win(rt);
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main');
    rt.tracker.main = true;
    rt.player.u.invuln = true;
    rt.say('組頭', '林美作守、討ち取ったり！', 3);
    victoryMoment(rt, '勝');
    rt.finish({ scriptedEnd: true }, 3.5);
  },

  // bot：近い敵を突き、いなければ赤い旗へ
  botBrain(b, inp, { goTo, patientStrike }) {
    const p = b.player, u = p.u, F = b.flags;
    if (F.holdPlayer) return;
    const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 3;
    const prev = p.botStrikeFoe;
    // 始めの一分は北（前）の敵を先に突く：画面の奥へ乱戦が続き、赤い旗印も向きの先に入る
    const front = (o) => ok(o) && o.pos.z < u.pos.z + 0.5;
    const e = prev?.alive && ok(prev) && p.botStrikeUntil > p.time && Math.hypot(prev.pos.x - u.pos.x, prev.pos.z - u.pos.z) < 2.8 ? prev : (F.bossU?.alive && ok(F.bossU) && Math.hypot(F.bossU.pos.x - u.pos.x, F.bossU.pos.z - u.pos.z) < 9 ? F.bossU : (b.t < 60 && b.army.nearestEnemy(u, 8, front)) || b.army.nearestEnemy(u, F.bossU?.alive || b.t > 200 ? 4 : 8, ok));
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d, true);
      return;
    }
    inp.guardHold = false;
    const B = F.bossU?.alive ? F.bossU.pos : BOSS;
    goTo(p, inp, B.x, B.z + 2, 2);
  },
};
inou_spec.history = OLD.history;
inou_spec.timeslip = OLD.timeslip;

export { inou_spec };
