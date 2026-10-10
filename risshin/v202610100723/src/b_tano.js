import * as THREE from 'three';
import { pressureTick } from './battle_pressure.js';
// ======================================================================
// 織田家編　田野の戦い・天目山（天正十年三月十一日）
// 高遠城が落ちると、武田の家臣は次々に離れていった。武田勝頼は新府城を焼いて、小山田信茂の岩殿城を頼ったが、
// 小山田にも背かれ、わずかな供と天目山のふもとの田野へ逃れた。滝川一益の手がこれを追いつめ、勝頼は自害した。
// 狭い崖道で土屋昌恒が一人で多くの敵を防いだ（片手千人斬り）という話は、のちの伝えである。
// 自分は滝川の先手。谷道の押し合い → 崖道で鉄砲の合図 → 平屋敷の柵の口 → 最後の寄せ。
// 向き：西南西から東北東への谷筋を +x に合わせて復元。田野は谷の奥。細かな寸法は推定。
// ======================================================================
import { nobori, hut, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { placeGroup } from './b_opening.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { demRelief } from './dem.js';
import { gauss, enemyGroup, allyGroup, wallLine } from './bhelp.js';
import { dress } from './b_inabayama.js';
import { distToPolyline } from './world.js';
import { battleEvent, EVENT_VOLLEY } from './battle_events.js';
import { KIT } from './b_nagashinojo.js';
import { depthBot } from './b_depth.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 谷の道（西から東へ上る）
const ROAD = [[-190, 6], [-120, -4], [-60, 4], [-10, -2], [30, 2], [70, -4], [120, 2], [180, -6]];
// 田野より奥は北の天目山へ続く。寺そのものは戦場の外で、ここへ縮めて置かない。
// 戦う道筋とは分け、任務の行き先や柵の口を変えない。曲がりと幅は復元値。
const UPPER_ROAD = [[180, -6], [180, -48], [170, -140], [170, -230]];
const roadDistance = (x, z) => Math.min(distToPolyline(x, z, ROAD), distToPolyline(x, z, UPPER_ROAD));
const valleyFloor = (x, z) => (x + 200) * 0.05 + Math.max(0, Math.min(1, (x - 148) / 12)) * Math.max(0, -z - 6) * 0.05;
// 上流から下流へ。崖道では川岸が道へ寄る。
const RIVER = [[194, -230], [198, -140], [206, -48], [230, 22], [72, 22], [60, 11], [24, 11], [16, 22], [-230, 22]];
const DEM_RELIEF = { inner: 55, fade: 40, ax: 0, xy: 4, scale: 0.25 };
const NARROW = { x0: 20, x1: 60 };          // 崖道（道の幅が狭い所）
const TANO = { x: 120, z: 2 };              // 田野（勝頼の最後の陣）
const FIRST_JOIN = { x: -62, z: 4 };
const NO_FOES = [];
import { jinkeiPoint } from './jinkei.js';

// 備えごとの人数・細かな持ち場は復元値。総勢とは別に本物の兵を増やさない。
// 名の伝わらない持ち場に架空の将を置かず、旗と紋は既存の家の物で示す。
function sonaePlan(name, team, honjin, facing, rows) {
  const sn = Math.sin(facing), cs = Math.cos(facing);
  return { name, team, honjin, facing, sonae: rows.map(([id, role, general, soldiers, x, z, face, flag, mon, count = 0, w = 14, d = 8]) => ({
    id, role, general, soldiers, at: { right: (x - honjin.x) * cs - (z - honjin.z) * sn, front: (x - honjin.x) * sn + (z - honjin.z) * cs },
    facing: face, flag, mon, count, w, d, bindOnly: count === 0,
  })) };
}

// 侍四十一人（父子を含む）を五つの持ち場へ配る。非戦の者は含めない。
// 谷では大きな陣形を開けない。長蛇は道に沿う復元の呼び名で、史料の陣名ではない。
const TANO_ATTACK = sonaePlan('長蛇', 0, { x: -188, z: 0 }, Math.PI / 2, [
  ['front', '先手の槍', '滝川一益の配下', 1700, -152, 0, Math.PI / 2, 'takigawa', 'takigawa'],
  ['kawa', '第二陣', '河尻秀隆', 1500, -208, 0, Math.PI / 2, 'oda', 'none'],
  ['gun', '先手の鉄砲', '滝川一益の配下', 500, -168, 0, Math.PI / 2, 'takigawa', 'takigawa'],
  ['taki', '指揮所と近習', '滝川一益', 300, -188, 0, Math.PI / 2, 'takigawa', 'takigawa'],
]);
const TANO_DEFEND = sonaePlan('谷道と平屋敷の守り', 1, { x: 138, z: -6 }, -Math.PI / 2, [
  ['valley', '谷道の殿', '名は伝わらない', 6, -40, 0, -Math.PI / 2, 'takeda', 'takeda'],
  ['rear', '殿の控え', '名は伝わらない', 8, -20, 0, -Math.PI / 2, 'takeda', 'takeda'],
  ['tsuchiya', '崖道', '土屋昌恒', 9, 34, 2, -Math.PI / 2, 'takeda', 'takeda'],
  ['fence', '平屋敷の柵の口', '武田勝頼の配下', 10, 110, 0, -Math.PI / 2, 'takeda', 'takeda'],
  ['last', '平屋敷の奥', '武田勝頼・武田信勝', 8, 136, 0, -Math.PI / 2, 'takeda', 'takeda'],
]);

// 徒歩で狭い谷を守る姿。母衣は付けず、指物は肩幅ほどに収める。
// 袖と威糸を墨色の胴から分け、肘・手首・握る手の輪郭を読めるようにする。
const TANO_KIT = { horse: false, horo: 0, flagScale: 0.72, cloth: 0x514b40, lace: 0x73604b };
const ODA = { ...TANO_KIT, flag: 'oda' };
const TAKEDA = { ...TANO_KIT, flag: 'takeda' };

// 実測の山は道から離れた遠景だけ。読込時刻で道や屋敷の床を変えない。
let tanoDem = null, heightDem = null, heightFixed = false;
import('./asset_dem_tano.js').then((m) => { tanoDem = m.default; }).catch(() => {});
function height(x, z) {
  if (!heightFixed) { heightFixed = true; heightDem = tanoDem; }
  const b = heightBase(x, z);
  const upperFade = Math.max(0, Math.min(1, (distToPolyline(x, z, UPPER_ROAD) - 24) / 30));
  return b + (heightDem ? demRelief(heightDem, x, z, DEM_RELIEF) * upperFade : 0);
}
function heightBase(x, z) {
  // 平屋敷は水平な小さな平場。谷道と川床は上流へ単調に上る。
  let h = valleyFloor(x, z);
  const yardBlend = Math.max(0, Math.min(1, Math.min(x - 100, 148 - x, z + 18, 20 - z) / 4));
  const d = roadDistance(x, z);
  const narrow = x > NARROW.x0 && x < NARROW.x1;
  const half = narrow ? 4.5 : 14;
  if (z < 0) h += Math.min(40, Math.max(0, d - half) * (narrow ? 1.8 : 0.7));
  else {
    // 川側は下へ落ちる。両側に上りの崖を作らない。
    h -= Math.min(10, Math.max(0, d - half) * (narrow ? 1.3 : 0.6));
    h += Math.min(40, Math.max(0, d - 32) * 0.8);
  }
  h += 40 * gauss(x, z, 160, -140, 9000) * Math.min(1, Math.max(0, d - 24) / 30);
  const riverD = distToPolyline(x, z, RIVER);
  // 道と川床の外だけに尾根と浅い沢を重ね、一様な斜面を崩す。
  const relief = Math.max(0, Math.min(1, (d - 18) / 24)) * Math.max(0, Math.min(1, (riverD - 10) / 12));
  h += relief * (3.2 * Math.sin(x * 0.075 + z * 0.035) + 1.8 * Math.sin(z * 0.16 - x * 0.045));
  if (riverD < 6) {
    const t = 1 - riverD / 6;
    h += (valleyFloor(x, z) - 7 - h) * t * t * (3 - 2 * t);
  }
  return h + (16 - h) * yardBlend * yardBlend * (3 - 2 * yardBlend);
}

// 隊の要だけでなく、一人ずつの行き先も谷道と柵の口を通す。
// 横へ広がる持ち場をそのまま追うと、崖や川岸で止まってしまう。
const inYard = (x, z) => x >= 104 && x <= 144 && z >= -14 && z <= 16;
function valleyWay(army, u, want) {
  const p = u.pos;
  const q = u._tanoWay || (u._tanoWay = { x: 0, z: 0 });
  q.x = want.x; q.z = want.z;
  const inside = inYard(p.x, p.z), entering = inYard(want.x, want.z);
  if (inside && entering) return want;
  // 四辺の外から屋敷へ入る時も、西の口まで柵の外を回る。
  if (!inside && entering && p.x >= 104) {
    const sideZ = p.z < 1 ? -18 : 20;
    if (p.x > 144 && p.z > -17 && p.z < 19) { q.x = Math.max(148, p.x); q.z = sideZ; }
    else { q.x = 100; q.z = p.z; }
    return q;
  }
  if (inside && !entering && (p.x > 109 || Math.abs(p.z) > 2)) { q.x = 108; q.z = 0; return q; }

  const forward = want.x > p.x;
  // 曲がり角を飛ばさずに通る。近い敵にはその場から打ち込める。
  if (Math.hypot(want.x - p.x, want.z - p.z) > 6) {
    for (let k = 0; k < ROAD.length; k++) {
      const i = forward ? k : ROAD.length - 1 - k;
      const [x, z] = ROAD[i];
      if (forward ? x > p.x + 2 && x < q.x : x < p.x - 2 && x > q.x) { q.x = x; q.z = z; break; }
    }
  }
  let roadZ = ROAD[0][1];
  for (let i = 1; i < ROAD.length; i++) {
    const a = ROAD[i - 1], b = ROAD[i];
    if (q.x <= b[0]) { roadZ = a[1] + (b[1] - a[1]) * Math.max(0, (q.x - a[0]) / (b[0] - a[0])); break; }
    roadZ = b[1];
  }
  const half = q.x >= NARROW.x0 && q.x <= NARROW.x1 ? 2.7 : 10;
  q.z = Math.max(roadZ - half, Math.min(roadZ + half, q.z));
  if ((p.x <= 104 && q.x > 104) || (p.x > 104 && q.x <= 104)) {
    const z = p.z + (q.z - p.z) * (104 - p.x) / (q.x - p.x);
    if (Math.abs(z) > 2) {
      const before = p.x <= 104 ? 100 : 108;
      const approach = Math.abs(p.z) > 2 || (p.x <= 104 ? p.x < 99 : p.x > 109);
      q.x = approach ? before : p.x <= 104 ? 108 : 100;
      q.z = 0;
      return q;
    }
  }
  return q.x === want.x && q.z === want.z ? want : q;
}

// 道筋と前後の間隔を下知の時だけ用意する。隊の要は歩いて移る。
function roadOrder(g, x, z = 0, formation = 'column') {
  if (!g || !g.count || g.routed) return;
  const path = [[g.anchor.x, g.anchor.z]];
  const forward = x >= g.anchor.x;
  for (let k = 0; k < ROAD.length; k++) {
    const [rx, rz] = ROAD[forward ? k : ROAD.length - 1 - k];
    if (forward ? rx > g.anchor.x + 1 && rx < x : rx < g.anchor.x - 1 && rx > x) path.push([rx, rz]);
  }
  path.push([x, z]);
  g.formation = 'column'; g.colW = 2; g.march = false; g.noAI = true;
  // 後列も曲がる道に沿う。直線の持ち場を崖の外に残して先頭を待たせない。
  g.roadColumn = true;
  // 崖道と柵の口では三列、広い谷でも六列まで。人数を増やしても川へ広げない。
  g.yariRanks = Math.ceil(g.initial / (x >= NARROW.x0 && x <= NARROW.x1 || x >= 90 ? 3 : 6));
  g.order = 'path'; g.path = path; g.pathIdx = 1; g.focus = null;
  g.onArrive = () => { g.order = 'hold'; g.path = null; g.formation = formation; g.facing = forward ? Math.PI / 2 : -Math.PI / 2; g.onArrive = null; };
}
function sendColumn(rt, at, phase) {
  const F = rt.flags;
  // 敵の寄せ口は印の六歩先。八歩手前で止めると、互いの間合いに入れない。
  // 崖道では射手を前へ出し、槍はその後ろで待つ。味方で射線をふさがない。
  const narrow = phase === 'narrow';
  roadOrder(F.front, at.x - (narrow ? 20 : phase === 'approach' ? 8 : 0), at.z, 'yari');
  roadOrder(F.tgun, at.x - (narrow ? 8 : 20), at.z, 'line');
  roadOrder(F.taki, at.x - 36, at.z, 'ring');
  roadOrder(F.kawa, at.x - (narrow ? 26 : phase === 'approach' ? 20 : 6), at.z, 'yari');
}
const fighting = (g) => g && !g.routed && g.units.some((u) => u.alive && !u.fleeing && !u.woundOut && !u.noTarget);

// 生きて戦える兵だけを比べる。父子・柵・使番は優勢の数に入れない。
function tanoAdvantage(rt) {
  let ally = 0, enemy = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.isStruct || u.civ || u.group?.civ || u.type === 'porter' || u.type === 'dummy') continue;
    if (u.team === 0) ally++; else enemy++;
  }
  return ally > 0 && ally >= enemy;
}
// 川筋の筋・岸石・早春の草は各一描画。作る時だけ形と材質を用意する。
function tanoRiver(rt, stream) {
  const surface = stream.surface;
  if (!surface || !stream.mesh) return;
  stream.mesh.material.color.setHex(0x236d68);
  stream.mesh.material.opacity = 0.96;
  stream.mesh.material.envMapIntensity = 0.15;
  const count = Math.floor((surface.length / 3 - 1) / 3);
  const flowGeo = new THREE.PlaneGeometry(0.1, 1.8); flowGeo.rotateX(-Math.PI / 2);
  const stoneGeo = new THREE.DodecahedronGeometry(0.5, 0);
  const grassGeo = new THREE.ConeGeometry(0.3, 0.7, 3); grassGeo.translate(0, 0.35, 0);
  const flow = new THREE.InstancedMesh(flowGeo, new THREE.MeshBasicMaterial({ color: 0x83bab0, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }), count);
  const stones = new THREE.InstancedMesh(stoneGeo, new THREE.MeshLambertMaterial({ color: 0x696c62 }), count * 2);
  const grass = new THREE.InstancedMesh(grassGeo, new THREE.MeshLambertMaterial({ color: 0x697047 }), count * 2);
  const shape = new THREE.Object3D();
  for (let k = 0; k < count; k++) {
    const i = k * 9, dx = surface[i + 3] - surface[i], dz = surface[i + 4] - surface[i + 1];
    const len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len;
    const x = (surface[i] + surface[i + 3]) / 2, z = (surface[i + 1] + surface[i + 4]) / 2;
    const y = (surface[i + 2] + surface[i + 5]) / 2;
    const offset = Math.sin(k * 2.4) * stream.w * 0.6;
    shape.position.set(x + nx * offset, y + 0.035, z + nz * offset);
    shape.rotation.set(0, Math.atan2(dx, dz), 0); shape.scale.set(1, 1, 1); shape.updateMatrix(); flow.setMatrixAt(k, shape.matrix);
    for (let side = 0; side < 2; side++) {
      const sign = side ? 1 : -1, at = k * 2 + side;
      const bx = x + nx * sign * (stream.w + 0.65), bz = z + nz * sign * (stream.w + 0.65);
      shape.position.set(bx, rt.world.heightAt(bx, bz) + 0.12, bz);
      shape.rotation.set(0.2, k * 1.7, 0.1); shape.scale.set(1.2, 0.65, 0.8); shape.updateMatrix(); stones.setMatrixAt(at, shape.matrix);
      const gx = bx + nx * sign * 0.8, gz = bz + nz * sign * 0.8;
      shape.position.set(gx, rt.world.heightAt(gx, gz), gz);
      shape.rotation.set(0, k, 0); shape.scale.set(1, 0.7 + (k % 3) * 0.15, 1); shape.updateMatrix(); grass.setMatrixAt(at, shape.matrix);
    }
  }
  flow.renderOrder = 1;
  rt.scene.add(flow, stones, grass);
}

