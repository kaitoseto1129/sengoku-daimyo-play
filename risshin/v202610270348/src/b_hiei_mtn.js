import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
import { timeslipField } from './timeslip_field.js';
// ======================================================================
// 比叡山（元亀二年・1571 九月十二日）… docs/hiei-1571-spec.md（kaito 10/1）の第一〜第二段階（61章）
// 坂本（日吉社・里）→ 本坂（狭い山道・つづら折り・杉林・石段）→ 文殊楼 → 東塔（根本中堂・廻廊・中門・大講堂・僧坊の群れ）
// → 西塔（浄土院・にない堂・釈迦堂の前身）→ 横川（横川中堂）。筋書きは 46〜53章の P1〜P7（kaito 10/1：横川も掃討する区域に）。
//   ・横川（第三段階・26〜32章）は西塔から長い山道の先。西塔と同じく山道を掃討する。移動範囲はこの戦だけ moveLim で広げる
//   ・山麓から始める。根本中堂の前には出さない（46章）
//   ・全員を倒す戦にしない（mid6 49〜52章）：燃える山道を進む・手向かう者を退ける・次の区域への道を押さえる
//   ・城にしない（36〜39章）：天守・櫓・石垣・枡形・堀を置かない。守りは地形（急坂・狭い道・石段）と門と建物。
//     一時の逆茂木だけ少し（GAME_C）
//   ・人は僧兵だけにしない（54章）：僧兵・武装した神人や里の者・具足を着けた山の衆・逃げる僧・里の者・避難する人
//   ・火は建物ごと＋風向きで、一棟→一群→地区へ（temple1571.js）。鐘が鳴ると守りが警戒する（57章）
// 地形：terrain_hiei.js（国土地理院の標高。宇佐山の志賀の陣と同じ広域の切り出し）。建物と道：castles/hiei1571.js。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lookParts } from './units.js';
import { sakamogi, paintGeo, jinmaku, stoneStepGeo, solidCircle } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { battleEvent, EVENT_FIRE_START } from './battle_events.js';
import { runnerBlocked } from './denrei.js';
import { enemyGroup, allyGroup, nm, unitPos } from './bhelp.js';
import { gone } from './b_inabayama.js';
import { Garan, makeTempleFire, ringBell } from './temple1571.js';
import { P, PATHS, BUILDINGS, VALLEYS, pathById, pathPoint, height, onFlat } from './castles/hiei1571.js';
import { hieiSpeech, hieiGaranLook, hieiGroundFoot, hieiTimberGrain, hieiRoomMaterial } from './b_hieizan.js';
import { nakaRoomAt } from './naka.js';
import { interiorWaypoint } from './interior_layouts.js';
import { addDeck, addRamp, groundAt } from './floors.js';
import { contactLitter } from './army_ground.js';
import { distToPolyline } from './world.js';

const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 4;
// 姿：僧兵（裹頭・袈裟・薙刀）／武装した神人・里の者／武装した山の衆／織田
const SOHEI = { sohei: 1, armor: 0x2a2622, lace: 0xcfc7b4, cloth: 0xd8d2c2, hat: 'hachimaki', flag: null };
const LAY = { flag: null, hat: 'hachimaki', armor: 0x4a4034, lace: 0xb19a65, cloth: 0x5a4a38, haori: null, mon: null };
const REM = { flag: null, armor: 0x4c4538, lace: 0x9e7757 };
// 本坂の寄せ手は明智の手。水色桔梗は伝わる旗印を用いた復元で、当日の実物は未確認。
// 福知山市の紹介資料：https://www.city.fukuchiyama.lg.jp/uploaded/attachment/13053.pdf
// 本の足軽写真：黒茶の漆胴・紺の小袖・生成りの威糸。形と材質は共通の物を使う。
const ODA = { flag: 'akechi', armor: 0x302723, cloth: 0x202f39, lace: 0xc7bea6, mon: 'akechi', haori: null };
// 足軽の低い陣笠を使い、将も陣羽織を重ねない。兵数・形の数は増やさない。
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...(s.o?.name ? { flag: lk.flag } : lk),
  ...(lk === ODA && s.type === 'ashigaru' ? { hat: 'jingasa_n' } : {}), ...(s.o || {}), haori: null } }));

// 坂本の通り・日吉社の参道から本坂と文殊楼まで約一メートルの格子へ。
// 開戦直後の石段や里坊脇も、幅三メートルの道を粗い面で潰さない。
// 外周一升で元の地面につなぎ、描く面と足・石段・案内の高さを同じ補間で読む。
function hieiRoadGround(W) {
  const source = W.terrain.geometry, step = W.step, divisions = 3;
  const cols = Math.round(W.half * 2 / step), stride = cols + 1;
  const i0 = Math.floor((W.half - 36) / step), i1 = Math.ceil((W.half + 176) / step);
  const j0 = Math.floor((W.half - 34) / step), j1 = Math.ceil((W.half + 24) / step);
  const x0 = -W.half + i0 * step, z0 = -W.half + j0 * step;
  const nx = (i1 - i0) * divisions, nz = (j1 - j0) * divisions, cell = step / divisions;
  const width = nx * cell, depth = nz * cell, coarseHeight = W.heightAt.bind(W);
  const geo = new THREE.PlaneGeometry(width, depth, nx, nz);
  geo.rotateX(-Math.PI / 2); geo.translate(x0 + width / 2, 0, z0 + depth / 2);
  const pos = geo.attributes.position, heights = new Float32Array(pos.count);
  const attrs = Object.entries(source.attributes).filter(([name]) => name !== 'position' && name !== 'normal');
  for (const [name, attr] of attrs) geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(pos.count * attr.itemSize), attr.itemSize));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const k = j * (nx + 1) + i, x = x0 + i * cell, z = z0 + j * cell;
    const rim = Math.max(0, Math.min(1, i / divisions, (nx - i) / divisions, j / divisions, (nz - j) / divisions));
    let fine = height(x, z);
    // 坂本まで細分する時も、大宮川の川底を元の地形で埋め戻さない。
    // この戦の小川には浅瀬の指定がなく、世界と同じ断面で掘る。
    for (const st of W.def.streams || []) {
      const d = distToPolyline(x, z, st.pts);
      if (d < st.w * 2) fine -= st.depth * Math.pow(1 - d / (st.w * 2), 1.5);
    }
    const base = coarseHeight(x, z), y = base + (fine - base) * rim * rim * (3 - 2 * rim);
    heights[k] = y; pos.setXYZ(k, x, y, z);
    const ci = Math.min(cols - 1, i0 + Math.floor(i / divisions)), cj = Math.min(cols - 1, j0 + Math.floor(j / divisions));
    const tx = i0 + i / divisions - ci, tz = j0 + j / divisions - cj, a = cj * stride + ci;
    for (const [name, attr] of attrs) {
      const target = geo.attributes[name].array, n = attr.itemSize, values = attr.array;
      for (let c = 0; c < n; c++) {
        const A = values[a * n + c], B = values[(a + 1) * n + c], C = values[(a + stride) * n + c], D = values[(a + stride + 1) * n + c];
        target[k * n + c] = tx + tz <= 1 ? A + (B - A) * tx + (C - A) * tz : D + (C - D) * (1 - tx) + (B - D) * (1 - tz);
      }
    }
  }
  const indices = [], old = source.index.array;
  for (let k = 0; k < old.length; k += 3) {
    const a = old[k], b = old[k + 1], c = old[k + 2];
    const i = ((a % stride) + (b % stride) + (c % stride)) / 3;
    const j = (Math.floor(a / stride) + Math.floor(b / stride) + Math.floor(c / stride)) / 3;
    if (i <= i0 || i >= i1 || j <= j0 || j >= j1) indices.push(a, b, c);
  }
  source.setIndex(indices);
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  // 細かい坂も本体の地面へつなぐ。別の面のままだと、描く直前の足場検査に
  // 坂だけが載らず、視点が切岸へ入る。追加の材質や描画は作らない。
  W.terrain.geometry = mergeGeometries([source, geo]);
  W.terrain.geometry.computeBoundingSphere();
  source.dispose(); geo.dispose();
  W.heightAt = function (x, z) {
    if (x <= x0 || x >= x0 + width || z <= z0 || z >= z0 + depth) return coarseHeight(x, z);
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.min(nx - 1, Math.floor(fx)), j = Math.min(nz - 1, Math.floor(fz));
    const tx = fx - i, tz = fz - j, a = j * (nx + 1) + i;
    const A = heights[a], B = heights[a + 1], C = heights[a + nx + 1], D = heights[a + nx + 2];
    return tx + tz <= 1 ? A + (B - A) * tx + (C - A) * tz : D + (C - D) * (1 - tx) + (B - D) * (1 - tz);
  };
}

// 粗い遠景の端を戦場の境へ寄せる。坂本の切り土を遠景の面で覆わない。
// 設営時だけ頂点を動かし、足場・兵・面数・材質は変えない。
function hieiFarBoundary(W) {
  const geo = W.farLand?.geometry;
  if (!geo) return;
  const pos = geo.attributes.position, half = W.half;
  let edgeX = 0, edgeZ = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = Math.abs(pos.getX(i)), z = Math.abs(pos.getZ(i));
    if (x <= half) edgeX = Math.max(edgeX, x);
    if (z <= half) edgeZ = Math.max(edgeZ, z);
  }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const nx = Math.abs(Math.abs(x) - edgeX) < .001 ? Math.sign(x) * half : x;
    const nz = Math.abs(Math.abs(z) - edgeZ) < .001 ? Math.sign(z) * half : z;
    if (nx !== x || nz !== z) pos.setXYZ(i, nx, W.farH(nx, nz), nz);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals(); geo.computeBoundingSphere();
}

// 本の野戦兵器の丸木・横桟・縄と、清洲の板囲いを手本にした推定の景色。
// 城の櫓は置かず、坂本の道外に小さな荷場。本坂には暮らしの跡だけを置く。
// すべて設営時に既存の伽藍へ焼き込み、更新・透過材質・光源を増やさない。
function hieiCampaignScenery(G, W) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const pole = new THREE.CylinderGeometry(1, 1, 1, 6);
  const ring = new THREE.TorusGeometry(1, .045, 3, 8);
  const turn = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const record = (id, x, z, w, d, dist) => G.build({
    id, kind: 'landscape', x, z, w, d, dist, lite: true, noBurn: true, hist: 'GAME_C',
  });
  const part = (r, shape, x, y, z, sx, sy, sz, color, rot = 0) => {
    const g = shape.clone(); g.scale(sx, sy, sz); g.rotateY(rot); g.translate(x, y, z);
    G.add(r, 'plain', paintGeo(g, color));
  };
  const beam = (r, ax, ay, az, bx, by, bz, radius, color) => {
    direction.set(bx - ax, by - ay, bz - az);
    const length = direction.length();
    turn.setFromUnitVectors(up, direction.divideScalar(length));
    const g = pole.clone(); g.scale(radius, length, radius); g.applyQuaternion(turn);
    g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    G.add(r, 'plain', paintGeo(g, color));
  };
  const ground = (r, x, z) => W.heightAt(r.x + x, r.z + z) - r.y0;
  const tie = (r, x, y, z, radius) => {
    for (const dy of [-.045, .045]) {
      const g = ring.clone(); g.scale(radius, radius, radius); g.rotateX(Math.PI / 2);
      g.translate(x, y + dy, z); G.add(r, 'plain', paintGeo(g, 0x968467));
    }
  };
  const camp = record('hiei_roadside_loads', 188, -15, 9, 8, 'sakamoto');
  // 下端を地面に納めた生成りの陣幕。入口は南、先手の通る街道から離す。
  for (const x of [-4, 0, 4]) {
    const y = ground(camp, x, -3);
    beam(camp, x, y - .15, -3, x, y + 2.6, -3, .075, 0x65533c);
    tie(camp, x, y + 2.25, -3, .11);
  }
  for (let i = 0; i < 8; i++) {
    const x = -3.5 + i, y = ground(camp, x, -3);
    part(camp, box, x, y + 1.22, -3, .99, 2.1, .035, i % 3 ? 0xc1b799 : 0xb4aa8e);
    part(camp, box, x, y + .27, -2.97, .98, .18, .04, 0x82755c);
  }
  for (const x of [-4, 4]) {
    const y = ground(camp, x, 0);
    beam(camp, x, y - .15, 0, x, y + 2.4, 0, .075, 0x65533c);
    part(camp, box, x, y + 1.2, -1.5, .035, 2.05, 3, 0xbab092);
    // 小さな幟の反りは形に固定。文字を入れず水色の桔梗だけ。
    beam(camp, x, y, 0, x, y + 4.3, 0, .035, 0x6c6045);
    beam(camp, x, y + 4.15, 0, x + .76, y + 4.15, 0, .025, 0x6c6045);
    const cloth = new THREE.BoxGeometry(.7, 1.9, .025, 1, 5, 1);
    const pos = cloth.attributes.position;
    for (let j = 0; j < pos.count; j++) pos.setZ(j, pos.getZ(j) + .09 * Math.sin((pos.getY(j) + .95) * 3));
    cloth.computeVertexNormals(); cloth.translate(x + .38, y + 3.18, 0);
    G.add(camp, 'plain', paintGeo(cloth, 0xb9c4bb));
    for (const side of [-1, 1]) for (let j = 0; j < 5; j++) {
      const a = j * Math.PI * 2 / 5;
      const petal = pole.clone(); petal.scale(.085, .012, .13); petal.rotateX(Math.PI / 2); petal.rotateZ(-a);
      petal.translate(x + .38 + Math.sin(a) * .1, y + 3.42 + Math.cos(a) * .1, side * .12);
      G.add(camp, 'plain', paintGeo(petal, 0x487f91));
    }
  }
  // 丸木の片流れ小屋。葦の屋根を細い押縁で留め、奥に俵と薪を納める。
  const roofBase = Math.max(...[-1.5, 1.5].flatMap(x => [-2.3, -.5].map(z => ground(camp, x, z))));
  for (const x of [-1.5, 1.5]) for (const z of [-2.3, -.5]) {
    const y = ground(camp, x, z), h = roofBase + (z < -1 ? 2.1 : 1.6);
    beam(camp, x, y - .12, z, x, h, z, .07, 0x69533b);
    tie(camp, x, h - .15, z, .1);
  }
  for (let i = 0; i < 14; i++) {
    const x = -1.65 + i * .25;
    beam(camp, x, roofBase + 2.2, -2.6, x, roofBase + 1.5, -.2, .13, i % 3 ? 0x867550 : 0xa18e60);
  }
  for (const z of [-2.2, -.5]) {
    const y = roofBase + (z < -1 ? 2.15 : 1.65);
    beam(camp, -1.8, y, z, 1.8, y, z, .045, 0x4e4530);
  }
  for (let i = 0; i < 5; i++) {
    const x = -.9 + (i % 3) * .68, z = -1.5, y = ground(camp, x, z) + .28 + Math.floor(i / 3) * .48;
    part(camp, pole, x, y, z, .27, .65, .27, 0x9c8855, Math.PI / 2);
    tie(camp, x, y, z, .28);
  }
  // 荷車は本の行天橋の台車を手本にした低い板荷台。橋や攻城塔にはしない。
  const cy = ground(camp, 0, 2);
  for (let i = 0; i < 6; i++) part(camp, box, -.65 + i * .26, cy + .63, 2, .245, .1, 1.9, i % 2 ? 0x766044 : 0x685238);
  beam(camp, -1.2, cy + .44, 2, 1.2, cy + .44, 2, .1, 0x51422e);
  for (const x of [-.98, .98]) {
    const wheel = pole.clone(); wheel.scale(.46, .16, .46); wheel.rotateZ(Math.PI / 2);
    wheel.translate(x, cy + .46, 2); G.add(camp, 'plain', paintGeo(wheel, 0x7f6d4e));
    for (const offset of [-.18, .18]) part(camp, box, x, cy + .46 + offset, 2, .19, .05, .76, 0x514632);
    beam(camp, x * .72, cy + .57, 1.1, x * .72, cy + .72, 4.1, .055, 0x65533b);
  }
  // 荷台の竹束。節と二か所の縄だけを近景で見せる。
  for (let i = 0; i < 9; i++) {
    const x = -.36 + i % 3 * .27, y = cy + .84 + Math.floor(i / 3) * .22;
    beam(camp, x, y, 1.3, x, y, 2.8, .1, i % 2 ? 0x757d4a : 0x939061);
    for (const z of [1.65, 2.4]) {
      const g = ring.clone(); g.scale(.105, .105, .105); g.translate(x, y, z);
      G.add(camp, 'plain', paintGeo(g, 0xb0a27a));
    }
  }
  // 僧坊跡の脇に朽ちた板柵と薪。幅のある本道・礎石の中央を空ける。
  const yard = record('hiei_abandoned_yard', 68, -17, 5, 2, 'path');
  for (const x of [-2, 0, 2]) {
    const y = ground(yard, x, 0);
    beam(yard, x, y - .12, 0, x + .08, y + 1.25, 0, .065, 0x635541);
  }
  for (const h of [.45, 1]) beam(yard, -2, ground(yard, -2, 0) + h, 0, 2, ground(yard, 2, 0) + h, 0, .045, 0x77654d);
  for (let i = 0; i < 9; i++) {
    const x = -1.7 + i * .42, y = ground(yard, x, 0);
    part(yard, box, x, y + .62, .08, .3, i === 4 ? .65 : 1.16, .06, i % 3 ? 0x776951 : 0x635943, .04 * (i % 3 - 1));
  }
  for (let i = 0; i < 8; i++) {
    const x = -.6 + (i % 4) * .27, z = 1.1, y = ground(yard, x, z) + .14 + Math.floor(i / 4) * .2;
    beam(yard, x, y, z - .4, x + .08, y, z + .4, .11, i % 2 ? 0x70533b : 0x57422f);
  }
  // 麓の田だけに刈り株を焼き込む。山上に田や城下町を広げない。
  const stubble = record('hiei_harvest_stubble', 184, 0, 12, 84, 'far');
  for (const z of [-38, -28, 28, 38]) for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
    const x = -5 + i * 1.4, zz = z - 2.4 + j * 1.5, y = ground(stubble, x, zz);
    part(stubble, box, x, y + .15, zz, .09, .3, .08, i % 3 ? 0xa69552 : 0x817541, .3 * j);
  }
  box.dispose(); pole.dispose(); ring.dispose();
}

