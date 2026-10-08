import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
// 長島一向一揆：包囲の柵 → 長島の降伏と退城 → 射撃後の反撃 → 中江・屋長島の包囲と火。
// 信長公記巻七・九月二十九日条を芯にする。舟と三川の寸法・局地の持ち場は遊び用の復元。
// 北（-z）は輪中、南（+z）は織田の岸、東（+x）は川口。史実の二か月余を終日の持ち場に縮める。
import * as THREE from 'three';
import { nobori, hut, campfire, tawara, dou, romon, village, kobune, kabukimon, solidRect, solidSeg, ishigaki, makeKitBatch, finalizeKitBatch, SOLIDS } from './props.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCastlePlan, inPoly } from './castle_plan.js';
import { goten, monomi } from './castle_parts.js';
import { addInterior } from './naka.js';
import { benchRoads } from './yamalift.js';
import { whenCgt, cgtScene, cgtSpend, KitBatch, kitStoneSeg } from './cgt.js';
import { woodTex } from './nature.js';
import { Garan } from './temple1571.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { poseArms } from './units.js';
import { gauss, enemyGroup, allyGroup, nm, unitPos, wallLine, brokenWall } from './bhelp.js';
import { dress, gone } from './b_inabayama.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { attachFireSpread } from './siege_fire.js';
import { YANAGASHIMA, NAGASHIMA, TSUTSUMI, NAKASU, NAGASHIMA_ALL_PLAN, FORT_BUILDINGS, FORT_ROADS } from './castles/nagashima.js';
import { makeKakoi, advanceDay, campWear } from './kakoi.js';
import { battleEvent, EVENT_MESSENGER, EVENT_VOLLEY, EVENT_FIRE_START } from './battle_events.js';
import { sightUnit, sightPoint } from './battle_sight.js';
import { sendOrder } from './denrei.js';

// 足軽大将ほどの身分（信長で遊ぶ時は除く）：柴田の手の、岸の持ち場の一手を預かる
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

const CH_Z = -32;                          // 島の手前の川筋
const BANK_Z = -14;                        // こちらの岸（柵を結う所）
const FORT = { x: 0, z: -74 };             // 中江の砦
const GANSHO = { x: -44, z: -82 };         // 願証寺・寺内町（中江の砦とは別の、宗教の中心。軍事拠点と分ける）
const SPOTS = [{ x: 0, z: BANK_Z - 1 }, { x: -26, z: BANK_Z }, { x: 26, z: BANK_Z }];   // 中央から順に、味方と横木を結う
const BUILD_HOLD = 18;                     // 三つの結び目を味方と締める
const WATCH_HOLD = 24;                     // 三つの岸で水路を見張る。信長でも持ち場を回る
const FINAL_HOLD = 24;                     // 敵が散った後は、味方と包囲の口を見張る
const ODA = { flag: 'oda' };
const IKKO = { armor: 0x3a342c, lace: 0x5a5040, cloth: 0x4a4236, hat: 'hachimaki', flag: 'namu' };

function baseHeight(x, z) {
  return .25 * Math.sin(x * .03 + .4) * Math.cos(z * .025) + .15 * Math.sin(z * .07 + x * .02)
    + 1.8 * Math.exp(-((z - (BANK_Z + 5)) ** 2) / 30) + 30 * gauss(x, z, -360, -360, 5000);
}
// 円い盛り土ではなく、柵と同じ多角形の縁を土塁にする。虎口では堤を低くして歩ける坂にする。
function rimDistance(poly, x, z) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0], az = poly[j][1], dx = poly[i][0] - ax, dz = poly[i][1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
function fortHeight(x, z) {
  let h = baseHeight(x, z);
  for (const k of NAGASHIMA_ALL_PLAN.kuruwa) {
    const inside = inPoly(k.poly, x, z), d = rimDistance(k.poly, x, z);
    if (!inside && d >= 3) continue;
    const mouth = Math.max(0, Math.min(1, (Math.hypot(x - k.gapAt[0], z - k.gapAt[1]) - 3) / 3));
    const bank = k.dorui * mouth * Math.max(0, 1 - d / (inside ? 2.6 : 3));
    h = inside ? k.level + bank : h + (k.level + bank - h) * (1 - d / 3);
  }
  return h;
}
const height = benchRoads(fortHeight, FORT_ROADS, 1.2, .8);

// 小屋の外観は材質ごとに全砦でまとめる。室内は共通処理が近づいた時だけ作る。
const ROOM_WOOD = new THREE.MeshLambertMaterial({ color: 0x75634d });
const ROOM_ROOF = new THREE.MeshLambertMaterial({ color: 0x4f4234 });
const ROOM_BOX = new THREE.BoxGeometry(1, 1, 1);
function fortRooms(rt) {
  const bag = [[], []], buildings = {};
  ROOM_WOOD.map = ROOM_ROOF.map = woodTex(); ROOM_WOOD.needsUpdate = ROOM_ROOF.needsUpdate = true;
  const box = (b, material, lx, ly, lz, w, h, d, rx = 0) => {
    const g = ROOM_BOX.clone();
    const uv = g.attributes.uv, sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let n = 0; n < 4; n++) { const i = f * 4 + n; uv.setXY(i, uv.getX(i) * sizes[f][0], uv.getY(i) * sizes[f][1]); }
    g.scale(w, h, d); if (rx) g.rotateX(rx);
    g.translate(b.x + lx, rt.world.heightAt(b.x, b.z) + ly, b.z + lz); bag[material].push(g);
  };
  for (const b of FORT_BUILDINGS) {
    if (b.kind === 'goten') {
      buildings[b.id] = goten(rt, b.x, b.z, { w: b.w, d: b.d, name: b.name, tile: false, naka: true, profile: 'nagashima', doorX: 0, team: 1, noTarget: true });
      continue;
    }
    if (!b.enter) {
      // 火がかかる蔵は個別の見た目を保ち、円の当たりを重ねず、板壁の四角の当たりを使う。
      const firstSolid = SOLIDS.length;
      const mesh = hut(rt.world, b.x, b.z, b.w, b.d, 0, { ita: true, minka: false }); rt.scene.add(mesh);
      const struct = rt.army.addStruct({ x: b.x, z: b.z, r: Math.hypot(b.w, b.d) / 2, w: b.w, d: b.d, mesh, solidR: 0, hp: 180, maxHp: 180, team: 1, name: b.name, flammable: true, moraleOnBurn: 'big' });
      for (let n = firstSolid; n < SOLIDS.length; n++) SOLIDS[n].struct = struct;
      struct.noTarget = true; struct.fireProof = true; buildings[b.id] = { mesh, struct };
      continue;
    }
    const w = b.w, d = b.d, y = rt.world.heightAt(b.x, b.z), H = 2.6, door = 1.4;
    const naka = addInterior(rt.world, { name: b.name, kind: 'nagaya', profile: 'nagashima', x: b.x, z: b.z, team: 1,
      levels: [{ y: y + .18, w, d, h: H - .18 }], door: { side: 1, lx: 0, w: door, h: 2.05 }, approach: { pad: .2, len: .9 }, wins: () => [] });
    // 共通の室内と同じ寸法の壁。入口を飾りの戸や大きな当たりで塞がない。
    box(b, 0, 0, .1, 0, w, .16, d);
    box(b, 0, 0, H / 2, -d / 2, w, H, .12);
    for (const side of [-1, 1]) {
      box(b, 0, side * w / 2, H / 2, 0, .12, H, d);
      box(b, 0, side * (w + door) / 4, H / 2, d / 2, (w - door) / 2, H, .12);
    }
    box(b, 0, 0, (H + 2.23) / 2, d / 2, door, H - 2.23, .12);
    const half = d / 2 + .6, rise = half * .4, slope = Math.hypot(half, rise), angle = Math.atan2(rise, half);
    for (const side of [-1, 1]) {
      box(b, 1, 0, H + rise / 2, side * half / 2, w + 1.2, .12, slope, side * angle);
      // 板葺きの押さえ木と段の筋。
      for (let n = 1; n <= 3; n++) box(b, 1, 0, H + rise * (1 - n / 4) + .1, side * half * n / 4, w + 1.3, .08, .1);
    }
    box(b, 1, 0, H + rise + .08, 0, w + 1.4, .15, .24);
    for (let n = 0; n < 3; n++) box(b, 0, 0, .03 + n * .03, d / 2 + .2 + (2 - n) * .3, 1.7, .06 + n * .06, .3);
    const struct = rt.army.addStruct({ x: b.x, z: b.z, r: Math.hypot(w, d) / 2, solidR: 0, hp: 180, maxHp: 180, team: 1, name: b.name });
    struct.noTarget = true; struct.fireProof = true; buildings[b.id] = { naka, struct };
  }
  for (let n = 0; n < bag.length; n++) {
    const mesh = new THREE.Mesh(mergeGeometries(bag[n], false), n ? ROOM_ROOF : ROOM_WOOD);
    mesh.receiveShadow = true; mesh.userData.camBlock = true; rt.scene.add(mesh);
    for (const g of bag[n]) g.dispose();
  }
  return buildings;
}

// 船の形・材質は共用。開戦時だけ作り、毎コマは位置だけ動かす。
const WOOD = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.95 });
// 小舟は一つの形と材質を複製して使う。
// 動く舟の棹は船体に焼き込まず、同じ寸法の形を組み合わせる。
const POLE_GEO = new THREE.CylinderGeometry(.03, .03, 4.5, 5);
const BOAT_MODEL = new THREE.Group(), boatParts = [[], []];
for (let i = 0; i < 6; i++) {
  const z = (i + .5) / 6 * 6.5 - 3.25;
  const w = 1.6 * (1 - Math.pow(Math.abs(z) / 3.25, 3) * .6);
  const floor = ROOM_BOX.clone(); floor.scale(w, .08, 6.5 / 6 + .02); floor.translate(0, .05 + Math.max(0, Math.abs(z) - 2) * .18, z); boatParts[0].push(floor);
  for (const side of [-1, 1]) {
    const rail = ROOM_BOX.clone(); rail.scale(.07, .5, 6.5 / 6 + .04); rail.translate(side * w / 2, .3, z); boatParts[1].push(rail);
  }
}
for (const z of [-3.15, 3.15]) {
  const end = ROOM_BOX.clone(); end.scale(.65, .65, .1); end.translate(0, .42, z); boatParts[1].push(end);
}
for (const z of [-1.4, .7]) {
  const seat = ROOM_BOX.clone(); seat.scale(1.35, .1, .35); seat.translate(0, .4, z); boatParts[0].push(seat);
}
for (let i = 0; i < boatParts.length; i++) {
  BOAT_MODEL.add(new THREE.Mesh(mergeGeometries(boatParts[i], false), i ? WOOD : DARK));
  for (const g of boatParts[i]) g.dispose();
}
// 岸の飾り舟は元の棹付きの形を保つ。
const MOORED_BOAT = kobune(0, 0, 0, 0, 6.5);
function riverBoat(x, y, z, rot, moving = false) {
  const m = (moving ? BOAT_MODEL : MOORED_BOAT).clone(); m.position.set(x, y, z); m.rotation.y = rot; return m;
}
// 描画済みの川面と同じ水深に舟を浮かべる。毎コマの計算で物を作らない。
function waterHeight(W, x, z) {
  return W.heightAt(x, z) + W.waterDepthAt(x, z);
}

