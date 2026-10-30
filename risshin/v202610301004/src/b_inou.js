import { useTerrain } from './asset_manifest.js';
// ======================================================================
// 尾張統一戦　稲生の戦い（弘治二年八月二十四日・1556）
// 信長の七百が、弟の信勝（信行）方の千七百（柴田勝家 千・林美作守 七百）と、於多井川（庄内川）の東の稲生の野で戦う。
// 足軽は信長の旗本の足軽。組頭の源八の下で、信長の旗のそばに立つ。
// 前半は集合・行軍・林の小戦で基本操作を教え、士気を見てから柴田隊との主戦へ進む。
// 後半は側面・指揮官を教え、信長の前進から部隊の崩れ・追撃・勝家の退きへつなぐ。
// 向き：x が東（+x）、z が南（+z）。北に信勝・林、集落、柴田。南に信長、その脇に佐久間と遊び手。
// 地形は国土地理院の標高（asset_dem_inou.js）。今の堤は高すぎるので、高さを丸めて昔の平らな野に寄せる。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadGroundPhoto } from './ground_photo.js';
import { nobori, jinCamp, jinmaku, solidRect, hut, tawara, kagaribi, umatsunagi, umajirushi, hatazao, takataba, dou, nabe, hasa, solidCircle, palisade, dorui, yagura, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { woodTex, thatchTex } from './nature.js';
import { INOU_KACCHU } from './kacchu_data.js';
import { sfx, musicAccent, musicTension } from './audio.js';
import { enemyFlagKinds } from './textures.js';
import { victoryMoment, brushWord } from './victory_moment.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { demSample } from './dem.js';
import { S as SETTINGS } from './settings.js';
import { usesTouchControls } from './touch.js';
import { timeslipField, fieldGrassGeo, fieldGrassMat } from './timeslip_field.js';
import { inouSignHeight } from './battle_sight.js';
import { distToPolyline } from './world.js';
import { porterTrain } from './porters.js';

// 六百四十メートル四方。会戦は中央の百五十メートルほどへ詰める（配置は設計の復元）。
const RIVER = [[-148, -320], [-144, -120], [-152, 20], [-142, 160], [-150, 320]];
const NOBU = { x: 0, z: 52 };
const FLANK = { x: 24, z: 18 }; // 右の畦から柴田隊の横へ
const NAZUKA = { x: -44, z: 62 };       // 佐久間の持ち場。砦は戦場へ持ち込まない
const SHIBA0 = { x: 0, z: -16 };
const HAYA0 = { x: -24, z: -46 };
const HAYA1 = { x: -24, z: 20 };
const VILLAGE = [[-12, -66, 0.2], [16, -72, -0.3], [-22, -78, 0.5], [30, -62, 0.1]];
// 土の街道と、田を区切る畦は同じ座標を描画と歩みに使う。
const PATHS = [{ pts: [[0, 320], [0, 60], [0, 20], [0, -40], [0, -100], [12, -320]], w: 4 }];   // 村の街道は二間ほど（10/28：六歩の幅で道の両脇まで土に見えた）
for (const x of [-96, -72, -48, -24, 24, 48, 72, 96]) PATHS.push({ pts: [[x, -120], [x, 120]], w: 2.4 });
for (const z of [-120, -100, -80, -60, -40, -20, 0, 20, 40, 60, 80, 100, 120]) PATHS.push({ pts: [[-112, z], [112, z]], w: 2.4 });
// 里の生活道。西は庄内川の手前、東は用水の西岸を南へ抜ける。
const WEST_ESCAPE = [{ x: -36, z: -72 }, { x: -36, z: -100 }, { x: -72, z: -100 }, { x: -124, z: -100 }];
const EAST_ESCAPE = [{ x: 48, z: -56 }, { x: 48, z: -40 }, { x: 60, z: -40 }, { x: 60, z: 120 }, { x: 60, z: 156 }];
PATHS.push({ pts: [[-30, -72], ...WEST_ESCAPE.map(p => [p.x, p.z])], w: 2.4 },
  { pts: [[36, -56], ...EAST_ESCAPE.map(p => [p.x, p.z])], w: 2.4 });
// 名塚砦の存在は史実だが、家々・民の居所と生活道の細部は遊びのための推定。
// 参考：https://nagoya-eiketsu.jp/contents/shiseki/437/
// 城下や寺の位置は断定しない。僧・商人・町人は里を通る旅の者として置く。
const PEOPLE_BANDS = [
  { x: -48, z: -100, kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'],
    watchAt: { x: -24, z: -46 }, route: WEST_ESCAPE.slice(2) },
  { x: 48, z: -60, kinds: ['farmer', 'townsman', 'merchant', 'monk'],
    watchAt: { x: 0, z: -38 }, route: EAST_ESCAPE },
  // 西の家の脇と東の家の南側。軒を横切らず、それぞれの生活道へ出る。
  { x: -30, z: -72, kinds: ['farmer', 'woman', 'child'], mode: 'inside', route: WEST_ESCAPE },
  { x: 36, z: -56, kinds: ['woman', 'child', 'elder'], mode: 'inside', route: EAST_ESCAPE },
];
// 刈田の畦（10/28 資料との差「中央の野が乾いた土ばかり」）：田の区画の縁に低い土の畦を盛り、田の中は刈り株の色にする。
// 区画は paddy() と同じ 24×20m。畦は幅 1.2m・高さ 0.22m。兵の足を止めない低さ。
function azeAt(x, z) {
  if (Math.abs(x) > 112 || Math.abs(z) > 120 || Math.abs(x) < 3) return -1;
  if (Math.abs(x) < 38 && z > -86 && z < -52) return -1;
  if (Math.hypot(x - NAZUKA.x, z - NAZUKA.z) < 12) return -1;
  const ex = Math.abs(x - Math.round(x / 24) * 24), ez = Math.abs(z - Math.round(z / 20) * 20);
  return Math.min(ex, ez);
}
function paddy(x, z) {
  if (Math.abs(x) > 112 || Math.abs(z) > 120 || Math.abs(x) < 3) return 0;
  if (Math.abs(x) < 38 && z > -86 && z < -52) return 0; // 集落の庭と畑
  if (Math.hypot(x - NAZUKA.x, z - NAZUKA.z) < 12) return 0;
  const ex = Math.abs(x - Math.round(x / 24) * 24), ez = Math.abs(z - Math.round(z / 20) * 20);
  return Math.max(0, Math.min(1, (Math.min(ex, ez) - 1.2) / 0.8)) * 0.7;
}
function moveWay(army, u, want) {
  // 槍を合わせる間と目的地の近くでは自由に動く。行軍だけ近い畦へ寄る。
  const x = u.pos.x, z = u.pos.z, dx = want.x - x, dz = want.z - z;
  if (u.mounted || u.target || u.atk || u.swing || Math.abs(x) > 110 || Math.abs(z) > 118 || dx * dx + dz * dz < 144) return want;
  const q = u._inouWay; // 支度で用意し、毎コマは作らない
  if (!q || Math.abs(x) < 3 && Math.abs(dx) < 6) return want;
  const d = Math.hypot(dx, dz);
  q.x = x + dx / d * 6; q.z = z + dz / d * 6;
  // 前へ進む力を残し、畦への寄せは二歩まで。曲がり角で往復・停止させない。
  if (Math.abs(dz) > Math.abs(dx)) q.x += Math.max(-2, Math.min(2, (Math.round(x / 24) * 24 - x) * 0.6));
  else q.z += Math.max(-2, Math.min(2, (Math.round(z / 20) * 20 - z) * 0.6));
  return q;
}
function prepareMarch(g) {
  g.spacing = 1.25;
  for (const u of g.units) u._inouWay = { x: u.pos.x, z: u.pos.z };
}

// 信勝方は弁柄（赤茶の漆）の具足、信長方は黒漆に紺の威。ネオンにせず、近くでも遠くでも色の系統で分かる（kaito 10/22 稲生 3）。
// 彩度の低い茶は人の甲冑の色替えで無視されるため、弁柄の赤みを残す。
// 笠にも同じ漆色を通す。旗を読めない近さでも、黒漆の味方と弁柄の敵を見分ける。
// 指物は敵が縦長、味方が横広。旗の本数や材質を増やさず形でも区別する。
// 信勝方は朱の具足に黄土の鎧下、旗は朱染め（world.armyFlagKinds）。織田の藍と黒から一目で分ける（テスターの声 10/26）。
// 10/28：一様な朱は「赤備え」に見え 1556 の織田家中に合わない。柴田は弁柄、林は鉄錆に沈め、赤みは残して黒漆の味方と分ける。
const SHIBA = { armor: 0x2e2822, hatColor: 0x1c1916, lace: 0x6a4a30, cloth: 0x6a5a44, flag: 'kari', flagShape: 1 };
// 林の当日の旗は未確認。丹羽の筋違いを借りず、織田家中の隊旗による復元とする。
// 林だけ朱染めを直接指定し、味方の織田の旗まで朱に替えない。
const HAYA = { armor: 0x3a2e24, hatColor: 0x241f1a, lace: 0x5c4630, cloth: 0x5a4a38, flag: 'aka_oda', flagShape: 1 };
const ODA = { hatColor: 0x121110, lace: 0x5a4630, cloth: 0x4a3a2a, flag: 'oda', flagShape: 2 };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || g.count === 0 || g.routed;
// 退き切った隊は、その場に立たせず戦場から消す（kaito 10/24「動かない味方と敵は一切排除」）。
function vanish(rt, g) { for (const u of g.units) if (u.alive && !u.isPlayer) rt.army.despawn(u); }

let dem = null;
useTerrain('dem_inou', (data) => { dem = data; });
// 現代の堤と標高差を弱め、会戦帯は低い田畑の平地にする。
function height(x, z) {
  let h = 0.25 * Math.sin(x * 0.04) * Math.cos(z * 0.035) + 0.2 * Math.sin(z * 0.06 + x * 0.02);
  // 小川べりは低く、佐久間の持ち場はわずかな微高地
  let d = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) { const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1]; if (z >= az && z <= bz) d = Math.abs(x - (ax + (bx - ax) * (z - az) / (bz - az))); }
  if (d < 30) h -= 1.4 * (1 - d / 30);
  h += 0.25 * gauss(x, z, NAZUKA.x, NAZUKA.z, 160);
  if (dem) h += (Math.min(9.5, demSample(dem, x, z)) - 7) * 0.12;
  const a = azeAt(x, z);
  if (a >= 0 && a < 0.9) { const k = 1 - a / 0.9; h += 0.22 * k * k * (3 - 2 * k); }
  return h;
}