// 根本中堂の建具だけを別のまとめへ。木目を実寸で繰り返す。
class HieiHallGaran extends Garan {
  stairs(path, point, o = {}) {
    const rec = { id: 'stairs_' + path.id, kind: 'stairs', hist: 'GAME_C', dist: 'hieiSteps', ranges: [], state: 0, noBurn: true, x: 0, z: 0, w: 1, d: 1 };
    const w = (path.w || 1.6) * 1.8;
    const gradeAt = (s) => {
      if (s < (o.from || 0) || s > Math.min(path.L, o.to ?? path.L)) return 0;
      const q = point(path, Math.max(0, Math.min(path.L, s)));
      const sn = Math.sin(q.dir), cs = Math.cos(q.dir);
      return Math.abs(this.W.heightAt(q.x + sn * .35, q.z + cs * .35)
        - this.W.heightAt(q.x - sn * .35, q.z - cs * .35)) / .7;
    };
    let stride = .4;
    for (let s = o.from || 0; s <= Math.min(path.L, o.to ?? path.L); s += stride) {
      const q = point(path, s);
      // 枝道は本道の切り土と交わるため、断面表と実際の地面が違う。
      // 描く地面で勾配を測り、急な法面を石の梯子で覆わない。
      const sn = Math.sin(q.dir), cs = Math.cos(q.dir);
      const grade = Math.abs(this.W.heightAt(q.x + sn * .35, q.z + cs * .35)
        - this.W.heightAt(q.x - sn * .35, q.z - cs * .35)) / .7;
      stride = Math.max(.16, Math.min(.7, .2 / Math.max(.01, grade)));
      // 踏石の奥行きと同じ間隔で並べる。高さの差で一段飛ばすと、
      // 勾配が変わる所に穴や一本だけの石の列が残る。
      if (grade < (o.minG ?? .3) || grade > .9) continue;
      // 平場の小さな起伏に一、二列だけ石段を作ると、通路を塞ぐ横棒に見える。
      // 三段以上続く坂だけへ置く。道筋と通行の判定は保つ。
      const minGrade = o.minG ?? .3, valid = g => g >= minGrade && g <= .9;
      const before = valid(gradeAt(s - stride)), after = valid(gradeAt(s + stride));
      if (!(before && after || before && valid(gradeAt(s - stride * 2)) || after && valid(gradeAt(s + stride * 2)))) continue;
      const k = Math.round(s * 3), j = ((k * 37) % 7 - 3) / 3;
      // 一段を小ぶりの踏石へ分ける。目地は段ごとにずらし、長い一枚板に見せない。
      // 形は既存の欠け石を使い、設営時に同じ材質の一つの描画へまとめる。
      const stones = [], treads = [], count = Math.max(2, Math.ceil(w / .75));
      let vertices = 0;
      const stepW = w * (.96 + j * .03), unitW = stepW / count;
      for (let n = 0; n < count; n++) {
        // 中の目地だけをずらす。両端は道幅を保ち、縦に通った格子を崩す。
        const edge = n => -stepW / 2 + n * unitW + (n > 0 && n < count ? unitW * .24 * Math.sin(k * 2.3 + n * 1.7) : 0);
        const x0 = edge(n), x1 = edge(n + 1), stoneW = x1 - x0, x = (x0 + x1) / 2;
        const left = this.W.heightAt(q.x + x0 * cs, q.z - x0 * sn);
        const right = this.W.heightAt(q.x + x1 * cs, q.z - x1 * sn);
        // 道の端から法面へはみ出す石を縦に引き伸ばさず、土の斜面を残す。
        if (Math.abs(right - left) > stoneW * .65) continue;
        // 欠けとずれを含めても隣の段へ届く奥行きにする。
        // 間隔と同じ奥行きでは石の縁の欠けが全段に横溝を作り、梯子に見える。
        const part = stoneStepGeo(stoneW - .018, .2, stride * 1.5, k * 7 + n);
        // 色は実際の石ごとに決める。頂点の横位置で区切ると、一つの石の中に
        // 隣の石の色が入り、目地をずらしても長い板の縞に見えてしまう。
        const tone = .78 + .32 * (.5 + .5 * Math.sin(k * 3.7 + n * 5.3));
        const colors = part.attributes.color;
        for (let v = 0; v < colors.count; v++) colors.setXYZ(v, .23 * tone, .22 * tone, .19 * tone);
        part.translate(x, 0, .008 * Math.sin(k * 2 + n));
        stones.push(part);
        // 石ごとに一枚の天端を保つ。頂点ごとに高さを拾うと、法面の境で
        // 三角形が折れ、踏石が尖った破片になる。横の傾きは水切り程度に抑える。
        const front = this.W.heightAt(q.x + x * cs - stride * .75 * sn, q.z - x * sn - stride * .75 * cs);
        const back = this.W.heightAt(q.x + x * cs + stride * .75 * sn, q.z - x * sn + stride * .75 * cs);
        vertices += part.attributes.position.count;
        treads.push({ end: vertices, x, w: stoneW - .018, y: Math.min(Math.max(front, back) + .015, Math.min(front, back) + .16),
          slope: Math.max(-.06, Math.min(.06, (right - left) / stoneW)) });
      }
      if (!stones.length) continue;
      const g = mergeGeometries(stones);
      for (const part of stones) part.dispose();
      const p = g.attributes.position, c = g.attributes.color, normals = g.attributes.normal, uv = g.attributes.uv;
      // 同じ座標には同じ欠けを付け、石の継ぎ目を裂かない。天端は歩く高さを保つ。
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const grain = .5 + .5 * Math.sin(x * 17 + z * 11 + k);
        p.setXYZ(i, x + .006 * Math.sin(x * 9 + k), y + .006 * Math.sin(x * 21 + z * 13 + k), z + .006 * Math.cos(x * 13 + k));
        const edge = Math.abs(x) > w * .32;
        // 端の石を全面緑にせず、段ごとに途切れる薄い苔にする。
        const moss = edge ? Math.max(0, grain - .65) * .8 : 0;
        // 頂点色は線形の値。灰色をそのまま入れると、画面では白い板になる。
        const shade = (normals.getY(i) > .5 ? 1 : .66) * (.9 + grain * .16);
        c.setXYZ(i, (c.getX(i) - moss * .15) * shade,
          (c.getY(i) - moss * .025) * shade,
          (c.getZ(i) - moss * .18) * shade);
      }
      // 各石の上り側の高さを天端に使い、前後を地面へ沿わせて斜めの板にしない。
      // 横断方向の傾きは残す。石の底は地中へ埋め、天端を足場にも渡す。
      const angle = q.dir, turnC = Math.cos(angle), turnS = Math.sin(angle);
      // 土の高さだけで歩くと、靴が踏石へ十六センチ沈む。
      // 石ごとの天端を近くの升へ登録する。毎コマ全段を探す坂は増やさない。
      for (const tread of treads) {
        const cx = q.x + tread.x * turnC - .025 * turnS;
        const cz = q.z - tread.x * turnS - .025 * turnC;
        addDeck({ cx, cz, x0: -tread.w / 2, x1: tread.w / 2,
          z0: -stride * .75, z1: stride * .75, rot: angle,
          y: tread.y, pad: 0, name: '比叡の踏石' });
      }
      let stone = 0;
      for (let i = 0; i < p.count; i++) {
        while (i >= treads[stone].end) stone++;
        // 厚さ二十センチの石は原点を挟んで上下十センチ。
        // 上面にも一センチほどの揺らぎがあり、十センチで分けると上面まで地中へ落ちる。
        const top = p.getY(i) > 0, x = p.getX(i), z = p.getZ(i) - .025;
        const wx = q.x + x * turnC + z * turnS, wz = q.z - x * turnS + z * turnC;
        const y = this.W.heightAt(wx, wz);
        // 造成した道と横の法面が交わる所でも、一段を高い石の壁にしない。
        // 前後を同じ天端にし、坂に沿って曲がった薄板にしない。
        // 高い側は土へ埋め、低い側の出も十六センチまでに抑える。
        const tread = treads[stone].y + (x - treads[stone].x) * treads[stone].slope;
        p.setXYZ(i, wx, top ? tread : Math.min(y, tread) - .18, wz);
        uv.setXY(i, wx, wz);
      }
      g.computeVertexNormals();
      // 石の細粒は既存の敷石材質で共用する。世界座標の格子模様を重ねない。
      this._push(rec, 'paving', g);
    }
    this.recs.push(rec);
  }
  roadDetail(path) {
    const rec = { id: 'road_' + path.id, kind: 'landscape', hist: 'GAME_C', dist: 'path', ranges: [], state: 0, noBurn: true, x: 0, z: 0 };
    const surface = (q, offset, w, d, color, soft = false) => {
      const g = soft ? new THREE.CircleGeometry(.5, 12) : new THREE.PlaneGeometry(w, d, 1, 8);
      if (soft) g.scale(w, d, 1);
      else {
        // 土の擦れは両端を細くし、直線の縁と四角い切れ目を崩す。設営時だけ加工する。
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i), t = (y / d + .5) * Math.PI;
          p.setX(i, p.getX(i) * (.08 + .92 * Math.sin(t)) + w * .12 * Math.sin(y * 13 + q.x));
        }
      }
      g.rotateX(-Math.PI / 2); g.translate(offset, 0, 0); g.rotateY(q.dir); g.translate(q.x, 0, q.z);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        // 曲がり角や別の道と重なる苔は置かない。中心と円周を設営時だけ測る。
        if (soft && this.W.onRoad(x, z)) { g.dispose(); return; }
        p.setY(i, this.W.heightAt(x, z) + .012);
      }
      g.computeVertexNormals(); this._push(rec, soft ? 'hieiMoss' : 'plain', paintGeo(g, color));
    };
    // 轍は里の道だけ。山道の両縁には落ち葉・苔と小石をまとめて置く。
    for (let s = 1; s < path.L - 1; s += 2.8) {
      const q = pathPoint(path, s), k = Math.round(s), v = .5 + .5 * Math.sin(k * 2.7);
      if (path.id === 'sakamoto') for (const side of [-1, 1]) surface(q, side * (.85 + .025 * Math.sin(s)), .06 + v * .04, 2.5 + v * .3, 0x95836a);
      for (const side of [-1, 1]) {
        surface(q, side * (path.w + .7), .35 + v * .3, 1.1 + v, k % 3 ? 0x625134 : 0x4d6031, true);
        for (let i = 0; i < 3; i++) {
          const offset = side * (path.w * (.5 + i * .18)), along = (i - 1) * .5;
          const x = q.x + Math.cos(q.dir) * offset + Math.sin(q.dir) * along;
          const z = q.z - Math.sin(q.dir) * offset + Math.cos(q.dir) * along;
          const g = new THREE.OctahedronGeometry(.035 + v * .025);
          g.scale(1.3, .45, 1); g.translate(x, this.W.heightAt(x, z) + .025, z);
          this._push(rec, 'plain', paintGeo(g, k % 2 ? 0x8c8573 : 0x756e5d));
        }
      }
    }
    this.recs.push(rec);
  }
  add(rec, kind, geometry) {
    if (Array.isArray(geometry)) {
      for (const g of geometry) this.add(rec, kind, g);
      return;
    }
    // 中門の下は土の参道を残す。法面まで一枚の石で覆うと、
    // 地形に沿わせても灰色の大きな帯になる。柱・屋根・通行は保つ。
    if (rec.kind === 'chumon' && kind === 'wood') {
      geometry.computeBoundingBox();
      const b = geometry.boundingBox;
      if (b.min.y < 0 && b.max.y <= .21) { geometry.dispose(); return; }
    }
    if (kind === 'wood' || kind === 'stone' || kind === 'plain') hieiGroundFoot(this.W, rec, geometry);
    if (rec.id !== 'konponchudo_1571' || kind !== 'wood') return super.add(rec, kind, geometry);
    const c = geometry.attributes.color, p = geometry.attributes.position;
    const wall = new THREE.Color(0x6e5840), band = new THREE.Color(0xd2c9b2);
    const is = color => c && Math.abs(c.getX(0) - color.r) < .001 && Math.abs(c.getY(0) - color.g) < .001 && Math.abs(c.getZ(0) - color.b) < .001;
    if (is(wall) || is(band)) {
      if (is(band)) {
        const dark = new THREE.Color(0x30251c);
        for (let i = 0; i < c.count; i++) c.setXYZ(i, dark.r, dark.g, dark.b);
      }
      const uv = geometry.attributes.uv, n = geometry.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        uv.setXY(i, (Math.abs(n.getX(i)) > .5 ? z : x) / 2, (Math.abs(n.getY(i)) > .5 ? z : y) / 2);
      }
      // 未指定の材質名は既存の木材を使う。
      return super.add(rec, 'hieiJoinery', geometry);
    }
    return super.add(rec, kind, geometry);
  }
  bake(rec, group) {
    if (rec.id === 'monjuro_1571') {
      // 楼門は柱と礎石を一つの形へまとめてから届くため、add の
      // 一本ずつの接地処理を通らない。六本の根元だけ現地の高さへ。
      const c = Math.cos(rec.rot || 0), s = Math.sin(rec.rot || 0);
      const posts = [], stone = new THREE.Color(0x8a857a);
      for (const x of [-rec.w / 2 - .3, rec.w / 2 + .3]) for (const z of [-1.6, 0, 1.6]) {
        posts.push({ x, z, y: this.W.heightAt(rec.x + x * c + z * s, rec.z - x * s + z * c) - rec.y0 });
      }
      group.traverse(mesh => {
        if (!mesh.isMesh) return;
        const g = mesh.geometry, p = g.attributes.position, colors = g.attributes.color;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i);
          if (y > .281) continue;
          for (const post of posts) {
            const radius = Math.hypot(p.getX(i) - post.x, p.getZ(i) - post.z);
            if (radius > .41) continue;
            // 礎石を土へ少し埋め、柱の底を礎石の中へつなぐ。
            const base = colors && Math.abs(colors.getX(i) - stone.r) < .001
              && Math.abs(colors.getY(i) - stone.g) < .001 && Math.abs(colors.getZ(i) - stone.b) < .001;
            if (base) p.setY(i, y + post.y - .08);
            else if (y < .001) p.setY(i, Math.min(y, post.y + .18));
            break;
          }
        }
        g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
      });
    }
    super.bake(rec, group);
  }
  build(b) {
    // 現在の比叡山にも、堂の内陣・僧坊の座敷と動く建具を適用する。
    const r = super.build({ ...b, profile: 'hieizan' });
    if (r.kind === 'chumon' && r.cameraParts?.[0]) {
      // 中門の軒は柱より左右に二・二、前後に一・六メートル張り出す。
      // 小さい共通の箱の外へ出た軒裏に、視点が入り込むのを防ぐ。
      const roof = r.cameraParts[0], low = 3.4;
      roof.scale.set(b.w + 4.4, r.top - low, b.d + 3.2);
      roof.position.set(0, (low + r.top) / 2, 0).applyMatrix4(r.M);
      roof.updateMatrix();
    }
    if (b.id === 'monjuro_1571' && r.cameraParts?.[0]) {
      // 楼門の実形は、下の貫が高さ2.67、軒は幅＋4.4・奥行7.2まで張り出す。
      // 共通の小さい箱では貫と軒先へ視点が入り、屋根の裏が画面を覆う。
      const roof = r.cameraParts[0], low = 2.67;
      roof.scale.set(b.w + 4.4, r.top - low, 7.2);
      roof.position.set(0, (low + r.top) / 2, 0).applyMatrix4(r.M);
      roof.updateMatrix();
    }
    if (!r.naka || !['chudo', 'hondo'].includes(r.naka.kind)) return r;
    // 大講堂などの入れる堂にも、格天井と天蓋を受ける架構を設ける。
    // 焼失前の柱割は推定。内陣の須弥壇と左右の脇口、正面の参拝路を空ける。
    const lv = r.naka.levels[0], base = lv.y - r.y0, ceiling = base + lv.h - .11;
    // 梁・長押・吊り受けの木目は、材の長手へ同じ縮尺で通す。
    // 設営時に貼り方だけ変え、既存の木材とまとめ描きを使い回す。
    const timber = (w, h, d, x, y, z) => {
      const g = this.proxyGeo.clone();
      g.scale(w, h, d);
      const axis = h >= w && h >= d ? 1 : w >= d ? 0 : 2;
      hieiTimberGrain(g, axis, (x * .37 + y * .19 + z * .53) % 1);
      g.translate(x, y, z);
      super.add(r, 'wood', paintGeo(g, 0x4a3020)); g.dispose();
    };
    // 低い小堂は鴨居と天井の間に斗栱の高さを取れないため、柱列を増やさない。
    // 天蓋の吊り受けだけを壁際へ渡し、開いた格子戸の上を狭めない。
    if (lv.h <= 3) {
      lv.layout.altarSuspensionDrop = .16;
      // 吊り受けの横梁の端を白壁へ突き付けず、側柱を結ぶ桁の上へ掛ける。
      // 桁の上面は横梁の下面と揃え、両端は隅柱へ三センチ掛ける。
      // 低い堂の窓上枠・長押より上に納め、格天井と吊り棒は動かさない。
      // 焼失前の仕口は推定。既存の箱・木材の束へ設営時だけ加える。
      if (lv.layout.props.some(p => p.part === 'altar')) {
        for (const side of [-1, 1]) {
          timber(.16, .1, b.d - .16, side * (b.w / 2 - .08),
            base + lv.h - .21, 0);
        }
      }
      for (const altar of lv.layout.props) {
        if (altar.part !== 'altar') continue;
        for (const z of [-.32, .16]) {
          timber(b.w - .16, .1, .1, altar.x,
            base + lv.h - .11, altar.z + z * altar.d);
        }
      }
      return r;
    }
    // 繋梁の端を定間隔の柱の間へ落とさず、側壁にも同じ柱筋を通す。
    // 内陣境の梁も含め、窓を避けた内外共通の柱割にする。焼失前の柱割は推定。
    // 室内側は既存の柱をこの割付へ置き換え、柱を二重に増やさない。
    const bearings = lv.layout.rooms.map(room => (room.z0 + room.z1) / 2);
    const innerRoom = lv.layout.rooms.find(room => room.name === '内陣');
    if (innerRoom) bearings.push(innerRoom.z1 - .18);
    lv.wallPosts = [];
    for (const side of [-1, 1]) {
      const windows = (lv.windows || []).filter(v => v.face === 'x' && v.s === side);
      const positions = new Set([-b.d / 2, b.d / 2]);
      const clear = z => !windows.some(v => Math.abs(z - v.t) < v.w / 2 + .24);
      for (const z of bearings) if (clear(z)) positions.add(z);
      const count = Math.max(2, Math.round(b.d / 1.9));
      for (let i = 1; i < count; i++) {
        const z = -b.d / 2 + i * b.d / count;
        if (clear(z) && ![...positions].some(t => Math.abs(t - z) < .32)) positions.add(z);
      }
      for (const v of windows) for (const edge of [-1, 1]) positions.add(v.t + edge * (v.w / 2 + .08));
      lv.wallPosts.push({ face: 'x', side, positions: [...positions] });
      for (const z of positions) {
        // 隅柱は伽藍側にある。窓脇と梁受けの柱だけを既存の木部へまとめる。
        if (Math.abs(z) >= b.d / 2 - .2) continue;
        timber(.16, lv.h, .16, side * b.w / 2, base + lv.h / 2, z);
      }
    }
    const nageshi = base + 2.72;
    // 柱を梁まで貫通させず、柱頭の斗・肘木を順に積んで梁下面を受ける。
    // 低い堂でも長押の上端を柱で受けられる高さを残す。細かな仕口は推定。
    const postTop = Math.max(ceiling - .6, nageshi + .08);
    const bracketH = (ceiling - .3 - postTop) / 3;
    this.hallPostShape ||= new THREE.CylinderGeometry(.18, .18, 1, 8);
    // 堂内の丸柱も内陣境の角柱と同じく、足元を薄い根巻で保護する。
    // 焼失前の金具の細部は推定。八角の柱面へ沿わせ、床上二十四センチに納める。
    // 底を開けた筒を共用し、柱の上へ円盤を重ねず、焼失する木部の束へ含める。
    this.hallRootShape ||= new THREE.CylinderGeometry(.184, .184, .24, 8, 1, true);
    const rootWrap = (x, z, radius) => {
      const g = this.hallRootShape.clone();
      g.scale(radius / .18, 1, radius / .18); g.translate(x, base + .12, z);
      super.add(r, 'wood', paintGeo(g, 0x34312b)); g.dispose();
    };
    // 長押を留める釘頭は八角の釘隠しで覆う。焼失前の意匠は推定。
    // 柱際だけに納め、同じ形と木材のまとめ描きを使う。
    this.hallNailShape ||= new THREE.CylinderGeometry(.036, .036, .008, 8).rotateX(Math.PI / 2);
    const nail = (x, z, rot = 0) => {
      const g = this.hallNailShape.clone();
      g.rotateY(rot); g.translate(x, nageshi, z);
      super.add(r, 'wood', paintGeo(g, 0x34312b)); g.dispose();
    };
    const beamZ = [];
    for (const room of lv.layout.rooms) {
      const z = (room.z0 + room.z1) / 2;
      beamZ.push(z);
      const postX = b.w * (room.name === '内陣' ? .2 : .32);
      for (const x of [-postX, postX]) {
        const g = this.hallPostShape.clone();
        g.scale(1, postTop - base, 1);
        // 丸柱は周長と高さを別々に割り、縦木目を引き伸ばさない。
        hieiTimberGrain(g, 1, (x * .37 + z * .53) % 1, true, .36);
        g.translate(x, (base + postTop) / 2, z);
        super.add(r, 'wood', paintGeo(g, 0x634832)); g.dispose();
        rootWrap(x, z, .18);
        // 柱と柱頭の組物を同じ当たりで扱い、焼失時も堂と一緒に片付ける。
        const [wx, wz] = r.naka.P(x, z);
        const solid = solidCircle(wx, wz, .18);
        solid.yBot = lv.y; solid.yTop = r.y0 + ceiling;
        r.innerSolids.push(solid);
        // 斗と肘木で横梁を受け、細い格縁へ梁を吊った形にしない。
        timber(.36, bracketH, .36, x, postTop + bracketH * .5, z);
        timber(.64, bracketH, .22, x, postTop + bracketH * 1.5, z);
        timber(.22, bracketH, .64, x, postTop + bracketH * 2.5, z);
      }
      // 繋梁は側柱まで渡し、長押は柱を前後から抱く二枚にする。
      timber(b.w - .16, .3, .24, 0, ceiling - .15, z);
      for (const side of [-1, 1]) {
        timber(postX * 2 + .36, .12, .07, 0, nageshi, z + side * .19);
      }
      // 柱列の長押を前後の壁・間仕切りまでつなぐ。柱筋の違う内外陣は別々に納める。
      // 横の長押の側面で止め、格子戸のある内陣境では二本溝より奥に置く。
      // 正面は持ち出した戸柱、背面は壁際の長押の内面に合わせる。細部は推定。
      const front = room.z0 + .11;
      const back = room.z1 >= b.d / 2 - .01 ? room.z1 - .27 : room.z1 - .11;
      for (const x of [-postX, postX]) for (const side of [-1, 1]) {
        // 横の長押の内側にも短い材を納め、柱の両脇で縦の長押を途切れさせない。
        // 横材の内面（十五・五センチ）で止め、交差する上面を重ねない。
        // 頭上の既存の幅に収め、格子戸の引き込みと内陣への脇口は保つ。
        for (const [a, c] of [[front, z - .225], [z - .155, z + .155], [z + .225, back]]) {
          if (c > a) timber(.07, .12, c - a, x + side * .19, nageshi, (a + c) / 2);
        }
        nail(x, z + side * .229);
        nail(x + side * .229, z, Math.PI / 2);
      }
    }
    // 内陣境も細い格縁だけで小壁を受けず、背面の柱と横梁で支える。
    // 焼失前の仕口は推定。中央の固定格子の裏に納め、左右の引き戸を空ける。
    // 礼盤の手前に残した余白へ張り出さず、柱の絵と当たりを同じ寸法にする。
    const naijin = lv.layout.rooms.find(room => room.name === '内陣');
    if (naijin) {
      const z = naijin.z1 - .18, radius = .12;
      const post = this.hallPostShape.clone();
      post.scale(radius / .18, postTop - base, radius / .18);
      hieiTimberGrain(post, 1, z * .53 % 1, true, radius * 2);
      post.translate(0, (base + postTop) / 2, z);
      super.add(r, 'wood', paintGeo(post, 0x634832)); post.dispose();
      rootWrap(0, z, radius);
      const [wx, wz] = r.naka.P(0, z), solid = solidCircle(wx, wz, radius);
      solid.yBot = lv.y; solid.yTop = r.y0 + ceiling;
      r.innerSolids.push(solid);
      // 斗・肘木は鴨居より上へ収め、内陣境の梁を受ける。
      timber(.24, bracketH, .24, 0, postTop + bracketH * .5, z);
      timber(.52, bracketH, .18, 0, postTop + bracketH * 1.5, z);
      timber(.18, bracketH, .4, 0, postTop + bracketH * 2.5, z);
      timber(b.w - .16, .3, .24, 0, ceiling - .15, z);
      // 下の桁もこの梁の側面で継ぎ、交差する下面を重ねない。
      beamZ.push(z);
    }
    // 横梁の木口は側柱の内面で止まるため、柱へ突き付けるだけでは受けがない。
    // 柱頭から内側へ持ち送りを出し、梁端の下面を支える推定の納まりにする。
    // 内陣境の梁も同じ寸法で受け、窓・格子戸より上の既存の木材へまとめる。
    // 側柱は壁芯の内外へ各八センチ。受けはその内面から梁下へ張り出す。
    for (const z of beamZ) for (const side of [-1, 1]) {
      timber(.32, .12, .3, side * (b.w / 2 - .08), ceiling - .36, z);
    }
    // 内外陣の横梁を桁でつなぎ、四周の側柱まで天井の荷を渡す。
    // 桁の木口は横梁の側面へ納め、同じ高さで二本の材を貫通させない。
    beamZ.sort((a, c) => a - c);
    for (const x of [-b.w * .2, b.w * .2]) {
      let start = -b.d / 2 + .08;
      for (const z of beamZ) {
        if (z - .12 > start) timber(.18, .24, z - .12 - start,
          x, ceiling - .12, (start + z - .12) / 2);
        start = z + .12;
      }
      const end = b.d / 2 - .08;
      if (end > start) timber(.18, .24, end - start, x, ceiling - .12, (start + end) / 2);
    }
    // 天蓋と灯籠は薄い格天井板から直接吊らず、二本の桁に掛けた受け材から吊る。
    // 共通の内装が作る吊り棒の上端と、受け材の下面を同じ高さへ揃える。
    // 焼失前の仕口は推定。須弥壇の上だけに納め、内陣の脇口へ柱を増やさない。
    lv.layout.altarSuspensionDrop = .47;
    for (const altar of lv.layout.props) {
      if (altar.part !== 'altar') continue;
      for (const z of [-.32, .16]) timber(b.w * .4 + .18, .12, .1,
        altar.x, base + lv.h - .41, altar.z + z * altar.d);
    }
    // 九間の正面建具は根本中堂だけ。ほかの堂の戸口・窓割は共通のまま使う。
    if (b.id !== 'konponchudo_1571') return r;
    const h = b.h || 6.2, y = 1.5, bw = b.w / 9, z = b.d / 2 + .13;
    // 横桟の下面まで戸口より上へ納め、開けた格子戸の上端に重ねない。
    const entryTop = r.naka.levels[0].y - r.y0 + r.naka.door.h;
    const parts = [];
    const bar = (x, cy, w, height) => {
      const g = new THREE.BoxGeometry(w, height, .14);
      g.translate(x, cy, z); parts.push(paintGeo(g, 0x3d2b1e));
    };
    // 九間の蔀戸。中央の戸口は塞がず、敷居・鴨居と縦横の桟を付ける。
    for (let i = 0; i < 9; i++) {
      const x = -b.w / 2 + bw * (i + .5), low = i === 4 ? entryTop - y + .08 : .08, top = h - .75;
      for (const side of [-1, 1]) bar(x + side * (bw / 2 - .08), y + (low + top) / 2, .12, top - low);
      for (const height of [low, top]) bar(x, y + height, bw - .04, .12);
      for (let k = 1; k < 5; k++) bar(x - bw / 2 + k * bw / 5, y + (low + top) / 2, .055, top - low);
      for (let height = low + .55; height < top - .1; height += .55) bar(x, y + height, bw - .16, .055);
    }
    super.add(r, 'hieiJoinery', parts);
    return r;
  }
  collapse(rec, k) {
    // 水平な基準高さへ潰すと、斜面の下側に黒い屋根が浮く。
    // 最初の崩落時だけ、元の高さと各頂点の真下の瓦礫の高さを覚える。
    if (!rec.hieiRubble) rec.hieiRubble = rec.ranges.map(r => {
      const p = r.b.mesh.geometry.attributes.position, from = new Float32Array(r.count), to = new Float32Array(r.count);
      for (let i = 0; i < r.count; i++) {
        const j = r.start + i, x = p.getX(j), z = p.getZ(j);
        const ground = this.W.heightAt(x, z);
        from[i] = p.getY(j);
        // 同じ地点の頂点には同じ高さを使い、三角面の継ぎ目を裂かない。
        const heap = .12 + .22 * (1 + Math.sin(x * 1.7 + z * 2.3));
        to[i] = Math.min(from[i], ground + heap);
      }
      return { from, to };
    });
    super.collapse(rec, k);
    const end = rec.kind === 'chudo' || rec.kind === 'kodo' ? .42 : rec.kind === 'kura' ? .7 : .3;
    const fall = Math.min(1, (1 - rec.collapseScale) / (1 - end));
    for (let n = 0; n < rec.ranges.length; n++) {
      const r = rec.ranges[n], p = r.b.mesh.geometry.attributes.position, saved = rec.hieiRubble[n];
      for (let i = 0; i < r.count; i++) p.setY(r.start + i, saved.from[i] + (saved.to[i] - saved.from[i]) * fall);
      p.needsUpdate = true;
    }
    if (rec.state === 2 || fall >= 1) rec.hieiRubble = null;
  }
}

// 比叡山だけ、近い枝・柱・壁を抜く。大きな面も画素ごとの距離で判じる。
// 材質は開戦時に一度だけ作り、同じ元の材質には同じ物を使う。
function hieiNearLook(rt, garan) {
  const mats = new Map();
  const nearMaterial = base => {
    if (!mats.has(base)) {
      const mat = base.clone(), compile = base.onBeforeCompile;
      const key = base.customProgramCacheKey();
      mat.transparent = false; mat.depthWrite = true;
      // この有限の視線だけで抜く。共通の至近処理を重ねない。
      mat.userData.camNearSolid = true;
      mat.onBeforeCompile = (sh, renderer) => {
        compile.call(base, sh, renderer);
        sh.vertexShader = 'varying vec3 vHieiNear; varying float vHieiNearHeight;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvHieiNear = mvPosition.xyz; vHieiNearHeight = (modelMatrix * vec4(transformed, 1.0)).y;');
        // 先に距離を頂点で測ると、長い軒の途中は近くても抜けない。
        // 本人を隠す手前だけ抜く。本人より先の戸や隣の壁は残す。
        sh.uniforms.hieiNearPlayer = { value: rt.player.u.pos };
        sh.fragmentShader = 'varying vec3 vHieiNear; varying float vHieiNearHeight; uniform vec3 hieiNearPlayer;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
          vec3 sight = (viewMatrix * vec4(hieiNearPlayer + vec3(0.0, 1.3, 0.0), 1.0)).xyz;
          float along = dot(vHieiNear, sight) / max(dot(sight, sight), 0.01);
          // 頭と肩の幅だけ空け、横の建物まで網目状に透かさない。
          float sightLength = length(sight);
          float gap = length(vHieiNear - sight * along);
          float nearKeep = smoothstep(0.35, 0.55, length(vHieiNear));
          // 門の下では頭への細い視線より上に梁・軒が残り、画面を覆う。
          // 三人称の目から本人までの頭上だけ抜く。本人の奥の屋根と一人称は保つ。
          if (sightLength > 1.4 && along > 0.0 && along < 1.0 && vHieiNearHeight > hieiNearPlayer.y + 2.1) {
            // 廻廊では軒まで二・八歩以上ある。本人までの距離に合わせて
            // 頭上の抜きを伸ばし、離れた堂の屋根は六歩より先に残す。
            float eaveRadius = clamp(sightLength + 0.6, 2.4, 5.6);
            // 球の範囲だけで抜くと、横の里坊の壁まで大きく切れる。
            // 頭上の軒も視線の周りだけに絞り、側面と本人より奥の堂を残す。
            float eaveKeep = max(smoothstep(1.1, 1.5, gap), smoothstep(eaveRadius, eaveRadius + 0.4, length(vHieiNear)));
            nearKeep = min(nearKeep, eaveKeep);
          }
          if (along > 0.0 && along * sightLength < sightLength + 0.35) {
            float endKeep = smoothstep(sightLength + 0.15, sightLength + 0.35, along * sightLength);
            nearKeep = min(nearKeep, max(endKeep, smoothstep(0.95, 1.15, gap)));
          }
          // 足元の床と基礎は残す。柱を抜く輪で地面際まで白く切り抜かない。
          if (nearKeep < 0.5 && vHieiNearHeight > hieiNearPlayer.y + 0.08) discard;
          diffuseColor.a = 1.0;
        `);
      };
      mat.customProgramCacheKey = () => key + '_hiei_near_occluder_sight_eaves';
      mats.set(base, mat);
    }
    return mats.get(base);
  };
  const near = mesh => {
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(nearMaterial) : nearMaterial(mesh.material);
  };
  let mossMat;
  for (const b of garan.buckets.values()) {
    if (!b.mesh) continue;
    if (b.mk === 'hieiMoss') {
      // 丸い苔の縁だけぼかす。全ての苔に一つの材質を使い、道や建物へ掛けない。
      if (!mossMat) {
        mossMat = MONK_MAT.clone(); mossMat.roughness = 1;
        mossMat.transparent = true; mossMat.depthWrite = false;
        mossMat.polygonOffset = true; mossMat.polygonOffsetFactor = -1;
        mossMat.onBeforeCompile = sh => {
          sh.vertexShader = 'varying vec2 vHieiMoss;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvHieiMoss = uv;');
          sh.fragmentShader = 'varying vec2 vHieiMoss;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(0.25, 0.5, length(vHieiMoss - 0.5));');
        };
        mossMat.customProgramCacheKey = () => 'hiei_moss';
      }
      b.mesh.material = mossMat; b.mesh.castShadow = false;
    } else if (b.dist === 'hieiSteps' || b.mk === 'paving') {
      // 石段と敷石は足元の地面として残す。柱と同じ透かしを掛けない。
      b.mesh.material.userData.camNearSolid = true;
    } else if (b.mk !== 'stone' && b.mk !== 'plain') near(b.mesh);
  }
  // 木の束全体を半透明にすると、重なった樹冠の奥に幹だけが見える。
  // 木は深さを保ち、カメラと本人の間の枝葉だけを抜く。形や株数は増やさない。
  const treeMats = new Map();
  for (const mesh of rt.world.treeMeshes) {
    const base = mesh.material;
    if (!treeMats.has(base)) {
      const mat = base.clone(), compile = base.onBeforeCompile, key = base.customProgramCacheKey();
      mat.transparent = false; mat.depthWrite = true;
      mat.userData.camNearSolid = true;
      mat.onBeforeCompile = (sh, renderer) => {
        compile.call(base, sh, renderer);
        sh.uniforms.hieiSightPlayer = { value: rt.player.u.pos };
        // 揺れる木は project_vertex が展開済み。葉にも実際の距離を渡す。
        const vs = sh.vertexShader;
        sh.vertexShader = 'varying vec3 vHieiTreeView;\n' + (vs.includes('#include <project_vertex>')
          ? vs.replace('#include <project_vertex>', '#include <project_vertex>\nvHieiTreeView = mvPosition.xyz;')
          : vs.replace('gl_Position = projectionMatrix * mvPosition;', 'gl_Position = projectionMatrix * mvPosition;\nvHieiTreeView = mvPosition.xyz;'));
        sh.fragmentShader = 'varying vec3 vHieiTreeView; uniform vec3 hieiSightPlayer;\n' + sh.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
          vec3 sight = (viewMatrix * vec4(hieiSightPlayer + vec3(0.0, 1.3, 0.0), 1.0)).xyz;
          float along = dot(vHieiTreeView, sight) / max(dot(sight, sight), 0.01);
          // 本人だけでなく目前の道と敵も見える幅を空ける。
          // 本人の八歩先までの有限の視線に留め、遠い森は残す。
          float sightLength = length(sight);
          float keep = smoothstep(0.45, 2.4, length(vHieiTreeView));
          if (along > 0.0 && along * sightLength < sightLength + 8.0) {
            float gap = length(vHieiTreeView - sight * along);
            float endKeep = smoothstep(sightLength + 6.0, sightLength + 8.0, along * sightLength);
            keep = min(keep, max(endKeep, smoothstep(1.5, 3.0, gap)));
          }
          // 画素の網目を重ねると、携帯では枝葉が破れた幕に見える。
          // 視線を塞ぐ部分だけを抜き、残す枝葉は不透明のまま描く。
          if (keep < 0.5) discard;
        `);
      };
      mat.customProgramCacheKey = () => key + '_hiei_tree_sight_clear';
      treeMats.set(base, mat);
    }
    mesh.material = treeMats.get(base);
  }
  // 室内は接近後に作られる。後から出来る壁や梁にも同じ材質を使う。
  return near;
}