// 九艘・各五人を開戦時から置く。乗船中だけ舟に固定し、岸へ着いた同じ兵が反撃する。
function retreatBoats(rt) {
  const F = rt.flags;
  F.boats = []; F.last = [];
  for (let k = 0; k < 3; k++) {
    const g = enemyGroup(rt, { fixed: true, faction: 'saito', name: '退城した門徒',
      anchor: { x: -24 + k * 24, z: -44 }, facing: 0, formation: 'column', colW: 3,
      order: 'hold', aggro: 0, seekRange: 0, morale: 60, noRout: true, fire: false,
      fleeDir: { x: k === 0 ? -1 : 1, z: 0.4 } },
      // 刀で斬り込む強さは保つが、鎧のない門徒の体力は足軽と同じにする。
      dress([{ type: 'samurai', n: 15, o: { hp: 30, maxHp: 30, kosode: 1, hat: 'hachimaki', flag: null, horse: false, sode: false, kote: 0, menpo: 0 } }], IKKO));
    F.last.push(g);
    for (let j = 0; j < 3; j++) {
      const x = -32 + k * 24 + j * 8, z = -42;
      const m = riverBoat(x, waterHeight(rt.world, x, z), z, 0, true);
      const pole = new THREE.Mesh(POLE_GEO, WOOD); pole.position.set(.55, 1.3, -2); m.add(pole);
      const bt = { m, pole, x, z, landed: false, passengers: [], hull: [], holes: 0, flood: 0, breath: 0 };
      // 舷の線だけ矢玉を止める。船内を箱でふさいで乗員を守らない。
      for (const side of [-1, 1]) {
        const h = solidSeg(x + side * .72, z - 2.8, x + side * .72, z + 2.8, .05);
        h.naka = -1; h.missileType = 'wood'; h.boat = bt; bt.hull.push(h);
      }
      for (let i = 0; i < 5; i++) {
        const u = g.units[j * 5 + i];
        const at = { x: x + (i % 2 ? 0.3 : -0.3), y: m.position.y + .1, z: z - 2 + i * 0.9 };
        u.perch = at; u.pinT = Infinity; u.noTarget = true; u._crouch = true;
        const q = { u, at, dx: at.x - x, dz: at.z - z, aboard: true, escape: false, shore: { x, z: BANK_Z - 3 } };
        u.retreatBoat = bt; u.boatSeat = q; bt.passengers.push(q);
      }
      rt.scene.add(m); F.boats.push(bt);
    }
  }
}
function nearTroops(rt, g) {
  const p = rt.player.u.pos;
  for (const u of g.units) if (u.alive && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 35 && sightUnit(rt, u)) return true;
  return false;
}
function boatTick(rt, dt) {
  const F = rt.flags;
  for (const bt of F.boats) {
    let pilot = null, aboard = 0, escaping = false;
    for (const q of bt.passengers) {
      const u = q.u;
      // 岸で退いた同じ兵が、空いた元の舟へ戻る。泳いで分流を越えさせない。
      if (!q.aboard && u.alive && u.fleeing && !u.woundOut && bt.landed && bt.flood < .2 &&
          Math.hypot(u.pos.x - bt.x, u.pos.z - (BANK_Z - 3)) < 3) {
        q.aboard = q.escape = true; q.dz = 2.7; u.perch = q.at; u.pinT = Infinity; u.fleeing = false;
      }
      if (!q.aboard) continue;
      if (u.alive && !u.woundOut && !u.rearWound) { aboard++; if (!pilot) pilot = q; }
      if (q.escape && u.alive) escaping = true;
    }
    if (F.step >= 2 && rt.t - F.stepT >= 18 && !bt.landed && pilot && bt.flood < .4) bt.z = Math.min(-21, bt.z + dt * .75);
    // 漕ぎ手を失った舟・退く舟は川筋へ戻り、流れに沿う。流向と速さは復元の目安。
    if (F.step >= 2 && (!pilot && !bt.landed || escaping) && bt.z > CH_Z) bt.z = Math.max(CH_Z, bt.z - dt * .65);
    if (F.step >= 2 && (!pilot && !bt.landed || escaping) && bt.z <= CH_Z) bt.x += dt * .45;
    bt.flood = Math.min(1.6, bt.flood + bt.holes * .0015 * dt);
    const water = waterHeight(rt.world, bt.x, bt.z), bed = rt.world.heightAt(bt.x, bt.z);
    bt.m.position.set(bt.x, Math.max(bed, water - bt.flood), bt.z);
    bt.m.rotation.z = Math.min(.3, bt.flood * .2) + Math.sin(rt.t * 1.7 + bt.x) * .025;
    bt.pole.visible = !!pilot && bt.flood < .4 && !bt.landed;
    bt.pole.rotation.x = .35 + Math.sin(rt.t * 2.4) * .4;
    for (let i = 0; i < bt.hull.length; i++) {
      const h = bt.hull[i], x = bt.x + (i ? .72 : -.72);
      h.ax = h.bx = x; h.az = bt.z - 2.8; h.bz = bt.z + 2.8;
      h.x0 = x - .05; h.x1 = x + .05; h.z0 = h.az - .05; h.z1 = h.bz + .05;
      h.yBot = bt.m.position.y; h.yTop = h.yBot + .5;
    }
    for (const q of bt.passengers) {
      const u = q.u;
      if (!q.aboard || u.gone) continue;
      if (u.alive && !u.woundOut && !q.escape && bt.z >= -21 && F.step >= 2) q.dz = Math.min(4, q.dz + dt * 1.2);
      q.at.x = bt.x + q.dx; q.at.z = bt.z + q.dz;
      q.at.y = q.at.z > -18 && !q.escape ? rt.world.heightAt(q.at.x, q.at.z) : bt.m.position.y + .1;
      if (u.alive) { u.perch = q.at; u.pinT = Infinity; u.fleeing = false; u._crouch = q !== pilot; }
      u.pos.set(q.at.x, q.at.y, q.at.z);
      if (u.alive) { u.moving = 0; u.vel.x = u.vel.z = 0; }
      // 遺体も甲板と一緒に運ぶ。共通の倒れる姿勢は保つ。
      u.mesh.position.x = u.pos.x; u.mesh.position.z = u.pos.z; u.mesh.position.y = u.pos.y - (u.alive ? 0 : .1);
      if (u.alive && q.at.z >= BANK_Z - 3 && !q.escape) {
        q.aboard = false; u.perch = null; u.pinT = 0; u._crouch = false;
        if (u.wpn) u.wpn.visible = true;
        u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z);
      }
      // 舷が沈み、足も届かない場合だけ息が続かなくなる。浅い水では溺死させない。
      if (u.alive && bt.flood > .8 && water - bed > 1.6) {
        q.breath = (q.breath || 0) + dt;
        if (q.breath > 20) rt.army.kill(u, null);
      } else q.breath = 0;
      if (q.escape && Math.abs(bt.x) > 170 && Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) > 100 && !sightPoint(rt, u.pos)) {
        rt.army.despawn(u); q.aboard = false;
      }
    }
    if (bt.z >= -21) bt.landed = true;
    // 操船中だけ両手を棹へ向ける。上陸後の刀の構えを上書きしない。
    if (pilot && bt.pole.visible) {
      const u = pilot.u;
      bt.pole.position.set(pilot.dx + .4, 1.3, pilot.dz + .35);
      if (u.hand) { u.hand.position.set(.4, 1.1, .35); u.hand.rotation.set(-bt.pole.rotation.x, 0, 0); poseArms(u, rt.t); }
      if (u.wpn) u.wpn.visible = false;
    }
  }
}

// 杭・横木・縄は準備時に作る。三つの短い区間を順に結い、完成形を一度に出さない。
const WORK_POST = new THREE.CylinderGeometry(.12, .14, 2.4, 6);
const WORK_ROPE = new THREE.CylinderGeometry(.16, .16, .1, 6, 1, true);
function workFence(W, seg) {
  const m = new THREE.Group(), rails = [], posts = [], len = seg[2] - seg[0];
  const count = Math.floor((len + .01) / .4) + 1;
  const knots = new THREE.InstancedMesh(WORK_ROPE, DARK, count * 2), at = new THREE.Object3D();
  let n = 0;
  for (let x = seg[0]; x <= seg[2] + .01; x += .4) {
    const y = W.heightAt(x, seg[1]);
    const post = WORK_POST.clone(); post.translate(x, y + 1.2, seg[1]); posts.push(post);
    for (const h of [.7, 1.7]) { at.position.set(x, y + h, seg[1]); at.updateMatrix(); knots.setMatrixAt(n++, at.matrix); }
  }
  const mesh = new THREE.Mesh(mergeGeometries(posts, false), WOOD); m.add(mesh);
  for (const g of posts) g.dispose();
  knots.count = 0; knots.instanceMatrix.needsUpdate = true; m.add(knots);
  for (const h of [.7, 1.7]) {
    const rail = new THREE.Mesh(ROOM_BOX, WOOD); rail.scale.set(len, .16, .16);
    rail.position.set((seg[0] + seg[2]) / 2, W.heightAt((seg[0] + seg[2]) / 2, seg[1]) + .12, seg[1] + .2);
    rails.push({ mesh: rail, base: rail.position.y - .12, h }); m.add(rail);
  }
  m.userData.work = { rails, knots, count: n }; return m;
}
function workHands(u, t) {
  if (!u?.hand || !u.alive || u.atk || u.target?.alive || u.stagger) return;
  u.hand.position.set(.2, .85, .65); u.hand.rotation.set(-.25 + Math.sin(t * 3) * .12, 0, 0);
  poseArms(u, t); if (u.wpn) u.wpn.visible = false;
}
function fenceProgress(segs, t, duration) {
  const span = duration / segs.length;
  for (let i = 0; i < segs.length; i++) {
    const q = segs[i], k = Math.max(0, Math.min(1, (t - i * span) / span)), work = q.mesh.userData.work;
    for (const r of work.rails) r.mesh.position.y = r.base + .12 + (r.h - .12) * Math.min(1, k * 2);
    work.knots.count = Math.floor(work.count * Math.max(0, (k - .5) * 2));
    if (k >= 1) { q.wall = true; q.segR = .7; }
  }
}
// 報せは本陣から既存の使番の仕組みで運ぶ。届かなくても戦の段は止めない。
function bankNews(rt, text, detail) {
  if (!rt.player.u.alive || rt.flags.ending) return;
  sendOrder(rt, rt.flags.odaCamp.pos, rt.player.u, { id: '長島の報せ', apply: () => {
    if (rt.flags.ending) return;
    const delivered = rt._deliveredNotice; rt._deliveredNotice = true;
    try { rt.say('伝令', text, 4); } finally { rt._deliveredNotice = delivered; }
    battleEvent(rt, EVENT_MESSENGER, rt.player.u.pos, null, 0, true, detail);
  } }, { team: 0, faction: 'oda', name: '岸への伝令' });
}