// 早春の木を板でなく立体の幹・枝で置く。この戦だけの軽い林（三描画）。
// 形・材質・変換用の道具は作る時に共有し、毎コマの処理を増やさない。
function tanoWoods(rt) {
  const W = rt.world, total = 240;
  const bark = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 1, 1, 5), new THREE.MeshLambertMaterial({ color: 0x504537 }), total * 11);
  const leaves = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x364339 }), total);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x706c61 }), 80);
  const shape = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  let seed = 15823, bi = 0, li = 0, ri = 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const branch = (x, y, z, dx, dy, dz, radius) => {
    dir.set(dx, dy, dz);
    const length = dir.length();
    shape.position.set(x + dx / 2, y + dy / 2, z + dz / 2);
    shape.quaternion.setFromUnitVectors(up, dir.multiplyScalar(1 / length));
    shape.scale.set(radius, length, radius); shape.updateMatrix(); bark.setMatrixAt(bi++, shape.matrix);
  };
  const limit = Math.min(220, W.half - 8);
  for (let i = 0, tries = 0; i < total && tries < total * 12; tries++) {
    const x = (random() * 2 - 1) * limit, z = (random() * 2 - 1) * limit;
    if (roadDistance(x, z) < 20 || distToPolyline(x, z, RIVER) < 9 || Math.hypot(x - TANO.x, z - TANO.z) < 30) continue;
    const y = W.heightAt(x, z), h = 5 + random() * 5, a = random() * Math.PI * 2;
    const dx = Math.cos(a) * 0.65, dz = Math.sin(a) * 0.65, evergreen = i % 3 === 0;
    branch(x, y - 0.2, z, dx, h * 0.6 + 0.2, dz, 0.22 + random() * 0.12);
    branch(x + dx, y + h * 0.6, z + dz, -dx * 0.4, h * 0.4, dz * 0.3, 0.13);
    for (let k = 0; k < 3; k++) {
      const angle = a + k * 2.1, reach = 1.3 + random() * 1.4;
      const bx = Math.cos(angle) * reach, bz = Math.sin(angle) * reach, by = h * (0.48 + k * 0.12);
      branch(x + dx * 0.8, y + by, z + dz * 0.8, bx, 1.2, bz, 0.09);
      for (let j = 0; j < 2; j++) {
        const turn = angle + (j ? 0.8 : -0.7);
        branch(x + dx * 0.8 + bx * 0.7, y + by + 0.84, z + dz * 0.8 + bz * 0.7, Math.cos(turn) * 0.9, 0.8 + random() * 0.6, Math.sin(turn) * 0.9, 0.035);
      }
      if (evergreen) {
        // 松の葉は枝先に厚みのある塊で付け、十字の板や段々の円錐にしない。
        shape.position.set(x + dx * 0.8 + bx, y + by + 1.2, z + dz * 0.8 + bz);
        shape.rotation.set(0.04, angle, 0.08); shape.scale.set(1.4 + random() * 0.6, 0.65 + random() * 0.3, 1.2 + random() * 0.5);
        shape.updateMatrix(); leaves.setMatrixAt(li++, shape.matrix);
      }
    }
    if (ri < 80) {
      shape.position.set(x + 1.6, W.heightAt(x + 1.6, z) - 0.2, z);
      shape.rotation.set(random(), a, random()); shape.scale.set(0.7 + random() * 1.4, 0.5 + random(), 0.8 + random());
      shape.updateMatrix(); rocks.setMatrixAt(ri++, shape.matrix);
    }
    i++;
  }
  for (const [mesh, count] of [[bark, bi], [leaves, li], [rocks, ri]]) {
    mesh.count = count; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  }
  rt.scene.add(bark, leaves, rocks);
}