// 比叡山だけの裹頭。共通の目だけの窓を使わず、鼻・口・頬まで顔を出す。
// 十二の顔を開戦時に作って使い回す。陰も頂点の色に残し、低画質でも布と肌を分ける。
const MONK_HEADS = new Map();
const MONK_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, side: THREE.DoubleSide });
function monkHeadLod(r, scene, camera) {
  const mesh = this;
  const a = mesh.matrixWorld.elements, b = camera.matrixWorld.elements;
  const near = !camera.isOrthographicCamera && (a[12] - b[12]) ** 2 + (a[13] - b[13]) ** 2 + (a[14] - b[14]) ** 2 < 225;
  mesh.geometry = near ? mesh.userData.hieiHead.head : mesh.userData.hieiHead.far;
}
function monkFaceFixed() {}
function monkGeometry(source, cloth = false, variant = 0) {
  const g = source.index ? source.toNonIndexed() : source.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  const p = g.attributes.position, colors = g.attributes.color;
  const out = new Float32Array(p.count * 3), base = new THREE.Color([0xd9d1be, 0xe3dac8, 0xcac3b3][variant % 3]);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let shade;
    if (cloth) {
      const wrinkle = Math.sin(y * 120 + Math.atan2(x, z) * 14 + variant);
      shade = 0.91 + 0.08 * wrinkle;
      // 開口の内側と折り目の谷は、白い布より暗い。
      if (z > 0.045 && y > 1.475 && y < 1.68) shade *= 0.72;
    } else {
      const front = Math.max(0, Math.min(1, (z - 0.06) / 0.06));
      const rim = Math.exp(-(((y - 1.661) / 0.022) ** 2)) + 0.6 * Math.exp(-(((Math.abs(x) - 0.081) / 0.022) ** 2));
      const cheek = Math.exp(-(((Math.abs(x) - 0.057) / 0.025) ** 2) - ((y - 1.565) / 0.024) ** 2);
      const underNose = Math.exp(-((x / 0.018) ** 2) - ((y - 1.576) / 0.012) ** 2);
      shade = 1 - front * Math.min(0.42, rim * 0.27 + cheek * 0.12 + underNose * 0.18);
    }
    out[i * 3] = (cloth ? base.r : colors.getX(i)) * shade;
    out[i * 3 + 1] = (cloth ? base.g : colors.getY(i)) * shade;
    out[i * 3 + 2] = (cloth ? base.b : colors.getZ(i)) * shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return g;
}
function monkHead(look) {
  const v = (look.face | 0) % 12;
  if (MONK_HEADS.has(v)) return MONK_HEADS.get(v);
  const wrap = new THREE.SphereGeometry(1, 24, 18), p = wrap.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const fold = 0.0035 * Math.sin(y * 38 + Math.atan2(x, z) * 3 + v) + 0.0015 * Math.sin(y * 79 + x * 53);
    p.setXYZ(i, x * (0.12 + fold), 1.603 + y * (0.15 + fold), 0.006 + z * (0.142 + fold));
  }
  const ix = wrap.index.array, kept = [];
  for (let i = 0; i < ix.length; i += 3) {
    let x = 0, y = 0, z = 0;
    for (let j = 0; j < 3; j++) { x += p.getX(ix[i + j]) / 3; y += p.getY(ix[i + j]) / 3; z += p.getZ(ix[i + j]) / 3; }
    if (!(z > 0.048 && Math.abs(x) < 0.102 && y > 1.478 && y < 1.674)) kept.push(ix[i], ix[i + 1], ix[i + 2]);
  }
  wrap.setIndex(kept); wrap.computeVertexNormals();
  const pieces = [monkGeometry(wrap, true, v)]; wrap.dispose();
  for (const side of [-1, 1]) {
    const tail = new THREE.BoxGeometry(0.043, 0.22 + (v % 3) * 0.015, 0.009);
    tail.rotateZ(side * 0.12); tail.translate(side * 0.037, 1.425, -0.14);
    pieces.push(monkGeometry(tail, true, v)); tail.dispose();
  }
  const hood = mergeGeometries(pieces);
  const face = monkGeometry(lookParts(look).face), lo = monkGeometry(lookParts(look, false).face);
  const rec = { hood, face, head: mergeGeometries([face, hood]), far: mergeGeometries([lo, hood]) };
  for (const g of pieces) g.dispose(); lo.dispose();
  MONK_HEADS.set(v, rec);
  return rec;
}
function monkSoldiers(rt) {
  const add = rt.army.addUnit;
  rt.army.addUnit = function (group, options) {
    const u = add.call(this, group, options);
    if (u.look?.sohei && !u.look.kosode) {
      // 袈裟・腹巻は元の装いのまま。骨入りの人にも共通の顔を覆う布を作らせない。
      u.look = { ...u.look, hat: 'hachimaki' };
      const rec = monkHead(u.look);
      u.head.geometry = rec.far; u.head.material = MONK_MAT;
      u.head.userData.hieiHead = rec; u.head.onBeforeRender = monkHeadLod;
    }
    return u;
  };
}
function monkNearHeads(rt) {
  for (const u of rt.army.units) {
    const h = u.human;
    if (!h || !u.look?.sohei || u.look.kosode) continue;
    if (h.hieiHood) { h.hieiHood.visible = !h.lodFar; continue; }
    const anchor = h.parts.kato || h.parts.pface;
    if (!anchor) continue;
    const rec = monkHead(u.look), hood = new THREE.Mesh(rec.hood, MONK_MAT);
    hood.matrixAutoUpdate = false; hood.matrix.copy(anchor.matrix);
    hood.castShadow = true; hood.receiveShadow = true; hood.visible = !h.lodFar;
    anchor.parent.add(hood); h.hieiHood = hood;
    // 実写の顔がまだ無い兵にも、まぶた・鼻筋・唇・頬の凹凸と縁の陰を残す。
    if (h.parts.pface) {
      h.parts.pface.geometry = rec.face; h.parts.pface.material = MONK_MAT;
      h.parts.pface.receiveShadow = true; h.parts.pface.onBeforeRender = monkFaceFixed;
    }
  }
}
// 笠の中心を保って縁を坂へ寝かせる。落ちた時だけ調べ、共通の形は変えない。
function hieiFallenHats(rt) {
  const A = rt.army, W = rt.world, dropHat = A.dropHat;
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), turn = new THREE.Quaternion();
  A.dropHat = function (u) {
    if (u.hatOff) return;
    dropHat.call(this, u);
    const hat = u.hatOff;
    if (!hat?.isMesh) return;
    hat.updateMatrix(); point.set(0, 1.66, 0).applyMatrix4(hat.matrix);
    const x = point.x, z = point.z, y = u.pos.y, e = .4;
    normal.set(groundAt(W, x - e, z, y) - groundAt(W, x + e, z, y), 2 * e,
      groundAt(W, x, z - e, y) - groundAt(W, x, z + e, y)).normalize();
    hat.rotation.set(0, u.id * 2.4, 0);
    hat.quaternion.premultiply(turn.setFromUnitVectors(up, normal));
    hat.updateMatrix(); point.set(0, 1.66, 0).applyMatrix4(hat.matrix);
    hat.position.x += x - point.x; hat.position.z += z - point.z;
    contactLitter(hat, W, y);
  };
}
const near = (u, p, r) => u && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < r;
// 道の一部（i0〜i1 の折れ点）を、隊の歩く道筋にする
const pts = (id, i0 = 0, i1) => pathById(id).pts.slice(i0, i1 === undefined ? undefined : i1 + 1).map(([x, z]) => [x, z]);
function walk(g, path, speed, onArrive, turnBack = false, freshRoute = false) {
  if (!g || !g.count || g.routed) return;
  const reset = turnBack || freshRoute;
  const oldHill = reset ? null : g._hillPath, oldIdx = g.pathIdx;
  if (!reset && g.order === 'path' && g.path) path = [...g.path.slice(g.pathIdx), ...path];
  // 後ろの列も曲がり角をたどる。直線の縦隊を回すと、後尾が里坊や急斜面へ振り出される。
  g._hillPath = [[g.anchor.x, g.anchor.z], ...path];
  g._hillFace = g._face ?? g.facing;
  if (!g._hillSlot) {
    g._hillSlot = g.slotPos;
    g._hillSlots = Array.from({ length: g.initial }, () => ({ x: 0, z: 0 }));
    g.slotPos = hillSlot;
  }
  for (const q of g._hillSlots) {
    // 段が変わっても、遅れた兵がまだ通っていない折れを残す。
    const join = !reset && q.join ? q.join.slice(q.joinI) : [];
    if (oldHill) join.push(...oldHill.slice(q.next, Math.min(oldIdx + 1, oldHill.length)));
    q.next = 1; q.join = join.length ? join : null; q.joinI = 0;
  }
  const leavesShrine = path.some(([x]) => x <= 138);
  for (const u of g.units) {
    const q = g._hillSlots[u.slot];
    q.unit = u;
    // 日吉社で戦って列を離れた兵は、参道を下って坂本の通りへ戻す。
    // 本坂の最初の点へ直行すると、里坊と参道脇の法面を横切ってしまう。
    // 本坂へ向かう道も最初は坂本の通り。最初の点だけで登山を判じない。
    if (leavesShrine && u.alive && u.pos.x > 128 && u.pos.x < 156 && u.pos.z < -3) {
      const road = pathById('hiyoshi').pts;
      let bi = 0, bd = Infinity;
      for (let i = 0; i < road.length; i++) {
        const d = Math.hypot(u.pos.x - road[i][0], u.pos.z - road[i][1]);
        if (d < bd) { bi = i; bd = d; }
      }
      // 帰りの参道を渡した後、古い「社へ入る道」を再び歩かせない。
      // 本坂の未通過の折れは順に残し、古い社前の点だけを取り除く。
      const join = (q.join || []).filter(([x, z]) => !(x > 128 && x < 156 && z < -3));
      q.join = [...road.slice(0, bi + 1).reverse(), [146, 4], ...join];
    }
  }
  g.order = 'path'; g.path = path; g.pathIdx = 0; g.speed = g.team === 0 ? Math.max(2.8, speed || 2.4) : speed || 2.4; g.formation = 'column'; g.colW = 1;
  const [x, z] = path[path.length - 1];
  g.onArrive = onArrive || ((q) => { q.order = 'hold'; q.anchor = { x, z }; q.formation = 'column'; });
  if (g._command && !turnBack) walk(g._command, path, g.speed * 0.94, undefined, false, freshRoute);
}
function hillSlot(i, n) {
  if (!this._hillPath || this.formation !== 'column' || (this.order !== 'path' && this.order !== 'hold' && this.order !== 'attack')) return this._hillSlot(i, n);
  const q = this._hillSlots[i], cols = this.colW || 2;
  // 倒れた前列の場所を空けたままにしない。生きた後列から順に詰める。
  // 兵固有の折れ点の記録は元の番号に残し、道を飛ばさない。
  let rank = 0;
  for (const u of this.units) if (u.slot < i && u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget) rank++;
  let back = Math.floor(rank / cols) * this.spacing * 1.3;
  const side = (rank % cols - (cols - 1) / 2) * this.spacing;
  let x = this.anchor.x, z = this.anchor.z;
  let fx = Math.sin(this._hillFace), fz = Math.cos(this._hillFace);
  let k = Math.min(this.pathIdx, this._hillPath.length - 1);
  for (; k >= 0; k--) {
    const p = this._hillPath[k], dx = x - p[0], dz = z - p[1], d = Math.hypot(dx, dz);
    if (d < 0.001) continue;
    fx = dx / d; fz = dz / d;
    if (back <= d) break;
    back -= d; x = p[0]; z = p[1];
    if (k === 0) { fx = Math.sin(this._hillFace); fz = Math.cos(this._hillFace); }
  }
  q.x = x - fx * back - fz * side;
  q.z = z - fz * back + fx * side;
  // 要が先へ進んでも、兵自身がまだ通っていない折れを飛ばさない。
  // 行き先だけを道上に置くと、遅れた兵はつづら折りの内側の急斜面を横切って詰まる。
  const u = q.unit;
  // 持ち場は1.6歩以内で到着扱いになる。曲がり角もその外側で次へ進める。
  while (u && q.join && q.joinI < q.join.length) {
    const p = q.join[q.joinI];
    if (Math.hypot(u.pos.x - p[0], u.pos.z - p[1]) < 1.8) q.joinI++;
    else { q.x = p[0]; q.z = p[1]; return q; }
  }
  while (u && q.next <= k) {
    const a = this._hillPath[q.next - 1], b = this._hillPath[q.next];
    const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1;
    const tx = b[0] - dz / d * side, tz = b[1] + dx / d * side;
    if (Math.hypot(u.pos.x - tx, u.pos.z - tz) < 1.8) q.next++;
    else { q.x = tx; q.z = tz; break; }
  }
  return q;
}
const attackFrom = (q, r = 16) => { q.order = 'attack'; q.seekRange = Math.min(r, 16); q.formation = 'column'; };
let hieiClock = 0;   // 今の戦の時刻（arrived の待ちを数える。update が毎コマ入れる）
const arrived = (g, p, r) => {
  if (!g) return false;
  let alive = 0, near = 0, front = 0;
  for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget) {
    alive++;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (d < r) front++;
    const q = g._hillSlots ? g.slotPos(u.slot, g.initial) : null;
    // 一列の後尾は三十歩以上後ろになる。道上の持ち場へ着いた兵も数え、
    // 列を縮めたり、まだ曲がり角を通っていない兵を飛ばしたりしない。
    const inSlot = q && Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < 3.5;
    if ((d < r + 12 || inSlot) && (!q || !q.join || q.joinI >= q.join.length)) near++;
  }
  g._hillNear = near; g._hillAlive = alive; g._hillFront = front;
  // 攻撃へ移った隊の要は敵を追って動く。到着は実際の前列と後続で判じる。
  // 前列三人と六割の後続が必要な条件は保ち、見えない要だけで待たせない。
  const full = !gone(g) && front >= Math.min(3, alive) && front > 0 && near >= Math.ceil(alive * 0.6);
  // 先手の前列が一人でも着いて十五秒たてば進む。後続は山道で僧兵と打ち合いながら歩いて続く。
  //   後続の六割を待ち続けて本人が一分以上立ち尽くし、八分で打ち切られていた（10/27）。
  const key = p.x + ',' + p.z;
  if (full || gone(g) || front === 0) { if (g._arrKey === key) g._arrSince = null; return full; }
  if (g._arrKey !== key || g._arrSince == null) { g._arrKey = key; g._arrSince = hieiClock; }
  return hieiClock - g._arrSince >= 15;
};
const columnWait = (g, place) => g?._hillAlive
  ? g._hillFront < Math.min(3, g._hillAlive)
    ? `${place}を守れ。前列あと${Math.min(3, g._hillAlive) - g._hillFront}人を待つ`
    : g._hillNear < Math.ceil(g._hillAlive * .6)
      ? `${place}を守れ。後続あと${Math.ceil(g._hillAlive * .6) - g._hillNear}人を待つ`
      : `${place}で先手と合流`
  : '先手の戦える兵がいない。味方の旗へ戻れ';
// 携帯で距離の欄が省かれても、何人待つか分かる短い下知にする。
const columnTask = (g, place) => g?._hillAlive
  ? g._hillFront < Math.min(3, g._hillAlive)
    ? `${place}で前列をあと${Math.min(3, g._hillAlive) - g._hillFront}人待て`
    : `${place}で後続をあと${Math.max(0, Math.ceil(g._hillAlive * .6) - g._hillNear)}人待て`
  : '先手が戦えない。味方の旗へ戻れ';
const guardedRoad = (rt, p) => {
  for (const g of rt.flags.foes) if (!gone(g)) for (const u of g.units) {
    if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 10) return false;
  }
  return true;
};

// 到着を待つ間も、目前の守りと道への復帰を先に知らせる。突破の条件は変えない。
function roadProgress(rt, place) {
  const F = rt.flags;
  if (F._gHold) return '来た道の味方の旗へ戻れ';
  if (F.guideReturn.active) return '印をたどり、本道へ戻れ';
  return Number.isFinite(F.guideRemaining)
    ? `${place}まで道なりに約${F.guideRemaining}歩。印をたどれ`
    : `印をたどり、${place}へ進め`;
}

// 鳥居へ着く前は道案内、着いてからは戦う相手を札と印にそろえる。
function shrineGuideLabel(rt) {
  const F = rt.flags;
  if (F._gHold) return '来た道の味方の旗へ戻れ';
  if (F.guideReturn.active) return '参道へ戻り、鳥居へ';
  return near(rt.player.u, F.hiyoshiG.anchor, 12)
    ? '鳥居の前の敵を、味方と退けよ'
    : '道の印をたどり、赤い鳥居へ';
}

function rallyProgress(rt, point, radius, place, onward) {
  const F = rt.flags;
  if (F._gHold) return '来た道の味方の旗へ戻れ';
  if (F.guideReturn.active) return '印をたどり、本道へ戻れ';
  if (!near(rt.player.u, point, radius)) return roadProgress(rt, place);
  const ready = arrived(F.akechi, point, Math.max(10, radius));
  const clear = guardedRoad(rt, point);
  // 目前の敵と後続待ちを声でも区別する。近くの組頭の声にし、遠い光秀の使番を待たせない。
  const call = !clear ? 'fight' : !ready ? 'wait' : '';
  // 戸口への復帰・深手の手当て・退却中は、前進先の声を重ねない。
  const urgent = F.exitMarked || F.woundTask || F.dangerAt !== undefined
    || rt.player.u.hp <= rt.player.u.maxHp * .4;
  if (!urgent && call && (F.rallyCallPoint !== point || F.rallyCall !== call)
    && rt.t - (F.rallyCallT ?? -Infinity) >= 8) {
    F.rallyCallPoint = point; F.rallyCall = call; F.rallyCallT = rt.t;
    rt.say('組頭', !clear ? `${place}の敵を、味方と退けよ` : `${place}を守れ。先手の列を待て`, 3);
  }
  if (!clear) return `${place}の敵を、味方と退けよ`;
  return ready ? onward : columnWait(F.akechi, place);
}

// 到着後は印も札と同じ下知にする。門の先へ進ませてから呼び戻さない。
function rallyGuideLabel(rt, point, radius, place, onward, arrivalRadius = Math.max(10, radius)) {
  const F = rt.flags;
  if (F.guideReturn.active) return '印に沿って本道へ戻る';
  if (!near(rt.player.u, point, radius)) return onward;
  if (!guardedRoad(rt, point)) return `${place}の敵を退ける`;
  // 進行と同じ範囲で数え直す。広い本人の到着範囲で先手を数えない。
  const ready = arrived(F.akechi, point, arrivalRadius);
  return ready ? `${place}で先手と合流` : columnTask(F.akechi, place);
}

// 布を使い切った時は巻くよう命じず、今できる退避か操作を札に出す。
function hieiTreatmentProgress(rt) {
  const p = rt.player;
  if (p.treatmentLeft <= 0) return '布は使い切った。味方の後ろで身を守れ';
  if (p.mounted) return '味方の後ろへ下がり、馬を降りよ';
  if (p.treatmentNext > rt.t) return `味方の後ろへ。手当てまであと${Math.ceil(p.treatmentNext - rt.t)}秒`;
  if (p.treatmentReady) return '止まったまま「手当て」を三秒長押し';
  return rt.flags.retreatPoint ? '退く印へ。味方の後ろで止まれ' : '来た道の味方へ戻り、後ろで止まれ';
}

// 使番は隊の要へ直進せず、坂本の通りと本坂の折れを通って下知を届ける。
// 道と投影用の入れ物は使い回し、歩けるかの調べも三分の一秒ごとにする。
const RUNNER_ROAD = [...pts('sakamoto'), ...pts('honzaka', 1), ...pts('todo', 1, 3),
  [-24, -5], [-19, -9], ...pts('todo_n', 1), ...pts('saito', 1), ...pts('yokawa', 1)];