// 九鬼の安宅船（大きな軍船。矢倉と旗）
const SHIP_GEOMETRY = [new THREE.BoxGeometry(7, 2, 22), new THREE.BoxGeometry(6.4, 2.2, 15), new THREE.BoxGeometry(4, 1.8, 5), new THREE.BoxGeometry(4.8, 0.3, 5.8)];
function ataka() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(SHIP_GEOMETRY[0], DARK); hull.position.y = 0.6; g.add(hull);
  const deck = new THREE.Mesh(SHIP_GEOMETRY[1], WOOD); deck.position.y = 2.6; g.add(deck);
  const top = new THREE.Mesh(SHIP_GEOMETRY[2], WOOD); top.position.set(0, 4.6, -2); g.add(top);
  const roof = new THREE.Mesh(SHIP_GEOMETRY[3], DARK); roof.position.set(0, 5.6, -2); g.add(roof);
  for (const m of g.children) { m.castShadow = true; m.userData.camBlock = true; }
  return g;
}

// 二砦の外を一周囲む。南岸の持ち場と川筋の動線は空ける。
function surroundForts(rt, close = true) {
  const F = rt.flags, batch = makeKitBatch();
  const add = pts => {
    const segs = wallLine(rt, pts, { team: 0, hp: 1e9, name: '包囲の柵', segLen: 10, meshOpt: { batch, mound: false } });
    for (const s of segs) { s.noTarget = true; s.wall = true; s.fireProof = true; }
    F.enclosure.push(...segs);
  };
  if (!F.enclosure) {
    F.enclosure = [];
    // 水路を横切らず陸上に囲む。木戸への通り口は、最後の包囲の下知までは残す。
    add([[-3, -49], [-34, -49], [-34, -108], [31, -108], [31, -49], [3, -49]]);
    add([[45, -52], [35, -52], [35, -103], [70, -103], [70, -52], [51, -52]]);
  }
  if (close) F.closeOrdered = true;
  finalizeKitBatch(rt, batch);
}

