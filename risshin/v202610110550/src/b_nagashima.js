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
const BUILD_HOLD = 8;                      // 人足と並行して補修する
const WATCH_HOLD = 8;                      // 近い岸で水路を見張る
const SALLY_HOLD = 200;                    // 二度の上陸を受け、早くても二百秒は岸を守る
const SALLY_LIMIT = 220;                   // 残る敵は東の柵で受ける
const PUSH_HOLD = 20;                      // 四人以上が背後へ押し込み続けた時間
const FINAL_LIMIT = 100;                   // 三か所の確認と見張りに使える時間
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
const DARK = new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.95, side: THREE.DoubleSide });
WOOD.side = THREE.DoubleSide;
// 小舟は一つの形と材質を複製して使う。
// 動く舟の棹は船体に焼き込まず、同じ寸法の形を組み合わせる。
const BOAT_SHADOW_GEO = new THREE.CircleGeometry(1, 12);
BOAT_SHADOW_GEO.rotateX(-Math.PI / 2);
const BOAT_SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x172720, transparent: true, opacity: .22, depthWrite: false });
const POLE_GEO = new THREE.CylinderGeometry(.03, .03, 4.5, 5);
const ROPE = new THREE.MeshLambertMaterial({ color: 0xa4946b });
const IRON = new THREE.MeshLambertMaterial({ color: 0x4c4940 });
const MUSHIRO = new THREE.MeshLambertMaterial({ color: 0x9b8a61 });
const FOAM = new THREE.MeshBasicMaterial({ color: 0xbac8b5, transparent: true, opacity: .3, depthWrite: false });
// 板は閉じた厚板。丸い船底から舷へ幅を広げ、継ぎ目を残す。
function hullPlank(bag, points, dx, dy) {
  const pos = points.concat(points.map((v, i) => v + (i % 3 === 0 ? dx : i % 3 === 1 ? dy : 0)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 0,1, 1,0, 1,1, 0,0, 0,1, 1,0, 1,1], 2));
  g.setIndex([0,1,2, 2,1,3, 6,5,4, 7,5,6, 0,4,1, 1,4,5, 2,3,6, 6,3,7, 0,2,4, 4,2,6, 1,5,3, 3,5,7]);
  g.computeVertexNormals(); bag.push(g);
}
function boatBox(bag, x, y, z, w, h, d, rz = 0) {
  const g = ROOM_BOX.clone(); g.scale(w, h, d); g.rotateZ(rz); g.translate(x,y,z); bag.push(g);
}
function buildBoatHull(bags, length, width, deck, rise) {
  const half = length / 2, widthAt = z => width / 2 * Math.max(.12, 1 - (Math.abs(z) / half) ** 2);
  for (let i = 0; i < 16; i++) {
    const a = length * (i / 16 - .5), b = length * ((i + 1) / 16 - .5) - .015;
    const wa = widthAt(a), wb = widthAt(b), ya = rise * (Math.abs(a) / half) ** 3, yb = rise * (Math.abs(b) / half) ** 3;
    hullPlank(bags[0], [-wa*.32,ya-.3,a, -wb*.32,yb-.3,b, wa*.32,ya-.3,a, wb*.32,yb-.3,b], 0, .1);
    for (const side of [-1,1]) {
      const xs = [.32,.67,.92,1], ys = [-.3,-.18,.12,deck+.5];
      for (let r = 0; r < 3; r++) hullPlank(bags[r % 2],
        [side*wa*xs[r],ya+ys[r],a, side*wb*xs[r],yb+ys[r],b,
         side*wa*xs[r+1],ya+ys[r+1]-.012,a, side*wb*xs[r+1],yb+ys[r+1]-.012,b], -side*.085, 0);
      hullPlank(bags[1], [side*wa,ya+deck+.5,a, side*wb,yb+deck+.5,b,
        side*(wa-.13),ya+deck+.5,a, side*(wb-.13),yb+deck+.5,b], 0, .12);
      if (i % 2 === 0) {
        const z = (a+b)/2, w = (wa+wb)/2, y = (ya+yb)/2;
        boatBox(bags[1], side*(w-.12), y+deck+.2, z, .09, .6, .12, side*.14);
        const nail = new THREE.CylinderGeometry(.024, .024, .035, 5); nail.rotateZ(Math.PI/2);
        nail.translate(side*(w+.025), y+deck+.28, z); bags[4].push(nail);
      }
      // 水際の細い波は舟と一緒に動く。全舟で同じ形を使う。
      if (i > 1 && i < 14 && i % 2 === 0) boatBox(bags[5], side*(wa+.16), deck > .5 ? .485 : .035, a, .08, .014, length/20);
    }
    // 舷の内側に収めた床板。黒い突出板を作らない。
    boatBox(bags[0], 0, deck, (a+b)/2, (wa+wb)*.85, .1, b-a-.025);
  }
  const wrap = new THREE.TorusGeometry(.16, .025, 4, 10); wrap.rotateX(Math.PI/2);
  for (const side of [-1,1]) for (const z of [-length*.25,length*.25]) {
    const g = wrap.clone(); g.translate(side*widthAt(z), deck+.55+rise*.125, z); bags[3].push(g);
  }
  wrap.dispose();
  boatBox(bags[2], 0, deck+.065, -.7, width*.52, .04, length*.25);
  // 筵の織り目と縄を掛けた荷。
  for (let i=0;i<12;i++) boatBox(bags[3], 0, deck+.09, -length*.12+i*length*.02, width*.52,.012,.015);
  boatBox(bags[0], 0, deck+.22, length*.29, width*.3,.35,length*.12);
  for (const z of [length*.26,length*.32]) boatBox(bags[3],0,deck+.405,z,width*.31,.025,.04);
}
function finishBoat(model, bags) {
  const mats = [WOOD,DARK,MUSHIRO,ROPE,IRON,FOAM];
  for (let i=0;i<bags.length;i++) if (bags[i].length) {
    const m = new THREE.Mesh(mergeGeometries(bags[i],false), mats[i]);
    m.castShadow = i !== 5; m.receiveShadow = i !== 5; model.add(m);
    for (const g of bags[i]) g.dispose();
  }
}
const BOAT_MODEL = new THREE.Group(), boatParts = Array.from({length:6},()=>[]);
buildBoatHull(boatParts,6.5,1.8,.05,.22);
finishBoat(BOAT_MODEL,boatParts);
// 岸の飾り舟は元の棹付きの形を保つ。
const MOORED_BOAT = BOAT_MODEL.clone();
const mooredPole = new THREE.Mesh(POLE_GEO, WOOD);
mooredPole.position.set(.55, 1.3, -2); mooredPole.rotation.x = .6; MOORED_BOAT.add(mooredPole);
function riverBoat(x, y, z, rot, moving = false) {
  const m = (moving ? BOAT_MODEL : MOORED_BOAT).clone(); m.position.set(x, y, z); m.rotation.y = rot; return m;
}
// 描画済みの川面と同じ水深に舟を浮かべる。毎コマの計算で物を作らない。
function waterHeight(W, x, z) {
  return W.heightAt(x, z) + W.waterDepthAt(x, z);
}