const RUNNER_SHRINE_E = [...pts('hiyoshi').reverse(), [158, 5], [170, 7], [184, 7]];
const RUNNER_SHRINE_W = [...pts('hiyoshi').reverse(), [146, 4], ...RUNNER_ROAD.slice(4)];
// 里坊の北へ押し出された兵は、家の裏を通って参道か東の通りへ戻る。
// 通りへの直線は里坊を横切り、既存の参道も二十歩の探索範囲から外れる。
const RUNNER_NORTH_E = [[143, -16], [148, -18], [168, -18], [184, -18], [184, 7], [170, 7], [158, 5]];
const RUNNER_NORTH_W = [[184, -18], [168, -18], [148, -18], [143, -16], ...pts('hiyoshi').slice(0, 2).reverse(), [146, 4], ...RUNNER_ROAD.slice(4)];
const RUNNER_FROM = { x: 0, z: 0, s: 0, d: 0 }, RUNNER_TO = { x: 0, z: 0, s: 0, d: 0 };
const RUNNER_TEST = { x: 0, z: 0 };
const RUNNER_RT = { world: null, army: null };
const EXIT_NO_RECTS = [];
// 室内から本道へ直線を引かず、家具を避けて戸口の内側、外側の順に戻す。
function hieiExitWay(rt) {
  const F = rt.flags, p = rt.player.u.pos, room = nakaRoomAt(p.x, p.z, p.y);
  // 内側の点を離れた途端に案内を戻すと、敷居の前を往復して外へ出られない。
  // 戸口を抜けても、外の石段の下まで同じ出口を案内し続ける。
  if (F.exitInterior) {
    const I = F.exitInterior;
    if ((!room || room.I === I) && Math.hypot(p.x - I.doorOut.x, p.z - I.doorOut.z) > .6
      && Math.hypot(p.x - I.doorOut.x, p.z - I.doorOut.z) < 12) {
      F.exitWay.x = I.doorOut.x; F.exitWay.z = I.doorOut.z;
      F.exitWay.y = groundAt(rt.world, I.doorOut.x, I.doorOut.z, p.y);
      return F.exitWay;
    }
    F.exitInterior = null;
  }
  if (!room || !['hiei', 'hieizan'].includes(room.I.profile)) return null;
  const I = room.I, out = F.exitWay, local = F.exitLocal;
  const dx = p.x - I.x, dz = p.z - I.z;
  const ix = I.doorIn.x - I.x, iz = I.doorIn.z - I.z;
  if (Math.hypot(p.x - I.doorIn.x, p.z - I.doorIn.z) < .9) {
    F.exitInterior = I;
    out.x = I.doorOut.x; out.z = I.doorOut.z; out.y = groundAt(rt.world, out.x, out.z, p.y);
  } else {
    const lx = dx * I.c - dz * I.s, lz = dx * I.s + dz * I.c;
    const tx = ix * I.c - iz * I.s, tz = ix * I.s + iz * I.c;
    let best = Infinity;
    // 机の上へ乗った時は、道探しの始点も家具の外へ戻す必要がある。
    const rects = room.lv.layout.paths?.rects || EXIT_NO_RECTS;
    for (const r of rects) if (lx > r.x0 && lx < r.x1 && lz > r.z0 && lz < r.z1) {
      for (let k = 0; k < 4; k++) {
        const x = k === 0 ? r.x0 - .08 : k === 1 ? r.x1 + .08 : lx;
        const z = k === 2 ? r.z0 - .08 : k === 3 ? r.z1 + .08 : lz;
        if (Math.abs(x) > room.lv.w / 2 - .3 || Math.abs(z) > room.lv.d / 2 - .3) continue;
        let blocked = false;
        for (const v of rects) if (x > v.x0 && x < v.x1 && z > v.z0 && z < v.z1) { blocked = true; break; }
        const d = Math.hypot(x - lx, z - lz) + .1 * Math.hypot(x - tx, z - tz);
        if (!blocked && d < best) { best = d; local.x = x; local.z = z; }
      }
    }
    if (!Number.isFinite(best)) interiorWaypoint(room.lv.layout, lx, lz, tx, tz, local);
    out.x = I.x + local.x * I.c + local.z * I.s;
    out.z = I.z - local.x * I.s + local.z * I.c; out.y = room.lv.y;
  }
  return out;
}
function runnerClear(army, u, a, b) {
  if (army.wallBetween(a, u.team, b, false)) return false;
  const W = army.world, player = u.isPlayer && army.hieiGuideWorld;
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (player ? .6 : 1.2));
  RUNNER_RT.world = army.world; RUNNER_RT.army = army;
  let previous = player ? groundAt(W, a.x, a.z, u.pos.y) : 0, px = a.x, pz = a.z;
  for (let i = 1; i <= n; i++) {
    const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
    let h = player ? groundAt(W, x, z, previous) : 0;
    // 使番の広い体幅と地面だけの高さで、本人が通った門・敷居を塞がない。
    // 上り下りは本人と同じ一歩の判定、壁は歩兵の体幅で調べる。
    if (player && !army.hieiGuidePlayer.canStep(px, pz, x, z, previous)) {
      // 六十センチの検査では、歩いて登れる石段も一段九十センチ超と誤る。
      // 止まった区間だけ二十センチ以下に分け、実際の一歩と同じ条件で調べる。
      const steps = Math.max(1, Math.ceil(Math.hypot(x - px, z - pz) / .2));
      let sx = px, sz = pz, sy = previous;
      for (let j = 1; j <= steps; j++) {
        const nx = px + (x - px) * j / steps, nz = pz + (z - pz) * j / steps;
        if (!army.hieiGuidePlayer.canStep(sx, sz, nx, nz, sy)) return false;
        const ny = groundAt(W, nx, nz, sy);
        RUNNER_RT.world = player;
        if (runnerBlocked(RUNNER_RT, nx, nz, .45, ny)) return false;
        sx = nx; sz = nz; sy = ny;
      }
      h = sy;
    }
    RUNNER_RT.world = player || W;
    if (runnerBlocked(RUNNER_RT, x, z, player ? .45 : .7, player ? h : undefined)) return false;
    previous = h; px = x; pz = z;
  }
  return true;
}
// 道上の二点でも、直線がつづら折りの外へ出るなら折れ点を通す。
// 本人が道外から戻る時も、合流後につづら折りを横切らせない。
// 道外にいる兵の戦いと、道へ入るまでの復帰の歩みは保つ。
function roadClear(army, u, a, b) {
  if (!runnerClear(army, u, a, b)) return false;
  const W = army.world;
  let joined = W.onRoad(a.x, a.z);
  if (!u.isPlayer && (!joined || !W.onRoad(b.x, b.z))) return true;
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .8);
  for (let i = 1; i <= n; i++) {
    const onRoad = W.onRoad(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n);
    if (joined && !onRoad) return false;
    joined = joined || onRoad;
  }
  return true;
}
// 休む印は道の中央寄りへ置く。道の端の法面は、道上判定だけでは除けない。
// 足一人分の余白と横断勾配を調べる。探索用の物や形は作り足さない。
function hieiRestPoint(rt, point) {
  const W = rt.world, x = point.x, z = point.z;
  for (const path of PATHS) {
    const margin = Math.max(.2, path.w - .55);
    for (let i = 1; i < path.pts.length; i++) {
      const a = path.pts[i - 1], b = path.pts[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < .001) continue;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (length * length)));
      if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) > margin) continue;
      const nx = dz / length * .45, nz = -dx / length * .45;
      if (Math.abs(W.heightAt(x + nx, z + nz) - W.heightAt(x - nx, z - nz)) <= .35) return true;
    }
  }
  return false;
}
function runnerPoint(path, p, out, army, u) {
  out.d = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
    if (d >= out.d || army && d > 20) continue;
    if (army) { RUNNER_TEST.x = x; RUNNER_TEST.z = z; if (!roadClear(army, u, p, RUNNER_TEST)) continue; }
    out.x = x; out.z = z; out.s = i - 1 + t; out.d = d;
  }
}
// 本道への直線が塀や法面で塞がれた時だけ、近い小道と僧坊の外周をたどる。
// 点と探索の入れ物は設営時に作る。近い二十四歩だけ、失敗後は三秒あける。
function makeGuideDetour() {
  const points = [];
  const segment = (ax, az, bx, bz, spacing = 3) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / spacing));
    for (let i = 0; i <= n; i++) points.push({ x: ax + (bx - ax) * i / n, z: az + (bz - az) * i / n });
  };
  for (const path of PATHS) for (let i = 1; i < path.pts.length; i++) {
    // 狭い本坂だけ一歩刻みにする。三歩刻みでは石段の角の通れる点を飛ばす。
    const a = path.pts[i - 1], b = path.pts[i]; segment(a[0], a[1], b[0], b[1], path.id === 'honzaka' ? 1 : 3);
  }
  for (const b of BUILDINGS) if (b.enterable && !b.lite) {
    const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0), w = b.w / 2 + 1.5, d = b.d / 2 + 1.5;
    const corners = [[-w, -d], [w, -d], [w, d], [-w, d]];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], q = corners[(i + 1) % 4];
      segment(b.x + a[0] * c + a[1] * s, b.z - a[0] * s + a[1] * c,
        b.x + q[0] * c + q[1] * s, b.z - q[0] * s + q[1] * c);
    }
  }
  // 道から離れた法面にも復帰の折れを探す。入れ物は設営時に確保する。
  const groundStart = points.length;
  for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) points.push({ x: 0, z: 0 });
  const fineStart = points.length;
  // 三歩刻みだけでは、足元の狭い曲がり角を丸ごと飛ばしてしまう。
  // 近い三歩だけ四分の三歩刻みで補う。点と探索の配列は設営時に共用する。
  for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) {
    if (x % 4 === 0 && z % 4 === 0) continue;
    points.push({ x: 0, z: 0 });
  }
  return { points, groundStart, fineStart, local: new Int32Array(points.length), parent: new Int32Array(points.length), queue: new Int32Array(points.length),
    route: new Int32Array(points.length), length: 0, index: 0, key: null, retry: -1,
    forwardKey: null, goal: { x: 0, z: 0 } };
}
function guideDetour(rt, R, key, F = rt.flags, target = null) {
  const D = F.guideDetour, u = rt.player.u, p = u.pos;
  // 前へ進む迂回は本道をたどる。道を外れた本人の帰路は従来どおり探す。
  const clear = roadClear;
  if (D.key !== key) { D.key = key; D.length = 0; D.retry = -1; }
  // 試し役の到着半径とそろえ、狭い角を一歩手前で飛ばさない。
  while (D.index < D.length && Math.hypot(p.x - D.points[D.route[D.index]].x, p.z - D.points[D.route[D.index]].z) < .35) D.index++;
  if (D.index < D.length && clear(rt.army, u, p, D.points[D.route[D.index]])) return D.points[D.route[D.index]];
  D.length = 0;
  if (rt.t < D.retry) return null;
  D.retry = rt.t + 3; D.parent.fill(-2);
  // 通常の道への復帰が失敗した時だけ、周囲十二歩の地面を調べる。
  // 次の探索まで座標を保ち、歩いている途中の印を動かさない。
  let ground = D.groundStart;
  for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) {
    const q = D.points[ground++]; q.x = p.x + x * 3; q.z = p.z + z * 3;
  }
  for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) {
    if (x % 4 === 0 && z % 4 === 0) continue;
    const q = D.points[ground++]; q.x = p.x + x * .75; q.z = p.z + z * .75;
  }
  let head = 0, tail = 0, count = 0;
  for (let i = 0; i < D.points.length; i++) {
    const q = D.points[i], d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d > 24 || target && !rt.world.onRoad(q.x, q.z)) continue;
    D.local[count++] = i;
    if (d < 7 && clear(rt.army, u, p, q)) { D.parent[i] = -1; D.queue[tail++] = i; }
  }
  while (head < tail) {
    const i = D.queue[head++], a = D.points[i];
    if (!target) runnerPoint(R, a, RUNNER_TO, rt.army, u);
    if (target ? Math.hypot(a.x - target.x, a.z - target.z) < 7 && clear(rt.army, u, a, target) : RUNNER_TO.d < 1.2) {
      for (let k = i; k >= 0; k = D.parent[k]) D.route[D.length++] = k;
      for (let lo = 0, hi = D.length - 1; lo < hi; lo++, hi--) {
        const k = D.route[lo]; D.route[lo] = D.route[hi]; D.route[hi] = k;
      }
      D.index = 0;
      return D.points[D.route[0]];
    }
    for (let k = 0; k < count; k++) {
      const j = D.local[k];
      if (D.parent[j] !== -2) continue;
      const q = D.points[j];
      // 細かい地面同士は隣へだけつなぎ、遠い点への通行検査を増やさない。
      if (Math.hypot(q.x - a.x, q.z - a.z) > (i >= D.fineStart && j >= D.fineStart ? 1.1 : 7)) continue;
      if (!clear(rt.army, u, a, q)) continue;
      D.parent[j] = i; D.queue[tail++] = j;
    }
  }
  return null;
}
// 道探しが失敗した時は、実際に歩いた足跡を逆にたどる。
// 法面から本道への直線を作らず、一歩ずつ壁と足場を調べ直す。
function hieiBacktrack(rt) {
  const F = rt.flags, T = F.guideTrail, p = rt.player.u.pos;
  if (!F._gHold) {
    F.trailActive = false;
    T.checked = null;
    const last = T.count ? T.points[(T.start + T.count - 1) % T.points.length] : null;
    if (last && Math.hypot(last.x - p.x, last.z - p.z) < .6) return;
    // 転落や場所の飛び越しを、歩いて戻れる足跡として残さない。
    if (last && (Math.hypot(last.x - p.x, last.z - p.z) > 3 || Math.abs(last.y - p.y) > 1)) T.count = 0;
    const q = T.points[(T.start + T.count) % T.points.length];
    q.x = p.x; q.z = p.z; q.y = p.y;
    if (T.count < T.points.length) T.count++;
    else T.start = (T.start + 1) % T.points.length;
    return;
  }
  F.trailActive = false;
  while (T.count) {
    const q = T.points[(T.start + T.count - 1) % T.points.length];
    if (Math.hypot(q.x - p.x, q.z - p.z) < .35) { T.count--; continue; }
    // 通れない足跡の先へ印を飛ばさない。通常の道探しは引き続き行う。
    if (T.checked !== q || rt.t >= T.next) {
      T.checked = q; T.next = rt.t + .5;
      // 押し出されて最後の点が遠くなっても、近い古い点を調べる。
      // 三歩を超える点への直行は許さず、履歴は失敗時にも残す。
      T.clear = Math.hypot(q.x - p.x, q.z - p.z) <= 3
        && runnerClear(rt.army, rt.player.u, p, q);
      // 押し合いで最後の足跡だけが柱や階段の横へ隠れても、そこで戻り道を
      // 捨てない。三歩以内の古い足跡まで、壁と足場を調べ直してつなぐ。
      // 通れる点がない時は履歴を残し、半秒後に同じ範囲を調べる。
      if (!T.clear) for (let skip = 1; skip < Math.min(T.count, 8); skip++) {
        const back = T.points[(T.start + T.count - 1 - skip) % T.points.length];
        const d = Math.hypot(back.x - p.x, back.z - p.z);
        if (d < .35 || d > 3 || !runnerClear(rt.army, rt.player.u, p, back)) continue;
        T.count -= skip; T.checked = back; T.clear = true;
        break;
      }
    }
    if (!T.clear) return;
    F._gp.x = T.checked.x; F._gp.z = T.checked.z; F.trailActive = true;
    return;
  }
}
// 接敵で折れ点を通り過ぎても、古い印へ戻らない。半秒ごとに今いる道の区間を読み直す。
function hieiGuide(rt, R, key, F = rt.flags) {
  const u = rt.player.u, back = F.guideReturn;
  const D = F.guideDetour;
  // 道の上でも、次の折れへの直線が柱や法面を横切ることがある。
  // 一度選んだ迂回は折れ点に着くまで保ち、半秒後の最短投影で門へ戻さない。
  // 物陰へ退いて道を外れた後は、本道だけを使う前進の探索を続けない。
  // 先に地面を通る復帰経路へ切り替える。壁・崖の判定はそのまま守る。
  if (D.forwardKey === key && rt.world.onRoad(u.pos.x, u.pos.z)
      && Math.hypot(u.pos.x - D.goal.x, u.pos.z - D.goal.z) > .35) {
    if (rt.t >= back.t) {
      back.t = rt.t + .5;
      const q = roadClear(rt.army, u, u.pos, D.goal) ? D.goal : guideDetour(rt, R, key, F, D.goal);
      F._gHold = !q;
      if (q) { F._gp.x = q.x; F._gp.z = q.z; }
      // 接敵で別の区間へ押された時は、通れない古い角を持ち続けず現在地から選び直す。
      else D.forwardKey = null;
    }
    return;
  }
  if (D.forwardKey !== null) {
    D.forwardKey = null; D.key = null; D.length = 0; D.retry = -1; back.t = -1;
  }
  if (rt.t >= back.t || F._gKey !== key) {
    back.t = rt.t + .5; back.active = false;
    F._gKey = key;
    runnerPoint(R, u.pos, RUNNER_FROM, rt.army, u);
    // 最短の合流点が幹や塀で塞がれていても、同じ道の少し先へ戻れるか調べる。
    // 通常の投影が全て失敗した時だけ、半秒ごとに既存の入れ物で探す。
    if (!Number.isFinite(RUNNER_FROM.d)) for (let i = 1; i < R.length; i++) {
      const a = R[i - 1], b = R[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
      for (let j = 0; j <= n; j++) {
        const t = j / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        const d = Math.hypot(x - u.pos.x, z - u.pos.z);
        if (d > 20 || d >= RUNNER_FROM.d) continue;
        RUNNER_TEST.x = x; RUNNER_TEST.z = z;
        if (!roadClear(rt.army, u, u.pos, RUNNER_TEST)) continue;
        RUNNER_FROM.x = x; RUNNER_FROM.z = z; RUNNER_FROM.s = i - 1 + t; RUNNER_FROM.d = d;
      }
    }
    F._gHold = !Number.isFinite(RUNNER_FROM.d);
    if (F._gHold) {
      const detour = guideDetour(rt, R, key, F);
      if (detour) { back.x = detour.x; back.z = detour.z; back.active = true; F._gHold = false; }
    } else { F.guideDetour.length = 0; F.guideDetour.retry = -1; }
    if (F._gHold) F.guideRemaining = null;
    if (Number.isFinite(RUNNER_FROM.d)) {
      F._gI = Math.min(R.length - 1, Math.floor(RUNNER_FROM.s) + 1);
      back.x = RUNNER_FROM.x; back.z = RUNNER_FROM.z;
      // 道幅の中へ戻ったら前進を再開する。中心線まで戻し続けると、
      // 狭い道で兵を避けるたびに横向きの案内が残ってしまう。
      // 次の折れまで道を通れるかは、この下の roadClear で引き続き調べる。
      if (RUNNER_FROM.d > 2.6 || RUNNER_FROM.d > 1.2 && !rt.world.onRoad(u.pos.x, u.pos.z)) {
        back.active = true;
      }
      let left = RUNNER_FROM.d;
      const a = R[Math.floor(RUNNER_FROM.s)], b = R[F._gI];
      left += Math.hypot(b[0] - a[0], b[1] - a[1]) * (1 - (RUNNER_FROM.s % 1));
      for (let i = F._gI + 1; i < R.length; i++) left += Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]);
      F.guideRemaining = Math.round(left);
      // 自動操作も画面と同じ区間へ戻す。戦っている間に別の古い折れ点を残さない。
      F._botKey = key; F._botI = F._gI;
    }
  }
  if (F._gHold) { F._gp.x = u.pos.x; F._gp.z = u.pos.z; return; }
  while (!back.active && F._gI < R.length - 1 && Math.hypot(R[F._gI][0] - u.pos.x, R[F._gI][1] - u.pos.z) < 1.8) {
    // 角に近いだけで次の区間へ向けると、狭いつづら折りの内側を切る。
    // 次の印まで道上を歩ける時だけ角を省き、通れなければ角まで進める。
    const next = R[F._gI + 1], dx = next[0] - u.pos.x, dz = next[1] - u.pos.z;
    const d = Math.hypot(dx, dz), k = d > 7 ? 7 / d : 1;
    RUNNER_TEST.x = u.pos.x + dx * k; RUNNER_TEST.z = u.pos.z + dz * k;
    if (!rt.world.onRoad(RUNNER_TEST.x, RUNNER_TEST.z) || !roadClear(rt.army, u, u.pos, RUNNER_TEST)) break;
    F._gI++;
  }
  if (back.active) {
    // 復帰先が遠い時も目前の歩ける区間を示す。谷の向こうの一点へ矢印を飛ばさない。
    // 距離の札は本道までの全距離を保ち、歩く向きだけ四歩先に置く。
    const dx = back.x - u.pos.x, dz = back.z - u.pos.z, d = Math.hypot(dx, dz), k = d > 4 ? 4 / d : 1;
    F._gp.x = u.pos.x + dx * k; F._gp.z = u.pos.z + dz * k;
    return;
  }
  const x = R[F._gI][0], z = R[F._gI][1], dx = x - u.pos.x, dz = z - u.pos.z;
  const d = Math.hypot(dx, dz), k = d > 7 ? 7 / d : 1;
  RUNNER_TEST.x = u.pos.x + dx * k; RUNNER_TEST.z = u.pos.z + dz * k;
  const close = roadClear(rt.army, u, u.pos, RUNNER_TEST) && rt.world.onRoad(RUNNER_TEST.x, RUNNER_TEST.z);
  // 通れる土でも、折れ線の外なら法面への近道にしない。
  if (!close) {
    // 道の端から角へ直行できなくても、今いる区間の中心へは戻れる。
    // 三歩刻みの迂回探しを始める前に、既に通れると調べた合流点を使う。
    // 八十センチ以内の点は試し役が到着扱いにするので、居残る印にはしない。
    if (Math.hypot(back.x - u.pos.x, back.z - u.pos.z) > .8
        && roadClear(rt.army, u, u.pos, back)) {
      back.active = true;
      F._gp.x = back.x; F._gp.z = back.z;
      return;
    }
    D.forwardKey = key; D.key = null; D.length = 0; D.retry = -1;
    D.goal.x = x; D.goal.z = z;
    const q = guideDetour(rt, R, key, F, D.goal);
    F._gHold = !q;
    if (q) { F._gp.x = q.x; F._gp.z = q.z; }
    return;
  }
  F._gp.x = close ? RUNNER_TEST.x : x; F._gp.z = close ? RUNNER_TEST.z : z;
}
// 印は目前の折れ点へ置き、札の距離は目的地までの道のりを示す。
// 印は七歩以内なので、足元の矢印も一歩余りから出して曲がる方向を伝える。
// 道を外れた時だけ、本道へ戻る点までを数える。
function hieiGuideDistance(rt, F = rt.flags) {
  const p = rt.player.u.pos;
  if (F.guideReturn.active) return Math.hypot(F.guideReturn.x - p.x, F.guideReturn.z - p.z);
  return F.guideRemaining ?? Math.hypot(F._gp.x - p.x, F._gp.z - p.z);
}
// 道への復帰や戸口からの退出を、近いだけの敵の構え方で隠さない。
// 本人へ届く打ち込みだけは受けられるように、守りの案内を残す。
function hieiMeleeGuide(rt, enemy) {
  const F = rt.flags, p = rt.player.u;
  if (!enemy?.alive || enemy.fleeing || enemy.gone || enemy.woundOut || enemy.noTarget
    || !enemy.sidearm && (enemy.type === 'bow' || enemy.type === 'gun')) return false;
  const d = Math.hypot(enemy.pos.x - p.pos.x, enemy.pos.z - p.pos.z);
  if (Math.abs(enemy.pos.y - p.pos.y) >= 2 || rt.army.wallBetween(p.pos, p.team, enemy.pos, false)) return false;
  // 案内中の相手自身の打ち込みだけを残す。別の敵の攻撃を理由に、
  // 道の外の相手へ向き直らせない。本道へ戻る間も目前の一撃は受ける。
  const striking = enemy.target === p || enemy.atk?.target === p || enemy.swing?.target === p;
  if (d <= 3 && striking) return true;
  if (F.exitMarked || F._gHold || F.guideReturn?.active || d > 7) return false;
  // 平常時にも本道の検査を通す。近いだけの法面・別の段・室内へは誘わない。
  return rt.world.onRoad(p.pos.x, p.pos.z) && rt.world.onRoad(enemy.pos.x, enemy.pos.z)
    && !nakaRoomAt(enemy.pos.x, enemy.pos.z, enemy.pos.y)
    && roadClear(rt.army, p, p.pos, enemy.pos);
}
// 足元の印が本人や門に隠れても、短い任務札で戻る向きを読めるようにする。
// 新しい行き先は探さず、通行を調べた直近の印と画面の向きだけを使う。
function hieiReturnTask(rt, text, destination) {
  const p = rt.player.u.pos, q = rt.flags._gp;
  const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
  if (d < .35) return text;
  const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
  const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
  const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const turn = right >= 0 ? '右' : '左';
  if (forward < -d * .35) return `${turn}へ振り向き、${destination}`;
  if (Math.abs(right) > d * .65) return `${turn}へ向き、${destination}`;
  return text;
}
function stairsGuideLabel(rt) {
  const F = rt.flags;
  if (F._gHold) return '来た道の味方の旗へ戻れ';
  if (F.guideReturn.active) return '本坂の道へ戻る';
  if (near(rt.player.u, P.stairsFoot, 9)) {
    if (!guardedRoad(rt, P.stairsFoot)) return '石段の下の敵を退けよ';
    if (!F.stairsReady) return columnTask(F.akechi, '石段の下');
    return '先手と石段を登れ';
  }
  return '石段まで・道なり';
}
function hillRoad(from, to) {
  const north = from.x > 156 && from.z < -3 ? from : to.x > 156 && to.z < -3 ? to : null;
  if (north) {
    const other = north === from ? to : from;
    return other.x > 150 && other.z >= -3 ? RUNNER_NORTH_E : RUNNER_NORTH_W;
  }
  // 里坊の西へ追い出された兵も、参道を回って坂本の通りへ戻る。
  const shrine = from.x > 120 && from.z < -3 ? from : to.x > 120 && to.z < -3 ? to : null;
  const other = shrine === from ? to : from;
  return shrine ? other.x > 150 && other.z >= -3 ? RUNNER_SHRINE_E : RUNNER_SHRINE_W : RUNNER_ROAD;
}
// 退く時の帰路。山麓の参道も含め、各隊が来た道へ戻る。
function retreatPath(pos) {
  const path = hillRoad(pos, P.spawn);
  runnerPoint(path, pos, RUNNER_FROM);
  runnerPoint(path, P.spawn, RUNNER_TO);
  const from = RUNNER_FROM.s, to = RUNNER_TO.s;
  const bends = to > from ? path.slice(Math.floor(from) + 1, Math.ceil(to))
    : path.slice(Math.floor(to) + 1, Math.ceil(from)).reverse();
  return [[RUNNER_FROM.x, RUNNER_FROM.z], ...bends, [RUNNER_TO.x, RUNNER_TO.z]];
}
// 深手・組の崩れでは、敗北が決まる前から退く道を示す。道の読み直しは一秒おき。
function hieiRetreatGuide(rt) {
  const F = rt.flags, u = rt.player.u;
  if ((F.retreatGuideT ?? -1) > rt.t) return;
  F.retreatGuideT = rt.t + 1;
  const danger = u.hp <= u.maxHp * .4 || F.dangerAt !== undefined;
  if (!danger) {
    if (F.retreatPoint) { F.retreatPoint = null; rt.unmark('retreat'); }
    F.retreatRoute = null;
    return;
  }
  // 退き始めに帰路を作り、進む時と同じ幹・塀・道の折れの検査を通す。
  // 毎秒配列を作らず、前進の印とは別の入れ物で道への復帰もたどる。
  const guide = F.retreatGuide;
  if (!F.retreatRoute) { F.retreatRoute = retreatPath(u.pos); guide._gKey = null; }
  hieiGuide(rt, F.retreatRoute, 'retreat', guide);
  if (guide._gHold) {
    if (F.retreatPoint) { F.retreatPoint = null; rt.unmark('retreat'); }
    return;
  }
  if (!F.retreatPoint) {
    F.retreatPoint = guide._gp;
    rt.marker('retreat', () => rt.flags.retreatPoint, () => F.dangerAt !== undefined ? '来た道へ退く' : '道へ戻り、下がって手当て',
      { h: 2, guidePriority: 500, guideAlways: true, routeDistance: () => hieiGuideDistance(rt, guide) });
  }
}

// 共通の理由の文に、この戦だけ小さな図を添える。倒れた札ごとに一度だけ作る。
function hieiDownPicture(rt) {
  if (rt.player.u.alive) return;
  const rainMark = document.getElementById('rain-mark');
  if (rainMark) rainMark.hidden = true;
  const dialog = document.querySelector('.battle-retry');
  if (!dialog || dialog.querySelector('[data-hiei-wound]')) return;
  const h = rt.player.lastHit, known = h && (rt._downT ?? rt.t) - h.t < 6;
  const fire = known && h.kind === 'fire', fall = known && h.kind === 'fall';
  const from = known ? h.back ? '後ろ' : h.side ? '横' : '正面' : '';
  const weapon = known ? h.kind === 'gun' ? '鉄砲' : h.kind === 'arrow' ? '矢' : h.weapon === 'sword' ? '刀' : h.weapon === 'spear' ? '槍' : '打ち込み' : '';
  const label = fire ? '火で傷を負った' : fall ? '高い所から落ちた' : known ? `${from}から${weapon}` : '傷が重なった';
  const detail = known && h.mobbed ? '敵に囲まれていた' : known && (h.guardBroken || h.exhausted) ? '気力が足りなかった' : '本人から見た傷の図';
  const arrow = fire ? '<path d="M36 24 Q20 39 30 49 Q46 59 54 43 Q59 33 48 22 L44 36 Z" fill="#e38a74"/>'
    : fall ? '<path d="M14 15 H30 V42 M23 34 L30 42 L37 34"/>'
    : !known ? '<path d="M33 27 L51 45 M51 27 L33 45"/>'
    : h.back ? '<path d="M42 66 V49 M36 55 L42 49 L48 55"/>'
    : h.side ? '<path d="M75 36 H55 M61 30 L55 36 L61 42"/>'
    : '<path d="M42 6 V23 M36 17 L42 23 L48 17"/>';
  const picture = document.createElement('div'); picture.dataset.hieiWound = '';
  picture.style.cssText = 'display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:15px;line-height:1.4';
  picture.innerHTML = `<svg viewBox="0 0 80 72" role="img" aria-label="${label}。${detail}" style="display:block;width:80px;height:72px;flex-shrink:0"><g fill="none" stroke="#ece4d2" stroke-width="2"><circle cx="42" cy="30" r="5"/><path d="M42 35 V44 M34 39 H50 M42 44 L35 49 M42 44 L49 49"/></g><g fill="none" stroke="#e38a74" stroke-width="3" stroke-linejoin="round">${arrow}</g></svg><div aria-hidden="true">${label}<br>${detail}</div>`;
  dialog.querySelector('.retry-actions')?.before(picture);
}
// 横隊の持ち場が里坊や法面の中へ出た時は、歩ける参道へ寄せる。
function followSlot(i, n) {
  const want = this._followSlot(i, n), army = this._hieiArmy;
  if (this.order !== 'follow') return want;
  const q = this._followPoints[i];
  if (q.t > army.time) return q;
  q.t = army.time + 0.33; q.x = want.x; q.z = want.z;
  RUNNER_RT.world = army.world; RUNNER_RT.army = army;
  if (!runnerBlocked(RUNNER_RT, want.x, want.z)) return q;
  const u = this.units.find((o) => o.slot === i);
  if (!u) return q;
  runnerPoint(hillRoad(u.pos, want), want, RUNNER_TO);
  if (RUNNER_TO.d <= 20 && !runnerBlocked(RUNNER_RT, RUNNER_TO.x, RUNNER_TO.z)) {
    q.x = RUNNER_TO.x; q.z = RUNNER_TO.z;
  }
  return q;
}
function runnerWay(army, u, want) {
  if (u._fireJob && !u.target && !u.atk && !u.fleeing) want = u._fireJob.point;
  // 接敵中も参道を通す。敵を狙った途端に里坊や石段脇へ直進させない。
  const fighting = u.target?.alive && !u.target.isStruct && !u.fleeing && !u.group?.routed;
  if (!fighting && !u._fireJob && !u.group?.isRunner && !u.isPlayer && !(u.group?._hillPath && !u.target) && !(u.group?.isPlayerSquad && u.group.order === 'follow' && !u.target)) return want;
  const q = u._hieiWay || (u._hieiWay = { x: 0, z: 0, t: -1, active: false });
  if (q.t > army.time && (!q.active || Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 1)) return q.active ? q : want;
  q.t = army.time + 0.33; q.active = false;
  if (Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < (u._fireJob ? 19 : 14) && roadClear(army, u, u.pos, want)) return want;
  const path = hillRoad(u.pos, want);
  runnerPoint(path, u.pos, RUNNER_FROM, army, u); runnerPoint(path, want, RUNNER_TO);
  if (!Number.isFinite(RUNNER_FROM.d) || RUNNER_TO.d > 20) return want;
  q.active = true;
  if (RUNNER_FROM.d > 1.2) { q.x = RUNNER_FROM.x; q.z = RUNNER_FROM.z; return q; }
  const forward = RUNNER_TO.s > RUNNER_FROM.s;
  let i = forward ? Math.floor(RUNNER_FROM.s) + 1 : Math.ceil(RUNNER_FROM.s) - 1;
  if (i >= 0 && i < path.length && Math.hypot(path[i][0] - u.pos.x, path[i][1] - u.pos.z) < 1.2) {
    const next = i + (forward ? 1 : -1);
    // 角の手前で次へ向けると、歩ける土でも本坂の内側の法面を横切る。
    // 本人は次の区間まで道上を通れる時だけ角を省く。
    if (!u.isPlayer) i = next;
    else if (next >= 0 && next < path.length) {
      RUNNER_TEST.x = path[next][0]; RUNNER_TEST.z = path[next][1];
      if (roadClear(army, u, u.pos, RUNNER_TEST)) i = next;
    }
  }
  if (i < 0 || i >= path.length || (forward ? i > RUNNER_TO.s : i < RUNNER_TO.s)) {
    q.x = RUNNER_TO.x; q.z = RUNNER_TO.z;
  } else { q.x = path[i][0]; q.z = path[i][1]; }
  if (!(u.isPlayer ? roadClear(army, u, u.pos, q) : runnerClear(army, u, u.pos, q)) && RUNNER_FROM.d > 0.2) { q.x = RUNNER_FROM.x; q.z = RUNNER_FROM.z; }
  return q;
}

// 建物を作った後、開戦前に列の端まで当たりを調べる。人も陣形の間隔も縮めない。
function outdoorBlocked(rt, x, z) {
  if (runnerBlocked(rt, x, z)) return true;
  for (const b of BUILDINGS) {
    if (b.lite || ['romon', 'chumon', 'kairo', 'roka', 'torii', 'haka'].includes(b.kind)) continue;
    const c = Math.cos(b.rot || 0), sn = Math.sin(b.rot || 0), dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx * c - dz * sn) < b.w / 2 + .75 && Math.abs(dx * sn + dz * c) < b.d / 2 + .75) return true;
  }
  return false;
}
function placePeople(rt, g) {
  const slots = [], original = g.slotPos;
  for (const u of g.units) {
    const p = original.call(g, u.slot, g.initial), q = { x: p.x, z: p.z };
    if (outdoorBlocked(rt, q.x, q.z)) {
      let found = false;
      for (let r = 1.5; r <= 12 && !found; r += 1.5) for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8, x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
        if (outdoorBlocked(rt, x, z) || slots.some((v) => v && Math.hypot(v.x - x, v.z - z) < 1.3)
          || g.units.some((v) => v !== u && !slots[v.slot] && Math.hypot(v.pos.x - x, v.pos.z - z) < 1.3)) continue;
        q.x = x; q.z = z; found = true; break;
      }
    }
    slots[u.slot] = q;
    u.pos.set(q.x, rt.world.heightAt(q.x, q.z), q.z);
    u.mesh.position.copy(u.pos);
  }
  g.slotPos = function (i, n) {
    return this.order === 'hold' && !this.routed ? slots[i] || original.call(this, i, n) : original.call(this, i, n);
  };
}

// 火付けは近くの既存の足軽が行う。接敵・負傷・敗走を優先し、任務の成功条件には足さない。
function fireWork(rt, dt) {
  const F = rt.flags;
  for (const job of F.fireJobs) {
    if (!job.ready || job.done) continue;
    const rec = F.G.byId[job.id];
    let u = job.unit;
    if (u && (!u.alive || u.fleeing || u.woundOut || u.target || u.atk || u.stagger > 0 || rt.t - job.started > 18)) {
      u._fireJob = null; u._crouch = false; job.torch.visible = false; job.unit = u = null; job.work = 0;
    }
    if (rec.state !== 0 || F.ending) {
      if (u) { u._fireJob = null; u._crouch = false; }
      job.torch.visible = false; job.done = true; continue;
    }
    if (!u && rt.t >= job.tryT) {
      job.tryT = rt.t + 1;
      let best = 18;
      for (const g of F.oda) if (g !== F.command && !g.routed) for (const v of g.units) {
        if (!v.alive || v.type !== 'ashigaru' || v.fleeing || v.woundOut || v.target || v.atk || v._fireJob || v.isStandard) continue;
        const d = Math.hypot(v.pos.x - job.point.x, v.pos.z - job.point.z);
        if (d < best && runnerClear(rt.army, v, v.pos, job.point)) { best = d; u = v; }
      }
      if (u) {
        job.unit = u; job.started = rt.t; u._fireJob = job;
        if (u._hieiWay) u._hieiWay.t = -1;
        u.mesh.add(job.torch); job.torch.visible = true;
      }
    }
    if (!u) continue;
    if (!near(u, job.point, 1.8)) { job.work = 0; u._crouch = false; continue; }
    u.heading = Math.atan2(rec.x - u.pos.x, rec.z - u.pos.z);
    u._crouch = true; job.work += dt;
    if (job.work >= 2) {
      F.fire.ignite(rec, '放火'); u._fireJob = null; u._crouch = false;
      job.torch.visible = false; job.done = true;
      if (job.id === 'minka_5') rt.bark('坂本の町に火がかかった。北の堅田にも煙が見える');
    }
  }
}