const nagashima = {
  noticeOnce: true, // 同じ下知を使番が言い直さない。
  noAllyReports: true, // 遠い勝家の声は運ばず、必要な報せは bankNews で届ける。
  botOrders: true, // 柵作りと岸の守りを、砦への突進で上書きしない。
  // 敵が集まっても共通の退避で持ち場を離れず、岸の後ろへの退避と東への下知は専用の頭に任せる。
  botDefendsFort: true,
  spawn: { x: 6, z: 12, heading: Math.PI },
  world: {
    seed: 1574,
    time: 'day',
    noticeRepeatGap: Infinity, // 共通の声や知らせも、同じ文はこの戦で一度だけ。
    muddy: 0.7,
    riverCross: true,
    waterSlow: true,   // 川・水路が本当に足を遅くする（terrain_tags.js の 'water' タグ。「敵の強さは水」）
    paths: [[[0, 150], [0, 40], [0, BANK_Z + 6]], ...FORT_ROADS, [[-44, -71], [-44, -76]], [[-44, -88], [-38, -88]], [[-44, -71], [-38, -71]]],
    height,
    tint(x, z, h, c) {
      // 葦の生えた川べりと、島の泥
      if (z < BANK_Z + 2 && z > -48) c.lerp({ r: 0.4, g: 0.42, b: 0.3 }, 0.4);
    },
    clear: (x, z) => (Math.abs(x) < 145 && z > -140 && z < 50),
    streams: [
      { pts: [[-240, CH_Z + 4], [-100, CH_Z], [0, CH_Z], [100, CH_Z - 2], [240, CH_Z + 6]], w: 13, depth: 1.1 },
      { pts: [[-240, -136], [-60, -132], [60, -134], [240, -130]], w: 10, depth: 1.8 },
      { pts: [[-58, CH_Z], [-66, -74], [-60, -132]], w: 9, depth: 1.8 },
      { pts: [[82, CH_Z - 2], [84, -74], [82, -134]], w: 9, depth: 1.8 },
      { pts: [[33, -40], [33, -76], [34, -114]], w: 2.5, depth: 0.9 },
      // 長島城は川を堀にする。東の分流と北の川筋をつなぎ、輪中の上に置く。
      { pts: [[84, -58], [110, -57], [136, -58], [138, -96], [136, -132]], w: 5, depth: 1.4 },
    ],
    // 輪中の外の田
    fieldStage: 'stubble',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (z < 30 || z > 180 || Math.abs(x) < 34) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.85;
    },
    trees: 200,
    tufts: 6000,
    treeDensity: (x, z) => (z > -110 && z < 60 ? 0.08 : 0.5),
    groves: [{ x: -90, z: 30, r: 12, n: 14 }, { x: 96, z: 40, r: 12, n: 12 }],
    fleeOut: (x, z, team) => team === 1 && (z > 150 || Math.abs(x) > 180),
    fleeWay(army, u, goal) {
      const bt = u.retreatBoat, q = u.boatSeat;
      if (!bt || !q || q.aboard || !bt.landed || bt.z < -24 || bt.flood >= .2) return goal;
      q.shore.x = bt.x; return q.shore;
    },
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    F.hist = { wajuu: 'HIST_A', kuki: 'HIST_A', surrender: 'HIST_A', counterattack: 'HIST_A', fire: 'HIST_A', forts: 'HIST_B', fortPositions: 'GAME_C', temple: 'HIST_B', localHold: 'GAME_C' };
    F.step = 0; F.built = 0;
    // 戦功は戦後に数える。戦の最中に正確な点数や上限を知る札は出さない。
    rt.award = function (fn) { const before = this.tracker.raw(); fn(this.tracker); return this.tracker.raw() - before; };
    F.sallyHeld = 0; F.finalHeld = 0; F.broken = false;
    retreatBoats(rt);
    boatTick(rt, 0);
    // 実際に舷へ当たった矢玉だけ穴を開ける。乗員の傷を船の被害へ二重に数えない。
    const impact = rt.army.projectileImpact;
    rt.army.projectileImpact = function (x, y, z, type, nx, nz) {
      const hull = this._missileHit?.object;
      if (F.step >= 2 && hull?.boat && type === 'wood') hull.boat.holes++;
      return impact.call(this, x, y, z, type, nx, nz);
    };
    surroundForts(rt, false);
    F.closures = [];
    for (const [x, z] of [[0, -49], [48, -52]]) {
      const segs = wallLine(rt, [[x - 3, z], [x + 3, z]], { team: 0, hp: 700, name: '包囲の口の横木', segLen: 3, mesh: workFence });
      for (const q of segs) { q.noTarget = true; q.wall = false; q.segR = .02; q.fireProof = true; }
      const g = allyGroup(rt, { fixed: true, name: '囲みの人足', noAI: true, anchor: { x, z: z + 2 }, formation: 'line', width: 2, facing: Math.PI, aggro: 0, seekRange: 0 }, [{ type: 'ashigaru', n: 2 }]);
      F.closures.push({ segs, g, x, z: z + 2, t: 0 });
    }
    // 二か月余の兵糧攻め。舟の退城と補給を取り違えない。
    F.kakoi = makeKakoi({ day: 60, foodDays: 5, morale: 60 });
    for (const g of F.last) campWear(g, 30, F.kakoi.morale);
    flagTexture('namu');
    // 五拠点の縄張りと地形を同じデータから作る。新しい守兵は置かない。
    F.C = buildCastlePlan(rt, NAGASHIMA_ALL_PLAN, { baseHeight, perch: false, life: false });
    for (const s of F.C.walls) { s.noTarget = true; s.wall = true; s.fireProof = true; s.hp = s.maxHp = 1e9; }
    F.fwall = F.C.walls.filter(s => s.name === '中江の砦');
    F.ywall = F.C.walls.filter(s => s.name === '屋長島の砦');
    for (const gate of NAGASHIMA_ALL_PLAN.koguchi) {
      rt.scene.add(kabukimon(W, gate.at[0], gate.at[1], gate.w, 0));
      // 開いた木戸の柱と控柱だけに当たり。扉の通り道は空ける。
      for (const side of [-1, 1]) for (const dz of [0, -1.6]) solidRect(gate.at[0] + side * (gate.w / 2 + .17), gate.at[1] + dz, .4, .4);
    }
    F.fortTowers = NAGASHIMA_ALL_PLAN.yagura.map(t => monomi(rt, t.at[0], t.at[1], { name: t.name, team: 1 }));
    // 長島城の木戸脇だけ低い留め石。総石垣にはしない（北伊勢の一般形からの推定）。購入した城部品を利用。
    const stoneBatch = makeKitBatch(), entryStones = [];
    for (const x of [100.5, 107.5]) {
      const top = W.heightAt(x, -66.5) + .2;
      const stone = ishigaki(W, [[x, -68], [x, -65]], { minH: 1, maxH: 1.2, topY: top, out: x < 104 ? -1 : 1, batch: stoneBatch, noKit: true });
      if (!stone.isBatchedPart) rt.scene.add(stone);
      solidRect(x, -66.5, .8, 3, 0, top);
      entryStones.push({ stone, ax: x, az: -68, bx: x, bz: -65, topAt: () => top, botAt: () => top - 1.2, side: x < 104 ? -1 : 1, extA: 0, extB: 0, seed: Math.round(x), zs: .3 });
    }
    finalizeKitBatch(rt, stoneBatch);
    whenCgt(() => {
      if (cgtScene() !== rt.scene || !cgtSpend(9000)) return;
      const kb = new KitBatch(); for (const seg of entryStones) kitStoneSeg(kb, seg);
      if (!kb.n) return;
      rt.scene.add(kb.build({ shadow: false }));
      for (const seg of entryStones) seg.stone.visible = false;
    });
    const buildings = F.fortBuildings = fortRooms(rt);
    F.kuraStruct = buildings.naka_kura.struct; F.kuraStruct2 = buildings.naka_hut.struct;
    F.yanaStruct = buildings.yana_kura.struct;
    F.karatoStruct = buildings.castle_hall.struct; F.tsutsumiStruct = buildings.bank_watch.struct; F.nakasuStruct = buildings.island_watch.struct;
    for (const [x, z] of [[-26, -60], [-4, -58], [14, -58], [28, -62], [44, -60], [62, -66], [100, -72], [120, -76], [-53, -55], [56, -45]]) rt.scene.add(nobori(W, x, z, 'namu', 6));
    // 井戸と俵。川の水をそのまま飲む描写にせず、長島と二砦に井戸を推定する。
    const wellBag = [];
    for (const [x, z] of [[-20, -91], [61, -76], [98, -108]]) {
      for (const [dx, dz, w, d] of [[-1, 0, .2, 2.2], [1, 0, .2, 2.2], [0, -1, 2.2, .2], [0, 1, 2.2, .2]]) {
        const g = ROOM_BOX.clone(); g.scale(w, .75, d); g.translate(x + dx, W.heightAt(x, z) + .38, z + dz); wellBag.push(g);
      }
      solidRect(x, z, 2.2, 2.2); rt.scene.add(tawara(W, x + 2, z + 2, 0, 3));
    }
    const wells = new THREE.Mesh(mergeGeometries(wellBag, false), ROOM_WOOD); wells.userData.camBlock = true; rt.scene.add(wells);
    for (const g of wellBag) g.dispose();
    // ---- 願証寺の寺内町（中江の砦とは別の、宗教の中心。本堂・門・門徒屋敷・倉・船着場。大天守は無い） ----
    // 願証寺の室内図は不明。輪中の寺として、外陣と内陣・僧坊の座敷を推定する。
    F.teranaka = new Garan(rt);
    F.teranaka.build({ id: 'gansho_hondo', name: '願証寺の本堂', kind: 'hondo', x: GANSHO.x, z: GANSHO.z, w: 11, d: 8, enterable: true });
    rt.scene.add(romon(W, GANSHO.x, GANSHO.z + 11, 5.2, 0));
    rt.scene.add(village(W, GANSHO.x - 48, GANSHO.z + 2, { n: 6, r: 10, rot: 0.2, seed: 15748 }));
    // 寺は中江の西の包囲柵（x=-34）より外。棟も石段も柵や本堂と重ねない。
    F.teranaka.build({ id: 'gansho_sobo', name: '願証寺の僧坊', kind: 'sobo', x: GANSHO.x + 6, z: GANSHO.z - 10, w: 5, d: 4, rot: .15, enterable: true });
    F.teranaka.build({ id: 'gansho_kuri', name: '願証寺の庫裏', kind: 'kuri', x: GANSHO.x + 6, z: GANSHO.z + 7, w: 5, d: 4, rot: -.1, enterable: true });
    F.teranaka.finish();
    for (const [dx, dz] of [[-4, 13], [4, 13]]) rt.scene.add(nobori(W, GANSHO.x + dx, GANSHO.z + dz, 'namu', 6));
    // 門前の市（床の低い小屋と俵の店。寺内町は門徒の暮らしの町で、長島城や屋長島の砦の軍事の曲輪とは分ける）
    for (const [dx, dz, r] of [[18, 10, 0.05], [24, 6, -0.1], [22, 14, 0.1]]) rt.scene.add(hut(W, GANSHO.x + dx, GANSHO.z + dz, 3.4, 2.6, r, { wall: 0x8a7a58, h: 2.0 }));
    for (const [dx, dz] of [[16, 5], [26, 11]]) rt.scene.add(tawara(W, GANSHO.x + dx, GANSHO.z + dz, 0.4, 3));
    // 船着場（島の北の水路ぎわ）と舟
    const dockZ = -132;
    rt.scene.add(tawara(W, GANSHO.x + 6, GANSHO.z - 18, 0.2, 4));
    for (const [dx, rot] of [[-6, 0.1], [4, -0.15]]) { const kb = riverBoat(GANSHO.x + dx, waterHeight(W, GANSHO.x + dx, dockZ), dockZ, rot); rt.scene.add(kb); }
    // こちらの水路の舟：開戦から川と舟が見える（輪中の水郷。A112）
    for (const [bx, rot] of [[-34, 1.5], [18, 1.7], [44, 1.45]]) rt.scene.add(riverBoat(bx, waterHeight(W, bx, CH_Z + 1), CH_Z + 1, rot));
    F.ganshoStruct = rt.army.addStruct({ x: GANSHO.x, z: GANSHO.z, r: 5, solidR: 0, hp: 220, maxHp: 220, armor: 0, team: 1, name: '願証寺の本堂', moraleOnBurn: 'big', flammable: true });
    // 既存の遠景の人数だけを保つ。砦の家や物見と重ならない広場へ寄せる。
    for (const [x, z, w, d, count, seed] of [[53, -63, 8, 5, 40, 15747], [107, -76, 8, 5, 20, 15749], [-50, -55, 6, 2, 24, 15750], [48, -44, 5, 1, 24, 15751]])
      W.addDistantArmy({ x, z, w, d, count, facing: 0, armor: IKKO.armor, team: 1, flagTex: flagTexture('namu'), seed, flagRate: .12 });
    // 史実の放火は最後の下知でのみ行う。町・降伏する城を任務外の的にしない。
    for (const q of [F.kuraStruct, F.kuraStruct2, F.yanaStruct, F.ganshoStruct, F.karatoStruct, F.tsutsumiStruct, F.nakasuStruct]) { q.noTarget = true; q.fireProof = true; }
    F.fireTargets = [];
    for (const b of FORT_BUILDINGS) if (b.id.startsWith('naka_') || b.id.startsWith('yana_')) {
      const q = buildings[b.id].struct; q.flammable = true; F.fireTargets.push(q);
    }
    F.FS = attachFireSpread(rt, { C: F.C });
    // 中江の守り。下間頼旦がこの砦で指揮したとは確定できない。
    F.ikkoCamp = camp(rt, { x: 0, z: -80, facing: 0, team: 1, faction: 'saito', mon: 'namu', armor: IKKO.armor, guard: 15, reserve: 0, runTo: { x: 0, z: -58 } });
    F.ikkoCamp.guard.name = '中江の守り';
    F.ikkoCamp.guard.formation = 'yari';
    F.ikkoCamp.guard.noAI = true; // 籠城の守兵は、退城する舟を追って砦から出ない。
    // 包囲中の岸の応酬は復元。六人だけを対岸に置き、川を渡る架空の寄せにはしない。
    F.bankBows = [];
    for (const s of SPOTS) {
      const g = enemyGroup(rt, { fixed: true, faction: 'saito', name: '対岸の弓衆',
        anchor: { x: s.x, z: CH_Z - 8 }, facing: 0, formation: 'line', width: 2,
        order: 'hold', aggro: 0, fire: false, noAI: true, noPursue: true, historicalOrders: true,
        fleeDir: { x: 0, z: -1 } },
        dress([{ type: 'bow', n: 2, o: { range: 40, dmg: 5 } }], IKKO));
      for (const u of g.units) { u.perch = { x: u.pos.x, y: u.pos.y, z: u.pos.z }; u.noTarget = true; }
      F.bankBows.push(g);
    }
    W.addDistantArmy({ x: 18, z: -82, w: 10, d: 10, count: 30, facing: 0, armor: IKKO.armor, team: 1, flagTex: flagTexture('namu'), seed: 15745, flagRate: .12 });
    W.addDistantArmy({ x: -14, z: -78, w: 8, d: 8, count: 20, facing: 0, armor: IKKO.armor, team: 1, flagTex: flagTexture('namu'), seed: 15746, flagRate: .12 });
    // ---- こちらの岸：織田の陣（信長と旗本。後ろの大軍が控え） ----
    // 岸の手前に構える織田の手（見た目だけ。起こさない）と、二月の籠城で中江の砦・願証寺から上がる炊ぎの煙（川向こうに人が籠もっている事を見せる）
    for (const [x, z, sd, k] of [[-30, -2, 15752, 'oda'], [36, 0, 15753, 'eiraku']]) W.addDistantArmy({ x, z, w: 16, d: 14, count: 60, facing: Math.PI, armor: 0x2b3140, team: 0, flagTex: flagTexture(k), seed: sd, flagRate: .12 }).army.noWake = true;
    for (const [x, z, sz] of [[FORT.x + 6, FORT.z - 6, 1.8], [GANSHO.x, GANSHO.z, 2.2]]) W.addSmokeColumn(x, W.heightAt(x, z) + 3, z, { size: sz });
    F.odaCamp = camp(rt, { x: 0, z: 60, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 18, reserve: 0, runTo: { x: 0, z: BANK_Z + 8 } });
    // 北向きの本陣では、護衛も前（北）へ。共通の南向き配置をそのまま使わない。
    F.odaCamp.guard.anchor.z = 46;
    F.odaCamp.guard.formation = 'yari';
    // 旗本は本陣を守る。指定がないと共通の頭が岸へ攻め出し、結った柵に取り付いてしまう。
    F.odaCamp.guard.guard = true;
    if (F.odaCamp.general) F.odaCamp.general.group.noAI = true;
    for (const u of F.odaCamp.guard.units) {
      const at = F.odaCamp.guard.slotPos(u.slot, F.odaCamp.guard.initial);
      u.pos.set(at.x, W.heightAt(at.x, at.z), at.z); u.mesh.position.copy(u.pos);
    }
    rt.scene.add(tawara(W, -14, 52, 0.3, 6));
    for (const [x, z, k] of [[-8, 34, 'oda'], [8, 34, 'eiraku'], [-40, BANK_Z + 10, 'oda'], [40, BANK_Z + 10, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const s of SPOTS) rt.scene.add(tawara(W, s.x + 4, s.z + 8, 0.2, 2));
    F.fenceWork = SPOTS.map((s) => wallLine(rt, [[s.x - 7, s.z], [s.x + 7, s.z]], { team: 0, hp: 700, name: '結いかけの柵', segLen: 5, mesh: workFence }));
    for (const segs of F.fenceWork) for (const q of segs) { q.noTarget = true; q.wall = false; q.segR = 0.02; }
    // 九鬼の船団（東の川筋・海の封鎖）：川口をふさぎ、ゆっくり動きながら遠くの射撃を見せる
    F.ship = ataka();
    F.ship.position.set(84, waterHeight(W, 84, CH_Z - 2) - 0.45, CH_Z - 2);
    F.ship.rotation.y = Math.PI / 2 + 0.1;
    rt.scene.add(F.ship);
    const sn = nobori(W, 84, CH_Z - 2, 'oda', 5); sn.position.y = F.ship.position.y + 5.6; rt.scene.add(sn);
    F.ships = [{ m: F.ship, flag: sn, x0: 60, x1: 110, z: CH_Z - 2, x: 84, dir: 1, speed: 0.6, soundPos: { x: 84, z: CH_Z - 2 }, t: 4 }];
    for (const [x0, x1, z, sp] of [[118, 170, CH_Z + 4, 0.5], [40, 76, CH_Z - 6, 0.45]]) {
      const m2 = ataka();
      const x = (x0 + x1) / 2;
      m2.position.set(x, waterHeight(W, x, z) - 0.45, z);
      m2.rotation.y = Math.PI / 2 + 0.1;
      rt.scene.add(m2);
      const sn2 = nobori(W, x, z, 'oda', 5); sn2.position.y = m2.position.y + 5.6; rt.scene.add(sn2);
      F.ships.push({ m: m2, flag: sn2, x0, x1, z, x, dir: 1, speed: sp, soundPos: { x, z }, t: 3 + Math.random() * 3 });
    }
    // ---- 柴田勝家の手（自分の持ち場）と、柵を結う者 ----
    F.shiba = allyGroup(rt, { name: '柴田勝家の手', fixed: true, anchor: { x: 0, z: BANK_Z + 8 }, facing: Math.PI, width: 8, aggro: 10, formation: 'yari', yariRanks: 3 },
      dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, horse: false, hat: 'kabuto_m', haori: 0x3a2a1a } }, { type: 'ashigaru', n: 16 }, { type: 'bow', n: 4 }], ODA));
    F.shibaU = F.shiba.units[0];
    F.teppo = allyGroup(rt, { name: '織田の鉄砲衆', fixed: true, anchor: { x: 34, z: BANK_Z + 6 }, facing: Math.PI, width: 6, formation: 'line', ranks: 2, aggro: 36, fire: false },
      dress([{ type: 'busho', n: 1, o: { name: '滝川一益', invuln: true, horse: false } }, { type: 'gun', n: 12 }], ODA));
    rt.after(3, () => rt.say('鉄砲頭', '一揆勢は舟でも渡ってくる。柵の外を見張れ', 3));
    F.oda = [F.shiba, F.teppo];
    // 地形に固定した出現場所を守った上で、大将は槍の列の後ろへ置く。
    for (const g of F.oda) {
      const u = g.units[0];
      g.historicalOrders = true; g.noPursue = true;
      // 初めだけ後ろへ置いても、共通の並び直しで先頭へ戻る。持ち場も後列にする。
      const oldSlot = g.slotPos, rear = { x: 0, z: 0 };
      g.slotPos = function (i, n) {
        if (i !== u.slot || this.order === 'path') return oldSlot.call(this, i, n);
        rear.x = this.anchor.x; rear.z = this.anchor.z + 7;
        return rear;
      };
      u.pos.x = g.anchor.x; u.pos.z = g.anchor.z + 7;
      u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.mesh.position.copy(u.pos);
    }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: -10, z: BANK_Z + 12 }, Math.PI, [{ kind: 'spear', n }]);
    // ---- 大軍（軽い作り）：輪中を囲む織田勢 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed, flagRate: .12 });
    DA(-90, 0, 36, 24, 180, Math.PI * 0.65, 0x2b3140, 'oda', 15741);
    DA(110, 4, 36, 24, 180, -Math.PI * 0.65, 0x2b3140, 'eiraku', 15742);
    DA(0, 96, 52, 24, 240, Math.PI, 0x2b3140, 'oda', 15743);
    DA(-150, -150, 36, 24, 160, Math.PI * 0.25, 0x2b3140, 'oda', 15744);
    for (const [x, z] of [[-24, 50], [24, 52]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', hi(rt) ? '柴田の一手を率い、岸を守れ' : '柴田勝家の下知を待て', 'main');
    rt.say('柴田勝家', `${nm(rt)}、対岸が中江の砦じゃ。島の門徒は長の囲みで、飢えに苦しんでおる`, 4.5);
    rt.say('柴田勝家', '岸に柵を結え。川筋を見張り、打って出る門徒を食い止めよ', 4.5);
    rt.marker('shiba', unitPos(F.shibaU), '柴田勝家', {});
    rt.after(5, () => this.build(rt));
  },

  // ① 柵を結う
  build(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    // 終日の持ち場へ移る間に日を進める。包囲の長さを待ち時間へは換えない。
    advanceDay(F.kakoi, 3);
    for (const g of F.last) campWear(g, 40, F.kakoi.morale);
    for (const g of F.bankBows) campWear(g, 40, F.kakoi.morale);
    campWear(F.ikkoCamp.guard, 40, F.kakoi.morale);
    rt.setPhase('build');
    rt.unmark('shiba');
    rt.obj('main', rt.G.lord ? `岸の柵を結わせ、門徒に備えよ（${SPOTS.length}か所）` : '三つの印で、味方と横木を結え', 'main');
    rt.say('柴田勝家', '杭に横木を渡せ！　縄を締め、川岸を固めよ', 3);
    for (const g of F.bankBows) { g.fire = true; for (const u of g.units) u.noTarget = false; }
    // 信長で遊ぶ時：柵は足軽が結う（手柄にはしない）。当主は岸で門徒に備える
    F.builders = []; F.personalWork = [0, 0, 0];
    const workers = F.shiba.units.filter((u) => u.alive && !u.fleeing && !u.woundOut && !u.noTarget && u.type === 'ashigaru');
    for (let i = 0; i < SPOTS.length; i++) {
      const s = SPOTS[i], u = workers[i], mate = workers[i + 3];
      if (u) F.builders.push({ u, mate, mateAt: { x: s.x - 1, z: s.z + 1 }, i, x: s.x + 1, z: s.z + 1, t: 0 });
    }
    const oldSlot = F.shiba.slotPos;
    F.shiba.slotPos = function (i, n) {
      for (const job of F.builders) if (F.step === 1 && !F.raised?.[job.i]) {
        if (job.u.slot === i) return job;
        if (job.mate?.slot === i) return job.mateAt;
      }
      return oldSlot.call(this, i, n);
    };
    if (rt.G.lord) F.helped = true;
    else {
      for (let i = 0; i < SPOTS.length; i++) {
        const s = SPOTS[i];
        rt.marker('s' + i, { x: s.x, z: s.z + 2 }, '味方と横木を結う', { h: 2 });
        rt.zone('s' + i, s.x, s.z + 2, 3);
        rt.addInteract('s' + i, { x: s.x, z: s.z + 2 }, '味方と横木を結う', () => {
          const job = F.builders.find((j) => j.i === i), u = job?.u;
          if (F.step !== 1 || F.raised?.[i] || !u?.alive || u.fleeing || u.woundOut || u.rearWound || u.atk || u.target?.alive || Math.hypot(u.pos.x - job.x, u.pos.z - job.z) >= 2.5) return;
          F.participated = true; F.personalBuilt = (F.personalBuilt || 0) + 1; this.raise(rt, i);
        }, { r: 3, hold: BUILD_HOLD });
      }
    }
    // 降伏前の架空の寄せは足さない。退城する兵は既に舟にいる。
  },

  raise(rt, i) {
    const F = rt.flags;
    const s = SPOTS[i];
    if (F.raised?.[i]) return;
    (F.raised || (F.raised = []))[i] = true;
    rt.uninteract('s' + i); rt.unmark('s' + i); rt.unzone('s' + i);
    const segs = F.fenceWork[i];
    fenceProgress(segs, BUILD_HOLD, BUILD_HOLD);
    for (const q of segs) { q.noTarget = false; q.wall = true; q.segR = 0.7; q.name = '柵'; }
    F.fence = [...(F.fence || []), ...segs];
    sfx('wood', 0.8);
    F.built++;
    if (F.helped) {
      if (F.built >= SPOTS.length) { rt.obj('main', '岸の印で舟を見張れ', 'main'); rt.marker('workWatch', { x: 0, z: BANK_Z + 5 }, '舟の見張り場'); }
      return;
    }   // 足軽が代わりに結った分は手柄にしない
    if (F.personalBuilt === 1) rt.award((t) => { t.special = { label: '味方と岸に柵を結った', pts: 12 }; }, '味方と横木を結った');
    if (F.built >= SPOTS.length) { rt.obj('main', '岸の印で舟を見張れ', 'main'); rt.marker('workWatch', { x: 0, z: BANK_Z + 5 }, '舟の見張り場'); }
    else rt.objProgress('main', `残る印で横木を結え　${F.built}／${SPOTS.length}か所`);
  },

  watch(rt) {
    const F = rt.flags;
    F.step = 1.25; F.stepT = rt.t; F.watchAt = 0; F.watchTime = 0;
    for (const job of F.builders || []) for (const u of [job.u, job.mate]) if (u?.alive && u.wpn) u.wpn.visible = true;
    rt.unmark('workWatch');
    rt.obj('main', '中央・西・東の岸で舟を見張れ', 'main');
    rt.say('柴田勝家', '中央から西、東へ回れ。川筋の舟を見落とすな', 3);
    rt.marker('watch', { x: SPOTS[0].x, z: BANK_Z + 5 }, '水路を見張る持ち場');
  },

  // ② 降伏して退城する舟。射撃の下知後は実際の弾と傷が通る。舟を討つ任務にはしない。
  boats(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    advanceDay(F.kakoi, 6);
    for (const g of F.last) campWear(g, 55, F.kakoi.morale);
    for (const g of F.bankBows) campWear(g, 55, F.kakoi.morale);
    campWear(F.ikkoCamp.guard, 55, F.kakoi.morale);
    // 降伏の報せで岸の応酬を止める。退城舟への射撃と、その後の反撃を混ぜない。
    for (const g of F.bankBows) {
      g.fire = false;
      for (const u of g.units) { u.target = null; u.atk = null; u.noTarget = true; u.pinT = Infinity; }
    }
    rt.setPhase('boats'); rt.unmark('workWatch'); rt.unmark('watch');
    F.shiba.fire = false;
    rt.banner('長島、降伏', '飢えに追い詰められた城の者が、舟で退く');
    rt.obj('main', '岸の柵へ戻り、退く舟を見張れ', 'main');
    rt.marker('bank', { x: 0, z: BANK_Z + 5 }, '岸の持ち場');
    bankNews(rt, '長島城、降伏にござる。城の者は舟で退くとのこと。岸の備えを解かれぬよう', '長島城が降った。舟で退城する');
    for (const g of F.last) { g.anchor.z = BANK_Z + 2; g.aggro = 0; }
    rt.after(18, () => {
      if (F.ending || F.step !== 2 || !rt.player.u.alive) return;
      F.teppo.fire = true;
      for (const g of F.last) for (const u of g.units) if (u.alive && !u.woundOut && !u.rearWound) u.noTarget = false;
      battleEvent(rt, EVENT_VOLLEY, { x: 0, z: CH_Z }, F.teppo, 0, true, '退く舟へ、織田方の鉄砲が放たれた');
      rt.banner('退く舟へ鉄砲', '退城の舟へ鉄砲が放たれる');
      if (nearTroops(rt, F.teppo)) rt.say('足軽', '退く舟にも撃つんか……！', 4);
    });
    // 射撃を続けて反撃の前に舟の者を全滅させない。矢玉と傷はそのまま残す。
    rt.after(24, () => { if (F.step === 2 && !F.ending) F.teppo.fire = false; });
    // 降伏の舟を見届けてから射撃。約三十秒かけて岸へ寄り、同じ門徒が反撃する。
    rt.after(55, () => this.lastSally(rt));
  },

  // ④ 反撃ののち、中江・屋長島の外へ柵をつなぎ直す。
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5; F.stepT = rt.t; F.finalHeld = 0; F.finalSafe = 0; F.finalStarted = null;
    rt.setPhase('enclose'); rt.unmark('bank');
    surroundForts(rt);
    rt.obj('main', '東の柵へ下がり、三つの印を見回れ', 'main');
    rt.marker('east', { x: 24, z: BANK_Z + 6 }, '東の柵の持ち場');
    F.finalChecks = [false, false, false]; F.finalChecked = 0;
    for (let i = 0; i < 3; i++) {
      const x = 20 + i * 6, id = 'check' + i;
      rt.marker(id, { x, z: BANK_Z + 6 }, '柵の守りを確かめる');
      rt.addInteract(id, { x, z: BANK_Z + 6 }, '柵の守りを確かめる', () => {
        if (F.step !== 3.5 || !F.finalReady || F.finalChecks[i]) return;
        F.finalChecks[i] = true; F.finalChecked++;
        if (F.finalChecked === 3) { F.finalHeld = 0; F.finalSafe = 0; }
        rt.uninteract(id); rt.unmark(id);
      }, { r: 3, hold: 12 });
    }
    rt.say('柴田勝家', F.sallyFailed ? '敵に向き直れ！　味方と東の柵へ下がれ' : '中江と屋長島の囲みを固めよ。敵を追わず、東の柵を守れ', 4);
    rt.after(8, () => {
      if (F.ending || F.step !== 3.5) return;
      bankNews(rt, '織田信広様をはじめ、御一門に討死多しとの報せにござる', '一門の討死の報せが届いた');
    });
    for (const g of F.oda) {
      g.order = 'path'; g.formation = 'column'; g.colW = 2;
      g.path = [[g.anchor.x, BANK_Z + 10], [g === F.shiba ? 18 : 36, BANK_Z + 10], [g === F.shiba ? 18 : 36, BANK_Z + 6]];
      g.pathIdx = 0; g.aggro = 4;
      g.onArrive = (q) => { q.order = 'hold'; q.formation = q === F.shiba ? 'yari' : 'line'; q.facing = Math.PI; q.aggro = 14; };
    }
  },

  // ③ 舟への射撃を受けた門徒の反撃。鎧のない歩兵が、岸を南へ突き抜ける。
  lastSally(rt) {
    const F = rt.flags;
    if (F.ending || !rt.player.u.alive || F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    F.shiba.fire = true; F.teppo.fire = true;
    rt.setPhase('sally');
    rt.unmark('bank');
    F.sallyHeld = 0; F.bankAway = 0;
    rt.banner('岸へ斬り込む一揆勢', '鉄砲を受けた門徒が、抜き身の刀で陣へ迫る');
    rt.obj('main', '柵の内で、斬り込む門徒を受け止めよ', 'main');
    rt.say('柴田勝家', '門徒が斬り込むぞ！　構えよ。味方の列を離れるな', 4);
    rt.marker('bank', { x: 0, z: BANK_Z + 5 }, '岸の持ち場');
    // 退城した同じ兵が斬り込む。新しい兵も、後ろに追従する数百人も作らない。
    for (const g of F.last) {
      g.noRout = false;
      // 射撃への怒りで立ち向かう気力は戻るが、空腹の疲れは戻さない。
      g.morale = Math.max(g.morale, 82);
      for (const u of g.units) if (u.alive) u.fat = Math.max(u.fat || 0, 0.55);
      g.order = 'attack'; g.aggro = 22; g.seekRange = 90;
      g.formation = 'column'; g.colW = 3; g.anchor.z = BANK_Z + 18;
    }
    rt.say('足軽', 'あいつら、抜き身で来るがや！', 3);
    for (const [g, x] of [[F.shiba, 0], [F.teppo, 30]]) { g.order = 'hold'; g.anchor = { x, z: BANK_Z + 3 }; g.aggro = 14; }
  },

  win(rt) {
    const F = rt.flags;
    const held = F.held && F.watchDone && !F.sallyFailed && !F.broken && F.sallyDefended && rt.player.u.alive;
    // 放火の下知まで進んだら、斬り合いが残っていても任務の成否を確定する。
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    for (const id of ['shiba', 'workWatch', 'watch', 'bank', 'east']) rt.unmark(id);
    for (let i = 0; i < 3; i++) { rt.unmark('check' + i); rt.uninteract('check' + i); }
    for (let i = 0; i < SPOTS.length; i++) { rt.unmark('s' + i); rt.unzone('s' + i); rt.uninteract('s' + i); }
    rt.obj('main', held ? '岸と包囲の柵を守り切った' : '持ち場を守り切れなかった', 'main');
    if (held) {
      rt.objDone('main');
      rt.award((t) => { t.main = true; t.special = { label: '岸と包囲の柵を守った', pts: 20 }; }, '岸と包囲の柵を守った');
    } else {
      rt.objFail('main');
      const why = F.leftBank ? '岸を離れ、持ち場を失った' : F.broken ? (F.breakThrough >= 4 ? '岸の背後へ敵が抜け、守りを失った' : '岸の槍と鉄砲の守りが崩れた') : F.sallyFailed ? '岸の反撃を受け止めきれなかった' : !F.watchDone ? '三つの岸を見回る務めを果たせなかった' : !F.sallyDefended ? '岸に踏みとどまれなかった' : F.finalChecked < 3 ? '東の柵を三か所確かめ切れなかった' : '東の柵の見張りを果たせなかった';
      rt.objProgress('main', why); rt.say('伝令', why, 4);
    }
    rt.tracker.main = !!held;
    // 最後に火がかかるのは残る中江・屋長島。願証寺や既に降った長島を混ぜない。
    rt.after(3, () => {
      // 各砦の二か所から着火。ほかの建物へも燃え移るが、火は同時に四つまで。
      for (const s of F.fireTargets) s.fireProof = false;
      for (const s of [F.kuraStruct, F.kuraStruct2, F.yanaStruct, F.fireTargets.find(q => q !== F.yanaStruct && q.x > 35)]) if (s && s.alive) {
        s.fireProof = false; s.burn = 3; rt.army.igniteStruct(s, s);
      }
      battleEvent(rt, EVENT_FIRE_START, FORT, null, 1, true, '中江・屋長島に火がかけられた');
      rt.banner('中江・屋長島に火', '柵で囲まれた二つの砦から、煙が上がる');
      rt.say('伝令', '中江、屋長島に火の手！　女も子も籠もっておる。柵に阻まれ、逃げ場がござらぬ', 4);
    });
    rt.after(8, () => rt.say('語り', '二つの砦に籠もる男女およそ二万人が焼かれたと、『信長公記』は伝える', 4));
    rt.after(13, () => rt.finish({ scriptedEnd: true }, 0.2));
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    boatTick(rt, dt);
    if (F.FS) F.FS.tick(dt);
    if (F.closeOrdered) {
      let closed = true;
      for (const job of F.closures) {
        let workers = 0;
        for (const u of job.g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.atk && !u.target?.alive && Math.hypot(u.pos.x - job.x, u.pos.z - job.z) < 3) workers++;
        if (workers >= 2 && job.t < BUILD_HOLD) { job.t = Math.min(BUILD_HOLD, job.t + dt); for (const u of job.g.units) workHands(u, rt.t); }
        fenceProgress(job.segs, job.t, BUILD_HOLD);
        if (job.t >= BUILD_HOLD) for (const u of job.g.units) if (u.alive && u.wpn) u.wpn.visible = true;
        if (job.t < BUILD_HOLD) closed = false;
      }
      F.enclosureClosed = closed;
    }
    // 崩れた隊の印は消す（古い印が「あちらじゃ」の行き先にならないように）
    for (let i = rt.markers.length - 1; i >= 0; i--) { const m = rt.markers[i]; if (m.group && gone(m.group)) rt.unmark(m.id); }
    // 九鬼の船団：川口を行き来し（海の封鎖）、ときどき遠くの射撃を見せる（F.ending の間も動かす）
    for (const sh of F.ships || []) {
      const r = (sh.x1 - sh.x0) / 2, mid = (sh.x0 + sh.x1) / 2;
      if (sh.phase == null) { sh.phase = Math.asin((sh.x - mid) / r); sh.baseZ = sh.z; }
      sh.phase += sh.speed * dt / r;
      sh.x = mid + r * Math.sin(sh.phase); sh.z = sh.baseZ + 1.5 * (1 - Math.cos(sh.phase));
      const yaw = Math.atan2(r * Math.cos(sh.phase), 1.5 * Math.sin(sh.phase));
      const turn = Math.atan2(Math.sin(yaw - sh.m.rotation.y), Math.cos(yaw - sh.m.rotation.y));
      sh.m.rotation.y += Math.max(-0.45 * dt, Math.min(0.45 * dt, turn));
      sh.m.position.set(sh.x, waterHeight(rt.world, sh.x, sh.z) - 0.45, sh.z);
      sh.flag.position.set(sh.x, sh.m.position.y + 5.6, sh.z);
      sh.flag.rotation.y = sh.m.rotation.y;
      if (F.step >= 3 && !F.ending && (sh.t -= dt) <= 0) {
        sh.t = 25 + Math.random() * 10;
        sh.soundPos.x = sh.x; sh.soundPos.z = sh.z;
        rt.army.play('gun', sh.soundPos, 0.6);
        rt.army.smoke(sh.x - 3, sh.m.position.y + 4, sh.z, -1, 0, 1.2);
      }
    }
    if (F.ending || !rt.player.u.alive) return;
    // 反撃中の深手は、実際に打ち込む敵が近い時だけ知らせる。同じ警告は一度だけ。
    if ((F.step === 3 || F.step === 3.5) && rt.player.u.hp < rt.player.u.maxHp * 0.5 && rt.t >= (F.guardWarnT || 0)) {
      const p = rt.player.u.pos;
      for (const e of rt.army.threats || []) {
        if (!e.alive || e.fleeing || e.noTarget || e.type === 'gun' || e.type === 'bow' ||
            Math.abs(e.pos.y - p.y) >= 3 || Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > 6 ||
            rt.army.wallBetween(p, -1, e.pos)) continue;
        F.guardWarnT = rt.t + 8;
        const tired = rt.player.sta < rt.player.maxSta * 0.3, bit = tired ? 1 : 2;
        if (!((F.guardWarned || 0) & bit)) {
          F.guardWarned = (F.guardWarned || 0) | bit;
          rt.bark(tired ? '気力が少ない！　味方の後ろへ下がり、敵が離れたら構えを解け' : '傷が深い！　敵に向き直り、味方の後ろへ下がれ', true);
        }
        break;
      }
    }
    if (F.step === 1) {
      // 結いに来ない時は、柴田が場所とやり方を言い、それでも来なければ足軽が残りを結う（待たせきりにしない）
      const w = rt.t - F.stepT;
      for (const job of F.builders) if (!F.raised?.[job.i]) {
        if (!job.u.alive || job.u.fleeing || job.u.woundOut || job.u.gone || job.u.noTarget) { job.t = 0; continue; }
        const at = !job.u.atk && !job.u.target?.alive && !job.u.stagger && Math.hypot(job.u.pos.x - job.x, job.u.pos.z - job.z) < 2.5 &&
          (!rt.G.lord && !F.helped || job.mate?.alive && !job.mate.fleeing && !job.mate.woundOut && !job.mate.gone && !job.mate.noTarget && !job.mate.atk && !job.mate.target?.alive && !job.mate.stagger && Math.hypot(job.mate.pos.x - (job.x - 2), job.mate.pos.z - job.z) < 2.5);
        if (at) { workHands(job.u, rt.t); if (job.mate) workHands(job.mate, rt.t); }
        // 本人の長押しも人足と一緒に行う。離したら済んだ結び目までを残す。
        if (!rt.G.lord && !F.helped) {
          if (at && rt.holdId === 's' + job.i) F.personalWork[job.i] = Math.max(F.personalWork[job.i], rt.holdT || 0);
          fenceProgress(F.fenceWork[job.i], F.personalWork[job.i], BUILD_HOLD);
        } else {
          job.t = at ? Math.min(BUILD_HOLD, job.t + dt) : 0;
          fenceProgress(F.fenceWork[job.i], job.t, BUILD_HOLD);
          if (job.t >= BUILD_HOLD) this.raise(rt, job.i);
        }
      }
      if (w > 15 && !F.boatNews) { F.boatNews = true; rt.say('物見', '島の船着きに人が集まっておる。舟を出すつもりにござろう', 3); }
      rt.objProgress('main', F.built < SPOTS.length ? (rt.G.lord ? `岸で舟に備えよ　柵 ${F.built}／${SPOTS.length}か所` : F.participated ? `残る印で横木を結え　${F.built}／${SPOTS.length}か所` : `三つの印で横木を結え　${F.built}／${SPOTS.length}か所`) : '岸の印で舟を見張れ');
      if (!rt.G.lord && !F.participated && F.built < SPOTS.length && w > 12 && !F.nudge) { F.nudge = true; rt.say('柴田勝家', `${nm(rt)}、中央の横木からじゃ！　縄を締めたら西、東へ回れ`, 4); }
      if (w > 10 && rt.t >= (F.rescueWorkT || 0)) {
        F.rescueWorkT = rt.t + 4;
        for (let i = 0; i < SPOTS.length; i++) {
          if (F.raised?.[i]) continue;
          const old = F.builders.find((j) => j.i === i);
          if (old && (!old.mate?.alive || old.mate.fleeing || old.mate.woundOut || old.mate.gone || old.mate.noTarget)) {
            old.mate = F.shiba.units.find((q) => q.alive && !q.fleeing && !q.woundOut && !q.gone && !q.noTarget && q.type === 'ashigaru' && !F.builders.some((j) => (j.u === q || j.mate === q) && !F.raised?.[j.i]));
            old.t = 0;
          }
          if (old && old.u.alive && !old.u.fleeing && !old.u.woundOut && !old.u.gone) {
            if (!rt.G.lord && !F.helped && !rt.holdId && w > 120) {
              F.helped = true;
              for (const job of F.builders) job.t = F.personalWork[job.i];
              for (let j = 0; j < SPOTS.length; j++) { rt.uninteract('s' + j); rt.unmark('s' + j); rt.unzone('s' + j); }
              rt.say('足軽', '舟が出るぞ。残りはわしらで結うでよ', 3);
            }
            continue;
          }
          const u = F.shiba.units.find((q) => q.alive && !q.fleeing && !q.woundOut && !q.gone && q.type === 'ashigaru' && !F.builders.some((j) => (j.u === q || j.mate === q) && !F.raised?.[j.i]));
          if (!u) continue;
          if (old) { old.u = u; old.t = 0; }
          else F.builders.push({ u, i, x: SPOTS[i].x + 1, z: SPOTS[i].z + 1, mateAt: { x: SPOTS[i].x - 1, z: SPOTS[i].z + 1 }, t: 0 });
          // 倒れた人足だけを替え、本人が結う印は残す。
        }
      }
      if (F.built < SPOTS.length && w > 100 && !F.nudge2) { F.nudge2 = true; rt.say('足軽', 'お頭、手が足りん。わしらも手を貸すでよ', 3); }
      // 自分で三か所を結う猶予を設ける。人足を失った時は残る杭で守る。
      if (F.built >= SPOTS.length || w > 155) {
        if (F.built < SPOTS.length) { F.helped = true; rt.say('柴田勝家', '人足が倒れ、横木が足りぬ。残る杭の内で舟に備えよ', 3); }
        this.watch(rt);
      }
    }
    if (F.step === 1.25) {
      const s = SPOTS[F.watchAt], p = rt.player.u.pos;
      const near = Math.hypot(p.x - s.x, p.z - (BANK_Z + 5)) < 5;
      const facing = Math.cos(rt.player.yaw) < -.5;
      if (near && facing) F.watchTime += dt;
      if (F.watchTime >= WATCH_HOLD) {
        F.watchAt++; F.watchTime = 0;
        if (F.watchAt >= SPOTS.length) { F.watchDone = true; this.boats(rt); }
        else rt.marker('watch', { x: SPOTS[F.watchAt].x, z: BANK_Z + 5 }, '水路を見張る持ち場');
      }
      if (F.step === 1.25) {
        if (Math.floor(rt.t) !== F.watchClock) {
          F.watchClock = Math.floor(rt.t);
          rt.objProgress('main', !near ? '次の岸の印へ回れ' : !facing ? '川を向き、舟を見張れ' : `舟を見張れ　${Math.floor(F.watchTime)}／二十四秒`);
        }
        if (rt.t - F.stepT >= 90 && !F.watchWarned) { F.watchWarned = true; rt.bark('岸の見回りを急げ。舟が出るぞ', true); }
        if (rt.t - F.stepT >= 120) this.boats(rt);
      }
    }
    if (F.step === 3) {
      const w = rt.t - F.stepT;
      const p = rt.player.u.pos;
      const atBank = Math.abs(p.x) < 48 && p.z >= BANK_Z && p.z < BANK_Z + 28;
      if (atBank && !F.broken) { F.sallyHeld += dt; F.bankAway = 0; }
      else if (!F.broken) F.bankAway += dt;
      if (F.bankAway >= 5 && !F.awayWarned) { F.awayWarned = true; rt.bark('岸へ戻れ！　持ち場を空ければ敵が抜けるぞ', true); }
      if (atBank) F.awayWarned = false;
      if (F.bankAway >= 30) { F.leftBank = true; F.broken = true; }
      let through = 0;
      for (const g of F.last) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget && u.pos.z > BANK_Z + 24) through++;
      F.breakThrough = Math.max(F.breakThrough || 0, through);
      if (through > 0 && !F.breakWarned) { F.breakWarned = true; rt.bark('敵が岸の背後へ抜ける！　柵の内で味方と止めよ', true); }
      if (through >= 4 || gone(F.shiba) && gone(F.teppo)) F.broken = true;
      if (Math.floor(w) !== F.lastClock) {
        F.lastClock = Math.floor(w);
        rt.objProgress('main', F.broken ? '東の柵へ下がれ' : !atBank ? `岸の印へ戻れ。離れて${Math.floor(F.bankAway)}秒／三十秒` : '柵の内で味方と敵を止めよ');
      }
      let pressing = false;
      for (const g of F.last) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget && u.pos.z >= BANK_Z - 12 && u.pos.z < BANK_Z + 36 && Math.abs(u.pos.x) < 60) pressing = true;
      // 滞在時間の割合では落とさない。短い退避は許し、長い離脱は先に警告する。
      if (!pressing && w >= 12 || w > 150 || F.broken) {
        F.sallyDefended = !F.leftBank && (F.sallyHeld >= 8 || !pressing && atBank);
        F.sallyFailed = pressing || F.broken;
        this.midB(rt);
      }
    }
    if (F.step === 3.5) {
      const p = rt.player.u.pos;
      let foes = 0;
      for (const g of F.last) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget && Math.hypot(u.pos.x - 24, u.pos.z - (BANK_Z + 6)) < 14) foes++;
      let friends = 0;
      for (const g of F.oda) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget && Math.hypot(u.pos.x - 24, u.pos.z - (BANK_Z + 6)) < 18) friends++;
      const safe = rt.player.u.alive && Math.hypot(p.x - 24, p.z - (BANK_Z + 6)) < 18 && foes === 0 && friends >= 3;
      F.finalReady = safe;
      // 移動の秒数は守備に含めない。本人と味方が合流してから見張りを数える。
      if (F.finalStarted == null && friends >= 3 && Math.hypot(p.x - 24, p.z - (BANK_Z + 6)) < 18) F.finalStarted = rt.t;
      if (safe) { F.finalHeld += dt; F.finalSafe += dt; } else F.finalSafe = 0;
      if (Math.floor(rt.t - F.stepT) !== F.finalClock) {
        F.finalClock = Math.floor(rt.t - F.stepT);
        rt.objProgress('main', Math.hypot(p.x - 24, p.z - (BANK_Z + 6)) >= 18 ? `東の印へ戻れ。残り${Math.max(0, Math.ceil(120 - (rt.t - F.stepT)))}秒` : foes ? '味方の列で敵を押し返せ' : friends < 3 ? '柵の内で味方と合流せよ' : F.finalChecked < 3 ? `三つの印で柵を見回れ　${F.finalChecked}／三か所` : `柵を見張れ　${Math.floor(F.finalSafe)}／二十四秒`);
      }
      if (rt.t - F.stepT >= 90 && !F.deadlineWarn) { F.deadlineWarn = true; rt.bark('東の印へ戻れ。火の下知まで三十秒', true); rt.say('柴田勝家', '火の下知が迫る。東の柵を早う確かめよ', 4); }
      // 三か所を見回って見張る。合流できない時も二分で成否を伝える。
      if (F.finalChecked >= 3 && F.finalHeld >= FINAL_HOLD && F.finalSafe >= FINAL_HOLD || rt.t - F.stepT >= 120 || F.broken || gone(F.shiba) && gone(F.teppo)) { F.held = F.finalChecked >= 3 && F.finalHeld >= FINAL_HOLD && F.finalSafe >= FINAL_HOLD; rt.unmark('east'); this.win(rt); }
    }
  },

  onKill(rt) {
    // 共通の鉄砲組の報告も、煙越しの正確な討ち取り人数にはしない。
    rt.volleyKillN = 0;
  },
  onRout(rt, g) {
    if (g.team !== 1 || rt.flags.routSaid || !nearTroops(rt, g)) return;
    rt.flags.routSaid = true; // 三隊が順に散っても、同じ声は戦を通して一度だけ。
    rt.say('足軽', '門徒が散るぞ。追いかけるでねえ！', 2.5);
  },
  onStructDestroyed(rt, s) {
    if ((rt.flags.fence || []).includes(s)) { brokenWall(rt, s);
      const x = s.seg ? (s.seg[0] + s.seg[2]) / 2 : s.pos?.x || 0;
      const bit = x < -10 ? 1 : x > 10 ? 2 : 4;
      if ((rt.flags.fenceWarned || 0) & bit) return;
      rt.flags.fenceWarned = (rt.flags.fenceWarned || 0) | bit;
      rt.bark(x < -10 ? '西の柵が破られた！' : x > 10 ? '東の柵が破られた！' : '中央の柵が破られた！', true); }
  },
};