// ---- 共通の小道具（組E の戦で使い回す） ----
// 味方の鉄砲の組に一斉射を任せる。込めたまま待たせ（holdFire）、敵の前線が near m まで寄せたら「放て」で撃たせ、敵の気勢を下げる。
// o：{ guns: () => [隊], foes: () => [隊], who: 話し手, near: 38, drop: 25, max: 60（この秒を過ぎたら待たずに撃つ）, line: 見出しの小さな字, say: 合図の台詞, onFire(rt) }
export function volleyAt(rt, o) {
  const guns = o.guns() || [];
  for (const g of guns) { g.holdFire = true; g.fire = true; }
  const t0 = rt.t;
  let released = false;
  const tick = () => {
    if (rt.over || rt.flags.ending || !rt.player.u.alive) return;
    const groups = o.guns() || [], foes = o.foes() || [];
    let able = false, ready = false, fired = false;
    for (const g of groups) {
      if (!fighting(g)) continue;
      for (const u of g.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.type !== 'gun' || u.gunAmmo === 0) continue;
        able = true;
        if (released && u.fireT > 0) fired = true;
        if (u.cd > 0 || u.reload || u.stagger > 0 || u.mounted) continue;
        for (const f of foes) {
          if (!fighting(f)) continue;
          for (const v of f.units) {
            if (!v.alive || v.fleeing || v.woundOut || v.noTarget || v.isStruct) continue;
            const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z);
            if (d > (rt.t - t0 > (o.max ?? 60) ? 100 : o.near ?? 38) || rt.army.shotBlocked(u, v.pos) || rt.army.hiddenBehind(u, v) || rt.army.allyInLine(u, v, d)) continue;
            ready = true; break;
          }
          if (ready) break;
        }
      }
    }
    if (!able) { for (const g of guns) g.holdFire = false; return; }
    if (!released && ready) {
      released = true;
      for (const g of groups) g.holdFire = false;
      rt.say(o.who || '鉄砲頭', o.say || '敵が見えたぞ……放て！', 3);
    }
    if (fired) {
      // 音・煙・命中・士気は実兵の射撃に任せ、同じ射撃を重ねない。
      rt.banner('一斉射', o.line || '味方の鉄砲が放たれた。槍の列を保て');
      if (o.onFire) o.onFire(rt, foes);
      return;
    }
    if (!foes.some(fighting)) { for (const g of guns) g.holdFire = false; return; }
    rt.after(0.2, tick);
  };
  rt.after(0.2, tick);
}
// 武田の騎馬の大きな塊を遠くに見せる（軽い作り）。facing は向く先
export function horseHost(rt, x, z, w, d, count, facing, seed) {
  return rt.world.addDistantArmy({ x, z, w, d, count, facing, armor: 0x3a2622, flagTex: flagTexture('takeda'), mon: 'takeda', seed, kind: 'cavalry' });
}