// 民の在所と避難路。坂本の門前町・田畑、日吉社の裏山、三塔の谷道を使う。
// 坂本の暮らし：https://www.rekihaku.otsu.shiga.jp/event/jyousetsu/theme_2.html
// 八王子山：https://hiyoshitaisha.jp/faq/
// 人の配置・組み合わせと細かな道筋は推定。八王子山も史実では安全な避難先ではなかった。
const peopleRoute = (id, from = 0) => pathById(id).pts.slice(from).map(([x, z]) => ({ x, z }));
const PEOPLE_BANDS = [
  // 兵から離れた田畑・町外れで見物。東の琵琶湖へは入らず、畦沿いに南北へ逃げる。
  { x: 184, z: -38, kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'],
    route: [{ x: 184, z: -48 }, { x: 180, z: -64 }, { x: 174, z: -82 }] },
  { x: 184, z: 40, kinds: ['townsman', 'merchant', 'woman', 'child', 'farmer'],
    route: [{ x: 184, z: 50 }, { x: 180, z: 66 }, { x: 174, z: 84 }] },
  // 日吉社の裏の登路。社殿や里坊を横切らず、八王子山へ向かう。
  { x: 124, z: -43, kinds: ['monk', 'townsman', 'woman', 'child'], route: peopleRoute('hachioji', 3) },
  // 僧坊に籠もる僧と避難していた家族。段の開始でなく、兵・火の接近で逃げ出す。
  { x: 34, z: 40, mode: 'inside', kinds: ['monk', 'farmer', 'woman', 'child'], route: peopleRoute('mudoji', 3) },
  { x: -36, z: -43, mode: 'inside', kinds: ['monk', 'monk', 'woman', 'child', 'elder'], route: peopleRoute('todo_kita', 1) },
  { x: -34, z: 22, mode: 'inside', kinds: ['monk', 'farmer', 'woman', 'child'],
    route: [{ x: -34, z: 30 }, { x: -26, z: 36 }, { x: -12, z: 40 }] },
  { x: -128, z: -70, mode: 'inside', kinds: ['monk', 'woman', 'child', 'elder'], route: peopleRoute('saito_minami', 1) },
  { x: -133, z: -17, mode: 'inside', kinds: ['monk', 'monk', 'woman', 'child'], route: peopleRoute('saito_kitao') },
  { x: -116, z: -233, mode: 'inside', kinds: ['monk', 'farmer', 'woman', 'child', 'elder'],
    route: peopleRoute('kaishindani', 1) },
  { x: -80, z: -224, mode: 'inside', kinds: ['monk', 'merchant', 'woman', 'child'], route: peopleRoute('iimurodani') },
];

// 行き先・任務・残敵を、同じ持ち場から決める。道を外れた時は既存の帰路を優先する。
function hieiPost(rt) {
  const F = rt.flags;
  if (F.step <= 1) return F.hiyoDone ? P.trailhead : F.hiyoshiG?.anchor || P.trailhead;
  if (F.step === 2) return P.stairsFoot;
  if (F.step === 3) return P.monjuro;
  if (F.step === 4) return F.bell2 ? P.westGate : P.court;
  return F.step === 5 ? P.saito : P.yokawa;
}
function hieiPostRadius(F) {
  if (F.step <= 1) return F.hiyoDone ? 16 : 10;
  if (F.step === 3) return 6;
  return F.step === 2 || F.step === 4 && !F.bell2 ? 9 : 12;
}
function hieiReady(u) {
  return u?.alive && !u.gone && !u.dying && !u.woundOut && !u.fleeing && !u.noTarget && !u.group?.routed;
}
function hieiNearest(rt) {
  const F = rt.flags, me = rt.player.u.pos, post = hieiPost(rt);
  let best = null, distance = Infinity;
  for (const g of F.foes || []) {
    if (gone(g) || g.civ) continue;
    for (const u of g.units) {
      if (!hieiReady(u)) continue;
      const d = (u.pos.x - me.x) ** 2 + (u.pos.z - me.z) ** 2;
      // 奥の別の区域へ飛ばさず、今の道の敵と持ち場をふさぐ残敵から選ぶ。
      if (d > 18 * 18 && Math.hypot(u.pos.x - post.x, u.pos.z - post.z) >= 10) continue;
      if (d < distance) { distance = d; best = u; }
    }
  }
  return best;
}