// 表示の兵力は遊びの目安。戦う者と、二砦に残る非戦闘の人々の数を分ける。
nagashima.force = () => ({ a: 70000, a0: 70000, b: 10000, b0: 10000 });
nagashima.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '長島の一揆勢', mon: 'namu' } };
nagashima.rts = true;
// 開戦時の局地兵と囲みの人足四人。舟の四十五人を含め約百人＋自分の組と供。追加の波は作らない。
nagashima.noWake = true;
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
nagashima.famous = [];
nagashima.noTaisho = true;
nagashima.noDistantBattle = true;
nagashima.date = () => '天正二年九月二十九日　秋';
nagashima.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '柵の下知まで待つ' : '');
nagashima.skip = (rt) => { if (rt.phase === 'brief') nagashima.build(rt); };
nagashima.history = '伊勢の長島は、木曽川・長良川・揖斐川が海に注ぐ所の輪中の島々で、一向宗の願証寺を中心に門徒の力が強かった。石山本願寺の呼びかけで起った長島の一揆は、元亀元年に信長の弟・織田信興を討ち、その後の織田の攻めも二度退けた。天正二年（1574）七月、信長は陸と海から大軍で島々を囲み、九鬼嘉隆らの船で川と海を断って兵糧攻めにした。篠橋・大鳥居の砦が落ち、九月二十九日、長島の砦は降った。ところが、城を出る門徒に織田方が鉄砲を撃ちかけたため、怒った門徒が斬り込み、信長の兄の織田信広など多くの一門が討ち死にした。残る中江・屋長島の砦は柵で囲まれて火をかけられ、中にいた二万人ほどが焼け死んだと伝わる。この戦では、岸の柵を守る足軽の目から、その終わりを見ている。数には諸説あり、総勢七万・一揆の戦う者一万は遊びの目安。信長公記巻七と大日本史料の九月二十九日条をもとにした。岸の柵作り、退城舟の着岸場所と人数、砦の距離、昼の景色は復元。五拠点の多角形の平場、長島の奥の段、土塁、木戸、井楼、番所、長屋、蔵、館、井戸、板葺きと檜皮葺き、低い留め石、道と分流の配置は、戦国末期の北伊勢の土の城からの推定で、実測縄張りを写したものではない。堤と中洲の小拠点は遊びの補いで、既に落ちた篠橋・大鳥居とはしない。守将の個別の居場所は不明で、織田信広らの討死は自分の手柄で変わらない。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる） と立つ所
nagashima.lordAt = { x: 0, z: 60, r: 12, why: '岸の後ろの織田の陣（信長は陸と海から長島を囲んだ）' };
nagashima.lordSpawn = { x: 0, z: 56, heading: Math.PI };