const HOOD_MAT = new THREE.MeshLambertMaterial({ color: 0xd8d2bc, side: THREE.DoubleSide });
const BAMBOO_MAT = new THREE.MeshLambertMaterial({ color: 0x787249 });
const BLADE_MAT = new THREE.MeshLambertMaterial({ color: 0x858b89, side: THREE.DoubleSide });
const HOOD_PARTS = [];
for (const [x, y, z, w, h, d] of [[0, 1.71, -.025, .32, .06, .29], [-.155, 1.51, -.04, .05, .38, .22], [.155, 1.51, -.04, .05, .38, .22], [0, 1.5, -.15, .3, .4, .035]]) {
  const g = ROOM_BOX.clone(); g.scale(w, h, d); g.translate(x, y, z); HOOD_PARTS.push(g);
}
const HOOD_GEO = mergeGeometries(HOOD_PARTS, false);
for (const g of HOOD_PARTS) g.dispose();
function monToWeapon(kind) {
  const root = new THREE.Group(), length = kind === 2 ? .65 : 2.4;
  const shaft = new THREE.CylinderGeometry(.018, .026, length, 6);
  shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, length / 2 - .2);
  root.add(new THREE.Mesh(shaft, kind === 0 ? BAMBOO_MAT : WOOD));
  if (kind === 0) {
    const joint = new THREE.TorusGeometry(.027, .006, 3, 6); joint.rotateX(Math.PI / 2);
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(joint, BAMBOO_MAT); m.position.z = i * .36; root.add(m); }
    const tip = new THREE.ConeGeometry(.025, .25, 4); tip.rotateX(Math.PI / 2); tip.translate(0, 0, length - .1);
    root.add(new THREE.Mesh(tip, BAMBOO_MAT));
  } else {
    const shape = new THREE.Shape();
    if (kind === 2) { shape.moveTo(0, 0); shape.lineTo(.36, -.04); shape.quadraticCurveTo(.27, .08, 0, .08); }
    else { shape.moveTo(0, 0); shape.lineTo(.045, .35); shape.quadraticCurveTo(.16, .62, .11, .68); shape.quadraticCurveTo(.025, .49, -.035, .1); }
    const blade = new THREE.ShapeGeometry(shape, 5); blade.rotateX(Math.PI / 2); blade.translate(0, 0, length - .2);
    root.add(new THREE.Mesh(blade, BLADE_MAT));
  }
  return root;
}
const MONTO_WEAPONS = [monToWeapon(0), monToWeapon(1), monToWeapon(2)];
function dressMonTo(g) {
  for (let i = 0; i < g.units.length; i++) {
    const u = g.units[i], kind = i % 5;
    if (kind === 0 || kind === 1) u.head.add(new THREE.Mesh(HOOD_GEO, HOOD_MAT));
    if (u.wpn && kind < 3) {
      // 共通の構えと当たりは槍・刀のまま、描く武器だけをこの戦で替える。
      u.wpn.geometry = EMPTY_WEAPON; u.wpn.material = WOOD; u.wpn.onBeforeRender = THREE.Object3D.prototype.onBeforeRender; u.wpn.userData.lod = null; u.wpn.userData.flex = null;
      for (const child of u.wpn.children) child.visible = false;
      u.wpn.add(MONTO_WEAPONS[kind].clone());
    }
  }
}
const EMPTY_WEAPON = new THREE.BufferGeometry();
EMPTY_WEAPON.setAttribute('position', new THREE.Float32BufferAttribute([], 3));

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
      dress(Array.from({ length: 15 }, (_, i) => ({ type: 'samurai', n: 1, o: { hp: 30, maxHp: 30, kosode: i % 5 < 3 ? 1 : 0, kosodeCol: [0x34332e, 0x484339, 0x292c2b][i % 3], cloth: 0x34332e, hat: i % 5 === 3 ? 'jingasa' : 'hachimaki', flag: i % 5 === 4 ? 'namu' : null, weapon: i % 5 === 2 ? 'sword' : 'spear', spear: 'su', horse: false, sode: false, kote: 0, menpo: 0 } })), IKKO));
    F.last.push(g);
    dressMonTo(g);
    for (let j = 0; j < 3; j++) {
      const x = -32 + k * 24 + j * 8, z = -42;
      const m = riverBoat(x, waterHeight(rt.world, x, z), z, 0, true);
      const pole = new THREE.Mesh(POLE_GEO, WOOD); pole.position.set(.55, 1.3, -2); m.add(pole);
      const shadow = new THREE.Mesh(BOAT_SHADOW_GEO, BOAT_SHADOW_MAT); shadow.scale.set(1.1, 1, 3.4); rt.scene.add(shadow);
      const bt = { m, pole, shadow, x, z, group: g, second: k === 2, landed: false, passengers: [], hull: [], holes: 0, flood: 0, breath: 0 };
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
    if (F.step >= 2 && (!bt.second || F.sallyStart != null && rt.t - F.sallyStart >= 85) && !bt.landed && pilot && bt.flood < .4) bt.z = Math.min(-21, bt.z + dt * 1.5);
    // 漕ぎ手を失った舟・退く舟は川筋へ戻り、流れに沿う。流向と速さは復元の目安。
    if (F.step >= 2 && (!pilot && !bt.landed || escaping) && bt.z > CH_Z) bt.z = Math.max(CH_Z, bt.z - dt * .65);
    if (F.step >= 2 && (!pilot && !bt.landed || escaping) && bt.z <= CH_Z) bt.x += dt * .45;
    bt.flood = Math.min(1.6, bt.flood + bt.holes * .0015 * dt);
    const water = waterHeight(rt.world, bt.x, bt.z), bed = rt.world.heightAt(bt.x, bt.z);
    bt.m.position.set(bt.x, Math.max(bed, water - bt.flood), bt.z);
    if (F.step < 2) bt.m.position.x += Math.sin(rt.t * .22 + bt.x) * .7;
    bt.shadow.position.set(bt.m.position.x, water + .025, bt.z); bt.shadow.visible = !bt.landed && bt.flood < .8;
    bt.m.rotation.z = Math.min(.3, bt.flood * .2) + Math.sin(rt.t * 1.7 + bt.x) * .025;
    bt.pole.visible = !!pilot && bt.flood < .4 && !bt.landed;
    bt.pole.rotation.x = .35 + Math.sin(rt.t * 2.4) * .4;
    for (let i = 0; i < bt.hull.length; i++) {
      const h = bt.hull[i], x = bt.m.position.x + (i ? .72 : -.72);
      h.ax = h.bx = x; h.az = bt.z - 2.8; h.bz = bt.z + 2.8;
      h.x0 = x - .05; h.x1 = x + .05; h.z0 = h.az - .05; h.z1 = h.bz + .05;
      h.yBot = bt.m.position.y; h.yTop = h.yBot + .5;
    }
    for (const q of bt.passengers) {
      const u = q.u;
      if (!q.aboard || u.gone) continue;
      if (u.alive && !u.woundOut && !q.escape && bt.z >= -21 && bt.group.sallyReleased) q.dz = Math.min(4, q.dz + dt * 1.2);
      q.at.x = bt.m.position.x + q.dx; q.at.z = bt.z + q.dz;
      q.at.y = q.at.z > -18 && !q.escape ? rt.world.heightAt(q.at.x, q.at.z) : bt.m.position.y + .1;
      if (u.alive) {
        // 射撃後の反撃では、着岸した舟の上でも刀・槍を使える。
        const fighting = bt.group.sallyReleased && bt.landed && !q.escape;
        u.perch = q.at; u.pinT = fighting ? 0 : Infinity; u.fleeing = false; u._crouch = !fighting && q !== pilot;
        if (fighting && u.wpn) u.wpn.visible = true;
      }
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
const WORK_POST = new THREE.CylinderGeometry(.12, .14, 2.4, 9);
const postVerts = WORK_POST.attributes.position;
for (let i=0;i<postVerts.count;i++) if (postVerts.getY(i) > 1) postVerts.setY(i, postVerts.getY(i) + postVerts.getX(i)*1.3);
WORK_POST.computeVertexNormals();
const BARK = new THREE.MeshLambertMaterial({ color: 0x514735 });
const BARK_LINE = new THREE.CylinderGeometry(.009,.015,1,4);
const BARK_KNOT = new THREE.TorusGeometry(.04,.012,4,7);
const WORK_ROPE = new THREE.CylinderGeometry(.16, .16, .1, 6, 1, true);
function workFence(W, seg) {
  const m = new THREE.Group(), rails = [], posts = [], bark = [], len = seg[2] - seg[0];
  const count = Math.floor((len + .01) / .4) + 1;
  const knots = new THREE.InstancedMesh(WORK_ROPE, ROPE, count * 6), at = new THREE.Object3D();
  let n = 0;
  for (let x = seg[0]; x <= seg[2] + .01; x += .4) {
    const y = W.heightAt(x, seg[1]), tilt = Math.sin(x * 3.7) * .07;
    const post = WORK_POST.clone(); const thick = .8 + .25 * (1 + Math.sin(x * 4.3));
    post.scale(thick, .92 + .08 * Math.sin(x * 2.1), thick);
    post.rotateY(x*2.3);
    for (let j=0;j<5;j++) {
      const angle = j*Math.PI*2/5+x, g = BARK_LINE.clone();
      g.scale(1,1.2+.5*Math.sin(x+j),1); g.translate(Math.cos(angle)*.13*thick,.15*Math.sin(x+j),Math.sin(angle)*.13*thick);
      g.rotateZ(tilt); g.translate(x,y+1.12,seg[1]); bark.push(g);
    }
    const knot = BARK_KNOT.clone(); knot.scale(1,1.5,1); knot.translate(0,.3*Math.sin(x),.14*thick);
    knot.rotateZ(tilt); knot.translate(x,y+1.12,seg[1]); bark.push(knot);
    const split = ROOM_BOX.clone(); split.scale(.012,.24,.12); split.rotateZ(.25*Math.sin(x));
    split.translate(0,1.03,0); split.rotateZ(tilt); split.translate(x,y+1.12,seg[1]); bark.push(split);
    post.rotateZ(tilt); post.translate(x, y + 1.12, seg[1]); posts.push(post);
    for (const h of [.7, 1.7]) for (let turn = 0; turn < 3; turn++) {
      at.position.set(x - Math.sin(tilt) * h, y + h + turn * .06, seg[1]);
      at.rotation.set(0, 0, tilt + .1 * Math.sin(x)); at.scale.set(thick, .5, thick);
      at.updateMatrix(); knots.setMatrixAt(n++, at.matrix);
    }
  }
  BARK.map = woodTex();
  const mesh = new THREE.Mesh(mergeGeometries(posts, false), WOOD); m.add(mesh);
  m.add(new THREE.Mesh(mergeGeometries(bark,false),BARK));
  for (const g of bark) g.dispose();
  const mudParts = [];
  for (let x = seg[0]; x <= seg[2]; x += .8) {
    const g = WORK_POST.clone(); g.scale(1.06, .1 + .06 * Math.abs(Math.sin(x * 4)), 1.06);
    g.rotateZ(Math.sin(x * 3.7) * .07); g.translate(x, W.heightAt(x, seg[1]) + .12, seg[1]); mudParts.push(g);
  }
  m.add(new THREE.Mesh(mergeGeometries(mudParts, false), DARK));
  for (const g of mudParts) g.dispose();
  for (const g of posts) g.dispose();
  knots.count = 0; knots.instanceMatrix.needsUpdate = true; m.add(knots);
  for (const h of [.7, 1.7]) {
    const rail = new THREE.Mesh(ROOM_BOX, WOOD); rail.scale.set(len, .16, .16); rail.rotation.z = Math.sin(seg[0] * 2) * .025;
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

// 関船と小早。開いた舷・反った船首・櫓・帆柱・筵屋根を共用する。
const SHIP_MODELS = [new THREE.Group(), new THREE.Group()];
for (let kind = 0; kind < 2; kind++) {
  const model = SHIP_MODELS[kind], bags = Array.from({length:6},()=>[]), length = kind ? 10 : 17, width = kind ? 2.8 : 4.8;
  const part = (bag, x, y, z, w, h, d, rx = 0, rz = 0) => {
    const g = ROOM_BOX.clone(); g.scale(w, h, d); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); bags[bag].push(g);
  };
  const widthAt = z => width / 2 * Math.max(.12, 1 - (Math.abs(z) / (length / 2)) ** 2);
  buildBoatHull(bags, length, width, .65, .85);
  for (const side of [-1, 1]) for (let n = 0; n < (kind ? 4 : 7); n++) {
    const z = -length * .32 + n * 1.4;
    part(1, side * (widthAt(z) + .65), 1.1, z, 2.6, .075, .09, 0, side * -.18);
    part(1, side * (widthAt(z) + 1.8), .8, z, .7, .08, .26, 0, side * -.35);
  }
  part(1, 0, 3, .8, .13, 5.1, .13);
  for (const side of [-1, 1]) for (const z of [-2, .3]) part(1, side * width * .33, 2.2, z, .1, 2.5, .1);
  for (const side of [-1, 1]) {
    part(2, side * width * .18, 3.5, -.85, width * .43, .16, 3.2, 0, side * -.22);
    for (let n = 0; n < 9; n++) part(1, side * width * .18, 3.57, -2.25 + n * .35, width * .44, .035, .035, 0, side * -.22);
  }
  finishBoat(model, bags);
}
function ataka(small = false) { return SHIP_MODELS[small ? 1 : 0].clone(); }

function dangerWarning(rt) {
  const F = rt.flags;
  if (F.dangerAt != null || F.ending || !rt.player.u.alive) return;
  F.dangerAt = rt.t;
  rt.obj('main', '危ない！　槍組の後ろへ下がれ', 'main');
  rt.say('柴田勝家', '岸の守りが薄い！　槍組を回す。敵に向き直り、味方の後ろへ下がれ', 4);
  rt.marker('retreat', { x: 24, z: BANK_Z + 16 }, '槍組の後ろへ下がる');
  const g = F.relief;
  if (g) {
    g.noAI = false; g.order = 'path'; g.pathIdx = 0; g.aggro = 10;
    g.path = [[24, BANK_Z + 16], [24, BANK_Z + 6]];
    g.onArrive = q => { q.order = 'hold'; q.formation = 'yari'; q.facing = Math.PI; };
    for (const u of g.units) u.noTarget = false;
  }
}
function dangerProgress(rt) {
  const F = rt.flags;
  return F.dangerAt != null && rt.t - F.dangerAt < 15;
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
  spawn: { x: 3, z: BANK_Z + 7, heading: Math.PI },
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
    F.hurtEdge = document.createElement('div'); F.hurtEdge.setAttribute('aria-hidden', 'true');
    F.hurtEdge.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;box-shadow:inset 0 0 36px 10px rgba(120,42,28,.25);display:none';
    document.body.appendChild(F.hurtEdge);
    F.localStyle = document.createElement('style');
    F.localStyle.textContent = '#vignette.hurt,#vignette.dying,body.rm #vignette.dying{animation:none!important;box-shadow:inset 0 0 48px rgba(110,34,24,.25)!important;background-color:transparent!important}#brinkfx{opacity:.25!important}';
    document.head.appendChild(F.localStyle);
    const say = rt.say;
    rt.say = function (name, text, ...args) {
      if (/^(?:柴田)?勝家$/.test(name) && text.includes('無念') && F.shibaU?.alive && !F.shibaU.woundOut && !F.shibaU.rearWound) text = '仲間が倒れた。残る者はわしの後ろへ来い！';
      return say.call(this, name, text, ...args);
    };
    // 合戦中の行き先は一枚。任務と台詞に名札を重ねない。
    const marker = rt.marker;
    rt.marker = function (id, at, text, ...args) {
      if (F.step >= 2) for (let i = this.markers.length - 1; i >= 0; i--) this.unmark(this.markers[i].id);
      return marker.call(this, id, at, text, ...args);
    };
    // 深手になる前に知らせる。警告中は一撃で倒れず、退く時間を残す。
    const playerDamage = rt.army.hooks.playerDamage;
    rt.army.hooks.playerDamage = function (amount, src) {
      const u = rt.player.u;
      if ((F.step === 3 || F.step === 3.5) && src?.team !== u.team && (u.hp <= u.maxHp * .55 || amount >= u.hp * .5)) dangerWarning(rt);
      const taken = playerDamage.call(this, amount, src);
      return dangerProgress(rt) ? Math.min(taken, Math.max(0, (u.hp - 1) / 4)) : taken;
    };
    const dispose = rt.dispose;
    rt.dispose = function (...args) { F.hurtEdge.remove(); F.localStyle.remove(); return dispose.apply(this, args); };
    // 地面の矢だけ短く残す。人や舟に刺さった矢の扱いは変えない。
    const pinArrow = rt.army.pinArrow;
    rt.army.pinArrow = function (a, life, parent, support) {
      const ground = !parent && !support;
      const result = pinArrow.call(this, a, ground ? Math.min(life, 7) : life, parent, support);
      if (ground && a.stuck) {
        a.pos.y -= .04 + Math.random() * .14;
        a.mesh.rotateX((Math.random() - .5) * .45); a.mesh.rotateZ((Math.random() - .5) * .4);
      }
      return result;
    };
    // 共通の川面が持つ流れと空の映りを、長島の濁り水でも見える強さにする。
    for (const st of W.def.streams || []) if (st.mesh) {
      st.mesh.material.color.setHex(0x344d43); st.mesh.material.roughness = .18;
      st.mesh.material.envMapIntensity = .9;
    }
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
      const g = enemyGroup(rt, { fixed: true, faction: 'saito', name: '対岸の弓と鉄砲衆',
        anchor: { x: s.x, z: CH_Z - 8 }, facing: 0, formation: 'line', width: 2,
        order: 'hold', aggro: 0, fire: false, noAI: true, noPursue: true, historicalOrders: true,
        fleeDir: { x: 0, z: -1 } },
        dress([{ type: 'bow', n: 1, o: { range: 40, dmg: 5 } }, { type: 'gun', n: 1, o: { range: 48, dmg: 5 } }], IKKO));
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
    WOOD.map = DARK.map = woodTex(); WOOD.needsUpdate = DARK.needsUpdate = true;
    F.fenceWork = SPOTS.map((s) => wallLine(rt, [[s.x - 7, s.z], [s.x + 7, s.z]], { team: 0, hp: 700, name: '結いかけの柵', segLen: 5, mesh: workFence }));
    for (const segs of F.fenceWork) for (const q of segs) { q.noTarget = true; q.wall = false; q.segR = 0.02; }
    // 九鬼の船団（東の川筋・海の封鎖）：川口をふさぎ、ゆっくり動きながら遠くの射撃を見せる
    F.ship = ataka();
    F.ship.position.set(84, waterHeight(W, 84, CH_Z - 2) - 0.45, CH_Z - 2);
    F.ship.rotation.y = Math.PI / 2 + 0.1;
    rt.scene.add(F.ship);
    const sn = nobori(W, 84, CH_Z - 2, 'oda', 5); sn.position.y = F.ship.position.y + 5.6; rt.scene.add(sn);
    F.ships = [{ m: F.ship, flag: sn, x0: 60, x1: 110, z: CH_Z - 2, x: 84, dir: 1, speed: 0.6, soundPos: { x: 84, z: CH_Z - 2 }, t: 4 }];
    for (const [x0, x1, z, sp] of [[118, 170, CH_Z + 4, 0.5], [-18, 14, CH_Z + 1, 0.45]]) {
      const m2 = ataka(true);
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
    F.relief = allyGroup(rt, { name: '岸の助けの槍組', fixed: true, noAI: true, anchor: { x: 24, z: BANK_Z + 30 }, facing: Math.PI, formation: 'yari', yariRanks: 2, aggro: 0, fire: false }, dress([{ type: 'ashigaru', n: 8 }], ODA));
    for (const u of F.relief.units) u.noTarget = true;
    F.oda = [F.shiba, F.teppo]; F.defenders = [F.shiba, F.teppo, F.relief];
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
    rt.after(5, () => { this.build(rt); sfx('eshout', .6); rt.bark('対岸から矢！　柵の内で横木を直せ', true); });
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
    rt.obj('main', rt.G.lord ? `岸の柵を結わせ、門徒に備えよ（${SPOTS.length}か所）` : '矢を柵で避け、味方と横木を直せ', 'main');
    rt.say('柴田勝家', '杭に横木を渡せ！　縄を締め、川岸を固めよ', 3);
    F.teppo.fire = true;
    for (const g of F.bankBows) { g.fire = true; for (const u of g.units) u.noTarget = false; }
    // 信長で遊ぶ時：柵は足軽が結う（手柄にはしない）。当主は岸で門徒に備える
    F.builders = []; F.personalWork = [0, 0, 0];
    const workers = F.shiba.units.filter((u) => u.alive && !u.fleeing && !u.woundOut && !u.noTarget && u.type === 'ashigaru');
    for (let i = 0; i < SPOTS.length; i++) {
      const s = SPOTS[i], u = workers[i], mate = workers[i + 3];
      if (u) { for (const worker of [u, mate]) if (worker?.hand) {
        const rope = new THREE.Mesh(WORK_ROPE, DARK); rope.rotation.x = Math.PI / 2; rope.scale.set(1.5, 1, 1.5);
        rope.position.set(0, 0, .1); worker.hand.add(rope); worker.workRope = rope;
      } }
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
    F.helped = true; // 人足は初めから並行して補修する。本人は近い一か所を手伝える。
    if (!rt.G.lord) {
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
    // 対岸と矢・鉄砲を交わす。退城の兵は降伏の報せまで舟を寄せない。
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
    if (F.helped && !F.personalBuilt) {
      if (F.built >= SPOTS.length) { rt.obj('main', '岸の印で舟を見張れ', 'main'); rt.marker('workWatch', { x: 0, z: BANK_Z + 5 }, '舟の見張り場'); }
      return;
    }   // 足軽が代わりに結った分は手柄にしない
    if (F.personalBuilt === 1) rt.award((t) => { t.special = { label: '味方と岸に柵を結った', pts: 12 }; }, '味方と横木を結った');
    if (F.built >= SPOTS.length) { rt.obj('main', '岸の印で舟を見張れ', 'main'); rt.marker('workWatch', { x: 0, z: BANK_Z + 5 }, '舟の見張り場'); }
    else rt.objProgress('main', `味方と横木を直せ　${F.built}／${SPOTS.length}か所`);
  },

  watch(rt) {
    const F = rt.flags;
    F.step = 1.25; F.stepT = rt.t; F.watchAt = 0; F.watchTime = 0;
    for (const job of F.builders || []) for (const u of [job.u, job.mate]) if (u?.alive && u.wpn) { u.wpn.visible = true; if (u.workRope) u.workRope.visible = false; }
    rt.unmark('workWatch');
    rt.obj('main', '岸で川を向き、舟を見張れ', 'main');
    rt.say('柴田勝家', 'その岸で川を見よ。ほかの岸は味方に任せよ', 3);
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
    F.shiba.fire = false; F.teppo.fire = false;
    rt.say('伝令', '長島が降った。退く舟には手を出すな', 4);
    rt.obj('main', '岸の柵へ戻り、退く舟を見張れ', 'main');
    rt.marker('bank', { x: 0, z: BANK_Z + 5 }, '岸の持ち場');
    bankNews(rt, '長島城、降伏にござる。城の者は舟で退くとのこと。岸の備えを解かれぬよう', '長島城が降った。舟で退城する');
    for (const g of F.last) { g.anchor.z = BANK_Z + 2; g.aggro = 0; }
    rt.after(6, () => {
      if (F.ending || F.step !== 2) return;
      rt.say('伝令', '本陣から、退城の舟を撃てとの下知。退城を許した約束を破る命にござる', 5);
    });
    rt.after(8, () => {
      if (F.ending || F.step !== 2 || !rt.player.u.alive) return;
      F.teppo.fire = true;
      for (const u of F.last[0].units) if (u.alive && !u.woundOut && !u.rearWound) u.noTarget = false;
      battleEvent(rt, EVENT_VOLLEY, { x: 0, z: CH_Z }, F.teppo, 0, true, '退く舟へ、織田方の鉄砲が放たれた');
      rt.say('鉄砲頭', '退城を許したはずじゃ……。上の下知で鉄砲が放たれた', 5);
    });
    // 射撃を続けて反撃の前に舟の者を全滅させない。矢玉と傷はそのまま残す。
    rt.after(14, () => { if (F.step === 2 && !F.ending) F.teppo.fire = false; });
    // 降伏の舟を見届けてから射撃。約十四秒かけて岸へ寄り、同じ門徒が反撃する。
    rt.after(12, () => {
      if (F.ending || F.step !== 2) return;
      rt.bark('舟が岸へ寄る！　味方の後ろに退く道を空けよ', true);
      rt.marker('retreat', { x: 4, z: BANK_Z + 16 }, '傷ついたら、ここへ下がる');
      sfx('eshout', .6);
    });
    rt.after(15, () => {
      if (F.ending || F.step !== 2) return;
      rt.bark('岸に足音！　刀を抜いて来るぞ', true); sfx('stepWet', .9);
    });
    rt.after(16, () => this.lastSally(rt));
  },

  // ④ 反撃ののち、中江・屋長島の外へ柵をつなぎ直す。
  midB(rt) {
    const F = rt.flags;
    if (F.step >= 3.5) return;
    F.step = 3.5; F.stepT = rt.t; F.finalHeld = 0; F.finalSafe = 0; F.finalStarted = null;
    rt.setPhase('enclose'); rt.unmark('bank'); rt.unmark('retreat');
    F.hurtShown = false;
    surroundForts(rt);
    rt.obj('main', '東の柵へ下がり、三つの印を見回れ', 'main');
    F.finalChecks = [false, false, false]; F.finalChecked = 0;
    for (let i = 0; i < 3; i++) {
      const x = 20 + i * 6, id = 'check' + i;
      if (i === 0) rt.marker(id, { x, z: BANK_Z + 6 }, '柵の守りを確かめる');
      rt.addInteract(id, { x, z: BANK_Z + 6 }, '柵の守りを確かめる', () => {
        if (F.step !== 3.5 || !F.finalReady || F.finalChecks[i]) return;
        F.finalChecks[i] = true; F.finalChecked++;
        if (F.finalChecked === 3) { F.finalHeld = 0; F.finalSafe = 0; }
        rt.uninteract(id); rt.unmark(id);
        const next = F.finalChecks.indexOf(false);
        if (next >= 0) rt.marker('check' + next, { x: 20 + next * 6, z: BANK_Z + 6 }, '次の柵を確かめる');
        else rt.marker('east', { x: 24, z: BANK_Z + 6 }, '柵を見張る持ち場');
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
    F.sallyHeld = 0; F.bankAway = 0; F.pushTime = 0; F.sallyStart = rt.t;

    rt.obj('main', '柵の内で、斬り込む門徒を受け止めよ', 'main');
    rt.say('柴田勝家', '門徒が斬り込むぞ！　構えよ。味方の列を離れるな', 4);
    rt.marker('bank', { x: 0, z: BANK_Z + 5 }, '岸の持ち場');
    // 最初の舟は二隊に分けて寄せ、残りの舟は後から着岸する。同じ四十五人を使う。
    this.sallyWave(rt, 0);
    rt.after(25, () => this.sallyWave(rt, 1));
    rt.after(85, () => {
      if (F.step === 3 && !F.ending) rt.say('物見', '後の舟も岸へ向かうぞ。柵の内で構えよ', 4);
    });
    rt.after(100, () => this.sallyWave(rt, 2));

    for (const [g, x] of [[F.shiba, 0], [F.teppo, 30]]) { g.order = 'hold'; g.anchor = { x, z: BANK_Z + 3 }; g.aggro = 14; }
  },

  sallyWave(rt, i) {
    const F = rt.flags, g = F.last[i];
    if (F.step !== 3 || F.ending || g.sallyReleased) return;
    g.sallyReleased = true; g.noRout = false;
    // 射撃への怒りで気力は戻るが、空腹の疲れや受けた傷は戻さない。
    g.morale = Math.max(g.morale, 82);
    for (const u of g.units) if (u.alive && !u.woundOut && !u.rearWound) {
      u.noTarget = false; u.fat = Math.max(u.fat || 0, 0.55);
    }
    g.order = 'attack'; g.aggro = 22; g.seekRange = 90;
    g.formation = 'column'; g.colW = 3; g.anchor.z = BANK_Z + 18;
    if (i > 0) rt.bark(i === 2 ? '後の舟が着いた！　東の岸も守れ' : '次の一団が来る！　柵の内で受け止めよ', true);
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
      const why = F.broken ? '岸の背後へ四人以上の敵が二十秒押し込み、持ち場を失った' : F.sallyFailed ? '岸の反撃を受け止めきれなかった' : !F.watchDone ? '岸で舟を見張る務めを果たせなかった' : !F.sallyDefended ? '岸に踏みとどまれなかった' : F.finalChecked < 3 ? '東の柵を三か所確かめ切れなかった' : '東の柵の見張りを果たせなかった';
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
      if ((F.step < 2 || F.step >= 3) && !F.ending && (sh.t -= dt) <= 0) {
        sh.t = 12 + Math.random() * 6;
        sh.soundPos.x = sh.x; sh.soundPos.z = sh.z;
        rt.army.play('gun', sh.soundPos, 0.6);
        rt.army.smoke(sh.x - 3, sh.m.position.y + 4, sh.z, -1, 0, 1.2);
      }
    }
    if (F.ending || !rt.player.u.alive) { F.hurtEdge.style.display = 'none'; return; }
    if (F.dangerAt != null && !dangerProgress(rt) && !F.dangerDone) {
      F.dangerDone = true;
      rt.obj('main', F.step === 3.5 ? '東の柵を確かめ、味方と見張れ' : '柵の内で、味方と門徒を止めよ', 'main');
      if (F.step === 3.5) {
        const next = F.finalChecks.indexOf(false);
        rt.marker(next < 0 ? 'east' : 'check' + next, { x: next < 0 ? 24 : 20 + next * 6, z: BANK_Z + 6 }, next < 0 ? '柵を見張る持ち場' : '次の柵を確かめる');
      } else rt.marker('bank', { x: 24, z: BANK_Z + 6 }, '槍組と岸を守る');
    }
    const hurt = rt.player.u.hp < rt.player.u.maxHp * .5;
    if (hurt !== F.hurtVisible) { F.hurtVisible = hurt; F.hurtEdge.style.display = hurt ? 'block' : 'none'; }
    if (hurt && !F.hurtShown) {
      F.hurtShown = true;
      rt.unmark('bank');
      if (!dangerProgress(rt)) rt.marker('retreat', { x: F.step === 3.5 ? 24 : 4, z: BANK_Z + 16 }, '傷が深い！　味方の後ろへ');
      if (!dangerProgress(rt)) rt.say('足軽', '傷が深い！　敵に向き直り、印へ下がれ', 3);
    } else if (!hurt && F.hurtShown) { F.hurtShown = false; rt.unmark('retreat'); }
    if (F.step === 1 && rt.t >= (F.oarSoundAt || 8)) { F.oarSoundAt = rt.t + 10; sfx('stepWet', .35); }
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
          job.t = at ? Math.min(BUILD_HOLD, job.t + dt) : job.t;
          fenceProgress(F.fenceWork[job.i], job.t, BUILD_HOLD);
          if (job.t >= BUILD_HOLD) {
            if (!rt.G.lord && rt.holdId === 's' + job.i && (rt.holdT || 0) >= 2) {
              F.participated = true; F.personalBuilt = (F.personalBuilt || 0) + 1;
            }
            this.raise(rt, job.i);
          }
        }
      }
      if (w > 8 && !F.boatNews) { F.boatNews = true; rt.say('物見', '島の船着きに人が集まっておる。舟を出すつもりにござろう', 3); }
      rt.objProgress('main', F.built < SPOTS.length ? (rt.G.lord ? `岸で舟に備えよ　柵 ${F.built}／${SPOTS.length}か所` : F.participated ? `味方と横木を直せ　${F.built}／${SPOTS.length}か所` : `矢を避け、近い横木を直せ　${F.built}／${SPOTS.length}か所`) : '岸の印で舟を見張れ');
      if (!rt.G.lord && !F.participated && F.built < SPOTS.length && w > 12 && !F.nudge) { F.nudge = true; rt.say('柴田勝家', `${nm(rt)}、近い横木を直せ！　ほかの所は味方に任せよ`, 4); }
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
            if (!rt.G.lord && !F.helped && !rt.holdId && w > 35) {
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
      if (F.built < SPOTS.length && w > 16 && !F.nudge2) { F.nudge2 = true; rt.say('足軽', 'お頭、手が足りん。わしらも手を貸すでよ', 3); }
      // 補修は人足と並行する。人足を失った時は残る杭で守る。
      if (F.built >= SPOTS.length || w >= 20) {
        if (F.built < SPOTS.length) { F.helped = true; rt.say('柴田勝家', '人足が倒れ、横木が足りぬ。残る杭の内で舟に備えよ', 3); }
        this.watch(rt);
      }
    }
    if (F.step === 1.25) {
      const p = rt.player.u.pos;
      let s = SPOTS[0];
      for (let i = 1; i < SPOTS.length; i++) if (Math.abs(p.x - SPOTS[i].x) < Math.abs(p.x - s.x)) s = SPOTS[i];
      const near = Math.hypot(p.x - s.x, p.z - (BANK_Z + 5)) < 5;
      const facing = Math.cos(rt.player.yaw) < -.5;
      if (near && facing) F.watchTime += dt;
      if (F.watchTime >= WATCH_HOLD) {
        F.watchAt++; F.watchTime = 0;
        if (F.watchAt >= 1) { F.watchDone = true; this.boats(rt); }
        else rt.marker('watch', { x: SPOTS[F.watchAt].x, z: BANK_Z + 5 }, '水路を見張る持ち場');
      }
      if (F.step === 1.25) {
        if (Math.floor(rt.t) !== F.watchClock) {
          F.watchClock = Math.floor(rt.t);
          rt.objProgress('main', !near ? '近い岸で川を見張れ' : !facing ? '川を向き、舟を見張れ' : `舟を見張れ　${Math.floor(F.watchTime)}／八秒`);
        }
        if (rt.t - F.stepT >= 6 && !F.watchWarned) { F.watchWarned = true; rt.bark('岸の見回りを急げ。舟が出るぞ', true); }
        if (rt.t - F.stepT >= 30) this.boats(rt);
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
      if (F.bankAway >= 15) dangerWarning(rt);
      let through = 0, pressing = false;
      for (const g of F.last) for (const u of g.units) {
        if (!u.alive || u.fleeing || u.woundOut || u.gone || u.noTarget || u.boatSeat?.aboard) continue;
        if (Math.abs(u.pos.x) < 48 && u.pos.z > BANK_Z + 24 && u.pos.z < BANK_Z + 60) through++;
        if (u.pos.z >= BANK_Z - 12 && u.pos.z < BANK_Z + 36 && Math.abs(u.pos.x) < 60) pressing = true;
      }
      F.breakThrough = through;
      // 味方の人数では落とさない。背後の敵を減らせば押し込みの時間も戻る。
      F.pushTime = through >= 4 ? Math.min(PUSH_HOLD, F.pushTime + dt) : Math.max(0, F.pushTime - dt * 2);
      if (through > 0 && !F.breakWarned) { F.breakWarned = true; rt.bark('敵が岸の背後へ抜ける！　柵の内で味方と止めよ', true); }
      if (through === 0) F.breakWarned = false;
      if (through >= 4) dangerWarning(rt);
      if (w >= SALLY_HOLD && F.pushTime >= PUSH_HOLD && !dangerProgress(rt)) {
        F.broken = true;
        rt.say('柴田勝家', '背後への押し込みを止められぬ。東の柵へ下がれ', 4);
      }
      if (Math.floor(w) !== F.lastClock) {
        F.lastClock = Math.floor(w);
        rt.objProgress('main', dangerProgress(rt) ? `危ない！　槍組の後ろへ。残り${Math.ceil(15 - (rt.t - F.dangerAt))}秒` : F.broken ? '敵が背後へ押し込み続けた。東の柵へ下がれ' : through >= 4 ? `背後の敵を押し返せ　押し込み${Math.floor(F.pushTime)}／二十秒　守りはあと${Math.max(0, Math.ceil(SALLY_HOLD - w))}秒` : !atBank ? `岸の印へ戻れ　守りはあと${Math.max(0, Math.ceil(SALLY_HOLD - w))}秒` : `柵の内で守れ　あと${Math.max(0, Math.ceil(SALLY_HOLD - w))}秒`);
      }
      // 第一陣が散っても終わらせず、後の舟を受ける。小さな押し合いは東の守りへ続ける。
      if (!dangerProgress(rt) && w >= SALLY_HOLD && (!pressing || w >= SALLY_LIMIT || F.broken)) {
        F.sallyDefended = !F.broken && (F.sallyHeld >= 8 || atBank);
        F.sallyFailed = !!F.broken;
        if (F.sallyDefended) rt.award((t) => t.side.push('二度の上陸を岸で受け止めた'), '二度の上陸を岸で受け止めた');
        this.midB(rt);
      }
    }

    if (F.step === 3.5) {
      const p = rt.player.u.pos;
      let foes = 0;
      for (const g of F.last) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget && Math.hypot(u.pos.x - 24, u.pos.z - (BANK_Z + 6)) < 14) foes++;
      const safe = rt.player.u.alive && Math.hypot(p.x - 24, p.z - (BANK_Z + 6)) < 18 && foes === 0;
      F.finalReady = safe;
      // 移動の秒数は守備に含めない。敵を押し返し、柵へ戻ってから見張りを数える。
      if (F.finalStarted == null && safe) F.finalStarted = rt.t;
      if (safe) { F.finalHeld += dt; F.finalSafe += dt; } else F.finalSafe = 0;
      if (foes >= 4) dangerWarning(rt);
      if (Math.floor(rt.t - F.stepT) !== F.finalClock) {
        F.finalClock = Math.floor(rt.t - F.stepT);
        rt.objProgress('main', dangerProgress(rt) ? `危ない！　槍組の後ろへ。残り${Math.ceil(15 - (rt.t - F.dangerAt))}秒` : Math.hypot(p.x - 24, p.z - (BANK_Z + 6)) >= 18 ? `東の印へ戻れ。残り${Math.max(0, Math.ceil(FINAL_LIMIT - (rt.t - F.stepT)))}秒` : foes ? '味方の列で敵を押し返せ' : F.finalChecked < 3 ? `三つの印で柵を見回れ　${F.finalChecked}／三か所` : `柵を見張れ　${Math.floor(F.finalSafe)}／二十四秒`);
      }
      if (rt.t - F.stepT >= FINAL_LIMIT - 30 && !F.deadlineWarn) { F.deadlineWarn = true; rt.bark('東の印へ戻れ。火の下知まで三十秒', true); rt.say('柴田勝家', '火の下知が迫る。東の柵を早う確かめよ', 4); }
      // 三か所を見回って見張る。岸で失敗していても、見回りの務めは最後まで残す。
      if (!dangerProgress(rt) && (F.finalChecked >= 3 && F.finalHeld >= FINAL_HOLD && F.finalSafe >= FINAL_HOLD || rt.t - F.stepT >= FINAL_LIMIT)) { F.held = F.finalChecked >= 3 && F.finalHeld >= FINAL_HOLD && F.finalSafe >= FINAL_HOLD; rt.unmark('east'); this.win(rt); }
    }
  },

  onFinish(rt) { rt.flags.hurtEdge.remove(); rt.unmark('retreat'); },

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