const hiei_mtn = {
  missionSingleLine: true,
  hideMissionDots: true,
  hideGuideSteps: true,
  noPlayerFoot: true,
  quietMiss: true,
  enemyTriangleSigns: true,
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  noCouriers: true,
  compactMapAllies: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  missionTimeText: () => '',
  missions: ['ピンへ進め', '▼の敵をたおせ', 'ここを守れ', '味方と集まれ', '味方へ下がれ'],
  missionOf(rt) {
    const F = rt.flags;
    if (F.ending) return 3;
    if (F.dangerAt !== undefined || F.woundTask) return 4;
    if (F.exitMarked || F._gHold || F.guideReturn?.active) return 0;
    if (hieiNearest(rt)) return 1;
    return near(rt.player.u, hieiPost(rt), hieiPostRadius(F)) ? 2 : 0;
  },
  missionHeading(rt) { return this.missions[this.missionOf(rt)]; },
  // 総大将は足さず、声を担当する既存の僧兵頭を示す。退いた瞬間に印を外す。
  commanderSignTarget(rt) {
    const F = rt.flags;
    if (F.ending) return null;
    const g = F.step <= 1 ? F.hiyoshiG : F.step === 2 ? F.midG : F.step === 3 ? F.monjuG
      : F.step === 4 ? F.bell2 ? F.saitoG : F.chudoG : F.step === 5 ? F.shakadoG : F.yokawaG;
    return !gone(g) && hieiReady(g?._hieiLead) ? g._hieiLead : null;
  },
  commanderTarget(rt) {
    const u = this.commanderSignTarget(rt);
    return u && this.missionOf(rt) === 1 && hieiNearest(rt) === u ? u : null;
  },
  namedGuideTarget(rt) { return this.commanderSignTarget(rt); },
  missionSignTarget(rt) { return this.missionOf(rt) === 1 ? hieiNearest(rt) : null; },
  missionPin(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.player.u.alive) return null;
    const q = F.standardPin || (F.standardPin = { x: 0, z: 0 });
    const stage = this.missionOf(rt), post = hieiPost(rt), me = rt.player.u.pos;
    // 開戦の下知中も、本人の足元へピンを重ねず参道の入口を示す。
    let at = F.step === 0 ? pathById('hiyoshi').pts[0] : F._gp || post;
    if (Array.isArray(at)) { q.x = at[0]; q.z = at[1]; at = q; }
    q.unit = null; q.enemy = false; q.waiting = false; q.arrived = false; q.route = true;
    q.r = q.hide = .8;
    if (stage === 4 && F.retreatPoint) at = F.retreatPoint;
    if (stage === 2) {
      at = post; q.waiting = true; q.arrived = true; q.route = false; q.r = q.hide = hieiPostRadius(F);
    } else if (stage === 1) {
      const u = hieiNearest(rt);
      // 本坂の折れや堂を横切らず、通れる時だけ残敵本人へピンを移す。
      if (u && Math.abs(u.pos.y - me.y) < 2 && rt.world.onRoad(u.pos.x, u.pos.z)
        && !nakaRoomAt(u.pos.x, u.pos.z, u.pos.y) && roadClear(rt.army, rt.player.u, me, u.pos)) {
        at = u.pos; q.unit = u; q.enemy = true; q.route = false; q.r = q.hide = 2;
      }
    }
    q.x = at.x; q.z = at.z;
    return q;
  },
  bannerAllowed: (rt, text) => rt.over || !!rt.flags.ending || /討ち取|討死|勝|崩れ|鐘|火/.test(text),
  noHorse: true, // 組の編成と名のある将も徒歩にそろえ、細い本坂へ騎馬を足さない。
  // 逃げる者は追わない下知と、組を保って退く終幕に追撃の声を混ぜない。
  battleVoices: { enemy: 'tendai', lines: { ally: { rout: [
    '敵の一隊が退いた。深追いするな！',
    '敵が背を見せた。味方の列を整えよ！',
    '敵が槍を捨てた。追わず、道を押さえよ！',
  ] } } },
  compactIntro: true,
  noHorse: true, // 名のある増援と自分の騎馬組も徒歩にし、狭い本坂の視界を馬で塞がない。
  introTaskFirst: true,
  introPeopleFolded: true,
  hidePlayerSign: true, // 坂で本人から離れて見える白輪を隠し、道の印と取り違えさせない。
  noUnitContrast: true, // 具足や姿勢からずれる白い人型を重ねず、敵味方の頭上の印を残す。
  // 狭い本坂では顔・胴を別々に透かさない。視点に重なる味方だけ、
  // 既存の描画前後の仕組みで全身を避け、首や具足の内側を浮かせない。
  nearAllySolidBody: true,
  nearAllyWholeOcclusion: true,
  bodyHeightGuides: true, // 徒歩の頭の高さに印を寄せ、石段の上下で宙に離さない。
  compactDodgeGuide: true, // 狭い参道の回避先を小さな印にし、前列の兵を覆わない。
  introText: 'まず道の先の鳥居へ。味方と進む。組の兵が半分を割ると退く。逃げる者は追わない。',
  openingMoveLabel: '上になぞり 鳥居へ',
  meleeApproachText: '刀の印へなぞって進め',
  meleeGuide: hieiMeleeGuide,
  waitGuardAllowed: hieiMeleeGuide,
  navigationEnemyAllowed: hieiMeleeGuide,
  guardGuideAllowed: () => false,
  guardStartText: '敵を向き、構えよ',
  guardWaitText: '構えて攻めを防げ',
  keepDestinationTask: true,
  keepRetreatReason: true,
  // 見回しの入力だけを待って、兵と任務が止まったままにならないようにする。
  // 案内は短く残し、向きを変えた後も合戦の時計は進める。
  pauseTurnPractice: false,
  dodgeTurnDuration: 3,
  dodgeTurnInterval: 16,
  dodgeTurnLabel(rt, right, touch) {
    const turn = right ? '右' : '左';
    const goal = rt.hud.retreatGuide?.active ? '味方へむく' : '印へむく';
    return `${turn}へ${touch ? 'なぞり' : '動かし'} ${goal}`;
  },
  // 目前に敵がいる間は、進路と受け構えを先に読めるよう首取りの札を休める。
  // 討ち取りや証人の記録は残し、敵が離れれば同じ亡骸から証を納められる。
  headBlocked(rt) {
    const p = rt.player.u;
    for (const u of rt.army.units) {
      if (u.alive && u.team !== p.team && !u.civ && !u.isStruct && !u.fleeing &&
          Math.abs(u.pos.y - p.pos.y) < 2 && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 6) return true;
    }
    return false;
  },
  // 一時の退避と、組が崩れた時の撤退を言葉でも分ける。
  // 退避先・気力・損害の条件は共通の仕組みに任せる。
  coverGuidePlace: true, // 矢を避ける物陰を、本道へ戻る印や味方の旗と取り違えさせない。
  coverGuideLabel: '矢を避け、物かげへ',
  coverGuideTouchLabel: '長押しで\n物かげへ移動', // 携帯の二行の幅に収め、右端で文を切らない。
  compactGunAction: '矢だ。道なりに味方へ下がれ', // 物陰がない時も、横の法面へ飛び出さず本道を戻る。
  coverHitAllowed(rt, hit, q) {
    // 谷や僧坊の裏へ退避させない。射線・足場の共通検査に加え、
    // 本坂へすぐ戻れる道上の陰だけを使う。見つからなければ味方への退避に任せる。
    return rt.world.onRoad(q.x, q.z) && !nakaRoomAt(q.x, q.z, q.y)
      && roadClear(rt.army, rt.player.u, rt.player.u.pos, q);
  },
  // 柱の移動用の円だけでは、画面の敵の印は遮られない。
  // 鳥居の実寸と高さで測り、柱の向こうの兵を枠で透視させない。
  sightBlocked(rt, a, p, ay, by) {
    const posts = rt.flags.sightPosts;
    if (!posts) return false;
    const dx = p.x - a.x, dz = p.z - a.z, dy = by - ay, length2 = dx * dx + dz * dz;
    for (const post of posts) {
      if (post.rec.state === 2) continue;
      let low = .001, high = .999;
      if (Math.abs(dy) < .00001) { if (ay < post.bottom || ay > post.top) continue; }
      else {
        const t0 = (post.bottom - ay) / dy, t1 = (post.top - ay) / dy;
        low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1));
        if (low > high) continue;
      }
      const x = a.x - post.x, z = a.z - post.z, c = x * x + z * z - .24 * .24;
      if (length2 < .000001) { if (c <= 0) return true; continue; }
      const b = x * dx + z * dz, disc = b * b - length2 * c;
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      if (Math.max(low, (-b - root) / length2) <= Math.min(high, (-b + root) / length2)) return true;
    }
    return false;
  },
  subtleTargetFrames: true, // 狙う相手の囲みを細くし、混戦の顔や槍を覆わない。
  footFrameMinDistance: 2.5, // 石段や味方の背で視点が寄った時、足を入れようと真下を向かない。
  clampCamera(rt, camera) {
    const p = rt.player.u;
    if (rt.player.fpK >= .5 || p.naka || rt.camera.isOrthographicCamera) return;
    const dx = camera.x - p.pos.x, dz = camera.z - p.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 1.44) return;
    const length = Math.sqrt(d2), y = p.pos.y + 1.3;
    let lift = 0;
    // 手前の味方の背で画面が埋まる時は、まず頭の上へ少し目線を上げる。
    // 本人へ寄せるだけだと、列の中では別の兵の顔まで迫ってしまう。
    for (const u of rt.army.units) {
      if (u === p || !u.alive || u.gone || u.team !== p.team || u.isStruct
        || (u.pos.x - camera.x) ** 2 + (u.pos.z - camera.z) ** 2 > 6.25) continue;
      const ux = u.pos.x - p.pos.x, uz = u.pos.z - p.pos.z;
      const along = (ux * dx + uz * dz) / d2;
      const gap2 = ux * ux + uz * uz - along * along * d2;
      const radius2 = u.mounted ? 1.44 : .64;
      if (along < .5 || along > 1.15 || gap2 >= radius2) continue;
      const entry = along - Math.sqrt(Math.max(0, radius2 - gap2)) / length;
      if (entry <= 0 || entry >= 1) continue;
      const needed = y + (u.pos.y + (u.mounted ? 3.25 : 2.25) - y) / entry - camera.y;
      if (needed > 0 && needed <= 1.2) lift = Math.max(lift, needed);
    }
    camera.y += Math.min(lift, Math.max(0, p.pos.y + 4.6 - camera.y));
    const dy = camera.y - y;
    let limit = 1;
    // 視点のすぐ手前の味方だけを避ける。敵や本人の近くの兵は隠さず、
    // 材質・まとめ描き・兵の当たりも変えない。数値だけで測る。
    for (const u of rt.army.units) {
      if (u === p || !u.alive || u.gone || u.team !== p.team || u.isStruct
        || (u.pos.x - camera.x) ** 2 + (u.pos.z - camera.z) ** 2 > 6.25) continue;
      const ux = u.pos.x - p.pos.x, uz = u.pos.z - p.pos.z;
      const along = (ux * dx + uz * dz) / d2;
      const gap2 = ux * ux + uz * uz - along * along * d2;
      // 騎馬は馬体・母衣と高い頭も含める。歩兵の高さでは馬上の将が
      // 視点の目の前にいても検査を抜け、門を出る道が隠れてしまう。
      const radius2 = u.mounted ? 1.44 : .64;
      if (along <= 0 || gap2 >= radius2) continue;
      const entry = along - Math.sqrt(Math.max(0, radius2 - gap2)) / length;
      if (entry < 1.2 / length || entry >= limit) continue;
      const cy = y + dy * entry;
      if (cy < u.pos.y + .15 || cy > u.pos.y + (u.mounted ? 3.1 : 2.1)) continue;
      limit = entry;
    }
    if (limit < 1) {
      camera.x = p.pos.x + dx * limit;
      camera.y = y + dy * limit;
      camera.z = p.pos.z + dz * limit;
    }
  },
  treatmentApproachLabel: '十字の印へ下がって手当て',
  treatmentTaskGuidance: true,
  treatmentCrossSign: true,
  // 移動先の十字と札をそろえる。止血の長押しは着いてから別に案内する。
  treatmentMoveCaption(rt) {
    if (rt.flags.ending || rt.flags.dangerAt !== undefined) return hiei_mtn.retreatGuideLabel(rt, false);
    return '十字へなぞって下がる';
  },
  keepRetreatGestureReason: true, // なぞる向きの補足で、退却の秒数や下がる理由を消さない。
  // 共通の「味方から敵と逆へ四歩」だけでは、曲がる本坂の法面が候補になる。
  // 設営時に用意した道の中央も調べる。安全・護衛・通行の条件は共通の検査を通す。
  treatmentHouses(rt) {
    const F = rt.flags, p = rt.player.u.pos, nearby = F.aidNearby;
    nearby.length = 0;
    for (const stop of F.aidStops) {
      const q = stop.approach;
      if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 <= 28 * 28) nearby.push(stop);
    }
    return nearby;
  },
  // 道案内の旗と手当ての場所を区別し、着く前に「止まれ」と言わない。
  treatmentGuideLabel(rt, cue) {
    const p = rt.player;
    if (p.mounted) return '馬を降りて手当て';
    if (p.treatmentLeft <= 0) return '布を使い切った。味方の後ろへ退け';
    if (p.treatmentReady) return p.treating ? '手当てを押し続けよ' : '「手当て」を三秒長押し';
    if (p.aiming || p.draw > 0 || p.chargeT > 0) return '狙いを外し、味方の後ろへ';
    if (!cue?.valid) return '構えて、道なりに味方の後ろへ';
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius)
      return '十字の印へ下がって手当て';
    if (p.treatmentNext > rt.t) return `ここで待て。手当てまであと${Math.ceil(p.treatmentNext - rt.t)}秒`;
    return 'ここで止まれ。敵が離れたら手当て';
  },
  // 試し役も画面と同じ、安全と道筋を検査した場所へ向かう。
  botTreatmentPoint(rt) {
    const cue = rt.hud.retreatDestination(rt, null, true);
    return cue?.valid && hiei_mtn.botRetreatStepAllowed(rt, cue) ? cue : null;
  },
  compactRetreatSign: true, // 近い兵を覆わない小さな退避の旗と矢印を使う。
  compactFloorGuides: true, // 近い視点で画面の三分の一を超える退避の輪は畳む。
  compactDestinationSign: true, // 狭い本坂で、行き先の旗と輪が前列の兵を覆わない大きさにする。
  singleDestinationArrow: true, // 道の角の矢印へ、足元からの別の矢印を重ねない。
  directionalDestinationArrow: true, // 見えている道の角へ向け、常に下を指す印にしない。
  compactFieldGuides: true, // 任務札の指の大きな絵を畳み、なぞる向きは字で残す。
  retreatForLimbWounds: false, // 止血後の足・腕のけがだけでは、登る任務を退避の札へ替え続けない。
  keepWoundRetreatReason: true,
  keepRetreatReason: true, // 出血や深手で下がる時も、行き先と理由を歩数で消さない。
  // 手で遊ぶ時の退避の印にも、道外へ下り続けない共通の道筋検査を使う。
  retreatPathAllowed(rt, point) {
    // 途中の復帰の一歩と、止まって休む場所は分ける。
    // 道へ近づいていても、法面や僧坊の中を退避先にはしない。
    return hieiRestPoint(rt, point)
      && !nakaRoomAt(point.x, point.z, groundAt(rt.world, point.x, point.z, rt.player.u.pos.y))
      && hiei_mtn.botRetreatStepAllowed(rt, point);
  },
  retreatPointAllowed(rt, point) {
    return hiei_mtn.botRetreatStepAllowed(rt, point);
  },
  retreatGuideLabel(rt, reached) {
    const F = rt.flags;
    if (F.ending) return reached ? '組を待ち、来た道へ退け' : '組と来た道へ退け';
    if (F.dangerAt !== undefined) return `組${F.lossAlive}人。${Math.max(0, Math.ceil(10 - (rt.t - F.dangerAt)))}秒後に退く`;
    const cue = rt.hud.retreatGuide;
    if (cue?.active && cue.valid && cue.treatment) return hiei_mtn.treatmentGuideLabel(rt, cue);
    // 出血の状態は命の札に出る。ここは移動と手当ての操作だけを伝える。
    if (rt.player.u.wounds?.bleed > .0001) return reached ? '止まって「手当て」を長押し' : '道なりに味方の後ろへ';
    if (rt.player.u.hp < rt.player.u.maxHp * .3) return reached ? '味方の後ろで手当て' : '味方の後ろへ下がれ';
    if (F.lossInitial > 0 && F.lossAlive * 3 <= F.lossInitial * 2) return `組は${F.lossAlive}人。味方の旗へ戻れ`;
    if (rt.player.u.mobbed) return reached ? '味方と囲みを抜けよ' : '囲みを出て、味方へ';
    if (rt.player.sta < 20) return reached ? '止まって息を整えよ' : '息切れ。道の印で休め';
    if (!rt.world.onRoad(rt.player.u.pos.x, rt.player.u.pos.z)) return '道へ戻り、味方へ下がれ';
    if (rt.t < (rt.retreatUntil || 0)) return reached ? '味方の後ろで構えよ' : '打たれた。構えて味方へ';
    return reached ? '味方の後ろで構えよ' : '道なりに味方の後ろへ';
  },
  // 民は描画専用。兵の名簿・人数・当たり・戦功には入れない。形と材質は共通の民で使い回す。
  civilianCrowd: { bounds: { minX: -278, maxX: 196, minZ: -278, maxZ: 278 }, bands: PEOPLE_BANDS },
  immediateTaskChanges: true, // 組の損害と退くまでの秒数は、携帯の「今」の札にもすぐ出す。
  // 山岳版の段で判じる。旧版の「二段目は門前」で石段への下知を消さない。
  // 共通の表示時の検査にも使い、待ち列に残った古い行き先を読ませない。
  speechAllowed(rt, speaker, text) {
    if (speaker !== '明智光秀' && speaker !== '組頭' && speaker !== '使番') return true;
    const F = rt.flags;
    // 終幕で消した待ち列とは別に、使番や予約に残った前進の下知も止める。
    if (F.ending) return /務めは終わりじゃ|先手が持たぬ|刃向かわぬ者を討って/.test(text);
    // 退避・道への復帰中は、同じ段の古い「進め」「列を待て」を重ねない。
    if ((F.dangerAt !== undefined || F.woundTask || F.exitMarked || F._gHold || F.guideReturn?.active)
      && /進め|登れ|登るぞ|抜ける|開け|退けよ|守れ|待て|合流|前を詰め|押さえ|道へ続け|釈迦堂の前へ/.test(text)) return false;
    if (F.step >= 2 && /鳥居.*(?:進め|抜ける|開け|退け)|登り口.*(?:守れ|待て|進め|登るぞ)/.test(text)) return false;
    if (F.step >= 3 && /石段の下.*(?:退け|守れ|待て|合流)|石段へ進め|細道じゃ/.test(text)) return false;
    if (F.step >= 4 && /門の守りを退け|門の前.*(?:退け|守れ|待て)|先手がそろえば門を抜ける/.test(text)) return false;
    if (F.bell2 && /根本中堂の前.*(?:進め|退け|守れ|待て|合流)|本人の組は本道へ続け/.test(text)) return false;
    if (F.step >= 5 && /道の入口.*(?:押さえ|退け|守れ|待て)|西の道の入口へ進め/.test(text)) return false;
    if (F.step >= 6 && /釈迦堂の前|西の道が開いた/.test(text)) return false;
    // 同じ段でも守りを退けた後は、済んだ戦いへ呼び戻さない。
    if (F.hiyoDone && /鳥居の前を抜ける|鳥居.*敵を.*退けよ/.test(text)) return false;
    if (/敵を.*退けよ|門の守りを退けよ/.test(text)) {
      const point = /鳥居/.test(text) ? F.hiyoshiG.anchor
        : /登り口/.test(text) ? P.trailhead : /石段の下/.test(text) ? P.stairsFoot
          : /門の前|門の守り/.test(text) ? P.monjuro : /横川中堂/.test(text) ? P.yokawa
            : /中堂の前/.test(text) ? P.court
            : /道の入口/.test(text) ? P.westGate : /釈迦堂/.test(text) ? P.saito : null;
      if (point && guardedRoad(rt, point)) return false;
    }
    // 同じ段でも、届くまでに列がそろったり敵が来たりする。古い待機の声を止める。
    if (/列を待て|列がそろえば|後ろの兵が着いて|後ろの列と合流/.test(text)) {
      const point = F.step === 1 ? P.trailhead : F.step === 2 ? P.stairsFoot
        : F.step === 3 ? P.monjuro : F.step === 4 ? F.bell2 ? P.westGate : P.court
          : F.step === 5 ? P.saito : P.yokawa;
      const radius = F.step === 1 ? 16 : F.step === 2 ? 9 : F.step === 3 ? 6
        : F.step === 4 && !F.bell2 ? 9 : 12;
      const arrivalRadius = F.step <= 1 || F.step === 3 || F.step === 4 && !F.bell2 ? 10 : 12;
      if (!near(rt.player.u, point, radius) || !guardedRoad(rt, point)
        || arrived(F.akechi, point, arrivalRadius)) return false;
    }
    return true;
  },
  keepTaskLabel: true, // 近い一人の敵の札で、本道を進む下知を置き換えない。
  keepTaskPanel: true, // 接敵しても、山道の任務を「この敵をたおす」だけへ替えない。
  keepCombatTaskHeading: true, // 携帯の接敵操作でも、鳥居・本坂などの行き先を残す。
  keepTaskWithGuard: true, // 構えている間も、鳥居や登り口へ進む下知を残す。
  keepGuardTaskLabel: true, // 狙う一人へ任務札を動かさず、道の行き先を保つ。
  arrivalLabel: '印のそば',
  distanceText: () => '',
  taskLabel(rt) { return this.missionHeading(rt); },
  rangeCueClearCenter: true, // 兵に届く札は、照準と気力の輪の下へ避ける。
  spacedCombatCues: true, // 気力と間合いの札を照準から離し、狙う兵の顔を空ける。
  reserveCombatCues: true, // 道の印も、照準や間合いの札を避けて置く。
  botOrders: true, // 道・木戸・供・退き口は、この戦の下知に従う。
  groundStandards: true, // 急な山道でも、隊旗の竿の根を地形に合わせて直立させる。
  // 狭い山道で前の僧兵に囲まれても、重なった槍で一息に倒れない（桶狭間・森部・志賀と同じ受けの猶予）。矢と火は別の危険として残す。
  meleeGrace: { rate: 0.009, burst: 0.08, interval: 1.2 },
  spawn: { x: P.spawn.x, z: P.spawn.z, heading: -Math.PI / 2 },
  // 身の回りの当時の場（timeslip_field.js）。元亀二年九月十二日は今の九月末。山の参道は乾き、焼け打ちの灰が地を這う。
  // 登り口・文殊楼・中門・根本中堂の前に、僧兵の捨てた笠と矢、折れた枝。急な山腹と湖には置かない。
  timeslip: {
    wet: 0, dust: 0.7, trample: 0.2, debris: 1, arrows: 0.7, branches: 0.08,
    grass: 0x8a9458, grassTints: [0xffffff, 0xe0e4c0, 0xc8c89a], grassH: 0.95, tallGrass: 0.6,
    flagColors: [0xe6dfcc, 0x24211e, 0xd8d2c2],
    maxSlope: 0.25,
    fights: [[P.trailhead.x, P.trailhead.z, 26], [P.monjuro.x, P.monjuro.z, 26], [P.court.x, P.court.z, 30], [P.chudo.x, P.chudo.z, 26], [P.saito.x, P.saito.z, 26]],
  },
  // 低い踏石は近くで透かす。段ごとのカメラ押し上げ・毎コマの全段検査は要らない。
  world: {
    seed: 15710,
    // 現在の比叡山でも畳・襖・須弥壇を堂内の光へ揃える。材質は全棟で共有する。
    interiorMaterial: hieiRoomMaterial,
    moveLim: 280,           // この戦だけ：横川六谷の奥（z≈-268）まで。本道の掃討条件は変えない。
    time: 'day',
    mist: false,           // 当日の霧は不明。煙は建物の火から生じる。山の上は森と霞に隠れて見えない（P1）
    smokeFogFloor: 60,     // 火の煙は残し、鳥居と目前の石段まで白い壁にしない。
    gunHazeScale: .55,     // 狭い参道の六挺の硝煙は、小さく短く流す。
    hazeColor: 0x99958b,
    noArrowRain: true,     // 三人の弓から数十本を追加しない。実際に射る矢の攻撃と遮蔽は残す。
    noHorse: true,         // 軍勢の自動乗馬も止める。狭い本坂は供・新手とも徒歩で登る。
    autumn: true,          // 旧暦九月
    wind: [-0.86, -0.4],   // 当日の風向は不明。復元の湖から山へ吹き上げる風（火は西・北西へ広がる）
    muddy: 0.15,
    terrainTriangles: true, // 急な本坂でも、足と描く地面を同じ三角面に置く。
    terrainContactView: true, // 近い視点の四隅と中央も描く直前に地面の上へ戻し、斜面の裏を映さない。
    keepTerrainGrid: true, // 携帯でも描く地面を足場と同じ格子にし、石段・斜面の食い違いや土・足の浮きを防ぐ。
    prepareTerrain: hieiRoadGround,
    terrainContactFalls: true, // 坂を下る途中の高さの遅れを床と取り違えず、倒れた胴を実際の土へ下ろす。
    slopeContactFalls: true, // 寝た胴の真下で支え、坂の下側へ亡骸が浮くのを抑える。
    groundedFalls: true,
    settleSideFalls: true, // 横斬りでひねった体も、倒れ切る時は肩から地へ寝かせる。
    settleFallenLimbs: true, // 携帯の遠い骨の兵も、倒れ切った肘・膝を坂へ下ろす。
    slopeLitter: true,      // 落ちた笠・長柄も坂へ沿わせる。
    longitudinalSpearFalls: true, // 柄の実際の両端で坂を測り、中央の法線で長柄を宙へ跳ね上げない。
    terrainTags: true,     // 急斜面・石段・細道・森で速さと疲れが変わる（terrain_tags.js）
    climbTan: 1.4,         // 山の斜面は遅く疲れるが、道の外も登れる（崖ほどの所だけ登れない。法面や森に閉じ込めない）
    maxWalkDrop: 1.2,      // 列を避ける横歩きや後ずさりで法面を下り続けず、石段と山道で下る。
    blockedHint: () => '足が止まったら、道の印へ向き直れ。崖は下りず、道をたどれ',
    // 世界の道は折れ線のまま、半幅も渡す。谷道を一律の広い道として判じない。
    paths: PATHS.map((p) => Object.assign(p.pts.slice(), { w: p.w, lv: p.lv, hist: p.hist })),
    moveWay: runnerWay,
    runnerWay,
    treePadMul: 1.1,       // 杉林は残し、携帯の視点にも道の両脇の枝がかぶらない空きを取る。
    cedarBoughs: true,     // 杉の樹冠を枝ごとの房にし、縦に長い葉の幕を作らない。
    cedarBoughPitch: 1.3,  // 葉房を枝に沿って寝かせ、梢から裾へ連なる板の輪郭を崩す。
    cedarBoughWidth: 1.1,
    roundNeedles: true,    // 板の葉ではなく、立体の針葉の段を使う。低画質にも残す。
    layeredNeedles: true,  // 枝の中段を張らせ、まっすぐな円錐の縁を崩す。形は林で共用する。
    raggedNeedles: true,   // 杉の枝先を不揃いにし、積んだ円錐の直線を崩す。
    brokenNeedleTiers: true, // 既存の垂れ枝の形を共用し、葉の段の平らな底を開く。
    keepNeedleLayers: true, // 作った杉の段を残す。少ない段を全部抜いて八面体に替えない。
    branchTrees: true,
    softFarNeedles: true,
    roundedFire: true,     // 既存の丸い火の舌を使い、三角の板に見える輪郭を抑える。
    groundedSlopeRocks: true, // 斜面の岩を地面へ沈め、宙に浮く底を見せない。
    curvedRockTufts: true, // 岩際の黒い三角の草を、既存の短く曲がる葉へ替える。
    litRockTufts: true,    // 根草の裏にも空の光を残し、黒い刃に見せない。
    slopeForest: .85,
    stableSlopeGrain: true, // 法線が曲がる山すそでも、土と草の斑を細い縞へ潰さない。
    height,
    clear: onFlat,
    water: { x: 198, level: 0.4 },   // 琵琶湖（坂本の東）
    // 日吉社の前を流れる大宮川。川筋・幅は縮尺に合わせた推定。
    // 出典：https://hiyoshitaisha.jp/faq/ 。参道の渡りは下で床も作る。
    streams: [{ pts: [[116, -20], [132, -15], [146, -15], [158, -19], [180, -25], [199, -29]], w: .8, depth: .5 }],
    tint(x, z, h, c) {
      if (x > 128 && Math.abs(z) < 34) return;                        // 坂本の里と田畑
      if (x < -24 && x > -66 && z > -24 && z < 13) { c.lerp({ r: 0.56, g: 0.53, b: 0.46 }, 0.5); return; }   // 中庭の白い砂
      c.setRGB(c.r * 0.8, c.g * 0.88, c.b * 0.78);                    // 杉の山は暗く
    },
    trees: 1500,
    nearCedarBranches: true, // 杉全体を縦長の交差板へ戻さず、共用の枝房と遠景用の粗い房を使う。
    tufts: 2600,
    treeDensity: (x, z) => (x > 128 && Math.abs(z) < 40 ? 0.04 : x < -10 && x > -90 && z > -45 && z < 25 ? 0.3 : 1),
    sugiAt: (x, z) => (x > -12 && x < 118 && Math.abs(z) < 40 ? 0.9 : x < -10 ? 0.55 : 0.2),
    // 追加の木立は道・平場の空きを無視して置かれるため使わない。通常の杉林で囲む。
    // 逃げる僧兵と人々は、山の奥（西）や谷、横川より先の山中へ消える
    fleeOut: (x, z, team) => team === 1 && (x < -240 || Math.abs(z) > 245),
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    hieiFarBoundary(W);
    timeslipField(rt);   // 身の回りの参道の灰・捨てた笠と矢（def.timeslip）
    F.aidStops = []; F.aidNearby = [];
    for (const path of PATHS) {
      if (path.lv > 2) continue;
      for (let s = 0; s <= path.L; s += 3) {
        const q = pathPoint(path, s);
        F.aidStops.push({ approach: { x: q.x, z: q.z } });
      }
    }
    // 斜めに少しずつ下ると、一歩の落差だけでは急な法面へ出られてしまう。
    // 道から急斜面へ踏み出すのを止め、押し出された後は本道へ戻す。
    const canStep = rt.player.canStep;
    // 道案内の通行検査からも呼ばれる。外側で使っている投影点を上書きしない。
    // 入れ物は設営時に一度だけ作り、歩くたびには増やさない。
    const stepPoint = { x: 0, z: 0 }, stepFrom = { d: 0 }, stepTo = { d: 0 };
    rt.player.canStep = function (x0, z0, x, z, y) {
      if (!canStep.call(this, x0, z0, x, z, y)) return false;
      if (W.onRoad(x, z)) return true;
      // 堂の床と外階段には、下の土とは別の足場がある。
      // 土の勾配だけで重ねて止めると、共通の検査を通った退出の一歩まで
      // 法面扱いになり、階段の途中で本道へ戻れなくなる。
      // 段差・転落の検査は上で済ませ、実際に拾える足場の上だけを通す。
      if (groundAt(W, x, z, y) > W.heightAt(x, z) + .05
        || groundAt(W, x0, z0, y) > W.heightAt(x0, z0) + .05) return true;
      const slope = W.slopeTan(x, z);
      // 兵の登坂限界（一・四）を本人の横歩きにも使うと、五十度の法面へ
      // 少しずつ進めてしまう。道外は三十五度ほどまでにし、石段は上で通す。
      // 斜面から緩い尾根へ一歩出る時も、本道から離れる方向には進ませない。
      if (slope <= .7 && W.slopeTan(x0, z0) <= .7) return true;
      // 兵に押されて道の縁を出た後も、横歩きで急斜面の奥へ進ませない。
      // 既に斜面にいる時は、本道へ近づく歩みと横によける歩みを残す。
      // 勾配の増減だけで止めると、道へ戻る途中の小さな起伏で閉じ込める。
      if (W.onRoad(x0, z0)) return false;
      const path = hillRoad(this.u.pos, this.u.pos);
      stepPoint.x = x0; stepPoint.z = z0;
      runnerPoint(path, stepPoint, stepFrom);
      stepPoint.x = x; stepPoint.z = z;
      runnerPoint(path, stepPoint, stepTo);
      return stepTo.d <= stepFrom.d + .000001;
    };
    // 帰路では本人が下りられる斜面も使う。壁や木の検査は共通のまま。
    rt.army.hieiGuideWorld = Object.create(W);
    rt.army.hieiGuideWorld.def = { ...W.def, climbTan: Infinity };
    rt.army.hieiGuidePlayer = rt.player;
    // 日陰の斜面にも空の光を回し、草と道の色を残す。この戦の昼だけ。
    const lookOf = W.lookOf.bind(W);
    W.lookOf = key => {
      const look = lookOf(key);
      if (key === 'day') { look.hemiGround.setHex(0x79745b); look.hemiI = Math.max(look.hemiI, 1.8); }
      return look;
    };
    // 地面を網目に抜かず、共通の視点の退避で斜面を避ける。この戦の材質だけ。
    W.terrain.material.userData.camNearSolid = true;
    hieiSpeech(rt);
    monkSoldiers(rt);
    hieiFallenHats(rt);
    F.step = 0; F.ek = 0; F.ak = 0; F.foes = [];
    F.t0 = rt.t; F._gp = { x: P.spawn.x, z: P.spawn.z };
    F.guideReturn = { x: 0, z: 0, active: false, t: -1 };
    F.guideTrail = { points: Array.from({ length: 128 }, () => ({ x: 0, z: 0, y: 0 })), start: 0, count: 0 };
    F.trailActive = false;
    rt.marker('hiei-backtrack', () => !F.ending && !F.exitMarked && F.trailActive ? F._gp : null, '歩いて来た道へ戻る',
      { h: 1.2, guidePriority: 550, guideAlways: true, guideNear: .35 });
    F.guideDetour = makeGuideDetour();
    F.retreatGuide = { _gp: { x: 0, z: 0 }, guideReturn: { x: 0, z: 0, active: false, t: -1 }, guideDetour: makeGuideDetour() };
    F.botRetreatGoal = { x: 0, z: 0 };
    F.exitWay = { x: 0, z: 0, y: 0 }; F.exitLocal = { x: 0, z: 0 }; F.exitInterior = null;
    // 黒い屋根の前でも札を見分けられる下地と縁。この戦を離れたら外す。
    const plaque = F.missionPlaque = document.createElement('style');
    plaque.textContent = `#hud #objectives { background: #2c2821 !important; opacity: 1 !important; box-shadow: inset 0 0 0 1px #c2a25a !important; }
      html body #hud #battle-notices:not(.choosing) #objectives.keep-guard-task:not(.expand):not([hidden]):not(.notice-muted) {
        display:block !important; background:#2c2821 !important; padding:8px !important;
        box-shadow:inset 0 0 0 1px #c2a25a !important;
        position:relative !important; inset:auto !important; width:100% !important;
        min-width:0 !important; max-width:100% !important;
      }
      html body #hud #battle-notices:not(.choosing) #objectives.keep-guard-task:not(.expand) #obj-list {
        display:block !important;
      }
      html body #hud #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
        position:relative !important; inset:auto !important; width:100% !important;
        min-width:0 !important; max-width:100% !important;
      }
      /* 記号用の列へ本文が押し込まれないよう、今の任務は本文一段で組む。 */
      html body #hud #battle-notices #objectives:not(.expand) li.cur {
        display:block !important; width:100%; min-width:0; box-sizing:border-box;
      }
      html body #hud #battle-notices #objectives:not(.expand) li.cur .tag { display:none !important; }
      /* 構え方と山道の行き先は別の下知なので、一緒に残す。 */
      html body #hud #battle-notices:not(.choosing) #objectives.has-action:not(.keep-guard-task):not(.expand):has(.battle-action:not([hidden])) #obj-list {
        display:none !important;
      }
      html body #hud #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-full {
        display:none !important;
      }
      html body #hud #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
        display:block !important; width:auto !important; min-width:0; max-width:100%; white-space:normal !important; overflow-wrap:anywhere !important;
        word-break:normal !important; overflow:visible !important; text-overflow:clip;
      }
      html body #hud #battle-notices #objectives:not(.expand) li.cur .obj-now {
        font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; line-height:1.4 !important;
      }
      @media (min-height:501px) {
        /* 共通の「任務あり」の上端配置より優先し、小地図との重なりを防ぐ。 */
        html body #hud #battle-notices:not(.choosing),
        html body #hud.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
          left:auto !important; right:calc(208px + env(safe-area-inset-right, 0px)) !important;
          top:104px !important; width:min(320px, 30vw) !important; max-height:calc(100% - 304px) !important;
        }
        html body #hud #battle-notices:not(.choosing) > :is(#objectives,#battle-message,#tutorial,#banner,#situation,#skiphint) {
          position:relative !important; inset:auto !important; transform:none !important;
          width:100% !important; height:auto !important; min-width:0; max-width:100% !important;
          box-sizing:border-box; flex:0 0 auto; max-height:none !important;
        }
      }
      @media (min-width:601px) and (max-height:500px) {
        html.touch #hud #battle-notices:not(.choosing),
        html.touch.tc-low #hud #battle-notices:not(.choosing),
        html.touch body #hud.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
          left:calc(76px + env(safe-area-inset-left, 0px)) !important;
          right:auto !important;
          width:min(300px, 36vw) !important;
          max-height:33vh !important;
        }
        /* 本文・前列の人数・距離の三段を切らない。戦場を空けるため補足は畳む。 */
        html.touch body #hud #battle-notices:not(.choosing) #objectives:not(.expand) {
          height:auto !important; max-height:none !important; overflow:visible !important;
          padding:8px !important; box-sizing:border-box;
        }
        html.touch body #hud #battle-notices #objectives:not(.expand) li.cur small:not(.goal-place) {
          display:none !important;
        }
      }
      /* 稲生の標準：戦中は右上のミッション一行だけ。行き先の横に同じ下知の札を重ねない（10/23）。 */
      html:root body #hud.prog-on.mission-only #battle-notices:not(.choosing):has(#obj-list) > #objectives:not(.expand) {
        display:none !important;
      }`;
    document.head.appendChild(plaque);
    const dispose = rt.dispose.bind(rt);
    rt.dispose = () => {
      rt.player.canStep = canStep;
      plaque.remove();
      document.getElementById('rain-mark')?.remove();
      return dispose();
    };

    // ---- 伽藍・坂本・本坂の建物（まとめて描く。史実の確度の札つき） ----
    const G = F.G = new HieiHallGaran(rt);
    for (const b of BUILDINGS) G.build(b);
    F.valleyWays = VALLEYS.map((v) => pathById(v.path));
    for (const p of F.valleyWays) {
      const v = VALLEYS.find((q) => q.path === p.id);
      if (v.dist !== 'yokawa') continue; // 新しい分岐に固い灯籠を増やして、本道の列を塞がない。
      G.lantern(p.pts[0][0] + 1.5, p.pts[0][1], v.dist);
    }
    // 三塔の山道・各堂の入口にも石段。寺なので城の切岸・堀・石垣は足さない。
    for (const p of PATHS) G.stairs(p, pathPoint, { minG: .32, dist: p.id.startsWith('entry_') ? BUILDINGS.find((b) => 'entry_' + b.id === p.id).dist : p.id === 'todo' ? 'todo' : 'path' });
    G.roadDetail(pathById('sakamoto'));
    G.roadDetail(pathById('honzaka'));
    // 現在の石橋を元亀二年へ写さず、参道の渡りを木橋として推定復元。
    // 板を一つの形から複製して伽藍へまとめ、足の床も同じ傾きにする。
    const bridge = G.build({ id: 'omiya_bridge', name: '大宮川の木橋', kind: 'landscape', x: 0, z: 0, w: 1, d: 1, dist: 'sakamoto', lite: true, noBurn: true, hist: 'GAME_C' });
    const ax = 146, az = -10, bx = 142, bz = -18;
    const ya = W.heightAt(ax, az) + .08, yb = W.heightAt(bx, bz) + .08;
    const length = Math.hypot(bx - ax, bz - az), rise = yb - ya;
    const plank = new THREE.BoxGeometry(3.6, .22, Math.hypot(length, rise) / 12 - .015);
    const tilt = -Math.atan2(rise, length), turn = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i < 12; i++) {
      const t = (i + .5) / 12, g = plank.clone();
      g.rotateX(tilt); g.rotateY(turn);
      g.translate(ax + (bx - ax) * t, ya + rise * t - .11 - bridge.y0, az + (bz - az) * t);
      G.add(bridge, 'plain', paintGeo(g, i % 3 ? 0x71604a : 0x63513e));
    }
    plank.dispose();
    addRamp({ ax, az, bx, bz, w: 3.6, ya, yb });
    // 坂本の東の田畑。区画・畦・色は当時の近江の里として推定し、湖の手前に留める。
    const fields = G.build({ id: 'sakamoto_fields', name: '坂本の田畑', kind: 'landscape', x: 0, z: 0, w: 1, d: 1, dist: 'far', lite: true, noBurn: true, hist: 'GAME_C' });
    for (const z of [-38, -28, 28, 38]) {
      const g = new THREE.PlaneGeometry(12, 7, 3, 2); g.rotateX(-Math.PI / 2); g.translate(184, 0, z);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, W.heightAt(pos.getX(i), pos.getZ(i)) - fields.y0 + .03);
      g.computeVertexNormals(); G.add(fields, 'plain', paintGeo(g, 0x8b8749));
      for (const offset of [-3.5, 0, 3.5]) {
        const ridge = new THREE.BoxGeometry(12, .12, .18); ridge.translate(184, W.heightAt(184, z + offset) - fields.y0 + .06, z + offset);
        G.add(fields, 'plain', paintGeo(ridge, 0x665c3b));
      }
    }
    for (const [x, z] of [[-6, -9.5], [-6, -2.5], [-23, -8.5], [-23, -1.5], [-34, -8.5], [-34, -1.5], [144, -2], [144, 8]]) G.lantern(x, z, x > 100 ? 'sakamoto' : 'todo');
    // 『耶蘇会士日本通信』所収のフロイスの焼き討ち報告：戦乱で僧坊が減り、谷々に残ったという。
    // 紹介：https://nihonsizatugaku.net/hieizan/
    // 旧跡との照合：https://www.jstage.jst.go.jp/article/aija/91/841/91_646/_pdf
    // 数と位置は確定できない。本道脇の礎石は、この戦より前の荒廃を表す推定の景色。
    // 礎石も角の欠けた石を使う。規格の四角い箱を斜面へ並べない。
    const stone = stoneStepGeo(0.55, 0.24, 0.55, 1571);
    for (const [i, x, z] of [[0, 82, -9], [1, 68, -13], [2, 54, -10]]) {
      const rec = G.build({ id: 'old_sobo_' + i, kind: 'sobo_ato', x, z, w: 4, d: 3, dist: 'path', lite: true, noBurn: true, hist: 'HIST_B' });
      rec.top = 0.3;
      for (const dx of [-1.8, 0, 1.8]) for (const dz of [-1.2, 1.2]) {
        const g = stone.clone(); g.translate(dx, W.heightAt(x + dx, z + dz) - rec.y0 + 0.05, dz);
        G.add(rec, 'plain', paintGeo(g, 0x77746b));
      }
    }
    stone.dispose();
    hieiCampaignScenery(G, W);
    // 焼失の明確な痕跡がある山上の堂は根本中堂と大講堂。
    // 他の堂まで確実に焼けた景色にせず、坂本の火と二堂の煙を主にする。
    // 八王子山の焼き討ちは史料にあるが、避難先を守れた史実としては扱わない。
    for (const r of G.recs) if (r.x < 128 && r.id !== 'konponchudo_1571' && r.id !== 'daikodo_old') r.noBurn = true;
    // 登山中の着火から境内の任務まで炎・煙の面を保つ。共通の火を使い、数は増やさない。
    // 大きな二堂だけ燃焼を長くし、四百八十秒の打ち切りと終幕より先に消さない。
    for (const id of ['konponchudo_1571', 'daikodo_old']) G.byId[id].dur = 540;
    G.finish();
    // 鳥居は横木だけに当たりがある。柱にも本能寺と同じ軽い箱を付け、視点を寄せる。
    // 兵の通行の当たりはそのまま。形と材質は伽藍の物を使い回す。
    F.sightPosts = [];
    for (const r of G.recs) if (r.kind === 'torii' && !r.lite) {
      for (const side of [-1, 1]) {
        const p = new THREE.Mesh(G.proxyGeo, G.proxyMat);
        p.position.set(side * r.w / 2, 0, 0).applyMatrix4(r.M);
        const bottom = W.heightAt(p.position.x, p.position.z) - .3;
        const top = r.y0 + 4.6, h = top - bottom;
        F.sightPosts.push({ rec: r, x: p.position.x, z: p.position.z, bottom, top });
        p.position.y = bottom + h / 2; p.scale.set(.6, h, .6); p.rotation.y = r.rot || 0;
        p.userData.camBlock = true; p.matrixAutoUpdate = false; p.updateMatrix();
        rt.scene.add(p); r.cameraParts.push(p);
      }
    }
    // 古い無限の視線で堂の屋根まで薄くせず、手前の柱・軒だけを下の処理で抜く。
    hieiGaranLook(rt, G, true);
    F.nearMesh = hieiNearLook(rt, G);
    F.interiorLooks = G.recs.filter(r => r.naka).map(r => r.naka);
    F.fire = makeTempleFire(rt, G, {
      onIgnite: (r) => {
        if (r.kind === 'chudo') F.chudoFire = true;
        battleEvent(rt, EVENT_FIRE_START, r, null, 1, r.kind === 'chudo', `${r.name}に火がかかった`);
      },
      onBurnt: (r) => { if (r.kind === 'shoro') rt.bark(`${r.name}が焼け落ちた`); },
    });
    const shaftGeo = new THREE.CylinderGeometry(.045, .055, .7, 5);
    const flameGeo = new THREE.ConeGeometry(.1, .28, 5);
    const shaftMat = new THREE.MeshLambertMaterial({ color: 0x594329 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb04a });
    F.fireJobs = ['minka_5', 'konponchudo_1571', 'daikodo_old'].map((id) => {
      const b = G.byId[id], entry = pathById('entry_' + id);
      const p = entry ? entry.pts[entry.pts.length - 1] : [b.x + Math.sin(b.rot || 0) * (b.d / 2 + 1.6), b.z + Math.cos(b.rot || 0) * (b.d / 2 + 1.6)];
      const torch = new THREE.Group(), shaft = new THREE.Mesh(shaftGeo, shaftMat), flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.y = .45; torch.add(shaft, flame); torch.position.set(.35, 1, .35); torch.visible = false;
      return { id, point: { x: p[0], z: p[1] }, torch, ready: false, done: false, work: 0, tryT: 0, unit: null };
    });
    // 一時の逆茂木（戦の時だけの物。GAME_C）：文殊楼の石段の上に二つ。真ん中は道
    // 枝先は寄せ手のいる東へ。中央の参道へ長い枝を横切らせない。
    for (const z of [-11.2, -.8]) rt.scene.add(sakamogi(W, -10, z, Math.PI / 2, 3.2));

    // ---- 織田勢：明智光秀の手（自分の持ち場）と鉄砲。坂本のまわりに大軍（軽い作り） ----
    // 坂本の通りに整列する。背後へ振り直すと民家の裏から道へ戻れなくなる。
    F.akechi = allyGroup(rt, { faction: 'oda', fixed: true, noRout: true, name: '明智の先手', anchor: { x: 158, z: 1 }, facing: -Math.PI / 2, width: 3, aggro: 9, formation: 'column', colW: 2 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }], ODA));
    F.command = allyGroup(rt, { faction: 'oda', fixed: true, fullStrength: true, noGuard: true, name: '明智光秀と供の衆', anchor: { x: 174, z: 6 }, facing: -Math.PI / 2, width: 2, formation: 'column', colW: 2, aggro: 4, seekRange: 8, guard: true, guardSight: 12, guardLeash: 3, noRing: true, noRout: true },
      dress([{ type: 'samurai', n: 2 }, { type: 'busho', n: 1, o: { name: '明智光秀', invuln: true, horse: false } }, { type: 'samurai', n: 2 }], ODA));
    F.akeU = F.command.units.find((u) => u.name === '明智光秀');
    F.command.leader = F.akeU;
    F.akechi._command = F.command;
    F.teppo = allyGroup(rt, { faction: 'oda', fixed: true, name: '明智の鉄砲組', anchor: { x: 160, z: 9 }, facing: -Math.PI / 2, width: 3, aggro: 5, formation: 'line' }, dress([{ type: 'gun', n: 6 }], ODA));
    F.oda = [F.akechi, F.teppo, F.command];
    for (const g of F.oda) { g.defMult = 1; g.dmgMult = 1; }
    const n = RANKS[rt.G.rank].squad || 0;
    if (n) rt.makeSquad({ x: P.spawn.x - 3, z: P.spawn.z + 3 }, -Math.PI / 2, [{ kind: 'spear', n }]);
    // 組を持たぬ足軽は、自分が属する明智の先手を数える。距離や士気では負けにしない。
    F.lossUnits = rt.squad.length ? rt.squad.slice() : F.akechi.units.slice();
    F.lossInitial = F.lossUnits.length;
    const DA = (x, z, w, d, count, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing: -Math.PI / 2, armor: 0x2b3140, flagTex: flagTexture(flag), seed });
    [[176, -26, 'oda'], [178, 30, 'eiraku']].forEach(([x, z, f], i) => DA(x, z, 22, 10, 160, f, 1571 + i));
    // 三井寺の山岡景猶の屋敷に置いた本陣。南の遠景に置き、坂本の先手と分ける。
    // 座標と幕の形は推定。遠い本陣へ任務や開始位置を移さず、登山の筋は保つ。
    const headquarters = jinmaku({ heightAt: (x, z) => W.farH(x, z) }, 90, 570, 24, 18, 6, { mon: 'oda', solid: false });
    headquarters.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.userData.camBlock = false; } });
    rt.scene.add(headquarters);
    DA(90, 592, 22, 10, 160, 'oda', 1573);

    // ---- P1 山麓：日吉社の鳥居の前の神人と僧兵、里坊の弓 ----
    // 鳥居前の守りは持ち場で応戦する。平地用の回り込み・退却で里坊の裏へ移さない。
    F.hiyoshiG = this.foe(rt, { name: '日吉社の神人と僧兵', noAI: true, anchor: { x: 146, z: -7 }, facing: Math.PI / 2, width: 7, aggro: 12, morale: 75, fleeDir: { x: -1, z: -0.6 } },
      [...dress([{ type: 'ashigaru', n: 4 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'ashigaru', n: 3 }], LAY)]);
    F.satoboBow = this.foe(rt, { name: '里坊の僧兵（弓）', anchor: { x: 134, z: -5 }, facing: Math.PI / 2, width: 4, aggro: 10, morale: 60, fleeDir: { x: -1, z: -0.3 } }, dress([{ type: 'bow', n: 3 }], SOHEI));

    F.akechi2 = allyGroup(rt, { faction: 'oda', fixed: true, name: '煙に迷う明智の兵', anchor: { x: 180, z: 7 }, facing: -Math.PI / 2, width: 2, aggro: 10, formation: 'column', colW: 2, order: 'hold', seekRange: 12 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }], ODA));
    F.akechi2.defMult = 1; F.akechi2.dmgMult = 1;
    F.oda.push(F.akechi2);
    for (const g of F.oda) g.historicalOrders = true;
    this.preparePeople(rt);
    for (const g of F.foes) placePeople(rt, g);
    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.banner('比叡山の麓・坂本', '鳥居の前の守りを退け、山への道を開く');
    rt.obj('main', '道の先の鳥居へ進め', 'main');
    rt.obj('civ', '刃向かわぬ者（僧・里の者）は討つな', 'side');
    rt.say('明智光秀', `${nm(rt)}、鳥居の前を抜ける。先手とともに道を開け`, 4);
    rt.after(5, () => { if (!F.ending && F.step < 2) rt.say('明智光秀', '槍を向ける者だけを退けよ。逃げる僧や里の者は追うな', 4); });
    rt.marker('ake', unitPos(F.akeU), '明智光秀', {});
    // 任務の「鳥居」と印の「日吉社」が食い違っても、開戦の矢印を鳥居へ向ける。
    rt.marker('hiyoshi', { x: 148, z: -4 }, '鳥居・日吉社', { h: 3, guidePriority: 250, groundGuide: true });
    rt.after(6, () => { if (rt.phase === 'brief') this.p1(rt); });
  },

  preparePeople(rt) {
    const F = rt.flags;
    // 山道の上から三組・三十人。本道の折れを通して下り、毎コマ兵を作らない。
    F.upperFoes = [8, 13, 18].map((i) => {
      const [x, z] = pathById('honzaka').pts[i];
      const g = this.foe(rt, { name: '山道を下る僧兵', anchor: { x, z }, facing: Math.PI / 2, width: 2, aggro: 10, morale: 80, formation: 'column', colW: 2 },
        dress([{ type: 'ashigaru', n: 9 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI));
      g.order = 'hold';
      // 接近した折れへ二つだけ下る。全組を登り口まで下ろして後尾へ重ねない。
      g._downRoad = pts('honzaka', Math.max(0, i - 2), i - 1).reverse();
      return g;
    });
    // つづら折りの下の道に僧兵、上の折れに弓（上から射る）
    F.sw1 = this.foe(rt, { name: 'つづら折りの僧兵', anchor: { x: 83, z: 9 }, facing: Math.PI / 2, width: 4, aggro: 10, morale: 70, formation: 'yari', fleeDir: { x: -1, z: -0.4 } },
      [...dress([{ type: 'ashigaru', n: 4 }], SOHEI), ...dress([{ type: 'ashigaru', n: 1 }], LAY)]);
    F.sw1Bow = this.foe(rt, { name: '折れの上の僧兵（弓）', anchor: { x: 74, z: -13 }, facing: Math.PI / 2, width: 4, aggro: 12, morale: 60, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'bow', n: 3 }], SOHEI));
    // 中腹の小堂：僧兵・神人・具足を着けた山の衆の鉄砲が混じる
    F.midG = this.foe(rt, { name: '中腹の小堂の衆', anchor: { x: 42, z: -8 }, facing: Math.PI / 2, width: 6, aggro: 12, morale: 75, fleeDir: { x: -1, z: -0.2 } },
      [...dress([{ type: 'ashigaru', n: 3 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'ashigaru', n: 2 }], LAY), ...dress([{ type: 'gun', n: 1, o: { hat: 'jingasa' } }], REM)]);
    // 文殊楼の守り（石段の上）と、門の内の武装した山の衆。鐘が鳴ると集まる
    F.monjuG = this.foe(rt, { name: '文殊楼の僧兵', anchor: { x: -9, z: -6 }, facing: Math.PI / 2, width: 5, aggro: 8, morale: 85, formation: 'yari', fleeDir: { x: -1, z: 0.2 } },
      dress([{ type: 'ashigaru', n: 5 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI));
    F.monjuBow = this.foe(rt, { name: '文殊楼脇の弓', anchor: { x: -16, z: -11 }, facing: Math.PI / 2, width: 4, aggro: 12, morale: 70, fleeDir: { x: -1, z: -0.2 } }, dress([{ type: 'bow', n: 3 }], SOHEI));
    F.remG = this.foe(rt, { name: '武装した山の衆', anchor: { x: -22, z: -3 }, facing: Math.PI / 2, width: 4, aggro: 8, morale: 90, fleeDir: { x: -1, z: 0.3 } },
      dress([{ type: 'samurai', n: 3, o: { hat: 'kabuto' } }, { type: 'gun', n: 1, o: { hat: 'jingasa' } }], REM));
    F.mudojiG = this.foe(rt, { name: '無動寺谷の伏兵', anchor: { x: 46, z: 20 }, facing: -Math.PI / 2, width: 4, aggro: 14, morale: 70, fleeDir: { x: 0.2, z: 1 } }, dress([{ type: 'ashigaru', n: 4 }, { type: 'bow', n: 2 }], SOHEI));
    // 東塔の中の守り（先に置いておく。鐘で集まった衆）
    F.chudoG = this.foe(rt, { name: '根本中堂の前の僧兵', formation: 'yari', anchor: { x: -40, z: -7 }, facing: Math.PI / 2, width: 6, aggro: 12, morale: 95, fleeDir: { x: -1, z: -0.4 } },
      dress([{ type: 'samurai', n: 1, o: { weapon: 'spear' } }, { type: 'ashigaru', n: 6 }], SOHEI));
    F.courtBow = this.foe(rt, { name: '廻廊の弓', anchor: { x: -36, z: -10 }, facing: Math.PI / 2, width: 4, aggro: 12, morale: 70, fleeDir: { x: -1, z: -0.4 } }, dress([{ type: 'bow', n: 3 }], SOHEI));
    F.kodoG = this.foe(rt, { name: '大講堂の僧兵', anchor: { x: -46, z: -27 }, facing: Math.PI / 2, width: 6, aggro: 10, morale: 85, fleeDir: { x: -1, z: -0.6 } },
      [...dress([{ type: 'ashigaru', n: 4 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'ashigaru', n: 2 }], LAY)]);
    F.saitoG = this.foe(rt, { name: '西塔からの加勢', anchor: { x: -100, z: -31 }, facing: Math.PI / 2, width: 4, aggro: 12, morale: 85, fleeDir: { x: -1, z: -0.3 } },
      [...dress([{ type: 'ashigaru', n: 4 }], SOHEI), ...dress([{ type: 'samurai', n: 2, o: { hat: 'kabuto' } }], REM)]);
    // にない堂（常行堂・法華堂）周辺の森の伏せ。東塔より道が狭く、森が深い（25章）
    F.ninaidoG = this.foe(rt, { name: 'にない堂の僧兵', formation: 'yari', anchor: { x: -110, z: -44 }, facing: Math.PI / 2, width: 4, aggro: 11, morale: 78, fleeDir: { x: -1, z: -0.3 } },
      [...dress([{ type: 'ashigaru', n: 4 }], SOHEI), ...dress([{ type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI)]);
    // 釈迦堂の守り（西塔の中心）
    F.shakadoG = this.foe(rt, { name: '西塔・釈迦堂の僧兵', anchor: { x: -124, z: -44 }, facing: Math.PI / 2, width: 5, aggro: 12, morale: 92, formation: 'yari', fleeDir: { x: -1, z: -0.4 } },
      [...dress([{ type: 'ashigaru', n: 5 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'gun', n: 1, o: { hat: 'jingasa' } }], REM)]);
    F.saitoBow2 = this.foe(rt, { name: '西塔の弓', anchor: { x: -125, z: -52 }, facing: Math.PI / 2, width: 3, aggro: 11, morale: 65, fleeDir: { x: -1, z: -0.3 } }, dress([{ type: 'bow', n: 2 }], SOHEI));
    // 横川までの長い尾根道にも、既存の八人のうち四人を分ける。
    // 人数は増やさず、小集団の抵抗を途中にも置く。配置は遊びの復元。
    F.yokawaRoadG = this.foe(rt, { name: '横川への尾根道の僧兵', anchor: { x: -106, z: -124 }, facing: 0, width: 2, aggro: 10, morale: 70, formation: 'column', fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'ashigaru', n: 3 }, { type: 'bow', n: 1 }], SOHEI));
    F.yokawaG = this.foe(rt, { name: '横川中堂の僧兵', anchor: { x: -94, z: -215 }, facing: 0, width: 5, aggro: 12, morale: 90, formation: 'yari', fleeDir: { x: 0, z: -1 } },
      [...dress([{ type: 'ashigaru', n: 2 }, { type: 'samurai', n: 1, o: { weapon: 'spear' } }], SOHEI), ...dress([{ type: 'bow', n: 1 }], SOHEI)]);
    for (const [x, z] of [[12, -19], [16, 4]]) {
      const g = this.foe(rt, { name: '杉林の僧兵', anchor: { x, z }, facing: Math.PI / 2, order: 'hold', ambush: true, seekRange: 16, width: 3, aggro: 12, morale: 70, fleeDir: { x: -1, z: 0 } }, dress([{ type: 'ashigaru', n: 3 }], SOHEI));
      F.ambG = (F.ambG || []).concat(g);
    }
  },

  foe(rt, o, list) {
    // 山道と堂の前に置く守りは、カメラの背後へ振り直さない。
    // 振り直すと坂本では湖際、東塔では根本中堂の当たりの中に出てしまう。
    const g = enemyGroup(rt, { faction: 'enryakuji', order: 'hold', dmgMult: 1, seekRange: 16, formation: list.every((q) => q.type === 'bow' || q.type === 'gun') ? 'line' : 'column', colW: 2, ...o, fixed: true }, list);
    rt.flags.foes.push(g);
    const lead = g.units.find((u) => u.type === 'samurai');
    if (lead) {
      g._hieiLead = lead;
      lead.name = o.name.replace(/(?:の神人と僧兵|の前の僧兵|の僧兵|の衆)$/, '') + 'の僧兵頭';
    }
    return g;
  },
  // ===== P1 山麓：坂本の里に火がかかる。日吉社の前を抜け、本坂の登り口へ =====
  p1(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t; F.smokeCall = false; F.t1 = rt.t;
    rt.setPhase('climb');
    sfx('horagai', 0.85);
    rt.unmark('ake');
    rt.obj('main', '先手と鳥居へ進み、守りを退けよ', 'main');
    rt.marker('hiyoshi', () => F._gHold ? null : F._gp, () => shrineGuideLabel(rt),
      { h: 2, guidePriority: 250, guideAlways: true, guideNear: 1.2, routeDistance: () => hieiGuideDistance(rt) });
    // 鳥居の手前で長い一列を止めず、参道へ先手を入れる。
    // 山道へ移る時は walk が一列に戻す。兵数や攻撃力は変えない。
    walk(F.akechi, [[150, 5], [148, -6]], 2.6, (q) => attackFrom(q, 16));
    F.akechi.colW = 2;
    // 供まで先手と同じ鳥居の足元へ詰めず、光秀は通りで後続を指揮する。
    // 登山へ移ると、先手に続く従来の道順へ戻る。
    walk(F.command, [[166, 6], [158, 5]], 2.4, undefined, true);
    walk(F.teppo, [[154, 8], [152, 7]], 2.4);
    rt.after(8, () => {
      // 堅田は北の湖側の遠景。距離を縮めず、煙一本で放火の合図を表す（位置は推定）。
      const W = rt.world;
      W.addSmokeColumn(190, W.farH(190, -520) + 3, -520, { size: 3 });
      F.fireJobs[0].ready = true;
    });
    rt.after(30, () => { if (F.fire.ignite('hiyoshi_honden')) rt.say('足軽', '……日吉の社にまで火を', 3); });
    rt.after(10, () => { if (!F.ending && F.step === 1 && !gone(F.hiyoshiG)) rt.say('日吉社の僧兵頭', '鳥居の前で踏みとどまれ！　里の者を山へ逃がせ！', 3); });
  },

  // ===== P2 登山：狭い山道・つづら折り・杉林。小さな抵抗。鐘・叫び・前の煙 =====
  p2(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t; F.smokeCall = false;
    rt.unmark('hiyoshi');
    rt.banner('本坂', '狭い山道を登る。上から射られるぞ');
    rt.obj('main', '本坂を登り、道をふさぐ者を退けよ', 'main');
    // 本坂の上に見える煙は山上の二堂の火から来る。登山中から見せ場を作る。
    for (const id of ['konponchudo_1571', 'daikodo_old']) {
      F.fire.ignite(F.G.byId[id], '山上の堂への火');
      const job = F.fireJobs.find((j) => j.id === id); job.done = true;
    }
    for (const [x, z, size] of [[56, -8, 3.6], [8, -16, 4]]) rt.world.addSmokeColumn(x, rt.world.heightAt(x, z) + 8, z, { size });
    F.fire.tick(0.5);
    // 上の三組は接近した時に順に下ろす。先に短い道を下り切って待たせない。
    F.nextDownT = rt.t;
    rt.marker('stairs', () => F._gHold ? null : F._gp || P.stairsFoot, () => stairsGuideLabel(rt), { h: 2, guidePriority: 250, guideAlways: true, guideNear: 1.2, routeDistance: () => hieiGuideDistance(rt) });
    // 登り口へ着いた先頭を坂本へ引き返させない。遅れた兵の道順は walk が引き継ぐ。
    walk(F.akechi, pts('honzaka', 0, 19), 2.5, (q) => { q.order = 'hold'; q.aggro = 12; });
    walk(F.akechi2, [[170, 7], [158, 5], [146, 4], [134, 3], ...pts('honzaka')], 2.4);
    walk(F.teppo, [[138, 4], ...pts('honzaka', 0, 12)], 2.4);
    // 無動寺谷への分かれ道（別ルート・退き道・伏兵の谷）：本道を外れて谷へ下りれば、僧兵の伏兵が待つ
    rt.marker('mudoji', P.branch, '谷への分かれ道・任務は本道', { h: 2 });
    rt.after(14, () => {
      if (F.ending || F.step !== 2) return;
      rt.say('明智光秀', near(rt.player.u, P.stairsFoot, 9)
        ? !guardedRoad(rt, P.stairsFoot) ? '石段の下の敵を退けよ。味方と槍をそろえよ' : '石段の下を守れ。後ろの列と合流するぞ'
        : '谷へ下るな。道の印に沿って石段へ進め', 4);
    });
    rt.say('明智光秀', '細道じゃ。一人ずつ、前を詰めて登れ', 4);
  },

  // 中腹の平場に着いた：東塔の鐘が鳴り、前に煙が上がる（東谷に火が上がる）
  bellTodo(rt) {
    const F = rt.flags;
    if (F.bell1) return;
    F.bell1 = true;
    ringBell(rt, F.G.byId.todo_shoro);
    rt.banner('東塔の鐘が鳴る', '山の上の僧兵が集まってくる');
    rt.army.play('eshout', { x: -10, z: -6 }, 1.2);
    for (const g of [F.monjuG, F.monjuBow, F.remG]) if (g) { g.aggro = 13; g.morale = Math.min(100, g.morale + 10); }
  },

  // 杉林の伏せ：狭い道の両側の木の間から
  ambush(rt) {
    const F = rt.flags;
    if (F.amb) return;
    F.amb = true;
    for (const g of F.ambG) if (!gone(g)) attackFrom(g, 16);
    rt.army.play('eshout', { x: 12, z: -8 }, 1.4);
    rt.bark('杉林から僧兵が！', true);
  },

  // ===== P3 文殊楼：石段の上の楼門。ここで初めて東塔の大伽藍が見える =====
  p3(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    rt.unmark('mudoji');
    F.step = 3; F.stepT = rt.t; F.smokeCall = false;
    rt.unmark('stairs');
    this.bellTodo(rt);
    rt.banner('文殊楼', '石段の上の楼門。東塔の入口');
    rt.obj('main', '文殊楼の守りを退け、先手と門を抜けよ', 'main');
    rt.marker('monju', () => F._gHold ? null : F._gp, () => rallyGuideLabel(rt, P.monjuro, 6, '門の前', '文殊楼へ・道なり'), { h: 2, guidePriority: 250, guideAlways: true, guideNear: 1.2, routeDistance: () => hieiGuideDistance(rt) });
    walk(F.akechi, pts('honzaka', 19, 22), 2.5, (q) => attackFrom(q, 30));
    walk(F.teppo, [...pts('honzaka', 12, 18)], 2.4, (q) => { q.order = 'hold'; q.anchor = { x: 6, z: -10 }; });
    rt.after(6, () => { if (!F.ending) F.fireJobs[1].ready = true; });
    rt.army.play('eshout', P.monjuro, 1.5);
    rt.say('文殊楼の僧兵頭', '鐘を聞いた者は門へ！　この石段を渡すな！', 3);
    rt.after(4, () => { if (!F.ending && F.step === 3) rt.say('明智光秀', '門の守りを退けよ。先手がそろえば門を抜ける', 3); });
  },

  // ===== P4 根本中堂の周り：燃える堂の間を掃討。逃げ惑う人々と煙に混乱する味方 =====
  p4(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t; F.smokeCall = false;
    this.roadOpened(rt, 'monjuHand', '文殊楼の道を開いた', '道が開いた。先手と根本中堂の前へ進め');
    rt.unmark('monju');
    rt.banner('東塔へ入る', '根本中堂の火。堂の間を逃げる人々');
    rt.obj('main', '根本中堂の前へ進め。手向かう者を退けよ', 'main');
    rt.objProgress('main', '根本中堂の前へ');
    rt.marker('court', () => F._gHold ? null : F._gp, () => rallyGuideLabel(rt, P.court, 9, '中堂の前', '根本中堂の前へ・道なり'), { h: 2, guidePriority: 250, guideAlways: true, guideNear: 1.2, routeDistance: () => hieiGuideDistance(rt) });
    walk(F.akechi, pts('todo', 0, 3), 2.5, (q) => attackFrom(q, 30));
    walk(F.teppo, pts('honzaka', 18, 22), 2.4, (q) => { q.order = 'hold'; q.anchor = { x: -18, z: -8 }; });
    // 煙で道を見失った味方。救い出しの任務にはしない
    walk(F.akechi2, [...pts('todo', 0, 1), [-19, -9], ...pts('todo_n', 1, 2)], 2.3);
    F.lostT = rt.t + 8; F.lostN = 0;
    if (!F.monjuHand) rt.say('明智光秀', '門を抜けた。先手と根本中堂の前へ進め', 4);
    rt.after(8, () => { if (!F.ending) F.fireJobs[2].ready = true; });
    if (hi(rt) && F.akechi2 && !gone(F.akechi2)) rt.choose('後ろの味方の隊をどこへ回す？', [
      { label: '本道の列を支える', note: '本人は先手と本道を掃討する' },
      { label: '南谷の道を押さえる', note: '既存の別手だけを回す。逃げる人は追わない' },
    ], (i) => {
      if (F.ending || F.step !== 4 || i !== 1 || gone(F.akechi2)) return;
      F.valleyOrder = true;
      walk(F.akechi2, [[-19, -9], [-18, -1], ...pts('todo_s', 1)], 2.2);
      rt.say('明智光秀', '別手は南谷の口を押さえよ。本人の組は本道へ続け。逃げる者は追うな', 4);
    }, 12);
  },

  // 西塔の鐘：別の地区が警戒し、西塔から加勢が来る（P5 の入口）
  bellSaito(rt) {
    const F = rt.flags;
    if (F.bell2) return;
    F.bell2 = true; F.westT = rt.t;
    walk(F.akechi, [[-30, -5], [-24, -5], [-19, -9], ...pts('todo_n', 1), ...pts('saito', 1, 4)], 2.3);
    walk(F.teppo, [[-19, -9], ...pts('todo_n', 1), ...pts('saito', 1, 4)], 2.2);
    ringBell(rt, F.G.byId.saito_shoro, { rapid: true });
    rt.banner('西塔の鐘が鳴る', '西の山道から加勢が来る');
    rt.unmark('court');
    rt.obj('main', '燃える東塔を抜け、西塔へ続く山道を掃討せよ', 'main');
    rt.marker('west', () => F._gHold ? null : F._gp || P.westGate, () => rallyGuideLabel(rt, P.westGate, 12, '西の道の入口', '西塔への山道・道なり'), { h: 2, guidePriority: 250, guideAlways: true, guideNear: 1.2, routeDistance: () => hieiGuideDistance(rt) });
    walk(F.saitoG, [[-96, -30], [-86, -27], [-76, -21]], 2.6, (q) => attackFrom(q, 28));
    rt.say('明智光秀', '西から加勢が来る！　道の入口を押さえ、後ろの列を通せ', 4);
    rt.after(6, () => { if (!F.ending && F.step === 4 && !gone(F.saitoG)) rt.say('西塔の僧兵頭', '西塔へは通さぬ！　山道を押し返せ！', 3); });
  },

  // ===== P6 西塔：浄土院を抜け、にない堂の森を経て釈迦堂へ。密林・建物間の狭い戦い（19〜25章） =====
  p6(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5; F.stepT = rt.t; F.smokeCall = false;
    this.roadOpened(rt, 'westHand', '西塔へ続く道を開いた', '道が開いた。浄土院の脇から釈迦堂の前へ進め');
    rt.unmark('west');
    rt.banner('西塔へ', '浄土院を過ぎ、森の深い谷間へ入る');
    rt.obj('main', '浄土院の脇を通り、釈迦堂の前の敵を退けよ', 'main');
    rt.marker('west', () => F._gHold ? null : F._gp, () => rallyGuideLabel(rt, P.saito, 12, '釈迦堂の前', '釈迦堂の前へ・道なり'), { h: 2, guidePriority: 250, guideAlways: true, routeDistance: () => hieiGuideDistance(rt) });
    F.jodoinShown = false;
    walk(F.akechi, pts('saito', 4), 2.3, (q) => attackFrom(q, 24));
    walk(F.teppo, pts('saito', 4, 7), 2.1);
    if (!F.westHand) rt.say('明智光秀', '西の道が開いた。浄土院の脇を通り、釈迦堂の前へ', 4);
    rt.after(16, () => { if (!F.ending && F.step === 5) rt.bark(rallyProgress(rt, P.saito, 12, '釈迦堂の前', '印に沿って釈迦堂へ進め')); });
  },

  // ===== P7 横川：西塔からさらに北へ長い山道。横川中堂への山道を掃討する（26〜32章） =====
  p7(rt) {
    const F = rt.flags;
    if (F.step >= 6) return;
    F.step = 6; F.stepT = rt.t; F.smokeCall = false;
    rt.unmark('shakado'); rt.unmark('jodoin'); rt.unmark('west');
    rt.banner('横川へ', '長い山道の先、北の山中へ入る');
    rt.obj('main', '横川中堂の前で守りを退け、先手と合流せよ', 'main');
    rt.marker('yokawa', () => F._gHold ? null : F._gp, () => rallyGuideLabel(rt, P.yokawa, 12, '横川中堂の前', '横川中堂の前へ・道なり'), { h: 2, guidePriority: 250, guideAlways: true, routeDistance: () => hieiGuideDistance(rt) });
    walk(F.akechi, pts('yokawa'), 2.2, (q) => attackFrom(q, 24));
    rt.say('明智光秀', '北の尾根道を進め。横川中堂の前で合流じゃ。逃げる者は追うな', 4);
    rt.marker('valley', { x: -90, z: -216 }, '六谷への逃げ道・掃討は本道', { h: 2 });
  },

  // 開いた道へ既存の味方が進む時だけ、本人と配下の働きを記録する。
  // 守りを倒すたびに台詞を積まず、戦功と士気の変化を山場の突破にそろえる。
  roadOpened(rt, hand, label, line) {
    const F = rt.flags;
    if (!F[hand] || F[hand + 'Done']) return;
    F[hand + 'Done'] = true;
    // この場の光秀の声が褒め言葉も兼ねる。共通の褒め言葉を重ねない。
    rt.praiseT = rt.t;
    rt.award((t) => t.side.push(label), label);
    for (const g of F.oda) if (!gone(g)) g.morale = Math.min(100, g.morale + 8);
    rt.say('明智光秀', `${nm(rt)}、${line}`, 4);
  },

  win(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('retreat'); F.retreatPoint = null;
    rt.unmark('mudoji');
    for (const id of ['hiei-exit', 'hiyoshi', 'trail', 'stairs', 'monju', 'court', 'kodo', 'chudoG', 'west', 'jodoin', 'shakado', 'yokawa', 'valley']) rt.unmark(id);
    rt.objDone('main');
    if (!F.civHurt) {
      rt.objDone('civ');
      rt.award((t) => t.side.push('非戦の者を討たなかった'), '逃げる者を追わず、務めを終えた');
    }
    rt.objRemove('danger');
    rt.objRemove('hiei-wound'); F.woundTask = false;
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '燃える山道を掃討した', pts: 22 }; }, '任務達成・山道を掃討した');
    sfx('kane', 0.5);
    rt.banner('任務を果たした', why || '燃える山道の掃討を終え、味方が後を引き継いだ');
    // 戦闘中に待ち列へ入った声を終幕へ持ち越さず、引き継ぎと語りの間を空ける。
    rt._sayGate = rt.t;
    rt.hud.subQ.length = 0; rt.hud.subT = 0;
    rt.say('明智光秀', `${nm(rt)}、務めは終わりじゃ。後の隊に道を渡し、ここで組をまとめよ`, 4);
    rt.after(4.5, () => rt.say('語り', '信長公記は、八王子山へ逃れた僧や里の人々も、多くが命を落としたと記す', 5));
    rt.after(10, () => rt.say('語り', '焼き討ちの後、光秀は志賀郡を与えられた。次は東へ。武田信玄が動き出す', 5));
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true }, 16);
  },

  lose(rt) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end');
    for (const id of ['hiei-exit', 'mudoji', 'hiyoshi', 'trail', 'stairs', 'monju', 'court', 'kodo', 'chudoG', 'west', 'jodoin', 'shakado', 'yokawa', 'valley']) rt.unmark(id);
    rt.objRemove('civ');
    rt.objRemove('danger');
    rt.objRemove('hiei-wound'); F.woundTask = false;
    rt.objFail('main'); rt.tracker.main = false;
    rt.banner('山道を押し通せず', `組の戦える者が半分を割った（${F.lossAlive}人／${F.lossInitial}人）。坂本へ退く`);
    rt._sayGate = rt.t;
    rt.hud.subQ.length = 0; rt.hud.subT = 0;
    rt.say('明智光秀', '先手が持たぬ。組を離さず、来た山道を下がれ', 4);
    // その段の短い道筋だけでなく、坂本までつながる道を戻す。
    // 各隊の位置から折れを選び、登りの残りの下知は捨てる。
    const back = retreatPath(rt.player.u.pos);
    rt.marker('retreat', { x: back[1][0], z: back[1][1] }, '来た山道へ退く', { h: 3 });
    for (const g of new Set([...F.oda, ...rt.squadGroups])) if (!gone(g)) {
      g.retreatOnly = true;
      walk(g, retreatPath(g.anchor), 2.2, null, true);
      for (const u of g.units) if (u.alive && !u.fleeing && !u.gone) {
        u.target = null; u.watch = null; u.aiT = 0;
      }
    }
    rt.player.u.invuln = true; rt.finish({ scriptedEnd: true, failureReason: `組の戦える者が半分を割った（${F.lossAlive}人／${F.lossInitial}人）` }, 9);
  },

  update(rt, dt) {
    const F = rt.flags;
    hieiClock = rt.t;
    hieiDownPicture(rt);
    for (const I of F.interiorLooks) if (I.mesh && !I.hieiNearFixed) {
      // 紙窓や灯明はそのまま。壁・梁・家具だけ、本人を隠す至近の部分を抜く。
      I.mesh.traverse(m => {
        if (m.isMesh && !Array.isArray(m.material) && !m.material.transparent) F.nearMesh(m);
      });
      I.hieiNearFixed = true;
    }
    const hall = F.G?.byId.konponchudo_1571?.naka;
    if (hall?.mesh && !hall.hieiLightFixed) {
      // 窓の光を描く三枚の平面は、堂の外から灰色の板に見えるため外す。
      // 室内が初めて作られた時だけ調べ、灯明や共通の材質は変えない。
      hall.mesh.traverse((m) => {
        if (m.isMesh && m.geometry.type === 'PlaneGeometry' && m.material.blending === THREE.AdditiveBlending) m.visible = false;
      });
      hall.hieiLightFixed = true;
    }
    monkNearHeads(rt);
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    if (F.fire) F.fire.tick(dt);
    if (F.fireJobs) fireWork(rt, dt);
    // 鳥居へ歩き出したら先手も動く。下知の六秒が終わるまで待たせない。
    if (!F.ending && F.step === 0 && rt.phase === 'brief' && rt.player.u.alive
      && rt.player.u.pos.x < P.spawn.x - 2) this.p1(rt);
    if (F.ending || F.step < 1 || !rt.player.u.alive) { rt.unmark('hiei-exit'); return; }
    hieiRetreatGuide(rt);
    if (!F.lossReady) {
      F.lossReady = true;
      if (rt.squad.length) F.lossUnits = rt.squad.slice();
      F.lossInitial = F.lossUnits.length;
    }
    for (const g of rt.squadGroups) if (!g._followSlot) {
      g._followSlot = g.slotPos; g._hieiArmy = rt.army;
      g._followPoints = Array.from({ length: g.initial }, () => ({ x: 0, z: 0, t: -1 }));
      g.slotPos = followSlot;
    }
    const u = rt.player.u;
    // 道しるべ：任務の印は、道筋（本坂・東塔の小道）の少し先の点に置く（斜面や森へまっすぐ向かわせない）
    {
      const R = routeFor(F), key = F._routeKey;
      hieiGuide(rt, R, key);
      hieiBacktrack(rt);
    }
    const exit = hieiExitWay(rt);
    if (exit) {
      F._gp.x = exit.x; F._gp.z = exit.z;
      if (!F.exitMarked) {
        F.exitMarked = true;
        rt.marker('hiei-exit', F.exitWay, '戸口から本道へ戻る', { h: 1.2, guidePriority: 600, guideAlways: true });
        rt.bark('戸口の印から外へ出て、本道へ戻れ');
      }
    } else if (F.exitMarked) {
      F.exitMarked = false; F._gKey = null; F._botKey = null;
      rt.unmark('hiei-exit');
    }
    // 前の組が退くまで、次の十人を重ねて下ろさない。既存の兵だけを順に使う。
    if (F.step === 2 && rt.t >= F.nextDownT && gone(F.downActive)) {
      for (const g of F.upperFoes) {
        if (g._downSent || gone(g) || Math.hypot(g.anchor.x - u.pos.x, g.anchor.z - u.pos.z) > 24) continue;
        g._downSent = true; F.downActive = g; F.nextDownT = rt.t + 12;
        walk(g, g._downRoad, 1.8, q => attackFrom(q, 12));
        break;
      }
    }
    // 退く下知と戸口の案内を、到着判定や次の進軍で上書きしない。
    // 今の人数を先に数え、半数を割ったコマで勝利へ進むのも防ぐ。
    let alive = 0;
    for (const mate of F.lossUnits) if (mate.alive && !mate.woundOut && !mate.fleeing && !mate.gone) alive++;
    F.lossAlive = alive;
    const retreating = F.lossInitial > 0 && alive * 2 < F.lossInitial;
    const advanceStep = exit || retreating ? 0 : F.step;
    if (advanceStep === 1) {
      const cleared = gone(F.hiyoshiG);
      // 札を出す前に数える。先手の要が遠い間も「兵０／０」にしない。
      const ready = cleared && near(u, P.trailhead, 16) && arrived(F.akechi, P.trailhead, 10);
      F.trailReady = ready;
      rt.objProgress('main', F._gHold ? '道を見失った。来た道の味方の旗へ戻れ' : F.guideReturn.active ? '参道の印へ戻れ' : !cleared ? shrineGuideLabel(rt) : !near(u, P.trailhead, 16) ? '道しるべに沿い、本坂の登り口へ' : !guardedRoad(rt, P.trailhead) ? '登り口の敵を、味方と退けよ' : columnWait(F.akechi, '登り口'));
      if (cleared && !F.hiyoDone) {
        F.hiyoDone = true; rt.unmark('hiyoshi'); rt.bark('日吉社の前が開いた。登り口へ');
        rt.obj('main', '先手と本坂の登り口へ進め', 'main');
        this.roadOpened(rt, 'hiyoHand', '本坂の登り口への道を開いた', '鳥居の守りを退けたな。先手は登り口へ進め！');
        // 登り口への直線は法面を横切る。鳥居から参道へ戻る近い道を指す。
        rt.marker('trail', () => F._gHold ? null : F._gp, () => rallyGuideLabel(rt, P.trailhead, 16, '登り口', '登り口へ・道なり', 10), { h: 2, guidePriority: 250, guideAlways: true, guideNear: 1.2, routeDistance: () => hieiGuideDistance(rt) });
        // 鳥居の前で「かかれ」のまま待たせず、実際に登り口へ列を進める。
        // 参道へ戻った兵を、残った攻め道へもう一度戻さない。
        // 鳥居からの帰路は walk が兵ごとに付け、本坂の続きでは従来どおり折れを残す。
        walk(F.akechi, [[150, 5], [146, 4], [134, 3], [124, 2]], 2.6, undefined, false, true);
      }
      if (!F.trailWaitCalled && cleared && near(u, P.trailhead, 16) && !ready && guardedRoad(rt, P.trailhead)) {
        F.trailWaitCalled = true;
        rt.say('組頭', '登り口を守れ。先手の列がそろえば登るぞ', 4);
      }
      if (cleared && near(u, P.trailhead, 16) && ready && guardedRoad(rt, P.trailhead)) { rt.unmark('trail'); this.p2(rt); }
    } else if (advanceStep === 2) {
      if (u.pos.x < 64) this.bellTodo(rt);
      if (u.pos.x < 30) this.ambush(rt);
      F.stairsReady = arrived(F.akechi, P.stairsFoot, 12);
      if (near(u, P.stairsFoot, 9) && F.stairsReady && guardedRoad(rt, P.stairsFoot)) { this.p3(rt); return; }
      if (!F._gHold && !F.guideReturn.active && !F.stairsFightCalled && near(u, P.stairsFoot, 9) && !guardedRoad(rt, P.stairsFoot)) {
        F.stairsFightCalled = true;
        rt.say('組頭', '石段の下の敵を退けよ。先手と道を開け', 4);
      }
      if (!F._gHold && !F.guideReturn.active && !F.stairsWaitCalled && near(u, P.stairsFoot, 9) && !F.stairsReady && guardedRoad(rt, P.stairsFoot)) {
        F.stairsWaitCalled = true;
        rt.say('組頭', '石段の下で列を待て。後ろの兵が着いてから登るぞ', 4);
      }
      rt.objProgress('main', F._gHold || F.guideReturn.active || near(u, P.stairsFoot, 9)
        ? stairsGuideLabel(rt) : roadProgress(rt, '石段の下'));
    } else if (advanceStep === 3) {
      rt.objProgress('main', rallyProgress(rt, P.monjuro, 6, '門の前', '石段を上り、文殊楼の門へ'));
      if (near(u, P.monjuro, 6) && arrived(F.akechi, P.monjuro, 10) && guardedRoad(rt, P.monjuro)) this.p4(rt);
    } else if (advanceStep === 4) {
      if (!F.courtDone) arrived(F.akechi, P.court, 10);
      if (!F.courtDone) rt.objProgress('main', rallyProgress(rt, P.court, 9, '根本中堂の前', '堂の間の道をたどり、根本中堂の前へ'));
      if (!F.courtDone && (near(u, P.court, 9) && arrived(F.akechi, P.court, 10))) {
        F.courtDone = true;
        rt.objProgress('main', '根本中堂の前の手向かう者を退けよ');
        rt.bark('根本中堂の前へ出た。道をふさぐ者を退けよ');
      }
      if (F.courtDone && !F.bell2) {
        rt.objProgress('main', rallyProgress(rt, P.court, 9, '根本中堂の前', '根本中堂の前へ。味方と道を開け'));
        // 根本中堂の前を押さえたところで一戦を終える。西塔・横川まで続けると遊んで八分を越え、打ち切られていた（10/27）。
        //   西塔の鐘（bellSaito）・p6・p7 は残す。
        if (guardedRoad(rt, P.court)) this.win(rt, '根本中堂の前の守りを退け、燃える東塔を押さえた');
      }
      if (F.bell2) {
        rt.objProgress('main', rallyProgress(rt, P.westGate, 12, '西の道の入口', '組と西の山道の印へ'));
        if (near(u, P.westGate, 12) && arrived(F.akechi, P.westGate, 12) && guardedRoad(rt, P.westGate)) this.p6(rt);
      }
    } else if (advanceStep === 5) {
      const byJodoin = near(u, P.jodoin, 18);
      if (byJodoin && !F.jodoinShown) { F.jodoinShown = true; rt.bark('浄土院の御廟を荒らすな。本道の列に続け'); }
      rt.objProgress('main', rallyProgress(rt, P.saito, 12, '釈迦堂の前', '印をたどり、釈迦堂の前へ'));
      if (near(u, P.saito, 12) && arrived(F.akechi, P.saito, 12) && guardedRoad(rt, P.saito)) this.p7(rt);
    } else if (advanceStep === 6) {
      if (!F.ridgeSeen && near(u, F.yokawaRoadG.anchor, 24) && !gone(F.yokawaRoadG)) {
        F.ridgeSeen = true;
        rt.say('横川の僧兵頭', '尾根道を守れ！　中堂へは通さぬ！', 3);
      }
      rt.objProgress('main', rallyProgress(rt, P.yokawa, 12, '横川中堂の前', roadProgress(rt, '横川中堂の前')));
      if (near(u, P.yokawa, 12) && arrived(F.akechi, P.yokawa, 12) && guardedRoad(rt, P.yokawa)) this.win(rt, '燃える堂の間を抜け、横川への山道の掃討を終えた');
    }
    // 勝ったコマで深手の札や前進の声を出し直さず、引き継ぎの下知を残す。
    if (F.ending) return;
    // 堂へ迷い込んだ時は、遠い目的地より目前の戸口を札と印でそろえて示す。
    if (exit && !F.ending) rt.objProgress('main', '戸口の印から外へ出て、本道へ戻れ');
    // 煙で道を見失う味方。移動先は使い回し、下知を出す時だけ更新する。
    if (!exit && !retreating && F.step === 4 && !F.valleyOrder && F.akechi2 && !gone(F.akechi2) && F.akechi2.order !== 'path' && F.lostN < 3 && rt.t >= F.lostT) {
      F.lostT = rt.t + 8;
      const g = F.akechi2, at = LOST_POINTS[F.lostN % LOST_POINTS.length];
      g.order = 'move'; g.speed = 2; g.dest = at; g.onArrive = holdLost;
      if (F.lostN % 3 === 0) rt.say('足軽', LOST_LINES[(F.lostN / 3 | 0) % LOST_LINES.length], 3);
      F.lostN++;
      if (F.lostN === 3) {
        rt.say('明智光秀', F.bell2
          ? '本道へ戻れ。西の道の入口へ進め'
          : '本道へ戻れ。根本中堂の前で合流じゃ', 3);
        walk(g, [[-21, -18], ...pts('todo_n', 2), ...pts('saito', 1, 4)], 2.3);
      }
    }
    // 深手の間は前進の下知より退避を先に見せる。回復したら元の任務へ戻す。
    if (u.hp <= u.maxHp * .4 && F.dangerAt === undefined && !F.woundTask) {
      F.woundTask = true;
      rt.obj('hiei-wound', '深手。味方の後ろで身を守れ', 'main', true);
    } else if ((u.hp > u.maxHp * .4 || F.dangerAt !== undefined) && F.woundTask) {
      F.woundTask = false; rt.objRemove('hiei-wound');
    }
    if (F.woundTask) rt.objProgress('hiei-wound', hieiTreatmentProgress(rt));
    // 人数が半分未満の状態を十秒保った時だけ敗北。本人の体力や先手の士気は条件にしない。
    if (!F.lossWarned && F.lossInitial > 0 && alive * 3 <= F.lossInitial * 2 && alive * 2 >= F.lossInitial) {
      F.lossWarned = true;
      rt.bark(`組は${alive}人。半分を割ると退くぞ。味方と槍をそろえよ`, true);
    }
    if (retreating) {
      if (F.dangerAt === undefined) {
        F.dangerAt = rt.t;
        if (F.woundTask) { F.woundTask = false; rt.objRemove('hiei-wound'); }
        rt.bark('組が半分を割った。来た道へ下がれ！', true);
        F.retreatGuideT = -1;
        hieiRetreatGuide(rt);
      }
      const left = Math.max(0, Math.ceil(10 - (rt.t - F.dangerAt)));
      rt.objProgress('main', exit ? '戸口の印から外へ出て、来た道へ下がれ' : '進むのをやめ、来た道へ下がれ');
      if (F.dangerLeft !== left || F.dangerAlive !== alive) {
        F.dangerLeft = left; F.dangerAlive = alive;
        // 副任務は携帯では畳まれる。本人が見える最新の主札として、その場で知らせる。
        rt.obj('danger', `組${alive}人。今すぐ下がれ（残り${left}秒）`, 'main', true);
      }
      rt.objProgress('danger', u.hp <= u.maxHp * .4
        ? `来た道へ下がれ。${hieiTreatmentProgress(rt)}`
        : `来た道へ下がれ。戦える者 ${alive}人／${F.lossInitial}人`);
      if (left === 0) this.lose(rt);
    } else if (F.dangerAt !== undefined) {
      F.dangerAt = undefined; F.dangerLeft = undefined; F.dangerAlive = undefined; rt.objRemove('danger');
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.group && v.group.civ) {
      if (k && k.isPlayer && !F.civHurt) {
        F.civHurt = true;
        rt.objFail('civ');
        rt.violation('逃げる非戦の者を討った', ['明智光秀', '追うなと申したはずじゃ。刃向かわぬ者を討って、何の手柄か']);
      }
      return;
    }
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v.team === 1 && (k?.isPlayer || k?.group?.isPlayerSquad)) {
      if (v.group === F.hiyoshiG || v.group === F.satoboBow) F.hiyoHand = true;
      if (v.group === F.monjuG || v.group === F.monjuBow || v.group === F.remG) F.monjuHand = true;
      if (v.group === F.saitoG) F.westHand = true;
    }
  },
  onFinish(rt) {
    rt.flags.missionPlaque?.remove();
  },
  onRout(rt, g) {
    const F = rt.flags;
    // 退却と手当ての下知を先にし、敵が崩れた知らせで攻め直させない。
    if (F.ending || F.dangerAt !== undefined || F.woundTask || g.team !== 1 || g.civ || g._routSaid || !g.name || rt.t - (F.routSaidT ?? -99) < 8) return;
    let seen = false;
    for (const u of g.units) if (u.alive && !u.gone && sightPoint(rt, u.pos, 40)) { seen = true; break; }
    g._routSaid = true; F.routSaidT = rt.t;
    const V = [`${g.name}が崩れた`, `${g.name}の寄せが止まった`, `${g.name}が持ち場を離れた`, `${g.name}が山の奥へ逃げていく`];
    if (seen) rt.say('足軽', V[(F.routN = (F.routN || 0) + 1) % V.length], 2.5);
  },
};