// 素直な遊び手：柵を結い、舟を見張り、反撃を岸で受け止め、東の包囲の柵へ移る
// 退く時も敵を向く。行き先を向いて歩くと、背に受けて構えが効かない。
function bankMove(p, inp, foe, x, z, goTo) {
  inp.runHeld = false;
  // 近くの打ち込みだけ受ける。敵がいるだけで構え続けると、退き足も気力の回復も遅れる。
  inp.guardHold = !!foe && Math.hypot(foe.pos.x - p.u.pos.x, foe.pos.z - p.u.pos.z) < 6 &&
    !!((foe.charging && foe.target === p.u) || (foe.atk && foe.atk.target === p.u) ||
      (foe.swing && !foe.swing.done && foe.swing.target === p.u));
  if (!foe) { goTo(p, inp, x, z, 2); return; }
  if (p.lock && p.lock !== foe) inp.e.add('KeyQ');
  p.yaw = Math.atan2(foe.pos.x - p.u.pos.x, foe.pos.z - p.u.pos.z);
  const dx = x - p.u.pos.x, dz = z - p.u.pos.z;
  if (Math.hypot(dx, dz) <= 2) return;
  const fw = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw);
  const side = -dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw);
  if (Math.abs(fw) > 0.3) inp.k.add(fw > 0 ? 'KeyW' : 'KeyS');
  if (Math.abs(side) > 0.3) inp.k.add(side > 0 ? 'KeyD' : 'KeyA');
}