// 敵の武士は全段を通じて四十一人。段の間に控えを増やさない。
const tano = {
  jinkei: [TANO_ATTACK, TANO_DEFEND],
  noWake: true, noDistantBattle: true, noTaishoRaid: true, noHorse: true, botOrders: true,
  noRevive: true, strictHits: true, armySignals: false,
  noticeOnce: true, noAllyReports: true, // 同じ声は一戦一度。遠い将の独り言は運ばない。
  // 名のある者の最期の言葉は作らず、谷道にいる兵の短い声だけを替える。
  battleVoices: { lines: {
    ally: { ambient: ['谷道は石だらけだで', '足元に気をつけやあ', '前の旗が見えるで', '川へ寄ったらいかん'] },
    enemy: { ambient: ['柵の口を離れるな', '谷道から来るぞ', '槍先をそろえよ', '屋敷へ通すな'] },
  } },
  // 次の持ち場の守兵まで本人の周りに集めない。後詰は先手の隙を支える。
  frontlineDensity: { strength: 0.6, canSend: (rt, g) => g === rt.flags.front || g === rt.flags.kawa || !!rt.flags.dp?.cur?.groups.includes(g) },
  lordHata: { spear: 12 },
  // 本人・護衛・最期はこの戦で置く。共通の追加兵と討ち取り勝利を使わない。
  taisho: { a: null, b: null },
  spawn: { x: -74, z: -6, heading: Math.atan2(FIRST_JOIN.x + 74, FIRST_JOIN.z + 6) },
  world: {
    seed: 15823, noticeRepeatGap: Infinity, moveLim: 230, time: 'day', mood: 'plain', mist: false, wind: [1, 0.15], muddy: 0.1, riverCross: true,
    // 冬の枝と既存の枯れ草色を使い、早春の山に花と若草を茂らせない。
    winter: true, autumn: true,
    paths: [ROAD, UPPER_ROAD], height, moveWay: valleyWay,
    streams: [{ pts: RIVER, w: 3, depth: 2.8 }],
    tint(x, z, h, c) { if (roadDistance(x, z) > 12) c.setRGB(c.r * 0.9, c.g * 0.73, c.b * 0.72); },
    clear: (x, z) => roadDistance(x, z) < 12 || Math.hypot(x - TANO.x, z - TANO.z) < 24,
    trees: 0, noBamboo: true, tufts: 1000, slopeForest: 0.3,
    fleeOut: (x, z, team) => team === 1 && x > 175,
  },
  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const F = rt.flags, W = rt.world;
    F.ek = 0; F.ak = 0;
    tanoWoods(rt);
    // 突きのたびに下向きの傾きが積もるのを、この戦の肩越し視点だけで止める。
    // 自分で見回している間と、狙い・大将の目はそのまま使える。
    const player = rt.player, normalCamera = player.updateCamera;
    const lastLook = new THREE.Vector3(135, W.heightAt(135, -3) + 1.4, -3);
    const lastEye = new THREE.Vector3(114, W.heightAt(114, -12) + 3, -12);
    player.updateCamera = function (dt, camera) {
      if (!this.overHold && !this.aiming && !this.fpWanted() && this.lookIdle > 0.7) {
        this.pitch = Math.max(-0.28, Math.min(0.22, this.pitch));
      }
      normalCamera.call(this, dt, camera);
      // 終幕は屋敷の脇から父子を見る。上へ引く共通の勝利視点を重ねない。
      if (F.lastView) { camera.position.copy(lastEye); camera.lookAt(lastLook); }
    };
    // 後続の大半は戦場の外。近づける谷道に軽い形だけの兵を置かない。
    // 粗い地形の補間に水面を引かせず、上流から下流へ下る高さをそろえる。
    // 作る時に一度だけ直し、深さの判定も同じ水面を使う。
    const stream = W.def.streams[0], surface = stream.surface;
    if (surface && stream.mesh) {
      const positions = stream.mesh.geometry.attributes.position;
      let level = Infinity;
      for (let i = 0; i < surface.length; i += 3) {
        level = Math.min(level, surface[i + 2]);
        surface[i + 2] = level;
        positions.setY(i / 3 * 2, level); positions.setY(i / 3 * 2 + 1, level);
      }
      positions.needsUpdate = true; stream.mesh.geometry.computeVertexNormals();
      stream.mesh.geometry.computeBoundingSphere();
    }
    tanoRiver(rt, stream);
    // 谷・平屋敷の柵は信長公記。崖道の寸法と鉄砲の運用は遊びのための復元。
    F.hist = { valley: 'HIST_A', fence: 'HIST_A', cliffRoad: 'HIST_B', volley: 'GAME_C' };
    // 城ではなく民家を囲む急ごしらえの柵。西の口だけは六メートル開ける。
    F.fence = wallLine(rt, [[104, -3], [104, -14], [144, -14], [144, 16], [104, 16], [104, 3]], { team: 1, hp: 180, name: '田野の柵', segLen: 6, meshOpt: { h: 1.8 } });
    rt.scene.add(hut(W, 128, 0, 7, 5, 0.2, { wall: 0x5a4a38 }), tawara(W, 138, 7, 0.2, 3));
    for (const [x, z] of [[-40, -7], [34, -4], [108, -9], [140, 8]]) rt.scene.add(nobori(W, x, z, 'takeda', 5));
    F.front = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の先手の槍', anchor: jinkeiPoint(TANO_ATTACK, TANO_ATTACK.sonae[0]), facing: Math.PI / 2, width: 4, yariRanks: 4, aggro: 9, noAI: true, formation: 'yari' }, dress([uS(6), uA(18)], { ...TANO_KIT, flag: 'takigawa' }));
    F.taki = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川一益と近習', anchor: jinkeiPoint(TANO_ATTACK, TANO_ATTACK.sonae[3]), facing: Math.PI / 2, aggro: 4, noAI: true, guardOn: true, formation: 'ring' },
      dress([{ type: 'busho', n: 1, o: { name: '滝川一益', horse: false, invuln: true, hat: 'kabuto_w' } }, uS(4), uA(4)], { ...TANO_KIT, flag: 'takigawa' }));
    F.taki.leader = F.taki.units.find((u) => u.type === 'busho');
    F.kawa = allyGroup(rt, { fixed: true, fullStrength: true, name: '河尻秀隆の後ろの手', anchor: jinkeiPoint(TANO_ATTACK, TANO_ATTACK.sonae[1]), facing: Math.PI / 2, colW: 2, aggro: 12, noAI: true, ai: true, formation: 'column' },
      dress([{ type: 'busho', n: 1, o: { name: '河尻秀隆', horse: false, invuln: true } }, uS(6), uA(13)], ODA));
    F.kawa.leader = F.kawa.units.find((u) => u.type === 'busho');
    F.taki.leader.allyOk = true; F.kawa.leader.allyOk = true;
    F.tgun = allyGroup(rt, { fixed: true, fullStrength: true, name: '滝川の鉄砲組', anchor: jinkeiPoint(TANO_ATTACK, TANO_ATTACK.sonae[2]), facing: Math.PI / 2, width: 3, ranks: 2, aggro: 6, noAI: true, order: 'hold' }, dress([{ type: 'gun', n: 6 }], { ...TANO_KIT, flag: 'takigawa', flagScale: 0.55 }));
    F.oda = [F.front, F.tgun, F.taki, F.kawa];
    // 道順と将の下知は保ち、到着した先手と後詰の無名兵だけが隙へ寄せる。
    F.front.frontlineMobilize = true; F.kawa.frontlineMobilize = true;
    placeGroup(rt, F.front, -80, 0);
    placeGroup(rt, F.tgun, -94, -4);
    placeGroup(rt, F.taki, -106, 0);
    placeGroup(rt, F.kawa, -118, 0);
    const n = Math.min(30, RANKS[rt.G.rank || 0].squad || 0);
    if (n) rt.makeSquad({ x: -86, z: 0 }, Math.PI / 2, [{ kind: 'spear', n }]);
    // 守る兵は初めから地形に置く。共通の増援処理で背後へ出し直さない。
    const guard = (name, slot, list, width = 6) => enemyGroup(rt, { fixed: true, noAI: true, faction: 'takeda', name, anchor: jinkeiPoint(TANO_DEFEND, TANO_DEFEND.sonae[slot]), facing: -Math.PI / 2, order: 'hold', width, aggro: 5, morale: 100, noRout: true, fleeDir: { x: 1, z: 0 }, formation: 'yari', yariRanks: 3 }, dress(list, TAKEDA));
    F.defenders = [
      guard('谷道の武田勢', 0, [uS(6)], 8),
      guard('谷道の後ろの侍', 1, [uS(8)], 8),
      guard('土屋昌恒の衆', 2, [{ type: 'busho', n: 1, o: { name: '土屋昌恒', horse: false, hat: 'kabuto_m' } }, uS(8)], 5),
      guard('田野の柵を守る侍', 3, [uS(10)], 7),
      guard('武田の最後の侍', 4, [uS(6)], 4),
    ];
    // 奥の六人は柵が落ちるまでは屋敷の控え。先の段で討ち尽くさない。
    placeGroup(rt, F.defenders[4], 134, -8);
    for (const u of F.defenders[4].units) { u.noTarget = true; u.invuln = true; }
    // 父子二人も四十一人に含める。屋敷の奥に近習を置き、討ち取りの的にしない。
    F.principals = enemyGroup(rt, { fixed: true, noAI: true, faction: 'takeda', name: '武田父子の居所', anchor: { x: 138, z: -6 }, facing: -Math.PI / 2, aggro: 0, noRout: true, stay: true, formation: 'column', civ: true },
      dress([{ type: 'busho', n: 1, o: { name: '武田勝頼', horse: false, noTarget: true, invuln: true } }, { type: 'samurai', n: 1, o: { name: '武田信勝', horse: false, noTarget: true, invuln: true } }], TAKEDA));
    // 無名の侍の呼び名は仮名。本人と同じ名を避け、実名の土屋は保つ。
    const names = ['源六', '平八', '彦七', '新八', '又六', '弥三郎', '喜助'];
    for (const g of F.defenders) for (const u of g.units) {
      u.duelDone = true;
      if (!u.name) {
        let n = u.id % names.length;
        if (names[n] === rt.G.name) n = (n + 1) % names.length;
        u.nanori = `武田が家来、${names[n]}なり！`;
      }
    }
    for (const g of rt.army.groups) if (g.team === 0 && !g.civ) g.noRout = true;
    rt.setPhase('brief');
    rt.obj('main', '谷道の先手に加われ', 'main');
    rt.say('滝川の組頭', '物見の知らせじゃ。勝頼父子は田野の屋敷におる。先手に続けい', 5);
    rt.after(5, () => this.valley(rt));
  },
  valley(rt) {
    const F = rt.flags;
    if (F.started || F.ending || rt.over || !rt.player.u.alive) return;
    F.started = true;
    // 初めからいる守兵と到着で進める。果たせない任務は失敗として閉じる。
    const steps = [
      { phase: 'approach', kind: 'move', at: FIRST_JOIN, label: '谷道の先手', text: '谷道の先手に加われ' },
      { phase: 'valley', kind: 'hold', at: { x: -46, z: 0 }, guards: [0, 1], label: '谷道の先手', text: '谷道で先手を支え、敵を退けよ' },
      { phase: 'narrow', kind: 'hold', at: { x: 22, z: 2 }, guards: [2], label: '崖道の口', text: '崖道で待ち、鉄砲の後に押せ' },
      { phase: 'fence', kind: 'fight', at: { x: 98, z: 0 }, guards: [3], label: '田野の柵の口', text: '打って出る敵を退け、柵の口を取れ' },
      { phase: 'tano', kind: 'hold', at: { x: 124, z: -8 }, guards: [4], label: '屋敷の奥への道', text: '屋敷の脇から進み、奥の守りを退けよ' },
    ];
    F.dp = { on: true, i: -1, steps, ctx: { friends: () => F.oda, routeFight: true, botTreatAt: 0.65, botSeek: 50, botSeekHold: true }, cur: null };
    this.next(rt);
  },
  next(rt) {
    const F = rt.flags, D = F.dp, s = D.steps[++D.i];
    rt.unmark('dp'); rt.unzone('dp');
    if (!s) { D.on = false; this.win(rt); return; }
    const groups = (s.guards || []).map((i) => F.defenders[i]);
    D.cur = { s, at: s.at, goal: { ...s.at }, groups, columns: F.oda.concat(groups), botRadius: 50, support: 0, settled: 0, outT: 0, t0: rt.t, sampledAt: rt.t, nudgeAt: rt.t };
    F.pressureStage = D.i; F.pressureSince = rt.t; F.pressureSayAt = Infinity;
    rt.setPhase(s.phase); rt.obj('main', s.text, 'main');
    if (s.phase === 'tano') {
      // 侍六人と父子二人。史料の四十一人の内から残った小勢を見せる。
      for (const u of F.defenders[4].units) { u.noTarget = false; u.invuln = false; }
      rt.climax = true;
      // 火の位置と大きさは場面の補完。父子を炎で隠さず、屋敷側だけに置く。
      rt.world.addFire(128, 2, { size: 2.4, h: 1 });
      rt.world.addFire(131, 3, { size: 1.8, h: 0.8 });
      rt.say('物見', '柵の口は押さえた。勝頼父子と残る侍は屋敷の奥じゃ', 4);
    }
    if (s.phase === 'narrow') rt.say('鉄砲頭', '射手の前を空けよ。鉄砲が鳴ったら槍で押せい', 3.5);
    rt.marker('dp', s.at, s.label, { h: 3, alwaysDistance: true });
    rt.zone('dp', s.at.x, s.at.z, s.kind === 'move' ? 8 : 12);
    sendColumn(rt, s.at, s.phase);
    for (const g of groups) {
      if (!fighting(g)) continue;
      if (s.phase === 'tano') {
        g.frontlineMobilize = false; g.order = 'hold'; g.path = null;
        g.formation = 'yari'; g.facing = -Math.PI / 2; g.onArrive = null;
        continue;
      }
      g.frontlineMobilize = true;
      g.order = 'path'; g.formation = 'column'; g.colW = 2;
      g.path = [[s.at.x + 6, s.at.z]];
      g.pathIdx = 0;
      g.onArrive = () => { g.order = 'hold'; g.path = null; g.formation = 'yari'; g.facing = -Math.PI / 2; g.onArrive = null; };
    }
    // 持ち場へ着くまでは射手が槍の後ろから勝手に撃たない。
    F.tgun.holdFire = true; F.tgun.fire = true;
    if (s.phase !== 'narrow') F.tgun.onArrive = () => { F.tgun.order = 'hold'; F.tgun.path = null; F.tgun.formation = 'line'; F.tgun.facing = Math.PI / 2; F.tgun.onArrive = null; F.tgun.holdFire = false; };
  },
  flowTick(rt, dt) {
    const F = rt.flags, D = F.dp, C = D && D.cur;
    if (!D || !D.on || !C || rt.over || !rt.player.u.alive) return;
    // 道の後列待ちだけをほどく。時刻で敵全員の狙いを本人へ変えない。
    if (rt.t >= (F.pressureAt || 0)) pressureTick(rt, D.i, NO_FOES, C.columns, '');
    if (C.s.phase === 'narrow' && !F.volleyQueued && !F.narrowPush && F.tgun.order === 'hold' && F.tgun.count) {
      F.volleyQueued = true;
      C.gunWaitAt = rt.t;
      volleyAt(rt, { guns: () => F.dp.cur.s.phase === 'narrow' && !F.narrowPush && fighting(F.defenders[2]) ? [F.tgun] : [], foes: () => [F.defenders[2]], near: 45, max: 30, drop: 0, who: '鉄砲頭',
        line: '鉄砲が鳴ったぞ。槍をそろえて押せ',
        onFire: () => {
          F.volley = true;
          if (F.dp.cur.s.phase === 'narrow' && fighting(F.front)) roadOrder(F.front, F.dp.cur.at.x + 6, F.dp.cur.at.z, 'yari');
          battleEvent(rt, EVENT_VOLLEY, F.tgun.anchor, F.tgun, 0, true, '崖道に鉄砲の音が返る');
        } });
    }
    F.flowScan = (F.flowScan || 0) - dt;
    if (F.flowScan > 0) return;
    F.flowScan = 0.4;
    // 射手の損耗や味方の割り込みで撃てなくても、槍の寄せへ切り替える。
    // 撃っていない鉄砲の音・煙・手柄は作らない。
    if (C.s.phase === 'narrow' && !F.volley && !F.narrowPush &&
        (!fighting(F.tgun) || (C.gunWaitAt !== undefined && rt.t - C.gunWaitAt >= 12) || rt.t - C.t0 >= 45)) {
      F.narrowPush = true; F.tgun.holdFire = true; F.tgun.fire = false;
      let armed = false, loaded = false;
      for (const u of F.tgun.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.noTarget || u.type !== 'gun' || u.gunAmmo === 0) continue;
        armed = true;
        if (u.cd <= 0 && !u.reload && !(u.stagger > 0)) loaded = true;
      }
      rt.say('鉄砲頭', !fighting(F.tgun) ? '射手が倒れ、撃てる者がおらぬ' : !armed ? '撃てる玉が尽きた'
        : F.tgun.order !== 'hold' ? '射手が崖道へ着けぬ。鉄砲の並びが作れぬ'
          : !loaded ? '玉込めが間に合わぬ。槍の組を待たせてしまう'
            : '崖道では敵へ筒先が通らぬ。撃つ間が作れぬ', 3.5);
      rt.obj('main', '鉄砲を待たず、槍の組と崖道を押せ', 'main');
      rt.after(4, () => {
        if (F.ending || F.dp.cur !== C) return;
        roadOrder(F.front, C.at.x + 6, C.at.z, 'yari');
        rt.say('滝川の組頭', '鉄砲は待たぬ。槍の組、崖道を押せい', 3.5);
      });
    }
    const elapsed = Math.max(0, rt.t - C.sampledAt); C.sampledAt = rt.t;
    const p = rt.player.u.pos;
    const advantage = tanoAdvantage(rt);
    if (!advantage && rt.canFailMission() && !fighting(F.front) && !fighting(F.kawa)) {
      D.on = false; F.ending = true; rt.setPhase('end'); rt.unmark('dp'); rt.unzone('dp'); rt.unmark('turn'); rt.objProgress('main', ''); rt.objFail('main'); rt.tracker.main = false;
      rt.banner('先手が崩れた', '戦える味方が足りぬ。退け'); rt.player.u.invuln = true; rt.finish({ scriptedEnd: true, failureReason: '先手と後詰が崩れた' }, 8); return;
    }
    if (!C.nudged && rt.t - C.nudgeAt >= 30 && !inYard(p.x, p.z) && distToPolyline(p.x, p.z, ROAD) > 8) {
      C.nudged = true; rt.bark('川へ下りるな。谷道の旗へ戻れ');
    }
    const route = valleyWay(rt.army, rt.player.u, C.at);
    if (distToPolyline(p.x, p.z, ROAD) > 8 && route !== C.at) { rt.marker('turn', route, '谷道への戻り口', { h: 3 }); } else rt.unmark('turn');
    const inside = C.s.phase !== 'tano' || (p.x > 104 && p.x < 144 && p.z > -14 && p.z < 16);
    const distance = Math.hypot(p.x - C.at.x, p.z - C.at.z);
    const near = inside && distance < (C.s.kind === 'move' ? 8 : 12);
    const clear = !C.groups.some(fighting) && (C.s.phase !== 'tano' || !F.defenders.some(fighting));
    // 合流に来ない、または寄せが止まったままなら閉じる。交戦中に時刻だけで負けにしない。
    if (!advantage && rt.t - C.t0 >= 180 && (!near || !clear) && rt.player.inCombatT <= 0 &&
        !rt.army.nearestEnemy(rt.player.u, 28, (u) => !u.isStruct && !u.noTarget && u.type !== 'dummy')) {
      D.on = false; F.ending = true; rt.setPhase('end'); rt.unmark('dp'); rt.unzone('dp'); rt.unmark('turn');
      rt.objProgress('main', ''); rt.objFail('main'); rt.tracker.main = false;
      rt.banner('寄せが止まった', '味方が減り、持ち場へ進めぬ');
      rt.player.u.invuln = true; rt.finish({ scriptedEnd: true, failureReason: '味方が減り、寄せが止まった' }, 8); return;
    }
    const enemy = C.groups.find(fighting) || (C.s.phase === 'tano' ? F.defenders.find(fighting) : null);
    if (enemy) {
      let x = 0, z = 0, n = 0;
      for (const u of enemy.units) if (u.alive && !u.fleeing && !u.woundOut && !u.noTarget) { x += u.pos.x; z += u.pos.z; n++; }
      if (n) { C.goal.x = x / n; C.goal.z = z / n; }
      else { C.goal.x = C.at.x; C.goal.z = C.at.z; }
    } else { C.goal.x = C.at.x; C.goal.z = C.at.z; }
    const ready = C.s.phase !== 'narrow' || F.volley || F.narrowPush || !fighting(F.tgun) || !fighting(F.defenders[2]);
    // 敵が残る間に先手の近くで支えた事を数える。到着後の待ちだけでは手柄にしない。
    if (!clear && inside && distance < 25 && Math.hypot(p.x - C.goal.x, p.z - C.goal.z) < 25) C.support += elapsed;
    if (!clear || !ready) { C.settled = 0; C.outT = 0; }
    else if (near) { C.settled += elapsed; C.outT = 0; }
    else {
      C.outT += elapsed;
      // 短い押し出しの間は確認を止める。三秒以上離れたら持ち場を放棄した扱い。
      if (C.outT >= 3 || distance >= 20) C.settled = 0;
    }
    rt.objProgress('main', C.s.phase === 'narrow' && !ready ? (F.tgun.order !== 'hold' ? '射手の後ろへ進め' : '射手の後ろで待て') : !inside ? '柵の口から中へ進め'
      : !near ? `${(C.at.x - p.x) * Math.sin(rt.player.yaw) + (C.at.z - p.z) * Math.cos(rt.player.yaw) < 0 ? '後ろを向け。' : ''}${C.s.label}へ進め。あと ${Math.round(distance)}メートル`
        : !clear ? `敵は${C.goal.x < C.at.x ? '谷道の手前' : '谷道の奥'}におる。${C.s.phase === 'fence' || C.s.phase === 'tano' ? (C.s.phase === 'tano' ? '屋敷の脇から' : '柵の口から') : '川へ下りず'}組と進み、敵を退けよ`
          : C.s.kind === 'move' ? '先手に加わった' : 'この場を固めよ');
    if (near && clear && ready && (C.s.kind !== 'move' || rt.t - C.t0 >= 8) && C.settled >= (C.s.kind === 'move' ? 0.4 : 8)) {
      // 間に合わなかった段は手柄を付けず、敵を退けた先手に続く。
      if (C.s.kind !== 'move' && C.support >= 3) {
        const label = C.s.phase === 'valley' ? '谷道の先手を支えた' : C.s.phase === 'narrow' ? '崖道の寄せを止めた' : C.s.phase === 'fence' ? '田野の柵の口を押さえた' : '田野の最後の寄せを止めた';
        rt.award((t) => t.side.push(label), label);
      } else if (C.s.kind === 'move') rt.award((t) => { t.special = { label: '谷道の先手に合流した', pts: 5 }; }, '谷道の先手に合流した');
      this.next(rt);
    }
  },
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    if (!rt.player.u.alive || F.defenders.some(fighting)) return;
    rt.award((t) => { t.main = true; t.special = { label: '谷道から田野の柵へ攻め込んだ', pts: 20 }; }, '田野の柵を押さえた');
    F.ending = true; rt.setPhase('end'); rt.unmark('dp'); rt.unzone('dp'); rt.unmark('turn'); rt.objRemove('dp'); rt.objDone('main');
    // 父子の姿と屋敷の火を八秒見せてから結末へ。最期の言葉や決闘は作らない。
    F.lastView = true;
    rt.banner('田野の柵を押さえた', '追わず、組をそろえよ');
    for (const g of F.oda) { g.order = 'hold'; g.path = null; g.onArrive = null; g.frontlineMobilize = false; }
    rt.say('物見', '奥の守りも尽きた。勝頼父子に退く道はござらぬ', 4);
    rt.after(8, () => {
      for (const u of F.principals.units) {
        // 攻め手の討ち取りに数えず、最後の知らせと生死をそろえる。
        u.alive = false; u.hp = 0; u.deadT = 0; u.atk = null; u.swing = null; u.target = null;
      }
      F.principalsDead = true;
      rt.say('使番', '勝頼父子、御生害にござる。奥方も果てられた由', 4);
      rt.banner('武田家の終わり', '勝頼父子は田野で果てた');
    });
    // 自害は攻め手の討ち取りにせず、姿と火の残る場面を保って戦を閉じる。
    rt.player.u.invuln = true; rt.finish({ scriptedEnd: true }, 13);
  },
  update(rt, dt) {
    if (rt.flags.ending) return;
    const advantage = tanoAdvantage(rt);
    for (const g of rt.army.groups) if (g.team === 0 && !g.civ && !g.routed) g.noRout = advantage;
    KIT.backTick(rt);
    if (rt.flags.started) this.flowTick(rt, dt);
    // 三割まで減ってからでは、侍の次の一撃に間に合わない。傷の原因も伝える。
    const u = rt.player.u, hit = rt.player.lastHit;
    const cause = hit ? hit.ranged ? 1 : hit.back || hit.side ? 2 : hit.type === 'samurai' || hit.type === 'busho' ? 4 : 8 : 0;
    if (!rt.over && u.alive && u.hp < u.maxHp * 0.65 && hit && rt.t - hit.t < 2 &&
        !(rt.flags.guardHelpT > rt.t) && !((rt.flags.guardHelpMask || 0) & cause)) {
      rt.flags.guardHelpT = rt.t + 30;
      rt.flags.guardHelpMask = (rt.flags.guardHelpMask || 0) | cause;
      rt.bark(hit.ranged
        ? '矢玉だで。道の陰へ退きゃあ'
        : hit.back || hit.side
        ? '脇から来るで。敵を向いて味方へ退きゃあ'
        : hit.type === 'samurai' || hit.type === 'busho'
          ? '槍を受けたか。味方の後ろへ退きゃあ'
          : '深手だで。味方へ退きゃあ', true);
    }
  },
  onKill(rt, v) { if (!v.isStruct && !v.group?.civ && v.type !== 'porter') { if (v.team === 1) rt.flags.ek++; else rt.flags.ak++; } },
  onRout(rt, g) {
    if (g.team !== 1 || rt.flags.routSaid) return;
    rt.flags.routSaid = true;
    rt.say('足軽', '谷道の旗へ続け。組を離れるな', 2.5);
  },
};
const uS = (n) => ({ type: 'samurai', n, o: { weapon: 'spear', reach: 3.4, horse: false } }), uA = (n) => ({ type: 'ashigaru', n });
// 味方は数千という復元値。敵は信長公記の侍四十一人（非戦闘員は含めない）。
tano.force = (rt) => ({ a: Math.max(0, 4000 - (rt.flags.ak || 0)), a0: 4000, b: Math.max(0, 41 - (rt.flags.ek || 0) - (rt.flags.principalsDead ? 2 : 0)), b0: 41 });
tano.sides = { a: { name: '滝川の織田軍', mon: 'oda' }, b: { name: '武田の残る侍', mon: 'takeda' } };
tano.famous = [];
tano.date = () => '天正十年三月十一日　春・午前';
tano.canSkip = (rt) => rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '';
tano.skip = (rt) => {
  if (rt.phase !== 'brief' || rt.over || rt.flags.ending) return;
  tano.valley(rt);
};
tano.history = '田野の柵は信長公記に記される平屋敷の囲いで、城壁ではない。信長公記巻十五によると、三月十一日、滝川一益は険しい山中を捜し、田野の平屋敷に柵を設けた勝頼の一行を見つけた。武田の者は打って出て戦い、土屋昌恒も奮戦した。勝頼と信勝はこの地で命を絶った。侍四十一人、上臈・侍女五十人という人数は信長公記に基づく。父子はこの侍の人数に含め、戦う守兵は三十九人に分ける。甲陽軍鑑では戦死者を四十四人とも伝え、人数や最期の様子には異同がある。織田方の三千から四千という兵数は復元の目安。崖道の片手千人斬りは後の伝えで、ゲームの道幅・段の順・鉄砲の合図は地形を使った遊びのための復元である。当日の天気と川幅、河尻の細かな持ち場は確定できない。午前の光と弱い風は補完である。景徳院は後に建てられ、当時ここに城や寺の大きな門はない。 各備えの兵数と将ごとの細かな持ち場は、家中の組み方と地形から復元した目安で、史料に確かな布陣図が伝わるという意味ではない。';
tano.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  if (!b.player.u.alive || b.flags.ending) return;
  if (b.flags.started) depthBot(b, inp, goTo);
  else goTo(b.player, inp, -62, 4, 3);
};
export { tano };