// 信長の三井寺本陣はこの切り出しの南の外。豪盛を架空の山の総大将にしない。
hiei_mtn.taisho = { a: null, b: null };
hiei_mtn.noHorse = true;
hiei_mtn.noWake = true;       // 軽い遠景の大軍を本物の兵へ増やさず、携帯向けの人数を守る
hiei_mtn.noTaishoRaid = true;   // 山では、殿を狙う別手を崖や谷の向こうに湧かせない（本坂を登る筋に絞る）
hiei_mtn.sides = { a: { name: '織田軍（明智の手）', mon: 'oda' }, b: { name: '延暦寺の守り手', mon: 'namu' } };
hiei_mtn.famous = []; // 光秀本人と供は開戦時に置く。後から別の隊へ足さない。
hiei_mtn.date = () => '元亀二年（1571）九月十二日　秋';
hiei_mtn.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知を聞き、鳥居へ進む' : '');
hiei_mtn.skip = (rt) => { if (rt.phase === 'brief') hiei_mtn.p1(rt); };
hiei_mtn.history = '元亀二年九月十二日、織田信長は比叡山延暦寺を攻めた。延暦寺は前年の志賀の陣で浅井・朝倉を山にかくまい、信長の求めに応じなかった。信長公記は、坂本の町から山上の堂塔に火が放たれ、僧も俗も区別なく多くが討たれたと記す。兼見卿記・多聞院日記も焼き討ちと大きな犠牲を伝える。死者は数百とも数千とも言われ、焼けた広さにも諸説がある。正覚院豪盛は山を逃れ、のちに武田信玄を頼ったという。信長の本陣は三井寺の山岡景猶の屋敷に置かれ、坂本と堅田への放火が攻撃の合図となった。日吉社の裏の八王子山へ逃れた人々も、焼き討ちの犠牲となった。発掘で焼失が明確な根本中堂と大講堂を山上の火の中心にしたが、他の場所に火がなかったと断定するものではない。本陣・堅田の遠景と八王子山への細かな道筋は推定である。山には東塔・西塔・横川の三地区があり、堂と僧坊が谷々に散らばっていた。この戦の建物は、焼ける前の姿を推し量って作った。当日の天気・風向・時刻は確定できず、昼の明るさや湖から山へ吹く風、地面の湿りは景色のための推定である。両軍の総兵数も信長公記では確定できない。見える兵と遠景の軍勢は規模を縮めた表現で、史実の総勢や人数の比率を示さない。持ち場ごとの兵数と光秀の細かな登路・攻め順も、遊びのための復元として扱う。日吉社の前を流れる大宮川を補った。川筋・川幅と参道の木橋の姿は推定で、現在の石橋を当時の姿として写したものではない。この遊びでは、燃える堂と坂本の町の間の山道を上へ掃討し、刃向かう者とだけ戦い、逃げ惑う者を討たない形にしている。この下知は遊びのためのもので、史実の焼き討ちを非戦の者が守られた出来事として描くものではない。 『耶蘇会士日本通信』に収められたふろいすの焼き討ち報告は、谷々にあった僧坊が長い戦乱で減っていたと伝える。本道脇の礎石は、その荒廃を表す推定の景色であり、史料がこの場所の建物跡を示したわけではない。手紙は僧や女性、子どもも犠牲になったと伝えるが、人数や全ての経過が確定したわけではない。宣教師は布教の立場から仏教を厳しく評しており、その評価を山の人々すべての姿としては使わない。台詞は自分の言葉で短く言い直した。各持ち場の僧兵頭は声の役として作った人物で、実名や指揮の経過が確かめられた武将ではない。本人や配下が道の守りを退けると味方の士気が上がる仕組みと、横川で後の隊へ引き継ぐ下知も遊びのための補いである。焼き討ちの後、明智光秀は志賀郡を与えられ、坂本に拠点を築いた。『武功夜話』は後の時代の作で、成立や内容に疑いがあるため、今回の根拠には使っていない。';