nagashima.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.leftPressed = false; inp.chargeHold = false;
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 近いだけの相手より、いま打ち込む相手を先に受ける。
  let attacker = null, ad = 10;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.team === u.team || o.fleeing || o.noTarget || o.invuln ||
        o.type === 'gun' || o.type === 'bow' || Math.abs(o.pos.y - u.pos.y) >= 3 ||
        b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 岸の反撃では、十歩以内にいるだけの敵を待ち続けず、こちらから間合いへ入る。
    // 最後の東の柵では、従来どおり近い敵を受けて持ち場を守る。
    if (F.step !== 3.5 && !(o.charging && o.target === u || o.atk?.target === u || o.swing && !o.swing.done && o.swing.target === u)) continue;
    if (d < ad) { attacker = o; ad = d; }
  }
  const e = attacker || strikeTarget(b, F.step === 1 ? 8 : 13);
  // 東への移動中も、深手や気力切れなら同じ持ち場の後ろへ退く。
  // 傷の自然回復は待たず、敵が離れて気力が戻ったら守りに加わる。
  const defending = F.step === 3 || F.step === 3.5;
  const backX = F.step === 3.5 ? 24 : 4;
  const closeFoe = e && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 6;
  // 傷は自然には戻らない。味方の列へ戻っても、半分以下というだけで退き続けない。
  // 実際に並べる味方と近い敵を数え、一人を受けられる時は反撃へ戻る。
  let friends = 0, foes = 0;
  if (defending && e) for (const o of b.army.units) {
    if (o === u || !o.alive || o.fleeing || o.noTarget || o.isStruct || o.woundOut || o.rearWound ||
        o.type === 'porter' || o.type === 'dummy' || Math.abs(o.pos.y - u.pos.y) >= 3 ||
        Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) >= 6 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
    if (o.team === u.team) friends++; else foes++;
  }
  const supported = friends >= 2 && foes <= 1 && !u.mobbed;
  if (defending && closeFoe && ((u.hp < u.maxHp * 0.5 && !supported && u.pos.z < BANK_Z + 12) || p.sta < p.maxSta * 0.25)) b.botRest = true;
  if (b.botRest && (!closeFoe || supported || Math.hypot(u.pos.x - backX, u.pos.z - (BANK_Z + 16)) <= 2) &&
      p.sta >= p.maxSta * 0.45) b.botRest = false;
  if (b.botRest) { bankMove(p, inp, e, backX, BANK_Z + 16, goTo); return; }
  // 守りは印から十八歩以内。印の二歩以内へ入り続けて、目の前の反撃を捨てない。
  if (F.step === 3.5 && Math.hypot(u.pos.x - 24, u.pos.z - (BANK_Z + 6)) > (e ? 10 : 2)) {
    bankMove(p, inp, e, 24, BANK_Z + 6, goTo); return;
  }
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    // 刀と槍の間合いに入り、受ける間と構えを解いて突く間を分ける。
    // 毎コマ構えを選び直すと、突きが払いに変わり、気力だけを失う。
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    const atPost = F.step !== 3.5 || Math.hypot(e.pos.x - 24, e.pos.z - (BANK_Z + 6)) < 14;
    if (atPost && (u.hp >= u.maxHp * 0.5 || supported) && !attacker && e.pos.z > BANK_Z - 10 && d > reach * 0.9) inp.k.add('KeyW');
    // 刀の敵に密着すると槍の穂先が使えず、突きの傷が小さくなる。
    // 岸の内で半歩退き、穂先が届く間を取り直す。
    if (p.weapon === 'spear' && d < 1.4 && u.pos.z < BANK_Z + 20 && atPost) inp.k.add('KeyS');
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (F.step === 1.25) {
    const s = SPOTS[F.watchAt];
    if (Math.hypot(u.pos.x - s.x, u.pos.z - (BANK_Z + 5)) > 2) goTo(p, inp, s.x, BANK_Z + 5, 1.5);
    else p.yaw = Math.PI;
    return;
  }
  if (F.step === 1) {
    let it = null, bd = Infinity;
    for (const x of b.interacts) if (x.id.startsWith('s')) { const d = Math.hypot(x.pos.x - u.pos.x, x.pos.z - u.pos.z); if (d < bd) { bd = d; it = x; } }
    if (it) { if (bd > 1.6) goTo(p, inp, it.pos.x, it.pos.z, 1.2); else inp.k.add('KeyE'); return; }
  }
  if (F.step === 3.5) {
    const it = b.interacts.find((x) => x.id.startsWith('check'));
    if (it) {
      if (Math.hypot(it.pos.x - u.pos.x, it.pos.z - u.pos.z) > 1.6) goTo(p, inp, it.pos.x, it.pos.z, 1.2);
      else if (F.finalReady) inp.k.add('KeyE');
    } else goTo(p, inp, 24, BANK_Z + 6, 2);
    return;
  }
  if (F.step === 2) { goTo(p, inp, 0, BANK_Z + 4, 2); return; }
  if (F.step === 3 && u.hp < u.maxHp * 0.5) { goTo(p, inp, 4, BANK_Z + 16, 2); return; }
  if (F.step === 3) { const q = (F.last || []).find((x) => !gone(x)); if (q) { const c = q.center(); goTo(p, inp, c.x, BANK_Z + 3, 2); return; } goTo(p, inp, 4, BANK_Z + 3, 2); return; }
  goTo(p, inp, 6, BANK_Z + 8, 3);
};