// 写真の粗い木組み・縄・筵を陣の背後と集落の庭へ。中央の会戦帯には置かない。
// 二つの区画ごとに同じ形と材質を束ねる。縄や屋根の押さえは近景だけ描く。
function fieldLife(rt) {
  const W = rt.world;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const pole = new THREE.CylinderGeometry(1, 1, 1, 5);
  const sheaf = new THREE.CylinderGeometry(.55, 1, 1, 6);
  const wood = new THREE.MeshStandardMaterial({ map: woodTex(), color: 0x81715a, roughness: 1 });
  const straw = new THREE.MeshStandardMaterial({ map: thatchTex(), color: 0x9a8860, roughness: 1 });
  const rope = new THREE.MeshStandardMaterial({ color: 0x73654b, roughness: 1 });
  const pose = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  for (const [cx, cz, camp] of [[-26, 78, true], [28, -82, false]]) {
    const buckets = [[], [], [], [], []];
    const mats = [wood, wood, straw, rope, straw], geos = [box, pole, box, pole, sheaf];
    const put = (k, x, y, z, sx, sy, sz, rot = 0, tilt = 0) => {
      pose.position.set(x, W.heightAt(x, z) + y, z);
      pose.rotation.set(tilt, rot, 0); pose.scale.set(sx, sy, sz); pose.updateMatrix();
      buckets[k].push(pose.matrix.clone());
    };
    const beam = (k, ax, ay, az, bx, by, bz, r) => {
      ay += W.heightAt(ax, az); by += W.heightAt(bx, bz);
      pose.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      dir.set(bx - ax, by - ay, bz - az);
      pose.quaternion.setFromUnitVectors(up, dir.clone().normalize());
      pose.scale.set(r, dir.length(), r); pose.updateMatrix(); buckets[k].push(pose.matrix.clone());
    };
    // 筵を掛けた陣小屋／農家の作業棚。丸太の柱と貫が屋根から突き出す。
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      put(1, cx + sx * 2.1, 1.15, cz + sz * 1.5, .095, 2.3, .095);
      for (const y of [1.85, 2.02]) put(3, cx + sx * 2.1, y, cz + sz * 1.5, .115, .055, .115);
    }
    for (const sx of [-1, 1]) beam(1, cx + sx * 2.1, 2.12, cz - 1.8, cx + sx * 2.1, 1.85, cz + 1.8, .085);
    for (const sz of [-1, 1]) beam(1, cx - 2.5, sz < 0 ? 2.12 : 1.85, cz + sz * 1.5, cx + 2.5, sz < 0 ? 2.12 : 1.85, cz + sz * 1.5, .08);
    for (let i = 0; i < 6; i++) {
      const x = cx - 2 + i * .8;
      beam(0, x, 2.16, cz - 1.9, x, 1.87, cz + 1.9, .06);
      put(2, x, 2.03, cz, .77, .09, 3.9, 0, .075);
    }
    // 薪束、荷の木箱、敷き筵。歩く道に出さず、屋根の内側にまとめる。
    put(2, cx, .035, cz, 3.7, .045, 2.4);
    for (let i = 0; i < 9; i++) beam(1, cx - 1.6 + (i % 3) * .16, .15 + Math.floor(i / 3) * .13, cz - .5,
      cx - 1.6 + (i % 3) * .16, .15 + Math.floor(i / 3) * .13, cz + .5, .07);
    put(0, cx + 1.1, .3, cz - .5, .9, .6, .65);
    for (const dx of [-.22, .22]) {
      beam(3, cx + 1.1 + dx, .62, cz - .85, cx + 1.1 + dx, .62, cz - .15, .018);
      for (const dz of [-.85, -.15]) beam(3, cx + 1.1 + dx, .03, cz + dz, cx + 1.1 + dx, .62, cz + dz, .018);
    }
    // 写真の細い横木の柵。囲い切らず、街道と畦への出入口を残す。
    const fenceZ = cz + 4.5;
    for (let i = 0; i < 5; i++) {
      const x = cx - 5 + i * 2;
      put(1, x, .65, fenceZ, .065, 1.4 + (i % 2) * .1, .065);
      for (const y of [.48, 1.05]) {
        put(3, x, y, fenceZ, .085, .055, .085);
        if (i < 4) beam(1, x, y, fenceZ, x + 2, y + .04, fenceZ, .045);
      }
    }
    // 秋の田の稲架。稲は刈り終えた庭先だけに掛け、実り田は残す。
    if (!camp) {
      for (const sx of [-1, 1]) {
        beam(1, cx + sx * 4, 0, cz - 6, cx + sx * 4, 2.15, cz - 5, .065);
        beam(1, cx + sx * 4, 0, cz - 4, cx + sx * 4, 2.15, cz - 5, .065);
      }
      beam(1, cx - 4.4, 1.85, cz - 5, cx + 4.4, 1.85, cz - 5, .08);
      for (let i = 0; i < 12; i++) for (const side of [-1, 1]) {
        const x = cx - 3.6 + i * .65, z = cz - 5 + side * .18;
        put(4, x, 1.35, z, .23, .95, .22, (i % 3 - 1) * .12, side * .15);
        put(3, x, 1.73, z, .16, .04, .16);
      }
    }
    const root = new THREE.Group();
    const near = new THREE.LOD(), ties = new THREE.Group();
    near.position.set(cx, W.heightAt(cx, cz), cz);
    ties.position.copy(near.position).multiplyScalar(-1);
    for (let k = 0; k < buckets.length; k++) {
      const list = buckets[k];
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(geos[k], mats[k], list.length);
      for (let i = 0; i < list.length; i++) mesh.setMatrixAt(i, list[i]);
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      if (k === 3) ties.add(mesh); else root.add(mesh);
    }
    near.addLevel(ties, 0); near.addLevel(new THREE.Group(), 65);
    root.add(near); rt.scene.add(root);
  }
  for (const [x, z, r] of [[-34, 68, -.25], [-32, 68, .12], [-26, 91, .3], [-24, 91, -.1]])
    rt.scene.add(takataba(W, x, z, r, { fieldBundle: true, fieldTrestle: true }));
  // 由緒や伽藍を断定せず、田の外の小堂と鎮守林として遠景に一つだけ。
  rt.scene.add(dou(W, 96, -108, 5, 4, -.2));
  rt.scene.add(nabe(W, -32, 79, { fire: false }));
  W.addSmokeColumn(-32, W.heightAt(-32, 79) + .85, 79, { size: .35 });
  W.addSmokeColumn(-12, W.heightAt(-12, -66) + 3.4, -66, { size: .3 });
  // 土埃は目の前で打ち合う足元の八粒だけ。入れ物を使い回し、兵も光源も増やさない。
  const positions = new Float32Array(8 * 3), phase = new Float32Array(8);
  for (let i = 0; i < 8; i++) phase[i] = i * .618;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { clock: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: `attribute float phase; uniform float clock; varying float fade;
      void main() {
        float age = fract(clock * .45 + phase);
        vec3 p = position + vec3(age * .65, .12 + age * .55, age * .2);
        vec4 eye = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * eye;
        gl_PointSize = clamp((45.0 + age * 100.0) / max(1.0, -eye.z), 1.0, 32.0);
        fade = sin(age * 3.14159) * .12;
      }`,
    fragmentShader: `varying float fade;
      void main() {
        float r = length(gl_PointCoord - vec2(.5)) * 2.0;
        gl_FragColor = vec4(.53, .46, .34, (1.0 - smoothstep(.1, 1.0, r)) * fade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dust = new THREE.Points(geo, mat);
  dust.frustumCulled = false; dust.renderOrder = 1; rt.scene.add(dust);
  rt.flags.fieldDust = { mesh: dust, next: 0 };
}

// 刈田の稲叢（にお）：刈った稲を円く積み、藁の笠をかぶせた山。区画の中ほどに一つ二つ。
// 戦う帯・道・逃げ道・本陣の周りは空ける。形と材質は二つだけを共用し、InstancedMesh 一本ずつで描く（10/28）。
function inouNio(rt) {
  const W = rt.world;
  const fights = [[SHIBA0.x, SHIBA0.z, 24], [HAYA0.x, HAYA0.z, 20], [HAYA1.x, HAYA1.z, 18], [FLANK.x, FLANK.z, 16], [NOBU.x - 8, NOBU.z + 6, 22], [NAZUKA.x, NAZUKA.z, 16]];
  const ways = [...PATHS.map((p) => p.pts), WEST_ESCAPE.map((p) => [p.x, p.z]), EAST_ESCAPE.map((p) => [p.x, p.z])];
  const spots = [];
  for (let cx = -108; cx <= 108; cx += 24) for (let cz = -110; cz <= 110; cz += 20) {
    for (let k = 0; k < 2; k++) {
      const hsh = Math.sin(cx * 12.9898 + cz * 78.233 + k * 37.7) * 43758.5453, f = hsh - Math.floor(hsh);
      if (f > 0.55) continue;
      const x = cx + (f - 0.27) * 22, z = cz + (((f * 7.13) % 1) - 0.5) * 12;
      if (azeAt(x, z) < 2.5) continue;
      if (fights.some(([fx, fz, r]) => Math.hypot(x - fx, z - fz) < r)) continue;
      if (ways.some((pts) => distToPolyline(x, z, pts) < 7)) continue;
      spots.push([x, z, 0.85 + f * 0.5]);
    }
  }
  if (!spots.length) return;
  // 10/29：稲叢は暗い円錐の小屋に見えた。藁の色を明るく（茅の絵は暗いので色で持ち上げる）、角を丸く（十六角）、笠は低く丸めた藁の帽子に。
  const straw = new THREE.MeshStandardMaterial({ map: thatchTex(), color: 0xf2d79a, roughness: 1 });
  const cap = new THREE.MeshStandardMaterial({ map: thatchTex(), color: 0xd8bd84, roughness: 1 });
  const body = new THREE.CylinderGeometry(0.95, 1.05, 1.3, 16); body.translate(0, 0.65, 0);
  const top = new THREE.SphereGeometry(1.2, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42); top.scale(1, 0.75, 1); top.translate(0, 1.0, 0);
  const a = new THREE.InstancedMesh(body, straw, spots.length), b = new THREE.InstancedMesh(top, cap, spots.length);
  const m = new THREE.Object3D();
  spots.forEach(([x, z, sc], i) => {
    m.position.set(x, W.heightAt(x, z) - 0.05, z); m.rotation.set(0, sc * 5, 0); m.scale.set(sc, sc * (0.9 + (sc % 0.2)), sc); m.updateMatrix();
    a.setMatrixAt(i, m.matrix); b.setMatrixAt(i, m.matrix);
    solidCircle(x, z, 1.05 * sc);
  });
  for (const mesh of [a, b]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.castShadow = mesh.receiveShadow = true; rt.scene.add(mesh); }
}

// 持ち場の足もとの刈田（10/28「手前の道と野が砂色の一枚」）：本陣の前、二十歩の内に刈り株の藁色の筋と土の筋を交互に、
// 区画の縁（畦道）には草を被った低い畦を。地面に沿う薄い帯と刈り株の束を、形一つ・材質一つずつにまとめる（当たり無し）。
// 25秒で歩いた先（持ち場の北二十歩）からどちらを向いても刈田が入るよう、北の区画（z 1〜21）まで延ばす（10/28 採点）。
const NEAR_FIELDS = [[-23, 1, -3.5, 51], [3.5, 1, 23, 63]];
// 持ち場の前の街道：のっぺりした土の一枚に見えた（10/28 採点）。荷車の二本の轍（湿って黒い溝）と、
// 轍の間と道の肩に残る枯れ草の株。開戦時に一度だけ作り、一つの形・二つの材質。当たりは無い。
function inouRoad(rt) {
  const W = rt.world, pos = [], col = [], c = new THREE.Color();
  // 轍は黒い帯に見えた（10/28）。湿った土の色を中ほどだけ濃く、縁と両端は道の土へ溶かす（頂点の透け具合）。
  const v = (x, z, y, a) => { pos.push(x, W.heightAt(x, z) + y, z); col.push(.34, .27, .19, a); };
  const fade = (z) => Math.min(1, (z + 40) / 10, (48 - z) / 12);
  for (const rx of [-1.05, 1.05]) {
    for (let z = -40; z < 48; z += 1) {
      const w0 = .2 + .06 * Math.sin(z * 1.7 + rx), w1 = .2 + .06 * Math.sin((z + 1) * 1.7 + rx);
      const o0 = rx + .12 * Math.sin(z * .23), o1 = rx + .12 * Math.sin((z + 1) * .23);
      const a0 = .8 * fade(z) * (.75 + .25 * Math.sin(z * 2.3 + rx * 3)), a1 = .8 * fade(z + 1) * (.75 + .25 * Math.sin((z + 1) * 2.3 + rx * 3));
      for (const s of [-1, 1]) {
        v(o0 + s * w0, z, .025, 0); v(o1 + s * w1, z + 1, .025, 0); v(o1, z + 1, .025, a1);
        v(o0 + s * w0, z, .025, 0); v(o1, z + 1, .025, a1); v(o0, z, .025, a0);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.computeVertexNormals();
  const ruts = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }));
  ruts.receiveShadow = true; rt.scene.add(ruts);
  // 枯れ草の株：細い葉を六枚。轍の間（踏まれず残る筋）と道の肩に群れて生える。
  const parts = [];
  for (let j = 0; j < 6; j++) {
    const leaf = new THREE.PlaneGeometry(.05, 1, 1, 2), lp = leaf.attributes.position;
    for (let k = 0; k < lp.count; k++) { const t = lp.getY(k) + .5; lp.setXYZ(k, lp.getX(k) * (1 - t * .8) + .04 + .22 * t * t, t * (.8 + (j % 2) * .2), 0); }
    leaf.rotateY(j * 2.399); parts.push(leaf);
  }
  const tuftGeo = mergeLeaves(parts);
  const spots = [];
  for (let z = -40; z < 48; z += .45) {
    for (const [bx, p] of [[0, .55], [-3.4, .8], [3.4, .8], [-2.6, .25], [2.6, .25]]) {
      const n = Math.sin(z * .61 + bx) + Math.sin(z * 1.9 + bx * 2) * .5;
      if (n < 1 - p * 1.6) continue;
      spots.push([bx + .35 * Math.sin(z * 4.3 + bx), z + .2 * Math.sin(z * 7.1)]);
    }
  }
  const tufts = new THREE.InstancedMesh(fieldGrassGeo(), fieldGrassMat(), spots.length);   // 共通の細い弓なりの株（10/29 b3）
  const m = new THREE.Object3D();
  spots.forEach(([x, z], i) => {
    const h = .22 + .25 * Math.abs(Math.sin(x * 3.1 + z * 1.3));
    m.position.set(x, W.heightAt(x, z), z); m.rotation.set(0, x * 2.1 + z * 1.7, 0); m.scale.set(1.3, h, 1.3); m.updateMatrix();
    tufts.setMatrixAt(i, m.matrix);
    const t = Math.abs(Math.sin(x * 1.7 + z * .9));
    tufts.setColorAt(i, c.setRGB(.42 + .14 * t, .40 + .08 * t, .22 + .04 * t));   // 秋の枯れ草（藁色に少し緑）
  });
  tufts.computeBoundingSphere(); rt.scene.add(tufts);
}
function mergeLeaves(parts) {
  let n = 0; for (const g of parts) n += g.index.count;
  const pos = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { const ng = g.toNonIndexed(), a = ng.attributes.position.array; pos.set(a, o); o += a.length; ng.dispose(); g.dispose(); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.computeVertexNormals(); return geo;
}
// 稲架（10/29 採点「稲架が無い」：25秒の画面の稲架は四角い棘の黒い柵に見えた）。杭を一列に立て、横木を三段。
// 刈った稲束は穂を下に、横木の上で二つに割って両側へ垂らす。束は丸い筒を少し潰した形で、隣と重ねて藁の壁に見せる。
// 木と藁の二つの材質・二つの形だけ（設営時に一度）。当たりは杭の列の細い帯だけ。
function inouHasa(rt, x, z, rot = 0, len = 8, tiers = 3, solid = true) {
  const W = rt.world, wood = [], straw = [], c = new THREE.Color();
  // 10/29：藁に三・四倍の色を掛け、鮮やかな黄の筒の列（絵）に見えた。干した藁の鈍い灰金に落とす。
  const tint = (g, hex, k) => { c.setHex(hex).multiplyScalar(k * (hex === 0x6c5a44 || hex === 0x655440 || hex === 0x74624a ? 1.7 : 2.1)); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const n = Math.max(2, Math.round(len / 1.8));
  const top = 0.75 + tiers * 0.55;
  for (let i = 0; i <= n; i++) {
    const lx = (i / n - 0.5) * len, lean = 0.03 * Math.sin(i * 2.7);
    const p = new THREE.CylinderGeometry(0.045, 0.06, top + 0.35, 6); p.rotateZ(lean); p.translate(lx, (top + 0.35) / 2 - 0.15, 0);
    wood.push(tint(p, 0x6c5a44, 0.9 + 0.15 * Math.abs(Math.sin(i * 1.9))));
  }
  for (const s of [-1, 1]) {   // 両端の突っ張り（斜めの支え）
    const g = new THREE.CylinderGeometry(0.035, 0.045, top + 0.4, 5); g.rotateZ(-0.5 * s); g.translate(s * (len / 2 + 0.55), (top + 0.4) / 2 - 0.25, 0.05);
    wood.push(tint(g, 0x655440, 0.95));
  }
  for (let t = 0; t < tiers; t++) {
    const y = 0.75 + (t + 1) * 0.55 - 0.05;
    const bar = new THREE.CylinderGeometry(0.03, 0.03, len + 0.5, 5); bar.rotateZ(Math.PI / 2); bar.translate(0, y, 0); wood.push(tint(bar, 0x74624a, 1));
    // 掛けた束：一つの束を横木の両側へ（穂は下）。束の幅 0.17・間 0.13 で重ねる。下の段は藁の色がやや濃い（乾きの差）
    const m = Math.floor(len / 0.13);
    for (let k = 0; k < m; k++) {
      const lx = -len / 2 + 0.1 + k * 0.13 + 0.02 * Math.sin(k * 3.1 + t);
      // 束の長さ・太さ・傾きを不揃いに（同じ筒の並びは絵に見えた）。ところどころ束を抜いて横木を見せる。
      const r1 = Math.abs(Math.sin(k * 12.9898 + t * 78.233 + x) * 43758.5453) % 1, r2 = Math.abs(Math.sin(k * 4.1 + t * 9.7 + z) * 9631.7) % 1;
      if (r1 < 0.06) continue;
      const h = 0.42 + 0.22 * r2, k0 = 0.78 + 0.26 * r1 - 0.07 * (tiers - 1 - t);
      for (const s of [-1, 1]) {
        const g = new THREE.CylinderGeometry(0.06 + 0.025 * r2, 0.085 + 0.03 * r1, h, 7, 2); g.scale(1, 1, 0.6); g.rotateZ((r1 - 0.5) * 0.22);
        // 穂先は下で少し外へ開く
        const P = g.attributes.position;
        for (let q = 0; q < P.count; q++) { const v = 0.5 - P.getY(q) / h; P.setZ(q, P.getZ(q) + s * 0.05 * v * v); P.setX(q, P.getX(q) * (1 + 0.25 * v)); }
        g.rotateX(-s * 0.16); g.translate(lx, y - h / 2 + 0.03, s * 0.065);
        straw.push(tint(g, r2 < 0.2 ? 0x8a7a5c : s > 0 ? 0xa89878 : 0x9c8c6e, k0));
      }
      if (k % 2 === 0) {   // 横木の上の束の背（割った所の盛り上がり）
        const b = new THREE.CylinderGeometry(0.06, 0.06, 0.15, 6); b.rotateX(Math.PI / 2); b.scale(1, 0.7, 1); b.translate(lx + 0.06, y + 0.04, 0);
        straw.push(tint(b, 0x928260, k0));
      }
    }
  }
  const grp = new THREE.Group();
  const wm = new THREE.Mesh(mergeGeometries(wood), HASA_MAT.wood || (HASA_MAT.wood = new THREE.MeshStandardMaterial({ map: woodTex(), vertexColors: true, roughness: 0.95 })));
  const sm = new THREE.Mesh(mergeGeometries(straw), HASA_MAT.straw || (HASA_MAT.straw = new THREE.MeshStandardMaterial({ map: thatchTex(), vertexColors: true, roughness: 1 })));
  for (const g of [...wood, ...straw]) g.dispose();
  for (const mm of [wm, sm]) { mm.castShadow = mm.receiveShadow = true; grp.add(mm); }
  grp.position.set(x, W.heightAt(x, z) - 0.05, z); grp.rotation.y = rot;
  if (solid) solidRect(x, z, len + 0.3, 0.45, rot);
  rt.scene.add(grp);
  return grp;
}
const HASA_MAT = {};
function inouNearField(rt) {
  const W = rt.world, pos = [], col = [], uv = [], c = new THREE.Color();
  const tri = (x, z, y) => { pos.push(x, W.heightAt(x, z) + y, z); col.push(c.r, c.g, c.b); uv.push(x / 2.6, z / 2.6); };
  const quad = (x0, z0, x1, z1, y) => { tri(x0, z0, y); tri(x0, z1, y); tri(x1, z1, y); tri(x0, z0, y); tri(x1, z1, y); tri(x1, z0, y); };
  const onAze = (z) => Math.abs(z - Math.round(z / 20) * 20) < 1.4;
  // 畦の斜面：縁 (z0, y0) から肩 (z1, y1) へ。法線が上を向くよう巻きの向きを揃える
  const slope = (x0, x1, z0, y0, z1, y1) => { if (z1 > z0) { tri(x0, z0, y0); tri(x0, z1, y1); tri(x1, z1, y1); tri(x0, z0, y0); tri(x1, z1, y1); tri(x1, z0, y0); } else { tri(x0, z0, y0); tri(x1, z1, y1); tri(x0, z1, y1); tri(x0, z0, y0); tri(x1, z0, y0); tri(x1, z1, y1); } };
  // 田の土：写真の土（Poly Haven「Park Dirt」）に、乾いた所の藁色と、水の残る低い所の黒い湿りの斑を頂点の色で重ねる。
  // 10/29 採点「刈株が縞模様の平たい板」：藁色と土色を交互に塗った帯をやめる（縞は写真の土と株の列だけで出す）。
  const wet = (x, z) => Math.max(0, Math.sin(x * .19 + z * .07) * Math.sin(z * .23 - x * .05) + .35 * Math.sin(x * .61 + z * .43) - .45);
  for (const [ax, az, bx, bz] of NEAR_FIELDS) {
    for (let z = az; z < bz - .01; z += .5) {
      if (Math.abs(z + .25 - Math.round((z + .25) / 20) * 20) < .8) continue;
      for (let x = ax; x < bx - .01; x += 1) {
        const k = .9 + .08 * Math.sin(x * .37 + z * .29) + .06 * Math.sin(x * 1.3 - z * .9), w = Math.min(1, wet(x + .5, z + .25) * 2.2);
        c.setRGB(.98 * k, .9 * k, .74 * k).lerp(c.clone().setRGB(.46, .42, .36), w);
        quad(x, z, Math.min(bx, x + 1), z + .5, .05);
      }
    }
    // 畦：区画の縁に草を被った土手を盛る（10/28 採点「畦の盛り上がりが無い」）。断面は台形：天端 0.5m・高さ 0.32m・裾 1.4m。
    // 斜面は土、天端は草。平たい帯でなく、横から見て影の付く背にする。
    for (let z = Math.ceil(az / 20) * 20; z <= bz; z += 20) for (let x = ax; x < bx - .01; x += 2) {
      const x1 = Math.min(bx, x + 2);
      // 斜面は日陰側で黒い溝に見えた（10/28 夜）。枯れ草を被った土の色に明るめ、天端の草と近い調子にする。
      // 10/29：写真の土を貼ったので、頂点の色は掛け算の明るさ（暗い色のままでは黒い土手の板に見えた）。天端は草を被った土、斜面は枯れ草混じりの土。
      c.setRGB(.74, .76, .5); quad(x, z - .3, x1, z + .3, .45);
      c.setRGB(.88, .8, .62); slope(x, x1, z - .85, .03, z - .3, .45); slope(x, x1, z + .85, .03, z + .3, .45);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  loadGroundPhoto('dirt').then((t) => { if (!t || !rt.scene) return; t = t.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; ground.material.map = t; ground.material.needsUpdate = true; }).catch(() => {});
  ground.receiveShadow = true;
  // 畦は高さ〇・四五・裾一・七に盛る（株は実の大きさのまま。一・五倍では棘の草に見えた。10/28）。
  // 刈り株の束（10/28 採点「平たい板に茶の短い線の模様」）：一株は藁の切り口の筒（束ねた茎）と、外へ開く穂先六本。
  // 法線は上向き（裏面が黒く見えない）。畦の上には同じ形を緑に染めて草の株に。一つの InstancedMesh・一つの材質。
  // 10/28 夜：両面描きでは裏の三角の法線が下を向き、筒の陰と穂先が黒く、切り口は日を受けて白く光った（紙片と黒い棘に見えた）。
  // 三角を表裏の二枚で持って片面で描き、法線は全部上へ。切り口の白いふたは無くし、細い茎の束（六本）と垂れた葉二枚を少し開かせる（三角は前と同じ二十八）。
  const tuft = new THREE.BufferGeometry(), tp = [], tc = [], tn = [];
  const push = (x, y, z, col) => { tp.push(x, y, z); tc.push(...col); tn.push(0, 1, 0); };
  const tri2 = (a, ca, b, cb, d, cd) => { push(...a, ca); push(...b, cb); push(...d, cd); push(...a, ca); push(...d, cd); push(...b, cb); };
  // 10/29：株は小さく白い棘に見えた。一株を十一本の刈り残しの茎（高さ十三〜十八cm・根元で束ねて、まっすぐ立つ切り株。開くと雑草に見えた）に。
  // 色は日に焼けた藁の灰黄（白く飛ばさない）、根元は土色。
  for (let k = 0; k < 11; k++) {
    const a = k * 2.399 + (k % 3) * .3, r0 = .008 + .026 * ((k * 7) % 5) / 4, lean = .004 + .012 * ((k * 3) % 4) / 3;
    const h = .13 + .05 * ((k * 5) % 4) / 3, w = .012, sa = Math.sin(a), ca = Math.cos(a);
    const bx = sa * r0, bz = ca * r0, tx = sa * (r0 + lean), tz = ca * (r0 + lean), px = ca * w, pz = -sa * w;
    const lo = [.19, .16, .1], hi = k % 3 ? [.42, .36, .18] : [.36, .31, .16];   // 刈ったばかりの茎は灰でなく黄金の藁色（10/29）
    tri2([bx - px, 0, bz - pz], lo, [bx + px, 0, bz + pz], lo, [tx + px * .7, h, tz + pz * .7], hi);
    tri2([bx - px, 0, bz - pz], lo, [tx + px * .7, h, tz + pz * .7], hi, [tx - px * .7, h, tz - pz * .7], hi);
  }
  for (let k = 0; k < 2; k++) {   // 枯れて垂れた葉（外へ倒れる細い葉）
    const a = k * 2.1 + .7, sa = Math.sin(a), ca = Math.cos(a), w = .012, h = .09, out = .2;
    tri2([sa * .02 - ca * w, .03, ca * .02 + sa * w], [.24, .2, .13], [sa * .02 + ca * w, .03, ca * .02 - sa * w], [.24, .2, .13], [sa * out, h * (.5 + k * .25), ca * out], [.38, .33, .22]);
  }
  tuft.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  tuft.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
  tuft.setAttribute('normal', new THREE.Float32BufferAttribute(tn, 3));
  const spots = [], grass = [];
  for (const [ax, az, bx, bz] of NEAR_FIELDS) {
    // 株の列は東西に。25秒の時に足もとから二十歩の所（z 22 より南）は列の間 0.65m・株間 0.5m、奥は 0.9m・0.8m
    for (let z = az + .4; z < bz;) {
      const near = z > 22;
      if (!onAze(z)) for (let x = ax + .3; x < bx; x += near ? .5 : .8) spots.push([x + .08 * Math.sin(z * 3.1 + x * 1.7), z + .05 * Math.cos(x * 2.3 + z)]);
      z += near ? .65 : .9;
    }
    // 畦の天端と肩の草の株
    for (let z = Math.ceil(az / 20) * 20; z <= bz; z += 20) for (let x = ax + .3; x < bx; x += .55) grass.push([x + .2 * Math.sin(x * 4.7), z + .3 * Math.sin(x * 2.9 + z)]);
  }
  const stubs = new THREE.InstancedMesh(tuft, new THREE.MeshLambertMaterial({ vertexColors: true }), spots.length + grass.length);
  const m = new THREE.Object3D(), gc = new THREE.Color();
  // 株は実の大きさ（一・五倍では棘の草に見えた。inou_p7）。傾きと色のむらは残す（inou_p8）。
  spots.forEach(([x, z], i) => { m.position.set(x, W.heightAt(x, z) + .05, z); m.rotation.set(.12 * Math.sin(x * 5.3 + z), x * 1.7 + z, .12 * Math.sin(z * 4.1 + x)); m.scale.set(.95 + .3 * Math.abs(Math.sin(x * 2.1 + z)), .9 + .35 * Math.abs(Math.sin(x * 1.3 + z * .7)), .95 + .3 * Math.abs(Math.sin(x * 2.1 + z))); m.updateMatrix(); stubs.setMatrixAt(i, m.matrix); stubs.setColorAt(i, gc.setRGB(1, .97, .92).multiplyScalar(.8 + .2 * Math.abs(Math.sin(x * .9 + z * 1.3)))); });
  grass.forEach(([x, z], j) => {
    const i = spots.length + j, y = W.heightAt(x, z) + (Math.abs(z - Math.round(z / 20) * 20) < .3 ? .43 : .22);
    m.position.set(x, y, z); m.rotation.set(0, x * 2.3, 0); m.scale.set(1.6, 1.3 + .5 * Math.abs(Math.sin(x * 3.7)), 1.6); m.updateMatrix(); stubs.setMatrixAt(i, m.matrix);
    stubs.setColorAt(i, gc.setRGB(.62, .78, .42).multiplyScalar(.85 + .2 * Math.abs(Math.sin(x * 1.9))));
  });
  stubs.instanceMatrix.needsUpdate = true; stubs.instanceColor.needsUpdate = true; stubs.computeBoundingSphere();
  stubs.castShadow = true;
  // 稲叢を左右に一つずつ（列の外、兵の通り道の脇）
  const nio = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.0, 1.25, 16), new THREE.MeshStandardMaterial({ map: thatchTex(), color: 0xf2d79a, roughness: 1 }));
  const topG = new THREE.SphereGeometry(1.15, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42); topG.scale(1, .75, 1);
  const top = new THREE.Mesh(topG, new THREE.MeshStandardMaterial({ map: thatchTex(), color: 0xd8bd84, roughness: 1 }));
  body.position.y = .62; top.position.y = .95;
  for (const [x, z] of [[-20, 37], [17, 27]]) {
    const n = new THREE.Group(); n.add(body.clone(), top.clone());
    n.position.set(x, W.heightAt(x, z) - .05, z); n.rotation.y = x; nio.add(n); solidCircle(x, z, 1.05);
  }
  nio.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  rt.scene.add(ground, stubs, nio);
  const dispose = rt.dispose;
  rt.dispose = function () { geo.dispose(); ground.material.dispose(); tuft.dispose(); stubs.material.dispose(); return dispose.call(this); };
}
// 名塚の砦（前日に佐久間が急ぎ築いた）を野の北西の遠くに：土塁と丸太の柵の囲い、東の口、井楼一つと織田の幟。
// 戦う帯と逃げ道から離れた遠景なので当たりは持たせず、柵と土塁は一つの束で描く。形と位置は遊びの推定。
const NAZUKA_FORT = { x: -92, z: -68, r: 11 };
function inouNazukaFort(rt) {
  const W = rt.world, q = NAZUKA_FORT, batch = makeSimpleBatch(), n = 16;
  const ways = PATHS.map((p) => p.pts);
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
    // 口は東（本陣の側）。畦道が通る所も柵を切る
    if (i === n / 4) continue;
    if (ways.some((pts) => distToPolyline(q.x + Math.sin(am) * q.r, q.z + Math.cos(am) * q.r, pts) < 2)) continue;
    const seg = [q.x + Math.sin(a0) * q.r, q.z + Math.cos(a0) * q.r, q.x + Math.sin(a1) * q.r, q.z + Math.cos(a1) * q.r];
    dorui(W, seg, -Math.sin(am), -Math.cos(am), { h: .8, w: 2, capEnds: true, closeBack: true, batch });
    palisade(W, seg, { h: 2.6, batch });
  }
  finalizeSimpleBatch(rt, batch);
  rt.scene.add(yagura(W, q.x - 3, q.z - 2, { logFrame: true, kind: 'ro', height: 8, boarded: true }));
  for (const [x, z] of [[q.x + 12, q.z - 4], [q.x + 12, q.z + 4], [q.x - 6, q.z + 8]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
}
function mergeTufts(a, b) {
  const g = new THREE.BufferGeometry(), pa = a.attributes.position.array, pb = b.attributes.position.array;
  const ia = a.index.array, ib = b.index.array, na = pa.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute([...pa, ...pb], 3));
  // 裏面も同じ向きの三角で持つ（両面描きでは裏の法線が下を向いて黒くなるため）
  const idx = [...ia, ...Array.from(ib, (i) => i + na)];
  for (let i = 0, n = idx.length; i < n; i += 3) idx.push(idx[i], idx[i + 2], idx[i + 1]);
  g.setIndex(idx);
  // 法線は上向きにそろえる（裏から見ても黒い四角にせず、地面と同じ明るさで光る）
  const nrm = new Float32Array(pa.length + pb.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); a.dispose(); b.dispose();
  return g;
}

function fieldDustTick(rt) {
  const D = rt.flags.fieldDust;
  if (!D) return;
  D.mesh.visible = !SETTINGS.reduceMotion;
  D.mesh.material.uniforms.clock.value = rt.t;
  if (!D.mesh.visible || rt.t < D.next) return;
  D.next = rt.t + .6;
  const geo = D.mesh.geometry, pos = geo.attributes.position, p = rt.player.u.pos;
  let n = 0;
  for (const u of rt.army.units) {
    if (n === 8) break;
    if (!fighting(u) || !u.target || !u.mesh?.visible || Math.abs(u.pos.x - p.x) > 32 || Math.abs(u.pos.z - p.z) > 32) continue;
    if (Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) > 4) continue;
    pos.setXYZ(n++, u.pos.x, rt.world.heightAt(u.pos.x, u.pos.z), u.pos.z);
  }
  pos.needsUpdate = true; geo.setDrawRange(0, n);
}

// 教えの順と成功判定は保ち、操作の札は出さない。
function lesson(rt, k) {
  const F = rt.flags;
  if (F.lesson) lessonEnd(rt, F.lesson);
  F.lessonDone ||= {};
  F.lesson = k; F.lessonAt = rt.t; F.lessonHidden = true;
  if (k === 'move') F.move0 = rt.player.movedAcc;
}
function lessonEnd(rt, k) {
  const F = rt.flags;
  if (F.lesson !== k) return;
  F.lesson = null; rt.tutEnd();
}
function park(g) {
  g.noAI = true; g.aggro = 0; g.fire = false; g.order = 'hold';
  // 敵も狙える。控えの隊も、近づいた者とは打ち合う（kaito 10/23 稲生 17）。
}

// 深手で倒れた兵は生存中でも、追う相手・倒す残り人数には含めない。
const fighting = (u) => !!u?.alive && u.hp > 0 && !u.gone && !u.dying && !u.downed && !u.woundOut && !u.rearWound && !u.fleeing;
// 画面外や遠くで軽い形（imp）・カメラ前の透かしに替わった兵も、残りの敵として追う（形を隠しただけで相手を失わない。テスター 10/25）。
const advanceEnemy = (u) => fighting(u) && !u.noTarget && !u.isStruct && !u.civ && (u.mesh?.visible !== false || u.imp || u.camHidden || u.humanPending);
function advanceOnArrival(g) {
  g.order = 'attack'; g.focus = null; g.fire = true; g.seekRange = 80;
  g.inouAdvance = true;
  // 到着後の待ちは置かず、その回の判断から近い敵へ向かわせる。
  for (const u of g.units) { u.aiT = 0; u.settled = false; }
}
function practiceLeft(rt) {
  let n = 0;
  for (const u of rt.flags.practice?.units || []) if (fighting(u)) n++;
  return n;
}
// 最寄りの残敵を札・ピン・到着判定で共有する。群れの中心を毎コマ作らない。
function approachUnit(rt) {
  const F = rt.flags;
  const group = F.step === 1 ? F.shiba1 : F.chase || F.training >= 0 && F.training < 5 ? F.practice : F.haya1;
  if (!group) return null;
  // 残り人数に数える隊の中から、間合いの相手・当てた相手を優先し、無ければ最寄りの兵を選ぶ。札とピンは同じ相手を使う。
  const previous = F.approachGroup === group && advanceEnemy(F.approachUnit) ? F.approachUnit : null;
  const reachable = rt.player.inRange && rt.player.rangeCueTarget;
  if (advanceEnemy(reachable) && group.units.includes(reachable)) {
    F.approachGroup = group; F.approachUnit = reachable;
    return reachable;
  }
  // 命中した本人がまだ近ければ追い続け、知らせと次の目印をそろえる。
  if (F.approachGroup === group && advanceEnemy(F.hitUnit) && group.units.includes(F.hitUnit) &&
      Math.hypot(F.hitUnit.pos.x - rt.player.u.pos.x, F.hitUnit.pos.z - rt.player.u.pos.z) <= rt.player.meleeReach(rt.player.previewMeleeKind() || 'thrust') + 2) {
    F.approachUnit = F.hitUnit;
    return F.hitUnit;
  }
  let chosen = null, best = Infinity;
  for (const u of group.units) {
    if (!advanceEnemy(u)) continue;
    const d = Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z);
    if (d < best) { chosen = u; best = d; }
  }
  // 少しの前後では替えず、別の兵が十分近い時だけ追う相手を渡す。
  // 遠ざかる一人を追い続け、目の前の林兵を通り過ぎるのを防ぐ。
  if (previous) {
    const distance = Math.hypot(previous.pos.x - rt.player.u.pos.x, previous.pos.z - rt.player.u.pos.z);
    if (best + 3 >= distance) chosen = previous;
  }
  F.approachGroup = group; F.approachUnit = chosen;
  return chosen;
}
// 「倒せ」の間に任務の相手がいない時の、最寄りの戦える敵（ピンの行き先。テスター 10/25「残りの敵の場所が分からない」）。
//   四分の一秒ごとに選び直し、少しの前後では替えない。
function nearestFoe(rt) {
  const F = rt.flags, me = rt.player.u;
  if (F.foeAt != null && rt.t >= F.foeAt && rt.t < F.foeAt + .25 && advanceEnemy(F.foeNear)) return F.foeNear;
  F.foeAt = rt.t;
  let chosen = null, best = Infinity;
  for (const u of rt.army.units) {
    if (u.team === me.team || !advanceEnemy(u)) continue;
    const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z);
    if (d < best) { chosen = u; best = d; }
  }
  const prev = F.foeNear;
  if (advanceEnemy(prev) && Math.hypot(prev.pos.x - me.pos.x, prev.pos.z - me.pos.z) <= best + 3) chosen = prev;
  F.foeNear = chosen;
  return chosen;
}
// 目的は戦いの間ずっと保ち、間合いと命中は同じ本人の▼で示す。
function inouEnemyOrder(rt, fallback) {
  return fighting(rt.def.missionSignTarget(rt)) ? `${rt.def.missionEnemyLabel(rt)}を たおせ` : fallback;
}
// 兵本人ではなく頭上の▼を案内する。距離は槍が届く所までの歩数。
function enemySteps(rt, enemy) {
  const p = rt.player;
  const distance = Math.hypot(enemy.pos.x - p.u.pos.x, enemy.pos.z - p.u.pos.z);
  return Math.max(0, Math.ceil((distance - p.meleeReach(p.previewMeleeKind() || 'thrust')) / .75));
}
function pinPoint(rt, pos, radius, hide, unit = null, name = '') {
  const pin = rt.flags.goalPin;
  pin.x = pos.x; pin.z = pos.z; pin.r = radius; pin.hide = hide;
  pin.unit = unit; pin.name = name; pin.enemy = !!unit && unit.team !== rt.player.u.team;
  pin.defend = false; pin.waiting = false; pin.marker = null;
  pin.followUnit = null;
  pin.approach = false; pin.silent = true; pin.arrow = false; pin.always = false;
  return pin;
}



// 柴田勢と佐久間勢は、柴田が動く時に初めて置く。待つ間に立ち並ぶ兵を作らない（kaito 10/24「動かない味方と敵は一切排除」）。
function spawnShiba(rt) {
  const F = rt.flags, W = rt.world;
  const S0 = { x: SHIBA0.x, z: SHIBA0.z - 22 }; // 北の霧の中から寄せてくる
  // ---- 信勝方：集落の南に密集する柴田勢 ----
  // 前列の長槍、中央の徒歩武者、後列の弓。勝家も徒歩で中央の前寄り。
  F.shiba1 = enemyGroup(rt, { faction: 'nobukatsu', name: '柴田の長槍隊', anchor: { ...S0 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 12, noRout: true, formation: 'yari', dmgMult: 0.85, defMult: 1.2, morale: 95 },
    dress([{ type: 'ashigaru', n: 22, o: { spear: 'nagae' } }], SHIBA));   // 湧く数を抑える（iPhone 12 で耐える段に落ちた。テストプレイの声 10/24）。前列の密度は保つ
  F.shibaG = enemyGroup(rt, { faction: 'nobukatsu', name: '柴田勝家の徒歩武者', anchor: { x: 0, z: S0.z - 9 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 10, noRout: true, formation: 'line', dmgMult: 0.85, defMult: 1.2, morale: 98 },
    dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, keep: true, flagScale: 2.2 } }, { type: 'samurai', n: 1, o: { name: '宮井勘兵衛' } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 14 }], SHIBA));   // 刀で飛び込む武者を混ぜる（人数は同じ・テスターの声 10/26「同じ敵ばかり」）
  F.shibaU = F.shibaG.units.find((u) => u.type === 'busho');
  F.shibaU.maxHp *= 1.4; F.shibaU.hp = F.shibaU.maxHp;
  // 勝家を殴り続けても、共通の深手による単独離脱を起こさない。
  F.shibaU.onWound = () => { F.shibaU.hp = Math.max(F.shibaU.hp, F.shibaU.maxHp * 0.35); };
  F.miyaiU = F.shibaG.units.find((u) => u.name === '宮井勘兵衛');
  F.miyaiU.noTarget = true;
  F.shibaU.pos.z = S0.z - 5;
  F.shibaU.pos.y = W.heightAt(F.shibaU.pos.x, F.shibaU.pos.z);
  F.shibaU.mesh.position.copy(F.shibaU.pos);
  F.shibaBow = enemyGroup(rt, { faction: 'nobukatsu', name: '柴田の後ろ弓', anchor: { x: 0, z: S0.z - 20 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 12, noRout: true, formation: 'line', dmgMult: 0.65, morale: 92 },
    dress([{ type: 'bow', n: 6 }], SHIBA));
  F.shiba = [F.shiba1, F.shibaG, F.shibaBow];
  for (const g of F.shiba) park(g);
  // 後列の六人は追いを止める控え。前半に全員を討たせず、既存の兵を使う。
  F.rearSpears = F.shiba1.units.slice(-6);
  for (const g of F.shiba) prepareMarch(g);
}
function spawnNazuka(rt) {
  const F = rt.flags;
  F.nazuka = allyGroup(rt, { name: '佐久間勢', anchor: { x: -72, z: 36 }, facing: 1.87, width: 12, aggro: 6, noRout: true, formation: 'yari' },
    dress([{ type: 'samurai', n: 1, o: { name: '佐久間大学', invuln: true } }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 4 }], ODA));
  KIT.markRecyclable(F.nazuka);
  prepareMarch(F.nazuka);
}

const inou = {
  missionStyle: 'lesson', // 共通の印・ピン・カメラの型（field_signs・mission_pin・hud_map・player が読む。戦の名で分けない）
  // 民は共通の描画専用の仕組みで扱い、兵数・戦功には含めない。
  civilianCrowd: {
    bands: PEOPLE_BANDS,
    nearKinds: ['farmer', 'townsman', 'merchant', 'woman', 'child', 'monk', 'elder'],
    strictNearKinds: true,
    watchPlacementDistance: 12, followWatchEscape: true,
    checkWatchEscape: true, checkWatchEscapeSoldiers: true, checkWatchDanger: true,
    doorPlacementDistance: 6, checkDoorEscape: true,
    avoidLightArmies: true, avoidClashes: true, scanIndividuals: true,
    watchPlayerCombat: true, rememberSoldierCombat: true,
    retreatFromSoldiers: true, recheckEscapeStep: true,
    followRouteWhenCalm: true, allowSafeRouteDetour: true,
    passRouteCorners: true, checkFullEscapeCorner: true, safeRouteExit: true,
    keepFamiliesTogether: true, familyWaitDistance: 6, familyFollowPath: true,
    keepCivilianSpacing: true,
  },
  scriptedLessons: true, // 共通の手ほどきを重ねず、この戦の順番で出す
  noCouriers: true,  // 戦に加わらない伝令の騎馬は置かない（kaito 10/24「動かない味方と敵は一切排除」）
  teach: true,           // 操作を教える戦（battle.js の teachOn）。ほかの戦は操作のやり方を出さない
  compactIntro: true,
  introTaskFirst: true,
  introPeopleFolded: true,
  // 導入は筋書きとして読める文に（意見帳 10/22・kaito の決め）。勝家は討てない・林美作守は討死、の史実に合わせる。
  introText: () => '信長の弟・信勝（のぶかつ）を家の主にしようと、柴田勝家（しばたかついえ）と林秀貞（はやしひでさだ）らが兵を集めた。林美作守（はやしみまさかのかみ）は秀貞の弟で、信勝方の武将。今は林勢が退き始め、信長方が追う場面。あなたは信長方の足軽（あしがる）＝歩いて戦う兵として、まず歩く・視点・槍を試してからはやしの兵を追う。',
  introPeople: [
    { id: '信長', name: '織田信長', note: '家督を継いだ兄。佐久間勢や前田利家らと戦う。' },
    { id: '信勝', name: '織田信勝と柴田勝家', note: '信勝は信長の弟。勝家は信勝を支え、この戦では敵となる。' },
    { id: '林', name: '林秀貞と林美作守', note: '織田家の家臣の兄弟。弟の美作守は通具とも伝わる。この戦で討死し、兄の秀貞は退く。' },
    { id: '史実', name: '史実と遊びの範囲', note: '『信長公記』などをもとに再現。兵数には諸説あり、配置・旗印・足軽の働きや操作の練習は遊びのための推定。' },
  ],
  rearAdviceText: () => usesTouchControls() ? '右の画面をなぞって振り向き、「かまえる」を押す' : `手元の操作器を横へ動かして振り向き、${SETTINGS.guardToggle ? '右押しで構える' : '右押しを押し続ける'}`,
  keepTaskLabel: true,
  keepGuardTaskLabel: true,
  autoTargetCamera: true,
  steadyMeleeCamera: true,
  keepDestinationTask: true,
  immediateTaskChanges: true,
  nearAllyWholeOcclusion: true,
  nearAllySolidBody: true,
  nearAllySightWidth: 1.1,
  nearAllyHorseFade: true,
  nearLongWeaponRadius: 10, // 後列から肩越しへ伸びる長槍・旗竿も、描く間だけ避ける。
  nearSpearBatchRadius: 10, // 避けた持ち主の槍を、遠景の束へ残さない。
  nearGroundSpearRadius: 10, // 討ち取り後に視線を横切る落ち槍も既存の視線判定で避ける。
  nearSpearFade: false, // 槍だけを縮めて透かさず、持ち主と同じ形を保つ。
  missionPinCaption: '',
  noPlayerFoot: true, // 白黒の足元の輪を消し、行き先のピンと敵の▼に絞る。
  nearbyAllySignLimit: 0, // 味方に別の印を足さず、敵全員の赤い▼で見分ける。
  noFieldMap: true, // 行き先のピンと敵本人の▼に絞る。
  hideGuideSteps: true,
  missionSingleLine: true,
  hideArmyPeek: true, // 初陣は行き先・敵の▼・任務一行に絞る。
  missionSingleLine: true,
  hideGuideSteps: true,
  guideMarker: (rt) => rt.flags.ending ? null : rt.flags.training === 11 || rt.flags.training === 12 ? 'flank' : rt.flags.step === 0 ? rt.flags.chase ? 'chase' : null : 'holdFlag',
  // 任務は短い一行。兵・隊長・待つ場所を区別し、頭上の▼と呼び方をそろえる。
  missions: ['この敵を たおせ', 'この敵を たおせ', 'ここを まもれ', 'この敵を たおせ', '味方と すすめ', '深追いするな'],
  missionHeading(rt) {
    const F = rt.flags;
    // 最初は赤い▼の林兵が相手。一人だけを遠くまで追わせない。
    if (F.step === 0 && F.training < 8) return '林の兵を倒せ';
    if (F.step === 0 && F.training === 8 && !fighting(F.hayaLead)) return 'その場で待て';   // 小戦に勝ち、敵が退く間の一拍（「耐えろ」は戦うのか待つのか迷わせた。bot 10/28）
    if (F.step === 0 && F.training === 8) return '林の小隊長を倒せ';
    if (F.step === 0 || F.step === 2 || F.step === 3) return fighting(this.missionSignTarget(rt)) ? 'この敵をたおせ' : '味方と進め';
    if (F.step === 1) {
      if (F.training === 11 && !F.flankReached) return 'この敵をたおせ';
      if (F.training === 12 && !gone(F.shiba1)) return F.flankSuccess ? 'ここをまもれ' : 'この敵をたおせ';
      return 'ここを まもれ';
    }
    return this.missions[this.missionOf(rt)];
  },
  enemyOrder: inouEnemyOrder,
  commanderTarget: (rt) => rt.flags.step === 0 && rt.flags.training === 8 ? rt.flags.hayaLead :
    rt.flags.step === 3 ? rt.flags.hayaU : null,
  // 控えや追跡中の兵も敵の姿として見分けられる。攻撃できるかで▼を消さない。
  foeMarkVisible: () => true,
  missionSignTarget: (rt) => rt.flags.step === 0 && rt.flags.training >= 0 && rt.flags.training <= 8 ?
    rt.flags.training === 8 ? fighting(rt.flags.hayaLead) ? rt.flags.hayaLead : null :
      approachUnit(rt) :
        rt.flags.step === 1 && rt.flags.training === 12 && !rt.flags.flankSuccess && !gone(rt.flags.shiba1) ? approachUnit(rt) :
          rt.flags.step === 3 ? rt.flags.hayaU : null,
  missionEnemyLabel: (rt) => rt.flags.step === 3 ? '大将' :
    rt.flags.step === 0 && rt.flags.training === 8 ? '隊長' : '敵',
  missionEnemySteps: enemySteps,
  meleeResult(rt, target, result) {
    const F = rt.flags;
    if (target && target.team !== rt.player.u.team && result !== 'miss') F.hitUnit = target;
    // 命中・討ち取りは実際に命が減った時の知らせを保つ。
    if (result === 'miss' && rt.t >= (F.missNoticeNext || 0)) {
      const enemy = rt.def.missionSignTarget(rt), p = rt.player;
      const near = fighting(enemy) && Math.hypot(enemy.pos.x - p.u.pos.x, enemy.pos.z - p.u.pos.z) <= p.meleeReach(p.previewMeleeKind() || 'thrust');
      F.combatResult = near ? '空振り。白縁の▼へ向け' : '空振り。白縁の▼へ近づけ';
      F.combatResultUntil = rt.t + 2;
      F.missNoticeNext = rt.t + 8;
    } else if (target && target.team !== rt.player.u.team && (result === 'block' || result === 'armor')) {
      // 防がれた本人の▼を潰し、任務の一行は保つ。
      if (fighting(target)) {
        target.inouBlockUntil = rt.t + .7;
        target.inouHitUntil = 0;
      }
      F.combatResult = result === 'block' ? '防がれた。敵の横へ回れ' : '鎧に当たった。もう一度突け';
      F.combatResultUntil = rt.t + 2;
    }
  },
  missionOf: (rt) => { const F = rt.flags; return F.step === 0 ? (F.training <= 4 ? 0 : 1) : F.step === 1 ? 2 : F.step <= 3 ? 3 : F.step === 4 ? 4 : 5; },
  minutes: 9,
  // 初陣の見分けだけ二枚。追う兵と味方を、色のほかに字と形で示す。
  fieldSigns: (rt) => {
    const F = rt.flags;
    if (F.step !== 0 || F.ending || F.training === 0) return null;
    const signs = F.fieldSigns;
    if (F.signPhase === F.training && rt.t < F.signNext && signs[1].unit?.alive && !signs[1].unit.gone) return signs;
    F.signPhase = F.training; F.signNext = rt.t + 0.3;
    const ally = F.chase && F.chaseA ? F.chaseA : F.hata;
    const foe = F.training >= 5 ? F.haya1 : F.practice || F.haya1;
    for (let i = 0; i < 2; i++) {
      const group = i === 0 ? (F.chase ? null : ally) : foe;
      let best = (i ? 120 : 55) ** 2, chosen = null;
      if (!group) { signs[i].unit = null; continue; }
      for (const u of group.units) {
        if (!u.alive || u.gone || u.mesh?.visible === false || u === rt.player.u || u.name) continue;
        const d = (u.pos.x - rt.player.u.pos.x) ** 2 + (u.pos.z - rt.player.u.pos.z) ** 2;
        if (d < best) { best = d; chosen = u; }
      }
      signs[i].unit = chosen;
    }
    return signs;
  },
  // 敵は共通の頭上▼と端の矢印、行き先は地面の輪で示す。
  missionPin(rt) {
    const F = rt.flags;
    // 最初の林兵も同じ本人の頭上の▼へ案内し、見失った間だけピンで方向を示す。
    if (F.ending) return null;
    // 守備は敵本人へ案内せず、任務と同じ持ち場を示す。
    if (F.step === 1 && /まもれ/.test(this.missionHeading(rt))) {
      const pin = pinPoint(rt, F.holdPoint || NOBU, 20, 0);
      pin.always = true; pin.defend = true; pin.waiting = true;
      // 守る輪は残りの時で欠けていく（初めは二十秒で右へ回る段、横を崩した後は九十八秒で大音声）。
      const e = F.holdElapsed || 0, end = F.training < 11 ? 20 : 98, from = F.training < 11 ? 0 : Math.min(e, F.holdLeftFrom ??= e);
      pin.holdLeft = Math.max(0, Math.min(1, (end - e) / Math.max(1, end - from)));
      return pin;
    }
    let enemy = this.missionSignTarget(rt);
    // 「倒せ」が出ている間に任務の相手が見つからなければ、最寄りの残りの敵へ向ける（▼が画面外でも行き先を失わない）。
    if (!fighting(enemy) && /倒せ|たおせ/.test(this.missionHeading(rt)) && !(F.step === 1 && F.training === 11 && !F.flankReached)) {
      // 倒れた本人へピンを残さず、戦える残りの敵へ渡す。
      enemy = nearestFoe(rt);
    }
    // 見えない間も同じ相手へピンを向ける。
    if (fighting(enemy) && enemy.team !== rt.player.u.team) {
      const p = rt.player;
      if (p.inRange && p.rangeCueTarget === enemy) return null;
      const pin = pinPoint(rt, enemy.pos, .2, .2, enemy);
      // 足場を手前へずらさず、▼と同じ本人の足元に刺す。
      pin.approach = true;
      return pin;
    }
    if (F.step === 0 || F.step === 3) {
      if (/味方と/.test(this.missionHeading(rt)) && fighting(F.genU)) {
        const pin = pinPoint(rt, F.genU.pos, 3, 0);
        pin.followUnit = F.genU;
        return pin;
      }
      return null;
    }
    if (F.step === 1) {
      if (F.training === 11 && !F.flankReached) {
        return pinPoint(rt, FLANK, 8);
      }
      if (F.training === 12 && !gone(F.shiba1)) return null;
      const pin = pinPoint(rt, F.holdPoint || NOBU, 20, 0);
      pin.always = true; pin.defend = true; pin.waiting = true;
      return pin;
    }
    if (F.step === 4) {
      const group = F.advanceGuide?.group;
      if (!group || gone(group)) return null;
      const pin = pinPoint(rt, group.order === 'move' && group.dest ? group.dest : group.anchor, 3, 0);
      // 同じ組の案内役を保ち、倒れた時だけ引き継ぐ。
      if (!fighting(F.advanceGuide.unit)) F.advanceGuide.unit = group.units.find(u => fighting(u) && !u.isPlayer);
      pin.followUnit = F.advanceGuide.unit;
      pin.always = true; pin.marker = F.advanceGuide;
      return pin;
    }
    if (F.step === 2) {
      const pin = pinPoint(rt, F.nobuU?.alive ? F.nobuU.pos : NOBU, 10);
      pin.followUnit = fighting(F.nobuU) ? F.nobuU : null;
      return pin;
    }
    return null;
  },
  // 周りの味方が今なにをしているか（左上の進みの札の一行。kaito 10/22 稲生 2）
  allyDoing: (rt) => {
    const F = rt.flags;
    if (F.step === 0) return F.training <= 1 ? 'にげるはやしの兵を追って前へ走っている' : F.training <= 4 ? '先ではやしの兵と向き合っている' : 'はやしの兵と槍で戦っている';
    if (F.step === 1) return F.centerBack ? '中央も下がり、列を立て直している' : F.leftBack ? '左が崩れ、中央の脇が空いている' : F.training === 11 || F.training === 12 ? '正面を押さえ、右の畦から回っている' : '柴田隊の寄せを受け止めている';
    if (F.step === 2) return '信長について前へ出ている';
    if (F.step === 3) return '林美作守の備を攻めている';
    if (F.step === 4) return '崩れた林の備を追っている';
    return '深追いせず、柴田隊の退きを見ている';
  },
  noWinCrane: true,
  // 倒す相手の頭上に赤い▼（字なし。味方には出さない。kaito 10/23「ビジュアルで」）。
  foeMarks: true,
  enemyTriangleSigns: true,
  // 残り人数を数える隊は、追跡から小戦の終わりまで同じ白縁の▼で示す。
  enemyTriangleGroup: (rt) => rt.flags.step === 0 && rt.flags.training >= 0 && rt.flags.training <= 4 ? rt.flags.practice : null,
  foeMarkRange: 30,
  learningFight: true,   // 新しく始めた人の初陣。傷を軽くする
  playerTaken: 0.6,      // 最初の戦は受ける傷を六割に（テストプレイの声 10/24）
  playerRegen: 0.02,     // 戦っていない時は一秒に命の二分ずつ戻る
  noTaisho: true,        // 殿（信長）と大将の流れは、この定義が持つ
  noReserve: true,
  pacingWait: () => true, // 教えと勝家の退きを、共通の八分打ち切りで飛ばさない。
  lordHata: { spear: 30 },
  foeHit: 0.85,
  spawn: { x: NOBU.x + 4, z: NOBU.z + 5, heading: Math.PI },
  lordSpawn: { x: NOBU.x, z: NOBU.z, heading: Math.PI },
  lordAt: { x: NOBU.x, z: NOBU.z, r: 20, why: '信長の旗本（稲生原の南）' },
  // 身の回りの当時の場（timeslip_field.js）。弘治二年八月二十四日は今の九月末。
  // 乾いた土の街道と畦、穂の出た丈の高い草（尾花が混じる）、土埃。名塚には前日に急ぎ築いた砦の逆茂木（竹束は鉄砲の後の物なので置かない）。
  timeslip: {
    wet: 0, dust: 0.85, trample: 0.2, debris: 1, arrows: 0.6,
    mudColor: 0x75684c, mudOpacity: 0.2,   // 踏み跡は砂色でなく黒みの土（10/28 道と野が砂色の一枚に見えた）
    grass: 0xa4a066, grassTints: [0xffffff, 0xe8dca8, 0xc8d098], grassH: 1.15, tallGrass: 0.9,
    flagColors: [0xe6dfcc, 0x24211e, 0x7a4a36],
    fights: [[SHIBA0.x, SHIBA0.z, 38], [HAYA0.x, HAYA0.z, 30], [HAYA1.x, HAYA1.z, 26], [FLANK.x, FLANK.z, 22]],
    sets: [
      { k: 'sakamogi', x: NAZUKA.x - 6, z: NAZUKA.z - 9, rot: Math.PI, len: 7 },
      { k: 'sakamogi', x: NAZUKA.x + 3, z: NAZUKA.z - 10, rot: Math.PI - 0.15, len: 6 },
      { k: 'nobori', x: NOBU.x - 6, z: NOBU.z - 10, dx: 4, dz: 0, n: 4, kind: 'oda', h: 5 },
    ],
  },
  world: {
    seed: 1556,
    namedKacchu: INOU_KACCHU,
    groundHalf: 320,
    moveLim: 312,
    mountainScale: 0.13,
    mountainBase: -2,
    noGroundRipples: true,
    softEarthCrust: true,
    sparseEarthCrust: true,
    noFootShadows: true,
    solidSpearView: true,
    closeCombatAssist: true, // 穂先の幅だけの判定を避け、見た目どおり正面の兵を突ける。
    time: 'day',
    muddy: 0.2,
    paths: PATHS,
    moveWay,
    height,
    tint(x, z, h, c) {
      let d = Infinity;
      for (let i = 0; i < RIVER.length - 1; i++) { const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1]; if (z >= az && z <= bz) d = Math.abs(x - (ax + (bx - ax) * (z - az) / (bz - az))); }
      if (d < 14) { const k = 1 - d / 14; c.setRGB(c.r * (1 - 0.45 * k) + 0.26 * k, c.g * (1 - 0.45 * k) + 0.25 * k, c.b * (1 - 0.45 * k) + 0.2 * k); return; }
      // 刈田：田の中は刈り株の枯れ色（区画ごとに刈った日の違いで少し揺らす）、畦は草の緑。
      const a = azeAt(x, z);
      if (a < 0) return;
      if (a < 1.1) { const k = 0.6 * (1 - a / 1.1); c.setRGB(c.r * (1 - k) + 0.29 * k, c.g * (1 - k) + 0.25 * k, c.b * (1 - k) + 0.16 * k); return; }   // 畦は土色の細い筋（手本。10/29）
      const cell = Math.sin(Math.round(x / 24) * 12.9898 + Math.round(z / 20) * 78.233) * 43758.5453;
      const v = 0.85 + 0.3 * (cell - Math.floor(cell)), row = 0.92 + 0.08 * Math.sin(x * 3.1);
      // 八月末の稲田：株元は穂の影の黄緑〜黄土。区画ごとに実りの早さを変え、一色にしない（手本の黄金の縞。10/29）
      // 手前は刈り始めの刈田、奥の区画は刈る前の稲で、株の列が東西の細かい縞になる。
      const k = 0.75, gr = 0.5 + 0.5 * (cell - Math.floor(cell)), ripe = gr > 0.42 ? 1 : 0.35, stripe = 0.86 + 0.14 * Math.sin(z * 2.4 + Math.sin(x * .05));
      c.setRGB(c.r * (1 - k) + (0.36 + 0.12 * ripe) * v * stripe * k, c.g * (1 - k) + (0.33 + 0.07 * ripe) * v * row * stripe * k, c.b * (1 - k) + (0.14 - 0.02 * ripe) * v * k);
    },
    clear: (x, z) => Math.abs(x) < 116 && Math.abs(z) < 126,
    fieldStage: 'ripe',   // 弘治二年八月二十四日：手前は刈り始め、奥は刈る前の黄金の稲田（手本の縞）。水は落とし、田の中だけ既存の足場補正で少し遅くする（10/29）。
    paddy,
    streams: [{ pts: RIVER, w: 3, depth: 0.45 },
      { pts: [[72, -130], [72, -40], [72, 20], [96, 20], [96, 140]], w: 0.7, depth: 0.2 }],
    trees: 220,
    tufts: 2800,
    // 霧（約120m）の際に立つ木は白く透けた影になって空に浮いた（10/28）。霧の向こうの林は置かず、屋敷林を野の中の手前に置く。
    treeDensity: () => 0,
    dirtTint: [0.78, 0.74, 0.66],   // 踏まれた所の土は尾張の黒みの土（砂浜のような明るい砂色にしない）
    // 屋敷林は北の集落の脇だけ（霧の際の野の縁に立てた林は、白く透けた影として空に浮いた。10/28）。
    groves: [{ x: -52, z: -76, r: 9, n: 10 }, { x: 52, z: -88, r: 12, n: 14 },
      // 野の中の屋敷林を、霧で透けない近さ（戦う場から六十m内）に三つ。戦う帯・逃げ道・小荷駄の道は外す。
      { x: -56, z: 36, r: 6, n: 6 }, { x: -58, z: -20, r: 6, n: 6 }, { x: 36, z: 77, r: 5, n: 6, kind: 'sugi' },
      // 百姓家の裏と脇の屋敷林（家の北へ横長に。軒と生活道は空ける）
      { x: -14, z: -73.5, r: 4, n: 6, sx: 1.4, sz: .7 }, { x: 10, z: -77, r: 3.5, n: 5, sx: 1.3, sz: .6 }, { x: 22, z: -75, r: 2.2, n: 3 },
      { x: -19, z: -84, r: 3, n: 4, sx: 1.3, sz: .5 }, { x: 32, z: -68, r: 3.5, n: 5, sx: 1.2, sz: .6 },
      // 野の百姓家の屋敷林（家の裏と脇。10/28 採点「奥に屋敷林に囲まれた茅葺き」）
      // 25秒の時のカメラ（持ち場の南から北の本陣の側を見る）に入る家の屋敷林は、杉の黒い垣に裏の竹藪（白く透けた広葉の影にしない）。
      { x: -30, z: 89, r: 6, n: 9, sx: 1.5, sz: .6, kind: 'sugi' }, { x: -33, z: 93, r: 4, n: 7, sx: 1.6, sz: .5, kind: 'sugi' },
      { x: 25, z: 91, r: 5, n: 7, sx: 1.4, sz: .6, kind: 'sugi' }, { x: 28, z: 95, r: 3.5, n: 6, sx: 1.5, sz: .5, kind: 'sugi' },
      { x: -37, z: 74, r: 4, n: 6, sx: 1.4, sz: .6, kind: 'sugi' }, { x: 36, z: 73, r: 3, n: 5, sx: 1.4, sz: .5, kind: 'sugi' }, { x: 39, z: -40, r: 4, n: 6, sx: 1.4, sz: .6 }, { x: -56, z: 45, r: 4, n: 5, sx: 1.3, sz: .6 }, { x: -59, z: -26, r: 4, n: 5, sx: 1.3, sz: .6 },
      // 25秒で歩いた先（z 20 前後）から北を見た時の左右の百姓家の屋敷林
      { x: -43, z: -12.5, r: 4, n: 7, sx: 1.4, sz: .6 }, { x: 39, z: -10.5, r: 3.5, n: 6, sx: 1.4, sz: .6 },
      // 10/29：北を向いた25秒の画面に屋敷林の家が二軒しか入らなかった。北の二軒を足し、裏（北）に杉の垣と竹藪を
      { x: -35, z: -37, r: 4.5, n: 8, sx: 1.5, sz: .6, kind: 'sugi' }, { x: -30, z: -40, r: 3, n: 6, sx: 1.4, sz: .5, kind: 'sugi' },
      { x: 31, z: -19, r: 4, n: 7, sx: 1.5, sz: .6, kind: 'sugi' }, { x: 36, z: -22, r: 3, n: 5, sx: 1.4, sz: .5, kind: 'sugi' },
      // 10/29：田の奥を杉・檜の黒い林の帯で塞ぐ（林の中に空を抜かない）。霧の際（約百二十m）より手前、畦道の間に二重の帯。
      { x: -78, z: -66, line: [62, 0], r: 2.5, n: 26, kind: 'sugi' }, { x: -76, z: -71, line: [58, 0], r: 2.5, n: 22, kind: 'sugi' },
      { x: 82, z: -66, line: [54, 0], r: 2.5, n: 22, kind: 'sugi' }, { x: 80, z: -71, line: [50, 0], r: 2.5, n: 18, kind: 'sugi' }],
    fleeOut: (x, z, team) => team === 1 && z < -138,
    armyFlagKinds: { kari: 'aka_kari' }, // 紋はそのまま、染めだけ朱。林は隊の指定で朱染めにする。

  },

  setup(rt) {
    const W = rt.world;
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags;
    const lord = !!rt.G.lord;
    const thinkNow = rt.army.thinkNow;
    rt.army.thinkNow = function (u) {
      thinkNow.call(this, u);
      const g = u.group;
      // 先に着いた兵を、隊の六割がそろうまで待たせない。
      if (!F.ending && !g.routed && g.onArrive === advanceOnArrival && g.dest &&
          Math.hypot(g.dest.x - g.anchor.x, g.dest.z - g.anchor.z) < 0.3 &&
          advanceEnemy(u) && u.moveTo && Math.hypot(u.moveTo.x - u.pos.x, u.moveTo.z - u.pos.z) < 1.6) {
        g.onArrive = null;
        advanceOnArrival(g);
      }
      if (F.ending || !g.inouAdvance || g.order !== 'attack' || !advanceEnemy(u) ||
          u.isPlayer || u.target || u.atk || u.swing || u.bind || u.escort || u.dragging ||
          u.stdPickup || u.climb || u.perch || u.pinT > this.time || u.stagger > 0 || g.routed) return;
      const enemy = this.nearestEnemy(u, 640, advanceEnemy);
      if (enemy) { u.target = enemy; u.watch = null; u.moveTo = null; u.settled = false; }
    };
    F.step = 0; F.ek = 0; F.ak = 0;
    enemyFlagKinds.add('aka_kari'); enemyFlagKinds.add('aka_oda'); // 置き幟にも敵の赤い縁
    F.goalPin = { x: 0, z: 0, r: 7, hide: 7 };
    F.fieldSigns = [{ label: '', unit: null }, { label: '', unit: null }]; // 味方は印なし・追う相手は字なしの赤い▼（kaito 10/23）
    // ---- 信長方：直属の槍隊・少ない家臣団・若い前田利家・佐久間勢 ----
    F.hata = allyGroup(rt, { name: '信長の旗本', anchor: { x: NOBU.x - 8, z: NOBU.z }, facing: Math.PI, width: 14, aggro: 6, noRout: true, formation: 'yari', fullStrength: true },
      dress([{ type: 'samurai', n: 1, o: { name: '組頭 源八', invuln: true } }, { type: 'ashigaru', n: 11 }], ODA));
    // 本陣には信長と旗本（馬廻の騎馬・槍・旗持ち）を置く（kaito 10/23 稲生 19）。ほとんどは足軽。
    const HATAMOTO = [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }];   // 10/24 kaito「足軽ばかりに」。本陣で並ぶだけの兵は置かず、信長と共に前へ出る
    F.nobuGroup = allyGroup(rt, { name: '信長の本旗', anchor: { x: NOBU.x - 20, z: NOBU.z - 8 }, facing: Math.PI, width: 10, aggro: 0, noRout: true, fullStrength: true, formation: 'yari' },
      dress(lord ? HATAMOTO : [{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true } }, ...HATAMOTO], ODA));
    F.nobuU = lord ? rt.player.u : F.nobuGroup.units[0];
    F.genU = F.hata.units.find((u) => u.name === '組頭 源八');
    F.mori = allyGroup(rt, { name: '森可成の手', anchor: { x: NOBU.x - 38, z: NOBU.z - 8 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '森可成', invuln: true, hat: 'kabuto_s' } }, { type: 'ashigaru', n: 12 }], ODA));
    F.sassa = allyGroup(rt, { name: '佐々孫介の手', anchor: { x: NOBU.x + 22, z: NOBU.z - 8 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '佐々孫介', invuln: true } }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 2 }], ODA));
    F.sassaU = F.sassa.units.find((u) => u.name === '佐々孫介');
    F.inu = allyGroup(rt, { name: '前田利家', anchor: { x: NOBU.x + 18, z: NOBU.z + 8 }, facing: Math.PI, width: 6, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '前田利家', invuln: true, keep: true } }, { type: 'ashigaru', n: 2 }], ODA));
    F.friends = [F.hata, F.mori, F.sassa, F.inu];
    for (const g of F.friends) { g.defMult = 1.15; }
    // 主人公は槍を持つ足軽。配下や借り物の鉄砲・弓は付けない。
    const P = rt.player;
    F.yaw0 = P.yaw; F.look = 0;
    // 空振りも数える（攻撃の札は敵がいなくても試せる）。この戦の自分にだけ包む。
    F.strikeN = 0;
    const strike0 = P.strike.bind(P);
    P.strike = (...a) => {
      const swing = P.u.swing, assist = P.assistImpact, result = strike0(...a);
      if (!a[2] && !a[3] && (P.u.swing !== swing || P.assistImpact && P.assistImpact !== assist)) {
        F.strikeN++;
        // 狙いは player_view.js の pickStrikeTarget が決める。無い時だけ届く相手を使う。
        const target = P.rangeCueTarget;
        if (!P.cameraTargetValid(P.cameraTarget) && P.cameraTargetValid(target)) { P.cameraTarget = target; P.cameraTargetReleased = false; }
      }
      return result;
    };
    // 命中・受け止め・討ち取りを本人の▼だけで返す。空振りと味方には反応しない。
    const damage = rt.army.damage;
    rt.army.damage = function (t, amount, src, ...rest) {
      const hp = t?.hp;
      // 最初の一撃で倒れても、倒れる直前の本人の頭上に結果を残す。
      if (t?.alive && src?.isPlayer && t.team !== src.team) {
        t._inouSignX = t.pos.x;
        t._inouSignY = t.pos.y + inouSignHeight(t);
        t._inouSignZ = t.pos.z;
      }
      const result = damage.call(this, t, amount, src, ...rest);
      if (t && src?.isPlayer && t.team !== src.team) {
        if (!P.cameraTargetValid(P.cameraTarget) && P.cameraTargetValid(t)) { P.cameraTarget = t; P.cameraTargetReleased = false; }
        if (rest[0]?.out?.res === 'block' && t.alive) {
          t.inouBlockUntil = rt.t + .7;
          t.inouHitUntil = 0;
        } else if (t.hp < hp) {
          // 実際に突いた兵を引き続き示し、残る赤の量を読めるようにする。
          if (t.group === F.approachGroup) F.approachUnit = t;
          t.inouHitHp = hp;
          t.inouDamageUntil = rt.t + 2.4;
          // 一突きごとに伸び直せるよう形は先に戻し、削れ跡は別に残す。
          t.inouHitUntil = rt.t + .9;
          t.inouBlockUntil = 0;
        }
        // 討った本人の空の▼を短く閉じる。隣の兵へ命中の反応を移さない。
        if (t.hp < hp && (!t.alive || t.dying || t.hp <= 0 || t.downed || t.woundOut || t.rearWound)) {
          musicAccent();
          t.inouDefeatUntil = rt.t + 1.2;
          t.inouHitUntil = 0;
          t.inouBlockUntil = 0;
          F.combatResult = '一人倒した。次の白縁の▼へ'; F.combatResultUntil = rt.t + 2;
        }
      }
      return result;
    };
    F.training = -1;
    for (const g of [...F.friends, F.nobuGroup]) park(g);

    // ---- 陣と旗 ----
    fieldLife(rt);
    // 霞の色：近くを優先する霧（約九十m）で、林が空色の白い影として空に浮いた（10/28）。
    // 尾張の野の昼の霞を、空色でなく緑がかった灰に。遠い林は暗い青緑の影に沈み、白く透けない。
    { const lookOf = W.lookOf;
      // 夏の終わりの薄雲：空を雲で薄く覆い、日を弱めて影を柔らかく。空の照り返しで陰を起こす（手本。10/29）
      W.lookOf = function (key) { const L = lookOf.call(this, key); if (key === 'day') { L.fog.setHex(0x8c9a8e); L.sunI *= 0.78; L.hemiI *= 1.18; L.cover = Math.max(L.cover, 0.62); } return L; };
      if (W.timeKey === 'day') W.applyLook(W.lookOf('day')); }
    // 本陣の裏の小荷駄：俵と薪を担いだ小者が、陣と街道の間を行き来する（kaito 10/28 の割合。前線には出さない）。
    inouNio(rt);
    inouNearField(rt);
    inouRoad(rt);
    inouNazukaFort(rt);
    // 刈田の稲架：戦う帯と逃げ道を避けた野の東西の縁に。稲を掛けて干す（九月末の尾張の野）。
    for (const [x, z, r] of [[80, -12, 0], [82, 40, 0.05], [-80, 10, 0], [-82, 58, -0.05], [86, 92, 0.1], [-86, -36, 0]]) rt.scene.add(hasa(W, x, z, r, 9));
    // 持ち場の前の刈田の稲架（10/29：25秒の時のカメラは、bot が追う敵しだいで北も南も向く。どちらを向いても一〜二基が二十〜三十歩に横向きに入るよう、
    // 道の左右に、列を東西へ通して立てる。前の稲架は縦に置いて端しか見えず、四角い棘の黒い柵に見えた）。戦う帯の道と畦道は空ける。
    // 10/29：南（本陣）を向いた25秒の画面（持ち場 z 38〜43）は、前の稲架が画角の外（四十六度）で一基も入らなかった。道の東、二十歩先に一基を足す。
    for (const [x, z, r, len] of [[-14, 31, .12, 8], [11, 22, -.15, 7], [-12, 9, .35, 8], [16, 52, .08, 8], [-26, 68, -.1, 7], [11, 64, -.05, 7]]) inouHasa(rt, x, z, r, len, 3);
    // 両軍の陣幕（10/29 採点「陣幕が無い」）：北を向いた時は柴田の雁金の幕（柴田勢の後ろの左、稲架に隠れない所）と、左手の佐久間の先手の織田の幕。
    // 南を向いた時は本陣の幕に加え、本陣の南東の後詰めの織田の幕。戦う帯と逃げ道・小荷駄の道は外す。
    rt.scene.add(jinmaku(W, -13, -36, 9, 6, 4, { mon: 'kari' }));
    // 北を向いた25秒の画面では奥の幕が稲架と霞に隠れた（10/29）。柴田勢の左の野の縁にもう一張り、手前に寄せて立てる。
    rt.scene.add(jinmaku(W, -26, -14, 8, 5, 4, { mon: 'kari' }));
    rt.scene.add(jinmaku(W, -40, 12, 10, 6, 4, { mon: 'oda' }));
    rt.scene.add(jinmaku(W, 14, 72, 10, 6, 4, { mon: 'oda' }));
    // 10/29：25秒の時の持ち場（三回撮って x -12〜4・z 26〜41）から幕は四十〜六十歩先で、北東を向いた画面には一張りも入らなかった。
    // 持ち場から三十歩の内の四方（北西・北東・西・東）に、刈田の縁の幕を足す。戦う帯（道の左右十歩）・右の畦への道・味方の行き先は外す。
    for (const [x, z, w, d, mon] of [[-29, 19, 8, 5, 'oda'], [24, 27, 8, 5, 'oda'], [-24, 40, 8, 5, 'oda'], [22, 42, 8, 5, 'oda']]) rt.scene.add(jinmaku(W, x, z, w, d, 3, { mon }));
    porterTrain(rt, [[NOBU.x - 14, NOBU.z + 14], [NOBU.x - 6, NOBU.z + 28], [0, NOBU.z + 48], [0, NOBU.z + 76]], 6, { name: '信長方の小荷駄' });
    // 信長方の本陣：幕だけで空にしない。奥に床几と軍配、地図の机と使いの者（jinCamp と camp_life）、篝火、馬つなぎ、馬印と旗竿（kaito 10/22 稲生 8）。
    rt.scene.add(jinCamp(W, NOBU.x - 16, NOBU.z, { w: 12, d: 9, gap: 4, mon: 'oda', people: false, noUma: true }));
    for (const [x, z] of [[NOBU.x - 21, NOBU.z + 6], [NOBU.x - 11, NOBU.z + 6]]) rt.scene.add(kagaribi(W, x, z));
    rt.scene.add(umatsunagi(W, NOBU.x - 16, NOBU.z + 11, 0, 7));
    // 稲生での馬印は未確認。徳川を連想する金扇や後年の唐傘を固定せず、既存の隊旗を目印にする。
    rt.scene.add(nobori(W, NOBU.x - 9, NOBU.z - 3, 'oda', 5));
    rt.scene.add(hatazao(W, NOBU.x - 23, NOBU.z - 2, Math.PI / 2, 5, 'oda'));
    for (const [x, z, k] of [[NOBU.x - 12, NOBU.z - 6, 'oda'], [NOBU.x - 12, NOBU.z + 6, 'oda'], [NOBU.x + 10, NOBU.z - 24, 'tsuru'], [NAZUKA.x, NAZUKA.z - 4, 'oda']]) rt.scene.add(nobori(W, x, z, k, 5));
    // 小集落は北の本隊と柴田勢の間。大きな砦や城は置かない。
    for (const [x, z, r] of VILLAGE) rt.scene.add(hut(W, x, z, 7, 5, r, { roof: 0x6a5c44 }));
    // 本陣の北の二軒は25秒で歩いた先から三十〜四十歩に寄せ、南東の一軒は柴田勢の向こうに足す（10/28：遠くて霞に消えていた）。
    // 野に散る百姓家（茅葺き・土壁）。壁は日に白く飛んで漆喰の洋館に見えた（10/28）ので、尾張の黒みの荒土の色に。25秒の時の画面（北の本陣の奥）には屋敷林を背にした四軒が入る。屋敷林を裏に、戦う帯・逃げ道・小荷駄の道から離す。当たりは持たせない（遠景）。
    for (const [x, z, r] of [[-26, 82, .15], [22, 84, -.2], [-36, 66, .05], [34, 64, -.1], [-50, 39, .1], [-53, -20, -.1], [34, -34, .1], [-42, -6, .2], [38, -4, -.15], [-34, -30, .1], [30, -12, -.2]]) rt.scene.add(hut(W, x, z, 7.5, 5, r, { wall: 0x7f6b52, groundedHome: true, minka: false, solid: false, thatchTies: true }));
    for (const [x, z] of [[-18, -60], [22, -80]]) rt.scene.add(tawara(W, x, z, 0, 3));
    // 屋敷林と野の木の葉は、昼の霞で淡い若緑の絵に見えた（10/29）。株ごとの色だけを夏の終わりの濃い緑へ沈める（設営時に一度だけ）。
    const leafTints = new Set();
    for (const mesh of W.treeMeshes || []) {
      const ic = mesh.instanceColor;
      if (!ic || leafTints.has(ic)) continue;
      leafTints.add(ic);
      for (let i = 0; i < ic.count; i++) ic.setXYZ(i, ic.getX(i) * 0.6, ic.getY(i) * 0.66, ic.getZ(i) * 0.52);
      ic.needsUpdate = true;
    }
    // 柴田の旗
    for (const [x, z] of [[SHIBA0.x + 6, SHIBA0.z - 10], [SHIBA0.x + 6, SHIBA0.z + 10], [SHIBA0.x + 24, SHIBA0.z - 4]]) rt.scene.add(nobori(W, x, z, 'aka_kari', 5.5));

    // 立って待つだけの軽い合戦・遠くの止まった列は置かない（kaito 10/24「動かない味方と敵は一切排除」）。会戦は柴田が動く時に組み合った形で出す。
    rt.scene.add(nobori(W, 18, -56, 'aka_kari', 5));
    for (const g of [...F.friends, F.nobuGroup, ...rt.squadGroups]) prepareMarch(g);

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '赤い▼の兵を倒せ', 'main');
    rt.obj('stay', '信長の旗のそばで戦う', 'side');
    rt.marker('holdFlag', () => F.holdPoint || (F.nobuU?.alive ? F.nobuU.pos : NOBU), '信長の旗',
      { guideArea: 'guard', guideFlag: true, guideDefend: true, guideRadius: 20 });
    rt.marker('genpachi', unitPos(F.genU), '組頭 源八', { minor: true, guideRadius: 9 });
    // 始まってすぐ、自分以外の味方は退く林の手を追ってまっすぐ前へ走る（Yuto の流れ・kaito 10/22）。自分のまわりから味方がいなくなる。
    rt.say('組頭 源八', '前へ二メートル歩いてみよ。できたら次の操作だ。', 5);
    for (const g of [...F.friends, F.nobuGroup]) {
      g.order = 'move'; g.speed = 3.2; g.aggro = 0;
      // 始まりだけ左右へ広げ、交戦地点と乱戦の密度は元のまま保つ。
      g.dest = { x: g === F.nobuGroup ? -10 : g === F.hata ? NOBU.x : g === F.mori ? NOBU.x - 22 : g === F.inu ? NOBU.x + 10 : g.anchor.x, z: g === F.hata ? 6 : g === F.nobuGroup ? 14 : 10 };
      g.onArrive = advanceOnArrival;
    }
    rt.after(6, () => rt.say('足軽', '柴田様まで向こうについたらしいぞ', 4));
    this.trainingPhase(rt, 0);
  },

  // 優先設計の段零〜八。説明を隠しても実戦の人数と順番は変えない。
  trainingPhase(rt, phase) {
    const F = rt.flags;
    if (F.training >= phase || F.step !== 0) return;
    if (F.lesson) lessonEnd(rt, F.lesson);
    F.training = phase; F.trainT = rt.t;
    F.blocks0 = rt.stats.blocks + rt.stats.parries;
    if (phase === 0) {
      // 初めから追う林兵を見せる。練習が終わっても同じ三人を使い、印の先を替えない。
      const p = rt.player.u.pos;
      const at = { x: p.x + 2, z: p.z - 10 };
      const g = enemyGroup(rt, { faction: 'nobukatsu', name: '林の遅れ兵', anchor: { ...at }, facing: Math.PI, width: 3, aggro: 0, noAI: true, noRout: true, order: 'hold', dmgMult: 0.25, focus: rt.player.u },
        dress([{ type: 'ashigaru', n: 3 }], HAYA));
      g.speed = 0.8;
      // 赤い▼の兵には初めから攻撃が当たる。教えの待ち時間を無敵の敵にしない。
      for (const u of g.units) { u.hp = u.maxHp = Math.max(30, rt.player.u.dmg * 2.2); u.cdBase *= 1.8; }
      const a = allyGroup(rt, { name: '追う味方', anchor: { x: at.x + 7, z: at.z + 2 }, facing: Math.PI, width: 2, aggro: 0, noAI: true, noRout: true, order: 'hold' },
        dress([{ type: 'ashigaru', n: 2 }], ODA));
      a.speed = 0.8;
      prepareMarch(g); prepareMarch(a);
      F.practice = g; F.chaseA = a; F.chase = true;
      rt.say('組頭 源八', '赤い▼は敵、▼のない兵は味方だ。', 4);
      rt.after(4, () => { if (F.step === 0 && F.training <= 1) rt.say('組頭 源八', '白ふちの赤い▼の一人を追え！', 4); });
      rt.marker('chase', () => approachUnit(rt)?.pos || g.anchor, '林の遅れ兵', { red: true, guideRadius: 7 });
      rt.after(3, () => { if (F.training === 0) { F.trainT = rt.t; lesson(rt, 'move'); } });
      return;
    }
    if (phase === 1) {
      // 操作を試す間に討った兵を、追う相手として待ち続けない。
      if (!practiceLeft(rt)) {
        F.chase = false; rt.unmark('chase');
        vanish(rt, F.chaseA);
        this.trainingPhase(rt, 3); return;
      }
      rt.setPhase('march');
      rt.obj('main', '赤い▼の兵を倒せ', 'main');
      for (const g of [F.practice, F.chaseA]) {
        g.order = 'move'; g.dest = { x: g.anchor.x, z: g.anchor.z - 8 };
      }
      lesson(rt, 'chase'); return;
    }
    if (phase >= 2 && phase <= 4) {
      rt.setPhase('practice');
      const count = phase === 3 ? 2 : 1;
      const pp = rt.player.u.pos;
      const g = enemyGroup(rt, { faction: 'nobukatsu', name: '林の先駆け', anchor: { x: pp.x + 3, z: pp.z - 7 }, facing: 0, width: 3, aggro: 12, seekRange: 30, noAI: true, noRout: true, order: 'attack', dmgMult: phase === 4 ? 0.4 : 0.25, focus: rt.player.u },
        dress([{ type: 'ashigaru', n: count }], HAYA));
      F.practice = g;
      prepareMarch(g);
      for (const u of g.units) { u.hp = u.maxHp = Math.max(30, rt.player.u.dmg * 2.2); u.cdBase *= 1.8; }
      rt.obj('main', '赤い▼の兵を倒せ', 'main');
      // 構える・避けるは教えない（自分で判断できる。kaito 10/23 稲生 4）。
      if (phase === 2) lesson(rt, 'thrust'); return;
    }
    if (phase === 5) {
      // 最初の三人と続く小戦を混ぜず、味方と戦う段で次の林隊を置く。
      // 林美作守の先手だけが小戦を担う。北の旗本は後半まで控える。
      F.haya1 = enemyGroup(rt, { faction: 'nobukatsu', name: '林美作守の先手', anchor: { x: 0, z: 20 }, facing: 0, fleeDir: { x: -1, z: -1 }, width: 6, noRout: true, formation: 'yari', dmgMult: 0.4, defMult: 0.8, morale: 65 },
        dress([{ type: 'samurai', n: 1, o: { name: '林の小隊長' } }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 2 }], HAYA));
      park(F.haya1);
      F.hayaLead = F.haya1.leader;
      F.rear = [[-8, -4], [-24, -2], [24, -2]].map(([x, z]) => {
        const g = enemyGroup(rt, { faction: 'nobukatsu', name: '林の殿', anchor: { x, z: z - 14 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 5, aggro: 10, seekRange: 22, noAI: true, noRout: true, order: 'move', formation: 'yari', dmgMult: 0.2, defMult: 3, morale: 90 },
          dress([{ type: 'ashigaru', n: 5 }], HAYA));
        for (const u of g.units) { u.maxHp *= 5; u.hp = u.maxHp; }
        prepareMarch(g); g.speed = 2.6; g.dest = { x, z };
        g.onArrive = (q) => { q.order = 'attack'; };
        return g;
      });
      prepareMarch(F.haya1);
      rt.setPhase('hayashiSkirmish');
      rt.obj('main', '赤い▼の林美作守の兵を倒せ', 'main');
      rt.say('組頭 源八', '赤い▼が敵だ。味方と一緒に、赤い▼の兵をねらえ！', 4);
      F.hata.aggro = 8; F.hata.order = 'attack'; F.hata.seekRange = 24;
      F.haya1.aggro = 6; F.haya1.fire = true;
      // 赤い▼を付けた隊長も初めから攻撃できる。見える敵を無敵にしない。
      for (const u of F.haya1.units) u.noTarget = false;
      F.haya1.order = 'move'; F.haya1.dest = { x: 0, z: 14 }; F.haya1.speed = 2.2;
      F.hata.order = 'hold';
      rt.after(4, () => rt.say('足軽', 'はやしの兵がこっちを向いた！　隊長の所で戦っておる', 4));
      F.haya1.onArrive = advanceOnArrival;
      lesson(rt, 'together'); return;
    }
    if (phase === 6) { lesson(rt, 'identify'); return; }
    if (phase === 7) {
      // 一人目には出さず、小戦で敵が増えてから狙い定めを教える。
      lesson(rt, 'lock'); return;
    }
    if (phase === 8) {
      F.hayaLead.noTarget = false;
      rt.obj('main', '赤い▼の隊長を倒せ', 'main');
      rt.say('組頭 源八', '赤い▼の隊長をたおせ！', 4);
      lesson(rt, 'morale');
    }
  },

  // 段九以降：林の小隊が崩れてから、柴田隊がまとまって寄せる
  shibaCome(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    if (F.lesson) lessonEnd(rt, F.lesson);
    F.step = 1; F.stepT = rt.t; F.training = 9;
    // 守る場所を固定し、逃げ回る間は最初の守備を進めない。
    const lead = F.nobuU?.alive ? F.nobuU.pos : NOBU;
    F.holdPoint = { x: lead.x, z: lead.z }; F.holdElapsed = 0;
    spawnShiba(rt); spawnNazuka(rt);
    rt.unmark('genpachi');
    rt.setPhase('shibata');
    // 合成の法螺貝は間抜けに聞こえる（テストプレイの声 10/24）。陣太鼓の短い二つ打ちだけ。
    sfx('taiko', 1); rt.after(0.45, () => sfx('taiko', 0.85));
    rt.banner('柴田勝家隊が動く', '長槍の列、徒歩の武者、後ろの弓。味方と並んで受け止めよう');
    rt.obj('main', 'ここを守れ', 'main');
    rt.say('足軽', '柴田様だ……本当にあの方と戦うのか', 4);
    rt.after(5, () => rt.say('組頭 源八', '突出するな！味方と並べ！', 4));
    rt.after(6, () => lesson(rt, 'stay'));
    for (const g of [...F.friends, F.nobuGroup]) {
      g.fire = true; g.aggro = 0; g.order = 'move'; g.speed = 3.2;
      g.dest = { x: F.holdPoint.x + (g === F.nobuGroup ? 0 : g.anchor.x < 0 ? -7 : 7), z: F.holdPoint.z - (g === F.nobuGroup ? 0 : 4) };
      g.onArrive = (q) => { q.order = 'attack'; q.aggro = 8; q.seekRange = 16; };
    }
    // 佐久間勢は西の名塚から横へ駆け込み、着いたらそのまま斬り合う。
    F.nazuka.aggro = 10; F.nazuka.fire = true; F.nazuka.order = 'move'; F.nazuka.speed = 3; F.nazuka.dest = { x: -22, z: 16 };
    F.nazuka.onArrive = (g) => { g.order = 'attack'; g.seekRange = 45; };
    for (const g of F.shiba) { for (const u of g.units) u.noTarget = false; g.noAI = true; g.fire = true; g.aggro = 12; g.order = 'attack'; g.seekRange = 65; g.speed = 2; }
    // 後ろの六人も立たせず斬り合う。前半に討たれ切らないよう命だけ厚くする。
    for (const u of F.rearSpears) { u.maxHp *= 2; u.hp = u.maxHp; }
    F.miyaiU.noTarget = true;
    // 殿は柴田と入れ替わりに北へ退き、戦場から消える。
    for (const g of F.rear) if (!gone(g)) { g.order = 'retreat'; g.aggro = 0; g.dest = { x: g.anchor.x, z: -110 }; g.onArrive = (q) => vanish(rt, q); }
    // 長槍も立ち止まらず、味方の列まで寄せてから斬り合う。
    // 着いたら槍衾（穂先をそろえて構える）。十秒ごとに声を合わせて四秒だけ突き出る（update の槍衾の拍）。
    F.shiba1.order = 'move'; F.shiba1.dest = { x: 0, z: 2 }; F.shiba1.onArrive = (g) => { g.order = 'yari'; g.seekRange = 80; F.wallAt = rt.t + 6; F.wallOut = false; };
    F.shibaG.order = 'move'; F.shibaG.dest = { x: 0, z: 30 };
    F.shibaBow.order = 'move'; F.shibaBow.dest = { x: 0, z: 14 };
    F.shibaBow.onArrive = advanceOnArrival;
    F.shibaG.onArrive = advanceOnArrival;
    rt.marker('shiba', centerOf(F.shiba1), () => '柴田の長槍隊', { red: true, group: F.shiba1 });
    // 軽い隊だけを中央の会戦へ寄せる。近くで戦う兵は増やさず、前列を横一線に当てる。はじめから組み合う。
    F.front = clash(rt, { x: 26, z: 18, facing: Math.PI, w: 22, gap0: 0, seed: 1556, noRout: true, killRate: 0.25, noReserve: true, noWake: true, host: false,
      A: { flag: 'oda', armor: KIT.ARMOR.oda, count: 36, kind: 'spear', team: 0, faction: 'oda', flagRate: 0.15 },
      B: { flag: 'kari', armor: SHIBA.armor, count: 54, kind: 'spear', team: 1, faction: 'nobukatsu', flagRate: 0.15 } });
    F.front.go();
  },

  // 段十三。林の備と、その横を支える中央の備は別々に退く。
  hayaCome(rt) {
    const F = rt.flags;
    if (F.hayaG) return;
    F.training = 13;
    rt.obj('main', 'ここを守れ', 'main');
    lesson(rt, 'commander');
    rt.say('組頭 源八', '旗と護衛の集まる所を見よ。侍大将が兵を支えておる', 4);
    // 従来の旗本十六人を二つの備へ分ける。兵の総数は増やさない。
    F.hayaG = enemyGroup(rt, { faction: 'nobukatsu', name: '林美作守の旗本', anchor: { x: -24, z: -8 }, facing: 0, fleeDir: { x: -0.3, z: -1 }, aggro: 6, width: 7, noAI: true, noRout: true, morale: 75, formation: 'yari', dmgMult: 0.55, defMult: 1.2 },
      dress([{ type: 'busho', n: 1, o: { name: '林美作守', invuln: true, horse: true, flagScale: 2.2, hat: 'kabuto_m' } }, { type: 'ashigaru', n: 8 }], HAYA));
    F.hayaU = F.hayaG.leader;
    F.hayaU.dmg *= 0.5; F.hayaU.noTarget = true;
    // 林の新手：同じ八人の備を、左（西）の畦から鬨の声と共に横から駆け込ませる。三人は刀で飛び込む武者。
    F.hayaCenter = enemyGroup(rt, { faction: 'nobukatsu', name: '林の中央の備', anchor: { x: -78, z: 4 }, facing: Math.PI / 2, fleeDir: { x: 0, z: -1 }, aggro: 6, width: 7, noAI: true, noRout: true, morale: 80, formation: 'line', dmgMult: 0.55 },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 5 }], HAYA));
    F.haya = [F.hayaG, F.hayaCenter];
    for (const g of F.haya) prepareMarch(g);
    F.hayaG.order = 'move'; F.hayaG.dest = { x: F.hayaG.anchor.x, z: 24 }; F.hayaG.speed = 1.6;
    F.hayaG.onArrive = advanceOnArrival;
    const sg = F.hayaCenter, left = F.mori && !gone(F.mori) ? F.mori.center() : { x: -20, z: 14 };
    sg.order = 'move'; sg.speed = 3.6; sg.fire = true; sg.dest = { x: left.x - 4, z: left.z };
    sg.onArrive = (g) => { F.surgeHit = rt.t; advanceOnArrival(g); };
    rt.army.play('toki', sg.anchor, 1.3); rt.after(0.6, () => sfx('taiko', 0.9));
    rt.after(1.2, () => rt.say('足軽', '左から新手じゃ！', 3));
    // 大将の登場：鼓動の太鼓と張った笛。名前は姿が近づいた時に一度だけ大きく出す（update）。
    musicTension(14); F.bossAt = rt.t;
    F.kuroda = allyGroup(rt, { name: '黒田半平', anchor: { x: -18, z: 46 }, facing: Math.PI, width: 6, aggro: 8, noAI: true, noRout: true, order: 'move' },
      dress([{ type: 'samurai', n: 1, o: { name: '黒田半平', invuln: true, keep: true } }, { type: 'ashigaru', n: 3 }], ODA));
    prepareMarch(F.kuroda);
    // 黒田は着いて待たず、林の備へそのまま当たる。
    F.kuroda.dest = { x: -20, z: 30 }; F.kuroda.speed = 3;
    F.kuroda.onArrive = (g) => { g.order = 'attack'; g.seekRange = 30; };
    rt.marker('hayaU', unitPos(F.hayaU), 'はやし', { red: true, h: 3.4 });
  },

  // 段十四。味方左翼、中央の順に下がった後、若い信長が中央の前へ出る。
  daionjo(rt) {
    const F = rt.flags;
    if (F.step !== 1 || !F.centerBack) return;
    F.step = 2; F.stepT = rt.t; F.training = 14;
    if (F.lesson) lessonEnd(rt, F.lesson);
    rt.unmark('flank');
    rt.setPhase('daionjo');
    if (!rt.G.lord) {
      F.nobuGroup.order = 'move'; F.nobuGroup.aggro = 2; F.nobuGroup.speed = 3;
      F.nobuGroup.dest = { x: -12, z: 30 };
      F.nobuGroup.onArrive = advanceOnArrival;
    }
    sfx('taiko', 1); rt.after(0.4, () => sfx('taiko', 0.9));
    rt.banner('信長、自ら中央の前へ', '若い主の大声に、味方が踏みとどまる');
    if (F.nobuU?.alive) { rt.army.play('eshout', F.nobuU.pos, 2); F.nobuU.cheer = 2; }
    rt.say('織田信長', '押せ！ここで退けば終わりぞ！', 4);
    rt.after(5, () => rt.say('織田信長', '退くな！ここを破れば終わりぞ！', 4));
    for (const g of F.friends) {
      g.morale = Math.min(100, g.morale + 25);
      if (g === F.inu && !F.miyaiFell) continue;
      g.order = 'move'; g.dest = { x: g === F.inu ? 12 : g.anchor.x, z: 36 };
      g.onArrive = advanceOnArrival;
    }
    F.front.push('A', 0);
    rt.obj('main', '信長と列を立て直し、林の備を崩そう', 'main');
    rt.award((t) => { t.side.push('味方と柴田の寄せを受け止めた'); }, '柴田の寄せを受け止めた');
    rt.after(10, () => { F.training = 15; lesson(rt, 'recovery'); });
    rt.after(20, () => {
      F.training = 16;
      if (rt.player.hasKatana) lesson(rt, 'switch');
      else if (F.lesson) lessonEnd(rt, F.lesson);
    });
    rt.after(22, () => {
      if (F.lesson) lessonEnd(rt, F.lesson);
      F.step = 3; F.stepT = rt.t; F.training = 17;
      rt.setPhase('hayashi');
      F.hayaU.noTarget = false; F.hayaU.invuln = false;
      F.hayaMorale = F.hayaG.morale;
      F.kuroda.order = 'attack'; F.kuroda.focus = F.hayaU; F.kuroda.seekRange = 45;
      for (const g of [F.hata, F.mori]) { g.order = 'attack'; g.focus = F.hayaU; g.seekRange = 35; }
      if (!rt.G.lord) { F.nobuGroup.order = 'attack'; F.nobuGroup.focus = F.hayaU; }
      rt.say('組頭 源八', '黒田殿が林美作守と斬り合っておる。味方と押せ！', 4);
      rt.obj('main', '味方と攻め、林美作守の備を崩そう', 'main');
    });
  },

  // 段十七。討死直後は林の備だけが下がり、時間差で隣へ伝わる。
  hayaFell(rt) {
    const F = rt.flags;
    if (F.step !== 3 || F.hayaU.alive) return;
    F.step = 4; F.stepT = rt.t;
    // 同じ一組の旗と、その組が実際に進む先を示す。
    const group = [F.hata, F.mori, F.sassa, F.nazuka].find(g => !gone(g));
    F.advanceGuide = group ? { group, guideFlag: true } : null;
    rt.obj('main', '味方と進め', 'main');
    rt.setPhase('hayafell');
    rt.unmark('hayaU');
    rt.banner('林美作守、討死', '大将を失った備が下がり、中央の脇が開く');
    brushWord(rt, 'はやしを たおした', { hold: 2.2 });
    sfx('taiko', 1); rt.after(0.3, () => sfx('taiko', 0.9));
    // 共通の討死処理にも士気低下があるため、直前の値から四十だけ下げる。
    F.hayaG.morale = Math.max(0, (F.hayaMorale ?? F.hayaG.morale) - 40);
    F.hayaG.order = 'retreat'; F.hayaG.dest = { x: -32, z: -72 };
    F.hayaG.onArrive = (g) => vanish(rt, g); F.hayaG.speed = 1.8;
    F.hayaG.aggro = 1; F.hayaG.fire = false;
    lesson(rt, 'chain');
  },

  // 討死後の進行は段の時計で管理し、討死の通知や予約の有無に依存させない。
  aftermathTick(rt) {
    const F = rt.flags, elapsed = rt.t - F.stepT;
    if (F.step !== 4) return;
    if (elapsed >= 9 && !F.centerOpen) {
      F.centerOpen = true;
      const g = F.hayaCenter;
      g.morale = Math.max(0, g.morale - 30); g.aggro = 1; g.fire = false;
      g.order = 'retreat'; g.dest = { x: -8, z: -80 }; g.speed = 1.8;
      g.onArrive = (q) => vanish(rt, q);
      rt.say('組頭 源八', '林の備が下がった！中央の脇が開いたぞ。味方と前へ！', 4);
      for (const q of [F.hata, F.mori, F.sassa, F.nazuka]) if (!gone(q)) {
        q.focus = null; q.order = 'move'; q.dest = { x: q.anchor.x, z: 4 };
        q.onArrive = advanceOnArrival;
      }
      F.kuroda.focus = null; F.kuroda.order = 'attack'; F.kuroda.seekRange = 35;
      F.nobuGroup.focus = null; F.nobuGroup.order = 'attack'; F.nobuGroup.seekRange = 30;
      F.front.push('B', 0.6);
    }
    if (elapsed >= 21 && !F.mainBroken) {
      F.mainBroken = true; F.training = 18;
      F.front.rout('B', { hideAfter: 40 });
      for (const g of F.haya) { g.noRout = false; }
      lesson(rt, 'pursuit');
      rt.obj('main', '味方と追撃し、柴田の槍隊には近づきすぎない', 'main');
      rt.award((t) => { t.special = { label: '稲生原で部隊の崩れを連ねた', pts: 18 }; }, '林の備から中央を崩した');
    }
    if (elapsed >= 32) this.shibaRetreat(rt);
  },

  // 段十九。弓、武者、しんがりの長槍。勝家は最後まで槍隊のそばに残る。
  shibaRetreat(rt) {
    const F = rt.flags;
    // 林の主力が崩れたら退く。宮井を誰が討ったかや、利家との接触を進行条件にしない。
    if (F.step !== 4 || !F.mainBroken) return;
    F.step = 5; F.stepT = rt.t; F.training = 19;
    if (F.lesson) lessonEnd(rt, F.lesson);
    rt.unmark('shiba');
    rt.setPhase('shibataRetreat');
    rt.banner('柴田隊、孤立', '周りの備が崩れても、槍の列を崩さず退く');
    rt.after(4, () => rt.say('足軽', '柴田様の隊が下がっていく……。押し返したぞ！', 4));
    rt.say('柴田勝家', '退け！', 3);
    for (const g of F.shiba) {
      g.focus = null; g.onArrive = null; g.noRout = true; g.morale = Math.max(60, g.morale);
      g.fire = false; g.aggro = 2; g.speed = 1.8;
    }
    F.retreatSpear = { x: F.shiba1.anchor.x, z: -108 };
    F.retreatWarrior = { x: F.shibaG.anchor.x, z: -120 };
    F.shibaBow.order = 'retreat'; F.shibaBow.dest = { x: 0, z: -130 }; F.shibaBow.onArrive = (g) => vanish(rt, g);
    // 勝家の武者は立ち止まらず、ゆっくり下がり始める。
    F.shibaG.order = 'retreat'; F.shibaG.dest = F.retreatWarrior; F.shibaG.speed = 1.2;
    F.shiba1.order = 'yari'; F.shiba1.facing = 0;
    for (const u of F.rearSpears) { u.noTarget = false; u.aiT = 0; }
    rt.after(6, () => {
      F.shiba1.order = 'retreat'; F.shiba1.dest = F.retreatSpear;
    });
    // 勝家本人の最終の下がりは、槍隊が十分離れてから。
    F.shibaU.noTarget = true; F.shibaU.target = null; F.shibaU.atk = null;
    F.shibaU.moveTo = null;
    rt.obj('main', '深追いせず、柴田隊が退くのを見届けよう', 'main');
    // 味方は立って見送らず、退く柴田の後ろを押す。
    for (const g of [...F.friends, F.nobuGroup, F.kuroda, F.nazuka]) if (!gone(g)) { g.focus = null; g.order = 'attack'; g.aggro = 6; g.seekRange = 60; }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || !F.mainBroken || !F.commanderRetired) return;
    F.ending = true; F.training = 20;
    if (F.lesson) lessonEnd(rt, F.lesson);
    rt.setPhase('end');
    rt.unmark('holdFlag');
    rt.objDone('main');
    rt.tracker.main = true;
    if (!F.strayed) rt.objDone('stay');
    // 勝った瞬間：鬨の声と太鼓・短い止まり・味方の勝ち鬨・筆文字の「勝」。自分と味方を映したまま三秒で結果へ（テストプレイの声 10/24）。
    rt.player.u.invuln = true;
    for (const g of F.friends) { g.order = 'hold'; g.focus = null; }
    victoryMoment(rt, '勝');
    rt.say('組頭 源八', '勝ったぞ！　勝ち鬨をあげよ！', 3);
    rt.finish({ scriptedEnd: true }, 3.2);
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    if (F.ending) return;
    fieldDustTick(rt);
    KIT.backTick(rt);
    // 赤い▼の本人への道を、既存の道譲りと共有する。囲みの札は要らない。
    rt.army.guideWayEnemy = this.missionSignTarget(rt);
    rt.army.guideWayAt = rt.army.time;
    // 札の成功は今の段だけを見る。先に押した操作で後の段を済ませない。
    const P = rt.player;
    // 移動・視点を試す間も敵は斬れるが、初めの三人からは打ち込まれない。
    if (F.step === 0 && F.training === 0) rt.army.playerCounterUntil = rt.army.time + 0.3;
    if (F.lesson === 'look') {
      F.look += Math.abs(((P.yaw - F.yaw0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      F.yaw0 = P.yaw;
      if (F.look > 1.6) rt.tutMark('look');
    }
    if (F.lesson === 'lock' && P.lock) rt.tutMark('lock');
    if (F.lesson === 'block' && rt.stats.blocks + rt.stats.parries > F.blocks0) {
      rt.tutMark('block');
      F.counterHp = F.practice.units.reduce((n, u) => n + Math.max(0, u.hp), 0);
      lesson(rt, 'counter');
    }
    if (F.lesson === 'counter' && F.practice.units.reduce((n, u) => n + Math.max(0, u.hp), 0) < F.counterHp) rt.tutMark('counter');
    // 説明は五秒で引く。成功・進行の監視は札が消えても続ける。
    if (F.lesson && rt.t - F.lessonAt > 5 && !F.lessonHidden) { F.lessonHidden = true; rt.hud.renderTut(null); }
    if (F.step === 0) {
      const elapsed = rt.t - F.trainT;
      // 操作を試す間に全員を討った時も、空の目標を待たず次の実戦へ渡す。
      if (F.training === 0 && !practiceLeft(rt)) {
        this.trainingPhase(rt, 1); return;
      }
      if (F.training === 0) {
        // 移動 → 視点 → 攻撃。操作を試せたら早めに次へ（目安：移動23秒・視点8秒・攻撃6秒）。
        const since = rt.t - (F.lessonAt || 0);
        if (F.lesson === 'move' && (P.movedAcc - F.move0 >= 2 || F.lessonDone?.move || since > 23)) { rt.tutMark('move'); F.view0 = SETTINGS.view; lesson(rt, 'view'); F.strike0 = F.strikeN; }
        else if (F.lesson === 'view' && (SETTINGS.view !== F.view0 || since > 8)) {
          F.viewSuccess = SETTINGS.view !== F.view0;
          if (F.viewSuccess) rt.tutMark('view');
          P.switchWeapon('spear');
          F.strike0 = F.strikeN; lesson(rt, 'swing');
        }
        else if (F.lesson === 'swing' && (F.strikeN > F.strike0 || since > 6)) {
          if (F.strikeN > F.strike0) rt.tutMark('swing');
          this.trainingPhase(rt, 1);
        }
      } else if (F.training === 1) {
        const g = F.practice, u = approachUnit(rt);
        if (!F.caught && u && Math.hypot(p.x - u.pos.x, p.z - u.pos.z) <= 7) {
          // 追いついた：味方二人は横へ抜け、林兵三人が向き直る。
          F.caught = rt.t; F.strikeCaught = F.strikeN;
          rt.unmark('chase'); F.chase = false;
          const ac = F.chaseA.center();
          F.chaseA.dest = { x: ac.x + 40, z: ac.z - 30 }; F.chaseA.speed = 3.2;
          F.chaseA.onArrive = (q) => vanish(rt, q);
          g.order = 'attack'; g.aggro = 12; g.seekRange = 30; g.speed = 1.6;
          for (const u of g.units) u.noTarget = false;
          rt.obj('main', '赤い▼の林美作守の兵を倒せ', 'main');
          rt.say('組頭 源八', usesTouchControls() ? '白ふちの赤い▼が追う兵だ。槍が届くまで近づき、「つく」を押して離せ！' : '白ふちの赤い▼が追う兵だ。槍が届くまで近づき、マウスの左ボタンで突け！', 4);
          lesson(rt, 'kill');
        }
        if (F.caught && !F.firstHitAt && F.strikeN > F.strikeCaught) F.firstHitAt = rt.t;
        // 初めの攻撃から三十秒は、敵は自分へ打ち込まない（打ち込む前も待つ）。
        if (F.caught && (!F.firstHitAt || rt.t < F.firstHitAt + 30)) rt.army.playerCounterUntil = rt.army.time + 0.3;
        if (P.u.alive) P.u.hp = Math.max(P.u.hp, P.u.maxHp * 0.7);
        if (F.caught && !practiceLeft(rt)) { rt.tutMark('kill'); rt.say('組頭 源八', 'よし、討ったな！　まだ来るぞ', 3); this.trainingPhase(rt, 3); }
        // 追いつく前に林兵が皆討たれた（味方が先に討った）時も先へ進む。敵のいない野で全員が立ち尽くさない（kaito 10/27）。
        else if (!F.caught && !practiceLeft(rt)) { F.chase = false; rt.unmark('chase'); if (F.chaseA) vanish(rt, F.chaseA); this.trainingPhase(rt, 3); }
        // 追跡先を突然移さず、少し退いたら同じ場所で待つ。
        else if (!F.caught && !F.chaseStopped && rt.t - F.trainT > 8) {
          F.chaseStopped = true;
          for (const group of [g, F.chaseA]) {
            group.order = 'hold'; group.dest = null;
            for (const u of group.units) u.moveTo = null;
          }
        }
      } else if (F.training >= 2 && F.training <= 4) {
        // 最初の実戦は死なせず、一度に敵を足さない。
        if (P.u.alive) P.u.hp = Math.max(P.u.hp, P.u.maxHp * 0.7);
        if (false) {
          // 先に敵を倒した人にも、防御の次に反撃する順番を残す。
          F.counterHp = 0; lesson(rt, 'counter');
        }
        // 既に倒れた相手へ「倒せ」を残さず、生きている次の兵の▼につなぐ。
        if (!practiceLeft(rt)) this.trainingPhase(rt, F.training + 1);
        else if (elapsed > 90) {
          F.hata.aggro = 12; F.hata.order = 'attack'; F.hata.seekRange = 30;
          rt.objProgress('main', '組頭のそばで、味方と敵を止めよう');
        }
      } else if (F.training >= 5 && F.training <= 7 && !fighting(F.hayaLead)) {
        // 小戦で先に隊長を討った時も、倒れた本人を次の目標にしない。
        this.trainingPhase(rt, 8);
      } else if (F.training === 5) {
        if (elapsed > 12) { rt.tutMark('together'); this.trainingPhase(rt, 6); }
      } else if (F.training === 6 && elapsed > 7) {
        rt.tutMark('identify'); this.trainingPhase(rt, 7);
      } else if (F.training === 7 && (F.lessonDone?.lock && elapsed > 6 || elapsed > 20)) this.trainingPhase(rt, 8);
      else if (F.training === 8) {
        if (!fighting(F.hayaLead) && !F.smallRout) {
          F.smallRout = rt.t;
          F.haya1.noRout = false; F.haya1.morale = Math.max(0, F.haya1.morale - 40);
          F.haya1.order = 'retreat'; F.haya1.dest = { x: -24, z: 8 };
          F.haya1.onArrive = advanceOnArrival;
          for (const u of F.haya1.units) u.cdBase *= 1.5;
          rt.say('組頭 源八', '侍大将を失った部隊は士気が下がる。敵が下がったぞ', 4);
          rt.tutMark('morale');
        }
        if (F.smallRout && rt.t - F.smallRout > 6) this.shibaCome(rt);   // 待ちは短く（せっかちの bot 10/28）
      }
    }
    // 勝家の近くは強気、離れると元へ戻る。一秒に一度・既存の三隊だけ。
    if (F.step === 1 && !(F.auraAt > rt.t)) {
      F.auraAt = rt.t + 1;
      const strong = F.shibaU.alive && !F.shibaU.woundOut && !F.shibaU.fleeing;
      for (const g of F.shiba) {
        if (gone(g)) continue;
        const c = g.center();
        const near = strong && Math.hypot(c.x - F.shibaU.pos.x, c.z - F.shibaU.pos.z) < 24;
        g.aggro = near ? 14 : 8; g.dmgMult = near ? 1 : 0.75;
        if (near && !F.flankSuccess) g.morale = Math.max(g.morale, 88);
      }
    }
    this.enemyBeat(rt, dt);
    // 側面へ回る間は、組頭の命令どおり動いた人を離脱扱いにしない。
    const lead = F.nobuU?.alive ? F.nobuU.pos : NOBU;
    if (!rt.G.lord && F.step >= 1 && F.step < 5 && !F.strayed && F.training !== 11 && F.training !== 12) {
      const d = Math.hypot(p.x - lead.x, p.z - lead.z);
      F.strayT = d > 52 ? (F.strayT || 0) + dt : 0;
      if (F.strayT > 10) { F.strayed = true; rt.violation('味方を離れたため、手柄が減った', ['組頭 源八', '味方と並べ。まだ負けではないぞ']); rt.objFail('stay'); }
    } else F.strayT = 0;
    if (F.step === 1) {
      // 初めの守備はピンの二十メートル内で進む。側面攻撃へ移った後は従来の順を保つ。
      if (F.training >= 11 || Math.hypot(p.x - F.holdPoint.x, p.z - F.holdPoint.z) <= 20) F.holdElapsed += dt;
      const elapsed = F.holdElapsed;
      if (elapsed > 6 && F.training < 10) F.training = 10;
      if (elapsed > 20 && F.training < 11) {
        F.training = 11; lesson(rt, 'side');
        rt.marker('flank', FLANK, '右の畦道', { guideRadius: 8 });
        rt.obj('main', '味方が正面を押さえる間に、右の畦へ回ろう', 'main');
        rt.say('組頭 源八', '右へ回れ！横から崩せ！', 4);
        F.inu.order = 'move'; F.inu.dest = { ...FLANK }; F.inu.onArrive = advanceOnArrival;
      }
      // ピン（右の畦）に着いたら、時を待たずに横からの攻めへ進む（行き先と判定を合わせる）。
      if (F.training === 11 && !F.flankReached && Math.hypot(p.x - FLANK.x, p.z - FLANK.z) < 8) F.flankReached = true;
      if ((elapsed > 36 || F.flankReached && elapsed > 24) && F.training < 12) {
        F.training = 12; lesson(rt, 'flank');
        F.flankHp = F.shiba1.units.reduce((n, u) => n + Math.max(0, u.hp), 0);
      }
      if (F.training === 12 && !(F.flankAt > rt.t)) {
        F.flankAt = rt.t + 1;
        const g = F.shiba1, c = g.center();
        const hp = g.units.reduce((n, u) => n + Math.max(0, u.hp), 0);
        if (!F.flankSuccess && p.x > c.x + 7 && Math.hypot(p.x - c.x, p.z - c.z) < 20 && hp < F.flankHp) {
          F.flankSuccess = true;
          g.morale = Math.max(25, g.morale - 18); g.facing = Math.atan2(p.x - c.x, p.z - c.z);
          g.order = 'retreat'; g.dest = { x: c.x - 3, z: c.z - 5 };
          g.onArrive = advanceOnArrival;
          rt.tutMark('flank');
          rt.award((t) => { t.side.push('味方と側面から柴田の槍を崩した'); }, '側面攻撃 成功');
        }
        F.flankHp = hp;
      }
      if (elapsed > 42 && !F.miyaiDuel) {
        F.miyaiDuel = true;
        F.miyaiU.noTarget = false; F.miyaiU.onWound = () => {};
        F.inu.order = 'attack'; F.inu.focus = F.miyaiU;
      }
      if (elapsed > 56 && F.training < 13) this.hayaCome(rt);
      // 左の崩れ：横から来た林の新手が森の手に当たると、時を待たずに崩れる。
      if ((elapsed > 76 || F.surgeHit && rt.t - F.surgeHit > 5 && elapsed > 64) && !F.leftBack) {
        F.leftBack = true;
        if (F.mori && !gone(F.mori)) rt.army.play('unitBreak', F.mori.center(), 1);
        F.mori.morale = Math.max(25, F.mori.morale - 30);
        F.mori.order = 'retreat'; F.mori.dest = { x: -24, z: 52 };
        F.mori.onArrive = advanceOnArrival;
        F.front.push('A', 0.5);
        rt.say('足軽', '左が崩れた！中央の脇が空くぞ！', 4);
      }
      if (elapsed > 86 && !F.centerBack) {
        F.centerBack = true;
        F.hata.morale = Math.max(30, F.hata.morale - 20);
        F.hata.order = 'retreat'; F.hata.dest = { x: 0, z: 56 };
        F.hata.onArrive = advanceOnArrival;
        rt.say('組頭 源八', '中央も下がる！列を切らすな！', 4);
      }
      if (elapsed > 98) this.daionjo(rt);
    }
    // 宮井がほかの者に討たれても、段を止めない（全員が打ち合うので、利家より先に倒れる事がある）。
    if (F.miyaiU && !F.miyaiFell && !F.miyaiU.alive && F.step < 5) { F.miyaiFell = true; F.inu.focus = null; }
    if (F.miyaiDuel && !F.miyaiFell && F.miyaiU.alive && F.step < 5) {
      const toshi = F.inu.units[0];
      if (toshi?.alive && Math.hypot(toshi.pos.x - F.miyaiU.pos.x, toshi.pos.z - F.miyaiU.pos.z) < 3.5) {
        F.miyaiFell = true;
        F.miyaiU.invuln = false; F.miyaiU.hp = 0; rt.army.kill(F.miyaiU, toshi);
        F.inu.focus = null;
        rt.banner('前田利家、宮井勘兵衛を討つ', '若い利家が槍を振るい、味方の脇を支えた');
      }
    }
    if (F.step === 3) {
      // 討死前の士気を保存する。共通処理との二重の引き下げを防ぐ。
      if (F.hayaU.alive) F.hayaMorale = F.hayaG.morale;
      // 味方との接触を待ち、遠くにいる美作守を台詞だけで討たない。
      const elapsed = rt.t - F.stepT;
      const nobu = F.nobuU;
      if (F.hayaU.alive && elapsed > 55 && nobu?.alive && Math.hypot(nobu.pos.x - F.hayaU.pos.x, nobu.pos.z - F.hayaU.pos.z) < 4) {
        F.hayaU.hp = 0; rt.army.kill(F.hayaU, nobu);
      }
      // 信長が届かない時も、斬り合う黒田が八十秒で討つ（山場を長く引き延ばさない）。
      const kuro = F.kuroda?.units[0];
      if (F.step === 3 && F.hayaU.alive && elapsed > 80) { F.hayaU.invuln = false; F.hayaU.hp = 0; rt.army.kill(F.hayaU, kuro?.alive ? kuro : nobu?.alive ? nobu : null); }
      if (!F.hayaU.alive) this.hayaFell(rt);
    }
    if (F.step === 4) this.aftermathTick(rt);
    if (F.step === 5) {
      const elapsed = rt.t - F.stepT;
      // 近くの追い手を一秒に一度だけ見る。止める時間を区切り、またまとまって退く。
      if (!(F.guardAt > rt.t)) {
        F.guardAt = rt.t + 1;
        const g = F.shiba1;
        const guard = g.units.find((u) => u.alive && !u.woundOut);
        const pursuer = guard && rt.army.nearestEnemy(guard, 13, (u) => !u.fleeing && !u.noTarget);
        if (F.guardUntil && rt.t >= F.guardUntil) {
          F.guardUntil = 0; F.guardNext = rt.t + 12;
          g.order = 'retreat'; g.dest = F.retreatSpear;
          if (F.lastWithdraw) { F.shibaG.order = 'retreat'; F.shibaG.dest = F.retreatWarrior; }
        } else if (elapsed > 6 && elapsed < 75 && pursuer && !F.guardUntil && !(F.guardNext > rt.t)) {
          F.guardUntil = rt.t + 5;
          g.order = 'yari'; g.facing = Math.atan2(pursuer.pos.x - guard.pos.x, pursuer.pos.z - guard.pos.z);
          rt.say('組頭 源八', '追いすぎるな！槍が向き直るぞ！', 4);
        }
      }
      if (elapsed > 18 && !F.lastWithdraw && !F.guardUntil) {
        F.lastWithdraw = true;
        F.shibaG.order = 'retreat'; F.shibaG.dest = F.retreatWarrior;
      }
      // 追い手に絡まれて下がり切れない時も、五十秒で退き終えた扱いにする（止まったまま終わらない戦にしない）。
      if (elapsed >= 50 || F.lastWithdraw && F.shibaU.pos.z < -105 && (F.shiba1.count === 0 || F.shiba1.center().z < -88)) {
        F.commanderRetired = true;
        this.win(rt);
      }
    }
  },

  // 敵の兵種ごとの動き（テスターの声 10/26「同じ敵を斬り続けるだけ」）。字や印は足さず、動きと声だけ。
  //   長槍の足軽：槍衾で構え、十秒ごとに声を合わせて四秒だけ突き出る。
  //   刀の武者：間合いの少し外から踏み込んで一気に詰める。
  //   敵の大将：登場の音だけ鳴らし、案内は共通の頭上印へ集める。
  enemyBeat(rt, dt) {
    const F = rt.flags;
    const g = F.shiba1;
    if (F.step === 1 && g && !gone(g) && !F.flankSuccess && F.wallAt && rt.t > F.wallAt && (g.order === 'yari' || g.order === 'attack')) {
      F.wallOut = !F.wallOut;
      g.order = F.wallOut ? 'attack' : 'yari';
      F.wallAt = rt.t + (F.wallOut ? 4 : 10);
      if (F.wallOut) rt.army.play('eshout', g.center(), 1);
    }
    if (F.step >= 1 && F.step < 5 && !(F.leapScan > rt.t)) {
      F.leapScan = rt.t + 0.3;
      for (const q of [F.shibaG, F.hayaCenter]) {
        if (!q || gone(q)) continue;
        for (const u of q.units) {
          const t = u.target;
          if (u.type !== 'samurai' || u.name || u.leap || !fighting(u) || u.noTarget || !t || !fighting(t) || u.leapCd > rt.t || u.swing || u.atk || u.stagger > 0) continue;
          const dx = t.pos.x - u.pos.x, dz = t.pos.z - u.pos.z, d = Math.hypot(dx, dz);
          if (d < 2.8 || d > 6.5) continue;
          u.leap = { x: dx / d, z: dz / d, v: (d - 1.5) / 0.3, t: 0.3 };
          u.leapCd = rt.t + 5 + (u.id % 3);
          u.heading = Math.atan2(dx, dz);
          rt.army.play('eshout', u.pos, 0.6);
        }
      }
    }
    for (const q of [F.shibaG, F.hayaCenter]) {
      if (!q) continue;
      for (const u of q.units) {
        const L = u.leap;
        if (!L) continue;
        const k = Math.min(dt, L.t);
        if (fighting(u)) { u.pos.x += L.x * L.v * k; u.pos.z += L.z * L.v * k; }
        L.t -= dt;
        if (L.t <= 0) { u.leap = null; u.cd = Math.min(u.cd || 0, 0.1); }
      }
    }
    // 林美作守の名：姿が正面四十メートル内に見えた時か、現れて十五秒で、一度だけ。
    const h = F.hayaU;
    if (h && F.bossAt && !F.bossNamed && h.alive) {
      const p = rt.player.u.pos, dx = h.pos.x - p.x, dz = h.pos.z - p.z;
      const off = Math.abs(((Math.atan2(dx, dz) - rt.player.yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      if (Math.hypot(dx, dz) < 40 && off < 0.7 || rt.t - F.bossAt > 15) {
        F.bossNamed = true;
        // 人名の大きな札を重ねず、倒す本人の共通印へ集める。
        sfx('taiko', 1); rt.after(0.35, () => sfx('taiko', 0.9));
        rt.army.play('eshout', h.pos, 1.2);
      }
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v === F.miyaiU) { F.miyaiFell = true; F.inu.focus = null; }
    if (v === F.hayaU && F.step === 3) this.hayaFell(rt);
  },

  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1) return;
    if (g === F.shiba1 && F.step === 1) rt.say('足軽', '柴田の先手が崩れたぞ！', 2.5);
    else if (g === F.haya1 && F.step === 3) rt.say('足軽', '林の先手が崩れた！　旗本が裸じゃ！', 2.5);
  },
};

inou.taisho = { a: null, b: null };
inou.rts = true;
inou.sides = { a: { name: '信長方', mon: 'oda' }, b: { name: '信勝方', mon: 'kari' } };
inou.introSides = { a: '信長方 約七百', b: '信勝方 約千七百' };
// 信長公記の数：信長方 七百足らず、信勝方 柴田勝家 千・林美作守 七百
inou.force = (rt) => {
  const F = rt.flags;
  // 左・中央が崩れた時は味方の棒が押し戻される（押されているのが上の棒で見える）。
  return { a: Math.max(0, 700 - (F.ak || 0) * 4 - (F.leftBack ? 90 : 0) - (F.centerBack ? 90 : 0)), a0: 700, b: Math.max(0, 1700 - (F.ek || 0) * 6 - (F.centerOpen ? 350 : 0) - (F.mainBroken ? 350 : 0) - (F.commanderRetired ? 500 : 0)), b0: 1700 };
};
inou.canSkip = () => ''; // 説明を隠しても戦の段取りは飛ばさない
inou.skip = () => {};
inou.date = () => '弘治二年八月二十四日　秋・晴・昼';
inou.history = '弘治二年（1556）八月二十四日、尾張の稲生の野で、織田信長と弟の信勝（信行）の兵が戦った。父の信秀が亡くなった後、家老の林秀貞・林美作守の兄弟と柴田勝家は信勝を立てようとした。信長は佐久間大学（盛重）に名塚に砦を築かせ、於多井川（庄内川）を渡って東へ出た。『信長公記』は、柴田勢千ほど、林美作守の七百ほどに対し、信長方は七百に足らなかったと記す。はじめ柴田勢に押され、佐々孫介らが討たれ、信長のまわりは四十ほどになった。信長が大声で怒鳴ると、柴田の兵は主の声に恐れて逃げたという。信長は林勢へ向かい、黒田半平と斬り合う美作守を自ら討った。前田利家が宮井勘兵衛を討ったとも伝わる。信勝は母の土田御前のとりなしで許されたが、のちに再び背き、清洲で討たれた。信長はこの後、浮野の戦いで岩倉の織田家も破り、尾張をほぼ一つにまとめた。兵の細かな配置、林勢の寄せ口、旗印、名塚の砦の形、短い時間は遊びのための推定。地形は国土地理院の標高を丸めて使った。';

// 素直な遊び手：組頭と進み、右の畦から攻め、敵主力と指揮官の退きを見届ける
inou.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.55) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const lead = F.step === 1 && F.holdPoint ? F.holdPoint : F.step === 0 && F.genU?.alive ? F.genU.pos : F.nobuU && F.nobuU.alive && F.nobuU !== u ? F.nobuU.pos : NOBU;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, lead.x - 6, lead.z, 2); return; }
  if (F.step >= 5) { inp.guardHold = false; goTo(p, inp, lead.x + 5, lead.z + 4, 3); return; }
  if (F.step === 1 && F.training < 11 && Math.hypot(u.pos.x - lead.x, u.pos.z - lead.z) > 16) {
    inp.guardHold = false; goTo(p, inp, lead.x + 6, lead.z + 3, 3); return;
  }
  if (F.step === 1 && (F.training === 11 || F.training === 12)) {
    if (Math.hypot(u.pos.x - FLANK.x, u.pos.z - FLANK.z) > 5) { goTo(p, inp, FLANK.x, FLANK.z, 3); return; }
  }
  if (F.step === 0 && F.training === 1 && F.chase) { const c = F.practice.center(); goTo(p, inp, c.x, c.z + 2, 2); return; }
  if (F.step === 0 && F.training <= 0) { goTo(p, inp, p.u.pos.x, p.u.pos.z - 3, 1); return; }
  const e = b.army.nearestEnemy(u, F.step === 0 ? 35 : 10, (o) => !o.noTarget && !o.fleeing && !o.invuln && (F.step !== 0 || F.training > 4 || o.group === F.practice) && Math.hypot(o.pos.x - lead.x, o.pos.z - lead.z) < 40);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    if (F.step === 0 && F.training === 3 && F.lesson === 'block') { inp.guardHold = true; inp.leftPressed = false; }
    if (F.step === 0 && F.training === 4 && e.atk) inp.k.add('Space');
    return;
  }
  inp.guardHold = false;
  if (F.step === 3) { const t = F.haya.find((g) => !gone(g)); if (t) { const c = t.center(); if (Math.hypot(c.x - lead.x, c.z - lead.z) < 36) { goTo(p, inp, c.x, c.z, 2); return; } } }
  goTo(p, inp, lead.x + 6, lead.z + 3, 3);
};

export { inou };