// 素直な遊び手：その段の道筋（castles/hiei1571.js の道）をたどり、近い敵とは戦う。深手なら味方の中へ下がる
const ROUTE = {
  1: (F) => F.hiyoDone ? [[143, -16], [148, -6], [150, 5], [146, 4], [134, 3], [124, 2]]
    : [[160, 5], [150, 5], [148, -6]],
  2: () => [[143, -16], [148, -6], [150, 5], [146, 4], [134, 3], ...pathById('honzaka').pts.slice(0, 20)],
  3: () => [...pathById('honzaka').pts.slice(17), [-20, -6]],
  // 中堂に着いただけでは西へ案内しない。守りを退けた鐘の合図を待つ。
  4: (F) => (!F.bell2 ? [[-8, -6], [-12, -6], [-17, -6], [-22, -5.5], [-26, -5], [-30, -5], [-38, -5]]
    : [[-30, -5], [-24, -5], [-19, -9], [-21, -18], [-28, -25], [-38, -29], [-50, -24], [-60, -22], [-70, -20], [-76, -21]]),
  5: () => [...pts('saito', 4)],
  6: () => [...pts('yokawa')],
};
// 段や目的地が変わった時だけ道筋を作る。毎コマ配列を作らない。
function routeFor(F) {
  const key = F.step * 8 + (F.courtDone ? 1 : 0) + (F.bell2 ? 2 : 0) + (F.hiyoDone ? 4 : 0);
  if (F._routeKey !== key) { F._routeKey = key; F._route = (ROUTE[F.step] || ROUTE[4])(F); }
  return F._route;
}
const LOST_POINTS = [{ x: -22, z: -24 }, { x: -28, z: -25 }, { x: -21, z: -18 }];
const LOST_LINES = ['煙で前が見えぬ！　道はどちらじゃ', '堂が崩れるぞ！　下がれ、下がれ', '味方はどこじゃ、声を出せ！'];
const canFight = (o) => !o.fleeing && !o.noTarget;
const holdLost = (g) => { g.order = 'hold'; g.anchor = g.dest; };
// 退避先の「味方の後ろ四歩」が道の外へ出ても、本道上へ寄せてから歩く。
// 共通の退避役からだけ呼び、敵への接近やほかの戦の歩みは変えない。
hiei_mtn.botRetreatWay = (rt, want) => {
  const u = rt.player.u, q = rt.flags.botRetreatGoal;
  runnerPoint(hillRoad(u.pos, want), want, RUNNER_TO);
  q.x = RUNNER_TO.x; q.z = RUNNER_TO.z;
  return runnerWay(rt.army, u, q);
};
// 共通の退避は横への一歩も選ぶ。行き先だけ道上に直しても法面へ流れるため、
// 四分の一秒ごとの候補にも本道の検査を通す。既に道外なら復帰の歩みを残す。
hiei_mtn.botRetreatStepAllowed = (rt, step) => {
  const u = rt.player.u, W = rt.world;
  if (W.onRoad(u.pos.x, u.pos.z)) {
    if (!W.onRoad(step.x, step.z)) return false;
  } else if (!W.onRoad(step.x, step.z)) {
    // 押し出された後も、敵から離れるだけの横歩きで法面を登り続けない。
    // 道へ近づく歩みと、幹をよける横歩きだけを残す。
    const path = hillRoad(u.pos, u.pos);
    runnerPoint(path, u.pos, RUNNER_FROM);
    runnerPoint(path, step, RUNNER_TO);
    // 一歩ごとに五センチを許すと、細かい入力で法面の奥へ歩き続けられる。
    // 計算の丸めだけを許し、道と並ぶ歩みと道へ戻る歩みを残す。
    if (RUNNER_TO.d > RUNNER_FROM.d + .000001) return false;
  }
  // 終点だけでは、道へ戻る直線が別の法面を横切る候補も通ってしまう。
  // 道へ着くまでは距離を増やさず、着いた後は道から出ない一歩を選ぶ。
  const path = hillRoad(u.pos, u.pos);
  runnerPoint(path, u.pos, RUNNER_FROM);
  let distance = RUNNER_FROM.d, onRoad = W.onRoad(u.pos.x, u.pos.z);
  const count = Math.max(1, Math.ceil(Math.hypot(step.x - u.pos.x, step.z - u.pos.z) / .6));
  for (let i = 1; i <= count; i++) {
    RUNNER_TEST.x = u.pos.x + (step.x - u.pos.x) * i / count;
    RUNNER_TEST.z = u.pos.z + (step.z - u.pos.z) * i / count;
    if (W.onRoad(RUNNER_TEST.x, RUNNER_TEST.z)) { onRoad = true; continue; }
    if (onRoad) return false;
    runnerPoint(path, RUNNER_TEST, RUNNER_TO);
    if (RUNNER_TO.d > distance + .000001) return false;
    distance = RUNNER_TO.d;
  }
  return roadClear(rt.army, u, u.pos, step);
};
hiei_mtn.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE'); inp.k.delete('KeyS');
  if (!u.alive || F.ending || !F.step) return;
  const exit = hieiExitWay(b);
  if (exit) {
    if (p.lock) inp.e.add('KeyQ');
    inp.guardHold = false;
    goTo(p, inp, exit.x, exit.z, .35);
    return;
  }
  // 深手の退避と手当ては、先に呼ばれる共通の survive に任せる。
  // 山だけの後ずさりを重ねると、狙いを外せず、打ち手と違う方を向いて受けてしまう。
  // 段の上（法面の上）の敵へ向かって詰まった時は、しばらく道筋へ戻る（石段から回り込む）
  const moved = F._fLast ? Math.hypot(F._fLast.x - u.pos.x, F._fLast.z - u.pos.z) : 1;
  if (!F._fLast) F._fLast = { x: 0, z: 0 };
  F._fLast.x = u.pos.x; F._fLast.z = u.pos.z;
  if (!F._canFight) F._canFight = (o) => canFight(o) && Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, u.team, o.pos, false);
  // 正面の打ち手を先に受ける。近いだけの別の敵へ向くと、横からの槍を防げない。
  let attacker = null, ad = 8;
  for (const o of b.army.threats || []) {
    if (o.type === 'gun' || o.type === 'bow' || !o.alive || !F._canFight(o)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d < ad) { attacker = o; ad = d; }
  }
  const candidate = b.t < (F._ignoreT || 0) ? null : strikeTarget(b, 11);
  // 本道の掃討では、僧坊の中へ逃れた敵を追って登る列を離れない。
  // 外から届く攻撃はこれまで通り受ける。室内へ入った本人には出口を先に案内する。
  const cd = candidate ? Math.hypot(candidate.pos.x - u.pos.x, candidate.pos.z - u.pos.z) : Infinity;
  // 近い打ち手は受けるが、通り過ぎた守りを追って登る列から引き返さない。
  const ahead = candidate && !F.guideReturn.active && F._gp
    && (candidate.pos.x - u.pos.x) * (F._gp.x - u.pos.x) + (candidate.pos.z - u.pos.z) * (F._gp.z - u.pos.z) > 0;
  // 石段で列を待つ時や、本道から届かぬ法面の敵を見た時に、僧坊の裏まで追わない。
  // 目前の打ち込みは受ける。遠い敵への接近は、実際に通れる本道だけにする。
  const waiting = F.step === 2 && near(u, P.stairsFoot, 9) && !F.stairsReady;
  const e = (attacker && (ad <= 3 && hieiMeleeGuide(b, attacker) || !waiting && !F.guideReturn.active && !F._gHold
    && b.world.onRoad(attacker.pos.x, attacker.pos.z) && roadClear(b.army, u, u.pos, attacker.pos)) ? attacker : null)
    || (candidate && !nakaRoomAt(candidate.pos.x, candidate.pos.z, candidate.pos.y)
    && (cd <= 3 && hieiMeleeGuide(b, candidate) || !waiting && !F._gHold && cd <= 7 && ahead && b.world.onRoad(candidate.pos.x, candidate.pos.z)
      && roadClear(b.army, u, u.pos, candidate.pos)) ? candidate : null);
  if (e) {
    F._fStuck = moved < 0.03 && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 3 ? (F._fStuck || 0) + 1 : 0;
    if (F._fStuck > 50) { F._fStuck = 0; F._ignoreT = b.t + 7; }
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.6 : 2.5;
    const approach = !waiting && !F.guideReturn.active && b.world.onRoad(u.pos.x, u.pos.z)
      && b.world.onRoad(e.pos.x, e.pos.z) && !nakaRoomAt(e.pos.x, e.pos.z, e.pos.y)
      && roadClear(b.army, u, u.pos, e.pos);
    // 近い敵でも、つづら折りの向こうなら追いかけて道を外れない。
    // 通れる道上の敵だけへ詰め、ほかは受けながら任務の印へ進む。
    if (d > reach && !e.charging && approach) goTo(p, inp, e.pos.x, e.pos.z, reach);
    // 毎コマのくじで構えを解かず、敵の振りを受け、隙に構えを解いてから突く。
    patientStrike(p, inp, e, d);
    // 復帰中は、目前の一撃を受けながら通れる印へ戻る。
    // 槍が届く敵が居続けても、法面で打ち合って登る列を置き去りにしない。
    if ((!F._gHold || F.trailActive) && (F.trailActive || F.guideReturn.active || d > reach && !approach)) {
      goTo(p, inp, F._gp.x, F._gp.z, .35);
    }
    // 槍の届かぬ間から構え続けると、登る列に遅れ、弓の射線に居残る。
    if (!attacker && d > reach + 1.5) inp.guardHold = false;
    return;
  }
  inp.guardHold = false;
  if (F._gHold) {
    if (F.trailActive) {
      if (p.lock) inp.e.add('KeyQ');
      goTo(p, inp, F._gp.x, F._gp.z, .2);
    }
    return;
  }
  if (p.lock) inp.e.add('KeyQ');
  // 画面と同じ復帰の印へ寄る。別の折れ点を選んで法面へ進ませない。
  if (F.guideReturn.active) {
    goTo(p, inp, F._gp.x, F._gp.z, .35);
    F._botKey = null;
    return;
  }
  // 遠い折れ点への独自の近道を作らず、半秒ごとに通れると調べた画面の印へ進む。
  // 狭い角は八十センチ手前で止まらず、次の区間へ向ける位置まで寄る。
  goTo(p, inp, F._gp.x, F._gp.z, .35);
};


// 信長公記・兼見卿記・多聞院日記。三井寺の本陣と坂本→本坂→三塔。
// 山の守りの将・人数は不明。豪盛を討死する城将として置かない。
installBattleJinkei(hiei_mtn, [
  battleJin('三井寺の本陣と本坂の縦隊', 0, { x: 90, z: 570 }, -Math.PI / 2, [
    ['hiei_hq', '三井寺の本陣の控え', '織田の衆（将の名は不明）', null, { x: 90, z: 592 }, 'oda', 'oda', null, { named: false }],
    ['hiei_akechi', '本坂へ登る先手', '明智光秀の手', null, { x: 158, z: 1 }, 'oda', 'akechi', (r) => r.flags.akechi, { form: 'column' }],
    ['hiei_command', '先手の後ろを進む供の衆', '明智光秀', null, { x: 174, z: 6 }, 'oda', 'akechi', (r) => r.flags.command, { form: 'column' }],
    ['hiei_teppo', '先手の鉄砲', '明智光秀の手', null, { x: 160, z: 9 }, 'oda', 'akechi', (r) => r.flags.teppo, { form: 'line' }],
    ['hiei_north', '北の山麓の囲み', '織田の衆（将の名は不明）', null, { x: 176, z: -26 }, 'oda', 'oda', null, { named: false }],
    ['hiei_south', '南の山麓の囲み', '織田の衆（将の名は不明）', null, { x: 178, z: 30 }, 'oda', 'oda', null, { named: false }],
  ], '信長の三井寺本陣はこの場の南の外。陣地と登山の順は復元。総兵数・持ち場別の兵数は不明。見える兵と遠景は縮小した表現で、総勢や人数の比率を示さない。'),
  battleJin('里坊と三塔に分かれた守り', 1, P.chudo, Math.PI / 2, [
    ['hiei_hiyoshi', '日吉社前・坂本の里坊', '神人と衆徒（将の名は不明）', null, { x: 146, z: -7 }, null, null, (r) => r.flags.hiyoshiG, { named: false }],
    ['hiei_honzaka', '本坂のつづら折り', '衆徒（将の名は不明）', null, { x: 83, z: 9 }, null, null, (r) => r.flags.sw1, { named: false, form: 'column' }],
    ['hiei_monju', '文殊楼・石段の上', '衆徒（将の名は不明）', null, { x: -9, z: -6 }, null, null, (r) => r.flags.monjuG, { named: false }],
    ['hiei_chudo', '東塔・根本中堂の前', '衆徒（将の名は不明）', null, { x: -40, z: -7 }, null, null, (r) => r.flags.chudoG, { named: false }],
    ['hiei_kodo', '東塔・大講堂の前', '衆徒（将の名は不明）', null, { x: -46, z: -27 }, null, null, (r) => r.flags.kodoG, { named: false }],
    ['hiei_saito', '西塔・にない堂', '衆徒（将の名は不明）', null, { x: -110, z: -44 }, null, null, (r) => r.flags.ninaidoG, { named: false }],
    ['hiei_yokawa', '横川中堂の前', '衆徒（将の名は不明）', null, { x: -94, z: -215 }, null, null, (r) => r.flags.yokawaG, { named: false }],
  ], '城の曲輪ではなく堂と山道ごとの守り。非戦の僧・里の者は備に数えず、家の旗を作らない。'),
]);

export { hiei_mtn };