// 信長公記巻七：陸三方と九鬼水軍の囲み、長島の退城、中江・屋長島。
// 願証寺は宗教の中心であり、中江の本陣と同じ拠点にしない。
installBattleJinkei(nagashima, [
  battleJin('陸三方と川口の囲み', 0, { x: 0, z: 60 }, Math.PI, [
    ['nagashima_hq', '本陣・旗本の守り', '織田信長', null, { x: 0, z: 60 }, 'eiraku', 'oda', (r) => r.flags.odaCamp?.guard, { named: false }],
    ['nagashima_shibata', '岸の柵と仕寄り', '柴田勝家', null, { x: 0, z: BANK_Z + 3 }, 'oda', 'oda', (r) => r.flags.shiba],
    ['nagashima_takigawa', '岸の鉄砲の備え', '滝川一益', null, { x: 34, z: BANK_Z + 6 }, 'oda', 'oda', (r) => r.flags.teppo],
    ['nagashima_west', '西の付城・封鎖の陣', '織田の衆（将の名は不明）', null, { x: -90, z: 0 }, 'oda', 'oda', null, { named: false }],
    ['nagashima_east', '東の付城・封鎖の陣', '織田の衆（将の名は不明）', null, { x: 110, z: 4 }, 'oda', 'oda', null, { named: false }],
    ['nagashima_northwest', '北西の囲み', '織田の衆（将の名は不明）', null, { x: -150, z: -150 }, 'oda', 'oda', null, { named: false }],
    ['nagashima_kuki', '東の川口・舟の封鎖', '九鬼嘉隆', null, { x: 84, z: CH_Z - 2 }, 'oda', 'oda', (r) => r.flags.ship],
  ], '七万は遊びの目安で諸説あり。陸三方向と水軍は史料の筋、陣の寸法と岸の将の担当は復元。各手の人数は不明。'),
  battleJin('輪中の砦ごとの守り', 1, FORT, 0, [
    ['nagashima_nakae', '中江の砦・奥の守り', '門徒衆（将の名は不明）', null, { x: 18, z: -82 }, 'namu', 'honganji', (r) => r.flags.ikkoCamp?.guard, { named: false }],
    ['nagashima_yanagashima', '屋長島の砦', '門徒衆（将の名は不明）', null, { x: YANAGASHIMA.x, z: YANAGASHIMA.z - 4 }, 'namu', 'honganji', null, { named: false }],
    ['nagashima_castle', '長島城の守り', '門徒衆（将の名は不明）', null, { x: NAGASHIMA.x, z: NAGASHIMA.z - 4 }, 'namu', 'honganji', null, { named: false }],
    ['nagashima_tsutsumi', '堤の砦', '門徒衆（将の名は不明）', null, { x: TSUTSUMI.x, z: TSUTSUMI.z - 3 }, 'namu', 'honganji', null, { named: false }],
    ['nagashima_nakasu', '中洲の砦', '門徒衆（将の名は不明）', null, { x: NAKASU.x, z: NAKASU.z - 3 }, 'namu', 'honganji', null, { named: false }],
    ['nagashima_bank', '退城した門徒の反撃', '門徒衆（将の名は不明）', null, { x: -10, z: BANK_Z - 4 }, 'namu', 'honganji', (r) => r.flags.last?.[0], { named: false }],
  ], '戦う者一万は目安。砦別の将・兵数は不明で、籠もる非戦の人々を備の兵数に数えない。'),
]);

export { nagashima };
