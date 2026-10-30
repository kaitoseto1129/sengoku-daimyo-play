import { useTerrain } from './asset_manifest.js';
import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GUST, WIND_STATE } from './world.js';
import { WIND } from './world_weather.js';
import { S as SETTINGS } from './settings.js';
// 森部：雨中の渡河 → 先手 → 長い槍の押し合い → 両将の備を崩す → 集結。
import { gauss, centerOf, allyGroup, enemyGroup } from './bhelp.js';
import { distToPolyline } from './world.js';
import { tuftClumpAt } from './world_common.js';
import { RANKS } from './state.js';
import { nobori, timberRoof, jinmaku, solidRect } from './props.js';
import { woodTex, mudTex } from './nature.js';
import { MORIBE_KACCHU } from './kacchu_data.js';
import { addInterior } from './naka.js';
import { interiorLayout } from './interior_layouts.js';
import { addDeck } from './floors.js';
import { sendOrder } from './denrei.js';
import { nagashinojo } from './b_nagashinojo.js';
import { sfx } from './audio.js';
import { sightPoint, sightScreenUnit, inouSignVisible } from './battle_sight.js';
import { revealName } from './battle_intel.js';
import { gone as groupGone, seasonOf } from './b_shared.js';
import { camp } from './b_mid.js';
import { demBlend, demSample } from './dem.js';
import { drawGroundAt } from './render_camera.js';
import { clash } from './b_sekigahara.js';
import { battleEvent, EVENT_COMMANDER_ADVANCE, EVENT_UNIT_BREAK, EVENT_COMMANDER_KILLED, EVENT_REINFORCEMENT, EVENT_RETREAT } from './battle_events.js';
import { timeslipField } from './timeslip_field.js';

// ======================================================================
// 第2戦　森部
// ======================================================================
// 略図の距離は推定。南の本陣と東の川までの野を、会戦の足元へ縮めない。
const FIELD2 = 800;
const CAMP2 = { x: 0, z: 700 };
const NAGARA2 = 500;
const ROAD2 = [[-40, FIELD2], [-40, 176], [-28, 100], [-14, 40], [-6, -40], [4, -176], [4, -FIELD2]];
// 楡俣川（南の支流）の南岸から始め、腿までの流れを渡って北岸の川岸で組をそろえる。
const NIREMATA2 = 88;
const NIRE_WIDTH2 = 9;
// 楡俣川の流れの中ほどの z（下の streams の折れ線と同じ形）。
const nireZ = (x) => x < -70 ? NIREMATA2 + 2 * Math.min(1, (-70 - x) / 730) : x < 46 ? NIREMATA2 : NIREMATA2 + 6 * Math.min(1, (x - 46) / 454);
// 南岸の水際から始め、渡河そのものは残して岸までの長い歩きを省く。
const START2 = { x: 40, z: 98 };
// 向こう岸の水際。実際の水面を整えた後、最初に足が着く土へ合わせる。
const POINT2 = { x: 40, z: 76.5 };
const FORD_R = 4;
// 槍を持って踏み出す一歩を含め、砂の岸に足が掛かった時点で到着にする。
const FORD_FOOT = 2.5;
// ピンと同じ岸まで進み、水から上がれば渡河済み。横へそれても小旗へ戻らせない。
// 足の上下動や雨で濡れた土の水深に左右されず、描いた川面の北端を越えた瞬間に完了。
// 横へそれた岸もその場の水際で判定し、ピンの奥行きまで歩き直させない。
const atFordBank = (p, world, foot = 0) => p.z < nireZ(p.x) &&
  distToPolyline(p.x, p.z, world.def.streams[1].pts) >= world.def.streams[1].w - foot;
// 踏み出した足が砂の岸へ掛かる線で完了。ピンの先端も同じ線へ置く。
// ピンへ近づいただけでは水中で終えない。ピンのある対岸へ足が着いた瞬間にそろえる。
// 体の中心ではなく踏み出した足が岸へ着いた時に完了し、足元のピンまで来ても歩かせ続けない。
// 岸の明るい砂の始まりを FORD_FOOT とそろえる。ピンの一歩手前で止まっても渡り終えられる。
const playerAtFord = (p, world) => atFordBank(p, world, FORD_FOOT) ||
  // ピンの手前で足が根元へ届いた時も上陸とする。川の中央では達成しない。
  p.z < nireZ(p.x) && Math.hypot(p.x - POINT2.x, p.z - POINT2.z) <= 1.5;
// 大雨で楡俣川からあふれた分かれの流れ。渡った持ち場の先を横切る（25秒で bot は z52〜76）（見た目だけ。歩く高さは変えない。10/28）
const OVF_X0 = -26, OVF_X1 = 58;   // 東の端は薬師堂の手前で止める
// z38 では25秒の時の持ち場（z56〜67）から20〜35m先で、低い目線では地平の細い黒い筋にしか写らなかった（10/29）。
// 持ち場の足元の先から始まるように寄せ、正面の下半分に濁流の水面が広がるようにする。
const ovfZ = (x) => 47 + 2 * Math.sin(x * .045 + 1);
const ovfHW = (x) => 9.5 + .8 * Math.sin(x * .11 + 2);
// 濁流の渡り（bot も兵も通る x22〜30）。瀬の砂利が透け、下手に白い立ち波。両脇に古い渡り杭の列（10/29）。
const OVF_FORD_X = 26, OVF_STAKE_DX = 4.2, OVF_STAKE_STEP = 2.6;
const ovfStakes = () => { const out = []; for (const sx of [-1, 1]) { const x = OVF_FORD_X + sx * OVF_STAKE_DX, c = ovfZ(x), h = ovfHW(x);
  for (let z = c - h + 1.3, k = 0; z < c + h - 1; z += OVF_STAKE_STEP, k++) out.push([x + Math.sin(k * 2.9 + sx) * .18, z]); } return out; };
const FRONT2 = { x: 4, z: 20 };
const ASSEMBLY2 = { x: 14, z: 10 };
const RETREAT2 = { x: 24, z: 48 };
const YAKUSHI2 = { x: 66, z: 46 };
const LINE2 = -58;
// 在所の戸口・堂前から同じ岸を通る細道（位置は復元）。水田と木で塞がない。
const PEOPLE_PATHS2 = [
  [[-126, 10], [-124.4, 15.2], [-144, 20.6], [-240, 20.6]],
  [[-142, 34], [-143.1, 39.3], [-160, 45], [-240, 45]],
  [[-142, 58], [-170, 58], [-240, 58]],
  [[66, 46], [66, 51.2], [94, 56], [140, 56], [210, 40]],
  [[82, 56], [94, 56]],
];
// 印が画面外でも、視点から見た進む向きを任務の一行に残す。
function moribeDestination(rt, pos, label) {
  const p = rt.player, dx = pos.x - p.u.pos.x, dz = pos.z - p.u.pos.z;
  const yaw = p.yaw + (p.camYawOff || 0);
  const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
  const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const arrow = forward < -Math.abs(right) ? '↶' : Math.abs(right) > Math.abs(forward) * .6 ? right > 0 ? '→' : '←' : '↑';
  return `${arrow} ${label}`;
}
// 先手を退けた場所に近い味方の岸を、一度だけ守備先にする。
function moribeHoldPoint(rt) {
  const F = rt.flags;
  if (F.lineFixed) return;
  const p = rt.player.u.pos;
  let best = Infinity;
  for (const g of F.friends) if (!gone(g)) {
    const c = g.center(), z = Math.min(POINT2.z, c.z);
    const d = Math.hypot(c.x - p.x, z - p.z);
    if (d >= best || !rt.world.walkable(c.x, z)) continue;
    best = d; F.linePoint.x = c.x; F.linePoint.z = z;
  }
  if (best === Infinity) { F.linePoint.x = POINT2.x; F.linePoint.z = POINT2.z; }
  F.lineFixed = true;
}
function peoplePathDistance(x, z) {
  let d = Infinity;
  for (const path of PEOPLE_PATHS2) d = Math.min(d, distToPolyline(x, z, path));
  return d;
}

// 堂と在所の屋敷は推定復元。外壁の戸口と共通の室内の入口を同じ位置へそろえる。
function moribeBuildings(rt) {
  const W = rt.world, geo = new THREE.BoxGeometry(1, 1, 1, 1, 4, 1), bundles = new Map();
  // 妻壁の三角柱も三棟で共用する。底を零にして屋根の勾配へ寸法だけ合わせる。
  const gableBase = new THREE.BufferGeometry();
  gableBase.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5, 0, -.5, .5, 0, -.5, 0, 1, -.5,
    -.5, 0, .5, .5, 0, .5, 0, 1, .5,
  ], 3));
  gableBase.setIndex([0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4]);
  const gable = gableBase.toNonIndexed(); gable.computeVertexNormals();
  // 登り梁の下面へ納める束の斜めの木口。左右二形を三棟で共用する。
  const postCaps = [-1, 1].map(side => {
    const base = gableBase.clone(), p = base.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > .5) p.setX(i, -side * .5);
    const cap = base.toNonIndexed(); cap.computeVertexNormals(); base.dispose();
    return cap;
  });
  gableBase.dispose();
  // 軒下と地際の陰を既存の箱へ焼く。柱・壁・床で同じ形を使い、動く影は増やさない。
  const gp = geo.attributes.position, gn = geo.attributes.normal, shades = new Float32Array(gp.count * 3);
  for (let i = 0; i < gp.count; i++) {
    const t = gp.getY(i) + .5;
    const k = gn.getY(i) < -.5 ? .48 : gn.getY(i) > .5 ? 1 : .68 + Math.sin(t * Math.PI) * .28;
    shades[i * 3] = shades[i * 3 + 1] = shades[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(shades, 3));
  // 妻壁にも頂点色を持たせ、箱と同じ材質を使い回す。
  for (const shape of [gable, ...postCaps]) {
    shape.setAttribute('color', new THREE.BufferAttribute(new Float32Array(shape.attributes.position.count * 3).fill(1), 3));
  }
  const at = new THREE.Object3D();
  // 安八町の薬師堂の伝承を踏まえた復元。民家は西の在所へ寄せ、水路の上に置かない。
  // 民の人数・位置・避難路は史料にない。北岸のまま、村は西へ、堂は東の野へ逃がす。
  const routeOf = (path, from) => path.slice(from).map(([x, z]) => ({ x, z }));
  const villageRoute = routeOf(PEOPLE_PATHS2[2], 1);
  const templeRoute = routeOf(PEOPLE_PATHS2[3], 2);
  rt.civilianBands = [
    { x: -142, z: 58, kinds: ['farmer', 'woman', 'child', 'elder'], mode: 'watch', route: villageRoute },
    { x: 82, z: 56, kinds: ['farmer', 'merchant', 'woman', 'monk'], mode: 'watch', route: templeRoute },
  ];
  for (const b of [
    // 内外の戸を閉めても板間で体を返せる奥行きを取り、外陣も狭めない。
    { x: YAKUSHI2.x, z: YAKUSHI2.z, w: 5.4, d: 5.4, rot: 0, h: 3.2, kind: 'hondo', name: '森部の薬師堂', roof: 0x3a3430 },
    // 二つの座敷に幅約一メートル・長さ約二メートルの畳を納める推定寸法。
    // 板間と敷居・畳寄せの幅も引き、両座敷に長さ約一・九メートルを残す。
    // 入口一・三メートル、地覆・敷居・畳寄せの合計一・一六メートル、
    // 二室の畳各一・九メートルを足す。奥行き五・八では畳が一・六七に縮んでいた。
    // 内外装・屋根・段・引き戸は、この寸法から同じ間取りで組み立てる。
    { x: -126, z: 10, w: 6, d: 6.26, rot: .3, h: 2.7, kind: 'yashiki', name: '在所の屋敷', roof: 0x6a5c44 },
    { x: -142, z: 34, w: 5, d: 6.26, rot: -.2, h: 2.7, kind: 'yashiki', name: '在所の小屋敷', roof: 0x6a5c44, shoji: true },
  ]) {
    const { x, z, w, d, rot, h } = b, hw = w / 2, hd = d / 2, temple = b.kind === 'hondo';
    const c = Math.cos(rot), s = Math.sin(rot), door = 1.8, dh = 2.2;
    const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    // 床・縁・礎石を実際に描く地面へそろえ、室内と戸口を土に埋めない。
    let ground = drawGroundAt(W, x, z);
    for (const lx of [-hw, 0, hw]) for (const lz of [-hd, 0, hd]) {
      const [px, pz] = P(lx, lz); ground = Math.max(ground, drawGroundAt(W, px, pz));
    }
    // 間仕切りの戸脇柱の下も測る。九点だけでは柱下の盛り上がりを拾えず、
    // 礎石が大引へ埋まり、束を立てられなくなる。共通の間取りから柱筋を取り、
    // 室内・戸口・段を作る前に床高へ反映する（設営時だけ）。
    const foundation = interiorLayout(b.kind, w, d, { profile: 'moribe' });
    // 窓と柱の位置は床高を決める前にそろえる。外の柱脚だけを後から測ると、
    // 窓脇や戸脇の盛り上がりへ床框が埋まり、室内の床と礎石が食い込む。
    const windows = [];
    for (const side of [-1, 1]) for (const room of foundation.rooms.slice(0, -1)) {
      windows.push({ face: 'x', s: side, t: (room.z0 + room.z1) / 2,
        w: Math.min(1.2, room.z1 - room.z0 - .6), y0: .8, y1: 1.9, shoji: true, sliding: true });
    }
    const measureFoot = (lx, lz) => {
      const [px, pz] = P(lx, lz); ground = Math.max(ground, drawGroundAt(W, px, pz));
    };
    // 柱脚だけでなく、柱の間の地面も測って床下を確保する。
    // 九点と柱筋だけでは室内や踊り場の途中の盛り上がりを拾えない。
    // 設営時だけ約一尺五寸おきに測り、三棟とも外装・室内・段に同じ床高を渡す。
    const measureFloor = (x0, x1, z0, z1) => {
      const nx = Math.ceil((x1 - x0) / .45), nz = Math.ceil((z1 - z0) / .45);
      for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
        measureFoot(x0 + (x1 - x0) * ix / nx, z0 + (z1 - z0) * iz / nz);
      }
    };
    const approachPad = temple ? .65 : .2;
    measureFloor(-hw, hw, -hd, hd + (temple ? .75 : 0));
    if (!temple) measureFloor(-(door + .4) / 2, (door + .4) / 2, hd, hd + approachPad + .1);
    for (const win of windows) for (const edge of [-1, 1]) {
      measureFoot(win.s * hw, win.t + edge * (win.w / 2 + .08));
    }
    const rearBays = Math.max(2, Math.round(w / 1.9));
    for (let q = 1; q < rearBays; q++) measureFoot(-hw + q * w / rearBays, -hd);
    const foundationEntry = foundation.rooms[foundation.rooms.length - 1];
    for (const side of [-1, 1]) {
      measureFoot(side * (door / 2 + .08), hd);
      measureFoot(side * hw, (foundationEntry.z0 + foundationEntry.z1) / 2);
      for (const p of foundation.portals) measureFoot(side * hw, p.z);
    }
    for (const v of foundation.walls) {
      if (v.guideOnly) continue;
      for (const [lx, lz] of [[v.ax, v.az], [v.bx, v.bz]]) {
        const [px, pz] = P(lx, lz); ground = Math.max(ground, drawGroundAt(W, px, pz));
      }
    }
    // 堂前の縁も地面より上へ納める。深い軒の下の床と束が土へ潜らないようにする。
    if (temple) for (const lx of [-hw, 0, hw]) {
      const [px, pz] = P(lx, hd + .75); ground = Math.max(ground, drawGroundAt(W, px, pz));
    }
    if (temple) for (const lx of [-hw + .15, -(door + .4) / 2, (door + .4) / 2, hw - .15]) {
      measureFoot(lx, hd + .6);
    }
    const y = ground + .45;
    W.addGroundShade(x, z, w + 2.4, d + 2.4, rot, .43);
    const box = (lx, ly, lz, ww, hh, dd, color, tilt = 0, shape = geo, slope = 0) => {
      const [px, pz] = P(lx, lz);
      at.position.set(px, ly, pz); at.rotation.set(0, rot, 0); at.rotateZ(tilt); at.rotateX(slope);
      at.scale.set(ww, hh, dd); at.updateMatrix();
      if (!bundles.has(shape)) bundles.set(shape, new Map());
      const colors = bundles.get(shape);
      if (!colors.has(color)) colors.set(color, []);
      colors.get(color).push(at.matrix.clone());
    };
    // 礎石を中心一点の地面から六センチ厚で置くと、斜面の低い端が浮く。
    // 石の範囲を約五寸以下の間隔で測り、底を土へ六センチ根入れする。
    // 柱を受ける上面は保ち、三棟の箱・石の材質へまとめる（設営時だけ）。
    const foundationStone = (lx, lz, top, width = .34) => {
      let bottom = top - .12;
      const steps = Math.ceil(width / .15);
      for (let ix = 0; ix <= steps; ix++) for (let iz = 0; iz <= steps; iz++) {
        const [px, pz] = P(lx - width / 2 + width * ix / steps,
          lz - width / 2 + width * iz / steps);
        bottom = Math.min(bottom, drawGroundAt(W, px, pz) - .06);
      }
      box(lx, (bottom + top) / 2, lz, width, top - bottom, width, 0x827b6d);
    };
    // 戸脇・窓脇も礎石から桁まで通す。床板だけで屋根の荷重を受けない推定復元。
    // 四隅・背面と同じ箱と材質を使い、室内の柱位置や戸の通り道は変えない。
    const groundedPost = (lx, lz, depth = .16, top = y + h) => {
      const [px, pz] = P(lx, lz), gy = drawGroundAt(W, px, pz);
      const bottom = gy + .06;
      foundationStone(lx, lz, bottom);
      box(lx, (bottom + top) / 2, lz, .16, top - bottom, depth, 0x493624);
    };
    const I = addInterior(W, { x, z, rot, kind: b.kind, profile: 'moribe', name: b.name, hasExterior: true,
      levels: [{ w, d, h, y }], door: { w: door, h: dh }, wins: () => windows,
      approach: { pad: approachPad, len: 1.8 } });
    rt.civilianBands.push({ x: I.doorOut.x, z: I.doorOut.z, mode: 'inside',
      kinds: temple ? ['monk', 'monk', 'farmer'] : ['farmer', 'woman', 'child', 'elder'],
      route: temple ? templeRoute : routeOf(PEOPLE_PATHS2[b.shoji ? 1 : 0], 2) });
    // 座敷の襖と入口の障子は間取りで指定し、当たりと横滑りを共通の仕組みへ任せる。
    // 床下を厚い一枚の木で埋めず、共通の室内の板床を周囲の床框で受ける。
    // 框の上端は板床の下面（八センチ下）。隅は前後へ側面の木口を納める。
    // 根太・大引・束を見せ、同じ箱と材質へまとめる。歩く床と戸口の高さは保つ。
    for (const side of [-1, 1]) {
      box(0, y - .16, side * hd, w + .3, .16, .3, 0x55422f);
      box(side * hw, y - .16, 0, .3, .16, d - .3, 0x55422f);
    }
    // 遠くで室内がまだ作られていない時も床下から堂内を透かさない。
    // 薄い下張りを板床の下面へ置き、仕上げ床と同じ面を重ねない。
    box(0, y - .09, 0, w - .3, .02, d - .3, 0x55422f);
    if (temple) {
      // 堂前の縁は推定復元。中央の踊り場は共通の入口に任せ、左右へ板敷きをつなぐ。
      // 戸の溝は外壁から十六センチの位置に残し、階段は縁の先端から上がる。
      const landing = (door + .4) / 2, width = hw - landing;
      for (const side of [-1, 1]) {
        const lx = side * (landing + width / 2), [cx, cz] = P(lx, hd + .375);
        addDeck({ cx, cz, x0: -width / 2, x1: width / 2, z0: -.375, z1: .375, rot, y, pad: 0, name: '薬師堂の縁' });
        // 縁板は幅ごとに分け、目地の下には薄い下地を残す（推定復元）。
        // 上面は既存の足場と同じ高さ。中央の踊り場と板割りをそろえる。
        box(lx, y - .07, hd + .375, width, .1, .75, 0x493624);
        for (let q = 0; q < 4; q++) {
          box(lx, y - .01, hd + (q + .5) * .1875, width, .02, .1875 - .003, 0x55422f);
        }
      }
      // 中央の踊り場の板も naka.js で左右と同じ四列へ割る。目地の線を上へ重ねない。
      // 縁框を左右の束と礎石で支え、板が宙へ張り出しただけの足場にしない。
      // 根太の外端を側框の内面へ納め、正面框は根太の幅だけ上側を欠く。
      // 框の下半分は束の上へ通し、根太の下面（二十センチ下）で受ける。
      // 太い箱同士を重ねず、縁板の下面と既存の床高は保つ（推定復元）。
      const verandaSpan = w - .36, verandaJoists = Math.ceil(verandaSpan / .45);
      const verandaXs = Array.from({ length: verandaJoists + 1 },
        (_, q) => -verandaSpan / 2 + q * verandaSpan / verandaJoists);
      box(0, y - .24, hd + .6, w, .08, .14, 0x55422f);
      let frameEdge = -hw;
      for (const lx of verandaXs) {
        const end = lx - .04;
        if (end > frameEdge) box((frameEdge + end) / 2, y - .16, hd + .6,
          end - frameEdge, .08, .14, 0x55422f);
        frameEdge = lx + .04;
      }
      if (hw > frameEdge) box((frameEdge + hw) / 2, y - .16, hd + .6,
        hw - frameEdge, .08, .14, 0x55422f);
      // 縁の左右の木口も側框で受ける（推定復元）。正面の框だけでは、
      // 端の縁板と根太の木口がむき出しになる。背面は堂の床框へ掛け、
      // 前端は正面框の内面へ納めて、同じ高さの木を重ねない。
      for (const side of [-1, 1]) {
        box(side * (hw - .07), y - .2, hd + .265,
          .14, .16, .53, 0x55422f);
      }
      for (const lx of [-hw + .15, -landing, landing, hw - .15]) {
        const [px, pz] = P(lx, hd + .6), gy = drawGroundAt(W, px, pz);
        const bottom = gy + .06, top = y - .28;
        foundationStone(lx, hd + .6, bottom, .3);
        if (top > bottom) box(lx, (bottom + top) / 2, hd + .6, .12, top - bottom, .12, 0x55422f);
      }
      // 縁板を束のある四か所だけで受けず、約一尺五寸おきの根太で支える。
      // 堂の床下から縁框へ掛け、中央の踊り場も同じ骨組みに載せる。
      // 箱・材質は既存の束へ入れ、設営後の処理や戸口の当たりは増やさない。
      for (const lx of verandaXs) {
        box(lx, y - .16, hd + .3,
          .08, .08, .74, 0x55422f);
      }
    }
    for (const lx of [-hw, hw]) for (const lz of [-hd, hd]) {
      // 隅柱も中の束と同じく礎石で受け、木の柱脚を雨中の地面へ埋めない。
      const [px, pz] = P(lx, lz), gy = drawGroundAt(W, px, pz), bottom = gy + .06;
      foundationStone(lx, lz, bottom);
      box(lx, (bottom + y) / 2, lz, .16, y - bottom, .16, 0x55422f);
      box(lx, y + h / 2, lz, .16, h, .16, 0x493624);
    }
    // 床板の下は大引・根太・束で受ける。四隅だけで広い床を支えない。
    // 足元の礎石から束を立て、戸口の段と室内の床面へは突き出さない。
    for (const lx of [-hw, 0, hw]) {
      box(lx, y - .31, 0, .16, .1, d + .16, 0x55422f);
      for (const lz of [-hd, 0, hd]) {
        if (lx !== 0 && lz !== 0) continue; // 四隅は既存の床下柱で受ける。
        const [px, pz] = P(lx, lz), gy = drawGroundAt(W, px, pz);
        const bottom = gy + .06, top = y - .36;
        foundationStone(lx, lz, bottom);
        box(lx, (bottom + top) / 2, lz, .14, top - bottom, .14, 0x55422f);
      }
    }
    // 間仕切りの柱割りにも床下の支持をそろえる（推定復元）。
    // 三列の大引だけでは、襖・格子戸の戸脇柱が床板と根太だけに載ってしまう。
    // 室内と同じ間取りから横木・束・礎石を作り、戸口より下だけで荷重を受ける。
    const layout = I.levels[0].layout, partitionRows = new Set(), partitionFeet = new Set(), postSeats = [];
    // 入口の見せる梁を受ける側柱の列にも、床下の横木を渡す。
    // 間仕切りだけから列を拾うと、この二本の内柱は床板の上で支えが途切れる。
    // 外の礎石付き通し柱と大引へつなぎ、根太の欠き込みにも同じ列を使う。
    const entryRoom = layout.rooms[layout.rooms.length - 1];
    const entryRow = (entryRoom.z0 + entryRoom.z1) / 2;
    // 横木は三筋の大引の上へ欠き掛け、側框の下へ木口を納める推定復元。
    // 一本の箱では大引と十センチ、側框と四センチ重なっていた。
    // 柱を受ける中央の成と下面は保ち、交点だけを設営時に分ける。
    const crossBeamCuts = [-hw, -hw + .08, -hw + .15, -.08, .08, hw - .15, hw - .08, hw];
    const floorCrossBeam = (zz) => {
      for (let q = 1; q < crossBeamCuts.length; q++) {
        const left = crossBeamCuts[q - 1], right = crossBeamCuts[q], lx = (left + right) / 2;
        const overBearer = Math.abs(lx) < .08 || Math.abs(lx) > hw - .08;
        const underFrame = Math.abs(lx) > hw - .15;
        const bottom = overBearer ? -.26 : -.36, top = underFrame ? -.24 : -.2;
        box(lx, y + (bottom + top) / 2, zz, right - left, top - bottom, .16, 0x55422f);
      }
    };
    partitionRows.add(entryRow);
    floorCrossBeam(entryRow);
    for (const v of layout.walls) {
      if (v.guideOnly) continue;
      if (!partitionRows.has(v.az)) {
        partitionRows.add(v.az);
        floorCrossBeam(v.az);
      }
      for (const [lx, lz] of [[v.ax, v.az], [v.bx, v.bz]]) {
        const key = `${lx}:${lz}`;
        if (partitionFeet.has(key)) continue;
        partitionFeet.add(key);
        // 戸脇柱の下は横木から下張りまで受け木でつなぐ。
        // 横木上端と下張り下面の十センチを空洞にせず、柱の荷重を礎石へ通す。
        // 側壁際は既存の床框が受ける。室内の床高と建具は動かさない。
        if (Math.abs(lx) + .07 < hw - .15) {
          box(lx, y - .15, lz, .14, .1, .14, 0x55422f);
          postSeats.push({ x: lx, z: lz });
        }
        const [px, pz] = P(lx, lz), gy = drawGroundAt(W, px, pz);
        const bottom = gy + .06, top = y - .36;
        foundationStone(lx, lz, bottom);
        if (top > bottom) box(lx, (bottom + top) / 2, lz, .14, top - bottom, .14, 0x55422f);
      }
    }
    const joists = Math.ceil(d / .45);
    // 正背面の床框が両端の床を受ける。そこへ根太を二重に重ねない。
    for (let q = 1; q < joists; q++) {
      // 下端を大引の上端へ、上端を下張りの下面へ合わせて床を受ける。
      // 間仕切り下の横木は大引より六センチ高い。根太が重なる所だけ
      // 下側を欠いて載せ、木同士を貫通させない推定復元。床板の高さは保つ。
      const zz = -hd + q * d / joists, back = zz - .035, front = zz + .035;
      const cuts = [back, front];
      for (const row of partitionRows) for (const edge of [row - .08, row + .08]) {
        if (edge > back && edge < front) cuts.push(edge);
      }
      for (const seat of postSeats) for (const edge of [seat.z - .07, seat.z + .07]) {
        if (edge > back && edge < front) cuts.push(edge);
      }
      cuts.sort((a, b) => a - b);
      for (let i = 1; i < cuts.length; i++) {
        const depth = cuts[i] - cuts[i - 1];
        if (depth < .0001) continue;
        const mid = (cuts[i] + cuts[i - 1]) / 2;
        const bearing = [...partitionRows].some(row => Math.abs(mid - row) < .08);
        // 左右の木口は床框の内面へ納め、柱下の受け木にも突き合わせる。
        // 根太を框や受け木へ貫通させず、既存の箱・材質へ束ねる推定復元。
        const ends = [-hw + .15, hw - .15];
        for (const seat of postSeats) if (Math.abs(mid - seat.z) < .07) {
          ends.push(seat.x - .07, seat.x + .07);
        }
        ends.sort((a, b) => a - b);
        for (let j = 1; j < ends.length; j++) {
          const left = ends[j - 1], right = ends[j], cx = (left + right) / 2;
          if (right - left < .0001 || postSeats.some(seat =>
            Math.abs(mid - seat.z) < .07 && Math.abs(cx - seat.x) < .07)) continue;
          box(cx, y + (bearing ? -.15 : -.18), mid,
            right - left, bearing ? .1 : .16, depth, 0x55422f);
        }
      }
    }
    const wall = temple ? 0x6a5a44 : 0x86705a;
    box(0, y + h / 2, -hd, w, h, .08, wall);
    // 外の真壁も柱と横木で受ける推定復元。下の地覆は戸口を横切らせない。
    // 軒の桁は共通の屋根に任せ、その下の頭貫を窓脇の柱へつなぐ。
    box(0, y + .08, -hd, w, .16, .16, 0x493624);
    for (const zz of [-hd, hd]) box(0, y + h - .12, zz, w, .16, .16, 0x493624);
    // 背面の真壁は室内（naka.js）の柱割りとそろえる。広い土壁を隅柱だけで受けない。
    // 中間の柱も礎石から頭貫まで通し、床下で宙に浮かせない（推定復元）。
    for (let q = 1; q < rearBays; q++) {
      const lx = -hw + q * w / rearBays, [px, pz] = P(lx, -hd);
      const gy = drawGroundAt(W, px, pz), bottom = gy + .06, top = y + h;
      foundationStone(lx, -hd, bottom);
      box(lx, (bottom + top) / 2, -hd, .16, top - bottom, .16, 0x493624);
    }
    // 正背面にも腰貫を渡す推定復元。室内の隅柱と中柱の内面へ木口を納め、
    // 正面は戸脇で止める。見込みは窓下の腰貫とそろえ、内壁の中へ埋めない。
    // 既存の箱・材質へ束ね、板戸の溝と戸口の足場は空ける。
    const waistY = (.16 + .8 - .08) / 2;
    // 窓のない正背面も腰貫一本で終わらせず、上の土壁へもう一段の貫を渡す推定復元。
    // 腰貫上端と頭貫下端の間へ納め、長押・鴨居・天井の高さは動かさない。
    const upperTieY = (waistY + .04 + h - .2) / 2;
    const rearPosts = [-hw + .16];
    for (let q = 1; q < rearBays; q++) rearPosts.push(-hw + q * w / rearBays);
    rearPosts.push(hw - .16);
    // 背面の貫を中柱の手前で切っただけにせず、柱内の通しほぞと込栓でつなぐ。
    // ほぞは柱の中へ隠し、栓の木口だけを表裏へ二ミリ出す推定復元。
    // 外の通し柱と内側の付柱の間も同じ貫で結び、箱・木材の束を使い回す。
    // 戸口や障子のない背面だけに納め、歩く範囲と建具の当たりは保つ。
    for (let q = 1; q < rearBays; q++) {
      const lx = -hw + q * w / rearBays;
      for (const tieY of [waistY, upperTieY]) {
        box(lx, y + tieY, -hd + .06, .16, .04, .10, 0x493624);
        for (const face of [-.082, .232]) {
          box(lx, y + tieY, -hd + face, .018, .018, .004, 0x55422f);
        }
      }
    }
    for (let q = 1; q < rearPosts.length; q++) {
      const left = rearPosts[q - 1] + (q === 1 ? .07 : .08);
      const right = rearPosts[q] - (q === rearPosts.length - 1 ? .07 : .08);
      if (right > left) box((left + right) / 2, y + waistY, -hd + .06,
        right - left, .08, .28, 0x493624);
      if (right > left) box((left + right) / 2, y + upperTieY, -hd + .06,
        right - left, .08, .28, 0x493624);
      // 背面の一間ほどの土壁も間柱で受ける推定復元。
      // 窓下と同じ見込みを取り、内壁の表より木を出す。
      // 腰貫の上下で木口を止め、同じ面を重ねない。
      // 下は地覆、上は頭貫へ納め、既存の箱と材質へ束ねる。
      if (right - left > .9) {
        const middle = (left + right) / 2;
        // 貫を通す所だけ間柱を欠き、木同士の重なりを残さない。
        for (const [bottom, top] of [[.16, waistY - .04],
          [waistY + .04, upperTieY - .04], [upperTieY + .04, h - .2]]) {
          if (top > bottom) box(middle, y + (bottom + top) / 2, -hd + .06,
            .08, top - bottom, .28, 0x493624);
        }
      }
    }
    for (const side of [-1, 1]) {
      const inner = door / 2 + .16, outer = hw - .23;
      if (outer > inner) box(side * (inner + outer) / 2, y + waistY, hd - .06,
        outer - inner, .08, .28, 0x493624);
      // 戸口を横切らせず、左右の戸脇柱から隅柱まで同じ二段の貫でつなぐ。
      if (outer > inner) box(side * (inner + outer) / 2, y + upperTieY, hd - .06,
        outer - inner, .08, .28, 0x493624);
      // 正面の戸口脇にも間柱を入れる推定復元。背面・窓下と同じく、
      // 一間ほどの土壁を腰貫だけで受けず、地覆から頭貫まで木をつなぐ。
      // 腰貫の上下で分けて木を重ねず、室内側の地覆上端から立てる。
      // 外の板戸は壁芯より十二センチ外を滑るため、間柱は八センチ外で止める。
      // 三棟共通の箱・材質へ束ね、戸口・溝・歩く範囲は空ける。
      if (outer - inner > .9) {
        const middle = side * (inner + outer) / 2;
        for (const [bottom, top] of [[.17, waistY - .04],
          [waistY + .04, upperTieY - .04], [upperTieY + .04, h - .2]]) {
          if (top > bottom) box(middle, y + (bottom + top) / 2, hd - .06,
            .08, top - bottom, .28, 0x493624);
        }
      }
    }
    // 長押は背面だけで止めず、正面・側面の通し柱へも巡らせる（推定復元）。
    // 室内の内法長押と高さをそろえ、戸口の鴨居・明かり障子より上でつなぐ。
    // 柱の外面（八センチ）へ長押の背を掛ける。柱芯に置くと柱へ埋まり、
    // 土壁の帯に見えてしまう。戸板の溝より上で、既存の箱と材質を使う。
    const nageshiY = y + (temple ? 2.72 : 2.32);
    // 正背面を隅まで通し、側面の木口はその内面へ突き合わせる。
    for (const side of [-1, 1]) {
      box(0, nageshiY, side * (hd + .11), w + .28, .1, .06, 0x493624);
      box(side * (hw + .11), nageshiY, 0, .06, .1, d + .16, 0x493624);
    }
    // 外の長押も内装と同じ七センチ角の釘隠しで柱への留めを表す推定復元。
    // 壁の途中へ等間隔には打たず、実際の隅柱・戸脇柱・窓脇柱の芯を拾う。
    // 長押の表へ六ミリずつ掛け、引き戸や障子の滑る溝より上に納める。
    // 三棟とも既存の箱を使い、一つの鉄色の束へまとめる（設営時だけ）。
    for (const side of [-1, 1]) {
      const frontPosts = [-hw, -door / 2 - .08, door / 2 + .08, hw];
      const backPosts = Array.from({ length: rearBays + 1 }, (_, q) => -hw + q * w / rearBays);
      for (const lx of side > 0 ? frontPosts : backPosts) {
        box(lx, nageshiY, side * (hd + .146), .07, .07, .012, 0x252321);
      }
      const sidePosts = new Set([-hd, hd, ...partitionRows]);
      for (const win of windows) if (win.s === side) {
        sidePosts.add(win.t - win.w / 2 - .08);
        sidePosts.add(win.t + win.w / 2 + .08);
      }
      for (const lz of sidePosts) {
        box(side * (hw + .146), nageshiY, lz, .012, .07, .07, 0x252321);
      }
    }
    for (const side of [-1, 1]) {
      box(side * hw, y + .08, 0, .16, .16, d, 0x493624);
      box(side * hw, y + h - .12, 0, .16, .16, d, 0x493624);
      box(side * (hw + door / 2) / 2, y + .08, hd, (w - door) / 2, .16, .16, 0x493624);
      box(side * (hw + door / 2) / 2, y + h / 2, hd, (w - door) / 2, h, .08, wall);
      // 戸脇柱は鴨居で止めず、頭貫まで通して桁と屋根を受ける。
      // 戸口の内法幅はそのままに、上の小壁も柱の間へ納める。
      groundedPost(side * (door / 2 + .08), hd, .18);
      // 側面の明かり障子の穴を空け、紙と桟は室内の共通部品で描く。
      let edge = -hd;
      for (const win of windows.filter(win => win.s === side)) {
        const start = win.t - win.w / 2, end = win.t + win.w / 2;
        box(side * hw, y + h / 2, (edge + start) / 2, .08, h, start - edge, wall);
        box(side * hw, y + win.y0 / 2, win.t, .08, win.y0, win.w, wall);
        box(side * hw, y + (h + win.y1) / 2, win.t, .08, h - win.y1, win.w, wall);
        // 鴨居は naka.js の溝付き窓枠を共用する。外壁まで三十センチの
        // 見込みがあるため、ここへ横木を重ねると溝を埋め、上面もちらつく。
        // 窓脇柱へ掛ける共通の鴨居だけで、内外の建具を一つに納める。
        // 雨中の明かり障子には板葺きの小庇を掛ける推定復元。
        // 外へ水を流す勾配を取り、下の鴨居と戸の二本の溝は空ける。
        // 三棟の箱と木の材質へまとめ、動く部材や光源は増やさない。
        const hoodTilt = -side * .2, hoodSlope = Math.tan(.2);
        const hoodBoardH = .012, hoodLap = hoodBoardH / Math.cos(.2);
        // 上手の板を下手の板へ葺き重ねる。三枚を同じ面に置くと、
        // 重なった木が交差し、雨を逃がす段差も見えなくなる。
        // 回転した板厚分だけ上げ、板の傾きと中心の勾配も一致させる。
        for (let q = 0; q < 3; q++) {
          const reach = .04 + (q + .5) * .14;
          box(side * (hw + reach), y + win.y1 + .23 - reach * hoodSlope + (2 - q) * hoodLap, win.t,
            .16, hoodBoardH, win.w + .4, 0x55422f, hoodTilt);
        }
        // 小庇の軒先にも水切りの垂れを付ける推定復元。
        // 葺板の裏へ回った雨を先端で落とし、窓枠・土壁へ戻さない納まりにする。
        // 最下段の板の下面へ上端を合わせ、同じ箱と木の材質へ束ねる。
        const dripReach = .455, dripH = .025;
        const dripTop = y + win.y1 + .23 - dripReach * hoodSlope - hoodBoardH / (2 * Math.cos(.2));
        box(side * (hw + dripReach), dripTop - dripH / 2, win.t,
          .018, dripH, win.w + .4, 0x55422f, hoodTilt);
        // 庇の両端は窓脇の通し柱から腕木で受け、板だけを壁へ貼り付けない。
        for (const zz of [start - .08, end + .08]) {
          // 腕木の上面を最下段の板の下面へ合わせ、葺き重ねの板へ突き抜けさせない。
          box(side * (hw + .18), y + win.y1 + .23 - .18 * hoodSlope - (hoodBoardH + .07) / (2 * Math.cos(.2)), zz,
            .4, .07, .07, 0x493624, hoodTilt);
          // 葺き重ねで上がる二枚の下面も受ける。平らな腕木だけでは
          // 上手の板との間に一・二〜二・四センチの隙間が残って浮く。
          // 重ね代を避けた短い飼木を同じ勾配で納める推定復元。
          // 三棟の箱・材質へ束ね、障子の鴨居と滑る溝には出さない。
          for (let q = 0; q < 2; q++) {
            const reach = .04 + (q + .5) * .14, lift = (2 - q) * hoodLap;
            box(side * (hw + reach), y + win.y1 + .23 - reach * hoodSlope
              - hoodLap / 2 + lift / 2, zz,
              .1, (2 - q) * hoodBoardH, .07, 0x493624, hoodTilt);
          }
        }
        // 共通の敷居の外面は壁芯から十一センチ。水切りをその中へ
        // 埋めず、敷居上面から外下がりにつなぎ、排水の切欠きの先を開ける。
        // 板厚を含めて端を合わせ、窓枠と水切りの重なりを残さない推定復元。
        const sillSlope = .12, sillRun = .16, sillThickness = .025;
        const sillBack = .11, sillFront = sillBack + sillRun;
        const sillCenter = (sillBack + sillFront) / 2;
        const sillTop = win.y0 - sillRun / 2 * Math.tan(sillSlope);
        box(side * (hw + sillCenter), y + sillTop - sillThickness / (2 * Math.cos(sillSlope)), win.t,
          sillRun / Math.cos(sillSlope) - sillThickness * Math.tan(sillSlope),
          sillThickness, win.w + .16, 0x493624, -side * sillSlope);
        // 垂れは水切りの下面へ付け、外端を窓枠より十分外へ出す。
        // 以前は敷居の外面より内側にあり、雨垂れを離す木が枠へ埋まっていた。
        const sillDripTop = win.y0 - (sillRun - .012) * Math.tan(sillSlope)
          - sillThickness / Math.cos(sillSlope);
        box(side * (hw + sillFront - .012), y + sillDripTop - .01 / Math.cos(sillSlope), win.t,
          .02, .02, win.w + .16, 0x493624, -side * sillSlope);
        // 窓の短い縦枠だけを浮かせず、内側の窓脇柱と同じ位置に通し柱を立てる。
        for (const zz of [start - .08, end + .08]) {
          groundedPost(side * hw, zz);
        }
        // 窓上下の間柱と貫は、木口を突き付けるだけにせず通しほぞで組む推定復元。
        // 間柱の中央八センチだけを貫の高さで欠き、左右の貫をそこへ通す。
        // 内外の頬は残し、木同士を貫通させない。障子の開口と溝は空ける。
        // 三棟の既存の箱・材質へ束ね、設営後の処理は増やさない。
        const wallSpan = win.w / 2 - .04;
        for (const [bottom, top] of [[.16, win.y0 - .08], [win.y1 + .08, h - .2]]) {
          if (top <= bottom) continue;
          const middle = (bottom + top) / 2;
          if (wallSpan <= 0 || top - bottom <= .08) {
            box(side * (hw - .06), y + middle, win.t,
              .28, top - bottom, .08, 0x493624);
            continue;
          }
          for (const [lo, hi] of [[bottom, middle - .04], [middle + .04, top]]) {
            box(side * (hw - .06), y + (lo + hi) / 2, win.t,
              .28, hi - lo, .08, 0x493624);
          }
          for (const face of [-1, 1]) {
            box(side * (hw - .06) + face * .09, y + middle, win.t,
              .1, .08, .08, 0x493624);
            // 込栓は木口だけを両面へ二ミリ出し、通路へ突き出す金具にしない。
            box(side * (hw - .06) + face * .141, y + middle, win.t,
              .002, .012, .012, 0x55422f);
          }
          box(side * (hw - .06), y + middle, win.t, .08, .08, .08, 0x493624);
          for (const end of [-1, 1]) {
            box(side * (hw - .06), y + middle,
              win.t + end * (win.w / 4 + .02), .28, .08, wallSpan, 0x493624);
          }
        }
        edge = end;
      }
      box(side * hw, y + h / 2, (edge + hd) / 2, .08, h, hd - edge, wall);
      // 窓下だけで止まっていた腰貫を、隅・間仕切り・入口の柱までつなぐ推定復元。
      // 柱の内面で木口を止め、既存の窓下の貫とは重ねない。障子より下で土壁を受ける。
      // 三棟の箱と木の材質へ束ね、設営後の処理と戸の当たりは増やさない。
      const sideWins = windows.filter(win => win.s === side);
      const entry = layout.rooms[layout.rooms.length - 1];
      const postRows = [...new Set([-hd, hd, ...partitionRows, (entry.z0 + entry.z1) / 2,
        ...sideWins.flatMap(win => [win.t - win.w / 2 - .08, win.t + win.w / 2 + .08])])]
        .sort((a, b) => a - b);
      const waistY = (.16 + (sideWins[0]?.y0 ?? .8) - .08) / 2;
      const sideUpperTieY = (waistY + .04 + h - .2) / 2;
      for (let q = 1; q < postRows.length; q++) {
        const start = postRows[q - 1] + .08, end = postRows[q] - .08;
        const middle = (start + end) / 2;
        if (end <= start || sideWins.some(win => Math.abs(middle - win.t) < win.w / 2 + .08)) continue;
        // 内壁の表は壁芯から十三センチ内側。窓下と同じ見込みへ通し、
        // 窓のない壁だけ腰貫が内装に隠れて途切れる作りを直す。
        box(side * (hw - .06), y + waistY, middle, .28, .08, end - start, 0x493624);
        // 窓のない側壁にも正背面と同じ上段の貫を通す推定復元。
        // 腰貫だけで高い土壁を支えず、通し柱の内面まで木をつなぐ。
        // 窓と戸の溝は避け、三棟で既存の箱・材質へまとめる。
        box(side * (hw - .06), y + sideUpperTieY, middle, .28, .08, end - start, 0x493624);
        // 窓のない側壁も、背面と同じく間柱で土壁を受ける推定復元。
        // 通し柱だけでは広く残る部分に限り、地覆から頭貫まで木をつなぐ。
        // 二段の貫の上下で分け、窓・引き戸の範囲や横木へ重ねない。
        if (end - start > .6) {
          for (const [bottom, top] of [[.16, waistY - .04],
            [waistY + .04, sideUpperTieY - .04], [sideUpperTieY + .04, h - .2]]) {
            if (top > bottom) box(side * (hw - .06), y + (bottom + top) / 2,
              middle, .28, top - bottom, .08, 0x493624);
          }
        }
      }
    }
    box(0, y + (h + dh) / 2, hd, door, h - dh, .08, wall);
    // 戸口の鴨居は、外の板戸を受ける溝付きの横木の背面（七センチ）で止める。
    // 二つの木を二センチ重ねず、柱側の後端は従来の位置へ残す。
    // 両端は戸脇柱の内面へ突き付ける。柱の中へ十五センチずつ
    // 箱を重ねると、柱面と鴨居の上下に同じ面が残ってちらつく。
    // 内側の鴨居も同じ内法幅とし、戸の溝・開口はそのままにする。
    box(0, y + dh + .06, hd - .01, door, .12, .16, 0x493624);
    // 戸脇の仕口にも込栓を見せ、柱へ突き付けただけの敷居・鴨居にしない推定復元。
    // 下溝の底より下、上溝の底より上で留め、板戸の二本の軌道を空ける。
    // 溝付き横木の正面は壁芯から二十五センチ。木口を二ミリだけ出す。
    // 柱面へ置くと横木に隠れるため、横木を通して柱へ留める形とし、箱と材質を共用する。
    for (const side of [-1, 1]) for (const pinY of [.02, dh + .05]) {
      box(side * (door / 2 + .08), y + pinY, hd + .251,
        .022, .022, .002, 0x55422f);
    }
    // 戸口の見込みは内側の柱面から外の戸脇まで木で包む（推定復元）。
    // 外壁と内壁の別々の枠を、左右の竪枠と上の見込み板で一つの開口へ納める。
    // 板戸は外壁から十二・二十センチの溝を滑るため、見込みは七センチで止める。
    // 二センチの板は開口側へ納め、既存の柱・鴨居と同じ面を重ねて描かない。
    for (const side of [-1, 1]) {
      box(side * (door / 2 - .01), y + dh / 2, hd - .08, .02, dh, .3, 0x55422f);
    }
    box(0, y + dh - .01, hd - .08, door - .04, .02, .3, 0x55422f);
    // 戸口上の小壁も中束で受ける推定復元。鴨居の上端から頭貫の下端へ納める。
    // 板戸の溝より上だけに置き、横へ引く戸と入口の内法を塞がない。
    const lintelTop = y + dh + .12, tieBottom = y + h - .2;
    if (tieBottom > lintelTop) {
      box(0, (lintelTop + tieBottom) / 2, hd, .12, tieBottom - lintelTop, .12, 0x493624);
      // 戸口上の土壁は縦の中束だけでなく、戸脇柱へ渡す小壁貫でも受ける推定復元。
      // 内壁と外壁を同じ木で貫き、中束の両側で止めて木口を納める。
      // 鴨居の上へ置き、長押・頭貫と戸板の二本の溝を空ける。
      const span = door / 2 - .06;
      if (span > 0 && tieBottom - lintelTop >= .18) for (const side of [-1, 1]) {
        box(side * (.06 + span / 2), lintelTop + .09, hd - .06,
          span, .06, .3, 0x493624);
      }
    }
    // 外の板戸も室内と同じく溝を彫り、黒い帯を木の表へ重ねない。
    // 敷居は上から八ミリ、鴨居は下から三センチ掘り、引き切る位置まで通す。
    // 戸・足場・当たりの位置は保ち、底と溝脇を既存の箱・材質へ束ねる。
    for (const head of [false, true]) {
      // 屋敷の長押の下端は二・二七メートル。上溝の受け木もそこで止め、
      // 長押へ一センチ食い込ませない。溝の深さと戸の掛かりは保つ。
      const bottom = head ? dh : 0, height = head ? (temple ? .08 : .07) : .04;
      const depth = head ? .03 : .008, top = bottom + height;
      const width = door * 2 + .16, center = hd + .16;
      box(0, y + (head ? bottom + depth : bottom) + (height - depth) / 2, center,
        width, height - depth, .18, 0x493624);
      const lipY = y + (head ? bottom + depth / 2 : top - depth / 2);
      // 雨中の敷居は、二本の溝から外へ水を逃がす切欠きを両端に取る推定復元。
      // 戸当たりより外へ二十四ミリ幅で彫り、戸の下框と中央の通り道は避ける。
      // 内側の縁は残し、溝間の縁と外側の縁だけを同じ箱・材質で分ける。
      const drainX = width / 2 - .04, drainHalf = .012;
      const grooveLip = (back, front) => {
        if (front <= back) return;
        const spans = !head && back >= -.008 - .0001
          ? [[-width / 2, -drainX - drainHalf], [-drainX + drainHalf, drainX - drainHalf],
            [drainX + drainHalf, width / 2]]
          : [[-width / 2, width / 2]];
        for (const [left, right] of spans) box((left + right) / 2, lipY,
          center + (back + front) / 2, right - left, depth, front - back, 0x493624);
      };
      let edge = -.09;
      for (const track of [-.04, .04]) {
        const left = track - .032, right = track + .032;
        grooveLip(edge, left);
        box(0, y + (head ? bottom + depth - .0005 : top - depth + .0005), center + track,
          width, .001, .064, 0x1e140e);
        edge = right;
      }
      grooveLip(edge, .09);
    }
    // 外の板戸は雨中の推定復元。鴨居の二本の溝へ吹き込む雨を、外下がりの雨押えで逃がす。
    // 戸の上框より上へ掛け、引き切った位置まで覆う。既存の箱・木の材質へまとめる。
    // 屋敷では内法長押と雨押えが同じ高さになる。板の奥を長押へ
    // 貫通させず、その外面へ木口を納める。奥の溝は長押が覆い、
    // 雨押えは従来と同じ勾配・軒先までつなぐ。堂の納まりは保つ。
    const rainSlope = .12, rainThickness = .025;
    const rainBack = temple ? .19 - .16 * Math.cos(rainSlope)
      : .14 + rainThickness * Math.sin(rainSlope) / 2;
    const rainFront = .19 + .16 * Math.cos(rainSlope);
    const rainCenter = (rainBack + rainFront) / 2;
    box(0, y + dh + .115 - (rainCenter - .19) * Math.tan(rainSlope), hd + rainCenter,
      door * 2 + .2, rainThickness, (rainFront - rainBack) / Math.cos(rainSlope),
      0x55422f, 0, geo, rainSlope);
    // 窓と同じく戸口の雨押えにも垂れを付け、板裏へ回る水を外の戸溝から離す推定復元。
    // 上面は雨押えの下面へ密着させ、板を貫かず、開閉する上框より外へ納める。
    // 三棟の箱・木の材質へ束ね、室内の建具や歩く範囲には部材を足さない。
    const rainDripZ = rainFront - .012, rainDripH = .025;
    const rainDripTop = y + dh + .115 - (rainDripZ - .19) * Math.tan(rainSlope)
      - rainThickness / (2 * Math.cos(rainSlope));
    box(0, rainDripTop - rainDripH / (2 * Math.cos(rainSlope)), hd + rainDripZ,
      door * 2 + .2, rainDripH, .018, 0x55422f, 0, geo, rainSlope);
    // 敷居の外端にも水切りを出し、溝の水を戸口の床へ戻さない。
    // 上端を床より下へ納め、歩く段と板戸の当たりは増やさない。
    box(0, y - .035, hd + .29, door * 2 + .2, .025, .16, 0x55422f, 0, geo, .12);
    // 敷居下の水切りも外端で水を落とす。板裏を伝って床框へ戻る納まりにしない。
    // 下溝の排水欠きより下・外に置き、戸板と持送りの範囲は空ける。
    const sillDripZ = .29 + .08 * Math.cos(rainSlope) - .012;
    const sillDripTop = y - .035 - (sillDripZ - .29) * Math.tan(rainSlope)
      - .025 / (2 * Math.cos(rainSlope));
    box(0, sillDripTop - .02 / (2 * Math.cos(rainSlope)), hd + sillDripZ,
      door * 2 + .2, .02, .018, 0x55422f, 0, geo, rainSlope);
    // 引き切った戸の框を受ける戸当たり。二本の溝の末端を縦木で閉じる推定復元。
    // 共通の引き戸の最大幅（召合せの重なりを含む）の外へ納め、戸口と軌道は空ける。
    // naka_doors.js と同じく、竪枠・召合せ・遊びを除いた戸幅から止め位置を決める。
    const slidingSpan = door - 2 * (.02 + .012 + .002);
    const stopX = slidingSpan + .012 + .01 + .02;
    // 外へ張り出した敷居は、戸脇と引き切り位置の持送りで床框へ載せる推定復元。
    // 敷居の下面は床高、床框の上面は八センチ下。間へ受け木を納め、
    // 水切りの手前で止め、二本の溝・戸板・歩く床には出さない。
    // 三棟の箱と木の材質を共用する。
    for (const side of [-1, 1]) for (const supportX of [door / 2 + .08, stopX]) {
      box(side * supportX, y - .04, hd + .025, .08, .08, .35, 0x493624);
    }
    // 戸当たりの下端は四センチ厚の敷居上へ載せる。
    // 床高から立てると下の木が溝底まで貫き、二本の溝を埋めてしまう。
    // 上端は鴨居の下面へそろえ、戸の掛かりと引き切り位置は保つ。
    const stopBottom = .04, stopHeight = dh - stopBottom;
    for (const side of [-1, 1]) {
      box(side * stopX, y + stopBottom + stopHeight / 2, hd + .16,
        .04, stopHeight, .18, 0x493624);
    }
    // 共通の板葺きは屋根面と軒裏を受け持つ。妻壁は三棟で形と材質を共用する。
    const eave = temple ? .8 : .45, pitch = temple ? .48 : .36;
    const roofY = y + h + .15;
    const gableY = roofY + eave * pitch;
    // 棟包みの下に、垂木と天井の吊り木を受ける棟木を通す推定復元。
    // 共通屋根の垂木は棟高より二十二センチ下がり、半径は四・五センチ。
    // 棟包みへ吊り木を直結すると垂木を貫くため、その下面で荷重を受ける。
    const roofRun = hw + eave, roofRise = roofRun * pitch;
    const ridgeTop = roofY + roofRise - .265, ridgeBottom = ridgeTop - .14;
    box(0, ridgeTop - .07, 0, .14, .14, d + .16, 0x493624);
    // 共通屋根の軒桁の下端まで側壁を立ち上げる。深い軒の堂に隙間を残さない。
    // 桁の中心高と厚みは timberRoof に合わせ、柱も同じ高さで桁を受ける。
    const bearingY = gableY - .32, rise = bearingY - (y + h);
    // 間仕切り端の内柱と外壁の柱割りをそろえる推定復元。
    // 既存の床下の横木・束から側壁の柱を経て軒桁まで荷重を通す。
    // 明かり障子は各室の中へ納めてあるので、開口や引き戸の溝を横切らない。
    // 入口の見せる梁も両端を柱で受ける。間仕切りの列だけでは梁の木口が土壁へ刺さる。
    // 室内の梁と同じ板間の中央へそろえ、礎石から軒桁まで通す（推定復元）。
    for (const zz of partitionRows) for (const side of [-1, 1]) {
      groundedPost(side * hw, zz, .16, Math.max(y + h, bearingY));
    }
    // 棟木を正背面の束だけで渡さず、途中の梁からも小屋束で受ける推定復元。
    // 間仕切り梁と入口梁の上端は naka.js の seatedBeam とそろえる。
    // 束は天井裏へ通し、下端を天井板へ載せず梁へ納める。
    // 既存の箱・木の材質へ束ね、室内の戸口や歩く範囲へは出さない。
    for (const zz of partitionRows) {
      const bottom = y + h - (zz === entryRow ? .08 : .04);
      if (ridgeBottom > bottom) box(0, (bottom + ridgeBottom) / 2, zz,
        .12, ridgeBottom - bottom, .12, 0x493624);
    }
    if (rise > 0) for (const side of [-1, 1]) {
      box(side * hw, y + h + rise / 2, 0, .08, rise, d, wall);
      for (const lz of [-hd, hd, ...windows.filter(win => win.s === side)
        .flatMap(win => [win.t - win.w / 2 - .08, win.t + win.w / 2 + .08])]) {
        box(side * hw, y + h + rise / 2, lz, .16, rise, .16, 0x493624);
      }
    }
    for (const side of [-1, 1]) {
      box(0, (y + h + gableY) / 2, side * hd, w, gableY - y - h, .08, wall);
      box(0, gableY, side * hd, w, hw * pitch, .08, wall, 0, gable);
      // 妻の中央の束は頭貫から棟木の下面まで通す推定復元。
      // 棟木を突き抜けて垂木や棟包みへ入らず、下から棟の荷重を受ける。
      // 既存の一本の丈だけをそろえ、戸口の鴨居より上でつなぐ。
      const kingPostBottom = y + h - .04, kingPostTop = ridgeBottom;
      // 妻梁を束へ丸ごと貫通させず、交点だけ通しほぞで納める推定復元。
      // 束は梁の上下で肩を取り、梁の表裏には木を残す。同じ箱・材質へまとめる。
      const postXs = [0];
      const gablePost = (lx, top) => {
        for (const [bottom, end] of [[kingPostBottom, gableY - .06], [gableY + .06, top]]) {
          if (end > bottom) box(lx, (bottom + end) / 2, side * hd,
            .12, end - bottom, .12, 0x493624);
        }
        box(lx, gableY, side * hd, .06, .12, .08, 0x493624);
      };
      gablePost(0, kingPostTop);
      // 妻の中束も下の柱筋から登り梁まで通す（推定復元）。
      // 背面は既存の中柱、正面は戸脇柱にそろえ、小壁の途中で木を途切れさせない。
      // 天井より上だけを既存の箱・材質へ束ね、出入り口と引き戸の溝は空ける。
      const gablePosts = side < 0
        ? Array.from({ length: rearBays - 1 }, (_, q) => -hw + (q + 1) * w / rearBays)
        : [-door / 2 - .08, door / 2 + .08];
      for (const lx of gablePosts) {
        if (Math.abs(lx) < .12) continue; // 中央は棟まで通した束を共用する。
        // 束を梁の芯まで伸ばさず、厚さ十センチの登り梁の下面で受ける。
        // 束幅の低い側までを柱身とし、残りは勾配どおりの木口で隙間なく納める。
        const capH = .12 * pitch;
        const top = gableY + (hw - Math.abs(lx) - .06) * pitch - .05 * Math.sqrt(1 + pitch * pitch);
        postXs.push(lx);
        gablePost(lx, top);
        box(lx, top, side * hd, .12, capH, .12, 0x493624, 0, postCaps[lx < 0 ? 0 : 1]);
      }
      // 妻の土壁を中央の束だけで支えず、下の梁と登り梁で三角の縁を受ける。
      // 棟と軒の位置は共通屋根に合わせ、三棟とも既存の箱・材質へまとめる推定復元。
      // 束のほぞ穴だけ梁を分ける。隙間を黒い線で描かず、木の断面で仕口を作る。
      postXs.sort((a, b) => a - b);
      let beamEdge = -hw;
      for (const lx of postXs) {
        const end = lx - .03;
        if (end > beamEdge) box((beamEdge + end) / 2, gableY, side * hd,
          end - beamEdge, .12, .14, 0x493624);
        for (const face of [-1, 1]) box(lx, gableY, side * hd + face * .055,
          .06, .12, .03, 0x493624);
        beamEdge = lx + .03;
      }
      if (hw > beamEdge) box((beamEdge + hw) / 2, gableY, side * hd,
        hw - beamEdge, .12, .14, 0x493624);
      const slope = Math.atan(pitch), beamLength = hw * Math.sqrt(1 + pitch * pitch);
      for (const edge of [-1, 1]) {
        box(edge * hw / 2, gableY + hw * pitch / 2, side * hd,
          beamLength, .1, .12, 0x493624, -edge * slope);
      }
    }
    // 張り天井の上に野縁と吊り木を納める推定復元。
    // naka.js の天井板・裏板の上端（二・七センチ）で受け、
    // 奥座敷だけ向きを変えた竿縁にも直交させる。格天井は縦の格縁を受ける。
    // 吊り木の上端は垂木下の棟木下面へ付け、天井へ荷重を預けない。
    // 三棟の既存の箱・木の材質へ束ね、設営時だけ作る。
    const ceilingTop = y + h + .027, supportTop = ceilingTop + .09;
    // 五〜六メートルの野縁を中央の吊り木一本だけで持たせない。
    // 垂木の下に二筋の吊り受けを通し、野縁の左右も吊る推定復元。
    // 垂木の傾きは timberRoof の両端と同じ。受け木の上面を垂木の下面へ付ける。
    const hangerX = w / 4;
    const hangerTop = roofY + roofRise - .22
      - hangerX * (roofRise - .04) / (roofRun - .06) - .045;
    const hangerBottom = hangerTop - .12;
    if (hangerBottom > supportTop) for (const side of [-1, 1]) {
      box(side * hangerX, hangerTop - .06, 0, .1, .12, d - .24, 0x493624);
    }
    for (let r = 0; r < layout.rooms.length; r++) {
      const room = layout.rooms[r];
      const across = temple || r !== 0;
      // 堂・取次・入口は中央一筋だけでなく、三尺以内ごとに野縁を渡す推定復元。
      // 室の端から半間隔ずつ控え、各筋を棟木と左右の吊り受けへつなぐ。
      // 奥座敷は向きを変えた野縁も幅全体へ配り、同じ箱・材質の束へ納める。
      const depth = room.z1 - room.z0 - .22;
      if (!across) {
        // 中央一本だけでは左右の天井板を受けられない。竿縁と直交する
        // 奥行き方向の野縁を三尺以内で並べ、その上の二本の受け木へ吊る。
        // 受け木の下面を野縁の上面へ合わせ、木同士を貫通させない推定復元。
        const span = w - .4, rails = Math.max(1, Math.ceil(span / .9));
        const centerZ = (room.z0 + room.z1) / 2;
        for (let q = 0; q < rails; q++) {
          box(-span / 2 + span * (q + .5) / rails, ceilingTop + .045, centerZ,
            .08, .09, depth, 0x493624);
        }
        const receiverTop = supportTop + .12;
        for (const end of [-1, 1]) {
          const zz = centerZ + end * depth / 4;
          box(0, supportTop + .06, zz, span, .12, .1, 0x493624);
          if (ridgeBottom > receiverTop) box(0, (receiverTop + ridgeBottom) / 2, zz,
            .06, ridgeBottom - receiverTop, .06, 0x493624);
          if (hangerBottom > receiverTop) for (const side of [-1, 1]) {
            box(side * hangerX, (receiverTop + hangerBottom) / 2, zz,
              .06, hangerBottom - receiverTop, .06, 0x493624);
          }
        }
        continue;
      }
      const rows = Math.max(1, Math.ceil(depth / .9));
      for (let q = 0; q < rows; q++) {
        const zz = room.z0 + .11 + depth * (q + .5) / rows;
        box(0, ceilingTop + .045, zz, w - .4, .09, .08, 0x493624);
        if (ridgeBottom > supportTop) {
          box(0, (supportTop + ridgeBottom) / 2, zz,
            .06, ridgeBottom - supportTop, .06, 0x493624);
        }
        if (hangerBottom > supportTop) for (const side of [-1, 1]) {
          box(side * hangerX, (supportTop + hangerBottom) / 2, zz,
            .06, hangerBottom - supportTop, .06, 0x493624);
        }
      }
    }
    // 葺き重ね・垂木・桁・棟木は共通部品だけで描き、同じ位置に屋根を重ねない。
    rt.scene.add(timberRoof(x, roofY, z, w, d, rot, { eave, pitch, color: b.roof }));
  }
  // 在所の軒先の雨除けと荷。配置は復元。中央は開け、木のある範囲だけ実物の寸法で止める。
  // 柱と荷箱は上の部材と同じ箱・材質・描画の束へ入れる。
  const store = (x, y, z, w, h, d, color, blocking = false) => {
    at.position.set(x, y, z); at.rotation.set(0, 0, 0); at.scale.set(w, h, d); at.updateMatrix();
    if (!bundles.has(geo)) bundles.set(geo, new Map());
    const colors = bundles.get(geo);
    if (!colors.has(color)) colors.set(color, []);
    colors.get(color).push(at.matrix.clone());
    if (blocking) {
      // 設営時だけ登録する。描く箱と同じ範囲にし、地面の高低でも壁の下を抜けさせない。
      const wall = solidRect(x, z, w, d, 0, y + h / 2);
      wall.yBot = y - h / 2;
      wall.bodyOverlap = true;
    }
  };
  // 荷置き小屋も柱脚を礎石で受ける。中心の地面だけで石底を決めると、
  // 傾いた土の低い側に隙間が残る。石の範囲を測り、底を六センチ根入れする。
  // 差し掛けにも同じ納まりを使い、木口を雨中の土へ直接埋めない。
  const storeFoot = (x, z, top) => {
    const width = .32, steps = Math.ceil(width / .15);
    let bottom = top - .08;
    for (let ix = 0; ix <= steps; ix++) for (let iz = 0; iz <= steps; iz++) {
      bottom = Math.min(bottom, drawGroundAt(W,
        x - width / 2 + width * ix / steps,
        z - width / 2 + width * iz / steps) - .06);
    }
    store(x, (bottom + top) / 2, z, width, top - bottom, width, 0x827b6d);
  };
  for (const [x, z] of [[-29, 42], [56, 24]]) {
    let y = drawGroundAt(W, x, z);
    for (const dx of [-2.2, 2.2]) for (const dz of [-1.4, 1.4])
      y = Math.max(y, drawGroundAt(W, x + dx, z + dz));
    y = Math.max(y, drawGroundAt(W, x, z - 1.4));
    W.addGroundShade(x, z, 6.2, 4.5, 0, .35);
    for (const dx of [-2.2, 2.2]) for (const dz of [-1.4, 1.4]) {
      const gy = drawGroundAt(W, x + dx, z + dz);
      // 柱脚は礎石で受け、左右の軒桁まで通す。雨の泥へ木口を埋めない。
      const bottom = gy + .08, top = y + 2.25;
      storeFoot(x + dx, z + dz, bottom);
      store(x + dx, (bottom + top) / 2, z + dz, .14, top - bottom, .14, 0x493624, true);
    }
    // 柱頭を前後の桁と左右の梁でつなぐ。中央の横木だけで屋根を浮かせない。
    // 頭上の横木にも描いた高さだけ当たりを付け、跳躍中の体と突き上げた槍を受ける。
    // 桁の下から地面までを壁にせず、小屋の正面と内部の通路は空ける。
    for (const dz of [-1.4, 1.4]) store(x, y + 2.25, z + dz, 4.7, .16, .16, 0x55422f, true);
    for (const dx of [-2.2, 2.2]) store(x + dx, y + 2.15, z, .14, .16, 2.94, 0x55422f, true);
    // 棟は奥行き方向。妻の中央の束で棟木を受け、前後の梁から屋根へ荷重を通す推定復元。
    // 左右の梁の中央に短い束を立てても棟には届かないため、妻の梁上へ移す。
    // 共通屋根の垂木下面（棟高から二十六・五センチ下）へ棟木の上面をそろえる。
    // 同じ箱と木の材質へまとめ、頭上の小屋組だけを直して入口は空ける。
    const storeRoofY = y + 2.3, storeRoofRun = 4.8 / 2 + .45;
    const ridgeTop = storeRoofY + storeRoofRun * .3 - .265;
    const ridgeBottom = ridgeTop - .14, tieTop = y + 2.33;
    store(x, ridgeTop - .07, z, .14, .14, 2.94, 0x493624, true);
    for (const dz of [-1.4, 1.4]) store(x, (tieTop + ridgeBottom) / 2, z + dz,
      .12, ridgeBottom - tieTop, .12, 0x493624, true);
    // 背面の縦板は柱の内面へ割り付け、地覆と上框の間へ納める推定復元。
    // 四・五メートルの板割りでは端の板が柱へ食い込み、下端も宙に浮いていた。
    // 既存の箱・材質へまとめ、正面の出入り口と荷の配置は保つ。
    const rearSpan = 4.4 - .14, rearBay = (rearSpan - .14) / 2, rearPitch = rearBay / 6;
    // 背面の長い板壁と妻の束を中柱で受ける推定復元。
    // 礎石から桁下面まで通し、板・地覆・上框は柱の内面で止める。
    // 正面は開けたまま、形・材質と当たりは既存の束へまとめる。
    const rearPostBottom = drawGroundAt(W, x, z - 1.4) + .08;
    const rearPostTop = y + 2.17;
    storeFoot(x, z - 1.4, rearPostBottom);
    store(x, (rearPostBottom + rearPostTop) / 2, z - 1.4,
      .14, rearPostTop - rearPostBottom, .14, 0x493624, true);
    for (const side of [-1, 1]) {
      const center = x + side * (.07 + rearBay / 2);
      store(center, y + .075, z - 1.4, rearBay, .1, .14, 0x493624, true);
      store(center, y + 2.075, z - 1.4, rearBay, .1, .14, 0x493624, true);
      for (let i = 0; i < 6; i++)
        store(center - rearBay / 2 + (i + .5) * rearPitch, y + 1.075, z - 1.4,
          rearPitch - .003, 1.9, .065,
          i % 3 ? 0x79634b : 0x5b4937, true);
    }
    // 板の継ぎ目は外側の押縁で覆う推定復元。板の目地を通して
    // 雨と風が荷へ吹き込む壁にせず、内側の貫で受けた縦板を押さえる。
    // 押縁の裏を板の外面へ合わせ、形・材質は既存の箱の束で共用する。
    // 当たりも描いた木の高さだけに納め、正面の出入り口はそのまま空ける。
    for (const side of [-1, 1]) for (let i = 1; i < 6; i++)
      store(x + side * (.07 + rearBay / 2) - rearBay / 2 + i * rearPitch,
        y + 1.075, z - 1.445, .07, 1.9, .025, 0x493624, true);
    // 内側の貫は板の内面へ背を掛け、両端を隅柱の内面で止める。
    // 板壁と柱へ箱を貫通させず、見える横木の見込みだけ当たりも付ける。
    // 二棟とも既存の箱・木の材質へまとめ、正面の通路は空ける。
    const rearBoardFace = -1.4 + .065 / 2;
    for (const h of [.5, 1.65]) for (const side of [-1, 1])
      store(x + side * (.07 + rearBay / 2), y + h, z + rearBoardFace + .06,
        rearBay, .12, .12, 0x493624, true);
    // 妻側の腰板は一枚の大板にせず、柱間の地覆と笠木へ縦板を納める推定復元。
    // 板の継ぎ目は外の押縁で覆う。内側からも地覆が見え、腰板だけを宙へ浮かせない。
    // 同じ箱・材質へ束ね、正面の出入りと荷箱の間の通路は空ける。
    for (const side of [-1, 1]) {
      store(x + side * 2.2, y + .1, z, .14, .08, 2.66, 0x493624, true);
      const boardPitch = 2.66 / 8;
      for (let i = 0; i < 8; i++) {
        store(x + side * 2.2, y + .42, z - 1.33 + (i + .5) * boardPitch,
          .075, .56, boardPitch - .002, i % 3 ? 0x79634b : 0x5b4937, true);
      }
      // 笠木の木口も前後の隅柱の内面へ納め、柱の表へ同じ面を重ねない。
      // 板より張り出す笠木の木口も、見える厚みと高さで体・槍を止める。
      store(x + side * 2.2, y + .75, z, .14, .1, 2.66, 0x493624, true);
      for (let i = 1; i < 8; i++) {
        store(x + side * (2.2 + .05), y + .42, z - 1.33 + i * boardPitch,
          .025, .56, .045, 0x493624, true);
      }
    }
    // 方杖の下端を柱へ、上端を前の桁の下面へ納める。中央の出入り口は空ける。
    for (const side of [-1, 1]) {
      at.position.set(x + side * (2.2 - .325), y + 2.17 - .325, z + 1.4);
      at.rotation.set(0, 0, side * Math.PI / 4);
      at.scale.set(.12, Math.hypot(.65, .65), .12); at.updateMatrix();
      bundles.get(geo).get(0x493624).push(at.matrix.clone());
    }
    // 荷箱は奥の荷台へ三箱・二箱の二段で載せる推定復元。
    // 地面へ置くと奥の三箱が天板を貫き、手前の箱は腰掛けと重なる。
    // 蓋の帯の上端で次の箱を受け、正面中央と腰掛けの足元を空ける。
    // 箱の数・形・材質は共用し、描く高さと当たりへ同じ底の高さを渡す。
    const cargoDeckTop = y + .83, cargoStackH = .74 + .035 / 2;
    for (let i = 0; i < 5; i++) {
      const upper = i >= 3;
      const xx = x + (upper ? i - 3.5 : i - 1) * 1.2, zz = z - .55;
      const gy = cargoDeckTop + (upper ? cargoStackH : 0);
      // 小屋の柱・腰板と同じく、荷箱も見える寸法で体と槍を止める。
      // 少し張り出す蓋は箱とは別の高さに納め、上まで見えない壁を伸ばさない。
      // 正面と箱の間の通路は残し、当たりの登録は設営時だけにする。
      store(xx, gy + .34, zz, 1.05, .68, .8, i % 2 ? 0x786044 : 0x62513c, true);
      store(xx, gy + .7, zz, 1.1, .06, .85, 0x493624, true);
      // 荷箱の帯と蓋。単色の積み木へ見せず、同じ木材の描画に収める。
      for (const dx of [-.33, .33]) {
        store(xx + dx, gy + .35, zz + .41, .065, .68, .035, 0x493624);
        store(xx + dx, gy + .74, zz, .065, .035, .86, 0x493624);
      }
    }
    // 軒下の槍架と担ぎ棒。荷置き場の役割が横からも読める輪郭を、同じ木材の束で出す。
    // 柱の外側へ寄せ、入口と実兵の進路には当たりを加えない（備品の配置は復元）。
    for (const dz of [-.9, .9]) {
      store(x - 2.85, y + .6, z + dz, .11, 1.2, .11, 0x55422f);
      store(x - 2.85, y + .12, z + dz, .65, .12, .18, 0x493624);
    }
    store(x - 2.85, y + 1.1, z, .14, .13, 2.15, 0x79634b);
    for (let i = 0; i < 6; i++) {
      at.position.set(x - 2.85, y + 1.65, z - .72 + i * .29);
      at.rotation.set(0, 0, -.2); at.scale.set(.045, 3.25 + (i % 3) * .15, .045); at.updateMatrix();
      bundles.get(geo).get(0x55422f).push(at.matrix.clone());
    }
    // 小屋掛けの足元に濡れた板の敷場。長短を崩し、屋根だけが野に浮いた見え方を避ける。
    for (let i = 0; i < 7; i++) {
      const xx = x - 1.35 + i * .43, zz = z + 1.6 + (i % 3) * .09;
      store(xx, drawGroundAt(W, xx, zz) + .035, zz, .36, .07, 1.1 + (i % 2) * .3, 0x62513c);
    }
    // 荷置き場の片側に差し掛け。柱・母屋・葺き板を同じ束へ入れ、描画は増やさない。
    // 正面の通路と槍架を避け、左右同じ箱だけに見えない雨宿りの輪郭を作る。
    const leanSide = x < 0 ? -1 : 1, leanX = x + leanSide * 3.4;
    // 差し掛けの梁も葺き板と同じ勾配にする。水平な梁では軒先で板を貫き、
    // 内側では屋根から離れていた。母屋を三筋通し、中央の板も下から受ける。
    // 母屋の上面を板の下面、斜め梁の上面を母屋の下面へそろえる推定復元。
    // 既存の箱・材質へまとめ、柱の上端も実際の梁下面で止める（設営時だけ）。
    const leanAngle = .22, leanCos = Math.cos(leanAngle), leanSlope = Math.tan(leanAngle);
    const leanUnder = (px) => y + 2.02 - leanSide * (px - leanX) * leanSlope - .075 / (2 * leanCos);
    const leanBeamY = leanUnder(leanX) - (.1 + .14 / 2) / leanCos;
    for (const dz of [-1.35, 1.35]) {
      const px = x + leanSide * 4.45, pz = z + dz, gy = drawGroundAt(W, px, pz);
      const bottom = gy + .08, top = leanUnder(px) - (.1 + .14) / leanCos;
      storeFoot(px, pz, bottom);
      if (top > bottom) store(px, (bottom + top) / 2, pz, .13, top - bottom, .13, 0x493624, true);
      at.position.set(leanX, leanBeamY, pz);
      at.rotation.set(0, 0, -leanSide * leanAngle); at.scale.set(2.5, .14, .14); at.updateMatrix();
      bundles.get(geo).get(0x55422f).push(at.matrix.clone());
    }
    for (const reach of [2.28, 3.4, 4.45]) {
      const px = x + leanSide * reach;
      at.position.set(px, leanUnder(px) - .05 / leanCos, z - .02);
      at.rotation.set(0, 0, -leanSide * leanAngle); at.scale.set(.1, .1, 3.3); at.updateMatrix();
      bundles.get(geo).get(0x493624).push(at.matrix.clone());
    }
    for (let i = 0; i < 9; i++) {
      at.position.set(leanX, y + 2.02, z - 1.5 + i * .37);
      at.rotation.set(0, 0, -leanSide * leanAngle); at.scale.set(2.65, .075, .4); at.updateMatrix();
      bundles.get(geo).get(i % 3 ? 0x62513c : 0x55422f).push(at.matrix.clone());
    }
    for (let i = 0; i < 3; i++) {
      const px = leanX + leanSide * .35, pz = z - .95 + i * .9, gy = drawGroundAt(W, px, pz);
      store(px, gy + .22, pz, .75, .44, .65, 0x79634b, true);
      for (const dx of [-.24, .24]) store(px + dx, gy + .46, pz, .055, .055, .7, 0x493624);
    }
    // 荷置きの後ろを低い柴垣で囲う。既存の木材の束へまとめ、兵の通り道に当たりを足さない。
    for (let i = 0; i < 19; i++) {
      const px = x - 3.6 + i * .4, pz = z - 2.5, gy = drawGroundAt(W, px, pz);
      store(px, gy + .62, pz, .065, 1.15 + Math.sin(i * 2.4) * .13, .075, 0x79634b);
    }
    for (const h of [.32, .88]) store(x, y + h, z - 2.5, 7.6, .075, .09, 0x55422f);
    // 雨除けの妻に槍組の印。低い屋根と幟を重ね、野の中でも荷置きの所在を読めるようにする。
    rt.scene.add(nobori(W, x + leanSide * 4.8, z - 1.9, x < 0 ? 'oda' : 'saito', 5.5));
    // 屋根下の腰掛けと長い荷台。柱と同じ描画の束で、人が使う高さの横線を残す。
    // 調度も描いた部材の範囲だけで体と槍を止める。天板まで一枚の壁にはせず、
    // 足元と天板の間は空け、正面中央から小屋へ入る通路を残す。
    for (const dx of [-1.5, 1.5]) {
      store(x + dx, y + .32, z + .6, .16, .64, .9, 0x493624, true);
      store(x + dx, y + .68, z + .6, .8, .12, 1.15, 0x79634b, true);
    }
    store(x, cargoDeckTop - .07, z - .55, 3.6, .14, .75, 0x79634b, true);
    for (const dx of [-1.4, 1.4]) store(x + dx, y + .35, z - .55, .14, .7, .65, 0x493624, true);
    rt.scene.add(timberRoof(x, storeRoofY, z, 4.8, 3.1, 0, { eave: .45, pitch: .3, color: 0x62513c }));
  }
  // 写真の井楼の貫・筋交いを、小規模な野戦の物見足場へ置き換える（所在・形は復元）。
  // 西の在所の奥に寄せ、田・街道・槍組・控えの進路へ張り出させない。
  // 部材は既存の箱の束へ収める。昼の雨なので火や乾いた土埃は足さない。
  const lookoutX = -106, lookoutZ = -114;
  let lookoutY = drawGroundAt(W, lookoutX, lookoutZ);
  for (const dx of [-1.35, 1.35]) for (const dz of [-1.35, 1.35])
    lookoutY = Math.max(lookoutY, drawGroundAt(W, lookoutX + dx, lookoutZ + dz));
  const beam = (ax, ay, az, bx, by, bz, width, depth, color) => {
    at.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    at.quaternion.setFromUnitVectors(beamUp, beamDir.set(bx - ax, by - ay, bz - az).normalize());
    at.scale.set(width, Math.hypot(bx - ax, by - ay, bz - az), depth); at.updateMatrix();
    if (!bundles.get(geo).has(color)) bundles.get(geo).set(color, []);
    bundles.get(geo).get(color).push(at.matrix.clone());
  };
  const beamUp = new THREE.Vector3(0, 1, 0), beamDir = new THREE.Vector3();
  for (const dx of [-1.35, 1.35]) for (const dz of [-1.35, 1.35]) {
    const px = lookoutX + dx, pz = lookoutZ + dz, gy = drawGroundAt(W, px, pz);
    store(px, (gy + lookoutY + 5.2) / 2, pz, .23, lookoutY + 5.2 - gy, .25, 0x55422f);
  }
  for (const side of [-1, 1]) for (const h of [.65, 2.05, 3.5]) {
    store(lookoutX, lookoutY + h, lookoutZ + side * 1.35, 3.15, .14, .16, 0x79634b);
    store(lookoutX + side * 1.35, lookoutY + h, lookoutZ, .16, .14, 3.15, 0x79634b);
  }
  for (const side of [-1, 1]) {
    beam(lookoutX - 1.25, lookoutY + .7, lookoutZ + side * 1.35,
      lookoutX + 1.25, lookoutY + 3.45, lookoutZ + side * 1.35, .12, .14, 0x62513c);
    // 足場の腰板は低く。上を開け、城の高い櫓の輪郭にはしない。
    for (let i = 0; i < 7; i++)
      store(lookoutX - 1.2 + i * .4, lookoutY + 4.15, lookoutZ + side * 1.42,
        .37, 1.1, .065, i % 2 ? 0x79634b : 0x62513c);
    store(lookoutX, lookoutY + 4.75, lookoutZ + side * 1.42, 3.1, .12, .14, 0x55422f);
  }
  for (let i = 0; i < 9; i++)
    store(lookoutX - 1.4 + i * .35, lookoutY + 3.58, lookoutZ, .32, .13, 3.05, 0x62513c);
  // 背面の梯子。横木と二本の親木を同じ束へ入れる。
  for (const dx of [-.42, .42])
    beam(lookoutX + dx, lookoutY, lookoutZ - 3, lookoutX + dx, lookoutY + 3.85, lookoutZ - 1.5,
      .09, .1, 0x55422f);
  for (let i = 1; i <= 10; i++)
    store(lookoutX, lookoutY + i * .34, lookoutZ - 3 + i * .34 * 1.5 / 3.85, .96, .065, .1, 0x79634b);

  // 写真の木楯は陣小屋の脇で待機中の備品にする。五枚の板・裏の貫・控え脚を見せる。
  // 自立楯の配置は復元。遮蔽や兵の当たりを増やさず、正面の入口を空ける。
  for (const [x, z] of [[-34.5, 40], [61.5, 22]]) for (const shift of [0, 1.5]) {
    const px = x + shift, y = drawGroundAt(W, px, z);
    for (let i = 0; i < 5; i++)
      beam(px - .5 + i * .25, y + .05, z + .18, px - .5 + i * .25, y + 1.7, z - .1,
        .23, .065, i % 2 ? 0x79634b : 0x62513c);
    for (const h of [.4, 1.25]) store(px, y + h, z + .19 - h * .17, 1.32, .1, .1, 0x55422f);
    beam(px, y + 1.1, z + .12, px, y + .04, z + .95, .09, .1, 0x55422f);
  }
  // 竹束は六角の竹と二本の縄帯。近い陣小屋の裏だけに六束置き、全て一枚の描画で扱う。
  const bambooGeo = new THREE.CylinderGeometry(1, 1, 1, 6), bambooParts = [];
  const bambooPart = (x, y, z, sx, sy, sz, color) => {
    at.position.set(x, y, z); at.rotation.set(0, 0, 0); at.scale.set(sx, sy, sz); at.updateMatrix();
    bambooParts.push({ matrix: at.matrix.clone(), color });
  };
  for (const [x, z] of [[-32, 38.5], [59, 20.5]]) for (let b = 0; b < 3; b++) {
    const px = x + b * .85, y = drawGroundAt(W, px, z);
    for (let i = 0; i < 7; i++) {
      const angle = (i - 1) * Math.PI / 3, radius = i ? .22 : 0;
      const height = 1.65 + Math.sin(i * 2.1 + b) * .12;
      bambooPart(px + Math.cos(angle) * radius, y + height / 2, z + Math.sin(angle) * radius,
        .105, height, .105, i % 2 ? 0x6b7043 : 0x85805a);
    }
    for (const h of [.38, 1.2]) bambooPart(px, y + h, z, .335, .045, .335, 0x493e30);
  }
  // 木と土・石の二材質へまとめる。色は部材に持たせ、三棟で形と材質を使い回す。
  // 土壁と礎石へ木目を貼らず、木肌の明るさを保つ既存の補正も残す。
  const wood = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true,
    map: woodTex(), bumpMap: woodTex(), bumpScale: .035, roughness: .88 });
  wood.onBeforeCompile = sh => {
    // 共用の箱の絵をそのまま伸ばすと、横木にも縦目が立ち、長い柱では節まで伸びる。
    // 部材の回転前の実寸から長手を選び、柱・長押・梁の側面と木口を描き分ける。
    // 形・絵・材質と描画の束は共用したまま。頂点側だけで求め、毎コマの配列は作らない。
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `
      #include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 timberSize = vec3(length(instanceMatrix[0].xyz),
          length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec3 timberPoint = position * timberSize;
        vec2 timberUV;
        if (timberSize.y >= timberSize.x && timberSize.y >= timberSize.z) {
          timberUV = abs(normal.y) > 0.5 ? timberPoint.xz / 0.3
            : vec2((abs(normal.x) > 0.5 ? timberPoint.z : timberPoint.x) / 0.3, timberPoint.y / 1.2);
        } else if (timberSize.x >= timberSize.z) {
          timberUV = abs(normal.x) > 0.5 ? timberPoint.yz / 0.3
            : vec2((abs(normal.y) > 0.5 ? timberPoint.z : timberPoint.y) / 0.3, timberPoint.x / 1.2);
        } else {
          timberUV = abs(normal.z) > 0.5 ? timberPoint.xy / 0.3
            : vec2((abs(normal.x) > 0.5 ? timberPoint.y : timberPoint.x) / 0.3, timberPoint.z / 1.2);
        }
        #ifdef USE_MAP
          vMapUv = (mapTransform * vec3(timberUV, 1.0)).xy;
        #endif
        #ifdef USE_BUMPMAP
          vBumpMapUv = (bumpMapTransform * vec3(timberUV, 1.0)).xy;
        #endif
      #endif
    `);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
      THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;',
        'sampledDiffuseColor.rgb = mix(vec3(0.42), vec3(1.0), sampledDiffuseColor.rgb);\n diffuseColor *= sampledDiffuseColor;'));
  };
  wood.customProgramCacheKey = () => '森部の雨の木肌・長手と木口';
  const plain = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1 });
  // 荷置き小屋の板壁・腰板・荷台・腰掛けも木肌へまとめる。
  // 柱と梁の二色だけでは板材が無地になり、木目の向きも失われていた。
  // 既存の木の束と実寸の長手判定を共用し、土壁・礎石・鉄は無地の束へ残す。
  const timberColors = new Set([0x493624, 0x55422f, 0x79634b, 0x5b4937, 0x62513c]);
  const materials = [wood, plain], tint = new THREE.Color();
  for (const [shape, colors] of bundles) for (const material of materials) {
    const entries = [...colors].filter(([color]) =>
      timberColors.has(color) === (material === wood));
    const count = entries.reduce((sum, [, matrices]) => sum + matrices.length, 0);
    if (!count) continue;
    const mesh = new THREE.InstancedMesh(shape, material, count);
    let index = 0;
    for (const [color, matrices] of entries) {
      tint.setHex(color);
      for (const matrix of matrices) {
        mesh.setMatrixAt(index, matrix); mesh.setColorAt(index++, tint);
      }
    }
    mesh.castShadow = mesh.receiveShadow = true; mesh.userData.noMerge = true;
    mesh.computeBoundingSphere(); rt.scene.add(mesh);
  }
  const bamboo = new THREE.InstancedMesh(bambooGeo, wood, bambooParts.length);
  for (let i = 0; i < bambooParts.length; i++) {
    bamboo.setMatrixAt(i, bambooParts[i].matrix);
    bamboo.setColorAt(i, tint.setHex(bambooParts[i].color));
  }
  bamboo.receiveShadow = true; bamboo.userData.noMerge = true;
  bamboo.computeBoundingSphere(); rt.scene.add(bamboo);
  const dispose = rt.dispose;
  rt.dispose = function () { geo.dispose(); bambooGeo.dispose(); gable.dispose(); for (const cap of postCaps) cap.dispose(); for (const material of materials.values()) material.dispose(); return dispose.call(this); };
}

// 足元の低い泥塊。広大な野へ均等に薄めず、渡河後の会戦帯にだけ置く（配置は復元）。
// 当たり・地形の高さを変えず、一つの形・材質・描画で崩れた土の輪郭を出す。
function moribeSoil(rt) {
  const W = rt.world, geo = new THREE.SphereGeometry(1, 7, 4);
  // 土の肩に平たい切断面を作らず、根で崩れた不揃いな丸みを残す。形は全て共用。
  const sp = geo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
    const k = 1 + .12 * Math.sin(x * 7 + z * 4) * Math.cos(y * 5);
    sp.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: mudTex(true), bumpMap: mudTex(true), bumpScale: .018, roughness: .94, envMapIntensity: .2 });
  // 泥の絵に茶と個体色を重ねると黒い破片になる。絵の濃淡を地表と同じ湿土へ戻す。
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
      THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;', `
        float soilGrain = clamp(dot(sampledDiffuseColor.rgb, vec3(0.333)) / 0.055, 0.75, 1.2);
        sampledDiffuseColor.rgb = vec3(0.115, 0.085, 0.052) * soilGrain;
        diffuseColor *= sampledDiffuseColor;`));
  };
  mat.customProgramCacheKey = () => '森部の湿った土塊';
  const soil = new THREE.InstancedMesh(geo, mat, 760), at = new THREE.Object3D(), color = new THREE.Color();
  let seed = 254, count = 0;
  const R = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2600 && count < 760; i++) {
    const x = -66 + R() * 140, z = -84 + R() * 160;
    if (peoplePathDistance(x, z) < 2 || W.def.paddy(x, z) > .2
      || W.def.streams.some(st => distToPolyline(x, z, st.pts) < st.w + 1)) continue;
    // 草の株と同じ群落の縁へ芝土を残し、泥の真ん中に石粒のように散らさない。
    const patch = tuftClumpAt(x, z), road = distToPolyline(x, z, ROAD2);
    if (patch < .28 || patch > .72 || road < 2) continue;
    // 小粒だけでは横から輪郭が消える。大小を混ぜ、崩れた芝土の低い肩を残す。
    // 一部は踏み場の縁に寄った低い土の肩。小さな同形の粒だけで野を覆わない。
    const shoulder = count % 3 === 0;
    const length = shoulder ? .28 + R() * .42 : .12 + R() * R() * .32;
    // 歩行用の補間と描く三角形には差がある。土塊の腹を描く地面へ埋める。
    const ground = drawGroundAt(W, x, z);
    const rim = Math.min(ground, drawGroundAt(W, x - length, z), drawGroundAt(W, x + length, z),
      drawGroundAt(W, x, z - length * .4), drawGroundAt(W, x, z + length * .4));
    at.position.set(x, rim - .035, z);
    at.rotation.set((drawGroundAt(W, x, z + .3) - drawGroundAt(W, x, z - .3)) / .6,
      shoulder ? Math.atan2(1, .18 + Math.cos(z * .06) * .2) : R() * Math.PI * 2,
      -(drawGroundAt(W, x + .3, z) - drawGroundAt(W, x - .3, z)) / .6);
    at.scale.set(length, shoulder ? .09 + R() * .04 : .055 + length * .12,
      length * (shoulder ? .18 + R() * .2 : .35 + R() * .6)); at.updateMatrix();
    soil.setMatrixAt(count, at.matrix);
    const tone = .88 + R() * .22;
    color.setRGB(tone, tone, tone); soil.setColorAt(count++, color);
  }
  soil.count = count; soil.receiveShadow = true; soil.computeBoundingSphere(); W.scene.add(soil);
  const dispose = rt.dispose;
  rt.dispose = function () { geo.dispose(); mat.dispose(); return dispose.call(this); };
}

// 深手で戦列を離れた兵だけの備えは、討ち残しや帰着待ちに数えない。
const gone = (g) => groupGone(g) || !g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget);
// 前の段の声は記録に残し、今の下知を待たせない。
function clearOldSpeech(rt) {
  const hud = rt.hud, F = rt.flags, stage = F.stage || 'brief';
  for (let i = hud.subQ.length - 1; i >= 0; i--) {
    const line = hud.subQ[i];
    if (line.moribeStage !== undefined && (line.moribeStage !== stage || line.moribeEnding !== !!F.ending)) hud.subQ.splice(i, 1);
  }
  const line = hud.shownLine;
  if (line?.moribeStage !== undefined && (line.moribeStage !== stage || line.moribeEnding !== !!F.ending)) hud.nextSub();
}
// 手当て中の兵に引かれず、今戦える兵の位置へ寄せる。入れ物は隊ごとに使い回す。
// 隊の旗持ち（黄旗）の足元。旗持ちが倒れたら隊の真ん中。
function flagPos(g) {
  const u = g.stds?.[0]?.userData.carrier;
  return u && u.alive && !u.gone && !u.fleeing && !u.woundOut ? u.pos : fightingCenter(g);
}
function fightingCenter(g) {
  const c = g._moribeCenter || (g._moribeCenter = { x: 0, z: 0 });
  let x = 0, z = 0, n = 0;
  for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget) {
    x += u.pos.x; z += u.pos.z; n++;
  }
  c.x = n ? x / n : g.anchor.x; c.z = n ? z / n : g.anchor.z;
  return c;
}
// 段が変わる下知だけ、前備の位置から既存の合成音を鳴らす。隊の細かな合図は重ねない。
function moribeSignal(rt, kind) {
  rt.flags.signalSoundAt = rt.t;
  const g = !gone(rt.flags.A) ? rt.flags.A : !gone(rt.flags.B) ? rt.flags.B : null;
  rt.army.playFar(`sig_${kind}`, g ? fightingCenter(g) : rt.player.u.pos, 1);
}
// 上役は組頭の源八（柴田の前備）。雨の中でも三十歩ほどは怒鳴り声が届く。その外へは共通の本物の使番で運ぶ。
function orderSpeech(rt, text, dur = 4) {
  const from = rt.flags.moribeOfficer;
  if (rt.over || !from?.alive || from.gone || from.fleeing || from.woundOut || from.noTarget || from.group?.routed) return;
  const stage = rt.flags.stage, ending = rt.flags.ending;
  if (Math.hypot(from.pos.x - rt.player.u.pos.x, from.pos.z - rt.player.u.pos.z) <= 30 && sightPoint(rt, from.pos)) {
    rt.say('隊長 源八（げんぱち）', text, dur);   // 声の届く所で怒鳴る。名札は城下と同じ「隊長 源八（げんぱち）」
    return;
  }
  sendOrder(rt, from, rt.player.u, { id: 'word', apply: () => {
    // 遅れて届いた前の段の下知で、今の任務を覆さない。
    if (!rt.over && rt.flags.stage === stage && rt.flags.ending === ending)
      rt.say('使番', `源八殿より。「${text}」`, dur);
  } }, { team: 0, faction: 'oda', name: '自分の槍組' });
}

// 復元した呼び声。姿と声が結びつく近さで一度だけ。下知の読み上げ中には重ねない。
function nearbyVoice(rt, group, name, key, text) {
  const F = rt.flags;
  if (F[key] || rt.hud.subT > 0 || rt.hud.subQ.length || rt.t < (F.namedVoiceAt || 0)) return;
  for (const u of group.units) {
    if (u.name !== name || !u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget) continue;
    if (Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) > 26 || !sightPoint(rt, u.pos)) return;
    F[key] = true; F.namedVoiceAt = rt.t + 12;
    rt.say(name, text, 3.5);
    return;
  }
}

// 国土地理院の標高（森部古戦場。束0 の asset_dem_moribe.js）を手書きの base（低い湿地）に混ぜる
let moribeDem = null;
let moribeDatum = 0;
useTerrain('dem_moribe', (data) => {
  moribeDatum = data ? demSample(data, START2.x, NIREMATA2) : 0;
  moribeDem = data;
});
const MORIBE_DEM_OPTIONS = { scale: 1, xyScale: 1 };
// 実測の最も低い所でなく浅瀬を高さの基準にする。川面だけを下げて岸を急坂にしない。
// 範囲の縁でも基準の差を滑らかに戻し、実測の起伏と外側の地形を保つ。
const moribeHeight = (x, z, b) => (moribeDem ? demBlend(moribeDem, x, z, b + moribeDatum, MORIBE_DEM_OPTIONS, b + moribeDatum - 3) - moribeDatum : b);

// 森部だけの浅瀬。粗い地形の岸に引かれて埋もれた川面を、渡る帯でそろえる。
// 五月の美濃の田の畦（あぜ）。田の区画（paddy の 22×18 の格子）の境へ低い土の畝を通す（茶色の平らな野に見えていた。10/28）。
// 高さ三十センチほどで当たりは持たない。道・薬師堂・人の通り道・川べりは空ける。形は一つを使い回して一度に描く。
const AZE_GRASS = new THREE.Color(0x5f6e3e);
function moribeAze(rt) {
  const W = rt.world, segs = [];
  const skip = (x, z) => distToPolyline(x, z, ROAD2) < 4 || Math.hypot(x - YAKUSHI2.x, z - YAKUSHI2.z) < 14 ||
    peoplePathDistance(x, z) < 2.5 || z > nireZ(x) - 20 || Math.abs(x - 50) < 18 ||
    (x > OVF_X0 - 2 && x < OVF_X1 + 2 && Math.abs(z - ovfZ(x)) < ovfHW(x) + 2);
  for (let x = -110; x <= 110; x += 22) for (let z = -150; z <= 66; z += 4) if (!skip(x, z + 2)) segs.push([x, z + 2, 0]);
  for (let z = -144; z <= 66; z += 18) for (let x = -110; x <= 110; x += 4) if (!skip(x + 2, z)) segs.push([x + 2, z, 1]);
  // 丸い土の畝（横から見て蒲鉾形）。半分を土に埋め、黒い板の帯に見せない。
  const geo = new THREE.CylinderGeometry(.62, .62, 4.4, 9, 1).rotateX(Math.PI / 2).scale(1, .32, 1);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), segs.length);
  const m = new THREE.Object3D(), col = new THREE.Color();
  segs.forEach(([x, z, along], i) => {
    m.position.set(x, W.heightAt(x, z) - .02, z); m.rotation.set(Math.sin(x * 2.1 + z) * .03, (along ? Math.PI / 2 : 0) + Math.sin(x + z * 1.7) * .025, 0);
    m.scale.set(1 + Math.sin(x * 1.3 + z) * .15, .8 + Math.sin(x * .9 - z * 1.1) * .2, 1); m.updateMatrix(); mesh.setMatrixAt(i, m.matrix);
    mesh.setColorAt(i, col.setHex(0x4e4232).lerp(AZE_GRASS, .1 + (Math.sin(x * .7 + z * .9) + 1) * .12));
  });
  mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  rt.scene.add(mesh);
  const dispose = rt.dispose;
  rt.dispose = function () { mesh.geometry.dispose(); mesh.material.dispose(); return dispose.call(this); };
}

// 植えて間もない早苗の列（五月十四日・田植えの後）。25秒の持ち場（20,50 あたり）から見える田だけに。
// 灰の泥の野でなく、水を張った田に苗の筋が並ぶ野に見せる。一株は細い葉三枚、八株を一列に合わせた形を使い回す。
// 当たりは持たない。道・薬師堂・人の通り道・川べり・あふれた濁流の帯は空ける。開戦時に並べるだけ。
function moribeNae(rt) {
  const W = rt.world;
  // 一枚の平らな板の葉・鮮やかな緑の筋は絵に見えた（10/29）。一株は細い葉三〜五枚の束：中筋で折れた V の断面で、
  // 根の位置を少し散らし、外へ弓なりに垂れ、ねじれる。色は株ごと・葉ごとに彩度を落とした若緑〜黄緑で揺らぎ、根元は濡れて暗い。
  // 根元には水に映る暗い影（水面の写り）を敷く。株の間と株の大きさに揺らぎ（手植えの列）。八株を一つの形に合わせて使い回す。
  const parts = [], hsh = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const tones = [[0.35, 0.42, 0.2], [0.29, 0.38, 0.18], [0.39, 0.44, 0.21], [0.42, 0.43, 0.22], [0.32, 0.4, 0.21]];
  let px = 0;
  for (let s = 0; s < 8; s++) {
    px += s ? 0.5 + hsh(s * 3.3) * 0.26 : 0;
    const cx = px, cz = (hsh(s * 5.7) - 0.5) * 0.14, sz = 0.72 + hsh(s * 9.1) * 0.55, NL = 3 + Math.floor(hsh(s * 2.9) * 3);
    const base = tones[Math.floor(hsh(s * 4.4) * 5)];
    for (let j = 0; j < NL; j++) {
      const pos = [], colr = [], idx = [], az = j * (6.283 / NL) + s * 1.3 + (hsh(s * 11 + j) - 0.5) * 0.9;
      const h = (0.28 + hsh(s * 7 + j * 3) * 0.16) * sz, lean = (0.08 + hsh(s + j * 13) * 0.16) * sz, wd = (0.011 + hsh(s * 17 + j) * 0.006) * Math.sqrt(sz);
      const ca = Math.cos(az), sa = Math.sin(az), R = 3, tw = (hsh(s * 19 + j) - 0.5) * 1.2;
      const rx = cx + Math.cos(az) * 0.012, rz = cz + Math.sin(az) * 0.012;
      const lc = base.map((v, q) => v * (0.85 + hsh(s * 23 + j * 5 + q) * 0.3));
      for (let r = 0; r <= R; r++) {
        const t = r / R, w = wd * (1 - t * 0.8), out = lean * t * t, y = h * t - lean * 0.6 * t * t * t;
        const fold = w * 0.55, tws = tw * t, ct = Math.cos(tws), st = Math.sin(tws);
        for (let c = -1; c <= 1; c++) {
          const lz0 = c * w, ly0 = c === 0 ? fold * 0.4 : 0, lx = out + (c === 0 ? -fold * 0.3 : fold * 0.2);
          const lz = lz0 * ct, ly = y + ly0 + lz0 * st * 0.4;
          pos.push(rx + lx * ca - lz * sa, ly, rz + lx * sa + lz * ca);
          const k = 0.32 + 0.68 * Math.pow(t, 0.7), dry = Math.max(0, t - 0.8) * 1.5;
          colr.push(lc[0] * k * (1 + dry * 0.4), lc[1] * k * (1 + dry * 0.1), lc[2] * k * (1 - dry * 0.15));
        }
        if (r < R) for (let c = 0; c < 2; c++) { const a0 = r * 3 + c; idx.push(a0, a0 + 1, a0 + 3, a0 + 1, a0 + 4, a0 + 3); }
      }
      const leaf = new THREE.BufferGeometry();
      leaf.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      leaf.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
      leaf.setIndex(idx);
      parts.push(leaf);
    }
    // 根元の水の写り：株の下に、暗い若緑の楕円（中ほど濃く外へ泥水の色に溶ける）。泥の面より一センチ上（株は三センチ沈めて置く）。
    { const pos = [cx, 0.042, cz], colr = [0.07, 0.078, 0.05], idx = [], N = 7, rr = 0.05 * sz;
      for (let q = 0; q < N; q++) { const a = q / N * 6.283; pos.push(cx + Math.cos(a) * rr * 1.3, 0.042, cz + Math.sin(a) * rr); colr.push(0.1, 0.098, 0.075); idx.push(0, 1 + q, 1 + (q + 1) % N); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
      g.setIndex(idx); parts.push(g); }
  }
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  geo.computeVertexNormals();
  { const n = geo.attributes.normal, p = geo.attributes.position;   // 細い葉は上からの光を受ける（裏表で明るさが跳ねて筋が光らない）
    for (let i = 0; i < n.count; i++) { const up = 0.5 + Math.min(1, p.getY(i) / 0.3) * 0.4; n.setXYZ(i, n.getX(i) * (1 - up), up, n.getZ(i) * (1 - up)); }
    geo.normalizeNormals(); }
  const ovf = (x, z) => x > OVF_X0 - 2 && x < OVF_X1 + 2 && Math.abs(z - ovfZ(x)) < ovfHW(x) + 2;
  // 大雨の前に植えた田は、水の張った升だけでなく野の田の全部（畦の内）。道・薬師堂・人の通り道・川べりは空ける。
  const inCell = (x, z) => { const ex = Math.min(((x % 22) + 22) % 22, 22 - ((x % 22) + 22) % 22), ez = Math.min(((z % 18) + 18) % 18, 18 - ((z % 18) + 18) % 18); return Math.min(ex, ez) > 1.2; };
  const ok = (x, z) => inCell(x, z) && !ovf(x, z) && !W.inWaterAt?.(x, z) && distToPolyline(x, z, ROAD2) > 4 && Math.hypot(x - YAKUSHI2.x, z - YAKUSHI2.z) > 14 &&
    peoplePathDistance(x, z) > 2.5 && z < nireZ(x) - 20 && Math.abs(x - 50) > 18;
  const spots = [];
  for (let z = 10.35; z < 100; z += 0.9) for (let x = -20.3; x < 70; x += 5.2) {
    if (Math.hypot(x + 2.2 - 25, z - 55) > 40) continue;
    if (ok(x, z) && ok(x + 4.4, z)) spots.push([x, z]);
  }
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .6, envMapIntensity: .3, side: THREE.DoubleSide }), spots.length);   // 雨に濡れた葉の照り
  const m = new THREE.Object3D(), col = new THREE.Color();
  spots.forEach(([x, z], i) => {
    // 列の間と株の向きに揺らぎ（手で植えた列。半分は逆向きに置いて、八株の並びの繰り返しを見せない）
    const jx = Math.sin(i * 2.71 + z) * 0.22, jz = Math.sin(i * 1.93 + x * 0.7) * 0.11, flip = Math.sin(i * 3.17) > 0;
    const px0 = x + jx + (flip ? 4.4 : 0);
    m.position.set(px0, W.heightAt(x + 2.2, z) - 0.03, z + jz);
    m.rotation.set(0, (flip ? Math.PI : 0) + Math.sin(i * 1.7) * 0.03, 0);
    const sc = 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(i * 0.61 + z * 0.4));
    m.scale.set(1, sc, 1);
    m.updateMatrix(); mesh.setMatrixAt(i, m.matrix);
    const tone = 0.5 + 0.5 * Math.sin(i * 0.37 + Math.floor(z / 18)), warm = 0.5 + 0.5 * Math.sin(i * 0.93 + x * 0.21);
    mesh.setColorAt(i, col.setRGB(0.46 + tone * 0.12 + warm * 0.04, 0.5 + tone * 0.12, 0.46 + tone * 0.1 - warm * 0.04));   // 雨の曇り空の下の苗。色は葉の頂点が持ち、ここは明るさと若緑〜黄緑の寄りだけ（10/29）
  });
  rt.scene.add(mesh);
  const dispose = rt.dispose;
  rt.dispose = function () { mesh.geometry.dispose(); mesh.material.dispose(); return dispose.call(this); };
}

// 持ち場の岸は濡れた暗い泥と草の株（雨空の照りで明るい灰の一枚に見えていた。10/28）。
// 共通の地面の材質へ森部だけの色を一行足す。形・描画数・歩く高さは変えない。
function moribeBankSoil(rt) {
  const mat = rt.world.terrain && rt.world.terrain.material;
  if (!mat) return;
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, renderer) => {
    compile(sh, renderer);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float mbD = abs(vWP.z - ${NIREMATA2.toFixed(1)});
      float mbK = smoothstep(8.6, 10.2, mbD) * (1.0 - smoothstep(20.0, 28.0, mbD))
        * (1.0 - smoothstep(60.0, 100.0, abs(vWP.x - ${START2.x.toFixed(1)})));
      if (mbK > 0.001) {
        float mbN = texture2D(tMacro, vWP.xz * 0.06).r, mbF = texture2D(tMacro, vWP.xz * 0.5).g;
        vec3 mbSoil = mix(vec3(0.1, 0.075, 0.047), vec3(0.17, 0.135, 0.085), mbF);
        vec3 mbGrass = mix(vec3(0.08, 0.1, 0.045), vec3(0.13, 0.15, 0.07), mbF);
        mbSoil = mix(mbSoil, mbGrass, smoothstep(0.48, 0.66, mbN) * smoothstep(11.0, 15.0, mbD));
        outgoingLight = mix(outgoingLight, mbSoil, mbK * 0.85);
      }
      // あふれた分かれの流れの両岸は、濡れた黒い泥の帯（moribeOverflow の岸の線と同じ式）
      // 水の形（ovfZ・ovfHW）とずれて水の中に泥の帯が出ていた。岸の線の外へ二・五メートルの濡れた泥と、水ぎわの溜まり（10/29）。
      float moC = 47.0 + 2.0 * sin(vWP.x * 0.045 + 1.0), moH = 9.5 + 0.8 * sin(vWP.x * 0.11 + 2.0);
      float moD = abs(vWP.z - moC) - moH - 0.6 + (texture2D(tMacro, vWP.xz * 0.21).r - 0.5) * 1.6;
      float moK = (1.0 - smoothstep(3.0, 7.0, moD)) * smoothstep(-2.5, -0.5, moD) * smoothstep(-28.0, -18.0, vWP.x) * (1.0 - smoothstep(50.0, 60.0, vWP.x));
      float moS = texture2D(tMacro, vWP.xz * 0.9).g;
      vec3 moMud = mix(vec3(0.035, 0.025, 0.014), vec3(0.072, 0.05, 0.028), moS) * (0.8 + 0.4 * texture2D(tMacro, vWP.xz * 0.07).r);   // 濡れた茶の泥（黒の帯でなく、土の色が分かる明るさ。10/29）
      float moWet = (1.0 - smoothstep(-0.5, 1.6, moD)) * smoothstep(0.55, 0.7, texture2D(tMacro, vWP.xz * 0.33).r);   // 水ぎわの泥のぬめり（空の照りを鈍く返す）
      moMud = mix(moMud, vec3(0.09, 0.075, 0.055), moWet * 0.6);
      outgoingLight = mix(outgoingLight, moMud, moK * 0.92);
      // 渡った先の田の野は雨に濡れた暗い土と刈り株の緑（空の照りで明るい灰の一枚に見えていた。10/28）
      float mfK = smoothstep(-70.0, -40.0, vWP.x) * (1.0 - smoothstep(100.0, 130.0, vWP.x)) * smoothstep(-50.0, -20.0, vWP.z) * (1.0 - smoothstep(70.0, 78.0, vWP.z));
      float mfN = texture2D(tMacro, vWP.xz * 0.08).r;
      outgoingLight = mix(outgoingLight, outgoingLight * mix(vec3(0.42, 0.4, 0.33), vec3(0.4, 0.5, 0.3), smoothstep(0.42, 0.62, mfN)), mfK * 0.8);
      // 渡った先の野は大雨で田の水があふれ、濁った水たまりが続く（持ち場の正面10〜40m。描く数は増やさない。10/28）
      float mpK = (1.0 - smoothstep(30.0, 48.0, abs(vWP.x - 36.0))) * smoothstep(8.0, 20.0, vWP.z) * (1.0 - smoothstep(64.0, 72.0, vWP.z));   // 持ち場の足元の田にも斑を（広げすぎると灰の一枚になる）
      if (mpK > 0.001) {
        float mpN = texture2D(tMacro, vWP.xz * 0.045).r * 0.7 + texture2D(tMacro, vWP.xz * 0.16).r * 0.3;
        float mpW = smoothstep(0.5, 0.54, mpN) * mpK;   // 水の升は野の半分より少なく（多いと灰の一枚になる）
        float mpEdge = smoothstep(0.45, 0.5, mpN) * (1.0 - mpW) * mpK;
        outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.55, 0.5, 0.42), mpEdge * 0.8);   // 水ぎわの濡れた泥
        if (mpW > 0.001) {
          vec3 mpUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          float mpFr = pow(1.0 - clamp(dot(mpUp, normalize(vViewPosition)), 0.0, 1.0), 3.0);
          float mpRip = texture2D(tMacro, vWP.xz * 0.9).r;
          vec3 mpSky = vec3(0.065, 0.063, 0.058);
          #ifdef USE_FOG
            mpSky = fogColor * 0.2;   // 明るい灰の水たまりに見せない（暗い泥水。10/29）
          #endif
          // 田の水は濁った茶に空の鈍い照り。暗緑の野の中に、明るい升の斑として読ませる（10/29）
          vec3 mpWater = mix(vec3(0.05, 0.038, 0.023), mpSky * vec3(0.9, 0.82, 0.68), 0.1 + 0.4 * mpFr) * (0.85 + 0.3 * mpRip);
          outgoingLight = mix(outgoingLight, mpWater, mpW * 0.92);
        }
      }
      #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => key() + '|森部の岸';
  mat.needsUpdate = true;
}

// 濁った水の流れの白い筋（横に長い泡の線。一度だけ描いて使い回す）
let ovfFoamTex = null;
function ovfFoam() {
  if (ovfFoamTex) return ovfFoamTex;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 256, 128);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 150; i++) {
    const x = rnd() * 256, y = rnd() * 128, w = 16 + rnd() * 60, h = 2.5 + rnd() * 5;
    g.globalAlpha = .35 + rnd() * .65; g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(x, y, w / 2, h / 2, (rnd() - .5) * .12, 0, Math.PI * 2); g.fill();
    if (x + w / 2 > 256) { g.beginPath(); g.ellipse(x - 256, y, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill(); }
  }
  ovfFoamTex = new THREE.CanvasTexture(cv);
  ovfFoamTex.wrapS = ovfFoamTex.wrapT = THREE.RepeatWrapping;
  return ovfFoamTex;
}

// 水面の波と濁りの濃淡に使う繰り返しの乱数（64×64・滑らかな補間の三つの大きさを重ねる。一度だけ作る）
// 16×16 を線形で伸ばすと、升の継ぎ目で水面の向きが折れて、流れに沿う縞の板に見えた（10/29）。
let ovfNoiseTex = null;
function ovfNoise() {
  if (ovfNoiseTex) return ovfNoiseTex;
  const n = 64, cv = document.createElement('canvas'); cv.width = cv.height = n;
  const g = cv.getContext('2d'), img = g.createImageData(n, n);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lat = [4, 8, 16].map((m) => [0, 1, 2].map(() => Array.from({ length: m * m }, rnd)));
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let c = 0; c < 3; c++) {
    let v = 0, wsum = 0;
    lat.forEach((L, o) => {
      const m = [4, 8, 16][o], fx = x / n * m, fy = y / n * m, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
      const at = (i, j) => L[c][((j % m) * m) + (i % m)];
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx, b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
      const w = [0.5, 0.3, 0.2][o]; v += (a + (b - a) * ty) * w; wsum += w;
    });
    img.data[(y * n + x) * 4 + c] = Math.max(0, Math.min(255, ((v / wsum - 0.5) * 1.8 + 0.5) * 255));
  }
  for (let i = 0; i < n * n; i++) img.data[i * 4 + 3] = 255;
  g.putImageData(img, 0, 0);
  ovfNoiseTex = new THREE.CanvasTexture(cv);
  ovfNoiseTex.wrapS = ovfNoiseTex.wrapT = THREE.RepeatWrapping;
  return ovfNoiseTex;
}

// 渡った先の野を横切る、楡俣川からあふれた濁流（幅11〜13m・浅瀬の白い波）。
// 持ち場から正面に見える川。形は一枚・描く数は一つ増えるだけ。兵の歩く高さ・道は変えない。
function moribeOverflow(rt) {
  const W = rt.world, NX = 120, NZ = 8, pos = [], uv = [], col = [], idx = [];
  const legs = Array.from({ length: 12 }, () => new THREE.Vector4());
  for (let i = 0; i <= NX; i++) {
    const x = OVF_X0 + (OVF_X1 - OVF_X0) * i / NX, c = ovfZ(x), h = ovfHW(x);
    const end = Math.min(1, (x - OVF_X0) / 10, (OVF_X1 - x) / 10);
    let mean = 0;
    for (let j = 0; j <= NZ; j++) mean += drawGroundAt(W, x, c + (-1 + 2 * j / NZ) * h * .7);
    mean /= NZ + 1;
    for (let j = 0; j <= NZ; j++) {
      const s = -1 + 2 * j / NZ, z = c + s * h + Math.sin(x * .7 + s * 3) * .35 * Math.abs(s);
      const g = drawGroundAt(W, x, z);
      pos.push(x, Math.max(g + .05, mean + .24 - .16 * Math.abs(s) ** 4), z);   // 足首から脛まで水に沈め、野の土の上を歩く平らな板に見せない（10/29）
      uv.push(x - OVF_X0, s);
      col.push(1, 1, 1, Math.max(0, end));   // 岸の線は材質の中で土の凸凹に合わせて切る
      if (i < NX && j < NZ) { const a = i * (NZ + 1) + j; idx.push(a, a + 1, a + NZ + 1, a + 1, a + NZ + 2, a + NZ + 1); }   // 上向きの面（逆だと裏で描かれない）
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a2e1e, vertexColors: true, roughness: 1, envMapIntensity: 0,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // 前の作りは色を決め打ちで塗り、空の映りも波の向きも無く「灰の板」に見えた（10/29）。
  // 水面の向きを波と雨の輪で揺らし、霞の色（空）を斜めの角度ほど強く映し、真下は濁った黄土の水を見せる。
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.ovTime = { get value() { return SETTINGS.reduceMotion ? 0 : WIND.value; } };
    sh.uniforms.ovFoam = { value: ovfFoam() }; sh.uniforms.ovNoise = { value: ovfNoise() };
    sh.uniforms.ovLeg = { value: legs };
    sh.vertexShader = 'varying vec2 vOvUv;\nvarying vec3 vOvW;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vOvUv = uv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vOvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform vec4 ovLeg[12];\nuniform float ovTime;\nuniform sampler2D ovFoam;\nuniform sampler2D ovNoise;\nvarying vec2 vOvUv;\nvarying vec3 vOvW;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
      float ovS = abs(vOvUv.y);
      vec2 ovP = vOvW.xz;
      float ovDist = length(cameraPosition - vOvW);
      vec3 ovV = normalize(cameraPosition - vOvW);
      // 流れ（+x）に沿って伸びた波の高さ。二つの大きさを重ね、遠くは弱めてちらつかせない。
      vec2 ovQ1 = vec2(ovP.x * 0.07 - ovTime * 0.32, ovP.y * 0.2);
      vec2 ovQ2 = vec2(ovP.x * 0.3 - ovTime * 0.85, ovP.y * 0.55 + 0.31);
      float ovE = 0.02;
      float ovH0 = texture2D(ovNoise, ovQ1).r + 0.5 * texture2D(ovNoise, ovQ2).r;
      float ovHx = texture2D(ovNoise, ovQ1 + vec2(ovE, 0.0)).r + 0.5 * texture2D(ovNoise, ovQ2 + vec2(ovE, 0.0)).r;
      float ovHz = texture2D(ovNoise, ovQ1 + vec2(0.0, ovE)).r + 0.5 * texture2D(ovNoise, ovQ2 + vec2(0.0, ovE)).r;
      float ovAmp = 1.5 * (0.3 + 0.7 * (1.0 - smoothstep(10.0, 45.0, ovDist)));
      vec3 ovN = vec3(-(ovHx - ovH0) * ovAmp, 1.0, -(ovHz - ovH0) * ovAmp);
      // 雨粒の輪（近くだけ）。升ごとに場所と時をずらす。
      vec2 ovRc = ovP * 1.7, ovCi = floor(ovRc), ovCf = fract(ovRc) - 0.5;
      vec4 ovCr = fract(texture2D(ovNoise, ovCi / 64.0 + 0.5 / 64.0) * 7.31);
      vec2 ovRd = ovCf - (ovCr.gb - 0.5) * 0.5;
      float ovAge = fract(ovTime * 1.1 + ovCr.r * 9.0), ovR = length(ovRd);
      float ovRing = sin((ovR - ovAge * 0.42) * 30.0) * (1.0 - ovAge) * (1.0 - smoothstep(0.0, 0.07, abs(ovR - ovAge * 0.42)));
      ovN.xz += ovRd / max(ovR, 0.001) * ovRing * 0.3 * (1.0 - smoothstep(3.0, 9.0, ovDist));   // 遠くの輪は細かすぎて縞に化ける
      ovN = normalize(ovN);
      vec3 ovSkyC = vec3(0.32, 0.33, 0.34);
      #ifdef USE_FOG
        ovSkyC = fogColor;
      #endif
      vec3 ovRf = reflect(-ovV, ovN);
      float ovRy = max(ovRf.y, 0.0);
      float ovCl = texture2D(ovNoise, ovRf.xz / (ovRy + 0.12) * 0.035 + vec2(ovTime * 0.004, 0.0)).r;
      vec3 ovSky = ovSkyC * (0.85 - 0.35 * smoothstep(0.0, 0.6, ovRy)) * (0.75 + 0.4 * ovCl);
      // 向こう岸の葦・土手・人（高さ一・六メートルほど）を映す帯。遠目では川面の奥半分が岸の暗い映りになり、空を映す板に見えない。
      vec2 ovDir = -ovV.xz / max(length(ovV.xz), 0.001);
      float ovC = 47.0 + 2.0 * sin(vOvW.x * 0.045 + 1.0), ovHW = 9.5 + 0.8 * sin(vOvW.x * 0.11 + 2.0);
      float ovFar = max(ovHW - (vOvW.z - ovC) * sign(ovDir.y + 0.0001), 0.0) / max(abs(ovDir.y), 0.08);
      float ovBankH = 1.6 * (0.6 + 0.8 * texture2D(ovNoise, vec2(vOvW.x * 0.09, 0.3)).r);
      float ovBankK = 1.0 - smoothstep(0.8, 1.15, ovRy * ovFar / ovBankH);
      ovSky = mix(ovSky, ovSkyC * vec3(0.16, 0.155, 0.12) * (0.7 + 0.6 * texture2D(ovNoise, vec2(vOvW.x * 0.6, ovRy * 3.0)).g), ovBankK * 0.85);
      float ovF = min(0.02 + 0.98 * pow(1.0 - max(dot(ovN, ovV), 0.0), 5.0), mix(0.55, 0.3, smoothstep(14.0, 32.0, ovDist)));   // 0.3 では低い目線で土と同じ茶の野に見えた（25秒の目は高さ1.2m・水へ7〜12度。10/29）   // 泥水は空を映しきらない（0.6 では遠目に灰の板だった。10/29）   // 雨で荒れた面は鏡にならない
      ovSky *= mix(vec3(0.86, 0.8, 0.68), vec3(0.62, 0.54, 0.4), smoothstep(14.0, 32.0, ovDist));   // 遠目は灰の板にしない   // 遠目の照りも黄土の濁りに（灰の板に見せない。10/29）   // 泥水は映りにも黄土が混じる
      // 濁った黄土の水（嵐で田の泥を巻いた流れ）。流れに沿う濃淡。
      float ovTb = texture2D(ovNoise, vec2(ovP.x * 0.025 - ovTime * 0.06, ovP.y * 0.06)).r;
      vec3 ovBody = vec3(0.095, 0.066, 0.034) * (0.72 + 0.45 * ovTb);   // 田の泥を巻いた黄土の濁り（霞の色に掛けると黒い板になった。10/29）   // 霞の色は野の照りより明るい。野の土と同じ暗さの濁り水にする
      vec3 ovCol = mix(ovBody, ovSky, ovF);
      // 岸の線を土の凸凹で崩し、水ぎわは浅く泥が透ける。
      float ovSe = ovS + (texture2D(ovNoise, ovP * 0.33).r - 0.5) * 0.16 + (texture2D(ovNoise, ovP * 1.3).g - 0.5) * 0.05;
      ovCol = mix(ovCol, ovBody * vec3(0.55, 0.5, 0.45), smoothstep(0.72, 0.93, ovSe) * 0.55);
      // 細い白波：流れに沿う短い筋。両岸と瀬の帯に寄せる。
      vec2 ovA = vec2(ovP.x * 0.055 - ovTime * 0.3, vOvUv.y * 1.35 + sin(ovP.x * 0.08) * 0.1);
      float ovFm = texture2D(ovFoam, ovA).r * 0.65 + texture2D(ovFoam, ovA * vec2(2.1, 2.3) + vec2(-ovTime * 0.2, 0.37)).r * 0.5;
      float ovRiff = clamp(smoothstep(0.6, 0.88, ovSe) + 0.45 * smoothstep(0.8, 0.97, sin(ovP.x * 0.19 + 1.3) * 0.5 + 0.5), 0.0, 1.0);
      float ovFoamK = smoothstep(0.85, 1.1, ovFm) * ovRiff;
      // 岸に寄る泡の線（流れが岸に当たる所）
      ovFoamK = max(ovFoamK, smoothstep(0.83, 0.9, ovSe) * (1.0 - smoothstep(0.9, 0.95, ovSe)) * smoothstep(0.35, 0.8, ovFm));
      // 渡り：瀬の砂利が浅い水の下に透ける。下手（+x）の縁に、越えた水が止まったまま立てる白い波の列。
      float ovFn = texture2D(ovNoise, ovP * 0.21).r - 0.5;
      float ovFd = vOvW.x - ${OVF_FORD_X.toFixed(1)};
      float ovFordK = 1.0 - smoothstep(3.0, 4.6, abs(ovFd) + ovFn * 1.2);
      vec3 ovGravel = mix(vec3(0.075, 0.064, 0.046), vec3(0.16, 0.145, 0.11), texture2D(ovNoise, ovP * 1.1).g);
      ovCol = mix(ovCol, mix(ovGravel, ovSky, ovF * 0.55), ovFordK * 0.6);
      float ovDn = ovFd - 3.6 - ovFn * 1.4;
      float ovStand = smoothstep(-0.8, 0.1, ovDn) * (1.0 - smoothstep(0.8, 4.5, ovDn));
      float ovCrest = smoothstep(0.5, 0.95, sin(ovDn * 4.2 - ovS * 1.3) * 0.5 + 0.5 + (ovFm - 0.6) * 0.5);
      float ovWhite = ovStand * ovCrest * (1.0 - smoothstep(0.82, 0.95, ovSe));
      // 瀬の上を流れが細かく波立つ（上手の縁と砂利の帯）
      ovWhite = max(ovWhite, ovFordK * smoothstep(0.75, 1.05, ovFm + ovFn * 0.4) * 0.6);
      // 自然の瀬：斜めに川を横切る白い波の筋（渡りの外にも二本）
      for (int k = 0; k < 2; k++) {
        float rx = k == 0 ? 4.0 : 47.0;
        float rd = vOvW.x - rx - (vOvW.z - ovC) * (k == 0 ? 0.55 : -0.45) - ovFn * 2.0;
        ovWhite = max(ovWhite, (1.0 - smoothstep(0.0, 1.8, abs(rd - 1.0))) * smoothstep(0.6, 1.0, ovFm + (ovFn + 0.5) * 0.35) * 0.85);
      }
      // 渡り杭：杭の下手に裂ける V の泡と、杭を巻く白い輪
      for (int k = 0; k < 2; k++) {
        float sx = ${OVF_FORD_X.toFixed(1)} + (k == 0 ? -${OVF_STAKE_DX.toFixed(1)} : ${OVF_STAKE_DX.toFixed(1)});
        float sc = 47.0 + 2.0 * sin(sx * 0.045 + 1.0) - (9.5 + 0.8 * sin(sx * 0.11 + 2.0)) + 1.3;
        float zq = vOvW.z - sc, kk = max(floor(zq / ${OVF_STAKE_STEP.toFixed(1)} + 0.5), 0.0);
        float dz = zq - kk * ${OVF_STAKE_STEP.toFixed(1)}, dx = vOvW.x - sx - sin(kk * 2.9 + (k == 0 ? -1.0 : 1.0)) * 0.18;
        float ring = 1.0 - smoothstep(0.1, 0.32, length(vec2(dx, dz)));
        float vk = step(-0.05, dx) * (1.0 - smoothstep(0.4, 3.2, dx)) * (1.0 - smoothstep(0.05 + dx * 0.16, 0.16 + dx * 0.24, abs(dz)));
        ovWhite = max(ovWhite, max(ring, vk * smoothstep(0.35, 0.8, ovFm + 0.2)) * (1.0 - smoothstep(0.9, 0.96, ovSe)));
      }
      // 水を漕いで進む兵の脛の泡（近くの十二人まで）。下手へ流れる尾。
      for (int k = 0; k < 12; k++) {
        vec4 lg = ovLeg[k];
        if (lg.w < 0.5) continue;
        vec2 d = vOvW.xz - lg.xy; float r = length(d);
        float ring = smoothstep(0.16, 0.26, r) * (1.0 - smoothstep(0.3, 0.6, r + (ovFm - 0.6) * 0.2));
        float tail = step(0.0, d.x) * (1.0 - smoothstep(0.3, 1.8, d.x)) * (1.0 - smoothstep(0.12 + d.x * 0.15, 0.24 + d.x * 0.22, abs(d.y)));
        ovWhite = max(ovWhite, max(ring, tail * smoothstep(0.4, 0.8, ovFm + 0.15)) * 0.9);
      }
      ovFoamK = max(ovFoamK, ovWhite);
      ovCol = mix(ovCol, ovSkyC * vec3(0.62, 0.58, 0.5), ovFoamK * 0.5 * (0.4 + 0.6 * smoothstep(3.0, 9.0, ovDist)) * (1.0 - 0.6 * smoothstep(22.0, 45.0, ovDist)));   // 足元の泡は筆の跡に見えた。近くは薄く   // 泡も濁った生成り（真っ白は雪の斑に見えた）
      // 白い波は濁りの上で生成りの白に（泡の明るさは霞より少し上。真っ白の斑にはしない）
      ovCol = mix(ovCol, ovSkyC * vec3(1.08, 1.05, 0.96) + vec3(0.03), ovWhite * 0.64 * (1.0 - 0.45 * smoothstep(25.0, 50.0, ovDist)));
      outgoingLight = ovCol;
      diffuseColor.a *= 1.0 - smoothstep(0.9, 0.96, ovSe);
      #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'moribe_overflow2';
  const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 1;
  // 描く前に、カメラに近い順で流れの中に立つ兵を十二人まで拾う（毎コマ new しない）
  const near = [];
  mesh.onBeforeRender = (r, sc, cam) => {
    const c = cam.position; near.length = 0;
    for (const u of rt.army?.units || []) {
      if (!u.alive || u.gone || !u.pos) continue;
      const x = u.pos.x, z = u.pos.z;
      if (x < OVF_X0 || x > OVF_X1 || Math.abs(z - ovfZ(x)) > ovfHW(x) - .6) continue;
      const d = (x - c.x) ** 2 + (z - c.z) ** 2;
      if (d < 1600) near.push(d, x, z);
    }
    for (let k = 0; k < 12; k++) legs[k].w = 0;
    for (let k = 0; k < 12 && near.length; k++) {
      let bi = 0; for (let i = 3; i < near.length; i += 3) if (near[i] < near[bi]) bi = i;
      legs[k].set(near[bi + 1], near[bi + 2], 0, 1); near[bi] = 1e9;
      if (k * 3 + 3 >= near.length) break;
    }
  };
  W.scene.add(mesh);
  // 渡り杭：雨に濡れた古い杉の杭（細い八角を少し傾け、頭を不揃いに）。形一つを束ねて描く。
  const stakes = ovfStakes();
  const sGeo = new THREE.CylinderGeometry(.055, .085, 1, 8, 2); sGeo.translate(0, .5, 0);
  const sp = sGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) { const y = sp.getY(i); if (y > .99) sp.setY(i, y - (Math.sin(sp.getX(i) * 40 + sp.getZ(i) * 31) * .5 + .5) * .06); sp.setX(i, sp.getX(i) * (1 + Math.sin(i * 1.7) * .12)); }
  sGeo.computeVertexNormals();
  const sMat = new THREE.MeshStandardMaterial({ color: 0x5a4c3c, map: woodTex(), bumpMap: woodTex(), bumpScale: .02, roughness: .62, envMapIntensity: .25 });
  const sMesh = new THREE.InstancedMesh(sGeo, sMat, stakes.length), so = new THREE.Object3D();
  stakes.forEach(([x, z], i) => {
    const g = drawGroundAt(W, x, z);
    so.position.set(x, g - .25, z);
    so.rotation.set(Math.sin(i * 3.1) * .1, i * 1.3, Math.sin(i * 1.9) * .1);
    so.scale.set(1, .95 + (Math.sin(i * 2.3) * .5 + .5) * .55, 1);
    so.updateMatrix(); sMesh.setMatrixAt(i, so.matrix);
  });
  sMesh.castShadow = true; W.scene.add(sMesh);
  const dispose = rt.dispose;
  rt.dispose = function () { geo.dispose(); mat.dispose(); sGeo.dispose(); sMat.dispose(); return dispose.call(this); };
}

function moribeFord(rt) {
  const W = rt.world, st = W.def.streams[1], pa = st.mesh.geometry.attributes.position;
  for (let i = 0; i < st.surface.length; i += 3) {
    const x = st.surface[i], k = Math.max(0, Math.min(1, (160 - Math.abs(x)) / 30));
    const y = st.surface[i + 2] + (0.12 - st.surface[i + 2]) * k;
    st.surface[i + 2] = y;
    pa.setY(i / 3 * 2, y); pa.setY(i / 3 * 2 + 1, y);
  }
  pa.needsUpdate = true;
  // 渡れる帯は明るい青緑の浅瀬。乾いた岸と色を分け、既存の川面だけを使う。
  const colors = st.mesh.geometry.attributes.color;
  const sand = new THREE.Color(0x648481);
  for (let i = 0; i < pa.count; i++) {
    const k = Math.max(0, Math.min(1, (7 - Math.abs(pa.getX(i) - START2.x)) / 2));
    colors.setXYZ(i, colors.getX(i) + (sand.r - colors.getX(i)) * k,
      colors.getY(i) + (sand.g - colors.getY(i)) * k,
      colors.getZ(i) + (sand.b - colors.getZ(i)) * k);
  }
  colors.needsUpdate = true;
  // 水の色を残した明るい川底と細かい白波で、浅瀬を岸から岸へつなぐ。
  const waterMat = st.mesh.material, waterCompile = waterMat.onBeforeCompile;
  const waterKey = waterMat.customProgramCacheKey();
  waterMat.onBeforeCompile = function (sh, renderer) {
    waterCompile.call(this, sh, renderer);
    // 照明用の材質へ色が渡る前に浅瀬を描く。照明の直前では砂底の色が反映されない。
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float fordEdge = abs(vWPw.x - ${START2.x.toFixed(1)}) + sin(vWPw.z * 1.7) * 0.22;
      float fordBand = 1.0 - smoothstep(4.0, 6.0, fordEdge);
      float fordGrain = texture2D(tMacro, vWPw.xz * 0.9).r;
      // 川底の小石は地面に固定。流れる白波と分け、浅さと歩いた分を絵で見せる。
      vec2 fordCell = fract(vWPw.xz * 0.85 + vec2(fordGrain * 2.7, fordGrain * 3.6)) - 0.5;
      float fordPebble = (1.0 - smoothstep(0.12, 0.25, length(fordCell * vec2(1.0, 1.4)))) * smoothstep(0.35, 0.65, fordGrain);
      // 帯の両端だけ白波を強め、中央の止まった砂と小石を岸から読めるようにする。
      float fordRim = smoothstep(2.8, 4.2, fordEdge);
      float fordRipple = smoothstep(0.86, 0.98, sin(vWPw.z * 6.0 + fordGrain * 2.0 - uTime * 1.4));
      // 青い流れの中に砂底の帯を通し、入口から出口まで歩ける浅さを見せる。
      // 隣の流れは元の川色のまま。新しい形や描画は増やさない。
      // 砂底と固定した小石を明瞭にし、泳ぐ川でなく歩ける浅い帯として見せる。
      // 砂底は岸と同じ暖色のまま、濡れた暗さへ寄せる（白く光る板に見せず、渡れる帯は読める明るさを残す）。
      vec3 fordSand = mix(vec3(0.17, 0.15, 0.095), vec3(0.27, 0.24, 0.16), fordGrain);
      fordSand = mix(fordSand, vec3(0.07, 0.07, 0.055), fordPebble * (0.35 + fordGrain * 0.25));   // 小石は斑に
      diffuseColor.rgb = mix(diffuseColor.rgb, fordSand, fordBand * 0.95);
      // 濡れた砂底の明るさを保ち、暗い流れの中に渡れる帯を残す。
      // 浅瀬も水の色を保つ。両岸の細い白波を既存の川面へ描き、終点を土と分ける。
      float fordShore = smoothstep(${(NIRE_WIDTH2 - FORD_FOOT).toFixed(1)}, ${NIRE_WIDTH2.toFixed(1)}, abs(vWPw.z - ${NIREMATA2.toFixed(1)}));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.36, 0.34),
        max(fordRipple * mix(0.12, 0.55, fordRim), fordShore * (0.2 + fordGrain * 0.15)) * fordBand);
    `).replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      // 発光の変数を作った後で足す。携帯の軽い材質でも浅瀬を描けるようにする。
      totalEmissiveRadiance += fordSand * fordBand * 0.015;
    `).replace('#include <opaque_fragment>', `
      // 空の白い反射で砂底を隠さない。流れと岸の波を残し、渡れる帯だけ底を見せる。
      // 帯の外は青緑へ落とし、空の反射が浅瀬と同じ白さになるのを抑える。
      outgoingLight = mix(outgoingLight, outgoingLight * vec3(0.46, 0.4, 0.29) + vec3(0.05, 0.035, 0.017), 0.88 * (1.0 - fordBand));   // 嵐で濁った楡俣川（泥の茶。10/28）
      // 浅瀬も上に薄い水を残す（砂の白い板に見せない。10/27）。
      outgoingLight = mix(outgoingLight * vec3(0.6, 0.58, 0.5), mix(fordSand * 0.9, vec3(0.42, 0.43, 0.39),
        fordRipple * mix(0.08, 0.42, fordRim)),
        fordBand * (1.0 - fordShore * 0.35) * 0.72);
      #include <opaque_fragment>
    `);
  };
  waterMat.customProgramCacheKey = () => waterKey + '|森部の浅瀬';
  waterMat.needsUpdate = true;
  st.mesh.userData.waterSurfaceReady = true;
  // ピンは川面の外の対岸へ刺す。水中の到着許容幅を行き先に使わない。
  POINT2.z = nireZ(POINT2.x) - NIRE_WIDTH2 - .75;
  const bank = { x: POINT2.x, z: POINT2.z, y: W.heightAt(POINT2.x, POINT2.z) };
  // 曲がった川でも、根元を水際より外へ保つ。
  for (let i = 0; i < 96 && !atFordBank(bank, W); i++) {
    bank.z -= .25; bank.y = W.heightAt(bank.x, bank.z);
  }
  // 根元は対岸の土にそろえる。渡河の完了判定は従来の一歩分の余裕を保つ。
  POINT2.z = bank.z; POINT2.y = drawGroundAt(W, POINT2.x, POINT2.z);
  st.mesh.geometry.computeVertexNormals();
  st.mesh.geometry.computeBoundingSphere();
  // 両岸の石。出陣時だけ作り、形と材質を使い回す。
  const stoneGeo = new THREE.SphereGeometry(1, 7, 5);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x827b69, roughness: 1 });
  const STONES2 = 22;
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, STONES2);
  const at = new THREE.Object3D();
  for (let i = 0; i < STONES2; i++) {
    // 浅瀬の外の流れに顔を出す石（12〜）。浅瀬の帯と歩く筋は空ける。
    if (i >= 12) {
      const k = i - 12, side = k % 2 ? 1 : -1;
      const x = START2.x + side * (7.5 + (k >> 1) * 2.6 + Math.sin(k * 3.7) * .8);
      const z = nireZ(x) + Math.sin(k * 5.3) * (NIRE_WIDTH2 - 2.2);
      at.position.set(x, .02, z); at.rotation.set(0, k * 2.3, 0);
      at.scale.set(.35 + (k % 3) * .14, .14 + (k % 2) * .06, .28 + (k % 4) * .05);
      at.updateMatrix(); stones.setMatrixAt(i, at.matrix); continue;
    }
    // 四個は浅瀬の両脇で水面から少し顔を出す。中央を空け、飛び石の列にしない。
    // 岸にあった石を使い、入口から川底の浅さを読めるようにする（チャッピー 0116 の案）。
    const inWater = i >= 8;
    const x = START2.x + (i % 2 ? 1 : -1) * ((inWater ? 3.8 : 5.5) + Math.sin(i * 2) * .45);
    const z = nireZ(x) + (inWater ? (i - 9.5) * 2.3 : (i < 4 ? -1 : 1) * (10.8 + i % 3 * .7));
    at.position.set(x, inWater ? .04 : Math.max(W.heightAt(x, z) + 0.12, 0.1), z);
    at.scale.set(0.45 + i % 3 * 0.12, inWater ? .16 : .22, 0.36); at.rotation.y = i * 1.7;
    at.updateMatrix(); stones.setMatrixAt(i, at.matrix);
  }
  // 黄色い杭は別の行き先に見えるため置かない。浅瀬の川底と白波で渡れる帯を示す。
  W.scene.add(stones);
  // 粗い地形の面に沿う濡れた岸。細分した色の帯で流れと土手をつなぐ。
  // 高さ・水深・移動判定は保ち、地表から浮く石の列を岸の代わりにしない。
  const bankPos = [], bankColors = [], bankUV = [], bankIndices = [];
  const bankColor = new THREE.Color();
  for (const side of [-1, 1]) {
    const start = bankPos.length / 3;
    for (let i = 0; i <= 110; i++) {
      const x = -100 + i * 2, center = nireZ(x);
      // 川面の幅より内側へ岸を描かない。浅瀬の川底が高くても川の中央に土手を作らない。
      let edge = st.w;
      while (edge < 20 && drawGroundAt(W, x, center + side * edge) < .14) edge += .25;
      for (let j = 0; j < 4; j++) {
        const offset = edge + j * (1.05 + .2 * Math.sin(x * .23));
        const z = center + side * offset;
        bankPos.push(x, drawGroundAt(W, x, z) + .018, z);
        bankUV.push(x * .45, z * .45);
        const k = j / 3, grain = .95 + .05 * Math.sin(x * 2.7 + j);
        bankColor.setRGB((.04 + k * .02) * grain, (.03 + k * .015) * grain, (.019 + k * .01) * grain);   // 濡れた泥の斜面。色は線形の値（.13 でも灰の帯に見えていた。10/28）
        // 川底と同じ砂色を両岸へつなぎ、水際で渡り道が途切れて見えないようにする。
        const ford = Math.max(0, Math.min(1, (6 - Math.abs(x - START2.x)) / 1.5));
        bankColor.r += (.06 * grain - bankColor.r) * ford;
        bankColor.g += (.05 * grain - bankColor.g) * ford;
        bankColor.b += (.034 * grain - bankColor.b) * ford;
        bankColors.push(bankColor.r, bankColor.g, bankColor.b, j === 3 ? 0 : j === 2 ? .35 : .7);
        if (i < 110 && j < 3) {
          const a = start + i * 4 + j;
          bankIndices.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
        }
      }
    }
  }
  const bankGeo = new THREE.BufferGeometry();
  bankGeo.setAttribute('position', new THREE.Float32BufferAttribute(bankPos, 3));
  bankGeo.setAttribute('color', new THREE.Float32BufferAttribute(bankColors, 4));
  bankGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bankUV, 2));
  bankGeo.setIndex(bankIndices); bankGeo.computeVertexNormals();
  const bankMat = new THREE.MeshStandardMaterial({ vertexColors: true, bumpMap: mudTex(), bumpScale: .025,
    roughness: 1, envMapIntensity: 0, side: THREE.DoubleSide, transparent: true, depthWrite: false,   // 雨空を映して灰の板に見えていた（10/28）
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const banks = new THREE.Mesh(bankGeo, bankMat); banks.receiveShadow = true;
  W.scene.add(banks);
  // 水際の草は点状の芽でなく、低く倒れた葉の株。同じ形一つを束ねて描く。
  const reedPos = [], reedColors = [];
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.4, dx = Math.cos(angle), dz = Math.sin(angle), h = .34 + i * .065;
    reedPos.push(-dz * .025, 0, dx * .025, dz * .025, 0, -dx * .025, dx * .23, h, dz * .23);
    reedColors.push(.25, .3, .12, .25, .3, .12, .5, .52, .24);
    // 葦の背の高い茎（細い三角を一本）。株の中から一・五メートルほど立てる。
    const ha = angle + 1.2, hx = Math.cos(ha) * .12, hz = Math.sin(ha) * .12, hh = 1.1 + i * .12;
    reedPos.push(hx - dz * .018, 0, hz + dx * .018, hx + dz * .018, 0, hz - dx * .018, hx * 2.2, hh, hz * 2.2);
    reedColors.push(.22, .26, .11, .22, .26, .11, .55, .5, .3);
  }
  const reedGeo = new THREE.BufferGeometry();
  reedGeo.setAttribute('position', new THREE.Float32BufferAttribute(reedPos, 3));
  reedGeo.setAttribute('color', new THREE.Float32BufferAttribute(reedColors, 3)); reedGeo.computeVertexNormals();
  const reedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, side: THREE.DoubleSide });
  // 嵐の風で葦の穂先を風下へ傾け、突風で波打たせる。根元は動かさない。形と描画数は同じ。
  reedMat.onBeforeCompile = (sh) => {
    sh.uniforms.rdTime = WIND; sh.uniforms.rdGust = GUST;
    sh.uniforms.rdDir = { value: new THREE.Vector2(WIND_STATE.dirX, WIND_STATE.dirZ) };
    sh.vertexShader = 'uniform float rdTime, rdGust;\nuniform vec2 rdDir;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 rdWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
      float rdH = max(0.0, rdWorld.y - (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).y);
      float rdWave = sin(rdTime * 2.4 + rdWorld.x * 0.35 + rdWorld.z * 0.25);
      float rdBend = rdH * rdH * (0.28 + rdGust * 0.08 + rdWave * (0.07 + rdGust * 0.05));
      rdWorld.xz += rdDir * rdBend;
      rdWorld.y -= rdBend * rdBend * 0.35;
      vec4 mvPosition = viewMatrix * rdWorld;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  reedMat.customProgramCacheKey = () => 'moribe_reed_wind';
  const REEDS2 = 520;   // 分かれの流れの両岸を倍に（一度に描く数は同じ。10/29）   // 280 から先の120は、あふれた分かれの流れの両岸に群れ（株五つずつ。持ち場の正面の道はあける）   // 160 は川沿いに一本ずつ。残りは渡る所の両脇に群れ（株五つずつ）。
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, REEDS2);
  for (let i = 160; i < 280; i++) {
    const c = (i - 160) / 5 | 0, side = c % 2 ? 1 : -1, lr = (c >> 1) % 2 ? 1 : -1;
    const cx = START2.x + lr * (8.2 + (c >> 2) * 3.4 + Math.sin(c * 4.3) * 1.2);
    const n = i % 5, x = cx + Math.cos(n * 2.5 + c) * 1.1;
    const z = nireZ(x) + side * (NIRE_WIDTH2 + .4 + (n % 3) * .7 + Math.sin(c * 1.7) * .5);
    at.position.set(x, Math.max(W.heightAt(x, z), 0), z); at.rotation.set(0, i * 2.4, 0);
    const scale = .95 + (Math.sin(i * 3.7) + 1) * .35;
    at.scale.set(scale, scale * 1.15, scale); at.updateMatrix(); reeds.setMatrixAt(i, at.matrix);
  }
  for (let i = 280; i < REEDS2; i++) {
    const c = (i - 280) / 5 | 0, side = c % 2 ? 1 : -1, n = i % 5;
    let cx = OVF_X0 + 3 + (c >> 1) * 3.3 + Math.sin(c * 3.1) * 1.1;
    if (cx > 23 && cx < 29) cx = cx < 26 ? cx - 3 : cx + 3;   // 25秒の bot の通り道（x20〜32）はあける
    const x = cx + Math.cos(n * 2.5 + c) * 1.2;
    const z = ovfZ(x) + side * (ovfHW(x) - .3 + (n % 3) * .6 + Math.sin(c * 1.7) * .4);
    at.position.set(x, W.heightAt(x, z), z); at.rotation.set(0, i * 2.4, 0);
    const scale = 1.1 + (Math.sin(i * 3.7) + 1) * .35;
    at.scale.set(scale, scale * 1.35, scale); at.updateMatrix(); reeds.setMatrixAt(i, at.matrix);
  }
  for (let i = 0; i < 160; i++) {
    const x = -92 + i / 2 * 2.5 + Math.sin(i * 13.1), side = i % 2 ? 1 : -1;
    let edge = 0;
    while (edge < 20 && W.heightAt(x, nireZ(x) + side * edge) < .14) edge += .5;
    const z = nireZ(x) + side * (edge + 2.3 + Math.sin(i * 2.1) * 1.4);
    const fordTrack = Math.abs(x - START2.x) < 5;
    at.position.set(x, W.heightAt(x, z), z); at.rotation.set(0, i * 2.4, 0);
    const scale = fordTrack ? .35 : .8 + (Math.sin(i * 5.1) + 1) * .4;
    at.scale.set(scale, fordTrack ? .12 : scale, scale); at.updateMatrix(); reeds.setMatrixAt(i, at.matrix);
  }
  reeds.computeBoundingSphere(); W.scene.add(reeds);
  const dispose = rt.dispose;
  rt.dispose = function () {
    stoneGeo.dispose(); stoneMat.dispose();
    bankGeo.dispose(); bankMat.dispose(); reedGeo.dispose(); reedMat.dispose();
    return dispose.call(this);
  };
}

// 視点に入り込んだ兵と、自分を隠す手前の味方は、描く間だけ装備と馬ごと避ける。
// 肩だけの半透明では袖や脚が大写しに残る。描いた後の復元は元の処理へ任せる。
function moribeNearBodies(rt) {
  const player = rt.player, fade = player.allyFade;
  const tip = new THREE.Vector3(), butt = new THREE.Vector3();
  const viewTip = new THREE.Vector3(), viewButt = new THREE.Vector3();
  // 肩への線だけでは、その上で目前の敵を横切る柄を拾えない。
  // カメラの前の細い箱と柄の線分を調べる。端点が両方とも箱の外でも拾う。
  const crossesView = (a, b) => {
    let lo = 0, hi = 1;
    for (let axis = 0; axis < 3; axis++) {
      const start = a.getComponent(axis), delta = b.getComponent(axis) - start;
      const min = axis === 2 ? -8 : axis === 1 ? -0.8 : -0.9;
      const max = axis === 2 ? -0.2 : axis === 1 ? 1.1 : 0.9;
      if (Math.abs(delta) < 0.0001) { if (start < min || start > max) return false; continue; }
      const t0 = (min - start) / delta, t1 = (max - start) / delta;
      lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
      if (lo > hi) return false;
    }
    return true;
  };
  const simpleParts = ['body', 'legL', 'legR'];
  // 広い輪で肩を透かすと、横に立つ兵まで幽霊になる。
  // 体の遮蔽は下の視線判定だけで避け、旗と長柄の共通処理は使う。
  player.nearAllyVisit = () => {};
  player.allyFade = function (cam) {
    fade.call(this, cam);
    if (!cam) return;
    const c = cam.position, p = this.u.pos;
    const vx = p.x - c.x, vz = p.z - c.z, len2 = vx * vx + vz * vz;
    // 斬り合う本人までの狭い視線も空ける。横の味方と敵の武器は残す。
    const target = this.inRange && this.rangeCueTarget?.alive ? this.rangeCueTarget : rt.def.missionSignTarget(rt);
    const focus = target?.alive && target.team !== this.u.team &&
      (target.pos.x - p.x) ** 2 + (target.pos.z - p.z) ** 2 < 100 ? target : null;
    const fx = focus ? focus.pos.x - c.x : 0, fz = focus ? focus.pos.z - c.z : 0;
    const focusLen2 = fx * fx + fz * fz;
    for (const u of rt.army.units) {
      // 距離の切り替えで簡易模型の脚だけ戻さない。描く直前に全身の表示をそろえる。
      // 骨の姿を使わない時は胴を戻し、棒状の脚だけが野に残るのを防ぐ。
      if (u.human && !u.gone && !u.isStruct && !u.mounted && u !== this.u) {
        // 絵札が全身を描く兵へ簡易な胴と脚を重ねない。
        const simple = !u.human.root.visible && !u.efuda;
        for (const key of simpleParts) {
          const part = u[key];
          if (!part) continue;
          part.visible = simple;
          // 非表示の間に親から外された部品も、同じ描画で戻す。
          // 別の親へ持たせた部品は動かさない。道具と形は既存の物を使う。
          if (simple && !part.parent) {
            u.mesh.add(part); part.updateWorldMatrix(true, true);
          }
        }
      }
      // 倒れる途中の味方も視点へ食い込む。生死で遮蔽の確認を外さない。
      if (u.gone || u.isStruct || u === this.u || !u.alive && u.team !== this.u.team) continue;
      const dx = u.pos.x - c.x, dz = u.pos.z - c.z;
      // 味方の馬の首と肩には余裕を取る。敵は共通処理と同じ、体へ入り込む近さに限る。
      // 味方用の広い輪を敵にも使うと、横から迫る敵が武器ごと消えてしまう。
      const ally = u.team === this.u.team;
      // 持ち主が横に離れていても、斜めの長槍は視点へ届く。
      // 柄の実際の両端で調べ、体と奥の槍列は残す。作業用の点は使い回す。
      const w = u.wpn;
      if (ally && w?.visible && (u.wpnKind || u.lookWeapon) === 'spear'
          && dx * dx + dz * dz < 324) {
        w.updateWorldMatrix(true, false);
        butt.set(0, 0, w.userData.butt ?? -1.6).applyMatrix4(w.matrixWorld);
        tip.set(0, 0, w.userData.tip ?? 2).applyMatrix4(w.matrixWorld);
        const flex = w.userData.flex;
        if (flex?.on) {
          flex.b.updateWorldMatrix(true, false);
          tip.set(0, 0, flex.G.tip - flex.G.j2).applyMatrix4(flex.b.matrixWorld);
        }
        viewButt.copy(butt).applyMatrix4(cam.matrixWorldInverse);
        viewTip.copy(tip).applyMatrix4(cam.matrixWorldInverse);
        if (crossesView(viewButt, viewTip)) this.hideNearFlag(w);
        const sx = tip.x - butt.x, sy = tip.y - butt.y, sz = tip.z - butt.z;
        const length2 = sx * sx + sy * sy + sz * sz;
        const along = Math.max(0, Math.min(1,
          ((c.x - butt.x) * sx + (c.y - butt.y) * sy + (c.z - butt.z) * sz) / (length2 || 1)));
        if ((butt.x + sx * along - c.x) ** 2 + (butt.y + sy * along - c.y) ** 2
            + (butt.z + sz * along - c.z) ** 2 < 2.25) this.hideNearFlag(w);
        // 視点の直近だけでなく、自分の肩までを横切る味方の柄も避ける。
        // 敵の槍と、自分より先の槍列は残す。三点の狭い帯だけを調べる。
        if (this.fpK < 0.5) for (let i = 1; i <= 3; i++) {
          const t = i / 3, qx = c.x + vx * t, qz = c.z + vz * t;
          const qy = c.y + (p.y + 1.3 - c.y) * t;
          const k = Math.max(0, Math.min(1,
            ((qx - butt.x) * sx + (qy - butt.y) * sy + (qz - butt.z) * sz) / (length2 || 1)));
          if ((butt.x + sx * k - qx) ** 2 + (butt.y + sy * k - qy) ** 2
              + (butt.z + sz * k - qz) ** 2 < 0.81) { this.hideNearFlag(w); break; }
        }
        // 届く相手の胸まで横切る味方の柄も避け、命中と振りかぶりを見せる。
        // 肩までの判定だけでは残る、少し先の味方の長槍に限る。
        if (focus && w.visible) for (let i = 1; i <= 5; i++) {
          const t = i / 5, qx = c.x + fx * t, qz = c.z + fz * t;
          const qy = c.y + (focus.pos.y + (focus.mounted ? 2.2 : 1.3) - c.y) * t;
          const k = Math.max(0, Math.min(1,
            ((qx - butt.x) * sx + (qy - butt.y) * sy + (qz - butt.z) * sz) / (length2 || 1)));
          if ((butt.x + sx * k - qx) ** 2 + (butt.y + sy * k - qy) ** 2
              + (butt.z + sz * k - qz) ** 2 < .36) { this.hideNearFlag(w); break; }
        }
      }
      // 手前の味方の長槍が空まで横切ると、敵の構えが棒の陰に埋もれる。
      // 視点のすぐ前だけ長柄を避ける。奥の槍列まで抜いて乱戦を薄くしない。
      if (ally && dx * dx + dz * dz < 16) {
        const e = cam.matrixWorldInverse.elements, dy = u.pos.y + 1.3 - c.y;
        const depth = -(e[2] * dx + e[6] * dy + e[10] * dz);
        const side = e[0] * dx + e[4] * dy + e[8] * dz;
        if (depth > -1 && depth < 3 && Math.abs(side) < 0.65 + Math.max(0, depth) * 0.12) {
          if ((u.wpnKind || u.lookWeapon) === 'spear' || u.look?.standard) this.hideNearFlag(u.wpn);
          this.hideNearFlag(u.flag);
          this.hideNearFlag(u.standardFlag);
          this.hideNearFlag(u.human?.parts?.pole);
        }
      }
      // 距離だけで隠すのは視点が体へ入る近さまで。横の味方は残し、遮蔽は下の線分で判じる。
      const r = u.mounted ? ally ? 2.2 : 1.5 : 0.95;
      const inside = dx * dx + dz * dz < r * r
        && c.y >= u.pos.y - 0.2 && c.y <= u.pos.y + (u.mounted ? 4.4 : 2.6);
      // 敵の馬も胴より首が前へ張り出す。中心からの円だけでは、
      // 鼻先から視点が入り、人馬が画面を覆う。馬の向きに沿う狭い楕円で補う。
      // 前線の敵まで隠さず、視点そのものが人馬へ入った時だけ避ける。
      let insideHorse = false;
      if (u.mounted && !ally && dx * dx + dz * dz < 6.25
          && c.y >= u.pos.y - 0.2 && c.y <= u.pos.y + 3.4) {
        const yaw = u.mesh.rotation.y, sn = Math.sin(yaw), cs = Math.cos(yaw);
        const side = dx * cs - dz * sn, along = dx * sn + dz * cs;
        insideHorse = side * side / 0.81 + along * along / 4.84 < 1;
      }
      // カメラの近さだけでは、少し先の肩や馬の胴が自分を覆う。
      // 自分までの線分に限り敵味方の体を避け、刀を振る自分を見せる。自分より先の兵は残す。
      const t = len2 > 0.01 ? (dx * vx + dz * vz) / len2 : -1;
      const width = u.mounted ? 1.9 : 1.1;
      const y = c.y + (p.y + 1.3 - c.y) * t;
      // 自分までの線分を遮る体を避ける。自分より先の敵は隠さない。
      const blocks = this.fpK < 0.5 && t > 0 && t < 1
        && (dx - vx * t) ** 2 + (dz - vz * t) ** 2 < width * width
        && y >= u.pos.y && y <= u.pos.y + (u.mounted ? 4.4 : 2.5);
      // 寄った視点では自分までの線分が短くなり、少し先の騎手の胴を拾えない。
      // カメラの向きで、すぐ前に大写しになる味方の騎馬だけも避ける。
      // 横の徒歩と敵には広げない。行列の数値を使い、毎コマ道具を作らない。
      let riderBlocks = false;
      if (ally && u.mounted && dx * dx + dz * dz < 81) {
        const e = cam.matrixWorldInverse.elements, dy = u.pos.y + 2.2 - c.y;
        const depth = -(e[2] * dx + e[6] * dy + e[10] * dz);
        const side = e[0] * dx + e[4] * dy + e[8] * dz;
        const rise = e[1] * dx + e[5] * dy + e[9] * dz;
        // 騎手の中心だけでなく、馬の肩と背の旗が中央へ張り出す幅も含める。
        riderBlocks = depth > -1 && depth < 7.5
          && Math.abs(side) < 1.9 + Math.max(0, depth) * 0.12
          && Math.abs(rise) < 3;
      }
      // 共通の遮蔽が先に体を隠した時は、徒歩兵も装具を一緒に避ける。
      // 簡易兵や遠景への切り替えによる非表示は、遮蔽と取り違えない。
      const hiddenBody = u.camHidden || this.nearAllyHid.includes(u.mesh);
      const ft = focusLen2 > .01 ? (dx * fx + dz * fz) / focusLen2 : -1;
      const fy = focus ? c.y + (focus.pos.y + 1.3 - c.y) * ft : 0;
      const blocksEnemy = ally && focus && ft > 0 && ft < .9 &&
        (dx - fx * ft) ** 2 + (dz - fz * ft) ** 2 < (u.mounted ? 1.4 : .7) ** 2 &&
        fy >= u.pos.y && fy <= u.pos.y + (u.mounted ? 4.4 : 2.5);
      if (!inside && !insideHorse && !blocks && !riderBlocks && !hiddenBody && !blocksEnemy) continue;
      this.hideNearFlag(u.mesh);
      this.hideNearFlag(u.human?.root);
      this.hideNearFlag(u.horse);
      this.hideNearFlag(u.wpn);
      this.hideNearFlag(u.flag);
      this.hideNearFlag(u.standardFlag);
      this.hideNearFlag(u.human?.parts?.pole);
      this.hideNearFlag(u.uma);
    }
    // 本陣と備を行き来する二騎は army.units に入らない。人馬の親を避け、母衣だけ残さない。
    // 自分を覆う近さに限り、奥を走る使番は残す。描いた後は共通の処理で戻る。
    if (rt.couriers) for (const courier of rt.couriers) {
      const m = courier.m;
      if (!m.visible) continue;
      const dx = m.position.x - c.x, dz = m.position.z - c.z;
      if (dx * dx + dz * dz >= 81) continue;
      const e = cam.matrixWorldInverse.elements, dy = m.position.y + 2.2 - c.y;
      const depth = -(e[2] * dx + e[6] * dy + e[10] * dz);
      const side = e[0] * dx + e[4] * dy + e[8] * dz;
      const rise = e[1] * dx + e[5] * dy + e[9] * dz;
      const inside = dx * dx + dz * dz < 4.84 && c.y >= m.position.y - 0.2 && c.y <= m.position.y + 4.4;
      if (inside || depth > -1 && depth < 7.5 && Math.abs(side) < 1.9 + Math.max(0, depth) * 0.12 && Math.abs(rise) < 3)
        this.hideNearFlag(m);
    }
    // 体から独立している隊旗も、隠した旗持ちと一緒に戻す。
    for (const g of rt.army.groups) {
      if (!g.stds) continue;
      for (const s of g.stds) {
        const u = s.userData.carrier;
        if (!s.userData.std.down && u && this.nearAllyHid.includes(u.mesh)) this.hideNearFlag(s);
      }
    }
  };
}

// 竿の側と上端は留め、自由な縁ほど波打つ。視線を塞ぐ旗は竿ごと避ける。
function moribeCloth(rt) {
  const mats = new WeakMap(), owned = [], clock = { value: 0 }, wind = { value: 0 };
  const draped = [], vertex = new THREE.Vector3(), inverse = new THREE.Matrix4();
  // 手持ちの幟と隊旗の両方を泥へ寝かせる。落ちた時だけ布を作り、毎コマは触らない。
  const layCloth = (cloth) => {
    const source = cloth.geometry, geo = source.clone(), pa = geo.attributes.position;
    source.computeBoundingBox();
    const width = source.boundingBox.max.x - source.boundingBox.min.x;
    const height = source.boundingBox.max.y - source.boundingBox.min.y;
    cloth.updateWorldMatrix(true, false); inverse.copy(cloth.matrixWorld).invert();
    for (let i = 0; i < pa.count; i++) {
      // 敵旗の切れ込みは絵の座標より竿へ近い。同じ絵の座標で引くと、
      // 竿を越えて裏返った幅広い面になるため、実際の縁から折り量を求める。
      const free = Math.max(0, Math.min(1, (pa.getX(i) - source.boundingBox.min.x) / (width || 1)));
      const loose = Math.max(0, Math.min(1, (source.boundingBox.max.y - pa.getY(i)) / (height || 1)));
      const k = free * loose;
      // 留めた辺は保ち、自由な裾を内側へ折る。幅も縮め、長方形の板を地に残さない。
      const pleat = Math.sin(free * Math.PI * 4 + loose * 3);
      const gather = Math.sin(loose * Math.PI / 2);
      vertex.set(pa.getX(i) - width * 0.86 * free * gather,
        pa.getY(i) + height * 0.48 * k * loose
          + width * (0.22 * k * k + 0.08 * pleat * k), pa.getZ(i)).applyMatrix4(cloth.matrixWorld);
      vertex.y = rt.world.heightAt(vertex.x, vertex.z) + 0.025
        + (0.025 + 0.12 * pleat * pleat) * free * gather;
      vertex.applyMatrix4(inverse); pa.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    geo.userData.moribeShape = source; cloth.geometry = geo; draped.push(geo);
  };
  const dress = (cloth, down = false) => {
    if (!cloth?.isMesh) return;
    const geo = cloth.geometry;
    if (cloth.material.userData.moribeCloth && cloth.userData.moribeGeo === geo && cloth.userData.moribeDown === down) return;
    const base = cloth.userData.moribeBase || (cloth.userData.moribeBase = cloth.material);
    let shapes = mats.get(base);
    if (!shapes) { shapes = { up: new WeakMap(), down: new WeakMap() }; mats.set(base, shapes); }
    const variants = down ? shapes.down : shapes.up;
    const shape = geo.userData.moribeShape || geo;
    let mat = variants.get(shape);
    if (!mat) {
      geo.computeBoundingBox();
      const b = geo.boundingBox;
      const rect = { value: new THREE.Vector4(b.min.x, b.min.y, Math.max(0.001, b.max.x - b.min.x), Math.max(0.001, b.max.y - b.min.y)) };
      const fallen = { value: down ? 1 : 0 };
      mat = base.clone();
      // 布の奥の兵や竿を透かさず、幟どうしの前後も深さで決める。
      mat.side = THREE.DoubleSide; mat.transparent = false; mat.opacity = 1; mat.depthWrite = true;
      // 雨の陰でも紋と地色を残す。元の絵を共有し、旗や照明を増やさない。
      const mon = mat.map?.userData.mon;
      if (!down && mat.emissive && (mon === 'oda' || mon === 'eiraku' || mon === 'saito')) {
        mat.emissive.set(0xffffff); mat.emissiveMap = mat.map; mat.emissiveIntensity = .18;
      }
      if (down) {
        // 立っていた時の元の材質へ戻す処理で、落ちた白旗の泥まで消さない。
        mat.color.multiplyScalar(0.48); mat.roughness = 1; mat.metalness = 0;
        mat.depthWrite = true;
      }
      mat.userData.moribeCloth = true;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.mbTime = clock; sh.uniforms.mbWind = wind; sh.uniforms.mbRect = rect; sh.uniforms.mbFallen = fallen;
        sh.vertexShader = `uniform float mbTime, mbWind, mbFallen;
uniform vec4 mbRect;
vec3 mbFold() {
  float x = clamp((position.x - mbRect.x) / mbRect.z, 0.0, 1.0);
  float y = clamp((position.y - mbRect.y) / mbRect.w, 0.0, 1.0);
  vec3 root = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  // 嵐の風で布が速く大きくはためく。
  float a = x * 15.0 + y * 5.0 + mbTime * 3.8 + root.x * 0.53 + root.z * 0.37;
  float amp = mix(min(0.30, mbRect.z * 0.18) + mbWind * 0.09, 0.0, mbFallen);
  float k = x * (1.0 - y);
  // 風が弱くても、濡れた布の折れとふくらみを残す。上辺と竿側は動かさない。
  float bow = min(0.34, mbRect.z * 0.32) * (1.0 - mbFallen);
  float crease = x * 6.283185 + y * 2.0;
  float fold = 0.65 + 0.35 * sin(crease);
  return vec3(sin(a) * amp * k + bow * k * x * fold,
    (amp * (sin(a) * (1.0 - y) + cos(a) * 15.0 * k)
      + bow * k * (2.0 * fold + x * 0.35 * 6.283185 * cos(crease))) / mbRect.z,
    (amp * (-sin(a) * x + cos(a) * 5.0 * k)
      + bow * x * x * (-fold + (1.0 - y) * 0.70 * cos(crease))) / mbRect.w);
}
// 濡れた裾の重み。竿側と上辺は留め、動きを減らしても垂れは残す。
vec3 mbSag() {
  float x = clamp((position.x - mbRect.x) / mbRect.z, 0.0, 1.0);
  float loose = 1.0 - clamp((position.y - mbRect.y) / mbRect.w, 0.0, 1.0);
  float weight = mbRect.w * 0.12 * (1.0 - mbFallen);
  return vec3(weight * x * x * loose * loose,
    2.0 * weight * x * loose * loose / mbRect.z,
    -2.0 * weight * x * x * loose / mbRect.w);
}
` + sh.vertexShader
          .replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed.z += mbFold().x;
  transformed.y -= mbSag().x;`)
          .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  vec3 fold = mbFold();
  vec3 sag = mbSag();
  objectNormal = normalize(mix(vec3(-sag.y * fold.z - (1.0 - sag.z) * fold.y,
    -fold.z, 1.0 - sag.z), objectNormal, mbFallen));`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.69, 0.60), 0.16);
  ${mon === 'saito' && !down ? `
  // 頭上の赤い▼と同じ敵色を、実物の旗の縁にも残す。中央の紋は隠さない。
  float mbEdge = min(min(vMapUv.x, 1.0 - vMapUv.x), min(vMapUv.y, 1.0 - vMapUv.y));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.58, 0.018, 0.009), 1.0 - smoothstep(0.065, 0.085, mbEdge));` : ''}`);
      };
      mat.customProgramCacheKey = () => mon === 'saito' && !down ? 'moribe_cloth_enemy' : 'moribe_cloth';
      variants.set(shape, mat); owned.push(mat);
    }
    cloth.material = mat; cloth.userData.moribeGeo = geo; cloth.userData.moribeDown = down;
  };
  const dropWeapon = rt.army.dropWeapon;
  rt.army.dropWeapon = function (u) {
    dropWeapon.call(this, u);
    const w = u.dropped, cloth = u.standardFlag;
    if (!w?.userData.standard || !cloth || cloth.parent !== w || w.userData.moribeGroundCloth) return;
    w.userData.moribeGroundCloth = true;
    // 幟の竿は縦軸。槍の前後を測る共通処理の後で、実際の石突と先を泥へ合わせる。
    // 横方向の法線で長い竿を持ち上げず、竿の下の九点だけで支える。落ちた時に一度だけ。
    const x = w.position.x, z = w.position.z, a = w.rotation.y;
    const sn = Math.sin(a), cs = Math.cos(a);
    const back = w.userData.butt ?? -1.05, front = w.userData.tip ?? 2.55;
    const y0 = this.world.heightAt(x + sn * back, z + cs * back);
    const y1 = this.world.heightAt(x + sn * front, z + cs * front);
    w.rotation.set(Math.PI / 2 - Math.atan2(y1 - y0, front - back), a, 0, 'YXZ');
    w.position.y = 0; w.updateMatrix();
    let lift = -Infinity;
    for (let i = 0; i <= 8; i++) {
      vertex.set(0, back + (front - back) * i / 8, 0).applyMatrix4(w.matrix);
      lift = Math.max(lift, this.world.heightAt(vertex.x, vertex.z) + 0.025 - vertex.y);
    }
    w.position.y = lift;
    layCloth(cloth); dress(cloth, true);
  };
  // 背に付いた指物は手の幟と別。亡骸が残る間も、立った時の四角い布を残さない。
  // 共通の折り布と材質を使い、地に倒れた時に一度だけ替える。
  const animDeath = rt.army.animDeath;
  rt.army.animDeath = function (u, dt, near) {
    animDeath.call(this, u, dt, near);
    const d = u.death;
    if (!u.flag || !d || d.aid || d.floor || d.t <= 0.9 || d.moribeFlagFolded) return;
    d.moribeFlagFolded = true;
    this.foldGroundFlag(u.flag);
  };
  rt.scene.traverse((o) => { if (o.userData.flag?.isMesh) dress(o.userData.flag); });
  const update = rt.updateStandards;
  rt.updateStandards = function (dt) {
    update.call(this, dt);
    clock.value = SETTINGS.reduceMotion ? 0 : this.t;
    wind.value = SETTINGS.reduceMotion ? 0 : GUST.value;
    for (const g of this.army.groups) {
      if (!g.stds) continue;
      for (const s of g.stds) {
        const d = s.userData.std;
        // 視点のため姿を消した旗持ちの隊旗だけを空に残さない。
        // 遠景用の軽い兵と、地へ落ちた旗は従来どおり残す。
        if (!d.down && s.userData.carrier?.camHidden) s.visible = false;
        if (d.kind === 'cavalry') continue;
        // 竿先の接地計算と回す順をそろえる。傾斜で布だけ接地して竿が浮くのを防ぐ。
        if (d.down) s.rotation.set(s.rotation.x, s.rotation.y, 0, 'YXZ');
        // 倒れた時は共通の地に垂れた形へ着替え、風の振れも小さくする。
        if (d.down && d.downT >= 0.7 && !d.cloth.geometry.userData.moribeShape) {
          // 竿の両端だけでなく、布も地形へ沿わせる。倒れ切った時に一度だけ。
          layCloth(d.cloth);
        }
        dress(d.cloth, d.down);
        if (!d.down) {
          s.rotation.x = Math.max(-0.18, Math.min(0.18, s.rotation.x));
          s.rotation.z = Math.max(-0.1, Math.min(0.1, s.rotation.z));
        }
        // 近い布が視点と自分の間を塞ぐ時は、共通処理の非表示を保つ。
        if (d.down) d.cloth.visible = true;
      }
    }
  };
  const dispose = rt.dispose;
  rt.dispose = function () {
    for (const mat of owned) mat.dispose();
    for (const geo of draped) geo.dispose();
    return dispose.call(this);
  };
}

// 信長公記首巻「もりべ合戦」。三手の細かな位置・兵数は復元。龍興の後詰は置かない。
const MORIBE_JIN = [
  battleJin('三手の備え', 0, CAMP2, Math.PI, [
    ['mbShiba', '先手', '柴田勝家', 400, 8, 116, 'A', 'oda', 'kari'],
    ['mbMori', '左手', '森可成', 300, -52, 114, 'Y', 'oda', 'tsuru'],
    ['mbRight', '右手', '名は伝わらない', 200, 62, 116, 'R3', 'oda'],
    ['mbMain', '本備', '名は伝わらない', 300, -22, 126, 'B', 'oda'],
    ['mbNobu', '本陣', '織田信長', 300, CAMP2.x, CAMP2.z, 'odaCamp', 'eiraku', 'oda'],
  ], '織田千五百ほど。各手の割り振りは復元。'),
  battleJin('横に並ぶ備え', 1, { x: -34, z: -100 }, 0, [
    ['mbVan', '先手', '名は伝わらない', 1000, 16, -62, 'V', 'saito'],
    ['mbHibi', '本備東', '日比野下野守', 2000, -14, -76, 'M', 'saito'],
    ['mbNagai', '本備西', '長井甲斐守', 2000, -54, -78, 'N', 'saito'],
    ['mbReserveN', '西の控え', '名は伝わらない', 500, -44, -114, 'reserves.0', 'saito'],
    ['mbReserveM', '東の控え', '名は伝わらない', 500, 12, -138, 'reserves.1', 'saito'],
  ], '斎藤六千ほどとも。長井・日比野の控え。龍興本人の出陣は示さない。'),
];

// ついていく旗だけを高く大きく残し、ほかの味方の旗は小さく低くする（黄旗が何本もあって迷う。kaito 10/23）。
//   一秒に一度だけ見る。落ちた旗（場に置かれた旗）は共通の処理が元の大きさへ戻す。
function quietOtherFlags(rt, keep) {
  const F = rt.flags;
  if (rt.t < (F.flagQuietAt || 0)) return;
  F.flagQuietAt = rt.t + 1;
  const team = rt.player.u.team;
  for (const g of rt.army.groups) {
    if (g.team !== team || g.isPlayerSquad || !g.stds?.length) continue;
    const k = !keep || g === keep ? 1 : .55;
    for (const s of g.stds) if (s.parent && s.parent !== rt.scene && s.scale.x !== k) s.scale.setScalar(k);
  }
}

const F_autoAt = (rt) => rt.flags.autoOrderAt || 0;
const moribeFoeReady = (u, p) => u?.alive && u.hp > 0 && !u.gone && !u.dying && !u.downed && !u.rearWound && !u.fleeing && !u.woundOut &&
  !u.noTarget && !u.isStruct && !u.civ && u.team !== p.u.team && u.mesh?.visible !== false;
// 前に見える敵が無い時は、残り人数に数える隊の最寄りの一人（稲生の approachUnit と同じ考え）。
//   向き・見通しで外さず、ピンが画面の端からその方向を示す。選び直しは四分の一秒に一度。
const moribeRemainFoe = (u) => u?.alive && u.hp > 0 && !u.gone && !u.dying && !u.downed && !u.rearWound && !u.fleeing && !u.woundOut && !u.noTarget && !u.isStruct && !u.civ;
function moribeNearestFoe(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  if (rt.t < (F.remainAt || 0) && F.remainStage === F.stage && moribeRemainFoe(F.remainFoe)) return F.remainFoe;
  F.remainAt = rt.t + .25; F.remainStage = F.stage;
  let chosen = null, best = Infinity;
  const pick = (g) => {
    if (!g || gone(g)) return;
    for (const u of g.units) {
      if (!moribeRemainFoe(u)) continue;
      const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
      if (d < best) { best = d; chosen = u; }
    }
  };
  if (F.stage === 'contact' && !F.vBroken) pick(F.V);
  else for (const g of F.opposition || []) {
    if ((g === F.reserves?.[0] && !F.wave1) || (g === F.reserves?.[1] && !F.wave2) || (g.hatamoto && F.stage !== 'press')) continue;
    pick(g);
  }
  // 少しの前後では替えず、追う相手を保つ。
  const prev = F.remainFoe;
  if (chosen && prev !== chosen && moribeRemainFoe(prev) && (F.stage !== 'contact' || F.vBroken || prev.group === F.V)) {
    const dp = (prev.pos.x - p.x) ** 2 + (prev.pos.z - p.z) ** 2;
    if (Math.sqrt(best) + 3 >= Math.sqrt(dp)) chosen = prev;
  }
  F.remainFoe = chosen;
  return chosen;
}

const moribe = {
  missionStyle: 'ford', // 共通の印・ピン・カメラの型（field_signs・mission_pin・hud_map・player が読む。戦の名で分けない）
  compactIntro: true,
  noCouriers: true,  // 戦に加わらない伝令の騎馬は置かない（稲生と同じ。kaito 10/24「動かない味方と敵は一切排除」）。馬の分の記憶も空く。
  introName: '森部（もりべ）の戦い',
  introTaskFirst: true,
  introPeopleFolded: true,   // 横持ちでは下知を先に読み、人物紹介は自分で開く。
  // 操作は稲生で覚える。ここでは行き先と勝つための流れを伝える。
  introText: '浅瀬を渡り、向こう岸へ。',
  introSides: { a: '織田軍', b: '斎藤軍' },
  introPeople: [
    { id: 'moribe-oda', name: '織田信長（おだ のぶなが）', note: '味方の大将。大将は、兵たちをまとめる人。味方と一緒に戦おう。' },
    { id: 'moribe-nagai', name: '長井甲斐守（ながい かいのかみ）', note: '敵の大将の一人。まわりで守る敵の兵と一緒にいる。仲間と協力して倒す。' },
    { id: 'moribe-hibino', name: '日比野下野守（ひびの しもつけのかみ）', note: 'もう一人の敵の大将。長井と日比野と守る兵を倒したら、新しく出る黄色い印へ仲間と戻る。' },
  ],
  enemyTriangleSigns: true, // 森部の敵は頭上の赤い三角で見分ける。
  autoTargetCamera: true, // 稲生と同じく、近い敵への一撃は本人へ向き直る。
  steadyMeleeCamera: true, // 密集しても自分の立ち位置を画面内で保つ。
  noPlayerFoot: true, // 本人は姿で示す。別経路の白い足元輪も消し、倒れた隣の兵や行き先のピンと混同させない。
  nearbyAllySignLimit: 0, // 味方の頭上に白い小旗を出さない。追う旗はピン一本、敵は赤い印で分ける。
  noDodgeCard: true, // 矢の雨で「〜をむこう」「にげる」の札を出さない（kaito 10/23 稲生 4）。
  hideMissionDots: true, // 任務の段数は見出しにある。仲間の人数と紛れる五つの丸は出さない。
  missionSingleLine: true, // 右上は任務一行だけ。耐える進みは同じ一行の丸で示す。
  // 仲間の名札は一人だけ。密集しても五人分の文字を重ねない。
  missionAllyLabel: 'ついてくる仲間',
  missionContext: '永禄四年（一五六一）・森部（もりべ）の戦い',
  // 見出しは大きな出来事（討ち取り・勝ち負け・雨上がり・合図の火）だけ。行き先や構えの指示の見出しは出さない（kaito 10/23）。
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /討ち取|討死|勝|崩れ|城が開く|合図の火|雨が上がった|届かず|進めず/.test(t),
  // 右上の一行は「何をするか」だけ（kaito 10/23 49・50）。段の総称で通し、向き・行き先の字は書かない。
  missions: ['川を渡れ', '仲間を待て', '敵を倒せ', '生き延びろ', '日比野下野守を倒せ', '長井甲斐守を倒せ', '逃げる敵を追え', '仲間と集まれ'],
  // ピン・▼・名前は同じ本人へ。描画の間引きで相手を替えない。
  commanderTarget(rt) {
    const F = rt.flags;
    if (F.stage !== 'press' || F.pursuing || F.ending) return null;
    for (let i = 0; i < 2; i++) {
      const g = i === 0 ? F.HM : F.HN;
      if (!g) continue;
      for (const u of g.units) if (u.type === 'busho' && u.alive && u.hp > 0 && !u.gone && !u.dying && !u.downed && !u.rearWound &&
          !u.fleeing && !u.woundOut && !u.noTarget) return u;
    }
    return null;
  },
  namedGuideTarget(rt) { return this.commanderTarget(rt); },
  // 頭上の▼一つを大きくして、まず戦う相手を示す。選び直しは四分の一秒に一度。
  missionSignTarget(rt) {
    const F = rt.flags, p = rt.player;
    if (F.ending || F.stage === 'assemble' || F.stage === 'hold') return null;
    // 渡る間の目標は対岸のピンだけ。敵の所属を示す小さな▼は残す。
    if (!F.signal && !F.fordThreat) return null;
    // 討ち取りの段では、離れた一般兵へ印を乗り換えない。
    if (F.stage === 'press' && !F.pursuing) {
      const u = this.commanderTarget(rt);
      if (u) { F.signTarget = u; return u; }
    }
    // 当たった本人を一拍保つ。よろめいて間合いを出ても別人へ印を移さない。
    if (F.struckUntil > rt.t && moribeFoeReady(F.struckTarget, p)) return F.struckTarget;
    // 渡河中の所属の▼は残し、戦う一人の強調は開戦後か敵が迫った時だけにする。
    const vanguard = !F.signal || F.stage === 'contact' && !F.vBroken ? F.V : null;
    if (p.inRange && moribeFoeReady(p.rangeCueTarget, p) &&
        (!vanguard || p.rangeCueTarget.group === vanguard)) return p.rangeCueTarget;
    // 川岸の最初の相手は視点で選び直さない。振り向くたびに別の▼を追わせない。
    if (F.stage === 'contact' && !F.vBroken) {
      F.signTarget = moribeNearestFoe(rt);
      return F.signTarget;
    }
    if (rt.t < F.signTargetAt && F.signStage === F.stage && (moribeFoeReady(F.signTarget, p) || F.signTarget === F.remainFoe && moribeRemainFoe(F.signTarget)) &&
        (!vanguard || F.signTarget.group === vanguard)) return F.signTarget;
    F.signTargetAt = rt.t + .25; F.signStage = F.stage;
    let target = null, best = F.signal ? 48 * 48 : 80 * 80;
    for (const u of vanguard ? vanguard.units : rt.army.units) {
      if (!moribeFoeReady(u, p)) continue;
      // 最初の任務は川岸へ来た隊。奥の控えへ大きな▼を移さない。
      if (F.stage === 'contact' && !F.vBroken && u.group !== F.V) continue;
      const dx = u.pos.x - p.u.pos.x, dz = u.pos.z - p.u.pos.z;
      const yaw = p.yaw + (p.camYawOff || 0);
      if (dx * Math.sin(yaw) + dz * Math.cos(yaw) < 0) continue;
      const d = (dx * dx + dz * dz) * (u === F.signTarget ? .8 : 1);
      if (d >= best || !sightPoint(rt, u.pos)) continue;
      best = d; target = u;
    }
    // 前に見える敵が無ければ、残りの最寄りの一人へ。▼は見えた時に出て、見えない間はピンが向きを示す。
    if (!target && (F.stage === 'contact' || F.stage === 'press')) target = moribeNearestFoe(rt);
    F.signTarget = target;
    return target;
  },
  missionOf(rt) {
    const F = rt.flags;
    if (!F.signal) return F.pointReached ? 1 : 0;
    if (F.stage === 'contact') return F.vBroken ? 3 : 2;
    if (F.stage === 'hold') return 3;
    if (F.stage === 'assemble') return 7;
    if (F.pursuing) return 6;
    const boss = (g) => !gone(g) && g.units.some((u) => u.type === 'busho' && u.alive && !u.fleeing);
    if (boss(F.HM)) { revealName(rt, '日比野下野守'); return 4; }
    if (boss(F.HN)) { revealName(rt, '長井甲斐守'); return 5; }
    return 6;
  },
  missionHeading(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    // 渡河済みのコマから待機へ替える。集合判定の更新を待たせない。
    if (!F.signal && (F.pointReached || F.pointInside || playerAtFord(p, rt.world))) return F.fordThreat ? '敵を倒せ' : '仲間を待て';
    // 集まる間と、その場で耐える間を同じ一行で区別する。向き・距離は書かない。
    if (F.stage === 'assemble') {
      if (F.gatherUnit || Math.hypot(p.x - F.asm.x, p.z - F.asm.z) >= 12) return '仲間と集まれ';
      return '仲間を待て';
    }
    // 守る段は稲生と同じ一行。守る所はピン、味方はその左右へ寄る。
    if (F.stage === 'hold') return F.lineReturning ? '仲間と集まれ' : '敵を倒して耐えろ';
    if (F.squadGuide && Math.hypot(p.x - F.squadGuide.pos.x, p.z - F.squadGuide.pos.z) >= 16 ||
        !F.signal && F.pointReached && !F.pointInside ||
        (F.stage === 'hold' || F.stage === 'contact' && F.vBroken) && F.lineReturning)
      return '仲間と集まれ';
    // 討つ相手の名前は許された任務一行に収め、頭上に別の札を足さない。
    const commander = this.commanderTarget(rt);
    if (commander?.name) return `${commander.name}を倒せ`;
    return this.missions[this.missionOf(rt)];
  },
  minutes: 7,
  missionTimeLabel: '戦の残り目安',
  missionStatusFirst: (rt) => !rt.flags.signal && !rt.flags.pointDone,
  retreatMoveLabel: '印の方へ移動',
  missionAlly(rt) {
    return rt.flags.squadGuide || rt.squad.find((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut);
  },
  // 組への下知は自分で押させず、段に合わせて自ら出す（字の釦で分からせない。kaito 10/23）。
  //   号令の声と法螺・太鼓で伝わる。同じ号令の取り消しに当たらないよう五秒あける。
  autoSquadOrder(rt) {
    const action = this.squadOrderNeed(rt);
    if (!action || action.disabled || F_autoAt(rt) > rt.t) return;
    rt.flags.autoOrderAt = rt.t + 5;
    const selected = rt.player.selGroup;
    rt.player.selGroup = 'all';
    try { rt.player.command(action.command); } finally { rt.player.selGroup = selected; }
  },
  squadOrderNeed(rt) {
    const F = rt.flags;
    if (F.ending || rt.over || !rt.squadGroups.length) return null;
    let command = null;
    if (!F.signal && !F.pointDone) command = F.pointInside && F.pointReady ? 'hold' : 'follow';
    else if (F.stage === 'assemble' || F.stage === 'hold' && !F.lineReady || F.squadGuide) command = 'follow';
    else if ((F.stage === 'contact' || F.stage === 'press') && rt.squadGroups.some((g) => !gone(g) && g.order === 'hold')) command = 'follow';
    if (!command) return null;
    let active = false, pending = false, allOrdered = true;
    for (const g of rt.squadGroups) if (!gone(g)) {
      active = true;
      if (g.pending) pending = true;
      if (g.order !== command) allOrdered = false;
    }
    // 伝達済みの命令を押せないボタンにせず、待つ理由は任務の文で伝える。
    if (!active || allOrdered && !pending) return null;
    const action = F.missionAction || (F.missionAction = {});
    action.command = command;
    action.disabled = pending;
    action.label = pending ? command === 'hold' ? '止まる合図を伝えている' : 'ついてくる合図を伝えている' : command === 'hold' ? 'ここで仲間を待たせる' : F.signal && (F.stage === 'contact' || F.stage === 'press') ? '仲間と進む' : '仲間を呼ぶ';
    return action;
  },
  // 右上はミッションの一行だけ。距離・向き・操作の字を見出しに出さない（kaito 10/23 49・50）。
  autoTreatment: true, // 味方に守られて足を止めると、三秒かけて布を巻く。
  meleeHitFeedback: false, // 命中は本人の赤い▼とよろめきで示し、照準の印を重ねない。
  missionStatus() { return ''; }, // 行き先は黄色い矢印と輪だけで示す。
  tacticsCommandText: '', // 横へ回る助言に、操作のない「配下に命じて押せ」を足さない。
  // 傷と討ち取りは本人の▼で示し、意味の重なる黄色い棒を出さない。
  missionCombatProgress() { return null; },
  missionWaitProgress(rt) {
    const F = rt.flags;
    if (!F.signal && F.pointInside && !F.pointDone) {
      const arrivedAt = F.fordArrivedAt ?? rt.t;
      // 仲間が足止めされても、開戦までの待ちの上限に合わせて丸を満たす。
      return F.pointReady ? 1 : Math.min(.99, Math.max(F.fordGatherProgress || 0,
        (rt.t - arrivedAt) / Math.max(1, (F.fordWaitEnd ?? arrivedAt + 8) - arrivedAt)));
    }
    if (F.stage === 'assemble' && !F.gatherUnit && Math.hypot(rt.player.u.pos.x - F.asm.x, rt.player.u.pos.z - F.asm.z) < 12)
      return Math.min(1, (F.assembleT || 0) / 8);
    if (F.stage === 'hold') {
      const elapsed = Math.max(0, rt.t - F.holdStart);
      // 必ず終わる百秒の時計。働きの割合を混ぜて途中で止まる見せ方にしない。
      // 反撃が早まった場合は段の切り替えで完了する。
      return Math.min(.99, elapsed / 100);
    }
    return null;
  },
  // 任務の到着判定と同じ位置・半径。入れ物と既存の隊の中心を使い回す。
  missionPin(rt) {
    const F = rt.flags, q = F.moribePin, p = rt.player;
    if (!q || F.ending || rt.over) return null;
    // 人を追う印と地面の小旗を区別し、段が変わったら追う相手を消す。
    q.unit = null; q.enemy = false; q.approach = false; q.gatherArea = false;
    // 着いた後の足元や画面端へ、移動を促す印を残さない。
    q.waiting = false; q.arrived = false; q.crossing = false; q.progress = 0; q.guardArea = false; q.waitDuration = 0;
    let pos = null, r = 6, hide = 6;
    // 開戦したら渡河のピンを残さず、頭上の▼へ切り替える。
    // 先手の中心の空地でなく、頭上の▼と同じ生きた一人へ導く。
    // 本人と▼が見えたらピンを畳む。まだ描いていない時や画面外では同じ一本を保つ。
    if (F.signal && (F.stage === 'contact' && !F.vBroken || F.stage === 'press') && !F.squadGuide) {
      const enemy = this.missionSignTarget(rt);
      // 間合いにいても画面外なら行き先を残す。見える本人の▼へ渡す時だけ消す。
      if (!enemy) return null;
      // 姿と頭上の▼が見えたら、地面の黄色いピンは消す。
      if (Math.hypot(enemy.pos.x - p.u.pos.x, enemy.pos.z - p.u.pos.z) <= 40 &&
          inouSignVisible(rt, enemy) && sightScreenUnit(rt, enemy)) return null;
      const distance = Math.hypot(enemy.pos.x - p.u.pos.x, enemy.pos.z - p.u.pos.z);
      const remaining = Math.max(0, distance - (p.weapon === 'sword' ? 1.9 : 2.8));
      if (F.pinApproachKey !== enemy) {
        F.pinApproachKey = enemy; F.pinApproachStart = Math.max(1, remaining);
      }
      q.unit = enemy; q.enemy = true; q.approach = true;
      q.crossing = true;
      q.progress = Math.min(.98, Math.max(0, 1 - remaining / F.pinApproachStart));
      q.x = enemy.pos.x; q.z = enemy.pos.z;
      q.y = drawGroundAt(rt.world, q.x, q.z);
      q.r = q.hide = 0;
      return q;
    }
    if (!F.signal) {
      if (F.pointDone) return null;
      pos = POINT2; r = FORD_R; hide = 0;
      // 上陸したら同じ地点の待機へ替え、追う必要のないチェック印を挟まない。
      q.arrived = !!(F.pointReached || F.pointInside || playerAtFord(rt.player.u.pos, rt.world));
      q.waiting = q.arrived;
      q.crossing = !q.waiting;
      q.waitDuration = q.arrived ? Math.max(1, (F.fordWaitEnd ?? rt.t + 8) - (F.fordArrivedAt ?? rt.t)) : 0;
      // 上陸は満杯、仲間待ちは扇形。到着前の歩みと待ち時間を混ぜない。
      q.progress = q.arrived ? q.waiting ? this.missionWaitProgress(rt) || 0 : 1 :
        // 横へずれても岸へ渡った分を示す。到着前は満杯にしない。
        Math.max(0, Math.min(.98, (START2.z - rt.player.u.pos.z) / (START2.z - POINT2.z)));
      // 渡河後も対岸の同じ地点。仲間の頭へ移して敵の▼と混同させず、後続の兵を追って川へ戻らせない。
    } else if (F.stage === 'hold') {
      // 守る地点と終わるまでの進みを、到着後も同じピン一本に残す。
      // 守備は動く仲間を追わせず、到着判定と同じ固定地点一本へ集める。
      pos = F.linePoint; r = hide = F.lineReturning || !F.lineReached ? 18 : 24;
      q.guardArea = true;
      q.gatherArea = true;
      q.waitDuration = 100;
      q.waiting = true; q.arrived = !F.lineReturning;
      q.progress = this.missionWaitProgress(rt) || 0;
    } else if (F.squadGuide) {
      pos = F.squadGuide.pos; r = hide = 16;
      q.gatherArea = true;
    } else if (F.stage === 'assemble') {
      pos = F.gatherUnit ? F.gatherUnit.pos : F.asm;
      r = hide = F.gatherUnit ? 6 : 12;
      q.gatherArea = true;
      // 集結地点へ着いたら歩き直させず、同じピンの中で帰着を待つ。
      q.waiting = !F.gatherUnit;
      q.arrived = q.waiting && Math.hypot(rt.player.u.pos.x - pos.x, rt.player.u.pos.z - pos.z) < r;
      q.progress = q.arrived ? Math.min(1, (F.assembleT || 0) / 8) : 0;
    } else if (F.vBroken) {
      if (!F.lineReturning) return null;
      pos = F.linePoint;
      r = hide = 18;
      q.gatherArea = true;
    } else if (!gone(F.V)) {
      // 「斎藤の先手を崩す」の間は、その先手の真ん中へ。味方の旗を指すと、どれが先手か分からない（初めての人の迷い）。
      pos = fightingCenter(F.V); r = 6; hide = 8;
    } else {
      pos = !gone(F.A) ? flagPos(F.A) : !gone(F.B) ? flagPos(F.B) : null;
      r = hide = 10;
    }
    if (!pos) return null;
    // 川と集合で同じ穴を満たす。中心ではなく実際の合流半径までを残りとする。
    // 守る場所へ戻る間も時間は進む。同じピンに時間を残し、歩いた量へ替えない。
    if (F.signal && !q.arrived && F.stage !== 'hold') {
      const key = F.squadGuide || F.gatherUnit || pos;
      const remaining = Math.max(0, Math.hypot(rt.player.u.pos.x - pos.x, rt.player.u.pos.z - pos.z) - r);
      if (F.pinApproachKey !== key) {
        F.pinApproachKey = key; F.pinApproachStart = Math.max(1, remaining);
      }
      q.crossing = true;
      q.progress = Math.min(.98, Math.max(0, 1 - remaining / F.pinApproachStart));
    }
    q.x = pos.x; q.z = pos.z; q.r = r; q.hide = hide;
    // 対岸は確定済みの高さ、ほかの地点も見えている土に先端を置く。
    q.y = q.unit ? q.unit.pos.y + (q.unit.mounted ? 3.2 : 2.4) : pos === POINT2 ? POINT2.y : drawGroundAt(rt.world, pos.x, pos.z);
    return q;
  },
  keepCombatTaskHeading: true,   // 敵一人への押し方で、組を率いる任務の見出しを消さない。
  // 敵一人の間合いより、組をそろえる下知と旗への移動を優先する。
  meleeApproachText(rt) {
    const F = rt.flags;
    if (F.squadGuide) return '離れた仲間の印へ戻れ';
    if (F.stage === 'assemble') return '追わず、戻る印へ集まれ';
    if (!F.signal) return '川を渡り、仲間を待て';
    if (F.stage === 'hold') return F.lineReady ? '仲間とこの場の敵を迎え撃て' : '印へ仲間と集まれ';
    return '味方と並び、敵へ槍を向けよ';
  },
  hideApproachAction: true,   // 接近中は組の任務を一度だけ出し、攻撃・向き直りの操作は残す。
  keepApproachTaskPanel: true,   // 敵へ寄る別の旗印と道筋を、組の行き先に重ねない。
  meleeApproachLabel(rt) {
    const F = rt.flags;
    if (!F.signal) return rt.objectives.find((o) => o.id === 'point' && !o.state)?.text || '川を渡った所で、合図を待て';
    if (F.squadGuide || F.stage === 'assemble' && F.gatherUnit) return '仲間のそばへ';
    if (F.stage === 'assemble') return Math.hypot(rt.player.u.pos.x - F.asm.x, rt.player.u.pos.z - F.asm.z) < 12 ? '仲間とここで川への道を守れ' : '戻る印へ仲間と集まれ';
    if (F.stage === 'hold') return F.lineReady ? '仲間とこの場の敵を迎え撃て' : '印へ仲間と集まれ';
    return '味方と並び、敵へ進め';
  },
  compactFieldGuides: true,   // 敵の姿を太い人型と大矢印で覆わず、頭の脇の小さな印で示す。
  compactCombatGuides: true,   // 森部だけ、相手の印と足元の向きを小さくし、槍の動きを見せる。
  subtleTargetFrames: true,
  cornerEnemyGuide: true,   // 描画側で使う指定。相手の手足を隠す太い箱を、細い四隅へ替える。
  playerFootSignOnly: true,   // 本人も別経路の白い人型で囲まず、肩越しの具足と槍を見せる。
  teamSignsOnly: true,   // 白い人型で具足を覆わず、頭上の印で示す。見やすさ優先の設定は残す。
  compactHoldGuide: true,
  smallTaskAreas: true,   // 渡河後の待機・退避も足元の小さな印へ。十歩以上の白い弧で槍列を覆わない。
  compactDestinationSign: true,   // 携帯の乱戦でも旗への案内で兵の胴を覆わない。
  routeGuideArrowOnly: true,
  destinationPointerScale: 0.65,
  footFlagGuides: true,   // 頭上へ持ち上げた旗と長い結び線を、実旗の足元の小印へ戻す。
  quietCombatCues: true,   // 危険の向きは端の小さい合図へ。予告の時刻と防御の判定は保つ。
  groundFlagGuides: true,   // 実物の幟を縦の輪で囲まず、足元の旗印だけで行き先を示す。
  compactFlagGuide: true,   // 布全体の囲みと頭上の印を重ねず、根元の案内へそろえる。
  compactGroundGoalRing: true,   // 小さい輪の指定を最小半径で打ち消さず、兵の脚を空ける。
  compactGuardPostRing: true,   // 守る場所も同じ小さな輪にし、強調用の太線へ戻さない。
  smallFlagAvoidNotices: true,   // 行き先の印は任務札と命の帯に重ねない。
  subtleGroundGuides: true,
  compactFloorGuides: true,
  compactDestinationArea: true,
  compactDodgeGuide: true,   // 回避先も同じ小さい輪にし、目前の騎手を覆わない。
  groundCombatMarkers: true,
  groundLockRing: true,
  keepOpeningTaskLabel: true,   // 待つ場所を示す間も、組を連れて渡る下知を残す。
  keepWaitOrderLabel: true,
  // 横持ちでも、川を渡る下知と組をそろえる下知を残す。
  waitTravelLabel(rt) {
    return rt.def.waitOrderLabel(rt);
  },
  guardTravelLabel(rt) {
    return rt.def.travelGuideLabel(rt);
  },
  waitOrderLabel(rt) {
    // 到着後も、組を呼ぶ・列を止める下知を残す。
    return rt.objectives.find((o) => o.id === 'point' && !o.state)?.text || '川を渡った所で、合図を待て';
  },
  waitGuardAllowed: () => false,   // 操作を教える臨時の札は出さず、通常の構えを使う。
  waitGuardButtonText: '構えて防ぐ',
  compactWaitGuard: true,   // 横持ちでは短い長押しの文を使い、指の下の釦は端に固定する。
  guardStartText: '一撃を ふせぐ',
  guardWaitText: '一撃を ふせぐ',
  releaseGuardForAttack: true,   // 打ち終わりは長押しの構えを解き、既存の反撃案内へ渡す。
  attackOpening(rt, enemy) {
    const P = rt.player, u = P.u, F = rt.flags;
    if (!F.signal || F.ending || F.stage === 'assemble' || !enemy?.alive || enemy.team === u.team ||
        enemy.gone || enemy.fleeing || enemy.woundOut || enemy.noTarget || enemy.invuln ||
        enemy.atk || enemy.swing && !enemy.swing.done ||
        Math.abs(enemy.pos.y - u.pos.y) > 1.5 ||
        Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) > P.meleeReach(P.weapon === 'sword' ? 'slash' : 'thrust') ||
        rt.army.wallBetween(u.pos, -1, enemy.pos)) return false;
    // 正面の敵にすきがあっても、別の槍が本人へ打ち込む間は防ぐ。
    for (const e of rt.army.units) {
      if (!e.alive || e.team === u.team || e.gone || e.fleeing || e.woundOut || e.noTarget) continue;
      if ((e.atk?.target === u || e.swing?.target === u && !e.swing.done) &&
          Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 4.5 &&
          !rt.army.wallBetween(u.pos, -1, e.pos)) return false;
    }
    return true;
  },
  treatmentTaskGuidance: true,
  // 浅い一撃ごとに前進と退避を往復させない。危険時の退避・手当ては残す。
  damageRetreatNeeded: (rt) => !!rt.flags.retreatMarked || rt.player.u.hp < rt.player.u.maxHp * .3 ||
    rt.player.u.wounds?.bleed > .0001 || !!rt.player.u.mobbed || rt.player.sta < 20,
  woundEffectMin: 0.05,   // 浅い傷は部位だけ。退く必要は深手・包囲などの案内で伝える。
  woundEffectText: (_rt, slow) => slow ? '足のけが・歩みが遅い' : '腕のけが・突きが弱い',
  guardButtonText: '構える',
  guardButtonHelp: '印の敵の一撃を防ぐ',
  nobiki: true,   // 共通の終幕で、退きの法螺貝と二つ打ちの退き太鼓を一度だけ鳴らす。
  jinkei: MORIBE_JIN,
  // 目前の騎馬と、視点へ食い込む徒歩の肩を避ける。戦う間合いは変えない。
  clampCamera(rt, pos) {
    const p = rt.player, u = p.u;
    const v = rt.flags.moribeRiderView || (rt.flags.moribeRiderView = { at: -1, last: rt.t, gx: 0, gz: 0, x: 0, z: 0 });
    const dt = Math.max(0, Math.min(0.1, rt.t - v.last)); v.last = rt.t;
    if (!u.alive || rt.over || p.fpK > 0.3 || p.aiming || p.overHold || p.cmdOpen || p.radial) {
      v.gx = v.gz = v.x = v.z = 0; v.at = -1; return;
    }
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    if (rt.t >= v.at) {
      v.at = rt.t + 0.15; v.gx = v.gz = 0;
      let strongest = 0;
      for (const o of rt.army.units) {
        if (!o.alive || o === u || o.isStruct || o.woundOut || o.gone) continue;
        const ux = o.pos.x - u.pos.x, uz = o.pos.z - u.pos.z;
        if (ux * ux + uz * uz > 64) continue;
        const dx = o.pos.x - pos.x, dz = o.pos.z - pos.z, d = Math.hypot(dx, dz);
        const radius = o.mounted ? 4.8 : 1.5;
        if (d >= radius || Math.abs(o.pos.y + (o.mounted ? 3 : 1.4) - pos.y) > (o.mounted ? 2.5 : 1)) continue;
        // 離れた後ろの馬では動かさない。すぐ横へ食い込む馬は向きを問わず避ける。
        if (d > 2.8 && dx * fx + dz * fz < d * 0.55) continue;
        const pull = Math.min(o.mounted ? 2.2 : 0.7, (radius - d) * 0.65);
        if (pull <= strongest) continue;
        strongest = pull;
        // 後ろへ一律に引くと、視点の後方や横の騎馬へ逆に食い込む。
        v.gx = d > 0.01 ? -dx / d * pull : -fx * pull;
        v.gz = d > 0.01 ? -dz / d * pull : -fz * pull;
      }
    }
    const k = Math.min(1, dt * (v.gx || v.gz ? 6 : 2.5));
    v.x += (v.gx - v.x) * k; v.z += (v.gz - v.z) * k;
    pos.x += v.x; pos.z += v.z;
  },
  // 今の任務と同じ印へ案内する。先手を退けた後は味方、反撃では敵の大将。
  guideMarker(rt) {
    const F = rt.flags;
    if (F.ending || rt.over) return null;
    if (!F.signal) return F.pointDone ? null : 'point';
    if (F.squadGuide) return 'squadReturn';
    if (F.stage === 'contact' && !F.vBroken) return null;
    if (F.stage === 'press') return F.marked && !gone(F.marked) ? 'commanders' : null;
    if (F.stage === 'contact' && F.vBroken) return 'support';
    return F.stage === 'assemble' ? F.gatherUnit ? 'gatherSquad' : 'assemble' : F.stage === 'hold' ? 'line' : 'frontFlag';
  },
  namedGuideMarkers: true,
  travelGuideLabel(rt) {
    const F = rt.flags;
    if (!F.signal) return rt.def.waitOrderLabel(rt);
    if (F.squadGuide || F.stage === 'assemble' && F.gatherUnit) return '仲間のそばへ';
    if (F.stage === 'assemble') return Math.hypot(rt.player.u.pos.x - F.asm.x, rt.player.u.pos.z - F.asm.z) < 12 ? '仲間とここで川への道を守れ' : '戻る印へ仲間と集まれ';
    if (F.stage === 'press') return F.pursuing ? '逃げる敵を追う' : F.marked ? '味方と進み、敵の印へ' : '仲間と待て';
    if (F.stage === 'contact' && F.vBroken) return '印へ仲間と集まれ';
    return F.stage === 'hold' ? F.lineReady ? '仲間とこの場の敵を迎え撃て' : '印へ仲間と集まれ' : '味方と進み、赤い三角の兵と戦え';
  },
  noticeLimit: 2,
  immediateTaskChanges: true,   // 渡り終えたら、その場の集結・防御の下知へすぐ替える。
  keepTaskLabel: true,   // 近い敵の印で、組の集結や槍列を守る下知を「敵をたおせ」に替えない。
  keepGuardTaskLabel: true,   // 反撃できる時も、組の下知を敵一人の頭上へ移さない。
  keepDestinationTask: true,   // 集結への帰着も本備への前進も、同じ「旗へすすめ」に省かない。
  hideGuideSteps: true,   // 歩数で下知を置き換えず、黄色い矢印で行き先を示す。
  keepCombatTask: true,   // 到着した人数・待つ理由を、戦っている間も任務に残す。
  keepTaskWithGuard: true,   // 携帯の「ふせぐ」が出ても、組の持ち場と進む下知を残す。
  keepRetreatReason: true,   // 「ここへ」に省かず、息切れや包囲など退く理由を見出しに残す。
  keepWoundRetreatReason: true,   // 出血時も、下がる理由と手当ての下知を残す。
  treatmentApproachLabel: '手当ての印へ下がれ',
  coverGuideLabel: '矢を避けて、物かげへ',
  coverGuideTouchLabel: '長押しで物かげへ移動',
  coverGuideHeldText: '物かげへ移動中\n指を離すと止まる',
  shortRetreatArrow: true,   // 画面外の味方へ退く印は端の短い矢印にし、槍の間合いを横切らない。
  swipeArrowLength: 48,   // 足元から旗まで兵を横断する線を引かず、進む向きだけを短く示す。
  guideArrowLength: 48,   // 待機・退避の別経路も同じ長さにそろえる。
  spacedCombatCues: true,
  staminaLabel: '自分の気力',   // 敵の顔に重なった輪を、敵の残り気力と取り違えない。
  // 息切れと負傷を区別する。敵が退いたという下知と「逃げろ」を並べない。
  // 危険の判定・退き先・回復の条件は共通の処理を保つ。
  retreatGuideLabel(rt, reached) {
    const u = rt.player.u;
    if (u.hp < u.maxHp * 0.3)
      return reached ? '味方のそばで構えよ' : '深手だ。味方へ下がれ';
    if (u.mobbed) return reached ? '味方と敵へ構えよ' : '囲まれた。味方へ下がれ';
    if (rt.player.sta < 20) return reached ? 'ここで息を整えよ' : '息切れ。味方へ下がれ';
    if (rt.flags.retreatMarked)
      return reached ? '味方と敵へ構えよ' : '味方のそばで立て直せ';
    if (u.wounds?.bleed > .0001)
      return reached ? '味方のそばで手当てせよ' : '血が出ている。味方の後ろへ';
    if (rt.t < (rt.retreatUntil || 0))
      return reached ? '味方と敵へ構えよ' : '一撃を受けた。味方の後ろへ';
    return reached ? '味方と敵へ構えよ' : '味方の列へ下がれ';
  },
  distanceUnit: 'steps',   // 旗へ結ぶ札と戦う相手の案内も、畦への道と同じ歩数にそろえる。
  edgeDestinationCaption: (_rt, marker, distance) => `${marker.id === 'point' ? '川の向こうの印' : (marker.id === 'squadReturn' || marker.id === 'gatherSquad') ? '仲間' : marker.id === 'commanders' ? '敵の印' : '味方の旗'}まで あと${Math.max(1, Math.ceil(distance / 0.75))}歩`,
  distanceText(rt, distance) {
    const id = rt.missionGuide?.marker?.id;
    // 輪の中心までの距離ではなく、列の確認が始まる縁までを示す。
    if (id === 'point') return rt.flags.pointInside ? '川の向こうの印に到着' : `印まで あと${Math.max(1, Math.ceil((distance - 10) / 0.75))}歩`;
    return distance < 3 ? 'すぐ近く' : `あと${Math.ceil(distance / 0.75)}歩`;
  },
  // 体は視線を遮る時だけ避ける。横の笠は透かさず、長柄だけ共通処理で避ける。
  nearAllyFadeRadius: 3.8,
  nearAllyFadeLevel: 1,
  nearAllyHorseFade: true,
  nearFlagFadeRadius: 6,   // 布の端が手前へ張り出す大きな幟も、描く間だけ竿ごと避ける。
  nearSpearFade: false,   // 横の味方の槍を短く透かさず、視線を塞ぐ長柄だけ避ける。
  nearSpearBatchRadius: 18,   // 手前で避けた槍を、更新時の別の束に残さない。
  nearLongWeaponRadius: 3.2,   // 手前の長柄・竿を避け、乱戦でも敵の肩と槍先を見せる。
  keepPlayerWeapon: true,   // 自分の槍は残し、どこへ構えているか見せる。
  avoidWaymarkThreats: true,   // 危険の札で、前備へ向かう印の名を隠さない。
  actionableThreats: true,   // 敵の向きだけでなく、構える下知も一行で示す。
  compactThreats: true,   // 携帯横でも長い危険札で槍列と旗を隠さない。
  compactThreatAction: () => '構えて防げ',   // 危険が迫ったその場で、今の設定に合う防御の押し方を示す。
  rearThreatFrame: true,   // 振り向いた視点から見た敵の向きを示す。
  rearAdviceView: true,   // 後ろを見る視点でも、警告の左右・前後を見えている向きへ合わせる。
  largeWaymarks: true,   // 雨の川向こうでも、向かう印とその名を読めるようにする。
  treatmentCrossSign: true,   // その場の手当ては十字印。集結先の旗と取り違えさせない。
  foeHit: 1,
  // 重なる槍の傷を共通の仕組みで間引く。満タンの傷枠でも、
  // 体力九十二から近接だけで倒れるまで六十秒以上（厳しい戦は従来どおり）。
  meleeGrace: { rate: 0.009, burst: 0.08, interval: 1.2 },
  learningFight: false,   // 初陣用の傷の軽減は、この槍戦に持ち込まない。
  noReserve: true,   // 台本の控え以外に、共通の新手を追加しない。
  noWake: true,   // 予告のない新手を増やさず、開戦時に置いた控えを前へ出す。
  lordHata: { spear: 36 },   // 信長で遊ぶ時も槍の供にし、兵の枠を守る。
  noTaisho: true,   // 両将を討っても一瞬で終わらず、戦場を固める。
  allyReports: false,   // 味方の様子は源八の怒鳴り声と旗で伝える。小地図の番号の読み上げは出さない。
  battleVoices: { lines: { enemy: {
    ambient: ['織田勢が川を渡ったぞ。槍をそろえよ', '長井様と日比野様の旗を守れ', '城へ退く道を塞がせるな'],
  } } },
  // 身の回りの当時の場（timeslip_field.js）。永禄四年五月十四日は今の六月末・梅雨の雨。
  // 楡俣川を渡った岸はぬかるみ、岸には葦が茂る。槍を合わせた森部の野ほど、倒れた槍と斎藤方の旗が多い。
  timeslip: {
    wet: 0.9, dust: 0.1, trample: 0.3, debris: 1, arrows: 0.5, reeds: 0.9,
    grass: 0x93a862, grassTints: [0xffffff, 0xeef2d4, 0xd8e0b0], grassH: 0.65, tallGrass: 0.35,
    flagColors: [0xe2ded2, 0x2a2826, 0x3a4a6a],
    fights: [[FRONT2.x, FRONT2.z, 36], [ASSEMBLY2.x, ASSEMBLY2.z, 26], [POINT2.x, POINT2.z, 22], [YAKUSHI2.x, YAKUSHI2.z, 24]],
  },
  // 稲生の標準（kaito 10/23）：小地図・足元の輪・浮かぶ字の札を出さず、行き先のピン・敵の頭上の▼・右上の任務一行に絞る。
  noControlsHelp: true,   // 操作の字は尾張の戦で覚える。この戦では出さない
  noFieldMap: true,
  hideArmyPeek: true,
  foeMarks: true,
  missionPinCaption: '',
  spawn: { x: START2.x, z: START2.z, heading: Math.PI },
  // 信長で遊ぶ時は前へ出た所から始め、後方からの長い行軍で任務を止めない。
  lordSpawn: { x: POINT2.x + 4, z: POINT2.z + 4, heading: Math.PI },
  lordAt: { x: POINT2.x, z: POINT2.z, r: 24, why: '渡河後の槍組のそば（前へ出た位置は復元）' },
  world: {
    seed: 21,
    namedKacchu: MORIBE_KACCHU,
    variedInfantry: true,
    variedLoanArmor: true,
    variedHeadgear: true,   // 共通の六組の装備・補修跡を使い、兵数と強さは保つ。
    longHoro: 'round',   // 使番の背は既存の籠と布の丸い形を使い、細長い板に見せない。
    // 肩の小さな布印で、背の旗が隠れる乱戦でも味方を見分ける（色と採用は復元）。
    allyShoulderMark: 0xc4b895,
    clothFolds: true,   // 置き幟の竿へ通す乳と、布のひだ。
    noticeRepeatGap: 32,   // 同じ知らせは三十秒以内に繰り返さない。
    groundHalf: FIELD2,
    keepTerrainGrid: true,   // 画質「低」も足元と同じ格子を描く。粗い別格子では面の高さが再びずれる。
    terrainTriangles: true,   // 足元を描画する三角形の面へそろえ、粗い升目の起伏で浮かせない。
    wholeInfantrySilhouette: true,   // 軽い姿へ戻る遠さでも脚を残し、胴や笠だけを浮かせない。
    completeCrowdLegs: true,   // 骨入りの遠目の姿にも袴と脛の布を残し、具足の間を空洞にしない。
    drawTimeUnitParts: true,   // 骨と具足の逆行列を描く時にそろえ、槍も持ち主と同じ束で描く。
    movingHiddenBones: true,   // 画面外でも移動した兵の骨をそろえ、手足や具足を前の場所へ残さない。
    fullTipMatrices: true,   // 遠い兵も手首と指を同時に移し、槍の手元を体につなぐ。
    contactShadows: true,   // 近い兵の足元に既存の薄い影を使い、曇天でも地面との接点を示す。
    meleeGroundedFeet: true,   // 近景の既存十八人枠で、押し合いと突き戻しの足を地面へそろえる。
    infantryWeight: true,   // 同じ接地枠で膝・腰・胸へ荷重を渡し、受ける脚を兵ごとに替える。
    moveLim: FIELD2 - 4,
    time: 'storm',
    // 西から吹き付ける嵐。長さを一より大きくして雨の筋を斜めに倒す（旗と葦も同じ風下へ）。
    rainDir: [1.7, 0.45],
    rainOpacity: 0.55,   // 嵐の斜めの雨の筋を25秒の画面で読ませる（細い線のまま・数は同じ。10/28）
    naturalArrowRain: true,   // 遠矢を太い黒い短冊にせず、雨の見通しに合わせる。
    // 嵐の昼は雲越しの柔らかい光。くっきりした日の影は出さない（晴れの野に見えていた。10/28）
    stormLight: { sunI: 1.0, hemiI: 1.6, sunPos: [-65, 85, 40],
      // 嵐の空は低く暗い雲。地平の霞は少しだけ明るく残し、遠い兵の影を読ませる。
      sky: 0x55606a, top: 0x232c33, fog: 0x6c7677, cover: 1,
      hemiSky: 0xb7c6ca, hemiGround: 0x514735 },   // 雲越しの斜光と土の照り返し。兵の見通しは同じ。
    unitCloudFill: .55,   // 共通の近景補光で、黒漆の胴・袖・威糸へ雲の柔らかな光を回す。
    closeCombatAssist: true,   // 初めて組を預かる槍戦の、近い相手への向き直り。
    allyPersonalSpace: 1.6,   // 自分の六歩以内で肩と長柄の重なりを減らし、相手の振りとよろめきを見せる。
    playerMeleeFloor: 1 / 3,   // 無名の足軽は、三歩以内で三度当てれば倒れる。
    muddy: 0.5,
    patchyGround: true,   // 草の株と地肌を同じ不規則な群落へそろえる。
    nearGrassClumpBase: .025,
    nearGrassClumpGain: 1.8,   // 株の総枠は保ち、裸地と根の残る群落を分ける。
    wetFieldRuts: 'wear',   // 通った帯の踏み跡から濡れと溝を出す。野一面に平行な溝を敷かない。
    trampledField: [8, 8, 48, 62],   // 中心と半幅。会戦帯は田の薄い水膜より泥と根を見せる。川・両翼の田・足場は保つ。
    alluvialRocks: true,   // 野の礫は小さく丸め、泥へ埋める。大岩の板を敷き詰めない。
    rockDrawGround: true,
    rockCenterGround: true,
    curvedRockTufts: true,
    litRockTufts: true,
    grassMix(x, z, pd) {
      const front = Math.max(0, 1 - Math.abs(x - 8) / 85)
        * Math.max(0, 1 - Math.abs(z - 4) / 78);
      const patch = tuftClumpAt(x, z);
      // 群落の芯には根を残す。会戦帯全体の草を三重に削らず、通った場所だけ倒す。
      return THREE.MathUtils.smoothstep(pd, 0.7, 3.8) * (0.72 + patch * .24 - front * .32);
    },
    softEarthCrust: true,   // 乾いた土塊の陰を升の境で切らず、泥の野を敷石に見せない。
    sparseEarthCrust: true,   // 雨の裸地には土塊をまばらに残す。
    softPathSoil: true,   // 畦道の土と草を連続して混ぜる。足場の高さは変えない。
    subtleMudRelief: true,   // 泥の窪みは踏まれた帯に薄く散らし、野一面を丸い穴で埋めない。
    churnedMud: true,   // 既存の濡れた圧痕を深め、踏まれた土の縁と窪みで照りを分ける。
    livingSpearHedge: true,   // 槍衾でも息と押される力で手元が小さく動く。
    steadyHorseReactions: true,   // 泥の槍列では踏みとどまる。驚くたびに人馬ごと宙へ跳ばさない。
    rearSpearSupport: true,   // 近い後列は、打ち合う前列の笠の上へ槍を送る。密着・行軍中は立てる。
    groundedFallImpact: true,   // 討たれた瞬間でなく、体が地を打った時に音と泥を出す。
    wetEarthBursts: true,   // 雨の土は白い埃にせず、低く重い泥粒にする。
    groundedFalls: true,   // 亡骸に沿って槍を寝かせ、横倒しの胴の厚みも支える。
    settleSideFalls: true,   // 横倒しの途中の前傾を戻し、胴を地へ寝かせる。
    settleFallenLimbs: true,   // 倒れ終わると、浮いた手足も泥へ下ろす。
    crumpledFlags: true,   // 落ちた指物は縮んだ布として泥の上へ伏せる。
    ordinaryFlagStride: 4,   // 無名の長柄足軽は四人に一本。組の旗・隊旗・武将の旗は残す（割合は復元）。
    waterSlow: true,
    // 杭の間の徒歩だけは流れに足を取られすぎない。馬と深い川の減速は保つ。
    fordWalkSpeed: (x, z) => Math.abs(x - START2.x) <= 6 && Math.abs(z - nireZ(x)) <= 12 ? .82 : 0,
    riverCross: true,   // 深い長良川を徒歩で素通りしない。南の楡俣川は腿ほどの深さで渡る。
    paths: [ROAD2, ...PEOPLE_PATHS2],
    height(x, z) {
      const b = 1.4 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 0.9 * Math.sin(x * 0.07 + z * 0.05) + 1.2 * gauss(x, z, 130, 60, 3000) + 1 * gauss(x, z, -130, -90, 3200) + 2 * gauss(x, z, 58, -8, 300) + 0.9 * Math.exp(-((x - NAGARA2) ** 2) / 1500) + 0.7 * Math.exp(-((x + 70) ** 2) / 50);   // 自然堤防（川筋の微高地）
      // 楡俣川の両岸に低い土手（自然堤防）。田の水と川面を分け、川筋として読めるようにする。
      const dz = Math.abs(z - nireZ(x));
      // 広い野の地形は約十一歩刻み。渡る所を平らにし、細い水面が起伏に埋もれないようにする。
      const ford = Math.max(0, Math.min(1, (160 - Math.abs(x)) / 30)) * Math.max(0, Math.min(1, (30 - dz) / 12));
      const h = moribeHeight(x, z, b);
      return h + (0.2 - h) * ford + (x < NAGARA2 - 40 ? 0.5 * Math.exp(-((dz - 12) ** 2) / 36) : 0);
    },
    tint(x, z, h, c) {
      // 渡河後に両軍が踏んだ会戦帯。川や田はそれぞれの水面を保つ。
      const front = Math.max(0, 1 - Math.abs(x - 8) / 85)
        * Math.max(0, 1 - Math.abs(z - 4) / 78);
      const patch = 0.65 + 0.35 * Math.sin(x * 0.19 + Math.sin(z * 0.13));
      const churn = front * patch * 0.8;
      c.setRGB(c.r + (0.32 - c.r) * churn, c.g + (0.265 - c.g) * churn, c.b + (0.19 - c.b) * churn);
      // 田の畦
      if (Math.abs(x) < 120 && (Math.floor(x / 22) + Math.floor(z / 18)) % 3 === 0 && Math.abs(x - 50) > 18) c.setRGB(c.r * 0.9 + 0.03, c.g * 0.95 + 0.02, c.b * 0.8);
      if (z < LINE2 && z > LINE2 - 1.5 && Math.abs(x) < 110) c.setRGB(0.38, 0.33, 0.22);
      // 川べりの泥と踏み跡：水ぎわから土手の上まで濃い土の色
      { const dz = Math.abs(z - nireZ(x)); if (dz > 8 && dz < 24 && x < NAGARA2 - 40) { const k = Math.min(1, 1.6 - Math.abs(dz - 15) / 5.5); if (k > 0) c.setRGB(c.r + (0.15 - c.r) * k, c.g + (0.13 - c.g) * k, c.b + (0.085 - c.b) * k); }   // 濡れた暗い泥の岸（明るい灰の帯に見えていた。10/28）
        // 川床は濡れた暗い泥。浅い水を透かして明るい地面が白い板に見えていた（10/27）。
        if (dz <= 9 && x < NAGARA2 - 40) { const k = Math.min(1, (9.5 - dz) / 2); c.setRGB(c.r + (0.2 - c.r) * k, c.g + (0.19 - c.g) * k, c.b + (0.15 - c.b) * k); } }
    },
    clear: (x, z) => peoplePathDistance(x, z) < 5 || (Math.abs(x) < 160 && Math.abs(z - nireZ(x)) < 30) || (Math.abs(x) < 42 && z > -100 && z < 130) || Math.hypot(x - 52, z - 112) < 22 || Math.hypot(x - 45, z - 70) < 12 || Math.hypot(x + 126, z + 30) < 34,
    // 五月の田：水を張り、苗を植えたばかり（畦を残す）
    fieldStage: 'seedling',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (peoplePathDistance(x, z) < 3 || Math.hypot(x - YAKUSHI2.x, z - YAKUSHI2.z) < 7) return 0;
      if (Math.abs(x) > 120 || Math.abs(x - 50) < 18 || Math.abs(z - nireZ(x)) < 18) return 0;   // 川べりは田にしない
      if ((Math.floor(x / 22) + Math.floor(z / 18)) % 3 !== 0) return 0;
      const ex = Math.min(((x % 22) + 22) % 22, 22 - ((x % 22) + 22) % 22), ez = Math.min(((z % 18) + 18) % 18, 18 - ((z % 18) + 18) % 18);
      if (distToPolyline(x, z, ROAD2) < 5) return 0;
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.9) / 0.6));
    },
    // 長良川は東の約五百メートル先。川幅・曲がり・楡俣川の浅瀬は復元。
    streams: [{ pts: [[NAGARA2 + 20, -FIELD2], [NAGARA2, -450], [NAGARA2 - 10, -100], [NAGARA2 + 20, 300], [NAGARA2 + 50, FIELD2]], w: 60, depth: 1.4 },
      // 杭の間は色だけでなく川床も浅くする。中央十二メートルと両脇のなだらかな斜面（位置・幅は復元）。
      { pts: [[-FIELD2, NIREMATA2 + 2], [-70, NIREMATA2], [46, NIREMATA2], [NAGARA2, NIREMATA2 + 6]], w: NIRE_WIDTH2, depth: 0.7,
        fords: [{ x: START2.x, w: 10 }] },   // 楡俣川：川幅十八メートル（w は片側の幅）
      { pts: [[-70, -FIELD2], [-66, -40], [-74, 60], [-70, FIELD2]], w: 1.2, depth: 0.7 }],
    mist: false,   // 雨は公記にあるが、濃い霧は確定できない。
    fogFar: 360,   // 雨は残し、川向こうと両将の槍列の輪郭まで読めるようにする。
    battleViewDistance: 140,   // 描画の上限内で両翼と控えを見せる。遠い兵は既存の軽い姿を使う。
    trees: 140,
    tufts: 2800,   // 河原の踏み場を、同じ黄色い穂の株で埋めない。
    // 既存の株数を畦・会戦の両脇へ集める。遠い野へ散らして足元を裸にしない。
    undergrowthBands: [{ x: -20, z: 22, w: 22, d: 72 }, { x: 28, z: 18, w: 22, d: 64 },
      { x: -82, z: 30, w: 22, d: 46 }, { x: 36, z: 64, w: 28, d: 7 },
      { x: 40, z: 108, w: 26, d: 7 }],   // 持ち場の岸の下草（足もとを灰の一枚にしない。10/28）
    nearGrassClumpBase: .22,
    nearGrassClumpGain: 1.65,
    young: true,
    // 雨を吸った下葉は灰緑、踏まれた帯は低く泥色へ。遠景と足元で同じ分布を使う。
    tuftHeight(x, z) {
      const front = Math.max(0, 1 - Math.abs(x - 8) / 65) * Math.max(0, 1 - Math.abs(z - 12) / 75);
      // 渡り口から先手までの踏み場は低い草にし、▼の下の胴と武器を見せる。
      const approach = Math.max(0, 1 - Math.abs(x - START2.x) / 12)
        * Math.max(0, Math.min(1, (z - 30) / 12, (100 - z) / 12));
      // 会戦帯では膝より低くし、赤い▼の下の胴と踏み込みを草に埋めない。
      return (.38 + Math.pow(tuftClumpAt(x, z), 2) * 1.05) * (1 - front * .78) * (1 - approach * .8);
    },
    tuftColor(x, z, color) {
      const front = Math.max(0, 1 - Math.abs(x - 8) / 65) * Math.max(0, 1 - Math.abs(z - 12) / 75);
      const grey = color.r * .3 + color.g * .55 + color.b * .15;
      color.setRGB(color.r * .52 + grey * .48, color.g * .52 + grey * .48, color.b * .52 + grey * .48);
      const soil = .18 + front * .28;
      color.setRGB(color.r + (.22 - color.r) * soil, color.g + (.235 - color.g) * soil, color.b + (.135 - color.b) * soil);
    },
    // 草と泥の配分は上の会戦帯の定義を使う。重複定義で畦や川岸の草まで薄めない。
    tuftTint: 0x8fa783,   // 雨の初夏。黄白色の草が一面に光らないようにする。
    // 川べりの会戦の帯は開け、木は在所寄りの野の縁へ置く（位置は復元）。
    treeDensity: (x, z) => (Math.hypot(x, z - FRONT2.z) < 160 ? 0 : Math.abs(x) > 90 ? 1 : 0.35),
    groves: [{ x: -180, z: -60, r: 12, n: 10 }, { x: -192, z: -32, r: 10, n: 5 }],
  },
  setup(rt) {
    // 安八町の案内：森部下河原2831。首実検の伝えを後日談へ。
    // https://www.town.anpachi.lg.jp/0000000392.html
    // 当時の姿と戦場での配置は復元。近代の石碑は置かない。
    moribeBuildings(rt);
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    moribeSoil(rt);
    rt.flags.yakushiReconstruction = true;
    const W = rt.world;
    // 先手の通った帯を既存の踏み跡の絵へ焼く。面も兵も増やさない。
    W.stampTrail([[38, 68], [29, 45], [12, 22], [4, -8], [-8, -44]], 7, 72);
    W.stampTrail([[-46, 14], [-18, 8], [14, -2], [49, -15]], 9, 60);
    W.stampTrail([[-40, -37], [-12, -32], [25, -39], [61, -51]], 8, 58);
    // 渡り口から北岸へ続く踏み場。水の上に模様を置かず、両岸の草と泥へつなぐ。
    W.stampTrail([[40, 123], [40, 98]], 3.2, 130);
    W.stampTrail([[40, 79], [38, 65], [29, 45]], 3.2, 130);
    moribeFord(rt);
    moribeOverflow(rt);
    moribeAze(rt);
    moribeNae(rt);
    moribeBankSoil(rt);
    moribeNearBodies(rt);
    // 落馬した瞬間の描画用の高さを空馬へ引き継ぐと、坂の判定に阻まれて宙で止まる。
    // 森部の野を逃げる空馬だけ、進路を調べる前に足元へ戻す。捕らえた馬は共通のまま。
    const looseHorses = rt.army.updateLooseHorses;
    rt.army.updateLooseHorses = function (dt) {
      if (this.looseHorses) for (const o of this.looseHorses) {
        if (o.kept || o.held > 0) continue;
        const p = o.h.position;
        p.y = W.heightAt(p.x, p.z);
      }
      looseHorses.call(this, dt);
    };
    // 畦の起伏では、足元より胸の下が低いことがある。倒れ切る時だけ胸を地へ戻す。
    // 馬からの落下・手当て・床上は元の処理を保つ。計算の道具は出陣時に用意する。
    const animDeath = rt.army.animDeath, fallAxis = new THREE.Vector3();
    rt.army.animDeath = function (u, dt, near) {
      animDeath.call(this, u, dt, near);
      const D = u.death, m = u.mesh;
      if (u.gone || u.mounted || D.aid || D.floor || D.kind === 'unhorse' || D.t < 0.9) return;
      const settle = THREE.MathUtils.smoothstep(D.t, 0.9, 1.3);
      fallAxis.set(0, 1, 0).applyQuaternion(m.quaternion);
      const x = m.position.x + fallAxis.x * 0.85, z = m.position.z + fallAxis.z * 0.85;
      m.position.y += (W.heightAt(x, z) + 0.2 - (m.position.y + fallAxis.y * 0.85)) * settle;
    };
    // 任務の下に短い治療の一行。二枠が埋まる間は「兵に届く」を重ねない。
    rt.hud.root.classList.add('moribe-notices');
    const noticeStyle = document.createElement('style');
    noticeStyle.textContent = `
/* 説明のない総兵数や綱引きは出さず、行き先のピンと敵の▼で判断する。 */
#hud.moribe-notices #tugbar,
#hud.moribe-notices #armybar { display:none !important; }
/* 次の一手と号令を右の任務札にまとめる。横持ちでも二行を切らない。 */
#hud #h-prog[data-battle="moribe"] { width:min(320px, 38vw); }
#hud #h-prog[data-battle="moribe"] .pg-st:not(.mission-combat) { background-image:none !important; }
/* 耐える間だけ任務と同じ行で丸が満ちる。場所を離れても時計を見失わない。 */
#hud #h-prog[data-battle="moribe"] .pg-st.moribe-wait {
 flex-direction:row; align-items:center; justify-content:flex-end; gap:10px;
}
#hud #h-prog[data-battle="moribe"] .pg-st.moribe-wait::before {
 content:''; display:block; flex:0 0 44px; width:44px; height:44px;
 border:2px solid #fff3ba; border-radius:50%; box-sizing:border-box;
 /* 中央を空けた輪に四分割の目盛りと先端を重ね、小さな進みも見分ける。 */
 background:radial-gradient(circle, #1c1913 48%, transparent 51%),
  conic-gradient(from calc(var(--wait-progress,0) * 3.6deg), #fff 0deg 4deg, transparent 4deg),
  repeating-conic-gradient(transparent 0deg 88deg, #15130f 88deg 90deg),
  conic-gradient(#fff3ba calc(var(--wait-progress,0) * 1%), #393328 0);
}
/* 共通の一行省略より優先し、今することを最後まで読めるようにする。 */
html:root body #hud.mission-only #h-prog[data-battle="moribe"] .pg-st span {
 max-width:100% !important; white-space:normal !important; overflow:visible !important;
 text-overflow:clip !important; overflow-wrap:anywhere !important;
}
#hud #h-prog[data-battle="moribe"] .pg-next { white-space:normal; overflow:visible; text-overflow:clip; }
#hud #h-prog[data-battle="moribe"] .pg-context { white-space:pre-line; margin-top:4px; }
#hud #h-prog[data-battle="moribe"] .pg-action {
 display:block; width:100%; min-height:44px; margin-top:8px; padding:8px;
 border:2px solid #fff3ba; border-radius:6px; background:#f3d184; color:#14120f;
 font:700 16px/1.4 var(--ui); pointer-events:auto; touch-action:manipulation; cursor:pointer;
}
#hud #h-prog[data-battle="moribe"] .pg-action:disabled { background:#373326; color:#fff3ba; cursor:default; }
#hud #h-prog[data-battle="moribe"] .pg-action[hidden] { display:none; }
#hud #h-prog[data-battle="moribe"] .pg-action:focus-visible { outline:3px solid #fff3ba; outline-offset:3px; }
#hud.moribe-notices #battle-notices:not(.choosing) #objectives { order:0 !important; }
#hud.moribe-notices #battle-notices:not(.choosing) #battle-message { order:1 !important; }
/* 下知は左の任務一枚で読む。開始の同文は畳み、足元の行き先は残す。 */
#hud.moribe-notices:has(#objectives:not([hidden]):not(.notice-muted):not(.expand)) #battle-opening > span {
 display:none !important;
}
/* 共通の旗・遮蔽案内が任務を消しても、森部の組への下知は残す。 */
html body #hud.moribe-notices.cover-guidance #battle-notices:not(.choosing) #objectives:not(.expand) {
 display:flex !important; visibility:visible !important;
}
html body #hud.moribe-notices:is(.flag-guide,.person-guide) #battle-notices #objectives:not(.expand) #obj-list {
 display:block !important;
}
/* 中央固定の道案内より優先し、下知と補足を同じ欄へ収める。 */
html:root body #hud.moribe-notices.single-guide #battle-notices:not(.choosing) #objectives#objectives.route-summary:not(.expand) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; max-width:100% !important;
}
html:root body #hud.moribe-notices.single-guide #battle-notices #objectives#objectives.route-summary:not(.expand) #obj-list li.cur small:not([hidden]):not(.notice-muted):not(:empty):not(.goal-place) {
 display:block !important;
}
/* 字幕の表示指定で、選外や空の字幕を復活させない。短い知らせの上の空札を畳む。 */
html body #hud.moribe-notices #battle-notices #battle-message > div#subtitle:is([hidden],.notice-muted,:empty) {
 display:none !important;
}
/* 地面の印へ任務札を動かさず、知らせの欄で折り返す。地図・警告と重ねない。 */
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives.ground-order:not(.expand),
html body #hud.moribe-notices.single-guide #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
 position:relative !important; inset:auto !important; width:100% !important;
 max-width:100% !important; overflow-wrap:anywhere; box-sizing:border-box;
}
/* 敵を追う釦と任務を別々に動かさず、同じ欄で読めるようにする。 */
html body #hud.moribe-notices.guard-button-help #battle-notices:not(.choosing) #objectives:not(.expand):has(.guard-action-button) {
 position:relative !important; inset:auto !important; width:100% !important; max-width:100% !important;
 padding:8px !important; background:#14120f !important; box-sizing:border-box;
}
html body #hud.moribe-notices.guard-button-help #objectives:not(.expand):has(.guard-action-button) > #obj-list {
 display:block !important;
}
#hud.moribe-notices .battle-action .guard-action-button {
 width:100%; min-width:0; min-height:48px; padding:6px 8px;
 font-size:max(16px, calc(16px * var(--text-scale, 1))); line-height:1.3;
}
#hud.moribe-notices .battle-action .guard-action-button small {
 font-size:max(12px, calc(12px * var(--text-scale, 1))); line-height:1.4;
}
#hud.moribe-notices .battle-action .guard-action-button.guard-now {
 border-width:3px; border-radius:8px; animation:none; box-shadow:none;
}
#hud.moribe-notices .guard-sign { width:18px; height:22px; }
/* 行き先はピン、敵は頭上の赤い▼。同じ意味の小地図の印を重ねない。 */
html body #hud.moribe-notices #minimap,
html body #hud.moribe-notices.lean.calm #minimap { display:none !important; }
html body #hud.moribe-notices #battle-notices #objectives.travel-retreat:not(.expand) li.cur .obj-now {
 font-size:max(18px, calc(18px * var(--text-scale, 1))) !important;
 line-height:1.4; white-space:normal !important; overflow-wrap:anywhere !important; word-break:normal !important;
}
/* 到着人数を本文の横へ詰めず、指図・補足の順に札の全幅で読む。 */
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) {
 position:relative !important; inset:auto !important;
 width:100% !important; min-width:0 !important; max-width:100% !important;
 transform:none !important; box-sizing:border-box;
}
html body #hud.moribe-notices #battle-notices #objectives:not(.expand) #obj-list li.cur {
 display:block !important; width:100% !important; min-width:0 !important;
 height:auto !important; max-height:none !important; box-sizing:border-box;
}
/* 防御の操作が出ても、組の持ち場と帰る理由を消さない。 */
html body #hud.moribe-notices.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list,
html body #hud.moribe-notices.single-guide #battle-notices:not(.choosing) #objectives.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list {
 display:block !important;
}
html body #hud.moribe-notices.single-guide #battle-notices:not(.choosing) #objectives:not(.expand) {
 background:#14120f !important; padding:8px !important;
}
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now,small) {
 position:static !important; display:block !important; width:100% !important;
 min-width:0 !important; max-width:100% !important; height:auto !important;
 white-space:normal !important; overflow-wrap:anywhere !important; word-break:normal !important;
 box-sizing:border-box;
}
/* 一文字だけの二行目と、行ごとに分かれる墨の短冊を避ける。 */
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
 text-wrap:balance; background:none !important; box-shadow:none !important;
 font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; line-height:1.6 !important;
}
/* 共通の地上札より優先し、長い下知を左の欄で読む。 */
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-now,
html body #hud.moribe-notices.single-guide #battle-notices:not(.choosing) #objectives:is(.ground-order,.flag-travel-order,.linked-destination):not(.expand) #obj-list li.cur .obj-now {
 font-size:max(18px, calc(18px * var(--text-scale, 1))) !important; line-height:1.6 !important;
}
html body #hud.moribe-notices #battle-notices #objectives:not(.expand) li.cur small {
 margin-top:4px;
}
/* 退く下知の間に、前の畦の到着人数・待ち時間を並べない。 */
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives.travel-retreat:not(.expand) li.cur small {
 display:none !important;
}
/* 退く警告を先に読み、組の持ち場は同じ札の二段目に残す。人数や距離は混ぜない。 */
html body #hud.moribe-notices.retreat-priority #battle-notices:not(.choosing) #objectives.travel-retreat:not(.expand) #obj-list li.cur .obj-full {
 position:static !important; display:block !important; inset:auto !important; transform:none !important;
 width:100% !important; height:auto !important; max-height:none !important; margin-top:4px;
 color:#ece4d2; font-size:max(13px, calc(13px * var(--text-scale, 1))) !important;
 font-weight:400; line-height:1.6 !important; white-space:normal !important;
 overflow:visible !important; overflow-wrap:anywhere !important;
}
html body #hud.moribe-notices.retreat-priority #battle-notices:not(.choosing) #objectives.travel-retreat:not(.expand) #obj-list li.cur .obj-full::before {
 content:'立て直したら：';
}
/* 同じ「下がれ」を操作欄と任務欄で二度読ませない。降馬の釦は残す。 */
html body #hud.moribe-notices.retreat-priority #battle-notices:not(.choosing) #objectives.travel-retreat:not(.expand) .battle-action:not(:has(button)) {
 display:none !important;
}
#hud.moribe-notices .hold-cover[aria-pressed="true"] { background:#65552a !important; box-shadow:inset 0 0 0 3px #fff3ba; }
#hud.moribe-notices #prompt.treatment-action { display:none !important; }
/* 建具の札は戦場の案内を隠す指定から外す。戸が届く時だけ共通の開閉操作を出す。 */
html body #hud.moribe-notices.field-clean #prompt.moribe-door:not([hidden]) {
 display:block !important; pointer-events:auto;
}
html body #hud.moribe-notices #prompt.moribe-door button[data-entry] {
 min-height:44px; min-width:88px; font-size:max(16px, calc(16px * var(--text-scale, 1)));
 color:#fff3df; background:#14120f; border:2px solid #fff3df; padding:8px 16px;
}
#hud.moribe-notices .battle-notice.treatment { white-space:nowrap; font-size:max(12px, calc(12px * var(--text-scale, 1))); line-height:1.4; }
#hud.moribe-notices:has(#battle-message:not([hidden])) .range-cue { display:none; }
/* 本文と人物紹介は縮めずに送る。出陣の釦には重ならない。 */
html body #hud.moribe-notices #intro:has(#intro-go) > .card.card {
 display:flex; flex-direction:column; align-items:stretch;
}
#hud.moribe-notices #intro:has(#intro-go) .intro-reading {
 display:block; width:100%; flex:1 1 auto; min-height:0;
 overflow-y:auto; box-sizing:border-box; padding-bottom:16px; scroll-padding-bottom:16px;
 touch-action:pan-y; overscroll-behavior:contain; pointer-events:auto;
}
#hud.moribe-notices #intro .intro-scroll { flex-shrink:0; font-size:13px; line-height:1.4; }
#hud.moribe-notices #intro .intro-people summary {
 min-height:44px; box-sizing:border-box; padding:10px 8px;
 font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.6;
 color:#f2cd72; text-decoration:underline; cursor:pointer;
}
#hud.moribe-notices #intro .intro-people summary:focus-visible {
 outline:3px solid var(--kin); outline-offset:-3px; box-shadow:0 0 0 2px #14120f;
}
#hud.moribe-notices #intro #intro-wait { white-space:pre-line; }
/* 防御は決まった端で押す。敵を追って札が動き、槍先を隠すのを避ける。 */
html body #hud.moribe-notices #wait-guard {
 left:auto !important; right:calc(16px + env(safe-area-inset-right, 0px)) !important;
 top:calc(96px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
 width:208px; max-width:calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
 box-sizing:border-box; height:auto; min-height:56px; border-radius:8px; border-width:3px;
 gap:8px; flex-wrap:nowrap; font-size:max(16px, calc(16px * var(--text-scale, 1)));
}
html.tc-sw body #hud.moribe-notices #wait-guard {
 left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
}
#hud.moribe-notices #wait-guard svg { width:24px; height:32px; }
#hud.moribe-notices #wait-guard span {
 position:static; width:auto; min-width:0; flex:1; padding:0; background:none; white-space:normal;
 font:inherit;
}
#hud.moribe-notices #wait-guard small {
 position:static; width:auto; min-width:0; white-space:normal; overflow-wrap:anywhere;
 font-size:max(13px, calc(13px * var(--text-scale, 1))); line-height:1.4;
}
/* 手・説明・盾の三列を明示し、暗黙の三列目が説明の幅を奪わないようにする。 */
html.touch body #hud.moribe-notices #wait-guard {
 grid-template-columns:24px minmax(0, 1fr) 24px; column-gap:8px; row-gap:2px;
}
html.touch body #hud.moribe-notices #wait-guard svg:first-child {
 width:24px; height:32px;
}
html.touch body #hud.moribe-notices #wait-guard svg + svg {
 width:24px; height:32px;
}
html.touch body #hud.moribe-notices #wait-guard :is(span,small) {
 width:auto; min-width:0; white-space:normal; overflow-wrap:anywhere;
 font-size:max(15px, calc(15px * var(--text-scale, 1))); line-height:1.4;
}
/* 矢を避ける移動釦の長文を折り返す。押す範囲と左右の設定は共通のまま。 */
html.touch body #hud.moribe-notices button.cover-guide.hold-cover {
 width:232px; max-width:calc(100vw - 48px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
}
html.touch body #hud.moribe-notices button.cover-guide.hold-cover span {
 white-space:pre-line; overflow-wrap:anywhere; max-width:100%;
}
/* 同じ目的地の文字札は任務一枚にまとめ、地面の旗と向きの印を残す。 */
#hud.moribe-notices #markers .mk.main:not(.person-goal) { display:none !important; }
/* 共通の親指側・中央の固定指定より優先し、森部の下知を知らせ欄へ収める。 */
html:root body #hud.moribe-notices #battle-notices:not(.choosing) #objectives#objectives:not(.expand) {
 position:relative !important; inset:auto !important; transform:none !important;
 width:100% !important; max-width:100% !important; min-width:0 !important;
}
/* 防御の説明は端の釦にまとめ、上の札には組の下知を残す。 */
html.touch body #hud.moribe-notices.wait-guard-active #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:has(.guard-caption) {
 display:none !important;
}
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives.has-action:not(.expand):has(.battle-action:not([hidden])) #obj-list li.cur .obj-text {
 display:block !important;
}
@media (min-height:501px) {
 html body #hud.moribe-notices #intro:has(#intro-go) > .card.card {
  width:min(560px, calc(100vw - 32px)); height:auto; max-height:min(640px, 72dvh);
 }
 html body #hud.moribe-notices #intro:has(#intro-go) .intro-reading {
  flex:0 1 auto;
 }
 /* 雨の野へ操作の字を透かさず、指揮と回避の押す釦を読めるようにする。 */
 html:not(.touch) body #hud.moribe-notices:not(.ending):not(:has(#intro:not([hidden]))) #h-bottom {
  opacity:1;
 }
 html:not(.touch) body #hud.moribe-notices #h-bottom .slot {
  background:#14120f;
 }
 html body #hud.moribe-notices #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
  top:calc(104px + env(safe-area-inset-top, 0px)) !important; width:min(320px, 32vw) !important;
  bottom:auto !important; transform:none !important;
  max-height:calc(100dvh - 344px) !important; overflow-y:auto;
  overscroll-behavior:contain; pointer-events:auto;
 }
}
/* 欄の高さに合わせて札を押し潰さず、長い下知は欄全体を送って読む。 */
html body #hud.moribe-notices #battle-notices:not(.choosing) > :is(#objectives,#battle-message) {
 flex:0 0 auto; min-height:0; max-height:none !important; overflow:visible;
}
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) li.cur .obj-now,
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
 display:block !important; -webkit-line-clamp:unset; line-clamp:unset;
 max-height:none !important; overflow:visible !important; white-space:normal !important;
}
/* 共通の行ごとの墨より優先する。森部は任務と補足を一枚で読み、空の黒帯を残さない。 */
html body #hud.moribe-notices:not(.hc) #battle-notices:not(.choosing) #objectives:not(.expand) {
 background:#14120f !important; padding:8px !important;
}
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur :is(.obj-now,small),
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
 background:none !important; padding:0;
}
/* 向き直る操作は本文と操作欄に残す。空白だけの補足と手の図を別の黒帯にしない。 */
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small.goal-place.facing-help:has(.facing-gesture),
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small:is([hidden],.notice-muted,:empty),
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:is([hidden],:empty) {
 display:none !important;
}
/* 着いた後の人数・待つ理由も、任務を開かず読めるようにする。 */
#hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand):not(.travel-retreat) li.cur small:not(.goal-place):not([hidden]):not(.notice-muted):not(:empty) {
 display:block !important; font-size:max(13px, calc(13px * var(--text-scale, 1))); line-height:1.6;
 color:#ece4d2;
}
html body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small:not(.goal-place) {
 white-space:pre-line !important;
}
@media (max-height:500px) {
 /* 長押しの説明を二段で読める幅にし、槍列の高さを大札で覆わない。字の拡大時は折り返す。 */
 html.touch body #hud.moribe-notices #wait-guard {
  width:232px; min-height:64px;
 }
 /* 横向きでも勝つ条件まで読める高さと幅を取り、出陣の釦は縮めない。 */
 html body #hud.moribe-notices #intro:has(#intro-go) > .card.card {
  width:min(680px, calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  max-height:calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
  padding:12px 16px; gap:8px;
 }
 #hud.moribe-notices #intro .intro-reading p { margin:6px 0; }
 #hud.moribe-notices #intro-go { flex:0 0 auto; }
 /* 矢の警告は上の空きへ。任務と下知の札にはかぶせない。 */
 html.touch body:has(#hud.moribe-notices) #rain-mark {
  top:calc(env(safe-area-inset-top, 0px) + 8px) !important;
  max-width:calc(100vw - 400px); box-sizing:border-box;
  font-size:max(13px, calc(13px * var(--text-scale, 1))) !important;
  line-height:1.4; letter-spacing:0 !important;
 }
 /* 共通の高さ制限で切らず、一つの欄を指で送る。子の札を縮めず、開いた任務は共通の表示を使う。 */
 html.touch body #hud.moribe-notices #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
  left:calc(16px + env(safe-area-inset-left, 0px)) !important; right:auto !important;
  top:calc(16px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
  width:min(304px, 40vw) !important; transform:none !important;
  max-height:min(48vh, calc(100dvh - 164px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))) !important;
  overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; pointer-events:auto;
 }
 html.touch body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) {
  flex:0 0 auto; max-height:none !important; overflow:visible;
  display:flex !important; flex-direction:column;
  background:#14120f !important; padding:8px !important;
 }
 /* 組の任務を先に読み、敵一人への操作は小さい補足として続ける。 */
 html.touch body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list {
  order:0;
 }
 html.touch body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action:not([hidden]) {
  order:1; margin-top:4px;
  font-size:max(15px, calc(15px * var(--text-scale, 1))) !important; line-height:1.4 !important;
 }
 /* 向き直る補足も任務欄に収める。大きな手の図で前列と到着人数を押し出さない。 */
 html.touch body #hud.moribe-notices #battle-notices:not(.choosing) #objectives.turn-coach:not(.expand) {
  position:relative !important; inset:auto !important;
  width:100% !important; max-width:100% !important; padding:8px !important;
 }
 html.touch body #hud.moribe-notices #battle-notices:not(.choosing) #objectives:not(.expand) .battle-action :is(.approach-gesture,.turn-gesture) {
  display:none !important;
 }
 html.touch body #hud.moribe-notices #battle-notices:not(.choosing) #battle-message {
  flex:0 0 auto; min-height:0; max-height:none !important; overflow:visible;
  pointer-events:auto;
 }
 /* 出陣の補足が釦の裏へ潜らないよう、本文の末尾に余白を残す。 */
 #hud.moribe-notices #intro:has(#intro-go) .intro-reading {
  overflow-y:auto; box-sizing:border-box; padding-bottom:16px; scroll-padding-bottom:16px; touch-action:pan-y;
 }
}
`;
    document.head.appendChild(noticeStyle);
    // 共通処理から直接出る褒美の札も含め、森部の札は同じ秒に二つまで。
    const hud = rt.hud, hudBark = hud.bark, hudBanner = hud.banner, hudSay = hud.say, hudRects = hud.hudRects;
    // 先手と戦う間は赤い三角だけ。味方へ戻る古い矢印を重ねない。
    const combatSignsOnly = () => rt.flags.stage === 'contact' && !rt.flags.vBroken && !rt.flags.squadGuide;
    const hudBattleGoal = hud.drawBattleGoal, hudFootDirection = hud.drawFootDirection;
    hud.drawBattleGoal = function (g, battle) {
      // 命中は相手の赤い▼で示す。胴に別の印を重ねない。
      if (battle === rt) {
        const pin = rt.def.missionPin(rt);
        // 先手が視野の外へ回った時は、missionPin が選んだ行き先だけを残す。
        // 渡り切った岸の印は残さず、本人や味方を指す印と混同させない。
        if (!pin) return false;
      }
      return hudBattleGoal.call(this, g, battle);
    };
    hud.drawFootDirection = function (g, battle, target) {
      if (battle === rt && combatSignsOnly()) return false;
      return hudFootDirection.call(this, g, battle, target);
    };
    const hudPlayerSign = hud.drawPlayerSign;
    // 本人は肩越しに見える。白い二重輪を待機場所と取り違えさせず、川の向こうの印だけ残す。
    hud.drawPlayerSign = function (g, battle) {
      return battle === rt ? false : hudPlayerSign.call(this, g, battle);
    };
    // 敵と命中の反応は共通の赤い▼だけ。別の白い印を重ねない。
    const hudEnemyOutline = hud.drawEnemyOutline;
    hud.drawEnemyOutline = function (g, u, battle, guarding) {
      return battle === rt ? false : hudEnemyOutline.call(this, g, u, battle, guarding);
    };
    // 開始案内の強調指定も小さな印へそろえる。判定の半径と遮蔽の確認は変えない。
    const hudFootRing = hud.drawTargetFootRing;
    hud.drawTargetFootRing = function (g, battle, pos, scale = 1, person = false, prominent = false, guardPost = false) {
      return battle === rt
        ? hudFootRing.call(this, g, battle, pos, Math.min(scale, 0.65), person, false, guardPost)
        : hudFootRing.call(this, g, battle, pos, scale, person, prominent, guardPost);
    };
    // 待機専用の描画は smallTaskAreas を通らないため、森部では同じ小さな足元印へ渡す。
    // 地面の起伏・遮蔽と表示の上限は共通の印に任せ、待機判定の広さは保つ。
    const hudWaitFrame = hud.drawWaitFrame;
    hud.drawWaitFrame = function (g, battle, pos, radius) {
      return battle === rt ? this.drawTargetFootRing(g, battle, pos, 0.65)
        : hudWaitFrame.call(this, g, battle, pos, radius);
    };
    // 共通の矢の警告は画面全体の子。森部だけ、印と敵の警告が避ける箱へ加える。
    // 元の四分の一秒の測定を使い、同じ箱へ重複して足さない。
    let measuredRects = null;
    hud.hudRects = function () {
      const rects = hudRects.call(this);
      if (this.rt !== rt || rects === measuredRects) return rects;
      measuredRects = rects;
      const mark = document.getElementById('rain-mark');
      if (mark && !mark.hidden) {
        const box = mark.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) {
          rects.push(box);
          this.rectsAll = rects.concat(this.mkRects);
        }
      }
      return rects;
    };
    let cardSecond = -1, cardCount = 0;
    const takeCard = () => {
      const second = Math.floor(rt.t);
      if (second !== cardSecond) { cardSecond = second; cardCount = 0; }
      if (cardCount >= 2) return false;
      cardCount++; return true;
    };
    const warnings = {
      shaken: { at: -99, n: 0, lines: ['組が動揺している。旗のそばで声をかけよ', '組の足が止まった。仲間を励ませ', '槍の列が乱れた。旗の下へ組を集めよ'] },
      surrounded: { at: -99, n: 0, lines: ['囲まれた！　味方の旗へ下がれ', '敵が四方にいる。味方の列へ戻れ', '退く道が狭い。組と一緒に抜けよ'] },
    };
    hud.bark = function (text, warn) {
      if (this.rt !== rt) return hudBark.call(this, text, warn);
      if (/使いが\s*味方へ向かった/.test(text)) return; // 任務とは別の使いを追わせない。
      if (/が遅れている（待つか、道を空けて呼べ）/.test(text)) text = '仲間が遅れている。その場で待つと追いつく';
      const w = /組が動揺/.test(text) ? warnings.shaken : /囲まれた|四方から敵|後ろにも敵|取り籠め/.test(text) ? warnings.surrounded : null;
      if (w && rt.t - w.at < 30) return;
      if (!takeCard()) return;
      if (w) { w.at = rt.t; text = w.lines[w.n++ % w.lines.length]; }
      return hudBark.call(this, text, warn);
    };
    hud.banner = function (text, sub) {
      if (this.rt !== rt) return hudBanner.call(this, text, sub);
      if (takeCard()) return hudBanner.call(this, text, sub);
      const phase = rt.phase;
      rt.after(1, () => { if (hud.rt === rt && rt.phase === phase) hud.banner(text, sub); });
    };
    hud.say = function (speaker, text, dur, urgent, detail) {
      if (this.rt !== rt) return hudSay.call(this, speaker, text, dur, urgent, detail);
      clearOldSpeech(rt);
      // 使番と任務の下知は雑談より先に読む。八秒の間引きは共通処理を使う。
      const accepted = hudSay.call(this, speaker, text, dur, urgent, detail);
      if (accepted) for (const line of this.subQ) if (line.moribeStage === undefined) {
        line.moribeStage = rt.flags.stage || 'brief'; line.moribeEnding = !!rt.flags.ending;
      }
      return accepted;
    };
    const dispose = rt.dispose;
    rt.dispose = function () {
      hud.bark = hudBark; hud.banner = hudBanner; hud.say = hudSay; hud.hudRects = hudRects;
      hud.drawPlayerSign = hudPlayerSign; hud.drawWaitFrame = hudWaitFrame;
      hud.drawBattleGoal = hudBattleGoal; hud.drawFootDirection = hudFootDirection;
      hud.drawEnemyOutline = hudEnemyOutline;
      hud.drawTargetFootRing = hudFootRing;
      hud.root.classList.remove('moribe-notices'); noticeStyle.remove();
      return dispose.call(this);
    };
    // 柴田の悔やみは、共通の討死処理へ渡す本当の味方の死に一度だけ結ぶ。
    const onKill = rt.army.hooks.onKill, say = rt.say;
    let fallenAt = -99, fallen = 0, mourned = 0;
    rt.army.hooks.onKill = (v, k) => {
      if (v.team === rt.player.u.team && !v.alive && !v.civ && !v.isStruct && !v.isPlayer) { fallen++; fallenAt = rt.t; }
      return onKill(v, k);
    };
    rt.say = function (speaker, text, dur) {
      if (/^(?:柴田)?勝家$/.test(speaker) && /無念|仲間を失った|嘆くのは後/.test(text)) {
        if (fallen <= mourned || rt.t - fallenAt > 2) return;
        mourned = fallen;
      }
      return say.call(this, speaker, text, dur);
    };
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    rt.flags.hist = { rain: 'HIST_A', crossing: 'HIST_A', spearBattle: 'HIST_A', commanders: 'HIST_A', nagara: 'HIST_B', paddy: 'HIST_B', formation: 'GAME_C', reserveWaves: 'GAME_C', ford: 'GAME_C' };
    // 倒れる寸前に仲間が割って入る手当ては、最初の桶狭間だけ（森部からは構えと回避で凌ぐ）。
    rt.firstFights = false;
    rt.flags.rescued = true;   // 倒れてから体力を戻して戦列へ復帰する救済を、この戦では使わない。
    // 渡河の移動は総攻めの合図ではない。森部の下知が出るまで隊の太鼓を鳴らさない。
    // 隊の行き先の細かな直しでは鳴らさない。両軍を合わせて三十二秒あけ、字は出さない。
    const signalStages = [null, null], signalKinds = [null, null];
    rt.army.hooks.onSignal = (g, kind, at) => {
      const F = rt.flags;
      if (!F.signal || rt.over || F.ending || F.quiet || g.hidden || g.hideFlags) return;
      if ((F.signalSoundAt ?? -99) + 32 > rt.t) return;
      if (signalStages[g.team] === F.stage && signalKinds[g.team] === kind) return;
      signalStages[g.team] = F.stage; signalKinds[g.team] = kind;
      F.signalSoundAt = rt.t;
      rt.army.playFar(`sig_${kind}`, at, 0.9);
    };
    // 槍列で囲む戦。山場を一騎打ちの札で覆わず、組と戦い続ける。
    rt.army.hooks.canDuel = () => false;
    // 仲間が遠くで討った首を、自分に催促しない。自分の討ち取りも近くで一度だけ知らせる。
    const bark = rt.bark;
    rt.bark = function (text, warn) {
      if (text === '証がない。近くで首を袋に納めよ') {
        const record = this.meritKills?.find((r) => r.src.isPlayer && !r.foe.alive && !r.foe.gone && !r.head &&
          !r.witnesses.length && r.foe !== this.flags.proofNoted &&
          Math.hypot(r.foe.pos.x - this.player.u.pos.x, r.foe.pos.z - this.player.u.pos.z) < 12);
        if (!record) return;
        this.flags.proofNoted = record.foe;
        text = '討った敵の証がない。近くで首を袋に納めよ';
      }
      return bark.call(this, text, warn);
    };
    // 深手の退避中も、近くの敵は共通処理で戦い続ける。
    // 公記の森部は織田の大勝。味方の兵（自分と組を除く）への打ち込みを少し浅くし、勝ち戦の芯が溶けないようにする。
    const damage = rt.army.damage;
    rt.army.damage = function (t, amount, src, ...rest) {
      if (t && t.team === 0 && !t.isPlayer && !t.group?.isPlayerSquad && src?.team === 1) amount *= 0.7;
      const hp = t?.hp;
      const result = damage.call(this, t, amount, src, ...rest);
      // 命を減らした本人の赤い▼を一拍残す。予告や防御成功では反応しない。
      if (t?.isPlayer && t.hp < hp && src?.team !== t.team) {
        if (src) src.moribeAttackUntil = rt.t + 1.8;
      }
      // 傷のない受け止めも本人の▼だけで示し、空振りと区別する。
      const blocked = src?.isPlayer && t && t.team !== src.team && rest[0]?.out?.res === 'block';
      if (blocked) {
        t.moribeBlockUntil = rt.t + 1.2;
        // 直前の命中を残すと、次の一撃が防がれても縦に伸びたままになる。
        t.moribeHitUntil = 0;
      }
      if (src?.isPlayer && t?.team !== src.team && t.hp < hp) {
        rt.flags.struckTarget = t; rt.flags.struckUntil = rt.t + 3;
        // ▼の中で今回削った分だけを残し、続く一撃でも減りを見届けられるようにする。
        t.moribeHitHp = hp;
        // 次の一振りまでに削れた面を閉じ、連打でも残る赤の減りを見せる。
        t.moribeDamageUntil = rt.t + .95;
        // 命中の形を保ってから戻す。空振りや受け止めでは伸ばさない。
        if (!blocked) { t.moribeHitUntil = rt.t + 1.8; t.moribeBlockUntil = 0; }
        if (!t.alive || t.dying || t.downed || t.woundOut || t.rearWound) t.moribeDefeatUntil = rt.t + .8;
        // 命を減らした本人だけがよろめく。空振りや味方には反応を付けない。
        if (t.alive && !blocked) {
          // 生きている敵は上体をのけぞらせて戻す。膝を落として討死に見せない。
          t.flinchT = .32;
          t.stagger = Math.max(t.stagger || 0, .65);
          // 突きの途中の姿を残さず、命中した本人のよろめきを見せる。
          t.atk = null; t.swing = null; t.cd = Math.max(t.cd || 0, .65);
          // 当たった体を小さく押し戻し、重なった隣の兵と反応を見分ける。
          if (t.push && !t.mounted && !t.isStruct) {
            const dx = t.pos.x - src.pos.x, dz = t.pos.z - src.pos.z;
            const d = Math.hypot(dx, dz) || 1;
            t.push.x += dx / d * .7; t.push.z += dz / d * .7;
          }
        }
      }
      return result;
    };
    const n = Math.min(24, RANKS[rt.G.rank].squad || 5);
    rt.makeSquad({ x: START2.x + 8, z: START2.z + 3 }, Math.PI, [{ kind: 'spear', n }]);   // 先に渡る前備と重ねず、組はすぐ後ろから続く
    // 三手は楡俣川の南岸に並び、遊び手と同じ流れを渡る。柴田・本備・森の備は勝ち戦の芯なので、
    // 兵は討たれても隊ごとの総崩れはしない（右手の小勢は崩れうる）。
    rt.flags.A = allyGroup(rt, { name: '柴田の前備', fixed: true, anchor: { x: 34, z: 94 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true, fullStrength: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 16 }, { type: 'samurai', n: 1, o: { name: '源八', invuln: true } }, { type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true } }]);
    rt.flags.B = allyGroup(rt, { name: '本備', fixed: true, anchor: { x: -22, z: 116 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true, fullStrength: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 24 }, { type: 'bow', n: 2 }, { type: 'samurai', n: 2 }]);
    // 上役の源八は戦の後に城下で昇進を告げる。この戦では討たれない。
    rt.flags.moribeOfficer = rt.flags.A.units.find((u) => u.name === '源八');
    // 小勢が横に広がりすぎず、槍の前線へ合流する（細かな隊の位置は復元）。
    rt.flags.R3 = allyGroup(rt, { name: '右手の備', fixed: true, anchor: { x: 52, z: 104 }, facing: Math.PI, aggro: 10, morale: 100, noRout: false, fullStrength: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 12 }, { type: 'samurai', n: 1 }]);
    rt.flags.Y = allyGroup(rt, { name: '森の横備え', fixed: true, anchor: { x: -48, z: 108 }, facing: Math.PI, aggro: 10, morale: 100, noRout: true, fullStrength: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 14 }, { type: 'samurai', n: 1, o: { name: '前田利家', invuln: true } }, { type: 'busho', n: 1, o: { name: '森可成', invuln: true } }]);
    // 斎藤の先手は北岸の畦へ寄せ、渡る織田勢へ矢を射かけてから槍で受ける（弓の数は復元）。
    // 渡り口の正面に同じ先手を寄せ、印だけを追って野を歩く時間を短くする。
    rt.flags.V = enemyGroup(rt, { faction: 'saito', name: '斎藤の先手', fixed: true, anchor: { x: 40, z: 60 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, speed: 2.1, aggro: 5, noRout: false, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 26 }, { type: 'bow', n: 4 }, { type: 'samurai', n: 2 }]);
    rt.flags.vanguardHealth = rt.flags.V.units.reduce((sum, u) => sum + u.hp, 0);
    // 日比野下野守の備え（足立六兵衛を含む）
    rt.flags.M = enemyGroup(rt, { faction: 'saito', name: '日比野の備', fixed: true, anchor: { x: -14, z: -30 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 8, width: 8, noRout: false, formation: 'yari', yariRanks: 3 },
      [{ type: 'ashigaru', n: 18 }, { type: 'samurai', n: 2 }, { type: 'samurai', n: 1, o: { name: '足立六兵衛' } }, { type: 'bow', n: 3 }]);
    // 長井甲斐守の備え：日比野の西に並ぶ
    rt.flags.N = enemyGroup(rt, { faction: 'saito', name: '長井の備', fixed: true, anchor: { x: -44, z: -34 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, aggro: 8, width: 7, morale: 90, noRout: false, formation: 'yari', yariRanks: 3 },
      [{ type: 'ashigaru', n: 14 }, { type: 'samurai', n: 2 }, { type: 'bow', n: 2 }]);
    // 両将は備の後ろで旗本の侍に囲まれて控え、槍の押し合いの後に自ら前へ出る（位置と人数は復元）。
    // 大将の生きている間は旗本が踏みとどまる。両将の首が勝ち戦の山場（公記：両将を含む百七十余人討死）。
    rt.flags.HM = enemyGroup(rt, { faction: 'saito', name: '日比野下野守の旗本', fixed: true, anchor: { x: -8, z: -54 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 3, morale: 100, noRout: true, formation: 'yari', yariRanks: 2 },
      [{ type: 'busho', n: 1, o: { name: '日比野下野守', flagScale: 2.2 } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }]);
    rt.flags.HN = enemyGroup(rt, { faction: 'saito', name: '長井甲斐守の旗本', fixed: true, anchor: { x: -36, z: -58 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, aggro: 3, morale: 100, noRout: true, formation: 'yari', yariRanks: 2 },
      [{ type: 'busho', n: 1, o: { name: '長井甲斐守', flagScale: 2.2 } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }]);
    rt.flags.HM.hatamoto = rt.flags.HN.hatamoto = true;
    // 畦道沿いの持ち場で迎え撃つ。広い野へ味方を追い続けさせない。
    for (const g of [rt.flags.HM, rt.flags.HN]) {
      g.noAI = true; g.noPursue = true;
    }
    for (const [x, z] of [[30, 124], [-30, 126], [0, 120]]) rt.scene.add(nobori(W, x, z, 'oda', 5.5));
    for (const [x, z] of [[0, -96], [-34, -90], [-60, -100]]) rt.scene.add(nobori(W, x, z, 'saito', 5.5));

    // 暗い嵐の空に夜の星と月を出さない。
    if (W.stars) W.stars.material.opacity = 0;
    if (W.moon) W.moon.material.opacity = 0;
    // 曇天の明るさを保ち、土からの照り返しを抑えて軒裏と具足の陰を分ける。
    const lookOf = W.lookOf;
    W.lookOf = function (key) {
      const look = lookOf.call(this, key);
      if (key === 'storm') {
        look.hemiI = 1.65;
        look.hemiGround.setHex(0x4c4638);
        look.sunI = 1.65;
        look.sunDir.set(-.48, .78, .4).normalize();
        look.vis = Math.max(look.vis, 360);
      }
      return look;
    };
    // 足元の草も低い若葉へ。森部の出陣時だけ既存の形と材質を調整する。
    if (W.nearGrass) {
      W.nearGrass.geometry.scale(1, 0.65, 1);
      W.nearGrass.material.color.setHex(0x8fa783);
    }
    // 浅い田の足跡を大きな白い輪と玉にしない。川の水しぶきは残し、既存の形を使う。
    if (W.footWaves) {
      W.footWaves.mesh.geometry.scale(0.55, 1, 0.55);
      W.footWaves.mesh.material.opacity = 0.14;
    }
    if (W.sprayP) W.sprayP.points.material.uniforms.scale.value *= 0.65;
    // 槍がぶつかる野へ烏を降ろさない。近い簡易な翼が黒い破片に見えるのも避ける。
    // 上空の群れは既存の更新で飛ばし、兵と争う所へ寄せる着地先だけを止める。
    const birdSpot = W.birdSpot;
    W.birdSpot = function (flock, focus) {
      return rt.over ? birdSpot.call(this, flock, focus) : null;
    };
    // 雨量・濡れ・雨音は保つ。手前の太い板は描かず、細い線を六割にして嵐の筋を見せる。
    W.updateNearRain = function () { this.rainNear.visible = false; };
    // 描く直前の間引きではなく、雨と跳ねの計算そのものを減らす。
    W.rainParticleScale = 0.6;
    W.rainSplashCount = 48;
    const updateWorld = W.update;
    W.update = function (dt, focus) {
      updateWorld.call(this, dt, focus);
      if (!this.rain.visible) return;
      // 嵐の雨筋は薄めずに見せ、尾を二倍半に伸ばして長い斜めの筋にする。跳ねだけは泥色で控えめに。
      const ra = this.rain.geometry.attributes.position.array, rn = this.rain.geometry.drawRange.count / 2;
      for (let i = 0; i < rn; i++) {
        const o = i * 6;
        ra[o + 3] = ra[o] + (ra[o + 3] - ra[o]) * 2.5;
        ra[o + 4] = ra[o + 1] + (ra[o + 4] - ra[o + 1]) * 2.5;
        ra[o + 5] = ra[o + 2] + (ra[o + 5] - ra[o + 2]) * 2.5;
      }
      // 泥の跳ねを白い草のように野一面へ並べない。既存の線を少数だけ描く。
      this.splashPts.material.color.setHex(0x807d70);
      this.splashPts.material.opacity = 0.18 * this.rainLevel;
    };
    // 公記は開戦当日の雨を記す。渡河中に晴れから雨へ変わる演出にしない。
    W.setTime('storm'); W.setRainTarget(0.65);
    W.rainLevel = W.wetness = 0.65;
    rt.setPhase('brief');
    rt.banner('雨の森部（もりべ）、敵は川の向こう', '砂色の浅瀬を歩いて渡れ');
    rt.obj('point', '砂色の浅瀬を歩いて渡れ', 'main');
    rt.marker('point', POINT2, () => rt.flags.pointInside ? 'ここで仲間を待つ' : '向こう岸の矢印の輪へ',
      { guideArea: 'wait', guideRadius: FORD_R });
    rt.zone('point', POINT2.x, POINT2.z, FORD_R);
    rt.say('隊長 源八（げんぱち）', '砂色の浅瀬は歩いて渡れる。向こう岸の印まで進め', 5);
    // 公記：勘当の身の前田利家が、許しなく森部に加わり首を挙げた。
    rt.after(17, () => { if (!rt.flags.ending && !rt.over) rt.bark('仲間「勘当の前田利家殿まで、槍を持って駆けつけたぞ」'); });
    rt.flags.point = POINT2;
    rt.flags.friends = [rt.flags.A, rt.flags.B, rt.flags.Y, rt.flags.R3];
    // 控えは開戦時からここにいる。後の段では追加せず、持ち場から歩いて出す。
    rt.flags.reserves = [[-44, -76, '長井の控え'], [12, -80, '日比野の控え']].map(([x, z, name]) =>
      enemyGroup(rt, { faction: 'saito', name, fixed: true, anchor: { x, z }, facing: 0, formation: 'yari', yariRanks: 3,
        aggro: 6, morale: 85, fleeDir: { x: 0, z: -1 } }, [{ type: 'ashigaru', n: 12 }, { type: 'samurai', n: 2 }]));
    rt.flags.opposition = [rt.flags.V, rt.flags.M, rt.flags.N, ...rt.flags.reserves, rt.flags.HM, rt.flags.HN];
    rt.flags.taskTick = 0;
    rt.flags.moribePin = { x: POINT2.x, z: POINT2.z, r: FORD_R, hide: FORD_R };
    rt.flags.linePoint = { x: FRONT2.x, z: FRONT2.z };
    // 公記では斎藤勢は墨俣から森部口へ出る。墨俣側は北、細かな布陣は復元。
    // 南北の会戦の並びは保つ。実兵は既に寄せた備、遠景は広い野に残る備として置く。
    const F = rt.flags;
    const KT = nagashinojo.kit;
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => {
      // 大きな控えは三つの槍組に分け、間に通り道を残す（割り振りは復元）。
      // 同じ人数を同じ一枚の描画で扱い、槍と旗が一つの黒い塊になるのを避ける。
      const sonae = count >= 500 && kind === 'spear' ? [-1, 0, 1].map((side, i) => ({
        right: side * 27, front: i === 1 ? 3 : -3, w: 22, d,
        kind: 'spear', banners: 1,
        count: Math.floor(count / 3) + (i < count % 3 ? 1 : 0),
      })) : null;
      // 分けた組にも兵種を渡す。省くと混成の備えになり、鉄砲と騎馬が混ざる。
      // 大幟は各組一本。背の小旗と合わせ、兵の顔と槍列を布で塞がない（本数は復元）。
      return W.addDistantArmy({ x, z, w: sonae ? 76 : w, d: sonae ? d + 6 : d, count, facing, armor, flag, mon: flag, seed, kind, sonae, terrainRanks: true, banners: 1, near: true, host: false, flagRate: 0.12 });
    };
    const KS = ['spear', 'bow', 'spear', 'spear', 'cavalry', 'spear', 'bow', 'honjin', 'spear'];
    // 安八町の伝承は千五百対六千。軽い両翼と後続を含め、敵の厚みを約四倍に見せる。
    // https://www.town.anpachi.lg.jp/0000000392.html
    // 同じ人数の三備を雨の中景へ寄せ、残る後続は北の奥に保つ。配置は復元。
    // 墨俣側の控え。龍興本人の出陣を確かな事として描かない。
    F.farS = [[-86, -64], [-168, -360], [-30, -88], [74, -70], [136, -320], [-180, -240], [100, -260], null, [-100, -440]]
      .map((q, i) => {
        if (!q) return null;
        const army = DA(q[0], q[1], 52, KS[i] === 'bow' ? 12 : (KS[i] === 'honjin' ? 44 : 24), KS[i] === 'cavalry' ? 80 : KS[i] === 'bow' ? 220 : 600, 0, i % 2 ? 0x3a3a30 : 0x35382c, 'saito', 5 + i, KS[i]);
        // 寄せた描画用の三備から実兵を増やさず、任務と難しさを保つ。
        if (i === 0 || i === 2 || i === 3) army.noWake = true;
        return army;
      }).filter(Boolean);
    const KO = ['spear', 'bow', 'cavalry', 'spear', 'mixed'];
    F.farO = [[-192, 580], [-100, 640], [0, 640], [-40, 500], [-260, 570]]
      .map(([x, z], i) => DA(x, z, 22, KO[i] === 'bow' ? 6 : 12, KO[i] === 'cavalry' ? 12 : 40, Math.PI, KT.ARMOR.oda, i === 2 ? 'eiraku' : 'oda', 20 + i, KO[i]));
    // 楡俣川を同じ時に渡る織田の後続（軽い作り）。合図で前へ出る。
    F.farX = [[-110, 96, 160], [-170, 100, 120], [86, 110, 120]]
      .map(([x, z, n], i) => DA(x, z, 34, 10, n, Math.PI, KT.ARMOR.oda, 'oda', 40 + i, 'spear'));
    F.farO.push(...F.farX);
    // 濃尾の野は平らで、雨の日は遠い山並みが見えない（灰色の空に山の形の穴が開いて見えるのを防ぐ）。
    if (W.mountains) W.mountains.visible = false;
    // 信長の本陣：陣幕の内に床几の大将と諸将、後ろに馬印と旗本
    F.odaCamp = camp(rt, { x: CAMP2.x, z: CAMP2.z, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長', haori: 0x7a1d14 }, guard: 15, reserve: 0, runTo: { x: -20, z: 60 } });
    // 両翼の後方に控えの幕。白幟だけの野に、地面へ接した陣の横の輪郭を置く。
    // 所在は復元。戦う帯・控えの進路から外し、新たな兵や障害物を増やさない。
    for (const [x, z] of [[-58, -30], [64, -28]]) {
      W.addGroundShade(x, z, 22, 12, 0, .3);
      rt.scene.add(jinmaku(W, x, z, 20, 10, 8, { mon: 'saito', solid: false }));
      for (const dx of [-11, 11]) rt.scene.add(nobori(W, x + dx, z - 4, 'saito', 5.5));
    }
    // 陣幕の口と向きが逆でも、実兵の旗本は敵の来る北側を守る。
    const guard = F.odaCamp.guard, shift = CAMP2.z - 13 - guard.anchor.z;
    guard.anchor.z = CAMP2.z - 13;
    for (const u of guard.units) { u.pos.z += shift; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.mesh.position.copy(u.pos); }
    F.odaCamp.guard.formation = 'yari';
    rt.scene.add(nobori(W, -12, CAMP2.z + 6, 'eiraku', 5.5));
    // 遠景の村（西の在所）
    KT.farVillage(rt, -126, -30, { rot: -Math.PI / 2, n: 6, fields: 8, seed: 4 });
    // 両翼の槍の前線。音・旗・煙の仕組みは共通の呼び口を使う。
    // 中央の実兵の両脇へ同じ人数を寄せ、前列同士の空白を短くする。実兵化と難しさは保つ。
    F.fronts = [-19, 21].map((x, i) => clash(rt, { x, z: i ? 38 : 30, facing: Math.PI, w: 26, gap: 2.5, gap0: 16, seed: 231 + i,
      groundedMelee: true,   // 同じ兵数の押し合いから、既存の泥跳ねと低い飛沫の霞を出す。
      measuredMelee: true,   // 前列の踏み込みと後列の詰め、押し返しの時間差を共通の動きで出す。
      noReserve: true,   // 台本の控え以外に、共通の新手を追加しない。
      noWake: true, noRout: false, killRate: 0.3, nearHide: 0, host: false,
      // 両翼は奥行きの深い槍列。背の旗を減らし、実兵の背後を白い布で塞がない。
      // 大幟・兵数・並び・押し合いの進みは保つ（指物の割合は復元）。
      A: { flag: 'oda', armor: KT.ARMOR.oda, count: 100, kind: 'spear', team: 0, faction: 'oda', flagRate: 0.08, bannerStride: 12 },
      B: { flag: 'saito', armor: KT.ARMOR.saito, count: 400, kind: 'spear', team: 1, faction: 'saito', flagRate: 0.08, bannerStride: 12 } }));
    // 重複する後方軍勢は足さない。備え表の控えは上の遠景と開戦時の実兵へ結ぶ。
    // 序盤から川向こうの敵が見える。射かける音は実際の弓兵に任せる。
    for (const [x, z] of [[20, 54], [42, 52], [30, 48]]) rt.scene.add(nobori(W, x, z, 'saito', 5.5));
    rt.after(1, () => {
      const V = rt.flags.V;
      if (gone(V)) return;
      V.speed = 2.1;   // 雨の畦を先手が北岸へ寄せてくる。
      V.order = 'move'; V.dest = { x: 40, z: 72 };
      V.onArrive = (g) => { rt.flags.vArrived = rt.t; g.order = 'attack'; g.seekRange = 35; g.anchor = { x: 40, z: 72 }; };
      if (!rt.flags.signal) rt.marker('V', centerOf(V), '斎藤の先手', { red: true, group: V });
      rt.say('足軽', '向こう岸に斎藤の先手！　岸へ寄せてくるぞ！', 3);
    });
    buildBattleJin(rt);
    moribeCloth(rt);
    // 備え表の結び直し後も槍列を保つ。最初に接する先手だけは二列で動きを見せる。
    for (const g of [...F.friends, ...F.opposition]) {
      g.formation = 'yari'; g.yariRanks = g === F.V ? 2 : 3;
      // 接触中も肩が重ならない間隔を残し、本人の構えと穂先を読めるようにする。
      g.spacing = Math.max(g.spacing, 1.9);
    }
    for (const g of rt.squadGroups) { g.formation = 'yari'; g.yariRanks = 2; }
    // 前備が目の前の浅瀬の脇を歩いて渡る。跳ばずに進めることを動きで見せる。
    for (const [g, x, z] of [[F.A, 34, 70], [F.B, -22, 70], [F.Y, -40, 60], [F.R3, 64, 66]]) {
      g.leader = g.units.find((u) => u.type === 'busho') || g.units.find((u) => u.type === 'samurai');
      g.order = 'move'; g.dest = { x, z }; g.speed = 2;
      g.onArrive = (u) => { u.order = 'hold'; };
    }
  },

  update(rt, dt) {
    const F = rt.flags, p = rt.player.u.pos;
    nagashinojo.kit.backTick(rt);
    if (rt.over || F.ending || !rt.player.u.alive) return;
    // 時刻で言わせず、実際に腿ほどの水へ入った瞬間だけ知らせる。
    // 水深は描いた川面を使う。歩みの遅さと足元のしぶきも共通の水の処理へ結ぶ。
    if (!F.fordVoice && Math.abs(p.z - nireZ(p.x)) < 9 && rt.world.waterFootDepthAt(p.x, p.z, p.y) >= 0.4) {
      F.fordVoice = true;
      rt.hud.bark('仲間「砂色の浅瀬を進め。向こう岸の印で待ってくれ」');
    }
    // 渡河の到着だけはピンと同じコマで反映する。隊の見直しの一秒を待たせない。
    if (!F.signal) {
      // 一度渡った後は北岸全体を到着済みとする。小旗を通り越しても戻らせない。
      F.pointInside = F.pointReached || playerAtFord(p, rt.world);
      if (F.pointInside && !F.pointReached) {
        F.pointReached = true; F.fordArrivedAt = rt.t; F.fordWaitEnd = rt.t + 8;
      }
    }
    // 迎撃中は少し敵へ踏み込んでも集合へ戻さない。戻りの印は合流まで保つ。
    if (F.stage === 'hold' || F.stage === 'contact' && F.vBroken) {
      const d = Math.hypot(p.x - F.linePoint.x, p.z - F.linePoint.z);
      if (d < 18) F.lineReached = true;
      // 初回は印まで集め、到着後は守備範囲を離れた時だけ戻す。
      F.lineReturning = d >= (F.lineReturning || !F.lineReached ? 18 : 24);
    }
    // 任務と隊の見直しは一秒ごと。毎コマ配列や行き先を作らない。
    F.taskTick -= dt;
    if (F.taskTick > 0) return;
    if (rt.player.u.alive && !rt.choice) this.autoSquadOrder(rt);
    quietOtherFlags(rt, !F.signal || F.stage === 'press' || F.stage === 'assemble' ? null : F.stage === 'hold' ? !gone(F.B) && F.B : !gone(F.A) && F.A);
    const elapsed = F.lastTask === undefined ? 1 : rt.t - F.lastTask;
    F.lastTask = rt.t; F.taskTick = 1;
    // 人数と画面から見た方向を一秒ごとに更新。視界外でも仲間が消えたと見せない。
    let squadAlive = 0, squadNear = 0, squadAcross = 0, trailing = null, trailDist = 0;
    for (const u of rt.squad) {
      if (!u.alive || u.gone || u.fleeing || u.woundOut || u.noTarget || u.group?.routed) continue;
      squadAlive++;
      const distance = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (distance < 16) squadNear++;
      if (Math.hypot(u.pos.x - POINT2.x, u.pos.z - POINT2.z) < 16) squadAcross++;
      if (distance > trailDist) { trailDist = distance; trailing = u; }
    }
    const atPoint = playerAtFord(p, rt.world);
    F.squadContext = !F.signal
      ? atPoint ? `自分は到着・仲間 ${squadAcross}／${squadAlive}人が到着` : `仲間 ${squadNear}／${squadAlive}人がついてくる`
      : `仲間：そばに${squadNear}／${squadAlive}人`;
    if (F.signal && trailing && trailDist >= 16) F.squadContext += '\n' + moribeDestination(rt, trailing.pos, `離れた仲間まで約${Math.ceil(trailDist / .75)}歩`);
    clearOldSpeech(rt);
    if (!F.breathUsed && F.signal && rt.player.u.hp > 0 && rt.player.u.hp < 30 && rt.G.difficulty !== 'hard') {
      F.breathUsed = true; F.breathUntil = rt.t + 12;
      rt.marker('retreatRoad', RETREAT2, '退く道・南の畦へ', { minor: true });
      rt.bark('深手だ。仲間を呼び、南の畦へ下がれ', true);
    }
    // 使番の足を速めず、まだ前の下知を守っている理由を伝える。
    const waitingOrder = rt.squadGroups?.some((g) => g.pending?.id === 'attack' || g.pending?.id === 'follow');
    if (!!waitingOrder !== !!F.attackOrderWaiting) {
      F.attackOrderWaiting = !!waitingOrder;
      // 号令を続けて出しても、往復の知らせで任務を埋めない。
      if (rt.t >= (F.orderNoticeAt || 0)) {
        F.orderNoticeAt = rt.t + 32;
        rt.bark(waitingOrder ? '隊長の合図を仲間へ伝えている' : '隊長の合図が仲間に届いた');
      }
    }
    // 届いた号令と、列や地形で止まる理由を分けて記録する。一秒に一度だけ。
    for (const g of rt.squadGroups || []) {
      const st = g.moribeOrderStatus || (g.moribeOrderStatus = {});
      let ready = 0, fighting = 0, blocked = 0, rear = 0, moving = 0;
      for (const u of g.units) {
        if (!u.alive || u.fleeing || u.woundOut) continue;
        ready++;
        if (u.target?.alive && !u.target.isStruct) fighting++;
        if (u.pressBack || u._gated) rear++;
        if (u.moving > 0.1) moving++;
        const want = u.moveTo || g.slotPos(u.slot, g.initial);
        if (rt.army.wallBetween(u.pos, -1, want) || !rt.world.walkable(want.x, want.z)) blocked++;
      }
      st.order = g.pending ? '使番が向かっている' : g.order;
      st.ready = ready; st.fighting = fighting; st.blocked = blocked; st.rear = rear; st.moving = moving;
      st.target = g.focus?.name || g.units.find(u => u.alive && u.target?.alive)?.target?.group?.name || '';
      const reason = g.pending || moving || !ready ? '' : blocked ? '畦を回る。旗のそばへ寄れ！' : rear ? '前の槍を支えておる。列をそろえて押せ！' : fighting ? '敵の槍に止められておる。組で押し返せ！' : '';
      if (reason && reason !== st.reason && rt.t >= (F.squadStopSayAt || 0)) {
        rt.bark(`仲間「${reason}」`); F.squadStopSayAt = rt.t + 32;
      }
      st.reason = reason;
    }
    if (F.signal && (F.friends.every(gone) || F.odaCamp.general?.woundOut)) {
      if (!F.collapseWarn) { F.collapseWarn = rt.t; rt.bark('味方の備が崩れた。仲間を呼び、川の方へ下がれ', true); }
      if (rt.t >= 240 && rt.t - F.collapseWarn >= 30 && rt.canFailMission()) { this.endBattle(rt, false); return; }
    }
    let friendDist = Infinity;
    for (const g of F.friends) if (!gone(g)) { const c = g.center(); friendDist = Math.min(friendDist, Math.hypot(p.x - c.x, p.z - c.z)); }
    let squadDist = Infinity;
    for (const g of rt.squadGroups) if (!gone(g)) { const c = g.center(); squadDist = Math.min(squadDist, Math.hypot(p.x - c.x, p.z - c.z)); }
    const separated = F.signal && rt.t >= 30 && rt.t - F.signal >= 30 && F.stage !== 'assemble' &&
      (friendDist > 40 || (squadDist !== Infinity && squadDist > 40));
    // 一度示した仲間は合流まで保つ。四十歩の境で消したり別人へ移したりしない。
    let squadGuide = F.squadGuide;
    if (squadGuide && (F.stage === 'assemble' || !squadGuide.alive || squadGuide.gone || squadGuide.fleeing ||
        squadGuide.woundOut || squadGuide.rearWound || squadGuide.noTarget || squadGuide.group?.routed)) squadGuide = null;
    let squadGuideDist = squadGuide ? Math.hypot(squadGuide.pos.x - p.x, squadGuide.pos.z - p.z) : Infinity;
    if (!squadGuide && separated) for (const u of rt.squad) {
      if (!u.alive || u.gone || u.fleeing || u.woundOut || u.rearWound || u.noTarget || u.group?.routed) continue;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (d < squadGuideDist) { squadGuideDist = d; squadGuide = u; }
    }
    if (squadGuideDist < 16) squadGuide = null;
    if (F.squadGuide !== squadGuide) {
      F.squadGuide = squadGuide;
      if (squadGuide) rt.marker('squadReturn', () => F.squadGuide?.pos, '離れた仲間・そばで呼べ');
      else rt.unmark('squadReturn');
    }
    const separateText = squadDist !== Infinity && squadDist > 40
      ? F.squadGuide ? '仲間が遠い。仲間の印へ迎えに行け' : '仲間を呼び集め、味方の黄色い旗へ戻れ'
      : '味方の列から離れた。仲間と黄色い旗へ戻れ';
    if (separated && !(F.separateSayAt > rt.t)) {
      F.separateSayAt = rt.t + 32; rt.bark(separateText, true);
    }
    const u = rt.player.u;
    if (!F.signal) {
      let alive = 0, near = 0;
      const arrivals = F.fordArrivals || (F.fordArrivals = []);
      arrivals.length = 0;
      for (const u of rt.squad) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget && !u.group?.routed) {
        alive++;
        const remaining = Math.max(0, Math.hypot(u.pos.x - POINT2.x, u.pos.z - POINT2.z) - 16);
        if (!remaining) near++;
        arrivals.push(remaining / Math.max(.5, u.group?.speed || 1.5));
      }
      arrivals.sort((a, b) => a - b);
      const waitSeconds = Math.max(1, Math.ceil(arrivals[Math.ceil(alive * .6) - 1] || 0));
      F.pointReady = alive === 0 || near >= Math.ceil(alive * 0.6);
      if (F.pointInside) {
        F.fordWaitMax = Math.max(F.fordWaitMax || 1, waitSeconds);
        F.fordGatherProgress = F.pointReady ? 1 : Math.max(F.fordGatherProgress || 0, 1 - waitSeconds / F.fordWaitMax);
      }
      // 実際に六割が岸へ着いたらすぐ合図。集合の後に秒待ちを重ねない。
      // 集結中にも先手は寄せてくる。「待て」だけで無防備に立たせない。
      const approaching = rt.army.nearestEnemy(rt.player.u, 8, (u) => !u.fleeing && !u.woundOut && !u.noTarget);
      F.fordThreat = !!(approaching && sightPoint(rt, approaching.pos));
      if (!F.pointDone) {
        const ready = F.pointReady;
        const task = rt.objectives.find((o) => o.id === 'point');
        if (task) {
          if (!F.pointInside) task.text = F.pointReached ? '仲間と集まれ' : '川を渡れ';
          else if (F.fordThreat) task.text = 'この場所で仲間と敵を迎え撃て';
          else if (!ready) task.text = `仲間を待て（目安${waitSeconds}秒）`;
          else task.text = '仲間がそろった、味方と進め';
        }
        rt.objProgress('point', '');
      }
      if (!F.pointDone && F.pointInside && F.pointReady) {
        F.pointDone = true; rt.objDone('point'); rt.objRemove('point'); rt.unmark('point'); rt.unzone('point');
        rt.award((t) => { t.c.point = 1; }, '渡河して組をそろえた');
      }
      if (!F.fordNudge && rt.t > 20 && !F.pointReached) { F.fordNudge = true; orderSpeech(rt, '浅瀬を渡り、向こう岸まで進め', 4); }
      if (F.pointDone || (F.pointInside && F.fordThreat) || F.pointReached && rt.t >= F.fordWaitEnd) this.signal(rt);
      return;
    }
    this.feedReserves(rt);
    this.advanceEnemies(rt);
    this.advanceFriends(rt);
    if (F.stage === 'contact') {
      if (rt.t - F.signal >= 12) nearbyVoice(rt, F.A, '柴田勝家', 'shibataVoice', '槍を並べよ！　川を背に、一人も取り残すな！');
      if (!F.vBroken && gone(F.V)) this.onRout(rt, F.V);
      rt.objProgress(F.vBroken ? 'support' : 'break', '');
      // 先手が退いた時点で本備と控えを寄せる。次の斬り合いを待ってから下知しない。
      if (F.vBroken) {
        rt.objRemove('break'); rt.unmark('V');
        rt.objRemove('support'); rt.unmark('support');
        moribeHoldPoint(rt);
        F.stage = 'hold'; F.holdStart = rt.t; F.lineT = 0;
        F.lineReached = Math.hypot(p.x - F.linePoint.x, p.z - F.linePoint.z) < 18;
        F.lineReturning = !F.lineReached;
        rt.setPhase('hold'); rt.banner('槍を打ち合わせる', '雨の中、両軍が押し合う');
        rt.obj('line', '印へ仲間と集まれ', 'main');
        rt.marker('line', () => F.linePoint, () => F.lineT >= 25 ? '本備の横・列を支えた。控えに備えよ' : '守る印・仲間と守れ', { hideNear: 24, hideOnArrival: true });
        orderSpeech(rt, '印へ集まれ。印に着いたら、その場で敵を迎え撃て', 5);
        for (const g of [F.M, F.N]) if (!gone(g)) { if (g.order !== 'move') g.order = 'attack'; g.seekRange = 30; }
      }
    } else if (F.stage === 'hold') {
      const el = rt.t - F.holdStart;
      if (el >= 12) nearbyVoice(rt, F.Y, '森可成', 'moriVoice', '横はわしらが支える！　組で槍を合わせよ！');
      let together = 0;
      for (const u of rt.squad) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget && !u.group?.routed && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 16) together++;
      const closeEnemy = rt.army.nearestEnemy(rt.player.u, 16, (u) => !u.fleeing && !u.woundOut && !u.noTarget);
      const insideLine = !F.lineReturning;
      const lineReady = (together > 0 || squadAlive === 0) && insideLine && !gone(F.B);
      F.lineTogether = together; F.lineReady = lineReady;
      // 退く下知と、旗で待つ秒読みを同時に出さない。退避中は働きの確認も休める。
      const fallingBack = F.breathUntil > rt.t || u.mobbed || gone(F.B);
      if (lineReady && !fallingBack) F.lineT += elapsed;
      // 敵がいる時もいない時も任務は守備。攻撃を禁じる「待て」は出さない。
      const holdSeconds = Math.max(1, Math.ceil(100 - el));
      const lineAction = F.breathUntil > rt.t ? '退く道の印へ下がる' : gone(F.B) ? closeEnemy ? '構えながら、南の畦へ下がれ' : '南の畦へ下がる' : u.mobbed ? '味方と列をそろえ直せ' : !insideLine ? '印へ仲間と集まれ' : `到着。この場を守れ（反撃まで最長${holdSeconds}秒）`;
      const task = rt.objectives.find((o) => o.id === 'line');
      if (task) task.text = lineAction;
      const guardHelp = closeEnemy && lineReady && !fallingBack && !F.squadGuide ? '。印に到着。味方とこの場を守れ' : '';
      rt.objProgress('line', '');
      if (F.lineT >= 25 && !F.lineAwarded) { F.lineAwarded = true; rt.award((t) => t.side.push('槍の押し合いを支えた'), '槍列を支えた。控えにも備えよ'); }
      // 組で列を支え、二手の控えを受けた働きが反撃を早める。時間だけで手柄は付けない。
      const counterattack = F.lineAwarded && el >= 45 &&
        (F.wave1 || gone(F.reserves[0])) && (F.wave2 || gone(F.reserves[1]));
      // 前の槍列がすべて退けば、控える旗本だけを残して百秒待たせない。
      const frontBroken = gone(F.V) && gone(F.M) && gone(F.N) && F.reserves.every(gone);
      const enemyBroken = F.opposition.every(gone);
      if (el >= 100 || counterattack || frontBroken || enemyBroken) {
        if (F.lineT >= 25) { rt.objDone('line'); }
        else rt.objFail('line');
        rt.objRemove('line'); rt.unmark('line'); rt.unmark('lineFlag'); rt.unzone('line');
        F.stage = 'press'; F.pressStart = rt.t; rt.setPhase('press');
        rt.banner(enemyBroken ? '敵が退いた' : counterattack ? '組の働きで、反撃へ' : '大将の旗本へ', enemyBroken ? '深追いせず、列を保て' : counterattack ? '支えた槍列が、両将の旗本へ押し出す' : '長井甲斐守・日比野下野守の旗が、雨の向こうに残る');
        rt.obj('commanders', (F.bossDown || 0) < 2 ? '長井甲斐守・日比野下野守を討て' : '味方と進み、残る敵を押せ', 'main');
        orderSpeech(rt, enemyBroken ? '敵は退いた。組を離すな。残る旗を見届けよ' : counterattack ? 'お主の組が列を支えた！　陣太鼓の早打ちじゃ、味方と押し出して両将の旗本を囲め！' : '陣太鼓の早打ちじゃ！　長井と日比野の旗本へ、味方と並んで押すぞ。一人で走るな！', 5);
        if (!enemyBroken) {
          moribeSignal(rt, 'kakari');
          // 長い押し合いで両将も手負い。旗本に守られても、囲めば討てる。
          for (const g of [F.HM, F.HN]) if (!gone(g)) {
            g.speed = 2.2; g.seekRange = 8;
            g.order = 'hold'; g.dest = null; g.onArrive = null;
            for (const u of g.units) if (u.type === 'busho' && u.alive) u.hp = Math.min(u.hp, u.maxHp * 0.5);
            // 大将の後ろに控えていた後備が雨の中から続き、大将の周りが入り乱れる（見える兵は250まで）。
            //   段の切り替えの一コマに兵を作り重ねない（稲生と同じく、出る兵は少しずつ時をずらす）。
            rt.after(g === F.HM ? .4 : .8, () => {
              if (F.ending || rt.over || gone(g)) return;
              const live = rt.army.units.reduce((n, u) => n + (u.alive ? 1 : 0), 0);
              if (live >= 210) return;
              const c = g.center();
              g.rear = enemyGroup(rt, { faction: 'saito', name: g === F.HM ? '日比野の後備' : '長井の後備', fixed: true,
                anchor: { x: c.x + (g === F.HM ? 8 : -8), z: c.z - 26 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 8, morale: 90, noRout: true, formation: 'yari', yariRanks: 2 },
              [{ type: 'ashigaru', n: 14 }, { type: 'samurai', n: 2 }]);
              g.rear.speed = 2.3;
              F.opposition.push(g.rear);
            });
          }
          battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.HM.anchor, F.HM, 1, true, '長井甲斐守・日比野下野守が、旗本を率いて自ら前へ出た');
          // 柴田の二の備が後ろから追いつき、自分の左右で大将の旗本へ槍を入れる。
          rt.after(1.2, () => {
            if (F.ending || rt.over || rt.army.units.reduce((n, u) => n + (u.alive ? 1 : 0), 0) >= 215) return;
            const p = rt.player.u.pos;
            const g2 = allyGroup(rt, { name: '柴田の二の備', fixed: true, anchor: { x: p.x + 6, z: p.z + 22 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 2 },
              [{ type: 'ashigaru', n: 16 }, { type: 'samurai', n: 2 }]);
            g2.order = 'attack'; g2.seekRange = 45; g2.speed = 2.4;
            F.friends.push(g2);
          });
        }
        for (const g of F.friends) if (!gone(g)) { g.calm = false; g.order = 'attack'; g.seekRange = 35; }
      }
    } else if (F.stage === 'press') {
      if (rt.t - F.pressStart >= 8) nearbyVoice(rt, F.HM, '日比野下野守', 'hibinoVoice', '日比野下野守はここじゃ！　旗を捨てるな、槍で押し返せ！');
      if (rt.t - F.pressStart >= 20) nearbyVoice(rt, F.HN, '長井甲斐守', 'nagaiVoice', 'まだ退かぬ！　旗本、わしに続け！');
      // 大将が長く討たれぬ時は、乱戦の別の所で織田の兵に討たれる（公記どおり両将とも討死。戦が終わらない事も防ぐ）。
      // 一人ずつ（七十五秒と百秒）。同じ瞬間に二つの見出しを重ねない。
      const fall = rt.t - F.pressStart >= 100 ? 2 : rt.t - F.pressStart >= 75 ? 1 : 0;
      if ((F.bossDown || 0) < fall && !(F.bossFallAt > rt.t)) {
        const u = F.HM.units.find((x) => x.type === 'busho' && x.alive) || F.HN.units.find((x) => x.type === 'busho' && x.alive);
        if (u) { F.bossFallAt = rt.t + 5; rt.army.kill(u, null); }
      }
      if (!F.standDown && fall >= 2) { F.standDown = true; for (const g of F.opposition) g.noRout = false; }
      // 総大将の討死・側面攻撃・逃亡の連鎖は共通の士気の仕組みに任せる。
      let left = 0, commanders = 0, target = null, remainingName = '';
      for (const g of F.opposition) if (!gone(g)) {
        left++; if (!target) target = g;
        for (const u of g.units) if (u.type === 'busho' && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget) { commanders++; remainingName = u.name; }
      }
      // 敗走を確かめる八秒も、任務の見出しと下知をそろえる。
      const task = rt.objectives.find((o) => o.id === 'commanders');
      if (task) task.text = (F.bossDown || 0) < 2 ? commanders > 1 ? '長井甲斐守・日比野下野守を討て' : commanders === 1 ? `${remainingName}を討て` : '味方と両将の旗本を攻めよ' : !left ? '川への道を守り、戻る合図を待て' : '仲間と残る敵と戦え';
      // 大将が生きている備を先に指す。印は大将の身に付け、旗本の侍に囲まれた所を見せる。
      for (const g of F.opposition) if (!gone(g) && g.units.some((u) => u.type === 'busho' && u.alive && !u.fleeing)) { target = g; break; }
      if (target !== F.marked) {
        F.marked = target;
        const boss = target?.units.find((u) => u.type === 'busho' && u.alive);
        if (boss) rt.marker('commanders', () => boss.alive && !boss.fleeing ? boss.pos : centerOf(target)(), `${boss.name}の旗本`, { red: true, group: target });
        else if (target) rt.marker('commanders', centerOf(target), '斎藤の旗', { red: true, group: target });
        else rt.unmark('commanders');
      }
      // 進む印と任務は同じ大将一人を指す。二人分の長い官名を並べない。
      const markedBoss = F.marked?.units.find((u) => u.type === 'busho' && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget);
      if (task && markedBoss && !F.squadGuide) task.text = `${markedBoss.name}を仲間と討て`;
      rt.objProgress('commanders', '');
      // 最後の敵の備が崩れたら、その場で勝ちにする。
      if (!left) {
        battleEvent(rt, EVENT_RETREAT, FRONT2, null, 1, true, '斎藤勢が墨俣の方へ退き始めた');
        F.farS.forEach((m, i) => rt.after(i * 1.2, () => m.rout({ hideAfter: 0 })));
        F.fronts.forEach((c) => c.rout('B', { hideAfter: Infinity }));
        this.endBattle(rt, true);
        return;
      }
    }
    if (!F.longWarn && rt.t >= 390) { F.longWarn = true; orderSpeech(rt, '攻めが長引いておる。備が崩れねば、組を川へ下げるぞ', 4); }
    if (!F.ending && rt.t >= 420) this.endBattle(rt, false);
  },

  feedReserves(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.stage === 'assemble') return;
    let near = 0;
    for (const g of F.opposition) {
      if (gone(g) || (g === F.reserves[0] && !F.wave1) || (g === F.reserves[1] && !F.wave2)) continue;
      for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget &&
          u.type !== 'bow' && u.type !== 'gun' && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 30) near++;
    }
    // 前線が薄くなったら、段の時計より先に下知する。二手は十秒以上ずらす。
    const thin = rt.t - F.signal >= 25 && near <= 6;
    for (let i = 0; i < F.reserves.length; i++) {
      const warned = i ? 'wave2Warn' : 'wave1Warn', sent = i ? 'wave2' : 'wave1';
      if (F[sent] || gone(F.reserves[i])) continue;
      if (i && !gone(F.reserves[0]) && (!F.wave1 || rt.t - F.wave1At < 10)) continue;
      const due = F.stage === 'hold' && rt.t - F.holdStart >= (i ? 22 : 0);
      if (F[warned] === undefined && (due || thin || (!i && F.vBroken))) {
        F[warned] = rt.t;
        rt.marker('retreatRoad', RETREAT2, '退く道・南の畦へ', { minor: true });
        rt.bark(i ? '斎藤の控えがまた来る。味方の列で迎えよ。退くなら南の畦だ' : '斎藤の控えが来る。味方の列で迎えよ。退く道は南の畦だ', true);
      }
      if (F[warned] !== undefined && rt.t - F[warned] >= 4) {
        F[sent] = true; F[i ? 'wave2At' : 'wave1At'] = rt.t; this.reserve(rt, i);
      }
    }
  },

  advanceEnemies(rt) {
    const F = rt.flags;
    if (F.stage === 'assemble') return;
    const flag = rt.squadGroups.find((g) => !gone(g));
    const cFlag = flag ? fightingCenter(flag) : rt.player.u.pos;
    const p = rt.player.u.pos;
    // 迎撃の敵は守備地点へ来る。離れた組を追って持ち場から遠ざからない。
    const aim = F.stage === 'hold' ? F.lineReturning ? F.linePoint : p :
      Math.hypot(cFlag.x - p.x, cFlag.z - p.z) <= 24 ? p : cFlag;
    for (const g of F.opposition) {
      if (gone(g) || g.hatamoto || (g === F.reserves[0] && !F.wave1) || (g === F.reserves[1] && !F.wave2)) continue;
      if (g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget &&
          u.type !== 'bow' && u.type !== 'gun' && u.target?.alive && !u.target.gone &&
          !u.target.fleeing && !u.target.woundOut && !u.target.noTarget &&
          Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) < 8)) continue;
      const c = fightingCenter(g);
      if (Math.hypot(c.x - aim.x, c.z - aim.z) <= 3) {
        // 前列は着いている。後列の到着待ちで「移動」の探索六歩に閉じ込めない。
        g.order = 'attack'; g.seekRange = 35; g.onArrive = null;
        continue;
      }
      const dest = g._moribePushDest || (g._moribePushDest = { x: 0, z: 0 });
      // 八歩手前で止めず、槍が届く位置まで既存の隊を進める。
      dest.x = aim.x + (g === F.N || g === F.reserves[0] ? -1.8 : 1.8); dest.z = aim.z - 1.8;
      g.order = 'move'; g.dest = dest;
      g.onArrive = g._moribePushArrive || (g._moribePushArrive = (arrived) => { arrived.order = 'attack'; arrived.seekRange = 35; });
    }
  },

  advanceFriends(rt) {
    // 「攻める」だけでは探索の外の敵へ歩かず、古い畦へ戻り続ける。
    // 先手の後も同じ兵が前へ続く。本備は会戦の範囲で自分の後ろを支える。
    const F = rt.flags, p = rt.player.u.pos;
    if (F.stage === 'assemble') return;
    for (const g of F.friends) {
      if (gone(g) || (g.order !== 'attack' && g.order !== 'move') || g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget &&
          u.target?.alive && !u.target.fleeing && !u.target.woundOut && !u.target.noTarget &&
          Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 8)) continue;
      const c = fightingCenter(g);
      // 守る段は、近い備を守る印の左右へ寄せる（稲生と同じく、味方が集まる絵で持ち場を示す）。
      //   集まるのは守る段の初めの二十秒だけ。その後は寄せる敵へ当たり、印のそばで立ち尽くさない。
      if (F.stage === 'hold' && F.linePoint && rt.t - F.holdStart < 20) {
        const lx = F.linePoint.x, lz = F.linePoint.z;
        if (Math.hypot(c.x - lx, c.z - lz) < 60) {
          // 印のそばで敵へ向かっている備は引き戻さない（綱引きにしない）。
          if (g.order === 'attack' && g.units.some((u) => u.alive && u.target?.alive && !u.target.fleeing)) continue;
          const side = c.x < lx ? -1 : 1, off = Math.max(7, Math.min(16, Math.abs(c.x - lx)));
          const dest = g._moribeHoldDest || (g._moribeHoldDest = { x: 0, z: 0 });
          dest.x = lx + side * off; dest.z = lz - 4;
          // 着いた備は印のそばから寄せる敵へ当たる。立ち尽くさせず、遠くの印へ引き戻し続けもしない。
          if (Math.hypot(c.x - dest.x, c.z - dest.z) < 6) { g.order = 'attack'; g.seekRange = 45; g.onArrive = null; }
          else {
            g.order = 'move'; g.dest = dest;
            g.onArrive = g._moribeHoldArrive || (g._moribeHoldArrive = (arrived) => { arrived.order = 'attack'; arrived.seekRange = 45; });
          }
          continue;
        }
      }
      const escort = g === F.B && Math.hypot(p.x - FRONT2.x, p.z - FRONT2.z) < 65 &&
        Math.hypot(p.x - c.x, p.z - c.z) > 18;
      let nearest = null, distance = Infinity;
      // 任務の印は一つでも、味方の備は二手の旗本を囲む。
      // 前備と右手は日比野、本備と横備えは長井へ。片方が退いたら残る備へ回る。
      // 距離だけで選ぶと四隊とも近い旗本に重なり、敵が味方の肩に埋もれる。
      const assigned = g === F.A || g === F.R3 ? F.HM : F.HN;
      if (F.stage === 'press') for (const foe of F.opposition) {
        if (!foe.hatamoto || gone(foe)) continue;
        if (!gone(assigned) && foe !== assigned) continue;
        const q = fightingCenter(foe), d = Math.hypot(q.x - c.x, q.z - c.z);
        if (d < distance) { nearest = q; distance = d; }
      }
      if (!nearest) for (const foe of F.opposition) {
        if (gone(foe) || (foe.hatamoto && F.stage !== 'press') ||
            (foe === F.reserves[0] && !F.wave1) || (foe === F.reserves[1] && !F.wave2)) continue;
        const q = fightingCenter(foe), d = Math.hypot(q.x - c.x, q.z - c.z);
        if (d < distance) { nearest = q; distance = d; }
      }
      if (!escort && (!nearest || distance <= 18)) {
        if (nearest) { g.order = 'attack'; g.seekRange = 35; g.onArrive = null; }
        continue;
      }
      const dest = g._moribePressDest || (g._moribePressDest = { x: 0, z: 0 });
      if (escort) { dest.x = p.x - 8; dest.z = p.z + 8; }
      else {
        // 横の備は敵の左右へ寄せ、中央の味方を横切って同じ一点へ詰めない。
        const flank = g === F.Y ? -10 : g === F.R3 ? 10 : 0;
        dest.x = nearest.x + ((c.x - nearest.x) * 12 - (c.z - nearest.z) * flank) / distance;
        dest.z = nearest.z + ((c.z - nearest.z) * 12 + (c.x - nearest.x) * flank) / distance;
      }
      g.order = 'move'; g.dest = dest;
      g.onArrive = g._moribePressArrive || (g._moribePressArrive = (arrived) => { arrived.order = 'attack'; arrived.seekRange = 35; });
    }
  },

  signal(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.signal) return;
    F.signal = rt.t; F.stage = 'contact'; rt.setPhase('contact');
    // 合図の後は先手が岸の遊び手へ寄せる。古い持ち場で待ち続けない。
    if (!gone(F.V)) { F.V.order = 'attack'; F.V.seekRange = 35; F.V.aggro = 18; F.V.onArrive = null; }
    if (!F.pointDone) rt.objFail('point');
    rt.objRemove('point'); rt.unmark('point'); rt.unzone('point');
    rt.tutEnd();
    moribeSignal(rt, 'kakari');
    rt.after(2.2, () => {
      if (!rt.over && !F.ending && F.stage === 'contact' && !gone(F.A))
        rt.army.playFar('toki', fightingCenter(F.A), 0.8);
    });
    rt.banner('仲間と前の敵を迎え撃て', '赤い三角は敵。印のない兵は味方');
    rt.obj('break', '赤い三角の敵と戦え', 'main');
    rt.marker('V', centerOf(F.V), '斎藤の先手', { red: true, group: F.V });
    rt.marker('frontFlag', () => !gone(F.A) ? fightingCenter(F.A) : !gone(F.B) ? fightingCenter(F.B) : null,
      '前備の旗・味方に続け', { minor: true, hideNear: 16, hideOnArrival: true });
    orderSpeech(rt, '法螺貝と陣太鼓の早打ちじゃ！　鬨を上げ、前備に続け。槍の列を切らすな！', 4);
    for (const g of F.friends) if (!gone(g)) { g.onArrive = null; g.order = 'attack'; g.seekRange = 40; }
    // 中央も隊ごとに前へ出す。左右は中央を突っ切らず、それぞれの畦から横へ回る。
    for (const [g, x, z] of [[F.A, 18, 40], [F.B, -12, 44], [F.Y, -46, 22], [F.R3, 50, 30]]) if (!gone(g)) {
      g.order = 'move'; g.dest = { x, z };
      g.onArrive = (u) => { u.order = 'attack'; u.seekRange = 35; };
    }
    F.V.noRout = false;
    for (const g of [F.M, F.N]) if (!gone(g)) {
      g.order = 'move'; g.dest = { x: g === F.M ? -12 : -44, z: 8 }; g.speed = 2.1;
      // 大将の旗本も備のすぐ後ろへ詰め、押し合いの間は旗を立てて控える。
      const h = g === F.M ? F.HM : F.HN;
      h.order = 'move'; h.dest = { x: g === F.M ? -8 : -36, z: -28 }; h.speed = 1.8;
      h.onArrive = (a) => { a.order = 'hold'; };
      g.onArrive = (u) => { u.order = 'attack'; u.seekRange = 40; };
    }
    // 先手が戦う間に既存の控えを本備の後ろまで歩かせる。初めの斬り合いには加えない。
    for (let i = 0; i < F.reserves.length; i++) {
      const g = F.reserves[i];
      g.order = 'move'; g.dest = { x: i ? 8 : -32, z: i ? -20 : -14 }; g.speed = 2.1;
      g.onArrive = (arrived) => { arrived.order = 'hold'; };
    }
    F.fronts.forEach((c) => c.go());
    F.farO.forEach((m, i) => rt.after(i * 1.3, () => m.advance(24, 18)));
    battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.A.anchor, F.A, 0, true, '織田の槍の列が前へ出た');
  },

  reserve(rt, index) {
    const g = rt.flags.reserves[index];
    if (gone(g)) return;
    const flag = rt.squadGroups.find((squad) => !gone(squad));
    const cFlag = flag ? fightingCenter(flag) : rt.player.u.pos;
    const p = rt.player.u.pos;
    const aim = Math.hypot(cFlag.x - p.x, cFlag.z - p.z) <= 24 ? p : cFlag;
    const dest = g._moribePushDest || (g._moribePushDest = { x: 0, z: 0 });
    dest.x = aim.x + (index ? 6 : -6); dest.z = aim.z - 6;
    g.order = 'move'; g.dest = dest; g.speed = 2.1;
    g.onArrive = (u) => { u.order = 'attack'; u.seekRange = 35; };
    battleEvent(rt, EVENT_REINFORCEMENT, g.center(), g, 1, false, '斎藤の控えが前へ出る');
  },

  endBattle(rt, won) {
    const F = rt.flags;
    // 七分の期限・味方の崩壊は戦固有の決着。近くの敵で共通の待ち時間を延ばさない。
    if (!won && rt.t < 420 && (!rt.canFailMission() || rt.t < 240)) return;
    if (rt.over || F.ending) return;
    F.ending = true; rt.tracker.main = won;
    F.squadGuide = null; rt.unmark('squadReturn');
    if (!won) for (const g of F.friends) if (!gone(g)) {
      g.order = 'move'; g.dest = { x: g.anchor.x, z: 116 }; g.onArrive = (u) => { u.order = 'hold'; };
    }
    const objective = F.stage === 'hold' ? 'line' : F.stage === 'contact' ? 'break' : 'commanders';
    if (won) rt.objDone(objective);
    else rt.objFail(objective);
    rt.unmark('frontFlag'); rt.unmark('support'); rt.objRemove('support');
    rt.unmark('assemble'); rt.unmark('gatherSquad'); F.gatherUnit = null; rt.unzone('assemble'); rt.unmark('commanders'); rt.unmark('line'); rt.unmark('lineFlag'); rt.unzone('line'); rt.unmark('V');
    rt.banner(won ? '森部の勝ち戦' : '仲間と川へ下がれ', won ? '敵の備が崩れ、斎藤勢が退いた' : F.friends.every(gone) || F.odaCamp.general?.woundOut ? '味方の備が崩れた。残る者と川へ退け' : '攻めが長引いた。敵の備が残るため川へ退け');
    orderSpeech(rt, won ? 'よう押し切った。組を離すな。勝鬨を上げるぞ' : '低い法螺貝と二つ打ちの太鼓は退けの合図じゃ。仲間と川へ下がり、備えを立て直せ', 4);
    if (won) {
      // 雨が細り、勝鬨。首実検と次の戦（墨俣）への引きで余韻を残す。
      rt.world.setRainTarget?.(0.25);
      rt.after(2, () => { sfx('victory', 0.9); rt.bark('織田勢「えい、えい、おう！」'); });
      rt.marker('yakushi', YAKUSHI2, '森部の薬師堂・場所と姿は復元');
      rt.after(5, () => {
        // 首実検は共通の首袋・証人の記録に従う。利家へ手柄を付け替えない。
        let confirmed = false, who = '';
        for (const r of rt.meritKills || []) {
          if (r.foe.name !== '足立六兵衛') continue;
          if (r.src.isPlayer) { who = 'player'; break; }
          if (r.src.name !== '前田利家') continue;
          const witness = r.witnesses.some((u) => u.alive && !u.fled && !u.fleeing);
          const head = r.head && r.carrier?.alive && !r.carrier.fled && !r.carrier.fleeing;
          if (head || witness) { confirmed = true; break; }
        }
        F.toshiieAdachiConfirmed = confirmed;
        rt.say('仲間', who === 'player' ? '首取り足立と呼ばれた六兵衛を、お主が討ったとは……' : confirmed ? '前田又左衛門殿が、首取り足立の首を挙げなされた。勘当も解けような' : '前田又左衛門殿も首を挙げたと聞いた。勘当の身で、ようやるわ', 4.5);
      });
      rt.after(10, () => rt.say('隊長 源八（げんぱち）', `${(F.bossDown || 0) >= 2 ? '長井も日比野も討たれた' : '長井と日比野の備は崩れた'}。次は墨俣で足場を守るぞ。美濃への道は、まだ続く`, 5));
    }
    const failureReason = won ? '' : F.friends.every(gone) || F.odaCamp.general?.woundOut
      ? '味方の列が崩れ、川岸を守れなくなった'
      : '時間内に敵を押し返せなかった';
    rt.finish({ scriptedEnd: true, failureReason }, won ? 16 : 11);
    // 終幕の共通音が鳴った後に札を出す。同じ退けの音を札からもう一度鳴らさない。
    if (!won) rt.obj('withdraw', '低い法螺貝と退き太鼓で、仲間と川へ退け', 'main', true);
  },

  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.V && F.signal && F.stage === 'contact' && !F.vBroken) {
      moribeHoldPoint(rt);
      F.vBroken = true; rt.unmark('V'); rt.objDone('break'); rt.objRemove('break');
      rt.obj('support', '印へ仲間と集まれ', 'main');
      rt.marker('support', () => !gone(F.B) ? F.linePoint : !gone(F.A) ? fightingCenter(F.A) : null, '守る印・ここで敵を迎え撃て');
      rt.award((t) => t.side.push('斎藤の先手を押し返した'), '斎藤の先手を押し返した');
      orderSpeech(rt, '目の前の敵は退いた。印へ集まれ。矢印が消えたら次の敵を待つぞ', 4);
    }
    if (!F.ending && !rt.over && (g === F.M || g === F.N) && sightPoint(rt, g.center())) battleEvent(rt, EVENT_UNIT_BREAK, g.anchor, g, 1, true, '斎藤の備が崩れた');
  },

  onKill(rt, v, k) {
    if (v.name === '足立六兵衛' && k?.name === '前田利家' && !rt.flags.toshiieReport) {
      rt.flags.toshiieReport = true; rt.flags.toshiieAdachi = true;
      if (sightPoint(rt, v.pos)) rt.say('足軽', '利家殿が足立六兵衛を討ったぞ！', 3);
    }
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1; else rt.flags.ak = (rt.flags.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (v.type === 'busho' && v.group?.hatamoto) {
      const F = rt.flags;
      F.bossDown = (F.bossDown || 0) + 1;
      // 公記：長井甲斐守・日比野下野守とも討死。名を呼ばわり、残る備の足をすくませる。
      rt.banner(`${v.name}、討死`, F.bossDown >= 2 ? '両将が討たれた。斎藤勢が浮き足立つ' : 'もう一人の大将の旗が残る');
      rt.say(k?.isPlayer ? rt.G.name || '自分' : '足軽', k?.isPlayer ? `${v.name}、討ち取ったり！` : `${v.name}を討ち取ったぞ！`, 4);
      if (k?.isPlayer) rt.award((t) => { t.special = { label: `${v.name}を討ち取った`, pts: 40 }; }, `${v.name}を討ち取った`, v.pos);
      sfx('toki', 0.9);
      // 大将の生きている間は旗本が踏みとどまる。討たれた備から崩れ、両将が討たれれば全体が揺らぐ。
      v.group.noRout = false;
      if (v.group.rear) v.group.rear.noRout = false;
      if (F.bossDown >= 2) for (const g of F.opposition) g.noRout = false;
      for (const g of F.opposition) if (!gone(g)) g.morale = Math.max(0, (g.morale ?? 80) - (g === v.group ? 45 : F.bossDown >= 2 ? 40 : 15));
      F.marked = null;
    }
  },
  onPlayerHit(rt, t) {
    if (!rt.flags.signal && !rt.flags.early && t.team === 1 && t.target !== rt.player.u) {
      rt.flags.early = true; rt.award((t) => t.violations.push('合図の前に仕掛けた'), '命令違反：合図の前に仕掛けた');
      orderSpeech(rt, '槍をそろえるまで待て！');
    }
  },
  onSquadCommand(rt, id) {
    if (!rt.flags.signal && !rt.flags.early && (id === 'attack' || id === 'focus')) {
      rt.flags.early = true; rt.award((t) => t.violations.push('合図の前に突撃を命じた'), '命令違反：合図の前に突撃を命じた');
      orderSpeech(rt, 'まだじゃ！　組をそろえよ！');
    }
  },
};

// 遊び手の代わりに動かす時も、同じ段と札に従う。
moribe.botOrders = true;   // 渡河・持ち場・反撃の待ちを、性格の突進で上書きしない。
moribe.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE'); inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
  if (!u.alive || F.ending) return;
  const sq = b.squadGroups[0];
  const gathering = !F.signal || F.stage === 'assemble';
  const liningUp = !F.signal && F.pointInside && F.pointReady;
  const gatherOrder = liningUp ? 'hold' : 'follow';
  const calling = F.gatherUnit && !F.gatherCalled && Math.hypot(F.gatherUnit.pos.x - u.pos.x, F.gatherUnit.pos.z - u.pos.z) < 10;
  if (sq && gathering && !sq.pending && (sq.order !== gatherOrder || calling) && !(b.botCmdT > b.t)) {
    inp.e.add(liningUp ? 'KeyX' : 'KeyZ'); b.botCmdT = b.t + 5;
    if (calling) F.gatherCalled = true;
  }
  // 構えは正面だけに効く。最寄りの兵より、実際に打ち込む相手を先に受ける。
  let attacker = null, attackDist = 10;
  if (b.army.threats) for (const o of b.army.threats) {
    if (!o.alive || o.fleeing || o.team === u.team || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d < attackDist) { attacker = o; attackDist = d; }
  }
  // 戦場で実際に落馬した馬だけを拾う。開戦時の空馬は置かない。
  if ((!gathering || (F.pointDone && !F.signal)) && !attacker && !p.mounted && p.mountT <= 0 && !b.army.nearestEnemy(u, 8)) {
    let horse = p.catching?.o || null, hd = gathering ? 6 : 12;
    if (!horse) for (const o of b.army.looseHorses || []) {
      if (!o.from || !o.h.parent || o.mode === 'fled') continue;
      if (gathering && Math.hypot(o.h.position.x - POINT2.x, o.h.position.z - POINT2.z) >= 8) continue;
      const d = Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z);
      if (d < hd) { hd = d; horse = o; }
    }
    if (horse) {
      if (p.lock) inp.e.add('KeyQ');
      inp.runHeld = false;
      if (p.catching) {
        inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      } else if (hd < 3) inp.e.add('KeyR');
      else goTo(p, inp, horse.h.position.x, horse.h.position.z, 2.5);
      return;
    }
  }
  // 岸の印は水際にある。五歩手前の川の中で止まらず、水から上がるまで歩く。
  if (gathering && !attacker) { const q = F.stage === 'assemble' ? (F.gatherUnit?.pos || F.asm || ASSEMBLY2) : POINT2; goTo(p, inp, q.x, q.z, F.stage === 'assemble' ? 5 : 1.2); return; }
  if (F.breathUntil > b.t) {
    if (p.lock) inp.e.add('KeyQ');
    goTo(p, inp, RETREAT2.x, RETREAT2.z, 5);
    if (sq && sq.order !== 'follow' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 5; }
    return;
  }
  // 退ける間が終わった後の手当ては共通の頭に任せる。自然回復はないので、
  // 体力が四分の三へ戻るまで待つと、畦で背を向けたまま戦えなくなる。
  // 押し合いの持ち場にいる敵へ寄る。十四歩の外で戦う敵を見落として、畦で待ち続けない。
  // 構えを解いて突くまで、届く相手を保つ。近い兵が入れ替わるたびに
  // 半秒の反撃待ちを消すと、敵が大勢いても一度も突けない。
  const previous = p.botStrikeFoe;
  const keep = p.botStrikeUntil > p.time && previous?.alive && !previous.noTarget && !previous.fleeing && !previous.invuln &&
    previous.team !== u.team && Math.abs(previous.pos.y - u.pos.y) < 3 &&
    Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < (p.weapon === 'sword' ? 1.9 : 2.8) &&
    !b.army.wallBetween(u.pos, -1, previous.pos) &&
    (F.stage !== 'contact' || F.vBroken || previous.group === F.V) &&
    (F.stage !== 'hold' || Math.hypot(previous.pos.x - FRONT2.x, previous.pos.z - FRONT2.z) < 38);
  const e = attacker || (keep ? previous : null) || b.army.nearestEnemy(u, F.stage === 'hold' || F.stage === 'press' ? 40 : 14,
    (o) => !o.noTarget && !o.fleeing && !o.invuln && o.type !== 'dummy' &&
      (F.stage !== 'contact' || F.vBroken || o.group === F.V) &&
      Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos) &&
      (F.stage !== 'hold' || Math.hypot(o.pos.x - FRONT2.x, o.pos.z - FRONT2.z) < 38));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    if (attacker) {
      // 他の打ち手がいなければ、長い振りかぶりに先の突きを合わせる。
      // 全ての振りかぶりで反撃待ちを消すと、槍を解く半秒が取れない。
      let opening = !u.mobbed && d < reach;
      if (opening) for (const o of b.army.threats) {
        if (o !== attacker && o.alive && !o.fleeing && o.team !== u.team &&
            Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= o.reach + 0.3 &&
            !b.army.wallBetween(u.pos, -1, o.pos)) { opening = false; break; }
      }
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      patientStrike(p, inp, e, d, opening);
    } else {
      if (!gathering && d > reach * 0.85 && !e.charging) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
      patientStrike(p, inp, e, d);
    }
    // 遠い敵への突撃は、まず「移動」してから攻撃に変わる。
    // 三秒で言い直すと、四秒内の同じ号令を取り消す仕組みに掛かってしまう。
    if (!gathering && sq && sq.order !== 'attack' && sq.order !== 'move' && !(b.botCmdT > b.t)) { inp.e.add('KeyC'); b.botCmdT = b.t + 5; }
    return;
  }
  let q = FRONT2;
  // 隊の平均位置には敵がいないことがある。頭上の印と同じ、任務に残る本人へ詰める。
  // 傷兵や逃げる兵を含む中心で止まり、十四歩の探索外の先手を待ち続けない。
  if (F.stage === 'contact' && !F.vBroken || F.stage === 'press') {
    const foe = moribeNearestFoe(b);
    if (foe) q = foe.pos;
  }
  // 次の敵へ向かう間は組も連れて行く。前の戦場に残った組を迎えに戻る往復を防ぐ。
  if (sq && sq.order !== 'follow' && sq.order !== 'move' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 5; }
  goTo(p, inp, q.x, q.z, F.stage === 'contact' && !F.vBroken || F.stage === 'press' ? 2 : 4);
};
moribe.canSkip = () => '';   // 雨中の布陣から槍の会戦まで、同じ時計で進める。
moribe.rts = true;
moribe.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '斎藤軍', mon: 'saito' } };
// 公記に時刻の指定はない。遊びの昼景を確定した時刻として表示しない。
moribe.date = () => `永禄四年五月十四日　${seasonOf('五月')}・雨（時刻不詳）`;
// 千五百対六千は伝承上の目安。公記の森部の記事自体には総兵数の記載がない。
// 残りの人数（kaito 10/23 稲生 21）。戦う実兵の減り方の割合で、目安の総数を減らす。
//   一人を何十人へ水増しせず、割合だけを使う。数え直しは一秒に一度。入れ物は使い回す。
function remainingForce(rt, a0, b0, aKeep, bKeep, out) {
  const F = rt.flags, c = F.forceCount || (F.forceCount = { at: -9, a: 0, b: 0, a0: 0, b0: 0 });
  if (rt.t - c.at >= 1) {
    c.at = rt.t; let a = 0, b = 0;
    for (const u of rt.army.units) {
      if (u.isPlayer || u.noTarget || u.civ || u.isStruct || u.type === 'dummy' || u.type === 'porter') continue;
      if (!u.alive || u.gone || u.fleeing || u.woundOut) continue;
      if (u.team === rt.player.u.team) a++; else b++;
    }
    c.a = a; c.b = b; c.a0 = Math.max(c.a0, a); c.b0 = Math.max(c.b0, b);
  }
  const ra = c.a0 ? c.a / c.a0 : 1, rb = c.b0 ? c.b / c.b0 : 1;
  out.a = Math.round(a0 * (aKeep + (1 - aKeep) * ra) / 10) * 10; out.a0 = a0;
  out.b = Math.round(b0 * (bKeep + (1 - bKeep) * rb) / 10) * 10; out.b0 = b0;
  return out;
}
const MORIBE_FORCE = { a: 1500, a0: 1500, b: 6000, b0: 6000, aCaption: '約', bCaption: '約' };
moribe.force = (rt) => rt?.army && rt.player?.u ? remainingForce(rt, 1500, 6000, .8, .5, MORIBE_FORCE) : MORIBE_FORCE;
moribe.history = '信長公記の森部の記事は、五月十四日の雨、墨俣から長井甲斐守・日比野下野守が出たこと、信長が楡俣川を越え、長く槍を合わせたことを記す。両将を含む百七十余人が討たれた。前田利家が足立六兵衛を討ったとも記す。永禄四年とするのが通説だが、この記事そのものには年の記載がない。織田約千五百、斎藤約六千は伝承上の目安。川の位置や細かな布陣には諸説があり、浅瀬・畦の持ち場・控えの押し出す順は復元である。武将の呼び声と、組の働きで早まる反撃は遊びのための復元である。三手の細かな配分・将の持ち場・昼の明るさは確定できない。数刻の戦いを短い時間に縮め、見える兵も総勢全員を描くものではない。主人公は上役の下知で自分の槍組を動かす。組の任務失敗は史実の織田軍の敗北を意味しない。';
export { moribe };
